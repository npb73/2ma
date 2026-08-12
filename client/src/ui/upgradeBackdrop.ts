import { COLOR_COUNT, type SolidColor } from "@2ma/shared";

import redBall from "../game/balls/solid/assets/red_ball.png";
import yellowBall from "../game/balls/solid/assets/yellow_ball.png";
import greenBall from "../game/balls/solid/assets/green_ball.png";
import blueBall from "../game/balls/solid/assets/blue_ball.png";
import pinkBall from "../game/balls/solid/assets/pink_ball.png";
import { BALL_FISH } from "../game/balls/solid/pipeline";

const BALL_URLS = [redBall, yellowBall, greenBall, blueBall, pinkBall] as const;

interface Skin {
  size: number;
  data: Uint8ClampedArray;
}

interface FallBall {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  color: SolidColor;
  alpha: number;
  scrollX: number;
  scrollY: number;
  primed: boolean;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function quantize(v: number): number {
  return Math.round(v * 100) / 100;
}

function loadSkin(url: string): Promise<Skin> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const size = img.width;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const cctx = c.getContext("2d", { willReadFrequently: true })!;
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(img, 0, 0, size, size);
      const { data } = cctx.getImageData(0, 0, size, size);
      resolve({ size, data });
    };
    img.onerror = () => reject(new Error(`Failed to load ball skin: ${url}`));
    img.src = url;
  });
}

/**
 * Canvas port of BallFishEye: sphere warp + repeating skin scroll (rolling).
 */
function blitFishEyeBall(
  out: ImageData,
  skin: Skin,
  scrollX: number,
  scrollY: number,
  fish: number,
): void {
  const d = out.width;
  const skinSize = skin.size;
  const sd = skin.data;
  const od = out.data;
  const uvScale = d / skinSize;
  const sx = scrollX / skinSize;
  const sy = scrollY / skinSize;

  for (let py = 0; py < d; py++) {
    for (let px = 0; px < d; px++) {
      const pnx = ((px + 0.5) / d) * 2 - 1;
      const pny = ((py + 0.5) / d) * 2 - 1;
      const r2 = pnx * pnx + pny * pny;
      const oi = (py * d + px) * 4;
      if (r2 >= 1) {
        od[oi] = 0;
        od[oi + 1] = 0;
        od[oi + 2] = 0;
        od[oi + 3] = 0;
        continue;
      }

      const mask = 1 - smoothstep(0.92, 1, r2);
      const z = Math.sqrt(Math.max(1e-5, 1 - Math.min(r2, 1)));
      const wx = pnx + (pnx / (z + 0.35) - pnx) * fish;
      const wy = pny + (pny / (z + 0.35) - pny) * fish;
      const u = fract(sx + wx * 0.5 * uvScale);
      const v = fract(sy + wy * 0.5 * uvScale);
      const ix = Math.min(skinSize - 1, (u * skinSize) | 0);
      const iy = Math.min(skinSize - 1, (v * skinSize) | 0);
      const si = (iy * skinSize + ix) * 4;
      od[oi] = sd[si]!;
      od[oi + 1] = sd[si + 1]!;
      od[oi + 2] = sd[si + 2]!;
      od[oi + 3] = Math.round(sd[si + 3]! * mask);
    }
  }
}

function renderSizeForRadius(r: number): number {
  const d = Math.round(r * 2);
  if (d <= 16) return 16;
  if (d <= 24) return 24;
  if (d <= 32) return 32;
  if (d <= 40) return 40;
  return 48;
}

/**
 * Balls burst from screen center and roll outward; vignette on top.
 */
