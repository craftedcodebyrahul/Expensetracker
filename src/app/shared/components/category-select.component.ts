import {
  Component, Input, Output, EventEmitter, inject, signal, computed,
  ElementRef, HostListener, forwardRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Category } from '../../core/models';
import { CategoryService } from '../../core/services/category.service';

@Component({
  selector: 'app-category-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CategorySelectComponent),
      multi: true
    }
  ],
  template: `
    <div class="custom-category-select" #dropdownRef [class.open]="isOpen()">
      <!-- Trigger Button -->
      <button type="button" class="select-trigger" (click)="toggleDropdown()" [disabled]="disabled">
        @if (selectedCategory(); as cat) {
          <div class="selected-content">
            <span class="cat-icon" [style.background]="cat.color + '22'" [style.border-color]="cat.color + '44'">
              {{ cat.icon }}
            </span>
            <div class="cat-text">
              <span class="cat-name">{{ cat.name }}</span>
              @if (cat.parentId && getCategoryName(cat.parentId); as pName) {
                <span class="cat-path">under {{ pName }}</span>
              }
            </div>
          </div>
        } @else {
          <span class="placeholder-text">{{ placeholder }}</span>
        }
        <span class="chevron" [class.rotated]="isOpen()">▾</span>
      </button>

      <!-- Dropdown Popup -->
      @if (isOpen()) {
        <div class="dropdown-menu">
          <!-- Search Header -->
          <div class="search-wrap">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" [(ngModel)]="searchQuery"
                   placeholder="Search categories..." (click)="$event.stopPropagation()">
            @if (searchQuery) {
              <button class="clear-search" (click)="searchQuery = ''">✕</button>
            }
          </div>

          <!-- Options List -->
          <div class="options-list">
            <!-- Recommended Group (If applicable) -->
            @if (recommendedCategory(); as rec) {
              <div class="group-header rec-header">
                <span>⭐ Recommended Parent</span>
              </div>
              <div class="option-item rec-item" [class.selected]="value === rec.id" (click)="selectOption(rec.id)">
                <span class="opt-icon" [style.background]="rec.color + '22'">{{ rec.icon }}</span>
                <span class="opt-name">{{ rec.name }}</span>
                <span class="opt-badge parent-badge">Parent</span>
              </div>
            }

            <!-- Filtered Category Groups -->
            @for (group of filteredCategoryTree(); track group.id) {
              <div class="category-group">
                <!-- Group Parent Header -->
                <div class="group-header">
                  <span class="group-icon">{{ group.icon }}</span>
                  <span class="group-title">{{ group.name }}</span>
                  <span class="group-type-badge" [class.expense]="group.type === 'expense'" [class.income]="group.type === 'income'">
                    {{ group.type }}
                  </span>
                </div>

                <!-- Main Parent Option -->
                <div class="option-item parent-option" [class.selected]="value === group.id" (click)="selectOption(group.id)">
                  <span class="opt-icon" [style.background]="group.color + '22'">{{ group.icon }}</span>
                  <div class="opt-info">
                    <span class="opt-name">{{ group.name }}</span>
                    <span class="opt-sub-hint">Main Category</span>
                  </div>
                  @if (value === group.id) { <span class="check-mark">✓</span> }
                </div>

                <!-- Child Subcategories -->
                @for (child of group.children; track child.id) {
                  <div class="option-item child-option" [class.selected]="value === child.id" (click)="selectOption(child.id)">
                    <span class="tree-branch">└</span>
                    <span class="opt-icon child-icon-wrap" [style.background]="child.color + '18'">{{ child.icon }}</span>
                    <div class="opt-info">
                      <span class="opt-name">{{ child.name }}</span>
                    </div>
                    @if (value === child.id) { <span class="check-mark">✓</span> }
                  </div>
                }
              </div>
            }

            @if (filteredCategoryTree().length === 0 && !recommendedCategory()) {
              <div class="no-results">
                <span>No matching categories found</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .custom-category-select {
      position: relative;
      width: 100%;
      user-select: none;
      font-family: inherit;
    }

    .select-trigger {
      width: 100%;
      min-height: 44px;
      padding: 0.5rem 0.875rem;
      background: var(--bg-input, #1e2538);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-md, 8px);
      color: var(--text-primary, #ffffff);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
    }

    .select-trigger:hover:not(:disabled) {
      border-color: var(--accent-blue, #5c6bc0);
      background: rgba(92, 107, 192, 0.08);
    }

    .custom-category-select.open .select-trigger {
      border-color: var(--accent-blue, #5c6bc0);
      box-shadow: 0 0 0 3px rgba(92, 107, 192, 0.2);
    }

    .selected-content {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      min-width: 0;
    }

    .cat-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
      flex-shrink: 0;
    }

    .cat-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .cat-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary, #fff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cat-path {
      font-size: 0.7rem;
      color: var(--accent-blue-light, #7986cb);
    }

    .placeholder-text {
      color: var(--text-muted, #8a94a6);
      font-size: 0.875rem;
    }

    .chevron {
      font-size: 0.8rem;
      color: var(--text-muted, #8a94a6);
      transition: transform 0.2s ease;
      margin-left: 0.5rem;
    }

    .chevron.rotated {
      transform: rotate(180deg);
      color: var(--accent-blue-light, #7986cb);
    }

    /* ── Dropdown Popup ────────────────────────────────────────── */
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      z-index: 1000;
      background: var(--bg-card, #161b2c);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
      border-radius: var(--radius-md, 10px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      overflow: hidden;
      animation: fadeInDown 0.15s ease-out;
    }

    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .search-wrap {
      padding: 0.625rem;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(0, 0, 0, 0.15);
    }

    .search-icon { font-size: 0.8rem; opacity: 0.6; }

    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary, #fff);
      font-size: 0.8125rem;
      font-family: inherit;
    }

    .clear-search {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.75rem;
    }

    .options-list {
      max-height: 260px;
      overflow-y: auto;
      padding: 0.375rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .options-list::-webkit-scrollbar {
      width: 6px;
    }
    .options-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }

    .group-header {
      padding: 0.5rem 0.625rem 0.25rem;
      font-size: 0.725rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--accent-blue-light, #9fa8da);
      display: flex;
      align-items: center;
      gap: 0.375rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      margin-top: 0.25rem;
    }
    .category-group:first-child .group-header { border-top: none; margin-top: 0; }

    .rec-header { color: #ffd54f; }

    .group-type-badge {
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      margin-left: auto;
      text-transform: capitalize;
    }
    .group-type-badge.expense { background: rgba(255, 99, 132, 0.15); color: #ff6384; }
    .group-type-badge.income { background: rgba(76, 175, 80, 0.15); color: #4caf50; }

    .option-item {
      padding: 0.5rem 0.625rem;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .option-item:hover {
      background: rgba(92, 107, 192, 0.15);
    }

    .option-item.selected {
      background: rgba(92, 107, 192, 0.25);
      border-left: 3px solid var(--accent-blue, #5c6bc0);
    }

    .parent-option {
      font-weight: 600;
    }

    .child-option {
      padding-left: 1.5rem;
    }

    .tree-branch {
      color: var(--text-muted, rgba(255, 255, 255, 0.3));
      font-size: 0.85rem;
      font-family: monospace;
    }

    .opt-icon {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .opt-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .opt-name {
      font-size: 0.8125rem;
      color: var(--text-primary, #fff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .opt-sub-hint {
      font-size: 0.68rem;
      color: var(--text-muted, #8a94a6);
      font-weight: normal;
    }

    .opt-badge {
      font-size: 0.68rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-secondary);
      margin-left: auto;
    }

    .check-mark {
      color: var(--accent-blue-light, #7986cb);
      font-weight: bold;
      font-size: 0.85rem;
      margin-left: auto;
    }

    .no-results {
      padding: 1.5rem;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8125rem;
    }
  `]
})
export class CategorySelectComponent implements ControlValueAccessor {
  private categoryService = inject(CategoryService);
  private eRef = inject(ElementRef);

