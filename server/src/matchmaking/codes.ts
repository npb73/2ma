const codeToRoomId = new Map<string, string>();
const roomIdToCode = new Map<string, string>();

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function registerRoomCode(roomId: string, preferred?: string): string {
  unregisterRoomCode(roomId);
  let code = (preferred ?? randomCode()).toUpperCase();
  while (codeToRoomId.has(code)) {
    code = randomCode();
  }
  codeToRoomId.set(code, roomId);
  roomIdToCode.set(roomId, code);
  return code;
}

export function unregisterRoomCode(roomId: string): void {
  const code = roomIdToCode.get(roomId);
  if (code) {
    codeToRoomId.delete(code);
    roomIdToCode.delete(roomId);
  }
}

export function resolveRoomCode(code: string): string | undefined {
  return codeToRoomId.get(code.trim().toUpperCase());
}

export function getRoomCode(roomId: string): string | undefined {
  return roomIdToCode.get(roomId);
}
