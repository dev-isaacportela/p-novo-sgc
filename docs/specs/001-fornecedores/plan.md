# Plan: Fornecedores — cadastro do ERP e parametrização de compra

**Spec:** `../001-fornecedores/spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

Preencher **antes** de detalhar o desenho. Falha aqui é replanejamento.

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` aprovada, **zero pendências**: as quatro foram decididas em R-001 (persona `comercial`, que não vê o módulo), R-002 (inativo não é oferecido em 002/004), R-003 (a janela de fechamento pode virar o mês) e R-004 (marca "vencido" no documento) |
| Backend escrito local, executado no sandbox | sim | um arquivo novo, `backend/add-004-fornecedores.mjs` (nome já previsto no `simulator/config.mjs`), exportando `definitions`; publicação só no `isEntrypoint()`. O DDL das 7 tabelas entra no `setup-backend.mjs` (arquivo do integrador). Nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | `backend/migrations/` intocado; as migrations saem do turno no sandbox |
| Leitura e escrita por Server Function | sim | as duas telas só chamam `linhas()`/`acao()` de `src/lib/mitra-api.ts`; zero `listRecords`/`patchRecord`. O envio do arquivo é a única chamada direta de SDK na tela (`uploadFilePublicMitra`), que não é CRUD de tabela |
| Simulador cobre a feature | sim | `add-004-fornecedores.mjs` entra em `PUBLISH_ORDER` e em `DDL_SOURCES` não (o DDL é do setup); seed em `simulator/seed/001-fornecedores.mjs` com os 3 fornecedores e as tabelas `PC*`; `CHECK_INPUT` ganha `codfornec`, `codfilial` e `ativo`; `sim:check` verde |
| Testes automatizados obrigatórios | sim | as 10 linhas da seção **Testes** da spec viram 8 `teste()` em `backend/simulator/smoke/001-fornecedores.mjs` e 8 `test()` em `frontend/tests/fornecedor.test.mjs`; a consulta Oracle prova contagem > 0 (C-008) |
| Design tokens, sem cor literal | sim | telas montadas só com o vocabulário de `components/page.tsx` (§8 do `design.md`); zero classe Tailwind solta, zero hex, situação por `Status`, não por cor sozinha |
| Simplicidade | sim | nenhuma dependência nova; faixa/opção/parcela do SGC anterior (3 tabelas + 2 níveis de `JOIN`) viram **uma** tabela com `PARCELAS` em texto `30/60/90`; o histórico do fornecedor não ganha SF própria (vem junto do carregar) |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`
- **Reuso identificado:** `src/lib/mitra-api.ts` (`linhas`/`linha`/`acao`/`comPadrao`), `src/lib/formato.ts` (moeda e data), vocabulário de `src/components/page.tsx` (`PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `SearchInput`, `SelectMenu`, `Field`, `LabelledField`, `FilterChip`, `Table`/`Th`/`Td`/`Tr`/`RowTitle`/`RowMeta`, `Code`, `Status`, `Badge`, `Alert`, `EmptyState`, `Dash`, `Pagination`, `Button`, `IconButton`), primitivo `dialog.tsx`. Regra portada do p-45547: validações de `add-parametrizacao-fornecedor.mjs` / `add-prazos-sla-fornecedor.mjs` e o formato de faixa/parcela de `frontend/src/features/kanban/acordos-fornecedor.ts`
- **Dependência nova:** nenhuma

## Modelo de dados

Entidades da spec → estrutura real. Toda mudança de schema entra em
`setup-backend.mjs` (ou num `add-NNN-*.mjs`) e vira migration gerada pelo
sistema ao rodar no sandbox — nunca escrita à mão.

| Entidade (spec) | Tabela | Campos-chave | Observação |
|---|---|---|---|
| Fornecedor | `SGC_FORNECEDOR` | `ID`, `CODFORNEC`, `FORNECEDOR`, `CNPJ`, `CNPJ_FORMATADO`, `ATIVO` | chave natural `CODFORNEC` (do ERP); `FORNECEDOR` é cópia da razão social do ERP na gravação, para a lista não depender do Oracle; `ATIVO = 0` tira o fornecedor da criação de pedido (002) e do agendamento (004) sem mexer no que já existe (RN-013, R-002) |
| Filial atendida | `SGC_FORNECEDOR_FILIAL` | `FORNECEDOR_ID`, `CODFILIAL` | `CODFILIAL` é texto: no ERP a filial é `'1'`, `'2'`, `'99'` |
| Linha de produto | `SGC_FORNECEDOR_LINHA` | `FORNECEDOR_ID`, `NOME`, `ORDEM` | |
| Contato de envio | `SGC_FORNECEDOR_LINHA_CONTATO` | `LINHA_ID`, `NOME`, `EMAIL` | EN-02 A: é daqui que sai o destinatário do pedido |
| Faixa de prazo | `SGC_FORNECEDOR_FAIXA_PRAZO` | `LINHA_ID`, `VALOR_DE`, `VALOR_ATE`, `ROTULO`, `PARCELAS` | uma linha por **opção**; duas opções na mesma faixa repetem `VALOR_DE`/`VALOR_ATE` com `ROTULO` diferente. `VALOR_ATE = 0` é "sem teto" |
| Documento | `SGC_FORNECEDOR_DOCUMENTO` | `FORNECEDOR_ID`, `TIPO`, `NOME`, `ENDERECO`, `VENCIMENTO` | `ENDERECO` é a URL pública devolvida pelo envio do arquivo |
| Alteração | `SGC_FORNECEDOR_LOG` | `FORNECEDOR_ID`, `CAMPO`, `DE`, `PARA`, `POR`, `EM` | uma linha por campo alterado (FO-06 B) |

