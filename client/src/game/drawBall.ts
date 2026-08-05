import {
  BALL_COLORS,
  BALL_RADIUS,
  getBallType,
  ballDisplayColors,
} from "@2ma/shared";
import type Phaser from "phaser";

function hex(color: string): number {
  const c = color.startsWith("#") ? color.slice(1) : color;
  return parseInt(c, 16);
}

/** Draw a ball of any type onto a Phaser Graphics object. */
export function drawBallType(
  g: Phaser.GameObjects.Graphics,
  typeId: string,
  x: number,
  y: number,
  radius = BALL_RADIUS,
  fuse = -1,
): void {
  const kind = getBallType(typeId)?.kind ?? "solid";
  const colors = ballDisplayColors(typeId);

  const pie = (color: string, a0: number, a1: number) => {
    g.fillStyle(hex(color), 1);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, radius, a0, a1, false);
    g.closePath();
    g.fillPath();
  };

  if (kind === "dual" && colors.length >= 2) {
    pie(colors[0]!, Math.PI / 2, (Math.PI * 3) / 2);
    pie(colors[1]!, -Math.PI / 2, Math.PI / 2);
  } else if (kind === "rainbow") {
    const n = BALL_COLORS.length;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      pie(BALL_COLORS[i]!, a0, a1);
    }
  } else if (kind === "bomb") {
    g.fillStyle(hex("#293b49"), 1);
    g.fillCircle(x, y, radius);
    g.lineStyle(2, hex("#ff823b"), 1);
    g.strokeCircle(x, y, radius - 1);
    if (fuse >= 0) {
      const t = Math.min(1, Math.max(0, fuse / 5));
      g.lineStyle(3, hex("#ff6157"), 1);
      g.beginPath();
      g.arc(
        x,
        y,
        radius + 4,
        -Math.PI / 2,
        -Math.PI / 2 + t * Math.PI * 2,
        false,
      );
      g.strokePath();
    }
  } else {
    g.fillStyle(hex(colors[0] ?? BALL_COLORS[0]), 1);
    g.fillCircle(x, y, radius);
  }
}
