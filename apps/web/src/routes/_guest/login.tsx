import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { LoginForm } from "@/components/features/login/login-form"

const loginSearchSchema = z.object({
  redirect: z.string().default("/"),
})

export const Route = createFileRoute("/_guest/login")({
  component: RouteComponent,
  validateSearch: (search) => loginSearchSchema.parse(search),
})

function RouteComponent() {
  const { redirect } = Route.useSearch()
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={redirect} />
      </div>
    </div>
  )
}
