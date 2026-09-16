// add-011 — Server Functions da spec 008 (solicitações do comercial): registro
// pelo vendedor, avaliação por compras, vínculo com o item do pedido, histórico
// e rastreio pós-aprovação. Ver docs/specs/008-solicitacoes-do-comercial/.
//
// Faixa de id local: 78xx (R-051/R-072 do 000) — leituras e JAVASCRIPT
// 7801-7807 (sgcWintClienteBuscar, sgcWintRastreioSolicitacoes,
// sgcSolicitacoesListar, sgcSolicitacoesListarTotal, sgcSolicitacoesDaMontagem,
// sgcSolicitacaoCarregar, sgcSolicitacaoIncluirNoPedido), escritas 7850-7857
// (sgcEscSolicitacaoInserir…sgcEscSolicitacaoHistoricoRegistrar).
//
// Preâmbulo JS e guarda de persona única (R-013) portados de add-006-itens.mjs
// e add-010-bo.mjs (o `chamar` com a conferência de executionStatus === FAILED,
// D-15, é o do add-010).
//
// A régua de situação de atendimento NÃO é constante deste módulo: vem de
// `backend/sql/situacao-solicitacao.sql` pelo loader `fragmento(nome)` de
// `backend/lib/fragmentos.mjs` (R-070/R-074/R-075) — o mesmo arquivo que o
// add-012 (009) compõe, com os mesmos aliases S / C / SF / I.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-011-solicitacoes.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { fragmento } from './lib/fragmentos.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));
const MARCADOR_IDS = '__SGC_IDS__';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintClienteBuscar', 'sgcWintRastreioSolicitacoes'];

/** R-070/R-075: uma régua, um arquivo. Dois `CASE` copiados divergem no primeiro ajuste. */
const SITUACAO = fragmento('situacao-solicitacao.sql');

/* ──────────────────────────────────────────────────────────────────────────
   Guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente;
   só a lista de personas e o dono da sessão mudam. `:VAR_USER` vale em SF
   chamada DIRETO da tela; escrita chamada por id de dentro de um JAVASCRIPT
   recebe `{{usuarioId}}` cru — e leva a MESMA guarda sobre ele (A1 da onda 1:
   o perfil business libera todas as SFs, então "só o JS confere" não protege).
   ────────────────────────────────────────────────────────────────────────── */

function guarda(personas, quem = ':VAR_USER', extra = '') {
  const lista = personas.map((p) => `'${p}'`).join(', ');
  return `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = ${quem}
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN (${lista})
      ${extra}
  )`;
}

/** A mesma guarda, para a escrita interna que recebe o usuário como parâmetro. */
const guardaInterna = (personas) => guarda(personas, '{{usuarioId}}');

/** RN-018: registrar e cancelar a própria é do vendedor (o autor É o vendedor, RN-002). */
const REGISTRAR = ['admin', 'comercial'];
/** RN-018: avaliar, vincular e desvincular é de compras. */
const AVALIAR = ['admin', 'analista', 'gestor'];
/** Quem pode qualquer uma das ações acima também deixa a linha do histórico dela. */
const HISTORICO = ['admin', 'analista', 'gestor', 'comercial'];

// C-12 da revisão cruzada (o A-6/D-19 da onda 2 aplicado aqui): as escritas de
// TELA que recebem um card precisam conferir fase e dono, não só persona — sem
// isto um analista RESTRICTED desvincularia solicitação de card alheio e um
// pedido fora da montagem seria alterado. É a mesma condição de
// `pedidoEmAnalise` (003), aqui em SQL, dentro do EXISTS da guarda (reusa o
// alias IU já filtrado por `quem`).
const faseEDono = (idCardExpr, quem = ':VAR_USER') => `EXISTS (
        SELECT 1 FROM KB_CARD C
        JOIN SGC_FASE SF ON SF.BOARD_ID = C.BOARD_ID AND SF.FASE_ID = C.FASE_ID AND SF.CHAVE = 'analise'
        WHERE C.ID = ${idCardExpr} AND C.EXCLUIDO_EM IS NULL
          AND (COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'RESTRICTED' OR C.CRIADO_POR = ${quem})
      )`;

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

// RF-003/C-018: o mesmo cliente por código, por parte do nome ou por CNPJ sem
// pontuação. A normalização do texto digitado é da regra pura `buscaDeCliente`
// (frontend/src/lib/solicitacoes.ts), testada. CODATV1 vem junto só para a tela
// marcar cliente de órgão público na lista (AN-03); nada aqui depende dele.
const SQL_CLIENTE_BUSCAR = `SELECT * FROM (
  SELECT C.CODCLI, C.CLIENTE,
         NVL(C.CGCENT, ' ') AS CNPJ,
         NVL(C.CODATV1, 0)  AS CODATV1
  FROM PCCLIENT C
  WHERE ( C.CODCLI = {{codcli}}
       OR ( {{codcli}} = 0
            AND ( UPPER(C.CLIENTE) LIKE '%' || UPPER('{{busca}}') || '%'
               OR REPLACE(REPLACE(REPLACE(NVL(C.CGCENT, ' '), '.', ''), '/', ''), '-', '')
                  LIKE '%' || '{{busca}}' || '%' ) ) )
  ORDER BY C.CLIENTE
) WHERE ROWNUM <= 20`;

