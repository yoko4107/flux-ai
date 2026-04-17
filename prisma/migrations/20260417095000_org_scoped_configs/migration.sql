-- DropIndex
DROP INDEX IF EXISTS "AdminConfig_key_key";

-- AlterTable
ALTER TABLE "AdminConfig" ADD COLUMN "organizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminConfig_key_organizationId_key" ON "AdminConfig"("key", "organizationId");

-- AddForeignKey
ALTER TABLE "AdminConfig" ADD CONSTRAINT "AdminConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
