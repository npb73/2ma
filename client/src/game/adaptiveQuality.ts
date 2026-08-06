import Phaser from "phaser";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@2ma/shared";
import {
  activeResolutionId,
  getResolutionPreset,
  loadSettings,
  type ResolutionId,
  type ResolutionPreset,
} from "../settings";
import { setBallPipelineAllowed } from "./balls";

export interface QualityState {
  resolutionId: ResolutionId;
  prettyBalls: boolean;
}

let activeWorld = { w: WORLD_WIDTH, h: WORLD_HEIGHT };

/** Logical map size the camera should frame. */
export function setActiveWorldSize(width: number, height: number): void {
  activeWorld = { w: width, h: height };
}

export function getActiveWorldSize(): { w: number; h: number } {
  return activeWorld;
}

/**
 * Backing-store size matching the viewport aspect, at the preset's pixel density
 * (short side ≈ preset short side).
 */
export function canvasSizeForViewport(
  viewportW: number,
  viewportH: number,
  preset: Pick<ResolutionPreset, "width" | "height">,
): { width: number; height: number } {
  const vw = Math.max(1, Math.floor(viewportW));
  const vh = Math.max(1, Math.floor(viewportH));
  const presetShort = Math.min(preset.width, preset.height);
  const viewShort = Math.min(vw, vh);
  const scale = presetShort / viewShort;
  return {
    width: Math.max(1, Math.round(vw * scale)),
    height: Math.max(1, Math.round(vh * scale)),
  };
}

/** Zoom so the whole map fits inside the canvas (contain), centered. */
export function worldZoomForPreset(
  preset: { width: number; height: number },
  world = activeWorld,
): number {
  return Math.min(preset.width / world.w, preset.height / world.h);
}

function parentSize(game: Phaser.Game): { w: number; h: number } {
  const parent = game.scale.parent as HTMLElement | null;
  if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
    return { w: parent.clientWidth, h: parent.clientHeight };
  }
  return { w: window.innerWidth, h: window.innerHeight };
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

  /** Canvas size for the given CSS viewport (stage) box. */
  canvasSize(viewportW: number, viewportH: number): { width: number; height: number } {
    return canvasSizeForViewport(viewportW, viewportH, this.preset);
  }

  worldZoomForCanvas(canvas: { width: number; height: number }): number {
    return worldZoomForPreset(canvas);
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
  const { w, h } = parentSize(game);
  const size = canvasSizeForViewport(w, h, preset);
  const zoom = worldZoomForPreset(size);
  game.scale.resize(size.width, size.height);
  for (const scene of game.scene.getScenes(true)) {
    scene.cameras.main.setZoom(zoom);
    scene.cameras.main.centerOn(activeWorld.w / 2, activeWorld.h / 2);
  }
}

/** Keep canvas aspect synced with the stage after layout changes. */
export function syncGameToStage(
  game: Phaser.Game,
  quality: AdaptiveQuality,
): void {
  applyGameResolution(game, quality.currentResolutionId);
}
