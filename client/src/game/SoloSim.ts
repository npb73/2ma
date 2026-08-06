import {
  BALL_RADIUS,
  GAP_EPS,
  ICE_FREEZE_SEC,
  INITIAL_CHAIN,
  MAX_CHAIN,
  PATH_SPEED,
  PROJECTILE_SPEED,
  ROLLBACK_PAUSE_SEC,
  ROLLBACK_RAMP_SEC,
  ROLLBACK_SPEED,
  STONE_TYPE_ID,
  TICK_HZ,
  VOLUN_STONE_COUNT,
  buildPath,
  cannonSolidPool,
  expandMatchGroup,
  expToNextLevel,
  getSoloMap,
  initialBallPool,
  isBallTypeId,
  isStone,
  pickFromPool,
  pointAtPathInto,
  resolveClearEffects,
  rollLevelOffer,
  spawnStoneFuse,
  typesMatch,
  type GameMap,
  type PathGeom,
  type Point,
} from "@2ma/shared";

const DT = 1 / TICK_HZ;
const DIAMETER = BALL_RADIUS * 2;
const CONTACT = DIAMETER + GAP_EPS;

export interface SoloBall {
  id: string;
  typeId: string;
  dist: number;
  fuse: number;
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
  ballPool: string[];
  pendingOffer: string[];
  chain: SoloBall[];
}

export interface SoloSnapshot {
  phase: "playing" | "ended";
  players: SoloPlayer[];
  projectiles: SoloProjectile[];
  resolvedShotIds: string[];
  score: number;
}

interface FloatMotion {
  pause: number;
  rampT: number;
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
  resolvedShotIds: string[] = [];

