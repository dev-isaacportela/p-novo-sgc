# Plan: Itens do pedido — análise de montagem, alertas e prazo de pagamento

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; todos os cenários vêm das decisões AN-01…AN-12, AL-01…AL-06, PZ-01…PZ-04 e AT-03/AT-04 de `regras.md` |
| Backend escrito local, executado no sandbox | sim | muda só `backend/add-006-itens.mjs` (novo); as colunas novas entram no `setup-backend.mjs` **pelo integrador** (arquivo compartilhado). Nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL vive no `setup-backend.mjs` e a migration é gerada pelo sandbox |
| Leitura e escrita por Server Function | sim | nenhum `listRecords`/`patchRecord`: as abas usam `linhas()`/`acao()` de `src/lib/mitra-api.ts`; escrita de usuário é SF SQL guardada por `:VAR_USER` |
| Simulador cobre a feature | sim | `simulator/seed/003-itens.mjs` só insere linhas (produtos, vendas, lotes, excesso, clientes públicos) sobre os fornecedores e filiais da 001 e as personas da 002; o DDL das `PC*` é do integrador; `sim:check` roda as 7 SQL de leitura com contagem > 0 |
| Testes automatizados obrigatórios | sim | 22 cenários e 14 regras mapeados em `backend/simulator/smoke/003-itens.mjs` e em `frontend/tests/{compras,prazo-pagamento,cobertura}.test.mjs` |
| Design tokens, sem cor literal | sim | tabela, `Status`, `Code`, `Dash` e diálogo do `page.tsx`; zero hex, zero `style={{}}`, zero classe Tailwind solta na página |
| Simplicidade | sim | nenhuma dependência nova; a regra de compra é função pura em `src/lib/`; upsert em lote no lugar de uma escrita por item (D-006) |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`; leitura do WinThor por JDBC Oracle (`jdbcId` resolvido por nome no `isEntrypoint()`); unidades por caixa pela integração `gestao-de-custos`
- **Reuso identificado:** `@benenutri/mitra-kanban` 1.3.0 (`abasExtras`, `ExtensaoContexto`, `antesDeMover`, `kbNotaRegistrar`, `kbCardAtualizar`); `page.tsx` (`Panel`, `Toolbar`, `Table`/`Th`/`Td` com `numeric`, `RowTitle`, `RowMeta`, `Status`, `Code`, `Dash`, `SearchInput`, `SelectMenu`, `Alert`, `EmptyState`, `Pagination`); `lib/formato.ts`; as fórmulas portadas de `p-45547/frontend/src/features/kanban/compras.ts` e `prazo-pagamento.ts`
- **Dependência nova:** nenhuma

## Modelo de dados

Três tabelas novas, todas no `setup-backend.mjs` (arquivo do integrador). Convenções da
visão geral: colunas em UPPERCASE, datas em `VARCHAR(10)`/`VARCHAR(19)`, sem `FOREIGN KEY`,
`ID` autoincremento.

### `SGC_PEDIDO_ITEM` (N:1 `KB_CARD`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_CARD` | `INT NOT NULL` | card do pedido |
| `CODPROD` | `INT NOT NULL` | produto no WinThor |
| `DESCRICAO` | `VARCHAR(200)` | copiada da análise (a lista não reconsulta o ERP para desenhar) |
| `EMBALAGEM` | `VARCHAR(60)` | |
| `UNIDADE` | `VARCHAR(10)` | |
| `CODEPTO` | `INT` | resolve o limite de cobertura por departamento (RN-005) |
| `CODSEC` | `INT` | idem, por seção |
| `UN_POR_CAIXA` | `DECIMAL(15,3)` | gestão de custos (AN-05 B); cai para a embalagem |
| `QT_VENDA_TOTAL` | `DECIMAL(15,3)` | venda do período, licitação inclusive (AN-04 A) |
| `QT_VENDA_LICITACAO` | `DECIMAL(15,3)` | parte pública da venda, à parte (AN-03) |
| `QT_ESTOQUE` | `DECIMAL(15,3)` | |
| `QT_TRANSITO` | `DECIMAL(15,3)` | |
| `QT_SUGERIDA` | `DECIMAL(15,3)` | já arredondada por caixa |
| `QT_PEDIDA` | `DECIMAL(15,3) DEFAULT 0` | o que a compradora decidiu |
| `PRECO_CUSTO` | `DECIMAL(15,4)` | inicia no custo da última entrada, editável |
| `TIPO_PRECO` | `VARCHAR(10) DEFAULT 'padrao'` | `padrao` \| `especial` (AN-08 B) |
| `CURVA_ABC` | `VARCHAR(1)` | `A` \| `B` \| `C` |
| `COBERTURA_DIAS` | `DECIMAL(15,2)` | recalculada a cada gravação |
| `COBERTURA_LIMITE` | `INT` | limite resolvido na hora da gravação (para a trava do servidor ler sem recalcular) |
| `COBERTURA_JUSTIFICATIVA` | `VARCHAR(500)` | exigida por AL-06 |
| `OBSERVACAO` | `VARCHAR(500)` | nota livre do item; vai no e-mail à indústria |
| `STATUS` | `VARCHAR(20) DEFAULT 'montagem'` | `montagem` \| `aprovado` \| `reprovado` \| `enviado` \| `removido` |
| `CRIADO_EM` | `VARCHAR(19)` | |
| `ATUALIZADO_POR` | `INT` | |
| `ATUALIZADO_EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_ITEM (ID_CARD, CODPROD)` — é o que faz o upsert em lote (D-006) e garante
"um produto aparece no máximo uma vez por pedido". Índice `IDX_ITEM_CARD (ID_CARD)`.

### `SGC_ALERTA` (N:1 `KB_CARD`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_CARD` | `INT NOT NULL` | |
| `CODPROD` | `INT NOT NULL` | liga ao item por `(ID_CARD, CODPROD)` — ver D-007 |
| `TIPO` | `VARCHAR(20)` | `vencimento` (RN-02) \| `excesso` (RN-03) |
| `CHAVE` | `VARCHAR(120)` | identidade do alerta: `vencimento:CODPROD:CODFILIAL:NUMLOTE` ou `excesso:CODPROD:CODFILIAL` |
| `MENSAGEM` | `VARCHAR(400)` | texto pronto, montado na geração |
| `LIDO` | `BOOLEAN DEFAULT 0` | |
| `LIDO_POR` | `INT` | |
| `LIDO_EM` | `VARCHAR(19)` | |
| `JUSTIFICATIVA` | `VARCHAR(500)` | exigida por AL-05 quando o item segue com quantidade |
| `CRIADO_EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_ALERTA (ID_CARD, CHAVE)` — regerar não duplica e **não** apaga `LIDO` nem
`JUSTIFICATIVA` (AL-03 + RF-016). Índice `IDX_ALERTA_CARD (ID_CARD, LIDO)`.

### `SGC_COBERTURA`

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `NIVEL` | `VARCHAR(20)` | `fornecedor` \| `departamento` \| `secao` \| `sku` |
| `CODIGO` | `VARCHAR(20)` | `CODFORNEC` \| `CODEPTO` \| `CODSEC` \| `CODPROD` |
| `DESCRICAO` | `VARCHAR(200)` | nome do alvo, gravado no cadastro para a tela não consultar o ERP a cada linha |
| `LIMITE_DIAS` | `INT NOT NULL` | |
| `ATIVO` | `BOOLEAN DEFAULT 1` | exclusão é desativação |
| `CRIADO_EM` | `VARCHAR(19)` | |
| `ATUALIZADO_POR` | `INT` | |
| `ATUALIZADO_EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_COBERTURA (NIVEL, CODIGO)`. Sem linha aplicável, 35 dias (AN-07).

### Só leitura, de outras specs

`SGC_PEDIDO` (002): `ID_CARD`, `CODFORNEC`, `CODFILIAL`, `PERIODO_INICIO`, `PERIODO_FIM`,
`VL_TOTAL`, `PRAZO_PADRAO`, `PRAZO_ACORDADO`, `PRAZO_JUSTIFICATIVA`. As três de prazo e o
`VL_TOTAL` são **escritos por esta spec** (contratos abaixo) — ver *Dependências entre specs*.
`SGC_USUARIO_PERSONA` (002) é lida pelas guardas de persona. `SGC_FASE` (002) dá a chave
`analise` sem depender de id de fase.

## Contratos de backend

Tudo em `backend/add-006-itens.mjs`, que exporta `definitions`. Ids locais: **7301–7311**
(leitura e JS), **7350–7361** (escrita). Filtro desligado é `''` no texto e `0` no número.

### Leituras — WinThor (Oracle, `jdbcId` resolvido por nome)

