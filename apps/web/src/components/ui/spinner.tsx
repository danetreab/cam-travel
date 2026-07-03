import type { ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"
import { SpinnerIcon } from "@phosphor-icons/react"

function Spinner({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SpinnerIcon>) {
  return (
    <SpinnerIcon role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
