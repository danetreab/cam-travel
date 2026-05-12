import { useEffect, useRef, useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  Map,
  useMap,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps"
import type { Layout } from "react-resizable-panels"
import { ListIcon, MapTrifoldIcon } from "@phosphor-icons/react"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useMediaQuery } from "@/hooks/use-media-query"
import { attractionsListQueryOptions } from "@/queries/attractions.query"
import type { MapBounds } from "@/api/attractions.api"
import type { Attraction } from "@/types/attraction"
import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { AttractionMarker } from "./attraction-marker"
import { AttractionListCard } from "./attraction-list-card"
import { AttractionDetailDialog } from "./attraction-detail-dialog"

const DEFAULT_CENTER = { lat: 12.5657, lng: 104.991 }
const DEFAULT_ZOOM = 7
const MAP_ID = "DEMO_MAP_ID"
const BOUNDS_DEBOUNCE_MS = 400

// Airbnb-style: cap how many pins we fetch by zoom level. Combined with the
// backend's popularity sort, low zoom returns the top places only instead of
// every pin in the viewport. Country-level zooms stay sparse on purpose —
// otherwise the most-reviewed places all cluster into one city and the rest
// of the map looks empty.
function limitForZoom(zoom: number): number {
  if (zoom <= 6) return 10
  if (zoom <= 8) return 20
  if (zoom <= 10) return 50
  if (zoom <= 12) return 120
  return 250
}

const FOCUS_ZOOM = 15

const ACTIVITY_TYPES = [
  "attraction",
  "cultural",
  "nightlife",
  "rides",
  "shopping",
  "sightseeing",
  "urban",
  "walking",
] as const

const LAYOUT_STORAGE_KEY = "explore-layout:v2"
const SIDEBAR_PANEL_ID = "explore-sidebar"
const MAP_PANEL_ID = "explore-map"

function readStoredLayout(): Layout | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Layout) : undefined
  } catch {
    return undefined
  }
}

