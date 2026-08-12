import {
  CHAIN_RUN_LENGTHS,
  PATH_SPEED,
  PATH_SPEED_ACCEL_PER_SEC,
  PATH_SPEED_MAX,
  UI,
} from "@2ma/shared";
import type { SoloSim } from "../game/SoloSim";

export interface SoloDebugHandle {
  dispose: () => void;
}

/**
 * Solo-only debug panel: path speed + chain run-length weights.
 */
export function mountSoloDebug(host: HTMLElement, sim: SoloSim): SoloDebugHandle {
  const panel = document.createElement("div");
  panel.style.cssText = `
    position:absolute; right:12px; top:12px; z-index:40; pointer-events:auto;
    width:min(320px, calc(100% - 24px));
    background:rgba(4,21,40,.92); border:1px solid ${UI.secondaryDark};
    border-radius:10px; padding:12px 14px; color:${UI.text};
    font-family:Segoe UI,system-ui,sans-serif; font-size:13px;
    box-shadow:0 8px 24px rgba(0,0,0,.35);
  `;

  const titleRow = document.createElement("div");
  titleRow.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;";
  const title = document.createElement("div");
  title.style.cssText = `font-weight:600;color:${UI.accentHot};letter-spacing:0.04em;`;
  title.textContent = "Отладка";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Свернуть";
  toggle.style.cssText = `
    border:none;background:transparent;color:${UI.secondary};cursor:pointer;font-size:12px;padding:0;
  `;
  titleRow.append(title, toggle);

  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:10px;";

  const speedLabel = document.createElement("label");
  speedLabel.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  const speedCaption = document.createElement("span");
  speedCaption.innerHTML = `Скорость (px/s). ${PATH_SPEED} + ${PATH_SPEED_ACCEL_PER_SEC}/с → ${PATH_SPEED_MAX}. Слайдер фиксирует.`;
  speedCaption.style.color = UI.secondary;
  const speedRow = document.createElement("div");
  speedRow.style.cssText = "display:flex;align-items:center;gap:8px;";
  const speedInput = document.createElement("input");
  speedInput.type = "range";
  speedInput.min = "1";
  speedInput.max = String(PATH_SPEED_MAX);
  speedInput.step = "1";
  speedInput.value = String(Math.round(sim.pathSpeed));
  speedInput.style.cssText = "flex:1;";
  const speedValue = document.createElement("span");
  speedValue.style.cssText = `min-width:2.5em;text-align:right;color:${UI.textMuted};`;
  speedValue.textContent = speedInput.value;
  speedRow.append(speedInput, speedValue);
  speedLabel.append(speedCaption, speedRow);

  const runsLabel = document.createElement("label");
  runsLabel.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  const runsCaption = document.createElement("span");
  runsCaption.style.color = UI.secondary;
  runsCaption.textContent = "Длины серий (числа через запятую)";
  const runsInput = document.createElement("textarea");
  runsInput.rows = 3;
  runsInput.value = sim.getRunLengths().join(",");
  runsInput.style.cssText = `
    width:100%;box-sizing:border-box;resize:vertical;min-height:64px;
    padding:8px;border-radius:8px;border:1px solid ${UI.secondaryDark};
    background:${UI.bg};color:${UI.text};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:12px;line-height:1.4;
  `;
  runsLabel.append(runsCaption, runsInput);

  const status = document.createElement("div");
  status.style.cssText = `min-height:1.2em;color:${UI.secondary};font-size:12px;`;

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;";

  const mkBtn = (label: string, primary = false): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = `
      padding:7px 12px;border:none;border-radius:8px;cursor:pointer;font-size:13px;
      background:${primary ? UI.accent : UI.secondaryDark};color:${UI.text};
    `;
    return b;
  };

  const applyBtn = mkBtn("Применить", true);
  const defaultsBtn = mkBtn("Сброс");
  const restartBtn = mkBtn("Рестарт цепи");
  btnRow.append(applyBtn, defaultsBtn, restartBtn);

  body.append(speedLabel, runsLabel, btnRow, status);
  panel.append(titleRow, body);
  host.append(panel);

  let collapsed = false;
  let speedLocked = false;
  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? "none" : "flex";
    toggle.textContent = collapsed ? "Развернуть" : "Свернуть";
  });

  const parseRuns = (raw: string): number[] | null => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isFinite(n) || n < 1)) return null;
    return nums.map((n) => Math.floor(n));
  };

  const syncSpeedReadout = () => {
    const v = Math.round(sim.pathSpeed);
    speedValue.textContent = String(v);
    if (!speedLocked) speedInput.value = String(v);
  };

  const applySpeedLive = () => {
    speedLocked = true;
    const v = Number(speedInput.value);
    speedValue.textContent = String(v);
    sim.setPathSpeed(v);
  };
  speedInput.addEventListener("input", applySpeedLive);

  // Keep slider roughly in sync with intro curve when not locked.
  const poll = window.setInterval(() => {
    if (!speedLocked) syncSpeedReadout();
  }, 200);

  applyBtn.addEventListener("click", () => {
    applySpeedLive();
    const runs = parseRuns(runsInput.value);
    if (!runs) {
      status.textContent = "Массив: только целые ≥ 1 через запятую";
      status.style.color = UI.accent;
      return;
    }
    sim.setRunLengths(runs);
    runsInput.value = sim.getRunLengths().join(",");
    status.textContent = `Ок · скорость ${Math.round(sim.pathSpeed)} · серий ${runs.length}`;
    status.style.color = UI.secondary;
  });

  defaultsBtn.addEventListener("click", () => {
    speedLocked = false;
    sim.setPathSpeed(null);
    sim.setRunLengths(CHAIN_RUN_LENGTHS);
    runsInput.value = sim.getRunLengths().join(",");
    syncSpeedReadout();
    status.textContent = `Разгон ${PATH_SPEED}→${PATH_SPEED_MAX} и серии по умолчанию`;
    status.style.color = UI.secondary;
  });

  restartBtn.addEventListener("click", () => {
    const runs = parseRuns(runsInput.value);
    if (runs) sim.setRunLengths(runs);
    const lengths = sim.getRunLengths();
    const lockedSpeed = speedLocked ? Number(speedInput.value) : null;
    sim.reset();
    sim.pickRune("neutral");
    sim.setRunLengths(lengths);
    if (lockedSpeed != null) sim.setPathSpeed(lockedSpeed);
    else sim.setPathSpeed(null);
    syncSpeedReadout();
    runsInput.value = sim.getRunLengths().join(",");
    status.textContent = "Цепь пересобрана";
    status.style.color = UI.secondary;
  });

  return {
    dispose: () => {
      window.clearInterval(poll);
      panel.remove();
    },
  };
}
