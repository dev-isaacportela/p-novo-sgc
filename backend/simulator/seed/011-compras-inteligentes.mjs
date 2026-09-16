// Seção Simulador da spec 011 (compras inteligentes). Ver
// docs/specs/011-compras-inteligentes/plan.md §Simulador.
//
// STUB DA BASE (S2): as suítes de smoke compartilham UM banco, então um stub
// não insere nada — quem semeia é o agente da 011 (S3). Só INSERT, e datas
// relativas a hoje (a janela da tela termina hoje). O que este arquivo vai ter,
// segundo o plan:
//
// - 20 produtos `CODPROD` 5401-5420 do fornecedor **1042** (não do 1015 —
//   R-097: `smoke/003-itens.mjs` assere 18 linhas para o 1015), departamentos
//   2 e 3, seções 21 e 31, descrições sem a palavra "CREME" (para não mexer na
//   busca do C-009 da 003); 5419 com `OBS2 = 'INATIVO'` e 5420 com
//   `CODEPTO = 4` — os dois que provam o recorte de RN-014 e fazem C-001
//   esperar 18 dos 20.
// - `PCEST` da filial 1 para os 20, com `QTEST`, `QTBLOQUEADA`, `QTINDENIZ`,
//   `QTRESERV`, `QTPEDIDA` e `CUSTOULTENT` desenhados para os casos do estoque
//   líquido e do trânsito (RN-002); `PCEST` das filiais 2 e 3 para o 5403
//   (C-021) e `PCESTTRANSITO` do 5404.
// - Vendas em `PCMOV` (`CODOPER = 'S'`, filial 1), `NUMTRANSITEM` >= 960001,
//   inclusive a linha de `QT = -5` do 5410 que dá dente à RN-014 (devolução
//   fora de `VENDA_PERIODO`), e clientes `PCCLIENT` 9301-9305 (9304/9305
//   públicos, `CODATV1` 12 e 20, para a parte de licitação de RN-011).
// - Lead time medido: `PCPEDIDO` (`NUMPED` >= 970001, `PRAZO1 = 0`) casado com
//   `PCMOV` `CODOPER = 'E'` — 5403 com entradas de 4 e 6 dias (lead 5, C-009) e
//   5416 com entrada no mesmo dia (lead 1, o mínimo de RN-003).
// - Duas linhas de `SGC_PARAMETRO_COMPRA` (fornecedor 1042 + filial 1 herdando
//   e SKU 5417 com `COBERTURA_DIAS` 45) e cards próprios em `CARDS_011`: um
//   pedido do 1042 + filial 1 em `analise` com `ORIGEM = 'compras_inteligentes'`
//   e 5 itens (C-022) e um do 1042 + filial 2 em `enviado` (C-019).
// - Nenhuma linha de `SGC_COBERTURA`: os alvos por curva são do seed da 012
//   (R-096), e os casos de alvo são testados puros.

export function seed011(db, cenario) {
  // Stub: nada a inserir até a spec 011 (S3).
}
