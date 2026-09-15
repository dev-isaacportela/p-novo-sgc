# Plan: Notas fiscais e faturamento — detecção, conferência e cobrança

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; cenários vindos de O2-01, O2-02, O2-03, O2-07 de `regras.md` e das decisões R-023, R-025, R-030, R-032, R-033 do 000 |
| Backend escrito local, executado no sandbox | sim | arquivo novo `backend/add-008-notas-fiscais.mjs` (R-024); as seis tabelas e as seis colunas de `SGC_PEDIDO` entram no `setup-backend.mjs` **pelo integrador** (arquivo compartilhado, R-026); nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL vive no `setup-backend.mjs` (no `CREATE`, sem `ALTER` — a onda 2 ainda não publicou) e a migration é gerada pelo sandbox |
| Leitura e escrita por Server Function | sim | nenhum `listRecords`/`patchRecord`: a aba e as duas telas usam `linhas()`/`acao()` de `src/lib/mitra-api.ts`; escrita de tela é SF SQL guardada por `:VAR_USER`, escrita de JS/cron é SF SQL por id com `{{usuarioId}}` e a guarda única (R-013) |
| Simulador cobre a feature | sim | `simulator/seed/005-notas-fiscais.mjs` só insere linhas (NFs de entrada, itens, duplicatas, pedidos enviados, contatos); o DDL das `PC*` novas é do integrador (R-027); `sim:check` roda as 9 SQL de leitura |
| Testes automatizados obrigatórios | sim | 28 cenários e 15 regras mapeados em `backend/simulator/smoke/005-notas-fiscais.mjs` e em `frontend/tests/{dias-uteis,nf,faturamento}.test.mjs` |
| Design tokens, sem cor literal | sim | `Panel`, `Toolbar`, `Table`, `Status`, `Code`, `Dash`, `Badge`, `Dialog` de `page.tsx`; `DatePicker` da 004 no campo de previsão; zero hex, zero `style={{}}`, zero classe Tailwind solta |
| Simplicidade | sim | nenhuma dependência nova; a regra de conferência é função pura em `src/lib/nf.ts`; a comparação de prazo **reusa** `lib/prazo-pagamento.ts` da 003 (R-015), não reimplementa; uma SF por aba (RNF-001) |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`; leitura do WinThor por JDBC Oracle (`jdbcId` resolvido por nome no `isEntrypoint()`)
- **Reuso identificado:** `@benenutri/mitra-kanban` 1.4.0 (`abasExtras`, `ExtensaoContexto`, `kbNotaRegistrar`, `kbCardAtualizar` — com `atualizadoPor`/`origem: 'sistema'` no caminho sem sessão, R-042); `page.tsx` (`Panel`, `PanelHeader`, `Toolbar`, `SearchInput`, `SelectMenu`, `Table`/`Th`/`Td` com `numeric`, `RowTitle`, `RowMeta`, `Status`, `Badge`, `Code`, `Dash`, `Alert`, `EmptyState`, `Pagination`, `Dialog`, `Field`); `lib/formato.ts`; `lib/prazo-pagamento.ts` (003) para as parcelas; `abas/capa-do-quadro.ts` (003) para o espelho do cartão; `sgcEscComunicacaoInserir` (002) para registrar a cobrança; `DatePicker` (004)
- **Dependência nova:** nenhuma

## Modelo de dados

As seis tabelas do R-026 e as seis colunas novas de `SGC_PEDIDO`, todas no `setup-backend.mjs`
(arquivo do integrador), **no `CREATE`**, sem `ALTER` — nada foi publicado ainda. Convenções do
000: colunas em UPPERCASE, datas em `VARCHAR(10)`/`VARCHAR(19)`, dinheiro `DECIMAL(15,2)`, sem
`FOREIGN KEY`, `ID` autoincremento.

### `SGC_NF` (N:1 `KB_CARD`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_CARD` | `INT NOT NULL` | pedido dono da nota |
| `NUMNOTA` | `INT NOT NULL` | |
| `SERIE` | `VARCHAR(10)` | `''` quando a nota não tem |
| `CHAVENFE` | `VARCHAR(50)` | pode vir vazia (nota sem XML) — não é chave de nada aqui |
| `NUMTRANSENT` | `INT` | transação da entrada no WinThor; é por ela que a 006 confirma o recebimento |
| `CODFORNEC` | `INT` | |
| `CODFILIAL` | `VARCHAR(10)` | |
| `DT_EMISSAO` | `VARCHAR(10)` | data do faturamento (base da previsão da 006) |
| `DT_ENTRADA` | `VARCHAR(10)` | `PCNFENT.DTENT` no momento do vínculo; `''` na nota ainda não entrada |
| `DT_RECEBIMENTO` | `VARCHAR(10)` | 006; **nasce igual a `DT_ENTRADA`** |
| `VL_TOTAL` | `DECIMAL(15,2)` | |
| `PRAZO_PARCELAS` | `VARCHAR(120)` | `"28/35/42"`, normalizado por `textoDeParcelas` (003) |
| `ORIGEM` | `VARCHAR(20)` | `automatica` \| `hibrida` \| `manual` |
| `ALERTA_ATRASO_EM` | `VARCHAR(19)` | 006 |
| `VINCULADO_POR` | `INT` | |
| `VINCULADO_EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_SGC_NF (ID_CARD, NUMNOTA, SERIE)`; `INDEX IX_SGC_NF_CARD (ID_CARD)`;
`INDEX IX_SGC_NF_NOTA (CODFORNEC, NUMNOTA)` — é por este último que a detecção descarta em
uma consulta o que já está vinculado em qualquer card (RN-010).

### `SGC_NF_ITEM` (N:1 `SGC_NF`)

`ID`, `ID_NF INT`, `ID_CARD INT`, `CODPROD INT`, `CODFAB VARCHAR(60)`, `EAN VARCHAR(20)`,
`DESCRICAO VARCHAR(200)`, `QT_FATURADA DECIMAL(15,3)`, `PRECO_FATURADO DECIMAL(15,4)`,
`NUMLOTE VARCHAR(30)`, `DT_VALIDADE VARCHAR(10)`, `CASADO_POR VARCHAR(10)`
(`codprod` \| `codfab` \| `ean` \| `nenhum`).
`UNIQUE KEY UK_SGC_NF_ITEM (ID_NF, CODPROD, NUMLOTE)`, `INDEX IX_SGC_NF_ITEM_CARD (ID_CARD)`.

### `SGC_NF_OCORRENCIA` (N:1 `SGC_NF`)

`ID`, `ID_NF INT`, `ID_CARD INT`, `CODPROD INT` (0 = regra de pedido),
`TIPO VARCHAR(30)` (`item_nao_pedido`, `validade_curta`, `preco_divergente`, `qtd_maior`,
`prazo_divergente`, `valor_total_divergente`, `percentual_faturado`),
`RESULTADO VARCHAR(20)` (`conforme` \| `atencao` \| `divergente`),
`VALOR_ESPERADO VARCHAR(100)`, `VALOR_ENCONTRADO VARCHAR(100)`, `DELTA_PERC DECIMAL(9,4)`,
`DECISAO VARCHAR(20) DEFAULT 'pendente'` (`pendente` \| `aceito` \| `recusado`),
`JUSTIFICATIVA VARCHAR(500)`, `DECIDIDO_POR INT`, `DECIDIDO_EM VARCHAR(19)`, `CRIADO_EM VARCHAR(19)`.
`INDEX IX_SGC_NF_OCORRENCIA_CARD (ID_CARD, DECISAO)`, `INDEX IX_SGC_NF_OCORRENCIA_NF (ID_NF)`.

**Sem coluna de texto:** a frase da ocorrência é montada na tela por `textoDaOcorrencia()`
(`lib/nf.ts`) a partir de `TIPO`, `RESULTADO`, `VALOR_ESPERADO`, `VALOR_ENCONTRADO` e
`DELTA_PERC`. Texto é apresentação; guardá-lo duplicaria a regra e envelheceria no banco (D-006).

### `SGC_NF_SUGESTAO`

`ID`, `CHAVENFE VARCHAR(50)`, `NUMTRANSENT INT`, `NUMNOTA INT`, `SERIE VARCHAR(10)`,
`CODFORNEC INT`, `CODFILIAL VARCHAR(10)`, `VL_TOTAL DECIMAL(15,2)`, `DT_EMISSAO VARCHAR(10)`,
`DT_ENTRADA VARCHAR(10)`, `ID_CARD INT`, `NUMPED_WINTHOR VARCHAR(30)`,
`ORIGEM VARCHAR(20)` (`pedido` \| `heuristica`), `SCORE INT`,
`STATUS VARCHAR(20) DEFAULT 'sugerida'` (`sugerida` \| `validada` \| `recusada` \| `ignorada`),
`MOTIVO VARCHAR(400)`, `DECIDIDO_POR INT`, `DECIDIDO_EM VARCHAR(19)`, `CRIADO_EM VARCHAR(19)`.
`UNIQUE KEY UK_SGC_NF_SUGESTAO (ID_CARD, CODFORNEC, NUMNOTA, SERIE)` — **uma só** (R-043): a
`UNIQUE (CHAVENFE, ID_CARD)` do rascunho do 000 saiu, porque `CHAVENFE` vem vazia em nota sem XML
e duas notas assim colidiriam entre si no mesmo card. `INDEX IX_SGC_NF_SUGESTAO_STATUS (STATUS, SCORE)`.

### `SGC_CONTATO_FATURAMENTO` (N:1 `KB_CARD`)

`ID`, `ID_CARD INT`, `DT_CONTATO VARCHAR(19)`, `CANAL VARCHAR(20)`
(`email` \| `telefone` \| `whatsapp` \| `portal`), `RESUMO VARCHAR(1000)`,
`PREVISAO_FATURAMENTO VARCHAR(10)`, `REGISTRADO_POR INT`, `CRIADO_EM VARCHAR(19)`.
`INDEX IX_SGC_CONTATO_CARD (ID_CARD, ID)`.

### `SGC_AVISO` (compartilhada — 005, 006 e 007 gravam; R-023)

`ID`, `ID_CARD INT`, `TIPO VARCHAR(30)`, `CHAVE VARCHAR(120) NOT NULL`,
`PARA_USUARIO_ID INT DEFAULT 0` (0 = responsáveis do card), `PARA_PERSONA VARCHAR(20)`
(`''` ou `gestor`), `TEXTO VARCHAR(500)`, `CRIADO_EM VARCHAR(19)`.
`UNIQUE KEY UK_SGC_AVISO (CHAVE)`, `INDEX IX_SGC_AVISO_CARD (ID_CARD, ID)`.

`CHAVE` é `tipo:card:AAAA-MM-DD[:nf|:persona]` — é ela, e só ela, que impede dois avisos iguais no mesmo
dia (RN-009) e que faz da escrita a exceção sem guarda de persona do R-023.
Tipos gravados por esta spec: `nf_sugerida`, `faturamento_3`, `faturamento_5`,
`faturamento_diario`. Os outros (`nf_atrasada`, `nf_recebida`, `bo_previsao`) são da 006 e da 007.

As chaves escritas aqui, uma por linha, para não haver dúvida no nível 5 — onde o cron grava
**dois** avisos no mesmo dia para o mesmo card e as chaves colidiriam sem o sufixo:

| Aviso | `CHAVE` |
|---|---|
| sugestão nova no card | `nf_sugerida:<card>:<AAAA-MM-DD>` |
| 3 dias úteis, aos responsáveis | `faturamento_3:<card>:<AAAA-MM-DD>` |
| 5 dias úteis, aos responsáveis | `faturamento_5:<card>:<AAAA-MM-DD>` |
| 5 dias úteis, à persona gestor | `faturamento_5:<card>:<AAAA-MM-DD>:gestor` |
| acima de 5, aos responsáveis | `faturamento_diario:<card>:<AAAA-MM-DD>` |

### Colunas novas em `SGC_PEDIDO` (R-026, no `CREATE`)

`DT_PRIMEIRO_FATURAMENTO VARCHAR(10)`, `VL_FATURADO DECIMAL(15,2) DEFAULT 0`,
`PERC_FATURADO_VALOR DECIMAL(9,4) DEFAULT 0`, `PERC_FATURADO_QTD DECIMAL(9,4) DEFAULT 0`,
`ALERTA_FATURAMENTO_NIVEL INT DEFAULT 0` (0 \| 3 \| 5), `ALERTA_FATURAMENTO_EM VARCHAR(19)`.

### Só leitura, de outras specs

`SGC_PEDIDO` (002): `ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`, `VL_TOTAL`,
`PRAZO_ACORDADO`, `DT_ENVIO`, `NUMPED_WINTHOR`, `EMAIL_ENVIO`, `CRIADO_POR`.
`SGC_PEDIDO_ITEM` (003): `CODPROD`, `DESCRICAO`, `QT_PEDIDA`, `PRECO_CUSTO`, `STATUS`.
`SGC_FORNECEDOR` (001): `VALIDADE_MINIMA_DIAS` (RN-005) e, pela 001, os contatos de envio
(`SGC_FORNECEDOR_LINHA_CONTATO`) que alimentam a cobrança.
`SGC_FASE` (002) dá as chaves `enviado`, `transito`, `faturamento`, `bo`, `concluido`.
`SGC_PEDIDO.DT_PREVISAO_BO` e `SGC_BO_ITEM.STATUS` (007): as duas colunas de B.O. que a lista de
faturamentos pendentes mostra no lugar do aviso (R-041).
`KB_CARD` / `KB_CARD_RESPONSAVEL` (lib): título, fase, responsáveis e a capa do cartão.

