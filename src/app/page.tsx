import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()
  if (!session) redirect("/login")
  const role = session.user.role
  if (role === "SUPER_ADMIN") redirect("/superadmin")
  else redirect(`/${role.toLowerCase()}`)
}
