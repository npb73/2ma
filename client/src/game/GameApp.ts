import {
  BALL_RADIUS,
  DEFAULT_RANKED_MAP_ID,
  FIRE_RELOAD_SEC,
  UI,
  buildPath,
  expToNextLevel,
  getRankedMap,
  mapCannon,
  mapPath,
  pointAtPathInto,
  type Point,
} from "@2ma/shared";
import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import type { PlayMode } from "../ui/lobby";
import type { UserInfo } from "../auth";
import { mountExpBar, mountLevelUpUi } from "../ui/levelUp";
import { mountGraphicsSettings } from "../ui/graphicsSettings";
import { mountRunePick, type RunePickHandle } from "../ui/runePick";
import { AdaptiveQuality, setActiveWorldSize, syncGameToStage } from "./adaptiveQuality";
import {
  BallPainter,
  BallHoverTip,
  preloadBallTextures,
  prepareBallTextures,
  setBallPipelineAllowed,
} from "./balls";
import {
  preloadPlayerTexture,
  preparePlayerTexture,
  PlayerSpriteLayer,
} from "./player";
import { addMapBackground, drawMapHole, drawMapPath } from "./mapView";
import { DistInterpolator, type BallSample } from "./interpolation";
import { ProjectilePresenter } from "./projectiles";
import { ExpOrbPresenter } from "./expOrbs";
import {
  CannonRecoil,
  LocalReload,
  MUZZLE_BALL_R,
  cannonPose,
  drawCannonBody,
  drawReloadRing,
} from "./cannonView";

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
const AIM_SEND_MS = 50;

interface StartOptions {
  token: string;
  user: UserInfo;
  mode: Exclude<PlayMode, "solo">;
  code?: string;
  mapId?: string;
  /** Return to lobby / menu (no full page reload). */
  onExit: () => void;
}

interface BallView {
  id: string;
  typeId: string;
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
  reloadSec: number;
  runeId: string;
  ballPool: string[];
  pendingOffer: string[];
  chain: BallView[];
}

