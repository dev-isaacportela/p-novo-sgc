# Plan: Coberturas por curva

**Spec:** `spec.md` · **Data:** 2026-09-16 · **Onda:** 4 (R-081..R-096 do 000)

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem pendência; zero `[NEEDS CLARIFICATION]` |
| Backend escrito local, executado no sandbox | sim | muda `setup-backend.mjs` (bloco `SGC_COBERTURA` + `SGC_COBERTURA_LOG` + o tipo de `SGC_PEDIDO_ITEM.COBERTURA_LIMITE`) e o bloco de coberturas do `add-006-itens.mjs`; cria `add-014-coberturas-abc.mjs`. Nada do `mitra-sdk` roda daqui |
| Migrations append-only | sim | nada em `backend/migrations/`. Nada foi publicado ainda, então `SGC_COBERTURA` é **editada no `CREATE`** (R-089), sem `ALTER` |
| Leitura e escrita por Server Function | sim | nenhum CRUD REST; toda escrita é SQL guardada por `:VAR_USER`, chamada direto da tela (R-089/R-090: nenhuma SF JavaScript, nenhum cron) |
| Simulador cobre a feature | sim | as linhas de `SGC_COBERTURA` do `seed/003-itens.mjs` passam a ter os três pares (R-096); `CHECK_INPUT` ganha **uma** chave nova (`idCobertura`); nenhum shim de dialeto novo |
| Testes automatizados obrigatórios | sim | um `teste()`/`test()` por C-001..C-015 e RN-001..RN-010, em `simulator/smoke/012-coberturas.mjs` e `frontend/tests/cobertura.test.mjs`; o `smoke/003-itens.mjs` é **revalidado** (C-007, C-020, RN-012) |
| Design tokens, sem cor literal | sim | primitivos de `page.tsx`; estado por `Status` com texto, nunca só cor; inativo nunca em vermelho (`design.md` §14) |
| Simplicidade | sim | zero tabela nova além do log; a régua continua **uma** função pura; o servidor da trava de saída **não muda** (ver §"Onde a 003 compara") |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs`
- **Reuso identificado:** `lib/cobertura.ts` (régua existente, ampliada), `lib/compras.ts` (`curvaAbc`, `montarItens`), `lib/csv.ts` (R-037), `lib/persona.ts` + `lib/permissoes.ts` (`verCoberturas`), `page.tsx` (`Tabs`, `Panel`, `Table`, `Dialog`, `Status`, `Stat`, `LabelledField`, `Pagination`), `backend/add-006-itens.mjs` (guarda de persona R-013, `COBERTURA = ['admin','gestor']`)
- **Dependência nova:** nenhuma

## Modelo de dados

### `SGC_COBERTURA` — onda 1 emendada (R-089, no `CREATE`, sem `ALTER`)

`LIMITE_DIAS` **sai**; entram os três pares. Arquivo: `backend/setup-backend.mjs:169-180`.

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `NIVEL` | `VARCHAR(20)` | `fornecedor` \| `departamento` \| `secao` \| `sku` |
| `CODIGO` | `VARCHAR(20)` | `CODFORNEC` \| `CODEPTO` \| `CODSEC` \| `CODPROD` |
| `DESCRICAO` | `VARCHAR(200)` | nome do alvo, para a tela não consultar o ERP por linha |
| `ALVO_A_DIAS` | `INT NOT NULL DEFAULT 0` | 0 = a linha não vale para a curva A (RN-002) |
| `TOLERANCIA_A_PCT` | `DECIMAL(5,2) NOT NULL DEFAULT 0` | 0 é válido: teto = alvo |
| `ALVO_B_DIAS` | `INT NOT NULL DEFAULT 0` | |
| `TOLERANCIA_B_PCT` | `DECIMAL(5,2) NOT NULL DEFAULT 0` | |
| `ALVO_C_DIAS` | `INT NOT NULL DEFAULT 0` | |
| `TOLERANCIA_C_PCT` | `DECIMAL(5,2) NOT NULL DEFAULT 0` | |
| `ATIVO` | `BOOLEAN DEFAULT TRUE` | exclusão é desativação (RN-010) |
| `CRIADO_EM` | `VARCHAR(19)` | |
| `ATUALIZADO_POR` | `INT` | |
| `ATUALIZADO_EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_SGC_COBERTURA (NIVEL, CODIGO)` — inalterada, e é ela que o log usa para
resolver o `ID_COBERTURA` da linha recém-gravada (D-004).

### `SGC_COBERTURA_LOG` — nova (R-090)

Mesma forma do `SGC_FORNECEDOR_LOG` da 001 (`setup-backend.mjs`, `CAMPO`/`DE`/`PARA`/`POR`/`EM`),
com os nomes do 000 (`ANTES`/`DEPOIS`) e mais a `ACAO`.

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_COBERTURA` | `INT NOT NULL` | |
| `CAMPO` | `VARCHAR(120) NOT NULL` | `DESCRICAO`, `ALVO_A_DIAS`, `TOLERANCIA_A_PCT`, …, `ATIVO` |
| `ANTES` | `VARCHAR(100)` | vazio na criação |
| `DEPOIS` | `VARCHAR(100)` | |
| `ACAO` | `VARCHAR(20) NOT NULL` | `criou` \| `alterou` \| `desativou` \| `reativou` |
| `POR` | `INT` | `:VAR_USER` |
| `EM` | `VARCHAR(19)` | |

`INDEX IX_SGC_COBERTURA_LOG (ID_COBERTURA, ID)`.

### `SGC_PEDIDO_ITEM.COBERTURA_LIMITE` — tipo (consequência de RN-001)

Hoje `COBERTURA_LIMITE INT` (`setup-backend.mjs`, bloco `SGC_PEDIDO_ITEM`, linha 21 do
`CREATE`). Com tolerância percentual o teto tem casas decimais (45 × 1,10 = **49,5**): um
`INT` truncaria para 49 e a trava de saída passaria a barrar meio dia antes. Passa a
`DECIMAL(15,2)`, o mesmo tipo de `COBERTURA_DIAS`, que ele compara. No `CREATE`, sem `ALTER`.
`setup-backend.mjs` é arquivo do integrador: o trecho vai em *Pedidos ao integrador (S4)* do
`tasks.md`.

### Só leitura, de outras specs

`SGC_PEDIDO_ITEM` (003): `CURVA_ABC`, `COBERTURA_DIAS`, `COBERTURA_LIMITE`,
`COBERTURA_JUSTIFICATIVA`, `CODPROD`, `CODEPTO`, `CODSEC` — a 012 não escreve nenhuma; quem
grava continua sendo o `sgcItensGravar` da 003, com os números que a régua resolveu na tela.
`INT_USER` (plataforma): `ID`, `NOME`, `ACCESS_LEVEL`, para o nome de quem alterou e para a
guarda de persona. `SGC_USUARIO_PERSONA` (002): a guarda única de R-013.

## O que a 012 passa a possuir da onda 1 (R-096)

A onda 4 corre em paralelo com a onda 3. Esta spec é a única que **muda a onda 1**: cada
arquivo abaixo é da 003 e passa a ser da 012 **nesta onda**, com o que muda e onde.

