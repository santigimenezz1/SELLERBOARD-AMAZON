/* «Variantes»: boards with images (a listing, its variants, their parts) and coloured notes, joined by arrows. */

/** `producto` is the listing (Amazon's parent); `variante` a child (colour, size…); `componente` a part; `nota` a coloured text card. */
export type TipoNodo = "producto" | "variante" | "componente" | "nota";

export type NodoVariante = {
  id: string;
  tipo: TipoNodo;
  /** The title above an image. */
  nombre: string;
  /** What tells a variant apart («Color: Azul»), when imported from Amazon. */
  atributo?: string;
  asin?: string;
  /** A note's text. */
  notas: string;
  /** A note's colour (one of COLORES_NOTA). */
  color?: string;
  /** Top-left corner on the board, in px. */
  x: number;
  y: number;
  /** Width on the board, in px. */
  ancho: number;
  /** The node its arrow comes from. */
  padre: string | null;
  /** The stored image (empty for notes). */
  archivo: string;
  tipoArchivo: string;
};

export type TableroVariantes = { id: string; nombre: string; nodos: NodoVariante[]; creadoEn: string };

/** The board has no edges: positions just stay within this (huge) range. */
export const LIMITE_LIENZO = 1_000_000;
export const ANCHOS: Record<TipoNodo, number> = { producto: 220, variante: 160, componente: 120, nota: 200 };
export const esTipoNodo = (v: unknown): v is TipoNodo => v === "producto" || v === "variante" || v === "componente" || v === "nota";
/** Note colours, readable on the black board. The first one (teal) is the default. */
export const COLORES_NOTA = ["#2f6f6a", "#3987e5", "#199e70", "#c98500", "#d95926", "#d55181", "#7c5cd6"] as const;
