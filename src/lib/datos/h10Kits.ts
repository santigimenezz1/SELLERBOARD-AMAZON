import type { CodigoPais, EstudioH10, KitCompetidor, KitsCompetidores } from "./h10Tipos";
import { cambioAEur } from "./h10Analisis";
import { lideresListings } from "./h10Listings";

/*
 * What the competitors' kits say, worked out (no AI): the kits' main element («Conos», «Portería»), how many of it
 * each kit brings, its extras, and the market split by kit size. Shared by «Kits competidores» and «Lanzamiento».
 */

/** «Portería» → «porterías», «Conos» → «conos»: the plural of a kit element's name, in lower case. */
export const plural = (nombre: string) => {
  const n = nombre.toLowerCase();
  if (/s$/.test(n)) return n;
  return /[aeiouáéíóú]$/.test(n) ? `${n}s` : `${n.replace(/ón$/, "on")}es`;
};

/**
 * An extra's group: the first word of its name, so «Bolsa de malla» and «Bolsa de transporte» count as one extra
 * («Bolsa») and «Soporte» as «Soporte para conos».
 */
export const grupoExtra = (nombre: string) =>
  nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[\s/]+/)[0];

/** The kits' main element: the one most kits list first (in a study of goals, «Portería»). */
export function elementoPrincipal(kits: KitsCompetidores | null | undefined): string | null {
  const primeros = new Map<string, { nombre: string; n: number }>();
  for (const k of kits ? Object.values(kits.porPais).flat() : []) {
    const e = k?.elementos[0];
    if (!e || k.otroProducto) continue;
    const clave = e.nombre.toLowerCase();
    primeros.set(clave, { nombre: e.nombre, n: (primeros.get(clave)?.n ?? 0) + 1 });
  }
  return [...primeros.values()].sort((a, b) => b.n - a.n)[0]?.nombre ?? null;
}

/** How many of the main element a kit brings (null: another product, or the listing doesn't say). */
export function cantidadPrincipal(k: Pick<KitCompetidor, "elementos" | "otroProducto">, principal: string | null): number | null {
  if (!principal || k.otroProducto) return null;
  const suyos = k.elementos.filter((e) => e.nombre.toLowerCase() === principal.toLowerCase());
  if (!suyos.length || suyos.some((e) => e.cantidad === null)) return null;
  return suyos.reduce((t, e) => t + (e.cantidad ?? 0), 0);
}

/** One analysed listing of a country, with its kit size and extras. */
export type FilaKit = {
  pais: CodigoPais;
  asin: string;
  marca: string;
  /** Monthly revenue in euros, units a month and price in euros (the Xray's). */
  eur: number;
  uds: number;
  precio: number | null;
  cantidad: number;
  /** Extra groups it brings → the name it gives them. */
  extras: Map<string, string>;
};

/** A kit size: «20 conos», or «3 o más porterías» when kits bring few. */
export type GrupoKit = {
  clave: number;
  nombre: string;
  filas: FilaKit[];
  eur: number;
  uds: number;
  /** Share of the analysed market of the view (0–1). */
  cuota: number;
  /** Revenue ÷ units: what a buyer pays on average. */
  precioMedio: number | null;
  precios: { min: number; tipico: number; max: number } | null;
  /** Each extra: its name and the share of the size's listings that bring it (0–1); the most usual first. */
  extras: { grupo: string; nombre: string; parte: number }[];
  /** Share of the size's listings that bring nothing else. */
  sinExtras: number;
  /** The brand that makes most of the size's revenue and its share (0–1). */
  lider: { marca: string; cuota: number } | null;
};

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The market split by kit size: the same listings «Kits competidores» shows (each country's first `cuantos`, without
 * the ones taken out), the analysed ones of the study's kind of product with their size known.
 */
export function repartoKits(estudio: EstudioH10, cuantos: number) {
  const kits = estudio.kitsCompetidores ?? null;
  const principal = elementoPrincipal(kits);
  const lista = lideresListings(estudio.mercados, null, estudio.listingsQuitados ?? [], cuantos).filter((x) => x.c.asin);
  const filas: FilaKit[] = [];
  let pendientes = 0;
  let otros = 0;
  let sinCantidad = 0;
  for (const { m, c, eur } of lista) {
    const k = kits?.porPais[m.codigoPais]?.find((x) => x.asin === c.asin);
    if (!k) {
      pendientes++;
      continue;
    }
    if (k.otroProducto) {
      otros++;
      continue;
    }
    const cantidad = cantidadPrincipal(k, principal);
    if (cantidad === null) {
      sinCantidad++;
      continue;
    }
    const extras = new Map<string, string>();
    for (const e of k.elementos) if (e.nombre.toLowerCase() !== principal!.toLowerCase()) extras.set(grupoExtra(e.nombre), e.nombre);
    filas.push({ pais: m.codigoPais, asin: c.asin!, marca: c.marca, eur, uds: c.ventas ?? 0, precio: c.precio ? c.precio * cambioAEur(m) : null, cantidad, extras });
  }
  // Few of the main element (goals: 1, 2, 3 or more) or many (cones: 20, 25, 50…): then each count is a size.
  const exacto = filas.some((f) => f.cantidad > 3);
  const claveDe = (n: number) => (exacto ? n : Math.min(n, 3));
  const nombreDe = (n: number) => (!exacto && n === 3 ? `3 o más ${plural(principal ?? "")}` : `${n} ${n === 1 ? (principal ?? "").toLowerCase() : plural(principal ?? "")}`);

  /** The sizes of some listings (one country, or all), the one that earns most first. */
  const grupos = (de: FilaKit[]): GrupoKit[] => {
    const total = de.reduce((s, f) => s + f.eur, 0);
    const porClave = new Map<number, FilaKit[]>();
    for (const f of de) porClave.set(claveDe(f.cantidad), [...(porClave.get(claveDe(f.cantidad)) ?? []), f]);
    return [...porClave]
      .map(([clave, fs]): GrupoKit => {
        const eur = fs.reduce((s, f) => s + f.eur, 0);
        const uds = fs.reduce((s, f) => s + f.uds, 0);
        const precios = fs.map((f) => f.precio).filter((p): p is number => p !== null && p > 0);
        const nombres = new Map<string, { nombre: string; n: number }>();
        for (const f of fs) for (const [g, nombre] of f.extras) nombres.set(g, { nombre: nombres.get(g)?.nombre ?? nombre, n: (nombres.get(g)?.n ?? 0) + 1 });
        const marcas = new Map<string, number>();
        for (const f of fs) marcas.set(f.marca, (marcas.get(f.marca) ?? 0) + f.eur);
        const [marca, eurMarca] = [...marcas].sort((a, b) => b[1] - a[1])[0] ?? [];
        return {
          clave,
          nombre: nombreDe(clave),
          filas: fs,
          eur,
          uds,
          cuota: total ? eur / total : 0,
          precioMedio: uds > 0 ? eur / uds : null,
          precios: precios.length ? { min: Math.min(...precios), tipico: mediana(precios), max: Math.max(...precios) } : null,
          extras: [...nombres].map(([grupo, x]) => ({ grupo, nombre: x.nombre, parte: x.n / fs.length })).sort((a, b) => b.parte - a.parte),
          sinExtras: fs.filter((f) => f.extras.size === 0).length / fs.length,
          lider: marca && eur ? { marca, cuota: eurMarca! / eur } : null,
        };
      })
      .sort((a, b) => b.eur - a.eur);
  };
  return { principal, filas, grupos, analizados: lista.length - pendientes, total: lista.length, pendientes, otros, sinCantidad };
}