  private spawnAcc = 0;
  private floatMotion = new Map<string, FloatMotion>();
  private readonly cannonPool = cannonSolidPool();

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
      ballPool: initialBallPool(),
      pendingOffer: [],
      chain: [],
    };
    this.reset();
  }

  reset(): void {
    this.player.ballPool = initialBallPool();
    this.player.pendingOffer = [];
    this.player.chain = [];
    for (let i = 0; i < INITIAL_CHAIN; i++) {
      const typeId = this.nextChainType();
      this.player.chain.push({
        id: nid(),
        typeId,
        dist: i * DIAMETER,
        fuse: spawnStoneFuse(typeId),
      });
    }
    this.player.currentType = this.nextCannonType();
    this.player.nextType = this.nextCannonType();
    this.player.combo = 0;
    this.player.level = 0;
    this.player.exp = 0;
    this.player.offerDebt = 0;
    this.player.freezeSec = 0;
    this.player.aim = 0;
    this.projectiles = [];
    this.resolvedShotIds = [];
    this.spawnAcc = 0;
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
  }

  pickBall(typeId: string): void {
    if (!isBallTypeId(typeId)) return;
    if (!this.player.pendingOffer.includes(typeId)) return;
    this.player.ballPool.push(typeId);
    this.player.pendingOffer = [];
    this.flushOfferDebt();
  }

  /** Cannon ammo: fixed solids only (purchases never affect the cannon). */
  private nextCannonType(): string {
    return pickFromPool(this.cannonPool, () => Math.random());
  }

  /** Chain spawn: weighted pick from the player's spawn pool. */
  private nextChainType(): string {
    const pool =
      this.player.ballPool.length > 0
        ? this.player.ballPool
        : initialBallPool();
    return pickFromPool(pool, () => Math.random());
  }

  tick(): void {
    if (this.phase !== "playing") return;
    this.advanceChain();
    this.tickStoneLifetimes();
    this.advanceProjectiles();

    if (this.player.chain.length === 0) return;
    const balls = this.sortChainInPlace();
    if (balls[balls.length - 1].dist >= this.path.total - 1) {
      this.phase = "ended";
    }
  }

  /** Stones expire after STONE_LIFETIME_SEC (independent of freeze). */
  private tickStoneLifetimes(): void {
    const balls = this.sortChainInPlace();
    let anyStone = false;
    for (const b of balls) {
      if (!isStone(b.typeId) || b.fuse < 0) continue;
      b.fuse -= DT;
      anyStone = true;
    }
    if (!anyStone) return;

    const surviving = balls.filter((b) => {
      if (!isStone(b.typeId)) return true;
      return b.fuse > 0;
    });
    if (surviving.length !== balls.length) {
      this.player.chain = surviving;
      this.mergeContacts(this.sortChainInPlace());
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
      const stepped = this.stepTrainPhysics(balls, path, PATH_SPEED);
      balls = stepped.balls;
      if (stepped.joinAt.length > 0) {
        this.resolveJoinMatches(stepped.joinAt);
        balls = this.sortChainInPlace();
      }
    }

    this.spawnAcc += PATH_SPEED * DT;
    while (this.spawnAcc >= DIAMETER && balls.length < MAX_CHAIN) {
      const back = balls[0];
      if (back && back.dist < DIAMETER) break;
      this.spawnAcc -= DIAMETER;
      const typeId = this.nextChainType();
      balls.unshift({
        id: nid(),
        typeId,
        dist: 0,
        fuse: spawnStoneFuse(typeId),
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

  private packFrom(balls: SoloBall[], from: number, to = balls.length - 1): void {
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

  /**
   * After floating segments collide, clear a color group only if the match
   * spans a join seam. Spawned same-color runs that were already contiguous
   * must stay until the player inserts a completing ball.
   */
  private resolveJoinMatches(joinAt: number[]): void {
    if (joinAt.length === 0) return;
    let seams = [...joinAt];
    let guard = 0;
    let clearedTotal = 0;
    while (guard++ < 8 && seams.length > 0) {
      const balls = this.sortChainInPlace();
      if (balls.length < 3) break;

      let clearedLeft = -1;
      let clearedRight = -1;
      for (const seam of seams) {
        if (seam <= 0 || seam >= balls.length) continue;
        if (balls[seam].dist - balls[seam - 1].dist > CONTACT) continue;
        if (!typesMatch(balls[seam - 1].typeId, balls[seam].typeId)) continue;

        const [left, right] = expandMatchGroup(
          balls.map((b) => b.typeId),
          balls.map((b) => b.dist),
          seam,
          CONTACT,
        );
        if (left >= seam || right < seam) continue;
        if (right - left + 1 < 3) continue;

        clearedLeft = left;
        clearedRight = right;
        break;
      }

      if (clearedLeft < 0) break;

      const typeIds = balls.map((b) => b.typeId);
      clearedTotal += this.commitClear(balls, typeIds, clearedLeft, clearedRight);
      break;
    }
    if (clearedTotal > 0) {
      this.player.combo += 1;
      this.grantExp(clearedTotal);
    }
  }

  private advanceProjectiles(): void {
    const survivors: SoloProjectile[] = [];
    const balls = this.sortChainInPlace();
    const hitPos = { x: 0, y: 0 };
    for (const proj of this.projectiles) {
      proj.x += proj.vx * DT;
      proj.y += proj.vy * DT;

      if (proj.x < -50 || proj.x > 1330 || proj.y < -50 || proj.y > 770) {
        this.markResolved(proj.id);
        continue;
      }

      let bestD = Infinity;
      let hitDist = 0;
      let hit = false;
      for (const ball of balls) {
        pointAtPathInto(this.path, ball.dist, hitPos);
        const d = Math.hypot(hitPos.x - proj.x, hitPos.y - proj.y);
        if (d <= BALL_RADIUS * 1.6 && d < bestD) {
          bestD = d;
          hitDist = ball.dist;
          hit = true;
        }
      }

      if (!hit) {
        survivors.push(proj);
        continue;
      }

      this.markResolved(proj.id);
      this.insertAndMatch(hitDist, proj.typeId);
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
      fuse: spawnStoneFuse(typeId),
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
    this.grantExp(cleared);
  }

  private commitClear(
    balls: SoloBall[],
    typeIds: string[],
    left: number,
    right: number,
  ): number {
    const effects = resolveClearEffects(typeIds, left, right);
    const removeSet = new Set(effects.remove);
    this.player.chain = balls.filter((_, i) => !removeSet.has(i));
    this.mergeContacts(this.sortChainInPlace());

    if (effects.freeze) {
      this.player.freezeSec = Math.max(this.player.freezeSec, ICE_FREEZE_SEC);
    }
    if (effects.volun) {
      this.spawnVolunStones();
    }
    return effects.remove.length;
  }

  /** Solo: no opponent — stones land on the player's own chain. */
  private spawnVolunStones(): void {
    let balls = this.sortChainInPlace();
    for (let i = 0; i < VOLUN_STONE_COUNT; i++) {
      if (balls.length >= MAX_CHAIN) break;
      for (const b of balls) b.dist += DIAMETER;
      balls.unshift({
        id: nid(),
        typeId: STONE_TYPE_ID,
        dist: 0,
        fuse: spawnStoneFuse(STONE_TYPE_ID),
      });
    }
    this.packFrom(balls, 0);
  }

  private grantExp(cleared: number): void {
    if (cleared <= 0) return;
    const p = this.player;
    p.exp += cleared;
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
