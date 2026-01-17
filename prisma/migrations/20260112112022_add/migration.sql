/*
  Warnings:

  - Added the required column `eventType` to the `ProjectUpdate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProjectEventType" AS ENUM ('CREATED', 'START_REQUESTED', 'APPROVED', 'PROGRESS_UPDATE', 'COMPLETED');

-- AlterEnum
ALTER TYPE "ProjectStatus" ADD VALUE 'AWAITING_APPROVAL';

-- AlterTable
ALTER TABLE "ProjectUpdate" ADD COLUMN     "eventType" "ProjectEventType" NOT NULL;
