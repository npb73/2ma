import type { GameMap } from "@2ma/shared";
import { UI, WORLD_HEIGHT, WORLD_WIDTH } from "@2ma/shared";
import Phaser from "phaser";

function hex(color: string): number {
  return Phaser.Display.Color.HexStringToColor(color).color;
}

function isDataUrl(src: string): boolean {
  return src.startsWith("data:");
}

/** Solid fill or optional background (data URL, asset path, or http(s) URL). */
export function addMapBackground(scene: Phaser.Scene, map: GameMap): void {
  if (!map.background) {
    scene.add
      .rectangle(
        WORLD_WIDTH / 2,
        WORLD_HEIGHT / 2,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        hex(UI.bg),
      )
      .setDepth(-2);
    return;
  }

  const key = `map_bg_${map.id}`;
  const apply = (): void => {
    scene.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)
      .setDepth(-2);
  };

  if (scene.textures.exists(key)) {
    apply();
    return;
  }

  // Placeholder until the texture loads
  scene.add
    .rectangle(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      hex(UI.bg),
    )
    .setDepth(-2);

  const src = map.background;

  // Asset / http paths: let Phaser loader handle decode off the critical path.
  if (!isDataUrl(src)) {
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (!scene.sys || !scene.sys.isActive()) return;
      apply();
    });
    if (!scene.textures.exists(key)) {
      scene.load.image(key, src);
      scene.load.start();
    }
    return;
  }

  const img = new Image();
  img.onload = () => {
    if (!scene.sys || !scene.sys.isActive()) return;
    if (!scene.textures.exists(key)) {
      scene.textures.addImage(key, img);
    }
    apply();
  };
  img.src = src;
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
