"use client";

import { useEffect, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { ANCHOS, COLORES_NOTA, type NodoVariante, type TableroVariantes, type TipoNodo } from "@/lib/datos/variantesTipos";

/** Buttons floating over the board. */
const flotante = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-ink-900/90 px-2.5 text-xs text-ink-200 backdrop-blur transition-colors hover:bg-ink-800 disabled:opacity-40";
/** Where this browser remembers the open board. */
const CLAVE_TABLERO = "variantes.tablero";
/** Images are shrunk to this longest side before uploading. */
const LADO_MAXIMO = 1200;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 3;
/** Height of the title above each image (with its margin). */
const ALTO_TITULO = 26;
/** The board fills the screen's width and nearly all its height (what's left under the menu and the title). */
const MARCO = "relative left-1/2 h-[calc(100dvh-12rem)] min-h-[420px] w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-white/[0.08] bg-black";
/** The frame of an image by level: listing orange, variant blue, part grey. */
const ANILLO: Record<Exclude<TipoNodo, "nota">, string> = { producto: "ring-accent-500/70", variante: "ring-[#3987e5]/70", componente: "ring-white/20" };
type ProductoPropio = { asin: string; titulo: string };

/** A photo shrunk (PNG stays PNG, so cut-out images keep their transparent background). */
async function preparar(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif" || archivo.type === "image/svg+xml") return archivo;
  try {
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    if (escala === 1) return archivo;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const png = archivo.type === "image/png";
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, png ? "image/png" : "image/jpeg", 0.88));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + (png ? ".png" : ".jpg"), { type: blob.type });
  } catch {
    return archivo;
  }
}

type Caja = { x: number; y: number; ancho: number; alto: number };

/** Where the line from a box's centre towards (dx, dy) leaves the box, with a small gap. */
function borde(n: Caja, dx: number, dy: number): [number, number] {
  const s = Math.min(dx ? (n.ancho / 2 + 6) / Math.abs(dx) : Infinity, dy ? (n.alto / 2 + 6) / Math.abs(dy) : Infinity);
  return [n.x + n.ancho / 2 + dx * s, n.y + n.alto / 2 + dy * s];
}

/** A curved arrow between two boxes: it bends along whichever direction is longer, like a mind map. */
function curva(a: Caja, b: Caja): string | null {
  const dx = b.x + b.ancho / 2 - (a.x + a.ancho / 2);
  const dy = b.y + b.alto / 2 - (a.y + a.alto / 2);
  if (!dx && !dy) return null;
  const [x1, y1] = borde(a, dx, dy);
  const [x2, y2] = borde(b, -dx, -dy);
  const [c1, c2] = Math.abs(dx) >= Math.abs(dy) ? [`${(x1 + x2) / 2} ${y1}`, `${(x1 + x2) / 2} ${y2}`] : [`${x1} ${(y1 + y2) / 2}`, `${x2} ${(y1 + y2) / 2}`];
  return `M${x1} ${y1} C${c1} ${c2} ${x2} ${y2}`;
}

/**
 * Tidy layout as a tree read left to right: each level in its own column and every element centred on what hangs
 * from it. `alto` gives each element's height on the board.
 */
function organizar(nodos: NodoVariante[], alto: (n: NodoVariante) => number): Map<string, { x: number; y: number }> {
  const ids = new Set(nodos.map((n) => n.id));
  const hijos = (id: string) => nodos.filter((n) => n.padre === id).sort((a, b) => a.y - b.y);
  const raices = nodos.filter((n) => !n.padre || !ids.has(n.padre)).sort((a, b) => a.y - b.y);
  const nivel = new Map<string, number>();
  const marcar = (n: NodoVariante, d: number) => {
    nivel.set(n.id, d);
    hijos(n.id).forEach((h) => marcar(h, d + 1));
  };
  raices.forEach((r) => marcar(r, 0));
  const anchoNivel: number[] = [];
  for (const n of nodos) {
    const d = nivel.get(n.id) ?? 0;
    anchoNivel[d] = Math.max(anchoNivel[d] ?? 0, n.ancho);
  }
  const columna: number[] = [0];
  for (let d = 1; d < anchoNivel.length; d++) columna[d] = columna[d - 1] + (anchoNivel[d - 1] ?? 0) + 180;
  const pos = new Map<string, { x: number; y: number }>();
  /** Places `n` and what hangs from it from `arriba` down; returns where the next one can start. */
  const colocar = (n: NodoVariante, arriba: number): number => {
    const propio = alto(n) + 40;
    let y = arriba;
    for (const h of hijos(n.id)) y = colocar(h, y);
    const bloque = y - arriba;
    pos.set(n.id, { x: columna[nivel.get(n.id) ?? 0], y: Math.round(arriba + Math.max(0, (bloque - propio) / 2)) });
    return Math.max(y, arriba + propio);
  };
  let y = 0;
  for (const r of raices) y = colocar(r, y) + 100;
  return pos;
}

