import { getBallType } from "./catalog.js";
import { BALL_COLORS } from "./types.js";

export function ballDisplayColors(typeId: string): string[] {
  const t = getBallType(typeId);
  if (!t) return [BALL_COLORS[0]!];
  if (t.kind === "stone") return ["#6d8a8d"];
  if (t.kind === "explosive") return ["#ff823b", "#d9243c"];
  if (t.kind === "ice") return ["#77d6c1", "#1c92a7"];
  if (t.kind === "plasma") {
    const base = t.colors[0] !== undefined ? BALL_COLORS[t.colors[0]]! : BALL_COLORS[0]!;
    return [base, "#ffffe4"];
  }
  if (t.kind === "volun") {
    const base = t.colors[0] !== undefined ? BALL_COLORS[t.colors[0]]! : BALL_COLORS[0]!;
    return [base, "#73392e"];
  }
  return t.colors.map((c) => BALL_COLORS[c]!);
}
