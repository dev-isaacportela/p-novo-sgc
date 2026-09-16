# Tasks: Coberturas por curva

**Plan:** `plan.md` · **Data:** 2026-09-16

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
>
> Esta spec **muda a onda 1**: os arquivos da 003 listados na seção "O que a
> 012 passa a possuir da onda 1" do `plan.md` são desta spec **nesta onda**
> (R-096). A assinatura de `limiteDeCobertura` muda, então `lib/cobertura.ts`,
> `lib/compras.ts` e os dois testes que os exercitam entram **no mesmo commit**
> — `tsc -b` quebra se algum ficar para trás.

## Backend

- [ ] **T-001** — `SGC_COBERTURA`: tirar `LIMITE_DIAS` e pôr os três pares (`ALVO_A_DIAS INT NOT NULL DEFAULT 0`, `TOLERANCIA_A_PCT DECIMAL(5,2) NOT NULL DEFAULT 0`, e o mesmo para B e C), mantendo `UNIQUE KEY UK_SGC_COBERTURA (NIVEL, CODIGO)` → `backend/setup-backend.mjs:169-180` (texto pronto em *Pedidos à base*)
- [ ] **T-002** — `SGC_COBERTURA_LOG` nova (`ID`, `ID_COBERTURA`, `CAMPO`, `ANTES`, `DEPOIS`, `ACAO`, `POR`, `EM`, `INDEX IX_SGC_COBERTURA_LOG (ID_COBERTURA, ID)`) → `backend/setup-backend.mjs`, ao lado do bloco da 003
- [ ] **T-003** — `SGC_PEDIDO_ITEM.COBERTURA_LIMITE`: `INT` → `DECIMAL(15,2)` (o teto 49,5 da curva B não cabe em `INT`) → `backend/setup-backend.mjs`, bloco `SGC_PEDIDO_ITEM`
- [ ] **T-004** — `SQL_COBERTURA_LISTAR` devolve os seis campos no lugar de `LIMITE_DIAS`, mesma ordenação e mesmo filtro → `backend/add-006-itens.mjs:199-203`
- [ ] **T-005** — `sgcEscCoberturaGravar` recebe e grava os seis (`{{alvoADias}}`, `{{toleranciaAPct}}`, …), com `ATIVO = 1` no `ON DUPLICATE KEY UPDATE` (regravar reativa) e `FROM DUAL` → `backend/add-006-itens.mjs:352-362`. `sgcEscCoberturaExcluir` (`:363-368`) **não muda**
- [ ] **T-006** — `backend/add-014-coberturas-abc.mjs` novo: `sgcCoberturaLogListar` (8201) e `sgcEscCoberturaLogInserir` (8250), com a guarda `guarda(['admin','gestor'])` copiada literal da 002 (R-013); exporta `definitions`; `isEntrypoint()` no padrão do `add-006` (sem `jdbcId` — nenhuma SF desta spec fala com o Oracle)
- [ ] **T-007** `[P]` — bloco 82xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` → `frontend/src/lib/server-functions.ts` (os ids 7307/7358/7359 não mudam)

## Simulador e seed

- [ ] **T-010** — as duas linhas de `SGC_COBERTURA` com os três pares: `departamento 2` = A 35/20, B 45/10, C 60/5; `sku 5001` = A 20/0, B 25/0, C 30/0 → `backend/simulator/seed/003-itens.mjs:209-212` (nenhum produto, card ou item novo; os `coberturaLimite` dos itens do seed continuam 35)
- [ ] **T-011** — conferir que `npm run sim:check` continua verde depois de T-004/T-005 (o `sim:check` pula escrita; o que ele exercita é a `sgcCoberturaListar` nova)

## Regra pura

- [ ] **T-020** — `lib/cobertura.ts`: tipos `ParCurva`/`Cobertura` com `curvas: Record<CurvaAbc, ParCurva>` e `ativo`; `ALVO_COBERTURA_PADRAO_DIAS = 35` e `TOLERANCIA_COBERTURA_PADRAO_PCT = 0` no lugar de `LIMITE_COBERTURA_PADRAO_DIAS`; `tetoDaCurva`, `curvaValida` → `frontend/src/lib/cobertura.ts`
- [ ] **T-021** — `limiteDeCobertura(coberturas, alvo, curva)` devolvendo `{ limiteDias, alvoDias, toleranciaPct, curva, nivel }`, com a precedência de RN-002 e o descarte de linha com alvo 0 na curva pedida (D-006) → `frontend/src/lib/cobertura.ts`
- [ ] **T-022** — `coberturaDeLinha` lê as colunas novas de `sgcCoberturaListar` → `frontend/src/lib/cobertura.ts`
- [ ] **T-023** — auditoria pura: `CAMPOS_COBERTURA`, `diferencasDeCobertura(antes, depois)` e `acaoDaCobertura(antes, depois)` → `frontend/src/lib/cobertura.ts`
- [ ] **T-024** — CSV: `COLUNAS_CSV_COBERTURA` e `linhasCsvCobertura(lista)` (números em vírgula decimal) → `frontend/src/lib/cobertura.ts`
- [ ] **T-025** — os dois chamadores da régua: `montarItens` passa `curvas.get(codprod) ?? 'C'` e `itemDeProdutoBuscado` passa `'C'` → `frontend/src/lib/compras.ts:221` e `:282` (mesmo commit de T-021)

## Telas

- [ ] **T-030** — `CoberturasPage`: porteiro de rota por `usePersona()`/`permissoes.verCoberturas` e `podeManter = verCoberturas && !somenteLeitura` (sai a lista local `PERSONAS_QUE_MANTEM` e a leitura crua de `sgcPersonaAtual`) → `frontend/src/pages/coberturas/CoberturasPage.tsx`
- [ ] **T-031** — grid com `Nível`, `Alvo`, `Situação` e as três colunas de curva (`35 d · 20 %` / `máx. 42 d`), `numeric`, ações em `IconButton` → idem
- [ ] **T-032** — diálogo com três painéis de curva (alvo, tolerância e o máximo sem justificativa calculado por `tetoDaCurva`, `Dash` enquanto faltar um dos dois); Salvar desabilitado sem código ou sem os três alvos > 0 → idem
- [ ] **T-033** — salvar: `sgcEscCoberturaGravar` e, em seguida, uma chamada de `sgcEscCoberturaLogInserir` por entrada de `diferencasDeCobertura`, com a `acaoDaCobertura`; desativar grava a linha `ATIVO` com ação `desativou` → idem
- [ ] **T-034** — abas `Parâmetros` / `Auditoria` (`Tabs` do `page.tsx`); a aba de auditoria carrega `sgcCoberturaLogListar` só quando aberta, com `SelectMenu` de recorte por parametrização e paginação → idem
- [ ] **T-035** `[P]` — botão Exportar CSV sobre as linhas já carregadas (`textoCsv`/`baixarCsv`), nome `coberturas-<AAAA-MM-DD>.csv` → idem

## Testes

Uma task por linha da seção **Testes** do `plan.md`; o título de cada `teste()`/`test()`
começa pelo id do cenário ou da regra.

- [ ] **T-080** `[P]` — `test('C-001: …')` em `frontend/tests/cobertura.test.mjs`: departamento 2 (A 35/20, B 45/10, C 60/5) → 42, 49,5 e 63 conforme a curva do item
- [ ] **T-081** `[P]` — `test('C-002: …')`: sku 5001 em B 25/0 vence o departamento em B 45/10 → `{ limiteDias: 25, nivel: 'sku' }`
- [ ] **T-082** `[P]` — `test('C-003: …')`: item sem curva → coluna C → 63, `curva: 'C'`
- [ ] **T-083** `[P]` — `test('C-004: …')`: produto sem nada → `{ alvoDias: 35, toleranciaPct: 0, limiteDias: 35, nivel: 'padrao' }`
- [ ] **T-084** `[P]` — `test('C-005: …')`: seção 21 só com A → item de curva B cai no departamento (49,5); de curva A fica na seção (10)
- [ ] **T-085** — `teste('C-006: …')` em `backend/simulator/smoke/012-coberturas.mjs`: item curva A com 45 dias contra teto 42 sem justificativa → `PODE = 0` com a frase "Justifique os itens com cobertura acima do limite (1), a começar por" e a descrição; com justificativa → `PODE = 1`, `MOTIVO` vazio
- [ ] **T-086** `[P]` — `test('C-007: …')`: a resolução devolve `alvoDias` 35 ao lado de `limiteDias` 42 (é o alvo que a 011 usa no estoque máximo)
- [ ] **T-087** — `test('C-008: …')` (6 entradas, ação `alterou`) e `teste('C-008: …')` no smoke (seis `sgcEscCoberturaLogInserir` + `sgcCoberturaLogListar` devolve as 6 com `ANTES`/`DEPOIS` e `POR_NOME`)
- [ ] **T-088** — `test('C-009: …')` (7 entradas com `antes` vazio, ação `criou`) e `teste('C-009: …')` no smoke (gravar `sku 5004` + 7 logs)
- [ ] **T-089** — `teste('C-010: …')` no smoke: desativar o sku 5001 → sai da listagem, log `desativou`, a régua resolve 49,5; regravar → log `reativou` e 25 de volta
- [ ] **T-090** — `teste('C-011: …')` no smoke (as duas escritas por `ana` e `leo` não alteram contagem; por `gil`, alteram) e `test('C-011: …')` em `frontend/tests/permissoes.test.mjs` (gestor READ_ONLY vê e não grava; analista não vê)
- [ ] **T-091** `[P]` — `test('C-012: …')`: a linha de CSV da parametrização de referência traz 35; 20; 42; 45; 10; 49,5; 60; 5; 63
- [ ] **T-092** `[P]` — `test('C-013: …')`: `tetoDaCurva(45, 10)` → 49,5; tolerância vazia → `null`; alvo 0 → `null`
- [ ] **T-093** — `teste('C-014: …')` no smoke: `sgcCoberturaLogListar` em ordem decrescente de `ID`, contagem apurada por `SELECT COUNT(*)` no próprio banco (R-045), e o recorte por `idCobertura` só com as linhas do alvo
- [ ] **T-094** — `teste('C-015: …')` no smoke: alterada a parametrização depois da gravação, o item mantém o teto 42 e o veredicto não muda
- [ ] **T-095** `[P]` — `test('RN-001: …')`: (35,20)→42; (45,10)→49,5; (60,5)→63; (35,0)→35; (0,20)→`null`
- [ ] **T-096** `[P]` — `test('RN-002: …')`: sku 20 / seção 45 / departamento 60 / fornecedor 90 → 20; sem o sku → 45; só o fornecedor → 90; lista vazia → 35
- [ ] **T-097** `[P]` — `test('RN-003: …')`: `''`, `'D'` e `undefined` → `'C'`; `'b'` → `'B'`
- [ ] **T-098** `[P]` — `test('RN-004: …')`: toda resolução devolve `alvoDias` e `limiteDias`; no padrão, 35 e 35
- [ ] **T-099** — `teste('RN-005: …')`: revalidar RN-012 em `backend/simulator/smoke/003-itens.mjs` — as cinco mensagens, na mesma ordem, com o seed e o schema novos
- [ ] **T-100** `[P]` — `test('RN-006: …')`: objeto igual a si mesmo → `[]`; um número diferente → 1 entrada
- [ ] **T-101** `[P]` — `test('RN-007: …')`: `criou` / `desativou` / `reativou` / `alterou`
- [ ] **T-102** — `teste('RN-008: …')` no smoke: `ana`, `leo` e `dora` não gravam; `gil` e `admin` gravam
- [ ] **T-103** — `test('RN-009: …')` em `frontend/tests/compras.test.mjs` (o teste `C-001/C-004: montarItens …`, `:97-115`): coberturas com os três pares → `itens[0]` (5001, curva A, sku) espera **20** e `itens[1]` (5002, curva C, departamento) espera **63**
- [ ] **T-104** — `teste('RN-010: …')` no smoke: desativada some da listagem; regravada volta com `ALVO_B_DIAS` 25
- [ ] **T-105** — emendar `teste('C-020: …')` em `backend/simulator/smoke/003-itens.mjs:345-362`: a entrada de `sgcEscCoberturaGravar` passa a ter os seis campos e os asserts leem `ALVO_B_DIAS` 45 / `TOLERANCIA_B_PCT` 10 no lugar de `LIMITE_DIAS` 45
- [ ] **T-106** — revalidar `teste('C-007: …')` (`smoke/003-itens.mjs:210-224`) e o trecho de cobertura de RN-012 (`:265-267`) sem mudança de texto: o item continua com `COBERTURA_DIAS` 40 contra `COBERTURA_LIMITE` 35

## Verificação

- [ ] **T-110** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`), com as suítes 003 e 012
- [ ] **T-111** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos (a assinatura nova não pode deixar chamador para trás)
- [ ] **T-112** — Verificação manual no simulador: C-013 (três painéis lado a lado no desktop, empilhados a ~400 px, com o máximo sem justificativa), C-010 (inativa por texto, nunca só por cor, nunca em vermelho), C-011 (formulário desabilitado, não escondido, com o motivo no `title`), C-014 (aba de auditoria rolando sem empurrar o cabeçalho)
- [ ] **T-113** — Os dois temas (claro e escuro) nas duas abas

