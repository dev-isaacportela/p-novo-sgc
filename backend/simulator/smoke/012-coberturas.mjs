// Cenários e regras da spec 012 (coberturas por curva). Ver
// docs/specs/012-coberturas-por-curva/plan.md §Testes.
//
// STUB DA BASE (S2): quem escreve os testes é o agente da 012 (S3). Tudo roda
// sobre as definitions do add-014-coberturas-abc.mjs (log) e do add-006-itens
// (`sgcCoberturaListar` 7307, `sgcEscCoberturaGravar` 7358), no banco
// compartilhado do smoke.
//
// Roda logo depois de `itens` (003), R-107: a 012 é dona, nesta onda, das
// linhas de `SGC_COBERTURA` do `seed/003-itens.mjs` e revalida o smoke da 003
// — não tem seed próprio. A base entregou só a tabela `SGC_COBERTURA_LOG`; as
// colunas de curva de `SGC_COBERTURA` e o tipo de
// `SGC_PEDIDO_ITEM.COBERTURA_LIMITE` vêm no commit da 012 (R-113).

export async function suite(ctx) {
  // Stub: sem teste até a spec 012 (S3).
}
