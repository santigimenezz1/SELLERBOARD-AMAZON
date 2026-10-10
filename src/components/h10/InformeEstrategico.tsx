"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BloqueInforme, InformeEstrategico as Informe, PruebaInforme } from "@/lib/datos/h10Tipos";
import type { EstadoInforme, ModoAgente } from "@/lib/ia/agenteInforme";

/** «**bold**» inside a text, everything else as is. */
function Rico({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/\*\*(.+?)\*\*/g).map((t, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-ink-50">
            {t}
          </strong>
        ) : (
          <Fragment key={i}>{t}</Fragment>
        ),
      )}
    </>
  );
}

/** Where a claim comes from: a figure of the study, a web source or the agent's guess. */
function Prueba({ p }: { p: PruebaInforme }) {
  const estilo = {
    dato: { clase: "border-serie-ventas/30 bg-serie-ventas/10 text-serie-ventas", icono: "▤", etiqueta: "Dato del estudio" },
    web: { clase: "border-success/30 bg-success/10 text-success", icono: "↗", etiqueta: `Fuente ${p.fuente ? `[${p.fuente}]` : "web"}` },
    supuesto: { clase: "border-warning/30 bg-warning/10 text-warning", icono: "!", etiqueta: "Suposición" },
  }[p.tipo];
  const contenido = (
    <>
      <span aria-hidden className="font-bold">
        {estilo.icono}
      </span>
      <span className="font-semibold">{estilo.etiqueta}</span>
      <span className="text-ink-300">· {p.texto}</span>
    </>
  );
  return p.tipo === "web" && p.fuente ? (
    <a href={`#fuente-${p.fuente}`} className={`mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] hover:opacity-80 ${estilo.clase}`}>
      {contenido}
    </a>
  ) : (
    <span className={`mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${estilo.clase}`}>{contenido}</span>
  );
}

const ESTADO_PIEZA = {
  consumible: { caja: "border-danger/60 bg-danger/10", fila: "border-danger/40 bg-danger/[0.06]", texto: "text-danger", leyenda: "Consumible que se estropea" },
  anadido: { caja: "border-accent-500/70 bg-accent-500/10", fila: "border-accent-500/50 bg-accent-500/[0.06]", texto: "text-accent-300", leyenda: "Lo que añades tú" },
  incluido: { caja: "border-success/60 bg-success/10", fila: "border-success/40 bg-success/[0.06]", texto: "text-success", leyenda: "Ya viene en cualquiera" },
  estructura: { caja: "border-white/25 bg-white/[0.04]", fila: "border-white/[0.1] bg-white/[0.02]", texto: "text-ink-300", leyenda: "Estructura" },
};

const VEREDICTO_PALABRA = {
  atacar: { texto: "✓ Atacar", chip: "bg-success/15 text-success", fila: "bg-success/[0.03]" },
  probar: { texto: "◐ Probar", chip: "bg-warning/15 text-warning", fila: "" },
  evitar: { texto: "✕ Evitar al inicio", chip: "bg-danger/15 text-danger", fila: "" },
};

const ESTADO_COLOR ={ bien: "bg-success/15 text-success", regular: "bg-warning/15 text-warning", mal: "bg-danger/15 text-danger" };

