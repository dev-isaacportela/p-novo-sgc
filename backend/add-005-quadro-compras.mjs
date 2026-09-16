// add-005 — Server Functions da spec 002 (quadro de compras): pedido, fases,
// personas, notificações e envio à indústria. Ver
// docs/specs/002-quadro-de-compras/.
//
// Faixa de id local: 72xx — leituras e JAVASCRIPT a partir de 7201
// (sgcPersonaAtual…), escritas a partir de 7250 (sgcEscPedidoCriar…), até
// 7260 (sgcEscPedidoCapaInserir). O id local vem de SERVER_FUNCTIONS em
// frontend/src/lib/server-functions.ts até o sync-server-function-map.mjs
// trazer os reais do sandbox — mesmo padrão de add-001-kanban.mjs.
//
// As regras ligadas do quadro (sgcPodeMover/sgcPodeExcluir, gancho de
// servidor) entram em `ganchos` no `instalar()` de add-001-kanban.mjs, junto
// com esta spec — não aqui.
//
// SF chamada por id (as sgcEsc* internas desta spec, o kbNotaRegistrar da lib
// e o sgcEscAgendaEnvio da 004): no simulador resolve pelo mapa inteiro de
// backend/ids-do-mapa.mjs (`idsDoMapa`), usado em
// backend/simulator/smoke/base.mjs; na publicação real o id vem por NOME,
// via `listServerFunctionsMitra` (R-016) — ver o isEntrypoint() no fim.
//
// O quadro `compras` em si (10 fases por chave, 6 campos, 11 automações de
// e-mail) é criado aqui, no entrypoint, de forma idempotente; no simulador as
// mesmas listas são gravadas por backend/simulator/seed/002-quadro.mjs, que
// as importa deste arquivo — uma fonte só.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-005-quadro-compras.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { fragmento } from './lib/fragmentos.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));

/**
 * Blocos de pendência do gancho, entregues por cada spec em backend/sql/ e
 * colados aqui (R-030/R-044). Quem lê o arquivo é o `fragmento(nome)`
 * compartilhado de backend/lib/fragmentos.mjs (R-070/R-074); a vírgula entre as
 * colunas e a final são daqui, porque são convenção DESTE uso — o arquivo traz
 * uma ou mais colunas, cada uma começando com `COALESCE(` na coluna 0, e
 * fragmento que já venha com vírgula no fim de uma coluna não a duplica.
 */
function colunasDePendencia(arquivo) {
  return `${fragmento(arquivo).split(/\n(?=COALESCE\()/).map((coluna) => coluna.trim().replace(/,$/, '')).join(',\n')},`;
}

// Saída da Análise (spec 003, RF-022/RN-012): PENDENCIAS e PENDENCIAS_MOTIVO —
// o MESMO texto de sgcAnaliseSaidaVerificar (add-006), com {{cardId}} = C.ID.
const SQL_PENDENCIAS = colunasDePendencia('pendencias-analise.sql');
// Onda 2, spec 005 (R-030): entrada em Trânsito exige ≥ 1 nota vinculada
// (RN-012) e a conclusão, vindo de Faturamento ou de B.O., exige zero
// conferência de nota sem decisão (RN-011).
const SQL_PENDENCIAS_NF = colunasDePendencia('pendencias-transito.sql')
  + '\n' + colunasDePendencia('pendencias-conclusao-nf.sql');
// Onda 2, spec 007 (R-030): entrar em B.O. exige ≥ 1 item marcado (RN-003) e
// a conclusão exige zero item de B.O. em aberto (RN-008); os ramos de MOTIVO
// vêm depois dos da NF (R-044).
const SQL_PENDENCIAS_BO = colunasDePendencia('pendencias-bo-entrada.sql')
  + '\n' + colunasDePendencia('pendencias-conclusao-bo.sql');
// Onda 2, R-023: o quarto ramo do feed de notificações (avisos de processo),
// de backend/sql/notificacoes-avisos.sql (spec 005), sem as linhas de comentário.
const SQL_AVISOS = fragmento('notificacoes-avisos.sql');

/* ─────────────── o quadro: slug, fases, campos, automações ─────────────── */

export const SLUG_QUADRO = 'compras';
export const NOME_QUADRO = 'Compras';
export const DESCRICAO_QUADRO = 'Solicitações de compra da Benenutri, da montagem do pedido à conclusão.';
/** EM-02: cópia obrigatória em todo e-mail do pedido. */
export const COPIA_FIXA = 'compras@benenutri.com';

// F-01 — as dez fases, na ordem do funil. A CHAVE é o contrato (SGC_FASE);
// nome e cor o administrador muda no construtor sem quebrar regra nenhuma.
export const FASES = [
  { chave: 'analise', nome: 'Análise/Montagem de Pedido', cor: 'data-1', tipo: 'comum' },
  { chave: 'tecnica', nome: 'Aprovação Técnica', cor: 'data-2', tipo: 'comum' },
  { chave: 'diretoria', nome: 'Aprovação da Diretoria', cor: 'data-3', tipo: 'comum' },
  { chave: 'envio', nome: 'Envio para Indústria', cor: 'data-4', tipo: 'comum' },
  { chave: 'enviado', nome: 'Enviado para Indústria', cor: 'data-5', tipo: 'comum' },
  { chave: 'transito', nome: 'Em Trânsito para BN', cor: 'data-6', tipo: 'comum' },
  { chave: 'faturamento', nome: 'Faturamento em Andamento', cor: 'data-7', tipo: 'comum' },
  { chave: 'bo', nome: 'Produtos em B.O.', cor: 'data-8', tipo: 'comum' },
  { chave: 'concluido', nome: 'Compras Concluídas', cor: 'data-6', tipo: 'sucesso' },
  { chave: 'cancelado', nome: 'Compras Canceladas', cor: 'data-8', tipo: 'cancelado' },
];

// RN-017 / F-05 A: NENHUM campo é obrigatório e nenhum tem FASE_ID — o motor
// cobra obrigatório em qualquer direção e barraria cancelar e voltar.
export const CAMPOS = [
  { chave: 'fornecedor', label: 'Fornecedor', tipo: 'texto', noCard: true },
  { chave: 'filial', label: 'Filial', tipo: 'texto', noCard: true },
  { chave: 'valor_total', label: 'Valor total', tipo: 'moeda', noCard: true },
  {
    chave: 'prioridade',
    label: 'Prioridade',
    tipo: 'selecao',
    noCard: true,
    // R-009/C-07 B: a prioridade vive SÓ aqui — a pessoa a edita no card.
    config: {
      opcoes: [
        { valor: 'normal', label: 'Normal', cor: 'data-1' },
        { valor: 'alta', label: 'Alta', cor: 'data-4' },
        { valor: 'urgente', label: 'Urgente', cor: 'data-8' },
      ],
    },
  },
  { chave: 'alertas_pendentes', label: 'Alertas pendentes', tipo: 'numero', noCard: false },
  { chave: 'motivo_cancelamento', label: 'Motivo do cancelamento', tipo: 'texto_longo', noCard: false },
];

/** Capa por fase (KB_FASE.CAPA_JSON): o que aquela fase acrescenta aos fixos. */
export const CAPA_POR_FASE = {
  analise: ['alertas_pendentes'],
  // R-048 (spec 005): a linha de faturamento na capa, escrita pela tela e pelo cron.
  enviado: ['faturamento'],
  transito: ['faturamento'],
  faturamento: ['faturamento'],
  bo: ['faturamento'],
  cancelado: ['motivo_cancelamento'],
};

