import type { ControlInforme, InformeEstrategico, PruebaInforme } from "@/lib/datos/h10Tipos";

/*
 * The team's automatic checker (no AI, so free and never wrong about what it checks):
 * - every figure the report presents as data (headline figures, keyword figures, «dato» proofs) must be in what the
 *   team read: the study and every tool answer. Rounded figures («unos 48.000 €») and figures shown as the result of
 *   a calculation («1.240 / 3.100 = 40 %») are fine;
 * - every claim of the evidence sections carries its proof, every deduction its confidence, and every web source was
 *   really found or read by a specialist.
 * It also lists the figures of each specialist's analysis that aren't in the data, for the director to judge.
 */

/** Sections where every listed claim needs its proof (the rest are plans and specs). */
const SECCIONES_CON_PRUEBA = new Set(["validacion", "diferenciacion", "riesgo", "decision"]);
/** Figures below this are counts of things («3 países», «9 fotos»), not data to check. */
const MINIMO = 10;

/** Every number the team could have read, sorted, to look figures up. */
export type Referencia = Float64Array;

/** The numbers of a text in any format: «48.200», «48,200», «12,5», «12.5». */
function numerosSueltos(t: string, salida: number[]) {
  for (const m of t.matchAll(/\d[\d.,]*\d|\d/g)) {
    const s = m[0];
    const espanol = Number(s.replace(/\./g, "").replace(",", "."));
    const ingles = Number(s.replace(/,/g, ""));
    if (Number.isFinite(espanol)) salida.push(espanol);
    if (Number.isFinite(ingles) && ingles !== espanol) salida.push(ingles);
  }
}

function recorrer(x: unknown, salida: number[]) {
  if (typeof x === "number") {
    if (Number.isFinite(x)) {
      salida.push(x);
      // Shares kept as fractions are quoted as percentages.
      if (x > 0 && x < 1) salida.push(x * 100);
    }
  } else if (typeof x === "string") {
    numerosSueltos(x, salida);
  } else if (Array.isArray(x)) {
    for (const y of x) recorrer(y, salida);
  } else if (x && typeof x === "object") {
    for (const y of Object.values(x)) recorrer(y, salida);
  }
}

/** The reference from the study and every tool answer (JSON text or plain text). */
export function crearReferencia(datos: unknown[], lecturas: string[]): Referencia {
  const salida: number[] = [];
  recorrer(datos, salida);
  for (const l of lecturas) {
    try {
      recorrer(JSON.parse(l), salida);
    } catch {
      numerosSueltos(l, salida);
    }
  }
  return Float64Array.from(new Set(salida)).sort();
}

/** Whether any number of the reference falls between «desde» and «hasta». */
function hayEntre(ref: Referencia, desde: number, hasta: number) {
  let a = 0;
  let b = ref.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (ref[m] < desde) a = m + 1;
    else b = m;
  }
  return a < ref.length && ref[a] <= hasta;
}

type Cifra = { texto: string; valor: number; tolerancia: number };

/**
 * The figures of a report text worth checking (Spanish format: «1.240», «12,5 %», «1,2 M», «48 mil»), with how far a
 * datum may be and still match (its rounding). Skips small counts, years, codes («AISI 304», «10/2011», «B0…») and
 * results of a calculation shown in the text («= 40 %»).
 */
