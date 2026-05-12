-- Per-cost-center payroll rules. Adds costCenterId to CountryPayrollRule,
-- EmployeeCompensation, Payslip. Replaces the (org, country, component)
-- unique on CountryPayrollRule with (org, costCenterId, component) using
-- NULLS NOT DISTINCT (Postgres ≥15) so the NULL bucket — org-wide
-- fallback rules — is unique on its own.

ALTER TABLE "CountryPayrollRule"
  ADD COLUMN "costCenterId" TEXT,
  ADD CONSTRAINT "CountryPayrollRule_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE CASCADE;

ALTER TABLE "EmployeeCompensation"
  ADD COLUMN "costCenterId" TEXT,
  ADD CONSTRAINT "EmployeeCompensation_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL;

ALTER TABLE "Payslip"
  ADD COLUMN "costCenterId" TEXT,
  ADD CONSTRAINT "Payslip_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL;

-- Replace the legacy unique constraint.
DROP INDEX IF EXISTS "CountryPayrollRule_organizationId_countryCode_componentId_key";
ALTER TABLE "CountryPayrollRule"
  DROP CONSTRAINT IF EXISTS "CountryPayrollRule_organizationId_countryCode_componentId_key";

CREATE UNIQUE INDEX "CountryPayrollRule_org_cc_comp_key"
  ON "CountryPayrollRule" ("organizationId", "costCenterId", "componentId")
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS "CountryPayrollRule_organizationId_costCenterId_idx"
  ON "CountryPayrollRule" ("organizationId", "costCenterId");
