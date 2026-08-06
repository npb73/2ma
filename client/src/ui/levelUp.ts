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

/** DOM EXP bar positioned under a cannon in stage-local coords. */
export function mountExpBar(stage: HTMLElement): {
  root: HTMLElement;
    update: (opts: {
      level: number;
      exp: number;
      need: number;
      /** Stage-local pixel position of cannon center. */
      cannonX: number;
      cannonY: number;
      stageW: number;
      stageH: number;
    }) => void;
  } {
  const root = el("div", {
    position: "absolute",
    zIndex: "15",
    pointerEvents: "none",
    transform: "translate(-50%, 0)",
    width: "96px",
  });

  const label = el("div", {
    fontSize: "11px",
    color: UI.text,
    textAlign: "center",
    marginBottom: "3px",
    textShadow: "0 1px 2px rgba(0,0,0,.8)",
  });

  const track = el("div", {
    height: "7px",
    borderRadius: "4px",
    background: "rgba(4,21,40,.85)",
    border: `1px solid ${UI.secondaryDark}`,
    overflow: "hidden",
  });
  const fill = el("div", {
    height: "100%",
    width: "0%",
    background: UI.accent,
    borderRadius: "3px",
    transition: "width 120ms linear",
  });
  track.append(fill);
  root.append(label, track);
  stage.append(root);

  let lastKey = {
    level: NaN,
    exp: NaN,
    need: NaN,
    left: "",
    top: "",
  };

  return {
    root,
    update(opts) {
      const need = Math.max(1, opts.need);
      const within = Math.max(0, Math.min(opts.exp, need));
      const pct = (within / need) * 100;
      const sx = (opts.cannonX / 1280) * opts.stageW;
      const sy = (opts.cannonY / 720) * opts.stageH;
      const left = `${sx}px`;
      const top = `${sy + 28}px`;
      const labelText = `ур. ${opts.level} · ${within}/${need}`;
      const widthPct = `${pct}%`;

      if (
        lastKey.level === opts.level &&
        lastKey.exp === opts.exp &&
        lastKey.need === need &&
        lastKey.left === left &&
        lastKey.top === top
      ) {
        return;
      }
      lastKey = {
        level: opts.level,
        exp: opts.exp,
        need,
        left,
        top,
      };

      label.textContent = labelText;
      fill.style.width = widthPct;
      root.style.left = left;
      root.style.top = top;
    },
  };
}

export { ballSwatch };
