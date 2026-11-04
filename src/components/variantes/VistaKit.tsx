"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { COLORES_NOTA, ETIQUETAS_SECCION, type NodoVariante, type TableroVariantes, type TipoNodo } from "@/lib/datos/variantesTipos";

/** Line colour of the arrows. */
const LINEA = "border-white/35";

/** Where an image goes: the main product (no parent), a variant of a product, or an element of either. */
type Destino = { tipo: Exclude<TipoNodo, "nota" | "titulo">; padre: NodoVariante | null } | { reemplazar: NodoVariante };

/** A text saved when you leave the field, only if it changed. */
function Editable({
  valor,
  onGuardar,
  placeholder,
  multilinea = false,
  enfocar = false,
  className,
}: {
  valor: string;
  onGuardar: (v: string) => void;
  placeholder: string;
  multilinea?: boolean;
  /** Opens with the cursor in it and its text selected. */
  enfocar?: boolean;
  className: string;
}) {
  const [texto, setTexto] = useState(valor);
  const [base, setBase] = useState(valor);
  // Follows the saved value when the page data changes.
  if (base !== valor) {
    setBase(valor);
    setTexto(valor);
  }
  const salir = () => texto.trim() !== valor.trim() && onGuardar(texto.trim());
  return multilinea ? (
    <textarea
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salir}
      autoFocus={enfocar}
      onFocus={(e) => enfocar && e.currentTarget.select()}
      placeholder={placeholder}
      maxLength={2000}
      rows={3}
      className={className}
    />
  ) : (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salir}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder={placeholder}
      maxLength={80}
      className={className}
    />
  );
}

/** Whether `id` hangs (through notes) from `raiz`. */
const debajoDe = (raiz: string, id: string, hijas: (id: string) => NodoVariante[]): boolean => hijas(raiz).some((h) => h.id === id || debajoDe(h.id, id, hijas));

