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
- **Reuso identificado:** `@benenutri/mitra-kanban` (`abasExtras`, `ExtensaoContexto`, `kbNotaRegistrar`, `kbCardAtualizar`); `page.tsx` (`Panel`, `PanelHeader`, `Toolbar`, `SearchInput`, `SelectMenu`, `Table`/`Th`/`Td` com `numeric`, `RowTitle`, `RowMeta`, `Status`, `Badge`, `Code`, `Dash`, `Alert`, `EmptyState`, `Pagination`, `Dialog`, `Field`); `lib/formato.ts`; `lib/prazo-pagamento.ts` (003) para as parcelas; `abas/capa-do-quadro.ts` (003) para o espelho do cartão; `sgcEscComunicacaoInserir` (002) para registrar a cobrança; `DatePicker` (004)
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
`UNIQUE KEY UK_SGC_NF_SUGESTAO (CHAVENFE, ID_CARD)` (do 000) **e**
`UNIQUE KEY UK_SGC_NF_SUGESTAO_NOTA (ID_CARD, CODFORNEC, NUMNOTA, SERIE)` — ver *Pedidos ao 000*:
`CHAVENFE` é vazia em nota sem XML, e sem a segunda chave a rodada de 30 em 30 minutos
duplicaria a sugestão dessas notas.

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

`CHAVE` é `tipo:card:AAAA-MM-DD[:nf]` — é ela, e só ela, que impede dois avisos iguais no mesmo
dia (RN-009) e que faz da escrita a exceção sem guarda de persona do R-023.
Tipos gravados por esta spec: `nf_sugerida`, `faturamento_3`, `faturamento_5`,
`faturamento_diario`. Os outros (`nf_atrasada`, `nf_recebida`, `bo_previsao`) são da 006 e da 007.

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
(leitura e JS) e **7550–7560** (escrita), faixa 75xx do R-024. Filtro desligado é `''` no texto e
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
| `sgcNfSugestoesListar` | `status` (''), `codfornec` (0), `busca` (''), `limite` (50), `offset` (0) | `ID, ID_CARD, CARD_TITULO, FASE, FORNECEDOR, FILIAL, VL_PEDIDO, NUMNOTA, SERIE, CHAVENFE, NUMTRANSENT, DT_EMISSAO, DT_ENTRADA, VL_TOTAL, ORIGEM, SCORE, STATUS, MOTIVO, NUMPED_WINTHOR, DECIDIDO_POR, DECIDIDO_NOME, DECIDIDO_EM, CRIADO_EM` | RF-024 |
| `sgcNfSugestoesListarTotal` | os mesmos filtros | `TOTAL` | RF-024, RNF-005 |
| `sgcFaturamentoPendenteListar` | `faixa` (''), `busca` (''), `limite` (50), `offset` (0) | `ID_CARD, TITULO, FASE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, NUMPED, DT_ENVIO, EMAIL_ENVIO, VL_TOTAL, VL_FATURADO, PERC_VALOR, PERC_QTD, DT_PRIMEIRO_FATURAMENTO, ALERTA_NIVEL, DIAS_UTEIS, QT_CONTATOS, DT_ULTIMO_CONTATO, ULTIMO_CONTATO_POR, DT_PREVISAO_BO, QT_BO_ABERTO` | RF-025, C-028 |
| `sgcFaturamentoPendenteListarTotal` | os mesmos filtros | `TOTAL` | RF-025, RNF-005 |
| `sgcContatosListar` | `cardId` (0), `limite` (50), `offset` (0) | `ID, DT_CONTATO, CANAL, RESUMO, PREVISAO_FATURAMENTO, REGISTRADO_POR, REGISTRADO_NOME` | RF-022 |

**`sgcNfSugestoesListar`** — a sugestão some da fila quando a nota já foi vinculada em qualquer
card (RN-010), sem precisar de rotina de limpeza; o filtro só vale para o que ainda está
`sugerida`, para a auditoria do que foi validado/recusado continuar legível:

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

