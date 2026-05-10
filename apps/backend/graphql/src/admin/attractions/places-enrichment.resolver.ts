import { Inject } from "@nestjs/common";
import { Parent, ResolveField, Resolver } from "@nestjs/graphql";
import { eq } from "drizzle-orm";
import { DRIZZLE_DB, type Db, attraction } from "@repo/db";
import { AttractionDto } from "./dto/attraction.dto";
import { AttractionPhotoDto } from "./dto/attraction-photo.dto";
import { PlacesService, type PlacePhoto } from "./places.service";

const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

// Adds a `photos` field that returns Google-Places-cached photos as proxy URLs.
// Triggers a fire-and-forget background refresh when the cached data is stale.
@Resolver(() => AttractionDto)
export class PlacesEnrichmentResolver {
  constructor(
    private readonly places: PlacesService,
    @Inject(DRIZZLE_DB) private readonly db: Db,
  ) {}

  @ResolveField("photos", () => [AttractionPhotoDto])
  async photos(@Parent() parent: AttractionDto): Promise<AttractionPhotoDto[]> {
    const row = await this.db.query.attraction.findFirst({
      where: eq(attraction.id, parent.id),
      columns: { cachedPhotos: true, placesRefreshedAt: true, googlePlaceId: true },
    });
    if (!row) return [];

    const stale =
      !row.placesRefreshedAt ||
      Date.now() - row.placesRefreshedAt.getTime() > REFRESH_TTL_MS;
    if (stale && row.googlePlaceId) {
      void this.places.refresh(parent.id, row.googlePlaceId);
    }

    const photos = (row.cachedPhotos ?? []) as PlacePhoto[];
    return photos.map((p) => ({
      name: p.name,
      url: this.places.photoProxyUrl(parent.id, p.name),
      widthPx: p.widthPx,
      heightPx: p.heightPx,
    }));
  }
}
