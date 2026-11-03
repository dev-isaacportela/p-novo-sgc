// add-006 — Server Functions da spec 003 (itens do pedido): análise de
// montagem no WinThor, alertas (vencimento/excesso) e prazo de pagamento. Ver
// docs/specs/003-itens-do-pedido/.
//
// Faixa de id local: 73xx — leituras e JAVASCRIPT a partir de 7301
// (sgcWintAnaliseMontagem…), escritas a partir de 7350 (sgcEscItemGravar…).
// O id local vem de SERVER_FUNCTIONS em frontend/src/lib/server-functions.ts
// até o sync-server-function-map.mjs trazer os reais do sandbox — mesmo
// padrão de add-001-kanban.mjs.
//
// As sgcWint* (Oracle) resolvem o jdbcId por NOME, com `jdbcIdWinthor` de
// add-003-jdbc-winthor.mjs — nunca por id numérico fixo. No simulador o
// jdbcId é ignorado. sgcCustoUnidadesPorCaixa é INTEGRATION (conexão
// gestao-de-custos), não JDBC: no simulador ela não roda, e a regra pura
// `unidadesPorCaixa` cai na embalagem (RN-002).
//
// sgcEscPedidoReprovacoesLimpar (002) é chamada por id de dentro de
// sgcAnaliseSair: no simulador resolve pelo mapa inteiro de
// backend/ids-do-mapa.mjs (`idsDoMapa`), usado em
// backend/simulator/smoke/base.mjs; na publicação real o id vem por NOME,
// via `listServerFunctionsMitra` (R-016). O marcador __SGC_IDS__ nos corpos
// JAVASCRIPT é trocado pelo mapa nome -> id, como o __KB_IDS__ da lib.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-006-itens.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { PUBLICO, VENDA_VALIDA } from './venda-valida.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));
const MARCADOR_IDS = '__SGC_IDS__';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = [
  'sgcWintAnaliseMontagem', 'sgcWintBuscarProduto', 'sgcWintLotesAVencer',
  'sgcWintExcessoOutrasFiliais', 'sgcWintPrazoPagamento',
];

/* ──────────────────────────────────────────────────────────────────────────
   A guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente;
   só a lista de personas e o dono da sessão mudam. `:VAR_USER` vale em SF
   chamada DIRETO da tela; escrita chamada por id de dentro de um JAVASCRIPT
   recebe `{{usuarioId}}` cru — e leva a MESMA guarda sobre ele. O perfil
   business libera todas as SFs, então "só o JS confere" não protege nada:
   quem chama a escrita por id, por fora da tela, passaria direto (A1).
   ────────────────────────────────────────────────────────────────────────── */

function guarda(personas, quem = ':VAR_USER') {
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
  )`;
}

/** A mesma guarda, para a escrita interna que recebe o usuário como parâmetro. */
const guardaInterna = (personas) => guarda(personas, '{{usuarioId}}');

const MONTAGEM = ['admin', 'analista', 'gestor'];
const COBERTURA = ['admin', 'gestor'];

/* ──────────────────────────────────────────────────────────────────────────
   Recorte do ERP que se repete em toda consulta (RN-011): produto ativo,
   fora dos departamentos 4 e 7, venda só saída positiva, cliente de órgão
   público pelas atividades 11–15 e 20.
   ────────────────────────────────────────────────────────────────────────── */

const RECORTE_PRODUTO = `NVL(LENGTH(TRIM(P.OBS2)), 0) = 0
    AND NVL(P.CODEPTO, 0) NOT IN (4, 7)`;

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

// D-002: no p-45547 o filtro de cliente público morava no WHERE da subconsulta
// de venda, o que zerava QT_LICIT sempre. Aqui QT_TOTAL soma toda saída
// positiva e QT_LICIT é a parte pública dela (AN-03, AN-04 A, RF-004).
// R-133: a divisão da venda do legado — Privado (pessoa jurídica fora dos
// ramos públicos), PF (TIPOFJ 'F') e Público (ramos 11 a 15) — sai no recorte
// de venda válida da R-131 (`venda-valida.mjs`): venda para a própria rede e
// remessa de entrega futura ficam fora das três. VENDA_PERIODO e
// VENDA_LICITACAO seguem como estão: são a base da sugestão (RN-001) e da
// cobertura (RN-004), e mudar a base é decisão do usuário, não desta tela.
const SQL_ANALISE_MONTAGEM = `SELECT
  P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODEPTO, P.CODSEC,
  NVL(P.QTUNITCX, 0)        AS UN_POR_CAIXA_ERP,
  NVL(E.QTEST, 0)           AS ESTOQUE,
  NVL(E.QTVENDMES, 0)       AS VENDA_MES_ATUAL,
  NVL(E.QTVENDMES1, 0)      AS VENDA_MES1,
  NVL(E.QTVENDMES2, 0)      AS VENDA_MES2,
  NVL(E.CUSTOULTENT, 0)     AS CUSTO_ULT_ENTRADA,
  TO_CHAR(E.DTULTENT, 'YYYY-MM-DD')    AS DT_ULT_ENTRADA,
  TO_CHAR(E.DTULTSAIDA, 'YYYY-MM-DD')  AS DT_ULT_SAIDA,
  NVL(E.QTPEDIDA, 0)        AS QT_PEDIDA_ERP,
  NVL(T.QTTRANSITO, 0)      AS TRANSITO,
  NVL(V.QT_TOTAL, 0)        AS VENDA_PERIODO,
  NVL(V.QT_LICIT, 0)        AS VENDA_LICITACAO,
  NVL(V.QT_PRIVADO, 0)      AS VENDA_PRIVADO,
  NVL(V.QT_PF, 0)           AS VENDA_PF,
  NVL(V.QT_PUBLICO, 0)      AS VENDA_PUBLICO
