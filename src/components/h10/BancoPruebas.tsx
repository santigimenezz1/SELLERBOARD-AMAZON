"use client";

import { useEffect, useState } from "react";
import type { NivelBanco, PruebaBanco, ResultadoTrampa } from "@/lib/datos/bancoTipos";
import { EQUIPO } from "@/lib/datos/h10Equipo";
import { AvatarAgente } from "./AvatarAgente";

const URL_BANCO = "/api/h10/banco";
const persona = (quien: string) => EQUIPO.find((m) => m.quien === quien);
const fecha = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** «4/6», of the planted errors each one should catch (null: not tested). */
function marcador(p: PruebaBanco, caza: ResultadoTrampa["caza"]) {
  const suyas = p.trampas.filter((t) => t.caza === caza && t.cazado !== null);
  return suyas.length ? { cazadas: suyas.filter((t) => t.cazado).length, total: suyas.length } : null;
}

function Marcador({ quien, m, extra }: { quien: "Verificador" | "Revisor"; m: { cazadas: number; total: number } | null; extra: string }) {
  const p = persona(quien)!;
  const todo = m && m.cazadas === m.total;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-ink-950/40 p-3">
      <AvatarAgente avatar={p.avatar} tamano={44} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-50">{p.persona}</span>
        <span className={`tabular block text-2xl font-extrabold ${!m ? "text-ink-500" : todo ? "text-success" : m.cazadas / m.total >= 0.7 ? "text-warning" : "text-danger"}`}>
          {m ? `${m.cazadas}/${m.total}` : "Sin probar"}
        </span>
        <span className="block text-xs text-ink-400">{extra}</span>
      </span>
    </div>
  );
}

/**
 * «Banco de pruebas»: a report with errors planted on purpose, each one imitating a team member's mistake, to see
 * whether Víctor (free) and Álex (AI, costs) catch them. Shows the last run in detail and the earlier ones, to see
 * whether each improvement makes them better.
 */
