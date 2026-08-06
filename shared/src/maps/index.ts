import type { GameMap, MapLane, Point } from "../map.js";
import { MAP_CATALOG } from "./catalog.gen.js";

export { MAP_CATALOG } from "./catalog.gen.js";

const PREFERRED_SOLO_ID = "solo-classic";
const PREFERRED_RANKED_ID = "ranked-classic";

function preferMapId(players: 1 | 2, preferred: string): string {
  const preferredMap = MAP_CATALOG[preferred];
  if (preferredMap && preferredMap.players === players) return preferred;
  const first = Object.values(MAP_CATALOG).find((m) => m.players === players);
  if (!first) {
    throw new Error(`No maps with players=${players} in shared/src/maps/`);
  }
  return first.id;
}

export const DEFAULT_SOLO_MAP_ID = preferMapId(1, PREFERRED_SOLO_ID);
export const DEFAULT_RANKED_MAP_ID = preferMapId(2, PREFERRED_RANKED_ID);

/** @deprecated Prefer getSoloMap() / listMaps(1). Kept for older imports. */
export const SOLO_CLASSIC: GameMap = MAP_CATALOG[DEFAULT_SOLO_MAP_ID]!;
/** @deprecated Prefer getRankedMap() / listMaps(2). Kept for older imports. */
export const RANKED_CLASSIC: GameMap = MAP_CATALOG[DEFAULT_RANKED_MAP_ID]!;

export function getMap(id: string): GameMap {
  const map = MAP_CATALOG[id];
  if (!map) throw new Error(`Unknown map id: ${id}`);
  return map;
}

export function getSoloMap(id: string = DEFAULT_SOLO_MAP_ID): GameMap {
  const map = getMap(id);
  if (map.players !== 1) throw new Error(`Map ${id} is not a solo map`);
  return map;
}

export function getRankedMap(id: string = DEFAULT_RANKED_MAP_ID): GameMap {
  const map = getMap(id);
  if (map.players !== 2) throw new Error(`Map ${id} is not a ranked map`);
  return map;
}

export function mapLane(map: GameMap, seat: number): MapLane {
  const lane = map.lanes[seat];
  if (!lane) throw new Error(`Map ${map.id} has no lane for seat ${seat}`);
  return lane;
}

export function mapPath(map: GameMap, seat: number): Point[] {
  return mapLane(map, seat).path;
}

export function mapCannon(map: GameMap, seat: number): Point {
  return mapLane(map, seat).cannon;
}

export function listMaps(players?: 1 | 2): GameMap[] {
  const all = Object.values(MAP_CATALOG);
  return players == null ? all : all.filter((m) => m.players === players);
}
