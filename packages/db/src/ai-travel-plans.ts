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

export const aiTravelSession = pgTable(
  "ai_travel_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activePlanId: text("active_plan_id").references(() => aiTravelPlan.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    destination: text("destination"),
    language: text("language").default("en").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_travel_session_user_id_idx").on(table.userId),
    index("ai_travel_session_updated_at_idx").on(table.updatedAt),
    index("ai_travel_session_active_plan_id_idx").on(table.activePlanId),
  ],
);

export const aiTravelChatMessage = pgTable(
  "ai_travel_chat_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id")
      .notNull()
      .references(() => aiTravelSession.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => aiTravelPlan.id, {
      onDelete: "set null",
    }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    error: boolean("error").default(false).notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("ai_travel_chat_message_session_id_idx").on(table.sessionId),
    index("ai_travel_chat_message_user_id_idx").on(table.userId),
    index("ai_travel_chat_message_plan_id_idx").on(table.planId),
    index("ai_travel_chat_message_position_idx").on(
      table.sessionId,
      table.position,
    ),
  ],
);
