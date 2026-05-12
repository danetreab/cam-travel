import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/queries/auth.query"

export const Route = createFileRoute("/_guest")({
  component: Outlet,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    })
    if (session?.session) {
      throw redirect({ to: "/" })
    }
    return {}
  },
})
