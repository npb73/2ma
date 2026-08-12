import Phaser from "phaser";

import {
  PLAYER_DISPLAY_SIZE,
  PLAYER_TEX_KEY,
  preparePlayerTexture,
} from "./texture";

/**
 * Pixel-art player sprites (tumak faces +X / right).
 * Rotation follows aim; NEAREST filter keeps sharp pixels when upscaled.
 */
export class PlayerSpriteLayer {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly images = new Map<string, Phaser.GameObjects.Image>();
  private readonly seen = new Set<string>();

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.depth = depth;
    preparePlayerTexture(scene);
  }

  begin(): void {
    this.seen.clear();
  }

  /**
   * Place / update a player sprite at cannon base.
   * `aim` radians; sprite art faces right (angle 0).
   */
  draw(
    id: string,
    x: number,
    y: number,
    aim: number,
  ): void {
    this.seen.add(id);
    let img = this.images.get(id);
    if (!img) {
      img = this.scene.add
        .image(x, y, PLAYER_TEX_KEY)
        .setDepth(this.depth)
        .setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE)
        .setOrigin(0.5, 0.5);
      // Ensure nearest even if texture was prepared earlier.
      img.setTexture(PLAYER_TEX_KEY);
      this.images.set(id, img);
    }
    img.setVisible(true);
    img.setPosition(x, y);
    img.setRotation(aim);
    img.setDisplaySize(PLAYER_DISPLAY_SIZE, PLAYER_DISPLAY_SIZE);
  }

  end(): void {
    for (const [id, img] of this.images) {
      if (this.seen.has(id)) continue;
      img.destroy();
      this.images.delete(id);
    }
  }

  clear(): void {
    for (const img of this.images.values()) img.destroy();
    this.images.clear();
    this.seen.clear();
  }
}
