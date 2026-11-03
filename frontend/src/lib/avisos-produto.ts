// Os avisos de excesso em outras filiais e de estoque bloqueado (R-130): o
// selo da linha, o chip-filtro, o alerta no topo do painel e da janela e o
// detalhe por filial e por lote. Regra pura — é o que
// `tests/avisos-produto.test.mjs` exercita. A carga mora em `avisos-carga.ts`.
import { filiaisComExcesso } from './ressuprimento-detalhe.ts';
import type { FilialComExcesso, PosicaoFilial } from './ressuprimento-detalhe.ts';

const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);
const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');
const texto = (valor: unknown) => (valor === null || valor === undefined ? '' : String(valor).trim());

/** Linha de `sgcWintEstoqueFiliaisProdutos`: a posição de UMA outra filial de UM produto. */
export interface PosicaoOutraFilial {
  CODPROD: number; CODFILIAL: string; FILIAL: string; ESTOQUE_ATUAL: number; VENDA_3_MESES: number;
}

/**
 * RN-037: as filiais com excesso de cada produto da lista, pela MESMA regra da
 * seção do painel (`filiaisComExcesso`, RN-025) e com a cobertura alvo do
 * próprio produto. Produto sem filial em excesso não entra no mapa.
 */
export function excessosPorProduto(
  posicoes: PosicaoOutraFilial[],
  produtos: { codprod: number; coberturaDias: number }[],
  codfilialAtual: string,
): Map<number, FilialComExcesso[]> {
  const porProduto = new Map<number, PosicaoFilial[]>();
  for (const p of posicoes ?? []) {
    const codprod = numero(p.CODPROD);
    const lista = porProduto.get(codprod) ?? [];
    lista.push({ ...p, ESTOQUE_TOTAL: numero(p.ESTOQUE_ATUAL), ESTOQUE_EM_TRANSITO: 0, DT_ULT_SAIDA: null } as PosicaoFilial);
    porProduto.set(codprod, lista);
  }
  const mapa = new Map<number, FilialComExcesso[]>();
  for (const { codprod, coberturaDias } of produtos) {
    const excessos = filiaisComExcesso(porProduto.get(codprod) ?? [], codfilialAtual, coberturaDias);
    if (excessos.length > 0) mapa.set(codprod, excessos);
  }
  return mapa;
}

/** "Bloqueado 15 un." — só com bloqueio. */
export function seloBloqueado(qtBloqueada: unknown): string | null {
  return numero(qtBloqueada) > 0 ? `Bloqueado ${inteiro(numero(qtBloqueada))} un.` : null;
}

/** "Excesso em 1 filial" / "Excesso em 2 filiais" — só com excesso. */
export function seloExcesso(filiais: number): string | null {
  if (!(filiais > 0)) return null;
  return `Excesso em ${filiais} ${filiais === 1 ? 'filial' : 'filiais'}`;
}

/**
 * A filial curta do alerta: "2 - BENENUTRI COMERCIAL LTDA - GO" vira "2 - GO"
 * (a UF do fim da razão social); sem UF no fim, o código e o nome.
 */
export function filialCurta(codfilial: string, nome: string): string {
  const uf = /\s-\s([A-Z]{2})\s*$/.exec(texto(nome))?.[1];
  if (uf) return `${codfilial} - ${uf}`;
  return texto(nome) && texto(nome) !== texto(codfilial) ? `${codfilial} - ${texto(nome)}` : String(codfilial);
}

/** "sem giro" ou "cobertura 120 d". */
export function textoCobertura(coberturaDias: number | null): string {
  return coberturaDias === null ? 'sem giro' : `cobertura ${inteiro(coberturaDias)} d`;
}

/** "Excesso em outras filiais: 2 - GO · estoque 14 · sem giro" (+ " e mais N"); sem excesso, null. */
export function resumoExcesso(excessos: FilialComExcesso[]): string | null {
  if (!excessos?.length) return null;
  const [primeira, ...outras] = excessos;
  const base = `Excesso em outras filiais: ${filialCurta(primeira.codfilial, primeira.filial)} · estoque ${inteiro(primeira.estoque)} · ${textoCobertura(primeira.coberturaDias)}`;
  return outras.length > 0 ? `${base} e mais ${outras.length}` : base;
}

/** O detalhe do alerta mostra no máximo 6 filiais, como no legado. */
export const MAX_FILIAIS_DETALHE = 6;

