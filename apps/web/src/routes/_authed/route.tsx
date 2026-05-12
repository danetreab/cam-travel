import { createFileRoute, redirect } from "@tanstack/react-router"
import { AppShell } from "@/components/layout/app-shell"
import { authQueryOptions } from "@/queries/auth.query"

export const Route = createFileRoute("/_authed")({
  component: AppShell,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    })
    if (!session?.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } })
    }
    return { session }
  },
})
