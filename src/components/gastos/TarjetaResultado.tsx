import type { ReactNode } from "react";
import type { MesContable, Region } from "@/lib/datos/contabilidad";
import { formatEuros, formatMoneda } from "@/lib/format";
import { Bandera } from "@/components/Bandera";
import { fechaCorta, nombreMes } from "./comun";

const COMPENSACIONES: Record<string, string> = {
  REVERSAL_REIMBURSEMENT: "Reembolso al cliente sin devolver el artículo",
  WAREHOUSE_DAMAGE: "Unidad dañada en el almacén",
  WAREHOUSE_LOST: "Unidad perdida en el almacén",
  MISSING_FROM_INBOUND: "Unidades perdidas al recibir un envío",
  CUSTOMER_RETURN: "Devolución de cliente no recibida",
  FREE_REPLACEMENT_REFUND_ITEMS: "Reemplazo gratuito",
  INCORRECT_FEES_ITEMS: "Tarifa cobrada de más",
};

const total = (x: Record<Region, number>) => x.eu + x.uk;
const Region = ({ r }: { r: Region }) => (
  <span className="inline-flex items-center gap-1.5">
    {r === "uk" ? <Bandera codigo="GB" /> : <span aria-hidden className="fi fi-eu rounded-[2px]" />}
    {r === "uk" ? "Reino Unido" : "Europa"}
  </span>
);

/** A line of the statement: colored bar, name, a hint below, the signed amount; opens to its detail. */
function Fila({ color, titulo, detalle, valor, children }: { color: string; titulo: ReactNode; detalle?: ReactNode; valor: number; children?: ReactNode }) {
  const cabecera = (
    <>
      <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-100">{titulo}</span>
        {detalle && <span className="block text-[11px] text-ink-400">{detalle}</span>}
      </span>
      <span className="tabular text-sm text-ink-100">{formatEuros(valor)}</span>
    </>
  );
  if (!children)
    return (
      <li className="flex items-center gap-3 py-2.5 pr-[38px] pl-4">
        {cabecera}
      </li>
    );
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden">
          {cabecera}
          <span className="text-[10px] text-ink-500 transition-transform group-open:rotate-90">▶</span>
        </summary>
        <div className="px-4 pb-3 pl-8 text-xs">{children}</div>
      </details>
    </li>
  );
}

/** A subtotal of the statement, with its sign color. */
function Subtotal({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <li className="flex items-center gap-3 bg-white/[0.03] py-2.5 pr-[38px] pl-4">
      <span className="flex-1 pl-4 text-sm font-semibold text-ink-100">{titulo}</span>
      <span className={`tabular text-sm font-semibold ${valor >= 0 ? "text-success" : "text-danger"}`}>{formatEuros(valor)}</span>
    </li>
  );
}

