import { type UIEvent, useEffect, useMemo, useRef, useState } from "react"
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
  Send,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { patchAiTravelPlanPlace, planAiTravel } from "@/api/ai-travel.api"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import { Input } from "@/components/ui/input"

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

type PlannerChatMessage =
  | {
      id: string
      role: "assistant"
      content: string
      planId?: string
      response?: AiTravelResponse
      error?: boolean
    }
  | {
      id: string
      role: "user"
      content: string
    }

type PersistedPlannerMessage = {
  id?: string
  role: "assistant" | "user"
  content: string
  planId?: string
  error?: boolean
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

function createInitialChatMessages(): PlannerChatMessage[] {
  return [
    {
      id: createMessageId(),
      role: "assistant",
      content: INITIAL_ASSISTANT_MESSAGE,
    },
  ]
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isPersistedPlannerMessage(
  value: unknown
): value is PersistedPlannerMessage {
  if (!value || typeof value !== "object") return false
  const message = value as Record<string, unknown>
  return (
    (message.role === "assistant" || message.role === "user") &&
    typeof message.content === "string"
  )
}

function parsePersistedChat(value: string | undefined): PlannerChatMessage[] {
  if (!value) return createInitialChatMessages()
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as unknown
    if (!Array.isArray(parsed)) return createInitialChatMessages()
    const messages = parsed
      .filter(isPersistedPlannerMessage)
      .map((message): PlannerChatMessage => {
        if (message.role === "user") {
          return {
            id: message.id ?? createMessageId(),
            role: "user",
            content: message.content,
          }
        }
        return {
          id: message.id ?? createMessageId(),
          role: "assistant",
          content: message.content,
          planId: message.planId,
          error: message.error,
        }
      })
    return messages.length > 0 ? messages : createInitialChatMessages()
  } catch {
    return createInitialChatMessages()
  }
}

function chatMessagesFromSession(
  detail: AiTravelSessionDetail
): PlannerChatMessage[] {
  const messages = detail.messages.map((message): PlannerChatMessage => {
    if (message.role === "user") {
      return {
        id: message.id,
        role: "user",
        content: message.content,
      }
    }
    return {
      id: message.id,
      role: "assistant",
      content: message.content,
      planId: message.planId ?? undefined,
      response:
        detail.plan && message.planId === detail.plan.planId
          ? detail.plan
          : undefined,
      error: message.error || undefined,
    }
  })

  return messages.length > 0 ? messages : createInitialChatMessages()
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
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan")
  const [sessionId, setSessionId] = useState(
    () => plannerSearch.sid ?? createSessionId()
  )
  const [chatMessages, setChatMessages] = useState<PlannerChatMessage[]>(() =>
    parsePersistedChat(plannerSearch.chat)
  )
  const [linkCopied, setLinkCopied] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessionToRestore, setSessionToRestore] = useState<string | null>(
    () => plannerSearch.sid ?? null
  )
  const [headerHidden, setHeaderHidden] = useState(false)
  const headerHiddenRef = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
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

  const planMutation = useMutation({
    mutationFn: planAiTravel,
    onSuccess: (data) => {
      setResult(data)
      setSessionId(data.sessionId)
      setActivePlanId(data.planId)
      setSelectedId(data.places[0]?.googlePlaceId ?? null)
      setChatMessages((messages) => [
        ...messages,
        {
          id: createMessageId(),
          role: "assistant",
          content: "Here is a plan you can keep refining in this chat.",
          planId: data.planId,
          response: data,
        },
      ])
      void queryClient.invalidateQueries({ queryKey: ["ai-travel-sessions"] })
    },
    onError: (error) => {
      const message = (error as Error).message
      toast.error(message)
      setChatMessages((messages) => [
        ...messages,
        {
          id: createMessageId(),
          role: "assistant",
          content: message,
          error: true,
        },
      ])
    },
  })

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
        messages.map((message) =>
          message.role === "assistant" &&
          (message.planId === data.planId ||
            message.response?.planId === data.planId)
            ? { ...message, planId: data.planId, response: data }
            : message
        )
      )
      if (!data.places.some((place) => place.googlePlaceId === selectedId)) {
        setSelectedId(data.places[0]?.googlePlaceId ?? null)
      }
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const selectedPlace = useMemo(
    () => result?.places.find((place) => place.googlePlaceId === selectedId),
    [result?.places, selectedId]
  )

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
    setChatMessages((messages) => {
      let attached = false
      const nextMessages = messages.map((message) => {
        if (
          message.role === "assistant" &&
          (message.planId === data.planId ||
            message.response?.planId === data.planId)
        ) {
          attached = true
          return { ...message, planId: data.planId, response: data }
        }
        return message
      })
      if (attached) return nextMessages
      return [
        ...nextMessages,
        {
          id: createMessageId(),
          role: "assistant",
          content: "Restored your saved plan from this URL.",
          planId: data.planId,
          response: data,
        },
      ]
    })
  }, [plannerSearch.selected, restoredPlanQuery.data, sessionToRestore])

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
    setChatMessages(chatMessagesFromSession(detail))
    headerHiddenRef.current = false
    setHeaderHidden(false)
    setHistoryOpen(false)
    setSessionToRestore(null)
  }, [restoredSessionQuery.data])

  useEffect(() => {
    if (restoredSessionQuery.isError) {
      setSessionToRestore(null)
    }
  }, [restoredSessionQuery.isError])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [chatMessages.length, planMutation.isPending])

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
    if (!trimmed || planMutation.isPending) return
    setMessage("")
    setChatMessages((messages) => [
      ...messages,
      { id: createMessageId(), role: "user", content: trimmed },
    ])
    planMutation.mutate({
      message: trimmed,
      planId: result?.planId ?? activePlanId,
      sessionId,
      userLocation: null,
      language: i18n.resolvedLanguage ?? i18n.language ?? "en",
    })
  }

  const generateItinerary = (days: number) => {
    submitPrompt(`Create a ${days}-day itinerary from this plan`)
  }

  const resetSession = () => {
    setMessage("")
    setResult(null)
    setActivePlanId(undefined)
    setSelectedId(null)
    setSessionId(createSessionId())
    setChatMessages(createInitialChatMessages())
    setSessionToRestore(null)
    headerHiddenRef.current = false
    setHeaderHidden(false)
  }

  const handleChatScroll = (event: UIEvent<HTMLDivElement>) => {
    const nextHidden = event.currentTarget.scrollTop > 16
    if (headerHiddenRef.current === nextHidden) return
    headerHiddenRef.current = nextHidden
    setHeaderHidden(nextHidden)
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

  const mapElement = (
    <PlannerMap
      result={result}
      selectedId={selectedId}
      colorScheme={mapColorScheme}
      onSelect={setSelectedId}
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
        hidden={headerHidden}
        sessions={sessionsQuery.data ?? []}
        onHistoryOpenChange={setHistoryOpen}
        onRestoreSession={setSessionToRestore}
        onCopy={copySessionLink}
        onReset={resetSession}
      />

      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="planner-chat-scroll px-5 py-5 md:px-6"
        viewportProps={{ onScroll: handleChatScroll }}
      >
        <div className="space-y-5">
          {chatMessages.map((chatMessage, index) => (
            <PlannerChatBubble
              key={chatMessage.id}
              message={chatMessage}
              index={index}
              selectedId={selectedId}
              saving={patchPlaceMutation.isPending}
              onSelect={setSelectedId}
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
          ))}

          {planMutation.isPending && <TypingIndicator />}

          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

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
          loading={planMutation.isPending}
          onPick={submitPrompt}
        />
        {result && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[1, 2, 3].map((days) => (
              <Button
                key={days}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => generateItinerary(days)}
                disabled={planMutation.isPending}
              >
                <CalendarDays className="size-4" />
                {days} day{days === 1 ? "" : "s"}
              </Button>
            ))}
          </div>
        )}
        <form
          className={cn(
            "planner-composer mt-3 flex items-end gap-2",
            message.trim() && "planner-composer-active"
          )}
          onSubmit={(event) => {
            event.preventDefault()
            submitPrompt()
          }}
        >
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask for a route, swap a place, add food, change the budget..."
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submitPrompt()
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!message.trim() || planMutation.isPending}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
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
            "planner-session-header border-b border-border/60 p-4 md:p-5",
            hidden && "planner-session-header-hidden"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="planner-session-avatar">
                <Sparkles className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-tight">
                    AI Travel Planner
                  </h1>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                </div>
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
    <div className="flex gap-2 overflow-x-auto">
      {prompts.map((prompt) => (
        <Button
          key={prompt}
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => onPick(prompt)}
        >
          <span className="planner-prompt-chip-text">{prompt}</span>
        </Button>
      ))}
    </div>
  )
}

