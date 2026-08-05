import { parseGameMap, type GameMap } from "../map.js";
import raw from "./ranked-classic.json" with { type: "json" };

/** Default ranked 1v1 map — loaded from ranked-classic.json (editor export). */
export const RANKED_CLASSIC: GameMap = parseGameMap(raw);
