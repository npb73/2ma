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
  createColorStream,
  expandMatchGroup,
  expToNextLevel,
  getBallType,
  getRankedMap,
  initialBallPool,
  isBallTypeId,
  mapCannon,
  mapPath,
  pickFromPool,
  randomSeed,
  rollLevelOffer,
  solidTypeId,
  typesMatch,
  type GameMap,
  type Point,
} from "@2ma/shared";
import { ArraySchema } from "@colyseus/schema";
import { nanoid } from "nanoid";
import {
  BallState,
  PlayerState,
  ProjectileState,
  RankedState,
} from "../rooms/schema.js";
import { buildPath, pointAt, type PathGeom } from "./path.js";

const DT = 1 / TICK_HZ;
const DIAMETER = BALL_RADIUS * 2;
const CONTACT = DIAMETER + GAP_EPS;

interface FloatMotion {
  pause: number;
  rampT: number;
}

function poolOf(p: PlayerState): string[] {
  const out: string[] = [];
  for (let i = 0; i < p.ballPool.length; i++) {
    const id = p.ballPool.at(i);
    if (id) out.push(id);
  }
  return out.length > 0 ? out : initialBallPool();
}

function setPool(p: PlayerState, ids: string[]): void {
  const next = new ArraySchema<string>();
  for (const id of ids) next.push(id);
  p.ballPool = next;
}

function setOffer(p: PlayerState, ids: string[]): void {
  const next = new ArraySchema<string>();
  for (const id of ids) next.push(id);
  p.pendingOffer = next;
}

function offerOf(p: PlayerState): string[] {
  const out: string[] = [];
  for (let i = 0; i < p.pendingOffer.length; i++) {
    const id = p.pendingOffer.at(i);
    if (id) out.push(id);
  }
  return out;
}

export class GameSim {
  readonly map: GameMap;
  readonly paths: [PathGeom, PathGeom];
  readonly cannons: [Point, Point];
  private spawnAcc = [0, 0];
  private ended = false;
  private floatMotion = new Map<string, Map<string, FloatMotion>>();
  /** Per-seat solid-color stream for chain spawn (shared seed → same order). */
  private chainStreams: [() => number, () => number] = [() => 0, () => 0];

  constructor(private state: RankedState, map: GameMap = getRankedMap()) {
    this.map = map;
    this.paths = [buildPath(mapPath(map, 0)), buildPath(mapPath(map, 1))];
    this.cannons = [
      { ...mapCannon(map, 0) },
      { ...mapCannon(map, 1) },
    ];
  }

  get isEnded(): boolean {
    return this.ended;
  }

  opponentSession(sessionId: string): string | null {
    for (const [id] of this.state.players) {
      if (id !== sessionId) return id;
    }
    return null;
  }

  /** Chain spawn: only base solids from the match seed — never the player pool. */
  private nextChainType(seat: number): string {
    const stream = this.chainStreams[seat === 1 ? 1 : 0];
    return solidTypeId(stream());
  }

  /** Cannon ammo: weighted pick from the player's upgrade pool. */
  private nextTypeFromPool(player: PlayerState): string {
    return pickFromPool(poolOf(player), () => Math.random());
  }

  private makeBall(typeId: string, dist: number, fuse = -1): BallState {
    const ball = new BallState();
    ball.id = nanoid(8);
    ball.typeId = typeId;
    ball.dist = dist;
    ball.fuse = fuse;
    return ball;
  }

  initChains(): void {
    const seed = randomSeed();
    this.state.ballSeed = seed;
    this.chainStreams = [
      createColorStream(seed, COLOR_COUNT),
      createColorStream(seed, COLOR_COUNT),
    ];

    for (const [, player] of this.state.players) {
      const startPool = initialBallPool();
      setPool(player, startPool);
      setOffer(player, []);

      player.chain.clear();
      for (let i = 0; i < INITIAL_CHAIN; i++) {
        player.chain.push(
          this.makeBall(this.nextChainType(player.seat), i * DIAMETER),
        );
      }
      player.currentType = this.nextTypeFromPool(player);
      player.nextType = this.nextTypeFromPool(player);
      player.combo = 0;
      player.level = 0;
      player.exp = 0;
      player.offerDebt = 0;
      player.aim = player.seat === 0 ? 0 : Math.PI;
    }
    this.state.projectiles.clear();
    this.state.resolvedShotIds.clear();
    this.spawnAcc = [0, 0];
    this.ended = false;
    this.floatMotion.clear();
  }

