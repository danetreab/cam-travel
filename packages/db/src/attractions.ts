import {
  pgTable,
  text,
  real,
  integer,
  smallint,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

// Curated travel attractions. PostGIS-backed: a `location geometry(Point, 4326)`
// generated column is added by the matching SQL migration so spatial queries
// (ST_DWithin, bbox) work against `location` while the GraphQL surface stays
// scalar (latitude/longitude).
export const attraction = pgTable("attraction", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  province: text("province"),
  activityType: text("activity_type"),
  durationMinutes: integer("duration_minutes"),
  difficulty: smallint("difficulty"),
  googlePlaceId: text("google_place_id"),
  cachedRating: real("cached_rating"),
  cachedUserRatingsTotal: integer("cached_user_ratings_total"),
  cachedPhotos: jsonb("cached_photos"),
  placesRefreshedAt: timestamp("places_refreshed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
