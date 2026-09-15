-- spec 007 (produtos em B.O.) — R-030, RF-005, RN-003.
-- Fragmento para dentro de contextoDoCard() (add-005-quadro-compras.mjs),
-- colado pelo integrador junto do de pendencias-conclusao-bo.sql e do da NF (005).
--
-- coluna PENDENCIAS_BO_ENTRADA (1 = não há item marcado; 0 = pode entrar)
COALESCE((
  SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
  FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto'
), 1) AS PENDENCIAS_BO_ENTRADA

-- Ramos prontos para dentro de sqlPodeMover() (T-013, integrador):
--
-- No CASE do PODE:
--   WHEN T.PAR = 'faturamento>bo' AND T.PENDENCIAS_BO_ENTRADA > 0 THEN 0
--
-- No CASE do MOTIVO (dentro do bloco "senão PODE = 1"):
--   WHEN T.PAR = 'faturamento>bo'
--     THEN '${M.boEntrada}'
--
-- Texto novo em M (add-005) e em MOTIVOS (transicoes.ts), o mesmo caractere a
-- caractere (o teste de 500 combinações da 002 compara):
--   boEntrada: 'Marque ao menos um item em B.O. antes de mover o pedido para Produtos em B.O.'