function PlannerChatBubble({
  message,
  index,
  selectedId,
  saving,
  onSelect,
  onSave,
  onRemove,
}: {
  message: PlannerChatMessage
  index: number
  selectedId: string | null
  saving: boolean
  onSelect: (id: string) => void
  onSave: (place: AiTravelPlace) => void
  onRemove: (place: AiTravelPlace) => void
}) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "planner-chat-row flex min-w-0 items-start gap-3",
        isUser && "justify-end"
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      {!isUser && (
        <span className="planner-message-avatar">
          <Sparkles className="size-4" />
        </span>
      )}

      <div
        className={cn(
          "planner-chat-bubble max-w-[94%] min-w-0 rounded-lg px-4 py-3 text-sm md:max-w-[86%]",
          isUser
            ? "planner-chat-bubble-user bg-primary text-primary-foreground"
            : message.error
              ? "planner-chat-bubble-error border border-destructive/30 bg-destructive/10 text-destructive"
              : "planner-chat-bubble-assistant glass-control text-foreground",
          message.role === "assistant" &&
            message.response &&
            "w-full max-w-none md:max-w-none"
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center gap-1.5 text-[0.6875rem] font-medium",
            isUser ? "text-primary-foreground/72" : "text-muted-foreground"
          )}
        >
          {isUser ? (
            <MessageSquare className="size-3" />
          ) : (
            <Sparkles className="size-3" />
          )}
          <span>{isUser ? "You" : "Planner"}</span>
        </div>
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
        {message.role === "assistant" && message.response && (
          <PlanResultContent
            result={message.response}
            selectedId={selectedId}
            saving={saving}
            onSelect={onSelect}
            onSave={onSave}
            onRemove={onRemove}
          />
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="planner-chat-row flex items-start gap-3">
      <span className="planner-message-avatar planner-message-avatar-thinking">
        <Sparkles className="size-4" />
      </span>
      <div className="planner-thinking-card glass-control rounded-lg px-3 py-3 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2">
          <span className="animate-pulse font-medium text-foreground">
            Planning your trip
          </span>
        </div>
        <div className="planner-typing-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

function PlanResultContent({
  result,
  selectedId,
  saving,
  onSelect,
  onSave,
  onRemove,
}: {
  result: AiTravelResponse
  selectedId: string | null
  saving: boolean
  onSelect: (id: string) => void
  onSave: (place: AiTravelPlace) => void
  onRemove: (place: AiTravelPlace) => void
}) {
  return (
    <div className="mt-5 space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {result.intent.replaceAll("_", " ")}
          </Badge>
          {result.destination && <Badge>{result.destination}</Badge>}
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
  onSave,
  onRemove,
}: {
  place: AiTravelPlace
  active: boolean
  saving: boolean
  onSelect: () => void
  onSave: () => void
  onRemove: () => void
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        "rounded-lg p-2.5 transition-colors",
        "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        active && "bg-primary/10 ring-2 ring-primary/35"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <PlannerPlaceImage place={place} />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <h4 className="min-w-0 text-sm leading-snug font-medium">
              {place.name}
            </h4>
            {place.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                <Star className="size-3 fill-current" />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>
          {place.address && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {place.address}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={place.saved ? "default" : "outline"}
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation()
                onSave()
              }}
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
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation()
                onRemove()
              }}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
            {place.googleMapsUri && (
              <a
                href={place.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: "sm", variant: "ghost" })}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="size-4" />
                Maps
              </a>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function PlannerPlaceImage({ place }: { place: AiTravelPlace }) {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : place.photoUrl

  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-18">
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-primary/10 text-primary">
          <MapPinned className="size-5" />
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
          onClick={() => onSelect(pin.googlePlaceId)}
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
