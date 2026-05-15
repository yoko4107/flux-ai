-- Add hireDate and driveFolderId to User
ALTER TABLE "User" ADD COLUMN "hireDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "driveFolderId" TEXT;

-- Add Google Drive fields to Organization
ALTER TABLE "Organization" ADD COLUMN "driveEncryptedToken" TEXT;
ALTER TABLE "Organization" ADD COLUMN "driveRootFolderId" TEXT;
