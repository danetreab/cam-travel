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

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // Allow Apollo Studio / Playground introspection without a session so the
    // schema explorer is usable in dev.
    const query = (req.body as { query?: string } | undefined)?.query;
    if (query && (query.includes("IntrospectionQuery") || introspectionPattern.test(query))) {
      return true;
    }

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
      throw new ServiceUnavailableException(`session lookup failed: ${message}`);
    }

    if (!session?.session) {
      throw new UnauthorizedException("No active session");
    }

    // Make the validated identity available to the controller, so it can be
    // forwarded to graphql via the Redis message payload.
    (req as Request & { user?: unknown; session?: unknown }).user = session.user;
    (req as Request & { user?: unknown; session?: unknown }).session = session.session;
    return true;
  }
}
