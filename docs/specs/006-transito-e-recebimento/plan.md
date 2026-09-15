# Plan: Trânsito e recebimento — previsão, atraso e conclusão do trânsito

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; 22 cenários e 13 regras, todos vindos de O2-04, O2-05 e das decisões R-021, R-023, R-025, R-027, R-028, R-029, R-030, R-031 do contrato da onda 2 |
| Backend escrito local, executado no sandbox | sim | só `backend/add-009-transito.mjs` (novo). **Nenhuma tabela e nenhuma coluna nova**: as duas que esta spec escreve (`SGC_NF.DT_RECEBIMENTO` e `SGC_NF.ALERTA_ATRASO_EM`) já estão no `CREATE TABLE` da 005 (R-026). Nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL continua no `setup-backend.mjs` (arquivo da base) e a migration é gerada pelo sandbox |
| Leitura e escrita por Server Function | sim | a aba e a tela usam `linhas()`/`acao()` de `src/lib/mitra-api.ts`; zero `listRecords`/`patchRecord`. As duas escritas são SF SQL de uma instrução, chamadas **por id** pelo JS com `{{usuarioId}}` e a guarda de persona única (R-013) — não há escrita de tela nesta spec (D-005) |
| Simulador cobre a feature | sim | `add-009-transito.mjs` no `PUBLISH_ORDER`; `simulator/seed/006-transito.mjs` só insere linhas (6 pedidos, 15 notas, as entradas `PCNFENT` das notas desta spec); `CHECK_INPUT` ganha as chaves novas; `sim:check` roda as 4 SQL de leitura com contagem > 0 |
| Testes automatizados obrigatórios | sim | 22 cenários e 13 regras mapeados em `backend/simulator/smoke/006-transito.mjs` e `frontend/tests/recebimento.test.mjs` |
| Design tokens, sem cor literal | sim | tabela, `Status`, `Code`, `Dash`, `FilterChip`, `Pagination` do `page.tsx`; zero hex, zero `style={{}}`, zero classe Tailwind solta (o legado pintava a situação com hex — D-009) |
| Simplicidade | sim | nenhuma dependência nova; a previsão é **uma** expressão SQL usada pelas quatro leituras; a regra pura da tela é só rótulo, faixa, resumo e CSV — a aritmética de data não é reimplementada no front (D-003) |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`
- **Reuso identificado:**
  - **005:** `SGC_NF` (a nota já vinculada e conferida), `sgcEscAvisoInserir` (chamada por id, R-023), `backend/lib/dias-uteis.mjs` e `frontend/src/lib/dias-uteis.ts` (R-025), os fragmentos `pendencias-transito.sql` e `pendencias-conclusao-nf.sql` (R-030).
  - **001:** `SGC_FORNECEDOR.PRAZO_ENTREGA_DIAS` / `PRAZO_ENTREGA_TIPO` (`uteis` \| `corridos`) e `rotuloPrazoEntrega(dias, tipo)` de `frontend/src/lib/fornecedor.ts` — o rótulo "7 dias úteis" já existe e já é testado; esta spec importa, não reescreve.
  - **002:** `SGC_PEDIDO` (fornecedor, filial, número do pedido no ERP, criador), `SGC_FASE` (chaves `enviado`, `transito`, `faturamento`), o gancho `sgcPodeMover`, `permissoesDe`/`personaDe` de `lib/permissoes.ts`, e o `usePedido()` de `pages/quadros/abas/pedido-contexto.ts` — a aba reaproveita a persona e o `podeEditar` que o `PedidoProvider` já carregou, sem uma consulta de persona própria (fecha D-02 em vez de repeti-la).
  - **003:** o padrão de `chamar()`/lote de `add-006-itens.mjs`, o `escapar()` de texto e o fatiamento de `IN (...)` em 500 (ORA-01795).
  - **004:** o preâmbulo JS do cron (`runQueryMitra` para ler, `executeServerFunctionMitra` para gravar, `__SGC_IDS__` trocado na publicação), `diaNoFuso()` e o laço que não deixa o erro de um item derrubar o lote.
  - **lib 1.4.0:** `kbCardMover` com `movidoPor` e `origem: 'sistema'` (R-021) e `kbNotaRegistrar` com `usuarioId` — as duas só valem sem sessão.
  - `frontend/src/lib/formato.ts`: `fmtData`, `moeda`, `hojeIso`.
  - `components/page.tsx`: `PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `SearchInput`, `FilterChip`, `Table`/`Th`/`Td`/`Tr`, `RowTitle`, `RowMeta`, `Code`, `Dash`, `Status`, `Stat`, `MetaDot`, `Alert`, `EmptyState`, `Button`, `Pagination`.
- **Dependência nova:** nenhuma.

## Modelo de dados

Esta spec **não cria tabela nem coluna**: o modelo da onda 2 (R-026) já reservou tudo. Abaixo,
o que ela lê e o que ela escreve, com as colunas literais do `setup-backend.mjs`.

| Entidade (spec) | Tabela | Colunas que esta spec usa | Papel |
|---|---|---|---|
| Nota fiscal do pedido | `SGC_NF` (005) | lê `ID`, `ID_CARD`, `NUMNOTA`, `SERIE`, `CHAVENFE`, `NUMTRANSENT`, `CODFORNEC`, `CODFILIAL`, `DT_EMISSAO`, `DT_ENTRADA`, `VL_TOTAL`; **escreve** `DT_RECEBIMENTO`, `ALERTA_ATRASO_EM`, e completa `DT_ENTRADA`, `NUMTRANSENT`, `CHAVENFE` quando vierem vazios | `DT_EMISSAO` é a **data de faturamento**, a base da previsão (RN-001) |
| Prazo de entrega do fornecedor | `SGC_FORNECEDOR` (001) | lê `CODFORNEC`, `PRAZO_ENTREGA_DIAS INT NOT NULL DEFAULT 0`, `PRAZO_ENTREGA_TIPO VARCHAR(10) NOT NULL DEFAULT 'uteis'` | **zero é "não parametrizado"** — a coluna é `NOT NULL DEFAULT 0`, então "sem prazo" (RN-002) é `<= 0` **ou** fornecedor sem linha em `SGC_FORNECEDOR` (D-002) |
| Pedido | `SGC_PEDIDO` (002) | lê `ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`, `NUMPED_WINTHOR`, `CRIADO_POR` | fornece a filial que desempata a entrada (RN-004) e as colunas da lista de vencidas |
| Fase do pedido | `SGC_FASE` (002) + `KB_CARD` | lê `CHAVE`, `FASE_ID`, `BOARD_ID`, `KB_CARD.EXCLUIDO_EM` | o monitoramento é por **chave** (`enviado`, `transito`, `faturamento`), nunca por id nem por nome |
| Responsável do pedido | `KB_CARD_RESPONSAVEL` (lib) | lê `CARD_ID`, `USUARIO_ID`, `ORDEM`, `ID` | primeiro responsável = `ORDER BY ORDEM, ID LIMIT 1`; sem responsável, `KB_CARD.CRIADO_POR` (RN-006) |
| Aviso | `SGC_AVISO` (005) | escreve só por `sgcEscAvisoInserir` (por id): `ID_CARD`, `TIPO` (`nf_atrasada`, `nf_recebida`), `CHAVE`, `PARA_USUARIO_ID` (0 = responsáveis), `PARA_PERSONA` (`''`), `TEXTO` | `CHAVE` é a idempotência do dia (R-023) |
| Entrada da nota no ERP | `PCNFENT` (WinThor, Oracle) | lê `NUMTRANSENT`, `NUMNOTA`, `SERIE`, `CODFORNEC`, `CODFILIAL`, `CHAVENFE`, `DTEMISSAO`, `DTENT`, `DTCANCEL`, `VLTOTAL` | só leitura (RNF-005) |

Chaves de `SGC_AVISO` gravadas por esta spec (formato `tipo:card:AAAA-MM-DD[:nf]` do R-026):
`nf_atrasada:<idCard>:<dia>:<idNf>` e `nf_recebida:<idCard>:<dia>`.

## Contratos de backend

Tudo em `backend/add-009-transito.mjs`, que exporta `definitions`. Ids locais: **7601–7606**
(leituras e JS), **7650–7651** (escritas), faixa 76xx da 006 (R-024). Filtro desligado é `''`
no texto e `0` no número.

### O fragmento da previsão — escrito uma vez, usado nas quatro leituras

