import { Outlet } from "@tanstack/react-router"
import { LoginDialogProvider } from "@/components/features/login/login-dialog"

export function AppShell() {
  return (
    <LoginDialogProvider>
      <div className="bg-background min-h-svh">
        <main className="relative">
          <Outlet />
        </main>
      </div>
    </LoginDialogProvider>
  )
}
