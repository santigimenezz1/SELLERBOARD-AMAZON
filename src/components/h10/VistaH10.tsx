"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { PestanaDatos } from "./PestanaDatos";
import type { ArchivoH10, EstudioH10, MercadoXray, PalabrasMercado, ResenasEstudio } from "@/lib/datos/h10Tipos";
import { analizarResenas, clasificarPalabra, EUR_POR_GBP, informeFinal, marcasDelEstudio, nombrePais, posicionesDeRivales, rangosDePrecio, resumirEstudio, type AnalisisMercado } from "@/lib/datos/h10Analisis";
import { Bandera } from "@/components/Bandera";
import { Barras, euros, Nota, Pais, Tarjeta } from "./comun";
import { Markdown } from "@/components/chat/Markdown";
import { PestanaPalabras } from "./PestanaPalabras";
import { PestanaResenas } from "./PestanaResenas";
import { formatMoneda, formatNumero } from "@/lib/format";

const PESTANAS = [
  { id: "datos", texto: "Datos" },
  { id: "mercado", texto: "Mercado" },
  { id: "competidores", texto: "Competidores" },
  { id: "palabras", texto: "Palabras clave" },
  { id: "resenas", texto: "Reseñas" },
  { id: "conclusiones", texto: "Conclusiones" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

/** Empty tab of a study without that data yet. */
function SinDatos({ texto, onIrADatos }: { texto: string; onIrADatos?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-ink-400">
      <p className="max-w-md">{texto}</p>
      {onIrADatos && (
        <button onClick={onIrADatos} className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400">
          Ir a «Datos»
        </button>
      )}
    </div>
  );
}

/** «Análisis H10»: the stored Helium 10 studies (plus two sample ones), each with its data and analysis. */
export function VistaH10({
  estudios,
  palabras,
  resenas,
  archivos,
}: {
  estudios: EstudioH10[];
  palabras: Record<string, Record<string, PalabrasMercado>>;
  resenas: Record<string, ResenasEstudio>;
  /** Uploaded files of each stored study. */
  archivos: Record<string, ArchivoH10[]>;
}) {
  const router = useRouter();
  const [elegido, setElegido] = useState<string | null>(null);
  const estudio = estudios.find((e) => e.id === elegido) ?? estudios[0];
  // The open tab of each study; a stored one opens on «Datos», a sample one on «Mercado».
  const [pestanas, setPestanas] = useState<Record<string, Pestana>>({});
  const pestana = pestanas[estudio.id] ?? (estudio.ejemplo || estudio.mercados.length ? "mercado" : "datos");
  const irA = (p: Pestana) => setPestanas({ ...pestanas, [estudio.id]: p });
  const resumen = estudio.mercados.length ? resumirEstudio(estudio) : null;
  const palabrasEstudio = palabras[estudio.id] ?? {};
  const paisInicial = resumen?.mejor.mercado.codigoPais ?? Object.keys(palabrasEstudio)[0] ?? "ES";
  const datosAqui = estudio.ejemplo ? undefined : () => irA("datos");

  return (
    <div className="flex flex-col gap-4">
      {/* Studies */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {estudios.map((e) => (
          <TarjetaEstudio key={e.id} e={e} activo={e.id === estudio.id} archivos={archivos[e.id]?.length ?? 0} onElegir={() => setElegido(e.id)} />
        ))}
        <NuevoEstudio
          onCreado={(id) => {
            setElegido(id);
            router.refresh();
          }}
        />
      </div>

      <CabeceraEstudio
        key={`cabecera-${estudio.id}`}
        estudio={estudio}
        onBorrado={() => {
          setElegido(null);
          router.refresh();
        }}
      />

      {/* Tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.06]">
        {PESTANAS.filter((p) => p.id !== "datos" || !estudio.ejemplo).map((p) => (
          <button
            key={p.id}
            onClick={() => irA(p.id)}
            aria-current={pestana === p.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors ${pestana === p.id ? "border-accent-500 text-ink-100" : "border-transparent text-ink-400 hover:text-ink-100"}`}
          >
            {p.texto}
            {p.id === "datos" && <span className="ml-1.5 text-xs text-ink-500">{archivos[estudio.id]?.length ?? 0}</span>}
          </button>
        ))}
      </nav>

      {pestana === "datos" && !estudio.ejemplo && <PestanaDatos key={estudio.id} estudioId={estudio.id} archivos={archivos[estudio.id] ?? []} />}
      {pestana === "mercado" &&
        (resumen ? <PestanaMercado key={estudio.id} estudio={estudio} resumen={resumen} /> : <SinDatos texto="Para ver el mercado, sube el Xray (CSV o captura) de al menos un país." onIrADatos={datosAqui} />)}
      {pestana === "competidores" &&
        (resumen ? <PestanaCompetidores key={estudio.id} estudio={estudio} palabras={palabrasEstudio} /> : <SinDatos texto="Los competidores salen del Xray: súbelo en «Datos»." onIrADatos={datosAqui} />)}
      {pestana === "palabras" &&
        (Object.keys(palabrasEstudio).length ? (
          <PestanaPalabras key={estudio.id} estudio={estudio} palabras={palabrasEstudio} inicial={paisInicial} ejemplo={!!estudio.ejemplo} />
        ) : (
          <SinDatos texto="Para ver las palabras clave, sube el Cerebro o el Magnet (CSV o captura) de algún país." onIrADatos={datosAqui} />
        ))}
      {pestana === "resenas" &&
        (resenas[estudio.id] ? (
          <PestanaResenas key={estudio.id} datos={resenas[estudio.id]} />
        ) : (
          <SinDatos texto="El análisis de reseñas con IA llega en la fase 3. Mientras tanto, sube las reseñas de los competidores en «Datos»: quedan guardadas y se analizarán entonces." onIrADatos={datosAqui} />
        ))}
      {pestana === "conclusiones" &&
        (resumen ? (
          <div className="flex flex-col gap-4">
            <Informe informe={informeFinal(resumen, palabrasEstudio[resumen.mejor.mercado.codigoPais], resenas[estudio.id] ? analizarResenas(resenas[estudio.id]) : null)} />
            <Tarjeta titulo="Todas las conclusiones" subtitulo="Por ahora salen de reglas fijas; en la fase 3 las redactará la IA con todos los datos del estudio.">
              <div className="text-sm leading-relaxed text-ink-300">
                <Markdown
                  texto={[...resumen.conclusiones, ...conclusionesPalabras(resumen.mejor.mercado.codigoPais, palabrasEstudio), ...conclusionesResenas(resenas[estudio.id])]
                    .map((c) => `- ${c}`)
                    .join("\n")}
                />
              </div>
            </Tarjeta>
          </div>
        ) : (
          <SinDatos texto="Las conclusiones necesitan al menos el Xray de un país." onIrADatos={datosAqui} />
        ))}
    </div>
  );
}

/** A study in the list: its best country's score and the money at stake, or what's missing. */
function TarjetaEstudio({ e, activo, archivos, onElegir }: { e: EstudioH10; activo: boolean; archivos: number; onElegir: () => void }) {
  const r = e.mercados.length ? resumirEstudio(e) : null;
  return (
    <button
      onClick={onElegir}
      aria-pressed={activo}
      className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${activo ? "border-accent-500/60 bg-accent-500/[0.06]" : "border-white/[0.06] bg-ink-900/80 hover:border-white/[0.14]"}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-ink-100">{e.nombre}</span>
        {r ? <Nota valor={r.mejor.oportunidad} /> : <span className="text-xs text-ink-500">sin datos</span>}
      </span>
      <span className="flex items-center gap-2 text-xs text-ink-400">
        {e.ejemplo && <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-ink-300">EJEMPLO</span>}
        <span className="truncate">{e.descripcion || (e.ejemplo ? "" : `${archivos} ${archivos === 1 ? "archivo" : "archivos"}`)}</span>
      </span>
      <span className="flex items-center gap-2 text-xs text-ink-300">
        {e.mercados.map((m) => (
          <Bandera key={m.codigoPais} codigo={m.codigoPais} />
        ))}
        {r && (
          <>
            <span className="text-ink-500">·</span>
            <span className="tabular">{euros(r.mercadoTotalEur)}/mes</span>
          </>
        )}
      </span>
    </button>
  );
}

/** «＋ Nuevo estudio»: a card that turns into the name form. */
function NuevoEstudio({ onCreado }: { onCreado: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!abierto)
    return (
      <button
        onClick={() => setAbierto(true)}
        className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/[0.12] p-4 text-center text-sm text-ink-300 transition-colors hover:border-accent-500/50 hover:text-ink-100"
      >
        <span className="text-lg text-accent-400">＋</span>
        Nuevo estudio
        <span className="text-[11px] text-ink-500">Un producto que quieras analizar</span>
      </button>
    );
  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        setOcupado(true);
        setError(null);
        try {
          const r = await fetch("/api/h10/estudios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, descripcion }) });
          const b = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
          if (!r.ok || !b.id) throw new Error(b.error ?? `Error ${r.status}`);
          setAbierto(false);
          setNombre("");
          setDescripcion("");
          onCreado(b.id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo crear");
        } finally {
          setOcupado(false);
        }
      }}
      className="flex flex-col gap-2 rounded-xl border border-accent-500/40 bg-ink-900/80 p-4"
    >
      <input autoFocus required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre: «Rebounder de fútbol»" className="h-9 rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60" />
      <input maxLength={200} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" className="h-9 rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60" />
      {error && <p className="text-xs text-danger">{error}</p>}
      <span className="flex justify-end gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="h-8 rounded-lg px-3 text-xs text-ink-400 hover:text-ink-100">
          Cancelar
        </button>
        <button type="submit" disabled={ocupado || !nombre.trim()} className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60">
          {ocupado && <Spinner tamano="sm" />}
          Crear estudio
        </button>
      </span>
    </form>
  );
}

/** Name of the open study, with rename and delete for stored ones; a note on sample ones. */
function CabeceraEstudio({ estudio, onBorrado }: { estudio: EstudioH10; onBorrado: () => void }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [datos, setDatos] = useState({ nombre: estudio.nombre, descripcion: estudio.descripcion });
  const [ocupado, setOcupado] = useState(false);
  const pedir = async (metodo: "PATCH" | "DELETE") => {
    setOcupado(true);
    const r = await fetch(`/api/h10/estudios/${estudio.id}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: metodo === "PATCH" ? JSON.stringify(datos) : undefined }).catch(() => null);
    setOcupado(false);
    if (!r?.ok) return;
    if (metodo === "DELETE") onBorrado();
    else {
      setEditando(false);
      router.refresh();
    }
  };
  if (estudio.ejemplo)
    return (
      <p className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-sm text-accent-300">
        <strong>Estudio de ejemplo</strong> con datos de prueba: sirve para ver cómo queda el análisis. Crea el tuyo con «＋ Nuevo estudio» y sube tus archivos de Helium 10.
      </p>
    );
  if (editando)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void pedir("PATCH");
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input autoFocus required maxLength={80} value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60" />
        <input maxLength={200} value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} placeholder="Descripción" className="h-9 min-w-0 flex-[2] rounded-lg border border-white/[0.08] bg-ink-950/60 px-3 text-sm text-ink-100 outline-none focus:border-accent-500/60" />
        <button type="button" onClick={() => setEditando(false)} className="h-9 rounded-lg px-3 text-xs text-ink-400 hover:text-ink-100">
          Cancelar
        </button>
        <button type="submit" disabled={ocupado} className="h-9 rounded-lg bg-accent-500 px-3 text-xs font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60">
          Guardar
        </button>
      </form>
    );
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-ink-100">{estudio.nombre}</h2>
        {estudio.descripcion && <p className="text-xs text-ink-400">{estudio.descripcion}</p>}
      </div>
      <div className="flex items-center gap-1 text-xs">
        {confirmar ? (
          <>
            <span className="text-ink-200">¿Borrar el estudio con todos sus archivos? No se puede deshacer.</span>
            <button onClick={() => void pedir("DELETE")} disabled={ocupado} className="rounded-md bg-danger px-2.5 py-1 font-medium text-white hover:bg-danger/80">
              {ocupado ? "Borrando…" : "Sí, borrar"}
            </button>
            <button onClick={() => setConfirmar(false)} className="rounded-md px-2 py-1 text-ink-300 hover:text-ink-100">
              No
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditando(true)} className="rounded-md px-2 py-1.5 text-ink-300 hover:bg-white/[0.05] hover:text-ink-100">
              Renombrar
            </button>
            <button onClick={() => setConfirmar(true)} className="rounded-md px-2 py-1.5 text-ink-400 hover:bg-danger/10 hover:text-danger">
              Borrar estudio
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PestanaMercado({ estudio, resumen }: { estudio: EstudioH10; resumen: ReturnType<typeof resumirEstudio> }) {
  const [paisPrecio, setPaisPrecio] = useState(resumen.mejor.mercado.codigoPais);
  const mercadoPrecio = estudio.mercados.find((m) => m.codigoPais === paisPrecio) ?? resumen.mejor.mercado;
  const avisos = resumen.analisis.flatMap((a) => a.avisos.map((t) => ({ pais: a.mercado.codigoPais, t })));

  return (
    <div className="flex flex-col gap-4">
      {/* Headline figures */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: "Mejor país", v: <Pais codigo={resumen.mejor.mercado.codigoPais} />, s: <Nota valor={resumen.mejor.oportunidad} /> },
          { t: "Mercado total", v: `${euros(resumen.mercadoTotalEur)}`, s: "al mes, sumando los 4 países" },
          { t: "Búsquedas", v: formatNumero(resumen.busquedasTotales), s: "al mes, palabra clave principal" },
          {
            t: "Precio con más ventas",
            v: resumen.precioRecomendado ? `${resumen.precioRecomendado.desde}–${resumen.precioRecomendado.hasta === Infinity ? "+" : resumen.precioRecomendado.hasta} €` : "—",
            s: `en ${nombrePais(resumen.mejor.mercado.codigoPais)}`,
          },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
            <p className="text-xs text-ink-400">{x.t}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-100">{x.v}</p>
            <p className="mt-1 text-xs text-ink-400">{x.s}</p>
          </div>
        ))}
      </div>

      {/* Country comparison */}
      <Tarjeta titulo="Comparativa por país" subtitulo={`Ordenada por oportunidad. Libras pasadas a euros (1 £ = ${EUR_POR_GBP.toLocaleString("es-ES")} € de ejemplo).`}>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tabular w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
                {["País", "Palabra clave", "Búsquedas", "Facturación/mes", "Precio medio", "Reseñas medias", "Top 10 >5.000 €", "Top 10 <75 reseñas", "Cuota top 3", "Dificultad", "Oportunidad"].map((h, i) => (
                  <th key={h} className={`px-2 py-2 font-medium whitespace-nowrap ${i >= 2 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumen.analisis.map((a) => (
                <FilaPais key={a.mercado.codigoPais} a={a} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-400">
          <span className="font-medium text-ink-300">Oportunidad (más alta, mejor):</span>
          <span>
            <Nota valor={8} /> 7–10, merece la pena
          </span>
          <span>
            <Nota valor={5.5} /> 4,5–7, posible con más esfuerzo
          </span>
          <span>
            <Nota valor={3} /> menos de 4,5, poco interesante
          </span>
          <span className="font-medium text-ink-300">Dificultad: al revés, más baja es mejor.</span>
        </p>
        <details className="mt-2 text-xs text-ink-400">
          <summary className="cursor-pointer hover:text-ink-200">¿Cómo se calculan dificultad y oportunidad?</summary>
          <p className="mt-2 leading-relaxed">
            <strong className="text-ink-200">Dificultad</strong> (1–10): sube con las reseñas medias que tendrías que alcanzar y cuando los 3 primeros se llevan casi todo; baja si en el top 10 hay vendedores con menos de 75 reseñas
            facturando. <strong className="text-ink-200">Oportunidad</strong> (1–10): el dinero que mueve el mercado al mes, descontando parte de la dificultad.
          </p>
        </details>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Facturación al mes por país" subtitulo="Lo que facturan todos los productos de la búsqueda, en euros">
          <Barras
            filas={[...resumen.analisis]
              .sort((a, b) => b.facturacionEur - a.facturacionEur)
              .map((a) => ({
                clave: a.mercado.codigoPais,
                etiqueta: <Pais codigo={a.mercado.codigoPais} />,
                valor: a.facturacionEur,
                texto: euros(a.facturacionEur),
                detalle: `${nombrePais(a.mercado.codigoPais)}: ${euros(a.facturacionEur)} al mes · ${a.mercado.busquedas !== null ? `${formatNumero(a.mercado.busquedas)} búsquedas · ` : ""}${a.mercado.asins} productos`,
              }))}
          />
        </Tarjeta>

        <Tarjeta titulo="¿A qué precio se vende más?" subtitulo="Facturación de los competidores visibles por rango de precio">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {estudio.mercados.map((m) => (
              <button
                key={m.codigoPais}
                onClick={() => setPaisPrecio(m.codigoPais)}
                aria-pressed={m.codigoPais === paisPrecio}
                className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${m.codigoPais === paisPrecio ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
              >
                <Pais codigo={m.codigoPais} corto />
              </button>
            ))}
          </div>
          <Barras
            filas={rangosDePrecio(mercadoPrecio).map((r) => ({
              clave: String(r.desde),
              etiqueta: r.hasta === Infinity ? `${r.desde} € o más` : `${r.desde}–${r.hasta} €`,
              valor: r.facturacionEur,
              texto: euros(r.facturacionEur),
              detalle: `${r.competidores} ${r.competidores === 1 ? "producto" : "productos"} entre ${r.desde} y ${r.hasta === Infinity ? "más" : r.hasta} € facturan ${euros(r.facturacionEur)} al mes`,
            }))}
          />
        </Tarjeta>
      </div>

      <Marcas estudio={estudio} />

      {avisos.length > 0 && (
        <Tarjeta titulo="Avisos sobre los datos" subtitulo="Cosas raras que conviene comprobar antes de decidir">
          <ul className="flex flex-col gap-2 text-sm text-ink-300">
            {avisos.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-warning">⚠</span>
                <span>
                  <Pais codigo={a.pais} corto />: {a.t}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}

function FilaPais({ a }: { a: AnalisisMercado }) {
  const m = a.mercado;
  return (
    <tr className="border-b border-white/[0.05]">
      <td className="px-2 py-2.5">
        <Pais codigo={m.codigoPais} />
      </td>
      <td className="max-w-48 truncate px-2 py-2.5 text-ink-300" title={m.palabraClave}>
        {m.palabraClave}
      </td>
      <td className={`px-2 py-2.5 text-right ${m.busquedas === 0 ? "text-warning" : ""}`} title={m.busquedas === null ? "Sube el Magnet o el Cerebro de este país para tener las búsquedas" : undefined}>
        {m.busquedas !== null ? formatNumero(m.busquedas) : <span className="text-ink-600">—</span>}
      </td>
      <td className="px-2 py-2.5 text-right font-medium text-ink-100">{euros(a.facturacionEur)}</td>
      <td className="px-2 py-2.5 text-right">{euros(a.precioMedioEur)}</td>
      <td className="px-2 py-2.5 text-right">{formatNumero(m.resenasMedias)}</td>
      <td className="px-2 py-2.5 text-right">{m.top10Mas5000}/10</td>
      <td className="px-2 py-2.5 text-right">{m.top10Menos75}/10</td>
      <td className="px-2 py-2.5 text-right">{Math.round(a.cuotaTop3 * 100)} %</td>
      <td className="px-2 py-2.5 text-right">
        <Nota valor={a.dificultad} invertida />
      </td>
      <td className="px-2 py-2.5 text-right">
        <Nota valor={a.oportunidad} />
      </td>
    </tr>
  );
}

function Marcas({ estudio }: { estudio: EstudioH10 }) {
  const marcas = marcasDelEstudio(estudio).slice(0, 10);
  return (
    <Tarjeta titulo="Marcas de la competencia" subtitulo="Ordenadas por lo que facturan al mes entre todos sus productos visibles, en qué países están y con cuántos listings">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
              <th className="px-2 py-2 font-medium">Marca</th>
              {estudio.mercados.map((m) => (
                <th key={m.codigoPais} className="px-2 py-2 text-center font-medium">
                  <Pais codigo={m.codigoPais} corto />
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Listings</th>
              <th className="px-2 py-2 text-right font-medium">Facturación/mes</th>
            </tr>
          </thead>
          <tbody>
            {marcas.map((b) => (
              <tr key={b.marca} className="border-b border-white/[0.05]">
                <td className="px-2 py-2 font-medium text-ink-100">{b.marca}</td>
                {estudio.mercados.map((m) => (
                  <td key={m.codigoPais} className="px-2 py-2 text-center">
                    {b.paises.includes(m.codigoPais) ? <span className="text-success">✓<span className="sr-only">está</span></span> : <span className="text-ink-600">—</span>}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">{b.listings}</td>
                <td className="px-2 py-2 text-right font-medium text-ink-100">{euros(b.facturacionEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

/** The verdict card: launch / validate / drop, with the score and the reasons. */
function Informe({ informe }: { informe: ReturnType<typeof informeFinal> }) {
  const estilo = {
    lanzar: { borde: "border-success/40", fondo: "bg-success/[0.06]", texto: "text-success", etiqueta: "✓ Lanzar" },
    validar: { borde: "border-warning/40", fondo: "bg-warning/[0.06]", texto: "text-warning", etiqueta: "◐ Validar primero" },
    descartar: { borde: "border-danger/40", fondo: "bg-danger/[0.06]", texto: "text-danger", etiqueta: "✕ Descartar" },
  }[informe.veredicto];
  return (
    <section className={`rounded-xl border ${estilo.borde} ${estilo.fondo} p-5 shadow-soft`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-xs font-semibold tracking-wide uppercase ${estilo.texto}`}>Informe final · {estilo.etiqueta}</p>
          <h2 className="mt-1 text-xl font-semibold text-ink-100">{informe.titular}</h2>
        </div>
        <div className="text-right">
          <p className="tabular text-3xl font-semibold text-ink-100">
            {informe.nota.toLocaleString("es-ES")}
            <span className="text-base text-ink-400">/10</span>
          </p>
          <p className="text-xs text-ink-400">nota final</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {informe.puntos.map((pt) => (
          <div key={pt.titulo} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
            <dt className="text-xs font-semibold text-ink-300">{pt.titulo}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink-200">{pt.texto}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-ink-500">
        Nota final: la oportunidad del mejor país, +0,4 si los clientes de la competencia se quejan mucho (hay hueco para hacerlo mejor) y −0,8 si hay datos dudosos. 7 o más: lanzar · 5–7: validar · menos de 5: descartar.
      </p>
    </section>
  );
}

/** Review lines for the conclusions: what customers complain about and how good the competition is. */
function conclusionesResenas(datos: ResenasEstudio | undefined): string[] {
  if (!datos) return [];
  const a = analizarResenas(datos);
  const [q1, q2] = a.quejas;
  return [
    q1 ? `La queja más repetida de la competencia: **«${q1.texto.toLowerCase()}»** (${q1.porcentaje} % de las reseñas)${q2 ? `, seguida de «${q2.texto.toLowerCase()}» (${q2.porcentaje} %)` : ""}.` : "",
    `La competencia tiene ${a.valoracionMedia.toLocaleString("es-ES")} ★ de media y un ${a.negativas} % de reseñas de 1–2 estrellas${a.negativas >= 12 ? ": clientes insatisfechos, hueco para un producto mejor" : ""}.`,
  ].filter(Boolean);
}

/** Keyword lines for the conclusions: the must-have keywords and the best opportunity in the best country. */
function conclusionesPalabras(pais: string, palabras: Record<string, PalabrasMercado> | undefined): string[] {
  const datos = palabras?.[pais];
  if (!datos) return [];
  const max = Math.max(...datos.palabras.map((p) => p.busquedas));
  const orden = [...datos.palabras].sort((a, b) => b.busquedas - a.busquedas);
  const imprescindibles = orden.filter((p) => clasificarPalabra(p, max) === "imprescindible").slice(0, 3);
  const oportunidad = orden.find((p) => clasificarPalabra(p, max) === "oportunidad");
  const lider = [...posicionesDeRivales(datos)].sort((a, b) => b.busquedasCaptadas - a.busquedasCaptadas)[0];
  return [
    imprescindibles.length ? `Tu título en ${nombrePais(pais)} debe llevar: ${imprescindibles.map((p) => `**«${p.texto}»**`).join(", ")}.` : "",
    oportunidad ? `Oportunidad de palabra clave: **«${oportunidad.texto}»** (${formatNumero(oportunidad.busquedas)} búsquedas y solo ${oportunidad.densidadTitulos} títulos la usan).` : "",
    lider ? `En palabras clave manda **${lider.rival}**: ${lider.enTop10} en el top 10, que le traen ${formatNumero(lider.busquedasCaptadas)} búsquedas al mes.` : "",
  ].filter(Boolean);
}

function PestanaCompetidores({ estudio, palabras }: { estudio: EstudioH10; palabras: Record<string, PalabrasMercado> }) {
  const [pais, setPais] = useState<string | null>(null);
  /** Open competitor card: «country|brand». */
  const [abierta, setAbierta] = useState<string | null>(null);
  const tieneFicha = (codigo: string, marca: string) => !!palabras[codigo]?.rivales.includes(marca);
  const filas = estudio.mercados
    .filter((m) => !pais || m.codigoPais === pais)
    .flatMap((m) => m.competidores.map((c) => ({ m, c, eur: m.moneda === "GBP" ? c.facturacion * EUR_POR_GBP : c.facturacion })))
    .sort((a, b) => b.eur - a.eur);
  const moneda = (v: number, m: MercadoXray) => formatMoneda(v, m.moneda);

  return (
    <Tarjeta titulo="Competidores" subtitulo="Ordenados por facturación (en la versión real, todos los del CSV, con su ASIN). Las marcas con ▸ tienen ficha con sus palabras clave.">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[null, ...estudio.mercados.map((m) => m.codigoPais)].map((p) => (
          <button
            key={p ?? "todos"}
            onClick={() => setPais(p)}
            aria-pressed={pais === p}
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${pais === p ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
          >
            {p ? <Pais codigo={p} corto /> : "Todos"}
          </button>
        ))}
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-xs text-ink-400">
              <th className="px-2 py-2 font-medium">País</th>
              <th className="px-2 py-2 font-medium">Producto</th>
              <th className="px-2 py-2 font-medium">Marca</th>
              <th className="px-2 py-2 text-right font-medium">Precio</th>
              <th className="px-2 py-2 text-right font-medium">Ventas/mes</th>
              <th className="px-2 py-2 text-right font-medium">Facturación/mes</th>
              <th className="px-2 py-2 text-right font-medium">Reseñas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ m, c }, i) => {
              const clave = `${m.codigoPais}|${c.marca}`;
              const ficha = tieneFicha(m.codigoPais, c.marca);
              // The card opens under the brand's first (highest-earning) row in that country.
              const primera = filas.findIndex((f) => f.m.codigoPais === m.codigoPais && f.c.marca === c.marca) === i;
              return (
              <Fragment key={`${m.codigoPais}-${c.puesto}-${i}`}>
              <tr className="border-b border-white/[0.05]">
                <td className="px-2 py-2">
                  <Pais codigo={m.codigoPais} corto />
                </td>
                <td className="max-w-72 px-2 py-2">
                  <span className="block truncate text-ink-100" title={c.titulo}>
                    {c.titulo}
                  </span>
                  {c.etiquetas.length > 0 && (
                    <span className="mt-0.5 flex gap-1">
                      {c.etiquetas.map((t) => (
                        <span key={t} className="rounded bg-serie-ventas/15 px-1 text-[10px] font-medium text-ink-200">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-ink-300">
                  {ficha && primera ? (
                    <button onClick={() => setAbierta(abierta === clave ? null : clave)} aria-expanded={abierta === clave} className="inline-flex items-center gap-1 text-accent-300 hover:text-accent-400">
                      <span aria-hidden className={`inline-block transition-transform ${abierta === clave ? "rotate-90" : ""}`}>▸</span>
                      {c.marca}
                    </button>
                  ) : (
                    c.marca
                  )}
                </td>
                <td className="px-2 py-2 text-right">{moneda(c.precio, m)}</td>
                <td className="px-2 py-2 text-right">{c.ventas !== null ? formatNumero(c.ventas) : <span className="text-ink-600">—</span>}</td>
                <td className="px-2 py-2 text-right font-medium text-ink-100">{moneda(c.facturacion, m)}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {formatNumero(c.resenas)}
                  {c.variacionResenas !== 0 && (
                    <span className={`ml-1 text-xs ${c.variacionResenas > 0 ? "text-success" : "text-danger"}`}>
                      ({c.variacionResenas > 0 ? "+" : ""}
                      {formatNumero(c.variacionResenas)})
                    </span>
                  )}
                </td>
              </tr>
              {ficha && primera && abierta === clave && (
                <tr className="border-b border-white/[0.05] bg-ink-950/40">
                  <td colSpan={7} className="px-3 py-3">
                    <FichaCompetidor marca={c.marca} mercado={m} palabras={palabras[m.codigoPais]} />
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

/** A competitor in one country: its listings there (Xray) and where it ranks (Cerebro). */
function FichaCompetidor({ marca, mercado, palabras }: { marca: string; mercado: MercadoXray; palabras: PalabrasMercado }) {
  const listings = mercado.competidores.filter((c) => c.marca === marca);
  const pos = posicionesDeRivales(palabras).find((r) => r.rival === marca);
  const precios = listings.map((l) => l.precio);
  const datos = [
    { t: "Listings en el top", v: formatNumero(listings.length) },
    { t: "Facturación/mes", v: formatMoneda(Math.round(listings.reduce((s, l) => s + l.facturacion, 0)), mercado.moneda).replace(",00", "") },
    { t: "Precios", v: precios.length > 1 ? `${formatMoneda(Math.min(...precios), mercado.moneda)} – ${formatMoneda(Math.max(...precios), mercado.moneda)}` : formatMoneda(precios[0], mercado.moneda) },
    { t: "Reseñas (máx.)", v: formatNumero(Math.max(...listings.map((l) => l.resenas))) },
    { t: "Palabras en el top 10", v: pos ? `${pos.enTop10} de ${palabras.palabras.length}` : "—" },
    { t: "Búsquedas que capta", v: pos ? formatNumero(pos.busquedasCaptadas) : "—" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink-100">
        Ficha de {marca} en {nombrePais(mercado.codigoPais)}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {datos.map((d) => (
          <div key={d.t} className="rounded-lg border border-white/[0.06] bg-ink-900/80 px-3 py-2">
            <p className="text-[11px] text-ink-400">{d.t}</p>
            <p className="tabular mt-0.5 text-sm font-semibold text-ink-100">{d.v}</p>
          </div>
        ))}
      </div>
      {pos && pos.mejores.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
          Sus mejores posiciones:
          {pos.mejores.map((x) => (
            <span key={x.texto} className="tabular rounded bg-white/[0.04] px-1.5 py-0.5 text-ink-300">
              {x.texto} <span className={x.posicion <= 3 ? "font-semibold text-success" : "text-ink-100"}>#{x.posicion}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
