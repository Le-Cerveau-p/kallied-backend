/*
  Warnings:

  - You are about to drop the column `eDD` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "eDD",
ADD COLUMN     "eCD" TIMESTAMP(3);