export function ExploreView() {
  const map = useMap()
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [mobileView, setMobileView] = useState<"map" | "list">("map")
  const [defaultLayout] = useState<Layout | undefined>(readStoredLayout)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
  const [searchOnMove, setSearchOnMove] = useState(true)
  const [activityType, setActivityType] = useState<string | null>(null)
  const debouncedBounds = useDebouncedValue(bounds, BOUNDS_DEBOUNCE_MS)
  const debouncedZoom = useDebouncedValue(zoom, BOUNDS_DEBOUNCE_MS)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Attraction | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // When "search as I move" is off, freeze the bounds/zoom passed to the query.
  const [frozenBounds, setFrozenBounds] = useState<MapBounds | null>(null)
  const [frozenZoom, setFrozenZoom] = useState<number>(DEFAULT_ZOOM)
  const effectiveBounds = searchOnMove ? debouncedBounds : frozenBounds
  const effectiveZoom = searchOnMove ? debouncedZoom : frozenZoom

  const { data, isFetching, error } = useQuery({
    ...attractionsListQueryOptions(
      effectiveBounds
        ? {
            bounds: effectiveBounds,
            limit: limitForZoom(effectiveZoom),
            activityType: activityType ?? undefined,
          }
        : {},
    ),
    enabled: effectiveBounds != null,
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []

  useEffect(() => {
    if (!selected) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-attr-id="${selected.id}"]`,
    )
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [selected])

  const handleCameraChanged = (ev: MapCameraChangedEvent) => {
    const b = ev.detail.bounds
    if (b) {
      setBounds({ south: b.south, west: b.west, north: b.north, east: b.east })
    }
    if (typeof ev.detail.zoom === "number") {
      setZoom(ev.detail.zoom)
    }
  }

  const handleCardClick = (a: Attraction) => {
    setSelected(a)
    if (map) {
      map.panTo({ lat: a.latitude, lng: a.longitude })
      // Never zoom out — if user is already closer in, keep their zoom.
      const next = Math.max(map.getZoom() ?? FOCUS_ZOOM, FOCUS_ZOOM)
      map.setZoom(next)
    }
  }

  const sidebarInner = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          {effectiveBounds == null
            ? "Move the map to explore"
            : `${items.length} place${items.length === 1 ? "" : "s"} in view`}
        </h2>
        {isFetching && (
          <span className="text-muted-foreground text-xs">Updating…</span>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          Failed to load: {(error as Error).message}
        </div>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActivityType(null)}
          className={cn(
            "shrink-0 border px-3 py-1 text-xs font-medium transition-colors",
            activityType === null
              ? "bg-foreground text-background border-foreground"
              : "hover:bg-muted",
          )}
        >
          All
        </button>
        {ACTIVITY_TYPES.map((type) => {
          const active = activityType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActivityType(active ? null : type)}
              className={cn(
                "shrink-0 border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-foreground text-background border-foreground"
                  : "hover:bg-muted",
              )}
            >
              {type}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((a) => (
          <div key={a.id} data-attr-id={a.id}>
            <AttractionListCard
              attraction={a}
              active={hoveredId === a.id || selected?.id === a.id}
              onClick={() => handleCardClick(a)}
              onHover={() => setHoveredId(a.id)}
              onLeave={() => setHoveredId(null)}
            />
          </div>
        ))}
        {!isFetching && effectiveBounds != null && items.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No attractions in this area. Try panning or zooming out.
          </p>
        )}
      </div>
    </>
  )

  const mapElement = (
    <Map
      mapId={MAP_ID}
      defaultCenter={DEFAULT_CENTER}
      defaultZoom={DEFAULT_ZOOM}
      gestureHandling="greedy"
      disableDefaultUI={false}
      onCameraChanged={handleCameraChanged}
      className="h-full w-full"
    >
      {items.map((a) => (
        <AttractionMarker
          key={a.id}
          attraction={a}
          active={hoveredId === a.id || selected?.id === a.id}
          onClick={() => setSelected(a)}
        />
      ))}
    </Map>
  )

  const searchAsIMoveLabel = (
    <label className="flex cursor-pointer items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs font-medium shadow-md select-none">
      <input
        type="checkbox"
        checked={searchOnMove}
        onChange={(e) => {
          const next = e.target.checked
          setSearchOnMove(next)
          if (!next && bounds) {
            setFrozenBounds(bounds)
            setFrozenZoom(zoom)
          }
        }}
        className="align-middle"
      />
      Search as I move the map
    </label>
  )

  if (isDesktop) {
    return (
      <div className="h-[calc(100svh-3.5rem)]">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) => {
            try {
              window.localStorage.setItem(
                LAYOUT_STORAGE_KEY,
                JSON.stringify(layout),
              )
            } catch {
              // ignore quota / privacy-mode failures
            }
          }}
          className="h-full"
        >
          <ResizablePanel
            id={SIDEBAR_PANEL_ID}
            defaultSize="36%"
            minSize="20%"
            maxSize="70%"
          >
            <aside
              ref={listRef}
              className="relative h-full overflow-y-auto p-4"
            >
              {sidebarInner}
            </aside>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id={MAP_PANEL_ID} defaultSize="64%" minSize="30%">
            <div className="relative h-full">
              {mapElement}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                {searchAsIMoveLabel}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <AttractionDetailDialog
          attraction={selected}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      </div>
    )
  }

  // Mobile: full-screen map with a sliding list overlay, toggled by an
  // Airbnb-style pill button at the bottom. Keep the map mounted underneath
  // so its viewport state survives toggling and Google Maps doesn't reload.
  return (
    <div className="relative h-[calc(100svh-3.5rem)] overflow-hidden">
      <div className="absolute inset-0">{mapElement}</div>

      {mobileView === "map" && (
        <div className="pointer-events-none absolute top-4 right-4 left-4 flex justify-center">
          <div className="pointer-events-auto">{searchAsIMoveLabel}</div>
        </div>
      )}

      <aside
        ref={listRef}
        className={cn(
          "bg-background absolute inset-0 overflow-y-auto p-4 transition-transform duration-300 ease-out",
          mobileView === "list" ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={mobileView !== "list"}
      >
        {sidebarInner}
      </aside>

      <button
        type="button"
        onClick={() =>
          setMobileView((v) => (v === "map" ? "list" : "map"))
        }
        className="bg-foreground text-background absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg"
      >
        {mobileView === "map" ? (
          <>
            <ListIcon weight="bold" size={16} />
            Show list
          </>
        ) : (
          <>
            <MapTrifoldIcon weight="bold" size={16} />
            Show map
          </>
        )}
      </button>

      <AttractionDetailDialog
        attraction={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  )
}
