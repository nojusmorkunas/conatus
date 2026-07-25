"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { cva } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ApiError } from "@/lib/api-client"

// One manager for the whole app so `toastError` works from any client
// component without a hook, same idea as the manager in base-ui's own docs.
const toastManager = ToastPrimitive.createToastManager()

const toastVariants = cva(
  "pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border p-3 pr-8 shadow-md ring-1 ring-foreground/10 transition-all duration-200 data-starting-style:translate-y-1 data-starting-style:opacity-0 data-ending-style:opacity-0 data-limited:opacity-0",
  {
    variants: {
      variant: {
        default: "border-border bg-popover text-popover-foreground",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className={cn(
          "fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none",
          className
        )}
        {...props}
      />
    </ToastPrimitive.Portal>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className={toastVariants({
        variant: toast.type === "error" ? "destructive" : "default",
      })}
    >
      <ToastPrimitive.Content data-slot="toast-content" className="flex-1 space-y-0.5">
        <ToastPrimitive.Title className="text-sm font-medium" />
        <ToastPrimitive.Description className="text-sm opacity-90" />
      </ToastPrimitive.Content>
      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <X className="size-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ))
}

function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toastManager}>
      <ToastViewport>
        <ToastList />
      </ToastViewport>
    </ToastPrimitive.Provider>
  )
}

// One-liner for the common case: a mutation failed and the user needs to
// know. Falls back to a generic message for non-ApiError throws (network
// failures, aborted requests, etc).
function toastError(error: unknown, fallback = "Something went wrong. Please try again.") {
  toastManager.add({
    title: error instanceof ApiError ? error.message : fallback,
    type: "error",
  })
}

export { Toaster, toastManager, toastError }
