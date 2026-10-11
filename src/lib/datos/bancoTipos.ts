/* The test bench of the report team: shared by the server and the page. */

/** One planted error: whose mistake it imitates, who should catch it and whether they did. */
export type ResultadoTrampa = {
  id: string;
  /** The team member whose mistake it imitates («quien» in h10Equipo.ts). */
  experto: string;
  error: string;
  /** Who should catch it. */
  caza: "Verificador" | "Revisor";
  /** null: not tested this time (the reviewer is only tested when asked). */
  cazado: boolean | null;
  /** What the checker or the reviewer said about it. */
  dijo: string | null;
};

/**
 * «normal»: the specialists' analyses are right, so the reviewer can catch the report contradicting them.
 * «dificil»: the specialists made the same mistakes (only knowledge catches them), plus two Amazon policy traps.
 */
export type NivelBanco = "normal" | "dificil";

export type PruebaBanco = {
  fecha: string;
  estudio: string;
  conRevisor: boolean;
  /** Older runs, before levels existed, were «normal». */
  nivel?: NivelBanco;
  /** The reviewer's model, when tested. */
  modelo: string | null;
  dolares: number;
  trampas: ResultadoTrampa[];
  /** What the checker flagged on the clean report (should be nothing). */
  falsasAlarmas: string[];
  /** The reviewer's findings that match no planted error (may be fair points, or invented). */
  otrosRevisor: string[];
  notaRevisor: number | null;
  /** What the reviewer checked in the study's data before judging. */
  consultasRevisor?: string[];
};
