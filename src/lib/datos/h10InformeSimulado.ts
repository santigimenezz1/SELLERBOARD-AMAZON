import { analizarResenas, marcasDelEstudio, nombrePais, resumirEstudio } from "./h10Analisis";
import type { BloqueInforme, EstudioH10, InformeEstrategico, PalabrasMercado, SeccionInforme } from "./h10Tipos";

/*
 * A mock-up of the research agent's report, to design how it looks before the agent exists. The figures are the
 * study's own (market, price, leader's share, trend, the complaints of each star); the reasoning, the parts, the specs
 * and the web sources are sample text written for an insulated bottle, as the agent would.
 */

const euros = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} M€` : `${Math.round(n).toLocaleString("es-ES")} €`);

type ItemPalabra = Extract<BloqueInforme, { tipo: "palabras" }>["items"][number];

/**
 * «Palabras clave y PPC» from the study's Cerebro: each keyword marked to attack (searched, few titles carry it, few
 * sales to rank), to test, or to avoid at launch (very searched but expensive and taken by the leaders). Simple rules
 * that stand in for the PPC agent.
 */
function seccionPalabras(e: EstudioH10, palabras: Record<string, PalabrasMercado>, preferido: string): SeccionInforme | null {
  const pais = palabras[preferido]?.palabras.length ? preferido : Object.keys(palabras).find((p) => palabras[p].palabras.length);
  if (!pais) return null;
  const lista = [...palabras[pais].palabras].sort((a, b) => b.busquedas - a.busquedas);
  const max = lista[0]?.busquedas ?? 0;
  const pujas = lista.map((p) => p.pujaPpc).filter((x) => x > 0).sort((a, b) => a - b);
  const pujaAlta = pujas[Math.floor(pujas.length * 0.75)] ?? Infinity;
  const pujaMedia = pujas.length ? pujas.reduce((t, x) => t + x, 0) / pujas.length : null;
  const moneda = e.mercados.find((m) => m.codigoPais === pais)?.moneda ?? "EUR";
  const simbolo = moneda === "GBP" ? "£" : "€";
  const dinero = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${simbolo}`;

  // Advantage: searches against how many titles carry it and the sales needed to rank. The best of the niche (not a
  // fixed threshold) are the ones to attack, so every niche gets its own.
  const ventaja = (p: (typeof lista)[number]) => p.busquedas / ((p.densidadTitulos + 2) * Math.max(p.cpr, 5));
  const caras = (p: (typeof lista)[number]) => p.busquedas >= max * 0.5 && (p.pujaPpc >= pujaAlta || p.densidadTitulos >= 15);
  const candidatas = lista.slice(0, 60).filter((p) => !caras(p) && p.busquedas >= max * 0.03);
  const mejores = new Set([...candidatas].sort((x, y) => ventaja(y) - ventaja(x)).slice(0, 6).map((p) => p.texto));

  const clasificar = (p: (typeof lista)[number]): ItemPalabra => {
    const base = { texto: p.texto, busquedas: p.busquedas, puja: p.pujaPpc || null, densidad: p.densidadTitulos, cpr: p.cpr };
    if (caras(p))
      return { ...base, veredicto: "evitar", concordancia: null, motivo: `Muy buscada, pero ${p.pujaPpc >= pujaAlta ? "la puja es de las más caras" : `${p.densidadTitulos} títulos ya la usan`}: los líderes se llevan el clic. Déjala para cuando tengas reseñas.` };
    if (mejores.has(p.texto))
      return {
        ...base,
        veredicto: "atacar",
        concordancia: "exacta",
        motivo: `De las de mejor relación del nicho: ${p.busquedas.toLocaleString("es-ES")} búsquedas y ${p.densidadTitulos <= 5 ? `solo ${p.densidadTitulos}` : p.densidadTitulos} ${p.densidadTitulos === 1 ? "título la usa" : "títulos la usan"}${p.densidadTitulos > 5 ? " (pocos para su volumen)" : ""}; con ~${p.cpr} ventas en 8 días entras en la página 1.`,
      };
    return { ...base, veredicto: "probar", concordancia: "frase", motivo: "Volumen y competencia normales: pruébala con presupuesto bajo y quédate con ella si convierte." };
  };
  const todas = lista.slice(0, 60).map(clasificar);
  const atacar = todas.filter((x) => x.veredicto === "atacar").sort((x, y) => y.busquedas - x.busquedas);
  const probar = todas.filter((x) => x.veredicto === "probar").slice(0, 4);
  const evitar = todas.filter((x) => x.veredicto === "evitar").slice(0, 3);
  const busquedasAtacar = atacar.reduce((t, x) => t + x.busquedas, 0);

  return {
    id: "palabras",
    etiqueta: "Palabras clave",
    titulo: "Dónde pujar y dónde no",
    bloques: [
      {
        tipo: "texto",
        texto: `Analicé las ${lista.length} palabras clave del Cerebro de ${nombrePais(pais)}. La idea no es pujar por las más buscadas, que son las más caras: es encontrar **las que mucha gente busca y pocos listings trabajan**.`,
      },
      {
        tipo: "cifras",
        items: [
          { valor: lista.length.toLocaleString("es-ES"), etiqueta: "Palabras analizadas" },
          { valor: String(atacar.length), etiqueta: "Con ventaja para atacar" },
          { valor: busquedasAtacar.toLocaleString("es-ES"), etiqueta: "Búsquedas/mes de esas" },
          { valor: pujaMedia !== null ? dinero(pujaMedia) : "—", etiqueta: "Puja media sugerida" },
        ],
      },
      { tipo: "palabras", moneda, items: [...atacar, ...probar, ...evitar] },
      {
        tipo: "destacado",
        etiqueta: "Estrategia de lanzamiento",
        texto: `**Semanas 1–4:** campaña manual en **exacta** solo con las palabras «Atacar» y la puja sugerida +20 %, para ganar posición rápido. **En paralelo**, una automática con presupuesto bajo para descubrir búsquedas nuevas. **Desde la semana 5**, pasa a exacta las búsquedas de la automática que vendan y empieza con las «Probar». Las «Evitar», cuando tengas 50+ reseñas.`,
      },
      {
        tipo: "etiquetas",
        titulo: "Palabras negativas desde el primer día",
        tono: "mal",
        items: pais === "DE" ? ["glasflasche", "plastikflasche", "ersatzdeckel", "gebraucht", "kinder 350ml"] : ["vidrio", "plástico", "tapa repuesto", "segunda mano", "350 ml"],
        prueba: { tipo: "supuesto", texto: "Búsquedas que traen clics de gente que busca otra cosa" },
      },
    ],
  };
}