A previsão nunca é coluna (RF-004). As quatro leituras compõem a **mesma** expressão, montada
por uma função do módulo a partir dos fragmentos de dias úteis da 005 (R-025):

```js
import { somarDiasUteis, somarDiasCorridos } from './lib/dias-uteis.mjs';

// '' quando não há previsão possível (RN-002); senão 'AAAA-MM-DD'.
const dtPrevisao = (nf, fo) => `CASE
    WHEN TRIM(COALESCE(${nf}.DT_EMISSAO, '')) = '' OR COALESCE(${fo}.PRAZO_ENTREGA_DIAS, 0) <= 0 THEN ''
    WHEN COALESCE(${fo}.PRAZO_ENTREGA_TIPO, 'corridos') = 'uteis'
      THEN ${somarDiasUteis(`${nf}.DT_EMISSAO`, `${fo}.PRAZO_ENTREGA_DIAS`)}
    ELSE ${somarDiasCorridos(`${nf}.DT_EMISSAO`, `${fo}.PRAZO_ENTREGA_DIAS`)}
  END`;

// O dia de referência vem de quem chama (R-10 da 004): a tela manda o dia do
// navegador, o cron manda o dia de Brasília; '' cai no dia do servidor.
const HOJE = `COALESCE(NULLIF('{{hoje}}', ''), DATE_FORMAT(CURDATE(), '%Y-%m-%d'))`;

const SITUACAO = (n) => `CASE
    WHEN TRIM(COALESCE(${n}.DT_RECEBIMENTO, '')) <> '' THEN 'recebida'
    WHEN ${n}.DT_PREVISAO = ''                         THEN 'sem_prazo'
    WHEN ${n}.DT_PREVISAO < ${HOJE}                    THEN 'atrasada'
    WHEN ${n}.DT_PREVISAO <= ${somarDiasCorridos(HOJE, 2)} THEN 'em_transito'
    ELSE 'dentro_prazo'
  END`;

const DIAS_ATRASO = (n) => `CASE
    WHEN ${n}.DT_PREVISAO = '' OR TRIM(COALESCE(${n}.DT_RECEBIMENTO, '')) <> '' THEN 0
    ELSE DATEDIFF(STR_TO_DATE(${HOJE}, '%Y-%m-%d'), STR_TO_DATE(${n}.DT_PREVISAO, '%Y-%m-%d'))
  END`;
```

Duas camadas em toda consulta (MySQL não reaproveita alias no mesmo `SELECT`): a interna
resolve `DT_PREVISAO`, a externa resolve `SITUACAO` e `DIAS_ATRASO` em cima dela. Datas são
texto ISO em `VARCHAR`, então a comparação `<`/`<=` entre elas é comparação de texto e ordena
certo — nenhuma conversão a mais.

**O que esta spec exige de `backend/lib/dias-uteis.mjs` (R-025, escrito pela base a partir do
plan da 005):** `somarDiasUteis(col, n)` e `somarDiasCorridos(col, n)` devolvem **fragmento SQL
que resulta em texto `AAAA-MM-DD`**, e o `n` pode ser uma **coluna** (`FO.PRAZO_ENTREGA_DIAS`),
não só um literal. `somarDiasUteis` conta de segunda a sexta sem feriados e recua a base de
sábado/domingo para a sexta anterior, antes de contar (RN-001) — a conferência de R-025
(24/08/2026 + 15 = 14/09/2026) é a mesma desta spec. Ver *Riscos*: o `INTERVAL` do dialeto do
simulador hoje só reescreve literal numérico.

### Leituras — banco interno

| Nome | Id | Tipo | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|---|---|
| `sgcNfsRecebimentoCard` | 7601 | SQL | `cardId` (0), `hoje` ('') | `ID, ID_CARD, NUMNOTA, SERIE, CHAVENFE, NUMTRANSENT, CODFORNEC, CODFILIAL, DT_EMISSAO, VL_TOTAL, DT_RECEBIMENTO, ALERTA_ATRASO_EM, PRAZO_ENTREGA_DIAS, PRAZO_ENTREGA_TIPO, DT_PREVISAO, DIAS_ATRASO, SITUACAO` | RF-001, RF-005, RF-006 |
| `sgcNfsRecebimentoPendente` | 7602 | SQL | `cardId` (0 = todos os monitorados), `hoje` ('') | o mesmo, mais `FASE, FILIAL_PEDIDO, FORNECEDOR, NUMPED_WINTHOR, QUEM_PROCESSA, BOARD_ID` | RF-007, RF-016, RN-010 |
| `sgcNfsEmAtraso` | 7603 | SQL | `busca` (''), `faixa` (''), `hoje` (''), `limite` (20), `offset` (0) | `ID, ID_CARD, TITULO, FASE, NUMNOTA, SERIE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, NUMPED_WINTHOR, DT_EMISSAO, PRAZO_ENTREGA_DIAS, PRAZO_ENTREGA_TIPO, DT_PREVISAO, DIAS_ATRASO, VL_TOTAL` | RF-018, RF-019 |
| `sgcNfsEmAtrasoTotal` | 7604 | SQL | `busca` (''), `faixa` (''), `hoje` ('') | uma linha: `TOTAL`, `VALOR_TOTAL` | RF-018 |

**`sgcNfsRecebimentoCard`** — a consulta da aba, uma execução por abertura (RNF-001):

```sql
SELECT N.*, ${SITUACAO('N')} AS SITUACAO, ${DIAS_ATRASO('N')} AS DIAS_ATRASO
FROM (
  SELECT NF.ID, NF.ID_CARD, NF.NUMNOTA, COALESCE(NF.SERIE, '') AS SERIE,
    COALESCE(NF.CHAVENFE, '') AS CHAVENFE, COALESCE(NF.NUMTRANSENT, 0) AS NUMTRANSENT,
    NF.CODFORNEC, COALESCE(NF.CODFILIAL, '') AS CODFILIAL,
    COALESCE(NF.DT_EMISSAO, '') AS DT_EMISSAO, COALESCE(NF.VL_TOTAL, 0) AS VL_TOTAL,
    COALESCE(NF.DT_RECEBIMENTO, '') AS DT_RECEBIMENTO,
    COALESCE(NF.ALERTA_ATRASO_EM, '') AS ALERTA_ATRASO_EM,
    COALESCE(FO.PRAZO_ENTREGA_DIAS, 0) AS PRAZO_ENTREGA_DIAS,
    COALESCE(FO.PRAZO_ENTREGA_TIPO, '') AS PRAZO_ENTREGA_TIPO,
    ${dtPrevisao('NF', 'FO')} AS DT_PREVISAO
  FROM SGC_NF NF
  LEFT JOIN SGC_FORNECEDOR FO ON FO.CODFORNEC = NF.CODFORNEC
  WHERE NF.ID_CARD = {{cardId}}
) N
ORDER BY N.DT_EMISSAO, N.NUMNOTA
```

O `LEFT JOIN` é o que faz C-003 funcionar sem nenhuma condição especial: fornecedor sem linha
em `SGC_FORNECEDOR` cai em `PRAZO_ENTREGA_DIAS = 0`, que é o mesmo caso de prazo zerado.

**`sgcNfsRecebimentoPendente`** — a base do cron e do botão. Acrescenta à camada interna:

```sql
  JOIN KB_CARD C   ON C.ID = NF.ID_CARD AND C.EXCLUIDO_EM IS NULL
  JOIN SGC_FASE F  ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
  LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
  WHERE TRIM(COALESCE(NF.DT_RECEBIMENTO, '')) = ''
    AND F.CHAVE IN ('enviado', 'transito')
    AND ({{cardId}} = 0 OR NF.ID_CARD = {{cardId}})
    AND NF.ID_CARD IN (SELECT L.ID_CARD FROM (
      SELECT NF2.ID_CARD
      FROM SGC_NF NF2
      JOIN KB_CARD C2  ON C2.ID = NF2.ID_CARD AND C2.EXCLUIDO_EM IS NULL
      JOIN SGC_FASE F2 ON F2.BOARD_ID = C2.BOARD_ID AND F2.FASE_ID = C2.FASE_ID
      WHERE TRIM(COALESCE(NF2.DT_RECEBIMENTO, '')) = ''
        AND F2.CHAVE IN ('enviado', 'transito')
        AND ({{cardId}} = 0 OR NF2.ID_CARD = {{cardId}})
      GROUP BY NF2.ID_CARD
      ORDER BY MIN(COALESCE(NF2.DT_EMISSAO, '')), NF2.ID_CARD
      LIMIT 30
    ) L)
```