// RF-014/RF-015 — porte de `sgc_rastreio_venda_solicitacoes` do p-45547, SEM
// alteração de forma (R-064). Cada solicitação tem o SEU cliente e a SUA data
// de aprovação: não há BETWEEN global que resolva, e é o CONNECT BY que explode
// `{{pares}}` em linhas — o rastreio de uma página inteira custa UMA execução
// (RNF-003), não uma por solicitação.
//
// Duas notas do plan que são regra, não estilo:
//   - QT_VENDIDA_CLIENTE_GERAL NÃO filtra filial de propósito: cliente atendido
//     por outra filial apareceria como "não comprou", o falso negativo mais caro
//     deste rastreio (RN-013).
//   - o giro dos 90 dias vem de PCEST.QTVENDMES/1/2 (R-055); quem decide como
//     usá-lo é a regra pura (RN-014).
const SQL_RASTREIO = `WITH PARES AS (
  SELECT
    TO_NUMBER(REGEXP_SUBSTR(ITEM, '[^:]+', 1, 1)) AS CODPROD,
    REGEXP_SUBSTR(ITEM, '[^:]+', 1, 2)            AS CODFILIAL,
    TO_DATE(REGEXP_SUBSTR(ITEM, '[^:]+', 1, 3), 'YYYY-MM-DD') AS DT_REF,
    TO_NUMBER(REGEXP_SUBSTR(ITEM, '[^:]+', 1, 4)) AS CODCLI
  FROM (
    SELECT REGEXP_SUBSTR('{{pares}}', '[^,]+', 1, LEVEL) AS ITEM
    FROM DUAL
    CONNECT BY REGEXP_SUBSTR('{{pares}}', '[^,]+', 1, LEVEL) IS NOT NULL
  )
)
SELECT
  P.CODPROD, P.CODFILIAL,
  TO_CHAR(P.DT_REF, 'YYYY-MM-DD') AS DT_REFERENCIA,
  P.CODCLI,
  NVL(MAX(E.QTEST), 0)                          AS QT_ESTOQUE,
  TO_CHAR(MAX(E.DTULTENT),   'YYYY-MM-DD')      AS DT_ULT_ENTRADA,
  TO_CHAR(MAX(E.DTULTSAIDA), 'YYYY-MM-DD')      AS DT_ULT_SAIDA,
  NVL(MAX(E.QTVENDMES), 0) + NVL(MAX(E.QTVENDMES1), 0) + NVL(MAX(E.QTVENDMES2), 0) AS QT_VENDA_90D,
  NVL(SUM(M.QT), 0)                             AS QT_VENDIDA_POS,
  NVL(SUM(M.QT * NVL(M.PUNIT, 0)), 0)           AS VL_VENDIDO_POS,
  COUNT(DISTINCT M.NUMNOTA)                     AS QT_NOTAS_POS,
  TO_CHAR(MAX(M.DTMOV), 'YYYY-MM-DD')           AS DT_VENDA_POS,
  NVL(SUM(CASE WHEN M.CODCLI = P.CODCLI THEN M.QT ELSE 0 END), 0)                     AS QT_VENDIDA_CLIENTE,
  NVL(SUM(CASE WHEN M.CODCLI = P.CODCLI THEN M.QT * NVL(M.PUNIT, 0) ELSE 0 END), 0)   AS VL_VENDIDO_CLIENTE,
  COUNT(DISTINCT CASE WHEN M.CODCLI = P.CODCLI THEN M.NUMNOTA END)                    AS QT_NOTAS_CLIENTE,
  TO_CHAR(MAX(CASE WHEN M.CODCLI = P.CODCLI THEN M.DTMOV END), 'YYYY-MM-DD')          AS DT_VENDA_CLIENTE,
  (SELECT NVL(SUM(MG.QT), 0)
     FROM PCMOV MG
    WHERE MG.CODPROD = P.CODPROD
      AND MG.CODCLI  = P.CODCLI
      AND MG.CODOPER = 'S'
      AND MG.QT > 0
      AND MG.DTCANCEL IS NULL
      AND MG.DTMOV >= P.DT_REF) AS QT_VENDIDA_CLIENTE_GERAL
FROM PARES P
LEFT JOIN PCEST E
  ON E.CODPROD = P.CODPROD AND E.CODFILIAL = P.CODFILIAL
LEFT JOIN PCMOV M
  ON M.CODPROD = P.CODPROD AND M.CODFILIAL = P.CODFILIAL
 AND M.CODOPER = 'S' AND M.QT > 0 AND NVL(M.CODCLI, 0) > 0
 AND M.DTCANCEL IS NULL AND M.DTMOV >= P.DT_REF
GROUP BY P.CODPROD, P.CODFILIAL, P.DT_REF, P.CODCLI`;

/* ─────────────── leituras — banco do projeto ─────────────── */

// RF-019/D-010: o único recorte por autoria de uma listagem do projeto, e ele
// mora NO SERVIDOR — esconder na tela não é recorte (A8 da onda 2).
const RECORTE_COMERCIAL = `( S.CRIADO_POR = :VAR_USER
    OR EXISTS ( SELECT 1 FROM INT_USER IU
                LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
                WHERE IU.ID = :VAR_USER
                  AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                             WHEN 'ADMIN' THEN 'admin'
                                             WHEN 'RESTRICTED' THEN 'comercial'
                                             ELSE 'analista' END) <> 'comercial' ) )`;

const COLUNAS_SOLICITACAO = `S.ID, S.CODPROD, S.DESCRICAO, S.EMBALAGEM, S.UNIDADE,
  S.CODFORNEC, S.FORNECEDOR, S.CODFILIAL, S.FILIAL,
  S.QUANTIDADE, COALESCE(S.JUSTIFICATIVA, '') AS JUSTIFICATIVA,
  S.CODCLI, COALESCE(S.CLIENTE, '') AS CLIENTE, COALESCE(S.CNPJ_CLIENTE, '') AS CNPJ_CLIENTE,
  S.PRIORIDADE, S.STATUS, ${SITUACAO} AS SITUACAO, COALESCE(S.MOTIVO, '') AS MOTIVO,
  S.ID_CARD, COALESCE(C.TITULO, '') AS TITULO_CARD, S.ID_ITEM,
  COALESCE(UA.NOME, '') AS AVALIADO_POR_NOME, COALESCE(S.AVALIADO_EM, '') AS AVALIADO_EM,
  S.CRIADO_POR, COALESCE(UC.NOME, '') AS CRIADO_POR_NOME, COALESCE(S.CRIADO_EM, '') AS CRIADO_EM`;

