import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import type { Role } from "@/generated/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as any),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        // In dev: allow any email from the seeded users
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
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
        })
        if (dbUser) {
          token.role = dbUser.role
          token.id = dbUser.id
          token.department = dbUser.department ?? undefined
          token.organizationId = dbUser.organizationId ?? undefined
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
