import { pgTable, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { user } from "./schema";
import { attraction } from "./attractions";

// Join table — one row per (user, attraction) save. Composite PK enforces
// idempotent saves and lets unsave use ON CONFLICT-friendly upserts/deletes.
export const savedAttraction = pgTable(
  "saved_attraction",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attractionId: text("attraction_id")
      .notNull()
      .references(() => attraction.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.attractionId] }),
    index("saved_attraction_userId_idx").on(table.userId),
  ],
);