mais as colunas de contexto:

```sql
  F.CHAVE AS FASE, C.BOARD_ID,
  COALESCE(P.CODFILIAL, '') AS FILIAL_PEDIDO, COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
  COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED_WINTHOR,
  COALESCE((SELECT R.USUARIO_ID FROM KB_CARD_RESPONSAVEL R
             WHERE R.CARD_ID = C.ID ORDER BY R.ORDEM, R.ID LIMIT 1),
           C.CRIADO_POR, 0) AS QUEM_PROCESSA
```

O lote é por **pedido**, não por nota (RN-010): a subconsulta escolhe 30 `ID_CARD` e a consulta
traz **todas** as notas pendentes deles, para nenhum pedido ser avaliado pela metade e mover-se
(ou não) com meia informação. O `IN (SELECT … FROM (… LIMIT 30) L)` tem a camada extra porque o
MySQL recusa `IN (SELECT … LIMIT …)` direto (D-007). Com `cardId > 0` o limite é inócuo — é uma
SQL só para o cron e para o botão.

**`sgcNfsEmAtraso` / `sgcNfsEmAtrasoTotal`** — a mesma camada interna do pendente (mesmas
junções, mesma restrição de fase), filtrando o resultado por `SITUACAO = 'atrasada'`, sem o
lote, com busca e faixa:

```sql
SELECT … FROM ( <camada com SITUACAO e DIAS_ATRASO> ) A
WHERE A.SITUACAO = 'atrasada'
  AND ('{{busca}}' = ''
       OR CAST(A.NUMNOTA AS CHAR) LIKE CONCAT('%', '{{busca}}', '%')
       OR UPPER(A.FORNECEDOR) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
       OR A.NUMPED_WINTHOR LIKE CONCAT('%', '{{busca}}', '%'))
  AND ('{{faixa}}' = ''
       OR ('{{faixa}}' = 'ate3'  AND A.DIAS_ATRASO <= 3)
       OR ('{{faixa}}' = '4a7'   AND A.DIAS_ATRASO BETWEEN 4 AND 7)
       OR ('{{faixa}}' = 'mais7' AND A.DIAS_ATRASO > 7))
ORDER BY A.DIAS_ATRASO DESC, A.VL_TOTAL DESC
LIMIT {{limite}} OFFSET {{offset}}
```

`sgcNfsEmAtrasoTotal` é o mesmo corpo com
`SELECT COUNT(*) AS TOTAL, COALESCE(SUM(A.VL_TOTAL), 0) AS VALOR_TOTAL` e sem `ORDER BY`/`LIMIT`:
uma execução dá o total de notas **e** o valor acumulado que o topo da tela mostra (RF-018).

### Leitura — WinThor (Oracle, `jdbcId` resolvido por nome)

| Nome | Id | Entrada | Saída | Atende |
|---|---|---|---|---|
| `sgcWintNfEntradasConfirmadas` | 7605 | `codfornec` (0), `numnotas` ('0') | `NUMTRANSENT, NUMNOTA, SERIE, CODFORNEC, CODFILIAL, CHAVENFE, DT_EMISSAO, DT_ENTRADA, VL_TOTAL` | RF-008, RF-016 |

```sql
SELECT N.NUMTRANSENT, N.NUMNOTA, N.SERIE, N.CODFORNEC, N.CODFILIAL,
       NVL(N.CHAVENFE, '') AS CHAVENFE,
       TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
       TO_CHAR(N.DTENT, 'YYYY-MM-DD')     AS DT_ENTRADA,
       NVL(N.VLTOTAL, 0) AS VL_TOTAL
FROM PCNFENT N
WHERE N.CODFORNEC = {{codfornec}}
  AND N.NUMNOTA IN ({{numnotas}})
  AND N.DTENT IS NOT NULL
  AND N.DTCANCEL IS NULL
ORDER BY N.NUMNOTA, N.DTENT
```

Porte fiel de `p-45547/backend/add-nf-transito-recebimento.mjs` (`sgc_nf_entradas_winthor`), com
`NUMTRANSENT` e `VLTOTAL` a mais. As duas condições finais **são** a regra: `DTENT IS NOT NULL` é
a entrada consolidada (RN-004) e `DTCANCEL IS NULL` tira a nota cancelada (C-007). `{{numnotas}}`
é montada pelo JS em lotes de 500 (ORA-01795, o mesmo teto da 003).

### JavaScript — `sgcRecebimentoSincronizar` (7606, cron `0 25 9-23/2 * * *`)

O cron roda de duas em duas horas das **6h25 às 20h25 de Brasília** — a expressão é em UTC
(`9-23/2`), como os demais crons da onda. A entrada da nota no ERP acontece ao longo do
expediente e o pedido precisa refletir isso no mesmo dia.

Entrada: `cardId` (0 = todos os pedidos monitorados).
Saída: `{ ok, hoje, notas, recebidas, atrasadas, movidos, resultados: [...], erros: [{ codfornec, erro }] }`.

Preâmbulo igual ao das JS do projeto (`runQueryMitra` para ler, `executeServerFunctionMitra`
para gravar, ids injetados por `__SGC_IDS__` a partir de `backend/ids-do-mapa.mjs` no simulador
e de `listServerFunctionsMitra` na publicação, R-016). SFs chamadas por id:
`sgcNfsRecebimentoPendente`, `sgcWintNfEntradasConfirmadas`, `sgcEscNfRecebimento`,
`sgcEscNfAlertaAtraso`, `sgcEscAvisoInserir` (005), `kbCardMover` e `kbNotaRegistrar` (lib).

1. **Quem está processando.** Uma consulta resolve a sessão (`:VAR_USER`) com a resolução de
   persona da 002 (R-013). Havendo sessão (o botão da tela): fora de `admin`/`analista`/`gestor`
   ou com `READ_ONLY`, devolve `{ ok: false, error: 'Seu perfil não verifica o recebimento das notas.' }`
   sem tocar em nada (C-020); com `RESTRICTED`, só prossegue nos pedidos cujo `CRIADO_POR` é o
   próprio (A2 da revisão). Sem sessão (o cron), não há persona a conferir aqui: quem assina
   cada pedido é o `QUEM_PROCESSA` dele, e a guarda cai sobre esse id dentro de cada escrita
   (D-004).
2. **Notas pendentes**: `sgcNfsRecebimentoPendente({ cardId, hoje })`, com `hoje` = dia em
   Brasília (`diaNoFuso`, `FUSO_MINUTOS = -180`, o mesmo da 004). Lista vazia → devolve zeros.
3. **Agrupa por `CODFORNEC`** e, para cada fornecedor, **uma** consulta ao ERP
   (`sgcWintNfEntradasConfirmadas`), com todas as notas dele em lotes de 500 (RN-009/RNF-002).
   Cada fornecedor dentro de um `try/catch`: a falha vira `erros.push({ codfornec, erro })` e o
   laço segue (C-014, RNF-006).
4. **Casa nota a nota.** Candidatas = entradas com o mesmo `NUMNOTA` (e o mesmo `NUMTRANSENT`,
   quando a nota já o tem). Mais de uma candidata: vence a da **filial do pedido**
   (`FILIAL_PEDIDO`); não havendo, a primeira por `DT_ENTRADA` (RN-004, C-008). Com data de
   entrada, `sgcEscNfRecebimento({ idNf, dtRecebimento, numtransent, chavenfe, usuarioId: QUEM_PROCESSA })`.
5. **Atrasadas.** Para cada nota pendente que sobrou com `SITUACAO = 'atrasada'` e
   `LEFT(ALERTA_ATRASO_EM, 10) <> hoje`: `sgcEscAvisoInserir` (por id, R-023) com
   `tipo: 'nf_atrasada'`, `chave: 'nf_atrasada:<idCard>:<hoje>:<idNf>'`, `paraUsuarioId: 0`
   (responsáveis do card), `paraPersona: ''` e o texto
   `NF 90003 de FRESENIUS KABI (faturada em 26/08/2026, previsão 04/09/2026) está 11 dias atrasada e continua sem entrada no WinThor.`;
   depois `sgcEscNfAlertaAtraso({ idNf, alertaEm, usuarioId })`. A dupla trava (data na nota +
   `CHAVE` única do aviso) é o que faz C-011 dar 5 e não 15 (RN-007).
