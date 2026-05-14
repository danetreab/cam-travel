import { createFileRoute } from "@tanstack/react-router"
import { AppShell } from "@/components/layout/app-shell"
import { authQueryOptions } from "@/queries/auth.query"

// Main app shell. Despite the `_authed` directory name, this layout no longer
// gates access — guests can browse the explore map and individual attraction
// pages. Routes that genuinely require a session (e.g. /saved) own their own
// redirect-to-login `beforeLoad`. The session is still preloaded here so the
// header can render the correct user state without an extra waterfall.
export const Route = createFileRoute("/_authed")({
  component: AppShell,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...authQueryOptions(),
      revalidateIfStale: true,
    })
    return { session }
  },
})
