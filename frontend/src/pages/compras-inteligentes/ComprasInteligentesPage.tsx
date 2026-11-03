// Spec 011 (compras inteligentes) — `/compras-inteligentes`: o que comprar
// hoje, por fornecedor e filial, no layout legado do SGC anterior (R-117):
// cabeçalho com ações, barra de recorte, aviso de carrinho salvo, quatro cards
// de visão, lista à esquerda e painel de detalhe fixo à direita, carrinho em
// janela.
//
// Custo de execução (RNF-001, emendada em R-117 e R-120): abrir a tela custa 4
// chamadas (fornecedores, eficiência, quadro e o resumo por fornecedor);
// escolher o fornecedor custa 1 (filiais e pedido mínimo); escolher a filial
// custa 8 — cinco em paralelo (parâmetros, vendas desconsideradas, coberturas,
// pedido aberto e itens em pedido aberto), UMA `sgcWintRessuprimento` com a
// lista de vendas desconsideradas em mãos e, com os produtos em mãos, UMA
// `sgcCustoUnidadesPorCaixa` (lotes de 1000 códigos: 300 produtos = 1
// execução). Selecionar um produto custa 3, uma vez por produto (cache). Nada
// por linha.
//
// Filtrar, ordenar, trocar de visão, ligar o seletor de licitação e alternar
// Unidades/Caixas não custam nenhuma execução (RNF-005): a fórmula é
// recalculada na tela por `montarRessuprimento`, que é regra pura (R-083).
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useKanban } from '@benenutri/mitra-kanban';

