import Phaser from "phaser";
import { hex } from "../util";

export function drawPlasmaGraphics(
  g: Phaser.GameObjects.Graphics,
  colors: string[],
  x: number,
  y: number,
  radius: number,
): void {
  const core = colors[0] ?? "#d9243c";
  const glow = colors[1] ?? "#ffffe4";
  g.fillStyle(hex(core), 1);
  g.fillCircle(x, y, radius);
  g.lineStyle(3, hex(glow), 0.9);
  g.strokeCircle(x, y, radius - 2);
  g.fillStyle(hex(glow), 0.55);
  g.fillCircle(x - radius * 0.25, y - radius * 0.25, radius * 0.28);
}
