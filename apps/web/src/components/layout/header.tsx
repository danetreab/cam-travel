import {
  DesktopIcon,
  MoonIcon,
  PaletteIcon,
  SignOutIcon,
  SunIcon,
  TranslateIcon,
} from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"
import { Compass } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "km", label: "ខ្មែរ" },
] as const

export function Header() {
  const { data } = authClient.useSession()
  const user = data?.user
  const { t, i18n } = useTranslation()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const activeTheme = mounted ? (theme ?? resolvedTheme ?? "system") : "system"
  const activeLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en"

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <Compass aria-hidden className="size-6" />
          Domnaer
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            to="/"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Explore
          </Link>
          <Link
            to="/saved"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Saved
          </Link>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-full focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
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
              <span className="truncate text-xs text-muted-foreground">
                {user?.email}
              </span>
            </div>
            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PaletteIcon weight="bold" />
                {t("header.theme")}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={activeTheme}
                    onValueChange={setTheme}
                  >
                    <DropdownMenuRadioItem value="light">
                      <SunIcon weight="bold" />
                      {t("header.themeLight")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <MoonIcon weight="bold" />
                      {t("header.themeDark")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <DesktopIcon weight="bold" />
                      {t("header.themeSystem")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TranslateIcon weight="bold" />
                {t("header.language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={activeLanguage}
                    onValueChange={(lng) => i18n.changeLanguage(lng)}
                  >
                    {LANGUAGES.map((lng) => (
                      <DropdownMenuRadioItem key={lng.code} value={lng.code}>
                        {lng.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOutRedirect()}>
              <SignOutIcon weight="bold" />
              {t("header.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
