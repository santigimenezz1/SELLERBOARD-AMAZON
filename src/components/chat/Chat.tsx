"use client";

import { useEffect, useRef, useState } from "react";
import type { EventoChat } from "@/lib/ia/chat";
import { Markdown } from "./Markdown";
import { Spinner } from "@/components/Spinner";
import { callar, desbloquearVoz, dictadoDisponible, escuchar, esIOS, hablar, prepararVoces, textoParaVoz, vozDisponible } from "./voz";

/** Where this browser remembers whether answers are read aloud. */
const CLAVE_VOZ = "chat.voz";

type Consulta = { etiqueta: string; detalle: string };
/** `voz`: answer to a question asked by voice, heard rather than read (its text stays hidden unless `verTexto`). */
type Mensaje = { rol: "usuario" | "asistente"; texto: string; consultas: Consulta[]; error?: string; voz?: boolean; verTexto?: boolean };

const SUGERENCIAS = [
  "¿Cuántas ventas tuvimos el mes pasado?",
  "¿Cuántas unidades se vendieron de cada producto el mes pasado?",
  "¿En qué país se vendieron más unidades este mes?",
  "En Reino Unido, ¿qué listing funcionó mejor el mes pasado?",
  "¿A qué precio se vendieron más unidades el mes pasado?",
];