| Arquivo | O que muda | Onde |
|---|---|---|
| `backend/setup-backend.mjs` | bloco `SGC_COBERTURA`: `LIMITE_DIAS INT NOT NULL` sai, entram os seis campos (três pares). Bloco `SGC_COBERTURA_LOG` novo, ao lado. `SGC_PEDIDO_ITEM.COBERTURA_LIMITE` passa de `INT` a `DECIMAL(15,2)` | `:169-180` (`SGC_COBERTURA`), `:137` região de `SGC_PEDIDO_ITEM` (`COBERTURA_LIMITE`) |
| `backend/add-006-itens.mjs` | `SQL_COBERTURA_LISTAR` devolve os seis campos no lugar de `LIMITE_DIAS`; `sgcEscCoberturaGravar` recebe e grava os seis (`{{alvoADias}}`…); `sgcEscCoberturaExcluir` **não muda**. Mesmos nomes, mesmos ids (7307, 7358, 7359) | `:199-203`, `:352-368` |
| `frontend/src/lib/cobertura.ts` | tipo `Cobertura` com os três pares; `limiteDeCobertura(coberturas, alvo, curva)`; `coberturaDeLinha` lê as colunas novas; entram `tetoDaCurva`, `ALVO_COBERTURA_PADRAO_DIAS`, `CAMPOS_COBERTURA`, `diferencasDeCobertura`, `acaoDaCobertura`. `acimaDoLimite` não muda | arquivo inteiro (`:9-15`, `:18`, `:48-61`, `:69-77`) |
| `frontend/src/lib/compras.ts` | **duas linhas**: `montarItens` passa a curva do item para a régua (`limiteDeCobertura(coberturas, alvo, curvas.get(codprod) ?? 'C')`) e `itemDeProdutoBuscado` passa `'C'` | `:221`, `:282` |
| `frontend/src/pages/coberturas/CoberturasPage.tsx` | reescrita: grid com as três curvas e o teto, formulário com três painéis, aba de auditoria, CSV, porteiro de rota, permissão por `usePersona()` no lugar do `sgcPersonaAtual` cru | arquivo inteiro (hoje `:19-32`, `:35-93`, `:131-176`, `:178-228`) |
| `backend/simulator/seed/003-itens.mjs` | as duas linhas de `SGC_COBERTURA` passam a ter os três pares (departamento 2 = A 35/20, B 45/10, C 60/5; sku 5001 = A 20/0, B 25/0, C 30/0) | `:209-212` |
| `frontend/tests/cobertura.test.mjs` | reescrito sobre a assinatura nova: C-001..C-005, C-007, C-008, C-009, C-013, RN-001..RN-004, RN-006, RN-007 | arquivo inteiro |
| `frontend/tests/compras.test.mjs` | o teste `C-001/C-004: montarItens …` monta as coberturas com os três pares; `itens[0]` (curva A, sku 5001) espera **20**, `itens[1]` (curva C, departamento 2) espera **63** | `:97-115` |
| `backend/simulator/smoke/003-itens.mjs` | C-020 grava e lê os seis campos (`ALVO_B_DIAS` 45 / `TOLERANCIA_B_PCT` 10 no lugar de `LIMITE_DIAS` 45); o resto da suíte é **revalidado sem mudança** — C-007 e RN-012 continuam com `COBERTURA_LIMITE` 35 gravado no item, que segue válido | `:345-362` (C-020); `:210-224` e `:265-267` revalidados |

Não muda: `frontend/src/pages/quadros/abas/Itens.tsx` (`:234` continua
`acimaDoLimite(dias, item.coberturaLimite)` — o teto já vem resolvido no item),
`backend/sql/pendencias-analise.sql`, o `SQL_SAIDA_VERIFICAR` do `add-006`, `sgcPodeMover`
(002) e `sgcPedidoCarregar` (002). O porquê está na seção seguinte.

## Onde a 003 compara a cobertura futura com o limite — e como a curva entra

São **quatro** pontos, dois na tela e dois no servidor. Os do servidor comparam contra o
teto **já resolvido e gravado no item**, não contra a parametrização: a curva entra antes,
no único lugar em que a régua roda.

| # | Ponto | Arquivo:linha | Compara | Muda? |
|---|---|---|---|---|
| 1 | resolução do teto na montagem | `frontend/src/lib/compras.ts:221` (`montarItens` → `coberturaLimite`) | — (produz o número) | **sim**: recebe `curvas.get(codprod) ?? 'C'` como terceiro argumento |
| 2 | resolução do teto do produto buscado | `frontend/src/lib/compras.ts:282` (`itemDeProdutoBuscado`) | — (produz o número) | **sim**: passa `'C'` (o item nasce sem curva, RN-003) |
| 3 | sinalização na lista de itens | `frontend/src/pages/quadros/abas/Itens.tsx:234` (`acimaDoLimite(item.qtPedida > 0 ? item.coberturaDias : null, item.coberturaLimite)`) | `COBERTURA_DIAS` × `COBERTURA_LIMITE` do item | **não** |
| 4 | trava de saída no servidor | `backend/add-006-itens.mjs:241-242` e `:245-246` (`SQL_SAIDA_VERIFICAR`, `SEM_JUSTIF_COBERTURA` e `EXEMPLO_COBERTURA`) e o mesmo texto em `backend/sql/pendencias-analise.sql:38` e `:78,82` (bloco `PENDENCIAS`/`PENDENCIAS_MOTIVO` do `sgcPodeMover` da 002) | `I.COBERTURA_DIAS > I.COBERTURA_LIMITE` | **não** |

O predicado do servidor é, hoje e depois:

```sql
(SELECT COUNT(*) FROM SGC_PEDIDO_ITEM I
  WHERE I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0
    AND I.COBERTURA_DIAS > I.COBERTURA_LIMITE
    AND TRIM(COALESCE(I.COBERTURA_JUSTIFICATIVA, '')) = '') AS SEM_JUSTIF_COBERTURA
```

`I.COBERTURA_LIMITE` **já é** o teto da curva do item: quem o calculou foi `montarItens`, com
`SGC_PEDIDO_ITEM.CURVA_ABC` na mão, e `sgcItensGravar` o gravou junto do item. O servidor não
precisa da parametrização, não precisa de `JOIN` com `SGC_COBERTURA`, não precisa da curva e
não muda de mensagem — é o que RF-006 pede. **Nenhum fragmento SQL novo é entregue ao
integrador**, e o `backend/sql/pendencias-analise.sql` fica byte a byte como está.

Por que não resolver no servidor: um `JOIN` com `SGC_COBERTURA` por `CURVA_ABC` exigiria
repetir a precedência de quatro níveis em SQL (uma segunda régua, com o risco de divergir da
pura — a dívida que R-013 e o teste das 500 combinações existem para evitar), e ainda assim
cobraria um teto diferente do que a compradora viu na tela no momento em que decidiu. A
fotografia no item é o que faz RN-009 ser verdade.

Consequência única no servidor: o **tipo** de `COBERTURA_LIMITE` (`DECIMAL(15,2)`, ver
*Modelo de dados*). Sem ela, o teto 49,5 da curva B viraria 49 e a trava barraria itens entre
49 e 49,5 dias.

