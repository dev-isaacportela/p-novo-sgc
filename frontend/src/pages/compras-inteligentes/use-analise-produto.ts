// A Análise do Produto da 011 aberta FORA da tela da 011 (R-133: o drill-in do
// pedido). Monta a mesma linha que a lista monta — a carga do fornecedor na
// filial (`carregarRessuprimento`, as mesmas execuções da troca de filial) e
// `montarRessuprimento` — e o detalhe do SKU (3 execuções, uma vez por
// produto), com a previsão, a sugestão projetada e as sugestões de preço
// especial de `lib/analise-sku.ts`. Só consulta quando um produto é aberto;
// a carga do fornecedor vale para os outros produtos do mesmo pedido.
import * as React from 'react';
import { linhas } from '@/lib/mitra-api';
import { hojeIso } from '@/lib/formato';
import { limiteDeCobertura } from '@/lib/cobertura';
import { montarRessuprimento, type AlvoDaCurva, type LinhaRessuprimento } from '@/lib/ressuprimento';
import { DADOS_VAZIOS, historicoSemPublico } from '@/lib/ressuprimento-detalhe';
import type { DadosDoSku, PontoHistorico, PosicaoFilial, VendaDesconsiderada } from '@/lib/ressuprimento-detalhe';
import { excessosPorProduto } from '@/lib/avisos-produto';
import { projecoesAtivas } from '@/lib/projecao-manual';
import type { FilialComExcesso } from '@/lib/ressuprimento-detalhe';
import { oportunidadesDaLinha, previsaoDoSku, projetadaDoSku, sugestoesDaLinha } from '@/lib/analise-sku';
import type { ModeloPrevisao, Previsao, SugestaoProjetada } from '@/lib/previsao';
import type { SugestaoCliente } from '@/lib/custo-especial';
import { carregarRessuprimento, janelaDeHoje, type CargaRessuprimento } from './carga-ressuprimento';
import { useLotesBloqueados, type EstadoLotes } from './use-lotes-bloqueados';

const instante = () => new Date().toISOString().slice(0, 19);

export interface AnaliseDoProduto {
  linha: LinhaRessuprimento | null;
  dados: DadosDoSku;
  previsao: Previsao | null;
  projetada: SugestaoProjetada | null;
  sugestoes: SugestaoCliente[];
  excessos: FilialComExcesso[];
  lotes: EstadoLotes;
  desconsideradas: VendaDesconsiderada[];
  periodo: { inicio: string; fim: string };
  hoje: string;
  carregando: boolean;
  erro: string;
  desconsiderar: (venda: { numtransitem: number; codprod: number; dtmov: string; quantidade: number; motivo: string }) => Promise<void>;
  reconsiderar: (numtransitem: number) => Promise<void>;
}