  @Input() placeholder = 'Select replacement category...';
  @Input() typeFilter: 'all' | 'expense' | 'income' = 'all';
  @Input() excludeId?: string;
  @Input() recommendedId?: string;

  @Output() categorySelected = new EventEmitter<Category>();

  value: string | null = null;
  disabled = false;
  isOpen = signal(false);
  searchQuery = '';

  onChange: (value: any) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(val: any): void {
    this.value = val;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  selectedCategory = computed(() => {
    if (!this.value) return null;
    return this.categoryService.getCategoryById(this.value) || null;
  });

  recommendedCategory = computed(() => {
    if (!this.recommendedId) return null;
    return this.categoryService.getCategoryById(this.recommendedId) || null;
  });

  getCategoryName(id: string): string {
    return this.categoryService.getCategoryById(id)?.name || '';
  }

  filteredCategoryTree = computed(() => {
    const query = this.searchQuery.trim().toLowerCase();
    const exclude = this.excludeId;
    const filter = this.typeFilter;
    const all = this.categoryService.categories();

    let eligible = all.filter(c => {
      if (exclude && c.id === exclude) return false;
      if (filter !== 'all' && c.type !== filter && c.type !== 'both') return false;
      return true;
    });

    if (query) {
      eligible = eligible.filter(c => c.name.toLowerCase().includes(query));
    }

    const parentIdSet = new Set(all.map(c => c.id));
    const parents = eligible.filter(c => !c.parentId || !parentIdSet.has(c.parentId));

    return parents.map(parent => ({
      ...parent,
      children: eligible.filter(child => child.parentId === parent.id)
    }));
  });

  toggleDropdown() {
    if (this.disabled) return;
    this.isOpen.update(v => !v);
    if (!this.isOpen()) {
      this.onTouched();
    }
  }

  selectOption(id: string) {
    this.value = id;
    this.onChange(id);
    this.isOpen.set(false);
    const cat = this.categoryService.getCategoryById(id);
    if (cat) {
      this.categorySelected.emit(cat);
    }
  }

  @HostListener('document:click', ['$event'])
  clickout(event: MouseEvent) {
    if (!this.eRef.nativeElement.contains(event.target)) {
      if (this.isOpen()) {
        this.isOpen.set(false);
        this.onTouched();
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }
}
