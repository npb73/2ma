import "./style.css";
import { MapEditor } from "./editor";
import { mountUi } from "./ui";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app missing");

const canvas = document.createElement("canvas");
let syncUi: () => void = () => {};

const editor = new MapEditor(canvas, {
  onChange: () => syncUi(),
});

syncUi = mountUi(app, editor);
