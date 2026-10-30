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

/** A largura de cada opção em px; "Metade" divide a grade (descontado o vão de 16 px). */
export function pixelsDoPainel(largura: LarguraPainel, larguraGrade: number): number {
  const fixos: Record<Exclude<LarguraPainel, 'metade'>, number> = { estreito: 380, medio: 480, largo: 620 };
  return largura === 'metade' ? Math.max(0, (larguraGrade - VAO) / 2) : fixos[largura];
}

const VAO = 16;
/** A lista nunca fica mais estreita que isto ao lado do painel (R-129, correção). */
export const LISTA_MINIMA = 640;
/** Abaixo disto a lista entra no modo compacto: curvas "F/R", situação sob o nome, colunas mais justas. */
export const LISTA_COMPACTA = 900;
/** A área de "Mais detalhes" precisa de ao menos isto para rolar à parte; menos, o painel rola inteiro. */
export const DETALHES_MINIMO = 160;

/**
 * A largura que o painel pode ter de fato: a escolhida, ou a maior abaixo dela
 * que deixa a lista com ao menos LISTA_MINIMA px. Sem medida (0), a escolhida.
 */
export function larguraEfetiva(escolhida: LarguraPainel, larguraGrade: number): LarguraPainel {
  const atual = larguraDe(escolhida);
  if (!(larguraGrade > 0)) return atual;
  for (let i = LARGURAS.indexOf(atual); i > 0; i -= 1) {
    if (larguraGrade - VAO - pixelsDoPainel(LARGURAS[i], larguraGrade) >= LISTA_MINIMA) return LARGURAS[i];
  }
  return 'estreito';
}

/** A lista entra no modo compacto pela largura MEDIDA dela, não pela opção do painel. */
export function listaCompacta(larguraLista: number): boolean {
  return larguraLista > 0 && larguraLista < LISTA_COMPACTA;
}

/**
 * O painel tem dois modos de rolagem: produto e gráfico fixos e "Mais
 * detalhes" rolando à parte; ou, se sobrar pouca altura para os detalhes
 * (medida no próprio painel — no Mitra a tela roda em iframe e com zoom), o
 * painel inteiro rola junto.
 */
export function rolagemDoPainel(alturaPainel: number, alturaFixa: number, vao = 12): 'separada' | 'unica' {
  if (!(alturaPainel > 0)) return 'separada';
  return alturaPainel - alturaFixa - vao < DETALHES_MINIMO ? 'unica' : 'separada';
}
