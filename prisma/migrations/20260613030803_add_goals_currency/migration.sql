-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" REAL NOT NULL,
    "target_date" TEXT NOT NULL,
    "current_amount" REAL NOT NULL DEFAULT 0,
    "account_id" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "initial_balance" REAL NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("created_at", "id", "initial_balance", "name", "type", "user_id") SELECT "created_at", "id", "initial_balance", "name", "type", "user_id" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");