const CORPO_FASE = `<p>O pedido <strong>{{titulo}}</strong> entrou na fase <strong>{{fase}}</strong>.</p>
<p>Fornecedor: {{campo.fornecedor}}<br>Filial: {{campo.filial}}<br>
   Valor total: {{campo.valor_total}}<br>Prioridade: {{campo.prioridade}}</p>
<p>Esta é uma mensagem automática do SGC — por favor não responda.</p>`;

const CORPO_CANCELADO = `${CORPO_FASE}
<p>Motivo do cancelamento: {{campo.motivo_cancelamento}}</p>`;

// EM-03 B: o marcador `anexos` (spec 013 da lib) vira uma linha "nome — endereço"
// por anexo, ou "Nenhum anexo".
const CORPO_ANEXOS = `<p>O pedido <strong>{{titulo}}</strong> foi concluído. Anexos do pedido:</p>
<pre>{{anexos}}</pre>`;

const ASSUNTO_FASE = '[SGC] Pedido em {{fase}}: {{titulo}}';

/**
 * EM-01 A — uma automação por fase, para o administrador ajustar o texto de
 * uma etapa sem tocar em código. `faseIdPorChave` traduz a chave estável no
 * id de KB_FASE (no sandbox sai do upsert das fases; no simulador, do seed).
 */
export function automacoes(faseIdPorChave) {
  const porFase = (chave, nome, assunto, corpo) => ({
    nome,
    gatilho: { evento: 'card_movido', faseId: faseIdPorChave[chave] },
    acoes: [{ tipo: 'enviar_email', para: ['$responsavel', COPIA_FIXA], assunto, corpo }],
  });
  return [
    porFase('analise', 'E-mail: entrada em Análise/Montagem', ASSUNTO_FASE, CORPO_FASE),
    porFase('tecnica', 'E-mail: entrada em Aprovação Técnica', ASSUNTO_FASE, CORPO_FASE),
    porFase('diretoria', 'E-mail: entrada em Aprovação da Diretoria', ASSUNTO_FASE, CORPO_FASE),
    porFase('envio', 'E-mail: entrada em Envio para Indústria', ASSUNTO_FASE, CORPO_FASE),
    porFase('enviado', 'E-mail: entrada em Enviado para Indústria', ASSUNTO_FASE, CORPO_FASE),
    porFase('transito', 'E-mail: entrada em Em Trânsito para BN', ASSUNTO_FASE, CORPO_FASE),
    porFase('faturamento', 'E-mail: entrada em Faturamento em Andamento', ASSUNTO_FASE, CORPO_FASE),
    porFase('bo', 'E-mail: entrada em Produtos em B.O.', ASSUNTO_FASE, CORPO_FASE),
    porFase('concluido', 'E-mail: pedido concluído', '[SGC] Pedido concluído: {{titulo}}', CORPO_FASE),
    porFase('cancelado', 'E-mail: pedido cancelado', '[SGC] Pedido cancelado: {{titulo}}', CORPO_CANCELADO),
    // A 11ª vai só ao criador: é entrega de arquivo, não aviso de fase.
    {
      nome: 'E-mail: anexos ao criador',
      gatilho: { evento: 'card_movido', faseId: faseIdPorChave.concluido },
      acoes: [{
        tipo: 'enviar_email',
        para: ['$criador'],
        assunto: '[SGC] Anexos do pedido concluído: {{titulo}}',
        corpo: CORPO_ANEXOS,
      }],
    },
  ];
}

/* ─────────────── fragmentos de SQL usados por várias funções ─────────────── */

const aspas = (valores) => valores.map((valor) => `'${valor}'`).join(', ');

// R-013 — a persona efetiva, escrita UMA vez: sem linha em SGC_USUARIO_PERSONA
// vale o nível da plataforma (ADMIN → admin, RESTRICTED → comercial, o resto
// analista). Copiada literal pelas specs 001, 003 e 004.
const PERSONA_EFETIVA = `COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                            WHEN 'ADMIN' THEN 'admin'
                            WHEN 'RESTRICTED' THEN 'comercial'
                            ELSE 'analista' END)`;

/**
 * P-12: é esta guarda que faz a regra valer para quem chama por fora da tela.
 * `guardaPersonaDe` recebe o usuário por parâmetro porque as escritas "por id"
 * (chamadas de dentro de um JAVASCRIPT, onde `:VAR_USER` não se propaga) também
 * precisam dela: o perfil business libera todas as SFs, e sem guarda o comercial
 * gravava envio e comunicação chamando a SF direto (achado A1 da revisão).
 */
const guardaPersonaDe = (usuario, ...personas) => `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = ${usuario}
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND ${PERSONA_EFETIVA} IN (${aspas(personas)})
  )`;
const guardaPersona = (...personas) => guardaPersonaDe(':VAR_USER', ...personas);

/** Decisão que só existe numa etapa (aprovação técnica, da diretoria…). */
const guardaFase = (chave) => `EXISTS (
    SELECT 1 FROM KB_CARD C
    JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
    WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL AND F.CHAVE = '${chave}'
  )`;

/** RF-009 — as 22 transições do fluxo: 14 do funil e 8 para Canceladas. */
export const PARES = [
  'analise>tecnica', 'tecnica>diretoria', 'tecnica>analise',
  'diretoria>envio', 'diretoria>tecnica', 'diretoria>analise',
  'envio>enviado', 'envio>diretoria', 'enviado>transito',
  'transito>faturamento', 'faturamento>bo', 'faturamento>concluido',
  'bo>faturamento', 'bo>concluido',
  'analise>cancelado', 'tecnica>cancelado', 'diretoria>cancelado',
  'envio>cancelado', 'enviado>cancelado', 'transito>cancelado',
  'faturamento>cancelado', 'bo>cancelado',
];

// Os textos de recusa. São os MESMOS de frontend/src/lib/transicoes.ts
// (MOTIVOS): o teste de 500 combinações (RNF-005) compara caractere a caractere.
const M = {
  comercial: 'Seu perfil não tem acesso ao quadro de compras.',
  leitura: 'Seu acesso é somente leitura.',
  restrito: 'Seu acesso permite operar apenas os pedidos que você criou.',
  diretoria: 'Você só movimenta pedidos na fase Aprovação da Diretoria.',
  semTecnica: 'O pedido precisa passar pela Aprovação Técnica antes de ir para a Aprovação da Diretoria.',
  semTransicao: 'Esta transição não existe no fluxo de compras.',
  cancelar: 'Use a ação "Cancelar compra" para informar o motivo.',
  reprovar: 'Para devolver o pedido para análise, use a ação Reprovar e informe o motivo.',
  envio: 'Registre o envio do pedido (plataforma ou e-mail) antes de mover para Enviado para Indústria.',
  excluir: 'Excluir pedido é da gerência, da diretoria ou do administrador. Para encerrar um pedido, use "Cancelar compra".',
  // Onda 2, spec 005 (R-030/R-046): a trava é só do servidor; `transicoes.ts`
  // recebe os mesmos textos em MOTIVOS, sem ramo novo em `motivoDeDestino`.
  transito: 'Vincule ao menos uma nota fiscal ao pedido antes de mover para Em Trânsito para BN.',
  boEntrada: 'Marque ao menos um item em B.O. antes de mover o pedido para Produtos em B.O.',
};

