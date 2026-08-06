import Phaser from "phaser";
import { hex } from "../util";

export function drawExplosiveGraphics(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
): void {
  g.fillStyle(hex("#890027"), 1);
  g.fillCircle(x, y, radius);
  g.lineStyle(2, hex("#ff823b"), 1);
  g.strokeCircle(x, y, radius - 1);
  g.fillStyle(hex("#ffd832"), 1);
  g.fillCircle(x, y, radius * 0.35);
}
