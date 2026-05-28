import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { Category } from '../../core/models';

const PRESET_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
  '#4CAF50', '#E91E63', '#00BCD4', '#FF5722', '#9C27B0', '#607D8B'
];

const PRESET_ICONS = ['💰', '🍽️', '🚗', '🏠', '💡', '🏥', '🎬', '🛍️', '📚', '✈️', '📱', '🛡️',
  '💼', '💻', '📈', '🏘️', '🏢', '🎁', '💸', '🎯', '🔧', '🎮', '🐾', '🌿'];

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  template: `
    <app-header title="Categories" subtitle="Organize your transactions with custom categories">
      <button class="btn btn-primary btn-sm" (click)="openForm()">+ Add Category</button>
    </app-header>

    <div class="categories-page">

      <!-- Type Tabs -->
      <div class="type-tabs">
        <button class="tab-btn" [class.active]="activeTab() === 'all'" (click)="activeTab.set('all')">
          All ({{ categoryService.categories().length }})
        </button>
        <button class="tab-btn" [class.active]="activeTab() === 'expense'" (click)="activeTab.set('expense')">
          Expenses ({{ categoryService.expenseCategories().length }})
        </button>
        <button class="tab-btn" [class.active]="activeTab() === 'income'" (click)="activeTab.set('income')">
          Income ({{ categoryService.incomeCategories().length }})
        </button>
      </div>

      <!-- Categories Grid -->
      <div class="categories-grid">
        @for (cat of filteredCategories(); track cat.id) {
          <div class="category-card">
            <div class="cc-icon" [style.background]="cat.color + '22'" [style.border-color]="cat.color + '44'">
              <span>{{ cat.icon }}</span>
            </div>
            <div class="cc-info">
              <span class="cc-name">{{ cat.name }}</span>
              <span class="cc-type badge" [class.badge-income]="cat.type === 'income'"
                    [class.badge-expense]="cat.type === 'expense'"
                    [class.badge-neutral]="cat.type === 'both'">
                {{ cat.type }}
              </span>
            </div>
            <div class="cc-actions">
              <button class="btn btn-ghost btn-icon btn-sm" (click)="editCategory(cat)" aria-label="Edit">✏️</button>
              <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(cat)" aria-label="Delete">🗑️</button>
            </div>
          </div>
        }

        <!-- Add New Card -->
        <button class="add-category-card" (click)="openForm()">
          <span class="add-icon">+</span>
          <span>Add Category</span>
        </button>
      </div>
    </div>

    <!-- Category Form Modal -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>{{ editingCategory() ? 'Edit Category' : 'Add Category' }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input type="text" class="form-control" [(ngModel)]="form.name" placeholder="Category name">
            </div>

            <div class="form-group">
              <label class="form-label">Type *</label>
              <select class="form-control" [(ngModel)]="form.type">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Icon</label>
              <div class="icon-picker">
                @for (icon of presetIcons; track icon) {
                  <button class="icon-option" [class.selected]="form.icon === icon"
                          (click)="form.icon = icon" [attr.aria-label]="'Select icon ' + icon">
                    {{ icon }}
                  </button>
                }
              </div>
              <input type="text" class="form-control mt-2" [(ngModel)]="form.icon" placeholder="Or type an emoji">
            </div>

            <div class="form-group">
              <label class="form-label">Color</label>
              <div class="color-picker">
                @for (color of presetColors; track color) {
                  <button class="color-option" [style.background]="color"
                          [class.selected]="form.color === color"
                          (click)="form.color = color" [attr.aria-label]="'Select color ' + color">
                  </button>
                }
              </div>
              <div class="color-custom">
                <input type="color" [(ngModel)]="form.color" class="color-input">
                <span class="form-hint">Custom color: {{ form.color }}</span>
              </div>
            </div>

            <!-- Preview -->
            <div class="form-group">
              <label class="form-label">Preview</label>
              <div class="category-preview">
                <div class="cc-icon" [style.background]="form.color + '22'" [style.border-color]="form.color + '44'">
                  <span>{{ form.icon }}</span>
                </div>
                <span class="cc-name">{{ form.name || 'Category Name' }}</span>
                <span class="badge" [class.badge-income]="form.type === 'income'"
                      [class.badge-expense]="form.type === 'expense'"
                      [class.badge-neutral]="form.type === 'both'">
                  {{ form.type }}
                </span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeForm()">Cancel</button>
            <button class="btn btn-primary" (click)="saveCategory()" [disabled]="submitting() || !form.name">
              {{ submitting() ? 'Saving...' : (editingCategory() ? 'Update' : 'Add') + ' Category' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Delete Confirm -->
    @if (deletingCategory()) {
      <div class="modal-overlay" (click)="cancelDelete()">
        <div class="modal" style="max-width: 400px;" role="alertdialog">
          <div class="modal-header"><h3>Delete Category</h3></div>
          <div class="modal-body">
            <p>Delete <strong>{{ deletingCategory()!.name }}</strong>?</p>
            <p class="text-muted text-sm mt-2">Transactions using this category will keep the category ID but may not display correctly.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
            <button class="btn btn-danger" (click)="deleteCategory()">Delete</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .categories-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.25rem; }

    .type-tabs { display: flex; gap: 0.5rem; }
    .tab-btn {
      padding: 0.5rem 1.25rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .tab-btn:hover { background: var(--bg-card); color: var(--text-primary); }
    .tab-btn.active { background: rgba(92, 107, 192, 0.15); color: var(--accent-blue-light); border-color: var(--accent-blue); }

    .categories-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }

    .category-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.875rem;
      transition: var(--transition);
    }
    .category-card:hover { border-color: var(--border-light); }

    .cc-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-sm);
      border: 1px solid;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      flex-shrink: 0;
    }
    .cc-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
    .cc-name { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cc-type { font-size: 0.7rem; align-self: flex-start; }
    .cc-actions { display: flex; gap: 0.25rem; flex-shrink: 0; }

    .add-category-card {
      background: transparent;
      border: 2px dashed var(--border);
      border-radius: var(--radius-lg);
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
      min-height: 72px;
    }
    .add-category-card:hover { border-color: var(--accent-blue); color: var(--accent-blue-light); background: rgba(92, 107, 192, 0.05); }
    .add-icon { font-size: 1.25rem; }

    .icon-picker { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-bottom: 0.5rem; }
    .icon-option {
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-input);
      cursor: pointer;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: var(--transition);
    }
    .icon-option:hover, .icon-option.selected { border-color: var(--accent-blue); background: rgba(92, 107, 192, 0.15); }

    .color-picker { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
    .color-option {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      transition: var(--transition);
    }
    .color-option:hover, .color-option.selected { border-color: var(--text-primary); transform: scale(1.15); }
    .color-custom { display: flex; align-items: center; gap: 0.75rem; }
    .color-input { width: 40px; height: 32px; border: none; border-radius: var(--radius-sm); cursor: pointer; background: none; padding: 0; }

    .category-preview { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--bg-input); border-radius: var(--radius-sm); }
    .mt-2 { margin-top: 0.5rem; }

    @media (max-width: 768px) { .categories-page { padding: 1rem; } }
  `]
})
export class CategoriesComponent implements OnInit {
  categoryService = inject(CategoryService);
  private toast = inject(ToastService);

