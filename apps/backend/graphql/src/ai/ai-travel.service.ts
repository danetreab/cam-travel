import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  DRIZZLE_DB,
  type Db,
  aiTravelChatMessage,
  aiTravelPlan,
  aiTravelPlanPlace,
  aiTravelSession,
  attraction,
} from "@repo/db";
import {
  FOLLOW_UP_ACTIONS,
  TRIP_INTENTS,
  type AiTravelChatMessage,
  type AiTravelItineraryDay,
  type AiTravelPlace,
  type AiTravelPlacePatch,
  type AiTravelRequest,
  type AiTravelResponse,
  type AiTravelSessionDetail,
  type AiTravelSessionSummary,
  type AiTravelStreamStatusStep,
  type FollowUpAction,
  type TripIntent,
} from "./ai-travel.types";

type ExistingPlan = typeof aiTravelPlan.$inferSelect;
type ExistingPlanPlace = typeof aiTravelPlanPlace.$inferSelect;
type ExistingSession = typeof aiTravelSession.$inferSelect;

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
  allowed: z.boolean(),
  refusalReason: z.string().nullable(),
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
  responseText: z.string(),
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
const CAMBODIA_SCOPE_ERROR =
  "I can only help with Cambodia travel maps, places, and routes.";
const AI_TRAVEL_QUESTION_LIMIT = 5;
const AI_TRAVEL_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const AI_TRAVEL_RATE_LIMIT_MESSAGE =
  "You can ask up to 5 travel planner questions per hour. Please try again later.";
const CAMBODIA_ALIASES = [
  "cambodia",
  "kampuchea",
  "khmer",
  "កម្ពុជា",
  "ខ្មែរ",
  "phnom penh",
  "ភ្នំពេញ",
  "siem reap",
  "សៀមរាប",
  "battambang",
  "បាត់ដំបង",
  "kampot",
  "កំពត",
  "kep",
  "កែប",
  "sihanoukville",
  "preah sihanouk",
  "ព្រះសីហនុ",
  "koh kong",
  "កោះកុង",
  "mondulkiri",
  "មណ្ឌលគិរី",
  "ratanakiri",
  "រតនគិរី",
  "kampong cham",
  "កំពង់ចាម",
  "kampong chhnang",
  "កំពង់ឆ្នាំង",
  "kampong speu",
  "កំពង់ស្ពឺ",
  "kampong thom",
  "កំពង់ធំ",
  "kandal",
  "កណ្ដាល",
  "prey veng",
  "ព្រៃវែង",
  "pursat",
  "ពោធិ៍សាត់",
  "stung treng",
  "ស្ទឹងត្រែង",
  "svay rieng",
  "ស្វាយរៀង",
  "takeo",
  "តាកែវ",
  "tboung khmum",
  "ត្បូងឃ្មុំ",
  "oddar meanchey",
  "ឧត្តរមានជ័យ",
  "banteay meanchey",
  "បន្ទាយមានជ័យ",
  "preah vihear",
  "ព្រះវិហារ",
  "kratie",
  "ក្រចេះ",
  "pailin",
  "ប៉ៃលិន",
];

