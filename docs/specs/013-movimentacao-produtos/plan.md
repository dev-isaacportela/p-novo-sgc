# Plan: Movimentação de produtos

**Spec:** [spec.md](spec.md) · **Data:** 2026-11-03 · **Script:** `backend/add-015-movimentacao.mjs` · **Faixa:** 83xx (leituras 8301–8312, escritas 8350–8351) · **Rota:** `/movimentacao`

## Checagem de princípios (constitution)

| Princípio | Como a feature atende |
|---|---|
| I. Spec antes de código | spec 013 commitada antes do primeiro arquivo de código; as perguntas P-01..P-08 foram respondidas (propostas aprovadas em 2026-11-03) |
| II. Requisitos testáveis | cada C-0NN e RN-0NN tem teste com o id no título (smoke `013-movimentacao.mjs` ou `frontend/tests/movimentacao.test.mjs`) |
| III. Escopo negativo | seção "Fora de escopo" da spec |
| IV. Migrations append-only | `backend/migrations/` intocado; a tabela nova entra no `setup-backend.mjs` (integrador), sem rodar |
| V. Duas camadas | as telas usam só `@/components/page`; nenhum primitivo novo; nada novo em `page.tsx` |
| VI. Tokens | série dos gráficos por `corDeSerie` (rampa de dados); estado por `Status`/`Badge` com texto; zero `style={{}}` |
| VII. Simplicidade | regra pura num arquivo (`lib/movimentacao.ts`); a curva e a régua de cobertura são as de `lib/compras.ts` e `lib/cobertura.ts`, importadas; a venda válida é o fragmento do `add-013`, importado |

## Contexto técnico

Todas as leituras do ERP são SQL Oracle (`sgcWint*`, lista `WINTHOR`) e rodam **também** no
simulador pelo dialeto. Para o mesmo texto valer nos dois lados, o SQL desta spec segue
regras de portabilidade (decisão D-001, abaixo). As duas leituras do banco do projeto e as
duas escritas são MySQL, chamadas direto da tela com `:VAR_USER`.

## Modelo de dados

### `SGC_MOV_PLANO` — nova (DDL_013 no `setup-backend.mjs`, arquivo do integrador)

```sql
CREATE TABLE IF NOT EXISTS SGC_MOV_PLANO (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ORIGEM VARCHAR(20) NOT NULL,          -- 'sem_venda' | 'a_vencer'
  CODPROD INT NOT NULL,
  CODFILIAL VARCHAR(10) NOT NULL,
  DESCRICAO VARCHAR(200),               -- foto do ERP, para a lista não reconsultar
  FATO TEXT, CAUSA TEXT, ACAO TEXT,
  RESPONSAVEL_ID INT NOT NULL DEFAULT 0, -- INT_USER.ID; 0 = sem responsável
  DATA_ACOMPANHAMENTO VARCHAR(10),      -- AAAA-MM-DD ou ''
  STATUS VARCHAR(20) NOT NULL DEFAULT 'aberto', -- 'aberto' | 'em_andamento' | 'concluido'
  CRIADO_POR INT, CRIADO_EM VARCHAR(19),
  ATUALIZADO_POR INT, ATUALIZADO_EM VARCHAR(19),
  UNIQUE KEY UK_SGC_MOV_PLANO (ORIGEM, CODPROD, CODFILIAL),
  INDEX IX_SGC_MOV_PLANO_FILIAL (ORIGEM, CODFILIAL)
)
```

RN-010: a chave única é o "um plano por aba + produto + filial"; o upsert atualiza no lugar.

### WinThor no simulador (`schema-winthor.mjs`, integrador — só DDL)

`PCLOTE` ganha `DTEXCLUSAO VARCHAR(10)`; `PCMOV` ganha `CUSTOREAL DECIMAL(15,4)` e
`CODFORNEC INT` (o rastro do lote). Colunas que o WinThor real já tem.

## Contratos de backend (`add-015-movimentacao.mjs`)

Filtros comuns às leituras do ERP: `codfilial` string (`''` = todas, onde a aba aceita),
`codfornec` int (0 = todos), `codepto` int (0 = todos), `busca` string (`''` = nada),
`incluirPublico` int (0 = venda a órgão público fora, o padrão; 1 = conta — P-08),
`limite` int, `offset` int.

