-- Business Per Diem module.
-- One PerDiemRequest per trip; one PerDiemDay per calendar day inside it.
-- All amounts in USD per the spec. Frozen at submission so admin changes
-- to rates don't retroactively affect approved claims.

CREATE TYPE "PerDiemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "PerDiemRequest" (
  "id"                 TEXT PRIMARY KEY,
  "organizationId"     TEXT NOT NULL,
  "employeeId"         TEXT NOT NULL,
  "supervisorId"       TEXT NOT NULL,
  "destinationCountry" TEXT NOT NULL,
  "destinationCity"    TEXT,
  "isHighCost"         BOOLEAN NOT NULL DEFAULT false,
  "startDate"          TIMESTAMP(3) NOT NULL,
  "endDate"            TIMESTAMP(3) NOT NULL,
  "totalDays"          INTEGER NOT NULL,
  "totalAmountUSD"     DECIMAL(12, 2) NOT NULL,
  "status"             "PerDiemStatus" NOT NULL DEFAULT 'PENDING',
  "reason"             TEXT,
  "supervisorNote"     TEXT,
  "rejectionReason"    TEXT,
  "approveToken"       TEXT,
  "rejectToken"        TEXT,
  "tokenExpiresAt"     TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerDiemRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PerDiemRequest_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id"),
  CONSTRAINT "PerDiemRequest_supervisorId_fkey"   FOREIGN KEY ("supervisorId")   REFERENCES "User"("id")
);
CREATE UNIQUE INDEX "PerDiemRequest_approveToken_key" ON "PerDiemRequest" ("approveToken");
CREATE UNIQUE INDEX "PerDiemRequest_rejectToken_key"  ON "PerDiemRequest" ("rejectToken");
CREATE INDEX "PerDiemRequest_organizationId_status_idx" ON "PerDiemRequest" ("organizationId", "status");
CREATE INDEX "PerDiemRequest_employeeId_status_idx"     ON "PerDiemRequest" ("employeeId",     "status");
CREATE INDEX "PerDiemRequest_supervisorId_status_idx"   ON "PerDiemRequest" ("supervisorId",   "status");
CREATE INDEX "PerDiemRequest_employeeId_startDate_endDate_idx"
  ON "PerDiemRequest" ("employeeId", "startDate", "endDate");

CREATE TABLE "PerDiemDay" (
  "id"                TEXT PRIMARY KEY,
  "requestId"         TEXT NOT NULL,
  "date"              TIMESTAMP(3) NOT NULL,
  "baseRateUSD"       DECIMAL(8, 2) NOT NULL,
  "isTravelDay"       BOOLEAN NOT NULL DEFAULT false,
  "breakfastProvided" BOOLEAN NOT NULL DEFAULT false,
  "lunchProvided"     BOOLEAN NOT NULL DEFAULT false,
  "dinnerProvided"    BOOLEAN NOT NULL DEFAULT false,
  "dailyTotalUSD"     DECIMAL(8, 2) NOT NULL,
  CONSTRAINT "PerDiemDay_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PerDiemRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PerDiemDay_requestId_date_key" ON "PerDiemDay" ("requestId", "date");
CREATE INDEX "PerDiemDay_requestId_idx" ON "PerDiemDay" ("requestId");
