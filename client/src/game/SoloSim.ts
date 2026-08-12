import {
  BALL_RADIUS,
  EXP_ORB_EXPIRE_SEC,
  EXP_ORB_VFX_CAP,
  EXP_PARTICLE_WAIT_SEC,
  FIRE_RELOAD_SEC,
  GAP_EPS,
  ICE_FREEZE_SEC,
  INITIAL_CHAIN,
  pathSpeedAt,
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_SPEED,
  ROLLBACK_PAUSE_SEC,
  ROLLBACK_RAMP_SEC,
  ROLLBACK_SPEED,
  TICK_HZ,
  buildPath,
  cannonSolidPool,
  chainCapacityForPath,
  ChainTypeStream,
  expandMatchGroup,
  expParticleColor,
  expParticleReadyDelaySec,
  expToNextLevel,
  firstProjectileHit,
  getSoloMap,
  initialBallPool,
  isBallTypeId,
  pickFromPool,
  pointAtPathInto,
  resolveClearEffects,
  rollLevelOffer,
  type GameMap,
  type PathGeom,
  type Point,
  type ProjectileHitTarget,
} from "@2ma/shared";

const DT = 1 / TICK_HZ;
const DIAMETER = BALL_RADIUS * 2;
const CONTACT = DIAMETER + GAP_EPS;

export interface SoloBall {
  id: string;
  typeId: string;
  dist: number;
}

