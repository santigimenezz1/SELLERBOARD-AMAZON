/* «Variantes»: boards with images (a listing, its variants, their parts) and coloured notes, joined by arrows. */

/**
 * `producto` is the listing (Amazon's parent); `variante` a child (colour, size…); `componente` a part; `nota` a
 * coloured text card; `titulo` a free-standing title (white text, placed anywhere).
 */
export type TipoNodo = "producto" | "variante" | "componente" | "nota" | "titulo";
/** The elements that are text, not an image. */
export const esTexto = (t: TipoNodo) => t === "nota" || t === "titulo";

export type NodoVariante = {
  id: string;
  tipo: TipoNodo;
  /** The title above an image. */
  nombre: string;
  /** Font size of that title in px (TITULO_PX when not set), changed apart from the image's size; a free title's size. */
  tamanoTitulo?: number;
  /** The small label over an image in the ordered view («Producto principal», «Variante»), when changed. */
  etiqueta?: string;
  /** An image shown without its title. */
  sinTitulo?: boolean;
  /** Colour of the text (a title, an image's title or a note's text), one of COLORES_TEXTO; white when not set. */
  colorTexto?: string;
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
  /** More nodes whose arrows join that one into a single arrow (a note made from several selected notes). */
  padresExtra?: string[];
  /** The stored image (empty for notes). */
  archivo: string;
  tipoArchivo: string;
};

export type TableroVariantes = {
  id: string;
  nombre: string;
  nodos: NodoVariante[];
  creadoEn: string;
  /** The ordered view's section headings, when changed (ETIQUETAS_SECCION otherwise). */
  etiquetaKit?: string;
  etiquetaVariantes?: string;
};
/** The ordered view's headings and labels as they come. */
export const ETIQUETAS_SECCION = { kit: "KIT", variantes: "VARIANTES", producto: "Producto principal", variante: "Variante" } as const;

/** The board has no edges: positions just stay within this (huge) range. */
export const LIMITE_LIENZO = 1_000_000;
export const ANCHOS: Record<TipoNodo, number> = { producto: 220, variante: 160, componente: 120, nota: 200, titulo: 300 };
/** The title above an image: its usual size and the range it can take, in px. */
export const TITULO_PX = { normal: 14, min: 10, max: 120, libre: 36 } as const;
export const esTipoNodo = (v: unknown): v is TipoNodo => v === "producto" || v === "variante" || v === "componente" || v === "nota" || v === "titulo";
/** Note colours, readable on the black board. The first one (teal) is the default. */
/** Text colours, readable on the black board. The first one (white) is the default. */
export const COLORES_TEXTO = ["#ffffff", "#9ca3af", "#facc15", "#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#3b82f6", "#22d3ee", "#22c55e"] as const;
export const COLORES_NOTA = ["#2f6f6a", "#3987e5", "#199e70", "#c98500", "#d95926", "#d55181", "#7c5cd6"] as const;
