import { useChat } from "@ai-sdk/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getRouteApi,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import {
  AdvancedMarker,
  ColorScheme,
  Map as GoogleMap,
} from "@vis.gl/react-google-maps"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  Copy,
  Ellipsis,
  ExternalLink,
  History,
  List,
  LoaderCircle,
  LocateFixed,
  MapPinned,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RefreshCcw,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { useTheme } from "next-themes"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  deleteAiTravelSession,
  deleteAiTravelSessions,
  patchAiTravelPlanPlace,
} from "@/api/ai-travel.api"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { UserLocationMarker } from "@/components/features/explore/user-location-marker"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { envClient } from "@/env"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useUserLocation } from "@/hooks/use-user-location"
import { formatDistanceValue } from "@/lib/distance"
import { cn } from "@/lib/utils"
import { Header } from "@/components/layout/header"
import {
  aiTravelPlanQueryOptions,
  aiTravelSessionQueryOptions,
  aiTravelSessionsQueryOptions,
} from "@/queries/ai-travel.query"
import type {
  AiTravelPlace,
  AiTravelResponse,
  AiTravelSessionDetail,
  AiTravelSessionSummary,
} from "@/types/ai-travel"

const DEFAULT_CENTER = { lat: 13.3622, lng: 103.8597 }
const DEFAULT_ZOOM = 12
const MAP_ID = "DEMO_MAP_ID"

type PlannerCopy = {
  initialAssistant: string
  starterPrompts: string[]
  followUpPrompts: string[]
  nearbyTourPrompt: string
  restoredPlan: string
  emptyTitle: string
  emptyDescription: string
  planning: string
  inputPlaceholder: string
  useCurrentLocation: string
  locationEnabled: string
  locating: string
  disableLocation: string
  showMap: string
  showPlan: string
  aiPlanner: string
  history: string
  plannerHistory: string
  copySessionLink: string
  newSession: string
  closeHistory: string
  loading: string
  noSessions: string
  messages: string
  deleteAll: string
  deleteSession: string
  deleteSessionTitle: string
  deleteSessionDescription: string
  deleteAllTitle: string
  deleteAllDescription: string
  cancel: string
  delete: string
  itinerary: string
  day: string
  days: string
  placeSuggestions: string
  hidePlaces: string
  showPlaces: string
  showMorePlaces: (count: number) => string
  showFewerPlaces: string
  save: string
  saved: string
  remove: string
  maps: string
  details: string
  whyVisit: string
  distance: string
  distanceAway: (distanceMeters: number | null) => string | null
  openFullRoute: string
  dayRoute: (day: number) => string
  sessionDeleted: string
  historyDeleted: string
  sessionLinkCopied: string
  copyFailed: string
}

function isKhmerLanguage(language: string) {
  return language.toLowerCase().startsWith("km")
}

function getPlannerCopy(language: string): PlannerCopy {
  if (isKhmerLanguage(language)) {
    return {
      initialAssistant:
        "ប្រាប់ខ្ញុំថាអ្នកចង់ទៅណា មានពេលប៉ុន្មានថ្ងៃ ឬចង់ធ្វើដំណើរបែបណា។ ខ្ញុំនឹងរៀបចំគម្រោង ហើយកែសម្រួលបន្តនៅទីនេះ។",
      starterPrompts: [
        "រៀបចំដំណើរនៅកម្ពុជា",
        "ស្វែងរកកន្លែងក្បែរខ្ញុំនៅកម្ពុជា ហើយរៀបចំដំណើរកម្សាន្តខ្លីកន្លះថ្ងៃ",
        "ម្ហូបក្នុងស្រុកល្អៗនៅសៀមរាប",
      ],
      followUpPrompts: [
        "ធ្វើឱ្យគម្រោងនេះមានរសជាតិក្នុងស្រុកជាងនេះ",
        "បន្ថែមហាងកាហ្វេក្បែរនេះ",
        "រៀបចំ Itinerary ៣ ថ្ងៃ",
        "ធ្វើជម្រើសដែលចំណាយតិចជាងនេះ",
      ],
      nearbyTourPrompt:
        "ស្វែងរកកន្លែងក្បែរខ្ញុំនៅកម្ពុជា ហើយរៀបចំដំណើរកម្សាន្តខ្លីកន្លះថ្ងៃ",
      restoredPlan: "បានស្ដារគម្រោងដែលបានរក្សាទុកពីតំណនេះ។",
      emptyTitle: "ចាប់ផ្ដើមរៀបចំដំណើរ",
      emptyDescription: "សួរអំពីកន្លែង ផ្លូវ ម្ហូប ឬការកែសម្រួល Itinerary។",
      planning: "កំពុងរៀបចំដំណើររបស់អ្នក",
      inputPlaceholder: "សួរអំពីដំណើរកំសាន្ត...",
      useCurrentLocation: "ប្រើទីតាំងបច្ចុប្បន្ន",
      locationEnabled: "កំពុងប្រើទីតាំង",
      locating: "កំពុងរកទីតាំង...",
      disableLocation: "ឈប់ប្រើទីតាំង",
      showMap: "បង្ហាញផែនទី",
      showPlan: "បង្ហាញគម្រោង",
      aiPlanner: "AI រៀបចំដំណើរ",
      history: "ប្រវត្តិ",
      plannerHistory: "ប្រវត្តិគម្រោងដំណើរ",
      copySessionLink: "ចម្លងតំណសម័យ",
      newSession: "សម័យថ្មី",
      closeHistory: "បិទប្រវត្តិគម្រោង",
      loading: "កំពុងផ្ទុក...",
      noSessions: "មិនទាន់មានសម័យដែលបានរក្សាទុកទេ។",
      messages: "សារ",
      deleteAll: "លុបទាំងអស់",
      deleteSession: "លុបសម័យ",
      deleteSessionTitle: "លុបសម័យរៀបចំដំណើរនេះ?",
      deleteSessionDescription:
        "វានឹងលុបប្រវត្តិសន្ទនាសម្រាប់សម័យនេះ។ គម្រោងដែលបានភ្ជាប់នៅតែអាចប្រើបាន។",
      deleteAllTitle: "លុបប្រវត្តិគម្រោងទាំងអស់?",
      deleteAllDescription:
        "វានឹងលុបសម័យរៀបចំដំណើរ និងសារសន្ទនាទាំងអស់ពីប្រវត្តិរបស់អ្នក។ គម្រោងដែលបានភ្ជាប់នៅតែអាចប្រើបាន។",
      cancel: "បោះបង់",
      delete: "លុប",
      itinerary: "Itinerary",
      day: "ថ្ងៃទី",
      days: "ថ្ងៃ",
      placeSuggestions: "កន្លែងណែនាំ",
      hidePlaces: "លាក់",
      showPlaces: "បង្ហាញ",
      showMorePlaces: (count) => `បង្ហាញ ${count} កន្លែងទៀត`,
      showFewerPlaces: "បង្ហាញតែ ២ កន្លែង",
      save: "រក្សាទុក",
      saved: "បានរក្សាទុក",
      remove: "ដកចេញ",
      maps: "ផែនទី",
      details: "ព័ត៌មានលម្អិត",
      whyVisit: "ហេតុអ្វីគួរទៅ",
      distance: "ចម្ងាយ",
      distanceAway: (distanceMeters) => {
        const value = formatDistanceValue(distanceMeters)
        return value ? `ចម្ងាយ ${value}` : null
      },
      openFullRoute: "បើកផ្លូវពេញក្នុង Google Maps",
      dayRoute: (day) => `ផ្លូវថ្ងៃទី ${day}`,
      sessionDeleted: "បានលុបសម័យរៀបចំដំណើរ",
      historyDeleted: "បានលុបប្រវត្តិគម្រោង",
      sessionLinkCopied: "បានចម្លងតំណសម័យ",
      copyFailed: "មិនអាចចម្លងតំណសម័យបានទេ",
    }
  }

  return {
    initialAssistant:
      "Tell me where you want to go, how long you have, or what kind of trip you want. I will build a plan and keep refining it here.",
    starterPrompts: [
      "Plan a trip in Cambodia",
      "Find places near me in Cambodia and plan a quick half-day tour",
      "Best local food in Siem Reap",
    ],
    followUpPrompts: [
      "Make this more local",
      "Add cafes nearby",
      "Create a 3-day itinerary",
      "Create a cheaper version",
    ],
    nearbyTourPrompt:
      "Find places near me in Cambodia and plan a quick half-day tour",
    restoredPlan: "Restored your saved plan from this URL.",
    emptyTitle: "Start a travel plan",
    emptyDescription: "Ask for places, routes, food, or itinerary changes.",
    planning: "Planning your trip",
    inputPlaceholder: "Ask about your trip...",
    useCurrentLocation: "Use current location",
    locationEnabled: "Using current location",
    locating: "Finding location...",
    disableLocation: "Stop using location",
    showMap: "Show map",
    showPlan: "Show plan",
    aiPlanner: "AI Planner",
    history: "History",
    plannerHistory: "Planner history",
    copySessionLink: "Copy session link",
    newSession: "New session",
    closeHistory: "Close planner history",
    loading: "Loading...",
    noSessions: "No saved sessions yet.",
    messages: "messages",
    deleteAll: "Delete all",
    deleteSession: "Delete session",
    deleteSessionTitle: "Delete planner session?",
    deleteSessionDescription:
      "This removes the chat history for this session. Linked plans will remain available.",
    deleteAllTitle: "Delete all planner history?",
    deleteAllDescription:
      "This removes all saved planner sessions and chat messages from your history. Linked plans will remain available.",
    cancel: "Cancel",
    delete: "Delete",
    itinerary: "Itinerary",
    day: "Day",
    days: "days",
    placeSuggestions: "Place suggestions",
    hidePlaces: "Hide",
    showPlaces: "Show",
    showMorePlaces: (count) => `Show ${count} more`,
    showFewerPlaces: "Show fewer",
    save: "Save",
    saved: "Saved",
    remove: "Remove",
    maps: "Maps",
    details: "Details",
    whyVisit: "Why visit",
    distance: "Distance",
    distanceAway: (distanceMeters) => {
      const value = formatDistanceValue(distanceMeters)
      return value ? `${value} away` : null
    },
    openFullRoute: "Open full route in Google Maps",
    dayRoute: (day) => `Day ${day} route`,
    sessionDeleted: "Planner session deleted",
    historyDeleted: "Planner history deleted",
    sessionLinkCopied: "Session link copied",
    copyFailed: "Could not copy the session link",
  }
}

