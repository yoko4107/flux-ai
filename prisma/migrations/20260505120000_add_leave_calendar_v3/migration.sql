-- Add Leave & Calendar module: profile, calendar tokens, leave types,
-- leave requests, proposals, email events, public holidays, overtime,
-- work-location logs. All new tables are organization-scoped where it
-- makes sense; UserProfile and CalendarToken are user-scoped.

-- 1. Organization country code (drives default holidays / locale)
ALTER TABLE "Organization" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'ID';

-- 2. Enums
CREATE TYPE "CalendarProvider" AS ENUM ('NONE', 'GOOGLE', 'LARK', 'OUTLOOK', 'APPLE_ICS');
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'NEGOTIATING');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'AGREED', 'DISAGREED', 'SUPERSEDED', 'EXPIRED');
CREATE TYPE "ProposerRole" AS ENUM ('SUPERVISOR', 'EMPLOYEE');
CREATE TYPE "OvertimeDayType" AS ENUM ('WEEKDAY', 'WEEKEND', 'PUBLIC_HOLIDAY');
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "WorkLocationType" AS ENUM ('OFFICE', 'WFH', 'WFS');
CREATE TYPE "LeaveEmailType" AS ENUM (
  'REQUEST_SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERVISOR_PROPOSAL',
  'EMPLOYEE_COUNTER', 'PROPOSAL_AGREED', 'PROPOSAL_DISAGREED',
  'REMINDER_PENDING', 'REMINDER_LEAVE', 'TOKEN_EXPIRED',
  'OVERTIME_REQUEST', 'OVERTIME_APPROVED'
);

