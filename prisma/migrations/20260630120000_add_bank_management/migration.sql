CREATE TABLE "Bank" (
    "id" SERIAL NOT NULL,
    "orgid" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "address" TEXT,
    "contactNumber" TEXT,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "createdby" INTEGER NOT NULL,
    "createdat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedby" INTEGER,
    "updatedat" TIMESTAMP(3) NOT NULL,
    "removedat" TIMESTAMP(3),

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Task" ADD COLUMN "bankid" INTEGER;

CREATE UNIQUE INDEX "Bank_orgid_branchCode_key" ON "Bank"("orgid", "branchCode");
CREATE INDEX "Bank_orgid_isactive_idx" ON "Bank"("orgid", "isactive");
CREATE INDEX "Task_bankid_idx" ON "Task"("bankid");

ALTER TABLE "Bank"
ADD CONSTRAINT "Bank_orgid_fkey"
FOREIGN KEY ("orgid") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_bankid_fkey"
FOREIGN KEY ("bankid") REFERENCES "Bank"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
