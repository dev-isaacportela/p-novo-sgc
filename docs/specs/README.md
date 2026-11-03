# Specs do SGC 2

Uma pasta por feature: `spec.md` (o quê e por quê) → `plan.md` (como) → `tasks.md` (ordem). Modelos em `../templates/`. O processo está em `../constitution.md`; o visual, em `../design.md`.

| Spec | Assunto | Onda | Status |
|---|---|---|---|
| [000-visao-geral](000-visao-geral/README.md) | o sistema, personas, dez fases, modelo de dados, faixas de id, mapa das ondas; [`regras.md`](000-visao-geral/regras.md) com as 121 decisões de negócio | — | contrato fechado (2026-09-15); revisado pelas specs 001–004 (decisões R-001..R-012) |
| [001-fornecedores](001-fornecedores/spec.md) | cadastro WinThor + parametrização própria, contatos de envio, faixas de prazo, documentos, log | 1 | implementada (onda 1, 2026-09-15) |
| [002-quadro-de-compras](002-quadro-de-compras/spec.md) | quadro `compras`, personas, transições, aprovações, cancelamento, envio à indústria, e-mails, notificações | 1 | implementada (onda 1, 2026-09-15) |
| [003-itens-do-pedido](003-itens-do-pedido/spec.md) | aba Itens (análise WinThor, sugestão, ABC, cobertura), aba Alertas, prazo de pagamento, travas de saída da Análise | 1 | implementada (onda 1, 2026-09-15) |
| [004-agenda-de-analises](004-agenda-de-analises/spec.md) | agendamentos, recorrência, participantes, processamento automático e manual | 1 | implementada (onda 1, 2026-09-15) |
| [005-notas-fiscais-e-faturamento](005-notas-fiscais-e-faturamento/spec.md) | detecção automática de NF, registro híbrido, conferência NF × pedido, faturamento e cobrança | 2 | implementada (onda 2, 2026-09-15) |
| [006-transito-e-recebimento](006-transito-e-recebimento/spec.md) | previsão por nota, sincronização com o WinThor, Trânsito → Faturamento automático, NFs em atraso, conclusão | 2 | implementada (onda 2, 2026-09-15) |
| [007-produtos-em-bo](007-produtos-em-bo/spec.md) | itens em B.O., previsão de liberação, carta de falta, clientes impactados, painel consolidado | 2 | implementada (onda 2, 2026-09-15) |
| [008-solicitacoes-do-comercial](008-solicitacoes-do-comercial/spec.md) | registro pelo vendedor, avaliação por compras, bloco "Solicitações" na Análise, situação derivada da fase, rastreio pós-aprovação em dois eixos | 3 | implementada (onda 3, 2026-09-16) |
| [009-indicadores-e-relatorios](009-indicadores-e-relatorios/spec.md) | `/analises` (indicadores, compras × vendas, SLA por etapa, solicitações) e `/relatorios` (relatórios salvos sobre os pedidos) | 3 | implementada (onda 3, 2026-09-16): `/analises`; `/relatorios` adiado (R-114) |
| [010-extrato-do-pedido](010-extrato-do-pedido/spec.md) | extrato do pedido em PDF (janela de impressão) e CSV, em qualquer fase, marca d'água pela fase | 3 | implementada (onda 3, 2026-09-16) |
| [011-compras-inteligentes](011-compras-inteligentes/spec.md) | ressuprimento por fornecedor + filial, parâmetros e silenciamento, vendas desconsideradas, carrinho que cria o pedido, eficiência | 4 | implementada (onda 4, 2026-09-16) |
| [012-coberturas-por-curva](012-coberturas-por-curva/spec.md) | curva ABC no limite de cobertura (`SGC_COBERTURA` por curva), auditoria, trava de saída da Análise pela curva | 4 | implementada (onda 4, 2026-09-16) |
| [013-movimentacao-produtos](013-movimentacao-produtos/spec.md) | movimentação de produtos: sem venda, excedentes, a vencer (bloqueio e divergência de lote), alerta de ruptura, perdas com rastro do lote, plano de ação | 5 | implementada em `feature/013-movimentacao` (2026-11-03), aguardando merge; P-01..P-08 aprovadas |
| [014-pedido-galderma](014-pedido-galderma/spec.md) | mesa de negociação Galderma (proposta × posição WinThor × pedido por filial), um pedido por filial no quadro, acompanhamento de sell-out/sell-in e composição por filial | 5 | implementada em `feature/014-galderma` (2026-11-03), sem merge; perguntas respondidas (R-151) |
| [015-quadro-de-empenhos](015-quadro-de-empenhos/spec.md) | quadro `empenhos`: pregão, novo empenho com CMV, análise de onde sai cada item, aprovações com CMV congelado, desmembramento em pedidos por indústria e transferência, pendências, reagrupamento, pregões e indicadores | 5 | implementada e em `develop` (2026-11-03); perguntas aprovadas (R-162) |
| [016-fila-email-e-aviso-conclusao](016-fila-email-e-aviso-conclusao/spec.md) | fila de e-mail com novas tentativas (pedido à indústria e cobrança: sai na hora, a falha entra na fila, até 3 tentativas, falha definitiva no histórico e no sino) e aviso diário às 08h10 do pedido pronto para concluir | 5 | implementada em `claude/016-fila-email-aviso-bf5131` (2026-11-03), sem merge; P-01..P-09 aguardando aprovação |
| [017-solicitacoes-apoio-e-visoes](017-solicitacoes-apoio-e-visoes/spec.md) | extensão da 008: apoio à avaliação (vendas de 6 meses na filial, 5 maiores clientes, estoque) e a fila agrupada por vendedor, fornecedor e filial | 5 | implementada em `claude/017-solicitacoes-apoio-00a9a7` (2026-11-03), sem merge; P-01..P-09 aguardando o usuário |
| [018-fornecedores-exportar-excluir](018-fornecedores-exportar-excluir/spec.md) | exportar a parametrização de fornecedores em CSV (todos ou um) e excluir a parametrização guardando uma cópia (extensão da 001) | 5 | implementada em `claude/018-fornecedores-export-fbd5ec` (2026-11-03), sem merge; P-01..P-07 aguardando o usuário |

Ondas 3–5: ver o mapa em `000-visao-geral/README.md`; a onda 2 tem contrato próprio na seção "Onda 2" do 000.
