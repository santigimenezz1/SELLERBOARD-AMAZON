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
const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

type Ambito = "pais" | "principal" | "producto";
type ItemLista = { id: string; herramienta: HerramientaH10; texto: string; necesidad: string; ambito: Ambito; ayuda: string };

/**
 * Everything a complete study needs: per country, once (in your main country) and once per product. In order of
 * importance within each group.
 */
const LISTA: ItemLista[] = [
  { id: "xray", herramienta: "xray", texto: "Xray de la búsqueda principal", necesidad: "Imprescindible", ambito: "pais", ayuda: "Helium 10 → Xray → Export (CSV)" },
  { id: "xray2", herramienta: "xray", texto: "Xray de búsquedas secundarias", necesidad: "Recomendable", ambito: "pais", ayuda: "Xray de 1–2 búsquedas más (por ejemplo «fußball trainingsgerät»), en CSV" },
  { id: "cerebro", herramienta: "cerebro", texto: "Cerebro de los competidores", necesidad: "Muy recomendable", ambito: "pais", ayuda: "Cerebro con los 3–5 ASIN líderes a la vez, en CSV" },
  { id: "resenas", herramienta: "resenas", texto: "Reseñas de los competidores", necesidad: "Recomendable", ambito: "pais", ayuda: "De los 3–5 líderes: CSV de Helium 10 o capturas de Amazon" },
  { id: "calculadora", herramienta: "calculadora", texto: "Calculadora de Amazon", necesidad: "Imprescindible en 1 país", ambito: "pais", ayuda: "Calculadora de ingresos con el ASIN del líder (captura), o «Traer datos de Amazon» en Competidores, que trae las tarifas de los 5 países solo" },
  { id: "historial", herramienta: "historial", texto: "Historial de ventas (12 meses)", necesidad: "Recomendable", ambito: "pais", ayuda: "Gráficas de ventas, precio y BSR de los 2–3 líderes, en Xray (captura). Imprescindible en tu país principal; en los demás, para ver si la temporada coincide" },
  { id: "ficha", herramienta: "ficha", texto: "Fichas de los competidores", necesidad: "Recomendable", ambito: "pais", ayuda: "Capturas de la página en Amazon de los 3–5 líderes en ese país (fotos, título, viñetas)" },
  { id: "restricciones", herramienta: "restricciones", texto: "¿Puedes vender en la categoría?", necesidad: "Recomendable", ambito: "principal", ayuda: "Seller Central → Añadir un producto → busca el ASIN del líder (captura)" },
  { id: "proveedor", herramienta: "proveedor", texto: "Precio y cantidad mínima del proveedor", necesidad: "Imprescindible", ambito: "producto", ayuda: "Presupuesto o anuncio del proveedor. También vale con guardar tus costes en «Rentabilidad»" },
  { id: "envio", herramienta: "envio", texto: "Envío hasta Amazon y aduana", necesidad: "Imprescindible", ambito: "producto", ayuda: "Presupuesto del transitario. También vale con guardar tus costes en «Rentabilidad»" },
  { id: "medidas", herramienta: "medidas", texto: "Medidas y peso de tu caja", necesidad: "Recomendable", ambito: "producto", ayuda: "Ficha técnica del proveedor, o ponlas en «Tu caja» en «Rentabilidad» (elige la tarifa FBA del competidor más parecido)" },
  { id: "certificados", herramienta: "certificados", texto: "Certificados (CE, EN 71…)", necesidad: "Recomendable", ambito: "producto", ayuda: "Del proveedor. EN 71 si es un juguete" },
];
const GRUPOS: { ambito: Ambito; titulo: string }[] = [
  { ambito: "pais", titulo: "En cada país" },
  { ambito: "principal", titulo: "Una vez, en tu país principal" },
  { ambito: "producto", titulo: "Una vez por producto (tuyo)" },
];
/** The countries the list asks for: the four big ones, plus Italy once something of it is uploaded. */
const PAISES_LISTA = ["ES", "DE", "FR", "GB"] as const;

/** «Rebounder für Fußball» → «rebounder fur fussball»: the same search however it was written. */
const normalizar = (t: string) =>
  t
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Distinct keywords among the Xray files of a country (older files carry it only in their summary). */
const busquedasXray = (archivos: ArchivoH10[], pais: string) =>
  new Set(archivos.filter((a) => a.herramienta === "xray" && a.codigoPais === pais && a.estado !== "error").map((a) => normalizar(a.palabraClave ?? a.resumen.split(" · ")[2] ?? ""))).size;

/**
 * «Datos»: upload the study's Helium 10 files, see what's missing per country, and the files kept. `tarifasAuto`:
 * countries with Amazon fees read automatically («Traer datos de Amazon»), which count as the calculator.
 */
