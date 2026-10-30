// A largura do painel de detalhe das compras inteligentes (R-129): quatro
// larguras pré-definidas, trocadas por −/+ (ou Alt+← / Alt+→) e guardadas por
// usuário no navegador. Módulo puro — é o que `tests/largura-painel.test.mjs`
// exercita. As classes Tailwind de cada largura moram na tela.

export type LarguraPainel = 'estreito' | 'medio' | 'largo' | 'metade';

/** Da mais estreita à mais larga. */
export const LARGURAS: LarguraPainel[] = ['estreito', 'medio', 'largo', 'metade'];

export const ROTULO_LARGURA: Record<LarguraPainel, string> = {
  estreito: 'Estreito', medio: 'Médio', largo: 'Largo', metade: 'Metade da tela',
};

export const LARGURA_PADRAO: LarguraPainel = 'medio';

export const CHAVE_LARGURA = (usuarioId: number) => `sgc2.compras-inteligentes.largura-painel.${Number(usuarioId) || 0}`;

/** O texto guardado → a largura; ausente ou inválido cai em Médio. */
export function larguraDe(texto: string | null | undefined): LarguraPainel {
  return (LARGURAS as string[]).includes(String(texto ?? '')) ? (texto as LarguraPainel) : LARGURA_PADRAO;
}

/** Um passo mais larga (+1) ou mais estreita (−1), parando nas pontas. */
export function proximaLargura(atual: LarguraPainel, passo: 1 | -1): LarguraPainel {
  const i = LARGURAS.indexOf(larguraDe(atual));
  return LARGURAS[Math.min(LARGURAS.length - 1, Math.max(0, i + passo))];
}

/** Com o painel largo, a lista fica estreita: as duas curvas viram uma coluna só ("F/R"). */
export function curvasJuntas(largura: LarguraPainel): boolean {
  return largura === 'largo' || largura === 'metade';
}
