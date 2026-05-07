-- Per Diem: per-claim currency choice + per-day amount override.
-- USD remains the canonical reporting currency (totalAmountUSD), with the
-- chosen currency stored alongside via totalAmount + currency + exchangeRate.

ALTER TABLE "PerDiemRequest"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(15, 6) NOT NULL DEFAULT 1,
  ADD COLUMN "totalAmount" DECIMAL(12, 2);

-- Backfill: for existing rows, the chosen currency is USD and the totals
-- match the canonical USD column.
UPDATE "PerDiemRequest" SET "totalAmount" = "totalAmountUSD" WHERE "totalAmount" IS NULL;
ALTER TABLE "PerDiemRequest" ALTER COLUMN "totalAmount" SET NOT NULL;

ALTER TABLE "PerDiemDay"
  ADD COLUMN "baseRate"   DECIMAL(8, 2),
  ADD COLUMN "dailyTotal" DECIMAL(8, 2),
  ADD COLUMN "isOverride" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PerDiemDay" SET "baseRate"   = "baseRateUSD"   WHERE "baseRate"   IS NULL;
UPDATE "PerDiemDay" SET "dailyTotal" = "dailyTotalUSD" WHERE "dailyTotal" IS NULL;
ALTER TABLE "PerDiemDay" ALTER COLUMN "baseRate"   SET NOT NULL;
ALTER TABLE "PerDiemDay" ALTER COLUMN "dailyTotal" SET NOT NULL;
