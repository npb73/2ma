import { UI, getBallType, type BallTypeDef } from "@2ma/shared";
import { ballSwatch } from "../game/balls";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration> & Record<string, string>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text) node.textContent = text;
  return node;
}

function typeCard(
  typeId: string,
  opts: { selectable?: boolean; onPick?: () => void },
): HTMLElement {
  const def: BallTypeDef | undefined = getBallType(typeId);
  const card = el("button", {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "12px 10px",
    minWidth: "110px",
    maxWidth: "140px",
    borderRadius: "10px",
    border: `1px solid ${UI.secondaryDark}`,
    background: UI.bgPanel,
    color: UI.text,
    cursor: opts.selectable ? "pointer" : "default",
    boxSizing: "border-box",
  });
  card.type = "button";
  card.append(ballSwatch(typeId, 44));
  card.append(
    el(
      "div",
      { fontSize: "13px", fontWeight: "700", textAlign: "center" },
      def?.title ?? typeId,
    ),
  );
  if (def?.description) {
    card.append(
      el(
        "div",
        {
          fontSize: "11px",
          color: UI.textMuted,
          textAlign: "center",
          lineHeight: "1.3",
        },
        def.description,
      ),
    );
  }
  if (opts.selectable && opts.onPick) {
    card.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onPick?.();
    };
    card.onmouseenter = () => {
      card.style.borderColor = UI.accent;
    };
    card.onmouseleave = () => {
      card.style.borderColor = UI.secondaryDark;
    };
  }
  return card;
}

/**
 * Level-up modal: spawn-pool preview on top, 3 offer cards in the center.
 * Returns a disposer.
 */
