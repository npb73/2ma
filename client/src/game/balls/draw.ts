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

/** Draw a ball onto a Graphics object (non-pipeline path). */
export function drawBallType(
  g: Phaser.GameObjects.Graphics,
  typeId: string,
  x: number,
  y: number,
  radius = BALL_RADIUS,
): void {
  const kind = getBallType(typeId)?.kind ?? "solid";
  const colors = ballDisplayColors(typeId);

  if (kind === "plasma") {
    drawPlasmaGraphics(g, colors, x, y, radius);
  } else if (kind === "explosive") {
    drawExplosiveGraphics(g, x, y, radius);
  } else if (kind === "ice") {
    drawIceGraphics(g, x, y, radius);
  } else {
    drawSolidGraphics(g, typeId, x, y, radius);
  }
}
