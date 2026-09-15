-- PENDENCIAS_TRANSITO / PENDENCIAS_TRANSITO_MOTIVO do `sgcPodeMover` (spec 002)
-- — bloco da spec 005 (notas fiscais), R-030 / RN-012 / RF-014.
--
-- Mesmo formato de `pendencias-analise.sql` (003): duas colunas, uma
-- subconsulta escalar cada, sobre `C.ID` (o card), para o INTEGRADOR colar em
-- `contextoDoCard()` do `add-005-quadro-compras.mjs`. O par de fases chega
-- pronto em `T.PAR`.
--
--   -- no PODE:
--   WHEN T.PAR = 'enviado>transito' AND T.PENDENCIAS_TRANSITO > 0 THEN 0
--   -- no MOTIVO (cada ramo repete a SUA condição, R-020/R-044):
--   WHEN T.PAR = 'enviado>transito' AND T.PENDENCIAS_TRANSITO > 0 THEN T.PENDENCIAS_TRANSITO_MOTIVO
--
-- O texto é o MESMO de `MOTIVOS.transito` em `frontend/src/lib/transicoes.ts`
-- (o teste de 500 combinações da 002 compara caractere a caractere). R-046: a
-- tela NÃO ganha ramo novo em `motivoDeDestino` — a trava é só do servidor.

-- ── coluna PENDENCIAS_TRANSITO (0 = pode entrar em Trânsito) ────────────────
COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
          FROM SGC_NF N WHERE N.ID_CARD = C.ID), 1) AS PENDENCIAS_TRANSITO

-- ── coluna PENDENCIAS_TRANSITO_MOTIVO (a frase mostrada) ───────────────────
COALESCE((SELECT CASE WHEN COUNT(*) = 0
            THEN 'Vincule ao menos uma nota fiscal ao pedido antes de mover para Em Trânsito para BN.'
            ELSE '' END
          FROM SGC_NF N WHERE N.ID_CARD = C.ID), '') AS PENDENCIAS_TRANSITO_MOTIVO
