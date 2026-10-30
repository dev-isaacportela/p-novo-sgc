// Checagem MANUAL das sgcWint* da R-130 no WinThor REAL (regra 7 do CLAUDE.md:
// vazio não é verde). Só roda com SIMULATOR_WINTHOR=oracle e as credenciais no
// backend/.env. Acha no próprio ERP um produto/filial com lote bloqueado e
// estoque (PCLOTE.QTBLOQUEADA > 0 e PCEST.QTEST > 0) e prova contagem > 0:
//   - sgcWintBloqueiosProduto: os lotes bloqueados desse produto na filial;
//   - sgcWintEstoqueFiliaisProdutos: a posição das outras filiais para um lote
//     de produtos com estoque em mais de uma filial.
// Só SELECT: o adaptador recusa qualquer outra coisa.
//
// Uso: cd backend && npm run sim:winthor
import { abrirWinthor } from './winthor-oracle.mjs';
import { bindParams } from './runtime.mjs';
import { definitions } from '../add-013-compras-inteligentes.mjs';

const winthor = await abrirWinthor({ log: { log() {}, warn: console.warn } });
if (!winthor) {
  console.error('SIMULATOR_WINTHOR=oracle não está ligado no backend/.env — nada a checar.');
  process.exit(2);
}
const def = (nome) => definitions.find((d) => d.name === nome);
const rodar = (nome, input) => winthor.query(bindParams(def(nome).code, input, 0));
let falhou = false;
try {
  const [alvo] = await winthor.query(`SELECT * FROM (
    SELECT L.CODPROD, L.CODFILIAL, COUNT(*) AS LOTES, SUM(L.QTBLOQUEADA) AS BLOQUEADA
    FROM PCLOTE L JOIN PCEST E ON E.CODPROD = L.CODPROD AND E.CODFILIAL = L.CODFILIAL
    WHERE NVL(L.QTBLOQUEADA, 0) > 0 AND NVL(E.QTEST, 0) > 0
    GROUP BY L.CODPROD, L.CODFILIAL ORDER BY COUNT(*) DESC) WHERE ROWNUM <= 1`);
  if (!alvo) throw new Error('nenhum lote bloqueado com estoque no WinThor — não há o que provar');
  const lotes = await rodar('sgcWintBloqueiosProduto', { codprod: alvo.CODPROD, codfilial: String(alvo.CODFILIAL) });
  const comMotivo = lotes.filter((l) => l.MOTIVO_BLOQUEIO || l.OBSBLOQUEIO || l.OBSBLOQUEIOMANUAL || l.OBSANALISE || l.MOTIVOBLOQESTOQUE || l.OBS1 || l.OBS2);
  console.log(`sgcWintBloqueiosProduto ${alvo.CODPROD} filial ${alvo.CODFILIAL}: ${lotes.length} lote(s) (PCLOTE diz ${alvo.LOTES}), ${comMotivo.length} com motivo · ex.: ${JSON.stringify(lotes.slice(0, 2).map((l) => ({ NUMLOTE: l.NUMLOTE, QTBLOQUEADA: l.QTBLOQUEADA, MOTIVO_BLOQUEIO: l.MOTIVO_BLOQUEIO, ORIGEM_MOTIVO: l.ORIGEM_MOTIVO, LOG_RESPONSAVEL: l.LOG_RESPONSAVEL })))}`);
  if (!(lotes.length > 0)) { console.error('FALHOU: sgcWintBloqueiosProduto com contagem zero.'); falhou = true; }

  const multi = await winthor.query(`SELECT * FROM (
    SELECT CODPROD FROM PCEST WHERE NVL(QTEST, 0) - NVL(QTBLOQUEADA, 0) - NVL(QTINDENIZ, 0) - NVL(QTRESERV, 0) > 0
    GROUP BY CODPROD HAVING COUNT(*) > 1 ORDER BY CODPROD) WHERE ROWNUM <= 500`);
  const codprods = multi.map((m) => Number(m.CODPROD)).join(',');
  const posicoes = await rodar('sgcWintEstoqueFiliaisProdutos', { codprods, codfilial: '1' });
  const produtos = new Set(posicoes.map((p) => Number(p.CODPROD)));
  console.log(`sgcWintEstoqueFiliaisProdutos (${multi.length} produtos, filial 1 de fora): ${posicoes.length} posições em ${produtos.size} produtos · ex.: ${JSON.stringify(posicoes.slice(0, 2))}`);
  if (!(posicoes.length > 0)) { console.error('FALHOU: sgcWintEstoqueFiliaisProdutos com contagem zero.'); falhou = true; }
  if (posicoes.some((p) => String(p.CODFILIAL) === '1')) { console.error('FALHOU: a filial da tela voltou.'); falhou = true; }
} finally {
  await winthor.fechar();
}
process.exit(falhou ? 1 : 0);