/* ─────────────── preâmbulo das JAVASCRIPT desta spec ─────────────── */

/** Corpo de uma função JS como texto (o que a plataforma executa). */
function source(fn) {
  const texto = fn.toString();
  return texto.slice(texto.indexOf('{') + 1, texto.lastIndexOf('}')).trim();
}

const MARCADOR_IDS = '__SGC_IDS__';

// Regra da casa: nenhum `{` duplicado literal aqui dentro fora de parâmetro.
function preambulo() {
  const { runQueryMitra, executeServerFunctionMitra, sendEmailMitra } = require('mitra-sdk');
  // Ids das SF chamadas por id, trocados na publicação.
  const IDS = __SGC_IDS__;
  const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);

  function linhasDe(resposta) {
    let saida = resposta?.result ?? resposta;
    if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { return []; } }
    if (saida?.output) saida = saida.output;
    if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { return []; } }
    return saida?.rows ?? saida?.result?.rows ?? saida?.result ?? [];
  }
  async function query(sql) { return linhasDe(await runQueryMitra({ projectId, sql })); }

  // Escrever passa por server function SQL, nunca por runDml (business leva
  // BUSINESS_ACCESS_DENIED). Valores crus: a plataforma liga cada parâmetro.
  async function escrever(nome, params) {
    const serverFunctionId = IDS[nome];
    if (!serverFunctionId) throw new Error('Server function não publicada: ' + nome);
    const resposta = await executeServerFunctionMitra({ projectId, serverFunctionId, input: params || {} });
    const resultado = resposta?.result ?? resposta;
    if (resultado?.executionStatus === 'FAILED') throw new Error('Falha em ' + nome + ': ' + (resultado.error || 'sem detalhe'));
    return resultado?.output;
  }

  const agora = () => new Date().toISOString().slice(0, 19);
  const limpar = (valor, max) => String(valor ?? '').trim().slice(0, max || 500);
  // Para SELECT montado em texto; as escritas NÃO escapam (parâmetro ligado).
  const esc = (valor, max) => limpar(valor, max).replace(/\\/g, '\\\\').replace(/'/g, "''");
  const inteiro = (valor) => { const n = Number(valor); return Number.isFinite(n) ? Math.trunc(n) : 0; };
  const recusar = (error) => ({ ok: false, error });
}

const corpo = (fn) => `${source(preambulo)}\n\n${source(fn)}`;
const injetarIds = (code, ids) => code.split(MARCADOR_IDS).join(JSON.stringify(ids));

/* ─────────────── as 22 server functions ─────────────── */

