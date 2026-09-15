-- spec 007 (produtos em B.O.) — R-030, RF-013, RF-014, RN-008, RN-012, R-044.
-- Fragmento para dentro de contextoDoCard() (add-005-quadro-compras.mjs),
-- colado pelo integrador junto do de pendencias-bo-entrada.sql e do da NF (005).
--
-- coluna PENDENCIAS_BO_ABERTOS (contagem de itens em aberto)
COALESCE((
  SELECT COUNT(*) FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto'
), 0) AS PENDENCIAS_BO_ABERTOS,

-- coluna PENDENCIAS_BO_MOTIVO (a frase, com a contagem e o plural certo; ''
-- quando não há pendência — nunca "Resolva os 0 itens")
COALESCE((
  SELECT CASE
           WHEN COUNT(*) = 0 THEN ''
           WHEN COUNT(*) = 1 THEN 'Resolva o 1 item em B.O. antes de concluir o pedido.'
           ELSE CONCAT('Resolva os ', COUNT(*), ' itens em B.O. antes de concluir o pedido.')
         END
  FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto'
), '') AS PENDENCIAS_BO_MOTIVO

-- Ramos prontos para dentro de sqlPodeMover() (T-013, integrador). bo>faturamento
-- e bo>cancelado NÃO ganham ramo (RF-014, RN-012): cancelar e voltar para
-- Faturamento não têm exigência de B.O.
--
-- No CASE do PODE:
--   WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0 THEN 0
--
-- No CASE do MOTIVO (dentro do bloco "senão PODE = 1"), encadeado DEPOIS do
-- bloco da NF da 005 (R-044 — o ramo leva a própria condição, para PODE = 0
-- nunca sair com motivo vazio quando a pendência é só de B.O.):
--   WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0
--     THEN T.PENDENCIAS_BO_MOTIVO
