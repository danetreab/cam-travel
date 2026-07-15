import { useEffect, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import {
  getRouteApi,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ColorScheme, Map, useMap } from "@vis.gl/react-google-maps"
import { useTheme } from "next-themes"
import {
  CrosshairIcon,
  ListIcon,
  MapTrifoldIcon,
  SpinnerIcon,
} from "@phosphor-icons/react"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { toast } from "sonner"
import { AttractionMarker } from "./attraction-marker"
import { AttractionListCard } from "./attraction-list-card"
import { AttractionListCardSkeleton } from "./attraction-list-card-skeleton"
import { UserLocationMarker } from "./user-location-marker"
import type { MapCameraChangedEvent } from "@vis.gl/react-google-maps"
import type { Layout, PanelImperativeHandle } from "react-resizable-panels"

import type { MapBounds } from "@/api/attractions.api"
import type { Attraction } from "@/types/attraction"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useUserLocation } from "@/hooks/use-user-location"
import { findProvince } from "@/data/provinces"
import {
  attractionsListQueryOptions,
  attractionsTopPerProvinceQueryOptions,
} from "@/queries/attractions.query"
import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/layout/header"

const DEFAULT_CENTER = { lat: 12.5657, lng: 104.991 }
const DEFAULT_ZOOM = 7

// Trim camera values before writing them to the URL so panning doesn't churn
// out 15-decimal query strings. 6 dp ≈ 0.1 m, plenty for restoring position.
const round = (n: number, dp: number) => Number(n.toFixed(dp))
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

const PER_PROVINCE_COUNT = 4

// Hard cap for the country/region zoom path. The per-province SQL can emit
// more rows than the user can usefully scan — province strings in the data
// have variants/duplicates, so 4 × distinct_provinces blows past 100. Cap to
// keep marker render + sidebar list snappy on first paint.
const COUNTRY_VIEW_CAP = 100

const FOCUS_ZOOM = 15

const ACTIVITY_TYPES = [
  "attraction",
  "coffee",
  "cultural",
  "nightlife",
  "rides",
  "shopping",
  "sightseeing",
  "urban",
  "walking",
] as const

const LAYOUT_STORAGE_KEY = "explore-layout:v3"
const SIDEBAR_PANEL_ID = "explore-sidebar"
const MAP_PANEL_ID = "explore-map"

