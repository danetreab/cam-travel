import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CompassIcon, MagnifyingGlassIcon, MapPinIcon } from "@phosphor-icons/react"

import type { ProvinceEntry } from "@/data/provinces"
import { PROVINCES } from "@/data/provinces"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { attractionsSearchQueryOptions } from "@/queries/attractions.query"

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function matchProvinces(query: string): Array<ProvinceEntry> {
  const q = query.trim().toLowerCase()
  if (!q) return PROVINCES.slice(0, 6)
  return PROVINCES.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 200)
  const navigate = useNavigate()

  // Reset the input when the dialog closes so the next open starts fresh.
  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const provinces = matchProvinces(query)

  const attractionsQuery = useQuery({
    ...attractionsSearchQueryOptions({ query: debouncedQuery, limit: 8 }),
  })
  const attractions = attractionsQuery.data?.items ?? []

  const close = () => onOpenChange(false)

  const goToProvince = (p: ProvinceEntry) => {
    close()
    navigate({ to: "/", search: { province: p.name } })
  }

  const goToAttraction = (id: string) => {
    close()
    navigate({ to: "/attraction/$attractionId", params: { attractionId: id } })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search provinces or attractions"
      className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 sm:top-1/3 sm:max-w-xl"
    >
      {/* cmdk's built-in fuzzy filter would hide our async attraction results
          before they finish loading, so we filter the lists ourselves. */}
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search provinces or attractions…"
          autoFocus
        />
        <CommandList className="max-h-[calc(100dvh-7rem)] sm:max-h-72">
          {provinces.length === 0 && attractions.length === 0 && (
            <CommandEmpty>
              {attractionsQuery.isFetching ? "Searching…" : "No results."}
            </CommandEmpty>
          )}

          {provinces.length > 0 && (
            <CommandGroup heading="Provinces">
              {provinces.map((p) => (
                <CommandItem
                  key={p.name}
                  value={`province-${p.name}`}
                  onSelect={() => goToProvince(p)}
                >
                  <CompassIcon weight="bold" />
                  <span>{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {provinces.length > 0 && attractions.length > 0 && <CommandSeparator />}

          {attractions.length > 0 && (
            <CommandGroup heading="Attractions">
              {attractions.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`attraction-${a.id}`}
                  onSelect={() => goToAttraction(a.id)}
                >
                  <MapPinIcon weight="bold" />
                  <span className="truncate">{a.name}</span>
                  {a.province && (
                    <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground min-[380px]:inline">
                      {a.province}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {query.trim().length > 0 &&
            !attractionsQuery.isFetching &&
            attractions.length === 0 &&
            provinces.length > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No matching attractions.
              </p>
            )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

// Pill-shaped search trigger that mirrors the look of map app search bars.
export function SearchTrigger({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open search"
      className={
        "glass-control flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted " +
        (className ?? "")
      }
    >
      <MagnifyingGlassIcon className="size-4" />
      <span className="hidden sm:inline">Search provinces or places…</span>
      <span className="ml-2 hidden rounded border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline">
        ⌘K
      </span>
    </button>
  )
}
