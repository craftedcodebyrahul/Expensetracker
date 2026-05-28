import { google } from 'googleapis';
import type { Request, Response } from 'express';

// ── OAuth2 client factory ─────────────────────────────────────────────────────

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET'],
    process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:4000/auth/google/callback'
  );
}

// ── Scopes needed ─────────────────────────────────────────────────────────────
// - userinfo.email / profile  → identify the user
// - spreadsheets              → read/write their Google Sheets
// - drive.file                → create a new spreadsheet on their Drive

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

// ── Session user type ─────────────────────────────────────────────────────────

export interface SessionUser {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  refreshToken: string;
  spreadsheetId: string; // each user's own spreadsheet
  tokenExpiry: number;   // unix ms
}

// ── Extend express-session ────────────────────────────────────────────────────

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    oauthState?: string;
  }
}

// ── Token refresh helper ──────────────────────────────────────────────────────

export async function ensureFreshToken(user: SessionUser): Promise<SessionUser> {
  // Refresh if token expires within 5 minutes
  if (Date.now() < user.tokenExpiry - 5 * 60 * 1000) return user;

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({ refresh_token: user.refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();

  return {
    ...user,
    accessToken: credentials.access_token ?? user.accessToken,
    tokenExpiry: credentials.expiry_date ?? (Date.now() + 3600 * 1000),
  };
}

// ── Build an authenticated Sheets client for a user ───────────────────────────

export function getSheetsClientForUser(user: SessionUser) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expiry_date: user.tokenExpiry,
  });
  return oauth2Client;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: () => void): void {
  if (req.session?.user) {
    next();
  } else {
    res.status(401).json({ success: false, data: null, error: 'Not authenticated' });
  }
}