export function mountLevelUpUi(
  host: HTMLElement,
  opts: {
    pool: string[];
    offer: string[];
    onPick: (typeId: string) => void;
  },
): () => void {
  host.innerHTML = "";
  host.style.display = "flex";
  host.style.pointerEvents = "auto";

  const panel = el("div", {
    width: "min(920px, 96%)",
    maxHeight: "90%",
    overflowY: "auto",
    background: "rgba(4,21,40,.94)",
    border: `1px solid ${UI.secondaryDark}`,
    borderRadius: "14px",
    padding: "20px 22px 24px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  });

  panel.append(
    el(
      "div",
      {
        fontSize: "13px",
        color: UI.accentHot,
        fontWeight: "700",
        letterSpacing: "0.04em",
      },
      "НОВЫЙ УРОВЕНЬ",
    ),
  );

  panel.append(
    el(
      "div",
      { fontSize: "14px", color: UI.textMuted },
      "Пул спавна линии",
    ),
  );

  const poolRow = el("div", {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "center",
    padding: "8px",
    background: "rgba(3,7,16,.45)",
    borderRadius: "10px",
  });

  const poolCounts = new Map<string, number>();
  const poolOrder: string[] = [];
  for (const id of opts.pool) {
    if (!poolCounts.has(id)) {
      poolOrder.push(id);
      poolCounts.set(id, 0);
    }
    poolCounts.set(id, (poolCounts.get(id) ?? 0) + 1);
  }

  for (const id of poolOrder) {
    const count = poolCounts.get(id) ?? 1;
    const chip = el("div", {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      padding: "6px",
      borderRadius: "8px",
      background: UI.bgPanel,
      border: `1px solid ${UI.secondaryDark}`,
      minWidth: "64px",
    });

    const stackWrap = el("div", {
      position: "relative",
      width: "40px",
      height: "36px",
      flexShrink: "0",
    });

    const layers = Math.min(3, count);
    for (let i = layers - 1; i >= 0; i--) {
      const sw = ballSwatch(id, 28);
      sw.style.position = "absolute";
      sw.style.left = `${i * 3}px`;
      sw.style.top = `${(layers - 1 - i) * 2}px`;
      sw.style.zIndex = String(i + 1);
      stackWrap.append(sw);
    }

    if (count > 1) {
      const badge = el(
        "div",
        {
          position: "absolute",
          right: "-4px",
          bottom: "-2px",
          zIndex: "10",
          minWidth: "18px",
          height: "18px",
          padding: "0 4px",
          borderRadius: "9px",
          background: UI.accent,
          color: UI.bg,
          fontSize: "10px",
          fontWeight: "800",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          border: `1px solid ${UI.secondaryDark}`,
        },
        `×${count}`,
      );
      stackWrap.append(badge);
    }

    chip.append(stackWrap);
    chip.append(
      el(
        "div",
        { fontSize: "10px", color: UI.textMuted, textAlign: "center" },
        getBallType(id)?.title ?? id,
      ),
    );
    poolRow.append(chip);
  }
  panel.append(poolRow);

  panel.append(
    el(
      "div",
      {
        fontSize: "16px",
        fontWeight: "700",
        textAlign: "center",
        marginTop: "4px",
      },
      "Добавить в линию",
    ),
  );

  const offerRow = el("div", {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    justifyContent: "center",
  });
  for (const id of opts.offer) {
    offerRow.append(
      typeCard(id, {
        selectable: true,
        onPick: () => opts.onPick(id),
      }),
    );
  }
  panel.append(offerRow);

  host.append(panel);

  return () => {
    host.innerHTML = "";
    host.style.display = "none";
    host.style.pointerEvents = "none";
  };
}

/** Full-width top EXP bar (5px). Rainbow overflow while level-up offer is open. */
export function mountExpBar(stage: HTMLElement): {
  root: HTMLElement;
  update: (opts: {
    level: number;
    exp: number;
    need: number;
    /** True while the level-up ball picker is open — bar floods with rainbow. */
    levelUpOpen?: boolean;
  }) => void;
} {
  const STYLE_ID = "exp-bar-rgb-style-v2";
  document.getElementById("exp-bar-rainbow-style")?.remove();
  document.getElementById(STYLE_ID)?.remove();
  {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes exp-bar-rgb-scroll {
        from { transform: translate3d(0, 0, 0); }
        to { transform: translate3d(-33.333%, 0, 0); }
      }
      .exp-bar-rgb-strip {
        position: absolute;
        inset: 0;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
      }
      .exp-bar-rgb-strip.is-on {
        opacity: 1;
      }
      .exp-bar-rgb-band {
        height: 100%;
        width: 300%;
        background: linear-gradient(
          90deg,
          #ff0040,
          #ff8000,
          #ffd800,
          #00e676,
          #00d4ff,
          #2979ff,
          #d500f9,
          #ff0040,
          #ff8000,
          #ffd800,
          #00e676,
          #00d4ff,
          #2979ff,
          #d500f9,
          #ff0040
        );
        will-change: transform;
        animation: exp-bar-rgb-scroll 0.35s linear infinite;
      }
    `;
    document.head.append(style);
  }

  const root = el("div", {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "5px",
    zIndex: "35",
    pointerEvents: "none",
    background: "rgba(4,21,40,.9)",
    overflow: "hidden",
  });

  const fill = el("div", {
    height: "100%",
    width: "0%",
    background: UI.accent,
    transition: "width 120ms linear",
  });

  const rgbStrip = document.createElement("div");
  rgbStrip.className = "exp-bar-rgb-strip";
  const rgbBand = document.createElement("div");
  rgbBand.className = "exp-bar-rgb-band";
  rgbStrip.append(rgbBand);

  root.append(fill, rgbStrip);
  stage.append(root);

  let lastKey = "";

  return {
    root,
    update(opts) {
      const need = Math.max(1, opts.need);
      const within = Math.max(0, Math.min(opts.exp, need));
      const open = Boolean(opts.levelUpOpen);
      const pct = open ? 100 : (within / need) * 100;
      const key = `${opts.level}|${within}|${need}|${open ? 1 : 0}`;
      if (key === lastKey) return;
      lastKey = key;

      if (open) {
        fill.style.width = "0%";
        fill.style.opacity = "0";
        rgbStrip.classList.add("is-on");
      } else {
        rgbStrip.classList.remove("is-on");
        fill.style.opacity = "1";
        fill.style.width = `${pct}%`;
      }
    },
  };
}

export { ballSwatch };
