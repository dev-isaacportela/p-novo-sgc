-- PENDENCIAS_NF / PENDENCIAS_NF_MOTIVO do `sgcPodeMover` (spec 002) — bloco da
-- spec 005 (notas fiscais), R-030 / RN-011 / RF-015.
--
-- Vale para `faturamento>concluido` E `bo>concluido`: conferência de nota sem
-- decisão bloqueia a conclusão, venha o pedido de Faturamento ou de B.O.
-- Duas colunas, uma subconsulta escalar cada, sobre `C.ID` — o INTEGRADOR cola
-- em `contextoDoCard()` do `add-005-quadro-compras.mjs`:
--
--   -- no PODE:
--   WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_NF > 0 THEN 0
--   -- no MOTIVO, encadeado NF -> B.O. (o segundo ramo é da 007), cada um com a
--   -- SUA condição, para PODE = 0 nunca sair com motivo vazio (R-020/R-044):
--   WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_NF > 0         THEN T.PENDENCIAS_NF_MOTIVO
--   WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0 THEN T.PENDENCIAS_BO_MOTIVO
--
-- O texto é o MESMO de `MOTIVOS.conclusaoNf` em `frontend/src/lib/transicoes.ts`.
-- R-046: a tela NÃO ganha ramo novo em `motivoDeDestino`.

-- ── coluna PENDENCIAS_NF (contagem de conferências sem decisão) ─────────────
COALESCE((SELECT COUNT(*) FROM SGC_NF_OCORRENCIA O
          WHERE O.ID_CARD = C.ID AND O.DECISAO = 'pendente'), 0) AS PENDENCIAS_NF

-- ── coluna PENDENCIAS_NF_MOTIVO (a frase, com a contagem) ──────────────────
COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN ''
            ELSE CONCAT('Decida as ', COUNT(*), ' conferências de nota fiscal pendentes antes de concluir o pedido.')
            END
          FROM SGC_NF_OCORRENCIA O
          WHERE O.ID_CARD = C.ID AND O.DECISAO = 'pendente'), '') AS PENDENCIAS_NF_MOTIVO
