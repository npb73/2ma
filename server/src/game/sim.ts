import {
  BALL_RADIUS,
  CANNON_A,
  CANNON_B,
  CARDS,
  COLOR_COUNT,
  COMBO_PER_LEVEL,
  GAP_EPS,
  INITIAL_CHAIN,
  MAX_CHAIN,
  PATH_A,
  PATH_B,
  PATH_SPEED,
  PROJECTILE_SPEED,
  ROLLBACK_PAUSE_SEC,
  ROLLBACK_RAMP_SEC,
  ROLLBACK_SPEED,
  TICK_HZ,
  type CardId,
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
  /** Seconds left standing still before rollback. */
  pause: number;
  /** Seconds since rollback started (after pause). */
  rampT: number;
}

export class GameSim {
  readonly paths: [PathGeom, PathGeom];
  readonly cannons: [Point, Point];
  private spawnAcc = [0, 0];
  private ended = false;
  /** Floating-segment motion keyed by player → rear ball id of that segment. */
  private floatMotion = new Map<string, Map<string, FloatMotion>>();

  constructor(private state: RankedState) {
    this.paths = [buildPath(PATH_A), buildPath(PATH_B)];
    this.cannons = [CANNON_A, CANNON_B];
  }

  get isEnded(): boolean {
    return this.ended;
  }

  seatOf(sessionId: string): number {
    const p = this.state.players.get(sessionId);
    return p?.seat ?? 0;
  }

  opponentSession(sessionId: string): string | null {
    for (const [id] of this.state.players) {
      if (id !== sessionId) return id;
    }
    return null;
  }

