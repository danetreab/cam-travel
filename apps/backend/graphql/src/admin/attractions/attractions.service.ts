import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import { DRIZZLE_DB, type Db, attraction } from "@repo/db";
import { DrizzleQueryService } from "../../lib/nestjs-query-drizzle";
import type { AttractionDto } from "./dto/attraction.dto";
import type { AttractionsTopPerProvinceInput } from "./dto/top-per-province.input";

const FILTER_ONLY_ACTIVITY_TYPES = ["coffee"];

@Injectable()
export class AttractionsService extends DrizzleQueryService<AttractionDto> {
  constructor(@Inject(DRIZZLE_DB) private readonly drizzle: Db) {
    super(drizzle, attraction, { idColumn: "id", dialect: "pg" });
  }

  // Returns the top-N highest-ranked attractions for *each* province in one
  // round-trip via a window function. Used by the explore map at country/
  // region zoom so all 25 provinces stay represented instead of the result
  // being dominated by a single high-volume city.
  async topPerProvince(
    input: AttractionsTopPerProvinceInput,
  ): Promise<AttractionDto[]> {
    const perProvince = Math.max(1, Math.min(100, input.perProvince ?? 20));

    const conditions: SQL[] = [sql`${attraction.province} IS NOT NULL`];
    if (input.bounds) {
      const { south, west, north, east } = input.bounds;
      conditions.push(
        sql`${attraction.latitude} BETWEEN ${south} AND ${north}`,
      );
      conditions.push(sql`${attraction.longitude} BETWEEN ${west} AND ${east}`);
    }
    if (input.activityType) {
      conditions.push(sql`${attraction.activityType} = ${input.activityType}`);
    } else {
      for (const activityType of FILTER_ONLY_ACTIVITY_TYPES) {
        conditions.push(
          sql`${attraction.activityType} IS DISTINCT FROM ${activityType}`,
        );
      }
    }

    const where = sql.join(conditions, sql` AND `);

    // Rank by user-ratings-total (Google's popularity proxy), then rating.
    // Snake-case here is intentional — these are raw column names projected
    // back into camelCase below for the DTO.
    const result = await this.drizzle.execute(sql`
      SELECT
        id,
        name,
        description,
        latitude,
        longitude,
        province,
        activity_type        AS "activityType",
        duration_minutes     AS "durationMinutes",
        difficulty,
        google_place_id      AS "googlePlaceId",
        cached_rating        AS "cachedRating",
        cached_user_ratings_total AS "cachedUserRatingsTotal",
        places_refreshed_at  AS "placesRefreshedAt",
        created_at           AS "createdAt",
        updated_at           AS "updatedAt"
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY province
            ORDER BY
              cached_user_ratings_total DESC NULLS LAST,
              cached_rating DESC NULLS LAST,
              id ASC
          ) AS rn
        FROM attraction
        WHERE ${where}
      ) ranked
      WHERE rn <= ${perProvince}
      ORDER BY province ASC, rn ASC
    `);

    return result.rows as unknown as AttractionDto[];
  }
}
