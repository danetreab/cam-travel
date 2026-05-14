import {
  DesktopIcon,
  MoonIcon,
  SignOutIcon,
  SunIcon,
} from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"
import { Bookmark, Compass, Menu } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { signOutRedirect } from "@/lib/auth-client"

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

const THEMES = [
  { value: "light", Icon: SunIcon, labelKey: "header.themeLight" as const },
  { value: "dark", Icon: MoonIcon, labelKey: "header.themeDark" as const },
  { value: "system", Icon: DesktopIcon, labelKey: "header.themeSystem" as const },
] as const

interface MobileMenuProps {
  user?: { name?: string | null; email?: string | null; image?: string | null } | null
}

export function MobileMenu({ user }: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  const { t, i18n } = useTranslation()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const activeTheme = mounted ? (theme ?? resolvedTheme ?? "system") : "system"
  const activeLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en"

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="default"
        size="icon"
        aria-label="Open menu"
        className="fixed top-4 right-4 z-50 size-11 rounded-full shadow-lg md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-3 text-left text-base normal-case tracking-normal">
            <Avatar className="size-10">
              <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? ""} />
              <AvatarFallback>{initials(user?.name)}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{user?.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {user?.email}
              </span>
            </span>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-1 border-b p-3">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "justify-start gap-2",
            )}
          >
            <Compass className="size-4" />
            Explore
          </Link>
          <Link
            to="/saved"
            onClick={() => setOpen(false)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "justify-start gap-2",
            )}
          >
            <Bookmark className="size-4" />
            Saved
          </Link>
        </nav>

        <div className="border-b p-3">
          <p className="text-muted-foreground px-2 pb-2 text-xs font-semibold tracking-wider uppercase">
            {t("header.theme")}
          </p>
          <div className="grid grid-cols-3 gap-1">
            {THEMES.map(({ value, Icon, labelKey }) => (
              <Button
                key={value}
                size="sm"
                variant={activeTheme === value ? "default" : "outline"}
                onClick={() => setTheme(value)}
                className="flex h-auto flex-col gap-1 py-2"
              >
                <Icon weight="bold" className="size-4" />
                <span>{t(labelKey)}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="border-b p-3">
          <p className="text-muted-foreground px-2 pb-2 text-xs font-semibold tracking-wider uppercase">
            {t("header.language")}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {LANGUAGES.map((lng) => (
              <Button
                key={lng.code}
                size="sm"
                variant={activeLanguage === lng.code ? "default" : "outline"}
                onClick={() => i18n.changeLanguage(lng.code)}
              >
                {lng.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-auto p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => {
              setOpen(false)
              signOutRedirect()
            }}
          >
            <SignOutIcon weight="bold" className="size-4" />
            {t("header.signOut")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
