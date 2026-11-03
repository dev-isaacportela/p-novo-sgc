// W-014 — as seis sgcWint* da spec 014 (pedido Galderma) no WinThor REAL
// (regra 7 do CLAUDE.md: vazio não é verde). Só roda com SIMULATOR_WINTHOR=oracle
// e as credenciais no backend/.env; fica fora do `npm test` (o smoke do SQLite é
// determinístico), como o `winthor-checar.mjs`. Prova, para a Galderma (1541):
//   - sgcWintGaldProdutos: o catálogo ativo, com EAN;
//   - sgcWintGaldPosicao: posição por produto × filial no mês corrente, com venda
//     do trimestre > 0 em alguma linha;
//   - sgcWintGaldRealizadoMensal, sgcWintGaldComposicao: realizado dos 3 meses fechados;
//   - sgcWintGaldEstoqueInicial, sgcWintGaldEstoqueAtual: estoque > 0.
// E que a venda válida tira linhas reais do recorte antigo do legado (RF-003).
// Só SELECT: o adaptador recusa qualquer outra coisa.
//
// Uso: cd backend && node simulator/smoke/014-galderma-winthor.mjs
import { abrirWinthor } from '../winthor-oracle.mjs';
import { bindParams } from '../runtime.mjs';
import { definitions } from '../../add-016-galderma.mjs';

const winthor = await abrirWinthor({ log: { log() {}, warn: console.warn } });
if (!winthor) {
  console.error('SIMULATOR_WINTHOR=oracle não está ligado no backend/.env — nada a checar.');
  process.exit(2);
}

const def = (nome) => definitions.find((d) => d.name === nome);
const rodar = (nome, input = {}) => winthor.query(bindParams(def(nome).code, input, 0));
const iso = (d) => d.toISOString().slice(0, 10);
const hoje = new Date();
const inicioDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 1));
const fimDoMes = (ano, mes) => new Date(Date.UTC(ano, mes + 1, 0));
const [ano, mes] = [hoje.getUTCFullYear(), hoje.getUTCMonth()];
const periodo = {
  dataInicioMes: iso(inicioDoMes(ano, mes)), dataFimMes: iso(fimDoMes(ano, mes)),
  dataInicioTri: iso(inicioDoMes(ano, mes - 3)), dataFimTri: iso(fimDoMes(ano, mes - 1)),
};

let falhou = false;
const conferir = (titulo, linhas, extra = '') => {
  const ok = linhas.length > 0;
  console.log(`  ${ok ? 'ok' : 'FALHOU'}  ${titulo}: ${linhas.length} linha(s)${extra ? ` · ${extra}` : ''}`);
  if (!ok) falhou = true;
};

try {
  const produtos = await rodar('sgcWintGaldProdutos');
  conferir('W-014-1 sgcWintGaldProdutos (catálogo ativo 1541)', produtos,
    `com EAN: ${produtos.filter((p) => String(p.EAN ?? '').replace(/\D/g, '').length >= 8).length}`);

  const filiais = await winthor.query(`SELECT DISTINCT E.CODFILIAL FROM PCEST E JOIN PCPRODUT P ON P.CODPROD = E.CODPROD
    WHERE P.CODFORNEC = 1541 AND NVL(E.QTEST, 0) > 0 ORDER BY E.CODFILIAL`);
  const lista = filiais.map((f) => `'${String(f.CODFILIAL).replace(/\D/g, '')}'`).join(',') || "'-1'";
  const posicao = await rodar('sgcWintGaldPosicao', {
    codprods: produtos.map((p) => Number(p.CODPROD)).join(',') || '0', filiais: lista, ...periodo,
  });
  const comGiro = posicao.filter((l) => Number(l.VENDA_TRIMESTRE) > 0);
  const transito = posicao.reduce((s, l) => s + Number(l.EM_TRANSITO), 0);
  conferir(`W-014-2 sgcWintGaldPosicao (${periodo.dataInicioTri}..${periodo.dataFimMes}, filiais ${lista})`, posicao,
    `${comGiro.length} com venda no trimestre · trânsito total ${transito} · ex.: ${JSON.stringify(posicao.slice(0, 1))}`);
  if (comGiro.length === 0) { console.error('  FALHOU  nenhuma linha com venda no trimestre'); falhou = true; }

  const tri = { dataInicio: periodo.dataInicioTri, dataFim: periodo.dataFimTri };
  const realizado = await rodar('sgcWintGaldRealizadoMensal', tri);
  conferir('W-014-3 sgcWintGaldRealizadoMensal (3 meses fechados)', realizado,
    `meses: ${[...new Set(realizado.map((r) => r.MES))].join(', ')}`);

  const composicao = await rodar('sgcWintGaldComposicao', tri);
  conferir('W-014-4 sgcWintGaldComposicao', composicao,
    composicao.map((c) => `${c.CODFILIAL}: vendas ${c.QTD_VENDAS} un. / sell-in ${c.QTD_SELLIN} un.`).join(' · '));

  const inicial = await rodar('sgcWintGaldEstoqueInicial', { dataInicio: periodo.dataInicioMes });
  conferir('W-014-5 sgcWintGaldEstoqueInicial', inicial.filter((l) => Number(l.QTEST_HOJE) > 0));

  const atual = await rodar('sgcWintGaldEstoqueAtual');
  conferir('W-014-6 sgcWintGaldEstoqueAtual', atual,
    `disponível ${atual.reduce((s, l) => s + Number(l.QT_DISPONIVEL), 0)} un. de ${atual.reduce((s, l) => s + Number(l.QT_FISICO), 0)} físicas`);

  // RF-003: a venda válida sem público tira linhas reais do recorte do legado
  // (CODATV1 fora de 11..15,20) — a venda entre filiais por PCFILIAL.CODCLI e a remessa CONDVENDA 8.
  const [antes] = await winthor.query(`SELECT SUM(M.QT) AS QT FROM PCMOV M
    JOIN PCPRODUT P ON P.CODPROD = M.CODPROD AND P.CODFORNEC = 1541
    LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
    WHERE M.CODOPER = 'S' AND M.QT > 0 AND NVL(C.CODATV1, 0) NOT IN (11, 12, 13, 14, 15, 20)
      AND M.DTMOV >= TO_DATE('${tri.dataInicio}', 'YYYY-MM-DD') AND TRUNC(M.DTMOV) <= TO_DATE('${tri.dataFim}', 'YYYY-MM-DD')`);
  const depois = realizado.reduce((s, r) => s + Number(r.VENDA_REALIZADA), 0);
  console.log(`  ..  venda Galderma nos 3 meses: recorte do legado ${antes.QT} un. → venda válida sem público ${depois} un.`);
  if (!(depois > 0)) { console.error('  FALHOU  venda válida zerada'); falhou = true; }
} finally {
  await winthor.fechar();
}
process.exit(falhou ? 1 : 0);
