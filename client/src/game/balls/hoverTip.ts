import {
  UI,
  getBallType,
} from "@2ma/shared";
import type Phaser from "phaser";
import { ballSwatch } from "./swatch";
import type { BallPainter } from "./painter";

const HOVER_DELAY_MS = 500;

export interface BallHit {
  id: string;
  typeId: string;
  x: number;
  y: number;
  radius: number;
}

/**
 * After holding the cursor on a ball for 0.5s, shows a properties tip above it.
 */
export class BallHoverTip {
  private readonly stage: HTMLElement;
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private hoverId: string | null = null;
  private hoverSince = 0;
  private visibleId: string | null = null;
  private lastContentKey = "";

  constructor(stage: HTMLElement) {
    this.stage = stage;
    this.root = document.createElement("div");
    this.root.style.cssText = `
      position:absolute; left:0; top:0; z-index:30; pointer-events:none;
      display:none; transform:translate(-50%, calc(-100% - 10px));
    `;
    this.panel = document.createElement("div");
    this.panel.style.cssText = `
      min-width:140px; max-width:200px; padding:10px 12px;
      border-radius:10px; border:1px solid ${UI.secondaryDark};
      background:rgba(4,21,40,.94); color:${UI.text};
      box-shadow:0 8px 24px rgba(0,0,0,.45);
      display:flex; flex-direction:column; align-items:center; gap:6px;
    `;
    this.root.append(this.panel);
    stage.append(this.root);
  }

  /**
   * Call once per frame after painters have drawn.
   * `enabled` false hides the tip (modals / leaving).
   */
  update(opts: {
    painters: BallPainter[];
    worldX: number;
    worldY: number;
    camera: Phaser.Cameras.Scene2D.Camera;
    canvas: HTMLCanvasElement;
    now: number;
    enabled: boolean;
  }): void {
    if (!opts.enabled) {
      this.hide();
      this.hoverId = null;
      return;
    }

    const hit = hitTest(opts.painters, opts.worldX, opts.worldY);
    if (!hit) {
      this.hoverId = null;
      this.hide();
      return;
    }

    if (this.hoverId !== hit.id) {
      this.hoverId = hit.id;
      this.hoverSince = opts.now;
      if (this.visibleId !== hit.id) this.hide();
      return;
    }

    if (opts.now - this.hoverSince < HOVER_DELAY_MS) {
      if (this.visibleId !== hit.id) this.hide();
      return;
    }

    this.show(hit, opts.camera, opts.canvas);
  }

  dispose(): void {
    this.root.remove();
  }

  private show(
    hit: BallHit,
    camera: Phaser.Cameras.Scene2D.Camera,
    canvas: HTMLCanvasElement,
  ): void {
    const def = getBallType(hit.typeId);
    const contentKey = hit.typeId;
    if (this.visibleId !== hit.id || this.lastContentKey !== contentKey) {
      this.lastContentKey = contentKey;
      this.visibleId = hit.id;
      this.panel.innerHTML = "";

      this.panel.append(ballSwatch(hit.typeId, 32));
      const title = document.createElement("div");
      title.style.cssText =
        "font-size:13px;font-weight:700;text-align:center;line-height:1.25";
      title.textContent = def?.title ?? hit.typeId;
      this.panel.append(title);

      if (def?.description) {
        const desc = document.createElement("div");
        desc.style.cssText = `font-size:11px;color:${UI.textMuted};text-align:center;line-height:1.35`;
        desc.textContent = def.description;
        this.panel.append(desc);
      }
    }

    const pos = worldToStage(hit.x, hit.y, camera, canvas, this.stage);
    const radiusPx = hit.radius * pos.worldToCss;
    this.root.style.display = "block";
    this.root.style.left = `${pos.x}px`;
    this.root.style.top = `${pos.y - radiusPx}px`;
  }

  private hide(): void {
    this.visibleId = null;
    this.lastContentKey = "";
    this.root.style.display = "none";
  }
}

/** Map world coords → CSS px relative to `stage`, matching camera zoom + Scale.FIT letterbox. */
function worldToStage(
  wx: number,
  wy: number,
  camera: Phaser.Cameras.Scene2D.Camera,
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
): { x: number; y: number; worldToCss: number } {
  const view = camera.worldView;
  const viewW = Math.max(1e-6, view.width);
  const viewH = Math.max(1e-6, view.height);
  const canvasX = ((wx - view.x) / viewW) * camera.width;
  const canvasY = ((wy - view.y) / viewH) * camera.height;

  const cRect = canvas.getBoundingClientRect();
  const sRect = stage.getBoundingClientRect();
  // Scale.FIT keeps uniform scale; use width as source of truth.
  const dispScale = cRect.width / Math.max(1, camera.width);

  return {
    x: cRect.left - sRect.left + canvasX * dispScale,
    y: cRect.top - sRect.top + canvasY * dispScale,
    worldToCss: cRect.width / viewW,
  };
}

function hitTest(painters: BallPainter[], wx: number, wy: number): BallHit | null {
  let best: BallHit | null = null;
  let bestD = Infinity;
  for (const painter of painters) {
    for (const h of painter.hits) {
      const d = Math.hypot(h.x - wx, h.y - wy);
      if (d <= h.radius + 2 && d < bestD) {
        bestD = d;
        best = h;
      }
    }
  }
  return best;
}
