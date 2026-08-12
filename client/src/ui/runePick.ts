import {
  RUNES,
  UI,
  type RuneId,
} from "@2ma/shared";

const STYLE_ID = "rune-pick-style";
const ROTATE_DEG_PER_SEC = 5;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes rune-pick-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .rune-pick-root {
      position: absolute;
      inset: 0;
      z-index: 28;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      background: rgba(3, 7, 16, 0.72);
      animation: rune-pick-fade-in 0.35s ease-out both;
      font-family: Segoe UI, system-ui, sans-serif;
      color: ${UI.text};
    }
    .rune-pick-title {
      position: relative;
      z-index: 2;
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: ${UI.accentHot};
      text-transform: uppercase;
    }
    .rune-pick-status {
      position: relative;
      z-index: 2;
      min-height: 1.2em;
      margin: 0 0 18px;
      font-size: 13px;
      color: ${UI.textMuted};
    }
    .rune-pick-stage {
      position: relative;
      width: min(420px, 78vw);
      height: min(420px, 78vw);
    }
    .rune-pick-wheel {
      position: absolute;
      inset: 0;
      transform-origin: 50% 50%;
      will-change: transform;
    }
    .rune-pick-btn {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 72px;
      height: 72px;
      margin: 0;
      border-radius: 50%;
      border: 2px solid ${UI.secondaryDark};
      background: ${UI.bgPanel};
      color: ${UI.text};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      box-sizing: border-box;
      transition: border-color 120ms ease, box-shadow 120ms ease;
      --rune-counter: 0deg;
      transform: translate(-50%, -50%)
        rotate(var(--rune-slot, 0deg))
        translateY(var(--rune-radius, -150px))
        rotate(var(--rune-counter));
    }
    .rune-pick-btn:hover,
    .rune-pick-btn:focus-visible {
      outline: none;
      border-color: var(--rune-color, ${UI.accent});
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--rune-color, ${UI.accent}) 35%, transparent),
        0 0 22px color-mix(in srgb, var(--rune-color, ${UI.accent}) 55%, transparent);
      transform: translate(-50%, -50%)
        rotate(var(--rune-slot, 0deg))
        translateY(var(--rune-radius, -150px))
        rotate(var(--rune-counter))
        scale(1.08);
    }
    .rune-pick-btn:disabled {
      cursor: default;
      opacity: 0.55;
      pointer-events: none;
    }
    .rune-pick-glyph {
      width: 40px;
      height: 40px;
      pointer-events: none;
    }
    .rune-pick-label {
      position: absolute;
      left: 50%;
      bottom: -22px;
      transform: translateX(-50%);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      color: ${UI.textMuted};
      pointer-events: none;
    }
    .rune-pick-btn:hover .rune-pick-label,
    .rune-pick-btn:focus-visible .rune-pick-label {
      color: var(--rune-color, ${UI.text});
    }
  `;
  document.head.append(style);
}

function runeGlyph(color: string | null): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.classList.add("rune-pick-glyph");

  const stroke = color ?? UI.secondary;
  const fill = color
    ? `color-mix(in srgb, ${color} 55%, ${UI.bgPanel})`
    : UI.secondaryDark;

  const ring = document.createElementNS(ns, "circle");
  ring.setAttribute("cx", "20");
  ring.setAttribute("cy", "20");
  ring.setAttribute("r", "15");
  ring.setAttribute("fill", fill);
  ring.setAttribute("stroke", stroke);
  ring.setAttribute("stroke-width", "2");
  svg.append(ring);

  if (color) {
    const diamond = document.createElementNS(ns, "path");
    diamond.setAttribute("d", "M20 8 L30 20 L20 32 L10 20 Z");
    diamond.setAttribute("fill", "none");
    diamond.setAttribute("stroke", stroke);
    diamond.setAttribute("stroke-width", "2");
    svg.append(diamond);
  } else {
    const cross = document.createElementNS(ns, "path");
    cross.setAttribute("d", "M12 12 L28 28 M28 12 L12 28");
    cross.setAttribute("fill", "none");
    cross.setAttribute("stroke", UI.secondary);
    cross.setAttribute("stroke-width", "2.2");
    cross.setAttribute("stroke-linecap", "round");
    svg.append(cross);
  }
  return svg;
}

export interface RunePickHandle {
  dispose: () => void;
  setStatus: (text: string) => void;
  setLocked: (locked: boolean) => void;
}

/**
 * Fullscreen rune chooser: 6 runes on a slowly rotating ring.
 */
export function mountRunePick(
  host: HTMLElement,
  opts: {
    onPick: (rune: RuneId) => void;
    status?: string;
  },
): RunePickHandle {
  ensureStyles();

  const root = document.createElement("div");
  root.className = "rune-pick-root";

  const title = document.createElement("div");
  title.className = "rune-pick-title";
  title.textContent = "Выберите руну";

  const status = document.createElement("div");
  status.className = "rune-pick-status";
  status.textContent = opts.status ?? "Одна руна задаёт баланс цветов в линии";

  const stage = document.createElement("div");
  stage.className = "rune-pick-stage";

  const wheel = document.createElement("div");
  wheel.className = "rune-pick-wheel";

  const buttons: HTMLButtonElement[] = [];
  const n = RUNES.length;
  const radiusPx = "min(150px, 36vw)";

  RUNES.forEach((rune, i) => {
    const slotDeg = (360 / n) * i;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rune-pick-btn";
    btn.style.setProperty("--rune-slot", `${slotDeg}deg`);
    btn.style.setProperty("--rune-radius", `calc(-1 * ${radiusPx})`);
    const color = rune.color ?? UI.secondary;
    btn.style.setProperty("--rune-color", color);
    btn.title = rune.title;
    btn.setAttribute("aria-label", rune.title);

    btn.append(runeGlyph(rune.color));
    const label = document.createElement("span");
    label.className = "rune-pick-label";
    label.textContent = rune.title;
    btn.append(label);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onPick(rune.id);
    });

    buttons.push(btn);
    wheel.append(btn);
  });

  stage.append(wheel);
  root.append(title, status, stage);
  host.append(root);

  let raf = 0;
  let disposed = false;
  const t0 = performance.now();

  const tick = (now: number) => {
    if (disposed) return;
    const deg = ((now - t0) / 1000) * ROTATE_DEG_PER_SEC;
    wheel.style.transform = `rotate(${deg}deg)`;
    // Counter wheel + own slot so the glyph stays screen-upright.
    for (let i = 0; i < buttons.length; i++) {
      const slotDeg = (360 / n) * i;
      buttons[i]!.style.setProperty(
        "--rune-counter",
        `${-(slotDeg + deg)}deg`,
      );
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      root.remove();
    },
    setStatus: (text: string) => {
      status.textContent = text;
    },
    setLocked: (locked: boolean) => {
      for (const btn of buttons) btn.disabled = locked;
    },
  };
}
