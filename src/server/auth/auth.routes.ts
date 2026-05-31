import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import {
  createOAuthClient,
  GOOGLE_SCOPES,
  SessionUser,
  getSheetsClientForUser,
  getSession,
  setSession,
  clearSession,
} from './oauth.js';
import { SheetsService } from '../sheets.service.js';

export function createAuthRouter(): Router {
  const router = Router();

  // ── Step 1: Redirect to Google ──────────────────────────────────────────────

  router.get('/google', (req: Request, res: Response): void => {
    const state = crypto.randomBytes(16).toString('hex');
    setSession(req, { oauthState: state });

    const oauth2Client = createOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state,
    });

    res.redirect(url);
  });

  // ── Step 2: Handle Google callback ─────────────────────────────────────────

  router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query as Record<string, string>;
    const session = getSession(req);

    if (error) {
      res.redirect(`/login?auth_error=${encodeURIComponent(error)}`);
      return;
    }

    if (!state || state !== session['oauthState']) {
      res.redirect('/login?auth_error=invalid_state');
      return;
    }

    setSession(req, { oauthState: undefined });

    try {
      const oauth2Client = createOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      if (!profile.id || !profile.email) {
        res.redirect('/login?auth_error=no_profile');
        return;
      }

      const spreadsheetId = await findOrCreateSpreadsheet(oauth2Client, profile.email);

      const user: SessionUser = {
        googleId: profile.id,
        email: profile.email,
        name: profile.name ?? profile.email,
        picture: profile.picture ?? '',
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token ?? '',
        spreadsheetId,
        tokenExpiry: tokens.expiry_date ?? (Date.now() + 3600 * 1000),
      };

      setSession(req, { user });

      const sheetsService = new SheetsService(getSheetsClientForUser(user), spreadsheetId);
      await sheetsService.initialize();

      res.redirect('/');
    } catch (err: any) {
      console.error('OAuth callback error:', err.message);
      res.redirect(`/login?auth_error=${encodeURIComponent(err.message ?? 'unknown_error')}`);
    }
  });

  // ── Logout ──────────────────────────────────────────────────────────────────

  router.post('/logout', (req: Request, res: Response): void => {
    clearSession(req);
    res.json({ success: true, data: null });
  });

  // ── Current user ────────────────────────────────────────────────────────────

  router.get('/me', (req: Request, res: Response): void => {
    const session = getSession(req);
    const user = session['user'] as SessionUser | undefined;

    if (!user) {
      res.json({ success: true, data: null });
      return;
    }

    const { googleId: _g, accessToken: _a, refreshToken: _r, ...safe } = user;
    res.json({ success: true, data: safe });
  });

  return router;
}

// ── Find or create the user's FinTrack spreadsheet ───────────────────────────

async function findOrCreateSpreadsheet(
  auth: ReturnType<typeof createOAuthClient>,
  email: string
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });
  const SPREADSHEET_NAME = 'TCFlow — My Finances';

  const searchRes = await drive.files.list({
    q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const existing = searchRes.data.files?.[0];
  if (existing?.id) {
    console.log(`Found existing spreadsheet for ${email}: ${existing.id}`);
    return existing.id;
  }

  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SPREADSHEET_NAME },
      sheets: [
        { properties: { title: 'Transactions' } },
        { properties: { title: 'Categories' } },
        { properties: { title: 'Budgets' } },
        { properties: { title: 'Settings' } },
      ],
    },
  });

  const newId = createRes.data.spreadsheetId!;
  console.log(`Created new spreadsheet for ${email}: ${newId}`);
  return newId;
}