  setAim(sessionId: string, angle: number): void {
    const p = this.state.players.get(sessionId);
    if (!p || this.state.phase !== "playing") return;
    p.aim = angle;
  }

  fire(sessionId: string, clientShotId?: string): void {
    const p = this.state.players.get(sessionId);
    if (!p || this.state.phase !== "playing" || this.ended) return;
    if (offerOf(p).length > 0) return;

    const cannon = this.cannons[p.seat];
    const proj = new ProjectileState();
    proj.id = sanitizeShotId(clientShotId) ?? nanoid(8);
    proj.ownerSessionId = sessionId;
    proj.typeId = p.currentType;
    proj.x = cannon.x;
    proj.y = cannon.y;
    proj.vx = Math.cos(p.aim) * PROJECTILE_SPEED;
    proj.vy = Math.sin(p.aim) * PROJECTILE_SPEED;
    this.state.projectiles.push(proj);

    p.currentType = p.nextType;
    p.nextType = this.nextTypeFromPool(p);
  }

  pickBall(sessionId: string, typeId: string): void {
    const p = this.state.players.get(sessionId);
    if (!p || this.state.phase !== "playing") return;
    if (!isBallTypeId(typeId)) return;
    const offer = offerOf(p);
    if (!offer.includes(typeId)) return;

    const pool = poolOf(p);
    pool.push(typeId);
    setPool(p, pool);
    setOffer(p, []);
    // Next shot must be the newly chosen ball.
    p.currentType = typeId;
    this.flushOfferDebt(p);
  }

  tick(): { loserSessionId?: string } {
    if (this.state.phase !== "playing" || this.ended) return {};

    this.advanceChains();
    this.tickBombFuses();
    this.advanceProjectiles();

    for (const [, p] of this.state.players) {
      if (p.chain.length === 0) continue;
      const balls = this.copyBalls(p);
      const front = balls[balls.length - 1];
      const path = this.paths[p.seat];
      if (front.dist >= path.total - 1) {
        this.ended = true;
        return { loserSessionId: p.sessionId };
      }
    }
    return {};
  }

  private advanceChains(): void {
    for (const [, p] of this.state.players) {
      const path = this.paths[p.seat];
      const speed = PATH_SPEED;
      let balls = this.copyBalls(p);

      if (balls.length > 0) {
        const stepped = this.stepTrainPhysics(p, balls, path, speed);
        balls = stepped.balls;
        this.writeBalls(p, balls);

        if (stepped.joined) {
          this.resolveJoinMatches(p);
          balls = this.copyBalls(p);
        }
      }

      this.spawnAcc[p.seat] += speed * DT;
      while (
        this.spawnAcc[p.seat] >= DIAMETER &&
        balls.length < MAX_CHAIN
      ) {
        const back = balls[0];
        // Fixed entrance: only spawn when the rear has cleared the mouth.
        if (back && back.dist < DIAMETER) break;
        this.spawnAcc[p.seat] -= DIAMETER;
        const newBall = this.makeBall(
          this.nextChainType(p.seat),
          0,
        );
        balls = [newBall, ...balls];
        this.packFrom(balls, 0);
      }

      this.writeBalls(p, balls);
    }
  }