function Bloque({ b }: { b: BloqueInforme }) {
  switch (b.tipo) {
    case "texto":
      return (
        <p className="text-[15px] leading-relaxed text-ink-200">
          <Rico texto={b.texto} />
        </p>
      );
    case "cifras":
      return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {b.items.map((x) => (
            <div key={x.etiqueta} className="border-t-[3px] border-accent-500 bg-white/[0.03] px-4 py-4">
              <p className="tabular text-3xl font-extrabold tracking-tight text-ink-50">{x.valor}</p>
              <p className="mt-1 text-[11px] font-semibold tracking-[0.15em] text-ink-400 uppercase">{x.etiqueta}</p>
            </div>
          ))}
        </div>
      );
    case "destacado":
      return (
        <div className="border-l-4 border-accent-500 bg-accent-500/[0.07] px-5 py-4">
          <p className="text-[11px] font-bold tracking-[0.2em] text-accent-400 uppercase">{b.etiqueta}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-200">
            <Rico texto={b.texto} />
          </p>
        </div>
      );
    case "cita":
      return (
        <div className="border-l-4 border-accent-500 py-1 pl-5">
          <p className="text-xl leading-snug font-bold text-ink-50">
            <Rico texto={b.texto} />
          </p>
          {b.nota && <p className="mt-2 text-sm text-ink-400">{b.nota}</p>}
        </div>
      );
    case "lista":
      return (
        <ul className="flex flex-col gap-4 border-l-2 border-accent-500/40 pl-5">
          {b.items.map((x) => (
            <li key={x.titulo} className="flex gap-3">
              <span aria-hidden className="mt-2 size-2 shrink-0 bg-accent-500" />
              <span className="min-w-0">
                <span className="text-[15px] leading-relaxed text-ink-200">
                  <strong className="font-semibold text-ink-50">{x.titulo}</strong> <Rico texto={x.texto} />
                </span>
                {x.prueba && (
                  <span className="block">
                    <Prueba p={x.prueba} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      );
    case "despiece":
      return (
        <div className="flex flex-col gap-2">
          {b.piezas.map((p) => {
            const e = ESTADO_PIEZA[p.estado];
            return (
              <div key={p.nombre} className="grid grid-cols-[72px_1fr] items-center gap-4 sm:grid-cols-[120px_1fr]">
                <span className={`mx-auto h-6 w-full rounded-md border-2 ${e.caja}`} />
                <div className={`rounded-lg border px-4 py-2.5 ${e.fila}`}>
                  <p className="font-semibold text-ink-50">{p.nombre}</p>
                  <p className={`text-sm ${e.texto}`}>{p.detalle}</p>
                </div>
              </div>
            );
          })}
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-400">
            {Object.values(ESTADO_PIEZA).map((e) => (
              <span key={e.leyenda} className="inline-flex items-center gap-1.5">
                <span className={`size-3 rounded-sm border-2 ${e.caja}`} />
                {e.leyenda}
              </span>
            ))}
          </div>
        </div>
      );
    case "colores":
      return (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {b.items.map((c) => (
              <div key={c.hex} className="flex flex-col gap-1.5">
                <span className="aspect-[4/3] w-full rounded-xl border border-white/10" style={{ background: c.hex }} />
                <span className="font-semibold text-ink-50">{c.nombre}</span>
                <span className="font-mono text-xs text-ink-400">{c.hex}</span>
                <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_COLOR[c.estado]}`}>{c.nota}</span>
              </div>
            ))}
          </div>
          {b.texto && <p className="text-[15px] leading-relaxed text-ink-200">{b.texto}</p>}
        </div>
      );
    case "palabras": {
      const simbolo = b.moneda === "GBP" ? "£" : "€";
      return (
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="tabular w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.1] text-left text-[11px] tracking-[0.12em] text-ink-400 uppercase">
                <th className="py-2 pr-3 font-semibold">Palabra clave</th>
                <th className="px-3 py-2 text-right font-semibold">Búsquedas/mes</th>
                <th className="px-3 py-2 text-right font-semibold">Puja</th>
                <th className="px-3 py-2 text-right font-semibold" title="Títulos de la página 1 que la llevan">Títulos</th>
                <th className="px-3 py-2 text-right font-semibold" title="Ventas en 8 días para entrar en la página 1 (CPR de Helium 10)">Ventas para entrar</th>
                <th className="px-3 py-2 font-semibold">Recomendación</th>
                <th className="py-2 pl-3 font-semibold">Por qué</th>
              </tr>
            </thead>
            <tbody>
              {b.items.map((p) => {
                const v = VEREDICTO_PALABRA[p.veredicto];
                return (
                  <tr key={p.texto} className={`border-b border-white/[0.05] align-top ${v.fila}`}>
                    <td className="py-2.5 pr-3 font-semibold text-ink-50">{p.texto}</td>
                    <td className="px-3 py-2.5 text-right text-ink-100">{p.busquedas.toLocaleString("es-ES")}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-ink-300">{p.puja !== null ? `${p.puja.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${simbolo}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-ink-300">{p.densidad}</td>
                    <td className="px-3 py-2.5 text-right text-ink-300">{p.cpr}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${v.chip}`}>{v.texto}</span>
                      {p.concordancia && <span className="mt-1 block text-[11px] text-ink-400">concordancia {p.concordancia}</span>}
                    </td>
                    <td className="min-w-[300px] py-2.5 pl-3 text-[13px] leading-snug text-ink-300">{p.motivo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    case "etiquetas":
      return (
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] text-ink-300 uppercase">{b.titulo}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {b.items.map((t) => (
              <span key={t} className={`rounded-md border px-2.5 py-1 text-sm ${b.tono === "mal" ? "border-danger/30 bg-danger/10 text-danger" : "border-success/30 bg-success/10 text-success"}`}>
                {b.tono === "mal" ? "− " : "+ "}
                {t}
              </span>
            ))}
          </div>
          {b.prueba && <Prueba p={b.prueba} />}
        </div>
      );
    case "pasos":
      return (
        <ol className="flex flex-col gap-4 border-l-2 border-accent-500/40 pl-5">
          {b.items.map((x, i) => (
            <li key={x.titulo} className="grid grid-cols-[36px_1fr] gap-2">
              <span className="tabular text-lg font-extrabold text-accent-400">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[15px] leading-relaxed text-ink-200">
                <strong className="font-semibold text-ink-50">{x.titulo}</strong> <Rico texto={x.texto} />
              </span>
            </li>
          ))}
        </ol>
      );
  }
}

const VEREDICTO = {
  lanzar: { texto: "✓ Lanzar", clase: "bg-success/15 text-success border-success/40" },
  validar: { texto: "◐ Validar primero", clase: "bg-warning/15 text-warning border-warning/40" },
  descartar: { texto: "✕ Descartar", clase: "bg-danger/15 text-danger border-danger/40" },
};

/** Every how often the page asks the server how the agent is getting on. */
const CADA_MS = 1500;

/**
 * «Informe estratégico»: the research agent's report on the niche (what to make, how to sell it, what to ask the
 * factory), generated only when the owner asks for it, after confirming the time and cost. While the agent works, its
 * real steps show as they happen.
 */
export function InformeEstrategico({ estudioId, informe }: { estudioId: string; informe: Informe | null }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [estado, setEstado] = useState<EstadoInforme | null>(null);
  const [modo, setModo] = useState<ModoAgente>("ensayo");
  const [error, setError] = useState<string | null>(null);
  const url = `/api/h10/estudios/${estudioId}/informe`;

  // Asks how the agent is getting on until it finishes; then shows the report (or the error).
  const seguir = useCallback(async () => {
    for (;;) {
      await new Promise((ok) => setTimeout(ok, CADA_MS));
      const j = await fetch(url).then((r) => r.json()).catch(() => null);
      const e: EstadoInforme | null = j?.estado ?? null;
      if (!e) return setEstado(null);
      setEstado(e);
      if (e.terminado) {
        if (e.error) setError(e.error);
        else router.refresh();
        // The last steps stay a moment on screen before the report replaces them.
        await new Promise((ok) => setTimeout(ok, 1200));
        return setEstado(null);
      }
    }
  }, [url, router]);

  // On opening: the mode the agent would run in, and an agent already working on this study (e.g. after a reload).
  useEffect(() => {
    let vivo = true;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j?.modo) setModo(j.modo);
        if (j?.estado && !j.estado.terminado) {
          setEstado(j.estado);
          void seguir();
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [url, seguir]);

  const generar = async () => {
    setConfirmar(false);
    setError(null);
    try {
      const r = await fetch(url, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "No se pudo empezar el informe");
      setEstado(j.estado);
      await seguir();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo empezar el informe");
      setEstado(null);
    }
  };

  const dialogo = confirmar && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmar(false)}>
      <div role="dialog" aria-modal className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-ink-50">¿Generar el informe del nicho?</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          Un equipo de 4 especialistas (mercado, palabras clave y PPC, producto, marketing) estudia todos los datos del producto e investiga en internet, y un director escribe el informe. Tarda
          unos <strong className="text-ink-100">15–30 minutos</strong> y cuesta unos <strong className="text-ink-100">3–8 $</strong> de IA. Hazlo solo con los productos que de verdad te interesan.
        </p>
        {modo === "ensayo" ? (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <strong>Modo ensayo:</strong> el agente recorre los datos reales del estudio con sus herramientas, pero sin IA: entrega un informe de ejemplo y no gasta nada.
          </p>
        ) : (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <strong>Modo real:</strong> usa la IA y gasta créditos de Anthropic.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setConfirmar(false)} className="rounded-lg px-3.5 py-2 text-sm text-ink-300 hover:bg-white/[0.06]">
            Cancelar
          </button>
          <button onClick={generar} className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-semibold text-ink-950 hover:bg-accent-400">
            Generar informe
          </button>
        </div>
      </div>
    </div>
  );

  if (estado)
    return (
      <section className="rounded-2xl border border-accent-500/30 bg-ink-900/80 p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold tracking-[0.2em] text-accent-400 uppercase">
            {estado.terminado ? "El equipo ha terminado" : estado.fase === "director" ? "El director está escribiendo el informe" : "Los especialistas están trabajando"}
          </p>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estado.modo === "ensayo" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger"}`}>
            {estado.modo === "ensayo" ? "Ensayo · sin coste" : `${estado.gasto.modelo} · ${estado.gasto.dolares.toLocaleString("es-ES", { maximumFractionDigits: 3 })} $ hasta ahora`}
          </span>
        </div>
        <ol className="mt-4 flex flex-col gap-2">
          {estado.pasos.map((p, i) => {
            const ultimo = i === estado.pasos.length - 1 && !estado.terminado;
            return (
              <li key={i} className={`flex items-start gap-3 text-sm ${ultimo ? "font-medium text-ink-50" : "text-ink-300"}`}>
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    ultimo ? "animate-pulse bg-accent-500/30 text-accent-300" : p.tipo === "aviso" ? "bg-warning/15 text-warning" : "bg-success/20 text-success"
                  }`}
                >
                  {ultimo ? "…" : p.tipo === "aviso" ? "!" : p.tipo === "web" ? "↗" : "✓"}
                </span>
                <span className="min-w-0">
                  {p.quien && <span className="mr-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-ink-300">{p.quien}</span>}
                  {p.texto}
                </span>
                <span className="tabular ml-auto shrink-0 text-[11px] text-ink-500">{new Date(p.hora).toLocaleTimeString("es-ES", { minute: "2-digit", second: "2-digit" })}</span>
              </li>
            );
          })}
          {!estado.terminado && estado.pasos.length === 0 && <li className="text-sm text-ink-400">Arrancando…</li>}
        </ol>
      </section>
    );

  if (!informe)
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-ink-900 to-ink-950 p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold tracking-[0.2em] text-accent-400 uppercase">Informe estratégico · agente de IA</p>
          <h2 className="mt-1 text-xl font-bold text-ink-50">¿Este producto merece la pena? Pide el informe completo</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
            Validación del nicho, cómo diferenciarte, el pack, los riesgos, el despiece, materiales y normativa, colores y lo que debes exigir a la fábrica. Cada punto con su dato o su fuente.
          </p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
        <button onClick={() => setConfirmar(true)} className="shrink-0 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-accent-400">
          Generar informe
        </button>
        {dialogo}
      </section>
    );

  const v = VEREDICTO[informe.veredicto];
  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900/80 shadow-soft">
      {/* Cover */}
      <header className="relative overflow-hidden border-b border-white/[0.06] bg-gradient-to-br from-ink-950 via-ink-950 to-accent-500/[0.12] px-6 py-8 sm:px-10 sm:py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="relative">
          {informe.simulado && <p className="mb-4 w-fit rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">Simulación · el texto es de ejemplo, las cifras son del estudio</p>}
          <p className="text-[11px] font-bold tracking-[0.25em] text-accent-400 uppercase">{informe.antetitulo}</p>
          <h2 className="mt-3 max-w-3xl text-3xl leading-tight font-extrabold tracking-tight text-ink-50 uppercase sm:text-4xl">
            {informe.titular} <span className="text-accent-400">{informe.titularDestacado}</span>
          </h2>
          <span aria-hidden className="mt-5 block h-1 w-20 bg-accent-500" />
          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-ink-200">{informe.resumen}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 font-semibold ${v.clase}`}>{v.texto}</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-ink-300">{new Date(informe.generadoEn).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-ink-300">{informe.fuentes.length} fuentes</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-ink-300">
              ≈ {informe.coste.minutos} min · {informe.coste.dolares.toLocaleString("es-ES")} $
            </span>
            <span className="ml-auto flex gap-1.5">
              <button onClick={() => window.print()} className="rounded-lg border border-white/10 px-3 py-1.5 text-ink-200 hover:bg-white/[0.06]">
                Imprimir / PDF
              </button>
              <button onClick={() => setConfirmar(true)} className="rounded-lg border border-white/10 px-3 py-1.5 text-ink-200 hover:bg-white/[0.06]">
                Regenerar
              </button>
            </span>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </header>

      {/* Contents */}
      <nav aria-label="Índice del informe" className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-6 py-3 sm:px-10">
        {informe.secciones.map((s, i) => (
          <a key={s.id} href={`#informe-${s.id}`} className="rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-white/[0.05] hover:text-ink-100">
            <span className="font-semibold text-accent-400">{String(i + 1).padStart(2, "0")}</span> {s.etiqueta}
          </a>
        ))}
      </nav>

      <div className="flex flex-col divide-y divide-white/[0.06]">
        {informe.secciones.map((s, i) => (
          <section key={s.id} id={`informe-${s.id}`} className="scroll-mt-20 px-6 py-9 sm:px-10">
            <p className="text-xs font-bold tracking-[0.25em] text-accent-400 uppercase">
              {String(i + 1).padStart(2, "0")} — {s.etiqueta}
            </p>
            <h3 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-ink-50 uppercase sm:text-[28px]">{s.titulo}</h3>
            <span aria-hidden className="mt-4 block h-1 w-16 bg-accent-500" />
            <div className="mt-6 flex max-w-4xl flex-col gap-5">
              {s.bloques.map((b, j) => (
                <Bloque key={j} b={b} />
              ))}
            </div>
          </section>
        ))}

        {informe.fuentes.length > 0 && (
          <section className="px-6 py-8 sm:px-10">
            <p className="text-xs font-bold tracking-[0.25em] text-accent-400 uppercase">Fuentes</p>
            <ol className="mt-3 flex flex-col gap-1.5 text-sm">
              {informe.fuentes.map((f) => (
                <li key={f.n} id={`fuente-${f.n}`} className="scroll-mt-20 text-ink-300">
                  <span className="tabular mr-2 text-ink-500">[{f.n}]</span>
                  <a href={f.url} target="_blank" rel="noreferrer" className="hover:text-accent-300 hover:underline">
                    {f.titulo} ↗
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {dialogo}
    </article>
  );
}