## Pedidos à base (S2)

Arquivos compartilhados — o trecho já vai pronto.

1. **`backend/setup-backend.mjs`** — substituir o bloco `SGC_COBERTURA` (linhas 169-180) por:

```js
  `CREATE TABLE IF NOT EXISTS SGC_COBERTURA (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    NIVEL VARCHAR(20),
    CODIGO VARCHAR(20),
    DESCRICAO VARCHAR(200),
    ALVO_A_DIAS INT NOT NULL DEFAULT 0,
    TOLERANCIA_A_PCT DECIMAL(5,2) NOT NULL DEFAULT 0,
    ALVO_B_DIAS INT NOT NULL DEFAULT 0,
    TOLERANCIA_B_PCT DECIMAL(5,2) NOT NULL DEFAULT 0,
    ALVO_C_DIAS INT NOT NULL DEFAULT 0,
    TOLERANCIA_C_PCT DECIMAL(5,2) NOT NULL DEFAULT 0,
    ATIVO BOOLEAN DEFAULT TRUE,
    CRIADO_EM VARCHAR(19),
    ATUALIZADO_POR INT,
    ATUALIZADO_EM VARCHAR(19),
    UNIQUE KEY UK_SGC_COBERTURA (NIVEL, CODIGO)
  )`,
  `CREATE TABLE IF NOT EXISTS SGC_COBERTURA_LOG (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    ID_COBERTURA INT NOT NULL,
    CAMPO VARCHAR(120) NOT NULL,
    ANTES VARCHAR(100),
    DEPOIS VARCHAR(100),
    ACAO VARCHAR(20) NOT NULL,
    POR INT,
    EM VARCHAR(19),
    INDEX IX_SGC_COBERTURA_LOG (ID_COBERTURA, ID)
  )`,
```

