import {
  CatalogItem,
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

function getCategoryLabel(category: StoreCategory): string {
  return storeState.getCategoryLabel(category);
}

const WISHLIST_STORAGE_KEY = 'grsons-wishlist-v1';

export class CatalogGrid {
  private bag: StylingBag;
  private quickView: QuickViewModal;
  private activeCategory: StoreCategory = 'all';
  private wishlistOnly = false;
  private wishlistIds = new Set<string>();
  private searchQuery = '';
  private sectionEl: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private gridEl: HTMLElement | null = null;
  private catsContainerEl: HTMLElement | null = null;
  private mobileRowsEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private headingEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private topSearchEl: HTMLInputElement | null = null;
  private topClearEl: HTMLButtonElement | null = null;
  private gridSearchEl: HTMLInputElement | null = null;
  private gridClearEl: HTMLButtonElement | null = null;
  private wishlistFilterBtn: HTMLButtonElement | null = null;

  constructor(bag: StylingBag, quickView: QuickViewModal) {
    this.bag = bag;
    this.quickView = quickView;
    this.wishlistIds = this.readWishlist();
  }

  private readWishlist(): Set<string> {
    try {
      const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  }

  private writeWishlist(): void {
    try {
      window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(Array.from(this.wishlistIds)));
    } catch {
      // ignore storage errors
    }
  }

  public initDOM(): void {
    this.sectionEl = document.getElementById('catalog-showcase');
    if (!this.sectionEl) return;

    this.stageEl = this.sectionEl.querySelector('[data-catalog-stage]');
    this.gridEl = this.sectionEl.querySelector('[data-catalog-grid]');
    this.catsContainerEl = this.sectionEl.querySelector('.store-cats');
    this.mobileRowsEl = this.sectionEl.querySelector('[data-catalog-mobile-rows]');
    this.emptyEl = this.sectionEl.querySelector('[data-catalog-empty]');
    this.headingEl = this.sectionEl.querySelector('[data-catalog-heading]');
    this.countEl = this.sectionEl.querySelector('[data-catalog-count]');
    this.topSearchEl = document.getElementById('store-search-input') as HTMLInputElement | null;
    this.topClearEl = document.getElementById('store-search-clear') as HTMLButtonElement | null;
    this.gridSearchEl = this.sectionEl.querySelector(
      '[data-catalog-search]'
    ) as HTMLInputElement | null;
    this.gridClearEl = this.sectionEl.querySelector(
      '[data-catalog-clear]'
    ) as HTMLButtonElement | null;
    this.wishlistFilterBtn = this.sectionEl.querySelector(
      '[data-wishlist-filter]'
    ) as HTMLButtonElement | null;

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

    this.renderCategoryPills();
    this.catsContainerEl?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest<HTMLElement>('[data-store-cat]');
      if (!btn) return;
      const cat = (btn.dataset.storeCat || 'all') as StoreCategory;
      this.wishlistOnly = false;
      this.syncWishlistUi();
      this.setCategory(cat, false);
    });

    this.wishlistFilterBtn?.addEventListener('click', () => {
      this.wishlistOnly = !this.wishlistOnly;
      this.syncWishlistUi();
      this.render();
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

    this.gridClearEl?.addEventListener('click', () => {
      this.setSearch('', 'clear');
      this.gridSearchEl?.focus({ preventScroll: true });
    });

    this.sectionEl.querySelectorAll('[data-catalog-reset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCategory = 'all';
        this.wishlistOnly = false;
        this.setSearch('', 'reset');
        this.syncCategoryButtons();
        this.syncWishlistUi();
        this.render();
      });
    });

    this.sectionEl.querySelector('[data-catalog-top]')?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    (this.stageEl || this.gridEl)?.addEventListener('click', (e) => this.handleGridClick(e));
    storeState.subscribe(() => this.render());
    this.syncWishlistUi();
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
    if (this.gridClearEl) {
      this.gridClearEl.hidden = value.trim().length === 0;
    }
    this.render();
  }

  private syncWishlistUi(): void {
    const validIds = new Set(storeState.getProducts().map((p) => p.id));
    let count = 0;
    for (const id of this.wishlistIds) {
      if (validIds.has(id)) count += 1;
    }
    document.querySelectorAll<HTMLElement>('[data-wishlist-count]').forEach((el) => {
      el.textContent = String(count);
    });
    if (this.wishlistFilterBtn) {
      this.wishlistFilterBtn.setAttribute('aria-pressed', this.wishlistOnly ? 'true' : 'false');
      this.wishlistFilterBtn.classList.toggle('is-active', this.wishlistOnly);
    }
  }

  private toggleWishlist(productId: string): void {
    if (this.wishlistIds.has(productId)) {
      this.wishlistIds.delete(productId);
      this.bag.toast('Removed from Saved Wishlist');
    } else {
      this.wishlistIds.add(productId);
      this.bag.toast('Saved to Wishlist');
    }
    this.writeWishlist();
    this.syncWishlistUi();
    this.render();
  }

  private renderCategoryPills(): void {
    if (!this.catsContainerEl) return;
    const categories = storeState.getCategories();
    if (this.activeCategory !== 'all' && !categories.some((c) => c.id === this.activeCategory)) {
      this.activeCategory = 'all';
    }
    const allTabs: { id: StoreCategory; label: string }[] = [
      { id: 'all', label: 'All' },
      ...categories.map((c) => ({ id: c.id, label: c.label })),
    ];
    this.catsContainerEl.innerHTML = allTabs
      .map((c) => {
        const selected = c.id === this.activeCategory;
        return `<button type="button" class="store-cat-btn" data-store-cat="${escapeHtml(c.id)}" role="tab" aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(c.label)}</button>`;
      })
      .join('');
  }

  private syncCategoryButtons(): void {
    this.renderCategoryPills();
    document.querySelectorAll<HTMLElement>('[data-store-cat]').forEach((btn) => {
      const selected = btn.dataset.storeCat === this.activeCategory;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  private getSearchFilteredItems(): CatalogItem[] {
    const query = this.searchQuery.trim().toLowerCase();
    return storeState.getProducts().filter((item) => {
      if (this.wishlistOnly && !this.wishlistIds.has(item.id)) return false;
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
    const isSaved = this.wishlistIds.has(item.id);
    const sizePills = item.sizes
      .map((sz, idx) => {
        const checked = idx === 0 ? ' checked' : '';
        return `<label class="catalog-size-pill"><input type="radio" name="${radioName}" value="${escapeHtml(sz)}" data-rw-option="0"${checked}><span>${escapeHtml(sz)}</span></label>`;
      })
      .join('');

    return `
      <li class="catalog-card" data-catalog-card data-product-id="${escapeHtml(item.id)}">
        <div class="catalog-media-wrap">
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
          <button
            type="button"
            class="catalog-wish-btn${isSaved ? ' is-saved' : ''}"
            data-catalog-wish="${escapeHtml(item.id)}"
            aria-pressed="${isSaved ? 'true' : 'false'}"
            aria-label="${isSaved ? `Remove ${escapeHtml(item.name)} from saved` : `Save ${escapeHtml(item.name)} to wishlist`}"
            title="${isSaved ? 'Remove from Saved' : 'Save to Wishlist'}"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
              <path d="M12 20.5s-7.5-4.8-9.5-9.2C.9 7.8 3 4.2 6.8 4.2c2.1 0 3.9 1.1 5.2 2.9 1.3-1.8 3.1-2.9 5.2-2.9 3.8 0 5.9 3.6 4.3 7.1-2 4.4-9.5 9.2-9.5 9.2z" />
            </svg>
          </button>
        </div>
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
    this.syncCategoryButtons();
    this.syncWishlistUi();
    const searchItems = this.getSearchFilteredItems();
    const items = this.getFilteredItems();
    const baseLabel = this.wishlistOnly
      ? `Saved Wishlist · ${getCategoryLabel(this.activeCategory)}`
      : getCategoryLabel(this.activeCategory);
    const headingText = this.searchQuery.trim()
      ? `${baseLabel} · “${this.searchQuery.trim()}”`
      : baseLabel;

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

    const emptyCopy = this.emptyEl.querySelector('p');
    if (emptyCopy) {
      emptyCopy.textContent = this.wishlistOnly
        ? 'No saved garments yet. Tap the heart icon on any piece to save it to your wishlist.'
        : 'No garments match your current filter.';
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
        const dynamicRowOrder: { id: StoreCategory; title: string }[] = [
          { id: 'all', title: 'ALL COLLECTION' },
          ...storeState.getCategories().map((c) => ({
            id: c.id,
            title: c.label.toUpperCase(),
          })),
        ];

        const categorySections = dynamicRowOrder
          .map((row) => {
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

    const wishBtn = target.closest<HTMLButtonElement>('[data-catalog-wish]');
    if (wishBtn) {
      const productId = wishBtn.dataset.catalogWish;
      if (productId) {
        this.toggleWishlist(productId);
      }
      return;
    }

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
