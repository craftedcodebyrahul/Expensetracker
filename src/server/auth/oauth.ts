import { google } from 'googleapis';
import type { Request, Response } from 'express';

// ── OAuth2 client factory ──────────────────────────────────────────────────────

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET'],
    process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:4000/auth/google/callback'
  );
}

// ── Scopes ────────────────────────────────────────────────────────────────────
// NOTE: Sheets and Drive scopes removed — data is now stored in Turso DB.
// Only user identity scopes are needed for login.

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// ── Session user shape ────────────────────────────────────────────────────────
// spreadsheetId removed — userId (Google sub) is the new identifier.
// accessToken/refreshToken/tokenExpiry removed — no Google API calls after login.

export interface SessionUser {
  userId: string;    // Google sub ID (e.g. "118312...") — primary DB key
  email: string;
  name: string;
  picture: string;
}

// ── Typed session helpers ─────────────────────────────────────────────────────

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
  s['user']       = undefined;
  s['oauthState'] = undefined;
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
