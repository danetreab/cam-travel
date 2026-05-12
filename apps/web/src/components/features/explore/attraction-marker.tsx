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
    (f) => f.mimetype.startsWith("image/") && f.thumbnailUrl,
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
          "bg-muted flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-md transition-transform",
          "hover:z-10 hover:scale-110",
          active && "ring-primary z-20 scale-110 ring-2",
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
          <MapPin className="text-muted-foreground h-4 w-4" />
        )}
      </div>
    </AdvancedMarker>
  )
}
