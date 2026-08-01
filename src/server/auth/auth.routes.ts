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

  if (process.env['NODE_ENV'] !== 'production') {
    router.get('/dev-login', async (req: Request, res: Response): Promise<void> => {
      try {
        const targetUserId = (req.query['userId'] as string) || 'dev_test_user_id';
        const profile = {
          id: targetUserId,
          email: `${targetUserId}@example.com`,
          name: 'Developer Test User',
          picture: '',
        };
        const now = new Date().toISOString();

        await prisma.user.upsert({
          where: { id: profile.id },
          update: {
            name: profile.name,
            picture: profile.picture,
          },
          create: {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
            createdAt: now,
          },
        });

        await dbService.initializeUser(profile.id);

        const user: SessionUser = {
          userId: profile.id,
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
        };

        setSession(req, { user });

        console.log('[DEBUG /auth/dev-login] Developer Session set successfully:', {
          userId: user.userId,
          email: user.email,
        });

        res.status(200).send(`<!doctype html><html><head><meta charset="utf-8">
<script>window.location.replace('/dashboard');</script>
</head><body>Signing you in as ${user.userId}…</body></html>`);
      } catch (err: any) {
        console.error('Dev login error:', err.message);
        res.redirect(`/login?auth_error=${encodeURIComponent(err.message ?? 'unknown_error')}`);
      }
    });
  }

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

      console.log('[DEBUG /google/callback] Session set successfully:', {
        userId: user.userId,
        email: user.email,
        secure: req.secure,
        trustProxy: req.app.get('trust proxy'),
        headersCookie: req.headers.cookie ? 'present' : 'absent',
      });

      // WHY: On Vercel's Lambda adapter, res.redirect() bypasses cookie-session's
      // on-headers hook so Set-Cookie is dropped. The session cookie only gets
      // written correctly on a proper 200 response. We send a tiny HTML page
      // that immediately redirects client-side — the browser stores the cookie
      // from this 200 response, then navigates to /dashboard with it.
      res.status(200).send(`<!doctype html><html><head><meta charset="utf-8">
<script>window.location.replace('/dashboard');</script>
</head><body>Signing you in…</body></html>`);
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

    console.log('[DEBUG /auth/me] Request status:', {
      hasSession: !!(req as any).session,
      hasUser: !!user,
      user: user,
      secure: req.secure,
      trustProxy: req.app.get('trust proxy'),
      headersCookie: req.headers.cookie ? 'present' : 'absent',
    });

    if (!user) {
      res.json({ success: true, data: null });
      return;
    }

    res.json({ success: true, data: user });
  });

  return router;
}
