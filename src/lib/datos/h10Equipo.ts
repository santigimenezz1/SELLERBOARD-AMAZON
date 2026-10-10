/**
 * The research team as people, for the «Agentes» tab: each agent's name in the work log («quien»), the person shown,
 * their job, colour and how long they usually take (minutes, a real run with all the data). Keep «quien» in step with
 * the specialists' names in agenteInforme.ts.
 */
export type MiembroEquipo = {
  quien: string;
  persona: string;
  puesto: string;
  descripcion: string;
  /** Avatar: background, shirt, hair and skin colours, and hair style. */
  avatar: { fondo: string; camisa: string; pelo: string; piel: string; peinado: "corto" | "largo" | "mono" | "rizado" | "rapado" };
  minutos: [number, number];
};

export const EQUIPO: MiembroEquipo[] = [
  {
    quien: "Mercado",
    persona: "Marta",
    puesto: "Analista de mercado",
    descripcion: "Tamaño del mercado, precios, marcas, temporada y en qué países entrar.",
    avatar: { fondo: "#3b82f6", camisa: "#1e3a8a", pelo: "#3b2314", piel: "#f1c7a3", peinado: "largo" },
    minutos: [4, 8],
  },
  {
    quien: "Palabras clave y PPC",
    persona: "Pablo",
    puesto: "Especialista en PPC y SEO",
    descripcion: "Todas las palabras clave, campañas, pujas, presupuesto y ACoS.",
    avatar: { fondo: "#10b981", camisa: "#065f46", pelo: "#1c1917", piel: "#e0ac85", peinado: "corto" },
    minutos: [6, 12],
  },
  {
    quien: "Producto y reseñas",
    persona: "Elena",
    puesto: "Ingeniera de producto",
    descripcion: "Reseñas, qué falla, materiales, normativa y qué exigir a la fábrica.",
    avatar: { fondo: "#f59e0b", camisa: "#92400e", pelo: "#7c2d12", piel: "#f5d0b5", peinado: "mono" },
    minutos: [8, 18],
  },
  {
    quien: "Marketing y listing",
    persona: "Hugo",
    puesto: "Experto en marketing",
    descripcion: "Posicionamiento, título y bullets, fotos, A+ y plan de lanzamiento.",
    avatar: { fondo: "#ec4899", camisa: "#831843", pelo: "#a16207", piel: "#c68863", peinado: "rizado" },
    minutos: [6, 12],
  },
  {
    quien: "Director",
    persona: "Carmen",
    puesto: "Directora del informe",
    descripcion: "Revisa los cuatro análisis, comprueba las cifras, decide y escribe el informe.",
    avatar: { fondo: "#8b5cf6", camisa: "#3b0764", pelo: "#d4d4d8", piel: "#eabf9b", peinado: "rapado" },
    minutos: [5, 10],
  },
  {
    quien: "Revisor",
    persona: "Álex",
    puesto: "Revisor independiente",
    descripcion: "Lee el informe final como un inversor escéptico: busca errores, riesgos ignorados y promesas sin datos.",
    avatar: { fondo: "#64748b", camisa: "#0f172a", pelo: "#292524", piel: "#d8a47f", peinado: "corto" },
    minutos: [2, 5],
  },
];
