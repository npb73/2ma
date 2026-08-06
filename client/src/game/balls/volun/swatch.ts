export function fillVolunSwatch(wrap: HTMLElement, colors: string[]): void {
  const base = colors[0] ?? "#d9243c";
  const rim = colors[1] ?? "#73392e";
  wrap.style.background = `radial-gradient(circle, ${base} 55%, ${rim} 100%)`;
}
