"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CodigoPais, KitCompetidor, KitsCompetidores } from "@/lib/datos/h10Tipos";
import { formatMoneda, formatNumero } from "@/lib/format";
import { enlaceAmazon } from "@/lib/datos/h10Enlaces";
import { Pais } from "./comun";

/** Amazon serves any photo smaller with a size before the extension: 300 px is plenty for a card. */
const pequena = (url: string) => url.replace(/^(https:\/\/m\.media-amazon\.com\/images\/I\/[^.]+)(\.[a-z]+)$/i, "$1._SL300_$2");

/** «2 × Portería · 120×90 cm» as a chip. */
function Elemento({ e }: { e: KitCompetidor["elementos"][number] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-ink-950/50 px-2 py-0.5 text-xs text-ink-100">
      {e.cantidad !== null && <strong className="text-accent-300">{e.cantidad}×</strong>}
      {e.nombre}
      {e.detalle && <span className="text-ink-400">· {e.detalle}</span>}
    </span>
  );
}

/** One competitor: its place, photo, brand, title, what its kit includes and its figures. */
function Tarjeta({ k, pais, puesto, conBandera }: { k: KitCompetidor; pais: CodigoPais; puesto: number; conBandera: boolean }) {
  const cambio = k.precio !== null && k.precioXray !== null && Math.abs(k.precio - k.precioXray) >= 0.5;
  return (
    <li className={`flex gap-3 rounded-xl border bg-ink-900/80 p-3 shadow-soft ${k.otroProducto ? "border-warning/30 opacity-70" : "border-white/[0.08]"}`}>
      <div className="flex shrink-0 flex-col items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">{puesto}</span>
        <a href={enlaceAmazon(pais, k.asin)} target="_blank" rel="noopener noreferrer" className="flex size-24 items-center justify-center overflow-hidden rounded-lg bg-white p-1" title="Ver en Amazon">
          {k.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pequena(k.imagen)} alt="" loading="lazy" className="size-full object-contain" />
          ) : (
            <span className="text-[10px] text-ink-600">Sin foto</span>
          )}
        </a>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
          {conBandera && <Pais codigo={pais} corto />}
          <span className="font-semibold text-ink-100">{k.marca}</span>
          <a href={enlaceAmazon(pais, k.asin)} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-accent-300 hover:underline">
            {k.asin} ↗
          </a>
          {k.otroProducto && <span className="rounded bg-warning/15 px-1.5 py-px text-[11px] font-medium text-warning">Otro producto: {k.otroProducto}</span>}
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-ink-200">{k.titulo}</p>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Qué incluye</span>
          {k.elementos.length ? (
            <div className="flex flex-wrap gap-1.5">
              {k.elementos.map((e, i) => (
                <Elemento key={i} e={e} />
              ))}
            </div>
          ) : (
            <span className="text-xs text-ink-500">La ficha no detalla el contenido.</span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-1 border-t border-white/[0.05] pt-2">
          <span>
            <span className="tabular text-lg font-bold text-ink-100">{k.precio !== null ? formatMoneda(k.precio, k.moneda) : "Sin oferta"}</span>
            {cambio && <span className="ml-1.5 text-[11px] text-ink-500">({formatMoneda(k.precioXray!, k.moneda)} en el Xray)</span>}
            {k.precio === null && k.precioXray !== null && <span className="ml-1.5 text-[11px] text-ink-500">({formatMoneda(k.precioXray, k.moneda)} en el Xray)</span>}
          </span>
          <span className="text-xs text-ink-400">
            <strong className="tabular text-sm text-success">{k.ventasMes !== null ? formatNumero(k.ventasMes) : "—"}</strong> uds/mes
          </span>
          <span className="text-xs text-ink-400">
            <strong className="tabular text-ink-200">{formatMoneda(k.facturacion, k.moneda)}</strong> al mes
          </span>
          <span className="text-xs text-ink-400">
            {k.valoracion !== null && <strong className="text-accent-300">★ {k.valoracion.toLocaleString("es-ES")}</strong>} {formatNumero(k.resenas)} reseñas
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * «Kits competidores»: the best sellers of each country, from the one that sells most to the one that sells least,
 * with their photo, price, sales and what their kit includes. «Todos» puts every country together (each in its
 * currency); a country shows only its own.
 */
export function PestanaKits({ estudioId, kits, paises }: { estudioId: string; kits: KitsCompetidores | null; paises: CodigoPais[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<CodigoPais | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conKits = paises.filter((p) => kits?.porPais[p]?.length);
  const pais = filtro && conKits.includes(filtro) ? filtro : null;
  const lista = (pais ? [pais] : conKits)
    .flatMap((p) => (kits?.porPais[p] ?? []).map((k) => ({ k, pais: p })))
    .sort((a, b) => (b.k.ventasMes ?? -1) - (a.k.ventasMes ?? -1));

  const analizar = async () => {
    if (!confirm(`Se leerán de Amazon los 20 productos que más venden de cada país (${paises.length}) y la IA dirá qué incluye cada kit. Tarda uno o dos minutos y cuesta unos céntimos. ¿Seguir?`)) return;
    setError(null);
    setAnalizando(true);
    try {
      const r = await fetch(`/api/h10/estudios/${estudioId}/kits`, { method: "POST" });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(b.error ?? `Error ${r.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar");
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Kits competidores</h2>
          <p className="mt-0.5 text-xs text-ink-400">
            Los 20 que más venden de cada país, de más a menos ventas, con lo que incluye su kit según su ficha de Amazon.
            {kits && ` · Analizado el ${new Date(kits.generadoEn).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`}
          </p>
        </div>
        <button
          onClick={() => void analizar()}
          disabled={analizando || !paises.length}
          className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-ink-950 hover:bg-accent-400 disabled:opacity-60"
        >
          {analizando ? "Analizando… (uno o dos minutos)" : kits ? "Volver a analizar" : "Analizar kits"}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {!kits || !conKits.length ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-ink-400">
          <p className="max-w-md">
            {paises.length
              ? "Pulsa «Analizar kits»: se leerá la ficha de los que más venden en cada país y verás aquí qué incluye cada kit y a qué precio."
              : "Sube primero el Xray de algún país en «Datos»."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[null, ...conKits].map((p) => (
              <button
                key={p ?? "todos"}
                onClick={() => setFiltro(p)}
                aria-pressed={p === pais}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${p === pais ? "border-accent-500/60 bg-accent-500/10 text-ink-100" : "border-white/[0.08] text-ink-400 hover:text-ink-100"}`}
              >
                {p ? <Pais codigo={p} /> : "Todos"}
                <span className="text-ink-500">{p ? kits.porPais[p]!.length : conKits.reduce((s, x) => s + kits.porPais[x]!.length, 0)}</span>
              </button>
            ))}
          </div>
          {!pais && <p className="text-xs text-ink-500">Todos los países juntos, ordenados por ventas al mes. Cada precio va en la moneda de su país.</p>}
          <ol className="flex flex-col gap-2">
            {lista.map(({ k, pais: p }, i) => (
              <Tarjeta key={`${p}|${k.asin}`} k={k} pais={p} puesto={i + 1} conBandera={!pais} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