export function montarDefinitions(ids = {}) {
  /* ── leituras SQL (7201–7204, 7208–7210) ── */

  const leituras = [
    {
      name: 'sgcPersonaAtual',
      type: 'SQL',
      description: 'RF-012 - usuario da sessao com a persona efetiva (RN-001: sem linha vale o nivel da plataforma). Sem parametros.',
      code: `SELECT IU.ID AS USUARIO_ID, IU.NOME, IU.DESCR AS EMAIL,
  COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS ACCESS_LEVEL,
  ${PERSONA_EFETIVA} AS PERSONA
FROM INT_USER IU
LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
WHERE IU.ID = :VAR_USER
LIMIT 1`,
    },
    {
      name: 'sgcPersonasListar',
      type: 'SQL',
      description: 'RF-030 - usuarios ativos da plataforma com a persona atribuida (vazia quando nao ha linha). Params: busca (vazio=todos), limite, offset.',
      code: `SELECT IU.ID AS USUARIO_ID, IU.NOME, IU.DESCR AS EMAIL,
  COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS ACCESS_LEVEL,
  COALESCE(UP.PERSONA, '') AS PERSONA
FROM INT_USER IU
LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
WHERE IU.ATIVO = TRUE
  AND ('{{busca}}' = '' OR IU.NOME LIKE CONCAT('%', '{{busca}}', '%') OR IU.DESCR LIKE CONCAT('%', '{{busca}}', '%'))
ORDER BY IU.NOME, IU.ID
LIMIT {{limite}} OFFSET {{offset}}`,
    },
    {
      name: 'sgcPersonasListarTotal',
      type: 'SQL',
      description: 'RF-030/RNF-003 - total da listagem de personas. Params: busca.',
      code: `SELECT COUNT(*) AS TOTAL
FROM INT_USER IU
WHERE IU.ATIVO = TRUE
  AND ('{{busca}}' = '' OR IU.NOME LIKE CONCAT('%', '{{busca}}', '%') OR IU.DESCR LIKE CONCAT('%', '{{busca}}', '%'))`,
    },
    {
      name: 'sgcFasesListar',
      type: 'SQL',
      description: 'RF-005 - tradutor CHAVE estavel -> KB_FASE (nome e cor que o administrador edita). Params: boardId (0=todos).',
      code: `SELECT SF.CHAVE, SF.FASE_ID, KF.NOME, KF.ORDEM, KF.TIPO, COALESCE(KF.COR, '') AS COR
FROM SGC_FASE SF
JOIN KB_FASE KF ON KF.ID = SF.FASE_ID
WHERE ({{boardId}} = 0 OR SF.BOARD_ID = {{boardId}})
ORDER BY KF.ORDEM, SF.ID`,
    },
    {
      name: 'sgcComunicacoesListar',
      type: 'SQL',
      description: 'RF-023 - envios do pedido a industria (e-mail e plataforma). Params: cardId, limite, offset.',
      code: `SELECT CO.ID, CO.TIPO, CO.PARA, CO.CC, CO.ASSUNTO, CO.ENVIADO_POR,
  COALESCE(IU.NOME, '') AS ENVIADO_NOME, CO.ENVIADO_EM
FROM SGC_COMUNICACAO CO
LEFT JOIN INT_USER IU ON IU.ID = CO.ENVIADO_POR
WHERE CO.ID_CARD = {{cardId}}
ORDER BY CO.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`,
    },
    {
      name: 'sgcNotificacoesListar',
      type: 'SQL',
      description: 'RF-029 - responsavel novo, pedido movido e mensagem nova nos pedidos de quem chama (:VAR_USER). Params: limite, offset.',
      code: `SELECT N.TIPO, N.CARD_ID, N.TITULO, N.QUEM, N.TEXTO, N.QUANDO
FROM (${notificacoesUniao()}) N
ORDER BY N.QUANDO DESC, N.CARD_ID DESC
LIMIT {{limite}} OFFSET {{offset}}`,
    },
    {
      name: 'sgcNotificacoesListarTotal',
      type: 'SQL',
      description: 'RF-029/RNF-003 - total do feed de notificacoes de quem chama. Sem parametros.',
      code: `SELECT COUNT(*) AS TOTAL
FROM (${notificacoesUniao()}) N`,
    },
  ];

  /* ── regras ligadas (7206, 7207) ── */

  const ganchos = [
    {
      name: 'sgcPodeMover',
      type: 'SQL',
      description: 'RF-009/RF-011/RNF-004 - regra ligada gancho:podeMover (spec 013 da lib): uma linha PODE/MOTIVO. Params: usuarioId, cardId, boardId, faseId.',
      code: sqlPodeMover(),
    },
    {
      name: 'sgcPodeExcluir',
      type: 'SQL',
      description: 'RF-027 - regra ligada gancho:podeExcluir: excluir pedido e de admin, gestor e diretoria. Params: usuarioId, cardId, boardId, faseId (0).',
      code: sqlPodeExcluir(),
    },
  ];

  /* ── escritas SQL (7250–7260) ── */

  const escritas = [
    {
      name: 'sgcEscPedidoCriar',
      type: 'SQL',
      description: 'RF-001 - capa do pedido criado pela TELA (:VAR_USER), depois de kbCardCriar. Idempotente por ID_CARD. Params: cardId, codfornec, fornecedor, codfilial, filial, periodoInicio, periodoFim, agora.',
      code: `INSERT INTO SGC_PEDIDO
  (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{cardId}}, {{codfornec}}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}',
  '{{periodoInicio}}', '{{periodoFim}}', 'manual', 0, :VAR_USER, '{{agora}}', '{{agora}}'
FROM DUAL
WHERE TRIM('{{fornecedor}}') <> '' AND TRIM('{{filial}}') <> ''
  AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO EX WHERE EX.ID_CARD = {{cardId}})
  AND ${guardaPersona('admin', 'analista', 'gestor')}`,
    },
    {
      name: 'sgcEscPedidoTecnicaAprovar',
      type: 'SQL',
      description: 'RF-013 (AT-02) - grava quem/quando da aprovacao tecnica e limpa a reprovacao anterior. Params: cardId, agora.',
      code: `UPDATE SGC_PEDIDO SET
  TEC_POR = :VAR_USER, TEC_EM = '{{agora}}',
  TEC_MOTIVO = '', TEC_PRODUTOS_REPROVADOS = '',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}}
  AND ${guardaPersona('admin', 'gestor')}
  AND ${guardaFase('tecnica')}`,
    },
    {
      name: 'sgcEscPedidoTecnicaReprovar',
      type: 'SQL',
      description: 'RF-014 (AT-03) - reprovacao tecnica com motivo obrigatorio e os codigos dos produtos reprovados. Params: cardId, motivo, produtos, agora.',
      code: `UPDATE SGC_PEDIDO SET
  TEC_MOTIVO = '{{motivo}}', TEC_PRODUTOS_REPROVADOS = '{{produtos}}',
  TEC_POR = NULL, TEC_EM = '',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND TRIM('{{motivo}}') <> ''
  AND ${guardaPersona('admin', 'gestor')}
  AND ${guardaFase('tecnica')}`,
    },
    {
      name: 'sgcEscPedidoDiretoriaAprovar',
      type: 'SQL',
      description: 'RF-016 - grava quem/quando da aprovacao da diretoria e limpa a reprovacao dela. Params: cardId, agora.',
      code: `UPDATE SGC_PEDIDO SET
  DIR_POR = :VAR_USER, DIR_EM = '{{agora}}',
  DIR_MOTIVO = '',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}}
  AND ${guardaPersona('admin', 'diretoria')}
  AND ${guardaFase('diretoria')}`,
    },
    {
      name: 'sgcEscPedidoDiretoriaReprovar',
      type: 'SQL',
      description: 'RF-017 - reprovacao da diretoria, motivo obrigatorio e guardado separado do motivo da gerencia. Params: cardId, motivo, agora.',
      code: `UPDATE SGC_PEDIDO SET
  DIR_MOTIVO = '{{motivo}}',
  DIR_POR = NULL, DIR_EM = '',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND TRIM('{{motivo}}') <> ''
  AND ${guardaPersona('admin', 'diretoria')}
  AND ${guardaFase('diretoria')}`,
    },
    {
      name: 'sgcEscPedidoCancelar',
      type: 'SQL',
      description: 'RF-019 (CA-02) - cancelamento de qualquer fase ativa, motivo obrigatorio; a diretoria so cancela na fase dela (D-011). Params: cardId, motivo, agora.',
      code: `UPDATE SGC_PEDIDO SET
  CANC_MOTIVO = '{{motivo}}', CANC_POR = :VAR_USER, CANC_EM = '{{agora}}',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND TRIM('{{motivo}}') <> ''
  AND ${guardaPersona('admin', 'analista', 'gestor', 'diretoria')}
  AND EXISTS (
    SELECT 1 FROM KB_CARD C
    JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
    WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL
      AND F.CHAVE NOT IN ('concluido', 'cancelado')
      AND (F.CHAVE = 'diretoria' OR NOT EXISTS (
        SELECT 1 FROM SGC_USUARIO_PERSONA UD
        WHERE UD.USUARIO_ID = :VAR_USER AND UD.PERSONA = 'diretoria'))
  )`,
    },
    {
      name: 'sgcEscPedidoReprovacoesLimpar',
      type: 'SQL',
      description: 'RF-015 (R-011) - apaga as reprovacoes ao sair de novo da Analise. Chamada POR ID pelo sgcAnaliseSair (003), sem :VAR_USER: a guarda cai sobre o usuarioId recebido. Params: usuarioId, idCard.',
      code: `UPDATE SGC_PEDIDO SET
  TEC_MOTIVO = '', TEC_PRODUTOS_REPROVADOS = '', DIR_MOTIVO = ''
WHERE ID_CARD = {{idCard}} AND {{usuarioId}} > 0
  AND ${guardaPersonaDe('{{usuarioId}}', 'admin', 'analista', 'gestor')}`,
    },
    {
      name: 'sgcEscPedidoEnvio',
      type: 'SQL',
      description: 'RF-020 - registro do envio a industria. Chamada POR ID pelo sgcEnvioIndustriaRegistrar (que ja conferiu a persona) e guardada de novo aqui pelo enviadoPor. Params: cardId, canal, email, dtEnvio, numped, obs, enviadoPor, agora.',
      code: `UPDATE SGC_PEDIDO SET
  DT_ENVIO = '{{dtEnvio}}', CANAL = '{{canal}}', EMAIL_ENVIO = '{{email}}',
  NUMPED_WINTHOR = '{{numped}}', ENVIO_OBS = '{{obs}}',
  ENVIO_POR = {{enviadoPor}}, ENVIO_EM = '{{agora}}',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND TRIM('{{dtEnvio}}') <> '' AND TRIM('{{numped}}') <> ''
  AND ${guardaPersonaDe('{{enviadoPor}}', 'admin', 'analista', 'gestor')}`,
    },
    {
      name: 'sgcEscComunicacaoInserir',
      type: 'SQL',
      description: 'RF-023 (EN-06 B) - registra a comunicacao enviada ao fornecedor. Chamada POR ID pelo sgcEnvioIndustriaRegistrar e guardada pelo enviadoPor. Params: cardId, tipo, para, cc, assunto, corpo, enviadoPor, enviadoEm.',
      code: `INSERT INTO SGC_COMUNICACAO (ID_CARD, TIPO, PARA, CC, ASSUNTO, CORPO, ENVIADO_POR, ENVIADO_EM)
SELECT {{cardId}}, '{{tipo}}', '{{para}}', '{{cc}}', '{{assunto}}', '{{corpo}}', {{enviadoPor}}, '{{enviadoEm}}'
FROM DUAL
WHERE {{cardId}} > 0 AND TRIM('{{tipo}}') <> ''
  AND ${guardaPersonaDe('{{enviadoPor}}', 'admin', 'analista', 'gestor')}`,
    },
    {
      name: 'sgcEscPersonaSalvar',
      type: 'SQL',
      description: 'RF-030 (P-13) - atribui a persona de um usuario (upsert). So admin e diretoria. Params: usuarioAlvo, persona, agora.',
      code: `INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{usuarioAlvo}}, '{{persona}}', :VAR_USER, '{{agora}}'
FROM DUAL
WHERE '{{persona}}' IN ('admin', 'analista', 'gestor', 'diretoria', 'comercial')
  AND ${guardaPersona('admin', 'diretoria')}
ON DUPLICATE KEY UPDATE PERSONA = VALUES(PERSONA), ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`,
    },
    {
      name: 'sgcEscPedidoCapaInserir',
      type: 'SQL',
      description: 'RF-001 (R-010) - capa do pedido criado pelo CRON da agenda (sem sessao): recebe usuarioId cru. Idempotente por ID_CARD. Params: usuarioId, cardId, codfornec, fornecedor, codfilial, filial, periodoInicio, periodoFim, origem, idAgenda, agora.',
      code: `INSERT INTO SGC_PEDIDO
  (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{cardId}}, {{codfornec}}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}',
  '{{periodoInicio}}', '{{periodoFim}}', '{{origem}}', {{idAgenda}}, {{usuarioId}}, '{{agora}}', '{{agora}}'
FROM DUAL
WHERE {{usuarioId}} > 0 AND TRIM('{{fornecedor}}') <> '' AND TRIM('{{filial}}') <> ''
  AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO EX WHERE EX.ID_CARD = {{cardId}})`,
    },
  ];

  /* ── JAVASCRIPT (7205, 7211) ── */

  const javascript = [
    {
      name: 'sgcPedidoCarregar',
      type: 'JAVASCRIPT',
      description: 'RF-006/RNF-001 - capa, itens e alertas do pedido numa execucao (contrato fechado com a spec 003: o alerta liga por CODPROD). Params: cardId.',
      code: corpo(async function sgcPedidoCarregar() {
        const cardId = inteiro(event.cardId);
        if (!cardId) return recusar('Informe o pedido.');
        const [pedido] = await query(`SELECT P.*,
  COALESCE(UT.NOME, '') AS TEC_NOME, COALESCE(UD.NOME, '') AS DIR_NOME,
  COALESCE(UC.NOME, '') AS CANC_NOME, COALESCE(UE.NOME, '') AS ENVIO_NOME
FROM SGC_PEDIDO P
LEFT JOIN INT_USER UT ON UT.ID = P.TEC_POR
LEFT JOIN INT_USER UD ON UD.ID = P.DIR_POR
LEFT JOIN INT_USER UC ON UC.ID = P.CANC_POR
LEFT JOIN INT_USER UE ON UE.ID = P.ENVIO_POR
WHERE P.ID_CARD = ${cardId} LIMIT 1`);
        // Colunas fechadas com a 003: a tela não paga o que não usa.
        const itens = await query(`SELECT ID, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC,
  UN_POR_CAIXA, QT_VENDA_TOTAL, QT_VENDA_LICITACAO, QT_ESTOQUE, QT_TRANSITO,
  QT_SUGERIDA, QT_PEDIDA, PRECO_CUSTO, TIPO_PRECO, CURVA_ABC,
  COBERTURA_DIAS, COBERTURA_LIMITE, COBERTURA_JUSTIFICATIVA, OBSERVACAO, STATUS
FROM SGC_PEDIDO_ITEM
WHERE ID_CARD = ${cardId} AND COALESCE(STATUS, '') <> 'removido'
ORDER BY ID`);
        const alertas = await query(`SELECT ID, CODPROD, TIPO, MENSAGEM, LIDO, LIDO_POR, LIDO_EM, JUSTIFICATIVA
FROM SGC_ALERTA
WHERE ID_CARD = ${cardId}
ORDER BY ID`);
        return { ok: true, pedido: pedido || null, itens, alertas };
      }),
    },
    {
      name: 'sgcEnvioIndustriaRegistrar',
      type: 'JAVASCRIPT',
      description: 'RF-020/RF-021/RF-023/RF-024 (EN-01..EN-06) - confere persona e fase, envia o e-mail com a copia fixa, grava a comunicacao e o envio, sincroniza a agenda de origem e registra a nota. Params: cardId, canal, para, assunto, corpo, dtEnvio, numped, obs.',
      code: corpo(async function sgcEnvioIndustriaRegistrar() {
        const cardId = inteiro(event.cardId);
        const canal = limpar(event.canal, 20);
        const dtEnvio = limpar(event.dtEnvio, 10);
        const numped = limpar(event.numped, 30);
        const para = limpar(event.para, 255).toLowerCase();

        // 1. Uma consulta resolve sessão, persona efetiva, fase, agenda e quadro.
        const [ctx] = await query(`SELECT IU.ID AS USUARIO_ID, IU.NOME AS USUARIO_NOME,
  COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS ACESSO,
  COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                         WHEN 'ADMIN' THEN 'admin'
                         WHEN 'RESTRICTED' THEN 'comercial'
                         ELSE 'analista' END) AS PERSONA,
  COALESCE(F.CHAVE, '') AS FASE, COALESCE(P.ID_AGENDA, 0) AS ID_AGENDA
FROM INT_USER IU
LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
LEFT JOIN KB_CARD C ON C.ID = ${cardId} AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
WHERE IU.ID = :VAR_USER LIMIT 1`);
        if (!ctx || !inteiro(ctx.USUARIO_ID)) return recusar('Sessão inválida.');
        if (ctx.ACESSO === 'READ_ONLY') return recusar('Seu acesso é somente leitura.');
        if (['admin', 'analista', 'gestor'].indexOf(String(ctx.PERSONA)) === -1) {
          return recusar('Seu perfil não registra o envio do pedido à indústria.');
        }
        if (ctx.FASE !== 'envio') return recusar('O pedido precisa estar em Envio para Indústria.');
        if (canal !== 'email' && canal !== 'plataforma') return recusar('Escolha o canal do envio: e-mail ou plataforma.');
        if (!dtEnvio) return recusar('Informe a data de envio.');
        if (!numped) return recusar('Informe o número do pedido no ERP.');
        if (canal === 'email' && !para.includes('@')) return recusar('Escolha um contato de envio do fornecedor.');

        // 2. EM-02: a cópia fixa entra aqui e nunca duplica o destinatário.
        const destinatarios = canal === 'email'
          ? [para, 'compras@benenutri.com'].filter((email, indice, lista) => lista.indexOf(email) === indice)
          : [];
        if (destinatarios.length) {
          await sendEmailMitra({
            projectId,
            to: destinatarios,
            subject: limpar(event.assunto, 255) || ('Pedido de compra ' + numped),
            body: String(event.corpo ?? ''),
          });
        }

        // 3 e 4. Comunicação e capa do envio — escritas por id, já conferidas.
        const enviadoEm = agora();
        await escrever('sgcEscComunicacaoInserir', {
          cardId, tipo: canal, para: canal === 'email' ? para : limpar(event.para, 255),
          cc: canal === 'email' ? 'compras@benenutri.com' : '',
          assunto: limpar(event.assunto, 255), corpo: String(event.corpo ?? '').slice(0, 20000),
          enviadoPor: inteiro(ctx.USUARIO_ID), enviadoEm,
        });
        await escrever('sgcEscPedidoEnvio', {
          cardId, canal, email: canal === 'email' ? para : '', dtEnvio, numped,
          obs: limpar(event.obs, 1000), enviadoPor: inteiro(ctx.USUARIO_ID), agora: enviadoEm,
        });
        const [ultima] = await query(`SELECT MAX(ID) AS ID FROM SGC_COMUNICACAO WHERE ID_CARD = ${cardId}`);

        // 5. EN-05 A / R-012: a agenda de origem guarda planejado x real. O passo
        // é opcional — sem a spec 004 publicada, o envio fecha do mesmo jeito.
        let agendaSincronizada = false;
        if (inteiro(ctx.ID_AGENDA) > 0 && IDS.sgcEscAgendaEnvio) {
          try {
            await escrever('sgcEscAgendaEnvio', { idCard: cardId, dtEnvio, usuarioId: inteiro(ctx.USUARIO_ID) });
            agendaSincronizada = true;
          } catch (erro) {
            agendaSincronizada = false;
          }
        }

        // 6. RF-031: a decisão vira linha no histórico do pedido.
        if (IDS.kbNotaRegistrar) {
          const nota = canal === 'email'
            ? 'Pedido enviado por e-mail para ' + para
            : 'Pedido enviado pela plataforma do fornecedor';
          try {
            // `usuarioId` só vale sem sessão (contrato da lib); com sessão, quem
            // assina é quem está logado — o mesmo usuário nos dois casos.
            await escrever('kbNotaRegistrar', { cardId, texto: nota + ' (pedido ' + numped + ')', usuarioId: inteiro(ctx.USUARIO_ID) });
          } catch (erro) {
            // Nota é registro, não a ação: o envio já aconteceu.
          }
        }

        return {
          ok: true,
          comunicacaoId: inteiro(ultima && ultima.ID),
          destinatarios,
          agendaSincronizada,
        };
      }),
    },
  ];

  return [...leituras, ...ganchos, ...escritas, ...javascript].map((definicao) => (
    definicao.type === 'JAVASCRIPT' ? { ...definicao, code: injetarIds(definicao.code, ids) } : definicao
  ));
}

