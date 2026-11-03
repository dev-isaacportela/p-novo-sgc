# O card do pedido depois da Análise — legado × SGC 2

Levantamento feito antes de codar (R-150). Para cada fase depois da
Análise: o que o SGC legado (`/opt/p-60523-ref`, só leitura) mostra **de cima
para baixo** dentro do card, o que o SGC 2 mostra hoje e as lacunas.

- Legado: `frontend/src/pages/PipeWorkspace.tsx` (abreviado `PW`) e os painéis
  de `frontend/src/features/kanban/` (`EnvioIndustriaPanel`, `NfTransitoPanel`,
  `NfAutomacaoPanels`, `BoFasePanel`). Regras: `docs/regras-de-negocio/01`, `10`,
  `11`, `12` e `13`.
- SGC 2: o mapa fase → blocos de `frontend/src/lib/conteudo-da-fase.ts` e os
  blocos de `frontend/src/pages/quadros/abas/` (aba "Nesta fase" da lib); as
  decisões na coluna da direita (`AcoesDoPedido.tsx`).
- A fase **Análise** é de outra sessão e não entra aqui.

Lacuna: **sim** = o SGC 2 não mostra; **parcial** = mostra, mas fora do molde
do legado (lugar, forma ou só parte do dado); **não** = já está.

## O que vale para todas as fases

O legado abre o card com três colunas: resumo à esquerda, trabalho da fase no
meio, movimentos à direita (`PW:8596`). O resumo do pedido aparece em toda
fase (`PW:8603-8720`):

| # | Legado (de cima para baixo) | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | Fornecedor, filial, valor total (vira **Valor aceito** em Concluído, com o original embaixo quando há B.O.) e **% faturado** com barra (`PW:8605-8646`) | Fornecedor, filial e valor total como campos do formulário inicial, à esquerda; % faturado só no bloco Notas fiscais | parcial |
| 2 | Período analisado; data planejada de envio × data atualizada (`PW:8647-8659`) | Prazo do card à esquerda; período não aparece depois da Análise | parcial |
| 3 | Pagamento padrão × acordado com a diferença de prazo; recebimento acordado e médio (`PW:8660-8693`) | Só no bloco de prazo da Análise | sim |
| 4 | Selos: **aprovação técnica por/em**, **aprovação da diretoria por/em**, reprovação ativa, **compra cancelada** com motivo, por quem e quando (`PW:8694-8720`) | Nada no card; o histórico tem as notas (`kbNotaRegistrar`) | sim |

## Aprovação Técnica e Aprovação da Diretoria

| # | Legado | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | Faixa "Aprovar / Reprovar" no topo, só para quem decide (`PW:9952-9990`); reprovação com motivo e produtos (`PW:9992-10210`) | Botões na coluna da direita (`AcoesDoPedido.tsx:207-225`) com `DialogoMotivo` | não (outro lugar, mesma ação) |
| 2 | **Análise para aprovação**: total do pedido e a faixa de decisão com 4 números atual → após aprovação — compras do mês, saldo de compras sobre a meta, compras × vendas, cobertura média (`PW:10215-10250`, cálculo em `PW:7007-7249`) | Não existe | sim — **compras do mês, saldo e compras × vendas dependem de meta de compras e venda projetada que o SGC 2 não tem (pergunta P-1)**; cobertura média sai dos itens |
| 3 | Preço especial: valor e % do pedido; economia sobre o custo padrão (`PW:10251-10266`) | Tipo de preço por item, dentro de Itens | parcial — a economia precisa do custo padrão do item, que o pedido não guarda |
| 4 | Indicadores do pedido, recolhido: total de itens, do comercial, dentro/acima/abaixo da sugestão, ruptura, cobertura > 60 d, a vencer em 90 d, sem venda em 45 d (`PW:10268-10316`, `PW:7230-7241`) | Não existe | sim |
| 5 | Histórico consolidado compra × venda do fornecedor, recolhido (`PW:10318-10345`) | Não existe | sim — mesma dependência da P-1 |
| 6 | Itens do pedido só leitura: produto/observação, qtd, custo, total, origem (Comercial/Sugestão), Excel/PDF/Ampliar (`PW:10349-10429`) | Bloco Itens em leitura (`abas/Itens.tsx`, da sessão da Análise) | não |

