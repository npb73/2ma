import { BALL_RADIUS } from "@2ma/shared";
import Phaser from "phaser";

import { drawBallType } from "./draw";
import { SolidBallLayer, solidColorOf } from "./solid";

/**
 * Paints balls each frame: solids via Image + fish-eye pipeline when allowed,
 * otherwise Graphics via kind drawers.
 */
export class BallPainter {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly solids: SolidBallLayer;
  private readonly seen = new Set<string>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth);
    this.solids = new SolidBallLayer(scene, depth);
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
    const color = solidColorOf(typeId);
    if (color === null || !this.solids.enabled) {
      this.solids.hide(id);
      drawBallType(this.gfx, typeId, x, y, radius, fuse);
      return;
    }

    this.solids.draw(id, color, x, y, radius);
  }

  end(): void {
    this.solids.prune(this.seen);
  }
}
