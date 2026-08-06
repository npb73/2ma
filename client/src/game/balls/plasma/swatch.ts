export function fillPlasmaSwatch(wrap: HTMLElement, colors: string[]): void {
  const core = colors[0] ?? "#d9243c";
  const glow = colors[1] ?? "#ffffe4";
  wrap.style.background = `radial-gradient(circle at 35% 35%, ${glow}, ${core} 70%)`;
}
