import type { CompetidorXray, MercadoXray, PalabrasMercado } from "./h10Tipos";

/*
 * Audit of a competitor's listing: photos, title, bullets, description, A+, video, price and reviews, each with a
 * score, what it does well, what fails and how to beat it. For now a mock-up to design the screens: the title is
 * checked for real (length, brand, the niche's top keywords from Cerebro) and the rest is sample findings chosen
 * from the ASIN, always the same for the same listing, as the listing agent would write them.
 */

export type ParteAuditoria = { id: string; nombre: string; nota: number; bien: string[]; mal: string[]; mejora: string };
export type FotoAuditoria = {
  n: number;
  tipo: string;
  nota: number;
  comentario: string;
  estado: "bien" | "regular" | "mal";
  /** Amazon's rules (main photo) or good practice (the rest), each met or not. */
  checks: { texto: string; ok: boolean }[];
  bien: string[];
  mal: string[];
  /** What this photo should show and doesn't. */
  falta: string | null;
};
export type AuditoriaListing = {
  asin: string | null;
  pais: string;
  marca: string;
  titulo: string;
  nota: number;
  partes: ParteAuditoria[];
  fotos: FotoAuditoria[];
  tituloInfo: { caracteres: number; presentes: string[]; ausentes: string[] };
  bullets: string[];
  descripcion: string;
  aplus: boolean;
  video: boolean;
  /** Photos none of its slots shows, tied to what buyers ask or complain about. */
  fotosQueFaltan: { texto: string; porque: string }[];
  /** What your own 9 slots should show to beat it. */
  planFotos: { n: number; tipo: string; mostrar: string }[];
};

/** A number from 0 to 1 that depends only on the text: the same listing always gets the same sample findings. */
function semilla(texto: string) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 10_000) / 10_000;
  };
}

/** n items of the list, shuffled with the seed (Fisher–Yates: same result on the server and in the browser). */
function elegir<T>(azar: () => number, lista: T[], n: number): T[] {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l.slice(0, n);
}
const nota = (base: number, mal: number) => Math.max(1, Math.min(10, Math.round((base - mal * 1.1) * 10) / 10));

const FOTOS = ["Principal (fondo blanco)", "Infografía de ventajas", "Uso real", "Medidas y capacidad", "Detalle de la tapa", "Comparativa", "Contenido de la caja", "Materiales", "Vídeo"];

const BIEN = {
  fotos: ["La foto principal es limpia y el producto ocupa casi todo el encuadre", "Infografía clara con las horas de frío y calor", "Fotos de uso real (gimnasio, oficina, montaña)", "Enseña las medidas con una mano al lado para dar escala", "Usa los 9 huecos de imagen"],
  bullets: ["Empieza cada bullet con el beneficio en mayúsculas", "Responde a las dudas típicas: lavavajillas, gas, garantía", "Incluye las palabras clave principales de forma natural"],
  descripcion: ["Explica bien el cuidado y la limpieza", "Repite las medidas y la capacidad exactas"],
  aplus: ["A+ con módulos de comparativa entre sus tamaños", "Cuenta la historia de la marca con fotos propias", "Tabla comparativa con otros productos de la marca: vende más de uno"],
  precio: ["Cupón visible del 10 %", "Precio en la franja que más vende", "Pack de 2 con descuento"],
};
const MAL = {
  fotos: ["No enseña la tapa abierta ni cómo se limpia", "Textos de la infografía demasiado pequeños para leerlos en el móvil", "Solo usa 5 de los 9 huecos de imagen", "Ninguna foto se compara con la competencia", "La foto principal tiene sombras y fondo grisáceo", "No hay foto del contenido de la caja"],
  bullets: ["Bullets de una sola línea, sin explicar el beneficio", "No dice si es apta para bebidas con gas", "No menciona la garantía ni el servicio postventa", "Traducción automática con frases raras"],
  descripcion: ["Descripción copiada de los bullets", "Bloque de texto sin formato, nadie lo lee", "No habla de la limpieza ni del cuidado"],
  aplus: ["No tiene A+: pierde conversión frente a los que sí", "A+ con imágenes genéricas de banco de fotos", "El A+ repite las fotos del listing en lugar de aportar algo nuevo"],
  video: ["No tiene vídeo: los competidores con vídeo convierten más", "Vídeo sin subtítulos, la mayoría lo ve sin sonido"],
  precio: ["Más caro que la media sin explicar por qué", "Sin cupón ni oferta en temporada alta"],
};
const MEJORA = {
  fotos: "Foto 2 con la tapa abierta y la botella tumbada sin gotear; textos grandes pensados para el móvil; usar los 9 huecos (incluido el vídeo).",
  titulo: "Marca + producto + capacidad + las 2–3 palabras clave con más búsquedas al principio, y por debajo de 150 caracteres para que no se corte en el móvil.",
  bullets: "Cinco bullets que respondan a las cinco dudas que más salen en las reseñas, con el beneficio delante.",
  descripcion: "Pocas frases, con saltos de línea: cuidado, limpieza, garantía y qué trae la caja.",
  aplus: "A+ con comparativa de tamaños y colores, la prueba de estanqueidad en imágenes y una tabla con tus otros productos.",
  video: "Vídeo de 30 s con subtítulos: botella tumbada sin gotear, prueba de frío y cómo se limpia.",
  precio: "Entrar en la franja que más vende y usar cupón las primeras semanas para ganar ventas y reseñas.",
  resenas: "Vine desde el primer día y un inserto en la caja que pida opinión (sin pedir 5 estrellas: Amazon lo prohíbe).",
};

