# Plan: Extrato do pedido

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; cenários vindos de O3-05 e das decisões R-060, R-061, R-068, R-077, R-078 do 000 |
| Backend escrito local, executado no sandbox | não | R-051: a 010 **não tem script nem SF**. Lê `sgcPedidoCarregar` (002/003, id 7205) e `sgcNfListar` (005, id 7507), já publicadas; nada roda do `mitra-sdk` daqui |
| Migrations append-only | não | nenhuma tabela, nenhuma coluna nova; `backend/migrations/` intocado |
| Leitura e escrita por Server Function | sim | as duas leituras usam `acao()` de `src/lib/mitra-api.ts`, como o resto da tela; nenhuma escrita |
| Simulador cobre a feature | não | R-062: a 010 não semeia nada; os testes de frontend montam pedido/itens/notas à mão (regra pura), sem depender do simulador |
| Testes automatizados obrigatórios | sim | cada linha da seção **Testes** da spec vira um `test()` em `frontend/tests/extrato.test.mjs`; `npm test` verde em `frontend/` |
| Design tokens, sem cor literal | ver **Complexity Tracking** | a tela (botões, aviso de pop-up) usa `Button`/`Alert` de `page.tsx`, tokens normais; o **documento impresso** é a exceção documentada abaixo, declarada em R-078 |
| Simplicidade | sim | nenhuma dependência nova; reaproveita `itemDeLinha`/`totalDoPedido` (003), `compararPrazo` (003), `moeda`/`fmtData` (base), `textoCsv`/`baixarCsv` (R-037) — ver **Contexto técnico** |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · `mitra-interactions-sdk` — nada de novo
- **Backend:** nenhum nesta spec (R-051)
- **Reuso identificado:**
  - `frontend/src/lib/pedido.ts` (002) — `PedidoCapa`, o formato de `sgcPedidoCarregar`
  - `frontend/src/lib/compras.ts` (003) — `ItemPedido`, `itemDeLinha(linha)`, `totalDoPedido(itens)`
  - `frontend/src/lib/prazo-pagamento.ts` (003) — `compararPrazo(padrao, acordado)` (RN-005)
  - `frontend/src/lib/formato.ts` — `moeda`, `fmtData`
  - `frontend/src/lib/csv.ts` (R-037) — `textoCsv(cabecalho, linhas)`, `baixarCsv(nome, texto)`
  - `frontend/src/lib/transicoes.ts` (002) — tipo `ChaveFase`
  - `frontend/src/components/page.tsx` — `Button`, `Alert`
  - `frontend/src/pages/quadros/AcoesDoPedido.tsx` (002) — é o arquivo que ganha os dois botões; `fases: MapaDeFases` e `ctx: ExtensaoContexto` já chegam nele
- **Dependência nova:** nenhuma

## Modelo de dados

Nenhuma tabela nova, nenhuma coluna nova (R-051). O extrato **lê** o que já existe, sem
inventar coluna — conferido linha a linha no código das SFs (`backend/add-005-quadro-compras.mjs`,
`backend/add-008-notas-fiscais.mjs`) e no `CREATE TABLE` de `backend/setup-backend.mjs`:

| Fonte (SF já publicada) | Tabela por trás | Colunas que o extrato usa |
|---|---|---|
| `sgcPedidoCarregar` (002/003) → `pedido` | `SGC_PEDIDO` (`P.*`, mais `TEC_NOME`/`DIR_NOME`/`CANC_NOME`/`ENVIO_NOME`/`CRIADOR_NOME` de `INT_USER`) | `ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`, `PERIODO_INICIO`, `PERIODO_FIM`, `VL_TOTAL`, `PRAZO_PADRAO`, `PRAZO_ACORDADO`, `PRAZO_JUSTIFICATIVA`, `TEC_POR`, `TEC_EM`, `TEC_MOTIVO`, `TEC_NOME`, `DIR_POR`, `DIR_EM`, `DIR_MOTIVO`, `DIR_NOME`, `DT_ENVIO`, `NUMPED_WINTHOR`, `CANC_POR`, `CANC_EM`, `CANC_MOTIVO`, `CANC_NOME`, `CRIADO_POR`, `CRIADOR_NOME` |
| `sgcPedidoCarregar` (002/003) → `itens` | `SGC_PEDIDO_ITEM` (subconjunto fechado com a 003) | `CODPROD`, `DESCRICAO`, `EMBALAGEM`, `QT_PEDIDA`, `PRECO_CUSTO` |
| `sgcNfListar` (005) → `nfs` | `SGC_NF` (`SELECT *`) | `NUMNOTA`, `SERIE`, `DT_EMISSAO`, `VL_TOTAL` |

