import { UI } from "@2ma/shared";
import {
  loadSettings,
  saveSettings,
  type ClientSettings,
} from "../settings";

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

export interface GraphicsSettingsHandle {
  /** True while the modal is open. */
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  dispose: () => void;
}

/**
 * Graphics settings: Сглаживание + Красивые шары.
 * Works in lobby and in-game (Escape).
 */
export function mountGraphicsSettings(
  host: HTMLElement,
  opts?: {
    /** Called after settings are saved (so the game can apply live). */
    onApply?: (settings: ClientSettings) => void;
  },
): GraphicsSettingsHandle {
  let backdrop: HTMLElement | null = null;
  let draft: ClientSettings = loadSettings();

  const close = () => {
    backdrop?.remove();
    backdrop = null;
  };

  const open = () => {
    if (backdrop) return;
    draft = loadSettings();

    backdrop = el("div", {
      position: "fixed",
      inset: "0",
      zIndex: "100",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(3,7,16,.72)",
      padding: "24px",
      boxSizing: "border-box",
    });
    backdrop.dataset.graphicsSettings = "1";

    const panel = el("div", {
      width: "min(100%, 360px)",
      background: UI.bgPanel,
      border: `1px solid ${UI.secondaryDark}`,
      borderRadius: "12px",
      padding: "24px",
      boxSizing: "border-box",
      color: UI.text,
    });

    panel.append(
      el(
        "div",
        {
          fontSize: "20px",
          fontWeight: "700",
          marginBottom: "6px",
          color: UI.accent,
        },
        "Графика",
      ),
      el(
        "p",
        {
          margin: "0 0 16px",
          fontSize: "13px",
          lineHeight: "1.45",
          color: UI.textMuted,
        },
        "Настройки применяются сразу.",
      ),
    );

    const list = el("div", {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      marginBottom: "20px",
    });

    const addToggle = (
      key: keyof ClientSettings,
      label: string,
      detail: string,
    ) => {
      const row = el("button", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "12px 14px",
        borderRadius: "8px",
        border: `1px solid ${UI.secondaryDark}`,
        background: "transparent",
        color: UI.text,
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer",
        boxSizing: "border-box",
        textAlign: "left",
      }) as HTMLButtonElement;
      row.type = "button";

      const textCol = el("div", {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: "0",
      });
      textCol.append(
        el("div", { fontWeight: "700" }, label),
        el(
          "div",
          {
            fontSize: "12px",
            fontWeight: "500",
            color: UI.textMuted,
            lineHeight: "1.35",
          },
          detail,
        ),
      );

      const badge = el("div", {
        flexShrink: "0",
        minWidth: "44px",
        padding: "4px 10px",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: "700",
        textAlign: "center",
      });

      const paint = () => {
        const on = draft[key];
        badge.textContent = on ? "Вкл" : "Выкл";
        badge.style.background = on ? UI.accent : UI.secondaryDark;
        badge.style.color = on ? UI.bg : UI.textMuted;
        row.style.borderColor = on ? UI.accent : UI.secondaryDark;
      };

      row.append(textCol, badge);
      row.onclick = () => {
        draft = { ...draft, [key]: !draft[key] };
        paint();
      };
      paint();
      list.append(row);
    };

    addToggle(
      "antialias",
      "Сглаживание",
      "Макс. качество под экран; выкл — Full HD",
    );
    addToggle(
      "prettyBalls",
      "Красивые шары",
      "Эффект объёма (fisheye) на шарах",
    );

    const actions = el("div", {
      display: "flex",
      gap: "8px",
      justifyContent: "flex-end",
    });

    const mkBtn = (label: string, primary: boolean, onClick: () => void) => {
      const b = el("button", {
        flex: "1",
        minWidth: "0",
        padding: "10px 14px",
        borderRadius: "8px",
        border: primary ? `1px solid ${UI.accent}` : `1px solid ${UI.secondaryDark}`,
        background: primary ? UI.accent : "transparent",
        color: primary ? UI.bg : UI.text,
        fontSize: "14px",
        fontWeight: "700",
        cursor: "pointer",
      }) as HTMLButtonElement;
      b.type = "button";
      b.textContent = label;
      b.onclick = onClick;
      return b;
    };

    actions.append(
      mkBtn("Отмена", false, close),
      mkBtn("Сохранить", true, () => {
        const saved = saveSettings(draft);
        opts?.onApply?.(saved);
        close();
      }),
    );

    panel.append(list, actions);
    backdrop.append(panel);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    host.append(backdrop);
  };

  return {
    isOpen: () => backdrop !== null,
    open,
    close,
    toggle: () => {
      if (backdrop) close();
      else open();
    },
    dispose: close,
  };
}