| Nome | Tipo | Entrada (`{{param}}`, valor desligado) | Saída | Atende |
|---|---|---|---|---|
| `sgcWintAnaliseMontagem` | SQL (Oracle) | `codfornec` (0), `codfilial` (''), `dataInicio` (''), `dataFim` ('') | `CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, UN_POR_CAIXA_ERP, ESTOQUE, VENDA_MES_ATUAL, VENDA_MES1, VENDA_MES2, CUSTO_ULT_ENTRADA, DT_ULT_ENTRADA, DT_ULT_SAIDA, QT_PEDIDA_ERP, TRANSITO, VENDA_PERIODO, VENDA_LICITACAO` | RF-001, RF-002, RF-003, RF-004 |
| `sgcWintBuscarProduto` | SQL (Oracle) | `codprod` (0), `busca` (''), `codfilial` ('') | `CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, UN_POR_CAIXA_ERP, ESTOQUE, CUSTO_ULT_ENTRADA` (máx. 20) | RF-011 |
| `sgcWintLotesAVencer` | SQL (Oracle) | `codprods` ('0'), `codfilial` (''), `diasValidade` (0) | `CODPROD, DESCRICAO, NUMLOTE, DTVALIDADE, CODFILIAL, FILIAL, QT_LOTE, DIAS_PARA_VENCER, TIPO_FILIAL` | RF-014 |
| `sgcWintExcessoOutrasFiliais` | SQL (Oracle) | `codprods` ('0'), `codfilial` (''), `diasEstoque` (0) | `CODPROD, DESCRICAO, CODFILIAL, FILIAL, QTEST, DIAS_ESTOQUE` | RF-015 |
| `sgcWintPrazoPagamento` | SQL (Oracle) | `codfornec` (0), `codfilial` ('') | `DT_EMISSAO, PRAZO1, PRAZO2, PRAZO3, VL_TOTAL` (5 pedidos mais recentes) | RF-019 |
| `sgcCustoUnidadesPorCaixa` | INTEGRATION (`gestao-de-custos`, `runQuery`) | `codprods` ('0') | `CODPROD, UNIDADES_POR_CAIXA` | RF-006 (AN-05 B) |

**`sgcWintAnaliseMontagem`** — porte de `p-45547/backend/add-analise-montagem.mjs` com a
correção da licitação (D-002):

```sql
SELECT
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
  NVL(V.QT_LICIT, 0)        AS VENDA_LICITACAO
FROM PCPRODUT P
LEFT JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '{{codfilial}}'
LEFT JOIN (
  SELECT CODPROD, CODFILIAL, SUM(NVL(QTTRANSITO, 0)) AS QTTRANSITO
  FROM PCESTTRANSITO GROUP BY CODPROD, CODFILIAL
) T ON T.CODPROD = P.CODPROD AND T.CODFILIAL = '{{codfilial}}'
LEFT JOIN (
  SELECT M.CODPROD,
    SUM(M.QT) AS QT_TOTAL,
    SUM(CASE WHEN NVL(C.CODATV1, 0) IN (11,12,13,14,15,20) THEN M.QT ELSE 0 END) AS QT_LICIT
  FROM PCMOV M
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.CODOPER = 'S' AND M.QT > 0 AND M.CODFILIAL = '{{codfilial}}'
    AND M.DTMOV BETWEEN TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') AND TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
  GROUP BY M.CODPROD
) V ON V.CODPROD = P.CODPROD
WHERE P.CODFORNEC = {{codfornec}}
  AND NVL(LENGTH(TRIM(P.OBS2)), 0) = 0
  AND NVL(P.CODEPTO, 0) NOT IN (4, 7)
ORDER BY P.DESCRICAO
```

Filtros que se repetem em toda consulta ao ERP (RN-011): produto ativo
`NVL(LENGTH(TRIM(P.OBS2)),0) = 0`, departamento `NVL(P.CODEPTO,0) NOT IN (4,7)`, venda só
`CODOPER = 'S' AND QT > 0`, licitação por `CODATV1 IN (11,12,13,14,15,20)`.

**`sgcWintBuscarProduto`** — código **ou** nome, no máximo 20 (AN-09):

```sql
SELECT * FROM (
  SELECT P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODFORNEC, P.CODEPTO, P.CODSEC,
         NVL(P.QTUNITCX, 0) AS UN_POR_CAIXA_ERP,
         NVL(E.QTEST, 0) AS ESTOQUE, NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA
  FROM PCPRODUT P
  LEFT JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '{{codfilial}}'
  WHERE NVL(LENGTH(TRIM(P.OBS2)), 0) = 0
    AND NVL(P.CODEPTO, 0) NOT IN (4, 7)
    AND ( P.CODPROD = {{codprod}}
          OR ({{codprod}} = 0 AND UPPER(P.DESCRICAO) LIKE '%' || UPPER('{{busca}}') || '%') )
  ORDER BY P.DESCRICAO
) WHERE ROWNUM <= 20
```

**`sgcWintLotesAVencer`** — porte fiel de `add-alertas-analise.mjs` (`sgcAlertaVencimentoLotes`),
com o teto de dias parametrizado (`{{diasValidade}}` = 90) e a lista `{{codprods}}` montada
pelo JS em lotes de 500 (`ORA-01795`):

```sql
WITH SALDO_LOTE AS (
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
  ROUND(L.DTVALIDADE - SYSDATE) AS DIAS_PARA_VENCER,
  CASE WHEN S.CODFILIAL = '{{codfilial}}' THEN 'PEDIDO' ELSE 'OUTRA' END AS TIPO_FILIAL
FROM SALDO_LOTE S
JOIN PCLOTE L ON L.CODPROD = S.CODPROD AND NVL(L.NUMLOTE, '-') = NVL(S.NUMLOTE, '-')
  AND L.CODFILIAL = S.CODFILIAL
JOIN PCPRODUT P ON P.CODPROD = S.CODPROD
JOIN PCFILIAL F ON F.CODIGO = S.CODFILIAL
WHERE S.QT_LOTE > 0 AND L.DTVALIDADE IS NOT NULL
  AND L.DTVALIDADE <= SYSDATE + {{diasValidade}}
ORDER BY L.DTVALIDADE ASC
```

**`sgcWintExcessoOutrasFiliais`** — porte fiel de `sgcAlertaExcessoFilial`, com
`{{diasEstoque}}` = 80. Dias de estoque = `QTEST / ((QTVENDMES + QTVENDMES1 + QTVENDMES2) / 90)`;
estoque sem venda nos três meses vale 9999 (é excesso, RN-010); só `CODFILIAL <> '{{codfilial}}'`
e `QTEST > 0`.

**`sgcWintPrazoPagamento`** — condição praticada pelo fornecedor nos últimos pedidos de compra
do ERP; alimenta a sugestão do prazo padrão quando o fornecedor ainda não tem faixa
parametrizada (D-004):

```sql
SELECT * FROM (
  SELECT TO_CHAR(P.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
         NVL(P.PRAZO1, 0) AS PRAZO1, NVL(P.PRAZO2, 0) AS PRAZO2, NVL(P.PRAZO3, 0) AS PRAZO3,
         NVL(P.VLTOTAL, 0) AS VL_TOTAL
  FROM PCPEDIDO P
  WHERE P.CODFORNEC = {{codfornec}}
    AND ('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
    AND NVL(P.PRAZO1, 0) > 0
  ORDER BY P.DTEMISSAO DESC
) WHERE ROWNUM <= 5
```

**`sgcCustoUnidadesPorCaixa`** — tipo `INTEGRATION` (a tabela `PRODUTOS` vive na conexão
`gestao-de-custos`, que não é JDBC; molde de `p-45547/backend/add-sf-produtos-unidades-por-caixa.mjs`):
`{ connection: 'gestao-de-custos', method: 'POST', endpoint: 'runQuery', body: { sql: "SELECT CODPROD, COALESCE(UNIDADES_POR_CAIXA, 1) AS UNIDADES_POR_CAIXA FROM PRODUTOS WHERE CODPROD IN (event.codprods)" } }`.

### Leituras — banco interno

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `sgcCoberturaListar` | SQL | `nivel` (''), `limite` (200), `offset` (0) | `ID, NIVEL, CODIGO, DESCRICAO, LIMITE_DIAS, ATUALIZADO_POR, ATUALIZADO_EM` | RF-009, RF-027 |
| `sgcAnaliseSaidaVerificar` | SQL | `cardId` (0) | uma linha: `PODE` (1/0), `MOTIVO` | RF-022, RN-012 |

```sql
-- sgcCoberturaListar
SELECT ID, NIVEL, CODIGO, DESCRICAO, LIMITE_DIAS, ATUALIZADO_POR, ATUALIZADO_EM
FROM SGC_COBERTURA
WHERE ATIVO = 1 AND ('{{nivel}}' = '' OR NIVEL = '{{nivel}}')
ORDER BY CASE NIVEL WHEN 'sku' THEN 1 WHEN 'secao' THEN 2 WHEN 'departamento' THEN 3 ELSE 4 END, CODIGO
LIMIT {{limite}} OFFSET {{offset}}
```

**`sgcAnaliseSaidaVerificar`** — um predicado por condição de RN-012, na ordem da regra; a
primeira que falha define o `MOTIVO`. Cancelar nunca passa por aqui (D-009).

```sql
SELECT
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
) A
```

A comparação de prazo em SQL é **texto contra texto** porque os dois lados são gravados
normalizados pela regra pura (`normalizarPrazo`, D-005): "28/35/42 dias" e "28/35/42" viram a
mesma string antes de chegarem ao banco, então igualdade de texto no servidor = igualdade de
parcelas na tela, sem duas regras diferentes.

**Como a 002 incorpora** (o integrador liga): a `sgcPodeMover` já reserva a esta spec o bloco de
duas colunas `PENDENCIAS`/`PENDENCIAS_MOTIVO`, uma subconsulta cada, sobre `C.ID`; o resto da
SQL não muda. O contrato é o da 002 (`002-quadro-de-compras/plan.md`): **`PENDENCIAS` é
contagem** — `> 0` barra —, e `PENDENCIAS_MOTIVO` é a frase mostrada; os aliases de fase são
`FO` (origem) e `FD` (destino), e o par chega pronto em `T.PAR`:

```sql
WHEN T.PAR = 'analise>tecnica' AND T.PENDENCIAS > 0 THEN 0   -- PODE
WHEN T.PAR = 'analise>tecnica' THEN T.PENDENCIAS_MOTIVO      -- MOTIVO
```

A 003 troca as duas subconsultas provisórias (hoje: alerta não lido e uma frase genérica) pelo
corpo de `sgcAnaliseSaidaVerificar` com `{{cardId}}` = `C.ID`: o `PODE` de lá entra invertido
(`CASE WHEN … THEN 1 ELSE 0 END` como contagem de pendências) e a coluna `MOTIVO` vira
`PENDENCIAS_MOTIVO`. Uma regra, dois lugares: se as condições mudarem, mudam nos dois no mesmo
commit.

`FA` é a fase atual do card e `FD` a de destino, ambas resolvidas por `SGC_FASE.CHAVE`
(nunca por id nem por nome). Cancelar (`FD.CHAVE = 'cancelado'`) não entra neste ramo.

### JavaScript (orquestração)

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `sgcItensGravar` | JAVASCRIPT | `cardId`, `itensJson` (JSON dos itens alterados) | `{ ok, itens, total, erro? }` | RF-012, RF-013 |
| `sgcAlertasGerar` | JAVASCRIPT | `cardId` | `{ ok, total, naoLidos }` | RF-014, RF-015, RF-016 |
| `sgcAnaliseSair` | JAVASCRIPT | `cardId` | `{ ok, erro?, itens, removidos, total }` | RF-022, RF-024, RF-025, AT-04 |

As três resolvem a persona por `runQueryMitra` com `:VAR_USER` usando **o mesmo mapa** da guarda
SQL da 002 (`ACCESS_LEVEL` → `ADMIN` admin, `RESTRICTED` comercial, resto analista; `READ_ONLY`
não opera) e chamam as escritas **por id**, passando `usuarioId` explícito: `:VAR_USER` não vale
em chamada aninhada.

- **`sgcItensGravar`** — recusa persona fora de `admin`/`analista`/`gestor` e pedido fora da
  fase `analise`; escapa aspas de todo texto; monta `{{linhas}}` em lotes de 200 tuplas e
  chama `sgcEscItemGravar` (uma execução por lote); chama `sgcEscPedidoTotal`; devolve o total
  recalculado. Com 200 itens alterados são 2 execuções aninhadas, não 200 (D-006).
- **`sgcAlertasGerar`** — lê os itens vivos do card e o `CODFILIAL` do pedido; chama
  `sgcWintLotesAVencer` (90) e `sgcWintExcessoOutrasFiliais` (80); monta `CHAVE` e `MENSAGEM`
  por alerta; chama `sgcEscAlertaInserir` (upsert em lote, preserva `LIDO` e `JUSTIFICATIVA`) e
  `sgcEscAlertaRemoverObsoletos` com a lista de chaves vivas; devolve a contagem de não lidos,
  que a tela espelha no campo `alertas_pendentes` do quadro.
- **`sgcAnaliseSair`** — é **o** passo do `antesDeMover` em `analise → tecnica`: a tela o chama
  e só depois chama `ctx.mover(faseId)`. Faz, nesta ordem: (1) `sgcAlertasGerar` (AL-03 manda
  recalcular antes de barrar); (2) `sgcAnaliseSaidaVerificar` — `PODE = 0` devolve
  `{ ok: false, erro: MOTIVO }` e **nada** é gravado; (3) com `PODE = 1`,
  `sgcEscItemRemoverZerados` → `sgcEscPedidoTotal` → `sgcEscPedidoReprovacoesLimpar` (SF da 002,
  SQL com `{{usuarioId}}` e `{{idCard}}` apenas, **sem** `:VAR_USER`, porque a chamada é aninhada — a
  persona já foi conferida aqui por `runQueryMitra` com `:VAR_USER` antes de qualquer escrita) →
  `kbNotaRegistrar` (SF da lib, com `usuarioId`, que só é aceito sem sessão — e a chamada
  aninhada não tem sessão) com o texto do resumo (AN-10 A):
  `"Pedido enviado para a aprovação técnica com 8 itens (R$ 12.480,00). 2 itens justificados por alerta, 1 por cobertura acima do limite. 12 itens zerados foram removidos."`
  A limpeza acontece antes do movimento de propósito: o motor só move o que já está arrumado, e
  uma aba fechada no meio não deixa o pedido pela metade.

### Escritas SQL (uma instrução por SF)

| Nome | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|
| `sgcEscItemGravar` | `usuarioId` (só chamada por `sgcItensGravar`) | `idCard`, `linhas`, `usuarioId`, `atualizadoEm` | `INSERT INTO SGC_PEDIDO_ITEM (...) VALUES {{linhas}} ON DUPLICATE KEY UPDATE` de tudo que a compradora edita e do que a análise recalcula | RF-012 |
| `sgcEscItemRemover` | `:VAR_USER` + guarda `admin`/`analista`/`gestor` | `idCard`, `codprod`, `atualizadoEm` | `UPDATE … SET STATUS='removido'` | RF-011 |
| `sgcEscItemRemoverZerados` | `usuarioId` | `idCard`, `usuarioId`, `atualizadoEm` | `UPDATE … SET STATUS='removido' WHERE STATUS='montagem' AND QT_PEDIDA <= 0` | RF-024 |
| `sgcEscItemStatusFase` | `:VAR_USER` + guarda `admin`/`analista`/`gestor`/`diretoria` | `idCard`, `status`, `atualizadoEm` | `UPDATE … SET STATUS='{{status}}' WHERE ID_CARD={{idCard}} AND STATUS <> 'removido'` | RF-026 |
| `sgcEscAlertaInserir` | `usuarioId` | `linhas` | `INSERT INTO SGC_ALERTA (ID_CARD, CODPROD, TIPO, CHAVE, MENSAGEM, LIDO, CRIADO_EM) VALUES {{linhas}} ON DUPLICATE KEY UPDATE MENSAGEM = VALUES(MENSAGEM)` | RF-016 |
| `sgcEscAlertaRemoverObsoletos` | `usuarioId` | `idCard`, `chaves` | `DELETE FROM SGC_ALERTA WHERE ID_CARD={{idCard}} AND CHAVE NOT IN ({{chaves}})` | RF-016 |
| `sgcEscAlertaLer` | `:VAR_USER` + guarda `admin`/`analista`/`gestor` | `idCard`, `id` (0 = todos), `lidoEm` | `UPDATE SGC_ALERTA SET LIDO=1, LIDO_POR=:VAR_USER, LIDO_EM='{{lidoEm}}' WHERE ID_CARD={{idCard}} AND LIDO=0 AND ({{id}}=0 OR ID={{id}})` | RF-017 |
| `sgcEscAlertaJustificar` | `:VAR_USER` + guarda `admin`/`analista`/`gestor` | `idCard`, `codprod`, `justificativa` | `UPDATE SGC_ALERTA SET JUSTIFICATIVA='{{justificativa}}' WHERE ID_CARD={{idCard}} AND CODPROD={{codprod}}` (todos os alertas do item de uma vez) | RF-018 |
| `sgcEscCoberturaGravar` | `:VAR_USER` + guarda `admin`/`gestor` | `nivel`, `codigo`, `descricao`, `limiteDias`, `atualizadoEm` | `INSERT … SELECT … WHERE EXISTS (<guarda>) ON DUPLICATE KEY UPDATE` | RF-027 |
| `sgcEscCoberturaExcluir` | `:VAR_USER` + guarda `admin`/`gestor` | `id`, `atualizadoEm` | `UPDATE SGC_COBERTURA SET ATIVO=0 …` | RF-027 |
| `sgcEscPedidoPrazo` | `:VAR_USER` + guarda `admin`/`analista`/`gestor` | `idCard`, `prazoPadrao`, `prazoAcordado`, `prazoJustificativa` | `UPDATE SGC_PEDIDO SET PRAZO_PADRAO=…, PRAZO_ACORDADO=…, PRAZO_JUSTIFICATIVA=… WHERE ID_CARD={{idCard}}` | RF-019, RF-020 |
| `sgcEscPedidoTotal` | `usuarioId` | `idCard` | `UPDATE SGC_PEDIDO P SET P.VL_TOTAL = (SELECT COALESCE(SUM(I.QT_PEDIDA*I.PRECO_CUSTO),0) FROM SGC_PEDIDO_ITEM I WHERE I.ID_CARD=P.ID_CARD AND I.STATUS<>'removido') WHERE P.ID_CARD={{idCard}}` | RF-013 |

As `sgcEsc*` ficam no **perfil business**, como as `kbEsc*` da lib (R-007) — verificar no
sandbox se chamada aninhada dispensa o perfil.

A guarda de persona é **a mesma** das escritas da 002 (`002-quadro-de-compras/plan.md`, seção
"A guarda de persona, escrita uma vez"), copiada literalmente, trocando só a lista de personas
(B-03). Nenhuma escrita desta spec escreve a sua própria versão:

```sql
AND EXISTS (
  SELECT 1 FROM INT_USER IU
  LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
  WHERE IU.ID = :VAR_USER
    AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
    AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                               WHEN 'ADMIN' THEN 'admin'
                               WHEN 'RESTRICTED' THEN 'comercial'
                               ELSE 'analista' END) IN (<personas>)
)
```

O total nunca chega como parâmetro: `sgcEscPedidoTotal` soma no próprio banco, então a capa,
o `SGC_PEDIDO.VL_TOTAL` e a lista não podem divergir (AN-12).

### Bloco 73xx de `frontend/src/lib/server-functions.ts`

Nome em `SERVER_FUNCTION_NAMES` e id local em `SERVER_FUNCTIONS`, até o `sync:function-map`
trazer os reais do sandbox.

| Id local | Nome | Id local | Nome |
|---|---|---|---|
| 7301 | `sgcWintAnaliseMontagem` | 7350 | `sgcEscItemGravar` |
| 7302 | `sgcWintBuscarProduto` | 7351 | `sgcEscItemRemover` |
| 7303 | `sgcWintLotesAVencer` | 7352 | `sgcEscItemRemoverZerados` |
| 7304 | `sgcWintExcessoOutrasFiliais` | 7353 | `sgcEscItemStatusFase` |
| 7305 | `sgcWintPrazoPagamento` | 7354 | `sgcEscAlertaInserir` |
| 7306 | `sgcCustoUnidadesPorCaixa` | 7355 | `sgcEscAlertaRemoverObsoletos` |
| 7307 | `sgcCoberturaListar` | 7356 | `sgcEscAlertaLer` |
| 7308 | `sgcAnaliseSaidaVerificar` | 7357 | `sgcEscAlertaJustificar` |
| 7309 | `sgcItensGravar` | 7358 | `sgcEscCoberturaGravar` |
| 7310 | `sgcAlertasGerar` | 7359 | `sgcEscCoberturaExcluir` |
| 7311 | `sgcAnaliseSair` | 7360 | `sgcEscPedidoPrazo` |
| | | 7361 | `sgcEscPedidoTotal` |

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/quadro`, card aberto, aba **Itens** | análise, lista, edição, prazo de pagamento, total | `Panel`, `PanelHeader`, `Toolbar`, `SearchInput`, `Table`/`Th`/`Td` (`numeric`), `RowTitle`, `RowMeta`, `Code`, `Dash`, `Status`, `IconButton`, `Button`, `Alert`, `EmptyState`, `Dialog`, `Field`, `SelectMenu` | `AbaItens` |
| `/quadro`, card aberto, aba **Alertas** | lista de alertas, marcar lido, justificar | os mesmos + `Badge` fora de tabela | `AbaAlertas` |
| `/coberturas` | limites de cobertura (admin e gestor editam; os demais só leem) | `PageHeader`, `Panel`, `Toolbar`, `SelectMenu`, `Table`, `Dialog`, `Pagination` | `CoberturasPage`, `CoberturaDialog` |

Arquivos:

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/pages/quadro/abas/Itens.tsx` | `AbaItens(ctx: ExtensaoContexto)` — tabela, busca/adição, diálogos de justificativa, bloco de prazo |
| `frontend/src/pages/quadro/abas/Alertas.tsx` | `AbaAlertas(ctx: ExtensaoContexto)` |
| `frontend/src/pages/quadro/abas/pedido-contexto.tsx` | `PedidoProvider` + `usePedido()`: guarda capa, itens e alertas do card aberto (uma consulta por abertura) e expõe `recarregar()` — ver D-003 |
| `frontend/src/pages/quadro/abas/verificar-saida.ts` | `verificarSaidaAnalise(cardId)` para o `antesDeMover` do `/quadro`: uma chamada de `sgcAnaliseSair`, que verifica e arruma antes de a tela mover |
| `frontend/src/pages/coberturas/CoberturasPage.tsx` | tela de limites |
| `frontend/src/lib/compras.ts`, `cobertura.ts`, `prazo-pagamento.ts` | regra pura |
| `frontend/src/lib/server-functions.ts` | bloco 73xx (nomes e ids locais) |

Desenho (design.md §8, §9.1, §9.5):

- **Tabela de itens**: `Code` para o `CODPROD`, `RowTitle` para a descrição, `RowMeta` para
  embalagem e unidade; todas as quantidades, custos e dias com `numeric` (alinhados à direita);
  sem zebra, linhas `py-3`, sem selo preenchido dentro da célula. Curva como texto simples
  (A/B/C) e cobertura acima do limite como `Status tone="attention"` com o texto "40 d / 35 d"
  ao lado — estado nunca só por cor. Coluna sem dado é `Dash()`, nunca `0` nem `R$ 0,00`.
  Ações inline (remover item, justificar) são `IconButton` — verde para editar, vermelho para
  remover.
- **Diálogos** de justificativa (alerta, cobertura, prazo): `max-h-[90vh]`, só o miolo rola,
  rodapé `flex-col-reverse` no mobile; o `Textarea` mostra o contador quando o mínimo é 10.
- **Campo de data**: nenhuma tela desta spec tem um — o período de vendas é da tela de criação
  do pedido (002). Se aparecer, é o `src/components/DatePicker.tsx` da 004 (UI-03 B), nunca o
  controle nativo.
- **Sem toast** (UI-02 A): confirmação é "Salvo às HH:MM" na faixa do painel e `Alert` no fluxo
  para erro; a recusa do movimento aparece na faixa de aviso do card (a lib já desenha).
- **Permissão** (§9.4): a persona `comercial` não vê o quadro (P-03), então não chega às abas.
  Quem tem acesso `READ_ONLY` da plataforma (P-08 B) vê as duas abas com todos os controles de
  escrita **desabilitados**, nunca escondidos — é a regra do anti-padrão "botão escondido por
  falta de permissão".

### R-133 — a Análise no desenho do legado

| Tela / bloco | Responsabilidade | Arquivo |
|---|---|---|
| Bloco **resumo** (novo em `BLOCOS_POR_FASE.analise`, no topo) | banner de reprovação (técnica e diretoria), Itens / Valor total / Preço especial / Alertas, aderência à sugestão com "Aceitar sugestão", faixas | `pages/quadros/abas/ResumoDoPedido.tsx` |
| Bloco **itens** | cabeçalho da análise ("N com saída · M sem saída", Abrir tela ampla, Recalcular, Adicionar produto), lista enxuta (Produto, Pedido, Custo, Total), Salvar, prazo | `pages/quadros/abas/Itens.tsx` |
| **Tela ampla** (diálogo até 1600 px) | abas Análise e Itens do pedido; Salvar no rodapé | `pages/quadros/abas/TelaAmpla.tsx`, `tela-ampla-analise.tsx`, `SeletorDeCusto.tsx` |
| **Drill-in** | a Análise do Produto da 011 com "Item no pedido" no topo | `pages/quadros/abas/DrillProduto.tsx`, `NomeDoProduto.tsx` |
| **Rascunho** | a lista editada, a análise carregada e a fila do comercial, compartilhadas pelos blocos da fase; edições não salvas sobrevivem a recarregar o pedido (incluir solicitação) | `pages/quadros/abas/rascunho-contexto.ts`, `RascunhoProvider.tsx` |

Contratos que mudam:

- `sgcWintAnaliseMontagem` devolve também `VENDA_PRIVADO`, `VENDA_PF` e `VENDA_PUBLICO`, no
  recorte `VENDA_VALIDA` de `backend/venda-valida.mjs` (o mesmo da 011, agora importado pelas
  duas). `VENDA_PERIODO` e `VENDA_LICITACAO` não mudam (D-015).
- `sgcItensGravar` aceita `tipoPreco` `manual` além de `padrao` e `especial`; valor desconhecido
  vira `padrao`. Nenhuma coluna nova: `TIPO_PRECO VARCHAR(10)` e `OBSERVACAO` já existiam.
- `sgcSolicitacoesDaMontagem` (008) devolve também a solicitação já incluída **neste** pedido,
  com `VINCULADA = 1`.

Execuções (RNF-001/RNF-002 mantidos): abrir o card = `kbCardDetalhe` + `sgcPedidoCarregar`
(+ a fila do comercial na Análise) — a carga em voo do mesmo card é uma só, qualquer que seja o
número de blocos (antes, uma por bloco). A análise só consulta quando é montada, recalculada ou
a tela ampla abre: `sgcWintAnaliseMontagem` + `sgcCoberturaListar` + `sgcItensEmPedidoAberto`
em paralelo, depois `sgcCustoUnidadesPorCaixa`, `sgcCustoPadraoAtual` e
`sgcCustoEspeciaisProdutos` em lotes de 500. O drill-in consulta ao abrir: a carga da 011
(`carga-ressuprimento.ts`, uma vez por pedido aberto) e as 3 do SKU (uma vez por produto).
Salvar continua sendo três chamadas.

Regras puras: `lib/resumo-pedido.ts` (números, aderência, aceitar, faixas, banner),
`lib/analise-pedido.ts` (linhas, chips, busca, unidade exibida, Dias, ordenação, rodapés,
diferença, título do trânsito), `lib/custo-do-item.ts` (tabelas vigentes, opções, escolha),
`lib/analise-sku.ts` (previsão, projeção e sugestões de preço especial do SKU, tiradas da página
da 011) e `clientesQueCompraram` em `lib/ressuprimento-detalhe.ts`.