| Id | Nome | Tipo | O que devolve | Parâmetros próprios |
|---|---|---|---|---|
| 8301 | `sgcWintDepartamentos` | SQL Oracle | departamentos (CODEPTO > 0, ≠ 9999), por nome | — |
| 8302 | `sgcWintMovSemVenda` | SQL Oracle | RF-006: produtos ativos com estoque na filial e dias desde a última venda válida ≥ corte, paginados, com `TOTAL_REGISTROS` e `TOTAL_VALOR` | `diasSemVenda`, `somenteComEstoque` (0/1), `janelaDias` (720) |
| 8303 | `sgcWintMovExcedentes` | SQL Oracle | RF-007: produtos com estoque e venda válida no período, com venda, faturamento, consumo, cobertura, sem paginação (a curva é da população, D-006 da 011), teto `{{limite}}` (3.000) e `TOTAL_REGISTROS` para o aviso | `diasPeriodo` |
| 8304 | `sgcWintMovAVencer` | SQL Oracle | RF-008..RF-010: lotes com saldo, bloqueio, quem/quando, divergência, paginados, com os oito totais | `situacao` (`TODOS`/`A_VENCER`/`VENCIDOS`), `diasHorizonte`, `bloqueio` (`TODOS`/`BLOQUEADOS`/`LIVRES`) |
| 8305 | `sgcWintMovRuptura` | SQL Oracle | RF-014: alertas paginados, com os sete totais | `diasJanela`, `diasBase`, `diasTotal` (= janela + base, D-001 c), `limiarPerc`, `fatorMinimo`, `prazoReposicao`, `vendaMinima`, `incluirSemHistorico`, `incluirExcecoes`, `diasCoberturaAlvo` (30), `severidade` |
| 8306 | `sgcWintMovRupturaFiliais` | SQL Oracle | RF-015: o mesmo recorte agrupado por filial (a tela manda `codfilial` e `severidade` vazios) | os da 8305 |
| 8307 | `sgcWintMovPerdas` | SQL Oracle | RF-017: lotes vencidos com saldo, com o rastro e os totais, paginados | `diasJanela` (0 = todo o histórico), `incluirExcecoes` |
| 8308 | `sgcWintMovPerdasFiliais` | SQL Oracle | RF-015: o mesmo recorte agrupado por filial | os da 8307 |
| 8309 | `sgcWintMovLoteHistorico` | SQL Oracle | RF-018: movimentos do lote em todas as filiais, em ordem, com sentido, filial de origem/destino da transferência e `REMESSA` (P-02) | `codprod`, `numlote`, `limite` (300) |
| 8310 | `sgcMovPlanosListar` | SQL MySQL | os planos da aba + filial para os códigos da página (RNF-002) | `origem`, `codfilial`, `codprods` (fragmento de inteiros; `0` = nenhum), `limite`, `offset` |
| 8311 | `sgcMovPlanosResumo` | SQL MySQL | RF-012: `TOTAL`, `VENCIDOS` (acompanhamento < hoje e não concluído) da aba + filial | `origem`, `codfilial`, `hoje` |
| 8350 | `sgcEscMovPlanoSalvar` | SQL MySQL, `:VAR_USER` | RN-010/RN-011: upsert pela chave única, guardado; exige fato, causa ou ação e status da lista | `origem`, `codprod`, `codfilial`, `descricao`, `fato`, `causa`, `acao`, `responsavelId`, `dataAcompanhamento`, `status`, `agora` |
| 8351 | `sgcEscMovPlanoExcluir` | SQL MySQL, `:VAR_USER` | remove pelo id, guardado | `id` |

A guarda é o texto único da 002 (R-013), copiado como em `add-013`/`add-014`, com a lista
`['admin', 'analista', 'gestor', 'diretoria']` (RN-011). Recusa = 0 linhas; a tela relê
(D-03 da onda 1) e diz "não gravou" (C-024).

