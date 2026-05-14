import { AdvancedMarker } from "@vis.gl/react-google-maps"

interface UserLocationMarkerProps {
  position: { lat: number; lng: number }
}

export function UserLocationMarker({ position }: UserLocationMarkerProps) {
  return (
    <AdvancedMarker position={position} zIndex={9999}>
      <div className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-5 w-5 animate-ping rounded-full bg-blue-500/40" />
        <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-md" />
      </div>
    </AdvancedMarker>
  )
}
