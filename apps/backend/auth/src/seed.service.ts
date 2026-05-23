import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { eq } from "drizzle-orm";
import { DRIZZLE_DB, type Db, user } from "@repo/db";

const ROLE_ADMIN = "admin";
const DEFAULT_EMAIL = "admin@cam-travel.local";
const DEFAULT_PASSWORD = "ChangeMe!2026";

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Db,
    private readonly authService: AuthService,
  ) {}

  async onApplicationBootstrap() {
    const email = process.env.ADMIN_EMAIL ?? DEFAULT_EMAIL;
    const password = process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
    const name = process.env.ADMIN_NAME ?? "Admin";

    if (password.length < 8) {
      this.logger.warn(
        "Skipping admin seed: ADMIN_PASSWORD must be at least 8 characters",
      );
      return;
    }

    try {
      const existing = await this.db.query.user.findFirst({
        where: eq(user.email, email),
      });

      if (existing) {
        if (existing.role === ROLE_ADMIN) {
          this.logger.log(`Admin user already exists: ${email}`);
          return;
        }
        await this.db
          .update(user)
          .set({ role: ROLE_ADMIN, emailVerified: true })
          .where(eq(user.id, existing.id));
        this.logger.log(`Promoted existing user to admin: ${email}`);
        return;
      }

      await this.authService.instance.api.signUpEmail({
        body: { email, password, name },
      });

      const created = await this.db.query.user.findFirst({
        where: eq(user.email, email),
      });
      if (!created) {
        throw new Error(`Admin user not found after signup: ${email}`);
      }

      await this.db
        .update(user)
        .set({ role: ROLE_ADMIN, emailVerified: true })
        .where(eq(user.id, created.id));

      this.logger.log(`Created admin user: ${email} (role=${ROLE_ADMIN})`);

      if (password === DEFAULT_PASSWORD || email === DEFAULT_EMAIL) {
        this.logger.warn(
          "Using default admin credentials. Set ADMIN_EMAIL / ADMIN_PASSWORD before going to production.",
        );
      }
    } catch (err) {
      // Don't crash boot — log and let the app come up so the rest of the
      // API stays available even if the seed step temporarily fails (e.g.
      // DB connection still warming up, transient auth-plugin error).
      this.logger.error(
        "Admin seed failed:",
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
    }
  }
}
