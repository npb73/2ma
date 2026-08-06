import {
  EXP_PARTICLE_ACCEL,
  EXP_PARTICLE_MAX_SPEED,
  EXP_PARTICLE_PICKUP_R,
  EXP_PARTICLE_RADIUS,
  EXP_PARTICLE_WAIT_SEC,
  expParticleScatterVelocity,
  type Point,
} from "@2ma/shared";
import type Phaser from "phaser";
import { hex } from "./balls/util";

export interface ExpOrbSpawn {
  id: string;
  ownerSessionId: string;
  x: number;
  y: number;
  color: string;
}

interface Orb {
  id: string;
  ownerSessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  wait: number;
  targetX: number;
  targetY: number;
  /** Local pickup already sent / claimed. */
  claimed: boolean;
}

/**
 * Client-only orb motion. Spawns from authoritative credits; reports pickup ids.
 */
export class ExpOrbPresenter {
  private orbs: Orb[] = [];
  private knownIds = new Set<string>();

  clear(): void {
    this.orbs.length = 0;
    this.knownIds.clear();
  }

  /**
   * Spawn any new server/solo credits not yet animated.
   * Drops local orbs whose credit disappeared (collected elsewhere / expire).
   */
  syncCredits(
    credits: ExpOrbSpawn[],
    cannonOf: (ownerSessionId: string) => Point | null,
  ): void {
    const live = new Set<string>();
    for (const c of credits) {
      live.add(c.id);
      if (this.knownIds.has(c.id)) continue;
      const cannon = cannonOf(c.ownerSessionId);
      if (!cannon) continue;
      this.knownIds.add(c.id);
      const { vx, vy } = expParticleScatterVelocity(() => Math.random());
      this.orbs.push({
        id: c.id,
        ownerSessionId: c.ownerSessionId,
        x: c.x,
        y: c.y,
        vx,
        vy,
        color: c.color,
        wait: EXP_PARTICLE_WAIT_SEC,
        targetX: cannon.x,
        targetY: cannon.y,
        claimed: false,
      });
    }

    if (this.orbs.length > 0) {
      this.orbs = this.orbs.filter((o) => live.has(o.id));
    }
    for (const id of [...this.knownIds]) {
      if (!live.has(id)) this.knownIds.delete(id);
    }
  }

  /**
   * Advance motion. Returns orb ids that reached the cannon this frame
   * (caller should collectExp / send collectExp).
   */
  step(dt: number): string[] {
    if (this.orbs.length === 0 || dt <= 0) return [];
    const picked: string[] = [];
    const survivors: Orb[] = [];
    for (const orb of this.orbs) {
      if (orb.claimed) continue;

      if (orb.wait > 0) {
        orb.wait = Math.max(0, orb.wait - dt);
        orb.vx *= 0.92;
        orb.vy *= 0.92;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        survivors.push(orb);
        continue;
      }

      const dx = orb.targetX - orb.x;
      const dy = orb.targetY - orb.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= EXP_PARTICLE_PICKUP_R) {
        // Keep until credit is removed; retry collect if server rejected early.
        picked.push(orb.id);
        orb.claimed = true;
        survivors.push(orb);
        continue;
      }

      const inv = dist > 1e-3 ? 1 / dist : 0;
      orb.vx += dx * inv * EXP_PARTICLE_ACCEL * dt;
      orb.vy += dy * inv * EXP_PARTICLE_ACCEL * dt;
      const speed = Math.hypot(orb.vx, orb.vy);
      if (speed > EXP_PARTICLE_MAX_SPEED) {
        const s = EXP_PARTICLE_MAX_SPEED / speed;
        orb.vx *= s;
        orb.vy *= s;
      }
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      survivors.push(orb);
    }
    this.orbs = survivors;
    return picked;
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    for (const orb of this.orbs) {
      g.fillStyle(hex(orb.color), 1);
      g.fillCircle(orb.x, orb.y, EXP_PARTICLE_RADIUS);
    }
  }
}
