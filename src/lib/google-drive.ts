/**
 * Google Drive service for managing per-employee document folders.
 *
 * Tokens are stored encrypted on Organization.driveEncryptedToken.
 * Uses the same AES-256-GCM helpers as the calendar module.
 *
 * Drive OAuth uses GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET
 * (falls back to GOOGLE_CALENDAR_* if unset, since they're often the
 * same Cloud project with Drive API also enabled).
 */

import { google } from "googleapis"
import type { OAuth2Client } from "google-auth-library"
import { encryptToken, decryptToken } from "@/lib/calendar/encrypt"
import { prisma } from "@/lib/prisma"

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "openid",
  "email",
]

interface TokenBundle {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
  token_type?: string | null
}

export function makeDriveOAuth2Client(): OAuth2Client {
  const clientId =
    process.env.GOOGLE_DRIVE_CLIENT_ID ?? process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret =
    process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_DRIVE_CLIENT_ID / _CLIENT_SECRET (or GOOGLE_CALENDAR_* fallbacks) not configured"
    )
  }
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${base}/api/admin/google-drive/callback`
  )
}

export function buildDriveAuthUrl(): string {
  const oauth = makeDriveOAuth2Client()
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
  })
}

async function getDriveClient(orgId: string): Promise<ReturnType<typeof google.drive>> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { driveEncryptedToken: true },
  })
  if (!org?.driveEncryptedToken) throw new Error("Google Drive not connected for this organization")

  const bundle = JSON.parse(decryptToken(org.driveEncryptedToken)) as TokenBundle
  const oauth = makeDriveOAuth2Client()
  oauth.setCredentials(bundle)

  // Auto-refresh and persist if near expiry
  const expiresSoon = !bundle.expiry_date || bundle.expiry_date - Date.now() < 60_000
  if (expiresSoon && bundle.refresh_token) {
    const { credentials } = await oauth.refreshAccessToken()
    const merged: TokenBundle = { ...bundle, ...credentials }
    await prisma.organization.update({
      where: { id: orgId },
      data: { driveEncryptedToken: encryptToken(JSON.stringify(merged)) },
    })
    oauth.setCredentials(merged)
  }

  return google.drive({ version: "v3", auth: oauth })
}

export async function saveOrgDriveToken(orgId: string, bundle: TokenBundle): Promise<void> {
  await prisma.organization.update({
    where: { id: orgId },
    data: { driveEncryptedToken: encryptToken(JSON.stringify(bundle)) },
  })
}

/** Creates the org-level root folder "Employees – <org name>" if needed. */
export async function ensureOrgRootFolder(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, driveRootFolderId: true },
  })
  if (!org) throw new Error("Organization not found")
  if (org.driveRootFolderId) return org.driveRootFolderId

  const drive = await getDriveClient(orgId)
  const res = await drive.files.create({
    requestBody: {
      name: `Employees – ${org.name}`,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  })
  const folderId = res.data.id!
  await prisma.organization.update({
    where: { id: orgId },
    data: { driveRootFolderId: folderId },
  })
  return folderId
}

const EMPLOYEE_SUBFOLDERS = ["CV", "Employee Contract", "Annual Tax Deduction", "Payslips"]

/**
 * Creates a folder structure for one employee under the org root:
 *   Employees – <Org> / <Employee Name> / CV, Employee Contract, Annual Tax Deduction, Payslips
 *
 * Returns the employee folder ID.
 */
export async function createEmployeeFolder(
  orgId: string,
  userId: string,
  employeeName: string,
  employeeEmail?: string
): Promise<string> {
  const rootFolderId = await ensureOrgRootFolder(orgId)
  const drive = await getDriveClient(orgId)

  const folderRes = await drive.files.create({
    requestBody: {
      name: employeeName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    },
    fields: "id",
  })
  const employeeFolderId = folderRes.data.id!

  await Promise.all(
    EMPLOYEE_SUBFOLDERS.map((subName) =>
      drive.files.create({
        requestBody: {
          name: subName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [employeeFolderId],
        },
        fields: "id",
      })
    )
  )

  // Share folder with the employee so they can view and upload their own documents
  if (employeeEmail) {
    await drive.permissions.create({
      fileId: employeeFolderId,
      sendNotificationEmail: true,
      requestBody: {
        role: "writer",
        type: "user",
        emailAddress: employeeEmail,
      },
    })
  }

  await prisma.user.update({
    where: { id: userId },
    data: { driveFolderId: employeeFolderId },
  })

  return employeeFolderId
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}
