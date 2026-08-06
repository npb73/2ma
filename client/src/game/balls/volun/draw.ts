import Phaser from "phaser";
import { hex } from "../util";

export function drawVolunGraphics(
  g: Phaser.GameObjects.Graphics,
  colors: string[],
  x: number,
  y: number,
  radius: number,
): void {
  const base = colors[0] ?? "#d9243c";
  const rim = colors[1] ?? "#73392e";
  g.fillStyle(hex(base), 1);
  g.fillCircle(x, y, radius);
  g.lineStyle(3, hex(rim), 1);
  g.strokeCircle(x, y, radius - 2);
  g.lineStyle(2, hex(rim), 1);
  g.beginPath();
  g.moveTo(x - radius * 0.5, y);
  g.lineTo(x + radius * 0.5, y);
  g.strokePath();
  g.beginPath();
  g.moveTo(x, y - radius * 0.5);
  g.lineTo(x, y + radius * 0.5);
  g.strokePath();
}