// Os três primeiros LEFT JOIN são o CONTRATO DE COMPOSIÇÃO de R-075, não
// escolha desta consulta: C, SF e I com estas junções são o que a régua de
// situacao-solicitacao.sql pressupõe, e o add-012 da 009 repete os mesmos.
const JUNCOES_SOLICITACAO = `LEFT JOIN KB_CARD C         ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_FASE SF       ON SF.BOARD_ID = C.BOARD_ID AND SF.FASE_ID = C.FASE_ID
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD AND I.STATUS <> 'removido'
LEFT JOIN INT_USER UC       ON UC.ID = S.CRIADO_POR
LEFT JOIN INT_USER UA       ON UA.ID = S.AVALIADO_POR`;

const FILTROS_PUBLICADOS = `  AND ('{{status}}'    = '' OR S.STATUS = '{{status}}')
  AND ('{{situacao}}'  = '' OR '{{situacao}}' = ${SITUACAO})
  AND ({{codfornec}}   = 0  OR S.CODFORNEC = {{codfornec}})
  AND ('{{codfilial}}' = '' OR S.CODFILIAL = '{{codfilial}}')
  AND ({{vendedor}}    = 0  OR S.CRIADO_POR = {{vendedor}})
  AND ({{minhas}}      = 0  OR S.CRIADO_POR = :VAR_USER)
  AND ('{{busca}}'     = '' OR S.DESCRICAO LIKE CONCAT('%', '{{busca}}', '%')
       OR S.CLIENTE    LIKE CONCAT('%', '{{busca}}', '%')
       OR S.FORNECEDOR LIKE CONCAT('%', '{{busca}}', '%'))`;

/**
 * C-11 da revisão cruzada: o texto publicado NÃO se reusa dentro de um
 * `runQueryMitra`. Lá o simulador (e a plataforma) troca marcador sem valor por
 * string vazia, e as condições numéricas de filtro (`{{codfornec}} = 0`)
 * virariam ` = 0` sem operando esquerdo. Quem monta as duas versões é esta
 * função: `filtros` são as cláusulas com `{{}}` (só a SF publicada as passa) e
 * `whereExtra` é SQL já interpolado em JS. Uma consulta, dois chamadores.
 */
function selectSolicitacoes(filtros = '', whereExtra = '') {
  return `SELECT ${COLUNAS_SOLICITACAO}
FROM SGC_SOLICITACAO S
${JUNCOES_SOLICITACAO}
WHERE ${RECORTE_COMERCIAL}
${filtros}${whereExtra}`;
}

const SQL_SOLICITACOES_LISTAR = `${selectSolicitacoes(FILTROS_PUBLICADOS)}
ORDER BY S.CRIADO_EM DESC, S.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_SOLICITACOES_TOTAL = `SELECT COUNT(*) AS TOTAL
FROM SGC_SOLICITACAO S
${JUNCOES_SOLICITACAO}
WHERE ${RECORTE_COMERCIAL}
${FILTROS_PUBLICADOS}`;

// A linha por id, para o sgcSolicitacaoCarregar: mesmos JOIN, mesma régua e o
// MESMO recorte do comercial (o vendedor não lê a solicitação de outro nem por
// id). `__ID__` é trocado pelo id saneado dentro do JS — nunca um `{{}}`.
const SQL_SOLICITACAO_POR_ID = selectSolicitacoes('', '  AND S.ID = __ID__');

const SQL_SOLICITACAO_HISTORICO = `SELECT H.ID, H.EVENTO, COALESCE(H.DETALHE, '') AS DETALHE,
       COALESCE(U.NOME, '') AS POR_NOME, COALESCE(H.EM, '') AS EM
FROM SGC_SOLICITACAO_HISTORICO H
LEFT JOIN INT_USER U ON U.ID = H.POR
WHERE H.ID_SOLICITACAO = __ID__
ORDER BY H.EM, H.ID`;

// RF-008/RN-012 — o bloco da Análise, UMA execução ao abrir (RNF-001).
// QT_NO_PEDIDO é o que permite avisar "esse produto já está no pedido com 30" e
// é a metade de tela de RN-010. O LIMIT 100 é teto, não paginação (D-012).
//
// O bloco NÃO filtra por fase: quem decide que ele só aparece na montagem é
// BLOCOS_POR_FASE.analise (R-050/R-054), e as escritas conferem a fase no
// servidor — assim a mesma SF serve ao teste da regra sem depender da tela.
const SQL_SOLICITACOES_DA_MONTAGEM = `SELECT S.ID, S.CODPROD, S.DESCRICAO, S.EMBALAGEM, S.UNIDADE, S.QUANTIDADE,
  COALESCE(S.JUSTIFICATIVA, '') AS JUSTIFICATIVA,
  S.CODCLI, COALESCE(S.CLIENTE, '') AS CLIENTE, S.PRIORIDADE, S.STATUS,
  S.CRIADO_POR, COALESCE(U.NOME, '') AS CRIADO_POR_NOME, COALESCE(S.CRIADO_EM, '') AS CRIADO_EM,
  COALESCE(I.QT_PEDIDA, 0) AS QT_NO_PEDIDO
FROM SGC_PEDIDO P
JOIN SGC_SOLICITACAO S      ON S.CODFORNEC = P.CODFORNEC AND S.CODFILIAL = P.CODFILIAL
LEFT JOIN INT_USER U        ON U.ID = S.CRIADO_POR
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = P.ID_CARD AND I.CODPROD = S.CODPROD AND I.STATUS <> 'removido'
WHERE P.ID_CARD = {{cardId}}
  AND ( S.STATUS = 'pendente' OR (S.STATUS = 'aprovada' AND S.ID_CARD = 0) )
