/** Logical game world size — paths/cannons are authored in this space. */
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;

export type ResolutionId = "480" | "720" | "1080" | "2k" | "4k";

export interface ResolutionPreset {
  id: ResolutionId;
  label: string;
  /** Canvas backing-store size (16:9, matched to world aspect). */
  width: number;
  height: number;
}

function preset(
  id: ResolutionId,
  label: string,
  height: number,
): ResolutionPreset {
  return {
    id,
    label,
    height,
    width: Math.round((WORLD_WIDTH * height) / WORLD_HEIGHT),
  };
}

export const RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  preset("480", "480p", 480),
  preset("720", "720p", 720),
  preset("1080", "1080p", 1080),
  preset("2k", "2K", 1440),
  preset("4k", "4K", 2160),
] as const;

const KEY = "2ma_settings";

export interface ClientSettings {
  /**
   * On: highest preset that fits the display (device pixels).
   * Off: lock to Full HD (1080p).
   */
  antialias: boolean;
  /** Fish-eye textured solids. */
  prettyBalls: boolean;
}

const DEFAULTS: ClientSettings = {
  antialias: true,
  prettyBalls: true,
};

function migrate(raw: Record<string, unknown>): ClientSettings {
  if (typeof raw.antialias === "boolean" || typeof raw.prettyBalls === "boolean") {
    return {
      antialias:
        typeof raw.antialias === "boolean" ? raw.antialias : DEFAULTS.antialias,
      prettyBalls:
        typeof raw.prettyBalls === "boolean"
          ? raw.prettyBalls
          : DEFAULTS.prettyBalls,
    };
  }

  // Legacy: quality/resolutionId → map to antialias.
  const quality = raw.quality;
  const resolutionId = raw.resolutionId;
  let antialias = DEFAULTS.antialias;
  if (quality === "manual" && resolutionId === "1080") {
    antialias = false;
  } else if (quality === "manual" && resolutionId === "720") {
    antialias = false;
  } else if (quality === "manual" && resolutionId === "480") {
    antialias = false;
  }
  return { antialias, prettyBalls: DEFAULTS.prettyBalls };
}

export function loadSettings(): ClientSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return migrate(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<ClientSettings>): ClientSettings {
  const next = { ...loadSettings(), ...patch };
  next.antialias = Boolean(next.antialias);
  next.prettyBalls = Boolean(next.prettyBalls);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getResolutionPreset(
  id: ResolutionId,
): ResolutionPreset {
  return (
    RESOLUTION_PRESETS.find((p) => p.id === id) ??
    RESOLUTION_PRESETS.find((p) => p.id === "1080")!
  );
}

/** Highest preset whose height fits the physical display pixels. */
export function maxResolutionForScreen(): ResolutionId {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const cssH =
    typeof window !== "undefined"
      ? window.screen?.height || window.innerHeight || 1080
      : 1080;
  const targetH = Math.round(cssH * dpr);

  let best: ResolutionId = "480";
  for (const p of RESOLUTION_PRESETS) {
    if (p.height <= targetH) best = p.id;
  }
  return best;
}

/** Active canvas preset from current settings. */
export function activeResolutionId(
  settings: ClientSettings = loadSettings(),
): ResolutionId {
  return settings.antialias ? maxResolutionForScreen() : "1080";
}

/** Camera zoom so the fixed world fills the chosen canvas size. */
export function getWorldZoom(id: ResolutionId = activeResolutionId()): number {
  return getResolutionPreset(id).height / WORLD_HEIGHT;
}

export function resolutionIndex(id: ResolutionId): number {
  return Math.max(
    0,
    RESOLUTION_PRESETS.findIndex((p) => p.id === id),
  );
}

export function resolutionByIndex(index: number): ResolutionPreset {
  const i = Math.max(0, Math.min(RESOLUTION_PRESETS.length - 1, index));
  return RESOLUTION_PRESETS[i]!;
}