Filiais e fornecedores do topo: `sgcWintFiliais` e `sgcWintFornecedores` (001). Responsáveis:
`kbUsuariosListar` (lib, limite 100). Parametrização de cobertura: `sgcCoberturaListar` (7307,
situação `ativa`, limite 500).

### A venda válida — importada, não copiada (RN-002)

`add-013-compras-inteligentes.mjs` passa a **exportar** `VENDA_VALIDA`, `PUBLICO` e `REMESSA_FUTURA`
(a única mudança nele; a terceira marca a remessa na linha do tempo do lote). O `add-015` monta `VENDA_MOV = (M.DTCANCEL IS NULL AND ${VENDA_VALIDA} AND ({{incluirPublico}} = 1 OR NOT ${PUBLICO}))`
— `PCMOV M` com `LEFT JOIN PCCLIENT C`, como o fragmento exige. Toda soma de venda, última
venda, curva, janela e base da ruptura e a última venda do lote usam `VENDA_MOV`. O smoke
confere pelo texto da definition que o fragmento é o mesmo objeto (RN-002).

### D-001 — SQL que roda igual no Oracle e no simulador

a. **Paginação** por `ROW_NUMBER() OVER (ORDER BY …) AS RN` numa subconsulta e
   `WHERE RN > {{offset}} AND RN <= {{offset}} + {{limite}}` — nem `OFFSET … FETCH` (o SQLite
   não tem) nem `LIMIT` (o Oracle não tem).
b. **Ordem com nulo sempre por `NVL`**: Oracle e SQLite põem o nulo em pontas opostas.
c. **Aritmética de data** só nas formas que o dialeto traduz: `TRUNC(SYSDATE) ± N` com N
   literal depois do bind (por isso `diasTotal` vem pronto da tela: `TRUNC(SYSDATE) - ({{a}} + {{b}})`
   não é traduzível); dias até hoje por `FLOOR(X.COL - TRUNC(SYSDATE))` (igual a
   `TRUNC(col) - TRUNC(SYSDATE)` no Oracle); diferença entre duas datas por
   `TRUNC(A.COL - B.COL)` com as duas já truncadas numa CTE.
d. **Sem `KEEP (DENSE_RANK …)`** nem `COUNT(DISTINCT) OVER ()`: primeira/última por
   `ROW_NUMBER()` numa CTE e `TOTAL_PRODUTOS` por subconsulta escalar sobre a CTE.
e. **Sem literal `DATE '…'`**: `TO_DATE('2000-01-01', 'YYYY-MM-DD')`.
f. **Filtro desligado**: número `0` (`({{codfornec}} = 0 OR P.CODFORNEC = {{codfornec}})`),
   filial `('{{codfilial}}' IS NULL OR '{{codfilial}}' = '' OR L.CODFILIAL = '{{codfilial}}')`
   (o `''` é nulo no Oracle e não é no SQLite; a disjunção vale nos dois), busca por
   `LIKE '%' || UPPER('{{busca}}') || '%'` (3A-1: nunca `'%{{busca}}%'`).
g. **Divisão** com `1.0 *` no numerador quando os dois lados podem ser inteiros.

### Decisões por consulta

- **Sem venda (8302).** Mesma forma do legado (2830), com `VENDA_MOV` no lugar de
  `CODCLI > 0` (RN-002) e a última entrada com `CODOPER = 'E'` não cancelada.
- **Excedentes (8303).** Estoque disponível e trânsito como a `sgcWintRessuprimento`
  (R-085): `GREATEST(0, QTEST − QTBLOQUEADA − QTINDENIZ − QTRESERV)` e
  `QTPEDIDA + SUM(PCESTTRANSITO.QTTRANSITO)` pré-agregado por produto/filial (C-013, P-03).
  Devolve `FATURAMENTO_PERIODO = Σ QT × PUNIT` da venda válida para a curva (P-04). A
  classificação (curva, régua, excedente, quantidade, valor) é **regra pura**
  (`classificarExcedentes`), com `curvaPorValor` e `limiteDeCobertura` importados.
- **A vencer (8304).** Saldo `PCLOTE.QT` (P-01). `BLOQ_EVENTO` igual ao do legado (último
  log com `QTBLOQUEADA > QTBLOQUEADA_ANT`, matrícula pelo 2.º campo de `OBSAPLICACAO`,
  nome em `PCEMPR`), só exibido com bloqueio hoje (RN-008). Nenhuma coluna de motivo.
