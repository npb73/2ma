import {
  BALL_COLORS,
  BALL_RADIUS,
  CANNON_A,
  CANNON_B,
  CARDS,
  PATH_A,
  PATH_B,
  UI,
  type CardId,
  type Point,
} from "@2ma/shared";
import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import type { PlayMode } from "../ui/lobby";
import type { UserInfo } from "../auth";
import { DistInterpolator } from "./interpolation";
import { ProjectilePresenter } from "./projectiles";

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
const AIM_SEND_MS = 50;

interface StartOptions {
  token: string;
  user: UserInfo;
  mode: PlayMode;
  code?: string;
}

interface BallView {
  id: string;
  color: number;
  dist: number;
}

interface PlayerView {
  sessionId: string;
  displayName: string;
  rating: number;
  seat: number;
  aim: number;
  currentColor: number;
  nextColor: number;
  targetMode: number;
  combo: number;
  level: number;
  pendingCard: string;
  wildShotsLeft: number;
  explodeNeighbors: boolean;
  speedMult: number;
  chain: BallView[];
}

interface GameView {
  phase: string;
  roomCode: string;
  winnerId: string;
  loserId: string;
  ratingDelta: number;
  players: Map<string, PlayerView>;
  projectiles: {
    id: string;
    ownerSessionId: string;
    color: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }[];
  resolvedShotIds: string[];
}

const COLOR_CACHE = new Map<string, number>();

function hex(color: string): number {
  let value = COLOR_CACHE.get(color);
  if (value === undefined) {
    value = Phaser.Display.Color.HexStringToColor(color).color;
    COLOR_CACHE.set(color, value);
  }
  return value;
}

function pointAt(points: Point[], dist: number): Point {
  let remaining = dist;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return { ...points[points.length - 1] };
}

function asArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof (value as { forEach?: unknown }).forEach === "function") {
    const out: T[] = [];
    (value as { forEach: (cb: (item: T) => void) => void }).forEach((item) => {
      out.push(item);
    });
    return out;
  }
  if (typeof (value as { toJSON?: () => unknown }).toJSON === "function") {
    const json = (value as { toJSON: () => unknown }).toJSON();
    if (Array.isArray(json)) return json as T[];
  }
  try {
    return [...(value as Iterable<T>)];
  } catch {
    return [];
  }
}

function readState(room: Room): GameView {
  const s = room.state as {
    phase: string;
    roomCode: string;
    winnerId: string;
    loserId: string;
    ratingDelta: number;
    players: {
      forEach: (cb: (p: Record<string, unknown>, id: string) => void) => void;
    };
    projectiles: unknown;
    resolvedShotIds: unknown;
  };

  const players = new Map<string, PlayerView>();
  s.players.forEach((p, sessionId) => {
    const chainRaw = asArray<{ id: string; color: number; dist: number }>(p.chain);
    const chain: BallView[] = new Array(chainRaw.length);
    for (let i = 0; i < chainRaw.length; i++) {
      const b = chainRaw[i];
      chain[i] = { id: b.id, color: b.color, dist: b.dist };
    }
    players.set(sessionId, {
      sessionId,
      displayName: String(p.displayName ?? ""),
      rating: Number(p.rating ?? 0),
      seat: Number(p.seat ?? 0),
      aim: Number(p.aim ?? 0),
      currentColor: Number(p.currentColor ?? 0),
      nextColor: Number(p.nextColor ?? 0),
      targetMode: Number(p.targetMode ?? 0),
      combo: Number(p.combo ?? 0),
      level: Number(p.level ?? 0),
      pendingCard: String(p.pendingCard ?? ""),
      wildShotsLeft: Number(p.wildShotsLeft ?? 0),
      explodeNeighbors: Boolean(p.explodeNeighbors),
      speedMult: Number(p.speedMult ?? 1),
      chain,
    });
  });

  const projectilesRaw = asArray<Record<string, unknown>>(s.projectiles);
  const projectiles = new Array(projectilesRaw.length);
  for (let i = 0; i < projectilesRaw.length; i++) {
    const p = projectilesRaw[i];
    projectiles[i] = {
      id: String(p.id),
      ownerSessionId: String(p.ownerSessionId ?? ""),
      color: Number(p.color),
      x: Number(p.x),
      y: Number(p.y),
      vx: Number(p.vx),
      vy: Number(p.vy),
    };
  }

  return {
    phase: s.phase,
    roomCode: s.roomCode,
    winnerId: s.winnerId,
    loserId: s.loserId,
    ratingDelta: s.ratingDelta,
    players,
    projectiles,
    resolvedShotIds: asArray<string>(s.resolvedShotIds).map(String),
  };
}

