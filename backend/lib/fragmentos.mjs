// Carregador dos fragmentos SQL de backend/sql/ (R-070/R-074 do 000).
//
// Um fragmento é um pedaço de SQL que mais de um `add-*.mjs` cola dentro da
// própria consulta: os blocos de pendência do gancho de movimento (R-030/R-044,
// entregues pelas specs 003/005/007) e, na onda 3, a régua única de situação da
// solicitação (`situacao-solicitacao.sql`, entrega da 008 — R-075 fixa no
// cabeçalho dela o contrato de aliases que quem cola precisa respeitar).
//
// Existe para que a régua more num arquivo só: dois `CASE` copiados divergem no
// primeiro ajuste, e nenhum teste pega a divergência — os dois passam.
//
// O carregador faz UMA coisa: lê o arquivo, tira as linhas de comentário do
// cabeçalho e devolve o texto. A vírgula entre colunas é convenção dos blocos
// de pendência (lista de colunas) e mora em quem os consome — a régua de
// situação é uma expressão escalar e uma vírgula no fim a quebraria.

import { readFileSync } from 'node:fs';

/**
 * `fragmento('situacao-solicitacao.sql')` -> o corpo de
 * backend/sql/situacao-solicitacao.sql, sem as linhas `--`. O `.sql` é
 * opcional: `fragmento('situacao-solicitacao')` lê o mesmo arquivo.
 */
export function fragmento(nome) {
  const arquivo = String(nome).endsWith('.sql') ? nome : `${nome}.sql`;
  return readFileSync(new URL(`../sql/${arquivo}`, import.meta.url), 'utf8')
    .split('\n').filter((linha) => !linha.trimStart().startsWith('--')).join('\n').trim();
}
