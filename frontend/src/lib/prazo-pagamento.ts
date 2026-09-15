// Prazo de pagamento: o PADRÃO do fornecedor (o que está parametrizado) contra
// o ACORDADO neste pedido (o que a compradora de fato negociou) — spec 003,
// RN-006 e RN-007.
//
// Guardando os dois lados, a diferença vira informação de decisão; quando
// existe, exige justificativa. O texto é livre por necessidade ("28/35/42
// dias", "30 dias", "à vista"), então a comparação trabalha sobre as parcelas
// extraídas do texto, e um lado sem número nenhum é divergência — nunca
// igualdade.
//
// DONO ÚNICO da regra de parcelas no projeto (C-10 / R-015): a spec 001
// importa `parcelasDoPrazo`, `textoDeParcelas` e `parcelasValidas` daqui para
// validar e formatar o PARCELAS ("30/60/90") da faixa do fornecedor. Por isso
// as três são puras, sem nada de pedido: texto entra, número sai.

export type TomPrazo = 'neutro' | 'ok' | 'ganho' | 'alerta';

export interface ComparacaoPrazo {
  padraoInformado: boolean;
  acordadoInformado: boolean;
  /** Os dois lados têm parcela numérica e podem ser comparados em dias. */
  comparavel: boolean;
  /** Mesmas parcelas, na mesma ordem — não há divergência a justificar. */
  iguais: boolean;
  padraoParcelas: number[];
  acordadoParcelas: number[];
  padraoMedio: number | null;
  acordadoMedio: number | null;
  /** Acordado menos padrão, em dias de prazo médio. Positivo = prazo maior. */
  diferencaDias: number | null;
  rotulo: string;
  tom: TomPrazo;
  exigeJustificativa: boolean;
}

/** Mínimo de caracteres da justificativa da diferença (RN-007). */
export const MINIMO_JUSTIFICATIVA_PRAZO = 10;

export const COMPARACAO_PRAZO_VAZIA: ComparacaoPrazo = {
  padraoInformado: false,
  acordadoInformado: false,
  comparavel: false,
  iguais: false,
  padraoParcelas: [],
  acordadoParcelas: [],
  padraoMedio: null,
  acordadoMedio: null,
  diferencaDias: null,
  rotulo: 'Informe o prazo padrão e o acordado para comparar.',
  tom: 'neutro',
  exigeJustificativa: false,
};

