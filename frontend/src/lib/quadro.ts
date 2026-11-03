// O SGC 2 tem dois quadros, o de compras e o de empenhos (R-160). O slug é contrato com o seed do
// simulador e com o add-005 (que cria o quadro na plataforma).
export const QUADRO_COMPRAS = 'compras';

/** R-160: o segundo quadro, de empenhos (contrato com o add-017 e o seed 015). */
export const QUADRO_EMPENHOS = 'empenhos';
export const ROTULO_NOVO_EMPENHO = 'Novo empenho';

/** RF-008 / C-036 — no lugar do "Novo card" genérico do motor; abre a janela sobre o quadro (R-118). */
export const ROTULO_NOVO_PEDIDO = 'Novo pedido';

/** RF-007 / C-037 / RNF-002 — o quadro se atualiza sozinho a cada 60 s (a lib pausa com a aba escondida). */
export const ATUALIZAR_A_CADA_MS = 60000;

/** EM-02 — a cópia obrigatória de todo e-mail do pedido. */
export const COPIA_COMPRAS = 'compras@benenutri.com';