  activeTab = signal<'all' | 'income' | 'expense'>('all');
  showForm = signal(false);
  editingCategory = signal<Category | undefined>(undefined);
  deletingCategory = signal<Category | undefined>(undefined);
  submitting = signal(false);

  presetColors = PRESET_COLORS;
  presetIcons = PRESET_ICONS;

  form = { name: '', type: 'expense' as 'income' | 'expense' | 'both', icon: '💰', color: '#607D8B' };

  filteredCategories() {
    const tab = this.activeTab();
    if (tab === 'all') return this.categoryService.categories();
    if (tab === 'income') return this.categoryService.incomeCategories();
    return this.categoryService.expenseCategories();
  }

  ngOnInit() {
    this.categoryService.loadCategories().subscribe();
  }

  openForm() {
    this.form = { name: '', type: 'expense', icon: '💰', color: '#607D8B' };
    this.editingCategory.set(undefined);
    this.showForm.set(true);
  }

  editCategory(cat: Category) {
    this.form = { name: cat.name, type: cat.type, icon: cat.icon, color: cat.color };
    this.editingCategory.set(cat);
    this.showForm.set(true);
  }

  closeForm() { this.showForm.set(false); this.editingCategory.set(undefined); }

  saveCategory() {
    if (!this.form.name) return;
    this.submitting.set(true);
    const obs = this.editingCategory()
      ? this.categoryService.updateCategory(this.editingCategory()!.id, this.form)
      : this.categoryService.createCategory(this.form);
    obs.subscribe(() => {
      this.submitting.set(false);
      this.closeForm();
      this.toast.success(this.editingCategory() ? 'Category updated!' : 'Category added!');
    });
  }

  confirmDelete(cat: Category) { this.deletingCategory.set(cat); }
  cancelDelete() { this.deletingCategory.set(undefined); }

  deleteCategory() {
    const cat = this.deletingCategory();
    if (!cat) return;
    this.categoryService.deleteCategory(cat.id).subscribe(() => {
      this.deletingCategory.set(undefined);
      this.toast.success('Category deleted');
    });
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeForm();
  }
}
