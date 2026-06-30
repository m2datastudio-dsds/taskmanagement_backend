ALTER TABLE "User" ADD COLUMN "mobile" TEXT;

CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");
