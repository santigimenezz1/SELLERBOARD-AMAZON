/*
 * Voice for the chat:
 * - Dictation: the Web Speech API's SpeechRecognition (Chrome, Edge, Safari; not Firefox).
 * - Reading answers aloud: ElevenLabs' realistic voice when it's set up; otherwise, or if it fails, speechSynthesis
 *   with the best Spanish voice the device has.
 */

// The recognition API isn't in TypeScript's DOM types yet: just the part used here.
type ResultadoReconocimiento = { isFinal: boolean; 0: { transcript: string } };
type EventoReconocimiento = { resultIndex: number; results: ArrayLike<ResultadoReconocimiento> };
type Reconocimiento = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: EventoReconocimiento) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type ConstructorReconocimiento = new () => Reconocimiento;

function constructorReconocimiento(): ConstructorReconocimiento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocimiento; webkitSpeechRecognition?: ConstructorReconocimiento };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * iPhone / iPad, in any browser (they all run on Safari's engine). In-page dictation works in some of them (Safari)
 * and in others closes the microphone at once («aborted», e.g. Chrome): there the keyboard's own dictation is used.
 */
export const esIOS = () =>
  typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const dictadoDisponible = () => constructorReconocimiento() !== null;
export const vozDisponible = () => typeof window !== "undefined" && "speechSynthesis" in window;

const ERRORES_DICTADO: Record<string, string> = {
  "not-allowed": "El navegador no tiene permiso para usar el micrófono: actívalo en el candado de la barra de direcciones",
  // On iPhone this is what you get with Dictation switched off.
  "service-not-allowed": "No se puede dictar: en el iPhone activa Ajustes → General → Teclado → Dictado, y permite el micrófono a Safari",
  "audio-capture": "No se encuentra ningún micrófono",
  network: "El dictado necesita conexión a internet",
};

/** Quiet time after the last word that counts as «finished speaking». */
const SILENCIO_MS = 1500;
/** Nothing understood in this long: stop listening. */
const SIN_VOZ_MS = 10_000;
/** After asking the browser to stop, how long to wait for its own end before finishing anyway. */
const ESPERA_FIN_MS = 500;

/**
 * Starts listening (Spanish). `alCambiar` gets what's been said so far while speaking; `alTerminar` the text
 * (empty if nothing was understood), or an error, exactly once; `noFunciona` when this browser closed the microphone
 * the moment it opened, i.e. its in-page dictation doesn't work. Returns a function that stops it and sends what was
 * heard.
 *
 * Mobile browsers don't all behave: Safari on iPhone and some Android Chrome never fire the end of speech, or
 * only ever give provisional results. So the end doesn't wait for the browser: a pause after speaking, a second tap
 * or a long silence finish it, and provisional text counts.
 */
export function escuchar(alCambiar: (texto: string) => void, alTerminar: (texto: string, error?: string, noFunciona?: boolean) => void): () => void {
  const C = constructorReconocimiento();
  if (!C) {
    alTerminar("", "Este navegador no permite dictar: usa Chrome, Edge o Safari");
    return () => {};
  }
  const r = new C();
  r.lang = "es-ES";
  r.interimResults = true;
  // Continuous: in several iOS versions single-phrase mode closes the microphone right after opening it. The end
  // is decided here anyway (silence, second tap).
  r.continuous = true;
  let dicho = "";
  let error: string | undefined;
  /** Raw error code from the browser, to explain an early close. */
  let codigo = "";
  let terminado = false;
  let noFunciona = false;
  let paradoAqui = false;
  let reintentado = false;
  let inicio = Date.now();
  let silencio: ReturnType<typeof setTimeout> | undefined;
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    clearTimeout(silencio);
    clearTimeout(sinVoz);
    alTerminar(dicho.trim(), error, noFunciona);
  };
  /** Asks the browser to stop and finishes even if it never says it has. */
  const parar = () => {
    if (terminado) return;
    paradoAqui = true;
    try {
      r.stop();
    } catch {}
    setTimeout(terminar, ESPERA_FIN_MS);
  };
  const sinVoz = setTimeout(() => {
    if (!dicho) parar();
  }, SIN_VOZ_MS);

  r.onresult = (e) => {
    // Rebuilt from every result each time (some browsers repeat results or always report index 0). Some give each
    // result as the whole phrase so far: then the newer one replaces the older instead of adding to it.
    let texto = "";
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.trim();
      texto = t.toLowerCase().startsWith(texto.toLowerCase()) ? t : `${texto} ${t}`;
    }
    dicho = texto;
    alCambiar(dicho.trim());
    clearTimeout(silencio);
    silencio = setTimeout(parar, SILENCIO_MS);
  };
  r.onerror = (e) => {
    codigo = e.error;
    // «no-speech» and «aborted» just mean nothing was said or it was stopped.
    if (e.error !== "no-speech" && e.error !== "aborted") error = ERRORES_DICTADO[e.error] ?? `No se pudo dictar (Safari dice: ${e.error}). Mientras tanto, toca la caja de texto y usa el micrófono del teclado.`;
  };
  r.onend = () => {
    // Closed by the browser almost at once, with nothing heard: try once more, then explain.
    if (!paradoAqui && !dicho && !error && Date.now() - inicio < 2500) {
      if (!reintentado) {
        reintentado = true;
        inicio = Date.now();
        try {
          return r.start();
        } catch {}
      }
      noFunciona = true;
      error = `El micrófono se cerró nada más abrirse${codigo ? ` (el navegador dice: ${codigo})` : ""}. Toca la caja de texto y usa el micrófono del teclado.`;
    }
    terminar();
  };
  try {
    r.start();
  } catch {
    error = "No se pudo empezar a escuchar: vuelve a tocar el micrófono";
    terminar();
  }
  return parar;
}

