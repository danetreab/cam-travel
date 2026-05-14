import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth } from "./auth";

const introspectionPattern = /__schema|__type\b/;
const SESSION_LOOKUP_TIMEOUT_MS = 5000;

// GraphQL operations that guests are allowed to invoke. Read-only queries
// that power the public explore experience; everything else still requires a
// session. Keep this list tight — anything added here becomes a public API.
const GUEST_ALLOWED_OPERATIONS = new Set<string>([
  "AttractionsList",
  "AttractionsTopPerProvince",
  "AttractionById",
]);

// Extract the operation name from a GraphQL document when the client didn't
// include `operationName` in the request body. Handles the common shapes:
//   query Name(...) { ... }
//   query Name { ... }
//   mutation Name(...) { ... }
const OPERATION_NAME_RE = /\b(?:query|mutation|subscription)\s+(\w+)/;

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const body = req.body as
      | { query?: string; operationName?: string | null }
      | undefined;
    const query = body?.query;

    // Allow Apollo Studio / Playground introspection without a session so the
    // schema explorer is usable in dev.
    if (query && (query.includes("IntrospectionQuery") || introspectionPattern.test(query))) {
      return true;
    }

    const opName =
      body?.operationName ||
      (query ? query.match(OPERATION_NAME_RE)?.[1] : undefined);
    const isGuestAllowed = !!opName && GUEST_ALLOWED_OPERATIONS.has(opName);

    // Hard deadline on getSession. better-auth reads from Redis first; if the
    // client is in offline/reconnecting mode the call can hang past the
    // request-controller timeout and the browser sees a "pending" forever.
    let session: Awaited<ReturnType<typeof auth.api.getSession>>;
    try {
      session = await Promise.race([
        auth.api.getSession({ headers: fromNodeHeaders(req.headers) }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("session lookup timeout")),
            SESSION_LOOKUP_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Guest-allowed reads shouldn't fail just because better-auth/Redis is
      // unreachable — degrade to anonymous instead.
      if (isGuestAllowed) return true;
      throw new ServiceUnavailableException(`session lookup failed: ${message}`);
    }

    if (!session?.session) {
      if (isGuestAllowed) return true;
      throw new UnauthorizedException("No active session");
    }

    // Make the validated identity available to the controller, so it can be
    // forwarded to graphql via the Redis message payload.
    (req as Request & { user?: unknown; session?: unknown }).user = session.user;
    (req as Request & { user?: unknown; session?: unknown }).session = session.session;
    return true;
  }
}
