import {
  BALL_RADIUS,
  CANNON_A,
  CANNON_B,
  PROJECTILE_SPEED,
  type Point,
} from "@2ma/shared";

export interface ServerProjectile {
  id: string;
  ownerSessionId: string;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface VisualProjectile {
  id: string;
  /** Server id for opponent shots; same as id for own predicted shots. */
  serverId: string | null;
  ownerSessionId: string;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Own predicted shot — flight is client-side until server resolves hit. */
  local: boolean;
}

const HIT_RADIUS = BALL_RADIUS * 1.6;
const OFFSCREEN = { minX: -50, maxX: 1330, minY: -50, maxY: 770 };

/**
 * Client-only projectile flight. Server still resolves hits;
 * we animate smoothly and despawn on predicted hit / off-screen /
 * when the server reports the shot as resolved (via resolvedShotIds).
 */
export class ProjectilePresenter {
  private items = new Map<string, VisualProjectile>();
  private localSeq = 0;
  private knownServerIds = new Set<string>();
  private seenResolved = new Set<string>();

  /** Spawns a predicted local shot and returns its id (sent with `fire`). */
  spawnLocal(opts: {
    ownerSessionId: string;
    seat: number;
    aim: number;
    color: number;
  }): string {
    const cannon = opts.seat === 0 ? CANNON_A : CANNON_B;
    const id = `s${++this.localSeq}_${Math.random().toString(36).slice(2, 8)}`;
    this.items.set(id, {
      id,
      serverId: id,
      ownerSessionId: opts.ownerSessionId,
      color: opts.color,
      x: cannon.x,
      y: cannon.y,
      vx: Math.cos(opts.aim) * PROJECTILE_SPEED,
      vy: Math.sin(opts.aim) * PROJECTILE_SPEED,
      local: true,
    });
    return id;
  }

  /**
   * Adopt opponent projectiles once (freeze vx/vy). Own shots stay on the
   * spawnLocal path. Despawn when server resolves a shot id (combo clears
   * remove target balls before predicted contact can fire).
   */
  syncServer(
    serverProjs: ServerProjectile[],
    mySessionId: string,
    resolvedShotIds: string[],
  ): void {
    for (const rid of resolvedShotIds) {
      if (this.seenResolved.has(rid)) continue;
      this.seenResolved.add(rid);
      this.items.delete(rid);
    }
    // Keep seenResolved bounded to the ring buffer we care about.
    if (this.seenResolved.size > 64) {
      const live = new Set(resolvedShotIds);
      for (const id of this.seenResolved) {
        if (!live.has(id)) this.seenResolved.delete(id);
      }
    }

    const live = new Set<string>();
    for (const sp of serverProjs) {
      live.add(sp.id);
      if (sp.ownerSessionId === mySessionId) {
        // Own shot is rendered via spawnLocal — skip jittery server positions.
        this.knownServerIds.add(sp.id);
        continue;
      }
      if (this.knownServerIds.has(sp.id)) continue;
      this.knownServerIds.add(sp.id);
      this.items.set(sp.id, {
        id: sp.id,
        serverId: sp.id,
        ownerSessionId: sp.ownerSessionId,
        color: sp.color,
        x: sp.x,
        y: sp.y,
        vx: sp.vx,
        vy: sp.vy,
        local: false,
      });
    }

    // Opponent projectile removed on server (hit / miss) → drop visual
    for (const [id, item] of this.items) {
      if (item.local) continue;
      if (item.serverId && !live.has(item.serverId)) {
        this.items.delete(id);
      }
    }

    for (const sid of [...this.knownServerIds]) {
      if (!live.has(sid)) this.knownServerIds.delete(sid);
    }
  }

  step(
    dtSec: number,
    ballPositions: Point[],
  ): void {
    for (const [id, p] of this.items) {
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      if (
        p.x < OFFSCREEN.minX ||
        p.x > OFFSCREEN.maxX ||
        p.y < OFFSCREEN.minY ||
        p.y > OFFSCREEN.maxY
      ) {
        this.items.delete(id);
        continue;
      }

      // Predicted contact with any rendered ball — stop the flight visually.
      for (const ball of ballPositions) {
        if (Math.hypot(ball.x - p.x, ball.y - p.y) <= HIT_RADIUS) {
          this.items.delete(id);
          break;
        }
      }
    }
  }

  forEach(fn: (color: number, x: number, y: number) => void): void {
    for (const p of this.items.values()) {
      fn(p.color, p.x, p.y);
    }
  }

  clear(): void {
    this.items.clear();
    this.knownServerIds.clear();
    this.seenResolved.clear();
  }
}
