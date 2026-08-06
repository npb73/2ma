import {
  BALL_RADIUS,
  ballDisplayColors,
  getBallType,
} from "@2ma/shared";
import Phaser from "phaser";

import { drawExplosiveGraphics } from "./explosive";
import { drawIceGraphics } from "./ice";
import { drawPlasmaGraphics } from "./plasma";
import { drawSolidGraphics } from "./solid";
import { drawStoneGraphics } from "./stone";
import { drawVolunGraphics } from "./volun";

/** Draw a ball onto a Graphics object (non-pipeline path). */
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

  if (kind === "plasma") {
    drawPlasmaGraphics(g, colors, x, y, radius);
  } else if (kind === "explosive") {
    drawExplosiveGraphics(g, x, y, radius);
  } else if (kind === "ice") {
    drawIceGraphics(g, x, y, radius);
  } else if (kind === "volun") {
    drawVolunGraphics(g, colors, x, y, radius);
  } else if (kind === "stone") {
    drawStoneGraphics(g, x, y, radius, fuse);
  } else {
    drawSolidGraphics(g, typeId, x, y, radius);
  }
}
