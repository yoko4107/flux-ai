import type { Role } from "@/generated/prisma"
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: Role
      department?: string
      organizationId?: string
    }
  }
  interface User {
    role?: Role
    department?: string | null
    organizationId?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role
    id: string
    department?: string
    organizationId?: string
  }
}
