import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  DRIZZLE_DB,
  type Db,
  aiTravelPlan,
  aiTravelPlanPlace,
  attraction,
} from "@repo/db";
import {
  FOLLOW_UP_ACTIONS,
  TRIP_INTENTS,
  type AiTravelItineraryDay,
  type AiTravelPlace,
  type AiTravelPlacePatch,
  type AiTravelRequest,
  type AiTravelResponse,
  type FollowUpAction,
  type TripIntent,
} from "./ai-travel.types";
import { ConfigService } from "@nestjs/config";

type ExistingPlan = typeof aiTravelPlan.$inferSelect;
type ExistingPlanPlace = typeof aiTravelPlanPlace.$inferSelect;

interface PlacePhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  photos?: PlacePhoto[];
  types?: string[];
  googleMapsUri?: string;
}

interface CandidatePlace {
  googlePlaceId: string;
  attractionId: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  types: string[];
  photoName: string | null;
  photoUrl: string | null;
  rawPlace: GooglePlace | null;
}

const PLACES_API = "https://places.googleapis.com/v1";
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
  "places.types",
  "places.googleMapsUri",
].join(",");

const IntentClassificationSchema = z.object({
  intent: z.enum(TRIP_INTENTS),
  destination: z.string().nullable(),
  category: z.string().nullable(),
  days: z.number().int().min(1).max(14).nullable(),
  budget: z.string().nullable(),
  transport: z.string().nullable(),
  anchorPlace: z.string().nullable(),
  filters: z.array(z.string()),
  missingInfo: z.array(z.string()),
  searchQuery: z.string(),
});

type IntentClassification = z.infer<typeof IntentClassificationSchema>;

const AiPlacePickSchema = z.object({
  googlePlaceId: z.string(),
  reason: z.string(),
  suggestedDurationMinutes: z.number().int().min(15).max(720).nullable(),
});

const AiTravelDraftSchema = z.object({
  title: z.string(),
  groups: z.array(
    z.object({
      category: z.string(),
      places: z.array(AiPlacePickSchema),
    }),
  ),
  itinerary: z
    .object({
      days: z.array(
        z.object({
          day: z.number().int().min(1).max(14),
          title: z.string(),
          places: z.array(
            z.object({
              googlePlaceId: z.string(),
              startTime: z.string().nullable(),
              notes: z.string().nullable(),
            }),
          ),
        }),
      ),
    })
    .nullable(),
  followUpActions: z.array(z.enum(FOLLOW_UP_ACTIONS)),
});

type AiTravelDraft = z.infer<typeof AiTravelDraftSchema>;

const DEFAULT_FOLLOW_UPS: FollowUpAction[] = [
  "CREATE_ITINERARY",
  "SHOW_MAP",
  "FILTER_BY_BUDGET",
  "FIND_NEARBY_FOOD",
];

