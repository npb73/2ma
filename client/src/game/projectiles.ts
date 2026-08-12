import {
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_SPEED,
  firstProjectileHit,
  type Point,
  type ProjectileHitTarget,
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

export class ProjectilePresenter {
  private items = new Map<string, VisualProjectile>();
  private localSeq = 0;
  private knownServerIds = new Set<string>();
  private seenResolved = new Set<string>();
  private bounds = { minX: -80, maxX: 1360, minY: -80, maxY: 800 };
  /** Per-owner target lists rebuilt once per step (pooled objects). */
  private readonly targetsByOwner = new Map<string, ProjectileHitTarget[]>();
  private readonly targetPool: ProjectileHitTarget[] = [];

  setWorldSize(width: number, height: number): void {
    const margin = 80;
    this.bounds = {
      minX: -margin,
      maxX: width + margin,
      minY: -margin,
      maxY: height + margin,
    };
  }

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
    const { minX, maxX, minY, maxY } = this.bounds;

    for (const arr of this.targetsByOwner.values()) arr.length = 0;

    let poolIdx = 0;
    for (const [ownerId, ownBalls] of ballsByOwner) {
      if (ownBalls.length === 0) continue;
      let targets = this.targetsByOwner.get(ownerId);
      if (!targets) {
        targets = [];
        this.targetsByOwner.set(ownerId, targets);
      }
      for (let i = 0; i < ownBalls.length; i++) {
        let t = this.targetPool[poolIdx];
        if (!t) {
          t = { x: 0, y: 0, dist: 0 };
          this.targetPool[poolIdx] = t;
        }
        const b = ownBalls[i];
        t.x = b.x;
        t.y = b.y;
        t.dist = i;
        targets.push(t);
        poolIdx++;
      }
    }

    for (const [id, p] of this.items) {
      const x0 = p.x;
      const y0 = p.y;
      const x1 = x0 + p.vx * dtSec;
      const y1 = y0 + p.vy * dtSec;

      // Collide with any chain (own or opponent) — matches server crossfire.
      let hitAny = false;
      for (const targets of this.targetsByOwner.values()) {
        if (targets.length === 0) continue;
        const hit = firstProjectileHit(
          x0,
          y0,
          x1,
          y1,
          targets,
          PROJECTILE_HIT_RADIUS,
        );
        if (hit) {
          hitAny = true;
          break;
        }
      }
      if (hitAny) {
        this.items.delete(id);
        continue;
      }

      p.x = x1;
      p.y = y1;

      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        this.items.delete(id);
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
    for (const arr of this.targetsByOwner.values()) arr.length = 0;
  }
}
