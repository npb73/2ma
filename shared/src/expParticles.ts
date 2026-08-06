import { ballDisplayColors } from "./balls/index.js";

export const EXP_PARTICLE_WAIT_SEC = 0.5;
export const EXP_PARTICLE_MIN = 1;
export const EXP_PARTICLE_MAX = 3;
/** Initial scatter speed (px/s). */
export const EXP_PARTICLE_SCATTER_SPEED = 90;
/** Acceleration toward cannon after wait (px/s²). */
export const EXP_PARTICLE_ACCEL = 520;
/** Max seek speed (px/s). */
export const EXP_PARTICLE_MAX_SPEED = 420;
/** Pickup radius around the cannon. */
export const EXP_PARTICLE_PICKUP_R = 22;
/** Drawn orb radius (client). */
export const EXP_PARTICLE_RADIUS = 5;
/** After this from spawn, server auto-grants if client never collected. */
export const EXP_ORB_EXPIRE_SEC = 2.5;

/** Random particle count for one destroyed ball (legacy helper). */
export function rollExpParticleCount(rng: () => number): number {
  const span = EXP_PARTICLE_MAX - EXP_PARTICLE_MIN + 1;
  return EXP_PARTICLE_MIN + Math.floor(rng() * span);
}

/** Seek time after wait, approximating client accel→max-speed motion. */
export function expParticleFlightSec(dist: number): number {
  const d = Math.max(0, dist - EXP_PARTICLE_PICKUP_R);
  if (d <= 0) return 0;
  const a = EXP_PARTICLE_ACCEL;
  const vmax = EXP_PARTICLE_MAX_SPEED;
  const dAccel = (vmax * vmax) / (2 * a);
  if (d <= dAccel) return Math.sqrt((2 * d) / a);
  return vmax / a + (d - dAccel) / vmax;
}

/** Earliest collect time after spawn (wait + flight). */
export function expParticleReadyDelaySec(dist: number): number {
  return EXP_PARTICLE_WAIT_SEC + expParticleFlightSec(dist);
}

export function expParticleColor(typeId: string): string {
  return ballDisplayColors(typeId)[0] ?? "#ffffe4";
}

/** Initial scatter velocity for a freshly spawned orb. */
export function expParticleScatterVelocity(rng: () => number): {
  vx: number;
  vy: number;
} {
  const a = rng() * Math.PI * 2;
  const speed = EXP_PARTICLE_SCATTER_SPEED * (0.55 + rng() * 0.45);
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}
