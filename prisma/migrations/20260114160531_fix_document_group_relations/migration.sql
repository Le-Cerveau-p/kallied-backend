-- DropForeignKey
ALTER TABLE "DocumentGroup" DROP CONSTRAINT "DocumentGroup_projectId_fkey";

-- AlterTable
ALTER TABLE "DocumentGroup" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "DocumentGroup_procurementRequestId_idx" ON "DocumentGroup"("procurementRequestId");

-- CreateIndex
CREATE INDEX "DocumentGroup_purchaseOrderId_idx" ON "DocumentGroup"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "DocumentGroup_projectId_idx" ON "DocumentGroup"("projectId");

-- AddForeignKey
ALTER TABLE "DocumentGroup" ADD CONSTRAINT "DocumentGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
