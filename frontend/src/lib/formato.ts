// Datas e valores — helpers puros de exibição. Sem React, sem SDK: é o que
// se testa com `node --test` (frontend/tests/formato.test.mjs).
//
// O Mitra grava datas como texto ISO em VARCHAR; a tela mostra dd/mm/aaaa.

/** `2026-08-27...` → `27/08/2026`. Entrada inválida volta como veio. */
export function fmtData(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '');
}

/** `2026-08-27T14:00:00` → `27/08/2026 14:00`. Sem hora, só a data. */
export function fmtDataHora(iso: string | null | undefined): string {
  const texto = String(iso ?? '');
  const hora = /T(\d{2}:\d{2})/.exec(texto)?.[1];
  return hora ? `${fmtData(texto)} ${hora}` : fmtData(texto);
}

/** `120.5` / `"120.50"` → `R$ 120,50`. Entrada não numérica vira vazio. */
export function moeda(valor: string | number | null | undefined): string {
  const n = Number(valor);
  return Number.isFinite(n)
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '';
}

/** Data local de hoje em ISO (`aaaa-mm-dd`), para gravar e comparar. */
export function hojeIso(): string {
  const agora = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}
