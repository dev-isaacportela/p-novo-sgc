-- PENDENCIAS / PENDENCIAS_MOTIVO do `sgcPodeMover` (spec 002) — corpo reservado
-- à spec 003 (itens do pedido), RF-022 / RN-012.
--
-- Entregue para o INTEGRADOR colar no `add-005-quadro-compras.mjs`, no lugar das
-- duas subconsultas provisórias que a 002 deixou (alerta não lido + frase
-- genérica). O resto da SQL da 002 não muda: `PENDENCIAS` continua sendo
-- CONTAGEM (> 0 barra) e `PENDENCIAS_MOTIVO` a frase mostrada; as duas são
-- subconsultas escalares sobre `C.ID` (o card), e o par de fases chega pronto
-- em `T.PAR`, com os aliases `FO` (origem) e `FD` (destino):
--
--   WHEN T.PAR = 'analise>tecnica' AND T.PENDENCIAS > 0 THEN 0   -- PODE
--   WHEN T.PAR = 'analise>tecnica' THEN T.PENDENCIAS_MOTIVO      -- MOTIVO
--
-- Cancelar (FD.CHAVE = 'cancelado') NÃO entra neste ramo (RF-023, C-019, D-009).
--
-- É o MESMO texto de `sgcAnaliseSaidaVerificar` (backend/add-006-itens.mjs,
-- `SQL_SAIDA_VERIFICAR`), com `{{cardId}}` trocado por `C.ID` e o `PODE`
-- invertido em contagem de pendências. Uma regra, dois lugares: se as condições
-- mudarem, mudam nos dois no MESMO commit.

-- ── coluna PENDENCIAS (contagem: 0 = pode sair da Análise) ───────────────────
COALESCE((
  SELECT CASE WHEN A.PENDENTES > 0
                OR A.SEM_JUSTIF_ALERTA > 0
                OR A.SEM_JUSTIF_COBERTURA > 0
                OR A.PRAZO_FALTA > 0
                OR A.COM_QUANTIDADE = 0 THEN 1 ELSE 0 END
  FROM (
    SELECT
      (SELECT COUNT(*) FROM SGC_ALERTA AL
        WHERE AL.ID_CARD = P.ID_CARD AND AL.LIDO = 0) AS PENDENTES,
      (SELECT COUNT(*) FROM SGC_PEDIDO_ITEM I
        WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0
          AND EXISTS (SELECT 1 FROM SGC_ALERTA AL WHERE AL.ID_CARD = I.ID_CARD AND AL.CODPROD = I.CODPROD
                        AND TRIM(COALESCE(AL.JUSTIFICATIVA, '')) = '')) AS SEM_JUSTIF_ALERTA,
      (SELECT COUNT(*) FROM SGC_PEDIDO_ITEM I
        WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0
          AND I.COBERTURA_DIAS > I.COBERTURA_LIMITE
          AND TRIM(COALESCE(I.COBERTURA_JUSTIFICATIVA, '')) = '') AS SEM_JUSTIF_COBERTURA,
      CASE
        WHEN TRIM(COALESCE(P.PRAZO_PADRAO, '')) = '' THEN 1
        WHEN TRIM(COALESCE(P.PRAZO_ACORDADO, '')) = '' THEN 2
        WHEN UPPER(TRIM(P.PRAZO_PADRAO)) <> UPPER(TRIM(P.PRAZO_ACORDADO))
             AND LENGTH(TRIM(COALESCE(P.PRAZO_JUSTIFICATIVA, ''))) < 10 THEN 3
        ELSE 0 END AS PRAZO_FALTA,
      (SELECT COUNT(*) FROM SGC_PEDIDO_ITEM I
        WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0) AS COM_QUANTIDADE
    FROM SGC_PEDIDO P
    WHERE P.ID_CARD = C.ID
  ) A
), 0) AS PENDENCIAS

-- ── coluna PENDENCIAS_MOTIVO (a primeira exigência que falhou) ───────────────
COALESCE((
  SELECT CASE
    WHEN A.PENDENTES > 0 THEN CONCAT('Leia os ', A.PENDENTES, ' alertas deste pedido antes de enviar para aprovação.')
    WHEN A.SEM_JUSTIF_ALERTA > 0 THEN CONCAT('Justifique os itens com alerta que seguem com quantidade (', A.SEM_JUSTIF_ALERTA, '), a começar por ', A.EXEMPLO_ALERTA, '.')
    WHEN A.SEM_JUSTIF_COBERTURA > 0 THEN CONCAT('Justifique os itens com cobertura acima do limite (', A.SEM_JUSTIF_COBERTURA, '), a começar por ', A.EXEMPLO_COBERTURA, '.')
    WHEN A.PRAZO_FALTA = 1 THEN 'Informe o prazo de pagamento padrão do fornecedor antes de enviar para aprovação.'
    WHEN A.PRAZO_FALTA = 2 THEN 'Informe o prazo de pagamento acordado neste pedido antes de enviar para aprovação.'
    WHEN A.PRAZO_FALTA = 3 THEN 'O prazo acordado difere do padrão do fornecedor. Justifique a diferença em pelo menos 10 caracteres.'
    WHEN A.COM_QUANTIDADE = 0 THEN 'Informe a quantidade de pelo menos um item antes de enviar para aprovação.'
    ELSE '' END
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
    WHERE P.ID_CARD = C.ID
  ) A
), '') AS PENDENCIAS_MOTIVO
