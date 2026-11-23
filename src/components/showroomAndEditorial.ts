import { storeState } from '../data/storeState.ts';

export class ShowroomAndEditorial {
  private fittingDialog: HTMLDialogElement | null = null;
  private fittingForm: HTMLFormElement | null = null;
  private fittingConfirm: HTMLElement | null = null;
  private fittingError: HTMLElement | null = null;

  public initDOM(): void {
    this.syncShowroomFromStore();
    storeState.subscribe(() => this.syncShowroomFromStore());

    this.fittingDialog = document.getElementById('fitting-dialog') as HTMLDialogElement | null;
    this.fittingForm = document.getElementById('fitting-form') as HTMLFormElement | null;
    this.fittingConfirm = document.getElementById('fitting-confirmation');
    this.fittingError = document.getElementById('fitting-error');

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
  }

  private syncShowroomFromStore(): void {
    const sr = storeState.getShowroom();
    const eyebrowEl = document.querySelector<HTMLElement>('[data-showroom-eyebrow]');
    const headingEl = document.querySelector<HTMLElement>('[data-showroom-heading]');
    const addressEl = document.querySelector<HTMLElement>('[data-showroom-address]');
    const timingsEl = document.querySelector<HTMLElement>('[data-showroom-timings]');
    const dirEl = document.querySelector<HTMLAnchorElement>('[data-showroom-directions]');
    const mapEl = document.querySelector<HTMLIFrameElement>('[data-showroom-map]');

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