`sgcNfListar` também devolve `sugestoes`, `itens` (itens de **nota**, não do pedido),
`ocorrencias`, `contatos`, `itensPedido` e um segundo `pedido` — o extrato ignora os seis:
o pedido e os itens do pedido já vêm completos de `sgcPedidoCarregar`, e as conferências/
sugestões/contatos são fora de escopo (spec, seção "Fora de escopo").

### Pedidos ao 000

Nenhum em aberto. O único que esta spec levantou — `CRIADOR_NOME` ausente em
`sgcPedidoCarregar` (RF-010 pede "quem criou o pedido" no cabeçalho; a SF já junta nome para
`TEC_POR`, `DIR_POR`, `CANC_POR` e `ENVIO_POR`, mas não para `CRIADO_POR`) — foi resolvido na
revisão cruzada da S1: **R-068** manda a base (S2) acrescentar `LEFT JOIN INT_USER` e
`CRIADOR_NOME` ao `SELECT` de `sgcPedidoCarregar` (mesmo padrão dos outros quatro joins),
sem execução a mais. O campo continua **opcional** em `PedidoParaExtrato` — chega vazio até
a base publicar essa mudança — e o documento mostra "—" no lugar do criador enquanto isso
(RF-010: "a ausência de um dado não impede o resto do documento"); depois de R-068 publicada,
o teste do cabeçalho (C-012, ver **Testes**) passa a esperar o nome preenchido.

## Contratos de backend

Nenhum. R-051: a 010 não tem script (`add-*.mjs`) nem Server Function própria. As duas
únicas chamadas que o extrato faz são a `sgcPedidoCarregar` e a `sgcNfListar` já existentes,
com o mesmo `input: { cardId }` que as outras telas já usam — nada de novo em
`frontend/src/lib/server-functions.ts`.

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| Pedido aberto (`/quadro`, dentro de `AcoesDoPedido`) | Botões "Extrato (PDF)" e "Extrato (CSV)", em qualquer fase, para quem abre o quadro | `Button`, `Alert` (`page.tsx`) | dois itens na lista `acoes` já existente; estado `avisoPopup`; handlers `extratoPdf`/`extratoCsv` |

Não há rota nova, não há tela nova: o extrato é uma ação do pedido já aberto, como
"Cancelar compra" ou "Registrar envio" — mesmo padrão de botão, mesmo componente.

## Fluxo

1. A pessoa abre um pedido no quadro (qualquer fase) e clica em "Extrato (PDF)" ou "Extrato
   (CSV)", dentro de `AcoesDoPedido`.
2. **PDF:** o clique abre a janela de impressão **antes** de qualquer chamada assíncrona
   (com um texto de carregando) — ver Decisão D-005. Se `window.open` devolver `null`
   (pop-up bloqueado), o componente mostra o `Alert` de aviso e para aqui (RF-011).
3. O componente busca os dados de novo, direto do servidor — não reaproveita a capa que a
   página já carregou, porque ela pode estar `null` ou desatualizada (Decisão D-004):
   `acao('sgcPedidoCarregar', { cardId })` e `acao('sgcNfListar', { cardId })`, em paralelo.
4. `montarExtrato(pedido, itens, fase, nfs, agora)` (`lib/extrato.ts`) — pura — devolve o
   modelo: cabeçalho, marca, assinaturas, prazo, itens filtrados, total, decisões,
   faturamento, nome do arquivo.
