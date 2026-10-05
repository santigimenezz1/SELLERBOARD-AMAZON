"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HERRAMIENTAS_H10, PAISES_H10, type ArchivoH10, type HerramientaH10 } from "@/lib/datos/h10Tipos";
import { nombrePais } from "@/lib/datos/h10Analisis";
import { Spinner } from "@/components/Spinner";
import { Pais, Tarjeta } from "./comun";

const MAXIMO = 15 * 1024 * 1024;
/** Files read at the same time (each one is an AI call of a few seconds). */
const SIMULTANEOS = 2;
const campo = "h-9 rounded-lg border border-white/[0.08] bg-ink-950/60 px-2.5 text-sm text-ink-100 outline-none focus:border-accent-500/60";
const nombreHerramienta = (h: HerramientaH10) => HERRAMIENTAS_H10.find((x) => x.id === h)?.nombre ?? h;
const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

/** What to download for each country, in order of importance. */
const CHECKLIST: { id: HerramientaH10; necesidad: string }[] = [
  { id: "xray", necesidad: "Imprescindible" },
  { id: "cerebro", necesidad: "Muy recomendable" },
  { id: "magnet", necesidad: "Muy recomendable" },
  { id: "resenas", necesidad: "Recomendable (fase 3)" },
  { id: "calculadora", necesidad: "Recomendable (rentabilidad)" },
];

