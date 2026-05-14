-- DropForeignKey
ALTER TABLE "AdminConfig" DROP CONSTRAINT "AdminConfig_costCenterId_fkey";

-- DropForeignKey
ALTER TABLE "CostCenter" DROP CONSTRAINT "CostCenter_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "CountryPayrollRule" DROP CONSTRAINT "CountryPayrollRule_componentId_fkey";

-- DropForeignKey
ALTER TABLE "CountryPayrollRule" DROP CONSTRAINT "CountryPayrollRule_costCenterId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeCompensation" DROP CONSTRAINT "EmployeeCompensation_costCenterId_fkey";

-- DropForeignKey
ALTER TABLE "LeaveBalanceAdjustment" DROP CONSTRAINT "LeaveBalanceAdjustment_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "LeaveBalanceAdjustment" DROP CONSTRAINT "LeaveBalanceAdjustment_grantedById_fkey";

-- DropForeignKey
ALTER TABLE "LeaveBalanceAdjustment" DROP CONSTRAINT "LeaveBalanceAdjustment_leaveTypeId_fkey";

-- DropForeignKey
ALTER TABLE "LeaveProposal" DROP CONSTRAINT "LeaveProposal_proposedById_fkey";

-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_leaveTypeId_fkey";

-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_supervisorId_fkey";

-- DropForeignKey
ALTER TABLE "OvertimeRecord" DROP CONSTRAINT "OvertimeRecord_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "OvertimeRecord" DROP CONSTRAINT "OvertimeRecord_supervisorId_fkey";

-- DropForeignKey
ALTER TABLE "Payslip" DROP CONSTRAINT "Payslip_costCenterId_fkey";

-- DropForeignKey
ALTER TABLE "PerDiemRequest" DROP CONSTRAINT "PerDiemRequest_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "PerDiemRequest" DROP CONSTRAINT "PerDiemRequest_supervisorId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_costCenterId_fkey";

-- DropForeignKey
ALTER TABLE "WorkLocationLog" DROP CONSTRAINT "WorkLocationLog_employeeId_fkey";

-- DropIndex
DROP INDEX "CountryPayrollRule_org_country_component_key";

-- DropIndex
DROP INDEX "User_costCenterId_idx";

-- AlterTable
ALTER TABLE "UserInvitation" ADD COLUMN     "costCenterId" TEXT;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminConfig" ADD CONSTRAINT "AdminConfig_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveProposal" ADD CONSTRAINT "LeaveProposal_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLocationLog" ADD CONSTRAINT "WorkLocationLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerDiemRequest" ADD CONSTRAINT "PerDiemRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerDiemRequest" ADD CONSTRAINT "PerDiemRequest_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryPayrollRule" ADD CONSTRAINT "CountryPayrollRule_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryPayrollRule" ADD CONSTRAINT "CountryPayrollRule_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PayrollComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CompanyEvent_org_start_idx" RENAME TO "CompanyEvent_organizationId_startDate_idx";

-- RenameIndex
ALTER INDEX "CountryPayrollRule_org_country_idx" RENAME TO "CountryPayrollRule_organizationId_countryCode_idx";

-- RenameIndex
ALTER INDEX "LeaveBalanceAdjustment_org_emp_year_idx" RENAME TO "LeaveBalanceAdjustment_organizationId_employeeId_year_idx";

-- RenameIndex
ALTER INDEX "LeaveBalanceAdjustment_type_year_idx" RENAME TO "LeaveBalanceAdjustment_leaveTypeId_year_idx";

-- RenameIndex
ALTER INDEX "PayrollAdjustment_employee_period_idx" RENAME TO "PayrollAdjustment_employeeId_period_idx";

-- RenameIndex
ALTER INDEX "PayrollAdjustment_org_period_idx" RENAME TO "PayrollAdjustment_organizationId_period_idx";

-- RenameIndex
ALTER INDEX "Payslip_org_period_idx" RENAME TO "Payslip_organizationId_period_idx";

-- RenameIndex
ALTER INDEX "Payslip_org_status_idx" RENAME TO "Payslip_organizationId_status_idx";

-- RenameIndex
ALTER INDEX "PublicHoliday_org_date_country_name_key" RENAME TO "PublicHoliday_organizationId_date_countryCode_name_key";