export function useAnaliseProduto({
  codfornec,
  codfilial,
  codprod,
  modelo,
  semPublico = true,
}: {
  codfornec: number;
  codfilial: string;
  codprod: number;
  modelo: ModeloPrevisao;
  /** R-131: o padrão da 011 é sem a venda a órgão público. */
  semPublico?: boolean;
}): AnaliseDoProduto {
  const hoje = hojeIso();
  const periodo = React.useMemo(() => janelaDeHoje(hoje), [hoje]);
  const [recarga, setRecarga] = React.useState(0);
  const chave = `${codfornec}|${codfilial}|${recarga}`;
  const [carga, setCarga] = React.useState<{ chave: string; dados: Partial<CargaRessuprimento>; erro: string } | null>(null);
  const [cache, setCache] = React.useState<Map<number, DadosDoSku>>(() => new Map());
  const pedida = React.useRef('');
  const emCarga = React.useRef(new Set<string>());
  const ativo = codprod > 0 && codfornec > 0 && codfilial !== '';

  /* ── a carga do fornecedor na filial, uma vez por recorte (ou por escrita de venda) ── */
  React.useEffect(() => {
    if (!ativo || pedida.current === chave) return;
    pedida.current = chave;
    let vivo = true;
    carregarRessuprimento({ codfornec, codfilial }, periodo, (parte) => {
      setCarga((atual) => ({ chave, dados: { ...(atual?.chave === chave ? atual.dados : {}), ...parte }, erro: '' }));
    }, () => vivo).catch(() => {
      if (vivo) setCarga({ chave, dados: {}, erro: 'Não foi possível carregar a análise deste produto.' });
    });
    return () => {
      vivo = false;
      // Desmontou no meio: a próxima abertura pede de novo.
      if (pedida.current === chave) pedida.current = '';
    };
  }, [ativo, chave, codfornec, codfilial, periodo]);

  /* ── o detalhe do SKU: 3 execuções, uma vez por produto ── */
  const chaveSku = `${chave}|${codprod}`;
  React.useEffect(() => {
    if (!ativo || cache.has(codprod) || emCarga.current.has(chaveSku)) return;
    emCarga.current.add(chaveSku);
    Promise.all([
      linhas('sgcWintProdutoHistorico', { codprod, codfilial, meses: 13 }),
      linhas('sgcWintProdutoUltimasCompras', { codprod }),
      linhas('sgcWintProdutoEstoqueFiliais', { codprod }),
    ]).then(
      ([h, c, f]) => setCache((atual) => new Map(atual).set(codprod, {
        historico: h as unknown as PontoHistorico[], compras: c, filiais: f as unknown as PosicaoFilial[], pronto: true, erro: '',
      })),
      () => setCache((atual) => new Map(atual).set(codprod, { ...DADOS_VAZIOS, pronto: true, erro: 'Não foi possível carregar o detalhe deste produto.' })),
    ).finally(() => emCarga.current.delete(chaveSku));
  }, [ativo, cache, codprod, codfilial, chaveSku]);

  const dadosCarga = carga && carga.chave === chave ? carga.dados : null;
  const coberturas = dadosCarga?.coberturas;
  const alvoDaCurvaDias: AlvoDaCurva = React.useCallback(
    (alvo, curva) => limiteDeCobertura(coberturas ?? [], alvo, curva).alvoDias,
    [coberturas],
  );
  const linha = React.useMemo(() => {
    if (!dadosCarga?.medidas) return null;
    const todas = montarRessuprimento(
      dadosCarga.medidas, dadosCarga.parametros ?? [], alvoDaCurvaDias, dadosCarga.porCaixa ?? new Map(),
      { codfornec, hoje, desconsiderarLicitacao: semPublico, projecoes: projecoesAtivas(dadosCarga.projecoes ?? [], hoje) }, dadosCarga.custosPadrao,
    );
    return todas.find((l) => Number(l.medida.CODPROD) === codprod) ?? null;
  }, [dadosCarga, alvoDaCurvaDias, codfornec, hoje, semPublico, codprod]);

  const sku = cache.get(codprod);
  const dados = React.useMemo(() => {
    const d = sku ?? DADOS_VAZIOS;
    return semPublico ? { ...d, historico: historicoSemPublico(d.historico, true) } : d;
  }, [sku, semPublico]);
  const desconsideradas = React.useMemo(() => dadosCarga?.desconsideradas ?? [], [dadosCarga]);
  // Spec 019: a previsão leva o fator da projeção manual da linha (1 sem ajuste).
  const fator = linha?.fatorProjecao ?? 1;
  const previsao = React.useMemo(() => previsaoDoSku(sku, codprod, hoje, desconsideradas, semPublico, fator), [sku, codprod, hoje, desconsideradas, semPublico, fator]);
  const projetada = React.useMemo(() => projetadaDoSku(previsao, linha, modelo), [previsao, linha, modelo]);
  const sugestoes = React.useMemo(() => (linha
    ? sugestoesDaLinha(linha, oportunidadesDaLinha(linha, dadosCarga?.custosEspeciais ?? [], dadosCarga?.vendasClientes ?? []), previsao, modelo)
    : []), [linha, dadosCarga, previsao, modelo]);
  const excessos = React.useMemo(() => (linha
    ? excessosPorProduto(dadosCarga?.posicoesFiliais ?? [], [{ codprod, coberturaDias: linha.coberturaDias }], codfilial).get(codprod) ?? []
    : []), [linha, dadosCarga, codprod, codfilial]);
  const lotesDe = useLotesBloqueados(codfilial, recarga, linha ? [{ codprod, qtBloqueada: Number(linha.medida.QT_BLOQUEADA) || 0 }] : []);

  /* ── a aba Vendas escreve na origem (RN-012 da 011): a medida é refeita ── */
  const reler = React.useCallback(() => {
    setCache(new Map());
    setRecarga((n) => n + 1);
  }, []);
  const desconsiderar = React.useCallback(async (venda: { numtransitem: number; codprod: number; dtmov: string; quantidade: number; motivo: string }) => {
    await linhas('sgcEscVendaDesconsiderar', { ...venda, codfilial, em: instante() });
    reler();
  }, [codfilial, reler]);
  const reconsiderar = React.useCallback(async (numtransitem: number) => {
    await linhas('sgcEscVendaReconsiderar', { numtransitem });
    reler();
  }, [reler]);

  const erro = carga && carga.chave === chave ? carga.erro : '';
  return {
    linha, dados, previsao, projetada, sugestoes, excessos,
    lotes: lotesDe(codprod),
    desconsideradas, periodo, hoje,
    carregando: ativo && !linha && !erro && !(dadosCarga?.medidas),
    erro: erro || (dadosCarga?.medidas && !linha ? 'Este produto não está na análise deste fornecedor nesta filial.' : ''),
    desconsiderar, reconsiderar,
  };
}
