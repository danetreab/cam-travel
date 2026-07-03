import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { AdvancedMarker, ColorScheme, Map } from "@vis.gl/react-google-maps"
import { useTheme } from "next-themes"
import {
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  ExternalLink,
  List,
  LocateFixed,
  MapPinned,
  Route,
  Send,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  patchAiTravelPlanPlace,
  planAiTravel,
} from "@/api/ai-travel.api"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Textarea } from "@/components/ui/textarea"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import type { AiTravelPlace, AiTravelResponse } from "@/types/ai-travel"

const DEFAULT_CENTER = { lat: 13.3622, lng: 103.8597 }
const DEFAULT_ZOOM = 12
const MAP_ID = "DEMO_MAP_ID"

export function TravelPlannerView() {
  const [message, setMessage] = useState("Recommend places to visit in Siem Reap")
  const [result, setResult] = useState<AiTravelResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"plan" | "map">("plan")
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const { resolvedTheme } = useTheme()
  const { i18n } = useTranslation()

  const mapColorScheme =
    resolvedTheme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT

  const planMutation = useMutation({
    mutationFn: planAiTravel,
    onSuccess: (data) => {
      setResult(data)
      setSelectedId(data.places[0]?.googlePlaceId ?? null)
    },
    onError: (error) => toast.error((error as Error).message),
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
      if (!data.places.some((place) => place.googlePlaceId === selectedId)) {
        setSelectedId(data.places[0]?.googlePlaceId ?? null)
      }
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const selectedPlace = useMemo(
    () => result?.places.find((place) => place.googlePlaceId === selectedId),
    [result?.places, selectedId],
  )

  const submitPrompt = (nextMessage = message) => {
    const trimmed = nextMessage.trim()
    if (!trimmed) return
    setMessage(trimmed)
    planMutation.mutate({
      message: trimmed,
      planId: result?.planId,
      userLocation: null,
      language: i18n.resolvedLanguage ?? i18n.language ?? "en",
    })
  }

  const generateItinerary = (days: number) => {
    submitPrompt(`Create a ${days}-day itinerary from these places`)
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
    <aside className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-5" />
        <h1 className="text-lg font-semibold tracking-tight">AI Travel Planner</h1>
      </div>

      <form
        className="mb-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          submitPrompt()
        }}
      >
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-24 resize-none"
          placeholder="Recommend places to visit in Siem Reap"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={planMutation.isPending}>
            <Send className="size-4" />
            {planMutation.isPending ? "Planning..." : "Plan"}
          </Button>
          {result && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => generateItinerary(1)}
                disabled={planMutation.isPending}
              >
                <CalendarDays className="size-4" />
                1 day
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => generateItinerary(2)}
                disabled={planMutation.isPending}
              >
                <CalendarDays className="size-4" />
                2 days
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => generateItinerary(3)}
                disabled={planMutation.isPending}
              >
                <CalendarDays className="size-4" />
                3 days
              </Button>
            </>
          )}
        </div>
      </form>

      {!result ? (
        <EmptyPlannerState onPick={submitPrompt} loading={planMutation.isPending} />
      ) : (
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{result.intent.replaceAll("_", " ")}</Badge>
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
                  <Card key={day.day} className="rounded-none p-3">
                    <div className="mb-2 text-sm font-medium">
                      Day {day.day}: {day.title}
                    </div>
                    <ol className="space-y-1 text-sm text-muted-foreground">
                      {day.places.map((place) => (
                        <li key={`${day.day}-${place.googlePlaceId}`}>
                          {place.order}. {place.startTime ? `${place.startTime} ` : ""}
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
              <div className="space-y-2">
                {group.places.map((place) => (
                  <PlannerPlaceCard
                    key={place.googlePlaceId}
                    place={place}
                    active={place.googlePlaceId === selectedId}
                    saving={patchPlaceMutation.isPending}
                    onSelect={() => setSelectedId(place.googlePlaceId)}
                    onSave={() =>
                      patchPlaceMutation.mutate({
                        googlePlaceId: place.googlePlaceId,
                        patch: { saved: !place.saved },
                      })
                    }
                    onRemove={() =>
                      patchPlaceMutation.mutate({
                        googlePlaceId: place.googlePlaceId,
                        patch: { removed: true },
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </aside>
  )

  if (isDesktop) {
    return (
      <div className="h-svh md:h-[calc(100svh-3.5rem)]">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize="38%" minSize="26%" maxSize="62%">
            {planPanel}
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
          "absolute inset-0 bg-background transition-transform duration-300 ease-out",
          mobileView === "plan" ? "translate-y-0" : "translate-y-full",
        )}
      >
        {planPanel}
      </div>
      <Button
        type="button"
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-lg"
        onClick={() => setMobileView((view) => (view === "plan" ? "map" : "plan"))}
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

function EmptyPlannerState({
  onPick,
  loading,
}: {
  onPick: (message: string) => void
  loading: boolean
}) {
  const prompts = [
    "Recommend places to visit in Siem Reap",
    "Plan 3 days in Siem Reap",
    "Best local food in Siem Reap",
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ask for recommendations, an itinerary, local food, nearby places, or a
        cheaper version of a saved plan.
      </p>
      <div className="grid gap-2">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            className="h-auto justify-start whitespace-normal py-3 text-left"
            disabled={loading}
            onClick={() => onPick(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
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
        "rounded-none p-3 transition-colors",
        "hover:bg-muted/50 focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        active && "bg-muted ring-ring/40 ring-2",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
          {place.order ?? <LocateFixed className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium">{place.name}</h4>
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
          {place.reason && (
            <p className="mt-2 text-sm text-muted-foreground">{place.reason}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
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
              "flex size-10 items-center justify-center rounded-full border-2 border-white bg-foreground text-xs font-semibold text-background shadow-md transition-transform",
              "hover:z-10 hover:scale-110",
              selectedId === pin.googlePlaceId &&
                "ring-primary z-20 scale-110 ring-2",
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
    <div className="pointer-events-none absolute right-4 bottom-6 left-4 z-10 md:left-auto md:w-80">
      <Card className="pointer-events-auto rounded-none bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
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
