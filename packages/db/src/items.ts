import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

// Custom application table — kept in its own file so `bunx better-auth generate`
// (which overwrites schema.ts) doesn't clobber it.
export const item = pgTable("item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
