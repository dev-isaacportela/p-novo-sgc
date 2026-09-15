# Plan: Produtos em B.O. — itens indisponíveis, previsão de liberação e impacto no cliente

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; 17 cenários e 12 regras, todos vindos de O2-06, R-022, R-023, R-024, R-026, R-027, R-028, R-029, R-030 e R-034 |
| Backend escrito local, executado no sandbox | sim | arquivo novo `backend/add-010-bo.mjs` e dois fragmentos em `backend/sql/`; as 3 tabelas novas e as 2 colunas de `SGC_PEDIDO` entram no `setup-backend.mjs` pela **base da onda 2 (S2)**, que cria TODAS as tabelas e colunas da onda antes do fan-out (arquivo compartilhado, R-026). Nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL vive no `CREATE TABLE` do `setup-backend.mjs` (a onda 2 **edita o CREATE**, sem `ALTER` — nada foi publicado ainda) e a migration é gerada pelo sandbox |
| Leitura e escrita por Server Function | sim | a aba e o painel usam `linhas()`/`acao()` de `src/lib/mitra-api.ts`; zero `listRecords`/`patchRecord`. Escrita de pessoa é SF SQL guardada por `:VAR_USER`; escrita de processo é SQL interna chamada por id, com a mesma guarda sobre `{{usuarioId}}` (R-013, achado A1) |
| Simulador cobre a feature | sim | `simulator/seed/007-bo.mjs` só insere linhas (2 produtos novos do fornecedor 1042, vendas `CODOPER = 'S'` dos últimos 60 dias, clientes próprios, 4 cards e os registros de B.O.); `PC*` são do integrador (R-017/R-027); `sim:check` roda as 6 SQL de leitura |
| Testes automatizados obrigatórios | sim | 17 cenários e 12 regras mapeados em `backend/simulator/smoke/007-bo.mjs` e em `frontend/tests/bo.test.mjs` |
| Design tokens, sem cor literal | sim | painel e aba montados com o vocabulário de `components/page.tsx` (`Panel`, `Toolbar`, `Table`, `Status`, `Code`, `Dash`, `Pagination`, `Dialog`, `DatePicker`); zero hex, zero `style={{}}`, zero classe Tailwind solta na página |
| Simplicidade | sim | nenhuma dependência nova; nenhuma abstração com uma implementação só; uma SF JS resolve marcar e liberar (D-002); a regra pura de B.O. é um módulo de ~80 linhas |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`; leitura do WinThor por JDBC Oracle (`jdbcId` resolvido por nome no `isEntrypoint()`, `jdbcIdWinthor` de `add-003-jdbc-winthor.mjs`)
- **Reuso identificado:**
  - `@benenutri/mitra-kanban` (1.3.0, `^1.4.0` na release da onda 2): `abasExtras` + `ExtensaoContexto` (`ctx.mover`, `ctx.recarregar`, `ctx.avisar`) e `kbNotaRegistrar` (com `usuarioId`, que só vale sem sessão). **Não** usa `kbCardMover` com `movidoPor` (R-021): quem move é sempre uma pessoa, pela tela.
  - Spec 002: `PERSONA_EFETIVA`/`guardaPersonaDe` (R-013, copiados literalmente), `SGC_FASE` (chave estável), `sgcPodeMover` (os dois blocos novos de R-030), `notificacoesUniao` (o ramo de `SGC_AVISO` é da 005).
  - Spec 003: `SGC_PEDIDO_ITEM` (a lista de itens do pedido e o `STATUS`), o `PedidoProvider`/`usePedido()` do card aberto (o diálogo "Marcar itens" lê os itens de lá, sem SF extra), `lote()`/`texto()`/`chamar()` do preâmbulo JS de `add-006-itens.mjs`.
  - Spec 001: transporte de arquivo — `uploadFilePublicMitra({ file })` devolvendo `publicUrl` (o mesmo `DocumentoDialogo.tsx`), e `/uploads` do `simulator/server.mjs`.
  - Spec 005: `SGC_AVISO` e `sgcEscAvisoInserir` (chamada por id, R-023).
  - `components/page.tsx` e `components/DatePicker.tsx` (UI-03 B); `lib/formato.ts` (`fmtData`, `hojeIso`).
- **Dependência nova:** nenhuma

## Modelo de dados

Três tabelas novas e duas colunas em `SGC_PEDIDO`, todas no `setup-backend.mjs`
(criadas pela **base da onda 2, S2**, antes do fan-out — R-026). Convenções do 000: colunas em UPPERCASE, datas em
`VARCHAR(10)`, carimbos em `VARCHAR(19)`, sem `FOREIGN KEY`, `ID` autoincremento,
`CODFORNEC INT`, `CODFILIAL VARCHAR(10)`.

### `SGC_BO_ITEM` (N:1 `KB_CARD`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_CARD` | `INT NOT NULL` | card do pedido |
| `CODPROD` | `INT NOT NULL` | liga ao item por `(ID_CARD, CODPROD)`, nunca por `ID_ITEM` — mesma razão de D-007 da 003 (o upsert em lote não devolve ids e o item pode sair e voltar) |
| `DESCRICAO` | `VARCHAR(200)` | copiada do item na marcação; o painel não reconsulta o ERP para desenhar |
| `QT_PENDENTE` | `DECIMAL(15,3)` | RN-001: `> 0` e `<= SGC_PEDIDO_ITEM.QT_PEDIDA` |
| `OBSERVACAO` | `VARCHAR(500)` | |
| `STATUS` | `VARCHAR(20) DEFAULT 'aberto'` | `aberto` \| `liberado` \| `cancelado` |
| `CLIENTES_IMPACTADOS` | `INT DEFAULT 0` | foto do WinThor na marcação (RN-002) |
| `QT_VENDIDA_60D` | `DECIMAL(15,3) DEFAULT 0` | idem |
| `CRIADO_POR` | `INT` | |
| `CRIADO_EM` | `VARCHAR(19)` | |
| `RESOLVIDO_POR` | `INT` | |
| `RESOLVIDO_EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_SGC_BO_ITEM (ID_CARD, CODPROD)` — é o que faz o upsert em lote e garante
"um produto aparece no máximo uma vez por pedido" (C-016). Índice
`IX_SGC_BO_ITEM_CARD (ID_CARD, STATUS)`, que é o recorte do painel e das pendências.

### `SGC_BO_PREVISAO` (N:1 `KB_CARD`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_CARD` | `INT NOT NULL` | |
| `DT_PREVISAO` | `VARCHAR(10) NOT NULL` | `AAAA-MM-DD` |
| `OBSERVACAO` | `VARCHAR(500)` | |
| `REGISTRADO_POR` | `INT` | |
| `REGISTRADO_EM` | `VARCHAR(19)` | |

Histórico append-only; a vigente é espelhada em `SGC_PEDIDO.DT_PREVISAO_BO`. Índice
`IX_SGC_BO_PREVISAO_CARD (ID_CARD, ID)`.

### `SGC_BO_DOCUMENTO` (N:1 `KB_CARD`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_CARD` | `INT NOT NULL` | |
| `TIPO` | `VARCHAR(20) DEFAULT 'carta_falta'` | `carta_falta` \| `outro` (RN-011) |
| `NOME_ARQUIVO` | `VARCHAR(255)` | |
| `ENDERECO` | `VARCHAR(700)` | endereço público devolvido pelo envio do arquivo; **o mesmo nome e o mesmo tipo** de `SGC_FORNECEDOR_DOCUMENTO.ENDERECO` da 001 (R-040) |
| `ENVIADO_POR` | `INT` | |
| `ENVIADO_EM` | `VARCHAR(19)` | |

Índice `IX_SGC_BO_DOCUMENTO_CARD (ID_CARD, ID)`.

### Colunas novas em `SGC_PEDIDO` (R-026)

| Coluna | Tipo | Observação |
|---|---|---|
| `DT_PREVISAO_BO` | `VARCHAR(10)` | previsão vigente (espelho da última de `SGC_BO_PREVISAO`) |
| `ALERTA_BO_EM` | `VARCHAR(10)` | **o dia** do último aviso, não o carimbo — o alerta é um por dia e a coluna é comparada com o dia (D-005; evita a dívida D-13 da onda 1) |

### Valor novo em `SGC_PEDIDO_ITEM.STATUS` (R-022, R-039)

`bo`, ao lado de `montagem`, `aprovado`, `reprovado`, `enviado` e `removido` — e **só**
ele: R-039 fecha que a situação do item não acompanha Faturamento nem Concluídas, e que o
item liberado volta a `enviado`. Nenhuma mudança de schema: a coluna já é `VARCHAR(20)`.

### Só leitura, de outras specs

`SGC_PEDIDO` (002): `ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`.
`SGC_PEDIDO_ITEM` (003): `CODPROD`, `DESCRICAO`, `EMBALAGEM`, `UNIDADE`, `QT_PEDIDA`,
`PRECO_CUSTO`, `STATUS`. `SGC_FASE` (002): a chave `bo`/`faturamento`.
`SGC_USUARIO_PERSONA` + `INT_USER` (002): a guarda de persona.
`SGC_AVISO` (005): escrita por `sgcEscAvisoInserir`, nunca por SQL desta spec.

## Contratos de backend

Tudo em `backend/add-010-bo.mjs`, que exporta `definitions` (R-024). Ids locais:
**7701–7709** (leituras e JS), **7750–7756** (escritas). Filtro desligado é `''` no texto
e `0` no número; toda listagem tem `LIMIT/OFFSET`.

### Leitura — WinThor (Oracle)

