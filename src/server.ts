import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import cookieSession from 'cookie-session';
import { join } from 'node:path';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// ── Load .env (local dev only — Vercel uses dashboard env vars) ───────────────
try {
  const { config } = await import('dotenv');
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(serverDir, '.env'),
    resolve(serverDir, '..', '.env'),
    resolve(serverDir, '..', '..', '.env'),
    resolve(serverDir, '..', '..', '..', '.env'),
    resolve(process.cwd(), '.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      config({ path: p, override: true });
      console.log(`✅ Loaded .env from: ${p}`);
      break;
    }
  }
} catch { /* dotenv optional — Vercel injects env vars directly */ }

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
const angularApp = new AngularNodeAppEngine();

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Cookie-based session ──────────────────────────────────────────────────────
// Stores session data in a signed cookie — no server-side store needed.
// Works on stateless/serverless platforms (Vercel, Railway, Render).
const SESSION_SECRET = process.env['SESSION_SECRET'] ?? 'fintrack-dev-secret-change-in-production';

app.use(cookieSession({
  name: 'fintrack.session',
  keys: [SESSION_SECRET],
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  secure: process.env['NODE_ENV'] === 'production',
  httpOnly: true,
  sameSite: 'lax',
}));

// ── Auth routes (/auth/google, /auth/google/callback, /auth/logout, /auth/me) ─
const { createAuthRouter } = await import('./server/auth/auth.routes.js');
app.use('/auth', createAuthRouter());

// ── API routes (/api/*) — protected by requireAuth ────────────────────────────
const { createApiRouter } = await import('./server/api.routes.js');
app.use('/api', createApiRouter());

// ── Static files ──────────────────────────────────────────────────────────────
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// ── Angular SSR ───────────────────────────────────────────────────────────────
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  angularApp
    .handle(req)
    .then(response =>
      response ? writeResponseToNodeResponse(response, res) : next()
    )
    .catch(next);
});

// ── Start server (local / Railway / Render) ───────────────────────────────────
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error?: Error) => {
    if (error) throw error;
    console.log(`\n🚀 FinTrack Pro running at http://localhost:${port}`);
    console.log(`   Google OAuth: ${process.env['GOOGLE_CLIENT_ID'] ? '✅ configured' : '⚠️  not configured'}`);
    console.log(`   Environment:  ${process.env['NODE_ENV'] ?? 'development'}`);
  });
}

// ── Vercel serverless handler ─────────────────────────────────────────────────
export const reqHandler = createNodeRequestHandler(app);

// Also export the raw express app for the Vercel api/ entry point
export { app };
