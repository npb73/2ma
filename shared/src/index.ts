/** Closed palette — never use colors outside this set. */
export const PALETTE = [
  "#43002a",
  "#890027",
  "#d9243c",
  "#ff6157",
  "#ffb762",
  "#c76e46",
  "#73392e",
  "#34111f",
  "#030710",
  "#273b2d",
  "#458239",
  "#9cb93b",
  "#ffd832",
  "#ff823b",
  "#d1401f",
  "#7c191a",
  "#310c1b",
  "#833f34",
  "#eb9c6e",
  "#ffdaac",
  "#ffffe4",
  "#bfc3c6",
  "#6d8a8d",
  "#293b49",
  "#041528",
  "#033e5e",
  "#1c92a7",
  "#77d6c1",
  "#ffe0dc",
  "#ff88a9",
  "#c03b94",
  "#601761",
] as const;

export type PaletteColor = (typeof PALETTE)[number];

export const UI = {
  bg: "#030710" as PaletteColor,
  bgPanel: "#041528" as PaletteColor,
  text: "#ffffe4" as PaletteColor,
  textMuted: "#ffdaac" as PaletteColor,
  accent: "#ff6157" as PaletteColor,
  accentHot: "#ff823b" as PaletteColor,
  secondary: "#6d8a8d" as PaletteColor,
  secondaryDark: "#293b49" as PaletteColor,
  path: "#273b2d" as PaletteColor,
  hole: "#890027" as PaletteColor,
  cannon: "#bfc3c6" as PaletteColor,
} as const;

export {
  BALL_COLORS,
  COLOR_COUNT,
  EXPLOSIVE_BLAST_RADIUS,
  ICE_FREEZE_SEC,
  VOLUN_STONE_COUNT,
  STONE_LIFETIME_SEC,
  BALL_TYPES,
  getBallType,
  isBallTypeId,
  initialBallPool,
  cannonSolidPool,
  matchColors,
  typesMatch,
  expandMatchGroup,
  isMulticolorMatch,
  CHAIN_RUN_LENGTHS,
  ChainTypeStream,
  pickChainRunLength,
  pickFromPool,
  rollLevelOffer,
  ballDisplayColors,
  solidTypeId,
  isExplosive,
  isIce,
  isVolun,
  isStone,
  STONE_TYPE_ID,
  spawnStoneFuse,
  blastInclusiveRange,
  resolveClearEffects,
  type SolidColor,
  type BallKind,
  type BallTypeDef,
  type ClearResolution,
} from "./balls/index.js";

export const RATING_DELTA = 30;
export const STARTING_RATING = 1000;

export const TICK_HZ = 20;
export const BALL_RADIUS = 14;
/** Steady path push after the intro boost (px/s). */
export const PATH_SPEED = 20;
/** Path push for the first {@link PATH_SPEED_INTRO_HOLD_SEC} seconds (px/s). */
export const PATH_SPEED_INTRO = 100;
/** Hold intro speed this long after match start. */
export const PATH_SPEED_INTRO_HOLD_SEC = 2;
/** Then ease from intro → cruise over this many seconds. */
export const PATH_SPEED_INTRO_RAMP_SEC = 3;

/** Path push speed at `elapsedSec` since match start (intro boost → cruise). */
export function pathSpeedAt(elapsedSec: number): number {
  const t = Math.max(0, elapsedSec);
  if (t <= PATH_SPEED_INTRO_HOLD_SEC) return PATH_SPEED_INTRO;
  const u =
    (t - PATH_SPEED_INTRO_HOLD_SEC) / Math.max(1e-6, PATH_SPEED_INTRO_RAMP_SEC);
  if (u >= 1) return PATH_SPEED;
  const s = u * u * (3 - 2 * u);
  return PATH_SPEED_INTRO + (PATH_SPEED - PATH_SPEED_INTRO) * s;
}