| Nome | Id | Tipo | Entrada (`{{param}}`, desligado) | Saída | Atende |
|---|---|---|---|---|---|
| `sgcWintClientesImpactados` | 7706 | SQL (Oracle) | `codprods` (`'0'`), `dias` (`0`) | `CODPROD, CLIENTES_IMPACTADOS, QT_VENDIDA_60D` | RF-003, RN-002 |

```sql
SELECT M.CODPROD,
       COUNT(DISTINCT M.CODCLI)                          AS CLIENTES_IMPACTADOS,
       NVL(SUM(CASE WHEN M.QT > 0 THEN M.QT ELSE 0 END), 0) AS QT_VENDIDA_60D
FROM PCMOV M
WHERE M.CODPROD IN ({{codprods}})
  AND M.CODOPER = 'S'
  AND M.DTMOV >= TRUNC(SYSDATE) - {{dias}}
GROUP BY M.CODPROD
```

Porte de `sgc_bo_clientes_impactados` do p-45547 com **duas correções** (D-003): o
`INSTR(',' || '{{codprods}}' || ',', …)` do legado vira `IN ({{codprods}})` — sargável, o
mesmo fragmento que a 003 já monta e fatia em 500 códigos (`ORA-01795`) —, e a janela vira
parâmetro (`{{dias}}` = 60) em vez de literal. Sem filial no recorte, como no legado: o
cliente impactado é o cliente da empresa, não o da filial que comprou (D-004). `CODOPER =
'S'` com quantidade positiva descarta entrada e estorno (RN-002).

### Leituras — banco interno

| Nome | Id | Entrada | Saída | Atende |
|---|---|---|---|---|
| `sgcBoItensCard` | 7701 | `idCard` (0) | `ID, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, QT_PENDENTE, QT_PEDIDA, PRECO_CUSTO, VL_PENDENTE, OBSERVACAO, STATUS, CLIENTES_IMPACTADOS, QT_VENDIDA_60D, CRIADO_POR_NOME, CRIADO_EM, RESOLVIDO_POR_NOME, RESOLVIDO_EM` | RF-001, RF-012 |
| `sgcBoPrevisoesCard` | 7702 | `idCard` (0) | `ID, DT_PREVISAO, OBSERVACAO, REGISTRADO_POR_NOME, REGISTRADO_EM` | RF-006 |
| `sgcBoDocumentosCard` | 7703 | `idCard` (0) | `ID, TIPO, NOME_ARQUIVO, ENDERECO, ENVIADO_POR_NOME, ENVIADO_EM` | RF-011 |
| `sgcBoPainel` | 7704 | `busca` (`''`), `situacao` (`''`), `status` (`''`), `hoje` (`''`), `limite` (50), `offset` (0) | `ID, ID_CARD, TITULO, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, CODPROD, DESCRICAO, UNIDADE, QT_PENDENTE, VL_PENDENTE, CLIENTES_IMPACTADOS, QT_VENDIDA_60D, OBSERVACAO, STATUS, DT_PREVISAO_BO, SITUACAO_PREVISAO, CARTA_FALTA_ENDERECO, CRIADO_EM` | RF-015, RF-016, RF-017, RF-022 |
| `sgcBoPainelTotal` | 7705 | `busca`, `situacao`, `status`, `hoje` | `TOTAL` | RF-017 |

```sql
-- sgcBoItensCard (7701)
SELECT B.ID, B.CODPROD, B.DESCRICAO, I.EMBALAGEM, I.UNIDADE,
  B.QT_PENDENTE, COALESCE(I.QT_PEDIDA, 0) AS QT_PEDIDA, COALESCE(I.PRECO_CUSTO, 0) AS PRECO_CUSTO,
  (B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0))      AS VL_PENDENTE,
  COALESCE(B.OBSERVACAO, '')                        AS OBSERVACAO,
  B.STATUS, B.CLIENTES_IMPACTADOS, B.QT_VENDIDA_60D,
  COALESCE(UC.NOME, '') AS CRIADO_POR_NOME, COALESCE(B.CRIADO_EM, '')    AS CRIADO_EM,
  COALESCE(UR.NOME, '') AS RESOLVIDO_POR_NOME, COALESCE(B.RESOLVIDO_EM, '') AS RESOLVIDO_EM
FROM SGC_BO_ITEM B
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD
LEFT JOIN INT_USER UC ON UC.ID = B.CRIADO_POR
LEFT JOIN INT_USER UR ON UR.ID = B.RESOLVIDO_POR
WHERE B.ID_CARD = {{idCard}}
ORDER BY CASE B.STATUS WHEN 'aberto' THEN 0 ELSE 1 END, B.QT_PENDENTE DESC, B.DESCRICAO
```

O dia de referência do painel é uma constante do módulo, a mesma da 006 (G-6): `hoje`
desligado (`''`) **não** pode virar "tudo no prazo", então cai para o dia do servidor.

```js
const HOJE = `COALESCE(NULLIF('{{hoje}}', ''), DATE_FORMAT(CURDATE(), '%Y-%m-%d'))`;
```

```sql
-- sgcBoPainel (7704) — uma linha por PRODUTO em B.O. (RF-015)
SELECT B.ID, B.ID_CARD, C.TITULO,
  COALESCE(P.CODFORNEC, 0) AS CODFORNEC, COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
  COALESCE(P.CODFILIAL, '') AS CODFILIAL, COALESCE(P.FILIAL, '')    AS FILIAL,
  B.CODPROD, B.DESCRICAO, COALESCE(I.UNIDADE, '') AS UNIDADE,
  B.QT_PENDENTE, (B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0)) AS VL_PENDENTE,
  B.CLIENTES_IMPACTADOS, B.QT_VENDIDA_60D, COALESCE(B.OBSERVACAO, '') AS OBSERVACAO, B.STATUS,
  COALESCE(P.DT_PREVISAO_BO, '') AS DT_PREVISAO_BO,
  CASE
    WHEN COALESCE(P.DT_PREVISAO_BO, '') = ''   THEN 'sem_previsao'
    WHEN P.DT_PREVISAO_BO < ${HOJE}            THEN 'vencida'
    WHEN P.DT_PREVISAO_BO = ${HOJE}            THEN 'hoje'
    ELSE 'no_prazo' END                        AS SITUACAO_PREVISAO,
  COALESCE((SELECT D.ENDERECO FROM SGC_BO_DOCUMENTO D
            WHERE D.ID_CARD = B.ID_CARD AND D.TIPO = 'carta_falta'
            ORDER BY D.ENVIADO_EM DESC, D.ID DESC LIMIT 1), '') AS CARTA_FALTA_ENDERECO,
  COALESCE(B.CRIADO_EM, '') AS CRIADO_EM
FROM SGC_BO_ITEM B
JOIN KB_CARD C  ON C.ID = B.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_PEDIDO P      ON P.ID_CARD = B.ID_CARD
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD
WHERE ('{{status}}' = '' OR B.STATUS = '{{status}}')
  AND ('{{busca}}' = '' OR B.DESCRICAO LIKE CONCAT('%', '{{busca}}', '%')
       OR C.TITULO LIKE CONCAT('%', '{{busca}}', '%')
       OR COALESCE(P.FORNECEDOR, '') LIKE CONCAT('%', '{{busca}}', '%'))
  AND ('{{situacao}}' = '' OR '{{situacao}}' = CASE
        WHEN COALESCE(P.DT_PREVISAO_BO, '') = '' THEN 'sem_previsao'
        WHEN P.DT_PREVISAO_BO < ${HOJE}          THEN 'vencida'
        WHEN P.DT_PREVISAO_BO = ${HOJE}          THEN 'hoje'
        ELSE 'no_prazo' END)
ORDER BY CASE WHEN COALESCE(P.DT_PREVISAO_BO, '') = '' THEN 0 ELSE 1 END,
         P.DT_PREVISAO_BO, B.ID_CARD, B.DESCRICAO
LIMIT {{limite}} OFFSET {{offset}}
```

O painel **não filtra por fase**: um item continua na lista enquanto estiver `aberto`,
mesmo que o pedido tenha voltado a Faturamento — no legado, item aberto num card fora da
fase 16 sumia do painel e ficava `EM_BO` para sempre (D-006). `hoje` vem da tela
(`hojeIso()`, dia do navegador), pela mesma assimetria registrada em R-10 da 004: o cron
decide o dia no fuso de Brasília, a tela no fuso de quem está olhando; sem a tela, o
`HOJE` acima cai no dia do servidor.

`sgcBoPainelTotal` é o mesmo `FROM`/`WHERE` com `SELECT COUNT(*) AS TOTAL`, sem `ORDER BY`
nem `LIMIT`.

### JavaScript (orquestração)

| Nome | Id | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|---|
| `sgcBoCarregar` | 7707 | JAVASCRIPT | `cardId` (0) | `{ ok, itens[], previsoes[], documentos[], resumo: { abertos, liberados, previsao, situacao } }` | RNF-001 |
| `sgcBoMarcar` | 7708 | JAVASCRIPT | `cardId` (0), `itensJson` (JSON) | `{ ok, erro?, marcados, liberados, abertos }` | RF-001..RF-004, RF-012, RF-019, RF-020 |
| `sgcBoMonitorar` | 7709 | JAVASCRIPT, `cronExpression '0 5 11 * * *'` | nenhuma | `{ ok, hoje, tentados, avisados, resultados[], erros[] }` | RF-008, RF-009, RF-010 |

As três resolvem a persona por `runQueryMitra` com `:VAR_USER` usando **o mesmo mapa** da
guarda SQL da 002 (R-013) e chamam as escritas **por id**, passando `usuarioId` explícito:
`:VAR_USER` não se propaga em chamada aninhada.

