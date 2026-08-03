export interface UserInfo {
  id: string;
  displayName: string;
  rating: number;
  avatarUrl?: string;
}

export interface Session {
  token: string;
  user?: UserInfo;
}

const KEY = "2ma_session";

export function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(location.search);
  return params.get("token");
}

export function saveSession(token: string, user?: UserInfo): void {
  const data: Session = { token, user };
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