@Injectable()
export class AiTravelService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async travel(
    userId: string,
    request: AiTravelRequest,
  ): Promise<AiTravelResponse> {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("message is required");
    if (message.length > 2000) {
      throw new BadRequestException("message must be 2000 characters or fewer");
    }

    const existingPlan = request.planId
      ? await this.requirePlan(userId, request.planId)
      : null;
    const existingPlaces = existingPlan
      ? await this.listPlanPlaces(existingPlan.id)
      : [];
    const classification = await this.classify(message, request, existingPlan);
    const planId = existingPlan?.id ?? crypto.randomUUID();
    const language = request.language?.trim() || existingPlan?.language || "en";

    let candidates =
      existingPlan && this.shouldReusePlanPlaces(classification.intent)
        ? this.candidatesFromPlanPlaces(existingPlaces)
        : [];
    if (candidates.length === 0) {
      candidates = await this.searchPlaces(classification, request, language);
    }
    if (candidates.length === 0) {
      throw new NotFoundException("No real Google Places results found");
    }

    const draft = await this.generateDraft(
      message,
      classification,
      candidates,
      existingPlan,
    );
    const placeStates = new Map(
      existingPlaces.map((p) => [
        p.googlePlaceId,
        { saved: p.saved, removed: p.removed },
      ]),
    );
    const response = this.buildResponse(
      planId,
      classification,
      candidates,
      draft,
      placeStates,
    );

    await this.savePlan({
      userId,
      planId,
      existingPlan,
      language,
      originalPrompt: message,
      classification,
      response,
    });
    await this.savePlanPlaces(userId, planId, response.places, candidates);

    return response;
  }

  async getPlan(userId: string, planId: string): Promise<AiTravelResponse> {
    const plan = await this.requirePlan(userId, planId);
    const places = await this.listPlanPlaces(plan.id);
    return this.mergePlaceState(plan.response as AiTravelResponse, places);
  }

  async patchPlace(
    userId: string,
    planId: string,
    googlePlaceId: string,
    patch: AiTravelPlacePatch,
  ): Promise<AiTravelResponse> {
    if (patch.saved == null && patch.removed == null) {
      throw new BadRequestException("saved or removed is required");
    }
    await this.requirePlan(userId, planId);
    const rows = await this.db
      .select()
      .from(aiTravelPlanPlace)
      .where(
        and(
          eq(aiTravelPlanPlace.planId, planId),
          eq(aiTravelPlanPlace.googlePlaceId, googlePlaceId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException("Plan place not found");

    const nextSaved = patch.saved ?? rows[0].saved;
    const nextRemoved = patch.removed ?? rows[0].removed;
    await this.db
      .update(aiTravelPlanPlace)
      .set({
        saved: nextRemoved ? false : nextSaved,
        removed: nextSaved ? false : nextRemoved,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiTravelPlanPlace.planId, planId),
          eq(aiTravelPlanPlace.googlePlaceId, googlePlaceId),
        ),
      );
    return this.getPlan(userId, planId);
  }

  private get geminiModel(): string {
    return process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  private get publicApiUrl(): string {
    return process.env.PUBLIC_API_URL ?? "http://localhost:3000";
  }

  private requireGeminiKey(): void {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new ServiceUnavailableException(
        "GOOGLE_GENERATIVE_AI_API_KEY is not configured",
      );
    }
  }

  private requirePlacesKey(): string {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) {
      throw new ServiceUnavailableException(
        "GOOGLE_PLACES_API_KEY is not configured",
      );
    }
    return key;
  }

  private async classify(
    message: string,
    request: AiTravelRequest,
    existingPlan: ExistingPlan | null,
  ): Promise<IntentClassification> {
    this.requireGeminiKey();
    const previous = existingPlan
      ? `Existing plan: ${JSON.stringify({
          title: existingPlan.title,
          intent: existingPlan.intent,
          destination: existingPlan.destination,
        })}`
      : "No existing plan.";

    try {
      const { output } = await generateText({
        model: google(this.geminiModel),
        output: Output.object({ schema: IntentClassificationSchema }),
        temperature: 0,
        system:
          "You classify travel planning prompts. Extract only facts stated or clearly implied. Return structured data only.",
        prompt: [
          previous,
          request.userLocation
            ? `User location: ${request.userLocation.lat}, ${request.userLocation.lng}`
            : "User location: unknown",
          `Language: ${request.language ?? "en"}`,
          `User prompt: ${message}`,
          "If the prompt is a follow-up and destination is omitted, reuse the existing plan destination.",
          "searchQuery must be a Google Places text search query for real places.",
        ].join("\n"),
      });
      return {
        ...output,
        destination: output.destination || existingPlan?.destination || null,
        searchQuery:
          output.searchQuery ||
          this.defaultSearchQuery(output.intent, output.destination, message),
      };
    } catch (error) {
      throw new BadGatewayException(
        `Gemini intent classification failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async generateDraft(
    message: string,
    classification: IntentClassification,
    candidates: CandidatePlace[],
    existingPlan: ExistingPlan | null,
  ): Promise<AiTravelDraft> {
    this.requireGeminiKey();
    const candidatePayload = candidates.map((place) => ({
      googlePlaceId: place.googlePlaceId,
      name: place.name,
      address: place.address,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      types: place.types,
    }));

    try {
      const { output } = await generateText({
        model: google(this.geminiModel),
        output: Output.object({ schema: AiTravelDraftSchema }),
        temperature: 0.2,
        system: [
          "You are a travel recommendation assistant.",
          "Use only the places provided from Google Places API.",
          "Do not invent place names or place IDs.",
          "Group recommendations by useful travel categories.",
          "Explain why each place is worth visiting.",
          "Return structured data only.",
        ].join(" "),
        prompt: [
          `User prompt: ${message}`,
          `Intent: ${classification.intent}`,
          `Destination: ${classification.destination ?? "unknown"}`,
          `Days: ${classification.days ?? "unknown"}`,
          `Budget: ${classification.budget ?? "unknown"}`,
          `Transport: ${classification.transport ?? "unknown"}`,
          existingPlan ? `Existing plan title: ${existingPlan.title}` : "",
          `Google Places candidates JSON: ${JSON.stringify(candidatePayload)}`,
        ].join("\n"),
      });
      return output;
    } catch (error) {
      throw new BadGatewayException(
        `Gemini recommendation failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async searchPlaces(
    classification: IntentClassification,
    request: AiTravelRequest,
    language: string,
  ): Promise<CandidatePlace[]> {
    const key = this.requirePlacesKey();
    const textQuery =
      classification.searchQuery ||
      this.defaultSearchQuery(
        classification.intent,
        classification.destination,
        request.message,
      );
    const body: Record<string, unknown> = {
      textQuery,
      pageSize: 15,
      languageCode: language.startsWith("km") ? "km" : "en",
    };
    if (request.userLocation) {
      body.locationBias = {
        circle: {
          center: {
            latitude: request.userLocation.lat,
            longitude: request.userLocation.lng,
          },
          radius: 25000,
        },
      };
    }

    const res = await fetch(`${PLACES_API}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new BadGatewayException(
        `Google Places Text Search failed: ${res.status}`,
      );
    }
    const json = (await res.json()) as { places?: GooglePlace[] };
    return this.normalizePlaces(json.places ?? []);
  }

  private async normalizePlaces(
    places: GooglePlace[],
  ): Promise<CandidatePlace[]> {
    const candidates = places
      .filter(
        (p) =>
          p.id &&
          p.displayName?.text &&
          typeof p.location?.latitude === "number" &&
          typeof p.location?.longitude === "number",
      )
      .map((p) => {
        const photoName = p.photos?.[0]?.name ?? null;
        return {
          googlePlaceId: p.id,
          attractionId: null,
          name: p.displayName?.text ?? p.id,
          address: p.formattedAddress ?? null,
          latitude: p.location?.latitude ?? 0,
          longitude: p.location?.longitude ?? 0,
          rating: p.rating ?? null,
          userRatingCount: p.userRatingCount ?? null,
          googleMapsUri: p.googleMapsUri ?? null,
          types: p.types ?? [],
          photoName,
          photoUrl: photoName
            ? `${this.publicApiUrl}/api/v1/attractions/ai/photos?name=${encodeURIComponent(
                photoName,
              )}`
            : null,
          rawPlace: p,
        } satisfies CandidatePlace;
      });

    const ids = candidates.map((p) => p.googlePlaceId);
    if (ids.length === 0) return [];

    const matches = await this.db
      .select({
        id: attraction.id,
        googlePlaceId: attraction.googlePlaceId,
      })
      .from(attraction)
      .where(inArray(attraction.googlePlaceId, ids));
    const matchMap = new Map(matches.map((m) => [m.googlePlaceId, m.id]));
    return candidates.map((p) => ({
      ...p,
      attractionId: matchMap.get(p.googlePlaceId) ?? null,
    }));
  }

  private buildResponse(
    planId: string,
    classification: IntentClassification,
    candidates: CandidatePlace[],
    draft: AiTravelDraft,
    states: Map<string, { saved: boolean; removed: boolean }>,
  ): AiTravelResponse {
    const candidateMap = new Map(candidates.map((p) => [p.googlePlaceId, p]));
    const seen = new Set<string>();
    let order = 1;

    const groups = draft.groups
      .map((group) => ({
        category: group.category || "Recommended",
        places: group.places
          .map((pick) => {
            const candidate = candidateMap.get(pick.googlePlaceId);
            if (!candidate || seen.has(candidate.googlePlaceId)) return null;
            seen.add(candidate.googlePlaceId);
            const state = states.get(candidate.googlePlaceId);
            return this.toResponsePlace(candidate, {
              category: group.category || this.inferCategory(candidate),
              reason: pick.reason,
              order: order++,
              saved: state?.saved ?? false,
              removed: state?.removed ?? false,
            });
          })
          .filter((place): place is AiTravelPlace => !!place && !place.removed),
      }))
      .filter((group) => group.places.length > 0);

    if (groups.length === 0) {
      groups.push({
        category: "Recommended",
        places: candidates.slice(0, 10).map((candidate) => {
          const state = states.get(candidate.googlePlaceId);
          return this.toResponsePlace(candidate, {
            category: this.inferCategory(candidate),
            reason: "A real Google Places result matching your request.",
            order: order++,
            saved: state?.saved ?? false,
            removed: state?.removed ?? false,
          });
        }),
      });
    }

    const places = groups.flatMap((group) => group.places);
    const itinerary = this.sanitizeItinerary(
      draft.itinerary?.days ?? [],
      candidateMap,
    );
    const responseItinerary =
      itinerary.length > 0
        ? { days: itinerary }
        : classification.intent === "CREATE_ITINERARY"
          ? { days: this.fallbackItinerary(places, classification.days ?? 1) }
          : null;

    return {
      planId,
      intent: classification.intent,
      destination: classification.destination,
      title: draft.title || this.defaultTitle(classification),
      groups,
      places,
      itinerary: responseItinerary,
      map: this.buildMap(places),
      followUpActions: this.normalizeFollowUps(draft.followUpActions),
    };
  }

  private sanitizeItinerary(
    days: z.infer<typeof AiTravelDraftSchema>["itinerary"] extends infer T
      ? T extends { days: infer D }
        ? D
        : never
      : never,
    candidateMap: Map<string, CandidatePlace>,
  ): AiTravelItineraryDay[] {
    return (
      days as Array<{
        day: number;
        title: string;
        places: Array<{
          googlePlaceId: string;
          startTime: string | null;
          notes: string | null;
        }>;
      }>
    )
      .map((day) => ({
        day: day.day,
        title: day.title || `Day ${day.day}`,
        places: day.places
          .map((pick, index) => {
            const candidate = candidateMap.get(pick.googlePlaceId);
            if (!candidate) return null;
            return {
              googlePlaceId: candidate.googlePlaceId,
              name: candidate.name,
              order: index + 1,
              startTime: pick.startTime,
              notes: pick.notes,
            };
          })
          .filter(
            (place): place is AiTravelItineraryDay["places"][number] => !!place,
          ),
      }))
      .filter((day) => day.places.length > 0)
      .sort((a, b) => a.day - b.day);
  }

  private fallbackItinerary(
    places: AiTravelPlace[],
    days: number,
  ): AiTravelItineraryDay[] {
    const safeDays = Math.max(1, Math.min(7, days));
    return Array.from({ length: safeDays }, (_, index) => {
      const dayPlaces = places.filter(
        (_, placeIndex) => placeIndex % safeDays === index,
      );
      return {
        day: index + 1,
        title: `Day ${index + 1}`,
        places: dayPlaces.map((place, placeIndex) => ({
          googlePlaceId: place.googlePlaceId,
          name: place.name,
          order: placeIndex + 1,
          startTime: null,
          notes: place.reason,
        })),
      };
    }).filter((day) => day.places.length > 0);
  }

  private toResponsePlace(
    candidate: CandidatePlace,
    options: {
      category: string | null;
      reason: string | null;
      order: number | null;
      saved: boolean;
      removed: boolean;
    },
  ): AiTravelPlace {
    return {
      googlePlaceId: candidate.googlePlaceId,
      attractionId: candidate.attractionId,
      name: candidate.name,
      address: candidate.address,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      rating: candidate.rating,
      userRatingCount: candidate.userRatingCount,
      googleMapsUri: candidate.googleMapsUri,
      types: candidate.types,
      category: options.category,
      reason: options.reason,
      photoName: candidate.photoName,
      photoUrl: candidate.photoUrl,
      order: options.order,
      saved: options.saved,
      removed: options.removed,
    };
  }

  private buildMap(places: AiTravelPlace[]): AiTravelResponse["map"] {
    const pins = places
      .filter((place) => !place.removed)
      .map((place) => ({
        googlePlaceId: place.googlePlaceId,
        name: place.name,
        lat: place.latitude,
        lng: place.longitude,
        order: place.order,
        category: place.category,
        saved: place.saved,
        removed: place.removed,
      }));
    if (pins.length === 0) return { center: null, zoom: 11, pins: [] };
    const center = {
      lat: pins.reduce((sum, pin) => sum + pin.lat, 0) / pins.length,
      lng: pins.reduce((sum, pin) => sum + pin.lng, 0) / pins.length,
    };
    return { center, zoom: pins.length === 1 ? 14 : 12, pins };
  }

  private async savePlan(input: {
    userId: string;
    planId: string;
    existingPlan: ExistingPlan | null;
    language: string;
    originalPrompt: string;
    classification: IntentClassification;
    response: AiTravelResponse;
  }): Promise<void> {
    const values = {
      id: input.planId,
      userId: input.userId,
      title: input.response.title,
      intent: input.response.intent,
      destination: input.response.destination,
      originalPrompt: input.originalPrompt,
      language: input.language,
      metadata: input.classification,
      response: input.response,
      updatedAt: new Date(),
    };

    if (input.existingPlan) {
      await this.db
        .update(aiTravelPlan)
        .set(values)
        .where(
          and(
            eq(aiTravelPlan.id, input.planId),
            eq(aiTravelPlan.userId, input.userId),
          ),
        );
      return;
    }

    await this.db.insert(aiTravelPlan).values(values);
  }

  private async savePlanPlaces(
    userId: string,
    planId: string,
    places: AiTravelPlace[],
    candidates: CandidatePlace[],
  ): Promise<void> {
    const candidateMap = new Map(candidates.map((p) => [p.googlePlaceId, p]));
    for (const place of places) {
      const candidate = candidateMap.get(place.googlePlaceId);
      await this.db
        .insert(aiTravelPlanPlace)
        .values({
          planId,
          userId,
          googlePlaceId: place.googlePlaceId,
          attractionId: place.attractionId,
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          category: place.category,
          reason: place.reason,
          position: place.order,
          saved: place.saved,
          removed: place.removed,
          rawPlace: candidate?.rawPlace ?? place,
        })
        .onConflictDoUpdate({
          target: [aiTravelPlanPlace.planId, aiTravelPlanPlace.googlePlaceId],
          set: {
            attractionId: place.attractionId,
            name: place.name,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
            category: place.category,
            reason: place.reason,
            position: place.order,
            rawPlace: candidate?.rawPlace ?? place,
            updatedAt: new Date(),
          },
        });
    }
  }

  private async requirePlan(
    userId: string,
    planId: string,
  ): Promise<ExistingPlan> {
    const rows = await this.db
      .select()
      .from(aiTravelPlan)
      .where(and(eq(aiTravelPlan.id, planId), eq(aiTravelPlan.userId, userId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundException("AI travel plan not found");
    return rows[0];
  }

  private async listPlanPlaces(planId: string): Promise<ExistingPlanPlace[]> {
    return this.db
      .select()
      .from(aiTravelPlanPlace)
      .where(eq(aiTravelPlanPlace.planId, planId))
      .orderBy(asc(aiTravelPlanPlace.position));
  }

  private mergePlaceState(
    response: AiTravelResponse,
    places: ExistingPlanPlace[],
  ): AiTravelResponse {
    const stateMap = new Map(
      places.map((place) => [
        place.googlePlaceId,
        { saved: place.saved, removed: place.removed },
      ]),
    );
    const apply = (place: AiTravelPlace): AiTravelPlace => {
      const state = stateMap.get(place.googlePlaceId);
      return state ? { ...place, ...state } : place;
    };
    const groups = response.groups
      .map((group) => ({
        ...group,
        places: group.places.map(apply).filter((place) => !place.removed),
      }))
      .filter((group) => group.places.length > 0);
    const responsePlaces = groups.flatMap((group) => group.places);
    return {
      ...response,
      groups,
      places: responsePlaces,
      map: this.buildMap(responsePlaces),
    };
  }

  private candidatesFromPlanPlaces(
    places: ExistingPlanPlace[],
  ): CandidatePlace[] {
    return places
      .filter((place) => !place.removed)
      .map((place) => {
        const rawPlace =
          place.rawPlace && typeof place.rawPlace === "object"
            ? (place.rawPlace as GooglePlace)
            : null;
        return {
          googlePlaceId: place.googlePlaceId,
          attractionId: place.attractionId,
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
          rating:
            rawPlace && typeof rawPlace.rating === "number"
              ? rawPlace.rating
              : null,
          userRatingCount:
            rawPlace && typeof rawPlace.userRatingCount === "number"
              ? rawPlace.userRatingCount
              : null,
          googleMapsUri: rawPlace?.googleMapsUri ?? null,
          types: rawPlace?.types ?? [],
          photoName: rawPlace?.photos?.[0]?.name ?? null,
          photoUrl: rawPlace?.photos?.[0]?.name
            ? `${this.publicApiUrl}/api/v1/attractions/ai/photos?name=${encodeURIComponent(
                rawPlace.photos[0].name,
              )}`
            : null,
          rawPlace,
        };
      });
  }

  private shouldReusePlanPlaces(intent: TripIntent): boolean {
    return [
      "CREATE_ITINERARY",
      "OPTIMIZE_ROUTE",
      "BUDGET_PLAN",
      "REPLACE_PLACE",
      "FILTERED_RECOMMENDATION",
    ].includes(intent);
  }

  private defaultSearchQuery(
    intent: TripIntent,
    destination: string | null,
    message: string,
  ): string {
    const where = destination ? ` in ${destination}` : "";
    if (intent === "FOOD_RECOMMENDATION") return `best local food${where}`;
    if (intent === "FIND_NEARBY") return message;
    if (intent === "TIME_BASED_RECOMMENDATION")
      return `things to do tonight${where}`;
    return `places to visit${where || ` matching ${message}`}`;
  }

  private defaultTitle(classification: IntentClassification): string {
    const destination = classification.destination
      ? ` in ${classification.destination}`
      : "";
    if (classification.intent === "CREATE_ITINERARY") {
      return `${classification.days ?? ""}-day trip plan${destination}`.trim();
    }
    if (classification.intent === "FOOD_RECOMMENDATION") {
      return `Food recommendations${destination}`;
    }
    return `Recommended places${destination}`;
  }

  private inferCategory(place: CandidatePlace): string {
    const types = new Set(place.types);
    if (types.has("restaurant") || types.has("cafe") || types.has("food"))
      return "Food";
    if (types.has("museum") || types.has("art_gallery")) return "Culture";
    if (types.has("night_club") || types.has("bar")) return "Night Activities";
    if (types.has("hindu_temple") || types.has("place_of_worship"))
      return "Temples & History";
    return "Places";
  }

  private normalizeFollowUps(actions: FollowUpAction[]): FollowUpAction[] {
    const valid = actions.filter((action): action is FollowUpAction =>
      (FOLLOW_UP_ACTIONS as readonly string[]).includes(action),
    );
    const list = valid.length > 0 ? valid : DEFAULT_FOLLOW_UPS;
    return [...new Set(list)];
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  requireUserId(user?: { id: string } | null): string {
    if (!user?.id) throw new UnauthorizedException("Sign in required");
    return user.id;
  }
}
