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
// O arquivo traz uma ou mais colunas, cada uma começando com `COALESCE(` na
// coluna 0; as linhas de comentário, a vírgula entre as colunas e a vírgula
// final são deste carregador, não do arquivo.

import { readFileSync } from 'node:fs';

/** `fragmento('pendencias-analise')` -> o corpo de backend/sql/pendencias-analise.sql. */
export function fragmento(nome) {
  const corpo = readFileSync(new URL(`../sql/${nome}.sql`, import.meta.url), 'utf8')
    .split('\n').filter((linha) => !linha.trimStart().startsWith('--')).join('\n').trim();
  // A vírgula entre as colunas e a final são daqui: fragmento que já venha com
  // vírgula no fim de uma coluna não a duplica.
  return `${corpo.split(/\n(?=COALESCE\()/).map((coluna) => coluna.trim().replace(/,$/, '')).join(',\n')},`;
}