  private tickBombFuses(): void {
    for (const [, p] of this.state.players) {
      let balls = this.copyBalls(p);
      for (const b of balls) {
        if (b.fuse < 0) continue;
        b.fuse -= DT;
      }
      this.writeBalls(p, balls);

      let clearedTotal = 0;
      let guard = 0;
      while (guard++ < 8) {
        balls = this.copyBalls(p);
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
        this.writeBalls(p, [
          ...balls.slice(0, left),
          ...balls.slice(right + 1),
        ]);
      }

      if (clearedTotal > 0) {
        p.combo += 1;
        this.grantExp(p, clearedTotal);
      }
    }
  }

  private floatMapFor(sessionId: string): Map<string, FloatMotion> {
    let map = this.floatMotion.get(sessionId);
    if (!map) {
      map = new Map();
      this.floatMotion.set(sessionId, map);
    }
    return map;
  }

  private stepTrainPhysics(
    player: PlayerState,
    balls: BallState[],
    path: PathGeom,
    pushSpeed: number,
  ): { balls: BallState[]; joined: boolean } {
    balls.sort((a, b) => a.dist - b.dist);
    const segments = this.segmentRanges(balls);
    if (segments.length === 0) return { balls, joined: false };

    const segsBefore = segments.length;
    const [rearStart, rearEnd] = segments[0];
    for (let i = rearStart; i <= rearEnd; i++) {
      balls[i].dist += pushSpeed * DT;
    }
    this.packFrom(balls, rearStart, rearEnd);

    const floatMap = this.floatMapFor(player.sessionId);
    const liveKeys = new Set<string>();

    for (let s = 1; s < segments.length; s++) {
      const [start, end] = segments[s];
      const key = balls[start].id;
      liveKeys.add(key);

      let motion = floatMap.get(key);
      if (!motion) {
        motion = { pause: ROLLBACK_PAUSE_SEC, rampT: 0 };
        floatMap.set(key, motion);
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

    for (const key of [...floatMap.keys()]) {
      if (!liveKeys.has(key)) floatMap.delete(key);
    }

    balls = this.mergeContacts(balls);
    for (const b of balls) {
      if (b.dist < 0) b.dist = 0;
      if (b.dist > path.total) b.dist = path.total;
    }

    const joined = this.segmentRanges(balls).length < segsBefore;
    return { balls, joined };
  }

  private segmentRanges(balls: BallState[]): Array<[number, number]> {
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
    balls: BallState[],
    from: number,
    to: number = balls.length - 1,
  ): void {
    for (let i = from + 1; i <= to; i++) {
      const minDist = balls[i - 1].dist + DIAMETER;
      if (balls[i].dist < minDist) balls[i].dist = minDist;
    }
  }

  private mergeContacts(balls: BallState[]): BallState[] {
    balls.sort((a, b) => a.dist - b.dist);
    for (let i = 1; i < balls.length; i++) {
      if (balls[i].dist - balls[i - 1].dist <= CONTACT) {
        balls[i].dist = balls[i - 1].dist + DIAMETER;
      }
    }
    return balls;
  }

  private resolveJoinMatches(player: PlayerState): void {
    let guard = 0;
    let clearedTotal = 0;
    while (guard++ < 8) {
      const balls = this.copyBalls(player);
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
          this.writeBalls(player, [
            ...balls.slice(0, i),
            ...balls.slice(j + 1),
          ]);
          cleared = true;
          break;
        }
        i = j + 1;
      }
      if (!cleared) break;
      this.writeBalls(player, this.mergeContacts(this.copyBalls(player)));
    }
    if (clearedTotal > 0) {
      player.combo += 1;
      this.grantExp(player, clearedTotal);
    }
  }

  private copyBalls(p: PlayerState): BallState[] {
    const balls: BallState[] = [];
    const seen = new Set<BallState>();
    for (let i = 0; i < p.chain.length; i++) {
      const b = p.chain.at(i);
      if (!b || seen.has(b)) continue;
      seen.add(b);
      balls.push(b);
    }
    balls.sort((a, b) => a.dist - b.dist);
    return balls;
  }

  private writeBalls(p: PlayerState, balls: BallState[]): void {
    const next = new ArraySchema<BallState>();
    for (const b of balls) next.push(b);
    p.chain = next;
  }

