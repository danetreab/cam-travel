import { Link } from "@tanstack/react-router"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient, signOutRedirect } from "@/lib/auth-client"

function initials(name: string | null | undefined) {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function Header() {
  const { data } = authClient.useSession()
  const user = data?.user

  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span aria-hidden className="text-lg">
            🇰🇭
          </span>
          Cam Travel
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            to="/"
            className="hover:bg-muted rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Explore
          </Link>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="focus-visible:ring-ring/30 rounded-full focus-visible:ring-2 focus-visible:outline-none"
            aria-label="Open account menu"
          >
            <Avatar className="size-9">
              <AvatarImage src={user?.image ?? undefined} alt={user?.name} />
              <AvatarFallback>{initials(user?.name)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex flex-col px-2 py-1.5">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {user?.email}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOutRedirect()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