**`sgcFaturamentoPendenteListar`** — `<DIAS>` é `diasUteisEntre('P.DT_ENVIO', 'CURDATE()')` do
`backend/lib/dias-uteis.mjs`; as faixas do R-025 não se sobrepõem, então o total da tela é a soma
dos filtros mais os pedidos com menos de 3 dias úteis:

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
| `sgcFaturamentoMonitorar` | JAVASCRIPT, cron `0 0 11 * * *` | — | `{ ok, pendentes, avisos, encerrados, erros }` | RF-018..RF-021 |
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
  (`sgcEscOcorrenciaInserir`), recalcula o faturamento (`sgcEscPedidoFaturamento`), atualiza a
  capa (`sgcEscPedidoFaturamentoCapa`) e registra a nota do histórico. São **6 execuções
  aninhadas**, quaisquer que sejam os itens (D-002).
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
  `PARA_PERSONA = 'gestor'`; depois `sgcEscPedidoAlertaFaturamento`,
  `sgcEscPedidoFaturamentoCapa` e `kbNotaRegistrar`. **Não** envia e-mail (RN-014) e **não**
  consulta o ERP (RNF-003).
- **`sgcCobrancaEnviar`** — persona igual à do vínculo; `sendEmailMitra` com o contato escolhido
  mais a cópia fixa `compras@benenutri.com`, sem duplicar o destinatário (EM-02); grava a
  comunicação por `sgcEscComunicacaoInserir` (SF da 002, por id, `tipo = 'cobranca'`) e a nota do
  histórico. **Não** grava o contato: quem grava é a tela, por `sgcEscContatoInserir` com
  `:VAR_USER`, logo depois do `ok` (D-005).

### Escritas SQL (uma instrução por SF)

| Nome | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|
| `sgcEscNfInserir` | `{{usuarioId}}` | `cardId`, `numnota`, `serie`, `chavenfe`, `numtransent`, `codfornec`, `codfilial`, `dtEmissao`, `dtEntrada`, `vlTotal`, `prazoParcelas`, `origem`, `usuarioId`, `agora` | `INSERT … SELECT … FROM DUAL WHERE NOT EXISTS (nota já vinculada) AND <guarda>` | RF-006, RN-010 |
| `sgcEscNfItemInserir` | `{{usuarioId}}` | `linhas` (fragmento `SELECT … UNION ALL`), `usuarioId` | `INSERT INTO SGC_NF_ITEM (…) SELECT * FROM ({{linhas}}) LOTE WHERE <guarda> ON DUPLICATE KEY UPDATE` | RF-006 |
| `sgcEscOcorrenciaInserir` | `{{usuarioId}}` | `linhas`, `usuarioId` | idem, sobre `SGC_NF_OCORRENCIA` | RF-006 |
| `sgcEscOcorrenciaDecidir` | `{{usuarioId}}` | `cardId`, `id` (0 = lote), `modo`, `decisao`, `justificativa`, `usuarioId`, `decididoEm` | `UPDATE … SET DECISAO, JUSTIFICATIVA, DECIDIDO_POR, DECIDIDO_EM WHERE ID_CARD = … AND DECISAO = 'pendente' AND ({{id}} = 0 OR ID = {{id}}) AND ('{{modo}}' <> 'conformes' OR RESULTADO = 'conforme') AND <guarda>` | RF-011, RF-012 |
| `sgcEscSugestaoInserir` | `{{usuarioId}}` | `chavenfe`, `numtransent`, `numnota`, `serie`, `codfornec`, `codfilial`, `vlTotal`, `dtEmissao`, `dtEntrada`, `cardId`, `numped`, `origem`, `score`, `motivo`, `usuarioId`, `criadoEm` | `INSERT … SELECT … FROM DUAL WHERE NOT EXISTS (mesma sugestão) AND NOT EXISTS (nota já vinculada) AND <guarda>` | RF-001, RF-003 |
| `sgcEscSugestaoDecidir` | `:VAR_USER` + persona | `id`, `status`, `motivo`, `decididoEm` | `UPDATE SGC_NF_SUGESTAO SET STATUS, MOTIVO, DECIDIDO_POR = :VAR_USER, DECIDIDO_EM WHERE ID = {{id}} AND STATUS = 'sugerida' AND <guarda>` | RF-024 |
| `sgcEscContatoInserir` | `:VAR_USER` + persona | `cardId`, `dtContato`, `canal`, `resumo`, `previsao`, `criadoEm` | `INSERT … SELECT … FROM DUAL WHERE TRIM('{{resumo}}') <> '' AND <guarda>` | RF-022 |
| `sgcEscPedidoFaturamento` | `{{usuarioId}}` | `idCard`, `usuarioId`, `agora` | `UPDATE SGC_PEDIDO` com as quatro medidas **somadas no próprio banco** | RF-016 |
| `sgcEscPedidoFaturamentoCapa` | `{{usuarioId}}` | `idCard`, `texto`, `usuarioId` | `UPDATE KB_CARD SET VALORES_JSON = JSON_SET(…, '$.faturamento', '{{texto}}')` | RF-017 |
| `sgcEscPedidoAlertaFaturamento` | `{{usuarioId}}` | `idCard`, `nivel`, `alertaEm`, `usuarioId` | `UPDATE SGC_PEDIDO SET ALERTA_FATURAMENTO_NIVEL, ALERTA_FATURAMENTO_EM` | RF-019, RF-020 |
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

