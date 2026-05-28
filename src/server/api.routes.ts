import { Router, Request, Response } from 'express';
import { SheetsService } from './sheets.service.js';
import { requireAuth, ensureFreshToken, getSheetsClientForUser } from './auth/oauth.js';

// Build a SheetsService scoped to the authenticated session user.
// Refreshes the access token if needed.
async function sheetsForRequest(req: Request): Promise<SheetsService> {
  const user = await ensureFreshToken(req.session.user!);
  req.session.user = user; // persist refreshed token
  const auth = getSheetsClientForUser(user);
  return new SheetsService(auth, user.spreadsheetId);
}

export function createApiRouter(): Router {
  const router = Router();

  // All API routes require authentication
  router.use(requireAuth);

  const ok = (res: Response, data: any, message?: string): void => {
    res.json({ success: true, data, message });
  };

  const fail = (res: Response, error: any, status = 500): void => {
    res.status(status).json({ success: false, data: null, error: String(error?.message ?? error) });
  };

  const id = (req: Request): string => String(req.params['id']);

  // ── Transactions ────────────────────────────────────────────────────────────

  router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      let transactions = await sheets.getTransactions();
      const { type, category, dateFrom, dateTo, search, minAmount, maxAmount } = req.query as Record<string, string>;

      if (type && type !== 'all') transactions = transactions.filter(t => t.type === type);
      if (category) transactions = transactions.filter(t => t.category === category);
      if (dateFrom) transactions = transactions.filter(t => t.date >= dateFrom);
      if (dateTo) transactions = transactions.filter(t => t.date <= dateTo);
      if (search) {
        const q = search.toLowerCase();
        transactions = transactions.filter(t =>
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.notes?.toLowerCase().includes(q) ?? false)
        );
      }
      if (minAmount) transactions = transactions.filter(t => t.amount >= parseFloat(minAmount));
      if (maxAmount) transactions = transactions.filter(t => t.amount <= parseFloat(maxAmount));

      transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      ok(res, transactions);
    } catch (e) { fail(res, e); }
  });

  router.get('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const t = await sheets.getTransactionById(id(req));
      if (!t) { fail(res, 'Transaction not found', 404); return; }
      ok(res, t);
    } catch (e) { fail(res, e); }
  });

  router.post('/transactions', async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, amount, category, description, date, tags, isRecurring,
              recurringFrequency, paymentMethod, notes } = req.body;
      if (!type || !amount || !category || !description || !date) {
        fail(res, 'Missing required fields: type, amount, category, description, date', 400);
        return;
      }
      const sheets = await sheetsForRequest(req);
      const t = await sheets.createTransaction({
        type, amount: parseFloat(amount), category, description, date,
        tags: tags ?? [], isRecurring: isRecurring ?? false,
        recurringFrequency, paymentMethod, notes
      });
      ok(res, t, 'Transaction created');
    } catch (e) { fail(res, e); }
  });

  router.put('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const t = await sheets.updateTransaction(id(req), req.body);
      if (!t) { fail(res, 'Transaction not found', 404); return; }
      ok(res, t, 'Transaction updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const deleted = await sheets.deleteTransaction(id(req));
      if (!deleted) { fail(res, 'Transaction not found', 404); return; }
      ok(res, null, 'Transaction deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Categories ──────────────────────────────────────────────────────────────

  router.get('/categories', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const cats = await sheets.getCategories();
      ok(res, cats);
    } catch (e) { fail(res, e); }
  });

  router.post('/categories', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, type, icon, color, budget } = req.body;
      if (!name || !type) { fail(res, 'Missing required fields: name, type', 400); return; }
      const sheets = await sheetsForRequest(req);
      const cat = await sheets.createCategory({ name, type, icon: icon ?? '💰', color: color ?? '#607D8B', budget });
      ok(res, cat, 'Category created');
    } catch (e) { fail(res, e); }
  });

  router.put('/categories/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const cat = await sheets.updateCategory(id(req), req.body);
      if (!cat) { fail(res, 'Category not found', 404); return; }
      ok(res, cat, 'Category updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/categories/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const deleted = await sheets.deleteCategory(id(req));
      if (!deleted) { fail(res, 'Category not found', 404); return; }
      ok(res, null, 'Category deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Budgets ─────────────────────────────────────────────────────────────────

  router.get('/budgets', async (req: Request, res: Response): Promise<void> => {
    try {
      const { year, month } = req.query as Record<string, string>;
      const sheets = await sheetsForRequest(req);
      const budgets = await sheets.getBudgets(
        year ? parseInt(year) : undefined,
        month ? parseInt(month) : undefined
      );
      ok(res, budgets);
    } catch (e) { fail(res, e); }
  });

  router.post('/budgets', async (req: Request, res: Response): Promise<void> => {
    try {
      const { categoryId, categoryName, amount, period, month, year } = req.body;
      if (!categoryId || !amount || !year) { fail(res, 'Missing required fields', 400); return; }
      const sheets = await sheetsForRequest(req);
      const budget = await sheets.createBudget({
        categoryId, categoryName, amount: parseFloat(amount),
        period: period ?? 'monthly', month: month ? parseInt(month) : undefined,
        year: parseInt(year)
      });
      ok(res, budget, 'Budget created');
    } catch (e) { fail(res, e); }
  });

  router.put('/budgets/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const budget = await sheets.updateBudget(id(req), req.body);
      if (!budget) { fail(res, 'Budget not found', 404); return; }
      ok(res, budget, 'Budget updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/budgets/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const deleted = await sheets.deleteBudget(id(req));
      if (!deleted) { fail(res, 'Budget not found', 404); return; }
      ok(res, null, 'Budget deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Reports ─────────────────────────────────────────────────────────────────

  router.get('/reports/monthly', async (req: Request, res: Response): Promise<void> => {
    try {
      const { year, month } = req.query as Record<string, string>;
      if (!year || !month) { fail(res, 'year and month are required', 400); return; }
      const sheets = await sheetsForRequest(req);
      const report = await sheets.getMonthlyReport(parseInt(year), parseInt(month));
      ok(res, report);
    } catch (e) { fail(res, e); }
  });

  router.get('/reports/yearly', async (req: Request, res: Response): Promise<void> => {
    try {
      const { year } = req.query as Record<string, string>;
      if (!year) { fail(res, 'year is required', 400); return; }
      const sheets = await sheetsForRequest(req);
      const report = await sheets.getYearlyReport(parseInt(year));
      ok(res, report);
    } catch (e) { fail(res, e); }
  });

  router.get('/reports/categories', async (req: Request, res: Response): Promise<void> => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string>;
      if (!dateFrom || !dateTo) { fail(res, 'dateFrom and dateTo are required', 400); return; }
      const sheets = await sheetsForRequest(req);
      const breakdown = await sheets.getCategoryBreakdown(dateFrom, dateTo);
      ok(res, breakdown);
    } catch (e) { fail(res, e); }
  });

  // ── Settings ────────────────────────────────────────────────────────────────

  router.get('/settings', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const settings = await sheets.getSettings();
      ok(res, settings);
    } catch (e) { fail(res, e); }
  });

  router.put('/settings', async (req: Request, res: Response): Promise<void> => {
    try {
      const sheets = await sheetsForRequest(req);
      const settings = await sheets.updateSettings(req.body);
      ok(res, settings, 'Settings updated');
    } catch (e) { fail(res, e); }
  });

  // ── Sync Status ─────────────────────────────────────────────────────────────

  router.get('/sync/status', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, {
        connected: true,
        spreadsheetId: req.session.user?.spreadsheetId ?? '',
        lastSync: new Date().toISOString()
      });
    } catch (e) { fail(res, e); }
  });

  return router;
}