  private advanceProjectiles(): void {
    const survivors = new ArraySchema<ProjectileState>();
    for (const proj of this.state.projectiles) {
      proj.x += proj.vx * DT;
      proj.y += proj.vy * DT;

      if (proj.x < -50 || proj.x > 1330 || proj.y < -50 || proj.y > 770) {
        this.markShotResolved(proj.id);
        continue;
      }

      const owner = this.state.players.get(proj.ownerSessionId);
      if (!owner) {
        this.markShotResolved(proj.id);
        continue;
      }

      const path = this.paths[owner.seat];
      let hitDist = 0;
      let bestD = Infinity;
      let hit = false;
      const balls = this.copyBalls(owner);
      for (const ball of balls) {
        const pos = pointAt(path, ball.dist);
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

      this.markShotResolved(proj.id);
      this.insertAndMatch(owner, hitDist, proj.typeId);
    }
    this.state.projectiles = survivors;
  }

  private markShotResolved(shotId: string): void {
    this.state.resolvedShotIds.push(shotId);
    while (this.state.resolvedShotIds.length > 24) {
      this.state.resolvedShotIds.shift();
    }
  }

  private insertAndMatch(
    shooter: PlayerState,
    nearDist: number,
    typeId: string,
  ): void {
    const balls = this.copyBalls(shooter);
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
    const insert = this.makeBall(
      typeId,
      balls[hitIdx].dist + DIAMETER * 0.5,
      kind === "bomb" ? BOMB_FUSE_SEC : -1,
    );

    for (let i = hitIdx + 1; i <= segEnd; i++) {
      balls[i].dist += DIAMETER;
    }
    balls.push(insert);
    balls.sort((a, b) => a.dist - b.dist);

    const idx = balls.findIndex((b) => b.id === insert.id);
    if (idx < 0) return;

    // Pack only within the segment that received the shot.
    const segsAfter = this.segmentRanges(balls);
    const packSeg = segsAfter.find(([s, e]) => idx >= s && idx <= e);
    if (packSeg) this.packFrom(balls, packSeg[0], packSeg[1]);
    this.writeBalls(shooter, balls);

    const chain = this.copyBalls(shooter);
    const insertIdx = chain.findIndex((b) => b.id === insert.id);
    if (insertIdx < 0) return;

    // Bomb: lit on insert, no immediate color clear.
    if (kind === "bomb") {
      this.writeBalls(shooter, chain);
      return;
    }

    const typeIds = chain.map((b) => b.typeId);
    const dists = chain.map((b) => b.dist);
    const [left, right] = expandMatchGroup(typeIds, dists, insertIdx, CONTACT);
    const groupSize = right - left + 1;

    if (groupSize < 3) {
      this.writeBalls(shooter, chain);
      shooter.combo = 0;
      return;
    }

    this.writeBalls(shooter, [
      ...chain.slice(0, left),
      ...chain.slice(right + 1),
    ]);

    shooter.combo += 1;
    this.grantExp(shooter, groupSize);
  }

  private grantExp(player: PlayerState, cleared: number): void {
    if (cleared <= 0) return;
    player.exp += cleared;
    while (player.exp >= expToNextLevel(player.level)) {
      player.exp -= expToNextLevel(player.level);
      player.level += 1;
      if (offerOf(player).length > 0) {
        player.offerDebt += 1;
      } else {
        this.offerLevelBalls(player);
      }
    }
  }

  private flushOfferDebt(player: PlayerState): void {
    if (offerOf(player).length > 0) return;
    if (player.offerDebt <= 0) return;
    player.offerDebt -= 1;
    this.offerLevelBalls(player);
  }

  private offerLevelBalls(player: PlayerState): void {
    if (offerOf(player).length > 0) return;
    const offer = rollLevelOffer(poolOf(player), () => Math.random(), 3);
    setOffer(player, offer);
  }
}

function sanitizeShotId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  if (id.length < 1 || id.length > 32) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}
