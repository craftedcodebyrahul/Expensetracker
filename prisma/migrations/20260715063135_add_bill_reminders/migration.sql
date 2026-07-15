-- CreateTable
CREATE TABLE "stock_holdings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "price" REAL NOT NULL DEFAULT 0,
    "cost_basis" REAL NOT NULL DEFAULT 0,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "stock_holdings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "price_per_share" REAL NOT NULL,
    "date" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "stock_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "is_investment" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("created_at", "currency", "id", "initial_balance", "name", "type", "user_id") SELECT "created_at", "currency", "id", "initial_balance", "name", "type", "user_id" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
CREATE TABLE "new_recurring_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "next_due_date" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "to_account_id" TEXT,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "email_reminder" INTEGER NOT NULL DEFAULT 0,
    "reminder_days_before" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "recurring_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_schedules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurring_schedules_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_recurring_schedules" ("account_id", "amount", "category", "created_at", "description", "frequency", "id", "is_active", "next_due_date", "start_date", "to_account_id", "type", "user_id") SELECT "account_id", "amount", "category", "created_at", "description", "frequency", "id", "is_active", "next_due_date", "start_date", "to_account_id", "type", "user_id" FROM "recurring_schedules";
DROP TABLE "recurring_schedules";
ALTER TABLE "new_recurring_schedules" RENAME TO "recurring_schedules";
CREATE INDEX "recurring_schedules_user_id_is_active_next_due_date_idx" ON "recurring_schedules"("user_id", "is_active", "next_due_date");
CREATE TABLE "new_settings" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currency_symbol" TEXT NOT NULL DEFAULT '$',
    "date_format" TEXT NOT NULL DEFAULT 'MM/dd/yyyy',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "monthly_report_enabled" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_settings" ("currency", "currency_symbol", "date_format", "theme", "updated_at", "user_id") SELECT "currency", "currency_symbol", "date_format", "theme", "updated_at", "user_id" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
CREATE TABLE "new_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "is_recurring" INTEGER NOT NULL DEFAULT 0,
    "recurring_frequency" TEXT,
    "recurring_id" TEXT,
    "payment_method" TEXT,
    "notes" TEXT,
    "account_id" TEXT NOT NULL,
    "to_account_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "import_id" TEXT,
    "raw_description" TEXT,
    "bank_transaction_hash" TEXT,
    "stock_order_id" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_imports" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_stock_order_id_fkey" FOREIGN KEY ("stock_order_id") REFERENCES "stock_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_transactions" ("account_id", "amount", "bank_transaction_hash", "category", "created_at", "date", "description", "id", "import_id", "is_recurring", "notes", "payment_method", "raw_description", "recurring_frequency", "recurring_id", "source", "tags", "to_account_id", "type", "updated_at", "user_id") SELECT "account_id", "amount", "bank_transaction_hash", "category", "created_at", "date", "description", "id", "import_id", "is_recurring", "notes", "payment_method", "raw_description", "recurring_frequency", "recurring_id", "source", "tags", "to_account_id", "type", "updated_at", "user_id" FROM "transactions";
DROP TABLE "transactions";
ALTER TABLE "new_transactions" RENAME TO "transactions";
CREATE UNIQUE INDEX "transactions_stock_order_id_key" ON "transactions"("stock_order_id");
CREATE INDEX "transactions_user_id_date_idx" ON "transactions"("user_id", "date" DESC);
CREATE INDEX "transactions_recurring_id_idx" ON "transactions"("recurring_id");
CREATE INDEX "transactions_user_id_bank_transaction_hash_idx" ON "transactions"("user_id", "bank_transaction_hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "stock_holdings_account_id_idx" ON "stock_holdings"("account_id");

-- CreateIndex
CREATE INDEX "stock_orders_account_id_idx" ON "stock_orders"("account_id");
