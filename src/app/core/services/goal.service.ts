import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Goal } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GoalService {
  private api = inject(ApiService);

  readonly goals = signal<Goal[]>([]);
  readonly loading = signal(false);

  loadGoals() {
    this.loading.set(true);
    return this.api.getGoals().pipe(
      tap(res => {
        if (res.success) {
          this.goals.set(res.data);
        }
        this.loading.set(false);
      }),
      catchError(() => {
        this.loading.set(false);
        return of(null);
      })
    );
  }

  createGoal(data: Omit<Goal, 'id' | 'createdAt'>) {
    return this.api.createGoal(data).pipe(
      tap(res => {
        if (res.success) {
          this.goals.update(gs => [res.data, ...gs]);
        }
      }),
      catchError(() => of(null))
    );
  }

  updateGoal(id: string, data: Partial<Goal>) {
    return this.api.updateGoal(id, data).pipe(
      tap(res => {
        if (res.success) {
          this.goals.update(gs => gs.map(g => g.id === id ? res.data : g));
        }
      }),
      catchError(() => of(null))
    );
  }

  deleteGoal(id: string) {
    return this.api.deleteGoal(id).pipe(
      tap(res => {
        if (res.success) {
          this.goals.update(gs => gs.filter(g => g.id !== id));
        }
      }),
      catchError(() => of(null))
    );
  }
}