## Envio para Indústria

| # | Legado (`EnvioIndustriaPanel.tsx`, chamado em `PW:10642-10755`) | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | **Resumo do pedido**: nº de produtos, valor total, **Copiar itens** (sem a marca Comercial) e **Arquivo WinThor** (`código;preço;quantidade`) (`EnvioIndustriaPanel.tsx:121-155`, RN-KAN-50) | Não existe | sim |
| 2 | Dados do pedido: nº no sistema e data de envio, obrigatórios (`:157-192`) | No `DialogoEnvio` (botão "Registrar envio" à direita) | não (diálogo) |
| 3 | Canal: plataforma (link do fornecedor) ou e-mail (contatos cadastrados), observação, prévia do e-mail com cópia (`:194-414`) | No `DialogoEnvio` | não (diálogo) |
| 4 | Tabela dos itens que vão ao fornecedor: produto, emb., qtd, custo, total (`:416-468`) | Bloco Itens da Análise, com colunas de análise | parcial |
| 5 | Botão "Confirmar envio" no fim do painel (`:470-482`) | "Registrar envio" só na coluna da direita | parcial |

## Enviado para Indústria

| # | Legado (`PW:10758-10909`) | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | **Pedido enviado**: data, método (e-mail/plataforma), e-mail da indústria, observações (`PW:10761-10811`) | Não existe | sim |
| 2 | Itens do pedido: produto, emb., qtd, custo, total, rodapé com totais, Copiar itens (`PW:10813-10886`) | Não existe | sim |
| 3 | **Próximo movimento: Em Trânsito para BN** — "N NF(s) vinculada(s)" ou "Vincule a NF para liberar" (`PW:10888-10905`, RN-KAN-51) | O motor desabilita o destino com o motivo; nada no conteúdo | sim |
| 4 | NFs identificadas no WinThor, contatos de faturamento, validação da NF (`PW:11232-11262`) | Bloco Notas fiscais (sugestões, notas, conferências, contatos) e Recebimento | parcial — tabelas largas no card estreito |

## Em Trânsito para BN

| # | Legado (`PW:10911-11229`) | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | **Acompanhamento de faturamento**: enviado em, contador de dias úteis desde o envio (`PW:10935-10953`) | Linha de texto no cabeçalho de Notas fiscais | parcial |
| 2 | Selos: FATURAMENTO PENDENTE — Nd úteis — contatar a indústria (≥ 3) / gestão notificada (≥ 5); aguardando faturamento; último contato; gestor notificado (`PW:10955-10982`, RN-NF-36) | O cron grava `ALERTA_FATURAMENTO_NIVEL`; a capa do quadro mostra a frase; o card não | sim |
| 3 | Fornecedor, filial, e-mail da indústria (`PW:10984-11001`) | Formulário à esquerda | parcial |
| 4 | **Notificar gestor** (≥ 5 d.u.): escolhe um gestor, vira responsável do card e alerta `GESTOR_FATURAMENTO` (`PW:11003-11116`) | Não existe | sim — **ação nova de fluxo (pergunta P-3)** |
| 5 | Alertas de faturamento ativos, até 5 (`PW:11118-11139`) | Bloco Alertas só na Análise e aprovações | sim |
| 6 | NFs do pedido com recebimento: NF, faturamento, prazo, previsão, recebimento, situação; "Verificar entrada no WinThor" (`NfTransitoPanel.tsx:98-200`) | Bloco Recebimento (mesmo dado) em tabela de 7 colunas | parcial — tabela larga |
| 7 | Itens do pedido: produto, qtd, situação, total (`PW:11155-11212`) | Não existe | sim |
| 8 | Botão **"Produto faturado — ir para Faturamento"** (`PW:11214-11226`) | O servidor move sozinho quando todas as NFs entram (`sgcRecebimentoSincronizar`); a coluna da direita também move | parcial — **atalho manual é fluxo (pergunta P-4)** |

## Faturamento em Andamento