@Injectable()
export class AiTravelService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Db,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  resultMessage(language?: string | null): string {
    return this.copy(language).planReadyMessage;
  }

  private copy(language?: string | null) {
    const khmer = this.isKhmerLanguage(language);
    return khmer
      ? {
          opening: "កំពុងបើកសម័យរៀបចំដំណើររបស់អ្នក",
          classify: "កំពុងយល់ពីសំណើដំណើររបស់អ្នក",
          findingPlaces: "កំពុងរកកន្លែងពិតដែលសមនឹងអ្នក",
          draft: "កំពុងរៀបចំគម្រោងរបស់អ្នក",
          save: "កំពុងរក្សាទុកគម្រោងនេះទៅសម័យរបស់អ្នក",
          complete: "គម្រោងរួចរាល់",
          planReadyMessage:
            "នេះជាគម្រោងដែលអ្នកអាចបន្តកែសម្រួលក្នុងសន្ទនានេះ។",
          recommended: "កន្លែងណែនាំ",
          fallbackReason: "ជាលទ្ធផលពិតពី Google Places ដែលសមនឹងសំណើរបស់អ្នក។",
          food: "ម្ហូបអាហារ",
          culture: "វប្បធម៌",
          night: "សកម្មភាពពេលយប់",
          temples: "ប្រាសាទ និងប្រវត្តិសាស្ត្រ",
          placeCategory: "កន្លែង",
          day: "ថ្ងៃទី",
          tripPlan: "គម្រោងដំណើរ",
          foodRecommendations: "ការណែនាំម្ហូបអាហារ",
        }
      : {
          opening: "Opening your planner session",
          classify: "Understanding your travel request",
          findingPlaces: "Finding real places that fit",
          draft: "Building your plan",
          save: "Saving this plan to your session",
          complete: "Plan ready",
          planReadyMessage:
            "Here is a plan you can keep refining in this chat.",
          recommended: "Recommended",
          fallbackReason: "A real Google Places result matching your request.",
          food: "Food",
          culture: "Culture",
          night: "Night Activities",
          temples: "Temples & History",
          placeCategory: "Places",
          day: "Day",
          tripPlan: "trip plan",
          foodRecommendations: "Food recommendations",
        };
  }

  private isKhmerLanguage(language?: string | null): boolean {
    return language?.toLowerCase().startsWith("km") ?? false;
  }

  async travel(
    userId: string,
    request: AiTravelRequest,
  ): Promise<AiTravelResponse> {
    return this.runTravel(userId, request);
  }

  async travelWithProgress(
    userId: string,
    request: AiTravelRequest,
    onProgress: (status: {
      step: AiTravelStreamStatusStep;
      label: string;
    }) => void,
  ): Promise<AiTravelResponse> {
    return this.runTravel(userId, request, onProgress);
  }

  private async runTravel(
    userId: string,
    request: AiTravelRequest,
    onProgress?: (status: {
      step: AiTravelStreamStatusStep;
      label: string;
    }) => void,
  ): Promise<AiTravelResponse> {
    const message = request.message?.trim();
    if (!message) throw new BadRequestException("message is required");
    if (message.length > 2000) {
      throw new BadRequestException("message must be 2000 characters or fewer");
    }

    if (this.isDevelopmentEnvironment) {
      return this.runDevelopmentTravel(userId, request, message, onProgress);
    }

    await this.enforceQuestionRateLimit(userId);

    const requestedCopy = this.copy(request.language);
    onProgress?.({
      step: "session",
      label: requestedCopy.opening,
    });
    const existingPlan = request.planId
      ? await this.requirePlan(userId, request.planId)
      : null;
    const language = request.language?.trim() || existingPlan?.language || "en";
    const copy = this.copy(language);
    const session = await this.ensureSession(
      userId,
      request.sessionId,
      message,
      language,
    );
    await this.appendChatMessage({
      userId,
      sessionId: session.id,
      role: "user",
      content: message,
      planId: existingPlan?.id ?? null,
      error: false,
    });

    onProgress?.({
      step: "classify",
      label: copy.classify,
    });
    const existingPlaces = existingPlan
      ? await this.listPlanPlaces(existingPlan.id)
      : [];
    let classification: IntentClassification;
    try {
      classification = await this.classify(message, request, existingPlan);
    } catch (error) {
      if (this.isCambodiaScopeError(error)) {
        await this.appendChatMessage({
          userId,
          sessionId: session.id,
          role: "assistant",
          content: CAMBODIA_SCOPE_ERROR,
          planId: existingPlan?.id ?? null,
          error: true,
        });
        throw new BadRequestException(CAMBODIA_SCOPE_ERROR);
      }
      throw error;
    }
    const planId = existingPlan?.id ?? crypto.randomUUID();

    onProgress?.({
      step: "places",
      label: copy.findingPlaces,
    });
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

    onProgress?.({
      step: "draft",
      label: copy.draft,
    });
    const draft = await this.generateDraft(
      message,
      classification,
      candidates,
      existingPlan,
      language,
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
      session.id,
      language,
    );

    onProgress?.({
      step: "save",
      label: copy.save,
    });
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
    await this.updateSessionFromPlan(userId, session.id, response, language);
    await this.appendChatMessage({
      userId,
      sessionId: session.id,
      role: "assistant",
      content: response.summary || copy.planReadyMessage,
      planId,
      error: false,
    });

    onProgress?.({
      step: "complete",
      label: copy.complete,
    });
    return response;
  }

  async getPlan(userId: string, planId: string): Promise<AiTravelResponse> {
    const plan = await this.requirePlan(userId, planId);
    const places = await this.listPlanPlaces(plan.id);
    return this.mergePlaceState(plan.response as AiTravelResponse, places);
  }

  async listSessions(userId: string): Promise<AiTravelSessionSummary[]> {
    const sessions = await this.db
      .select()
      .from(aiTravelSession)
      .where(eq(aiTravelSession.userId, userId))
      .orderBy(desc(aiTravelSession.updatedAt))
      .limit(20);

    return Promise.all(
      sessions.map(async (session) => ({
        ...this.toSessionSummary(session),
        messageCount: await this.countSessionMessages(userId, session.id),
      })),
    );
  }

  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<AiTravelSessionDetail> {
    const session = await this.requireSession(userId, sessionId);
    const messages = await this.listSessionMessages(userId, session.id);
    const plan = session.activePlanId
      ? await this.getSessionPlan(userId, session.activePlanId, session.id)
      : null;

    return {
      ...this.toSessionSummary(session, messages.length),
      messages,
      plan,
    };
  }

  async deleteSession(
    userId: string,
    sessionId: string,
  ): Promise<{ id: string }> {
    const rows = await this.db
      .delete(aiTravelSession)
      .where(
        and(
          eq(aiTravelSession.id, sessionId),
          eq(aiTravelSession.userId, userId),
        ),
      )
      .returning({ id: aiTravelSession.id });

    if (!rows[0]) throw new NotFoundException("AI travel session not found");
    return rows[0];
  }

  async deleteSessions(userId: string): Promise<{ deletedCount: number }> {
    const rows = await this.db
      .delete(aiTravelSession)
      .where(eq(aiTravelSession.userId, userId))
      .returning({ id: aiTravelSession.id });

    return { deletedCount: rows.length };
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
    return this.config.get<string>("GEMINI_MODEL") || "gemini-2.5-flash";
  }

  private get publicApiUrl(): string {
    return this.config.get<string>("PUBLIC_API_URL") ?? "http://localhost:3000";
  }

  private get isDevelopmentEnvironment(): boolean {
    const env =
      this.config.get<string>("NODE_ENV") ?? this.config.get<string>("APP_ENV");
    return env === "development";
  }

  private async enforceQuestionRateLimit(userId: string): Promise<void> {
    const windowStart = new Date(Date.now() - AI_TRAVEL_RATE_LIMIT_WINDOW_MS);
    const rows = await this.db
      .select({ value: count() })
      .from(aiTravelChatMessage)
      .where(
        and(
          eq(aiTravelChatMessage.userId, userId),
          eq(aiTravelChatMessage.role, "user"),
          gte(aiTravelChatMessage.createdAt, windowStart),
        ),
      );

    if (Number(rows[0]?.value ?? 0) >= AI_TRAVEL_QUESTION_LIMIT) {
      throw new HttpException(
        AI_TRAVEL_RATE_LIMIT_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async runDevelopmentTravel(
    userId: string,
    request: AiTravelRequest,
    message: string,
    onProgress?: (status: {
      step: AiTravelStreamStatusStep;
      label: string;
    }) => void,
  ): Promise<AiTravelResponse> {
    const language = request.language?.trim() || "en";
    const copy = this.copy(language);

    onProgress?.({ step: "session", label: copy.opening });
    const existingPlan = request.planId
      ? await this.requirePlan(userId, request.planId)
      : null;
    const session = await this.ensureSession(
      userId,
      request.sessionId,
      message,
      language,
    );
    await this.appendChatMessage({
      userId,
      sessionId: session.id,
      role: "user",
      content: message,
      planId: existingPlan?.id ?? null,
      error: false,
    });

    onProgress?.({ step: "draft", label: copy.draft });
    const planId = existingPlan?.id ?? crypto.randomUUID();
    const summary = this.isKhmerLanguage(language)
      ? "នេះជាចម្លើយសាកល្បងលឿនសម្រាប់ development។ Rate limit និង AI/Google Places ត្រូវបានរំលង។"
      : "Development dummy response: rate limiting, Gemini, and Google Places were skipped so you can test faster.";
    const places = this.developmentPlaces(language);
    const response: AiTravelResponse = {
      planId,
      sessionId: session.id,
      intent: "RECOMMEND_PLACES",
      destination: "Cambodia",
      title: this.isKhmerLanguage(language)
        ? "ចម្លើយសាកល្បង Development"
        : "Development test response",
      summary,
      groups: [
        {
          category: copy.recommended,
          places,
        },
      ],
      places,
      itinerary: null,
      map: this.buildMap(places),
      followUpActions: DEFAULT_FOLLOW_UPS,
    };

    onProgress?.({ step: "save", label: copy.save });
    await this.savePlan({
      userId,
      planId,
      existingPlan,
      language,
      originalPrompt: message,
      classification: {
        allowed: true,
        refusalReason: null,
        intent: response.intent,
        destination: response.destination,
        category: null,
        days: null,
        budget: null,
        transport: null,
        anchorPlace: null,
        filters: [],
        missingInfo: [],
        searchQuery: "development dummy Cambodia",
      },
      response,
    });
    await this.savePlanPlaces(userId, planId, response.places, []);
    await this.updateSessionFromPlan(userId, session.id, response, language);
    await this.appendChatMessage({
      userId,
      sessionId: session.id,
      role: "assistant",
      content: summary,
      planId,
      error: false,
    });

    onProgress?.({ step: "complete", label: copy.complete });
    return response;
  }

  private developmentPlaces(language: string): AiTravelPlace[] {
    const copy = this.copy(language);
    const placeCategory = this.isKhmerLanguage(language)
      ? {
          nature: "ធម្មជាតិ",
          market: "ផ្សារ",
        }
      : {
          nature: "Nature",
          market: "Markets",
        };
    const places: Array<
      Omit<
        AiTravelPlace,
        "attractionId" | "photoName" | "photoUrl" | "saved" | "removed"
      >
    > = [
      {
        googlePlaceId: "dev-angkor-wat",
        name: "Angkor Wat",
        address: "Krong Siem Reap, Cambodia",
        latitude: 13.4125,
        longitude: 103.867,
        rating: 4.8,
        userRatingCount: 120000,
        googleMapsUri: "https://maps.google.com/?q=Angkor+Wat",
        types: ["tourist_attraction", "place_of_worship"],
        category: copy.temples,
        reason: "Cambodia's signature temple complex and a strong first stop for any itinerary.",
        order: 1,
      },
      {
        googlePlaceId: "dev-bayon-temple",
        name: "Bayon Temple",
        address: "Angkor Thom, Krong Siem Reap, Cambodia",
        latitude: 13.4414,
        longitude: 103.8587,
        rating: 4.8,
        userRatingCount: 33000,
        googleMapsUri: "https://maps.google.com/?q=Bayon+Temple",
        types: ["tourist_attraction", "place_of_worship"],
        category: copy.temples,
        reason: "Known for carved stone faces and easy to combine with Angkor Thom stops.",
        order: 2,
      },
      {
        googlePlaceId: "dev-ta-prohm",
        name: "Ta Prohm Temple",
        address: "Krong Siem Reap, Cambodia",
        latitude: 13.4348,
        longitude: 103.8894,
        rating: 4.8,
        userRatingCount: 52000,
        googleMapsUri: "https://maps.google.com/?q=Ta+Prohm+Temple",
        types: ["tourist_attraction", "place_of_worship"],
        category: copy.temples,
        reason: "A dramatic temple where tree roots and stone ruins make the route feel cinematic.",
        order: 3,
      },
      {
        googlePlaceId: "dev-royal-palace",
        name: "Royal Palace",
        address: "Samdach Sothearos Blvd, Phnom Penh, Cambodia",
        latitude: 11.5633,
        longitude: 104.931,
        rating: 4.3,
        userRatingCount: 18000,
        googleMapsUri: "https://maps.google.com/?q=Royal+Palace+Phnom+Penh",
        types: ["tourist_attraction", "museum"],
        category: copy.culture,
        reason: "A central Phnom Penh landmark with classic architecture and easy riverside access.",
        order: 4,
      },
      {
        googlePlaceId: "dev-national-museum",
        name: "National Museum of Cambodia",
        address: "Preah Ang Eng St. 13, Phnom Penh, Cambodia",
        latitude: 11.5655,
        longitude: 104.9298,
        rating: 4.3,
        userRatingCount: 9700,
        googleMapsUri: "https://maps.google.com/?q=National+Museum+of+Cambodia",
        types: ["museum", "tourist_attraction"],
        category: copy.culture,
        reason: "A useful culture stop before or after the Royal Palace.",
        order: 5,
      },
      {
        googlePlaceId: "dev-tuol-sleng",
        name: "Tuol Sleng Genocide Museum",
        address: "St 113, Phnom Penh, Cambodia",
        latitude: 11.5494,
        longitude: 104.9176,
        rating: 4.6,
        userRatingCount: 14000,
        googleMapsUri: "https://maps.google.com/?q=Tuol+Sleng+Genocide+Museum",
        types: ["museum", "tourist_attraction"],
        category: copy.culture,
        reason: "An important historical site for travelers who want deeper context.",
        order: 6,
      },
      {
        googlePlaceId: "dev-central-market",
        name: "Central Market",
        address: "Calmette St. 53, Phnom Penh, Cambodia",
        latitude: 11.5697,
        longitude: 104.9226,
        rating: 4.1,
        userRatingCount: 13000,
        googleMapsUri: "https://maps.google.com/?q=Central+Market+Phnom+Penh",
        types: ["market", "tourist_attraction"],
        category: placeCategory.market,
        reason: "Good for quick shopping, local snacks, and testing market-style planner cards.",
        order: 7,
      },
      {
        googlePlaceId: "dev-bokor-national-park",
        name: "Bokor National Park",
        address: "Kampot Province, Cambodia",
        latitude: 10.6264,
        longitude: 104.0267,
        rating: 4.3,
        userRatingCount: 5600,
        googleMapsUri: "https://maps.google.com/?q=Bokor+National+Park",
        types: ["park", "tourist_attraction"],
        category: placeCategory.nature,
        reason: "A cooler mountain escape near Kampot with viewpoints and old hill-station stops.",
        order: 8,
      },
      {
        googlePlaceId: "dev-kampot-river",
        name: "Kampot River",
        address: "Kampot, Cambodia",
        latitude: 10.6073,
        longitude: 104.181,
        rating: 4.5,
        userRatingCount: 2200,
        googleMapsUri: "https://maps.google.com/?q=Kampot+River",
        types: ["natural_feature", "tourist_attraction"],
        category: placeCategory.nature,
        reason: "Useful for sunset cruises, kayaking, and relaxed follow-up itinerary tests.",
        order: 9,
      },
      {
        googlePlaceId: "dev-kep-crab-market",
        name: "Kep Crab Market",
        address: "Kep, Cambodia",
        latitude: 10.4829,
        longitude: 104.2939,
        rating: 4.2,
        userRatingCount: 8200,
        googleMapsUri: "https://maps.google.com/?q=Kep+Crab+Market",
        types: ["restaurant", "market", "tourist_attraction"],
        category: copy.food,
        reason: "A classic seafood stop and a good test case for food recommendations.",
        order: 10,
      },
    ];

    return places.map((place) => ({
      ...place,
      attractionId: null,
      photoName: null,
      photoUrl: null,
      saved: false,
      removed: false,
    }));
  }

  private requireGeminiKey(): void {
    if (!this.config.get<string>("GOOGLE_GENERATIVE_AI_API_KEY")) {
      throw new ServiceUnavailableException(
        "GOOGLE_GENERATIVE_AI_API_KEY is not configured",
      );
    }
  }

  private requirePlacesKey(): string {
    const key = this.config.get<string>("GOOGLE_PLACES_API_KEY");
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
        system: [
          "You classify travel planning prompts for a Cambodia-only map planner.",
          "Set allowed=false unless the user is asking about Cambodia travel, maps, routes, itineraries, or real places.",
          "Reject general knowledge, coding, unsafe, adult, medical, legal, financial, and non-Cambodia travel requests.",
          "If a follow-up depends on an existing Cambodia plan, it is allowed.",
          "Extract only facts stated or clearly implied. Return structured data only.",
        ].join(" "),
        prompt: [
          previous,
          request.userLocation
            ? `User location: ${request.userLocation.lat}, ${request.userLocation.lng}`
            : "User location: unknown",
          `Language: ${request.language ?? "en"}`,
          `User prompt: ${message}`,
          "If allowed=false, set refusalReason briefly and still fill the remaining fields with safe defaults.",
          "If the prompt is a follow-up and destination is omitted, reuse the existing plan destination.",
          "Destination must be Cambodia or a place/province/city inside Cambodia. If unsure, use Cambodia.",
          "searchQuery must be a Google Places text search query for real places inside Cambodia.",
        ].join("\n"),
      });
      if (!output.allowed) {
        throw new BadRequestException(CAMBODIA_SCOPE_ERROR);
      }
      const destination = this.normalizeCambodiaDestination(
        output.destination || existingPlan?.destination || null,
      );
      return {
        ...output,
        destination,
        searchQuery: this.ensureCambodiaSearchQuery(
          output.searchQuery ||
            this.defaultSearchQuery(output.intent, destination, message),
        ),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
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
    language: string,
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
          "Also write responseText as a short conversational answer to the user before the structured places.",
          "For BUDGET_PLAN, responseText must directly answer the estimated budget with a practical range, assumptions, and what is included. It may use common Cambodia travel cost estimates, but label them as estimates.",
          "For follow-up questions that ask for a simple explanation, comparison, budget, timing, or route advice, make responseText useful on its own even if places are also returned.",
          "Return structured data only.",
        ].join(" "),
        prompt: [
          `User prompt: ${message}`,
          `Intent: ${classification.intent}`,
          `Destination: ${classification.destination ?? "unknown"}`,
          `Days: ${classification.days ?? "unknown"}`,
          `Budget: ${classification.budget ?? "unknown"}`,
          `Transport: ${classification.transport ?? "unknown"}`,
          `Response language: ${language}`,
          this.isKhmerLanguage(language)
            ? "Write every user-facing natural-language field in Khmer: responseText, title, group category, place reason, itinerary day title, itinerary notes, and followUp wording. Keep Google place names exactly as provided unless Google returned Khmer names."
            : "Write every user-facing natural-language field in English, including responseText.",
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
    const textQuery = this.ensureCambodiaSearchQuery(
      classification.searchQuery ||
        this.defaultSearchQuery(
          classification.intent,
          classification.destination,
          request.message,
        ),
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

    try {
      const res = await this.http.axiosRef.post<{ places?: GooglePlace[] }>(
        `${PLACES_API}/places:searchText`,
        body,
        {
          headers: {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
          },
        },
      );
      return this.normalizePlaces(res.data.places ?? []);
    } catch (error) {
      throw new BadGatewayException(
        `Google Places Text Search failed: ${this.httpErrorStatus(error)}`,
      );
    }
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
    sessionId: string,
    language: string,
  ): AiTravelResponse {
    const copy = this.copy(language);
    const candidateMap = new Map(candidates.map((p) => [p.googlePlaceId, p]));
    const seen = new Set<string>();
    let order = 1;

    const groups = draft.groups
      .map((group) => ({
        category: group.category || copy.recommended,
        places: group.places
          .map((pick) => {
            const candidate = candidateMap.get(pick.googlePlaceId);
            if (!candidate || seen.has(candidate.googlePlaceId)) return null;
            seen.add(candidate.googlePlaceId);
            const state = states.get(candidate.googlePlaceId);
            return this.toResponsePlace(candidate, {
              category: group.category || this.inferCategory(candidate, language),
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
        category: copy.recommended,
        places: candidates.slice(0, 10).map((candidate) => {
          const state = states.get(candidate.googlePlaceId);
          return this.toResponsePlace(candidate, {
            category: this.inferCategory(candidate, language),
            reason: copy.fallbackReason,
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
          ? {
              days: this.fallbackItinerary(
                places,
                classification.days ?? 1,
                language,
              ),
            }
          : null;

    return {
      planId,
      sessionId,
      intent: classification.intent,
      destination: classification.destination,
      title: draft.title || this.defaultTitle(classification, language),
      summary:
        draft.responseText || this.defaultResponseText(classification, language),
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
    language: string,
  ): AiTravelItineraryDay[] {
    const copy = this.copy(language);
    const safeDays = Math.max(1, Math.min(7, days));
    return Array.from({ length: safeDays }, (_, index) => {
      const dayPlaces = places.filter(
        (_, placeIndex) => placeIndex % safeDays === index,
      );
      return {
        day: index + 1,
        title: `${copy.day} ${index + 1}`,
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

  private async ensureSession(
    userId: string,
    requestedSessionId: string | undefined,
    message: string,
    language: string,
  ): Promise<ExistingSession> {
    const sessionId = requestedSessionId?.trim();
    if (sessionId) {
      const rows = await this.db
        .select()
        .from(aiTravelSession)
        .where(eq(aiTravelSession.id, sessionId))
        .limit(1);
      const existing = rows[0];
      if (existing) {
        if (existing.userId !== userId) {
          throw new NotFoundException("AI travel session not found");
        }
        return existing;
      }
    }

    const id = sessionId || crypto.randomUUID();
    const title = this.defaultSessionTitle(message);
    const rows = await this.db
      .insert(aiTravelSession)
      .values({
        id,
        userId,
        title,
        language,
      })
      .returning();
    return rows[0]!;
  }

  private async updateSessionFromPlan(
    userId: string,
    sessionId: string,
    response: AiTravelResponse,
    language: string,
  ): Promise<void> {
    await this.db
      .update(aiTravelSession)
      .set({
        activePlanId: response.planId,
        title: response.title,
        destination: response.destination,
        language,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiTravelSession.id, sessionId),
          eq(aiTravelSession.userId, userId),
        ),
      );
  }

  private async appendChatMessage(input: {
    userId: string;
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    planId: string | null;
    error: boolean;
  }): Promise<void> {
    const positionRows = await this.db
      .select({
        nextPosition:
          sql<number>`coalesce(max(${aiTravelChatMessage.position}), -1) + 1`.as(
            "next_position",
          ),
      })
      .from(aiTravelChatMessage)
      .where(eq(aiTravelChatMessage.sessionId, input.sessionId));
    const position = Number(positionRows[0]?.nextPosition ?? 0);

    await this.db.insert(aiTravelChatMessage).values({
      sessionId: input.sessionId,
      userId: input.userId,
      planId: input.planId,
      role: input.role,
      content: input.content,
      error: input.error,
      position,
    });
  }

  private async countSessionMessages(
    userId: string,
    sessionId: string,
  ): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(aiTravelChatMessage)
      .where(
        and(
          eq(aiTravelChatMessage.userId, userId),
          eq(aiTravelChatMessage.sessionId, sessionId),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  private async listSessionMessages(
    userId: string,
    sessionId: string,
  ): Promise<AiTravelChatMessage[]> {
    const rows = await this.db
      .select()
      .from(aiTravelChatMessage)
      .where(
        and(
          eq(aiTravelChatMessage.userId, userId),
          eq(aiTravelChatMessage.sessionId, sessionId),
        ),
      )
      .orderBy(asc(aiTravelChatMessage.position));

    return rows.map((message) => ({
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
      planId: message.planId,
      error: message.error,
      createdAt: this.toIsoString(message.createdAt),
    }));
  }

  private async requireSession(
    userId: string,
    sessionId: string,
  ): Promise<ExistingSession> {
    const rows = await this.db
      .select()
      .from(aiTravelSession)
      .where(
        and(
          eq(aiTravelSession.id, sessionId),
          eq(aiTravelSession.userId, userId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException("AI travel session not found");
    return rows[0];
  }

  private async getSessionPlan(
    userId: string,
    planId: string,
    sessionId: string,
  ): Promise<AiTravelResponse> {
    const plan = await this.requirePlan(userId, planId);
    const places = await this.listPlanPlaces(plan.id);
    return this.mergePlaceState(
      plan.response as AiTravelResponse,
      places,
      sessionId,
    );
  }

  private toSessionSummary(
    session: ExistingSession,
    messageCount = 0,
  ): AiTravelSessionSummary {
    return {
      id: session.id,
      title: session.title,
      destination: session.destination,
      activePlanId: session.activePlanId,
      messageCount,
      updatedAt: this.toIsoString(session.updatedAt),
      createdAt: this.toIsoString(session.createdAt),
    };
  }

  private defaultSessionTitle(message: string): string {
    const collapsed = message.replace(/\s+/g, " ").trim();
    if (collapsed.length <= 80) return collapsed || "New AI travel chat";
    return `${collapsed.slice(0, 77)}...`;
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
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
    sessionId = response.sessionId ?? "",
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
      sessionId,
      summary: response.summary ?? this.resultMessage(null),
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

  private normalizeCambodiaDestination(destination: string | null): string {
    const value = destination?.trim();
    if (!value) return "Cambodia";
    const lower = value.toLowerCase();
    if (CAMBODIA_ALIASES.some((name) => lower.includes(name))) return value;
    return `${value}, Cambodia`;
  }

  private ensureCambodiaSearchQuery(query: string): string {
    const trimmed = query.replace(/\s+/g, " ").trim();
    if (!trimmed) return "places to visit in Cambodia";
    const lower = trimmed.toLowerCase();
    if (CAMBODIA_ALIASES.some((name) => lower.includes(name))) return trimmed;
    return `${trimmed} in Cambodia`;
  }

  private defaultTitle(
    classification: IntentClassification,
    language: string,
  ): string {
    const copy = this.copy(language);
    const destination = classification.destination
      ? ` in ${classification.destination}`
      : "";
    if (classification.intent === "CREATE_ITINERARY") {
      if (this.isKhmerLanguage(language)) {
        const days = classification.days ? `${classification.days} ថ្ងៃ ` : "";
        const where = classification.destination
          ? `នៅ${classification.destination}`
          : "";
        return `${copy.tripPlan} ${days}${where}`.trim();
      }
      return `${classification.days ?? ""}-day ${copy.tripPlan}${destination}`.trim();
    }
    if (classification.intent === "FOOD_RECOMMENDATION") {
      if (this.isKhmerLanguage(language)) {
        const where = classification.destination
          ? `នៅ${classification.destination}`
          : "";
        return `${copy.foodRecommendations}${where}`;
      }
      return `${copy.foodRecommendations}${destination}`;
    }
    if (this.isKhmerLanguage(language)) {
      const where = classification.destination
        ? `នៅ${classification.destination}`
        : "";
      return `${copy.recommended}${where}`;
    }
    return `${copy.recommended} places${destination}`;
  }

  private defaultResponseText(
    classification: IntentClassification,
    language: string,
  ): string {
    const copy = this.copy(language);
    const destination = classification.destination ?? "Cambodia";

    if (classification.intent === "BUDGET_PLAN") {
      if (this.isKhmerLanguage(language)) {
        return `ការប៉ាន់ស្មានថវិកាសម្រាប់ ${destination}: ប្រហែល $35-60 ក្នុងមួយថ្ងៃសម្រាប់ដំណើរចំណាយតិច, $70-120 សម្រាប់មធ្យម, និង $150+ សម្រាប់ស្រួលខ្លាំង។ តម្លៃនេះរាប់បញ្ចូលអាហារ ការធ្វើដំណើរក្នុងតំបន់ និងសំបុត្រចូលខ្លះៗ ប៉ុន្តែមិនរាប់បញ្ចូលសំបុត្រយន្តហោះទេ។`;
      }
      return `Estimated budget for ${destination}: about $35-60/day for budget travel, $70-120/day for mid-range, and $150+/day for a more comfortable trip. This includes food, local transport, and some entry fees, but not flights.`;
    }

    return copy.planReadyMessage;
  }

  private inferCategory(place: CandidatePlace, language: string): string {
    const copy = this.copy(language);
    const types = new Set(place.types);
    if (types.has("restaurant") || types.has("cafe") || types.has("food"))
      return copy.food;
    if (types.has("museum") || types.has("art_gallery")) return copy.culture;
    if (types.has("night_club") || types.has("bar")) return copy.night;
    if (types.has("hindu_temple") || types.has("place_of_worship"))
      return copy.temples;
    return copy.placeCategory;
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

  private httpErrorStatus(error: unknown): string {
    if (typeof error !== "object" || error === null) {
      return this.errorMessage(error);
    }
    if (
      "response" in error &&
      typeof error.response === "object" &&
      error.response !== null &&
      "status" in error.response
    ) {
      return String(error.response.status);
    }
    return this.errorMessage(error);
  }

  private isCambodiaScopeError(error: unknown): boolean {
    if (!(error instanceof BadRequestException)) return false;
    const response = error.getResponse();
    if (typeof response === "string") return response === CAMBODIA_SCOPE_ERROR;
    if (response && typeof response === "object" && "message" in response) {
      const message = (response as { message?: string | string[] }).message;
      return Array.isArray(message)
        ? message.includes(CAMBODIA_SCOPE_ERROR)
        : message === CAMBODIA_SCOPE_ERROR;
    }
    return error.message === CAMBODIA_SCOPE_ERROR;
  }

  requireUserId(user?: { id: string } | null): string {
    if (!user?.id) throw new UnauthorizedException("Sign in required");
    return user.id;
  }
}