FROM PCPRODUT P
LEFT JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '{{codfilial}}'
LEFT JOIN (
  SELECT CODPROD, CODFILIAL, SUM(NVL(QTTRANSITO, 0)) AS QTTRANSITO
  FROM PCESTTRANSITO GROUP BY CODPROD, CODFILIAL
) T ON T.CODPROD = P.CODPROD AND T.CODFILIAL = '{{codfilial}}'
LEFT JOIN (
  SELECT X.CODPROD,
    SUM(X.QT) AS QT_TOTAL,
    SUM(CASE WHEN X.RAMO IN (11,12,13,14,15,20) THEN X.QT ELSE 0 END) AS QT_LICIT,
    SUM(CASE WHEN X.VALIDA = 1 AND X.EH_PUBLICO = 0 AND X.TIPOFJ <> 'F' THEN X.QT ELSE 0 END) AS QT_PRIVADO,
    SUM(CASE WHEN X.VALIDA = 1 AND X.EH_PUBLICO = 0 AND X.TIPOFJ = 'F' THEN X.QT ELSE 0 END) AS QT_PF,
    SUM(CASE WHEN X.VALIDA = 1 AND X.EH_PUBLICO = 1 THEN X.QT ELSE 0 END) AS QT_PUBLICO
  FROM (
    SELECT M.CODPROD, M.QT, NVL(C.CODATV1, 0) AS RAMO, NVL(C.TIPOFJ, 'J') AS TIPOFJ,
      CASE WHEN ${VENDA_VALIDA} THEN 1 ELSE 0 END AS VALIDA,
      CASE WHEN ${PUBLICO} THEN 1 ELSE 0 END AS EH_PUBLICO
    FROM PCMOV M
    LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
    WHERE M.CODOPER = 'S' AND M.QT > 0 AND M.CODFILIAL = '{{codfilial}}'
      AND M.DTMOV BETWEEN TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') AND TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
  ) X
  GROUP BY X.CODPROD
) V ON V.CODPROD = P.CODPROD
WHERE P.CODFORNEC = {{codfornec}}
  AND ${RECORTE_PRODUTO}
ORDER BY P.DESCRICAO`;

const SQL_BUSCAR_PRODUTO = `SELECT * FROM (
  SELECT P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODFORNEC, P.CODEPTO, P.CODSEC,
         NVL(P.QTUNITCX, 0) AS UN_POR_CAIXA_ERP,
         NVL(E.QTEST, 0) AS ESTOQUE, NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA
  FROM PCPRODUT P
  LEFT JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '{{codfilial}}'
  WHERE ${RECORTE_PRODUTO}
    AND ( P.CODPROD = {{codprod}}
          OR ({{codprod}} = 0 AND UPPER(P.DESCRICAO) LIKE '%' || UPPER('{{busca}}') || '%') )
  ORDER BY P.DESCRICAO
) WHERE ROWNUM <= 20`;

// Porte de sgcAlertaVencimentoLotes (p-45547/backend/add-alertas-analise.mjs)
// com o teto de dias parametrizado. Uma diferença deliberada do legado: o
// legado comparava com SYSDATE (com hora), o que fazia "60 dias" virar 59 à
// tarde; aqui a conta é em dias de calendário, TRUNC(SYSDATE).
const SQL_LOTES_A_VENCER = `WITH SALDO_LOTE AS (
  SELECT LE.CODFILIAL, EL.CODPROD, EL.NUMLOTE, SUM(NVL(EL.QT, 0)) AS QT_LOTE
  FROM PCESTENDLOTE EL
  JOIN PCLOTEEND LE ON LE.CODPROD = EL.CODPROD
    AND NVL(LE.NUMLOTE, '-') = NVL(EL.NUMLOTE, '-')
    AND LE.MODULO = EL.MODULO AND LE.RUA = EL.RUA AND LE.NUMERO = EL.NUMERO
    AND LE.APTO = EL.APTO AND NVL(LE.TIPOENDER, '-') = NVL(EL.TIPOENDER, '-')
  WHERE EL.CODPROD IN ({{codprods}}) AND NVL(EL.QT, 0) > 0
  GROUP BY LE.CODFILIAL, EL.CODPROD, EL.NUMLOTE
)
SELECT S.CODPROD, P.DESCRICAO, S.NUMLOTE, TO_CHAR(L.DTVALIDADE, 'YYYY-MM-DD') AS DTVALIDADE,
  S.CODFILIAL, F.RAZAOSOCIAL AS FILIAL, S.QT_LOTE,
  ROUND(L.DTVALIDADE - TRUNC(SYSDATE)) AS DIAS_PARA_VENCER,
  CASE WHEN S.CODFILIAL = '{{codfilial}}' THEN 'PEDIDO' ELSE 'OUTRA' END AS TIPO_FILIAL
FROM SALDO_LOTE S
JOIN PCLOTE L ON L.CODPROD = S.CODPROD AND NVL(L.NUMLOTE, '-') = NVL(S.NUMLOTE, '-')
  AND L.CODFILIAL = S.CODFILIAL
JOIN PCPRODUT P ON P.CODPROD = S.CODPROD
JOIN PCFILIAL F ON F.CODIGO = S.CODFILIAL
WHERE S.QT_LOTE > 0 AND L.DTVALIDADE IS NOT NULL
  AND L.DTVALIDADE <= TRUNC(SYSDATE) + {{diasValidade}}
ORDER BY L.DTVALIDADE ASC`;

// Porte de sgcAlertaExcessoFilial. Estoque sem venda nos três meses vale 9999:
// é excesso, não ausência de informação (RN-010).
const DIAS_ESTOQUE = `CASE WHEN (NVL(E.QTVENDMES, 0) + NVL(E.QTVENDMES1, 0) + NVL(E.QTVENDMES2, 0)) > 0
    THEN E.QTEST / ((NVL(E.QTVENDMES, 0) + NVL(E.QTVENDMES1, 0) + NVL(E.QTVENDMES2, 0)) / 90)
    ELSE 9999 END`;

const SQL_EXCESSO_OUTRAS_FILIAIS = `SELECT E.CODPROD, P.DESCRICAO, E.CODFILIAL, F.RAZAOSOCIAL AS FILIAL,
  E.QTEST, ROUND(${DIAS_ESTOQUE}, 1) AS DIAS_ESTOQUE