export function mountUpgradeBackdrop(host: HTMLElement): () => void {
  const fx = document.createElement("div");
  fx.style.cssText =
    "position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;";

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  const ctx = canvas.getContext("2d");

  const vignette = document.createElement("div");
  vignette.style.cssText = `
    position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(
      ellipse 70% 65% at 50% 45%,
      transparent 0%,
      transparent 35%,
      rgba(3,7,16,.45) 70%,
      rgba(3,7,16,.88) 100%
    );
  `;

  const dim = document.createElement("div");
  dim.style.cssText =
    "position:absolute;inset:0;background:rgba(3,7,16,.42);pointer-events:none;";

  fx.append(dim, canvas, vignette);
  host.append(fx);

  const balls: FallBall[] = [];
  const scratch = document.createElement("canvas");
  const scratchCtx = scratch.getContext("2d")!;
  scratchCtx.imageSmoothingEnabled = false;
  const frameBuf = new Map<number, ImageData>();

  let skins: Skin[] | null = null;
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = performance.now();
  let spawnAcc = 0;
  let disposed = false;
  let elapsed = 0;

  const resize = () => {
    const rect = host.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
  };

  /** Spawn at center with random outward velocity (rolling). */
  const spawnBurst = (speedMin: number, speedMax: number) => {
    const r = 8 + Math.random() * 20;
    const ang = Math.random() * Math.PI * 2;
    const spd = speedMin + Math.random() * (speedMax - speedMin);
    const cx = w * 0.5 + (Math.random() - 0.5) * 12;
    const cy = h * 0.5 + (Math.random() - 0.5) * 12;
    balls.push({
      x: cx,
      y: cy,
      r,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      color: Math.floor(Math.random() * COLOR_COUNT) as SolidColor,
      alpha: 0.55 + Math.random() * 0.4,
      scrollX: Math.random() * 64,
      scrollY: Math.random() * 64,
      primed: false,
    });
  };

  resize();

  const ro = new ResizeObserver(() => resize());
  ro.observe(host);

  void Promise.all(BALL_URLS.map((url) => loadSkin(url))).then((loaded) => {
    if (disposed) return;
    skins = loaded;
  });

  const drawBall = (b: FallBall) => {
    if (!ctx || !skins) return;
    const skin = skins[b.color];
    if (!skin) return;

    const size = renderSizeForRadius(b.r);
    if (scratch.width !== size || scratch.height !== size) {
      scratch.width = size;
      scratch.height = size;
      scratchCtx.imageSmoothingEnabled = false;
    }
    let frame = frameBuf.get(size);
    if (!frame || frame.width !== size) {
      frame = scratchCtx.createImageData(size, size);
      frameBuf.set(size, frame);
    }
    blitFishEyeBall(frame, skin, b.scrollX, b.scrollY, BALL_FISH);
    scratchCtx.putImageData(frame, 0, 0);

    ctx.save();
    ctx.globalAlpha = b.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    ctx.restore();
  };

  const frame = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    // Opening burst from center, then a steady trickle.
    if (elapsed < 0.55) {
      spawnAcc += dt;
      while (spawnAcc > 0.018 && balls.length < 42) {
        spawnAcc -= 0.018;
        spawnBurst(140, 320);
      }
    } else {
      spawnAcc += dt;
      while (spawnAcc > 0.12 && balls.length < 36) {
        spawnAcc -= 0.12;
        spawnBurst(90, 220);
      }
    }

    if (ctx) {
      ctx.clearRect(0, 0, w, h);
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i]!;
        const prevX = b.x;
        const prevY = b.y;
        // Mild drag so speeds settle while still flying off-screen.
        b.vx *= 1 - 0.15 * dt;
        b.vy *= 1 - 0.15 * dt;
        b.vy += 18 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.primed) {
          b.scrollX = quantize(b.scrollX - (b.x - prevX));
          b.scrollY = quantize(b.scrollY - (b.y - prevY));
        } else {
          b.primed = true;
        }

        const margin = b.r + 40;
        if (
          b.x < -margin ||
          b.x > w + margin ||
          b.y < -margin ||
          b.y > h + margin
        ) {
          balls.splice(i, 1);
          continue;
        }
        drawBall(b);
      }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    fx.remove();
  };
}