ORDER BY FIELD(S.PRIORIDADE, 'urgente', 'alta', 'normal'), S.CRIADO_EM, S.ID
LIMIT 100`;

/* ─────────────── escritas SQL (uma instrução por SF) ─────────────── */

// RN-001 mora no WHERE: registro inválido grava 0 linhas e a tela relê (D-03),
// em vez de confiar no que a tela validou.
const SQL_SOLICITACAO_INSERIR = `INSERT INTO SGC_SOLICITACAO
  (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL,
   QUANTIDADE, JUSTIFICATIVA, CODCLI, CLIENTE, CNPJ_CLIENTE, PRIORIDADE, STATUS,
   MOTIVO, ID_CARD, ID_ITEM, AVALIADO_POR, AVALIADO_EM, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{codprod}}, '{{descricao}}', '{{embalagem}}', '{{unidade}}',
       {{codfornec}}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}',
       {{quantidade}}, '{{justificativa}}', {{codcli}}, '{{cliente}}', '{{cnpjCliente}}',
       '{{prioridade}}', 'pendente', '', 0, 0, 0, '', :VAR_USER, '{{criadoEm}}', '{{criadoEm}}'
FROM DUAL
WHERE {{codprod}} > 0 AND {{quantidade}} > 0 AND {{codfornec}} > 0
  AND LENGTH(TRIM('{{justificativa}}')) >= 10
  AND '{{codfilial}}' <> ''
  AND '{{prioridade}}' IN ('normal', 'alta', 'urgente')
  AND ${guarda(REGISTRAR)}`;

const SQL_SOLICITACAO_AVALIAR = `UPDATE SGC_SOLICITACAO
SET STATUS = '{{status}}',
    MOTIVO = CASE WHEN '{{status}}' = 'recusada' THEN '{{motivo}}' ELSE '' END,
    AVALIADO_POR = :VAR_USER, AVALIADO_EM = '{{avaliadoEm}}', ATUALIZADO_EM = '{{avaliadoEm}}'
WHERE ID = {{id}} AND STATUS = 'pendente'
  AND '{{status}}' IN ('aprovada', 'recusada')
  AND ('{{status}}' = 'aprovada' OR LENGTH(TRIM('{{motivo}}')) >= 10)
  AND ${guarda(AVALIAR)}`;

// RN-007: só o autor, e só enquanto pendente. Depois de avaliada, quem desfaz
// é compras (recusando, ou desvinculando).
const SQL_SOLICITACAO_CANCELAR = `UPDATE SGC_SOLICITACAO
SET STATUS = 'cancelada', ATUALIZADO_EM = '{{canceladoEm}}'
WHERE ID = {{id}} AND STATUS = 'pendente' AND CRIADO_POR = :VAR_USER
  AND ${guarda(REGISTRAR)}`;

// RN-015: AVALIADO_EM é a data de referência do rastreio e NÃO se reescreve
// quando a solicitação já tinha sido aprovada antes do vínculo.
const SQL_SOLICITACAO_VINCULAR = `UPDATE SGC_SOLICITACAO
SET STATUS = 'aprovada', ID_CARD = {{idCard}}, ID_ITEM = {{idItem}}, MOTIVO = '',
    AVALIADO_POR  = CASE WHEN COALESCE(AVALIADO_POR, 0) = 0 THEN {{usuarioId}} ELSE AVALIADO_POR END,
    AVALIADO_EM   = CASE WHEN COALESCE(AVALIADO_EM, '') = '' THEN '{{vinculadoEm}}' ELSE AVALIADO_EM END,
    ATUALIZADO_EM = '{{vinculadoEm}}'
WHERE ID = {{id}} AND ID_CARD = 0 AND STATUS IN ('pendente', 'aprovada')
  AND ${guardaInterna(AVALIAR)}`;

// D-005: o critério é "o item sumiu", e não o CODPROD — assim a MESMA
// instrução serve à remoção de um item e à remoção dos zerados ao sair da
// Análise (RN-011), e é idempotente.
const SQL_SOLICITACAO_DESVINCULAR = `UPDATE SGC_SOLICITACAO
SET ID_CARD = 0, ID_ITEM = 0, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID_CARD = {{idCard}} AND {{idCard}} > 0 AND STATUS = 'aprovada'
  AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO_ITEM I
                   WHERE I.ID_CARD  = SGC_SOLICITACAO.ID_CARD
                     AND I.CODPROD  = SGC_SOLICITACAO.CODPROD
                     AND I.STATUS  <> 'removido' AND I.QT_PEDIDA > 0)
  AND ${guarda(AVALIAR, ':VAR_USER', `AND ${faseEDono('{{idCard}}')}`)}`;

// Por id (avaliação, cancelamento) OU pelo card, com o mesmo critério do
// desvínculo — chamada SEMPRE antes dele, porque depois o ID_CARD já é 0. A
// forma "id OU critério" é a de sgcEscOcorrenciaDecidir da 005 (achado A-3),
// uma instrução só. O ramo por {{id}} não toca card nenhum e por isso a
// conferência de fase e dono entra condicionada a {{idCard}} = 0.
const SQL_SOLICITACAO_HISTORICO_INSERIR = `INSERT INTO SGC_SOLICITACAO_HISTORICO (ID_SOLICITACAO, EVENTO, DETALHE, POR, EM)
SELECT S.ID, '{{evento}}', '{{detalhe}}', :VAR_USER, '{{em}}'
FROM SGC_SOLICITACAO S
WHERE '{{evento}}' IN ('aprovada', 'recusada', 'vinculada', 'desvinculada', 'cancelada')
  AND ( ({{id}} > 0 AND S.ID = {{id}})
     OR ({{id}} = 0 AND {{idCard}} > 0 AND S.ID_CARD = {{idCard}}
         AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO_ITEM I
                          WHERE I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD
                            AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0)) )
  AND ${guarda(HISTORICO, ':VAR_USER', `AND ({{idCard}} = 0 OR ${faseEDono('{{idCard}}')})`)}`;

// B-4: a ORDEM da cláusula é regra, não estilo — todo VALUES() vem antes do
// único literal, que fica na última atribuição. A base corrigiu o dialeto
// (R-079) e mesmo assim esta instrução não depende da correção.
//
// D-007: CODEPTO/CODSEC/UN_POR_CAIXA/PRECO_CUSTO nascem zerados — são dados da
// análise do ERP, e quem os traz é o sgcItensGravar da 003 na primeira gravação
// da lista (o upsert dele preserva ID_SOLICITACAO, que não está no UPDATE dele).
const SQL_ITEM_DE_SOLICITACAO_INSERIR = `INSERT INTO SGC_PEDIDO_ITEM
  (ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, UN_POR_CAIXA,
   QT_VENDA_TOTAL, QT_VENDA_LICITACAO, QT_ESTOQUE, QT_TRANSITO, QT_SUGERIDA, QT_PEDIDA,
   PRECO_CUSTO, TIPO_PRECO, CURVA_ABC, COBERTURA_DIAS, COBERTURA_LIMITE,
   COBERTURA_JUSTIFICATIVA, OBSERVACAO, STATUS, ID_SOLICITACAO,
   CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{idCard}}, {{codprod}}, '{{descricao}}', '{{embalagem}}', '{{unidade}}',
       0, 0, 0, 0, 0, 0, 0, 0, {{quantidade}},
       0, 'padrao', 'C', 0, 0, '', '', 'montagem', {{idSolicitacao}},
       '{{quando}}', {{usuarioId}}, '{{quando}}'
