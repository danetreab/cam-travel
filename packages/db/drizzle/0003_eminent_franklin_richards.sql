CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "attraction" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"activity_type" text,
	"duration_minutes" integer,
	"difficulty" smallint,
	"google_place_id" text,
	"cached_rating" real,
	"cached_user_ratings_total" integer,
	"cached_photos" jsonb,
	"places_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attraction_difficulty_check" CHECK ("difficulty" IS NULL OR ("difficulty" BETWEEN 1 AND 5))
);
--> statement-breakpoint
ALTER TABLE "attraction"
	ADD COLUMN "location" geometry(Point, 4326)
	GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)) STORED;
--> statement-breakpoint
CREATE INDEX "attraction_location_gist" ON "attraction" USING GIST ("location");
