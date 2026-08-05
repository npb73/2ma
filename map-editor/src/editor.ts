import {
  UI,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  createDefaultMap,
  parseGameMap,
  type GameMap,
  type Point,
} from "@2ma/shared";

const HIT_R = 12;
const CANNON_HIT_R = 18;

export type DragTarget =
  | { kind: "point"; lane: number; index: number }
  | { kind: "cannon"; lane: number };

export type EditorState = {
  map: GameMap;
  activeLane: number;
  selectedPoint: number | null;
  drag: DragTarget | null;
  bgImage: HTMLImageElement | null;
  status: string;
  statusError: boolean;
};

type Listeners = {
  onChange: () => void;
};

function cloneMap(map: GameMap): GameMap {
  return structuredClone(map);
}

export function createEditorState(): EditorState {
  return {
    map: createDefaultMap(1),
    activeLane: 0,
    selectedPoint: null,
    drag: null,
    bgImage: null,
    status: "Готово",
    statusError: false,
  };
}

export class MapEditor {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  state: EditorState;
  private listeners: Listeners;

  constructor(canvas: HTMLCanvasElement, listeners: Listeners) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.state = createEditorState();
    this.listeners = listeners;
    canvas.width = WORLD_WIDTH;
    canvas.height = WORLD_HEIGHT;
    this.bind();
    void this.loadBackgroundImage(this.state.map.background);
    this.draw();
  }

  private notify(): void {
    this.listeners.onChange();
    this.draw();
  }

  setStatus(msg: string, error = false): void {
    this.state.status = msg;
    this.state.statusError = error;
    this.listeners.onChange();
  }

  getMap(): GameMap {
    return this.state.map;
  }

  setName(name: string): void {
    this.state.map.name = name;
    this.notify();
  }

  setPlayers(players: 1 | 2): void {
    const map = this.state.map;
    if (map.players === players) return;
    if (players === 2 && map.lanes.length === 1) {
      const dual = createDefaultMap(2);
      map.lanes.push(dual.lanes[1]);
    } else if (players === 1 && map.lanes.length > 1) {
      map.lanes = [map.lanes[0]];
      this.state.activeLane = 0;
    }
    map.players = players;
    this.state.selectedPoint = null;
    this.notify();
  }

  setActiveLane(index: number): void {
    if (index < 0 || index >= this.state.map.lanes.length) return;
    this.state.activeLane = index;
    this.state.selectedPoint = null;
    this.notify();
  }

  clearActivePath(): void {
    const lane = this.state.map.lanes[this.state.activeLane];
    if (!lane) return;
    lane.path = [];
    this.state.selectedPoint = null;
    this.setStatus("Путь очищен");
    this.notify();
  }

  async setBackgroundFromFile(file: File): Promise<void> {
    const dataUrl = await readFileAsDataUrl(file);
    this.state.map.background = dataUrl;
    await this.loadBackgroundImage(dataUrl);
    this.setStatus(`Фон: ${file.name}`);
    this.notify();
  }

  clearBackground(): void {
    this.state.map.background = null;
    this.state.bgImage = null;
    this.setStatus("Фон убран");
    this.notify();
  }

  private async loadBackgroundImage(src: string | null): Promise<void> {
    if (!src) {
      this.state.bgImage = null;
      return;
    }
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Не удалось загрузить фон"));
      img.src = src;
    });
    this.state.bgImage = img;
  }

  downloadMap(): void {
    const map = this.state.map;
    if (map.lanes.some((l) => l.path.length < 2)) {
      this.setStatus("У каждой линии нужно минимум 2 точки пути", true);
      this.notify();
      return;
    }
    const blob = new Blob([JSON.stringify(map, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    const safe = map.name.replace(/[^\w\-а-яёА-ЯЁ]+/gi, "_") || "map";
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.setStatus("Карта сохранена");
    this.notify();
  }

  async loadMapFromFile(file: File): Promise<void> {
    const text = await file.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.setStatus("Невалидный JSON", true);
      this.notify();
      return;
    }
    try {
      const map = parseGameMap(raw);
      this.state.map = cloneMap(map);
      this.state.activeLane = 0;
      this.state.selectedPoint = null;
      this.state.drag = null;
      await this.loadBackgroundImage(map.background);
      this.setStatus(`Загружено: ${map.name}`);
      this.notify();
    } catch (e) {
      this.setStatus(e instanceof Error ? e.message : "Ошибка загрузки", true);
      this.notify();
    }
  }

  newMap(players: 1 | 2 = 1): void {
    this.state = createEditorState();
    this.state.map = createDefaultMap(players);
    void this.loadBackgroundImage(null).then(() => this.notify());
    this.setStatus("Новая карта");
    this.notify();
  }

  private bind(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    c.addEventListener("pointermove", (e) => this.onPointerMove(e));
    c.addEventListener("pointerup", (e) => this.onPointerUp(e));
    c.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    c.addEventListener("dblclick", (e) => this.onDblClick(e));
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  private worldFromClient(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * WORLD_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * WORLD_HEIGHT;
    return {
      x: clamp(x, 0, WORLD_WIDTH),
      y: clamp(y, 0, WORLD_HEIGHT),
    };
  }

  private worldFromEvent(e: PointerEvent | MouseEvent): Point {
    return this.worldFromClient(e.clientX, e.clientY);
  }

  private hitTest(p: Point): DragTarget | null {
    const laneIdx = this.state.activeLane;
    const lane = this.state.map.lanes[laneIdx];
    if (!lane) return null;

    if (dist(p, lane.cannon) <= CANNON_HIT_R) {
      return { kind: "cannon", lane: laneIdx };
    }
    for (let i = lane.path.length - 1; i >= 0; i--) {
      if (dist(p, lane.path[i]) <= HIT_R) {
        return { kind: "point", lane: laneIdx, index: i };
      }
    }
    return null;
  }

  private deletePathPoint(laneIdx: number, index: number): void {
    const lane = this.state.map.lanes[laneIdx];
    if (!lane || index < 0 || index >= lane.path.length) return;
    lane.path.splice(index, 1);
    if (this.state.activeLane === laneIdx) {
      this.state.selectedPoint =
        lane.path.length === 0 ? null : Math.min(index, lane.path.length - 1);
    }
    this.state.drag = null;
    this.notify();
  }

  /** Insert a point after `index`, offset toward the next segment (or ahead of the end). */
  private insertPointNear(laneIdx: number, index: number): void {
    const lane = this.state.map.lanes[laneIdx];
    if (!lane || index < 0 || index >= lane.path.length) return;
    const cur = lane.path[index];
    let next: Point;
    if (index < lane.path.length - 1) {
      const b = lane.path[index + 1];
      next = {
        x: Math.round((cur.x + b.x) / 2),
        y: Math.round((cur.y + b.y) / 2),
      };
    } else if (index > 0) {
      const prev = lane.path[index - 1];
      let dx = cur.x - prev.x;
      let dy = cur.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * 40;
      dy = (dy / len) * 40;
      next = {
        x: Math.round(clamp(cur.x + dx, 0, WORLD_WIDTH)),
        y: Math.round(clamp(cur.y + dy, 0, WORLD_HEIGHT)),
      };
    } else {
      next = {
        x: Math.round(clamp(cur.x + 40, 0, WORLD_WIDTH)),
        y: Math.round(cur.y),
      };
    }
    const insertAt = index + 1;
    lane.path.splice(insertAt, 0, next);
    this.state.activeLane = laneIdx;
    this.state.selectedPoint = insertAt;
    this.state.drag = null;
    this.notify();
  }

  private onPointerDown(e: PointerEvent): void {
    // RMB — delete path point
    if (e.button === 2) {
      e.preventDefault();
      const p = this.worldFromEvent(e);
      const hit = this.hitTest(p);
      if (hit?.kind === "point") {
        this.deletePathPoint(hit.lane, hit.index);
      }
      return;
    }
    if (e.button !== 0) return;

    this.canvas.setPointerCapture(e.pointerId);
    const p = this.worldFromEvent(e);
    const hit = this.hitTest(p);
    if (hit) {
      this.state.drag = hit;
      if (hit.kind === "point") this.state.selectedPoint = hit.index;
      else this.state.selectedPoint = null;
      this.notify();
      return;
    }
    const lane = this.state.map.lanes[this.state.activeLane];
    if (!lane) return;
    lane.path.push({ x: Math.round(p.x), y: Math.round(p.y) });
    this.state.selectedPoint = lane.path.length - 1;
    this.state.drag = {
      kind: "point",
      lane: this.state.activeLane,
      index: this.state.selectedPoint,
    };
    this.notify();
  }

  private onDblClick(e: MouseEvent): void {
    e.preventDefault();
    const p = this.worldFromEvent(e);
    const hit = this.hitTest(p);
    if (hit?.kind === "point") {
      this.insertPointNear(hit.lane, hit.index);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.state.drag;
    if (!drag) return;
    const p = this.worldFromEvent(e);
    const lane = this.state.map.lanes[drag.lane];
    if (!lane) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (drag.kind === "cannon") {
      lane.cannon = { x, y };
    } else {
      lane.path[drag.index] = { x, y };
    }
    this.draw();
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.state.drag) {
      this.state.drag = null;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.notify();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const idx = this.state.selectedPoint;
    if (idx === null) return;
    e.preventDefault();
    this.deletePathPoint(this.state.activeLane, idx);
  }

  draw(): void {
    const { ctx, state } = this;
    const { map, bgImage, activeLane, selectedPoint } = state;

    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } else {
      ctx.fillStyle = UI.bg;
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    // Dim overlay so paths stay readable on busy backgrounds
    if (bgImage) {
      ctx.fillStyle = "rgba(3, 7, 16, 0.25)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    map.lanes.forEach((lane, i) => {
      const active = i === activeLane;
      this.drawLane(lane, i, active, active ? selectedPoint : null);
    });

    ctx.fillStyle = UI.textMuted;
    ctx.font = "12px sans-serif";
    ctx.fillText(`${WORLD_WIDTH}×${WORLD_HEIGHT}`, 10, WORLD_HEIGHT - 10);
  }

  private drawLane(
    lane: GameMap["lanes"][number],
    index: number,
    active: boolean,
    selectedPoint: number | null,
  ): void {
    const { ctx } = this;
    const color = index === 0 ? "#1c92a7" : "#ff823b";
    const pathColor = active ? color : UI.path;
    const alpha = active ? 1 : 0.45;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (lane.path.length >= 2) {
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = active ? 10 : 7;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(lane.path[0].x, lane.path[0].y);
      for (let i = 1; i < lane.path.length; i++) {
        ctx.lineTo(lane.path[i].x, lane.path[i].y);
      }
      ctx.stroke();
    } else if (lane.path.length === 1) {
      ctx.fillStyle = pathColor;
      ctx.beginPath();
      ctx.arc(lane.path[0].x, lane.path[0].y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < lane.path.length; i++) {
      const p = lane.path[i];
      const selected = active && selectedPoint === i;
      const isSpawn = i === 0;
      const isHole = i === lane.path.length - 1 && lane.path.length >= 2;

      if (isHole) {
        ctx.fillStyle = UI.hole;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffe4";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = selected ? UI.accent : isSpawn ? "#ffd832" : "#ffffe4";
      ctx.strokeStyle = "#030710";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, selected ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (active) {
        ctx.fillStyle = UI.text;
        ctx.font = "11px sans-serif";
        ctx.fillText(String(i), p.x + 10, p.y - 10);
      }
    }

    // Cannon
    const c = lane.cannon;
    ctx.fillStyle = UI.cannon;
    ctx.strokeStyle = active ? color : "#293b49";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#030710";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    ctx.fill();

    if (active) {
      ctx.fillStyle = color;
      ctx.font = "12px sans-serif";
      ctx.fillText(`Пушка ${index === 0 ? "A" : "B"}`, c.x + 18, c.y + 4);
    }

    ctx.restore();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