FROM DUAL
WHERE {{codprod}} > 0 AND {{quantidade}} > 0 AND {{idSolicitacao}} > 0
  AND ${guardaInterna(AVALIAR)}
ON DUPLICATE KEY UPDATE
  ID_SOLICITACAO = VALUES(ID_SOLICITACAO),
  QT_PEDIDA      = CASE WHEN QT_PEDIDA > 0 THEN QT_PEDIDA ELSE VALUES(QT_PEDIDA) END,
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM  = VALUES(ATUALIZADO_EM),
  STATUS         = CASE WHEN STATUS = 'removido' THEN 'montagem' ELSE STATUS END`;

// D-004/R-065: a gêmea interna de 7855, só por id. Duas SFs, duas identidades,
// uma instrução cada — aceitar `usuarioId` como identidade quando a sessão
// resolve é literalmente a dívida D-06 da onda 1.
const SQL_SOLICITACAO_HISTORICO_REGISTRAR = `INSERT INTO SGC_SOLICITACAO_HISTORICO (ID_SOLICITACAO, EVENTO, DETALHE, POR, EM)
SELECT S.ID, '{{evento}}', '{{detalhe}}', {{usuarioId}}, '{{em}}'
FROM SGC_SOLICITACAO S
WHERE S.ID = {{id}}
  AND '{{evento}}' IN ('aprovada', 'recusada', 'vinculada', 'desvinculada', 'cancelada')
  AND ${guardaInterna(AVALIAR)}`;

const ESCRITAS = [
  {
    name: 'sgcEscSolicitacaoInserir',
    resumo: 'RF-001/RF-004/RN-001 - registra a solicitação do vendedor (as validações moram no WHERE: 0 linhas = recusada). Params: codprod int, descricao, embalagem, unidade, codfornec int, fornecedor, codfilial, filial, quantidade num, justificativa, codcli int, cliente, cnpjCliente, prioridade, criadoEm',
    code: SQL_SOLICITACAO_INSERIR,
  },
  {
    name: 'sgcEscSolicitacaoAvaliar',
    resumo: 'RF-005/RF-006/RN-006 - aprova (põe na fila, sem pedido) ou recusa com motivo de ao menos 10 caracteres. Params: id int, status string, motivo string, avaliadoEm string',
    code: SQL_SOLICITACAO_AVALIAR,
  },
  {
    name: 'sgcEscSolicitacaoCancelar',
    resumo: 'RF-007/RN-007 - o autor cancela a própria solicitação enquanto pendente. Params: id int, canceladoEm string',
    code: SQL_SOLICITACAO_CANCELAR,
  },
  {
    name: 'sgcEscSolicitacaoVincular',
    resumo: 'RF-009/RN-009 - liga a solicitação ao card e ao item (exige ID_CARD = 0: a corrida perde). Params: id int, idCard int, idItem int, vinculadoEm string, usuarioId int',
    interna: true,
    code: SQL_SOLICITACAO_VINCULAR,
  },
  {
    name: 'sgcEscSolicitacaoDesvincular',
    resumo: 'RF-011/RN-011/R-066 - devolve à fila toda solicitação do card cujo item não existe mais (idempotente; chamada pela tela depois de sgcEscItemRemover e de sgcAnaliseSair). Params: idCard int, atualizadoEm string',
    code: SQL_SOLICITACAO_DESVINCULAR,
  },
  {
    name: 'sgcEscSolicitacaoHistoricoInserir',
    resumo: 'RF-013 - linha do histórico pela tela, por id OU pelo card (mesmo critério do desvínculo; chamada ANTES dele). Params: id int, idCard int, evento string, detalhe string, em string',
    code: SQL_SOLICITACAO_HISTORICO_INSERIR,
  },
  {
    name: 'sgcEscItemDeSolicitacaoInserir',
    resumo: 'RF-009/RN-010 - cria (ou revive) o item do pedido com a origem da solicitação; item com quantidade é preservado. Params: idCard int, codprod int, descricao, embalagem, unidade, quantidade num, idSolicitacao int, quando string, usuarioId int',
    interna: true,
    code: SQL_ITEM_DE_SOLICITACAO_INSERIR,
  },
  {
    name: 'sgcEscSolicitacaoHistoricoRegistrar',
    resumo: 'RF-013/R-065 - linha do histórico a partir de um JAVASCRIPT, por id. Params: id int, evento string, detalhe string, em string, usuarioId int',
    interna: true,
    code: SQL_SOLICITACAO_HISTORICO_REGISTRAR,
  },
];

const AVISO_INTERNA = 'Escrita interna, chamada por id de dentro das server functions JAVASCRIPT da spec 008; leva a guarda de persona sobre o usuarioId recebido (A1). Nao chamar do frontend.';

/* ─────────────── JavaScript (orquestração) ─────────────── */

// Preâmbulo comum, portado de add-006-itens.mjs (com o `chamar` do add-010).
// Regra da casa: nenhum `{{` literal aqui dentro — o que chega a um `{{param}}`
// é o `input` das chamadas por id.
const PRELUDIO = `const { runQueryMitra, executeServerFunctionMitra } = require('mitra-sdk');
const SGC_IDS = ${MARCADOR_IDS};
const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);

function desembrulhar(resposta) {
  let saida = resposta;
  for (let volta = 0; volta < 4; volta += 1) {
    if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch (e) { return saida; } continue; }
    if (saida && typeof saida === 'object' && saida.result !== undefined) { saida = saida.result; continue; }
    if (saida && typeof saida === 'object' && saida.output !== undefined) { saida = saida.output; continue; }
    break;
  }
  return saida;
}
function linhasDe(resposta) {
  const saida = desembrulhar(resposta);
  if (Array.isArray(saida)) return saida;
  if (saida && Array.isArray(saida.rows)) return saida.rows;
  return [];
}
async function consultar(sql) { return linhasDe(await runQueryMitra({ projectId, sql })); }
async function chamar(nome, entrada) {
  const id = SGC_IDS[nome];
  if (!id) throw new Error('Server function sem id no mapa: ' + nome);
  const resposta = await executeServerFunctionMitra({ projectId, serverFunctionId: Number(id), input: entrada || {} });
  // D-15: resposta com executionStatus FAILED nao lanca sozinha.
  const resultado = (resposta && resposta.result) || resposta;
  if (resultado && resultado.executionStatus === 'FAILED') {
    throw new Error((resultado && resultado.error) || ('Falha em ' + nome + '.'));
  }
  return desembrulhar(resposta);
}
function inteiro(valor) { const n = Number(valor); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function numero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
// A-11 da onda 2: o escape da aspa e do runtime; aqui so cai caractere de
// controle e o texto e cortado no tamanho da coluna.
function texto(valor, teto) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\\u0000-\\u001f]/g, ' ').slice(0, teto || 200);
}
function agora() { return new Date().toISOString().slice(0, 19); }
// R-013: o MESMO mapa de ACCESS_LEVEL da guarda SQL da 002, aqui em JS —
// :VAR_USER não se propaga em chamada aninhada.
async function persona(fallbackId) {
  const SELECAO = "SELECT IU.ID, COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS NIVEL, COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')"
    + " WHEN 'ADMIN' THEN 'admin' WHEN 'RESTRICTED' THEN 'comercial' ELSE 'analista' END) AS PERSONA"
    + ' FROM INT_USER IU LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID WHERE IU.ID = ';
  let linhas = await consultar(SELECAO + ':VAR_USER');
  if (!linhas[0] && inteiro(fallbackId) > 0) linhas = await consultar(SELECAO + inteiro(fallbackId));
  const linha = linhas[0];
  if (!linha) return { id: 0, persona: '', nivel: '' };
  return { id: inteiro(linha.ID), persona: String(linha.PERSONA || ''), nivel: String(linha.NIVEL || '') };
}
function podeAvaliar(quem) {
  return quem.id > 0 && quem.nivel !== 'READ_ONLY' && ['admin', 'analista', 'gestor'].indexOf(quem.persona) !== -1;
}
// P-08 B (A2): RESTRICTED so opera os PROPRIOS cards — copiado do add-006.
async function pedidoEmAnalise(cardId, usuarioId) {
  const quemId = inteiro(usuarioId);
  const linhas = await consultar(
    'SELECT P.ID_CARD, P.CODFILIAL, P.CODFORNEC FROM SGC_PEDIDO P'
    + ' JOIN KB_CARD C ON C.ID = P.ID_CARD'
    + ' JOIN SGC_FASE F ON F.FASE_ID = C.FASE_ID AND F.CHAVE = ' + "'analise'"
    + ' JOIN INT_USER IU ON IU.ID = ' + quemId
    + ' WHERE P.ID_CARD = ' + inteiro(cardId) + ' AND C.EXCLUIDO_EM IS NULL'
    + " AND (COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'RESTRICTED' OR C.CRIADO_POR = " + quemId + ')');
  return linhas[0] || null;
}
const FORA_DA_ANALISE = 'O pedido não está na Análise, ou é de outra pessoa e o seu acesso é restrito aos próprios pedidos.';`;

// sgcSolicitacaoCarregar — o detalhe em UMA execução, dois runQueryMitra
// (consulta de leitura por runQueryMitra não conta como execução de SF, o mesmo
// desenho de sgcPedidoCarregar e sgcBoCarregar). A linha `criada` é DERIVADA de
// CRIADO_POR/CRIADO_EM e vai na frente da lista (D-003/R-067).
const JS_SOLICITACAO_CARREGAR = `${PRELUDIO}
const id = inteiro(event.id);
if (id <= 0) return { ok: false, erro: 'Solicitação não informada.' };
const sqlLinha = ${JSON.stringify(SQL_SOLICITACAO_POR_ID)}.split('__ID__').join(String(id));
const sqlHistorico = ${JSON.stringify(SQL_SOLICITACAO_HISTORICO)}.split('__ID__').join(String(id));
const [linhas, historico] = await Promise.all([consultar(sqlLinha), consultar(sqlHistorico)]);
const solicitacao = linhas[0];
if (!solicitacao) return { ok: false, erro: 'Solicitação não encontrada, ou registrada por outro vendedor.' };
const criada = {
  ID: 0, EVENTO: 'criada', DETALHE: '',
  POR_NOME: String(solicitacao.CRIADO_POR_NOME || ''), EM: String(solicitacao.CRIADO_EM || ''),
};
return { ok: true, solicitacao: solicitacao, historico: [criada].concat(historico) };`;

// sgcSolicitacaoIncluirNoPedido — o ÚNICO caminho que cria o vínculo.
// Custo: 3 runQueryMitra (não contam) + no máximo 5 execuções aninhadas
// (histórico aprovada, item, vincular, histórico vinculada, nota), qualquer que
// seja o tamanho do pedido (RNF-002). O total do pedido não é recalculado aqui
// (D-006): o item nasce com custo zero e o sgcItensGravar da 003 recalcula.
const JS_SOLICITACAO_INCLUIR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const id = inteiro(event.id);
const quem = await persona();
if (!podeAvaliar(quem)) return { ok: false, erro: 'Seu perfil não pode incluir solicitações neste pedido.' };
if (!await pedidoEmAnalise(cardId, quem.id)) return { ok: false, erro: FORA_DA_ANALISE };

const alvo = (await consultar(
  'SELECT S.ID, S.STATUS, S.CODPROD, S.DESCRICAO, S.EMBALAGEM, S.UNIDADE, S.QUANTIDADE,'
  + ' S.CODFORNEC, S.FORNECEDOR, S.CODFILIAL, S.FILIAL, S.CODCLI, S.CLIENTE, S.ID_CARD,'
  + " COALESCE(U.NOME, '') AS VENDEDOR,"
  + " COALESCE(P.CODFORNEC, 0) AS P_CODFORNEC, COALESCE(P.FORNECEDOR, '') AS P_FORNECEDOR,"
  + " COALESCE(P.CODFILIAL, '') AS P_CODFILIAL, COALESCE(P.FILIAL, '') AS P_FILIAL,"
  + " COALESCE(C.TITULO, '') AS TITULO,"
  + " COALESCE((SELECT CV.TITULO FROM KB_CARD CV WHERE CV.ID = S.ID_CARD), '') AS TITULO_VINCULO"
  + ' FROM SGC_SOLICITACAO S'
  + ' LEFT JOIN INT_USER U ON U.ID = S.CRIADO_POR'
  + ' LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = ' + cardId
  + ' LEFT JOIN KB_CARD C ON C.ID = ' + cardId
  + ' WHERE S.ID = ' + id))[0];
if (!alvo) return { ok: false, erro: 'Solicitação não encontrada.' };
const status = String(alvo.STATUS || '');
if (status !== 'pendente' && status !== 'aprovada') return { ok: false, erro: 'A solicitação já foi recusada ou cancelada.' };
if (inteiro(alvo.ID_CARD) > 0) {
  return { ok: false, erro: 'Esta solicitação já está vinculada ao pedido ' + String(alvo.TITULO_VINCULO || alvo.ID_CARD) + '.' };
}
if (inteiro(alvo.CODFORNEC) !== inteiro(alvo.P_CODFORNEC) || String(alvo.CODFILIAL) !== String(alvo.P_CODFILIAL)) {
  return {
    ok: false,
    erro: 'A solicitação é do fornecedor ' + String(alvo.FORNECEDOR || alvo.CODFORNEC)
      + ' para a filial ' + String(alvo.FILIAL || alvo.CODFILIAL)
      + ' e este pedido é do fornecedor ' + String(alvo.P_FORNECEDOR || alvo.P_CODFORNEC)
      + ' para a filial ' + String(alvo.P_FILIAL || alvo.P_CODFILIAL) + '.',
  };
}

const quando = agora();
const titulo = String(alvo.TITULO || cardId);
const codprod = inteiro(alvo.CODPROD);
const quantidade = numero(alvo.QUANTIDADE);
const aprovouAgora = status === 'pendente';

if (aprovouAgora) {
  await chamar('sgcEscSolicitacaoHistoricoRegistrar', {
    id: id, evento: 'aprovada', detalhe: 'Aprovada ao ser incluída no pedido ' + texto(titulo, 200) + '.',
    em: quando, usuarioId: quem.id,
  });
}

await chamar('sgcEscItemDeSolicitacaoInserir', {
  idCard: cardId, codprod: codprod,
  descricao: texto(alvo.DESCRICAO, 200), embalagem: texto(alvo.EMBALAGEM, 60), unidade: texto(alvo.UNIDADE, 10),
  quantidade: quantidade, idSolicitacao: id, quando: quando, usuarioId: quem.id,
});

// A-2: releitura obrigatória depois de escrita por id — o upsert não devolve id
// e escrita guardada recusada devolve 0 linhas sem erro (D-03).
const item = (await consultar(
  'SELECT ID, QT_PEDIDA FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ' + cardId + ' AND CODPROD = ' + codprod))[0];
if (!item) return { ok: false, erro: 'O item não foi criado no pedido.' };
const idItem = inteiro(item.ID);

await chamar('sgcEscSolicitacaoVincular', {
  id: id, idCard: cardId, idItem: idItem, vinculadoEm: quando, usuarioId: quem.id,
});
const relida = (await consultar('SELECT ID_CARD, ID_ITEM, STATUS FROM SGC_SOLICITACAO WHERE ID = ' + id))[0];
if (!relida || inteiro(relida.ID_CARD) !== cardId || inteiro(relida.ID_ITEM) !== idItem) {
  return { ok: false, erro: 'A solicitação não pôde ser vinculada a este pedido.' };
}

await chamar('sgcEscSolicitacaoHistoricoRegistrar', {
  id: id, evento: 'vinculada',
  detalhe: 'Incluída no pedido ' + texto(titulo, 200) + ' como item ' + codprod + '.',
  em: quando, usuarioId: quem.id,
});

// D-07 da onda 1: nota que falha não desfaz o vínculo.
try {
  const cliente = inteiro(alvo.CODCLI) > 0
    ? ('cliente ' + inteiro(alvo.CODCLI) + ' ' + String(alvo.CLIENTE || ''))
    : 'sem cliente informado';
  await chamar('kbNotaRegistrar', {
    cardId: cardId, usuarioId: quem.id,
    texto: 'Solicitação de ' + String(alvo.VENDEDOR || '') + ' incluída no pedido: '
      + String(alvo.DESCRICAO || '') + ' · ' + quantidade + ' ' + String(alvo.UNIDADE || '')
      + ' · ' + cliente + '.',
  });
} catch (e) { /* nota é acessória */ }

return {
  ok: true, idSolicitacao: id, idItem: idItem,
  quantidade: numero(item.QT_PEDIDA), aprovouAgora: aprovouAgora,
};`;