-- 3. UserProfile
CREATE TABLE "UserProfile" (
  "id"                  TEXT PRIMARY KEY,
  "userId"              TEXT NOT NULL UNIQUE,
  "isOnboarded"         BOOLEAN NOT NULL DEFAULT false,
  "countryCode"         TEXT NOT NULL DEFAULT 'ID',
  "timezone"            TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  "defaultCurrency"     TEXT NOT NULL DEFAULT 'IDR',
  "dateFormat"          TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  "weekStartsOn"        INTEGER NOT NULL DEFAULT 1,
  "jobTitle"            TEXT,
  "phone"               TEXT,
  "photoUrl"            TEXT,
  "calendarProvider"    "CalendarProvider" NOT NULL DEFAULT 'NONE',
  "emailActionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "notifyOnLeaveStatus" BOOLEAN NOT NULL DEFAULT true,
  "notifyOnProposal"    BOOLEAN NOT NULL DEFAULT true,
  "notifyBeforeLeave"   TEXT DEFAULT '1d',
  "notifyInApp"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 4. CalendarToken
CREATE TABLE "CalendarToken" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "provider"       "CalendarProvider" NOT NULL,
  "accountEmail"   TEXT,
  "encryptedToken" TEXT NOT NULL,
  "tokenExpiry"    TIMESTAMP(3),
  "connectedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt"   TIMESTAMP(3),
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CalendarToken_userId_provider_key" ON "CalendarToken" ("userId", "provider");

-- 5. LeaveType (org-scoped)
CREATE TABLE "LeaveType" (
  "id"               TEXT PRIMARY KEY,
  "organizationId"   TEXT NOT NULL,
  "code"             TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "colorHex"         TEXT NOT NULL DEFAULT '#3B82F6',
  "maxDaysPerYear"   INTEGER,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
  "isPaid"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeaveType_organizationId_code_key" ON "LeaveType" ("organizationId", "code");

-- 6. LeaveRequest
CREATE TABLE "LeaveRequest" (
  "id"                   TEXT PRIMARY KEY,
  "organizationId"       TEXT NOT NULL,
  "employeeId"           TEXT NOT NULL,
  "supervisorId"         TEXT NOT NULL,
  "leaveTypeId"          TEXT NOT NULL,
  "startDate"            TIMESTAMP(3) NOT NULL,
  "endDate"              TIMESTAMP(3) NOT NULL,
  "totalDays"            DOUBLE PRECISION NOT NULL,
  "isHalfDay"            BOOLEAN NOT NULL DEFAULT false,
  "halfDayPeriod"        TEXT,
  "reason"               TEXT,
  "status"               "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "supervisorNote"       TEXT,
  "adminNote"            TEXT,
  "rejectionReason"      TEXT,
  "calEventEmployeeId"   TEXT,
  "calEventSupervisorId" TEXT,
  "approveToken"         TEXT,
  "rejectToken"          TEXT,
  "tokenExpiresAt"       TIMESTAMP(3),
  "negotiationRound"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id"),
  CONSTRAINT "LeaveRequest_supervisorId_fkey"   FOREIGN KEY ("supervisorId")   REFERENCES "User"("id"),
  CONSTRAINT "LeaveRequest_leaveTypeId_fkey"    FOREIGN KEY ("leaveTypeId")    REFERENCES "LeaveType"("id")
);
CREATE UNIQUE INDEX "LeaveRequest_approveToken_key" ON "LeaveRequest" ("approveToken");
CREATE UNIQUE INDEX "LeaveRequest_rejectToken_key"  ON "LeaveRequest" ("rejectToken");
CREATE INDEX "LeaveRequest_organizationId_status_idx" ON "LeaveRequest" ("organizationId", "status");
CREATE INDEX "LeaveRequest_employeeId_status_idx"     ON "LeaveRequest" ("employeeId",     "status");
CREATE INDEX "LeaveRequest_supervisorId_status_idx"   ON "LeaveRequest" ("supervisorId",   "status");

-- 7. LeaveProposal
CREATE TABLE "LeaveProposal" (
  "id"             TEXT PRIMARY KEY,
  "leaveRequestId" TEXT NOT NULL,
  "proposedById"   TEXT NOT NULL,
  "proposerRole"   "ProposerRole" NOT NULL,
  "proposedStart"  TIMESTAMP(3) NOT NULL,
  "proposedEnd"    TIMESTAMP(3) NOT NULL,
  "proposedDays"   DOUBLE PRECISION NOT NULL,
  "message"        TEXT NOT NULL,
  "status"         "ProposalStatus" NOT NULL DEFAULT 'PENDING',
  "responseNote"   TEXT,
  "agreeToken"     TEXT,
  "disagreeToken"  TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveProposal_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveProposal_proposedById_fkey"   FOREIGN KEY ("proposedById")   REFERENCES "User"("id")
);
CREATE UNIQUE INDEX "LeaveProposal_agreeToken_key"    ON "LeaveProposal" ("agreeToken");
CREATE UNIQUE INDEX "LeaveProposal_disagreeToken_key" ON "LeaveProposal" ("disagreeToken");
CREATE INDEX "LeaveProposal_leaveRequestId_status_idx" ON "LeaveProposal" ("leaveRequestId", "status");

-- 8. LeaveEmailEvent
CREATE TABLE "LeaveEmailEvent" (
  "id"             TEXT PRIMARY KEY,
  "leaveRequestId" TEXT NOT NULL,
  "toEmail"        TEXT NOT NULL,
  "toUserId"       TEXT,
  "emailType"      "LeaveEmailType" NOT NULL,
  "subject"        TEXT NOT NULL,
  "sentAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tokenUsedAt"    TIMESTAMP(3),
  "actionTaken"    TEXT,
  CONSTRAINT "LeaveEmailEvent_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LeaveEmailEvent_leaveRequestId_sentAt_idx" ON "LeaveEmailEvent" ("leaveRequestId", "sentAt");

-- 9. PublicHoliday (org-scoped)
CREATE TABLE "PublicHoliday" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "countryCode"    TEXT NOT NULL,
  "isRecurring"    BOOLEAN NOT NULL DEFAULT true,
  "type"           TEXT NOT NULL DEFAULT 'NATIONAL',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PublicHoliday_org_date_country_name_key" ON "PublicHoliday" ("organizationId", "date", "countryCode", "name");
CREATE INDEX "PublicHoliday_organizationId_date_idx" ON "PublicHoliday" ("organizationId", "date");

-- 10. OvertimeRecord
CREATE TABLE "OvertimeRecord" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId"     TEXT NOT NULL,
  "supervisorId"   TEXT NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "hoursWorked"    DOUBLE PRECISION NOT NULL,
  "dayType"        "OvertimeDayType" NOT NULL,
  "multiplier"     DOUBLE PRECISION NOT NULL,
  "lieuDaysEarned" DOUBLE PRECISION NOT NULL,
  "lieuExpiresAt"  TIMESTAMP(3),
  "calEventId"     TEXT,
  "notes"          TEXT,
  "status"         "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
  "approveToken"   TEXT,
  "rejectToken"    TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OvertimeRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OvertimeRecord_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id"),
  CONSTRAINT "OvertimeRecord_supervisorId_fkey"   FOREIGN KEY ("supervisorId")   REFERENCES "User"("id")
);
CREATE UNIQUE INDEX "OvertimeRecord_approveToken_key" ON "OvertimeRecord" ("approveToken");
CREATE UNIQUE INDEX "OvertimeRecord_rejectToken_key"  ON "OvertimeRecord" ("rejectToken");
CREATE INDEX "OvertimeRecord_organizationId_status_idx" ON "OvertimeRecord" ("organizationId", "status");
CREATE INDEX "OvertimeRecord_employeeId_date_idx"       ON "OvertimeRecord" ("employeeId", "date");

-- 11. WorkLocationLog
CREATE TABLE "WorkLocationLog" (
  "id"              TEXT PRIMARY KEY,
  "organizationId"  TEXT NOT NULL,
  "employeeId"      TEXT NOT NULL,
  "date"            TIMESTAMP(3) NOT NULL,
  "locationType"    "WorkLocationType" NOT NULL,
  "locationName"    TEXT,
  "locationAddress" TEXT,
  "contactPhone"    TEXT,
  "contactEmail"    TEXT,
  "notes"           TEXT,
  "calEventId"      TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkLocationLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkLocationLog_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id")
);
CREATE INDEX "WorkLocationLog_organizationId_date_idx" ON "WorkLocationLog" ("organizationId", "date");
CREATE INDEX "WorkLocationLog_employeeId_date_idx"     ON "WorkLocationLog" ("employeeId", "date");

-- 12. Backfill: every existing user gets a UserProfile with isOnboarded = true
-- so they don't get force-routed through the onboarding wizard. Defaults pulled
-- from the org.
INSERT INTO "UserProfile" ("id", "userId", "isOnboarded", "countryCode", "timezone", "defaultCurrency", "createdAt", "updatedAt")
SELECT
  'up_' || u."id",
  u."id",
  true,
  COALESCE(o."countryCode", 'ID'),
  CASE COALESCE(o."countryCode", 'ID')
    WHEN 'VN' THEN 'Asia/Ho_Chi_Minh'
    WHEN 'SG' THEN 'Asia/Singapore'
    WHEN 'MY' THEN 'Asia/Kuala_Lumpur'
    WHEN 'TH' THEN 'Asia/Bangkok'
    WHEN 'PH' THEN 'Asia/Manila'
    ELSE 'Asia/Jakarta'
  END,
  COALESCE(o."baseCurrency", 'IDR'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
LEFT JOIN "Organization" o ON o."id" = u."organizationId";