/** Max speed of floating segments rolling back toward the train. */
export const ROLLBACK_SPEED = 48;
/** Floating segments wait this long before starting to roll back. */
export const ROLLBACK_PAUSE_SEC = 1;
/** Time to ease from 0 → ROLLBACK_SPEED after the pause. */
export const ROLLBACK_RAMP_SEC = 0.65;
export const PROJECTILE_SPEED = 620;
/** Projectile center → chain-ball center hit distance. */
export const PROJECTILE_HIT_RADIUS = BALL_RADIUS * 1.6;
/** Balls cleared required to go from level 0 → 1. */
export const BASE_LEVEL_EXP = 10;
/** Each next level needs +10% more cleared balls than the previous. */
export const LEVEL_EXP_GROWTH = 1.1;
export const INITIAL_CHAIN = 18;
/**
 * Absolute safety ceiling for balls on one chain (sync / memory).
 * Gameplay spawn is also gated by mouth clearance and path length — this
 * must stay above the longest ranked path (~73 packed balls) or spawn
 * stops mid-match while the hole is still far away.
 */
export const MAX_CHAIN = 96;
/** Spacing slack before two balls count as separate segments. */
export const GAP_EPS = 2;

/** Max balls that can pack on a path before the mouth is blocked. */
export function chainCapacityForPath(pathTotal: number): number {
  const packed = Math.floor(Math.max(0, pathTotal) / (BALL_RADIUS * 2));
  return Math.min(MAX_CHAIN, packed + 2);
}

export {
  EXP_PARTICLE_WAIT_SEC,
  EXP_PARTICLE_MIN,
  EXP_PARTICLE_MAX,
  EXP_PARTICLE_SCATTER_SPEED,
  EXP_PARTICLE_ACCEL,
  EXP_PARTICLE_MAX_SPEED,
  EXP_PARTICLE_PICKUP_R,
  EXP_PARTICLE_RADIUS,
  EXP_ORB_EXPIRE_SEC,
  EXP_ORB_VFX_CAP,
  rollExpParticleCount,
  expParticleFlightSec,
  expParticleReadyDelaySec,
  expParticleColor,
  expParticleScatterVelocity,
} from "./expParticles.js";

/** Exp (cleared balls) needed to advance from `level` to `level + 1`. */
export function expToNextLevel(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  return Math.max(1, Math.ceil(BASE_LEVEL_EXP * LEVEL_EXP_GROWTH ** lv));
}

export type { Point } from "./map.js";

export {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MAP_BG_PALETTE,
  DEFAULT_MAP_BG,
  MAP_ASPECTS,
  DEFAULT_MAP_ASPECT_ID,
  PATH_A,
  PATH_B,
  CANNON_A,
  CANNON_B,
  createDefaultMap,
  validateMap,
  parseGameMap,
  isPoint,
  isMapLane,
  isMapBgColor,
  normalizeHex,
  getMapAspect,
  findMapAspect,
  mirrorPointX,
  mirrorLane,
  scaleLane,
  type MapLane,
  type GameMap,
  type MapBgColor,
  type MapAspect,
  type MapAspectId,
} from "./map.js";

export {
  SOLO_CLASSIC,
  RANKED_CLASSIC,
  MAP_CATALOG,
  DEFAULT_SOLO_MAP_ID,
  DEFAULT_RANKED_MAP_ID,
  getMap,
  getSoloMap,
  getRankedMap,
  mapLane,
  mapPath,
  mapCannon,
  listMaps,
} from "./maps/index.js";

export {
  buildPath,
  pointAtPath,
  pointAtPathInto,
  type PathGeom,
  type PathPoint,
} from "./path.js";

export {
  firstProjectileHit,
  segmentCircleHitT,
  type ProjectileHitTarget,
} from "./projectileHit.js";

export { mulberry32, createColorStream, randomSeed } from "./rng.js";

export type RoomPhase = "lobby" | "playing" | "ended";

export const MESSAGES = {
  aim: "aim",
  fire: "fire",
  pickBall: "pickBall",
  ready: "ready",
} as const;
