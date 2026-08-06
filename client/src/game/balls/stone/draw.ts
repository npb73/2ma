import { STONE_LIFETIME_SEC } from "@2ma/shared";
import Phaser from "phaser";
import { hex } from "../util";

export function drawStoneGraphics(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  fuse = -1,
): void {
  g.fillStyle(hex("#6d8a8d"), 1);
  g.fillCircle(x, y, radius);
  g.lineStyle(2, hex("#293b49"), 1);
  g.strokeCircle(x, y, radius - 1);
  g.fillStyle(hex("#293b49"), 0.35);
  g.fillCircle(x + radius * 0.15, y + radius * 0.1, radius * 0.45);

  if (fuse >= 0) {
    const t = Math.min(1, Math.max(0, fuse / STONE_LIFETIME_SEC));
    // Track ring
    g.lineStyle(3, hex("#293b49"), 0.45);
    g.strokeCircle(x, y, radius + 5);
    // Remaining lifetime arc (shrinks as fuse drains)
    g.lineStyle(3, hex("#ffdaac"), 1);
    g.beginPath();
    g.arc(
      x,
      y,
      radius + 5,
      -Math.PI / 2,
      -Math.PI / 2 + t * Math.PI * 2,
      false,
    );
    g.strokePath();
  }
}
