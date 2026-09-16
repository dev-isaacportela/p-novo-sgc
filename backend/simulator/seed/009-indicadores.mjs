// Seção Simulador da spec 009 (indicadores e relatórios). Ver
// docs/specs/009-indicadores-e-relatorios/plan.md §Simulador.
//
// STUB DA BASE (S2): as suítes de smoke compartilham UM banco, então um stub
// não insere nada — quem semeia é o agente da 009 (S3). O que este arquivo vai
// ter, segundo o plan: SÓ relatórios salvos (R-062). Nenhum card, pedido, NF,
// agendamento, item de B.O. ou solicitação nasce aqui — os indicadores leem
// exatamente o que as ondas 1 e 2 (e o seed da 008) semearam, e é isso que
// torna as asserções interessantes.
//
// Quatro linhas em `SGC_RELATORIO`, exportadas em `RELATORIOS_009` (como a 003
// faz com `CARDS_003`), para o smoke recortar a galeria por id e nunca por
// total absoluto (R-045): "Pedidos por fase" (ana, compartilhado), "Valor por
// fornecedor" (gil, compartilhado), "Meus pedidos em análise" (ana, não
// compartilhado) e "Relatório antigo" (admin, compartilhado, com `CONFIG_JSON`
// sem `visao` e com uma chave desconhecida, para `lerConfig` provar a tolerância).
//
// Os estados de SLA e de agenda que os cenários precisam são arranjados DENTRO
// do próprio teste, por `UPDATE` direto e desfeitos no fim — o seed continua
// sem pedido novo.

export function seed009(db, cenario) {
  // Stub: nada a inserir até a spec 009 (S3).
}
