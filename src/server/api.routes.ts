import { Router, Request, Response } from 'express';
import { dbService } from './db.service.js';
import { requireAuth, getSession, SessionUser } from './auth/oauth.js';

// ── Extract userId from session ───────────────────────────────────────────────
// Replaces the old async sheetsForRequest(req) which created a new SheetsService
// on every request with token refresh overhead. Now just a synchronous read.

function getUserId(req: Request): string {
  const session = getSession(req);
  return (session['user'] as SessionUser).userId;
}

export function createApiRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  const ok   = (res: Response, data: any, message?: string): void => {
    res.json({ success: true, data, message });
  };
  const fail = (res: Response, error: any, status = 500): void => {
    res.status(status).json({ success: false, data: null, error: String(error?.message ?? error) });
  };
  const pid  = (req: Request): string => String(req.params['id']);

  // ── Transactions ────────────────────────────────────────────────────────────

  router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const { type, category, dateFrom, dateTo, search, minAmount, maxAmount, clientDate } =
        req.query as Record<string, string>;

      let transactions = await dbService.getTransactions(userId, clientDate);

      if (type && type !== 'all')   transactions = transactions.filter(t => t.type === type);
      if (category)                 transactions = transactions.filter(t => t.category === category);
      if (dateFrom)                 transactions = transactions.filter(t => t.date >= dateFrom);
      if (dateTo)                   transactions = transactions.filter(t => t.date <= dateTo);
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

      // Already sorted desc by date from DB — but re-sort after filters
      transactions.sort((a, b) => b.date.localeCompare(a.date));

      ok(res, transactions);
    } catch (e) { fail(res, e); }
  });

  router.get('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const t = await dbService.getTransactionById(userId, pid(req));
      if (!t) { fail(res, 'Transaction not found', 404); return; }
      ok(res, t);
    } catch (e) { fail(res, e); }
  });

  router.post('/transactions', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const { type, amount, category, description, date, tags, isRecurring,
              recurringFrequency, paymentMethod, notes, accountId, toAccountId } = req.body;

      if (!type || !amount || !description || !date || !accountId ||
          (type !== 'transfer' && !category) || (type === 'transfer' && !toAccountId)) {
        fail(res, 'Missing required fields', 400); return;
      }

      const t = await dbService.createTransaction(userId, {
        type, amount: parseFloat(amount), category: category ?? '',
        description, date, tags: tags ?? [],
        isRecurring: isRecurring ?? false,
        recurringFrequency, paymentMethod, notes, accountId, toAccountId,
        source: 'manual',
      });
      ok(res, t, 'Transaction created');
    } catch (e) { fail(res, e); }
  });

  router.put('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const t = await dbService.updateTransaction(userId, pid(req), req.body);
      if (!t) { fail(res, 'Transaction not found', 404); return; }
      ok(res, t, 'Transaction updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const deleted = await dbService.deleteTransaction(userId, pid(req));
      if (!deleted) { fail(res, 'Transaction not found', 404); return; }
      ok(res, null, 'Transaction deleted');
    } catch (e) { fail(res, e); }
  });

  router.post('/transactions/recurring/:recurringId/stop', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const stopped = await dbService.stopRecurringSeries(userId, String(req.params['recurringId']));
      if (!stopped) { fail(res, 'Recurring series not found', 404); return; }
      ok(res, null, 'Recurring series stopped');
    } catch (e) { fail(res, e); }
  });

  router.delete('/transactions/recurring/:recurringId', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const deleted = await dbService.deleteRecurringSeries(userId, String(req.params['recurringId']));
      if (!deleted) { fail(res, 'Recurring series not found', 404); return; }
      ok(res, null, 'Recurring series deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Categories ──────────────────────────────────────────────────────────────

  router.get('/categories', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.getCategories(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  router.post('/categories', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, type, icon, color, budget } = req.body;
      if (!name || !type) { fail(res, 'Missing required fields: name, type', 400); return; }
      ok(res, await dbService.createCategory(getUserId(req), {
        name, type, icon: icon ?? '💰', color: color ?? '#607D8B', budget,
      }), 'Category created');
    } catch (e) { fail(res, e); }
  });

  router.put('/categories/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const cat = await dbService.updateCategory(getUserId(req), pid(req), req.body);
      if (!cat) { fail(res, 'Category not found', 404); return; }
      ok(res, cat, 'Category updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/categories/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { reassignTo } = req.query as Record<string, string>;
      const result = await dbService.deleteCategory(getUserId(req), pid(req), reassignTo);
      if (!result.success) {
        if (result.hasTransactions) {
          res.status(400).json({
            success: false,
            error: 'HAS_TRANSACTIONS',
            message: `Category has ${result.count} transactions associated with it.`,
            count: result.count
          });
          return;
        }
        fail(res, 'Category not found', 404);
        return;
      }
      ok(res, null, 'Category deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Budgets ─────────────────────────────────────────────────────────────────

  router.get('/budgets', async (req: Request, res: Response): Promise<void> => {
    try {
      const { year, month } = req.query as Record<string, string>;
      ok(res, await dbService.getBudgets(
        getUserId(req),
        year  ? parseInt(year)  : undefined,
        month ? parseInt(month) : undefined,
      ));
    } catch (e) { fail(res, e); }
  });

  router.post('/budgets', async (req: Request, res: Response): Promise<void> => {
    try {
      const { categoryId, categoryName, amount, period, month, year } = req.body;
      if (!categoryId || !amount || !year) { fail(res, 'Missing required fields', 400); return; }
      ok(res, await dbService.createBudget(getUserId(req), {
        categoryId, categoryName, amount: parseFloat(amount),
        period: period ?? 'monthly',
        month: month ? parseInt(month) : undefined,
        year: parseInt(year),
      }), 'Budget created');
    } catch (e) { fail(res, e); }
  });

  router.put('/budgets/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const budget = await dbService.updateBudget(getUserId(req), pid(req), req.body);
      if (!budget) { fail(res, 'Budget not found', 404); return; }
      ok(res, budget, 'Budget updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/budgets/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!await dbService.deleteBudget(getUserId(req), pid(req))) {
        fail(res, 'Budget not found', 404); return;
      }
      ok(res, null, 'Budget deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Reports ─────────────────────────────────────────────────────────────────

  router.get('/reports/monthly', async (req: Request, res: Response): Promise<void> => {
    try {
      const { year, month, accountId } = req.query as Record<string, string>;
      if (!year || !month) { fail(res, 'year and month are required', 400); return; }
      ok(res, await dbService.getMonthlyReport(getUserId(req), parseInt(year), parseInt(month), accountId));
    } catch (e) { fail(res, e); }
  });

  router.get('/reports/yearly', async (req: Request, res: Response): Promise<void> => {
    try {
      const { year, accountId } = req.query as Record<string, string>;
      if (!year) { fail(res, 'year is required', 400); return; }
      ok(res, await dbService.getYearlyReport(getUserId(req), parseInt(year), accountId));
    } catch (e) { fail(res, e); }
  });

  router.get('/reports/executive', async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, accountId, useAi } = req.query as Record<string, string>;
      if (!startDate || !endDate) { fail(res, 'startDate and endDate are required', 400); return; }
      ok(res, await dbService.getExecutiveReport(getUserId(req), startDate, endDate, accountId, useAi === 'true'));
    } catch (e) { fail(res, e); }
  });

  router.get('/reports/categories', async (req: Request, res: Response): Promise<void> => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string>;
      if (!dateFrom || !dateTo) { fail(res, 'dateFrom and dateTo are required', 400); return; }
      ok(res, await dbService.getCategoryBreakdown(getUserId(req), dateFrom, dateTo));
    } catch (e) { fail(res, e); }
  });

  router.get('/reports/ai-advice', async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, prevStartDate, prevEndDate, useAi } = req.query as Record<string, string>;
      if (!startDate || !endDate || !prevStartDate || !prevEndDate) {
        fail(res, 'Missing parameters', 400); return;
      }
      ok(res, await dbService.getAiAdviceForPeriod(getUserId(req), startDate, endDate, prevStartDate, prevEndDate, useAi === 'true'));
    } catch (e) { fail(res, e); }
  });

  // ── Phase 3 Endpoints ──────────────────────────────────────────────────────

  router.post('/transactions/bulk', async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactions } = req.body;
      if (!transactions || !Array.isArray(transactions)) {
        fail(res, 'Missing required parameter: transactions array', 400); return;
      }
      const saved = await dbService.saveBulkTransactions(getUserId(req), transactions);
      ok(res, saved, `Imported ${saved.length} transactions successfully`);
    } catch (e) { fail(res, e); }
  });

  router.post('/transactions/import-heuristics', async (req: Request, res: Response): Promise<void> => {
    try {
      const { descriptions } = req.body;
      if (!descriptions || !Array.isArray(descriptions)) {
        fail(res, 'Missing required parameter: descriptions array', 400); return;
      }
      const userId = getUserId(req);
      const results: Record<string, string | null> = {};
      for (const desc of descriptions) {
        results[desc] = await dbService.findLocalHeuristicCategory(userId, desc);
      }
      ok(res, results);
    } catch (e) { fail(res, e); }
  });

  router.post('/ai/parse-log', async (req: Request, res: Response): Promise<void> => {
    try {
      const { sentence, clientDate } = req.body;
      if (!sentence) { fail(res, 'Missing required parameter: sentence', 400); return; }
      const parsed = await dbService.parseNaturalLanguageLog(getUserId(req), sentence, clientDate);
      ok(res, parsed);
    } catch (e) { fail(res, e); }
  });

  router.post('/ai/predict-batch', async (req: Request, res: Response): Promise<void> => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        fail(res, 'Missing required parameter: items array', 400); return;
      }
      const userId = getUserId(req);
      const predictions = await dbService.predictCategoriesBatch(userId, items);
      ok(res, predictions);
    } catch (e) { fail(res, e); }
  });

  router.post('/ai/optimize-budgets', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.optimizeBudgets(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  router.post('/ai/goal-buddy', async (req: Request, res: Response): Promise<void> => {
    try {
      const { goalId } = req.body;
      if (!goalId) { fail(res, 'Missing required parameter: goalId', 400); return; }
      ok(res, await dbService.evaluateGoalBuddy(getUserId(req), goalId));
    } catch (e) { fail(res, e); }
  });

  router.post('/ai/audit-comprehensive', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.auditComprehensive(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  // ── Goals ──────────────────────────────────────────────────────────────────

  router.get('/goals', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.getGoals(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  router.post('/goals', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, targetAmount, targetDate, currentAmount, accountId } = req.body;
      if (!name || !targetAmount || !targetDate) {
        fail(res, 'Missing required fields: name, targetAmount, targetDate', 400);
        return;
      }
      ok(res, await dbService.createGoal(getUserId(req), {
        name,
        targetAmount: parseFloat(targetAmount),
        targetDate,
        currentAmount: currentAmount != null ? parseFloat(currentAmount) : 0,
        accountId,
      }), 'Goal created');
    } catch (e) { fail(res, e); }
  });

  router.put('/goals/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const g = await dbService.updateGoal(getUserId(req), pid(req), req.body);
      if (!g) { fail(res, 'Goal not found', 404); return; }
      ok(res, g, 'Goal updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/goals/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await dbService.deleteGoal(getUserId(req), pid(req));
      if (!deleted) { fail(res, 'Goal not found', 404); return; }
      ok(res, null, 'Goal deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Exchange Rates ──────────────────────────────────────────────────────────

  router.get('/exchange-rates', async (req: Request, res: Response): Promise<void> => {
    try {
      const { getExchangeRates } = await import('./db.service.js');
      const rates = await getExchangeRates();
      ok(res, rates);
    } catch (e) { fail(res, e); }
  });

  // ── AI Suggest Category ─────────────────────────────────────────────────────

  router.get('/ai/suggest-category', async (req: Request, res: Response): Promise<void> => {
    try {
      const { description, type } = req.query as Record<string, string>;
      if (!description || !type) {
        fail(res, 'Missing required parameters: description, type', 400);
        return;
      }
      const suggestion = await dbService.suggestCategory(getUserId(req), description, type);
      ok(res, { categoryId: suggestion });
    } catch (e) { fail(res, e); }
  });

  // ── PDF Audit Printable ────────────────────────────────────────────────────

  router.get('/reports/pdf-audit', async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, accountId } = req.query as Record<string, string>;
      if (!startDate || !endDate) {
        fail(res, 'startDate and endDate are required', 400); return;
      }
      const audit = await dbService.getExecutiveReport(getUserId(req), startDate, endDate, accountId);
      
      const markdown = `
# TCFlow Financial Audit Report
**Period:** ${startDate} to ${endDate}
**Generated on:** ${new Date().toLocaleDateString()}

## 1. Executive Summary
${audit.healthOverview}

## 2. Commitments & Category Outflows
${audit.categoryAudit}

## 3. Runway & Cash buffer
${audit.runwayOutlook}

## 4. Key Action Items & Recommendations
${audit.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}

---
*FinTrack Pro — Private & Confidential*
`;
      ok(res, { markdown });
    } catch (e) { fail(res, e); }
  });

  // ── Accounts ────────────────────────────────────────────────────────────────

  router.get('/accounts', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.getAccounts(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  router.post('/accounts', async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, type, initialBalance, isInvestment } = req.body;
      if (!name || !type) { fail(res, 'Missing required fields: name, type', 400); return; }
      ok(res, await dbService.createAccount(getUserId(req), {
        name, type,
        initialBalance: initialBalance != null ? parseFloat(initialBalance) : 0,
        isInvestment: !!isInvestment,
      }), 'Account created');
    } catch (e) { fail(res, e); }
  });

  router.put('/accounts/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const acc = await dbService.updateAccount(getUserId(req), pid(req), req.body);
      if (!acc) { fail(res, 'Account not found', 404); return; }
      ok(res, acc, 'Account updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/accounts/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!await dbService.deleteAccount(getUserId(req), pid(req))) {
        fail(res, 'Account not found', 404); return;
      }
      ok(res, null, 'Account deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Stock Holdings ────────────────────────────────────────────────────────

  router.post('/accounts/:id/holdings', async (req: Request, res: Response): Promise<void> => {
    try {
      const { ticker, shares } = req.body;
      if (!ticker || shares == null) { fail(res, 'Missing ticker or shares', 400); return; }
      const holding = await dbService.addStockHolding(getUserId(req), pid(req), ticker, parseFloat(shares));
      if (!holding) { fail(res, 'Account not found', 404); return; }
      ok(res, holding, 'Holding added');
    } catch (e) { fail(res, e); }
  });

  router.put('/accounts/:id/holdings/:holdingId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { shares } = req.body;
      if (shares == null) { fail(res, 'Missing shares', 400); return; }
      const holding = await dbService.updateStockHolding(getUserId(req), req.params['holdingId'] as string, parseFloat(shares));
      if (!holding) { fail(res, 'Holding not found', 404); return; }
      ok(res, holding, 'Holding updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/accounts/:id/holdings/:holdingId', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!await dbService.deleteStockHolding(getUserId(req), req.params['holdingId'] as string)) {
        fail(res, 'Holding not found', 404); return;
      }
      ok(res, null, 'Holding deleted');
    } catch (e) { fail(res, e); }
  });

  router.post('/accounts/refresh-prices', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.updateStockPrices(getUserId(req)), 'Prices refreshed');
    } catch (e) { fail(res, e); }
  });

  // ── Recurring Schedules ───────────────────────────────────────────────────
  
  router.get('/recurring/detect', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.detectRecurringBills(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  router.get('/recurring', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.getRecurringSchedules(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  router.post('/recurring', async (req: Request, res: Response): Promise<void> => {
    try {
      const { type, amount, category, description, frequency, startDate, nextDueDate, accountId, toAccountId } = req.body;
      if (!type || !amount || !frequency || !startDate || !nextDueDate || !accountId ||
          (type !== 'transfer' && !category) || (type === 'transfer' && !toAccountId)) {
        fail(res, 'Missing required fields', 400); return;
      }
      ok(res, await dbService.createRecurringSchedule(getUserId(req), {
        type, amount: parseFloat(amount), category: category ?? '',
        description, frequency, startDate, nextDueDate, accountId, toAccountId,
      }), 'Recurring schedule created');
    } catch (e) { fail(res, e); }
  });

  router.put('/recurring/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const updated = await dbService.updateRecurringSchedule(getUserId(req), pid(req), req.body);
      if (!updated) { fail(res, 'Recurring schedule not found', 404); return; }
      ok(res, updated, 'Recurring schedule updated');
    } catch (e) { fail(res, e); }
  });

  router.delete('/recurring/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!await dbService.deleteRecurringSchedule(getUserId(req), pid(req))) {
        fail(res, 'Recurring schedule not found', 404); return;
      }
      ok(res, null, 'Recurring schedule deleted');
    } catch (e) { fail(res, e); }
  });

  // ── Settings ─────────────────────────────────────────────────────────────

  router.get('/settings', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.getSettings(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  router.put('/settings', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.updateSettings(getUserId(req), req.body), 'Settings updated');
    } catch (e) { fail(res, e); }
  });

  router.post('/settings/test-report', async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportService } = await import('./report.service.js');
      await reportService.sendMonthlyReport(getUserId(req));
      ok(res, null, 'Test report sent successfully');
    } catch (e: any) {
      fail(res, e.message || e);
    }
  });

  // ── Bank Imports (future feature) ─────────────────────────────────────────

  router.get('/bank-imports', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, await dbService.getBankImports(getUserId(req)));
    } catch (e) { fail(res, e); }
  });

  // ── Sync status ──────────────────────────────────────────────────────────

  router.get('/sync/status', async (req: Request, res: Response): Promise<void> => {
    try {
      ok(res, {
        connected: true,
        provider: 'turso',
        lastSync: new Date().toISOString(),
      });
    } catch (e) { fail(res, e); }
  });

  // ── AI & Auditing Additions ───────────────────────────────────────────────

  router.get('/anomalies', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const anomalies = await dbService.scanForAnomalies(userId);
      ok(res, anomalies);
    } catch (e) { fail(res, e); }
  });

  router.post('/ai/coach', async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      const { message, history } = req.body;
      if (!message) { fail(res, 'Missing message', 400); return; }

      const accounts = await dbService.getAccounts(userId);
      const categories = await dbService.getCategories(userId);
      const txns = await dbService.getTransactions(userId);

      const summaryText = txns.slice(0, 50).map(t => 
        `- Date: ${t.date} | Desc: ${t.description} | Cat: ${categories.find(c => c.id === t.category)?.name ?? t.category} | Amt: $${t.amount} | Type: ${t.type}`
      ).join('\n');

      const accountsText = accounts.map(a => 
        `- Account: ${a.name} | Currency: ${a.currency} | Type: ${a.type}`
      ).join('\n');

      const apiKey = process.env['GEMINI_API_KEY'];
      let reply = '';

      if (apiKey) {
        try {
          const historyPrompt = (history || []).map((h: any) => 
            `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.text}`
          ).join('\n');

          const prompt = `You are a friendly, expert personal finance coach. You help the user analyze their expenses, set targets, and save money.
Here is the user's active financial context:
ACCOUNTS:
${accountsText}

RECENT TRANSACTIONS (Last 50):
${summaryText}

CONVERSATION HISTORY:
${historyPrompt}

User: ${message}

Provide a concise, helpful, and friendly reply. Direct them to specific transactions or categories if relevant. Keep it under 150 words.`;

          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          });

          if (response.ok) {
            const json = await response.json() as any;
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              reply = text.trim();
            }
          }
        } catch (err) {
          console.error('Gemini Coach API call failed:', err);
        }
      }

      if (!reply) {
        const lowercaseMsg = message.toLowerCase();
        if (lowercaseMsg.includes('hello') || lowercaseMsg.includes('hi')) {
          reply = `Hello! I'm your AI Finance Coach. Ask me anything about your transaction history, budgets, or how you can optimize your savings!`;
        } else if (lowercaseMsg.includes('budget') || lowercaseMsg.includes('spend')) {
          reply = `Based on your recent transactions, your highest spends are typically in Food and Transport. Setting monthly budgets can help keep those in check!`;
        } else if (lowercaseMsg.includes('saving') || lowercaseMsg.includes('goal')) {
          reply = `You have set some financial goals. Try to save at least 20% of your salary each month by automating a transfer on payday.`;
        } else {
          reply = `I've analyzed your recent transactions. It looks like you've spent $${txns.filter(t => t.type === 'expense').slice(0, 10).reduce((s,t) => s + t.amount, 0).toFixed(2)} across your last 10 expenses. Ask me to drill down into any specific category!`;
        }
      }

      ok(res, { reply });
    } catch (e) { fail(res, e); }
  });

  return router;
}
