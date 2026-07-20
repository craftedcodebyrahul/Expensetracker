import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { RecurringSchedule, DetectedBill } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RecurringService {
  private api = inject(ApiService);

  readonly schedules = signal<RecurringSchedule[]>([]);
  readonly loading = signal(false);
  readonly detectedBills = signal<DetectedBill[]>([]);
  readonly detecting = signal(false);
  readonly advisorData = signal<any>(null);
  readonly loadingAdvisor = signal(false);

  loadDetectedBills() {
    this.detecting.set(true);
    return this.api.detectRecurringBills().pipe(
      tap(res => {
        if (res.success) {
          this.detectedBills.set(res.data);
        }
        this.detecting.set(false);
      }),
      catchError(() => {
        this.detecting.set(false);
        return of(null);
      })
    );
  }

  dismissBill(description: string) {
    return this.api.dismissRecurringBill(description).pipe(
      tap(res => {
        if (res.success) {
          this.detectedBills.update(bills => bills.filter(b => b.description !== description));
        }
      })
    );
  }

  undismissBill(description: string) {
    return this.api.undismissRecurringBill(description).pipe(
      tap(res => {
        if (res.success) {
          this.loadDetectedBills().subscribe();
        }
      })
    );
  }

  loadAdvisorData() {
    this.loadingAdvisor.set(true);
    return this.api.getSavingsAdvisor().pipe(
      tap(res => {
        if (res.success) {
          this.advisorData.set(res.data);
        }
        this.loadingAdvisor.set(false);
      }),
      catchError(() => {
        this.loadingAdvisor.set(false);
        return of(null);
      })
    );
  }

  executeTransferRecommendation(fromAccountId: string, toAccountId: string, amount: number, type: 'savings' | 'topup') {
    return this.api.executeSavingsTransfer(fromAccountId, toAccountId, amount, type).pipe(
      tap(res => {
        if (res.success) {
          this.loadAdvisorData().subscribe();
        }
      })
    );
  }

  loadSchedules() {
    this.loading.set(true);
    return this.api.getRecurringSchedules().pipe(
      tap(res => {
        if (res.success) {
          this.schedules.set(res.data);
        }
        this.loading.set(false);
      }),
      catchError(() => {
        this.loading.set(false);
        return of(null);
      })
    );
  }

  createSchedule(data: Omit<RecurringSchedule, 'id' | 'createdAt'>) {
    return this.api.createRecurringSchedule(data).pipe(
      tap(res => {
        if (res.success) {
          this.schedules.update(ss => [res.data, ...ss]);
        }
      }),
      catchError(() => of(null))
    );
  }

  updateSchedule(id: string, data: Partial<RecurringSchedule>) {
    return this.api.updateRecurringSchedule(id, data).pipe(
      tap(res => {
        if (res.success) {
          this.schedules.update(ss => ss.map(s => s.id === id ? res.data : s));
        }
      }),
      catchError(() => of(null))
    );
  }

  deleteSchedule(id: string) {
    return this.api.deleteRecurringSchedule(id).pipe(
      tap(res => {
        if (res.success) {
          this.schedules.update(ss => ss.filter(s => s.id !== id));
        }
      }),
      catchError(() => of(null))
    );
  }
}