- **Ruptura (8305/8306).** O SQL do legado (2943/2944) com: `VENDA_MOV` nas vendas;
  entradas da janela `CODOPER IN ('E','ET')` (P-05); `diasTotal`; `DIAS_CONSUMO_REAL`
  por `TRUNC(B.DT_ULTIMA_VENDA - B.DT_PRIMEIRA_VENDA) + 1`. A CTE comum mora numa função
  (`cteRuptura()`) usada pelas duas definitions — o resumo não pode divergir da lista.
- **Perdas (8307/8308).** O SQL do legado (2883/2884) com `PCLOTE.QT` (P-01), as CTEs
  `ENT`/`TRF` por `ROW_NUMBER` (D-001 d), a última venda do lote por `VENDA_MOV` e a CTE
  comum em `ctePerdas()`.
- **Linha do tempo (8309).** Todos os movimentos do lote; `REMESSA = 1` quando a nota é
  `CONDVENDA = 8` (P-02). A tela rotula "Remessa de entrega futura".

## Regra pura — `frontend/src/lib/movimentacao.ts`

| Função | Regra |
|---|---|
| `ABAS_MOVIMENTACAO`, `abaDaUrl(valor)`, `abaExigeFilial(aba)`, `filialEfetiva(aba, escolhida, filiais)` | C-002, C-003 |
| `paginaLocal(lista, pagina, tamanho)`, `ultimaPagina(total, tamanho)` | RN-020 |
| `tomDiasSemVenda(dias)`, `rotuloDiasSemVenda(dias, janela)` | C-007 (nulo ou ≥ 180 alerta; ≥ 90 atenção) |
| `classificarExcedentes(linhas, coberturas)` → linhas com curva, alvo, teto, origem, cobertura, excedente, quantidade, valor, dias acima; `resumoExcedentes(classificadas)` | RN-004..RN-006, C-011, C-012, C-015 |
| `tomPrazo(dias)`, `rotuloPrazo(dias)` | "Vencido há N dias" / "Vence hoje" / "Vence em N dias"; ≤ 30 alerta, ≤ 90 atenção |
| `rotuloBloqueio(linha)`, `textoResponsavelBloqueio(linha)` | RN-008, C-017 |
| `chavePlano(codprod, codfilial)`, `validarPlano(plano)`, `planoAtrasado(plano, hoje)`, `resultadoDoSalvamento(enviado, relido)`, `STATUS_PLANO` | RN-010, C-021..C-024 |
| `ROTULO_SEVERIDADE`, `tomSeveridade`, `tomCoberturaRitmo(dias, prazo)`, `rotuloDias(d)`, `severidadeDe(valor)` | RN-013, C-029 |
| `parametrosRuptura(escolhas)` (inclui `diasTotal`), `linhasCsvRuptura(linhas, parametros)` | C-026, C-032 |
| `alternarFilial(atual, clicada)` | C-030, C-035 |
| `rotuloOperacao(codoper, sentido, remessa)`, `rotaTransferencia(origem, destino)`, `tomParadoSemVenda` | RN-017, RN-018, C-037 |
| `listaCodprods(linhas)` | o fragmento de `sgcMovPlanosListar`: só inteiros, `0` sem nenhum |

## Superfície de interação

`frontend/src/pages/movimentacao/`:

| Arquivo | Conteúdo |
|---|---|
| `MovimentacaoPage.tsx` | porteiro `verMovimentacao`; cabeçalho; filtros do topo (filial, departamento, fornecedor, venda a órgão público, busca com espera de 500 ms); `Tabs` com a aba no endereço (`?aba=`); cada aba monta o seu efeito |
| `SemVendaTab.tsx` | corte, estoque; KPIs; tabela; botão do plano por linha |
| `ExcedentesTab.tsx` | período, visão; KPIs; aviso de teto; tabela paginada em memória |
| `AVencerTab.tsx` | situação, horizonte, bloqueio; KPIs; tabela com prazo, bloqueio e divergência; plano por produto |
| `RupturaTab.tsx` | os cortes da detecção em "Mais filtros"; KPIs; gráfico por filial; tabela; exportar CSV |
| `PerdasTab.tsx` | janela, universo; KPIs; gráfico por filial; tabela; abre a linha do tempo |
| `PlanoAcaoDialogo.tsx` | o formulário do plano (desabilitado para quem só lê, com o motivo), salvar/remover com releitura |
| `LoteHistoricoDialogo.tsx` | cabeçalho do rastro e a linha do tempo |
| `GraficoFiliais.tsx` | barras por filial com `LabelList` (R-116), `AlternaVisao` gráfico/tabela, clique filtra |

