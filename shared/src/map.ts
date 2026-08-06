export type Point = { x: number; y: number };

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;

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

export const PATH_B: Point[] = [
  { x: 1200, y: 120 },
  { x: 1060, y: 100 },
  { x: 900, y: 140 },
  { x: 800, y: 220 },
  { x: 760, y: 340 },
  { x: 800, y: 460 },
  { x: 920, y: 540 },
  { x: 1080, y: 560 },
  { x: 1160, y: 480 },
];

export const CANNON_A: Point = { x: 280, y: 360 };
export const CANNON_B: Point = { x: 1000, y: 360 };

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
  /** Background image as data URL, asset path, or http(s) URL; null = solid default. */
  background: string | null;
  lanes: MapLane[];
};

function clonePoints(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

function laneA(): MapLane {
  return { path: clonePoints(PATH_A), cannon: { ...CANNON_A } };
}

function laneB(): MapLane {
  return { path: clonePoints(PATH_B), cannon: { ...CANNON_B } };
}

function newMapId(): string {
  return `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultMap(players: 1 | 2 = 1): GameMap {
  const lanes = players === 2 ? [laneA(), laneB()] : [laneA()];
  return {
    version: 1,
    id: newMapId(),
    name: players === 2 ? "Дуэль" : "Одиночная",
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    players,
    background: null,
    lanes,
  };
}

export function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y);
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
  if (m.width !== WORLD_WIDTH || m.height !== WORLD_HEIGHT) {
    return `Размер карты должен быть ${WORLD_WIDTH}×${WORLD_HEIGHT}`;
  }
  if (m.players !== 1 && m.players !== 2) return "players должен быть 1 или 2";
  if (m.background !== null && typeof m.background !== "string") {
    return "background должен быть data URL, путём ассета, URL или null";
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
  return value as GameMap;
}
