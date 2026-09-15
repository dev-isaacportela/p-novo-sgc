# Specs do SGC 2

Uma pasta por feature: `spec.md` (o quê e por quê) → `plan.md` (como) → `tasks.md` (ordem). Modelos em `../templates/`. O processo está em `../constitution.md`; o visual, em `../design.md`.

| Spec | Assunto | Onda | Status |
|---|---|---|---|
| [000-visao-geral](000-visao-geral/README.md) | o sistema, personas, dez fases, modelo de dados, faixas de id, mapa das ondas; [`regras.md`](000-visao-geral/regras.md) com as 121 decisões de negócio | — | contrato fechado (2026-09-15); revisado pelas specs 001–004 (decisões R-001..R-012) |
| [001-fornecedores](001-fornecedores/spec.md) | cadastro WinThor + parametrização própria, contatos de envio, faixas de prazo, documentos, log | 1 | implementada (onda 1, 2026-09-15) |
| [002-quadro-de-compras](002-quadro-de-compras/spec.md) | quadro `compras`, personas, transições, aprovações, cancelamento, envio à indústria, e-mails, notificações | 1 | implementada (onda 1, 2026-09-15) |
| [003-itens-do-pedido](003-itens-do-pedido/spec.md) | aba Itens (análise WinThor, sugestão, ABC, cobertura), aba Alertas, prazo de pagamento, travas de saída da Análise | 1 | implementada (onda 1, 2026-09-15) |
| [004-agenda-de-analises](004-agenda-de-analises/spec.md) | agendamentos, recorrência, participantes, processamento automático e manual | 1 | implementada (onda 1, 2026-09-15) |
| [005-notas-fiscais-e-faturamento](005-notas-fiscais-e-faturamento/spec.md) | detecção automática de NF, registro híbrido, conferência NF × pedido, faturamento e cobrança | 2 | aprovada (revisão cruzada aplicada, 2026-09-15) |
| [006-transito-e-recebimento](006-transito-e-recebimento/spec.md) | previsão por nota, sincronização com o WinThor, Trânsito → Faturamento automático, NFs em atraso, conclusão | 2 | aprovada (revisão cruzada aplicada, 2026-09-15) |
| [007-produtos-em-bo](007-produtos-em-bo/spec.md) | itens em B.O., previsão de liberação, carta de falta, clientes impactados, painel consolidado | 2 | aprovada (revisão cruzada aplicada, 2026-09-15) |

Ondas 3–5: ver o mapa em `000-visao-geral/README.md`; a onda 2 tem contrato próprio na seção "Onda 2" do 000.
