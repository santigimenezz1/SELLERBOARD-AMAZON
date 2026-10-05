import { zipSync } from "fflate";
import type { Ticket } from "./tickets";

/*
 * Packing tickets into a ZIP: which tickets a period takes, the folders and the file names. Plain functions with
 * no Firebase, so they can be tried on made-up tickets.
 */

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** The ticket's date, or the upload day while it has none. */
const diaDe = (t: Ticket) => t.fecha ?? t.subidoEn.slice(0, 10);
const carpetaMes = (dia: string) => `${dia.slice(5, 7)} ${MESES[Number(dia.slice(5, 7)) - 1]}`;
const limpio = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-. ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
const decimal = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));
const celda = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** «2026-03-14 Mercadona 23,45 EUR» and the file's extension: the name it's downloaded with, so files sort by date. */
export const nombreDescarga = (t: Ticket) => ({
  base: [t.fecha ?? `${diaDe(t)} SIN FECHA`, limpio(t.comercio) || "ticket", t.total !== null ? `${decimal(t.total)} ${t.moneda}` : ""].filter(Boolean).join(" "),
  ext: t.archivo.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "",
});

/** `periodo`: "todo", a year ("2026"), a month ("2026-03") or a day ("2026-03-14"). */
export const esPeriodo = (p: string) => p === "todo" || /^\d{4}(-\d{2}(-\d{2})?)?$/.test(p);
export const nombrePeriodo = (p: string) =>
  p === "todo" ? "Tickets" : p.length === 4 ? `Tickets ${p}` : p.length === 7 ? `Tickets ${p.slice(0, 4)} ${carpetaMes(`${p}-01`)}` : `Tickets ${p}`;

/** The period's tickets, oldest first. */
export const ticketsDelPeriodo = (lista: Ticket[], periodo: string) =>
  lista.filter((t) => periodo === "todo" || diaDe(t).startsWith(periodo)).sort((a, b) => diaDe(a).localeCompare(diaDe(b)) || a.subidoEn.localeCompare(b.subidoEn));

/**
 * The ZIP: folders by year and month (only the levels the period doesn't fix already), each file named «date shop
 * total», plus «resumen.csv» (opens in Excel) listing them all. `datos[i]` is the file of `lista[i]`.
 */
export function armarZip(lista: Ticket[], datos: Uint8Array[], periodo: string): Uint8Array {
  const archivos: Record<string, [Uint8Array, { level: 0 }]> = {};
  const filas = ["Fecha;Comercio;Concepto;Total;IVA;Moneda;Nota;Archivo"];
  lista.forEach((t, i) => {
    const dia = diaDe(t);
    const carpetas = periodo === "todo" ? [dia.slice(0, 4), carpetaMes(dia)] : periodo.length === 4 ? [carpetaMes(dia)] : [];
    const { base, ext } = nombreDescarga(t);
    let nombre = [...carpetas, `${base}${ext}`].join("/");
    for (let n = 2; archivos[nombre]; n++) nombre = [...carpetas, `${base} (${n})${ext}`].join("/");
    archivos[nombre] = [datos[i], { level: 0 }];
    filas.push([t.fecha ?? "", t.comercio, t.concepto, decimal(t.total), decimal(t.iva), t.moneda, t.nota, nombre].map(celda).join(";"));
  });
  // BOM so Excel opens the accents right.
  archivos["resumen.csv"] = [new TextEncoder().encode(`﻿${filas.join("\r\n")}\r\n`), { level: 0 }];
  return zipSync(archivos);
}
