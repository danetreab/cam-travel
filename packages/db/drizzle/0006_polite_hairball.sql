CREATE TABLE "ai_travel_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"intent" text NOT NULL,
	"destination" text,
	"original_prompt" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"metadata" jsonb,
	"response" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_travel_plan_place" (
	"plan_id" text NOT NULL,
	"google_place_id" text NOT NULL,
	"user_id" text NOT NULL,
	"attraction_id" text,
	"name" text NOT NULL,
	"address" text,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"category" text,
	"reason" text,
	"position" integer,
	"saved" boolean DEFAULT false NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"raw_place" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_travel_plan_place_plan_id_google_place_id_pk" PRIMARY KEY("plan_id","google_place_id")
);
--> statement-breakpoint
ALTER TABLE "ai_travel_plan" ADD CONSTRAINT "ai_travel_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_travel_plan_place" ADD CONSTRAINT "ai_travel_plan_place_plan_id_ai_travel_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ai_travel_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_travel_plan_place" ADD CONSTRAINT "ai_travel_plan_place_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_travel_plan_place" ADD CONSTRAINT "ai_travel_plan_place_attraction_id_attraction_id_fk" FOREIGN KEY ("attraction_id") REFERENCES "public"."attraction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_travel_plan_user_id_idx" ON "ai_travel_plan" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_travel_plan_created_at_idx" ON "ai_travel_plan" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_travel_plan_place_user_id_idx" ON "ai_travel_plan_place" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_travel_plan_place_attraction_id_idx" ON "ai_travel_plan_place" USING btree ("attraction_id");