## Contratos de backend

Tudo em `backend/add-008-notas-fiscais.mjs`, que exporta `definitions`. Ids locais **7501–7515**
(leitura e JS) e **7550–7559** (escrita), faixa 75xx do R-024. Filtro desligado é `''` no texto e
`0` no número; `dataEnvio` desligada é `'1900-01-01'` (nunca `''`: quebraria o `TO_DATE`).

### Leituras — WinThor (Oracle, `jdbcId` resolvido por nome)

| Nome | Tipo | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|---|
| `sgcWintNfEntradas` | SQL (Oracle) | `codfornec` (0), `codfilial` (''), `dataEnvio` ('1900-01-01'), `numpeds` ('0') | uma linha **por item** de NF candidata: `NUMTRANSENT, NUMNOTA, SERIE, CHAVENFE, CODFORNEC, CODFILIAL, DT_EMISSAO, DT_ENTRADA, VL_TOTAL, PRAZO, NUMPED, CODPROD, CODFAB, EAN, QT, PUNIT` | RF-001, RF-002, RF-003 |
| `sgcWintNfItens` | SQL (Oracle) | `numnota` (0), `serie` (''), `codfornec` (0) | `CODPROD, DESCRICAO, CODFAB, EAN, QT, PUNIT, NUMLOTE, DT_VALIDADE, DT_EMISSAO_NF, DT_ENTRADA, NUMTRANSENT, SERIE, CHAVENFE, VL_TOTAL, PRAZO` | RF-006, RF-007 |
| `sgcWintNfParcelas` | SQL (Oracle) | `numnota` (0), `codfornec` (0) | `DUPLIC, DT_EMISSAO, DT_VENC, VALOR, DIAS` | RF-009 (prazo) |
| `sgcWintNfBuscar` | SQL (Oracle) | `numnota` (0), `codfornec` (0) | cabeçalho: `NUMTRANSENT, NUMNOTA, SERIE, CHAVENFE, CODFORNEC, CODFILIAL, VL_TOTAL, PRAZO, DT_EMISSAO, DT_ENTRADA` (máx. 5) | RF-005 (O2-07) |

**`sgcWintNfEntradas`** — as duas origens numa consulta só: a nota emitida contra um dos pedidos
da lista entra mesmo se for anterior ao envio; as demais entram pela janela de emissão. Uma
chamada por **fornecedor + filial** (RNF-002), nunca por card; a cobertura por card é calculada
no JS a partir das linhas de item.

```sql
SELECT * FROM (
  SELECT N.NUMTRANSENT, N.NUMNOTA, NVL(N.SERIE, '') AS SERIE, NVL(N.CHAVENFE, '') AS CHAVENFE,
         N.CODFORNEC, N.CODFILIAL,
         TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
         TO_CHAR(N.DTENT, 'YYYY-MM-DD')     AS DT_ENTRADA,
         NVL(N.VLTOTAL, 0) AS VL_TOTAL, NVL(N.PRAZO, 0) AS PRAZO,
         NVL(M.NUMPED, 0) AS NUMPED, M.CODPROD,
         NVL(TRIM(P.CODFAB), '') AS CODFAB, NVL(TRIM(P.CODAUXILIAR), '') AS EAN,
         NVL(M.QT, 0) AS QT, NVL(M.PUNIT, 0) AS PUNIT
  FROM PCNFENT N
  JOIN PCMOV M ON M.NUMTRANSENT = N.NUMTRANSENT AND M.CODOPER = 'E'
  LEFT JOIN PCPRODUT P ON P.CODPROD = M.CODPROD
  WHERE N.CODFORNEC = {{codfornec}}
    AND N.CODFILIAL = '{{codfilial}}'
    AND N.ESPECIE = 'NF'
    AND N.DTCANCEL IS NULL
    AND ( N.DTEMISSAO >= TO_DATE('{{dataEnvio}}', 'YYYY-MM-DD')
          OR NVL(M.NUMPED, 0) IN ({{numpeds}}) )
  ORDER BY N.DTEMISSAO DESC, N.NUMNOTA, M.CODPROD
) WHERE ROWNUM <= 2000
```

`DTCANCEL IS NULL` é RN-015 e vale nas quatro consultas. `ESPECIE = 'NF'` deixa de fora
devolução, bonificação e remessa (fora de escopo).

**`sgcWintNfItens`** — os itens de UMA nota, com lote, validade e os códigos alternativos. O EAN
vem de `PCPRODUT.CODAUXILIAR` (R-027 tirou `PCDADOSXML` do escopo).

```sql
SELECT M.CODPROD, NVL(P.DESCRICAO, '') AS DESCRICAO,
  NVL(TRIM(P.CODFAB), '') AS CODFAB, NVL(TRIM(P.CODAUXILIAR), '') AS EAN,
  NVL(M.QT, 0) AS QT, NVL(M.PUNIT, 0) AS PUNIT, NVL(M.NUMLOTE, '') AS NUMLOTE,
  TO_CHAR(M.DATAVALIDADE, 'YYYY-MM-DD') AS DT_VALIDADE,
  TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD')    AS DT_EMISSAO_NF,
  TO_CHAR(N.DTENT, 'YYYY-MM-DD')        AS DT_ENTRADA,
  N.NUMTRANSENT, NVL(N.SERIE, '') AS SERIE, NVL(N.CHAVENFE, '') AS CHAVENFE,
  NVL(N.VLTOTAL, 0) AS VL_TOTAL, NVL(N.PRAZO, 0) AS PRAZO
FROM PCMOV M
JOIN PCNFENT N ON N.NUMTRANSENT = M.NUMTRANSENT AND N.DTCANCEL IS NULL
LEFT JOIN PCPRODUT P ON P.CODPROD = M.CODPROD
WHERE M.CODOPER = 'E' AND N.NUMNOTA = {{numnota}} AND N.CODFORNEC = {{codfornec}}
  AND ('{{serie}}' = '' OR N.SERIE = '{{serie}}')
ORDER BY M.CODPROD
```

**`sgcWintNfParcelas`** — o prazo real da nota são as duplicatas (`PCNFENT.PRAZO` está nulo em
boa parte das notas; por isso é só o plano B, lido do cabeçalho que `sgcWintNfItens` já trouxe):

```sql
SELECT NVL(L.DUPLIC, '') AS DUPLIC,
  TO_CHAR(L.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
  TO_CHAR(L.DTVENC, 'YYYY-MM-DD')    AS DT_VENC,
  NVL(L.VALOR, 0) AS VALOR,
  TRUNC(L.DTVENC - L.DTEMISSAO) AS DIAS
FROM PCLANC L
WHERE L.NUMNOTA = {{numnota}} AND L.CODFORNEC = {{codfornec}}
ORDER BY L.DTVENC
```

**`sgcWintNfBuscar`** — o registro híbrido (O2-07): acha a nota **sem exigir entrada**.

```sql
SELECT * FROM (
  SELECT N.NUMTRANSENT, N.NUMNOTA, NVL(N.SERIE, '') AS SERIE, NVL(N.CHAVENFE, '') AS CHAVENFE,
    N.CODFORNEC, N.CODFILIAL, NVL(N.VLTOTAL, 0) AS VL_TOTAL, NVL(N.PRAZO, 0) AS PRAZO,
    TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
    TO_CHAR(N.DTENT, 'YYYY-MM-DD')     AS DT_ENTRADA
  FROM PCNFENT N
  WHERE N.NUMNOTA = {{numnota}} AND N.CODFORNEC = {{codfornec}} AND N.DTCANCEL IS NULL
  ORDER BY N.DTEMISSAO DESC
) WHERE ROWNUM <= 5
```

### Dias úteis — `backend/lib/dias-uteis.mjs` (R-025)

Assinatura desta spec, implementada pela base (S2) e consumida pela 006 sem reimplementar
(alinhada com o plan da 006). O arquivo exporta **três fragmentos SQL** — MySQL, e o mesmo texto
roda no dialeto do simulador — e os gêmeos em JavaScript, que o seed e os crons usam.

```js
const EPOCH_SEGUNDA = '1970-01-05';   // uma segunda-feira

// dias úteis decorridos do epoch até a data, inclusive
const acumulado = (col) => `(5 * FLOOR((DATEDIFF(${col}, '${EPOCH_SEGUNDA}') + 1) / 7)
  + LEAST(MOD(DATEDIFF(${col}, '${EPOCH_SEGUNDA}') + 1, 7), 5))`;

// contagem (005): dias úteis entre duas datas
export const diasUteisEntre = (colInicio, colFim) => `(${acumulado(colFim)} - ${acumulado(colInicio)})`;

// previsão (006) e datas do seed: `n` pode ser literal OU nome de coluna
export const somarDiasUteis = (col, n) => `DATE_FORMAT(DATE_ADD('${EPOCH_SEGUNDA}', INTERVAL (
  7 * FLOOR((${acumulado(col)} + (${n}) - 1) / 5) + MOD(${acumulado(col)} + (${n}) - 1, 5)
) DAY), '%Y-%m-%d')`;

export const somarDiasCorridos = (col, n) =>
  `DATE_FORMAT(DATE_ADD(${col}, INTERVAL (${n}) DAY), '%Y-%m-%d')`;

// gêmeos puros, para o seed e para quem calcula em JS
export function diasUteisEntreDatas(inicioIso, fimIso) { /* mesmo cálculo */ }
export function somarDiasUteisData(iso, n) { /* idem */ }
export function somarDiasCorridosData(iso, n) { /* idem */ }
```

Contrato dos três fragmentos (o que a 006 pode assumir):

- `n` entra sempre entre parênteses, então vale tanto `15` quanto `F.PRAZO_ENTREGA_DIAS` — é
  assim que a 006 soma o prazo do fornecedor sem montar SQL própria;
- **base em fim de semana recua para sexta**: `acumulado` de sábado e de domingo é o mesmo de
  sexta, logo `somarDiasUteis('<sábado>', 1)` e `somarDiasUteis('<sexta>', 1)` dão a mesma
  segunda-feira;
- `somarDiasUteis(col, 0)` devolve o próprio dia quando ele é útil e a sexta anterior quando não é;
- `somarDiasCorridos` não olha o dia da semana: é `+ n` dias, para o prazo cadastrado como
  `corridos` em `SGC_FORNECEDOR.PRAZO_ENTREGA_TIPO`;
- os três devolvem `VARCHAR(10)` (`AAAA-MM-DD`), comparável direto com as colunas de data do SGC.

Por que assim e não pela tabela de lookup do legado (`MID('01234444…')` + `WEEKDAY`): a fórmula
acima usa só `DATEDIFF`, `FLOOR`, `MOD` e `LEAST` — quatro funções que existem em MySQL e são
baratas de imitar no simulador —, enquanto `WEEKDAY` e `MID` teriam de virar shim novo e a
string mágica de 40 caracteres não se lê. Semântica: conta o dia de chegada e **não** o de
partida (segunda→sábado = 4, sexta→segunda = 1, mesmo dia = 0), que é a de "dias úteis desde o
envio". Conferência do R-025: `somarDiasUteis('2026-08-24', 15)` → `2026-09-14`;
`diasUteisEntre('2026-08-24', '2026-09-14')` → 15.

### Leituras — banco interno (SQL)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `sgcNfSugestoesListar` | `status` (''), `codfornec` (0), `busca` (''), `hoje` (''), `limite` (50), `offset` (0) | `ID, ID_CARD, CARD_TITULO, FASE, FORNECEDOR, FILIAL, VL_PEDIDO, NUMNOTA, SERIE, CHAVENFE, NUMTRANSENT, DT_EMISSAO, DT_ENTRADA, VL_TOTAL, ORIGEM, SCORE, STATUS, MOTIVO, NUMPED_WINTHOR, DECIDIDO_POR, DECIDIDO_NOME, DECIDIDO_EM, CRIADO_EM` | RF-024 |
| `sgcNfSugestoesListarTotal` | os mesmos filtros | `TOTAL` | RF-024, RNF-005 |
| `sgcFaturamentoPendenteListar` | `faixa` (''), `busca` (''), `hoje` (''), `limite` (50), `offset` (0) | `ID_CARD, TITULO, FASE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, NUMPED, DT_ENVIO, EMAIL_ENVIO, VL_TOTAL, VL_FATURADO, PERC_VALOR, PERC_QTD, DT_PRIMEIRO_FATURAMENTO, ALERTA_NIVEL, DIAS_UTEIS, QT_CONTATOS, DT_ULTIMO_CONTATO, ULTIMO_CONTATO_POR, DT_PREVISAO_BO, QT_BO_ABERTO` | RF-025, C-028 |
| `sgcFaturamentoPendenteListarTotal` | os mesmos filtros | `TOTAL` | RF-025, RNF-005 |
| `sgcContatosListar` | `cardId` (0), `limite` (50), `offset` (0) | `ID, DT_CONTATO, CANAL, RESUMO, PREVISAO_FATURAMENTO, REGISTRADO_POR, REGISTRADO_NOME` | RF-022 |

**`sgcNfSugestoesListar`** — a sugestão some da fila quando a nota já foi vinculada em qualquer
card (RN-010), sem precisar de rotina de limpeza; o filtro só vale para o que ainda está
`sugerida`, para a auditoria do que foi validado/recusado continuar legível. `hoje` entra como em
`sgcFaturamentoPendenteListar` (G-5), no recorte "sugerida hoje" que a tela usa no rótulo do dia:
`COALESCE(NULLIF('{{hoje}}', ''), CURDATE())`.

