import { StoreCategory, StoreOrderItem, formatMoney } from '../data/catalog.ts';
import { sanitizeWhatsappDigits, storeState } from '../data/storeState.ts';

interface BagEntry {
  id: number;
  quantity: number;
}

interface VariantRecord {
  id: number;
  a: boolean;
  o: string[];
  item: {
    id: string;
    name: string;
    price: number;
    image: string;
    url: string;
    storeCategory: Exclude<StoreCategory, 'all'>;
  };
}

interface ConfirmedOrder {
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  itemsSummary: string[];
  items: StoreOrderItem[];
  subtotal: number;
  delivery: number;
  total: number;
}

const STORAGE_KEY = 'runway-styling-bag-v3';
const MAX_ENTRIES = 50;
const MAX_QTY = 20;
const FREE_DELIVERY_THRESHOLD = 25000;
const DELIVERY_FEE = 500;

export class StylingBag {
  private entries: BagEntry[] = [];
  private variantMap = new Map<number, VariantRecord>();
  private dialog: HTMLDialogElement | null = null;
  private itemsEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private subtotalEl: HTMLElement | null = null;
  private deliveryEl: HTMLElement | null = null;
  private totalEl: HTMLElement | null = null;
  private shipBarEl: HTMLElement | null = null;
  private shipTextEl: HTMLElement | null = null;
  private shipFillEl: HTMLElement | null = null;
  private codForm: HTMLFormElement | null = null;
  private codNameEl: HTMLInputElement | null = null;
  private codPhoneEl: HTMLInputElement | null = null;
  private codAddressEl: HTMLTextAreaElement | null = null;
  private codErrorEl: HTMLElement | null = null;
  private codConfirmEl: HTMLElement | null = null;
  private codOrderNumberEl: HTMLElement | null = null;
  private codOrderMetaEl: HTMLElement | null = null;
  private codOrderReceiptEl: HTMLElement | null = null;
  private codWhatsappBtn: HTMLAnchorElement | null = null;
  private codContinueBtn: HTMLButtonElement | null = null;
  private exportBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private toastTimer: number | null = null;
  private lastConfirmedOrder: ConfirmedOrder | null = null;
  private onQuickView: ((productId: string, variantId?: number) => void) | null = null;

  constructor() {
    this.loadCatalog();
    this.entries = this.readStorage();
    storeState.subscribe(() => {
      this.loadCatalog();
      this.render();
    });
  }

  public setQuickViewHandler(handler: (productId: string, variantId?: number) => void): void {
    this.onQuickView = handler;
  }

