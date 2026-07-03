CREATE TABLE "ai_travel_chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"error" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_travel_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"active_plan_id" text,
	"title" text NOT NULL,
	"destination" text,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_travel_chat_message" ADD CONSTRAINT "ai_travel_chat_message_session_id_ai_travel_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_travel_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_travel_chat_message" ADD CONSTRAINT "ai_travel_chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_travel_chat_message" ADD CONSTRAINT "ai_travel_chat_message_plan_id_ai_travel_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ai_travel_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_travel_session" ADD CONSTRAINT "ai_travel_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_travel_session" ADD CONSTRAINT "ai_travel_session_active_plan_id_ai_travel_plan_id_fk" FOREIGN KEY ("active_plan_id") REFERENCES "public"."ai_travel_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_travel_chat_message_session_id_idx" ON "ai_travel_chat_message" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ai_travel_chat_message_user_id_idx" ON "ai_travel_chat_message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_travel_chat_message_plan_id_idx" ON "ai_travel_chat_message" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "ai_travel_chat_message_position_idx" ON "ai_travel_chat_message" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "ai_travel_session_user_id_idx" ON "ai_travel_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_travel_session_updated_at_idx" ON "ai_travel_session" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "ai_travel_session_active_plan_id_idx" ON "ai_travel_session" USING btree ("active_plan_id");