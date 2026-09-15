-- O quarto ramo de `notificacoesUniao()` (spec 002, `add-005-quadro-compras.mjs`)
-- — avisos de processo da onda 2 (R-023), gravados em SGC_AVISO pelos crons
-- das specs 005, 006 e 007.
--
-- Entregue para o INTEGRADOR colar depois do ramo `mensagem`, precedido de
-- `UNION ALL`. As seis colunas são as do contrato da 002:
-- TIPO, CARD_ID, TITULO, QUEM, TEXTO, QUANDO.
--
-- `TIPO` sai como 'aviso' (e não como o tipo do aviso) porque `NotificacoesPage`
-- mapeia TIPO para um rótulo e cai no texto cru quando não conhece a chave: um
-- rótulo só, "Aviso", e o assunto no TEXTO. O integrador acrescenta a linha
-- `aviso: 'Aviso'` em `ROTULO` de `frontend/src/pages/notificacoes/NotificacoesPage.tsx`.
--
-- Quem recebe (R-023): a pessoa endereçada (PARA_USUARIO_ID), ou os
-- responsáveis do card quando PARA_USUARIO_ID = 0 e não há persona, ou quem
-- tem a persona de PARA_PERSONA (`gestor`, no alerta consolidado de 5 dias).

SELECT 'aviso' AS TIPO, A.ID_CARD AS CARD_ID, CD.TITULO AS TITULO,
  '' AS QUEM, A.TEXTO AS TEXTO, A.CRIADO_EM AS QUANDO
FROM SGC_AVISO A
JOIN KB_CARD CD ON CD.ID = A.ID_CARD AND CD.EXCLUIDO_EM IS NULL
WHERE (
  A.PARA_USUARIO_ID = :VAR_USER
  OR (A.PARA_USUARIO_ID = 0 AND COALESCE(A.PARA_PERSONA, '') = ''
      AND EXISTS (SELECT 1 FROM KB_CARD_RESPONSAVEL R
                  WHERE R.CARD_ID = A.ID_CARD AND R.USUARIO_ID = :VAR_USER))
  OR (COALESCE(A.PARA_PERSONA, '') <> '' AND EXISTS (
        SELECT 1 FROM INT_USER IU
        LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
        WHERE IU.ID = :VAR_USER
          AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                     WHEN 'ADMIN' THEN 'admin'
                                     WHEN 'RESTRICTED' THEN 'comercial'
                                     ELSE 'analista' END) = A.PARA_PERSONA))
)
