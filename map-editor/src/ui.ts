import type { MapEditor } from "./editor";

export type SyncUi = () => void;

export function mountUi(root: HTMLElement, editor: MapEditor): SyncUi {
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
      <div class="field" id="lane-switch" hidden>
        <button type="button" class="btn active" data-lane="0">Линия A</button>
        <button type="button" class="btn" data-lane="1">Линия B</button>
      </div>
      <button type="button" class="btn" id="btn-bg">Фон…</button>
      <button type="button" class="btn" id="btn-bg-clear">Убрать фон</button>
      <button type="button" class="btn" id="btn-clear-path">Очистить путь</button>
      <button type="button" class="btn" id="btn-new">Новая</button>
      <button type="button" class="btn" id="btn-load">Загрузить…</button>
      <button type="button" class="btn btn-accent" id="btn-save">Сохранить</button>
      <p class="hint">Клик — точка · drag — двигать · двойной клик — вставить рядом · ПКМ — удалить · жёлтая = spawn · дыра = конец</p>
      <input type="file" id="file-bg" class="hidden-file" accept="image/*" />
      <input type="file" id="file-map" class="hidden-file" accept="application/json,.json" />
    </header>
    <p class="status" id="status" style="padding: 6px 16px; margin: 0;"></p>
    <div class="stage-wrap">
      <div class="stage" id="stage"></div>
    </div>
  `;

  const stage = root.querySelector("#stage") as HTMLElement;
  stage.appendChild(editor.canvas);

  const nameInput = root.querySelector("#map-name") as HTMLInputElement;
  const playersSelect = root.querySelector("#map-players") as HTMLSelectElement;
  const laneSwitch = root.querySelector("#lane-switch") as HTMLElement;
  const statusEl = root.querySelector("#status") as HTMLElement;
  const fileBg = root.querySelector("#file-bg") as HTMLInputElement;
  const fileMap = root.querySelector("#file-map") as HTMLInputElement;

  const sync = (): void => {
    const map = editor.getMap();
    if (document.activeElement !== nameInput) {
      nameInput.value = map.name;
    }
    playersSelect.value = String(map.players);
    laneSwitch.hidden = map.players !== 2;
    for (const btn of laneSwitch.querySelectorAll<HTMLButtonElement>("[data-lane]")) {
      const idx = Number(btn.dataset.lane);
      btn.classList.toggle("active", idx === editor.state.activeLane);
    }
    statusEl.textContent = editor.state.status;
    statusEl.classList.toggle("error", editor.state.statusError);
  };

  nameInput.addEventListener("input", () => {
    editor.setName(nameInput.value);
  });

  playersSelect.addEventListener("change", () => {
    const v = Number(playersSelect.value) === 2 ? 2 : 1;
    editor.setPlayers(v);
  });

  laneSwitch.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-lane]");
    if (!t) return;
    editor.setActiveLane(Number(t.dataset.lane));
  });

  root.querySelector("#btn-bg")!.addEventListener("click", () => fileBg.click());
  root.querySelector("#btn-bg-clear")!.addEventListener("click", () => {
    editor.clearBackground();
  });
  root.querySelector("#btn-clear-path")!.addEventListener("click", () => {
    editor.clearActivePath();
  });
  root.querySelector("#btn-new")!.addEventListener("click", () => {
    const players = Number(playersSelect.value) === 2 ? 2 : 1;
    editor.newMap(players);
  });
  root.querySelector("#btn-load")!.addEventListener("click", () => fileMap.click());
  root.querySelector("#btn-save")!.addEventListener("click", () => editor.downloadMap());

  fileBg.addEventListener("change", async () => {
    const file = fileBg.files?.[0];
    fileBg.value = "";
    if (file) await editor.setBackgroundFromFile(file);
  });

  fileMap.addEventListener("change", async () => {
    const file = fileMap.files?.[0];
    fileMap.value = "";
    if (file) await editor.loadMapFromFile(file);
  });

  // Fit canvas visually while keeping 1280×720 backing store
  const fit = (): void => {
    const wrap = root.querySelector(".stage-wrap") as HTMLElement;
    const maxW = Math.max(320, wrap.clientWidth - 32);
    const maxH = Math.max(180, wrap.clientHeight - 32);
    const scale = Math.min(maxW / 1280, maxH / 720, 1);
    editor.canvas.style.width = `${Math.floor(1280 * scale)}px`;
    editor.canvas.style.height = `${Math.floor(720 * scale)}px`;
  };
  window.addEventListener("resize", fit);
  fit();

  sync();
  return sync;
}
