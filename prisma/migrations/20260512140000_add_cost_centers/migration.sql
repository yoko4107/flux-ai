-- Regional cost centers — sub-org grouping that drives per-user
-- reimbursement payout currency. Approver/Finance scoping will land in
-- a follow-up migration once query sites are audited.

CREATE TABLE "CostCenter" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "countryCode"    TEXT NOT NULL,
  "currency"       TEXT NOT NULL,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CostCenter_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "CostCenter_organizationId_code_key"
  ON "CostCenter"("organizationId", "code");
CREATE INDEX "CostCenter_organizationId_idx" ON "CostCenter"("organizationId");

ALTER TABLE "User"
  ADD COLUMN "costCenterId" TEXT,
  ADD CONSTRAINT "User_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL;

CREATE INDEX "User_costCenterId_idx" ON "User"("costCenterId");
