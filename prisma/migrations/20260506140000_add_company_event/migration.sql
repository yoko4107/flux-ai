-- Org-scoped company / special events surfaced on the employee calendar.
-- Admin CRUDs them; every member of the org can read.

CREATE TABLE "CompanyEvent" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "startDate"      TIMESTAMP(3) NOT NULL,
  "endDate"        TIMESTAMP(3) NOT NULL,
  "allDay"         BOOLEAN NOT NULL DEFAULT true,
  "category"       TEXT NOT NULL DEFAULT 'COMPANY',
  "colorHex"       TEXT NOT NULL DEFAULT '#22D3EE',
  "location"       TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CompanyEvent_org_start_idx" ON "CompanyEvent" ("organizationId", "startDate");
