import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import session from 'express-session';
import { join } from 'node:path';
import { createAuthRouter } from './server/auth/auth.routes.js';
import { createApiRouter } from './server/api.routes.js';

// Load .env — resolve path relative to the project root (two levels up from dist/server/)
// Works both when running `npm start` (dev) and `npm run serve:ssr:*` (built)
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

try {
  const { config } = await import('dotenv');
  const serverDir = dirname(fileURLToPath(import.meta.url));
  // Candidates from most-specific to least: handles both dev (src/) and prod (dist/.../server/)
  const candidates = [
    resolve(serverDir, '.env'),
    resolve(serverDir, '..', '.env'),
    resolve(serverDir, '..', '..', '.env'),
    resolve(serverDir, '..', '..', '..', '.env'),
    resolve(process.cwd(), '.env'),
  ];
  let loaded = false;
  for (const p of candidates) {
    if (existsSync(p)) {
      config({ path: p, override: true });
      console.log(`✅ Loaded .env from: ${p}`);
      loaded = true;
      break;
    }
  }
  if (!loaded) console.warn('⚠️  No .env file found — using system environment variables');
} catch (e) {
  console.warn('⚠️  dotenv not available:', e);
}

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
const angularApp = new AngularNodeAppEngine();

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Sessions ──────────────────────────────────────────────────────────────────
const SESSION_SECRET = process.env['SESSION_SECRET'] ?? 'fintrack-dev-secret-change-in-production';

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env['NODE_ENV'] === 'production', // HTTPS only in prod
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
  name: 'fintrack.sid',
}));

// ── Auth routes (/auth/google, /auth/google/callback, /auth/logout, /auth/me) ─
app.use('/auth', createAuthRouter());

// ── API routes (/api/*) — protected by requireAuth middleware ─────────────────
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

// ── Start server ──────────────────────────────────────────────────────────────
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error?: Error) => {
    if (error) throw error;
    console.log(`\n🚀 FinTrack Pro running at http://localhost:${port}`);
    console.log(`   Google OAuth: ${process.env['GOOGLE_CLIENT_ID'] ? '✅ configured' : '⚠️  not configured (set GOOGLE_CLIENT_ID)'}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
