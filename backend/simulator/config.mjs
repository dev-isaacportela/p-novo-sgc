// Configuracao do simulador local do Mitra — p-novo-sgc (SGC 2, Gestao de Compras).
//
// Unico arquivo do simulador que muda de projeto para projeto.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── identidade ── */

export const PROJECT_LABEL = 'SGC 2 — Gestão de Compras — Simulador local';
// SEED = id do SGC anterior (p-45547), herdado de proposito: o seed fica
// estavel e NAO muda quando o p-NNNNN deste projeto nascer na plataforma.
export const SEED = 45547;

/* ── rede ── */

export const PORT = Number(process.env.SIMULATOR_PORT || 3109);
export const PROJECT_ID = Number(process.env.SIMULATOR_PROJECT_ID || 1);
export const DEFAULT_PASSWORD = process.env.SIMULATOR_PASSWORD || 'mitra123';

/* ── banco ── */

export const DB_PATH = process.env.SIMULATOR_DB_PATH || join(HERE, 'data', 'mitra-sim.db');

// O schema e LIDO dos arquivos abaixo: o setup do projeto (as 16 tabelas
// SGC_* da onda 1), o schema.mjs da lib (resolvido pelo pacote instalado em
// node_modules) e as tabelas PC* do WinThor, imitadas so para o simulador
// (nunca no setup-backend.mjs — ver o cabecalho de schema-winthor.mjs).
export const DDL_SOURCES = [
  join(HERE, '..', 'setup-backend.mjs'),
  fileURLToPath(import.meta.resolve('@benenutri/mitra-kanban/backend/schema')),
  join(HERE, 'schema-winthor.mjs'),
];

export const HEALTH_TABLE = 'KB_BOARD';

/* ── server functions ── */

// add-001-kanban.mjs reexporta as definitions da lib com os ids do mapa deste
// projeto. add-002-perfil-acesso.mjs NUNCA entra aqui (ver o cabecalho dele):
// executa no import, lanca sem MITRA_BASE_URL e so faz sentido no sandbox.
//
// Ordem do sandbox (mesma do README da 000): a 001 lê fornecedor/filial do
// WinThor (precisa da conexão JDBC já criada), a 002 lê a 001, a 003 lê a 002
// e a 004 lê a 002 e a 003. Cada add-00N publica as SFs da sua spec.
// Onda 2 (R-024 do 000): 005 -> add-008-notas-fiscais.mjs, 006 ->
// add-009-transito.mjs, 007 -> add-010-bo.mjs, nessa ordem lógica (006 e 007
// leem SGC_NF da 005). Onda 3 (R-051): 008 -> add-011-solicitacoes.mjs, 009 ->
// add-012-indicadores.mjs, nessa ordem (a aderência de solicitações da 009 lê a
// tabela da 008); a 010 não tem script. Onda 4 (R-081): 011 ->
// add-013-compras-inteligentes.mjs, 012 -> add-014-coberturas-abc.mjs, nessa
// ordem. add-002 continua fora, por último no sandbox.
export const PUBLISH_ORDER = [
  'add-001-kanban.mjs',
  'add-003-jdbc-winthor.mjs',
  'add-004-fornecedores.mjs',
  'add-005-quadro-compras.mjs',
  'add-006-itens.mjs',
  'add-007-agenda.mjs',
  'add-008-notas-fiscais.mjs',
  'add-009-transito.mjs',
  'add-010-bo.mjs',
  'add-011-solicitacoes.mjs',
  'add-012-indicadores.mjs',
  'add-013-compras-inteligentes.mjs',
  'add-014-coberturas-abc.mjs',
  // Onda 5 (R-140): 013 -> add-015-movimentacao.mjs (lê a venda válida do add-013).
  'add-015-movimentacao.mjs',
  // Onda 5 (R-150): 014 -> add-016-galderma.mjs (o add-015 é da 013).
  'add-016-galderma.mjs',
  // Onda 5 (R-160): 015 -> add-017-empenhos.mjs (o add-005 importa dele o ramo do gancho, R-161).
  'add-017-empenhos.mjs',
  // Onda 5 (R-180): 017 -> add-019-solicitacoes-apoio.mjs (lê os fragmentos do add-011).
  'add-019-solicitacoes-apoio.mjs',
];

