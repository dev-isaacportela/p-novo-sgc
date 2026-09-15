// Stub — seção Simulador da spec 005 (notas fiscais e faturamento). O plan
// (docs/specs/005-notas-fiscais-e-faturamento/plan.md §Simulador) pede: só
// LINHAS (fornecedores/filiais vêm do seed/001, personas do seed/002,
// produtos do seed/003 — R-017); os pedidos exportados em `CARDS_005`
// (enviadoComPedido, enviadoSemPedido, faturamentoParcial, conferencias,
// notaDeOutro, semNota, semNota2, atrasadoNove, cemPorCento, emBo,
// validade1042); as entradas em PCNFENT/PCMOV(CODOPER='E')/PCLANC com
// NUMNOTA < 90000 (faixa reservada, R-036).

export function seed005(db, cenario) {}