// ---------- Reading aloud ----------

/** The answer as it should be heard: no Markdown marks, tables read row by row, symbols spoken. */
export function textoParaVoz(markdown: string): string {
  return markdown
    .split("\n")
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)) // table separators
    .map((l) => {
      if (l.includes("|")) {
        const celdas = l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()).filter(Boolean);
        return celdas.join(", ") + ".";
      }
      return l.replace(/^\s*([-*•]|\d+[.)])\s+/, "").replace(/^#+\s+/, "");
    })
    .join("\n")
    .replace(/\*\*|`|__/g, "")
    .replace(/(\d)\s*[–-]\s*(\d)/g, "$1 a $2")
    .replace(/\s+–\s+/g, ", ")
    .replace(/(\d)\s?%/g, "$1 por ciento")
    .replace(/(\d)\s?£/g, "$1 libras")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** The browser's voices. Chrome loads them a moment after the page: wait for them (up to 3 s) instead of reading an empty list. */
function vocesCargadas(): Promise<SpeechSynthesisVoice[]> {
  const ya = speechSynthesis.getVoices();
  if (ya.length) return Promise.resolve(ya);
  return new Promise((ok) => {
    const listo = () => {
      clearTimeout(limite);
      speechSynthesis.removeEventListener("voiceschanged", listo);
      ok(speechSynthesis.getVoices());
    };
    const limite = setTimeout(listo, 3000);
    speechSynthesis.addEventListener("voiceschanged", listo);
  });
}

/** The most natural Spanish voice available (Spain first; the «Natural»/online ones of Edge and Google sound best). */
async function vozEspanola(): Promise<SpeechSynthesisVoice | null> {
  const es = (await vocesCargadas()).filter((v) => /^es([-_]|$)/i.test(v.lang));
  const espana = es.filter((v) => /^es[-_]es$/i.test(v.lang));
  const buena = (v: SpeechSynthesisVoice) => /natural|online|google|neural|premium|enhanced/i.test(v.name);
  return espana.find(buena) ?? espana[0] ?? es.find(buena) ?? es[0] ?? null;
}

export const SIN_VOZ_ESPANOLA =
  "Tu dispositivo no tiene ninguna voz en español, así que no leo la respuesta en voz alta. En Windows: Configuración → Hora e idioma → Voz → Agregar voces → Español (España). O usa Chrome o Edge, que traen voces en español.";

/**
 * Reads `texto` aloud with the device's voice, sentence by sentence (long utterances get cut off in some browsers).
 * Never with a voice of another language: without a Spanish one it doesn't speak and `alTerminar` gets
 * SIN_VOZ_ESPANOLA. `alTerminar` runs when it ends or is stopped.
 */
async function hablarDispositivo(texto: string, alTerminar: (error?: string) => void): Promise<void> {
  if (!vozDisponible()) return alTerminar();
  speechSynthesis.cancel();
  const voz = await vozEspanola();
  if (!voz) return alTerminar(SIN_VOZ_ESPANOLA);
  // Split after . ! ? followed by a space (not inside numbers like 11.561,37) and at line breaks.
  const frases = texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);
  frases.forEach((f, i) => {
    const u = new SpeechSynthesisUtterance(f);
    u.voice = voz;
    u.lang = voz.lang;
    u.rate = 1.05;
    if (i === frases.length - 1) {
      u.onend = () => alTerminar();
      u.onerror = () => alTerminar();
    }
    speechSynthesis.speak(u);
  });
}

// The realistic voice: ElevenLabs, made on the server (/api/chat/voz, where the key stays) and played here.

/** Longer answers (read with the switch on) go with the device's voice: ElevenLabs charges per character. */
const MAX_VOZ_REALISTA = 1500;
/** Waiting longer than this for the audio: the device's voice instead. */
const ESPERA_AUDIO_MS = 12_000;
/** 10 ms of silence: played in a tap, it unlocks the player on iPhone for the rest of the visit. */
const SILENCIO = "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

let reproductor: HTMLAudioElement | null = null;
const elReproductor = () => (reproductor ??= new Audio());
/** The MP3 of each text already heard: repeating an answer doesn't spend credits again. */
const audios = new Map<string, string>();
/** ElevenLabs can't be used in this visit (not set up, plan, credits): the device's voice straight away. */
let sinVozRealista = false;
/** Goes up with every `hablar` and `callar`: audio that arrives after being stopped or replaced isn't played. */
let turno = 0;
let pendiente: AbortController | null = null;

/** The text's MP3 from the server (object URL), or why not; `definitivo`: don't try again in this visit. */
async function audioRealista(texto: string, senal: AbortSignal): Promise<{ url: string } | { error: string; definitivo: boolean }> {
  const ya = audios.get(texto);
  if (ya) return { url: ya };
  const r = await fetch("/api/chat/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }), signal: senal });
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string; definitivo?: boolean };
    // Not set up (501): no warning, the device's voice is simply what there is.
    return { error: r.status === 501 ? "" : (b.error ?? `error ${r.status}`), definitivo: r.status === 501 || !!b.definitivo };
  }
  const url = URL.createObjectURL(await r.blob());
  audios.set(texto, url);
  return { url };
}

/**
 * Reads `texto` aloud: with ElevenLabs' realistic voice when it works, else with the device's. `alTerminar` runs
 * once when it ends (with the reason if it can't speak at all), not when stopped with `callar`. `alAvisar` gets,
 * once a visit, why the realistic voice can't be used.
 */
export async function hablar(texto: string, alTerminar: (error?: string) => void, alAvisar?: (aviso: string) => void): Promise<void> {
  callar();
  const mio = turno;
  if (!texto) return alTerminar();
  if (!sinVozRealista && texto.length <= MAX_VOZ_REALISTA) {
    const control = (pendiente = new AbortController());
    const limite = setTimeout(() => control.abort(), ESPERA_AUDIO_MS);
    const audio = await audioRealista(texto, control.signal).catch(() => null);
    clearTimeout(limite);
    if (mio !== turno) return;
    if (audio && "url" in audio) {
      const a = elReproductor();
      a.src = audio.url;
      // Safari on iPhone refuses when no tap unlocked the player: then the device's voice.
      if (await a.play().then(() => true, () => false)) {
        a.onended = a.onerror = () => {
          if (mio === turno) alTerminar();
        };
        return;
      }
      if (mio !== turno) return;
    } else if (audio?.definitivo) {
      sinVozRealista = true;
      if (audio.error) alAvisar?.(audio.error);
    }
  }
  return hablarDispositivo(texto, alTerminar);
}

/**
 * Safari on iPhone only lets a page make sound that a tap started, and the answer arrives seconds later: call this
 * in the tap that sends the question. A moment of silence unlocks the player and a silent utterance the device's
 * voice, for the rest of the visit.
 */
export function desbloquearVoz(): void {
  const a = elReproductor();
  a.src = SILENCIO;
  void a.play().catch(() => {});
  if (!vozDisponible()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

/**
 * The same in the microphone's tap, without any sound (sound right then can close the microphone on iPhone):
 * loading the player inside a tap is enough for Safari to let it play later.
 */
export function desbloquearSinSonido(): void {
  elReproductor().load();
}

/** Chrome loads its voices lazily: asking early has them ready for the first answer. */
export function prepararVoces(): void {
  if (vozDisponible()) speechSynthesis.getVoices();
}

/** Stops speaking. Only touches what is sounding: on iPhone touching speech right before dictating can close the microphone. */
export function callar(): void {
  turno++;
  pendiente?.abort();
  pendiente = null;
  if (reproductor && !reproductor.paused) reproductor.pause();
  if (vozDisponible() && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
}
