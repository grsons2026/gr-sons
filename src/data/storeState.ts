import {
  CatalogItem,
  CategorySizePreset,
  CloudSyncConfig,
  CustomLookPiece,
  DEFAULT_ADMIN_PIN,
  DEFAULT_CATALOG_ITEMS,
  DEFAULT_CLOUD_SYNC,
  DEFAULT_HERO_BANNER,
  DEFAULT_HERO_SLIDES,
  DEFAULT_LOOKS,
  DEFAULT_SHOWROOM,
  DEFAULT_SIZE_GUIDE,
  DEFAULT_STORE_CATEGORIES,
  DEFAULT_STORE_WHATSAPP,
  HeroBannerConfig,
  HeroSlideConfig,
  LookPieceRef,
  OrderStatus,
  RunwayLook,
  ShowroomConfig,
  SizeGuideConfig,
  StoreCategory,
  StoreCategoryDef,
  StoreOrder,
  StoreOrderItem,
  makeVariantsForCategory,
} from './catalog.ts';

export interface StoreSnapshot {
  categories?: StoreCategoryDef[];
  products: CatalogItem[];
  looks: RunwayLook[];
  heroBanner: HeroBannerConfig;
  showroom?: ShowroomConfig;
  sizeGuide?: SizeGuideConfig;
  orders?: StoreOrder[];
  storeWhatsapp?: string;
  adminPin?: string;
  showInThisLookGlobal?: boolean;
  updatedAt?: string;
}

