"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Ticket } from "@/lib/datos/tickets";
import { Spinner } from "@/components/Spinner";
import { formatDiaLargo, formatMoneda } from "@/lib/format";

const MAXIMO = 15 * 1024 * 1024;
/** Photos are shrunk to this longest side before uploading: plenty for reading a ticket, ~10× lighter. */
const LADO_MAXIMO = 2000;
/** Tickets uploaded (and read by the AI) at the same time. */
const SIMULTANEOS = 3;
/** Where this browser remembers which months are open (they start folded). */
const CLAVE_ABIERTOS = "tickets.mesesAbiertos";
const campo = "h-9 w-full rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60";

/** The ticket's date, or the upload day while it has none. */
const diaDe = (t: Ticket) => t.fecha ?? t.subidoEn.slice(0, 10);
const nombreMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return n.charAt(0).toUpperCase() + n.slice(1);
};
/** A month's tickets split by day, in the order they come. */
const porDia = (lista: Ticket[]) => {
  const dias = new Map<string, Ticket[]>();
  // Undated tickets go apart from the dated ones of their upload day.
  for (const t of lista) {
    const clave = t.fecha ? t.fecha : `${diaDe(t)} sin fecha`;
    dias.set(clave, [...(dias.get(clave) ?? []), t]);
  }
  return [...dias];
};
/** "Martes 14", or «Sin fecha · subido el 14» while the AI found none. */
const nombreDia = (dia: string, t: Ticket) => {
  const n = new Date(`${dia.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", timeZone: "UTC" });
  return t.fecha ? n : `Sin fecha · subido el ${n}`;
};
const sumaPorMoneda = (lista: Ticket[]) => {
  const s = new Map<string, number>();
  for (const t of lista) if (t.total !== null) s.set(t.moneda, (s.get(t.moneda) ?? 0) + t.total);
  return [...s].map(([moneda, v]) => formatMoneda(Math.round(v * 100) / 100, moneda)).join(" + ") || "—";
};

/** A photo shrunk to JPEG (a ticket doesn't need 12 megapixels); PDFs and what the browser can't open go as they are. */
async function preparar(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif") return archivo;
  try {
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}

/** «Tickets»: upload photos of purchase tickets, the AI reads them and they're listed by date, month by month. */
export function VistaTickets({ tickets, iaConfigurada }: { tickets: Ticket[]; iaConfigurada: boolean }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [anio, setAnio] = useState<string>("todos");
  const [cola, setCola] = useState<{ hecho: number; total: number } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  const anios = [...new Set(tickets.map((t) => diaDe(t).slice(0, 4)))].sort().reverse();
  const q = busqueda.trim().toLowerCase();
  const visibles = tickets
    .filter((t) => anio === "todos" || diaDe(t).startsWith(anio))
    .filter((t) => !q || `${t.comercio} ${t.concepto} ${t.nota}`.toLowerCase().includes(q))
    .sort((a, b) => diaDe(b).localeCompare(diaDe(a)) || b.subidoEn.localeCompare(a.subidoEn));
  const meses = new Map<string, Ticket[]>();
  for (const t of visibles) meses.set(diaDe(t).slice(0, 7), [...(meses.get(diaDe(t).slice(0, 7)) ?? []), t]);
  const porRevisar = tickets.filter((t) => t.lectura === "error" || !t.fecha).length;

  // Months start folded; the ones opened are remembered in this browser. While searching every month opens, so no
  // match stays hidden.
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const guardados = JSON.parse(localStorage.getItem(CLAVE_ABIERTOS) ?? "[]") as string[];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount: localStorage doesn't exist on the server
      if (Array.isArray(guardados)) setAbiertos(new Set(guardados));
    } catch {}
  }, []);
  const cambiarAbiertos = (nuevos: Set<string>) => {
    setAbiertos(nuevos);
    try {
      localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify([...nuevos]));
    } catch {}
  };
  const abierto = (mes: string) => !!q || abiertos.has(mes);
  const plegar = (mes: string) => {
    const nuevos = new Set(abiertos);
    if (nuevos.has(mes)) nuevos.delete(mes);
    else nuevos.add(mes);
    cambiarAbiertos(nuevos);
  };
  const todosCerrados = [...meses.keys()].every((m) => !abiertos.has(m));

  // Leaving the page mid-upload would stop the tickets still waiting: the browser asks first.
  useEffect(() => {
    if (!cola) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cola]);

  const subir = async (archivos: File[]) => {
    if (!archivos.length || cola) return;
    setErrores([]);
    setCola({ hecho: 0, total: archivos.length });
    const fallos: string[] = [];
    let siguiente = 0;
    let hechos = 0;
    // A few at a time: the AI takes several seconds per ticket, so 100 tickets go ~3× faster.
    const trabajador = async () => {
      while (siguiente < archivos.length) {
        const a = archivos[siguiente++];
        try {
          if (a.size > MAXIMO) throw new Error("pasa de 15 MB");
          const f = new FormData();
          f.set("archivo", await preparar(a));
          const r = await fetch("/api/tickets", { method: "POST", body: f });
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          if (!r.ok) throw new Error(b.error ?? `error ${r.status}`);
        } catch (e) {
          fallos.push(`${a.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`);
        }
        hechos++;
        setCola({ hecho: hechos, total: archivos.length });
        if (hechos % 5 === 0) router.refresh();
      }
    };
    await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, archivos.length) }, trabajador));
    setErrores(fallos);
    setCola(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {!iaConfigurada && (
        <p role="alert" className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-sm text-accent-300">
          Falta la clave de la IA (<code>ANTHROPIC_API_KEY</code>): los tickets se guardan, pero tendrás que rellenar los datos a mano.
        </p>
      )}
      <Subida ocupado={cola} onSubir={subir} />
      {errores.length > 0 && (
        <ul role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
          <h2 className="text-[15px] leading-tight font-semibold">
            Tickets
            {porRevisar > 0 && <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">{porRevisar} por revisar</span>}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <select
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              aria-label="Año"
              className="h-8 rounded-md border border-white/30 bg-white/15 px-2 text-sm text-white outline-none focus:border-white [&>option]:text-ink-950"
            >
              <option value="todos">Todos los años</option>
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {tickets.length > 0 && (
              <BotonDescarga
                periodo={anio === "todos" ? "todo" : anio}
                texto={anio === "todos" ? "Descargar todo" : `Descargar ${anio}`}
                titulo="Descarga un ZIP con los tickets ordenados en carpetas por año y mes, y un Excel resumen"
                tamano="md"
              />
            )}
            <label className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
              <span className="sr-only">Buscar</span>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por comercio o concepto…"
                className="h-8 w-full rounded-md border border-white/30 bg-white/15 px-2.5 text-sm text-white placeholder:text-white/70 outline-none focus:border-white"
              />
            </label>
          </div>
        </header>
        {visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-400">{tickets.length === 0 ? "Aún no hay tickets. Sube el primero arriba." : "No hay tickets que coincidan."}</p>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {!q && meses.size > 1 && (
              <div className="flex justify-end px-4 py-1.5">
                <button
                  onClick={() => cambiarAbiertos(todosCerrados ? new Set(meses.keys()) : new Set())}
                  className="rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-white/[0.05] hover:text-ink-100"
                >
                  {todosCerrados ? "Desplegar todos los meses" : "Plegar todos los meses"}
                </button>
              </div>
            )}
            {[...meses].map(([mes, lista]) => (
              <section key={mes}>
                <h3 className="flex items-center gap-2.5 bg-white/[0.03] pr-4 text-sm font-semibold text-ink-100">
                  <button
                    onClick={() => plegar(mes)}
                    aria-expanded={abierto(mes)}
                    aria-controls={`mes-${mes}`}
                    title={abierto(mes) ? "Plegar el mes" : "Desplegar el mes"}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-4 text-left hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" className={`size-4 shrink-0 text-ink-400 transition-transform ${abierto(mes) ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate">{nombreMes(mes)}</span>
                    <span className="text-xs font-normal text-ink-400">
                      {lista.length} {lista.length === 1 ? "ticket" : "tickets"} · <span className="tabular font-medium text-ink-100">{sumaPorMoneda(lista)}</span>
                    </span>
                  </button>
                  <BotonDescarga periodo={mes} texto="Descargar mes" titulo={`Descargar ${nombreMes(mes).toLowerCase()} en un ZIP`} tamano="sm" />
                </h3>
                <div id={`mes-${mes}`} hidden={!abierto(mes)}>
                  {porDia(lista).map(([dia, delDia]) => (
                    <div key={dia}>
                      <p className="flex items-center gap-2 border-t border-white/[0.04] px-4 pt-2.5 pb-1 text-[11px] font-medium tracking-wide text-ink-500 uppercase">
                        <span className="flex-1">{nombreDia(dia, delDia[0])}</span>
                        {delDia.length > 1 && (
                          <span className="tabular normal-case">
                            {delDia.length} tickets · {sumaPorMoneda(delDia)}
                          </span>
                        )}
                        <BotonDescarga periodo={dia.slice(0, 10)} texto="Descargar día" titulo="Descargar los tickets de este día en un ZIP" tamano="xs" />
                      </p>
                      <ul className="divide-y divide-white/[0.05]">
                        {delDia.map((t) => (
                          <FilaTicket key={t.id} t={t} onCambio={() => router.refresh()} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] text-ink-500">
          {visibles.length} {visibles.length === 1 ? "ticket" : "tickets"} · {sumaPorMoneda(visibles)} · Privados: solo se abren con tu sesión iniciada.
        </p>
      </article>
    </div>
  );
}

/** The classic download icon: an arrow down onto a tray. */
function IconoDescarga({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v11M7 10l5 5 5-5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

const TAMANOS_DESCARGA = {
  md: "h-8 gap-1.5 px-3 text-sm [&>svg]:size-4",
  sm: "h-7 gap-1.5 px-2.5 text-xs [&>svg]:size-3.5",
  xs: "h-6 gap-1 px-2 text-[11px] [&>svg]:size-3",
};

/** Green button that downloads a period's tickets as a ZIP: everything, a year, a month or a day. */
function BotonDescarga({ periodo, texto, titulo, tamano }: { periodo: string; texto: string; titulo: string; tamano: keyof typeof TAMANOS_DESCARGA }) {
  return (
    <a
      href={`/api/tickets/descargar?periodo=${periodo}`}
      title={titulo}
      className={`inline-flex shrink-0 items-center rounded-md bg-success font-medium tracking-normal whitespace-nowrap normal-case text-ink-950 transition-all hover:brightness-110 active:scale-[0.97] ${TAMANOS_DESCARGA[tamano]}`}
    >
      <IconoDescarga className="" />
      <span className={tamano === "md" ? "" : "hidden sm:inline"}>{texto}</span>
    </a>
  );
}

/** Drop zone: drag, paste (Ctrl+V), pick files or take a photo on the phone. */
function Subida({ ocupado, onSubir }: { ocupado: { hecho: number; total: number } | null; onSubir: (archivos: File[]) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  useEffect(() => {
    const pegar = (e: ClipboardEvent) => {
      if (!e.clipboardData?.files.length) return;
      e.preventDefault();
      void onSubir([...e.clipboardData.files]);
    };
    window.addEventListener("paste", pegar);
    return () => window.removeEventListener("paste", pegar);
  });

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        void onSubir([...e.dataTransfer.files]);
      }}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors ${encima ? "border-accent-500/70 bg-accent-500/10" : "border-white/[0.12] bg-ink-900/50"}`}
    >
      {ocupado ? (
        <p className="flex items-center gap-2.5 text-sm text-ink-200">
          <Spinner tamano="sm" />
          {ocupado.total === 1 ? "Subiendo y leyendo el ticket con IA…" : `Subiendo y leyendo con IA: ${ocupado.hecho} de ${ocupado.total} listos…`}
        </p>
      ) : (
        <p className="text-sm text-ink-300">
          Arrastra, pega (Ctrl+V) o haz una foto de tus tickets <span className="text-ink-500">· la IA lee la fecha, el comercio y el total</span>
        </p>
      )}
      <button
        onClick={() => input.current?.click()}
        disabled={!!ocupado}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-ink-950 transition-all hover:bg-accent-400 active:scale-[0.97] disabled:opacity-60"
      >
        <span aria-hidden>＋</span> Subir tickets
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          void onSubir([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** One ticket: thumbnail, shop, date, total; edit, read again with AI, delete. */
function FilaTicket({ t, onCambio }: { t: Ticket; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const inicial = () => ({ fecha: t.fecha ?? "", comercio: t.comercio, concepto: t.concepto, total: t.total?.toString() ?? "", iva: t.iva?.toString() ?? "", moneda: t.moneda, nota: t.nota });
  const [datos, setDatos] = useState(inicial);
  const [ocupado, setOcupado] = useState<"guardar" | "releer" | "borrar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revisar = t.lectura === "error" || !t.fecha;

  const pedir = async (accion: "guardar" | "releer" | "borrar") => {
    setOcupado(accion);
    setError(null);
    try {
      const metodo = { guardar: "PATCH", releer: "POST", borrar: "DELETE" }[accion];
      const cuerpo = accion === "guardar" ? JSON.stringify({ ...datos, total: datos.total.replace(",", "."), iva: datos.iva.replace(",", ".") }) : undefined;
      const r = await fetch(`/api/tickets/${t.id}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      setEditando(false);
      setConfirmar(false);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <a href={`/api/tickets/${t.id}`} target="_blank" rel="noopener" className="block size-14 shrink-0 overflow-hidden rounded-md border border-white/[0.08] bg-ink-950/60">
          {t.tipo.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/tickets/${t.id}`} alt={`Ticket de ${t.comercio || "compra"}`} loading="lazy" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[10px] font-bold text-ink-300">PDF</span>
          )}
        </a>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-100">
            {t.comercio || <span className="text-ink-400 italic">Comercio sin leer</span>}
            {revisar && <span className="ml-2 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-medium text-accent-300">Revisar</span>}
          </p>
          <p className="truncate text-[11px] text-ink-400">
            {t.fecha ? formatDiaLargo(t.fecha) : "Sin fecha"}
            {t.concepto && ` · ${t.concepto}`}
            {t.iva !== null && ` · IVA ${formatMoneda(t.iva, t.moneda)}`}
          </p>
          {t.lectura === "error" && t.error && <p className="truncate text-[11px] text-danger">{t.error}</p>}
        </div>
        <span className="tabular shrink-0 text-sm font-semibold text-ink-100">{formatMoneda(t.total, t.moneda)}</span>
        <a
          href={`/api/tickets/${t.id}?descargar=1`}
          title="Descargar este ticket"
          className="shrink-0 rounded-md px-2 py-1.5 text-xs text-ink-300 hover:bg-white/[0.05] hover:text-ink-100"
        >
          <span className="inline-flex items-center gap-1">
            <IconoDescarga className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Descargar</span>
          </span>
        </a>
        <button
          onClick={() => {
            setDatos(inicial());
            setEditando(!editando);
          }}
          className="shrink-0 rounded-md px-2 py-1.5 text-xs text-ink-300 hover:bg-white/[0.05] hover:text-ink-100"
        >
          Editar
        </button>
      </div>

      {editando && (
        <div className="mt-3 grid gap-3 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ink-400">
            Fecha
            <input type="date" className={campo} value={datos.fecha} onChange={(e) => setDatos({ ...datos, fecha: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-400">
            Comercio
            <input className={campo} value={datos.comercio} onChange={(e) => setDatos({ ...datos, comercio: e.target.value })} maxLength={100} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-400 sm:col-span-2">
            Concepto
            <input className={campo} value={datos.concepto} onChange={(e) => setDatos({ ...datos, concepto: e.target.value })} maxLength={120} />
          </label>
          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            <label className="flex flex-col gap-1 text-xs text-ink-400">
              Total
              <input inputMode="decimal" className={campo} value={datos.total} onChange={(e) => setDatos({ ...datos, total: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">
              IVA
              <input inputMode="decimal" className={campo} value={datos.iva} onChange={(e) => setDatos({ ...datos, iva: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-400">
              Moneda
              <select className={campo} value={datos.moneda} onChange={(e) => setDatos({ ...datos, moneda: e.target.value })}>
                {[...new Set(["EUR", "GBP", "USD", datos.moneda])].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-ink-400 sm:col-span-2">
            Nota
            <input className={campo} value={datos.nota} onChange={(e) => setDatos({ ...datos, nota: e.target.value })} maxLength={500} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            {confirmar ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-ink-100">¿Borrarlo? No se puede deshacer.</span>
                <button onClick={() => void pedir("borrar")} disabled={!!ocupado} className="rounded-md bg-danger px-2.5 py-1 font-medium text-white hover:bg-danger/80">
                  Sí, borrar
                </button>
                <button onClick={() => setConfirmar(false)} className="rounded-md px-2 py-1 text-ink-300 hover:text-ink-100">
                  No
                </button>
              </span>
            ) : (
              <span className="flex gap-1">
                <button onClick={() => setConfirmar(true)} disabled={!!ocupado} className="h-8 rounded-lg px-3 text-xs text-danger hover:bg-danger/10">
                  Borrar
                </button>
                <button onClick={() => void pedir("releer")} disabled={!!ocupado} className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
                  {ocupado === "releer" && <Spinner tamano="sm" />}
                  Volver a leer con IA
                </button>
              </span>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)} disabled={!!ocupado} className="h-8 rounded-lg px-3 text-xs text-ink-400 hover:text-ink-100">
                Cancelar
              </button>
              <button
                onClick={() => void pedir("guardar")}
                disabled={!!ocupado}
                className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
              >
                {ocupado === "guardar" && <Spinner tamano="sm" />}
                Guardar
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-danger sm:col-span-2">{error}</p>}
        </div>
      )}
    </li>
  );
}