export interface SoloProjectile {
  id: string;
  ownerSessionId: string;
  typeId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SoloExpOrb {
  id: string;
  ownerSessionId: string;
  x: number;
  y: number;
  color: string;
}

export interface SoloPlayer {
  sessionId: string;
  displayName: string;
  seat: number;
  aim: number;
  currentType: string;
  nextType: string;
  combo: number;
  level: number;
  exp: number;
  offerDebt: number;
  freezeSec: number;
  reloadSec: number;
  ballPool: string[];
  pendingOffer: string[];
  chain: SoloBall[];
}

export interface SoloSnapshot {
  phase: "playing" | "ended";
  players: SoloPlayer[];
  projectiles: SoloProjectile[];
  expOrbs: SoloExpOrb[];
  resolvedShotIds: string[];
  score: number;
}

interface FloatMotion {
  pause: number;
  rampT: number;
}

interface ExpOrbMeta {
  readyAt: number;
  expiresAt: number;
}

function nid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function sanitizeShotId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  if (id.length < 1 || id.length > 32) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export class SoloSim {
  readonly map: GameMap;
  readonly path: PathGeom;
  readonly cannon: Point;
  readonly sessionId = "solo";

  phase: "playing" | "ended" = "playing";
  score = 0;
  player: SoloPlayer;
  projectiles: SoloProjectile[] = [];
  expOrbs: SoloExpOrb[] = [];
  resolvedShotIds: string[] = [];

  private spawnAcc = 0;
  private simTime = 0;
  private expOrbMeta = new Map<string, ExpOrbMeta>();
  private floatMotion = new Map<string, FloatMotion>();
  private readonly cannonPool = cannonSolidPool();
  private readonly chainStream = new ChainTypeStream();
  private readonly clearPos = { x: 0, y: 0 };
  /** When set, ignores intro curve (solo debug). */
  private speedOverride: number | null = null;

  constructor(displayName = "Игрок", map: GameMap = getSoloMap()) {
    this.map = map;
    const lane = map.lanes[0];
    this.path = buildPath(lane.path);
    this.cannon = { ...lane.cannon };
    this.player = {
      sessionId: this.sessionId,
      displayName,
      seat: 0,
      aim: 0,
      currentType: "solid_0",
      nextType: "solid_1",
      combo: 0,
      level: 0,
      exp: 0,
      offerDebt: 0,
      freezeSec: 0,
      reloadSec: 0,
      ballPool: initialBallPool(),
      pendingOffer: [],
      chain: [],
    };
    this.reset();
  }

  reset(): void {
    this.chainStream.reset();
    this.player.ballPool = initialBallPool();
    this.player.pendingOffer = [];
    this.player.chain = [];
    for (let i = 0; i < INITIAL_CHAIN; i++) {
      const typeId = this.nextChainType();
      this.player.chain.push({
        id: nid(),
        typeId,
        dist: i * DIAMETER,
      });
    }
    this.player.currentType = this.nextCannonType();
    this.player.nextType = this.nextCannonType();
    this.player.combo = 0;
    this.player.level = 0;
    this.player.exp = 0;
    this.player.offerDebt = 0;
    this.player.freezeSec = 0;
    this.player.reloadSec = 0;
    this.player.aim = 0;
    this.projectiles = [];
    this.expOrbs = [];
    this.resolvedShotIds = [];
    this.spawnAcc = 0;
    this.simTime = 0;
    this.expOrbMeta.clear();
    this.floatMotion.clear();
    this.phase = "playing";
    this.score = 0;
  }

  snapshot(): SoloSnapshot {
    const p = this.player;
    return {
      phase: this.phase,
      players: [
        {
          ...p,
          ballPool: [...p.ballPool],
          pendingOffer: [...p.pendingOffer],
          chain: p.chain.map((b) => ({ ...b })),
        },
      ],
      projectiles: this.projectiles.map((pr) => ({ ...pr })),
      expOrbs: this.expOrbs.map((o) => ({ ...o })),
      resolvedShotIds: [...this.resolvedShotIds],
      score: this.score,
    };
  }

  setAim(angle: number): void {
    if (this.phase !== "playing") return;
    this.player.aim = angle;
  }

  fire(clientShotId?: string): void {
    if (this.phase !== "playing") return;
    if (this.player.pendingOffer.length > 0) return;
    if (this.player.reloadSec > 0) return;

    const p = this.player;
    this.projectiles.push({
      id: sanitizeShotId(clientShotId) ?? nid(),
      ownerSessionId: this.sessionId,
      typeId: p.currentType,
      x: this.cannon.x,
      y: this.cannon.y,
      vx: Math.cos(p.aim) * PROJECTILE_SPEED,
      vy: Math.sin(p.aim) * PROJECTILE_SPEED,
    });

    p.currentType = p.nextType;
    p.nextType = this.nextCannonType();
    p.reloadSec = FIRE_RELOAD_SEC;
  }

  pickBall(typeId: string): void {
    if (!isBallTypeId(typeId)) return;
    if (!this.player.pendingOffer.includes(typeId)) return;
    this.player.ballPool.push(typeId);
    this.player.pendingOffer = [];
    this.chainStream.enqueueNext(typeId);
    this.flushOfferDebt();
  }

  /** Cannon ammo: fixed solids only (purchases never affect the cannon). */
  private nextCannonType(): string {
    return pickFromPool(this.cannonPool, () => Math.random());
  }

  /** Current path push speed (time ramp, or debug override). */
  get pathSpeed(): number {
    if (this.speedOverride != null) return this.speedOverride;
    return pathSpeedAt(this.simTime);
  }

  /** Solo debug: chain run-length weights (copied). */
  getRunLengths(): number[] {
    return this.chainStream.getRunLengths();
  }

  /** Solo debug: replace run-length table (applies to future spawns). */
  setRunLengths(lengths: readonly number[]): void {
    this.chainStream.setRunLengths(lengths);
  }

  /**
   * Solo debug: lock path speed (px/s). Pass `null` to restore intro→cruise curve.
   */
  setPathSpeed(speed: number | null): void {
    if (speed == null) {
      this.speedOverride = null;
      return;
    }
    if (!Number.isFinite(speed)) return;
    this.speedOverride = Math.min(200, Math.max(1, speed));
  }

  /** Chain spawn: run-length batches from the player's spawn pool. */
  private nextChainType(): string {
    const pool =
      this.player.ballPool.length > 0
        ? this.player.ballPool
        : initialBallPool();
    return this.chainStream.next(pool, () => Math.random());
  }

  /** Claim an orb by id (despawn VFX only — exp granted on clear). */
  collectExp(orbId: string): boolean {
    if (this.phase !== "playing") return false;
    const id = sanitizeShotId(orbId);
    if (!id) return false;
    const meta = this.expOrbMeta.get(id);
    if (!meta) return false;
    if (meta.readyAt > this.simTime) return false;
    return this.consumeExpOrb(id);
  }

  tick(): void {
    if (this.phase !== "playing") return;
    this.simTime += DT;
    if (this.player.reloadSec > 0) {
      this.player.reloadSec = Math.max(0, this.player.reloadSec - DT);
    }
    this.advanceChain();
    this.advanceProjectiles();
    this.tickExpiredExpOrbs();

    if (this.player.chain.length === 0) return;
    const balls = this.sortChainInPlace();
    if (balls[balls.length - 1].dist >= this.path.total - 1) {
      this.phase = "ended";
    }
  }

  /** Sort player.chain in place and return it (no copy). */
  private sortChainInPlace(): SoloBall[] {
    this.player.chain.sort((a, b) => a.dist - b.dist);
    return this.player.chain;
  }

  private advanceChain(): void {
    if (this.player.freezeSec > 0) {
      this.player.freezeSec = Math.max(0, this.player.freezeSec - DT);
      return;
    }

    const path = this.path;
    let balls = this.sortChainInPlace();

    if (balls.length > 0) {
      // Mutates BallState.dist in place — no ArraySchema rewrite.
      // Floating segments may pack on contact, but never auto-clear:
      // combos only clear from player shots (insertAndMatch).
      this.stepTrainPhysics(balls, path, this.pathSpeed);
      balls = this.sortChainInPlace();
    }

    // Cap debt to one ball so clears cannot burst-fill the chain in one tick.
    this.spawnAcc = Math.min(this.spawnAcc + this.pathSpeed * DT, DIAMETER);
    const cap = chainCapacityForPath(path.total);
    while (this.spawnAcc >= DIAMETER && balls.length < cap) {
      const back = balls[0];
      // Natural limit: spawn while the mouth is free; stops only when the
      // train backs up to the entrance (or match ends at the hole).
      if (back && back.dist < DIAMETER) break;
      this.spawnAcc -= DIAMETER;
      const typeId = this.nextChainType();
      balls.unshift({
        id: nid(),
        typeId,
        dist: 0,
      });
      this.packFrom(balls, 0);
    }
  }

  private stepTrainPhysics(
    balls: SoloBall[],
    path: PathGeom,
    pushSpeed: number,
  ): { balls: SoloBall[]; joinAt: number[] } {
    balls.sort((a, b) => a.dist - b.dist);
    const segments = this.segmentRanges(balls);
    if (segments.length === 0) return { balls, joinAt: [] };

    const [rearStart, rearEnd] = segments[0];
    for (let i = rearStart; i <= rearEnd; i++) {
      balls[i].dist += pushSpeed * DT;
    }
    this.packFrom(balls, rearStart, rearEnd);

    const liveKeys = new Set<string>();
    for (let s = 1; s < segments.length; s++) {
      const [start, end] = segments[s];
      const key = balls[start].id;
      liveKeys.add(key);

      let motion = this.floatMotion.get(key);
      if (!motion) {
        motion = { pause: ROLLBACK_PAUSE_SEC, rampT: 0 };
        this.floatMotion.set(key, motion);
      }

      let rollbackSpeed = 0;
      if (motion.pause > 0) {
        motion.pause = Math.max(0, motion.pause - DT);
      } else {
        motion.rampT += DT;
        const u = Math.min(1, motion.rampT / ROLLBACK_RAMP_SEC);
        rollbackSpeed = ROLLBACK_SPEED * (u * u);
      }

      if (rollbackSpeed > 0) {
        for (let i = start; i <= end; i++) {
          balls[i].dist -= rollbackSpeed * DT;
        }
      }

      const prevEnd = segments[s - 1][1];
      const minDist = balls[prevEnd].dist + DIAMETER;
      if (balls[start].dist < minDist) {
        const shift = minDist - balls[start].dist;
        for (let i = start; i <= end; i++) {
          balls[i].dist += shift;
        }
      }
      this.packFrom(balls, start, end);
    }

    for (const key of [...this.floatMotion.keys()]) {
      if (!liveKeys.has(key)) this.floatMotion.delete(key);
    }

    // Indices where formerly separate segments just came into contact.
    const joinAt: number[] = [];
    for (let s = 1; s < segments.length; s++) {
      const prevEnd = segments[s - 1][1];
      const nextStart = segments[s][0];
      if (balls[nextStart].dist - balls[prevEnd].dist <= CONTACT) {
        joinAt.push(nextStart);
      }
    }

    balls = this.mergeContacts(balls);
    for (const b of balls) {
      if (b.dist < 0) b.dist = 0;
      if (b.dist > path.total) b.dist = path.total;
    }
    return { balls, joinAt };
  }

  private segmentRanges(balls: SoloBall[]): Array<[number, number]> {
    if (balls.length === 0) return [];
    const ranges: Array<[number, number]> = [];
    let start = 0;
    for (let i = 1; i < balls.length; i++) {
      if (balls[i].dist - balls[i - 1].dist > CONTACT) {
        ranges.push([start, i - 1]);
        start = i;
      }
    }
    ranges.push([start, balls.length - 1]);
    return ranges;
  }

  private packFrom(
    balls: SoloBall[],
    from: number,
    to = balls.length - 1,
  ): void {
    for (let i = from + 1; i <= to; i++) {
      const minDist = balls[i - 1].dist + DIAMETER;
      if (balls[i].dist < minDist) balls[i].dist = minDist;
    }
  }

  private mergeContacts(balls: SoloBall[]): SoloBall[] {
    balls.sort((a, b) => a.dist - b.dist);
    for (let i = 1; i < balls.length; i++) {
      if (balls[i].dist - balls[i - 1].dist <= CONTACT) {
        balls[i].dist = balls[i - 1].dist + DIAMETER;
      }
    }
    return balls;
  }

  private advanceProjectiles(): void {
    const survivors: SoloProjectile[] = [];
    const balls = this.sortChainInPlace();
    const targets: ProjectileHitTarget[] = [];
    const hitPos = { x: 0, y: 0 };
    for (const ball of balls) {
      pointAtPathInto(this.path, ball.dist, hitPos);
      targets.push({ x: hitPos.x, y: hitPos.y, dist: ball.dist });
    }

    const margin = 80;
    const minX = -margin;
    const maxX = this.map.width + margin;
    const minY = -margin;
    const maxY = this.map.height + margin;

    for (const proj of this.projectiles) {
      const x0 = proj.x;
      const y0 = proj.y;
      const x1 = x0 + proj.vx * DT;
      const y1 = y0 + proj.vy * DT;

      const hit = firstProjectileHit(
        x0,
        y0,
        x1,
        y1,
        targets,
        PROJECTILE_HIT_RADIUS,
      );
      if (hit) {
        this.markResolved(proj.id);
        this.insertAndMatch(hit.dist, proj.typeId);
        continue;
      }

      proj.x = x1;
      proj.y = y1;

      if (proj.x < minX || proj.x > maxX || proj.y < minY || proj.y > maxY) {
        this.markResolved(proj.id);
        continue;
      }

      survivors.push(proj);
    }
    this.projectiles = survivors;
  }

  private markResolved(shotId: string): void {
    this.resolvedShotIds.push(shotId);
    while (this.resolvedShotIds.length > 24) this.resolvedShotIds.shift();
  }

  private insertAndMatch(nearDist: number, typeId: string): void {
    const balls = this.sortChainInPlace();
    if (balls.length === 0) return;

    let hitIdx = 0;
    let best = Infinity;
    for (let i = 0; i < balls.length; i++) {
      const d = Math.abs(balls[i].dist - nearDist);
      if (d < best) {
        best = d;
        hitIdx = i;
      }
    }

    const segs = this.segmentRanges(balls);
    const hitSeg = segs.find(([s, e]) => hitIdx >= s && hitIdx <= e);
    const segEnd = hitSeg ? hitSeg[1] : hitIdx;

    const insert: SoloBall = {
      id: nid(),
      typeId,
      dist: balls[hitIdx].dist + DIAMETER * 0.5,
    };
    for (let i = hitIdx + 1; i <= segEnd; i++) {
      balls[i].dist += DIAMETER;
    }
    balls.push(insert);
    balls.sort((a, b) => a.dist - b.dist);

    const idx = balls.findIndex((b) => b.id === insert.id);
    if (idx < 0) return;

    const segsAfter = this.segmentRanges(balls);
    const packSeg = segsAfter.find(([s, e]) => idx >= s && idx <= e);
    if (packSeg) this.packFrom(balls, packSeg[0], packSeg[1]);

    const insertIdx = balls.findIndex((b) => b.id === insert.id);
    if (insertIdx < 0) return;

    const typeIds = balls.map((b) => b.typeId);
    const [left, right] = expandMatchGroup(
      typeIds,
      balls.map((b) => b.dist),
      insertIdx,
      CONTACT,
    );
    const groupSize = right - left + 1;
    if (groupSize < 3) {
      this.player.combo = 0;
      return;
    }

    const cleared = this.commitClear(balls, typeIds, left, right);
    this.score += cleared * 10 + this.player.combo * 5;
    this.player.combo += 1;
  }

  private commitClear(
    balls: SoloBall[],
    typeIds: string[],
    left: number,
    right: number,
  ): number {
    const effects = resolveClearEffects(typeIds, left, right);
    const removeSet = new Set(effects.remove);
    const vfx: { x: number; y: number; typeId: string }[] = [];
    for (const i of effects.remove) {
      const b = balls[i];
      if (!b) continue;
      pointAtPathInto(this.path, b.dist, this.clearPos);
      vfx.push({
        x: this.clearPos.x,
        y: this.clearPos.y,
        typeId: b.typeId,
      });
    }
    const removed = effects.remove.length;
    this.grantExp(removed);
    this.spawnExpOrbVfxBatch(vfx);
    this.player.chain = balls.filter((_, i) => !removeSet.has(i));
    this.mergeContacts(this.sortChainInPlace());

    if (effects.freeze) {
      this.player.freezeSec = Math.max(this.player.freezeSec, ICE_FREEZE_SEC);
    }
    return removed;
  }

  /** Local VFX orbs only (exp already granted). Capped for large clears. */
  private spawnExpOrbVfxBatch(
    items: { x: number; y: number; typeId: string }[],
  ): void {
    if (items.length === 0) return;
    const n = Math.min(items.length, EXP_ORB_VFX_CAP);
    for (let i = 0; i < n; i++) {
      const idx =
        items.length <= n
          ? i
          : n === 1
            ? 0
            : Math.floor((i * (items.length - 1)) / (n - 1));
      const it = items[idx]!;
      this.spawnExpOrbCredit(it.x, it.y, it.typeId);
    }
  }

  private spawnExpOrbCredit(x: number, y: number, typeId: string): void {
    const id = nid();
    this.expOrbs.push({
      id,
      ownerSessionId: this.sessionId,
      x,
      y,
      color: expParticleColor(typeId),
    });
    const dist = Math.hypot(this.cannon.x - x, this.cannon.y - y);
    const readyDelay = EXP_PARTICLE_WAIT_SEC;
    const flight = expParticleReadyDelaySec(dist) - EXP_PARTICLE_WAIT_SEC;
    this.expOrbMeta.set(id, {
      readyAt: this.simTime + readyDelay,
      expiresAt:
        this.simTime + readyDelay + Math.max(0, flight) + EXP_ORB_EXPIRE_SEC,
    });
  }

  private tickExpiredExpOrbs(): void {
    if (this.expOrbMeta.size === 0) return;
    const expired: string[] = [];
    for (const [id, meta] of this.expOrbMeta) {
      if (meta.expiresAt <= this.simTime) expired.push(id);
    }
    for (const id of expired) this.consumeExpOrb(id);
  }

  /** Despawn a VFX credit. Exp was already granted on clear. */
  private consumeExpOrb(orbId: string): boolean {
    if (!this.expOrbMeta.has(orbId)) return false;
    this.expOrbMeta.delete(orbId);
    this.expOrbs = this.expOrbs.filter((o) => o.id !== orbId);
    return true;
  }

  private grantExp(amount: number): void {
    if (amount <= 0) return;
    const p = this.player;
    p.exp += amount;
    while (p.exp >= expToNextLevel(p.level)) {
      p.exp -= expToNextLevel(p.level);
      p.level += 1;
      if (p.pendingOffer.length > 0) {
        p.offerDebt += 1;
      } else {
        this.offerLevelBalls();
      }
    }
  }

  private flushOfferDebt(): void {
    const p = this.player;
    if (p.pendingOffer.length > 0) return;
    if (p.offerDebt <= 0) return;
    p.offerDebt -= 1;
    this.offerLevelBalls();
  }

  private offerLevelBalls(): void {
    if (this.player.pendingOffer.length > 0) return;
    this.player.pendingOffer = rollLevelOffer(
      this.player.ballPool,
      () => Math.random(),
      3,
    );
  }
}