/* ─────────────── a lista publicada ─────────────── */

const LEITURAS = [
  { name: 'sgcWintClienteBuscar', code: SQL_CLIENTE_BUSCAR, resumo: 'RF-003/C-018 - cliente do WinThor por código, parte do nome ou CNPJ sem pontuação; no máximo 20. Params: codcli int, busca string' },
  { name: 'sgcWintRastreioSolicitacoes', code: SQL_RASTREIO, resumo: 'RF-014/RF-015/RN-016 - rastreio pós-aprovação de um lote de até 120 pares CODPROD:CODFILIAL:AAAA-MM-DD:CODCLI, uma execução por lote. Params: pares fragmento' },
  { name: 'sgcSolicitacoesListar', code: SQL_SOLICITACOES_LISTAR, resumo: 'RF-012/RF-018/RF-019 - a fila com a situação de atendimento derivada e o recorte do comercial no servidor. Params: status, situacao, codfornec int, codfilial, vendedor int, minhas int, busca, limite int, offset int' },
  { name: 'sgcSolicitacoesListarTotal', code: SQL_SOLICITACOES_TOTAL, resumo: 'RF-018 - total da mesma listagem, para a paginação. Params: os mesmos, sem limite/offset' },
  { name: 'sgcSolicitacoesDaMontagem', code: SQL_SOLICITACOES_DA_MONTAGEM, resumo: 'RF-008/RN-012/RNF-001 - as solicitações ativas do mesmo fornecedor e filial do pedido, na ordem da prioridade. Params: cardId int' },
];

