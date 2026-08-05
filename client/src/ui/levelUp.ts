import {
  BALL_COLORS,
  UI,
  ballDisplayColors,
  getBallType,
  type BallTypeDef,
} from "@2ma/shared";

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

function ballSwatch(typeId: string, size = 36): HTMLElement {
  const colors = ballDisplayColors(typeId);
  const kind = getBallType(typeId)?.kind ?? "solid";
  const wrap = el("div", {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    flexShrink: "0",
    boxSizing: "border-box",
    border: `2px solid ${UI.secondaryDark}`,
    overflow: "hidden",
    position: "relative",
  });

  if (kind === "dual" && colors.length >= 2) {
    wrap.style.background = `linear-gradient(90deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  } else if (kind === "rainbow") {
    wrap.style.background = `conic-gradient(${BALL_COLORS.join(",")})`;
  } else if (kind === "bomb") {
    wrap.style.background = "#293b49";
    const mark = el(
      "div",
      {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: UI.accentHot,
        fontSize: `${Math.max(10, size * 0.4)}px`,
        fontWeight: "800",
      },
      "B",
    );
    wrap.append(mark);
  } else {
    wrap.style.background = colors[0] ?? BALL_COLORS[0];
  }
  return wrap;
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
 * Level-up modal: pool preview on top, 3 offer cards in the center.
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
      "Ваш пулл шаров",
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
  for (const id of opts.pool) {
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
    chip.append(ballSwatch(id, 28));
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
      "Выберите новый шар",
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

  return {
    root,
    update(opts) {
      const need = Math.max(1, opts.need);
      const within = Math.max(0, Math.min(opts.exp, need));
      const pct = (within / need) * 100;
      label.textContent = `ур. ${opts.level} · ${within}/${need}`;
      fill.style.width = `${pct}%`;
      const sx = (opts.cannonX / 1280) * opts.stageW;
      const sy = (opts.cannonY / 720) * opts.stageH;
      root.style.left = `${sx}px`;
      root.style.top = `${sy + 28}px`;
    },
  };
}

export { ballSwatch };
