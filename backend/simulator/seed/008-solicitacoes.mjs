// Seção Simulador da spec 008 (solicitações do comercial). Ver
// docs/specs/008-solicitacoes-do-comercial/plan.md §Simulador.
//
// STUB DA BASE (S2): as suítes de smoke compartilham UM banco, então um stub
// não insere nada — quem semeia é o agente da 008 (S3). O que este arquivo vai
// ter, segundo o plan:
//
// - 5 produtos próprios do fornecedor 1042 em `PCPRODUT`, CODPROD 5301–5305
//   (fora das faixas da 003, 5001–5104, e da 007, 5201–5202), sem "CREME" na
//   descrição nem as palavras da 007;
// - 5 clientes próprios em `PCCLIENT`, 9201–9205, com `CGCENT` (R-069);
// - `PCEST` da filial 3 para os cinco produtos, com datas RELATIVAS a hoje
//   (girando, sem_estoque, parado, excesso);
// - vendas em `PCMOV` (`CODOPER = 'S'`, `DTCANCEL` nulo) a partir de
//   `NUMTRANSITEM` 950001 (R-062), datas relativas à aprovação;
// - 3 cards PRÓPRIOS do quadro `compras`, fornecedor 1042, exportados em
//   `CARDS_008` (`montagem`, `montagemFilial2`, `vinculado`), todos com
//   `DT_ENVIO` vazio, sem `SGC_NF` e sem `SGC_BO_ITEM` — é o que os mantém
//   fora das listagens globais da 005 e da 007 (R-045/R-073);
// - 14 solicitações em `SGC_SOLICITACAO`, exportadas em `SOLICITACOES_008`, e
//   o histórico só onde o cenário precisa (a `vinculada` e a `recusada`).
//
// Só INSERT: fornecedores, filiais, personas e o catálogo das 003/007 não são
// tocados (R-017).

export function seed008(db, cenario) {
  // Stub: nada a inserir até a spec 008 (S3).
}
