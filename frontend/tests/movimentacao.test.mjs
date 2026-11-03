// Spec 013 — a regra pura da movimentação de produtos (`src/lib/movimentacao.ts`).
// O que só a server function responde está em backend/simulator/smoke/013-movimentacao.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  abaDaUrl, abaExigeFilial, filialEfetiva, alternarFilial, paginaLocal, ultimaPagina, totalDe, listaCodprods,
  tomDiasSemVenda, rotuloDiasSemVenda, classificarExcedentes, resumoExcedentes, tomPrazo, rotuloPrazo,
  rotuloBloqueio, textoResponsavelBloqueio, nomeDaRotina, chavePlano, mapaDePlanos, validarPlano, planoAtrasado,
  resultadoDoSalvamento, rotuloStatusPlano, severidadeDe, tomSeveridade, tomCoberturaRitmo, rotuloDias,
  parametrosRuptura, PADRAO_RUPTURA, linhasCsvRuptura, CABECALHO_CSV_RUPTURA, rotuloOperacao, rotaTransferencia,
  ehTransferencia, tomParadoSemVenda, rotuloParadoSemVenda,
} from '../src/lib/movimentacao.ts';
import { permissoesDe, menuParaPersona, PERSONAS } from '../src/lib/permissoes.ts';

const FILIAIS = [{ CODFILIAL: '1' }, { CODFILIAL: '2' }];

/** Uma parametrização no formato da regra (lib/cobertura.ts). */
const cobertura = (nivel, codigo, a, b = [45, 10], c = [60, 5]) => ({
  id: 1, nivel, codigo, descricao: '', ativo: true,
  curvas: { A: { alvoDias: a[0], toleranciaPct: a[1] }, B: { alvoDias: b[0], toleranciaPct: b[1] }, C: { alvoDias: c[0], toleranciaPct: c[1] } },
});

const linha = (codprod, extra = {}) => ({
  codprod, descricao: `P${codprod}`, embalagem: 'CX', fornecedor: 'F', codfornec: 1088, codepto: 2, codsec: 21,
  estoqueAtual: 0, estoqueTransito: 0, custo: 10, vendaPeriodo: 0, faturamento: 0, consumoDiario: 0, coberturaDias: null,
  ...extra,
});

test('C-001: só o comercial fica sem a movimentação — menu e porteiro pelo mesmo predicado; quem só lê vê e não grava plano', () => {
  for (const persona of PERSONAS) {
    const p = permissoesDe(persona, 'MEMBER');
    const noMenu = menuParaPersona(p).some((item) => item.to === '/movimentacao');
    assert.equal(p.verMovimentacao, persona !== 'comercial', persona);
    assert.equal(noMenu, p.verMovimentacao, `${persona}: menu e porteiro divergem`);
    assert.equal(p.registrarPlanoAcao, persona !== 'comercial', persona);
  }
  const leitura = permissoesDe('gestor', 'READ_ONLY');
  assert.equal(leitura.verMovimentacao, true);
  assert.equal(leitura.registrarPlanoAcao, false);
});

test('C-002: a aba vive no endereço; desconhecida ou ausente abre em Sem venda', () => {
  assert.equal(abaDaUrl('perdas'), 'perdas');
  assert.equal(abaDaUrl('ruptura'), 'ruptura');
  assert.equal(abaDaUrl('promocionais'), 'sem-venda');
  assert.equal(abaDaUrl(null), 'sem-venda');
});

test('C-003: Sem venda, Excedentes e A vencer exigem filial (a primeira, sem escolha); Ruptura e Perdas abrem em todas', () => {
  for (const aba of ['sem-venda', 'excedentes', 'a-vencer']) {
    assert.equal(abaExigeFilial(aba), true);
    assert.equal(filialEfetiva(aba, '', FILIAIS), '1');
    assert.equal(filialEfetiva(aba, '2', FILIAIS), '2');
  }
  for (const aba of ['ruptura', 'perdas']) {
    assert.equal(abaExigeFilial(aba), false);
    assert.equal(filialEfetiva(aba, '', FILIAIS), '');
  }
  assert.equal(filialEfetiva('sem-venda', '', []), '', 'sem filial do ERP, nada a escolher');
});

