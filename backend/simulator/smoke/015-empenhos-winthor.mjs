// W-015 — as quatro sgcWintEmp* da spec 015 (quadro de empenhos) no WinThor REAL
// (regra 7 do CLAUDE.md: vazio não é verde). Só roda com SIMULATOR_WINTHOR=oracle
// e as credenciais no backend/.env; fica fora do `npm test` (o smoke do SQLite é
// determinístico), como o da 014. Prova:
//   - sgcWintEmpProdutos: produtos ativos por nome e por código, com a indústria;
//   - sgcWintEmpClientes: órgãos públicos (ramos 11 a 15) primeiro;
//   - sgcWintEmpEstoqueFiliais: posição por filial com venda de 45 dias > 0 em alguma linha,
//     disponível nunca negativo e a filial 99 fora;
//   - sgcWintEmpVendaMensal: venda pública e privada > 0 nos últimos 3 meses.
// Só SELECT: o adaptador recusa qualquer outra coisa.
//
// Uso: cd backend && node simulator/smoke/015-empenhos-winthor.mjs
import { abrirWinthor } from '../winthor-oracle.mjs';
import { bindParams } from '../runtime.mjs';
import { definitions } from '../../add-017-empenhos.mjs';

const winthor = await abrirWinthor({ log: { log() {}, warn: console.warn } });
if (!winthor) {
  console.error('SIMULATOR_WINTHOR=oracle não está ligado no backend/.env — nada a checar.');
  process.exit(2);
}

const def = (nome) => definitions.find((d) => d.name === nome);
const rodar = (nome, input = {}) => winthor.query(bindParams(def(nome).code, input, 0));
const iso = (d) => d.toISOString().slice(0, 10);

let falhou = false;
const conferir = (titulo, linhas, extra = '') => {
  const ok = linhas.length > 0;
  console.log(`  ${ok ? 'ok' : 'FALHOU'}  ${titulo}: ${linhas.length} linha(s)${extra ? ` · ${extra}` : ''}`);
  if (!ok) falhou = true;
};
const exigir = (condicao, texto) => {
  console.log(`  ${condicao ? 'ok' : 'FALHOU'}  ${texto}`);
  if (!condicao) falhou = true;
};

try {
  const produtos = await rodar('sgcWintEmpProdutos', { codprod: 0, busca: 'DIETA' });
  conferir('W-015-1 sgcWintEmpProdutos (busca "DIETA")', produtos,
    `com indústria: ${produtos.filter((p) => String(p.FORNECEDOR || '').length > 0).length} · ex.: ${JSON.stringify(produtos[0])}`);
  if (produtos[0]) {
    const porCodigo = await rodar('sgcWintEmpProdutos', { codprod: Number(produtos[0].CODPROD), busca: '' });
    exigir(porCodigo.length === 1 && Number(porCodigo[0].CODPROD) === Number(produtos[0].CODPROD), `W-015-1 por código ${produtos[0].CODPROD} devolve só ele`);
  }

  const clientes = await rodar('sgcWintEmpClientes', { codcli: 0, busca: 'PREFEITURA' });
  conferir('W-015-2 sgcWintEmpClientes (busca "PREFEITURA")', clientes, `ex.: ${JSON.stringify(clientes[0])}`);
  exigir(clientes.length > 0 && [11, 12, 13, 14, 15].includes(Number(clientes[0].CODATV1)), 'W-015-2 o primeiro é órgão público (ramo 11 a 15)');

  // Produtos com venda nos últimos 45 dias, para a posição ter o que mostrar.
  const comVenda = await winthor.query(`SELECT * FROM (SELECT M.CODPROD, SUM(M.QT) AS QT FROM PCMOV M
    JOIN PCPRODUT P ON P.CODPROD = M.CODPROD WHERE M.CODOPER = 'S' AND M.DTMOV >= TRUNC(SYSDATE) - 45
    AND NVL(LENGTH(TRIM(P.OBS2)), 0) = 0 GROUP BY M.CODPROD ORDER BY SUM(M.QT) DESC) WHERE ROWNUM <= 5`);
  const codprods = comVenda.map((l) => Number(l.CODPROD)).join(', ') || '0';
  const posicao = await rodar('sgcWintEmpEstoqueFiliais', { codprods });
  const comGiro = posicao.filter((l) => Number(l.QT_VENDA_45D) > 0);
  conferir(`W-015-3 sgcWintEmpEstoqueFiliais (${codprods})`, posicao,
    `${comGiro.length} com venda em 45 d · ex.: ${JSON.stringify(comGiro[0] || posicao[0])}`);
  exigir(comGiro.length > 0, 'W-015-3 alguma filial com venda de 45 dias > 0');
  exigir(posicao.every((l) => Number(l.QT_DISPONIVEL) >= 0), 'W-015-3 disponível nunca negativo');
  exigir(posicao.every((l) => String(l.CODFILIAL).trim() !== '99'), 'W-015-3 filial 99 fora');

  const hoje = new Date();
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 3, 1));
  const meses = await rodar('sgcWintEmpVendaMensal', { dataInicio: iso(inicio), dataFim: iso(hoje), codfilial: '' });
  const publico = meses.reduce((s, m) => s + Number(m.VENDA_PUBLICO), 0);
  const privado = meses.reduce((s, m) => s + Number(m.VENDA_PRIVADO), 0);
  conferir(`W-015-4 sgcWintEmpVendaMensal (${iso(inicio)}..${iso(hoje)})`, meses,
    `público R$ ${publico.toFixed(2)} · privado R$ ${privado.toFixed(2)} · ${JSON.stringify(meses[0])}`);
  exigir(publico > 0 && privado > 0, 'W-015-4 venda pública e privada > 0 no período');
} finally {
  await winthor.fechar?.();
}

console.log(falhou ? '\n  W-015 FALHOU' : '\n  W-015: as quatro consultas do quadro de empenhos devolvem dado do WinThor real.');
process.exit(falhou ? 1 : 0);
