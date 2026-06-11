-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('super_admin', 'admin', 'employee', 'intern');

-- CreateEnum
CREATE TYPE "StatusName" AS ENUM ('created', 'assigned', 'in_progress', 'completed', 'closed', 'reassign', 'revoked');

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isdeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedat" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Status" (
    "id" SERIAL NOT NULL,
    "name" "StatusName" NOT NULL,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "userid" INTEGER,
    "statusId" INTEGER NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdby" INTEGER NOT NULL,
    "updatedby" INTEGER,
    "updatedat" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskUserMap" (
    "id" SERIAL NOT NULL,
    "taskid" INTEGER NOT NULL,
    "userid" INTEGER,
    "statusId" INTEGER NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdby" INTEGER NOT NULL,
    "updatedby" INTEGER,
    "updatedat" TIMESTAMP(3),
    "removedat" TIMESTAMP(3),

    CONSTRAINT "TaskUserMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "taskid" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "comments" TEXT NOT NULL,
    "updatedat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCommentMap" (
    "id" SERIAL NOT NULL,
    "taskid" INTEGER NOT NULL,
    "commentid" INTEGER NOT NULL,
    "comments" TEXT NOT NULL,
    "updatedat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "addedby" INTEGER,
    "addedat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isactive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaskCommentMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleMap" (
    "id" SERIAL NOT NULL,
    "userid" INTEGER NOT NULL,
    "roleId" INTEGER,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "assignedby" INTEGER,
    "assignedat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedat" TIMESTAMP(3),
    "updatedby" INTEGER,
    "removedat" TIMESTAMP(3),

    CONSTRAINT "UserRoleMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Status_name_key" ON "Status"("name");

-- CreateIndex
CREATE INDEX "Task_userid_idx" ON "Task"("userid");

-- CreateIndex
CREATE INDEX "Task_statusId_idx" ON "Task"("statusId");

-- CreateIndex
CREATE INDEX "TaskUserMap_taskid_isactive_idx" ON "TaskUserMap"("taskid", "isactive");

-- CreateIndex
CREATE INDEX "TaskUserMap_userid_isactive_idx" ON "TaskUserMap"("userid", "isactive");

-- CreateIndex
CREATE INDEX "Comment_taskid_updatedat_idx" ON "Comment"("taskid", "updatedat");

-- CreateIndex
CREATE INDEX "Comment_authorId_updatedat_idx" ON "Comment"("authorId", "updatedat");

-- CreateIndex
CREATE INDEX "TaskCommentMap_taskid_isactive_idx" ON "TaskCommentMap"("taskid", "isactive");

-- CreateIndex
CREATE INDEX "UserRoleMap_userid_isactive_idx" ON "UserRoleMap"("userid", "isactive");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdby_fkey" FOREIGN KEY ("createdby") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUserMap" ADD CONSTRAINT "TaskUserMap_taskid_fkey" FOREIGN KEY ("taskid") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUserMap" ADD CONSTRAINT "TaskUserMap_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUserMap" ADD CONSTRAINT "TaskUserMap_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskid_fkey" FOREIGN KEY ("taskid") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMap" ADD CONSTRAINT "TaskCommentMap_taskid_fkey" FOREIGN KEY ("taskid") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMap" ADD CONSTRAINT "TaskCommentMap_commentid_fkey" FOREIGN KEY ("commentid") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCommentMap" ADD CONSTRAINT "TaskCommentMap_addedby_fkey" FOREIGN KEY ("addedby") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleMap" ADD CONSTRAINT "UserRoleMap_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleMap" ADD CONSTRAINT "UserRoleMap_userid_fkey" FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleMap" ADD CONSTRAINT "UserRoleMap_assignedby_fkey" FOREIGN KEY ("assignedby") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
