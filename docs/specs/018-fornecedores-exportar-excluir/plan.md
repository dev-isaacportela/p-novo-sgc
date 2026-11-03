# Plan: 018 — Fornecedores: exportar a parametrização e excluí-la com cópia

**Spec:** [`spec.md`](spec.md) · **Data:** 2026-11-03 · **Script:** `backend/add-020-fornecedores-exportar-excluir.mjs` · **Faixa de id local:** 89xx (escritas 8950–8956, JAVASCRIPT 8980) · **Decisões no 000:** R-190..R-191

## Constitution Check

| Princípio | Como a 018 atende |
|---|---|
| I. Spec antes de código | spec com P-01..P-07, cada uma com a proposta implementada, aguardando o usuário |
| II. Requisito testável | cada C-0NN e RN-0NN tem teste com o id no título (`frontend/tests/fornecedores-exportar-excluir.test.mjs`, `backend/simulator/smoke/018-fornecedores-exportar-excluir.mjs`) |
| III. Fora de escopo | seção da spec |
| IV. Migrations | nenhuma tocada; tabela nova em `DDL_018` no fim do array de `setup-backend.mjs`, executado só no sandbox |
| V. Duas camadas | telas montam com o vocabulário de `page.tsx` (`Button`, `Dialog*`, `Alert`); nenhum primitivo novo |
| VI. Tokens | nenhuma cor literal; o botão de excluir é `variant="danger"` do `Button` |
| VII. Simplicidade | nenhuma dependência nova (CSV pelo `lib/csv.ts`, R-094); uma JAVASCRIPT só, de leitura (a exportação em uma ida); as escritas são SQL de uma instrução, chamadas da tela |

## Modelo de dados (`DDL_018` no `setup-backend.mjs`)

| Tabela | Conteúdo |
|---|---|
| `SGC_FORNECEDOR_EXCLUSAO` | `ID`, `FORNECEDOR_ID` (o `SGC_FORNECEDOR.ID` excluído, **único** — uma cópia por parametrização, RN-006), `CODFORNEC`, `FORNECEDOR`, `CNPJ`, `DETALHE` (`MEDIUMTEXT`, JSON com `fornecedor`, `filiais`, `linhas`, `contatos`, `faixas`, `documentos`), `EXCLUIDO_POR`, `EXCLUIDO_EM` (`VARCHAR(19)`); índice por `CODFORNEC` |

Sem FK, como todo o projeto: a cópia sobrevive ao registro que descreve. Uma
tabela só da 001, e não o log genérico do legado (`CI_PARAM_EXCLUSAO_LOG` com
`ORIGEM`): a exclusão com cópia de cobertura (RN-PAR-25) é da 012 e não entra.

## Server functions (`add-020-fornecedores-exportar-excluir.mjs`)

### Exportação (RF-001..RF-004)

| Id | Nome | Tipo | O quê |
|---|---|---|---|
| 8980 | `sgcFornecedorExportar` | JAVASCRIPT (leitura) | `codfornec` (0 = todos), `limite`, `offset`: a página de `SGC_FORNECEDOR` por `FORNECEDOR, CODFORNEC` e, das ids da página, filiais, linhas, contatos, faixas e documentos — seis consultas, uma execução. Devolve `{ fornecedores, filiais, linhas, contatos, faixas, documentos }` (colunas em UPPERCASE, como a `sgcFornecedorCarregar`) |

Sem guarda: leitura, como a `sgcFornecedorCarregar` (a analista exporta; o
comercial não vê o módulo). A tela pede blocos de 100 até vir menos que 100
(RNF-001: 300 fornecedores = 3 execuções).

### Exclusão (RF-005..RF-011) — SQL de uma instrução, chamada da tela

Guarda (`GUARDA`) por `:VAR_USER`, cópia literal da R-013 com as personas da
001 (`admin`, `gestor`, `diretoria`; `READ_ONLY` nunca; sem persona, o
`ACCESS_LEVEL`). Toda exclusão exige também a cópia já guardada (`COPIA`):
`EXISTS (SELECT 1 FROM SGC_FORNECEDOR_EXCLUSAO E WHERE E.FORNECEDOR_ID = …)`.

