import { Fragment, type ReactNode } from "react";

/*
 * The small part of Markdown the chat's answers use: paragraphs, bullet and numbered lists, tables, headings,
 * **bold** and `code`. Built as React nodes (never as HTML), so nothing in an answer can inject markup.
 */

function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((trozo, i) =>
    trozo.startsWith("**") && trozo.endsWith("**") && trozo.length > 4 ? (
      <strong key={i} className="font-semibold text-ink-100">
        {trozo.slice(2, -2)}
      </strong>
    ) : trozo.startsWith("`") && trozo.endsWith("`") && trozo.length > 2 ? (
      <code key={i} className="rounded bg-white/[0.06] px-1 text-[0.92em]">
        {trozo.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{trozo}</Fragment>
    ),
  );
}

const celdas = (linea: string) => linea.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const esSeparador = (linea: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);
const esNumero = (c: string) => /^[-+]?[\d.,\s]+\s*(€|£|%|EUR|GBP|uds?\.?)?$/i.test(c) && /\d/.test(c);

export function Markdown({ texto }: { texto: string }) {
  const lineas = texto.split("\n");
  const bloques: ReactNode[] = [];
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i];
    if (!linea.trim()) {
      i++;
      continue;
    }
    // Table: a row of cells, then the --- separator.
    if (linea.includes("|") && i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
      const cabecera = celdas(linea);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].includes("|") && lineas[i].trim()) filas.push(celdas(lineas[i++]));
      bloques.push(
        <div key={bloques.length} className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {cabecera.map((c, j) => (
                  <th key={j} className="border-b border-white/[0.12] px-2 py-1.5 text-left font-semibold whitespace-nowrap text-ink-200">
                    {enLinea(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, k) => (
                <tr key={k} className="border-b border-white/[0.05]">
                  {f.map((c, j) => (
                    <td key={j} className={`px-2 py-1.5 ${esNumero(c) ? "tabular text-right whitespace-nowrap" : ""}`}>
                      {enLinea(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Lists.
    const marcaLista = /^\s*([-*•]|\d+[.)])\s+/;
    if (marcaLista.test(linea)) {
      const numerada = /^\s*\d/.test(linea);
      const items: string[] = [];
      while (i < lineas.length && marcaLista.test(lineas[i])) items.push(lineas[i++].replace(marcaLista, ""));
      const Lista = numerada ? "ol" : "ul";
      bloques.push(
        <Lista key={bloques.length} className={`flex flex-col gap-1 pl-5 ${numerada ? "list-decimal" : "list-disc"}`}>
          {items.map((it, k) => (
            <li key={k}>{enLinea(it)}</li>
          ))}
        </Lista>,
      );
      continue;
    }
    // Headings.
    const titulo = linea.match(/^#{1,4}\s+(.*)$/);
    if (titulo) {
      bloques.push(
        <p key={bloques.length} className="font-semibold text-ink-100">
          {enLinea(titulo[1])}
        </p>,
      );
      i++;
      continue;
    }
    // Paragraph: consecutive plain lines.
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !marcaLista.test(lineas[i]) && !/^#{1,4}\s/.test(lineas[i]) && !(lineas[i].includes("|") && esSeparador(lineas[i + 1] ?? ""))) parrafo.push(lineas[i++]);
    bloques.push(
      <p key={bloques.length}>
        {parrafo.map((p, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {enLinea(p)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="flex flex-col gap-2.5">{bloques}</div>;
}
