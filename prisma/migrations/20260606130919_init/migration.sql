-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "picture" TEXT,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "initial_balance" REAL NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '💰',
    "color" TEXT NOT NULL DEFAULT '#607D8B',
    "budget" REAL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
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
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_imports" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recurring_schedules" (
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
    "created_at" TEXT NOT NULL,
    CONSTRAINT "recurring_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_schedules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurring_schedules_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "period" TEXT NOT NULL,
    "month" INTEGER,
    "year" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currency_symbol" TEXT NOT NULL DEFAULT '$',
    "date_format" TEXT NOT NULL DEFAULT 'MM/dd/yyyy',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "bank_name" TEXT,
    "file_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "date_from" TEXT,
    "date_to" TEXT,
    "error_message" TEXT,
    "created_at" TEXT NOT NULL,
    "completed_at" TEXT,
    CONSTRAINT "bank_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "transactions"("user_id", "date" DESC);

-- CreateIndex
CREATE INDEX "transactions_recurring_id_idx" ON "transactions"("recurring_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_bank_transaction_hash_idx" ON "transactions"("user_id", "bank_transaction_hash");

-- CreateIndex
CREATE INDEX "recurring_schedules_user_id_is_active_next_due_date_idx" ON "recurring_schedules"("user_id", "is_active", "next_due_date");

-- CreateIndex
CREATE INDEX "budgets_user_id_year_month_idx" ON "budgets"("user_id", "year", "month");

-- CreateIndex
CREATE INDEX "bank_imports_user_id_created_at_idx" ON "bank_imports"("user_id", "created_at" DESC);