const plannerRouteApi = getRouteApi("/_authed/planner")

type TravelPlannerContextValue = {
  getPlaceById: (googlePlaceId: string) => AiTravelPlace | null
  saving: boolean
  onSavePlace: (place: AiTravelPlace) => void
  onRemovePlace: (place: AiTravelPlace) => void
}

const TravelPlannerContext = createContext<TravelPlannerContextValue | null>(
  null
)

export function useTravelPlannerContext() {
  const context = useContext(TravelPlannerContext)
  if (!context) {
    throw new Error(
      "useTravelPlannerContext must be used inside TravelPlannerView"
    )
  }
  return context
}

export function PlannerPlaceRouteDialog({
  googlePlaceId,
}: {
  googlePlaceId: string
}) {
  const navigate = useNavigate()
  const { getPlaceById, saving, onSavePlace, onRemovePlace } =
    useTravelPlannerContext()
  const place = getPlaceById(googlePlaceId)

  const close = () => {
    navigate({
      to: "/planner",
      search: (prev) => prev,
    })
  }

  return (
    <PlannerPlaceDetailDialog
      place={place}
      open
      saving={saving}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      onSave={onSavePlace}
      onRemove={(nextPlace) => {
        close()
        onRemovePlace(nextPlace)
      }}
    />
  )
}

type PlannerMetadata = {
  planId?: string
  error?: boolean
}

type AiTravelPlannerMessage = UIMessage<PlannerMetadata>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isAiTravelResponse(value: unknown): value is AiTravelResponse {
  return (
    isRecord(value) &&
    typeof value.planId === "string" &&
    typeof value.sessionId === "string" &&
    Array.isArray(value.places)
  )
}