/** «Datos»: upload the study's Helium 10 files, see what's missing per country, and the files kept. */
export function PestanaDatos({ estudioId, archivos }: { estudioId: string; archivos: ArchivoH10[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pais, setPais] = useState("");
  const [herramienta, setHerramienta] = useState("");
  const [encima, setEncima] = useState(false);
  const [cola, setCola] = useState<{ hecho: number; total: number } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  // Leaving mid-upload would stop the files still waiting: the browser asks first.
  useEffect(() => {
    if (!cola) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cola]);

  const subir = async (lista: File[]) => {
    if (!lista.length || cola) return;
    setErrores([]);
    setCola({ hecho: 0, total: lista.length });
    const fallos: string[] = [];
    let siguiente = 0;
    let hechos = 0;
    const trabajador = async () => {
      while (siguiente < lista.length) {
        const a = lista[siguiente++];
        try {
          if (a.size > MAXIMO) throw new Error("pasa de 15 MB");
          const f = new FormData();
          f.set("archivo", a);
          if (pais) f.set("pais", pais);
          if (herramienta) f.set("herramienta", herramienta);
          const r = await fetch(`/api/h10/estudios/${estudioId}/archivos`, { method: "POST", body: f });
          const b = (await r.json().catch(() => ({}))) as { error?: string; archivo?: ArchivoH10 };
          if (!r.ok) throw new Error(b.error ?? `error ${r.status}`);
          if (b.archivo?.estado === "error") fallos.push(`${a.name}: ${b.archivo.error}`);
        } catch (e) {
          fallos.push(`${a.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`);
        }
        setCola({ hecho: ++hechos, total: lista.length });
        router.refresh();
      }
    };
    await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, lista.length) }, trabajador));
    setErrores(fallos);
    setCola(null);
    router.refresh();
  };

  // Countries in play: those of the uploaded files, or all of them while there are none.
  const paisesUsados = PAISES_H10.filter((p) => archivos.some((a) => a.codigoPais === p));
  const columnas = paisesUsados.length ? paisesUsados : PAISES_H10;
  const cuenta = (h: HerramientaH10, p: string) => archivos.filter((a) => a.herramienta === h && a.codigoPais === p && a.estado !== "error").length;
  const hechas = CHECKLIST.reduce((s, c) => s + columnas.filter((p) => cuenta(c.id, p) > 0).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo="Subir archivos de Helium 10" subtitulo="CSV exportados (lo mejor: datos completos y exactos) o capturas de pantalla. La IA reconoce la herramienta y el país; si quieres, indícalos tú.">
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-400">
            País
            <select className={campo} value={pais} onChange={(e) => setPais(e.target.value)} disabled={!!cola}>
              <option value="">Automático</option>
              {PAISES_H10.map((p) => (
                <option key={p} value={p}>
                  {nombrePais(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-400">
            Herramienta
            <select className={campo} value={herramienta} onChange={(e) => setHerramienta(e.target.value)} disabled={!!cola}>
              <option value="">Automática</option>
              {HERRAMIENTAS_H10.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            void subir([...e.dataTransfer.files]);
          }}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-5 transition-colors ${encima ? "border-accent-500/70 bg-accent-500/10" : "border-white/[0.12] bg-ink-950/40"}`}
        >
          {cola ? (
            <p className="flex items-center gap-2.5 text-sm text-ink-200">
              <Spinner tamano="sm" />
              Leyendo con IA: {cola.hecho} de {cola.total} listos…
            </p>
          ) : (
            <p className="text-sm text-ink-300">
              Arrastra aquí los CSV o las capturas <span className="text-ink-500">· varios a la vez · hasta 15 MB cada uno</span>
            </p>
          )}
          <button
            onClick={() => input.current?.click()}
            disabled={!!cola}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-ink-950 transition-all hover:bg-accent-400 active:scale-[0.97] disabled:opacity-60"
          >
            <span aria-hidden>＋</span> Subir archivos
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept=".csv,text/csv,image/*,.pdf,.xlsx,.xls"
            onChange={(e) => {
              void subir([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
        {errores.length > 0 && (
          <ul role="alert" className="mt-3 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo={`Qué tienes y qué falta · ${hechas} de ${CHECKLIST.length * columnas.length}`} subtitulo="Para aprovechar el mes de Helium 10: cada casilla es una descarga por país">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                <th className="px-2 py-2 font-medium">Herramienta</th>
                <th className="px-2 py-2 font-medium">Importancia</th>
                {columnas.map((p) => (
                  <th key={p} className="px-2 py-2 text-center font-medium">
                    <Pais codigo={p} corto />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHECKLIST.map((c) => (
                <tr key={c.id} className="border-b border-white/[0.05]">
                  <td className="px-2 py-2 font-medium text-ink-100" title={HERRAMIENTAS_H10.find((h) => h.id === c.id)?.ayuda}>
                    {nombreHerramienta(c.id)}
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-400">{c.necesidad}</td>
                  {columnas.map((p) => {
                    const n = cuenta(c.id, p);
                    return (
                      <td key={p} className="px-2 py-2 text-center">
                        {n > 0 ? (
                          <span className="text-success" title={`${n} ${n === 1 ? "archivo" : "archivos"}`}>
                            ✓{n > 1 && <span className="ml-0.5 text-[10px] text-ink-400">×{n}</span>}
                          </span>
                        ) : (
                          <span className="text-ink-600" title="Falta">
                            ○
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo={`Archivos guardados · ${archivos.length}`} subtitulo="Los originales quedan guardados para siempre: puedes volver a verlos o descargarlos aunque dejes de pagar Helium 10">
        {archivos.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">Aún no hay archivos. Sube el primero arriba.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {archivos.map((a) => (
              <FilaArchivo key={a.id} estudioId={estudioId} a={a} onCambio={() => router.refresh()} />
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

const ESTADOS = {
  procesado: { texto: "Leído", clase: "bg-success/15 text-success" },
  guardado: { texto: "Guardado", clase: "bg-white/[0.06] text-ink-300" },
  error: { texto: "Error", clase: "bg-danger/15 text-danger" },
};

function FilaArchivo({ estudioId, a, onCambio }: { estudioId: string; a: ArchivoH10; onCambio: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const url = `/api/h10/estudios/${estudioId}/archivos/${a.id}`;
  const borrar = async () => {
    setOcupado(true);
    await fetch(url, { method: "DELETE" }).catch(() => {});
    setOcupado(false);
    onCambio();
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ESTADOS[a.estado].clase}`}>{ESTADOS[a.estado].texto}</span>
      {a.codigoPais && <Pais codigo={a.codigoPais} corto />}
      <span className="min-w-0 flex-1">
        <a href={url} target="_blank" rel="noopener" className="block truncate font-medium text-ink-100 hover:underline" title={a.nombre}>
          {a.resumen}
        </a>
        <span className={`block truncate text-[11px] ${a.error ? "text-danger" : "text-ink-500"}`}>{a.error ?? `${a.nombre} · ${tamano(a.tamano)} · ${fecha(a.subidoEn)}`}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs">
        <a href={`${url}?descargar=1`} className="rounded-md px-2 py-1.5 text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
          Descargar
        </a>
        {confirmar ? (
          <>
            <button onClick={() => void borrar()} disabled={ocupado} className="rounded-md bg-danger px-2 py-1 font-medium text-white hover:bg-danger/80">
              {ocupado ? "Borrando…" : "Sí, borrar"}
            </button>
            <button onClick={() => setConfirmar(false)} className="rounded-md px-2 py-1 text-ink-300 hover:text-ink-100">
              No
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmar(true)} className="rounded-md px-2 py-1.5 text-ink-400 hover:bg-danger/10 hover:text-danger" title="Borra el archivo y sus datos del estudio">
            Borrar
          </button>
        )}
      </span>
    </li>
  );
}