/* ─────────────── SQL das regras ligadas e do feed ─────────────── */

/**
 * D-015 — o feed sai de KB_LOG, KB_MOVIMENTO e KB_MENSAGEM, restrito aos
 * cards em que quem chama é responsável, e sem tabela, escrita ou gatilho novo.
 * A própria pessoa não se notifica, e a entrada do card na primeira fase
 * (`DE_FASE_ID IS NULL`) não é movimentação: é a criação.
 */
function notificacoesUniao() {
  return `
  SELECT 'responsavel' AS TIPO, L.CARD_ID AS CARD_ID, CD.TITULO AS TITULO,
    COALESCE(IU.NOME, '') AS QUEM, 'Responsáveis do pedido mudaram' AS TEXTO, L.QUANDO AS QUANDO
  FROM KB_LOG L
  JOIN KB_CARD CD ON CD.ID = L.CARD_ID AND CD.EXCLUIDO_EM IS NULL
  JOIN KB_CARD_RESPONSAVEL R ON R.CARD_ID = L.CARD_ID AND R.USUARIO_ID = :VAR_USER
  LEFT JOIN INT_USER IU ON IU.ID = L.USUARIO_ID
  WHERE L.EVENTO = 'campo_alterado' AND L.DETALHE LIKE '%$responsavel%'
    AND COALESCE(L.USUARIO_ID, 0) <> :VAR_USER
  UNION ALL
  SELECT 'movimento', M.CARD_ID, CD.TITULO,
    COALESCE(IU.NOME, ''), CONCAT('Movido para ', COALESCE(KF.NOME, '')), M.QUANDO
  FROM KB_MOVIMENTO M
  JOIN KB_CARD CD ON CD.ID = M.CARD_ID AND CD.EXCLUIDO_EM IS NULL
  JOIN KB_CARD_RESPONSAVEL R ON R.CARD_ID = M.CARD_ID AND R.USUARIO_ID = :VAR_USER
  LEFT JOIN KB_FASE KF ON KF.ID = M.PARA_FASE_ID
  LEFT JOIN INT_USER IU ON IU.ID = M.USUARIO_ID
  WHERE M.DE_FASE_ID IS NOT NULL AND COALESCE(M.USUARIO_ID, 0) <> :VAR_USER
  UNION ALL
  SELECT 'mensagem', G.CARD_ID, CD.TITULO,
    COALESCE(IU.NOME, COALESCE(G.AUTOR_NOME, '')), G.CONTEUDO, G.CRIADO_EM
  FROM KB_MENSAGEM G
  JOIN KB_CARD CD ON CD.ID = G.CARD_ID AND CD.EXCLUIDO_EM IS NULL
  JOIN KB_CARD_RESPONSAVEL R ON R.CARD_ID = G.CARD_ID AND R.USUARIO_ID = :VAR_USER
  LEFT JOIN INT_USER IU ON IU.ID = G.USUARIO_ID
  WHERE G.EXCLUIDO_EM IS NULL AND COALESCE(G.USUARIO_ID, 0) <> :VAR_USER
  UNION ALL
  ${SQL_AVISOS}`;
}

