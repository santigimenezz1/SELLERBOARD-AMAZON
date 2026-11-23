"use client";

import { useEffect, useRef, useState } from "react";
import type { EnvioWallapop, TipoEnvio } from "@/lib/datos/wallapop";
import { Spinner } from "@/components/Spinner";

const MAXIMO = 15 * 1024 * 1024;

/** `boton`: the color of its upload button on the dark page (InPost's dark grey wouldn't show). */
const TODOS_TIPOS: { id: TipoEnvio; nombre: string; color: string; texto: string; boton: string }[] = [
  { id: "vinted", nombre: "Vinted", color: "#09b1ba", texto: "#04363a", boton: "#09b1ba" },
  { id: "correos", nombre: "Correos", color: "#ffcd00", texto: "#3d3100", boton: "#ffcd00" },
  { id: "inpost", nombre: "InPost", color: "#2b2b2b", texto: "#ffcd00", boton: "#f5b800" },
  { id: "seur", nombre: "SEUR", color: "#0047bb", texto: "#ffffff", boton: "#4d8eff" },
  // No longer offered: only so cards uploaded before still show right.
  { id: "wallapop", nombre: "Wallapop", color: "#13c1ac", texto: "#043a33", boton: "#13c1ac" },
  // Uploaded without choosing and couldn't be told: the user picks it on the card.
  { id: "desconocido", nombre: "Sin identificar", color: "#6b7280", texto: "#ffffff", boton: "#9ca3af" },
];
/** The carriers offered (upload buttons, filters, the card's picker). */
const TIPOS = TODOS_TIPOS.filter((t) => t.id !== "wallapop" && t.id !== "desconocido");
/** Order of the groups when sorted by carrier (unidentified first, to fix them; old Wallapop cards last). */
const ORDEN_EMPRESAS: TipoEnvio[] = ["desconocido", "vinted", "correos", "inpost", "seur", "wallapop"];
const CLAVE_ORDEN = "wallapop.orden";
const tipoDe = (id: TipoEnvio) => TODOS_TIPOS.find((t) => t.id === id) ?? TODOS_TIPOS[0];

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const esPdf = (e: EnvioWallapop) => e.contentType === "application/pdf";
const src = (e: EnvioWallapop) => `/api/wallapop/${e.id}`;

function Etiqueta({ tipo, ia }: { tipo: TipoEnvio; ia?: boolean }) {
  const t = tipoDe(tipo);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-black/20" style={{ background: t.color, color: t.texto }}>
      {t.nombre}
      {ia && (
        <span title="Empresa detectada por la IA" className="rounded bg-black/25 px-1 text-[9px] leading-tight">
          IA
        </span>
      )}
    </span>
  );
}

/** The carrier's label; tapping it lets you change the carrier (a native select laid invisibly over it). */
function EtiquetaEditable({ envio, soloLectura, onCambiar }: { envio: EnvioWallapop; soloLectura: boolean; onCambiar: (tipo: TipoEnvio) => void }) {
  const etiqueta = <Etiqueta tipo={envio.tipo} ia={envio.identificadoPor === "ia"} />;
  if (soloLectura) return etiqueta;
  return (
    <span className="relative inline-flex cursor-pointer" title="Cambiar la empresa" onClick={(ev) => ev.stopPropagation()}>
      {etiqueta}
      <select
        aria-label="Empresa"
        value={envio.tipo}
        onChange={(ev) => onCambiar(ev.target.value as TipoEnvio)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {envio.tipo === "desconocido" && <option value="desconocido">Elige la empresa…</option>}
        {TODOS_TIPOS.filter((t) => TIPOS.includes(t) || t.id === envio.tipo).map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>
    </span>
  );
}

/** The text of a PDF's first pages, read in the browser, so the carrier is found without AI (free). */
async function textoDePdf(archivo: File): Promise<string> {
  try {
    const m = await cargarPdfJs();
    const doc = await m.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
    let texto = "";
    for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
      const c = await (await doc.getPage(n)).getTextContent();
      texto += c.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
    }
    return texto;
  } catch {
    return "";
  }
}

// ---------- PDF drawn in the browser (labels with their QR) ----------

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;
/** pdf.js is loaded as a plain file from /public (bundled, pdf.js 4 breaks: «Object.defineProperty called on non-object»). */
const RUTA_PDFJS = "/pdf.min.mjs";
const cargarPdfJs = () =>
  (pdfjs ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ RUTA_PDFJS) as Promise<PdfJs>).then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  })).catch((e) => {
    pdfjs = null;
    throw e;
  });