6. **Conclusão do trânsito.** Para cada pedido **tocado** que está na fase `transito`, uma
   consulta conta as notas ainda sem recebimento; zero pendentes e ao menos uma nota →
   `kbCardMover({ cardId, faseId: <fase 'transito' → 'faturamento' do board>, ordem: 0, movidoPor: QUEM_PROCESSA, origem: 'sistema' })`
   (R-021/R-031). `ok !== true` vira erro do pedido e o laço segue. Movido: `sgcEscAvisoInserir`
   com `tipo: 'nf_recebida'`, `chave: 'nf_recebida:<idCard>:<hoje>'`, e `kbNotaRegistrar` com
   `As 2 notas do pedido deram entrada no WinThor. O pedido saiu de Em Trânsito para BN e está em Faturamento em Andamento.`
   A fase de destino sai de `SELECT FASE_ID FROM SGC_FASE WHERE BOARD_ID = <board> AND CHAVE = 'faturamento'`
   — nunca por id nem por nome de fase.
7. Todo pedido que teve nota recebida ganha também um `kbNotaRegistrar` com o resumo
   (`Recebimento sincronizado: 1 nota com entrada no WinThor (NF 90005, 14/09/2026).`), em
   `try/catch` — nota que falha não derruba a rodada (D-07 da revisão da onda 1).

**Custo (RNF-002/RNF-003):** por rodada, 1 execução por fornecedor com nota pendente + 1 por
nota recebida + 2 por nota que alerta + 3 por pedido movido. Com o teto de 30 pedidos e o perfil
do SGC (2 a 5 notas por pedido, 2 fornecedores por rodada), a rodada fica na casa das dezenas de
execuções, a cada 2 horas — folga larga no teto de 300/min do projeto. As leituras são
`runQueryMitra` e não contam como execução de SF.

### Escritas SQL (uma instrução por SF, chamadas só por id)

| Nome | Id | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|---|
| `sgcEscNfRecebimento` | 7650 | `{{usuarioId}}` + persona `admin`/`analista`/`gestor` (R-013) | `idNf`, `dtRecebimento`, `numtransent`, `chavenfe`, `usuarioId` | `UPDATE SGC_NF SET DT_RECEBIMENTO = '{{dtRecebimento}}', DT_ENTRADA = COALESCE(NULLIF(DT_ENTRADA, ''), '{{dtRecebimento}}'), NUMTRANSENT = CASE WHEN COALESCE(NUMTRANSENT, 0) > 0 THEN NUMTRANSENT ELSE {{numtransent}} END, CHAVENFE = COALESCE(NULLIF(CHAVENFE, ''), NULLIF('{{chavenfe}}', '')) WHERE ID = {{idNf}} AND TRIM('{{dtRecebimento}}') <> '' AND {{usuarioId}} > 0 AND <guarda>` | RF-008 |
| `sgcEscNfAlertaAtraso` | 7651 | idem | `idNf`, `alertaEm`, `usuarioId` | `UPDATE SGC_NF SET ALERTA_ATRASO_EM = '{{alertaEm}}' WHERE ID = {{idNf}} AND {{usuarioId}} > 0 AND <guarda>` | RF-013 |

A guarda é **a mesma** da 002 (R-013), copiada literalmente, trocando só a lista de personas:

```sql
AND EXISTS (
  SELECT 1 FROM INT_USER IU
  LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
  WHERE IU.ID = {{usuarioId}}
    AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
    AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                               WHEN 'ADMIN' THEN 'admin'
                               WHEN 'RESTRICTED' THEN 'comercial'
                               ELSE 'analista' END) IN ('admin', 'analista', 'gestor')
)
```

As duas ficam no perfil business, como as `kbEsc*` da lib (R-007) — a verificar no sandbox.

### Quem chama o quê

| Caminho | Guarda |
|---|---|
| Aba **Recebimento** → `sgcNfsRecebimentoCard` | leitura; a aba já está dentro do quadro, que o comercial não vê (P-03) |
| Tela `/nfs-em-atraso` → `sgcNfsEmAtraso`, `sgcNfsEmAtrasoTotal` | leitura; o item de menu depende de `verNfsAtraso` (R-028) |
| Botão "Verificar entrada no WinThor" (aba) e "Sincronizar com o WinThor" (tela) → `sgcRecebimentoSincronizar` | **com** sessão: a própria SF confere persona por `runQueryMitra` com `:VAR_USER` antes de qualquer escrita |
| Cron `sgcRecebimentoSincronizar` | **sem** sessão: cada escrita recebe `{{usuarioId}} = QUEM_PROCESSA` do pedido e a guarda confere a persona **dele** (R-013, R-023) |
| `sgcRecebimentoSincronizar` → `sgcEscNfRecebimento`, `sgcEscNfAlertaAtraso`, `sgcEscAvisoInserir`, `kbCardMover`, `kbNotaRegistrar` | por id, sempre com `usuarioId` explícito — `:VAR_USER` não se propaga em chamada aninhada |

Nenhuma escrita desta spec é chamada direto da tela (D-005): tudo que a tela dispara passa pelo
JS, porque casar nota com ERP, alertar e mover é orquestração.

### Bloco 76xx de `frontend/src/lib/server-functions.ts`

| Id local | Nome | Id local | Nome |
|---|---|---|---|
| 7601 | `sgcNfsRecebimentoCard` | 7605 | `sgcWintNfEntradasConfirmadas` |
| 7602 | `sgcNfsRecebimentoPendente` | 7606 | `sgcRecebimentoSincronizar` |
| 7603 | `sgcNfsEmAtraso` | 7650 | `sgcEscNfRecebimento` |
| 7604 | `sgcNfsEmAtrasoTotal` | 7651 | `sgcEscNfAlertaAtraso` |

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/quadro`, card aberto, aba **Recebimento** | notas do pedido com previsão, situação e recebimento; resumo "2 de 3 recebidas"; "Verificar entrada no WinThor" | `Panel`, `PanelHeader`, `Table`/`Th`/`Td`/`Tr`, `RowTitle`, `RowMeta`, `Code`, `Dash`, `Status`, `Stat`, `MetaDot`, `Alert`, `EmptyState`, `Button` | `AbaRecebimento` |
| `/nfs-em-atraso` | notas vencidas dos pedidos em Enviado e Em Trânsito: total e valor, faixas, busca, CSV, "Sincronizar com o WinThor" | `PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `SearchInput`, `SelectMenu`, `FilterChip`, `Table`, `Status`, `Code`, `Dash`, `Pagination`, `EmptyState`, `Button`, `Alert` | `NfsAtrasoPage` |

