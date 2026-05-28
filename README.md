# FinTrack Pro — Personal Finance Tracker

A professional, multi-user expense tracker built with **Angular 21 + Express + Google OAuth 2.0**.  
Each user signs in with their Google account and gets their own private Google Spreadsheet as a database.

## Features

- 🔐 **Google Sign-In** — OAuth 2.0, no passwords, no user database needed
- 📊 **Dashboard** — Income/expense summary, net balance, savings rate, live charts
- 💳 **Transactions** — Add, edit, delete, filter, search, tag, export to CSV
- 🎯 **Budgets** — Monthly spending limits with visual progress and alerts
- 🏷️ **Categories** — Custom categories with emoji icons and colors
- 📈 **Reports** — Monthly/yearly analytics with charts and breakdowns
- 📋 **Google Sheets** — Each user's data lives in their own private spreadsheet
- 🌙 **Dark theme** — Professional dark UI

## How it works

```
User clicks "Sign in with Google"
        ↓
Google OAuth consent screen (Sheets + Drive.file scopes)
        ↓
App creates "FinTrack Pro — My Finances" spreadsheet in user's Drive
        ↓
All transactions/budgets/categories read & written to that spreadsheet
        ↓
User can also open the spreadsheet directly in Google Sheets
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Create Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable these APIs:
   - **Google Sheets API**
   - **Google Drive API**
   - **Google OAuth2 API** (People API)
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add Authorized redirect URIs:
   - `http://localhost:4000/auth/google/callback` (development)
   - `https://yourdomain.com/auth/google/callback` (production)
7. Copy the **Client ID** and **Client Secret**

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
SESSION_SECRET=generate_with_node_-e_crypto_randomBytes_32_hex
PORT=4000
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Build and run

```bash
npm run build
npm run serve:ssr:Expensetracker
```

Open **http://localhost:4000** → click **Continue with Google** → done.

### Development

```bash
npm start
```

> In dev mode the Angular dev server runs on port 4200. For full OAuth + API functionality, run the SSR server (`npm run serve:ssr:Expensetracker`) and visit port 4000.

## Deployment

Set these environment variables on your server/platform:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://yourdomain.com/auth/google/callback` |
| `SESSION_SECRET` | Long random string (32+ chars) |
| `PORT` | Server port (default: 4000) |
| `NODE_ENV` | Set to `production` |

In production, also add your domain to the **Authorized redirect URIs** in Google Console.

## Project Structure

```
src/
├── app/
│   ├── core/
│   │   ├── guards/          # authGuard, guestGuard
│   │   ├── models/          # TypeScript interfaces
│   │   └── services/        # AuthService, ApiService, TransactionService…
│   ├── features/
│   │   ├── auth/            # Login page
│   │   ├── dashboard/       # Dashboard with charts
│   │   ├── transactions/    # Transaction list + form
│   │   ├── budgets/         # Budget management
│   │   ├── categories/      # Category management
│   │   ├── reports/         # Analytics & reports
│   │   └── settings/        # Account + preferences
│   ├── layout/              # Sidebar (with user avatar), header
│   └── shared/              # Pipes, toast component
└── server/
    ├── auth/
    │   ├── oauth.ts         # OAuth2 client, session types, token refresh
    │   └── auth.routes.ts   # /auth/google, /auth/google/callback, /auth/logout, /auth/me
    ├── sheets.service.ts    # Google Sheets read/write (per-user OAuth client)
    └── api.routes.ts        # REST API — all routes protected by requireAuth
```

## Google Sheets structure

Each user gets one spreadsheet with four sheets:

| Sheet | Contents |
|-------|----------|
| `Transactions` | id, type, amount, category, description, date, tags, … |
| `Categories` | id, name, type, icon, color, budget |
| `Budgets` | id, categoryId, amount, period, month, year |
| `Settings` | key/value pairs (currency, dateFormat, …) |
