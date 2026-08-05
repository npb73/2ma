import { parseGameMap, type GameMap } from "../map.js";
import raw from "./solo-classic.json" with { type: "json" };

/** Default solo map — loaded from solo-classic.json (editor export). */
export const SOLO_CLASSIC: GameMap = parseGameMap(raw);
