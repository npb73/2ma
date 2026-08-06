import Phaser from "phaser";
import {
  activeResolutionId,
  getResolutionPreset,
  loadSettings,
  type ResolutionId,
} from "../settings";
import { setBallPipelineAllowed } from "./balls";

export interface QualityState {
  resolutionId: ResolutionId;
  prettyBalls: boolean;
}

/**
 * Applies graphics settings (resolution + pretty balls).
 * No FPS auto-adaptation — toggles are explicit.
 */
export class AdaptiveQuality {
  private resolutionId: ResolutionId;
  private prettyBalls: boolean;

  constructor() {
    const applied = applySettingsToRuntime();
    this.resolutionId = applied.resolutionId;
    this.prettyBalls = applied.prettyBalls;
  }

  get preset() {
    return getResolutionPreset(this.resolutionId);
  }

  get worldZoom(): number {
    return this.preset.height / 720;
  }

  get currentResolutionId(): ResolutionId {
    return this.resolutionId;
  }

  /** Re-read settings and apply; returns true if resolution changed. */
  syncFromSettings(game?: Phaser.Game | null): boolean {
    const next = applySettingsToRuntime();
    const resChanged = next.resolutionId !== this.resolutionId;
    this.resolutionId = next.resolutionId;
    this.prettyBalls = next.prettyBalls;
    if (resChanged && game) {
      applyGameResolution(game, next.resolutionId);
    }
    return resChanged;
  }
}

export function applySettingsToRuntime(
  settings = loadSettings(),
): QualityState {
  const resolutionId = activeResolutionId(settings);
  setBallPipelineAllowed(settings.prettyBalls);
  return { resolutionId, prettyBalls: settings.prettyBalls };
}

export function applyGameResolution(
  game: Phaser.Game,
  resolutionId: ResolutionId,
): void {
  const preset = getResolutionPreset(resolutionId);
  const zoom = preset.height / 720;
  game.scale.resize(preset.width, preset.height);
  for (const scene of game.scene.getScenes(true)) {
    scene.cameras.main.setZoom(zoom);
    scene.cameras.main.centerOn(1280 / 2, 720 / 2);
  }
}
