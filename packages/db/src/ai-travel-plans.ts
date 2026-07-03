import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./schema";
import { attraction } from "./attractions";

export const aiTravelPlan = pgTable(
  "ai_travel_plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    intent: text("intent").notNull(),
    destination: text("destination"),
    originalPrompt: text("original_prompt").notNull(),
    language: text("language").default("en").notNull(),
    metadata: jsonb("metadata"),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_travel_plan_user_id_idx").on(table.userId),
    index("ai_travel_plan_created_at_idx").on(table.createdAt),
  ],
);

export const aiTravelPlanPlace = pgTable(
  "ai_travel_plan_place",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => aiTravelPlan.id, { onDelete: "cascade" }),
    googlePlaceId: text("google_place_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attractionId: text("attraction_id").references(() => attraction.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    address: text("address"),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    category: text("category"),
    reason: text("reason"),
    position: integer("position"),
    saved: boolean("saved").default(false).notNull(),
    removed: boolean("removed").default(false).notNull(),
    rawPlace: jsonb("raw_place"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.googlePlaceId] }),
    index("ai_travel_plan_place_user_id_idx").on(table.userId),
    index("ai_travel_plan_place_attraction_id_idx").on(table.attractionId),
  ],
);
