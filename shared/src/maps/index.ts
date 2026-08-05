import type { GameMap, MapLane, Point } from "../map.js";
import { RANKED_CLASSIC } from "./ranked-classic.js";
import { SOLO_CLASSIC } from "./solo-classic.js";

export { SOLO_CLASSIC } from "./solo-classic.js";
export { RANKED_CLASSIC } from "./ranked-classic.js";

/** All shipped maps, keyed by id. */
export const MAP_CATALOG: Readonly<Record<string, GameMap>> = {
  [SOLO_CLASSIC.id]: SOLO_CLASSIC,
  [RANKED_CLASSIC.id]: RANKED_CLASSIC,
};

export const DEFAULT_SOLO_MAP_ID = SOLO_CLASSIC.id;
export const DEFAULT_RANKED_MAP_ID = RANKED_CLASSIC.id;

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
