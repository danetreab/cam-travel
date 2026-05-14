import { Outlet } from "@tanstack/react-router"
import { LoginDialogProvider } from "@/components/features/login/login-dialog"
import { Header } from "./header"

export function AppShell() {
  return (
    <LoginDialogProvider>
      <div className="bg-background min-h-svh">
        <Header />
        <main>
          <Outlet />
        </main>
      </div>
    </LoginDialogProvider>
  )
}