/** A stored image, contained in its box, with a «Reemplazar» button over it (on hover, always on touch screens). */
function Foto({ tablero, nodo, className, onReemplazar, ocupado }: { tablero: string; nodo: NodoVariante; className: string; onReemplazar: () => void; ocupado: boolean }) {
  return (
    <div className={`group/foto relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ${className}`}>
      <button
        onClick={onReemplazar}
        disabled={ocupado}
        title="Reemplazar la imagen"
        className="absolute inset-x-1 bottom-1 z-10 flex items-center justify-center gap-1 rounded-md bg-ink-950/80 px-1.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/foto:opacity-100 focus:opacity-100 disabled:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {ocupado ? <Spinner tamano="sm" /> : "↺ Reemplazar"}
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/variantes/${tablero}/${nodo.id}?v=${encodeURIComponent(nodo.archivo)}`} alt={nodo.nombre} loading="lazy" className="size-full object-contain" />
    </div>
  );
}

/** What a note needs from the view: the notes under it, which one is selected or open, and the actions. */
type OpcionesNota = {
  hijas: (id: string) => NodoVariante[];
  elegida: string | null;
  abierta: string | null;
  onElegir: (id: string) => void;
  onAbrir: (id: string | null) => void;
  onEditar: (n: NodoVariante, c: Partial<NodoVariante>) => void;
  onBorrar: (n: NodoVariante) => void;
};

/**
 * A note: just its text, with a small «Editar» tab. Opened (when just created, or from that tab) it shows its text to
 * edit, its colours and «Borrar». A click selects it (so «Añadir nota» hangs the next one from it). The notes hanging
 * from it follow on its right, each with its arrow.
 */
function ArbolNota({ n, o }: { n: NodoVariante; o: OpcionesNota }) {
  const color = n.color ?? COLORES_NOTA[0];
  const abierta = o.abierta === n.id;
  const elegida = o.elegida === n.id;
  const hijas = o.hijas(n.id);
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div
        onClick={() => !abierta && o.onElegir(n.id)}
        className={`relative min-w-0 flex-1 rounded-xl border p-3 transition-shadow md:max-w-sm ${abierta ? "" : "cursor-pointer"} ${elegida ? "ring-2 ring-white" : ""}`}
        style={{ background: `color-mix(in srgb, ${color} 30%, #0b0b0f)`, borderColor: color }}
        title={abierta ? undefined : elegida ? "Seleccionada: «Añadir nota» la cuelga de esta" : "Toca para seleccionarla"}
      >
        {abierta ? (
          <div className="flex flex-col gap-2">
            <Editable
              valor={n.notas}
              onGuardar={(v) => o.onEditar(n, { notas: v })}
              placeholder="Escribe la nota…"
              multilinea
              enfocar
              className="w-full resize-y rounded-md border border-white/[0.15] bg-black/20 px-2 py-1.5 text-sm leading-relaxed text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {COLORES_NOTA.map((c) => (
                <button
                  key={c}
                  onClick={() => o.onEditar(n, { color: c })}
                  aria-label={`Color de la nota ${c}`}
                  aria-pressed={color === c}
                  className={`size-4 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <span className="flex-1" />
              <button onClick={() => o.onBorrar(n)} className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-black/20 hover:text-danger">
                Borrar
              </button>
              <button onClick={() => o.onAbrir(null)} className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-ink-950 hover:bg-white">
                Listo
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="pr-12 text-sm leading-relaxed whitespace-pre-line text-white">{n.notas}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                o.onAbrir(n.id);
              }}
              className="absolute top-0 right-2 -translate-y-1/2 rounded-full border px-2 py-px text-[10px] font-medium text-white"
              style={{ background: `color-mix(in srgb, ${color} 60%, #0b0b0f)`, borderColor: color }}
            >
              ✎ Editar
            </button>
          </>
        )}
      </div>
      {hijas.length > 0 && (
        <>
          <div aria-hidden className={`hidden w-6 shrink-0 border-t-2 md:block ${LINEA}`} />
          <ul className="flex min-w-0 flex-1 flex-col pl-6 md:pl-0">
            {hijas.map((h, i) => (
              <li key={h.id} className="relative py-1.5 md:pl-10">
                {hijas.length > 1 && (
                  <span aria-hidden className={`absolute left-0 hidden border-l-2 md:block ${LINEA} ${i === 0 ? "top-1/2 bottom-0" : i === hijas.length - 1 ? "top-0 bottom-1/2" : "inset-y-0"}`} />
                )}
                <span aria-hidden className={`absolute top-1/2 left-0 hidden w-9 border-t-2 md:block ${LINEA}`} />
                <span aria-hidden className="absolute top-1/2 left-8 hidden -translate-y-1/2 border-y-[5px] border-l-[8px] border-y-transparent border-l-white/50 md:block" />
                <ArbolNota n={h} o={o} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const borrarBoton = "flex size-7 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-white/[0.06] hover:text-danger";
function Cruz() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * One branch: the image on the left and, with an arrow to each, what it contains on the right (each element with its
 * image, its name and a text saying what it is, or a coloured note), plus «Añadir elemento» and «Añadir nota» at the end.
 */
function Rama({
  tablero,
  raiz,
  elementos,
  etiqueta,
  ocupado,
  onAnadir,
  onAnadirNota,
  opcionesNota,
  onEditar,
  onBorrar,
  onReemplazar,
  reemplazando,
}: {
  tablero: string;
  raiz: NodoVariante;
  elementos: NodoVariante[];
  etiqueta: string;
  ocupado: boolean;
  onAnadir: () => void;
  onAnadirNota: () => void;
  opcionesNota: OpcionesNota;
  onEditar: (n: NodoVariante, c: Partial<NodoVariante>) => void;
  onBorrar: (n: NodoVariante) => void;
  onReemplazar: (n: NodoVariante) => void;
  /** The element whose image is being replaced. */
  reemplazando: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      {/* The product or variant */}
      <div className="flex w-full shrink-0 flex-col gap-2 rounded-xl border border-white/[0.08] bg-ink-900/80 p-3 md:w-56">
        <div className="flex items-center justify-between gap-2">
          <Editable
            valor={raiz.etiqueta ?? etiqueta}
            onGuardar={(v) => onEditar(raiz, { etiqueta: v && v !== etiqueta ? v : "" })}
            placeholder={etiqueta}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-semibold tracking-wide text-accent-300 uppercase hover:border-white/[0.08] focus:border-accent-500/60 focus:outline-none"
          />
          <button onClick={() => onBorrar(raiz)} title="Borrar" aria-label={`Borrar ${etiqueta.toLowerCase()}`} className={borrarBoton}>
            <Cruz />
          </button>
        </div>
        <Foto tablero={tablero} nodo={raiz} className="aspect-square w-full" onReemplazar={() => onReemplazar(raiz)} ocupado={reemplazando === raiz.id} />
        <Editable valor={raiz.nombre} onGuardar={(v) => onEditar(raiz, { nombre: v })} placeholder="Nombre" className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-ink-100 hover:border-white/[0.08] focus:border-accent-500/60 focus:outline-none" />
        <Editable
          valor={raiz.atributo ?? ""}
          onGuardar={(v) => onEditar(raiz, { atributo: v })}
          placeholder="Detalle (color, talla…)"
          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-ink-300 placeholder:text-ink-600 hover:border-white/[0.08] focus:border-accent-500/60 focus:outline-none"
        />
        <Editable
          valor={raiz.asin ?? ""}
          onGuardar={(v) => onEditar(raiz, { asin: v.toUpperCase() })}
          placeholder="ASIN"
          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-ink-400 uppercase placeholder:text-ink-600 placeholder:normal-case hover:border-white/[0.08] focus:border-accent-500/60 focus:outline-none"
        />
      </div>

      {/* Arrow from it to the column of elements */}
      <div aria-hidden className={`hidden w-8 shrink-0 border-t-2 md:block ${LINEA}`} />

      {/* What it contains, each with its arrow */}
      <ul className="flex min-w-0 flex-1 flex-col">
        {[...elementos, null].map((n, i, todos) => {
          const primero = i === 0;
          const ultimo = i === todos.length - 1;
          return (
            <li key={n?.id ?? "nuevo"} className="relative py-1.5 pl-0 md:pl-10">
              {/* The vertical bar joining the arrows, and this element's arrow */}
              {todos.length > 1 && (
                <span aria-hidden className={`absolute left-0 hidden border-l-2 md:block ${LINEA} ${primero ? "top-1/2 bottom-0" : ultimo ? "top-0 bottom-1/2" : "inset-y-0"}`} />
              )}
              <span aria-hidden className={`absolute top-1/2 left-0 hidden w-9 border-t-2 md:block ${LINEA} ${n ? "" : "border-dashed"}`} />
              <span aria-hidden className="absolute top-1/2 left-8 hidden -translate-y-1/2 border-y-[5px] border-l-[8px] border-y-transparent border-l-white/50 md:block" />
              {n?.tipo === "nota" ? (
                <ArbolNota n={n} o={opcionesNota} />
              ) : n ? (
                <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-ink-900/80 p-2.5">
                  <Foto tablero={tablero} nodo={n} className="size-20" onReemplazar={() => onReemplazar(n)} ocupado={reemplazando === n.id} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Editable valor={n.nombre} onGuardar={(v) => onEditar(n, { nombre: v })} placeholder="Nombre del elemento" className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-ink-100 hover:border-white/[0.08] focus:border-accent-500/60 focus:outline-none" />
                    <Editable
                      valor={n.notas}
                      onGuardar={(v) => onEditar(n, { notas: v })}
                      placeholder="¿Qué es? (medidas, material, cantidad…)"
                      multilinea
                      className="w-full resize-y rounded-md border border-white/[0.06] bg-ink-950/50 px-2 py-1.5 text-xs leading-relaxed text-ink-200 placeholder:text-ink-600 focus:border-accent-500/60 focus:outline-none"
                    />
                  </div>
                  <button onClick={() => onBorrar(n)} title="Borrar" aria-label="Borrar elemento" className={borrarBoton}>
                    <Cruz />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={onAnadir}
                    disabled={ocupado}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.15] px-3 py-4 text-sm text-ink-400 transition-colors hover:border-accent-500/50 hover:text-ink-100 disabled:opacity-50"
                  >
                    {ocupado ? <Spinner tamano="sm" /> : <span aria-hidden>＋</span>} Añadir elemento (imagen)
                  </button>
                  <button
                    onClick={onAnadirNota}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.15] px-3 py-4 text-sm text-ink-400 transition-colors hover:border-accent-500/50 hover:text-ink-100"
                  >
                    <span aria-hidden className="size-2.5 rounded-sm" style={{ background: COLORES_NOTA[0] }} />
                    {opcionesNota.elegida && elementos.some((e) => e.id === opcionesNota.elegida || debajoDe(e.id, opcionesNota.elegida!, opcionesNota.hijas)) ? "Añadir nota a la seleccionada" : "Añadir nota"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * «Variantes» in order: the product's name big at the top (editable), its kit (the main product with an arrow to each
 * element, each with a text saying what it is) and its variants, each laid out the same way.
 */
export function VistaKit({ t, cabecera, preparar, onBorrado }: { t: TableroVariantes; cabecera: ReactNode; preparar: (f: File) => Promise<File>; onBorrado: () => void }) {
  const router = useRouter();
  const [nodos, setNodos] = useState(t.nodos);
  const [base, setBase] = useState(t.nodos);
  if (base !== t.nodos) {
    setBase(t.nodos);
    setNodos(t.nodos);
  }
  const [error, setError] = useState<string | null>(null);
  /** The «add» button whose image is uploading. */
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const destino = useRef<Destino | null>(null);

  const pedirImagen = (d: Destino) => {
    destino.current = d;
    input.current?.click();
  };
  /** The element whose image is being replaced. */
  const [reemplazando, setReemplazando] = useState<string | null>(null);
  const reemplazar = async (n: NodoVariante, archivo: File) => {
    setError(null);
    setReemplazando(n.id);
    try {
      const f = new FormData();
      f.set("archivo", await preparar(archivo));
      const r = await fetch(`/api/variantes/${t.id}/${n.id}`, { method: "PUT", body: f });
      const b = (await r.json().catch(() => ({}))) as { error?: string; nodo?: NodoVariante };
      if (!r.ok || !b.nodo) throw new Error(b.error ?? `Error ${r.status}`);
      setNodos((ns) => ns.map((x) => (x.id === n.id ? b.nodo! : x)));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reemplazar la imagen");
    } finally {
      setReemplazando(null);
    }
  };
  const subir = async (archivo: File | undefined) => {
    const d = destino.current;
    if (!archivo || !d) return;
    if ("reemplazar" in d) return reemplazar(d.reemplazar, archivo);
    const clave = `${d.tipo}-${d.padre?.id ?? "raiz"}`;
    setError(null);
    setSubiendo(clave);
    try {
      // Also placed sensibly on the free board: to the right of its parent, under its siblings.
      const hermanos = nodos.filter((n) => n.padre === (d.padre?.id ?? null) && n.tipo !== "nota" && n.tipo !== "titulo");
      const x = d.padre ? d.padre.x + d.padre.ancho + 200 : 0;
      const y = hermanos.length ? Math.max(...hermanos.map((n) => n.y)) + 220 : (d.padre?.y ?? 0);
      const f = new FormData();
      f.set("archivo", await preparar(archivo));
      f.set("tipo", d.tipo);
      f.set("x", String(Math.round(x)));
      f.set("y", String(Math.round(y)));
      if (d.padre) f.set("padre", d.padre.id);
      const r = await fetch(`/api/variantes/${t.id}`, { method: "POST", body: f });
      const b = (await r.json().catch(() => ({}))) as { error?: string; nodo?: NodoVariante };
      if (!r.ok || !b.nodo) throw new Error(b.error ?? `Error ${r.status}`);
      setNodos((ns) => [...ns, b.nodo!]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(null);
    }
  };
  /** The note selected (the next one hangs from it) and the note opened to edit. */
  const [notaElegida, setNotaElegida] = useState<string | null>(null);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const hijasDe = (id: string) => nodos.filter((n) => n.padre === id && n.tipo === "nota").sort((a, b) => a.y - b.y);
  /**
   * A new note, opened to write and pick its colour: it hangs from the selected note when it belongs to this block,
   * otherwise from the block's image (the product or the variant).
   */
  const anadirNota = async (raiz: NodoVariante) => {
    setError(null);
    const elegida = notaElegida ? nodos.find((n) => n.id === notaElegida) : undefined;
    const padre = elegida && debajoDe(raiz.id, elegida.id, (id) => nodos.filter((n) => n.padre === id && (n.tipo === "nota" || n.tipo === "componente"))) ? elegida : raiz;
    const hermanos = nodos.filter((n) => n.padre === padre.id);
    const r = await fetch(`/api/variantes/${t.id}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padre: padre.id, x: Math.round(padre.x + padre.ancho + 200), y: Math.round(hermanos.length ? Math.max(...hermanos.map((n) => n.y)) + 220 : padre.y) }),
    }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string; nodo?: NodoVariante } | undefined;
    if (!r?.ok || !b?.nodo) return setError(b?.error ?? "No se pudo crear la nota");
    setNodos((ns) => [...ns, b.nodo!]);
    setNotaElegida(null);
    setNotaAbierta(b.nodo.id);
    router.refresh();
  };
  const editar = async (n: NodoVariante, cambios: Partial<NodoVariante>) => {
    setNodos((ns) => ns.map((x) => (x.id === n.id ? { ...x, ...cambios } : x)));
    setError(null);
    const r = await fetch(`/api/variantes/${t.id}/${n.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) }).catch(() => null);
    if (!r?.ok) {
      setError(((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "No se pudo guardar");
      setNodos((ns) => ns.map((x) => (x.id === n.id ? n : x)));
    }
    router.refresh();
  };
  const borrar = async (n: NodoVariante) => {
    const cuelgan = nodos.filter((x) => x.padre === n.id).length;
    if (!confirm(cuelgan ? `¿Borrar «${n.nombre || "este elemento"}»? Lo que cuelga de él (${cuelgan}) pasa a colgar del anterior.` : `¿Borrar «${n.nombre || "este elemento"}»?`)) return;
    const r = await fetch(`/api/variantes/${t.id}/${n.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setError("No se pudo borrar");
    setNodos((ns) => ns.filter((x) => x.id !== n.id).map((x) => (x.padre === n.id ? { ...x, padre: n.padre } : x)));
    if (notaElegida === n.id) setNotaElegida(null);
    if (notaAbierta === n.id) setNotaAbierta(null);
    router.refresh();
  };
  /** The product's name or a section heading. */
  const editarProducto = async (cambios: { nombre?: string; etiquetaKit?: string; etiquetaVariantes?: string }) => {
    if (cambios.nombre === "") return;
    setError(null);
    const r = await fetch(`/api/variantes/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) }).catch(() => null);
    if (!r?.ok) setError("No se pudo guardar");
    router.refresh();
  };
  const encabezado = "rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold tracking-wide text-ink-100 uppercase hover:border-white/[0.08] focus:border-accent-500/60 focus:outline-none";
  const kit = t.etiquetaKit ?? ETIQUETAS_SECCION.kit;
  const variantesTitulo = t.etiquetaVariantes ?? ETIQUETAS_SECCION.variantes;
  const borrarProducto = async () => {
    const r = await fetch(`/api/variantes/${t.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) return setError("No se pudo borrar");
    setConfirmar(false);
    onBorrado();
  };

  const principales = nodos.filter((n) => n.tipo === "producto");
  const deTipo = (padre: string, tipo: TipoNodo) => nodos.filter((n) => n.padre === padre && n.tipo === tipo).sort((a, b) => a.y - b.y);
  /** What hangs from a product or variant on its right: its elements and its notes, in their order on the board. */
  const contenido = (padre: string) => nodos.filter((n) => n.padre === padre && (n.tipo === "componente" || n.tipo === "nota")).sort((a, b) => a.y - b.y);
  // Notes shown here (hanging from a product or a variant) don't count as «only on the free board».
  const visibles = new Set(nodos.filter((n) => n.tipo === "producto" || n.tipo === "variante").map((n) => n.id));
  const colgada = (n: NodoVariante): boolean => {
    const p = n.padre ? nodos.find((x) => x.id === n.padre) : undefined;
    return !!p && (visibles.has(p.id) || (p.tipo === "nota" && colgada(p)));
  };
  const notas = nodos.filter((n) => n.tipo === "nota" && !colgada(n)).length;
  const titulos = nodos.filter((n) => n.tipo === "titulo").length;
  const ocupado = (d: Destino) => !("reemplazar" in d) && subiendo === `${d.tipo}-${d.padre?.id ?? "raiz"}`;
  const conReemplazo = { onReemplazar: (n: NodoVariante) => pedirImagen({ reemplazar: n }), reemplazando };
  const opcionesNota: OpcionesNota = {
    hijas: hijasDe,
    elegida: notaElegida,
    abierta: notaAbierta,
    // A second click on the selected note unselects it.
    onElegir: (id) => setNotaElegida((x) => (x === id ? null : id)),
    onAbrir: setNotaAbierta,
    onEditar: (n, c) => void editar(n, c),
    onBorrar: (n) => void borrar(n),
  };

  return (
    <div className="flex flex-col gap-6">
      {cabecera && <div className="flex flex-wrap items-center gap-1.5">{cabecera}</div>}

      {/* The product's name, big and white: click to edit it */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Editable
          valor={t.nombre}
          onGuardar={(nombre) => editarProducto({ nombre })}
          placeholder="Nombre del producto"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-3xl font-bold tracking-tight text-white hover:border-white/[0.1] focus:border-accent-500/60 focus:outline-none sm:text-4xl"
        />
        {confirmar ? (
          <span className="flex items-center gap-2 text-xs text-ink-300">
            ¿Borrar el producto con todo lo que tiene?
            <button onClick={borrarProducto} className="rounded-md bg-danger px-2.5 py-1 font-medium text-white">
              Borrar
            </button>
            <button onClick={() => setConfirmar(false)} className="px-1.5 text-ink-400 hover:text-ink-100">
              Cancelar
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmar(true)} className="text-xs text-ink-500 hover:text-danger">
            Borrar producto
          </button>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">{error}</p>}

      {principales.length === 0 ? (
        <button
          onClick={() => pedirImagen({ tipo: "producto", padre: null })}
          disabled={!!subiendo}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.15] px-4 py-14 text-sm text-ink-400 transition-colors hover:border-accent-500/50 hover:text-ink-100 disabled:opacity-50"
        >
          {subiendo ? <Spinner /> : <span className="text-2xl" aria-hidden>＋</span>}
          Sube la foto del producto principal
        </button>
      ) : (
        principales.map((p, i) => {
          const variantes = deTipo(p.id, "variante");
          const dVariante: Destino = { tipo: "variante", padre: p };
          return (
            <div key={p.id} className="flex flex-col gap-8">
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
                  <Editable valor={kit} onGuardar={(v) => editarProducto({ etiquetaKit: v === ETIQUETAS_SECCION.kit ? "" : v })} placeholder={ETIQUETAS_SECCION.kit} className={`${encabezado} min-w-0 flex-1`} />
                  {principales.length > 1 && <span className="shrink-0 text-xs text-ink-500">Producto {i + 1}</span>}
                </div>
                <Rama
                  tablero={t.id}
                  raiz={p}
                  elementos={contenido(p.id)}
                  onAnadirNota={() => void anadirNota(p)}
                  opcionesNota={opcionesNota}
                  etiqueta={ETIQUETAS_SECCION.producto}
                  ocupado={ocupado({ tipo: "componente", padre: p })}
                  onAnadir={() => pedirImagen({ tipo: "componente", padre: p })}
                  onEditar={editar}
                  onBorrar={borrar}
                  {...conReemplazo}
                />
              </section>

              <section className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <Editable
                      valor={variantesTitulo}
                      onGuardar={(v) => editarProducto({ etiquetaVariantes: v === ETIQUETAS_SECCION.variantes ? "" : v })}
                      placeholder={ETIQUETAS_SECCION.variantes}
                      className={`${encabezado} min-w-0 flex-1`}
                    />
                    <span className="shrink-0 text-sm text-ink-500">{variantes.length}</span>
                  </span>
                  <button
                    onClick={() => pedirImagen(dVariante)}
                    disabled={!!subiendo}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
                  >
                    {ocupado(dVariante) ? <Spinner tamano="sm" /> : <span aria-hidden>＋</span>} Añadir variante
                  </button>
                </div>
                {variantes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-ink-400">Aún no hay variantes. Pulsa «Añadir variante» y sube su foto.</p>
                ) : (
                  variantes.map((v) => (
                    <Rama
                      key={v.id}
                      tablero={t.id}
                      raiz={v}
                      elementos={contenido(v.id)}
                      onAnadirNota={() => void anadirNota(v)}
                      opcionesNota={opcionesNota}
                      etiqueta={ETIQUETAS_SECCION.variante}
                      ocupado={ocupado({ tipo: "componente", padre: v })}
                      onAnadir={() => pedirImagen({ tipo: "componente", padre: v })}
                      onEditar={editar}
                      onBorrar={borrar}
                      {...conReemplazo}
                    />
                  ))
                )}
              </section>
            </div>
          );
        })
      )}

      {notas + titulos > 0 && (
        <p className="text-xs text-ink-500">
          Este producto tiene {[notas && `${notas} ${notas === 1 ? "nota" : "notas"} de colores`, titulos && `${titulos} ${titulos === 1 ? "título" : "títulos"}`].filter(Boolean).join(" y ")}: se ven en el «Tablero libre».
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void subir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

