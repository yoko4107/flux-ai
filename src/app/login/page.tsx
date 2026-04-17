"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { Logo } from "@/components/brand/logo"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError("Invalid credentials. Use a seeded test email.")
      setLoading(false)
    } else {
      // Fetch session to get role for redirect
      const res = await fetch("/api/auth/session")
      const session = await res.json()
      const role = session?.user?.role
      if (role === "SUPER_ADMIN") router.push("/superadmin")
      else router.push(`/${(role ?? "EMPLOYEE").toLowerCase()}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1E3F] via-[#0B1E3F] to-[#062235] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <Logo variant="light" size="lg" showTagline />
          <p className="text-cyan-200/70 mt-4 text-sm">Sign in to manage HR expenses with intelligence.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Use one of the test accounts below (any password works in dev)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="employee1@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="any password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>

            <div className="mt-6 border-t pt-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Test Accounts:</p>
              <div className="space-y-1 text-xs text-gray-500">
                <div className="cursor-pointer hover:text-gray-800" onClick={() => setEmail("employee1@company.com")}>
                  employee1@company.com &mdash; Employee
                </div>
                <div className="cursor-pointer hover:text-gray-800" onClick={() => setEmail("approver1@company.com")}>
                  approver1@company.com &mdash; Approver
                </div>
                <div className="cursor-pointer hover:text-gray-800" onClick={() => setEmail("finance@company.com")}>
                  finance@company.com &mdash; Finance
                </div>
                <div className="cursor-pointer hover:text-gray-800" onClick={() => setEmail("superadmin@company.com")}>
                  superadmin@company.com &mdash; Super Admin
                </div>
                <div className="cursor-pointer hover:text-gray-800" onClick={() => setEmail("admin@company.com")}>
                  admin@company.com &mdash; Admin
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