## Fluxo

1. A compradora abre o card no `/quadro`. A página carrega `kbCardDetalhe` (lib) e
   `sgcPedidoCarregar` (002) — duas execuções, independentes do número de itens (RNF-002). O
   `PedidoProvider` guarda capa, itens e alertas.
2. Aba **Itens**. Sem itens gravados, a aba oferece "Montar a análise": chama
   `sgcWintAnaliseMontagem` (fornecedor, filial e período do pedido), `sgcCustoUnidadesPorCaixa`
   e `sgcCoberturaListar`; `montarItens()` calcula sugestão, arredondamento, curva, cobertura e
   limite; nada é gravado ainda.
3. A compradora ajusta quantidades, custos, tipo de preço e observações. As alterações se
   acumulam na tela; "Salvar" chama `sgcItensGravar` **uma** vez com o conjunto alterado, que
   devolve o total recalculado.
4. Ainda no salvar, a tela chama `sgcAlertasGerar` (AL-03), que devolve a contagem de não lidos.
   Se o total ou essa contagem mudaram, a tela chama **`kbCardAtualizar` uma vez** com
   `valoresJson = { valor_total, alertas_pendentes }` — os dois campos do quadro na mesma
   execução. São as três chamadas do RNF-001, independentes do número de itens. É esse campo que
   alimenta o cartão do quadro (C-06) e a `contagem` da aba Alertas.
5. Aba **Alertas**: "Marcar como lido" (`sgcEscAlertaLer`) e "Justificar" por item
   (`sgcEscAlertaJustificar`, um `UPDATE` para todos os alertas daquele produto).
6. Bloco de prazo, na aba Itens: o padrão vem das faixas do fornecedor (001) pelo valor do
   pedido; não havendo faixa, `sgcWintPrazoPagamento` sugere a condição praticada no ERP. Os
   dois lados e a justificativa são gravados normalizados por `sgcEscPedidoPrazo`.
7. "Mover para → Aprovação Técnica". O `antesDeMover` do `/quadro` chama
   `verificarSaidaAnalise(cardId)`, que é uma chamada de `sgcAnaliseSair`: regera os alertas,
   consulta `sgcAnaliseSaidaVerificar` e, `PODE = 0`, devolve `{ ok: false, erro: MOTIVO }` sem
   gravar nada. Com `PODE = 1`, a mesma execução remove os zerados, recalcula o total, limpa as
   reprovações (AT-04) e escreve o resumo no histórico (AN-10 A) — e só então a tela chama
   `ctx.mover(faseId)`.
8. O motor, ao mover, consulta a regra ligada `sgcPodeMover` (002), cuja subconsulta
   `PENDENCIAS` repete estas mesmas condições no servidor: quem chamar por fora da tela recebe
   a mesma recusa.
9. Quando a diretoria aprova e quando o pedido é enviado, **a tela da 002** chama
   `sgcEscItemStatusFase` com `aprovado` e `enviado` (F-07) — é escrita de tela, com
   `:VAR_USER` e a guarda de persona, como qualquer outra ação do card.

## Regras puras

Portadas de `p-45547/frontend/src/features/kanban/compras.ts` e `prazo-pagamento.ts`, com os
testes. Nomes em português, como o resto de `src/lib/`.

### `frontend/src/lib/compras.ts`

```ts
export interface LinhaAnalise { CODPROD: number; DESCRICAO: string; EMBALAGEM: string; UNIDADE: string;
  CODEPTO: number; CODSEC: number; UN_POR_CAIXA_ERP: number; ESTOQUE: number; TRANSITO: number;
  VENDA_PERIODO: number; VENDA_LICITACAO: number; CUSTO_ULT_ENTRADA: number }

export function mesesDoPeriodo(inicio: string, fim: string): number;
// (fim − início + 1) / 30, mínimo 1.

export function sugestaoDeCompra(vendaTotal: number, estoque: number, transito: number, meses: number): number;
// vendaMensal = vendaTotal / max(1, meses); alvo = vendaMensal < 5 ? 2,5 : 2;
// necessidade = ceil(vendaMensal × alvo); posicao = max(0, estoque − transito);
// sugestao = max(0, necessidade − posicao); havendo venda e posicao < vendaMensal, mínimo 1.

export function unidadesPorCaixa(linha: LinhaAnalise, daGestaoDeCustos?: number): number;
// gestão de custos > UN_POR_CAIXA_ERP > embalagem ("CX 12", "CAIXA COM 24", "20 UN") > 1; sempre ceil.

export function arredondarPorCaixa(sugestao: number, unidadesPorCaixa: number): number;
// ceil(sugestao / un) × un; un ≤ 1 ou sugestão ≤ 0 devolve a própria sugestão.

export function curvaAbc(linhas: LinhaAnalise[]): Map<number, 'A' | 'B' | 'C'>;
// valor = VENDA_PERIODO × CUSTO_ULT_ENTRADA; ordena desc; acumulado ≤ 80 % = A, ≤ 95 % = B, resto C;
// valor total zero = todos C.

export function coberturaFuturaDias(vendaTotal: number, estoque: number, transito: number,
                                    qtPedida: number, meses: number): number | null;
// vendaDiaria = vendaTotal / max(1, meses) / 30; ≤ 0 devolve null;
// estoqueFuturo = max(0, estoque − transito + qtPedida); dias = estoqueFuturo / vendaDiaria.

export function totalDoPedido(itens: { QT_PEDIDA: number; PRECO_CUSTO: number }[]): number;

export function montarItens(linhas: LinhaAnalise[], coberturas: Cobertura[],
                            unidadesPorCaixaPorProduto: Map<number, number>,
                            periodo: { inicio: string; fim: string }, codfornec: number): ItemMontado[];
// orquestra as cinco acima; é o que a aba chama uma vez por análise.
```

### `frontend/src/lib/cobertura.ts`

```ts
export type NivelCobertura = 'fornecedor' | 'departamento' | 'secao' | 'sku';
export interface Cobertura { id: number; nivel: NivelCobertura; codigo: string; descricao: string; limiteDias: number }
export const LIMITE_COBERTURA_PADRAO_DIAS = 35;

export function limiteDeCobertura(coberturas: Cobertura[],
  alvo: { codprod: number; codsec: number; codepto: number; codfornec: number }
): { limiteDias: number; nivel: NivelCobertura | 'padrao' };
// sku > secao > departamento > fornecedor > padrão (35). AN-07.

export function acimaDoLimite(coberturaDias: number | null, limiteDias: number): boolean;
```

### `frontend/src/lib/prazo-pagamento.ts`

```ts
export function parcelasDoPrazo(texto: unknown): number[];        // "28/35/42 dias" → [28,35,42]; "à vista" → [0]; sem número → []
export function textoDeParcelas(dias: number[]): string;          // [28,35,42] → "28/35/42"; lista vazia → ""
export function parcelasValidas(texto: unknown): boolean;         // true quando há ao menos uma parcela em dias inteiros ≥ 0
export function normalizarPrazo(texto: unknown): string;          // parcelas quando há número; senão o texto aparado em maiúsculas (D-005)
export function prazoMedioDias(texto: unknown): number | null;    // média simples, uma casa
export function compararPrazo(padrao: unknown, acordado: unknown): ComparacaoPrazo;
export function validarPrazoMontagem(e: { padrao: unknown; acordado: unknown; justificativa: unknown }): string | null;
// mensagem do bloqueio ou null. Fonte única do formulário e da trava (PZ-02, PZ-03).
```

Este módulo é o **dono único** da regra de parcelas no projeto (C-10): a 001 importa
`parcelasDoPrazo`, `textoDeParcelas` e `parcelasValidas` daqui para validar e formatar o
`PARCELAS` (`"30/60/90"`) da faixa do fornecedor, e apaga as suas cópias. Por isso as três são
puras, sem nada de pedido: texto entra, número sai.

## Simulador

### Tabelas `PC*` (SQLite, mesmos nomes e colunas do Oracle)

O DDL das `PC*` é **do integrador**, em `backend/simulator/schema-winthor.mjs` — união das
colunas que a 001 e a 003 usam (B-05). Esta spec não cria tabela nenhuma no simulador: o
`seed/003-itens.mjs` só **insere linhas**. As colunas que estas consultas exigem (o DDL do
`p-45547` está defasado e não tem `OBS2`, `QTVENDMES*`, `CODATV1` nem as tabelas de lote,
D-010):

