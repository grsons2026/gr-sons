import {
  CatalogItem,
  STORE_CATEGORIES,
  StoreCategory,
  formatMoney,
} from '../data/catalog.ts';
import { storeState } from '../data/storeState.ts';
import { StylingBag } from './bag.ts';
import { QuickViewModal } from './quickView.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MOBILE_ROW_ORDER: { id: StoreCategory; title: string }[] = [
  { id: 'all', title: 'ALL COLLECTION' },
  { id: 'waistcoats-coats', title: 'WAISTCOATS & COATS' },
  { id: 'trousers', title: 'TROUSERS' },
  { id: 'shirts', title: 'SHIRTS' },
  { id: 'shoes', title: 'SHOES' },
];

function getCategoryLabel(category: StoreCategory): string {
  if (category === 'all') return 'All Products';
  return STORE_CATEGORIES.find((c) => c.id === category)?.label || 'Collection';
}

export class CatalogGrid {
  private bag: StylingBag;
  private quickView: QuickViewModal;
  private activeCategory: StoreCategory = 'all';
  private searchQuery = '';
  private sectionEl: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;
  private mobileRowsEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private headingEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private topSearchEl: HTMLInputElement | null = null;
  private topClearEl: HTMLButtonElement | null = null;
  private gridSearchEl: HTMLInputElement | null = null;

  constructor(bag: StylingBag, quickView: QuickViewModal) {
    this.bag = bag;
    this.quickView = quickView;
  }

