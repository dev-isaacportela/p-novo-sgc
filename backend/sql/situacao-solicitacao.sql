-- SITUACAO (situação de atendimento da solicitação) — régua ÚNICA da spec 008
-- (R-052, R-070, R-075). Mesmo formato de `pendencias-transito.sql` (005):
-- cabeçalho em `--` com o contrato, corpo com uma expressão escalar.
--
-- Carregada por `fragmento('situacao-solicitacao.sql')`
-- (`backend/lib/fragmentos.mjs`, R-074) no `add-011` (a coluna `SITUACAO` de
-- `sgcSolicitacoesListar`, o filtro `{{situacao}}` dela e o
-- `sgcSolicitacoesListarTotal`) E no `add-012` (o `sgcSolicitacoesFunil` da
-- 009, R-076) — sempre por `${SITUACAO}`, nunca copiada à mão. Duas cópias
-- divergiriam no primeiro ajuste e os dois testes continuariam passando.
--
-- A situação NÃO é coluna: é derivada a cada consulta da fase do card e do
-- status do item (D-002). O legado gravava 13 status e precisava de um script
-- de correção retroativa porque eles envelheciam.
--
-- ── CONTRATO DE COMPOSIÇÃO (R-075) ────────────────────────────────────────
-- Quem cola esta expressão usa ESTES aliases e ESTES três LEFT JOIN, sem
-- exceção — `SF` e não `F`, porque `F` já é `SGC_FORNECEDOR` nas consultas da
-- 009 que compõem a mesma régua:
--
--   S  = SGC_SOLICITACAO (a tabela de origem da consulta)
--   LEFT JOIN KB_CARD C ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
--   LEFT JOIN SGC_FASE SF ON SF.BOARD_ID = C.BOARD_ID AND SF.FASE_ID = C.FASE_ID
--   LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD
--                               AND I.STATUS <> 'removido'
--
-- Card excluído cai em `sem_pedido`: a solicitação volta a ser demanda em
-- aberto e não herda a fase de um card que não existe mais. R-076: a régua
-- devolve `sem_pedido` também para `pendente`, `recusada` e `cancelada` — é por
-- isso que o funil da 009 agrega por STATUS **e** SITUACAO, e não só por uma.
--
-- Dona do arquivo a partir da S3: a spec 008 (a base o criou para as suítes 008
-- e 009 poderem ser escritas em paralelo).

CASE
  WHEN S.ID_CARD = 0 OR C.ID IS NULL        THEN 'sem_pedido'
  WHEN SF.CHAVE = 'cancelado'               THEN 'nao_atendida'
  WHEN COALESCE(I.STATUS, '') = 'bo'        THEN 'nao_atendida'
  WHEN SF.CHAVE = 'concluido'               THEN 'atendida'
  WHEN SF.CHAVE = 'analise'                 THEN 'em_analise'
  WHEN SF.CHAVE IN ('tecnica', 'diretoria') THEN 'em_aprovacao'
  WHEN SF.CHAVE = 'envio'                   THEN 'em_envio'
  WHEN SF.CHAVE = 'enviado'                 THEN 'enviada'
  WHEN SF.CHAVE = 'transito'                THEN 'em_transito'
  WHEN SF.CHAVE IN ('faturamento', 'bo')    THEN 'em_faturamento'
  ELSE 'sem_pedido'
END
