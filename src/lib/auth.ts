import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import type { Role } from "@/generated/prisma"

// How long (in ms) before we re-query the DB to refresh role/orgId in JWT
const JWT_ROLE_REFRESH_INTERVAL_MS = 60 * 1000

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as any),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Dev-only: passwordless login via seeded users.
    // NEVER enabled in production — no password check is performed.
    ...(process.env.NODE_ENV === "development"
      ? [
          Credentials({
            name: "Credentials",
            credentials: {
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              if (!credentials?.email) return null
              const user = await prisma.user.findUnique({
                where: { email: credentials.email as string },
              })
              if (!user) return null
              return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                department: user.department,
              }
            },
          }),
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in: populate token from DB
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
        })
        if (dbUser) {
          token.role = dbUser.role
          token.id = dbUser.id
          token.department = dbUser.department ?? undefined
          token.organizationId = dbUser.organizationId ?? undefined
          token.lastRefreshed = Date.now()
        }
      } else {
        // Subsequent requests: refresh role+orgId from DB at most every 60 s
        const lastRefreshed = (token.lastRefreshed as number | undefined) ?? 0
        if (Date.now() - lastRefreshed > JWT_ROLE_REFRESH_INTERVAL_MS && token.sub) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { role: true, organizationId: true },
          })
          if (dbUser) {
            token.role = dbUser.role
            token.organizationId = dbUser.organizationId ?? undefined
            token.lastRefreshed = Date.now()
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as Role
        session.user.id = token.id as string
        session.user.department = token.department as string | undefined
        session.user.organizationId = token.organizationId
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})

// Re-export auth as getServerSession alias for compatibility
export const getServerSession = auth
