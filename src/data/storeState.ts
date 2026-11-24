import {
  CatalogItem,
  CloudSyncConfig,
  CustomLookPiece,
  DEFAULT_CATALOG_ITEMS,
  DEFAULT_CLOUD_SYNC,
  DEFAULT_HERO_BANNER,
  DEFAULT_HERO_SLIDES,
  DEFAULT_LOOKS,
  DEFAULT_SHOWROOM,
  HeroBannerConfig,
  HeroSlideConfig,
  LookPieceRef,
  RunwayLook,
  ShowroomConfig,
  StoreCategory,
  makeVariantsForCategory,
} from './catalog.ts';

export interface StoreSnapshot {
  products: CatalogItem[];
  looks: RunwayLook[];
  heroBanner: HeroBannerConfig;
  showroom?: ShowroomConfig;
  adminPin?: string;
  showInThisLookGlobal?: boolean;
  updatedAt?: string;
}

type StoreListener = () => void;

const DB_NAME = 'runway-atelier-admin-db';
const DB_STORE = 'snapshots';
const DB_KEY = 'live-store-v1';
const LOCAL_SNAPSHOT_KEY = 'runway-atelier-store-v1';
const PIN_STORAGE_KEY = 'runway-atelier-admin-pin-v1';
const CLOUD_SYNC_STORAGE_KEY = 'runway-atelier-cloud-sync-v1';
const DEFAULT_PIN = '1234';

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