| Id | Nome | Instrução |
|---|---|---|
| 8950 | `sgcEscFornecedorExclusaoRegistrar` | `INSERT INTO SGC_FORNECEDOR_EXCLUSAO … SELECT F.ID, F.CODFORNEC, F.FORNECEDOR, F.CNPJ, '{{detalhe}}', :VAR_USER, '{{agora}}' FROM SGC_FORNECEDOR F WHERE F.CODFORNEC = {{codfornec}} AND NOT EXISTS (cópia de F.ID) AND GUARDA` |
| 8951 | `sgcEscFornecedorExclusaoContatos` | `DELETE FROM SGC_FORNECEDOR_LINHA_CONTATO WHERE LINHA_ID IN (linhas do fornecedor com cópia) AND GUARDA` |
| 8952 | `sgcEscFornecedorExclusaoFaixas` | idem em `SGC_FORNECEDOR_FAIXA_PRAZO` |
| 8953 | `sgcEscFornecedorExclusaoLinhas` | `DELETE FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID = (id do código) AND COPIA AND GUARDA` |
| 8954 | `sgcEscFornecedorExclusaoFiliais` | idem em `SGC_FORNECEDOR_FILIAL` |
| 8955 | `sgcEscFornecedorExclusaoDocumentos` | idem em `SGC_FORNECEDOR_DOCUMENTO` |
| 8956 | `sgcEscFornecedorExclusaoFornecedor` | `DELETE FROM SGC_FORNECEDOR WHERE CODFORNEC = {{codfornec}} AND EXISTS (cópia de SGC_FORNECEDOR.ID) AND GUARDA` — correlação com a tabela de fora, não subconsulta sobre ela (o MySQL recusa `DELETE` com subconsulta na própria tabela, erro 1093) |