FROM PCEST E
JOIN PCPRODUT P ON P.CODPROD = E.CODPROD
JOIN PCFILIAL F ON F.CODIGO = E.CODFILIAL
WHERE E.CODPROD IN ({{codprods}})
  AND E.CODFILIAL <> '{{codfilial}}'
  AND E.QTEST > 0
  AND ${DIAS_ESTOQUE} > {{diasEstoque}}
ORDER BY DIAS_ESTOQUE DESC`;

const SQL_PRAZO_PAGAMENTO = `SELECT * FROM (
  SELECT TO_CHAR(P.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
         NVL(P.PRAZO1, 0) AS PRAZO1, NVL(P.PRAZO2, 0) AS PRAZO2, NVL(P.PRAZO3, 0) AS PRAZO3,
         NVL(P.VLTOTAL, 0) AS VL_TOTAL
  FROM PCPEDIDO P
  WHERE P.CODFORNEC = {{codfornec}}
    AND ('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
    AND NVL(P.PRAZO1, 0) > 0
  ORDER BY P.DTEMISSAO DESC
) WHERE ROWNUM <= 5`;

// A tabela PRODUTOS vive na conexão `gestao-de-custos`, que não é JDBC: uma SF
// type SQL com jdbcId não a alcança (AN-05 B). `event.codprods` é substituição
// textual dentro do SQL da integração; o loteamento em 500 continua no JS.
const CODE_UNIDADES_POR_CAIXA = JSON.stringify({
  connection: 'gestao-de-custos',
  method: 'POST',
  endpoint: 'runQuery',
  body: {
    sql: 'SELECT CODPROD, COALESCE(UNIDADES_POR_CAIXA, 1) AS UNIDADES_POR_CAIXA FROM PRODUTOS WHERE CODPROD IN (event.codprods)',
  },
});

/* ─────────────── leituras — banco do projeto ─────────────── */

// Spec 012 (R-109): devolve os tres pares alvo/tolerancia e o ATIVO, e o
// `WHERE ATIVO = 1` fixo virou o filtro {{situacao}} ('' = todas, 'ativa',
// 'inativa'). Sem linha inativa em maos, a tela de coberturas nao tem `antes`
// para comparar e a acao `reativou` seria inalcancavel (RF-009/C-010). A aba
// Itens da 003 continua chamando sem `situacao` e nao muda de resultado: a
// regua pura descarta a linha inativa na resolucao (RN-002).
const SQL_COBERTURA_LISTAR = `SELECT ID, NIVEL, CODIGO, DESCRICAO,
       ALVO_A_DIAS, TOLERANCIA_A_PCT,
       ALVO_B_DIAS, TOLERANCIA_B_PCT,
       ALVO_C_DIAS, TOLERANCIA_C_PCT,
       ATIVO, ATUALIZADO_POR, ATUALIZADO_EM
FROM SGC_COBERTURA
WHERE ('{{nivel}}' = '' OR NIVEL = '{{nivel}}')
  AND ('{{situacao}}' = '' OR ('{{situacao}}' = 'ativa' AND ATIVO = 1)
                           OR ('{{situacao}}' = 'inativa' AND ATIVO = 0))
ORDER BY CASE NIVEL WHEN 'sku' THEN 1 WHEN 'secao' THEN 2 WHEN 'departamento' THEN 3 ELSE 4 END, CODIGO
LIMIT {{limite}} OFFSET {{offset}}`;

// RN-012: um predicado por condição, na ordem da regra; a PRIMEIRA que falha
// define o MOTIVO. Cancelar nunca passa por aqui (D-009). A comparação de
// prazo é texto contra texto porque os dois lados chegam normalizados pela
// regra pura (`normalizarPrazo`, D-005) — uma regra, dois lugares.
//
// Este corpo é o mesmo que a 002 usa na subconsulta PENDENCIAS de
// sgcPodeMover; o trecho pronto para colar está em backend/sql/pendencias-analise.sql.
const SQL_SAIDA_VERIFICAR = `SELECT
  CASE WHEN A.PENDENTES > 0
         OR A.SEM_JUSTIF_ALERTA > 0
         OR A.SEM_JUSTIF_COBERTURA > 0
         OR A.PRAZO_FALTA > 0
         OR A.COM_QUANTIDADE = 0 THEN 0 ELSE 1 END AS PODE,
  CASE
    WHEN A.PENDENTES > 0 THEN CONCAT('Leia os ', A.PENDENTES, ' alertas deste pedido antes de enviar para aprovação.')
    WHEN A.SEM_JUSTIF_ALERTA > 0 THEN CONCAT('Justifique os itens com alerta que seguem com quantidade (', A.SEM_JUSTIF_ALERTA, '), a começar por ', A.EXEMPLO_ALERTA, '.')
    WHEN A.SEM_JUSTIF_COBERTURA > 0 THEN CONCAT('Justifique os itens com cobertura acima do limite (', A.SEM_JUSTIF_COBERTURA, '), a começar por ', A.EXEMPLO_COBERTURA, '.')
    WHEN A.PRAZO_FALTA = 1 THEN 'Informe o prazo de pagamento padrão do fornecedor antes de enviar para aprovação.'
    WHEN A.PRAZO_FALTA = 2 THEN 'Informe o prazo de pagamento acordado neste pedido antes de enviar para aprovação.'
    WHEN A.PRAZO_FALTA = 3 THEN 'O prazo acordado difere do padrão do fornecedor. Justifique a diferença em pelo menos 10 caracteres.'
    WHEN A.COM_QUANTIDADE = 0 THEN 'Informe a quantidade de pelo menos um item antes de enviar para aprovação.'
    ELSE '' END AS MOTIVO
FROM (
  SELECT
    (SELECT COUNT(*) FROM SGC_ALERTA AL
      WHERE AL.ID_CARD = P.ID_CARD AND AL.LIDO = 0) AS PENDENTES,
    (SELECT COUNT(*) FROM SGC_PEDIDO_ITEM I
      WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0
        AND EXISTS (SELECT 1 FROM SGC_ALERTA AL WHERE AL.ID_CARD = I.ID_CARD AND AL.CODPROD = I.CODPROD
                      AND TRIM(COALESCE(AL.JUSTIFICATIVA, '')) = '')) AS SEM_JUSTIF_ALERTA,
    (SELECT MIN(I.DESCRICAO) FROM SGC_PEDIDO_ITEM I
      WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0
        AND EXISTS (SELECT 1 FROM SGC_ALERTA AL WHERE AL.ID_CARD = I.ID_CARD AND AL.CODPROD = I.CODPROD
                      AND TRIM(COALESCE(AL.JUSTIFICATIVA, '')) = '')) AS EXEMPLO_ALERTA,
    (SELECT COUNT(*) FROM SGC_PEDIDO_ITEM I
      WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0
        AND I.COBERTURA_DIAS > I.COBERTURA_LIMITE
        AND TRIM(COALESCE(I.COBERTURA_JUSTIFICATIVA, '')) = '') AS SEM_JUSTIF_COBERTURA,
    (SELECT MIN(I.DESCRICAO) FROM SGC_PEDIDO_ITEM I
      WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0
        AND I.COBERTURA_DIAS > I.COBERTURA_LIMITE
        AND TRIM(COALESCE(I.COBERTURA_JUSTIFICATIVA, '')) = '') AS EXEMPLO_COBERTURA,
    CASE
      WHEN TRIM(COALESCE(P.PRAZO_PADRAO, '')) = '' THEN 1
      WHEN TRIM(COALESCE(P.PRAZO_ACORDADO, '')) = '' THEN 2
      WHEN UPPER(TRIM(P.PRAZO_PADRAO)) <> UPPER(TRIM(P.PRAZO_ACORDADO))
           AND LENGTH(TRIM(COALESCE(P.PRAZO_JUSTIFICATIVA, ''))) < 10 THEN 3
      ELSE 0 END AS PRAZO_FALTA,
    (SELECT COUNT(*) FROM SGC_PEDIDO_ITEM I
      WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0) AS COM_QUANTIDADE
  FROM SGC_PEDIDO P
  WHERE P.ID_CARD = {{cardId}}
) A`;

/* ─────────────── escritas SQL (uma instrução por SF) ─────────────── */

const COLUNAS_ITEM = `ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, UN_POR_CAIXA,
   QT_VENDA_TOTAL, QT_VENDA_LICITACAO, QT_ESTOQUE, QT_TRANSITO, QT_SUGERIDA, QT_PEDIDA,
   PRECO_CUSTO, TIPO_PRECO, CURVA_ABC, COBERTURA_DIAS, COBERTURA_LIMITE,
   COBERTURA_JUSTIFICATIVA, OBSERVACAO, STATUS, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM`;

const COLUNAS_ALERTA = 'ID_CARD, CODPROD, TIPO, CHAVE, MENSAGEM, LIDO, CRIADO_EM';

const emLista = (colunas) => colunas.split(',').map((coluna) => coluna.trim());

// D-006: um upsert de várias tuplas, em lotes de 200 — 200 itens não podem
// virar 200 execuções (teto de 300/min do projeto). `{{linhas}}` é FRAGMENTO
// de SQL montado pelo sgcItensGravar (que escapa o texto), não valor de
// coluna: por isso vai sem aspas. CRIADO_EM não entra no UPDATE.
//
// A1: o lote é `SELECT … UNION ALL SELECT …` dentro de uma derivada, e não
// `VALUES (…), (…)`, justamente para caber o `WHERE <guarda>` — que vale para
// o lote inteiro, numa execução só (o teto de RNF-001 não muda).
const SQL_ITEM_GRAVAR = `INSERT INTO SGC_PEDIDO_ITEM (${COLUNAS_ITEM})
SELECT * FROM ({{linhas}}) LOTE
WHERE ${guardaInterna(MONTAGEM)}
ON DUPLICATE KEY UPDATE
  DESCRICAO = VALUES(DESCRICAO), EMBALAGEM = VALUES(EMBALAGEM), UNIDADE = VALUES(UNIDADE),
  CODEPTO = VALUES(CODEPTO), CODSEC = VALUES(CODSEC), UN_POR_CAIXA = VALUES(UN_POR_CAIXA),
  QT_VENDA_TOTAL = VALUES(QT_VENDA_TOTAL), QT_VENDA_LICITACAO = VALUES(QT_VENDA_LICITACAO),
  QT_ESTOQUE = VALUES(QT_ESTOQUE), QT_TRANSITO = VALUES(QT_TRANSITO), QT_SUGERIDA = VALUES(QT_SUGERIDA),
  QT_PEDIDA = VALUES(QT_PEDIDA), PRECO_CUSTO = VALUES(PRECO_CUSTO), TIPO_PRECO = VALUES(TIPO_PRECO),
  CURVA_ABC = VALUES(CURVA_ABC), COBERTURA_DIAS = VALUES(COBERTURA_DIAS),
  COBERTURA_LIMITE = VALUES(COBERTURA_LIMITE), COBERTURA_JUSTIFICATIVA = VALUES(COBERTURA_JUSTIFICATIVA),
  OBSERVACAO = VALUES(OBSERVACAO), STATUS = VALUES(STATUS),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`;

const ESCRITAS = [
  {
    name: 'sgcEscItemGravar',
    resumo: 'RF-012 - upsert em lote dos itens do pedido (uma execução por lote de 200 tuplas). Params: linhas (fragmento SELECT montado por sgcItensGravar), usuarioId int',
    interna: true,
    code: SQL_ITEM_GRAVAR,
  },
  {
    name: 'sgcEscItemRemover',
    resumo: 'RF-011 - remove um item da lista (exclusão lógica). Params: idCard int, codprod int, atualizadoEm string',
    code: `UPDATE SGC_PEDIDO_ITEM SET STATUS = 'removido', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID_CARD = {{idCard}} AND CODPROD = {{codprod}} AND STATUS <> 'removido'
  AND ${guarda(MONTAGEM)}`,
  },
  {
    name: 'sgcEscItemRemoverZerados',
    resumo: 'RF-024/RN-014 - ao sair da Análise, item sem quantidade sai da lista. Params: idCard int, usuarioId int, atualizadoEm string',
    interna: true,
    code: `UPDATE SGC_PEDIDO_ITEM SET STATUS = 'removido', ATUALIZADO_POR = {{usuarioId}}, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID_CARD = {{idCard}} AND STATUS IN ('montagem', 'reprovado') AND QT_PEDIDA <= 0
  AND ${guardaInterna(MONTAGEM)}`,
  },
  {
    name: 'sgcEscItemStatusFase',
    resumo: 'RF-026/RN-013 - situação do item acompanhando a fase do pedido (a tela da 002 chama com aprovado e com enviado, F-07). Params: idCard int, status string, atualizadoEm string',
    code: `UPDATE SGC_PEDIDO_ITEM SET STATUS = '{{status}}', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID_CARD = {{idCard}} AND STATUS <> 'removido'
  AND ${guarda([...MONTAGEM, 'diretoria'])}`,
  },
  {
    name: 'sgcEscAlertaInserir',
    resumo: 'RF-016 - upsert dos alertas gerados; regerar NAO apaga LIDO nem JUSTIFICATIVA. Params: linhas (fragmento SELECT montado por sgcAlertasGerar), usuarioId int',
    interna: true,
    code: `INSERT INTO SGC_ALERTA (ID_CARD, CODPROD, TIPO, CHAVE, MENSAGEM, LIDO, CRIADO_EM)
SELECT * FROM ({{linhas}}) LOTE
WHERE ${guardaInterna(MONTAGEM)}
ON DUPLICATE KEY UPDATE MENSAGEM = VALUES(MENSAGEM)`,
  },
  {
    name: 'sgcEscAlertaRemoverObsoletos',
    resumo: 'RF-016 - apaga o alerta cuja causa sumiu (chave fora da lista viva). Params: idCard int, chaves (fragmento de lista montado por sgcAlertasGerar), usuarioId int',
    interna: true,
    code: `DELETE FROM SGC_ALERTA
WHERE ID_CARD = {{idCard}} AND CHAVE NOT IN ({{chaves}})
  AND ${guardaInterna(MONTAGEM)}`,
  },
  {
    name: 'sgcEscAlertaLer',
    resumo: 'RF-017 - marca alerta como lido (id 0 = todos os do pedido). Params: idCard int, id int, lidoEm string',
    code: `UPDATE SGC_ALERTA SET LIDO = 1, LIDO_POR = :VAR_USER, LIDO_EM = '{{lidoEm}}'
WHERE ID_CARD = {{idCard}} AND LIDO = 0 AND ({{id}} = 0 OR ID = {{id}})
  AND ${guarda(MONTAGEM)}`,
  },
  {
    name: 'sgcEscAlertaJustificar',
    resumo: 'RF-018 - justificativa de comprar mesmo com alerta, para todos os alertas do produto de uma vez. Params: idCard int, codprod int, justificativa string',
    code: `UPDATE SGC_ALERTA SET JUSTIFICATIVA = '{{justificativa}}'
WHERE ID_CARD = {{idCard}} AND CODPROD = {{codprod}}
  AND ${guarda(MONTAGEM)}`,
  },
  {
    name: 'sgcEscCoberturaGravar',
    resumo: 'RF-027/RF-001 (012) - cobertura por nível: alvo em dias e tolerância em % para cada curva ABC (cadastro e edição); regravar reativa o que foi desativado. Params: nivel string, codigo string, descricao string, alvoADias int, toleranciaAPct número, alvoBDias int, toleranciaBPct número, alvoCDias int, toleranciaCPct número, atualizadoEm string',
    code: `INSERT INTO SGC_COBERTURA (NIVEL, CODIGO, DESCRICAO,
  ALVO_A_DIAS, TOLERANCIA_A_PCT, ALVO_B_DIAS, TOLERANCIA_B_PCT, ALVO_C_DIAS, TOLERANCIA_C_PCT,
  ATIVO, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT '{{nivel}}', '{{codigo}}', '{{descricao}}',
  {{alvoADias}}, {{toleranciaAPct}}, {{alvoBDias}}, {{toleranciaBPct}}, {{alvoCDias}}, {{toleranciaCPct}},
  1, '{{atualizadoEm}}', :VAR_USER, '{{atualizadoEm}}'
FROM DUAL
WHERE ${guarda(COBERTURA)}
ON DUPLICATE KEY UPDATE
  DESCRICAO = VALUES(DESCRICAO),
  ALVO_A_DIAS = VALUES(ALVO_A_DIAS), TOLERANCIA_A_PCT = VALUES(TOLERANCIA_A_PCT),
  ALVO_B_DIAS = VALUES(ALVO_B_DIAS), TOLERANCIA_B_PCT = VALUES(TOLERANCIA_B_PCT),
  ALVO_C_DIAS = VALUES(ALVO_C_DIAS), TOLERANCIA_C_PCT = VALUES(TOLERANCIA_C_PCT),
  ATIVO = 1,
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`,
  },
  {
    name: 'sgcEscCoberturaExcluir',
    resumo: 'RF-027 - exclusão é desativação: o limite sai da resolução e o histórico fica. Params: id int, atualizadoEm string',
    code: `UPDATE SGC_COBERTURA SET ATIVO = 0, ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID = {{id}} AND ${guarda(COBERTURA)}`,
  },
  {
    name: 'sgcEscPedidoPrazo',
    resumo: 'RF-019/RF-020 - prazo padrão, acordado e justificativa, já normalizados pela regra pura (D-005). Params: idCard int, prazoPadrao string, prazoAcordado string, prazoJustificativa string',
    code: `UPDATE SGC_PEDIDO SET PRAZO_PADRAO = '{{prazoPadrao}}', PRAZO_ACORDADO = '{{prazoAcordado}}',
  PRAZO_JUSTIFICATIVA = '{{prazoJustificativa}}'
WHERE ID_CARD = {{idCard}} AND ${guarda(MONTAGEM)}`,
  },
  {
    name: 'sgcEscPedidoTotal',
    resumo: 'RF-013/RN-008 - o total soma no próprio banco, nunca chega por parâmetro (AN-12). Params: idCard int, usuarioId int',
    interna: true,
    code: `UPDATE SGC_PEDIDO SET VL_TOTAL = (
  SELECT COALESCE(SUM(I.QT_PEDIDA * I.PRECO_CUSTO), 0) FROM SGC_PEDIDO_ITEM I
  WHERE I.ID_CARD = {{idCard}} AND I.STATUS <> 'removido'
)
WHERE ID_CARD = {{idCard}} AND ${guardaInterna(MONTAGEM)}`,
  },
];

const AVISO_INTERNA = 'Escrita interna, chamada por id de dentro das server functions JAVASCRIPT da spec 003; leva a guarda de persona sobre o usuarioId recebido (A1). Nao chamar do frontend.';

/* ─────────────── JavaScript (orquestração) ─────────────── */

// Preâmbulo comum. Regra de casa: nenhum `{{` literal aqui dentro — o que
// chega a um `{{param}}` é o `input` das chamadas por id.
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
  return desembrulhar(await executeServerFunctionMitra({ projectId, serverFunctionId: Number(id), input: entrada || {} }));
}
function inteiro(valor) { const n = Number(valor); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function numero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
// Aspa simples dobrada e caractere de controle fora: o texto do ERP entra num
// fragmento VALUES, então o escape é aqui (risco do plan).
function texto(valor, teto) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\\u0000-\\u001f]/g, ' ').slice(0, teto || 200).replace(/'/g, "''");
}
// A1: o lote vai como derivada SELECT ... UNION ALL SELECT ... (e nao VALUES),
// que e a unica forma de pendurar o WHERE da guarda numa execucao so. Apenas a
// primeira linha nomeia as colunas: o MySQL exige nome na derivada, o SQLite
// aceita igual.
function lote(colunas, linhas) {
  return linhas.map(function (valores, ordem) {
    return 'SELECT ' + valores.map(function (valor, coluna) {
      return ordem === 0 ? valor + ' AS ' + colunas[coluna] : valor;
    }).join(', ');
  }).join(' UNION ALL ');
}
function agora() { return new Date().toISOString().slice(0, 19); }
function moeda(valor) {
  const partes = Math.abs(numero(valor)).toFixed(2).split('.');
  return (numero(valor) < 0 ? '-R$ ' : 'R$ ')
    + partes[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + ',' + partes[1];
}
// R-013: o MESMO mapa de ACCESS_LEVEL da guarda SQL da 002, aqui em JS, porque
// :VAR_USER não se propaga em chamada aninhada — a persona é conferida ANTES
// de qualquer escrita e as escritas recebem usuarioId cru.
//
// fallbackId só vale quando a sessao NAO resolve (chamada aninhada, sem
// sessao), como o criadoPor de kbCardCriar da lib: e por ele que o
// sgcAnaliseSair consegue regerar os alertas em nome de quem ja autenticou.
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
function podeMontar(quem) {
  return quem.id > 0 && quem.nivel !== 'READ_ONLY' && ['admin', 'analista', 'gestor'].indexOf(quem.persona) !== -1;
}
// P-08 B (A2): RESTRICTED so opera os PROPRIOS cards. A conferencia mora aqui,
// num lugar so, porque toda escrita de montagem passa por este pedido.
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

const JS_ITENS_GRAVAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!podeMontar(quem)) return { ok: false, erro: 'Seu perfil não pode editar os itens deste pedido.' };
if (!await pedidoEmAnalise(cardId, quem.id)) return { ok: false, erro: FORA_DA_ANALISE };

let itens = event.itensJson;
if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch (e) { itens = null; } }
if (!Array.isArray(itens)) return { ok: false, erro: 'Lista de itens inválida.' };
itens = itens.filter(function (item) { return inteiro(item && item.codprod) > 0; });
if (itens.length === 0) return { ok: true, itens: 0, total: 0 };

const COLUNAS = ${JSON.stringify(emLista(COLUNAS_ITEM))};
const quando = agora();
const tuplas = itens.map(function (item) {
  // R-133: o custo do item é o padrão (Gestão de Custos), o de uma tabela especial ou digitado (manual).
  const tipoPreco = ['especial', 'manual'].indexOf(String(item.tipoPreco || '')) !== -1 ? String(item.tipoPreco) : 'padrao';
  const curva = ['A', 'B', 'C'].indexOf(String(item.curvaAbc || '')) !== -1 ? String(item.curvaAbc) : 'C';
  return [
    cardId, inteiro(item.codprod),
    "'" + texto(item.descricao, 200) + "'", "'" + texto(item.embalagem, 60) + "'", "'" + texto(item.unidade, 10) + "'",
    inteiro(item.codepto), inteiro(item.codsec), numero(item.unPorCaixa),
    numero(item.qtVendaTotal), numero(item.qtVendaLicitacao), numero(item.qtEstoque), numero(item.qtTransito),
    numero(item.qtSugerida), numero(item.qtPedida), numero(item.precoCusto),
    "'" + tipoPreco + "'", "'" + curva + "'",
    // R-108: numero(), nao inteiro() — inteiro() e Math.trunc e engoliria o
    // teto 49,5 da curva B mesmo com a coluna DECIMAL(15,2).
    numero(item.coberturaDias), numero(item.coberturaLimite),
    "'" + texto(item.coberturaJustificativa, 500) + "'", "'" + texto(item.observacao, 500) + "'",
    "'montagem'", "'" + quando + "'", quem.id, "'" + quando + "'",
  ];
});

// Lotes de 200 tuplas: 200 itens alterados são 2 execuções aninhadas, não 200 (D-006).
for (let inicio = 0; inicio < tuplas.length; inicio += 200) {
  await chamar('sgcEscItemGravar', { linhas: lote(COLUNAS, tuplas.slice(inicio, inicio + 200)), usuarioId: quem.id });
}
await chamar('sgcEscPedidoTotal', { idCard: cardId, usuarioId: quem.id });
const capa = await consultar('SELECT VL_TOTAL FROM SGC_PEDIDO WHERE ID_CARD = ' + cardId);
return { ok: true, itens: itens.length, total: numero(capa[0] && capa[0].VL_TOTAL) };`;

const JS_ALERTAS_GERAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona(event.usuarioId);
if (!podeMontar(quem)) return { ok: false, erro: 'Seu perfil não pode gerar os alertas deste pedido.' };

const capa = await consultar('SELECT CODFILIAL FROM SGC_PEDIDO WHERE ID_CARD = ' + cardId);
if (!capa[0]) return { ok: false, erro: 'Pedido não encontrado.' };
const codfilial = String(capa[0].CODFILIAL || '');

const itens = await consultar(
  'SELECT CODPROD FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ' + cardId + " AND STATUS <> 'removido'");
const codprods = itens.map(function (linha) { return inteiro(linha.CODPROD); }).filter(function (c) { return c > 0; });

const COLUNAS = ${JSON.stringify(emLista(COLUNAS_ALERTA))};
const quando = agora();
const tuplas = [];
const chaves = [];
function acrescentar(tipo, codprod, chave, mensagem) {
  if (chaves.indexOf(chave) !== -1) return;
  chaves.push(chave);
  tuplas.push([cardId, codprod, "'" + tipo + "'", "'" + texto(chave, 120) + "'", "'" + texto(mensagem, 400) + "'", 0, "'" + quando + "'"]);
}

// ORA-01795: o IN do Oracle para em 1.000 expressões; o legado já fatiava.
for (let inicio = 0; inicio < codprods.length; inicio += 500) {
  const lote = codprods.slice(inicio, inicio + 500).join(', ');
  const lotes = linhasDe(await chamar('sgcWintLotesAVencer', { codprods: lote, codfilial: codfilial, diasValidade: 90 }));
  for (const linha of lotes) {
    const dias = inteiro(linha.DIAS_PARA_VENCER);
    const chave = 'vencimento:' + inteiro(linha.CODPROD) + ':' + String(linha.CODFILIAL || '') + ':' + String(linha.NUMLOTE || '');
    acrescentar('vencimento', inteiro(linha.CODPROD), chave,
      'Lote ' + String(linha.NUMLOTE || '') + ' com ' + numero(linha.QT_LOTE) + ' un na filial ' + String(linha.FILIAL || linha.CODFILIAL || '')
      + ' vence em ' + dias + ' dias (' + String(linha.DTVALIDADE || '') + ').');
  }
  const excessos = linhasDe(await chamar('sgcWintExcessoOutrasFiliais', { codprods: lote, codfilial: codfilial, diasEstoque: 80 }));
  for (const linha of excessos) {
    const chave = 'excesso:' + inteiro(linha.CODPROD) + ':' + String(linha.CODFILIAL || '');
    acrescentar('excesso', inteiro(linha.CODPROD), chave,
      'A filial ' + String(linha.FILIAL || linha.CODFILIAL || '') + ' tem ' + numero(linha.QTEST) + ' un em estoque — '
      + numero(linha.DIAS_ESTOQUE) + ' dias de cobertura.');
  }
}

if (tuplas.length > 0) {
  for (let inicio = 0; inicio < tuplas.length; inicio += 200) {
    await chamar('sgcEscAlertaInserir', { linhas: lote(COLUNAS, tuplas.slice(inicio, inicio + 200)), usuarioId: quem.id });
  }
}
// Lista vazia não pode virar NOT IN () — a chave impossível apaga tudo.
const vivas = chaves.length > 0
  ? chaves.map(function (chave) { return "'" + texto(chave, 120) + "'"; }).join(', ')
  : "'__sem_alerta__'";
await chamar('sgcEscAlertaRemoverObsoletos', { idCard: cardId, chaves: vivas, usuarioId: quem.id });

const pendentes = await consultar('SELECT COUNT(*) AS N FROM SGC_ALERTA WHERE ID_CARD = ' + cardId + ' AND LIDO = 0');
return { ok: true, total: chaves.length, naoLidos: inteiro(pendentes[0] && pendentes[0].N) };`;

// D-013: verifica, arruma e só então a TELA move. PODE = 0 não grava nada.
const JS_ANALISE_SAIR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!podeMontar(quem)) return { ok: false, erro: 'Seu perfil não pode enviar este pedido para a aprovação técnica.' };
if (!await pedidoEmAnalise(cardId, quem.id)) return { ok: false, erro: FORA_DA_ANALISE };

// AL-03: recalcula os alertas antes de barrar — o que sumiu não pode travar.
const gerados = await chamar('sgcAlertasGerar', { cardId: cardId, usuarioId: quem.id });
if (gerados && gerados.ok === false) return { ok: false, erro: String(gerados.erro || 'Não foi possível recalcular os alertas.') };

const veredicto = linhasDe(await chamar('sgcAnaliseSaidaVerificar', { cardId: cardId }))[0];
if (!veredicto) return { ok: false, erro: 'Pedido não encontrado.' };
if (inteiro(veredicto.PODE) !== 1) return { ok: false, erro: String(veredicto.MOTIVO || 'Este pedido ainda não pode sair da Análise.') };

const resumo = (await consultar(
  'SELECT COUNT(*) AS VIVOS,'
  + ' SUM(CASE WHEN I.QT_PEDIDA <= 0 THEN 1 ELSE 0 END) AS ZERADOS,'
  + " SUM(CASE WHEN I.QT_PEDIDA > 0 AND TRIM(COALESCE(I.COBERTURA_JUSTIFICATIVA, '')) <> '' THEN 1 ELSE 0 END) AS JUST_COBERTURA"
  + ' FROM SGC_PEDIDO_ITEM I WHERE I.ID_CARD = ' + cardId + " AND I.STATUS <> 'removido'"))[0] || {};
const linhaJust = (await consultar(
  'SELECT COUNT(DISTINCT AL.CODPROD) AS N FROM SGC_ALERTA AL'
  + ' JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = AL.ID_CARD AND I.CODPROD = AL.CODPROD'
  + ' WHERE AL.ID_CARD = ' + cardId + " AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0"
  + " AND TRIM(COALESCE(AL.JUSTIFICATIVA, '')) <> ''"))[0] || {};
const justAlerta = inteiro(linhaJust.N);

const quando = agora();
await chamar('sgcEscItemRemoverZerados', { idCard: cardId, usuarioId: quem.id, atualizadoEm: quando });
await chamar('sgcEscPedidoTotal', { idCard: cardId, usuarioId: quem.id });
// AT-04/R-011: a SF é da 002 e recebe usuarioId cru (chamada aninhada não
// propaga :VAR_USER); a persona já foi conferida acima, antes de escrever.
await chamar('sgcEscPedidoReprovacoesLimpar', { idCard: cardId, usuarioId: quem.id });

const capa = await consultar('SELECT VL_TOTAL FROM SGC_PEDIDO WHERE ID_CARD = ' + cardId);
const total = numero(capa[0] && capa[0].VL_TOTAL);
const restantes = inteiro(resumo.VIVOS) - inteiro(resumo.ZERADOS);
const removidos = inteiro(resumo.ZERADOS);
let nota = 'Pedido enviado para a aprovação técnica com ' + restantes + ' itens (' + moeda(total) + ').';
if (justAlerta > 0 || inteiro(resumo.JUST_COBERTURA) > 0) {
  nota += ' ' + justAlerta + ' itens justificados por alerta, ' + inteiro(resumo.JUST_COBERTURA) + ' por cobertura acima do limite.';
}
if (removidos > 0) nota += ' ' + removidos + ' itens zerados foram removidos.';
// D-07: a nota é registro, não pré-requisito — falha dela não desfaz a saída.
try {
  await chamar('kbNotaRegistrar', { cardId: cardId, texto: nota, usuarioId: quem.id });
} catch (e) { /* a saída já aconteceu; a nota é acessória */ }

return { ok: true, itens: restantes, removidos: removidos, total: total };`;

/* ─────────────── a lista publicada ─────────────── */

const LEITURAS = [
  { name: 'sgcWintAnaliseMontagem', code: SQL_ANALISE_MONTAGEM, resumo: 'RF-001/RF-002/RF-003/RF-004 - a análise do pedido numa consulta: venda do período (licitação à parte e dentro dela), a venda válida dividida em privado, PF e público (R-133), estoque, trânsito, custo e datas. Params: codfornec int, codfilial string, dataInicio string, dataFim string' },
  { name: 'sgcWintBuscarProduto', code: SQL_BUSCAR_PRODUTO, resumo: 'RF-011 - busca por código ou parte do nome, no máximo 20, só produto ativo e fora dos departamentos 4 e 7. Params: codprod int, busca string, codfilial string' },
  { name: 'sgcWintLotesAVencer', code: SQL_LOTES_A_VENCER, resumo: 'RF-014/RN-009 - lotes com saldo e validade dentro do teto de dias, em qualquer filial. Params: codprods lista, codfilial string, diasValidade int' },
  { name: 'sgcWintExcessoOutrasFiliais', code: SQL_EXCESSO_OUTRAS_FILIAIS, resumo: 'RF-015/RN-010 - produto com dias de estoque acima do teto numa filial diferente da do pedido. Params: codprods lista, codfilial string, diasEstoque int' },
  { name: 'sgcWintPrazoPagamento', code: SQL_PRAZO_PAGAMENTO, resumo: 'RF-019 - condição praticada pelo fornecedor nos 5 pedidos de compra mais recentes do ERP (D-004). Params: codfornec int, codfilial string' },
  { name: 'sgcCoberturaListar', code: SQL_COBERTURA_LISTAR, resumo: 'RF-009/RF-027 - coberturas parametrizadas com alvo e tolerância por curva ABC, do mais específico para o mais geral. Params: nivel string, situacao string (vazio = todas, ativa, inativa), limite int, offset int' },
  { name: 'sgcAnaliseSaidaVerificar', code: SQL_SAIDA_VERIFICAR, resumo: 'RF-022/RN-012 - as cinco exigências de saída da Análise, na ordem da regra; devolve PODE e o MOTIVO da primeira que falha. Params: cardId int' },
];

const JAVASCRIPT = [
  { name: 'sgcItensGravar', code: JS_ITENS_GRAVAR, resumo: 'RF-012/RF-013 - grava os itens alterados em lote e devolve o total recalculado. Params: cardId int, itensJson JSON' },
  { name: 'sgcAlertasGerar', code: JS_ALERTAS_GERAR, resumo: 'RF-014/RF-015/RF-016 - regera os alertas do pedido preservando leitura e justificativa. Params: cardId int' },
  { name: 'sgcAnaliseSair', code: JS_ANALISE_SAIR, resumo: 'RF-022/RF-024/RF-025 - o passo do antesDeMover em analise -> tecnica: verifica, e só então remove zerados, recalcula o total, limpa as reprovações e registra o resumo. Params: cardId int' },
];

/** Materializa `definitions` com o mapa nome -> id injetado nos corpos JAVASCRIPT. */
export function montarDefinitions(ids) {
  return [
    ...LEITURAS.map((f) => ({ name: f.name, type: 'SQL', description: f.resumo, code: f.code })),
    {
      name: 'sgcCustoUnidadesPorCaixa',
      type: 'INTEGRATION',
      description: 'RF-006/RN-002 (AN-05 B) - unidades por caixa por CODPROD, da conexão gestao-de-custos. Params: codprods lista',
      code: CODE_UNIDADES_POR_CAIXA,
    },
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

  // Primeiro SQL e INTEGRATION; só então as JAVASCRIPT, com os ids REAIS por
  // nome (R-016) — no primeiro publish as SFs chamadas por id ainda não existem.
  const semJs = definitions.filter((d) => d.type !== 'JAVASCRIPT');
  await publicar(semJs);
  const reais = Object.fromEntries(await existentes());
  await publicar(montarDefinitions({ ...idsDoMapa(MAPA), ...reais }).filter((d) => d.type === 'JAVASCRIPT'));

  console.log(`Pronto: ${definitions.length} server functions da spec 003 (itens do pedido).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
