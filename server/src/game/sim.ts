import {
  BALL_RADIUS,
  EXP_ORB_EXPIRE_SEC,
  EXP_PARTICLE_WAIT_SEC,
  GAP_EPS,
  ICE_FREEZE_SEC,
  INITIAL_CHAIN,
  MAX_CHAIN,
  PATH_SPEED,
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_SPEED,
  ROLLBACK_PAUSE_SEC,
  ROLLBACK_RAMP_SEC,
  ROLLBACK_SPEED,
  STONE_TYPE_ID,
  TICK_HZ,
  VOLUN_STONE_COUNT,
  cannonSolidPool,
  expParticleColor,
  expParticleReadyDelaySec,
  expandMatchGroup,
  expToNextLevel,
  firstProjectileHit,
  getRankedMap,
  initialBallPool,
  isBallTypeId,
  isStone,
  mapCannon,
  mapPath,
  pickFromPool,
  resolveClearEffects,
  rollLevelOffer,
  spawnStoneFuse,
  typesMatch,
  type GameMap,
  type Point,
  type ProjectileHitTarget,
} from "@2ma/shared";
import { ArraySchema } from "@colyseus/schema";
import { nanoid } from "nanoid";
import {
  BallState,
  ExpOrbCredit,
  PlayerState,
  ProjectileState,
  RankedState,
} from "../rooms/schema.js";
import { buildPath, pointAt, pointAtPathInto, type PathGeom } from "./path.js";

const DT = 1 / TICK_HZ;
const DIAMETER = BALL_RADIUS * 2;
const CONTACT = DIAMETER + GAP_EPS;

interface FloatMotion {
  pause: number;
  rampT: number;
}

/** Server-only timing for collect validation / expire (not synced). */
interface ExpOrbMeta {
  ownerSessionId: string;
  readyAt: number;
  expiresAt: number;
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
  private simTime = 0;
  private expOrbMeta = new Map<string, ExpOrbMeta>();
  private floatMotion = new Map<string, Map<string, FloatMotion>>();
  private readonly cannonPool = cannonSolidPool();
  /** Reused hit targets per seat for projectile sweeps (avoid per-proj alloc). */
  private readonly projTargets: [ProjectileHitTarget[], ProjectileHitTarget[]] = [
    [],
    [],
  ];
  private readonly projTargetPools: [
    ProjectileHitTarget[],
    ProjectileHitTarget[],
  ] = [[], []];
  private readonly pathSample = { x: 0, y: 0 };

