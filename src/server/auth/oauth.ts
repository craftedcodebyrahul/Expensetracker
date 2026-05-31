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

// ── Scopes ────────────────────────────────────────────────────────────────────

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

// ── Session user shape ────────────────────────────────────────────────────────

export interface SessionUser {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  refreshToken: string;
  spreadsheetId: string;
  tokenExpiry: number;
}

// ── Typed session helpers ─────────────────────────────────────────────────────
// cookie-session stores data as plain properties on req.session (index-typed).
// We cast through `any` to avoid TypeScript's index-signature access rules
// and Express type overload conflicts.

export function getSession(req: Request): { user?: SessionUser; oauthState?: string } {
  return (req as any).session ?? {};
}

export function setSession(
  req: Request,
  data: Partial<{ user: SessionUser | undefined; oauthState: string | undefined }>
): void {
  const s = (req as any).session;
  if (!s) return;
  Object.assign(s, data);
}

export function clearSession(req: Request): void {
  const s = (req as any).session;
  if (!s) return;
  s['user'] = undefined;
  s['oauthState'] = undefined;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

export async function ensureFreshToken(user: SessionUser): Promise<SessionUser> {
  if (Date.now() < user.tokenExpiry - 5 * 60 * 1000) return user;

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: user.refreshToken });
  const { credentials } = await client.refreshAccessToken();

  return {
    ...user,
    accessToken: credentials.access_token ?? user.accessToken,
    tokenExpiry: credentials.expiry_date ?? Date.now() + 3600 * 1000,
  };
}

// ── Build an authenticated Sheets client for a user ───────────────────────────

export function getSheetsClientForUser(user: SessionUser) {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expiry_date: user.tokenExpiry,
  });
  return client;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: () => void): void {
  const session = getSession(req);
  if (session['user']) {
    next();
  } else {
    res.status(401).json({ success: false, data: null, error: 'Not authenticated' });
  }
}