async function cleanupMatch(
  room: Room | null,
  game: Phaser.Game | null,
): Promise<void> {
  try {
    if (room) await room.leave(true);
  } catch {
    // already left
  }
  if (game && game.isRunning) {
    game.destroy(true);
  }
}

export async function startGame(
  root: HTMLElement,
  opts: StartOptions,
): Promise<void> {
  root.innerHTML = "";
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:absolute; inset:0; z-index:20; pointer-events:none;
    color:${UI.text}; font-family:Segoe UI,system-ui,sans-serif;
  `;
  const hud = document.createElement("div");
  hud.style.cssText = `position:absolute; left:16px; top:12px; pointer-events:none;`;
  const cardPanel = document.createElement("div");
  cardPanel.style.cssText = `
    position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    display:none; pointer-events:auto; background:${UI.bgPanel}; padding:20px 24px;
    border:1px solid ${UI.secondaryDark}; border-radius:12px; min-width:280px;
  `;
  const resultPanel = document.createElement("div");
  resultPanel.style.cssText = `
    position:absolute; left:50%; top:40%; transform:translate(-50%,-50%);
    display:none; pointer-events:auto; text-align:center; background:${UI.bgPanel};
    padding:28px 36px; border-radius:12px; border:1px solid ${UI.secondaryDark};
    z-index:30;
  `;
  overlay.append(hud, cardPanel, resultPanel);

  // Letterbox shell: host fills the window; stage stays 16:9 and is centered
  // (pillarbox on tall/narrow screens, letterbox on wide ones). HUD overlay
  // lives on the stage so it stays glued to the playfield.
  const host = document.createElement("div");
  host.style.cssText = `
    width:100%;height:100%;position:relative;overflow:hidden;
    display:flex;align-items:center;justify-content:center;
    background:${UI.bg};
  `;
  const stage = document.createElement("div");
  stage.style.cssText = `
    position:relative;
    width:min(100vw, calc(100vh * 16 / 9));
    height:min(100vh, calc(100vw * 9 / 16));
    background:${UI.bg};
  `;
  const canvasMount = document.createElement("div");
  canvasMount.style.cssText =
    "width:100%;height:100%;position:absolute;inset:0;z-index:1;";
  stage.append(canvasMount, overlay);
  host.append(stage);
  root.append(host);

  const client = new Client(WS_URL);
  let room: Room;

  if (opts.mode === "create") {
    const res = await fetch("/match/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: opts.token }),
    });
    if (!res.ok) throw new Error("Не удалось создать комнату");
    const data = (await res.json()) as { roomId: string; roomCode: string };
    room = await client.joinById(data.roomId, {
      token: opts.token,
      isPrivate: true,
    });
  } else if (opts.mode === "join") {
    if (!opts.code) throw new Error("Введите код");
    const res = await fetch("/match/join-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: opts.code }),
    });
    if (!res.ok) throw new Error("Комната не найдена");
    const data = (await res.json()) as { roomId: string };
    room = await client.joinById(data.roomId, {
      token: opts.token,
      isPrivate: true,
    });
  } else {
    room = await client.joinOrCreate("ranked", {
      token: opts.token,
      isPrivate: false,
    });
  }

  let lastPending = "";
  let lastHudKey = "";
  let resultShownFor = "";
  let lastAimSent = 0;
  let localAim: number | null = null;
  let leaving = false;
  let game: Phaser.Game | null = null;
  const distInterp = new DistInterpolator();
  const projectiles = new ProjectilePresenter();
  let lastFrameMs = performance.now();

  const returnToLobby = async (): Promise<void> => {
    if (leaving) return;
    leaving = true;
    await cleanupMatch(room, game);
    location.reload();
  };

  const aimFromPointer = (pointer: Phaser.Input.Pointer): number | null => {
    const me = room.state.players.get(room.sessionId) as
      | { seat?: number }
      | undefined;
    if (!me) return null;
    const cannon = Number(me.seat) === 0 ? CANNON_A : CANNON_B;
    return Math.atan2(pointer.worldY - cannon.y, pointer.worldX - cannon.x);
  };

  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: canvasMount,
    backgroundColor: UI.bg,
    banner: false,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: {
      create(this: Phaser.Scene) {
        this.add
          .rectangle(640, 360, 1280, 720, hex(UI.bg))
          .setDepth(-2);

        drawPath(this, PATH_A);
        drawPath(this, PATH_B);

        this.add.circle(
          PATH_A[PATH_A.length - 1].x,
          PATH_A[PATH_A.length - 1].y,
          18,
          hex(UI.hole),
        );
        this.add.circle(
          PATH_B[PATH_B.length - 1].x,
          PATH_B[PATH_B.length - 1].y,
          18,
          hex(UI.hole),
        );

        const ballGfx = this.add.graphics().setDepth(2);
        const projGfx = this.add.graphics().setDepth(3);
        const cannonGfx = this.add.graphics().setDepth(4);

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (leaving || room.state.phase !== "playing") return;
          const angle = aimFromPointer(pointer);
          if (angle === null) return;
          // Draw immediately; server still owns authoritative aim for shots.
          localAim = angle;
          const now = performance.now();
          if (now - lastAimSent < AIM_SEND_MS) return;
          lastAimSent = now;
          room.send("aim", { angle });
        });

        this.input.on("pointerdown", () => {
          if (leaving || room.state.phase !== "playing") return;
          const me = readState(room).players.get(room.sessionId);
          if (!me || me.pendingCard) return;
          const aim = localAim ?? me.aim;
          // Flush aim so server shot matches the barrel the player sees.
          room.send("aim", { angle: aim });
          lastAimSent = performance.now();
          // Visual flight is 100% client-side; server still resolves the hit.
          const shotId = projectiles.spawnLocal({
            ownerSessionId: room.sessionId,
            seat: me.seat,
            aim,
            color: me.currentColor,
          });
          room.send("fire", { shotId });
        });

        this.input.keyboard?.on("keydown-TAB", (e: KeyboardEvent) => {
          e.preventDefault();
          if (leaving || room.state.phase !== "playing") return;
          const me = readState(room).players.get(room.sessionId);
          if (!me) return;
          room.send("setTarget", { mode: me.targetMode === 0 ? 1 : 0 });
        });

        this.events.on("update", () => {
          if (leaving) return;
          const now = performance.now();
          const dtMs = Math.min(100, now - lastFrameMs);
          lastFrameMs = now;

          const view = readState(room);

          const samples = [];
          for (const p of view.players.values()) {
            for (const b of p.chain) {
              samples.push({
                id: b.id,
                color: b.color,
                dist: b.dist,
                seat: p.seat,
              });
            }
          }
          distInterp.sync(samples);
          distInterp.step(dtMs);

          const ballPositions: Point[] = [];
          distInterp.forEach((_id, seat, color, dist) => {
            void color;
            const path = seat === 0 ? PATH_A : PATH_B;
            ballPositions.push(pointAt(path, dist));
          });

          projectiles.syncServer(
            view.projectiles,
            room.sessionId,
            view.resolvedShotIds,
          );
          projectiles.step(dtMs / 1000, ballPositions);

          renderHud(hud, view, room.sessionId, lastHudKey, (key) => {
            lastHudKey = key;
          });
          renderCards(cardPanel, view, room, lastPending, (id) => {
            lastPending = id;
          });
          renderResult(
            resultPanel,
            view,
            room.sessionId,
            resultShownFor,
            (key) => {
              resultShownFor = key;
            },
            returnToLobby,
          );

          ballGfx.clear();
          projGfx.clear();
          cannonGfx.clear();

          distInterp.forEach((_id, seat, color, dist) => {
            const path = seat === 0 ? PATH_A : PATH_B;
            const pos = pointAt(path, dist);
            ballGfx.fillStyle(hex(BALL_COLORS[color] ?? BALL_COLORS[0]), 1);
            ballGfx.fillCircle(pos.x, pos.y, BALL_RADIUS);
          });

          for (const p of view.players.values()) {
            const cannon = p.seat === 0 ? CANNON_A : CANNON_B;
            const isMe = p.sessionId === room.sessionId;
            const aim =
              isMe && localAim !== null
                ? localAim
                : p.aim;

            cannonGfx.fillStyle(hex(UI.cannon), 1);
            cannonGfx.fillCircle(cannon.x, cannon.y, 22);
            cannonGfx.lineStyle(
              4,
              hex(BALL_COLORS[p.currentColor] ?? BALL_COLORS[0]),
              1,
            );
            cannonGfx.lineBetween(
              cannon.x,
              cannon.y,
              cannon.x + Math.cos(aim) * 40,
              cannon.y + Math.sin(aim) * 40,
            );
            cannonGfx.fillStyle(
              hex(BALL_COLORS[p.nextColor] ?? BALL_COLORS[0]),
              1,
            );
            cannonGfx.fillCircle(cannon.x - 28, cannon.y + 28, 10);
          }

          projectiles.forEach((color, x, y) => {
            projGfx.fillStyle(hex(BALL_COLORS[color] ?? BALL_COLORS[0]), 1);
            projGfx.fillCircle(x, y, BALL_RADIUS - 2);
          });
        });
      },
    },
  });

  room.onLeave(() => {
    if (!leaving && game?.isRunning) {
      game.destroy(true);
    }
  });
}

function drawPath(scene: Phaser.Scene, points: Point[]): void {
  const g = scene.add.graphics().setDepth(0);
  g.lineStyle(10, hex(UI.path), 1);
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.strokePath();
}

function renderHud(
  hud: HTMLElement,
  view: GameView,
  myId: string,
  lastKey: string,
  setKey: (key: string) => void,
): void {
  const me = view.players.get(myId);
  let oppName = "ожидание…";
  let oppRating: string | number = "—";
  for (const p of view.players.values()) {
    if (p.sessionId !== myId) {
      oppName = p.displayName;
      oppRating = p.rating;
      break;
    }
  }
  const target = me?.targetMode === 1 ? "чужая цепочка" : "своя цепочка";
  const key = [
    view.phase,
    view.roomCode,
    me?.rating,
    me?.combo,
    me?.level,
    me?.targetMode,
    me?.wildShotsLeft,
    me?.explodeNeighbors ? 1 : 0,
    oppName,
    oppRating,
  ].join("|");
  if (key === lastKey) return;
  setKey(key);

  hud.innerHTML = `
    <div style="font-size:14px;line-height:1.5;background:rgba(4,21,40,.72);padding:10px 14px;border-radius:8px;display:inline-block">
      <div>Код комнаты: <b style="color:${UI.accentHot}">${view.roomCode || "—"}</b> · ${view.phase}</div>
      <div>Вы: ${me?.displayName ?? "—"} ★${me?.rating ?? "—"} · комбо ${me?.combo ?? 0} · ур. ${me?.level ?? 0}</div>
      <div>Соперник: ${oppName} ★${oppRating}</div>
      <div style="color:${UI.secondary}">Цель: ${target} (Tab) · ЛКМ выстрел</div>
      <div style="color:${UI.secondary}">Эффекты: wild ${me?.wildShotsLeft ?? 0} · взрыв ${me?.explodeNeighbors ? "on" : "off"}</div>
    </div>
  `;
}

function renderCards(
  panel: HTMLElement,
  view: GameView,
  room: Room,
  lastPending: string,
  setLast: (id: string) => void,
): void {
  const me = view.players.get(room.sessionId);
  const pending = me?.pendingCard ?? "";
  if (!pending) {
    if (panel.style.display !== "none") panel.style.display = "none";
    if (lastPending) setLast("");
    return;
  }
  if (pending === lastPending && panel.style.display === "block") return;
  setLast(pending);
  const def = CARDS.find((c) => c.id === pending);
  panel.style.display = "block";
  panel.innerHTML = `
    <div style="color:${UI.accentHot};font-size:13px;margin-bottom:6px">Новый уровень</div>
    <div style="font-size:20px;margin-bottom:8px">${def?.title ?? pending}</div>
    <div style="color:${UI.textMuted};font-size:14px;margin-bottom:16px">${def?.description ?? ""}</div>
    <button type="button" id="pick-card" style="padding:10px 16px;border:none;border-radius:8px;background:${UI.accent};color:${UI.bg};font-weight:700;cursor:pointer">Взять карту</button>
  `;
  panel.querySelector("#pick-card")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    room.send("pickCard", { cardId: pending as CardId });
    panel.style.display = "none";
  });
}

function renderResult(
  panel: HTMLElement,
  view: GameView,
  myId: string,
  shownFor: string,
  setShownFor: (key: string) => void,
  onBack: () => void,
): void {
  if (view.phase !== "ended") {
    if (panel.style.display !== "none") panel.style.display = "none";
    if (shownFor) setShownFor("");
    return;
  }

  const key = `${view.winnerId}:${view.loserId}:${view.ratingDelta}`;
  if (key === shownFor && panel.style.display === "block") return;
  setShownFor(key);

  const won = view.winnerId === myId;
  panel.style.display = "block";
  panel.innerHTML = `
    <div style="font-size:28px;color:${won ? UI.accentHot : UI.accent};margin-bottom:8px">${won ? "Победа" : "Поражение"}</div>
    <div style="font-size:18px;margin-bottom:16px">${won ? "+" : "−"}${view.ratingDelta} рейтинга</div>
    <button type="button" id="back-lobby" style="padding:10px 16px;border:none;border-radius:8px;background:${UI.secondaryDark};color:${UI.text};cursor:pointer">В лобби</button>
  `;
  panel.querySelector("#back-lobby")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onBack();
  });
}
