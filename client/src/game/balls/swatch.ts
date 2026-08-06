import {
  BALL_COLORS,
  UI,
  ballDisplayColors,
  getBallType,
} from "@2ma/shared";

import { fillExplosiveSwatch } from "./explosive";
import { fillIceSwatch } from "./ice";
import { fillPlasmaSwatch } from "./plasma";
import { fillSolidSwatch } from "./solid";
import { fillStoneSwatch } from "./stone";
import { fillVolunSwatch } from "./volun";

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

export function ballSwatch(typeId: string, size = 36): HTMLElement {
  const colors = ballDisplayColors(typeId);
  const kind = getBallType(typeId)?.kind ?? "solid";
  const wrap = el("div", {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    flexShrink: "0",
    boxSizing: "border-box",
    border: `2px solid ${UI.secondaryDark}`,
    overflow: "hidden",
    position: "relative",
  });

  if (kind === "plasma") {
    fillPlasmaSwatch(wrap, colors);
  } else if (kind === "explosive") {
    fillExplosiveSwatch(wrap);
  } else if (kind === "ice") {
    fillIceSwatch(wrap);
  } else if (kind === "volun") {
    fillVolunSwatch(wrap, colors);
  } else if (kind === "stone") {
    fillStoneSwatch(wrap);
  } else {
    fillSolidSwatch(wrap, colors[0] ?? BALL_COLORS[0]!);
  }
  return wrap;
}
