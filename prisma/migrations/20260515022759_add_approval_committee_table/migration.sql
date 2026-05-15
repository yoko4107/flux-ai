-- CreateTable
CREATE TABLE "ApprovalCommittee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "costCenterId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'sequential',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalCommittee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalCommitteeMember" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApprovalCommitteeMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalCommittee_organizationId_costCenterId_key" ON "ApprovalCommittee"("organizationId", "costCenterId");

-- CreateIndex
CREATE INDEX "ApprovalCommitteeMember_committeeId_order_idx" ON "ApprovalCommitteeMember"("committeeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalCommitteeMember_committeeId_userId_key" ON "ApprovalCommitteeMember"("committeeId", "userId");

-- AddForeignKey
ALTER TABLE "ApprovalCommittee" ADD CONSTRAINT "ApprovalCommittee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalCommittee" ADD CONSTRAINT "ApprovalCommittee_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalCommitteeMember" ADD CONSTRAINT "ApprovalCommitteeMember_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "ApprovalCommittee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalCommitteeMember" ADD CONSTRAINT "ApprovalCommitteeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: move existing AdminConfig approvalCommittee rows to new tables
DO $$
DECLARE
  r RECORD;
  committee_id TEXT;
  approver_id TEXT;
  approver_order INT;
  approvers_json JSONB;
BEGIN
  FOR r IN
    SELECT id, "organizationId", "costCenterId", value
    FROM "AdminConfig"
    WHERE key = 'approvalCommittee'
  LOOP
    -- Insert the committee row
    INSERT INTO "ApprovalCommittee" (id, "organizationId", "costCenterId", mode, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      r."organizationId",
      r."costCenterId",
      COALESCE((r.value->>'mode')::text, 'sequential'),
      NOW(),
      NOW()
    )
    ON CONFLICT ("organizationId", "costCenterId") DO NOTHING
    RETURNING id INTO committee_id;

    IF committee_id IS NOT NULL THEN
      -- Insert members
      approver_order := 0;
      FOR approver_id IN
        SELECT jsonb_array_elements_text(
          CASE
            WHEN r.value->'approvers' IS NOT NULL THEN r.value->'approvers'
            WHEN r.value->'members' IS NOT NULL THEN
              (SELECT jsonb_agg(m->>'userId') FROM jsonb_array_elements(r.value->'members') m)
            ELSE '[]'::jsonb
          END
        )
      LOOP
        -- Only insert if the user still exists
        IF EXISTS (SELECT 1 FROM "User" WHERE id = approver_id) THEN
          INSERT INTO "ApprovalCommitteeMember" (id, "committeeId", "userId", "order")
          VALUES (gen_random_uuid()::text, committee_id, approver_id, approver_order)
          ON CONFLICT ("committeeId", "userId") DO NOTHING;
          approver_order := approver_order + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
