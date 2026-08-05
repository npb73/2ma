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

import {
  BALL_FISH,
  BALL_PIPELINE_KEY,
  ensureBallPipeline,
} from "./ballPipeline";

/**
 * Nearest upscale. 32×N must stay power-of-two for clean GL_REPEAT sampling.
 * (2 → 64, 4 → 128)
 */
const TEX_SCALE = 2;

const BALL_URLS = [redBall, yellowBall, greenBall, blueBall, pinkBall] as const;

/** Baked skin size in pixels (set in prepareBallTextures). */
let skinSize = 32 * TEX_SCALE;

function hex(color: string): number {
  const c = color.startsWith("#") ? color.slice(1) : color;
  return parseInt(c, 16);
}

function srcKey(color: SolidColor): string {
  return `ball_src_${color}`;
}

function gpuKey(color: SolidColor): string {
  return `ball_gpu_${color}`;
}

function solidColor(typeId: string): SolidColor | null {
  const t = getBallType(typeId);
  if (!t || t.kind !== "solid") return null;
  return t.colors[0] ?? null;
}

function quantize(v: number): number {
  return Math.round(v * 100) / 100;
}

export function preloadBallTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < BALL_URLS.length; i++) {
    scene.load.image(srcKey(i as SolidColor), BALL_URLS[i]);
  }
}

/** Bake crisp POT skins once; fish-eye + scroll run in the BallFishEye shader. */
export function prepareBallTextures(scene: Phaser.Scene): void {
  ensureBallPipeline(scene.game);

  for (let i = 0; i < BALL_URLS.length; i++) {
    const color = i as SolidColor;
    const src = scene.textures
      .get(srcKey(color))
      .getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };

    const size = src.width * TEX_SCALE;
    skinSize = size;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, size, size);

    const key = gpuKey(color);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.addCanvas(key, canvas);
    tex?.setFilter(Phaser.Textures.FilterMode.NEAREST);
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
  image: Phaser.GameObjects.Image;
  /** Scroll in texture pixels (same space as movement). */
  scrollX: number;
  scrollY: number;
  x: number;
  y: number;
  radius: number;
  color: SolidColor;
  primed: boolean;
}

function applyPipelineData(slot: BallSlot): void {
  const d = slot.radius * 2;
  slot.image.setPipelineData("scrollX", slot.scrollX / skinSize);
  slot.image.setPipelineData("scrollY", slot.scrollY / skinSize);
  slot.image.setPipelineData("uvScale", d / skinSize);
  slot.image.setPipelineData("fish", BALL_FISH);
}

/**
 * Solid balls: Image + fish-eye pipeline (circle discard, UV scroll, sphere warp).
 */
export class BallPainter {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly slots = new Map<string, BallSlot>();
  private readonly seen = new Set<string>();
  private readonly usePipeline: boolean;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    this.gfx = scene.add.graphics().setDepth(depth);
    this.usePipeline = ensureBallPipeline(scene.game);
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
    if (color === null || !this.usePipeline) {
      const slot = this.slots.get(id);
      if (slot) slot.image.setVisible(false);
      drawBallType(this.gfx, typeId, x, y, radius, fuse);
      return;
    }

    let slot = this.slots.get(id);
    if (!slot) {
      const d = Math.max(1, radius * 2);
      const image = this.scene.add
        .image(x, y, gpuKey(color))
        .setDepth(this.depth)
        .setDisplaySize(d, d);
      image.setPipeline(BALL_PIPELINE_KEY);
      slot = {
        image,
        scrollX: 0,
        scrollY: 0,
        x,
        y,
        radius,
        color,
        primed: false,
      };
      applyPipelineData(slot);
      this.slots.set(id, slot);
    }

    const { image } = slot;
    image.setVisible(true);

    if (slot.color !== color) {
      slot.color = color;
      image.setTexture(gpuKey(color));
    }

    if (slot.radius !== radius) {
      slot.radius = radius;
      image.setDisplaySize(radius * 2, radius * 2);
    }

    if (slot.primed) {
      slot.scrollX = quantize(slot.scrollX - (x - slot.x));
      slot.scrollY = quantize(slot.scrollY - (y - slot.y));
    } else {
      slot.primed = true;
    }

    slot.x = x;
    slot.y = y;
    image.setPosition(x, y);
    applyPipelineData(slot);
  }

  end(): void {
    for (const [id, slot] of this.slots) {
      if (this.seen.has(id)) continue;
      slot.image.destroy();
      this.slots.delete(id);
    }
  }
}
