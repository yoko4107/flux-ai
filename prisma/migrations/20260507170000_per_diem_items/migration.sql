-- Per Diem: optional itemized breakdown.
-- Adds a category to the request itself + a one-to-many PerDiemItem table
-- so employees can describe what an allowance covered (meals, transport,
-- lodging, …) with optional per-item amounts.

ALTER TABLE "PerDiemRequest"
  ADD COLUMN "category" TEXT DEFAULT 'BUSINESS_TRAVEL';

CREATE TABLE "PerDiemItem" (
  "id"          TEXT PRIMARY KEY,
  "requestId"   TEXT NOT NULL,
  "category"    TEXT NOT NULL DEFAULT 'OTHER',
  "description" TEXT NOT NULL,
  "amount"      DECIMAL(15, 2),
  "amountUSD"   DECIMAL(15, 2),
  "date"        TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PerDiemItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PerDiemRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PerDiemItem_requestId_idx" ON "PerDiemItem" ("requestId");