**`sgcBoCarregar`** — a **única** chamada da aba (RNF-001). Três `runQueryMitra` com os
mesmos textos de `sgcBoItensCard`, `sgcBoPrevisoesCard` e `sgcBoDocumentosCard`
(constantes exportadas do módulo, com `{{idCard}}` trocado pelo id saneado), mais a linha
de capa (`DT_PREVISAO_BO`, fase). Consulta de leitura por `runQueryMitra` **não** conta
como execução de SF — é o mesmo desenho de `sgcPedidoCarregar` (002) e
`sgcFornecedorCarregar` (001). O `resumo.situacao` sai da mesma regra de RN-005, calculada
no dia de Brasília.

**`sgcBoMarcar`** — marca e libera, nos dois sentidos, numa SF só (D-002). Passos:

1. `persona()` — recusa fora de `admin`/`analista`/`gestor` e recusa `READ_ONLY`
   (`'Seu perfil não opera os produtos em B.O. deste pedido.'`).
2. `pedidoEmBo(cardId, usuarioId)` — o pedido existe, está na fase `faturamento` **ou**
   `bo`, e, se o acesso for `RESTRICTED`, foi criado por quem chama (A2 da onda 1). Fora
   disso: `'O pedido não está em Faturamento nem em Produtos em B.O., ou é de outra pessoa
   e o seu acesso é restrito aos próprios pedidos.'`
3. Lê `itensJson` (`[{ codprod, qtPendente, observacao, status }]`, `status` ausente =
   `aberto`) e separa em **marcar** (`aberto`) e **resolver** (`liberado`/`cancelado`).
   Valida cada marcação contra `SGC_PEDIDO_ITEM` do card (`STATUS <> 'removido'`):
   produto inexistente no pedido, `qtPendente <= 0` ou `qtPendente > QT_PEDIDA` recusam a
   chamada inteira citando a descrição do produto (RN-001), sem gravar nada.
4. Marcar: **uma** chamada a `sgcWintClientesImpactados` com todos os `codprod` de uma vez
   (`{{dias}}` = 60, fatiado em 500 — RNF-003) → monta as tuplas com a foto → **uma**
   `sgcEscBoItemInserir` por lote de 200 → **uma** `sgcEscItemStatusBo` com
   `status: 'bo'` e a lista de códigos.
5. Resolver: **uma** `sgcEscBoItemResolver` com a lista → **uma** `sgcEscItemStatusBo` com
   `status: 'enviado'` e a mesma lista.
6. Devolve a contagem de abertos relida do banco. Custo: ≤ 4 execuções aninhadas,
   qualquer que seja o número de itens (RNF-002).

**`sgcBoMonitorar`** — o cron das 11h05 UTC (08h05 de Brasília, logo depois do
`sgcFaturamentoMonitorar` das 11h00 da 005). Sem parâmetros, sem sessão.

1. `hoje` = dia em Brasília (`new Date(Date.now() - 180*60000).toISOString().slice(0,10)`,
   o mesmo `hojeNoFuso()` da 004) — nunca o dia UTC.
2. Uma consulta seleciona o lote (RNF-004, R-019):
   ```sql
   SELECT C.ID AS ID_CARD, C.TITULO, P.FORNECEDOR, P.FILIAL, P.DT_PREVISAO_BO,
     COALESCE((SELECT R.USUARIO_ID FROM KB_CARD_RESPONSAVEL R
                WHERE R.CARD_ID = C.ID ORDER BY R.ORDEM, R.ID LIMIT 1), C.CRIADO_POR) AS QUEM,
     (SELECT COUNT(*) FROM SGC_BO_ITEM B
       WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto') AS ABERTOS
   FROM KB_CARD C
   JOIN SGC_FASE F   ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID AND F.CHAVE = 'bo'
   JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
   WHERE C.EXCLUIDO_EM IS NULL
     AND COALESCE(P.DT_PREVISAO_BO, '') <> '' AND P.DT_PREVISAO_BO <= '<hoje>'
     AND COALESCE(P.ALERTA_BO_EM, '') <> '<hoje>'
   ORDER BY P.DT_PREVISAO_BO, C.ID
   LIMIT 30
   ```
3. Para cada card (nada interrompe o laço — erro vai para `erros[]`, RNF-004):
   1. `sgcEscAvisoInserir` (SF da 005, por id): `{ idCard, tipo: 'bo_previsao', chave:
      'bo_previsao:<idCard>:<hoje>', paraUsuarioId: 0, paraPersona: '', texto, criadoEm }`.
      `PARA_USUARIO_ID = 0` são os responsáveis do card (R-023). A `CHAVE` única é a única
      guarda dessa escrita — dois avisos no mesmo dia são o mesmo aviso.
   2. `kbNotaRegistrar` (SF da lib, por id, com `usuarioId: QUEM`) dentro de `try/catch`:
      nota que falha não desfaz o aviso (D-07 da onda 1).
   3. `sgcEscPedidoAlertaBo` por id: `{ idCard, alertaEm: hoje, usuarioId: QUEM }`.
4. Devolve `{ ok: true, hoje, tentados, avisados, resultados, erros }`.

Texto do aviso (RN-006), montado no JS:
`'Produtos em B.O. do pedido BENENUTRI MATRIZ · NESTLE: a previsão de liberação era
05/10/2026 (venceu há 2 dias) e 2 itens continuam em aberto. Reavalie com o fornecedor e
registre uma previsão nova.'` — com `vence hoje` no lugar de `venceu há N dias` quando a
previsão é do próprio dia, e `1 item` no singular.

Custo: 3 execuções por card avisado × 30 = 90 por rodada, uma vez ao dia. **Nenhuma
consulta ao WinThor** no cron.

### Escritas SQL (uma instrução por SF)

| Nome | Id | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|---|
| `sgcEscBoItemInserir` | 7750 | `{{usuarioId}}` (interna) | `linhas` (fragmento montado pelo JS), `usuarioId` | `INSERT INTO SGC_BO_ITEM (…) SELECT * FROM ({{linhas}}) LOTE WHERE <guardaInterna> ON DUPLICATE KEY UPDATE` de `DESCRICAO`, `QT_PENDENTE`, `OBSERVACAO`, `STATUS`, `CLIENTES_IMPACTADOS`, `QT_VENDIDA_60D`, `CRIADO_POR`, `CRIADO_EM` | RF-001, RF-003, C-016 |
| `sgcEscBoItemResolver` | 7751 | `{{usuarioId}}` (interna) | `idCard`, `codprods`, `status`, `usuarioId`, `resolvidoEm` | `UPDATE SGC_BO_ITEM SET STATUS='{{status}}', RESOLVIDO_POR={{usuarioId}}, RESOLVIDO_EM='{{resolvidoEm}}' WHERE ID_CARD={{idCard}} AND CODPROD IN ({{codprods}}) AND STATUS='aberto' AND <guardaInterna>` | RF-012 |
| `sgcEscItemStatusBo` | 7752 | `{{usuarioId}}` (interna) | `idCard`, `codprods`, `status`, `usuarioId`, `atualizadoEm` | `UPDATE SGC_PEDIDO_ITEM SET STATUS='{{status}}', ATUALIZADO_POR={{usuarioId}}, ATUALIZADO_EM='{{atualizadoEm}}' WHERE ID_CARD={{idCard}} AND CODPROD IN ({{codprods}}) AND STATUS <> 'removido' AND <guardaInterna>` | RF-001, RF-012, R-022 |
| `sgcEscBoPrevisaoInserir` | 7753 | `:VAR_USER` + `admin`/`analista`/`gestor` | `idCard`, `dtPrevisao`, `observacao`, `registradoEm` | `INSERT INTO SGC_BO_PREVISAO (…) SELECT {{idCard}}, '{{dtPrevisao}}', '{{observacao}}', :VAR_USER, '{{registradoEm}}' FROM DUAL WHERE <guarda>` | RF-006 |
| `sgcEscPedidoPrevisaoBo` | 7754 | `:VAR_USER` + `admin`/`analista`/`gestor` | `idCard`, `dtPrevisao` | `UPDATE SGC_PEDIDO SET DT_PREVISAO_BO='{{dtPrevisao}}', ALERTA_BO_EM='' WHERE ID_CARD={{idCard}} AND <guarda>` | RF-007 |
| `sgcEscBoDocumentoInserir` | 7755 | `:VAR_USER` + `admin`/`analista`/`gestor` | `idCard`, `tipo`, `nomeArquivo`, `endereco`, `enviadoEm` | `INSERT INTO SGC_BO_DOCUMENTO (…) SELECT {{idCard}}, '{{tipo}}', '{{nomeArquivo}}', '{{endereco}}', :VAR_USER, '{{enviadoEm}}' FROM DUAL WHERE <guarda>` | RF-011 |
| `sgcEscPedidoAlertaBo` | 7756 | `{{usuarioId}}` (interna) | `idCard`, `alertaEm`, `usuarioId` | `UPDATE SGC_PEDIDO SET ALERTA_BO_EM='{{alertaEm}}' WHERE ID_CARD={{idCard}} AND <guardaInterna>` | RF-008 |

`sgcEscPedidoPrevisaoBo` **sempre** zera `ALERTA_BO_EM`: registrar previsão é, por
definição, reiniciar a cobrança (RN-004, C-005) — não há parâmetro para isso não acontecer.

Todo `INSERT … SELECT … WHERE` leva `FROM DUAL` (achado A6 da onda 1; o `sim:check`
acusa). O lote de `sgcEscBoItemInserir` é `SELECT … UNION ALL SELECT …` dentro de uma
derivada, e não `VALUES (…), (…)`, porque é a única forma de pendurar o `WHERE` da guarda
numa execução só — o mesmo helper `lote()` do `add-006-itens.mjs`.

