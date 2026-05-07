-- Per-employee, per-leave-type manual balance adjustments. Positive days
-- add to the year's allowance (e.g. mid-year hire prorated grant);
-- negative days are clawbacks.

CREATE TABLE "LeaveBalanceAdjustment" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId"     TEXT NOT NULL,
  "leaveTypeId"    TEXT NOT NULL,
  "year"           INTEGER NOT NULL,
  "days"           DOUBLE PRECISION NOT NULL,
  "reason"         TEXT NOT NULL,
  "grantedById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveBalanceAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeaveBalanceAdjustment_employeeId_fkey"     FOREIGN KEY ("employeeId")     REFERENCES "User"("id"),
  CONSTRAINT "LeaveBalanceAdjustment_leaveTypeId_fkey"    FOREIGN KEY ("leaveTypeId")    REFERENCES "LeaveType"("id"),
  CONSTRAINT "LeaveBalanceAdjustment_grantedById_fkey"    FOREIGN KEY ("grantedById")    REFERENCES "User"("id")
);
CREATE INDEX "LeaveBalanceAdjustment_org_emp_year_idx" ON "LeaveBalanceAdjustment" ("organizationId", "employeeId", "year");
CREATE INDEX "LeaveBalanceAdjustment_type_year_idx"    ON "LeaveBalanceAdjustment" ("leaveTypeId", "year");