/**
 * A subconsulta que traduz TUDO para chaves estáveis: persona efetiva, nível de
 * acesso, criador, fase de origem, fase de destino e o estado do pedido.
 * `pendencias` = true acrescenta o bloco reservado à spec 003.
 */
function contextoDoCard({ comDestino = true, comPendencias = true } = {}) {
  const destino = comDestino
    ? `COALESCE(FD.CHAVE, '')                                        AS DESTINO,
    CONCAT(COALESCE(FO.CHAVE, ''), '>', COALESCE(FD.CHAVE, ''))   AS PAR,`
    : '';
  // ── saída da Análise — bloco reservado à spec 003 ──────────────────────
  // Duas colunas, uma subconsulta cada. Hoje: alerta não lido e uma frase
  // genérica. A 003 substitui ESTE bloco (e só ele) pelo corpo de
  // `sgcAnaliseSaidaVerificar` com {{cardId}} = C.ID: `PODE = 0` vira
  // `PENDENCIAS = 1` e a coluna `MOTIVO` de lá vira `PENDENCIAS_MOTIVO` aqui
  // (alertas lidos, justificativa de item alertado, cobertura acima do limite,
  // prazo divergente e pelo menos um item com quantidade — AL-04, AL-05,
  // AL-06, PZ-03, R-008). A tela chama a mesma SF pelo `antesDeMover` (dentro
  // do `sgcAnaliseSair`), então a frase é a mesma nos dois lugares.
  // Integrado (S4): o corpo real vem de backend/sql/pendencias-analise.sql.
  // ── entrada em Trânsito e conclusão — bloco da spec 005 (R-030) ────────
  // Duas colunas cada, no mesmo formato: PENDENCIAS_TRANSITO(_MOTIVO) e
  // PENDENCIAS_NF(_MOTIVO), de backend/sql/pendencias-transito.sql e
  // pendencias-conclusao-nf.sql. A 007 acrescenta aqui o par
  // PENDENCIAS_BO_ABERTOS/PENDENCIAS_BO_MOTIVO.
  const pendencias = comPendencias ? `${SQL_PENDENCIAS}\n${SQL_PENDENCIAS_NF}\n${SQL_PENDENCIAS_BO}` : '';
  const juncaoDestino = comDestino
    ? 'LEFT JOIN SGC_FASE FD              ON FD.BOARD_ID = {{boardId}} AND FD.FASE_ID = {{faseId}}'
    : '';
  return `SELECT
    ${PERSONA_EFETIVA} AS PERSONA,
    COALESCE(IU.ACCESS_LEVEL, 'MEMBER')                           AS ACESSO,
    COALESCE(C.CRIADO_POR, 0)                                     AS CRIADO_POR,
    COALESCE(FO.CHAVE, '')                                        AS ORIGEM,
    ${destino}
    COALESCE(P.CANC_MOTIVO, '')                                   AS CANC_MOTIVO,
    COALESCE(P.TEC_MOTIVO, '')                                    AS TEC_MOTIVO,
    COALESCE(P.DIR_MOTIVO, '')                                    AS DIR_MOTIVO,
    COALESCE(P.DT_ENVIO, '')                                      AS DT_ENVIO,
    ${pendencias}
    COALESCE(P.NUMPED_WINTHOR, '')                                AS NUMPED
  FROM KB_CARD C
  LEFT JOIN INT_USER IU              ON IU.ID = {{usuarioId}}
  LEFT JOIN SGC_USUARIO_PERSONA UP   ON UP.USUARIO_ID = {{usuarioId}}
  LEFT JOIN SGC_FASE FO              ON FO.BOARD_ID = C.BOARD_ID AND FO.FASE_ID = C.FASE_ID
  ${juncaoDestino}
  LEFT JOIN SGC_PEDIDO P             ON P.ID_CARD = C.ID
  WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL`;
}

