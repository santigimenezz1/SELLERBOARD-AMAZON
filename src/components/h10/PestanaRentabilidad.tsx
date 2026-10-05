"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUPUESTOS_INICIALES, type EstudioH10, type PalabrasMercado, type SupuestosRentabilidad } from "@/lib/datos/h10Tipos";
import { rentabilidadEstudio, type Dato, type RentabilidadPais } from "@/lib/datos/h10Rentabilidad";
import { nombrePais } from "@/lib/datos/h10Analisis";
import { formatNumero } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { Pais, Tarjeta } from "./comun";

const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })} €`;
const eur0 = (v: number) => `${Math.round(v).toLocaleString("es-ES", { useGrouping: "always" })} €`;
const pct = (v: number) => `${(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

/** The price split, in a fixed order (colours validated as adjacent pairs, dark surface). */
const PARTES = [
  { id: "iva", texto: "IVA", color: "#3987e5" },
  { id: "amazon", texto: "Amazon (comisión, logística, almacén)", color: "#d95926" },
  { id: "publicidad", texto: "Publicidad", color: "#199e70" },
  { id: "producto", texto: "Producto y envío", color: "#c98500" },
  { id: "devoluciones", texto: "Devoluciones", color: "#d55181" },
  { id: "beneficio", texto: "Tu beneficio", color: "#008300" },
] as const;

function Campo({ etiqueta, ayuda, valor, unidad, paso = 0.5, onCambio }: { etiqueta: string; ayuda: string; valor: number; unidad: string; paso?: number; onCambio: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-400" title={ayuda}>
      {etiqueta}
      <span className="flex items-center rounded-lg border border-white/[0.08] bg-ink-950/60 focus-within:border-accent-500/60">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={paso}
          value={Number.isFinite(valor) ? valor : 0}
          onChange={(e) => onCambio(Number(e.target.value))}
          className="tabular h-9 w-full min-w-0 bg-transparent px-3 text-sm text-ink-100 outline-none"
        />
        <span className="pr-3 text-ink-500">{unidad}</span>
      </span>
    </label>
  );
}

/** Where a figure came from, under it: the calculator, Xray or an estimate. */
const Fuente = ({ d }: { d: Dato }) => <span className={`block text-[10px] ${/Calculadora de Amazon/.test(d.fuente) ? "text-success" : "text-ink-500"}`}>{d.fuente}</span>;

/** «Rentabilidad»: what you'd make per unit and per month, with Amazon's real fees and your own costs. */
export function PestanaRentabilidad({ estudio, palabras, inicial }: { estudio: EstudioH10; palabras: Record<string, PalabrasMercado>; inicial: string }) {
  const router = useRouter();
  const guardados = estudio.supuestos ?? SUPUESTOS_INICIALES;
  const [s, setS] = useState<SupuestosRentabilidad>(guardados);
  const [guardando, setGuardando] = useState(false);
  const cambiados = JSON.stringify(s) !== JSON.stringify(guardados);
  const todos = rentabilidadEstudio(estudio, palabras, s);
  const [pais, setPais] = useState(todos.find((r) => r.codigoPais === inicial)?.codigoPais ?? todos[0]?.codigoPais);
  const r = todos.find((x) => x.codigoPais === pais) ?? todos[0];
  if (!r) return null;
  const cambiar = (k: keyof SupuestosRentabilidad) => (v: number) => setS({ ...s, [k]: Math.max(0, v) });

  const guardar = async () => {
    setGuardando(true);
    const res = await fetch(`/api/h10/estudios/${estudio.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supuestos: s }) }).catch(() => null);
    setGuardando(false);
    if (res?.ok) router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {todos.map((x) => (
          <button
            key={x.codigoPais}
            onClick={() => setPais(x.codigoPais)}
            aria-pressed={x.codigoPais === r.codigoPais}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${x.codigoPais === r.codigoPais ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            <Pais codigo={x.codigoPais} />
            {estudio.calculadoras?.[x.codigoPais] && (
              <span className="text-success" title="Con la calculadora de Amazon">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Tarjeta titulo="Tus costes" subtitulo="Lo que la calculadora de Amazon no sabe. Cámbialos y todo se recalcula al momento.">
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Producto en fábrica" ayuda="Precio por unidad del proveedor" valor={s.costeFabrica} unidad="€" onCambio={cambiar("costeFabrica")} />
            <Campo etiqueta="Envío y aduana" ayuda="Transporte hasta el almacén de Amazon más aranceles, por unidad" valor={s.envioUnidad} unidad="€" onCambio={cambiar("envioUnidad")} />
            <Campo etiqueta="Conversión de anuncios" ayuda="De cada 100 clics en tus anuncios, cuántos compran" valor={s.conversion} unidad="%" paso={1} onCambio={cambiar("conversion")} />
            <Campo etiqueta="Devoluciones" ayuda="De cada 100 unidades vendidas, cuántas se devuelven" valor={s.devoluciones} unidad="%" paso={1} onCambio={cambiar("devoluciones")} />
            <Campo etiqueta="Meses en almacén" ayuda="Lo que tarda de media una unidad en venderse desde que llega a Amazon" valor={s.mesesStock} unidad="meses" paso={0.5} onCambio={cambiar("mesesStock")} />
            <Campo etiqueta="Lanzamiento" ayuda="Gasto único al empezar: publicidad extra, Vine, fotos…" valor={s.lanzamiento} unidad="€" paso={100} onCambio={cambiar("lanzamiento")} />
          </div>
          <div className="mt-3 border-t border-white/[0.06] pt-3">
            <Campo
              etiqueta={`Tu precio en ${nombrePais(r.codigoPais)}`}
              ayuda="El precio al que venderías (IVA incluido)"
              valor={r.desglose.precio}
              unidad="€"
              paso={1}
              onCambio={(v) => setS({ ...s, precios: { ...s.precios, [r.codigoPais]: Math.max(0, v) } })}
            />
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-500">
              {r.entradas.precio.fuente}
              {s.precios?.[r.codigoPais] !== undefined && (
                <button
                  onClick={() => {
                    const resto = { ...s.precios };
                    delete resto[r.codigoPais];
                    setS({ ...s, precios: resto });
                  }}
                  className="text-accent-300 hover:text-accent-400"
                >
                  Volver al precio sugerido
                </button>
              )}
            </p>
          </div>
          {estudio.ejemplo ? (
            <p className="mt-3 text-[11px] text-ink-500">Estudio de ejemplo: los cambios no se guardan.</p>
          ) : (
            <div className="mt-3 flex items-center justify-end gap-2">
              {cambiados && (
                <button onClick={() => setS(guardados)} className="h-8 rounded-lg px-3 text-xs text-ink-400 hover:text-ink-100">
                  Deshacer
                </button>
              )}
              <button
                onClick={() => void guardar()}
                disabled={!cambiados || guardando}
                className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-40"
              >
                {guardando && <Spinner tamano="sm" />}
                {cambiados ? "Guardar mis costes" : "Guardado"}
              </button>
            </div>
          )}
        </Tarjeta>

        <div className="flex min-w-0 flex-col gap-4">
          <Cifras r={r} />
          <Reparto r={r} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Escenarios r={r} />
        <Tarjeta titulo="¿Y si cambias el precio?" subtitulo="Beneficio por unidad con todo lo demás igual (sin contar que a otro precio venderías más o menos)">
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                <th className="px-2 py-2 font-medium">Precio</th>
                <th className="px-2 py-2 text-right font-medium">Beneficio/unidad</th>
                <th className="px-2 py-2 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {r.precios.map((p) => (
                <tr key={p.precio} className={`border-b border-white/[0.05] ${p.precio === r.desglose.precio ? "bg-white/[0.03] font-medium" : ""}`}>
                  <td className="px-2 py-2">
                    {eur(p.precio)}
                    {p.precio === r.desglose.precio && <span className="ml-1.5 text-[10px] text-ink-500">actual</span>}
                  </td>
                  <td className={`px-2 py-2 text-right ${p.beneficio < 0 ? "text-danger" : "text-ink-100"}`}>{eur(p.beneficio)}</td>
                  <td className="px-2 py-2 text-right">{pct(p.margen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-400">
            Precio mínimo para no perder dinero: <strong className="tabular text-ink-100">{eur(r.precioMinimo)}</strong>
          </p>
        </Tarjeta>
      </div>

      <Comparativa todos={todos} />
    </div>
  );
}

function Cifras({ r }: { r: RentabilidadPais }) {
  const d = r.desglose;
  const tiles = [
    { t: "Beneficio por unidad", v: eur(d.beneficio), s: `vendiendo a ${eur(d.precio)}`, mal: d.beneficio < 0 },
    { t: "Margen", v: pct(r.margen), s: "del precio de venta", mal: r.margen < 0.1 },
    { t: "Retorno (ROI)", v: pct(r.roi), s: "sobre lo que pagas por el producto", mal: r.roi < 0.3 },
    { t: "ACoS máximo", v: pct(r.acosMaximo), s: "gasto en anuncios sin perder dinero", mal: r.acosMaximo < 0.15 },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((x) => (
        <div key={x.t} className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
          <p className="text-xs text-ink-400">{x.t}</p>
          <p className={`tabular mt-1 text-2xl font-semibold tracking-tight ${x.mal ? "text-danger" : "text-ink-100"}`}>{x.v}</p>
          <p className="mt-1 text-xs text-ink-400">{x.s}</p>
        </div>
      ))}
    </div>
  );
}

/** Where each euro of the price goes: one stacked bar plus the full table (identity never by colour alone). */
function Reparto({ r }: { r: RentabilidadPais }) {
  const d = r.desglose;
  const partes = {
    iva: d.iva,
    amazon: d.comision + d.tarifaFba + d.almacenamiento,
    publicidad: d.publicidad,
    producto: d.producto,
    devoluciones: d.devoluciones,
    beneficio: Math.max(d.beneficio, 0),
  };
  const total = Object.values(partes).reduce((s, v) => s + v, 0) || 1;
  const filas: { texto: string; valor: number; d?: Dato }[] = [
    { texto: "Precio de venta", valor: d.precio, d: r.entradas.precio },
    { texto: `IVA (${r.entradas.iva.valor} %)`, valor: -d.iva, d: r.entradas.iva },
    { texto: `Comisión de Amazon (${pct(r.entradas.comisionPct.valor)})`, valor: -d.comision, d: r.entradas.comisionPct },
    { texto: "Tarifa de logística FBA", valor: -d.tarifaFba, d: r.entradas.tarifaFba },
    { texto: "Almacenamiento", valor: -d.almacenamiento, d: { valor: 0, fuente: `${eur(r.entradas.almacenamientoMes.valor)} al mes · ${r.entradas.almacenamientoMes.fuente}` } },
    { texto: "Publicidad por venta", valor: -d.publicidad, d: { valor: 0, fuente: `${eur(r.entradas.pujaPpc.valor)} por clic · ${r.entradas.pujaPpc.fuente}` } },
    { texto: "Producto en fábrica + envío", valor: -d.producto, d: { valor: 0, fuente: "Tus costes" } },
    { texto: "Devoluciones", valor: -d.devoluciones, d: { valor: 0, fuente: "Tus costes" } },
  ];
  return (
    <Tarjeta titulo={`Reparto del precio en ${nombrePais(r.codigoPais)}`} subtitulo="A dónde va cada euro de una venta">
      <div className="flex h-7 w-full gap-[2px]" role="img" aria-label="Reparto del precio de venta">
        {PARTES.map((p) =>
          partes[p.id] > 0 ? (
            <span
              key={p.id}
              title={`${p.texto}: ${eur(partes[p.id])} (${pct(partes[p.id] / d.precio)})`}
              className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
              style={{ width: `${(partes[p.id] / total) * 100}%`, background: p.color }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-300">
        {PARTES.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: p.color }} />
            {p.texto} <span className="tabular text-ink-100">{eur(partes[p.id])}</span>
          </li>
        ))}
      </ul>
      {d.beneficio < 0 && <p className="mt-2 text-xs font-medium text-danger">Con estos costes pierdes {eur(-d.beneficio)} por unidad.</p>}

      <table className="tabular mt-4 w-full text-sm">
        <tbody>
          {filas.map((f) => (
            <tr key={f.texto} className="border-b border-white/[0.05]">
              <td className="py-1.5 pr-2">
                <span className="text-ink-200">{f.texto}</span>
                {f.d && <Fuente d={f.d} />}
              </td>
              <td className={`py-1.5 text-right ${f.valor < 0 ? "text-ink-300" : "font-medium text-ink-100"}`}>{eur(f.valor)}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 font-semibold text-ink-100">Te queda</td>
            <td className={`pt-2 text-right font-semibold ${d.beneficio < 0 ? "text-danger" : "text-success"}`}>{eur(d.beneficio)}</td>
          </tr>
        </tbody>
      </table>
    </Tarjeta>
  );
}

function Escenarios({ r }: { r: RentabilidadPais }) {
  return (
    <Tarjeta
      titulo="Escenarios: si consigues una parte del mercado"
      subtitulo={`La búsqueda vende unas ${formatNumero(r.unidadesMercado)} unidades al mes en ${nombrePais(r.codigoPais)}. Inversión inicial: 3 meses de stock + lanzamiento.`}
    >
      <table className="tabular w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
            <th className="px-2 py-2 font-medium">Cuota</th>
            <th className="px-2 py-2 text-right font-medium">Unidades/mes</th>
            <th className="px-2 py-2 text-right font-medium">Beneficio/mes</th>
            <th className="px-2 py-2 text-right font-medium">Inversión</th>
            <th className="px-2 py-2 text-right font-medium">La recuperas en</th>
          </tr>
        </thead>
        <tbody>
          {r.escenarios.map((e) => (
            <tr key={e.cuota} className="border-b border-white/[0.05]">
              <td className="px-2 py-2">{pct(e.cuota)}</td>
              <td className="px-2 py-2 text-right">{formatNumero(e.unidades)}</td>
              <td className={`px-2 py-2 text-right font-medium ${e.beneficioMes < 0 ? "text-danger" : "text-ink-100"}`}>{eur0(e.beneficioMes)}</td>
              <td className="px-2 py-2 text-right">{eur0(e.inversion)}</td>
              <td className="px-2 py-2 text-right">{e.mesesRecuperar !== null ? `${e.mesesRecuperar.toLocaleString("es-ES")} meses` : "nunca"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-ink-500">De octubre a diciembre Amazon cobra bastante más por el almacenamiento: no está incluido en el cálculo mensual.</p>
    </Tarjeta>
  );
}

function Comparativa({ todos }: { todos: RentabilidadPais[] }) {
  return (
    <Tarjeta titulo="Rentabilidad por país" subtitulo="Con tus costes, ordenado de más a menos beneficio por unidad. ✓ verde = con la calculadora de Amazon; el resto, estimado.">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
              <th className="px-2 py-2 font-medium">País</th>
              <th className="px-2 py-2 text-right font-medium">Precio</th>
              <th className="px-2 py-2 text-right font-medium">Tarifa FBA</th>
              <th className="px-2 py-2 text-right font-medium">Beneficio/unidad</th>
              <th className="px-2 py-2 text-right font-medium">Margen</th>
              <th className="px-2 py-2 text-right font-medium">ACoS máximo</th>
              <th className="px-2 py-2 text-right font-medium">Beneficio/mes (5 %)</th>
            </tr>
          </thead>
          <tbody>
            {todos.map((r) => (
              <tr key={r.codigoPais} className="border-b border-white/[0.05]">
                <td className="px-2 py-2">
                  <Pais codigo={r.codigoPais} />
                  {/Calculadora de Amazon/.test(r.entradas.tarifaFba.fuente) && <span className="ml-1.5 text-success">✓</span>}
                </td>
                <td className="px-2 py-2 text-right">{eur(r.desglose.precio)}</td>
                <td className="px-2 py-2 text-right">{eur(r.desglose.tarifaFba)}</td>
                <td className={`px-2 py-2 text-right font-medium ${r.desglose.beneficio < 0 ? "text-danger" : "text-ink-100"}`}>{eur(r.desglose.beneficio)}</td>
                <td className="px-2 py-2 text-right">{pct(r.margen)}</td>
                <td className="px-2 py-2 text-right">{pct(r.acosMaximo)}</td>
                <td className="px-2 py-2 text-right">{eur0(r.escenarios[1]?.beneficioMes ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
