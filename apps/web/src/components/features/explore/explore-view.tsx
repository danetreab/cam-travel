import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  Map,
  useMap,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { attractionsListQueryOptions } from "@/queries/attractions.query"
import type { MapBounds } from "@/api/attractions.api"
import type { Attraction } from "@/types/attraction"
import { cn } from "@/lib/utils"
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

export function ExploreView() {
  const map = useMap()
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

  // Activity-type chips: snapshot distinct types only from UNFILTERED responses,
  // otherwise selecting a filter would collapse the chip bar to just that type
  // and the user couldn't switch categories. Selected type is always shown so
  // it stays clickable (to clear) even if the snapshot doesn't include it yet.
  const [knownTypes, setKnownTypes] = useState<string[]>([])
  useEffect(() => {
    if (activityType) return
    const next = Array.from(
      new Set(
        items
          .map((i) => i.activityType)
          .filter((t): t is string => Boolean(t)),
      ),
    ).sort()
    setKnownTypes((prev) =>
      prev.length === next.length && prev.every((t, i) => t === next[i])
        ? prev
        : next,
    )
  }, [activityType, items])
  const chipTypes = useMemo(
    () =>
      activityType && !knownTypes.includes(activityType)
        ? [activityType, ...knownTypes]
        : knownTypes,
    [activityType, knownTypes],
  )

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

  return (
    <div className="flex h-[calc(100svh-3.5rem)]">
      <aside
        ref={listRef}
        className="relative w-full overflow-y-auto border-r p-4 md:w-[42%] lg:w-[36%]"
      >
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

        {chipTypes.length > 0 && (
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
            {chipTypes.map((type) => {
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
        )}

        <div className="flex flex-col gap-2">
          {items.map((a) => (
            <div key={a.id} data-attr-id={a.id}>
              <AttractionListCard
                attraction={a}
                active={hoveredId === a.id || selected?.id === a.id}
                onClick={() => {
                  setSelected(a)
                  if (map) {
                    map.panTo({ lat: a.latitude, lng: a.longitude })
                    // Never zoom out — if user is already closer in, keep their zoom.
                    const next = Math.max(map.getZoom() ?? FOCUS_ZOOM, FOCUS_ZOOM)
                    map.setZoom(next)
                  }
                }}
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
      </aside>

      <div className="relative hidden flex-1 md:block">
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

        <label className="absolute bottom-6 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border bg-white px-4 py-2 text-xs font-medium shadow-md select-none">
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
            className="mr-2 align-middle"
          />
          Search as I move the map
        </label>
      </div>

      <AttractionDetailDialog
        attraction={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  )
}
