// Stub — seção Simulador da spec 007 (produtos em B.O.). O plan
// (docs/specs/007-produtos-em-bo/plan.md §Simulador) pede: só INSERT
// (fornecedores/filiais do seed/001, personas do seed/002, catálogo e vendas
// da 003 — R-017); 2 produtos próprios do fornecedor 1042 (5201, 5202) e 5
// clientes próprios (9101–9105), fora da faixa da 003; vendas `CODOPER = 'S'`
// com `NUMTRANSITEM` a partir de 900001 (não semeia nota fiscal — isso é da
// 005/006); os 4 cards exportados em `CARDS_007` (faturamento, bo, boLimpo,
// boSemPrevisao), todos com `DT_ENVIO` vazio (R-045: não entrar na listagem
// da 005 no banco compartilhado do smoke).

export function seed007(db, cenario) {}