test('C-030 / C-035: clicar na filial filtra; clicar de novo na mesma volta a todas', () => {
  assert.equal(alternarFilial('', '2'), '2');
  assert.equal(alternarFilial('2', '2'), '');
  assert.equal(alternarFilial('2', '3'), '3');
});

test('RN-020: página de 50 em memória, última página nunca abaixo de 1, total da primeira linha e o fragmento de códigos da página', () => {
  const lista = Array.from({ length: 120 }, (_, i) => i + 1);
  assert.deepEqual(paginaLocal(lista, 3), lista.slice(100, 120));
  assert.deepEqual(paginaLocal(lista, 0), lista.slice(0, 50));
  assert.equal(ultimaPagina(120), 3);
  assert.equal(ultimaPagina(0), 1);
  assert.equal(totalDe([{ TOTAL_REGISTROS: 87 }]), 87);
  assert.equal(totalDe([]), 0);
  assert.equal(listaCodprods([{ CODPROD: 5711 }, { CODPROD: '5711' }, { CODPROD: 5712 }, { CODPROD: 'x' }, { CODPROD: '1;DROP' }]), '5711,5712');
  assert.equal(listaCodprods([]), '0');
});

test('C-007 / RN-020: dias sem venda — sem venda na janela é alerta com "Sem venda em 720 dias"; 180+ alerta, 90+ atenção, abaixo neutro', () => {
  assert.equal(rotuloDiasSemVenda(null), 'Sem venda em 720 dias');
  assert.equal(rotuloDiasSemVenda(120), '120 dias');
  assert.equal(rotuloDiasSemVenda(1), '1 dia');
  assert.equal(tomDiasSemVenda(null), 'alert');
  assert.equal(tomDiasSemVenda(180), 'alert');
  assert.equal(tomDiasSemVenda(120), 'attention');
  assert.equal(tomDiasSemVenda(30), 'off');
});

test('C-011 / RN-004..RN-006: curva A, departamento 2 com 35/20 (teto 42), cobertura 120 — excedente, 85 acima do alvo, 78 dias acima do teto, valor pelo custo', () => {
  const [f] = classificarExcedentes([
    linha(5710, { estoqueAtual: 100, estoqueTransito: 20, consumoDiario: 1, coberturaDias: 120, faturamento: 90000, custo: 15 }),
    linha(2, { faturamento: 15000, consumoDiario: 1, coberturaDias: 5 }),
    linha(3, { faturamento: 10000, consumoDiario: 1, coberturaDias: 5 }),
  ], [cobertura('departamento', '2', [35, 20])]);
  assert.equal(f.curva, 'A');
  assert.equal(f.alvoDias, 35);
  assert.equal(f.tetoDias, 42);
  assert.equal(f.excedente, true);
  assert.equal(f.quantidadeExcedente, 85);
  assert.equal(f.valorExcedente, 1275);
  assert.equal(f.diasAcimaDoTeto, 78);
  assert.equal(f.origemRegra, 'Departamento');
});

test('C-012 / RN-005: sem parametrização alcançável vale o padrão do sistema (35 dias, sem tolerância); o produto vence o departamento', () => {
  const [g] = classificarExcedentes([linha(9, { codepto: 3, consumoDiario: 1, coberturaDias: 36, estoqueAtual: 36, faturamento: 1 })], []);
  assert.equal(g.tetoDias, 35);
  assert.equal(g.alvoDias, 35);
  assert.equal(g.origemRegra, 'Padrão do sistema');
  assert.equal(g.excedente, true);
  const [h] = classificarExcedentes([linha(5001, { consumoDiario: 1, coberturaDias: 30, faturamento: 1 })],
    [cobertura('departamento', '2', [35, 20], [45, 10], [60, 5]), cobertura('sku', '5001', [20, 0], [25, 0], [25, 0])]);
  assert.equal(h.curva, 'C', 'um produto sozinho é 100 % do faturamento: curva C');
  assert.equal(h.tetoDias, 25);
  assert.equal(h.origemRegra, 'Produto');
});

