// Vercel serverless entry point (ESM)
// Must be .mjs so Vercel treats it as an ES module — server.mjs uses ESM too.

import { app } from '../dist/Expensetracker/server/server.mjs';

export default app;
