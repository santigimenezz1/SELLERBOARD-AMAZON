"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { formatDiaLargo, formatMoneda } from "@/lib/format";
import { PERIODICIDADES, alMes, diasEntre, porVencer, proximoPago, type Periodicidad, type Suscripcion } from "@/lib/datos/suscripcionesCalc";

const campo = "h-9 w-full rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60";
const textoPeriodo = (p: Periodicidad) => PERIODICIDADES.find((x) => x.valor === p)!.texto.toLowerCase();

/** «Hoy», «Mañana», «En 5 días». */
const cuando = (dias: number) => (dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} días`);

/** Amounts added up per currency: «45,98 € + 12,00 £». */
function sumar(lista: Suscripcion[], valor: (s: Suscripcion) => number): string {
  const s = new Map<string, number>();
  for (const x of lista) s.set(x.moneda, (s.get(x.moneda) ?? 0) + valor(x));
  return [...s].map(([moneda, v]) => formatMoneda(Math.round(v * 100) / 100, moneda)).join(" + ") || "—";
}

/** «Suscripciones»: recurring payments, when each renews, and a warning when one is close. */
export function VistaSuscripciones({ lista, hoy }: { lista: Suscripcion[]; hoy: string }) {
  const router = useRouter();
  const [nueva, setNueva] = useState(false);
  const conFecha = lista.map((s) => ({ s, fecha: proximoPago(s, hoy) })).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.s.nombre.localeCompare(b.s.nombre));
  const activas = conFecha.filter((x) => x.s.activa);
  const canceladas = conFecha.filter((x) => !x.s.activa);
  const avisos = porVencer(lista, hoy);
  const siguiente = activas[0];

  return (
    <div className="flex flex-col gap-4">
      {avisos.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 rounded-xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-300">
          {avisos.map((s) => {
            const dias = diasEntre(hoy, proximoPago(s, hoy));
            return (
              <li key={s.id}>
                ⏰ <span className="font-medium text-ink-100">{s.nombre}</span> se paga {dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`} ({formatDiaLargo(proximoPago(s, hoy))}):{" "}
                <span className="tabular font-medium text-ink-100">{formatMoneda(s.importe, s.moneda)}</span>
                {s.metodo && <span className="text-accent-300/80"> · {s.metodo}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="Al mes" valor={sumar(activas.map((x) => x.s), alMes)} detalle="las anuales, repartidas en 12 meses" />
        <Cifra titulo="Al año" valor={sumar(activas.map((x) => x.s), (s) => alMes(s) * 12)} detalle={`${activas.length} ${activas.length === 1 ? "suscripción activa" : "suscripciones activas"}`} />
        <Cifra
          titulo="Próximo pago"
          valor={siguiente ? formatMoneda(siguiente.s.importe, siguiente.s.moneda) : "—"}
          detalle={siguiente ? `${siguiente.s.nombre} · ${formatDiaLargo(siguiente.fecha)}` : "sin suscripciones"}
        />
        <Cifra titulo="Avisos" valor={String(avisos.length)} detalle={avisos.length ? "pagos dentro de su aviso" : "nada a la vista"} />
      </div>

      <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink-100">Tus suscripciones</h2>
          {!nueva && (
            <button
              onClick={() => setNueva(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-ink-950 transition-all hover:bg-accent-400 active:scale-[0.97]"
            >
              <span aria-hidden>＋</span> Añadir suscripción
            </button>
          )}
        </header>
        {nueva && (
          <div className="border-b border-white/[0.06] p-4">
            <Formulario
              hoy={hoy}
              onListo={() => {
                setNueva(false);
                router.refresh();
              }}
              onCancelar={() => setNueva(false)}
            />
          </div>
        )}
        {lista.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-400">Aún no hay suscripciones. Añade la primera: Helium 10, Seller Central, el gestor, el dominio…</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {activas.map(({ s, fecha }) => (
              <Fila key={s.id} s={s} fecha={fecha} hoy={hoy} onCambio={() => router.refresh()} />
            ))}
            {canceladas.length > 0 && <li className="bg-white/[0.03] px-4 py-2 text-[11px] font-medium tracking-wide text-ink-500 uppercase">Canceladas</li>}
            {canceladas.map(({ s, fecha }) => (
              <Fila key={s.id} s={s} fecha={fecha} hoy={hoy} onCambio={() => router.refresh()} />
            ))}
          </ul>
        )}
      </article>
      <p className="text-[11px] text-ink-500">
        La fecha del próximo pago avanza sola cuando pasa (cada mes, trimestre, semestre o año). Los avisos salen aquí y como un punto naranja en «Suscripciones» del menú.
      </p>
    </div>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-ink-900/80 px-4 py-3 shadow-soft">
      <p className="text-xs text-ink-400">{titulo}</p>
      <p className="tabular mt-1 truncate text-xl font-semibold text-ink-100">{valor}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-500">{detalle}</p>
    </div>
  );
}

