import type { PrismaClient } from "@/generated/prisma"

export async function getConfig(prisma: PrismaClient, key: string) {
  const config = await prisma.adminConfig.findUnique({ where: { key } })
  return config?.value ?? null
}

export async function getAllConfigs(prisma: PrismaClient) {
  const configs = await prisma.adminConfig.findMany()
  return configs.reduce(
    (acc, c) => {
      acc[c.key] = c.value
      return acc
    },
    {} as Record<string, unknown>
  )
}
