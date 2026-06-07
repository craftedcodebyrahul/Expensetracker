import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import {
  createOAuthClient,
  generateOAuthState,
  verifyOAuthState,
  GOOGLE_SCOPES,
  SessionUser,
  getSession,
  setSession,
  clearSession,
} from './oauth.js';
import { prisma } from '../db.js';
import { dbService } from '../db.service.js';

export function createAuthRouter(): Router {
  const router = Router();

  // ── Step 1: Redirect to Google ────────────────────────────────────────────
  // State is an HMAC-signed token — no session cookie needed to store it.
  // This avoids the Vercel Lambda adapter issue where res.redirect() can bypass
  // cookie-session's on-headers hook, causing Set-Cookie to be dropped.

  router.get('/google', (req: Request, res: Response): void => {
    const state = generateOAuthState();

    const oauth2Client = createOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state,
    });

    res.redirect(url);
  });

  // ── Step 2: Handle Google callback ───────────────────────────────────────

  router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      res.redirect(`/login?auth_error=${encodeURIComponent(error)}`);
      return;
    }

    // Verify the HMAC signature — no session lookup needed
    if (!state || !verifyOAuthState(state)) {
      res.redirect('/login?auth_error=invalid_state');
      return;
    }

    try {
      // Exchange code for tokens (only needed to get user profile — not stored)
      const oauth2Client = createOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Fetch Google profile
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      if (!profile.id || !profile.email) {
        res.redirect('/login?auth_error=no_profile');
        return;
      }

      const now = new Date().toISOString();

      // Upsert user into DB (create on first login, update name/picture on subsequent logins)
      await prisma.user.upsert({
        where: { id: profile.id },
        update: {
          name: profile.name ?? profile.email,
          picture: profile.picture ?? '',
        },
        create: {
          id: profile.id,
          email: profile.email,
          name: profile.name ?? profile.email,
          picture: profile.picture ?? '',
          createdAt: now,
        },
      });

      // Seed default categories, accounts, and settings for new users
      await dbService.initializeUser(profile.id);

      // Store minimal user info in session — no tokens needed beyond this point
      const user: SessionUser = {
        userId: profile.id,
        email: profile.email,
        name: profile.name ?? profile.email,
        picture: profile.picture ?? '',
      };

      setSession(req, { user });

      res.redirect('/dashboard');
    } catch (err: any) {
      console.error('OAuth callback error:', err.message);
      res.redirect(`/login?auth_error=${encodeURIComponent(err.message ?? 'unknown_error')}`);
    }
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  router.post('/logout', (req: Request, res: Response): void => {
    clearSession(req);
    res.json({ success: true, data: null });
  });

  // ── Current user ──────────────────────────────────────────────────────────

  router.get('/me', (req: Request, res: Response): void => {
    const session = getSession(req);
    const user = session['user'] as SessionUser | undefined;

    if (!user) {
      res.json({ success: true, data: null });
      return;
    }

    res.json({ success: true, data: user });
  });

  return router;
}
