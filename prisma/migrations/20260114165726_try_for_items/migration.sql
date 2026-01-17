/*
  Warnings:

  - The values [ORDERED,DELIVERED] on the enum `ProcurementStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[groupId,version]` on the table `Document` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ProcurementStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
ALTER TABLE "public"."ProcurementRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ProcurementRequest" ALTER COLUMN "status" TYPE "ProcurementStatus_new" USING ("status"::text::"ProcurementStatus_new");
ALTER TYPE "ProcurementStatus" RENAME TO "ProcurementStatus_old";
ALTER TYPE "ProcurementStatus_new" RENAME TO "ProcurementStatus";
DROP TYPE "public"."ProcurementStatus_old";
ALTER TABLE "ProcurementRequest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_groupId_version_key" ON "Document"("groupId", "version");