/** Sample findings of each kind of photo (the image agent will write the real ones). */
const FOTO_BIEN: Record<string, string[]> = {
  "Principal (fondo blanco)": ["Producto nítido y centrado", "Se ven bien el color y el acabado", "Buena iluminación, sin reflejos"],
  "Infografía de ventajas": ["Iconos claros para cada ventaja", "Las horas de frío y calor bien destacadas"],
  "Uso real": ["Escena creíble (gimnasio, oficina)", "Persona que encaja con el comprador"],
  "Medidas y capacidad": ["Medidas en cm y capacidad en ml", "Comparada con una mano: se entiende el tamaño"],
  otra: ["Imagen limpia y profesional", "Mantiene los colores de la marca"],
};
const FOTO_MAL: Record<string, string[]> = {
  "Principal (fondo blanco)": ["La sombra deja el fondo gris, no blanco puro", "El producto ocupa poco espacio: en la miniatura se ve pequeño", "No se ve la tapa, que es lo que más preocupa"],
  "Infografía de ventajas": ["Texto pequeño: en el móvil no se lee", "Demasiadas ventajas en una sola imagen", "Promete 24 h de frío sin decir a qué temperatura"],
  "Uso real": ["Foto de banco de imágenes, se nota montada", "El producto sale pequeño en la escena"],
  "Medidas y capacidad": ["Faltan las medidas de la boca (¿caben hielos?)", "Sin peso: la gente pregunta si pesa"],
  otra: ["Repite lo que ya dice otra foto", "Texto difícil de leer sobre el fondo"],
};
const FOTO_FALTA: Record<string, string> = {
  "Principal (fondo blanco)": "Botella con la tapa ligeramente girada para que se vea el cierre",
  "Infografía de ventajas": "Una sola idea grande por imagen: «no gotea» con la botella tumbada",
  "Uso real": "La botella dentro de una mochila abierta, sin mojar nada",
  "Medidas y capacidad": "Diámetro de la boca y si cabe en el portavasos del coche",
  otra: "Algo que responda a la queja más repetida de las reseñas",
};
const FALTAN = [
  { texto: "Prueba de que no gotea", porque: "«La tapa gotea» es la queja nº 1 de las reseñas de 1★, y ninguna foto lo desmiente" },
  { texto: "Cómo se limpia la pajita y la tapa", porque: "Sale en muchas reseñas de 2–3★ (moho en la pajita)" },
  { texto: "Contenido de la caja", porque: "El comprador no sabe si trae tapas extra o cepillo" },
  { texto: "Comparativa con una botella normal", porque: "No explica por qué vale más que una de 10 €" },
  { texto: "Prueba de temperatura con termómetro", porque: "Las reseñas dudan de las «24 h» que promete" },
];
const PLAN_FOTOS = [
  { n: 1, tipo: "Principal", mostrar: "Botella sobre fondo blanco puro, ocupando el 85 %, tapa girada para que se vea el cierre." },
  { n: 2, tipo: "No gotea", mostrar: "Botella tumbada dentro de una mochila abierta, todo seco. Texto grande: «100 % estanca»." },
  { n: 3, tipo: "Horas reales", mostrar: "Termómetro con los grados a las 0 h y a las 18 h. «18 h frío · medido a 22 °C»." },
  { n: 4, tipo: "Qué trae la caja", mostrar: "Botella, 2 tapas, cepillo y 2 juntas de repuesto, todo a la vista." },
  { n: 5, tipo: "Medidas", mostrar: "Alto, diámetro, boca y peso, con una mano al lado; cabe en el portavasos." },
  { n: 6, tipo: "Uso real", mostrar: "Gimnasio y oficina, con personas como tu comprador." },
  { n: 7, tipo: "Limpieza", mostrar: "La pajita desmontada y el cepillo: «se limpia en 1 minuto, apta lavavajillas»." },
  { n: 8, tipo: "Comparativa", mostrar: "Tu botella frente a «otras»: estanca, repuestos, horas reales, funda de base." },
  { n: 9, tipo: "Vídeo", mostrar: "30 s con subtítulos: tumbada sin gotear, prueba de frío y limpieza." },
];