Arquivos:

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/pages/quadros/abas/Recebimento.tsx` | `AbaRecebimento(ctx: ExtensaoContexto)` — uma consulta por abertura, tabela, resumo e o botão de verificação |
| `frontend/src/pages/nfs-atraso/NfsAtrasoPage.tsx` | a tela `/nfs-em-atraso` |
| `frontend/src/lib/recebimento.ts` | regra pura: situação → rótulo e tom, faixa de atraso, resumo do pedido, colunas e linhas do CSV (o texto é de `lib/csv.ts`, da base) |
| `frontend/src/lib/server-functions.ts` | bloco 76xx (nomes e ids locais) |

Desenho (design.md §8.4, §8.6, §9.1, §9.4):

- **Tabela de notas** (aba e tela): `Code` para o número da nota, `RowTitle` para o fornecedor
  (na tela) ou para a nota (na aba), `RowMeta` para série e filial; datas e valores com
  `numeric`; sem zebra, linhas `py-3`. Situação como `Status` — **ponto mais texto**, nunca só
  cor: `recebida` → `live`; `atrasada` → `alert`; `em_transito` → `attention`; `dentro_prazo` e
  `sem_prazo` → `off`. Coluna sem dado é `Dash()`, nunca `0` nem `R$ 0,00` (previsão de nota sem
  prazo, recebimento de nota pendente, dias de atraso de quem não atrasou).
- **Topo da tela de vencidas**: `PanelHeader` com `Stat` para a contagem e para o valor,
  separados por `MetaDot` — a faixa de KPI do §8.7 é vocabulário de painel de BI, e esta tela é
  uma listagem operacional.
- **Faixas** como `SelectMenu` na `Toolbar` mais `FilterChip` quando aplicadas (o padrão de
  `FornecedoresPage`), nunca `<select>` nativo.
- **Sem toast** (UI-02): "Sincronizado às HH:MM — 2 notas atualizadas" na faixa do painel;
  erro em `Alert`.
- **Permissão** (§9.4, R-028): quem não pode operar vê os botões **desabilitados**, com o motivo
  no `title` — nunca escondidos (D-11 da revisão da onda 1). O comercial não recebe o item de
  menu nem chega ao quadro.
- **Sem campo de data**: nenhuma tela desta spec tem um. Se aparecer, é o
  `src/components/DatePicker.tsx` da 004 (UI-03 B), nunca o controle nativo.

## Fluxo

1. O comprador abre o pedido no `/quadro`. A abertura continua custando as execuções da 002/003
   (`kbCardDetalhe` + `sgcPedidoCarregar`): esta aba **não** carrega nada até ser aberta.
2. Aba **Recebimento**: uma chamada de `sgcNfsRecebimentoCard({ cardId, hoje })`. A tabela
   mostra cada nota com previsão, situação e recebimento; o cabeçalho, `resumoRecebimento()`.
3. "Verificar entrada no WinThor" (`operarNf`): `sgcRecebimentoSincronizar({ cardId })` e, na
   volta, a aba recarrega a consulta e chama `ctx.recarregar()` se o pedido tiver mudado de fase
   — o movimento é do servidor, a tela só reflete.
4. De duas em duas horas, o cron faz o mesmo para todos os pedidos monitorados, em lote de 30.
5. `/nfs-em-atraso`: `sgcNfsEmAtraso` + `sgcNfsEmAtrasoTotal` a cada mudança de filtro (duas
   execuções, como toda listagem do projeto). "Sincronizar com o WinThor" chama
   `sgcRecebimentoSincronizar({ cardId: 0 })` e recarrega a lista.
6. "Exportar": `baixarCsv(nome, textoCsv(COLUNAS_CSV_ATRASO, linhasCsv(notas)))` sobre as linhas
   **já carregadas** do filtro atual — sem execução nova, sem coluna diferente da tela.
7. Quando a última nota entra, o pedido muda de fase sozinho; quem estiver com o quadro aberto
   vê na atualização periódica de 60 s (002).

## Regras puras — `frontend/src/lib/recebimento.ts`

```ts
export type SituacaoNf = 'recebida' | 'atrasada' | 'em_transito' | 'dentro_prazo' | 'sem_prazo';
export type FaixaAtraso = 'ate3' | '4a7' | 'mais7';

export interface NotaRecebimento {
  id: number; numnota: number; serie: string; codfornec: number; fornecedor: string;
  dtEmissao: string; dtPrevisao: string; dtRecebimento: string; diasAtraso: number;
  prazoDias: number; prazoTipo: string; vlTotal: number; situacao: SituacaoNf;
}