| # | Legado (`PW:11266-12445`) | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | **Resumo de faturamento**: anel de %, pedido → faturado, "falta R$ X" (`PW:11302-11347`; ≥ 99,5 % arredonda para 100, RN-NF-34) | Painel "Faturamento do pedido" com pedido, faturado, saldo, % em valor e em quantidade | parcial — sem barra, sem "falta" |
| 2 | Selos de validade: conforme / atenção / crítica / pendentes (`PW:11349-11365`) | Conferências da NF por item (tipo VALIDADE entre outras) | parcial |
| 3 | NFs registradas (NF, série, emissão, valor) e **Registrar NF** (`PW:11367-11764`) | Notas vinculadas com itens e conferências; Registrar NF | parcial — tabela de 5 colunas |
| 4 | **Análise de validade** por item faturado: NF, qt, lote, validade, dias, status, Aceitar/Recusar com justificativa (`PW:11766-12059`; ≤ 120 d decide, < 90 crítico, RN-KAN-53) | Conferências com aceitar/recusar (mesmo papel, régua de validade mínima da 005) | parcial |
| 5 | **Fluxo B.O.**: itens recusados → "Enviar para B.O." cria um **card filho** em Produtos em B.O.; lista os cards B.O. vinculados (`PW:12061-12260`, RN-BO-03/04) | B.O. é a fase do próprio card, com itens marcados (`abas/Bo.tsx`) | **regra diferente (pergunta P-2)** |
| 6 | **Itens pendentes de faturamento**: pedida, faturada, pendente, %, situação; NF complementar (`PW:12262-12356`) | Não existe | sim |
| 7 | **Conclusão**: "Pedido pronto para conclusão" ou a lista de pendências (faturar o saldo, decidir validades, mandar recusados ao B.O.) (`PW:12402-12443`, RN-BO-13) | O motor desabilita "Compras Concluídas" com o motivo; nada no conteúdo | sim — o saldo não faturado não trava no SGC 2 (pergunta P-6) |

## Produtos em B.O.

| # | Legado (`PW:12448-12487`, `BoFasePanel.tsx`) | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | Vínculo com o pedido original do card filho + "Abrir pedido" (`PW:12453-12477`) | Não se aplica (sem card filho) | — (depende da P-2) |
| 2 | **Alerta de previsão vencida há N dias** (`BoFasePanel.tsx:253-267`, RN-BO-07/08) | Selo "Vencida / Sem previsão" no cabeçalho | parcial |
| 3 | **Datas da fase**: envio à indústria, entrada em B.O. com % faturado, previsão da indústria com situação (`:269-302`) | Não existe | sim — entrada em B.O. não é gravada no SGC 2 (o histórico do motor tem) |
| 4 | Itens pendentes em B.O.: pedida, faturada, em B.O., valor pendente, **total pendente** (`:304-386`) | Itens em B.O.: pendente, valor, clientes, vendido 60 d, situação, Liberar | parcial — tabela de 7 colunas, sem total |
| 5 | Previsão de liberação + histórico (`:388-452`) | Histórico de previsões + Registrar previsão | não |
| 6 | **Carta de falta**: a mais recente, "carta pendente" quando não há (`:454-524`, RN-BO-09) | Documentos (carta de falta ou outro) | parcial — sem o selo de pendente |

## Compras Concluídas

| # | Legado (`PW:12490-12643`) | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | **Pedido concluído**: itens aceitos, **valor aceito**, valor em B.O. (`PW:12505-12525`) | Não existe | sim |
| 2 | **Itens aceitos**: produto, NF, qt, valor unit., subtotal, lote, validade, situação, total aceito (`PW:12527-12610`) | Itens da Análise + Notas fiscais + B.O., todos com ações desabilitadas | parcial |
| 3 | Cards B.O. vinculados com fase (`PW:12612-12640`) | Bloco B.O. | parcial (P-2) |

## Compras Canceladas

| # | Legado | SGC 2 hoje | Lacuna |
|---|---|---|---|
| 1 | Selo "Compra cancelada": motivo, por quem e quando, no resumo (`PW:8708-8720`) | O motivo é campo do quadro à esquerda; quem e quando não aparecem | parcial |
| 2 | Itens do pedido (aba Geral) | Bloco Itens | não |

