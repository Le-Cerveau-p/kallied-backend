/*
  Warnings:

  - You are about to drop the column `projectId` on the `Document` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_projectId_fkey";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "DocumentGroup" ADD COLUMN     "procurementRequestId" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "DocumentGroup" ADD CONSTRAINT "DocumentGroup_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGroup" ADD CONSTRAINT "DocumentGroup_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
