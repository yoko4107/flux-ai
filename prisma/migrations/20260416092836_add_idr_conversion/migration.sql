-- AlterTable
ALTER TABLE "ReimbursementRequest" ADD COLUMN     "amountIDR" DECIMAL(15,2),
ADD COLUMN     "exchangeRate" DECIMAL(15,6),
ALTER COLUMN "currency" SET DEFAULT 'IDR';
