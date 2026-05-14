import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { authClient } from "@/lib/auth-client"

// Hard cap on the SSR-side session lookup. Without it, a slow auth backend
// stalls the SSR stream long enough for Traefik/Coolify to close the upstream
// connection mid-render — surfaces as "AbortError: The connection was closed"
// from renderRouterToStream and a 502 Bad Gateway in the browser.
const SESSION_FETCH_TIMEOUT_MS = 6000

// Server-fn: read the session by forwarding the browser's cookies to the
// auth backend. Returns null when there's no session.
export const getUserSession = createServerFn().handler(async () => {
  const request = getRequest()
  const cookie = request.headers.get("cookie") || ""

  try {
    const session = await authClient.getSession({
      fetchOptions: {
        headers: {
          Cookie: cookie,
        },
        credentials: "include",
        signal: AbortSignal.timeout(SESSION_FETCH_TIMEOUT_MS),
      },
    })

    if (!session) {
      return null
    }
    return session.data
  } catch {
    // Treat upstream failure as "no session" so SSR can render the guest
    // shell instead of crashing the stream. Auth guard re-checks on the
    // client anyway.
    return null
  }
})
