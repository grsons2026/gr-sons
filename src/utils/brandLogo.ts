export const BRAND_LOGO_RAW_URL = '/assets/aistudio/image_a1e9073b_a8b2c1b6.jpg';

let cachedLogoPromise: Promise<string> | null = null;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function processBrandLogoToTransparentPng(src = BRAND_LOGO_RAW_URL): Promise<string> {
  if (cachedLogoPromise) return cachedLogoPromise;

  cachedLogoPromise = new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(src);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < h; y++) {
          const rowOffset = y * w * 4;
          for (let x = 0; x < w; x++) {
            const idx = rowOffset + x * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Strip dark/black background pixels completely
            if (r < 45 && g < 45 && b < 45) {
              data[idx + 3] = 0;
              continue;
            }

            // Smooth anti-aliased edge ramp and black-matte decontamination
            const maxChan = Math.max(r, g, b);
            if (maxChan < 84) {
              const alphaNorm = smoothstep(44, 84, maxChan);
              const nextAlpha = Math.round(alphaNorm * 255);
              if (nextAlpha <= 4) {
                data[idx + 3] = 0;
                continue;
              }
              const deMatte = Math.max(0.55, alphaNorm);
              data[idx] = Math.min(255, Math.round(r / deMatte));
              data[idx + 1] = Math.min(255, Math.round(g / deMatte));
              data[idx + 2] = Math.min(255, Math.round(b / deMatte));
              data[idx + 3] = nextAlpha;
            } else {
              data[idx + 3] = 255;
            }

            if (data[idx + 3] > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);

        if (maxX < minX || maxY < minY) {
          resolve(canvas.toDataURL('image/png'));
          return;
        }

        // Auto-crop tightly around the brushed-gold monogram and wordmark
        const pad = 2;
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(w - cropX, maxX - minX + 1 + pad * 2);
        const cropH = Math.min(h - cropY, maxY - minY + 1 + pad * 2);

        const out = document.createElement('canvas');
        out.width = cropW;
        out.height = cropH;
        const outCtx = out.getContext('2d');
        if (!outCtx) {
          resolve(canvas.toDataURL('image/png'));
          return;
        }
        outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(out.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };

    img.onerror = () => resolve(src);
    img.src = src;
  });

  return cachedLogoPromise;
}

export async function initBrandLogos(): Promise<void> {
  const logos = Array.from(document.querySelectorAll<HTMLImageElement>('img[data-brand-logo]'));
  if (!logos.length) return;

  const transparentPng = await processBrandLogoToTransparentPng(BRAND_LOGO_RAW_URL);
  for (const el of logos) {
    el.src = transparentPng;
    el.classList.add('is-logo-ready');
  }
}
