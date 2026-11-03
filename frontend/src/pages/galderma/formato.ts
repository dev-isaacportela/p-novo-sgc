// Spec 014 — rótulos curtos dos gráficos Galderma (R-116: o valor em cima da barra).

/** "R$ 12,3 mil" — o rótulo curto em cima da barra; a tabela leva o valor inteiro. */
export function moedaCurta(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `R$ ${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

export const unidadesPt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
