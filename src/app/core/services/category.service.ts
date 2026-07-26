import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { Category, DEFAULT_CATEGORIES } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private api = inject(ApiService);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);

  readonly incomeCategories = computed(() =>
    this.categories().filter(c => c.type === 'income' || c.type === 'both')
  );

  readonly expenseCategories = computed(() =>
    this.categories().filter(c => c.type === 'expense' || c.type === 'both')
  );

  readonly parentCategories = computed(() =>
    this.categories().filter(c => !c.parentId)
  );

  getCategoryById(id: string): Category | undefined {
    return this.categories().find(c => c.id === id);
  }

  getCategoryColor(id: string): string {
    return this.getCategoryById(id)?.color ?? '#607D8B';
  }

  getCategoryIcon(id: string): string {
    return this.getCategoryById(id)?.icon ?? '💰';
  }

  getSubcategories(parentId: string): Category[] {
    return this.categories().filter(c => c.parentId === parentId);
  }

  getCategoryTree(typeFilter: 'all' | 'expense' | 'income' = 'all'): Category[] {
    const all = this.categories();
    const parentIdSet = new Set(all.map(c => c.id));
    
    // Top-level categories: no parentId OR parentId no longer exists
    const parents = all.filter(c =>
      (!c.parentId || !parentIdSet.has(c.parentId)) &&
      (typeFilter === 'all' || c.type === typeFilter || c.type === 'both')
    );

    return parents.map(parent => ({
      ...parent,
      children: all.filter(child => child.parentId === parent.id && (typeFilter === 'all' || child.type === typeFilter || child.type === 'both'))
    }));
  }

  loadCategories() {
    this.loading.set(true);
    return this.api.getCategories().pipe(
      tap(res => {
        if (res.success) {
          // If the API returns empty (new user, seed not yet run), use defaults
          this.categories.set(res.data?.length > 0 ? res.data : DEFAULT_CATEGORIES);
        }
        this.loading.set(false);
      }),
      catchError(() => {
        // API error (e.g. not authenticated yet) — fall back to defaults
        this.categories.set(DEFAULT_CATEGORIES);
        this.loading.set(false);
        return of(null);
      })
    );
  }

  createCategory(data: Omit<Category, 'id' | 'createdAt'>) {
    return this.api.createCategory(data).pipe(
      tap(res => {
        if (res.success) this.categories.update(cats => [...cats, res.data]);
      }),
      catchError(err => of(null))
    );
  }

  updateCategory(id: string, data: Partial<Category>) {
    return this.api.updateCategory(id, data).pipe(
      tap(res => {
        if (res.success) {
          this.categories.update(cats => cats.map(c => c.id === id ? res.data : c));
        }
      }),
      catchError(err => of(null))
    );
  }

  deleteCategory(id: string, reassignTo?: string, childAction: 'promote' | 'reassign_parent' = 'promote') {
    return this.api.deleteCategory(id, reassignTo, childAction).pipe(
      tap(res => {
        if (res.success) {
          this.loadCategories().subscribe();
        }
      })
    );
  }

  executeCategorySplit(
    parentCategoryId: string,
    subcategories: Array<{ name: string; icon: string; color: string; transactionIds: string[] }>
  ) {
    return this.api.splitAndReassignCategory(parentCategoryId, subcategories).pipe(
      tap(res => {
        if (res.success) {
          this.loadCategories().subscribe();
        }
      })
    );
  }
}
