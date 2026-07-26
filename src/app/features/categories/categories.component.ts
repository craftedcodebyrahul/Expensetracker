import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CategorySelectComponent } from '../../shared/components/category-select.component';
import { Category } from '../../core/models';

const PRESET_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
  '#4CAF50', '#E91E63', '#00BCD4', '#FF5722', '#9C27B0', '#607D8B'
];

const PRESET_ICONS = ['💰', '🍽️', '🚗', '🏠', '💡', '🏥', '🎬', '🛍️', '📚', '✈️', '📱', '🛡️',
  '💼', '💻', '📈', '🏘️', '🏢', '🎁', '💸', '🎯', '🔧', '🎮', '🐾', '🌿', '🛒', '🍕', '🚘', '⛽'];

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CategorySelectComponent],
  template: `
    <app-header title="Categories" subtitle="Organize your transactions with nested parent & child subcategories">
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

      <!-- Categories Hierarchy List -->
      <div class="categories-hierarchy">
        @for (parent of categoryTree(); track parent.id) {
          <div class="parent-category-block">
            <div class="parent-header">
              <div class="cc-icon" [style.background]="parent.color + '22'" [style.border-color]="parent.color + '44'">
                <span>{{ parent.icon }}</span>
              </div>
              <div class="cc-info">
                <div class="cc-title-row">
                  <span class="parent-name">{{ parent.name }}</span>
                  <span class="cc-type badge" [class.badge-income]="parent.type === 'income'"
                        [class.badge-expense]="parent.type === 'expense'"
                        [class.badge-neutral]="parent.type === 'both'">
                    {{ parent.type }}
                  </span>
                </div>
                <span class="child-count-hint">
                  {{ parent.children?.length || 0 }} subcategorie(s)
                </span>
              </div>
              <div class="cc-actions">
                <button class="btn btn-ghost btn-xs" (click)="openForm(parent.id)" title="Add subcategory under {{ parent.name }}">
                  + Subcategory
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" (click)="editCategory(parent)" aria-label="Edit">✏️</button>
                <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(parent)" aria-label="Delete">🗑️</button>
              </div>
            </div>

            <!-- Children Subcategories Grid -->
            <div class="children-grid">
              @for (child of parent.children; track child.id) {
                <div class="child-card">
                  <div class="child-icon" [style.background]="child.color + '18'" [style.border-color]="child.color + '33'">
                    <span>{{ child.icon }}</span>
                  </div>
                  <div class="child-info">
                    <span class="child-name">{{ child.name }}</span>
                    <span class="parent-ref-tag">under {{ parent.name }}</span>
                  </div>
                  <div class="cc-actions">
                    <button class="btn btn-ghost btn-icon btn-xs" (click)="editCategory(child)" aria-label="Edit">✏️</button>
                    <button class="btn btn-ghost btn-icon btn-xs" (click)="confirmDelete(child)" aria-label="Delete">🗑️</button>
                  </div>
                </div>
              }
              <button class="add-sub-btn" (click)="openForm(parent.id)">
                <span>+ Add Subcategory</span>
              </button>
            </div>
          </div>
        }

        <!-- Independent / Standalone Card Add -->
        <button class="add-category-card" (click)="openForm()">
          <span class="add-icon">+</span>
          <span>Add Parent Category</span>
        </button>
      </div>
    </div>

    <!-- Category Form Modal -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>{{ editingCategory() ? 'Edit Category' : (form.parentId ? 'Add Subcategory' : 'Add Parent Category') }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input type="text" class="form-control" [(ngModel)]="form.name" placeholder="Category name">
            </div>

            <div class="form-group">
              <label class="form-label">Parent Category (Optional)</label>
              <app-category-select
                [(ngModel)]="form.parentId"
                placeholder="-- None (Top-level Parent Category) --"
                [excludeId]="editingCategory()?.id"
                [typeFilter]="form.type === 'income' ? 'income' : 'expense'">
              </app-category-select>
              <span class="form-hint">Assigning a parent turns this into a subcategory.</span>
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
                <div style="display:flex; flex-direction:column;">
                  <span class="cc-name">{{ form.name || 'Category Name' }}</span>
                  @if (form.parentId) {
                    <span style="font-size:0.75rem; color:var(--accent-blue);">
                      Subcategory of {{ getParentName(form.parentId) }}
                    </span>
                  }
                </div>
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

    <!-- Hierarchy-Aware Delete Confirm Modal -->
    @if (deletingCategory()) {
      <div class="modal-overlay" (click)="onDeleteOverlayClick($event)">
        <div class="modal" style="max-width: 460px;" role="alertdialog">
          <div class="modal-header">
            <h3>Delete {{ deletingCategory()?.parentId ? 'Subcategory' : 'Parent Category' }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="cancelDelete()">✕</button>
          </div>
          <div class="modal-body">
            <p>Delete <strong>{{ deletingCategory()!.name }}</strong>?</p>
            
            @if (showReassignOptions()) {
              <div class="warning-box mt-3 mb-3" style="background: rgba(255, 193, 7, 0.1); border: 1px solid var(--accent-yellow); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.875rem; color: var(--accent-yellow); display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
                  <span>⚠️</span>
                  <span>Category In Use</span>
                </div>
                <p style="color: var(--text-secondary); margin: 0;">
                  This category is currently used in <strong>{{ affectedCount() }}</strong> transaction(s). To delete it, select a replacement category to reassign them to.
                </p>
                @if (childCount() > 0) {
                  <p style="color: var(--text-primary); margin: 0; font-weight: 600;">
                    Note: This parent category also has <strong>{{ childCount() }}</strong> subcategories.
                  </p>
                }
              </div>

              @if (childCount() > 0) {
                <div class="form-group" style="margin-top: 1rem;">
                  <label class="form-label" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500;">
                    How to handle child subcategories?
                  </label>
                  <select class="form-control" [(ngModel)]="childAction" style="width: 100%;">
                    <option value="promote">Promote child subcategories to top-level Parent Categories</option>
                    <option value="reassign_parent">Move child subcategories under replacement Parent Category</option>
                  </select>
                </div>
              }

              <div class="form-group" style="margin-top: 1rem;">
                <label class="form-label" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500;">
                  Reassign transactions to *
                </label>
                <app-category-select
                  [(ngModel)]="reassignCategoryId"
                  placeholder="Select replacement category..."
                  [excludeId]="deletingCategory()?.id"
                  [recommendedId]="deletingCategory()?.parentId || undefined"
                  [typeFilter]="deletingCategory()?.type === 'income' ? 'income' : 'expense'">
                </app-category-select>
              </div>
            } @else {
              <p class="text-muted text-sm mt-2">Any transactions using this category will require reassignment.</p>
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
            @if (showReassignOptions()) {
              <button class="btn btn-primary" (click)="deleteCategory()" [disabled]="!reassignCategoryId || submitting()">
                {{ submitting() ? 'Processing...' : 'Confirm Reassign & Delete' }}
              </button>
            } @else {
              <button class="btn btn-danger" (click)="deleteCategory()" [disabled]="submitting()">
                {{ submitting() ? 'Deleting...' : 'Delete' }}
              </button>
            }
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

    .categories-hierarchy { display: flex; flex-direction: column; gap: 1.25rem; }

    .parent-category-block {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .parent-header {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      border-bottom: 1px dashed var(--border);
      padding-bottom: 0.75rem;
    }

    .cc-title-row { display: flex; align-items: center; gap: 0.5rem; }
    .parent-name { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
    .child-count-hint { font-size: 0.75rem; color: var(--text-muted); }

    .children-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
      padding-left: 0.5rem;
    }

    .child-card {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.625rem 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      transition: var(--transition);
    }
    .child-card:hover { border-color: var(--accent-blue); transform: translateY(-1px); }

    .child-icon {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-sm);
      border: 1px solid;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;
    }
    .child-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .child-name { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .parent-ref-tag { font-size: 0.7rem; color: var(--text-muted); }

    .add-sub-btn {
      background: transparent;
      border: 1px dashed var(--border);
      border-radius: var(--radius-md);
      padding: 0.625rem 0.875rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-blue-light);
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .add-sub-btn:hover { background: rgba(92, 107, 192, 0.08); border-color: var(--accent-blue); }

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
    .cc-name { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
    .cc-type { font-size: 0.7rem; }
    .cc-actions { display: flex; gap: 0.25rem; flex-shrink: 0; align-items: center; }
    .btn-xs { padding: 0.25rem 0.5rem; font-size: 0.75rem; }

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
      min-height: 60px;
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

  // Hierarchy delete & reassign state
  showReassignOptions = signal(false);
  reassignCategoryId = '';
  childAction: 'promote' | 'reassign_parent' = 'promote';
  affectedCount = signal(0);
  childCount = signal(0);

  presetColors = PRESET_COLORS;
  presetIcons = PRESET_ICONS;

  form = {
    name: '',
    type: 'expense' as 'income' | 'expense' | 'both',
    icon: '💰',
    color: '#607D8B',
    parentId: null as string | null
  };

  categoryTree = computed(() => {
    return this.categoryService.getCategoryTree(this.activeTab());
  });

  parentCategoriesForSelect() {
    return this.categoryService.categories().filter(c => !c.parentId && (!this.editingCategory() || c.id !== this.editingCategory()!.id));
  }

  ngOnInit() {
    this.categoryService.loadCategories().subscribe();
  }

  openForm(parentId: string | null = null) {
    this.form = { name: '', type: 'expense', icon: '💰', color: '#607D8B', parentId };
    if (parentId) {
      const parent = this.categoryService.getCategoryById(parentId);
      if (parent) this.form.type = parent.type;
    }
    this.editingCategory.set(undefined);
    this.showForm.set(true);
  }

  editCategory(cat: Category) {
    this.form = {
      name: cat.name,
      type: cat.type,
      icon: cat.icon,
      color: cat.color,
      parentId: cat.parentId ?? null
    };
    this.editingCategory.set(cat);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingCategory.set(undefined);
  }

  getParentName(parentId?: string | null): string {
    if (!parentId) return '';
    return this.categoryService.getCategoryById(parentId)?.name ?? parentId;
  }

  saveCategory() {
    if (!this.form.name) return;
    this.submitting.set(true);
    const payload = {
      name: this.form.name,
      type: this.form.type,
      icon: this.form.icon,
      color: this.form.color,
      parentId: this.form.parentId
    };

    const obs = this.editingCategory()
      ? this.categoryService.updateCategory(this.editingCategory()!.id, payload)
      : this.categoryService.createCategory(payload);

    obs.subscribe(() => {
      this.submitting.set(false);
      this.closeForm();
      this.toast.success(this.editingCategory() ? 'Category updated!' : 'Category added!');
    });
  }

  confirmDelete(cat: Category) {
    this.deletingCategory.set(cat);
    this.showReassignOptions.set(false);
    this.reassignCategoryId = '';
    this.childAction = 'promote';
    this.affectedCount.set(0);
    this.childCount.set(0);

    // If deleting a subcategory, pre-fill its parent category as default recommendation!
    if (cat.parentId) {
      this.reassignCategoryId = cat.parentId;
    }
  }

  cancelDelete() {
    this.deletingCategory.set(undefined);
    this.showReassignOptions.set(false);
    this.reassignCategoryId = '';
    this.childAction = 'promote';
    this.affectedCount.set(0);
    this.childCount.set(0);
  }

  deleteCategory() {
    const cat = this.deletingCategory();
    if (!cat) return;
    this.submitting.set(true);
    const reassignTo = this.showReassignOptions() ? this.reassignCategoryId : undefined;
    this.categoryService.deleteCategory(cat.id, reassignTo, this.childAction).subscribe({
      next: (res: any) => {
        this.submitting.set(false);
        this.cancelDelete();
        this.toast.success(reassignTo ? 'Category deleted and transactions reassigned!' : 'Category deleted');
      },
      error: (err: any) => {
        this.submitting.set(false);
        console.error('Category delete error:', err);
        if (err?.error?.error === 'HAS_TRANSACTIONS') {
          this.showReassignOptions.set(true);
          this.affectedCount.set(err.error.count || 0);
          this.childCount.set(err.error.childCount || 0);
          if (cat.parentId && !this.reassignCategoryId) {
            this.reassignCategoryId = cat.parentId;
          }
          this.toast.warning('Category has associated transactions. Please select a replacement category.');
        } else {
          this.toast.error(err?.error?.message || 'Failed to delete category');
        }
      }
    });
  }

  recommendedParentCategory(): Category | null {
    const deleting = this.deletingCategory();
    if (!deleting || !deleting.parentId) return null;
    return this.categoryService.getCategoryById(deleting.parentId) || null;
  }

  getReassignGroups(): Array<{ parent: Category; children: Category[] }> {
    const deleting = this.deletingCategory();
    if (!deleting) return [];
    const all = this.categoryService.categories().filter(c => c.id !== deleting.id);
    const parents = all.filter(c => !c.parentId && (c.type === deleting.type || c.type === 'both' || deleting.type === 'both'));

    return parents.map(parent => ({
      parent,
      children: all.filter(child => child.parentId === parent.id && (child.type === deleting.type || child.type === 'both' || deleting.type === 'both'))
    }));
  }

  getOrphanReassignCategories(): Category[] {
    const deleting = this.deletingCategory();
    if (!deleting) return [];
    const all = this.categoryService.categories().filter(c => c.id !== deleting.id);
    const parentIdSet = new Set(all.filter(c => !c.parentId).map(c => c.id));
    return all.filter(c => c.parentId && !parentIdSet.has(c.parentId) && (c.type === deleting.type || c.type === 'both' || deleting.type === 'both'));
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeForm();
  }

  onDeleteOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.cancelDelete();
  }
}
