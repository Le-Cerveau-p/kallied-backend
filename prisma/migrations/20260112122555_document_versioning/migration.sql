/*
  Warnings:

  - Added the required column `category` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `groupId` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `version` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('REPORT', 'CONTRACT', 'DRAWING', 'INVOICE', 'OTHER');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" "DocumentCategory" NOT NULL,
ADD COLUMN     "groupId" TEXT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "DocumentGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentGroup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DocumentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGroup" ADD CONSTRAINT "DocumentGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
