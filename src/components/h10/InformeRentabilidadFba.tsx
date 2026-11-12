"use client";

import { useEffect, useState } from "react";
import { IVA, MARGENES, SERVICIOS_DIGITALES, rentabilidad, type RentabilidadPais, type SupuestosRentabilidad } from "@/lib/datos/rentabilidadFba";
import { ENVIO_DESDE, NOMBRE_PAIS_TARIFA, formatPesoTramo, type Caja, type CalculoTarifa } from "@/lib/datos/tarifasFba";
import { Tarjeta } from "./comun";

type Campos = { coste: string; envio: string; comision: string; meses: string; temporada: "baja" | "alta" };
const VACIO: Campos = { coste: "", envio: "", comision: "15", meses: "1", temporada: new Date().getMonth() >= 9 ? "alta" : "baja" };
const leer = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const dinero = (v: number, m: string) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m}`;
const pct = (v: number) => `${Math.round(v * 100)} %`;
const num = (v: number, d = 2) => v.toLocaleString("es-ES", { maximumFractionDigits: d });
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function Campo({ etiqueta, valor, unidad, onCambio, ayuda }: { etiqueta: string; valor: string; unidad: string; onCambio: (v: string) => void; ayuda?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-400" title={ayuda}>
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

/** The columns of each country's table: header, help and the value of a row. */
const COLUMNAS: { titulo: string; ayuda?: string; valor: (f: RentabilidadPais["filas"][number], m: string) => string; fuerte?: boolean }[] = [
  { titulo: "Precio de venta", ayuda: "PVP con IVA", valor: (f, m) => dinero(f.precio, m), fuerte: true },
  { titulo: "Comisión", ayuda: "Tarifa por referencia + servicios digitales", valor: (f, m) => dinero(f.comision + f.servicios, m) },
  { titulo: "Gestión logística", valor: (f, m) => dinero(f.logistica, m) },
  { titulo: "Almacén", valor: (f, m) => dinero(f.almacen, m) },
  { titulo: "IVA", valor: (f, m) => dinero(f.iva, m) },
  { titulo: "Producto + envío", valor: (f, m) => dinero(f.coste + f.envio, m) },
  { titulo: "Ganancia por unidad", valor: (f, m) => dinero(f.ganancia, m), fuerte: true },
  { titulo: "ROAS mínimo", ayuda: "Ventas ÷ gasto en publicidad para no perder dinero si toda la ganancia va a anuncios", valor: (f) => (f.roas === null ? "—" : num(f.roas, 1)) },
  { titulo: "ACoS máximo", ayuda: "Gasto en publicidad ÷ ventas, como mucho", valor: (f) => pct(f.margen) },
];

/** The report as a page of its own, to open in a new browser tab (and print or save as PDF from there). */
function documento(caja: Caja, r: CalculoTarifa, s: SupuestosRentabilidad, filas: RentabilidadPais[], cep: boolean, eurPorGbp: number) {
  const cat = r.categoria!;
  const tramo = cat.porKg ? `${formatPesoTramo(cat.tramos[0].hasta)} + tarifa por kg` : formatPesoTramo(cat.tramos[r.tramo].hasta);
  const tablas = filas
    .map(
      (p) => `<h2>${NOMBRE_PAIS_TARIFA[p.pais]} <small>· inventario enviado a ${ENVIO_DESDE[p.pais]} · IVA ${IVA[p.pais]} % · gestión logística ${dinero(p.filas[0].logistica, p.moneda)}</small></h2>
