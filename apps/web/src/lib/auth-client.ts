import { createAuthClient } from "better-auth/react"
import { envClient } from "@/env"

export const authClient = createAuthClient({
  baseURL: envClient.VITE_AUTH_URL,
  fetchOptions: {
    credentials: "include",
  },
})

export async function signOutRedirect() {
  try {
    await authClient.signOut()
  } catch {
    // swallow — we still want to navigate away
  } finally {
    window.location.href = "/"
  }
}
