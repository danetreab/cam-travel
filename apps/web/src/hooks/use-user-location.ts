import { useCallback, useState } from "react"

export type UserLocation = { lat: number; lng: number }

type Status = "idle" | "loading" | "granted" | "denied" | "unavailable" | "error"

interface UserLocationState {
  position: UserLocation | null
  status: Status
  error: string | null
}

export function useUserLocation() {
  const [state, setState] = useState<UserLocationState>({
    position: null,
    status: "idle",
    error: null,
  })

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        position: null,
        status: "unavailable",
        error: "Geolocation is not supported on this device.",
      })
      return
    }

    setState((s) => ({ ...s, status: "loading", error: null }))

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          status: "granted",
          error: null,
        })
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED
        setState({
          position: null,
          status: denied ? "denied" : "error",
          error: denied
            ? "Location permission denied. Enable it in your browser to use this feature."
            : err.message || "Couldn't get your location.",
        })
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [])

  return { ...state, locate }
}
