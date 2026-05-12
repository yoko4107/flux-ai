-- Per-cost-center AdminConfig overrides. Same shape as the payroll rule
-- migration: add a nullable costCenterId, replace the (key, orgId)
-- unique with (key, orgId, costCenterId) using NULLS NOT DISTINCT so
-- the org-wide bucket (NULL CC) stays unique on its own.

ALTER TABLE "AdminConfig"
  ADD COLUMN "costCenterId" TEXT,
  ADD CONSTRAINT "AdminConfig_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "AdminConfig_key_organizationId_key";
ALTER TABLE "AdminConfig"
  DROP CONSTRAINT IF EXISTS "AdminConfig_key_organizationId_key";

CREATE UNIQUE INDEX "AdminConfig_key_org_cc_key"
  ON "AdminConfig" ("key", "organizationId", "costCenterId")
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "AdminConfig_key_organizationId_idx"
  ON "AdminConfig" ("key", "organizationId");