  public initDOM(): void {
    this.sectionEl = document.getElementById('catalog-showcase');
    if (!this.sectionEl) return;

    this.stageEl = this.sectionEl.querySelector('[data-catalog-stage]');
    this.gridEl = this.sectionEl.querySelector('[data-catalog-grid]');
    this.mobileRowsEl = this.sectionEl.querySelector('[data-catalog-mobile-rows]');
    this.emptyEl = this.sectionEl.querySelector('[data-catalog-empty]');
    this.headingEl = this.sectionEl.querySelector('[data-catalog-heading]');
    this.countEl = this.sectionEl.querySelector('[data-catalog-count]');
    this.topSearchEl = document.getElementById('store-search-input') as HTMLInputElement | null;
    this.topClearEl = document.getElementById('store-search-clear') as HTMLButtonElement | null;
    this.gridSearchEl = this.sectionEl.querySelector(
      '[data-catalog-search]'
    ) as HTMLInputElement | null;

    const searchToggleBtn = document.getElementById('header-search-toggle') as HTMLButtonElement | null;
    const searchPanelEl = document.getElementById('header-search-panel');
    if (searchToggleBtn && searchPanelEl) {
      searchToggleBtn.addEventListener('click', () => {
        const nextOpen = searchPanelEl.hidden;
        searchPanelEl.hidden = !nextOpen;
        searchToggleBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        if (nextOpen) {
          window.requestAnimationFrame(() => this.topSearchEl?.focus());
        }
      });
    }

    document.querySelectorAll<HTMLElement>('[data-store-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = (btn.dataset.storeCat || 'all') as StoreCategory;
        this.setCategory(cat, false);
      });
    });

    this.topSearchEl?.addEventListener('input', () => {
      this.setSearch(this.topSearchEl?.value || '', 'top');
    });

    this.topSearchEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.sectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (e.key === 'Escape' && searchPanelEl && searchToggleBtn) {
        searchPanelEl.hidden = true;
        searchToggleBtn.setAttribute('aria-expanded', 'false');
        searchToggleBtn.focus({ preventScroll: true });
      }
    });

    this.topClearEl?.addEventListener('click', () => {
      this.setSearch('', 'clear');
      this.topSearchEl?.focus({ preventScroll: true });
    });

    this.gridSearchEl?.addEventListener('input', () => {
      this.setSearch(this.gridSearchEl?.value || '', 'grid');
    });

    this.sectionEl.querySelectorAll('[data-catalog-reset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCategory = 'all';
        this.setSearch('', 'reset');
        this.syncCategoryButtons();
        this.render();
      });
    });

    this.sectionEl.querySelector('[data-catalog-top]')?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    (this.stageEl || this.gridEl)?.addEventListener('click', (e) => this.handleGridClick(e));
    storeState.subscribe(() => this.render());
    this.render();
  }

  public setCategory(cat: StoreCategory, scrollToSection = false): void {
    this.activeCategory = cat;
    this.syncCategoryButtons();
    this.render();

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (isMobile) {
      const targetRow = this.mobileRowsEl?.querySelector<HTMLElement>(
        `[data-mobile-cat-section="${cat}"]`
      );
      if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      this.sectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (scrollToSection && this.sectionEl) {
      this.sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private setSearch(value: string, source: 'top' | 'grid' | 'clear' | 'reset'): void {
    this.searchQuery = value;
    if (source !== 'top' && this.topSearchEl) {
      this.topSearchEl.value = value;
    }
    if (source !== 'grid' && this.gridSearchEl) {
      this.gridSearchEl.value = value;
    }
    if (this.topClearEl) {
      this.topClearEl.hidden = value.trim().length === 0;
    }
    this.render();
  }

  private syncCategoryButtons(): void {
    document.querySelectorAll<HTMLElement>('[data-store-cat]').forEach((btn) => {
      const selected = btn.dataset.storeCat === this.activeCategory;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  private getSearchFilteredItems(): CatalogItem[] {
    const query = this.searchQuery.trim().toLowerCase();
    return storeState.getProducts().filter((item) => {
      if (!query) return true;
      const catLabel = getCategoryLabel(item.storeCategory);
      return `${item.name} ${item.vendor} ${item.type} ${catLabel}`.toLowerCase().includes(query);
    });
  }

  private getFilteredItems(): CatalogItem[] {
    return this.getSearchFilteredItems().filter(
      (item) => this.activeCategory === 'all' || item.storeCategory === this.activeCategory
    );
  }

  private renderCardHtml(item: CatalogItem, radioPrefix = 'GridOpt'): string {
    const catLabel = getCategoryLabel(item.storeCategory);
    const radioName = `${radioPrefix}-${item.id}`;
    const sizePills = item.sizes
      .map((sz, idx) => {
        const checked = idx === 0 ? ' checked' : '';
        return `<label class="catalog-size-pill"><input type="radio" name="${radioName}" value="${escapeHtml(sz)}" data-rw-option="0"${checked}><span>${escapeHtml(sz)}</span></label>`;
      })
      .join('');

    return `
      <li class="catalog-card" data-catalog-card data-product-id="${escapeHtml(item.id)}">
        <button type="button" class="catalog-media" data-catalog-qv="${escapeHtml(item.id)}" aria-label="Quick view ${escapeHtml(item.name)}">
          <img
            src="${escapeHtml(item.image)}"
            width="${item.width}"
            height="${item.height}"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            alt="${escapeHtml(item.name)}"
          />
          <span class="catalog-qv-pill">Quick View</span>
        </button>
        <div class="catalog-card-body">
          <span class="catalog-card-cat">${escapeHtml(item.vendor)} · ${escapeHtml(catLabel)}</span>
          <div class="catalog-card-top">
            <button type="button" class="catalog-card-title" data-catalog-qv="${escapeHtml(item.id)}">
              ${escapeHtml(item.name)}
            </button>
            <span class="catalog-card-price">${formatMoney(item.price)}</span>
          </div>
          <div class="catalog-sizes" role="group" aria-label="Select size for ${escapeHtml(item.name)}">
            ${sizePills}
          </div>
          <button type="button" class="catalog-add-btn" data-catalog-add="${escapeHtml(item.id)}">
            Add to bag
          </button>
        </div>
      </li>
    `;
  }

  public render(): void {
    if (!this.gridEl || !this.emptyEl) return;
    const searchItems = this.getSearchFilteredItems();
    const items = this.getFilteredItems();
    const headingText = this.searchQuery.trim()
      ? `${getCategoryLabel(this.activeCategory)} · “${this.searchQuery.trim()}”`
      : getCategoryLabel(this.activeCategory);

    if (this.headingEl) {
      this.headingEl.textContent = headingText;
    }
    if (this.countEl) {
      this.countEl.textContent = `${items.length} ${items.length === 1 ? 'piece' : 'pieces'}`;
    }

    const resetBtn = this.sectionEl?.querySelector<HTMLElement>('[data-catalog-reset]');
    if (resetBtn) {
      resetBtn.textContent = `Show All ${storeState.getProducts().length} Products`;
    }

    if (items.length === 0) {
      this.gridEl.innerHTML = '';
      this.gridEl.hidden = true;
    } else {
      this.gridEl.hidden = false;
      this.gridEl.innerHTML = items.map((item) => this.renderCardHtml(item, 'GridOpt')).join('');
    }

    const hasMobileRows = searchItems.length > 0;
    this.gridEl.classList.toggle('catalog-grid--has-mobile-rows', hasMobileRows);

    if (this.mobileRowsEl) {
      if (hasMobileRows) {
        const categorySections = MOBILE_ROW_ORDER.map((row) => {
          const rowItems =
            row.id === 'all'
              ? searchItems
              : searchItems.filter((item) => item.storeCategory === row.id);
          if (rowItems.length === 0) return '';
          const cardsHtml = rowItems
            .map((item) => this.renderCardHtml(item, `MobOpt-${row.id}`))
            .join('');
          return `
            <div class="catalog-cat-section" data-mobile-cat-section="${escapeHtml(row.id)}">
              <div class="catalog-cat-section-head">
                <h3 class="catalog-cat-section-title">${escapeHtml(row.title)}</h3>
                <span class="catalog-cat-section-count">${rowItems.length} ${rowItems.length === 1 ? 'piece' : 'pieces'}</span>
              </div>
              <ul class="catalog-grid catalog-grid--mobile-row" role="list">
                ${cardsHtml}
              </ul>
            </div>
          `;
        })
          .filter(Boolean)
          .join('');
        this.mobileRowsEl.innerHTML = categorySections;
        this.mobileRowsEl.hidden = categorySections.length === 0;
      } else {
        this.mobileRowsEl.innerHTML = '';
        this.mobileRowsEl.hidden = true;
      }
    }

    const isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 768;
    this.emptyEl.hidden = isMobileViewport ? searchItems.length > 0 : items.length > 0;
  }

  private handleGridClick(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const qvBtn = target.closest<HTMLElement>('[data-catalog-qv]');
    if (qvBtn) {
      const productId = qvBtn.dataset.catalogQv;
      if (!productId) return;
      const card = qvBtn.closest<HTMLElement>('[data-catalog-card]');
      const item = storeState.getProductById(productId);
      const selectedSize = card?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value;
      const variant = item?.variants.find((v) => v.a && v.o[0] === selectedSize);
      this.quickView.open(
        {
          productId,
          lookLabel: item?.type,
          selectedVariantId: variant?.id,
          cardEl: card,
        },
        qvBtn
      );
      return;
    }

    const addBtn = target.closest<HTMLButtonElement>('[data-catalog-add]');
    if (addBtn) {
      const productId = addBtn.dataset.catalogAdd;
      if (!productId) return;
      const card = addBtn.closest<HTMLElement>('[data-catalog-card]');
      const item = storeState.getProductById(productId);
      if (!item) return;

      const selectedSize = card?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value;
      const variant =
        item.variants.find((v) => v.a && v.o[0] === selectedSize) ||
        item.variants.find((v) => v.a);

      if (!variant) {
        this.bag.toast('This item is currently sold out.');
        return;
      }

      this.bag.add([{ id: variant.id, quantity: 1 }]);
      addBtn.classList.add('is-added');
      addBtn.textContent = 'Added to bag ✓';
      window.setTimeout(() => {
        if (addBtn.isConnected) {
          addBtn.classList.remove('is-added');
          addBtn.textContent = 'Add to bag';
        }
      }, 1500);
    }
  }
}
