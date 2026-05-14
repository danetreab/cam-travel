import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ColorScheme, Map, useMap } from "@vis.gl/react-google-maps"
import { ListIcon, MapTrifoldIcon, SpinnerIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"

import { AttractionDetailDialog } from "@/components/features/explore/attraction-detail-dialog"
import { AttractionListCard } from "@/components/features/explore/attraction-list-card"
import { AttractionListCardSkeleton } from "@/components/features/explore/attraction-list-card-skeleton"
import { AttractionMarker } from "@/components/features/explore/attraction-marker"
import { Badge } from "@/components/ui/badge"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { savedAttractionsListQueryOptions } from "@/queries/saved-attractions.query"
import type { Attraction } from "@/types/attraction"

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
  const listRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isFetching, error } = useQuery(
    savedAttractionsListQueryOptions(),
  )
  const items = data?.items ?? []

  useEffect(() => {
    if (!selected) return
    if (!isDesktop && mobileView !== "list") return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-attr-id="${selected.id}"]`,
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

  const sidebarInner = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          {isLoading
            ? "Loading saved pins…"
            : `${items.length} saved pin${items.length === 1 ? "" : "s"}`}
        </h2>
        {isFetching && !isLoading && (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
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

      <div className="flex flex-col gap-2">
        {isLoading && items.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <AttractionListCardSkeleton key={i} />
          ))
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No saved pins yet. Open a place from Explore and tap Save.
          </p>
        ) : (
          items.map((a) => (
            <div key={a.id} data-attr-id={a.id}>
              <AttractionListCard
                attraction={a}
                active={hoveredId === a.id || selected?.id === a.id}
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

  if (isDesktop) {
    return (
      <div className="h-svh md:h-[calc(100svh-3.5rem)]">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="saved-sidebar"
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

          <ResizablePanel id="saved-map" defaultSize="64%" minSize="30%">
            <div className="relative h-full">{mapElement}</div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <AttractionDetailDialog
          attraction={selected}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      </div>
    )
  }

  return (
    <div className="relative h-svh overflow-hidden md:h-[calc(100svh-3.5rem)]">
      <div className="absolute inset-0">{mapElement}</div>

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
        onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
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
