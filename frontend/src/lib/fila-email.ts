// Spec 016 (RF-002): o que a tela diz quando o e-mail não saiu no clique e
// entrou na fila de nova tentativa (`emailNaFila` do sgcEnvioIndustriaRegistrar
// e do sgcCobrancaEnviar). Puro, testado em tests/fila-email.test.mjs.

/** RN-001: a do clique + até 2 da rotina de 5 minutos. */
export const AVISO_FILA = 'O e-mail não saiu agora e entrou na fila: o sistema tenta de novo a cada 5 minutos, até 3 tentativas no total, e avisa você se não conseguir.';

/** O aviso do registro do envio à indústria (C-001 e C-002). */
export function textoDoEnvioRegistrado(emailNaFila: unknown): string {
  return emailNaFila === true ? `Envio registrado no pedido. ${AVISO_FILA}` : 'Envio registrado no pedido.';
}

/** O resumo do contato que a cobrança grava, marcado quando o e-mail ficou na fila (C-003). */
export function resumoComFila(resumo: string, emailNaFila: unknown): string {
  return emailNaFila === true ? `${resumo} (e-mail na fila de nova tentativa)` : resumo;
}
