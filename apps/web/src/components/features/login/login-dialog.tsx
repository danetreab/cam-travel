import { createContext, useCallback, useContext, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoginForm } from "./login-form"

interface LoginDialogContextValue {
  open: (redirectTo?: string) => void
  close: () => void
}

const LoginDialogContext = createContext<LoginDialogContextValue | null>(null)

export function useLoginDialog(): LoginDialogContextValue {
  const ctx = useContext(LoginDialogContext)
  if (!ctx) {
    throw new Error("useLoginDialog must be used inside <LoginDialogProvider>")
  }
  return ctx
}

export function LoginDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  // Where to return after a successful Google round-trip. Defaults to the
  // URL the user was on when they triggered the dialog so they land back in
  // context — e.g. the same attraction modal.
  const [redirectTo, setRedirectTo] = useState<string>("/")

  const api = useMemo<LoginDialogContextValue>(
    () => ({
      open: (to) => {
        setRedirectTo(
          to ??
            (typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "/"),
        )
        setOpen(true)
      },
      close: () => setOpen(false),
    }),
    [],
  )

  const handleOpenChange = useCallback((next: boolean) => setOpen(next), [])

  return (
    <LoginDialogContext.Provider value={api}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Welcome</DialogTitle>
            <DialogDescription className="text-center">
              Sign in to continue
            </DialogDescription>
          </DialogHeader>
          {/* The form already shows its own heading on the dedicated /login
              page; in the dialog we render headings via DialogHeader instead,
              so pass the form bare. */}
          <LoginForm redirectTo={redirectTo} hideHeading />
        </DialogContent>
      </Dialog>
    </LoginDialogContext.Provider>
  )
}