function sqlPodeMover() {
  // A ordem do CASE é a ordem em que a regra recusa — e é a MESMA de
  // `motivoDeDestino` em frontend/src/lib/transicoes.ts (D-002).
  const pode = `CASE
    WHEN T.PERSONA = 'comercial'                                                  THEN 0
    WHEN T.ACESSO = 'READ_ONLY'                                                   THEN 0
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}                THEN 0
    WHEN T.PERSONA = 'diretoria' AND T.ORIGEM <> 'diretoria'                      THEN 0
    WHEN T.PAR NOT IN (${aspas(PARES)})                                           THEN 0
    WHEN T.DESTINO = 'cancelado'      AND T.CANC_MOTIVO = ''                      THEN 0
    WHEN T.PAR = 'tecnica>analise'    AND T.TEC_MOTIVO = ''                       THEN 0
    WHEN T.PAR = 'diretoria>analise'  AND T.DIR_MOTIVO = ''                       THEN 0
    WHEN T.PAR = 'envio>enviado'      AND (T.DT_ENVIO = '' OR T.NUMPED = '')      THEN 0
    WHEN T.PAR = 'analise>tecnica'    AND T.PENDENCIAS > 0                        THEN 0
    WHEN T.PAR = 'enviado>transito'   AND T.PENDENCIAS_TRANSITO > 0               THEN 0
    WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_NF > 0 THEN 0
    WHEN T.PAR = 'faturamento>bo'     AND T.PENDENCIAS_BO_ENTRADA > 0             THEN 0
    WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0 THEN 0
    ELSE 1
  END`;
  // R-020 / C-06: o contrato da lib exige MOTIVO vazio quando PODE = 1 (a regra
  // de tela compara com `null`). Por isso o CASE inteiro vive dentro da guarda
  // `<expressão do PODE> = 1 THEN ''` — sem ela, um destino liberado sairia com
  // a frase do último ramo (ex.: `analise>tecnica` sem pendência).
  const motivo = `CASE WHEN (${pode}) = 1 THEN '' ELSE CASE
    WHEN T.PERSONA = 'comercial'
      THEN '${M.comercial}'
    WHEN T.ACESSO = 'READ_ONLY'
      THEN '${M.leitura}'
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}
      THEN '${M.restrito}'
    WHEN T.PERSONA = 'diretoria' AND T.ORIGEM <> 'diretoria'
      THEN '${M.diretoria}'
    WHEN T.PAR IN ('analise>diretoria')
      THEN '${M.semTecnica}'
    WHEN T.PAR NOT IN (${aspas(PARES)})
      THEN '${M.semTransicao}'
    WHEN T.DESTINO = 'cancelado' AND T.CANC_MOTIVO = ''
      THEN '${M.cancelar}'
    WHEN T.PAR IN ('tecnica>analise', 'diretoria>analise')
      THEN '${M.reprovar}'
    WHEN T.PAR = 'envio>enviado'
      THEN '${M.envio}'
    WHEN T.PAR = 'analise>tecnica'
      THEN T.PENDENCIAS_MOTIVO
    WHEN T.PAR = 'enviado>transito' AND T.PENDENCIAS_TRANSITO > 0
      THEN T.PENDENCIAS_TRANSITO_MOTIVO
    WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_NF > 0
      THEN T.PENDENCIAS_NF_MOTIVO
    WHEN T.PAR = 'faturamento>bo' AND T.PENDENCIAS_BO_ENTRADA > 0
      THEN '${M.boEntrada}'
    WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0
      THEN T.PENDENCIAS_BO_MOTIVO
    ELSE ''
  END END`;
  return `SELECT
  ${pode} AS PODE,
  ${motivo} AS MOTIVO
FROM (
  ${contextoDoCard()}
) T`;
}

function sqlPodeExcluir() {
  // P-09/P-11: o gancho SUBSTITUI a regra "criador ou administrador" do motor —
  // gestor e diretoria excluem qualquer pedido, analista não exclui nem o próprio.
  // RESTRICTED vale como vale no mover (P-08 B, R-02).
  const pode = `CASE
    WHEN T.PERSONA = 'comercial'                                    THEN 0
    WHEN T.ACESSO = 'READ_ONLY'                                     THEN 0
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}  THEN 0
    WHEN T.PERSONA IN ('admin', 'gestor', 'diretoria')              THEN 1
    ELSE 0
  END`;
  const motivo = `CASE WHEN (${pode}) = 1 THEN '' ELSE CASE
    WHEN T.PERSONA = 'comercial' THEN '${M.comercial}'
    WHEN T.ACESSO = 'READ_ONLY' THEN '${M.leitura}'
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}
      THEN '${M.restrito}'
    WHEN T.PERSONA NOT IN ('admin', 'gestor', 'diretoria')
      THEN '${M.excluir}'
    ELSE ''
  END END`;
  return `SELECT
  ${pode} AS PODE,
  ${motivo} AS MOTIVO
FROM (
  ${contextoDoCard({ comDestino: false, comPendencias: false })}
) T`;
}

/* ─────────────── definitions (ids locais do mapa) ─────────────── */

export const definitions = montarDefinitions(idsDoMapa(MAPA));

/* ─────────────── publicação (só no sandbox) ─────────────── */

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