A guarda de persona é **a mesma** da 002 (R-013), copiada literalmente, trocando só a lista
de personas e o dono da sessão:

```sql
AND EXISTS (
  SELECT 1 FROM INT_USER IU
  LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
  WHERE IU.ID = <:VAR_USER | {{usuarioId}}>
    AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
    AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                               WHEN 'ADMIN' THEN 'admin'
                               WHEN 'RESTRICTED' THEN 'comercial'
                               ELSE 'analista' END) IN ('admin', 'analista', 'gestor')
)
```

As escritas internas (7750, 7751, 7752, 7756) levam a **mesma** guarda sobre
`{{usuarioId}}` — o perfil business libera todas as SFs, e "só o JS confere" não protege
quem chama por fora da tela (achado A1).

### Fragmentos de `sgcPodeMover` (R-030)

Dois arquivos em `backend/sql/`, no mesmo padrão de `pendencias-analise.sql`: colunas
escalares sobre `C.ID`, coladas pelo integrador dentro de `contextoDoCard()` do
`add-005-quadro-compras.mjs`, mais os ramos do `CASE` de `sqlPodeMover`.

**`backend/sql/pendencias-bo-entrada.sql`** — `faturamento>bo` exige ≥ 1 item em B.O.
aberto (RF-005, RN-003):

```sql
-- coluna PENDENCIAS_BO_ENTRADA (1 = não há item marcado; 0 = pode entrar)
COALESCE((
  SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
  FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto'
), 1) AS PENDENCIAS_BO_ENTRADA
```

Ramos (integrador, em `sqlPodeMover`):

```sql
WHEN T.PAR = 'faturamento>bo' AND T.PENDENCIAS_BO_ENTRADA > 0 THEN 0   -- PODE
WHEN T.PAR = 'faturamento>bo'                                 THEN '${M.boEntrada}'  -- MOTIVO
```

**`backend/sql/pendencias-conclusao-bo.sql`** — `faturamento>concluido` e `bo>concluido`
exigem zero item aberto (RF-013, RN-008):

```sql
-- coluna PENDENCIAS_BO_ABERTOS (contagem de itens em aberto)
COALESCE((
  SELECT COUNT(*) FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto'
), 0) AS PENDENCIAS_BO_ABERTOS

-- coluna PENDENCIAS_BO_MOTIVO (a frase, com a contagem e o plural certo)
COALESCE((
  SELECT CASE
           WHEN COUNT(*) = 0 THEN ''
           WHEN COUNT(*) = 1 THEN 'Resolva o 1 item em B.O. antes de concluir o pedido.'
           ELSE CONCAT('Resolva os ', COUNT(*), ' itens em B.O. antes de concluir o pedido.')
         END
  FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto'
), '') AS PENDENCIAS_BO_MOTIVO
```

Ramos:

```sql
-- PODE
WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0 THEN 0
-- MOTIVO (a condição vai junto — R-044)
WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0 THEN T.PENDENCIAS_BO_MOTIVO
```

O ramo de `MOTIVO` **leva a própria condição** (R-044) e é encadeado **depois** do da NF
(`… AND T.PENDENCIAS_NF > 0 THEN T.PENDENCIAS_NF_MOTIVO`): assim um pedido com conferência
de NF pendente recebe a frase da NF, um pedido só com item de B.O. aberto recebe a minha, e
`PODE = 0` nunca sai com motivo vazio (R-020). Sem a condição no ramo, o `IN (…)` casaria
também quando a pendência fosse só da NF e devolveria `''`.

O `WHEN COUNT(*) = 0 THEN ''` da coluna é a mesma proteção pelo outro lado: a frase nunca
vira "Resolva os 0 itens". `bo>faturamento` e `bo>cancelado` não ganham ramo nenhum
(RF-014, RN-012). Cancelar nunca passa por aqui.

Texto novo em `M` (`add-005`) e em `MOTIVOS` (`transicoes.ts`), **o mesmo caractere a
caractere** (o teste de 500 combinações da 002 compara):

```
boEntrada: 'Marque ao menos um item em B.O. antes de mover o pedido para Produtos em B.O.'
```

A frase da **conclusão** é dinâmica (tem a contagem) e por isso vive **só** na coluna
`PENDENCIAS_BO_MOTIVO`, como o `PENDENCIAS_MOTIVO` da 003 — `MOTIVOS` é um
`Record<string, string>` e não comporta contagem. Ela não tem espelho de tela e é testada
no smoke, lendo o `MOTIVO` do próprio `sgcPodeMover` com 1 e com 3 itens abertos (RN-008).