export function sanitizeWhatsappDigits(raw: string, fallback = DEFAULT_STORE_WHATSAPP): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return fallback;
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('03')) {
    digits = `92${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith('3')) {
    digits = `92${digits}`;
  }
  return digits.length >= 9 ? digits : fallback;
}

type StoreListener = () => void;

const DB_NAME = 'runway-atelier-admin-db';
const DB_STORE = 'snapshots';
const DB_KEY = 'live-store-v1';
const LOCAL_SNAPSHOT_KEY = 'runway-atelier-store-v1';
const PIN_STORAGE_KEY = 'runway-atelier-admin-pin-v1';
const CLOUD_SYNC_STORAGE_KEY = 'runway-atelier-cloud-sync-v1';
const DEFAULT_PIN = DEFAULT_ADMIN_PIN;

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

function encodeTransparentCanvas(
  canvas: HTMLCanvasElement,
  quality = 0.65,
  maxChars = MAX_CLOUD_IMAGE_CHARS
): string {
  try {
    const qualities = [quality, 0.55, 0.45, 0.35, 0.25];
    for (const q of qualities) {
      const webp = canvas.toDataURL('image/webp', q);
      if (webp.startsWith('data:image/webp') && webp.length <= maxChars) {
        return webp;
      }
    }
  } catch {
    // fallback to JPEG compression under limit
  }
  return encodeJpegCanvasUnderLimit(canvas, maxChars <= 36000 ? 650 : 700, 0.62, maxChars, '#ffffff');
}

function trimTransparentCanvas(
  srcCanvas: HTMLCanvasElement,
  quality = 0.65,
  maxChars = MAX_CLOUD_IMAGE_CHARS
): string {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return encodeTransparentCanvas(srcCanvas, quality, maxChars);

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
    return encodeTransparentCanvas(srcCanvas, quality, maxChars);
  }

  const outW = Math.max(1, maxX - minX + 1);
  const outH = Math.max(1, maxY - minY + 1);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return encodeTransparentCanvas(srcCanvas, quality, maxChars);

  outCtx.clearRect(0, 0, outW, outH);
  outCtx.drawImage(srcCanvas, minX, minY, outW, outH, 0, 0, outW, outH);
  return encodeTransparentCanvas(outCanvas, quality, maxChars);
}

export async function removeBackgroundCanvasBFS(
  file: File,
  maxWidth = 700,
  tolerance = 14,
  quality = 0.65,
  maxChars = MAX_CLOUD_IMAGE_CHARS
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
        resolve(trimTransparentCanvas(canvas, quality, maxChars));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function compressImageFile(
  file: File,
  maxWidth = 700,
  quality = 0.65,
  maxChars = MAX_CLOUD_IMAGE_CHARS
): Promise<string> {
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
      resolve(encodeJpegCanvasUnderLimit(canvas, targetMaxW, Math.min(0.65, quality), maxChars, '#ffffff'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

class StoreStateManager {
  private categories: StoreCategoryDef[] = cloneDeep(DEFAULT_STORE_CATEGORIES);
  private products: CatalogItem[] = cloneDeep(DEFAULT_CATALOG_ITEMS);
  private looks: RunwayLook[] = cloneDeep(DEFAULT_LOOKS);
  private heroBanner: HeroBannerConfig = cloneDeep(DEFAULT_HERO_BANNER);
  private showroom: ShowroomConfig = cloneDeep(DEFAULT_SHOWROOM);
  private sizeGuide: SizeGuideConfig = cloneDeep(DEFAULT_SIZE_GUIDE);
  private orders: StoreOrder[] = [];
  private deletedOrderIds = new Set<string>();
  private storeWhatsapp: string = DEFAULT_STORE_WHATSAPP;
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

    if (Array.isArray(saved.categories) && saved.categories.length > 0) {
      const seen = new Set<string>();
      const cleaned: StoreCategoryDef[] = [];
      for (const raw of saved.categories) {
        if (!raw || typeof raw.id !== 'string' || typeof raw.label !== 'string') continue;
        const id = raw.id.trim();
        const label = raw.label.trim();
        if (!id || id === 'all' || !label || seen.has(id)) continue;
        seen.add(id);
        const preset: CategorySizePreset | undefined =
          raw.sizePreset === 'trousers' ||
          raw.sizePreset === 'shoes' ||
          raw.sizePreset === 'one-size' ||
          raw.sizePreset === 'apparel'
            ? raw.sizePreset
            : undefined;
        cleaned.push(preset ? { id, label, sizePreset: preset } : { id, label });
      }
      if (cleaned.length > 0) {
        this.categories = cleaned;
      }
    }

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
        const catId = String(p.storeCategory || '').trim();
        if (catId && catId !== 'all' && !this.categories.some((c) => c.id === catId)) {
          this.categories.push({
            id: catId,
            label: this.formatCategoryFallbackLabel(catId),
          });
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
    if (saved.sizeGuide && typeof saved.sizeGuide === 'object') {
      const sg = saved.sizeGuide;
      this.sizeGuide = {
        apparel: Array.isArray(sg.apparel) && sg.apparel.length > 0 ? cloneDeep(sg.apparel) : cloneDeep(DEFAULT_SIZE_GUIDE.apparel),
        trousers: Array.isArray(sg.trousers) && sg.trousers.length > 0 ? cloneDeep(sg.trousers) : cloneDeep(DEFAULT_SIZE_GUIDE.trousers),
        shoes: Array.isArray(sg.shoes) && sg.shoes.length > 0 ? cloneDeep(sg.shoes) : cloneDeep(DEFAULT_SIZE_GUIDE.shoes),
        note: typeof sg.note === 'string' && sg.note.trim() ? sg.note : DEFAULT_SIZE_GUIDE.note,
      };
    }
    if (typeof saved.storeWhatsapp === 'string' && saved.storeWhatsapp.trim()) {
      this.storeWhatsapp = sanitizeWhatsappDigits(saved.storeWhatsapp);
    }
    if (Array.isArray(saved.orders)) {
      const incoming = saved.orders.filter(
        (o) => !this.deletedOrderIds.has(o.id) && !this.deletedOrderIds.has(o.orderNumber)
      );
      this.orders = this.mergeOrderLists(this.orders, incoming);
    }
    if (typeof saved.adminPin === 'string' && /^\d{4,6}$/.test(saved.adminPin.trim())) {
      this.adminPin = saved.adminPin.trim();
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, this.adminPin);
      } catch {
        // ignore
      }
    }
    if (typeof saved.showInThisLookGlobal === 'boolean') {
      this.showInThisLookGlobal = saved.showInThisLookGlobal;
    }
  }

  private normalizeOrder(raw: Partial<StoreOrder>): StoreOrder | null {
    if (!raw || typeof raw.orderNumber !== 'string' || !raw.orderNumber.trim()) return null;
    const status: OrderStatus =
      raw.status === 'Dispatched' || raw.status === 'Delivered' ? raw.status : 'Pending';
    const items: StoreOrderItem[] = Array.isArray(raw.items)
      ? raw.items.map((it) => ({
          productId: String(it.productId || ''),
          name: String(it.name || 'Garment'),
          size: String(it.size || ''),
          quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
          unitPrice: Math.max(0, Math.round(Number(it.unitPrice) || 0)),
          totalPrice: Math.max(0, Math.round(Number(it.totalPrice) || 0)),
          storeCategory:
            typeof it.storeCategory === 'string' && it.storeCategory.trim()
              ? it.storeCategory.trim()
              : 'shirts',
        }))
      : [];
    const createdAt =
      typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
        ? raw.createdAt
        : new Date().toISOString();
    return {
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : raw.orderNumber.trim(),
      orderNumber: raw.orderNumber.trim(),
      customerName: String(raw.customerName || 'Guest Customer'),
      phone: String(raw.phone || ''),
      address: String(raw.address || ''),
      items,
      subtotal: Math.max(0, Math.round(Number(raw.subtotal) || 0)),
      delivery: Math.max(0, Math.round(Number(raw.delivery) || 0)),
      total: Math.max(0, Math.round(Number(raw.total) || 0)),
      status,
      createdAt,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
    };
  }

  private mergeOrderLists(existing: StoreOrder[], incoming: StoreOrder[]): StoreOrder[] {
    const byNum = new Map<string, StoreOrder>();
    for (const raw of existing) {
      const norm = this.normalizeOrder(raw);
      if (norm) byNum.set(norm.orderNumber, norm);
    }
    for (const raw of incoming) {
      const norm = this.normalizeOrder(raw);
      if (!norm) continue;
      const prev = byNum.get(norm.orderNumber);
      if (!prev) {
        byNum.set(norm.orderNumber, norm);
      } else {
        const prevTs = Date.parse(prev.updatedAt || prev.createdAt) || 0;
        const nextTs = Date.parse(norm.updatedAt || norm.createdAt) || 0;
        if (nextTs >= prevTs) {
          byNum.set(norm.orderNumber, norm);
        }
      }
    }
    return Array.from(byNum.values())
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
      .slice(0, 120);
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
        const mergedLocal = this.buildPublicSnapshot();
        await idbSetSnapshot(mergedLocal);
        this.emit();
      } else if (Array.isArray(remote.orders) && remote.orders.length > 0) {
        this.orders = this.mergeOrderLists(this.orders, remote.orders);
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
    const catId = custom.storeCategory || this.categories[0]?.id || 'shirts';
    const varInfo = makeVariantsForCategory(catId, baseId, this.getCategoryPreset(catId));
    const id = custom.id || `custom-look-${look.key}-p${pieceNum}`;
    return {
      id,
      name: custom.name.trim() || `Look 0${look.index + 1} Piece 0${pieceNum}`,
      vendor: custom.vendor?.trim() || "GR SON'S Atelier",
      category: varInfo.category,
      storeCategory: catId,
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

  private formatCategoryFallbackLabel(slug: string): string {
    return slug
      .split(/[-_]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private slugifyCategoryId(label: string): string {
    const base =
      label
        .toLowerCase()
        .replace(/&/g, ' ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
    const safeBase = base === 'all' ? 'collection' : base;
    let candidate = safeBase;
    let suffix = 2;
    while (candidate === 'all' || this.categories.some((c) => c.id === candidate)) {
      candidate = `${safeBase}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  public getCategories(): StoreCategoryDef[] {
    return this.categories;
  }

  public getCategoryLabel(categoryId: string): string {
    if (!categoryId || categoryId === 'all') return 'All Products';
    const found = this.categories.find((c) => c.id === categoryId);
    if (found) return found.label;
    return this.formatCategoryFallbackLabel(categoryId);
  }

  public getCategoryPreset(categoryId: string): CategorySizePreset | undefined {
    return this.categories.find((c) => c.id === categoryId)?.sizePreset;
  }

  public addCategory(
    label: string,
    sizePreset: CategorySizePreset = 'apparel'
  ): StoreCategoryDef | null {
    const cleanLabel = label.trim();
    if (!cleanLabel) return null;
    const id = this.slugifyCategoryId(cleanLabel);
    const created: StoreCategoryDef = { id, label: cleanLabel, sizePreset };
    this.categories = [...this.categories, created];
    this.emit();
    return created;
  }

  public updateCategory(
    id: string,
    patch: { label?: string; sizePreset?: CategorySizePreset }
  ): void {
    const target = this.categories.find((c) => c.id === id);
    if (!target) return;
    if (typeof patch.label === 'string') {
      const clean = patch.label.trim();
      if (clean) target.label = clean;
    }
    if (patch.sizePreset) {
      target.sizePreset = patch.sizePreset;
    }
    this.emit();
  }

  public deleteCategory(id: string): {
    ok: boolean;
    reassignedCount: number;
    message: string;
  } {
    if (this.categories.length <= 1) {
      return {
        ok: false,
        reassignedCount: 0,
        message: 'At least one storefront section must remain active.',
      };
    }
    const target = this.categories.find((c) => c.id === id);
    if (!target) {
      return { ok: false, reassignedCount: 0, message: 'Section not found.' };
    }
    const remaining = this.categories.filter((c) => c.id !== id);
    const fallback = remaining[0];
    let reassignedCount = 0;

    for (const prod of this.products) {
      if (prod.storeCategory === id) {
        prod.storeCategory = fallback.id;
        reassignedCount += 1;
      }
    }
    for (const look of this.looks) {
      for (const piece of look.pieces) {
        if (piece.customItem && piece.customItem.storeCategory === id) {
          piece.customItem.storeCategory = fallback.id;
        }
      }
    }

    this.categories = remaining;
    this.emit();
    return {
      ok: true,
      reassignedCount,
      message:
        reassignedCount > 0
          ? `Deleted "${target.label}" and moved ${reassignedCount} ${reassignedCount === 1 ? 'item' : 'items'} to "${fallback.label}".`
          : `Deleted "${target.label}" section.`,
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

  public async updateAdminPin(newPin: string): Promise<{ ok: boolean; message: string }> {
    const clean = newPin.trim();
    if (!/^\d{4,6}$/.test(clean)) {
      return { ok: false, message: 'PIN must be 4 to 6 numeric digits.' };
    }
    this.adminPin = clean;
    try {
      window.localStorage.setItem(PIN_STORAGE_KEY, clean);
    } catch {
      // ignore
    }
    await this.saveAllChanges(true);
    const cloud = this.getCloudSync();
    return {
      ok: true,
      message: cloud.endpointUrl.trim()
        ? 'Owner PIN updated & synced globally to Cloud!'
        : 'Owner PIN updated locally.',
    };
  }

  public getStoreWhatsapp(): string {
    return this.storeWhatsapp;
  }

  public setStoreWhatsapp(raw: string): void {
    this.storeWhatsapp = sanitizeWhatsappDigits(raw, DEFAULT_STORE_WHATSAPP);
    this.emit();
  }

  public getOrders(): StoreOrder[] {
    return this.orders;
  }

  public async placeOrder(input: {
    orderNumber: string;
    customerName: string;
    phone: string;
    address: string;
    items: StoreOrderItem[];
    subtotal: number;
    delivery: number;
    total: number;
  }): Promise<StoreOrder> {
    const now = new Date().toISOString();
    const order: StoreOrder = {
      id: `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: input.orderNumber.trim(),
      customerName: input.customerName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      items: cloneDeep(input.items),
      subtotal: Math.max(0, Math.round(input.subtotal)),
      delivery: Math.max(0, Math.round(input.delivery)),
      total: Math.max(0, Math.round(input.total)),
      status: 'Pending',
      createdAt: now,
      updatedAt: now,
    };

    // Pull latest remote orders first if cloud configured so we don't overwrite owner's other live orders
    const endpoint = this.cloudSync.endpointUrl.trim();
    if (endpoint) {
      const remote = await this.fetchRemoteSnapshot(endpoint, this.cloudSync.apiKey);
      if (remote && Array.isArray(remote.orders)) {
        this.orders = this.mergeOrderLists(this.orders, remote.orders);
      }
    }

    this.orders = [order, ...this.orders].slice(0, 120);
    await this.saveAllChanges(true);
    return order;
  }

  public async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const target = this.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;
    target.status = status;
    target.updatedAt = new Date().toISOString();
    this.emit();
    await this.saveAllChanges(true);
  }

  public async deleteOrder(orderId: string): Promise<void> {
    const target = this.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;
    this.deletedOrderIds.add(target.id);
    this.deletedOrderIds.add(target.orderNumber);
    this.orders = this.orders.filter((o) => o.id !== target.id && o.orderNumber !== target.orderNumber);
    this.emit();
    await this.saveAllChanges(true);
  }

  public findOrdersByQuery(rawQuery: string): StoreOrder[] {
    const q = rawQuery.trim();
    if (!q) return [];
    const normalizedId = q.replace(/^#/, '').toLowerCase();
    const digits = q.replace(/\D/g, '');
    return this.orders.filter((o) => {
      if (o.orderNumber.toLowerCase() === normalizedId || o.orderNumber.toLowerCase().includes(normalizedId)) {
        return true;
      }
      if (digits.length >= 4) {
        const ordDigits = o.phone.replace(/\D/g, '');
        const ordWa = sanitizeWhatsappDigits(o.phone, '');
        if (ordDigits.includes(digits) || ordWa.includes(digits)) {
          return true;
        }
      }
      return false;
    });
  }

  public getSizeGuide(): SizeGuideConfig {
    return this.sizeGuide;
  }

  public updateSizeGuide(next: SizeGuideConfig): void {
    this.sizeGuide = cloneDeep(next);
    this.emit();
  }

  public resetSizeGuideDefault(): void {
    this.sizeGuide = cloneDeep(DEFAULT_SIZE_GUIDE);
    this.emit();
  }

  public buildPublicSnapshot(): StoreSnapshot {
    return {
      categories: cloneDeep(this.categories),
      products: cloneDeep(this.products),
      looks: cloneDeep(this.looks),
      heroBanner: cloneDeep(this.heroBanner),
      showroom: cloneDeep(this.showroom),
      sizeGuide: cloneDeep(this.sizeGuide),
      orders: cloneDeep(this.orders),
      storeWhatsapp: this.storeWhatsapp,
      adminPin: this.adminPin,
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
    this.categories = cloneDeep(DEFAULT_STORE_CATEGORIES);
    this.products = cloneDeep(DEFAULT_CATALOG_ITEMS);
    this.looks = cloneDeep(DEFAULT_LOOKS);
    this.heroBanner = cloneDeep(DEFAULT_HERO_BANNER);
    this.showroom = cloneDeep(DEFAULT_SHOWROOM);
    this.sizeGuide = cloneDeep(DEFAULT_SIZE_GUIDE);
    this.orders = [];
    this.storeWhatsapp = DEFAULT_STORE_WHATSAPP;
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

  public getProductGallery(item: CatalogItem): string[] {
    const list: string[] = [];
    if (Array.isArray(item.images)) {
      for (const img of item.images) {
        if (typeof img === 'string' && img.trim() && list.length < 4) {
          list.push(img.trim());
        }
      }
    }
    if (list.length === 0 && item.image) {
      list.push(item.image);
    } else if (item.image && list[0] !== item.image) {
      list[0] = item.image;
    }
    return list.slice(0, 4);
  }

  public getProductSku(item: CatalogItem): string {
    if (item.sku && item.sku.trim()) return item.sku.trim();
    const baseNum = item.variants?.[0]?.id ? String(item.variants[0].id).slice(-4) : '1001';
    let prefix = 'GR';
    if (item.storeCategory === 'waistcoats-coats') {
      prefix = 'WC';
    } else if (item.storeCategory === 'trousers') {
      prefix = 'TR';
    } else if (item.storeCategory === 'shoes') {
      prefix = 'FT';
    } else if (item.storeCategory === 'shirts') {
      prefix = 'SH';
    } else {
      const words = this.getCategoryLabel(item.storeCategory)
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const initials =
        words.length >= 2
          ? `${words[0][0]}${words[1][0]}`
          : (words[0] || item.storeCategory || 'GR').slice(0, 2);
      prefix = initials.toUpperCase() || 'GR';
    }
    return `GR-${prefix}-${baseNum}`;
  }

  public getProductFabricNotes(item: CatalogItem): string {
    if (item.fabricNotes && item.fabricNotes.trim()) return item.fabricNotes.trim();
    if (item.storeCategory === 'waistcoats-coats') {
      return 'Full-canvas Italian worsted wool & cashmere-blend structure with horn hardware, satin lining, and pick-stitched lapels tailored at our Gujranwala Atelier.';
    }
    if (item.storeCategory === 'trousers') {
      return 'Structured drape-cut weave crafted for all-day poise, reinforced French fly waistband, and crisp crease retention.';
    }
    if (item.storeCategory === 'shoes') {
      return 'Hand-burnished full-grain leather uppers paired with breathable calfskin lining and cushioned Goodyear-inspired sole architecture.';
    }
    if (item.storeCategory === 'shirts') {
      return 'Long-staple combed Egyptian cotton weave finished with mother-of-pearl sheen buttons, structured collar interfacing, and breathable single-needle tailoring.';
    }
    const catLabel = this.getCategoryLabel(item.storeCategory);
    return `Signature ${catLabel} piece crafted with heirloom finishing, refined cloth weight, and hand-inspected detailing from GR SON'S Gujranwala Atelier.`;
  }

  public addProduct(input: {
    name: string;
    vendor: string;
    price: number;
    storeCategory: Exclude<StoreCategory, 'all'>;
    image: string;
    images?: string[];
    sku?: string;
    fabricNotes?: string;
    type?: string;
  }): CatalogItem {
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.nextVariantBase += 100;
    const preset = this.getCategoryPreset(input.storeCategory);
    const varInfo = makeVariantsForCategory(input.storeCategory, this.nextVariantBase, preset);
    const catName = this.getCategoryLabel(input.storeCategory);

    const mainImage = input.image || input.images?.[0] || DEFAULT_CATALOG_ITEMS[0].image;
    const gallery = [mainImage, ...(input.images || []).slice(1)].filter(Boolean).slice(0, 4);

    const newItem: CatalogItem = {
      id,
      name: input.name.trim() || 'Untitled Garment',
      vendor: input.vendor.trim() || "GR SON'S Atelier",
      category: varInfo.category,
      storeCategory: input.storeCategory,
      type: input.type?.trim() || `Atelier Collection · ${catName}`,
      price: Math.max(0, Math.round(Number(input.price) || 0)),
      image: mainImage,
      images: gallery,
      sku: input.sku?.trim() || undefined,
      fabricNotes: input.fabricNotes?.trim() || undefined,
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
      images: string[];
      sku: string;
      fabricNotes: string;
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
      const imgs = this.getProductGallery(item);
      imgs[0] = patch.image;
      item.images = imgs.slice(0, 4);
    }
    if (Array.isArray(patch.images)) {
      const cleaned = patch.images.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 4);
      if (cleaned.length > 0) {
        item.image = cleaned[0];
        item.images = cleaned;
      }
    }
    if (typeof patch.sku === 'string') {
      item.sku = patch.sku.trim();
    }
    if (typeof patch.fabricNotes === 'string') {
      item.fabricNotes = patch.fabricNotes.trim();
    }
    if (typeof patch.type === 'string' && patch.type.trim()) {
      item.type = patch.type.trim();
    }
    if (patch.storeCategory && patch.storeCategory !== item.storeCategory) {
      this.nextVariantBase += 100;
      const preset = this.getCategoryPreset(patch.storeCategory);
      const varInfo = makeVariantsForCategory(patch.storeCategory, this.nextVariantBase, preset);
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

  public updateProductGallerySlot(id: string, slotIndex: number, imageUrl: string): void {
    const item = this.products.find((p) => p.id === id);
    if (!item || slotIndex < 0 || slotIndex > 3) return;
    const clean = imageUrl.trim();
    const slots: string[] = [
      item.images?.[0] || item.image || '',
      item.images?.[1] || '',
      item.images?.[2] || '',
      item.images?.[3] || '',
    ];
    if (!clean) {
      if (slotIndex === 0) return; // cannot clear primary slot without replacement
      slots[slotIndex] = '';
    } else {
      slots[slotIndex] = clean;
    }
    const compacted = slots.filter(Boolean).slice(0, 4);
    if (compacted.length > 0) {
      item.image = compacted[0];
      item.images = compacted;
      this.emit();
    }
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
