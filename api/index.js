// Vercel serverless entry point
// Vercel calls this file for every request — it imports the built Express app
// and passes the request through it.

import { app } from '../dist/Expensetracker/server/server.mjs';

export default app;
