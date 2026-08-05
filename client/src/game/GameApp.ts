import {
  BALL_RADIUS,
  UI,
  ballDisplayColors,
  expToNextLevel,
  getRankedMap,
  mapCannon,
  mapPath,
  type Point,
} from "@2ma/shared";
import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import type { PlayMode } from "../ui/lobby";
import type { UserInfo } from "../auth";
import { mountExpBar, mountLevelUpUi } from "../ui/levelUp";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  getResolutionPreset,
  getWorldZoom,
} from "../settings";
import { DistInterpolator } from "./interpolation";
import { ProjectilePresenter } from "./projectiles";
import {
  BallPainter,
  preloadBallTextures,
  prepareBallTextures,
} from "./drawBall";
import {
  CannonRecoil,
  MUZZLE_BALL_R,
  NEXT_BALL_R,
  drawCannonBody,
} from "./cannonView";
import { addMapBackground, drawMapHole, drawMapPath } from "./mapView";

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
const AIM_SEND_MS = 50;

interface StartOptions {
  token: string;
  user: UserInfo;
  mode: Exclude<PlayMode, "solo">;
  code?: string;
}

interface BallView {
  id: string;
  typeId: string;
  fuse: number;
  dist: number;
}

interface PlayerView {
  sessionId: string;
  displayName: string;
  rating: number;
  seat: number;
  aim: number;
  currentType: string;
  nextType: string;
  combo: number;
  level: number;
  exp: number;
  ballPool: string[];
  pendingOffer: string[];
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
    typeId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }[];
  resolvedShotIds: string[];
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
    const chainRaw = asArray<{
      id: string;
      typeId: string;
      fuse: number;
      dist: number;
    }>(p.chain);
    const chain: BallView[] = chainRaw.map((b) => ({
      id: b.id,
      typeId: String(b.typeId ?? "solid_0"),
      fuse: Number(b.fuse ?? -1),
      dist: b.dist,
    }));
    players.set(sessionId, {
      sessionId,
      displayName: String(p.displayName ?? ""),
      rating: Number(p.rating ?? 0),
      seat: Number(p.seat ?? 0),
      aim: Number(p.aim ?? 0),
      currentType: String(p.currentType ?? "solid_0"),
      nextType: String(p.nextType ?? "solid_1"),
      combo: Number(p.combo ?? 0),
      level: Number(p.level ?? 0),
      exp: Number(p.exp ?? 0),
      ballPool: asArray<string>(p.ballPool).map(String),
      pendingOffer: asArray<string>(p.pendingOffer).map(String),
      chain,
    });
  });

  const projectilesRaw = asArray<Record<string, unknown>>(s.projectiles);
  const projectiles = projectilesRaw.map((p) => ({
    id: String(p.id),
    ownerSessionId: String(p.ownerSessionId ?? ""),
    typeId: String(p.typeId ?? "solid_0"),
    x: Number(p.x),
    y: Number(p.y),
    vx: Number(p.vx),
    vy: Number(p.vy),
  }));

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
  const levelPanel = document.createElement("div");
  levelPanel.style.cssText = `
    position:absolute; inset:0; display:none; pointer-events:none;
    align-items:center; justify-content:center; z-index:25;
    background:rgba(3,7,16,.55);
  `;
  const resultPanel = document.createElement("div");
  resultPanel.style.cssText = `
    position:absolute; left:50%; top:40%; transform:translate(-50%,-50%);
    display:none; pointer-events:auto; text-align:center; background:${UI.bgPanel};
    padding:28px 36px; border-radius:12px; border:1px solid ${UI.secondaryDark};
    z-index:30;
  `;
  overlay.append(hud, levelPanel, resultPanel);

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

  const expBar = mountExpBar(stage);

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

  let lastOfferKey = "";
  let disposeLevelUi: (() => void) | null = null;
  let lastHudKey = "";
  let resultShownFor = "";
  let lastAimSent = 0;
  let localAim: number | null = null;
  let leaving = false;
  let game: Phaser.Game | null = null;
  const distInterp = new DistInterpolator();
  const projectiles = new ProjectilePresenter();
  const cannonRecoil = new CannonRecoil();
  const recoiledShots = new Set<string>();
  let lastFrameMs = performance.now();
  const map = getRankedMap();
  const pathA = mapPath(map, 0);
  const pathB = mapPath(map, 1);
  const cannonA = mapCannon(map, 0);
  const cannonB = mapCannon(map, 1);

  const returnToLobby = async (): Promise<void> => {
    if (leaving) return;
    leaving = true;
    disposeLevelUi?.();
    await cleanupMatch(room, game);
    location.reload();
  };

  const aimFromPointer = (pointer: Phaser.Input.Pointer): number | null => {
    const me = room.state.players.get(room.sessionId) as
      | { seat?: number }
      | undefined;
    if (!me) return null;
    const cannon = Number(me.seat) === 0 ? cannonA : cannonB;
    return Math.atan2(pointer.worldY - cannon.y, pointer.worldX - cannon.x);
  };

  const renderPreset = getResolutionPreset();
  const worldZoom = getWorldZoom(renderPreset.id);

  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: renderPreset.width,
    height: renderPreset.height,
    parent: canvasMount,
    backgroundColor: UI.bg,
    banner: false,
    audio: { noAudio: true },
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: {
      preload(this: Phaser.Scene) {
        preloadBallTextures(this);
      },
      create(this: Phaser.Scene) {
        this.cameras.main.setZoom(worldZoom);
        this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

        prepareBallTextures(this);
        addMapBackground(this, map);
        drawMapPath(this, pathA);
        drawMapPath(this, pathB);
        drawMapHole(this, pathA);
        drawMapHole(this, pathB);

        const balls = new BallPainter(this, 2);
        const projs = new BallPainter(this, 3);
        const cannonBalls = new BallPainter(this, 4);
        const cannonGfx = this.add.graphics().setDepth(4);

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (leaving || room.state.phase !== "playing") return;
          const angle = aimFromPointer(pointer);
          if (angle === null) return;
          localAim = angle;
          const now = performance.now();
          if (now - lastAimSent < AIM_SEND_MS) return;
          lastAimSent = now;
          room.send("aim", { angle });
        });

        this.input.on("pointerdown", () => {
          if (leaving || room.state.phase !== "playing") return;
          const me = readState(room).players.get(room.sessionId);
          if (!me || me.pendingOffer.length > 0) return;
          const aim = localAim ?? me.aim;
          room.send("aim", { angle: aim });
          lastAimSent = performance.now();
          const cannon = me.seat === 0 ? cannonA : cannonB;
          const shotId = projectiles.spawnLocal({
            ownerSessionId: room.sessionId,
            aim,
            typeId: me.currentType,
            cannon,
          });
          room.send("fire", { shotId });
          cannonRecoil.kick(room.sessionId);
          recoiledShots.add(shotId);
        });

        this.events.on("update", () => {
          if (leaving) return;
          const now = performance.now();
          const dtMs = Math.min(100, now - lastFrameMs);
          lastFrameMs = now;

          const view = readState(room);
          const me = view.players.get(room.sessionId);

          const samples = [];
          for (const p of view.players.values()) {
            for (const b of p.chain) {
              samples.push({
                id: b.id,
                typeId: b.typeId,
                fuse: b.fuse,
                dist: b.dist,
                seat: p.seat,
              });
            }
          }
          distInterp.sync(samples);
          distInterp.step(dtMs);

          const ballsByOwner = new Map<string, Point[]>();
          for (const p of view.players.values()) {
            ballsByOwner.set(p.sessionId, []);
          }
          distInterp.forEach((_id, seat, _typeId, dist) => {
            const path = seat === 0 ? pathA : pathB;
            for (const p of view.players.values()) {
              if (p.seat !== seat) continue;
              ballsByOwner.get(p.sessionId)?.push(pointAt(path, dist));
              break;
            }
          });

          projectiles.syncServer(
            view.projectiles,
            room.sessionId,
            view.resolvedShotIds,
          );
          for (const sp of view.projectiles) {
            if (recoiledShots.has(sp.id)) continue;
            recoiledShots.add(sp.id);
            if (sp.ownerSessionId !== room.sessionId) {
              cannonRecoil.kick(sp.ownerSessionId);
            }
          }
          if (recoiledShots.size > 64) {
            const live = new Set(view.projectiles.map((p) => p.id));
            for (const id of recoiledShots) {
              if (!live.has(id)) recoiledShots.delete(id);
            }
          }
          projectiles.step(dtMs / 1000, ballsByOwner);

          renderHud(hud, view, room.sessionId, lastHudKey, (key) => {
            lastHudKey = key;
          });

          const offerKey = me
            ? `${me.pendingOffer.join(",")}|${me.ballPool.join(",")}`
            : "";
          if (me && me.pendingOffer.length > 0) {
            if (offerKey !== lastOfferKey) {
              lastOfferKey = offerKey;
              disposeLevelUi?.();
              levelPanel.style.display = "flex";
              disposeLevelUi = mountLevelUpUi(levelPanel, {
                pool: me.ballPool,
                offer: me.pendingOffer,
                onPick: (typeId) => {
                  room.send("pickBall", { typeId });
                  disposeLevelUi?.();
                  disposeLevelUi = null;
                  lastOfferKey = "";
                  levelPanel.style.display = "none";
                },
              });
            }
          } else if (lastOfferKey) {
            disposeLevelUi?.();
            disposeLevelUi = null;
            lastOfferKey = "";
            levelPanel.style.display = "none";
          }

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

          if (me) {
            const cannon = me.seat === 0 ? cannonA : cannonB;
            expBar.update({
              level: me.level,
              exp: me.exp,
              need: expToNextLevel(me.level),
              cannonX: cannon.x,
              cannonY: cannon.y,
              stageW: stage.clientWidth,
              stageH: stage.clientHeight,
            });
          }

          balls.begin();
          projs.begin();
          cannonBalls.begin();
          cannonGfx.clear();

          distInterp.forEach((id, seat, typeId, dist, fuse) => {
            const path = seat === 0 ? pathA : pathB;
            const pos = pointAt(path, dist);
            balls.draw(id, typeId, pos.x, pos.y, BALL_RADIUS, fuse);
          });

          for (const p of view.players.values()) {
            const cannon = p.seat === 0 ? cannonA : cannonB;
            const isMe = p.sessionId === room.sessionId;
            const aim = isMe && localAim !== null ? localAim : p.aim;
            const barrel = ballDisplayColors(p.currentType)[0] ?? UI.cannon;
            const pose = drawCannonBody(
              cannonGfx,
              cannon.x,
              cannon.y,
              aim,
              cannonRecoil.offset(p.sessionId, aim, now),
              barrel,
            );
            cannonBalls.draw(
              `muzzle_${p.sessionId}`,
              p.currentType,
              pose.tipX,
              pose.tipY,
              MUZZLE_BALL_R,
            );
            cannonBalls.draw(
              `next_${p.sessionId}`,
              p.nextType,
              pose.baseX - 28,
              pose.baseY + 28,
              NEXT_BALL_R,
            );
          }

          projectiles.forEach((id, typeId, x, y) => {
            projs.draw(id, typeId, x, y, BALL_RADIUS - 2);
          });

          balls.end();
          projs.end();
          cannonBalls.end();
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
  const key = [
    view.phase,
    view.roomCode,
    me?.rating,
    me?.combo,
    me?.level,
    me?.exp,
    me?.ballPool.length,
    oppName,
    oppRating,
  ].join("|");
  if (key === lastKey) return;
  setKey(key);

  hud.innerHTML = `
    <div style="font-size:14px;line-height:1.5;background:rgba(4,21,40,.72);padding:10px 14px;border-radius:8px;display:inline-block">
      <div>Код комнаты: <b style="color:${UI.accentHot}">${view.roomCode || "—"}</b> · ${view.phase} · ${getRankedMap().name}</div>
      <div>Вы: ${me?.displayName ?? "—"} ★${me?.rating ?? "—"} · комбо ${me?.combo ?? 0} · ур. ${me?.level ?? 0}</div>
      <div>Соперник: ${oppName} ★${oppRating}</div>
      <div style="color:${UI.secondary}">ЛКМ — выстрел · пулл ${me?.ballPool.length ?? 0} шаров</div>
    </div>
  `;
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
