import {
  DEFAULT_HERO_BANNER,
  DEFAULT_SHOWROOM,
  STORE_CATEGORIES,
  StoreCategory,
  formatMoney,
} from '../data/catalog.ts';
import {
  compressImageFile,
  removeBackgroundCanvasBFS,
  storeState,
} from '../data/storeState.ts';
import { RunwaySection } from './runwaySection.ts';

type AdminTabId = 'products' | 'banner' | 'runway' | 'sync';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const EDITABLE_CATEGORIES: { id: Exclude<StoreCategory, 'all'>; label: string }[] = [
  { id: 'shirts', label: 'Shirts' },
  { id: 'waistcoats-coats', label: 'Waistcoats & Coats' },
  { id: 'trousers', label: 'Trousers' },
  { id: 'shoes', label: 'Shoes' },
];

export class AdminPanel {
  private unlocked = false;
  private activeTab: AdminTabId = 'products';
  private selectedRunwayLookIdx = 0;
  private productSearch = '';
  private productCatFilter: StoreCategory = 'all';
  private newProductPhoto = '';
  private skipProductBgRemoval = false;
  private skipRunwayBgRemoval = false;
  private aiBusyTarget: string | null = null;
  private aiBusyLabel = 'Removing Background...';
  private confirmResetPending = false;
  private confirmResetTimer: number | null = null;
  private pendingDeleteIds = new Set<string>();
  private suppressNextStoreRender = false;
  private statusNotice = '';
  private statusNoticeTimer: number | null = null;
  private logoTapCount = 0;
  private logoTapResetTimer: number | null = null;

  private pinDialog: HTMLDialogElement | null = null;
  private pinForm: HTMLFormElement | null = null;
  private pinInput: HTMLInputElement | null = null;
  private pinError: HTMLElement | null = null;
  private dashboardDialog: HTMLDialogElement | null = null;
  private dashboardBody: HTMLElement | null = null;
  private statusBarEl: HTMLElement | null = null;
  private saveBtnEl: HTMLButtonElement | null = null;
  private resetBtnEl: HTMLButtonElement | null = null;