5. **PDF:** `extratoHtml(modelo)` (`pages/quadros/extrato-html.ts`) monta o HTML completo
   (com a logo embutida) e substitui o conteúdo da janela já aberta; o `<script>` do próprio
   documento chama `window.print()` ao carregar, como no documento de referência do sistema
   anterior.
   **CSV:** `linhasCsvExtrato(modelo)` (`lib/extrato.ts`) devolve cabeçalho e linhas;
   `textoCsv` (R-037) monta o texto e `baixarCsv` dispara o download.
6. Nada é gravado, nada é recarregado: gerar o extrato não muda o pedido.

## Simulador

Não se aplica. R-051/R-062: a 010 não tem script, não semeia linha nenhuma e não entra no
`sim:check`/`sim:smoke` — os testes desta spec são só de frontend, com pedido, itens e notas
montados à mão dentro do próprio teste (o mesmo padrão de `frontend/tests/faturamento.test.mjs`
e `frontend/tests/nf.test.mjs`, que também não dependem do simulador).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 / RN-002 | `frontend/tests/extrato.test.mjs` | pedido sem `CANC_MOTIVO`, fase `'tecnica'`: `montarExtrato(...).marca === 'nao_aprovado'` e `.assinaturas === true` |
| C-002 / RN-001 | `frontend/tests/extrato.test.mjs` | pedido com `TEC_EM`/`TEC_POR` preenchidos (aprovação técnica anterior), fase `'analise'`: `.marca === 'nao_aprovado'` — a data antiga não muda o resultado |
| C-003 / RN-003 | `frontend/tests/extrato.test.mjs` | pedido com `CANC_MOTIVO`, fase `'cancelado'`: `.marca === 'cancelado'`, `.assinaturas === false`, o motivo aparece em `.decisoes` |
| C-004 / RN-004 | `frontend/tests/extrato.test.mjs` | as seis fases fora do grupo de decisão e do cancelamento (`envio`, `enviado`, `transito`, `faturamento`, `bo`, `concluido`): `.marca === null` e `.assinaturas === false` nas seis |
| C-005 / RN-005 | `frontend/tests/extrato.test.mjs` | `PRAZO_PADRAO`/`PRAZO_ACORDADO` iguais: `.prazo.exigeJustificativa === false` |
| C-006 / RN-005 | `frontend/tests/extrato.test.mjs` | prazos divergentes com `PRAZO_JUSTIFICATIVA` preenchida: `.prazo.justificativa` é o texto gravado |
| C-007 / RN-005 | `frontend/tests/extrato.test.mjs` | prazos divergentes com `PRAZO_JUSTIFICATIVA` vazia: `.prazo.exigeJustificativa === true` e `.prazo.justificativa === ''` (a tela decide o texto de "pendente", não o modelo) |
| C-008 / RN-006 | `frontend/tests/extrato.test.mjs` | itens `[{QT_PEDIDA:0}, {QT_PEDIDA:5}]`: `.itens.length === 1`, sobra o de quantidade 5 |
| C-009 / RN-007 | `frontend/tests/extrato.test.mjs` | `VL_TOTAL` do pedido diferente da soma dos itens do teste: `.totalPedido` é igual a `VL_TOTAL`, não à soma |
| C-010 / RN-008 | `frontend/tests/extrato.test.mjs` | `nfs` com 1 linha: `.faturamento.temNota === true`, `.faturamento.notas.length === 1` |
| C-011 / RN-008 | `frontend/tests/extrato.test.mjs` | `nfs` vazio: `.faturamento.temNota === false` |
| C-012 / RN-009 | `frontend/tests/extrato.test.mjs` | `DT_ENVIO`/`NUMPED_WINTHOR` preenchidos: `.numeroWinthor` é o número; sem `DT_ENVIO`: `.numeroWinthor === ''`; `CRIADOR_NOME` preenchido (R-068): `.criador` é o nome; `CRIADOR_NOME` ausente (antes de R-068 publicada): `.criador === ''`, sem quebrar o resto do modelo |
| C-013 / RN-013 | `frontend/tests/extrato.test.mjs` | `popupFoiBloqueado(null) === true`; `popupFoiBloqueado({} as Window) === false` |
| C-014 / RN-012 | `frontend/tests/extrato.test.mjs` | `linhasCsvExtrato(modelo).linhas` tem o mesmo tamanho e os mesmos valores de `.itens`, na mesma ordem |
| C-015 / RN-010 | `frontend/tests/extrato.test.mjs` | `ID_CARD: 4321` → `.nomeArquivo === 'extrato-pedido-4321'` |
| C-016 / RN-011 | `frontend/tests/extrato.test.mjs` | `montarExtrato(..., agora: new Date(2026, 8, 15, 14, 5))` → `.geradoEm` contém `'15/09/2026'` e `'14:05'` |
| C-017 | `frontend/tests/permissoes.test.mjs` (002, já existe) | nenhuma linha nova — `permissoesDe(...).verQuadro` já é `true`/`false` por persona; o extrato usa essa mesma chave |