Personas (`lib/permissoes.ts`, integrador): chaves `verMovimentacao` (admin, analista,
gestor, diretoria; atravessa READ_ONLY) e `registrarPlanoAcao` (as mesmas; zera com
READ_ONLY). Menu: grupo **Compras**, "Movimentação de produtos", logo depois de "Compras
inteligentes". Ícone `ArrowLeftRight` no `AdminLayout`. Rota `movimentacao` no `App.tsx`.

## Simulador

`seed/013-movimentacao.mjs` (só INSERT; registrado em `seed.mjs` pelo integrador): produtos
5701–5730 do fornecedor **1088** (o inativo do seed 001 — nenhuma listagem das outras specs
conta produto dele), clientes 9401–9405 (9403 público, 9404 a própria filial 2, `PCFILIAL.CODCLI`
já semeado pela 011 ou aqui), `NUMTRANSITEM` ≥ 985001, `NUMTRANSVENDA` ≥ 985001,
`PCEMPR` 777 "RITA ESTOQUE", datas relativas a hoje. `CHECK_INPUT` ganha só as chaves novas.

## Testes

- `backend/simulator/smoke/013-movimentacao.mjs`: um `teste()` por C-0NN/RN-0NN de
  regra de negócio, contra o seed; e, com `SIMULATOR_WINTHOR=oracle` e as credenciais, um
  bloco que roda as nove `sgcWint*` desta spec no WinThor real (filial e produto achados
  no próprio ERP) e exige contagem > 0 em cada uma. Sem o Oracle, o bloco diz que pulou.
- `frontend/tests/movimentacao.test.mjs`: as funções da tabela acima, um `test()` por
  cenário/regra de tela.

## Dependências entre specs

- 011 (`add-013`): exporta `VENDA_VALIDA`, `PUBLICO` e `REMESSA_FUTURA` — mudança de uma palavra cada.
- 012/003: `sgcCoberturaListar`, `lib/cobertura.ts` (`limiteDeCobertura`), `lib/compras.ts` (`curvaPorValor`).
- 001: `sgcWintFiliais`, `sgcWintFornecedores`.

## Arquivos compartilhados que esta feature toca (para o integrador)

`backend/setup-backend.mjs` (DDL_013), `backend/simulator/schema-winthor.mjs` (3 colunas),
`backend/simulator/config.mjs` (`PUBLISH_ORDER` + `CHECK_INPUT`), `backend/simulator/seed.mjs`
(`seed013`), `backend/simulator/smoke.mjs` (suíte), `backend/package.json` (`publish:015`),
`backend/add-013-compras-inteligentes.mjs` (três `export`), `frontend/src/lib/permissoes.ts`
(duas chaves + item de menu), `frontend/src/components/AdminLayout.tsx` (ícone),
`frontend/src/App.tsx` (rota), `frontend/src/lib/server-functions.ts` (bloco 83xx),
`frontend/tests/permissoes.test.mjs` (se enumerar as chaves).

## Riscos

| Risco | Mitigação |
|---|---|
| Consulta de Perdas pesada no Oracle (movimentos de todos os lotes vencidos) | os lotes distintos da faixa entram primeiro (CTE `LOTES`); o smoke real mede o tempo e o relatório registra |
| Excedentes acima de 3.000 produtos por filial | aviso na tela (RNF-004); `ponytail:` no SQL |
| `codprods` é fragmento | a tela só monta inteiros (`listaCodprods`), como `{{excluir}}` da 011 |

## Complexity Tracking

Nenhuma violação.