## Contratos de backend

Ids: **82xx** (R-081) em `backend/add-014-coberturas-abc.mjs` — leituras em 8201–8230,
escritas em 8250–8279. As três SFs de cobertura da 003 **mantêm nome e id** (7307, 7358,
7359) e continuam em `add-006-itens.mjs` (R-096). Filtro desligado é `''` no texto e `0` no
número; toda listagem tem `LIMIT/OFFSET`; escrita é SQL de uma instrução, guardada por
`:VAR_USER`.

| Nome | Script | Id | Tipo | Entrada (`{{param}}`, valor "desligado") | Saída | Atende |
|---|---|---|---|---|---|---|
| `sgcCoberturaListar` | `add-006` (emendada) | 7307 | SQL | `nivel` (`''`), `limite` (`200`), `offset` (`0`) | `ID, NIVEL, CODIGO, DESCRICAO, ALVO_A_DIAS, TOLERANCIA_A_PCT, ALVO_B_DIAS, TOLERANCIA_B_PCT, ALVO_C_DIAS, TOLERANCIA_C_PCT, ATUALIZADO_POR, ATUALIZADO_EM` | RF-001, RF-003, RF-010 |
| `sgcEscCoberturaGravar` | `add-006` (emendada) | 7358 | SQL | `nivel`, `codigo`, `descricao`, `alvoADias` (`0`), `toleranciaAPct` (`0`), `alvoBDias`, `toleranciaBPct`, `alvoCDias`, `toleranciaCPct`, `atualizadoEm` | — (upsert; regravar reativa) | RF-001, RF-012 |
| `sgcEscCoberturaExcluir` | `add-006` (inalterada) | 7359 | SQL | `id` (`0`), `atualizadoEm` | — | RF-012 |
| `sgcCoberturaLogListar` | `add-014` | 8201 | SQL | `idCobertura` (`0` = todas), `limite` (`50`), `offset` (`0`) | `ID, ID_COBERTURA, NIVEL, CODIGO, DESCRICAO, CAMPO, ANTES, DEPOIS, ACAO, POR, POR_NOME, EM` | RF-015 |
| `sgcEscCoberturaLogInserir` | `add-014` | 8250 | SQL | `nivel`, `codigo`, `campo`, `antes` (`''`), `depois`, `acao`, `em` | — (uma linha por chamada) | RF-008, RF-009 |

### `sgcCoberturaListar` (7307, emendada)

```sql
SELECT ID, NIVEL, CODIGO, DESCRICAO,
       ALVO_A_DIAS, TOLERANCIA_A_PCT,
       ALVO_B_DIAS, TOLERANCIA_B_PCT,
       ALVO_C_DIAS, TOLERANCIA_C_PCT,
       ATUALIZADO_POR, ATUALIZADO_EM
FROM SGC_COBERTURA
WHERE ATIVO = 1 AND ('{{nivel}}' = '' OR NIVEL = '{{nivel}}')
ORDER BY CASE NIVEL WHEN 'sku' THEN 1 WHEN 'secao' THEN 2 WHEN 'departamento' THEN 3 ELSE 4 END, CODIGO
LIMIT {{limite}} OFFSET {{offset}}
```

Mesma ordenação de hoje (do mais específico para o mais geral) e mesmo filtro. Quem consome:
`CoberturasPage` (a lista) e a aba Itens da 003 (`Itens.tsx:99-101`, `limite: 500`) — as duas
sem execução a mais (RNF-004).

### `sgcEscCoberturaGravar` (7358, emendada)

```sql
INSERT INTO SGC_COBERTURA (NIVEL, CODIGO, DESCRICAO,
  ALVO_A_DIAS, TOLERANCIA_A_PCT, ALVO_B_DIAS, TOLERANCIA_B_PCT, ALVO_C_DIAS, TOLERANCIA_C_PCT,
  ATIVO, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT '{{nivel}}', '{{codigo}}', '{{descricao}}',
  {{alvoADias}}, {{toleranciaAPct}}, {{alvoBDias}}, {{toleranciaBPct}}, {{alvoCDias}}, {{toleranciaCPct}},
  1, '{{atualizadoEm}}', :VAR_USER, '{{atualizadoEm}}'
FROM DUAL
WHERE <guarda(COBERTURA)>
ON DUPLICATE KEY UPDATE
  DESCRICAO = VALUES(DESCRICAO),
  ALVO_A_DIAS = VALUES(ALVO_A_DIAS), TOLERANCIA_A_PCT = VALUES(TOLERANCIA_A_PCT),
  ALVO_B_DIAS = VALUES(ALVO_B_DIAS), TOLERANCIA_B_PCT = VALUES(TOLERANCIA_B_PCT),
  ALVO_C_DIAS = VALUES(ALVO_C_DIAS), TOLERANCIA_C_PCT = VALUES(TOLERANCIA_C_PCT),
  ATIVO = 1,
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
```

`<guarda(COBERTURA)>` é o helper `guarda(['admin','gestor'])` já existente em
`add-006-itens.mjs:50-68` — o texto único de R-013, com `ACCESS_LEVEL <> 'READ_ONLY'`.
`FROM DUAL` obrigatório (A6). `ATIVO = 1` no `UPDATE` é o que faz regravar reativar (RN-010).

### `sgcEscCoberturaLogInserir` (8250)

Uma linha por chamada — a tela chama uma vez por campo alterado (RF-008). O `ID_COBERTURA`
**não vem da tela**: sai da própria `SGC_COBERTURA` pela chave única, o que resolve a criação
(a escrita anterior não devolve o id gerado — D-03 da revisão da onda 1) sem custar leitura.

```sql
INSERT INTO SGC_COBERTURA_LOG (ID_COBERTURA, CAMPO, ANTES, DEPOIS, ACAO, POR, EM)
SELECT C.ID, '{{campo}}', '{{antes}}', '{{depois}}', '{{acao}}', :VAR_USER, '{{em}}'
FROM SGC_COBERTURA C
WHERE C.NIVEL = '{{nivel}}' AND C.CODIGO = '{{codigo}}'
  AND <guarda(COBERTURA)>
```

Sem `FROM DUAL` porque a instrução já tem um `FROM` real. A guarda é a mesma da gravação: um
salvamento recusado casa 0 linhas nos dois lugares e não deixa log órfão (RNF-005). Se o alvo
não existir (nível/código errados), casa 0 linhas — o log nunca aponta para nada.

### `sgcCoberturaLogListar` (8201)

```sql
SELECT L.ID, L.ID_COBERTURA, C.NIVEL, C.CODIGO, C.DESCRICAO,
       L.CAMPO, L.ANTES, L.DEPOIS, L.ACAO, L.POR,
       COALESCE(U.NOME, '') AS POR_NOME, L.EM
FROM SGC_COBERTURA_LOG L
LEFT JOIN SGC_COBERTURA C ON C.ID = L.ID_COBERTURA
LEFT JOIN INT_USER U ON U.ID = L.POR
WHERE ({{idCobertura}} = 0 OR L.ID_COBERTURA = {{idCobertura}})
ORDER BY L.ID DESC
LIMIT {{limite}} OFFSET {{offset}}
```

