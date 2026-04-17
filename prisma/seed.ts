import { PrismaClient, Role } from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding database...")

  // Create users for all four roles
  const admin = await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {},
    create: {
      email: "admin@company.com",
      name: "Alice Admin",
      role: Role.ADMIN,
      department: "IT",
    },
  })

  const finance = await prisma.user.upsert({
    where: { email: "finance@company.com" },
    update: {},
    create: {
      email: "finance@company.com",
      name: "Frank Finance",
      role: Role.FINANCE,
      department: "Finance",
    },
  })

  const approver1 = await prisma.user.upsert({
    where: { email: "approver1@company.com" },
    update: {},
    create: {
      email: "approver1@company.com",
      name: "Mike Manager",
      role: Role.APPROVER,
      department: "Engineering",
    },
  })

  const approver2 = await prisma.user.upsert({
    where: { email: "approver2@company.com" },
    update: {},
    create: {
      email: "approver2@company.com",
      name: "Sarah Senior",
      role: Role.APPROVER,
      department: "Finance",
    },
  })

  const employee1 = await prisma.user.upsert({
    where: { email: "employee1@company.com" },
    update: {},
    create: {
      email: "employee1@company.com",
      name: "Emma Employee",
      role: Role.EMPLOYEE,
      department: "Engineering",
      managerId: approver1.id,
    },
  })

  const employee2 = await prisma.user.upsert({
    where: { email: "employee2@company.com" },
    update: {},
    create: {
      email: "employee2@company.com",
      name: "John Junior",
      role: Role.EMPLOYEE,
      department: "Marketing",
      managerId: approver1.id,
    },
  })

  // Seed default AdminConfig
  await prisma.adminConfig.upsert({
    where: { key: "approvalCommittee" },
    update: {},
    create: {
      key: "approvalCommittee",
      value: {
        mode: "sequential",
        members: [
          { userId: approver1.id, order: 1 },
          { userId: approver2.id, order: 2 },
        ],
      },
      updatedById: admin.id,
    },
  })

  await prisma.adminConfig.upsert({
    where: { key: "submissionDeadline" },
    update: {},
    create: {
      key: "submissionDeadline",
      value: { day: 20 },
      updatedById: admin.id,
    },
  })

  await prisma.adminConfig.upsert({
    where: { key: "approvalDeadline" },
    update: {},
    create: {
      key: "approvalDeadline",
      value: { businessDays: 3 },
      updatedById: admin.id,
    },
  })

  await prisma.adminConfig.upsert({
    where: { key: "allowedCategories" },
    update: {},
    create: {
      key: "allowedCategories",
      value: { categories: ["TRAVEL", "MEALS", "SUPPLIES", "OTHER"] },
      updatedById: admin.id,
    },
  })

  await prisma.adminConfig.upsert({
    where: { key: "maxAmountPerCategory" },
    update: {},
    create: {
      key: "maxAmountPerCategory",
      value: {},
      updatedById: admin.id,
    },
  })

  await prisma.adminConfig.upsert({
    where: { key: "requireReceiptAbove" },
    update: {},
    create: {
      key: "requireReceiptAbove",
      value: { amount: 50 },
      updatedById: admin.id,
    },
  })

  await prisma.adminConfig.upsert({
    where: { key: "notificationChannels" },
    update: {},
    create: {
      key: "notificationChannels",
      value: { email: true, whatsapp: false, inApp: true },
      updatedById: admin.id,
    },
  })

  await prisma.adminConfig.upsert({
    where: { key: "resubmitBehavior" },
    update: {},
    create: {
      key: "resubmitBehavior",
      value: { resetToBeginning: true },
      updatedById: admin.id,
    },
  })

  console.log("Seed complete!")
  console.log("Test accounts:")
  console.log("  admin@company.com (ADMIN)")
  console.log("  finance@company.com (FINANCE)")
  console.log("  approver1@company.com (APPROVER)")
  console.log("  approver2@company.com (APPROVER)")
  console.log("  employee1@company.com (EMPLOYEE)")
  console.log("  employee2@company.com (EMPLOYEE)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