/** «Variantes»: endless boards with images and coloured notes joined by arrows. */
export function VistaVariantes({ tableros, productos }: { tableros: TableroVariantes[]; productos: ProductoPropio[] }) {
  const router = useRouter();
  const [elegido, setElegido] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount: localStorage doesn't exist on the server
      setElegido(localStorage.getItem(CLAVE_TABLERO));
    } catch {}
  }, []);
  const t = tableros.find((x) => x.id === elegido) ?? tableros[0];
  const [nombreNuevo, setNombreNuevo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegir = (id: string) => {
    setElegido(id);
    try {
      localStorage.setItem(CLAVE_TABLERO, id);
    } catch {}
  };
  const crear = async () => {
    setError(null);
    const r = await fetch("/api/variantes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nombreNuevo }) }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string; tablero?: TableroVariantes } | undefined;
    if (!r?.ok || !b?.tablero) return setError(b?.error ?? "No se pudo crear");
    setNombreNuevo(null);
    elegir(b.tablero.id);
    router.refresh();
  };

  const tableroYNuevo = (
    <>
      {tableros.length > 0 && (
        <select value={t?.id} onChange={(e) => elegir(e.target.value)} aria-label="Tablero" className="h-8 max-w-52 rounded-lg border border-white/[0.1] bg-ink-900/90 px-2 text-xs text-ink-100 outline-none">
          {tableros.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      )}
      {nombreNuevo === null ? (
        <button onClick={() => setNombreNuevo("")} className={flotante}>
          <span aria-hidden>＋</span> Tablero
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void crear();
          }}
          className="flex items-center gap-1.5"
        >
          <input autoFocus value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} maxLength={80} placeholder="Nombre (ej. Rebounder negro)" className="h-8 w-52 rounded-lg border border-white/[0.1] bg-ink-900/90 px-2.5 text-xs text-ink-100 outline-none focus:border-accent-500/60" />
          <button type="submit" className="h-8 rounded-lg bg-accent-500 px-2.5 text-xs font-medium text-ink-950 hover:bg-accent-400">
            Crear
          </button>
          <button type="button" onClick={() => setNombreNuevo(null)} className="h-8 px-1.5 text-xs text-ink-400 hover:text-ink-100">
            Cancelar
          </button>
        </form>
      )}
      {error && <span className="rounded-md bg-danger/15 px-2 py-1 text-xs text-danger">{error}</span>}
    </>
  );

  if (!t)
    return (
      <div className={MARCO}>
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">{tableroYNuevo}</div>
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-400">Crea tu primer tablero con «＋ Tablero».</p>
      </div>
    );
  return <Lienzo key={t.id} t={t} productos={productos} cabecera={tableroYNuevo} onBorrado={() => router.refresh()} />;
}

type Arrastre = { tipo: "nodo"; id: string; offX: number; offY: number; inicioX: number; inicioY: number; movido: boolean } | { tipo: "vista"; inicioX: number; inicioY: number; px: number; py: number };
type Vista = { px: number; py: number; zoom: number };