/** «Pregunta a tu app»: floating button on every page that opens a chat about the shop's data. */
export function Chat() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  // The conversation as the API needs it back (thinking and tool blocks included): opaque to this component.
  const historial = useRef<unknown[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);

  // Voice: what this browser supports (known only after mounting), the «read aloud» switch, and what's going on.
  const [soporte, setSoporte] = useState({ dictado: false, voz: false, ios: false });
  const [vozActiva, setVozActiva] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [hablando, setHablando] = useState(false);
  /** Index of the message being read aloud, for its voice bubble. */
  const [leyendo, setLeyendo] = useState<number | null>(null);
  const [avisoVoz, setAvisoVoz] = useState<string | null>(null);
  const detenerDictado = useRef<(() => void) | null>(null);
  // iPhone: the 🎤 opens the keyboard to dictate with it; the question then sent counts as asked by voice.
  const porTeclado = useRef(false);
  const [pista, setPista] = useState<string | null>(null);
  useEffect(() => {
    setSoporte({ dictado: dictadoDisponible(), voz: vozDisponible(), ios: esIOS() });
    prepararVoces();
    try {
      setVozActiva(localStorage.getItem(CLAVE_VOZ) === "1");
    } catch {}
  }, []);
  // Stopping speech by hand doesn't always fire the end event in every browser: the flag goes down here too.
  const pararVoz = () => {
    callar();
    setHablando(false);
    setLeyendo(null);
  };
  const cambiarVoz = () => {
    const activa = !vozActiva;
    setVozActiva(activa);
    if (!activa) pararVoz();
    try {
      localStorage.setItem(CLAVE_VOZ, activa ? "1" : "0");
    } catch {}
  };
  const pararTodo = () => {
    detenerDictado.current?.();
    pararVoz();
  };

  // Follow the answer as it's written.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes]);
  useEffect(() => {
    if (!abierto) return;
    entrada.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  /** Changes the answer being written (the last message). */
  const actualizar = (cambio: (m: Mensaje) => Mensaje) => setMensajes((ms) => [...ms.slice(0, -1), cambio(ms.at(-1)!)]);

  /** `porVoz`: asked by dictation, so the answer is read aloud even with the switch off. */
  const preguntar = async (pregunta: string, porVoz = false) => {
    pregunta = pregunta.trim();
    if (!pregunta || pensando) return;
    porVoz ||= porTeclado.current;
    porTeclado.current = false;
    pararVoz();
    // Still inside the tap that sends it: lets Safari on iPhone read the answer aloud when it arrives.
    if ((vozActiva || porVoz) && soporte.voz) desbloquearVoz();
    setTexto("");
    setAvisoVoz(null);
    setPista(null);
    setPensando(true);
    let completo = "";
    let fallo = false;
    // Index the answer will have, for its voice bubble.
    const indice = mensajes.length + 1;
    setMensajes((ms) => [...ms, { rol: "usuario", texto: pregunta, consultas: [] }, { rol: "asistente", texto: "", consultas: [], voz: porVoz }]);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pregunta, historial: historial.current, voz: porVoz }) });
      if (!r.ok || !r.body) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Error ${r.status}`);
      }
      const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += value;
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        for (const l of lineas) {
          if (!l.trim()) continue;
          const e = JSON.parse(l) as EventoChat;
          if (e.tipo === "texto") {
            completo += e.texto;
            actualizar((m) => ({ ...m, texto: m.texto + e.texto }));
          } else if (e.tipo === "consulta") actualizar((m) => ({ ...m, consultas: [...m.consultas, { etiqueta: e.etiqueta, detalle: e.detalle }] }));
          else if (e.tipo === "fin") historial.current = e.historial;
          else if (e.tipo === "error") {
            fallo = true;
            actualizar((m) => ({ ...m, error: e.mensaje }));
          }
        }
      }
    } catch (e) {
      fallo = true;
      actualizar((m) => ({ ...m, error: e instanceof Error ? e.message : "No se pudo responder" }));
    } finally {
      setPensando(false);
    }
    if (!fallo && completo && (vozActiva || porVoz)) {
      if (!soporte.voz) return actualizar((m) => ({ ...m, verTexto: true }));
      leer(indice, completo);
    }
  };

  /** Reads message `indice` aloud; if this device can't speak Spanish, its text is shown instead. */
  const leer = (indice: number, texto: string) => {
    setHablando(true);
    setLeyendo(indice);
    void hablar(textoParaVoz(texto), (error) => {
      setHablando(false);
      setLeyendo(null);
      if (error) {
        setAvisoVoz(error);
        setMensajes((ms) => ms.map((m, i) => (i === indice ? { ...m, verTexto: true } : m)));
      }
    });
  };
  const repetir = (indice: number) => {
    pararVoz();
    leer(indice, mensajes[indice].texto);
  };
  const verTexto = (indice: number) => setMensajes((ms) => ms.map((m, i) => (i === indice ? { ...m, verTexto: !m.verTexto } : m)));

  const dictar = () => {
    if (soporte.ios) {
      // Focusing within the tap opens the keyboard, whose own microphone does work.
      porTeclado.current = true;
      setAvisoVoz(null);
      setPista("Pulsa el 🎤 del teclado, di tu pregunta y envíala: te responderé en voz alta.");
      entrada.current?.focus();
      return;
    }
    if (escuchando) return detenerDictado.current?.();
    pararVoz();
    setAvisoVoz(null);
    setEscuchando(true);
    detenerDictado.current = escuchar(
      (dicho) => setTexto(dicho),
      (dicho, error) => {
        setEscuchando(false);
        detenerDictado.current = null;
        if (error) setAvisoVoz(error);
        else if (dicho) void preguntar(dicho, true);
        else setAvisoVoz("No he entendido nada: pulsa el micrófono y vuelve a probar");
      },
    );
  };

  const nueva = () => {
    pararTodo();
    historial.current = [];
    setMensajes([]);
    entrada.current?.focus();
  };

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          aria-label="Pregunta a tu app"
          title="Pregunta a tu app"
          className="fixed right-4 bottom-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-accent-500 px-4 text-sm font-semibold text-ink-950 shadow-lg shadow-black/40 transition-all hover:bg-accent-400 active:scale-[0.97] sm:right-6 sm:bottom-6"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
            <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth={3} />
          </svg>
          <span className="hidden sm:inline">Pregunta a tu app</span>
        </button>
      )}

      {abierto && (
        <section
          role="dialog"
          aria-label="Pregunta a tu app"
          className="fixed inset-0 z-50 flex flex-col bg-ink-950 sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(680px,calc(100dvh-6rem))] sm:w-[440px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-white/[0.08] sm:shadow-2xl sm:shadow-black/60"
        >
          <header className="flex items-center gap-2 border-b border-white/[0.06] bg-ink-900 px-4 py-3">
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-100">Pregunta a tu app</h2>
            {mensajes.length > 0 && (
              <button onClick={nueva} disabled={pensando} title="Empezar una conversación nueva" className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-white/[0.06] hover:text-ink-100 disabled:opacity-50">
                Nueva
              </button>
            )}
            {hablando && (
              <button onClick={pararVoz} className="shrink-0 whitespace-nowrap rounded-md bg-white/[0.08] px-2 py-1 text-xs font-medium text-ink-100 hover:bg-white/[0.12]">
                ■ Parar
              </button>
            )}
            {soporte.voz && (
              <button
                onClick={cambiarVoz}
                aria-pressed={vozActiva}
                aria-label={vozActiva ? "Dejar de leer las respuestas en voz alta" : "Leer las respuestas en voz alta"}
                title={vozActiva ? "Respuestas en voz alta: activado" : "Respuestas en voz alta: desactivado (las preguntas dictadas se responden en voz igualmente)"}
                className={`flex size-8 items-center justify-center rounded-lg transition-colors ${vozActiva ? "bg-accent-500/15 text-accent-400" : "text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"}`}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M11 5L6 9H3v6h3l5 4V5z" />
                  {vozActiva ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="M16 9l5 6M21 9l-5 6" />}
                </svg>
              </button>
            )}
            <button
              onClick={() => {
                pararTodo();
                setAbierto(false);
              }}
              aria-label="Cerrar" className="flex size-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-ink-100">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div ref={lista} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-ink-300">
            {mensajes.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-ink-400">Pregúntame lo que quieras sobre tus ventas, productos, stock, gastos, Vine, devoluciones, estado de la cuenta o tickets. Por ejemplo:</p>
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => void preguntar(s)} className="rounded-lg border border-white/[0.08] bg-ink-900/60 px-3 py-2 text-left text-ink-200 transition-colors hover:border-accent-500/40 hover:bg-ink-900">
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              mensajes.map((m, i) =>
                m.rol === "usuario" ? (
                  <p key={i} className="ml-8 self-end rounded-2xl rounded-br-md bg-accent-500/15 px-3.5 py-2 whitespace-pre-wrap text-ink-100">
                    {m.texto}
                  </p>
                ) : (
                  <div key={i} className="flex flex-col gap-2">
                    {m.consultas.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {m.consultas.map((c, k) => (
                          <li key={k} title={c.detalle} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-ink-400">
                            📊 {c.etiqueta}
                            {c.detalle && <span className="text-ink-500"> · {c.detalle}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.voz && !m.error ? (
                      <BurbujaVoz
                        listo={!(pensando && i === mensajes.length - 1)}
                        hablando={leyendo === i}
                        verTexto={!!m.verTexto}
                        onRepetir={() => (leyendo === i ? pararVoz() : repetir(i))}
                        onVerTexto={() => verTexto(i)}
                      />
                    ) : null}
                    {m.voz && !m.verTexto && !m.error ? null : m.texto ? (
                      <Markdown texto={m.texto} />
                    ) : (
                      pensando && i === mensajes.length - 1 && !m.error && <Spinner tamano="sm" etiqueta="Pensando" />
                    )}
                    {m.error && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-danger">{m.error}</p>}
                  </div>
                ),
              )
            )}
          </div>

          {pista && !avisoVoz && <p className="border-t border-white/[0.06] bg-accent-500/10 px-4 py-2 text-xs text-accent-300">{pista}</p>}
          {avisoVoz && <p className="border-t border-white/[0.06] bg-danger/10 px-4 py-2 text-xs text-danger">{avisoVoz}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void preguntar(texto);
            }}
            className="flex items-end gap-2 border-t border-white/[0.06] bg-ink-900 p-3"
          >
            {(soporte.dictado || soporte.ios) && (
              <button
                type="button"
                onClick={dictar}
                disabled={pensando}
                aria-pressed={escuchando}
                aria-label={escuchando ? "Dejar de escuchar" : "Preguntar con el micrófono"}
                title={escuchando ? "Escuchando… pulsa para parar" : "Preguntar con el micrófono"}
                className={`relative flex size-10 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-40 ${escuchando ? "bg-danger text-white" : "border border-white/[0.08] text-ink-300 hover:bg-white/[0.06] hover:text-ink-100"}`}
              >
                {escuchando && <span aria-hidden className="absolute inset-0 animate-ping rounded-xl bg-danger/40" />}
                <svg viewBox="0 0 24 24" className="relative size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            )}
            <textarea
              ref={entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void preguntar(texto);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={escuchando ? "Te escucho…" : soporte.dictado || soporte.ios ? "Escribe o dicta tu pregunta…" : "Escribe tu pregunta…"}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-white/[0.08] bg-ink-950/60 px-3 py-2.5 text-sm text-ink-100 outline-none [field-sizing:content] focus:border-accent-500/60"
            />
            <button
              type="submit"
              disabled={pensando || !texto.trim()}
              aria-label="Enviar"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-ink-950 transition-all hover:bg-accent-400 active:scale-[0.97] disabled:opacity-40"
            >
              {pensando ? (
                <Spinner tamano="sm" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </form>
        </section>
      )}
    </>
  );
}

/** The answer to a question asked by voice: heard, not read. Replay it, stop it or show its text. */
function BurbujaVoz({ listo, hablando, verTexto, onRepetir, onVerTexto }: { listo: boolean; hablando: boolean; verTexto: boolean; onRepetir: () => void; onVerTexto: () => void }) {
  if (!listo)
    return (
      <p className="flex items-center gap-2 text-ink-400">
        <Spinner tamano="sm" /> Preparando la respuesta…
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onRepetir}
        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${hablando ? "bg-accent-500 text-ink-950" : "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25"}`}
      >
        <svg viewBox="0 0 24 24" className={`size-4 ${hablando ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
        {hablando ? "Hablando… toca para parar" : "Repetir respuesta"}
      </button>
      <button onClick={onVerTexto} className="rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-white/[0.06] hover:text-ink-100">
        {verTexto ? "Ocultar texto" : "Ver texto"}
      </button>
    </div>
  );
}
