import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { zipTickets } from "@/lib/datos/tickets";
import { esPeriodo, nombrePeriodo } from "@/lib/datos/zipTickets";

/** The tickets of a period as a ZIP in folders. `?periodo=todo`, a year (`2026`), a month (`2026-03`) or a day (`2026-03-14`). */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser(true))) return NextResponse.redirect(new URL("/login", req.url));
  const periodo = req.nextUrl.searchParams.get("periodo") ?? "todo";
  if (!esPeriodo(periodo)) return NextResponse.json({ error: "Periodo no válido" }, { status: 400 });
  try {
    const { zip, cuantos } = await zipTickets(periodo);
    if (!cuantos) return NextResponse.json({ error: "No hay tickets en ese periodo" }, { status: 404 });
    const nombre = `${nombrePeriodo(periodo)}.zip`;
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${nombre.normalize("NFKD").replace(/[^\w.\- ]+/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[api/tickets/descargar]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo preparar la descarga" }, { status: 500 });
  }
}