`LEFT JOIN` em `SGC_COBERTURA` (e não `JOIN`): o histórico sobrevive a qualquer sumiço futuro
do alvo. `ORDER BY L.ID DESC` é "do mais recente para o mais antigo" sem depender do formato
do carimbo (C-014).

### Bloco 82xx de `frontend/src/lib/server-functions.ts`

```ts
// 012 — coberturas por curva (R-081): leituras 8201–8230, escritas 8250–8279.
sgcCoberturaLogListar: 'sgcCoberturaLogListar',
sgcEscCoberturaLogInserir: 'sgcEscCoberturaLogInserir',
// ids locais
sgcCoberturaLogListar: '8201',
sgcEscCoberturaLogInserir: '8250',
```

`sgcCoberturaListar`, `sgcEscCoberturaGravar` e `sgcEscCoberturaExcluir` continuam no bloco
73xx, com os ids 7307/7358/7359 — R-081: nenhuma SF das ondas 1–3 muda de id.
`backend/simulator/config.mjs` ganha `'add-014-coberturas-abc.mjs'` no `PUBLISH_ORDER`, depois
do `add-013` da 011 (arquivo do integrador).

## Regra pura — `frontend/src/lib/cobertura.ts`

```ts
export type NivelCobertura = 'fornecedor' | 'departamento' | 'secao' | 'sku';
export type CurvaAbc = 'A' | 'B' | 'C';

export interface ParCurva { alvoDias: number; toleranciaPct: number }

export interface Cobertura {
  id: number;
  nivel: NivelCobertura;
  codigo: string;
  descricao: string;
  ativo: boolean;
  curvas: Record<CurvaAbc, ParCurva>;
}

/** Sem linha alcançável: alvo 35 dias, tolerância 0 (RN-002, AN-07). */
export const ALVO_COBERTURA_PADRAO_DIAS = 35;
export const TOLERANCIA_COBERTURA_PADRAO_PCT = 0;

/** RN-001: alvo × (1 + tolerância ÷ 100), duas casas. */
export function tetoDaCurva(alvoDias: number, toleranciaPct: number): number;

/** RN-003: 'A' | 'B' | 'C'; qualquer outra coisa (vazio, 'D', undefined) → 'C'. */
export function curvaValida(bruta: unknown): CurvaAbc;

/**
 * RN-002. sku > secao > departamento > fornecedor; só entra a linha ativa,
 * que alcança o alvo E tem alvoDias > 0 na curva pedida.
 */
export function limiteDeCobertura(
  coberturas: Cobertura[],
  alvo: { codprod: number; codsec: number; codepto: number; codfornec: number },
  curva: unknown,
): { limiteDias: number; alvoDias: number; toleranciaPct: number; curva: CurvaAbc; nivel: NivelCobertura | 'padrao' };

/** Inalterada (003, RF-010). */
export function acimaDoLimite(coberturaDias: number | null, limiteDias: number): boolean;

/** Linha de `sgcCoberturaListar` (UPPERCASE) → o objeto da régua. */
export function coberturaDeLinha(linha: Record<string, unknown>): Cobertura;

export type AcaoCobertura = 'criou' | 'alterou' | 'desativou' | 'reativou';

/** RN-006: os campos auditáveis, na ordem em que a tela os mostra —
 *  `DESCRICAO`, `ALVO_A_DIAS`, `TOLERANCIA_A_PCT`, …, `ATIVO`. */
export const CAMPOS_COBERTURA: readonly string[];

/** RN-006: uma entrada por campo cujo valor mudou; nada quando nada mudou. */
export function diferencasDeCobertura(
  antes: Cobertura | null,
  depois: Cobertura,
): { campo: string; antes: string; depois: string }[];

/** RN-007: criou | alterou | desativou | reativou. */
export function acaoDaCobertura(antes: Cobertura | null, depois: Cobertura): AcaoCobertura;

/** RF-014: cabeçalho e linhas do CSV, números já em vírgula decimal. */
export const COLUNAS_CSV_COBERTURA: readonly string[];
export function linhasCsvCobertura(lista: Cobertura[]): string[][];
```

`ROTULO_NIVEL` e `NivelCobertura` continuam exportados como hoje (a tela e a 011 os usam).
`LIMITE_COBERTURA_PADRAO_DIAS` **sai**: o nome mentia (era alvo e teto ao mesmo tempo);
`ALVO_COBERTURA_PADRAO_DIAS` ocupa o lugar, com o mesmo 35.

### Tabela de casos numéricos (é o que os testes puros exercitam)

Parametrização de referência (a mesma do seed): **departamento 2** = A 35/20, B 45/10, C
60/5; **sku 5001** = A 20/0, B 25/0, C 30/0; **seção 21** = A 10/0, B 0/0, C 0/0.

| # | Alvo do item | Curva | Linha que vence | Alvo | Tol. | Teto | Regra |
|---|---|---|---|---|---|---|---|
| 1 | 5002 (dep. 2, seç. 99) | A | departamento | 35 | 20 | **42** | RN-001 |
| 2 | 5002 | B | departamento | 45 | 10 | **49,5** | RN-001 |
| 3 | 5002 | C | departamento | 60 | 5 | **63** | RN-001 |
| 4 | 5001 (dep. 2, seç. 99) | B | sku | 25 | 0 | **25** | RN-002 |
| 5 | 5002 | `''` | departamento, coluna C | 60 | 5 | **63** | RN-003 |
| 6 | 5002 | `'D'` | departamento, coluna C | 60 | 5 | **63** | RN-003 |
| 7 | 7001 (dep. 9, sem nada) | A | padrão | 35 | 0 | **35** | RN-002 |
| 8 | 5003 (dep. 2, **seç. 21**) | A | seção | 10 | 0 | **10** | RN-002 |
| 9 | 5003 (dep. 2, **seç. 21**) | B | departamento (a seção tem alvo 0 em B) | 45 | 10 | **49,5** | RN-002 |
| 10 | 5001 com a linha de sku inativa | B | departamento | 45 | 10 | **49,5** | RN-010 |
| 11 | alvo com código `0`/vazio no nível | qualquer | pula o nível | — | — | — | comportamento de hoje, preservado |

`tetoDaCurva`: (35, 20) → 42 · (45, 10) → 49,5 · (60, 5) → 63 · (35, 0) → 35 · (0, 20) → 0
(a linha não vale, cai para o nível seguinte).

`diferencasDeCobertura` / `acaoDaCobertura`:

| Antes | Depois | Linhas | Ação |
|---|---|---|---|
| `null` | descrição + os três pares preenchidos | 7 | `criou` |
| A 35/20, B 45/10, C 60/5 | A 30/10, B 40/5, C 50/0 | 6 | `alterou` |
| A 35/20… | idêntica | 0 | `alterou` (nenhuma linha gravada) |
| ativa | inativa | 1 (`ATIVO`, `1` → `0`) | `desativou` |
| inativa | ativa, mesmos números | 1 (`ATIVO`) | `reativou` |

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/coberturas` (existente, ampliada) | lista, formulário com três painéis de curva, aba de auditoria, CSV, porteiro de rota | `PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `SelectMenu`, `Table`/`Th`/`Td`/`Tr`, `RowTitle`, `RowMeta`, `Code`, `Status`, `Dash`, `Stat`, `LabelledField`, `Input`, `Button`, `IconButton`, `Alert`, `EmptyState`, `Dialog*`, `Pagination`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` | `CoberturasPage` (reescrita), `PainelCurva` (interno ao arquivo) |

Arquivos:

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/pages/coberturas/CoberturasPage.tsx` | a tela inteira (lista + diálogo + aba de auditoria), ≤ 800 linhas (`max-lines`) |
| `frontend/src/lib/cobertura.ts` | a régua e as funções de auditoria (regra crítica fora do JSX) |
| `backend/add-014-coberturas-abc.mjs` | `sgcCoberturaLogListar`, `sgcEscCoberturaLogInserir` |

Desenho (`design.md` §8, §9.1, §9.4, §9.5, §14):

- **Grid**: `Nível` (`Status tone="off"`), `Alvo` (`RowTitle` com a descrição, `RowMeta` com
  `Code` do código), `Situação`, e três colunas de curva (`A`, `B`, `C`), cada uma com
  `35 d · 20 %` em cima e `máx. 42 d` embaixo, todas `numeric`. Ações inline em `IconButton`
  (editar verde, desativar vermelho). Sem zebra, sem selo preenchido dentro da célula.
- **Situação**: `Status tone="live"` "Ativa" / `tone="off"` "Inativa" — texto ao lado da cor,
  e **inativo nunca em vermelho** (anti-padrão da §14).
- **Formulário** (`Dialog`, §9.5): nível, código, descrição e três painéis de curva lado a
  lado (`grid` que vira coluna única no celular), cada um com "Alvo (dias)", "Tolerância (%)"
  e o "Máximo sem justificativa" calculado (`Stat` com `Dash` enquanto faltar um dos dois
  números — C-013). Quando `Kpi`/`GradeKpi` (`design.md` §8.7, entrega da base pela R-080)
  já estiverem em `page.tsx`, o `Stat` dá lugar a eles sem mexer na regra.
- **Validação**: Salvar fica desabilitado sem código e sem os três alvos maiores que zero;
  tolerância vazia é lida como 0 e o campo diz isso ("0 = nenhuma folga"), como no legado
  ("Use 0 para não tolerar desvio").
- **Abas** (§9.4): `Parâmetros` e `Auditoria`; a ação primária ("Novo limite") fica na faixa
  do painel da aba `Parâmetros`, não no cabeçalho da página. A aba `Auditoria` carrega
  `sgcCoberturaLogListar` só quando aberta (uma execução, RNF-003) e tem um `SelectMenu` para
  recortar por parametrização (`idCobertura`).
- **Porteiro de rota** (A-8 da revisão da onda 2): `if (!sessao.permissoes.verCoberturas)`
  devolve `PageHeader` + `Alert tone="error"` — hoje a tela **não tem** porteiro e qualquer
  persona alcança `/coberturas` pelo endereço direto; a 012 fecha isso.
- **Permissão** (§9.4): `podeManter = sessao.permissoes.verCoberturas && !sessao.permissoes.somenteLeitura`.
  Controles desabilitados com o motivo no `title`, nunca escondidos (D-11).
- **Sem toast** (UI-02): erro em `Alert`; confirmação é a lista recarregada.
- **Sem campo de data**: nenhum nesta tela.

### Personas (`lib/permissoes.ts`, arquivo compartilhado — **nada muda**)

`verCoberturas` é hoje `true` para **admin** e **gestor**, `false` para analista, diretoria e
comercial (`permissoes.ts:80,87,94,103,113`), e **não é zerado por READ_ONLY** (`:137`, D-12).
R-095 manda manter: "`verCoberturas` continua (admin, gestor) e passa a cobrir as curvas".
Nenhuma chave nova, nenhuma linha do menu nova (`/coberturas` já está em `MENU:169`). O que
muda é só a tela passar a **usar** a permissão (hoje ela lê `sgcPersonaAtual` cru e compara
com uma lista local, `CoberturasPage.tsx:29,57-64` — instância de D-02).

### CSV (R-037/R-094)

`textoCsv`/`baixarCsv` de `lib/csv.ts`, sem SF nova e sem segunda consulta — sobre as linhas
já carregadas. Nome `coberturas-<AAAA-MM-DD>.csv`. Colunas: `Nível; Código; Alvo; Situação;
A alvo (dias); A tolerância (%); A máximo (dias); B alvo (dias); B tolerância (%); B máximo
(dias); C alvo (dias); C tolerância (%); C máximo (dias)`, números já em vírgula decimal.

## Fluxo

1. A tela abre: `sgcCoberturaListar` (lista) e a persona em cache (`usePersona`) — duas
   execuções na primeira vez, uma depois (RNF-001). Sem `verCoberturas`, para no porteiro.
2. O gestor abre o diálogo. Ao digitar alvo e tolerância, `tetoDaCurva` mostra o máximo sem
   justificativa em cada painel — nada vai ao servidor (C-013).
3. Salvar: a tela guarda o objeto **antes** (a linha da lista, ou `null` na criação), chama
   `sgcEscCoberturaGravar` com os seis números e, em seguida, `acaoDaCobertura(antes, depois)`
   e `diferencasDeCobertura(antes, depois)` — e faz **uma** chamada de
   `sgcEscCoberturaLogInserir` por entrada devolvida (RF-008, RNF-002). Depois recarrega a
   lista.
4. Desativar: `sgcEscCoberturaExcluir` e, na sequência, uma linha de log
   (`CAMPO = 'ATIVO'`, `1` → `0`, `ACAO = 'desativou'`).
5. A aba Auditoria chama `sgcCoberturaLogListar` ao ser aberta e ao trocar o recorte.
6. Na montagem do pedido (003), nada muda no número de execuções: `Itens.tsx` já carrega
   `sgcCoberturaListar` junto de `sgcWintAnaliseMontagem` (`Itens.tsx:92-101`); `montarItens`
   passa a curva que ele mesmo calculou (`curvaAbc`, `compras.ts:187`) para a régua, e
   `sgcItensGravar` grava `CURVA_ABC` e `COBERTURA_LIMITE` como hoje.
7. Na saída da Análise, `sgcAnaliseSair` → `sgcAnaliseSaidaVerificar` compara
   `COBERTURA_DIAS > COBERTURA_LIMITE` como hoje, com a mesma mensagem.

## Simulador

### Seed — `backend/simulator/seed/003-itens.mjs` (as linhas de `SGC_COBERTURA`, R-096)

Nenhuma tabela nova no seed, nenhum produto novo, nenhum card novo: a 012 só troca as duas
linhas de `SGC_COBERTURA` (`:209-212`) pelas mesmas duas com os três pares —

