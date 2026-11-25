import { CatalogItem, formatMoney } from '../data/catalog.ts';
import { sanitizeWhatsappDigits, storeState } from '../data/storeState.ts';
import { StylingBag } from './bag.ts';

export interface QuickViewContext {
  productId: string;
  lookLabel?: string;
  tag?: string;
  selectedVariantId?: number;
  cardEl?: HTMLElement | null;
  onAdded?: (cardEl: HTMLElement | null, variantId: number) => void;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class QuickViewModal {
  private bag: StylingBag;
  private pdpEl: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private imgEl: HTMLImageElement | null = null;
  private thumbsEl: HTMLElement | null = null;
  private tagEl: HTMLElement | null = null;
  private tagTextEl: HTMLElement | null = null;
  private breadcrumbEl: HTMLElement | null = null;
  private kickerEl: HTMLElement | null = null;
  private skuEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private priceEl: HTMLElement | null = null;
  private lookNoteEl: HTMLElement | null = null;
  private fabricEl: HTMLElement | null = null;
  private optLegendEl: HTMLElement | null = null;
  private pillsEl: HTMLElement | null = null;
  private addBtn: HTMLButtonElement | null = null;
  private addLabelEl: HTMLElement | null = null;
  private waLinkEl: HTMLAnchorElement | null = null;
  private msgEl: HTMLElement | null = null;
  private relatedEl: HTMLElement | null = null;
  private sizeGuideBtn: HTMLButtonElement | null = null;
  private sizeGuideLabelEl: HTMLElement | null = null;
  private sizeGuideDialog: HTMLDialogElement | null = null;

  private currentCtx: QuickViewContext | null = null;
  private currentVariantId: number | null = null;
  private activePhotoIndex = 0;
  private resetBtnTimer: number | null = null;
  private returnFocusEl: HTMLElement | null = null;

  constructor(bag: StylingBag) {
    this.bag = bag;
  }

  public initDOM(): void {
    this.pdpEl = document.getElementById('pdp-view');
    this.sizeGuideDialog = document.getElementById('sizeguide-dialog') as HTMLDialogElement | null;

    this.renderSizeGuideTables();
    storeState.subscribe(() => {
      this.renderSizeGuideTables();
      if (this.pdpEl && !this.pdpEl.hidden && this.currentCtx) {
        this.renderCurrentProduct(this.currentCtx, false);
      }
    });

    if (this.sizeGuideDialog) {
      this.sizeGuideDialog
        .querySelector('[data-sg-close]')
        ?.addEventListener('click', () => this.sizeGuideDialog?.close());

      this.sizeGuideDialog.addEventListener('click', (e) => {
        if (!this.sizeGuideDialog) return;
        const rect = this.sizeGuideDialog.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          this.sizeGuideDialog.close();
        }
      });

      this.sizeGuideDialog.querySelectorAll<HTMLElement>('[data-sg-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
          this.selectSizeGuideTab(tab.dataset.sgTab || 'apparel');
        });
      });
    }

    if (!this.pdpEl) return;

    this.stageEl = this.pdpEl.querySelector('[data-pdp-stage]');
    this.imgEl = this.pdpEl.querySelector('[data-pdp-main-img]');
    this.thumbsEl = this.pdpEl.querySelector('[data-pdp-thumbs]');
    this.tagEl = this.pdpEl.querySelector('[data-pdp-tag]');
    this.tagTextEl = this.pdpEl.querySelector('[data-pdp-tag-text]');
    this.breadcrumbEl = this.pdpEl.querySelector('[data-pdp-breadcrumb]');
    this.kickerEl = this.pdpEl.querySelector('[data-pdp-kicker]');
    this.skuEl = this.pdpEl.querySelector('[data-pdp-sku]');
    this.titleEl = this.pdpEl.querySelector('[data-pdp-title]');
    this.priceEl = this.pdpEl.querySelector('[data-pdp-price]');
    this.lookNoteEl = this.pdpEl.querySelector('[data-pdp-look]');
    this.fabricEl = this.pdpEl.querySelector('[data-pdp-fabric]');
    this.optLegendEl = this.pdpEl.querySelector('[data-pdp-legend]');
    this.pillsEl = this.pdpEl.querySelector('[data-pdp-pills]');
    this.addBtn = this.pdpEl.querySelector('[data-pdp-add]');
    this.addLabelEl = this.pdpEl.querySelector('[data-pdp-add-label]');
    this.waLinkEl = this.pdpEl.querySelector('[data-pdp-whatsapp]');
    this.msgEl = this.pdpEl.querySelector('[data-pdp-msg]');
    this.relatedEl = this.pdpEl.querySelector('[data-pdp-related]');
    this.sizeGuideBtn = this.pdpEl.querySelector('[data-pdp-sizeguide]');
    this.sizeGuideLabelEl = this.pdpEl.querySelector('[data-pdp-sizeguide-label]');

    this.pdpEl.querySelectorAll<HTMLElement>('[data-pdp-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.close());
    });

    this.pdpEl.querySelector('[data-pdp-open-bag]')?.addEventListener('click', () => {
      this.close();
      this.bag.openDrawer();
    });

    this.sizeGuideBtn?.addEventListener('click', () => this.openSizeGuide());
    this.addBtn?.addEventListener('click', () => this.handleAdd());

    // Smooth hover & tap weave inspection zoom on PDP hero image
    if (this.stageEl) {
      this.stageEl.addEventListener('mousemove', (e) => {
        if (!this.stageEl) return;
        const rect = this.stageEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        this.stageEl.style.setProperty('--zoom-x', `${x.toFixed(1)}%`);
        this.stageEl.style.setProperty('--zoom-y', `${y.toFixed(1)}%`);
        this.stageEl.classList.add('is-zooming');
      });
      this.stageEl.addEventListener('mouseleave', () => {
        this.stageEl?.classList.remove('is-zooming', 'is-zoom-locked');
      });
      this.stageEl.addEventListener('click', (e) => {
        if (!this.stageEl) return;
        const rect = this.stageEl.getBoundingClientRect();
        if (rect.width && rect.height) {
          const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
          const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
          this.stageEl.style.setProperty('--zoom-x', `${x.toFixed(1)}%`);
          this.stageEl.style.setProperty('--zoom-y', `${y.toFixed(1)}%`);
        }
        this.stageEl.classList.toggle('is-zoom-locked');
      });
    }

    this.pillsEl?.addEventListener('change', (e) => {
      const target = e.target as HTMLElement | null;
      const radio = target?.closest<HTMLInputElement>('input[name="pdp-size"]');
      if (!radio || !this.currentCtx) return;

      const item = storeState.getProductById(this.currentCtx.productId);
      if (!item) return;

      const variant = item.variants.find((v) => v.a && v.o[0] === radio.value);
      this.currentVariantId = variant ? variant.id : null;
      this.updateAddButtonState(item.price, false);
      this.updateWhatsappLink(item, radio.value);

      if (this.currentCtx.cardEl && variant) {
        const cardRadio = this.currentCtx.cardEl.querySelector<HTMLInputElement>(
          `input[data-rw-option][value="${CSS.escape(radio.value)}"]`
        );
        if (cardRadio && !cardRadio.checked) {
          cardRadio.checked = true;
          cardRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    this.thumbsEl?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-pdp-thumb-idx]');
      if (!btn || !this.currentCtx) return;
      const item = storeState.getProductById(this.currentCtx.productId);
      if (!item) return;
      const idx = Number(btn.dataset.pdpThumbIdx || 0);
      this.setGalleryPhoto(item, idx);
    });

    this.relatedEl?.addEventListener('click', (e) => {
      const cardBtn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-pdp-related-id]');
      if (!cardBtn) return;
      const nextId = cardBtn.dataset.pdpRelatedId;
      if (!nextId) return;
      this.open({ productId: nextId }, cardBtn);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!this.pdpEl || this.pdpEl.hidden) return;
      if (this.sizeGuideDialog?.open) return;
      const bagDialog = document.getElementById('bag-dialog') as HTMLDialogElement | null;
      if (bagDialog?.open) return;
      e.preventDefault();
      this.close();
    });
  }

  private renderSizeGuideTables(): void {
    if (!this.sizeGuideDialog) return;
    const sg = storeState.getSizeGuide();

    const apparelBody = this.sizeGuideDialog.querySelector('[data-sg-body="apparel"]');
    if (apparelBody) {
      apparelBody.innerHTML = sg.apparel
        .map(
          (row) => `
          <tr>
            <td><strong>${escapeHtml(row.size)}</strong></td>
            <td>${escapeHtml(row.chest)}</td>
            <td>${escapeHtml(row.shoulder)}</td>
            <td>${escapeHtml(row.sleeve)}</td>
            <td>${escapeHtml(row.waist)}</td>
            <td>${escapeHtml(row.length)}</td>
          </tr>
        `
        )
        .join('');
    }

    const trousersBody = this.sizeGuideDialog.querySelector('[data-sg-body="trousers"]');
    if (trousersBody) {
      trousersBody.innerHTML = sg.trousers
        .map(
          (row) => `
          <tr>
            <td><strong>${escapeHtml(row.size)}</strong></td>
            <td>${escapeHtml(row.waist)}</td>
            <td>${escapeHtml(row.hip)}</td>
            <td>${escapeHtml(row.inseam)}</td>
            <td>${escapeHtml(row.legOpening)}</td>
          </tr>
        `
        )
        .join('');
    }

    const shoesBody = this.sizeGuideDialog.querySelector('[data-sg-body="shoes"]');
    if (shoesBody) {
      shoesBody.innerHTML = sg.shoes
        .map(
          (row) => `
          <tr>
            <td><strong>${escapeHtml(row.eu)}</strong></td>
            <td>${escapeHtml(row.us)}</td>
            <td>${escapeHtml(row.uk)}</td>
            <td>${escapeHtml(row.cm)}</td>
          </tr>
        `
        )
        .join('');
    }

    const noteEl = this.sizeGuideDialog.querySelector('[data-sg-note]');
    if (noteEl) {
      noteEl.textContent = sg.note;
    }
  }

  private selectSizeGuideTab(tabId: string): void {
    if (!this.sizeGuideDialog) return;
    this.sizeGuideDialog.querySelectorAll<HTMLElement>('[data-sg-tab]').forEach((tab) => {
      const selected = tab.dataset.sgTab === tabId;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    this.sizeGuideDialog.querySelectorAll<HTMLElement>('[data-sg-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.sgPanel !== tabId;
    });
  }

  private openSizeGuide(): void {
    if (!this.sizeGuideDialog) return;
    this.renderSizeGuideTables();
    const item = this.currentCtx ? storeState.getProductById(this.currentCtx.productId) : null;
    const tabId =
      item?.category === 'bottoms'
        ? 'trousers'
        : item?.category === 'footwear'
          ? 'shoes'
          : 'apparel';
    this.selectSizeGuideTab(tabId);
    if (!this.sizeGuideDialog.open) {
      this.sizeGuideDialog.showModal();
    }
  }

  private setGalleryPhoto(item: CatalogItem, index: number): void {
    const gallery = storeState.getProductGallery(item);
    const safeIdx = Math.max(0, Math.min(index, Math.max(0, gallery.length - 1)));
    this.activePhotoIndex = safeIdx;
    const src = gallery[safeIdx] || item.image;

    if (this.imgEl) {
      this.imgEl.src = src;
      this.imgEl.alt = `${item.name} — View ${safeIdx + 1}`;
    }
    this.stageEl?.classList.remove('is-zooming', 'is-zoom-locked');

    if (this.thumbsEl) {
      this.thumbsEl.querySelectorAll<HTMLButtonElement>('[data-pdp-thumb-idx]').forEach((btn, i) => {
        const isCurrent = i === safeIdx;
        btn.classList.toggle('is-active', isCurrent);
        btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
      });
    }
  }

  private updateWhatsappLink(item: CatalogItem, selectedSize: string): void {
    if (!this.waLinkEl) return;
    const waDigits = sanitizeWhatsappDigits(storeState.getStoreWhatsapp());
    const sku = storeState.getProductSku(item);
    const msg = [
      `Assalam-o-Alaikum GR SON'S Atelier,`,
      `I would like to order directly on WhatsApp:`,
      `• Garment: ${item.name}`,
      `• SKU: ${sku}`,
      `• Size: ${selectedSize || item.sizes[0] || 'Standard'}`,
      `• Price: ${formatMoney(item.price)}`,
      ``,
      `Please confirm availability and Cash on Delivery dispatch.`,
    ].join('\n');
    this.waLinkEl.href = `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`;
  }

  private renderRelatedPieces(current: CatalogItem): void {
    if (!this.relatedEl) return;

    const picked: CatalogItem[] = [];
    const seen = new Set<string>([current.id]);

    // 1. Prioritize pieces worn together in any 3D Runway look featuring this item
    for (const look of storeState.getLooks()) {
      const includesCurrent = look.pieces.some((p) => p.productId === current.id);
      if (!includesCurrent) continue;
      for (const piece of look.pieces) {
        if (seen.has(piece.productId)) continue;
        const resolved = storeState.getProductById(piece.productId);
        if (resolved) {
          seen.add(resolved.id);
          picked.push(resolved);
        }
      }
    }

    // 2. Fill remaining up to 4 items from complementary categories
    const all = storeState.getProducts();
    const complementaryOrder: CatalogItem[] = [
      ...all.filter((p) => p.storeCategory !== current.storeCategory),
      ...all.filter((p) => p.storeCategory === current.storeCategory),
    ];
    for (const cand of complementaryOrder) {
      if (picked.length >= 4) break;
      if (seen.has(cand.id)) continue;
      seen.add(cand.id);
      picked.push(cand);
    }

    this.relatedEl.innerHTML = picked
      .slice(0, 4)
      .map((rel) => {
        const catLabel = storeState.getCategoryLabel(rel.storeCategory);
        return `
          <button
            type="button"
            class="pdp-related-card"
            data-pdp-related-id="${escapeHtml(rel.id)}"
          >
            <div class="pdp-related-media">
              <img
                src="${escapeHtml(rel.image)}"
                alt="${escapeHtml(rel.name)}"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
              />
            </div>
            <div class="pdp-related-info">
              <span class="pdp-related-cat">${escapeHtml(catLabel)}</span>
              <strong class="pdp-related-name">${escapeHtml(rel.name)}</strong>
              <span class="pdp-related-price">${formatMoney(rel.price)}</span>
            </div>
          </button>
        `;
      })
      .join('');
  }

  private renderCurrentProduct(ctx: QuickViewContext, resetPhotoAndSize: boolean): void {
    const item = storeState.getProductById(ctx.productId);
    if (!item) return;

    const gallery = storeState.getProductGallery(item);
    if (resetPhotoAndSize) {
      this.activePhotoIndex = 0;
    } else if (this.activePhotoIndex >= gallery.length) {
      this.activePhotoIndex = 0;
    }

    if (this.thumbsEl) {
      if (gallery.length > 0) {
        this.thumbsEl.innerHTML = gallery
          .map(
            (src, idx) => `
              <button
                type="button"
                class="pdp-thumb-btn${idx === this.activePhotoIndex ? ' is-active' : ''}"
                data-pdp-thumb-idx="${idx}"
                aria-label="View angle ${idx + 1} for ${escapeHtml(item.name)}"
                aria-pressed="${idx === this.activePhotoIndex ? 'true' : 'false'}"
              >
                <img src="${escapeHtml(src)}" alt="${escapeHtml(item.name)} angle ${idx + 1}" decoding="async" referrerpolicy="no-referrer" />
                <span>${idx === 0 ? 'Main' : `0${idx + 1}`}</span>
              </button>
            `
          )
          .join('');
        this.thumbsEl.hidden = false;
      } else {
        this.thumbsEl.innerHTML = '';
        this.thumbsEl.hidden = true;
      }
    }

    this.setGalleryPhoto(item, this.activePhotoIndex);

    if (this.tagEl && this.tagTextEl) {
      if (ctx.tag) {
        this.tagEl.hidden = false;
        this.tagTextEl.textContent = ctx.tag;
      } else {
        this.tagEl.hidden = true;
      }
    }

    const catLabel = storeState.getCategoryLabel(item.storeCategory);

    if (this.breadcrumbEl) {
      this.breadcrumbEl.textContent = `Collection / ${catLabel} / ${item.name}`;
    }
    if (this.kickerEl) {
      this.kickerEl.textContent = `${item.vendor} · ${catLabel}`;
    }
    if (this.skuEl) {
      this.skuEl.textContent = `SKU: ${storeState.getProductSku(item)}`;
    }
    if (this.titleEl) this.titleEl.textContent = item.name;
    if (this.priceEl) this.priceEl.textContent = formatMoney(item.price);
    if (this.lookNoteEl) {
      this.lookNoteEl.textContent = ctx.lookLabel
        ? `Featured in ${ctx.lookLabel} · In Stock for Express COD`
        : 'Flagship Atelier Release · Ready for Nationwide Cash on Delivery';
    }
    if (this.fabricEl) {
      this.fabricEl.textContent = storeState.getProductFabricNotes(item);
    }
    if (this.optLegendEl) this.optLegendEl.textContent = item.optionName;
    if (this.sizeGuideLabelEl) {
      this.sizeGuideLabelEl.textContent =
        item.category === 'footwear'
          ? 'Footwear Size Chart (EU 40–46)'
          : item.category === 'bottoms'
            ? 'Trousers Size Chart (28–34)'
            : 'Apparel Size Guide (S–XL)';
    }
    if (resetPhotoAndSize && this.msgEl) {
      this.msgEl.textContent = '';
    }

    const targetVariantId = resetPhotoAndSize ? ctx.selectedVariantId : this.currentVariantId ?? undefined;
    const chosenVariant =
      (targetVariantId
        ? item.variants.find((v) => v.id === targetVariantId && v.a)
        : item.variants.find((v) => v.a)) || item.variants[0];

    this.currentVariantId = chosenVariant?.a ? chosenVariant.id : null;
    const chosenSize = chosenVariant?.o[0] || item.sizes[0] || '';

    if (this.pillsEl) {
      this.pillsEl.innerHTML = '';
      for (const size of item.sizes) {
        const available = Boolean(item.variants.find((v) => v.o[0] === size)?.a);
        const label = document.createElement('label');
        label.className = `rw__pill${available ? '' : ' is-unavailable'}`;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'pdp-size';
        input.value = size;
        input.checked = size === chosenSize;
        input.disabled = !available;

        const span = document.createElement('span');
        span.className = 'rw__pill-label';
        span.textContent = size;

        label.append(input, span);
        this.pillsEl.appendChild(label);
      }
    }

    this.updateAddButtonState(item.price, false);
    this.updateWhatsappLink(item, chosenSize);
    this.renderRelatedPieces(item);
  }

  public open(ctx: QuickViewContext, triggerEl?: HTMLElement | null): void {
    if (!this.pdpEl) return;
    const item = storeState.getProductById(ctx.productId);
    if (!item) return;

    const wasClosed = this.pdpEl.hidden;
    if (wasClosed) {
      this.returnFocusEl = triggerEl || (document.activeElement as HTMLElement | null);
    }
    this.currentCtx = ctx;

    if (this.resetBtnTimer !== null) {
      window.clearTimeout(this.resetBtnTimer);
      this.resetBtnTimer = null;
    }

    this.renderCurrentProduct(ctx, true);

    this.pdpEl.hidden = false;
    document.documentElement.classList.add('pdp-open');
    this.pdpEl.scrollTop = 0;

    const backBtn = this.pdpEl.querySelector<HTMLElement>('[data-pdp-close]');
    if (wasClosed && backBtn) {
      window.setTimeout(() => backBtn.focus({ preventScroll: true }), 40);
    }
  }

  public close(): void {
    if (!this.pdpEl || this.pdpEl.hidden) return;
    this.pdpEl.hidden = true;
    document.documentElement.classList.remove('pdp-open');
    this.stageEl?.classList.remove('is-zooming', 'is-zoom-locked');

    if (this.resetBtnTimer !== null) {
      window.clearTimeout(this.resetBtnTimer);
      this.resetBtnTimer = null;
    }
    if (this.returnFocusEl && this.returnFocusEl.isConnected) {
      this.returnFocusEl.focus({ preventScroll: true });
    }
    this.returnFocusEl = null;
  }

  private updateAddButtonState(price: number, added: boolean): void {
    if (!this.addBtn || !this.addLabelEl) return;
    if (added) {
      this.addBtn.classList.add('is-added');
      this.addBtn.disabled = false;
      this.addLabelEl.textContent = 'Added to Shopping Bag ✓';
    } else {
      this.addBtn.classList.remove('is-added');
      if (this.currentVariantId === null) {
        this.addBtn.disabled = true;
        this.addLabelEl.textContent = 'Sold out';
      } else {
        this.addBtn.disabled = false;
        this.addLabelEl.textContent = `Add to Shopping Bag — ${formatMoney(price)}`;
      }
    }
  }

  private handleAdd(): void {
    if (!this.currentCtx || this.currentVariantId === null) {
      if (this.msgEl) this.msgEl.textContent = 'Please choose an available size.';
      return;
    }
    const item = storeState.getProductById(this.currentCtx.productId);
    if (!item) return;

    if (this.msgEl) this.msgEl.textContent = '';
    try {
      this.bag.add([{ id: this.currentVariantId, quantity: 1 }]);
      this.updateAddButtonState(item.price, true);
      this.currentCtx.onAdded?.(this.currentCtx.cardEl || null, this.currentVariantId);
      if (this.resetBtnTimer !== null) {
        window.clearTimeout(this.resetBtnTimer);
      }
      this.resetBtnTimer = window.setTimeout(() => {
        this.updateAddButtonState(item.price, false);
        this.resetBtnTimer = null;
      }, 1800);
    } catch (err) {
      if (this.msgEl) {
        this.msgEl.textContent =
          err instanceof Error ? err.message : 'Couldn’t add to bag. Please try again.';
      }
    }
  }
}
