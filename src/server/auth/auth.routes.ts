import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import {
  createOAuthClient,
  GOOGLE_SCOPES,
  SessionUser,
  getSheetsClientForUser,
} from './oauth.js';
import { SheetsService } from '../sheets.service.js';

export function createAuthRouter(): Router {
  const router = Router();

  // ── Step 1: Redirect to Google ──────────────────────────────────────────────

  router.get('/google', (req: Request, res: Response): void => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;

    const oauth2Client = createOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',   // get refresh_token
      prompt: 'consent',        // always show consent to get refresh_token
      scope: GOOGLE_SCOPES,
      state,
    });

    res.redirect(url);
  });

  // ── Step 2: Handle callback ─────────────────────────────────────────────────

  router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
      return;
    }

    // CSRF check
    if (!state || state !== req.session.oauthState) {
      res.redirect('/?auth_error=invalid_state');
      return;
    }
    delete req.session.oauthState;

    try {
      const oauth2Client = createOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Fetch user profile
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      if (!profile.id || !profile.email) {
        res.redirect('/?auth_error=no_profile');
        return;
      }

      // Find or create the user's spreadsheet
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

      req.session.user = user;

      // Initialize sheets structure for this user
      const sheetsService = new SheetsService(getSheetsClientForUser(user), spreadsheetId);
      await sheetsService.initialize();

      res.redirect('/');
    } catch (err: any) {
      console.error('OAuth callback error:', err.message);
      res.redirect(`/?auth_error=${encodeURIComponent(err.message ?? 'unknown_error')}`);
    }
  });

  // ── Logout ──────────────────────────────────────────────────────────────────

  router.post('/logout', (req: Request, res: Response): void => {
    req.session.destroy(() => {
      res.json({ success: true, data: null });
    });
  });

  // ── Current user ────────────────────────────────────────────────────────────

  router.get('/me', (req: Request, res: Response): void => {
    if (!req.session.user) {
      res.json({ success: true, data: null });
      return;
    }
    const { googleId: _g, accessToken: _a, refreshToken: _r, ...safe } = req.session.user;
    res.json({ success: true, data: safe });
  });

  return router;
}

// ── Helper: find or create the user's FinTrack spreadsheet ───────────────────

async function findOrCreateSpreadsheet(
  auth: ReturnType<typeof createOAuthClient>,
  email: string
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  const SPREADSHEET_NAME = 'FinTrack Pro — My Finances';

  // Search for an existing spreadsheet with this name
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

  // Create a new spreadsheet
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