/** One board: the endless black canvas (middle button or empty space to move around, wheel to zoom). */
function Lienzo({ t, productos, cabecera, onBorrado }: { t: TableroVariantes; productos: ProductoPropio[]; cabecera: ReactNode; onBorrado: () => void }) {
  const router = useRouter();
  // Local copy so dragging and editing are instant; it follows the server's whenever the page data changes.
  const [base, setBase] = useState(t.nodos);
  const [nodos, setNodos] = useState(t.nodos);
  if (base !== t.nodos) {
    setBase(t.nodos);
    setNodos(t.nodos);
  }
  /** Image height / width of each image, known once it loads. */
  const [proporcion, setProporcion] = useState<Record<string, number>>({});
  /** Height of each note card, measured on screen (it grows with its text). */
  const [altoNota, setAltoNota] = useState<Record<string, number>>({});
  const [vista, setVista] = useState<Vista>({ px: 80, py: 80, zoom: 1 });
  const [elegido, setElegido] = useState<string | null>(null);
  /** The title or note being typed into. */
  const [editando, setEditando] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const marco = useRef<HTMLDivElement>(null);
  const capa = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const inputImagen = useRef<HTMLInputElement>(null);

  const seleccionado = nodos.find((n) => n.id === elegido) ?? null;
  // The box arrows start and end at: an image without its title, a note as it is.
  const caja = (n: NodoVariante): Caja =>
    n.tipo === "nota" ? { x: n.x, y: n.y, ancho: n.ancho, alto: altoNota[n.id] ?? 60 } : { x: n.x, y: n.y + ALTO_TITULO, ancho: n.ancho, alto: n.ancho * (proporcion[n.id] ?? 1) };
  const altoTotal = (n: NodoVariante) => (n.tipo === "nota" ? caja(n).alto : ALTO_TITULO + caja(n).alto);

  // Notes grow with their text: their height is measured to aim the arrows.
  useEffect(() => {
    const c = capa.current;
    if (!c) return;
    const obs = new ResizeObserver((entradas) => {
      setAltoNota((a) => {
        const nuevo = { ...a };
        for (const e of entradas) {
          const id = (e.target as HTMLElement).dataset.nota;
          if (id) nuevo[id] = (e.target as HTMLElement).offsetHeight;
        }
        return nuevo;
      });
    });
    c.querySelectorAll<HTMLElement>("[data-nota]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [nodos]);

  /** Fits every element on screen. */
  const encuadrar = () => {
    const m = marco.current;
    if (!m || !nodos.length) return setVista({ px: 80, py: 80, zoom: 1 });
    const x0 = Math.min(...nodos.map((n) => n.x)) - 60;
    const y0 = Math.min(...nodos.map((n) => n.y)) - 60;
    const x1 = Math.max(...nodos.map((n) => n.x + n.ancho)) + 60;
    const y1 = Math.max(...nodos.map((n) => n.y + altoTotal(n))) + 60;
    const zoom = Math.min(1, Math.max(ZOOM_MIN, Math.min(m.clientWidth / (x1 - x0), (m.clientHeight - 50) / (y1 - y0))));
    setVista({ zoom, px: (m.clientWidth - (x1 - x0) * zoom) / 2 - x0 * zoom, py: 50 + (m.clientHeight - 50 - (y1 - y0) * zoom) / 2 - y0 * zoom });
  };
  // Fits the board when it opens, and again after importing a listing (once its elements arrive).
  const encuadrado = useRef(false);
  useEffect(() => {
    if (encuadrado.current) return;
    encuadrado.current = true;
    encuadrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.nodos]);

  // Wheel = zoom towards the pointer. Added by hand: React's wheel listener can't stop the page from scrolling.
  useEffect(() => {
    const m = marco.current;
    if (!m) return;
    const rueda = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("textarea")) return;
      e.preventDefault();
      const r = m.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setVista((v) => {
        const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * Math.exp(-e.deltaY * 0.0015)));
        return { zoom, px: mx - (mx - v.px) * (zoom / v.zoom), py: my - (my - v.py) * (zoom / v.zoom) };
      });
    };
    m.addEventListener("wheel", rueda, { passive: false });
    return () => m.removeEventListener("wheel", rueda);
  }, []);

  const zoomCentro = (factor: number) => {
    const m = marco.current;
    if (!m) return;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vista.zoom * factor));
    const mx = m.clientWidth / 2;
    const my = m.clientHeight / 2;
    setVista({ zoom, px: mx - (mx - vista.px) * (zoom / vista.zoom), py: my - (my - vista.py) * (zoom / vista.zoom) });
  };

  /** A screen point in board coordinates. */
  const enLienzo = (clientX: number, clientY: number) => {
    const r = marco.current!.getBoundingClientRect();
    return { x: (clientX - r.left - vista.px) / vista.zoom, y: (clientY - r.top - vista.py) / vista.zoom };
  };
  /** Where a new element goes: right of the selected one (under its other children), else the middle of the screen. */
  const sitioNuevo = (ancho: number) => {
    if (seleccionado) {
      const hermanos = nodos.filter((n) => n.padre === seleccionado.id);
      const abajo = hermanos.length ? Math.max(...hermanos.map((h) => h.y + altoTotal(h))) + 40 : seleccionado.y;
      return { x: seleccionado.x + seleccionado.ancho + 160, y: abajo };
    }
    const r = marco.current!.getBoundingClientRect();
    const c = enLienzo(r.left + r.width / 2, r.top + r.height / 2);
    return { x: c.x - ancho / 2, y: c.y - ancho / 2 };
  };

  /** Moves the board just enough for a new element to be fully on screen (clear of the toolbar). */
  const mostrar = (n: Pick<NodoVariante, "x" | "y" | "ancho">) => {
    const m = marco.current;
    if (!m) return;
    const margen = 40;
    setVista((v) => {
      const izq = v.px + n.x * v.zoom;
      const der = izq + n.ancho * v.zoom;
      const arriba = v.py + n.y * v.zoom;
      const abajo = arriba + 160 * v.zoom;
      const dx = der > m.clientWidth - margen ? m.clientWidth - margen - der : izq < margen ? margen - izq : 0;
      const dy = abajo > m.clientHeight - margen ? m.clientHeight - margen - abajo : arriba < 60 ? 60 - arriba : 0;
      return dx || dy ? { ...v, px: v.px + dx, py: v.py + dy } : v;
    });
  };

  const guardar = async (id: string, cambios: Partial<NodoVariante>) => {
    const r = await fetch(`/api/variantes/${t.id}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) }).catch(() => null);
    if (!r?.ok) setError(((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "No se pudo guardar");
    return !!r?.ok;
  };
  const cambiar = (id: string, cambios: Partial<NodoVariante>) => setNodos((ns) => ns.map((n) => (n.id === id ? { ...n, ...cambios } : n)));

  /** An image: hangs from the selected element (a variant from a listing, a part from anything else), or on its own. */
  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    try {
      const padre = seleccionado && seleccionado.tipo !== "nota" ? seleccionado : null;
      const tipo: TipoNodo = !padre ? "producto" : padre.tipo === "producto" ? "variante" : "componente";
      const { x, y } = sitioNuevo(ANCHOS[tipo]);
      const f = new FormData();
      f.set("archivo", await preparar(archivo));
      f.set("tipo", tipo);
      f.set("x", String(Math.round(x)));
      f.set("y", String(Math.round(y)));
      if (padre) f.set("padre", padre.id);
      const r = await fetch(`/api/variantes/${t.id}`, { method: "POST", body: f });
      const b = (await r.json().catch(() => ({}))) as { error?: string; nodo?: NodoVariante };
      if (!r.ok || !b.nodo) throw new Error(b.error ?? `Error ${r.status}`);
      setElegido(b.nodo.id);
      mostrar(b.nodo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  };
  /** A coloured note, with its arrow from the selected element; it opens ready to type. */
  const nota = async () => {
    setError(null);
    const { x, y } = sitioNuevo(ANCHOS.nota);
    const r = await fetch(`/api/variantes/${t.id}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padre: seleccionado?.id ?? null, x: Math.round(x), y: Math.round(y), color: seleccionado?.tipo === "nota" ? seleccionado.color : undefined }),
    }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string; nodo?: NodoVariante } | undefined;
    if (!r?.ok || !b?.nodo) return setError(b?.error ?? "No se pudo crear la nota");
    setNodos((ns) => [...ns, b.nodo!]);
    setElegido(b.nodo.id);
    setEditando(b.nodo.id);
    mostrar(b.nodo);
    router.refresh();
  };
  const importar = async (asin: string) => {
    if (!asin) return;
    setError(null);
    setImportando(true);
    const r = await fetch(`/api/variantes/${t.id}/importar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asin }) }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setImportando(false);
    if (!r?.ok) return setError(b?.error ?? "No se pudo importar");
    encuadrado.current = false;
    router.refresh();
  };
  const ordenar = async () => {
    const pos = organizar(nodos, altoTotal);
    setNodos((ns) => ns.map((n) => ({ ...n, ...pos.get(n.id) })));
    const r = await fetch(`/api/variantes/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ posiciones: [...pos].map(([id, p]) => ({ id, ...p })) }) }).catch(() => null);
    if (!r?.ok) setError("No se pudo guardar el orden");
    requestAnimationFrame(() => encuadrar());
  };
  const borrar = async (id: string) => {
    const r = await fetch(`/api/variantes/${t.id}/${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setError("No se pudo borrar");
    setElegido(null);
    setNodos((ns) => ns.filter((n) => n.id !== id).map((n) => (n.padre === id ? { ...n, padre: ns.find((x) => x.id === id)?.padre ?? null } : n)));
    router.refresh();
  };

  // Mouse and finger: on an element it moves the element; the middle button, or empty space, moves the whole board.
  const empezarVista = (e: EventoPuntero<HTMLDivElement>) => {
    if (e.button !== 1 && e.button !== 0) return;
    if (e.button === 0 && e.target !== e.currentTarget) return;
    if (e.button === 1) e.preventDefault(); // no browser autoscroll
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { tipo: "vista", inicioX: e.clientX, inicioY: e.clientY, px: vista.px, py: vista.py };
    if (e.button === 0) {
      setElegido(null);
      setEditando(null);
    }
  };
  const empezarNodo = (e: EventoPuntero<HTMLDivElement>, n: NodoVariante) => {
    if (e.button !== 0 || editando === n.id) return; // the middle button falls through to the board; typing isn't dragging
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = enLienzo(e.clientX, e.clientY);
    arrastre.current = { tipo: "nodo", id: n.id, offX: p.x - n.x, offY: p.y - n.y, inicioX: e.clientX, inicioY: e.clientY, movido: false };
  };
  const mover = (e: EventoPuntero<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (a.tipo === "vista") return setVista((v) => ({ ...v, px: a.px + e.clientX - a.inicioX, py: a.py + e.clientY - a.inicioY }));
    if (!a.movido && Math.hypot(e.clientX - a.inicioX, e.clientY - a.inicioY) < 4) return;
    a.movido = true;
    const p = enLienzo(e.clientX, e.clientY);
    cambiar(a.id, { x: Math.round(p.x - a.offX), y: Math.round(p.y - a.offY) });
  };
  const soltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.tipo === "vista") return;
    if (!a.movido) {
      if (a.id !== editando) setEditando(null);
      return setElegido(a.id);
    }
    const n = nodos.find((x) => x.id === a.id);
    if (n) void guardar(n.id, { x: n.x, y: n.y });
  };

  /** Saves a title or note being typed into, when leaving it. */
  const terminarEdicion = (n: NodoVariante) => {
    setEditando(null);
    const original = t.nodos.find((x) => x.id === n.id);
    if (n.tipo === "nota" ? original?.notas !== n.notas : original?.nombre !== n.nombre) void guardar(n.id, n.tipo === "nota" ? { notas: n.notas } : { nombre: n.nombre });
  };

  const renombrar = async () => {
    const r = await fetch(`/api/variantes/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: renombrando }) }).catch(() => null);
    if (!r?.ok) return setError("No se pudo renombrar");
    setRenombrando(null);
    router.refresh();
  };
  const borrarTablero = async () => {
    const r = await fetch(`/api/variantes/${t.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setError("No se pudo borrar el tablero");
    onBorrado();
  };

  const rejilla = 24 * vista.zoom;
  return (
    <div
      ref={marco}
      onPointerDown={empezarVista}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={() => (arrastre.current = null)}
      onAuxClick={(e) => e.preventDefault()}
      className={`${MARCO} touch-none select-none`}
      style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: `${rejilla}px ${rejilla}px`, backgroundPosition: `${vista.px}px ${vista.py}px` }}
    >
      {/* Everything on the board, moved and scaled as one. */}
      <div ref={capa} className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${vista.px}px, ${vista.py}px) scale(${vista.zoom})` }}>
        <svg width={1} height={1} className="absolute top-0 left-0 overflow-visible" aria-hidden>
          <defs>
            <marker id={`punta-${t.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="rgba(255,255,255,0.7)" />
            </marker>
          </defs>
          {nodos.map((n) => {
            const p = nodos.find((x) => x.id === n.padre);
            const d = p && curva(caja(p), caja(n));
            return d ? <path key={n.id} d={d} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5 / Math.max(vista.zoom, 0.5)} markerEnd={`url(#punta-${t.id})`} /> : null;
          })}
        </svg>
        {nodos.map((n) =>
          n.tipo === "nota" ? (
            <div
              key={n.id}
              data-nota={n.id}
              onPointerDown={(e) => empezarNodo(e, n)}
              onDoubleClick={() => setEditando(n.id)}
              className={`pointer-events-auto absolute rounded-lg border px-3 py-2 text-[13px] leading-snug font-medium text-white shadow-lg ${editando === n.id ? "cursor-text" : "cursor-grab active:cursor-grabbing"} ${n.id === elegido ? "ring-2 ring-white" : ""}`}
              style={{ left: n.x, top: n.y, width: n.ancho, background: `color-mix(in srgb, ${n.color ?? COLORES_NOTA[0]} 45%, #0b0b0f)`, borderColor: n.color ?? COLORES_NOTA[0] }}
            >
              {editando === n.id ? (
                <textarea
                  autoFocus
                  value={n.notas}
                  onChange={(e) => cambiar(n.id, { notas: e.target.value })}
                  onBlur={() => terminarEdicion(n)}
                  onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
                  onFocus={(e) => e.currentTarget.select()}
                  rows={Math.max(2, n.notas.split("\n").length)}
                  maxLength={2000}
                  className="block w-full resize-none bg-transparent text-white outline-none [field-sizing:content]"
                />
              ) : (
                <p className="whitespace-pre-line">{n.notas}</p>
              )}
            </div>
          ) : (
            <div key={n.id} onPointerDown={(e) => empezarNodo(e, n)} className="pointer-events-auto absolute cursor-grab active:cursor-grabbing" style={{ left: n.x, top: n.y, width: n.ancho }}>
              {editando === n.id ? (
                <input
                  autoFocus
                  value={n.nombre}
                  onChange={(e) => cambiar(n.id, { nombre: e.target.value })}
                  onBlur={() => terminarEdicion(n)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
                  maxLength={80}
                  className="mb-1 h-[22px] w-full rounded bg-ink-900 px-1 text-center text-sm font-semibold text-ink-100 outline-none ring-1 ring-accent-500"
                />
              ) : (
                <p onDoubleClick={() => setEditando(n.id)} title={`${n.nombre} (doble clic para editar)`} className="mb-1 h-[22px] truncate text-center text-sm leading-[22px] font-semibold text-ink-100">
                  {n.nombre || <span className="text-ink-500">Sin título</span>}
                </p>
              )}
              <div className={`overflow-hidden rounded-lg bg-white/[0.04] ${n.id === elegido ? "ring-2 ring-white" : `ring-2 ${ANILLO[n.tipo]}`}`} style={{ height: n.ancho * (proporcion[n.id] ?? 1) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/variantes/${t.id}/${n.id}`}
                  alt={n.nombre}
                  draggable={false}
                  onLoad={(e) => {
                    const i = e.currentTarget;
                    if (i.naturalWidth) setProporcion((p) => ({ ...p, [n.id]: i.naturalHeight / i.naturalWidth }));
                  }}
                  className="pointer-events-none size-full object-contain"
                />
              </div>
            </div>
          ),
        )}
      </div>

      {!nodos.length && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-500">
          Importa uno de tus listings de Amazon o añade una imagen. Selecciona una imagen y pulsa «＋ Nota» para apuntar lo que lleva.
        </p>
      )}

      {/* Toolbar, floating over the board. */}
      <div onPointerDown={(e) => e.stopPropagation()} className="absolute top-3 right-3 left-3 flex flex-wrap items-center gap-1.5">
        {cabecera}
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
        <select
          value=""
          onChange={(e) => void importar(e.target.value)}
          disabled={importando || !productos.length}
          aria-label="Importar un listing de Amazon"
          className="h-8 max-w-56 rounded-lg border-0 bg-accent-500 px-2 text-xs font-medium text-ink-950 outline-none disabled:opacity-60"
        >
          <option value="">{importando ? "Importando de Amazon…" : "⇣ Importar de Amazon"}</option>
          {productos.map((p) => (
            <option key={p.asin} value={p.asin}>
              {p.titulo.slice(0, 60)} · {p.asin}
            </option>
          ))}
        </select>
        <button onClick={() => inputImagen.current?.click()} disabled={subiendo} title={seleccionado && seleccionado.tipo !== "nota" ? `Con flecha desde «${seleccionado.nombre}»` : "Una imagen suelta"} className={flotante}>
          {subiendo ? <Spinner tamano="sm" /> : <span aria-hidden>＋</span>} Imagen
        </button>
        <button onClick={() => void nota()} title={seleccionado ? `Con flecha desde «${seleccionado.nombre || "la nota"}»` : "Una nota suelta (selecciona antes una imagen para unirla con flecha)"} className={flotante}>
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: COLORES_NOTA[0] }} /> Nota
        </button>
        <button onClick={() => void ordenar()} disabled={!nodos.length} className={flotante} title="Coloca todo en columnas, siguiendo las flechas">
          Organizar
        </button>
        <span className="flex-1" />
        <button onClick={() => zoomCentro(1 / 1.25)} className={flotante} aria-label="Alejar">
          −
        </button>
        <span className="tabular w-11 text-center text-xs text-ink-400">{Math.round(vista.zoom * 100)} %</span>
        <button onClick={() => zoomCentro(1.25)} className={flotante} aria-label="Acercar">
          ＋
        </button>
        <button onClick={encuadrar} className={flotante} title="Ver todo el tablero">
          Ver todo
        </button>
        {renombrando === null ? (
          <button onClick={() => setRenombrando(t.nombre)} className={flotante}>
            Renombrar
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void renombrar();
            }}
            className="flex items-center gap-1.5"
          >
            <input autoFocus value={renombrando} onChange={(e) => setRenombrando(e.target.value)} maxLength={80} className="h-8 w-44 rounded-lg border border-white/[0.1] bg-ink-900/90 px-2.5 text-xs text-ink-100 outline-none" />
            <button type="submit" className="h-8 rounded-lg bg-accent-500 px-2.5 text-xs font-medium text-ink-950">
              Guardar
            </button>
          </form>
        )}
        {confirmar ? (
          <span className="flex items-center gap-1.5 rounded-lg bg-ink-900/90 px-2 py-1 text-xs">
            <span className="text-ink-100">¿Borrar el tablero?</span>
            <button onClick={() => void borrarTablero()} className="rounded-md bg-danger px-2 py-0.5 font-medium text-white">
              Sí
            </button>
            <button onClick={() => setConfirmar(false)} className="px-1 text-ink-300">
              No
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmar(true)} className={`${flotante} text-danger`}>
            Borrar tablero
          </button>
        )}
        {error && <span className="rounded-md bg-danger/15 px-2 py-1 text-xs text-danger">{error}</span>}
        <input ref={inputImagen} type="file" accept="image/*" hidden onChange={(e) => (void subir(e.target.files?.[0]), (e.target.value = ""))} />
      </div>

      {/* The selected element's own small bar: colour (notes), size (images), delete. */}
      {seleccionado && (
        <div onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-white/[0.1] bg-ink-900/95 px-3 py-2 text-xs text-ink-300 shadow-2xl backdrop-blur">
          {seleccionado.tipo === "nota" ? (
            <>
              <span>Color</span>
              {COLORES_NOTA.map((c) => (
                <button
                  key={c}
                  onClick={() => (cambiar(seleccionado.id, { color: c }), void guardar(seleccionado.id, { color: c }))}
                  aria-label={`Color ${c}`}
                  className={`size-5 rounded-full border-2 ${(seleccionado.color ?? COLORES_NOTA[0]) === c ? "border-white" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <button onClick={() => setEditando(seleccionado.id)} className="rounded-md px-2 py-1 text-ink-200 hover:bg-white/[0.06]">
                Editar texto
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditando(seleccionado.id)} className="rounded-md px-2 py-1 text-ink-200 hover:bg-white/[0.06]">
                Editar título
              </button>
              <label className="flex items-center gap-2">
                Tamaño
                <input
                  type="range"
                  min={60}
                  max={600}
                  step={10}
                  value={seleccionado.ancho}
                  onChange={(e) => cambiar(seleccionado.id, { ancho: Number(e.target.value) })}
                  onPointerUp={() => void guardar(seleccionado.id, { ancho: seleccionado.ancho })}
                  onKeyUp={() => void guardar(seleccionado.id, { ancho: seleccionado.ancho })}
                  className="w-28 accent-accent-500"
                />
              </label>
            </>
          )}
          <span className="h-4 w-px bg-white/10" aria-hidden />
          <button onClick={() => void borrar(seleccionado.id)} className="rounded-md px-2 py-1 text-danger hover:bg-danger/10">
            Borrar
          </button>
        </div>
      )}
    </div>
  );
}
