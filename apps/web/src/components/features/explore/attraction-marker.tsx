import { AdvancedMarker } from "@vis.gl/react-google-maps"
import { MapPin } from "lucide-react"
import type { Attraction } from "@/types/attraction"
import { cn } from "@/lib/utils"

interface AttractionMarkerProps {
  attraction: Attraction
  active: boolean
  onClick: () => void
}

function firstImage(a: Attraction): string | null {
  const thumb = a.files.find(
    (f) => f.mimetype.startsWith("image/") && f.thumbnailUrl
  )
  if (thumb?.thumbnailUrl) return thumb.thumbnailUrl
  const full = a.files.find((f) => f.mimetype.startsWith("image/"))
  return full?.url ?? null
}

export function AttractionMarker({
  attraction,
  active,
  onClick,
}: AttractionMarkerProps) {
  const image = firstImage(attraction)

  return (
    <AdvancedMarker
      position={{ lat: attraction.latitude, lng: attraction.longitude }}
      onClick={onClick}
    >
      <div
        className={cn(
          "glass-control flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-muted",
          "hover:z-10",
          active && "z-20 ring-2 ring-primary"
        )}
      >
        {image ? (
          <img
            src={image}
            alt={attraction.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <MapPin className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </AdvancedMarker>
  )
}