Colunas exatas (UPPERCASE; datas `VARCHAR(10)`, carimbos `VARCHAR(19)`; sem
`FOREIGN KEY`, por convenção do 000):

```
SGC_FORNECEDOR
  ID                     INT AUTO_INCREMENT PRIMARY KEY
  CODFORNEC              INT           NOT NULL          -- chave natural (ERP)
  FORNECEDOR             VARCHAR(200)  NOT NULL
  CNPJ                   VARCHAR(14)   NOT NULL
  CNPJ_FORMATADO         VARCHAR(18)
  PRAZO_ENTREGA_DIAS     INT           NOT NULL DEFAULT 0
  PRAZO_ENTREGA_TIPO     VARCHAR(10)   NOT NULL DEFAULT 'uteis'   -- uteis | corridos
  PEDIDO_MINIMO          DECIMAL(15,2) NOT NULL DEFAULT 0
  FECHAMENTO_DIA_INICIO  INT           NOT NULL DEFAULT 1         -- 1..31
  FECHAMENTO_DIA_FIM     INT           NOT NULL DEFAULT 1         -- 1..31
  LINK_PLATAFORMA        VARCHAR(500)
  VALIDADE_MINIMA_DIAS   INT           NOT NULL DEFAULT 0
  SLA_ANALISE_DIAS       INT           NOT NULL DEFAULT 0         -- 0 = padrão do sistema (1)
  SLA_FATURAMENTO_DIAS   INT           NOT NULL DEFAULT 0         -- 0 = padrão do sistema (5)
  ATIVO                  BOOLEAN       NOT NULL DEFAULT 1
  CRIADO_POR             INT
  CRIADO_EM              VARCHAR(19)
  ATUALIZADO_POR         INT
  ATUALIZADO_EM          VARCHAR(19)

SGC_FORNECEDOR_FILIAL
  ID             INT AUTO_INCREMENT PRIMARY KEY
  FORNECEDOR_ID  INT          NOT NULL
  CODFILIAL      VARCHAR(10)  NOT NULL
  FILIAL         VARCHAR(200)

SGC_FORNECEDOR_LINHA
  ID             INT AUTO_INCREMENT PRIMARY KEY
  FORNECEDOR_ID  INT          NOT NULL
  NOME           VARCHAR(200) NOT NULL
  ORDEM          INT          NOT NULL DEFAULT 1

SGC_FORNECEDOR_LINHA_CONTATO
  ID       INT AUTO_INCREMENT PRIMARY KEY
  LINHA_ID INT          NOT NULL
  NOME     VARCHAR(200)
  EMAIL    VARCHAR(255) NOT NULL

SGC_FORNECEDOR_FAIXA_PRAZO
  ID         INT AUTO_INCREMENT PRIMARY KEY
  LINHA_ID   INT           NOT NULL
  VALOR_DE   DECIMAL(15,2) NOT NULL DEFAULT 0
  VALOR_ATE  DECIMAL(15,2) NOT NULL DEFAULT 0   -- 0 = sem teto
  ROTULO     VARCHAR(80)   NOT NULL DEFAULT 'Opção única'
  PARCELAS   VARCHAR(100)  NOT NULL             -- "30/60/90"
  ORDEM      INT           NOT NULL DEFAULT 1

SGC_FORNECEDOR_DOCUMENTO
  ID             INT AUTO_INCREMENT PRIMARY KEY
  FORNECEDOR_ID  INT          NOT NULL
  TIPO           VARCHAR(40)  NOT NULL DEFAULT 'Documento'  -- Documento | Modelo de envio de pedido
  NOME           VARCHAR(255) NOT NULL
  ENDERECO       VARCHAR(700) NOT NULL
  VENCIMENTO     VARCHAR(10)                                 -- '' quando não tem
  CRIADO_POR     INT
  CRIADO_EM      VARCHAR(19)

SGC_FORNECEDOR_LOG
  ID             INT AUTO_INCREMENT PRIMARY KEY
  FORNECEDOR_ID  INT           NOT NULL
  CAMPO          VARCHAR(120)  NOT NULL
  DE             VARCHAR(2000)
  PARA           VARCHAR(2000)
  POR            INT
  EM             VARCHAR(19)
```

Índices sugeridos ao integrador (mesma migration do `CREATE`):
`SGC_FORNECEDOR(CODFORNEC)` único, `SGC_FORNECEDOR_FILIAL(FORNECEDOR_ID)`,
`SGC_FORNECEDOR_LINHA(FORNECEDOR_ID)`, `SGC_FORNECEDOR_LOG(FORNECEDOR_ID, ID)`.

## Contratos de backend

Uma linha por Server Function. Nome é o contrato com `SERVER_FUNCTION_NAMES`.
Todas nascem em `backend/add-004-fornecedores.mjs`; prefixo `sgc`, faixa de id
local **71xx** (leituras e JS a partir de 7101, escritas a partir de 7150).
Valor "desligado": `''` no texto, `0` no numérico.