export function notaDeLinha(linha: Record<string, unknown>): NotaRecebimento;
export function situacaoDeTexto(bruto: unknown): SituacaoNf;        // desconhecido → 'sem_prazo'
export function rotuloSituacao(s: SituacaoNf): string;              // 'Recebida' | 'Em atraso' | 'Chegando' | 'Dentro do prazo' | 'Sem prazo parametrizado'
export function tomSituacao(s: SituacaoNf): 'live' | 'alert' | 'attention' | 'off';
export function rotuloAtraso(nota: NotaRecebimento): string;        // '3 dias de atraso' | '' quando não atrasou
export function faixaDeAtraso(dias: number): FaixaAtraso;           // ≤3 | 4..7 | >7  (RN-005)
export function resumoRecebimento(notas: NotaRecebimento[]): {
  total: number; recebidas: number; pendentes: number; atrasadas: number; semPrazo: number; completo: boolean;
};
// Colunas e valores do CSV de /nfs-em-atraso; quem escreve o texto é textoCsv de lib/csv.ts.
export const COLUNAS_CSV_ATRASO: string[];
export function linhasCsv(notas: NotaRecebimento[]): (string | number)[][];
```

O que este módulo **não** faz: calcular previsão. A aritmética de data vive uma vez só, no SQL
(RF-004, D-003); a tela recebe `DT_PREVISAO` e `SITUACAO` prontos e só os traduz. O rótulo do
prazo ("7 dias úteis") vem de `rotuloPrazoEntrega` da 001, e o texto do CSV (escape de aspas,
separador `;`, vírgula decimal) de `textoCsv`/`baixarCsv` de `lib/csv.ts` (base, S2) — os dois
já existem e já são testados; esta spec só decide **quais** colunas vão.

## Simulador

### Seed — `backend/simulator/seed/006-transito.mjs`

Só **linhas**, nenhuma tabela: fornecedores (1015 Fresenius, 7 dias úteis; 1042 Nestlé, 10
corridos), filiais (1, 2, 3) e o fornecedor genérico 999999 (existe em `PCFORNEC`, **não** em
`SGC_FORNECEDOR` — é o "sem parametrização" de C-003) vêm do `seed/001-fornecedores.mjs`; as
personas, do `seed/002-quadro.mjs`; o quadro e as dez fases, do `seed.mjs` (R-017).
`NUMNOTA` desta spec: faixa **90001–90015**, reservada, para não colidir com as notas que a 005
semeia (D-008).

| Pedido | Fase | Fornecedor · filial · responsáveis | Notas | Serve a |
|---|---|---|---|---|
| **T1** | `transito` | 1015 · filial 1 · [ana], criador ana | 90001 faturada 24/08/2026, R$ 12.000, **recebida** 01/09; 90002 faturada 28/08/2026, R$ 8.000, **recebida** 09/09; 90003 faturada hoje−20, R$ 5.000, pendente e **sem linha no `PCNFENT`** | C-001, C-010, C-012, C-021 |
| **T2** | `transito` | 1015 · filial 1 · [**gil**, ana], criador ana | 90004 recebida; 90005 faturada hoje−5, pendente, com entrada no `PCNFENT` em hoje−1 | C-009 |
| **T3** | `transito` | 1042 · filial 2 · [ana] | 90006 faturada 28/08/2026, R$ 7.500, pendente sem entrada; 90007 faturada hoje−2, entrada no `PCNFENT` **com `DTCANCEL`**; 90008 pendente, entrada na **filial 1** (hoje−3) **e** na **filial 2** (hoje−1) | C-002, C-007, C-008, C-013, C-022 |
| **T4** | `transito` | 999999 · filial 1 · [ana] | 90009 (fornecedor 999999, faturada 24/08/2026) e 90010 (fornecedor 1015, **`DT_EMISSAO` vazia**), as duas pendentes | C-003, C-004 |
| **E5** | `enviado` | 1042 · filial 2 · [ana], `NUMPED_WINTHOR` `900500` | 90011 faturada hoje−12, R$ 4.000; 90012 hoje−15, R$ 6.000; 90013 hoje−19, R$ 10.000 — todas pendentes, sem entrada | C-005, C-011, C-015, C-016, C-017 |
| **F6** | `faturamento` | 1015 · filial 1 · [ana] | 90014 recebida; 90015 faturada hoje−19, pendente (prova que o monitoramento e a lista param na fase); 1 linha de `SGC_NF_OCORRENCIA` com `DECISAO = 'pendente'` | C-015, C-019 |

Os números fecham sozinhos, independentemente do dia em que o smoke rodar: as notas do E5 usam
prazo em dias **corridos** (10), então o atraso é exatamente 2, 5 e 9 dias; as de data absoluta
(90001, 90002, 90006) servem a cenários de previsão, não de contagem de faixa.

Estado esperado da **primeira** rodada: 2 notas recebidas (90005 e 90008), 5 avisos
`nf_atrasada` (90003, 90006, 90011, 90012, 90013), 1 pedido movido (T2) e 1 aviso `nf_recebida`.
A segunda rodada no mesmo dia: 0, 0, 0, 0.

Linhas de `PCNFENT` inseridas por este seed (só as das notas 900xx — R-027 dá as entradas da
detecção à 005, e a faixa 90001–90015 é desta spec, decisão 2 do 000): 90005 (filial 1, `DTENT` hoje−1, sem cancelamento), 90007
(filial 2, `DTENT` hoje−2, **`DTCANCEL` hoje−1**), 90008 em duas linhas (filial 1 `DTENT` hoje−3;
filial 2 `DTENT` hoje−1). Nenhuma linha para 90003, 90006 e 90011–90013 — é o que os mantém
pendentes.

### `CHECK_INPUT`

Acrescentar em `backend/simulator/config.mjs` (arquivo da base): `faixa: ''`, `idNf: '1'`,
`numnotas: '90001,90002'`, `dtRecebimento: '2026-09-01'`, `alertaEm: '2026-09-15T12:00:00'`,
`numtransent: '0'`, `chavenfe: ''`. Já existem e servem: `cardId`, `busca`, `limite`, `offset`,
`hoje` (`2026-09-15`, da 004), `usuarioId`, `codfornec` (`1015`, da 003).

### Dialeto

Usados por esta spec e já com shim: `COALESCE`, `CONCAT`, `CURDATE`, `DATEDIFF`, `DATE_FORMAT`,
`STR_TO_DATE`, `NVL`, `TO_CHAR`, `UPPER`, `LIMIT/OFFSET`, `FROM DUAL`. **Faltam** (entram em
`simulator/mysql-dialect.mjs`, arquivo da base, junto do `dias-uteis.mjs` de R-025):
`WEEKDAY`, `CAST(x AS CHAR)` e `DATE_ADD(col, INTERVAL <expressão> DAY)` — o shim de hoje só
reescreve `INTERVAL <literal> DAY`, e a previsão soma uma **coluna** de dias. Ver *Riscos*.

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `smoke/006-transito.mjs` | `sgcNfsRecebimentoCard(T1)` devolve 3 linhas; a 90001 com `DT_PREVISAO = '2026-09-02'` e a 90002 com `'2026-09-08'`, as duas com `PRAZO_ENTREGA_DIAS = 7` e `PRAZO_ENTREGA_TIPO = 'uteis'` |
| C-002 | `smoke/006-transito.mjs` | a 90006 devolve `DT_PREVISAO = '2026-09-07'` e `PRAZO_ENTREGA_TIPO = 'corridos'` |
| C-003 | `smoke/006-transito.mjs` | a 90009 devolve `DT_PREVISAO = ''`, `SITUACAO = 'sem_prazo'`, `DIAS_ATRASO = 0`; `sgcNfsEmAtraso` não a traz |
| C-004 | `smoke/006-transito.mjs` | a 90010 devolve `SITUACAO = 'sem_prazo'` mesmo com o fornecedor 1015 parametrizado |
| C-005 | `smoke/006-transito.mjs` | a 90011 devolve `SITUACAO = 'atrasada'` e `DIAS_ATRASO = 2` |
| C-006 | `smoke/006-transito.mjs` | depois de `sgcRecebimentoSincronizar({ cardId: 0 })`, `recebidas = 2` e a 90005 tem `DT_RECEBIMENTO` = hoje−1 e `SITUACAO = 'recebida'` |
| C-007 | `smoke/006-transito.mjs` | depois da rodada, a 90007 continua com `DT_RECEBIMENTO = ''` (a entrada existe, mas tem `DTCANCEL`); `sgcWintNfEntradasConfirmadas(1042, '90007')` devolve 0 linhas |
| C-008 | `smoke/006-transito.mjs` | a 90008 fica com `DT_RECEBIMENTO` = hoje−1 (a entrada da filial 2, a do pedido), não hoje−3 |
| C-009 | `smoke/006-transito.mjs` | depois da rodada, `KB_CARD` do T2 está na `FASE_ID` de `SGC_FASE.CHAVE = 'faturamento'`; a última linha de `KB_MOVIMENTO` do T2 tem `ORIGEM = 'sistema'` e `USUARIO_ID = gil`; 1 linha em `SGC_AVISO` com `TIPO = 'nf_recebida'` e 1 nota no histórico |
| C-010 | `smoke/006-transito.mjs` | o T1 continua na fase `transito` e `resumoRecebimento` sobre `sgcNfsRecebimentoCard(T1)` dá `{ total: 3, recebidas: 2, completo: false }` |
| C-011 | `smoke/006-transito.mjs` | primeira rodada: `SELECT COUNT(*) FROM SGC_AVISO WHERE TIPO = 'nf_atrasada'` = **5**; segunda e terceira rodadas no mesmo dia: continua 5 e `atrasadas = 0` na resposta |
| C-012 | `smoke/006-transito.mjs` | no T1, 90001 e 90002 com `SITUACAO = 'recebida'` e a 90003 com `'atrasada'`, na mesma resposta |
| C-013 | `smoke/006-transito.mjs` | `sgcRecebimentoSincronizar({ cardId: T3 })` com sessão de `ana` devolve `notas` só do T3 e não altera nenhuma nota do T1 |
| C-014 | `smoke/006-transito.mjs` | com a definição de `sgcWintNfEntradasConfirmadas` trocada no `byId` por uma que lança quando `codfornec = 1042`, a rodada grava o recebimento do 1015 (90005) e devolve `erros` com 1 item citando 1042 |
| C-015 | `smoke/006-transito.mjs` | `sgcNfsEmAtrasoTotal` devolve `TOTAL = 5` e `VALOR_TOTAL = 32500`; nenhuma linha de `sgcNfsEmAtraso` tem `NUMNOTA = 90015` |
| C-016 | `smoke/006-transito.mjs` | `faixa: 'ate3'` → 1 linha (90011); `'4a7'` → 1 linha (90012); `'mais7'` → 3 linhas, entre elas a 90013 |
| C-017 | `smoke/006-transito.mjs` | `busca: '90012'` → 1 linha; `busca: 'NESTLE'` → 3 linhas do E5; `busca: '900500'` → as mesmas 3 |
| C-018 | `tests/recebimento.test.mjs` | `linhasCsv` de 3 notas → 3 linhas com as colunas de `COLUNAS_CSV_ATRASO` na ordem; `textoCsv(COLUNAS_CSV_ATRASO, linhasCsv(notas))` → 4 linhas, valor `4000.5` como `4000,50` e fornecedor com `;` entre aspas |
| C-019 | `smoke/006-transito.mjs` | `sgcPodeMover({ usuarioId: gil, cardId: F6, boardId, faseId: fase 'concluido' })` devolve `PODE = 0` e `MOTIVO` citando a validação pendente (**depende dos fragmentos da 005/007 compostos no gancho — S4**) |
| C-020 | `smoke/006-transito.mjs` | `sgcRecebimentoSincronizar` como `leo` e como `dora` devolve `ok: false` e nada muda; `sgcEscNfRecebimento` com `usuarioId: leo` não altera linha nenhuma |
| C-021 | `smoke/006-transito.mjs` | `UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 10 WHERE CODFORNEC = 1015` → a 90001 passa a `DT_PREVISAO = '2026-09-07'` e a 90002 mantém `DT_RECEBIMENTO`; o teste devolve o prazo a 7 no fim |
| C-022 | `smoke/006-transito.mjs` | a 90006 (sem linha em `PCNFENT`) tem previsão e situação e continua com `DT_RECEBIMENTO = ''` depois da rodada |
| RN-001 | `smoke/006-transito.mjs` | uma consulta direta ao fragmento: 24/08/2026 + 15 dias úteis = `2026-09-14`; 29/08/2026 (sábado) + 1 dia útil = `2026-08-31` |
| RN-002 | `smoke/006-transito.mjs` | fornecedor com `PRAZO_ENTREGA_DIAS = 0` e nota com `DT_EMISSAO = ''` devolvem `DT_PREVISAO = ''` |
| RN-003 | `smoke/006-transito.mjs` + `tests/recebimento.test.mjs` | no servidor, com `hoje` forçado: previsão hoje−1 → `atrasada`, hoje+2 → `em_transito`, hoje+3 → `dentro_prazo`, recebida vence tudo; na tela, `situacaoDeTexto`/`rotuloSituacao`/`tomSituacao` para os cinco valores e para um valor desconhecido |
| RN-004 | `smoke/006-transito.mjs` | coberto por C-007 (cancelada) e C-008 (duas filiais) |
| RN-005 | `tests/recebimento.test.mjs` | `faixaDeAtraso`: 0 e 3 → `'ate3'`; 4 e 7 → `'4a7'`; 8 → `'mais7'` |
| RN-006 | `smoke/006-transito.mjs` | rodada 1 move o T2; rodada 2 não move nada (`movidos = 0`) e o T2 continua em `faturamento` com um único movimento `sistema` |
| RN-007 | `smoke/006-transito.mjs` | apagando `ALERTA_ATRASO_EM` da 90011 e rodando de novo no mesmo dia, `sgcEscAvisoInserir` é chamada e **não** cria linha nova (a `CHAVE` do dia já existe); `SGC_AVISO` continua com 5 linhas |
| RN-008 | `smoke/006-transito.mjs` | 1 linha `nf_recebida` para o T2, com `PARA_USUARIO_ID = 0` |
| RN-009 | `smoke/006-transito.mjs` | contador de execuções de `sgcWintNfEntradasConfirmadas` numa rodada com notas de 1015, 1042 e 999999 = **3**, com todas as notas de cada fornecedor no mesmo `numnotas` |
| RN-010 | `smoke/006-transito.mjs` | com 45 pedidos pendentes semeados no próprio teste, `sgcNfsRecebimentoPendente({ cardId: 0 })` devolve notas de exatamente 30 pedidos, e todas as notas de cada um deles |
| RN-011 | `smoke/006-transito.mjs` | a 90015 (pedido em `faturamento`) não aparece em `sgcNfsRecebimentoPendente` nem em `sgcNfsEmAtraso`; marcando o T4 como excluído (`EXCLUIDO_EM`), as notas dele somem das duas |
| RN-012 | `tests/recebimento.test.mjs` | `permissoesDe` para as 5 personas × 4 níveis: `verNfsAtraso` liga para admin/analista/gestor/diretoria e desliga para comercial; `operarNf` desliga para diretoria, comercial e `READ_ONLY` |
| RN-013 | `smoke/006-transito.mjs` | mesmo do C-019, mais o caso liberado: decidida a ocorrência do F6, `sgcPodeMover` devolve `PODE = 1` e `MOTIVO` vazio |

- **Backend:** `backend/simulator/smoke/006-transito.mjs`, um `teste()` por linha, título
  começando pelo id. A consulta ao WinThor assere **contagem > 0** (vazio não é verde): o teste
  de C-006 confere que `sgcWintNfEntradasConfirmadas(1015, '90005')` devolve ≥ 1 linha.
- **Frontend:** `frontend/tests/recebimento.test.mjs` com `node --test` sobre `src/lib/`.
- **Seed extra para o smoke:** os 45 pedidos de RN-010 são inseridos pelo próprio teste (e não
  pelo seed) para não inflar o simulador de tela; o resto nasce em `seed/006-transito.mjs`.
- **Como o smoke chama o cron:** `execute(definicao, {}, 0)` — `userId = 0` é a ausência de
  sessão, que é o que habilita `movidoPor`/`origem: 'sistema'` no `kbCardMover` (R-021). Com
  `userId` de pessoa, o mesmo teste falharia, e é justamente essa a garantia de C-009.

## Dependências entre specs

**Consome da 005 (notas fiscais e faturamento):**

- `SGC_NF` — todas as colunas da tabela do modelo; escreve `DT_RECEBIMENTO` e `ALERTA_ATRASO_EM`.
  Contrato pedido à 005: ao vincular uma nota que **já entrou** no ERP, gravar `DT_RECEBIMENTO`
  igual a `DT_ENTRADA` (R-026) — assim a nota nasce recebida e o cron não a procura de novo.
- `sgcEscAvisoInserir` (por id, R-023) — input `{ idCard, tipo, chave, paraUsuarioId, paraPersona, texto, criadoEm }`,
  idempotente por `CHAVE`. Esta spec grava `nf_atrasada` e `nf_recebida` com `paraUsuarioId: 0`
  e `paraPersona: ''`.
- `backend/sql/notificacoes-avisos.sql` — o ramo `SGC_AVISO` do feed `/notificacoes`, que é onde
  os dois avisos desta spec aparecem para o usuário (o integrador compõe, S4).
- `backend/lib/dias-uteis.mjs` — `somarDiasUteis(col, n)` e `somarDiasCorridos(col, n)`, com `n`
  podendo ser coluna (ver *Contratos*). `frontend/src/lib/dias-uteis.ts` **não** é usado por esta
  spec: nenhuma data é calculada na tela (D-003).
- `backend/sql/pendencias-transito.sql` — o `enviado>transito` exigir ≥ 1 nota é da 005; esta
  spec só depende de existir, e não o testa.
- `backend/sql/pendencias-conclusao-nf.sql` — a metade "validação de NF sem decisão" de C-019.

**Consome da 007 (produtos em B.O.):** `backend/sql/pendencias-conclusao-bo.sql` — a outra
metade de C-019/RN-013. O teste de conclusão só fica verde depois de a S4 compor os dois
fragmentos no `sgcPodeMover`.

**Consome da 001 (fornecedores):** `SGC_FORNECEDOR.PRAZO_ENTREGA_DIAS` / `PRAZO_ENTREGA_TIPO`
(fonte única da previsão) e `rotuloPrazoEntrega(dias, tipo)` de `frontend/src/lib/fornecedor.ts`.

**Consome da 002 (quadro):** `SGC_PEDIDO`, `SGC_FASE` (chaves `enviado`, `transito`,
`faturamento`), `sgcPodeMover` (o gancho que C-019 exercita), `lib/permissoes.ts` e o
`usePedido()` do `PedidoProvider` (persona e `podeEditar` já carregados).

**Consome da base (S2):** `frontend/src/lib/csv.ts` — `textoCsv(cabecalho, linhas)` e
`baixarCsv(nome, texto)`, compartilhados com a 005 (decisão 3 do 000); `lib/permissoes.ts` com
as chaves de R-028; o item de menu **Fiscal › NFs em atraso** no `AdminLayout`.

**Consome da lib 1.4.0:** `kbCardMover` com `movidoPor` (int) e `origem: 'sistema'`, válidos só
sem sessão (R-021); `kbNotaRegistrar` com `usuarioId`.

**Entrega:**

- `sgcRecebimentoSincronizar` — o único caminho que move Trânsito → Faturamento sozinho (R-031);
  é ele que coloca o pedido na fase que a 005 monitora para o faturamento pendente.
- `SGC_NF.DT_RECEBIMENTO` preenchido — quem quiser saber se a mercadoria chegou lê essa coluna,
  sem reconsultar o ERP.
- `AbaRecebimento` — `AbaExtra` pronta para o integrador ligar em `abasExtras` do `QuadroPage`
  (R-029), com `contagem` opcional = notas pendentes.
- `NfsAtrasoPage` + a rota `/nfs-em-atraso` e o item **Fiscal › NFs em atraso** do menu, que a
  base liga com a chave `verNfsAtraso`.
- Para `lib/permissoes.ts` (base, S2), os valores desta spec: `verNfsAtraso` = admin, analista,
  gestor, **diretoria** (lê), comercial não; `operarNf` (chave da 005) = admin, analista, gestor,
  zerada por `READ_ONLY` — é ela que governa "Verificar entrada" e "Sincronizar".
- `frontend/src/lib/recebimento.ts` — situação, faixa, resumo e CSV, se outra tela precisar.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | A previsão é **uma expressão SQL** composta pelas quatro leituras, nunca uma coluna | Gravar `DT_PREVISAO` em `SGC_NF` ao vincular | RF-004: mudar o prazo do fornecedor tem de corrigir todas as notas em aberto sem migração (C-021). Coluna de estado derivado desincroniza em silêncio — a mesma lição de D-014 da 004 |
| D-002 | "Sem prazo" é `PRAZO_ENTREGA_DIAS <= 0` **ou** fornecedor sem linha em `SGC_FORNECEDOR`, resolvido por `LEFT JOIN` | Exigir linha e tratar ausência como erro | A coluna é `NOT NULL DEFAULT 0` (001): zero já é a ausência. E há notas de fornecedor que ninguém parametrizou ainda — elas não podem quebrar a consulta nem virar atraso falso (RN-002) |
| D-003 | A tela **não** calcula data: recebe `DT_PREVISAO`, `SITUACAO` e `DIAS_ATRASO` prontos e só traduz | Espelhar o cálculo em `lib/recebimento.ts`, como a 002 faz com `transicoes.ts` | Espelho existe para a tela **desabilitar antes do clique** — aqui não há clique a desabilitar, só um número a mostrar. Duas implementações da mesma aritmética de dias úteis seria a dívida que R-025 foi criada para evitar |
| D-004 | Sem sessão, quem assina as escritas é o **primeiro responsável do pedido** (ou o criador), e a guarda de persona cai sobre ele | Um usuário técnico fixo, ou dispensar a guarda no cron | R-023/R-031 fixam o responsável; e é a única identidade que o histórico do card pode mostrar sem mentir. Dispensar a guarda repetiria o achado A1 da revisão da onda 1 |
| D-005 | Nenhuma escrita desta spec é chamada direto da tela: os dois botões passam pelo JS | `sgcEscNfRecebimento` guardada por `:VAR_USER` e chamada pela aba | Gravar recebimento exige antes consultar o ERP, casar filial e decidir se o pedido move: é orquestração, não um `UPDATE` que a pessoa pediu. A tela mandando gravar uma data que ela não apurou seria dado inventado |
| D-006 | O dia de referência (`hoje`) **entra por parâmetro** nas quatro leituras; `''` cai no dia do servidor | `CURDATE()` cravado no SQL | É o padrão já adotado na 004 (R-10/D-016): a tela decide no fuso do navegador, o cron no fuso de Brasília. Sem isso, a tela diria "em atraso" num dia e o cron noutro, na virada |
| D-007 | O lote de 30 é uma subconsulta de **pedidos** embrulhada em outra (`IN (SELECT … FROM (… LIMIT 30) L)`) | `LIMIT 30` nas notas | O MySQL recusa `IN (SELECT … LIMIT …)` sem a camada extra; e limitar por nota deixaria um pedido com metade das notas avaliada, que é exatamente o caso em que a decisão de mover é errada (RN-010) |
| D-008 | O seed desta spec insere as próprias linhas de `PCNFENT`, na faixa de `NUMNOTA` **90001–90015** | Pedir à 005 que semeie também as notas de trânsito | R-027 dá as entradas da detecção à 005, mas os cenários daqui (cancelada, duas filiais, sem entrada) não são cenários dela. Faixa reservada é a mesma solução de R-017 para fornecedores: dono único por linha, não por tabela. Aceito pelo 000 em 2026-09-15 |
| D-009 | A situação é `Status` (ponto + texto) com tons do design system | Porte do legado, que pintava cada situação com hex (`#dc2626`, `#ea580c`…) | Cor literal em componente é anti-padrão do `design.md` §14, e estado só por cor reprova por acessibilidade. Os cinco estados cabem nos quatro tons existentes |
| D-010 | Dias de atraso em dias **corridos**, mesmo quando o prazo é em dias úteis | Atraso em dias úteis para fornecedor com prazo em úteis | Prazo é promessa de quem entrega; atraso é o tempo em que a mercadoria não está aqui, e ele corre no sábado. Foi o comportamento do SGC anterior e é o que a negociação de prorrogação de título usa |
| D-011 | A aba consulta só quando é **aberta**, e não entra no `sgcPedidoCarregar` da 002 | Trazer as notas junto da capa, como itens e alertas | Abrir card já custa 3 execuções (D-01, dívida aberta). Notas só interessam da fase Enviado em diante; carregá-las sempre pagaria o custo em todo pedido em Análise. Trocar de aba não recarrega nada |
| D-012 | O CSV é montado na tela, a partir das linhas já carregadas, com `textoCsv`/`baixarCsv` de `lib/csv.ts` (base, S2) | Uma SF que devolva o CSV pronto, ou uma consulta sem paginação; ou cada tela escrever o seu escape | Exportar o que está na tela é o que o usuário espera, custa zero execução e mantém as colunas iguais às da tabela por construção. O escape de aspas e separador é idêntico ao da 005, então mora uma vez só (decisão 3 do 000) |
| D-013 | Uma SF (`sgcRecebimentoSincronizar`) serve ao cron e aos dois botões, com `cardId` decidindo o alcance | Uma SF para o cron e outra para a verificação sob demanda | É o desenho do legado e a única forma de garantir que o botão e o cron não divirjam; o `cardId` já neutraliza o lote de 30 |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `somarDiasUteis`/`somarDiasCorridos` (R-025) chegarem só com `n` literal, ou o shim `INTERVAL` do simulador não aceitar coluna | a previsão não compila no `sim:check` e nenhuma consulta desta spec roda | o contrato está escrito em *Contratos de backend* e em *Dependências*; a task T-001 é conferir a assinatura antes de escrever a primeira SQL, e o item do dialeto (`WEEKDAY`, `INTERVAL <expressão>`, `CAST AS CHAR`) está listado para a base |
| A plataforma propagar a sessão na chamada aninhada (D-04, dívida aberta) | `movidoPor`/`origem: 'sistema'` seriam ignorados: o pedido movido pelo botão apareceria como movido por quem clicou, e o movimento passaria pelo gancho `podeMover` | o efeito visível é só a autoria do movimento; `transito>faturamento` é par liberado para admin/analista/gestor, que são exatamente as personas que podem clicar. O cron continua sem sessão. Item da verificação no sandbox |
| Fornecedor com centenas de notas pendentes estourar `IN (…)` no Oracle (ORA-01795) | a consulta do fornecedor falha e as notas dele não atualizam | o JS fatia `numnotas` em 500 e soma os resultados — o mesmo teto da 003 |
| Duas notas do mesmo fornecedor com o mesmo `NUMNOTA` e séries diferentes | recebimento gravado na nota errada | o casamento usa `NUMNOTA` **e**, quando a nota já o tem, `NUMTRANSENT`; na falta dos dois, a filial do pedido desempata (RN-004). Registrado como limite conhecido: série não entra no `IN` porque o legado provou que ela vem vazia em parte das notas |
| O gancho `sgcPodeMover` ainda não ter os blocos de conclusão quando o smoke da 006 rodar | C-019 e RN-013 vermelhos numa branch que não tem culpa | os dois testes estão marcados como dependentes da S4 no mapa e no `tasks.md`; até lá ficam pendentes, não removidos |
| ERP fora do ar por uma janela inteira | notas ficam pendentes e alertam atraso sem ter atrasado de fato | nada é sobrescrito e a rodada seguinte corrige; o alerta é de **atraso da entrega**, que não depende do ERP estar no ar — a nota realmente não chegou |
| Fuso do cron lido como horário local em vez de UTC | a janela cobriria 3h–17h de Brasília e as entradas do fim da tarde só apareceriam no dia seguinte | a expressão é `0 25 9-23/2 * * *`, já convertida (decisão 1 do 000, 2026-09-15); o smoke não cobre agendamento, então a conferência é no sandbox, na primeira publicação |

