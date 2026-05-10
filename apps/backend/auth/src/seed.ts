import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createDb, user, account } from "@repo/db";

const ADMIN_EMAIL = "admin@cam-travel.local";
const ADMIN_PASSWORD = "password123";
const ADMIN_NAME = "Admin";

async function main() {
  const { pool, db } = createDb(process.env.DATABASE_URL!);

  const existing = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
    .limit(1);

  const existingUser = existing[0];
  if (existingUser) {
    if (existingUser.role !== "admin") {
      await db
        .update(user)
        .set({ role: "admin" })
        .where(eq(user.id, existingUser.id));
      console.log(`promoted existing ${ADMIN_EMAIL} to admin`);
    } else {
      console.log(`${ADMIN_EMAIL} already exists as admin — skipping`);
    }
  } else {
    const userId = randomUUID();
    const passwordHash = await hashPassword(ADMIN_PASSWORD);

    await db.insert(user).values({
      id: userId,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: "admin",
    });

    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    console.log(`created ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD})`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