| Nome (`add-004-fornecedores.mjs`) | Tipo | Entrada (`{{param}}`) | Saída | Atende |
|---|---|---|---|---|
| `sgcFornecedorListar` (7101) | SQL | `busca` `''`, `codfilial` `''`, `ativo` `0` (0 todos · 1 ativos · 2 inativos), `limite` `20`, `offset` `0` | `ID, CODFORNEC, FORNECEDOR, CNPJ, CNPJ_FORMATADO, PRAZO_ENTREGA_DIAS, PRAZO_ENTREGA_TIPO, PEDIDO_MINIMO, ATIVO, ATUALIZADO_EM, QT_FILIAIS, QT_LINHAS` | RF-001, RF-002, RF-003 |
| `sgcFornecedorListarTotal` (7102) | SQL | `busca` `''`, `codfilial` `''`, `ativo` `0` | `TOTAL` | RF-001, RF-002 |
| `sgcFornecedorCarregar` (7103) | JAVASCRIPT | `codfornec` `0` | `{ fornecedor, filiais[], linhas[], contatos[], faixas[], documentos[], log[] }` — colunas UPPERCASE; `fornecedor: null` quando não parametrizado; `log` são as 20 últimas, com `POR_NOME` | RF-004, RF-005..RF-010, RF-012 |
| `sgcWintFornecedores` (7104) | SQL (Oracle, `jdbcId` do WinThor) | `busca` `''` | `CODFORNEC, FORNECEDOR, CGC` | RF-004, C-008 |
| `sgcWintFiliais` (7105) | SQL (Oracle, `jdbcId` do WinThor) | — | `CODFILIAL, FILIAL` | RF-006, C-008 |
| `sgcFornecedorSalvar` (7106) | JAVASCRIPT | `payload` (objeto: `fornecedor`, `filiais[]`, `linhas[]` com `contatos[]` e `faixas[]`, `documentos[]`) | `{ ok, error?, fornecedorId?, codfornec?, alteracoes? }` | RF-005..RF-013, RF-016 |
| `sgcEscFornecedorInserir` (7150) | SQL | `usuarioId` `0`, `codfornec` `0`, `fornecedor` `''`, `cnpj` `''`, `cnpjFormatado` `''`, `prazoEntregaDias` `0`, `prazoEntregaTipo` `''`, `pedidoMinimo` `0`, `fechamentoDiaInicio` `0`, `fechamentoDiaFim` `0`, `linkPlataforma` `''`, `validadeMinimaDias` `0`, `slaAnaliseDias` `0`, `slaFaturamentoDias` `0`, `ativo` `0`, `agora` `''` | — | RF-005 |
| `sgcEscFornecedorAtualizar` (7151) | SQL | os mesmos + `id` `0` | — | RF-005 |
| `sgcEscFornecedorFiliaisLimpar` (7152) | SQL | `usuarioId` `0`, `fornecedorId` `0` | — | RF-011 |
| `sgcEscFornecedorFilialInserir` (7153) | SQL | `usuarioId` `0`, `fornecedorId` `0`, `codfilial` `''`, `filial` `''` | — | RF-006 |
| `sgcEscFornecedorContatosLimpar` (7154) | SQL | `usuarioId` `0`, `fornecedorId` `0` | — | RF-011 |
| `sgcEscFornecedorFaixasLimpar` (7155) | SQL | `usuarioId` `0`, `fornecedorId` `0` | — | RF-011 |
| `sgcEscFornecedorLinhasLimpar` (7156) | SQL | `usuarioId` `0`, `fornecedorId` `0` | — | RF-011 |
| `sgcEscFornecedorLinhaInserir` (7157) | SQL | `usuarioId` `0`, `fornecedorId` `0`, `nome` `''`, `ordem` `0` | — | RF-007 |
| `sgcEscFornecedorContatoInserir` (7158) | SQL | `usuarioId` `0`, `linhaId` `0`, `nome` `''`, `email` `''` | — | RF-008 |
| `sgcEscFornecedorFaixaInserir` (7159) | SQL | `usuarioId` `0`, `linhaId` `0`, `valorDe` `0`, `valorAte` `0`, `rotulo` `''`, `parcelas` `''`, `ordem` `0` | — | RF-009 |
| `sgcEscFornecedorDocumentosLimpar` (7160) | SQL | `usuarioId` `0`, `fornecedorId` `0` | — | RF-011 |
| `sgcEscFornecedorDocumentoInserir` (7161) | SQL | `usuarioId` `0`, `fornecedorId` `0`, `tipo` `''`, `nome` `''`, `endereco` `''`, `vencimento` `''`, `agora` `''` | — | RF-010 |
| `sgcEscFornecedorLogInserir` (7162) | SQL | `usuarioId` `0`, `fornecedorId` `0`, `campo` `''`, `de` `''`, `para` `''`, `agora` `''` | — | RF-012 |

Regras: filtro desligado é `''` no texto e `0` no numérico; toda listagem tem
`LIMIT/OFFSET`; `:VAR_USER` identifica quem chama; escrita de usuário business
só por SF SQL.

**A guarda de persona** (FO-07, P-12) é a mesma expressão nas 13 `sgcEsc*`, no
`WHERE` da instrução — escrita **não autorizada não grava linha**:

```sql
WHERE COALESCE(
        (SELECT P.PERSONA FROM SGC_USUARIO_PERSONA P WHERE P.USUARIO_ID = {{usuarioId}}),
        CASE (SELECT U.ACCESS_LEVEL FROM INT_USER U WHERE U.ID = {{usuarioId}})
          WHEN 'ADMIN' THEN 'admin' WHEN 'RESTRICTED' THEN 'comercial' ELSE 'analista' END
      ) IN ('admin','gestor','diretoria')
```

O mapa de fallback é o de P-02 (decisão B). `sgcFornecedorSalvar` faz a mesma
consulta **com `:VAR_USER`** antes de qualquer escrita e devolve
`{ ok: false, error }` — ver **D-005**.

Forma das duas consultas Oracle (o `jdbcId` é resolvido por nome no
`isEntrypoint()` do `add-004`; no simulador rodam sobre as `PC*` em SQLite com
os shims `NVL`, `TO_DATE`, `TO_CHAR`, `TRUNC`, `SYSDATE`, `ROWNUM`):