2. **`backend/setup-backend.mjs`**, bloco `SGC_PEDIDO_ITEM`: `COBERTURA_LIMITE INT` →
   `COBERTURA_LIMITE DECIMAL(15,2)` (o teto com tolerância tem casas: 45 × 1,10 = 49,5).

3. **`backend/simulator/config.mjs`** — `PUBLISH_ORDER` ganha `'add-014-coberturas-abc.mjs'`
   **depois** de `'add-013-compras-inteligentes.mjs'` (R-081); e `CHECK_INPUT` ganha **uma**
   chave (D-17: nenhuma repetida):

```js
  // spec 012 (coberturas por curva): só a chave nova — nivel, limite e offset já vêm da 003.
  idCobertura: '0',
```

4. **`backend/simulator/smoke.mjs`** — `import { suite as coberturas } from './smoke/012-coberturas.mjs';`
   e `await coberturas(ctx);` **depois** de `await itens(ctx);` (a suíte 012 grava no card
   `CARDS_003.gravacao`).

## Pedidos ao integrador (S4)

1. **Nada de rota nem de menu.** `/coberturas` já existe (`App.tsx:93`) e o item de menu já
   está em `permissoes.ts:169` com `exige: 'verCoberturas'`. Nenhuma chave nova de permissão
   (R-095: `verCoberturas` continua admin + gestor e não zera com READ_ONLY).
