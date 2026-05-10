import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE_DB, type Db, attraction } from "@repo/db";

export interface PlacePhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
}

export interface PlaceDetails {
  rating?: number;
  userRatingCount?: number;
  photos?: PlacePhoto[];
  displayName?: { text?: string };
  formattedAddress?: string;
}

const PLACES_API = "https://places.googleapis.com/v1";
const FIELD_MASK = "rating,userRatingCount,photos,displayName,formattedAddress";

// Stale-while-revalidate Google Places enrichment for attractions. Cached
// photos/ratings live on the attraction row; refreshes are deduped via
// `inflight` so concurrent stale reads only fire one upstream request.
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly inflight = new Set<string>();

  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  private get apiKey(): string | undefined {
    return process.env.GOOGLE_PLACES_API_KEY;
  }

  private get publicApiUrl(): string {
    return process.env.PUBLIC_API_URL ?? "http://localhost:3000";
  }

  photoProxyUrl(attractionId: string, photoName: string): string {
    return `${this.publicApiUrl}/api/v1/attractions/${attractionId}/photos?name=${encodeURIComponent(photoName)}`;
  }

  async fetchPlace(placeId: string): Promise<PlaceDetails | null> {
    if (!this.apiKey) {
      this.logger.warn("GOOGLE_PLACES_API_KEY not set; skipping Places fetch");
      return null;
    }
    const res = await fetch(`${PLACES_API}/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
    });
    if (!res.ok) {
      this.logger.warn(`Places fetch ${placeId} failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as PlaceDetails;
  }

  // Resolves a Places photo `name` to the actual googleusercontent URL by
  // calling the media endpoint with skipHttpRedirect=true. Returns the URL
  // string the caller can 302 to. The API key never leaves this process.
  async resolvePhotoUri(
    photoName: string,
    maxHeightPx = 800,
  ): Promise<string | null> {
    if (!this.apiKey) return null;
    const url = `${PLACES_API}/${photoName}/media?skipHttpRedirect=true&maxHeightPx=${maxHeightPx}&key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`Photo media ${photoName} failed: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { photoUri?: string };
    return body.photoUri ?? null;
  }

  async refresh(attractionId: string, placeId: string): Promise<void> {
    if (this.inflight.has(attractionId)) return;
    this.inflight.add(attractionId);
    try {
      const place = await this.fetchPlace(placeId);
      if (!place) return;
      await this.db
        .update(attraction)
        .set({
          cachedRating: place.rating ?? null,
          cachedUserRatingsTotal: place.userRatingCount ?? null,
          cachedPhotos: place.photos ?? [],
          placesRefreshedAt: new Date(),
        })
        .where(eq(attraction.id, attractionId));
    } finally {
      this.inflight.delete(attractionId);
    }
  }
}
