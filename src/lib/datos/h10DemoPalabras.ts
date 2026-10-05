import type { PalabraClave, PalabrasMercado } from "./h10Tipos";

/*
 * MADE-UP keyword data (Cerebro / Magnet style) for the «Análisis H10» preview: no captures of those tools yet.
 * Only each country's main keyword volume comes from the real Xray captures. Nothing here is stored.
 */

const k = (texto: string, busquedas: number, tendencia: number, competidores: number, cpr: number, densidadTitulos: number, pujaPpc: number, posiciones: (number | null)[]): PalabraClave => ({
  texto,
  busquedas,
  tendencia,
  competidores,
  cpr,
  densidadTitulos,
  pujaPpc,
  posiciones,
});

/** By study id, then country code. */
export const PALABRAS_DEMO: Record<string, Record<string, PalabrasMercado>> = {
  rebounder: {
    DE: {
      rivales: ["Racetex", "SONGMICS", "ELANI"],
      palabras: [
        k("rebounder für fußball", 8259, 12, 412, 24, 14, 0.98, [1, 4, 6]),
        k("fußball rebounder", 6120, 9, 389, 21, 12, 0.92, [2, 3, 8]),
        k("fussball trainingsgeräte", 5480, 18, 1240, 31, 3, 0.71, [7, null, 15]),
        k("rebounder netz fußball", 2210, 5, 214, 12, 8, 0.85, [3, 6, 2]),
        k("fußball rebounder kinder", 1890, 22, 176, 10, 4, 0.66, [5, 9, null]),
        k("fußball trainingsgerät kinder", 1640, 27, 690, 14, 2, 0.58, [12, null, 21]),
        k("prallwand fußball", 980, -4, 88, 8, 1, 0.74, [9, 14, null]),
        k("rebounder fußball doppelseitig", 720, 15, 64, 8, 2, 0.69, [null, 5, 3]),
        k("fußballnetz garten", 610, 31, 310, 9, 1, 0.52, [18, null, null]),
        k("passwand fußball", 540, -8, 47, 8, 0, 0.61, [11, 22, null]),
      ],
    },
    GB: {
      rivales: ["Football Master", "Happy Jump", "QuickPlay"],
      palabras: [
        k("football rebounder", 9740, 6, 520, 26, 15, 1.12, [1, 5, 3]),
        k("rebounder football", 3853, 4, 298, 14, 11, 1.04, [2, 4, 6]),
        k("football training equipment", 6320, 14, 2100, 34, 2, 0.89, [8, 19, 11]),
        k("football rebound net", 1980, 7, 184, 11, 6, 0.93, [3, 2, 9]),
        k("football rebounder for kids", 1460, 19, 160, 9, 3, 0.71, [6, 1, null]),
        k("football rebounder for garden", 820, 25, 96, 8, 2, 0.64, [4, 7, 12]),
        k("kickback football net", 410, -2, 39, 8, 0, 0.58, [10, null, 14]),
      ],
    },
    FR: {
      rivales: ["VEVOR", "Racetex", "Happy Jump"],
      palabras: [
        k("filet de rebond football", 1155, 8, 132, 9, 7, 0.62, [2, 5, 7]),
        k("rebounder football", 880, 11, 96, 8, 4, 0.59, [6, 1, 9]),
        k("entrainement football", 2740, 16, 980, 18, 2, 0.48, [14, 22, null]),
        k("filet rebond foot enfant", 420, 20, 58, 8, 1, 0.44, [5, null, 3]),
        k("mur de rebond football", 310, -5, 41, 8, 1, 0.51, [null, 8, 11]),
      ],
    },
    ES: {
      rivales: ["Happy Jump", "HOMCOM", "VEVOR"],
      palabras: [
        k("rebotador de futbol", 310, 6, 74, 8, 2, 0.41, [1, 4, 6]),
        k("red de rebote futbol", 640, 9, 118, 8, 6, 0.44, [2, 1, 5]),
        k("material entrenamiento futbol", 1320, 17, 860, 12, 1, 0.38, [16, null, 24]),
        k("red rebote futbol niños", 290, 21, 52, 8, 2, 0.35, [3, 7, null]),
        k("rebounder futbol", 240, 13, 39, 8, 1, 0.39, [5, null, 2]),
      ],
    },
  },
  porterias: {
    DE: {
      rivales: ["Racetex", "HUDORA", "EASY2PLAY"],
      palabras: [
        k("fußballtor kinder", 7126, 3, 690, 38, 18, 0.64, [1, 3, 2]),
        k("fußballtor garten", 9850, 8, 820, 45, 12, 0.71, [2, 1, 6]),
        k("fußballtore kinder 2er set", 3120, 11, 214, 22, 9, 0.58, [1, null, 3]),
        k("pop up fußballtor", 2480, 6, 160, 18, 7, 0.52, [null, null, 4]),
        k("mini fußballtor", 1940, -3, 390, 16, 6, 0.49, [5, 8, 9]),
        k("fußballtor faltbar", 1210, 14, 132, 11, 4, 0.47, [7, null, 2]),
      ],
    },
    GB: {
      rivales: ["Happy Jump", "Hy-Pro", "BAYINBULAK"],
      palabras: [
        k("kids football goals for garden", 0, 0, 210, 30, 10, 0.62, [1, 4, 2]),
        k("football goals for garden", 14800, 9, 640, 48, 14, 0.74, [2, 3, 5]),
        k("pop up football goals", 6200, 5, 180, 26, 11, 0.58, [1, 6, 2]),
        k("kids football goal", 5100, 7, 520, 24, 9, 0.55, [3, 2, 7]),
        k("football net for garden", 3900, 12, 300, 19, 6, 0.6, [6, 1, 9]),
        k("mini football goals", 2100, -2, 260, 14, 5, 0.47, [8, 11, 4]),
      ],
    },
    FR: {
      rivales: ["Dunlop", "Happy Jump", "Racetex"],
      palabras: [
        k("but de foot enfant", 620, 4, 210, 14, 9, 0.46, [1, 3, 5]),
        k("cage de foot", 3480, 10, 540, 26, 8, 0.52, [2, 6, 4]),
        k("but de football", 2860, 6, 610, 22, 10, 0.5, [1, 4, 7]),
        k("but de foot jardin", 1240, 15, 190, 12, 4, 0.44, [5, 2, null]),
        k("cage de foot pliable", 690, 18, 96, 9, 2, 0.41, [null, 1, 8]),
      ],
    },
    ES: {
      rivales: ["Happy Jump", "Dunlop", "SONGMICS"],
      palabras: [
        k("porterias de futbol", 453, 2, 260, 12, 11, 0.36, [1, 3, 6]),
        k("porteria futbol niños", 2380, 9, 340, 18, 9, 0.39, [2, 1, 5]),
        k("porteria futbol jardin", 1120, 14, 180, 11, 5, 0.35, [4, 6, 2]),
        k("porteria futbol plegable", 860, 19, 98, 9, 3, 0.33, [1, null, 9]),
        k("mini porteria futbol", 640, -1, 150, 8, 4, 0.31, [7, 2, null]),
      ],
    },
  },
};
