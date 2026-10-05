import type { Resena, ResenasEstudio } from "./h10Tipos";

/*
 * MADE-UP competitor reviews for the «Análisis H10» preview (no review exports yet), already translated and
 * tagged with their themes, as the AI would leave them. Ratings and review counts of the brands are invented too.
 */

const r = (estrellas: Resena["estrellas"], fecha: string, texto: string, ...temas: string[]): Resena => ({ estrellas, fecha, texto, temas });

export const RESENAS_DEMO: Record<string, ResenasEstudio> = {
  rebounder: {
    temas: [
      { id: "vuelca", texto: "Se mueve o vuelca con tiros fuertes", tipo: "queja", mejora: "Base más ancha y pesada, con piquetas y sacos de arena incluidos" },
      { id: "red", texto: "La red se destensa o se rompe pronto", tipo: "queja", mejora: "Red de mayor grosor con tensores regulables y una red de repuesto" },
      { id: "montaje", texto: "Montaje complicado, instrucciones malas", tipo: "queja", mejora: "Montaje sin herramientas e instrucciones con vídeo (código QR)" },
      { id: "oxido", texto: "Óxido en la estructura", tipo: "queja", mejora: "Estructura con pintura epoxi anti-óxido para exterior" },
      { id: "tamano", texto: "Más pequeño de lo que parece", tipo: "queja", mejora: "Medidas reales con una persona al lado en las fotos" },
      { id: "angulo", texto: "El ángulo cuesta de ajustar", tipo: "queja", mejora: "Ajuste de ángulo con palanca rápida y posiciones marcadas" },
      { id: "rebote", texto: "Devuelve bien el balón", tipo: "elogio" },
      { id: "robusto", texto: "Robusto y estable", tipo: "elogio" },
      { id: "plegable", texto: "Plegable y fácil de guardar", tipo: "elogio" },
      { id: "ninos", texto: "Los niños entrenan horas con él", tipo: "elogio" },
      { id: "precio", texto: "Buena relación calidad-precio", tipo: "elogio" },
    ],
    competidores: [
      {
        marca: "Racetex", codigoPais: "DE", producto: "Racetex Rebounder für Fußball", valoracion: 4.4, totalResenas: 594, distribucion: [68, 15, 6, 4, 7],
        resenas: [
          r(5, "2026-09-18", "Muy estable, mi hijo tira con toda su fuerza y no se mueve. Rebote perfecto.", "robusto", "rebote", "ninos"),
          r(5, "2026-09-02", "Calidad alemana, se nota. Se pliega y cabe en el garaje.", "robusto", "plegable"),
          r(4, "2026-08-27", "Muy bueno pero caro. El montaje me llevó una hora larga.", "montaje", "robusto"),
          r(2, "2026-08-11", "Al mes la red ya estaba floja y el balón no vuelve igual.", "red"),
          r(5, "2026-07-30", "Mis dos hijos lo usan a diario, ha mejorado mucho su control.", "ninos", "rebote"),
          r(1, "2026-07-14", "Tras un invierno fuera, óxido en todas las uniones.", "oxido"),
        ],
      },
      {
        marca: "SONGMICS", codigoPais: "DE", producto: "SONGMICS Rebounder für Fußball", valoracion: 4.2, totalResenas: 133, distribucion: [59, 18, 9, 6, 8],
        resenas: [
          r(5, "2026-09-21", "Por este precio no se puede pedir más. Rebota bien.", "precio", "rebote"),
          r(3, "2026-09-05", "Con tiros fuertes se desplaza hacia atrás, hay que ponerle peso.", "vuelca"),
          r(4, "2026-08-19", "Fácil de plegar, buena compra para el jardín.", "plegable", "precio"),
          r(2, "2026-08-03", "Las instrucciones son solo dibujos, imposible entenderlas.", "montaje"),
          r(1, "2026-07-22", "Se volcó en el segundo uso y se dobló una barra.", "vuelca"),
        ],
      },
      {
        marca: "Football Master", codigoPais: "GB", producto: "Football Master Premium Single", valoracion: 4.5, totalResenas: 604, distribucion: [71, 14, 6, 3, 6],
        resenas: [
          r(5, "2026-09-25", "Excelente rebote y muy sólido. Lo mejor que he comprado este año.", "rebote", "robusto"),
          r(5, "2026-09-09", "Mi hijo de 9 años no lo suelta. Merece cada libra.", "ninos", "precio"),
          r(4, "2026-08-21", "Muy bueno, aunque es más pequeño de lo que esperaba.", "tamano", "rebote"),
          r(2, "2026-08-06", "La red se rompió en la costura a las seis semanas.", "red"),
          r(5, "2026-07-19", "Robusto, aguanta tiros de adulto sin moverse.", "robusto"),
        ],
      },
      {
        marca: "Happy Jump", codigoPais: "ES", producto: "Happy Jump Red de Rebote de Fútbol 1x1m", valoracion: 4.1, totalResenas: 158, distribucion: [55, 19, 10, 7, 9],
        resenas: [
          r(4, "2026-09-14", "Cumple, buen precio. El ángulo cuesta un poco de cambiar.", "angulo", "precio"),
          r(5, "2026-09-01", "A los niños les encanta, se pasan la tarde jugando.", "ninos"),
          r(2, "2026-08-17", "Más pequeña de lo que parece en las fotos.", "tamano"),
          r(3, "2026-08-02", "Se mueve bastante, tuve que clavarla con piquetas propias.", "vuelca"),
          r(1, "2026-07-20", "Montaje horrible, faltaba un tornillo y las instrucciones no sirven.", "montaje"),
        ],
      },
      {
        marca: "HOMCOM", codigoPais: "ES", producto: "HOMCOM Red de Rebote Plegable Doble Cara", valoracion: 3.8, totalResenas: 95, distribucion: [44, 20, 12, 9, 15],
        resenas: [
          r(4, "2026-09-11", "Doble cara muy útil y barata.", "precio", "rebote"),
          r(1, "2026-08-28", "Óxido a los dos meses, no es para dejar fuera.", "oxido"),
          r(2, "2026-08-09", "La red se destensó enseguida.", "red"),
          r(3, "2026-07-25", "El ángulo se baja solo al recibir el balón.", "angulo"),
        ],
      },
      {
        marca: "VEVOR", codigoPais: "FR", producto: "VEVOR Filet de Rebond", valoracion: 3.9, totalResenas: 587, distribucion: [48, 19, 11, 8, 14],
        resenas: [
          r(4, "2026-09-16", "Buen producto para el precio, rebota bien.", "precio", "rebote"),
          r(2, "2026-09-03", "Se vuelca con tiros fuertes, hay que lastrarlo.", "vuelca"),
          r(1, "2026-08-20", "La red se rompió al mes.", "red"),
          r(5, "2026-08-05", "Plegable y ligero, lo llevamos al campo.", "plegable"),
          r(3, "2026-07-18", "Montaje largo, instrucciones poco claras.", "montaje"),
        ],
      },
    ],
  },
  porterias: {
    temas: [
      { id: "varillas", texto: "Las varillas se rompen o se doblan", tipo: "queja", mejora: "Varillas de fibra de vidrio reforzada y una varilla de repuesto" },
      { id: "viento", texto: "Las piquetas no sujetan, se vuela con el viento", tipo: "queja", mejora: "Piquetas largas en forma de U y sacos de arena para suelo duro" },
      { id: "redrota", texto: "La red se rasga", tipo: "queja", mejora: "Red de nailon trenzado más gruesa en las zonas de impacto" },
      { id: "pequena", texto: "Más pequeña de lo esperado", tipo: "queja", mejora: "Ofrecer tallas (S/M/L) y medidas claras en la primera foto" },
      { id: "plegar", texto: "Cuesta volver a plegarla", tipo: "queja", mejora: "Vídeo corto de plegado y bolsa de transporte más amplia" },
      { id: "rapida", texto: "Se monta en segundos", tipo: "elogio" },
      { id: "diario", texto: "Los niños la usan a diario", tipo: "elogio" },
      { id: "portatil", texto: "Ligera y portátil", tipo: "elogio" },
      { id: "precio", texto: "Buena relación calidad-precio", tipo: "elogio" },
      { id: "solida", texto: "Sólida y bien acabada", tipo: "elogio" },
    ],
    competidores: [
      {
        marca: "Happy Jump", codigoPais: "GB", producto: "Happy Jump Portable Pop Up Football Goals", valoracion: 4.3, totalResenas: 1738, distribucion: [62, 17, 8, 5, 8],
        resenas: [
          r(5, "2026-09-20", "Se abre en dos segundos, perfecta para el parque.", "rapida", "portatil"),
          r(4, "2026-09-06", "Muy práctica, aunque plegarla tiene su truco.", "plegar", "rapida"),
          r(2, "2026-08-22", "Con un poco de viento sale volando, las piquetas son de juguete.", "viento"),
          r(5, "2026-08-08", "Mis hijos juegan cada tarde, gran compra.", "diario", "precio"),
          r(1, "2026-07-24", "Una varilla se partió a la semana.", "varillas"),
        ],
      },
      {
        marca: "Racetex", codigoPais: "DE", producto: "Racetex 2er Fußballtor Kinder Set", valoracion: 4.5, totalResenas: 2343, distribucion: [70, 15, 6, 3, 6],
        resenas: [
          r(5, "2026-09-23", "Dos porterías por este precio, muy buena calidad.", "precio", "solida"),
          r(5, "2026-09-10", "Montaje rapidísimo, los niños encantados.", "rapida", "diario"),
          r(4, "2026-08-26", "Bien, aunque más pequeñas de lo que pensaba.", "pequena"),
          r(2, "2026-08-12", "La red se rasgó en la esquina al mes.", "redrota"),
          r(5, "2026-07-28", "Ligeras, las llevamos a la playa.", "portatil"),
        ],
      },
      {
        marca: "HUDORA", codigoPais: "DE", producto: "HUDORA Fußballtor Pro Tect", valoracion: 4.6, totalResenas: 2376, distribucion: [74, 14, 5, 3, 4],
        resenas: [
          r(5, "2026-09-19", "Muy sólida, aguanta tiros de adulto.", "solida"),
          r(5, "2026-09-04", "Calidad de verdad, se nota en el acabado.", "solida", "diario"),
          r(3, "2026-08-18", "Buena pero cara y pesada para moverla.", "solida"),
          r(2, "2026-08-01", "Una varilla llegó doblada.", "varillas"),
        ],
      },
      {
        marca: "SONGMICS", codigoPais: "ES", producto: "SONGMICS Portería de Fútbol", valoracion: 4.2, totalResenas: 1563, distribucion: [58, 19, 9, 6, 8],
        resenas: [
          r(5, "2026-09-15", "Buena relación calidad-precio, fácil de montar.", "precio", "rapida"),
          r(2, "2026-08-30", "Se vuela con el viento, hay que lastrarla.", "viento"),
          r(4, "2026-08-14", "Los niños la usan todos los días en el jardín.", "diario"),
          r(1, "2026-07-29", "La red se rompió enseguida.", "redrota"),
          r(3, "2026-07-16", "Plegarla es una pesadilla.", "plegar"),
        ],
      },
      {
        marca: "Dunlop", codigoPais: "FR", producto: "Dunlop Buts de Football 50 x 44 x 44", valoracion: 4.0, totalResenas: 247, distribucion: [50, 21, 12, 7, 10],
        resenas: [
          r(4, "2026-09-12", "Práctica y barata, para niños pequeños va bien.", "precio"),
          r(2, "2026-08-27", "Mucho más pequeña de lo que esperaba.", "pequena"),
          r(3, "2026-08-10", "Las piquetas no sujetan en césped duro.", "viento"),
          r(5, "2026-07-26", "Se monta en segundos.", "rapida"),
        ],
      },
    ],
  },
};