  public initDOM(): void {
    this.pinDialog = document.getElementById('admin-pin-dialog') as HTMLDialogElement | null;
    this.pinForm = document.getElementById('admin-pin-form') as HTMLFormElement | null;
    this.pinInput = document.getElementById('admin-pin-input') as HTMLInputElement | null;
    this.pinError = document.getElementById('admin-pin-error');
    this.dashboardDialog = document.getElementById('admin-dashboard-dialog') as HTMLDialogElement | null;
    this.dashboardBody = document.getElementById('admin-dashboard-body');
    this.statusBarEl = document.getElementById('admin-status-bar');
    this.saveBtnEl = document.getElementById('admin-save-all') as HTMLButtonElement | null;
    this.resetBtnEl = document.getElementById('admin-reset-all') as HTMLButtonElement | null;

    // Secret Owner Trigger 1: 5 rapid taps/clicks on top GR SON'S header logo (prevent full page reload on single tap)
    const brandTrigger =
      document.querySelector<HTMLElement>('header a.brand') ||
      document.getElementById('header-brand-logo');
    brandTrigger?.addEventListener('click', (e) => {
      e.preventDefault();
      this.logoTapCount += 1;
      if (this.logoTapResetTimer !== null) {
        window.clearTimeout(this.logoTapResetTimer);
      }
      if (this.logoTapCount >= 5) {
        this.logoTapCount = 0;
        this.logoTapResetTimer = null;
        this.openEntry();
        return;
      }
      if (this.logoTapCount === 1) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.logoTapResetTimer = window.setTimeout(() => {
        this.logoTapCount = 0;
        this.logoTapResetTimer = null;
      }, 2400);
    });

    // Secret Owner Trigger 2: Visiting URL with #admin hash
    window.addEventListener('hashchange', () => this.checkAdminHash());
    this.checkAdminHash();

    document.getElementById('admin-pin-close')?.addEventListener('click', () => {
      this.pinDialog?.close();
    });

    document.getElementById('admin-pin-toggle')?.addEventListener('click', (e) => {
      if (!this.pinInput) return;
      const btn = e.currentTarget as HTMLButtonElement;
      const showing = this.pinInput.type === 'text';
      this.pinInput.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
    });

    this.pinDialog?.addEventListener('click', (e) => {
      if (this.pinDialog && e.target === this.pinDialog) {
        this.pinDialog.close();
      }
    });

    this.pinForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handlePinSubmit();
    });

    document.getElementById('admin-lock-close')?.addEventListener('click', () => {
      this.unlocked = false;
      this.dashboardDialog?.close();
    });

    document.getElementById('admin-close-only')?.addEventListener('click', () => {
      this.dashboardDialog?.close();
    });

    this.dashboardDialog?.addEventListener('click', (e) => {
      if (this.dashboardDialog && e.target === this.dashboardDialog) {
        this.dashboardDialog.close();
      }
    });

    this.saveBtnEl?.addEventListener('click', () => void this.handleSaveAll());
    this.resetBtnEl?.addEventListener('click', () => void this.handleResetAll());

    document.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn.dataset.adminTab || 'products') as AdminTabId;
        this.activeTab = tab;
        this.syncTabButtons();
        this.renderActiveTab();
      });
    });

    storeState.subscribe(() => {
      if (this.dashboardDialog?.open && !this.suppressNextStoreRender) {
        this.renderActiveTab();
      }
    });
  }

  private checkAdminHash(): void {
    if (window.location.hash.trim().toLowerCase() === '#admin') {
      this.openEntry();
    }
  }

  private openEntry(): void {
    if (this.unlocked) {
      this.openDashboard();
      return;
    }
    if (this.pinError) this.pinError.textContent = '';
    if (this.pinInput) {
      this.pinInput.value = '';
      this.pinInput.type = 'password';
    }
    const toggleBtn = document.getElementById('admin-pin-toggle');
    if (toggleBtn) toggleBtn.textContent = 'Show';
    if (this.pinDialog && !this.pinDialog.open) {
      this.pinDialog.showModal();
      window.setTimeout(() => this.pinInput?.focus(), 40);
    }
  }

  private handlePinSubmit(): void {
    const val = this.pinInput?.value || '';
    if (!storeState.verifyPin(val)) {
      if (this.pinError) {
        this.pinError.textContent = 'Incorrect PIN. Please enter the store owner PIN (default: 1234).';
      }
      this.pinInput?.select();
      return;
    }
    if (this.pinError) this.pinError.textContent = '';
    this.unlocked = true;
    this.pinDialog?.close();
    this.openDashboard();
  }

  private openDashboard(): void {
    this.syncTabButtons();
    this.renderActiveTab();
    if (this.dashboardDialog && !this.dashboardDialog.open) {
      this.dashboardDialog.showModal();
    }
  }

  private syncTabButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach((btn) => {
      const active = btn.dataset.adminTab === this.activeTab;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  private showStatus(msg: string): void {
    this.statusNotice = msg;
    if (this.statusBarEl) {
      this.statusBarEl.textContent = msg;
      this.statusBarEl.classList.add('is-active');
    }
    if (this.statusNoticeTimer !== null) window.clearTimeout(this.statusNoticeTimer);
    this.statusNoticeTimer = window.setTimeout(() => {
      this.statusNotice = '';
      if (this.statusBarEl && !this.aiBusyTarget) {
        this.statusBarEl.textContent = '100% Free Local Store Manager · Click Save All Changes to persist';
        this.statusBarEl.classList.remove('is-active');
      }
      this.statusNoticeTimer = null;
    }, 3600);
  }

  private setAiBusy(target: string | null, label = 'Removing Background...'): void {
    this.aiBusyTarget = target;
    this.aiBusyLabel = label;

    if (this.statusBarEl) {
      if (target) {
        this.statusBarEl.textContent = label;
        this.statusBarEl.classList.add('is-active');
      } else if (!this.statusNotice) {
        this.statusBarEl.textContent = '100% Free Local Store Manager · Click Save All Changes to persist';
        this.statusBarEl.classList.remove('is-active');
      }
    }

    if (!this.dashboardBody) return;
    this.dashboardBody.querySelectorAll<HTMLElement>('[data-ai-overlay]').forEach((overlay) => {
      const isMatch = Boolean(target && overlay.dataset.aiOverlay === target);
      overlay.classList.toggle('is-busy', isMatch);
      const labelEl = overlay.querySelector<HTMLElement>('[data-ai-label]');
      if (labelEl && isMatch) {
        labelEl.textContent = label;
      }
    });
    this.dashboardBody.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((inp) => {
      inp.disabled = Boolean(target);
    });
  }

  private async processUploadedImage(
    file: File,
    opts: {
      target: string;
      skipAi: boolean;
      maxDim?: number;
      quality?: number;
    }
  ): Promise<{ url: string; usedBgCleaner: boolean; fallbackUsed: boolean }> {
    const maxWidth = opts.maxDim ?? 900;
    const quality = opts.quality ?? 0.85;

    if (opts.skipAi) {
      const url = await compressImageFile(file, maxWidth, quality);
      return { url, usedBgCleaner: false, fallbackUsed: false };
    }

    this.setAiBusy(opts.target, 'Removing Background...');
    try {
      const url = await removeBackgroundCanvasBFS(file, maxWidth, 14, quality);
      return { url, usedBgCleaner: true, fallbackUsed: false };
    } catch (err) {
      console.warn('Canvas flood-fill background removal fallback to compressed upload:', err);
      const url = await compressImageFile(file, maxWidth, quality);
      return { url, usedBgCleaner: false, fallbackUsed: true };
    } finally {
      this.setAiBusy(null);
    }
  }

  private async handleSaveAll(): Promise<void> {
    if (this.saveBtnEl) {
      this.saveBtnEl.disabled = true;
      this.saveBtnEl.textContent = 'Saving...';
    }
    try {
      await storeState.saveAllChanges();
      const cloud = storeState.getCloudSync();
      if (cloud.endpointUrl.trim() && cloud.autoSyncOnSave) {
        this.showStatus('Saved locally & synced live configuration to your Cloud Endpoint!');
      } else {
        this.showStatus('All changes saved locally. Open Tab 4 to Cloud Sync or Export Live Config.');
      }
    } finally {
      if (this.saveBtnEl) {
        this.saveBtnEl.disabled = false;
        this.saveBtnEl.textContent = 'Save All Changes';
      }
    }
  }

  private async handleResetAll(): Promise<void> {
    if (!this.confirmResetPending) {
      this.confirmResetPending = true;
      if (this.resetBtnEl) {
        this.resetBtnEl.textContent = 'Confirm Reset to Default?';
        this.resetBtnEl.classList.add('is-confirming');
      }
      if (this.confirmResetTimer !== null) window.clearTimeout(this.confirmResetTimer);
      this.confirmResetTimer = window.setTimeout(() => {
        this.confirmResetPending = false;
        if (this.resetBtnEl) {
          this.resetBtnEl.textContent = 'Reset to Default';
          this.resetBtnEl.classList.remove('is-confirming');
        }
        this.confirmResetTimer = null;
      }, 4000);
      return;
    }

    this.confirmResetPending = false;
    if (this.confirmResetTimer !== null) {
      window.clearTimeout(this.confirmResetTimer);
      this.confirmResetTimer = null;
    }
    if (this.resetBtnEl) {
      this.resetBtnEl.textContent = 'Reset to Default';
      this.resetBtnEl.classList.remove('is-confirming');
    }
    await storeState.resetToDefault();
    this.renderActiveTab();
    this.showStatus('Restored original factory storefront catalog, banner, and 3D runway models.');
  }

  private renderActiveTab(): void {
    if (!this.dashboardBody) return;
    if (this.statusBarEl && !this.statusNotice) {
      this.statusBarEl.textContent = '100% Free Local Store Manager · Click Save All Changes to persist';
    }
    switch (this.activeTab) {
      case 'products':
        this.renderProductsTab();
        break;
      case 'banner':
        this.renderBannerTab();
        break;
      case 'runway':
        this.renderRunwayEditorTab();
        break;
      case 'sync':
        this.renderSyncAndShowroomTab();
        break;
    }
  }

  // =========================================================================
  // TAB 1: PRODUCTS & PRICES MANAGER (PKR)
  // =========================================================================
  private renderProductsTab(): void {
    if (!this.dashboardBody) return;
    const allProducts = storeState.getProducts();
    const query = this.productSearch.trim().toLowerCase();
    const filtered = allProducts.filter((p) => {
      if (this.productCatFilter !== 'all' && p.storeCategory !== this.productCatFilter) {
        return false;
      }
      if (!query) return true;
      return `${p.name} ${p.vendor} ${p.type} ${p.storeCategory}`.toLowerCase().includes(query);
    });

    const catOptionsHtml = EDITABLE_CATEGORIES.map(
      (c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`
    ).join('');

    const filterButtonsHtml = STORE_CATEGORIES.map((c) => {
      const active = c.id === this.productCatFilter;
      return `<button type="button" class="adm-chip" data-adm-cat-filter="${c.id}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(c.label)}</button>`;
    }).join('');

    const rowsHtml = filtered
      .map((item) => {
        const isConfirmingDel = this.pendingDeleteIds.has(item.id);
        const catOpts = EDITABLE_CATEGORIES.map(
          (c) =>
            `<option value="${c.id}"${item.storeCategory === c.id ? ' selected' : ''}>${escapeHtml(c.label)}</option>`
        ).join('');

        const prodTarget = `prod-${item.id}`;
        const prodBusy = this.aiBusyTarget === prodTarget;

        return `
          <div class="adm-prod-row" data-adm-prod="${escapeHtml(item.id)}">
            <div class="adm-prod-photo-col">
              <div class="adm-prod-thumb-wrap">
                <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" width="72" height="90" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                <div class="adm-ai-overlay adm-ai-overlay--mini${prodBusy ? ' is-busy' : ''}" data-ai-overlay="${escapeHtml(prodTarget)}" aria-live="polite">
                  <span class="adm-ai-spinner" aria-hidden="true"></span>
                  <span class="adm-ai-text" data-ai-label>${escapeHtml(prodBusy ? this.aiBusyLabel : 'Removing Background...')}</span>
                </div>
              </div>
              <label class="adm-upload-mini">
                <span>Change Photo</span>
                <input type="file" accept="image/*" data-adm-prod-photo="${escapeHtml(item.id)}" ${this.aiBusyTarget ? 'disabled' : ''} hidden />
              </label>
            </div>
            <div class="adm-prod-fields">
              <div class="adm-field">
                <label>Product Name</label>
                <input type="text" value="${escapeHtml(item.name)}" data-adm-prod-name="${escapeHtml(item.id)}" />
              </div>
              <div class="adm-field">
                <label>Price (PKR)</label>
                <input type="number" min="0" step="100" value="${Math.round(item.price)}" data-adm-prod-price="${escapeHtml(item.id)}" />
              </div>
              <div class="adm-field">
                <label>Category</label>
                <select data-adm-prod-cat="${escapeHtml(item.id)}">${catOpts}</select>
              </div>
              <div class="adm-field">
                <label>Brand / Label</label>
                <input type="text" value="${escapeHtml(item.vendor)}" data-adm-prod-vendor="${escapeHtml(item.id)}" />
              </div>
            </div>
            <div class="adm-prod-actions">
              <span class="adm-price-tag">${formatMoney(item.price)}</span>
              <button type="button" class="adm-btn-danger${isConfirmingDel ? ' is-confirming' : ''}" data-adm-prod-del="${escapeHtml(item.id)}">
                ${isConfirmingDel ? 'Confirm Delete?' : 'Delete'}
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    const newProdBusy = this.aiBusyTarget === 'new-product';

    this.dashboardBody.innerHTML = `
      <div class="adm-section">
        <div class="adm-card adm-add-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">New Inventory Item · Instant Canvas Cutout</span>
              <h3>Add New Product (PKR)</h3>
            </div>
            <label class="adm-ai-skip-toggle">
              <input type="checkbox" id="adm-skip-ai-prod" ${this.skipProductBgRemoval ? 'checked' : ''} />
              <span>Skip Background Removal</span>
            </label>
          </div>
          <form id="adm-new-prod-form" class="adm-add-grid">
            <div class="adm-new-preview">
              <div class="adm-new-preview-stage" id="adm-new-preview-stage">
                ${
                  this.newProductPhoto
                    ? `<img src="${escapeHtml(this.newProductPhoto)}" alt="New product preview" decoding="async" />`
                    : `<span class="adm-new-placeholder">No photo selected</span>`
                }
                <div class="adm-ai-overlay${newProdBusy ? ' is-busy' : ''}" data-ai-overlay="new-product" aria-live="polite">
                  <span class="adm-ai-spinner" aria-hidden="true"></span>
                  <span class="adm-ai-text" data-ai-label>${escapeHtml(newProdBusy ? this.aiBusyLabel : 'Removing Background...')}</span>
                </div>
              </div>
              <label class="adm-btn-secondary adm-upload-label">
                <span id="adm-new-upload-label">${this.skipProductBgRemoval ? 'Upload Photo (As-Is)' : 'Upload Photo (Auto-Removes Background)'}</span>
                <input type="file" id="adm-new-photo-input" accept="image/*" ${this.aiBusyTarget ? 'disabled' : ''} hidden />
              </label>
            </div>
            <div class="adm-add-fields">
              <div class="adm-field">
                <label for="adm-new-name">Product Name</label>
                <input id="adm-new-name" type="text" placeholder="e.g. Royal Silk Ivory Kurta Shirt" required />
              </div>
              <div class="adm-field">
                <label for="adm-new-vendor">Brand / Label</label>
                <input id="adm-new-vendor" type="text" value="Nike Atelier" />
              </div>
              <div class="adm-field">
                <label for="adm-new-price">Price (PKR)</label>
                <input id="adm-new-price" type="number" min="0" step="100" value="18500" required />
              </div>
              <div class="adm-field">
                <label for="adm-new-cat">Category</label>
                <select id="adm-new-cat">${catOptionsHtml}</select>
              </div>
              <div class="adm-add-submit-wrap">
                <button type="submit" class="adm-btn-gold">+ Add Product to Store</button>
              </div>
            </div>
          </form>
        </div>

        <div class="adm-toolbar">
          <div class="adm-chips">${filterButtonsHtml}</div>
          <div class="adm-search-box">
            <input type="search" id="adm-prod-search" placeholder="Search ${allProducts.length} products..." value="${escapeHtml(this.productSearch)}" />
          </div>
        </div>

        <div class="adm-prod-list">
          ${rowsHtml || '<p class="adm-empty-note">No products match this filter.</p>'}
        </div>
      </div>
    `;

    const skipProdToggle = document.getElementById('adm-skip-ai-prod') as HTMLInputElement | null;
    skipProdToggle?.addEventListener('change', () => {
      this.skipProductBgRemoval = Boolean(skipProdToggle.checked);
      const lbl = document.getElementById('adm-new-upload-label');
      if (lbl) {
        lbl.textContent = this.skipProductBgRemoval
          ? 'Upload Photo (As-Is)'
          : 'Upload Photo (Auto-Removes Background)';
      }
      this.showStatus(
        this.skipProductBgRemoval
          ? 'Auto background removal paused — product uploads will keep original backgrounds.'
          : 'Instant Canvas Flood-Fill background removal enabled — product cutouts float cleanly on #efece6.'
      );
    });

    const newPhotoInput = document.getElementById('adm-new-photo-input') as HTMLInputElement | null;
    newPhotoInput?.addEventListener('change', async () => {
      const file = newPhotoInput.files?.[0];
      if (!file) return;
      newPhotoInput.value = '';
      const result = await this.processUploadedImage(file, {
        target: 'new-product',
        skipAi: this.skipProductBgRemoval,
        maxDim: 900,
        quality: 0.85,
      });
      this.newProductPhoto = result.url;
      const stage = document.getElementById('adm-new-preview-stage');
      if (stage) {
        const existingPlaceholder = stage.querySelector('.adm-new-placeholder');
        existingPlaceholder?.remove();
        let img = stage.querySelector('img');
        if (!img) {
          img = document.createElement('img');
          img.alt = 'New product preview';
          stage.prepend(img);
        }
        img.src = result.url;
      }
      this.showStatus(
        result.usedBgCleaner
          ? 'Removed outer background cleanly via Canvas Flood-Fill!'
          : result.fallbackUsed
            ? 'Could not flood-fill file — kept clean original photo.'
            : 'Uploaded original product photo as-is.'
      );
    });

    const newForm = document.getElementById('adm-new-prod-form') as HTMLFormElement | null;
    newForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('adm-new-name') as HTMLInputElement | null;
      const vendorEl = document.getElementById('adm-new-vendor') as HTMLInputElement | null;
      const priceEl = document.getElementById('adm-new-price') as HTMLInputElement | null;
      const catEl = document.getElementById('adm-new-cat') as HTMLSelectElement | null;
      const name = nameEl?.value.trim() || '';
      if (!name) return;

      const added = storeState.addProduct({
        name,
        vendor: vendorEl?.value.trim() || 'Nike Atelier',
        price: Number(priceEl?.value || 0),
        storeCategory: (catEl?.value || 'shirts') as Exclude<StoreCategory, 'all'>,
        image: this.newProductPhoto || storeState.getProducts()[0]?.image || '',
      });
      this.newProductPhoto = '';
      this.showStatus(`Added "${added.name}" (${formatMoney(added.price)}) to storefront.`);
      this.renderProductsTab();
    });

    const searchInput = document.getElementById('adm-prod-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      this.productSearch = searchInput.value;
      const pos = searchInput.selectionStart ?? this.productSearch.length;
      this.renderProductsTab();
      const nextInput = document.getElementById('adm-prod-search') as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(pos, pos);
      }
    });

    this.dashboardBody.querySelectorAll<HTMLElement>('[data-adm-cat-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.productCatFilter = (btn.dataset.admCatFilter || 'all') as StoreCategory;
        this.renderProductsTab();
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-name]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.admProdName!;
        storeState.updateProduct(id, { name: inp.value });
        this.showStatus('Updated product name live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-vendor]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.admProdVendor!;
        storeState.updateProduct(id, { vendor: inp.value });
        this.showStatus('Updated brand label live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-price]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.admProdPrice!;
        storeState.updateProduct(id, { price: Number(inp.value || 0) });
        this.showStatus('Updated product price (PKR) live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLSelectElement>('[data-adm-prod-cat]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const id = sel.dataset.admProdCat!;
        storeState.updateProduct(id, {
          storeCategory: sel.value as Exclude<StoreCategory, 'all'>,
        });
        this.showStatus('Updated product category live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-photo]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const id = inp.dataset.admProdPhoto!;
        const file = inp.files?.[0];
        if (!file) return;
        inp.value = '';
        const result = await this.processUploadedImage(file, {
          target: `prod-${id}`,
          skipAi: this.skipProductBgRemoval,
          maxDim: 900,
          quality: 0.85,
        });
        storeState.updateProduct(id, { image: result.url });
        this.showStatus(
          result.usedBgCleaner
            ? 'Removed outer background cleanly — updated product card!'
            : result.fallbackUsed
              ? 'Could not flood-fill file — updated product photo as-is.'
              : 'Updated product photo live.'
        );
      });
    });

    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-prod-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.admProdDel!;
        if (!this.pendingDeleteIds.has(id)) {
          this.pendingDeleteIds.add(id);
          this.renderProductsTab();
          window.setTimeout(() => {
            if (this.pendingDeleteIds.delete(id) && this.activeTab === 'products') {
              this.renderProductsTab();
            }
          }, 4000);
          return;
        }
        this.pendingDeleteIds.delete(id);
        storeState.deleteProduct(id);
        this.showStatus('Product removed from catalog.');
      });
    });
  }

  // =========================================================================
  // TAB 2: MAIN HERO BANNER EDITOR (ALL 3 SLIDES + SHARED CTAS)
  // =========================================================================
  private renderBannerTab(): void {
    if (!this.dashboardBody) return;
    const banner = storeState.getHeroBanner();
    const slides = storeState.getHeroSlides();

    const slidesHtml = slides
      .map((slide, idx) => {
        return `
        <div class="adm-card adm-hero-slide-card" data-adm-hero-slide="${idx}">
          <div class="adm-card-head">
            <div class="adm-slide-title-wrap">
              <span class="adm-eyebrow">Hero Slide 0${idx + 1} · Auto-Slider Sequence</span>
              <h3>
                <span class="adm-slide-swatch-preview" style="background: ${escapeHtml(slide.swatchHex)}" aria-hidden="true"></span>
                <span>Slide ${idx + 1}: ${escapeHtml(slide.label)}</span>
              </h3>
            </div>
            <div class="adm-banner-top-actions">
              <label class="adm-btn-gold adm-upload-label">
                <span>Upload Slide ${idx + 1} Photo</span>
                <input type="file" accept="image/*" data-adm-slide-file="${idx}" hidden />
              </label>
              <button type="button" class="adm-btn-secondary" data-adm-slide-preview="${idx}">Preview on Store</button>
              <button type="button" class="adm-btn-secondary" data-adm-slide-reset="${idx}">Default Slide ${idx + 1}</button>
            </div>
          </div>

          <div class="adm-banner-preview">
            <img src="${escapeHtml(slide.image)}" alt="Hero slide ${idx + 1} preview" decoding="async" referrerpolicy="no-referrer" />
            <div class="adm-banner-scrim"></div>
            <div class="adm-banner-overlay">
              <span class="adm-bp-note">${escapeHtml(banner.brandNote)}</span>
              <span class="adm-bp-eyebrow">${escapeHtml(slide.eyebrow)}</span>
              <h4>${escapeHtml(slide.title)}</h4>
              <p>${escapeHtml(slide.subtitle)}</p>
              <div class="adm-bp-ctas">
                <span class="adm-bp-cta-pri">${escapeHtml(banner.ctaPrimary)}</span>
                <span class="adm-bp-cta-sec">${escapeHtml(banner.ctaSecondary)}</span>
              </div>
            </div>
          </div>

          <div class="adm-form-grid">
            <div class="adm-field">
              <label for="adm-sl-label-${idx}">Swatch Tooltip Label</label>
              <input id="adm-sl-label-${idx}" data-adm-slide-label="${idx}" type="text" value="${escapeHtml(slide.label)}" />
            </div>
            <div class="adm-field">
              <label for="adm-sl-color-${idx}">Swatch Dot Color</label>
              <div class="adm-color-input-row">
                <input id="adm-sl-color-${idx}" data-adm-slide-color="${idx}" type="color" value="${escapeHtml(slide.swatchHex)}" />
                <input data-adm-slide-color-hex="${idx}" type="text" value="${escapeHtml(slide.swatchHex)}" maxlength="7" aria-label="Hex color code for Slide ${idx + 1}" />
              </div>
            </div>
            <div class="adm-field adm-field--full">
              <label for="adm-sl-eyebrow-${idx}">Slide ${idx + 1} Eyebrow</label>
              <input id="adm-sl-eyebrow-${idx}" data-adm-slide-eyebrow="${idx}" type="text" value="${escapeHtml(slide.eyebrow)}" />
            </div>
            <div class="adm-field adm-field--full">
              <label for="adm-sl-title-${idx}">Slide ${idx + 1} Headline</label>
              <input id="adm-sl-title-${idx}" data-adm-slide-title="${idx}" type="text" value="${escapeHtml(slide.title)}" />
            </div>
            <div class="adm-field adm-field--full">
              <label for="adm-sl-sub-${idx}">Slide ${idx + 1} Subtitle Description</label>
              <textarea id="adm-sl-sub-${idx}" data-adm-slide-sub="${idx}" rows="2">${escapeHtml(slide.subtitle)}</textarea>
            </div>
            <div class="adm-field adm-field--full">
              <label for="adm-sl-pos-${idx}">Mobile Focal Position (CSS object-position, e.g. center 18%, 94% 18%)</label>
              <div class="adm-color-input-row">
                <input id="adm-sl-pos-${idx}" data-adm-slide-pos="${idx}" type="text" value="${escapeHtml(slide.mobileObjectPosition || 'center 18%')}" placeholder="center 18%" />
                <select data-adm-slide-pos-preset="${idx}" aria-label="Mobile framing preset for Slide ${idx + 1}">
                  <option value="">Preset...</option>
                  <option value="center 18%">Center (center 18%)</option>
                  <option value="70% 18%">Suits Focus (70% 18%)</option>
                  <option value="78% 18%">Subject Center-Right (78% 18%)</option>
                  <option value="94% 18%">Subject Right (94% 18%)</option>
                  <option value="20% 18%">Subject Left (20% 18%)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    this.dashboardBody.innerHTML = `
      <div class="adm-section">
        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Shared Banner Labels · Across All 3 Slides</span>
              <h3>Main Hero Global Note &amp; CTA Buttons</h3>
            </div>
          </div>
          <div class="adm-form-grid">
            <div class="adm-field">
              <label for="adm-bn-note">Top Atelier Note</label>
              <input id="adm-bn-note" type="text" value="${escapeHtml(banner.brandNote)}" />
            </div>
            <div class="adm-field">
              <label for="adm-bn-pri">Primary CTA Label</label>
              <input id="adm-bn-pri" type="text" value="${escapeHtml(banner.ctaPrimary)}" />
            </div>
            <div class="adm-field">
              <label for="adm-bn-sec">Secondary CTA Label</label>
              <input id="adm-bn-sec" type="text" value="${escapeHtml(banner.ctaSecondary)}" />
            </div>
          </div>
        </div>
        ${slidesHtml}
      </div>
    `;

    const wireSharedText = (id: string, key: 'brandNote' | 'ctaPrimary' | 'ctaSecondary') => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      el?.addEventListener('change', () => {
        storeState.updateHeroBanner({ [key]: el.value });
        this.showStatus('Updated shared hero banner labels live.');
      });
    };
    wireSharedText('adm-bn-note', 'brandNote');
    wireSharedText('adm-bn-pri', 'ctaPrimary');
    wireSharedText('adm-bn-sec', 'ctaSecondary');

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-slide-file]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const idx = Number(inp.dataset.admSlideFile);
        const file = inp.files?.[0];
        if (!file) return;
        inp.value = '';
        const compressed = await compressImageFile(file, 1400, 0.86);
        storeState.updateHeroSlide(idx, { image: compressed });
        this.showStatus(`Updated Hero Slide ${idx + 1} photo live.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-slide-reset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.admSlideReset);
        storeState.restoreHeroSlideDefault(idx);
        this.showStatus(`Restored Hero Slide ${idx + 1} to factory default.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-slide-preview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.admSlidePreview);
        this.dashboardDialog?.close();
        const runway = document.querySelector<RunwaySection>('runway-section');
        runway?.setHeroSlide(idx, true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-slide-label]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.admSlideLabel);
        storeState.updateHeroSlide(idx, { label: inp.value.trim() || `Slide ${idx + 1}` });
        this.showStatus(`Updated Slide ${idx + 1} swatch label.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-slide-color]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.admSlideColor);
        storeState.updateHeroSlide(idx, { swatchHex: inp.value });
        this.showStatus(`Updated Slide ${idx + 1} swatch color (${inp.value}).`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-slide-color-hex]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.admSlideColorHex);
        const val = inp.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
          storeState.updateHeroSlide(idx, { swatchHex: val });
          this.showStatus(`Updated Slide ${idx + 1} swatch color (${val}).`);
        }
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-slide-eyebrow]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.admSlideEyebrow);
        storeState.updateHeroSlide(idx, { eyebrow: inp.value });
        this.showStatus(`Updated Slide ${idx + 1} eyebrow text.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-slide-title]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.admSlideTitle);
        storeState.updateHeroSlide(idx, { title: inp.value });
        this.showStatus(`Updated Slide ${idx + 1} headline.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLTextAreaElement>('[data-adm-slide-sub]').forEach((ta) => {
      ta.addEventListener('change', () => {
        const idx = Number(ta.dataset.admSlideSub);
        storeState.updateHeroSlide(idx, { subtitle: ta.value });
        this.showStatus(`Updated Slide ${idx + 1} subtitle description.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-slide-pos]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.dataset.admSlidePos);
        const val = inp.value.trim() || 'center 18%';
        storeState.updateHeroSlide(idx, { mobileObjectPosition: val });
        this.showStatus(`Updated Slide ${idx + 1} mobile focal alignment (${val}).`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLSelectElement>('[data-adm-slide-pos-preset]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.admSlidePosPreset);
        if (!sel.value) return;
        const val = sel.value;
        storeState.updateHeroSlide(idx, { mobileObjectPosition: val });
        const inputEl = document.getElementById(`adm-sl-pos-${idx}`) as HTMLInputElement | null;
        if (inputEl) inputEl.value = val;
        this.showStatus(`Applied mobile focal alignment (${val}) to Slide ${idx + 1}.`);
      });
    });
  }

  // =========================================================================
  // TAB 3: 3D RUNWAY MODELS & 'IN THIS LOOK' CARDS EDITOR (100% LOCAL)
  // =========================================================================
  private renderRunwayEditorTab(): void {
    if (!this.dashboardBody) return;
    const looks = storeState.getLooks();
    const allProducts = storeState.getProducts();
    const look = looks[this.selectedRunwayLookIdx] || looks[0];
    const globalPanelOn = storeState.getShowInThisLookGlobal();
    const lookPanelOn = look.showInThisLook !== false;
    const effectiveVisible = globalPanelOn && lookPanelOn;

    const modelTabsHtml = looks
      .map((l, i) => {
        const selected = i === this.selectedRunwayLookIdx;
        const hiddenBadge =
          !globalPanelOn || l.showInThisLook === false
            ? '<span class="adm-model-pick-badge">Sidebar Hidden</span>'
            : '';
        return `
          <button type="button" class="adm-model-pick${selected ? ' is-selected' : ''}" data-adm-rw-model="${i}">
            <div class="adm-model-pick-thumb">
              <img src="${escapeHtml(l.model640)}" alt="Model ${i + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
            </div>
            <span>Look 0${i + 1}</span>
            <small>${escapeHtml(l.name)}</small>
            ${hiddenBadge}
          </button>
        `;
      })
      .join('');

    let lookSum = 0;
    const pieceCardsHtml = look.pieces
      .map((piece) => {
        const resolved = storeState.getLookPieceResolved(this.selectedRunwayLookIdx, piece.num);
        const item = resolved.item;
        const isCustom = resolved.mode === 'custom';
        if (item) lookSum += item.price;

        const slotRole =
          piece.num === 1 ? 'Piece 01 · Top / Jacket' : piece.num === 2 ? 'Piece 02 · Trousers / Denim' : 'Piece 03 · Footwear';

        const productOptions = allProducts
          .map(
            (prod) =>
              `<option value="${escapeHtml(prod.id)}"${!isCustom && prod.id === piece.productId ? ' selected' : ''}>${escapeHtml(prod.name)} (${formatMoney(prod.price)})</option>`
          )
          .join('');

        const catOpts = EDITABLE_CATEGORIES.map(
          (c) =>
            `<option value="${c.id}"${item?.storeCategory === c.id ? ' selected' : ''}>${escapeHtml(c.label)}</option>`
        ).join('');

        const pieceTarget = `piece-${piece.num}`;
        const pieceBusy = this.aiBusyTarget === pieceTarget;

        return `
          <div class="adm-piece-card${isCustom ? ' is-custom-mode' : ''}">
            <div class="adm-piece-head">
              <span class="adm-piece-badge">${slotRole}</span>
              <div class="adm-piece-head-right">
                <div class="adm-piece-modes" role="group" aria-label="Source mode for Piece 0${piece.num}">
                  <button
                    type="button"
                    class="adm-mode-btn"
                    data-adm-piece-mode="${piece.num}"
                    data-mode="linked"
                    aria-pressed="${!isCustom ? 'true' : 'false'}"
                  >Link Store Product</button>
                  <button
                    type="button"
                    class="adm-mode-btn"
                    data-adm-piece-mode="${piece.num}"
                    data-mode="custom"
                    aria-pressed="${isCustom ? 'true' : 'false'}"
                  >Upload Custom Item</button>
                </div>
                <span class="adm-piece-price">${item ? formatMoney(item.price) : 'Unlinked'}</span>
              </div>
            </div>

            <div class="adm-piece-top">
              <div class="adm-prod-photo-col">
                <div class="adm-prod-thumb-wrap">
                  <img src="${escapeHtml(item?.image || '')}" alt="${escapeHtml(item?.name || 'Garment')}" width="72" height="90" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                  <div class="adm-ai-overlay adm-ai-overlay--mini${pieceBusy ? ' is-busy' : ''}" data-ai-overlay="${escapeHtml(pieceTarget)}" aria-live="polite">
                    <span class="adm-ai-spinner" aria-hidden="true"></span>
                    <span class="adm-ai-text" data-ai-label>${escapeHtml(pieceBusy ? this.aiBusyLabel : 'Removing Background...')}</span>
                  </div>
                </div>
                ${
                  isCustom
                    ? `<label class="adm-upload-mini">
                        <span>Upload Photo</span>
                        <input type="file" accept="image/*" data-adm-piece-photo="${piece.num}" ${this.aiBusyTarget ? 'disabled' : ''} hidden />
                      </label>`
                    : `<button type="button" class="adm-upload-mini-btn" data-adm-piece-switch-custom="${piece.num}">
                        Customize Photo
                      </button>`
                }
              </div>
              <div class="adm-piece-fields">
                ${
                  !isCustom
                    ? `
                      <div class="adm-field">
                        <label>Link Existing Store Product</label>
                        <select data-adm-piece-assign="${piece.num}">${productOptions}</select>
                      </div>
                      <div class="adm-linked-summary">
                        <span><strong>${escapeHtml(item?.name || 'Select a product')}</strong></span>
                        <span>${item ? formatMoney(item.price) : '—'} · Linked from store catalog</span>
                      </div>
                    `
                    : `
                      <div class="adm-field">
                        <label>Custom Item Name (Replaces Default on Look 0${this.selectedRunwayLookIdx + 1})</label>
                        <input type="text" value="${escapeHtml(item?.name || '')}" data-adm-piece-name="${piece.num}" placeholder="e.g. Tailored Camel Overcoat" />
                      </div>
                      <div class="adm-piece-inline">
                        <div class="adm-field">
                          <label>Custom Price (PKR)</label>
                          <input type="number" min="0" step="100" value="${Math.round(item?.price || 0)}" data-adm-piece-price="${piece.num}" />
                        </div>
                        <div class="adm-field">
                          <label>Category (Sizes)</label>
                          <select data-adm-piece-cat="${piece.num}">${catOpts}</select>
                        </div>
                      </div>
                    `
                }
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const bundleTotal = Math.round(lookSum * 0.9);
    const scalePct = Math.max(80, Math.min(150, Math.round(look.modelScale ?? 100)));
    const modelBusy = this.aiBusyTarget === 'runway-model';

    this.dashboardBody.innerHTML = `
      <div class="adm-section">
        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">3D Runway Outfit &amp; Card Studio · Instant Canvas Cutout</span>
              <h3>Upload 3D Runway Model Photos &amp; Control 'In This Look'</h3>
            </div>
            <button type="button" class="adm-btn-secondary" id="adm-rw-jump-preview">
              View Look 0${this.selectedRunwayLookIdx + 1} in 3D Runway
            </button>
          </div>

          <div class="adm-panel-visibility-bar">
            <label class="adm-switch-row" for="adm-rw-global-panel-toggle">
              <span class="adm-switch">
                <input type="checkbox" id="adm-rw-global-panel-toggle" ${globalPanelOn ? 'checked' : ''} />
                <span class="adm-switch-track"></span>
              </span>
              <span class="adm-switch-copy">
                <strong>Show 'In This Look' Panel Globally (All 6 Models)</strong>
                <small>${globalPanelOn ? 'Enabled across the 3D Runway (each model can still show/hide individually below).' : 'Hidden globally — all 3D Runway models stand center-stage with zero sidebar.'}</small>
              </span>
            </label>
          </div>

          <div class="adm-model-grid">${modelTabsHtml}</div>

          <div class="adm-rw-split">
            <div class="adm-rw-model-col">
              <span class="adm-step-label">Runway Model ${this.selectedRunwayLookIdx + 1} Outfit Photo</span>
              <div class="adm-rw-model-frame">
                <img
                  id="adm-rw-model-preview"
                  src="${escapeHtml(look.model640)}"
                  alt="${escapeHtml(look.name)}"
                  loading="lazy"
                  decoding="async"
                  style="transform: scale(${(scalePct / 100).toFixed(3)}); transform-origin: bottom center;"
                  referrerpolicy="no-referrer"
                />
                <div class="adm-ai-overlay${modelBusy ? ' is-busy' : ''}" data-ai-overlay="runway-model" aria-live="polite">
                  <span class="adm-ai-spinner" aria-hidden="true"></span>
                  <span class="adm-ai-text" data-ai-label>${escapeHtml(modelBusy ? this.aiBusyLabel : 'Removing Background...')}</span>
                </div>
              </div>
              <div class="adm-rw-model-btns">
                <label class="adm-btn-gold adm-upload-label">
                  <span id="adm-rw-upload-label">${this.skipRunwayBgRemoval ? 'Upload Model Photo (As-Is)' : 'Upload Full Model Photo (Auto-Removes Background)'}</span>
                  <input type="file" id="adm-rw-model-file" accept="image/*" ${this.aiBusyTarget ? 'disabled' : ''} hidden />
                </label>
                <button type="button" class="adm-btn-secondary" id="adm-rw-model-revert">Restore Default Model</button>
                <label class="adm-ai-skip-toggle">
                  <input type="checkbox" id="adm-skip-ai-rw" ${this.skipRunwayBgRemoval ? 'checked' : ''} />
                  <span>Skip Background Removal</span>
                </label>
              </div>

              <div class="adm-rw-tool-box">
                <div class="adm-rw-slider-row">
                  <label for="adm-rw-model-scale">Model Scale / Zoom (80% to 150%)</label>
                  <strong id="adm-rw-model-scale-val">${scalePct}%</strong>
                </div>
                <input type="range" id="adm-rw-model-scale" min="80" max="150" step="1" value="${scalePct}" />
              </div>

              <div class="adm-field">
                <label for="adm-rw-look-name">Look Title</label>
                <input id="adm-rw-look-name" type="text" value="${escapeHtml(look.name)}" />
              </div>
              <div class="adm-field">
                <label for="adm-rw-look-desc">Look Note</label>
                <textarea id="adm-rw-look-desc" rows="2">${escapeHtml(look.description)}</textarea>
              </div>
              <div class="adm-bundle-summary">
                <span>Bundle Total (10% Off 3 Pieces)</span>
                <strong><s>${formatMoney(lookSum)}</s> ${formatMoney(bundleTotal)}</strong>
              </div>
            </div>

            <div class="adm-rw-pieces-col">
              <div class="adm-pieces-header-box">
                <div class="adm-pieces-header-copy">
                  <span class="adm-step-label">'In This Look' Sidebar for Look 0${this.selectedRunwayLookIdx + 1}</span>
                  <p class="adm-help">Link store products OR upload 3 custom item photos + PKR prices exclusively for Look 0${this.selectedRunwayLookIdx + 1}.</p>
                </div>
                <label class="adm-switch-row adm-switch-row--compact" for="adm-rw-look-panel-toggle">
                  <span class="adm-switch">
                    <input type="checkbox" id="adm-rw-look-panel-toggle" ${lookPanelOn ? 'checked' : ''} />
                    <span class="adm-switch-track"></span>
                  </span>
                  <span class="adm-switch-copy">
                    <strong>${effectiveVisible ? "Showing 'In This Look' Panel" : "Hiding 'In This Look' Panel"}</strong>
                    <small>${!globalPanelOn ? 'Global toggle is currently OFF' : lookPanelOn ? 'Switch OFF to showcase standing model only' : 'Sidebar hidden cleanly for Look 0' + (this.selectedRunwayLookIdx + 1)}</small>
                  </span>
                </label>
              </div>
              <div class="adm-pieces-stack${!effectiveVisible ? ' is-dimmed' : ''}">${pieceCardsHtml}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-rw-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedRunwayLookIdx = Number(btn.dataset.admRwModel || 0);
        this.renderRunwayEditorTab();
      });
    });

    const globalToggle = document.getElementById('adm-rw-global-panel-toggle') as HTMLInputElement | null;
    globalToggle?.addEventListener('change', () => {
      const checked = Boolean(globalToggle.checked);
      storeState.setShowInThisLookGlobal(checked);
      this.showStatus(
        checked
          ? "Showing 'In This Look' panel on 3D Runway (per-model settings active)."
          : "Hid 'In This Look' panel globally — all 3D Runway models now showcase full-width."
      );
    });

    const lookPanelToggle = document.getElementById('adm-rw-look-panel-toggle') as HTMLInputElement | null;
    lookPanelToggle?.addEventListener('change', () => {
      const checked = Boolean(lookPanelToggle.checked);
      storeState.setLookShowInThisLook(this.selectedRunwayLookIdx, checked);
      this.showStatus(
        checked
          ? `Showing 'In This Look' sidebar for Look 0${this.selectedRunwayLookIdx + 1}.`
          : `Hid 'In This Look' sidebar cleanly for Look 0${this.selectedRunwayLookIdx + 1}.`
      );
    });

    const previewImg = document.getElementById('adm-rw-model-preview') as HTMLImageElement | null;

    const skipRwToggle = document.getElementById('adm-skip-ai-rw') as HTMLInputElement | null;
    skipRwToggle?.addEventListener('change', () => {
      this.skipRunwayBgRemoval = Boolean(skipRwToggle.checked);
      const lbl = document.getElementById('adm-rw-upload-label');
      if (lbl) {
        lbl.textContent = this.skipRunwayBgRemoval
          ? 'Upload Model Photo (As-Is)'
          : 'Upload Full Model Photo (Auto-Removes Background)';
      }
      this.showStatus(
        this.skipRunwayBgRemoval
          ? 'Auto background removal paused — model and item uploads compress cleanly with original backgrounds.'
          : 'Instant Canvas Flood-Fill background removal enabled — outer studio box becomes transparent.'
      );
    });

    const scaleInput = document.getElementById('adm-rw-model-scale') as HTMLInputElement | null;
    const scaleValEl = document.getElementById('adm-rw-model-scale-val');
    scaleInput?.addEventListener('input', () => {
      const val = Math.max(80, Math.min(150, Math.round(Number(scaleInput.value || 100))));
      if (scaleValEl) scaleValEl.textContent = `${val}%`;
      if (previewImg) {
        previewImg.style.transform = `scale(${(val / 100).toFixed(3)})`;
      }
      this.suppressNextStoreRender = true;
      storeState.updateLookModelScale(this.selectedRunwayLookIdx, val);
      this.suppressNextStoreRender = false;
    });
    scaleInput?.addEventListener('change', () => {
      this.showStatus(`Updated Runway Model ${this.selectedRunwayLookIdx + 1} scale to ${scaleInput.value}%.`);
    });

    const modelFileEl = document.getElementById('adm-rw-model-file') as HTMLInputElement | null;
    modelFileEl?.addEventListener('change', async () => {
      const file = modelFileEl.files?.[0];
      if (!file) return;
      modelFileEl.value = '';
      const targetIdx = this.selectedRunwayLookIdx;
      const result = await this.processUploadedImage(file, {
        target: 'runway-model',
        skipAi: this.skipRunwayBgRemoval,
        maxDim: 900,
        quality: 0.85,
      });
      storeState.updateLookModelImage(targetIdx, result.url);
      this.showStatus(
        result.usedBgCleaner
          ? `Transparent cutout & auto-trim ready (900px) — Runway Model ${targetIdx + 1} updated cleanly!`
          : result.fallbackUsed
            ? `Uploaded compressed model photo for Runway Model ${targetIdx + 1}.`
            : `Compressed & uploaded model photo as-is for Runway Model ${targetIdx + 1}.`
      );
    });

    document.getElementById('adm-rw-model-revert')?.addEventListener('click', () => {
      const targetIdx = this.selectedRunwayLookIdx;
      storeState.restoreSingleLookModel(targetIdx);
      this.showStatus(`Restored default Runway Model ${targetIdx + 1}.`);
    });

    document.getElementById('adm-rw-look-name')?.addEventListener('change', (e) => {
      storeState.updateLookMeta(this.selectedRunwayLookIdx, {
        name: (e.currentTarget as HTMLInputElement).value,
      });
      this.showStatus('Updated Look title live.');
    });

    document.getElementById('adm-rw-look-desc')?.addEventListener('change', (e) => {
      storeState.updateLookMeta(this.selectedRunwayLookIdx, {
        description: (e.currentTarget as HTMLTextAreaElement).value,
      });
      this.showStatus('Updated Look description live.');
    });

    document.getElementById('adm-rw-jump-preview')?.addEventListener('click', () => {
      this.dashboardDialog?.close();
      const runway = document.querySelector<RunwaySection>('runway-section');
      if (runway) {
        runway.setMode('ring');
        runway.go(this.selectedRunwayLookIdx);
        runway.scrollToRunway();
      }
    });

    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-piece-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pieceNum = Number(btn.dataset.admPieceMode);
        const mode = (btn.dataset.mode === 'custom' ? 'custom' : 'linked') as 'linked' | 'custom';
        storeState.setLookPieceMode(this.selectedRunwayLookIdx, pieceNum, mode);
        this.showStatus(
          mode === 'custom'
            ? `Piece 0${pieceNum} switched to Custom Upload mode (replaces default item on Look 0${this.selectedRunwayLookIdx + 1}).`
            : `Piece 0${pieceNum} switched to Linked Store Product mode.`
        );
      });
    });

    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-piece-switch-custom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pieceNum = Number(btn.dataset.admPieceSwitchCustom);
        storeState.setLookPieceMode(this.selectedRunwayLookIdx, pieceNum, 'custom');
        this.showStatus(`Switched Piece 0${pieceNum} to Custom Upload — upload custom photo & set PKR price.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLSelectElement>('[data-adm-piece-assign]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const pieceNum = Number(sel.dataset.admPieceAssign);
        storeState.setLookPieceLinkedProduct(this.selectedRunwayLookIdx, pieceNum, sel.value);
        this.showStatus(`Linked Piece 0${pieceNum} to selected store product.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-piece-name]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const pieceNum = Number(inp.dataset.admPieceName);
        storeState.updateLookPieceCustomItem(this.selectedRunwayLookIdx, pieceNum, {
          name: inp.value,
        });
        this.showStatus(`Updated custom Piece 0${pieceNum} name.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-piece-price]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const pieceNum = Number(inp.dataset.admPiecePrice);
        storeState.updateLookPieceCustomItem(this.selectedRunwayLookIdx, pieceNum, {
          price: Number(inp.value || 0),
        });
        this.showStatus(`Updated custom Piece 0${pieceNum} price (PKR).`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLSelectElement>('[data-adm-piece-cat]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const pieceNum = Number(sel.dataset.admPieceCat);
        storeState.updateLookPieceCustomItem(this.selectedRunwayLookIdx, pieceNum, {
          storeCategory: sel.value as Exclude<StoreCategory, 'all'>,
        });
        this.showStatus(`Updated custom Piece 0${pieceNum} category.`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-piece-photo]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const pieceNum = Number(inp.dataset.admPiecePhoto);
        const file = inp.files?.[0];
        if (!file) return;
        inp.value = '';
        const result = await this.processUploadedImage(file, {
          target: `piece-${pieceNum}`,
          skipAi: this.skipRunwayBgRemoval,
          maxDim: 900,
          quality: 0.85,
        });
        storeState.updateLookPieceCustomItem(this.selectedRunwayLookIdx, pieceNum, {
          image: result.url,
        });
        this.showStatus(
          result.usedBgCleaner
            ? `Replaced Piece 0${pieceNum} photo cleanly (900px + transparent cutout)!`
            : `Compressed & replaced Piece 0${pieceNum} photo live.`
        );
      });
    });
  }

  // =========================================================================
  // TAB 4: GLOBAL CLOUD SYNC & FLAGSHIP SHOWROOM EDITOR
  // =========================================================================
  private renderSyncAndShowroomTab(): void {
    if (!this.dashboardBody) return;
    const cloud = storeState.getCloudSync();
    const sr = storeState.getShowroom();
    const lastSyncText = cloud.lastSyncedAt
      ? `Last Cloud Sync: ${new Date(cloud.lastSyncedAt).toLocaleString()}`
      : 'Not synced to cloud yet';

    this.dashboardBody.innerHTML = `
      <div class="adm-section">
        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Worldwide Multi-Device Updates</span>
              <h3>Global Cloud Sync (Firebase / JSONBin) &amp; Config Export</h3>
            </div>
            <span class="adm-sync-pill">${escapeHtml(lastSyncText)}</span>
          </div>

          <p class="adm-help">
            Paste a free <strong>JSONBin.io v3 URL</strong> or <strong>Firebase Realtime DB (.json)</strong> endpoint so price, banner, showroom, and runway updates appear automatically on all customer phones worldwide.
          </p>

          <div class="adm-form-grid">
            <div class="adm-field adm-field--full">
              <label for="adm-cloud-url">Cloud JSON Endpoint URL</label>
              <input
                id="adm-cloud-url"
                type="url"
                placeholder="e.g. https://api.jsonbin.io/v3/b/YOUR_BIN_ID or https://your-project.firebaseio.com/grsons.json"
                value="${escapeHtml(cloud.endpointUrl)}"
              />
            </div>
            <div class="adm-field">
              <label for="adm-cloud-key">Access Key / Master Key (Optional)</label>
              <input
                id="adm-cloud-key"
                type="password"
                autocomplete="off"
                placeholder="JSONBin X-Master-Key or Bearer token"
                value="${escapeHtml(cloud.apiKey)}"
              />
            </div>
            <div class="adm-field adm-field-checkbox-wrap">
              <label class="adm-ai-skip-toggle" for="adm-cloud-autosync">
                <input type="checkbox" id="adm-cloud-autosync" ${cloud.autoSyncOnSave ? 'checked' : ''} />
                <span>Auto-Push to Cloud on "Save All Changes"</span>
              </label>
            </div>
          </div>

          <div class="adm-sync-actions">
            <button type="button" class="adm-btn-gold" id="adm-cloud-push">Sync Live to Cloud Now</button>
            <button type="button" class="adm-btn-secondary" id="adm-cloud-pull">Pull Latest from Cloud</button>
            <button type="button" class="adm-btn-secondary" id="adm-export-config">Export Live Config (.json)</button>
            <button type="button" class="adm-btn-secondary" id="adm-copy-config">Copy Config JSON</button>
          </div>
        </div>

        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Interactive Google Map &amp; Showroom Details</span>
              <h3>Flagship Showroom Editor</h3>
            </div>
            <button type="button" class="adm-btn-secondary" id="adm-sr-reset">Restore Default Showroom</button>
          </div>

          <div class="adm-form-grid">
            <div class="adm-field">
              <label for="adm-sr-eyebrow">Section Eyebrow</label>
              <input id="adm-sr-eyebrow" type="text" value="${escapeHtml(sr.eyebrow)}" />
            </div>
            <div class="adm-field">
              <label for="adm-sr-heading">Main Showroom Heading</label>
              <input id="adm-sr-heading" type="text" value="${escapeHtml(sr.heading)}" />
            </div>
            <div class="adm-field adm-field--full">
              <label for="adm-sr-address">Written Store Address</label>
              <textarea id="adm-sr-address" rows="2">${escapeHtml(sr.address)}</textarea>
            </div>
            <div class="adm-field">
              <label for="adm-sr-timings">Showroom Hours</label>
              <input id="adm-sr-timings" type="text" value="${escapeHtml(sr.timings)}" />
            </div>
            <div class="adm-field">
              <label for="adm-sr-directions">Get Directions Link URL</label>
              <input id="adm-sr-directions" type="url" value="${escapeHtml(sr.directionsUrl)}" />
            </div>
            <div class="adm-field adm-field--full">
              <label for="adm-sr-map">Google Map Embed / Location Query URL</label>
              <input id="adm-sr-map" type="url" value="${escapeHtml(sr.mapEmbedUrl)}" />
            </div>
          </div>
        </div>
      </div>
    `;

    const urlInp = document.getElementById('adm-cloud-url') as HTMLInputElement | null;
    const keyInp = document.getElementById('adm-cloud-key') as HTMLInputElement | null;
    const autoChk = document.getElementById('adm-cloud-autosync') as HTMLInputElement | null;

    urlInp?.addEventListener('change', () => {
      storeState.updateCloudSync({ endpointUrl: urlInp.value.trim() });
      this.showStatus('Saved Cloud JSON endpoint URL.');
    });
    keyInp?.addEventListener('change', () => {
      storeState.updateCloudSync({ apiKey: keyInp.value.trim() });
      this.showStatus('Saved Cloud Access Key in local browser preferences.');
    });
    autoChk?.addEventListener('change', () => {
      storeState.updateCloudSync({ autoSyncOnSave: Boolean(autoChk.checked) });
      this.showStatus(autoChk.checked ? 'Auto-Sync enabled on Save All Changes.' : 'Auto-Sync paused.');
    });

    const pushBtn = document.getElementById('adm-cloud-push') as HTMLButtonElement | null;
    pushBtn?.addEventListener('click', async () => {
      if (urlInp) storeState.updateCloudSync({ endpointUrl: urlInp.value.trim() });
      if (keyInp) storeState.updateCloudSync({ apiKey: keyInp.value.trim() });
      pushBtn.disabled = true;
      pushBtn.textContent = 'Syncing...';
      try {
        await storeState.saveAllChanges(false);
        const res = await storeState.pushToCloud();
        this.showStatus(res.message);
        if (res.ok) this.renderSyncAndShowroomTab();
      } finally {
        pushBtn.disabled = false;
        pushBtn.textContent = 'Sync Live to Cloud Now';
      }
    });

    const pullBtn = document.getElementById('adm-cloud-pull') as HTMLButtonElement | null;
    pullBtn?.addEventListener('click', async () => {
      if (urlInp) storeState.updateCloudSync({ endpointUrl: urlInp.value.trim() });
      if (keyInp) storeState.updateCloudSync({ apiKey: keyInp.value.trim() });
      pullBtn.disabled = true;
      pullBtn.textContent = 'Pulling...';
      try {
        const res = await storeState.pullFromCloud();
        this.showStatus(res.message);
        if (res.ok) this.renderSyncAndShowroomTab();
      } finally {
        pullBtn.disabled = false;
        pullBtn.textContent = 'Pull Latest from Cloud';
      }
    });

    document.getElementById('adm-export-config')?.addEventListener('click', () => {
      const json = storeState.buildLiveConfigJson();
      const blob = new Blob([json], { type: 'application/json' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'store-config.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      this.showStatus('Downloaded store-config.json — upload to /public or Cloud Bin to publish globally.');
    });

    document.getElementById('adm-copy-config')?.addEventListener('click', async () => {
      const json = storeState.buildLiveConfigJson();
      try {
        await navigator.clipboard.writeText(json);
        this.showStatus('Copied Live Store Config JSON to clipboard.');
      } catch {
        this.showStatus('Clipboard access denied — use "Export Live Config (.json)" instead.');
      }
    });

    const wireShowroomField = (id: string, key: keyof typeof DEFAULT_SHOWROOM) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      el?.addEventListener('change', () => {
        storeState.updateShowroom({ [key]: el.value });
        this.showStatus('Updated Flagship Showroom & Google Map live.');
      });
    };

    wireShowroomField('adm-sr-eyebrow', 'eyebrow');
    wireShowroomField('adm-sr-heading', 'heading');
    wireShowroomField('adm-sr-address', 'address');
    wireShowroomField('adm-sr-timings', 'timings');
    wireShowroomField('adm-sr-directions', 'directionsUrl');
    wireShowroomField('adm-sr-map', 'mapEmbedUrl');

    document.getElementById('adm-sr-reset')?.addEventListener('click', () => {
      storeState.updateShowroom(DEFAULT_SHOWROOM);
      this.renderSyncAndShowroomTab();
      this.showStatus('Restored default Gujranwala Flagship Showroom address & Google Map.');
    });
  }
}