function isPlannerStatusData(
  value: unknown
): value is { step: string; label: string } {
  return (
    isRecord(value) &&
    typeof value.step === "string" &&
    typeof value.label === "string"
  )
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function createMessageId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function createTextMessage(
  role: "assistant" | "user",
  content: string,
  metadata?: PlannerMetadata
): AiTravelPlannerMessage {
  return {
    id: createMessageId(),
    role,
    metadata,
    parts: [{ type: "text", text: content }],
  }
}

function createInitialChatMessages(
  copy: PlannerCopy
): AiTravelPlannerMessage[] {
  return [createTextMessage("assistant", copy.initialAssistant)]
}

function chatMessagesFromSession(
  detail: AiTravelSessionDetail,
  copy: PlannerCopy
): AiTravelPlannerMessage[] {
  const sessionPlan = detail.plan
  const reversedMessages = [...detail.messages].reverse()
  const latestPlanMessageId =
    sessionPlan &&
    (reversedMessages.find(
      (message) =>
        message.role === "assistant" && message.planId === sessionPlan.planId
    )?.id ??
      reversedMessages.find((message) => message.role === "assistant")?.id)

  const messages = detail.messages.map((message): AiTravelPlannerMessage => {
    const parts: AiTravelPlannerMessage["parts"] = [
      { type: "text", text: message.content },
    ]
    if (
      message.role === "assistant" &&
      sessionPlan &&
      message.id === latestPlanMessageId
    ) {
      parts.push({
        type: "data-plan",
        id: "planner-plan",
        data: sessionPlan,
      })
    }

    return {
      id: message.id,
      role: message.role,
      metadata: {
        planId: message.planId ?? undefined,
        error: message.error || undefined,
      },
      parts,
    }
  })

  return messages.length > 0 ? messages : createInitialChatMessages(copy)
}

function planFromMessage(
  message: AiTravelPlannerMessage
): AiTravelResponse | null {
  for (const part of message.parts) {
    if (part.type === "data-plan" && isAiTravelResponse(part.data)) {
      return part.data
    }
  }
  return null
}

function addPlanToMessages(
  messages: AiTravelPlannerMessage[],
  data: AiTravelResponse,
  fallbackText: string
): AiTravelPlannerMessage[] {
  let attached = false
  const nextMessages = messages.map((message) => {
    if (
      message.role === "assistant" &&
      (message.metadata?.planId === data.planId ||
        message.parts.some(
          (part) =>
            part.type === "data-plan" &&
            isAiTravelResponse(part.data) &&
            part.data.planId === data.planId
        ))
    ) {
      attached = true
      return {
        ...message,
        metadata: { ...message.metadata, planId: data.planId },
        parts: upsertPlanPart(message.parts, data),
      }
    }
    return message
  })

  if (attached) return nextMessages

  return [
    ...nextMessages,
    {
      ...createTextMessage("assistant", fallbackText, { planId: data.planId }),
      parts: [
        { type: "text", text: fallbackText },
        { type: "data-plan", id: "planner-plan", data },
      ],
    },
  ]
}

function upsertPlanPart(
  parts: AiTravelPlannerMessage["parts"],
  data: AiTravelResponse
): AiTravelPlannerMessage["parts"] {
  let replaced = false
  const nextParts = parts.map((part) => {
    if (part.type === "data-plan") {
      replaced = true
      return { ...part, data }
    }
    return part
  })

  if (replaced) return nextParts
  return [...nextParts, { type: "data-plan", id: "planner-plan", data }]
}

function formatSessionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatIntentLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

type GoogleRouteLink = {
  label: string
  href: string
  stopCount: number
}

function routePoint(place: AiTravelPlace) {
  return `${place.latitude},${place.longitude}`
}

function uniquePlacesByIds(
  ids: string[],
  placeMap: Map<string, AiTravelPlace>
): AiTravelPlace[] {
  const seen = new Set<string>()
  return ids
    .map((id) => placeMap.get(id))
    .filter((place): place is AiTravelPlace => {
      if (!place || seen.has(place.googlePlaceId)) return false
      seen.add(place.googlePlaceId)
      return !place.removed
    })
}

function fallbackRouteStops(result: AiTravelResponse): AiTravelPlace[] {
  return [...result.places]
    .filter((place) => !place.removed)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

function buildRouteStops(result: AiTravelResponse): AiTravelPlace[] {
  const placeMap = new Map(
    result.places.map((place) => [place.googlePlaceId, place])
  )
  const itineraryIds =
    result.itinerary?.days.flatMap((day) =>
      [...day.places]
        .sort((a, b) => a.order - b.order)
        .map((place) => place.googlePlaceId)
    ) ?? []
  const stops = uniquePlacesByIds(itineraryIds, placeMap)
  return stops.length >= 2 ? stops : fallbackRouteStops(result)
}

function buildGoogleMapsRouteUrl(stops: AiTravelPlace[]): string | null {
  if (stops.length < 2) return null
  const [origin, ...rest] = stops
  const destination = rest[rest.length - 1]
  if (!origin || !destination) return null
  const waypoints = rest.slice(0, -1)
  const params = new URLSearchParams({
    api: "1",
    origin: routePoint(origin),
    destination: routePoint(destination),
    travelmode: "driving",
  })
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(routePoint).join("|"))
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function buildRouteLinks(
  result: AiTravelResponse,
  copy: PlannerCopy
): GoogleRouteLink[] {
  const links: GoogleRouteLink[] = []
  const allStops = buildRouteStops(result)
  const fullHref = buildGoogleMapsRouteUrl(allStops)
  if (fullHref) {
    links.push({
      label: copy.openFullRoute,
      href: fullHref,
      stopCount: allStops.length,
    })
  }

  const placeMap = new Map(
    result.places.map((place) => [place.googlePlaceId, place])
  )
  const days = result.itinerary?.days ?? []
  if (days.length > 1) {
    for (const day of days) {
      const dayStops = uniquePlacesByIds(
        [...day.places]
          .sort((a, b) => a.order - b.order)
          .map((place) => place.googlePlaceId),
        placeMap
      )
      const href = buildGoogleMapsRouteUrl(dayStops)
      if (href) {
        links.push({
          label: copy.dayRoute(day.day),
          href,
          stopCount: dayStops.length,
        })
      }
    }
  }

  return links
}

export function TravelPlannerView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const plannerSearch = plannerRouteApi.useSearch()
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<AiTravelResponse | null>(null)
  const [activePlanId, setActivePlanId] = useState<string | undefined>(
    () => plannerSearch.planId
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    () => plannerSearch.selected ?? null
  )
  const [selectedPlaceSnapshot, setSelectedPlaceSnapshot] =
    useState<AiTravelPlace | null>(null)
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan")
  const [sessionId, setSessionId] = useState(
    () => plannerSearch.sid ?? createSessionId()
  )
  const [linkCopied, setLinkCopied] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessionToRestore, setSessionToRestore] = useState<string | null>(
    () => plannerSearch.sid ?? null
  )
  const [suppressFirstPromptScroll, setSuppressFirstPromptScroll] =
    useState(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [planPanelOpen, setPlanPanelOpen] = useState(true)
  const planPanelRef = useRef<PanelImperativeHandle>(null)
  const { resolvedTheme } = useTheme()
  const { i18n } = useTranslation()
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en"
  const plannerCopy = useMemo(
    () => getPlannerCopy(currentLanguage),
    [currentLanguage]
  )
  const userLocation = useUserLocation()
  const activePlaceRouteId = useRouterState({
    select: (state) => {
      const match = state.matches.find(
        (routeMatch) =>
          typeof (routeMatch.params as { googlePlaceId?: unknown } | undefined)
            ?.googlePlaceId === "string"
      )
      return (match?.params as { googlePlaceId?: string } | undefined)
        ?.googlePlaceId
    },
  })

  const mapColorScheme =
    resolvedTheme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT

  const restoredPlanQuery = useQuery({
    ...aiTravelPlanQueryOptions(activePlanId ?? ""),
    enabled: Boolean(activePlanId) && result?.planId !== activePlanId,
  })

  const sessionsQuery = useQuery({
    ...aiTravelSessionsQueryOptions(),
    enabled: historyOpen,
  })

  const restoredSessionQuery = useQuery({
    ...aiTravelSessionQueryOptions(sessionToRestore ?? ""),
    enabled: Boolean(sessionToRestore),
    retry: false,
  })

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport<AiTravelPlannerMessage>({
        api: `${envClient.VITE_API_URL}/api/v1/ai/travel/stream`,
        credentials: "include",
      }),
    []
  )

  const {
    messages: chatMessages,
    setMessages: setChatMessages,
    sendMessage,
    status: chatStatus,
    stop: stopChat,
    error: chatError,
    clearError,
  } = useChat<AiTravelPlannerMessage>({
    transport: chatTransport,
    messages: createInitialChatMessages(plannerCopy),
    onError: (error) => toast.error(error.message),
  })

  const chatBusy = chatStatus === "submitted" || chatStatus === "streaming"

  useEffect(() => {
    if (userLocation.error && userLocation.status !== "loading") {
      toast.error(userLocation.error)
    }
  }, [userLocation.error, userLocation.status])

  useEffect(() => {
    setChatMessages((messages) => {
      if (messages.length !== 1) return messages
      const [onlyMessage] = messages
      if (onlyMessage?.role !== "assistant") return messages
      const text = onlyMessage.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
      const knownInitialMessages = [
        getPlannerCopy("en").initialAssistant,
        getPlannerCopy("km").initialAssistant,
      ]
      if (!knownInitialMessages.includes(text)) return messages
      return createInitialChatMessages(plannerCopy)
    })
  }, [plannerCopy, setChatMessages])

  useEffect(() => {
    if (!suppressFirstPromptScroll) return
    const hasAssistantResponse = chatMessages
      .slice(1)
      .some((chatMessage) => chatMessage.role === "assistant")

    if (hasAssistantResponse || (!chatBusy && chatMessages.length > 1)) {
      setSuppressFirstPromptScroll(false)
    }
  }, [chatBusy, chatMessages, suppressFirstPromptScroll])

  const latestPlanDisplay = useMemo(() => {
    let latest: { messageId: string } | null = null
    for (const chatMessage of chatMessages) {
      if (chatMessage.role !== "assistant") continue
      const plan = planFromMessage(chatMessage)
      if (!plan) continue
      latest = {
        messageId: chatMessage.id,
      }
    }
    return latest
  }, [chatMessages])

  const patchPlaceMutation = useMutation({
    mutationFn: ({
      googlePlaceId,
      patch,
    }: {
      googlePlaceId: string
      patch: { saved?: boolean; removed?: boolean }
    }) => {
      if (!result) throw new Error("No active plan")
      return patchAiTravelPlanPlace(result.planId, googlePlaceId, patch)
    },
    onSuccess: (data) => {
      setResult(data)
      setActivePlanId(data.planId)
      setChatMessages((messages) =>
        messages.map((message) => {
          if (
            message.role === "assistant" &&
            (message.metadata?.planId === data.planId ||
              message.parts.some(
                (part) =>
                  part.type === "data-plan" &&
                  isAiTravelResponse(part.data) &&
                  part.data.planId === data.planId
              ))
          ) {
            return {
              ...message,
              metadata: { ...message.metadata, planId: data.planId },
              parts: upsertPlanPart(message.parts, data),
            }
          }
          return message
        })
      )
      if (!data.places.some((place) => place.googlePlaceId === selectedId)) {
        setSelectedId(data.places[0]?.googlePlaceId ?? null)
      }
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const selectedPlace = useMemo(() => {
    if (!selectedId) return undefined
    return (
      result?.places.find((place) => place.googlePlaceId === selectedId) ??
      (selectedPlaceSnapshot?.googlePlaceId === selectedId
        ? selectedPlaceSnapshot
        : undefined)
    )
  }, [result?.places, selectedId, selectedPlaceSnapshot])
  useEffect(() => {
    if (!selectedId) {
      setSelectedPlaceSnapshot(null)
      return
    }

    const place = result?.places.find(
      (nextPlace) => nextPlace.googlePlaceId === selectedId
    )
    if (place) setSelectedPlaceSnapshot(place)
  }, [result?.places, selectedId])

  useEffect(() => {
    if (!activePlaceRouteId) return
    setSelectedId(activePlaceRouteId)
    const place = result?.places.find(
      (nextPlace) => nextPlace.googlePlaceId === activePlaceRouteId
    )
    if (place) setSelectedPlaceSnapshot(place)
  }, [activePlaceRouteId, result?.places])

  useEffect(() => {
    let latestPlan: AiTravelResponse | undefined
    for (const chatMessage of chatMessages) {
      for (const part of chatMessage.parts) {
        if (part.type === "data-plan" && isAiTravelResponse(part.data)) {
          latestPlan = part.data
        }
      }
    }
    if (!latestPlan) return
    const plan = latestPlan

    setResult(plan)
    setSessionId(plan.sessionId)
    setActivePlanId(plan.planId)
    setSelectedId((current) => {
      if (
        current &&
        plan.places.some(
          (place: AiTravelPlace) => place.googlePlaceId === current
        )
      ) {
        return current
      }
      return plan.places[0]?.googlePlaceId ?? null
    })
    void queryClient.invalidateQueries({ queryKey: ["ai-travel-sessions"] })
  }, [chatMessages, queryClient])

  useEffect(() => {
    const data = restoredPlanQuery.data
    if (!data || sessionToRestore) return

    setResult(data)
    setActivePlanId(data.planId)
    setSelectedId((current) => {
      const preferred = current ?? plannerSearch.selected
      if (
        preferred &&
        data.places.some((place) => place.googlePlaceId === preferred)
      ) {
        return preferred
      }
      return data.places[0]?.googlePlaceId ?? null
    })
    setChatMessages((messages) =>
      addPlanToMessages(messages, data, plannerCopy.restoredPlan)
    )
  }, [
    plannerCopy.restoredPlan,
    plannerSearch.selected,
    restoredPlanQuery.data,
    sessionToRestore,
  ])

  useEffect(() => {
    const detail = restoredSessionQuery.data
    if (!detail) return

    setSessionId(detail.id)
    setResult(detail.plan)
    setActivePlanId(detail.activePlanId ?? detail.plan?.planId)
    setSelectedId((current) => {
      if (
        current &&
        detail.plan?.places.some((place) => place.googlePlaceId === current)
      ) {
        return current
      }
      return detail.plan?.places[0]?.googlePlaceId ?? null
    })
    setChatMessages(chatMessagesFromSession(detail, plannerCopy))
    setHistoryOpen(false)
    setSessionToRestore(null)
  }, [plannerCopy, restoredSessionQuery.data])

  useEffect(() => {
    if (restoredSessionQuery.isError) {
      setSessionToRestore(null)
    }
  }, [restoredSessionQuery.isError])

  useEffect(() => {
    navigate({
      to: ".",
      replace: true,
      search: (prev) => ({
        ...prev,
        sid: sessionId,
        planId: activePlanId,
        selected: selectedId ?? undefined,
        chat: undefined,
      }),
    })
  }, [activePlanId, navigate, selectedId, sessionId])

  const submitPrompt = (
    nextMessage = message,
    locationOverride?: { lat: number; lng: number } | null
  ) => {
    const trimmed = nextMessage.trim()
    if (!trimmed || chatBusy) return
    if (chatError) clearError()
    if (
      chatMessages.length === 1 &&
      chatMessages[0]?.role === "assistant" &&
      !result &&
      !activePlanId
    ) {
      setSuppressFirstPromptScroll(true)
    }
    setMessage("")
    void sendMessage(
      { text: trimmed },
      {
        body: {
          planId: result?.planId ?? activePlanId,
          sessionId,
          userLocation:
            locationOverride === undefined
              ? userLocation.position
              : locationOverride,
          language: currentLanguage,
        },
      }
    )
  }

  const planNearbyTour = async () => {
    if (chatBusy || userLocation.status === "loading") return
    const position = userLocation.position ?? (await userLocation.locate())
    if (!position) return
    submitPrompt(plannerCopy.nearbyTourPrompt, position)
  }

  const handlePromptPick = (prompt: string) => {
    if (prompt === plannerCopy.nearbyTourPrompt) {
      void planNearbyTour()
      return
    }
    submitPrompt(prompt)
  }

  const toggleUserLocation = () => {
    if (userLocation.position) {
      userLocation.clear()
      return
    }
    void userLocation.locate()
  }

  const resetSession = () => {
    setMessage("")
    setResult(null)
    setActivePlanId(undefined)
    setSelectedId(null)
    setSelectedPlaceSnapshot(null)
    setSessionId(createSessionId())
    setChatMessages(createInitialChatMessages(plannerCopy))
    setSessionToRestore(null)
    if (chatError) clearError()
  }

  const deleteSessionMutation = useMutation({
    mutationFn: deleteAiTravelSession,
    onSuccess: ({ id }) => {
      queryClient.setQueryData<AiTravelSessionSummary[]>(
        ["ai-travel-sessions"],
        (sessions) => sessions?.filter((session) => session.id !== id) ?? []
      )
      queryClient.removeQueries({ queryKey: ["ai-travel-session", id] })
      if (id === sessionId) resetSession()
      toast.success(plannerCopy.sessionDeleted)
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const deleteSessionsMutation = useMutation({
    mutationFn: deleteAiTravelSessions,
    onSuccess: ({ deletedCount }) => {
      queryClient.setQueryData<AiTravelSessionSummary[]>(
        ["ai-travel-sessions"],
        []
      )
      queryClient.removeQueries({ queryKey: ["ai-travel-session"] })
      resetSession()
      toast.success(
        deletedCount === 1
          ? plannerCopy.sessionDeleted
          : plannerCopy.historyDeleted
      )
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const copySessionLink = async () => {
    if (typeof window === "undefined") return
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      toast.success(plannerCopy.sessionLinkCopied)
      window.setTimeout(() => setLinkCopied(false), 1600)
    } catch {
      toast.error(plannerCopy.copyFailed)
    }
  }

  const selectPlace = (googlePlaceId: string) => {
    setSelectedId(googlePlaceId)
    const place = result?.places.find(
      (nextPlace) => nextPlace.googlePlaceId === googlePlaceId
    )
    if (place) setSelectedPlaceSnapshot(place)
  }

  const openPlaceDetail = (place: AiTravelPlace) => {
    selectPlace(place.googlePlaceId)
    navigate({
      to: "/planner/place/$googlePlaceId/modal",
      params: { googlePlaceId: place.googlePlaceId },
      search: (prev) => prev,
      mask: {
        to: "/planner/place/$googlePlaceId",
        params: { googlePlaceId: place.googlePlaceId },
        search: (prev) => prev,
      },
    })
  }

  const plannerContext = useMemo<TravelPlannerContextValue>(
    () => ({
      getPlaceById: (googlePlaceId) =>
        result?.places.find((place) => place.googlePlaceId === googlePlaceId) ??
        (selectedPlaceSnapshot?.googlePlaceId === googlePlaceId
          ? selectedPlaceSnapshot
          : null),
      saving: patchPlaceMutation.isPending,
      onSavePlace: (place) =>
        patchPlaceMutation.mutate({
          googlePlaceId: place.googlePlaceId,
          patch: { saved: !place.saved },
        }),
      onRemovePlace: (place) =>
        patchPlaceMutation.mutate({
          googlePlaceId: place.googlePlaceId,
          patch: { removed: true },
        }),
    }),
    [patchPlaceMutation, result?.places, selectedPlaceSnapshot]
  )

  const togglePlanPanel = () => {
    const panel = planPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
      setPlanPanelOpen(true)
      return
    }
    panel.collapse()
    setPlanPanelOpen(false)
  }

  const planPanelToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0"
      onClick={togglePlanPanel}
      aria-label={planPanelOpen ? "Hide planner panel" : "Show planner panel"}
      title={planPanelOpen ? "Hide planner panel" : "Show planner panel"}
    >
      {planPanelOpen ? (
        <PanelRightClose className="size-4" />
      ) : (
        <PanelRightOpen className="size-4" />
      )}
    </Button>
  )

  const mapElement = (
    <PlannerMap
      result={result}
      selectedId={selectedId}
      userLocation={userLocation.position}
      colorScheme={mapColorScheme}
      onOpenPlace={openPlaceDetail}
    />
  )

  const planPanel = (
    <aside className="flex h-full min-h-0 flex-col pb-24 md:pb-0">
      <SessionHeader
        sessionId={sessionId}
        destination={result?.destination}
        restoring={restoredPlanQuery.isFetching}
        copied={linkCopied}
        historyOpen={historyOpen}
        historyLoading={
          sessionsQuery.isFetching || restoredSessionQuery.isFetching
        }
        hidden={false}
        sessions={sessionsQuery.data ?? []}
        copy={plannerCopy}
        deletingSessionId={
          deleteSessionMutation.isPending
            ? (deleteSessionMutation.variables ?? null)
            : null
        }
        deletingAllSessions={deleteSessionsMutation.isPending}
        onHistoryOpenChange={setHistoryOpen}
        onRestoreSession={setSessionToRestore}
        onDeleteSession={(nextSessionId) =>
          deleteSessionMutation.mutate(nextSessionId)
        }
        onDeleteAllSessions={() => deleteSessionsMutation.mutate()}
        onCopy={copySessionLink}
        onReset={resetSession}
      />

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="planner-chat-scroll p-4">
          {chatMessages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquare className="size-10" />}
              title={plannerCopy.emptyTitle}
              description={plannerCopy.emptyDescription}
            />
          ) : (
            chatMessages.map((chatMessage, index) => (
              <PlannerChatMessage
                key={chatMessage.id}
                message={chatMessage}
                index={index}
                showPlan={chatMessage.id === latestPlanDisplay?.messageId}
                copy={plannerCopy}
                selectedId={selectedId}
                saving={patchPlaceMutation.isPending}
                onSelect={selectPlace}
                onOpenPlace={openPlaceDetail}
                onSave={(place) =>
                  patchPlaceMutation.mutate({
                    googlePlaceId: place.googlePlaceId,
                    patch: { saved: !place.saved },
                  })
                }
                onRemove={(place) =>
                  patchPlaceMutation.mutate({
                    googlePlaceId: place.googlePlaceId,
                    patch: { removed: true },
                  })
                }
              />
            ))
          )}

          {chatStatus === "submitted" && (
            <PlannerStatusMessage label={plannerCopy.planning} />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border/60 p-4 md:p-5">
        <PromptChips
          prompts={
            result ? plannerCopy.followUpPrompts : plannerCopy.starterPrompts
          }
          loading={chatBusy}
          onPick={handlePromptPick}
        />
        {/* {result && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3].map((days) => (
              <Button
                key={days}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => generateItinerary(days)}
                disabled={chatBusy}
              >
                <CalendarDays className="size-4" />
                {days} day{days === 1 ? "" : "s"}
              </Button>
            ))}
          </div>
        )} */}
        <PromptInput
          className={cn(
            "planner-composer mt-3",
            message.trim() && "planner-composer-active"
          )}
          onSubmit={(prompt: PromptInputMessage) => submitPrompt(prompt.text)}
        >
          <PromptInputBody>
            <PromptInputTextarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={plannerCopy.inputPlaceholder}
              className="max-h-36 min-h-12 p-2"
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-between gap-2 p-2">
            <Button
              type="button"
              variant={userLocation.position ? "secondary" : "ghost"}
              size="xs"
              disabled={chatBusy || userLocation.status === "loading"}
              aria-pressed={Boolean(userLocation.position)}
              aria-label={
                userLocation.position
                  ? plannerCopy.disableLocation
                  : plannerCopy.useCurrentLocation
              }
              title={
                userLocation.position
                  ? plannerCopy.disableLocation
                  : plannerCopy.useCurrentLocation
              }
              onClick={toggleUserLocation}
            >
              {userLocation.status === "loading" ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <LocateFixed className="size-3.5" />
              )}
              <span className="max-w-36 truncate">
                {userLocation.status === "loading"
                  ? plannerCopy.locating
                  : userLocation.position
                    ? plannerCopy.locationEnabled
                    : plannerCopy.useCurrentLocation}
              </span>
            </Button>
            <PromptInputSubmit
              status={chatStatus}
              onStop={stopChat}
              disabled={!message.trim() && !chatBusy}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </aside>
  )

  if (isDesktop) {
    return (
      <TravelPlannerContext.Provider value={plannerContext}>
        <div className="h-svh">
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel defaultSize="62%" minSize="30%">
              <div className="flex h-full min-h-0 flex-col">
                <Header sidePanelControl={planPanelToggle} />
                <div className="relative min-h-0 flex-1">
                  {mapElement}
                  {selectedPlace && (
                    <SelectedPlaceOverlay
                      place={selectedPlace}
                      copy={plannerCopy}
                      onOpen={() => openPlaceDetail(selectedPlace)}
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className={cn(!planPanelOpen && "pointer-events-none opacity-0")}
            />
            <ResizablePanel
              panelRef={planPanelRef}
              collapsible
              collapsedSize={0}
              defaultSize="38%"
              minSize="26%"
              maxSize="62%"
              onResize={(size) => setPlanPanelOpen(size.asPercentage > 0.5)}
            >
              <div className="glass-panel m-3 h-[calc(100%-1.5rem)] rounded-lg">
                {planPanel}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <Outlet />
      </TravelPlannerContext.Provider>
    )
  }

  return (
    <TravelPlannerContext.Provider value={plannerContext}>
      <div className="relative h-svh overflow-hidden md:h-[calc(100svh-3.5rem)]">
        <Header />
        <div className="absolute inset-0">{mapElement}</div>
        {selectedPlace && mobileView === "map" && (
          <SelectedPlaceOverlay
            place={selectedPlace}
            copy={plannerCopy}
            onOpen={() => openPlaceDetail(selectedPlace)}
          />
        )}
        <div
          className={cn(
            "glass-panel-strong mobile-chrome-pt absolute inset-0 overflow-hidden rounded-t-lg transition-transform duration-300 ease-out",
            mobileView === "plan" ? "translate-y-0" : "translate-y-full"
          )}
        >
          {planPanel}
        </div>
        <button
          type="button"
          className="mobile-action-bottom glass-panel-strong absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background"
          onClick={() =>
            setMobileView((view) => (view === "plan" ? "map" : "plan"))
          }
          aria-label={
            mobileView === "plan" ? plannerCopy.showMap : plannerCopy.showPlan
          }
        >
          {mobileView === "plan" ? (
            <>
              <MapPinned className="size-4" />
              {plannerCopy.showMap}
            </>
          ) : (
            <>
              <List className="size-4" />
              {plannerCopy.showPlan}
            </>
          )}
        </button>
      </div>
      <Outlet />
    </TravelPlannerContext.Provider>
  )
}

function SessionHeader({
  sessionId,
  destination,
  restoring,
  copied,
  historyOpen,
  historyLoading,
  hidden,
  sessions,
  copy,
  deletingSessionId,
  deletingAllSessions,
  onHistoryOpenChange,
  onRestoreSession,
  onDeleteSession,
  onDeleteAllSessions,
  onCopy,
  onReset,
}: {
  sessionId: string
  destination?: string | null
  restoring: boolean
  copied: boolean
  historyOpen: boolean
  historyLoading: boolean
  hidden: boolean
  sessions: AiTravelSessionSummary[]
  copy: PlannerCopy
  deletingSessionId: string | null
  deletingAllSessions: boolean
  onHistoryOpenChange: (open: boolean) => void
  onRestoreSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onDeleteAllSessions: () => void
  onCopy: () => void
  onReset: () => void
}) {
  const [sessionToDelete, setSessionToDelete] =
    useState<AiTravelSessionSummary | null>(null)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const deletePending = Boolean(deletingSessionId) || deletingAllSessions

  return (
    <TooltipProvider>
      <Sheet open={historyOpen} onOpenChange={onHistoryOpenChange}>
        <div
          className={cn(
            "planner-session-header border-b border-border/60 px-2 py-1.5",
            hidden && "planner-session-header-hidden"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="planner-session-avatar">
                <Sparkles className="size-3.5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight">
                  {copy.aiPlanner}
                </h1>
                {/* <div className="hidden min-w-0 items-center gap-1.5 text-[0.6875rem] text-muted-foreground sm:flex">
                  <span className="truncate">{sessionId.slice(0, 8)}</span>
                  <span aria-hidden>•</span>
                  <span>{messageCount} msgs</span>
                  {placeCount > 0 && (
                    <>
                      <span aria-hidden>•</span>
                      <span>{placeCount} places</span>
                    </>
                  )}
                </div> */}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {destination && (
                <Badge
                  variant="secondary"
                  className="hidden h-6 max-w-24 truncate px-2 text-[0.6875rem] sm:inline-flex"
                >
                  {destination}
                </Badge>
              )}
              {(restoring || historyLoading) && (
                <span className="planner-sync-dot" aria-label="Loading" />
              )}
              <Tooltip>
                <TooltipTrigger
                  render={<Button type="button" variant="ghost" size="icon" />}
                  aria-label="Open planner history"
                  onClick={() => onHistoryOpenChange(true)}
                >
                  <History className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{copy.history}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button type="button" variant="ghost" size="icon" />}
                  aria-label="Copy session link"
                  onClick={onCopy}
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </TooltipTrigger>
                <TooltipContent>{copy.copySessionLink}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button type="button" variant="ghost" size="icon" />}
                  aria-label="Start a new session"
                  onClick={onReset}
                >
                  <RefreshCcw className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{copy.newSession}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="flex w-80 flex-col gap-0 p-0"
        >
          <SheetHeader className="flex-row items-center justify-between gap-3 border-b p-4">
            <SheetTitle className="text-left text-base tracking-normal normal-case">
              {copy.plannerHistory}
            </SheetTitle>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="destructive"
                size="xs"
                disabled={
                  sessions.length === 0 || historyLoading || deletePending
                }
                onClick={() => setDeleteAllOpen(true)}
              >
                <Trash2 className="size-3.5" />
                {copy.deleteAll}
              </Button>
              <SheetClose
                render={<Button type="button" variant="ghost" size="icon-xs" />}
                aria-label={copy.closeHistory}
              >
                <X className="size-3.5" />
              </SheetClose>
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {historyLoading && sessions.length === 0 ? (
              <div className="px-2 py-8 text-sm text-muted-foreground">
                {copy.loading}
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-2 py-8 text-sm text-muted-foreground">
                {copy.noSessions}
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg border border-border/60 p-3 transition-colors",
                      "hover:bg-muted/60",
                      session.id === sessionId &&
                        "border-primary/40 bg-primary/10"
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      disabled={deletePending}
                      onClick={() => onRestoreSession(session.id)}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {session.title}
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {session.destination && (
                              <span className="truncate">
                                {session.destination}
                              </span>
                            )}
                            {session.destination && <span aria-hidden>•</span>}
                            <span>
                              {session.messageCount} {copy.messages}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                          {formatSessionDate(session.updatedAt)}
                        </span>
                      </div>
                    </button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-destructive"
                          />
                        }
                        aria-label={`${copy.deleteSession}: ${session.title}`}
                        disabled={deletePending}
                        onClick={(event) => {
                          event.stopPropagation()
                          setSessionToDelete(session)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{copy.deleteSession}</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(sessionToDelete)}
        onOpenChange={(open) => {
          if (!open) setSessionToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.deleteSessionTitle}</DialogTitle>
            <DialogDescription>
              {copy.deleteSessionDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {copy.cancel}
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={!sessionToDelete || deletePending}
              onClick={() => {
                if (!sessionToDelete) return
                onDeleteSession(sessionToDelete.id)
                setSessionToDelete(null)
              }}
            >
              <Trash2 className="size-4" />
              {copy.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.deleteAllTitle}</DialogTitle>
            <DialogDescription>{copy.deleteAllDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {copy.cancel}
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={sessions.length === 0 || deletePending}
              onClick={() => {
                onDeleteAllSessions()
                setDeleteAllOpen(false)
              }}
            >
              <Trash2 className="size-4" />
              {copy.deleteAll}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

function PromptChips({
  prompts,
  loading,
  onPick,
}: {
  prompts: string[]
  loading: boolean
  onPick: (message: string) => void
}) {
  return (
    <Suggestions>
      {prompts.map((prompt) => (
        <Suggestion
          key={prompt}
          suggestion={prompt}
          disabled={loading}
          onClick={onPick}
          variant="secondary"
          size="xs"
        />
      ))}
    </Suggestions>
  )
}

function PlannerChatMessage({
  message,
  index,
  showPlan,
  copy,
  selectedId,
  saving,
  onSelect,
  onOpenPlace,
  onSave,
  onRemove,
}: {
  message: AiTravelPlannerMessage
  index: number
  showPlan: boolean
  copy: PlannerCopy
  selectedId: string | null
  saving: boolean
  onSelect: (id: string) => void
  onOpenPlace: (place: AiTravelPlace) => void
  onSave: (place: AiTravelPlace) => void
  onRemove: (place: AiTravelPlace) => void
}) {
  const isUser = message.role === "user"
  const hasPlan = message.parts.some(
    (part) => part.type === "data-plan" && isAiTravelResponse(part.data)
  )
  const hasVisiblePlan = hasPlan && showPlan
  const hasFinalText = message.parts.some(
    (part) => part.type === "text" && part.text.trim()
  )
  const hasVisibleStatus = message.parts.some(
    (part) =>
      part.type === "data-status" &&
      isPlannerStatusData(part.data) &&
      !hasVisiblePlan &&
      !hasFinalText &&
      !message.metadata?.error &&
      part.data.step !== "complete"
  )

  if (!hasFinalText && !hasVisiblePlan && !hasVisibleStatus) return null

  return (
    <Message
      from={message.role}
      className={cn("planner-chat-row", hasVisiblePlan && "max-w-full")}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <MessageContent
        className={cn(
          "planner-chat-bubble",
          isUser && "planner-chat-bubble-user",
          hasVisiblePlan && "w-full"
        )}
      >
        {message.parts.map((part, partIndex) => {
          if (part.type === "text") {
            return (
              <MessageResponse key={`${message.id}-${partIndex}`}>
                {part.text}
              </MessageResponse>
            )
          }

          if (part.type === "data-status" && isPlannerStatusData(part.data)) {
            if (
              hasVisiblePlan ||
              hasFinalText ||
              message.metadata?.error ||
              part.data.step === "complete"
            ) {
              return null
            }

            return (
              <PlannerStatusCard
                key={`${message.id}-${part.id ?? partIndex}`}
                label={part.data.label}
              />
            )
          }

          if (part.type === "data-plan" && isAiTravelResponse(part.data)) {
            if (!showPlan) return null

            return (
              <PlanResultContent
                key={`${message.id}-${part.id ?? partIndex}`}
                result={part.data}
                copy={copy}
                selectedId={selectedId}
                saving={saving}
                onSelect={onSelect}
                onOpenPlace={onOpenPlace}
                onSave={onSave}
                onRemove={onRemove}
              />
            )
          }

          return null
        })}
      </MessageContent>
    </Message>
  )
}

function PlannerStatusMessage({ label }: { label: string }) {
  return (
    <Message from="assistant" className="planner-chat-row">
      <MessageContent>
        <PlannerStatusCard label={label} />
      </MessageContent>
    </Message>
  )
}

function PlannerStatusCard({ label }: { label: string }) {
  return (
    <div className="planner-thinking-card rounded-lg px-3 py-3 text-sm text-muted-foreground">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <span className="animate-pulse font-medium text-foreground">
          {label}
        </span>
      </div>
      <div className="planner-typing-dots" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function PlanResultContent({
  result,
  copy,
  selectedId,
  saving,
  onSelect,
  onOpenPlace,
  onSave,
  onRemove,
}: {
  result: AiTravelResponse
  copy: PlannerCopy
  selectedId: string | null
  saving: boolean
  onSelect: (id: string) => void
  onOpenPlace: (place: AiTravelPlace) => void
  onSave: (place: AiTravelPlace) => void
  onRemove: (place: AiTravelPlace) => void
}) {
  const routeLinks = buildRouteLinks(result, copy)

  return (
    <div className="mt-5 space-y-6">
      <section className="rounded-md border border-border/60 bg-muted/15 px-2.5 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Badge>
                <Sparkles className="size-3 text-primary" />
                {formatIntentLabel(result.intent)}
              </Badge>
              {result.destination && (
                <Badge variant="secondary">{result.destination}</Badge>
              )}
            </div>
            <h4 className="line-clamp-2 text-sm leading-snug font-semibold">
              {result.title}
            </h4>
          </div>
          {routeLinks.length > 0 && <PlannerRouteLinks links={routeLinks} />}
        </div>
      </section>

      {result.itinerary && (
        <PlannerItineraryTimeline
          result={result}
          copy={copy}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpenPlace={onOpenPlace}
        />
      )}

      <PlannerPlaceSuggestions
        result={result}
        copy={copy}
        selectedId={selectedId}
        saving={saving}
        onSelect={onSelect}
        onOpenPlace={onOpenPlace}
        onSave={onSave}
        onRemove={onRemove}
      />
    </div>
  )
}

function PlannerPlaceSuggestions({
  result,
  copy,
  selectedId,
  saving,
  onSelect,
  onOpenPlace,
  onSave,
  onRemove,
}: {
  result: AiTravelResponse
  copy: PlannerCopy
  selectedId: string | null
  saving: boolean
  onSelect: (id: string) => void
  onOpenPlace: (place: AiTravelPlace) => void
  onSave: (place: AiTravelPlace) => void
  onRemove: (place: AiTravelPlace) => void
}) {
  const [showAllPlaces, setShowAllPlaces] = useState(false)
  const placeCount = result.groups.reduce(
    (total, group) => total + group.places.length,
    0
  )
  const visibleLimit = 2
  const remainingCount = Math.max(0, placeCount - visibleLimit)
  const visibleGroups = showAllPlaces
    ? result.groups
    : result.groups.reduce<AiTravelResponse["groups"]>((groups, group) => {
        const visibleCount = groups.reduce(
          (total, visibleGroup) => total + visibleGroup.places.length,
          0
        )
        const slotsLeft = visibleLimit - visibleCount
        if (slotsLeft <= 0) return groups
        const places = group.places.slice(0, slotsLeft)
        if (places.length === 0) return groups
        return [...groups, { ...group, places }]
      }, [])

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {copy.placeSuggestions}
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            ({placeCount})
          </span>
        </h3>
      </div>
      <div className="space-y-2">
        {visibleGroups.map((group) => (
          <section key={group.category} className="space-y-2">
            <h4 className="text-sm font-semibold">{group.category}</h4>
            <div className="space-y-1">
              {group.places.map((place) => (
                <PlannerPlaceCard
                  key={place.googlePlaceId}
                  place={place}
                  active={place.googlePlaceId === selectedId}
                  saving={saving}
                  copy={copy}
                  onSelect={() => onSelect(place.googlePlaceId)}
                  onOpen={() => onOpenPlace(place)}
                  onSave={() => onSave(place)}
                  onRemove={() => onRemove(place)}
                />
              ))}
            </div>
          </section>
        ))}
        {remainingCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-full"
            onClick={() => setShowAllPlaces((current) => !current)}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {showAllPlaces
                ? copy.showFewerPlaces
                : copy.showMorePlaces(remainingCount)}
            </p>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                showAllPlaces && "rotate-180"
              )}
            />
          </Button>
        )}
      </div>
    </section>
  )
}

function PlannerItineraryTimeline({
  result,
  copy,
  selectedId,
  onSelect,
  onOpenPlace,
}: {
  result: AiTravelResponse
  copy: PlannerCopy
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenPlace: (place: AiTravelPlace) => void
}) {
  const placeMap = new Map(
    result.places.map((place) => [place.googlePlaceId, place])
  )
  const days = result.itinerary?.days ?? []

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{copy.itinerary}</h3>
        <Badge variant="outline" className="text-[11px]">
          {days.length} {copy.days}
        </Badge>
      </div>
      <div className="space-y-2">
        {days.map((day) => {
          const sortedPlaces = [...day.places].sort((a, b) => a.order - b.order)

          return (
            <div
              key={day.day}
              className="rounded-lg border border-border/60 bg-muted/20 p-2.5"
            >
              <div className="mb-2 flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 text-xs font-semibold text-primary">
                  {copy.day} {day.day}
                </span>
                <h4 className="min-w-0 truncate text-sm font-semibold">
                  {day.title}
                </h4>
              </div>
              <ol className="space-y-0.5">
                {sortedPlaces.map((place, placeIndex) => {
                  const fullPlace = placeMap.get(place.googlePlaceId)
                  const selected = selectedId === place.googlePlaceId
                  const stopLabel = place.startTime ?? `${place.order}`

                  return (
                    <li
                      key={`${day.day}-${place.googlePlaceId}`}
                      className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-2"
                    >
                      <div className="relative flex justify-end">
                        {placeIndex < sortedPlaces.length - 1 && (
                          <span className="absolute top-5 right-[1.15rem] bottom-[-0.35rem] w-px bg-border" />
                        )}
                        <span
                          className={cn(
                            "relative z-10 flex h-6 min-w-10 items-center justify-center rounded-md border bg-background px-1.5 text-[11px] leading-none font-semibold tabular-nums",
                            selected
                              ? "border-primary/50 text-primary"
                              : "text-muted-foreground"
                          )}
                        >
                          {stopLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={cn(
                          "min-w-0 rounded-md px-2 py-1 text-left transition-colors",
                          fullPlace &&
                            "hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:outline-none",
                          selected && "bg-primary/10"
                        )}
                        disabled={!fullPlace}
                        onClick={() => {
                          if (!fullPlace) return
                          onSelect(fullPlace.googlePlaceId)
                          onOpenPlace(fullPlace)
                        }}
                      >
                        <span className="block truncate text-sm font-medium">
                          {place.name}
                        </span>
                        {place.notes && (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {place.notes}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PlannerRouteLinks({ links }: { links: Array<GoogleRouteLink> }) {
  const totalStopCount = links[0]?.stopCount ?? links.length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-6 rounded-md px-2 text-[10px] tracking-wide text-muted-foreground"
          />
        }
        aria-label="Open Google Maps routes"
      >
        <ExternalLink className="size-3" />
        Google Maps
        <span className="text-current/60">({totalStopCount})</span>
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 min-w-52 rounded-md">
        {links.map((link) => (
          <DropdownMenuItem
            key={link.label}
            render={<a href={link.href} target="_blank" rel="noreferrer" />}
            aria-label={`${link.label} (${link.stopCount})`}
          >
            <ExternalLink className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{link.label}</span>
            <span className="ml-auto text-current/60">({link.stopCount})</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PlannerPlaceCard({
  place,
  active,
  saving,
  copy,
  onSelect,
  onOpen,
  onSave,
  onRemove,
}: {
  place: AiTravelPlace
  active: boolean
  saving: boolean
  copy: PlannerCopy
  onSelect: () => void
  onOpen: () => void
  onSave: () => void
  onRemove: () => void
}) {
  const distanceLabel = copy.distanceAway(place.distanceMeters)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      className={cn(
        "rounded-md border border-border/70 bg-background p-2 text-sm transition-colors",
        "hover:border-border hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        active && "border-primary/45 bg-primary/5"
      )}
      onClick={() => {
        onSelect()
        onOpen()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect()
          onOpen()
        }
      }}
    >
      <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-2">
        <PlannerPlaceImage place={place} />
        <div className="min-w-0">
          <h4 className="line-clamp-1 text-[13px] leading-snug font-semibold">
            {place.name}
          </h4>
          {place.address && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
              {place.address}
            </p>
          )}
          {distanceLabel && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-primary">
              <LocateFixed className="size-3" />
              {distanceLabel}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end self-stretch">
          {place.rating != null && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-muted-foreground">
              <Star className="size-3 fill-current text-amber-500" />
              {place.rating.toFixed(1)}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="mt-auto size-6 rounded-md p-0 text-muted-foreground"
                />
              }
              aria-label="Place actions"
              onClick={(event) => event.stopPropagation()}
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-36 min-w-36 rounded-md"
            >
              <DropdownMenuItem
                disabled={saving}
                onClick={(event) => {
                  event.stopPropagation()
                  onSave()
                }}
              >
                {place.saved ? (
                  <BookmarkCheck className="size-3.5" />
                ) : (
                  <Bookmark className="size-3.5" />
                )}
                {place.saved ? copy.saved : copy.save}
              </DropdownMenuItem>
              {place.googleMapsUri && (
                <DropdownMenuItem
                  render={
                    <a
                      href={place.googleMapsUri}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="size-3.5" />
                  {copy.maps}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                disabled={saving}
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove()
                }}
              >
                <Trash2 className="size-3.5" />
                {copy.remove}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export function PlannerPlaceDetailDialog({
  place,
  open,
  saving,
  onOpenChange,
  onSave,
  onRemove,
}: {
  place: AiTravelPlace | null
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (place: AiTravelPlace) => void
  onRemove: (place: AiTravelPlace) => void
}) {
  const { i18n } = useTranslation()
  const copy = getPlannerCopy(i18n.resolvedLanguage ?? i18n.language ?? "en")
  const isKhmer = isKhmerLanguage(
    i18n.resolvedLanguage ?? i18n.language ?? "en"
  )
  const distanceLabel = copy.distanceAway(place?.distanceMeters ?? null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-hidden rounded-lg p-0 sm:max-w-3xl">
        {place && (
          <div className="flex max-h-[92svh] flex-col">
            <div className="relative h-56 shrink-0 overflow-hidden bg-muted sm:h-72">
              {place.photoUrl ? (
                <img
                  src={place.photoUrl}
                  alt={place.name}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <MapPinned className="size-8" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/65 to-transparent p-5 pt-14 text-white">
                <DialogHeader>
                  <DialogTitle className="font-sans text-2xl leading-tight tracking-tight text-white normal-case">
                    {place.name}
                  </DialogTitle>
                  {place.address && (
                    <DialogDescription className="flex items-start gap-2 text-white/80">
                      <MapPinned className="mt-0.5 size-4 shrink-0" />
                      <span>{place.address}</span>
                    </DialogDescription>
                  )}
                </DialogHeader>
              </div>
              {place.rating != null && (
                <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-md bg-background/95 px-2.5 py-1.5 text-sm font-semibold text-foreground shadow-sm">
                  <Star className="size-4 fill-current text-amber-500" />
                  {place.rating.toFixed(1)}
                  {place.userRatingCount != null && (
                    <span className="font-normal text-muted-foreground">
                      ({place.userRatingCount.toLocaleString()})
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {place.reason && (
                <section className="space-y-1.5">
                  <h3 className="text-sm font-semibold">{copy.whyVisit}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {place.reason}
                  </p>
                </section>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {distanceLabel && (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      {copy.distance}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                      <LocateFixed className="size-3.5 text-primary" />
                      {distanceLabel}
                    </div>
                  </div>
                )}
                {place.category && (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      {isKhmer ? "ប្រភេទ" : "Category"}
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {place.category}
                    </div>
                  </div>
                )}
                {place.types.length > 0 && (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      {isKhmer ? "ស្លាក" : "Tags"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {place.types.slice(0, 4).map((type) => (
                        <span
                          key={type}
                          className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground"
                        >
                          {formatIntentLabel(type)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border/70 bg-background/95 p-3 sm:justify-start">
              <Button
                type="button"
                variant={place.saved ? "secondary" : "outline"}
                disabled={saving}
                onClick={() => onSave(place)}
              >
                {place.saved ? (
                  <BookmarkCheck className="size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
                {place.saved ? copy.saved : copy.save}
              </Button>
              {place.googleMapsUri && (
                <a
                  href={place.googleMapsUri}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    variant: "outline",
                  })}
                >
                  <ExternalLink className="size-4" />
                  {copy.maps}
                </a>
              )}
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                disabled={saving}
                onClick={() => onRemove(place)}
              >
                <Trash2 className="size-4" />
                {copy.remove}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PlannerPlaceImage({ place }: { place: AiTravelPlace }) {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : place.photoUrl

  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-muted">
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
          <MapPinned className="size-4" />
        </div>
      )}
    </div>
  )
}

function PlannerMap({
  result,
  selectedId,
  userLocation,
  colorScheme,
  onOpenPlace,
}: {
  result: AiTravelResponse | null
  selectedId: string | null
  userLocation: { lat: number; lng: number } | null
  colorScheme: ColorScheme
  onOpenPlace: (place: AiTravelPlace) => void
}) {
  const center = result?.map.center ?? userLocation ?? DEFAULT_CENTER
  const zoom = result?.map.zoom ?? DEFAULT_ZOOM
  const places = result?.places.filter((place) => !place.removed) ?? []
  const mapKey = `${result?.planId ?? "empty"}-${center.lat}-${center.lng}-${places.length}`

  return (
    <GoogleMap
      key={mapKey}
      mapId={MAP_ID}
      defaultCenter={center}
      defaultZoom={zoom}
      gestureHandling="greedy"
      disableDefaultUI
      colorScheme={colorScheme}
      className="h-full w-full"
    >
      {places.map((place) => (
        <AdvancedMarker
          key={place.googlePlaceId}
          position={{ lat: place.latitude, lng: place.longitude }}
        >
          <PlannerMapMarker
            place={place}
            active={selectedId === place.googlePlaceId}
            onOpen={() => onOpenPlace(place)}
          />
        </AdvancedMarker>
      ))}
      {userLocation && <UserLocationMarker position={userLocation} />}
    </GoogleMap>
  )
}

function PlannerMapMarker({
  place,
  active,
  onOpen,
}: {
  place: AiTravelPlace
  active: boolean
  onOpen: () => void
}) {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : place.photoUrl

  return (
    <button
      type="button"
      className={cn(
        "glass-control flex size-11 items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-primary text-xs font-semibold text-primary-foreground",
        "hover:z-10",
        active && "z-20 ring-2 ring-primary"
      )}
      aria-label={place.name}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      {src ? (
        <img
          src={src}
          alt={place.name}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        (place.order ?? <MapPinned className="size-4" />)
      )}
    </button>
  )
}

function SelectedPlaceOverlay({
  place,
  copy,
  onOpen,
}: {
  place: AiTravelPlace
  copy: PlannerCopy
  onOpen: () => void
}) {
  return (
    <div className="pointer-events-none absolute right-4 bottom-24 left-4 z-10 md:bottom-6 md:left-auto md:w-80">
      <Card
        role="button"
        tabIndex={0}
        className="glass-panel-strong pointer-events-auto rounded-lg p-3"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onOpen()
          }
        }}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            {place.photoUrl ? (
              <img
                src={place.photoUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              (place.order ?? <MapPinned className="size-4" />)
            )}
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-sm font-medium">{place.name}</h3>
            {place.address && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {place.address}
              </p>
            )}
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
              {copy.details}
              <ExternalLink className="size-3" />
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
