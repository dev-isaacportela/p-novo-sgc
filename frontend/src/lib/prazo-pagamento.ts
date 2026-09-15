// Formato de parcelas de prazo de pagamento ("30/60/90"). Dono único: spec 003
// (docs/specs/003-itens-do-pedido), que compara o prazo acordado do pedido com
// o prazo padrão do fornecedor (PZ-01, PZ-02). A 001 importa daqui e não
// reimplementa (C-10 do plan da 001) — ver `faixaDoValor`/`validarParametrizacao`
// em `lib/fornecedor.ts`.
//
// PLACEHOLDER: a 003 ainda não entregou este arquivo neste worktree (specs
// paralelas, worktrees isolados). Implementação mínima e fiel ao contrato
// descrito no plan da 001 (RN-009), para não bloquear os testes desta spec.
// Integrador: ao mergear a 003, o arquivo dela (mesmas assinaturas) substitui
// este — descarte esta versão.

/** "30/60/90" -> [30, 60, 90]. Qualquer parcela <= 0 ou não numérica -> []. */
export function parcelasDoPrazo(texto: string): number[] {
  const partes = String(texto ?? '').split('/').map((p) => p.trim());
  if (partes.length === 0 || partes.some((p) => p === '')) return [];
  const numeros = partes.map(Number);
  if (numeros.some((n) => !Number.isFinite(n) || n <= 0)) return [];
  return numeros;
}

/** [30, 60, 90] -> "30/60/90". */
export function textoDeParcelas(dias: number[]): string {
  return (dias ?? []).join('/');
}