```sql
SELECT S.ID, S.ID_CARD, C.TITULO AS CARD_TITULO, COALESCE(F.CHAVE, '') AS FASE,
  COALESCE(P.FORNECEDOR, '') AS FORNECEDOR, COALESCE(P.FILIAL, '') AS FILIAL,
  COALESCE(P.VL_TOTAL, 0) AS VL_PEDIDO,
  S.NUMNOTA, S.SERIE, S.CHAVENFE, S.NUMTRANSENT, S.DT_EMISSAO, S.DT_ENTRADA, S.VL_TOTAL,
  S.ORIGEM, S.SCORE, S.STATUS, COALESCE(S.MOTIVO, '') AS MOTIVO,
  COALESCE(S.NUMPED_WINTHOR, '') AS NUMPED_WINTHOR,
  COALESCE(S.DECIDIDO_POR, 0) AS DECIDIDO_POR, COALESCE(IU.NOME, '') AS DECIDIDO_NOME,
  COALESCE(S.DECIDIDO_EM, '') AS DECIDIDO_EM, S.CRIADO_EM
FROM SGC_NF_SUGESTAO S
JOIN KB_CARD C ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = S.ID_CARD
LEFT JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
LEFT JOIN INT_USER IU ON IU.ID = S.DECIDIDO_POR
WHERE ('{{status}}' = '' OR S.STATUS = '{{status}}')
  AND ({{codfornec}} = 0 OR S.CODFORNEC = {{codfornec}})
  AND ('{{busca}}' = '' OR CONCAT(S.NUMNOTA, '') LIKE CONCAT('%', '{{busca}}', '%')
       OR COALESCE(P.FORNECEDOR, '') LIKE CONCAT('%', '{{busca}}', '%')
       OR C.TITULO LIKE CONCAT('%', '{{busca}}', '%'))
  AND (S.STATUS <> 'sugerida' OR NOT EXISTS (
        SELECT 1 FROM SGC_NF NV
        WHERE NV.CODFORNEC = S.CODFORNEC AND NV.NUMNOTA = S.NUMNOTA
          AND COALESCE(NV.SERIE, '') = COALESCE(S.SERIE, '')))
ORDER BY S.SCORE DESC, S.CRIADO_EM DESC, S.ID DESC
LIMIT {{limite}} OFFSET {{offset}}
```

A coluna `DE_HOJE` (`CASE WHEN SUBSTR(S.CRIADO_EM, 1, 10) = COALESCE(NULLIF('{{hoje}}', ''), CURDATE())
THEN 1 ELSE 0 END`) acompanha cada linha: é o que a tela usa para marcar "sugerida hoje" sem fazer
conta de data no navegador, e é o que torna o teste determinístico (G-5).

**`sgcFaturamentoPendenteListar`** — `<DIAS>` é
`diasUteisEntre('P.DT_ENVIO', "COALESCE(NULLIF('{{hoje}}', ''), CURDATE())")` do
`backend/lib/dias-uteis.mjs`: em produção a tela manda `hoje: ''` e vale o relógio do banco; no
smoke o teste passa a data e a contagem fica determinística (G-5). As faixas do R-025 não se
sobrepõem, então o total da tela é a soma dos filtros mais os pedidos com menos de 3 dias úteis:

```sql
SELECT C.ID AS ID_CARD, C.TITULO, F.CHAVE AS FASE,
  P.CODFORNEC, P.FORNECEDOR, P.CODFILIAL, P.FILIAL,
  COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED, P.DT_ENVIO,
  COALESCE(P.EMAIL_ENVIO, '') AS EMAIL_ENVIO,
  COALESCE(P.VL_TOTAL, 0) AS VL_TOTAL, COALESCE(P.VL_FATURADO, 0) AS VL_FATURADO,
  COALESCE(P.PERC_FATURADO_VALOR, 0) AS PERC_VALOR, COALESCE(P.PERC_FATURADO_QTD, 0) AS PERC_QTD,
  COALESCE(P.DT_PRIMEIRO_FATURAMENTO, '') AS DT_PRIMEIRO_FATURAMENTO,
  COALESCE(P.ALERTA_FATURAMENTO_NIVEL, 0) AS ALERTA_NIVEL,
  <DIAS> AS DIAS_UTEIS,
  (SELECT COUNT(*) FROM SGC_CONTATO_FATURAMENTO K WHERE K.ID_CARD = C.ID) AS QT_CONTATOS,
  COALESCE((SELECT MAX(K.DT_CONTATO) FROM SGC_CONTATO_FATURAMENTO K WHERE K.ID_CARD = C.ID), '') AS DT_ULTIMO_CONTATO,
  COALESCE((SELECT MAX(IU.NOME) FROM SGC_CONTATO_FATURAMENTO K LEFT JOIN INT_USER IU ON IU.ID = K.REGISTRADO_POR
            WHERE K.ID_CARD = C.ID AND K.DT_CONTATO = (SELECT MAX(K2.DT_CONTATO) FROM SGC_CONTATO_FATURAMENTO K2 WHERE K2.ID_CARD = C.ID)), '') AS ULTIMO_CONTATO_POR,
  COALESCE(P.DT_PREVISAO_BO, '') AS DT_PREVISAO_BO,
  (SELECT COUNT(*) FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto') AS QT_BO_ABERTO
FROM KB_CARD C
JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
WHERE C.EXCLUIDO_EM IS NULL
  AND F.CHAVE IN ('enviado', 'transito', 'faturamento', 'bo')
  AND COALESCE(P.DT_ENVIO, '') <> ''
  AND COALESCE(P.PERC_FATURADO_VALOR, 0) < 100
  AND ('{{busca}}' = '' OR P.FORNECEDOR LIKE CONCAT('%', '{{busca}}', '%')
       OR C.TITULO LIKE CONCAT('%', '{{busca}}', '%')
       OR COALESCE(P.NUMPED_WINTHOR, '') = '{{busca}}')
  AND ('{{faixa}}' = ''
       OR ('{{faixa}}' = 'sem_contato' AND NOT EXISTS (SELECT 1 FROM SGC_CONTATO_FATURAMENTO K WHERE K.ID_CARD = C.ID))
       OR ('{{faixa}}' = '3'     AND <DIAS> BETWEEN 3 AND 4)
       OR ('{{faixa}}' = '5'     AND <DIAS> = 5)
       OR ('{{faixa}}' = 'mais5' AND <DIAS> > 5))
ORDER BY <DIAS> DESC, C.ID
LIMIT {{limite}} OFFSET {{offset}}
```

As fases **listadas** são quatro (`enviado`, `transito`, `faturamento`, `bo`), não as duas do
legado: no SGC 2 o card entra em Faturamento assim que 100 % das notas são **recebidas** (R-031 da
006), o que não quer dizer 100 % **faturado**; e o pedido que foi para B.O. continua com saldo a
faturar (D-004). As **avisadas** pelo cron são só as três primeiras — o pedido em B.O. tem o aviso
diário da 007 e não pode receber dois no mesmo dia (R-041, D-014). Por isso a listagem traz
`DT_PREVISAO_BO` e `QT_BO_ABERTO`: é o que a tela mostra no lugar do aviso.

### JavaScript (orquestração e crons)

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `sgcNfListar` | JAVASCRIPT | `cardId` | `{ ok, pedido, sugestoes, nfs, itens, ocorrencias, contatos }` | RNF-001 |
| `sgcNfDetectar` | JAVASCRIPT, cron `0 */30 * * * *` | — | `{ ok, cards, grupos, sugestoes, erros }` | RF-001..RF-004 |
| `sgcNfVincular` | JAVASCRIPT | `cardId`, `idSugestao` (0), `numnota`, `serie`, `codfornec`, `codfilial`, `origem`, `itensJson` ('') | `{ ok, erro?, idNf, itens, ocorrencias: { conforme, atencao, divergente }, percValor, percQtd }` | RF-005..RF-013, RF-016 |
| `sgcOcorrenciaDecidir` | JAVASCRIPT | `cardId`, `idOcorrencia` (0), `modo` (`individual`\|`conformes`), `decisao`, `justificativa` ('') | `{ ok, erro?, decididas, pendentes }` | RF-011, RF-012 |
| `sgcFaturamentoMonitorar` | JAVASCRIPT, cron `0 2 11 * * *` | — | `{ ok, pendentes, avisos, encerrados, erros }` | RF-018..RF-021 |
| `sgcCobrancaEnviar` | JAVASCRIPT | `cardId`, `para`, `assunto`, `corpo` | `{ ok, erro?, destinatarios, comunicacaoId }` | RF-023 |

As seis usam o mesmo preâmbulo do `add-005` (`query`, `escrever`, `agora`, `limpar`, `esc`,
`inteiro`, `recusar`) e o mesmo `__SGC_IDS__` com os ids das SFs chamadas por id. As que nascem
de um clique resolvem a persona por `runQueryMitra` com `:VAR_USER` **antes de qualquer
escrita** e repassam `usuarioId` explícito às escritas (R-013, achado A1). As duas de cron não
têm sessão: passam como `usuarioId` o **primeiro responsável do card, ou o criador**, e é a
persona dele que a guarda confere.

- **`sgcNfListar`** — a UMA execução da aba (RNF-001): capa do pedido, sugestões pendentes do
  card, notas vinculadas, itens das notas, ocorrências e contatos, em seis `SELECT` dentro da
  mesma execução. Não escreve nada e não consulta o ERP.
- **`sgcNfDetectar`** — (1) lê até **30** cards monitorados (`enviado`, `transito`,
  `faturamento`, com `DT_ENVIO` e `PERC_FATURADO_VALOR < 100`), com `CODFORNEC`, `CODFILIAL`,
  `DT_ENVIO`, `NUMPED_WINTHOR`, `VL_TOTAL`, `VL_FATURADO` e o responsável; (2) agrupa por
  `CODFORNEC|CODFILIAL` e, **por grupo**, faz UMA chamada a `sgcWintNfEntradas` com a menor
  `DT_ENVIO` do grupo e a lista de `NUMPED` dele (RNF-002); (3) descarta, com uma consulta só a
  `SGC_NF`, as notas já vinculadas em qualquer card (RN-010); (4) agrupa as linhas por nota e,
  para cada card do grupo, pontua por `pontuarSugestao()` — nota cujo `NUMPED` é o do card sai
  com 100 e origem `pedido`; (5) sugere a nota **ao card de maior pontuação** e grava por
  `sgcEscSugestaoInserir`; (6) grava o aviso `nf_sugerida` (uma vez por card por dia) e a nota do
  histórico por `kbNotaRegistrar`, ambos em `try/catch` (D-07 da onda 1: nota que falha não
  derruba a rodada). Erro de um grupo é acumulado e não derruba os outros (RNF-006).
- **`sgcNfVincular`** — persona `admin`/`analista`/`gestor`, `ACCESS_LEVEL <> 'READ_ONLY'`, e
  `RESTRICTED` só no card que criou; fase em `enviado`, `transito`, `faturamento` ou `bo`.
  Lê os itens da nota (`sgcWintNfItens`; no modo `manual`, de `itensJson`), as parcelas
  (`sgcWintNfParcelas`), os itens do pedido e a validade mínima do fornecedor. Grava a nota
  (`sgcEscNfInserir` — recusa a nota já vinculada em qualquer card e devolve o erro), os itens em
  um lote (`sgcEscNfItemInserir`), roda as **sete** regras e grava as ocorrências em um lote
  (`sgcEscOcorrenciaInserir`), recalcula o faturamento (`sgcEscPedidoFaturamento`) e registra a
  nota do histórico. São **5 execuções aninhadas**, quaisquer que sejam os itens (D-002). Devolve
  `percValor`, `percQtd` e `saldo` para a **tela** espelhar a capa (D-003).
- **`sgcOcorrenciaDecidir`** — persona igual à do vínculo; `recusado` exige justificativa de 10
  caracteres (RF-012); `modo: 'conformes'` decide de uma vez todas as conformes pendentes do
  card, `individual` decide uma. Uma execução de `sgcEscOcorrenciaDecidir` nos dois casos, mais
  a contagem de pendentes e a nota do histórico.
- **`sgcFaturamentoMonitorar`** — lê até **30** pedidos de `sgcFaturamentoPendenteListar`
  (a mesma SQL, então a regra de quem está pendente existe uma vez só) mais os que já chegaram a
  100 % com nível ainda aceso; para cada: **`FASE = 'bo'` → pula sem avisar** (R-041: o aviso
  diário do B.O. é da 007, e dois avisos por dia sobre o mesmo pedido foi o defeito que o legado
  corrigiu); 100 % → nível 0, capa limpa, sem aviso (RF-020); `DIAS_UTEIS < 3` → nada; `>= 3` →
  nível 3 ou 5 e, se `ALERTA_FATURAMENTO_EM` já é de hoje, pula (RN-009). Grava o aviso aos responsáveis (`faturamento_3`, `faturamento_5` ou
  `faturamento_diario`, `PARA_USUARIO_ID = 0`), e no nível 5 um segundo aviso com
  `PARA_PERSONA = 'gestor'` e a `CHAVE` com o sufixo `:gestor`; depois
  `sgcEscPedidoAlertaFaturamento`, o espelho da capa e `kbNotaRegistrar`. **Não** envia e-mail
  (RN-014) e **não** consulta o ERP (RNF-003).

  O espelho da capa é `kbCardAtualizar` (SF da lib, por id, com `atualizadoPor` = primeiro
  responsável do card ou o criador, e `origem: 'sistema'` — R-042), e **reenvia os quatro campos**:
  `titulo`, `responsaveisIds`, `prazo` e `valoresJson`. A SF da lib grava a lista de responsáveis e
  o prazo que recebe — sem eles, **apaga** (R-047) —, então o cron lê antes, numa consulta, o
  título e o prazo de `KB_CARD` e os responsáveis de `KB_CARD_RESPONSAVEL` **na ordem**
  (`ORDER BY ID`), e devolve tudo junto. É o mesmo que `atualizarCapaDoQuadro`
  (`abas/capa-do-quadro.ts`) faz na tela. A chamada vai em `try/catch`: capa que não espelha não
  derruba o aviso.
