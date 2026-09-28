"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Carpeta, Documento } from "@/lib/datos/documentos";
import { Spinner } from "@/components/Spinner";

const MAXIMO = 25 * 1024 * 1024;

const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const fechaLarga = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const extension = (d: Documento) => (d.archivo.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toUpperCase().slice(0, 4) || "DOC";
const campo = "h-9 w-full rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60";

/** «Documentos»: the company's files by folder, with search, upload, preview, download, edit and delete. */
export function VistaDocumentos({ documentos, carpetas }: { documentos: Documento[]; carpetas: Carpeta[] }) {
  const router = useRouter();
  const [elegida, setCarpeta] = useState<string | null>(null);
  // A folder that was just deleted falls back to «all».
  const carpeta = elegida && carpetas.some((c) => c.id === elegida) ? elegida : null;
  const [busqueda, setBusqueda] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = busqueda.trim().toLowerCase();
  const visibles = documentos
    .filter((d) => !carpeta || d.carpeta === carpeta)
    .filter((d) => !q || `${d.nombre} ${d.archivo} ${d.titulo ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => b.subidoEn.localeCompare(a.subidoEn));
  const infoCarpeta = (id: string) => carpetas.find((c) => c.id === id);
  const titulos = (id: string) => [...new Set(documentos.filter((d) => d.carpeta === id && d.titulo).map((d) => d.titulo!))].sort((a, b) => a.localeCompare(b, "es"));

  // Documents grouped under their title (in «all», under folder › title); untitled ones last.
  const grupos = new Map<string, { clave: string; carpeta: Carpeta | undefined; titulo: string; docs: Documento[] }>();
  for (const d of visibles) {
    const clave = `${carpeta ? "" : d.carpeta}|${d.titulo ?? ""}`;
    const g = grupos.get(clave) ?? { clave, carpeta: infoCarpeta(d.carpeta), titulo: d.titulo ?? "", docs: [] };
    g.docs.push(d);
    grupos.set(clave, g);
  }
  const listaGrupos = [...grupos.values()].sort(
    (a, b) =>
      (carpeta ? 0 : carpetas.indexOf(a.carpeta!) - carpetas.indexOf(b.carpeta!)) || Number(!a.titulo) - Number(!b.titulo) || a.titulo.localeCompare(b.titulo, "es"),
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
      <PanelCarpetas carpetas={carpetas} documentos={documentos} activa={carpeta} onElegir={setCarpeta} onCambio={() => router.refresh()} />

      <div className="flex min-w-0 flex-col gap-4">
        <Subida
          carpetas={carpetas}
          carpetaInicial={carpeta ?? carpetas.at(-1)?.id ?? ""}
          titulos={titulos}
          subiendo={subiendo}
          onSubir={async (archivos, datos) => {
            setSubiendo(true);
            setError(null);
            try {
              for (const a of archivos) {
                const f = new FormData();
                f.set("archivo", a);
                f.set("nombre", archivos.length === 1 ? datos.nombre : "");
                f.set("carpeta", datos.carpeta);
                f.set("titulo", datos.titulo);
                const r = await fetch("/api/documentos", { method: "POST", body: f });
                const b = (await r.json().catch(() => ({}))) as { error?: string };
                if (!r.ok) throw new Error(`${a.name}: ${b.error ?? `error ${r.status}`}`);
              }
              router.refresh();
              return true;
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo subir");
              return false;
            } finally {
              setSubiendo(false);
            }
          }}
        />
        {error && (
          <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Documents */}
        <article className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
            <h2 className="text-[15px] leading-tight font-semibold">{carpeta ? infoCarpeta(carpeta)?.nombre : "Todos los documentos"}</h2>
            <label className="relative w-full max-w-64">
              <span className="sr-only">Buscar</span>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o título…"
                className="h-8 w-full rounded-md border border-white/30 bg-white/15 px-2.5 text-sm text-white placeholder:text-white/70 outline-none focus:border-white"
              />
            </label>
          </header>
          {visibles.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">{documentos.length === 0 ? "Aún no hay documentos. Sube el primero arriba." : "No hay documentos que coincidan."}</p>
          ) : (
            <div className="divide-y divide-white/[0.08]">
              {listaGrupos.map((g) => (
                <section key={g.clave}>
                  <h3 className="flex items-center gap-2.5 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-ink-100">
                    <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ background: g.carpeta?.color ?? "#8a8f98" }} />
                    <span className="min-w-0 flex-1 truncate">
                      {!carpeta && <span className="font-normal text-ink-400">{g.carpeta?.nombre} › </span>}
                      {g.titulo || <span className="font-normal text-ink-400 italic">Sin título</span>}
                    </span>
                    <span className="tabular text-xs font-normal text-ink-500">{g.docs.length}</span>
                  </h3>
                  <ul className="divide-y divide-white/[0.05]">
                    {g.docs.map((d) => (
                      <FilaDocumento key={d.id} d={d} carpetas={carpetas} titulos={titulos} carpeta={infoCarpeta(d.carpeta)} onCambio={() => router.refresh()} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[11px] text-ink-500">
            {visibles.length} {visibles.length === 1 ? "documento" : "documentos"} · Privados: solo se abren con tu sesión iniciada.
          </p>
        </article>
      </div>
    </div>
  );
}

type DatosSubida = { nombre: string; carpeta: string; titulo: string };

/** Drop zone + the details of what's being uploaded. */
function Subida({
  carpetas,
  carpetaInicial,
  titulos,
  subiendo,
  onSubir,
}: {
  carpetas: Carpeta[];
  carpetaInicial: string;
  titulos: (carpeta: string) => string[];
  subiendo: boolean;
  onSubir: (archivos: File[], datos: DatosSubida) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [encima, setEncima] = useState(false);
  const [datos, setDatos] = useState<DatosSubida>({ nombre: "", carpeta: carpetaInicial, titulo: "" });
  const grandes = archivos.filter((a) => a.size > MAXIMO);

  const elegir = (lista: FileList | null) => {
    const nuevos = [...(lista ?? [])];
    if (!nuevos.length) return;
    setArchivos(nuevos);
    setDatos({ nombre: nuevos.length === 1 ? nuevos[0].name.replace(/\.[^.]+$/, "") : "", carpeta: carpetaInicial, titulo: "" });
  };

  // Pasting a file anywhere on the page (Ctrl+V) opens the upload form too.
  useEffect(() => {
    const pegar = (e: ClipboardEvent) => {
      if (!e.clipboardData?.files.length) return;
      e.preventDefault();
      elegir(e.clipboardData.files);
    };
    window.addEventListener("paste", pegar);
    return () => window.removeEventListener("paste", pegar);
  });

  if (archivos.length === 0)
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
          elegir(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors ${encima ? "border-accent-500/70 bg-accent-500/10" : "border-white/[0.12] bg-ink-900/50"}`}
      >
        <p className="text-sm text-ink-300">
          Arrastra o pega aquí tus PDF (Ctrl+V) <span className="text-ink-500">· hasta 25 MB cada uno</span>
        </p>
        <button onClick={() => input.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-ink-950 transition-all hover:bg-accent-400 active:scale-[0.97]">
          <span aria-hidden>＋</span> Subir documento
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => elegir(e.target.files)} />
      </div>
    );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSubir(archivos, datos)) setArchivos([]);
      }}
      className="overflow-hidden rounded-xl border border-accent-500/40 bg-ink-900/80 shadow-soft"
    >
      <header className="px-4 py-2.5 text-ink-950" style={{ background: "#e0a526" }}>
        <h2 className="text-[15px] leading-tight font-semibold">{archivos.length === 1 ? "Subir documento" : `Subir ${archivos.length} documentos`}</h2>
      </header>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-200 sm:col-span-2">
          Título *
          <input
            autoFocus
            required
            className={`${campo} h-10 text-[15px]`}
            list="titulos-subida"
            value={datos.titulo}
            onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            maxLength={100}
            placeholder="Ej.: Declaraciones IVA 2026 — aparecerá como encabezado encima del documento"
          />
          <datalist id="titulos-subida">
            {titulos(datos.carpeta).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <ul className="space-y-1 text-xs text-ink-400 sm:col-span-2">
          {archivos.map((a) => (
            <li key={a.name} className={a.size > MAXIMO ? "text-danger" : ""}>
              📄 {a.name} · {tamano(a.size)}
              {a.size > MAXIMO && " — pasa de 25 MB"}
            </li>
          ))}
        </ul>
        {archivos.length === 1 && (
          <label className="flex flex-col gap-1 text-xs text-ink-400 sm:col-span-2">
            Nombre del documento
            <input className={campo} value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} maxLength={150} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-ink-400 sm:col-span-2">
          Carpeta
          <select className={campo} value={datos.carpeta} onChange={(e) => setDatos({ ...datos, carpeta: e.target.value })}>
            {carpetas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <button type="button" onClick={() => setArchivos([])} disabled={subiendo} className="h-9 rounded-lg px-3 text-sm text-ink-400 hover:text-ink-100">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={subiendo || grandes.length > 0 || !datos.titulo.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-ink-950 transition-all hover:bg-accent-400 disabled:opacity-60"
        >
          {subiendo && <Spinner tamano="sm" />}
          {subiendo ? "Subiendo…" : "Subir"}
        </button>
      </div>
    </form>
  );
}

/** One document: icon, name, details; view, download, edit, delete. */
function FilaDocumento({
  d,
  carpetas,
  titulos,
  carpeta,
  onCambio,
}: {
  d: Documento;
  carpetas: Carpeta[];
  titulos: (carpeta: string) => string[];
  carpeta: Carpeta | undefined;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [datos, setDatos] = useState({ nombre: d.nombre, carpeta: d.carpeta, titulo: d.titulo ?? "" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedir = async (metodo: "PATCH" | "DELETE", cuerpo?: unknown) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/documentos/${d.id}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      setEditando(false);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-10 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: carpeta?.color ?? "#8a8f98" }}>
          {extension(d)}
        </span>
        <div className="min-w-0 flex-1">
          <a href={`/api/documentos/${d.id}`} target="_blank" rel="noopener" className="block truncate text-sm font-medium text-ink-100 hover:underline">
            {d.nombre}
          </a>
          <p className="truncate text-[11px] text-ink-400">
            {`subido el ${fechaLarga(d.subidoEn)} · ${tamano(d.tamano)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <a href={`/api/documentos/${d.id}`} target="_blank" rel="noopener" className="rounded-md px-2 py-1.5 text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
            Ver
          </a>
          <a href={`/api/documentos/${d.id}?descargar=1`} className="rounded-md px-2 py-1.5 text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
            Descargar
          </a>
          <button onClick={() => setEditando(!editando)} className="rounded-md px-2 py-1.5 text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
            Editar
          </button>
        </div>
      </div>

      {editando && (
        <div className="mt-3 grid gap-3 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ink-400 sm:col-span-2">
            Nombre
            <input className={campo} value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} maxLength={150} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-400">
            Carpeta
            <select className={campo} value={datos.carpeta} onChange={(e) => setDatos({ ...datos, carpeta: e.target.value })}>
              {carpetas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-400">
            Título dentro de la carpeta
            <input className={campo} list={`titulos-${d.id}`} value={datos.titulo} onChange={(e) => setDatos({ ...datos, titulo: e.target.value })} maxLength={100} />
            <datalist id={`titulos-${d.id}`}>
              {titulos(datos.carpeta).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            {confirmar ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-ink-100">¿Borrarlo? No se puede deshacer.</span>
                <button onClick={() => void pedir("DELETE")} disabled={ocupado} className="rounded-md bg-danger px-2.5 py-1 font-medium text-white hover:bg-danger/80">
                  Sí, borrar
                </button>
                <button onClick={() => setConfirmar(false)} className="rounded-md px-2 py-1 text-ink-300 hover:text-ink-100">
                  No
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmar(true)} disabled={ocupado} className="h-8 rounded-lg px-3 text-xs text-danger hover:bg-danger/10">
                Borrar documento
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)} disabled={ocupado} className="h-8 rounded-lg px-3 text-xs text-ink-400 hover:text-ink-100">
                Cancelar
              </button>
              <button
                onClick={() => void pedir("PATCH", datos)}
                disabled={ocupado}
                className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
              >
                {ocupado && <Spinner tamano="sm" />}
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

/** The folders: pick one; rename or delete it (only when empty) on hover; add a new one at the bottom. */
function PanelCarpetas({
  carpetas,
  documentos,
  activa,
  onElegir,
  onCambio,
}: {
  carpetas: Carpeta[];
  documentos: Documento[];
  activa: string | null;
  onElegir: (id: string | null) => void;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [nueva, setNueva] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedir = async (metodo: "POST" | "PATCH" | "DELETE", cuerpo: object) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/documentos/carpetas", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      setEditando(null);
      setBorrando(null);
      setNueva(null);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(false);
    }
  };
  const cuantos = (id: string) => documentos.filter((d) => d.carpeta === id).length;
  const campoCarpeta = "h-8 min-w-0 flex-1 rounded-md border border-white/[0.12] bg-ink-950/60 px-2 text-sm text-ink-100 outline-none focus:border-accent-500/60";

  return (
    <nav aria-label="Carpetas" className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-soft">
      <header className="px-4 py-2.5 text-white" style={{ background: "#2c90b6" }}>
        <h2 className="text-base leading-tight font-semibold">Carpetas</h2>
      </header>
      <ul className="py-1">
        <li>
          <button
            onClick={() => onElegir(null)}
            aria-pressed={activa === null}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] transition-colors ${activa === null ? "bg-white/[0.06] text-ink-100" : "text-ink-300 hover:bg-white/[0.03] hover:text-ink-100"}`}
          >
            <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-ink-300" />
            <span className="min-w-0 flex-1 truncate">Todos los documentos</span>
            <span className="tabular w-6 text-right text-xs text-ink-500">{documentos.length}</span>
          </button>
        </li>
        {carpetas.map((c) =>
          borrando === c.id ? (
            <li key={c.id} className="flex items-center gap-2 bg-danger/10 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink-100">¿Borrar «{c.nombre}»?</span>
              <button onClick={() => void pedir("DELETE", { id: c.id })} disabled={ocupado} className="rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-white hover:bg-danger/80">
                Sí, borrar
              </button>
              <button onClick={() => setBorrando(null)} className="rounded-md px-2 py-1 text-xs text-ink-300 hover:text-ink-100">
                No
              </button>
            </li>
          ) : editando === c.id ? (
            <li key={c.id} className="px-3 py-1.5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void pedir("PATCH", { id: c.id, nombre });
                }}
                className="flex items-center gap-1.5"
              >
                <input autoFocus className={campoCarpeta} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} onKeyDown={(e) => e.key === "Escape" && setEditando(null)} />
                <button type="submit" disabled={ocupado} title="Guardar" className="rounded-md px-1.5 py-1 text-success hover:bg-white/[0.05]">
                  ✓
                </button>
                <button type="button" onClick={() => setEditando(null)} title="Cancelar" className="rounded-md px-1.5 py-1 text-ink-400 hover:bg-white/[0.05]">
                  ✕
                </button>
              </form>
            </li>
          ) : (
            <li key={c.id} className={`group/carpeta flex items-center transition-colors ${activa === c.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}>
              <button
                onClick={() => onElegir(c.id)}
                aria-pressed={activa === c.id}
                className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left text-[15px] ${activa === c.id ? "text-ink-100" : "text-ink-300 hover:text-ink-100"}`}
              >
                <span aria-hidden className="h-5 w-1 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
              </button>
              <span className="flex items-center pr-4">
                <button
                  onClick={() => {
                    setEditando(c.id);
                    setNombre(c.nombre);
                    setError(null);
                  }}
                  title="Cambiar nombre"
                  className="hidden rounded-md px-1.5 py-1 text-xs text-ink-400 group-hover/carpeta:inline-block hover:bg-white/[0.06] hover:text-ink-100"
                >
                  ✎
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    if (cuantos(c.id)) setError(`«${c.nombre}» tiene documentos: muévelos o bórralos antes de borrar la carpeta`);
                    else setBorrando(c.id);
                  }}
                  title={cuantos(c.id) ? "Solo se pueden borrar carpetas vacías" : "Borrar carpeta"}
                  className="hidden rounded-md px-1.5 py-1 text-xs text-ink-400 group-hover/carpeta:inline-block hover:bg-danger/10 hover:text-danger"
                >
                  🗑
                </button>
                <span className="tabular w-6 text-right text-xs text-ink-500">{cuantos(c.id)}</span>
              </span>
            </li>
          ),
        )}
      </ul>
      <div className="border-t border-white/[0.06] px-3 py-2">
        {nueva === null ? (
          <button
            onClick={() => {
              setNueva("");
              setError(null);
            }}
            className="w-full rounded-md px-1 py-1.5 text-left text-[15px] text-accent-400 hover:text-accent-300"
          >
            ＋ Nueva carpeta
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pedir("POST", { nombre: nueva });
            }}
            className="flex items-center gap-1.5"
          >
            <input autoFocus className={campoCarpeta} value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={60} placeholder="Nombre de la carpeta" onKeyDown={(e) => e.key === "Escape" && setNueva(null)} />
            <button type="submit" disabled={ocupado} title="Crear" className="rounded-md px-1.5 py-1 text-success hover:bg-white/[0.05]">
              ✓
            </button>
            <button type="button" onClick={() => setNueva(null)} title="Cancelar" className="rounded-md px-1.5 py-1 text-ink-400 hover:bg-white/[0.05]">
              ✕
            </button>
          </form>
        )}
        {error && <p className="pt-1.5 text-xs text-danger">{error}</p>}
      </div>
    </nav>
  );
}
