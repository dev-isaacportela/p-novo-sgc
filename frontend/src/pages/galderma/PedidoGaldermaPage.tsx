// Spec 014 — a mesa de negociação Galderma (`/galderma`). Estado e carga moram
// aqui; a tabela em `mesa.tsx`, os diálogos em `dialogos.tsx` e toda a conta em
// `lib/galderma.ts`. Orçamento (RNF-001..RNF-003): abrir = negociações,
// filiais e catálogo (+ a identidade em cache); escolher uma negociação = itens,
// pedidos por filial, pedidos gerados, herdado (se complementar), posição do
// ERP e caixas; digitar = 0; confirmar = 2; gerar = 4 por filial + 3.
import * as React from 'react';
import { useKanban } from '@benenutri/mitra-kanban';
import { Download, FileSpreadsheet, FileText, History, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import {
  Alert, Badge, Button, Code, EmptyState, GradeKpi, GradeMini, Kpi, MenuAcoes, MiniCartao, PageHeader, Panel, PanelHeader,
  RowMeta, SecaoRecolhivel, SelectMenu, TextLink, Toolbar,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import { baixarCsv, baixarTexto, textoCsv } from '@/lib/csv';
import { hojeIso, moeda, numeroPt } from '@/lib/formato';
import { unidadesPorCaixa } from '@/lib/compras';
import { QUADRO_COMPRAS } from '@/lib/quadro';
import {
  cabecalhoDe, cabecalhoPadrao, casarPlanilha, chave, COLUNAS_CSV_MESA, entradaDaImportacao, entradaDoCabecalho, entradaDoItem,
  FORNECEDOR_GALDERMA, itemDeLinha, itemDoPedidoGalderma, linhasCsvMesa, listaDeCodigos, listaDeFiliais, montarMesa,
  montarPedidosPorFilial, negociacaoDeLinha, nomeCurtoDaFilial, nomeArquivoMesa, parsearPlanilha, periodoDaPosicao, periodoDoPedido,
  planoDeGeracao, podeEditar, produtoDeLinha, produtosDisponiveis, resumoDaMesa, rotuloCompetencia, ROTULO_SITUACAO,
  textoDoModelo, tituloDoPedidoGalderma, type Cabecalho, type ItemProposta, type LinhaMesa, type Negociacao,
  type PedidoDaFilial, type PosicaoWinthor, type ProdutoGalderma,
} from '@/lib/galderma';
import { NavegacaoGalderma, SemAcessoGalderma } from './abas';
import { useAcessoGalderma } from './acesso';
import { BarraDaProposta, TabelaMesa } from './mesa';
import { DialogoExtrato, DialogoGerar, DialogoHistorico, DialogoImportar, DialogoItem, DialogoNegociacao, type ResultadoImportacao } from './dialogos';

const POR_PAGINA = 50;
const LOG_POR_PAGINA = 50;
const CHAVE_VALORES = 'sgc-galderma-valores-abertos';
const TODAS = { limite: 2000, offset: 0 };
const un = (v: number) => numeroPt(v, 0);
const agora = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const mensagem = (falha: unknown, padrao: string) => (falha instanceof Error && falha.message ? falha.message : padrao);

const ITEM_VAZIO: ItemProposta = {
  id: 0, codprod: 0, ean: '', descricao: '', precoSellout: 0, precoNet: 0, precoLista: 0, precoListaDesc: 0, estoqueInicial: 0,
  mediaSellout: 0, previsaoSellout: 0, propostaSellin: 0, metaSellinValor: 0, observacao: '',
};

interface Carga {
  chave: string;
  itens: ItemProposta[];
  pedidos: Map<string, number>;
  posicoes: PosicaoWinthor[];
  herdado: Map<string, number>;
  caixas: Map<number, number>;
  cards: { codfilial: string; cardId: number; temCapa: boolean }[];
  erroErp: string;
}

export default function PedidoGaldermaPage() {
  const acesso = useAcessoGalderma();
  const api = useKanban();
  const [pagina, setPagina] = React.useState(1);
  const [negociacoes, setNegociacoes] = React.useState<Negociacao[]>([]);
  const [selecionada, setSelecionada] = React.useState(0);
  const [filiaisErp, setFiliaisErp] = React.useState<{ codfilial: string; filial: string }[]>([]);
  const [catalogo, setCatalogo] = React.useState<ProdutoGalderma[]>([]);
  const [cargaLida, setCarga] = React.useState<Carga | null>(null);
  const [simulacao, setSimulacao] = React.useState<Map<string, number>>(new Map());
  const [erro, setErro] = React.useState('');
  const [recargaLista, setRecargaLista] = React.useState(0);
  const [recargaMesa, setRecargaMesa] = React.useState(0);
  // diálogos
  const [cabecalho, setCabecalho] = React.useState<{ inicial: Cabecalho; id: number } | null>(null);
  const [itemEmEdicao, setItemEmEdicao] = React.useState<ItemProposta | null>(null);
  const [importar, setImportar] = React.useState(false);
  const [importacao, setImportacao] = React.useState<{ importando: boolean; resultado: ResultadoImportacao | null }>({ importando: false, resultado: null });
  const [historico, setHistorico] = React.useState<{ pagina: number; linhas: Record<string, unknown>[]; carregando: boolean } | null>(null);
  const [extrato, setExtrato] = React.useState(false);
  const [geracao, setGeracao] = React.useState<{ gerando: boolean; erro: string; gerados: { filial: string; cardId: number }[] } | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [erroDialogo, setErroDialogo] = React.useState('');
  // Recolhida por padrão (R-126); preferência de quem vê, não crítica — falhar o localStorage só a esquece.
  const [valoresAbertos, setValoresAbertos] = React.useState(() => {
    try { return localStorage.getItem(CHAVE_VALORES) === '1'; } catch { return false; }
  });
  function alternarValores() {
    const aberta = !valoresAbertos;
    setValoresAbertos(aberta);
    try { localStorage.setItem(CHAVE_VALORES, aberta ? '1' : '0'); } catch { /* preferência não crítica */ }
  }

  const negociacao = negociacoes.find((n) => n.id === selecionada) ?? null;
  const nomesFiliais = React.useMemo(() => new Map(filiaisErp.map((f) => [f.codfilial, f.filial])), [filiaisErp]);
  const pode = podeEditar(acesso.operar, negociacao?.status ?? 'convertida');

  /* ── abrir: negociações (paginadas), filiais e catálogo ── */
  React.useEffect(() => {
    if (!acesso.ver) return undefined;
    let vivo = true;
    linhas('sgcGaldNegociacoesListar', { limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA })
      .then((rows) => {
        if (!vivo) return;
        const lista = rows.map(negociacaoDeLinha);
        setNegociacoes(lista);
        // RN-PG-09: a primeira é selecionada; a selecionada continua se ainda estiver na página.
        setSelecionada((atual) => (lista.some((n) => n.id === atual) ? atual : lista[0]?.id ?? 0));
      })
      .catch((falha) => vivo && setErro(mensagem(falha, 'Não foi possível carregar as negociações.')));
    return () => { vivo = false; };
  }, [acesso.ver, pagina, recargaLista]);

  React.useEffect(() => {
    if (!acesso.ver) return;
    linhas('sgcWintFiliais').then((rows) => setFiliaisErp(rows.map((r) => ({ codfilial: String(r.CODFILIAL), filial: String(r.FILIAL) })))).catch(() => setFiliaisErp([]));
    linhas('sgcWintGaldProdutos').then((rows) => setCatalogo(rows.map(produtoDeLinha))).catch(() => setCatalogo([]));
  }, [acesso.ver]);

  /*
   * ── escolher: itens, pedidos, cards, herdado; depois posição e caixas ──
   * A carga depende só do que muda a consulta (id, competência, filiais,
   * origem): editar a descrição ou a cobertura alvo recalcula a mesa na tela,
   * sem voltar ao ERP.
   */
  const chaveCarga = negociacao
    ? JSON.stringify({ id: negociacao.id, competencia: negociacao.competencia, filiais: negociacao.filiais, idPai: negociacao.idPai })
    : '';
  React.useEffect(() => {
    if (!chaveCarga) return undefined;
    const alvo = JSON.parse(chaveCarga) as { id: number; competencia: string; filiais: string[]; idPai: number };
    let vivo = true;
    (async () => {
      const id = alvo.id;
      const [rowsItens, rowsPedidos, rowsCards, rowsHerdado] = await Promise.all([
        linhas('sgcGaldItensListar', { idNegociacao: id, ...TODAS }),
        linhas('sgcGaldPedidosFilialListar', { idNegociacao: id, ...TODAS }),
        linhas('sgcGaldCardsListar', { idNegociacao: id, ...TODAS }),
        alvo.idPai ? linhas('sgcGaldHerdadoListar', { idNegociacao: id, ...TODAS }) : Promise.resolve([]),
      ]);
      const itens = rowsItens.map(itemDeLinha);
      const codprods = listaDeCodigos(itens.map((i) => i.codprod));
      let posicoes: PosicaoWinthor[] = [];
      let erroErp = '';
      const caixasGestao = new Map<number, number>();
      if (itens.length && alvo.filiais.length) {
        // RN-PG-21: ao vivo, sem cache; a falha do ERP não esconde a proposta.
        const [posicao, caixas] = await Promise.allSettled([
          linhas('sgcWintGaldPosicao', { codprods, filiais: listaDeFiliais(alvo.filiais), ...periodoDaPosicao(alvo.competencia) }),
          linhas('sgcCustoUnidadesPorCaixa', { codprods }),
        ]);
        if (posicao.status === 'fulfilled') posicoes = posicao.value as unknown as PosicaoWinthor[];
        else erroErp = `ERP indisponível: ${mensagem(posicao.reason, 'a posição não carregou')}.`;
        if (caixas.status === 'fulfilled') for (const c of caixas.value) caixasGestao.set(Number(c.CODPROD), Number(c.UNIDADES_POR_CAIXA));
      }
      return {
        chave: chaveCarga,
        itens,
        pedidos: new Map(rowsPedidos.map((p) => [chave(Number(p.ID_ITEM), String(p.CODFILIAL)), Number(p.QTD_PEDIDA)])),
        posicoes,
        herdado: new Map(rowsHerdado.map((h) => [chave(Number(h.CODPROD), String(h.CODFILIAL)), Number(h.QTD_HERDADA)])),
        caixas: caixasGestao,
        cards: rowsCards.map((c) => ({ codfilial: String(c.CODFILIAL), cardId: Number(c.ID_CARD), temCapa: Number(c.TEM_CAPA) === 1 })),
        erroErp,
      };
    })()
      .then((valor) => { if (vivo) { setCarga(valor); setErro(''); } })
      .catch((falha) => vivo && setErro(mensagem(falha, 'Não foi possível carregar a negociação.')));
    return () => { vivo = false; };
  }, [chaveCarga, recargaMesa]);

  // A carga só vale para a negociação de agora; enquanto a nova não chega, a mesa espera.
  const carga = cargaLida?.chave === chaveCarga ? cargaLida : null;
  const carregando = Boolean(chaveCarga) && !carga;

  /** RN-PG-57: trocar de negociação limpa a simulação. */
  function selecionar(id: number) {
    setSelecionada(id);
    setSimulacao(new Map());
  }

  /** RN-003: Gestão de Custos > cadastro do ERP > embalagem — a mesma cadeia do pedido de compra. */
  const caixasPorProduto = React.useMemo(() => {
    const porCodprod = new Map(catalogo.map((p) => [p.codprod, p]));
    return new Map((carga?.itens ?? []).map((i) => {
      const p = porCodprod.get(i.codprod);
      return [i.codprod, unidadesPorCaixa({ EMBALAGEM: p?.embalagem ?? '', UN_POR_CAIXA_ERP: p?.unPorCaixaErp ?? 0 }, carga?.caixas.get(i.codprod))];
    }));
  }, [carga, catalogo]);

  const mesa: LinhaMesa[] = React.useMemo(() => (negociacao && carga ? montarMesa({
    negociacao, itens: carga.itens, pedidos: carga.pedidos, posicoes: carga.posicoes, herdado: carga.herdado,
    simulacao, caixas: caixasPorProduto, nomesFiliais,
  }) : []), [negociacao, carga, simulacao, caixasPorProduto, nomesFiliais]);
  const resumo = React.useMemo(() => resumoDaMesa(mesa), [mesa]);
  const pedidosPorFilial: PedidoDaFilial[] = React.useMemo(() => montarPedidosPorFilial(mesa), [mesa]);

  if (acesso.carregando) return <RowMeta>Verificando acesso…</RowMeta>;
  if (!acesso.ver) return <SemAcessoGalderma />;

  // A lista traz situação e cabeçalho; a mesa só volta ao servidor quando a chave da carga muda ou pela geração.
  const recarregarLista = () => setRecargaLista((n) => n + 1);

  /* ── cabeçalho ── */
  async function salvarCabecalho(c: Cabecalho) {
    if (!cabecalho) return;
    setSalvando(true); setErroDialogo('');
    try {
      const quando = agora();
      if (cabecalho.id) {
        await linhas('sgcEscGaldNegociacaoAtualizar', { id: cabecalho.id, ...entradaDoCabecalho(c, quando) });
      } else {
        await linhas('sgcEscGaldNegociacaoCriar', entradaDoCabecalho(c, quando));
        // RN-PG-10 sem MAX(ID): a nova é a primeira da lista (data do pedido mais recente) ou a que acabou de nascer com este carimbo.
        const rows = await linhas('sgcGaldNegociacoesListar', { limite: POR_PAGINA, offset: 0 });
        const nova = rows.map(negociacaoDeLinha).find((n) => n.criadoEm === quando && n.criadoPor === acesso.usuarioId);
        if (!nova) throw new Error('A negociação não foi criada. Confira se a negociação de origem ainda está livre.');
        setPagina(1);
        selecionar(nova.id);
      }
      setCabecalho(null);
      recarregarLista();
    } catch (falha) {
      setErroDialogo(mensagem(falha, 'Não foi possível salvar a negociação.'));
    } finally { setSalvando(false); }
  }

  async function mudarSituacao(status: 'aberta' | 'fechada') {
    if (!negociacao) return;
    await linhas('sgcEscGaldNegociacaoSituacao', { id: negociacao.id, status, agora: agora() }).catch((f) => setErro(mensagem(f, 'Não foi possível mudar a situação.')));
    recarregarLista();
  }

  async function excluir() {
    if (!negociacao || !window.confirm(`Excluir "${negociacao.descricao}"? Itens e pedidos por filial somem; o histórico fica.`)) return;
    try {
      for (const nome of ['sgcEscGaldNegociacaoExcluirPedidos', 'sgcEscGaldNegociacaoExcluirItens', 'sgcEscGaldNegociacaoExcluir'] as const) {
        await linhas(nome, { id: negociacao.id });
      }
      selecionar(0);
      recarregarLista();
    } catch (falha) { setErro(mensagem(falha, 'Não foi possível excluir a negociação.')); }
  }

  /* ── itens ── */
  async function salvarItem(item: ItemProposta) {
    if (!negociacao) return;
    setSalvando(true); setErroDialogo('');
    try {
      await linhas('sgcEscGaldItemSalvar', entradaDoItem(negociacao.id, item, agora()));
      setItemEmEdicao(null);
      setRecargaMesa((n) => n + 1);
    } catch (falha) { setErroDialogo(mensagem(falha, 'Não foi possível salvar o item.')); } finally { setSalvando(false); }
  }

  async function removerItem(l: LinhaMesa) {
    if (!window.confirm(`Remover ${l.item.descricao}? Os pedidos por filial deste item também somem.`)) return;
    try {
      await linhas('sgcEscGaldItemExcluirPedidos', { idItem: l.item.id });
      await linhas('sgcEscGaldItemExcluir', { idItem: l.item.id });
      setRecargaMesa((n) => n + 1);
    } catch (falha) { setErro(mensagem(falha, 'Não foi possível remover o item.')); }
  }

  /** RNF-005: 1 leitura do catálogo (já na tela) e 1 gravação por linha casada. */
  async function importarTexto(texto: string) {
    if (!negociacao) return;
    setImportacao({ importando: true, resultado: null }); setErroDialogo('');
    const r = casarPlanilha(parsearPlanilha(texto), catalogo);
    let gravadas = 0;
    try {
      for (const c of r.casadas) { await linhas('sgcEscGaldItemImportar', entradaDaImportacao(negociacao.id, c, agora())); gravadas += 1; }
    } catch (falha) { setErroDialogo(`${mensagem(falha, 'A importação parou.')} ${gravadas} linha(s) já gravada(s).`); }
    setImportacao({ importando: false, resultado: { lidas: r.lidas, gravadas, semProduto: r.semProduto } });
    if (gravadas > 0) setRecargaMesa((n) => n + 1);
  }

  /* ── decisão por filial ── */
  function simular(k: string, quantidade: number | null) {
    setSimulacao((atual) => { const nova = new Map(atual); if (quantidade === null) nova.delete(k); else nova.set(k, quantidade); return nova; });
  }

  async function confirmarPedido(l: LinhaMesa, codfilial: string, quantidade: number) {
    const k = chave(l.item.id, codfilial);
    simular(k, null);
    const anterior = carga?.pedidos.get(k) ?? 0;
    if (anterior === quantidade || !carga) return;
    // RN-PG-53: otimista; falha → aviso e recarga.
    setCarga({ ...carga, pedidos: new Map(carga.pedidos).set(k, quantidade) });
    try {
      const quando = agora();
      await linhas('sgcEscGaldPedidoFilialSalvar', { idItem: l.item.id, codfilial, qtdPedida: quantidade, agora: quando });
      await linhas('sgcEscGaldDecisaoLogInserir', { idItem: l.item.id, codfilial, antes: String(anterior), depois: String(quantidade), agora: quando });
    } catch (falha) {
      setErro(mensagem(falha, 'Não foi possível gravar o pedido.'));
      setRecargaMesa((n) => n + 1);
    }
  }

  async function abrirHistorico(paginaLog = 1) {
    if (!negociacao) return;
    setHistorico({ pagina: paginaLog, linhas: historico?.linhas ?? [], carregando: true });
    const rows = await linhas('sgcGaldDecisaoLogListar', { idNegociacao: negociacao.id, limite: LOG_POR_PAGINA, offset: (paginaLog - 1) * LOG_POR_PAGINA }).catch(() => []);
    setHistorico({ pagina: paginaLog, linhas: rows, carregando: false });
  }

  /* ── RN-009: gerar os pedidos no quadro ── */
  async function gerarPedidos() {
    if (!negociacao) return;
    setGeracao({ gerando: true, erro: '', gerados: [] });
    const gerados: { filial: string; cardId: number }[] = [];
    try {
      const quadro = await api.boardCarregar({ slug: QUADRO_COMPRAS });
      const boardId = Number(quadro?.board?.id ?? 0);
      if (!boardId) throw new Error('O quadro de compras não foi encontrado.');
      const cards = (await linhas('sgcGaldCardsListar', { idNegociacao: negociacao.id, ...TODAS }))
        .map((c) => ({ codfilial: String(c.CODFILIAL), cardId: Number(c.ID_CARD), temCapa: Number(c.TEM_CAPA) === 1 }));
      const plano = planoDeGeracao(pedidosPorFilial, cards);
      const periodo = periodoDoPedido(hojeIso());
      const completar = async (p: PedidoDaFilial, cardId: number) => {
        await linhas('sgcEscGaldPedidoCapaCriar', {
          cardId, idNegociacao: negociacao.id, codfilial: p.codfilial, fornecedor: FORNECEDOR_GALDERMA, filial: p.filial,
          periodoInicio: periodo.inicio, periodoFim: periodo.fim, agora: agora(),
        });
        const itens = p.produtos.map((x) => itemDoPedidoGalderma(x, negociacao.coberturaAlvoDias));
        const gravado = await acao('sgcItensGravar', { cardId, itensJson: JSON.stringify(itens) });
        if (gravado && gravado.ok === false) throw new Error(String(gravado.erro ?? 'Os itens não foram gravados.'));
        gerados.push({ filial: p.filial, cardId });
      };
      for (const p of plano.aGerar) {
        const criado = await api.cardCriar({
          boardId, titulo: tituloDoPedidoGalderma(p.filial, negociacao.competencia),
          valores: { fornecedor: FORNECEDOR_GALDERMA, filial: p.filial, prioridade: 'normal', valor_total: String(p.valor) },
          responsaveisIds: acesso.usuarioId ? [acesso.usuarioId] : [],
        });
        if (!criado.ok || !criado.id) throw new Error(criado.error || `O pedido da filial ${p.filial} não foi criado.`);
        await linhas('sgcEscGaldCardRegistrar', { idNegociacao: negociacao.id, codfilial: p.codfilial, cardId: criado.id, agora: agora() });
        await completar(p, criado.id);
      }
      for (const { pedido, cardId } of plano.aCompletar) await completar(pedido, cardId);
      await linhas('sgcEscGaldNegociacaoConverter', { id: negociacao.id, agora: agora() });
      setGeracao({ gerando: false, erro: '', gerados: [...gerados, ...plano.jaGeradas.map((p) => ({ filial: p.filial, cardId: cards.find((c) => c.codfilial === p.codfilial)?.cardId ?? 0 }))] });
    } catch (falha) {
      setGeracao({ gerando: false, erro: mensagem(falha, 'A geração parou.'), gerados });
    }
    recarregarLista();
    setRecargaMesa((n) => n + 1);
  }

  function exportar() {
    if (!negociacao) return;
    baixarCsv(nomeArquivoMesa(negociacao), textoCsv(COLUNAS_CSV_MESA, linhasCsvMesa(mesa)));
  }

  const v = resumo.valores;
  const cardsGerados = carga?.cards ?? [];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        module="Compras"
        title="Pedido Galderma"
        actions={(
          <>
            <NavegacaoGalderma />
            {/* A lista de negociações virou seletor (topo da proposta de layout); as mais antigas, por página. */}
            <div className="flex flex-col gap-1">
              <SelectMenu label="Negociação" className="min-w-[20rem]" placeholder="Nenhuma negociação ainda" value={selecionada ? String(selecionada) : ''}
                options={negociacoes.map((n) => ({ value: String(n.id), label: n.descricao, hint: `${rotuloCompetencia(n.competencia)} · ${ROTULO_SITUACAO[n.status]}` }))}
                onChange={(v) => selecionar(Number(v))} />
              {pagina > 1 || negociacoes.length === POR_PAGINA ? (
                <RowMeta>
                  {pagina > 1 ? <TextLink onClick={() => setPagina((p) => p - 1)}>Mais recentes</TextLink> : null}
                  {pagina > 1 && negociacoes.length === POR_PAGINA ? ' · ' : null}
                  {negociacoes.length === POR_PAGINA ? <TextLink onClick={() => setPagina((p) => p + 1)}>Mais antigas</TextLink> : null}
                </RowMeta>
              ) : null}
            </div>
            <Button variant="primary" disabled={!acesso.operar} title={acesso.motivo || undefined}
              onClick={() => setCabecalho({ id: 0, inicial: cabecalhoPadrao(hojeIso(), negociacoes[0] ?? null, filiaisErp.map((f) => f.codfilial)) })}>
              <Plus /> Nova negociação
            </Button>
          </>
        )}
      />
      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {acesso.motivo ? <Alert tone="info">{`${acesso.motivo} Os controles de escrita ficam desabilitados.`}</Alert> : null}
      {negociacoes.length === 0 ? <Panel><EmptyState title="Nenhuma negociação ainda." hint="Abra a negociação do mês em “Nova negociação”." /></Panel> : null}

      {negociacao ? (
        <>
          <Panel>
            <PanelHeader
              title={rotuloCompetencia(negociacao.competencia)}
              hint={`${negociacao.descricao} · filiais ${negociacao.filiais.map((f) => nomeCurtoDaFilial(f, nomesFiliais)).join(' · ')} · cobertura alvo ${negociacao.coberturaAlvoDias} d · trânsito como compra: ${negociacao.transitoComoCompra ? 'sim' : 'não'}${negociacao.idPai ? ` · complementar da ${negociacao.idPai}` : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={negociacao.status === 'fechada' ? 'neutral' : 'accent'}>{ROTULO_SITUACAO[negociacao.status]}</Badge>
                {negociacao.status === 'fechada'
                  ? <Button size="sm" disabled={!pode.situacao} onClick={() => mudarSituacao('aberta')}>Reabrir</Button>
                  : <Button size="sm" disabled={!pode.situacao} onClick={() => mudarSituacao('fechada')}>Fechar</Button>}
                <MenuAcoes itens={[
                  { label: 'Editar', icon: <Pencil />, disabled: !pode.cabecalho, onClick: () => setCabecalho({ id: negociacao.id, inicial: cabecalhoDe(negociacao) }) },
                  { label: 'Histórico', icon: <History />, onClick: () => abrirHistorico(1) },
                  { label: 'Extrato', icon: <FileText />, onClick: () => setExtrato(true) },
                  { label: 'Exportar', icon: <Download />, onClick: exportar },
                  { label: 'Atualizar ERP', icon: <RefreshCw />, onClick: () => setRecargaMesa((n) => n + 1) },
                  { label: 'Excluir', icon: <Trash2 />, tone: 'danger', disabled: !pode.excluir || cardsGerados.length > 0, onClick: excluir },
                ]} />
                <Button size="sm" variant="primary" disabled={!pode.gerar || pedidosPorFilial.length === 0} onClick={() => setGeracao({ gerando: false, erro: '', gerados: [] })}>
                  {pedidosPorFilial.length ? `Gerar pedidos · ${pedidosPorFilial.length} ${pedidosPorFilial.length === 1 ? 'filial' : 'filiais'}` : 'Gerar pedidos'}
                </Button>
              </div>
            </PanelHeader>
            {negociacao.status === 'convertida' ? (
              <div className="px-4 pt-3">
                <Alert tone="info">
                  {'Convertida em pedido — somente leitura. '}
                  {cardsGerados.map((c) => <React.Fragment key={c.cardId}><Code prefix={`filial ${c.codfilial} · pedido`}>{c.cardId}</Code>{' '}</React.Fragment>)}
                </Alert>
              </div>
            ) : null}
            {carga?.erroErp ? <div className="px-4 pt-3"><Alert tone="warn">{carga.erroErp}</Alert></div> : null}
            <div className="grid gap-3 p-4">
              <GradeKpi>
                <Kpi rotulo="Proposta sell-in" valor={un(resumo.propostaSellin)} hint={`unidades, ${resumo.produtos} ${resumo.produtos === 1 ? 'produto' : 'produtos'}`} />
                <Kpi rotulo="Saldo a comprar" valor={un(resumo.saldoAComprarSimulado)} hint={`sem o pedido: ${un(resumo.saldoAComprar)}`} />
                <Kpi rotulo="Sugestão por cobertura" valor={un(resumo.sugestao)} hint={`em caixa fechada: ${un(resumo.sugestaoEmCaixa)} · alvo ${negociacao.coberturaAlvoDias} d`} />
                <Kpi rotulo="Valor do pedido" valor={moeda(v.pedidoListaDesc)} hint={`com desconto · ${moeda(v.pedidoNet)} net`} />
              </GradeKpi>
              <BarraDaProposta proposta={resumo.propostaSellin} comprado={resumo.compraMes} pedido={resumo.pedido} saldo={resumo.saldoAComprarSimulado} />
            </div>
          </Panel>

          {/* R-126 / R-153: os oito valores em R$ numa seção recolhível, com o essencial no resumo; a escolha fica no navegador. */}
          <SecaoRecolhivel
            titulo="Valores da negociação em R$"
            resumo={`Meta sell-in ${moeda(v.metaSellin)} · falta comprar ${moeda(v.faltaComprar)} · pedido ${moeda(v.pedidoListaDesc)} com desconto · vendido no mês ${moeda(v.vendidoNoMes)}`}
            aberta={valoresAbertos}
            onToggle={alternarValores}
          >
              <GradeMini colunas={4}>
                <MiniCartao rotulo="Meta sell-in" valor={moeda(v.metaSellin)} />
                <MiniCartao rotulo="Meta sell-out" valor={moeda(negociacao.metaSelloutValor)} hint="informada" />
                <MiniCartao rotulo="Comprado no mês" valor={moeda(v.compradoNoMes)} hint="a preço com desconto" />
                <MiniCartao rotulo="Falta comprar" valor={moeda(v.faltaComprar)} tone={v.faltaComprar > 0 ? 'attention' : 'neutral'} />
                <MiniCartao rotulo="Pedido a preço net" valor={moeda(v.pedidoNet)} />
                <MiniCartao rotulo="Pedido a lista cheio" valor={moeda(v.pedidoListaCheio)} />
                <MiniCartao rotulo="Pedido com desconto" valor={moeda(v.pedidoListaDesc)} />
                <MiniCartao rotulo="Vendido no mês" valor={moeda(v.vendidoNoMes)} hint="a preço de sell-out" />
              </GradeMini>
          </SecaoRecolhivel>

          <Panel>
            <PanelHeader title="Itens da proposta" hint="Clique no produto para abrir o pedido por filial. Digitar simula; sair do campo ou Enter grava.">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!pode.itens} onClick={() => { setErroDialogo(''); setItemEmEdicao({ ...ITEM_VAZIO }); }}><Plus /> Item</Button>
                <Button size="sm" disabled={!pode.itens} onClick={() => { setErroDialogo(''); setImportacao({ importando: false, resultado: null }); setImportar(true); }}><Upload /> Importar planilha</Button>
                <Button size="sm" onClick={() => baixarTexto(`modelo-pedido-galderma-${negociacao.competencia}.csv`, `${String.fromCharCode(0xfeff)}${textoDoModelo(negociacao.competencia, catalogo)}`, 'text/csv;charset=utf-8;')}>
                  <FileSpreadsheet /> Baixar modelo
                </Button>
              </div>
            </PanelHeader>
            {carregando ? <Toolbar><RowMeta>Carregando a posição do ERP…</RowMeta></Toolbar> : null}
            {mesa.length === 0 && !carregando ? <EmptyState title="Nenhum item na proposta." hint="Importe a planilha da Galderma ou adicione os itens um a um." /> : (
              <TabelaMesa linhas={mesa} alvo={negociacao.coberturaAlvoDias} editavel={pode.itens} onSimular={simular} onConfirmar={confirmarPedido}
                onEditarItem={(l) => { setErroDialogo(''); setItemEmEdicao(l.item); }} onRemoverItem={removerItem} />
            )}
          </Panel>
        </>
      ) : null}

      {cabecalho ? (
        <DialogoNegociacao aberto titulo={cabecalho.id ? 'Editar negociação' : 'Nova negociação'} inicial={cabecalho.inicial} filiais={filiaisErp}
          origens={negociacoes}
          criando={!cabecalho.id} salvando={salvando} erro={erroDialogo} onFechar={() => setCabecalho(null)} onSalvar={salvarCabecalho} />
      ) : null}
      {itemEmEdicao ? (
        <DialogoItem aberto inicial={itemEmEdicao} produtos={produtosDisponiveis(catalogo, carga?.itens ?? [], itemEmEdicao.codprod)} salvando={salvando}
          erro={erroDialogo} onFechar={() => setItemEmEdicao(null)} onSalvar={salvarItem} />
      ) : null}
      <DialogoImportar aberto={importar} importando={importacao.importando} resultado={importacao.resultado} erro={erroDialogo}
        onFechar={() => setImportar(false)} onArquivo={importarTexto} />
      <DialogoHistorico aberto={Boolean(historico)} linhas={historico?.linhas ?? []} pagina={historico?.pagina ?? 1} porPagina={LOG_POR_PAGINA}
        carregando={Boolean(historico?.carregando)} onPagina={abrirHistorico} onFechar={() => setHistorico(null)} />
      <DialogoExtrato aberto={extrato} pedidos={pedidosPorFilial} onFechar={() => setExtrato(false)} />
      <DialogoGerar aberto={Boolean(geracao)} pedidos={pedidosPorFilial} jaGeradas={cardsGerados.filter((c) => c.temCapa).map((c) => c.codfilial)}
        gerando={Boolean(geracao?.gerando)} erro={geracao?.erro ?? ''} gerados={geracao?.gerados ?? []}
        onFechar={() => setGeracao(null)} onConfirmar={gerarPedidos} />
    </div>
  );
}