import {
  Alert, AlternaOpcoes, Button, CardVisao, EmptyState, GradeVisoes, PageHeader, Panel, SelectMenu,
} from '@/components/page';
import { acao, linha as umaLinha, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { QUADRO_COMPRAS } from '@/lib/quadro';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { fmtDataHora, hojeIso, moeda } from '@/lib/formato';
import { limiteDeCobertura } from '@/lib/cobertura';
import type { Cobertura } from '@/lib/cobertura';
import {
  COLUNAS_CSV, FILTROS_INICIAIS, ROTULO_VISAO, alternarSilenciados, contarVisoes, escolherVisao, filtrarMovimentacao, linhaCsv, linhasDaVisao,
  montarRessuprimento, motivoDaSugestao, ordenarLinhas, parametroDeLinha, chaveDaEntrada,
} from '@/lib/ressuprimento';
import type {
  AlvoDaCurva, FiltrosLista, LinhaRessuprimento, MedidaRessuprimento, ParametroCompra, ReferenciaSugestao,
  VisaoRessuprimento,
} from '@/lib/ressuprimento';
import { CHAVE_CARRINHO, carrinhoDeTexto, resumoDoCarrinho, textoDoCarrinho } from '@/lib/carrinho';
import type { CarrinhoSalvo, ItemCarrinho } from '@/lib/carrinho';
import { DADOS_VAZIOS, historicoSemPublico } from '@/lib/ressuprimento-detalhe';
import { oportunidadesDaLinha, previsaoDoSku, projetadaDoSku, sugestoesDaLinha } from '@/lib/analise-sku';
import { seloEspecial } from '@/lib/custo-especial';
import { AVISO_ERRO_CUSTO } from '@/lib/custo-padrao-carga';
import { contarAvisos, excessosPorProduto, filtrarPorAvisos } from '@/lib/avisos-produto';
import type { PosicaoOutraFilial } from '@/lib/avisos-produto';
import { useLotesBloqueados } from './use-lotes-bloqueados';
import { carregarRessuprimento, janelaDeHoje } from './carga-ressuprimento';
import { CHAVE_LARGURA, larguraDe, larguraEfetiva, proximaLargura } from '@/lib/largura-painel';
import type { LarguraPainel } from '@/lib/largura-painel';
import type { MapaCustoPadrao } from '@/lib/compras';
import type { CustoEspecial, Oportunidade, SugestaoCliente, TabelaEspecial, VendaCliente } from '@/lib/custo-especial';
import type { ModeloPrevisao, Previsao, SugestaoProjetada } from '@/lib/previsao';
import type { DadosDoSku, PontoHistorico, PosicaoFilial, VendaDesconsiderada } from '@/lib/ressuprimento-detalhe';
import { ListaProdutos } from './grid';
import type { PedidoAbertoDoItem } from './grid';
import { CarrinhoDialogo } from './Carrinho';
import type { PedidoAberto } from './Carrinho';
import { PainelDetalhe } from './painel-detalhe';
import { ParametrosDialogo, SilenciarDialogo, VendasDialogo } from './dialogos';
import { AnaliseProdutoDialogo } from './analise-produto';
import type { AlvoParametro } from './dialogos';

interface Opcao { value: string; label: string; hint?: string }
interface ResumoFornecedor { itens: number; valorSugerido: number }

const VISOES: VisaoRessuprimento[] = ['comprar', 'completar', 'todos', 'transito'];
const REFERENCIAS: { value: ReferenciaSugestao; label: string }[] = [
  { value: 'unidades', label: 'Unidades' }, { value: 'caixas', label: 'Caixas' },
];
const DIAS_RESUMO = 90;

/** R-129: as quatro larguras do painel de detalhe — classes fixas, a lista fica com o resto. */
const COLUNAS_POR_LARGURA: Record<LarguraPainel, string> = {
  estreito: 'lg:grid-cols-[minmax(0,1fr)_380px]',
  medio: 'lg:grid-cols-[minmax(0,1fr)_480px]',
  largo: 'lg:grid-cols-[minmax(0,1fr)_620px]',
  metade: 'lg:grid-cols-2',
};


function haDias(dias: number) {
  const data = new Date(`${hojeIso()}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

const agoraCurto = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const instante = () => new Date().toISOString().slice(0, 19);

/** `localStorage` pode não existir (navegação privada, bloqueio): a tela vive sem ele. */
function lerGuardado(chave: string): string | null {
  try { return window.localStorage.getItem(chave); } catch { return null; }
}
function guardar(chave: string, texto: string | null) {
  try {
    if (texto === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, texto);
  } catch { /* sem armazenamento, sem retomada — o carrinho continua na memória */ }
}

export default function ComprasInteligentesPage() {
  const navigate = useNavigate();
  const api = useKanban();
  const sessao = usePersona();
  const periodo = React.useMemo(() => janelaDeHoje(hojeIso()), []);
  const hoje = periodo.fim;

  const [fornecedores, setFornecedores] = React.useState<Opcao[]>([]);
  const [resumos, setResumos] = React.useState<Map<number, ResumoFornecedor>>(() => new Map());
  const [filiais, setFiliais] = React.useState<Opcao[]>([]);
  const [pedidoMinimo, setPedidoMinimo] = React.useState(0);
  const [codfornec, setCodfornec] = React.useState('');
  const [codfilial, setCodfilial] = React.useState('');
  const [boardId, setBoardId] = React.useState(0);

  const [medidas, setMedidas] = React.useState<MedidaRessuprimento[]>([]);
  const [porCaixa, setPorCaixa] = React.useState<Map<number, number>>(() => new Map());
  // R-128: o custo de compra é o custo padrão do Gestão de Custos; `null` = a consulta falhou.
  const [custosPadrao, setCustosPadrao] = React.useState<MapaCustoPadrao | null | undefined>(undefined);
  // R-130: a posição das outras filiais (uma vez por carga); `null` = falhou, a lista fica sem o selo.
  const [posicoesFiliais, setPosicoesFiliais] = React.useState<PosicaoOutraFilial[] | null>([]);
  // R-125: as políticas de preço especial e a venda por cliente, uma carga por filial.
  const [custosEspeciais, setCustosEspeciais] = React.useState<CustoEspecial[]>([]);
  const [vendasClientes, setVendasClientes] = React.useState<VendaCliente[]>([]);
  const [parametros, setParametros] = React.useState<ParametroCompra[]>([]);
  const [coberturas, setCoberturas] = React.useState<Cobertura[]>([]);
  const [desconsideradas, setDesconsideradas] = React.useState<VendaDesconsiderada[]>([]);
  const [pedidoAberto, setPedidoAberto] = React.useState<PedidoAberto | null>(null);
  const [emPedidoAberto, setEmPedidoAberto] = React.useState<Map<number, PedidoAbertoDoItem>>(() => new Map());

  // R-131: a venda a órgão público fica FORA por padrão (seletor marcado); desmarcar mostra com ela.
  const [desconsiderarLicitacao, setDesconsiderarLicitacao] = React.useState(true);
  const [referencia, setReferencia] = React.useState<ReferenciaSugestao>('unidades');
  const [visao, setVisao] = React.useState<VisaoRessuprimento>('comprar');
  // C-012: a visão de onde o chip "Silenciados" saiu, para voltar ao desligar.
  const [visaoAnterior, setVisaoAnterior] = React.useState<VisaoRessuprimento>('comprar');
  const [filtros, setFiltros] = React.useState<FiltrosLista>(FILTROS_INICIAIS);

  /** C-012: visão e filtro de silenciados mudam juntos (regra pura `alternarSilenciados` / `escolherVisao`). */
  function aplicarRecorte(proximo: { visao: VisaoRessuprimento; soSilenciados: boolean; visaoAnterior: VisaoRessuprimento }) {
    setVisao(proximo.visao);
    setVisaoAnterior(proximo.visaoAnterior);
    setFiltros((atual) => ({ ...atual, soSilenciados: proximo.soSilenciados }));
  }
  const [busca, setBusca] = React.useState('');
  const [quantidades, setQuantidades] = React.useState<Record<number, number>>({});
  const [selecionado, setSelecionado] = React.useState(0);
  const [cacheSku, setCacheSku] = React.useState<Map<number, DadosDoSku>>(() => new Map());

  const [carrinho, setCarrinho] = React.useState<ItemCarrinho[]>([]);
  const [carrinhoMeta, setCarrinhoMeta] = React.useState({ abertoEm: '', abertoPor: '', salvoEm: '' });
  const [carrinhoSalvo, setCarrinhoSalvo] = React.useState<CarrinhoSalvo | null>(null);
  const [armazenamentoLido, setArmazenamentoLido] = React.useState(0);
  const [carrinhoAberto, setCarrinhoAberto] = React.useState(false);
  const [confirmandoDescarte, setConfirmandoDescarte] = React.useState(false);
  const [avisoCarrinho, setAvisoCarrinho] = React.useState('');

  const [detalheCompleto, setDetalheCompleto] = React.useState<LinhaRessuprimento | null>(null);
  const [silenciando, setSilenciando] = React.useState<LinhaRessuprimento | null>(null);
  const [vendasDe, setVendasDe] = React.useState<LinhaRessuprimento | null>(null);
  const [parametroAlvo, setParametroAlvo] = React.useState<AlvoParametro | null>(null);

  const [carregando, setCarregando] = React.useState(false);
  const [recarga, setRecarga] = React.useState(0);
  const [erro, setErro] = React.useState('');
  const [salvoEm, setSalvoEm] = React.useState('');

  /* ── carga da página: fornecedores + eficiência + quadro (3 execuções) ── */
  React.useEffect(() => {
    let vivo = true;
    Promise.all([
      linhas('sgcFornecedorListar', { busca: '', ativo: 1, limite: 200, offset: 0 }),
      umaLinha('sgcEficienciaComprador', { compradorId: 0, codfornec: 0, dataInicio: '', dataFim: '' }),
      // O board vem aqui e não no carrinho: o id é o mesmo para todos os
      // grupos, e assim "criar pedido" custa 3 execuções por grupo, não 4.
      api.boardCarregar({ slug: QUADRO_COMPRAS }).catch(() => null),
    ]).then(([registros, , quadro]) => {
      if (!vivo) return;
      setFornecedores(registros.map((r) => ({
        value: String(r.CODFORNEC), label: `${r.CODFORNEC} — ${String(r.FORNECEDOR ?? '')}`, hint: String(r.CNPJ_FORMATADO ?? ''),
      })));
      setBoardId(Number(quadro?.board?.id ?? 0));
    }, () => vivo && setErro('Não foi possível carregar os fornecedores.'));
    return () => { vivo = false; };
  }, [api]);

  /* ── o resumo por fornecedor do rótulo do seletor (1 execução, C-036) ── */
  React.useEffect(() => {
    if (fornecedores.length === 0) return;
    let vivo = true;
    linhas('sgcWintResumoFornecedores', {
      codfornecs: fornecedores.map((f) => Number(f.value)).filter((n) => n > 0).join(', ') || '0',
      dataInicio: haDias(DIAS_RESUMO - 1), diasPeriodo: DIAS_RESUMO,
    }).then(
      (rows) => vivo && setResumos(new Map(rows.map((r) => [Number(r.CODFORNEC), {
        itens: Number(r.ITENS ?? 0), valorSugerido: Number(r.VALOR_SUGERIDO ?? 0),
      }]))),
      () => undefined, // sem resumo, o rótulo fica só com o nome: é estimativa, não trava a tela
    );
    return () => { vivo = false; };
  }, [fornecedores]);

  /* ── fornecedor escolhido: as filiais que ele atende e o pedido mínimo (1 execução) ── */
  React.useEffect(() => {
    if (!codfornec) return;
    let vivo = true;
    acao('sgcFornecedorCarregar', { codfornec: Number(codfornec) }).then(
      (dados) => {
        if (!vivo) return;
        const registros: Record<string, unknown>[] = Array.isArray(dados.filiais) ? dados.filiais : [];
        setFiliais(registros
          .filter((r) => r.CODFILIAL !== undefined && r.CODFILIAL !== null)
          .map((r) => ({ value: String(r.CODFILIAL), label: `${r.CODFILIAL} — ${String(r.FILIAL ?? r.CODFILIAL)}` })));
        const capa = (dados.fornecedor ?? {}) as Record<string, unknown>;
        setPedidoMinimo(Number(capa.PEDIDO_MINIMO ?? 0) || 0);
      },
      () => vivo && setFiliais([]),
    );
    return () => { vivo = false; };
  }, [codfornec]);

  /**
   * A carga pesada: 5 leituras em paralelo e, com o que voltou, UMA ao ERP —
   * as 7 execuções da troca de filial. `recarga` é o que "Atualizar" e a
   * escrita de venda incrementam para a medida ser refeita.
   */
  React.useEffect(() => {
    if (!codfornec || !codfilial) return;
    let vivo = true;
    const recorte = { codfornec: Number(codfornec), codfilial };
    // R-133: a carga mora em `carga-ressuprimento.ts` (a Análise do Produto do pedido usa a mesma).
    carregarRessuprimento(recorte, { inicio: periodo.inicio, fim: periodo.fim }, (parte) => {
      if (parte.parametros) setParametros(parte.parametros);
      if (parte.coberturas) setCoberturas(parte.coberturas);
      if (parte.desconsideradas) setDesconsideradas(parte.desconsideradas);
      if ('pedidoAberto' in parte) setPedidoAberto(parte.pedidoAberto ?? null);
      if (parte.emPedidoAberto) setEmPedidoAberto(parte.emPedidoAberto);
      if (parte.medidas) {
        setMedidas(parte.medidas);
        setQuantidades({});
        setErro('');
      }
      if (parte.porCaixa) setPorCaixa(parte.porCaixa);
      if ('custosPadrao' in parte) setCustosPadrao(parte.custosPadrao ?? null);
      if ('posicoesFiliais' in parte) setPosicoesFiliais(parte.posicoesFiliais ?? null);
      if (parte.custosEspeciais) setCustosEspeciais(parte.custosEspeciais);
      if (parte.vendasClientes) setVendasClientes(parte.vendasClientes);
    }, () => vivo)
      .catch(() => {
        if (!vivo) return;
        setErro('Não foi possível carregar a lista deste fornecedor nesta filial.');
        setMedidas([]);
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [codfornec, codfilial, periodo.inicio, periodo.fim, recarga]);

  /* ── o carrinho salvo no navegador (RN-021): lido uma vez por usuário ── */
  const usuarioId = sessao?.usuarioId ?? 0;
  // R-129: a largura do painel, por usuário no navegador (conveniência: sem ele, Médio).
  const [largura, setLargura] = React.useState<LarguraPainel>('medio');
  const [larguraLida, setLarguraLida] = React.useState(0);
  if (usuarioId && larguraLida !== usuarioId) {
    setLarguraLida(usuarioId);
    let guardada: string | null = null;
    try { guardada = window.localStorage.getItem(CHAVE_LARGURA(usuarioId)); } catch { /* sem armazenamento */ }
    setLargura(larguraDe(guardada));
  }
  // A largura de fato nunca deixa a lista com menos de 640 px: a grade é medida (iframe e zoom contam).
  const [larguraGrade, setLarguraGrade] = React.useState(0);
  const observadorGrade = React.useRef<ResizeObserver | null>(null);
  const refGrade = React.useCallback((no: HTMLDivElement | null) => {
    observadorGrade.current?.disconnect();
    if (!no || typeof ResizeObserver === 'undefined') return;
    observadorGrade.current = new ResizeObserver(([e]) => setLarguraGrade(Math.round(e.contentRect.width)));
    observadorGrade.current.observe(no);
  }, []);
  const larguraUsada = larguraEfetiva(largura, larguraGrade);
  const podeAlargar = larguraEfetiva(proximaLargura(larguraUsada, 1), larguraGrade) !== larguraUsada;
  const mudarLargura = React.useCallback((passo: 1 | -1) => setLargura((atual) => {
    const proxima = proximaLargura(larguraEfetiva(atual, larguraGrade), passo);
    try { window.localStorage.setItem(CHAVE_LARGURA(usuarioId), proxima); } catch { /* conveniência */ }
    return proxima;
  }), [usuarioId, larguraGrade]);
  // Alt+← alarga e Alt+→ estreita o painel (que está à direita).
  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      mudarLargura(e.key === 'ArrowLeft' ? 1 : -1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [mudarLargura]);
  // Ajuste de estado durante a renderização, não em efeito: a leitura é
  // síncrona e idempotente, e acontece uma vez por usuário.
  if (usuarioId && armazenamentoLido !== usuarioId) {
    setArmazenamentoLido(usuarioId);
    setCarrinhoSalvo(carrinhoDeTexto(lerGuardado(CHAVE_CARRINHO(usuarioId))));
  }

  // Toda mudança do carrinho carimba a hora de salvamento junto (é ela que o
  // cabeçalho do carrinho mostra); o efeito abaixo só espelha no navegador.
  const mudarCarrinho = React.useCallback((mudanca: (atual: ItemCarrinho[]) => ItemCarrinho[]) => {
    setCarrinho(mudanca);
    setCarrinhoMeta((meta) => ({ ...meta, salvoEm: instante() }));
  }, []);

  React.useEffect(() => {
    if (!usuarioId || armazenamentoLido !== usuarioId) return;
    if (carrinho.length === 0) {
      if (!carrinhoSalvo) guardar(CHAVE_CARRINHO(usuarioId), null);
      return;
    }
    guardar(CHAVE_CARRINHO(usuarioId), textoDoCarrinho({
      versao: 1, abertoEm: carrinhoMeta.abertoEm, abertoPor: carrinhoMeta.abertoPor, salvoEm: carrinhoMeta.salvoEm, itens: carrinho,
    }));
  }, [carrinho, carrinhoMeta, usuarioId, armazenamentoLido, carrinhoSalvo]);

  /**
   * O alvo de cobertura por curva (R-089). Constante única: é a ÚNICA linha
   * desta tela que conhece a 012.
   */
  const alvoDaCurvaDias: AlvoDaCurva = React.useCallback(
    (alvo, curva) => limiteDeCobertura(coberturas, alvo, curva).alvoDias,
    [coberturas],
  );

  /** O teto sem justificativa que viaja com o item do carrinho (R-112). */
  const coberturaLimiteDe = React.useCallback((l: LinhaRessuprimento) => limiteDeCobertura(coberturas, {
    codprod: Number(l.medida.CODPROD), codsec: Number(l.medida.CODSEC),
    codepto: Number(l.medida.CODEPTO), codfornec: Number(codfornec),
  }, l.curva).limiteDias, [coberturas, codfornec]);

  // R-120: o mapa de unidades por caixa vem do Gestão de Custos (uma execução
  // por carga); o que não está lá cai no cadastro do ERP e na embalagem — a
  // cadeia de RN-002 da 003, e a origem fica na linha para o painel mostrar.
  const todas = React.useMemo(() => montarRessuprimento(
    medidas, parametros, alvoDaCurvaDias, porCaixa,
    { codfornec: Number(codfornec), hoje, desconsiderarLicitacao }, custosPadrao,
  ), [medidas, parametros, alvoDaCurvaDias, porCaixa, codfornec, hoje, desconsiderarLicitacao, custosPadrao]);

  const contagens = React.useMemo(() => contarVisoes(todas), [todas]);
  // R-130 (RN-037): o excesso de cada produto pela regra da seção, com a cobertura alvo dele.
  const excessos = React.useMemo(() => excessosPorProduto(posicoesFiliais ?? [],
    todas.map((l) => ({ codprod: Number(l.medida.CODPROD), coberturaDias: l.coberturaDias })), codfilial), [posicoesFiliais, todas, codfilial]);
  const avisoDe = React.useCallback((l: LinhaRessuprimento) => ({ codprod: Number(l.medida.CODPROD), qtBloqueada: Number(l.medida.QT_BLOQUEADA) || 0 }), []);
  const contagemAvisos = React.useMemo(() => contarAvisos(linhasDaVisao(todas, visao), excessos, avisoDe), [todas, visao, excessos, avisoDe]);

  const termo = busca.trim().toLowerCase();
  const lista = React.useMemo(() => {
    let recorte = linhasDaVisao(todas, visao);
    if (filtros.soSilenciados) recorte = recorte.filter((l) => l.silenciado);
    recorte = filtrarPorAvisos(recorte, filtros, excessos, avisoDe);
    if (filtros.situacao !== '') recorte = recorte.filter((l) => l.status === filtros.situacao);
    recorte = filtrarMovimentacao(recorte, filtros.movimentacao);
    if (termo !== '') {
      recorte = recorte.filter((l) => String(l.medida.DESCRICAO).toLowerCase().includes(termo)
        || String(l.medida.CODPROD).includes(termo) || String(l.medida.CODFAB ?? '').toLowerCase().includes(termo));
    }
    return ordenarLinhas(recorte, filtros.ordem);
  }, [todas, visao, filtros, termo, excessos, avisoDe]);

  const sugestaoTotal = React.useMemo(
    () => lista.reduce((soma, l) => soma + l.sugerida * Number(l.custo?.valor ?? 0), 0),
    [lista],
  );

  // C-031: o primeiro item é selecionado ao carregar, e a seleção segue a lista.
  const linhaSelecionada = React.useMemo(
    () => lista.find((l) => Number(l.medida.CODPROD) === selecionado) ?? lista[0] ?? null,
    [lista, selecionado],
  );
  const codprodSelecionado = linhaSelecionada ? Number(linhaSelecionada.medida.CODPROD) : 0;

  /* ── R-124: a previsão por modelo, só para o produto aberto (painel e janela) ── */
  const [modeloPrevisao, setModeloPrevisao] = React.useState<ModeloPrevisao>('bestfit');
  const previsaoDe = React.useCallback(
    (codprod: number): Previsao | null => previsaoDoSku(cacheSku.get(codprod), codprod, hoje, desconsideradas, desconsiderarLicitacao),
    [cacheSku, hoje, desconsideradas, desconsiderarLicitacao],
  );
  // R-131: o gráfico e os totais do painel e da janela contam a mesma venda da lista.
  const dadosDe = React.useCallback((codprod: number): DadosDoSku => {
    const dadosSku = cacheSku.get(codprod) ?? DADOS_VAZIOS;
    return desconsiderarLicitacao ? { ...dadosSku, historico: historicoSemPublico(dadosSku.historico, true) } : dadosSku;
  }, [cacheSku, desconsiderarLicitacao]);
  const dadosSelecionado = React.useMemo(() => dadosDe(codprodSelecionado), [dadosDe, codprodSelecionado]);
  const dadosDetalhe = React.useMemo(() => (detalheCompleto ? dadosDe(Number(detalheCompleto.medida.CODPROD)) : DADOS_VAZIOS), [dadosDe, detalheCompleto]);
  const projetar = React.useCallback(
    (previsao: Previsao | null, linha: LinhaRessuprimento | null): SugestaoProjetada | null => projetadaDoSku(previsao, linha, modeloPrevisao),
    [modeloPrevisao],
  );
  const previsaoSelecionada = React.useMemo(() => previsaoDe(codprodSelecionado), [previsaoDe, codprodSelecionado]);
  const projetadaSelecionada = React.useMemo(() => projetar(previsaoSelecionada, linhaSelecionada), [projetar, previsaoSelecionada, linhaSelecionada]);
  const codprodDetalhe = detalheCompleto ? Number(detalheCompleto.medida.CODPROD) : 0;
  const linhaDetalhe = React.useMemo(
    () => (detalheCompleto ? todas.find((l) => Number(l.medida.CODPROD) === codprodDetalhe) ?? detalheCompleto : null),
    [detalheCompleto, todas, codprodDetalhe],
  );
  // R-130: os lotes bloqueados só do produto aberto (painel e janela) e só com bloqueio.
  const lotesDe = useLotesBloqueados(codfilial, recarga, [linhaSelecionada, linhaDetalhe]
    .filter((l): l is LinhaRessuprimento => Boolean(l)).map(avisoDe));
  const previsaoDetalhe = React.useMemo(() => previsaoDe(codprodDetalhe), [previsaoDe, codprodDetalhe]);
  const projetadaDetalhe = React.useMemo(() => projetar(previsaoDetalhe, linhaDetalhe), [projetar, previsaoDetalhe, linhaDetalhe]);

  /* ── R-125: as oportunidades com custo especial (selo em toda linha; sugestões no produto aberto) ── */
  const oportunidadesPorProduto = React.useMemo(() => {
    const mapa = new Map<number, Oportunidade[]>();
    if (custosEspeciais.length === 0) return mapa;
    for (const l of todas) {
      const lista = oportunidadesDaLinha(l, custosEspeciais, vendasClientes);
      if (lista.length > 0) mapa.set(Number(l.medida.CODPROD), lista);
    }
    return mapa;
  }, [todas, custosEspeciais, vendasClientes]);
  const selosEspeciais = React.useMemo(() => {
    const mapa = new Map<number, { texto: string; tone: 'accent' | 'attention' }>();
    for (const [codprod, lista] of oportunidadesPorProduto) {
      const selo = seloEspecial(lista);
      if (selo) mapa.set(codprod, selo);
    }
    return mapa;
  }, [oportunidadesPorProduto]);
  const sugestoesDe = React.useCallback(
    (linha: LinhaRessuprimento | null, previsao: Previsao | null): SugestaoCliente[] => (
      linha ? sugestoesDaLinha(linha, oportunidadesPorProduto.get(Number(linha.medida.CODPROD)) ?? [], previsao, modeloPrevisao) : []
    ),
    [oportunidadesPorProduto, modeloPrevisao],
  );
  const sugestoesSelecionada = React.useMemo(() => sugestoesDe(linhaSelecionada, previsaoSelecionada), [sugestoesDe, linhaSelecionada, previsaoSelecionada]);
  const sugestoesDetalhe = React.useMemo(() => sugestoesDe(linhaDetalhe, previsaoDetalhe), [sugestoesDe, linhaDetalhe, previsaoDetalhe]);

  /* ── o detalhe do SKU: 3 execuções, uma vez por produto (cache) ── */
  // As cargas em andamento ficam num ref, não no estado: o efeito só dispara a
  // consulta e grava o resultado quando ele volta.
  const emCarga = React.useRef(new Set<number>());
  React.useEffect(() => {
    if (!codprodSelecionado || !codfilial || cacheSku.has(codprodSelecionado) || emCarga.current.has(codprodSelecionado)) return;
    const codprod = codprodSelecionado;
    const cargas = emCarga.current;
    cargas.add(codprod);
    Promise.all([
      linhas('sgcWintProdutoHistorico', { codprod, codfilial, meses: 13 }),
      linhas('sgcWintProdutoUltimasCompras', { codprod }),
      linhas('sgcWintProdutoEstoqueFiliais', { codprod }),
    ]).then(
      ([h, c, f]) => setCacheSku((atual) => new Map(atual).set(codprod, {
        historico: h as unknown as PontoHistorico[], compras: c, filiais: f as unknown as PosicaoFilial[], pronto: true, erro: '',
      })),
      () => setCacheSku((atual) => new Map(atual).set(codprod, { ...DADOS_VAZIOS, pronto: true, erro: 'Não foi possível carregar o detalhe deste produto.' })),
    ).finally(() => { cargas.delete(codprod); });
  }, [codprodSelecionado, codfilial, cacheSku]);

  const permissoes = sessao?.permissoes;
  const podeOperar = Boolean(permissoes?.operarComprasInteligentes);
  const podeParametrizar = Boolean(permissoes?.parametrizarCompras);
  const motivoBloqueio = permissoes?.somenteLeitura
    ? 'Seu acesso é somente leitura.'
    : 'Seu perfil não opera as compras inteligentes.';

  /* ── escritas: gravar e RELER o que o banco devolveu (D-03) ── */

  async function comRecarga(chamada: Promise<unknown>, relerMedidas = false) {
    await chamada;
    if (relerMedidas) {
      // A exclusão acontece na origem (RN-012): a medida do ERP precisa ser refeita.
      setCarregando(true);
      setRecarga((n) => n + 1);
    } else {
      const rows = await linhas('sgcParametrosCompraListar', {
        codfornec: Number(codfornec), codfilial, limite: 600, offset: 0,
      });
      setParametros(rows.map(parametroDeLinha));
    }
    setSalvoEm(agoraCurto());
  }

  const salvarParametro = (valores: { codprod: number; coberturaDias: number; leadTimeDias: number; gatilhoDias: number }) =>
    comRecarga(linhas('sgcEscParametroCompraSalvar', { codfornec: Number(codfornec), codfilial, ...valores, atualizadoEm: instante() }));

  const silenciar = (valores: { codprod: number; silenciadoAte: string; motivo: string }) =>
    comRecarga(linhas('sgcEscParametroCompraSilenciar', { codfornec: Number(codfornec), codfilial, ...valores, atualizadoEm: instante() }));

  const restaurar = (l: LinhaRessuprimento) =>
    comRecarga(linhas('sgcEscParametroCompraRestaurar', {
      codfornec: Number(codfornec), codfilial, codprod: Number(l.medida.CODPROD), atualizadoEm: instante(),
    }));

  const desconsiderarVenda = (venda: { numtransitem: number; codprod: number; dtmov: string; quantidade: number; motivo: string }) =>
    comRecarga(linhas('sgcEscVendaDesconsiderar', { ...venda, codfilial, em: instante() }), true);

  const reconsiderarVenda = (numtransitem: number) =>
    comRecarga(linhas('sgcEscVendaReconsiderar', { numtransitem }), true);

  /* ── carrinho ── */

  const semCodigo = (rotulo: string) => rotulo.replace(/^\S+ — /, '');
  const nomeFornecedor = semCodigo(fornecedores.find((f) => f.value === codfornec)?.label ?? '');
  const nomeFilial = semCodigo(filiais.find((f) => f.value === codfilial)?.label ?? '');

  function adicionar(l: LinhaRessuprimento, quantidade: number) {
    const codprod = Number(l.medida.CODPROD);
    if (pedidoAberto) {
      setAvisoCarrinho(`Já existe um pedido aberto para este fornecedor e filial (${pedidoAberto.titulo}). Envie ou cancele esse pedido antes de abrir outro.`);
      return;
    }
    if (quantidade <= 0) return;
    setAvisoCarrinho('');
    if (!carrinhoMeta.abertoEm) setCarrinhoMeta({ abertoEm: instante(), abertoPor: sessao?.nome ?? '', salvoEm: '' });
    mudarCarrinho((atual) => [
      ...atual.filter((e) => e.especial || Number(e.linha.medida.CODPROD) !== codprod || e.codfilial !== codfilial),
      {
        linha: l, quantidade, codfornec: Number(codfornec), codfilial,
        fornecedor: nomeFornecedor, filial: nomeFilial,
        motivo: l.sugerida > 0 ? motivoDaSugestao(l) : 'Completar a compra para o pedido mínimo',
        pedidoMinimo,
      },
    ]);
  }

  /** R-125: a linha especial do carrinho — uma por produto, política e custo; o custo da política substitui o do item. */
  function adicionarEspecial(l: LinhaRessuprimento, tabela: TabelaEspecial, quantidade: number) {
    if (pedidoAberto) {
      setAvisoCarrinho(`Já existe um pedido aberto para este fornecedor e filial (${pedidoAberto.titulo}). Envie ou cancele esse pedido antes de abrir outro.`);
      return;
    }
    if (quantidade <= 0) return;
    setAvisoCarrinho('');
    if (!carrinhoMeta.abertoEm) setCarrinhoMeta({ abertoEm: instante(), abertoPor: sessao?.nome ?? '', salvoEm: '' });
    const especial = { politicaId: tabela.politicaId, politicaNome: tabela.politicaNome, custo: tabela.custoEspecial };
    const chave = chaveDaEntrada({ linha: l, codfilial, especial });
    mudarCarrinho((atual) => [
      ...atual.filter((e) => chaveDaEntrada(e) !== chave),
      {
        linha: l, quantidade, codfornec: Number(codfornec), codfilial,
        fornecedor: nomeFornecedor, filial: nomeFilial, especial,
        motivo: `Preço especial · ${tabela.politicaNome || `política ${tabela.politicaId}`}`,
        pedidoMinimo,
      },
    ]);
  }

  const alterarItem = (chave: string, mudanca: Partial<ItemCarrinho>) => mudarCarrinho((atual) => atual.map(
    (e) => (chaveDaEntrada(e) === chave ? { ...e, ...mudanca } : e),
  ));

  function descartarCarrinho() {
    setCarrinho([]);
    setCarrinhoMeta({ abertoEm: '', abertoPor: '', salvoEm: '' });
    setCarrinhoSalvo(null);
    setConfirmandoDescarte(false);
    if (usuarioId) guardar(CHAVE_CARRINHO(usuarioId), null);
  }

  function continuarCarrinho() {
    if (!carrinhoSalvo) return;
    setCarrinho(carrinhoSalvo.itens);
    setCarrinhoMeta({ abertoEm: carrinhoSalvo.abertoEm, abertoPor: carrinhoSalvo.abertoPor, salvoEm: carrinhoSalvo.salvoEm });
    setCarrinhoSalvo(null);
  }

  function atualizar() {
    setCarregando(true);
    setErro('');
    emCarga.current.clear();
    setCacheSku(new Map());
    setRecarga((n) => n + 1);
  }

  function exportar() {
    baixarCsv(`compras-inteligentes-${periodo.fim}.csv`, textoCsv(COLUNAS_CSV, lista.map(linhaCsv)));
  }

  const abrirParametros = (l: LinhaRessuprimento | null) => {
    const codprod = l ? Number(l.medida.CODPROD) : 0;
    const atual = parametros.find((p) => p.codprod === codprod);
    setParametroAlvo({
      codprod,
      titulo: l ? `Parâmetros de ${l.medida.DESCRICAO}` : 'Parâmetros deste fornecedor',
      coberturaDias: atual?.coberturaDias ?? 0, leadTimeDias: atual?.leadTimeDias ?? 0, gatilhoDias: atual?.gatilhoDias ?? 0,
    });
  };

  if (!sessao) return <EmptyState title="Carregando..." />;

  if (!sessao.permissoes.verComprasInteligentes) {
    return (
      <>
        <PageHeader module="Compras" title="Compras inteligentes" />
        <Alert tone="error">Seu perfil não tem acesso às compras inteligentes.</Alert>
      </>
    );
  }

  const resumoSalvo = carrinhoSalvo ? resumoDoCarrinho(carrinhoSalvo.itens) : null;
  // R-128: as entradas da filial aberta usam a linha de AGORA (o custo padrão de agora, inclusive no
  // carrinho salvo antes dele); as de outras filiais ficam como foram guardadas.
  // Depois do retorno antecipado da página: cálculo simples, sem hook.
  const carrinhoAtualizado = (() => {
    if (todas.length === 0) return carrinho;
    const agora = new Map(todas.map((l) => [Number(l.medida.CODPROD), l]));
    return carrinho.map((e) => (e.codfilial === codfilial && Number(e.codfornec) === Number(codfornec) && agora.has(Number(e.linha.medida.CODPROD))
      ? { ...e, linha: agora.get(Number(e.linha.medida.CODPROD)) ?? e.linha } : e));
  })();
  const resumoCarrinho = resumoDoCarrinho(carrinhoAtualizado);
  const opcoesFornecedor: Opcao[] = fornecedores.map((f) => {
    const resumo = resumos.get(Number(f.value));
    return resumo
      ? { ...f, hint: `${resumo.itens} ${resumo.itens === 1 ? 'item' : 'itens'} · ${moeda(resumo.valorSugerido)}` }
      : f;
  });

  return (
    <div className="flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      {/* Cabeçalho compacto (pedido do usuário em 2026-10-30): uma linha só —
          fornecedor e filial à esquerda, as ações à direita; sem título nem
          descrição. A busca e o seletor de órgãos públicos ficam na lista. */}
      <div className="flex flex-wrap items-center gap-3">
        <SelectMenu
          label="Fornecedor"
          value={codfornec}
          onChange={(valor) => {
            setCodfornec(valor);
            setCodfilial('');
            setFiliais([]);
            setMedidas([]);
            setSelecionado(0);
            setCarregando(false);
          }}
          options={opcoesFornecedor}
          placeholder={fornecedores.length ? 'Escolha o fornecedor' : 'Nenhum fornecedor ativo'}
          disabled={!fornecedores.length}
          className="w-72 xl:w-80"
        />
        <SelectMenu
          label="Filial"
          value={codfilial}
          onChange={(valor) => { setCarregando(true); setErro(''); setAvisoCarrinho(''); setSelecionado(0); setCodfilial(valor); }}
          options={filiais}
          placeholder={codfornec ? 'Escolha a filial' : 'Escolha o fornecedor primeiro'}
          disabled={!codfornec || !filiais.length}
          className="w-60 xl:w-72"
        />
        {salvoEm ? <span className="text-[12px] text-ink-secondary">Salvo às {salvoEm}</span> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AlternaOpcoes rotulo="Referência da sugestão" opcoes={REFERENCIAS} valor={referencia} onValor={setReferencia} />
          <Button
            onClick={() => abrirParametros(null)}
            disabled={!podeParametrizar || !codfilial}
            title={podeParametrizar ? `Cobertura, lead time e gatilho do fornecedor na filial` : motivoBloqueio}
          >
            <SlidersHorizontal aria-hidden />
            Configurar fornecedor
          </Button>
          <Button onClick={() => navigate('/coberturas')}>Coberturas ABC</Button>
          <Button variant="primary" onClick={atualizar} disabled={!codfilial || carregando} title={`Janela de ${periodo.inicio} a ${periodo.fim}`}>
            <RefreshCw aria-hidden />
            Atualizar
          </Button>
        </div>
      </div>

      {erro ? <Alert tone="error" className="mt-4">{erro}</Alert> : null}
      {medidas.length > 0 && custosPadrao === null ? <Alert tone="error" className="mt-4">{AVISO_ERRO_CUSTO}</Alert> : null}
      {avisoCarrinho ? <Alert tone="warn" className="mt-4">{avisoCarrinho}</Alert> : null}

      {/* C-028: o aviso só aparece quando há carrinho guardado e o da tela está vazio. */}
      {carrinhoSalvo && resumoSalvo && carrinho.length === 0 ? (
        <Alert tone="info" className="mt-4">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              <strong>Você tem um carrinho salvo.</strong>
              {` ${resumoSalvo.itens} ${resumoSalvo.itens === 1 ? 'item' : 'itens'} · ${resumoSalvo.pedidos} ${resumoSalvo.pedidos === 1 ? 'pedido' : 'pedidos'} · ${moeda(resumoSalvo.total)} · aberto em ${fmtDataHora(carrinhoSalvo.abertoEm) || '—'}`}
            </span>
            {confirmandoDescarte ? (
              <>
                <span>Descartar mesmo?</span>
                <Button size="sm" variant="primary" onClick={descartarCarrinho}>Descartar</Button>
                <Button size="sm" onClick={() => setConfirmandoDescarte(false)}>Manter</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="primary" onClick={continuarCarrinho}>Continuar compra</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmandoDescarte(true)}>Descartar carrinho</Button>
              </>
            )}
          </span>
        </Alert>
      ) : null}

      <div className="mt-4">
        <GradeVisoes>
          {VISOES.map((v) => (
            <CardVisao
              key={v}
              rotulo={ROTULO_VISAO[v]}
              contagem={medidas.length === 0 ? null : contagens[v]}
              ativo={visao === v}
              onClick={() => aplicarRecorte(escolherVisao({ visao, soSilenciados: filtros.soSilenciados, visaoAnterior }, v))}
            />
          ))}
        </GradeVisoes>
      </div>

      {!codfilial ? (
        <Panel className="mt-4">
          <EmptyState
            title="Escolha o fornecedor e a filial"
            hint="A lista traz todos os produtos ativos daquele fornecedor com situação, cobertura, gatilho e sugestão já calculados."
          />
        </Panel>
      ) : carregando ? (
        <Panel className="mt-4"><EmptyState title="Carregando a lista..." /></Panel>
      ) : medidas.length === 0 ? (
        <Panel className="mt-4"><EmptyState title="Nenhum produto ativo deste fornecedor nesta filial" /></Panel>
      ) : (
        // R-129: lista e painel ocupam a altura que sobra, cada um com a sua rolagem; a largura do painel é do usuário.
        <div ref={refGrade} className={`mt-4 grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] ${COLUNAS_POR_LARGURA[larguraUsada]}`}>
          <ListaProdutos
            visao={visao}
            excessos={excessos}
            contagemAvisos={contagemAvisos}
            linhas={lista}
            todas={todas}
            selecionado={codprodSelecionado}
            onSelecionar={(l) => setSelecionado(Number(l.medida.CODPROD))}
            quantidades={quantidades}
            onQuantidade={(codprod, valor) => setQuantidades((atual) => ({ ...atual, [codprod]: valor }))}
            referencia={referencia}
            filtros={filtros}
            onFiltros={(parcial) => setFiltros((atual) => ({ ...atual, ...parcial }))}
            busca={busca}
            onBusca={setBusca}
            desconsiderarLicitacao={desconsiderarLicitacao}
            onLicitacao={() => setDesconsiderarLicitacao((atual) => !atual)}
            emPedidoAberto={emPedidoAberto}
            especiais={selosEspeciais}
            sugestaoProjetada={projetadaSelecionada ? { codprod: codprodSelecionado, sugestao: projetadaSelecionada.sugestao } : null}
            sugestaoTotal={sugestaoTotal}
            carrinho={{ itens: resumoCarrinho.itens, pedidos: resumoCarrinho.pedidos }}
            podeOperar={podeOperar}
            podeParametrizar={podeParametrizar}
            motivoBloqueio={motivoBloqueio}
            acoes={{
              onAdicionar: adicionar,
              onSilenciar: setSilenciando,
              onRestaurar: (l) => void restaurar(l),
              onAlternarSilenciados: () => aplicarRecorte(alternarSilenciados({ visao, soSilenciados: filtros.soSilenciados, visaoAnterior })),
              onExportar: exportar,
              onAbrirCarrinho: () => setCarrinhoAberto(true),
            }}
          />
          <PainelDetalhe
            linha={linhaSelecionada}
            codfilial={codfilial}
            fornecedor={nomeFornecedor}
            hoje={hoje}
            dados={dadosSelecionado}
            referencia={referencia}
            desconsideradasDoSku={desconsideradas.filter((v) => v.codprod === codprodSelecionado).length}
            podeOperar={podeOperar}
            podeParametrizar={podeParametrizar}
            motivoBloqueio={motivoBloqueio}
            onVerDetalheCompleto={setDetalheCompleto}
            onVerVendas={setVendasDe}
            onAdicionar={adicionar}
            onParametros={abrirParametros}
            onRestaurar={(l) => void restaurar(l)}
            previsao={previsaoSelecionada}
            modelo={modeloPrevisao}
            onModelo={setModeloPrevisao}
            projetada={projetadaSelecionada}
            sugestoesEspeciais={sugestoesSelecionada}
            onAdicionarEspecial={(tabela, quantidade) => { if (linhaSelecionada) adicionarEspecial(linhaSelecionada, tabela, quantidade); }}
            largura={larguraUsada}
            podeAlargar={podeAlargar}
            lotesBloqueados={lotesDe(codprodSelecionado)}
            excessosLista={excessos.get(codprodSelecionado) ?? []}
            onLargura={mudarLargura}
          />
        </div>
      )}

      <CarrinhoDialogo
        aberto={carrinhoAberto}
        onFechar={() => setCarrinhoAberto(false)}
        itens={carrinhoAtualizado}
        abertoEm={carrinhoMeta.abertoEm}
        abertoPor={carrinhoMeta.abertoPor}
        salvoEm={carrinhoMeta.salvoEm}
        boardId={boardId}
        usuarioId={sessao.usuarioId}
        periodo={periodo}
        hoje={hoje}
        pedidoAberto={pedidoAberto}
        grupoAtual={{ codfornec: Number(codfornec), codfilial }}
        podeOperar={podeOperar}
        motivoBloqueio={motivoBloqueio}
        coberturaLimiteDe={coberturaLimiteDe}
        onQuantidade={(chave, quantidade) => alterarItem(chave, { quantidade })}
        onMotivo={(chave, motivo) => alterarItem(chave, { motivo })}
        onRemover={(chave) => mudarCarrinho((atual) => atual.filter((e) => chaveDaEntrada(e) !== chave))}
        onDescartar={descartarCarrinho}
        onCriado={(cardId) => { setCarrinhoAberto(false); navigate(`/quadro?card=${cardId}`); }}
      />

      {/* R-123: a Análise do Produto é a versão expandida do painel, sobre o mesmo cache do SKU. */}
      <AnaliseProdutoDialogo
        linha={linhaDetalhe}
        codfilial={codfilial}
        fornecedor={nomeFornecedor}
        hoje={hoje}
        dados={dadosDetalhe}
        semPublico={desconsiderarLicitacao}
        referencia={referencia}
        desconsideradas={desconsideradas}
        periodo={periodo}
        pedidoMinimo={pedidoMinimo}
        podeOperar={podeOperar}
        podeParametrizar={podeParametrizar}
        motivoBloqueio={motivoBloqueio}
        onFechar={() => setDetalheCompleto(null)}
        onAdicionar={adicionar}
        onParametros={abrirParametros}
        onRestaurar={(l) => void restaurar(l)}
        onDesconsiderar={desconsiderarVenda}
        onReconsiderar={reconsiderarVenda}
        previsao={previsaoDetalhe}
        modelo={modeloPrevisao}
        onModelo={setModeloPrevisao}
        projetada={projetadaDetalhe}
        sugestoesEspeciais={sugestoesDetalhe}
        onAdicionarEspecial={(tabela, quantidade) => { if (linhaDetalhe) adicionarEspecial(linhaDetalhe, tabela, quantidade); }}
        lotesBloqueados={lotesDe(Number(linhaDetalhe?.medida.CODPROD ?? 0))}
        excessosLista={excessos.get(Number(linhaDetalhe?.medida.CODPROD ?? 0)) ?? []}
      />
      <ParametrosDialogo alvo={parametroAlvo} onFechar={() => setParametroAlvo(null)} onSalvar={salvarParametro} />
      <SilenciarDialogo linha={silenciando} onFechar={() => setSilenciando(null)} onSilenciar={silenciar} />
      <VendasDialogo
        linha={vendasDe}
        semPublico={desconsiderarLicitacao}
        codfilial={codfilial}
        periodo={periodo}
        desconsideradas={desconsideradas.map((v) => v.numtransitem)}
        onFechar={() => setVendasDe(null)}
        onDesconsiderar={desconsiderarVenda}
        onReconsiderar={reconsiderarVenda}
      />
    </div>
  );
}
