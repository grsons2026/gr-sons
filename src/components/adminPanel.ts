import {
  CategorySizePreset,
  DEFAULT_HERO_BANNER,
  DEFAULT_SHOWROOM,
  FittingAppointment,
  OrderStatus,
  StoreCategory,
  StoreOrder,
  formatMoney,
} from '../data/catalog.ts';
import {
  compressImageFile,
  removeBackgroundCanvasBFS,
  sanitizeWhatsappDigits,
  storeState,
} from '../data/storeState.ts';
import { RunwaySection } from './runwaySection.ts';

type AdminTabId = 'products' | 'banner' | 'runway' | 'sync' | 'orders';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class AdminPanel {
  private unlocked = false;
  private activeTab: AdminTabId = 'products';
  private selectedRunwayLookIdx = 0;
  private productSearch = '';
  private productCatFilter: StoreCategory = 'all';
  private orderStatusFilter: 'All' | OrderStatus = 'All';
  private orderTimeframe: 'days' | 'weeks' | 'months' = 'days';
  private previewSampleSales = false;
  private selectedChartDayIdx = 6;
  private newProductPhoto = '';
  private skipProductBgRemoval = false;
  private skipRunwayBgRemoval = false;
  private aiBusyTarget: string | null = null;
  private aiBusyLabel = 'Removing Background...';
  private confirmResetPending = false;
  private confirmResetTimer: number | null = null;
  private pendingDeleteIds = new Set<string>();
  private pendingDeleteCatIds = new Set<string>();
  private pendingDeleteOrderIds = new Set<string>();
  private pendingDeleteFittingIds = new Set<string>();
  private suppressNextStoreRender = false;
  private statusNotice = '';
  private statusNoticeTimer: number | null = null;
  private logoTapCount = 0;
  private logoTapResetTimer: number | null = null;

  private pinDialog: HTMLDialogElement | null = null;
  private pinForm: HTMLFormElement | null = null;
  private pinInput: HTMLInputElement | null = null;
  private pinError: HTMLElement | null = null;
  private dashboardDialog: HTMLElement | null = null;
  private dashboardBody: HTMLElement | null = null;
  private statusBarEl: HTMLElement | null = null;
  private saveBtnEl: HTMLButtonElement | null = null;
  private resetBtnEl: HTMLButtonElement | null = null;

  public initDOM(): void {
    this.pinDialog = document.getElementById('admin-pin-dialog') as HTMLDialogElement | null;
    this.pinForm = document.getElementById('admin-pin-form') as HTMLFormElement | null;
    this.pinInput = document.getElementById('admin-pin-input') as HTMLInputElement | null;
    this.pinError = document.getElementById('admin-pin-error');
    this.dashboardDialog = document.getElementById('admin-dashboard-dialog');
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
        this.resetLogoTapCounter();
        this.openEntry();
        return;
      }
      if (this.logoTapCount === 1 && window.scrollY > 40) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.logoTapResetTimer = window.setTimeout(() => {
        this.logoTapCount = 0;
        this.logoTapResetTimer = null;
      }, 2600);
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

    this.pinDialog?.addEventListener('close', () => {
      this.pinDialog?.remove();
    });

    this.pinForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handlePinSubmit();
    });

    document.getElementById('admin-lock-close')?.addEventListener('click', () => {
      this.unlocked = false;
      this.closeDashboard();
    });

    document.getElementById('admin-close-only')?.addEventListener('click', () => {
      this.closeDashboard();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isDashboardOpen() && !this.pinDialog?.open) {
        e.preventDefault();
        this.closeDashboard();
      }
    });

    this.saveBtnEl?.addEventListener('click', () => void this.handleSaveAll());
    this.resetBtnEl?.addEventListener('click', () => void this.handleResetAll());

    this.dashboardDialog?.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn.dataset.adminTab || 'products') as AdminTabId;
        this.activeTab = tab;
        this.syncTabButtons();
        this.renderActiveTab();
      });
    });

    storeState.subscribe(() => {
      this.syncPendingBadge();
      if (this.isDashboardOpen() && !this.suppressNextStoreRender) {
        this.renderActiveTab();
      }
    });
    this.syncPendingBadge();

    if (this.pinDialog && !this.pinDialog.open) {
      this.pinDialog.remove();
    }
    if (this.dashboardDialog && this.dashboardDialog.hidden) {
      this.dashboardDialog.remove();
    }
  }

  private resetLogoTapCounter(): void {
    this.logoTapCount = 0;
    if (this.logoTapResetTimer !== null) {
      window.clearTimeout(this.logoTapResetTimer);
      this.logoTapResetTimer = null;
    }
  }

  private isDashboardOpen(): boolean {
    return Boolean(
      this.dashboardDialog &&
        this.dashboardDialog.isConnected &&
        !this.dashboardDialog.hidden &&
        !this.dashboardDialog.hasAttribute('hidden')
    );
  }

  private closeDashboard(): void {
    this.unlocked = false;
    this.resetLogoTapCounter();
    if (!this.dashboardDialog) return;
    this.dashboardDialog.hidden = true;
    this.dashboardDialog.setAttribute('hidden', '');
    this.dashboardDialog.remove();
    document.documentElement.classList.remove('admin-open');
  }

  private syncPendingBadge(): void {
    const pendingCount = storeState.getOrders().filter((o) => o.status === 'Pending').length;
    const root: ParentNode = this.dashboardDialog || document;
    root.querySelectorAll<HTMLElement>('[data-admin-pending-count]').forEach((el) => {
      el.textContent = String(pendingCount);
      el.hidden = pendingCount === 0;
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
    const toggleBtn = this.pinDialog?.querySelector<HTMLElement>('#admin-pin-toggle');
    if (toggleBtn) toggleBtn.textContent = 'Show';
    if (this.pinDialog) {
      if (!this.pinDialog.isConnected) {
        document.body.appendChild(this.pinDialog);
      }
      this.pinDialog.hidden = false;
      this.pinDialog.removeAttribute('hidden');
      if (!this.pinDialog.open) {
        this.pinDialog.showModal();
        window.setTimeout(() => this.pinInput?.focus(), 40);
      }
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
    this.resetLogoTapCounter();
    if (this.pinDialog?.open) {
      this.pinDialog.close();
    }
    this.pinDialog?.remove();
    this.openDashboard();
  }

  private openDashboard(): void {
    if (!this.dashboardDialog) return;
    if (!this.dashboardDialog.isConnected) {
      document.body.appendChild(this.dashboardDialog);
    }
    this.dashboardDialog.hidden = false;
    this.dashboardDialog.removeAttribute('hidden');
    document.documentElement.classList.add('admin-open');
    this.syncTabButtons();
    try {
      this.renderActiveTab();
    } catch (err) {
      console.error('Admin Dashboard tab render error:', err);
      if (this.dashboardBody) {
        this.dashboardBody.innerHTML = `<div class="adm-card"><p class="adm-help">Dashboard view encountered an error while rendering. Switch tabs or click Reset to Default.</p></div>`;
      }
    }
    this.dashboardDialog.scrollTop = 0;
    this.dashboardDialog.scrollTo?.(0, 0);
  }

  private syncTabButtons(): void {
    const root: ParentNode = this.dashboardDialog || document;
    root.querySelectorAll<HTMLButtonElement>('[data-admin-tab]').forEach((btn) => {
      const active = btn.dataset.adminTab === this.activeTab;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.syncPendingBadge();
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
      maxChars?: number;
    }
  ): Promise<{ url: string; usedBgCleaner: boolean; fallbackUsed: boolean }> {
    const maxWidth = opts.maxDim ?? 700;
    const quality = opts.quality ?? 0.65;

    if (opts.skipAi) {
      const url = await compressImageFile(file, maxWidth, quality, opts.maxChars);
      return { url, usedBgCleaner: false, fallbackUsed: false };
    }

    this.setAiBusy(opts.target, 'Compressing & Removing Background...');
    try {
      const url = await removeBackgroundCanvasBFS(file, maxWidth, 24, quality, opts.maxChars);
      return { url, usedBgCleaner: true, fallbackUsed: false };
    } catch (err) {
      console.warn('Canvas flood-fill background removal fallback to compressed upload:', err);
      const url = await compressImageFile(file, maxWidth, quality, opts.maxChars);
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
      case 'orders':
        this.renderOrdersTab();
        break;
    }
  }

  // =========================================================================
  // TAB 1: PRODUCTS, MULTI-ANGLE GALLERY & PRICES MANAGER (PKR)
  // =========================================================================
  private renderProductsTab(): void {
    if (!this.dashboardBody) return;
    const categories = storeState.getCategories();
    if (
      this.productCatFilter !== 'all' &&
      !categories.some((c) => c.id === this.productCatFilter)
    ) {
      this.productCatFilter = 'all';
    }

    const allProducts = storeState.getProducts();
    const countByCat = new Map<string, number>();
    for (const prod of allProducts) {
      countByCat.set(prod.storeCategory, (countByCat.get(prod.storeCategory) || 0) + 1);
    }

    const query = this.productSearch.trim().toLowerCase();
    const filtered = allProducts.filter((p) => {
      if (this.productCatFilter !== 'all' && p.storeCategory !== this.productCatFilter) {
        return false;
      }
      if (!query) return true;
      return `${p.name} ${p.vendor} ${p.type} ${p.storeCategory} ${storeState.getCategoryLabel(p.storeCategory)} ${p.sku || ''}`
        .toLowerCase()
        .includes(query);
    });

    const catOptionsHtml = categories
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`)
      .join('');

    const filterTabs = [{ id: 'all', label: 'All' }, ...categories];
    const filterButtonsHtml = filterTabs
      .map((c) => {
        const active = c.id === this.productCatFilter;
        return `<button type="button" class="adm-chip" data-adm-cat-filter="${escapeHtml(c.id)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(c.label)}</button>`;
      })
      .join('');

    const categoryRowsHtml = categories
      .map((cat) => {
        const itemCount = countByCat.get(cat.id) || 0;
        const isConfirmingDel = this.pendingDeleteCatIds.has(cat.id);
        const disableDelete = categories.length <= 1;
        const presetVal: CategorySizePreset =
          cat.sizePreset ||
          (cat.id === 'trousers'
            ? 'trousers'
            : cat.id === 'shoes'
              ? 'shoes'
              : 'apparel');

        return `
          <div class="adm-cat-row" data-adm-cat-row="${escapeHtml(cat.id)}">
            <div class="adm-cat-field-name">
              <label>Section Name</label>
              <input
                type="text"
                value="${escapeHtml(cat.label)}"
                data-adm-cat-rename="${escapeHtml(cat.id)}"
                aria-label="Rename section ${escapeHtml(cat.label)}"
              />
            </div>
            <div class="adm-cat-field-preset">
              <label>Default Sizing</label>
              <select data-adm-cat-preset="${escapeHtml(cat.id)}" aria-label="Sizing preset for ${escapeHtml(cat.label)}">
                <option value="apparel"${presetVal === 'apparel' ? ' selected' : ''}>Apparel (S / M / L / XL)</option>
                <option value="trousers"${presetVal === 'trousers' ? ' selected' : ''}>Trousers (28–34)</option>
                <option value="shoes"${presetVal === 'shoes' ? ' selected' : ''}>Shoes (EU 40–46)</option>
                <option value="one-size"${presetVal === 'one-size' ? ' selected' : ''}>Accessories (Standard)</option>
              </select>
            </div>
            <div class="adm-cat-meta">
              <span>${itemCount} ${itemCount === 1 ? 'item' : 'items'}</span>
              <span aria-hidden="true">·</span>
              <span class="adm-cat-slug">${escapeHtml(cat.id)}</span>
            </div>
            <button
              type="button"
              class="adm-btn-danger adm-cat-del-btn${isConfirmingDel ? ' is-confirming' : ''}"
              data-adm-cat-del="${escapeHtml(cat.id)}"
              ${disableDelete ? 'disabled title="Keep at least one category section"' : ''}
            >
              ${isConfirmingDel ? 'Confirm Delete?' : 'Delete'}
            </button>
          </div>
        `;
      })
      .join('');

    const rowsHtml = filtered
      .map((item) => {
        const isConfirmingDel = this.pendingDeleteIds.has(item.id);
        const catOpts = categories
          .map(
            (c) =>
              `<option value="${escapeHtml(c.id)}"${item.storeCategory === c.id ? ' selected' : ''}>${escapeHtml(c.label)}</option>`
          )
          .join('');

        const prodTarget = `prod-${item.id}`;
        const prodBusy = this.aiBusyTarget === prodTarget;
        const gallery = storeState.getProductGallery(item);
        const skuVal = storeState.getProductSku(item);
        const fabricVal = storeState.getProductFabricNotes(item);

        const angleSlotsHtml = [0, 1, 2, 3]
          .map((slotIdx) => {
            const slotUrl = gallery[slotIdx] || '';
            const slotBusy = this.aiBusyTarget === `prod-${item.id}-slot-${slotIdx}`;
            const slotLabel = slotIdx === 0 ? 'Main Photo' : `Angle ${slotIdx + 1}`;
            return `
              <div class="adm-angle-slot${slotUrl ? ' has-photo' : ''}">
                <div class="adm-angle-head">
                  <span>${slotLabel}</span>
                  ${
                    slotIdx > 0 && slotUrl
                      ? `<button type="button" class="adm-angle-clear" data-adm-angle-clear="${escapeHtml(item.id)}" data-slot="${slotIdx}" aria-label="Remove ${slotLabel}">×</button>`
                      : ''
                  }
                </div>
                <div class="adm-angle-thumb">
                  ${
                    slotUrl
                      ? `<img src="${escapeHtml(slotUrl)}" alt="${escapeHtml(item.name)} ${slotLabel}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
                      : `<span class="adm-angle-empty">+ Empty</span>`
                  }
                  <div class="adm-ai-overlay adm-ai-overlay--mini${slotBusy ? ' is-busy' : ''}" data-ai-overlay="prod-${escapeHtml(item.id)}-slot-${slotIdx}" aria-live="polite">
                    <span class="adm-ai-spinner" aria-hidden="true"></span>
                  </div>
                </div>
                <div class="adm-angle-controls">
                  <label class="adm-upload-mini">
                    <span>Upload</span>
                    <input type="file" accept="image/*" data-adm-angle-file="${escapeHtml(item.id)}" data-slot="${slotIdx}" ${this.aiBusyTarget ? 'disabled' : ''} hidden />
                  </label>
                  <input
                    type="url"
                    class="adm-angle-url"
                    placeholder="Paste URL..."
                    value="${slotUrl.startsWith('data:') ? '' : escapeHtml(slotUrl)}"
                    data-adm-angle-url="${escapeHtml(item.id)}"
                    data-slot="${slotIdx}"
                    aria-label="${slotLabel} image URL for ${escapeHtml(item.name)}"
                  />
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <div class="adm-prod-row adm-prod-row--rich" data-adm-prod="${escapeHtml(item.id)}">
            <div class="adm-prod-photo-col">
              <div class="adm-prod-thumb-wrap">
                <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" width="72" height="90" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                <div class="adm-ai-overlay adm-ai-overlay--mini${prodBusy ? ' is-busy' : ''}" data-ai-overlay="${escapeHtml(prodTarget)}" aria-live="polite">
                  <span class="adm-ai-spinner" aria-hidden="true"></span>
                  <span class="adm-ai-text" data-ai-label>${escapeHtml(prodBusy ? this.aiBusyLabel : 'Compressing...')}</span>
                </div>
              </div>
              <label class="adm-upload-mini">
                <span>Change Main</span>
                <input type="file" accept="image/*" data-adm-prod-photo="${escapeHtml(item.id)}" ${this.aiBusyTarget ? 'disabled' : ''} hidden />
              </label>
            </div>
            <div class="adm-prod-main-col">
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
                <div class="adm-field">
                  <label>SKU Code</label>
                  <input type="text" value="${escapeHtml(skuVal)}" data-adm-prod-sku="${escapeHtml(item.id)}" />
                </div>
                <div class="adm-field adm-field--span2">
                  <label>Fabric &amp; Tailoring Notes (Shown on Product Page)</label>
                  <textarea rows="2" data-adm-prod-fabric="${escapeHtml(item.id)}">${escapeHtml(fabricVal)}</textarea>
                </div>
              </div>
              <div class="adm-multi-angles">
                <span class="adm-angles-label">Product Gallery (Up to 4 Angles · Auto-Compressed &lt;35KB for Cloud Sync)</span>
                <div class="adm-angles-grid">${angleSlotsHtml}</div>
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
        <div class="adm-card adm-cat-manager">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Live Filter Pills &amp; Horizontal Mobile Rows · Cloud Synced</span>
              <h3>Manage Storefront Sections &amp; Categories</h3>
            </div>
            <span class="adm-sync-pill">${categories.length} Active ${categories.length === 1 ? 'Section' : 'Sections'}</span>
          </div>
          <p class="adm-help">
            Create new menswear sections (e.g. <strong>Shalwar Kameez</strong>, <strong>Sherwani</strong>, <strong>Pants</strong>, <strong>Accessories</strong>), rename existing tabs, or delete unused categories. Changes sync live across Storefront filter pills, horizontal carousels, and Sales Analytics.
          </p>
          <form id="adm-new-cat-form" class="adm-cat-create-grid">
            <div class="adm-field">
              <label for="adm-new-cat-name">New Section Name</label>
              <input id="adm-new-cat-name" type="text" placeholder="e.g. Shalwar Kameez, Sherwani, Accessories" required />
            </div>
            <div class="adm-field">
              <label for="adm-new-cat-preset">Sizing Option Preset</label>
              <select id="adm-new-cat-preset">
                <option value="apparel">Apparel (S / M / L / XL)</option>
                <option value="trousers">Trousers / Pants (28 / 30 / 32 / 34)</option>
                <option value="shoes">Shoes (EU 40–46)</option>
                <option value="one-size">Accessories (Standard)</option>
              </select>
            </div>
            <div class="adm-cat-create-submit">
              <button type="submit" class="adm-btn-gold">+ Create Section</button>
            </div>
          </form>
          <div class="adm-cat-list">${categoryRowsHtml}</div>
        </div>

        <div class="adm-card adm-add-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">New Inventory Item · Compressed &lt;35KB Cloud Ready</span>
              <h3>Add New Product (PKR)</h3>
            </div>
            <div class="adm-head-inline-tools">
              <button type="button" class="adm-btn-secondary" id="adm-jump-sizeguide">Edit Size Guide →</button>
              <label class="adm-ai-skip-toggle">
                <input type="checkbox" id="adm-skip-ai-prod" ${this.skipProductBgRemoval ? 'checked' : ''} />
                <span>Skip Background Removal</span>
              </label>
            </div>
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
                  <span class="adm-ai-text" data-ai-label>${escapeHtml(newProdBusy ? this.aiBusyLabel : 'Compressing...')}</span>
                </div>
              </div>
              <label class="adm-btn-secondary adm-upload-label">
                <span id="adm-new-upload-label">${this.skipProductBgRemoval ? 'Upload Photo (As-Is, <35KB)' : 'Upload Photo (Auto-Removes Background)'}</span>
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
                <input id="adm-new-vendor" type="text" value="GR SON'S Atelier" />
              </div>
              <div class="adm-field">
                <label for="adm-new-price">Price (PKR)</label>
                <input id="adm-new-price" type="number" min="0" step="100" value="18500" required />
              </div>
              <div class="adm-field">
                <label for="adm-new-cat">Category</label>
                <select id="adm-new-cat">${catOptionsHtml}</select>
              </div>
              <div class="adm-field">
                <label for="adm-new-sku">SKU (Optional)</label>
                <input id="adm-new-sku" type="text" placeholder="e.g. GR-WC-2026" />
              </div>
              <div class="adm-field adm-field--full">
                <label for="adm-new-fabric">Fabric &amp; Tailoring Notes (Optional)</label>
                <textarea id="adm-new-fabric" rows="2" placeholder="e.g. Italian worsted wool blend, satin inner lining, custom horn buttons..."></textarea>
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

    // Category Section Manager handlers (Create, Rename, Preset, Delete)
    const newCatForm = document.getElementById('adm-new-cat-form') as HTMLFormElement | null;
    newCatForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('adm-new-cat-name') as HTMLInputElement | null;
      const presetSel = document.getElementById('adm-new-cat-preset') as HTMLSelectElement | null;
      const label = nameInput?.value.trim() || '';
      if (!label) return;
      const preset = (presetSel?.value || 'apparel') as CategorySizePreset;
      const created = storeState.addCategory(label, preset);
      if (created) {
        this.showStatus(`Created "${created.label}" section live. Click Save All Changes to push to Cloud.`);
        this.renderProductsTab();
      }
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-cat-rename]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const catId = inp.dataset.admCatRename;
        if (!catId) return;
        const clean = inp.value.trim();
        if (!clean) {
          inp.value = storeState.getCategoryLabel(catId);
          return;
        }
        storeState.updateCategory(catId, { label: clean });
        this.showStatus(`Renamed storefront section to "${clean}".`);
      });
    });

    this.dashboardBody.querySelectorAll<HTMLSelectElement>('[data-adm-cat-preset]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const catId = sel.dataset.admCatPreset;
        if (!catId) return;
        storeState.updateCategory(catId, {
          sizePreset: sel.value as CategorySizePreset,
        });
        this.showStatus('Updated default size preset for section.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-cat-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const catId = btn.dataset.admCatDel;
        if (!catId) return;
        if (!this.pendingDeleteCatIds.has(catId)) {
          this.pendingDeleteCatIds.add(catId);
          this.renderProductsTab();
          window.setTimeout(() => {
            if (this.pendingDeleteCatIds.delete(catId) && this.activeTab === 'products') {
              this.renderProductsTab();
            }
          }, 4000);
          return;
        }
        this.pendingDeleteCatIds.delete(catId);
        const result = storeState.deleteCategory(catId);
        if (this.productCatFilter === catId) {
          this.productCatFilter = 'all';
        }
        this.showStatus(result.message);
        this.renderProductsTab();
      });
    });

    document.getElementById('adm-jump-sizeguide')?.addEventListener('click', () => {
      this.activeTab = 'sync';
      this.syncTabButtons();
      this.renderActiveTab();
      window.setTimeout(() => {
        document.getElementById('adm-sizeguide-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    });

    const skipProdToggle = document.getElementById('adm-skip-ai-prod') as HTMLInputElement | null;
    skipProdToggle?.addEventListener('change', () => {
      this.skipProductBgRemoval = Boolean(skipProdToggle.checked);
      const lbl = document.getElementById('adm-new-upload-label');
      if (lbl) {
        lbl.textContent = this.skipProductBgRemoval
          ? 'Upload Photo (As-Is, <35KB)'
          : 'Upload Photo (Auto-Removes Background)';
      }
      this.showStatus(
        this.skipProductBgRemoval
          ? 'Auto background removal paused — product uploads compress cleanly under 35KB.'
          : 'Instant Canvas Flood-Fill background removal enabled — product cutouts float cleanly on #F5F3EE.'
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
        maxDim: 650,
        quality: 0.62,
        maxChars: 35 * 1024,
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
          ? 'Compressed (<35KB) & removed outer background cleanly!'
          : 'Compressed & uploaded product photo (<35KB).'
      );
    });

    const newForm = document.getElementById('adm-new-prod-form') as HTMLFormElement | null;
    newForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('adm-new-name') as HTMLInputElement | null;
      const vendorEl = document.getElementById('adm-new-vendor') as HTMLInputElement | null;
      const priceEl = document.getElementById('adm-new-price') as HTMLInputElement | null;
      const catEl = document.getElementById('adm-new-cat') as HTMLSelectElement | null;
      const skuEl = document.getElementById('adm-new-sku') as HTMLInputElement | null;
      const fabricEl = document.getElementById('adm-new-fabric') as HTMLTextAreaElement | null;
      const name = nameEl?.value.trim() || '';
      if (!name) return;

      const added = storeState.addProduct({
        name,
        vendor: vendorEl?.value.trim() || "GR SON'S Atelier",
        price: Number(priceEl?.value || 0),
        storeCategory: (catEl?.value || categories[0]?.id || 'shirts') as Exclude<StoreCategory, 'all'>,
        image: this.newProductPhoto || storeState.getProducts()[0]?.image || '',
        sku: skuEl?.value.trim(),
        fabricNotes: fabricEl?.value.trim(),
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
        storeState.updateProduct(inp.dataset.admProdName!, { name: inp.value });
        this.showStatus('Updated product name live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-vendor]').forEach((inp) => {
      inp.addEventListener('change', () => {
        storeState.updateProduct(inp.dataset.admProdVendor!, { vendor: inp.value });
        this.showStatus('Updated brand label live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-price]').forEach((inp) => {
      inp.addEventListener('change', () => {
        storeState.updateProduct(inp.dataset.admProdPrice!, { price: Number(inp.value || 0) });
        this.showStatus('Updated product price (PKR) live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLSelectElement>('[data-adm-prod-cat]').forEach((sel) => {
      sel.addEventListener('change', () => {
        storeState.updateProduct(sel.dataset.admProdCat!, {
          storeCategory: sel.value as Exclude<StoreCategory, 'all'>,
        });
        this.showStatus('Updated product category live.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-sku]').forEach((inp) => {
      inp.addEventListener('change', () => {
        storeState.updateProduct(inp.dataset.admProdSku!, { sku: inp.value });
        this.showStatus('Updated product SKU.');
      });
    });

    this.dashboardBody.querySelectorAll<HTMLTextAreaElement>('[data-adm-prod-fabric]').forEach((ta) => {
      ta.addEventListener('change', () => {
        storeState.updateProduct(ta.dataset.admProdFabric!, { fabricNotes: ta.value });
        this.showStatus('Updated fabric & tailoring notes.');
      });
    });

    // Main photo quick button
    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-prod-photo]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const id = inp.dataset.admProdPhoto!;
        const file = inp.files?.[0];
        if (!file) return;
        inp.value = '';
        const result = await this.processUploadedImage(file, {
          target: `prod-${id}`,
          skipAi: this.skipProductBgRemoval,
          maxDim: 650,
          quality: 0.62,
          maxChars: 35 * 1024,
        });
        storeState.updateProduct(id, { image: result.url });
        this.showStatus('Compressed main photo (<35KB) & updated product card!');
      });
    });

    // Multi-Angle Slot File Upload (Up to 4 angles, max 650px, <35KB)
    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-angle-file]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const id = inp.dataset.admAngleFile!;
        const slotIdx = Number(inp.dataset.slot || 0);
        const file = inp.files?.[0];
        if (!file) return;
        inp.value = '';
        const result = await this.processUploadedImage(file, {
          target: `prod-${id}-slot-${slotIdx}`,
          skipAi: this.skipProductBgRemoval,
          maxDim: 650,
          quality: 0.62,
          maxChars: 35 * 1024,
        });
        storeState.updateProductGallerySlot(id, slotIdx, result.url);
        this.showStatus(`Compressed & saved Angle ${slotIdx + 1} photo (<35KB)!`);
      });
    });

    // Multi-Angle Slot URL Paste
    this.dashboardBody.querySelectorAll<HTMLInputElement>('[data-adm-angle-url]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.admAngleUrl!;
        const slotIdx = Number(inp.dataset.slot || 0);
        const val = inp.value.trim();
        if (!val) return;
        storeState.updateProductGallerySlot(id, slotIdx, val);
        this.showStatus(`Updated Angle ${slotIdx + 1} photo URL.`);
      });
    });

    // Clear Angle 2-4
    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-angle-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.admAngleClear!;
        const slotIdx = Number(btn.dataset.slot || 1);
        storeState.updateProductGallerySlot(id, slotIdx, '');
        this.showStatus(`Removed Angle ${slotIdx + 1} photo.`);
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
        const compressed = await compressImageFile(file, 700, 0.65);
        storeState.updateHeroSlide(idx, { image: compressed });
        this.showStatus(`Compressed & updated Hero Slide ${idx + 1} photo cleanly (<45KB).`);
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
        this.closeDashboard();
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

        const catOpts = storeState
          .getCategories()
          .map(
            (c) =>
              `<option value="${escapeHtml(c.id)}"${item?.storeCategory === c.id ? ' selected' : ''}>${escapeHtml(c.label)}</option>`
          )
          .join('');

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
        maxDim: 700,
        quality: 0.65,
      });
      storeState.updateLookModelImage(targetIdx, result.url);
      this.showStatus(
        result.usedBgCleaner
          ? `Transparent cutout compressed (700px, <45KB) — Runway Model ${targetIdx + 1} updated cleanly!`
          : result.fallbackUsed
            ? `Uploaded compressed JPEG model photo (<45KB) for Runway Model ${targetIdx + 1}.`
            : `Compressed & uploaded model photo (<45KB) for Runway Model ${targetIdx + 1}.`
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
      this.closeDashboard();
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
          maxDim: 700,
          quality: 0.65,
        });
        storeState.updateLookPieceCustomItem(this.selectedRunwayLookIdx, pieceNum, {
          image: result.url,
        });
        this.showStatus(
          result.usedBgCleaner
            ? `Replaced Piece 0${pieceNum} photo cleanly (700px, <45KB)!`
            : `Compressed & replaced Piece 0${pieceNum} photo live (<45KB).`
        );
      });
    });
  }

  // =========================================================================
  // TAB 4: GLOBAL CLOUD SYNC, WHATSAPP, SECURITY PIN & SHOWROOM EDITOR
  // =========================================================================
  private renderSyncAndShowroomTab(): void {
    if (!this.dashboardBody) return;
    const cloud = storeState.getCloudSync();
    const sr = storeState.getShowroom();
    const storeWhatsapp = storeState.getStoreWhatsapp();
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
            Paste a free <strong>JSONBin.io v3 URL</strong> or <strong>Firebase Realtime DB (.json)</strong> endpoint so price, banner, orders, WhatsApp, PIN, showroom, and runway updates appear automatically on all devices worldwide.
          </p>

          <div class="adm-form-grid">
            <div class="adm-field adm-field--full">
              <label for="adm-cloud-url">Cloud JSON Endpoint URL</label>
              <input
                id="adm-cloud-url"
                type="url"
                placeholder="e.g. https://api.jsonbin.io/v3/b/YOUR_BIN_ID"
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
              <span class="adm-eyebrow">Customer Concierge &amp; COD WhatsApp Receipts</span>
              <h3>Store WhatsApp Number</h3>
            </div>
            <span class="adm-sync-pill" id="adm-wa-preview-link">wa.me/${escapeHtml(storeWhatsapp)}</span>
          </div>
          <p class="adm-help">
            Used for the storefront Floating WhatsApp Concierge button and Cash on Delivery order receipts. Include country code without + (e.g. <strong>923001234567</strong>).
          </p>
          <div class="adm-form-grid">
            <div class="adm-field">
              <label for="adm-store-whatsapp">Store WhatsApp Number (International Digits)</label>
              <input
                id="adm-store-whatsapp"
                type="tel"
                inputmode="numeric"
                placeholder="923001234567"
                value="${escapeHtml(storeWhatsapp)}"
              />
            </div>
            <div class="adm-field adm-field-checkbox-wrap">
              <button type="button" class="adm-btn-gold" id="adm-wa-save-sync">Save &amp; Sync WhatsApp Number</button>
            </div>
          </div>
        </div>

        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Secret Owner Access · Synced to Cloud</span>
              <h3>Security &amp; Owner PIN</h3>
            </div>
            <span class="adm-sync-pill">4–6 Numeric Digits</span>
          </div>
          <p class="adm-help">
            Update your private 4–6 digit Admin PIN. Changes save locally and push to JSONBin Cloud so your updated PIN works seamlessly across all your phones and laptops.
          </p>
          <div class="adm-form-grid">
            <div class="adm-field">
              <label for="adm-pin-current">Current Owner PIN</label>
              <input id="adm-pin-current" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Enter current PIN" />
            </div>
            <div class="adm-field">
              <label for="adm-pin-new">New Owner PIN (4–6 digits)</label>
              <input id="adm-pin-new" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="e.g. 4829" />
            </div>
            <div class="adm-field">
              <label for="adm-pin-confirm">Confirm New PIN</label>
              <input id="adm-pin-confirm" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Re-enter new PIN" />
            </div>
            <div class="adm-field adm-field-checkbox-wrap">
              <button type="button" class="adm-btn-gold" id="adm-pin-update-btn">Update &amp; Sync PIN</button>
            </div>
          </div>
          <p id="adm-pin-status-msg" class="adm-inline-feedback" role="status" aria-live="polite"></p>
        </div>

        <div class="adm-card" id="adm-sizeguide-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Storefront Measurements · Synced Worldwide to Cloud</span>
              <h3>Size Guide Editor</h3>
            </div>
            <div class="adm-head-inline-tools">
              <button type="button" class="adm-btn-secondary" id="adm-sg-reset">Restore Default Measurements</button>
              <button type="button" class="adm-btn-gold" id="adm-sg-save-sync">Save &amp; Sync Size Guide</button>
            </div>
          </div>

          <p class="adm-help">
            Customize Chest, Shoulder, Sleeve, Waist, Inseam, and EU Shoe measurements shown in the customer Size Guide modal. Changes sync live to JSONBin Cloud.
          </p>

          <div class="adm-sg-stack">
            <div class="adm-sg-group">
              <h4>Apparel: Shirts, Waistcoats &amp; Coats (S–XL)</h4>
              <div class="adm-sg-table-wrap">
                <table class="adm-sg-table">
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Chest</th>
                      <th>Shoulder</th>
                      <th>Sleeve</th>
                      <th>Waist</th>
                      <th>Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${storeState
                      .getSizeGuide()
                      .apparel.map(
                        (r, idx) => `
                        <tr>
                          <td><strong>${escapeHtml(r.size)}</strong></td>
                          <td><input type="text" value="${escapeHtml(r.chest)}" data-adm-sg-apparel="${idx}" data-field="chest" /></td>
                          <td><input type="text" value="${escapeHtml(r.shoulder)}" data-adm-sg-apparel="${idx}" data-field="shoulder" /></td>
                          <td><input type="text" value="${escapeHtml(r.sleeve)}" data-adm-sg-apparel="${idx}" data-field="sleeve" /></td>
                          <td><input type="text" value="${escapeHtml(r.waist)}" data-adm-sg-apparel="${idx}" data-field="waist" /></td>
                          <td><input type="text" value="${escapeHtml(r.length)}" data-adm-sg-apparel="${idx}" data-field="length" /></td>
                        </tr>
                      `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="adm-sg-group">
              <h4>Trousers (Waist 28–34)</h4>
              <div class="adm-sg-table-wrap">
                <table class="adm-sg-table">
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Waist</th>
                      <th>Hip</th>
                      <th>Inseam</th>
                      <th>Leg Opening</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${storeState
                      .getSizeGuide()
                      .trousers.map(
                        (r, idx) => `
                        <tr>
                          <td><strong>${escapeHtml(r.size)}</strong></td>
                          <td><input type="text" value="${escapeHtml(r.waist)}" data-adm-sg-trouser="${idx}" data-field="waist" /></td>
                          <td><input type="text" value="${escapeHtml(r.hip)}" data-adm-sg-trouser="${idx}" data-field="hip" /></td>
                          <td><input type="text" value="${escapeHtml(r.inseam)}" data-adm-sg-trouser="${idx}" data-field="inseam" /></td>
                          <td><input type="text" value="${escapeHtml(r.legOpening)}" data-adm-sg-trouser="${idx}" data-field="legOpening" /></td>
                        </tr>
                      `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="adm-sg-group">
              <h4>Shoes (EU 40–46)</h4>
              <div class="adm-sg-table-wrap">
                <table class="adm-sg-table">
                  <thead>
                    <tr>
                      <th>EU</th>
                      <th>US Men</th>
                      <th>UK</th>
                      <th>Foot Length</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${storeState
                      .getSizeGuide()
                      .shoes.map(
                        (r, idx) => `
                        <tr>
                          <td><input type="text" value="${escapeHtml(r.eu)}" data-adm-sg-shoe="${idx}" data-field="eu" /></td>
                          <td><input type="text" value="${escapeHtml(r.us)}" data-adm-sg-shoe="${idx}" data-field="us" /></td>
                          <td><input type="text" value="${escapeHtml(r.uk)}" data-adm-sg-shoe="${idx}" data-field="uk" /></td>
                          <td><input type="text" value="${escapeHtml(r.cm)}" data-adm-sg-shoe="${idx}" data-field="cm" /></td>
                        </tr>
                      `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="adm-field">
              <label for="adm-sg-note">Tailor Fit Guidance Note</label>
              <textarea id="adm-sg-note" rows="2">${escapeHtml(storeState.getSizeGuide().note)}</textarea>
            </div>
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

    // Store WhatsApp Number handlers
    const waInp = document.getElementById('adm-store-whatsapp') as HTMLInputElement | null;
    const waPreview = document.getElementById('adm-wa-preview-link');
    const waSaveBtn = document.getElementById('adm-wa-save-sync') as HTMLButtonElement | null;

    waInp?.addEventListener('input', () => {
      const normalized = sanitizeWhatsappDigits(waInp.value);
      if (waPreview) waPreview.textContent = `wa.me/${normalized}`;
    });

    waSaveBtn?.addEventListener('click', async () => {
      if (!waInp) return;
      waSaveBtn.disabled = true;
      waSaveBtn.textContent = 'Syncing...';
      try {
        storeState.setStoreWhatsapp(waInp.value);
        await storeState.saveAllChanges(true);
        this.showStatus(`Saved Store WhatsApp (${storeState.getStoreWhatsapp()}) & synced to Cloud!`);
        this.renderSyncAndShowroomTab();
      } finally {
        waSaveBtn.disabled = false;
        waSaveBtn.textContent = 'Save & Sync WhatsApp Number';
      }
    });

    // Owner PIN update handlers
    const pinCurrEl = document.getElementById('adm-pin-current') as HTMLInputElement | null;
    const pinNewEl = document.getElementById('adm-pin-new') as HTMLInputElement | null;
    const pinConfEl = document.getElementById('adm-pin-confirm') as HTMLInputElement | null;
    const pinBtnEl = document.getElementById('adm-pin-update-btn') as HTMLButtonElement | null;
    const pinMsgEl = document.getElementById('adm-pin-status-msg');

    pinBtnEl?.addEventListener('click', async () => {
      const curr = pinCurrEl?.value.trim() || '';
      const next = pinNewEl?.value.trim() || '';
      const conf = pinConfEl?.value.trim() || '';
      const setInline = (msg: string, isError: boolean) => {
        if (!pinMsgEl) return;
        pinMsgEl.textContent = msg;
        pinMsgEl.classList.toggle('is-error', isError);
        pinMsgEl.classList.toggle('is-ok', !isError);
      };

      if (!storeState.verifyPin(curr)) {
        setInline('Current Owner PIN does not match.', true);
        pinCurrEl?.focus();
        return;
      }
      if (!/^\d{4,6}$/.test(next)) {
        setInline('New PIN must be 4 to 6 numeric digits (0–9).', true);
        pinNewEl?.focus();
        return;
      }
      if (next !== conf) {
        setInline('New PIN and confirmation do not match.', true);
        pinConfEl?.focus();
        return;
      }

      pinBtnEl.disabled = true;
      pinBtnEl.textContent = 'Updating PIN...';
      try {
        const res = await storeState.updateAdminPin(next);
        setInline(res.message, !res.ok);
        this.showStatus(res.message);
        if (res.ok) {
          if (pinCurrEl) pinCurrEl.value = '';
          if (pinNewEl) pinNewEl.value = '';
          if (pinConfEl) pinConfEl.value = '';
        }
      } finally {
        pinBtnEl.disabled = false;
        pinBtnEl.textContent = 'Update & Sync PIN';
      }
    });

    // Editable Size Guide handlers
    const readSizeGuideDraft = () => {
      const next = JSON.parse(JSON.stringify(storeState.getSizeGuide())) as ReturnType<
        typeof storeState.getSizeGuide
      >;
      this.dashboardBody?.querySelectorAll<HTMLInputElement>('[data-adm-sg-apparel]').forEach((inp) => {
        const idx = Number(inp.dataset.admSgApparel);
        const field = inp.dataset.field as keyof (typeof next.apparel)[number] | undefined;
        if (next.apparel[idx] && field) {
          next.apparel[idx][field] = inp.value.trim();
        }
      });
      this.dashboardBody?.querySelectorAll<HTMLInputElement>('[data-adm-sg-trouser]').forEach((inp) => {
        const idx = Number(inp.dataset.admSgTrouser);
        const field = inp.dataset.field as keyof (typeof next.trousers)[number] | undefined;
        if (next.trousers[idx] && field) {
          next.trousers[idx][field] = inp.value.trim();
        }
      });
      this.dashboardBody?.querySelectorAll<HTMLInputElement>('[data-adm-sg-shoe]').forEach((inp) => {
        const idx = Number(inp.dataset.admSgShoe);
        const field = inp.dataset.field as keyof (typeof next.shoes)[number] | undefined;
        if (next.shoes[idx] && field) {
          next.shoes[idx][field] = inp.value.trim();
        }
      });
      const noteEl = document.getElementById('adm-sg-note') as HTMLTextAreaElement | null;
      if (noteEl && noteEl.value.trim()) {
        next.note = noteEl.value.trim();
      }
      return next;
    };

    const sgInputs = this.dashboardBody.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      '[data-adm-sg-apparel], [data-adm-sg-trouser], [data-adm-sg-shoe], #adm-sg-note'
    );
    sgInputs.forEach((inp) => {
      inp.addEventListener('change', () => {
        this.suppressNextStoreRender = true;
        storeState.updateSizeGuide(readSizeGuideDraft());
        this.suppressNextStoreRender = false;
        this.showStatus('Updated Size Guide measurement live.');
      });
    });

    const sgSaveBtn = document.getElementById('adm-sg-save-sync') as HTMLButtonElement | null;
    sgSaveBtn?.addEventListener('click', async () => {
      sgSaveBtn.disabled = true;
      sgSaveBtn.textContent = 'Syncing...';
      try {
        storeState.updateSizeGuide(readSizeGuideDraft());
        await storeState.saveAllChanges(true);
        this.showStatus('Saved Size Guide measurements & synced to Cloud!');
      } finally {
        sgSaveBtn.disabled = false;
        sgSaveBtn.textContent = 'Save & Sync Size Guide';
      }
    });

    document.getElementById('adm-sg-reset')?.addEventListener('click', () => {
      storeState.resetSizeGuideDefault();
      this.renderSyncAndShowroomTab();
      this.showStatus('Restored default Size Guide measurements.');
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

  // =========================================================================
  // TAB 5: LIVE CLOUD ORDERS & SALES ANALYTICS DASHBOARD
  // =========================================================================
  private buildCustomerWhatsappHref(order: StoreOrder): string {
    const custDigits = sanitizeWhatsappDigits(order.phone, '');
    if (!custDigits) return '#';
    const msg = [
      `Assalam-o-Alaikum ${order.customerName},`,
      `Thank you for shopping with *GR SON'S Atelier* (Gujranwala).`,
      `Your Cash on Delivery Order *#${order.orderNumber}* (${formatMoney(order.total)}) is currently *${order.status}*.`,
      `Delivery Address: ${order.address}`,
    ].join('\n');
    return `https://wa.me/${custDigits}?text=${encodeURIComponent(msg)}`;
  }

  private buildFittingClientWhatsappHref(fitting: FittingAppointment): string {
    const custDigits = sanitizeWhatsappDigits(fitting.phone, '');
    if (!custDigits) return '#';
    const sr = storeState.getShowroom();
    const msg = [
      `Assalam-o-Alaikum ${fitting.customerName},`,
      `Your Private Bespoke Fitting (*${fitting.refCode}*) at *${sr.storeName}* is confirmed for *${fitting.preferredDate}*.`,
      `Garment Focus: ${fitting.garmentFocus}`,
      `Location: ${sr.address}`,
    ].join('\n');
    return `https://wa.me/${custDigits}?text=${encodeURIComponent(msg)}`;
  }

  private formatCompactPkr(amount: number): string {
    if (amount <= 0) return '0';
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
    return String(Math.round(amount));
  }

  private buildSmoothCurvePath(
    pts: { x: number; y: number }[],
    minY = -Infinity,
    maxY = Infinity
  ): string {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    const clampY = (val: number) => Math.max(minY, Math.min(maxY, val));
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  private renderOrdersTab(): void {
    if (!this.dashboardBody) return;
    const allOrders = storeState.getOrders();

    // KPI computations
    const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrdersCount = allOrders.length;
    const pendingCount = allOrders.filter((o) => o.status === 'Pending').length;
    const dispatchedCount = allOrders.filter((o) => o.status === 'Dispatched').length;
    const deliveredCount = allOrders.filter((o) => o.status === 'Delivered').length;

    // Multi-timeframe buckets: Days (7d), Weeks (6w), Months (6m)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets: { key: string; label: string; revenue: number; count: number }[] = [];

    if (this.orderTimeframe === 'days') {
      const sampleRevs = [24500, 42000, 36500, 61000, 52000, 78500, 94000];
      const sampleCounts = [1, 2, 2, 3, 2, 4, 5];
      for (let offset = 6; offset >= 0; offset--) {
        const d = new Date(today);
        d.setDate(today.getDate() - offset);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const label = offset === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
        const idx = 6 - offset;
        buckets.push({
          key,
          label,
          revenue: this.previewSampleSales ? sampleRevs[idx] : 0,
          count: this.previewSampleSales ? sampleCounts[idx] : 0,
        });
      }
      const bMap = new Map(buckets.map((b) => [b.key, b]));
      for (const order of allOrders) {
        const dt = new Date(order.createdAt);
        if (Number.isNaN(dt.getTime())) continue;
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const bucket = bMap.get(key);
        if (bucket) {
          bucket.revenue += order.total;
          bucket.count += 1;
        }
      }
    } else if (this.orderTimeframe === 'weeks') {
      const sampleRevs = [32000, 54000, 46000, 72000, 65000, 92000];
      const sampleCounts = [2, 3, 3, 4, 4, 5];
      for (let wOff = 5; wOff >= 0; wOff--) {
        const label = wOff === 0 ? 'This Wk' : `${wOff}w ago`;
        const idx = 5 - wOff;
        buckets.push({
          key: `w-${wOff}`,
          label,
          revenue: this.previewSampleSales ? sampleRevs[idx] : 0,
          count: this.previewSampleSales ? sampleCounts[idx] : 0,
        });
      }
      for (const order of allOrders) {
        const dt = new Date(order.createdAt);
        if (Number.isNaN(dt.getTime())) continue;
        const dayDiff = Math.floor((today.getTime() - new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()) / 86_400_000);
        const wOff = Math.floor(Math.max(0, dayDiff) / 7);
        if (wOff <= 5) {
          const target = buckets[5 - wOff];
          if (target) {
            target.revenue += order.total;
            target.count += 1;
          }
        }
      }
    } else {
      const sampleRevs = [48000, 62000, 55000, 76000, 84000, 98000];
      const sampleCounts = [3, 4, 3, 5, 5, 6];
      for (let mOff = 5; mOff >= 0; mOff--) {
        const d = new Date(today.getFullYear(), today.getMonth() - mOff, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        const idx = 5 - mOff;
        buckets.push({
          key,
          label,
          revenue: this.previewSampleSales ? sampleRevs[idx] : 0,
          count: this.previewSampleSales ? sampleCounts[idx] : 0,
        });
      }
      const mMap = new Map(buckets.map((b) => [b.key, b]));
      for (const order of allOrders) {
        const dt = new Date(order.createdAt);
        if (Number.isNaN(dt.getTime())) continue;
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const bucket = mMap.get(key);
        if (bucket) {
          bucket.revenue += order.total;
          bucket.count += 1;
        }
      }
    }

    if (this.selectedChartDayIdx >= buckets.length) {
      this.selectedChartDayIdx = buckets.length - 1;
    }

    const rawMax = Math.max(...buckets.map((b) => b.revenue), 0);
    const tickValues =
      rawMax <= 100_000
        ? [0, 25_000, 50_000, 100_000]
        : (() => {
            const top = Math.ceil((rawMax * 1.15) / 100_000) * 100_000;
            return [0, Math.round(top * 0.25), Math.round(top * 0.5), top];
          })();
    const scaleMax = tickValues[tickValues.length - 1];

    const chartW = 580;
    const chartH = 228;
    const padL = 74;
    const padR = 24;
    const padT = 22;
    const padB = 34;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const baseLineY = padT + plotH;
    const stepX = buckets.length > 1 ? plotW / (buckets.length - 1) : plotW;
    const hitW = buckets.length > 1 ? Math.max(36, plotW / buckets.length) : plotW;

    const coords = buckets.map((b, idx) => {
      const cx = buckets.length > 1 ? padL + stepX * idx : padL + plotW / 2;
      const ratio = scaleMax > 0 ? Math.min(1, Math.max(0, b.revenue / scaleMax)) : 0;
      const cy = baseLineY - ratio * plotH;
      return { x: cx, y: cy };
    });

    const linePath = this.buildSmoothCurvePath(coords, padT, baseLineY);
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseLineY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${baseLineY.toFixed(1)} Z`
        : '';

    const gridLinesHtml = tickValues
      .map((val) => {
        const frac = scaleMax > 0 ? val / scaleMax : 0;
        const y = baseLineY - plotH * frac;
        const label = `PKR ${this.formatCompactPkr(val)}`;
        return `
          <line x1="${padL}" y1="${y.toFixed(1)}" x2="${chartW - padR}" y2="${y.toFixed(1)}" class="${val === 0 ? 'adm-chart-axis' : 'adm-chart-gridline'}" />
          <text x="${padL - 10}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="adm-chart-ylabel">${escapeHtml(label)}</text>
        `;
      })
      .join('');

    const svgNodesHtml = buckets
      .map((b, idx) => {
        const pt = coords[idx];
        const hitX = Math.max(padL - 12, pt.x - hitW / 2);
        const hitWidth = Math.min(chartW - padR + 12 - hitX, hitW);
        const isSelected = idx === this.selectedChartDayIdx;
        return `
          <g class="adm-chart-col${isSelected ? ' is-selected' : ''}" data-chart-day="${idx}" tabindex="0" role="button" aria-label="${escapeHtml(b.label)}: ${formatMoney(b.revenue)} across ${b.count} ${b.count === 1 ? 'order' : 'orders'}">
            <line x1="${pt.x.toFixed(1)}" y1="${padT}" x2="${pt.x.toFixed(1)}" y2="${baseLineY}" class="adm-chart-vguide" />
            <rect x="${hitX.toFixed(1)}" y="${padT - 8}" width="${Math.max(24, hitWidth).toFixed(1)}" height="${plotH + 34}" fill="transparent" />
            <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${isSelected ? '11' : '8.5'}" class="adm-chart-halo" />
            <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${isSelected ? '5.2' : '4'}" class="adm-chart-dot${b.revenue > 0 ? ' has-value' : ''}" filter="url(#adm-node-glow)" />
            <text x="${pt.x.toFixed(1)}" y="${chartH - 10}" text-anchor="middle" class="adm-chart-xlabel">${escapeHtml(b.label)}</text>
            <title>${escapeHtml(b.label)}: ${formatMoney(b.revenue)} (${b.count} ${b.count === 1 ? 'order' : 'orders'})</title>
          </g>
        `;
      })
      .join('');

    const activeDay = buckets[this.selectedChartDayIdx] || buckets[buckets.length - 1];
    const timeframeTitle =
      this.orderTimeframe === 'days'
        ? '7-Day Sales Trend (PKR)'
        : this.orderTimeframe === 'weeks'
          ? '6-Week Sales Trend (PKR)'
          : '6-Month Sales Trend (PKR)';

    // Category revenue breakdown (dynamic from storefront categories + any historical order categories)
    const catTotals: Record<string, { label: string; revenue: number; units: number }> = {};
    for (const c of storeState.getCategories()) {
      catTotals[c.id] = { label: c.label, revenue: 0, units: 0 };
    }
    for (const order of allOrders) {
      for (const it of order.items) {
        const key = (it.storeCategory || 'shirts').trim() || 'shirts';
        if (!catTotals[key]) {
          catTotals[key] = {
            label: storeState.getCategoryLabel(key),
            revenue: 0,
            units: 0,
          };
        }
        catTotals[key].revenue += it.totalPrice;
        catTotals[key].units += it.quantity;
      }
    }
    const catRows = Object.values(catTotals);
    const maxCatRev = Math.max(1, ...catRows.map((c) => c.revenue));
    const catBarsHtml = catRows
      .map((c) => {
        const pct = c.revenue > 0 ? Math.max(6, Math.round((c.revenue / maxCatRev) * 100)) : 0;
        return `
          <div class="adm-cat-bar-row">
            <div class="adm-cat-bar-meta">
              <span>${escapeHtml(c.label)}</span>
              <strong>${formatMoney(c.revenue)} <small>(${c.units} pcs)</small></strong>
            </div>
            <div class="adm-cat-bar-track">
              <div class="adm-cat-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    // Filtered orders list
    const filteredOrders =
      this.orderStatusFilter === 'All'
        ? allOrders
        : allOrders.filter((o) => o.status === this.orderStatusFilter);

    const filterTabs: { id: 'All' | OrderStatus; label: string; count: number }[] = [
      { id: 'All', label: 'All Orders', count: totalOrdersCount },
      { id: 'Pending', label: 'Pending', count: pendingCount },
      { id: 'Dispatched', label: 'Dispatched', count: dispatchedCount },
      { id: 'Delivered', label: 'Delivered', count: deliveredCount },
    ];

    const filterBtnsHtml = filterTabs
      .map((f) => {
        const active = f.id === this.orderStatusFilter;
        return `<button type="button" class="adm-chip" data-adm-order-filter="${f.id}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(f.label)} (${f.count})</button>`;
      })
      .join('');

    const ordersHtml =
      filteredOrders.length > 0
        ? filteredOrders
            .map((order) => {
              const dtStr = new Date(order.createdAt).toLocaleString('en-PK', {
                dateStyle: 'medium',
                timeStyle: 'short',
              });
              const itemsListHtml = order.items
                .map(
                  (it) =>
                    `<li><span>${escapeHtml(it.name)} <em>(${escapeHtml(it.size || 'Std')} × ${it.quantity})</em></span><strong>${formatMoney(it.totalPrice)}</strong></li>`
                )
                .join('');
              const statusButtons = (['Pending', 'Dispatched', 'Delivered'] as OrderStatus[])
                .map((st) => {
                  const isCurr = order.status === st;
                  return `<button type="button" class="adm-order-st-btn${isCurr ? ' is-current' : ''}" data-adm-order-id="${escapeHtml(order.id)}" data-adm-order-status="${st}" aria-pressed="${isCurr ? 'true' : 'false'}">${st}</button>`;
                })
                .join('');
              const waHref = this.buildCustomerWhatsappHref(order);
              const isConfirmDel = this.pendingDeleteOrderIds.has(order.id);

              return `
                <article class="adm-order-card" data-order-id="${escapeHtml(order.id)}">
                  <div class="adm-order-top">
                    <div class="adm-order-id-wrap">
                      <span class="adm-order-num">#${escapeHtml(order.orderNumber)}</span>
                      <span class="adm-order-date">${escapeHtml(dtStr)}</span>
                    </div>
                    <div class="adm-order-top-right">
                      <span class="adm-order-badge is-${order.status.toLowerCase()}">${escapeHtml(order.status)}</span>
                      <button
                        type="button"
                        class="adm-order-del-btn${isConfirmDel ? ' is-confirming' : ''}"
                        data-adm-order-del="${escapeHtml(order.id)}"
                        title="${isConfirmDel ? 'Click again to delete permanently' : 'Delete test order'}"
                        aria-label="Delete order ${escapeHtml(order.orderNumber)}"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
                        </svg>
                        <span>${isConfirmDel ? 'Confirm?' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>

                  <div class="adm-order-customer">
                    <div>
                      <strong>${escapeHtml(order.customerName)}</strong>
                      <span>${escapeHtml(order.phone)}</span>
                    </div>
                    <p>${escapeHtml(order.address)}</p>
                  </div>

                  <ul class="adm-order-items" role="list">${itemsListHtml}</ul>

                  <div class="adm-order-footer">
                    <div class="adm-order-total-block">
                      <small>Cash on Delivery Total</small>
                      <strong>${formatMoney(order.total)}</strong>
                    </div>
                    <div class="adm-order-actions">
                      <div class="adm-order-status-group" role="group" aria-label="Change order status for ${escapeHtml(order.orderNumber)}">
                        ${statusButtons}
                      </div>
                      ${
                        waHref !== '#'
                          ? `<a class="adm-wa-customer-btn" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">
                              <svg class="wa-official-svg" width="15" height="15" viewBox="0 0 32 32" aria-hidden="true">
                                <path fill="#25D366" d="M16 3C8.82 3 3 8.82 3 16c0 2.47.7 4.78 1.9 6.75L3.6 28.4l5.8-1.52A12.93 12.93 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z" />
                                <path fill="#ffffff" d="M23.02 19.65c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.95 1.18-.18.2-.35.23-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.68-1.64-.93-2.25-.25-.6-.5-.52-.68-.53h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.18-1.43-.08-.13-.28-.2-.58-.35z" />
                              </svg>
                              <span>WhatsApp Customer</span>
                            </a>`
                          : ''
                      }
                    </div>
                  </div>
                </article>
              `;
            })
            .join('')
        : `
          <div class="adm-orders-empty">
            <strong>No ${this.orderStatusFilter === 'All' ? '' : `${this.orderStatusFilter.toLowerCase()} `}orders recorded yet.</strong>
            <p>When shoppers complete Cash on Delivery checkout in the Shopping Bag, orders appear here and sync automatically to your JSONBin Cloud.</p>
          </div>
        `;

    const allFittings = storeState.getFittings();
    const fittingsHtml =
      allFittings.length > 0
        ? allFittings
            .map((fit) => {
              const dtStr = new Date(fit.createdAt).toLocaleString('en-PK', {
                dateStyle: 'medium',
                timeStyle: 'short',
              });
              const clientWaHref = this.buildFittingClientWhatsappHref(fit);
              const isConfirmDel = this.pendingDeleteFittingIds.has(fit.id);
              return `
                <article class="adm-order-card" data-fitting-id="${escapeHtml(fit.id)}">
                  <div class="adm-order-top">
                    <div class="adm-order-id-wrap">
                      <span class="adm-order-num">${escapeHtml(fit.refCode)}</span>
                      <span class="adm-order-date">Booked ${escapeHtml(dtStr)}</span>
                    </div>
                    <div class="adm-order-top-right">
                      <span class="adm-order-badge is-dispatched">Preferred Date: ${escapeHtml(fit.preferredDate)}</span>
                      <button
                        type="button"
                        class="adm-order-del-btn${isConfirmDel ? ' is-confirming' : ''}"
                        data-adm-fitting-del="${escapeHtml(fit.id)}"
                        title="${isConfirmDel ? 'Click again to delete appointment' : 'Delete fitting appointment'}"
                        aria-label="Delete fitting ${escapeHtml(fit.refCode)}"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
                        </svg>
                        <span>${isConfirmDel ? 'Confirm?' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>

                  <div class="adm-order-customer">
                    <div>
                      <strong>${escapeHtml(fit.customerName)}</strong>
                      <span>${escapeHtml(fit.phone)}</span>
                    </div>
                    <p><strong>Garment Focus:</strong> ${escapeHtml(fit.garmentFocus)}</p>
                  </div>

                  <div class="adm-order-footer">
                    <div class="adm-order-total-block">
                      <small>Private Showroom Session</small>
                      <strong>${escapeHtml(fit.preferredDate)}</strong>
                    </div>
                    <div class="adm-order-actions">
                      ${
                        clientWaHref !== '#'
                          ? `<a class="adm-wa-customer-btn" href="${escapeHtml(clientWaHref)}" target="_blank" rel="noopener noreferrer">
                              <svg class="wa-official-svg" width="15" height="15" viewBox="0 0 32 32" aria-hidden="true">
                                <path fill="#25D366" d="M16 3C8.82 3 3 8.82 3 16c0 2.47.7 4.78 1.9 6.75L3.6 28.4l5.8-1.52A12.93 12.93 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z" />
                                <path fill="#ffffff" d="M23.02 19.65c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.95 1.18-.18.2-.35.23-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.68-1.64-.93-2.25-.25-.6-.5-.52-.68-.53h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.18-1.43-.08-.13-.28-.2-.58-.35z" />
                              </svg>
                              <span>WhatsApp Client</span>
                            </a>`
                          : ''
                      }
                    </div>
                  </div>
                </article>
              `;
            })
            .join('')
        : `
          <div class="adm-orders-empty">
            <strong>No Showroom Fitting Appointments booked yet.</strong>
            <p>When clients submit "Book Custom Fitting" from the storefront or Gujranwala Showroom section, appointments appear here and sync automatically to JSONBin Cloud.</p>
          </div>
        `;

    this.dashboardBody.innerHTML = `
      <div class="adm-section">
        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Live JSONBin Cloud Orders · PKR Analytics</span>
              <h3>Orders &amp; Commercial Sales Dashboard</h3>
            </div>
            <button type="button" class="adm-btn-secondary" id="adm-orders-refresh">
              Pull Latest Cloud Orders
            </button>
          </div>

          <div class="adm-kpi-grid">
            <div class="adm-kpi-card adm-kpi-card--gold">
              <span class="adm-kpi-label">Total Revenue (PKR)</span>
              <strong class="adm-kpi-value">${formatMoney(totalRevenue)}</strong>
              <small class="adm-kpi-sub">Across all live COD orders</small>
            </div>
            <div class="adm-kpi-card">
              <span class="adm-kpi-label">Total Orders</span>
              <strong class="adm-kpi-value">${totalOrdersCount}</strong>
              <small class="adm-kpi-sub">${dispatchedCount} currently in transit</small>
            </div>
            <div class="adm-kpi-card">
              <span class="adm-kpi-label">Pending Dispatch</span>
              <strong class="adm-kpi-value">${pendingCount}</strong>
              <small class="adm-kpi-sub">Awaiting tailoring / packing</small>
            </div>
            <div class="adm-kpi-card">
              <span class="adm-kpi-label">Delivered Orders</span>
              <strong class="adm-kpi-value">${deliveredCount}</strong>
              <small class="adm-kpi-sub">Completed COD handovers</small>
            </div>
          </div>

          <div class="adm-analytics-grid">
            <div class="adm-chart-panel">
              <div class="adm-chart-head">
                <div>
                  <span class="adm-step-label">${timeframeTitle}${this.previewSampleSales ? ' · Sample Preview' : ''}</span>
                  <strong id="adm-chart-detail" class="adm-chart-detail">
                    ${escapeHtml(activeDay.label)}: ${formatMoney(activeDay.revenue)} (${activeDay.count} ${activeDay.count === 1 ? 'order' : 'orders'})
                  </strong>
                </div>
                <div class="adm-chart-controls">
                  <div class="adm-tf-group" role="group" aria-label="Sales chart timeframe">
                    <button type="button" class="adm-tf-btn" data-chart-tf="days" aria-pressed="${this.orderTimeframe === 'days' ? 'true' : 'false'}">Days</button>
                    <button type="button" class="adm-tf-btn" data-chart-tf="weeks" aria-pressed="${this.orderTimeframe === 'weeks' ? 'true' : 'false'}">Weeks</button>
                    <button type="button" class="adm-tf-btn" data-chart-tf="months" aria-pressed="${this.orderTimeframe === 'months' ? 'true' : 'false'}">Months</button>
                  </div>
                  <button
                    type="button"
                    id="adm-chart-sample-toggle"
                    class="adm-sample-btn${this.previewSampleSales ? ' is-active' : ''}"
                    aria-pressed="${this.previewSampleSales ? 'true' : 'false'}"
                  >
                    ${this.previewSampleSales ? 'Hide Sample' : 'Sample Preview'}
                  </button>
                </div>
              </div>
              <div class="adm-chart-stage" id="adm-chart-stage">
                <svg class="adm-sales-svg" viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="${escapeHtml(timeframeTitle)} smooth revenue line and area chart">
                  <defs>
                    <linearGradient id="adm-sales-area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#10B981" stop-opacity="0.38" />
                      <stop offset="52%" stop-color="#C8A464" stop-opacity="0.22" />
                      <stop offset="100%" stop-color="#161513" stop-opacity="0.02" />
                    </linearGradient>
                    <linearGradient id="adm-sales-line-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stop-color="#C8A464" />
                      <stop offset="55%" stop-color="#E5C585" />
                      <stop offset="100%" stop-color="#10B981" />
                    </linearGradient>
                    <filter id="adm-node-glow" x="-80%" y="-80%" width="260%" height="260%">
                      <feGaussianBlur stdDeviation="2.6" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  ${gridLinesHtml}
                  <path d="${areaPath}" fill="url(#adm-sales-area-grad)" />
                  <path d="${linePath}" fill="none" stroke="url(#adm-sales-line-grad)" class="adm-chart-trend" />
                  ${svgNodesHtml}
                </svg>
                <div class="adm-chart-tooltip" id="adm-chart-tooltip" hidden role="status" aria-live="polite">
                  <span class="adm-tt-label" id="adm-tt-label"></span>
                  <strong class="adm-tt-rev" id="adm-tt-rev"></strong>
                  <small class="adm-tt-orders" id="adm-tt-orders"></small>
                </div>
              </div>
            </div>

            <div class="adm-chart-panel">
              <div class="adm-chart-head">
                <div>
                  <span class="adm-step-label">Category Revenue Breakdown</span>
                  <strong class="adm-chart-detail">Top Performing Menswear Lines</strong>
                </div>
              </div>
              <div class="adm-cat-bars">${catBarsHtml}</div>
            </div>
          </div>
        </div>

        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Live Customer Queue · One-Click Dispatch</span>
              <h3>Customer COD Orders (${filteredOrders.length})</h3>
            </div>
            <div class="adm-chips">${filterBtnsHtml}</div>
          </div>

          <div class="adm-orders-list">${ordersHtml}</div>
        </div>

        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <span class="adm-eyebrow">Gujranwala Flagship Bespoke Desk · JSONBin Cloud Synced</span>
              <h3>Showroom Fitting Appointments (${allFittings.length})</h3>
            </div>
          </div>

          <div class="adm-orders-list">${fittingsHtml}</div>
        </div>
      </div>
    `;

    // Timeframe switcher (Days / Weeks / Months)
    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-chart-tf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tf = btn.dataset.chartTf as 'days' | 'weeks' | 'months' | undefined;
        if (!tf) return;
        this.orderTimeframe = tf;
        this.selectedChartDayIdx = tf === 'days' ? 6 : 5;
        this.renderOrdersTab();
      });
    });

    // Sample Preview Toggle
    document.getElementById('adm-chart-sample-toggle')?.addEventListener('click', () => {
      this.previewSampleSales = !this.previewSampleSales;
      this.renderOrdersTab();
    });

    // Wire interactive smooth chart nodes & hover tooltip
    const chartStage = document.getElementById('adm-chart-stage');
    const tooltipEl = document.getElementById('adm-chart-tooltip');
    const ttLabel = document.getElementById('adm-tt-label');
    const ttRev = document.getElementById('adm-tt-rev');
    const ttOrders = document.getElementById('adm-tt-orders');

    const updateTooltipPosition = (idx: number, show: boolean) => {
      const d = buckets[idx];
      const pt = coords[idx];
      if (!tooltipEl || !d || !pt) return;
      if (!show) {
        tooltipEl.hidden = true;
        return;
      }
      if (ttLabel) ttLabel.textContent = d.label;
      if (ttRev) ttRev.textContent = formatMoney(d.revenue);
      if (ttOrders) ttOrders.textContent = `${d.count} ${d.count === 1 ? 'order' : 'orders'}`;
      const xPct = Math.min(86, Math.max(14, (pt.x / chartW) * 100));
      const yPct = Math.min(72, Math.max(12, (pt.y / chartH) * 100));
      tooltipEl.style.left = `${xPct.toFixed(1)}%`;
      tooltipEl.style.top = `${yPct.toFixed(1)}%`;
      tooltipEl.hidden = false;
    };

    this.dashboardBody.querySelectorAll<SVGElement>('[data-chart-day]').forEach((col) => {
      const idx = Number(col.dataset.chartDay || 0);
      const selectDay = (showTooltip: boolean) => {
        this.selectedChartDayIdx = idx;
        this.dashboardBody?.querySelectorAll('.adm-chart-col').forEach((c, i) => {
          c.classList.toggle('is-selected', i === idx);
        });
        const d = buckets[idx];
        const detailEl = document.getElementById('adm-chart-detail');
        if (detailEl && d) {
          detailEl.textContent = `${d.label}: ${formatMoney(d.revenue)} (${d.count} ${d.count === 1 ? 'order' : 'orders'})`;
        }
        updateTooltipPosition(idx, showTooltip);
      };
      col.addEventListener('click', () => selectDay(true));
      col.addEventListener('mouseenter', () => selectDay(true));
      col.addEventListener('focus', () => selectDay(true));
    });

    chartStage?.addEventListener('mouseleave', () => {
      if (tooltipEl) tooltipEl.hidden = true;
    });

    // Pull latest cloud orders button
    const refreshBtn = document.getElementById('adm-orders-refresh') as HTMLButtonElement | null;
    refreshBtn?.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      try {
        const res = await storeState.pullFromCloud();
        this.showStatus(res.ok ? 'Refreshed latest live orders from Cloud!' : res.message);
        this.renderOrdersTab();
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Pull Latest Cloud Orders';
      }
    });

    // Filter pills
    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-order-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.orderStatusFilter = (btn.dataset.admOrderFilter || 'All') as 'All' | OrderStatus;
        this.renderOrdersTab();
      });
    });

    // One-click order status updates (persist + sync to cloud)
    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-order-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.admOrderId;
        const nextStatus = btn.dataset.admOrderStatus as OrderStatus | undefined;
        if (!orderId || !nextStatus) return;
        btn.disabled = true;
        await storeState.updateOrderStatus(orderId, nextStatus);
        this.showStatus(`Order status updated to "${nextStatus}" & synced to Cloud.`);
      });
    });

    // Trash / Delete order button (2-click safe confirm + cloud sync)
    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-order-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.admOrderDel;
        if (!orderId) return;
        if (!this.pendingDeleteOrderIds.has(orderId)) {
          this.pendingDeleteOrderIds.add(orderId);
          this.renderOrdersTab();
          window.setTimeout(() => {
            if (this.pendingDeleteOrderIds.delete(orderId) && this.activeTab === 'orders') {
              this.renderOrdersTab();
            }
          }, 4000);
          return;
        }
        this.pendingDeleteOrderIds.delete(orderId);
        btn.disabled = true;
        await storeState.deleteOrder(orderId);
        this.showStatus('Order removed & synced cleanly to JSONBin Cloud.');
      });
    });

    // Delete fitting appointment button (2-click safe confirm + cloud sync)
    this.dashboardBody.querySelectorAll<HTMLButtonElement>('[data-adm-fitting-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const fittingId = btn.dataset.admFittingDel;
        if (!fittingId) return;
        if (!this.pendingDeleteFittingIds.has(fittingId)) {
          this.pendingDeleteFittingIds.add(fittingId);
          this.renderOrdersTab();
          window.setTimeout(() => {
            if (this.pendingDeleteFittingIds.delete(fittingId) && this.activeTab === 'orders') {
              this.renderOrdersTab();
            }
          }, 4000);
          return;
        }
        this.pendingDeleteFittingIds.delete(fittingId);
        btn.disabled = true;
        await storeState.deleteFitting(fittingId);
        this.showStatus('Fitting appointment removed & synced to JSONBin Cloud.');
      });
    });
  }
}
