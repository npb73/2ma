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
const DEFAULT_ID: ResolutionId = "720";

export interface ClientSettings {
  resolutionId: ResolutionId;
}

function isResolutionId(value: unknown): value is ResolutionId {
  return RESOLUTION_PRESETS.some((p) => p.id === value);
}

export function loadSettings(): ClientSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { resolutionId: DEFAULT_ID };
    const parsed = JSON.parse(raw) as Partial<ClientSettings>;
    return {
      resolutionId: isResolutionId(parsed.resolutionId)
        ? parsed.resolutionId
        : DEFAULT_ID,
    };
  } catch {
    return { resolutionId: DEFAULT_ID };
  }
}

export function saveSettings(patch: Partial<ClientSettings>): ClientSettings {
  const next = { ...loadSettings(), ...patch };
  if (!isResolutionId(next.resolutionId)) next.resolutionId = DEFAULT_ID;
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function getResolutionPreset(
  id: ResolutionId = loadSettings().resolutionId,
): ResolutionPreset {
  return (
    RESOLUTION_PRESETS.find((p) => p.id === id) ??
    RESOLUTION_PRESETS.find((p) => p.id === DEFAULT_ID)!
  );
}

/** Camera zoom so the fixed world fills the chosen canvas size. */
export function getWorldZoom(
  id: ResolutionId = loadSettings().resolutionId,
): number {
  return getResolutionPreset(id).height / WORLD_HEIGHT;
}
