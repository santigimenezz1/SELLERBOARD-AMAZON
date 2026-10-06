import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { getSessionUser } from "@/lib/auth/session";

/** Longest text read with ElevenLabs (it charges per character): the chat sends longer ones to the device's voice. */
const MAX_CARACTERES = 1500;
/**
 * Fast model: about 1 s for a 200-character answer. eleven_v4_turbo sounds richer but took 7 s for the same text
 * (tested in October 2026), too long to wait for an answer.
 */
const MODELO = process.env.ELEVENLABS_MODELO || "eleven_flash_v2_5";

/** What to tell the user when ElevenLabs says no. `definitivo`: it won't work until something changes (plan, credits, key, voice). */
function explicar(estado: number, codigo: string): { error: string; definitivo: boolean } {
  if (codigo === "paid_plan_required")
    return { error: "La voz que elegiste en ElevenLabs solo funciona con un plan de pago (Starter). Mientras tanto respondo con la voz del dispositivo.", definitivo: true };
  if (codigo === "quota_exceeded") return { error: "Se han acabado los créditos de ElevenLabs de este mes: respondo con la voz del dispositivo.", definitivo: true };
  if (estado === 401) return { error: "ElevenLabs no acepta la clave (ELEVENLABS_API_KEY): respondo con la voz del dispositivo.", definitivo: true };
  if (estado === 404) return { error: "ElevenLabs no encuentra la voz (ELEVENLABS_VOICE_ID): respondo con la voz del dispositivo.", definitivo: true };
  return { error: `ElevenLabs no respondió (${estado || "sin conexión"})`, definitivo: false };
}

/**
 * Reads an answer aloud with ElevenLabs' realistic voice; the key stays here. Body: { texto }. Answers the MP3, or
 * JSON { error, definitivo } so the chat speaks with the device's voice instead (501: ElevenLabs isn't set up).
 */
export async function POST(req: NextRequest) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!(await getSessionUser(true))) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const clave = process.env.ELEVENLABS_API_KEY;
  const voz = process.env.ELEVENLABS_VOICE_ID;
  if (!clave || !voz) return NextResponse.json({ error: "ElevenLabs no está configurado", definitivo: true }, { status: 501 });
  const cuerpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
  const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.trim() : "";
  if (!texto || texto.length > MAX_CARACTERES) return NextResponse.json({ error: "Texto vacío o demasiado largo", definitivo: false }, { status: 400 });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": clave, "Content-Type": "application/json", Accept: "audio/mpeg" },
    // Spanish enforced (numbers, dates and «€» read the Spanish way); multilingual_v2 doesn't accept it.
    body: JSON.stringify({ text: texto, model_id: MODELO, ...(MODELO !== "eleven_multilingual_v2" && { language_code: "es" }) }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok || !res.body) {
    const detalle = ((await res?.json().catch(() => null)) as { detail?: { code?: string; status?: string; message?: string } } | null)?.detail;
    const codigo = (typeof detalle === "object" && !Array.isArray(detalle) && (detalle?.code ?? detalle?.status)) || "";
    console.error("[api/chat/voz]", res?.status ?? "sin conexión", codigo, typeof detalle === "object" && !Array.isArray(detalle) ? detalle?.message : "");
    return NextResponse.json(explicar(res?.status ?? 0, codigo), { status: 502 });
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
