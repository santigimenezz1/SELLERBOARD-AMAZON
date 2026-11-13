"use client";

import { useEffect, useRef, useState } from "react";
import type { EstudioH10 } from "@/lib/datos/h10Tipos";
import {
  CATEGORIAS,
  DIVISOR,
  ENVIO_DESDE,
  NOMBRE_PAIS_TARIFA,
  PAISES_TARIFA,
  calcularTarifa,
  formatPesoTramo,
  formatTarifa,
  margenTramo,
  type Caja,
  type CalculoTarifa,
} from "@/lib/datos/tarifasFba";
import { formatNumero } from "@/lib/format";
import { Tarjeta } from "./comun";
import { InformeRentabilidadFba } from "./InformeRentabilidadFba";

/** The rate card in public/, to download. */
const PDF = "/tarifas/tarifas-fba-europa-2026.pdf";
const num = (v: number, dec = 2) => v.toLocaleString("es-ES", { maximumFractionDigits: dec });
const kg = (v: number) => `${num(v)} kg`;

/** The weight is typed in kg (`pesoKg`; older saves had `peso` in grams, which is dropped). */
type Campos = { largo: string; ancho: string; alto: string; pesoKg: string; cep: boolean };
const VACIO: Campos = { largo: "", ancho: "", alto: "", pesoKg: "", cep: false };
/** A decimal typed with a comma or a dot; 0 when empty or not a number. */
const leer = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

function Campo({ etiqueta, valor, unidad, onCambio }: { etiqueta: string; valor: string; unidad: string; onCambio: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-400">
      {etiqueta}
      <span className="flex items-center rounded-lg border border-white/[0.08] bg-ink-950/60 focus-within:border-accent-500/60">
        <input
          inputMode="decimal"
          value={valor}
          placeholder="0"
          onChange={(e) => onCambio(e.target.value.replace(/[^\d.,]/g, ""))}
          className="tabular h-9 w-full min-w-0 bg-transparent px-3 text-sm text-ink-100 outline-none"
        />
        <span className="pr-3 text-ink-500">{unidad}</span>
      </span>
    </label>
  );
}