- **Frontend:** `node --test` sobre `frontend/src/lib/extrato.ts` — função pura, sem SDK e
  sem React, como o resto de `src/lib/`. Nenhum teste sobre `AcoesDoPedido.tsx` em si (é
  tela): os cenários C-001/C-003/C-013/C-017 que dependem de olhar a tela de verdade vão
  para a Verificação manual da spec.
- **Backend:** nenhum arquivo em `backend/simulator/smoke/` — não há SF nova para testar.
- **Seed extra para o smoke:** nenhum (R-051, R-062).

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | `CRIADOR_NOME` resolvido por **R-068** (000, revisão cruzada da S1): a base (S2) acrescenta o join em `sgcPedidoCarregar`, não uma SF nova desta spec. Continua opcional em `PedidoParaExtrato` até a base publicar | Criar uma SF só para buscar o nome do criador | R-051 já orientava nesse sentido (a 010 só ganha SF própria se provar necessidade); um `LEFT JOIN` a mais numa SF que já existe é mudança menor e é de quem já é dono do arquivo (002) — a revisão cruzada fechou isso como R-068 |
| D-002 | `lib/extrato.ts` define o próprio tipo de entrada (`PedidoParaExtrato = PedidoCapa & {...}`, por interseção) em vez de estender `PedidoCapa` em `lib/pedido.ts` | Adicionar os campos de faturamento (`VL_FATURADO`, `PERC_FATURADO_VALOR`…) direto em `PedidoCapa` | `lib/pedido.ts` é arquivo da 002; a 010 não precisa editar arquivo de outra spec para ler um campo que a SF já devolve (`P.*`) — alteração mínima |
| D-003 | O total do extrato é `pedido.VL_TOTAL` (o mesmo que a capa do quadro mostra), não uma soma recalculada dos itens | Somar `qtPedida × precoCusto` dos itens do extrato (`totalDoPedido`, já existe em `lib/compras.ts`) | `VL_TOTAL` é recalculado ao sair da Análise (AN-12) e é o número que a pessoa já vê no cartão; somar nos itens do extrato podia divergir por um instante (item editado e não salvo) e a pessoa não teria como saber qual dos dois confiar |
| D-004 | Cada clique busca os dados de novo (`sgcPedidoCarregar` + `sgcNfListar`), sem reaproveitar a prop `pedido` que `QuadroPage` já carregou | Usar a `pedido: PedidoCapa \| null` que `AcoesDoPedido` já recebe | Essa prop pode estar `null` (ainda carregando) ou de outro card por uma fração de segundo (troca de card); RF-001 exige o extrato "em qualquer fase", inclusive no instante em que a capa ainda não chegou — buscar de novo é a única forma de garantir isso sem acoplar o botão ao timing de outro componente. **R-077** (000, revisão cruzada da S1) formaliza o custo: 2 execuções por clique, relidas sempre — "sem SF nova" não é "sem execução", e cabe no teto de 300/min |
| D-005 | A janela de impressão abre **antes** do `await` das duas SFs (com um texto de carregando), e o conteúdo é substituído quando os dados chegam | Buscar os dados primeiro e só then abrir a janela | Vários navegadores só tratam `window.open` como ação direta da pessoa quando ele roda **dentro** do clique, sem `await` no meio; abrir depois do fetch arrisca bloqueio silencioso mesmo com o clique real — o que RF-011/C-013 pede para não acontecer |
| D-006 | O clique do extrato usa um wrapper de execução próprio (trava o botão, mostra erro), sem chamar `recarregarPedido()` no final | Reusar o `executar()` que as outras ações de `AcoesDoPedido` já têm | Gerar o extrato não muda nenhum dado do pedido; `executar()` sempre recarrega a capa ao final, e isso seria uma SF a mais sem motivo |
| D-007 | A logo entra em `extrato-html.ts` por `import logoBenenutri from '@/assets/logo-benenutri.png?inline'` — o sufixo `?inline` do Vite força o módulo a resolver para uma `data:` URI (base64), **independente do tamanho do arquivo** | Reusar o import comum que `components/Logo.tsx` já faz (`import logoBenenutri from '@/assets/logo-benenutri.png'`, sem sufixo) | Sem `?inline`, o Vite só embute como `data:` URI quando o arquivo fica abaixo do `assetsInlineLimit` padrão (4096 bytes) — hoje o arquivo tem 2.438 bytes e embutiria de qualquer jeito, mas um logo maior no futuro viraria silenciosamente uma URL de arquivo, que não existe dentro da janela `about:blank` do extrato (ela não tem base URL — a mesma razão que o sistema anterior documentava em `lib/brand.ts`). O sufixo blinda contra isso sem duplicar o arquivo de imagem nem acoplar `extrato-html.ts` a `components/Logo.tsx` |
| D-008 | Reaproveita `itemDeLinha`/`totalDoPedido` (`lib/compras.ts`, 003), `compararPrazo` (`lib/prazo-pagamento.ts`, 003), `moeda`/`fmtData` (`lib/formato.ts`) e `textoCsv`/`baixarCsv` (`lib/csv.ts`) | Reimplementar formatação e cálculo dentro de `lib/extrato.ts` | Simplicidade (princípio VII): as quatro já são testadas, já são a fonte única da regra (R-015 no caso do prazo), e duplicar quebraria se uma delas mudasse |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Bloqueio de pop-up pelo navegador | a pessoa não recebe o PDF e pode achar que o botão não funciona | `Alert` dedicado (RF-011) + janela aberta antes do fetch assíncrono (D-005) reduz a chance real de bloqueio |
| `CRIADOR_NOME` só existe depois que a base (S2) publicar **R-068** | até lá, o cabeçalho mostra "—" no lugar do criador | campo tratado como opcional no modelo (RF-010 já prevê "ausência não impede o resto do documento"); nada quebra, só falta um dado até a base publicar |
| Documento impresso foge do sistema de tokens (cor fixa, sempre claro) | pode parecer inconsistência numa revisão de design que não souber do motivo | documentado no Complexity Tracking abaixo; é regra de negócio (R-060), não escolha de estilo |

## Complexity Tracking

| Princípio violado | Por que é necessário | Por que a alternativa simples não serve |
|---|---|---|
| VI — Design tokens, nunca cor literal | O documento impresso (`extrato-html.ts`) usa cores fixas (`#fff`, `#111`, cinzas) em vez dos tokens de `index.css`, e é **sempre claro**, independente do tema ativo na tela (R-060: "o documento impresso é sempre claro e monocromático, independente do tema da tela"; **R-078**, revisão cruzada da S1, declara esta exceção formalmente — "não vale para a tela: botões e `Alert` seguem os tokens", o que este plan já respeita em `AcoesDoPedido.tsx`) | O documento é escrito com `document.write` numa janela `about:blank`, que não carrega o CSS do app — não há `:root`/`.dark` para herdar. Ele também precisa imprimir igual em impressora preto e branco e ser arquivado como um documento estável (nunca "no tema escuro de quem imprimiu"). Importar as folhas de estilo do app para depois anular o dark mode dentro delas seria mais código para o mesmo resultado, e ainda arriscaria puxar tema por engano numa atualização futura do `index.css` |
