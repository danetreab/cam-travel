import { Outlet } from "@tanstack/react-router"
import { Header } from "./header"

export function AppShell() {
  return (
    <div className="bg-background min-h-svh">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
