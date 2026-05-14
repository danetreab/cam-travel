CREATE TABLE "saved_attraction" (
	"user_id" text NOT NULL,
	"attraction_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_attraction_user_id_attraction_id_pk" PRIMARY KEY("user_id","attraction_id")
);
--> statement-breakpoint
ALTER TABLE "saved_attraction" ADD CONSTRAINT "saved_attraction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_attraction" ADD CONSTRAINT "saved_attraction_attraction_id_attraction_id_fk" FOREIGN KEY ("attraction_id") REFERENCES "public"."attraction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_attraction_userId_idx" ON "saved_attraction" USING btree ("user_id");