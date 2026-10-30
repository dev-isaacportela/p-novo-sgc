// O SGC 2 tem um quadro só: o de compras. O slug é contrato com o seed do
// simulador e com o add-005 (que cria o quadro na plataforma).
export const QUADRO_COMPRAS = 'compras';

/** RF-008 / C-036 — no lugar do "Novo card" genérico do motor; abre a janela sobre o quadro (R-118). */
export const ROTULO_NOVO_PEDIDO = 'Novo pedido';

/** RF-007 / C-037 / RNF-002 — o quadro se atualiza sozinho a cada 60 s (a lib pausa com a aba escondida). */
export const ATUALIZAR_A_CADA_MS = 60000;

/** EM-02 — a cópia obrigatória de todo e-mail do pedido. */
export const COPIA_COMPRAS = 'compras@benenutri.com';