const idDaFuncao = (item) => item?.id ?? item?.serverFunctionId ?? item?.result?.serverFunctionId ?? item?.result?.id;

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const sdk = await import('mitra-sdk');
  sdk.configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  const projectId = Number(process.env.MITRA_PROJECT_ID);

  const linhas = async (sql) => {
    const resposta = await sdk.runQueryMitra({ projectId, sql });
    const saida = resposta?.result ?? resposta;
    return saida?.rows ?? saida?.result ?? saida ?? [];
  };
  const um = async (sql) => (await linhas(sql))[0] || null;
  const texto = (valor) => String(valor ?? '').replace(/'/g, "''");

  /* 1. quadro `compras` (upsert por slug) */
  let board = await um(`SELECT ID FROM KB_BOARD WHERE SLUG = '${SLUG_QUADRO}' LIMIT 1`);
  if (!board) {
    const agora = new Date().toISOString().slice(0, 19);
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_BOARD (NOME, SLUG, DESCRICAO, ADMINS_IDS, ATIVO, CRIADO_EM, ATUALIZADO_EM)
VALUES ('${NOME_QUADRO}', '${SLUG_QUADRO}', '${texto(DESCRICAO_QUADRO)}', '', TRUE, '${agora}', '${agora}')`,
    });
    board = await um(`SELECT ID FROM KB_BOARD WHERE SLUG = '${SLUG_QUADRO}' LIMIT 1`);
  }
  const boardId = Number(board.ID);
  console.log(`Quadro ${SLUG_QUADRO}: id ${boardId}`);

  /* 2. as 10 fases + SGC_FASE (idempotente nas duas pontas, por CHAVE) */
  const faseIdPorChave = {};
  for (let i = 0; i < FASES.length; i += 1) {
    const fase = FASES[i];
    const ja = await um(`SELECT FASE_ID FROM SGC_FASE WHERE BOARD_ID = ${boardId} AND CHAVE = '${fase.chave}' LIMIT 1`);
    if (ja) {
      faseIdPorChave[fase.chave] = Number(ja.FASE_ID);
      continue;
    }
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_FASE (BOARD_ID, NOME, COR, ORDEM, TIPO, SLA_HORAS, ATIVO)
VALUES (${boardId}, '${texto(fase.nome)}', '${fase.cor}', ${i + 1}, '${fase.tipo}', 0, TRUE)`,
    });
    const criada = await um(`SELECT ID FROM KB_FASE WHERE BOARD_ID = ${boardId} AND NOME = '${texto(fase.nome)}' ORDER BY ID DESC LIMIT 1`);
    faseIdPorChave[fase.chave] = Number(criada.ID);
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO SGC_FASE (BOARD_ID, CHAVE, FASE_ID, ORDEM) VALUES (${boardId}, '${fase.chave}', ${faseIdPorChave[fase.chave]}, ${i + 1})`,
    });
  }
  console.log(`  ${FASES.length} fases garantidas (por chave em SGC_FASE)`);

  /* 3. capa por fase (KB_FASE.CAPA_JSON) */
  for (const [chave, capa] of Object.entries(CAPA_POR_FASE)) {
    await sdk.runDmlMitra({
      projectId,
      sql: `UPDATE KB_FASE SET CAPA_JSON = '${texto(JSON.stringify(capa))}' WHERE ID = ${faseIdPorChave[chave]}`,
    });
  }

  /* 4. os 6 campos — nenhum obrigatório, nenhum de fase (RN-017) */
  for (let i = 0; i < CAMPOS.length; i += 1) {
    const campo = CAMPOS[i];
    const config = texto(JSON.stringify(campo.config || {}));
    const ja = await um(`SELECT ID FROM KB_CAMPO WHERE BOARD_ID = ${boardId} AND CHAVE = '${campo.chave}' LIMIT 1`);
    if (ja) {
      await sdk.runDmlMitra({
        projectId,
        sql: `UPDATE KB_CAMPO SET LABEL = '${texto(campo.label)}', TIPO = '${campo.tipo}', OBRIGATORIO = FALSE,
NO_CARD = ${campo.noCard ? 'TRUE' : 'FALSE'}, ORDEM = ${i + 1}, CONFIG_JSON = '${config}', ATIVO = TRUE WHERE ID = ${Number(ja.ID)}`,
      });
      continue;
    }
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_CAMPO (BOARD_ID, FASE_ID, CHAVE, LABEL, TIPO, OBRIGATORIO, NO_CARD, EDITAVEL_DEPOIS, ORDEM, CONFIG_JSON, ATIVO)
VALUES (${boardId}, NULL, '${campo.chave}', '${texto(campo.label)}', '${campo.tipo}', FALSE, ${campo.noCard ? 'TRUE' : 'FALSE'}, FALSE, ${i + 1}, '${config}', TRUE)`,
    });
  }
  console.log(`  ${CAMPOS.length} campos garantidos (0 obrigatórios)`);

  /* 5. as 11 automações de e-mail (idempotentes por nome) */
  const lista = automacoes(faseIdPorChave);
  for (let i = 0; i < lista.length; i += 1) {
    const auto = lista[i];
    const gatilho = texto(JSON.stringify(auto.gatilho));
    const acoes = texto(JSON.stringify(auto.acoes));
    const ja = await um(`SELECT ID FROM KB_AUTOMACAO WHERE BOARD_ID = ${boardId} AND NOME = '${texto(auto.nome)}' LIMIT 1`);
    if (ja) {
      await sdk.runDmlMitra({
        projectId,
        sql: `UPDATE KB_AUTOMACAO SET GATILHO_JSON = '${gatilho}', ACOES_JSON = '${acoes}', ORDEM = ${i + 1}, ATIVO = TRUE WHERE ID = ${Number(ja.ID)}`,
      });
      continue;
    }
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_AUTOMACAO (BOARD_ID, NOME, GATILHO_JSON, CONDICAO_JSON, ACOES_JSON, ORDEM, ATIVO, CRIADO_EM)
VALUES (${boardId}, '${texto(auto.nome)}', '${gatilho}', NULL, '${acoes}', ${i + 1}, TRUE, '${new Date().toISOString().slice(0, 19)}')`,
    });
  }
  console.log(`  ${lista.length} automações de e-mail garantidas`);

  /* 6. as 22 server functions — ids reais por NOME (R-016), nunca hardcoded.
        Duas passagens: a primeira publica tudo (as JAVASCRIPT ainda com os ids
        do mapa local), a segunda regrava só as JAVASCRIPT com os ids reais das
        escritas que elas chamam. */
  async function publicar(definicoes) {
    const publicadas = new Map(((await sdk.listServerFunctionsMitra({ projectId }))?.result ?? []).map((fn) => [fn.name, fn]));
    for (const definicao of definicoes) {
      const existente = publicadas.get(definicao.name);
      if (existente) {
        await sdk.updateServerFunctionMitra({
          projectId, serverFunctionId: idDaFuncao(existente), code: definicao.code, description: definicao.description,
        });
        continue;
      }
      await sdk.createServerFunctionMitra({
        projectId, name: definicao.name, type: definicao.type, code: definicao.code, description: definicao.description,
      });
    }
    return new Map(((await sdk.listServerFunctionsMitra({ projectId }))?.result ?? []).map((fn) => [fn.name, idDaFuncao(fn)]));
  }

  const idsReais = Object.fromEntries(await publicar(definitions));
  const comIdsReais = montarDefinitions(idsReais).filter((d) => d.type === 'JAVASCRIPT');
  await publicar(comIdsReais);
  console.log(`  ${definitions.length} server functions publicadas (${comIdsReais.length} JAVASCRIPT com ids reais)`);
  console.log('Rode `node sync-server-function-map.mjs` e, depois, `node add-001-kanban.mjs` com os ganchos para ligar sgcPodeMover/sgcPodeExcluir.');
}
