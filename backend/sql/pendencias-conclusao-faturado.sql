-- spec 005 (notas fiscais) — R-153 (P-6), RN-016: concluir só com 99,5 % do
-- valor do pedido coberto, como o legado (RN-NF-34: 99,5 % conta como 100 %).
-- Coberto = faturado nas notas + o saldo que foi para o B.O. e NÃO VEM MAIS
-- (SGC_BO_ITEM cancelado, pelo custo do item do pedido). Item de B.O. em
-- aberto já trava pela pendência da 007; liberado volta a esperar nota.
-- Pedido sem valor (VL_TOTAL 0) não tem o que faturar: não trava aqui.
--
-- Fragmento para dentro de contextoDoCard() (add-005-quadro-compras.mjs),
-- depois dos da NF (005) e do B.O. (007).
--
-- coluna PENDENCIAS_FATURADO (1 = falta faturar; 0 = pode concluir)
COALESCE((
  SELECT CASE
           WHEN COALESCE(P2.VL_TOTAL, 0) <= 0 THEN 0
           WHEN (COALESCE(P2.VL_FATURADO, 0) + COALESCE((
                   SELECT SUM(B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0))
                   FROM SGC_BO_ITEM B
                   JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD AND I.STATUS <> 'removido'
                   WHERE B.ID_CARD = P2.ID_CARD AND B.STATUS = 'cancelado'), 0)) * 100 >= P2.VL_TOTAL * 99.5 THEN 0
           ELSE 1
         END
  FROM SGC_PEDIDO P2 WHERE P2.ID_CARD = C.ID
), 0) AS PENDENCIAS_FATURADO
-- coluna PENDENCIAS_FATURADO_MOTIVO (a frase com quanto falta; '' quando não trava)
COALESCE((
  SELECT CASE
           WHEN COALESCE(P2.VL_TOTAL, 0) <= 0 THEN ''
           WHEN (COALESCE(P2.VL_FATURADO, 0) + COALESCE(BC.VL, 0)) * 100 >= P2.VL_TOTAL * 99.5 THEN ''
           ELSE CONCAT('Falta faturar R$ ',
                  FORMAT(P2.VL_TOTAL - COALESCE(P2.VL_FATURADO, 0) - COALESCE(BC.VL, 0), 2, 'pt_BR'),
                  ' (', FORMAT((COALESCE(P2.VL_FATURADO, 0) + COALESCE(BC.VL, 0)) * 100 / P2.VL_TOTAL, 1, 'pt_BR'),
                  ' % coberto; o mínimo para concluir é 99,5 %). Registre a nota complementar ou marque o saldo em B.O. como "não vem mais".')
         END
  FROM SGC_PEDIDO P2
  LEFT JOIN (
    SELECT B.ID_CARD, SUM(B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0)) AS VL
    FROM SGC_BO_ITEM B
    JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD AND I.STATUS <> 'removido'
    WHERE B.STATUS = 'cancelado'
    GROUP BY B.ID_CARD
  ) BC ON BC.ID_CARD = P2.ID_CARD
  WHERE P2.ID_CARD = C.ID
), '') AS PENDENCIAS_FATURADO_MOTIVO
-- Ramos prontos para dentro de sqlPodeMover() (add-005), DEPOIS dos da NF e do B.O.:
--   no PODE:   WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_FATURADO > 0 THEN 0
--   no MOTIVO: WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_FATURADO > 0
--                THEN T.PENDENCIAS_FATURADO_MOTIVO