export function PestanaDatos({
  estudioId,
  archivos,
  costesPropios,
  cajaPropia,
  tarifasAuto,
}: {
  estudioId: string;
  archivos: ArchivoH10[];
  costesPropios: boolean;
  cajaPropia: boolean;
  tarifasAuto: string[];
}) {
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

  const columnas: string[] = [...PAISES_LISTA, ...(archivos.some((a) => a.codigoPais === "IT") ? ["IT"] : [])];
  const validos = archivos.filter((a) => a.estado !== "error");
  /** Files that tick an item (in a country, or anywhere for the once-only ones). */
  const cuantos = (it: ItemLista, pais?: string): number => {
    if (it.id === "xray2") return Math.max(0, busquedasXray(archivos, pais!) - 1);
    const n = validos.filter((a) => a.herramienta === it.herramienta && (it.ambito !== "pais" || a.codigoPais === pais)).length;
    // Saving your own costs in «Rentabilidad» counts for the supplier and freight items, your box for its item;
    // Amazon's automatic fees, for the calculator.
    if (it.id === "calculadora" && pais && tarifasAuto.includes(pais)) return n + 1;
    return n || (((it.id === "proveedor" || it.id === "envio") && costesPropios) || (it.id === "medidas" && cajaPropia) ? 1 : 0);
  };
  const casillas = LISTA.flatMap((it) => (it.ambito === "pais" ? columnas.map((p) => cuantos(it, p) > 0) : [cuantos(it) > 0]));
  const hechas = casillas.filter(Boolean).length;
  /** A missing box picks its country and file type above, ready to upload. */
  const preparar = (it: ItemLista, pais?: string) => {
    setHerramienta(it.herramienta);
    setPais(pais ?? "");
    document.getElementById(`subir-${estudioId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta id={`subir-${estudioId}`} titulo="Subir archivos de Helium 10" subtitulo="CSV exportados (lo mejor: datos completos y exactos) o capturas de pantalla. La IA reconoce la herramienta y el país; si quieres, indícalos tú.">
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
                  {/* Secondary searches are Xrays too: the list tells them apart by their keyword. */}
                  {h.id === "xray" ? "Xray (búsqueda principal o secundaria)" : h.nombre}
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

      <Tarjeta
        titulo={`Qué tienes y qué falta · ${hechas} de ${casillas.length}`}
        subtitulo="Todo lo que necesita un estudio completo. Toca un ○ para dejar elegidos arriba el país y el tipo, y sube el archivo."
      >
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={hechas} aria-valuemax={casillas.length} aria-label="Completado">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(hechas / casillas.length) * 100}%` }} />
        </div>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                <th className="px-2 py-2 font-medium">Qué</th>
                <th className="px-2 py-2 font-medium">Importancia</th>
                {columnas.map((p) => (
                  <th key={p} className="px-2 py-2 text-center font-medium">
                    <Pais codigo={p} corto />
                  </th>
                ))}
              </tr>
            </thead>
            {GRUPOS.map((g) => (
              <tbody key={g.ambito}>
                <tr>
                  <td colSpan={2 + columnas.length} className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                    {g.titulo}
                  </td>
                </tr>
                {LISTA.filter((it) => it.ambito === g.ambito).map((it) => (
                  <tr key={it.id} className="border-b border-white/[0.05]">
                    <td className="px-2 py-2" title={it.ayuda}>
                      <span className="font-medium text-ink-100">{it.texto}</span>
                      <span className="block text-[11px] text-ink-500">{it.ayuda}</span>
                    </td>
                    <td className={`px-2 py-2 text-xs whitespace-nowrap ${it.necesidad.startsWith("Imprescindible") ? "text-accent-300" : "text-ink-400"}`}>{it.necesidad}</td>
                    {it.ambito === "pais" ? (
                      columnas.map((p) => <Casilla key={p} n={cuantos(it, p)} onFalta={() => preparar(it, p)} />)
                    ) : (
                      <Casilla n={cuantos(it)} span={columnas.length} onFalta={() => preparar(it)} />
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
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

/** One box of the list: ✓ (with how many files) or a ○ that prepares the upload. */
function Casilla({ n, span, onFalta }: { n: number; span?: number; onFalta: () => void }) {
  return (
    <td colSpan={span} className="px-2 py-2 text-center">
      {n > 0 ? (
        <span className="text-success" title={`${n} ${n === 1 ? "archivo" : "archivos"}`}>
          ✓{n > 1 && <span className="ml-0.5 text-[10px] text-ink-400">×{n}</span>}
        </span>
      ) : (
        <button onClick={onFalta} title="Falta: tócalo para prepararlo arriba" className="rounded-md px-2 py-0.5 text-ink-500 hover:bg-white/[0.06] hover:text-accent-300">
          ○
        </button>
      )}
    </td>
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
