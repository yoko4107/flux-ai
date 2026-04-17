"use client"

import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <AlertTriangle className="h-16 w-16 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="text-gray-500 max-w-md">
          An unexpected error occurred. Please try again or contact support.
        </p>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  )
}