## O que muda no SGC 2 (sem regra nova)

Tudo abaixo usa dado que **já chega**: `sgcPedidoCarregar` devolve `P.*` de
`SGC_PEDIDO` (aprovações, envio, cancelamento, `VL_FATURADO`,
`PERC_FATURADO_*`, `ALERTA_FATURAMENTO_NIVEL`, `DT_PREVISAO_BO`) e os itens; o
resto vem das SFs que os blocos já chamam (`sgcNfListar`,
`sgcNfsRecebimentoCard`, `sgcBoCarregar`). **Nenhuma SF nova.**

1. **Resumo do pedido** no topo de toda fase depois da Análise: fornecedor,
   filial, valor (aceito em Concluído), % faturado com barra e os selos de
   aprovação técnica, diretoria, envio e cancelamento.
2. **Aprovações**: faixa "Análise para aprovação" com o que os itens dão —
   total, cobertura média, preço especial (valor e %), e os indicadores do
   pedido recolhidos (itens, comercial, dentro/acima/abaixo da sugestão, sem
   estoque com venda, acima do limite de cobertura, sem venda).
3. **Envio**: resumo para a indústria com Copiar itens e Arquivo WinThor, itens
   em cartões, e o "Registrar envio" também no fim do bloco.
4. **Enviado**: o envio registrado, itens em cartões e o próximo movimento.
5. **Trânsito**: acompanhamento do faturamento (dias úteis e o nível que o cron
   já grava) e recebimento em cartões.
6. **Faturamento**: resumo com barra e "falta", itens pendentes de faturamento,
   a conclusão (pronto ou pendências que o servidor já confere) e as notas em
   cartões.
7. **B.O.**: alerta de previsão vencida, datas da fase, total pendente, carta
   de falta pendente e itens em cartões.
8. **Concluído**: resumo com valor aceito e itens aceitos em cartões.
9. **Cancelado**: o selo do cancelamento no resumo.

## Perguntas de regra (não implementadas)

- **P-1 — Meta de compras e venda projetada por fornecedor.** A faixa de
  decisão do legado (compras do mês, saldo sobre a meta, compras × vendas, e o
  histórico consolidado de 3 meses) depende de uma meta de compras
  parametrizada e da venda projetada do mês. O SGC 2 não tem nenhum dos dois.
  Criar o parâmetro e a consulta, ou deixar a aprovação só com o que os itens
  dão?
- **P-2 — B.O. como card filho.** No legado, item recusado na validade gera um
  card novo em Produtos em B.O. e o pedido segue para a conclusão com o que foi
  aceito (RN-BO-03/04). No SGC 2 o B.O. é a fase do próprio pedido (spec 007).
  Manter o modelo do SGC 2?
- **P-3 — Notificar gestor a partir de 5 dias úteis.** O legado tem o botão
  que escolhe um gestor, o põe como responsável e grava o alerta. No SGC 2 o
  cron já escala pelo nível; a ação manual entra?
- **P-4 — "Produto faturado — ir para Faturamento".** O legado deixa o
  comprador mover à mão do Trânsito para o Faturamento; no SGC 2 o servidor
  move quando todas as NFs dão entrada (spec 006). Entra o atalho manual?
- **P-5 — Régua de validade 90/120 dias.** O legado decide à mão só validade
  ≤ 120 dias e chama de crítica abaixo de 90; o SGC 2 confere contra a
  validade mínima da spec 005. Os selos "atenção" e "crítica" entram com essa
  régua?
- **P-6 — Concluir exige 100 % faturado?** O legado só conclui com o pedido
  100 % faturado (e conta 99,5 % como 100 %, RN-NF-34); o saldo vai para NF
  complementar ou para o B.O. No SGC 2 o servidor só barra a conclusão por
  conferência de NF sem decisão e por item em B.O. em aberto
  (`pendencias-conclusao-nf.sql`, `pendencias-conclusao-bo.sql`): o saldo não
  faturado não bloqueia. O bloco de conclusão mostra o saldo como aviso, sem
  travar. Passa a travar?