export function BancoPruebas({ estudioId }: { estudioId: string }) {
  const [historial, setHistorial] = useState<PruebaBanco[] | null>(null);
  const [probando, setProbando] = useState<null | "verificador" | "revisor">(null);
  const [confirmar, setConfirmar] = useState<NivelBanco | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(URL_BANCO)
      .then((r) => r.json())
      .then((j) => setHistorial(j.historial ?? []))
      .catch(() => setHistorial([]));
  }, []);

  async function probar(conRevisor: boolean, nivel: NivelBanco = "normal") {
    setConfirmar(null);
    setError(null);
    setProbando(conRevisor ? "revisor" : "verificador");
    try {
      const r = await fetch(URL_BANCO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estudioId, conRevisor, nivel }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo hacer la prueba");
      setHistorial(j.historial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer la prueba");
    } finally {
      setProbando(null);
    }
  }

  const ultima = historial?.[0] ?? null;
  return (
    <section className="rounded-xl border border-white/[0.06] bg-ink-900/80 p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-base font-semibold text-ink-100">Banco de pruebas</h3>
          <p className="text-xs text-ink-400">
            Un informe con errores metidos a propósito, como los que podría cometer cada experto. Comprueba si Víctor y Álex los cazan. Usa los datos de este estudio y no cambia tu informe. En el nivel difícil, los especialistas cometen los mismos errores: Álex solo los caza si sabe más que ellos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => probar(false)}
            disabled={!!probando}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-ink-100 hover:bg-white/[0.06] disabled:opacity-50"
          >
            {probando === "verificador" ? "Probando…" : "Probar a Víctor · gratis"}
          </button>
          {probando === "revisor" ? (
            <span className="rounded-lg bg-accent-500/20 px-3 py-2 text-sm font-semibold text-accent-300">Álex está revisando… (1–3 min)</span>
          ) : (
            <>
              <button onClick={() => setConfirmar("normal")} disabled={!!probando} className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-ink-950 hover:bg-accent-400 disabled:opacity-50">
                Probar a Álex · normal
              </button>
              <button
                onClick={() => setConfirmar("dificil")}
                disabled={!!probando}
                title="Los especialistas cometen los mismos errores que el informe: Álex solo los caza si sabe más que ellos"
                className="rounded-lg bg-danger/80 px-3 py-2 text-sm font-semibold text-white hover:bg-danger disabled:opacity-50"
              >
                Probar a Álex · difícil
              </button>
            </>
          )}
        </div>
      </div>

      {confirmar && (
        <div role="alertdialog" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent-500/40 bg-accent-500/[0.08] px-4 py-3 text-sm">
          <span className="text-ink-100">
            Nivel <strong>{confirmar === "dificil" ? "difícil" : "normal"}</strong>. Álex es una IA de verdad (Claude Opus): esta prueba <strong>gasta créditos de Anthropic</strong>, unos 0,15–0,50 $. ¿La lanzo?
          </span>
          <span className="ml-auto flex gap-2">
            <button onClick={() => probar(true, confirmar)} className="rounded-md bg-accent-500 px-3 py-1.5 font-semibold text-ink-950 hover:bg-accent-400">
              Sí, lanzar
            </button>
            <button onClick={() => setConfirmar(null)} className="rounded-md border border-white/10 px-3 py-1.5 text-ink-200 hover:bg-white/[0.06]">
              Cancelar
            </button>
          </span>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {historial === null ? (
        <p className="mt-4 text-sm text-ink-500">Cargando…</p>
      ) : !ultima ? (
        <p className="mt-4 rounded-lg border border-dashed border-white/[0.1] px-4 py-8 text-center text-sm text-ink-500">Todavía no hay pruebas. Empieza por Víctor: es gratis.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-xs text-ink-500">
            Última prueba: {fecha(ultima.fecha)} · estudio «{ultima.estudio}»{ultima.conRevisor ? ` · nivel ${ultima.nivel === "dificil" ? "difícil" : "normal"}` : ""}{ultima.dolares > 0 ? ` · ${ultima.dolares.toLocaleString("es-ES", { maximumFractionDigits: 3 })} $` : " · sin coste"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Marcador quien="Verificador" m={marcador(ultima, "Verificador")} extra={ultima.falsasAlarmas.length ? `${ultima.falsasAlarmas.length} falsas alarmas en el informe limpio` : "Sin falsas alarmas en el informe limpio"} />
            <Marcador
              quien="Revisor"
              m={marcador(ultima, "Revisor")}
              extra={ultima.conRevisor ? `Nivel ${ultima.nivel === "dificil" ? "difícil" : "normal"} · puso al informe un ${ultima.notaRevisor?.toLocaleString("es-ES") ?? "—"}/10 · ${ultima.otrosRevisor.length} problemas más` : "Pulsa «Probar a Álex»"}
            />
          </div>

          <ul className="flex flex-col gap-2">
            {ultima.trampas.map((t) => {
              const p = persona(t.experto);
              return (
                <li key={t.id} className="grid grid-cols-[32px_1fr] gap-3 rounded-lg border border-white/[0.06] bg-ink-950/40 px-3 py-2.5 sm:grid-cols-[32px_1fr_auto]">
                  {p ? <AvatarAgente avatar={p.avatar} tamano={32} /> : <span />}
                  <span className="min-w-0 text-sm">
                    <span className="block text-ink-100">
                      <span className="font-semibold">{p?.persona ?? t.experto}:</span> {t.error}
                    </span>
                    <span className="block text-xs text-ink-500">Lo debe cazar {persona(t.caza)?.persona}</span>
                    {t.dijo && <span className="mt-1 block text-xs text-ink-300">«{t.dijo.length > 220 ? `${t.dijo.slice(0, 220)}…` : t.dijo}»</span>}
                  </span>
                  <span
                    className={`col-start-2 w-fit self-start rounded-full px-2.5 py-0.5 text-xs font-bold sm:col-start-3 ${t.cazado === null ? "bg-white/[0.06] text-ink-400" : t.cazado ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
                  >
                    {t.cazado === null ? "Sin probar" : t.cazado ? "✓ Cazado" : "✕ Se le escapó"}
                  </span>
                </li>
              );
            })}
          </ul>

          {ultima.falsasAlarmas.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-warning">Falsas alarmas de Víctor en el informe limpio ({ultima.falsasAlarmas.length})</summary>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-ink-300">
                {ultima.falsasAlarmas.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          )}
          {ultima.consultasRevisor && ultima.consultasRevisor.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-ink-200">Lo que Álex comprobó en los datos antes de opinar ({ultima.consultasRevisor.length})</summary>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-ink-300">
                {ultima.consultasRevisor.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </details>
          )}
          {ultima.otrosRevisor.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-ink-200">Otros problemas que señaló Álex ({ultima.otrosRevisor.length}): pueden ser acertados o inventados</summary>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-ink-300">
                {ultima.otrosRevisor.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          )}

          {historial.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-ink-300">Pruebas anteriores</p>
              <table className="tabular mt-1.5 w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-500">
                    <th className="py-1 font-medium">Fecha</th>
                    <th className="py-1 font-medium">Víctor</th>
                    <th className="py-1 font-medium">Álex</th>
                    <th className="py-1 font-medium">Nivel</th>
                    <th className="py-1 text-right font-medium">Coste</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.slice(1).map((p) => {
                    const v = marcador(p, "Verificador");
                    const a = marcador(p, "Revisor");
                    return (
                      <tr key={p.fecha} className="border-t border-white/[0.05] text-ink-300">
                        <td className="py-1.5">{fecha(p.fecha)}</td>
                        <td className="py-1.5">{v ? `${v.cazadas}/${v.total}` : "—"}</td>
                        <td className="py-1.5">{a ? `${a.cazadas}/${a.total}` : "—"}</td>
                        <td className="py-1.5">{p.conRevisor ? (p.nivel === "dificil" ? "Difícil" : "Normal") : "—"}</td>
                        <td className="py-1.5 text-right">{p.dolares ? `${p.dolares.toLocaleString("es-ES", { maximumFractionDigits: 3 })} $` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