/** The niche's top keywords (most searched) to check the title against. */
function palabrasTop(palabras?: PalabrasMercado) {
  return [...(palabras?.palabras ?? [])].sort((a, b) => b.busquedas - a.busquedas).slice(0, 6).map((p) => p.texto);
}

export function auditarListing(c: CompetidorXray, m: MercadoXray, palabras?: PalabrasMercado): AuditoriaListing {
  const azar = semilla(`${m.codigoPais}|${c.asin ?? c.titulo}`);
  const top = palabrasTop(palabras);
  const titulo = c.titulo.toLowerCase();
  // A keyword counts when all its words are in the title.
  const esta = (k: string) => k.split(/\s+/).every((w) => titulo.includes(w));
  const presentes = top.filter(esta);
  const ausentes = top.filter((k) => !esta(k));
  const largo = c.titulo.length;

  const malTitulo = [
    ...(largo > 180 ? [`Muy largo (${largo} caracteres): en el móvil se corta y no se ve lo importante`] : []),
    ...(largo < 80 ? [`Corto (${largo} caracteres): desaprovecha palabras clave`] : []),
    ...(ausentes.length ? [`No lleva ${ausentes.slice(0, 3).map((k) => `«${k}»`).join(", ")}, de las más buscadas`] : []),
    ...(!titulo.startsWith(c.marca.toLowerCase()) ? ["No empieza por la marca"] : []),
  ];
  const bienTitulo = [
    ...(c.titulo.toLowerCase().startsWith(c.marca.toLowerCase()) ? ["Empieza por la marca"] : []),
    ...(presentes.length ? [`Incluye ${presentes.slice(0, 3).map((k) => `«${k}»`).join(", ")}`] : []),
    ...(largo >= 80 && largo <= 180 ? [`Buena longitud (${largo} caracteres)`] : []),
  ];

  const aplus = azar() > 0.35;
  const video = azar() > 0.5;
  const parte = (id: keyof typeof MAL | "titulo" | "resenas", nombre: string, bien: string[], mal: string[], base = 8.6): ParteAuditoria => ({
    id,
    nombre,
    bien,
    mal,
    nota: nota(base, mal.length),
    mejora: MEJORA[id as keyof typeof MEJORA],
  });

  const fotosMal = elegir(azar, MAL.fotos, 1 + Math.floor(azar() * 3));
  const partes: ParteAuditoria[] = [
    parte("fotos", "Imágenes", elegir(azar, BIEN.fotos, 2), fotosMal),
    parte("titulo", "Título", bienTitulo, malTitulo, 9),
    parte("bullets", "Bullets", elegir(azar, BIEN.bullets, 1 + Math.floor(azar() * 2)), elegir(azar, MAL.bullets, 1 + Math.floor(azar() * 2))),
    parte("descripcion", "Descripción", elegir(azar, BIEN.descripcion, 1), elegir(azar, MAL.descripcion, Math.floor(azar() * 2) + 1), 7.5),
    aplus ? parte("aplus", "A+", elegir(azar, BIEN.aplus, 2), elegir(azar, MAL.aplus.slice(1), Math.floor(azar() * 2))) : parte("aplus", "A+", [], [MAL.aplus[0]], 4),
    video ? parte("video", "Vídeo", ["Tiene vídeo en la galería"], elegir(azar, MAL.video.slice(1), Math.floor(azar() * 2)), 8.5) : parte("video", "Vídeo", [], [MAL.video[0]], 4),
    parte("precio", "Precio y oferta", elegir(azar, BIEN.precio, 1), elegir(azar, MAL.precio, Math.floor(azar() * 2))),
    parte(
      "resenas",
      "Reseñas",
      [...(c.valoracion && c.valoracion >= 4.4 ? [`Valoración alta (${c.valoracion.toLocaleString("es-ES")} ★)`] : []), ...(c.resenas >= 500 ? [`Muchas reseñas (${c.resenas.toLocaleString("es-ES")}): da confianza`] : [])],
      [...(c.valoracion && c.valoracion < 4.2 ? [`Valoración floja (${c.valoracion.toLocaleString("es-ES")} ★): hay clientes descontentos`] : []), ...(c.resenas < 200 ? [`Pocas reseñas (${c.resenas.toLocaleString("es-ES")})`] : [])],
      8.8,
    ),
  ];

  const fotos: FotoAuditoria[] = FOTOS.slice(0, aplus ? 7 + Math.floor(azar() * 2) : 5 + Math.floor(azar() * 2)).map((tipo, i) => {
    const r = azar();
    const estado = r > 0.66 ? "bien" : r > 0.3 ? "regular" : "mal";
    const checks =
      i === 0
        ? [
            { texto: "Fondo blanco puro (RGB 255)", ok: estado !== "mal" },
            { texto: "El producto ocupa ~85 % del encuadre", ok: estado === "bien" || azar() > 0.5 },
            { texto: "Sin textos, logos ni marcas de agua añadidos", ok: azar() > 0.25 },
            { texto: "Se ve la tapa y la forma real del producto", ok: estado !== "mal" },
          ]
        : [
            { texto: "Se lee en el móvil (texto grande)", ok: estado === "bien" },
            { texto: "Aporta algo que no dicen las otras fotos", ok: estado !== "mal" },
            { texto: "Da escala (mano, persona u objeto conocido)", ok: azar() > 0.5 },
            { texto: "Responde a una duda de las reseñas", ok: estado === "bien" && azar() > 0.3 },
          ];
    const bien = elegir(azar, FOTO_BIEN[tipo] ?? FOTO_BIEN.otra, estado === "mal" ? 0 : estado === "regular" ? 1 : 2);
    const mal = elegir(azar, FOTO_MAL[tipo] ?? FOTO_MAL.otra, estado === "bien" ? 0 : estado === "regular" ? 1 : 2);
    const falta = estado === "bien" ? null : (FOTO_FALTA[tipo] ?? FOTO_FALTA.otra);
    const comentario = {
      bien: "Clara y se entiende en un segundo, también en el móvil.",
      regular: "Correcta, pero el texto es pequeño o no aporta nada nuevo.",
      mal: "Confusa o repetida: este hueco se podría aprovechar mucho mejor.",
    }[estado];
    return { n: i + 1, tipo, estado, comentario, checks, bien, mal, falta, nota: estado === "bien" ? 8 + Math.round(r * 15) / 10 : estado === "regular" ? 5.5 + Math.round(r * 15) / 10 : 3 + Math.round(r * 15) / 10 };
  });

  return {
    asin: c.asin ?? null,
    pais: m.codigoPais,
    marca: c.marca,
    titulo: c.titulo,
    nota: Math.round((partes.reduce((t, p) => t + p.nota, 0) / partes.length) * 10) / 10,
    partes,
    fotos,
    tituloInfo: { caracteres: largo, presentes, ausentes },
    bullets: [
      "MANTIENE EL FRÍO 24 H Y EL CALOR 12 H – Doble pared de acero inoxidable al vacío.",
      "100 % ESTANCA – Tapa con junta de silicona, apta para llevar en la mochila.",
      "SIN BPA – Materiales aptos para alimentos, sin sabor a metal.",
      "FÁCIL DE LIMPIAR – Boca ancha, cabe hielo y un cepillo.",
      "IDEAL PARA REGALO – Disponible en varios colores.",
    ].slice(0, 3 + Math.floor(azar() * 3)),
    descripcion: "Nuestra botella térmica es perfecta para el día a día: trabajo, gimnasio, colegio o montaña. Fabricada con acero inoxidable de alta calidad, mantiene tus bebidas frías o calientes durante horas.",
    aplus,
    video,
    fotosQueFaltan: elegir(azar, FALTAN, 3),
    planFotos: PLAN_FOTOS,
  };
}

/** Chip colours of a 0–10 score: green from 7.5, amber from 5.5, red below. */
export const colorNota = (n: number) => (n >= 7.5 ? "bg-success/15 text-success" : n >= 5.5 ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger");

/** What fails and what works across the leaders: each finding with how many listings have it. */
export function resumenListings(auditorias: AuditoriaListing[]) {
  const contar = (sacar: (p: ParteAuditoria) => string[]) => {
    const n = new Map<string, { texto: string; parte: string; listings: number }>();
    for (const a of auditorias)
      for (const p of a.partes)
        for (const t of new Set(sacar(p))) {
          // Same finding with different figures (lengths, keywords) counts as one.
          const clave = `${p.id}|${t.replace(/\(.*?\)|«.*?»/g, "").trim()}`;
          const x = n.get(clave) ?? { texto: t.replace(/\s*\(\d[^)]*\)/g, ""), parte: p.nombre, listings: 0 };
          x.listings++;
          n.set(clave, x);
        }
    return [...n.values()].sort((a, b) => b.listings - a.listings);
  };
  return { fallos: contar((p) => p.mal), aciertos: contar((p) => p.bien) };
}
