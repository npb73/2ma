import { BALL_COLORS, getBallType, type SolidColor } from "@2ma/shared";
import Phaser from "phaser";

import { hex } from "../util";
import {
  BALL_FISH,
  BALL_PIPELINE_KEY,
  ensureBallPipeline,
  isBallPipelineAllowed,
} from "./pipeline";
import { getSolidSkinSize, solidGpuKey } from "./texture";

export function solidColorOf(typeId: string): SolidColor | null {
  const t = getBallType(typeId);
  if (!t || t.kind !== "solid") return null;
  return t.colors[0] ?? null;
}

/** Flat solid circle fallback when pipeline is off. */
export function drawSolidGraphics(
  g: Phaser.GameObjects.Graphics,
  typeId: string,
  x: number,
  y: number,
  radius: number,
): void {
  const color = solidColorOf(typeId);
  const hexColor =
    color !== null ? BALL_COLORS[color]! : (BALL_COLORS[0] as string);
  g.fillStyle(hex(hexColor), 1);
  g.fillCircle(x, y, radius);
}

interface BallSlot {
  image: Phaser.GameObjects.Image;
  scrollX: number;
  scrollY: number;
  x: number;
  y: number;
  radius: number;
  color: SolidColor;
  primed: boolean;
}

function quantize(v: number): number {
  return Math.round(v * 100) / 100;
}

function applyPipelineData(slot: BallSlot): void {
  const skinSize = getSolidSkinSize();
  const d = slot.radius * 2;
  const scrollX = slot.scrollX / skinSize;
  const scrollY = slot.scrollY / skinSize;
  const uvScale = d / skinSize;
  const img = slot.image;
  const data = img.pipelineData as {
    scrollX?: number;
    scrollY?: number;
    uvScale?: number;
    fish?: number;
  };
  if (
    data.scrollX === scrollX &&
    data.scrollY === scrollY &&
    data.uvScale === uvScale &&
    data.fish === BALL_FISH
  ) {
    return;
  }
  img.setPipelineData("scrollX", scrollX);
  img.setPipelineData("scrollY", scrollY);
  img.setPipelineData("uvScale", uvScale);
  img.setPipelineData("fish", BALL_FISH);
}

/** Manages Image + fish-eye slots for solid balls. */
export class SolidBallLayer {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly slots = new Map<string, BallSlot>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    if (isBallPipelineAllowed()) ensureBallPipeline(scene.game);
  }

  get enabled(): boolean {
    if (!isBallPipelineAllowed()) return false;
    return ensureBallPipeline(this.scene.game);
  }

  hide(id: string): void {
    const slot = this.slots.get(id);
    if (slot) slot.image.setVisible(false);
  }

  draw(
    id: string,
    color: SolidColor,
    x: number,
    y: number,
    radius: number,
  ): void {
    let slot = this.slots.get(id);
    if (!slot) {
      const d = Math.max(1, radius * 2);
      const image = this.scene.add
        .image(x, y, solidGpuKey(color))
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
    } else if (!slot.image.pipeline) {
      slot.image.setPipeline(BALL_PIPELINE_KEY);
    }

    const { image } = slot;
    image.setVisible(true);

    if (slot.color !== color) {
      slot.color = color;
      image.setTexture(solidGpuKey(color));
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

  prune(seen: Set<string>): void {
    for (const [id, slot] of this.slots) {
      if (seen.has(id)) continue;
      slot.image.destroy();
      this.slots.delete(id);
    }
  }
}
