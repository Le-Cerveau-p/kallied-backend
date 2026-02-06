-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('CONSTRUCTION', 'ENGINEERING', 'PROCUREMENT', 'CONSULTANCY', 'MAINTENANCE', 'GOVERNMENT', 'RESEARCH');

-- AlterTable
ALTER TABLE "ProcurementRequest" ADD COLUMN     "cost" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "category" "ProjectCategory";
