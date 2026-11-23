import { formatMoney } from '../data/catalog.ts';
import { storeState } from '../data/storeState.ts';
import { StylingBag } from './bag.ts';

export interface QuickViewContext {
  productId: string;
  lookLabel?: string;
  tag?: string;
  selectedVariantId?: number;
  cardEl?: HTMLElement | null;
  onAdded?: (cardEl: HTMLElement | null, variantId: number) => void;
}

export class QuickViewModal {
  private bag: StylingBag;
  private dialog: HTMLDialogElement | null = null;
  private imgEl: HTMLImageElement | null = null;
  private tagEl: HTMLElement | null = null;
  private tagTextEl: HTMLElement | null = null;
  private kickerEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private priceEl: HTMLElement | null = null;
  private lookNoteEl: HTMLElement | null = null;
  private optLegendEl: HTMLElement | null = null;
  private pillsEl: HTMLElement | null = null;
  private addBtn: HTMLButtonElement | null = null;
  private addLabelEl: HTMLElement | null = null;
  private msgEl: HTMLElement | null = null;
  private openBagBtn: HTMLButtonElement | null = null;
  private sizeGuideBtn: HTMLButtonElement | null = null;
  private sizeGuideDialog: HTMLDialogElement | null = null;

  private currentCtx: QuickViewContext | null = null;
  private currentVariantId: number | null = null;
  private resetBtnTimer: number | null = null;
  private returnFocusEl: HTMLElement | null = null;

  constructor(bag: StylingBag) {
    this.bag = bag;
  }

  public initDOM(): void {
    this.dialog = document.getElementById('quickview-dialog') as HTMLDialogElement | null;
    if (!this.dialog) return;

    this.imgEl = this.dialog.querySelector('[data-qv-img]');
    this.tagEl = this.dialog.querySelector('[data-qv-tag]');
    this.tagTextEl = this.dialog.querySelector('[data-qv-tag-text]');
    this.kickerEl = this.dialog.querySelector('[data-qv-kicker]');
    this.titleEl = this.dialog.querySelector('[data-qv-title]');
    this.priceEl = this.dialog.querySelector('[data-qv-price]');
    this.lookNoteEl = this.dialog.querySelector('[data-qv-look]');
    this.optLegendEl = this.dialog.querySelector('[data-qv-legend]');
    this.pillsEl = this.dialog.querySelector('[data-qv-pills]');
    this.addBtn = this.dialog.querySelector('[data-qv-add]');
    this.addLabelEl = this.dialog.querySelector('[data-qv-add-label]');
    this.msgEl = this.dialog.querySelector('[data-qv-msg]');
    this.openBagBtn = this.dialog.querySelector('[data-qv-open-bag]');
    this.sizeGuideBtn = this.dialog.querySelector('[data-qv-sizeguide]');
    this.sizeGuideDialog = document.getElementById('sizeguide-dialog') as HTMLDialogElement | null;

    this.dialog.querySelector('[data-qv-close]')?.addEventListener('click', () => this.close());

    this.dialog.addEventListener('click', (e) => {
      if (!this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        this.close();
      }
    });

    this.dialog.addEventListener('close', () => {
      if (this.resetBtnTimer !== null) {
        window.clearTimeout(this.resetBtnTimer);
        this.resetBtnTimer = null;
      }
      if (this.returnFocusEl && this.returnFocusEl.isConnected) {
        this.returnFocusEl.focus({ preventScroll: true });
      }
      this.returnFocusEl = null;
    });

    this.pillsEl?.addEventListener('change', (e) => {
      const target = e.target as HTMLElement | null;
      const radio = target?.closest<HTMLInputElement>('input[name="qv-size"]');
      if (!radio || !this.currentCtx) return;

      const item = storeState.getProductById(this.currentCtx.productId);
      if (!item) return;

      const variant = item.variants.find((v) => v.a && v.o[0] === radio.value);
      this.currentVariantId = variant ? variant.id : null;
      this.updateAddButtonState(item.price, false);

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

    this.addBtn?.addEventListener('click', () => this.handleAdd());
    this.openBagBtn?.addEventListener('click', () => {
      this.close();
      this.bag.openDrawer();
    });
    this.sizeGuideBtn?.addEventListener('click', () => this.openSizeGuide());

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

  public open(ctx: QuickViewContext, triggerEl?: HTMLElement | null): void {
    if (!this.dialog) return;
    const item = storeState.getProductById(ctx.productId);
    if (!item) return;

    this.currentCtx = ctx;
    this.returnFocusEl = triggerEl || (document.activeElement as HTMLElement | null);

    if (this.resetBtnTimer !== null) {
      window.clearTimeout(this.resetBtnTimer);
      this.resetBtnTimer = null;
    }

    if (this.imgEl) {
      this.imgEl.src = item.image;
      this.imgEl.alt = item.name;
    }

    if (this.tagEl && this.tagTextEl) {
      if (ctx.tag) {
        this.tagEl.hidden = false;
        this.tagTextEl.textContent = ctx.tag;
      } else {
        this.tagEl.hidden = true;
      }
    }

    if (this.kickerEl) {
      const catLabel =
        item.category === 'footwear'
          ? 'Footwear'
          : item.category === 'bottoms'
            ? 'Pants & Denim'
            : 'Tops & Knitwear';
      this.kickerEl.textContent = `Quick View · ${catLabel}`;
    }

    if (this.titleEl) this.titleEl.textContent = item.name;
    if (this.priceEl) this.priceEl.textContent = formatMoney(item.price);
    if (this.lookNoteEl) {
      this.lookNoteEl.textContent = ctx.lookLabel
        ? `Featured in ${ctx.lookLabel}`
        : 'Featured in the Runway lookbook';
    }
    if (this.optLegendEl) this.optLegendEl.textContent = item.optionName;
    if (this.msgEl) this.msgEl.textContent = '';

    const chosenVariant =
      (ctx.selectedVariantId
        ? item.variants.find((v) => v.id === ctx.selectedVariantId && v.a)
        : item.variants.find((v) => v.a)) || item.variants[0];

    this.currentVariantId = chosenVariant?.a ? chosenVariant.id : null;
    const chosenSize = chosenVariant?.o[0] || item.sizes[0];

    if (this.pillsEl) {
      this.pillsEl.innerHTML = '';
      for (const size of item.sizes) {
        const available = Boolean(item.variants.find((v) => v.o[0] === size)?.a);
        const label = document.createElement('label');
        label.className = `rw__pill${available ? '' : ' is-unavailable'}`;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'qv-size';
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
    if (!this.dialog.open) {
      this.dialog.showModal();
    }
  }

  public close(): void {
    if (this.dialog?.open) {
      this.dialog.close();
    }
  }

  private updateAddButtonState(price: number, added: boolean): void {
    if (!this.addBtn || !this.addLabelEl) return;
    if (added) {
      this.addBtn.classList.add('is-added');
      this.addBtn.disabled = false;
      this.addLabelEl.textContent = 'Added to bag ✓';
    } else {
      this.addBtn.classList.remove('is-added');
      if (this.currentVariantId === null) {
        this.addBtn.disabled = true;
        this.addLabelEl.textContent = 'Sold out';
      } else {
        this.addBtn.disabled = false;
        this.addLabelEl.textContent = `Add to bag — ${formatMoney(price)}`;
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
