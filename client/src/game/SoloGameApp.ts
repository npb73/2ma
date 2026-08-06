import {
  BALL_RADIUS,
  TICK_HZ,
  UI,
  ballDisplayColors,
  expToNextLevel,
  pointAtPathInto,
  type Point,
} from "@2ma/shared";
import Phaser from "phaser";
import { mountExpBar, mountLevelUpUi } from "../ui/levelUp";
import { mountGraphicsSettings } from "../ui/graphicsSettings";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../settings";
import { AdaptiveQuality } from "./adaptiveQuality";
import { DistInterpolator, type BallSample } from "./interpolation";
import { ProjectilePresenter } from "./projectiles";
import { SoloSim } from "./SoloSim";
import {
  BallPainter,
  preloadBallTextures,
  prepareBallTextures,
  setBallPipelineAllowed,
} from "./balls";
import {
  CannonRecoil,
  MUZZLE_BALL_R,
  NEXT_BALL_R,
  cannonPose,
  drawCannonBody,
} from "./cannonView";
import { addMapBackground, drawMapHole, drawMapPath } from "./mapView";

export async function startSoloGame(
  root: HTMLElement,
  opts: { displayName?: string; onExit: () => void },
): Promise<void> {
  root.innerHTML = "";

  const sim = new SoloSim(opts.displayName ?? "Игрок");
  const pathGeom = sim.path;
  const cannon = sim.cannon;
  const distInterp = new DistInterpolator();
  const projectiles = new ProjectilePresenter();
  const cannonRecoil = new CannonRecoil();

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

  let localAim: number | null = null;
  let lastHudKey = "";
  let lastOfferKey = "";
  let disposeLevelUi: (() => void) | null = null;
  let leaving = false;
  let tickAcc = 0;
  let lastFrameMs = performance.now();
  let resultShown = false;
  let lastCannonGfxKey = "";

  const sampleBuf: BallSample[] = [];
  const ballPositions: Point[] = [];
  const hitPointPool: Point[] = [];
  let hitPointUsed = 0;
  const drawPos = { x: 0, y: 0 };
  const ballsByOwner = new Map<string, Point[]>([
    [sim.sessionId, ballPositions],
  ]);

  let stageW = stage.clientWidth;
  let stageH = stage.clientHeight;
  const stageRo = new ResizeObserver(() => {
    stageW = stage.clientWidth;
    stageH = stage.clientHeight;
  });
  stageRo.observe(stage);

  const exit = (): void => {
    if (leaving) return;
    leaving = true;
    window.removeEventListener("keydown", onEscape);
    graphicsUi.dispose();
    stageRo.disconnect();
    disposeLevelUi?.();
    setBallPipelineAllowed(true);
    if (game?.isRunning) game.destroy(true);
    opts.onExit();
  };

  const quality = new AdaptiveQuality();
  const renderPreset = quality.preset;
  const worldZoom = quality.worldZoom;

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

  const game = new Phaser.Game({
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
        addMapBackground(this, sim.map);
        drawMapPath(this, sim.map.lanes[0].path);
        drawMapHole(this, sim.map.lanes[0].path);

        const balls = new BallPainter(this, 2);
        const projs = new BallPainter(this, 3);
        const cannonBalls = new BallPainter(this, 4);
        const cannonGfx = this.add.graphics().setDepth(4);

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (leaving || graphicsUi.isOpen() || sim.phase !== "playing") return;
          localAim = Math.atan2(
            pointer.worldY - cannon.y,
            pointer.worldX - cannon.x,
          );
          sim.setAim(localAim);
        });

        this.input.on("pointerdown", () => {
          if (leaving || graphicsUi.isOpen() || sim.phase !== "playing") return;
          if (sim.player.pendingOffer.length > 0) return;
          const aim = localAim ?? sim.player.aim;
          sim.setAim(aim);
          const shotId = projectiles.spawnLocal({
            ownerSessionId: sim.sessionId,
            aim,
            typeId: sim.player.currentType,
            cannon,
          });
          sim.fire(shotId);
          cannonRecoil.kick(sim.sessionId);
        });

        this.events.on("update", () => {
          if (leaving) return;
          const now = performance.now();
          const dtMs = Math.min(100, now - lastFrameMs);
          lastFrameMs = now;

          if (sim.phase === "playing") {
            tickAcc += dtMs / 1000;
            const step = 1 / TICK_HZ;
            while (tickAcc >= step) {
              tickAcc -= step;
              sim.tick();
            }
          }

          // Live refs — no deep snapshot per frame.
          const me = sim.player;

          let sampleCount = 0;
          for (const b of me.chain) {
            let sample = sampleBuf[sampleCount];
            if (!sample) {
              sample = {
                id: b.id,
                typeId: b.typeId,
                fuse: b.fuse,
                dist: b.dist,
                seat: 0,
              };
              sampleBuf[sampleCount] = sample;
            } else {
              sample.id = b.id;
              sample.typeId = b.typeId;
              sample.fuse = b.fuse;
              sample.dist = b.dist;
              sample.seat = 0;
            }
            sampleCount++;
          }
          sampleBuf.length = sampleCount;
          distInterp.sync(sampleBuf);
          distInterp.step(dtMs);

          ballPositions.length = 0;
          hitPointUsed = 0;
          distInterp.forEach((_id, _seat, _typeId, dist) => {
            let pt = hitPointPool[hitPointUsed];
            if (!pt) {
              pt = { x: 0, y: 0 };
              hitPointPool[hitPointUsed] = pt;
            }
            hitPointUsed++;
            pointAtPathInto(pathGeom, dist, pt);
            ballPositions.push(pt);
          });

          projectiles.syncServer(
            sim.projectiles,
            sim.sessionId,
            sim.resolvedShotIds,
          );
          projectiles.step(dtMs / 1000, ballsByOwner);

          const hudKey = [
            sim.phase,
            me.combo,
            me.level,
            me.exp,
            sim.score,
            me.ballPool.length,
          ].join("|");
          if (hudKey !== lastHudKey) {
            lastHudKey = hudKey;
            hud.innerHTML = `
              <div style="font-size:14px;line-height:1.5;background:rgba(4,21,40,.72);padding:10px 14px;border-radius:8px;display:inline-block">
                <div>Одиночная · ${sim.map.name}</div>
                <div>Счёт <b style="color:${UI.accentHot}">${sim.score}</b> · комбо ${me.combo} · ур. ${me.level}</div>
                <div style="color:${UI.secondary}">ЛКМ — выстрел · спавн ${me.ballPool.length}</div>
              </div>
            `;
          }

          const offerKey = `${me.pendingOffer.join(",")}|${me.ballPool.join(",")}`;
          if (me.pendingOffer.length > 0) {
            if (offerKey !== lastOfferKey) {
              lastOfferKey = offerKey;
              disposeLevelUi?.();
              levelPanel.style.display = "flex";
              disposeLevelUi = mountLevelUpUi(levelPanel, {
                pool: me.ballPool,
                offer: me.pendingOffer,
                onPick: (typeId) => {
                  sim.pickBall(typeId);
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

          if (sim.phase === "ended" && !resultShown) {
            resultShown = true;
            resultPanel.style.display = "block";
            resultPanel.innerHTML = `
              <div style="font-size:28px;color:${UI.accentHot};margin-bottom:8px">Конец игры</div>
              <div style="font-size:18px;margin-bottom:8px">Счёт: ${sim.score}</div>
              <div style="font-size:14px;color:${UI.textMuted};margin-bottom:16px">Комбо ${me.combo} · уровень ${me.level}</div>
              <button type="button" id="solo-again" style="padding:10px 16px;margin:0 6px;border:none;border-radius:8px;background:${UI.accent};color:${UI.bg};cursor:pointer;font-weight:700">Ещё раз</button>
              <button type="button" id="solo-lobby" style="padding:10px 16px;margin:0 6px;border:none;border-radius:8px;background:${UI.secondaryDark};color:${UI.text};cursor:pointer">В меню</button>
            `;
            resultPanel.querySelector("#solo-again")?.addEventListener("click", (e) => {
              e.preventDefault();
              resultPanel.style.display = "none";
              resultShown = false;
              projectiles.clear();
              distInterp.sync([]);
              sim.reset();
              lastHudKey = "";
              lastOfferKey = "";
              lastCannonGfxKey = "";
              disposeLevelUi?.();
              disposeLevelUi = null;
              levelPanel.style.display = "none";
              tickAcc = 0;
            });
            resultPanel.querySelector("#solo-lobby")?.addEventListener("click", (e) => {
              e.preventDefault();
              exit();
            });
          }

          expBar.update({
            level: me.level,
            exp: me.exp,
            need: expToNextLevel(me.level),
            cannonX: cannon.x,
            cannonY: cannon.y,
            stageW,
            stageH,
          });

          balls.begin();
          projs.begin();
          cannonBalls.begin();

          distInterp.forEach((id, _seat, typeId, dist, fuse) => {
            pointAtPathInto(pathGeom, dist, drawPos);
            balls.draw(id, typeId, drawPos.x, drawPos.y, BALL_RADIUS, fuse);
          });

          const aim = localAim ?? me.aim;
          const recoil = cannonRecoil.offset(sim.sessionId, aim, now);
          const anyRecoil = recoil.x !== 0 || recoil.y !== 0;
          const cannonGfxKey = `${aim.toFixed(3)}:${me.currentType}:${me.nextType}`;
          const redrawCannons =
            cannonGfxKey !== lastCannonGfxKey || anyRecoil;
          if (redrawCannons) {
            lastCannonGfxKey = cannonGfxKey;
            cannonGfx.clear();
          }

          const barrel = ballDisplayColors(me.currentType)[0] ?? UI.cannon;
          const pose = redrawCannons
            ? drawCannonBody(
                cannonGfx,
                cannon.x,
                cannon.y,
                aim,
                recoil,
                barrel,
              )
            : cannonPose(cannon.x, cannon.y, aim, recoil);
          cannonBalls.draw(
            "muzzle",
            me.currentType,
            pose.tipX,
            pose.tipY,
            MUZZLE_BALL_R,
          );
          cannonBalls.draw(
            "next",
            me.nextType,
            pose.baseX - 28,
            pose.baseY + 28,
            NEXT_BALL_R,
          );

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
}
