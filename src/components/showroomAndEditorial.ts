import { formatMoney, StoreOrder } from '../data/catalog.ts';
import { sanitizeWhatsappDigits, storeState } from '../data/storeState.ts';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class ShowroomAndEditorial {
  private fittingDialog: HTMLDialogElement | null = null;
  private fittingForm: HTMLFormElement | null = null;
  private fittingConfirm: HTMLElement | null = null;
  private fittingError: HTMLElement | null = null;

  private trackDialog: HTMLDialogElement | null = null;
  private trackForm: HTMLFormElement | null = null;
  private trackInput: HTMLInputElement | null = null;
  private trackSubmitBtn: HTMLButtonElement | null = null;
  private trackResultsEl: HTMLElement | null = null;

  public initDOM(): void {
    this.syncShowroomFromStore();
    storeState.subscribe(() => this.syncShowroomFromStore());

    this.fittingDialog = document.getElementById('fitting-dialog') as HTMLDialogElement | null;
    this.fittingForm = document.getElementById('fitting-form') as HTMLFormElement | null;
    this.fittingConfirm = document.getElementById('fitting-confirmation');
    this.fittingError = document.getElementById('fitting-error');

    this.trackDialog = document.getElementById('track-order-dialog') as HTMLDialogElement | null;
    this.trackForm = document.getElementById('track-order-form') as HTMLFormElement | null;
    this.trackInput = document.getElementById('track-order-input') as HTMLInputElement | null;
    this.trackSubmitBtn = document.getElementById('track-order-submit') as HTMLButtonElement | null;
    this.trackResultsEl = document.getElementById('track-order-results');

    const dateInput = document.getElementById('fitting-date') as HTMLInputElement | null;
    if (dateInput && !dateInput.value) {
      const tomorrow = new Date(Date.now() + 86_400_000);
      dateInput.value = tomorrow.toISOString().split('T')[0];
      dateInput.min = new Date().toISOString().split('T')[0];
    }

    document.querySelectorAll<HTMLElement>('[data-open-fitting]').forEach((btn) => {
      btn.addEventListener('click', () => this.openFittingDialog());
    });

    document.getElementById('fitting-close-btn')?.addEventListener('click', () => {
      this.fittingDialog?.close();
    });

    document.getElementById('fitting-done-btn')?.addEventListener('click', () => {
      this.fittingDialog?.close();
    });

    this.fittingDialog?.addEventListener('click', (e) => {
      if (this.fittingDialog && e.target === this.fittingDialog) {
        this.fittingDialog.close();
      }
    });

    this.fittingForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFittingSubmit();
    });

    // Order Tracking Modal triggers (header + footer)
    document.querySelectorAll<HTMLElement>('[data-open-track-order]').forEach((btn) => {
      btn.addEventListener('click', () => this.openTrackDialog());
    });

    document.getElementById('track-close-btn')?.addEventListener('click', () => {
      this.trackDialog?.close();
    });

    this.trackDialog?.addEventListener('click', (e) => {
      if (this.trackDialog && e.target === this.trackDialog) {
        this.trackDialog.close();
      }
    });

    this.trackForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleTrackSubmit();
    });
  }

  private syncShowroomFromStore(): void {
    const sr = storeState.getShowroom();
    const eyebrowEl = document.querySelector<HTMLElement>('[data-showroom-eyebrow]');
    const headingEl = document.querySelector<HTMLElement>('[data-showroom-heading]');
    const addressEl = document.querySelector<HTMLElement>('[data-showroom-address]');
    const timingsEl = document.querySelector<HTMLElement>('[data-showroom-timings]');
    const dirEl = document.querySelector<HTMLAnchorElement>('[data-showroom-directions]');
    const mapEl = document.querySelector<HTMLIFrameElement>('[data-showroom-map]');
    const floatingWaEl = document.getElementById('floating-whatsapp-btn') as HTMLAnchorElement | null;

    if (eyebrowEl && eyebrowEl.textContent !== sr.eyebrow) eyebrowEl.textContent = sr.eyebrow;
    if (headingEl && headingEl.textContent !== sr.heading) headingEl.textContent = sr.heading;
    if (addressEl && addressEl.textContent !== sr.address) addressEl.textContent = sr.address;
    if (timingsEl && timingsEl.textContent !== sr.timings) timingsEl.textContent = sr.timings;
    if (dirEl && dirEl.getAttribute('href') !== sr.directionsUrl) {
      dirEl.href = sr.directionsUrl;
    }
    if (mapEl && mapEl.getAttribute('src') !== sr.mapEmbedUrl) {
      mapEl.src = sr.mapEmbedUrl;
    }
    if (floatingWaEl) {
      const waDigits = sanitizeWhatsappDigits(storeState.getStoreWhatsapp());
      const welcomeMsg = encodeURIComponent(
        `Assalam-o-Alaikum GR SON'S Atelier (${sr.storeName}), I would like assistance with sizing or placing an order.`
      );
      floatingWaEl.href = `https://wa.me/${waDigits}?text=${welcomeMsg}`;
    }
  }

  private openTrackDialog(): void {
    if (!this.trackDialog) return;
    if (this.trackResultsEl && !this.trackInput?.value.trim()) {
      this.trackResultsEl.innerHTML = '';
    }
    if (!this.trackDialog.open) {
      this.trackDialog.showModal();
      window.setTimeout(() => this.trackInput?.focus(), 40);
    }
  }

  private renderTrackedOrderCard(order: StoreOrder): string {
    const waDigits = sanitizeWhatsappDigits(storeState.getStoreWhatsapp());
    const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(
      `Assalam-o-Alaikum GR SON'S Atelier, I am checking on Order #${order.orderNumber} (${order.customerName}).`
    )}`;
    const dtStr = new Date(order.createdAt).toLocaleString('en-PK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const stepIdx = order.status === 'Delivered' ? 2 : order.status === 'Dispatched' ? 1 : 0;
    const steps = ['Order Placed', 'Dispatched COD', 'Delivered']
      .map((label, idx) => {
        const done = idx <= stepIdx;
        const active = idx === stepIdx;
        return `
          <div class="track-step${done ? ' is-done' : ''}${active ? ' is-current' : ''}">
            <span class="track-step-dot" aria-hidden="true">${done ? '✓' : idx + 1}</span>
            <span class="track-step-label">${label}</span>
          </div>
        `;
      })
      .join('');

    const itemsHtml = order.items
      .map(
        (it) =>
          `<li><span>${escapeHtml(it.name)} <em>(${escapeHtml(it.size || 'Std')} × ${it.quantity})</em></span><strong>${formatMoney(it.totalPrice)}</strong></li>`
      )
      .join('');

    return `
      <article class="track-order-card">
        <div class="track-order-top">
          <div>
            <strong class="track-order-num">#${escapeHtml(order.orderNumber)}</strong>
            <span class="track-order-date">${escapeHtml(dtStr)}</span>
          </div>
          <span class="adm-order-badge is-${order.status.toLowerCase()}">${escapeHtml(order.status)}</span>
        </div>

        <div class="track-stepper" aria-label="Order fulfillment progress">
          ${steps}
        </div>

        <div class="track-order-meta">
          <strong>${escapeHtml(order.customerName)}</strong>
          <span>${escapeHtml(order.address)}</span>
        </div>

        <ul class="adm-order-items" role="list">${itemsHtml}</ul>

        <div class="track-order-foot">
          <div>
            <small>COD Total</small>
            <strong>${formatMoney(order.total)}</strong>
          </div>
          <a class="track-wa-link" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">
            <svg class="wa-official-svg" width="15" height="15" viewBox="0 0 32 32" aria-hidden="true">
              <path fill="#25D366" d="M16 3C8.82 3 3 8.82 3 16c0 2.47.7 4.78 1.9 6.75L3.6 28.4l5.8-1.52A12.93 12.93 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z" />
              <path fill="#ffffff" d="M23.02 19.65c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.95 1.18-.18.2-.35.23-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.68-1.64-.93-2.25-.25-.6-.5-.52-.68-.53h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.18-1.43-.08-.13-.28-.2-.58-.35z" />
            </svg>
            <span>WhatsApp Atelier Concierge</span>
          </a>
        </div>
      </article>
    `;
  }

  private async handleTrackSubmit(): Promise<void> {
    if (!this.trackResultsEl || !this.trackInput) return;
    const rawQuery = this.trackInput.value.trim();
    if (!rawQuery) {
      this.trackResultsEl.innerHTML =
        '<p class="track-empty">Please enter your Order ID (e.g. #GR-4821) or phone number.</p>';
      this.trackInput.focus();
      return;
    }

    if (this.trackSubmitBtn) {
      this.trackSubmitBtn.disabled = true;
      this.trackSubmitBtn.textContent = 'Checking...';
    }
    this.trackResultsEl.innerHTML =
      '<p class="track-loading">Syncing live order status from GR SON\'S Atelier...</p>';

    try {
      await storeState.pullFromCloud();
    } catch {
      // Fallback gracefully to local orders cache
    } finally {
      if (this.trackSubmitBtn) {
        this.trackSubmitBtn.disabled = false;
        this.trackSubmitBtn.textContent = 'Check Status';
      }
    }

    const matches = storeState.findOrdersByQuery(rawQuery);
    if (matches.length === 0) {
      const waDigits = sanitizeWhatsappDigits(storeState.getStoreWhatsapp());
      const helpHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(
        `Assalam-o-Alaikum GR SON'S Atelier, please help me check my order status for query: ${rawQuery}`
      )}`;
      this.trackResultsEl.innerHTML = `
        <div class="track-empty">
          <strong>No matching order found for "${escapeHtml(rawQuery)}"</strong>
          <p>Double-check your Order ID (e.g. GR-4821) or the mobile number entered during Cash on Delivery checkout.</p>
          <a class="track-wa-link" href="${escapeHtml(helpHref)}" target="_blank" rel="noopener noreferrer">
            <svg class="wa-official-svg" width="15" height="15" viewBox="0 0 32 32" aria-hidden="true">
              <path fill="#25D366" d="M16 3C8.82 3 3 8.82 3 16c0 2.47.7 4.78 1.9 6.75L3.6 28.4l5.8-1.52A12.93 12.93 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z" />
              <path fill="#ffffff" d="M23.02 19.65c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.95 1.18-.18.2-.35.23-.65.08-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.08-.15-.68-1.64-.93-2.25-.25-.6-.5-.52-.68-.53h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.18-1.43-.08-.13-.28-.2-.58-.35z" />
            </svg>
            <span>Ask Concierge on WhatsApp</span>
          </a>
        </div>
      `;
      return;
    }

    this.trackResultsEl.innerHTML = matches.map((ord) => this.renderTrackedOrderCard(ord)).join('');
  }

  private openFittingDialog(): void {
    if (!this.fittingDialog) return;
    if (this.fittingForm) this.fittingForm.hidden = false;
    if (this.fittingConfirm) this.fittingConfirm.hidden = true;
    if (this.fittingError) this.fittingError.textContent = '';
    if (!this.fittingDialog.open) {
      this.fittingDialog.showModal();
    }
  }

  private handleFittingSubmit(): void {
    const nameEl = document.getElementById('fitting-name') as HTMLInputElement | null;
    const phoneEl = document.getElementById('fitting-phone') as HTMLInputElement | null;
    const dateEl = document.getElementById('fitting-date') as HTMLInputElement | null;
    const focusEl = document.getElementById('fitting-focus') as HTMLSelectElement | null;

    const name = nameEl?.value.trim() || '';
    const phone = phoneEl?.value.trim() || '';
    const dateVal = dateEl?.value || '';
    const focus = focusEl?.value || 'Bespoke Fitting';

    if (name.length < 2) {
      if (this.fittingError) this.fittingError.textContent = 'Please enter your full name.';
      nameEl?.focus();
      return;
    }
    if (phone.length < 7) {
      if (this.fittingError) this.fittingError.textContent = 'Please enter a valid contact / WhatsApp number.';
      phoneEl?.focus();
      return;
    }
    if (!dateVal) {
      if (this.fittingError) this.fittingError.textContent = 'Please choose a preferred appointment date.';
      dateEl?.focus();
      return;
    }

    if (this.fittingError) this.fittingError.textContent = '';
    if (this.fittingForm) this.fittingForm.hidden = true;
    if (this.fittingConfirm) this.fittingConfirm.hidden = false;

    const refCode = `GRS-${Math.floor(1000 + Math.random() * 9000)}`;
    const titleEl = document.getElementById('fitting-confirm-title');
    const copyEl = document.getElementById('fitting-confirm-copy');
    const sr = storeState.getShowroom();
    if (titleEl) {
      titleEl.textContent = `Reservation ${refCode} Confirmed`;
    }
    if (copyEl) {
      copyEl.textContent = `${name}, our master tailor will welcome you on ${dateVal} for "${focus}" at ${sr.address}. We will reconfirm shortly on ${phone}.`;
    }
  }
}
