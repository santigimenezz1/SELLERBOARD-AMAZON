import type { CategoriaGasto } from "@/lib/datos/gastos";

// Account charges in Seller Central's words, in the order they matter, each with its own color.
export const CATEGORIAS: { id: CategoriaGasto; nombre: string; color: string }[] = [
  { id: "almacenamiento", nombre: "Almacenamiento FBA", color: "#2c90b6" },
  { id: "publicidad", nombre: "Publicidad (PPC)", color: "#e0a526" },
  { id: "suscripcion", nombre: "Suscripción plan Profesional", color: "#8b7cf6" },
  { id: "vine", nombre: "Vine", color: "#3fb68b" },
  { id: "cupones", nombre: "Cupones", color: "#e879a6" },
  { id: "rap", nombre: "RAP / reciclaje (EPR)", color: "#5fb3a1" },
  { id: "retiradas", nombre: "Retiradas y eliminación de inventario", color: "#e07b4f" },
  { id: "envioEntrada", nombre: "Transporte de entrada", color: "#6f8fd8" },
  { id: "reclamaciones", nombre: "Reclamaciones A-to-Z y contracargos", color: "#d65c5c" },
  { id: "clawback", nombre: "Reembolsos de Amazon retirados", color: "#c58b4a" },
  { id: "otros", nombre: "Otros cargos", color: "#8a8f98" },
];

export const nombreMes = (mes: string, largo = false) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-ES", { month: largo ? "long" : "short", year: largo ? "numeric" : undefined, timeZone: "UTC" }).replace(".", "");
};
export const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