function semAcento(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * RN-006. "28/35/42 dias" -> [28, 35, 42]. Pagamento à vista é uma parcela de
 * ZERO dia — e não a ausência de prazo, que é o que a lista vazia significa.
 */
export function parcelasDoPrazo(texto: unknown): number[] {
  const normalizado = semAcento(texto);
  if (!normalizado) return [];
  const parcelas = (normalizado.match(/\d+(?:[.,]\d+)?/g) || [])
    .map((numero) => Number(numero.replace(',', '.')))
    .filter((numero) => Number.isFinite(numero) && numero >= 0)
    .map((numero) => Math.round(numero));
  if (parcelas.length > 0) return parcelas;
  return /\ba?\s*vista\b/.test(normalizado) ? [0] : [];
}

/** [28, 35, 42] -> "28/35/42". Lista vazia -> "". */
export function textoDeParcelas(dias: number[]): string {
  return (dias ?? [])
    .filter((dia) => Number.isFinite(dia) && dia >= 0)
    .map((dia) => String(Math.round(dia)))
    .join('/');
}

/** Há ao menos uma parcela em dias inteiros >= 0? */
export function parcelasValidas(texto: unknown): boolean {
  return parcelasDoPrazo(texto).length > 0;
}

/**
 * Forma canônica gravada em `SGC_PEDIDO` (D-005): com número, as parcelas;
 * sem número, o texto aparado em maiúsculas. É o que faz a igualdade de texto
 * do servidor coincidir com a igualdade de parcelas da tela — uma regra, dois
 * lugares, sem repetir o parser dentro do SQL.
 */
export function normalizarPrazo(texto: unknown): string {
  const parcelas = parcelasDoPrazo(texto);
  if (parcelas.length > 0) return textoDeParcelas(parcelas);
  return String(texto ?? '').trim().toUpperCase();
}

/** Média simples das parcelas, como o mercado calcula, com uma casa. */
export function prazoMedioDias(texto: unknown): number | null {
  const parcelas = parcelasDoPrazo(texto);
  if (parcelas.length === 0) return null;
  const soma = parcelas.reduce((total, dia) => total + dia, 0);
  return Math.round((soma / parcelas.length) * 10) / 10;
}

/** 35 -> "35"; 38.5 -> "38,5". Sem casa decimal inútil. */
export function formatarDias(valor: number): string {
  const arredondado = Math.round(valor * 10) / 10;
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(1).replace('.', ',');
}

function mesmasParcelas(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((dia, indice) => dia === b[indice]);
}

/** Tudo que a tela mostra sobre a diferença, e se ela precisa ser justificada. */
export function compararPrazo(padrao: unknown, acordado: unknown): ComparacaoPrazo {
  const textoPadrao = String(padrao ?? '').trim();
  const textoAcordado = String(acordado ?? '').trim();
  const padraoParcelas = parcelasDoPrazo(textoPadrao);
  const acordadoParcelas = parcelasDoPrazo(textoAcordado);
  const padraoMedio = prazoMedioDias(textoPadrao);
  const acordadoMedio = prazoMedioDias(textoAcordado);

  const base: ComparacaoPrazo = {
    ...COMPARACAO_PRAZO_VAZIA,
    padraoInformado: textoPadrao.length > 0,
    acordadoInformado: textoAcordado.length > 0,
    padraoParcelas,
    acordadoParcelas,
    padraoMedio,
    acordadoMedio,
  };

  if (!base.padraoInformado || !base.acordadoInformado) return base;

  // Texto idêntico dispensa a análise de parcela — inclusive quando o prazo é
  // descritivo e não tem número ("conforme contrato").
  if (semAcento(textoPadrao) === semAcento(textoAcordado) || mesmasParcelas(padraoParcelas, acordadoParcelas)) {
    return { ...base, comparavel: true, iguais: true, diferencaDias: 0, rotulo: 'Igual ao prazo padrão do fornecedor.', tom: 'ok' };
  }

  if (padraoMedio === null || acordadoMedio === null) {
    return {
      ...base,
      rotulo: 'Prazo acordado diferente do padrão e sem parcela em dias para comparar. Justifique a condição.',
      tom: 'alerta',
      exigeJustificativa: true,
    };
  }

  const diferencaDias = Math.round((acordadoMedio - padraoMedio) * 10) / 10;
  const trechoMedia = `média ${formatarDias(padraoMedio)} → ${formatarDias(acordadoMedio)} dias`;

  if (diferencaDias === 0) {
    return {
      ...base,
      comparavel: true,
      diferencaDias: 0,
      rotulo: `Mesmo prazo médio (${formatarDias(padraoMedio)} dias) com parcelas diferentes do padrão.`,
      tom: 'alerta',
      exigeJustificativa: true,
    };
  }

  const sinal = diferencaDias > 0 ? '+' : '−';
  const sentido = diferencaDias > 0 ? 'a mais' : 'a menos';
  return {
    ...base,
    comparavel: true,
    diferencaDias,
    rotulo: `${sinal}${formatarDias(Math.abs(diferencaDias))} ${Math.abs(diferencaDias) === 1 ? 'dia' : 'dias'} ${sentido} que o padrão (${trechoMedia}).`,
    tom: diferencaDias > 0 ? 'ganho' : 'alerta',
    exigeJustificativa: true,
  };
}

export interface EntradaPrazo {
  padrao: unknown;
  acordado: unknown;
  justificativa: unknown;
}

/**
 * RN-007: a mensagem do bloqueio, ou `null` quando o pedido pode seguir. Fonte
 * única do formulário e da trava de saída — se divergissem, a compradora
 * salvaria algo que a fase seguinte recusa.
 */
export function validarPrazoMontagem(entrada: EntradaPrazo): string | null {
  const padrao = String(entrada.padrao ?? '').trim();
  const acordado = String(entrada.acordado ?? '').trim();
  const justificativa = String(entrada.justificativa ?? '').trim();

  if (!padrao) return 'Informe o prazo de pagamento padrão do fornecedor antes de enviar para aprovação.';
  if (!acordado) return 'Informe o prazo de pagamento acordado neste pedido antes de enviar para aprovação.';

  const comparacao = compararPrazo(padrao, acordado);
  if (comparacao.exigeJustificativa && justificativa.length < MINIMO_JUSTIFICATIVA_PRAZO) {
    return `O prazo acordado difere do padrão (${comparacao.rotulo}) Justifique a diferença em pelo menos ${MINIMO_JUSTIFICATIVA_PRAZO} caracteres.`;
  }
  return null;
}
