import { CARDS, UI } from "@2ma/shared";
import type { Session, UserInfo } from "../auth";
import { saveSession } from "../auth";

export type PlayMode = "queue" | "create" | "join";

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
  const wrap = el("div", {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    background: `radial-gradient(ellipse at top, ${UI.bgPanel}, ${UI.bg})`,
    color: UI.text,
    boxSizing: "border-box",
    padding: "32px",
  });

  const title = el("h1", {
    margin: "0",
    fontSize: "48px",
    letterSpacing: "0.08em",
    color: UI.accent,
  }, "2MA");
  const subtitle = el("p", {
    margin: "0 0 12px",
    color: UI.textMuted,
    fontSize: "16px",
  }, "Рейтинговый Zuma · 1v1");

  wrap.append(title, subtitle);

  if (!opts.session?.token) {
    if (opts.status.yandexEnabled) {
      const yandexBtn = button("Войти через Яндекс ID", () => {
        location.href = "/auth/yandex";
      });
      wrap.append(yandexBtn);
    }
    if (opts.status.devAuth) {
      const nameInput = el("input", {
        width: "260px",
        padding: "10px 12px",
        borderRadius: "8px",
        border: `1px solid ${UI.secondaryDark}`,
        background: UI.bgPanel,
        color: UI.text,
        fontSize: "14px",
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
      });
      wrap.append(nameInput, devBtn);
    }
    if (!opts.status.yandexEnabled && !opts.status.devAuth) {
      wrap.append(
        el("p", { color: UI.accent }, "Auth не настроен. Включите DEV_AUTH или Yandex OAuth."),
      );
    }
    root.append(wrap);
    return;
  }

  const user = opts.session.user;
  const profile = el("div", {
    display: "flex",
    gap: "16px",
    alignItems: "center",
    marginBottom: "8px",
  });
  profile.append(
    el("div", { color: UI.text, fontSize: "18px" }, user?.displayName ?? "Игрок"),
    el("div", { color: UI.accentHot, fontSize: "18px", fontWeight: "700" }, `★ ${user?.rating ?? "—"}`),
  );
  wrap.append(profile);

  const status = el("div", {
    minHeight: "24px",
    color: UI.secondary,
    fontSize: "14px",
  });

  const queueBtn = button("Поиск соперника", async () => {
    status.textContent = "Поиск…";
    try {
      await opts.onPlay("queue");
    } catch (e) {
      status.textContent = String(e);
    }
  });

  const createBtn = button("Создать комнату", async () => {
    status.textContent = "Создание комнаты…";
    try {
      await opts.onPlay("create");
    } catch (e) {
      status.textContent = String(e);
    }
  });

  const codeRow = el("div", {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  });
  const codeInput = el("input", {
    width: "140px",
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
  const joinBtn = button("Войти по коду", async () => {
    status.textContent = "Подключение…";
    try {
      await opts.onPlay("join", codeInput.value.trim());
    } catch (e) {
      status.textContent = String(e);
    }
  });
  codeRow.append(codeInput, joinBtn);

  const logout = button("Выйти", opts.onLogout, true);

  const hint = el("p", {
    margin: "24px 0 0",
    maxWidth: "420px",
    textAlign: "center",
    color: UI.secondary,
    fontSize: "13px",
    lineHeight: "1.45",
  }, `Карты: ${CARDS.map((c) => c.title).join(" · ")}. ЛКМ — выстрел, Tab — цель (своя/чужая цепочка).`);

  wrap.append(queueBtn, createBtn, codeRow, status, logout, hint);
  root.append(wrap);
}

function button(label: string, onClick: () => void, ghost = false): HTMLButtonElement {
  const btn = el("button", {
    padding: "12px 20px",
    borderRadius: "10px",
    border: ghost ? `1px solid ${UI.secondaryDark}` : "none",
    background: ghost ? "transparent" : UI.accent,
    color: ghost ? UI.textMuted : UI.bg,
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    minWidth: "220px",
  }, label) as HTMLButtonElement;
  btn.onclick = onClick;
  return btn;
}
