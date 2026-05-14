import { useEffect, useRef, useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  ColorScheme,
  Map,
  useMap,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps"
import { useTheme } from "next-themes"
import type { Layout } from "react-resizable-panels"
import {
  CrosshairIcon,
  ListIcon,
  MapTrifoldIcon,
  SpinnerIcon,
} from "@phosphor-icons/react"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useUserLocation } from "@/hooks/use-user-location"
import {
  attractionsListQueryOptions,
  attractionsTopPerProvinceQueryOptions,
} from "@/queries/attractions.query"
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
import { AttractionListCardSkeleton } from "./attraction-list-card-skeleton"
import { AttractionDetailDialog } from "./attraction-detail-dialog"
import { UserLocationMarker } from "./user-location-marker"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

const DEFAULT_CENTER = { lat: 12.5657, lng: 104.991 }
const DEFAULT_ZOOM = 7
const MAP_ID = "DEMO_MAP_ID"
const BOUNDS_DEBOUNCE_MS = 400

// Airbnb-style: cap how many pins we fetch by zoom level.
//
// At low zoom (country/region view) we switch to the top-per-province query
// so all 25 provinces stay represented instead of pins clustering into one
// city. At higher zoom we use the bounds-filtered list.
const PER_PROVINCE_ZOOM_THRESHOLD = 8

function limitForZoom(zoom: number): number {
  if (zoom <= 10) return 50
  if (zoom <= 12) return 120
  return 250
}

const PER_PROVINCE_COUNT = 20

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
  const { resolvedTheme } = useTheme()
  const mapColorScheme =
    resolvedTheme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [mobileView, setMobileView] = useState<"map" | "list">("map")
  const [defaultLayout] = useState<Layout | undefined>(readStoredLayout)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
  const [activityType, setActivityType] = useState<string | null>(null)
  const debouncedBounds = useDebouncedValue(bounds, BOUNDS_DEBOUNCE_MS)
  const debouncedZoom = useDebouncedValue(zoom, BOUNDS_DEBOUNCE_MS)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Attraction | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const usePerProvince = debouncedZoom <= PER_PROVINCE_ZOOM_THRESHOLD

  const boundsQuery = useQuery({
    ...attractionsListQueryOptions(
      debouncedBounds
        ? {
            bounds: debouncedBounds,
            limit: limitForZoom(debouncedZoom),
            activityType: activityType ?? undefined,
          }
        : {}
    ),
    enabled: debouncedBounds != null && !usePerProvince,
    placeholderData: keepPreviousData,
  })

  // At country/region zoom, fetch top-N per province so every province stays
  // represented on the map. The backend handles the partitioning via a window
  // function — one round-trip, no client-side fan-out.
  const perProvinceQuery = useQuery({
    ...attractionsTopPerProvinceQueryOptions({
      perProvince: PER_PROVINCE_COUNT,
      bounds: debouncedBounds ?? undefined,
      activityType: activityType ?? undefined,
    }),
    enabled: debouncedBounds != null && usePerProvince,
    placeholderData: keepPreviousData,
  })

  const { data, isFetching, isLoading, error } = usePerProvince
    ? perProvinceQuery
    : boundsQuery

  const items = data?.items ?? []

  const userLocation = useUserLocation()

  const handleLocateMe = () => {
    userLocation.locate()
  }

  // Surface geolocation errors as a toast and pan the map when we get a fix.
  useEffect(() => {
    if (userLocation.status === "granted" && userLocation.position && map) {
      map.panTo(userLocation.position)
      const current = map.getZoom() ?? FOCUS_ZOOM
      if (current < 13) map.setZoom(13)
    }
  }, [userLocation.status, userLocation.position, map])

  useEffect(() => {
    if (userLocation.error && userLocation.status !== "loading") {
      toast.error(userLocation.error)
    }
  }, [userLocation.error, userLocation.status])

  useEffect(() => {
    if (!selected) return
    // The list is off-screen on mobile while the map is showing; calling
    // scrollIntoView on a translated element can scroll the page itself.
    if (!isDesktop && mobileView !== "list") return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-attr-id="${selected.id}"]`
    )
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [selected, isDesktop, mobileView])

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
          {debouncedBounds == null
            ? "Move the map to explore"
            : isLoading
              ? "Finding places…"
              : `${items.length} place${items.length === 1 ? "" : "s"} in view`}
        </h2>
        {isFetching && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <SpinnerIcon className="size-3 animate-spin" />
            Updating…
          </span>
        )}
      </div>

      {error && (
        <Badge variant="destructive">
          Failed to load: {(error as Error).message}
        </Badge>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActivityType(null)}
          className={cn(
            "shrink-0 border px-3 py-1 text-xs font-medium transition-colors",
            activityType === null
              ? "border-foreground bg-foreground text-background"
              : "hover:bg-muted"
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
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted"
              )}
            >
              {type}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && items.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <AttractionListCardSkeleton key={i} />
            ))
          : items.map((a) => (
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
        {!isFetching && debouncedBounds != null && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
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
      disableDefaultUI
      onCameraChanged={handleCameraChanged}
      colorScheme={mapColorScheme}
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
      {userLocation.position && (
        <UserLocationMarker position={userLocation.position} />
      )}
    </Map>
  )

  const locateMeButton = (
    <button
      type="button"
      onClick={handleLocateMe}
      disabled={userLocation.status === "loading"}
      aria-label="Show my location"
      title="Show my location"
      className={cn(
        "bg-background text-foreground flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition-colors",
        "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
        userLocation.status === "granted" && "text-blue-600 dark:text-blue-400",
      )}
    >
      {userLocation.status === "loading" ? (
        <SpinnerIcon className="h-5 w-5 animate-spin" />
      ) : (
        <CrosshairIcon className="h-5 w-5" weight="bold" />
      )}
    </button>
  )

  const mapFetchingOverlay = isFetching && (
    <div className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2">
      <div className="bg-background/95 text-foreground flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur">
        <SpinnerIcon className="size-3.5 animate-spin" />
        Updating…
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <div className="h-svh md:h-[calc(100svh-3.5rem)]">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) => {
            try {
              window.localStorage.setItem(
                LAYOUT_STORAGE_KEY,
                JSON.stringify(layout)
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
              {mapFetchingOverlay}
              <div className="absolute right-4 bottom-6 z-10">
                {locateMeButton}
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
    <div className="relative h-svh overflow-hidden md:h-[calc(100svh-3.5rem)]">
      <div className="absolute inset-0">{mapElement}</div>

      {mobileView === "map" && mapFetchingOverlay}

      {mobileView === "map" && (
        <div className="absolute right-4 bottom-24 z-10">{locateMeButton}</div>
      )}

      <aside
        ref={listRef}
        className={cn(
          "absolute inset-0 overflow-y-auto bg-background p-4 transition-transform duration-300 ease-out",
          mobileView === "list" ? "translate-y-0" : "translate-y-full"
        )}
        aria-hidden={mobileView !== "list"}
      >
        {sidebarInner}
      </aside>

      <button
        type="button"
        onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-lg"
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
