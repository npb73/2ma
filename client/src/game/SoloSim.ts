import {
  BALL_RADIUS,
  BOMB_BLAST_RADIUS,
  BOMB_FUSE_SEC,
  COLOR_COUNT,
  GAP_EPS,
  INITIAL_CHAIN,
  MAX_CHAIN,
  PATH_SPEED,
  PROJECTILE_SPEED,
  ROLLBACK_PAUSE_SEC,
  ROLLBACK_RAMP_SEC,
  ROLLBACK_SPEED,
  TICK_HZ,
  buildPath,
  createColorStream,
  expandMatchGroup,
  expToNextLevel,
  getBallType,
  getSoloMap,
  initialBallPool,
  isBallTypeId,
  pickFromPool,
  pointAtPath,
  randomSeed,
  rollLevelOffer,
  solidTypeId,
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
  private chainStream: () => number = () => 0;

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
      ballPool: initialBallPool(),
      pendingOffer: [],
      chain: [],
    };
    this.reset();
  }

  reset(): void {
    this.chainStream = createColorStream(randomSeed(), COLOR_COUNT);
    this.player.ballPool = initialBallPool();
    this.player.pendingOffer = [];
    this.player.chain = [];
    for (let i = 0; i < INITIAL_CHAIN; i++) {
      this.player.chain.push({
        id: nid(),
        typeId: this.nextChainType(),
        dist: i * DIAMETER,
        fuse: -1,
      });
    }
    this.player.currentType = this.pickPoolType();
    this.player.nextType = this.pickPoolType();
    this.player.combo = 0;
    this.player.level = 0;
    this.player.exp = 0;
    this.player.offerDebt = 0;
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
    p.nextType = this.pickPoolType();
  }

  pickBall(typeId: string): void {
    if (!isBallTypeId(typeId)) return;
    if (!this.player.pendingOffer.includes(typeId)) return;
    this.player.ballPool.push(typeId);
    this.player.pendingOffer = [];
    // Next shot must be the newly chosen ball.
    this.player.currentType = typeId;
    this.flushOfferDebt();
  }

  private pickPoolType(): string {
    return pickFromPool(this.player.ballPool, () => Math.random());
  }

  private nextChainType(): string {
    return solidTypeId(this.chainStream());
  }

  tick(): void {
    if (this.phase !== "playing") return;
    this.advanceChain();
    this.tickBombFuses();
    this.advanceProjectiles();

    if (this.player.chain.length === 0) return;
    const balls = this.sortedChain();
    if (balls[balls.length - 1].dist >= this.path.total - 1) {
      this.phase = "ended";
    }
  }

  private sortedChain(): SoloBall[] {
    return [...this.player.chain].sort((a, b) => a.dist - b.dist);
  }

  private advanceChain(): void {
    const path = this.path;
    let balls = this.sortedChain();

    if (balls.length > 0) {
      const stepped = this.stepTrainPhysics(balls, path, PATH_SPEED);
      balls = stepped.balls;
      this.player.chain = balls;
      if (stepped.joined) {
        this.resolveJoinMatches();
        balls = this.sortedChain();
      }
    }

    this.spawnAcc += PATH_SPEED * DT;
    while (this.spawnAcc >= DIAMETER && balls.length < MAX_CHAIN) {
      const back = balls[0];
      // Fixed entrance: only spawn when the rear has cleared the mouth.
      if (back && back.dist < DIAMETER) break;
      this.spawnAcc -= DIAMETER;
      balls = [
        {
          id: nid(),
          typeId: this.nextChainType(),
          dist: 0,
          fuse: -1,
        },
        ...balls,
      ];
      this.packFrom(balls, 0);
    }
    this.player.chain = balls;
  }

  private tickBombFuses(): void {
    let balls = this.sortedChain();
    for (const b of balls) {
      if (b.fuse < 0) continue;
      b.fuse -= DT;
    }
    this.player.chain = balls;

    let clearedTotal = 0;
    let guard = 0;
    while (guard++ < 8) {
      balls = this.sortedChain();
      const bombIdx = balls.findIndex(
        (b) =>
          getBallType(b.typeId)?.kind === "bomb" &&
          b.fuse <= 0 &&
          b.fuse > -1,
      );
      if (bombIdx < 0) break;
      const left = Math.max(0, bombIdx - BOMB_BLAST_RADIUS);
      const right = Math.min(balls.length - 1, bombIdx + BOMB_BLAST_RADIUS);
      clearedTotal += right - left + 1;
      this.player.chain = [
        ...balls.slice(0, left),
        ...balls.slice(right + 1),
      ];
      this.score += (right - left + 1) * 10;
    }

    if (clearedTotal > 0) {
      this.player.combo += 1;
      this.grantExp(clearedTotal);
    }
  }

  private stepTrainPhysics(
    balls: SoloBall[],
    path: PathGeom,
    pushSpeed: number,
  ): { balls: SoloBall[]; joined: boolean } {
    balls.sort((a, b) => a.dist - b.dist);
    const segments = this.segmentRanges(balls);
    if (segments.length === 0) return { balls, joined: false };

    const segsBefore = segments.length;
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

    balls = this.mergeContacts(balls);
    for (const b of balls) {
      if (b.dist < 0) b.dist = 0;
      if (b.dist > path.total) b.dist = path.total;
    }
    return { balls, joined: this.segmentRanges(balls).length < segsBefore };
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

  private resolveJoinMatches(): void {
    let guard = 0;
    let clearedTotal = 0;
    while (guard++ < 8) {
      const balls = this.sortedChain();
      if (balls.length < 3) break;
      let cleared = false;
      let i = 0;
      while (i < balls.length) {
        let j = i;
        while (
          j + 1 < balls.length &&
          typesMatch(balls[j].typeId, balls[j + 1].typeId) &&
          balls[j + 1].dist - balls[j].dist <= CONTACT
        ) {
          j++;
        }
        if (j - i + 1 >= 3) {
          clearedTotal += j - i + 1;
          this.player.chain = [...balls.slice(0, i), ...balls.slice(j + 1)];
          cleared = true;
          break;
        }
        i = j + 1;
      }
      if (!cleared) break;
      this.player.chain = this.mergeContacts(this.sortedChain());
    }
    if (clearedTotal > 0) {
      this.player.combo += 1;
      this.grantExp(clearedTotal);
    }
  }

  private advanceProjectiles(): void {
    const survivors: SoloProjectile[] = [];
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
      for (const ball of this.sortedChain()) {
        const pos = pointAtPath(this.path, ball.dist);
        const d = Math.hypot(pos.x - proj.x, pos.y - proj.y);
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
    const balls = this.sortedChain();
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

    // Only shift balls in the same contact segment — floating groups stay put.
    const segs = this.segmentRanges(balls);
    const hitSeg = segs.find(([s, e]) => hitIdx >= s && hitIdx <= e);
    const segEnd = hitSeg ? hitSeg[1] : hitIdx;

    const kind = getBallType(typeId)?.kind;
    const insert: SoloBall = {
      id: nid(),
      typeId,
      dist: balls[hitIdx].dist + DIAMETER * 0.5,
      fuse: kind === "bomb" ? BOMB_FUSE_SEC : -1,
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
    this.player.chain = balls;

    const chain = this.sortedChain();
    const insertIdx = chain.findIndex((b) => b.id === insert.id);
    if (insertIdx < 0) return;

    if (kind === "bomb") {
      this.player.chain = chain;
      return;
    }

    const [left, right] = expandMatchGroup(
      chain.map((b) => b.typeId),
      chain.map((b) => b.dist),
      insertIdx,
      CONTACT,
    );
    const groupSize = right - left + 1;
    if (groupSize < 3) {
      this.player.chain = chain;
      this.player.combo = 0;
      return;
    }

    const cleared = right - left + 1;
    this.player.chain = [
      ...chain.slice(0, left),
      ...chain.slice(right + 1),
    ];
    this.score += cleared * 10 + this.player.combo * 5;

    this.player.combo += 1;
    this.grantExp(groupSize);
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
