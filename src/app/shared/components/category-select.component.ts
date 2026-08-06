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
              <div class="cat-title-row">
                <span class="cat-name">{{ cat.name }}</span>
                @if (cat.parentId && getCategoryName(cat.parentId); as pName) {
                  <span class="parent-pill">in {{ pName }}</span>
                }
              </div>
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
                   placeholder="Search categories or subcategories..." (click)="$event.stopPropagation()">
            @if (searchQuery) {
              <button type="button" class="clear-search" (click)="searchQuery = ''">✕</button>
            }
          </div>

          <!-- Options List -->
          <div class="options-list">
            <!-- Recommended Group (If applicable) -->
            @if (recommendedCategory(); as rec) {
              <div class="rec-card" (click)="selectOption(rec.id)">
                <span class="rec-star">⭐</span>
                <span class="rec-icon">{{ rec.icon }}</span>
                <div class="rec-info">
                  <span class="rec-name">{{ rec.name }}</span>
                  <span class="rec-sub">Recommended Parent Category</span>
                </div>
                @if (selectedValue() === rec.id) { <span class="check-mark">✓</span> }
              </div>
            }

            <!-- Filtered Category Groups -->
            @for (group of filteredCategoryTree(); track group.id) {
              <div class="category-group-card" [style.border-left-color]="group.color">
                <!-- Group Parent Header / Main Option -->
                <div class="group-parent-item" [class.selected]="selectedValue() === group.id" (click)="selectOption(group.id)">
                  <span class="group-icon" [style.background]="group.color + '25'">{{ group.icon }}</span>
                  <div class="group-info">
                    <span class="group-title">{{ group.name }}</span>
                    <span class="group-sub">Main Category</span>
                  </div>
                  @if (selectedValue() === group.id) { <span class="check-mark">✓</span> }
                </div>

                <!-- Child Subcategories List -->
                @if (group.children.length > 0) {
                  <div class="subcategories-container">
                    @for (child of group.children; track child.id; let last = $last) {
                      <div class="child-item" [class.selected]="selectedValue() === child.id" (click)="selectOption(child.id)">
                        <span class="tree-line">└─</span>
                        <span class="child-icon" [style.background]="child.color + '20'">{{ child.icon }}</span>
                        <span class="child-name">{{ child.name }}</span>
                        @if (selectedValue() === child.id) { <span class="check-mark">✓</span> }
                      </div>
                    }
                  </div>
                }
              </div>
            }

            @if (filteredCategoryTree().length === 0 && !recommendedCategory()) {
              <div class="no-results">
                <span>🔍 No categories found matching "{{ searchQuery }}"</span>
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
      min-height: 46px;
      padding: 0.5rem 0.875rem;
      background: var(--bg-input, #1b2133);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
      border-radius: 10px;
      color: var(--text-primary, #ffffff);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      text-align: left;
    }

    .select-trigger:hover:not(:disabled) {
      border-color: var(--accent-blue, #5c6bc0);
      background: rgba(92, 107, 192, 0.08);
    }

    .custom-category-select.open .select-trigger {
      border-color: var(--accent-blue, #5c6bc0);
      box-shadow: 0 0 0 3px rgba(92, 107, 192, 0.22);
    }

    .selected-content {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      min-width: 0;
    }

    .cat-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: 1px solid;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .cat-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .cat-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .cat-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary, #fff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .parent-pill {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.1rem 0.45rem;
      border-radius: 6px;
      background: rgba(92, 107, 192, 0.2);
      color: var(--accent-blue-light, #9fa8da);
      border: 1px solid rgba(92, 107, 192, 0.3);
      white-space: nowrap;
    }

    .placeholder-text {
      color: var(--text-muted, #8a94a6);
      font-size: 0.875rem;
    }

    .chevron {
      font-size: 0.85rem;
      color: var(--text-muted, #8a94a6);
      transition: transform 0.2s ease;
      margin-left: 0.5rem;
    }

    .chevron.rotated {
      transform: rotate(180deg);
      color: var(--accent-blue-light, #7986cb);
    }

    /* Dropdown Popup */
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      z-index: 1000;
      background: var(--bg-card, #141927);
      border: 1px solid var(--border-light, rgba(255, 255, 255, 0.15));
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
      overflow: hidden;
      animation: popupSlide 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      backdrop-filter: blur(12px);
    }

    @keyframes popupSlide {
      from { opacity: 0; transform: translateY(-8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .search-wrap {
      padding: 0.75rem;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(0, 0, 0, 0.25);
    }

    .search-icon { font-size: 0.85rem; opacity: 0.6; }

    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary, #fff);
      font-size: 0.85rem;
      font-family: inherit;
    }

    .clear-search {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.75rem;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }
    .clear-search:hover { color: #fff; background: rgba(255,255,255,0.1); }

    .options-list {
      max-height: 340px;
      overflow-y: auto;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .options-list::-webkit-scrollbar {
      width: 6px;
    }
    .options-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }

    /* Recommended Card */
    .rec-card {
      padding: 0.625rem 0.75rem;
      border-radius: 8px;
      background: rgba(255, 213, 79, 0.08);
      border: 1px solid rgba(255, 213, 79, 0.25);
      display: flex;
      align-items: center;
      gap: 0.625rem;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }
    .rec-card:hover {
      background: rgba(255, 213, 79, 0.15);
      transform: translateY(-1px);
    }
    .rec-star { font-size: 0.9rem; }
    .rec-icon { font-size: 1.1rem; }
    .rec-info { flex: 1; display: flex; flex-direction: column; }
    .rec-name { font-size: 0.85rem; font-weight: 600; color: #ffd54f; }
    .rec-sub { font-size: 0.7rem; color: var(--text-muted); }

    /* Category Group Card */
    .category-group-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-left: 4px solid var(--accent-blue, #5c6bc0);
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
      transition: background 0.15s ease;
    }

    .group-parent-item {
      padding: 0.625rem 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      cursor: pointer;
      transition: background 0.15s ease;
      background: rgba(255, 255, 255, 0.015);
    }

    .group-parent-item:hover {
      background: rgba(92, 107, 192, 0.12);
    }

    .group-parent-item.selected {
      background: rgba(92, 107, 192, 0.22);
    }

    .group-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
      flex-shrink: 0;
    }

    .group-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .group-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-primary, #fff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .group-sub {
      font-size: 0.68rem;
      color: var(--text-muted, #8a94a6);
    }

    /* Subcategories Container */
    .subcategories-container {
      padding: 0.25rem 0 0.375rem 0.75rem;
      border-top: 1px dashed rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .child-item {
      padding: 0.45rem 0.75rem;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }

    .child-item:hover {
      background: rgba(92, 107, 192, 0.15);
      transform: translateX(3px);
    }

    .child-item.selected {
      background: rgba(92, 107, 192, 0.25);
      font-weight: 600;
    }

    .tree-line {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--accent-blue-light, rgba(121, 134, 203, 0.5));
      flex-shrink: 0;
    }

    .child-icon {
      width: 22px;
      height: 22px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .child-name {
      font-size: 0.8125rem;
      color: var(--text-secondary, #e1e7f0);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .child-item:hover .child-name {
      color: var(--text-primary, #ffffff);
    }

    .check-mark {
      color: var(--accent-green, #4caf50);
      font-weight: bold;
      font-size: 0.9rem;
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

  readonly selectedValue = signal<string | null>(null);
  disabled = false;
  isOpen = signal(false);
  searchQuery = '';

  onChange: (value: any) => void = () => { };
  onTouched: () => void = () => { };

  get value(): string | null {
    return this.selectedValue();
  }

  writeValue(val: any): void {
    this.selectedValue.set(val || null);
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
    const id = this.selectedValue();
    if (!id) return null;
    return this.categoryService.getCategoryById(id) || null;
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

    const eligible = all.filter(c => {
      if (exclude && c.id === exclude) return false;
      if (filter !== 'all' && c.type !== filter && c.type !== 'both') return false;
      return true;
    });

    const parentIdSet = new Set(all.map(c => c.id));
    const parents = eligible.filter(c => !c.parentId || !parentIdSet.has(c.parentId));

    if (query) {
      return parents
        .map(parent => {
          const parentMatches = parent.name.toLowerCase().includes(query);
          const children = eligible.filter(child => child.parentId === parent.id);
          const matchingChildren = children.filter(child => child.name.toLowerCase().includes(query));

          const finalChildren = parentMatches ? children : matchingChildren;

          if (parentMatches || finalChildren.length > 0) {
            return {
              ...parent,
              children: finalChildren
            };
          }
          return null;
        })
        .filter((group): group is (Category & { children: Category[] }) => group !== null);
    }

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
    this.selectedValue.set(id);
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
