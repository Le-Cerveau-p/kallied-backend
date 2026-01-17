/*
  Warnings:

  - A unique constraint covering the columns `[requestId]` on the table `PurchaseOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_requestId_key" ON "PurchaseOrder"("requestId");