const JAVASCRIPT = [
  { name: 'sgcSolicitacaoCarregar', code: JS_SOLICITACAO_CARREGAR, resumo: 'RF-013/C-022 - a solicitação e o histórico (com a linha `criada` derivada) numa execução. Params: id int' },
  { name: 'sgcSolicitacaoIncluirNoPedido', code: JS_SOLICITACAO_INCLUIR, resumo: 'RF-009/RF-010/RN-009/RN-010 - aprova se pendente, cria o item com ID_SOLICITACAO, vincula, registra histórico e nota. Params: cardId int, id int' },
];

/** Materializa `definitions` com o mapa nome -> id injetado nos corpos JAVASCRIPT. */
export function montarDefinitions(ids) {
  return [
    ...LEITURAS.map((f) => ({ name: f.name, type: 'SQL', description: f.resumo, code: f.code })),
    ...ESCRITAS.map((f) => ({
      name: f.name,
      type: 'SQL',
      description: f.interna ? `${f.resumo}. ${AVISO_INTERNA}` : f.resumo,
      code: f.code,
    })),
    ...JAVASCRIPT.map((f) => ({
      name: f.name,
      type: 'JAVASCRIPT',
      description: f.resumo,
      code: f.code.split(MARCADOR_IDS).join(JSON.stringify(ids)),
    })),
  ];
}

