import { UI } from "@2ma/shared";
import type { Session, UserInfo } from "../auth";
import { saveSession } from "../auth";
import { mountGraphicsSettings } from "./graphicsSettings";

export type PlayMode = "queue" | "create" | "join" | "solo";

interface LobbyOptions {
  session: Session | null;
  status: { yandexEnabled: boolean; devAuth: boolean };
  onLogout: () => void;
  onPlay: (mode: PlayMode, code?: string) => Promise<void>;
}

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

export function createLobbyUi(root: HTMLElement, opts: LobbyOptions): void {
  root.innerHTML = "";
  const loggedIn = Boolean(opts.session?.token);
  const user = opts.session?.user;

  const wrap = el("div", {
    width: "100%",
    height: "100%",
    position: "relative",
    background: `radial-gradient(ellipse at top, ${UI.bgPanel}, ${UI.bg})`,
    color: UI.text,
    boxSizing: "border-box",
    overflow: "hidden",
  });

  // Top-right: settings
  const topBar = el("div", {
    position: "absolute",
    top: "20px",
    right: "20px",
    zIndex: "2",
  });
  const graphicsUi = mountGraphicsSettings(root);
  const settingsBtn = button("Настройки", () => graphicsUi.toggle(), true);
  settingsBtn.style.minWidth = "0";
  settingsBtn.style.padding = "10px 16px";
  topBar.append(settingsBtn);

  // Center: brand + primary actions
  const center = el("div", {
    position: "absolute",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    padding: "32px",
    boxSizing: "border-box",
    pointerEvents: "none",
  });

  const title = el(
    "h1",
    {
      margin: "0",
      fontSize: "56px",
      letterSpacing: "0.1em",
      color: UI.accent,
      pointerEvents: "none",
    },
    "2MA",
  );
  const subtitle = el(
    "p",
    {
      margin: "0 0 20px",
      color: UI.textMuted,
      fontSize: "16px",
      pointerEvents: "none",
    },
    "Zuma · одиночная и рейтинговая 1v1",
  );

  const status = el("div", {
    minHeight: "22px",
    color: UI.secondary,
    fontSize: "14px",
    pointerEvents: "none",
  });

  const actions = el("div", {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    pointerEvents: "auto",
  });

  const soloBtn = button("Одиночная игра", async () => {
    status.textContent = "";
    try {
      await opts.onPlay("solo");
    } catch (e) {
      status.textContent = String(e);
    }
  });

  const queueBtn = button("Поиск игры", async () => {
    if (!loggedIn) return;
    status.textContent = "Поиск…";
    try {
      await opts.onPlay("queue");
    } catch (e) {
      status.textContent = String(e);
    }
  });
  if (!loggedIn) {
    queueBtn.disabled = true;
    queueBtn.style.opacity = "0.4";
    queueBtn.style.cursor = "not-allowed";
    queueBtn.title = "Войдите, чтобы искать соперника";
  }

  actions.append(soloBtn, queueBtn);

  if (loggedIn) {
    const secondary = el("div", {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
      marginTop: "8px",
      pointerEvents: "auto",
    });

    const createBtn = button("Создать комнату", async () => {
      status.textContent = "Создание комнаты…";
      try {
        await opts.onPlay("create");
      } catch (e) {
        status.textContent = String(e);
      }
    }, true);
    createBtn.style.minWidth = "220px";

    const codeRow = el("div", {
      display: "flex",
      gap: "8px",
      alignItems: "center",
    });
    const codeInput = el("input", {
      width: "120px",
      padding: "10px 12px",
      borderRadius: "8px",
      border: `1px solid ${UI.secondaryDark}`,
      background: UI.bgPanel,
      color: UI.text,
      fontSize: "14px",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
    }) as HTMLInputElement;
    codeInput.placeholder = "КОД";
    const joinBtn = button("Войти", async () => {
      status.textContent = "Подключение…";
      try {
        await opts.onPlay("join", codeInput.value.trim());
      } catch (e) {
        status.textContent = String(e);
      }
    }, true);
    joinBtn.style.minWidth = "0";
    joinBtn.style.padding = "10px 14px";
    codeRow.append(codeInput, joinBtn);
    secondary.append(createBtn, codeRow);
    actions.append(secondary);
  }

  center.append(title, subtitle, actions, status);

  // Bottom-left: user / auth
  const userPanel = el("div", {
    position: "absolute",
    left: "20px",
    bottom: "20px",
    zIndex: "2",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxWidth: "min(360px, calc(100% - 40px))",
  });

  if (loggedIn) {
    const profile = el("div", {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      padding: "12px 14px",
      background: "rgba(4,21,40,.72)",
      borderRadius: "10px",
      border: `1px solid ${UI.secondaryDark}`,
    });
    profile.append(
      el(
        "div",
        { fontSize: "16px", fontWeight: "600", color: UI.text },
        user?.displayName ?? "Игрок",
      ),
      el(
        "div",
        { fontSize: "15px", color: UI.accentHot, fontWeight: "700" },
        `★ ${user?.rating ?? "—"}`,
      ),
    );
    const logout = button("Выйти", opts.onLogout, true);
    logout.style.minWidth = "0";
    logout.style.padding = "8px 14px";
    logout.style.alignSelf = "flex-start";
    userPanel.append(profile, logout);
  } else {
    const guest = el("div", {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "12px 14px",
      background: "rgba(4,21,40,.72)",
      borderRadius: "10px",
      border: `1px solid ${UI.secondaryDark}`,
    });
    guest.append(
      el("div", { fontSize: "16px", fontWeight: "600" }, "Гость"),
      el(
        "div",
        { fontSize: "13px", color: UI.textMuted, lineHeight: "1.4" },
        "Одиночная игра доступна без входа. Для поиска соперника войдите в аккаунт.",
      ),
    );

    const authRow = el("div", {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      alignItems: "stretch",
    });

    if (opts.status.yandexEnabled) {
      const yandexBtn = button("Войти через Яндекс ID", () => {
        location.href = "/auth/yandex";
      });
      yandexBtn.style.minWidth = "0";
      yandexBtn.style.width = "100%";
      authRow.append(yandexBtn);
    }
    if (opts.status.devAuth) {
      const nameInput = el("input", {
        width: "100%",
        padding: "10px 12px",
        borderRadius: "8px",
        border: `1px solid ${UI.secondaryDark}`,
        background: UI.bgPanel,
        color: UI.text,
        fontSize: "14px",
        boxSizing: "border-box",
      }) as HTMLInputElement;
      nameInput.placeholder = "Имя для DEV входа";
      const devBtn = button("DEV вход", async () => {
        const res = await fetch("/auth/dev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nameInput.value }),
        });
        if (!res.ok) {
          alert("DEV auth failed");
          return;
        }
        const data = (await res.json()) as { token: string; user: UserInfo };
        saveSession(data.token, data.user);
        location.reload();
      }, true);
      devBtn.style.minWidth = "0";
      devBtn.style.width = "100%";
      authRow.append(nameInput, devBtn);
    }
    if (!opts.status.yandexEnabled && !opts.status.devAuth) {
      authRow.append(
        el(
          "div",
          { fontSize: "13px", color: UI.accent },
          "Auth не настроен. Включите DEV_AUTH или Yandex OAuth.",
        ),
      );
    }

    guest.append(authRow);
    userPanel.append(guest);
  }

  wrap.append(topBar, center, userPanel);
  root.append(wrap);
}

function button(
  label: string,
  onClick: () => void,
  ghost = false,
): HTMLButtonElement {
  const btn = el(
    "button",
    {
      padding: "12px 20px",
      borderRadius: "10px",
      border: ghost ? `1px solid ${UI.secondaryDark}` : "none",
      background: ghost ? "transparent" : UI.accent,
      color: ghost ? UI.textMuted : UI.bg,
      fontSize: "15px",
      fontWeight: "600",
      cursor: "pointer",
      minWidth: "220px",
    },
    label,
  ) as HTMLButtonElement;
  btn.type = "button";
  btn.onclick = onClick;
  return btn;
}
