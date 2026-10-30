// Checagem MANUAL das sgcWint* da R-130 no WinThor REAL (regra 7 do CLAUDE.md:
// vazio não é verde). Só roda com SIMULATOR_WINTHOR=oracle e as credenciais no
// backend/.env. Acha no próprio ERP um produto/filial com lote bloqueado e
// estoque (PCLOTE.QTBLOQUEADA > 0 e PCEST.QTEST > 0) e prova contagem > 0:
//   - sgcWintBloqueiosProduto: os lotes bloqueados desse produto na filial;
//   - sgcWintEstoqueFiliaisProdutos: a posição das outras filiais para um lote
//     de produtos com estoque em mais de uma filial.
// R-131: e prova que a venda válida tira linhas (público, entre filiais, remessa
// CONDVENDA 8) e que o consumo do produto 54 na filial 1 cai.
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

  // R-131: o recorte da venda válida tira linhas de verdade — cada coisa excluída com contagem > 0 em 153 dias
  // na filial 1 — e o consumo do produto 54 cai em relação ao recorte antigo (toda saída 'S' positiva).
  const janela = `M.CODOPER = 'S' AND M.QT > 0 AND M.CODFILIAL = '1' AND M.DTMOV >= TRUNC(SYSDATE) - 153`;
  const [fora] = await winthor.query(`SELECT
    SUM(CASE WHEN NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15) THEN 1 ELSE 0 END) AS L_PUBLICO,
    SUM(CASE WHEN NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15) THEN M.QT ELSE 0 END) AS U_PUBLICO,
    SUM(CASE WHEN NVL(C.CODATV1, 0) = 20 OR NVL(M.CODCLI, 0) IN (SELECT CODCLI FROM PCFILIAL WHERE NVL(CODCLI, 0) > 0) THEN 1 ELSE 0 END) AS L_FILIAIS,
    SUM(CASE WHEN NVL(C.CODATV1, 0) = 20 OR NVL(M.CODCLI, 0) IN (SELECT CODCLI FROM PCFILIAL WHERE NVL(CODCLI, 0) > 0) THEN M.QT ELSE 0 END) AS U_FILIAIS,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM PCNFSAID NF WHERE NF.NUMTRANSVENDA = M.NUMTRANSVENDA AND NF.CONDVENDA = 8) THEN 1 ELSE 0 END) AS L_REMESSA,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM PCNFSAID NF WHERE NF.NUMTRANSVENDA = M.NUMTRANSVENDA AND NF.CONDVENDA = 8) THEN M.QT ELSE 0 END) AS U_REMESSA
    FROM PCMOV M LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI WHERE ${janela}`);
  console.log(`Venda válida (filial 1, 153 dias) — fora: público ${fora.L_PUBLICO} linhas / ${fora.U_PUBLICO} un. · entre filiais ${fora.L_FILIAIS} / ${fora.U_FILIAIS} · remessa CONDVENDA 8 ${fora.L_REMESSA} / ${fora.U_REMESSA}`);
  for (const chave of ['L_PUBLICO', 'L_FILIAIS', 'L_REMESSA']) if (!(Number(fora[chave]) > 0)) { console.error(`FALHOU: ${chave} com contagem zero.`); falhou = true; }

  const [p54] = await winthor.query(`SELECT CODFORNEC FROM PCPRODUT WHERE CODPROD = 54`);
  const hoje = new Date();
  const fim = hoje.toISOString().slice(0, 10);
  const inicio = new Date(hoje.getTime() - 152 * 86400000).toISOString().slice(0, 10);
  const linhas54 = await rodar('sgcWintRessuprimento', { codfornec: Number(p54.CODFORNEC), codfilial: '1', dataInicio: inicio, dataFim: fim, diasPeriodo: 153, excluir: '0' });
  const novo = linhas54.find((l) => Number(l.CODPROD) === 54);
  const [antigo] = await winthor.query(`SELECT SUM(M.QT) AS VENDA FROM PCMOV M WHERE M.CODOPER = 'S' AND M.QT > 0 AND M.CODFILIAL = '1' AND M.CODPROD = 54
    AND M.DTMOV BETWEEN TO_DATE('${inicio}', 'YYYY-MM-DD') AND TO_DATE('${fim}', 'YYYY-MM-DD')`);
  const consumoPadrao = Number(novo.CONSUMO_DIARIO) - Number(novo.CONSUMO_DIARIO_PUBLICO);
  console.log(`Produto 54 (filial 1, ${inicio} a ${fim}): venda antes ${antigo.VENDA} un. → válida ${novo.VENDA_PERIODO} (pública ${novo.VENDA_PUBLICA}); consumo/dia com público ${novo.CONSUMO_DIARIO} → padrão sem público ${consumoPadrao.toFixed(4)}`);
  if (!(Number(novo.VENDA_PERIODO) - Number(novo.VENDA_PUBLICA) < Number(antigo.VENDA))) { console.error('FALHOU: o consumo do 54 não caiu com o recorte.'); falhou = true; }
} finally {
  await winthor.fechar();
}
process.exit(falhou ? 1 : 0);