/** Linha de `sgcWintBloqueiosProduto` (colunas UPPERCASE). */
export interface LoteBloqueado {
  NUMLOTE: string | null; QT: number; QTBLOQUEADA: number; QTRESERV: number; QTINDENIZ: number;
  CODDEVOL: number | null; MOTIVO_BLOQUEIO: string | null; TIPO_MOTIVO: string | null; ORIGEM_MOTIVO: string | null;
  ROTINALANC: string | null; LOG_RESPONSAVEL: string | null; FUNCIONARIO: string | null;
  MOTIVOBLOQESTOQUE: string | null; OBS1: string | null; OBS2: string | null; OBSANALISE: string | null;
  OBSBLOQUEIO: string | null; OBSBLOQUEIOMANUAL: string | null;
  DTBLOQUEIO1: string | null; DTBLOQUEIO2: string | null; DTVALIDADE: string | null;
}

export const SEM_MOTIVO = 'Sem motivo vinculado';

/**
 * RN-038: o motivo do lote, na cascata do legado — o motivo do histórico
 * (PCMOVBLOQUEIO, PCBLOQUEIOEST, PCMOV, PCEST, já resolvido na consulta),
 * depois as observações do lote, nesta ordem; nada, "Sem motivo vinculado".
 */
export function motivoDoLote(lote: Partial<LoteBloqueado>): string {
  const cascata = [lote.MOTIVO_BLOQUEIO, lote.OBSBLOQUEIO, lote.OBSBLOQUEIOMANUAL, lote.OBSANALISE,
    lote.MOTIVOBLOQESTOQUE, lote.OBS1, lote.OBS2];
  return cascata.map(texto).find((t) => t !== '') ?? SEM_MOTIVO;
}

/**
 * "Estoque bloqueado: 10 un. em 2 lotes · 5 reservadas". Antes dos lotes
 * chegarem (ou se a consulta falhou), só o total do estoque; sem bloqueio, null.
 */
export function resumoBloqueio(qtBloqueada: unknown, lotes: Partial<LoteBloqueado>[] | null): string | null {
  if (!(numero(qtBloqueada) > 0)) return null;
  const base = `Estoque bloqueado: ${inteiro(numero(qtBloqueada))} un.`;
  if (!lotes || lotes.length === 0) return base;
  const reservadas = lotes.reduce((soma, l) => soma + numero(l.QTRESERV), 0);
  return `${base} em ${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'} · ${inteiro(reservadas)} reservadas`;
}

/** Os fatos do lote, na ordem do legado; só os que têm valor. */
export function fatosDoLote(lote: Partial<LoteBloqueado>, formatarData: (d: string) => string): { rotulo: string; valor: string }[] {
  const data = (d: unknown) => (texto(d) ? formatarData(texto(d)) : '');
  const fatos: [string, string][] = [
    ['Reservado', numero(lote.QTRESERV) > 0 ? `${inteiro(numero(lote.QTRESERV))} un.` : ''],
    ['Indenizado', numero(lote.QTINDENIZ) > 0 ? `${inteiro(numero(lote.QTINDENIZ))} un.` : ''],
    ['Bloq. 1', data(lote.DTBLOQUEIO1)],
    ['Bloq. 2', data(lote.DTBLOQUEIO2)],
    ['Validade', data(lote.DTVALIDADE)],
    ['Categoria', texto(lote.TIPO_MOTIVO)],
    ['Origem', texto(lote.ORIGEM_MOTIVO)],
    ['Rotina', texto(lote.ROTINALANC)],
    ['Bloqueado por', texto(lote.LOG_RESPONSAVEL)],
    ['Funcionário', texto(lote.FUNCIONARIO)],
  ];
  return fatos.filter(([, valor]) => valor !== '').map(([rotulo, valor]) => ({ rotulo, valor }));
}

/** Os dois chips-filtro da lista (RN-037): ligar um não desliga o outro. */
export interface FiltroAvisos { soBloqueados: boolean; soExcesso: boolean }

export function filtrarPorAvisos<T>(
  linhas: T[], filtro: FiltroAvisos, excessos: Map<number, unknown>,
  dados: (linha: T) => { codprod: number; qtBloqueada: number },
): T[] {
  if (!filtro.soBloqueados && !filtro.soExcesso) return linhas;
  return linhas.filter((linha) => {
    const { codprod, qtBloqueada } = dados(linha);
    return (!filtro.soBloqueados || qtBloqueada > 0) && (!filtro.soExcesso || excessos.has(codprod));
  });
}

/** As contagens dos dois chips, no recorte em que o clique vai filtrar. */
export function contarAvisos<T>(
  linhas: T[], excessos: Map<number, unknown>, dados: (linha: T) => { codprod: number; qtBloqueada: number },
): { bloqueados: number; excesso: number } {
  let bloqueados = 0;
  let excesso = 0;
  for (const linha of linhas) {
    const { codprod, qtBloqueada } = dados(linha);
    if (qtBloqueada > 0) bloqueados += 1;
    if (excessos.has(codprod)) excesso += 1;
  }
  return { bloqueados, excesso };
}