E a capa do cartão, que o cron também precisa escrever e não pode passar por `kbCardAtualizar`
(a SF da lib exige sessão):

```sql
UPDATE KB_CARD
SET VALORES_JSON = JSON_SET(COALESCE(NULLIF(VALORES_JSON, ''), '{}'), '$.faturamento', '{{texto}}')
WHERE ID = {{idCard}} AND EXCLUIDO_EM IS NULL AND {{usuarioId}} > 0
  AND <guarda de persona sobre {{usuarioId}}>
```

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
WHEN T.PAR = 'enviado>transito'     AND T.PENDENCIAS_TRANSITO > 0 THEN 0
WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') AND T.PENDENCIAS_NF > 0 THEN 0
-- e, no MOTIVO:
WHEN T.PAR = 'enviado>transito'     THEN T.PENDENCIAS_TRANSITO_MOTIVO
WHEN T.PAR IN ('faturamento>concluido', 'bo>concluido') THEN T.PENDENCIAS_NF_MOTIVO
```

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
| 7509 | `sgcFaturamentoPendenteListarTotal` | 7558 | `sgcEscPedidoFaturamentoCapa` |
| 7510 | `sgcContatosListar` | 7559 | `sgcEscPedidoAlertaFaturamento` |
| 7511 | `sgcNfDetectar` | 7560 | `sgcEscAvisoInserir` |
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
| `frontend/src/pages/quadros/abas/NotasFiscais.tsx` | `AbaNotasFiscais(ctx: ExtensaoContexto)` — uma chamada de `sgcNfListar` por abertura |
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
  (`tone="success"`), `atencao` (`tone="attention"`), `divergente` (`tone="danger"`); a decisão é
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
4. `sgcNfVincular` grava nota, itens e ocorrências, recalcula o faturamento e a capa. A aba
   recarrega com uma chamada de `sgcNfListar`.
5. A compradora decide as ocorrências: "Aceitar todos os conformes" (`modo: 'conformes'`) ou uma
   a uma; recusar abre o diálogo de justificativa. Enquanto houver pendente, concluir o pedido é
   recusado pelo gancho do servidor.
6. Mover para "Em Trânsito para BN" sem nota é recusado pelo gancho, com o texto do fragmento; a
   lib mostra o motivo na faixa de aviso do card.
7. Todo dia às 11h UTC `sgcFaturamentoMonitorar` roda: quem passou de 3 e de 5 dias úteis ganha
   aviso, nível e etiqueta na capa; acima de 5, uma vez por dia; 100 % em valor encerra.
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
| `enviadoComPedido` | `enviado` | 1015/filial 1, `NUMPED_WINTHOR` 998877, `DT_ENVIO` = hoje − 3 dias úteis, `VL_TOTAL` 120.000,00, 5 itens somando 2.000 un | C-001, C-017, C-021 |
| `enviadoSemPedido` | `enviado` | 1015/filial 1, sem `NUMPED_WINTHOR`, `DT_ENVIO` = hoje − 5 dias úteis, 5 itens (5001…5005) | C-002, C-022 |
| `faturamentoParcial` | `faturamento` | 1015/filial 1, `DT_ENVIO` = hoje − 3 dias úteis, `VL_TOTAL` 120.000,00 em 2.000 un, com a NF 7001 já vinculada (72.000,00 / 1.200 un) e 1 contato | C-014, C-019, C-024, C-026 |
| `conferencias` | `faturamento` | 1015/filial 1, `DT_ENVIO` = hoje − 4 dias úteis, 3 itens a 10,0000 / 20,0000 / 30,0000 e a NF 7002 pronta para validar | C-007, C-010, C-011, C-012, C-015, C-016, C-018, C-026 |
| `notaDeOutro` | `transito` | 1042/filial 1, com a NF **7004** já vinculada e cobrindo **100 %** do `VL_TOTAL` (fica fora da lista de pendentes) | C-003 |
| `semNota` | `enviado` | 1042/filial 1, `DT_ENVIO` = hoje − 1 dia útil, sem nota e sem contato | C-005, C-026 (sem contato) |
| `semNota2` | `enviado` | 1042/filial 2, `DT_ENVIO` = hoje − 2 dias úteis, sem nota e sem contato | C-026 (sem contato) |
| `atrasadoNove` | `transito` | 1015/filial 1, `DT_ENVIO` = hoje − 9 dias úteis, 1 contato registrado | C-023, C-026 |
| `cemPorCento` | `faturamento` | 1015/filial 1, `VL_TOTAL` 50.000,00 com NF de 50.000,00 e `ALERTA_FATURAMENTO_NIVEL` 5 | C-020 |
| `emBo` | `bo` | 1015/filial 1, `DT_ENVIO` = hoje − 7 dias úteis, `VL_TOTAL` 30.000,00 sem nota | C-028 |

As datas de envio são calculadas pelo `somarDiasUteisData` de `backend/lib/dias-uteis.mjs` a
partir de hoje, para os níveis do cron serem determinísticos em qualquer dia em que o smoke rode.

**WinThor (`PCNFENT` + `PCMOV` `CODOPER = 'E'` + `PCLANC`):**

| Nota | Situação | Para quê |
|---|---|---|
| 7001 · série 1 · `NUMTRANSENT` 9001 | emissão 11/09/2026, entrada 14/09/2026, 72.000,00, `NUMPED` 998877, 3 itens, duplicatas em 28/35/42 dias | C-001, C-007, C-013, C-014 |
| 7002 · série 1 · `NUMTRANSENT` 9002 | emissão = envio + 3 dias, sem `NUMPED`, 4 dos 5 produtos do `enviadoSemPedido`, valor dentro do saldo; itens com preço 10,0000 / 20,1600 / 30,4500, um lote válido até 01/02/2027 e outro até 01/12/2026, um item com `QT` 120 contra 100 pedidas e outro com 60 contra 100 | C-002, C-008, C-009, C-010, C-011, C-012 |
| 7003 · `NUMTRANSENT` 9003 | `DTCANCEL` preenchida | C-004 |
| 7004 · `NUMTRANSENT` 9004 | entrada normal, **já vinculada** ao card `notaDeOutro` | C-003 |
| 7005 · `NUMTRANSENT` 9005 | emissão 13/09/2026, **`DTENT` nulo**, 2 itens, duplicatas 30/60 | C-006, C-013 (divergente) |

Faixa de numeração reservada (combinada com a 006): as notas desta spec ficam com
`NUMNOTA < 90000`; **90001–90015** são da 006 (nota cancelada, duas filiais, sem entrada) e a 007
não semeia nota nenhuma.

Um item da 7002 tem `CODPROD` 9001 (inexistente no pedido) com `CODFAB` `'FK-123'` igual ao do
produto 5001, e outro com `CODAUXILIAR` `'7891234567890'` igual ao do 5002: são os dois
casamentos alternativos de C-008. Um terceiro, `CODPROD` 9999 sem `CODFAB` nem EAN conhecidos, é
o item não pedido de C-009. O fornecedor 1042 recebe `VALIDADE_MINIMA_DIAS` 180 no seed da 001
(**pedido ao integrador**, uma linha) para a segunda metade de C-011.

**Contatos e avisos:** 1 contato no `atrasadoNove` (canal telefone, 2 dias atrás) e 1 no
`faturamentoParcial`; nenhum aviso — os avisos nascem do cron, e é isso que o smoke prova.

### `CHECK_INPUT`

Acrescentar em `backend/simulator/config.mjs` (arquivo do integrador), seção 005:
`numnota: '7001'`, `serie: ''`, `numpeds: '998877'`, `dataEnvio: '2026-08-01'`,
`status: ''`, `faixa: ''`, `idSugestao: '0'`, `idOcorrencia: '0'`, `modo: 'individual'`,
`decisao: 'aceito'`, `justificativa: ''`, `chave: 'faturamento_3:1:2026-09-15'`,
`tipo: 'faturamento_3'`, `paraUsuarioId: '0'`, `paraPersona: ''`, `texto: 'x'`, `nivel: '3'`,
`vlTotal: '0'`, `numtransent: '0'`, `chavenfe: ''`, `dtEmissao: '2026-09-11'`,
`dtEntrada: '2026-09-14'`, `prazoParcelas: '28/35/42'`, `canal: 'telefone'`, `resumo: 'x'`,
`previsao: '2026-09-20'`, `dtContato: '2026-09-15T12:00:00'`, `score: '100'`,
`alertaEm: '2026-09-15T12:00:00'`, `criadoEm: '2026-09-15T12:00:00'`,
`decididoEm: '2026-09-15T12:00:00'`. `codfornec`, `codfilial`, `cardId`, `idCard`, `usuarioId`,
`busca`, `limite`, `offset`, `agora`, `motivo` e `origem` já existem (D-09 da onda 1 vale: o
objeto é um só e a última chave ganha — os valores da 005 não podem quebrar as seções anteriores,
por isso nenhum dos nomes repetidos muda de valor aqui).

### Dialeto

`NVL`, `TO_DATE`, `TO_CHAR`, `TRUNC`, `CONCAT`, `DATEDIFF`, `LEAST`, `GREATEST`, `DATE_FORMAT` e
`ROWNUM` já são shims. Esta spec acrescenta o uso de:

- **`FLOOR`** e **`MOD`** — os dois fragmentos de dias úteis (`MOD(a, b)` existe em MySQL; no
  SQLite é o operador `%`, e `FLOOR` depende de flag de compilação, por isso vira função
  registrada, como o `CEIL` já é);
- **`DATE_ADD(col, INTERVAL <expressão> DAY)`** — hoje a reescrita só reconhece literal inteiro
  (`INTERVAL 30 DAY`); precisa aceitar uma expressão entre parênteses para o `somarDiasUteis`;
- **`JSON_SET`** — existe nos dois (MySQL nativo, SQLite `json_set`), só conferir que o
  `mapOutsideStrings` não toca no caminho `'$.faturamento'`.

Os três são **pedidos ao integrador** em `backend/simulator/mysql-dialect.mjs`.

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `smoke/005-notas-fiscais.mjs` | `sgcNfDetectar` cria 1 sugestão da nota 7001 para `enviadoComPedido`, `SCORE = 100`, `ORIGEM = 'pedido'`; `SELECT COUNT(*) FROM SGC_NF` continua no que era antes |
| C-002 | `smoke/…` + `tests/nf.test.mjs` | a sugestão de `enviadoSemPedido` sai com `SCORE = 88`, `ORIGEM = 'heuristica'` e `MOTIVO` contendo "4 de 5"; `pontuarSugestao` com cobertura 4/5, +3 dias e valor no saldo → 88 |
| C-003 | `smoke/…` | a nota 7004 não aparece em `sgcNfSugestoesListar`; `sgcNfVincular` dela em outro card devolve `ok: false` com "já está vinculada" |
| C-004 | `smoke/…` | `sgcWintNfEntradas` do 1015 não traz a 7003 (e traz > 0 linhas); nenhuma sugestão dela |
| C-005 | `smoke/…` | `sgcNfListar` do card `semNota` devolve `sugestoes: []` e `nfs: []`; `sgcWintNfBuscar` com 7005 devolve 1 linha |
| C-006 | `smoke/…` | `sgcWintNfBuscar` (7005) devolve `DT_ENTRADA` vazio, série, emissão e valor; `sgcWintNfItens` da 7005 devolve 2 itens (> 0) |
| C-007 | `smoke/…` | validar a sugestão do card `conferencias` grava 1 linha em `SGC_NF`, 3 em `SGC_NF_ITEM` e **15** em `SGC_NF_OCORRENCIA`, todas `pendente`, e 1 nota no histórico do card |
| C-008 | `tests/nf.test.mjs` + `smoke/…` | `casarItem` devolve `codfab` e `ean` na ordem certa; as ocorrências dos dois itens saem `atencao` com o código no `VALOR_ENCONTRADO` |
| C-009 | `smoke/…` | o item 9999 gera 1 ocorrência `item_nao_pedido` com `RESULTADO = 'divergente'` |
| C-010 | `tests/nf.test.mjs` + `smoke/…` | `classificarDelta(20, 20.16)` → `atencao` 0,008; `(30, 30.45)` → `divergente` 0,015; `(10, 10)` → `conforme` 0; as três ocorrências `preco_divergente` gravadas com esses resultados |
| C-011 | `tests/nf.test.mjs` + `smoke/…` | `diasDeValidade('2026-09-11', '2027-02-01')` → 143 e `resultadoDeValidade(143, 120)` → `conforme`; `(81, 120)` → `divergente`; com o fornecedor 1042 (mínimo 180) a nota vinculada gera as duas `validade_curta` divergentes |
| C-012 | `tests/nf.test.mjs` | `resultadoDeQuantidade(100, 120)` → `divergente`; `(100, 60)` → `conforme` com "saldo de 40"; `(100, 100)` → `conforme` |
| C-013 | `tests/nf.test.mjs` + `smoke/…` | `sgcWintNfParcelas` da 7001 devolve 3 linhas (> 0) com `DIAS` 28/35/42; `resultadoDePrazo('28/35/42', [28,35,42], 0)` → `conforme`; da 7005 (30/60) → `divergente` com os dois textos |
| C-014 | `tests/faturamento.test.mjs` + `smoke/…` | `percentuaisFaturados({120000, 72000, 2000, 1200})` → 60 / 60 / 48000; depois do vínculo, `SGC_PEDIDO` do card traz `PERC_FATURADO_VALOR = 60` e `PERC_FATURADO_QTD = 60` |
| C-015 | `smoke/…` | com 12 ocorrências (9 conformes), `sgcOcorrenciaDecidir` com `modo: 'conformes'` devolve `decididas: 9` e deixa `pendentes: 3` numa execução |
| C-016 | `smoke/…` | recusar com 9 caracteres devolve `ok: false` citando a justificativa; com 10, grava `DECISAO = 'recusado'`, `DECIDIDO_POR` e `DECIDIDO_EM`; `SGC_NF` do card continua com 1 linha nos dois casos |
| C-017 | `smoke/…` | `sgcPodeMover` de `enviado` para `transito` no card `semNota` devolve `PODE = 0` e o `MOTIVO` exato do fragmento; no `enviadoComPedido` com 1 nota, `PODE = 1` e `MOTIVO` vazio |
| C-018 | `smoke/…` | `sgcPodeMover` para `concluido` com 3 ocorrências pendentes → `PODE = 0` e `MOTIVO` contendo "3 conferências"; decididas as três, `PODE = 1`; o mesmo par saindo de `bo` |
| C-019 | `tests/faturamento.test.mjs` + `smoke/…` | `textoDaCapaFaturamento` devolve `R$ 72.000,00 (60 %) · saldo R$ 48.000,00`; depois do vínculo, `KB_CARD.VALORES_JSON` do card tem esse texto na chave `faturamento` e `DT_PRIMEIRO_FATURAMENTO` é `2026-09-11` |
| C-020 | `smoke/…` | `sgcFaturamentoMonitorar` sobre o card `cemPorCento` devolve `encerrados: 1`, zera `ALERTA_FATURAMENTO_NIVEL`, não cria aviso e o card some de `sgcFaturamentoPendenteListar` |
| C-021 | `smoke/…` | a rodada cria 1 `SGC_AVISO` `faturamento_3` para `enviadoComPedido` com "3 dias úteis" e o fornecedor no `TEXTO`, `PARA_USUARIO_ID = 0`, nível 3 gravado e 1 nota no histórico |
| C-022 | `smoke/…` | a rodada cria 2 avisos para `enviadoSemPedido` (`faturamento_5` com `PARA_USUARIO_ID = 0` e outro com `PARA_PERSONA = 'gestor'`) e nível 5 |
| C-023 | `smoke/…` | duas rodadas seguidas sobre `atrasadoNove` criam 1 aviso `faturamento_diario`, não 2; a `CHAVE` é `faturamento_diario:<card>:<hoje>` |
| C-024 | `smoke/…` | dois `sgcEscContatoInserir` no mesmo card → `sgcContatosListar` devolve 2, o mais novo primeiro; `sgcFaturamentoPendenteListar` traz `QT_CONTATOS = 2` e a data do último |
| C-025 | `smoke/…` | `sgcCobrancaEnviar` devolve `destinatarios` com o contato e `compras@benenutri.com`, o coletor de e-mails do smoke registra 1 envio e `SGC_COMUNICACAO` ganha 1 linha `cobranca`; a rodada do cron não gera e-mail nenhum |
| C-026 | `smoke/…` + `tests/faturamento.test.mjs` | `sgcFaturamentoPendenteListarTotal` = 8; `faixa: 'sem_contato'` = 2, `'3'` = 3, `'5'` = 1, `'mais5'` = 2; `busca: 'Fresenius'` recorta; `colunasDoCsv` devolve o cabeçalho e uma linha por pedido, na ordem da tela (o escape é de `lib/csv.ts`, testado pela base) |
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
destinatário entre os cadastrados (EN-02 A). Pede ao seed da 001 uma linha:
`VALIDADE_MINIMA_DIAS = 180` no fornecedor 1042.

**Consome da 002 (quadro):** `SGC_PEDIDO` (`VL_TOTAL`, `DT_ENVIO`, `NUMPED_WINTHOR`,
`EMAIL_ENVIO`, `PRAZO_ACORDADO`, `CODFORNEC`, `CODFILIAL`, `CRIADO_POR`); `SGC_FASE` pelas
chaves; `sgcEscComunicacaoInserir` (por id, `tipo = 'cobranca'`) para registrar a cobrança;
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
`lib/permissoes.ts` (R-028).

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
| D-003 | A capa do cartão é escrita por `kbCardAtualizar` (lib) no caminho de tela e por `sgcEscPedidoFaturamentoCapa` (`JSON_SET`) no caminho de cron | Só `kbCardAtualizar`; ou só a escrita SQL | `kbCardAtualizar` recusa sem sessão (`Sessão inválida`), e o cron não tem nenhuma. A escrita SQL é cirúrgica (uma chave do JSON) e não mexe em título, responsáveis nem prazo. `ponytail:` ela não atualiza `TEXTO_BUSCA`, então o texto do faturamento não entra na busca do quadro — se um dia precisar, o caminho é a lib ganhar uma escrita de campo |
| D-004 | O monitoramento cobre `enviado`, `transito` **e** `faturamento` | As duas fases do legado (Enviado e Trânsito) | No SGC 2 o card entra em Faturamento quando 100 % das notas foram **recebidas** (R-031), o que não é 100 % faturado: parar de cobrar ali deixaria o saldo sem dono |
| D-005 | O contato da cobrança é gravado **pela tela** (`sgcEscContatoInserir`, `:VAR_USER`), logo depois do `ok` de `sgcCobrancaEnviar` | `sgcCobrancaEnviar` gravar o contato por id | Uma escrita por id guardada só por `{{usuarioId}}` deixa qualquer usuário atribuir um contato a outra pessoa (achado A1). Como o clique é da tela, o `:VAR_USER` está ali: é o mesmo padrão de `api.cardCriar` → `sgcEscPedidoCriar` da 002. Se a tela morrer no meio, o pior caso é um e-mail enviado sem o contato registrado — o e-mail já ficou em `SGC_COMUNICACAO` |
| D-006 | A ocorrência guarda **dados** (`TIPO`, `RESULTADO`, esperado, encontrado, delta), não a frase | Coluna `DESCRICAO` com o texto pronto, como no legado | Texto pronto no banco envelhece: mudar uma palavra exigiria migração de dados, e a mesma regra passaria a ter duas redações. `textoDaOcorrencia()` monta na tela e é testável |
| D-007 | `item_nao_pedido` é o tipo do **casamento**, com os três resultados (`conforme` quando casou por código, `atencao` por código de fábrica/EAN, `divergente` quando não casou) | Criar um tipo `casamento_item` | O 000 fechou os sete tipos; um oitavo tipo é mudança de contrato para ganhar só clareza de nome. Registrado em *Pedidos ao 000* como renomeação opcional |
| D-008 | O `sgcNfDetectar` grava aviso do tipo `nf_sugerida` | Cron sem aviso, só com a nota no histórico | R-023 manda todo cron gravar aviso e nota; nenhum dos seis tipos do 000 cobre sugestão, então o tipo entra como oitavo valor da coluna (ela é `VARCHAR`, a lista do 000 é enumeração de uso). Sem ele, a sugestão só aparece para quem abre `/notas-fiscais` |
| D-009 | A recusa de mover (Trânsito e conclusão) é **só do servidor**; `transicoes.ts` ganha os textos em `MOTIVOS` mas nenhum ramo novo em `motivoDeDestino` | Espelhar a trava na tela, como o resto da matriz | O espelho síncrono precisaria da contagem de notas e de ocorrências em cada cartão do quadro — uma SF por cartão (proibido) ou dois campos novos no quadro. Quem recusa é o gancho, e a lib já mostra o motivo na faixa de aviso do card. O teste de 500 combinações (RNF-005 da 002) continua valendo sem alteração |
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
| `JSON_SET` não existir ou recusar `TEXT` no MySQL da plataforma | a etiqueta da capa não aparece pelo cron | verificação no sandbox junto com D-03 da onda 1; plano B é a lib ganhar uma escrita de campo do card (`kbEscCardValorGravar`), que é onde isso deveria morar |
| Escrita guardada recusada devolve 0 linhas e nenhum erro (D-03 da onda 1) | a tela acredita que gravou o contato ou a decisão | as ações desta spec passam por JS que relê e devolve a contagem (`decididas`, `pendentes`, `itens`), então a tela compara o esperado com o obtido em vez de confiar no silêncio |
| O fornecedor emite a nota com `CODPROD` próprio e sem `CODFAB` nem EAN cadastrados | tudo vira `item_nao_pedido` divergente | é o comportamento correto (o item realmente não é identificável), e a ocorrência traz o código encontrado para o cadastro ser corrigido; C-009 fixa isso como esperado |
| Duas rodadas do cron em paralelo (rodada longa + a seguinte) | aviso ou sugestão duplicada | `UNIQUE (CHAVE)` em `SGC_AVISO` e as duas chaves de `SGC_NF_SUGESTAO` recusam a segunda escrita; nenhuma delas depende de "ler antes de gravar" |

## Pedidos ao 000

1. **`SGC_NF_SUGESTAO`** — acrescentar `UNIQUE KEY (ID_CARD, CODFORNEC, NUMNOTA, SERIE)` ao lado
   do `UNIQUE (CHAVENFE, ID_CARD)` do R-026: `CHAVENFE` vem vazia em nota sem XML, e sem a segunda
   chave a rodada de 30 em 30 minutos duplicaria a sugestão dessas notas.
2. **`SGC_AVISO.TIPO`** — incluir `nf_sugerida` na lista do R-023 (a coluna é `VARCHAR`; o pedido
   é de contrato, não de schema), para o cron de detecção cumprir "todo cron grava aviso".
3. **`SGC_NF_OCORRENCIA.TIPO`** — opcional: renomear `item_nao_pedido` para `casamento_item`,
   já que o tipo cobre também o casamento conforme (D-007). Sem a renomeação, nada quebra.
4. **`sgcCobrancaEnviar`** — confirmar que a gravação de `SGC_CONTATO_FATURAMENTO` fica na tela
   (`:VAR_USER`) e não dentro do JS, como o R-033 sugere (D-005). A comunicação continua sendo
   gravada pelo JS, por `sgcEscComunicacaoInserir` da 002.
5. **Escrita em `KB_CARD.VALORES_JSON`** — confirmar que uma `sgcEsc*` pode atualizar a chave
   `faturamento` do JSON de valores do card com `JSON_SET` no caminho sem sessão (D-003), ou
   decidir que a lib ganha `kbEscCardValorGravar` na 1.4.0.
6. **Seed da 001** — `VALIDADE_MINIMA_DIAS = 180` no fornecedor 1042, para C-011 ter os dois
   lados da regra.

## Complexity Tracking

Vazio: nenhuma violação de princípio.