test('RN-006: sem consumo não há alvo a cobrir — quantidade acima do alvo zero e nunca negativa; cobertura no teto não é excedente', () => {
  const [a, b] = classificarExcedentes([
    linha(1, { estoqueAtual: 10, consumoDiario: 0, coberturaDias: null, faturamento: 1 }),
    linha(2, { estoqueAtual: 10, consumoDiario: 1, coberturaDias: 35, faturamento: 1 }),
  ], []);
  assert.equal(a.quantidadeExcedente, 0);
  assert.equal(a.excedente, false);
  assert.equal(a.diasAcimaDoTeto, null);
  assert.equal(b.excedente, false, '35 contra teto 35 não passa');
  assert.equal(b.quantidadeExcedente, 0);
});

test('C-015: os números do topo são da população inteira e não mudam com a visão — 3 com giro, 1 excedente', () => {
  const lista = classificarExcedentes([
    linha(1, { estoqueAtual: 120, consumoDiario: 1, coberturaDias: 120, faturamento: 100, custo: 2 }),
    linha(2, { estoqueAtual: 10, consumoDiario: 1, coberturaDias: 10, faturamento: 50 }),
    linha(3, { estoqueAtual: 20, consumoDiario: 1, coberturaDias: 20, faturamento: 10 }),
  ], []);
  const resumo = resumoExcedentes(lista);
  assert.equal(resumo.comGiro, 3);
  assert.equal(resumo.itens, 1);
  assert.equal(resumo.valor, 170);
  assert.equal(resumo.coberturaMedia, 120);
  assert.equal(resumo.semRegra, 1);
  assert.equal(lista.filter((e) => e.excedente).length, 1);
  assert.equal(resumoExcedentes([]).coberturaMedia, null);
});

test('C-016 / RN-020: prazo do lote — "Vencido há 5 dias", "Vence hoje", "Vence em 20 dias"; até 30 alerta, até 90 atenção', () => {
  assert.equal(rotuloPrazo(-5), 'Vencido há 5 dias');
  assert.equal(rotuloPrazo(-1), 'Vencido há 1 dia');
  assert.equal(rotuloPrazo(0), 'Vence hoje');
  assert.equal(rotuloPrazo(20), 'Vence em 20 dias');
  assert.equal(rotuloPrazo(null), '—');
  assert.equal(tomPrazo(-5), 'alert');
  assert.equal(tomPrazo(30), 'alert');
  assert.equal(tomPrazo(60), 'attention');
  assert.equal(tomPrazo(200), 'off');
});

test('C-017 / RN-008: bloqueio total, parcial "10 de 30 bloqueadas" e livre sem nada; quem, quando e rotina — nunca motivo', () => {
  assert.deepEqual(rotuloBloqueio({ SITUACAO_BLOQUEIO: 'TOTAL', QT_LOTE: 30, QT_BLOQUEADA: 30 }), { tom: 'alert', texto: 'Bloqueado' });
  assert.deepEqual(rotuloBloqueio({ SITUACAO_BLOQUEIO: 'PARCIAL', QT_LOTE: 30, QT_BLOQUEADA: 10 }), { tom: 'attention', texto: '10 de 30 bloqueadas' });
  assert.equal(rotuloBloqueio({ SITUACAO_BLOQUEIO: 'LIVRE' }), null);
  const data = (iso) => iso.split('-').reverse().join('/');
  assert.equal(textoResponsavelBloqueio({ BLOQUEIO_RESPONSAVEL: 'RITA ESTOQUE', BLOQUEIO_DATA: '2026-10-10', BLOQUEIO_ROTINA: '6366 ' }, data),
    'RITA ESTOQUE · 10/10/2026 · rotina 6366');
  assert.equal(textoResponsavelBloqueio({ BLOQUEIO_MATRICULA: 31, BLOQUEIO_DATA: '2026-10-10' }, data), 'matrícula 31 · 10/10/2026');
  assert.equal(textoResponsavelBloqueio({}, data), '');
  assert.equal(textoResponsavelBloqueio({ BLOQUEIO_RESPONSAVEL: 'CARLOS', BLOQUEIO_ROTINA: '[PCSIS266 - 37.00.00.42]' }, data), 'CARLOS · rotina PCSIS266');
  assert.equal(nomeDaRotina('6366'), '6366');
});

