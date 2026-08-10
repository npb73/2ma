/**
 * Smoke: volun push, spawnAcc cap, path-based infinite spawn, clear→grantExp.
 *
 * Run (after `npm run build -w server`): node server/scripts/smoke-volun.mjs
 */
import {
  BALL_RADIUS,
  EXP_ORB_VFX_CAP,
  STONE_TYPE_ID,
  VOLUN_STONE_COUNT,
  chainCapacityForPath,
} from "@2ma/shared";
import { GameSim } from "../dist/game/sim.js";
import { BallState, PlayerState, RankedState } from "../dist/rooms/schema.js";

const DIAMETER = BALL_RADIUS * 2;

function addPlayer(state, sessionId, seat) {
  const p = new PlayerState();
  p.sessionId = sessionId;
  p.userId = sessionId;
  p.displayName = sessionId;
  p.seat = seat;
  p.ready = true;
  state.players.set(sessionId, p);
  return p;
}

function chainTypeIds(p) {
  const out = [];
  for (let i = 0; i < p.chain.length; i++) {
    const b = p.chain.at(i);
    if (b) out.push(b.typeId);
  }
  return out;
}

function makeBall(typeId, dist) {
  const b = new BallState();
  b.id = `t${Math.random().toString(36).slice(2, 10)}`;
  b.typeId = typeId;
  b.dist = dist;
  b.fuse = -1;
  return b;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const state = new RankedState();
state.phase = "playing";
const a = addPlayer(state, "playerA", 0);
const b = addPlayer(state, "playerB", 1);

const sim = new GameSim(state);
sim.initChains();

const beforeA = a.chain.length;
const beforeB = b.chain.length;
const cap0 = chainCapacityForPath(sim.paths[0].total);
assert(cap0 > 55, `ranked path cap should exceed old MAX_CHAIN=55, got ${cap0}`);

// Private method — smoke only.
sim.spawnVolunStones(a);

const types = chainTypeIds(b);
const stonePrefix = types.slice(0, VOLUN_STONE_COUNT);
assert(
  stonePrefix.length === VOLUN_STONE_COUNT,
  `expected ${VOLUN_STONE_COUNT} leading stones, got ${stonePrefix.length}`,
);
assert(
  stonePrefix.every((t) => t === STONE_TYPE_ID),
  `leading balls must be stones, got ${stonePrefix.join(",")}`,
);
assert(
  b.chain.length === beforeB + VOLUN_STONE_COUNT ||
    b.chain.length === cap0,
  `opponent chain length ${b.chain.length} after volun (was ${beforeB})`,
);
assert(
  a.chain.length === beforeA,
  "source chain length must be unchanged",
);

// spawnAcc cap: invent huge debt, wipe chain, advance once — at most one new ball.
sim.spawnAcc[0] = DIAMETER * 100;
a.chain.clear();
sim.advanceChains();
assert(
  a.chain.length <= 1,
  `spawnAcc cap failed: expected ≤1 ball after empty wipe, got ${a.chain.length}`,
);

// Past the old 55 limit: with mouth free, spawn must still add balls.
a.chain.clear();
const packed = [];
for (let i = 0; i < 60; i++) {
  packed.push(makeBall("solid_0", DIAMETER + i * DIAMETER));
}
// Replace schema array explicitly (clear+push can be flaky on ArraySchema).
const next = new (a.chain.constructor)();
for (const ball of packed) next.push(ball);
a.chain = next;
assert(a.chain.length === 60, `setup expected 60 balls, got ${a.chain.length}`);
sim.spawnAcc[0] = DIAMETER;
const lenBefore = a.chain.length;
sim.advanceChains();
assert(
  a.chain.length === lenBefore + 1,
  `spawn must continue past 55 when mouth is free (was ${lenBefore}, now ${a.chain.length})`,
);

assert(
  EXP_ORB_VFX_CAP === 12,
  `EXP_ORB_VFX_CAP expected 12, got ${EXP_ORB_VFX_CAP}`,
);

// commitClear: grant exp immediately, cap VFX orbs, push volun stones.
b.chain.clear();
for (let i = 0; i < 3; i++) {
  b.chain.push(makeBall("solid_0", i * DIAMETER));
}
const balls = [];
for (let i = 0; i < 20; i++) {
  const typeId = i === 10 ? "volun_0" : "solid_0";
  balls.push(makeBall(typeId, i * DIAMETER));
}
a.chain.clear();
for (const ball of balls) a.chain.push(ball);
a.exp = 0;
a.level = 0;
state.expOrbs.clear();

const typeIds = balls.map((x) => x.typeId);
const removed = sim.commitClear(a, balls, typeIds, 9, 11);
assert(removed >= 3, `expected clear of at least 3, got ${removed}`);
assert(a.exp === removed, `exp should equal removed (${removed}), got ${a.exp}`);
assert(
  state.expOrbs.length <= EXP_ORB_VFX_CAP,
  `VFX orbs ${state.expOrbs.length} exceed cap ${EXP_ORB_VFX_CAP}`,
);
const bTypes = chainTypeIds(b);
assert(
  bTypes.slice(0, VOLUN_STONE_COUNT).every((t) => t === STONE_TYPE_ID),
  `commitClear volun must push stones onto B, got ${bTypes.slice(0, 5).join(",")}`,
);

console.log("smoke-volun: ok");