| Nível | Código | Descrição | A | B | C | Tetos |
|---|---|---|---|---|---|---|
| `departamento` | `2` | NUTRICAO CLINICA | 35 / 20 % | 45 / 10 % | 60 / 5 % | 42 · 49,5 · 63 |
| `sku` | `5001` | CREME NUTRICIONAL MORANGO 200 ML | 20 / 0 % | 25 / 0 % | 30 / 0 % | 20 · 25 · 30 |

Os valores de A do departamento e do sku são exatamente os de referência de R-089 (A 35/20,
B 45/10, C 60/5) e preservam o que a 003 já testava (o sku 5001 valendo 20 na curva A e o
departamento valendo para o 5002). Os `coberturaLimite` gravados nos itens dos cards do seed
(`:224,225,232,239,240,251,261,262`, todos 35) **não mudam**: são fotografias do teto no
momento da análise (RN-009), e é sobre eles que C-007 e RN-012 da 003 continuam valendo.

**Seed extra para o smoke da 012:** nenhum arquivo novo. O cenário C-006 (trava com item de
curva A acima de 42) usa o card `CARDS_003.gravacao`, que nasce vazio e com prazo resolvido
justamente para a suíte gravar nele: o smoke chama o `sgcItensGravar` real com um item
`CURVA_ABC = 'A'`, `COBERTURA_DIAS = 45`, `COBERTURA_LIMITE = 42`, `QT_PEDIDA = 10` e sem
justificativa, verifica a recusa, regrava com justificativa e verifica a liberação. A suíte
012 roda por último no `smoke.mjs`, depois da 003.

### `CHECK_INPUT` (`backend/simulator/config.mjs`, arquivo do integrador)

Uma chave nova, e só (D-09/D-17: nenhuma repetida, nenhum valor existente alterado):

```js
// spec 012 (coberturas por curva): só a chave nova — nivel, limite e offset já existem (003).
idCobertura: '0',
```

`nivel` (`''`) já está na seção da 003 e serve. Os parâmetros dos seis números novos são de
**escrita**, e o `sim:check` pula escrita e JAVASCRIPT — nada a acrescentar por eles. `curva`
**não** entra: a curva nunca vira parâmetro de SF, porque a régua é pura (R-083 vale também
aqui).

### Dialeto

Nenhum shim novo. `sgcCoberturaLogListar` usa `COALESCE`, `LEFT JOIN` e `LIMIT/OFFSET`;
`sgcEscCoberturaGravar` usa `ON DUPLICATE KEY UPDATE`/`VALUES()` e `FROM DUAL`, todos já
traduzidos por `simulator/mysql-dialect.mjs` (e com a correção de R-079 já em `develop`).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `frontend/tests/cobertura.test.mjs` | com a parametrização de referência, `limiteDeCobertura(cob, alvo5002, 'A').limiteDias` → 42; `'B'` → 49,5; `'C'` → 63 |
| C-002 | `frontend/tests/cobertura.test.mjs` | `limiteDeCobertura(cob, alvo5001, 'B')` → `{ limiteDias: 25, alvoDias: 25, nivel: 'sku' }` |
| C-003 | `frontend/tests/cobertura.test.mjs` | `limiteDeCobertura(cob, alvo5002, '')` → `{ limiteDias: 63, curva: 'C' }` |
| C-004 | `frontend/tests/cobertura.test.mjs` | `limiteDeCobertura(cob, alvo7001, 'A')` → `{ limiteDias: 35, alvoDias: 35, toleranciaPct: 0, nivel: 'padrao' }` |
| C-005 | `frontend/tests/cobertura.test.mjs` | com a seção 21 em A 10/0 e B/C zerados, `limiteDeCobertura(cob, alvo5003, 'B')` → `{ limiteDias: 49.5, nivel: 'departamento' }`; `'A'` → `{ 10, nivel: 'secao' }` |
| C-006 | `backend/simulator/smoke/012-coberturas.mjs` | `sgcItensGravar` grava no card `gravacao` um item curva A, 45 dias, teto 42, sem justificativa → `sgcAnaliseSaidaVerificar` devolve `PODE = 0` e `MOTIVO` casando `/Justifique os itens com cobertura acima do limite \(1\), a começar por/` e a descrição do produto; regravado com justificativa → `PODE = 1` e `MOTIVO` vazio |
| C-007 | `frontend/tests/cobertura.test.mjs` | a mesma chamada de C-001 devolve `alvoDias: 35` e `toleranciaPct: 20` ao lado de `limiteDias: 42` — o estoque máximo da 011 lê `alvoDias` |
| C-008 | `frontend/tests/cobertura.test.mjs` + `backend/simulator/smoke/012-coberturas.mjs` | puro: `diferencasDeCobertura(A 35/20 B 45/10 C 60/5, A 30/10 B 40/5 C 50/0)` → 6 entradas, com `campo`/`antes`/`depois` de cada uma, e `acaoDaCobertura` → `'alterou'`. Smoke: seis `sgcEscCoberturaLogInserir` como `gil` + `sgcCoberturaLogListar` com o `idCobertura` do alvo devolve as 6, com `ANTES`/`DEPOIS` certos e `POR_NOME` de `gil` |
| C-009 | `frontend/tests/cobertura.test.mjs` + `smoke/012-coberturas.mjs` | puro: `diferencasDeCobertura(null, nova)` → 7 entradas com `antes` vazio e ação `'criou'`. Smoke: `sgcEscCoberturaGravar` de um alvo inexistente (`sku 5004`) + os 7 logs → `sgcCoberturaLogListar` filtrado devolve 7 linhas com `ACAO = 'criou'` |
| C-010 | `smoke/012-coberturas.mjs` | `sgcEscCoberturaExcluir` no `sku 5001` + log `desativou` → `sgcCoberturaListar` não traz mais a linha e a régua (rodada sobre o resultado da SF real) resolve 49,5 na curva B; `sgcEscCoberturaGravar` de novo + log `reativou` → volta a 25 |
| C-011 | `smoke/012-coberturas.mjs` + `frontend/tests/permissoes.test.mjs` | smoke: `sgcEscCoberturaGravar` e `sgcEscCoberturaLogInserir` como `ana` (analista) e `leo` (comercial) não alteram contagem nenhuma nas duas tabelas; como `gil`, alteram. Puro: `permissoesDe('gestor','READ_ONLY').verCoberturas` → `true` e `somenteLeitura` → `true`; `permissoesDe('analista','MEMBER').verCoberturas` → `false` |
| C-012 | `frontend/tests/cobertura.test.mjs` | `linhasCsvCobertura([referência])` → `['departamento','2','NUTRICAO CLINICA','Ativa','35','20','42','45','10','49,5','60','5','63']` |
| C-013 | `frontend/tests/cobertura.test.mjs` | `tetoDaCurva(45, 10)` → 49,5; `tetoDaCurva(45, NaN)` → `null`; `tetoDaCurva(0, 10)` → `null` |
| C-014 | `smoke/012-coberturas.mjs` | `sgcCoberturaLogListar` com `idCobertura: 0` devolve `ID` em ordem decrescente e uma contagem **apurada no próprio banco** (`SELECT COUNT(*)`), nunca literal (R-045); com o `idCobertura` de um alvo, só as linhas dele |
| C-015 | `smoke/012-coberturas.mjs` | com o item gravado com teto 42 e a parametrização alterada para 30/0 por `sgcEscCoberturaGravar`, `sgcAnaliseSaidaVerificar` continua devolvendo o veredicto do teto 42 gravado (o item não é reescrito) |
| RN-001 | `frontend/tests/cobertura.test.mjs` | `tetoDaCurva`: (35,20)→42; (45,10)→49,5; (60,5)→63; (35,0)→35; (0,20)→`null` |
| RN-002 | `frontend/tests/cobertura.test.mjs` | com sku 20/0, seção 45/0, departamento 60/0 e fornecedor 90/0 na curva A → 20; sem a de sku → 45; só a de fornecedor → 90; lista vazia → 35 |
| RN-003 | `frontend/tests/cobertura.test.mjs` | `curvaValida('')`, `curvaValida('D')`, `curvaValida(undefined)` → `'C'`; `curvaValida('b')` → `'B'` |
| RN-004 | `frontend/tests/cobertura.test.mjs` | toda resolução devolve `alvoDias` e `limiteDias`; no padrão, 35 e 35; no departamento curva A, 35 e 42 |
| RN-005 | `smoke/003-itens.mjs` (revalidado) | RN-012 continua devolvendo as cinco mensagens, na mesma ordem, com o seed novo |
| RN-006 | `frontend/tests/cobertura.test.mjs` | `diferencasDeCobertura(x, x)` → `[]`; com um único número diferente → 1 entrada |
| RN-007 | `frontend/tests/cobertura.test.mjs` | `acaoDaCobertura(null, x)` → `'criou'`; ativa→inativa → `'desativou'`; inativa→ativa → `'reativou'`; valores diferentes com a mesma situação → `'alterou'` |
| RN-008 | `smoke/012-coberturas.mjs` | o mesmo par de escritas chamado por `ana`, `leo` e `dora` não grava; por `gil` e `admin`, grava |
| RN-009 | `frontend/tests/compras.test.mjs` + `smoke/012-coberturas.mjs` | puro: `montarItens` com a parametrização de referência dá teto 20 ao 5001 (curva A) e 63 ao 5002 (curva C); smoke: C-015 prova que o item gravado não muda quando a régua muda |
| RN-010 | `smoke/012-coberturas.mjs` | desativada, a linha some de `sgcCoberturaListar`; regravada, volta com os valores enviados (`ALVO_B_DIAS` 25) |
| C-020 da 003 | `smoke/003-itens.mjs` (emendado) | `sgcEscCoberturaGravar` como `gil` grava os seis campos da seção 21 e `sgcCoberturaListar` devolve `ALVO_B_DIAS` 45 e `TOLERANCIA_B_PCT` 10; como `ana`, não grava |
| C-007 da 003 | `smoke/003-itens.mjs` (revalidado) | sem mudança: o item 5001 com `COBERTURA_DIAS` 40 e `COBERTURA_LIMITE` 35 continua recusando e liberando com justificativa |

