export type Point = { x: number; y: number };

/** Default world size (16:9). Kept for gameplay code that assumes classic maps. */
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;

/** Background colors available in the map editor. */
export const MAP_BG_PALETTE = [
  "#10121c",
  "#2c1e31",
  "#6b2643",
  "#ac2847",
  "#ec273f",
  "#94493a",
  "#de5d3a",
  "#e98537",
  "#f3a833",
  "#4d3533",
  "#6e4c30",
  "#a26d3f",
  "#ce9248",
  "#dab163",
  "#e8d282",
  "#f7f3b7",
  "#1e4044",
  "#006554",
  "#26854c",
  "#5ab552",
  "#9de64e",
  "#008b8b",
  "#62a477",
  "#a6cb96",
  "#d3eed3",
  "#3e3b65",
  "#3859b3",
  "#3388de",
  "#36c5f4",
  "#6dead6",
  "#5e5b8c",
  "#8c78a5",
  "#b0a7b8",
  "#deceed",
  "#9a4d76",
  "#c878af",
  "#cc99ff",
  "#fa6e79",
  "#ffa2ac",
  "#ffd1d5",
  "#f6e8e0",
  "#ffffff",
] as const;

export type MapBgColor = (typeof MAP_BG_PALETTE)[number];

export const DEFAULT_MAP_BG: MapBgColor = "#10121c";

export type MapAspectId =
  | "1:1"
  | "2:1"
  | "1:2"
  | "4:3"
  | "3:2"
  | "16:9"
  | "9:16"
  | "21:9";

export type MapAspect = {
  id: MapAspectId;
  label: string;
  width: number;
  height: number;
};

/** Preset canvas sizes for the editor / authored maps. */
export const MAP_ASPECTS: readonly MapAspect[] = [
  { id: "1:1", label: "1:1", width: 960, height: 960 },
  { id: "2:1", label: "2:1", width: 1280, height: 640 },
  { id: "1:2", label: "1:2", width: 640, height: 1280 },
  { id: "4:3", label: "4:3", width: 1280, height: 960 },
  { id: "3:2", label: "3:2", width: 1200, height: 800 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "21:9", label: "21:9", width: 1680, height: 720 },
] as const;

export const DEFAULT_MAP_ASPECT_ID: MapAspectId = "16:9";

const ASPECT_BY_ID = new Map(MAP_ASPECTS.map((a) => [a.id, a]));
const ASPECT_BY_SIZE = new Map(
  MAP_ASPECTS.map((a) => [`${a.width}x${a.height}`, a]),
);
const BG_SET = new Set<string>(MAP_BG_PALETTE);

export function getMapAspect(id: MapAspectId): MapAspect {
  const a = ASPECT_BY_ID.get(id);
  if (!a) throw new Error(`Unknown map aspect: ${id}`);
  return a;
}

export function findMapAspect(
  width: number,
  height: number,
): MapAspect | undefined {
  return ASPECT_BY_SIZE.get(`${width}x${height}`);
}

export function isMapBgColor(value: unknown): value is MapBgColor {
  return typeof value === "string" && BG_SET.has(normalizeHex(value));
}

export function normalizeHex(color: string): string {
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return c;
}

/** Simple mirrored paths on one field (1280×720). */
export const PATH_A: Point[] = [
  { x: 80, y: 120 },
  { x: 220, y: 100 },
  { x: 380, y: 140 },
  { x: 480, y: 220 },
  { x: 520, y: 340 },
  { x: 480, y: 460 },
  { x: 360, y: 540 },
  { x: 200, y: 560 },
  { x: 120, y: 480 },
];

export const PATH_B: Point[] = PATH_A.map((p) => ({
  x: WORLD_WIDTH - p.x,
  y: p.y,
}));

export const CANNON_A: Point = { x: 280, y: 360 };
export const CANNON_B: Point = {
  x: WORLD_WIDTH - CANNON_A.x,
  y: CANNON_A.y,
};

export type MapLane = {
  path: Point[];
  cannon: Point;
};

