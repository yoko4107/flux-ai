-- Per Diem: optional foreign-currency / international wire transfer override.
-- When the employee fills these in, finance pays them via wire to the named
-- account in the named currency instead of the org's default payout flow.
-- All-null behaviour = pay in the user's residence currency to the on-file
-- account (no change from current behaviour).

ALTER TABLE "PerDiemRequest"
  ADD COLUMN "payoutCurrency"      TEXT,
  ADD COLUMN "payoutAccountHolder" TEXT,
  ADD COLUMN "payoutAccountNumber" TEXT,
  ADD COLUMN "payoutBankName"      TEXT,
  ADD COLUMN "payoutBankAddress"   TEXT,
  ADD COLUMN "payoutSwiftCode"     TEXT,
  ADD COLUMN "payoutRoutingNumber" TEXT,
  ADD COLUMN "payoutNotes"         TEXT;