- **Backend:** `backend/simulator/smoke/012-coberturas.mjs`, um `teste()` por linha, título
  começando pelo id do cenário; registrado no `backend/simulator/smoke.mjs` (arquivo do
  integrador) **depois** da 003. Nenhuma consulta Oracle nesta spec — as SFs são todas do
  banco do projeto; a exigência de "contagem > 0" continua valendo nas suítes que consultam o
  WinThor.
- **Frontend:** `frontend/tests/cobertura.test.mjs` (reescrito), mais duas linhas em
  `compras.test.mjs` e uma em `permissoes.test.mjs`, com `node --test`.
- **R-045:** nenhuma asserção literal sobre listagem global — o histórico é contado pelo
  próprio banco ou recortado por `idCobertura`.

## Dependências entre specs

**Consome da 003 (itens do pedido):**

- `SGC_PEDIDO_ITEM.CURVA_ABC`, gravado por `sgcItensGravar` a partir de `curvaAbc()`
  (`lib/compras.ts:133-151`) — é a única entrada de curva da régua.
- `montarItens`/`itemDeProdutoBuscado` (`lib/compras.ts`) como chamadores da régua; as duas
  linhas de chamada mudam junto, no mesmo commit (a assinatura muda).
- `sgcAnaliseSaidaVerificar`/`sgcAnaliseSair` e o bloco `PENDENCIAS` de
  `backend/sql/pendencias-analise.sql` — **consumidos sem alteração**.
- `Itens.tsx` continua carregando `sgcCoberturaListar` junto da análise (nenhuma execução a
  mais).

**Entrega à 011 (compras inteligentes):**

- A assinatura `limiteDeCobertura(coberturas, alvo, curva)` e o retorno com **`alvoDias`**
  separado de `limiteDias`. O estoque máximo da 011 (R-082: `máximo = cobertura × consumo`)
  usa `alvoDias` — 35, não 42 — quando não há parâmetro mais específico em
  `SGC_PARAMETRO_COMPRA` (a precedência de O4-02/R-086: SKU > fornecedor > **cobertura por
  curva (012)** > padrão). A coluna física é `SGC_COBERTURA.ALVO_<curva>_DIAS`; a 011 não a
  lê direto, lê pela régua.
- `tetoDaCurva`, `curvaValida` e o tipo `Cobertura` (`lib/cobertura.ts`), para a 011 exibir a
  cobertura futura do carrinho contra o mesmo teto.
- A 012 **não** calcula curva: a régua única é a `curvaAbc()` da 003, aplicada pela 011 sobre
  a janela da tela dela (R-088).

**Entrega à 003:**

- O `smoke/003-itens.mjs` revalidado (C-007, C-020, RN-012 verdes com o seed e o schema
  novos) e o `tests/compras.test.mjs` ajustado.
- `SGC_COBERTURA` com os três pares, consumida pela aba Itens sem execução a mais.

