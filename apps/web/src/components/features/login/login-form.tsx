import { FcGoogle } from "react-icons/fc"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

interface LoginFormProps extends React.ComponentProps<"div"> {
  redirectTo?: string
}

export function LoginForm({
  className,
  redirectTo = "/",
  ...props
}: LoginFormProps) {
  const handleLoginWithGoogle = async () => {
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL:
        typeof window !== "undefined"
          ? `${window.location.origin}${redirectTo}`
          : redirectTo,
    })
    if (error) {
      toast.error(error.message ?? "Failed to start Google sign-in")
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-bold">Welcome</h1>
        <p className="text-muted-foreground text-sm">
          Sign in to continue to Cam Travel
        </p>
      </div>
      <Button onClick={handleLoginWithGoogle} variant="outline" type="button">
        <FcGoogle className="mr-2 size-5" />
        Continue with Google
      </Button>
    </div>
  )
}