interface GameView {
  phase: string;
  roomCode: string;
  mapId: string;
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
  expOrbs: {
    id: string;
    ownerSessionId: string;
    x: number;
    y: number;
    color: string;
  }[];
  resolvedShotIds: string[];
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
    mapId: string;
    winnerId: string;
    loserId: string;
    ratingDelta: number;
    players: {
      forEach: (cb: (p: Record<string, unknown>, id: string) => void) => void;
    };
    projectiles: unknown;
    expOrbs: unknown;
    resolvedShotIds: unknown;
  };

  const players = new Map<string, PlayerView>();
  s.players.forEach((p, sessionId) => {
    const chainRaw = asArray<{
      id: string;
      typeId: string;
      dist: number;
    }>(p.chain);
    const chain: BallView[] = chainRaw.map((b) => ({
      id: b.id,
      typeId: String(b.typeId ?? "solid_0"),
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
      reloadSec: Number(p.reloadSec ?? 0),
      runeId: String(p.runeId ?? ""),
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

  const expOrbsRaw = asArray<Record<string, unknown>>(s.expOrbs);
  const expOrbs = expOrbsRaw.map((p) => ({
    id: String(p.id),
    ownerSessionId: String(p.ownerSessionId ?? ""),
    x: Number(p.x),
    y: Number(p.y),
    color: String(p.color ?? "#ffffe4"),
  }));

  return {
    phase: s.phase,
    roomCode: s.roomCode,
    mapId: String(s.mapId ?? ""),
    winnerId: s.winnerId,
    loserId: s.loserId,
    ratingDelta: s.ratingDelta,
    players,
    projectiles,
    expOrbs,
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

/** Full-screen matchmaking wait. Resolves `cancelled` if user aborts. */
function waitForOpponent(
  root: HTMLElement,
  room: Room,
  mode: Exclude<PlayMode, "solo">,
): Promise<{ cancelled: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (cancelled: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ cancelled });
    };

    root.innerHTML = "";
    root.style.cssText = `
      width:100%;height:100%;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:16px;
      background:radial-gradient(ellipse at top, ${UI.bgPanel}, ${UI.bg});
      color:${UI.text};font-family:Segoe UI,system-ui,sans-serif;
      box-sizing:border-box;padding:32px;
    `;

    const title = document.createElement("div");
    title.style.cssText = `font-size:28px;color:${UI.accentHot};letter-spacing:0.04em;`;
    title.textContent =
      mode === "queue"
        ? "Поиск игроков..."
        : mode === "create"
          ? "Ожидание соперника..."
          : "Подключение…";

    const detail = document.createElement("div");
    detail.style.cssText = `font-size:15px;color:${UI.secondary};min-height:1.4em;`;
    const syncDetail = () => {
      const code = String((room.state as { roomCode?: string }).roomCode ?? "");
      if (mode === "create" && code) {
        detail.innerHTML = `Код комнаты: <b style="color:${UI.accentHot}">${code}</b>`;
      } else if (mode === "queue") {
        detail.textContent = "Ищем свободного соперника";
      } else {
        detail.textContent = "";
      }
    };
    syncDetail();

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Отмена";
    cancel.style.cssText = `
      margin-top:12px;padding:10px 20px;border:none;border-radius:8px;
      background:${UI.secondaryDark};color:${UI.text};cursor:pointer;font-size:15px;
    `;
    cancel.addEventListener("click", () => finish(true));

    root.append(title, detail, cancel);

    const check = () => {
      syncDetail();
      const phase = String((room.state as { phase?: string }).phase ?? "");
      if (phase === "playing" || phase === "ended" || phase === "rune")
        finish(false);
    };

    room.onStateChange(() => check());
    room.onLeave(() => finish(true));
    check();
  });
}

function showMatchResultScreen(
  root: HTMLElement,
  opts: { won: boolean; ratingDelta: number; onMenu: () => void },
): void {
  root.innerHTML = "";
  root.style.cssText = `
    width:100%;height:100%;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:12px;
    background:radial-gradient(ellipse at top, ${UI.bgPanel}, ${UI.bg});
    color:${UI.text};font-family:Segoe UI,system-ui,sans-serif;
    box-sizing:border-box;padding:32px;
  `;

  const title = document.createElement("div");
  title.style.cssText = `font-size:42px;color:${opts.won ? UI.accentHot : UI.accent};margin-bottom:4px;`;
  title.textContent = opts.won ? "Победа" : "Поражение";

  const delta = document.createElement("div");
  delta.style.cssText = `font-size:20px;color:${UI.textMuted};margin-bottom:20px;`;
  delta.textContent = `${opts.won ? "+" : "−"}${opts.ratingDelta} рейтинга`;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Вернуться в меню";
  btn.style.cssText = `
    padding:12px 22px;border:none;border-radius:8px;
    background:${UI.secondaryDark};color:${UI.text};cursor:pointer;font-size:16px;
  `;
  btn.addEventListener("click", () => opts.onMenu());

  root.append(title, delta, btn);
}

export async function startGame(
  root: HTMLElement,
  opts: StartOptions,
): Promise<void> {
  root.innerHTML = "";
  root.style.cssText = `
    width:100%;height:100%;display:flex;align-items:center;justify-content:center;
    background:${UI.bg};color:${UI.text};font-family:Segoe UI,system-ui,sans-serif;
  `;
  root.textContent =
    opts.mode === "queue" ? "Поиск игроков..." : "Подключение…";

  const client = new Client(WS_URL);
  let room: Room;
  const mapIdOpt = opts.mapId?.trim() || DEFAULT_RANKED_MAP_ID;

  if (opts.mode === "create") {
    const res = await fetch("/match/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: opts.token, mapId: mapIdOpt }),
    });
    if (!res.ok) throw new Error("Не удалось создать комнату");
    const data = (await res.json()) as { roomId: string; roomCode: string };
    room = await client.joinById(data.roomId, {
      token: opts.token,
      isPrivate: true,
      mapId: mapIdOpt,
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
      mapId: mapIdOpt,
    });
  }

  // Stay on matchmaking screen until both players are in (rune pick or later).
  if (
    String(room.state.phase) !== "playing" &&
    String(room.state.phase) !== "ended" &&
    String(room.state.phase) !== "rune"
  ) {
    const { cancelled } = await waitForOpponent(root, room, opts.mode);
    if (cancelled) {
      try {
        await room.leave(true);
      } catch {
        /* ignore */
      }
      opts.onExit();
      return;
    }
  }

  if (String(room.state.phase) === "ended") {
    const view = readState(room);
    const won = view.winnerId === room.sessionId;
    const delta = view.ratingDelta;
    try {
      await room.leave(true);
    } catch {
      /* ignore */
    }
    showMatchResultScreen(root, {
      won,
      ratingDelta: delta,
      onMenu: opts.onExit,
    });
    return;
  }

  const roomMapId = String(
    (room.state as { mapId?: string }).mapId || mapIdOpt,
  );
  const map = getRankedMap(roomMapId);
  setActiveWorldSize(map.width, map.height);

  root.innerHTML = "";
  root.style.cssText = "";
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
  `;
  const runeHost = document.createElement("div");
  runeHost.style.cssText = `position:absolute; inset:0; z-index:28; pointer-events:none;`;
  overlay.append(hud, levelPanel, runeHost);

  const host = document.createElement("div");
  host.style.cssText = `
    width:100%;height:100%;position:relative;overflow:hidden;
    background:${UI.bg};
  `;
  const stage = document.createElement("div");
  stage.style.cssText = `
    position:absolute; inset:0;
    width:100%; height:100%;
    background:${UI.bg};
  `;
  const canvasMount = document.createElement("div");
  canvasMount.style.cssText =
    "width:100%;height:100%;position:absolute;inset:0;z-index:1;";
  stage.append(canvasMount, overlay);
  host.append(stage);
  root.append(host);

  const expBar = mountExpBar(stage);
  const hoverTip = new BallHoverTip(stage);

  let lastOfferKey = "";
  let disposeLevelUi: (() => void) | null = null;
  let runeUi: RunePickHandle | null = null;
  let runePickedLocal = false;
  let lastHudKey = "";
  let lastAimSent = 0;
  let localAim: number | null = null;
  let leaving = false;
  let matchEndHandled = false;
  let game: Phaser.Game | null = null;
  const distInterp = new DistInterpolator();
  const projectiles = new ProjectilePresenter();
  projectiles.setWorldSize(map.width, map.height);
  const expOrbs = new ExpOrbPresenter();
  const cannonRecoil = new CannonRecoil();
  const localReload = new LocalReload();
  const recoiledShots = new Set<string>();
  let lastFrameMs = performance.now();
  const pathA = buildPath(mapPath(map, 0));
  const pathB = buildPath(mapPath(map, 1));
  const cannonA = mapCannon(map, 0);
  const cannonB = mapCannon(map, 1);

  // Cached state — rebuilt only on Colyseus patches, not every frame.
  let cachedView = readState(room);
  room.onStateChange(() => {
    cachedView = readState(room);
  });

  // Reused per-frame buffers (avoid GC).
  const sampleBuf: BallSample[] = [];
  const ballsByOwner = new Map<string, Point[]>();
  const hitPointPool: Point[] = [];
  let hitPointUsed = 0;
  /** One path sample per ball: hit targets + draw share these coords. */
  const drawBalls: {
    id: string;
    typeId: string;
    x: number;
    y: number;
  }[] = [];
  const seatSession: [string, string] = ["", ""];
  let lastCannonGfxKey = "";

  let stageW = Math.max(1, stage.clientWidth);
  let stageH = Math.max(1, stage.clientHeight);

  const quality = new AdaptiveQuality();
  const renderSize = quality.canvasSize(stageW, stageH);
  const worldZoom = quality.worldZoomForCanvas(renderSize);

  const stageRo = new ResizeObserver(() => {
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    if (game?.isRunning) syncGameToStage(game, quality);
  });
  stageRo.observe(stage);

  const aimFromPointer = (pointer: Phaser.Input.Pointer): number | null => {
    const me = room.state.players.get(room.sessionId) as
      | { seat?: number }
      | undefined;
    if (!me) return null;
    const cannon = Number(me.seat) === 0 ? cannonA : cannonB;
    return Math.atan2(pointer.worldY - cannon.y, pointer.worldX - cannon.x);
  };

  const graphicsUi = mountGraphicsSettings(root, {
    onApply: () => {
      quality.syncFromSettings(game);
    },
  });

  const onEscape = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (leaving) return;
    graphicsUi.toggle();
  };
  window.addEventListener("keydown", onEscape);

  const handleMatchEnd = (view: GameView): void => {
    if (matchEndHandled || leaving) return;
    matchEndHandled = true;
    leaving = true;
    const won = view.winnerId === room.sessionId;
    const ratingDelta = view.ratingDelta;
    window.removeEventListener("keydown", onEscape);
    graphicsUi.dispose();
    hoverTip.dispose();
    stageRo.disconnect();
    disposeLevelUi?.();
    runeUi?.dispose();
    runeUi = null;
    setBallPipelineAllowed(true);
    void (async () => {
      await cleanupMatch(room, game);
      showMatchResultScreen(root, {
        won,
        ratingDelta,
        onMenu: opts.onExit,
      });
    })();
  };

  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: renderSize.width,
    height: renderSize.height,
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
      width: renderSize.width,
      height: renderSize.height,
    },
    scene: {
      preload(this: Phaser.Scene) {
        preloadBallTextures(this);
        preloadPlayerTexture(this);
      },
      create(this: Phaser.Scene) {
        this.cameras.main.setZoom(worldZoom);
        this.cameras.main.centerOn(map.width / 2, map.height / 2);

        prepareBallTextures(this);
        preparePlayerTexture(this);
        addMapBackground(this, map);
        drawMapPath(this, pathA.points);
        drawMapPath(this, pathB.points);
        drawMapHole(this, pathA.points);
        drawMapHole(this, pathB.points);

        const balls = new BallPainter(this, 2);
        const projs = new BallPainter(this, 3);
        // Muzzle ammo + reload ring under the player sprite.
        const cannonBalls = new BallPainter(this, 3);
        const cannonGfx = this.add.graphics().setDepth(3);
        const playerSprites = new PlayerSpriteLayer(this, 4);
        const expGfx = this.add.graphics().setDepth(6);

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (leaving || graphicsUi.isOpen() || room.state.phase !== "playing")
            return;
          const angle = aimFromPointer(pointer);
          if (angle === null) return;
          localAim = angle;
          const now = performance.now();
          if (now - lastAimSent < AIM_SEND_MS) return;
          lastAimSent = now;
          room.send("aim", { angle });
        });

        this.input.on("pointerdown", () => {
          if (leaving || graphicsUi.isOpen() || room.state.phase !== "playing")
            return;
          const me = cachedView.players.get(room.sessionId);
          if (!me || me.pendingOffer.length > 0) return;
          if (!localReload.ready() || me.reloadSec > 0) return;
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
          localReload.kick(FIRE_RELOAD_SEC);
          cannonRecoil.kick(room.sessionId);
          recoiledShots.add(shotId);
        });

        this.events.on("update", () => {
          if (leaving) return;
          const now = performance.now();
          const dtMs = Math.min(100, now - lastFrameMs);
          lastFrameMs = now;

          const view = cachedView;
          const me = view.players.get(room.sessionId);

          sampleBuf.length = 0;
          let sampleCount = 0;
          for (const p of view.players.values()) {
            for (const b of p.chain) {
              let sample = sampleBuf[sampleCount];
              if (!sample) {
                sample = {
                  id: b.id,
                  typeId: b.typeId,
                  dist: b.dist,
                  seat: p.seat,
                };
                sampleBuf[sampleCount] = sample;
              } else {
                sample.id = b.id;
                sample.typeId = b.typeId;
                sample.dist = b.dist;
                sample.seat = p.seat;
              }
              sampleCount++;
            }
          }
          sampleBuf.length = sampleCount;
          distInterp.sync(sampleBuf);
          distInterp.step(dtMs);

          for (const arr of ballsByOwner.values()) arr.length = 0;
          seatSession[0] = "";
          seatSession[1] = "";
          for (const p of view.players.values()) {
            if (!ballsByOwner.has(p.sessionId)) {
              ballsByOwner.set(p.sessionId, []);
            }
            if (p.seat === 0 || p.seat === 1) {
              seatSession[p.seat] = p.sessionId;
            }
          }
          hitPointUsed = 0;
          let drawCount = 0;
          distInterp.forEach((id, seat, typeId, dist) => {
            const path = seat === 0 ? pathA : pathB;
            const sessionId = seatSession[seat === 0 ? 0 : 1];
            const arr = sessionId ? ballsByOwner.get(sessionId) : undefined;
            let pt = hitPointPool[hitPointUsed];
            if (!pt) {
              pt = { x: 0, y: 0 };
              hitPointPool[hitPointUsed] = pt;
            }
            hitPointUsed++;
            pointAtPathInto(path, dist, pt);
            if (arr) arr.push(pt);

            let db = drawBalls[drawCount];
            if (!db) {
              db = { id, typeId, x: pt.x, y: pt.y };
              drawBalls[drawCount] = db;
            } else {
              db.id = id;
              db.typeId = typeId;
              db.x = pt.x;
              db.y = pt.y;
            }
            drawCount++;
          });
          drawBalls.length = drawCount;

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

          // Rune pick phase: show chooser until both players have selected.
          if (view.phase === "rune") {
            const self = view.players.get(room.sessionId);
            const already = Boolean(self?.runeId) || runePickedLocal;
            if (!runeUi) {
              runeHost.style.pointerEvents = "auto";
              runeUi = mountRunePick(runeHost, {
                onPick: (rune) => {
                  runePickedLocal = true;
                  room.send("pickRune", {
                    runeId: rune === "neutral" ? "neutral" : rune,
                  });
                  runeUi?.setLocked(true);
                  runeUi?.setStatus("Ждём соперника…");
                },
              });
            }
            if (already) {
              runeUi.setLocked(true);
              runeUi.setStatus("Ждём соперника…");
            }
          } else if (runeUi) {
            runeUi.dispose();
            runeUi = null;
            runeHost.style.pointerEvents = "none";
            runeHost.innerHTML = "";
          }

          renderHud(hud, view, room.sessionId, map.name, lastHudKey, (key) => {
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

          if (view.phase === "ended") {
            handleMatchEnd(view);
            return;
          }

          if (me) {
            expBar.update({
              level: me.level,
              exp: me.exp,
              need: expToNextLevel(me.level),
              levelUpOpen: me.pendingOffer.length > 0,
            });
          }

          balls.begin();
          projs.begin();
          cannonBalls.begin();
          playerSprites.begin();

          for (let i = 0; i < drawBalls.length; i++) {
            const b = drawBalls[i];
            balls.draw(b.id, b.typeId, b.x, b.y, BALL_RADIUS);
          }

          expOrbs.syncCredits(view.expOrbs, (sid) => {
            const p = view.players.get(sid);
            if (!p) return null;
            return p.seat === 0 ? cannonA : cannonB;
          });
          const picked = expOrbs.step(dtMs / 1000);
          for (const id of picked) {
            // Only the owner may collect; opponent orbs are visual only here.
            const credit = view.expOrbs.find((o) => o.id === id);
            if (credit && credit.ownerSessionId === room.sessionId) {
              room.send("collectExp", { id });
            }
          }

          let cannonGfxKey = "";
          let anyRecoil = false;
          let anyReload = false;
          for (const p of view.players.values()) {
            const isMe = p.sessionId === room.sessionId;
            const aim = isMe && localAim !== null ? localAim : p.aim;
            const recoil = cannonRecoil.offset(p.sessionId, aim, now);
            if (recoil.x !== 0 || recoil.y !== 0) anyRecoil = true;
            const reloadSec = isMe
              ? Math.max(p.reloadSec, localReload.remainingSec(now))
              : p.reloadSec;
            if (reloadSec > 0) anyReload = true;
            cannonGfxKey += `${p.sessionId}:${aim.toFixed(3)}:${p.currentType}:${p.nextType}:${reloadSec.toFixed(2)}|`;
          }
          const redrawCannons =
            cannonGfxKey !== lastCannonGfxKey || anyRecoil || anyReload;
          if (redrawCannons) {
            lastCannonGfxKey = cannonGfxKey;
            cannonGfx.clear();
          }

          for (const p of view.players.values()) {
            const cannon = p.seat === 0 ? cannonA : cannonB;
            const isMe = p.sessionId === room.sessionId;
            const aim = isMe && localAim !== null ? localAim : p.aim;
            const recoil = cannonRecoil.offset(p.sessionId, aim, now);
            const pose = redrawCannons
              ? drawCannonBody(
                  cannonGfx,
                  cannon.x,
                  cannon.y,
                  aim,
                  recoil,
                )
              : cannonPose(cannon.x, cannon.y, aim, recoil);
            playerSprites.draw(p.sessionId, pose.baseX, pose.baseY, aim);
            if (redrawCannons) {
              const reloadSec = isMe
                ? Math.max(p.reloadSec, localReload.remainingSec(now))
                : p.reloadSec;
              const ready =
                FIRE_RELOAD_SEC <= 0
                  ? 1
                  : 1 - Math.min(1, reloadSec / FIRE_RELOAD_SEC);
              drawReloadRing(cannonGfx, pose.baseX, pose.baseY, ready);
            }
            cannonBalls.draw(
              `muzzle_${p.sessionId}`,
              p.currentType,
              pose.tipX,
              pose.tipY,
              MUZZLE_BALL_R,
            );
          }

          projectiles.forEach((id, typeId, x, y) => {
            projs.draw(id, typeId, x, y, BALL_RADIUS - 2);
          });

          expOrbs.draw(expGfx);

          balls.end();
          projs.end();
          cannonBalls.end();
          playerSprites.end();

          const ptr = this.input.activePointer;
          hoverTip.update({
            painters: [balls, projs, cannonBalls],
            worldX: ptr.worldX,
            worldY: ptr.worldY,
            camera: this.cameras.main,
            canvas: this.game.canvas,
            now,
            enabled:
              !leaving &&
              !graphicsUi.isOpen() &&
              room.state.phase === "playing" &&
              !(me && me.pendingOffer.length > 0),
          });
        });
      },
    },
  });

  room.onLeave(() => {
    stageRo.disconnect();
    if (!leaving && game?.isRunning) {
      game.destroy(true);
    }
  });
}

function renderHud(
  hud: HTMLElement,
  view: GameView,
  myId: string,
  mapName: string,
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
    view.mapId,
    mapName,
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
      <div>Код комнаты: <b style="color:${UI.accentHot}">${view.roomCode || "—"}</b> · ${view.phase} · ${mapName}</div>
      <div>Вы: ${me?.displayName ?? "—"} ★${me?.rating ?? "—"} · комбо ${me?.combo ?? 0} · ур. ${me?.level ?? 0}</div>
      <div>Соперник: ${oppName} ★${oppRating}</div>
      <div style="color:${UI.secondary}">ЛКМ — выстрел · спавн ${me?.ballPool.length ?? 0}</div>
    </div>
  `;
}