**R-046 — os blocos de mover da onda 2 ficam só no servidor.** `faturamento>bo`,
`faturamento>concluido` e `bo>concluido` são recusados pelo gancho, e a lib mostra a frase
na faixa de aviso ao clicar. Esta spec **não** entrega `antesDeMover` nem `podeMover`
novos: em `motivoDeDestino` os três pares continuam livres (é o que mantém o teste de 500
combinações válido) e o `transicoes.ts` recebe só o texto em `MOTIVOS`. Quem evita o clique
recusado é a própria aba, que oferece a ação certa **antes** do movimento ("Marcar em
B.O." e "Liberar").

### Bloco 77xx de `frontend/src/lib/server-functions.ts`

| Id local | Nome | Id local | Nome |
|---|---|---|---|
| 7701 | `sgcBoItensCard` | 7750 | `sgcEscBoItemInserir` |
| 7702 | `sgcBoPrevisoesCard` | 7751 | `sgcEscBoItemResolver` |
| 7703 | `sgcBoDocumentosCard` | 7752 | `sgcEscItemStatusBo` |
| 7704 | `sgcBoPainel` | 7753 | `sgcEscBoPrevisaoInserir` |
| 7705 | `sgcBoPainelTotal` | 7754 | `sgcEscPedidoPrevisaoBo` |
| 7706 | `sgcWintClientesImpactados` | 7755 | `sgcEscBoDocumentoInserir` |
| 7707 | `sgcBoCarregar` | 7756 | `sgcEscPedidoAlertaBo` |
| 7708 | `sgcBoMarcar` | | |
| 7709 | `sgcBoMonitorar` | | |

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/quadro`, card aberto, aba **B.O.** | itens em B.O., previsões, carta de falta | `Panel`, `PanelHeader`, `Toolbar`, `Table`/`Th`/`Td` (`numeric`), `RowTitle`, `RowMeta`, `Code`, `Dash`, `Status`, `Badge`, `IconButton`, `Button`, `Alert`, `EmptyState`, `Dialog`, `LabelledField`, `Input`, `Textarea`, `SelectMenu`, `DatePicker` | `AbaBo`, `MarcarItensDialogo`, `PrevisaoDialogo`, `DocumentoBoDialogo` |
| `/bo` | painel consolidado dos produtos em B.O. | `PageHeader`, `Panel`, `Toolbar`, `SearchInput`, `FilterChip`, `SelectMenu`, `Table`, `Status`, `Code`, `Dash`, `TextLink`, `Pagination`, `EmptyState` | `BoPainelPage` |

Arquivos:

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/lib/bo.ts` | regra pura: `situacaoDaPrevisao`, `rotuloSituacaoPrevisao`, `validarMarcacaoBo`, `textoAvisoBo`, `resumoBo`, e o reexport de `MOTIVOS.boEntrada` (G-8) |
| `frontend/src/pages/quadros/abas/Bo.tsx` | `AbaBo(ctx: ExtensaoContexto)` — os três blocos, uma chamada de `sgcBoCarregar` |
| `frontend/src/pages/quadros/abas/bo-dialogos.tsx` | `MarcarItensDialogo`, `PrevisaoDialogo`, `DocumentoBoDialogo` (o `max-lines` 800 não cabe tudo num arquivo) |
| `frontend/src/pages/bo/BoPainelPage.tsx` | o painel `/bo` |
| `frontend/src/lib/server-functions.ts` | bloco 77xx (nomes e ids locais) |

Desenho (design.md §8, §9.1, §9.2, §9.4, §9.5):

- **Tabela de itens e painel**: `Code` para o `CODPROD`, `RowTitle` para a descrição,
  `RowMeta` para embalagem/unidade (na aba) e para pedido + filial (no painel); quantidade
  pendente, clientes impactados, quantidade vendida e valor pendente com `numeric`; sem
  zebra, linhas `py-3`, sem selo preenchido dentro da célula. Coluna sem dado é `Dash()`,
  nunca `0`.
- **Situação da previsão** como `Status` com ponto **e** texto — estado nunca só por cor:
  `sem_previsao` → `tone="alert"` "Sem previsão"; `vencida` → `tone="alert"` "Vencida há N
  dias"; `hoje` → `tone="attention"` "Vence hoje"; `no_prazo` → `tone="live"` "No prazo".
  Situação do item: `aberto` → `tone="attention"`; `liberado` → `tone="live"`.
- **Carta de falta** no painel é `TextLink`/link para o endereço, com o nome do arquivo no
  `title`; sem carta, `Dash()`.
- **Diálogos** (`max-h-[90vh]`, só o miolo rola, rodapé `flex-col-reverse` no mobile):
  "Marcar itens em B.O." lista os itens do pedido com caixa de seleção, quantidade pendente
  e observação; "Registrar previsão" usa o `DatePicker` do projeto (UI-03 B, **nunca**
  `<input type="date">`) e um `Textarea`; "Anexar documento" repete o padrão da 001, com o
  `Alert tone="info"` de endereço público **antes** da escolha do arquivo.
- **Sem toast** (UI-02 A): confirmação é "Salvo às HH:MM" na faixa do painel e `Alert` no
  fluxo para erro; a recusa do movimento aparece na faixa de aviso do card (a lib desenha).
- **Permissão** (§9.4, anti-padrão "botão escondido por falta de permissão"): sem
  `operarBo`, os controles ficam **desabilitados com o motivo no `title`**, nunca
  escondidos (C-014). A aba é renderizada para todas as personas que veem o quadro — o
  comercial não chega lá porque não vê o quadro (P-03).
- **Cor**: só token; a situação nunca é o único sinal.
- **Sem exportação CSV**: `/bo` não exporta (as telas do 000 pedem CSV só em
  `/faturamentos-pendentes` e `/nfs-em-atraso`). Se um dia entrar, é
  `frontend/src/lib/csv.ts` da base (`textoCsv`, `baixarCsv`) — não se reimplementa.
- **Sem dias úteis**: a previsão de B.O. é uma data-promessa comparada em dias corridos
  (RN-005), então esta spec **não** usa os helpers de R-025 (`backend/lib/dias-uteis.mjs`,
  `frontend/src/lib/dias-uteis.ts`); se algum dia precisar, importa de lá.

### Chaves de `lib/permissoes.ts` (R-028, arquivo da base)

| Chave | admin | analista | gestor | diretoria | comercial | `READ_ONLY` |
|---|---|---|---|---|---|---|
| `verBo` | ✓ | ✓ | ✓ | ✓ | ✓ | mantém (não passa por `operar()`, como `verSeguranca`/`verCoberturas` — D-12 da onda 1) |
| `operarBo` | ✓ | ✓ | ✓ | — | — | zera |

Item de menu novo: `{ grupo: 'Compras', to: '/bo', label: 'Produtos em B.O.', exige: 'verBo' }`.
Como `verBo` é verdadeiro para todas as personas, `menuParaPersona` passa a devolver
**exatamente um** item para o comercial (C-013) — hoje devolve zero.

## Fluxo

1. A compradora abre o pedido em Faturamento no `/quadro` (2 execuções: `kbCardDetalhe` da
   lib + `sgcPedidoCarregar` da 002) e clica na aba **B.O.**: **uma** execução
   (`sgcBoCarregar`), independente do número de itens (RNF-001).
2. "Marcar itens em B.O." abre o diálogo com os itens do pedido — lidos do
   `PedidoProvider` da 003, que já os tem em memória; nenhuma SF extra. Ela escolhe os
   produtos, digita a quantidade pendente e a observação, e confirma.
3. A tela chama `sgcBoMarcar` **uma** vez. Dentro dele: persona → fase → validação →
   `sgcWintClientesImpactados` (1) → `sgcEscBoItemInserir` (1 por lote de 200) →
   `sgcEscItemStatusBo` `'bo'` (1). Devolve `abertos`.
4. Com `abertos > 0` — e **só** com `abertos > 0`, que é como a aba oferece a ação certa
   antes do movimento em vez de deixar o gancho recusar (R-046) — a aba oferece
   "Mover para Produtos em B.O.", que é `ctx.mover(faseId)`
   da lib — quem move é a pessoa, pela tela (R-021 não se aplica aqui). O motor consulta
   `sgcPodeMover`, que com o bloco de `pendencias-bo-entrada.sql` já libera o par.
5. "Registrar previsão" grava por `sgcEscBoPrevisaoInserir` e `sgcEscPedidoPrevisaoBo`
   (2 execuções, ação rara); a segunda zera `ALERTA_BO_EM` e reinicia a cobrança (C-005).
6. "Anexar carta de falta": `uploadFilePublicMitra({ file })` devolve `publicUrl` (o arquivo
   **não** passa por Server Function) e `sgcEscBoDocumentoInserir` grava nome, tipo e
   endereço — o mesmo desenho do documento do fornecedor (001, R-034).
7. Todo dia às 11h05 UTC o `sgcBoMonitorar` varre os pedidos em `bo` com previsão atingida
   e ainda não avisados hoje, e para cada um grava o aviso (`sgcEscAvisoInserir` da 005),
   a nota no histórico e a marca do dia. O feed `/notificacoes` mostra o aviso pelo ramo
   `SGC_AVISO` da `notificacoesUniao()` (005 + integrador).
8. Quando o item chega, "Liberar" chama `sgcBoMarcar` com `status: 'liberado'`: o registro
   de B.O. fecha e o item do pedido volta a `enviado`. Com zero aberto, o
   `sgcPodeMover` libera Concluídas — a trava é só do servidor (R-046); com item aberto, o clique em "Mover para → Compras Concluídas" volta com a frase na faixa de aviso do card.
9. Em paralelo, qualquer pessoa — inclusive o comercial — abre `/bo` e vê a lista
   consolidada, paginada, com quem está sem previsão no topo.

### Regra pura — `frontend/src/lib/bo.ts`

```ts
export type SituacaoPrevisao = 'sem_previsao' | 'vencida' | 'hoje' | 'no_prazo';
export type StatusBoItem = 'aberto' | 'liberado' | 'cancelado';

export function situacaoDaPrevisao(dtPrevisao: string, hoje: string): SituacaoPrevisao;
// '' → 'sem_previsao'; < hoje → 'vencida'; = hoje → 'hoje'; > hoje → 'no_prazo'.
// Comparação de texto AAAA-MM-DD, sem fuso — a mesma do SQL (RN-005).

export function rotuloSituacaoPrevisao(situacao: SituacaoPrevisao, dias: number): string;
// 'Sem previsão' | 'Vencida há 2 dias' | 'Vence hoje' | 'No prazo'.

// G-8 — o texto da entrada em B.O. tem UM dono, o `MOTIVOS` de transicoes.ts (que é o que
// entra no teste de 500 combinações). Aqui só se reexporta, para a aba e o teste o lerem
// de um lugar só, sem uma segunda cópia da frase no projeto.
export { MOTIVOS } from './transicoes';
export const MOTIVO_ENTRADA_BO = MOTIVOS.boEntrada;

// Não existe `motivoConclusaoBo`: a frase da conclusão tem contagem, `MOTIVOS` não a
// comporta, e R-046 tirou o espelho de tela dos pares da onda 2 — ela vive só na coluna
// `PENDENCIAS_BO_MOTIVO` e é testada no smoke.

export function validarMarcacaoBo(
  marcacoes: { codprod: number; qtPendente: number; observacao?: string }[],
  itensDoPedido: { CODPROD: number; DESCRICAO: string; QT_PEDIDA: number; STATUS: string }[],
): string | null;
// null = válido; senão a mensagem citando a descrição do produto (RN-001).
// Mesmo texto que o sgcBoMarcar devolve: uma regra, dois lugares.

export function textoAvisoBo(e: { titulo: string; dtPrevisao: string; hoje: string; abertos: number }): string;
// RN-006 — o texto do aviso diário, testado no frontend e usado literalmente no cron.

export function resumoBo(itens: { STATUS: string }[]): { abertos: number; liberados: number };
```

`textoAvisoBo` mora aqui e é **copiada literalmente** para dentro do corpo JS do cron (uma
SF da plataforma não importa módulo do frontend) — o teste puro é o que garante que as duas
digam a mesma coisa, o mesmo arranjo de `transicoes.ts` × `sqlPodeMover`.

## Simulador

### Tabelas

Nenhuma tabela nasce nesta spec. As `SGC_BO_*` e as colunas de `SGC_PEDIDO` vêm do
`setup-backend.mjs` (base S2); as `PC*` vêm do `schema-winthor.mjs` (integrador). Esta
spec **não precisa de coluna nova em `PC*`**: `PCMOV` já tem `CODPROD`, `CODFILIAL`,
`CODCLI`, `CODOPER`, `DTMOV` e `QT` (as adições de R-027 são da 005 e da 006).

### Seed — `backend/simulator/seed/007-bo.mjs`

Só **INSERT**. Fornecedores (1015, 1042 ativos, 1088 inativo) e filiais (1, 2, 3) são do
`seed/001-fornecedores.mjs`; `SGC_USUARIO_PERSONA` é do `seed/002-quadro.mjs`; o catálogo
e as vendas de 2026-08-15 são do `seed/003-itens.mjs` (R-017). Esta spec insere:

- **2 produtos próprios do fornecedor 1042** (`PCPRODUT` + `PCEST` filial 1), `CODPROD`
  **5201** `COMPOSTO LACTEO SEM LACTOSE 400 G` e **5202** `CEREAL INFANTIL MULTICEREAIS
  230 G`, departamento 3, seção 31 — **não** do 1015, para não mexer nas 18 linhas que o
  C-001 da 003 espera de `sgcWintAnaliseMontagem`, e sem "CREME" na descrição, para não
  mexer na busca do C-009 da 003 (B-05 desta spec).
- **5 clientes próprios** (`PCCLIENT` 9101–9105), fora da faixa 9001–9003 da 003.
- **Vendas com data relativa a hoje** (`CODOPER = 'S'`, filial 1, R-027), com
  `NUMTRANSITEM` a partir de **900001** para não colidir com a numeração da 003 — as datas
  fixas da 003 (2026-08-15) ficam intocadas, e os números abaixo não dependem de quando o
  teste roda. Esta spec **não** semeia nota fiscal: `PCNFENT` e `PCLANC` são da 005 e da
  006.

  | Produto | Linhas | Clientes | Total |
  |---|---|---|---|
  | 5201 | hoje−5 (9101, 10), hoje−12 (9101, 10), hoje−20 (9101, 10), hoje−8 (9102, 10), hoje−15 (9102, 10), hoje−25 (9103, 10), hoje−30 (9104, 10) | **4 distintos** | **70** |
  | 5201 (controle) | hoje−61 (9105, 10) e uma **entrada** `CODOPER = 'E'` em hoje−3 (9101, 500) | não contam | não contam |
  | 5202 | hoje−6 (9101, 5), hoje−18 (9102, 5) | **2 distintos** | **10** |

- **4 cards** no quadro `compras`, fornecedor **1042 NESTLE** / filial **1 Benenutri
  Matriz**, criados por `ana` e com `ana` como responsável, cada um com 4 itens em
  `SGC_PEDIDO_ITEM` (`5201` 100 un, `5202` 60 un, `5101` 40 un, `5102` 40 un, `STATUS =
  'enviado'`, `PRECO_CUSTO` 19,00 / 8,00 / 19,00 / 8,00):

  | Chave em `CARDS_007` | Fase | B.O. | Serve a |
  |---|---|---|---|
  | `faturamento` | `faturamento` | nenhum | C-001, C-002, C-003, C-008 (entrada), C-011, C-016 |
  | `bo` | `bo` | 5201 (40 pendentes, 4 clientes, 70 un) e 5202 (15 pendentes, 2 clientes, 10 un), os dois `aberto`; `SGC_PEDIDO_ITEM` dos dois em `bo`; `DT_PREVISAO_BO` = hoje−2, `ALERTA_BO_EM` = `''`; 1 previsão em `SGC_BO_PREVISAO` (hoje−2); 1 documento `carta_falta` | C-004..C-010, C-012, RN-012 |
  | `boLimpo` | `bo` | 5201 `liberado`; zero aberto; `DT_PREVISAO_BO` = hoje+10 | C-008 (libera), C-009, C-011, C-012 |
  | `boSemPrevisao` | `bo` | 5101 `aberto` (1 cliente, 8 un); `DT_PREVISAO_BO` = `''` | C-011, C-012 (ordenação) |

  Os quatro pedidos nascem com **`DT_ENVIO` vazio** e sem nenhuma linha de `SGC_NF`: o
  smoke roda todas as suítes num banco só (R-045), e pedido com data de envio e sem
  faturamento entraria na listagem de `/faturamentos-pendentes` da 005, mexendo nos totais
  dela. Nada em 007 lê `DT_ENVIO`.

  O card em `analise` do C-017 é o do `seed/002-quadro.mjs` — esta spec não cria mais um.
  `CENARIO.usuarios = { admin: 1, ana: 2, gil: 3, dora: 4, leo: 5 }` vem do seed da 002.
  Os ids dos 4 cards são exportados em `CARDS_007`, como a 003 faz em `CARDS_003`, para o
  smoke não depender da ordem de inserção.

Com isso os cards desta spec têm **3 itens em aberto** (2 do card `bo` + 1 do
`boSemPrevisao`) e **4 no total** (com o `liberado` do `boLimpo`). São os números de
C-012, mas sempre **recortados por `CARDS_007`** no teste: `sgcBoPainel` é uma listagem
global e a 005 semeia itens de B.O. no card `emBo` dela no mesmo banco (R-045).

### `CHECK_INPUT`

Acrescentar em `backend/simulator/config.mjs` (arquivo do integrador), seção 007:
`dias: '60'`, `status: ''`. Já existem, das specs anteriores: `codprods` (`'5001,5002'`),
`busca`, `situacao`, `hoje`, `limite`, `offset`, `idCard`, `cardId`. As escritas e as
JAVASCRIPT o `sim:check` pula, então nenhum fragmento de `{{linhas}}` ou `{{codprods}}` de
lote precisa entrar aqui.

### Dialeto

Nada novo. `NVL`, `TRUNC`, `SYSDATE`, `SYSDATE - N`, `CONCAT`, `COALESCE`, `CASE`,
`LIMIT/OFFSET` e `ON DUPLICATE KEY UPDATE` já têm tratamento em `mysql-dialect.mjs`.
`COUNT(DISTINCT …)` é SQL padrão nos dois lados.

### Como o smoke chama o cron

`execute(definicao, {}, 0)` — `userId = 0` é a ausência de sessão, o que o `kbNotaRegistrar`
exige para aceitar `usuarioId` (mesmo arranjo do cron da 004).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `smoke/007-bo.mjs` | `sgcBoMarcar` no card `faturamento` como `gil`, com 5201 (40) e 5202 (15), devolve `{ ok: true, marcados: 2, abertos: 2 }`; `sgcBoItensCard` traz 2 linhas `aberto` com `QT_PENDENTE` 40 e 15 e `CLIENTES_IMPACTADOS` 4 e 2; `SGC_PEDIDO_ITEM` do card tem 2 em `bo` e 2 em `enviado` |
| C-002 · RN-002 | `smoke/007-bo.mjs` | `sgcWintClientesImpactados({ codprods: '5201,5202', dias: 60 })` devolve **2** linhas (> 0): 5201 → `CLIENTES_IMPACTADOS` 4 e `QT_VENDIDA_60D` 70; 5202 → 2 e 10 (a venda de hoje−61 e a entrada de hoje−3 ficam de fora) |
| C-003 | `smoke/007-bo.mjs` | `sgcPodeMover` do card `faturamento` para a fase `bo`, antes do C-001, devolve `PODE = 0` e `MOTIVO` igual a `MOTIVOS.boEntrada` (importado de `transicoes.ts`, o dono da frase — G-8); depois do C-001, `PODE = 1` e `MOTIVO` `''` |
| C-004 · RN-004 | `smoke/007-bo.mjs` | `sgcEscBoPrevisaoInserir` + `sgcEscPedidoPrevisaoBo` como `ana` com `2026-10-05`: `sgcBoPrevisoesCard` devolve 2 linhas (a do seed e a nova, com `REGISTRADO_POR_NOME`) e `SGC_PEDIDO.DT_PREVISAO_BO` = `'2026-10-05'` |
| C-005 | `smoke/007-bo.mjs` | com `ALERTA_BO_EM` = hoje, `sgcEscPedidoPrevisaoBo` com hoje+7 deixa `ALERTA_BO_EM` = `''` e `DT_PREVISAO_BO` = hoje+7; o `sgcBoMonitorar` seguinte não inclui esse card em `resultados` |
| C-006 · RN-011 | `smoke/007-bo.mjs` | `sgcEscBoDocumentoInserir` com `tipo: 'carta_falta'` → `sgcBoDocumentosCard` devolve 2 linhas (a do seed e a nova) com `NOME_ARQUIVO`, `ENDERECO`, `ENVIADO_POR_NOME` e `ENVIADO_EM`; com `tipo: 'planilha'` a linha é gravada como `'outro'` |
| C-007 · RN-007 | `smoke/007-bo.mjs` | `sgcBoMarcar` com `[{ codprod: 5201, status: 'liberado' }]` no card `bo` devolve `abertos: 1`; `SGC_BO_ITEM` do 5201 fica `liberado` com `RESOLVIDO_POR` = `gil` e `RESOLVIDO_EM` preenchido; `SGC_PEDIDO_ITEM` do 5201 volta a `enviado` e o do 5202 continua `bo` |
| C-008 | `smoke/007-bo.mjs` | com 2 abertos e **zero ocorrência de NF pendente** nos cards desta spec (o ramo da NF vem antes no `CASE`, R-044), `sgcPodeMover` do card `bo` para `concluido` devolve `PODE = 0` e `MOTIVO` = `'Resolva os 2 itens em B.O. antes de concluir o pedido.'` — nunca `''`; o mesmo para `faturamento>concluido` no card `faturamento` depois do C-001; no card `boLimpo`, `bo>concluido` devolve `PODE = 1` e `MOTIVO` `''` |
| C-009 | `smoke/007-bo.mjs` | com 2 abertos, `sgcPodeMover` do card `bo` para `faturamento` devolve `PODE = 1` e `MOTIVO` `''` |
| C-010 · RN-006 | `smoke/007-bo.mjs` | `sgcBoMonitorar` com `userId = 0` devolve `{ avisados: 1 }` (o card `bo`); `SGC_AVISO` ganha 1 linha `TIPO = 'bo_previsao'`, `CHAVE = 'bo_previsao:<idCard>:<hoje>'`, `PARA_USUARIO_ID = 0`, `PARA_PERSONA = ''`, com a data da previsão e `'2 itens'` no `TEXTO`; `SGC_PEDIDO.ALERTA_BO_EM` = hoje; `KB_LOG` do card ganha 1 nota; a segunda chamada devolve `avisados: 0` e `SELECT COUNT(*) FROM SGC_AVISO` continua 1 |
| C-011 · RF-010 | `smoke/007-bo.mjs` | na mesma rodada do C-010, `resultados` não traz `boLimpo` (previsão hoje+10), nem `boSemPrevisao` (`DT_PREVISAO_BO` `''`), nem `faturamento` (fase); `SGC_AVISO` deles tem contagem 0 |
| C-012 · RN-010 | `smoke/007-bo.mjs` | R-045 — nenhum total literal: `sgcBoPainel({ status: 'aberto', hoje, limite: 200 })` e, **filtrando no teste por `ID_CARD IN CARDS_007`**, devolve 3 linhas; entre elas a do 5101 do `boSemPrevisao` (`SITUACAO_PREVISAO: 'sem_previsao'`) vem **antes** das duas do card `bo` (ordenação de RN-010); `situacao: 'vencida'` recortado pelos mesmos cards devolve 2; `status: ''` devolve 4; `sgcBoPainelTotal({ status: 'aberto', hoje })` bate com `SELECT COUNT(*) FROM SGC_BO_ITEM WHERE STATUS = 'aberto'` lido no próprio teste; a linha do card `bo` traz `CARTA_FALTA_ENDERECO` não vazia e `VL_PENDENTE` = 40 × 19,00 |
| C-013 | `smoke/007-bo.mjs` + `tests/bo.test.mjs` | `sgcBoPainel` com `userId = leo` devolve **as mesmas linhas** que com `userId = gil` (comparação entre as duas chamadas, sem total literal — R-045); `menuParaPersona(permissoesDe('comercial', 'MEMBER'))` devolve exatamente 1 item, com `to: '/bo'` |
| C-014 · RN-009 (tela) | `tests/bo.test.mjs` | `permissoesDe('diretoria','MEMBER')` → `{ verBo: true, operarBo: false }`; `permissoesDe('gestor','MEMBER')` → os dois `true`; `permissoesDe('gestor','READ_ONLY')` → `verBo: true`, `operarBo: false`; `permissoesDe('comercial','MEMBER')` → `verBo: true`, `operarBo: false` |
| C-015 · RN-009 (servidor) | `smoke/007-bo.mjs` | `sgcBoMarcar` como `leo` e como `dora` devolve `ok: false` citando o perfil e `SGC_BO_ITEM` do card não cresce; como `gil` grava; um usuário `READ_ONLY` também é recusado; um `RESTRICTED` que não criou o card é recusado com a frase de acesso restrito |
| C-016 | `smoke/007-bo.mjs` | remarcar 5201 com `qtPendente: 25` deixa `SELECT COUNT(*) FROM SGC_BO_ITEM WHERE ID_CARD = … AND CODPROD = 5201` em **1** e `QT_PENDENTE` em 25 |
| C-017 · RF-004 | `smoke/007-bo.mjs` | `sgcBoMarcar` no card em `analise` do seed da 002 devolve `ok: false` citando a fase; `SGC_BO_ITEM` daquele card continua em 0 |
| RN-001 | `tests/bo.test.mjs` | `validarMarcacaoBo` com `qtPendente: 0` → mensagem citando a descrição; com 120 sobre um item de 100 → mensagem; com 40 → `null`; com `codprod` fora do pedido → mensagem |
| RN-003 | `smoke/007-bo.mjs` | coberto por C-003; e `sgcPodeMover` de `enviado` para `bo` devolve `PODE = 0` com `MOTIVOS.semTransicao` (o par não existe em `PARES`) |
| RN-005 | `tests/bo.test.mjs` | `situacaoDaPrevisao('', '2026-09-15')` → `'sem_previsao'`; `('2026-09-14', …)` → `'vencida'`; `('2026-09-15', …)` → `'hoje'`; `('2026-09-16', …)` → `'no_prazo'` |
| RN-006 (texto) | `tests/bo.test.mjs` | `textoAvisoBo({ titulo: 'BENENUTRI MATRIZ · NESTLE', dtPrevisao: '2026-10-05', hoje: '2026-10-07', abertos: 2 })` contém `'05/10/2026'`, `'venceu há 2 dias'` e `'2 itens'`; com `abertos: 1` diz `'1 item'`; com `dtPrevisao` = `hoje` diz `'vence hoje'` |
| RN-008 | `smoke/007-bo.mjs` | o `MOTIVO` de `sgcPodeMover` para `bo>concluido` é `'Resolva os 2 itens em B.O. antes de concluir o pedido.'` no card `bo`; liberando um deles, vira `'Resolva o 1 item em B.O. antes de concluir o pedido.'` (singular); marcando um terceiro, `'Resolva os 3 itens…'`. Sem espelho de tela (R-046) |
| RN-012 | `smoke/007-bo.mjs` | `sgcPodeMover` do card `bo` (2 abertos, sem motivo de cancelamento gravado) para `cancelado` devolve `PODE = 0` com `MOTIVOS.cancelar`; com `CANC_MOTIVO` preenchido, `PODE = 1` — nenhuma exigência de B.O. entra no caminho |

- **Backend:** `backend/simulator/smoke/007-bo.mjs`, um `teste()` por linha, título
  começando pelo id. A consulta ao WinThor assere **contagem > 0** (vazio não é verde).
- **Frontend:** `frontend/tests/bo.test.mjs` com `node --test` sobre `src/lib/bo.ts` e
  `src/lib/permissoes.ts`.
- **Seed extra para o smoke:** nenhum além do `seed/007-bo.mjs`; os 4 cards já nascem lá.

## Dependências entre specs

**Consome da 002 (quadro):**

- `SGC_PEDIDO` — lê `ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`; **escreve**
  `DT_PREVISAO_BO` e `ALERTA_BO_EM` (colunas desta spec, R-026).
- `SGC_FASE` — as chaves `faturamento` e `bo`; nenhuma regra usa id nem nome de fase.
- `sgcPodeMover` — recebe os dois blocos de R-030 (`PENDENCIAS_BO_ENTRADA`,
  `PENDENCIAS_BO_ABERTOS`, `PENDENCIAS_BO_MOTIVO`) e três ramos no `CASE`; e o texto
  `boEntrada` em `M`. O integrador cola; o teste de 500 combinações da 002 continua valendo
  porque os três pares seguem livres em `motivoDeDestino`.
- `PERSONA_EFETIVA`/`guardaPersonaDe` — copiados literalmente (R-013).
- A página `/quadro` liga a aba em `abasExtras`, **sem `contagem`** (R-049:
  `AbaExtra.contagem` é síncrona e lê só `card.valores`, e não há campo do quadro para
  "itens de B.O. abertos"). Nenhum `antesDeMover` nem `podeMover` novo (R-046).

**Consome da 003 (itens):** `SGC_PEDIDO_ITEM` (`CODPROD`, `DESCRICAO`, `EMBALAGEM`,
`UNIDADE`, `QT_PEDIDA`, `PRECO_CUSTO`, `STATUS`) e o valor novo `bo` na coluna `STATUS`;
o `PedidoProvider`/`usePedido()` do card aberto, que alimenta o diálogo "Marcar itens" sem
SF extra; o preâmbulo JS de `add-006-itens.mjs` (`chamar`, `lote`, `texto`, `inteiro`,
`persona`), copiado para o `add-010` como o `add-006` copiou o do `add-005`.

**Consome da 001 (fornecedores):** o transporte de arquivo (`uploadFilePublicMitra` →
`publicUrl`, `/uploads` do simulador) e o padrão do `DocumentoDialogo.tsx` (R-034).

**Consome da 005 (notas fiscais e faturamento):**

- `SGC_AVISO` e **`sgcEscAvisoInserir`**, chamada por id pelo `sgcBoMonitorar` com
  `{ idCard, tipo, chave, paraUsuarioId, paraPersona, texto, criadoEm }` — **este é o
  contrato de que preciso**: `TIPO = 'bo_previsao'`, `CHAVE` única (`tipo:card:AAAA-MM-DD`),
  `PARA_USUARIO_ID = 0` para "responsáveis do card", `PARA_PERSONA = ''`. Se os nomes de
  parâmetro mudarem, o `add-010` não compila no sandbox — ele resolve por nome no
  `listServerFunctionsMitra` e falha alto.
- `backend/sql/notificacoes-avisos.sql` (R-023) — o ramo de `SGC_AVISO` na
  `notificacoesUniao()`; nada desta spec escreve na `notificacoesUniao`.
- **R-041** (decidido a partir de achado desta spec na leitura do legado, seção 5 do
  `add-bo-fase-produtos.mjs`): o cron `sgcFaturamentoMonitorar` da 005 **não alerta pedido
  na fase `bo`** — esse pedido já tem a cobrança diária de `bo_previsao`, e no legado os
  dois alertas diários sobre o mesmo pedido foram o motivo de separar a base da tela; a
  tela `/faturamentos-pendentes`, ao contrário, **continua mostrando** o pedido em B.O.,
  com `DT_PREVISAO_BO` e a contagem de itens em aberto (é a informação que explica por que
  o faturamento parou). O teste que prova isso é da 005.

**Consome da 006 (trânsito e recebimento):** nada.

**Fornece:**

- `SGC_BO_ITEM` (contagem de abertos por card) e `SGC_PEDIDO.DT_PREVISAO_BO` — é o que a
  tela `/faturamentos-pendentes` da 005 lê para mostrar o pedido em B.O.
- Os dois fragmentos de `backend/sql/` e o texto `boEntrada` (R-030), para o integrador.
- As chaves `verBo`/`operarBo` de `lib/permissoes.ts` e o item de menu do comercial (R-028).
- `AbaBo` como `AbaExtra` (R-029) e a rota `/bo`.
- `lib/bo.ts` — `situacaoDaPrevisao` e `rotuloSituacaoPrevisao` servem a qualquer tela que
  precise da situação de uma data-promessa.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | A aba carrega tudo por **uma** SF JAVASCRIPT (`sgcBoCarregar`) que faz três `runQueryMitra` com os mesmos textos das três SQL de leitura | A aba chamar `sgcBoItensCard`, `sgcBoPrevisoesCard` e `sgcBoDocumentosCard` | Três chamadas por abertura de aba estouram o orçamento (RNF-001; o teto é 300/min do projeto inteiro). `runQueryMitra` não conta como execução de SF — é o mesmo desenho de `sgcPedidoCarregar` (002) e `sgcFornecedorCarregar` (001). As três SQL continuam publicadas porque são o contrato do 000 e são o que o `sim:check` consegue exercitar (ele pula JAVASCRIPT) |
| D-002 | **Uma** SF JS (`sgcBoMarcar`) resolve marcar e liberar, com `status` por item | Uma SF para marcar e outra para liberar | Liberar precisa escrever nas mesmas duas tabelas (`SGC_BO_ITEM` e `SGC_PEDIDO_ITEM`) com a mesma guarda e a mesma conferência de fase. Duas SFs duplicariam a guarda, ou forçariam `sgcEscItemStatusBo` a existir em duas versões (uma com `:VAR_USER`, outra com `{{usuarioId}}`) — que é exatamente o tipo de divergência que o A1 da onda 1 custou |
| D-003 | A consulta de impacto usa `IN ({{codprods}})` e `{{dias}}` parametrizado | Porte literal do legado, com `INSTR(',' \|\| '{{codprods}}' \|\| ',', …)` e `- 60` fixo | O `INSTR` do legado não é sargável (nenhum índice de `CODPROD` entra) e força conversão por linha numa `PCMOV` de porte real; o `IN` fatiado em 500 é o mesmo fragmento que a 003 já monta e testa, e resolve `ORA-01795` do mesmo jeito |
| D-004 | A fotografia de impacto **não** filtra por filial | Contar só os clientes da filial do pedido | O legado não filtra, e a pergunta que o comercial faz é "quantos clientes meus ficam sem", não "quantos clientes da filial 1". Se algum dia precisar do recorte, o parâmetro entra sem mudar a tabela |
| D-005 | `ALERTA_BO_EM` é `VARCHAR(10)` — o dia | `VARCHAR(19)` com o carimbo, como no legado e como `DATA_ENVIO_REAL` da 004 | A regra é "um aviso por dia": guardar hora obriga todo leitor a fatiar a string, que é exatamente a dívida D-13 da onda 1 |
| D-006 | O painel filtra por `B.STATUS`, **não** pela fase do card | Repetir o `C.ID_FASE = 16` do legado | No legado, item em aberto num card que voltou para Trânsito sumia do painel e ficava `EM_BO` para sempre — inconsistência silenciosa. Aqui a verdade é o `STATUS` do item, e liberar é uma ação explícita |
| D-007 | `SGC_BO_ITEM` aponta para o item por `CODPROD` (com `ID_CARD`), não por `ID_ITEM` | `ID_ITEM` como no legado | Mesmo motivo de D-007 da 003: o upsert em lote não devolve ids e o item pode ser removido e readicionado, o que invalidaria o `ID_ITEM` mas não o produto. E é o que torna o `UNIQUE (ID_CARD, CODPROD)` possível |
| D-008 | `SGC_PEDIDO_ITEM.STATUS` ganha **só** o valor `bo` nesta onda; item liberado volta para `enviado` | Uma situação de item por fase do pedido | R-039: a situação do item não acompanha Faturamento nem Concluídas — `bo` é o único valor novo, e `enviado` é para onde o item volta. Menos estado, menos lugar para desincronizar |
| D-009 | `sgcEscPedidoPrevisaoBo` (tela, `:VAR_USER`) e `sgcEscPedidoAlertaBo` (interna, `{{usuarioId}}`) são **duas** SFs sobre a mesma tabela | Uma SF só, com o usuário resolvido por `COALESCE(NULLIF(:VAR_USER, 0), {{usuarioId}})` | Aceitar `usuarioId` como identidade quando a sessão não resolve é literalmente a dívida D-06 da onda 1. Duas SFs, duas identidades, uma instrução cada — e a segunda espelha `sgcEscPedidoAlertaFaturamento` (005) e `sgcEscNfAlertaAtraso` (006) |
| D-010 | O cron alerta enquanto o pedido estiver em `bo`, sem olhar o percentual faturado | Repetir o `PERC_FATURADO < 100` do legado | No SGC 2 sair do B.O. é um movimento de fase, explícito; um pedido 100 % faturado que continua em `bo` tem item em aberto e **deve** ser cobrado. Ler o percentual ainda criaria dependência de escrita da 005 dentro do meu cron |
| D-011 | A frase da entrada é fixa e tem um dono só, `MOTIVOS.boEntrada` (o `lib/bo.ts` reexporta, G-8); a da conclusão é dinâmica, vive só na coluna `PENDENCIAS_BO_MOTIVO` e é testada no smoke | As duas frases fixas, ou a dinâmica duplicada numa função pura de tela | A contagem é o que torna a recusa acionável ("resolva **os 2**") e `MOTIVOS` é `Record<string, string>`: não cabe. Com R-046 a tela não espelha esses pares, então uma pura de conclusão seria código sem chamador — e duas cópias da frase da entrada seriam duas coisas para divergir |
| D-012 | O painel `/bo` **não** é recortado por persona nem por acesso restrito | Esconder do comercial os pedidos de outras pessoas | O2-06 pede o painel "visível a todas as personas", e `RESTRICTED` é regra de **operação** ("só opera os próprios cards", P-08 B), nunca de leitura — nenhuma listagem do projeto é recortada assim |
| D-013 | Quem move o card para B.O. e para fora dele é sempre a pessoa, por `ctx.mover` | O `sgcBoMarcar` mover sozinho depois de marcar | Marcar o que faltou e decidir que o pedido inteiro virou B.O. são duas decisões; e mover por dentro de uma SF pularia o gancho e o aviso da tela. O `kbCardMover` sem sessão (R-021) tem uma consumidora só na onda 2, o cron da 006 |
| D-014 | O seed cria produtos e clientes **próprios** (5201/5202, 9101–9105) num fornecedor que a 003 não analisa | Semear vendas sobre os produtos da 003 | As vendas da 003 têm data fixa (2026-08-15) e entrariam na janela de 60 dias enquanto "hoje" estiver perto de 2026-09-15 e sairiam depois: o mesmo teste daria 4 clientes hoje e 3 no ano que vem. Com produtos próprios e datas relativas, os números de C-002 são estáveis |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `sgcEscAvisoInserir` (005) mudar de nome ou de parâmetro | o cron de B.O. não publica, ou grava aviso torto | contrato listado em *Dependências*; o `add-010` resolve por nome em `listServerFunctionsMitra` e falha alto ("Server function sem id no mapa"), nunca grava errado; o smoke do C-010 confere as colunas gravadas |
| O cron de faturamento da 005 continuar alertando pedido em `bo` | duas cobranças diárias sobre o mesmo pedido — o defeito que o legado corrigiu separando a base da tela | R-041 fecha a regra no contrato e a 005 já foi avisada; o teste que prova isso é da 005 |
| `IN ({{codprods}})` acima de 1.000 produtos estoura `ORA-01795` | a marcação em massa falha | o JS fatia em 500 e soma os resultados, como o `sgcAlertasGerar` da 003 |
| Descrição de produto com aspas quebrar o fragmento `{{linhas}}` | gravação falha ou injeta | `texto()` do preâmbulo dobra aspas simples e corta caracteres de controle; o smoke marca um produto com `'` na descrição |
| Dois usuários marcando o mesmo produto ao mesmo tempo | registro duplicado | `UNIQUE (ID_CARD, CODPROD)` + `ON DUPLICATE KEY UPDATE`: a corrida vira atualização, não duplicata (C-016) |
| A fotografia de clientes impactados envelhecer | o painel mostra um impacto de três meses atrás | é foto por decisão (RN-002, *Fora de escopo*); o painel mostra `CRIADO_EM` ao lado, então a idade do número é visível |
| `sgcBoCarregar` e as três SQL divergirem | a aba mostra uma coisa e o `sim:check` valida outra | os textos são **constantes exportadas** do `add-010`, usadas nos dois lugares — não há segunda cópia para divergir |

## Complexity Tracking

Vazio: nenhuma violação de princípio.

## Pedidos ao 000 — respondidos

Os seis pedidos desta spec foram decididos pelo 000 e já estão aplicados acima. Ficam
registrados para quem ler o plan sem o histórico:

1. **`sgcEscPedidoAlertaBo` (7756), SF a mais — aceita.** A marca do alerta é escrita de
   processo (`{{usuarioId}}`) e o registro de previsão é escrita de tela (`:VAR_USER`):
   uma instrução por SF, uma identidade por SF (D-009). Espelha
   `sgcEscPedidoAlertaFaturamento` (005) e `sgcEscNfAlertaAtraso` (006).
2. **`sgcBoCarregar` (7707), SF a mais — aceita.** Pelo mesmo motivo que a 001 tem
   `sgcFornecedorCarregar` e a 002 tem `sgcPedidoCarregar`: o orçamento manda a aba
   carregar em uma execução (D-001, RNF-001).
3. **`sgcBoPainelTotal` — aceito**, no padrão de
   `sgcFornecedorListarTotal`/`sgcAgendaListarTotal`.
4. **R-039 — `SGC_PEDIDO_ITEM.STATUS` ganha só `bo`.** Não existem situações de item "em
   faturamento" nem "concluído": o item liberado volta a `enviado` (D-008). Nenhuma outra
   spec introduz valor novo nessa coluna na onda 2.
5. **R-040 — o documento do B.O. usa `ENDERECO VARCHAR(700)`**, o mesmo nome e tipo de
   `SGC_FORNECEDOR_DOCUMENTO.ENDERECO` (001), no lugar do `URL` do rascunho de R-026. Vale
   para a tabela, para `sgcEscBoDocumentoInserir` (`{{endereco}}`), para
   `sgcBoDocumentosCard` e para a coluna `CARTA_FALTA_ENDERECO` do painel. O `CHECK_INPUT`
   não muda: o `sim:check` pula escrita, então nenhum parâmetro de documento entra lá.
6. **R-041 — a cobrança do faturamento não se soma à do B.O.** O cron
   `sgcFaturamentoMonitorar` (005) não alerta pedido na fase `bo` — esse pedido já tem a
   cobrança diária de `bo_previsao` —, e `/faturamentos-pendentes` continua mostrando o
   pedido em B.O. com `DT_PREVISAO_BO` e a contagem de itens em aberto. É a regra que o
   legado fixou na seção 5 do `add-bo-fase-produtos.mjs`; a 005 já foi avisada.