async function idbGetSnapshot(): Promise<StoreSnapshot | null> {
  try {
    const db = await openDb();
    return await new Promise<StoreSnapshot | null>((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(DB_KEY);
      req.onsuccess = () => {
        resolve((req.result as StoreSnapshot | undefined) || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSetSnapshot(snapshot: StoreSnapshot): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const req = store.put(snapshot, DB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to save to IndexedDB'));
    });
  } catch {
    // ignore IndexedDB failures cleanly
  }
}

async function idbDeleteSnapshot(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const req = store.delete(DB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

export async function readOriginalImageFile(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

const MAX_CLOUD_IMAGE_CHARS = 45 * 1024;

function encodeJpegCanvasUnderLimit(
  srcCanvas: HTMLCanvasElement,
  maxWidth = 700,
  initialQuality = 0.65,
  maxChars = MAX_CLOUD_IMAGE_CHARS,
  fillBg = '#ffffff'
): string {
  const natW = Math.max(1, srcCanvas.width);
  const natH = Math.max(1, srcCanvas.height);
  const baseScale = Math.min(1, maxWidth / natW, 2000 / Math.max(1, natH));
  let curW = Math.max(1, Math.round(natW * baseScale));
  let curH = Math.max(1, Math.round(natH * baseScale));

  const work = document.createElement('canvas');
  const ctx = work.getContext('2d');
  if (!ctx) return srcCanvas.toDataURL('image/jpeg', initialQuality);

  const renderJpeg = (w: number, h: number, q: number): string => {
    work.width = w;
    work.height = h;
    ctx.fillStyle = fillBg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(srcCanvas, 0, 0, w, h);
    return work.toDataURL('image/jpeg', q);
  };

  let best = renderJpeg(curW, curH, initialQuality);
  if (best.length <= maxChars) return best;

  const qualities = [0.58, 0.5, 0.42, 0.34, 0.26];
  for (const q of qualities) {
    best = renderJpeg(curW, curH, q);
    if (best.length <= maxChars) return best;
  }

  for (let pass = 0; pass < 4 && best.length > maxChars; pass++) {
    curW = Math.max(240, Math.round(curW * 0.8));
    curH = Math.max(180, Math.round(curH * 0.8));
    for (const q of [0.6, 0.5, 0.4, 0.3]) {
      best = renderJpeg(curW, curH, q);
      if (best.length <= maxChars) return best;
    }
  }

  return best;
}

function encodeTransparentCanvas(canvas: HTMLCanvasElement, quality = 0.65): string {
  try {
    const qualities = [quality, 0.55, 0.45, 0.35];
    for (const q of qualities) {
      const webp = canvas.toDataURL('image/webp', q);
      if (webp.startsWith('data:image/webp') && webp.length <= MAX_CLOUD_IMAGE_CHARS) {
        return webp;
      }
    }
  } catch {
    // fallback to JPEG compression under 45KB
  }
  return encodeJpegCanvasUnderLimit(canvas, 700, 0.65, MAX_CLOUD_IMAGE_CHARS, '#ffffff');
}

function trimTransparentCanvas(srcCanvas: HTMLCanvasElement, quality = 0.65): string {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return encodeTransparentCanvas(srcCanvas, quality);

  const { data } = srcCtx.getImageData(0, 0, w, h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let rawMinX = w;
  let rawMinY = h;
  let rawMaxX = -1;
  let rawMaxY = -1;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const pos = rowOffset + x;
      if (data[pos * 4 + 3] <= 20) continue;

      if (x < rawMinX) rawMinX = x;
      if (x > rawMaxX) rawMaxX = x;
      if (y < rawMinY) rawMinY = y;
      if (y > rawMaxY) rawMaxY = y;

      // Ignore isolated 1-2px corner dust specs when computing tight crop
      let solidNeighbors = 0;
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y + 1 < h ? y + 1 : h - 1;
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x + 1 < w ? x + 1 : w - 1;
      for (let ny = y0; ny <= y1; ny++) {
        const nRow = ny * w;
        for (let nx = x0; nx <= x1; nx++) {
          if (ny === y && nx === x) continue;
          if (data[(nRow + nx) * 4 + 3] > 20) {
            solidNeighbors++;
          }
        }
      }

      if (solidNeighbors >= 2) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    minX = rawMinX;
    minY = rawMinY;
    maxX = rawMaxX;
    maxY = rawMaxY;
  }

  if (maxX <= minX || maxY <= minY) {
    return encodeTransparentCanvas(srcCanvas, quality);
  }

  const outW = Math.max(1, maxX - minX + 1);
  const outH = Math.max(1, maxY - minY + 1);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return encodeTransparentCanvas(srcCanvas, quality);

  outCtx.clearRect(0, 0, outW, outH);
  outCtx.drawImage(srcCanvas, minX, minY, outW, outH, 0, 0, outW, outH);
  return encodeTransparentCanvas(outCanvas, quality);
}

export async function removeBackgroundCanvasBFS(
  file: File,
  maxWidth = 700,
  tolerance = 14,
  quality = 0.65
): Promise<string> {
  const dataUrl = await readOriginalImageFile(file);
  if (typeof document === 'undefined') return dataUrl;

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const natW = img.naturalWidth || 1;
        const natH = img.naturalHeight || 1;
        const scale = Math.min(1, maxWidth / natW, 2000 / Math.max(1, natH));
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const origData = new Uint8ClampedArray(data);
        const n = w * h;

        // 1. Sample background colors from the 4 outer corners
        const cornerCoords: [number, number][] = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1],
        ];
        const rawCorners: [number, number, number][] = [];
        for (const [cx, cy] of cornerCoords) {
          const idx = (cy * w + cx) * 4;
          if (origData[idx + 3] > 12) {
            rawCorners.push([origData[idx], origData[idx + 1], origData[idx + 2]]);
          }
        }

        // Keep corners consistent with median corner cluster
        let bgCorners: [number, number, number][] = rawCorners;
        if (rawCorners.length >= 3) {
          const medR = [...rawCorners].sort((a, b) => a[0] - b[0])[Math.floor(rawCorners.length / 2)][0];
          const medG = [...rawCorners].sort((a, b) => a[1] - b[1])[Math.floor(rawCorners.length / 2)][1];
          const medB = [...rawCorners].sort((a, b) => a[2] - b[2])[Math.floor(rawCorners.length / 2)][2];
          const filtered = rawCorners.filter(([r, g, b]) => {
            const dr = r - medR;
            const dg = g - medG;
            const db = b - medB;
            return dr * dr + dg * dg + db * db <= 36 * 36;
          });
          if (filtered.length > 0) {
            bgCorners = filtered;
          }
        }

        const tolSq = tolerance * tolerance;

        const minColorDistSq = (r: number, g: number, b: number): number => {
          if (bgCorners.length === 0) return 999999;
          let best = 999999;
          for (let k = 0; k < bgCorners.length; k++) {
            const c = bgCorners[k];
            const dr = r - c[0];
            const dg = g - c[1];
            const db = b - c[2];
            const d2 = dr * dr + dg * dg + db * db;
            if (d2 < best) best = d2;
          }
          return best;
        };

        const isBgPixel = (pos: number): boolean => {
          const i = pos * 4;
          if (origData[i + 3] <= 12) return true;
          return minColorDistSq(origData[i], origData[i + 1], origData[i + 2]) <= tolSq;
        };

        // Pass 1: Strict outer-border BFS flood-fill (tolerance = 14)
        const visited = new Uint8Array(n);
        const queue = new Int32Array(n);
        let head = 0;
        let tail = 0;

        const trySeed = (pos: number) => {
          if (!visited[pos] && isBgPixel(pos)) {
            visited[pos] = 1;
            queue[tail++] = pos;
          }
        };

        for (let x = 0; x < w; x++) {
          trySeed(x);
          trySeed((h - 1) * w + x);
        }
        for (let y = 0; y < h; y++) {
          trySeed(y * w);
          trySeed(y * w + w - 1);
        }

        while (head < tail) {
          const pos = queue[head++];
          const x = pos % w;
          const y = (pos - x) / w;

          if (x > 0) {
            const nb = pos - 1;
            if (!visited[nb] && isBgPixel(nb)) {
              visited[nb] = 1;
              queue[tail++] = nb;
            }
          }
          if (x + 1 < w) {
            const nb = pos + 1;
            if (!visited[nb] && isBgPixel(nb)) {
              visited[nb] = 1;
              queue[tail++] = nb;
            }
          }
          if (y > 0) {
            const nb = pos - w;
            if (!visited[nb] && isBgPixel(nb)) {
              visited[nb] = 1;
              queue[tail++] = nb;
            }
          }
          if (y + 1 < h) {
            const nb = pos + w;
            if (!visited[nb] && isBgPixel(nb)) {
              visited[nb] = 1;
              queue[tail++] = nb;
            }
          }
        }

        // Pass 2: Interior Hole Seal
        // Seal 1-2px edge pinholes via morphological closing (dilate 1px -> erode 1px)
        const dilate1 = new Uint8Array(n);
        for (let y = 0; y < h; y++) {
          const row = y * w;
          const y0 = y > 0 ? y - 1 : 0;
          const y1 = y + 1 < h ? y + 1 : h - 1;
          for (let x = 0; x < w; x++) {
            const pos = row + x;
            if (!visited[pos]) {
              dilate1[pos] = 1;
              continue;
            }
            const x0 = x > 0 ? x - 1 : 0;
            const x1 = x + 1 < w ? x + 1 : w - 1;
            let hit = 0;
            for (let ny = y0; ny <= y1 && !hit; ny++) {
              const nRow = ny * w;
              for (let nx = x0; nx <= x1; nx++) {
                if (!visited[nRow + nx]) {
                  hit = 1;
                  break;
                }
              }
            }
            dilate1[pos] = hit;
          }
        }

        const closedFg = new Uint8Array(n);
        for (let y = 0; y < h; y++) {
          const row = y * w;
          const y0 = y > 0 ? y - 1 : 0;
          const y1 = y + 1 < h ? y + 1 : h - 1;
          for (let x = 0; x < w; x++) {
            const pos = row + x;
            if (!dilate1[pos]) continue;
            const x0 = x > 0 ? x - 1 : 0;
            const x1 = x + 1 < w ? x + 1 : w - 1;
            let allHit = 1;
            for (let ny = y0; ny <= y1 && allHit; ny++) {
              const nRow = ny * w;
              for (let nx = x0; nx <= x1; nx++) {
                if (!dilate1[nRow + nx]) {
                  allHit = 0;
                  break;
                }
              }
            }
            closedFg[pos] = allHit;
          }
        }

        // Flood exterior from outer edges over non-silhouette pixels to identify any trapped interior holes
        const extBg = new Uint8Array(n);
        head = 0;
        tail = 0;
        const trySeedExt = (pos: number) => {
          if (!extBg[pos] && !closedFg[pos]) {
            extBg[pos] = 1;
            queue[tail++] = pos;
          }
        };

        for (let x = 0; x < w; x++) {
          trySeedExt(x);
          trySeedExt((h - 1) * w + x);
        }
        for (let y = 0; y < h; y++) {
          trySeedExt(y * w);
          trySeedExt(y * w + w - 1);
        }

        while (head < tail) {
          const pos = queue[head++];
          const x = pos % w;
          const y = (pos - x) / w;

          if (x > 0) {
            const nb = pos - 1;
            if (!extBg[nb] && !closedFg[nb]) {
              extBg[nb] = 1;
              queue[tail++] = nb;
            }
          }
          if (x + 1 < w) {
            const nb = pos + 1;
            if (!extBg[nb] && !closedFg[nb]) {
              extBg[nb] = 1;
              queue[tail++] = nb;
            }
          }
          if (y > 0) {
            const nb = pos - w;
            if (!extBg[nb] && !closedFg[nb]) {
              extBg[nb] = 1;
              queue[tail++] = nb;
            }
          }
          if (y + 1 < h) {
            const nb = pos + w;
            if (!extBg[nb] && !closedFg[nb]) {
              extBg[nb] = 1;
              queue[tail++] = nb;
            }
          }
        }

        // Seal any enclosed transparent pixels back to solid opaque RGB (alpha = 255)
        const needInpaint: number[] = [];
        for (let pos = 0; pos < n; pos++) {
          const i = pos * 4;
          if (extBg[pos]) {
            data[i + 3] = 0;
          } else {
            data[i] = origData[i];
            data[i + 1] = origData[i + 1];
            data[i + 2] = origData[i + 2];
            data[i + 3] = 255;
            if (origData[i + 3] <= 12) {
              needInpaint.push(pos);
            }
          }
        }

        // If uploaded PNG already contained an enclosed alpha = 0 hole inside the garment, fill RGB from nearest opaque pixel
        if (needInpaint.length > 0) {
          const filled = new Uint8Array(n);
          head = 0;
          tail = 0;
          for (let pos = 0; pos < n; pos++) {
            if (!extBg[pos] && origData[pos * 4 + 3] > 12) {
              filled[pos] = 1;
              queue[tail++] = pos;
            }
          }
          while (head < tail) {
            const pos = queue[head++];
            const x = pos % w;
            const y = (pos - x) / w;
            const pi = pos * 4;
            const tryFill = (nb: number) => {
              if (!extBg[nb] && !filled[nb]) {
                filled[nb] = 1;
                const ni = nb * 4;
                data[ni] = data[pi];
                data[ni + 1] = data[pi + 1];
                data[ni + 2] = data[pi + 2];
                data[ni + 3] = 255;
                queue[tail++] = nb;
              }
            };
            if (x > 0) tryFill(pos - 1);
            if (x + 1 < w) tryFill(pos + 1);
            if (y > 0) tryFill(pos - w);
            if (y + 1 < h) tryFill(pos + w);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(trimTransparentCanvas(canvas, quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function compressImageFile(file: File, maxWidth = 700, quality = 0.65): Promise<string> {
  const dataUrl = await readOriginalImageFile(file);
  if (typeof document === 'undefined') return dataUrl;

  return await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth || 1;
      const natH = img.naturalHeight || 1;
      const targetMaxW = Math.min(700, maxWidth);
      const scale = Math.min(1, targetMaxW / natW, 2000 / Math.max(1, natH));
      const w = Math.max(1, Math.round(natW * scale));
      const h = Math.max(1, Math.round(natH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(encodeJpegCanvasUnderLimit(canvas, targetMaxW, Math.min(0.65, quality), MAX_CLOUD_IMAGE_CHARS, '#ffffff'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

class StoreStateManager {
  private products: CatalogItem[] = cloneDeep(DEFAULT_CATALOG_ITEMS);
  private looks: RunwayLook[] = cloneDeep(DEFAULT_LOOKS);
  private heroBanner: HeroBannerConfig = cloneDeep(DEFAULT_HERO_BANNER);
  private showroom: ShowroomConfig = cloneDeep(DEFAULT_SHOWROOM);
  private cloudSync: CloudSyncConfig = cloneDeep(DEFAULT_CLOUD_SYNC);
  private adminPin: string = DEFAULT_PIN;
  private showInThisLookGlobal = true;
  private listeners = new Set<StoreListener>();
  private nextVariantBase = 590000000;
  private hydrated = false;

  constructor() {
    try {
      const storedPin = window.localStorage.getItem(PIN_STORAGE_KEY);
      if (storedPin && storedPin.trim().length >= 4) {
        this.adminPin = storedPin.trim();
      }
    } catch {
      // ignore
    }
    try {
      const rawSync = window.localStorage.getItem(CLOUD_SYNC_STORAGE_KEY);
      if (rawSync) {
        const parsed = JSON.parse(rawSync) as Partial<CloudSyncConfig>;
        const storedEndpoint = parsed.endpointUrl?.trim() || '';
        const normalizedEndpoint = storedEndpoint.replace(/\/+$/, '');
        const resolvedEndpoint =
          !normalizedEndpoint ||
          normalizedEndpoint === 'https://jsonbin.io' ||
          normalizedEndpoint === 'https://api.jsonbin.io'
            ? DEFAULT_CLOUD_SYNC.endpointUrl
            : storedEndpoint;
        this.cloudSync = {
          ...cloneDeep(DEFAULT_CLOUD_SYNC),
          ...parsed,
          endpointUrl: resolvedEndpoint,
          apiKey: parsed.apiKey?.trim() || DEFAULT_CLOUD_SYNC.apiKey,
        };
      }
    } catch {
      // ignore
    }
  }

  private applySnapshot(saved: StoreSnapshot | null): void {
    if (!saved) return;

    if (Array.isArray(saved.products) && saved.products.length > 0) {
      const freshById = new Map(DEFAULT_CATALOG_ITEMS.map((item) => [item.id, item.image]));
      this.products = saved.products.map((p) => {
        const freshImg = freshById.get(p.id);
        if (freshImg && p.image && !p.image.startsWith('data:')) {
          return { ...p, image: freshImg };
        }
        return p;
      });
      for (const p of this.products) {
        for (const v of p.variants || []) {
          if (v.id >= this.nextVariantBase) {
            this.nextVariantBase = v.id + 100;
          }
        }
      }
    }
    if (Array.isArray(saved.looks) && saved.looks.length === DEFAULT_LOOKS.length) {
      this.looks = saved.looks;
    }
    if (saved.heroBanner && typeof saved.heroBanner.title === 'string') {
      const mergedBanner = { ...cloneDeep(DEFAULT_HERO_BANNER), ...saved.heroBanner };
      if (mergedBanner.ctaSecondary === 'SHOP FOOTWEAR') {
        mergedBanner.ctaSecondary = '3D VIRTUAL RUNWAY';
      }
      const savedSlides = Array.isArray(saved.heroBanner.slides) ? saved.heroBanner.slides : [];
      mergedBanner.slides = DEFAULT_HERO_SLIDES.map((defSlide, idx) => {
        const s = savedSlides[idx];
        const mergedSlide: HeroSlideConfig = s ? { ...cloneDeep(defSlide), ...s } : cloneDeep(defSlide);
        if (idx === 0 && !savedSlides[0]) {
          mergedSlide.image = mergedBanner.image || defSlide.image;
          mergedSlide.eyebrow = mergedBanner.eyebrow || defSlide.eyebrow;
          mergedSlide.title = mergedBanner.title || defSlide.title;
          mergedSlide.subtitle = mergedBanner.subtitle || defSlide.subtitle;
        }
        return mergedSlide;
      });
      this.heroBanner = mergedBanner;
    }
    if (saved.showroom && typeof saved.showroom === 'object') {
      this.showroom = { ...cloneDeep(DEFAULT_SHOWROOM), ...saved.showroom };
    }
    if (typeof saved.adminPin === 'string' && saved.adminPin.trim().length >= 4) {
      this.adminPin = saved.adminPin.trim();
    }
    if (typeof saved.showInThisLookGlobal === 'boolean') {
      this.showInThisLookGlobal = saved.showInThisLookGlobal;
    }
  }

  private async fetchRemoteSnapshot(url: string, apiKey = ''): Promise<StoreSnapshot | null> {
    const cleanUrl = url.trim();
    if (!cleanUrl) return null;
    try {
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        if (cleanUrl.includes('jsonbin.io')) {
          headers['X-Master-Key'] = apiKey.trim();
        } else {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        }
      }
      const res = await fetch(cleanUrl, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json') && !cleanUrl.endsWith('.json')) {
        // Guard against SPA HTML fallback returning 200 on missing /store-config.json
        const text = await res.text();
        if (!text.trim().startsWith('{')) return null;
        const parsed = JSON.parse(text) as StoreSnapshot & { record?: StoreSnapshot };
        const candidate = parsed.record && typeof parsed.record === 'object' ? parsed.record : parsed;
        if (candidate && (Array.isArray(candidate.products) || Array.isArray(candidate.looks))) {
          return candidate;
        }
        return null;
      }
      const rawJson = (await res.json()) as StoreSnapshot & { record?: StoreSnapshot };
      const candidate = rawJson.record && typeof rawJson.record === 'object' ? rawJson.record : rawJson;
      if (candidate && (Array.isArray(candidate.products) || Array.isArray(candidate.looks))) {
        return candidate;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    let saved: StoreSnapshot | null = await idbGetSnapshot();
    if (!saved) {
      try {
        const raw = window.localStorage.getItem(LOCAL_SNAPSHOT_KEY);
        if (raw) {
          saved = JSON.parse(raw) as StoreSnapshot;
        }
      } catch {
        saved = null;
      }
    }

    if (saved) {
      this.applySnapshot(saved);
      this.emit();
    }

    // Attempt global live sync from query URL, configured cloud endpoint, or hosted /store-config.json
    const params = new URLSearchParams(window.location.search);
    const paramConfigUrl = params.get('config') || params.get('cloud') || '';
    const candidateUrl = paramConfigUrl || this.cloudSync.endpointUrl || '/store-config.json';
    const remote = await this.fetchRemoteSnapshot(
      candidateUrl,
      paramConfigUrl ? '' : this.cloudSync.apiKey
    );
    if (remote) {
      const localTs = saved?.updatedAt ? Date.parse(saved.updatedAt) : 0;
      const remoteTs = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
      if (!saved || remoteTs >= localTs || candidateUrl !== '/store-config.json') {
        this.applySnapshot(remote);
        await idbSetSnapshot(remote);
        this.emit();
      }
    }
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private materializeCustomPiece(
    look: RunwayLook,
    pieceNum: number,
    custom: CustomLookPiece
  ): CatalogItem {
    const baseId = 650000000 + look.index * 1000 + pieceNum * 100;
    const varInfo = makeVariantsForCategory(custom.storeCategory || 'shirts', baseId);
    const id = custom.id || `custom-look-${look.key}-p${pieceNum}`;
    return {
      id,
      name: custom.name.trim() || `Look 0${look.index + 1} Piece 0${pieceNum}`,
      vendor: custom.vendor?.trim() || 'Nike Atelier',
      category: varInfo.category,
      storeCategory: custom.storeCategory || 'shirts',
      type: `From Look 0${look.index + 1} · ${look.name}`,
      price: Math.max(0, Math.round(Number(custom.price) || 0)),
      image: custom.image || DEFAULT_CATALOG_ITEMS[0].image,
      width: 400,
      height: 533,
      mobileWidth: 160,
      mobileHeight: 213,
      optionName: varInfo.optionName,
      sizes: varInfo.sizes,
      variants: varInfo.variants,
      url: `#quickview-${id}`,
    };
  }

  public getProducts(): CatalogItem[] {
    return this.products;
  }

  public getShoppableItems(): CatalogItem[] {
    const customItems: CatalogItem[] = [];
    const seen = new Set(this.products.map((p) => p.id));
    for (const look of this.looks) {
      for (const piece of look.pieces) {
        if (piece.customItem) {
          const item = this.materializeCustomPiece(look, piece.num, piece.customItem);
          if (!seen.has(item.id)) {
            seen.add(item.id);
            customItems.push(item);
          }
        }
      }
    }
    return [...this.products, ...customItems];
  }

  public getProductById(id: string): CatalogItem | undefined {
    const direct = this.products.find((p) => p.id === id);
    if (direct) return direct;
    for (const look of this.looks) {
      for (const piece of look.pieces) {
        if (piece.customItem && (piece.customItem.id === id || piece.productId === id)) {
          return this.materializeCustomPiece(look, piece.num, piece.customItem);
        }
      }
    }
    return undefined;
  }

  public getLookPieceResolved(
    lookIndex: number,
    pieceNum: number
  ): {
    mode: 'linked' | 'custom';
    pieceRef: LookPieceRef | undefined;
    item: CatalogItem | undefined;
  } {
    const look = this.looks[lookIndex];
    const pieceRef = look?.pieces.find((p) => p.num === pieceNum);
    if (!look || !pieceRef) {
      return { mode: 'linked', pieceRef: undefined, item: undefined };
    }
    if (pieceRef.mode === 'custom' && pieceRef.customItem) {
      return {
        mode: 'custom',
        pieceRef,
        item: this.materializeCustomPiece(look, pieceRef.num, pieceRef.customItem),
      };
    }
    return {
      mode: 'linked',
      pieceRef,
      item: this.getProductById(pieceRef.productId),
    };
  }

  public getShowInThisLookGlobal(): boolean {
    return this.showInThisLookGlobal;
  }

  public setShowInThisLookGlobal(show: boolean): void {
    this.showInThisLookGlobal = Boolean(show);
    this.emit();
  }

  public isLookPanelVisible(lookIndex: number): boolean {
    if (!this.showInThisLookGlobal) return false;
    const look = this.looks[lookIndex];
    return look ? look.showInThisLook !== false : true;
  }

  public setLookShowInThisLook(lookIndex: number, show: boolean): void {
    const look = this.looks[lookIndex];
    if (!look) return;
    look.showInThisLook = Boolean(show);
    this.emit();
  }

  public getLooks(): RunwayLook[] {
    return this.looks;
  }

  public getHeroBanner(): HeroBannerConfig {
    return this.heroBanner;
  }

  public getShowroom(): ShowroomConfig {
    return this.showroom;
  }

  public getCloudSync(): CloudSyncConfig {
    return this.cloudSync;
  }

  public updateCloudSync(patch: Partial<CloudSyncConfig>): void {
    this.cloudSync = {
      ...this.cloudSync,
      ...patch,
    };
    try {
      window.localStorage.setItem(CLOUD_SYNC_STORAGE_KEY, JSON.stringify(this.cloudSync));
    } catch {
      // ignore
    }
  }

  public updateShowroom(patch: Partial<ShowroomConfig>): void {
    const next: ShowroomConfig = {
      ...this.showroom,
      ...patch,
    };
    if (typeof patch.mapEmbedUrl === 'string' && patch.mapEmbedUrl.trim()) {
      const rawUrl = patch.mapEmbedUrl.trim();
      if (!rawUrl.includes('output=embed') && !rawUrl.includes('/maps/embed')) {
        if (rawUrl.startsWith('http')) {
          const encodedAddr = encodeURIComponent(next.address || rawUrl);
          next.mapEmbedUrl = `https://maps.google.com/maps?q=${encodedAddr}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
        } else {
          next.mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(rawUrl)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
        }
      }
    }
    this.showroom = next;
    this.emit();
  }

  public getAdminPin(): string {
    return this.adminPin;
  }

  public verifyPin(input: string): boolean {
    return input.trim() === this.adminPin;
  }

  public buildPublicSnapshot(): StoreSnapshot {
    return {
      products: cloneDeep(this.products),
      looks: cloneDeep(this.looks),
      heroBanner: cloneDeep(this.heroBanner),
      showroom: cloneDeep(this.showroom),
      showInThisLookGlobal: this.showInThisLookGlobal,
      updatedAt: new Date().toISOString(),
    };
  }

  public buildLiveConfigJson(): string {
    return JSON.stringify(this.buildPublicSnapshot(), null, 2);
  }

  public async pushToCloud(): Promise<{ ok: boolean; message: string }> {
    const endpoint = this.cloudSync.endpointUrl.trim();
    if (!endpoint) {
      return { ok: false, message: 'Enter a Firebase Realtime DB (.json) or JSONBin.io URL first.' };
    }
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.cloudSync.apiKey.trim()) {
        if (endpoint.includes('jsonbin.io')) {
          headers['X-Master-Key'] = this.cloudSync.apiKey.trim();
        } else {
          headers['Authorization'] = `Bearer ${this.cloudSync.apiKey.trim()}`;
        }
      }
      const payload = this.buildPublicSnapshot();
      const normalized = endpoint.replace(/\/+$/, '');
      const isBareJsonBinOrigin =
        normalized === 'https://jsonbin.io' || normalized === 'https://api.jsonbin.io';
      const targetUrl = isBareJsonBinOrigin ? 'https://api.jsonbin.io/v3/b' : endpoint;
      const method = isBareJsonBinOrigin ? 'POST' : 'PUT';

      const res = await fetch(targetUrl, {
        method,
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return { ok: false, message: `Cloud sync failed (HTTP ${res.status}). Check URL or access key.` };
      }
      if (isBareJsonBinOrigin) {
        try {
          const created = (await res.json()) as { metadata?: { id?: string } };
          const binId = created?.metadata?.id;
          if (binId) {
            this.updateCloudSync({
              endpointUrl: `https://api.jsonbin.io/v3/b/${binId}`,
              lastSyncedAt: payload.updatedAt || new Date().toISOString(),
            });
            return {
              ok: true,
              message: `Created Cloud JSONBin & synced live config (${binId})!`,
            };
          }
        } catch {
          // ignore JSON parse failure on bin creation
        }
      }
      this.updateCloudSync({ lastSyncedAt: payload.updatedAt || new Date().toISOString() });
      return { ok: true, message: 'Synced live store config globally to Cloud URL!' };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? `Cloud sync error: ${err.message}` : 'Network error during cloud sync.',
      };
    }
  }

  public async pullFromCloud(): Promise<{ ok: boolean; message: string }> {
    const endpoint = this.cloudSync.endpointUrl.trim();
    if (!endpoint) {
      return { ok: false, message: 'Enter a Cloud JSON URL first.' };
    }
    const remote = await this.fetchRemoteSnapshot(endpoint, this.cloudSync.apiKey);
    if (!remote) {
      return { ok: false, message: 'Could not read valid store config JSON from that URL.' };
    }
    this.applySnapshot(remote);
    await this.saveAllChanges(false);
    this.updateCloudSync({ lastSyncedAt: new Date().toISOString() });
    return { ok: true, message: 'Pulled latest global store config from Cloud URL!' };
  }

  public async saveAllChanges(pushCloudIfConfigured = true): Promise<void> {
    const snapshot: StoreSnapshot = {
      ...this.buildPublicSnapshot(),
      adminPin: this.adminPin,
    };
    await idbSetSnapshot(snapshot);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const serialized = JSON.stringify(snapshot);
      if (serialized.length <= 3_800_000) {
        window.localStorage.setItem(LOCAL_SNAPSHOT_KEY, serialized);
      }
    } catch {
      // ignore if localStorage quota is exceeded; IndexedDB already stored full snapshot
    }
    try {
      window.localStorage.setItem(PIN_STORAGE_KEY, this.adminPin);
    } catch {
      // ignore
    }
    if (pushCloudIfConfigured && this.cloudSync.autoSyncOnSave && this.cloudSync.endpointUrl.trim()) {
      await this.pushToCloud();
    }
    this.emit();
  }

  public async resetToDefault(): Promise<void> {
    this.products = cloneDeep(DEFAULT_CATALOG_ITEMS);
    this.looks = cloneDeep(DEFAULT_LOOKS);
    this.heroBanner = cloneDeep(DEFAULT_HERO_BANNER);
    this.showroom = cloneDeep(DEFAULT_SHOWROOM);
    this.adminPin = DEFAULT_PIN;
    this.showInThisLookGlobal = true;
    await idbDeleteSnapshot();
    try {
      window.localStorage.removeItem(LOCAL_SNAPSHOT_KEY);
      window.localStorage.removeItem(PIN_STORAGE_KEY);
    } catch {
      // ignore
    }
    this.emit();
  }

  public addProduct(input: {
    name: string;
    vendor: string;
    price: number;
    storeCategory: Exclude<StoreCategory, 'all'>;
    image: string;
    type?: string;
  }): CatalogItem {
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.nextVariantBase += 100;
    const varInfo = makeVariantsForCategory(input.storeCategory, this.nextVariantBase);
    const catName =
      input.storeCategory === 'shirts'
        ? 'Shirts'
        : input.storeCategory === 'waistcoats-coats'
          ? 'Waistcoats & Coats'
          : input.storeCategory === 'trousers'
            ? 'Trousers'
            : 'Shoes';

    const newItem: CatalogItem = {
      id,
      name: input.name.trim() || 'Untitled Garment',
      vendor: input.vendor.trim() || 'Nike Atelier',
      category: varInfo.category,
      storeCategory: input.storeCategory,
      type: input.type?.trim() || `Atelier Collection · ${catName}`,
      price: Math.max(0, Math.round(Number(input.price) || 0)),
      image: input.image || DEFAULT_CATALOG_ITEMS[0].image,
      width: 400,
      height: 533,
      mobileWidth: 160,
      mobileHeight: 213,
      optionName: varInfo.optionName,
      sizes: varInfo.sizes,
      variants: varInfo.variants,
      url: `#quickview-${id}`,
    };

    this.products = [newItem, ...this.products];
    this.emit();
    return newItem;
  }

  public updateProduct(
    id: string,
    patch: Partial<{
      name: string;
      vendor: string;
      price: number;
      storeCategory: Exclude<StoreCategory, 'all'>;
      image: string;
      type: string;
    }>
  ): void {
    const item = this.products.find((p) => p.id === id);
    if (!item) return;

    if (typeof patch.name === 'string') {
      item.name = patch.name.trim() || item.name;
    }
    if (typeof patch.vendor === 'string') {
      item.vendor = patch.vendor.trim() || item.vendor;
    }
    if (typeof patch.price === 'number' && Number.isFinite(patch.price)) {
      item.price = Math.max(0, Math.round(patch.price));
    }
    if (typeof patch.image === 'string' && patch.image) {
      item.image = patch.image;
    }
    if (typeof patch.type === 'string' && patch.type.trim()) {
      item.type = patch.type.trim();
    }
    if (patch.storeCategory && patch.storeCategory !== item.storeCategory) {
      this.nextVariantBase += 100;
      const varInfo = makeVariantsForCategory(patch.storeCategory, this.nextVariantBase);
      item.storeCategory = patch.storeCategory;
      item.category = varInfo.category;
      item.optionName = varInfo.optionName;
      item.sizes = varInfo.sizes;
      item.variants = varInfo.variants;
    }

    // Keep look pin labels synchronized with updated product names
    for (const look of this.looks) {
      for (const pin of look.pins) {
        if (pin.productId === item.id) {
          pin.productName = item.name;
        }
      }
    }

    this.emit();
  }

  public deleteProduct(id: string): void {
    this.products = this.products.filter((p) => p.id !== id);
    this.emit();
  }

  public getHeroSlides(): HeroSlideConfig[] {
    if (!Array.isArray(this.heroBanner.slides) || this.heroBanner.slides.length < 3) {
      this.heroBanner.slides = cloneDeep(DEFAULT_HERO_SLIDES);
    }
    return this.heroBanner.slides;
  }

  public updateHeroBanner(patch: Partial<HeroBannerConfig>): void {
    this.heroBanner = {
      ...this.heroBanner,
      ...patch,
    };
    this.emit();
  }

  public updateHeroSlide(slideIndex: number, patch: Partial<HeroSlideConfig>): void {
    const slides = this.getHeroSlides().map((s) => ({ ...s }));
    if (slideIndex < 0 || slideIndex >= slides.length) return;
    slides[slideIndex] = {
      ...slides[slideIndex],
      ...patch,
    };
    const nextBanner: HeroBannerConfig = {
      ...this.heroBanner,
      slides,
    };
    if (slideIndex === 0) {
      if (typeof patch.image === 'string') nextBanner.image = slides[0].image;
      if (typeof patch.eyebrow === 'string') nextBanner.eyebrow = slides[0].eyebrow;
      if (typeof patch.title === 'string') nextBanner.title = slides[0].title;
      if (typeof patch.subtitle === 'string') nextBanner.subtitle = slides[0].subtitle;
    }
    this.heroBanner = nextBanner;
    this.emit();
  }

  public restoreHeroSlideDefault(slideIndex: number): void {
    const def = DEFAULT_HERO_SLIDES[slideIndex];
    if (!def) return;
    this.updateHeroSlide(slideIndex, cloneDeep(def));
  }

  public updateLookModelImage(lookIndex: number, imageUrl: string): void {
    const look = this.looks[lookIndex];
    if (!look || !imageUrl) return;
    look.model640 = imageUrl;
    look.model1080 = imageUrl;
    this.emit();
  }

  public updateLookModelScale(lookIndex: number, scalePct: number): void {
    const look = this.looks[lookIndex];
    if (!look) return;
    const clamped = Math.max(80, Math.min(150, Math.round(Number(scalePct) || 100)));
    look.modelScale = clamped;
    this.emit();
  }

  public restoreSingleLookModel(lookIndex: number): void {
    const look = this.looks[lookIndex];
    const def = DEFAULT_LOOKS[lookIndex];
    if (!look || !def) return;
    look.model640 = def.model640;
    look.model1080 = def.model1080;
    look.modelScale = 100;
    this.emit();
  }

  public updateLookMeta(
    lookIndex: number,
    patch: { name?: string; description?: string }
  ): void {
    const look = this.looks[lookIndex];
    if (!look) return;
    if (typeof patch.name === 'string' && patch.name.trim()) {
      look.name = patch.name.trim();
    }
    if (typeof patch.description === 'string') {
      look.description = patch.description.trim();
    }
    this.emit();
  }

  public setLookPieceMode(
    lookIndex: number,
    pieceNum: number,
    mode: 'linked' | 'custom'
  ): void {
    const look = this.looks[lookIndex];
    if (!look) return;
    const pieceRef = look.pieces.find((p) => p.num === pieceNum);
    const pinRef = look.pins.find((p) => p.num === pieceNum);
    if (!pieceRef) return;

    const defaultCategory: Exclude<StoreCategory, 'all'> =
      pieceNum === 1 ? 'shirts' : pieceNum === 2 ? 'trousers' : 'shoes';
    const customId = `custom-look-${look.key}-p${pieceNum}`;

    if (mode === 'custom') {
      pieceRef.mode = 'custom';
      if (!pieceRef.customItem) {
        const currentLinked = this.products.find((p) => p.id === pieceRef.productId);
        pieceRef.customItem = {
          id: customId,
          name: currentLinked?.name || `Custom Piece 0${pieceNum}`,
          price: currentLinked?.price ?? 15000,
          image: currentLinked?.image || DEFAULT_CATALOG_ITEMS[0].image,
          vendor: currentLinked?.vendor || 'Nike Atelier',
          storeCategory: currentLinked?.storeCategory || defaultCategory,
        };
      } else {
        pieceRef.customItem.id = customId;
      }
      pieceRef.productId = customId;
      if (pinRef) {
        pinRef.productId = customId;
        pinRef.productName = pieceRef.customItem.name;
      }
      this.emit();
      return;
    }

    // Switching back to linked mode
    pieceRef.mode = 'linked';
    const defPiece = DEFAULT_LOOKS[lookIndex]?.pieces.find((p) => p.num === pieceNum);
    const preferredProd =
      (defPiece && this.products.find((p) => p.id === defPiece.productId)) || this.products[0];
    if (preferredProd) {
      pieceRef.productId = preferredProd.id;
      if (pinRef) {
        pinRef.productId = preferredProd.id;
        pinRef.productName = preferredProd.name;
      }
    }
    this.emit();
  }

  public setLookPieceLinkedProduct(
    lookIndex: number,
    pieceNum: number,
    productId: string
  ): void {
    const look = this.looks[lookIndex];
    if (!look) return;
    const pieceRef = look.pieces.find((p) => p.num === pieceNum);
    const pinRef = look.pins.find((p) => p.num === pieceNum);
    const targetProd = this.products.find((p) => p.id === productId);
    if (!pieceRef || !targetProd) return;

    pieceRef.mode = 'linked';
    pieceRef.productId = targetProd.id;
    if (pinRef) {
      pinRef.productId = targetProd.id;
      pinRef.productName = targetProd.name;
    }
    this.emit();
  }

  public updateLookPieceCustomItem(
    lookIndex: number,
    pieceNum: number,
    patch: Partial<CustomLookPiece>
  ): void {
    const look = this.looks[lookIndex];
    if (!look) return;
    const pieceRef = look.pieces.find((p) => p.num === pieceNum);
    const pinRef = look.pins.find((p) => p.num === pieceNum);
    if (!pieceRef) return;

    const customId = `custom-look-${look.key}-p${pieceNum}`;
    const defaultCategory: Exclude<StoreCategory, 'all'> =
      pieceNum === 1 ? 'shirts' : pieceNum === 2 ? 'trousers' : 'shoes';
    const baseProd = this.products.find((p) => p.id === pieceRef.productId);

    const prev: CustomLookPiece = pieceRef.customItem || {
      id: customId,
      name: baseProd?.name || `Custom Piece 0${pieceNum}`,
      price: baseProd?.price ?? 15000,
      image: baseProd?.image || DEFAULT_CATALOG_ITEMS[0].image,
      vendor: baseProd?.vendor || 'Nike Atelier',
      storeCategory: baseProd?.storeCategory || defaultCategory,
    };

    const next: CustomLookPiece = {
      ...prev,
      ...patch,
      id: customId,
      name:
        typeof patch.name === 'string'
          ? patch.name.trim() || prev.name
          : prev.name,
      price:
        typeof patch.price === 'number' && Number.isFinite(patch.price)
          ? Math.max(0, Math.round(patch.price))
          : prev.price,
      image: typeof patch.image === 'string' && patch.image ? patch.image : prev.image,
      vendor:
        typeof patch.vendor === 'string'
          ? patch.vendor.trim() || prev.vendor
          : prev.vendor,
      storeCategory: patch.storeCategory || prev.storeCategory,
    };

    pieceRef.mode = 'custom';
    pieceRef.customItem = next;
    pieceRef.productId = customId;
    if (pinRef) {
      pinRef.productId = customId;
      pinRef.productName = next.name;
    }
    this.emit();
  }

  public updateLookPieceProduct(
    lookIndex: number,
    pieceNum: number,
    patch: {
      productId?: string;
      name?: string;
      price?: number;
      vendor?: string;
      image?: string;
      storeCategory?: Exclude<StoreCategory, 'all'>;
    }
  ): void {
    const look = this.looks[lookIndex];
    if (!look) return;
    const pieceRef = look.pieces.find((p) => p.num === pieceNum);
    if (!pieceRef) return;

    if (patch.productId) {
      this.setLookPieceLinkedProduct(lookIndex, pieceNum, patch.productId);
      return;
    }

    if (pieceRef.mode === 'custom') {
      this.updateLookPieceCustomItem(lookIndex, pieceNum, {
        name: patch.name,
        price: patch.price,
        vendor: patch.vendor,
        image: patch.image,
        storeCategory: patch.storeCategory,
      });
      return;
    }

    const activeProd = this.products.find((p) => p.id === pieceRef.productId);
    if (activeProd) {
      this.updateProduct(activeProd.id, {
        name: patch.name,
        price: patch.price,
        vendor: patch.vendor,
        image: patch.image,
        storeCategory: patch.storeCategory,
      });
    } else {
      this.emit();
    }
  }
}

export const storeState = new StoreStateManager();
