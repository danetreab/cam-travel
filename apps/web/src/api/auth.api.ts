import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { authClient } from "@/lib/auth-client"

// Server-fn: read the session by forwarding the browser's cookies to the
// auth backend. Returns null when there's no session.
export const getUserSession = createServerFn().handler(async () => {
  const request = getRequest()
  const cookie = request.headers.get("cookie") || ""

  const session = await authClient.getSession({
    fetchOptions: {
      headers: {
        Cookie: cookie,
      },
      credentials: "include",
    },
  })

  if (!session) {
    return null
  }
  return session.data
})
