import { ICE_FREEZE_SEC } from "../constants.js";
import { ICE_COLOR, type BallTypeDef } from "../types.js";

export function iceDefs(): BallTypeDef[] {
  return [
    {
      id: "ice",
      kind: "ice",
      colors: [ICE_COLOR],
      title: "Ледяной шар",
      description: `Комбо (синий) — заморозка поля на ${ICE_FREEZE_SEC} с`,
      unique: true,
    },
  ];
}