/** One subscription: name, amount, next payment and how far it is; editing opens the form under it. */
function Fila({ s, fecha, hoy, onCambio }: { s: Suscripcion; fecha: string; hoy: string; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const dias = diasEntre(hoy, fecha);
  const cerca = s.activa && dias <= s.avisarDias;
  return (
    <li className={`px-4 py-3 ${s.activa ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-100">{s.nombre}</p>
          <p className="truncate text-[11px] text-ink-400">
            {PERIODICIDADES.find((p) => p.valor === s.periodicidad)!.texto}
            {s.metodo && ` · ${s.metodo}`}
            {s.nota && ` · ${s.nota}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-sm font-semibold text-ink-100">{formatMoneda(s.importe, s.moneda)}</p>
          <p className="text-[11px] text-ink-500">{textoPeriodo(s.periodicidad)}</p>
        </div>
        <div className="w-28 shrink-0 text-right sm:w-36">
          {s.activa ? (
            <>
              <p className="text-xs text-ink-200">{formatDiaLargo(fecha)}</p>
              <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${cerca ? "bg-accent-500/15 text-accent-300" : "bg-white/[0.05] text-ink-400"}`}>{cuando(dias)}</span>
            </>
          ) : (
            <p className="text-xs text-ink-500">Cancelada</p>
          )}
        </div>
        <button onClick={() => setEditando(!editando)} className="shrink-0 rounded-md px-2 py-1.5 text-xs text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
          Editar
        </button>
      </div>
      {editando && (
        <div className="mt-3">
          <Formulario
            s={s}
            hoy={hoy}
            onListo={() => {
              setEditando(false);
              onCambio();
            }}
            onCancelar={() => setEditando(false)}
          />
        </div>
      )}
    </li>
  );
}

/** Add (without `s`) or edit a subscription; editing also cancels/reactivates or deletes it. */
function Formulario({ s, hoy, onListo, onCancelar }: { s?: Suscripcion; hoy: string; onListo: () => void; onCancelar: () => void }) {
  const [datos, setDatos] = useState({
    nombre: s?.nombre ?? "",
    importe: s?.importe.toString().replace(".", ",") ?? "",
    moneda: s?.moneda ?? "EUR",
    periodicidad: s?.periodicidad ?? ("mensual" as Periodicidad),
    // Editing shows the next payment, not the first one stored.
    fechaPago: s ? proximoPago(s, hoy) : "",
    avisarDias: String(s?.avisarDias ?? 7),
    metodo: s?.metodo ?? "",
    nota: s?.nota ?? "",
  });
  const [ocupado, setOcupado] = useState<"guardar" | "activa" | "borrar" | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (k: keyof typeof datos) => (e: { target: { value: string } }) => setDatos({ ...datos, [k]: e.target.value });

  const pedir = async (accion: "guardar" | "activa" | "borrar") => {
    setOcupado(accion);
    setError(null);
    try {
      const url = s ? `/api/suscripciones/${s.id}` : "/api/suscripciones";
      const metodo = accion === "borrar" ? "DELETE" : s ? "PATCH" : "POST";
      const cuerpo = accion === "borrar" ? undefined : JSON.stringify(accion === "activa" ? { activa: !s!.activa } : datos);
      const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void pedir("guardar");
      }}
      className="grid gap-3 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1 text-xs text-ink-400 sm:col-span-2">
        Nombre
        <input className={campo} value={datos.nombre} onChange={cambiar("nombre")} maxLength={80} placeholder="Helium 10, Seller Central, gestoría…" required autoFocus={!s} />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Importe
          <input inputMode="decimal" className={campo} value={datos.importe} onChange={cambiar("importe")} placeholder="39,00" required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400">
          Moneda
          <select className={campo} value={datos.moneda} onChange={cambiar("moneda")}>
            {[...new Set(["EUR", "USD", "GBP", datos.moneda])].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Cada cuánto se paga
        <select className={campo} value={datos.periodicidad} onChange={cambiar("periodicidad")}>
          {PERIODICIDADES.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.texto}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Próximo pago
        <input type="date" className={campo} value={datos.fechaPago} onChange={cambiar("fechaPago")} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Avisarme con
        <select className={campo} value={datos.avisarDias} onChange={cambiar("avisarDias")}>
          {[...new Set([1, 3, 7, 14, 30, Number(datos.avisarDias)])]
            .sort((a, b) => a - b)
            .map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "1 día" : `${d} días`} de antelación
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-400">
        Cómo se paga
        <input className={campo} value={datos.metodo} onChange={cambiar("metodo")} maxLength={60} placeholder="Tarjeta BBVA, PayPal…" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-400 sm:col-span-2">
        Nota
        <input className={campo} value={datos.nota} onChange={cambiar("nota")} maxLength={300} placeholder="Plan, cuenta, cuándo cancelarla…" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        {s ? (
          confirmar ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-ink-100">¿Borrarla? No se puede deshacer.</span>
              <button type="button" onClick={() => void pedir("borrar")} disabled={!!ocupado} className="rounded-md bg-danger px-2.5 py-1 font-medium text-white hover:bg-danger/80">
                Sí, borrar
              </button>
              <button type="button" onClick={() => setConfirmar(false)} className="rounded-md px-2 py-1 text-ink-300 hover:text-ink-100">
                No
              </button>
            </span>
          ) : (
            <span className="flex gap-1">
              <button type="button" onClick={() => setConfirmar(true)} disabled={!!ocupado} className="h-8 rounded-lg px-3 text-xs text-danger hover:bg-danger/10">
                Borrar
              </button>
              <button type="button" onClick={() => void pedir("activa")} disabled={!!ocupado} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
                {ocupado === "activa" && <Spinner tamano="sm" />}
                {s.activa ? "Marcar como cancelada" : "Reactivar"}
              </button>
            </span>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} disabled={!!ocupado} className="h-8 rounded-lg px-3 text-xs text-ink-400 hover:text-ink-100">
            Cancelar
          </button>
          <button type="submit" disabled={!!ocupado} className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60">
            {ocupado === "guardar" && <Spinner tamano="sm" />}
            {s ? "Guardar" : "Añadir"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
    </form>
  );
}
