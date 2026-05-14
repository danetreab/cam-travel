import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql, desc } from "drizzle-orm";
import { DRIZZLE_DB, type Db, attraction, savedAttraction } from "@repo/db";
import type { AttractionDto } from "../attractions/dto/attraction.dto";

@Injectable()
export class SavedAttractionsService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  // Idempotent: a second save by the same user for the same attraction is a
  // no-op so the API stays safe to call from optimistic UI without 409 noise.
  async save(userId: string, attractionId: string): Promise<AttractionDto> {
    await this.db
      .insert(savedAttraction)
      .values({ userId, attractionId })
      .onConflictDoNothing({
        target: [savedAttraction.userId, savedAttraction.attractionId],
      });

    const rows = await this.db
      .select()
      .from(attraction)
      .where(eq(attraction.id, attractionId))
      .limit(1);
    if (!rows[0]) {
      throw new Error(`Attraction not found: ${attractionId}`);
    }
    return rows[0] as unknown as AttractionDto;
  }

  async unsave(userId: string, attractionId: string): Promise<string> {
    await this.db
      .delete(savedAttraction)
      .where(
        and(
          eq(savedAttraction.userId, userId),
          eq(savedAttraction.attractionId, attractionId),
        ),
      );
    return attractionId;
  }

  async listForUser(userId: string): Promise<AttractionDto[]> {
    // Inner join keeps deletes consistent — if an attraction was removed,
    // its saved rows cascade away too, so a plain INNER JOIN is enough.
    const rows = await this.db
      .select({ attraction })
      .from(savedAttraction)
      .innerJoin(attraction, eq(savedAttraction.attractionId, attraction.id))
      .where(eq(savedAttraction.userId, userId))
      .orderBy(desc(savedAttraction.createdAt));
    return rows.map((r) => r.attraction as unknown as AttractionDto);
  }

  async idsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: savedAttraction.attractionId })
      .from(savedAttraction)
      .where(eq(savedAttraction.userId, userId));
    return rows.map((r) => r.id);
  }

  async countForUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(savedAttraction)
      .where(eq(savedAttraction.userId, userId));
    return rows[0]?.count ?? 0;
  }
}
