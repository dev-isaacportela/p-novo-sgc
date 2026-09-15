// Stub — seção Simulador da spec 006 (trânsito e recebimento). O plan
// (docs/specs/006-transito-e-recebimento/plan.md §Simulador) pede: só LINHAS
// (fornecedores/filiais do seed/001, personas do seed/002); os pedidos
// exportados em `CARDS_006` (T1..T4, E5, F6, T7), todos com `DT_ENVIO` vazio
// (para não entrar em sgcFaturamentoPendenteListar da 005); `NUMNOTA` na
// faixa reservada 90001–90017 (R-036); as entradas em PCNFENT das notas que
// já chegaram no ERP.

export function seed006(db, cenario) {}