test('C-021 / RN-010: o plano exige fato, causa ou ação (espaço não conta) e data válida quando informada', () => {
  const vazio = { fato: '  ', causa: '', acao: '', dataAcompanhamento: '' };
  assert.equal(validarPlano(vazio), 'Preencha o fato, a causa ou a ação.');
  assert.equal(validarPlano({ ...vazio, causa: 'sem giro' }), null);
  assert.equal(validarPlano({ ...vazio, acao: 'x', dataAcompanhamento: '10/11/2026' }), 'A data de acompanhamento precisa ser uma data válida.');
  assert.equal(validarPlano({ ...vazio, acao: 'x', dataAcompanhamento: '2026-11-10' }), null);
  assert.equal(rotuloStatusPlano('em_andamento'), 'Em andamento');
  assert.equal(rotuloStatusPlano('xpto'), 'Aberto');
});

test('C-022: os lotes do mesmo produto e filial dividem o plano da aba', () => {
  const mapa = mapaDePlanos([{ ID: 7, CODPROD: 5711, CODFILIAL: '1', STATUS: 'em_andamento', FATO: 'f' }]);
  assert.equal(chavePlano(5711, '1'), chavePlano('5711', '1'));
  assert.equal(mapa.get(chavePlano(5711, '1')).id, 7);
  assert.equal(mapa.get(chavePlano(5711, '1')).status, 'em_andamento');
  assert.equal(mapa.get(chavePlano(5711, '2')), undefined);
});

test('C-023: acompanhamento vencido = data antes de hoje e não concluído', () => {
  assert.equal(planoAtrasado({ dataAcompanhamento: '2026-11-02', status: 'aberto' }, '2026-11-03'), true);
  assert.equal(planoAtrasado({ dataAcompanhamento: '2026-11-02', status: 'concluido' }, '2026-11-03'), false);
  assert.equal(planoAtrasado({ dataAcompanhamento: '2026-11-03', status: 'aberto' }, '2026-11-03'), false);
  assert.equal(planoAtrasado({ dataAcompanhamento: '', status: 'aberto' }, '2026-11-03'), false);
  assert.equal(planoAtrasado(null, '2026-11-03'), false);
});

test('C-024: a tela relê depois de salvar — o relido igual ao enviado é "salvo"; ausente ou diferente é "não gravou"', () => {
  const enviado = { fato: 'a', causa: '', acao: '', status: 'aberto' };
  const relido = { id: 1, codprod: 1, codfilial: '1', fato: 'a', causa: '', acao: '', responsavelId: 0, responsavelNome: '', dataAcompanhamento: '', status: 'aberto', atualizadoPorNome: '', atualizadoEm: '' };
  assert.deepEqual(resultadoDoSalvamento(enviado, relido), { ok: true, mensagem: 'Plano de ação salvo.' });
  assert.equal(resultadoDoSalvamento(enviado, null).ok, false);
  assert.match(resultadoDoSalvamento(enviado, null).mensagem, /não foi gravado/);
  assert.equal(resultadoDoSalvamento({ ...enviado, status: 'concluido' }, relido).ok, false, 'o servidor recusou a troca');
});

test('C-029 / RN-013: severidade só normalizada (desconhecido → Monitorar), tons e cobertura no ritmo novo contra o prazo', () => {
  assert.equal(severidadeDe('critico'), 'CRITICO');
  assert.equal(severidadeDe('XPTO'), 'MEDIO');
  assert.equal(severidadeDe(''), '');
  assert.equal(tomSeveridade('RUPTURA'), 'alert');
  assert.equal(tomSeveridade('CRITICO'), 'alert');
  assert.equal(tomSeveridade('ALTO'), 'attention');
  assert.equal(tomSeveridade('MEDIO'), 'off');
  assert.equal(tomCoberturaRitmo(4.7, 15), 'alert');
  assert.equal(tomCoberturaRitmo(23, 15), 'attention');
  assert.equal(tomCoberturaRitmo(43, 15), 'live');
  assert.equal(tomCoberturaRitmo(null, 15), 'off');
  assert.equal(rotuloDias(null), '—');
  assert.equal(rotuloDias(0), 'hoje');
  assert.equal(rotuloDias(1), '1 dia');
  assert.equal(rotuloDias(4.7), '4,7 dias');
});

