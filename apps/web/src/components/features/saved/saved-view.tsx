import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ColorScheme, Map, useMap } from "@vis.gl/react-google-maps"
import { ListIcon, MapTrifoldIcon, SpinnerIcon } from "@phosphor-icons/react"
import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { useTheme } from "next-themes"
import type { PanelImperativeHandle } from "react-resizable-panels"

import type { Attraction } from "@/types/attraction"
import { AttractionDetailView } from "@/components/features/explore/attraction-detail-view"
import { AttractionListCard } from "@/components/features/explore/attraction-list-card"
import { AttractionListCardSkeleton } from "@/components/features/explore/attraction-list-card-skeleton"
import { AttractionMarker } from "@/components/features/explore/attraction-marker"
import { Header } from "@/components/layout/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { savedAttractionsListQueryOptions } from "@/queries/saved-attractions.query"

const DEFAULT_CENTER = { lat: 12.5657, lng: 104.991 }
const DEFAULT_ZOOM = 7
const FOCUS_ZOOM = 13
const MAP_ID = "DEMO_MAP_ID"

export function SavedView() {
  const map = useMap()
  const { resolvedTheme } = useTheme()
  const mapColorScheme =
    resolvedTheme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const [mobileView, setMobileView] = useState<"map" | "list">("list")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Attraction | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const sidebarPanelRef = useRef<PanelImperativeHandle>(null)

  const { data, isLoading, isFetching, error } = useQuery(
    savedAttractionsListQueryOptions()
  )
  const items = data?.items ?? []

  useEffect(() => {
    if (!selected) return
    if (!isDesktop && mobileView !== "list") return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-attr-id="${selected.id}"]`
    )
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [selected, isDesktop, mobileView])

  // Auto-fit the map to all saved pins on first load so users see them right
  // away regardless of where their saves are clustered geographically.
  const fittedRef = useRef(false)
  useEffect(() => {
    if (fittedRef.current || !map || items.length === 0) return
    fittedRef.current = true
    if (items.length === 1) {
      map.panTo({ lat: items[0].latitude, lng: items[0].longitude })
      map.setZoom(FOCUS_ZOOM)
      return
    }
    let north = -90
    let south = 90
    let east = -180
    let west = 180
    for (const a of items) {
      if (a.latitude > north) north = a.latitude
      if (a.latitude < south) south = a.latitude
      if (a.longitude > east) east = a.longitude
      if (a.longitude < west) west = a.longitude
    }
    map.fitBounds({ north, south, east, west }, 60)
  }, [map, items])

  const handleCardClick = (a: Attraction) => {
    setSelected(a)
    if (map) {
      map.panTo({ lat: a.latitude, lng: a.longitude })
      const next = Math.max(map.getZoom() ?? FOCUS_ZOOM, FOCUS_ZOOM)
      map.setZoom(next)
    }
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

  const sidebarInner = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          {isLoading
            ? "Loading saved pins…"
            : `${items.length} saved pin${items.length === 1 ? "" : "s"}`}
        </h2>
        {isFetching && !isLoading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <SpinnerIcon className="size-3 animate-spin" />
            Updating…
          </span>
        )}
      </div>

      {error && (
        <Badge variant="destructive">Failed to load: {error.message}</Badge>
      )}

      <div className="flex flex-col gap-2">
        {isLoading && items.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <AttractionListCardSkeleton key={i} />
          ))
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved pins yet. Open a place from Explore and tap Save.
          </p>
        ) : (
          items.map((a) => (
            <div key={a.id} data-attr-id={a.id}>
              <AttractionListCard
                attraction={a}
                active={hoveredId === a.id || selected?.id === a.id}
                selected={selected?.id === a.id}
                onClick={() => handleCardClick(a)}
                onHover={() => setHoveredId(a.id)}
                onLeave={() => setHoveredId(null)}
              />
            </div>
          ))
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
    </Map>
  )

  const sidebarToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0"
      onClick={toggleSidebar}
      aria-label={sidebarOpen ? "Hide saved panel" : "Show saved panel"}
      title={sidebarOpen ? "Hide saved panel" : "Show saved panel"}
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
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel id="saved-map" defaultSize="64%" minSize="30%">
            <div className="flex h-full min-h-0 flex-col">
              <Header sidePanelControl={sidebarToggle} />
              <div className="relative min-h-0 flex-1">{mapElement}</div>
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className={cn(!sidebarOpen && "pointer-events-none opacity-0")}
          />

          <ResizablePanel
            id="saved-sidebar"
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize="36%"
            minSize="20%"
            maxSize="70%"
            onResize={(size) => setSidebarOpen(size.asPercentage > 0.5)}
          >
            <aside
              ref={listRef}
              className="glass-panel relative m-3 h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg p-4"
            >
              {sidebarInner}
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>

        <AttractionDetailView
          attraction={selected}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      </div>
    )
  }

  return (
    <div className="relative h-svh overflow-hidden md:h-[calc(100svh-3.5rem)]">
      <Header />
      <div className="absolute inset-0">{mapElement}</div>

      <aside
        ref={listRef}
        className={cn(
          "glass-panel-strong mobile-chrome-pt absolute inset-0 overflow-y-auto rounded-t-lg px-4 pb-28 transition-transform duration-300 ease-out",
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

      <AttractionDetailView
        attraction={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  )
}
