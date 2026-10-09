import Link from "next/link";
import { notFound } from "next/navigation";
import { estudiosParaVista, quejasEstrellasDe, resenasCompletasDe } from "@/lib/datos/estudiosH10";
import { analizarResenas, nombrePais } from "@/lib/datos/h10Analisis";
import { esCodigoPais } from "@/lib/datos/h10Tipos";
import { formatMoneda, formatNumero } from "@/lib/format";
import { Pais, Tarjeta } from "@/components/h10/comun";
import { enlaceAmazon } from "@/lib/datos/h10Enlaces";
import { FilaTema } from "@/components/h10/PestanaResenas";
import { ResenasCompetidor } from "@/components/h10/ResenasCompetidor";
import { QuejasEstrellas } from "@/components/h10/QuejasEstrellas";

/** One competitor of a study in one country: its Xray figures, what its customers say and every review uploaded. */
export default async function CompetidorH10({ params }: PageProps<"/analisis-h10/[id]/competidor/[pais]/[asin]">) {
  const { id, pais, asin } = await params;
  if (!esCodigoPais(pais)) notFound();
  const v = (await estudiosParaVista()).find((x) => x.estudio.id === id);
  const m = v?.estudio.mercados.find((x) => x.codigoPais === pais);
  const c = m?.competidores.find((x) => x.asin === asin);
  if (!v || !m || !c) notFound();
  const e = v.estudio;
  const volver = `/analisis-h10?estudio=${id}&pestana=resenas`;

  const resenas = await resenasCompletasDe(id, pais, asin);
  const porEstrellas = await quejasEstrellasDe(id, pais, asin);
  const temas = analizarResenas({ ...e, resenasH10: (e.resenasH10 ?? []).filter((r) => r.codigoPais === pais && r.asin === asin) });
  const orden = [...m.competidores].sort((a, b) => b.facturacion - a.facturacion);
  const total = orden.reduce((t, x) => t + x.facturacion, 0);
  const puesto = orden.indexOf(c) + 1;
  const dinero = (n: number) => formatMoneda(n, m.moneda);

  const cifras = [
    { t: "Puesto en " + nombrePais(pais), v: `${puesto}º`, s: `de ${m.competidores.length} productos` },
    { t: "Facturación/mes", v: dinero(c.facturacion), s: `${total ? (Math.round((c.facturacion / total) * 1000) / 10).toLocaleString("es-ES") : 0} % del mercado` },
    { t: "Ventas/mes", v: c.ventas !== null ? formatNumero(c.ventas) : "—", s: "unidades" },
    { t: "Precio", v: dinero(c.precio), s: c.bsr ? `BSR ${formatNumero(c.bsr)}` : "" },
    { t: "Valoración", v: c.valoracion ? `★ ${c.valoracion.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : "—", s: `${formatNumero(c.resenas)} reseñas en Amazon` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link href={volver} className="text-sm text-ink-400 hover:text-ink-100">
        ← {e.nombre} · Reseñas
      </Link>

      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <Pais codigo={pais} />
          <span>·</span>
          <span className="font-mono">{asin}</span>
          <span>·</span>
          <a href={enlaceAmazon(pais, asin)} target="_blank" rel="noreferrer" className="text-accent-300 hover:text-accent-400">
            Abrir en Amazon ↗
          </a>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{c.marca}</h1>
        <p className="text-sm text-ink-300">{c.titulo}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cifras.map((x) => (
          <div key={x.t} className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
            <p className="text-[13px] font-medium text-ink-200">{x.t}</p>
            <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-100">{x.v}</p>
            <p className="mt-1 truncate text-xs text-ink-400">{x.s}</p>
          </div>
        ))}
      </div>

      {temas && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="De qué se quejan" subtitulo="Según el «Review Analysis» de Helium 10 de este producto">
            {temas.quejas.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {temas.quejas.map((t) => (
                  <FilaTema key={t.texto} t={t} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-400">Helium 10 no encontró quejas.</p>
            )}
          </Tarjeta>
          <Tarjeta titulo="Qué valoran" subtitulo="Lo que sus clientes destacan">
            <ul className="mt-3 flex flex-col gap-2">
              {temas.elogios.map((t) => (
                <FilaTema key={t.texto} t={t} />
              ))}
            </ul>
          </Tarjeta>
        </div>
      )}

      {resenas.length > 0 && (
        <Tarjeta titulo="Qué dicen en cada estrella" subtitulo="Las reseñas de cada nota, de 1 a 5 estrellas, por separado: de qué se quejan y qué les gusta, y cuántas lo dicen">
          <QuejasEstrellas estudioId={id} objetivo={{ pais, asin }} datos={porEstrellas} total={resenas.length} />
        </Tarjeta>
      )}

      <Tarjeta
        titulo={resenas.length ? `Todas sus reseñas · ${formatNumero(resenas.length)}` : "Todas sus reseñas"}
        subtitulo="En su idioma original, tal como salen en Amazon. Toca una barra de estrellas para ver solo esas."
      >
        {resenas.length ? (
          <div className="mt-3">
            <ResenasCompetidor resenas={resenas} />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-white/[0.12] px-4 py-6 text-center text-sm text-ink-400">
            Aún no hay reseñas de este producto. Descárgalas con el <strong className="text-ink-200">Review Downloader</strong> de Helium 10 (extensión de Chrome, en su página de Amazon) y sube el CSV en
            «Datos», como reseñas de {nombrePais(pais)}.
          </p>
        )}
      </Tarjeta>
    </div>
  );
}
