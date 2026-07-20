-- CreateTable
CREATE TABLE "dismissed_bills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "dismissed_bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "dismissed_bills_user_id_description_key" ON "dismissed_bills"("user_id", "description");