export const FRONTEND_MAP = join(HERE, '..', '..', 'frontend', 'src', 'lib', 'server-functions.ts');
export const MAP_NAMES = 'SERVER_FUNCTION_NAMES';
export const MAP_IDS = 'SERVER_FUNCTIONS';

// Uma seção por spec, para o agente da feature preencher com os parâmetros
// que o sim:check precisa para exercitar as SFs SQL de leitura (valor
// desligado: '' no texto, '0' no número — ver CLAUDE.md). Vazia até lá: os
// add-004..007 ainda não publicam SF nenhuma.
// Um objeto só: chave repetida entre specs vale a ÚLTIMA — por isso codfornec/codfilial/datas
// ficam com os valores da 003 (1015, filial 1, período com vendas) e cardId com o da 002 (5).
export const CHECK_INPUT = {
  busca: '', limite: '20', offset: '0',
  // spec 001 (fornecedores):
  codfornec: '0', codfilial: '', ativo: '0',
  // spec 002 (quadro de compras):
  usuarioId: '2', cardId: '5', idCard: '5', boardId: '1', faseId: '2',
  // `origem` e da lista fechada de sgcEscPedidoCriar (R-098/R-106): 'manual'
  // ou 'compras_inteligentes'. sgcEscPedidoCapaInserir (cron da agenda) manda
  // 'agenda' e nao tem lista — as duas sao ESCRITA, que o sim:check pula.
  origem: 'manual', idAgenda: '1', usuarioAlvo: '2', persona: 'gestor',
  agora: '2026-09-15T12:00:00', motivo: 'teste', produtos: '',
  codfornec: '1', fornecedor: 'X', codfilial: '1', filial: 'Y',
  periodoInicio: '2026-08-01', periodoFim: '2026-09-15',
  canal: 'email', email: 'a@b.com', dtEnvio: '2026-09-15', numped: '1', obs: '',
  enviadoPor: '2', enviadoEm: '2026-09-15T12:00:00', tipo: 'email',
  para: 'a@b.com', cc: 'compras@benenutri.com', assunto: 'x', corpo: 'x',
  // spec 003 (itens do pedido):
  codfornec: '1015', codfilial: '1', dataInicio: '2026-08-01', dataFim: '2026-09-14',
  codprods: '5001,5002', codprod: '0', diasValidade: '90', diasEstoque: '80', incluirPublico: '0',
  nivel: '',
  // spec 004 (agenda de análises):
  situacao: '', hoje: '2026-09-15', id: '1',
  // spec 005 (notas fiscais e faturamento): só os parâmetros das 9 leituras SQL.
  // codfornec/codfilial/cardId/busca/limite/offset já vêm da 002 e da 003 com
  // valores que servem aqui (D-09: o objeto é um só e a última chave ganha).
  numnota: '7001', serie: '', numpeds: '998901', dataEnvio: '2026-08-01',
  status: '', faixa: '',
  // spec 006 (trânsito e recebimento): só as chaves NOVAS — cardId, busca,
  // limite, offset, hoje, usuarioId e codfornec (1015) já vêm das specs
  // acima e servem. `numnotas` é FRAGMENTO (lista de inteiros sem aspas),
  // e 90005 é a nota do seed 006 que tem entrada confirmada no PCNFENT.
  faixa: '', idNf: '1', numnotas: '90005', dtRecebimento: '2026-09-01',
  alertaEm: '2026-09-15T12:00:00', numtransent: '0', chavenfe: '',
  // spec 007 (produtos em B.O.): dias entra sem aspas em sgcWintClientesImpactados
  // (TRUNC(SYSDATE) - {{dias}}) — sem valor, o sim:check quebra por sintaxe.
  dias: '60', status: '',
  // spec 008 (solicitações do comercial): só as chaves NOVAS (R-072, D-17).
  // `pares` é o lote do rastreio no formato CODPROD:CODFILIAL:AAAA-MM-DD:CODCLI
  // — um par válido, para o gerador do CONNECT BY render 1 linha. busca/limite/
  // offset/status/situacao/codfornec/codfilial/cardId já vêm das specs acima.
  codcli: '0', pares: '5301:3:2026-08-01:9201', minhas: '0', vendedor: '0',
  // spec 009 (indicadores): só chaves NOVAS. `fase` em vez de `faseId` (002)
  // para não colidir; dataInicio/dataFim/hoje/idCard/codfilial/codfornec já vêm
  // com valores que servem aqui. `campoAgrupar`, `responsavelId` e `prioridade`
  // saíram: as duas primeiras com `/relatorios` (R-114) e `prioridade` porque o
  // único `{{prioridade}}` vivo está no sgcEscSolicitacaoInserir, uma ESCRITA —
  // e o sim:check só executa leitura (a escrita é assunto do smoke).
  fase: '', soVencidos: '',
  // spec 011 (compras inteligentes): só as chaves NOVAS (R-100, D-17).
  // codfornec/codfilial/dataInicio/dataFim/codprod/limite/offset já vêm das
  // specs acima com valores que servem. `excluir` é FRAGMENTO (lista de
  // NUMTRANSITEM sem aspas) e `0` é "nenhuma venda desconsiderada" (R-087);
  // `diasPeriodo` entra sem aspas no gerador de calendário. leadTimeDias,
  // coberturaDias e curva NÃO entram: com R-083 deixaram de ser parâmetro de
  // SQL — a fórmula e a curva são régua pura da tela.
  diasPeriodo: '153', excluir: '0', meses: '12', compradorId: '0', numtransitem: '960001',
  // layout legado da 011 (R-117): `codfornecs` é fragmento (lista de CODFORNEC sem aspas).
  codfornecs: '1042',
  // spec 012 (coberturas por curva): só a chave nova (R-100).
  // nivel, limite e offset vêm da 003; situacao vem da 004, com o mesmo '' que
  // sgcCoberturaListar quer no ramo "todas".
  idCobertura: '0',
  // spec 014 (pedido Galderma): só as chaves NOVAS (D-17). `codprods` (003) e
  // `dataInicio`/`dataFim` (003) servem; `filiais` é FRAGMENTO entre aspas.
  idNegociacao: '1', idItem: '1', filiais: "'1','2'",
  dataInicioTri: '2026-05-01', dataFimTri: '2026-07-31', dataInicioMes: '2026-08-01', dataFimMes: '2026-08-31',
  competenciaInicio: '2026-06', competenciaFim: '2026-09',
  // spec 013 (movimentação de produtos): só as chaves NOVAS (D-17). codfilial
  // (1), codfornec (1015), busca, limite, offset, codprods, hoje, id e
  // diasPeriodo já vêm das specs acima com valores que servem; `situacao` ('')
  // e `origem` ('manual') só esvaziam as listas — a sintaxe é o que o check prova.
  codepto: '0', diasSemVenda: '90', somenteComEstoque: '1', janelaDias: '720',
  diasHorizonte: '90', bloqueio: 'TODOS', diasJanela: '7', diasBase: '90', diasTotal: '97',
  limiarPerc: '50', fatorMinimo: '1.5', prazoReposicao: '15', vendaMinima: '5',
  incluirSemHistorico: '1', incluirExcecoes: '0', diasCoberturaAlvo: '30', severidade: '',
  diasVencidos: '0', numlote: 'L-1',
  // spec 015 (quadro de empenhos): só as chaves NOVAS (D-17). busca, limite, offset,
  // dataInicio/dataFim, codfilial, hoje, codprod, codcli e codprods já servem.
  idPregao: '1',
  // spec 017 (solicitações: visões agrupadas): só a chave nova (D-17). Os filtros
  // da sgcSolicitacoesListar já vêm da 008 com valores que servem.
  dimensao: 'vendedor',
};
