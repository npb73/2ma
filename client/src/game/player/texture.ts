import Phaser from "phaser";

import tumakUrl from "./assets/tumak.png";

export const PLAYER_TEX_KEY = "player_tumak";

/** On-screen size (px). Source is 64×64; scaled with NEAREST. */
export const PLAYER_DISPLAY_SIZE = 112;

export function preloadPlayerTexture(scene: Phaser.Scene): void {
  scene.load.image(PLAYER_TEX_KEY, tumakUrl);
}

/** Crisp pixel-art upscale — never bilinear. */
export function preparePlayerTexture(scene: Phaser.Scene): void {
  if (!scene.textures.exists(PLAYER_TEX_KEY)) return;
  scene.textures
    .get(PLAYER_TEX_KEY)
    .setFilter(Phaser.Textures.FilterMode.NEAREST);
}
