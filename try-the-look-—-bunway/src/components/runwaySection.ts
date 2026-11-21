import {
  CatalogItem,
  StoreCategory,
  formatMoney,
} from '../data/catalog.ts';
import { storeState } from '../data/storeState.ts';
import { StylingBag } from './bag.ts';
import { QuickViewModal } from './quickView.ts';

const SECTION_ID = 'Runway-template--28035983671601__the_runway_wdM8BG';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function wrapN(x: number, n: number): number {
  return ((x % n) + n) % n;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface BodyState {
  el: HTMLElement;
  hit: HTMLButtonElement | null;
  art: HTMLElement | null;
  index: number; // 0..11
  lookIndex: number; // 0..5
  w: number;
  lastBlur: string;
  x: number;
  g: number;
  v: number;
  goal: number;
  from: number;
  inTrip: boolean;
}

interface HeroState {
  el: HTMLElement;
  figure: HTMLElement;
  art: HTMLElement | null;
  zoomBtn: HTMLButtonElement | null;
  pins: HTMLButtonElement[];
  index: number;
  name: string;
  probe: string;
}

export class RunwaySection extends HTMLElement {
  private bag: StylingBag | null = null;
  private quickView: QuickViewModal | null = null;
  private onNavigateCategory: ((cat: StoreCategory) => void) | null = null;

  private mode: 'banner' | 'ring' = 'ring';
  private isMobile = false;
  private reducedMotion = false;
  private hasFineHover = false;

  private n = storeState.getLooks().length; // 6
  private N = 12;
  private unsubscribeStore: (() => void) | null = null;
  private index = 0;
  private target = 0;
  private cur = 0;
  private vel = 0;
  private still = false;
  private bodies: BodyState[] = [];
  private heroes: HeroState[] = [];
  private stageW = 800;
  private stageH = 600;
  private fs = 1.08;
  private unit = 240;
  private latchedVh = 0;
  private latchedW = 0;

  private playing = false;
  private engaged = false;
  private panelHover = false;
  private autoTimer: number | null = null;
  private visible = true;
  private dragging = false;
  private zoomed = false;

  private rafId = 0;
  private lastTickTime = 0;

  private dragPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartTarget = 0;
  private dragSamples: { x: number; time: number }[] = [];
  private dragMoved = false;
  private dragAxis: 'x' | 'y' | null = null;
  private suppressClickUntil = 0;
  private wheelAcc = 0;
  private wheelLockUntil = 0;
  private wheelResetTimer: number | null = null;

  private cursorEl: HTMLElement | null = null;
  private cursorX = 0;
  private cursorY = 0;
  private cursorTx = 0;
  private cursorTy = 0;
  private cursorEntered = false;
  private cursorRaf = 0;

  private searchQuery = '';

  private stickyEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private subEl!: HTMLElement;
  private stageEl!: HTMLElement;
  private actorsEl!: HTMLElement;
  private heroesEl!: HTMLElement;
  private controlsEl!: HTMLElement;
  private ticksEl!: HTMLElement;
  private autoBtn!: HTMLButtonElement;
  private liveEl!: HTMLElement;
  private piecesEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private panelTitleEl!: HTMLElement;
  private filterPanelEl!: HTMLElement;
  private filterItemsEl!: HTMLElement;
  private filterEmptyEl!: HTMLElement;
  private filterMheadEl!: HTMLElement;
  private filterMcountEl!: HTMLElement;
  private searchInputEl: HTMLInputElement | null = null;
  private searchClearEl: HTMLButtonElement | null = null;
  private lbEl!: HTMLElement;
  private lbStageEl!: HTMLElement;
  private lbKickerEl!: HTMLElement;
  private lbNameEl!: HTMLElement;
  private lbCloseBtn!: HTMLButtonElement;
  private lbModelWrapper: HTMLElement | null = null;
  private lbCloseTimer: number | null = null;

  private sheetHost: HTMLElement | null = null;
  private activeSheetPicker: HTMLElement | null = null;
  private activeSheetCard: HTMLElement | null = null;
  private activeSheetTrigger: HTMLButtonElement | null = null;

  private visObs: IntersectionObserver | null = null;
  private revealObs: IntersectionObserver | null = null;
  private resizeObs: ResizeObserver | null = null;
  private resizeTimer: number | null = null;
  private measureRaf = 0;
  private lastMeasuredKey = '';
  private reducedQuery: MediaQueryList | null = null;
  private boundOnResize: () => void;
  private boundOnVisChange: () => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnReducedChange: () => void;
  private boundOnSearchInput: () => void;
  private boundOnSearchClear: () => void;

  constructor() {
    super();
    this.boundOnResize = () => {
      if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.measure(), 120);
    };
    this.boundOnVisChange = () => {
      if (!document.hidden) {
        this.kick();
        this.restartAutoTimer();
      }
    };
    this.boundOnKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.boundOnReducedChange = () => {
      this.reducedMotion = Boolean(this.reducedQuery?.matches);
    };
    this.boundOnSearchInput = () => {
      this.searchQuery = this.searchInputEl?.value || '';
      if (this.searchClearEl) {
        this.searchClearEl.hidden = this.searchQuery.trim().length === 0;
      }
      this.applyCatalogFilter();
    };
    this.boundOnSearchClear = () => {
      this.searchQuery = '';
      if (this.searchInputEl) {
        this.searchInputEl.value = '';
        this.searchInputEl.focus({ preventScroll: true });
      }
      if (this.searchClearEl) {
        this.searchClearEl.hidden = true;
      }
      this.applyCatalogFilter();
    };
  }

  public setBag(bag: StylingBag): void {
    this.bag = bag;
  }

  public setQuickView(quickView: QuickViewModal): void {
    this.quickView = quickView;
  }

  public setCategoryNavigator(handler: (cat: StoreCategory) => void): void {
    this.onNavigateCategory = handler;
  }

  connectedCallback(): void {
    this.reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.reducedQuery.matches;
    this.reducedQuery.addEventListener('change', this.boundOnReducedChange);

    this.hasFineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    this.buildMarkup();
    this.bindElements();
    this.setupGravityText();
    this.setupModelsAndHeroes();
    this.setupControls();
    this.setupEvents();

    this.latchedW = window.innerWidth;
    this.latchedVh = window.innerHeight;
    this.measure();

    this.classList.add('rw--js');
    if (this.reducedMotion) {
      this.classList.add('is-revealed');
    } else {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          this.classList.add('is-revealed');
        });
      });
    }

    this.visObs = new IntersectionObserver(
      (entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        if (this.visible) {
          this.kick();
        }
      },
      { threshold: 0 }
    );
    this.visObs.observe(this);

    this.resizeObs = new ResizeObserver(() => this.scheduleMeasure());
    this.resizeObs.observe(this.stageEl);

    window.addEventListener('resize', this.boundOnResize, { passive: true });
    document.addEventListener('visibilitychange', this.boundOnVisChange);
    this.addEventListener('keydown', this.boundOnKeyDown);

    this.setIndex(0, true);
    this.setMode('ring', true);
    this.detectAllFeet();
    this.applyCatalogFilter();
    this.unsubscribeStore = storeState.subscribe(() => this.syncFromStore());
  }

  disconnectedCallback(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    if (this.rafId) window.cancelAnimationFrame(this.rafId);
    if (this.cursorRaf) window.cancelAnimationFrame(this.cursorRaf);
    if (this.measureRaf) window.cancelAnimationFrame(this.measureRaf);
    if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
    if (this.wheelResetTimer !== null) window.clearTimeout(this.wheelResetTimer);
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    if (this.lbCloseTimer !== null) window.clearTimeout(this.lbCloseTimer);
    this.visObs?.disconnect();
    this.revealObs?.disconnect();
    this.resizeObs?.disconnect();
    this.reducedQuery?.removeEventListener('change', this.boundOnReducedChange);
    window.removeEventListener('resize', this.boundOnResize);
    document.removeEventListener('visibilitychange', this.boundOnVisChange);
    this.removeEventListener('keydown', this.boundOnKeyDown);
    this.searchInputEl?.removeEventListener('input', this.boundOnSearchInput);
    this.searchClearEl?.removeEventListener('click', this.boundOnSearchClear);
    this.closeMobileSheet(true);
    this.sheetHost?.remove();
  }

  private renderProductCard(
    item: CatalogItem,
    num: number,
    lookLabel: string,
    keyScope: string,
    tag?: string
  ): string {
    const pickerId = `Picker-${SECTION_ID}-${keyScope}-${num}`;
    const radioName = `Opt-${SECTION_ID}-${keyScope}-${num}-1`;
    const variantsJson = JSON.stringify(item.variants);
    const tagHtml = tag
      ? `<span class="rw__tag"><span class="rw__tag-text">${escapeHtml(tag)}</span></span>`
      : '';

    const pillsHtml = item.sizes
      .map((sz, idx) => {
        const checked = idx === 0 ? ' checked' : '';
        return `<label class="rw__pill"><input type="radio" name="${radioName}" value="${escapeHtml(sz)}" data-rw-option="0"${checked}><span class="rw__pill-label">${escapeHtml(sz)}</span></label>`;
      })
      .join('');

    return `
      <li class="rw__item" data-rw-card="${num}" data-product-id="${escapeHtml(item.id)}" data-look-label="${escapeHtml(lookLabel)}"${tag ? ` data-tag="${escapeHtml(tag)}"` : ''} style="--i:${Math.min(num, 6)}" data-title="${escapeHtml(item.name)}">
        ${tagHtml}
        <button type="button" class="rw__media" data-rw-quickview="${escapeHtml(item.id)}" tabindex="-1" aria-hidden="true">
          <img src="${escapeHtml(item.image)}" width="${item.width}" height="${item.height}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="">
          <span class="rw__num">${num}</span>
        </button>
        <div class="rw__info">
          <span class="rw__type">${escapeHtml(item.vendor)} · ${escapeHtml(item.type)}</span>
          <button type="button" class="rw__name" data-rw-quickview="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>
          <span class="rw__price"><span>${formatMoney(item.price)}</span></span>
        </div>
        <button type="button" class="rw__add" data-rw-add aria-expanded="false" aria-controls="${pickerId}" aria-label="Add to bag: ${escapeHtml(item.name)}" data-added-label="Added to bag: ${escapeHtml(item.name)}">
          <svg class="rw__add-plus" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
          <svg class="rw__add-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7"/></svg>
          <svg class="rw__add-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9"/></svg>
        </button>
        <div class="rw__picker" id="${pickerId}" data-rw-picker hidden>
          <script type="application/json" data-rw-variants>${variantsJson}</script>
          <div class="rw__picker-head">
            <img class="rw__picker-thumb" src="${escapeHtml(item.image)}" width="${item.mobileWidth}" height="${item.mobileHeight}" loading="lazy" decoding="async" alt="">
            <div class="rw__picker-meta">
              <span class="rw__picker-title">${escapeHtml(item.name)}</span>
              <span class="rw__picker-price">${formatMoney(item.price)}</span>
            </div>
            <button type="button" class="rw__picker-close" data-rw-pick-close aria-label="Close size picker">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>
            </button>
          </div>
          <fieldset class="rw__opt">
            <legend class="rw__opt-name">${escapeHtml(item.optionName)}</legend>
            <div class="rw__pills">${pillsHtml}</div>
          </fieldset>
          <button type="button" class="rw__confirm" data-rw-confirm>
            <span data-rw-confirm-label data-add="Add to bag">Add to bag</span>
            <span class="rw__sr"> — ${escapeHtml(item.name)}</span>
          </button>
        </div>
      </li>
    `;
  }

  private renderPanelsHtml(): string {
    const looks = storeState.getLooks();
    return looks
      .map((look, i) => {
        const hiddenAttr = i === this.index ? '' : ' hidden';
        const inClass = i === this.index ? ' is-in' : '';
        let originalSum = 0;
        const cardsHtml = look.pieces
          .map((piece) => {
            const item = storeState.getLookPieceResolved(i, piece.num).item || storeState.getProductById(piece.productId);
            if (!item) return '';
            originalSum += item.price;
            return this.renderProductCard(
              item,
              piece.num,
              `Look 0${i + 1}: ${look.name}`,
              `look_${look.key}`,
              piece.tag
            );
          })
          .join('');

        const bundleTotal = Math.round(originalSum * 0.9);

        return `
        <div class="rw__look-panel${inClass}" data-rw-panel="${i}"${hiddenAttr}>
          <div class="rw__mhead">
            <span class="rw__mhead-title">${escapeHtml(look.name)}</span>
            <span class="rw__label">${escapeHtml(look.piecesLabel)}</span>
          </div>
          <ul class="rw__items" role="list">
            ${cardsHtml}
          </ul>
          <div class="rw__bundle has-rule">
            <p class="rw__msg" data-rw-msg role="status" aria-live="polite"></p>
            <div class="rw__bundle-row">
              <div class="rw__bundle-copy">
                <span class="rw__bundle-title">Complete the look</span>
                <span class="rw__bundle-note">Bundle all 3 and save 10%</span>
              </div>
              <div class="rw__bundle-price">
                <s>${formatMoney(originalSum)}</s>
                <strong>${formatMoney(bundleTotal)}</strong>
              </div>
            </div>
            <button type="button" class="rw__cta" data-rw-all>
              <span class="rw__cta-add">Add full look to bag</span>
              <span class="rw__cta-m">Add full look — ${formatMoney(bundleTotal)}</span>
              <span class="rw__cta-done">Full look in your bag</span>
              <svg class="rw__cta-arrow" width="22" height="12" viewBox="0 0 26 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 7h24M19 1l6 6-6 6"/></svg>
              <svg class="rw__cta-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9"/></svg>
            </button>
          </div>
          <template data-rw-pieces-text>${escapeHtml(look.piecesLabel)}</template>
        </div>
      `;
      })
      .join('');
  }

  private buildMarkup(): void {
    const looks = storeState.getLooks();
    const banner = storeState.getHeroBanner();
    this.n = looks.length;

    const panelsHtml = this.renderPanelsHtml();

    const modelsHtml = looks
      .map(
        (look, i) => `
      <div class="rw__model" data-rw-model data-index="${i}" style="--rw-model-scale: ${((look.modelScale ?? 100) / 100).toFixed(3)}" aria-hidden="true">
        <span class="rw__shadow"></span>
        <div class="rw__figure" style="--rw-ar: 0.5625">
          <div class="rw__art">
            <img
              data-model-image
              src="${escapeHtml(look.model640)}"
              srcset="${escapeHtml(look.model640)} 640w, ${escapeHtml(look.model1080)} 1080w"
              sizes="(min-width: 1800px) 540px, (min-width: 750px) 420px, 320px"
              loading="lazy"
              decoding="async"
              width="1100"
              height="1956"
              draggable="false"
              referrerpolicy="no-referrer"
              alt="${escapeHtml(look.name)}"
            >
            <button type="button" class="rw__hit" data-rw-go="${i}" aria-label="Look ${i + 1}: ${escapeHtml(look.name)}" tabindex="-1"></button>
          </div>
        </div>
      </div>
    `
      )
      .join('');

    const heroesHtml = looks
      .map((look, i) => {
        const pinsHtml = look.pins
          .map(
            (pin) => `
          <button
            type="button"
            class="rw__pin"
            data-rw-pin="${pin.num}"
            data-product-id="${escapeHtml(pin.productId)}"
            data-tip="${escapeHtml(pin.productName)}"
            style="left:${pin.left}%; top:${pin.top}%; --pi:${pin.num}"
            aria-label="${pin.num}: ${escapeHtml(pin.productName)}"
            tabindex="-1"
          ><span class="rw__pin-dot">${pin.num}</span></button>
        `
          )
          .join('');

        return `
        <div
          class="rw__hero${i === 0 ? ' is-on' : ''}"
          data-rw-hero
          data-index="${i}"
          data-name="${escapeHtml(look.name)}"
          data-label="Look ${i + 1}: ${escapeHtml(look.name)}"
          data-probe="${escapeHtml(look.model640)}"
          style="--rw-model-scale: ${((look.modelScale ?? 100) / 100).toFixed(3)}"
        >
          <div class="rw__morph">
            <span class="rw__shadow"></span>
            <div class="rw__figure" style="--rw-ar: 0.5625">
              <div class="rw__art">
                <img
                  data-model-image
                  src="${escapeHtml(look.model640)}"
                  srcset="${escapeHtml(look.model640)} 640w, ${escapeHtml(look.model1080)} 1080w"
                  sizes="(min-width: 1800px) 540px, (min-width: 750px) 420px, 320px"
                  loading="lazy"
                  decoding="async"
                  width="1100"
                  height="1956"
                  draggable="false"
                  referrerpolicy="no-referrer"
                  alt="${escapeHtml(look.name)}"
                >
                <button type="button" class="rw__zoom" data-rw-zoom aria-label="View look: ${escapeHtml(look.name)}" tabindex="${i === 0 ? '0' : '-1'}"></button>
                <div class="rw__pins">${pinsHtml}</div>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    this.innerHTML = `
      <section class="rw__banner" data-rw-banner aria-label="Main Store Showcase">
        <img
          class="rw__banner-img"
          src="${escapeHtml(banner.image)}"
          alt="${escapeHtml(banner.title)}"
          width="1408"
          height="768"
          loading="eager"
          decoding="async"
          referrerpolicy="no-referrer"
        />
        <div class="rw__banner-scrim" aria-hidden="true"></div>
        <div class="rw__banner-spot" aria-hidden="true"></div>
        <div class="rw__banner-topbar">
          <span class="rw__banner-brand-note">${escapeHtml(banner.brandNote)}</span>
        </div>
        <div class="rw__banner-content">
          <div class="rw__banner-copy">
            <span class="rw__banner-eyebrow">${escapeHtml(banner.eyebrow)}</span>
            <h1 class="rw__banner-title">${escapeHtml(banner.title)}</h1>
            <p class="rw__banner-sub">${escapeHtml(banner.subtitle)}</p>
            <div class="rw__banner-actions">
              <button type="button" class="rw__banner-cta rw__banner-cta--primary" data-rw-explore>
                <span>${escapeHtml(banner.ctaPrimary)}</span>
                <svg width="18" height="10" viewBox="0 0 26 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 7h24M19 1l6 6-6 6"/></svg>
              </button>
              <button type="button" class="rw__banner-cta rw__banner-cta--secondary" data-rw-footwear>
                <span>${escapeHtml(banner.ctaSecondary)}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
      <div class="rw__sticky" id="runway-showcase">
        <div class="rw__grid">
          <div class="rw__left">
            <div class="rw__head">
              <div class="rw__intro">
                <h2 class="rw__title">TRY THE LOOK</h2>
                <p class="rw__sub">Six runway looks, styled head to toe. Drag horizontally or select any silhouette to inspect and shop each piece.</p>
              </div>
              <span class="rw__sr" aria-live="polite" aria-atomic="true" data-rw-live></span>
            </div>
            <div class="rw__stage" data-rw-stage tabindex="0" role="region" aria-roledescription="carousel" aria-label="3D Runway — use left and right arrow keys to browse looks">
              <div class="rw__actors" data-rw-actors>${modelsHtml}</div>
              <div class="rw__heroes" data-rw-heroes>${heroesHtml}</div>
              <span class="rw__sweep" aria-hidden="true"></span>
              <span class="rw__cursor" data-rw-cursor aria-hidden="true">
                <span class="rw__cursor-in">
                  <span class="rw__cursor-label rw__cursor-drag">Drag</span>
                  <span class="rw__cursor-label rw__cursor-view">View</span>
                </span>
              </span>
              <span class="rw__walk" aria-hidden="true"><span class="rw__walk-line"></span></span>
            </div>
            <div class="rw__controls">
              <button type="button" class="rw__icon" data-rw-prev aria-label="Previous look">
                <svg width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M25 7H1M7 1L1 7l6 6"/></svg>
              </button>
              <div class="rw__ticks" data-rw-ticks></div>
              <button type="button" class="rw__icon rw__auto" data-rw-auto aria-pressed="false" aria-label="Autoplay">
                <svg class="rw__icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>
                <svg class="rw__icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.5h3.5v15H6.5zM14 4.5h3.5v15H14z"/></svg>
              </button>
              <button type="button" class="rw__icon" data-rw-next aria-label="Next look">
                <svg width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 7h24M19 1l6 6-6 6"/></svg>
              </button>
            </div>
            <div class="rw__lb" data-rw-lb data-word="Look" role="region" aria-label="View look" aria-hidden="true">
              <div class="rw__lb-stage" data-rw-lb-stage></div>
              <div class="rw__lb-top">
                <p class="rw__lb-cap">
                  <span class="rw__lb-kicker" data-rw-lb-kicker></span>
                  <span class="rw__lb-name" data-rw-lb-name></span>
                </p>
                <button type="button" class="rw__lb-close" data-rw-zoom-close aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>
                </button>
              </div>
              <p class="rw__lb-hint">Tap a dot to shop the piece</p>
            </div>
          </div>
          <aside class="rw__panel has-rule" aria-label="In this look">
            <div class="rw__panel-inner">
              <div class="rw__panel-head">
                <h3 class="rw__panel-title" data-rw-panel-title>In this look</h3>
                <span class="rw__label" data-rw-pieces>3 pieces</span>
              </div>
              ${panelsHtml}
              <div class="rw__look-panel rw__filter-panel" data-rw-filter-panel hidden>
                <div class="rw__mhead">
                  <span class="rw__mhead-title" data-rw-filter-mhead>Catalog</span>
                  <span class="rw__label" data-rw-filter-mcount>0 pieces</span>
                </div>
                <ul class="rw__items" role="list" data-rw-filter-items></ul>
                <div class="rw__filter-empty" data-rw-filter-empty hidden>
                  <p>No garments match your search or category selection.</p>
                  <button type="button" class="rw__filter-reset" data-rw-filter-reset>Reset Filters</button>
                </div>
                <div class="rw__filter-foot has-rule">
                  <button type="button" class="rw__filter-reset-link" data-rw-filter-reset>Return to runway look</button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  private bindElements(): void {
    this.stickyEl = this.querySelector('.rw__sticky')!;
    this.titleEl = this.querySelector('.rw__title')!;
    this.subEl = this.querySelector('.rw__sub')!;
    this.stageEl = this.querySelector('[data-rw-stage]')!;
    this.actorsEl = this.querySelector('[data-rw-actors]')!;
    this.heroesEl = this.querySelector('[data-rw-heroes]')!;
    this.controlsEl = this.querySelector('.rw__controls')!;
    this.ticksEl = this.querySelector('[data-rw-ticks]')!;
    this.autoBtn = this.querySelector('[data-rw-auto]')!;
    this.liveEl = this.querySelector('[data-rw-live]')!;
    this.piecesEl = this.querySelector('[data-rw-pieces]')!;
    this.panelEl = this.querySelector('.rw__panel')!;
    this.panelTitleEl = this.querySelector('[data-rw-panel-title]')!;
    this.filterPanelEl = this.querySelector('[data-rw-filter-panel]')!;
    this.filterItemsEl = this.querySelector('[data-rw-filter-items]')!;
    this.filterEmptyEl = this.querySelector('[data-rw-filter-empty]')!;
    this.filterMheadEl = this.querySelector('[data-rw-filter-mhead]')!;
    this.filterMcountEl = this.querySelector('[data-rw-filter-mcount]')!;
    this.searchInputEl = document.getElementById('store-search-input') as HTMLInputElement | null;
    this.searchClearEl = document.getElementById('store-search-clear') as HTMLButtonElement | null;
    this.lbEl = this.querySelector('[data-rw-lb]')!;
    this.lbStageEl = this.querySelector('[data-rw-lb-stage]')!;
    this.lbKickerEl = this.querySelector('[data-rw-lb-kicker]')!;
    this.lbNameEl = this.querySelector('[data-rw-lb-name]')!;
    this.lbCloseBtn = this.querySelector('[data-rw-zoom-close]')!;
    this.cursorEl = this.querySelector('[data-rw-cursor]');

    if (this.hasFineHover) {
      this.classList.add('rw--cursor');
    } else {
      this.cursorEl?.remove();
      this.cursorEl = null;
    }

    this.querySelectorAll<HTMLImageElement>('img[data-model-image]').forEach((img) => {
      this.decodeModelImage(img);
    });
  }

  private setupGravityText(): void {
    this.titleEl.style.transform = 'none';
    this.titleEl.style.opacity = '1';
    this.subEl.style.transform = 'none';
    this.subEl.style.opacity = '1';
  }

  private decodeModelImage(img: HTMLImageElement): void {
    const done = () => {
      img.classList.add('is-decoded');
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        img.width = img.naturalWidth;
        img.height = img.naturalHeight;
        const ar = clamp(img.naturalWidth / img.naturalHeight, 0.25, 2.0);
        const fig = img.closest<HTMLElement>('.rw__figure');
        fig?.style.setProperty('--rw-ar', ar.toFixed(4));
        const modelEl = img.closest<HTMLElement>('[data-rw-model]');
        if (modelEl) {
          const body = this.bodies.find((b) => b.el === modelEl);
          if (body) {
            body.w = modelEl.offsetWidth || Math.round(440 * ar);
          }
        }
      }
    };
    img.addEventListener('load', done, { once: true });
    if (typeof img.decode === 'function') {
      img
        .decode()
        .then(done)
        .catch(() => {
          if (img.complete && img.naturalWidth > 0) done();
        });
    } else if (img.complete && img.naturalWidth > 0) {
      done();
    }
  }

  private setupModelsAndHeroes(): void {
    const origModels = Array.from(this.actorsEl.querySelectorAll<HTMLElement>('[data-rw-model]'));
    for (let i = 0; i < origModels.length; i++) {
      const clone = origModels[i].cloneNode(true) as HTMLElement;
      const idx = origModels.length + i;
      clone.dataset.index = String(idx);
      clone.setAttribute('data-rw-clone', '');
      const img = clone.querySelector<HTMLImageElement>('img[data-model-image]');
      if (img) {
        img.loading = 'lazy';
        this.decodeModelImage(img);
      }
      this.actorsEl.appendChild(clone);
    }

    const allModels = Array.from(this.actorsEl.querySelectorAll<HTMLElement>('[data-rw-model]'));
    this.N = allModels.length;
    const offset = this.reducedMotion ? 0 : 1.15;

    this.bodies = allModels.map((el, i) => {
      const goal = wrapN(i, this.N);
      const start = goal + offset;
      return {
        el,
        hit: el.querySelector<HTMLButtonElement>('.rw__hit'),
        art: el.querySelector<HTMLElement>('.rw__art'),
        index: i,
        lookIndex: i % this.n,
        w: el.offsetWidth || 315,
        lastBlur: '',
        x: start,
        g: start,
        v: 0,
        goal,
        from: start,
        inTrip: false,
      };
    });

    this.cur = this.reducedMotion ? 0 : -1.15;
    this.target = 0;
    this.vel = 0;

    this.heroes = Array.from(this.heroesEl.querySelectorAll<HTMLElement>('[data-rw-hero]')).map(
      (el, i) => ({
        el,
        figure: el.querySelector<HTMLElement>('.rw__figure')!,
        art: el.querySelector<HTMLElement>('.rw__art'),
        zoomBtn: el.querySelector<HTMLButtonElement>('[data-rw-zoom]'),
        pins: Array.from(el.querySelectorAll<HTMLButtonElement>('[data-rw-pin]')),
        index: i,
        name: el.dataset.name || '',
        probe: el.dataset.probe || '',
      })
    );
  }

  private setupControls(): void {
    this.renderTicks();
  }

  private renderTicks(): void {
    const looks = storeState.getLooks();
    this.ticksEl.innerHTML = looks
      .map(
        (look, i) => `
        <button
          type="button"
          class="rw__tick"
          data-rw-tick="${i}"
          aria-current="${i === this.index ? 'true' : 'false'}"
          aria-label="Look ${i + 1}: ${escapeHtml(look.name)}"
        >
          <span class="rw__tick-bar"></span>
          <span class="rw__tick-label">0${i + 1}<span class="rw__tick-name">&nbsp;&nbsp;${escapeHtml(look.name)}</span></span>
        </button>
      `
      )
      .join('');
  }

  public syncFromStore(): void {
    const banner = storeState.getHeroBanner();
    const bannerEl = this.querySelector<HTMLElement>('[data-rw-banner]');
    if (bannerEl) {
      const img = bannerEl.querySelector<HTMLImageElement>('.rw__banner-img');
      if (img && img.getAttribute('src') !== banner.image) {
        img.src = banner.image;
      }
      if (img) img.alt = banner.title;
      const noteEl = bannerEl.querySelector('.rw__banner-brand-note');
      if (noteEl) noteEl.textContent = banner.brandNote;
      const eyebrowEl = bannerEl.querySelector('.rw__banner-eyebrow');
      if (eyebrowEl) eyebrowEl.textContent = banner.eyebrow;
      const titleEl = bannerEl.querySelector('.rw__banner-title');
      if (titleEl) titleEl.textContent = banner.title;
      const subEl = bannerEl.querySelector('.rw__banner-sub');
      if (subEl) subEl.textContent = banner.subtitle;
      const priEl = bannerEl.querySelector('[data-rw-explore] span');
      if (priEl) priEl.textContent = banner.ctaPrimary;
      const secEl = bannerEl.querySelector('[data-rw-footwear] span');
      if (secEl) secEl.textContent = banner.ctaSecondary;
    }

    const looks = storeState.getLooks();
    this.n = looks.length;
    let modelImagesChanged = false;

    // Update 3D Carousel body actors (both originals and clones)
    for (const b of this.bodies) {
      const look = looks[b.lookIndex];
      if (!look) continue;
      b.el.style.setProperty('--rw-model-scale', ((look.modelScale ?? 100) / 100).toFixed(3));
      const img = b.el.querySelector<HTMLImageElement>('img[data-model-image]');
      if (img) {
        if (img.getAttribute('src') !== look.model640) {
          modelImagesChanged = true;
          img.src = look.model640;
          if (look.model640.startsWith('data:') || look.model640 === look.model1080) {
            img.removeAttribute('srcset');
          } else {
            img.srcset = `${look.model640} 640w, ${look.model1080} 1080w`;
          }
          this.decodeModelImage(img);
        }
        img.alt = look.name;
      }
      if (b.hit) {
        b.hit.setAttribute('aria-label', `Look ${b.lookIndex + 1}: ${look.name}`);
      }
    }

    // Update hero center silhouettes and pins
    for (const h of this.heroes) {
      const look = looks[h.index];
      if (!look) continue;
      h.name = look.name;
      h.el.style.setProperty('--rw-model-scale', ((look.modelScale ?? 100) / 100).toFixed(3));
      h.el.dataset.name = look.name;
      h.el.dataset.label = `Look ${h.index + 1}: ${look.name}`;
      if (h.probe !== look.model640) {
        modelImagesChanged = true;
      }
      h.probe = look.model640;
      h.el.dataset.probe = look.model640;
      const img = h.el.querySelector<HTMLImageElement>('img[data-model-image]');
      if (img) {
        if (img.getAttribute('src') !== look.model640) {
          img.src = look.model640;
          if (look.model640.startsWith('data:') || look.model640 === look.model1080) {
            img.removeAttribute('srcset');
          } else {
            img.srcset = `${look.model640} 640w, ${look.model1080} 1080w`;
          }
          this.decodeModelImage(img);
        }
        img.alt = look.name;
      }
      if (h.zoomBtn) {
        h.zoomBtn.setAttribute('aria-label', `View look: ${look.name}`);
      }
      h.pins.forEach((pinEl) => {
        const pinNum = Number(pinEl.dataset.rwPin);
        const pinData = look.pins.find((p) => p.num === pinNum);
        if (pinData) {
          pinEl.dataset.productId = pinData.productId;
          pinEl.dataset.tip = pinData.productName;
          pinEl.setAttribute('aria-label', `${pinData.num}: ${pinData.productName}`);
        }
      });
    }

    // Rebuild right-hand look panels while keeping active filter panel & current index intact
    const panelInner = this.panelEl?.querySelector('.rw__panel-inner');
    if (panelInner && this.filterPanelEl) {
      panelInner.querySelectorAll('[data-rw-panel]').forEach((el) => el.remove());
      const tpl = document.createElement('template');
      tpl.innerHTML = this.renderPanelsHtml();
      panelInner.insertBefore(tpl.content, this.filterPanelEl);
      panelInner.querySelectorAll<HTMLElement>('[data-rw-panel] [data-rw-card]').forEach((card) => {
        this.syncCardOptions(card, false);
      });
    }

    this.renderTicks();
    if (modelImagesChanged) {
      this.detectAllFeet();
    }
    this.syncPanelVisibility();
    this.applyCatalogFilter();
  }

  private syncPanelVisibility(): void {
    const filtering = this.searchQuery.trim().length > 0;
    const shouldShow = filtering || storeState.isLookPanelVisible(this.index);
    const wasHidden = this.classList.contains('rw--hide-panel');
    this.classList.toggle('rw--hide-panel', !shouldShow);
    if (this.panelEl) {
      this.panelEl.hidden = !shouldShow;
    }
    if (wasHidden !== !shouldShow) {
      this.lastMeasuredKey = '';
      this.measure();
      this.scheduleMeasure();
    }
  }

  public scrollToRunway(): void {
    this.stickyEl?.scrollIntoView({
      behavior: this.reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  public setMode(_mode: 'banner' | 'ring', silent = false): void {
    this.mode = 'ring';
    this.classList.remove('rw--banner');
    this.renderTicks();
    this.measure();
    if (!silent) {
      this.cur = this.reducedMotion ? this.target : this.target - 1.15;
      this.vel = 0;
      this.setStill(false);
      this.kick();
      this.scrollToRunway();
    }
    if (this.dataset.autoplay === 'true' && !this.reducedMotion && !this.engaged) {
      this.play(true);
    }
  }

  private setupEvents(): void {
    this.addEventListener('click', (e) => this.handleClick(e));
    this.stageEl.addEventListener(
      'click',
      (e) => {
        if (performance.now() < this.suppressClickUntil) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    this.stageEl.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    this.stageEl.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'ring' || this.zoomed) return;
        const modeScale = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
        const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const delta = rawDelta * modeScale;
        if (Math.abs(delta) < 1) return;

        e.preventDefault();
        if (performance.now() < this.wheelLockUntil) return;

        if (this.wheelAcc !== 0 && Math.sign(delta) !== Math.sign(this.wheelAcc)) {
          this.wheelAcc = 0;
        }
        this.wheelAcc += delta;

        if (this.wheelResetTimer !== null) window.clearTimeout(this.wheelResetTimer);
        this.wheelResetTimer = window.setTimeout(() => {
          this.wheelAcc = 0;
          this.wheelResetTimer = null;
        }, 220);

        if (Math.abs(this.wheelAcc) >= 40) {
          this.engage();
          if (this.wheelAcc > 0) this.next();
          else this.prev();
          this.wheelAcc = 0;
          this.wheelLockUntil = performance.now() + 420;
        }
      },
      { passive: false }
    );

    if (this.cursorEl) {
      this.stageEl.addEventListener(
        'pointermove',
        (e) => {
          if (this.mode !== 'ring' || e.pointerType !== 'mouse') return;
          const rect = this.stageEl.getBoundingClientRect();
          this.cursorTx = e.clientX - rect.left;
          this.cursorTy = e.clientY - rect.top;
          if (!this.cursorEntered) {
            this.cursorEntered = true;
            this.cursorX = this.cursorTx;
            this.cursorY = this.cursorTy;
            this.cursorEl!.style.transform = `translate3d(${this.cursorX}px, ${this.cursorY}px, 0)`;
            this.cursorEl!.classList.add('is-on');
          }
          const target = e.target as HTMLElement | null;
          const isView = Boolean(target?.closest('.rw__hero.is-on .rw__zoom'));
          const isLink = Boolean(target?.closest('.rw__pin, .rw__hit'));
          this.cursorEl!.classList.toggle('is-view', isView && !this.dragging);
          this.cursorEl!.classList.toggle('is-link', isLink && !this.dragging);
          this.kickCursor();
        },
        { passive: true }
      );

      this.stageEl.addEventListener('pointerleave', () => {
        this.cursorEntered = false;
        this.cursorEl?.classList.remove('is-on', 'is-link', 'is-view');
      });
    }

    this.panelEl.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') this.panelHover = true;
    });
    this.panelEl.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') {
        this.panelHover = false;
        this.restartAutoTimer();
      }
    });

    this.panelEl.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-rw-card]');
      if (card) {
        this.hot(Number(card.dataset.rwCard), false);
      }
    });

    this.panelEl.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-rw-card]');
      const rel = e.relatedTarget as Node | null;
      if (!card || (rel && card.contains(rel))) return;
      this.clearHot();
    });

    this.panelEl.addEventListener('change', (e) => this.handleOptionChange(e, true));

    this.querySelectorAll<HTMLElement>('[data-rw-card]').forEach((card) => {
      this.syncCardOptions(card, false);
    });

    this.searchInputEl?.addEventListener('input', this.boundOnSearchInput);
    this.searchClearEl?.addEventListener('click', this.boundOnSearchClear);
  }

  private navigateToCatalog(category: StoreCategory): void {
    if (this.onNavigateCategory) {
      this.onNavigateCategory(category);
    } else {
      document
        .getElementById('catalog-showcase')
        ?.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }

  private resetFilters(): void {
    this.searchQuery = '';
    if (this.searchInputEl) {
      this.searchInputEl.value = '';
      this.searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (this.searchClearEl) {
      this.searchClearEl.hidden = true;
    }
    this.applyCatalogFilter();
  }

  private applyCatalogFilter(): void {
    this.syncPanelVisibility();
    const query = this.searchQuery.trim().toLowerCase();
    const filtering = query.length > 0;
    const lookPanels = Array.from(this.panelEl.querySelectorAll<HTMLElement>('[data-rw-panel]'));

    if (!filtering) {
      this.filterPanelEl.hidden = true;
      this.filterPanelEl.classList.remove('is-in');
      lookPanels.forEach((p, idx) => {
        p.hidden = idx !== this.index;
        if (idx === this.index) p.classList.add('is-in');
      });
      this.panelTitleEl.textContent = 'In this look';
      const look = storeState.getLooks()[this.index];
      this.piecesEl.textContent = look?.piecesLabel || '3 pieces';
      return;
    }

    lookPanels.forEach((p) => {
      p.hidden = true;
    });
    this.filterPanelEl.hidden = false;
    this.filterPanelEl.classList.add('is-in');

    const matches = storeState
      .getProducts()
      .filter((item) =>
        `${item.name} ${item.vendor} ${item.type} ${item.storeCategory}`.toLowerCase().includes(query)
      );

    const title = 'Search Results';
    const countLabel = `${matches.length} ${matches.length === 1 ? 'piece' : 'pieces'}`;
    this.panelTitleEl.textContent = title;
    this.piecesEl.textContent = countLabel;
    this.filterMheadEl.textContent = title;
    this.filterMcountEl.textContent = countLabel;

    if (matches.length === 0) {
      this.filterItemsEl.innerHTML = '';
      this.filterItemsEl.hidden = true;
      this.filterEmptyEl.hidden = false;
    } else {
      this.filterItemsEl.hidden = false;
      this.filterEmptyEl.hidden = true;
      this.filterItemsEl.innerHTML = matches
        .map((item, idx) => this.renderProductCard(item, idx + 1, item.type, `filter_${item.id}`))
        .join('');
      this.filterItemsEl.querySelectorAll<HTMLElement>('[data-rw-card]').forEach((card) => {
        this.syncCardOptions(card, false);
      });
    }
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('[data-rw-scroll-runway]')) {
      this.scrollToRunway();
      return;
    }

    if (target.closest('[data-rw-explore]')) {
      this.navigateToCatalog('all');
      return;
    }

    if (target.closest('[data-rw-footwear]')) {
      this.scrollToRunway();
      return;
    }

    if (target.closest('[data-rw-filter-reset]')) {
      this.resetFilters();
      return;
    }

    if (
      this.panelEl.contains(target) &&
      target.closest('button, a, input, select, label')
    ) {
      this.engage();
    }

    if (target.closest('[data-rw-pick-close]')) {
      this.closeMobileSheet(true);
      return;
    }

    if (
      target.closest('[data-rw-zoom-close]') ||
      (this.zoomed && (target === this.lbEl || target === this.lbStageEl))
    ) {
      this.closePopup();
      return;
    }

    if (target.closest('[data-rw-zoom]')) {
      this.engage();
      this.openPopup();
      return;
    }

    if (target.closest('[data-rw-next]')) {
      this.next();
      return;
    }

    if (target.closest('[data-rw-prev]')) {
      this.prev();
      return;
    }

    const tickBtn = target.closest<HTMLElement>('[data-rw-tick]');
    if (tickBtn) {
      this.go(Number(tickBtn.dataset.rwTick));
      return;
    }

    if (target.closest('[data-rw-auto]')) {
      if (this.playing) {
        this.play(false);
      } else {
        this.engaged = false;
        this.play(true);
      }
      return;
    }

    const pinBtn = target.closest<HTMLElement>('[data-rw-pin]');
    if (pinBtn) {
      this.engage();
      const pinNum = Number(pinBtn.dataset.rwPin);
      this.hot(pinNum, true);
      const panel = this.panelEl.querySelector<HTMLElement>(`[data-rw-panel="${this.index}"]`);
      const card = panel?.querySelector<HTMLElement>(`[data-rw-card="${pinNum}"]`) || null;
      const productId = pinBtn.dataset.productId || card?.dataset.productId || '';
      if (productId && this.quickView) {
        const selectedVariantId = card?.dataset.selected ? Number(card.dataset.selected) : undefined;
        const look = storeState.getLooks()[this.index];
        this.quickView.open(
          {
            productId,
            lookLabel:
              card?.dataset.lookLabel || (look ? `Look 0${this.index + 1}: ${look.name}` : undefined),
            tag: card?.dataset.tag,
            selectedVariantId,
            cardEl: card,
            onAdded: (c) => {
              if (c) {
                c.dataset.touched = '1';
                this.markCardAdded(c);
                this.checkPanelComplete(c.closest<HTMLElement>('[data-rw-panel]'));
              }
            },
          },
          pinBtn
        );
      }
      return;
    }

    const goBtn = target.closest<HTMLElement>('[data-rw-go]');
    if (goBtn) {
      const model = goBtn.closest<HTMLElement>('[data-rw-model]');
      const idx = Number(model?.dataset.index ?? -1);
      const rank = this.getBodyRank(idx);
      if (rank === 0) {
        this.engage();
        this.openPopup();
      } else if (Math.abs(rank) < 6) {
        this.moveTo(Math.round(this.target) + rank);
      }
      return;
    }

    const confirmBtn = target.closest<HTMLElement>('[data-rw-confirm]');
    if (confirmBtn) {
      const card = confirmBtn.closest<HTMLElement>('[data-rw-card]') || this.activeSheetCard;
      if (card) {
        card.dataset.touched = '1';
        this.addSingleCard(card);
      }
      return;
    }

    const addBtn = target.closest<HTMLButtonElement>('[data-rw-add]');
    if (addBtn) {
      const card = addBtn.closest<HTMLElement>('[data-rw-card]');
      if (
        card &&
        !card.classList.contains('is-added') &&
        !card.classList.contains('is-loading')
      ) {
        this.togglePicker(card, addBtn);
      }
      return;
    }

    const allBtn = target.closest<HTMLButtonElement>('[data-rw-all]');
    if (allBtn) {
      const panel = allBtn.closest<HTMLElement>('[data-rw-panel]');
      if (panel) {
        this.addFullLook(panel, allBtn);
      }
      return;
    }

    const qvTrigger = target.closest<HTMLElement>('[data-rw-quickview]') || target.closest<HTMLElement>('.rw__info');
    if (qvTrigger) {
      const card = qvTrigger.closest<HTMLElement>('[data-rw-card]');
      const productId = qvTrigger.dataset.rwQuickview || card?.dataset.productId || '';
      if (productId && this.quickView) {
        const selectedVariantId = card?.dataset.selected ? Number(card.dataset.selected) : undefined;
        const focusTarget = qvTrigger.matches('button')
          ? qvTrigger
          : card?.querySelector<HTMLElement>('[data-rw-quickview].rw__name') || null;
        this.quickView.open(
          {
            productId,
            lookLabel: card?.dataset.lookLabel,
            tag: card?.dataset.tag,
            selectedVariantId,
            cardEl: card,
            onAdded: (c) => {
              if (c) {
                c.dataset.touched = '1';
                this.markCardAdded(c);
                this.checkPanelComplete(c.closest<HTMLElement>('[data-rw-panel]'));
              }
            },
          },
          focusTarget
        );
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.activeSheetPicker) {
        e.preventDefault();
        this.closeMobileSheet(true);
        return;
      }
      if (this.zoomed) {
        e.preventDefault();
        this.closePopup();
        return;
      }
    }
    if (document.activeElement === this.stageEl && this.mode === 'ring') {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      }
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.mode !== 'ring' || this.zoomed) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest('.rw__pin')) return;

    this.dragPointerId = e.pointerId;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartTarget = this.target;
    this.dragAxis = null;
    this.dragSamples = [];
    this.dragMoved = false;
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.dragPointerId !== e.pointerId) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) {
      this.onPointerUp(e);
      return;
    }
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    if (!this.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        this.dragAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        this.dragging = true;
        this.dragMoved = true;
        this.engage();
        this.classList.add('is-dragging');
        this.setStill(false);
        const startCoord = this.dragAxis === 'y' ? this.dragStartY : this.dragStartX;
        this.dragSamples = [{ x: startCoord, time: performance.now() }];
        try {
          this.stageEl.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      } else {
        return;
      }
    }

    const coord = this.dragAxis === 'y' ? e.clientY : e.clientX;
    const delta = this.dragAxis === 'y' ? dy : dx;
    this.dragSamples.push({ x: coord, time: performance.now() });
    if (this.dragSamples.length > 6) this.dragSamples.shift();
    this.target = this.dragStartTarget - delta / this.unit;
    this.kick();
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.dragPointerId !== e.pointerId) return;
    const wasDragging = this.dragging;
    const axis = this.dragAxis;
    this.dragPointerId = null;
    this.dragAxis = null;
    this.dragging = false;
    this.classList.remove('is-dragging');

    if (wasDragging) {
      try {
        if (this.stageEl.hasPointerCapture(e.pointerId)) {
          this.stageEl.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      if (this.dragMoved) {
        this.suppressClickUntil = performance.now() + 60;
      }

      const startCoord = axis === 'y' ? this.dragStartY : this.dragStartX;
      const endCoord = axis === 'y' ? e.clientY : e.clientX;
      const first = this.dragSamples[0] || { x: startCoord, time: performance.now() };
      const last = this.dragSamples[this.dragSamples.length - 1] || first;
      const dt = Math.max(1, last.time - first.time);
      const vx = (last.x - first.x) / dt;
      const delta = endCoord - startCoord;
      const base = Math.round(this.dragStartTarget);

      if (this.isMobile) {
        if (Math.abs(delta) > 30 || Math.abs(vx) > 0.3) {
          this.moveTo(base + (delta > 0 ? -1 : 1));
        } else {
          this.moveTo(base);
        }
      } else {
        let dest = Math.round(this.target - (vx * 160) / this.unit);
        if (dest === base && Math.abs(vx) > 0.3) {
          dest = base + (vx > 0 ? -1 : 1);
        }
        dest = clamp(dest, base - 2, base + 2);
        this.moveTo(dest);
      }
    }
  }

  private getHeaderHeight(): number {
    const selectors = [
      '.shopify-section-group-header-group',
      '#shopify-section-header',
      '#shopify-section-announcement-bar',
    ];
    let total = 0;
    const seen = new Set<Element>();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el) || el.contains(this)) return;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && window.getComputedStyle(el).display !== 'none') {
          total += rect.height;
        }
      });
    }
    return total || (window.innerWidth <= 749 ? 68 : 88);
  }

  private scheduleMeasure(): void {
    if (this.measureRaf !== 0) return;
    this.measureRaf = window.requestAnimationFrame(() => {
      this.measureRaf = 0;
      this.measure();
    });
  }

  private measure(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wasMobile = this.isMobile;
    this.isMobile = vw <= 749;

    if (vw !== this.latchedW || Math.abs(vh - this.latchedVh) >= 160) {
      this.latchedW = vw;
      this.latchedVh = vh;
    }

    const headerH = this.getHeaderHeight();
    const frameH = this.isMobile
      ? this.mode === 'banner'
        ? Math.max(520, vh - headerH)
        : Math.round((this.latchedVh * clamp(109, 50, 120)) / 100)
      : this.mode === 'banner'
        ? clamp(vh - headerH, 540, 820)
        : Math.max(380, vh - headerH);

    if (wasMobile && !this.isMobile) {
      this.closeMobileSheet(false);
    }

    const rect = this.stageEl.getBoundingClientRect();
    const nextStageW = Math.round(Math.max(100, rect.width || vw));
    const nextStageH = Math.round(Math.max(200, rect.height || frameH));
    const measureKey = `${headerH}|${frameH}|${nextStageW}|${nextStageH}|${this.isMobile ? 1 : 0}`;
    if (measureKey === this.lastMeasuredKey) {
      return;
    }
    this.lastMeasuredKey = measureKey;

    this.style.setProperty('--rw-header-h', `${headerH}px`);
    this.style.setProperty('--rw-frame-h', `${frameH}px`);

    this.stageW = nextStageW;
    this.stageH = nextStageH;

    const isDesktop = !this.isMobile;
    this.fs = isDesktop ? 1.08 : 1;
    this.stageEl.style.setProperty('--rw-fs', String(this.fs));

    const modelH = isDesktop
      ? 440
      : Math.max(220, Math.min(440, Math.round(this.stageH - 24 - 18)));
    this.stageEl.style.setProperty('--rw-model-h', `${modelH}px`);

    const hx = isDesktop ? 0.5 * this.stageW : 0.3 * this.stageW;
    const hy = isDesktop ? 24 : 22;
    this.stageEl.style.setProperty('--rw-hx', `${hx}px`);
    this.stageEl.style.setProperty('--rw-hy', `${hy}px`);
    this.style.setProperty('--rw-ax', `${((hx / this.stageW) * 100).toFixed(2)}%`);

    this.unit = isDesktop
      ? Math.max(120, 0.3 * this.stageW)
      : Math.max(90, this.stageW * 0.32 * 1.6);

    for (const b of this.bodies) {
      b.w = b.el.offsetWidth || Math.round(modelH * 0.5625);
    }

    if (this.mode === 'ring') {
      this.renderAll();
    }
  }

  private getBodyRank(idx: number): number {
    if (idx < 0) return 99;
    const step = (2 * Math.PI) / this.N;
    if (!this.isMobile) {
      let ang = ((idx - this.cur) * step) % (2 * Math.PI);
      if (ang > Math.PI) ang -= 2 * Math.PI;
      if (ang <= -Math.PI) ang += 2 * Math.PI;
      return Math.round(ang / step);
    }
    return Math.round(wrapN(idx - this.target, this.N));
  }

  private setStill(still: boolean): void {
    if (this.still !== still) {
      this.still = still;
      this.classList.toggle('rw--still', still);
    }
  }

  private setIndex(idx: number, silent = false): void {
    const wrapped = wrapN(idx, this.n);
    this.index = wrapped;

    for (const b of this.bodies) {
      const rank = this.getBodyRank(b.index);
      const maxRank = this.isMobile ? 3 : 2;
      const accessible = rank !== 0 && Math.abs(rank) <= maxRank;
      if (b.hit) b.hit.tabIndex = accessible ? 0 : -1;
      b.el.setAttribute('aria-hidden', accessible ? 'false' : 'true');
    }

    if (!silent) {
      this.closePopup();
      this.closeMobileSheet(false);

      if (this.mode === 'ring') {
        this.style.setProperty('--rw-progress', ((wrapped + 1) / this.n).toFixed(3));
      }

      this.heroes.forEach((h, i) => {
        const active = i === wrapped;
        const wasOn = h.el.classList.contains('is-on');
        h.el.classList.toggle('is-on', active);
        h.el.classList.toggle('was', !active && wasOn);
        h.el.setAttribute('aria-hidden', active ? 'false' : 'true');
        if (h.zoomBtn) h.zoomBtn.tabIndex = active ? 0 : -1;
      });

      if (!this.reducedMotion && this.mode === 'ring') {
        this.stageEl.classList.remove('is-sweep');
        void this.stageEl.offsetWidth;
        this.stageEl.classList.add('is-sweep');
      }

      const look = storeState.getLooks()[wrapped];
      this.liveEl.textContent = `Look ${wrapped + 1}: ${look?.name || ''}`;

      if (this.mode === 'ring') {
        this.ticksEl.querySelectorAll<HTMLElement>('[data-rw-tick]').forEach((tick, i) => {
          tick.setAttribute('aria-current', i === wrapped ? 'true' : 'false');
          tick.classList.toggle('is-past', i < wrapped);
        });
      }

      if (this.searchQuery.trim().length === 0) {
        const panels = Array.from(this.panelEl.querySelectorAll<HTMLElement>('[data-rw-panel]'));
        panels.forEach((p, i) => {
          p.classList.remove('is-in');
          p.hidden = i !== wrapped;
        });
        const activePanel = panels[wrapped];
        if (activePanel) {
          void activePanel.offsetWidth;
          activePanel.classList.add('is-in');
          this.panelTitleEl.textContent = 'In this look';
          const tpl = activePanel.querySelector<HTMLTemplateElement>('[data-rw-pieces-text]');
          if (tpl) {
            this.piecesEl.textContent = tpl.content.textContent || '3 pieces';
            this.piecesEl.classList.remove('is-swap');
            void this.piecesEl.offsetWidth;
            this.piecesEl.classList.add('is-swap');
          }
        }
      }

      this.syncPanelVisibility();
      this.clearHot();
      this.restartAutoTimer();
    }

    this.kick();
  }

  public next(): void {
    this.moveTo(Math.round(this.target) + 1);
  }

  public prev(): void {
    this.moveTo(Math.round(this.target) - 1);
  }

  public go(idx: number): void {
    let diff = wrapN(idx - this.index, this.n);
    if (diff > this.n / 2) diff -= this.n;
    this.moveTo(Math.round(this.target) + diff);
  }

  private moveTo(targetVal: number): void {
    this.target = targetVal;
    this.setStill(false);
    this.setIndex(targetVal);
    this.kick();
  }

  private play(enabled: boolean): void {
    if (this.mode === 'ring') {
      this.playing = enabled;
      this.autoBtn.classList.toggle('is-playing', enabled);
      this.autoBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      this.restartAutoTimer();
    } else {
      this.playing = false;
    }
  }

  private engage(): void {
    if (!this.engaged) {
      this.engaged = true;
      if (this.playing) this.play(false);
    }
  }

  private restartAutoTimer(): void {
    if (this.autoTimer !== null) {
      window.clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
    if (this.mode !== 'ring') return;

    const ticks = Array.from(this.ticksEl.querySelectorAll<HTMLElement>('[data-rw-tick]'));
    ticks.forEach((t) => t.classList.remove('is-run'));
    if (!this.playing) return;

    const curTick = ticks[this.index];
    if (curTick) {
      void curTick.offsetWidth;
      curTick.classList.add('is-run');
    }

    const delay = Number(this.dataset.speed || 5000);
    this.autoTimer = window.setTimeout(() => {
      if (
        this.mode === 'ring' &&
        this.playing &&
        this.visible &&
        !this.dragging &&
        !document.hidden &&
        !this.panelHover &&
        !this.zoomed &&
        !this.engaged
      ) {
        this.next();
      } else if (this.playing) {
        this.restartAutoTimer();
      }
    }, delay);
  }

  private kick(): void {
    if (this.mode === 'ring' && this.visible && !document.hidden && this.rafId === 0) {
      this.lastTickTime = performance.now();
      this.rafId = window.requestAnimationFrame((t) => this.stepLoop(t));
    }
  }

  private stepLoop(now: number): void {
    this.rafId = 0;
    if (this.mode !== 'ring' || !this.visible || document.hidden) return;

    const dt = this.lastTickTime ? Math.min(0.034, (now - this.lastTickTime) / 1000) : 1 / 60;
    this.lastTickTime = now;
    const critDamp = 2 * Math.sqrt(95);
    let settled = true;

    if (this.isMobile) {
      for (const b of this.bodies) {
        const goal = wrapN(b.index - this.target, this.N);
        if (Math.abs(goal - b.goal) > this.N / 2) {
          b.from = b.x;
          b.inTrip = true;
        }
        b.goal = goal;

        if (this.reducedMotion) {
          b.x = b.goal;
          b.g = b.goal;
          b.v = 0;
          b.inTrip = false;
        } else {
          const tau = this.dragging
            ? 0.016
            : b.inTrip
              ? 0.1
              : 0.03 + 0.04 * Math.min(b.goal, 4);
          b.g += (b.goal - b.g) * (1 - Math.exp(-dt / tau));
          const sub = dt / 3;
          for (let s = 0; s < 3; s++) {
            const acc = -95 * (b.x - b.g) - critDamp * b.v;
            b.v += acc * sub;
            b.x += b.v * sub;
          }
          if (b.inTrip && Math.abs(b.x - b.goal) < 0.02) {
            b.inTrip = false;
          }
          if (Math.abs(b.x - b.goal) <= 0.0006 && Math.abs(b.v) <= 0.0006 && !b.inTrip) {
            b.x = b.goal;
            b.g = b.goal;
            b.v = 0;
          } else {
            settled = false;
          }
        }
      }
      if (this.dragging) settled = false;
    } else if (this.dragging || this.reducedMotion) {
      this.cur = this.target;
      this.vel = 0;
      settled = !this.dragging;
    } else {
      const sub = dt / 3;
      for (let s = 0; s < 3; s++) {
        const acc = -95 * (this.cur - this.target) - critDamp * this.vel;
        this.vel += acc * sub;
        this.cur += this.vel * sub;
      }
      if (Math.abs(this.cur - this.target) <= 0.0005 && Math.abs(this.vel) <= 0.0005) {
        this.cur = this.target;
        this.vel = 0;
        settled = true;
      } else {
        settled = false;
      }
    }

    if (settled) {
      this.setStill(true);
      this.renderAll();
    } else {
      this.setStill(false);
      this.renderAll();
      this.rafId = window.requestAnimationFrame((t) => this.stepLoop(t));
    }
  }

  private put(
    b: BodyState,
    x: number,
    y: number,
    scale: number,
    opacity: number,
    blur: number,
    z: number
  ): void {
    const halfW = (b.w * scale) / 2;
    let visOpacity = opacity;
    if (x + halfW < -4 || x - halfW > this.stageW + 4) {
      visOpacity = 0;
    }
    b.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(-y).toFixed(1)}px, 0) translateX(-50%) scale(${scale.toFixed(4)})`;
    b.el.style.opacity = visOpacity.toFixed(3);
    b.el.style.zIndex = String(z);
    b.el.style.visibility = visOpacity < 0.01 ? 'hidden' : 'visible';
    b.el.style.pointerEvents = visOpacity < 0.5 ? 'none' : 'auto';

    const roundedBlur = Math.round(blur * 10) / 10;
    const filterStr = roundedBlur > 0.05 ? `blur(${roundedBlur}px)` : '';
    if (filterStr !== b.lastBlur) {
      b.lastBlur = filterStr;
      b.el.style.filter = filterStr;
    }
  }

  private renderAll(): void {
    const sw = this.stageW;
    const sh = this.stageH;

    if (this.isMobile) {
      const baseRatio = 0.3;
      for (const b of this.bodies) {
        let x = b.x;
        let fade = -1;
        if (b.inTrip) {
          const span = Math.max(0.001, Math.abs(b.goal - b.from));
          const frac = clamp(Math.abs(b.x - b.from) / span, 0, 1);
          if (b.goal > b.from) {
            if (frac < 0.5) fade = 2 * frac * 1.4;
            else x = b.goal + 2 * (1 - frac);
          } else if (frac < 0.5) {
            x = b.from + 2 * frac;
          } else {
            fade = 2 * (1 - frac) * 1.4;
          }
        } else if (x < 0) {
          fade = Math.min(-x, 1.4);
        }

        if (fade >= 0) {
          const px = sw * (baseRatio - 0.55 * fade);
          const py = 22 - 22 * fade;
          const sc = 1 + 0.14 * fade;
          const op = fade <= 0.95 ? 1 : 0;
          const bl = 4 * Math.min(fade, 1);
          this.put(b, px, py, sc, op, bl, 1100);
        } else {
          const px = sw * (baseRatio + 0.32 * x);
          const py = 22 + 22 * x;
          const sc = Math.pow(0.76, x);
          let op = x <= 3.5 ? 1 : 0;
          if (this.still && Math.abs(x) < 0.02) op = 0;
          const bl = Math.min(0.9 * x, 3.2);
          const z = 1000 - Math.round(10 * x);
          this.put(b, px, py, sc, op, bl, z);
        }
      }
    } else {
      const cx = 0.5 * sw;
      const rx = 0.62 * sw;
      const dist = 1.65 * sw;
      const frontY = sh - 24;
      const backY = 0.36 * sh;
      const step = (2 * Math.PI) / this.N;

      for (const b of this.bodies) {
        let ang = ((b.index - this.cur) * step) % (2 * Math.PI);
        if (ang > Math.PI) ang -= 2 * Math.PI;
        if (ang <= -Math.PI) ang += 2 * Math.PI;

        const persp = dist / (dist + rx * (1 - Math.cos(ang)));
        const unitsAway = Math.abs(ang) / step;
        const scale = persp * (1 + (this.fs - 1) * clamp(1 - unitsAway, 0, 1));
        const px = cx + rx * Math.sin(ang) * persp;
        const py = sh - (backY + (frontY - backY) * persp);
        const blur = unitsAway <= 1 ? 1.8 * unitsAway : Math.min(1.8 + (unitsAway - 1) * 2, 6.5);
        let op = Math.cos(ang) >= -0.35 ? 1 : 0;
        if (this.still && unitsAway < 0.02) op = 0;
        const z = Math.round(scale * 1000);
        this.put(b, px, py, scale, op, blur, z);
      }
    }
  }

  private kickCursor(): void {
    if (this.cursorRaf !== 0 || !this.cursorEl) return;
    const loop = () => {
      this.cursorRaf = 0;
      if (!this.cursorEl || !this.cursorEntered) return;
      const k = this.reducedMotion ? 1 : 0.18;
      this.cursorX += (this.cursorTx - this.cursorX) * k;
      this.cursorY += (this.cursorTy - this.cursorY) * k;
      this.cursorEl.style.transform = `translate3d(${this.cursorX.toFixed(1)}px, ${this.cursorY.toFixed(1)}px, 0)`;
      if (Math.hypot(this.cursorTx - this.cursorX, this.cursorTy - this.cursorY) >= 0.2) {
        this.cursorRaf = window.requestAnimationFrame(loop);
      }
    };
    this.cursorRaf = window.requestAnimationFrame(loop);
  }

  private detectAllFeet(): void {
    for (const h of this.heroes) {
      if (!h.probe) continue;
      const img = new Image();
      img.decoding = 'async';
      if (!h.probe.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        const natW = img.naturalWidth || 9;
        const natH = img.naturalHeight || 16;
        const naturalAr = clamp(natW / Math.max(1, natH), 0.25, 2.0).toFixed(4);
        h.figure.style.setProperty('--rw-ar', naturalAr);
        const hImg = h.el.querySelector<HTMLImageElement>('img[data-model-image]');
        if (hImg && natW > 0 && natH > 0) {
          hImg.width = natW;
          hImg.height = natH;
        }
        for (const b of this.bodies) {
          if (b.lookIndex === h.index) {
            const bFig = b.el.querySelector<HTMLElement>('.rw__figure');
            bFig?.style.setProperty('--rw-ar', naturalAr);
            const bImg = b.el.querySelector<HTMLImageElement>('img[data-model-image]');
            if (bImg && natW > 0 && natH > 0) {
              bImg.width = natW;
              bImg.height = natH;
            }
            b.w = b.el.offsetWidth || Math.round(440 * Number(naturalAr));
          }
        }
        try {
          const w = 96;
          const height = Math.max(1, Math.round((natH / Math.max(1, natW)) * w));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, w, height);
          const data = ctx.getImageData(0, 0, w, height).data;
          let bottomRow = height - 1;
          outer: for (let y = height - 1; y >= 0; y--) {
            for (let x = 0; x < w; x++) {
              if (data[(y * w + x) * 4 + 3] > 40) {
                bottomRow = y;
                break outer;
              }
            }
          }
          const footRatio = clamp((height - 1 - bottomRow) / height, 0, 0.4).toFixed(4);
          h.el.style.setProperty('--rw-foot', footRatio);
          for (const b of this.bodies) {
            if (b.lookIndex === h.index) {
              b.el.style.setProperty('--rw-foot', footRatio);
            }
          }
        } catch {
          // ignore cross-origin canvas errors
        }
      };
      img.src = h.probe;
    }
  }

  private clearHot(): void {
    this.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
  }

  private hot(num: number, scrollIntoView = false): void {
    this.clearHot();
    const container = this.zoomed ? this.lbEl : this.heroes[this.index]?.el;
    container?.querySelectorAll(`[data-rw-pin="${num}"]`).forEach((pin) => {
      pin.classList.add('is-hot');
    });
    const card = this.panelEl
      .querySelector<HTMLElement>(`[data-rw-panel="${this.index}"]`)
      ?.querySelector<HTMLElement>(`[data-rw-card="${num}"]`);
    if (card) {
      card.classList.add('is-hot');
      if (scrollIntoView) {
        this.revealCard(card);
      }
    }
  }

  private revealCard(card: HTMLElement): void {
    const list = card.closest<HTMLElement>('.rw__items');
    const behavior = this.reducedMotion ? 'auto' : 'smooth';
    if (list && list.scrollWidth > list.clientWidth + 2) {
      const lr = list.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      list.scrollBy({ left: cr.left - lr.left - 20, behavior });
    } else if (list && list.scrollHeight > list.clientHeight + 2) {
      list.scrollTo({ top: card.offsetTop - list.offsetTop - 12, behavior });
    } else {
      const cr = card.getBoundingClientRect();
      if (cr.top < 0 || cr.bottom > window.innerHeight - 140) {
        window.scrollBy({ top: cr.top - 0.3 * window.innerHeight, behavior });
      }
    }
  }

  private openPopup(): void {
    if (this.zoomed || this.mode !== 'ring') return;
    const hero = this.heroes[this.index];
    if (!hero) return;

    this.zoomed = true;
    this.clearHot();
    if (this.lbCloseTimer !== null) {
      window.clearTimeout(this.lbCloseTimer);
      this.lbCloseTimer = null;
    }

    const fromRect = hero.figure.getBoundingClientRect();
    this.lbStageEl.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'rw__lb-model';
    const clone = hero.el.querySelector('.rw__morph')!.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-rw-zoom]')?.remove();
    clone.querySelectorAll<HTMLElement>('[data-rw-pin]').forEach((p) => {
      p.tabIndex = 0;
    });

    const img = clone.querySelector<HTMLImageElement>('img[data-model-image]');
    const foot = hero.el.style.getPropertyValue('--rw-foot');
    if (foot) wrap.style.setProperty('--rw-foot', foot);

    const stageRect = this.lbStageEl.getBoundingClientRect();
    const figAr = parseFloat(hero.figure.style.getPropertyValue('--rw-ar') || '0.5625') || 0.5625;
    const modelH = Math.max(160, Math.min(stageRect.height, stageRect.width / figAr));
    wrap.style.setProperty('--rw-model-h', `${Math.round(modelH)}px`);

    if (img) {
      img.loading = 'eager';
      img.sizes = `${Math.round(modelH * figAr)}px`;
      this.decodeModelImage(img);
    }

    wrap.appendChild(clone);
    this.lbStageEl.appendChild(wrap);
    this.lbModelWrapper = wrap;

    const word = this.lbEl.dataset.word || 'Look';
    this.lbKickerEl.textContent = `${word} 0${this.index + 1}`;
    this.lbNameEl.textContent = hero.name;
    this.classList.add('rw--zoom');
    this.lbEl.setAttribute('aria-hidden', 'false');

    if (!this.reducedMotion && fromRect.height > 0) {
      const toRect = wrap.querySelector('.rw__figure')!.getBoundingClientRect();
      if (toRect.height > 0) {
        const dx = fromRect.left - toRect.left;
        const dy = fromRect.bottom - toRect.bottom;
        const s = fromRect.height / toRect.height;
        wrap.style.transition = 'none';
        wrap.style.transformOrigin = '0 100%';
        wrap.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${s})`;
        void wrap.offsetWidth;
        wrap.style.transition = '';
        wrap.style.transform = '';
      }
    }

    this.lbCloseBtn.focus({ preventScroll: true });
  }

  private closePopup(): void {
    if (!this.zoomed) return;
    this.zoomed = false;
    const focusInside = this.lbEl.contains(document.activeElement);

    if (!this.reducedMotion && this.lbModelWrapper) {
      const hero = this.heroes[this.index];
      const fig = this.lbModelWrapper.querySelector('.rw__figure');
      if (hero && fig) {
        const toRect = hero.figure.getBoundingClientRect();
        const fromRect = fig.getBoundingClientRect();
        if (toRect.height > 0 && fromRect.height > 0) {
          const dx = toRect.left - fromRect.left;
          const dy = toRect.bottom - fromRect.bottom;
          const s = toRect.height / fromRect.height;
          this.lbModelWrapper.style.transformOrigin = '0 100%';
          this.lbModelWrapper.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${s})`;
        }
      }
    }

    this.classList.remove('rw--zoom');
    this.lbEl.setAttribute('aria-hidden', 'true');
    this.lbCloseTimer = window.setTimeout(
      () => {
        this.lbStageEl.innerHTML = '';
        this.lbModelWrapper = null;
        this.lbCloseTimer = null;
      },
      this.reducedMotion ? 0 : 950
    );

    if (focusInside) {
      this.stageEl.focus({ preventScroll: true });
    }
  }

  private handleOptionChange(e: Event, markTouched: boolean): void {
    const input = (e.target as HTMLElement | null)?.closest<HTMLInputElement>(
      'input[data-rw-option]'
    );
    if (!input) return;
    if (markTouched) this.engage();
    const card = input.closest<HTMLElement>('[data-rw-card]') || this.activeSheetCard;
    if (card) {
      this.syncCardOptions(card, true, input.closest<HTMLElement>('[data-rw-picker]') || undefined);
    }
  }

  private syncCardOptions(
    card: HTMLElement,
    markTouched: boolean,
    pickerOverride?: HTMLElement
  ): void {
    const picker = pickerOverride || card.querySelector<HTMLElement>('[data-rw-picker]');
    if (!picker) return;
    const script = picker.querySelector<HTMLScriptElement>('[data-rw-variants]');
    if (!script) return;

    const variants: { id: number; a: boolean; o: string[] }[] = JSON.parse(
      script.textContent || '[]'
    );
    const selectedVal =
      picker.querySelector<HTMLInputElement>('input[data-rw-option]:checked')?.value || '';

    picker.querySelectorAll<HTMLElement>('.rw__pill').forEach((pill) => {
      const val = pill.querySelector<HTMLInputElement>('input')?.value || '';
      const available = variants.some((v) => v.a && v.o[0] === val);
      pill.classList.toggle('is-unavailable', !available);
    });

    const chosen = variants.find((v) => v.a && v.o[0] === selectedVal);
    const confirmBtn = picker.querySelector<HTMLButtonElement>('[data-rw-confirm]');
    const confirmLabel = picker.querySelector<HTMLElement>('[data-rw-confirm-label]');

    if (chosen) {
      card.dataset.selected = String(chosen.id);
      if (confirmBtn) confirmBtn.disabled = false;
      if (confirmLabel) confirmLabel.textContent = confirmLabel.dataset.add || 'Add to bag';
    } else {
      delete card.dataset.selected;
      if (confirmBtn) confirmBtn.disabled = true;
      if (confirmLabel) confirmLabel.textContent = this.dataset.msgSoldout || 'Sold out';
    }

    if (markTouched) {
      card.dataset.touched = '1';
    }
  }

  private togglePicker(card: HTMLElement, trigger: HTMLButtonElement): void {
    const picker =
      card.querySelector<HTMLElement>('[data-rw-picker]') ||
      (this.activeSheetCard === card ? this.activeSheetPicker : null);
    if (!picker) return;

    if (card.classList.contains('is-picking')) {
      if (this.isMobile) {
        this.closeMobileSheet(true);
      } else {
        picker.hidden = true;
        card.classList.remove('is-picking');
        trigger.setAttribute('aria-expanded', 'false');
      }
    } else if (this.isMobile) {
      this.openMobileSheet(card, picker, trigger);
    } else {
      picker.hidden = false;
      card.classList.add('is-picking');
      trigger.setAttribute('aria-expanded', 'true');
      this.revealCard(card);
      picker.querySelector<HTMLElement>('input[data-rw-option]:checked')?.focus({
        preventScroll: true,
      });
    }
  }

  private openMobileSheet(
    card: HTMLElement,
    picker: HTMLElement,
    trigger: HTMLButtonElement
  ): void {
    this.closeMobileSheet(false);

    if (!this.sheetHost) {
      this.sheetHost = document.createElement('div');
      this.sheetHost.className = 'rw-sheet-host';

      const scrim = document.createElement('button');
      scrim.type = 'button';
      scrim.className = 'rw__pick-scrim';
      scrim.setAttribute('data-rw-pick-close', '');
      scrim.tabIndex = -1;
      scrim.setAttribute('aria-hidden', 'true');
      this.sheetHost.appendChild(scrim);

      this.sheetHost.addEventListener('click', (e) => {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        if (t.closest('[data-rw-pick-close]')) {
          this.closeMobileSheet(true);
        } else if (t.closest('[data-rw-confirm]') && this.activeSheetCard) {
          this.engage();
          this.activeSheetCard.dataset.touched = '1';
          this.addSingleCard(this.activeSheetCard);
        }
      });

      this.sheetHost.addEventListener('change', (e) => this.handleOptionChange(e, true));
      this.sheetHost.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeMobileSheet(true);
        }
      });
    }

    const cs = window.getComputedStyle(this);
    for (const prop of [
      '--rw-panel',
      '--rw-text',
      '--rw-muted',
      '--rw-line',
      '--rw-accent',
      '--rw-on-accent',
      '--rw-btn-bg',
      '--rw-btn-fg',
      '--rw-btn-radius',
      '--rw-pill-radius',
      '--rw-bar-r',
      '--rw-thumb-radius',
      '--rw-pt-size',
      '--rw-price',
      '--rw-opt',
      '--rw-ease',
      '--rw-ease-sheet',
      '--rw-ease-spring',
    ]) {
      this.sheetHost.style.setProperty(prop, cs.getPropertyValue(prop));
    }
    this.sheetHost.style.fontFamily = cs.fontFamily;
    this.sheetHost.style.color = cs.color;

    if (!this.sheetHost.isConnected) {
      document.body.appendChild(this.sheetHost);
    }

    this.activeSheetPicker = picker;
    this.activeSheetCard = card;
    this.activeSheetTrigger = trigger;

    picker.hidden = false;
    this.sheetHost.appendChild(picker);
    void this.sheetHost.offsetWidth;
    this.sheetHost.classList.add('is-open');
    this.classList.add('rw--picking');
    card.classList.add('is-picking');
    trigger.setAttribute('aria-expanded', 'true');
    picker.querySelector<HTMLElement>('input[data-rw-option]:checked')?.focus({
      preventScroll: true,
    });
  }

  private closeMobileSheet(restoreFocus: boolean): void {
    if (!this.activeSheetPicker || !this.activeSheetCard) return;
    const picker = this.activeSheetPicker;
    const card = this.activeSheetCard;
    const trigger = this.activeSheetTrigger;

    picker.hidden = true;
    card.appendChild(picker);
    card.classList.remove('is-picking');
    trigger?.setAttribute('aria-expanded', 'false');

    this.sheetHost?.classList.remove('is-open');
    this.classList.remove('rw--picking');
    this.activeSheetPicker = null;
    this.activeSheetCard = null;
    this.activeSheetTrigger = null;

    if (restoreFocus && trigger) {
      trigger.focus({ preventScroll: true });
    }
  }

  private addSingleCard(card: HTMLElement): void {
    const panel = card.closest<HTMLElement>('[data-rw-panel]');
    const msgEl = panel?.querySelector<HTMLElement>('[data-rw-msg]');
    if (msgEl) msgEl.textContent = '';

    const variantId = Number(card.dataset.selected);
    if (!Number.isSafeInteger(variantId)) {
      if (msgEl) {
        msgEl.textContent = this.dataset.msgError || 'Couldn’t add to bag. Please try again.';
      }
      return;
    }

    card.classList.add('is-loading');
    window.setTimeout(() => {
      try {
        this.bag?.add([{ id: variantId, quantity: 1 }]);
        card.classList.remove('is-loading');
        this.markCardAdded(card);
        this.checkPanelComplete(panel);
      } catch (err) {
        card.classList.remove('is-loading');
        if (msgEl) {
          msgEl.textContent =
            err instanceof Error
              ? err.message
              : this.dataset.msgError || 'Couldn’t add to bag. Please try again.';
        }
      }
    }, 180);
  }

  private markCardAdded(card: HTMLElement): void {
    card.classList.add('is-added');
    card.classList.remove('is-picking');
    const picker =
      card.querySelector<HTMLElement>('[data-rw-picker]') ||
      (this.activeSheetCard === card ? this.activeSheetPicker : null);
    if (this.activeSheetCard === card) {
      this.closeMobileSheet(false);
    } else if (picker) {
      picker.hidden = true;
    }
    const addBtn = card.querySelector<HTMLElement>('[data-rw-add]');
    if (addBtn) {
      addBtn.setAttribute('aria-label', addBtn.dataset.addedLabel || 'Added to bag');
      addBtn.removeAttribute('aria-expanded');
    }
    if (this.isMobile && !this.reducedMotion && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  }

  private addFullLook(panel: HTMLElement, btn: HTMLButtonElement): void {
    if (panel.classList.contains('is-complete') || btn.classList.contains('is-loading')) return;
    const msgEl = panel.querySelector<HTMLElement>('[data-rw-msg]');
    if (msgEl) msgEl.textContent = '';

    const cards = Array.from(panel.querySelectorAll<HTMLElement>('[data-rw-card]')).filter(
      (c) => !c.classList.contains('is-added')
    );

    const ready: { card: HTMLElement; id: number }[] = [];
    const needSize: HTMLElement[] = [];

    for (const card of cards) {
      const confirmDisabled =
        card.querySelector<HTMLButtonElement>('[data-rw-confirm]')?.disabled ?? false;
      if (confirmDisabled) continue;
      const vid = Number(card.dataset.selected);
      if (card.dataset.touched === '1' && Number.isSafeInteger(vid)) {
        ready.push({ card, id: vid });
      } else {
        needSize.push(card);
      }
    }

    if (ready.length > 0) {
      btn.classList.add('is-loading');
      ready.forEach((r) => r.card.classList.add('is-loading'));
      window.setTimeout(() => {
        try {
          this.bag?.add(ready.map((r) => ({ id: r.id, quantity: 1 })));
          btn.classList.remove('is-loading');
          ready.forEach((r) => {
            r.card.classList.remove('is-loading');
            this.markCardAdded(r.card);
          });
          this.checkPanelComplete(panel);
        } catch (err) {
          btn.classList.remove('is-loading');
          ready.forEach((r) => r.card.classList.remove('is-loading'));
          if (msgEl) {
            msgEl.textContent =
              err instanceof Error
                ? err.message
                : this.dataset.msgError || 'Couldn’t add to bag. Please try again.';
          }
        }
      }, 220);
    }

    if (needSize.length > 0) {
      if (this.isMobile) {
        const first = needSize[0];
        const trigger = first.querySelector<HTMLButtonElement>('[data-rw-add]');
        const picker = first.querySelector<HTMLElement>('[data-rw-picker]');
        if (trigger && picker) {
          this.openMobileSheet(first, picker, trigger);
        }
      } else {
        needSize.forEach((card) => {
          const picker = card.querySelector<HTMLElement>('[data-rw-picker]');
          const trigger = card.querySelector<HTMLElement>('[data-rw-add]');
          if (picker) picker.hidden = false;
          card.classList.add('is-picking');
          trigger?.setAttribute('aria-expanded', 'true');
        });
        this.revealCard(needSize[0]);
      }
      const names = needSize.map((c) => c.dataset.title || '').filter(Boolean).join(', ');
      const tpl = this.dataset.msgChoose || 'Pick a size for: [items]';
      if (msgEl) msgEl.textContent = tpl.replace('[items]', names);
    }
  }

  private checkPanelComplete(panel: HTMLElement | null): void {
    if (!panel) return;
    const cards = Array.from(panel.querySelectorAll<HTMLElement>('[data-rw-card]'));
    if (cards.length >= 2 && cards.every((c) => c.classList.contains('is-added'))) {
      panel.classList.add('is-complete');
      const msgEl = panel.querySelector<HTMLElement>('[data-rw-msg]');
      if (msgEl) msgEl.textContent = '';
    }
  }
}