- **`sgcCobrancaEnviar`** — persona igual à do vínculo; `sendEmailMitra` com o contato escolhido
  mais a cópia fixa `compras@benenutri.com`, sem duplicar o destinatário (EM-02); grava a
  comunicação por `sgcEscComunicacaoInserir` (SF da 002, por id, `tipo = 'cobranca'`) e a nota do
  histórico. **Não** grava o contato: quem grava é a tela, por `sgcEscContatoInserir` com
  `:VAR_USER`, logo depois do `ok` (D-005).

### Escritas SQL (uma instrução por SF)

| Nome | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|
| `sgcEscNfInserir` | `{{usuarioId}}` | `cardId`, `numnota`, `serie`, `chavenfe`, `numtransent`, `codfornec`, `codfilial`, `dtEmissao`, `dtEntrada`, `vlTotal`, `prazoParcelas`, `origem`, `usuarioId`, `agora` | `INSERT … SELECT … FROM DUAL WHERE NOT EXISTS (nota já vinculada) AND <guarda>` | RF-006, RN-010 |
| `sgcEscNfItemInserir` | `{{usuarioId}}` | `linhas` (fragmento `SELECT … UNION ALL`), `usuarioId` | `INSERT INTO SGC_NF_ITEM (…) SELECT * FROM ({{linhas}}) LOTE WHERE <guarda> ON DUPLICATE KEY UPDATE` (a tabela tem `UNIQUE (ID_NF, CODPROD, NUMLOTE)`) | RF-006 |
| `sgcEscOcorrenciaInserir` | `{{usuarioId}}` | `linhas`, `usuarioId` | idem, sobre `SGC_NF_OCORRENCIA`, **sem** `ON DUPLICATE KEY UPDATE`: a tabela não tem chave única (uma NF revalidada geraria ocorrência nova, e é isso que se quer) | RF-006 |
| `sgcEscOcorrenciaDecidir` | `{{usuarioId}}` | `cardId`, `id` (0 = lote), `modo`, `decisao`, `justificativa`, `usuarioId`, `decididoEm` | `UPDATE … SET DECISAO, JUSTIFICATIVA, DECIDIDO_POR, DECIDIDO_EM WHERE ID_CARD = … AND DECISAO = 'pendente' AND ({{id}} = 0 OR ID = {{id}}) AND ('{{modo}}' <> 'conformes' OR RESULTADO = 'conforme') AND <guarda>` | RF-011, RF-012 |
| `sgcEscSugestaoInserir` | `{{usuarioId}}` | `chavenfe`, `numtransent`, `numnota`, `serie`, `codfornec`, `codfilial`, `vlTotal`, `dtEmissao`, `dtEntrada`, `cardId`, `numped`, `origem`, `score`, `motivo`, `usuarioId`, `criadoEm` | `INSERT … SELECT … FROM DUAL WHERE NOT EXISTS (mesma sugestão) AND NOT EXISTS (nota já vinculada) AND <guarda>` | RF-001, RF-003 |
| `sgcEscSugestaoDecidir` | `:VAR_USER` + persona | `id`, `status`, `motivo`, `decididoEm` | `UPDATE SGC_NF_SUGESTAO SET STATUS, MOTIVO, DECIDIDO_POR = :VAR_USER, DECIDIDO_EM WHERE ID = {{id}} AND STATUS = 'sugerida' AND <guarda>` | RF-024 |
| `sgcEscContatoInserir` | `:VAR_USER` + persona | `cardId`, `dtContato`, `canalContato`, `resumo`, `previsao`, `criadoEm` | `INSERT … SELECT … FROM DUAL WHERE TRIM('{{resumo}}') <> '' AND <guarda>` | RF-022 |
| `sgcEscPedidoFaturamento` | `{{usuarioId}}` | `idCard`, `usuarioId`, `agora` | `UPDATE SGC_PEDIDO` com as quatro medidas **somadas no próprio banco** | RF-016 |
| `sgcEscPedidoAlertaFaturamento` | `{{usuarioId}}` | `idCard`, `nivelAlerta`, `alertaEm`, `usuarioId` | `UPDATE SGC_PEDIDO SET ALERTA_FATURAMENTO_NIVEL, ALERTA_FATURAMENTO_EM` | RF-019, RF-020 |
| `sgcEscAvisoInserir` | **nenhuma** (R-023) | `idCard`, `tipo`, `chave`, `paraUsuarioId`, `paraPersona`, `texto`, `criadoEm` | `INSERT … SELECT … FROM DUAL WHERE NOT EXISTS (mesma CHAVE)` | RF-021, RN-009 |

`sgcEscAvisoInserir` é a única escrita desta spec chamada **por outras duas**: a 006 grava
`nf_atrasada` e `nf_recebida` (`paraUsuarioId: 0`, `paraPersona: ''`) e a 007 grava `bo_previsao`,
as duas por id, com os sete parâmetros acima e a `CHAVE` no formato `tipo:card:AAAA-MM-DD[:nf]`.
A assinatura está congelada aqui.