test('C-026: os parâmetros da ruptura com os padrões do legado — janela 7, base 90, total 97 (o SQL não soma dentro da data), reposição de 30 dias', () => {
  assert.deepEqual(parametrosRuptura(PADRAO_RUPTURA), {
    diasJanela: 7, diasBase: 90, diasTotal: 97, limiarPerc: 50, fatorMinimo: 1.5, prazoReposicao: 15,
    vendaMinima: 5, incluirSemHistorico: 1, incluirExcecoes: 0, diasCoberturaAlvo: 30,
  });
  assert.equal(parametrosRuptura({ ...PADRAO_RUPTURA, diasJanela: 30, diasBase: 365 }).diasTotal, 395);
});

test('C-032: o CSV do alerta traz uma linha por produto na ordem do cabeçalho, sem histórico em branco (nunca 0), e a linha de parâmetros; recorte vazio não gera arquivo', () => {
  const linhas = linhasCsvRuptura([
    { CODFILIAL: '1', CODPROD: 5720, SEVERIDADE: 'CRITICO', FATOR_ACELERACAO: 8.57, DIAS_ESPERADOS: 60 },
    { CODFILIAL: '1', CODPROD: 5723, SEVERIDADE: 'CRITICO', FATOR_ACELERACAO: null, DIAS_ESPERADOS: null },
  ], PADRAO_RUPTURA, 'Todas as filiais');
  assert.equal(linhas.length, 3);
  assert.equal(linhas[0].length, CABECALHO_CSV_RUPTURA.length);
  const fator = CABECALHO_CSV_RUPTURA.indexOf('Fator de aceleração');
  assert.equal(linhas[0][fator], 8.57);
  assert.equal(linhas[1][fator], '');
  assert.equal(linhas[0][CABECALHO_CSV_RUPTURA.indexOf('Situação')], 'Crítico');
  assert.match(String(linhas[2][0]), /Parâmetros: Todas as filiais/);
  assert.ok(linhas[2].includes('janela 7 d') && linhas[2].includes('gatilho 50%'));
  assert.deepEqual(linhasCsvRuptura([], PADRAO_RUPTURA, ''), []);
});

test('C-037 / RN-018: rótulos das operações confirmadas, "Entrada (XX)"/"Saída (XX)" para as outras, e a remessa nunca vira "Venda"', () => {
  assert.equal(rotuloOperacao('E', 'ENTRADA'), 'Entrada por compra');
  assert.equal(rotuloOperacao('ET', 'ENTRADA'), 'Entrada por transferência');
  assert.equal(rotuloOperacao('ST', 'SAIDA'), 'Saída por transferência');
  assert.equal(rotuloOperacao('S', 'SAIDA'), 'Venda');
  assert.equal(rotuloOperacao('S', 'SAIDA', true), 'Remessa de entrega futura');
  assert.equal(rotuloOperacao('EN', 'ENTRADA'), 'Entrada (EN)');
  assert.equal(rotuloOperacao('SR', 'SAIDA'), 'Saída (SR)');
  assert.equal(ehTransferencia('et'), true);
  assert.equal(ehTransferencia('S'), false);
});

test('RN-018: a rota da transferência não inventa ponta', () => {
  assert.equal(rotaTransferencia('2', '1'), '2 → 1');
  assert.equal(rotaTransferencia('', '1'), '→ 1');
  assert.equal(rotaTransferencia('2', null), '2 →');
  assert.equal(rotaTransferencia(null, undefined), '');
});

test('C-034 / RN-017: "parado sem venda" — nunca vendido e 180+ alerta, 90+ atenção; 0 é "no mesmo dia"', () => {
  assert.equal(tomParadoSemVenda(40, false), 'off');
  assert.equal(tomParadoSemVenda(100, false), 'attention');
  assert.equal(tomParadoSemVenda(200, false), 'alert');
  assert.equal(tomParadoSemVenda(5, true), 'alert');
  assert.equal(rotuloParadoSemVenda(0), 'no mesmo dia');
  assert.equal(rotuloParadoSemVenda(40), '40 dias');
  assert.equal(rotuloParadoSemVenda(null), '—');
});
