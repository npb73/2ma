import {
  BALL_RADIUS,
  PROJECTILE_SPEED,
  type Point,
} from "@2ma/shared";

export interface ServerProjectile {
  id: string;
  ownerSessionId: string;
  typeId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface VisualProjectile {
  id: string;
  serverId: string | null;
  ownerSessionId: string;
  typeId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  local: boolean;
}

const HIT_RADIUS = BALL_RADIUS * 1.6;
const OFFSCREEN = { minX: -50, maxX: 1330, minY: -50, maxY: 770 };

export class ProjectilePresenter {
  private items = new Map<string, VisualProjectile>();
  private localSeq = 0;
  private knownServerIds = new Set<string>();
  private seenResolved = new Set<string>();

  spawnLocal(opts: {
    ownerSessionId: string;
    aim: number;
    typeId: string;
    cannon: Point;
  }): string {
    const { cannon } = opts;
    const id = `s${++this.localSeq}_${Math.random().toString(36).slice(2, 8)}`;
    this.items.set(id, {
      id,
      serverId: id,
      ownerSessionId: opts.ownerSessionId,
      typeId: opts.typeId,
      x: cannon.x,
      y: cannon.y,
      vx: Math.cos(opts.aim) * PROJECTILE_SPEED,
      vy: Math.sin(opts.aim) * PROJECTILE_SPEED,
      local: true,
    });
    return id;
  }

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
        this.knownServerIds.add(sp.id);
        continue;
      }
      if (this.knownServerIds.has(sp.id)) continue;
      this.knownServerIds.add(sp.id);
      this.items.set(sp.id, {
        id: sp.id,
        serverId: sp.id,
        ownerSessionId: sp.ownerSessionId,
        typeId: sp.typeId,
        x: sp.x,
        y: sp.y,
        vx: sp.vx,
        vy: sp.vy,
        local: false,
      });
    }

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

  step(dtSec: number, ballsByOwner: Map<string, Point[]>): void {
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

      const ownBalls = ballsByOwner.get(p.ownerSessionId);
      if (!ownBalls) continue;
      for (const ball of ownBalls) {
        if (Math.hypot(ball.x - p.x, ball.y - p.y) <= HIT_RADIUS) {
          this.items.delete(id);
          break;
        }
      }
    }
  }

  forEach(fn: (id: string, typeId: string, x: number, y: number) => void): void {
    for (const p of this.items.values()) {
      fn(p.id, p.typeId, p.x, p.y);
    }
  }

  clear(): void {
    this.items.clear();
    this.knownServerIds.clear();
    this.seenResolved.clear();
  }
}
