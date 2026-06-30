CREATE TABLE "SubActivity" (
    "id" SERIAL NOT NULL,
    "taskid" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "remarks" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdby" INTEGER NOT NULL,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedby" INTEGER,
    "updatedat" TIMESTAMP(3) NOT NULL,
    "removedat" TIMESTAMP(3),

    CONSTRAINT "SubActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubActivity_taskid_isactive_idx"
ON "SubActivity"("taskid", "isactive");

CREATE INDEX "SubActivity_status_idx" ON "SubActivity"("status");

ALTER TABLE "SubActivity"
ADD CONSTRAINT "SubActivity_taskid_fkey"
FOREIGN KEY ("taskid") REFERENCES "Task"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
