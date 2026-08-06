import Phaser from "phaser";

export function hex(color: string): number {
  const c = color.startsWith("#") ? color.slice(1) : color;
  return parseInt(c, 16);
}

export function drawPie(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  color: string,
  a0: number,
  a1: number,
): void {
  g.fillStyle(hex(color), 1);
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, radius, a0, a1, false);
  g.closePath();
  g.fillPath();
}
