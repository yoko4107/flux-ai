-- Add emergency contact and social links to UserProfile
ALTER TABLE "UserProfile" ADD COLUMN "emergencyContact" JSONB;
ALTER TABLE "UserProfile" ADD COLUMN "socialLinks" JSONB;
