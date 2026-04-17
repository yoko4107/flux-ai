import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-6xl font-bold text-gray-200">404</h2>
        <h3 className="text-xl font-bold">Page not found</h3>
        <p className="text-gray-500">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  )
}