export function cifrasDeTexto(t: string): Cifra[] {
  const cifras: Cifra[] = [];
  for (const m of t.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s*(%|millones|mil\b|k\b|M\b))?/g)) {
    const i = m.index ?? 0;
    const despues = t[i + m[0].length] ?? "";
    // Part of a code or a word: «B0C1234», «10/2011», «#1e3a8a», «24h».
    if (/[\p{L}\d#/_\-.,]/u.test(t[i - 1] ?? "") || /^[\p{L}\d/]/u.test(despues)) continue;
    if (/[=≈]\s*$/.test(t.slice(Math.max(0, i - 3), i))) continue;
    const entero = Number(m[1].replace(/\./g, ""));
    const decimales = m[2] ?? "";
    const mult = m[3] === "k" || m[3] === "mil" ? 1000 : m[3] === "M" || m[3] === "millones" ? 1_000_000 : 1;
    const valor = (entero + (decimales ? Number(`0.${decimales}`) : 0)) * mult;
    if (valor < MINIMO) continue;
    if (!decimales && mult === 1 && m[3] !== "%" && !m[1].includes(".") && valor >= 1990 && valor <= 2040) continue;
    // A rounded figure matches anything that rounds to it: «48.000» ± 500, «1,2 M» ± 50.000.
    const ceros = decimales ? 0 : (/0+$/.exec(String(entero))?.[0].length ?? 0);
    const unidad = (decimales ? 10 ** -decimales.length : 10 ** Math.min(ceros, String(entero).length - 1)) * mult;
    // Only its own rounding: with the whole study as reference, a looser margin would find almost any small figure.
    cifras.push({ texto: m[0].trim(), valor, tolerancia: decimales ? unidad / 2 + 1e-9 : Math.max(unidad / 2, 0.5) });
  }
  return cifras;
}

const cuadra = (c: Cifra, ref: Referencia) => hayEntre(ref, c.valor - c.tolerancia, c.valor + c.tolerancia);

/** The figures of a text that aren't in the data, once each. */
export function sinRespaldo(t: string, ref: Referencia): string[] {
  return [...new Set(cifrasDeTexto(t).filter((c) => !cuadra(c, ref)).map((c) => c.texto))];
}

/** «https://www.Example.com/a/?x#y» → «example.com/a», to compare pages. */
export const normalizarUrl = (u: string) =>
  u
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");

type Informe = Omit<InformeEstrategico, "generadoEn" | "simulado" | "coste">;

/**
 * Checks a handed-in report and marks on it the figures that couldn't be verified. Returns what's wrong (for the
 * director to fix) and the summary kept with the report. «urlsVistas» null skips the web check.
 */
export function controlarInforme(informe: Informe, ref: Referencia, urlsVistas: Set<string> | null): { problemas: string[]; control: ControlInforme } {
  const problemas: string[] = [];
  const sinVerificar: ControlInforme["sinVerificar"] = [];
  const pruebas = { dato: 0, web: 0, supuesto: 0 };
  let revisadas = 0;
  let sinPrueba = 0;

  const comprobar = (texto: string, donde: string) => {
    const cifras = cifrasDeTexto(texto);
    revisadas += cifras.length;
    const malas = [...new Set(cifras.filter((c) => !cuadra(c, ref)).map((c) => c.texto))];
    for (const cifra of malas) sinVerificar.push({ cifra, donde });
    return malas;
  };
  const verPrueba = (p: PruebaInforme | undefined, claim: string, donde: string) => {
    if (!p) return;
    if (p.tipo in pruebas) pruebas[p.tipo]++;
    delete p.sinVerificar;
    if (p.tipo === "dato") {
      const malas = comprobar(`${claim} · ${p.texto}`, donde);
      if (malas.length) p.sinVerificar = malas;
    }
    if (p.tipo === "supuesto" && !p.confianza) problemas.push(`${donde}: la deducción no dice su confianza (alta, media o baja)`);
  };

  for (const s of informe.secciones) {
    const conPrueba = SECCIONES_CON_PRUEBA.has(s.id);
    for (const b of s.bloques) {
      if (b.tipo === "cifras") {
        for (const x of b.items) {
          const donde = `${s.etiqueta} · ${x.etiqueta}`;
          delete x.sinVerificar;
          if (x.prueba && x.prueba.tipo !== "dato") {
            verPrueba(x.prueba, "", donde);
            continue;
          }
          const malas = comprobar(x.valor, donde);
          if (malas.length) x.sinVerificar = malas;
        }
      } else if (b.tipo === "lista") {
        for (const x of b.items) {
          const donde = `${s.etiqueta} · «${x.titulo.slice(0, 60)}»`;
          if (!x.prueba && conPrueba) {
            sinPrueba++;
            problemas.push(`${donde}: la afirmación no dice de dónde sale (falta «prueba»)`);
          }
          verPrueba(x.prueba, x.titulo, donde);
        }
      } else if (b.tipo === "etiquetas") {
        if (!b.prueba) {
          sinPrueba++;
          problemas.push(`${s.etiqueta} · «${b.titulo}»: falta «prueba»`);
        }
        verPrueba(b.prueba, "", `${s.etiqueta} · ${b.titulo}`);
      } else if (b.tipo === "palabras") {
        for (const x of b.items) {
          delete x.sinVerificar;
          const cifras = [x.busquedas, x.cpr].filter((n) => typeof n === "number" && n >= MINIMO);
          revisadas += cifras.length;
          const malas = cifras.filter((n) => !hayEntre(ref, n - 0.5, n + 0.5));
          if (malas.length) {
            x.sinVerificar = true;
            for (const n of malas) sinVerificar.push({ cifra: n.toLocaleString("es-ES"), donde: `${s.etiqueta} · «${x.texto}»` });
          }
        }
      }
    }
  }

  for (const c of sinVerificar) problemas.push(`${c.donde}: la cifra «${c.cifra}» no está en los datos del estudio. Corrígela con la de las herramientas, o si es un cálculo enseña la operación («a / b = ${c.cifra}») o márcala como deducción`);

  const fuentesNoVistas = urlsVistas ? informe.fuentes.filter((f) => !urlsVistas.has(normalizarUrl(f.url))).map((f) => f.n) : [];
  for (const n of fuentesNoVistas) {
    const f = informe.fuentes.find((x) => x.n === n)!;
    problemas.push(`Fuente [${n}] (${f.url}): ningún especialista la encontró ni la leyó. Usa solo páginas que el equipo haya visitado`);
  }

  return { problemas, control: { revisadas, sinVerificar, pruebas, sinPrueba, fuentesNoVistas } };
}
