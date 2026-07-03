import { useEffect, useMemo, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { AdvancedMarker, ColorScheme, Map } from "@vis.gl/react-google-maps"
import { useTheme } from "next-themes"
import {
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  History,
  List,
  MapPinned,
  MessageSquare,
  RefreshCcw,
  Route,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { patchAiTravelPlanPlace } from "@/api/ai-travel.api"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Sheet,
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
import { cn } from "@/lib/utils"
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
const STARTER_PROMPTS = [
  "Recommend places to visit in Siem Reap",
  "Plan 3 days in Siem Reap",
  "Best local food in Siem Reap",
]
const INITIAL_ASSISTANT_MESSAGE =
  "Tell me where you want to go, how long you have, or what kind of trip you want. I will build a plan and keep refining it here."

const plannerRouteApi = getRouteApi("/_authed/planner")

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

function createInitialChatMessages(): AiTravelPlannerMessage[] {
  return [createTextMessage("assistant", INITIAL_ASSISTANT_MESSAGE)]
}

function chatMessagesFromSession(
  detail: AiTravelSessionDetail
): AiTravelPlannerMessage[] {
  const messages = detail.messages.map((message): AiTravelPlannerMessage => {
    const parts: AiTravelPlannerMessage["parts"] = [
      { type: "text", text: message.content },
    ]
    if (
      message.role === "assistant" &&
      detail.plan &&
      message.planId === detail.plan.planId
    ) {
      parts.push({
        type: "data-plan",
        id: "planner-plan",
        data: detail.plan,
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

  return messages.length > 0 ? messages : createInitialChatMessages()
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
  const [placeDetail, setPlaceDetail] = useState<AiTravelPlace | null>(null)
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan")
  const [sessionId, setSessionId] = useState(
    () => plannerSearch.sid ?? createSessionId()
  )
  const [linkCopied, setLinkCopied] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessionToRestore, setSessionToRestore] = useState<string | null>(
    () => plannerSearch.sid ?? null
  )
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const { resolvedTheme } = useTheme()
  const { i18n } = useTranslation()

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
    messages: createInitialChatMessages(),
    onError: (error) => toast.error(error.message),
  })

  const chatBusy = chatStatus === "submitted" || chatStatus === "streaming"

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
      setPlaceDetail((current) =>
        current
          ? (data.places.find(
              (place) => place.googlePlaceId === current.googlePlaceId
            ) ?? null)
          : null
      )
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
  const detailPlace = useMemo(() => {
    if (!placeDetail) return null
    return (
      result?.places.find(
        (place) => place.googlePlaceId === placeDetail.googlePlaceId
      ) ?? placeDetail
    )
  }, [placeDetail, result?.places])

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
    setPlaceDetail((current) =>
      current
        ? (plan.places.find(
            (place) => place.googlePlaceId === current.googlePlaceId
          ) ?? null)
        : null
    )
    void queryClient.invalidateQueries({ queryKey: ["ai-travel-sessions"] })
  }, [chatMessages, queryClient])

  useEffect(() => {
    if (chatError) {
      toast.error(chatError.message)
    }
  }, [chatError])

  useEffect(() => {
    const data = restoredPlanQuery.data
    if (!data || sessionToRestore) return

    setResult(data)
    setActivePlanId(data.planId)
    setPlaceDetail(null)
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
      addPlanToMessages(
        messages,
        data,
        "Restored your saved plan from this URL."
      )
    )
  }, [plannerSearch.selected, restoredPlanQuery.data, sessionToRestore])

  useEffect(() => {
    const detail = restoredSessionQuery.data
    if (!detail) return

    setSessionId(detail.id)
    setResult(detail.plan)
    setActivePlanId(detail.activePlanId ?? detail.plan?.planId)
    setPlaceDetail(null)
    setSelectedId((current) => {
      if (
        current &&
        detail.plan?.places.some((place) => place.googlePlaceId === current)
      ) {
        return current
      }
      return detail.plan?.places[0]?.googlePlaceId ?? null
    })
    setChatMessages(chatMessagesFromSession(detail))
    setHistoryOpen(false)
    setSessionToRestore(null)
  }, [restoredSessionQuery.data])

  useEffect(() => {
    if (restoredSessionQuery.isError) {
      setSessionToRestore(null)
    }
  }, [restoredSessionQuery.isError])

  useEffect(() => {
    navigate({
      to: "/planner",
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

  const submitPrompt = (nextMessage = message) => {
    const trimmed = nextMessage.trim()
    if (!trimmed || chatBusy) return
    if (chatError) clearError()
    setMessage("")
    void sendMessage(
      { text: trimmed },
      {
        body: {
          planId: result?.planId ?? activePlanId,
          sessionId,
          userLocation: null,
          language: i18n.resolvedLanguage ?? i18n.language ?? "en",
        },
      }
    )
  }

  const generateItinerary = (days: number) => {
    submitPrompt(`Create a ${days}-day itinerary from this plan`)
  }

  const resetSession = () => {
    setMessage("")
    setResult(null)
    setActivePlanId(undefined)
    setSelectedId(null)
    setSelectedPlaceSnapshot(null)
    setPlaceDetail(null)
    setSessionId(createSessionId())
    setChatMessages(createInitialChatMessages())
    setSessionToRestore(null)
    if (chatError) clearError()
  }

  const copySessionLink = async () => {
    if (typeof window === "undefined") return
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      toast.success("Session link copied")
      window.setTimeout(() => setLinkCopied(false), 1600)
    } catch {
      toast.error("Could not copy the session link")
    }
  }

  const selectPlace = (googlePlaceId: string) => {
    setSelectedId(googlePlaceId)
    const place = result?.places.find(
      (nextPlace) => nextPlace.googlePlaceId === googlePlaceId
    )
    if (place) setSelectedPlaceSnapshot(place)
  }

  const mapElement = (
    <PlannerMap
      result={result}
      selectedId={selectedId}
      colorScheme={mapColorScheme}
      onSelect={selectPlace}
    />
  )

  const planPanel = (
    <aside className="flex h-full min-h-0 flex-col">
      <SessionHeader
        sessionId={sessionId}
        destination={result?.destination}
        messageCount={chatMessages.length}
        placeCount={result?.places.length ?? 0}
        restoring={restoredPlanQuery.isFetching}
        copied={linkCopied}
        historyOpen={historyOpen}
        historyLoading={
          sessionsQuery.isFetching || restoredSessionQuery.isFetching
        }
        hidden={false}
        sessions={sessionsQuery.data ?? []}
        onHistoryOpenChange={setHistoryOpen}
        onRestoreSession={setSessionToRestore}
        onCopy={copySessionLink}
        onReset={resetSession}
      />

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="planner-chat-scroll p-4">
          {chatMessages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquare className="size-10" />}
              title="Start a travel plan"
              description="Ask for places, routes, food, or itinerary changes."
            />
          ) : (
            chatMessages.map((chatMessage, index) => (
              <PlannerChatMessage
                key={chatMessage.id}
                message={chatMessage}
                index={index}
                selectedId={selectedId}
                saving={patchPlaceMutation.isPending}
                onSelect={selectPlace}
                onOpenPlace={(place) => {
                  selectPlace(place.googlePlaceId)
                  setPlaceDetail(place)
                }}
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
            <PlannerStatusMessage label="Planning your trip" />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border/60 p-4 md:p-5">
        <PromptChips
          prompts={
            result
              ? [
                  "Make this more local",
                  "Add cafes nearby",
                  "Create a cheaper version",
                ]
              : STARTER_PROMPTS
          }
          loading={chatBusy}
          onPick={submitPrompt}
        />
        {result && (
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
        )}
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
              placeholder="Ask for a route, swap a place, add food, change the budget..."
              className="max-h-36 min-h-12 p-2"
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end p-2">
            <PromptInputSubmit
              status={chatStatus}
              onStop={stopChat}
              disabled={!message.trim() && !chatBusy}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
      <PlannerPlaceDetailDialog
        place={detailPlace}
        open={Boolean(detailPlace)}
        saving={patchPlaceMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setPlaceDetail(null)
        }}
        onSave={(place) =>
          patchPlaceMutation.mutate({
            googlePlaceId: place.googlePlaceId,
            patch: { saved: !place.saved },
          })
        }
        onRemove={(place) => {
          setPlaceDetail(null)
          patchPlaceMutation.mutate({
            googlePlaceId: place.googlePlaceId,
            patch: { removed: true },
          })
        }}
      />
    </aside>
  )

  if (isDesktop) {
    return (
      <div className="h-svh md:h-[calc(100svh-3.5rem)]">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize="38%" minSize="26%" maxSize="62%">
            <div className="glass-panel m-3 h-[calc(100%-1.5rem)] rounded-lg">
              {planPanel}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="62%" minSize="30%">
            <div className="relative h-full">
              {mapElement}
              {selectedPlace && <SelectedPlaceOverlay place={selectedPlace} />}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return (
    <div className="relative h-svh overflow-hidden md:h-[calc(100svh-3.5rem)]">
      <div className="absolute inset-0">{mapElement}</div>
      {selectedPlace && mobileView === "map" && (
        <SelectedPlaceOverlay place={selectedPlace} />
      )}
      <div
        className={cn(
          "glass-panel-strong mobile-chrome-pt absolute inset-0 overflow-hidden rounded-t-lg transition-transform duration-300 ease-out",
          mobileView === "plan" ? "translate-y-0" : "translate-y-full"
        )}
      >
        {planPanel}
      </div>
      <Button
        type="button"
        className="mobile-action-bottom absolute left-1/2 z-10 -translate-x-1/2 rounded-full shadow-lg"
        onClick={() =>
          setMobileView((view) => (view === "plan" ? "map" : "plan"))
        }
      >
        {mobileView === "plan" ? (
          <>
            <MapPinned className="size-4" />
            Show map
          </>
        ) : (
          <>
            <List className="size-4" />
            Show plan
          </>
        )}
      </Button>
    </div>
  )
}

function SessionHeader({
  sessionId,
  destination,
  messageCount,
  placeCount,
  restoring,
  copied,
  historyOpen,
  historyLoading,
  hidden,
  sessions,
  onHistoryOpenChange,
  onRestoreSession,
  onCopy,
  onReset,
}: {
  sessionId: string
  destination?: string | null
  messageCount: number
  placeCount: number
  restoring: boolean
  copied: boolean
  historyOpen: boolean
  historyLoading: boolean
  hidden: boolean
  sessions: AiTravelSessionSummary[]
  onHistoryOpenChange: (open: boolean) => void
  onRestoreSession: (sessionId: string) => void
  onCopy: () => void
  onReset: () => void
}) {
  return (
    <TooltipProvider>
      <Sheet open={historyOpen} onOpenChange={onHistoryOpenChange}>
        <div
          className={cn(
            "planner-session-header border-b border-border/60 p-2",
            hidden && "planner-session-header-hidden"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="planner-session-avatar">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-tight">
                    AI Travel Planner
                  </h1>
                </div>
                {/* <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    Session {sessionId.slice(0, 8)}
                  </span>
                  <span aria-hidden>•</span>
                  <span>{messageCount} messages</span>
                  {placeCount > 0 && (
                    <>
                      <span aria-hidden>•</span>
                      <span>{placeCount} places</span>
                    </>
                  )}
                </div> */}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {destination && (
                <Badge
                  variant="secondary"
                  className="hidden max-w-28 truncate sm:inline-flex"
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
                <TooltipContent>History</TooltipContent>
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
                <TooltipContent>Copy session link</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button type="button" variant="ghost" size="icon" />}
                  aria-label="Start a new session"
                  onClick={onReset}
                >
                  <RefreshCcw className="size-4" />
                </TooltipTrigger>
                <TooltipContent>New session</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        <SheetContent side="left" className="flex w-80 flex-col gap-0 p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="text-left text-base tracking-normal normal-case">
              Planner history
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {historyLoading && sessions.length === 0 ? (
              <div className="px-2 py-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-2 py-8 text-sm text-muted-foreground">
                No saved sessions yet.
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={cn(
                      "w-full rounded-lg border border-border/60 p-3 text-left transition-colors",
                      "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                      session.id === sessionId &&
                        "border-primary/40 bg-primary/10"
                    )}
                    onClick={() => onRestoreSession(session.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
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
                          <span>{session.messageCount} messages</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                        {formatSessionDate(session.updatedAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
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
        >
          <span className="planner-prompt-chip-text">{prompt}</span>
        </Suggestion>
      ))}
    </Suggestions>
  )
}

function PlannerChatMessage({
  message,
  index,
  selectedId,
  saving,
  onSelect,
  onOpenPlace,
  onSave,
  onRemove,
}: {
  message: AiTravelPlannerMessage
  index: number
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

  return (
    <Message
      from={message.role}
      className={cn(
        "planner-chat-row",
        hasPlan && "max-w-full",
        message.metadata?.error && "text-destructive"
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <MessageContent
        className={cn(
          "planner-chat-bubble",
          isUser && "planner-chat-bubble-user",
          message.metadata?.error &&
            "planner-chat-bubble-error border border-destructive/30 bg-destructive/10 text-destructive",
          hasPlan && "w-full"
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
            if (hasPlan || part.data.step === "complete") {
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
            return (
              <PlanResultContent
                key={`${message.id}-${part.id ?? partIndex}`}
                result={part.data}
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
  selectedId,
  saving,
  onSelect,
  onOpenPlace,
  onSave,
  onRemove,
}: {
  result: AiTravelResponse
  selectedId: string | null
  saving: boolean
  onSelect: (id: string) => void
  onOpenPlace: (place: AiTravelPlace) => void
  onSave: (place: AiTravelPlace) => void
  onRemove: (place: AiTravelPlace) => void
}) {
  return (
    <div className="mt-5 space-y-6">
      <section className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1">
            <Sparkles className="size-3.5 text-primary" />
            {formatIntentLabel(result.intent)}
          </span>
          {result.destination && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1">
              <MapPinned className="size-3.5" />
              {result.destination}
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{result.title}</h2>
      </section>

      {result.itinerary && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Route className="size-4" />
            Itinerary
          </h3>
          <div className="space-y-2">
            {result.itinerary.days.map((day) => (
              <Card key={day.day} className="rounded-lg p-3">
                <div className="mb-2 text-sm font-medium">
                  Day {day.day}: {day.title}
                </div>
                <ol className="space-y-1 text-sm text-muted-foreground">
                  {day.places.map((place) => (
                    <li key={`${day.day}-${place.googlePlaceId}`}>
                      {place.order}.{" "}
                      {place.startTime ? `${place.startTime} ` : ""}
                      {place.name}
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </section>
      )}

      {result.groups.map((group) => (
        <section key={group.category} className="space-y-2">
          <h3 className="text-sm font-semibold">{group.category}</h3>
          <div className="space-y-3">
            {group.places.map((place) => (
              <PlannerPlaceCard
                key={place.googlePlaceId}
                place={place}
                active={place.googlePlaceId === selectedId}
                saving={saving}
                onSelect={() => onSelect(place.googlePlaceId)}
                onOpen={() => onOpenPlace(place)}
                onSave={() => onSave(place)}
                onRemove={() => onRemove(place)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function PlannerPlaceCard({
  place,
  active,
  saving,
  onSelect,
  onOpen,
  onSave,
  onRemove,
}: {
  place: AiTravelPlace
  active: boolean
  saving: boolean
  onSelect: () => void
  onOpen: () => void
  onSave: () => void
  onRemove: () => void
}) {
  const actionClassName =
    "h-7 rounded-md px-2.5 text-xs font-medium normal-case tracking-normal"

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      className={cn(
        "rounded-lg border border-border/70 bg-background p-2.5 text-sm transition-colors",
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
      <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
        <PlannerPlaceImage place={place} />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="min-w-0 text-sm leading-snug font-semibold">
              {place.name}
            </h4>
            {place.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                <Star className="size-3 fill-current text-amber-500" />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>
          {place.address && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {place.address}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="xs"
              variant={place.saved ? "secondary" : "outline"}
              className={actionClassName}
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
              {place.saved ? "Saved" : "Save"}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className={cn(
                actionClassName,
                "text-muted-foreground hover:text-destructive"
              )}
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation()
                onRemove()
              }}
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
            {place.googleMapsUri && (
              <a
                href={place.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({
                  size: "xs",
                  variant: "ghost",
                  className: cn(actionClassName, "text-muted-foreground"),
                })}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="size-3.5" />
                Maps
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlannerPlaceDetailDialog({
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-lg p-0 sm:max-w-lg">
        {place && (
          <div>
            <div className="relative h-52 overflow-hidden bg-muted">
              {place.photoUrl ? (
                <img
                  src={place.photoUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <MapPinned className="size-8" />
                </div>
              )}
              {place.rating != null && (
                <div className="absolute right-4 bottom-4 inline-flex items-center gap-1.5 rounded-md bg-background/95 px-2.5 py-1.5 text-sm font-semibold shadow-sm">
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

            <div className="space-y-5 p-5">
              <DialogHeader>
                <DialogTitle className="font-sans text-2xl leading-tight tracking-tight normal-case">
                  {place.name}
                </DialogTitle>
                {place.address && (
                  <DialogDescription className="flex items-start gap-2">
                    <MapPinned className="mt-0.5 size-4 shrink-0" />
                    <span>{place.address}</span>
                  </DialogDescription>
                )}
              </DialogHeader>

              {place.reason && (
                <section className="space-y-1.5">
                  <h3 className="text-sm font-semibold">Why visit</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {place.reason}
                  </p>
                </section>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {place.category && (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Category
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {place.category}
                    </div>
                  </div>
                )}
                {place.types.length > 0 && (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Tags
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

              <DialogFooter className="gap-2 sm:justify-start">
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
                  {place.saved ? "Saved" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={saving}
                  onClick={() => onRemove(place)}
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
                {place.googleMapsUri && (
                  <a
                    href={place.googleMapsUri}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({
                      variant: "ghost",
                      className: "text-muted-foreground",
                    })}
                  >
                    <ExternalLink className="size-4" />
                    Maps
                  </a>
                )}
              </DialogFooter>
            </div>
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
    <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
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
  colorScheme,
  onSelect,
}: {
  result: AiTravelResponse | null
  selectedId: string | null
  colorScheme: ColorScheme
  onSelect: (id: string) => void
}) {
  const center = result?.map.center ?? DEFAULT_CENTER
  const zoom = result?.map.zoom ?? DEFAULT_ZOOM
  const mapKey = `${result?.planId ?? "empty"}-${center.lat}-${center.lng}-${result?.map.pins.length ?? 0}`

  return (
    <Map
      key={mapKey}
      mapId={MAP_ID}
      defaultCenter={center}
      defaultZoom={zoom}
      gestureHandling="greedy"
      disableDefaultUI
      colorScheme={colorScheme}
      className="h-full w-full"
    >
      {result?.map.pins.map((pin) => (
        <AdvancedMarker
          key={pin.googlePlaceId}
          position={{ lat: pin.lat, lng: pin.lng }}
        >
          <button
            type="button"
            className={cn(
              "glass-control flex size-10 items-center justify-center rounded-full border-2 border-white/80 bg-primary text-xs font-semibold text-primary-foreground transition-transform",
              "hover:z-10 hover:scale-110",
              selectedId === pin.googlePlaceId &&
                "z-20 scale-110 ring-2 ring-primary"
            )}
            aria-label={pin.name}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(pin.googlePlaceId)
            }}
          >
            {pin.order ?? <MapPinned className="size-4" />}
          </button>
        </AdvancedMarker>
      ))}
    </Map>
  )
}

function SelectedPlaceOverlay({ place }: { place: AiTravelPlace }) {
  return (
    <div className="pointer-events-none absolute right-4 bottom-24 left-4 z-10 md:bottom-6 md:left-auto md:w-80">
      <Card className="glass-panel-strong pointer-events-auto rounded-lg p-3">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {place.order ?? <MapPinned className="size-4" />}
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-sm font-medium">{place.name}</h3>
            {place.address && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {place.address}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
