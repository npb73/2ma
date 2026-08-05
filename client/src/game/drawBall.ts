import {
  BALL_COLORS,
  BALL_RADIUS,
  getBallType,
  ballDisplayColors,
  type SolidColor,
} from "@2ma/shared";
import Phaser from "phaser";

import redBall from "../../assets/red_ball.png";
import yellowBall from "../../assets/yellow_ball.png";
import greenBall from "../../assets/green_ball.png";
import blueBall from "../../assets/blue_ball.png";
import pinkBall from "../../assets/pink_ball.png";

/** Pixel-art skins: nearest-neighbor upscale, never bilinear. */
const TEX_SCALE = 2;

const BALL_URLS = [redBall, yellowBall, greenBall, blueBall, pinkBall] as const;

interface BallSkin {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const skins: BallSkin[] = [];

function hex(color: string): number {
  const c = color.startsWith("#") ? color.slice(1) : color;
  return parseInt(c, 16);
}

function srcKey(color: SolidColor): string {
  return `ball_src_${color}`;
}

function solidColor(typeId: string): SolidColor | null {
  const t = getBallType(typeId);
  if (!t || t.kind !== "solid") return null;
  return t.colors[0] ?? null;
}

export function preloadBallTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < BALL_URLS.length; i++) {
    scene.load.image(srcKey(i as SolidColor), BALL_URLS[i]);
  }
}

/** Bake ×10 pixel-art skins with smoothing forced off. */
export function prepareBallTextures(scene: Phaser.Scene): void {
  skins.length = 0;
  for (let i = 0; i < BALL_URLS.length; i++) {
    const src = scene.textures
      .get(srcKey(i as SolidColor))
      .getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const canvas = document.createElement("canvas");
    canvas.width = src.width * TEX_SCALE;
    canvas.height = src.height * TEX_SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    skins.push({ canvas, w: canvas.width, h: canvas.height });
  }
}

/** Draw a non-solid (or fallback) ball onto a Graphics object. */
export function drawBallType(
  g: Phaser.GameObjects.Graphics,
  typeId: string,
  x: number,
  y: number,
  radius = BALL_RADIUS,
  fuse = -1,
): void {
  const kind = getBallType(typeId)?.kind ?? "solid";
  const colors = ballDisplayColors(typeId);

  const pie = (color: string, a0: number, a1: number) => {
    g.fillStyle(hex(color), 1);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, radius, a0, a1, false);
    g.closePath();
    g.fillPath();
  };

  if (kind === "dual" && colors.length >= 2) {
    pie(colors[0]!, Math.PI / 2, (Math.PI * 3) / 2);
    pie(colors[1]!, -Math.PI / 2, Math.PI / 2);
  } else if (kind === "rainbow") {
    const n = BALL_COLORS.length;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      pie(BALL_COLORS[i]!, a0, a1);
    }
  } else if (kind === "bomb") {
    g.fillStyle(hex("#293b49"), 1);
    g.fillCircle(x, y, radius);
    g.lineStyle(2, hex("#ff823b"), 1);
    g.strokeCircle(x, y, radius - 1);
    if (fuse >= 0) {
      const t = Math.min(1, Math.max(0, fuse / 5));
      g.lineStyle(3, hex("#ff6157"), 1);
      g.beginPath();
      g.arc(
        x,
        y,
        radius + 4,
        -Math.PI / 2,
        -Math.PI / 2 + t * Math.PI * 2,
        false,
      );
      g.strokePath();
    }
  } else {
    g.fillStyle(hex(colors[0] ?? BALL_COLORS[0]), 1);
    g.fillCircle(x, y, radius);
  }
}

interface BallSlot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: Phaser.Textures.CanvasTexture;
  image: Phaser.GameObjects.Image;
  ox: number;
  oy: number;
  x: number;
  y: number;
  radius: number;
  color: SolidColor;
  primed: boolean;
  dirty: boolean;
}

function paintSlot(slot: BallSlot): void {
  const skin = skins[slot.color];
  if (!skin) return;

  const d = Math.max(1, Math.round(slot.radius * 2));
  if (slot.canvas.width !== d || slot.canvas.height !== d) {
    slot.canvas.width = d;
    slot.canvas.height = d;
    slot.texture.setSize(d, d);
  }

  const { ctx, ox, oy } = slot;
  const r = d / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, d, d);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();

  // Quantize to 0.1px — smooth enough, avoids sub-pixel flicker/seams.
  const tw = skin.w;
  const th = skin.h;
  const offX = Math.round((((ox % tw) + tw) % tw) * 100) / 100;
  const offY = Math.round((((oy % th) + th) % th) * 100) / 100;

  const pattern = ctx.createPattern(skin.canvas, "repeat");
  if (pattern) {
    pattern.setTransform(new DOMMatrix().translate(-offX, -offY));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, d, d);
  }

  ctx.restore();
  slot.texture.refresh();
  slot.dirty = false;
}

/**
 * Solid balls: nearest-upscaled seamless texture, scrolled by movement.
 * Avoids Phaser TileSprite (WebGL blurs NPOT / scaled tiles).
 */
export class BallPainter {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly slots = new Map<string, BallSlot>();
  private readonly seen = new Set<string>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.gfx = scene.add.graphics().setDepth(depth);
  }

  begin(): void {
    this.seen.clear();
    this.gfx.clear();
  }

  draw(
    id: string,
    typeId: string,
    x: number,
    y: number,
    radius = BALL_RADIUS,
    fuse = -1,
  ): void {
    this.seen.add(id);
    const color = solidColor(typeId);
    if (color === null) {
      const slot = this.slots.get(id);
      if (slot) slot.image.setVisible(false);
      drawBallType(this.gfx, typeId, x, y, radius, fuse);
      return;
    }

    let slot = this.slots.get(id);
    if (!slot) {
      const d = Math.max(1, Math.round(radius * 2));
      const canvas = document.createElement("canvas");
      canvas.width = d;
      canvas.height = d;
      const key = `ball_dyn_${this.depth}_${id}`;
      if (this.scene.textures.exists(key)) {
        this.scene.textures.remove(key);
      }
      const texture = this.scene.textures.addCanvas(key, canvas);
      if (!texture) return;
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const image = this.scene.add
        .image(x, y, key)
        .setDepth(this.depth)
        .setDisplaySize(d, d);
      slot = {
        canvas,
        ctx,
        texture,
        image,
        ox: 0,
        oy: 0,
        x,
        y,
        radius,
        color,
        primed: false,
        dirty: true,
      };
      this.slots.set(id, slot);
    }

    const image = slot.image;
    image.setVisible(true);

    if (slot.primed) {
      const dx = x - slot.x;
      const dy = y - slot.y;
      if (dx !== 0 || dy !== 0) {
        slot.ox -= dx;
        slot.oy -= dy;
        slot.dirty = true;
      }
    } else {
      slot.primed = true;
      slot.dirty = true;
    }

    if (slot.color !== color || slot.radius !== radius) {
      slot.color = color;
      slot.radius = radius;
      slot.dirty = true;
    }

    slot.x = x;
    slot.y = y;
    if (slot.dirty) paintSlot(slot);

    const d = Math.max(1, Math.round(radius * 2));
    image.setPosition(x, y);
    image.setDisplaySize(d, d);
  }

  end(): void {
    for (const [id, slot] of this.slots) {
      if (this.seen.has(id)) continue;
      slot.image.destroy();
      this.scene.textures.remove(slot.texture.key);
      this.slots.delete(id);
    }
  }
}