**Depende do integrador (S4):** `setup-backend.mjs` (DDL), `simulator/config.mjs`
(`PUBLISH_ORDER` + `CHECK_INPUT`), `simulator/smoke.mjs` (registro da suíte),
`frontend/src/lib/server-functions.ts` (bloco 82xx). Lista pronta em `tasks.md`.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | A curva entra **na tela**, no momento da montagem: a régua pura resolve o teto e `sgcItensGravar` o grava em `COBERTURA_LIMITE`. O servidor da trava de saída não muda | `JOIN` de `SGC_COBERTURA` por `CURVA_ABC` dentro de `sgcAnaliseSaidaVerificar` e do bloco `PENDENCIAS` | Seria uma segunda régua de precedência em SQL, com quatro níveis e a curva — exatamente o tipo de duplicata que R-013 e o teste das 500 combinações existem para evitar. E mudaria o veredicto de um pedido já montado por baixo da compradora (RN-009). Custo desta escolha: o tipo de `COBERTURA_LIMITE` precisa aceitar decimal |
| D-002 | `SGC_COBERTURA` ganha três pares de colunas; `LIMITE_DIAS` sai | Tabela de regra + filha por curva, como o legado (`CI_ABC_REGRA_COBERTURA` + `CI_ABC_COBERTURA_CURVA`) | A tabela já existe com `NIVEL`/`CODIGO`/`ATIVO` e a tela já a edita; a filha traria um `JOIN`, uma chave a mais e um segundo lugar para desativar. Três curvas é um número fechado, não uma lista que cresce (R-089, decisão 3 do levantamento) |
| D-003 | Alvo e tolerância são guardados separados; o teto é derivado | Guardar só o teto final | São dois conceitos: o alvo é a mira da compra (estoque máximo da 011) e o teto é a fronteira da justificativa. Guardar só o teto perderia o número que a 011 precisa (RN-004, decisão 4 do levantamento) |
| D-004 | `sgcEscCoberturaLogInserir` resolve o `ID_COBERTURA` pela chave única (`NIVEL`, `CODIGO`) dentro da própria instrução | A tela ler o id de volta antes de logar | Escrita guardada não devolve o id gerado (D-03 da revisão da onda 1) e uma releitura custaria execução por salvamento. A chave única já identifica a linha, e a guarda idêntica faz o log recusado acompanhar a gravação recusada |
| D-005 | Uma chamada de log **por campo alterado**, direto da tela | Um JS que recebe o objeto e grava o lote (padrão `{{linhas}}` do `sgcItensGravar`) | R-089/R-090 fecham a onda 4 em "tudo pela tela, `:VAR_USER`, nenhuma SF JavaScript"; e o fragmento montado na tela é SQL montado na tela (proibido por R-059). O custo é conhecido e pequeno: no pior caso 8 execuções num gesto raro e manual (RNF-002) |
| D-006 | Linha que alcança o item mas tem alvo **0** naquela curva não vale: cai para o nível seguinte | Valer com alvo 0 (teto 0, tudo exige justificativa) ou cair direto no padrão 35 | O `DEFAULT 0` do DDL e a parametrização parcial (só a curva A preenchida) produziriam um teto 0 que barraria todo item da curva. Cair para o nível seguinte é o que a precedência já significa, e é o comportamento de hoje (`cobertura.ts:56` já ignora limite ≤ 0) |
| D-007 | Precedência continua **sku > seção > departamento > fornecedor** | A do legado (Produto > Departamento > BU/seção > Fornecedor) | R-089 é explícita ("precedência continua a do SGC 2"); no legado a seção ficou abaixo do departamento por engano e o nível BU foi desligado em produção (`update-compras-inteligentes-abc-fornecedores.mjs:127`) |
| D-008 | Item sem curva usa a coluna **C** | Usar a curva A, ou o padrão 35 | A curva C é a mais tolerante: um item que nem foi classificado não deve ser tratado como o item mais crítico do pedido. E o padrão 35 ignoraria a parametrização que o alvo tem (R-089) |
| D-009 | A tela passa a decidir permissão por `usePersona()`/`permissoes.verCoberturas` e ganha porteiro de rota | Manter a lista local `PERSONAS_QUE_MANTEM` e a leitura crua de `sgcPersonaAtual` | Hoje `/coberturas` não tem porteiro (qualquer persona chega pelo endereço direto) e refaz a consulta de persona fora do cache — os dois já registrados como A-8 e D-02. Como a tela é reescrita de qualquer modo, corrigir custa três linhas |
| D-010 | O histórico é uma tabela própria com `CAMPO`/`ANTES`/`DEPOIS`, no formato de `SGC_FORNECEDOR_LOG` | JSON `{anterior, novo}` num `DETALHE`, como o legado | Campo a campo é consultável e comparável sem parser; o JSON do legado só serve para a tela dele. O 000 já fixa as colunas (R-090) |
| D-011 | A auditoria é uma **aba** da mesma tela, com recorte opcional por parametrização | Tela própria `/coberturas/auditoria`, ou diálogo por linha | Uma rota a mais para um histórico pequeno, ou uma execução por linha aberta. A aba custa uma execução e só quando aberta (RNF-003) |
| D-012 | Nenhum bloco de card novo (R-050) | Mostrar o alvo/teto por curva dentro do card | O efeito da curva aparece dentro do bloco Itens que já existe (`lib/conteudo-da-fase.ts`), na coluna Cobertura que a 003 já desenha |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `COBERTURA_LIMITE INT` ficar como está | teto 49,5 truncado para 49: a trava barra itens entre 49 e 49,5 dias sem que ninguém entenda por quê | mudança de tipo no `CREATE` (nada publicado ainda), pedido explícito ao integrador no `tasks.md`, e o caso 49,5 está em C-001 e RN-001 |
| A 011 usar `limiteDias` no lugar de `alvoDias` no estoque máximo | compra 20 % maior do que o alvo em toda curva A | o retorno separa os dois campos com nomes diferentes, e C-007 é um teste dedicado a isso; a entrega à 011 está escrita em *Dependências* |
| Parametrização criada com uma curva só | itens das outras curvas caem para o nível seguinte sem ninguém perceber | o formulário exige os três alvos maiores que zero para salvar; D-006 garante que o pior caso é herdar, nunca barrar tudo |
| Log gravado sem a parametrização (ou vice-versa) | histórico mentindo | a guarda de persona é idêntica nas duas escritas e o log resolve o alvo pela chave única: recusa e alvo inexistente casam 0 linhas nos dois (RNF-005, C-011) |
| A régua da 003 e a da 012 divergirem durante a onda | `montarItens` compilando contra a assinatura antiga | a assinatura muda e os dois chamadores mudam **no mesmo commit**; `npm run build` (`tsc -b`) quebra se algum ficar para trás |
| Produto adicionado por busca receber sempre o padrão | teto 35 num item que tinha parametrização de departamento | comportamento **de hoje**: `Itens.tsx:338` chama `itemDeProdutoBuscado(linha, [], …)` com a lista de coberturas vazia. A 012 não piora nem conserta (é uma linha da 003); registrado em *Pedidos ao integrador* |

## Complexity Tracking

Vazio: nenhuma violação de princípio.

## Pedidos ao 000

1. **`SGC_PEDIDO_ITEM.COBERTURA_LIMITE` passa a `DECIMAL(15,2)`** (hoje `INT`), consequência
   direta de R-089 (tolerância percentual produz teto com casas). No `CREATE`, sem `ALTER`.
2. **Ids fixados por este plan:** 012 leitura `sgcCoberturaLogListar` **8201**, escrita
   `sgcEscCoberturaLogInserir` **8250**; `sgcCoberturaListar`/`sgcEscCoberturaGravar`/
   `sgcEscCoberturaExcluir` continuam 7307/7358/7359 no `add-006` (R-096).
3. **`sgcEscCoberturaLogInserir` recebe `nivel` + `codigo`, não `idCobertura`** — resolve o id
   pela chave única dentro da instrução (D-004). O modelo de `SGC_COBERTURA_LOG` do 000 não
   muda.
4. **`CHECK_INPUT` da 012 = uma chave** (`idCobertura: '0'`); `curva` não entra (R-096 listava
   `curva` entre as chaves candidatas da onda 4 — pela 011, não por esta spec).
5. **Registrar que a trava de saída não ganha fragmento SQL novo**: `backend/sql/pendencias-analise.sql`
   e `SQL_SAIDA_VERIFICAR` ficam como estão (D-001).