<table><thead><tr><th>Margen</th>${COLUMNAS.map((c) => `<th>${c.titulo}</th>`).join("")}</tr></thead><tbody>
${p.filas.map((f) => `<tr><td><b>${pct(f.margen)}</b></td>${COLUMNAS.map((c) => `<td${c.fuerte ? ' class="f"' : ""}>${c.valor(f, p.moneda)}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`,
    )
    .join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rentabilidad FBA ${num(caja.largo, 1)}x${num(caja.ancho, 1)}x${num(caja.alto, 1)} cm</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;margin:0 auto;max-width:1100px;padding:24px 16px;font-size:13px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 6px}h2 small{font-weight:400;color:#666;font-size:12px}
.res{border:1px solid #ddd;border-radius:10px;padding:12px 14px;margin:14px 0;background:#f7f7f7}.res b{font-size:16px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e5e5e5;padding:5px 6px;text-align:right;white-space:nowrap}th{color:#555;font-weight:600;font-size:11px}
th:first-child,td:first-child{text-align:left}td.f{font-weight:700}p.n{color:#666;font-size:11px;line-height:1.5}
button{padding:6px 12px;border-radius:8px;border:1px solid #bbb;background:#fff;cursor:pointer}@media print{button{display:none}}
.wrap{overflow-x:auto}
</style></head><body>
<button onclick="print()">Imprimir / guardar PDF</button>
<h1>Rentabilidad FBA por país</h1>
<p>Caja ${num(caja.largo, 1)} × ${num(caja.ancho, 1)} × ${num(caja.alto, 1)} cm · ${num(caja.pesoG / 1000)} kg con embalaje · volumen ${Math.round(r.volumen).toLocaleString("es-ES")} cm³ · peso dimensional ${num(r.pesoDim)} kg · Amazon cobra por ${num(r.pesoEnvio)} kg (${r.ganaDimensional ? "dimensional" : "real"})</p>
<div class="res">Categoría: <b>${escapar(cat.nombre)} · tramo ${tramo}</b><br><span>${escapar(cat.limites)}</span></div>
<p>Supuestos: coste del producto ${dinero(s.coste, "€")} y envío a Amazon ${dinero(s.envio, "€")} por unidad · comisión por referencia ${num(s.comision)} % · ${num(s.meses, 1)} mes(es) de almacén (${s.temporada === "alta" ? "octubre–diciembre" : "enero–septiembre"}) · Alemania ${cep ? "con CEP" : "solo DE"} · 1 £ = ${num(eurPorGbp, 4)} € (BCE)</p>
<div class="wrap">${tablas}</div>
<p class="n">Margen = ganancia ÷ precio de venta con IVA. ROAS mínimo = precio ÷ ganancia: con un ROAS menor, la publicidad se come la ganancia. Servicios digitales sobre la comisión: ${(["ES", "DE", "FR", "UK"] as const).map((p) => `${NOMBRE_PAIS_TARIFA[p]} ${SERVICIOS_DIGITALES[p]} %`).join(", ")}. Tarifas de Amazon en vigor desde el 1 de febrero de 2026; no incluye devoluciones, tarifa por bajo inventario ni la de temporada alta.</p>
</body></html>`;
}

/** «Informe de rentabilidad»: the sale price for each margin in every store, with its costs, profit and ROAS. */
export function InformeRentabilidadFba({ estudioId, caja, r, cep, eurPorGbp }: { estudioId: string; caja: Caja; r: CalculoTarifa; cep: boolean; eurPorGbp: number }) {
  const clave = `tarifas-fba-rentabilidad-${estudioId}`;
  const [campos, setCampos] = useState<Campos>(VACIO);
  useEffect(() => {
    try {
      const g = localStorage.getItem(clave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after mounting
      if (g) setCampos({ ...VACIO, ...JSON.parse(g) });
    } catch {}
  }, [clave]);
  const cambiar = (c: Partial<Campos>) => {
    const nuevo = { ...campos, ...c };
    setCampos(nuevo);
    try {
      localStorage.setItem(clave, JSON.stringify(nuevo));
    } catch {}
  };
  const s: SupuestosRentabilidad = { coste: leer(campos.coste), envio: leer(campos.envio), comision: leer(campos.comision), meses: leer(campos.meses), temporada: campos.temporada };
  const filas = rentabilidad(r, s, eurPorGbp);
  const abrir = () => {
    const url = URL.createObjectURL(new Blob([documento(caja, r, s, filas, cep, eurPorGbp)], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo="Tus costes" subtitulo="En euros por unidad (para Reino Unido se pasan a libras al cambio del BCE). Se recuerdan en este navegador.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo etiqueta="Coste del producto" unidad="€" valor={campos.coste} onCambio={(v) => cambiar({ coste: v })} />
          <Campo etiqueta="Envío a Amazon (por unidad)" unidad="€" valor={campos.envio} onCambio={(v) => cambiar({ envio: v })} ayuda="Flete, aduanas y transporte hasta el almacén" />
          <Campo etiqueta="Comisión por referencia" unidad="%" valor={campos.comision} onCambio={(v) => cambiar({ comision: v })} ayuda="La de tu categoría (la mayoría, 15 %)" />
          <Campo etiqueta="Meses en almacén" unidad="mes" valor={campos.meses} onCambio={(v) => cambiar({ meses: v })} ayuda="Lo que pasa de media cada unidad guardada en Amazon" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-400">Almacén:</span>
          {(
            [
              ["baja", "Enero – septiembre"],
              ["alta", "Octubre – diciembre"],
            ] as const
          ).map(([t, texto]) => (
            <button
              key={t}
              onClick={() => cambiar({ temporada: t })}
              className={`rounded-md border px-2.5 py-1 ${campos.temporada === t ? "border-accent-400 bg-accent-500/15 text-accent-200" : "border-white/[0.08] text-ink-400 hover:bg-white/[0.04]"}`}
            >
              {texto}
            </button>
          ))}
          <button onClick={abrir} className="ml-auto rounded-lg bg-accent-500 px-3 py-1.5 font-medium text-ink-950 hover:bg-accent-400">
            Abrir documento en una pestaña nueva
          </button>
        </div>
        {!s.coste && <p className="mt-2 text-xs text-warning">Pon el coste del producto: sin él, los precios salen demasiado bajos.</p>}
      </Tarjeta>

      {filas.map((p) => (
        <Tarjeta
          key={p.pais}
          titulo={`${NOMBRE_PAIS_TARIFA[p.pais]} · gestión logística ${dinero(p.filas[0].logistica, p.moneda)}`}
          subtitulo={`Inventario enviado a ${ENVIO_DESDE[p.pais]} · IVA ${IVA[p.pais]} % · servicios digitales ${SERVICIOS_DIGITALES[p.pais]} % sobre la comisión${p.pais === "UK" ? ` · 1 £ = ${num(eurPorGbp, 4)} €` : ""}`}
        >
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="tabular w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-ink-400">
                  <th className="px-2 py-2 text-left font-medium">Margen</th>
                  {COLUMNAS.map((c) => (
                    <th key={c.titulo} className="px-2 py-2 text-right font-medium" title={c.ayuda}>
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.filas.map((f) => (
                  <tr key={f.margen} className="border-b border-white/[0.04]">
                    <td className="px-2 py-2 font-semibold text-ink-100">{pct(f.margen)}</td>
                    {COLUMNAS.map((c) => (
                      <td key={c.titulo} className={`px-2 py-2 text-right whitespace-nowrap ${c.fuerte ? "font-semibold text-ink-100" : "text-ink-300"}`}>
                        {c.valor(f, p.moneda)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      ))}

      <p className="text-xs leading-relaxed text-ink-500">
        Cada fila es el precio de venta (con IVA) que te deja ese margen: {MARGENES.map(pct).join(", ")}. Margen = ganancia ÷ precio. ROAS mínimo = precio ÷ ganancia: si tus anuncios
        venden con un ROAS menor, pierdes dinero en esas ventas. La comisión mínima es 0,30 por unidad. No incluye devoluciones, tarifa por bajo inventario ni la de temporada alta.
      </p>
    </div>
  );
}