export function informeSimulado(e: EstudioH10, palabras: Record<string, PalabrasMercado> = {}): InformeEstrategico {
  const r = resumirEstudio(e);
  const m = r.mejor;
  const pais = nombrePais(m.mercado.codigoPais);
  const top10 = [...m.mercado.competidores].sort((a, b) => b.facturacion - a.facturacion).slice(0, 10);
  const resenasTop = Math.round(top10.reduce((t, c) => t + c.resenas, 0) / Math.max(1, top10.length));
  const marcas = marcasDelEstudio(e);
  const totalMarcas = marcas.reduce((t, b) => t + b.facturacionEur, 0);
  const lider = marcas[0];
  const cuotaLider = lider && totalMarcas ? Math.round((lider.facturacionEur / totalMarcas) * 100) : 0;
  const precio = r.precioRecomendado;
  const crecimiento = m.temporada?.crecimiento ?? null;
  const fuerte = m.temporada?.fuerte.mes ?? null;

  // The complaints of 1 and 2 star reviews (every country), the most repeated first; else Helium 10's topics.
  const estrellas = e.estrellasAmbito?.TODOS;
  const quejasBajas = estrellas
    ? estrellas.grupos
        .filter((g) => g.estrellas <= 2)
        .flatMap((g) => g.temas.filter((t) => t.tipo !== "elogio").map((t) => ({ ...t, estrellas: g.estrellas })))
        .reduce<{ texto: string; resenas: number }[]>((l, t) => {
          const x = l.find((y) => y.texto.toLowerCase() === t.texto.toLowerCase());
          if (x) x.resenas += t.resenas;
          else l.push({ texto: t.texto, resenas: t.resenas });
          return l;
        }, [])
        .sort((a, b) => b.resenas - a.resenas)
    : (analizarResenas(e)?.quejas ?? []).map((q) => ({ texto: q.texto, resenas: q.menciones }));
  const queja = (i: number, porDefecto: string) => quejasBajas[i] ?? { texto: porDefecto, resenas: 0 };
  const q1 = queja(0, "La tapa gotea");
  const q2 = queja(1, "No mantiene el frío");
  const q3 = queja(2, "Se abolla al caer");
  const pruebaQueja = (q: { texto: string; resenas: number }) =>
    q.resenas ? { tipo: "dato" as const, texto: `${q.resenas} reseñas de 1–2★ se quejan de «${q.texto.toLowerCase()}»` } : { tipo: "supuesto" as const, texto: "Queja típica de la categoría; confírmala con las reseñas" };

  return {
    generadoEn: new Date().toISOString(),
    simulado: true,
    antetitulo: `Análisis de nicho · ${e.mercados.map((x) => x.codigoPais).join(" · ")}`,
    titular: `${e.nombre.replace(/^DEMO\s*/i, "")}:`,
    titularDestacado: "gana quien resuelve la tapa",
    resumen: `El mercado mueve ${euros(r.mercadoTotalEur)} al mes y está repartido: nadie domina. Las reseñas malas repiten tres fallos que el líder no ha resuelto. Entrar por ${pais}, a ${precio ? `${precio.desde}–${precio.hasta === Infinity ? "más" : precio.hasta} €` : "precio medio"}, con un pack que ataque esos tres fallos y sin competir por precio.`,
    veredicto: "lanzar",
    coste: { minutos: 7, dolares: 1.8 },
    secciones: ([
      {
        id: "validacion",
        etiqueta: "Validación",
        titulo: "El nicho no está saturado: está repartido",
        bloques: [
          { tipo: "texto", texto: "Validé el nicho antes de recomendar nada. Los datos que cambian la lectura:" },
          {
            tipo: "cifras",
            items: [
              { valor: euros(r.mercadoTotalEur), etiqueta: "Mercado al mes" },
              { valor: precio ? `${precio.desde}–${precio.hasta === Infinity ? "+" : precio.hasta} €` : "—", etiqueta: `Precio con más ventas (${m.mercado.codigoPais})` },
              { valor: resenasTop.toLocaleString("es-ES"), etiqueta: "Reseñas de media (top 10)" },
              { valor: `${cuotaLider} %`, etiqueta: `Cuota del líder${lider ? ` (${lider.marca})` : ""}` },
            ],
          },
          {
            tipo: "texto",
            texto: `Con un líder que se lleva solo el **${cuotaLider} %**, no hay una marca que haya que derribar: hay muchas parecidas que venden lo mismo. El cliente compara **por precio y por fotos**, porque ningún listing le da una razón para elegirlo.`,
          },
          {
            tipo: "destacado",
            etiqueta: "Consecuencia directa",
            texto: `**No entres por el precio bajo.** Por debajo de 20 € compites con genéricos que aguantan márgenes que tú no. Entra en la franja que más factura en ${pais} con un producto que se vea **distinto en la miniatura** y lo demuestre en la primera imagen.`,
          },
        ],
      },
      {
        id: "diferenciacion",
        etiqueta: "Producto",
        titulo: "Cómo te diferencias",
        bloques: [
          {
            tipo: "lista",
            items: [
              {
                titulo: "Tapa estanca de verdad, probada en horizontal.",
                texto: "Doble junta de silicona y cierre de rosca con tope. Enséñalo en la imagen 2: la botella tumbada dentro de una mochila abierta, seca.",
                prueba: pruebaQueja(q1),
              },
              {
                titulo: "Promete horas reales, no las del catálogo.",
                texto: "Todo el nicho rotula «24 h frío» y la queja más dura es que no llega. Rotula lo que aguanta en tu prueba (p. ej. «18 h frío · 9 h calor, medido a 22 °C») y gana confianza en vez de reseñas de 1★.",
                prueba: pruebaQueja(q2),
              },
              {
                titulo: "Funda de silicona en la base, de serie.",
                texto: "Evita la abolladura en la primera caída, que es la tercera queja. Cuesta céntimos y además quita el ruido al dejarla en la mesa.",
                prueba: pruebaQueja(q3),
              },
              {
                titulo: "Dos tapas en la caja.",
                texto: "Tapa deportiva con pajita para el gimnasio y tapa de rosca para la mochila. Los competidores venden la segunda tapa aparte o no la tienen.",
                prueba: { tipo: "supuesto", texto: "Revisado en los 10 listings más fuertes: ninguno incluye dos tapas" },
              },
            ],
          },
        ],
      },
      {
        id: "oferta",
        etiqueta: "Oferta",
        titulo: "El pack",
        bloques: [
          { tipo: "texto", texto: "No la vendas como «otra botella térmica». Véndela como **la botella que no te va a dar problemas**:" },
          {
            tipo: "cita",
            texto: `Botella 1 L + tapa de rosca + tapa deportiva con pajita + cepillo de limpieza + 2 juntas de repuesto + funda de base, en caja regalo. Ticket de ${precio ? `${Math.round(precio.hasta === Infinity ? precio.desde * 1.3 : precio.hasta * 1.05)}–${Math.round(precio.hasta === Infinity ? precio.desde * 1.5 : precio.hasta * 1.2)}` : "30–36"} € frente a los ${precio ? `${precio.desde}–${precio.hasta === Infinity ? "más" : precio.hasta}` : "20–30"} € de la botella suelta.`,
          },
          {
            tipo: "texto",
            texto: "Por qué funciona: el que compara botella contra botella mira el precio. El que ve un pack que le resuelve la tapa, la limpieza y los repuestos **no tiene con qué compararlo**. Y el título largo del pack te deja posicionar «botella con pajita», «botella gimnasio» y «botella niños» sin hacer tres listings.",
          },
        ],
      },
      seccionPalabras(e, palabras, m.mercado.codigoPais),
      {
        id: "riesgo",
        etiqueta: "Riesgo",
        titulo: "Lo que debes aceptar antes de pedir",
        bloques: [
          {
            tipo: "lista",
            items: [
              {
                titulo: crecimiento === null ? "Tendencia sin confirmar." : crecimiento >= 0 ? `El mercado crece un ${Math.round(crecimiento * 100)} % al año.` : `El mercado baja un ${Math.round(-crecimiento * 100)} % al año.`,
                texto: crecimiento !== null && crecimiento < 0 ? "Haz la primera compra corta y no te cargues de colores." : "Hay sitio para entrar, pero también entrará más competencia: la diferenciación tiene que ser difícil de copiar.",
                prueba: { tipo: "dato", texto: "Historial de búsquedas de 3 años del estudio" },
              },
              {
                titulo: `Temporada marcada${fuerte ? `: el pico es en ${new Date(`${fuerte}-01T12:00:00Z`).toLocaleDateString("es-ES", { month: "long" })}` : ""}.`,
                texto: "El stock tiene que estar en Amazon 6–8 semanas antes del pico. Si llegas tarde, pagas almacenaje todo el invierno.",
                prueba: { tipo: "dato", texto: "Mes más fuerte del historial de búsquedas" },
              },
              {
                titulo: "Producto que se copia rápido.",
                texto: "Lo único que no se copia en un mes es el pack completo con tu caja. Registra la marca y el diseño de la caja antes de lanzar.",
                prueba: { tipo: "supuesto", texto: "Valoración del agente" },
              },
            ],
          },
        ],
      },
      {
        id: "despiece",
        etiqueta: "Despiece",
        titulo: "Las piezas que fallan son las que nadie repone",
        bloques: [
          { tipo: "texto", texto: "La botella dura años. Lo que se estropea son tres piezas pequeñas, y ninguna marca las incluye de repuesto:" },
          {
            tipo: "despiece",
            piezas: [
              { nombre: "Tapa de rosca", detalle: "Rosca y tope de cierre", estado: "estructura" },
              { nombre: "Junta de silicona de la tapa", detalle: "Consumible: se endurece y empieza a gotear", estado: "consumible" },
              { nombre: "Pajita y válvula", detalle: "Consumible: coge moho si no se limpia", estado: "consumible" },
              { nombre: "Cuerpo de doble pared al vacío", detalle: "Lo que ya viene en cualquier botella", estado: "incluido" },
              { nombre: "Funda de silicona de la base", detalle: "Lo que añades: evita abolladuras", estado: "anadido" },
              { nombre: "Pintura en polvo exterior", detalle: "Acabado: se descascarilla si es barata", estado: "estructura" },
            ],
          },
        ],
      },
      {
        id: "especificacion",
        etiqueta: "Especificación",
        titulo: "Lo que importa para tu producto",
        bloques: [
          {
            tipo: "lista",
            items: [
              { titulo: "Acero inoxidable 18/8 (AISI 304) por dentro.", texto: "Evita el sabor a metal. Pide el certificado del material, no la palabra «inox».", prueba: { tipo: "web", texto: "Diferencias entre aceros 201 y 304 en contacto con alimentos", fuente: 4 } },
              { titulo: "Juntas en silicona alimentaria, no en goma.", texto: "Aguantan más lavados y no dan olor. Es un bullet real, no un adorno.", prueba: { tipo: "web", texto: "Reglamento de materiales en contacto con alimentos", fuente: 1 } },
              { titulo: "Plásticos de la tapa sin BPA y con ensayo de migración.", texto: "Obligatorio para plásticos en contacto con alimentos en la UE.", prueba: { tipo: "web", texto: "Reglamento (UE) 10/2011", fuente: 2 } },
              { titulo: "Papeles: declaración de conformidad y LFGB para Alemania.", texto: "Pídelos en el RFQ: no cuestan nada si se piden al principio, pero si no los pides no te los dan. Y la ficha de seguridad del producto para la normativa general (GPSR).", prueba: { tipo: "web", texto: "Reglamento (UE) 2023/988 de seguridad general de los productos", fuente: 3 } },
            ],
          },
          {
            tipo: "destacado",
            etiqueta: "El mensaje del listing",
            texto: "Con eso deja de ser «otra botella térmica» y pasa a ser **«la que no gotea y trae los repuestos que vas a necesitar»**. Eso el genérico no lo copia sin rehacer su caja.",
          },
        ],
      },
      {
        id: "color",
        etiqueta: "Diseño",
        titulo: "Colores que venden y no caducan",
        bloques: [
          {
            tipo: "colores",
            items: [
              { nombre: "Verde salvia", hex: "#9CAF88", nota: "Envejece bien", estado: "bien" },
              { nombre: "Arena", hex: "#D8C8B0", nota: "Envejece bien", estado: "bien" },
              { nombre: "Azul niebla", hex: "#8FA6B8", nota: "Envejece bien", estado: "bien" },
              { nombre: "Negro mate", hex: "#2B2B2B", nota: "Mucha competencia", estado: "regular" },
              { nombre: "Rosa neón", hex: "#FF4FA3", nota: "Caduca rápido", estado: "mal" },
            ],
            texto: "Los tres primeros funcionan juntos en la foto de la caja y en una gama de 3 colores para la primera compra.",
          },
        ],
      },
      {
        id: "decision",
        etiqueta: "Decisión",
        titulo: "Qué haría y por qué",
        bloques: [
          {
            tipo: "lista",
            items: [
              { titulo: `Entrar por ${pais}.`, texto: `Es el país que más factura entre los que tienen buena nota. Después, ${r.analisis.filter((a) => a !== m).map((a) => nombrePais(a.mercado.codigoPais)).slice(0, 2).join(" y ") || "el resto"}.` },
              { titulo: "Pack con dos tapas y repuestos, 1 L.", texto: "La talla que más vende. Las de 500 ml y 750 ml, cuando el primer pedido funcione." },
              { titulo: "Tres colores, primera compra corta.", texto: "Salvia, arena y azul niebla. Repite pedido con el que mejor venda." },
              { titulo: "Lanzar con Vine y 20–30 reseñas antes de la temporada.", texto: "En este nicho la media del top 10 tiene muchas reseñas: con 50 buenas y una nota de 4,6 ya compites en la primera página." },
            ],
          },
        ],
      },
      {
        id: "produccion",
        etiqueta: "Producción",
        titulo: "Aviso serio antes de encargar nada",
        bloques: [
          { tipo: "texto", texto: "Lo que debes exigir a la fábrica, por escrito, en el RFQ:" },
          {
            tipo: "pasos",
            items: [
              { titulo: "Prueba de estanqueidad y de temperatura.", texto: "Botella tumbada 24 h sin pérdida y horas de frío medidas a 22 °C. Con el informe del laboratorio o de la propia fábrica." },
              { titulo: "Colores en Pantone y muestra física.", texto: "No en hex ni en RGB. Aprueba la muestra pintada bajo luz de día antes de producir." },
              { titulo: "Tolerancia de color y repuestos del mismo molde.", texto: "Fija el tono con tolerancia ΔE ≤ 2 entre pedidos, y que las juntas de repuesto sean del mismo molde que las montadas: si no, no encajan." },
            ],
          },
          {
            tipo: "destacado",
            etiqueta: "Lo que nadie pone",
            texto: "El punto 3 casi nadie lo pide, y es justo el que hace que tu diferenciación aguante en el segundo y el tercer pedido.",
          },
        ],
      },
    ] as (SeccionInforme | null)[]).filter((s): s is SeccionInforme => s !== null),
    fuentes: [
      { n: 1, titulo: "Reglamento (CE) nº 1935/2004, materiales en contacto con alimentos", url: "https://eur-lex.europa.eu/eli/reg/2004/1935/oj" },
      { n: 2, titulo: "Reglamento (UE) nº 10/2011, materiales plásticos en contacto con alimentos", url: "https://eur-lex.europa.eu/eli/reg/2011/10/oj" },
      { n: 3, titulo: "Reglamento (UE) 2023/988, seguridad general de los productos (GPSR)", url: "https://eur-lex.europa.eu/eli/reg/2023/988/oj" },
      { n: 4, titulo: "Acero inoxidable en contacto con alimentos (guía de ejemplo)", url: "https://www.worldstainless.org/" },
    ],
  };
}
