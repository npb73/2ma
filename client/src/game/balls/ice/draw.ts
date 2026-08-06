import Phaser from "phaser";
import { hex } from "../util";

export function drawIceGraphics(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
): void {
  g.fillStyle(hex("#1c92a7"), 1);
  g.fillCircle(x, y, radius);
  g.lineStyle(2, hex("#77d6c1"), 1);
  g.strokeCircle(x, y, radius - 1);
  g.fillStyle(hex("#ffe0dc"), 0.7);
  g.beginPath();
  g.moveTo(x, y - radius * 0.55);
  g.lineTo(x - radius * 0.35, y + radius * 0.2);
  g.lineTo(x + radius * 0.35, y + radius * 0.2);
  g.closePath();
  g.fillPath();
}