/** Europe / UK split of an amount, as the detail of a line. */
function PorRegion({ valores, signo = 1, extra }: { valores: Record<Region, number>; signo?: 1 | -1; extra?: Partial<Record<Region, ReactNode>> }) {
  return (
    <table className="tabular w-full">
      <tbody className="divide-y divide-white/[0.04]">
        {(["eu", "uk"] as const)
          .filter((r) => valores[r] !== 0)
          .map((r) => (
            <tr key={r}>
              <td className="py-1.5 pr-3 text-ink-300">
                <Region r={r} />
              </td>
              <td className="py-1.5 pr-3 text-ink-400">{extra?.[r]}</td>
              <td className="py-1.5 text-right text-ink-100">{formatEuros(signo * valores[r])}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

/** The month's profit and loss, from gross sales down to the result. */
export function TarjetaResultado({ datos: m }: { datos: MesContable }) {
  const ventas = total(m.ventas);
  const iva = total(m.iva);
  const comisiones = total(m.comisiones);
  const devoluciones = total(m.devoluciones);
  const compensaciones = m.compensaciones.reduce((s, c) => s + c.eur, 0);
  const gastos = m.gastos.reduce((s, l) => s + l.eur, 0) + m.gastosEstimados.reduce((s, e) => s + e.eur, 0);
  const coste = total(m.coste);

  const ventasNetas = ventas - iva;
  const dejaAmazon = ventasNetas - comisiones - devoluciones + compensaciones;
  const antesDeCoste = dejaAmazon - gastos;
  const resultado = antesDeCoste - coste;
  const margen = ventasNetas > 0 ? (resultado / ventasNetas) * 100 : null;
  const unidades = m.unidades.eu + m.unidades.uk;

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
        <h2 className="text-[15px] leading-tight font-semibold">Cuenta de resultados de {nombreMes(m.mes, true)}</h2>
        {m.enCurso && <span className="text-xs text-white/80">Mes en curso: hasta hoy</span>}
      </header>

      <ul className="divide-y divide-white/[0.05]">
        <Fila color="#3fb68b" titulo="Ventas (IVA incluido)" detalle={`${m.pedidos} pedidos · ${unidades} unidades`} valor={ventas}>
          <PorRegion valores={m.ventas} extra={{ eu: `${m.unidades.eu} uds.`, uk: `${m.unidades.uk} uds.` }} />
        </Fila>
        <Fila color="#8a8f98" titulo="IVA de las ventas" detalle="No es tuyo: se ingresa a Hacienda (en Reino Unido lo retiene Amazon)" valor={-iva}>
          <PorRegion valores={m.iva} signo={-1} />
        </Fila>
        <Subtotal titulo="Ventas sin IVA" valor={ventasNetas} />

        <Fila
          color="#e0a526"
          titulo={
            <>
              Comisiones y tarifas por venta
              {m.comisionesEstimadas > 0 && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-normal text-warning">parte estimada</span>}
            </>
          }
          detalle="Comisión por venta, logística FBA y demás tarifas de cada pedido"
          valor={-comisiones}
        >
          <PorRegion valores={m.comisiones} signo={-1} />
          {m.comisionesEstimadas > 0 && (
            <p className="pt-2 text-[11px] leading-snug text-ink-400">
              {m.pedidosSinLiquidar} pedidos aún no los ha liquidado Amazon: sus tarifas ({formatEuros(m.comisionesEstimadas)}) se estiman con las de tus ventas anteriores de ese producto y país.
            </p>
          )}
        </Fila>
        <Fila color="#d65c5c" titulo="Devoluciones de clientes (sin IVA)" detalle="Lo devuelto a los clientes de los pedidos de este mes" valor={-devoluciones}>
          <PorRegion valores={m.devoluciones} signo={-1} />
        </Fila>
        <Fila color="#5fb3a1" titulo="Compensaciones de Amazon" detalle="Unidades perdidas o dañadas, reembolsos sin devolución…" valor={compensaciones}>
          {m.compensaciones.length === 0 ? (
            <p className="text-ink-400">Ninguna este mes.</p>
          ) : (
            <table className="tabular w-full">
              <tbody className="divide-y divide-white/[0.04]">
                {m.compensaciones.map((c, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 text-ink-400">el {fechaCorta(c.fecha)}</td>
                    <td className="py-1.5 pr-3 text-ink-300">{COMPENSACIONES[c.tipo] ?? c.tipo}</td>
                    <td className="py-1.5 text-right text-ink-100">
                      {formatMoneda(c.importe, c.moneda)}
                      {c.moneda !== "EUR" && <span className="ml-1 text-ink-400">≈ {formatEuros(c.eur)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Fila>
        <Subtotal titulo="Lo que te deja Amazon por tus ventas" valor={dejaAmazon} />

        <Fila
          color="#2c90b6"
          titulo={
            <>
              Gastos de la cuenta
              {m.gastosEstimados.length > 0 && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-normal text-warning">parte estimada</span>}
            </>
          }
          detalle="Almacenamiento, publicidad, suscripción… (detalle en el cuadro de arriba)"
          valor={-gastos}
        />
        <Subtotal titulo="Resultado antes del coste de la mercancía" valor={antesDeCoste} />

        <Fila
          color="#e07b4f"
          titulo={
            <>
              Coste de la mercancía vendida
              {m.unidadesSinCoste > 0 && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-normal text-warning">faltan costes</span>}
            </>
          }
          detalle="Unidades vendidas × su coste del escandallo (con inspección y flete)"
          valor={-coste}
        >
          <PorRegion valores={m.coste} signo={-1} />
          {m.sinCoste.length > 0 && (
            <div className="pt-2 text-[11px] leading-snug text-warning">
              <p>Sin coste guardado en su escandallo (no se restan):</p>
              <ul className="mt-1 space-y-0.5">
                {m.sinCoste.map((x) => (
                  <li key={`${x.asin}-${x.region}`}>
                    {x.unidades} uds. · {x.asin} ({x.region === "uk" ? "Reino Unido" : "Europa"}) · <span className="text-ink-400">{x.titulo.slice(0, 60)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Fila>
      </ul>

      <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] bg-white/[0.03] py-3 pr-[38px] pl-4">
        <p className="text-[11px] leading-snug text-ink-500">
          Ventas, comisiones, devoluciones y coste van por la fecha del pedido. Las tarifas y gastos de Amazon incluyen el IVA que Amazon les suma: si lo deduces en tus declaraciones, el resultado real es algo
          mejor. Libras al cambio del BCE del día.
        </p>
        <p className="shrink-0 text-right">
          <span className="block text-[11px] text-ink-400">{resultado >= 0 ? "Beneficio del mes" : "Pérdida del mes"}</span>
          <span className={`tabular block text-xl font-semibold ${resultado >= 0 ? "text-success" : "text-danger"}`}>{formatEuros(resultado)}</span>
          {margen !== null && <span className="block text-[11px] text-ink-400">{margen.toFixed(1).replace(".", ",")} % sobre ventas sin IVA</span>}
          {m.unidadesSinCoste > 0 && <span className="block text-[11px] text-warning">Incompleto: faltan costes de {m.unidadesSinCoste} uds.</span>}
        </p>
      </div>
    </article>
  );
}