2. **Nenhum fragmento SQL novo para `sgcPodeMover`.** `backend/sql/pendencias-analise.sql`
   fica byte a byte como está: a curva entra antes, no teto gravado em
   `SGC_PEDIDO_ITEM.COBERTURA_LIMITE` (D-001 do `plan.md`).
3. **Conferir na revisão cruzada** que `frontend/src/lib/compras.ts:221,282`,
   `frontend/tests/compras.test.mjs:97-115` e `backend/simulator/smoke/003-itens.mjs:345-362`
   entraram no mesmo commit da mudança de assinatura — são arquivos da 003 que a 012 toca.
4. **Dívida registrada, não corrigida aqui:** `Itens.tsx:338` chama
   `itemDeProdutoBuscado(linha, [], capa.codfornec)` com a lista de coberturas **vazia**, então
   produto adicionado por busca recebe sempre o padrão (35), mesmo tendo parametrização de
   departamento. É uma linha da 003 (passar `coberturas` em vez de `[]`); fica para a onda 5
   ou para um `fix/003-*`.
5. **Onda 4, ordem de publicação:** `add-013` (011) antes de `add-014` (012); `add-002`
   continua por último e fora do `PUBLISH_ORDER`.

## Dependências

```
T-001 · T-002 · T-003 → T-004 · T-005 → T-006 → T-007
T-010 → T-011 → T-085 · T-087 · T-088 · T-089 · T-093 · T-094 · T-099 · T-102 · T-104 · T-105 · T-106
T-020 → T-021 → T-022 · T-023 · T-024 · T-025
T-021 → T-080..T-084 · T-086 · T-092 · T-095..T-098 · T-103
T-023 → T-087 · T-088 · T-100 · T-101
T-025 → T-103   (mesmo commit de T-021: tsc -b)
T-030 → T-031 → T-032 → T-033 → T-034 · T-035
T-024 → T-035 → T-091
tudo → T-110 · T-111 → T-112 · T-113
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-008, C-009 | T-001, T-005, T-032 | T-087, T-088 |
| RF-002 / C-001, C-013 | T-020 | T-080, T-092, T-095 |
| RF-003 / C-002, C-005 | T-021 | T-081, T-084, T-096 |
| RF-004 / C-003 | T-020, T-021 | T-082, T-097 |
| RF-005 / C-004 | T-020, T-021 | T-083 |
| RF-006 / C-006 | T-003, T-025 | T-085, T-099, T-106 |
| RF-007 / C-007 | T-021 | T-086, T-098 |
| RF-008 / C-008 | T-002, T-006, T-023, T-033 | T-087, T-100 |
| RF-009 / C-008..C-010 | T-023, T-033 | T-088, T-089, T-101 |
| RF-010 / C-001 | T-004, T-022, T-031 | T-080, T-105 |
| RF-011 / C-013 | T-020, T-032 | T-092 |
| RF-012 / C-010 | T-005, T-033 | T-089, T-104 |
| RF-013 / C-011 | T-006, T-030 | T-090, T-102 |
| RF-014 / C-012 | T-024, T-035 | T-091 |
| RF-015 / C-014 | T-006, T-034 | T-093 |
| RN-009 / C-015 | T-025 | T-094, T-103 |
| RN-010 | T-005 | T-104 |
