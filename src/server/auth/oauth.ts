import { google } from 'googleapis';
import crypto from 'node:crypto';
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

// ── HMAC-signed OAuth state ───────────────────────────────────────────────────
// Problem: cookie-session stores oauthState in a Set-Cookie header on a redirect
// response. On Vercel's Lambda adapter, res.redirect() can bypass the on-headers
// hook that cookie-session uses, so the cookie is never sent and the state
// comparison always fails ("invalid_state").
//
// Solution: encode the state as a self-verifying HMAC token. The state value
// itself carries a cryptographic signature that we verify on the callback —
// no session cookie needed for the OAuth round-trip.

const STATE_SECRET = process.env['SESSION_SECRET'] ?? 'fintrack-dev-secret-change-in-production';

/**
 * Generate a random state value signed with HMAC-SHA256.
 * Format: "<16-byte-hex>.<hmac-hex>"
 */
export function generateOAuthState(): string {
  const raw = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(raw).digest('hex');
  return `${raw}.${sig}`;
}

/**
 * Verify a signed state token.  Returns true if the HMAC is valid.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyOAuthState(signedState: string): boolean {
  const dot = signedState.lastIndexOf('.');
  if (dot === -1) return false;
  const raw      = signedState.slice(0, dot);
  const provided = signedState.slice(dot + 1);
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(provided,  'hex')
    );
  } catch {
    return false;
  }
}

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

export function getSession(req: Request): { user?: SessionUser } {
  return (req as any).session ?? {};
}

export function setSession(
  req: Request,
  data: Partial<{ user: SessionUser | undefined }>
): void {
  const s = (req as any).session;
  if (!s) return;
  Object.assign(s, data);
}

export function clearSession(req: Request): void {
  const s = (req as any).session;
  if (!s) return;
  s['user'] = undefined;
}

// ── Auth middleware ───────────────────────────────────────────────────────────

import { prisma } from '../db.js';

export async function requireAuth(req: Request, res: Response, next: () => void): Promise<void> {
  const session = getSession(req);
  if (session['user']) {
    return next();
  }

  // Check API key in headers or query parameters for external automations (e.g. iOS Shortcuts)
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
  const apiKey = (req.headers['x-api-key'] as string) ||
                 bearerToken ||
                 (req.query['apiKey'] as string) ||
                 (req.query['api_key'] as string);

  if (apiKey) {
    // 1. Check global env key fallback
    const configuredKey = process.env['API_KEY'] || process.env['SESSION_SECRET'];
    if (configuredKey && apiKey === configuredKey) {
      try {
        const firstUser = await prisma.user.findFirst();
        if (firstUser) {
          setSession(req, {
            user: {
              userId: firstUser.id,
              email: firstUser.email,
              name: firstUser.name,
              picture: firstUser.picture ?? '',
            }
          });
          return next();
        }
      } catch (err) {
        console.error('Failed to resolve user for global API Key:', err);
      }
    }

    // 2. Check per-user apiKey in Settings table
    try {
      const settingsRow = await prisma.settings.findFirst({ where: { apiKey } });
      if (settingsRow) {
        const userRow = await prisma.user.findUnique({ where: { id: settingsRow.userId } });
        if (userRow) {
          setSession(req, {
            user: {
              userId: userRow.id,
              email: userRow.email,
              name: userRow.name,
              picture: userRow.picture ?? '',
            }
          });
          return next();
        }
      }
    } catch (err) {
      console.error('Failed to resolve user for personal API Key:', err);
    }
  }

  res.status(401).json({ success: false, data: null, error: 'Not authenticated' });
}
