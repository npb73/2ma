import { UI } from "@2ma/shared";
import Phaser from "phaser";

export const BARREL_LEN = 40;
export const MUZZLE_BALL_R = 11;
export const NEXT_BALL_R = 10;
/** Outer radius of the cannon reload ring. */
export const RELOAD_RING_R = 30;

const RECOIL_DIST = 8;
const RECOIL_MS = 130;

const COLOR_CACHE = new Map<string, number>();

function hex(color: string): number {
  let value = COLOR_CACHE.get(color);
  if (value === undefined) {
    value = Phaser.Display.Color.HexStringToColor(color).color;
    COLOR_CACHE.set(color, value);
  }
  return value;
}

/** Short kickback along aim; decays over ~RECOIL_MS. */
export class CannonRecoil {
  private until = new Map<string, number>();

  kick(id: string, now = performance.now()): void {
    this.until.set(id, now + RECOIL_MS);
  }

  offset(
    id: string,
    aim: number,
    now = performance.now(),
  ): { x: number; y: number } {
    const end = this.until.get(id) ?? 0;
    const u = (end - now) / RECOIL_MS;
    if (u <= 0) return { x: 0, y: 0 };
    const amount = RECOIL_DIST * u * u;
    return {
      x: -Math.cos(aim) * amount,
      y: -Math.sin(aim) * amount,
    };
  }
}

/** Client-predicted fire cooldown for ranked local shots (ms clock). */
export class LocalReload {
  private until = 0;

  kick(durationSec: number, now = performance.now()): void {
    this.until = now + durationSec * 1000;
  }

  remainingSec(now = performance.now()): number {
    return Math.max(0, (this.until - now) / 1000);
  }

  ready(now = performance.now()): boolean {
    return now >= this.until;
  }
}

export interface CannonPose {
  baseX: number;
  baseY: number;
  tipX: number;
  tipY: number;
}

/** Body + barrel; returns base/tip after recoil for ball placement. */
export function cannonPose(
  cx: number,
  cy: number,
  aim: number,
  recoil: { x: number; y: number },
): CannonPose {
  const baseX = cx + recoil.x;
  const baseY = cy + recoil.y;
  return {
    baseX,
    baseY,
    tipX: baseX + Math.cos(aim) * BARREL_LEN,
    tipY: baseY + Math.sin(aim) * BARREL_LEN,
  };
}

export function drawCannonBody(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  aim: number,
  recoil: { x: number; y: number },
  barrelColor: string = UI.cannon,
): CannonPose {
  const pose = cannonPose(cx, cy, aim, recoil);
  g.fillStyle(hex(UI.cannon), 1);
  g.fillCircle(pose.baseX, pose.baseY, 22);
  g.lineStyle(5, hex(barrelColor), 1);
  g.lineBetween(pose.baseX, pose.baseY, pose.tipX, pose.tipY);
  return pose;
}

/**
 * Circular reload gauge around the cannon.
 * `readyProgress` 0 = just fired, 1 = ready (ring hidden when ≥ 1).
 */
export function drawReloadRing(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  readyProgress: number,
): void {
  if (readyProgress >= 1) return;
  const p = Math.max(0, Math.min(1, readyProgress));
  const start = -Math.PI / 2;

  g.lineStyle(3, hex(UI.secondaryDark), 0.55);
  g.strokeCircle(cx, cy, RELOAD_RING_R);

  const sweep = Math.max(0.02, p) * Math.PI * 2;
  g.lineStyle(3, hex(UI.accentHot), 1);
  g.beginPath();
  g.arc(cx, cy, RELOAD_RING_R, start, start + sweep, false);
  g.strokePath();
}