/** The calculation as a CSV (semicolons and decimal commas, so Excel in Spanish opens it as it is). */
function csv(c: Caja, r: CalculoTarifa, cep: boolean) {
  const n = (v: number) => num(v).replace(/\./g, "");
  const filas: (string | number)[][] = [
    ["Tarifas FBA (Amazon, en vigor desde el 1 de febrero de 2026)"],
    [],
    ["Medidas de la caja (cm)", `${n(c.largo)} x ${n(c.ancho)} x ${n(c.alto)}`],
    ["Peso con embalaje (kg)", n(c.pesoG / 1000)],
    ["Volumen (cm³)", n(Math.round(r.volumen))],
    ["Peso dimensional (kg)", n(r.pesoDim)],
    ["Peso de envío (kg)", `${n(r.pesoEnvio)} (${r.ganaDimensional ? "dimensional" : "real"})`],
    ["Categoría", r.categoria?.nombre ?? "Tamaño grande (especial)"],
    ["Medidas de la categoría", r.categoria?.limites ?? ""],
    ["Tramo", r.categoria ? (r.categoria.porKg ? `${formatPesoTramo(r.categoria.tramos[0].hasta)} + por kg` : formatPesoTramo(r.categoria.tramos[r.tramo].hasta)) : ""],
    ["Alemania", cep ? "Con programa CEP (Polonia/Chequia)" : "Solo Alemania (sin CEP)"],
    [],
    ["País", "Inventario enviado a", "Tarifa de gestión logística", "Recargo paneuropeo", "Total por unidad", "Moneda"],
    ...r.paises.map((p) => [NOMBRE_PAIS_TARIFA[p.pais], ENVIO_DESDE[p.pais], n(p.gestion), n(p.recargo), n(p.total), p.pais === "UK" ? "GBP" : "EUR"]),
  ];
  const texto = "﻿" + filas.map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  a.download = `tarifa-fba-${n(c.largo)}x${n(c.ancho)}x${n(c.alto)}-${n(c.pesoG / 1000)}kg.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** «Tarifas FBA»: a box's size tier and band in Amazon's rate card, and its fee in Spain, Germany, France and the UK. */
/** `eurPorGbp`: the ECB rate, for the UK in «Rentabilidad por país». */
export function PestanaTarifasFba({ estudio, eurPorGbp = 1.16 }: { estudio: EstudioH10; eurPorGbp?: number }) {
  const estudioId = estudio.id;
  const [sub, setSub] = useState<"tarifa" | "rentabilidad">("tarifa");
  const clave = `tarifas-fba-caja-${estudioId}`;
  // The box is the study's own («Tu caja», saved with it); the Central Europe choice, this browser's.
  const guardada = estudio.supuestos?.miCaja;
  const texto = (v: number | undefined) => (v ? String(v).replace(".", ",") : "");
  const [campos, setCampos] = useState<Campos>(() =>
    guardada && Object.values(guardada).some((v) => v > 0)
      ? { largo: texto(guardada.largo), ancho: texto(guardada.ancho), alto: texto(guardada.alto), pesoKg: texto(guardada.peso), cep: false }
      : VACIO,
  );
  useEffect(() => {
    try {
      const g = localStorage.getItem(clave);
      if (g) {
        const { largo, ancho, alto, pesoKg, cep } = { ...VACIO, ...JSON.parse(g) };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after mounting
        setCampos((c) => (c.largo || c.ancho || c.alto || c.pesoKg ? { ...c, cep } : { largo, ancho, alto, pesoKg, cep }));
      }
    } catch {}
  }, [clave]);
  // Saving the box in the study, a moment after the last change (with the rest of its assumptions as they are).
  const supuestos = useRef(estudio.supuestos);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guardado, setGuardado] = useState<"" | "guardando" | "ok" | "error">("");
  const guardarCaja = (c: Campos) => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(async () => {
      const miCaja = { largo: leer(c.largo), ancho: leer(c.ancho), alto: leer(c.alto), peso: leer(c.pesoKg) };
      const nuevos = { ...(supuestos.current ?? {}), miCaja };
      setGuardado("guardando");
      const res = await fetch(`/api/h10/estudios/${estudioId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supuestos: nuevos }) }).catch(() => null);
      if (res?.ok) supuestos.current = nuevos as typeof supuestos.current;
      setGuardado(res?.ok ? "ok" : "error");
    }, 900);
  };
  const cambiar = (c: Partial<Campos>) => {
    const nuevo = { ...campos, ...c };
    setCampos(nuevo);
    try {
      localStorage.setItem(clave, JSON.stringify(nuevo));
    } catch {}
    if (!estudio.ejemplo && ("largo" in c || "ancho" in c || "alto" in c || "pesoKg" in c)) guardarCaja(nuevo);
  };

  const caja: Caja = { largo: leer(campos.largo), ancho: leer(campos.ancho), alto: leer(campos.alto), pesoG: Math.round(leer(campos.pesoKg) * 1000) };
  const completa = caja.largo > 0 && caja.ancho > 0 && caja.alto > 0 && caja.pesoG > 0;
  const r = completa ? calcularTarifa(caja, campos.cep) : null;
  const margen = completa ? margenTramo(caja, campos.cep) : null;
  const cat = r?.categoria ?? null;
  const siguiente = cat && !cat.porKg ? cat.tramos[r!.tramo + 1] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Tarifas FBA</h2>
          <p className="mt-0.5 text-xs text-ink-400">
            Pon las medidas y el peso de la caja tal como la enviarás a Amazon y te digo en qué categoría y tramo cae, y cuánto cuesta la tarifa de gestión logística en cada país. Tabla de Amazon
            en vigor desde el 1 de febrero de 2026; inventario enviado a Alemania (Pan-Europeo) y, el de Reino Unido, a Reino Unido.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={PDF} download="tarifas-fba-europa-2026.pdf" className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-ink-200 hover:bg-white/[0.05]">
            Descargar PDF de tarifas de Amazon
          </a>
          <button
            disabled={!r}
            onClick={() => r && csv(caja, r, campos.cep)}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Descargar este cálculo (Excel)
          </button>
        </div>
      </div>

      <Tarjeta
        titulo="1. Tu caja"
        subtitulo={`Medidas exteriores de la caja o bolsa y peso total con el producto y el embalaje dentro. Se guarda en el estudio${guardado === "guardando" ? " · guardando…" : guardado === "ok" ? " · guardada ✓" : guardado === "error" ? " · no se pudo guardar" : ""}.`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo etiqueta="Largo" unidad="cm" valor={campos.largo} onCambio={(v) => cambiar({ largo: v })} />
          <Campo etiqueta="Ancho" unidad="cm" valor={campos.ancho} onCambio={(v) => cambiar({ ancho: v })} />
          <Campo etiqueta="Alto" unidad="cm" valor={campos.alto} onCambio={(v) => cambiar({ alto: v })} />
          <Campo etiqueta="Peso con embalaje" unidad="kg" valor={campos.pesoKg} onCambio={(v) => cambiar({ pesoKg: v })} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-ink-300">
          <input type="checkbox" checked={campos.cep} onChange={(e) => cambiar({ cep: e.target.checked })} className="accent-accent-500" />
          Participo en el programa CEP de Europa Central (Amazon guarda parte de mi stock alemán en Polonia y Chequia)
        </label>
      </Tarjeta>

      {!completa && <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-ink-400">Rellena largo, ancho, alto y peso para ver la tarifa.</p>}

      {r?.categoria && (
        <div className="flex gap-1.5">
          {(
            [
              ["tarifa", "Categoría y tarifa"],
              ["rentabilidad", "Rentabilidad por país"],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              onClick={() => setSub(id)}
              aria-current={sub === id ? "page" : undefined}
              className={`rounded-md border px-3 py-1 text-sm ${sub === id ? "border-accent-400 bg-accent-500/15 text-accent-200" : "border-white/[0.08] text-ink-400 hover:bg-white/[0.04] hover:text-ink-100"}`}
            >
              {texto}
            </button>
          ))}
        </div>
      )}
      {r?.categoria && sub === "rentabilidad" && <InformeRentabilidadFba estudioId={estudioId} caja={caja} r={r} cep={campos.cep} eurPorGbp={eurPorGbp} />}

      {r && (sub === "tarifa" || !r.categoria) && (
        <>
          <Tarjeta titulo="2. En qué categoría está">
            <ol className="flex flex-col gap-2 text-sm text-ink-200">
              <li>
                <span className="text-ink-400">Medidas ordenadas (de mayor a menor):</span> {r.lados.map((l) => num(l, 1)).join(" × ")} cm · volumen {formatNumero(Math.round(r.volumen))} cm³
              </li>
              <li>
                <span className="text-ink-400">Peso real:</span> {kg(r.pesoReal)} · <span className="text-ink-400">peso dimensional</span> ({formatNumero(Math.round(r.volumen))} ÷ {formatNumero(DIVISOR)}):{" "}
                {kg(r.pesoDim)}
              </li>
              <li>
                <span className="text-ink-400">Peso por el que cobra Amazon:</span>{" "}
                <b className="text-ink-100">{kg(r.pesoEnvio)}</b>{" "}
                {cat && !cat.porVolumen ? "(los sobres van solo por el peso real)" : r.ganaDimensional ? "(gana el dimensional: la caja abulta más de lo que pesa)" : "(gana el peso real)"}
              </li>
            </ol>
            {cat ? (
              <div className="mt-4 rounded-xl border border-accent-500/30 bg-accent-500/[0.06] p-4">
                <p className="text-[11px] font-semibold tracking-wide text-accent-300 uppercase">Resultado</p>
                <p className="mt-1 text-lg font-semibold text-ink-100">
                  {cat.nombre} · tramo {cat.porKg ? `${formatPesoTramo(cat.tramos[0].hasta)} + tarifa por kg` : formatPesoTramo(cat.tramos[r.tramo].hasta)}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">Límites de la categoría: {cat.limites}</p>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-warning/30 bg-warning/[0.06] p-4 text-sm text-ink-200">
                Es <b>Tamaño grande (especial)</b>: más de 31,5 kg, un lado de más de 175 cm o un contorno de más de 360 cm. Mira su tabla en la página 6 del PDF.
              </p>
            )}
          </Tarjeta>

          {cat && (
            <Tarjeta titulo="3. Cuánto pagas por unidad vendida" subtitulo="Tarifa de gestión logística (preparar y enviar cada pedido). No incluye almacenamiento, comisión por venta ni publicidad.">
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="tabular w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                      <th className="px-2 py-2 text-left font-medium">País de venta</th>
                      <th className="px-2 py-2 text-left font-medium">Inventario enviado a</th>
                      <th className="px-2 py-2 text-right font-medium">Gestión logística</th>
                      <th className="px-2 py-2 text-right font-medium" title="Solo para tamaño grande vendido en un país distinto al que enviaste el inventario">
                        Recargo paneuropeo
                      </th>
                      <th className="px-2 py-2 text-right font-medium">Total por unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.paises.map((p) => (
                      <tr key={p.pais} className="border-b border-white/[0.04]">
                        <td className="px-2 py-2 font-semibold text-ink-100">
                          {NOMBRE_PAIS_TARIFA[p.pais]}
                          {p.pais === "DE" && <span className="ml-1.5 text-[11px] font-normal text-ink-500">{campos.cep ? "con CEP" : "solo DE"}</span>}
                        </td>
                        <td className="px-2 py-2 text-ink-300">{ENVIO_DESDE[p.pais]}</td>
                        <td className="px-2 py-2 text-right text-ink-200">{formatTarifa(p.gestion, p.pais)}</td>
                        <td className="px-2 py-2 text-right text-ink-400">{p.recargo ? formatTarifa(p.recargo, p.pais) : "—"}</td>
                        <td className="px-2 py-2 text-right text-base font-semibold text-ink-100">{formatTarifa(p.total, p.pais)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cat.porKg && <p className="mt-2 text-xs text-ink-500">En tamaño grande se suma la tarifa por cada kg (o fracción) por encima de 760 g; el recargo paneuropeo se aplica a España y Francia porque el inventario entra por Alemania.</p>}
            </Tarjeta>
          )}

          {cat && (
            <Tarjeta titulo={`4. Tabla de Amazon: ${cat.nombre}`} subtitulo={`${cat.limites}. Marcado el tramo de tu caja (página 6 del PDF).`}>
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="tabular w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                      <th className="px-2 py-2 text-left font-medium">Peso de envío</th>
                      {PAISES_TARIFA.map((p) => (
                        <th key={p} className="px-2 py-2 text-right font-medium">
                          {NOMBRE_PAIS_TARIFA[p]}
                          {p === "DE" && ` (${campos.cep ? "CEP" : "solo DE"})`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cat.tramos.map((tr, i) => {
                      const aqui = i === r.tramo;
                      return (
                        <tr key={tr.hasta} className={`border-b border-white/[0.04] ${aqui ? "bg-accent-500/[0.12] font-semibold text-ink-100" : "text-ink-300"}`}>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {formatPesoTramo(tr.hasta)}
                            {aqui && <span className="ml-2 rounded bg-accent-500 px-1.5 py-0.5 text-[10px] text-ink-950">tu caja</span>}
                          </td>
                          {PAISES_TARIFA.map((p) => (
                            <td key={p} className="px-2 py-2 text-right">
                              {formatTarifa(tr.tarifa[p === "DE" ? (campos.cep ? "CEP" : "DE") : p], p)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {cat.porKg && (
                      <tr className="text-ink-300">
                        <td className="px-2 py-2">&gt; {formatPesoTramo(cat.tramos[0].hasta).slice(2)}</td>
                        {PAISES_TARIFA.map((p) => (
                          <td key={p} className="px-2 py-2 text-right">
                            +{formatTarifa(cat.porKg![p === "DE" ? (campos.cep ? "CEP" : "DE") : p], p)}/kg
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Tarjeta>
          )}

          {cat && margen && (
            <Tarjeta titulo="5. Cuánto puede crecer la caja sin cambiar de tarifa">
              <ul className="flex flex-col gap-1.5 text-sm text-ink-200">
                <li>
                  • <b className="text-ink-100">Alto máximo con el mismo largo y ancho: {num(margen.altoMax, 1)} cm</b>
                  {margen.altoMax > caja.alto ? ` (${num(margen.altoMax - caja.alto, 1)} cm más que ahora)` : " (ya estás en el límite)"}.
                </li>
                {margen.volumenMax !== null && (
                  <li>
                    • Volumen máximo: <b className="text-ink-100">{formatNumero(margen.volumenMax)} cm³</b> (ahora {formatNumero(Math.round(r.volumen))} cm³). Por encima, el peso dimensional pasa de{" "}
                    {formatPesoTramo(cat.tramos[r.tramo].hasta).slice(2)}.
                  </li>
                )}
                <li>
                  • Peso máximo con embalaje: <b className="text-ink-100">{kg(margen.pesoMaxG / 1000)}</b> (ahora {kg(caja.pesoG / 1000)}).
                </li>
                <li>
                  • Ningún lado puede pasar de {cat.lados?.map((l) => num(l, 1)).join(" × ")} cm{" "}
                  {CATEGORIAS[CATEGORIAS.indexOf(cat) + 1] && `o pasas a ${CATEGORIAS[CATEGORIAS.indexOf(cat) + 1].nombre}`}.
                </li>
                {siguiente && (
                  <li className="text-ink-400">
                    • Si te pasas, vas al tramo {formatPesoTramo(siguiente.hasta)}:{" "}
                    {PAISES_TARIFA.map((p) => {
                      const col = p === "DE" ? (campos.cep ? "CEP" : "DE") : p;
                      const d = siguiente.tarifa[col] - cat.tramos[r.tramo].tarifa[col];
                      return `${NOMBRE_PAIS_TARIFA[p]} +${formatTarifa(d, p)}`;
                    }).join(" · ")}
                    .
                  </li>
                )}
              </ul>
              <p className="mt-3 text-xs text-ink-500">Deja algo de margen: Amazon mide la caja por su cuenta y, si le sale 1 cm más, te cambia de tramo.</p>
            </Tarjeta>
          )}

          <p className="text-xs leading-relaxed text-ink-500">
            Además de esta tarifa: almacenamiento mensual, tarifa por bajo inventario en DE/FR/IT/ES (de 0,16 € a 0,67 € por unidad si tienes menos de 28 días de stock), +0,10 € si lleva baterías de litio o
            es mercancía peligrosa, y la tarifa de temporada alta (del 15 de octubre al 14 de enero). Las categorías de ropa, calzado, mochilas y algunas más tienen tarifas propias de paquete.
          </p>
        </>
      )}
    </div>
  );
}