| Tabela | Colunas |
|---|---|
| `PCPRODUT` | `CODPROD`, `DESCRICAO`, `EMBALAGEM`, `UNIDADE`, `CODFORNEC`, `CODEPTO`, `CODSEC`, `QTUNITCX`, `OBS2`, `PRAZOVAL` |
| `PCEST` | `CODPROD`, `CODFILIAL`, `QTEST`, `QTVENDMES`, `QTVENDMES1`, `QTVENDMES2`, `QTPEDIDA`, `CUSTOULTENT`, `DTULTENT`, `DTULTSAIDA` |
| `PCESTTRANSITO` | `ID`, `CODPROD`, `CODFILIAL`, `QTTRANSITO`, `DTPREVISTA` |
| `PCMOV` | `NUMTRANSITEM`, `CODPROD`, `CODFILIAL`, `CODCLI`, `CODOPER`, `DTMOV`, `QT`, `PUNIT`, `NUMPED` |
| `PCCLIENT` | `CODCLI`, `CLIENTE`, `TIPOFJ`, `CODATV1` |
| `PCFILIAL` | `CODIGO`, `RAZAOSOCIAL` — **linhas da 001**: `1` Benenutri Matriz, `2` Benenutri Filial Norte, `3` Benenutri Filial Sul (mais o `99`, que as consultas descartam) |
| `PCFORNEC` | `CODFORNEC`, `FORNECEDOR` — **linhas da 001**: 1015 Fresenius Kabi e 1042 Nestlé (ativos), 1088 Danone (inativo) |
| `PCDEPTO`, `PCSECAO` | `CODEPTO`/`CODSEC`, `DESCRICAO` — alimentam o seletor da tela de coberturas |
| `PCLOTE` | `ID`, `CODPROD`, `CODFILIAL`, `NUMLOTE`, `DTVALIDADE` |
| `PCESTENDLOTE` | `CODPROD`, `NUMLOTE`, `MODULO`, `RUA`, `NUMERO`, `APTO`, `TIPOENDER`, `QT` |
| `PCLOTEEND` | `CODFILIAL`, `CODPROD`, `NUMLOTE`, `MODULO`, `RUA`, `NUMERO`, `APTO`, `TIPOENDER` |
| `PCPEDIDO` | `NUMPED`, `CODFORNEC`, `CODFILIAL`, `DTEMISSAO`, `VLTOTAL`, `PRAZO1`, `PRAZO2`, `PRAZO3` |
| `CUSTO_PRODUTOS` (simula a `PRODUTOS` da conexão `gestao-de-custos`) | `CODPROD`, `UNIDADES_POR_CAIXA` |

### Seed — `backend/simulator/seed/003-itens.mjs`

Só **linhas**, nenhuma tabela e nenhum fornecedor ou filial próprio: os dois fornecedores
(**1015** Fresenius Kabi, com os 20 produtos, e **1042** Nestlé, com 4) e as três filiais
(**1** Benenutri Matriz, a do pedido; **2** Benenutri Filial Norte; **3** Benenutri Filial Sul)
vêm do `seed/001-fornecedores.mjs` (B-05, B-06). As personas vêm do `seed/002-quadro.mjs`, dono
único de `SGC_USUARIO_PERSONA` (B-07).

- **20 produtos do fornecedor 1015**, `CODPROD` 5001…5020: 1 com `OBS2 = 'INATIVO'` e 1 com
  `CODEPTO = 4` (provam o recorte de RN-011 e o C-001, que espera 18 linhas); departamentos 2 e 3,
  seções 21 e 31; embalagens "CX 12", "CAIXA COM 24", "FRASCO 100 ML".
- **Vendas (`PCMOV`)** no período 01/08–14/09/2026 desenhadas para os números da spec: 5001 com
  18 unidades (12/mês) e 5 em estoque, 2 em trânsito → sugestão 21; 5002 com 6 (4/mês) e sem
  estoque → 10; 5003 com 18 e 30 em estoque → 0; 5004 com 45 (30/mês) e 10 em estoque → cobertura
  40 dias com 30 pedidos; 5005…5009 com valor de venda 500/250/150/70/30 para a curva ABC.
- **Clientes públicos**: 2 clientes com `CODATV1` 12 e 20 e 1 privado com `CODATV1` 1; parte da
  venda do 5001 sai por eles para provar a coluna de licitação e a inclusão na venda total.
- **Lote a vencer**: 5001, lote `L2026A`, 30 unidades na **filial 2 (Benenutri Filial Norte)**,
  `DTVALIDADE` = hoje + 60; e um lote de controle com hoje + 120 (não deve alertar).
- **Excesso em outra filial**: 5001 na filial 2 com `QTEST` 300 e `QTVENDMES+1+2` = 270
  (100 dias); e um de controle com 79 dias (não deve alertar).
- **`PCPEDIDO`**: dois pedidos do fornecedor 1015 com `PRAZO1/2/3` = 28/35/42.
- **`CUSTO_PRODUTOS`**: 5001 com 12 unidades por caixa; 5010 sem linha (cai na embalagem).
- **`SGC_COBERTURA`**: departamento 2 = 60 dias, produto 5001 = 20 dias (C-008).
- **Pedidos do SGC**: 1 card na fase `analise` com os 20 itens do fornecedor 1015, 1 card com
  todos os itens zerados (C-017) e 1 card pronto para sair (C-018).
- Usuários: os do `CENARIO` da 002 — `{ admin: 1, ana: 2, gil: 3, dora: 4, leo: 5 }`, com `ana`
  analista, `gil` gestor, `dora` diretoria e `leo` comercial (P-01). O seed da 003 **não** grava
  `SGC_USUARIO_PERSONA` (B-07); só os usa nos asserts.

### `CHECK_INPUT`

Acrescentar em `backend/simulator/config.mjs` (arquivo do integrador): `codfornec: '1015'`,
`codfilial: '1'`, `dataInicio: '2026-08-01'`, `dataFim: '2026-09-14'`, `codprods: '5001,5002'`,
`codprod: '0'`, `diasValidade: '90'`, `diasEstoque: '80'`, `nivel: ''`. `cardId`, `busca`,
`limite` e `offset` já existem. O `sim:check` pula escrita e JAVASCRIPT, então nenhuma tupla de
`{{linhas}}` precisa entrar aqui.

### Dialeto

