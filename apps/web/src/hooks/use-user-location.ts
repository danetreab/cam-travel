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

  const locate = useCallback((): Promise<UserLocation | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        position: null,
        status: "unavailable",
        error: "Geolocation is not supported on this device.",
      })
      return Promise.resolve(null)
    }

    setState((s) => ({ ...s, status: "loading", error: null }))

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }
          setState({ position, status: "granted", error: null })
          resolve(position)
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
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      )
    })
  }, [])

  const clear = useCallback(() => {
    setState({ position: null, status: "idle", error: null })
  }, [])

  return { ...state, locate, clear }
}
