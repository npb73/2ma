import { UI } from "@2ma/shared";
import { getTokenFromUrl, loadSession, saveSession, clearSession } from "./auth";
import { createLobbyUi } from "./ui/lobby";
import { startGame } from "./game/GameApp";

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;

  document.body.style.background = UI.bg;

  const fromUrl = getTokenFromUrl();
  if (fromUrl) {
    saveSession(fromUrl);
    history.replaceState({}, "", "/");
  }

  let session = loadSession();

  if (session?.token) {
    try {
      const me = await fetch("/auth/me", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!me.ok) throw new Error("bad token");
      const data = (await me.json()) as {
        user: { id: string; displayName: string; rating: number; avatarUrl?: string };
      };
      session = { token: session.token, user: data.user };
      saveSession(session.token, data.user);
    } catch {
      clearSession();
      session = null;
    }
  }

  const statusRes = await fetch("/auth/status");
  const status = (await statusRes.json()) as {
    yandexEnabled: boolean;
    devAuth: boolean;
  };

  createLobbyUi(root, {
    session,
    status,
    onLogout: () => {
      clearSession();
      location.reload();
    },
    onPlay: async (mode, code) => {
      if (!session?.token) return;
      await startGame(root, {
        token: session.token,
        user: session.user!,
        mode,
        code,
      });
    },
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff6157;padding:24px">${String(err)}</pre>`;
});
