CREATE TABLE "uploaded_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" varchar(255) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mimetype" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"has_thumbnail" boolean DEFAULT false NOT NULL,
	"entity_type" varchar(100),
	"entity_id" text,
	"related_type" varchar(100),
	"related_id" text,
	"uploaded_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploaded_file" ADD CONSTRAINT "uploaded_file_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploaded_file_entity_idx" ON "uploaded_file" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "uploaded_file_related_idx" ON "uploaded_file" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "uploaded_file_uploaded_by_idx" ON "uploaded_file" USING btree ("uploaded_by_id");