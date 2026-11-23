export interface GravityBodyConfig {
  el: HTMLElement;
  initialDropY: number;
  delayMs: number;
  mass: number;
  stiffness: number;
  damping: number;
  maxExcursionY: number;
  mouseDepth: number;
}

interface GravityBodyState extends GravityBodyConfig {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  opacity: number;
  started: boolean;
  settled: boolean;
  elapsedDelayMs: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class GravityTextController {
  private bodies: GravityBodyState[] = [];
  private reducedMotion = false;
  private destroyed = false;
  private rafId = 0;
  private lastNow = 0;
  private startTime = 0;
  private lastScrollY = window.scrollY;
  private lastMouseX: number | null = null;
  private lastMouseY: number | null = null;
  private mouseRestTimer: number | null = null;

  private boundOnScroll: () => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseLeave: () => void;

  constructor(configs: GravityBodyConfig[], reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.startTime = performance.now();
    this.bodies = configs.map((cfg) => ({
      ...cfg,
      x: 0,
      y: this.reducedMotion ? 0 : cfg.initialDropY,
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      opacity: this.reducedMotion ? 1 : 0,
      started: this.reducedMotion,
      settled: this.reducedMotion,
      elapsedDelayMs: 0,
    }));

    this.boundOnScroll = () => this.onScroll();
    this.boundOnMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.boundOnMouseLeave = () => this.resetMouseTargets();

    window.addEventListener('scroll', this.boundOnScroll, { passive: true });
    window.addEventListener('mousemove', this.boundOnMouseMove, { passive: true });
    document.addEventListener('mouseleave', this.boundOnMouseLeave);

    this.applyTransforms();
    if (!this.reducedMotion) {
      this.kick();
    }
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      for (const b of this.bodies) {
        b.x = 0;
        b.y = 0;
        b.vx = 0;
        b.vy = 0;
        b.tx = 0;
        b.ty = 0;
        b.opacity = 1;
        b.started = true;
        b.settled = true;
      }
      this.applyTransforms();
    }
  }

  public pulseTarget(index: number, strength = 1): void {
    if (this.reducedMotion || this.destroyed) return;
    const b = this.bodies[index];
    if (!b) return;
    b.y = Math.min(b.y, -12 * strength);
    b.vy += 210 * strength;
    b.settled = false;
    this.kick();
  }

  private onScroll(): void {
    const sy = window.scrollY;
    const delta = sy - this.lastScrollY;
    this.lastScrollY = sy;
    if (this.reducedMotion || this.destroyed || Math.abs(delta) < 1) return;

    const now = performance.now();
    for (const b of this.bodies) {
      if (!b.started && now - this.startTime < b.delayMs) continue;
      b.started = true;
      b.opacity = 1;
      const impulse = clamp(delta * 9.5, -280, 280) / b.mass;
      b.vy += impulse;
      if (delta > 0) {
        b.y = clamp(b.y - Math.min(10, delta * 0.16), -b.maxExcursionY, b.maxExcursionY);
      }
      b.settled = false;
    }
    this.kick();
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.reducedMotion || this.destroyed) return;
    const prevX = this.lastMouseX;
    const prevY = this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    const dx = prevX === null ? 0 : e.clientX - prevX;
    const dy = prevY === null ? 0 : e.clientY - prevY;
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const nx = (e.clientX / vw - 0.5) * 2;
    const ny = (e.clientY / vh - 0.5) * 2;
    const now = performance.now();

    for (const b of this.bodies) {
      if (!b.started && now - this.startTime < b.delayMs) continue;
      b.started = true;
      b.opacity = 1;
      b.tx = clamp(nx * 5 * b.mouseDepth, -8, 8);
      b.ty = clamp(ny * 7 * b.mouseDepth, -10, 10);
      const impY = clamp(dy * 3.8 + Math.abs(dx) * 1.1, -135, 165) * b.mouseDepth;
      b.vy += impY / b.mass;
      b.vx += clamp(dx * 1.6, -90, 90) * b.mouseDepth;
      b.settled = false;
    }

    if (this.mouseRestTimer !== null) {
      window.clearTimeout(this.mouseRestTimer);
    }
    this.mouseRestTimer = window.setTimeout(() => this.resetMouseTargets(), 180);
    this.kick();
  }

  private resetMouseTargets(): void {
    if (this.destroyed) return;
    let changed = false;
    for (const b of this.bodies) {
      if (b.tx !== 0 || b.ty !== 0) {
        b.tx = 0;
        b.ty = 0;
        b.settled = false;
        changed = true;
      }
    }
    if (changed) this.kick();
  }

  private kick(): void {
    if (this.destroyed || this.rafId !== 0) return;
    this.lastNow = performance.now();
    this.rafId = window.requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    this.rafId = 0;
    if (this.destroyed) return;

    const dt = clamp((now - this.lastNow) / 1000, 0.001, 0.036);
    this.lastNow = now;
    const elapsed = now - this.startTime;
    let allDone = true;
    const subDt = dt / 2;

    for (const b of this.bodies) {
      if (!b.started) {
        if (elapsed >= b.delayMs) {
          b.started = true;
          b.vy = 140;
        } else {
          allDone = false;
          continue;
        }
      }

      b.opacity = Math.min(1, b.opacity + dt * 7.5);
      for (let step = 0; step < 2; step++) {
        const ax = (-b.stiffness * (b.x - b.tx) - b.damping * b.vx) / b.mass;
        const ay = (-b.stiffness * (b.y - b.ty) - b.damping * b.vy) / b.mass;
        b.vx += ax * subDt;
        b.vy += ay * subDt;
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;
      }

      b.x = clamp(b.x, -20, 20);
      b.y = clamp(b.y, Math.min(b.initialDropY - 20, -b.maxExcursionY), b.maxExcursionY);

      if (
        Math.abs(b.x - b.tx) < 0.08 &&
        Math.abs(b.y - b.ty) < 0.08 &&
        Math.abs(b.vx) < 0.35 &&
        Math.abs(b.vy) < 0.35 &&
        b.opacity >= 0.999
      ) {
        b.x = b.tx;
        b.y = b.ty;
        b.vx = 0;
        b.vy = 0;
        b.opacity = 1;
        b.settled = true;
      } else {
        b.settled = false;
        allDone = false;
      }
    }

    this.applyTransforms();
    if (!allDone) {
      this.rafId = window.requestAnimationFrame((t) => this.tick(t));
    }
  }

  private applyTransforms(): void {
    for (const b of this.bodies) {
      b.el.style.transform = `translate3d(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px, 0)`;
      b.el.style.opacity = b.opacity.toFixed(3);
    }
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.mouseRestTimer !== null) {
      window.clearTimeout(this.mouseRestTimer);
      this.mouseRestTimer = null;
    }
    window.removeEventListener('scroll', this.boundOnScroll);
    window.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mouseleave', this.boundOnMouseLeave);
  }
}
