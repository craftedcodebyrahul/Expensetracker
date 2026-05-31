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

  getCategoryById(id: string): Category | undefined {
    return this.categories().find(c => c.id === id);
  }

  getCategoryColor(id: string): string {
    return this.getCategoryById(id)?.color ?? '#607D8B';
  }

  getCategoryIcon(id: string): string {
    return this.getCategoryById(id)?.icon ?? '💰';
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

  deleteCategory(id: string) {
    return this.api.deleteCategory(id).pipe(
      tap(res => {
        if (res.success) this.categories.update(cats => cats.filter(c => c.id !== id));
      }),
      catchError(err => of(null))
    );
  }
}