  constructor(
    private state: RankedState,
    map: GameMap = getRankedMap(),
  ) {
    this.map = map;
    this.paths = [buildPath(mapPath(map, 0)), buildPath(mapPath(map, 1))];
    this.cannons = [{ ...mapCannon(map, 0) }, { ...mapCannon(map, 1) }];
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

  /** Chain spawn: weighted pick from the player's spawn pool. */
  private nextChainType(player: PlayerState): string {
    return pickFromPool(poolOf(player), () => Math.random());
  }

  /** Cannon ammo: fixed solids only (purchases never affect the cannon). */
  private nextCannonType(): string {
    return pickFromPool(this.cannonPool, () => Math.random());
  }

  private makeBall(typeId: string, dist: number): BallState {
    const ball = new BallState();
    ball.id = nanoid(8);
    ball.typeId = typeId;
    ball.dist = dist;
    ball.fuse = spawnStoneFuse(typeId);
    return ball;
  }

  initChains(): void {
    for (const [, player] of this.state.players) {
      const startPool = initialBallPool();
      setPool(player, startPool);
      setOffer(player, []);

      player.chain.clear();
      for (let i = 0; i < INITIAL_CHAIN; i++) {
        player.chain.push(
          this.makeBall(this.nextChainType(player), i * DIAMETER),
        );
      }
      player.currentType = this.nextCannonType();
      player.nextType = this.nextCannonType();
      player.combo = 0;
      player.level = 0;
      player.exp = 0;
      player.offerDebt = 0;
      player.freezeSec = 0;
      player.aim = player.seat === 0 ? 0 : Math.PI;
    }
    this.state.projectiles.clear();
    this.state.expOrbs.clear();
    this.state.resolvedShotIds.clear();
    this.spawnAcc = [0, 0];
    this.ended = false;
    this.simTime = 0;
    this.expOrbMeta.clear();
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
    p.nextType = this.nextCannonType();
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
    this.flushOfferDebt(p);
  }

  /**
   * Client claims an exp orb by id. Returns true if granted.
   * Rejects unknown / foreign / not-yet-ready ids.
   */
  collectExp(sessionId: string, orbId: string): boolean {
    if (this.state.phase !== "playing" || this.ended) return false;
    const id = sanitizeShotId(orbId);
    if (!id) return false;
    const meta = this.expOrbMeta.get(id);
    if (!meta || meta.ownerSessionId !== sessionId) return false;
    if (meta.readyAt > this.simTime) return false;
    return this.consumeExpOrb(id);
  }

  tick(): { loserSessionId?: string } {
    if (this.state.phase !== "playing" || this.ended) return {};

    this.simTime += DT;
    this.advanceChains();
    this.tickStoneLifetimes();
    this.advanceProjectiles();
    this.tickExpiredExpOrbs();

    for (const [, p] of this.state.players) {
      if (p.chain.length === 0) continue;
      let frontDist = -Infinity;
      for (let i = 0; i < p.chain.length; i++) {
        const b = p.chain.at(i);
        if (b && b.dist > frontDist) frontDist = b.dist;
      }
      const path = this.paths[p.seat];
      if (frontDist >= path.total - 1) {
        this.ended = true;
        return { loserSessionId: p.sessionId };
      }
    }
    return {};
  }

  /** Stones expire after STONE_LIFETIME_SEC (independent of freeze). */
  private tickStoneLifetimes(): void {
    for (const [, p] of this.state.players) {
      const balls = this.copyBalls(p);
      let anyStone = false;
      for (const b of balls) {
        if (!isStone(b.typeId) || b.fuse < 0) continue;
        b.fuse -= DT;
        anyStone = true;
      }
      if (!anyStone) continue;

      const surviving = balls.filter((b) => {
        if (!isStone(b.typeId)) return true;
        return b.fuse > 0;
      });
      if (surviving.length !== balls.length) {
        const expired = balls.filter(
          (b) => isStone(b.typeId) && b.fuse <= 0,
        );
        const path = this.paths[p.seat];
        for (const b of expired) {
          const pos = pointAt(path, b.dist);
          this.spawnExpOrbCredit(p, pos.x, pos.y, b.typeId);
        }
        this.writeBalls(p, surviving);
        this.mergeContacts(this.copyBalls(p));
      }
    }
  }

  private advanceChains(): void {
    for (const [, p] of this.state.players) {
      if (p.freezeSec > 0) {
        p.freezeSec = Math.max(0, p.freezeSec - DT);
        continue;
      }

      const path = this.paths[p.seat];
      const speed = PATH_SPEED;
      let balls = this.copyBalls(p);

      if (balls.length > 0) {
        // Mutates BallState.dist in place — no ArraySchema rewrite.
        const stepped = this.stepTrainPhysics(p, balls, path, speed);
        balls = stepped.balls;

        if (stepped.joinAt.length > 0) {
          this.resolveJoinMatches(p, stepped.joinAt);
          balls = this.copyBalls(p);
        }
      }

      this.spawnAcc[p.seat] += speed * DT;
      while (this.spawnAcc[p.seat] >= DIAMETER && balls.length < MAX_CHAIN) {
        const back = balls[0];
        // Fixed entrance: only spawn when the rear has cleared the mouth.
        if (back && back.dist < DIAMETER) break;
        this.spawnAcc[p.seat] -= DIAMETER;
        const newBall = this.makeBall(this.nextChainType(p), 0);
        p.chain.unshift(newBall);
        balls = this.copyBalls(p);
        this.packFrom(balls, 0);
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
  ): { balls: BallState[]; joinAt: number[] } {
    balls.sort((a, b) => a.dist - b.dist);
    const segments = this.segmentRanges(balls);
    if (segments.length === 0) return { balls, joinAt: [] };

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

  /**
   * After floating segments collide, clear a color group only if the match
   * spans a join seam. Spawned same-color runs that were already contiguous
   * must stay until the player inserts a completing ball.
   */
  private resolveJoinMatches(player: PlayerState, joinAt: number[]): void {
    if (joinAt.length === 0) return;
    let seams = [...joinAt];
    let guard = 0;
    let clearedTotal = 0;
    while (guard++ < 8 && seams.length > 0) {
      const balls = this.copyBalls(player);
      if (balls.length < 3) break;

      let clearedLeft = -1;
      let clearedRight = -1;
      for (const seam of seams) {
        if (seam <= 0 || seam >= balls.length) continue;
        if (balls[seam].dist - balls[seam - 1].dist > CONTACT) continue;
        if (!typesMatch(balls[seam - 1].typeId, balls[seam].typeId)) continue;

        const typeIds = balls.map((b) => b.typeId);
        const dists = balls.map((b) => b.dist);
        const [left, right] = expandMatchGroup(typeIds, dists, seam, CONTACT);
        if (left >= seam || right < seam) continue;
        if (right - left + 1 < 3) continue;

        clearedLeft = left;
        clearedRight = right;
        break;
      }

      if (clearedLeft < 0) break;

      const typeIds = balls.map((b) => b.typeId);
      clearedTotal += this.commitClear(
        player,
        balls,
        typeIds,
        clearedLeft,
        clearedRight,
      );
      // Specials can wipe non-contiguous ranges — stop after one wave.
      break;
    }
    if (clearedTotal > 0) {
      player.combo += 1;
    }
  }

  /** Sorted view of chain refs (same BallState instances as in the schema). */
  private copyBalls(p: PlayerState): BallState[] {
    const balls: BallState[] = [];
    for (let i = 0; i < p.chain.length; i++) {
      const b = p.chain.at(i);
      if (b) balls.push(b);
    }
    balls.sort((a, b) => a.dist - b.dist);
    return balls;
  }

  /** Rebuild chain ArraySchema — only for insert/remove/reorder structural changes. */
  private writeBalls(p: PlayerState, balls: BallState[]): void {
    const next = new ArraySchema<BallState>();
    for (const b of balls) next.push(b);
    p.chain = next;
  }

  /** Build swept-hit targets for a seat (once per tick via caller flag). */
  private rebuildProjTargets(owner: PlayerState): ProjectileHitTarget[] {
    const seat = owner.seat === 0 ? 0 : 1;
    const path = this.paths[seat];
    const balls = this.copyBalls(owner);
    const targets = this.projTargets[seat];
    const pool = this.projTargetPools[seat];
    targets.length = 0;
    const sample = this.pathSample;
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      pointAtPathInto(path, ball.dist, sample);
      let t = pool[i];
      if (!t) {
        t = { x: 0, y: 0, dist: 0 };
        pool[i] = t;
      }
      t.x = sample.x;
      t.y = sample.y;
      t.dist = ball.dist;
      targets.push(t);
    }
    return targets;
  }

  private advanceProjectiles(): void {
    const margin = 80;
    const minX = -margin;
    const maxX = this.map.width + margin;
    const minY = -margin;
    const maxY = this.map.height + margin;

    const built: [boolean, boolean] = [false, false];
    const removeAt: number[] = [];
    const hits: { owner: PlayerState; dist: number; typeId: string }[] = [];

    const projs = this.state.projectiles;
    for (let i = 0; i < projs.length; i++) {
      const proj = projs.at(i);
      if (!proj) continue;

      const owner = this.state.players.get(proj.ownerSessionId);
      if (!owner) {
        this.markShotResolved(proj.id);
        removeAt.push(i);
        continue;
      }

      const seat = owner.seat === 0 ? 0 : 1;
      if (!built[seat]) {
        this.rebuildProjTargets(owner);
        built[seat] = true;
      }
      const targets = this.projTargets[seat];

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
        this.markShotResolved(proj.id);
        hits.push({ owner, dist: hit.dist, typeId: proj.typeId });
        removeAt.push(i);
        continue;
      }

      proj.x = x1;
      proj.y = y1;

      if (proj.x < minX || proj.x > maxX || proj.y < minY || proj.y > maxY) {
        this.markShotResolved(proj.id);
        removeAt.push(i);
      }
    }

    for (let i = removeAt.length - 1; i >= 0; i--) {
      projs.splice(removeAt[i], 1);
    }

    for (const h of hits) {
      this.insertAndMatch(h.owner, h.dist, h.typeId);
    }
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

    const segs = this.segmentRanges(balls);
    const hitSeg = segs.find(([s, e]) => hitIdx >= s && hitIdx <= e);
    const segEnd = hitSeg ? hitSeg[1] : hitIdx;

    const insert = this.makeBall(typeId, balls[hitIdx].dist + DIAMETER * 0.5);

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
    this.writeBalls(shooter, balls);

    const chain = this.copyBalls(shooter);
    const insertIdx = chain.findIndex((b) => b.id === insert.id);
    if (insertIdx < 0) return;

    const typeIds = chain.map((b) => b.typeId);
    const dists = chain.map((b) => b.dist);
    const [left, right] = expandMatchGroup(typeIds, dists, insertIdx, CONTACT);
    const groupSize = right - left + 1;

    if (groupSize < 3) {
      shooter.combo = 0;
      return;
    }

    this.commitClear(shooter, chain, typeIds, left, right);
    shooter.combo += 1;
  }

  /** Apply special clear effects and remove balls. Returns count removed. */
  private commitClear(
    player: PlayerState,
    balls: BallState[],
    typeIds: string[],
    left: number,
    right: number,
  ): number {
    const effects = resolveClearEffects(typeIds, left, right);
    const removeSet = new Set(effects.remove);
    const path = this.paths[player.seat];
    for (const i of effects.remove) {
      const b = balls[i];
      if (!b) continue;
      const pos = pointAt(path, b.dist);
      this.spawnExpOrbCredit(player, pos.x, pos.y, b.typeId);
    }
    const kept = balls.filter((_, i) => !removeSet.has(i));
    this.writeBalls(player, kept);
    this.mergeContacts(this.copyBalls(player));

    if (effects.freeze) {
      player.freezeSec = Math.max(player.freezeSec, ICE_FREEZE_SEC);
    }
    if (effects.volun) {
      this.spawnVolunStones(player);
    }
    return effects.remove.length;
  }

  /** One authoritative credit per destroyed ball (synced id for client collect). */
  private spawnExpOrbCredit(
    owner: PlayerState,
    x: number,
    y: number,
    typeId: string,
  ): void {
    const id = nanoid(8);
    const credit = new ExpOrbCredit();
    credit.id = id;
    credit.ownerSessionId = owner.sessionId;
    credit.x = x;
    credit.y = y;
    credit.color = expParticleColor(typeId);
    this.state.expOrbs.push(credit);

    const cannon = this.cannons[owner.seat];
    const dist = Math.hypot(cannon.x - x, cannon.y - y);
    // Block instant cheat-collect during scatter wait; flight is client-side only.
    const readyDelay = EXP_PARTICLE_WAIT_SEC;
    const flight = expParticleReadyDelaySec(dist) - EXP_PARTICLE_WAIT_SEC;
    this.expOrbMeta.set(id, {
      ownerSessionId: owner.sessionId,
      readyAt: this.simTime + readyDelay,
      expiresAt: this.simTime + readyDelay + Math.max(0, flight) + EXP_ORB_EXPIRE_SEC,
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

  private consumeExpOrb(orbId: string): boolean {
    const meta = this.expOrbMeta.get(orbId);
    if (!meta) return false;
    this.expOrbMeta.delete(orbId);

    const orbs = this.state.expOrbs;
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs.at(i);
      if (orb && orb.id === orbId) {
        orbs.splice(i, 1);
        break;
      }
    }

    const owner = this.state.players.get(meta.ownerSessionId);
    if (owner) this.grantExp(owner, 1);
    return true;
  }

  /** Push stones onto the opponent's chain mouth (ranked). */
  private spawnVolunStones(source: PlayerState): void {
    let target: PlayerState | null = null;
    for (const [, p] of this.state.players) {
      if (p.sessionId !== source.sessionId) {
        target = p;
        break;
      }
    }
    if (!target) return;

    let balls = this.copyBalls(target);
    for (let i = 0; i < VOLUN_STONE_COUNT; i++) {
      if (balls.length >= MAX_CHAIN) break;
      for (const b of balls) b.dist += DIAMETER;
      balls.unshift(this.makeBall(STONE_TYPE_ID, 0));
    }
    this.packFrom(balls, 0);
    this.writeBalls(target, balls);
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
