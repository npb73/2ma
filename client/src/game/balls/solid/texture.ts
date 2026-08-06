import { type SolidColor } from "@2ma/shared";
import Phaser from "phaser";

import redBall from "./assets/red_ball.png";
import yellowBall from "./assets/yellow_ball.png";
import greenBall from "./assets/green_ball.png";
import blueBall from "./assets/blue_ball.png";
import pinkBall from "./assets/pink_ball.png";

import { ensureBallPipeline } from "./pipeline";

/**
 * Nearest upscale. 32×N must stay power-of-two for clean GL_REPEAT sampling.
 * (2 → 64, 4 → 128)
 */
const TEX_SCALE = 2;

const BALL_URLS = [redBall, yellowBall, greenBall, blueBall, pinkBall] as const;

/** Baked skin size in pixels (set in prepareBallTextures). */
let skinSize = 32 * TEX_SCALE;

export function getSolidSkinSize(): number {
  return skinSize;
}

export function solidSrcKey(color: SolidColor): string {
  return `ball_src_${color}`;
}

export function solidGpuKey(color: SolidColor): string {
  return `ball_gpu_${color}`;
}

export function preloadBallTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < BALL_URLS.length; i++) {
    scene.load.image(solidSrcKey(i as SolidColor), BALL_URLS[i]);
  }
}

/** Bake crisp POT skins once; fish-eye + scroll run in the BallFishEye shader. */
export function prepareBallTextures(scene: Phaser.Scene): void {
  ensureBallPipeline(scene.game);

  for (let i = 0; i < BALL_URLS.length; i++) {
    const color = i as SolidColor;
    const src = scene.textures
      .get(solidSrcKey(color))
      .getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };

    const size = src.width * TEX_SCALE;
    skinSize = size;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, size, size);

    const key = solidGpuKey(color);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.addCanvas(key, canvas);
    tex?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
