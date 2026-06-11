/*
  Warnings:

  - You are about to drop the column `authorId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `addedat` on the `TaskCommentMap` table. All the data in the column will be lost.
  - You are about to drop the column `addedby` on the `TaskCommentMap` table. All the data in the column will be lost.
  - You are about to drop the column `comments` on the `TaskCommentMap` table. All the data in the column will be lost.
  - Added the required column `userid` to the `Comment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "StatusName" ADD VALUE 'on_hold';

-- DropForeignKey
ALTER TABLE "task_mobile"."Comment" DROP CONSTRAINT "Comment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "task_mobile"."TaskCommentMap" DROP CONSTRAINT "TaskCommentMap_addedby_fkey";

-- DropIndex
DROP INDEX "task_mobile"."Comment_authorId_updatedat_idx";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "authorId",
ADD COLUMN     "userid" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "duedate" TIMESTAMP(3),
ADD COLUMN     "orgid" INTEGER,
ADD COLUMN     "periodSchedule" TEXT;

-- AlterTable
ALTER TABLE "TaskCommentMap" DROP COLUMN "addedat",
DROP COLUMN "addedby",
DROP COLUMN "comments",
ADD COLUMN     "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdby" INTEGER;

-- AlterTable
ALTER TABLE "TaskUserMap" ADD COLUMN     "completedat" TIMESTAMP(3),
ADD COLUMN     "pickedupat" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "logo" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdby" INTEGER NOT NULL,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedby" INTEGER,
    "updatedat" TIMESTAMP(3),
    "removedat" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationUserMap" (
    "id" SERIAL NOT NULL,
    "orgid" INTEGER NOT NULL,
    "userid" INTEGER NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "role" "RoleName",
    "assignedby" INTEGER,
    "assignedat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedby" INTEGER,
    "updatedat" TIMESTAMP(3),
    "removedat" TIMESTAMP(3),

    CONSTRAINT "OrganizationUserMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Organization_isactive_idx" ON "Organization"("isactive");

-- CreateIndex
CREATE INDEX "OrganizationUserMap_userid_isactive_idx" ON "OrganizationUserMap"("userid", "isactive");

-- CreateIndex
CREATE INDEX "OrganizationUserMap_orgid_isactive_idx" ON "OrganizationUserMap"("orgid", "isactive");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationUserMap_orgid_userid_key" ON "OrganizationUserMap"("orgid", "userid");

-- CreateIndex
CREATE INDEX "Comment_userid_updatedat_idx" ON "Comment"("userid", "updatedat");

-- CreateIndex
CREATE INDEX "Task_duedate_idx" ON "Task"("duedate");

-- CreateIndex
CREATE INDEX "Task_orgid_idx" ON "Task"("orgid");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orgid_fkey" FOREIGN KEY ("orgid") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMap" ADD CONSTRAINT "TaskCommentMap_createdby_fkey" FOREIGN KEY ("createdby") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdby_fkey" FOREIGN KEY ("createdby") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUserMap" ADD CONSTRAINT "OrganizationUserMap_orgid_fkey" FOREIGN KEY ("orgid") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUserMap" ADD CONSTRAINT "OrganizationUserMap_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUserMap" ADD CONSTRAINT "OrganizationUserMap_assignedby_fkey" FOREIGN KEY ("assignedby") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