- **Por que da tela e não uma JAVASCRIPT que orquestra** (como a
  `sgcFornecedorSalvar`): a regra do CLAUDE.md ("escrita de usuário só por SF
  SQL guardada por `:VAR_USER`, chamada direto da tela") e o padrão da exclusão
  da 014. Chamada aninhada não propaga `:VAR_USER` (D-005 da 001), e a guarda
  por `{{usuarioId}}` aceitaria um id forjado vindo da tela.
- **A cópia vem da tela** (`{{detalhe}}`), relida com `sgcFornecedorCarregar`
  logo antes de guardar (o que está gravado, não o formulário), menos o histórico
  (P-04: ele fica na própria tabela). Identidade (`FORNECEDOR_ID`, código, nome,
  CNPJ), quem e quando são do servidor. `ponytail:` montar o JSON em SQL
  divergiria entre MySQL e o SQLite do simulador (`JSON_ARRAYAGG` ×
  `json_group_array`); se a cópia precisar ser à prova de quem tem permissão de
  excluir, o caminho é uma JAVASCRIPT de leitura que devolve a cópia assinada,
  ou a montagem em SQL só na plataforma.
- **Uma cópia por parametrização** (`UNIQUE (FORNECEDOR_ID)` + `NOT EXISTS`):
  repetir a sequência depois de uma interrupção (C-008) não regrava a cópia com
  a parametrização já pela metade.
- **Ordem** (RF-008, dependência por FK lógica): cópia → contatos → faixas
  (ambos pela linha) → linhas → filiais → documentos → fornecedor. O histórico
  (`SGC_FORNECEDOR_LOG`) não é apagado (P-04).
- **Confirmação** (RF-010, RN-PAR-08 "relê para confirmar"): depois da última
  escrita a tela chama `sgcFornecedorCarregar`; `fornecedor: null` é sucesso,
  qualquer outra coisa é "não foi excluída" (a guarda recusa sem erro: a
  escrita só não afeta linha).

Total por exclusão: 1 releitura + 1 cópia + 6 exclusões + 1 releitura = 9 (RNF-002).

## Regra pura (`frontend/src/lib/fornecedor-planilha.ts`)

- `linhasPlanilha(dados)` → `(string | number)[][]`: os blocos da RN-002, na
  ordem de `dados.fornecedores`, com as regras da RN-003 (`Padrão do sistema
  (1)`/`(5)` para SLA 0, `sem teto` para `VALOR_ATE = 0`, `valorBr` para R$,
  `fmtData`/`fmtDataHora` para datas, `Sem dados` em seção vazia). Vazio para
  zero fornecedores (C-004).
- `textoPlanilha(dados)` → texto pelo `textoCsv` do `lib/csv.ts` (primeira linha
  como cabeçalho; linhas de largura diferente são aceitas pelo CSV).
- `nomeArquivoPlanilha(hoje, codfornec?)` → `parametrizacoes-fornecedores-AAAA-MM-DD.csv`
  ou `parametrizacao-fornecedor-1015-AAAA-MM-DD.csv`.
- `juntarPaginas(paginas)` → concatena as páginas da `sgcFornecedorExportar`.
- `copiaParaExclusao(dados)` → o objeto da cópia: a resposta da
  `sgcFornecedorCarregar` sem `log`.
- `ESCRITAS_EXCLUSAO` → as 7 chaves, na ordem acima; `AVISO_EXCLUSAO` → o texto
  da confirmação (C-010).

## Telas

- **`FornecedoresPage`** — botão **Exportar planilha** (`Download`) ao lado de
  "Parametrizar fornecedor", `variant` secundário; enquanto exporta, "Exportando…"
  desabilitado. C-004 vira `Alert tone="info"` no topo; erro, `Alert tone="error"`.
- **`FornecedorPage`** — no cabeçalho, **Exportar** (sempre, menos para
  fornecedor ainda não parametrizado) e **Excluir parametrização**
  (`variant="danger"`, só com parametrização gravada; desabilitado com o
  `title` do motivo quando `!permissoes.editarFornecedor`). A confirmação é um
  `Dialog` com o `AVISO_EXCLUSAO`, "Voltar" e "Excluir parametrização"
  (destrutivo), como o cancelamento da agenda. Sucesso: `Alert tone="success"`
  "Parametrização excluída. Uma cópia ficou guardada." e a tela recarrega no
  estado "sem parametrização" (como o legado). A orquestração fica num arquivo
  próprio da tela (`exportar-excluir.ts`), para o `FornecedorPage` não passar
  das 800 linhas e não misturar regra com JSX.

## Testes

| Cenário / regra | Arquivo | O que o assert verifica |
|---|---|---|
| C-001, C-002, RNF-001 | `smoke/018-…mjs` | total da exportação = `sgcFornecedorListarTotal` sem filtro; ordem por nome; inativo presente; filhas do 1015 = `sgcFornecedorCarregar`; páginas de 2 sem repetição; `codfornec` filtra |
| C-005, RN-004, RN-008 | `smoke/018-…mjs` | gestor exclui o 1099 parametrizado no teste: carregar `null`, zero filhas, cópia com código, nome, CNPJ, `EXCLUIDO_POR` e o conteúdo; log intacto; 1015 intacto; `PCFORNEC` intacto |
| C-006, RN-005 | `smoke/018-…mjs` + `tests/…` | analista e somente leitura: nenhuma cópia, nada apagado; `permissoesDe` |
| C-007, RN-006 | `smoke/018-…mjs` | exclusões sem cópia não apagam nada |
| C-008 | `smoke/018-…mjs` | cópia + filiais, depois a sequência inteira: 1 cópia, com a filial |
| C-009 | `smoke/018-…mjs` | salvar de novo funciona, só o novo aparece; segunda exclusão → 2 cópias |
| C-010, RN-007 | `smoke/018-…mjs` + `tests/…` | pedido (`SGC_PEDIDO`) e agendamento (`SGC_AGENDA`) do 1099 continuam; `AVISO_EXCLUSAO` cita os quatro termos |
| C-002, C-003, C-004, RN-002, RN-003, RF-010 | `tests/fornecedores-exportar-excluir.test.mjs` | `linhasPlanilha`, `nomeArquivoPlanilha`, `juntarPaginas`, `copiaParaExclusao`, `ESCRITAS_EXCLUSAO` |

## Complexity Tracking

| Desvio | Por quê | Alternativa mais simples rejeitada |
|---|---|---|
| Arquivos compartilhados tocados: `setup-backend.mjs` (`DDL_018`), `simulator/config.mjs` (`PUBLISH_ORDER`), `simulator/smoke.mjs`, `server-functions.ts` (bloco 89xx) | o padrão de toda feature; o integrador resolve a ordem no merge | — |