const exploreRouteApi = getRouteApi("/_authed/_explore")

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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const navigate = useNavigate()
  const { province: provinceParam, ...viewParams } = exploreRouteApi.useSearch()
  // Restore the camera from the URL on mount (refresh / deep link). Read once
  // via the initializer so later writebacks to ?lat&lng&zoom don't feed back
  // in and fight the user's gestures — the <Map> is uncontrolled after this.
  const [initialView] = useState(() => ({
    center:
      viewParams.lat != null && viewParams.lng != null
        ? { lat: viewParams.lat, lng: viewParams.lng }
        : DEFAULT_CENTER,
    zoom: viewParams.zoom ?? DEFAULT_ZOOM,
  }))
  const [zoom, setZoom] = useState<number>(initialView.zoom)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    null
  )
  const [activityType, setActivityType] = useState<string | null>(null)
  const debouncedBounds = useDebouncedValue(bounds, BOUNDS_DEBOUNCE_MS)
  const debouncedZoom = useDebouncedValue(zoom, BOUNDS_DEBOUNCE_MS)
  const debouncedCenter = useDebouncedValue(center, BOUNDS_DEBOUNCE_MS)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Selection lives in the URL (`/attraction/$attractionId`). Reading the
  // param from the child match keeps marker/list highlighting in sync with
  // the modal route without duplicating state.
  const selectedId = useRouterState({
    select: (s) => {
      const match = s.matches.find(
        (routeMatch) =>
          routeMatch.routeId === "/_authed/_explore/attraction/$attractionId"
      )
      return (match?.params as { attractionId?: string } | undefined)
        ?.attractionId
    },
  })
  const listRef = useRef<HTMLDivElement>(null)
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null)

  // A picked province pins the result set to that province across zooms;
  // the per-province query (used at country zoom) ignores province filters,
  // so route through the bounds query to keep filtering honest.
  const usePerProvince =
    !provinceParam && debouncedZoom <= PER_PROVINCE_ZOOM_THRESHOLD

  const boundsQuery = useQuery({
    ...attractionsListQueryOptions(
      debouncedBounds
        ? {
            bounds: debouncedBounds,
            limit: limitForZoom(debouncedZoom),
            activityType: activityType ?? undefined,
            province: provinceParam,
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

  const rawItems = data?.items ?? []
  // At country/region zoom, keep the most-popular ~100 across all provinces.
  // The per-province SQL already caps to N per province; this trims the long
  // tail of low-traffic provinces so the first paint is fast without losing
  // the marquee places.
  const items = usePerProvince
    ? [...rawItems]
        .sort(
          (a, b) =>
            (b.cachedUserRatingsTotal ?? 0) - (a.cachedUserRatingsTotal ?? 0)
        )
        .slice(0, COUNTRY_VIEW_CAP)
    : rawItems
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 136,
    getItemKey: (index) => items[index]?.id ?? index,
    overscan: 6,
  })

  const userLocation = useUserLocation()

  const handleLocateMe = () => {
    void userLocation.locate()
  }

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
      setSidebarOpen(true)
      return
    }
    panel.collapse()
    setSidebarOpen(false)
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

  // When the user picks a province from the global search bar (`?province=…`),
  // pan/zoom the map to that province. We key off `provinceParam` so reloads
  // and deep links work too.
  useEffect(() => {
    if (!map || !provinceParam) return
    const p = findProvince(provinceParam)
    if (!p) return
    map.panTo({ lat: p.lat, lng: p.lng })
    map.setZoom(p.zoom)
  }, [map, provinceParam])

  const clearProvince = () => {
    // Drop the province filter but keep the current viewport in the URL.
    navigate({
      to: "/",
      search: ({ province: _province, ...rest }) => rest,
    })
  }

  useEffect(() => {
    if (!selectedId) return
    if (!isDesktop && mobileView !== "list") return
    const index = items.findIndex((item) => item.id === selectedId)
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "auto" })
  }, [items, selectedId, isDesktop, mobileView, rowVirtualizer])

  const handleCameraChanged = (ev: MapCameraChangedEvent) => {
    const b = ev.detail.bounds
    if (b) {
      setBounds({ south: b.south, west: b.west, north: b.north, east: b.east })
    }
    if (typeof ev.detail.zoom === "number") {
      setZoom(ev.detail.zoom)
    }
    if (ev.detail.center) {
      setCenter({ lat: ev.detail.center.lat, lng: ev.detail.center.lng })
    }
  }

  // Persist the camera to the URL (debounced, history-replacing) so a refresh
  // reopens on the same spot. Relative `to: "."` keeps the attraction modal
  // open if it's showing; the functional updater preserves ?province.
  useEffect(() => {
    if (!debouncedCenter) return
    navigate({
      to: ".",
      replace: true,
      search: (prev) => ({
        ...prev,
        lat: round(debouncedCenter.lat, 6),
        lng: round(debouncedCenter.lng, 6),
        zoom: round(debouncedZoom, 2),
      }),
    })
  }, [debouncedCenter, debouncedZoom, navigate])

  const openAttraction = (a: Attraction) => {
    navigate({
      to: "/attraction/$attractionId",
      params: { attractionId: a.id },
      // Keep ?lat&lng&zoom (and ?province) so the map behind the modal — and a
      // refresh while it's open — stays on the current viewport.
      search: (prev) => prev,
    })
  }

  const focusAttractionOnMap = (a: Attraction) => {
    map?.panTo({ lat: a.latitude, lng: a.longitude })
  }

  const handleAttractionOpen = (a: Attraction) => {
    openAttraction(a)
    focusAttractionOnMap(a)
  }

  const sidebarInner = (
    <div className="flex h-full min-h-0 flex-col">
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
        <Badge variant="destructive">Failed to load: {error.message}</Badge>
      )}

      {provinceParam && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Province:</span>
          <button
            type="button"
            onClick={clearProvince}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
            aria-label={`Clear ${provinceParam} filter`}
          >
            {provinceParam}
            <span aria-hidden>×</span>
          </button>
        </div>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          variant={activityType === null ? "default" : "secondary"}
          size="xs"
          onClick={() => setActivityType(null)}
          className="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors"
        >
          All
        </Button>
        {ACTIVITY_TYPES.map((type) => {
          const active = activityType === type
          return (
            <Button
              key={type}
              type="button"
              variant={active ? "default" : "secondary"}
              size="xs"
              onClick={() => setActivityType(active ? null : type)}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors"
            >
              {type}
            </Button>
          )
        })}
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto pr-1 pb-28 md:pb-0"
      >
        {isLoading && items.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <AttractionListCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const a = items[virtualRow.index]
              return (
                <div
                  key={a.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-attr-id={a.id}
                  className="absolute top-0 left-0 w-full pb-2"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <AttractionListCard
                    attraction={a}
                    active={hoveredId === a.id || selectedId === a.id}
                    selected={selectedId === a.id}
                    onClick={() => handleAttractionOpen(a)}
                    onHover={() => setHoveredId(a.id)}
                    onLeave={() => setHoveredId(null)}
                  />
                </div>
              )
            })}
          </div>
        ) : null}
        {!isFetching && debouncedBounds != null && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No attractions in this area. Try panning or zooming out.
          </p>
        )}
      </div>
    </div>
  )

  const mapElement = (
    <Map
      mapId={MAP_ID}
      defaultCenter={initialView.center}
      defaultZoom={initialView.zoom}
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
          active={hoveredId === a.id || selectedId === a.id}
          onClick={() => handleAttractionOpen(a)}
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
        "glass-control flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors",
        "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
        userLocation.status === "granted" && "text-blue-600 dark:text-blue-400"
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
      <div className="glass-control flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-foreground">
        <SpinnerIcon className="size-3.5 animate-spin" />
        Updating…
      </div>
    </div>
  )

  const sidebarToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0"
      onClick={toggleSidebar}
      aria-label={sidebarOpen ? "Hide places panel" : "Show places panel"}
      title={sidebarOpen ? "Hide places panel" : "Show places panel"}
    >
      {sidebarOpen ? (
        <PanelRightClose className="size-4" />
      ) : (
        <PanelRightOpen className="size-4" />
      )}
    </Button>
  )

  if (isDesktop) {
    return (
      <div className="h-svh">
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
          <ResizablePanel id={MAP_PANEL_ID} defaultSize="64%" minSize="30%">
            <div className="flex h-full min-h-0 flex-col">
              <Header sidePanelControl={sidebarToggle} />
              <div className="relative min-h-0 flex-1">
                {mapElement}
                {mapFetchingOverlay}
                <div className="absolute right-4 bottom-6 z-10">
                  {locateMeButton}
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className={cn(!sidebarOpen && "pointer-events-none opacity-0")}
          />

          <ResizablePanel
            id={SIDEBAR_PANEL_ID}
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize="36%"
            minSize="20%"
            maxSize="70%"
            onResize={(size) => setSidebarOpen(size.asPercentage > 0.5)}
          >
            <aside className="glass-panel relative m-3 h-[calc(100%-1.5rem)] overflow-hidden rounded-lg p-4">
              {sidebarInner}
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  // Mobile: full-screen map with a sliding list overlay, toggled by an
  // Airbnb-style pill button at the bottom. Keep the map mounted underneath
  // so its viewport state survives toggling and Google Maps doesn't reload.
  return (
    <div className="relative h-svh overflow-hidden md:h-[calc(100svh-3.5rem)]">
      <Header />
      <div className="absolute inset-0">{mapElement}</div>

      {mobileView === "map" && mapFetchingOverlay}

      {mobileView === "map" && (
        <div className="absolute right-4 bottom-24 z-10">{locateMeButton}</div>
      )}

      <aside
        className={cn(
          "glass-panel-strong mobile-chrome-pt absolute inset-0 overflow-hidden rounded-t-lg px-4 transition-transform duration-300 ease-out",
          mobileView === "list" ? "translate-y-0" : "translate-y-full"
        )}
        aria-hidden={mobileView !== "list"}
      >
        {sidebarInner}
      </aside>

      <button
        type="button"
        onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
        className="mobile-action-bottom glass-panel-strong absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background"
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
    </div>
  )
}
