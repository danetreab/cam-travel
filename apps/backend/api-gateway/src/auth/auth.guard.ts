import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth } from "./auth";

const introspectionPattern = /__schema|__type\b/;

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

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

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
