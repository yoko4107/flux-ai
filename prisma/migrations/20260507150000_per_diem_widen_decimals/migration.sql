-- Per Diem: widen chosen-currency Decimal columns so IDR / VND amounts fit.
-- A typical IDR daily rate is ~1.5M (well over Decimal(8,2)'s 999,999.99 cap)
-- and a 90-day claim can total in the billions. USD-reference columns stay
-- narrower since USD policy rates are bounded by per-diem reasonableness.

ALTER TABLE "PerDiemRequest"
  ALTER COLUMN "totalAmount" TYPE DECIMAL(15, 2);

ALTER TABLE "PerDiemDay"
  ALTER COLUMN "baseRate"   TYPE DECIMAL(15, 2),
  ALTER COLUMN "dailyTotal" TYPE DECIMAL(15, 2);