```sql
-- sgcWintFornecedores
SELECT F.CODFORNEC, F.FORNECEDOR, NVL(F.CGC, ' ') AS CGC
  FROM PCFORNEC F
 WHERE F.CODFORNEC <> 999999
   AND ('{{busca}}' = '' OR UPPER(F.FORNECEDOR) LIKE UPPER('%{{busca}}%')
        OR CONCAT('', F.CODFORNEC) LIKE '%{{busca}}%')
 ORDER BY F.FORNECEDOR

-- sgcWintFiliais
SELECT F.CODIGO AS CODFILIAL, F.RAZAOSOCIAL AS FILIAL
  FROM PCFILIAL F
 WHERE F.CODIGO <> '99'
 ORDER BY F.CODIGO
```

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/fornecedores` → `src/pages/fornecedores/FornecedoresPage.tsx` | lista paginada, busca, filtro por filial e situação, abrir a parametrização, iniciar uma nova | `PageHeader` (module "Compras", `meta` com a contagem), `Panel`, `Toolbar` (`SearchInput` + 2 `SelectMenu`), `FilterChip`, `Table`/`Th`/`Td`/`Tr` (`numeric` em pedido mínimo e contagens), `RowTitle`, `RowMeta`, `Code` (código do ERP), `Status` (`live` ativo · `off` inativo), `Dash`, `IconButton` (abrir), `Pagination`, `EmptyState`, `Button` ("Parametrizar fornecedor", `primary`, no `PageHeader.actions`), `Dialog` do seletor do ERP com `SelectMenu` (`searchThreshold` 10) | nenhum |
| `/fornecedores/:codfornec` → `src/pages/fornecedores/FornecedorPage.tsx` | parametrização em painéis, diálogos de linha e documento, histórico | `PageHeader` (título = nome do fornecedor, `Code` do código, `actions` com `Button` "Salvar" `primary` e `Button` "Voltar" `ghost`), 5 × `Panel` + `PanelHeader`, `LabelledField`/`Field` + `Input`/`Textarea`/`SelectMenu`, `Table` nos filhos, `IconButton` (`tone="danger"` remover, neutro editar), `Alert` (`error` na recusa, `info` no aviso de endereço público), `Badge` (tipo do documento, fora de tabela), `Status`, `Dash`, `EmptyState`, `Dialog` (§9.5: `max-h-[90vh]`, só o miolo rola), `DatePicker` (`src/components/DatePicker.tsx`, spec 004 — UI-03 B, R-006) | nenhum |

Painéis de `/fornecedores/:codfornec`, na ordem: **Identificação e prazos**
(CNPJ, prazo de entrega + tipo, pedido mínimo, janela de fechamento, link da
plataforma, validade mínima, SLA de análise, SLA de faturamento, situação) ·
**Filiais atendidas** (`SelectMenu` do ERP + `Button` "Adicionar" + `Table` com
remover) · **Linhas de produto** (`Table` de linhas com nome, nº de contatos e
nº de faixas; `IconButton` abre o `Dialog` "Linha de produto", que tem nome,
contatos e faixas na mesma folha, sem diálogo dentro de diálogo) ·
**Documentos** (`Table` com `Status tone="alert"` "vencido" quando
`documentoVencido(VENCIMENTO, hoje)` — RF-017 — e `Dash` quando não há
vencimento; `Dialog` "Documento" com arquivo, tipo, o `DatePicker` do projeto no
vencimento e o `Alert` de endereço público) · **Histórico de alterações** (`Table` com
quando, quem, campo, de, para; `PanelHeader.hint` "últimas 20 alterações").

Estados: carregando (texto no `Panel`, sem esqueleto), salvando (`Button`
`disabled`, rótulo "Salvando…"), erro (`Alert` `tone="error"` no topo do
formulário, com a mensagem do servidor — os valores digitados **não** se
perdem), somente leitura (analista: campos `disabled` e nenhum botão de salvar).
Sem toast (UI-02 A): a confirmação é um `Alert` `tone="success"` com "Salvo às
HH:MM".

## Fluxo

1. `/fornecedores` monta com `linhas('sgcFornecedorListar', comPadrao(filtros, { busca: '', codfilial: '', ativo: 0, limite: 20, offset: 0 }))` e `linha('sgcFornecedorListarTotal', …)`; as opções do filtro de filial vêm de `sgcWintFiliais` (uma vez, na montagem).
2. "Parametrizar fornecedor" abre o diálogo com `sgcWintFornecedores`; escolher navega para `/fornecedores/:codfornec`.
3. `/fornecedores/:codfornec` faz **uma** chamada: `acao('sgcFornecedorCarregar', { codfornec })`, que devolve pai e filhas (RNF-002). `fornecedor: null` = parametrização nova, com os campos em branco e o nome/CNPJ pré-carregados do ERP.
4. Editar é local: tudo vive no estado da página até o "Salvar". O diálogo de linha devolve a linha inteira (contatos e faixas juntos).
5. Documento: `uploadFilePublicMitra({ file })` na hora de escolher o arquivo devolve `publicUrl`; a tela guarda só nome, tipo, vencimento e o endereço — o arquivo não passa por Server Function.
6. "Salvar" valida com `lib/fornecedor.ts` (mesma mensagem que o servidor devolve) e só então chama `acao('sgcFornecedorSalvar', { payload })`.
7. `sgcFornecedorSalvar`, na plataforma: lê a persona por `runQueryMitra` com `:VAR_USER` → valida tudo de novo → grava o pai (`Inserir` ou `Atualizar`) → limpa contatos, faixas, linhas, filiais e documentos → insere filiais, linhas (relendo o `ID` de cada uma), contatos, faixas e documentos → compara a fotografia anterior com a nova e insere **uma** linha de log por campo alterado → devolve `{ ok: true, fornecedorId, codfornec, alteracoes }`.
8. A tela recarrega com `sgcFornecedorCarregar` (os `ID`s das filhas mudaram) e mostra "Salvo às HH:MM".

## Regra pura — `frontend/src/lib/fornecedor.ts`

Tudo o que é cálculo, formato ou validação mora aqui, fora do JSX, e é o que
`frontend/tests/fornecedor.test.mjs` testa:

| Função | Faz | Regra |
|---|---|---|
| `normalizarCnpj(valor)` | só dígitos | RN-002 |
| `cnpjValido(valor)` | 14 dígitos, não todos iguais, os dois dígitos verificadores conferem | RN-002 |
| `formatarCnpj(valor)` | `49324221000104` → `49.324.221/0001-04` | RF-003 |
| `janelaFechamentoValida(inicio, fim)` | os dois entre 1 e 31, em qualquer ordem — a janela pode virar o mês (R-003) | RN-004 |
| `slaEfetivo({ analise, faturamento })` | `0`/vazio → `{ dias: 1, origem: 'padrao' }` e `{ dias: 5, origem: 'padrao' }`; valor gravado → `origem: 'parametrizado'` | RN-005 |
| `rotuloPrazoEntrega(dias, tipo)` | `7, 'uteis'` → `"7 dias úteis"`; `1, 'corridos'` → `"1 dia corrido"`; `0` → `''` | RN-006 |
| `emailValido(valor)` | um `@`, sem espaço, domínio com ponto que não termina em ponto (mesma regra do p-45547) | RN-007 |
| `validarFaixas(faixas)` | ordena por `valorDe`; `valorAte` 0 = sem teto; recusa sobreposição, `valorAte <= valorDe`, mais de uma sem teto e sem teto que não seja a última → `{ ok, erro }` | RN-008 |
| `parsearParcelas(texto)` | `"30/60/90"` → `[30,60,90]`; espaço tolerado; `"0/30"`, `"-5"`, `"trinta"`, `""` → `null` | RN-009 |
| `formatarParcelas(dias)` | `[30,60,90]` → `"30/60/90"` | RN-009 |
| `faixaDoValor(faixas, valor)` | devolve as opções da faixa com `valorDe <= valor` e (`valorAte === 0` ou `valor < valorAte`); nenhuma → `[]` | RN-010 |
| `validarParametrizacao(payload)` | roda todas as anteriores na ordem da tela e devolve a **primeira** mensagem de recusa, citando o campo ou a linha | RF-016 |
| `rotuloFaixa(valorDe, valorAte)` | `0,0` → "Qualquer valor"; `0,20000` → "Até R$ 20.000,00"; `20000,0` → "Acima de R$ 20.000,00"; `20000,45000` → "R$ 20.000,00 a R$ 45.000,00" | RF-009 |
| `documentoVencido(vencimento, hoje)` | `'2027-03-31'` em `'2027-04-01'` → `true`; em `'2027-03-31'` → `false`; `''` → `false` (comparação de texto `VARCHAR(10)`, sem fuso) | RN-014, RF-017 |

`faixaDoValor`, `parsearParcelas` e `formatarParcelas` são o que a spec 003
importa para comparar prazo padrão × acordado (PZ-01, PZ-02).

## Simulador

- **Seed** (`backend/simulator/seed/001-fornecedores.mjs`, chamado por `seed.mjs` depois das fases) — usa `CENARIO.usuarios = { admin: 1, ana: 2, gil: 3, dora: 4, leo: 5 }`:
  - `SGC_USUARIO_PERSONA`: `1 admin`, `2 analista`, `3 gestor`, `4 diretoria`, `5 comercial` (R-001; o `leo@sgc.local` do seed é "Leo Comercial") — gravadas **só se a tabela estiver vazia** (o dado é da spec 002; enquanto ela não existir, a 001 não fica sem persona).
  - `SGC_FORNECEDOR`: `1015` FRESENIUS KABI BRASIL LTDA (CNPJ `49324221000104`, 7 dias úteis, mínimo 5000,00, fechamento 7–15, validade 120, SLA 0/0, ativo) · `1042` NESTLE BRASIL LTDA (10 dias corridos, mínimo 3000,00, SLA 2/7, ativo) · `1088` DANONE NUTRICAO ESPECIALIZADA LTDA (inativo) — **C-002**.
  - `SGC_FORNECEDOR_FILIAL`: 1015 → `1`, `2`; 1042 → `1`, `2`, `3`; 1088 → `1`.
  - `SGC_FORNECEDOR_LINHA` do 1015: `Nutrição Enteral` (contatos `Mônica <captacao.pedidos@fresenius-kabi.com>` e `Elaine <elaine.santos@fresenius-kabi.com>`; faixa `0–0` "Opção única" `30/60/90`) e `Nutrição Parenteral` (contato `Lauanda <lauanda.oliveira@fresenius-kabi.com>`; faixas `0–20000` `30`, `20000–45000` `30/45`, `45000–0` "Opção A" `30/45/60` e `45000–0` "Opção B" `30/60`) — **C-005, RN-010**. 1042: 1 linha, 1 contato, 1 faixa.
  - `SGC_FORNECEDOR_DOCUMENTO` do 1015: `Contrato comercial 2026`, tipo `Documento`, vencimento `2027-03-31` — **C-007**.
  - `SGC_FORNECEDOR_LOG`: vazio (quem preenche é o salvamento, **C-006**).
  - Tabelas `PC*` do WinThor, criadas pelo **próprio seed** com `CREATE TABLE IF NOT EXISTS` (não entram no `setup-backend.mjs`: o setup roda na plataforma e criaria tabelas de ERP no banco do Mitra — **D-006**):
    - `PCFORNEC (CODFORNEC INTEGER PRIMARY KEY, FORNECEDOR TEXT, FANTASIA TEXT, CGC TEXT, EMAIL TEXT, UF TEXT)` — 1015, 1042, 1088 e o genérico `999999`, que a consulta precisa descartar (**C-008**).
    - `PCFILIAL (CODIGO TEXT PRIMARY KEY, RAZAOSOCIAL TEXT, CGC TEXT, UF TEXT)` — `1` Benenutri Matriz, `2` Benenutri Filial Norte, `3` Benenutri Filial Sul e `99`, que a consulta descarta.
- **`CHECK_INPUT`** (`simulator/config.mjs`, do integrador) ganha `codfornec: '0'`, `codfilial: ''` e `ativo: '0'` (já tem `busca`, `limite`, `offset`).
- **`PUBLISH_ORDER`**: `add-004-fornecedores.mjs` depois de `add-003-jdbc-winthor.mjs`. `DDL_SOURCES` não muda (o DDL é do `setup-backend.mjs`, que já está listado).
- **Dialeto:** nada novo. O SQL usa `CONCAT`, `COALESCE`, `NVL`, `CASE`, `EXISTS`, `LIKE`, `LIMIT/OFFSET` — todos já cobertos por `mysql-dialect.mjs`.

## Testes

**Obrigatório.** Mapa da seção **Testes** da spec para os arquivos. Linha da
spec sem linha aqui é plan incompleto; não vai para `tasks.md`.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 · RN-001 | `backend/simulator/smoke/001-fornecedores.mjs` | `sgcFornecedorSalvar` com o payload do 1088 (usuário 3, gestor) devolve `ok: true`; `sgcFornecedorCarregar({ codfornec: 1088 })` devolve `PEDIDO_MINIMO` 5000, `filiais.length` 2, `linhas.length` 1, `contatos.length` 1, `faixas.length` 1 com `PARCELAS === '30/60/90'`, e `log.length >= 1` com `POR === 3` |
| C-002 · RN-013 | `backend/simulator/smoke/001-fornecedores.mjs` | `sgcFornecedorListar` sem filtro → 3 linhas e `sgcFornecedorListarTotal` → `TOTAL` 3; `codfilial: '2'` → 2 linhas (`CODFORNEC` 1015 e 1042) e total 2; `ativo: 1` → 2 e nenhum `CODFORNEC === 1088`; `ativo: 2` → 1 (o 1088); `busca: 'fresenius'` → 1 com `QT_FILIAIS` 2 e `QT_LINHAS` 2; `limite: 2, offset: 2` → 1 linha |
| C-003 · RN-012 | `backend/simulator/smoke/001-fornecedores.mjs` | o mesmo salvamento com `userId` 2 (ana, analista) devolve `ok: false` e `error` casando /gestor/i; `carregar` mantém `PEDIDO_MINIMO` 5000 e `log.length` inalterado; com `userId` 3 (gil, gestor) devolve `ok: true`. Chamada direta de `sgcEscFornecedorAtualizar` com `usuarioId: 2` não altera linha nenhuma |
| C-004 · RN-003 | `backend/simulator/smoke/001-fornecedores.mjs` | salvar o 1015 com `pedidoMinimo: 0` devolve `ok: false` e `error` casando /pedido mínimo/i; depois, `carregar` ainda traz `PEDIDO_MINIMO` 5000, `filiais.length` 2 e `linhas.length` 2 |
| C-005 | `backend/simulator/smoke/001-fornecedores.mjs` | salvar o 1015 sem a linha "Nutrição Parenteral" deixa `linhas.length` 1, `contatos.length` 2 e `faixas.length` 1; nenhum contato com e-mail `lauanda…` sobra |
| C-006 | `backend/simulator/smoke/001-fornecedores.mjs` | salvar o 1015 com `pedidoMinimo` 8000 e `validadeMinimaDias` 90 (usuário 4, dora) devolve `alteracoes: 2`; as duas linhas novas do log têm `CAMPO` "Pedido mínimo"/"Validade mínima", `DE`/`PARA` `5000.00`→`8000.00` e `120`→`90`, `POR` 4; salvar de novo sem mudança devolve `alteracoes: 0` e não cria linha |
| C-007 · RN-011 | `backend/simulator/smoke/001-fornecedores.mjs` | salvar com um documento (`nome`, `tipo: 'Documento'`, `vencimento: '2027-03-31'`, `endereco: 'https://…'`) devolve `documentos.length` 1 na releitura com os quatro valores; `tipo: 'Planilha'` é gravado como `'Documento'` |
| C-008 | `backend/simulator/smoke/001-fornecedores.mjs` | `sgcWintFornecedores({ busca: '' })` devolve `length > 0` e nenhum `CODFORNEC === 999999`; `busca: 'nestle'` devolve 1; `sgcWintFiliais()` devolve `length > 0` e nenhum `CODFILIAL === '99'` |
| RN-002 · RN-004 · RN-005 · RN-006 · RN-014 | `frontend/tests/fornecedor.test.mjs` | `cnpjValido('49324221000104')` true, `cnpjValido('49324221000105')` e `cnpjValido('4932422100010')` e `cnpjValido('11111111111111')` false; `formatarCnpj` devolve `49.324.221/0001-04`; `janelaFechamentoValida(7,15)` e `(28,5)` true (a janela vira o mês, R-003), `(0,15)` e `(7,32)` false; `slaEfetivo({analise:0,faturamento:0})` → `{analise:{dias:1,origem:'padrao'},faturamento:{dias:5,origem:'padrao'}}` e `{analise:3}` → `{dias:3,origem:'parametrizado'}`; `rotuloPrazoEntrega(7,'uteis')` → `'7 dias úteis'`, `(1,'corridos')` → `'1 dia corrido'`, `(0,'uteis')` → `''`; `documentoVencido('2027-03-31','2027-04-01')` true, `('2027-03-31','2027-03-31')` e `('','2027-04-01')` false |
| RN-007 · RN-008 · RN-009 · RN-010 | `frontend/tests/fornecedor.test.mjs` | `emailValido('elaine@')` false, `emailValido('elaine.santos@fresenius-kabi.com')` true; `validarFaixas([0–20000, 20000–45000])` `ok: true`, `[0–20000, 10000–30000]` `ok: false` com `erro` citando a sobreposição, duas faixas com `valorAte: 0` `ok: false`; `parsearParcelas('30/60/90')` → `[30,60,90]`, `' 30 / 45 '` → `[30,45]`, `'0/30'`/`'trinta'`/`''` → `null`; `formatarParcelas([30,60,90])` → `'30/60/90'`; `faixaDoValor(faixas, 20000)` devolve 1 opção `30/45`, `faixaDoValor(faixas, 50000)` devolve 2 opções (`30/45/60` e `30/60`), `faixaDoValor(faixas, 19999.99)` devolve a opção `30` |

- **Backend:** `backend/simulator/smoke/001-fornecedores.mjs` executa as SFs reais
  (SQL e JAVASCRIPT) em banco descartável; o título de cada `teste()` começa com
  o id do cenário. `:VAR_USER` é o `userId` passado ao `execute` — teste de
  permissão troca o usuário, nunca o input. `sgcFornecedorSalvar` e
  `sgcFornecedorCarregar` chamam outras SFs por id: o smoke passa `resolveById`
  ao `createRunner`, mapeando os ids de `SERVER_FUNCTIONS`.
- **Frontend:** `node --test` sobre `src/lib/fornecedor.ts` (funções puras).
  Tela não se testa aqui: vai para a verificação manual da spec.
- **Seed extra para o smoke:** nenhum — os 3 fornecedores, as personas e as
  tabelas `PC*` do seed cobrem os 8 cenários; o que falta (o fornecedor 1088
  parametrizado de C-001) o próprio teste cria chamando `sgcFornecedorSalvar`.

## Dependências entre specs

**Esta spec fornece:**

| Para | O quê |
|---|---|
| 002 (quadro) | `sgcWintFornecedores` e `sgcWintFiliais` (a criação manual de pedido escolhe fornecedor e filial — C-02, C-05); `SGC_FORNECEDOR.CODFORNEC`/`FORNECEDOR` para a capa do card; `SGC_FORNECEDOR.ATIVO`, que a criação de pedido respeita (RN-013, R-002); `SGC_FORNECEDOR_FILIAL` restringe as filiais oferecidas por fornecedor; os contatos de `SGC_FORNECEDOR_LINHA_CONTATO` são a única origem do destinatário do pedido (EN-02 A) e `LINK_PLATAFORMA` é o outro canal (EN-01) |
| 003 (itens) | `SGC_FORNECEDOR_FAIXA_PRAZO` + `faixaDoValor`/`parsearParcelas` de `lib/fornecedor.ts` = o prazo **padrão** que PZ-01/PZ-02 comparam com o acordado; `VALIDADE_MINIMA_DIAS` para o alerta de lote a vencer (RN-02); `PRAZO_ENTREGA_DIAS`/`TIPO` e `PEDIDO_MINIMO` na tela de montagem |
| 004 (agenda) | fornecedor e filiais atendidas de um agendamento (AG-01) saem das mesmas duas consultas do ERP e de `SGC_FORNECEDOR_FILIAL`; fornecedor inativo não é oferecido no agendamento (RN-013, R-002) |
| onda 3 (indicadores) | `SLA_ANALISE_DIAS` e `SLA_FATURAMENTO_DIAS` (padrão 1 e 5 dias úteis) |

**Esta spec consome:**

| De | O quê |
|---|---|
| 002 (quadro) | `SGC_USUARIO_PERSONA` — a guarda das escritas, o modo leitura da analista e o menu escondido para o comercial (FO-07, P-03, P-12, R-001). Enquanto a 002 não semeia as personas, o seed da 001 as grava se a tabela estiver vazia |
| 004 (agenda) | `src/components/DatePicker.tsx` — o campo de data de todas as telas (UI-03 B, R-006); a 001 usa no vencimento do documento e não escreve controle de data próprio |
| integrador / 000 | DDL das 7 tabelas no `setup-backend.mjs`; `add-003-jdbc-winthor.mjs` (conexão Oracle, `jdbcId` resolvido por nome); `PUBLISH_ORDER` e `CHECK_INPUT` em `simulator/config.mjs`; bloco 71xx em `frontend/src/lib/server-functions.ts`; rota e item de menu em `App.tsx`/`AdminLayout.tsx`; perfil de acesso (`add-002-perfil-acesso.mjs`) |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | Faixa, opção e parcela do SGC anterior (`CI_FAIXA_PRAZO_PAGAMENTO` + `CI_OPCAO_PRAZO` + `CI_PARCELA_PRAZO`) viram **uma** tabela, `SGC_FORNECEDOR_FAIXA_PRAZO`, com uma linha por opção e as parcelas em texto `30/60/90` | manter as três tabelas com os dois níveis de `JOIN` | é o formato que FO-04 fecha e o mesmo que a comparação de prazo (PZ-02) lê; as três tabelas só existiam para guardar uma lista de inteiros, ao custo de 4 `JOIN` em toda leitura e de 3 `DELETE` encadeados em todo salvamento |
| D-002 | `sgcFornecedorCarregar` é **JAVASCRIPT** e agrega pai e filhas numa execução | uma SF SQL por tabela (7 chamadas) | RNF-002 e o orçamento de 300 execuções/min do 000; SF SQL devolve um resultado só |
| D-003 | `sgcWintFornecedores` e `sgcWintFiliais` não paginam: são **seletores**, devolvem o recorte inteiro (≈2 mil fornecedores × 3 colunas) e o `SelectMenu` filtra na tela | `ROWNUM <= {{limite}}` com `limite`/`offset` | no Oracle o `ROWNUM` corta **antes** do `ORDER BY`: a "página 2" seria um recorte arbitrário, e o shim do simulador (que vira `LIMIT` no fim) esconderia a diferença. Paginação honesta exigiria `OFFSET … FETCH NEXT` (Oracle 12c+), versão não confirmada no WinThor. A regra do `LIMIT/OFFSET` continua valendo para as listagens do SGC (`sgcFornecedorListar`) |
| D-004 | "Sem teto" na faixa é `VALOR_ATE = 0`, não `NULL` | `NULL` como no SGC anterior | é o idioma do projeto ("desligado é `0` no numérico"), tira `IS NULL` de toda comparação e evita que o `NULL` atravesse o `JSON` do carregar como `null`/`''` conforme o driver |
| D-005 | A guarda de persona das `sgcEsc*` é sobre `{{usuarioId}}`; quem confere `:VAR_USER` é `sgcFornecedorSalvar`, com `runQueryMitra`, antes de escrever qualquer coisa | guardar as `sgcEsc*` por `:VAR_USER` | chamada aninhada de SF não propaga `:VAR_USER` com garantia: as escritas gravariam zero linha em silêncio dentro do salvamento. O ponto de entrada de escrita é único (FO-08: salvar substitui tudo), então a checagem forte fica nele; a guarda por `{{usuarioId}}` continua valendo para qualquer chamada direta. **R-007:** as 13 `sgcEsc*` ficam **no** perfil business, como as `kbEsc*` da lib; fica o item de verificação no sandbox — se chamada aninhada dispensar o perfil, elas saem dele |
| D-006 | As tabelas `PC*` do WinThor são criadas pelo **seed do simulador**, nunca pelo `setup-backend.mjs` | pôr o DDL das `PC*` no setup, como qualquer tabela | o `setup-backend.mjs` roda na plataforma: criaria tabelas de ERP vazias no banco do Mitra e a SF Oracle passaria a ler o lugar errado. No simulador as `PC*` são imitação, e imitação mora no seed |
| D-007 | O histórico não tem SF própria: vem com `sgcFornecedorCarregar`, limitado às **20** últimas alterações | `sgcFornecedorLogListar` + `sgcFornecedorLogListarTotal` paginadas | duas SFs e uma chamada a mais por tela para um painel que ninguém pagina; 20 linhas respondem "quem mudou o quê da última vez", que é o que FO-06 B pede. Paginar o histórico é mudança de spec, não de plan |
| D-008 | CNPJ é validado por comprimento **e** dígitos verificadores | só os 14 dígitos, como no SGC anterior | o CNPJ vem do ERP mas é editável aqui, e é ele que liga o fornecedor à nota fiscal na onda 2; 10 linhas de regra pura evitam um vínculo que só falha meses depois |
| D-009 | A validação roda duas vezes: em `lib/fornecedor.ts` (tela) e dentro de `sgcFornecedorSalvar` (servidor), com as **mesmas mensagens** | validar só no servidor | P-12 exige o servidor; validar só lá faria a tela ida-e-volta a cada campo errado. O mapa de testes cobre os dois lados com os mesmos números, e a mensagem é o contrato entre eles |
| D-010 | `FORNECEDOR` (razão social) é copiado do ERP no salvamento e guardado no SGC | ler o nome do Oracle a cada listagem | a lista é a tela mais visitada do módulo e não pode depender do ERP estar de pé; o nome muda raramente e é reescrito no salvamento seguinte |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Um salvamento custa ≈ 1 + 5 limpezas + N inserções + M linhas de log execuções de SF (≈ 35 para um fornecedor com 5 filiais, 4 linhas, 6 contatos, 8 faixas e 2 documentos) | pode roçar o teto de 300 execuções/min se duas pessoas salvarem fornecedores grandes ao mesmo tempo | RNF-003 fixa o teto de 40 por salvamento e o smoke conta as execuções; salvar fornecedor é ação rara (semanal). Se apertar, a saída é lote por tabela, não mais SFs |
| `ROWNUM`/`NVL` no simulador têm shim, mas o SQL Oracle real só é exercitado no sandbox | consulta que passa no simulador e falha na plataforma | as duas consultas Oracle são as mais simples possíveis (sem subconsulta, sem função de data); a T-091 as reexecuta no sandbox e o smoke exige contagem > 0 (vazio não é verde) |
| Validação duplicada (D-009) pode divergir com o tempo | tela aceita o que o servidor recusa | as mensagens são idênticas e os dois lados têm teste com os mesmos números; qualquer mudança de regra é uma mudança em duas tasks, declaradas juntas na rastreabilidade |
| `SGC_USUARIO_PERSONA` é da spec 002 e pode chegar depois | as escritas recusariam tudo, ou aceitariam de mais | o `COALESCE` cai no `ACCESS_LEVEL` (P-02 B): sem persona gravada, `ADMIN` continua salvando e `MEMBER` vira analista — menor privilégio em falha, e o seed da 001 grava as personas se a tabela estiver vazia |

## Complexity Tracking

Só preencher se houver violação de princípio. Vazio é o estado saudável.

| Princípio violado | Por que é necessário | Por que a alternativa simples não serve |
|---|---|---|
| — | — | — |