  private loadCatalog(): void {
    const items = storeState.getShoppableItems();
    if (!Array.isArray(items)) {
      throw new Error('The product list could not load.');
    }
    this.variantMap.clear();
    for (const item of items) {
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.price !== 'number' ||
        !Number.isFinite(item.price) ||
        item.price < 0 ||
        !Array.isArray(item.variants)
      ) {
        continue;
      }
      for (const variant of item.variants) {
        if (
          !variant ||
          !Number.isSafeInteger(variant.id) ||
          typeof variant.a !== 'boolean' ||
          !Array.isArray(variant.o) ||
          variant.o.some((v) => typeof v !== 'string')
        ) {
          continue;
        }
        this.variantMap.set(variant.id, {
          id: variant.id,
          a: variant.a,
          o: variant.o,
          item: {
            id: item.id,
            name: item.name,
            price: item.price,
            image: item.image,
            url: item.url,
            storeCategory: item.storeCategory,
          },
        });
      }
    }
  }

  private readStorage(): BagEntry[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const result: BagEntry[] = [];
      for (const entry of parsed) {
        if (result.length >= MAX_ENTRIES) break;
        if (
          entry &&
          typeof entry === 'object' &&
          Number.isSafeInteger((entry as BagEntry).id) &&
          Number.isSafeInteger((entry as BagEntry).quantity) &&
          (entry as BagEntry).quantity >= 1 &&
          (entry as BagEntry).quantity <= MAX_QTY &&
          this.variantMap.has((entry as BagEntry).id)
        ) {
          result.push({
            id: (entry as BagEntry).id,
            quantity: (entry as BagEntry).quantity,
          });
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  private writeStorage(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // ignore storage errors
    }
  }

  public initDOM(): void {
    this.dialog = document.getElementById('bag-dialog') as HTMLDialogElement | null;
    this.itemsEl = document.getElementById('bag-items');
    this.summaryEl = document.getElementById('bag-summary');
    this.subtotalEl = document.getElementById('bag-subtotal');
    this.deliveryEl = document.getElementById('bag-delivery');
    this.totalEl = document.getElementById('bag-total');
    this.shipBarEl = document.querySelector('[data-bag-ship-bar]');
    this.shipTextEl = document.querySelector('[data-bag-ship-text]');
    this.shipFillEl = document.querySelector('[data-bag-ship-fill]');
    this.codForm = document.getElementById('cod-checkout-form') as HTMLFormElement | null;
    this.codNameEl = document.getElementById('cod-name') as HTMLInputElement | null;
    this.codPhoneEl = document.getElementById('cod-phone') as HTMLInputElement | null;
    this.codAddressEl = document.getElementById('cod-address') as HTMLTextAreaElement | null;
    this.codErrorEl = document.getElementById('cod-error');
    this.codConfirmEl = document.getElementById('cod-confirmation');
    this.codOrderNumberEl = document.getElementById('cod-order-number');
    this.codOrderMetaEl = document.getElementById('cod-order-meta');
    this.codOrderReceiptEl = document.getElementById('cod-order-receipt');
    this.codWhatsappBtn = document.getElementById('cod-whatsapp-receipt') as HTMLAnchorElement | null;
    this.codContinueBtn = document.getElementById('cod-continue') as HTMLButtonElement | null;
    this.exportBtn = document.getElementById('export-bag') as HTMLButtonElement | null;
    this.statusEl = document.getElementById('bag-status');

    const openBtn = document.getElementById('open-bag');
    const closeBtn = document.getElementById('close-bag');
    openBtn?.addEventListener('click', () => this.openDrawer());
    closeBtn?.addEventListener('click', () => this.closeDrawer());

    this.dialog?.addEventListener('click', (e) => {
      if (this.dialog && e.target === this.dialog) {
        this.closeDrawer();
      }
    });

    this.dialog?.addEventListener('close', () => {
      this.dialog?.remove();
    });

    this.codForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCodCheckout();
    });

    this.codContinueBtn?.addEventListener('click', () => {
      this.lastConfirmedOrder = null;
      this.render();
      this.closeDrawer();
    });

    this.exportBtn?.addEventListener('click', () => this.exportShortlist());
    this.render();

    if (this.dialog && !this.dialog.open) {
      this.dialog.remove();
    }
  }

  public openDrawer(): void {
    if (this.dialog && !this.dialog.isConnected) {
      document.body.appendChild(this.dialog);
    }
    this.render();
    if (this.dialog && !this.dialog.open) {
      this.dialog.showModal();
    }
  }

  public closeDrawer(): void {
    if (this.dialog?.open) {
      this.dialog.close();
    } else {
      this.dialog?.remove();
    }
  }

  public add(items: BagEntry[]): void {
    if (!Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
      const record = this.variantMap.get(item.id);
      if (!record || !record.a) {
        throw new Error('Please choose an available size.');
      }
    }

    this.lastConfirmedOrder = null;
    for (const item of items) {
      const qty = Math.max(1, Math.min(MAX_QTY, Math.round(item.quantity || 1)));
      const existing = this.entries.find((e) => e.id === item.id);
      if (existing) {
        existing.quantity = Math.min(MAX_QTY, existing.quantity + qty);
      } else if (this.entries.length < MAX_ENTRIES) {
        this.entries.push({ id: item.id, quantity: qty });
      }
    }

    this.writeStorage();
    this.render();
    this.toast(items.length > 1 ? 'Look added to Shopping Bag' : 'Item added to Shopping Bag');
  }

  public setQuantity(variantId: number, quantity: number): void {
    if (quantity <= 0) {
      this.remove(variantId);
      return;
    }
    const clamped = Math.min(MAX_QTY, Math.max(1, Math.round(quantity)));
    const existing = this.entries.find((e) => e.id === variantId);
    if (existing) {
      existing.quantity = clamped;
      this.writeStorage();
      this.render();
    }
  }

  public remove(variantId: number): void {
    this.entries = this.entries.filter((e) => e.id !== variantId);
    this.writeStorage();
    this.render();
  }

  public getTotalCount(): number {
    return this.entries.reduce((sum, e) => sum + e.quantity, 0);
  }

  public toast(message: string): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.classList.add('is-on');
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.statusEl?.classList.remove('is-on');
      this.toastTimer = null;
    }, 2500);
  }

  private computeSubtotal(): number {
    let subtotal = 0;
    for (const entry of this.entries) {
      const record = this.variantMap.get(entry.id);
      if (record) {
        subtotal += record.item.price * entry.quantity;
      }
    }
    return subtotal;
  }

  private handleCodCheckout(): void {
    if (!this.codNameEl || !this.codPhoneEl || !this.codAddressEl || !this.codErrorEl || this.entries.length === 0) {
      return;
    }
    const name = this.codNameEl.value.trim();
    const phone = this.codPhoneEl.value.trim();
    const address = this.codAddressEl.value.trim();

    if (name.length < 2) {
      this.codErrorEl.textContent = 'Please enter your full name for delivery.';
      this.codNameEl.focus();
      return;
    }
    if (!/^[\d+\-\s()]{7,20}$/.test(phone)) {
      this.codErrorEl.textContent = 'Please enter a valid contact phone number.';
      this.codPhoneEl.focus();
      return;
    }
    if (address.length < 8) {
      this.codErrorEl.textContent = 'Please enter your full street address and postal code.';
      this.codAddressEl.focus();
      return;
    }

    this.codErrorEl.textContent = '';

    const subtotal = this.computeSubtotal();
    const delivery = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const total = subtotal + delivery;
    const itemsSummary: string[] = [];
    const orderItems: StoreOrderItem[] = [];

    for (const entry of this.entries) {
      const record = this.variantMap.get(entry.id);
      if (!record) continue;
      const size = record.o[0] ?? '';
      const lineTotal = record.item.price * entry.quantity;
      itemsSummary.push(
        `${record.item.name} (${size}) × ${entry.quantity} — ${formatMoney(lineTotal)}`
      );
      orderItems.push({
        productId: record.item.id,
        name: record.item.name,
        size,
        quantity: entry.quantity,
        unitPrice: record.item.price,
        totalPrice: lineTotal,
        storeCategory: record.item.storeCategory,
      });
    }

    const orderNumber = `GR-${Math.floor(1000 + Math.random() * 9000)}`;
    this.lastConfirmedOrder = {
      orderNumber,
      customerName: name,
      phone,
      address,
      itemsSummary,
      items: orderItems,
      subtotal,
      delivery,
      total,
    };

    // Persist live order & sync to JSONBin Cloud so owner sees it immediately across devices
    void storeState.placeOrder({
      orderNumber,
      customerName: name,
      phone,
      address,
      items: orderItems,
      subtotal,
      delivery,
      total,
    });

    this.entries = [];
    this.writeStorage();
    this.codForm?.reset();
    this.render();
    this.toast(`Order #${orderNumber} confirmed for Cash on Delivery`);
  }

  private buildWhatsappReceiptUrl(order: ConfirmedOrder): string {
    const storeDigits = sanitizeWhatsappDigits(storeState.getStoreWhatsapp());
    const itemLines = order.itemsSummary.map((line, i) => `${i + 1}. ${line}`).join('\n');
    const deliveryText = order.delivery === 0 ? 'Complimentary' : formatMoney(order.delivery);
    const message = [
      `Assalam-o-Alaikum *GR SON'S Atelier*,`,
      `I have placed a Cash on Delivery order:`,
      ``,
      `*Order ID:* #${order.orderNumber}`,
      `*Customer:* ${order.customerName}`,
      `*Phone:* ${order.phone}`,
      `*Delivery Address:* ${order.address}`,
      ``,
      `*Items Ordered:*`,
      itemLines,
      ``,
      `Subtotal: ${formatMoney(order.subtotal)}`,
      `Express Delivery: ${deliveryText}`,
      `*Total Cash on Delivery: ${formatMoney(order.total)}*`,
    ].join('\n');
    return `https://wa.me/${storeDigits}?text=${encodeURIComponent(message)}`;
  }

  public render(): void {
    const count = this.getTotalCount();
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = String(count);
    });
    this.dialog?.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = String(count);
    });

    if (!this.itemsEl || !this.exportBtn) return;

    if (this.lastConfirmedOrder && this.codConfirmEl) {
      this.itemsEl.innerHTML = '';
      this.itemsEl.hidden = true;
      if (this.summaryEl) this.summaryEl.hidden = true;
      if (this.codForm) this.codForm.hidden = true;
      if (this.shipBarEl) this.shipBarEl.hidden = true;
      this.exportBtn.hidden = true;
      this.codConfirmEl.hidden = false;

      if (this.codOrderNumberEl) {
        this.codOrderNumberEl.textContent = `Order #${this.lastConfirmedOrder.orderNumber} Confirmed — Preparing Shipment`;
      }
      if (this.codOrderMetaEl) {
        this.codOrderMetaEl.textContent = `Cash on Delivery to ${this.lastConfirmedOrder.customerName} (${this.lastConfirmedOrder.phone}) · ${this.lastConfirmedOrder.address}`;
      }
      if (this.codOrderReceiptEl) {
        this.codOrderReceiptEl.innerHTML = '';
        const list = document.createElement('ul');
        list.className = 'cod-receipt-list';
        for (const line of this.lastConfirmedOrder.itemsSummary) {
          const li = document.createElement('li');
          li.textContent = line;
          list.appendChild(li);
        }
        const totalEl = document.createElement('p');
        totalEl.className = 'cod-receipt-total';
        totalEl.textContent = `Total Due on Delivery: ${formatMoney(this.lastConfirmedOrder.total)}`;
        this.codOrderReceiptEl.append(list, totalEl);
      }
      if (this.codWhatsappBtn) {
        this.codWhatsappBtn.hidden = false;
        this.codWhatsappBtn.href = this.buildWhatsappReceiptUrl(this.lastConfirmedOrder);
      }
      return;
    }

    if (this.codConfirmEl) this.codConfirmEl.hidden = true;
    this.itemsEl.hidden = false;
    if (this.shipBarEl) this.shipBarEl.hidden = false;
    this.exportBtn.hidden = false;
    this.itemsEl.innerHTML = '';

    if (this.entries.length === 0) {
      const emptyNote = document.createElement('p');
      emptyNote.className = 'bag-note';
      emptyNote.textContent =
        'Your shopping bag is currently empty. Select any garment from the runway or catalog to add it.';
      this.itemsEl.appendChild(emptyNote);
      if (this.summaryEl) this.summaryEl.hidden = true;
      if (this.codForm) this.codForm.hidden = true;
      if (this.shipTextEl) {
        this.shipTextEl.textContent = `Complimentary Express Courier on orders over ${formatMoney(FREE_DELIVERY_THRESHOLD)}`;
      }
      if (this.shipFillEl) this.shipFillEl.style.width = '0%';
      this.exportBtn.disabled = true;
      return;
    }

    let subtotal = 0;
    for (const entry of this.entries) {
      const record = this.variantMap.get(entry.id);
      if (!record) continue;
      const lineTotal = record.item.price * entry.quantity;
      subtotal += lineTotal;

      const row = document.createElement('div');
      row.className = 'bag-row';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'bag-thumb-wrap';

      const img = document.createElement('img');
      img.src = record.item.image;
      img.alt = record.item.name;
      img.width = 64;
      img.height = 85;
      img.loading = 'lazy';
      img.decoding = 'async';
      thumbWrap.appendChild(img);

      const details = document.createElement('div');
      details.className = 'bag-row-details';

      const title = document.createElement('h3');
      title.textContent = record.item.name;

      const meta = document.createElement('p');
      meta.className = 'bag-row-meta';
      meta.textContent = `Size ${record.o[0] ?? ''} · ${formatMoney(lineTotal)}`;

      const actions = document.createElement('div');
      actions.className = 'bag-row-actions';

      const stepper = document.createElement('div');
      stepper.className = 'bag-stepper';

      const decBtn = document.createElement('button');
      decBtn.type = 'button';
      decBtn.className = 'bag-step-btn';
      decBtn.setAttribute('aria-label', `Decrease quantity of ${record.item.name}`);
      decBtn.textContent = '−';
      decBtn.addEventListener('click', () => this.setQuantity(entry.id, entry.quantity - 1));

      const qtyVal = document.createElement('span');
      qtyVal.className = 'bag-step-val';
      qtyVal.textContent = String(entry.quantity);

      const incBtn = document.createElement('button');
      incBtn.type = 'button';
      incBtn.className = 'bag-step-btn';
      incBtn.setAttribute('aria-label', `Increase quantity of ${record.item.name}`);
      incBtn.textContent = '+';
      incBtn.addEventListener('click', () => this.setQuantity(entry.id, entry.quantity + 1));

      stepper.append(decBtn, qtyVal, incBtn);

      const qvBtn = document.createElement('button');
      qvBtn.type = 'button';
      qvBtn.className = 'bag-qv-btn';
      qvBtn.textContent = 'Quick View';
      qvBtn.addEventListener('click', () => {
        this.closeDrawer();
        this.onQuickView?.(record.item.id, entry.id);
      });

      actions.append(stepper, qvBtn);
      details.append(title, meta, actions);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'bag-remove';
      removeBtn.setAttribute('aria-label', `Remove ${record.item.name}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => this.remove(entry.id));

      row.append(thumbWrap, details, removeBtn);
      this.itemsEl.appendChild(row);
    }

    const delivery = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const total = subtotal + delivery;
    const progress = Math.min(100, Math.round((subtotal / FREE_DELIVERY_THRESHOLD) * 100));

    if (this.shipTextEl) {
      this.shipTextEl.textContent =
        delivery === 0
          ? 'Unlocked: Complimentary Express Atelier Delivery'
          : `Add ${formatMoney(FREE_DELIVERY_THRESHOLD - subtotal)} more for Complimentary Express Delivery`;
    }
    if (this.shipFillEl) this.shipFillEl.style.width = `${progress}%`;
    if (this.summaryEl) this.summaryEl.hidden = false;
    if (this.subtotalEl) this.subtotalEl.textContent = formatMoney(subtotal);
    if (this.deliveryEl) {
      this.deliveryEl.textContent = delivery === 0 ? 'Complimentary' : formatMoney(delivery);
    }
    if (this.totalEl) this.totalEl.textContent = formatMoney(total);
    if (this.codForm) this.codForm.hidden = false;
    this.exportBtn.disabled = false;
  }

  public exportShortlist(): void {
    if (this.entries.length === 0) return;
    const lines = ['RUNWAY — STYLING SHORTLIST', 'Order summary export', ''];
    for (const entry of this.entries) {
      const record = this.variantMap.get(entry.id);
      if (!record) continue;
      const size = record.o[0] ?? '';
      lines.push(
        `${record.item.name} · Size ${size} · Quantity ${entry.quantity} · ${formatMoney(record.item.price * entry.quantity)}`
      );
    }
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'runway-outfit-shortlist.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