## Pedidos ao 000 — respondidos (2026-09-15)

Os quatro pedidos desta spec foram aceitos pelo 000 e já estão aplicados acima. Ficam
registrados aqui porque mudam contrato de outras specs:

1. **Janela do cron.** `sgcRecebimentoSincronizar` passa de `0 25 6-20/2 * * *` para
   **`0 25 9-23/2 * * *`** — a tabela do 000 diz que os crons são em UTC, e 6h–20h UTC seria
   3h–17h de Brasília, não o horário comercial que a regra herdada pede. Os outros dois crons da
   onda (`0 0 11 * * *` e `0 5 11 * * *` = 8h de Brasília) confirmam a leitura em UTC.
2. **Linhas `PC*` por spec**, com faixa de `NUMNOTA` reservada: 005 abaixo de 90000, 006 em
   90001–90015, 007 não semeia nota fiscal. O DDL das `PC*` continua do integrador (R-027);
   o R-017 passa a valer por **linha**, não por tabela.
3. **`frontend/src/lib/csv.ts` na base (S2)**, como `dias-uteis.ts`:
   `textoCsv(cabecalho: string[], linhas: (string | number)[][]): string` e
   `baixarCsv(nome: string, texto: string): void`. A 005 (`/faturamentos-pendentes`) e a 006
   (`/nfs-em-atraso`) exportam com a mesma mecânica; cada tela só decide as colunas.
4. **Permissões**: `operarNf` (R-028) governa também "Verificar entrada no WinThor" e
   "Sincronizar com o WinThor"; `verNfsAtraso` inclui a **diretoria** como leitura.

Assinaturas que esta spec assumiu e o 000 repassou à 005:
`sgcEscAvisoInserir { idCard, tipo, chave, paraUsuarioId, paraPersona, texto, criadoEm }`;
`somarDiasUteis(col, n)` / `somarDiasCorridos(col, n)` com `n` literal **ou** coluna;
`DT_RECEBIMENTO = DT_ENTRADA` na vinculação de nota que já entrou no ERP.

## Complexity Tracking

Vazio: nenhuma violação de princípio.
