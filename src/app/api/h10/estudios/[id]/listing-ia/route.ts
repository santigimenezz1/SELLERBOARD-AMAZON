import { NextResponse, type NextRequest } from "next/server";
import { mismoOrigen } from "@/lib/origen";
import { usuarioDelEstudio } from "@/lib/auth/estudios";
import { permitirIA } from "@/lib/auth/limiteInvitado";
import { proponerListing, type EnPantalla } from "@/lib/ia/proponerListing";
import { mensajeError } from "@/lib/ia/errores";
import { DESTINOS_PALABRA, esCodigoPais } from "@/lib/datos/h10Tipos";
import { volcarConsumo } from "@/lib/datos/consumo";

type Ctx = { params: Promise<{ id: string }> };

/** What the tab sends of its screen, checked and trimmed: the country's chosen keywords and the draft as it is. */
function enPantalla(b: { palabras?: unknown; actual?: unknown }): EnPantalla {
  const txt = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const palabras = Array.isArray(b.palabras)
    ? b.palabras
        .slice(0, 100)
        .map((p) => {
          const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
          return {
            texto: txt(o.texto, 120),
            destino: DESTINOS_PALABRA.find((d) => d === o.destino),
            busquedas: typeof o.busquedas === "number" ? o.busquedas : 0,
          };
        })
        .filter((p) => p.texto.trim())
    : undefined;
  const a = (b.actual && typeof b.actual === "object" ? b.actual : null) as { titulo?: unknown; bullets?: unknown } | null;
  const actual = a
    ? { titulo: txt(a.titulo, 500), bullets: Array.from({ length: 5 }, (_, i) => txt(Array.isArray(a.bullets) ? a.bullets[i] : "", 1000)) }
    : undefined;
  return { palabras, actual };
}

/**
 * «Proponer con IA» in «Lanzamiento»: a draft title and 5 bullets for one country. Body: { pais, palabras, actual }
 * (the keywords and the draft as the tab has them). Nothing is saved here: the tab puts it in its fields.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const id = (await params).id;
  const user = await usuarioDelEstudio(id, true);
  if (!user) return NextResponse.json({ error: "Sesión caducada: vuelve a iniciar sesión" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { pais?: unknown; palabras?: unknown; actual?: unknown };
  if (!esCodigoPais(body.pais)) return NextResponse.json({ error: "País no válido" }, { status: 400 });
  const limite = await permitirIA(user, "analisis");
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });
  try {
    const listing = await proponerListing(id, body.pais, enPantalla(body));
    await volcarConsumo().catch(() => {});
    return NextResponse.json({ ok: true, listing });
  } catch (e) {
    console.error("[api/h10/listing-ia]", e);
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 });
  }
}