/** Each PDF is downloaded once per page visit, shared by its card and the big view. */
const documentos = new Map<string, Promise<Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>>>();
const abrirPdf = (e: EnvioWallapop) => {
  let d = documentos.get(e.id);
  if (!d) {
    d = cargarPdfJs().then(async (m) => {
      const r = await fetch(`${src(e)}?bytes=1`);
      if (!r.ok) throw new Error(`error ${r.status}`);
      return m.getDocument({ data: new Uint8Array(await r.arrayBuffer()) }).promise;
    });
    d.catch(() => documentos.delete(e.id));
    documentos.set(e.id, d);
  }
  return d;
};

/**
 * A PDF drawn on canvases: its first page in a card (`miniatura`), or every page as wide as `ancho` in the big
 * view. Drawn at the screen's pixel density, so the QR stays sharp enough to scan.
 */
function VistaPdf({ envio, miniatura, ancho }: { envio: EnvioWallapop; miniatura?: boolean; ancho: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelado = false;
    const destino = caja.current;
    (async () => {
      try {
        const doc = await abrirPdf(envio);
        const paginas = miniatura ? 1 : doc.numPages;
        const lienzos: HTMLCanvasElement[] = [];
        for (let n = 1; n <= paginas; n++) {
          const pagina = await doc.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const densidad = Math.min(3, window.devicePixelRatio || 1) * (miniatura ? 1 : 1.5);
          const vista = pagina.getViewport({ scale: (ancho / base.width) * densidad });
          const lienzo = document.createElement("canvas");
          lienzo.width = Math.round(vista.width);
          lienzo.height = Math.round(vista.height);
          lienzo.className = miniatura ? "h-full w-full object-contain bg-white" : "w-full rounded-lg bg-white";
          await pagina.render({ canvasContext: lienzo.getContext("2d")!, viewport: vista }).promise;
          lienzos.push(lienzo);
          if (cancelado) return;
        }
        if (cancelado || !destino) return;
        destino.replaceChildren(...lienzos);
        setEstado("ok");
      } catch (e) {
        console.error("[wallapop] PDF", e);
        if (!cancelado) {
          setError(e instanceof Error ? e.message : String(e));
          setEstado("error");
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [envio, miniatura, ancho]);
  return (
    <div className={miniatura ? "relative h-full w-full bg-white" : "relative flex w-full flex-col gap-3"}>
      <div ref={caja} className={miniatura ? "h-full w-full" : "flex flex-col gap-3"} />
      {estado === "cargando" && (
        <div className={`flex items-center justify-center text-sm ${miniatura ? "absolute inset-0 text-ink-500" : "py-20 text-ink-300"}`}>
          <Spinner tamano="sm" />
        </div>
      )}
      {/* Couldn't draw it: the browser's own PDF viewer instead (same site, so it isn't blocked). */}
      {estado === "error" &&
        (miniatura ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink-950/80 p-3 text-center text-xs text-ink-300">
            <span className="text-2xl">📄</span>
            <span>PDF · toca para verlo</span>
            <span className="line-clamp-3 text-[10px] text-ink-500">{error}</span>
          </div>
        ) : (
          <iframe src={`${src(envio)}?bytes=1`} title={envio.nombre} className="h-[80vh] w-full rounded-lg bg-white" />
        ))}
    </div>
  );
}

// ---------- Product text (editable) ----------

function CampoProducto({ envio, soloLectura, onGuardar, grande }: { envio: EnvioWallapop; soloLectura: boolean; onGuardar: (texto: string) => Promise<void>; grande?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(envio.producto ?? "");
  const [guardando, setGuardando] = useState(false);
  const actual = envio.producto ?? "";
  const guardar = async () => {
    const t = texto.trim();
    setEditando(false);
    if (t === actual) return;
    setGuardando(true);
    try {
      await onGuardar(t);
    } catch {
      setTexto(actual);
    } finally {
      setGuardando(false);
    }
  };
  const tamano = grande ? "text-sm" : "text-xs";
  if (editando)
    return (
      <input
        autoFocus
        value={texto}
        maxLength={200}
        placeholder="¿Qué producto es?"
        onChange={(ev) => setTexto(ev.target.value)}
        onBlur={guardar}
        onClick={(ev) => ev.stopPropagation()}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") ev.currentTarget.blur();
          if (ev.key === "Escape") {
            ev.stopPropagation();
            setTexto(actual);
            setEditando(false);
          }
        }}
        className={`h-7 min-w-0 flex-1 rounded-md border border-accent-500/60 bg-ink-950/80 px-2 ${tamano} text-ink-100 outline-none`}
      />
    );
  return (
    <button
      type="button"
      disabled={soloLectura}
      onClick={(ev) => {
        ev.stopPropagation();
        setTexto(actual);
        setEditando(true);
      }}
      title={soloLectura ? actual : "Editar el producto"}
      className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-0.5 text-left ${tamano} ${actual ? "font-medium text-ink-100" : "italic text-ink-500"} enabled:hover:bg-white/[0.06]`}
    >
      {guardando ? "Guardando…" : actual || (soloLectura ? "" : "＋ Producto")}
      {!soloLectura && actual && !guardando && <span className="ml-1 text-ink-500">✎</span>}
    </button>
  );
}

/** «Wallapop»: upload the labels of Vinted, Wallapop, Correos and InPost shipments; each one is a card, pending until delivered. */
export function VistaWallapop({ envios, soloLectura }: { envios: EnvioWallapop[]; soloLectura: boolean }) {
  const [lista, setLista] = useState(envios);
  const [vista, setVista] = useState<"pendientes" | "entregadas">("pendientes");
  const [filtro, setFiltro] = useState<TipoEnvio | "todos">("todos");
  // The chosen order is remembered in this browser.
  const [orden, setOrden] = useState<"recientes" | "empresa">("empresa");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount: localStorage doesn't exist on the server
      if (localStorage.getItem(CLAVE_ORDEN) === "recientes") setOrden("recientes");
    } catch {}
  }, []);
  const cambiarOrden = (o: "recientes" | "empresa") => {
    setOrden(o);
    try {
      localStorage.setItem(CLAVE_ORDEN, o);
    } catch {}
  };
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [productoNuevo, setProductoNuevo] = useState("");
  const entradas = useRef<Partial<Record<TipoEnvio, HTMLInputElement | null>>>({});
  const entradaAuto = useRef<HTMLInputElement | null>(null);
  const abierto = lista.find((e) => e.id === abiertoId) ?? null;

  const pendientes = lista.filter((e) => !e.entregadoEn);
  const entregadas = lista.filter((e) => e.entregadoEn).sort((a, b) => b.entregadoEn!.localeCompare(a.entregadoEn!));
  const base = vista === "pendientes" ? pendientes : entregadas;
  const visibles = base.filter((e) => filtro === "todos" || e.tipo === filtro);
  // «Por empresa»: every carrier's parcels together (Vinted, Correos, InPost, Wallapop), so they're handed over in one go.
  const grupos: [TipoEnvio | null, EnvioWallapop[]][] =
    orden === "empresa" ? ORDEN_EMPRESAS.map((t) => [t, visibles.filter((e) => e.tipo === t)] as [TipoEnvio, EnvioWallapop[]]).filter(([, l]) => l.length > 0) : [[null, visibles]];
  const cuenta = (tipo: TipoEnvio) => base.filter((e) => e.tipo === tipo).length;

  /** `tipo` "auto": the server finds the carrier (PDF text first, read here for free; then the AI). */
  const subir = async (tipo: TipoEnvio | "auto", archivos: File[]) => {
    if (!archivos.length || subiendo) return;
    setErrores([]);
    setSubiendo({ hecho: 0, total: archivos.length });
    const fallos: string[] = [];
    const nuevos: EnvioWallapop[] = [];
    for (const [i, a] of archivos.entries()) {
      try {
        if (a.size > MAXIMO) throw new Error("pasa de 15 MB");
        const f = new FormData();
        f.set("archivo", a);
        f.set("tipo", tipo);
        f.set("producto", productoNuevo);
        if (tipo === "auto" && a.type === "application/pdf") f.set("texto", await textoDePdf(a));
        const r = await fetch("/api/wallapop", { method: "POST", body: f });
        const b = (await r.json().catch(() => ({}))) as { error?: string; envio?: EnvioWallapop };
        if (!r.ok || !b.envio) throw new Error(b.error ?? `error ${r.status}`);
        nuevos.push(b.envio);
      } catch (e) {
        fallos.push(`${a.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`);
      }
      setSubiendo({ hecho: i + 1, total: archivos.length });
    }
    setLista((l) => [...nuevos.reverse(), ...l]);
    setErrores(fallos);
    setSubiendo(null);
    setVista("pendientes");
    if (nuevos.length) setProductoNuevo("");
  };

  /** Saves a change; the card shows it at once and goes back if the server says no. */
  const editar = async (e: EnvioWallapop, cambios: { entregado?: boolean; producto?: string; tipo?: TipoEnvio }) => {
    const antes = lista;
    const optimista: EnvioWallapop = {
      ...e,
      ...(cambios.tipo !== undefined && { tipo: cambios.tipo, identificadoPor: undefined }),
      ...(cambios.producto !== undefined && { producto: cambios.producto }),
      ...(cambios.entregado !== undefined && { entregadoEn: cambios.entregado ? new Date().toISOString() : null }),
    };
    setLista((l) => l.map((x) => (x.id === e.id ? optimista : x)));
    try {
      const r = await fetch(`/api/wallapop/${e.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(cambios) });
      const b = (await r.json().catch(() => ({}))) as { error?: string; envio?: EnvioWallapop };
      if (!r.ok || !b.envio) throw new Error(b.error ?? `error ${r.status}`);
      setLista((l) => l.map((x) => (x.id === e.id ? b.envio! : x)));
    } catch (err) {
      setLista(antes);
      setErrores([`No se pudo guardar: ${err instanceof Error ? err.message : "error"}`]);
      throw err;
    }
  };
  const marcar = async (e: EnvioWallapop, entregado: boolean) => {
    setOcupado(e.id);
    await editar(e, { entregado }).catch(() => {});
    setOcupado(null);
  };

  const borrar = async (e: EnvioWallapop) => {
    if (!confirm(`¿Borrar «${e.producto || e.nombre}»? Se elimina el archivo y no se puede deshacer.`)) return;
    setOcupado(e.id);
    try {
      const r = await fetch(`/api/wallapop/${e.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `error ${r.status}`);
      setLista((l) => l.filter((x) => x.id !== e.id));
      if (abiertoId === e.id) setAbiertoId(null);
    } catch (err) {
      setErrores([`No se pudo borrar: ${err instanceof Error ? err.message : "error"}`]);
    } finally {
      setOcupado(null);
    }
  };

  // Esc closes the big view.
  useEffect(() => {
    if (!abiertoId) return;
    const tecla = (ev: KeyboardEvent) => ev.key === "Escape" && setAbiertoId(null);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abiertoId]);

  return (
    <div className="flex flex-col gap-5">
      {!soloLectura && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-400 sm:max-w-md">
            Producto (opcional, se pone en las tarjetas que subas ahora)
            <input
              value={productoNuevo}
              maxLength={200}
              onChange={(ev) => setProductoNuevo(ev.target.value)}
              placeholder="Ej.: Portería plegable 2 uds"
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60"
            />
          </label>
          <button
            type="button"
            disabled={!!subiendo}
            onClick={() => entradaAuto.current?.click()}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-accent-500/60 px-4 py-5 text-accent-400 transition-colors hover:bg-accent-500/[0.06] disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <span className="text-xl leading-none">＋</span> Subir envíos
            </span>
            <span className="text-xs text-ink-400">Elige varios a la vez, de cualquier empresa: se detecta sola (y el producto, si aparece)</span>
            <input
              ref={entradaAuto}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(ev) => {
                const archivos = [...(ev.target.files ?? [])];
                ev.target.value = "";
                void subir("auto", archivos);
              }}
            />
          </button>
          <p className="text-xs text-ink-500">O súbelos indicando tú la empresa:</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={!!subiendo}
                onClick={() => entradas.current[t.id]?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                style={{ borderColor: `${t.boton}80`, color: t.boton }}
              >
                <span className="text-lg leading-none">＋</span> Subir {t.nombre}
                <input
                  ref={(el) => {
                    entradas.current[t.id] = el;
                  }}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  hidden
                  onChange={(ev) => {
                    const archivos = [...(ev.target.files ?? [])];
                    ev.target.value = "";
                    void subir(t.id, archivos);
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {subiendo && (
        <div className="flex items-center gap-2 text-sm text-ink-300">
          <Spinner tamano="sm" /> Subiendo e identificando {subiendo.hecho} de {subiendo.total}…
        </div>
      )}
      {errores.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errores.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/[0.08] p-0.5">
          {(
            [
              ["pendientes", `Pendientes (${pendientes.length})`],
              ["entregadas", `Entregadas (${entregadas.length})`],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${vista === id ? "bg-white/[0.08] text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-400">
          Ordenar
          <select
            value={orden}
            onChange={(ev) => cambiarOrden(ev.target.value as "recientes" | "empresa")}
            className="h-8 rounded-lg border border-white/[0.08] bg-ink-950/60 px-2 text-sm text-ink-100 outline-none focus:border-accent-500/60"
          >
            <option value="recientes">Más recientes primero</option>
            <option value="empresa">Por empresa (Vinted, Correos, InPost, SEUR)</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === "todos" ? "border-white/30 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            Todos ({base.length})
          </button>
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFiltro(t.id)}
              className={`rounded-full border px-3 py-1 text-xs ${filtro === t.id ? "text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
              style={filtro === t.id ? { borderColor: t.boton } : undefined}
            >
              {t.nombre} ({cuenta(t.id)})
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] px-4 py-10 text-center text-sm text-ink-400">
          {vista === "pendientes" ? "No hay envíos pendientes." : "Todavía no has entregado ningún envío."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map(([tipo, envios]) => (
            <section key={tipo ?? "todos"} className="flex flex-col gap-3">
              {tipo && (
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-200">
                  <Etiqueta tipo={tipo} />
                  <span className="text-ink-400">
                    {envios.length} {envios.length === 1 ? "paquete" : "paquetes"}
                  </span>
                </h2>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {envios.map((e) => (
            <div
              key={e.id}
              className={`flex flex-col overflow-hidden rounded-xl border-4 bg-white/[0.02] ${ocupado === e.id ? "opacity-60" : ""}`}
              style={{ borderColor: tipoDe(e.tipo).boton }}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-950/60">
                <button type="button" onClick={() => setAbiertoId(e.id)} className="block h-full w-full" title="Ver">
                  {esPdf(e) ? (
                    <VistaPdf envio={e} miniatura ancho={260} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- private image behind a signed-link redirect
                    <img src={src(e)} alt={e.producto || e.nombre} loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-[1.03]" />
                  )}
                </button>
                {/* On top of the image: the carrier and, under it, the product (editable). */}
                <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col items-start gap-1">
                  <span className="pointer-events-auto">
                    <EtiquetaEditable envio={e} soloLectura={soloLectura} onCambiar={(tipo) => void editar(e, { tipo }).catch(() => {})} />
                  </span>
                  <div className="pointer-events-auto flex max-w-full rounded-md bg-ink-950/85 shadow-lg ring-1 ring-white/10 backdrop-blur">
                    <CampoProducto key={e.producto ?? ""} envio={e} soloLectura={soloLectura} onGuardar={(producto) => editar(e, { producto })} />
                  </div>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2.5">
                <p className="truncate text-xs text-ink-400" title={e.nombre}>
                  {e.nombre}
                </p>
                {e.entregadoEn && <p className="text-xs text-ink-500">Entregado {fechaHora(e.entregadoEn)}</p>}
                {!soloLectura && (
                  <div className="mt-auto flex gap-1.5">
                    {e.entregadoEn ? (
                      <button type="button" disabled={ocupado === e.id} onClick={() => marcar(e, false)} className="flex-1 rounded-lg border border-white/[0.1] px-2 py-1.5 text-xs text-ink-300 hover:bg-white/[0.05]">
                        ↩ A pendiente
                      </button>
                    ) : (
                      <button type="button" disabled={ocupado === e.id} onClick={() => marcar(e, true)} className="flex-1 rounded-lg bg-success/90 px-2 py-1.5 text-xs font-semibold text-ink-950 hover:bg-success">
                        ✓ Entregado
                      </button>
                    )}
                    <button type="button" disabled={ocupado === e.id} onClick={() => borrar(e)} title="Borrar" className="rounded-lg border border-white/[0.1] px-2 py-1.5 text-xs text-ink-400 hover:border-danger/50 hover:text-danger">
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
              ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-3 sm:p-6" onClick={() => setAbiertoId(null)}>
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 pb-3" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <EtiquetaEditable envio={abierto} soloLectura={soloLectura} onCambiar={(tipo) => void editar(abierto, { tipo }).catch(() => {})} />
              <CampoProducto key={abierto.producto ?? ""} envio={abierto} soloLectura={soloLectura} grande onGuardar={(producto) => editar(abierto, { producto })} />
            </div>
            <div className="flex shrink-0 gap-2">
              {!soloLectura &&
                (abierto.entregadoEn ? (
                  <button type="button" onClick={() => marcar(abierto, false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10">
                    ↩ A pendiente
                  </button>
                ) : (
                  <button type="button" onClick={() => marcar(abierto, true)} className="rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-ink-950">
                    ✓ Entregado
                  </button>
                ))}
              <a href={src(abierto)} target="_blank" rel="noreferrer" className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10">
                Abrir
              </a>
              <button type="button" onClick={() => setAbiertoId(null)} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10" aria-label="Cerrar">
                ✕
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 justify-center overflow-y-auto">
            {esPdf(abierto) ? (
              <div className="w-full max-w-3xl" onClick={(ev) => ev.stopPropagation()}>
                <VistaPdf envio={abierto} ancho={720} />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- private image behind a signed-link redirect
              <img src={src(abierto)} alt={abierto.producto || abierto.nombre} className="max-h-full max-w-full self-center rounded-lg object-contain" onClick={(ev) => ev.stopPropagation()} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
