-- Payroll module — multi-country, rule-driven calculation engine.
-- Standard component library is global (PayrollComponent), country rules
-- are org-scoped (CountryPayrollRule) so a single org can run payroll across
-- multiple jurisdictions with distinct configuration.

CREATE TABLE "PayrollComponent" (
  "id"          TEXT PRIMARY KEY,
  "code"        TEXT NOT NULL UNIQUE,
  "name"        TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "isTaxable"   BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CountryPayrollRule" (
  "id"              TEXT PRIMARY KEY,
  "organizationId"  TEXT NOT NULL,
  "countryCode"     TEXT NOT NULL,
  "componentId"     TEXT NOT NULL,
  "enabled"         BOOLEAN NOT NULL DEFAULT true,
  "calculationType" TEXT NOT NULL,
  "fixedAmount"     DECIMAL(15, 2),
  "percentage"      DECIMAL(8, 6),
  "formula"         TEXT,
  "minAmount"       DECIMAL(15, 2),
  "maxAmount"       DECIMAL(15, 2),
  "sortOrder"       INTEGER NOT NULL DEFAULT 100,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "updatedById"     TEXT,
  CONSTRAINT "CountryPayrollRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CountryPayrollRule_componentId_fkey"    FOREIGN KEY ("componentId")    REFERENCES "PayrollComponent"("id")
);
CREATE UNIQUE INDEX "CountryPayrollRule_org_country_component_key"
  ON "CountryPayrollRule" ("organizationId", "countryCode", "componentId");
CREATE INDEX "CountryPayrollRule_org_country_idx"
  ON "CountryPayrollRule" ("organizationId", "countryCode");

CREATE TABLE "PayrollBracket" (
  "id"        TEXT PRIMARY KEY,
  "ruleId"    TEXT NOT NULL,
  "minAmount" DECIMAL(15, 2) NOT NULL,
  "maxAmount" DECIMAL(15, 2),
  "rate"      DECIMAL(5, 4) NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "PayrollBracket_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CountryPayrollRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PayrollBracket_ruleId_sortOrder_idx" ON "PayrollBracket" ("ruleId", "sortOrder");

CREATE TABLE "EmployeeCompensation" (
  "id"                 TEXT PRIMARY KEY,
  "organizationId"     TEXT NOT NULL,
  "employeeId"         TEXT NOT NULL UNIQUE,
  "baseSalary"         DECIMAL(15, 2) NOT NULL,
  "currency"           TEXT NOT NULL,
  "workingDaysPerMonth" INTEGER NOT NULL DEFAULT 22,
  "startedAt"          TIMESTAMP(3) NOT NULL,
  "endedAt"            TIMESTAMP(3),
  "componentOverrides" JSONB,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeCompensation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmployeeCompensation_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmployeeCompensation_organizationId_idx" ON "EmployeeCompensation" ("organizationId");

CREATE TABLE "PayrollAdjustment" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId"     TEXT NOT NULL,
  "period"         TEXT NOT NULL,
  "componentCode"  TEXT NOT NULL,
  "amount"         DECIMAL(15, 2) NOT NULL,
  "description"    TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayrollAdjustment_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PayrollAdjustment_org_period_idx"       ON "PayrollAdjustment" ("organizationId", "period");
CREATE INDEX "PayrollAdjustment_employee_period_idx"  ON "PayrollAdjustment" ("employeeId", "period");

CREATE TABLE "Payslip" (
  "id"              TEXT PRIMARY KEY,
  "organizationId"  TEXT NOT NULL,
  "employeeId"      TEXT NOT NULL,
  "period"          TEXT NOT NULL,
  "countryCode"     TEXT NOT NULL,
  "currency"        TEXT NOT NULL,
  "workingDays"     INTEGER NOT NULL,
  "paidDays"        INTEGER NOT NULL,
  "grossPay"        DECIMAL(15, 2) NOT NULL,
  "taxableIncome"   DECIMAL(15, 2) NOT NULL,
  "totalDeductions" DECIMAL(15, 2) NOT NULL,
  "netPay"          DECIMAL(15, 2) NOT NULL,
  "employerCost"    DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "status"          TEXT NOT NULL DEFAULT 'DRAFT',
  "generatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt"     TIMESTAMP(3),
  "paidAt"          TIMESTAMP(3),
  "notes"           TEXT,
  CONSTRAINT "Payslip_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payslip_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Payslip_employeeId_period_key" ON "Payslip" ("employeeId", "period");
CREATE INDEX "Payslip_org_period_idx" ON "Payslip" ("organizationId", "period");
CREATE INDEX "Payslip_org_status_idx" ON "Payslip" ("organizationId", "status");

CREATE TABLE "PayslipLine" (
  "id"            TEXT PRIMARY KEY,
  "payslipId"     TEXT NOT NULL,
  "componentCode" TEXT NOT NULL,
  "componentName" TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "amount"        DECIMAL(15, 2) NOT NULL,
  "description"   TEXT,
  "sortOrder"     INTEGER NOT NULL,
  CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PayslipLine_payslipId_idx" ON "PayslipLine" ("payslipId");
