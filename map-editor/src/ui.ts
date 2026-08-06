import {
  MAP_ASPECTS,
  MAP_BG_PALETTE,
  findMapAspect,
  type MapAspectId,
  type MapBgColor,
} from "@2ma/shared";
import type { MapEditor } from "./editor";

export type SyncUi = () => void;

export function mountUi(root: HTMLElement, editor: MapEditor): SyncUi {
  const aspectOptions = MAP_ASPECTS.map(
    (a) => `<option value="${a.id}">${a.label} (${a.width}×${a.height})</option>`,
  ).join("");

  const swatches = MAP_BG_PALETTE.map(
    (c) =>
      `<button type="button" class="swatch" data-bg="${c}" title="${c}" style="background:${c}"></button>`,
  ).join("");

  root.innerHTML = `
    <header class="toolbar">
      <h1>2MA MAP</h1>
      <label class="field">Имя
        <input type="text" id="map-name" maxlength="64" />
      </label>
      <label class="field">Игроки
        <select id="map-players">
          <option value="1">1 игрок</option>
          <option value="2">2 игрока</option>
        </select>
      </label>
      <label class="field">Пропорции
        <select id="map-aspect">
          ${aspectOptions}
        </select>
      </label>
      <div class="field" id="lane-switch" hidden>
        <button type="button" class="btn active" data-lane="0">Линия A</button>
        <button type="button" class="btn" data-lane="1">Линия B</button>
      </div>
      <button type="button" class="btn" id="btn-clear-path">Очистить путь</button>
      <button type="button" class="btn" id="btn-new">Новая</button>
      <button type="button" class="btn" id="btn-load">Загрузить…</button>
      <button type="button" class="btn btn-accent" id="btn-save">Сохранить</button>
      <p class="hint">Клик — точка · drag — двигать · двойной клик — вставить · ПКМ — удалить · 2p — зеркало</p>
      <input type="file" id="file-map" class="hidden-file" accept="application/json,.json" />
    </header>
    <div class="bg-row">
      <span class="bg-label">Фон</span>
      <div class="palette" id="bg-palette">${swatches}</div>
    </div>
    <p class="status" id="status" style="padding: 6px 16px; margin: 0;"></p>
    <div class="stage-wrap">
      <div class="stage" id="stage"></div>
    </div>
  `;

  const stage = root.querySelector("#stage") as HTMLElement;
  stage.appendChild(editor.canvas);

  const nameInput = root.querySelector("#map-name") as HTMLInputElement;
  const playersSelect = root.querySelector("#map-players") as HTMLSelectElement;
  const aspectSelect = root.querySelector("#map-aspect") as HTMLSelectElement;
  const laneSwitch = root.querySelector("#lane-switch") as HTMLElement;
  const statusEl = root.querySelector("#status") as HTMLElement;
  const fileMap = root.querySelector("#file-map") as HTMLInputElement;
  const palette = root.querySelector("#bg-palette") as HTMLElement;

  const fit = (): void => {
    const wrap = root.querySelector(".stage-wrap") as HTMLElement;
    const map = editor.getMap();
    const maxW = Math.max(320, wrap.clientWidth - 32);
    const maxH = Math.max(180, wrap.clientHeight - 32);
    const scale = Math.min(maxW / map.width, maxH / map.height, 1);
    editor.canvas.style.width = `${Math.floor(map.width * scale)}px`;
    editor.canvas.style.height = `${Math.floor(map.height * scale)}px`;
  };

  const sync = (): void => {
    const map = editor.getMap();
    if (document.activeElement !== nameInput) {
      nameInput.value = map.name;
    }
    playersSelect.value = String(map.players);
    const aspect = findMapAspect(map.width, map.height);
    if (aspect && document.activeElement !== aspectSelect) {
      aspectSelect.value = aspect.id;
    }
    laneSwitch.hidden = map.players !== 2;
    for (const btn of laneSwitch.querySelectorAll<HTMLButtonElement>("[data-lane]")) {
      const idx = Number(btn.dataset.lane);
      btn.classList.toggle("active", idx === editor.state.activeLane);
    }
    for (const sw of palette.querySelectorAll<HTMLButtonElement>(".swatch")) {
      sw.classList.toggle("selected", sw.dataset.bg === map.background);
    }
    statusEl.textContent = editor.state.status;
    statusEl.classList.toggle("error", editor.state.statusError);
    fit();
  };

  nameInput.addEventListener("input", () => {
    editor.setName(nameInput.value);
  });

  playersSelect.addEventListener("change", () => {
    const v = Number(playersSelect.value) === 2 ? 2 : 1;
    editor.setPlayers(v);
  });

  aspectSelect.addEventListener("change", () => {
    editor.setAspect(aspectSelect.value as MapAspectId);
  });

  laneSwitch.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-lane]");
    if (!t) return;
    editor.setActiveLane(Number(t.dataset.lane));
  });

  palette.addEventListener("click", (e) => {
    const sw = (e.target as HTMLElement).closest<HTMLButtonElement>(".swatch");
    if (!sw?.dataset.bg) return;
    editor.setBackground(sw.dataset.bg as MapBgColor);
  });

  root.querySelector("#btn-clear-path")!.addEventListener("click", () => {
    editor.clearActivePath();
  });
  root.querySelector("#btn-new")!.addEventListener("click", () => {
    const players = Number(playersSelect.value) === 2 ? 2 : 1;
    editor.newMap(players, aspectSelect.value as MapAspectId);
  });
  root.querySelector("#btn-load")!.addEventListener("click", () => fileMap.click());
  root.querySelector("#btn-save")!.addEventListener("click", () => editor.downloadMap());

  fileMap.addEventListener("change", async () => {
    const file = fileMap.files?.[0];
    fileMap.value = "";
    if (file) await editor.loadMapFromFile(file);
  });

  window.addEventListener("resize", fit);

  sync();
  return sync;
}