A guarda de persona é **a mesma** da 002 (`002-quadro-de-compras/plan.md`, "A guarda de persona,
escrita uma vez"), copiada literal (R-013), trocando só a lista de personas — `admin`,
`analista`, `gestor` em todas as escritas desta spec:

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

`sgcEscAvisoInserir` é a **única** exceção (R-023): cron não tem persona, e a guarda dela é a
idempotência — `NOT EXISTS (SELECT 1 FROM SGC_AVISO A WHERE A.CHAVE = '{{chave}}')` mais o
`UNIQUE (CHAVE)`. O risco aceito e registrado: quem chamar por id consegue, no máximo, enfileirar
um aviso.

As três medidas do faturamento nunca chegam como parâmetro — `sgcEscPedidoFaturamento` soma no
próprio banco, então a capa, `SGC_PEDIDO` e a lista não podem divergir (o mesmo princípio de
`sgcEscPedidoTotal` da 003):

```sql
UPDATE SGC_PEDIDO P SET
  P.VL_FATURADO = (SELECT COALESCE(SUM(N.VL_TOTAL), 0) FROM SGC_NF N WHERE N.ID_CARD = P.ID_CARD),
  P.DT_PRIMEIRO_FATURAMENTO = COALESCE((SELECT MIN(N.DT_EMISSAO) FROM SGC_NF N WHERE N.ID_CARD = P.ID_CARD), ''),
  P.PERC_FATURADO_VALOR = CASE WHEN COALESCE(P.VL_TOTAL, 0) > 0
    THEN (SELECT COALESCE(SUM(N.VL_TOTAL), 0) FROM SGC_NF N WHERE N.ID_CARD = P.ID_CARD) / P.VL_TOTAL * 100
    ELSE 0 END,
  P.PERC_FATURADO_QTD = CASE WHEN (SELECT COALESCE(SUM(I.QT_PEDIDA), 0) FROM SGC_PEDIDO_ITEM I
                                    WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido') > 0
    THEN (SELECT COALESCE(SUM(NI.QT_FATURADA), 0) FROM SGC_NF_ITEM NI
           WHERE NI.ID_CARD = P.ID_CARD AND NI.CASADO_POR <> 'nenhum')
       / (SELECT SUM(I.QT_PEDIDA) FROM SGC_PEDIDO_ITEM I
           WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido') * 100
    ELSE 0 END,
  P.ATUALIZADO_EM = '{{agora}}'
WHERE P.ID_CARD = {{idCard}} AND {{usuarioId}} > 0
  AND <guarda de persona sobre {{usuarioId}}>
```

### O campo do quadro `faturamento` (R-048)

Quem **cria** o campo é esta spec. O `add-008` exporta a lista, no mesmo formato do `CAMPOS` do
`add-005`, e a cria de forma idempotente por chave no `isEntrypoint()`:

```js
export const CAMPOS_008 = [
  { chave: 'faturamento', label: 'Faturamento', tipo: 'texto', noCard: true },
];
```

`noCard: true` porque o valor aparece **na capa do cartão**, não no formulário do card — é texto
calculado, ninguém digita. Nenhum campo desta spec é obrigatório nem tem `FASE_ID` (RN-017 da 002:
o motor cobraria obrigatório em qualquer direção e barraria cancelar e voltar).

Os dois lados que esta spec não toca:

- **base (S2)**: o seed insere o campo em `KB_CAMPO` **a partir de `CAMPOS_008`** (importando do
  `add-008`, como o `seed/002-quadro.mjs` já faz com `CAMPOS` do `add-005`) — uma fonte só;
- **integrador (S4)**: acrescenta `faturamento` à `CAPA_POR_FASE` do `add-005` nas fases
  `enviado`, `transito`, `faturamento` e `bo`.

### O espelho da capa — `kbCardAtualizar` nos dois caminhos (R-042)

O SGC **não escreve em `KB_CARD`**: o campo `faturamento` do quadro é gravado pela SF da lib, como
`valor_total` e `alertas_pendentes` já são.

- **Com sessão** (validar NF, decidir ocorrência): a **tela** chama `atualizarCapaDoQuadro(card,
  { faturamento })` de `frontend/src/pages/quadros/abas/capa-do-quadro.ts` (módulo da 003,
  reusado sem alteração), logo depois do `ok` do JS e só quando o texto mudou (`capaMudou`).
- **Sem sessão** (cron `sgcFaturamentoMonitorar`): a lib 1.4.0 aceita `kbCardAtualizar` com
  `atualizadoPor` (int) e `origem: 'sistema'`, que **só valem sem sessão** — mesma premissa de
  `kbCardCriar` (013) e de `kbCardMover` (R-021). O cron chama **por id**, com `atualizadoPor` =
  primeiro responsável do card, ou o criador, e envia **os quatro campos**: `titulo`,
  `responsaveisIds` (lista `"2,3"`, na ordem de `KB_CARD_RESPONSAVEL`), `prazo` e
  `valoresJson = { faturamento }` — `kbCardAtualizar` apaga responsáveis e prazo que não recebe
  (R-047).

O texto é sempre o de `textoDaCapaFaturamento()` (`lib/faturamento.ts`, RN-013), calculado num
lugar só: no caminho de tela a partir do retorno do JS, no caminho de cron dentro do próprio
cron, com os mesmos números que a listagem devolveu.

### Fragmentos entregues às outras specs e ao integrador

Mesmo padrão de `backend/sql/pendencias-analise.sql` (003): duas colunas, uma subconsulta escalar
cada, sobre `C.ID`, para o integrador colar em `contextoDoCard()` do `add-005`. Os textos são os
**mesmos** de `MOTIVOS` em `frontend/src/lib/transicoes.ts`.

**`backend/sql/pendencias-transito.sql`** (R-030, RN-012) — `enviado > transito`:

```sql
COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
          FROM SGC_NF N WHERE N.ID_CARD = C.ID), 1) AS PENDENCIAS_TRANSITO

COALESCE((SELECT CASE WHEN COUNT(*) = 0
            THEN 'Vincule ao menos uma nota fiscal ao pedido antes de mover para Em Trânsito para BN.'
            ELSE '' END
          FROM SGC_NF N WHERE N.ID_CARD = C.ID), '') AS PENDENCIAS_TRANSITO_MOTIVO
```

**`backend/sql/pendencias-conclusao-nf.sql`** (R-030, RN-011) — `faturamento > concluido` e
`bo > concluido`:

```sql
COALESCE((SELECT COUNT(*) FROM SGC_NF_OCORRENCIA O
          WHERE O.ID_CARD = C.ID AND O.DECISAO = 'pendente'), 0) AS PENDENCIAS_NF

COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN ''
            ELSE CONCAT('Decida as ', COUNT(*), ' conferências de nota fiscal pendentes antes de concluir o pedido.')
            END
          FROM SGC_NF_OCORRENCIA O
          WHERE O.ID_CARD = C.ID AND O.DECISAO = 'pendente'), '') AS PENDENCIAS_NF_MOTIVO
```

O que o integrador acrescenta ao `CASE` do `sqlPodeMover` (mesma ordem em `PODE` e em `MOTIVO`):

```sql
-- no PODE:
WHEN T.PAR = 'enviado>transito'                         AND T.PENDENCIAS_TRANSITO > 0 THEN 0
WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_NF > 0       THEN 0
-- no MOTIVO: cada ramo repete a SUA condição, e os dois de conclusão são encadeados
-- NF -> B.O. (o segundo é da 007), para PODE = 0 nunca sair com motivo vazio (R-020, R-044):
WHEN T.PAR = 'enviado>transito'                         AND T.PENDENCIAS_TRANSITO > 0 THEN T.PENDENCIAS_TRANSITO_MOTIVO
WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_NF > 0       THEN T.PENDENCIAS_NF_MOTIVO
WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_BO_ABERTOS > 0 THEN T.PENDENCIAS_BO_MOTIVO
```

A ordem entre os dois últimos é a da 007 (ela entrega o par `PENDENCIAS_BO_ABERTOS`/
`PENDENCIAS_BO_MOTIVO`): com ocorrência de NF pendente **e** item de B.O. aberto, a frase mostrada
é a da NF, e a do B.O. aparece quando só ela sobra. Sem a condição repetida no `MOTIVO`, um
`faturamento>bo` recusado por outro ramo cairia neste e mostraria a frase errada.

**`backend/sql/notificacoes-avisos.sql`** (R-023) — o quarto ramo de `notificacoesUniao()`, com as
seis colunas do contrato da 002 (`TIPO, CARD_ID, TITULO, QUEM, TEXTO, QUANDO`):

```sql
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
```

`TIPO` sai como `'aviso'` (e não como o tipo do aviso) porque `NotificacoesPage` mapeia `TIPO`
para um rótulo e cai no texto cru quando não conhece a chave: um rótulo só, "Aviso", e o assunto
no `TEXTO`. O integrador acrescenta a linha em `ROTULO`.

### Bloco 75xx de `frontend/src/lib/server-functions.ts`

| Id local | Nome | Id local | Nome |
|---|---|---|---|
| 7501 | `sgcWintNfEntradas` | 7550 | `sgcEscNfInserir` |
| 7502 | `sgcWintNfItens` | 7551 | `sgcEscNfItemInserir` |
| 7503 | `sgcWintNfParcelas` | 7552 | `sgcEscOcorrenciaInserir` |
| 7504 | `sgcWintNfBuscar` | 7553 | `sgcEscOcorrenciaDecidir` |
| 7505 | `sgcNfSugestoesListar` | 7554 | `sgcEscSugestaoInserir` |
| 7506 | `sgcNfSugestoesListarTotal` | 7555 | `sgcEscSugestaoDecidir` |
| 7507 | `sgcNfListar` | 7556 | `sgcEscContatoInserir` |
| 7508 | `sgcFaturamentoPendenteListar` | 7557 | `sgcEscPedidoFaturamento` |
| 7509 | `sgcFaturamentoPendenteListarTotal` | 7558 | `sgcEscPedidoAlertaFaturamento` |
| 7510 | `sgcContatosListar` | 7559 | `sgcEscAvisoInserir` |
| 7511 | `sgcNfDetectar` | | |
| 7512 | `sgcNfVincular` | | |
| 7513 | `sgcOcorrenciaDecidir` | | |
| 7514 | `sgcFaturamentoMonitorar` | | |
| 7515 | `sgcCobrancaEnviar` | | |

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/quadro`, card aberto, aba **Notas fiscais** | sugestões do card, notas vinculadas com itens, ocorrências com decisão e "Aceitar todos os conformes", contatos e "Enviar cobrança" | `Panel`, `PanelHeader`, `Toolbar`, `Table`/`Th`/`Td` (`numeric`), `RowTitle`, `RowMeta`, `Status`, `Badge`, `Code`, `Dash`, `Button`, `IconButton`, `Alert`, `EmptyState`, `Dialog`, `Field`, `SelectMenu`, `DatePicker` | `AbaNotasFiscais`, `DialogoRegistrarNf`, `DialogoDecisao`, `DialogoContato`, `DialogoCobranca` |
| `/notas-fiscais` | fila de sugestões (Pedido · Fornecedor · Fase · NF · Score · Status · Validar / Ver / Recusar) e busca híbrida por número | `PageHeader`, `Panel`, `Toolbar`, `SearchInput`, `SelectMenu`, `Table`, `Status`, `Pagination`, `Dialog` | `NotasFiscaisPage` |
| `/faturamentos-pendentes` | total, filtros 0 contato / 3 / 5 / +5 dias úteis, busca, exportar CSV, Registrar contato, Enviar cobrança | os mesmos + `Stat`, `FilterChip` | `FaturamentosPendentesPage` |

Arquivos:

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/pages/quadros/abas/NotasFiscais.tsx` | `AbaNotasFiscais(ctx: ExtensaoContexto)` — uma chamada de `sgcNfListar` por abertura; a aba **não** declara `contagem` (R-049: `AbaExtra.contagem` é síncrona e lê só `card.valores`, e não há campo do quadro para "notas pendentes") |
| `frontend/src/pages/quadros/abas/nf-dialogos.tsx` | os quatro diálogos da aba (registrar, decidir, contato, cobrança) |
| `frontend/src/pages/notas-fiscais/NotasFiscaisPage.tsx` | fila de sugestões |
| `frontend/src/pages/faturamentos/FaturamentosPendentesPage.tsx` | lista de faturamentos pendentes |
| `frontend/src/lib/nf.ts` | regra pura da sugestão, do casamento e da conferência |
| `frontend/src/lib/dias-uteis.ts` | `diasUteisEntre`, `somarDiasUteis` (R-025) |
| `frontend/src/lib/faturamento.ts` | percentuais, nível de alerta, texto da capa |
| `frontend/src/lib/csv.ts` | **da base (S2)**: `textoCsv(cabecalho, linhas)` e `baixarCsv(nome, texto)` — esta spec consome, não reimplementa |
| `frontend/src/lib/server-functions.ts` | bloco 75xx (nomes e ids locais) |

Desenho (`design.md` §8, §9.1, §9.4, §9.5):

- **Tabela de notas e de itens**: `Code` para número/série e para `CODPROD`, `RowTitle` para a
  descrição, `RowMeta` para lote e validade; quantidades, preços e percentuais com `numeric`;
  sem zebra; coluna sem dado é `Dash()`, nunca `0` nem `R$ 0,00`.
- **Resultado da conferência** é `Status` com rótulo **escrito**, nunca só cor: `conforme`
  (`tone="live"`), `atencao` (`tone="attention"`), `divergente` (`tone="alert"`) — os quatro tons
  que o `Status` do `page.tsx` aceita são `live | off | attention | alert`; a decisão é
  um segundo `Status` (`pendente`/`aceito`/`recusado`). Score da sugestão é número com `numeric`,
  acompanhado do motivo em `RowMeta` — nunca uma barra colorida sozinha.
- **Agrupamento** das ocorrências por item (o legado provou que 20 itens × 4 regras vira parede):
  um bloco por item com o resumo (`3 conformes · 1 divergente`) e o detalhe expansível; as três
  regras de pedido num bloco próprio no fim.
- **Diálogos** com `max-h-[90vh]`, só o miolo rola, rodapé `flex-col-reverse` no mobile; o
  `Textarea` da recusa mostra o contador do mínimo de 10 caracteres.
- **Campo de data** (previsão de faturamento) é o `DatePicker` da 004 (UI-03 B), nunca o controle
  nativo. **Sem toast** (UI-02 A): confirmação na faixa do painel, erro em `Alert`.
- **Permissão** (§9.4): diretoria e `READ_ONLY` veem tudo com os controles de escrita
  **desabilitados** e o motivo no `title`, nunca escondidos (D-11 da onda 1). O comercial não
  chega às rotas (item fora do menu e `permissoes.verNotasFiscais` falso).
- **Exportar CSV** usa `textoCsv()` e `baixarCsv()` de `lib/csv.ts` (arquivo da base, S2) sobre as
  **mesmas linhas já carregadas** — sem SF nova, sem segunda consulta e sem escape próprio.

## Fluxo

1. A cada 30 minutos `sgcNfDetectar` roda sem sessão: 30 cards, uma consulta ao ERP por
   fornecedor e filial, sugestões gravadas, avisos e notas de histórico. Nada é vinculado.
2. A compradora abre `/notas-fiscais` (ou a aba do card) e vê a fila com pontuação e motivo.
   "Ver" abre o card; "Recusar" chama `sgcEscSugestaoDecidir` direto (`:VAR_USER`).
3. "Validar" chama `sgcNfVincular` com o `idSugestao`; voltando `ok`, a tela chama
   `sgcEscSugestaoDecidir` com `validada` e recarrega a aba. Se a nota não estiver no ERP, a
   pessoa usa "Registrar pelo número": `sgcWintNfBuscar` pré-preenche e o mesmo `sgcNfVincular`
   grava, com `origem: 'hibrida'` (ou `'manual'` quando nem no ERP ela existe).
4. `sgcNfVincular` grava nota, itens e ocorrências e recalcula o faturamento; devolve os
   percentuais e o saldo. A tela espelha a capa com `atualizarCapaDoQuadro(card, { faturamento })`
   — uma chamada de `kbCardAtualizar`, e só quando o texto mudou — e recarrega a aba com uma
   chamada de `sgcNfListar`.
5. A compradora decide as ocorrências: "Aceitar todos os conformes" (`modo: 'conformes'`) ou uma
   a uma; recusar abre o diálogo de justificativa. Enquanto houver pendente, concluir o pedido é
   recusado pelo gancho do servidor.
6. Mover para "Em Trânsito para BN" sem nota é recusado pelo gancho, com o texto do fragmento; a
   lib mostra o motivo na faixa de aviso do card.
7. Todo dia às 11h02 UTC (8h02 de Brasília; dois minutos depois do cron diário da 007, para os
   dois não disputarem o mesmo minuto do agendador — G-2) `sgcFaturamentoMonitorar` roda: quem passou de 3 e de 5 dias úteis ganha
   aviso, nível e a etiqueta na capa (`kbCardAtualizar` por id, com `atualizadoPor` e
   `origem: 'sistema'`); acima de 5, uma vez por dia; 100 % em valor encerra; pedido em B.O.
   é pulado (R-041).
8. Em `/faturamentos-pendentes` o gestor filtra, busca, exporta, registra contato
   (`sgcEscContatoInserir`, `:VAR_USER`) e envia cobrança (`sgcCobrancaEnviar`, seguido de
   `sgcEscContatoInserir` pela tela).

## Regras puras

### `frontend/src/lib/dias-uteis.ts` (R-025 — a 006 importa, não reimplementa)

```ts
export function diasUteisEntre(inicioIso: string, fimIso: string): number;
// conta o dia de chegada e não o de partida: seg→sáb = 4, sex→seg = 1, mesmo dia = 0.
export function somarDiasUteis(iso: string, n: number): string;
// 2026-08-24 + 15 = 2026-09-14 (conferência do R-025); n = 0 devolve o próximo dia útil ≥ iso.
```

### `frontend/src/lib/nf.ts`

```ts
export const TOLERANCIA_PRECO = 0.01;          // 1 % (R-032)
export const VALIDADE_MINIMA_PADRAO_DIAS = 120;

export interface CandidataNf { NUMNOTA: number; SERIE: string; DT_EMISSAO: string; NUMPED: number;
  VL_TOTAL: number; itens: { CODPROD: number; CODFAB: string; EAN: string; QT: number; PUNIT: number }[] }

export function pontuarSugestao(nf: CandidataNf, ctx: { codprodsPedido: number[]; codfabsPedido: string[];
  dataEnvio: string; valorPedido: number; saldoPedido: number }): { score: number; motivo: string } | null;
// RN-002: round(cobertura × 60) + 20 (emissão 0..45 dias do envio) + 20 (valor cabe no saldo × 1,01),
// limitado a [5, 95]; cobertura 0 devolve null. Casamento por NUMPED não passa por aqui: vale 100.

export function casarItem(itemNf: { CODPROD: number; CODFAB: string; EAN: string },
  itensPedido: { CODPROD: number; CODFAB: string; EAN: string }[],
): { item: ItemPedido | null; casadoPor: 'codprod' | 'codfab' | 'ean' | 'nenhum' };   // RN-003

export function classificarDelta(esperado: number, encontrado: number):
  { resultado: 'conforme' | 'atencao' | 'divergente'; delta: number };                // RN-004

export function diasDeValidade(dtEmissao: string, dtValidade: string): number | null; // RN-005
export function resultadoDeValidade(dias: number | null, minimo: number): Resultado;   // RN-005
export function resultadoDeQuantidade(pedida: number, faturada: number): { resultado: Resultado; texto: string }; // RN-006
export function resultadoDePrazo(acordado: string, diasDaNf: number[], prazoDaNota: number):
  { resultado: Resultado; esperado: string; encontrado: string };                      // RN-007 — usa parcelasDoPrazo/textoDeParcelas da 003
export function ocorrenciasDaNota(nf, itensNf, itensPedido, contexto): Ocorrencia[];   // orquestra as sete regras
export function textoDaOcorrencia(o: Ocorrencia, descricaoDoProduto: string): string;  // a frase que a tela mostra
```

`resultadoDePrazo` **importa** `parcelasDoPrazo`, `textoDeParcelas` e `normalizarPrazo` de
`lib/prazo-pagamento.ts` (003, dono único da regra de parcelas por R-015): as duplicatas viram
`[28, 35, 42]`, o acordado também, e a comparação é a mesma da montagem do pedido.

### `frontend/src/lib/faturamento.ts`

```ts
export function percentuaisFaturados(p: { vlPedido: number; vlFaturado: number;
  qtPedida: number; qtFaturada: number }): { valor: number; quantidade: number; saldo: number };  // RN-008
export function nivelDeAlerta(diasUteis: number): 0 | 3 | 5;                                       // RN-009
export function textoDaCapaFaturamento(e: { temNf: boolean; vlFaturado: number; percValor: number;
  saldo: number; diasUteis: number }): string;                                                     // RN-013
export function colunasDoCsv(linhas: LinhaPendente[]): { cabecalho: string[]; corpo: (string | number)[][] };
// só escolhe e formata as colunas; quem monta o texto é textoCsv() de lib/csv.ts (base)
```

## Simulador

### Tabelas `PC*` (DDL do integrador, R-027)

Esta spec **não cria tabela nenhuma**; o `seed/005-notas-fiscais.mjs` só insere linhas. As
colunas que as quatro consultas exigem, e que o integrador acrescenta em
`backend/simulator/schema-winthor.mjs`:

| Tabela | Colunas novas |
|---|---|
| `PCNFENT` (nova) | `NUMTRANSENT`, `NUMNOTA`, `SERIE`, `CODFORNEC`, `CODFILIAL`, `DTEMISSAO`, `DTENT`, `DTCANCEL`, `VLTOTAL`, `CHAVENFE`, `PRAZO`, `ESPECIE` |
| `PCLANC` (nova) | `NUMTRANSENT`, `NUMNOTA`, `CODFORNEC`, `DTEMISSAO`, `DTVENC`, `VALOR`, `DUPLIC`, `NUMPARCELAMENTO` |
| `PCMOV` | `NUMTRANSENT`, `NUMNOTA`, `SERIE`, `NUMLOTE`, `DATAVALIDADE` (as de venda continuam) |
| `PCPRODUT` | `CODFAB`, `CODAUXILIAR` |

### Seed — `backend/simulator/seed/005-notas-fiscais.mjs`

Só **linhas**. Fornecedores (1015 Fresenius Kabi e 1042 Nestlé ativos, 1088 Danone inativo) e
filiais (1 Matriz, 2 Norte, 3 Sul) vêm do `seed/001`; personas (`admin` 1, `ana` 2, `gil` 3,
`dora` 4, `leo` 5) do `seed/002`; produtos 5001…5020 do `seed/003` (R-017). As fases saem de
`SGC_FASE.CHAVE`.

**Pedidos (cards próprios desta spec, com itens e capa):**

| Card | Fase | Pedido | Para quê |
|---|---|---|---|
| `enviadoComPedido` | `enviado` | 1015/filial 1, `NUMPED_WINTHOR` **998901**, `DT_ENVIO` = hoje − 3 dias úteis, `VL_TOTAL` 120.000,00, 5 itens somando 2.000 un | C-001, C-017, C-021 |
| `enviadoSemPedido` | `enviado` | 1015/filial 1, sem `NUMPED_WINTHOR`, `DT_ENVIO` = hoje − 5 dias úteis, 5 itens (5001…5005) | C-002, C-022 |
| `faturamentoParcial` | `faturamento` | 1015/filial 1, `DT_ENVIO` = hoje − 3 dias úteis, `VL_TOTAL` 120.000,00 em 2.000 un, com a NF 7001 já vinculada (72.000,00 / 1.200 un) e 1 contato | C-014, C-019, C-024, C-026 |
| `conferencias` | `faturamento` | 1015/filial 1, `DT_ENVIO` = hoje − 4 dias úteis, 3 itens a 10,0000 / 20,0000 / 30,0000 e a NF 7002 pronta para validar | C-007, C-010, C-011, C-012, C-015, C-016, C-018, C-026 |
| `notaDeOutro` | `transito` | 1042/filial 1, com a NF **7004** já vinculada e cobrindo **100 %** do `VL_TOTAL` (fica fora da lista de pendentes) | C-003 |
| `semNota` | `enviado` | 1042/filial 1, `DT_ENVIO` = hoje − 1 dia útil, sem nota e sem contato | C-005, C-026 (sem contato) |
| `semNota2` | `enviado` | 1042/filial 2, `DT_ENVIO` = hoje − 2 dias úteis, sem nota e sem contato | C-026 (sem contato) |
| `atrasadoNove` | `transito` | 1015/filial 1, `DT_ENVIO` = hoje − 9 dias úteis, 1 contato registrado | C-023, C-026 |
| `cemPorCento` | `faturamento` | 1015/filial 1, `VL_TOTAL` 50.000,00 com NF de 50.000,00 e `ALERTA_FATURAMENTO_NIVEL` 5 | C-020 |
| `emBo` | `bo` | 1015/filial 1, `DT_ENVIO` = hoje − 7 dias úteis, `VL_TOTAL` 30.000,00 sem nota, **`DT_PREVISAO_BO` = hoje + 10 dias** e **2 linhas em `SGC_BO_ITEM` com `STATUS = 'aberto'`** (produtos 5006 e 5007) — sem elas, C-028 não teria o que provar na listagem | C-028 |
| `validade1042` | `faturamento` | **1042**/filial 1, `DT_ENVIO` = hoje − 3 dias úteis, 2 itens (5001 e 5002) e a NF 7006 pronta para validar | C-011 (fornecedor com mínimo de 180 dias) |

As datas de envio são calculadas pelo `somarDiasUteisData` de `backend/lib/dias-uteis.mjs` a
partir de hoje, para os níveis do cron serem determinísticos em qualquer dia em que o smoke rode.

**WinThor (`PCNFENT` + `PCMOV` `CODOPER = 'E'` + `PCLANC`):**

| Nota | Situação | Para quê |
|---|---|---|
| 7001 · série 1 · `NUMTRANSENT` 9001 | fornecedor **1015**, emissão 11/09/2026, entrada 14/09/2026, 72.000,00, `NUMPED` **998901**, 3 itens, duplicatas em 28/35/42 dias | C-001, C-007, C-013, C-014 |
| 7002 · série 1 · `NUMTRANSENT` 9002 | fornecedor **1015**, emissão = envio + 3 dias, sem `NUMPED`, 4 dos 5 produtos do `enviadoSemPedido`, valor dentro do saldo; itens com preço 10,0000 / 20,1600 / 30,4500, um lote válido até 01/02/2027 e outro até 01/12/2026, um item com `QT` 120 contra 100 pedidas e outro com 60 contra 100 | C-002, C-008, C-009, C-010, C-011, C-012 |
| 7003 · `NUMTRANSENT` 9003 | fornecedor 1015, `DTCANCEL` preenchida | C-004 |
| 7004 · `NUMTRANSENT` 9004 | fornecedor 1042, entrada normal, **já vinculada** ao card `notaDeOutro` | C-003 |
| 7005 · `NUMTRANSENT` 9005 | fornecedor 1015, emissão 13/09/2026, **`DTENT` nulo**, 2 itens, duplicatas 30/60 | C-006, C-013 (divergente) |
| 7006 · série 1 · `NUMTRANSENT` 9006 | fornecedor **1042**, emissão 11/09/2026, entrada 14/09/2026, 2 itens com os **mesmos dois lotes** da 7002 (validade 01/02/2027 = 143 dias e 01/12/2026 = 81 dias), para o card `validade1042` | C-011 (metade do fornecedor com mínimo próprio) |

Faixa de numeração reservada (combinada com a 006): as notas desta spec ficam com
`NUMNOTA < 90000`; **90001–90015** são da 006 (nota cancelada, duas filiais, sem entrada) e a 007
não semeia nota nenhuma.

A validade é medida contra o **valor cadastrado do fornecedor**, não contra o 120 padrão — o seed
da 001 deixa `VALIDADE_MINIMA_DIAS = 90` no 1015 e 180 no 1042 (R-043), e o teste lê o cadastro em
vez de supor: com o 1015 (90), 143 dias é conforme e 81 é divergente; com o 1042 (180), os dois
são divergentes. O 120 padrão de RN-005 é exercitado na regra pura, onde o mínimo é parâmetro.

Um item da 7002 tem `CODPROD` 9001 (inexistente no pedido) com `CODFAB` `'FK-123'` igual ao do
produto 5001, e outro com `CODAUXILIAR` `'7891234567890'` igual ao do 5002: são os dois
casamentos alternativos de C-008. Um terceiro, `CODPROD` 9999 sem `CODFAB` nem EAN conhecidos, é
o item não pedido de C-009. O `VALIDADE_MINIMA_DIAS` dos dois fornecedores (90 no 1015, 180 no
1042) vem do seed da 001, dono único do cadastro (R-017/R-043): esta spec lê, não grava.

**Contatos e avisos:** todo card pendente desta spec nasce com **1 contato** (canal telefone, 2
dias atrás), **menos `semNota` e `semNota2`** — é isso, e só isso, que faz o filtro "sem contato"
devolver exatamente esses dois. Nenhum aviso é semeado: os avisos nascem do cron, e é o que o
smoke prova.

As faixas dentro de `CARDS_005`: `sem_contato` 2 (`semNota`, `semNota2`), `3` quatro
(`enviadoComPedido`, `faturamentoParcial`, `validade1042` com 3 dias úteis e `conferencias` com
4), `5` um (`enviadoSemPedido`), `mais5` dois (`atrasadoNove` com 9 e `emBo` com 7). `notaDeOutro`
e `cemPorCento` estão em 100 % e ficam fora da listagem: 9 pendentes ao todo.

**Cards exportados:** o seed exporta `CARDS_005` (`{ enviadoComPedido, enviadoSemPedido,
faturamentoParcial, conferencias, notaDeOutro, semNota, semNota2, atrasadoNove, cemPorCento,
emBo, validade1042 }`), como a 003 faz com `CARDS_003`. É por essa lista que o smoke recorta as
asserções sobre listagens globais (R-045) em vez de contar linhas do banco inteiro.

### `CHECK_INPUT`

O `sim:check` só exercita **SQL de leitura** (pula escrita e JAVASCRIPT), então a seção 005 de
`backend/simulator/config.mjs` (arquivo do integrador) tem só os parâmetros das nove leituras:

`numnota: '7001'`, `serie: ''`, `numpeds: '998901'`, `dataEnvio: '2026-08-01'`,
`status: ''`, `faixa: ''`, `hoje: ''`. `codfornec` (`'1015'`), `codfilial` (`'1'`), `cardId`,
`busca`, `limite` e `offset` já existem da 003 e da 002, com valores que servem a esta spec —
nenhum deles muda de valor aqui (D-09 da onda 1: o objeto é um só e a última chave ganha).

**Nome próprio para o que colidiria** (G-4): as escritas desta spec usam `canalContato`
(`sgcEscContatoInserir`) e `nivelAlerta` (`sgcEscPedidoAlertaFaturamento`) no lugar de `canal` e
`nivel`, que a 002 já ocupa com outro significado. `sgcEscAvisoInserir` mantém `tipo`, porque a
assinatura é contrato das três specs da onda (R-038) e a 006 e a 007 chamam com essa chave — o
`sim:check` não a exercita, então não há colisão de valor; se um dia alguma **leitura** precisar
filtrar por tipo de aviso, o parâmetro nasce como `tipoAviso`.

### Dialeto

`NVL`, `TO_DATE`, `TO_CHAR`, `TRUNC`, `CONCAT`, `DATEDIFF`, `LEAST`, `GREATEST`, `DATE_FORMAT` e
`ROWNUM` já são shims. Esta spec acrescenta o uso de:

- **`FLOOR`** e **`MOD`** — os dois fragmentos de dias úteis (`MOD(a, b)` existe em MySQL; no
  SQLite é o operador `%`, e `FLOOR` depende de flag de compilação, por isso vira função
  registrada, como o `CEIL` já é);
- **`DATE_ADD(col, INTERVAL <expressão> DAY)`** — hoje a reescrita só reconhece literal inteiro
  (`INTERVAL 30 DAY`); precisa aceitar uma expressão entre parênteses para o `somarDiasUteis`.

Os dois são **pedidos ao integrador** em `backend/simulator/mysql-dialect.mjs`. Nenhuma função de
JSON é usada: o campo do quadro é escrito pela lib (R-042).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `smoke/005-notas-fiscais.mjs` | `sgcNfDetectar` cria 1 sugestão da nota 7001 para `enviadoComPedido` (`NUMPED_WINTHOR` **998901**, número exclusivo deste seed), `SCORE = 100`, `ORIGEM = 'pedido'`; `SELECT COUNT(*) FROM SGC_NF` continua no que era antes da rodada (diferença, não literal) |
| C-002 | `smoke/…` + `tests/nf.test.mjs` | a sugestão de `enviadoSemPedido` sai com `SCORE = 88`, `ORIGEM = 'heuristica'` e `MOTIVO` contendo "4 de 5"; `pontuarSugestao` com cobertura 4/5, +3 dias e valor no saldo → 88 |
| C-003 | `smoke/…` | a nota 7004 não aparece em `sgcNfSugestoesListar`; `sgcNfVincular` dela em outro card devolve `ok: false` com "já está vinculada" |
| C-004 | `smoke/…` | `sgcWintNfEntradas` do 1015 não traz a 7003 (e traz > 0 linhas); nenhuma sugestão dela |
| C-005 | `smoke/…` | `sgcNfListar` do card `semNota` devolve `sugestoes: []` e `nfs: []`; `sgcWintNfBuscar` com 7005 devolve 1 linha |
| C-006 | `smoke/…` | `sgcWintNfBuscar` (7005) devolve `DT_ENTRADA` vazio, série, emissão e valor; `sgcWintNfItens` da 7005 devolve 2 itens (> 0) |
| C-007 | `smoke/…` | validar a sugestão do card `conferencias` grava 1 linha em `SGC_NF`, 3 em `SGC_NF_ITEM` e **15** em `SGC_NF_OCORRENCIA`, todas `pendente`, e 1 nota no histórico do card |
| C-008 | `tests/nf.test.mjs` + `smoke/…` | `casarItem` devolve `codfab` e `ean` na ordem certa; as ocorrências dos dois itens saem `atencao` com o código no `VALOR_ENCONTRADO` |
| C-009 | `smoke/…` | o item 9999 gera 1 ocorrência `item_nao_pedido` com `RESULTADO = 'divergente'` |
| C-010 | `tests/nf.test.mjs` + `smoke/…` | `classificarDelta(20, 20.16)` → `atencao` 0,008; `(30, 30.45)` → `divergente` 0,015; `(10, 10)` → `conforme` 0; as três ocorrências `preco_divergente` gravadas com esses resultados |
| C-011 | `tests/nf.test.mjs` + `smoke/…` | **na regra pura** (único lugar onde o padrão de 120 aparece): `diasDeValidade('2026-09-11', '2027-02-01')` → 143, `resultadoDeValidade(143, 120)` → `conforme` e `(81, 120)` → `divergente`. **No smoke**, o mínimo vem sempre do cadastro (`SGC_FORNECEDOR.VALIDADE_MINIMA_DIAS`, lido no próprio teste, nunca suposto): validar a NF 7002 no card `conferencias` (fornecedor **1015**, mínimo **90**) gera 1 `validade_curta` `conforme` (143) e 1 `divergente` (81); validar a NF 7006 no card `validade1042` (fornecedor **1042**, mínimo **180**) gera as **duas** `validade_curta` divergentes |
| C-012 | `tests/nf.test.mjs` | `resultadoDeQuantidade(100, 120)` → `divergente`; `(100, 60)` → `conforme` com "saldo de 40"; `(100, 100)` → `conforme` |
| C-013 | `tests/nf.test.mjs` + `smoke/…` | `sgcWintNfParcelas` da 7001 devolve 3 linhas (> 0) com `DIAS` 28/35/42; `resultadoDePrazo('28/35/42', [28,35,42], 0)` → `conforme`; da 7005 (30/60) → `divergente` com os dois textos |
| C-014 | `tests/faturamento.test.mjs` + `smoke/…` | `percentuaisFaturados({120000, 72000, 2000, 1200})` → 60 / 60 / 48000; depois do vínculo, `SGC_PEDIDO` do card traz `PERC_FATURADO_VALOR = 60` e `PERC_FATURADO_QTD = 60` |
| C-015 | `smoke/…` | com 12 ocorrências (9 conformes), `sgcOcorrenciaDecidir` com `modo: 'conformes'` devolve `decididas: 9` e deixa `pendentes: 3` numa execução |
| C-016 | `smoke/…` | recusar com 9 caracteres devolve `ok: false` citando a justificativa; com 10, grava `DECISAO = 'recusado'`, `DECIDIDO_POR` e `DECIDIDO_EM`; `SGC_NF` do card continua com 1 linha nos dois casos |
| C-017 | `smoke/…` | `sgcPodeMover` de `enviado` para `transito` no card `semNota` devolve `PODE = 0` e o `MOTIVO` exato do fragmento; no `enviadoComPedido` com 1 nota, `PODE = 1` e `MOTIVO` vazio |
| C-018 | `smoke/…` | `sgcPodeMover` para `concluido` com 3 ocorrências pendentes → `PODE = 0` e `MOTIVO` contendo "3 conferências"; decididas as três, `PODE = 1`; o mesmo par saindo de `bo` |
| C-019 | `tests/faturamento.test.mjs` + `smoke/…` | `textoDaCapaFaturamento` devolve `R$ 72.000,00 (60 %) · saldo R$ 48.000,00`; depois do vínculo, `DT_PRIMEIRO_FATURAMENTO` é `2026-09-11`; o espelho da capa é provado **pelos dois caminhos**: `kbCardAtualizar` com sessão (`valoresJson = { faturamento }`) e, na rodada do cron, `kbCardAtualizar` por id com `atualizadoPor` + `origem: 'sistema'` — nos dois, `KB_CARD.VALORES_JSON` do card passa a ter o texto na chave `faturamento`. **R-047:** nos dois caminhos o teste guarda `TITULO`, `PRAZO` e a lista de `KB_CARD_RESPONSAVEL` antes da chamada e assegura que continuam idênticos depois — a chamada reenvia os quatro campos, não pode zerar nenhum |
| C-020 | `smoke/…` | `sgcFaturamentoMonitorar` sobre o card `cemPorCento` devolve `encerrados: 1`, zera `ALERTA_FATURAMENTO_NIVEL`, não cria aviso e o card some de `sgcFaturamentoPendenteListar` |
| C-021 | `smoke/…` | a rodada cria 1 `SGC_AVISO` `faturamento_3` para `enviadoComPedido` com "3 dias úteis" e o fornecedor no `TEXTO`, `PARA_USUARIO_ID = 0`, nível 3 gravado e 1 nota no histórico; **R-047:** `KB_CARD.TITULO`/`PRAZO` e os `KB_CARD_RESPONSAVEL` do card, guardados antes, continuam iguais depois do `kbCardAtualizar` do cron |
| C-022 | `smoke/…` | a rodada cria 2 avisos para `enviadoSemPedido` (`faturamento_5` com `PARA_USUARIO_ID = 0` e outro com `PARA_PERSONA = 'gestor'`) e nível 5; **R-047:** título, prazo e responsáveis do card intactos depois da rodada |
| C-023 | `smoke/…` | duas rodadas seguidas sobre `atrasadoNove` criam 1 aviso `faturamento_diario`, não 2; a `CHAVE` é `faturamento_diario:<card>:<hoje>`; **R-047:** depois das **duas** rodadas, título, prazo e responsáveis do card continuam os do seed (o reenvio repetido não acumula nem apaga nada) |
| C-024 | `smoke/…` | dois `sgcEscContatoInserir` no mesmo card → `sgcContatosListar` devolve 2, o mais novo primeiro; `sgcFaturamentoPendenteListar` traz `QT_CONTATOS = 2` e a data do último |
| C-025 | `smoke/…` | `sgcCobrancaEnviar` devolve `destinatarios` com o contato e `compras@benenutri.com`, o coletor de e-mails do smoke registra 1 envio e `SGC_COMUNICACAO` ganha 1 linha `cobranca`; a rodada do cron não gera e-mail nenhum |
| C-026 | `smoke/…` + `tests/faturamento.test.mjs` | **nenhuma asserção literal de total** (R-045 — o banco do smoke é compartilhado com as suítes 002/006/007): o teste recorta as linhas de `sgcFaturamentoPendenteListar` por `ID_CARD IN (CARDS_005)` e conta o recorte — 9 pedidos deste seed, `faixa: 'sem_contato'` 2, `'3'` 4, `'5'` 1, `'mais5'` 2; `sgcFaturamentoPendenteListarTotal` é conferido **por diferença** (o total com `faixa: ''` menos o total medido antes de semear os 9 cresce 9, e o total de cada faixa ≥ o recorte); `busca: 'Fresenius'` só reduz o recorte; `colunasDoCsv` devolve o cabeçalho e uma linha por pedido, na ordem da tela (o escape é de `lib/csv.ts`, testado pela base) |
| C-027 | `smoke/…` + `tests/permissoes.test.mjs` | `sgcNfVincular` como `leo` (comercial) e como `dora` (diretoria) devolve `ok: false`; `sgcEscContatoInserir` como `leo` não grava; `permissoesDe` devolve `verNotasFiscais`/`operarNf`/`verFaturamentoPendente` por persona, com a diretoria lendo os dois painéis |
| C-028 | `smoke/…` | com o card `emBo` (fase `bo`, 7 dias úteis, saldo a faturar), `sgcFaturamentoMonitorar` não cria aviso nenhum para ele e não mexe no nível; `sgcFaturamentoPendenteListar` traz o card, com `DT_PREVISAO_BO` e `QT_BO_ABERTO` |
| RN-001 | `tests/dias-uteis.test.mjs` + `smoke/…` | `somarDiasUteis('2026-08-24', 15)` → `'2026-09-14'`; `diasUteisEntre('2026-08-24', '2026-09-14')` → 15; sex→seg 1; seg→sáb 4; mesmo dia 0; e a mesma conta pelo fragmento SQL, num `SELECT` com as duas datas literais |
| RN-002 | `tests/nf.test.mjs` | cobertura 4/5 + 3 dias + valor no saldo → 88; 1/5 + 60 dias + valor acima → 12; cobertura 0 → `null`; teto 95 e piso 5 |
| RN-003 | `tests/nf.test.mjs` | casa por `codprod`; sem ele, por `codfab`; sem os dois, por `ean`; sem nenhum, `nenhum` |
| RN-004 | `tests/nf.test.mjs` | (10, 10) conforme 0; (10, 10.05) atenção 0,005; (10, 11) divergente 0,1; (0, 5) divergente; (0, 0) conforme |
| RN-005 | `tests/nf.test.mjs` | 143 com mínimo 120 → conforme; 143 com 180 → divergente; validade vazia → atenção |
| RN-006 | `tests/nf.test.mjs` | (100, 120) divergente; (100, 60) conforme com saldo 40; (100, 100) conforme |
| RN-007 | `tests/nf.test.mjs` | `[28,35,42]` contra `'28/35/42'` conforme; `[30,60]` divergente; sem duplicata e sem prazo na nota → atenção |
| RN-008 | `tests/faturamento.test.mjs` + `smoke/…` | 72.000/120.000 → 60; 1.200/2.000 → 60; pedido com `VL_TOTAL` 0 → 0 sem divisão por zero; 100 % encerra o monitoramento |
| RN-009 | `tests/faturamento.test.mjs` + `smoke/…` | `nivelDeAlerta(2)` 0, `(3)` 3, `(5)` 5, `(9)` 5; a segunda rodada no mesmo dia não cria aviso |
| RN-010 | `smoke/…` | depois de `sgcNfDetectar`, `SELECT COUNT(*) FROM SGC_NF` não muda; a nota 7004 não é sugerida |
| RN-011 | `smoke/…` | com a ocorrência divergente **decidida**, concluir libera; com qualquer pendente, recusa |
| RN-012 | `smoke/…` | 0 notas → recusa de Trânsito; 1 nota → libera |
| RN-013 | `tests/faturamento.test.mjs` | sem nota e 2 dias → `''`; com nota → `R$ 72.000,00 (60 %) · saldo R$ 48.000,00`; sem nota e 4 dias → `Faturamento pendente · 4 dias úteis` |
| RN-014 | `smoke/…` | a rodada do cron não registra e-mail no coletor; a cobrança manual registra 1 com a cópia fixa |
| RN-015 | `smoke/…` | a 7003 não aparece em `sgcWintNfEntradas` nem em `sgcWintNfBuscar` |

- **Backend:** `backend/simulator/smoke/005-notas-fiscais.mjs`, um `teste()` por linha, título
  começando pelo id. Toda consulta ao WinThor assere **contagem > 0** (vazio não é verde).
- **Frontend:** `frontend/tests/{dias-uteis,nf,faturamento}.test.mjs` com `node --test` sobre
  `src/lib/`. `permissoes.test.mjs` (002) ganha as chaves novas.
- **Seed extra para o smoke:** nenhum além do `seed/005-notas-fiscais.mjs`.

## Dependências entre specs

**Consome da 001 (fornecedores):** `SGC_FORNECEDOR.VALIDADE_MINIMA_DIAS` (RN-005) e os contatos
de `SGC_FORNECEDOR_LINHA_CONTATO` por `sgcFornecedorCarregar`, para a cobrança escolher o
destinatário entre os cadastrados (EN-02 A). O seed da 001 ganha `VALIDADE_MINIMA_DIAS = 90` no
fornecedor 1015 e `= 180` no 1042 (C-011) — **pela base**, dona única do cadastro de fornecedores
no simulador (R-017/R-043); não é task desta spec. O padrão de 120 dias fica só na regra pura,
para o fornecedor sem mínimo cadastrado.

**Consome da lib (`@benenutri/mitra-kanban` 1.4.0):** `kbCardAtualizar` com `atualizadoPor` (int)
e `origem: 'sistema'`, que só valem sem sessão — é assim que o cron espelha o campo `faturamento`
na capa (R-042). Contrato, como o `kbCardMover` do R-021: até a 1.4.0 sair, os dois lados usam a
lib local por `npm link`.

**Consome da 002 (quadro):** `SGC_PEDIDO` (`VL_TOTAL`, `DT_ENVIO`, `NUMPED_WINTHOR`,
`EMAIL_ENVIO`, `PRAZO_ACORDADO`, `CODFORNEC`, `CODFILIAL`, `CRIADO_POR`); `SGC_FASE` pelas
chaves; `sgcEscComunicacaoInserir` para registrar a cobrança — SF SQL da 002, chamada **por id**
pelo `sgcCobrancaEnviar`, com a assinatura dela, que esta spec **não** altera (G-12):
`input: { cardId, tipo, para, cc, assunto, corpo, enviadoPor, enviadoEm }`, guardada por
`{{enviadoPor}}` (a guarda de persona da 002, não `:VAR_USER`); esta spec passa
`tipo = 'cobranca'`, `para`/`cc` com os destinatários resolvidos e `enviadoPor` = quem clicou;
`sgcPodeMover`, onde o integrador cola os dois fragmentos novos; `notificacoesUniao()`, que ganha
o ramo de `backend/sql/notificacoes-avisos.sql`; `abas/capa-do-quadro.ts` para o espelho do
cartão no caminho de tela.

**Consome da 003 (itens):** `SGC_PEDIDO_ITEM` (`CODPROD`, `DESCRICAO`, `QT_PEDIDA`,
`PRECO_CUSTO`, `STATUS`) e `lib/prazo-pagamento.ts` (`parcelasDoPrazo`, `textoDeParcelas`,
`normalizarPrazo`) — dono único da regra de parcelas (R-015).

**Consome da 004 (agenda):** `src/components/DatePicker.tsx` (UI-03 B).

**Consome da 007 (B.O.):** `SGC_PEDIDO.DT_PREVISAO_BO` e `SGC_BO_ITEM` (`STATUS = 'aberto'`), só
leitura, nas duas colunas novas de `sgcFaturamentoPendenteListar` (R-041, D-014). A listagem
degrada sem a 007: sem linhas em `SGC_BO_ITEM`, `QT_BO_ABERTO` é 0 e `DT_PREVISAO_BO` é vazio.

**Consome da base (S2):** `frontend/src/lib/csv.ts` (`textoCsv`, `baixarCsv`) e as chaves novas de
`lib/permissoes.ts` (R-028). É nesse mesmo arquivo que vivem os **itens de menu**: a constante
`MENU` de `lib/permissoes.ts` lista rota, rótulo e a chave `exige` de cada item, e o `AdminLayout`
só fornece o ícone (G-7) — as duas rotas desta spec entram lá, pelo integrador (T-049).

**Fornece:**

- `SGC_NF` com `DT_EMISSAO`, `DT_ENTRADA`, `DT_RECEBIMENTO`, `ALERTA_ATRASO_EM` e
  `NUMTRANSENT` — a **006** lê e escreve `DT_RECEBIMENTO`/`ALERTA_ATRASO_EM` e deriva a previsão
  sem armazená-la;
- `backend/lib/dias-uteis.mjs` e `frontend/src/lib/dias-uteis.ts` (R-025) — a **006** importa;
  assinatura congelada aqui;
- `SGC_AVISO` e `sgcEscAvisoInserir` (R-023) — a **006** (`nf_atrasada`, `nf_recebida`) e a
  **007** (`bo_previsao`) gravam **por id**, com `CHAVE` no formato `tipo:card:AAAA-MM-DD[:nf]`;
- `backend/sql/notificacoes-avisos.sql` (R-023) — o integrador liga no feed;
- `backend/sql/pendencias-transito.sql` e `pendencias-conclusao-nf.sql` (R-030) — a **006** testa
  o primeiro na entrada em Trânsito e os dois na conclusão; a **007** compõe os dela com estes no
  mesmo `CASE`;
- `SGC_PEDIDO.PERC_FATURADO_VALOR`/`VL_FATURADO` e o campo do quadro `faturamento` mais
  `ALERTA_FATURAMENTO_NIVEL` — a capa e a etiqueta são da **002**, que liga o que está aqui;
- `lib/nf.ts` (`classificarDelta`, `casarItem`) — disponível para a 007, que não precisa hoje;
- as chaves de `lib/permissoes.ts` (R-028) desta linha: `verNotasFiscais` e
  `verFaturamentoPendente` **incluem a diretoria** (leitura); `operarNf` (admin, analista,
  gestor, zerado por `READ_ONLY`) governa validar, decidir, cobrar **e também** o "Verificar
  entrada no WinThor" / "Sincronizar com o WinThor" da **006**; `registrarContato` acompanha
  `operarNf`.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | `sgcWintNfEntradas` devolve **uma linha por item** e a pontuação é calculada no JS por `pontuarSugestao()` | Agregar a cobertura no próprio SQL (`LISTAGG`/`COUNT` por NF), como o legado fazia por card | Uma consulta por fornecedor, e não por card (RNF-002), exige comparar a mesma nota com vários pedidos — o que só dá para fazer depois de ter os itens. De quebra, a fórmula de pontuação vira função pura testável, em vez de SQL Oracle que nenhum teste alcança |
| D-002 | O vínculo é **um lote de itens e um lote de ocorrências**, não uma escrita por linha | Uma execução por item e por ocorrência | Uma nota de 20 itens gera 83 registros; a 83 execuções o teto de 300/min do projeto vai embora com duas validações. O lote usa o mesmo `SELECT … UNION ALL` dentro de derivada da 003, que cabe a guarda de persona |
| D-003 | A capa do cartão é escrita **sempre por `kbCardAtualizar`** (lib): pela tela quando há sessão (`capa-do-quadro.ts` da 003, reusado) e por id, com `atualizadoPor` + `origem: 'sistema'`, no cron (R-042) | Uma `sgcEsc*` do SGC escrevendo `KB_CARD.VALORES_JSON` com `JSON_SET` | Decisão do 000 (R-042): o SGC não escreve na tabela da lib. Escrita própria no `VALORES_JSON` deixaria `TEXTO_BUSCA` defasado e criaria um segundo dono do card; a lib 1.4.0 já abre o caminho sem sessão que o cron precisa, com a mesma premissa de `kbCardCriar`/`kbCardMover` |
| D-004 | O monitoramento cobre `enviado`, `transito` **e** `faturamento` | As duas fases do legado (Enviado e Trânsito) | No SGC 2 o card entra em Faturamento quando 100 % das notas foram **recebidas** (R-031), o que não é 100 % faturado: parar de cobrar ali deixaria o saldo sem dono |
| D-005 | O contato da cobrança é gravado **pela tela** (`sgcEscContatoInserir`, `:VAR_USER`), logo depois do `ok` de `sgcCobrancaEnviar` | `sgcCobrancaEnviar` gravar o contato por id | Uma escrita por id guardada só por `{{usuarioId}}` deixa qualquer usuário atribuir um contato a outra pessoa (achado A1). Como o clique é da tela, o `:VAR_USER` está ali: é o mesmo padrão de `api.cardCriar` → `sgcEscPedidoCriar` da 002. Se a tela morrer no meio, o pior caso é um e-mail enviado sem o contato registrado — o e-mail já ficou em `SGC_COMUNICACAO` |
| D-006 | A ocorrência guarda **dados** (`TIPO`, `RESULTADO`, esperado, encontrado, delta), não a frase | Coluna `DESCRICAO` com o texto pronto, como no legado | Texto pronto no banco envelhece: mudar uma palavra exigiria migração de dados, e a mesma regra passaria a ter duas redações. `textoDaOcorrencia()` monta na tela e é testável |
| D-007 | `item_nao_pedido` é o tipo do **casamento**, com os três resultados (`conforme` quando casou por código, `atencao` por código de fábrica/EAN, `divergente` quando não casou) | Criar um tipo `casamento_item` | O 000 fechou os sete tipos e **recusou** a renomeação (R-043): um oitavo tipo seria mudança de contrato para ganhar só clareza de nome |
| D-008 | O `sgcNfDetectar` grava aviso do tipo `nf_sugerida` | Cron sem aviso, só com a nota no histórico | R-023 manda todo cron gravar aviso e nota; nenhum dos seis tipos do 000 cobria sugestão, e o 000 **aceitou** `nf_sugerida` como oitavo (R-043). Sem ele, a sugestão só apareceria para quem abre `/notas-fiscais` |
| D-009 | A recusa de mover (Trânsito e conclusão) é **só do servidor** (confirmado pelo R-046); `transicoes.ts` ganha os textos em `MOTIVOS` mas nenhum ramo novo em `motivoDeDestino`, nenhum `antesDeMover`/`podeMover` novo (G-14) | Espelhar a trava na tela, como o resto da matriz | O espelho síncrono precisaria da contagem de notas e de ocorrências em cada cartão do quadro — uma SF por cartão (proibido) ou dois campos novos no quadro. Quem recusa é o gancho, e a lib já mostra o motivo na faixa de aviso do card. O teste de 500 combinações (RNF-005 da 002) continua valendo sem alteração |
| D-010 | Dias úteis por aritmética de `DATEDIFF`/`FLOOR`/`MOD`/`LEAST` a partir de uma segunda-feira fixa | A tabela de lookup `MID('01234444…')` + `WEEKDAY` do legado | `WEEKDAY` e `MID` seriam dois shims novos no simulador e a string de 40 caracteres é ilegível; a aritmética usa quatro funções comuns, é a mesma nos dois lados e casa com a conferência do R-025 |
| D-011 | A aba carrega **tudo** numa SF (`sgcNfListar`), inclusive contatos | Uma SF por bloco (sugestões, notas, ocorrências, contatos) | RNF-001 e o teto de 300/min: abrir um card já custa `kbCardDetalhe` + `sgcPedidoCarregar`; uma terceira execução é o limite, quatro não |
| D-012 | Ao vincular uma nota que **já entrou** no ERP (`PCNFENT.DTENT` preenchido), `sgcNfVincular` grava `DT_RECEBIMENTO = DT_ENTRADA`: a nota nasce recebida e o cron da 006 não a procura. Sem `DTENT` (registro híbrido), `DT_ENTRADA` e `DT_RECEBIMENTO` nascem vazias e o recebimento é da 006 | Deixar `DT_RECEBIMENTO` para a 006 preencher sempre | O 000 é explícito, e sem isso uma nota que já entrou no ERP ficaria "não recebida" até a próxima rodada de 2 h da 006 — e o card não sairia de Trânsito sozinho. Contrato alinhado com o plan da 006 |
| D-013 | Divergência não impede o vínculo, mas **decisão pendente** impede concluir | Bloquear o vínculo na divergência | RN-5 e RN-7 do legado, confirmadas em O2-02: a nota existe no mundo real de qualquer jeito; o que o sistema cobra é a decisão de uma pessoa sobre ela |
| D-014 | Pedido em `bo` **é listado** em `/faturamentos-pendentes` (com `DT_PREVISAO_BO` e `QT_BO_ABERTO`) e **não é avisado** pelo cron | Tirar o pedido em B.O. da lista, ou avisar como qualquer outro | R-041: quem está em B.O. já recebe o aviso diário `bo_previsao` da 007; um segundo aviso por dia sobre o mesmo pedido foi defeito corrigido no legado. Mas o saldo a faturar continua existindo e continua sendo cobrado por gente, então sumir da lista seria pior — a lista mostra, no lugar do aviso, a previsão de liberação e quantos itens seguem em aberto |
| D-015 | A marca do alerta (`ALERTA_FATURAMENTO_NIVEL`/`_EM`) é escrita própria **por id** (`sgcEscPedidoAlertaFaturamento`, `{{usuarioId}}` = responsável do card), separada de qualquer escrita de tela | Reaproveitar `sgcEscPedidoFaturamento` para gravar também o nível | Quem grava o nível é só o cron, que não tem sessão; misturar com a escrita do faturamento (chamada também no vínculo, a partir de um clique) faria um caminho de tela mexer no escalonamento sem querer. Mesmo desenho que a 007 usa em `sgcEscPedidoAlertaBo` |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `IN ({{numpeds}})` com muitos pedidos estoura `ORA-01795` (1.000 itens) | a rodada de detecção falha no fornecedor grande | o lote é de 30 cards e a lista é por grupo (fornecedor + filial): chegar a 1.000 números exigiria 1.000 pedidos abertos do mesmo fornecedor. O JS ainda assim fatia em 500, como a 003 faz com `codprods` |
| Nota com 2.000 linhas de item na consulta por fornecedor | truncamento silencioso do `ROWNUM <= 2000` | o corte é por emissão decrescente, então o que cai é o mais antigo (já fora da janela útil); o retorno traz a contagem e a rodada registra "consulta truncada" nos erros |
| A lib 1.4.0 (`kbCardAtualizar` com `atualizadoPor` + `origem: 'sistema'`) não estar publicada quando esta spec for implementada | a etiqueta da capa não aparece pelo caminho do cron (o de tela funciona) | é contrato, como o `kbCardMover` do R-021: os dois lados usam a lib local por `npm link` até a publicação. O cron protege a chamada com `try/catch` — capa que não espelha não derruba o aviso, que é a parte que não pode faltar |
| Escrita guardada recusada devolve 0 linhas e nenhum erro (D-03 da onda 1) | a tela acredita que gravou o contato ou a decisão | as ações desta spec passam por JS que relê e devolve a contagem (`decididas`, `pendentes`, `itens`), então a tela compara o esperado com o obtido em vez de confiar no silêncio |
| O fornecedor emite a nota com `CODPROD` próprio e sem `CODFAB` nem EAN cadastrados | tudo vira `item_nao_pedido` divergente | é o comportamento correto (o item realmente não é identificável), e a ocorrência traz o código encontrado para o cadastro ser corrigido; C-009 fixa isso como esperado |
| Duas rodadas do cron em paralelo (rodada longa + a seguinte) | aviso ou sugestão duplicada | `UNIQUE (CHAVE)` em `SGC_AVISO` e as duas chaves de `SGC_NF_SUGESTAO` recusam a segunda escrita; nenhuma delas depende de "ler antes de gravar" |

## Pedidos ao 000 — respondidos (R-042, R-043)

Os seis pedidos desta spec foram decididos pelo 000; nada fica em aberto.

| # | Pedido | Decisão | Onde entrou |
|---|---|---|---|
| 1 | `UNIQUE (ID_CARD, CODFORNEC, NUMNOTA, SERIE)` em `SGC_NF_SUGESTAO` | **aceito** | *Modelo de dados*, T-001 |
| 2 | `nf_sugerida` nos tipos de `SGC_AVISO` | **aceito** | *Modelo de dados*, D-008, T-018 |
| 3 | renomear `item_nao_pedido` para `casamento_item` | **recusado** — o tipo fica com esse nome | D-007 |
| 4 | o contato da cobrança é gravado pela tela | **aceito** — o JS grava só `SGC_COMUNICACAO` | D-005, T-020, T-045 |
| 5 | escrita própria em `KB_CARD.VALORES_JSON` | **mudado (R-042)** — o SGC não escreve em `KB_CARD`: com sessão, a tela chama `kbCardAtualizar` por `capa-do-quadro.ts`; sem sessão, o cron chama `kbCardAtualizar` por id com `atualizadoPor` e `origem: 'sistema'` (lib 1.4.0). `sgcEscPedidoFaturamentoCapa` e o `JSON_SET` saíram | *O espelho da capa*, D-003, T-012, T-019, T-046 |
| 6 | `VALIDADE_MINIMA_DIAS = 180` no fornecedor 1042 | **aceito** — feito **pela base** (R-017), não é task desta spec | *Dependências entre specs* |

## Complexity Tracking

Vazio: nenhuma violação de princípio.