`NVL`, `TO_DATE`, `TO_CHAR`, `TRUNC`, `SYSDATE` e `ROWNUM` já são shims do dialeto; esta spec
acrescenta o uso de `SYSDATE + N` (aritmética de dias) e de `ROUND(data − SYSDATE)` nas
consultas de lote, e `CONCAT` na `sgcAnaliseSaidaVerificar`. Se algum faltar, entra em
`simulator/mysql-dialect.mjs` (arquivo do integrador).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `smoke/003-itens.mjs` | `sgcWintAnaliseMontagem` com 1015/1/01-08–14-09 devolve **18** linhas (> 0), nenhuma com `CODEPTO` 4 ou 7 |
| C-002 | `tests/compras.test.mjs` | `sugestaoDeCompra(18, 5, 2, 1.5)` → 21 |
| C-003 | `tests/compras.test.mjs` | `sugestaoDeCompra(6, 0, 0, 1.5)` → 10 |
| C-004 | `tests/compras.test.mjs` | `arredondarPorCaixa(21, 12)` → 24; `arredondarPorCaixa(21, 1)` → 21 |
| C-005 | `tests/compras.test.mjs` | `sugestaoDeCompra(18, 30, 0, 1.5)` → 0 |
| C-006 | `tests/compras.test.mjs` | 5 linhas com valores 500/250/150/70/30 → `['A','A','B','C','C']` |
| C-007 | `tests/compras.test.mjs` + `smoke/003-itens.mjs` | `coberturaFuturaDias(45, 10, 0, 30, 1.5)` → 40; com o item gravado sem justificativa, `sgcAnaliseSaidaVerificar` devolve `PODE = 0` e `MOTIVO` contendo "cobertura" |
| C-008 | `tests/cobertura.test.mjs` | limites [departamento 2 = 60, sku 5001 = 20] → 5001 = 20 (`nivel: 'sku'`), 5002 = 60, 7001 = 35 (`nivel: 'padrao'`) |
| C-009 | `smoke/003-itens.mjs` | `sgcWintBuscarProduto` com `busca: 'creme'` devolve ≥ 1 e ≤ 20 linhas, nenhuma inativa; com `codprod: 5001` devolve exatamente 1 |
| C-010 | `smoke/003-itens.mjs` | `sgcItensGravar` com 9 itens num `itensJson` devolve `{ itens: 9 }`; `SELECT` traz as 9 quantidades; `SGC_PEDIDO.VL_TOTAL` = soma esperada |
| C-011 | `smoke/003-itens.mjs` | `sgcWintLotesAVencer` devolve > 0 linhas; `sgcAlertasGerar` cria 1 alerta `vencimento` do 5001 com "60" e "Benenutri Filial Norte" na mensagem (ou comparando por `CODFILIAL` 2) |
| C-012 | `smoke/003-itens.mjs` | `sgcWintExcessoOutrasFiliais` devolve > 0 linhas; o alerta `excesso` traz `DIAS_ESTOQUE` 100 |
| C-013 | `smoke/003-itens.mjs` | com 2 alertas não lidos, `PODE = 0` e `MOTIVO` contém "2 alertas"; depois de `sgcEscAlertaLer` com `id: 0`, a condição sai da frente |
| C-014 | `smoke/003-itens.mjs` | item alertado com `QT_PEDIDA` 30 sem justificativa → `PODE = 0` com a descrição do produto no `MOTIVO`; `sgcEscAlertaJustificar` libera |
| C-015 | `tests/prazo-pagamento.test.mjs` + `smoke/003-itens.mjs` | `compararPrazo('30/60','28/35/42')` → `{ iguais: false, diferencaDias: -10, exigeJustificativa: true }`; gravado com justificativa de 9 caracteres, `PODE = 0`; com 10, `PODE = 1` |
| C-016 | `tests/prazo-pagamento.test.mjs` | `compararPrazo('30 dias','à vista')` → parcelas `[30]` × `[0]`, `exigeJustificativa: true` |
| C-017 | `smoke/003-itens.mjs` | card com 3 itens zerados → `PODE = 0` e `MOTIVO` contém "pelo menos um item" |
| C-018 | `smoke/003-itens.mjs` | `sgcAnaliseSair` num card com 20 itens (8 com quantidade) → `{ ok: true, removidos: 12 }`, restam 8 com `STATUS <> 'removido'`, `VL_TOTAL` recalculado e 1 registro de nota no histórico com "8 itens"; no card com alerta não lido, `{ ok: false }` e **nada** gravado (os 20 itens continuam vivos) |
| C-019 | `smoke/003-itens.mjs` | `sgcPodeMover` (002) para a fase `cancelado` devolve `PODE = 1` com os mesmos 2 alertas não lidos e nenhum item |
| C-020 | `smoke/003-itens.mjs` | `sgcEscCoberturaGravar` como `gil` (gestor) grava e `sgcCoberturaListar` devolve o limite 20 do 5001; como `ana` (analista) não grava nada |
| C-021 | `smoke/003-itens.mjs` | gravar `TIPO_PRECO` `especial` em 1 de 3 itens → `SELECT` conta 1 especial e 2 `padrao` |
| C-022 | `smoke/003-itens.mjs` | card reprovado com 3 itens zerados → depois de `sgcAnaliseSair`, 0 itens zerados vivos e `TEC_MOTIVO` vazio |
| RN-001 | `tests/compras.test.mjs` | (0,0,0,6)→0; (120,10,0,6)→30; (12,0,0,6)→5; (120,50,20,6)→10; (120,500,0,6)→0 |
| RN-002 | `tests/compras.test.mjs` | "CX 12"→12; "FRASCO 100 ML"→1; gestão de custos 6 com embalagem "CX 12" → 6 |
| RN-003 | `tests/compras.test.mjs` | lista vazia → mapa vazio; todos com custo 0 → todos `C` |
| RN-004 | `tests/compras.test.mjs` | `coberturaFuturaDias(180,10,5,20,6)` → 25; `(0,100,0,50,6)` → `null` |
| RN-005 | `tests/cobertura.test.mjs` | fornecedor 90 / departamento 60 / seção 45 / sku 20 → 20; sem o sku → 45; sem nenhum → 35 |
| RN-006 | `tests/prazo-pagamento.test.mjs` | `'28/35/42 dias'`→[28,35,42]; `'à vista'`→[0]; `'conforme contrato'`→[]; `'30/60'` × `'30/60 dias'` → iguais |
| RN-007 | `tests/prazo-pagamento.test.mjs` | divergente com 9 caracteres → mensagem; com 10 → `null`; padrão vazio → mensagem citando "padrão" |
| RN-008 | `tests/compras.test.mjs` | `totalDoPedido([{10;2,50},{4;10,00},{0;8,00}])` → 65,00 |
| RN-009 | `smoke/003-itens.mjs` | lote com 91 dias não vira alerta; com 90, vira |
| RN-010 | `smoke/003-itens.mjs` | 79 dias em outra filial não alerta; 81 alerta; 100 dias na filial do pedido não alerta |
| RN-011 | `smoke/003-itens.mjs` | a análise não traz o produto com `OBS2` nem o do departamento 4; o 5001 traz `VENDA_LICITACAO` 6 dentro de `VENDA_PERIODO` 18 |
| RN-012 | `smoke/003-itens.mjs` | cinco chamadas de `sgcAnaliseSaidaVerificar`, cada uma com só uma condição quebrada, devolvem `PODE = 0` com a sua mensagem; tudo satisfeito → `PODE = 1` e `MOTIVO` vazio |
| RN-013 | `smoke/003-itens.mjs` | `sgcEscItemStatusFase` com `aprovado` e depois `enviado` muda os itens vivos e não toca nos `removido` |
| RN-014 | `smoke/003-itens.mjs` | `sgcEscItemRemoverZerados` num card com 20 itens deixa 8 vivos |
| C-023 | `tests/resumo-pedido.test.mjs` | `reprovacoesDoPedido` com técnica e diretoria → `['diretoria','tecnica']`; `codigosCitados('5001, 5002 e 5010; 5001')` → `[5001, 5002, 5010]` |
| C-024 | `tests/resumo-pedido.test.mjs` | `numerosDoPedido`, `aderenciaASugestao` (base 4, seguem 2, 50 %, `attention`), `aceitarSugestao` (→ 12 e 0) e `faixasDoResumo` com os números da spec |
| C-025 | `tests/analise-pedido.test.mjs` | `linhasDaAnalise`, `filtrarAnalise`, `rodapeDaAnalise`, `diferencaDoItem`, `rodapeDosItens` e `textoDoTransito` com os números da spec |
| C-026 | `smoke/003-itens.mjs` + `simulator/winthor-checar.mjs` | 5002: `VENDA_PRIVADO` 6, `VENDA_PF` 8, `VENDA_PUBLICO` 3, `VENDA_PERIODO` 26, `VENDA_LICITACAO` 8; no WinThor real (119, filial 1) privado em > 0 produtos e a soma das três ≤ a venda total |
| C-027 | `smoke/003-itens.mjs` + `tests/custo-do-item.test.mjs` | `TIPO_PRECO` `manual` lido de volta, `qualquer` vira `padrao`; `custoDaEscolha('esp:2:8.5')` → 8,5 especial |
| C-028 | `tests/analise-sku.test.mjs` + `tests/ressuprimento-detalhe.test.mjs` | `previsaoDoSku` sem dado pronto → `null`; `clientesQueCompraram` de outubro → 9 (45), 12 (30), 0 (1), vendas da mais recente |
| RN-015 | `tests/resumo-pedido.test.mjs` | `tomDaAderencia` 80 → `live`, 79 e 50 → `attention`, 49 → `alert` |
| RN-016 | `smoke/003-itens.mjs` | ver C-026 |
| RN-017 | `tests/analise-pedido.test.mjs` | `proximaOrdem` padrão → invertida → `null`; `ordenarAnalise` por venda, produto, curva e dias |
| RN-018 | `tests/analise-pedido.test.mjs` | `naUnidade`, `daUnidade`, `segundaLinhaComprar` |
| RN-019 | `tests/analise-pedido.test.mjs` | `rotuloDias` nos cinco casos |
| RN-020 | `tests/custo-do-item.test.mjs` | `tabelasVigentes` → 2 de 6; `opcoesDeCusto` → padrão, tabela, especial fora da vigência, manual |

- **Backend:** `backend/simulator/smoke/003-itens.mjs`, um `teste()` por linha, título começando
  pelo id. Toda consulta ao WinThor assere **contagem > 0** (vazio não é verde).
- **Frontend:** `frontend/tests/compras.test.mjs`, `prazo-pagamento.test.mjs` e
  `cobertura.test.mjs` com `node --test` sobre `src/lib/`.
- **Seed extra para o smoke:** nenhum além do `seed/003-itens.mjs`; os cards de C-017, C-018 e
  C-022 já nascem lá.

## Dependências entre specs

**Consome da 002 (quadro):**

- `SGC_PEDIDO` — lê `ID_CARD`, `CODFORNEC`, `CODFILIAL`, `PERIODO_INICIO`, `PERIODO_FIM`.
- `sgcPedidoCarregar` — precisa devolver, além da capa, **os itens** (`ID`, `CODPROD`,
  `DESCRICAO`, `EMBALAGEM`, `UNIDADE`, `CODEPTO`, `CODSEC`, `UN_POR_CAIXA`, `QT_VENDA_TOTAL`,
  `QT_VENDA_LICITACAO`, `QT_ESTOQUE`, `QT_TRANSITO`, `QT_SUGERIDA`, `QT_PEDIDA`, `PRECO_CUSTO`,
  `TIPO_PRECO`, `CURVA_ABC`, `COBERTURA_DIAS`, `COBERTURA_LIMITE`, `COBERTURA_JUSTIFICATIVA`,
  `OBSERVACAO`, `STATUS`) e **os alertas** (`ID`, `CODPROD`, `TIPO`, `MENSAGEM`, `LIDO`,
  `LIDO_POR`, `LIDO_EM`, `JUSTIFICATIVA`), numa execução só.
- `sgcPodeMover` — mantém a subconsulta `PENDENCIAS`, que esta spec preenche com as mesmas
  condições de `sgcAnaliseSaidaVerificar`, no ramo `analise → tecnica` (bloco pronto na seção
  de contratos).
- `sgcEscPedidoReprovacoesLimpar` — SQL da 002 com `{{usuarioId}}` e `{{idCard}}`, **só esses
  dois** (sem `agora`, R-01) e **sem** `:VAR_USER`, porque a chamada é aninhada. Chamada por id
  **só** pelo `sgcAnaliseSair`, que confere a persona por `runQueryMitra` com `:VAR_USER` antes
  de escrever (AT-04).
- A página `/quadro` liga as abas (`abasExtras`), envolve o `KanbanBoard` no `PedidoProvider` e
  chama `verificarSaidaAnalise` (isto é, `sgcAnaliseSair`) no `antesDeMover` de
  `analise → tecnica`, antes de `ctx.mover`.
- Campo do quadro `alertas_pendentes` (número) — criado pelo `add-005` da 002.