  initChains(): void {
    for (const [, player] of this.state.players) {
      player.chain.clear();
      for (let i = 0; i < INITIAL_CHAIN; i++) {
        const ball = new BallState();
        ball.id = nanoid(8);
        ball.color = Math.floor(Math.random() * COLOR_COUNT);
        ball.dist = i * DIAMETER;
        player.chain.push(ball);
      }
      player.currentColor = Math.floor(Math.random() * COLOR_COUNT);
      player.nextColor = Math.floor(Math.random() * COLOR_COUNT);
      player.combo = 0;
      player.level = 0;
      player.pendingCard = "";
      player.usedCards = new ArraySchema<string>();
      player.wildShotsLeft = 0;
      player.explodeNeighbors = false;
      player.speedMult = 1;
      player.speedMultUntil = 0;
      player.aim = player.seat === 0 ? 0 : Math.PI;
      player.targetMode = 0;
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

  setTarget(sessionId: string, mode: number): void {
    const p = this.state.players.get(sessionId);
    if (!p || this.state.phase !== "playing") return;
    p.targetMode = mode === 1 ? 1 : 0;
  }

  fire(sessionId: string, clientShotId?: string): void {
    const p = this.state.players.get(sessionId);
    if (!p || this.state.phase !== "playing" || this.ended) return;
    if (p.pendingCard) return;

    const cannon = this.cannons[p.seat];
    const proj = new ProjectileState();
    // Prefer client id so predicted local visuals can despawn on resolve
    // even when the projectile never appears in a network patch.
    proj.id = sanitizeShotId(clientShotId) ?? nanoid(8);
    proj.ownerSessionId = sessionId;
    proj.color = p.currentColor;
    proj.x = cannon.x;
    proj.y = cannon.y;
    proj.vx = Math.cos(p.aim) * PROJECTILE_SPEED;
    proj.vy = Math.sin(p.aim) * PROJECTILE_SPEED;
    proj.targetMode = p.targetMode;
    proj.wild = p.wildShotsLeft > 0;
    this.state.projectiles.push(proj);

    p.currentColor = p.nextColor;
    p.nextColor = Math.floor(Math.random() * COLOR_COUNT);
    if (p.wildShotsLeft > 0) p.wildShotsLeft -= 1;
  }

  pickCard(sessionId: string, cardId: string): void {
    const p = this.state.players.get(sessionId);
    if (!p || p.pendingCard !== cardId) return;
    if (p.usedCards.includes(cardId)) return;

    p.usedCards.push(cardId);
    p.pendingCard = "";

    if (cardId === "wild10") {
      p.wildShotsLeft = 10;
    } else if (cardId === "speedOpponent") {
      const oppId = this.opponentSession(sessionId);
      const opp = oppId ? this.state.players.get(oppId) : undefined;
      if (opp) {
        opp.speedMult = 1.5;
        opp.speedMultUntil = Date.now() + 10_000;
      }
    } else if (cardId === "explodeNeighbors") {
      p.explodeNeighbors = true;
    }
  }

  tick(): { loserSessionId?: string } {
    if (this.state.phase !== "playing" || this.ended) return {};

    const now = Date.now();
    for (const [, p] of this.state.players) {
      if (p.speedMultUntil && now >= p.speedMultUntil) {
        p.speedMult = 1;
        p.speedMultUntil = 0;
      }
    }

    this.advanceChains();
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

  /**
   * Classic Zuma train physics:
   * - Only the rear segment (pushed from spawn) advances toward the hole.
   * - Floating segments ahead roll back until they meet the train.
   * - On contact, segments join; matching colors at the seam can clear.
   */
  private advanceChains(): void {
    for (const [, p] of this.state.players) {
      const path = this.paths[p.seat];
      const speed = PATH_SPEED * p.speedMult;
      let balls = this.copyBalls(p);

      if (balls.length > 0) {
        balls = this.stepTrainPhysics(p, balls, path, speed);
        this.writeBalls(p, balls);

        // Join clears may cascade after rollback/push
        this.resolveJoinMatches(p, path);
        balls = this.copyBalls(p);
      }

      this.spawnAcc[p.seat] += speed * DT;
      while (
        this.spawnAcc[p.seat] >= DIAMETER &&
        balls.length < MAX_CHAIN
      ) {
        this.spawnAcc[p.seat] -= DIAMETER;
        const back = balls[0];
        const newBall = new BallState();
        newBall.id = nanoid(8);
        newBall.color = Math.floor(Math.random() * COLOR_COUNT);
        newBall.dist = back ? Math.max(0, back.dist - DIAMETER) : 0;
        balls = [newBall, ...balls];
        // Keep rear packed after spawn
        this.packFrom(balls, 0);
      }

      this.writeBalls(p, balls);
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
  ): BallState[] {
    balls.sort((a, b) => a.dist - b.dist);
    const segments = this.segmentRanges(balls);
    if (segments.length === 0) return balls;

    // 1) Push rear segment (connected to spawn)
    const [rearStart, rearEnd] = segments[0];
    for (let i = rearStart; i <= rearEnd; i++) {
      balls[i].dist += pushSpeed * DT;
    }
    this.packFrom(balls, rearStart, rearEnd);

    // 2) Floating segments: pause → ease-in rollback toward nearest ball behind
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
        // Ease-in: slow start, then approach full rollback speed
        const eased = u * u;
        rollbackSpeed = ROLLBACK_SPEED * eased;
      }

      if (rollbackSpeed > 0) {
        for (let i = start; i <= end; i++) {
          balls[i].dist -= rollbackSpeed * DT;
        }
      }

      // Don't pass through the previous segment (nearest balls behind)
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

    // 3) Merge segments that are now in contact
    balls = this.mergeContacts(balls);

    for (const b of balls) {
      if (b.dist < 0) b.dist = 0;
      if (b.dist > path.total) b.dist = path.total;
    }
    return balls;
  }

  /** Inclusive [start, end] ranges of contiguous ball groups. */
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

  /** Pack balls forward from `from` so each sits on the previous (contact). */
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
      const gap = balls[i].dist - balls[i - 1].dist;
      if (gap <= CONTACT) {
        balls[i].dist = balls[i - 1].dist + DIAMETER;
      }
    }
    return balls;
  }

  private resolveJoinMatches(player: PlayerState, path: PathGeom): void {
    // After physics, clear any run of 3+ same color (cascade from joins)
    let guard = 0;
    while (guard++ < 8) {
      const balls = this.copyBalls(player);
      if (balls.length < 3) return;
      let cleared = false;
      let i = 0;
      while (i < balls.length) {
        let j = i;
        while (
          j + 1 < balls.length &&
          balls[j + 1].color === balls[i].color &&
          balls[j + 1].dist - balls[j].dist <= CONTACT
        ) {
          j++;
        }
        if (j - i + 1 >= 3) {
          const next = [
            ...balls.slice(0, i),
            ...balls.slice(j + 1),
          ];
          this.writeBalls(player, next);
          cleared = true;
          break;
        }
        i = j + 1;
      }
      if (!cleared) return;
      // Pull train together after clear
      const after = this.mergeContacts(this.copyBalls(player));
      this.writeBalls(player, after);
      void path;
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

      const targetSeat =
        proj.targetMode === 1 ? 1 - owner.seat : owner.seat;
      let targetPlayer: PlayerState | undefined;
      for (const [, pl] of this.state.players) {
        if (pl.seat === targetSeat) {
          targetPlayer = pl;
          break;
        }
      }
      if (!targetPlayer) {
        survivors.push(proj);
        continue;
      }

      const path = this.paths[targetSeat];
      let hitIndex = -1;
      let hitDist = 0;
      let bestD = Infinity;
      const balls = this.copyBalls(targetPlayer);
      for (let i = 0; i < balls.length; i++) {
        const ball = balls[i];
        const pos = pointAt(path, ball.dist);
        const d = Math.hypot(pos.x - proj.x, pos.y - proj.y);
        if (d <= BALL_RADIUS * 1.6 && d < bestD) {
          bestD = d;
          hitIndex = i;
          hitDist = ball.dist;
        }
      }

      if (hitIndex < 0) {
        survivors.push(proj);
        continue;
      }

      this.markShotResolved(proj.id);
      this.insertAndMatch(
        owner,
        targetPlayer,
        path,
        hitDist,
        proj.color,
        owner.sessionId === targetPlayer.sessionId,
        proj.wild,
      );
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
    target: PlayerState,
    path: PathGeom,
    nearDist: number,
    color: number,
    isOwnChain: boolean,
    wildShot: boolean,
  ): void {
    const balls = this.copyBalls(target);

    // Find insert slot: after the ball we hit, shift everything ahead by DIAMETER
    let hitIdx = 0;
    let best = Infinity;
    for (let i = 0; i < balls.length; i++) {
      const d = Math.abs(balls[i].dist - nearDist);
      if (d < best) {
        best = d;
        hitIdx = i;
      }
    }

    const insert = new BallState();
    insert.id = nanoid(8);
    insert.color = color;
    // Place on the farther side of the hit ball (toward the hole)
    insert.dist = balls[hitIdx].dist + DIAMETER * 0.5;

    for (let i = hitIdx + 1; i < balls.length; i++) {
      balls[i].dist += DIAMETER;
    }
    balls.push(insert);
    balls.sort((a, b) => a.dist - b.dist);
    this.packFrom(balls, 0);
    this.writeBalls(target, balls);

    const idx = this.copyBalls(target).findIndex((b) => b.id === insert.id);
    if (idx < 0) return;

    const chain = this.copyBalls(target);
    const matchColor = color;
    const wild = isOwnChain && wildShot;
    const isMatchColor = (c: number) => wild || c === matchColor;

    let left = idx;
    let right = idx;
    while (left > 0 && isMatchColor(chain[left - 1].color)) left--;
    while (
      right < chain.length - 1 &&
      isMatchColor(chain[right + 1].color)
    ) {
      right++;
    }

    let removeLeft = left;
    let removeRight = right;
    const groupSize = right - left + 1;

    if (isOwnChain && shooter.explodeNeighbors) {
      if (groupSize >= 3) {
        removeLeft = Math.max(0, left - 1);
        removeRight = Math.min(chain.length - 1, right + 1);
      } else {
        removeLeft = Math.max(0, idx - 1);
        removeRight = Math.min(chain.length - 1, idx + 1);
      }
    }

    const shouldClear =
      groupSize >= 3 ||
      (isOwnChain && shooter.explodeNeighbors && groupSize >= 1);

    if (!shouldClear) {
      this.writeBalls(target, chain);
      if (isOwnChain) shooter.combo = 0;
      return;
    }

    const next = [
      ...chain.slice(0, removeLeft),
      ...chain.slice(removeRight + 1),
    ];
    this.writeBalls(target, next);
    // Leave the gap — train physics will close it next ticks

    if (isOwnChain) {
      shooter.combo += 1;
      const newLevel = Math.floor(shooter.combo / COMBO_PER_LEVEL);
      if (newLevel > shooter.level) {
        shooter.level = newLevel;
        this.offerCard(shooter);
      }
    }

    void path;
  }

  private offerCard(player: PlayerState): void {
    if (player.pendingCard) return;
    const available = CARDS.map((c) => c.id).filter(
      (id) => !player.usedCards.includes(id),
    ) as CardId[];
    if (available.length === 0) return;
    const pick = available[Math.floor(Math.random() * available.length)];
    player.pendingCard = pick;
  }
}

/** Client-provided shot ids: short, URL-safe, no control chars. */
function sanitizeShotId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  if (id.length < 1 || id.length > 32) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}
