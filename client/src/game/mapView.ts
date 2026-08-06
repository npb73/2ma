import type { GameMap } from "@2ma/shared";
import { UI } from "@2ma/shared";
import Phaser from "phaser";

function hex(color: string): number {
  return Phaser.Display.Color.HexStringToColor(color).color;
}

/** Solid fill from map.background (palette hex). */
export function addMapBackground(scene: Phaser.Scene, map: GameMap): void {
  const color = map.background || UI.bg;
  scene.add
    .rectangle(map.width / 2, map.height / 2, map.width, map.height, hex(color))
    .setDepth(-2);
}

export function drawMapPath(scene: Phaser.Scene, points: { x: number; y: number }[]): void {
  if (points.length < 2) return;
  const g = scene.add.graphics().setDepth(0);
  g.lineStyle(10, hex(UI.path), 1);
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.strokePath();
}

export function drawMapHole(
  scene: Phaser.Scene,
  points: { x: number; y: number }[],
): void {
  if (points.length < 1) return;
  const end = points[points.length - 1];
  scene.add.circle(end.x, end.y, 18, hex(UI.hole));
}