**Consome da 001 (fornecedores):** `SGC_FORNECEDOR_FAIXA_PRAZO` (faixa de valor → opções de
prazo, formato `"30/60/90"`) e `sgcFornecedorCarregar`, para o prazo padrão e para os contatos
que a 002 usa no envio. `PCFORNEC`/`PCFILIAL` no simulador são compartilhadas com a 001.

**Fornece:**

- `sgcAnaliseSaidaVerificar` (para a 002 e para o `antesDeMover`);
- `SGC_PEDIDO.VL_TOTAL` e o campo `valor_total` do quadro, atualizados a cada gravação de itens;
- `sgcEscItemStatusFase` — escrita de **tela** (`:VAR_USER`, guarda `admin`/`analista`/`gestor`/`diretoria` mais `ACCESS_LEVEL <> 'READ_ONLY'`), input `{ idCard, status, atualizadoEm }`, sem `usuarioId`: a tela da 002 a chama depois da aprovação da diretoria (`'aprovado'`) e depois do envio (`'enviado'`) — F-07;
- `SGC_PEDIDO_ITEM` como fonte da tabela de itens do e-mail à indústria (EN-02, 002), já sem os
  zerados;
- `SGC_COBERTURA` como base da parametrização por curva ABC da onda 4;
- `lib/prazo-pagamento.ts` (`parcelasDoPrazo`, `textoDeParcelas`, `parcelasValidas`) — **a 001 é
  consumidora** (C-10): valida e formata o `PARCELAS` da faixa do fornecedor importando daqui e
  remove as suas duplicatas.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | A venda **total** do período inclui a licitação e é a base da sugestão; a licitação aparece numa coluna à parte | Sugestão sobre a venda privada | AN-04 decisão A é explícita ("venda total, inclusive licitação") e AN-03 pede a licitação visível à parte |
| D-002 | A consulta de análise **corrige** o legado: no `p-45547` o `WHERE` da subconsulta de venda excluía os clientes públicos, o que zerava `QT_LICIT` sempre | Porte literal | Portar o defeito entregaria uma coluna sempre zero e contradiria AN-03 e D-001. `QT_TOTAL` passa a somar toda saída positiva e `QT_LICIT` a parte pública |
| D-003 | Itens e alertas do card aberto vivem num `PedidoProvider` do `/quadro`, alimentado por uma chamada de `sgcPedidoCarregar` por abertura | Cada aba carregar o que precisa | Duas abas carregando dobrariam as execuções e recarregariam a cada troca de aba; o teto é 300/min (RNF-002) |
| D-004 | O prazo **padrão** vem das faixas do fornecedor (001); `sgcWintPrazoPagamento` só sugere quando não há faixa para o valor do pedido | Padrão vindo só do ERP | PZ-01 diz que o padrão é o parametrizado; o ERP é a rede de segurança para fornecedor ainda não parametrizado |
| D-005 | Padrão e acordado são gravados **normalizados** (`"28/35/42"`) pela regra pura | Guardar o texto digitado e repetir a comparação por parcelas dentro do SQL | Faz a igualdade de texto no servidor coincidir com a igualdade de parcelas na tela; uma regra, dois lugares, sem reimplementar o parser em SQL (PZ-02/PZ-04) |
| D-006 | A gravação de itens é **um upsert de várias tuplas** (`VALUES {{linhas}}`), em lotes de 200, e não uma escrita por item | Uma execução por item | 200 itens = 200 execuções estouram o teto do projeto. `ponytail:` teto de 200 tuplas por execução; acima disso o JS fatia |
| D-007 | `SGC_ALERTA` aponta para o item por `CODPROD` (com `ID_CARD`), não por `ID_ITEM` | `ID_ITEM` como no rascunho do 000 | O upsert em lote não devolve ids; e o item pode ser removido e readicionado, o que invalidaria o `ID_ITEM` mas não o produto |
| D-008 | A justificativa de AL-05 mora em `SGC_ALERTA.JUSTIFICATIVA` e é gravada para todos os alertas do produto numa instrução; `SGC_PEDIDO_ITEM.OBSERVACAO` continua sendo a nota livre que vai no e-mail | Usar a observação do item como justificativa (legado) | Separa "por que comprei mesmo assim" de "o que a indústria precisa saber", sem custar execução extra |
| D-009 | O cancelamento não consulta `sgcAnaliseSaidaVerificar`: o ramo da `sgcPodeMover` só existe para o destino `tecnica` | Verificar sempre e abrir exceção | CA-03 é explícito, e exceção dentro da regra é o tipo de coisa que se esquece de testar |
| D-010 | O `schema-winthor.mjs` do integrador ganha as `PC*` com as colunas que estas consultas usam, inclusive as três tabelas de lote; o seed da 003 só insere linhas | Reaproveitar o DDL do `p-45547`, ou cada spec criar as suas `PC*` | O DDL de lá está declaradamente defasado (não tem `OBS2`, `QTVENDMES*`, `CODATV1`, `PCESTENDLOTE`, `PCLOTEEND`): a mesma SQL da produção não rodaria. E duas specs criando a mesma tabela dariam esquema diferente conforme a ordem do seed (B-05) |
| D-011 | Tela própria `/coberturas`, para admin e gestor | Dentro de `/fornecedores/:id` | Os quatro níveis (fornecedor, departamento, seção, SKU) não cabem numa tela de fornecedor, e `/fornecedores` é arquivo da 001 — pôr a parametrização lá criaria dono compartilhado sem necessidade |
| D-012 | "Ao menos um item com quantidade" entra como quinta condição de saída, **nova** em relação ao p-45547 | Manter as quatro do legado | Sem ela, um pedido com tudo zerado sairia da Análise e chegaria à indústria com a tabela vazia (EN-02 remove os zerados) |
| D-013 | `sgcAnaliseSair` é uma SF JavaScript nova e é **o** passo do `antesDeMover` em `analise → tecnica`: verifica, arruma e só então a tela move | A tela chamar as escritas em sequência, ou arrumar depois do movimento | Verificação e limpeza precisam acontecer juntas e antes do movimento: o motor só move o que já está arrumado, e uma aba fechada no meio não deixa o pedido pela metade (revisão do coordenador, R-011) |
| D-014 | A análise não é gravada sozinha: montar a lista só grava quando a compradora salva | Persistir a análise ao abrir | Abrir o card não pode escrever (RNF-002) nem sujar o pedido de quem só foi olhar |
| D-015 | R-133: a divisão Privado / PF / Público é só leitura na tela; a sugestão e a cobertura seguem sobre `VENDA_PERIODO` (RN-001/RN-004) | Passar a sugestão para a venda válida sem público, como no legado | O usuário ainda decide entre a fórmula atual e a do legado (35 dias, sem público, estoque + trânsito); mudar a base agora mudaria a sugestão de todo pedido |
| D-016 | R-133: a análise deixa de pôr os produtos na lista; o produto vira item ao ser adicionado (tela ampla, lote, drill-in, solicitação) | Manter a lista com todos os produtos a 0 | É o carrinho do legado: a lista do pedido mostra o que se compra; os zerados continuavam a ser gravados e removidos na saída |
| D-017 | R-133: o rascunho dos itens é um contexto da fase, não estado da aba | Cada bloco com a sua cópia | O resumo, os itens, a tela ampla, os cartões e o drill-in mexem na mesma lista; uma cópia por bloco faria "Aceitar sugestão" e "Atualizar p/ N" discordarem do que vai ser salvo |
| D-018 | R-133: o drill-in reaproveita a Análise do Produto da 011 e a carga dela (`carga-ressuprimento.ts`), tirada da página; a simulação dentro da janela segue a fórmula da 011 e o bloco "Item no pedido" mostra a sugestão da 003 | Uma janela própria do pedido | O pedido pediu a mesma janela; duas sugestões aparecem lado a lado até a decisão sobre a fórmula (D-015) |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `IN ({{codprods}})` acima de 1.000 itens estoura `ORA-01795` | alertas não geram no fornecedor grande | o JS fatia em lotes de 500 e soma os resultados (o legado tem o mesmo teto) |
| Texto de produto com aspas quebra o `VALUES {{linhas}}` | gravação falha ou, pior, injeta | o `escapar()` do `sgcItensGravar` dobra aspas simples e corta caracteres de controle; teste com descrição contendo `'` |
| A integração `gestao-de-custos` não existir no sandbox no dia | unidades por caixa caem para a embalagem | o fallback já é a embalagem (RN-002); a tela mostra a origem do número no `title` da célula |
| `sgcPedidoCarregar` (002) não devolver itens e alertas | as abas passariam a carregar sozinhas e dobrariam as execuções | contrato listado em *Dependências*; o smoke da 002 cobre as colunas |
| Regeneração de alertas apagar leitura/justificativa | a compradora relê tudo a cada gravação | `UNIQUE (ID_CARD, CHAVE)` + `ON DUPLICATE KEY UPDATE` só da mensagem; C-013 testa |
| `sgcAnaliseSair` arruma o pedido e o movimento seguinte é recusado pela persona (`sgcPodeMover`) | zerados removidos e nota escrita sem o pedido ter mudado de fase | o `podeMover` síncrono da tela já desabilita o destino para quem não pode mover, com a mesma regra da SQL ligada: o `antesDeMover` só roda em destino habilitado. Nenhuma das escritas é destrutiva (zerado vira `removido`, a nota é histórico) |

## Complexity Tracking

Vazio: nenhuma violação de princípio.
