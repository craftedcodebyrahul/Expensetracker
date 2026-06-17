import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';

interface CsvRow {
  index: number;
  data: string[];
}

interface ParsedTransaction {
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  accountId: string;
  isAiSuggested?: boolean;
  isDuplicate?: boolean;
}

@Component({
  selector: 'app-bank-import',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Bank Statement Import" subtitle="Upload CSV statement, auto-classify, and import in bulk">
      <a routerLink="/transactions" class="btn btn-ghost btn-sm">← Back to Transactions</a>
    </app-header>

    <div class="import-page">
      <!-- STEP 1: Upload File -->
      @if (step() === 'upload') {
        <div class="card upload-card">
          <div class="drag-drop-area" 
               [class.dragging]="isDragging()" 
               (dragover)="onDragOver($event)" 
               (dragleave)="onDragLeave()" 
               (drop)="onDrop($event)"
               (click)="fileInput.click()">
            <span class="upload-icon">📤</span>
            <h3>Drag & Drop your statement file here</h3>
            <p class="text-muted">Supports CSV bank statement files. Max size 5MB.</p>
            <button class="btn btn-secondary btn-sm" type="button">Select File</button>
            <input #fileInput type="file" accept=".csv" style="display: none;" (change)="onFileSelected($event)">
          </div>
        </div>
      }

      <!-- STEP 2: Map Columns -->
      @if (step() === 'map' && parsedRows().length > 0) {
        <div class="card mapping-card">
          <div class="card-header">
            <h3 class="card-title">Map CSV Columns</h3>
            <p class="subtitle text-muted">Identify how your CSV file columns map to transaction fields.</p>
          </div>

          <div class="form-row" style="margin-bottom: 1.5rem;">
            <!-- Target Account -->
            <div class="form-group flex-fill">
              <label class="form-label">Target Account *</label>
              <select class="form-control" [(ngModel)]="mapping.accountId">
                <option value="">Select Account...</option>
                @for (acc of accountService.accounts(); track acc.id) {
                  <option [value]="acc.id">{{ acc.name }} ({{ acc.type | titlecase }})</option>
                }
              </select>
            </div>
            
            <!-- Default Type -->
            <div class="form-group">
              <label class="form-label">Fallback Type</label>
              <select class="form-control" [(ngModel)]="mapping.defaultType">
                <option value="detect">Auto-detect from amount sign</option>
                <option value="expense">Expense (negative values)</option>
                <option value="income">Income (positive values)</option>
              </select>
            </div>
          </div>

          <div class="mapping-grid">
            <!-- Date Column -->
            <div class="form-group">
              <label class="form-label">Date Column *</label>
              <select class="form-control" [(ngModel)]="mapping.dateCol">
                <option value="-1">Select Date column...</option>
                @for (h of csvHeaders(); track $index) {
                  <option [value]="$index">{{ h }}</option>
                }
              </select>
            </div>

            <!-- Description Column -->
            <div class="form-group">
              <label class="form-label">Description Column *</label>
              <select class="form-control" [(ngModel)]="mapping.descCol">
                <option value="-1">Select Description column...</option>
                @for (h of csvHeaders(); track $index) {
                  <option [value]="$index">{{ h }}</option>
                }
              </select>
            </div>

            <!-- Amount Column -->
            <div class="form-group">
              <label class="form-label">Amount Column *</label>
              <select class="form-control" [(ngModel)]="mapping.amountCol">
                <option value="-1">Select Amount column...</option>
                @for (h of csvHeaders(); track $index) {
                  <option [value]="$index">{{ h }}</option>
                }
              </select>
            </div>

            <!-- Skip first row header -->
            <div class="form-group check-group" style="justify-content: flex-end; padding-bottom: 0.5rem;">
              <label class="checkbox-container">
                <input type="checkbox" [(ngModel)]="mapping.hasHeader">
                <span class="checkmark"></span>
                First row is header list
              </label>
            </div>
          </div>

          <!-- Preview Table -->
          <div class="preview-section" style="margin-top: 1.5rem;">
            <p class="section-label">CSV Preview (First 3 rows)</p>
            <div class="table-wrapper">
              <table class="preview-table">
                <thead>
                  <tr>
                    @for (h of csvHeaders(); track $index) {
                      <th>Column {{ $index + 1 }} ({{ h }})</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of parsedRows().slice(0, 3); track row.index) {
                    <tr>
                      @for (cell of row.data; track $index) {
                        <td>{{ cell }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="card-footer" style="display: flex; justify-content: space-between; margin-top: 1.5rem;">
            <button class="btn btn-ghost" (click)="step.set('upload')">Cancel</button>
            <button class="btn btn-primary" (click)="applyMapping()" [disabled]="!isMappingValid()">
              Process & Review →
            </button>
          </div>
        </div>
      }

      <!-- STEP 3: Review Grid -->
      @if (step() === 'review' && transactions().length > 0) {
        <div class="card review-card">
          <div class="review-header">
            <div>
              <h3 class="card-title">Review & Classify</h3>
              <p class="subtitle text-muted">Double check transaction details and categories before importing.</p>
            </div>
            
            <div style="display: flex; gap: 0.75rem;">
              @if (getUncategorizedCount() > 0) {
                <button class="btn btn-secondary btn-sm" 
                        [disabled]="aiClassifying() || isAiComplete()" 
                        (click)="suggestRemainingWithAi()">
                  @if (aiClassifying()) {
                    <span class="btn-spinner-sm"></span>
                    <span>Classifying...</span>
                  } @else {
                    <span>🔮 Suggest remaining with AI (1 Hit)</span>
                  }
                </button>
              }
              <button class="btn btn-primary btn-sm" [disabled]="saving()" (click)="saveTransactions()">
                @if (saving()) {
                  <span class="btn-spinner-sm"></span>
                  <span>Saving...</span>
                } @else {
                  <span>📥 Save & Import ({{ transactions().length }} rows)</span>
                }
              </button>
            </div>
          </div>

          <!-- Quick Stats Bar -->
          <div class="stats-row" style="margin-bottom: 1rem; display: flex; gap: 1rem; background: var(--bg-body); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border);">
            <div class="stat-item">
              <span class="label">Total parsed: </span>
              <span class="val font-semibold">{{ transactions().length }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="label text-income">Income: </span>
              <span class="val text-income font-semibold">{{ getIncomeCount() }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="label text-expense">Expenses: </span>
              <span class="val text-expense font-semibold">{{ getExpenseCount() }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="label">Uncategorized: </span>
              <span class="val font-semibold" [class.text-expense]="getUncategorizedCount() > 0" [class.text-income]="getUncategorizedCount() === 0">
                {{ getUncategorizedCount() }}
              </span>
            </div>
          </div>

          <div class="table-wrapper review-table-wrapper" style="max-height: 50vh; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th class="text-right">Amount</th>
                  <th class="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (txn of transactions(); track $index) {
                  <tr>
                    <td style="white-space: nowrap;">
                      <input type="date" class="form-control table-input" [(ngModel)]="txn.date">
                    </td>
                    <td>
                      <input type="text" class="form-control table-input" [(ngModel)]="txn.description" style="min-width: 180px;">
                    </td>
                    <td>
                      <select class="form-control table-input" [(ngModel)]="txn.type" (change)="onTypeChanged(txn)">
                        <option value="expense">📉 Expense</option>
                        <option value="income">📈 Income</option>
                      </select>
                    </td>
                    <td>
                      <select class="form-control table-input" 
                              [(ngModel)]="txn.category" 
                              [style.border-left]="'3px solid ' + getCategoryColor(txn.category)">
                        <option value="">Choose category...</option>
                        @for (cat of (txn.type === 'income' ? categoryService.incomeCategories() : categoryService.expenseCategories()); track cat.id) {
                          <option [value]="cat.id">{{ cat.icon }} {{ cat.name }}</option>
                        }
                      </select>
                    </td>
                    <td class="text-right font-semibold" [class.text-income]="txn.type === 'income'" [class.text-expense]="txn.type === 'expense'">
                      {{ txn.amount | currencyFormat }}
                    </td>
                    <td class="text-right">
                      @if (txn.isDuplicate) {
                        <span class="badge badge-future" style="background: rgba(239,83,80,0.15); color: var(--expense-color);">Duplicate skipped</span>
                      } @else if (txn.isAiSuggested) {
                        <span class="badge" style="background: rgba(92,107,192,0.15); color: var(--accent-blue-light);">✨ AI</span>
                      } @else if (txn.category) {
                        <span class="badge" style="background: rgba(76,175,80,0.15); color: var(--income-color);">⚡ Local</span>
                      } @else {
                        <span class="badge" style="background: rgba(255,193,7,0.15); color: var(--accent-yellow);">Unmapped</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="card-footer" style="display: flex; justify-content: space-between; margin-top: 1.5rem;">
            <button class="btn btn-ghost" (click)="step.set('map')">← Back to mapping</button>
            <button class="btn btn-primary" [disabled]="saving()" (click)="saveTransactions()">
              @if (saving()) {
                <span class="btn-spinner-sm"></span>
                <span>Saving...</span>
              } @else {
                <span>Import Transactions</span>
              }
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .import-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.5rem; }
    
    .upload-card {
      padding: 3rem 2rem;
      text-align: center;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .drag-drop-area {
      border: 2px dashed var(--border-light);
      border-radius: var(--radius-lg);
      padding: 3rem;
      width: 100%;
      max-width: 600px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      transition: var(--transition);
      background: rgba(255, 255, 255, 0.005);
    }
    .drag-drop-area.dragging {
      border-color: var(--accent-blue);
      background: rgba(92, 107, 192, 0.05);
    }
    .upload-icon {
      font-size: 3rem;
    }
    .drag-drop-area h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }
    
    .mapping-card, .review-card {
      padding: 1.5rem;
    }
    
    .mapping-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .section-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    
    .preview-table th, .preview-table td {
      font-size: 0.75rem;
      padding: 0.5rem;
    }
    
    .review-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 1rem;
    }
    
    .table-input {
      padding: 0.25rem 0.5rem !important;
      font-size: 0.8125rem !important;
      height: 28px !important;
      min-width: 100px;
    }
    
    .badge-future {
      font-size: 0.65rem;
      padding: 0.15rem 0.35rem;
    }
    
    .stat-divider {
      width: 1px;
      height: 16px;
      background: var(--border);
      align-self: center;
    }
    
    .stat-item {
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }
    
    .checkmark {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-right: 0.5rem;
      vertical-align: middle;
    }
    
    @media (max-width: 768px) {
      .import-page { padding: 1rem; }
      .review-header { flex-direction: column; align-items: stretch; gap: 1rem; }
      .stats-row { flex-direction: column; gap: 0.5rem; }
      .stat-divider { display: none; }
    }
  `]
})
export class BankImportComponent implements OnInit {
  api = inject(ApiService);
  accountService = inject(AccountService);
  categoryService = inject(CategoryService);
  private toast = inject(ToastService);
  private router = inject(Router);

  step = signal<'upload' | 'map' | 'review'>('upload');
  isDragging = signal(false);
  parsedRows = signal<CsvRow[]>([]);
  csvHeaders = signal<string[]>([]);
  transactions = signal<ParsedTransaction[]>([]);
  aiClassifying = signal(false);
  isAiComplete = signal(false);
  saving = signal(false);

  mapping = {
    accountId: '',
    defaultType: 'detect' as 'detect' | 'expense' | 'income',
    dateCol: -1,
    descCol: -1,
    amountCol: -1,
    hasHeader: true
  };

  ngOnInit() {
    this.accountService.loadAccounts().subscribe();
    this.categoryService.loadCategories().subscribe();
  }

  // ── STEP 1: Drag & Drop Handlers ──
  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave() {
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      this.processFile(e.dataTransfer.files[0]);
    }
  }

  onFileSelected(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.processFile(target.files[0]);
    }
  }

  private processFile(file: File) {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      this.toast.error('Only CSV format files are supported.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      this.parseCsvContent(text);
    };
    reader.readAsText(file);
  }

  private parseCsvContent(text: string) {
    const rawLines = text.split(/\r?\n/);
    const parsed: CsvRow[] = [];
    let idx = 0;

    for (const line of rawLines) {
      if (!line.trim()) continue;
      const row: string[] = [];
      let insideQuote = false;
      let current = '';

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          row.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current.trim());
      parsed.push({ index: idx++, data: row });
    }

    if (parsed.length === 0) {
      this.toast.error('The selected file appears to be empty.');
      return;
    }

    this.parsedRows.set(parsed);
    // Pre-populate headers preview
    this.csvHeaders.set(parsed[0].data.map((h, i) => h || `Col ${i + 1}`));
    this.step.set('map');
  }

  // ── STEP 2: Mapping Logic ──
  isMappingValid() {
    return (
      this.mapping.accountId &&
      this.mapping.dateCol !== -1 &&
      this.mapping.descCol !== -1 &&
      this.mapping.amountCol !== -1
    );
  }

  applyMapping() {
    const rows = this.parsedRows();
    const startIdx = this.mapping.hasHeader ? 1 : 0;
    const items: ParsedTransaction[] = [];
    const descriptions: string[] = [];

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i].data;
      const dateVal = row[this.mapping.dateCol];
      const descVal = row[this.mapping.descCol];
      const amountVal = parseFloat(row[this.mapping.amountCol]?.replace(/[^\d.-]/g, ''));

      if (!dateVal || !descVal || isNaN(amountVal)) continue;

      // Clean date (try parsing standard formats MM/DD/YYYY, YYYY-MM-DD)
      let finalDate = dateVal.trim();
      if (finalDate.includes('/')) {
        const parts = finalDate.split('/');
        if (parts.length === 3) {
          // MM/DD/YYYY to YYYY-MM-DD
          let y = parts[2];
          let m = parts[0].padStart(2, '0');
          let d = parts[1].padStart(2, '0');
          if (y.length === 2) y = '20' + y;
          finalDate = `${y}-${m}-${d}`;
        }
      }

      // Detect type
      let type: 'income' | 'expense' = 'expense';
      if (this.mapping.defaultType === 'detect') {
        type = amountVal >= 0 ? 'income' : 'expense';
      } else {
        type = this.mapping.defaultType;
      }

      const cleanAmount = Math.abs(amountVal);

      items.push({
        date: finalDate,
        description: descVal.trim(),
        rawDescription: descVal.trim(),
        amount: cleanAmount,
        type,
        category: '',
        accountId: this.mapping.accountId
      });

      descriptions.push(descVal.trim());
    }

    if (items.length === 0) {
      this.toast.error('Could not extract any valid transactions based on your mapping.');
      return;
    }

    this.transactions.set(items);
    this.step.set('review');

    // Run local heuristic matching instantly (0 Gemini API hits)
    this.api.importHeuristics(descriptions).subscribe(res => {
      if (res.success && res.data) {
        const results = res.data;
        const currentTxns = this.transactions();
        currentTxns.forEach(t => {
          const match = results[t.rawDescription];
          if (match) {
            t.category = match;
          }
        });
        this.transactions.set([...currentTxns]);
      }
    });
  }

  // ── STEP 3: Review & AI Category Classification ──
  getIncomeCount() {
    return this.transactions().filter(t => t.type === 'income').length;
  }

  getExpenseCount() {
    return this.transactions().filter(t => t.type === 'expense').length;
  }

  getUncategorizedCount() {
    return this.transactions().filter(t => !t.category).length;
  }

  onTypeChanged(txn: ParsedTransaction) {
    txn.category = ''; // Reset category to prevent cross-type mismatch
  }

  getCategoryColor(catId: string) {
    if (!catId) return 'transparent';
    return this.categoryService.getCategoryById(catId)?.color ?? '#607D8B';
  }

  suggestRemainingWithAi() {
    const unmapped = this.transactions().filter(t => !t.category);
    if (unmapped.length === 0) return;

    this.aiClassifying.set(true);
    const itemsToClassify = unmapped.map(t => ({
      description: t.rawDescription,
      type: t.type
    }));

    this.api.predictCategoriesBatch(itemsToClassify).subscribe({
      next: res => {
        this.aiClassifying.set(false);
        if (res.success && res.data) {
          const results = res.data;
          const currentTxns = this.transactions();
          
          currentTxns.forEach(t => {
            if (!t.category) {
              const matched = results.find(r => r.description === t.rawDescription);
              if (matched && matched.categoryId) {
                t.category = matched.categoryId;
                t.isAiSuggested = true;
              }
            }
          });
          
          this.transactions.set([...currentTxns]);
          this.isAiComplete.set(true);
          this.toast.success('Successfully suggested categories for remaining items!');
        } else {
          this.toast.error(res.error ?? 'Could not run category prediction.');
        }
      },
      error: () => {
        this.aiClassifying.set(false);
        this.toast.error('Error connecting to batch classification service.');
      }
    });
  }

  saveTransactions() {
    const txns = this.transactions();
    
    // Validate required accounts & dates
    const invalid = txns.some(t => !t.date || !t.description || !t.accountId);
    if (invalid) {
      this.toast.error('Some transactions have missing details. Please correct them.');
      return;
    }

    this.saving.set(true);
    
    // Map to API structures
    const toSave = txns.map(t => ({
      type: t.type,
      amount: t.amount,
      category: t.category,
      description: t.description,
      date: t.date,
      tags: [],
      isRecurring: false,
      accountId: t.accountId,
      source: 'import',
      rawDescription: t.rawDescription
    }));

    this.api.saveBulkTransactions(toSave).subscribe({
      next: res => {
        this.saving.set(false);
        if (res.success && res.data) {
          const imported = res.data.length;
          const skipped = txns.length - imported;
          if (skipped > 0) {
            this.toast.success(`Imported ${imported} transactions. Skipped ${skipped} duplicate entries.`);
          } else {
            this.toast.success(`Successfully imported all ${imported} transactions!`);
          }
          this.router.navigate(['/transactions']);
        } else {
          this.toast.error(res.error ?? 'Failed to import transactions.');
        }
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Failed to connect to backend uploader service.');
      }
    });
  }
}