export const definitions = montarDefinitions(idsDoMapa(MAPA));

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const sdk = await import('mitra-sdk');
  sdk.configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  const projectId = Number(process.env.MITRA_PROJECT_ID);
  const jdbcId = await jdbcIdWinthor(projectId);

  const existentes = async () => {
    const lista = (await sdk.listServerFunctionsMitra({ projectId })).result ?? [];
    return new Map(lista.map((f) => [f.name, f.id]));
  };

  async function publicar(lista) {
    const mapa = await existentes();
    for (const definicao of lista) {
      const corpo = {
        projectId,
        name: definicao.name,
        type: definicao.type,
        code: definicao.code,
        description: definicao.description,
        ...(WINTHOR.includes(definicao.name) ? { jdbcId } : {}),
      };
      const id = mapa.get(definicao.name);
      if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
      else await sdk.createServerFunctionMitra(corpo);
      console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
    }
  }

  // Primeiro as SQL (as JAVASCRIPT chamam as sgcEsc* desta spec e a
  // kbNotaRegistrar da lib por NOME — precisam já estar publicadas antes do
  // segundo passo, que regrava as JAVASCRIPT com os ids REAIS, R-016).
  const semJs = definitions.filter((d) => d.type !== 'JAVASCRIPT');
  await publicar(semJs);
  const reais = Object.fromEntries(await existentes());
  await publicar(montarDefinitions({ ...idsDoMapa(MAPA), ...reais }).filter((d) => d.type === 'JAVASCRIPT'));

  console.log(`Pronto: ${definitions.length} server functions da spec 008 (solicitações do comercial).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
