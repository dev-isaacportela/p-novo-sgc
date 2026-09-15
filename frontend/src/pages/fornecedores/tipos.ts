// Tipos do estado de edição da tela de parametrização (spec 001). `chave` é
// só identidade de lista no React — nasce aqui, nunca é gravada; os `ID`s
// reais só existem depois de salvar e recarregar (sgcFornecedorCarregar).

export interface ContatoEdit {
  chave: string;
  nome: string;
  email: string;
}

export interface FaixaEdit {
  chave: string;
  valorDe: number;
  valorAte: number;
  rotulo: string;
  parcelas: string;
}

export interface LinhaEdit {
  chave: string;
  nome: string;
  contatos: ContatoEdit[];
  faixas: FaixaEdit[];
}

export interface DocumentoEdit {
  chave: string;
  tipo: string;
  nome: string;
  endereco: string;
  vencimento: string;
}

export interface FornecedorForm {
  codfornec: number;
  fornecedor: string;
  cnpj: string;
  cnpjFormatado: string;
  prazoEntregaDias: number;
  prazoEntregaTipo: string;
  pedidoMinimo: number;
  fechamentoDiaInicio: number;
  fechamentoDiaFim: number;
  linkPlataforma: string;
  validadeMinimaDias: number;
  slaAnaliseDias: number;
  slaFaturamentoDias: number;
  ativo: boolean;
}

let contador = 0;
/** Chave local só para key de lista (nunca é gravada). */
export function novaChave(): string {
  contador += 1;
  return `novo-${Date.now()}-${contador}`;
}
