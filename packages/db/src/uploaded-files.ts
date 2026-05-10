import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./schema";

// Polymorphic file table — any entity (item, post, …) can attach files via
// (entityType, entityId). Kept in its own file so `bunx better-auth generate`
// (which overwrites schema.ts) doesn't clobber it.
export const uploadedFile = pgTable(
  "uploaded_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filename: varchar("filename", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimetype: varchar("mimetype", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    hasThumbnail: boolean("has_thumbnail").notNull().default(false),

    // Polymorphic — can reference items, posts, etc. Stored as text so the
    // owning table's id type (text in @repo/db) doesn't have to match uuid.
    entityType: varchar("entity_type", { length: 100 }),
    entityId: text("entity_id"),
    relatedType: varchar("related_type", { length: 100 }),
    relatedId: text("related_id"),

    uploadedById: text("uploaded_by_id").references(() => user.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("uploaded_file_entity_idx").on(table.entityType, table.entityId),
    index("uploaded_file_related_idx").on(table.relatedType, table.relatedId),
    index("uploaded_file_uploaded_by_idx").on(table.uploadedById),
  ],
);

export type UploadedFile = typeof uploadedFile.$inferSelect;
export type NewUploadedFile = typeof uploadedFile.$inferInsert;
