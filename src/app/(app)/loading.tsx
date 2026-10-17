import { Esqueleto } from "@/components/Esqueleto";

/** Every section: shown at once while the page's data arrives (and lets Next prefetch the menu's sections). */
export default function Cargando() {
  return <Esqueleto />;
}