export type GameMap = {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  players: 1 | 2;
  /** Solid background from MAP_BG_PALETTE. */
  background: MapBgColor;
  lanes: MapLane[];
};

function clonePoints(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

export function mirrorPointX(p: Point, width: number): Point {
  return { x: width - p.x, y: p.y };
}

export function mirrorLane(lane: MapLane, width: number): MapLane {
  return {
    path: lane.path.map((p) => mirrorPointX(p, width)),
    cannon: mirrorPointX(lane.cannon, width),
  };
}

function scalePoint(p: Point, sx: number, sy: number): Point {
  return { x: Math.round(p.x * sx), y: Math.round(p.y * sy) };
}

export function scaleLane(lane: MapLane, sx: number, sy: number): MapLane {
  return {
    path: lane.path.map((p) => scalePoint(p, sx, sy)),
    cannon: scalePoint(lane.cannon, sx, sy),
  };
}

function laneA(width = WORLD_WIDTH, height = WORLD_HEIGHT): MapLane {
  const sx = width / WORLD_WIDTH;
  const sy = height / WORLD_HEIGHT;
  return {
    path: clonePoints(PATH_A).map((p) => scalePoint(p, sx, sy)),
    cannon: scalePoint(CANNON_A, sx, sy),
  };
}

function laneB(width = WORLD_WIDTH, height = WORLD_HEIGHT): MapLane {
  return mirrorLane(laneA(width, height), width);
}

function newMapId(): string {
  return `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultMap(
  players: 1 | 2 = 1,
  aspectId: MapAspectId = DEFAULT_MAP_ASPECT_ID,
): GameMap {
  const aspect = getMapAspect(aspectId);
  const lanes =
    players === 2
      ? [laneA(aspect.width, aspect.height), laneB(aspect.width, aspect.height)]
      : [laneA(aspect.width, aspect.height)];
  return {
    version: 1,
    id: newMapId(),
    name: players === 2 ? "Дуэль" : "Одиночная",
    width: aspect.width,
    height: aspect.height,
    players,
    background: DEFAULT_MAP_BG,
    lanes,
  };
}

export function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.x === "number" &&
    typeof p.y === "number" &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y)
  );
}

export function isMapLane(value: unknown): value is MapLane {
  if (!value || typeof value !== "object") return false;
  const lane = value as Record<string, unknown>;
  if (!Array.isArray(lane.path) || lane.path.length < 2) return false;
  if (!lane.path.every(isPoint)) return false;
  return isPoint(lane.cannon);
}

/** Returns an error message, or null if the map is valid. */
export function validateMap(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Карта должна быть объектом";
  const m = value as Record<string, unknown>;
  if (m.version !== 1) return "Неподдерживаемая версия карты";
  if (typeof m.id !== "string" || !m.id) return "Нужен id карты";
  if (typeof m.name !== "string") return "Нужно имя карты";
  if (typeof m.width !== "number" || typeof m.height !== "number") {
    return "Нужны width и height";
  }
  if (!findMapAspect(m.width, m.height)) {
    const allowed = MAP_ASPECTS.map((a) => `${a.width}×${a.height}`).join(", ");
    return `Размер карты должен быть одним из: ${allowed}`;
  }
  if (m.players !== 1 && m.players !== 2) return "players должен быть 1 или 2";
  if (typeof m.background !== "string" || !isMapBgColor(m.background)) {
    return "background должен быть цветом из палитры";
  }
  if (!Array.isArray(m.lanes)) return "Нужен массив lanes";
  if (m.lanes.length !== m.players) {
    return `Число lanes (${m.lanes.length}) должно совпадать с players (${m.players})`;
  }
  for (let i = 0; i < m.lanes.length; i++) {
    if (!isMapLane(m.lanes[i])) {
      return `Lane ${i}: нужен path (≥2 точек) и cannon`;
    }
  }
  return null;
}

export function parseGameMap(value: unknown): GameMap {
  const err = validateMap(value);
  if (err) throw new Error(err);
  const m = value as GameMap;
  return {
    ...m,
    background: normalizeHex(m.background) as MapBgColor,
  };
}
