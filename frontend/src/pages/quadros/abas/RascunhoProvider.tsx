// O provedor do rascunho do pedido (R-133; o contrato mora em
// `rascunho-contexto.ts`). Envolve os blocos da fase em `ConteudoDaFase`.
//
// Custo de execução (RNF-001 da 003, mantido): abrir o card continua sendo
// `kbCardDetalhe` + `sgcPedidoCarregar` (e, na Análise, a fila do comercial,
// `sgcSolicitacoesDaMontagem`). A análise de produtos só consulta quando é
// montada, recalculada ou a tela ampla abre — análise, coberturas e pedidos
// abertos em paralelo, depois as unidades por caixa, o custo padrão e as
// tabelas especiais em lotes. Salvar continua sendo TRÊS chamadas.

import * as React from 'react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, LabelledField, Textarea,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import type { ItemPedido, LinhaAnalise } from '@/lib/compras';
import { coberturaDoItem, mesesDoPeriodo, montarItens, totalDoPedido } from '@/lib/compras';
import { coberturaDeLinha, type Cobertura } from '@/lib/cobertura';
import { AVISO_ERRO_CUSTO, carregarCustoPadrao } from '@/lib/custo-padrao-carga';
import { lotesDeCodigos, type CustoEspecial } from '@/lib/custo-especial';
import { aceitarSugestao as sugestoesAceitas } from '@/lib/resumo-pedido';
import type { DivisaoVenda, TransitoKanban } from '@/lib/analise-pedido';
import { usePedido } from './pedido-contexto';
import { atualizarCapaDoQuadro, capaMudou } from './capa-do-quadro';
import { devolverSolicitacoes } from './verificar-saida';
import { RascunhoContexto } from './rascunho-contexto';
import { DrillProduto } from './DrillProduto';
import type { AnaliseCarregada, CampoDeTexto, ContextoRascunho, SolicitacaoDaMontagem } from './rascunho-contexto';

const agora = () => new Date().toISOString().slice(0, 19);
const horaCurta = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const mensagem = (falha: unknown, padrao: string) => (falha instanceof Error ? falha.message : padrao);

const ROTULO_TEXTO: Record<CampoDeTexto, { titulo: string; rotulo: string; acao: string }> = {
  justificativa: { titulo: 'Justificar a cobertura acima do limite', rotulo: 'Por que comprar esta quantidade?', acao: 'Usar esta justificativa' },
  observacao: { titulo: 'Observação do item', rotulo: 'Observação para este produto no pedido', acao: 'Usar esta observação' },
};

export function RascunhoProvider({
  ctx,
  comSolicitacoes,
  children,
}: {
  ctx: ExtensaoContexto;
  /** Só a Análise lê a fila do comercial. */
  comSolicitacoes: boolean;
  children: React.ReactNode;
}) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  // Trocou de card: a capa do anterior não vale enquanto a deste carrega.
  const capa = pedido.capa && pedido.capa.idCard === ctx.card.id ? pedido.capa : null;
  const [itens, setItens] = React.useState<ItemPedido[]>([]);
  const [alterados, setAlterados] = React.useState<number[]>([]);
  const [erro, setErro] = React.useState('');
  const [avisoCusto, setAvisoCusto] = React.useState('');
  const [salvoEm, setSalvoEm] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [analise, setAnalise] = React.useState<{ cardId: number; dados: AnaliseCarregada } | null>(null);
  const [carregandoAnalise, setCarregandoAnalise] = React.useState(false);
  const [texto, setTexto] = React.useState<{ codprod: number; campo: CampoDeTexto; valor: string } | null>(null);
  const [produtoAberto, setProdutoAberto] = React.useState(0);

  // Recarregou o pedido: a lista volta a ser a do servidor, com as edições
  // ainda não salvas por cima (incluir uma solicitação recarrega o pedido e
  // não pode apagar o que a compradora mexeu). Outro card zera tudo. Ajuste
  // durante a renderização — estado derivado de prop que muda.
  const [base, setBase] = React.useState<{ cardId: number; itens: ItemPedido[] }>({ cardId: 0, itens: [] });
  const [agendadas, setAgendadas] = React.useState<Map<number, Partial<ItemPedido>>>(() => new Map());
  if (base.itens !== pedido.itens || base.cardId !== pedido.cardId) {
    const mesmoCard = base.cardId === pedido.cardId;
    setBase({ cardId: pedido.cardId, itens: pedido.itens });
    if (!mesmoCard) {
      setItens(pedido.itens);
      setAlterados([]);
      setAgendadas(new Map());
    } else {
      const locais = new Map(itens.map((item) => [item.codprod, item]));
      const pendentes = alterados.filter((codprod) => locais.has(codprod));
      const doServidor = new Set(pedido.itens.map((item) => item.codprod));
      const aplicadas = [...agendadas.keys()].filter((codprod) => doServidor.has(codprod));
      setItens([
        ...pedido.itens.map((item) => {
          const local = pendentes.includes(item.codprod) ? locais.get(item.codprod) : undefined;
          // A origem (solicitação) é sempre a do servidor.
          const atual = local ? { ...local, idSolicitacao: item.idSolicitacao, solicitacaoDe: item.solicitacaoDe } : item;
          const agendada = agendadas.get(item.codprod);
          return agendada ? { ...atual, ...agendada } : atual;
        }),
        ...pendentes.filter((codprod) => !doServidor.has(codprod)).map((codprod) => locais.get(codprod) as ItemPedido),
      ]);
      setAlterados([...new Set([...pendentes, ...aplicadas])]);
      if (aplicadas.length > 0) setAgendadas((atual) => new Map([...atual].filter(([codprod]) => !aplicadas.includes(codprod))));
    }
  }

  const meses = React.useMemo(() => mesesDoPeriodo(capa?.periodoInicio ?? '', capa?.periodoFim ?? ''), [capa?.periodoInicio, capa?.periodoFim]);
  const total = React.useMemo(() => totalDoPedido(itens), [itens]);
  const salvos = React.useMemo(() => pedido.itens.map((item) => item.codprod), [pedido.itens]);
  const bloqueado = ctx.travado || !pedido.podeEditar || ocupado;
  const dadosDaAnalise = analise && analise.cardId === ctx.card.id ? analise.dados : null;

  const marcar = (codprod: number) => setAlterados((atual) => (atual.includes(codprod) ? atual : [...atual, codprod]));

  const alterar = React.useCallback((codprod: number, mudanca: Partial<ItemPedido>) => {
    setItens((atual) => atual.map((item) => {
      if (item.codprod !== codprod) return item;
      const alterado = { ...item, ...mudanca };
      return { ...alterado, coberturaDias: coberturaDoItem(alterado, meses) ?? 0 };
    }));
    marcar(codprod);
  }, [meses]);

  const adicionarItem = React.useCallback((novo: ItemPedido) => {
    setItens((atual) => (atual.some((item) => item.codprod === novo.codprod) ? atual : [...atual, novo]));
    marcar(novo.codprod);
  }, []);

  const adicionar = React.useCallback((codprod: number, quantidade: number, mudanca: Partial<ItemPedido> = {}) => {
    if (itens.some((item) => item.codprod === codprod)) {
      alterar(codprod, { ...mudanca, qtPedida: quantidade });
      return;
    }
    const montado = dadosDaAnalise?.montados.find((item) => item.codprod === codprod);
    if (!montado) return;
    const novo = { ...montado, ...mudanca, qtPedida: quantidade };
    adicionarItem({ ...novo, coberturaDias: coberturaDoItem(novo, meses) ?? 0 });
  }, [itens, dadosDaAnalise, alterar, adicionarItem, meses]);

  /* ── a análise: só leitura (D-014) ── */
  const montarAnalise = React.useCallback(async () => {
    if (!capa) return;
    const cardId = ctx.card.id;
    setCarregandoAnalise(true);
    setErro('');
    try {
      const recorte = { codfornec: capa.codfornec, codfilial: capa.codfilial };
      const [rows, coberturas, abertos] = await Promise.all([
        linhas('sgcWintAnaliseMontagem', { ...recorte, dataInicio: capa.periodoInicio, dataFim: capa.periodoFim }),
        linhas('sgcCoberturaListar', { nivel: '', limite: 500, offset: 0 }),
        linhas('sgcItensEmPedidoAberto', { ...recorte, limite: 2000, offset: 0 }).catch(() => []),
      ]);
      const codprods = rows.map((linha) => Number(linha.CODPROD)).filter((n) => n > 0);
      // A integração pode não existir no ambiente: sem ela, a caixa cai na embalagem (RN-002).
      const porCaixa = new Map<number, number>();
      try {
        for (const linha of await linhas('sgcCustoUnidadesPorCaixa', { codprods: codprods.join(',') })) {
          porCaixa.set(Number(linha.CODPROD), Number(linha.UNIDADES_POR_CAIXA));
        }
      } catch { /* embalagem resolve */ }
      const custos = await carregarCustoPadrao(codprods);
      setAvisoCusto(custos === null ? AVISO_ERRO_CUSTO : '');
      const especiais: CustoEspecial[] = [];
      try {
        for (const lote of lotesDeCodigos(codprods)) {
          especiais.push(...(await linhas('sgcCustoEspeciaisProdutos', { codprods: lote })) as unknown as CustoEspecial[]);
        }
      } catch { /* sem o módulo de custos, o seletor só tem padrão e manual */ }

      const parametros: Cobertura[] = coberturas.map(coberturaDeLinha);
      const montados = montarItens(
        rows as unknown as LinhaAnalise[], parametros, porCaixa,
        { inicio: capa.periodoInicio, fim: capa.periodoFim }, capa.codfornec, custos,
      );
      const divisao = new Map<number, DivisaoVenda>();
      const pedidoErp = new Map<number, number>();
      for (const r of rows as unknown as LinhaAnalise[]) {
        divisao.set(Number(r.CODPROD), { privado: Number(r.VENDA_PRIVADO) || 0, pf: Number(r.VENDA_PF) || 0, publico: Number(r.VENDA_PUBLICO) || 0 });
        pedidoErp.set(Number(r.CODPROD), Number(r.QT_PEDIDA_ERP) || 0);
      }
      const kanban = new Map<number, TransitoKanban[]>();
      for (const a of abertos) {
        if (Number(a.ID_CARD) === cardId || !(Number(a.QT_PEDIDA) > 0)) continue;
        const codprod = Number(a.CODPROD);
        kanban.set(codprod, [...(kanban.get(codprod) ?? []), {
          idCard: Number(a.ID_CARD), titulo: String(a.TITULO ?? ''), fase: String(a.FASE_CHAVE ?? ''), quantidade: Number(a.QT_PEDIDA),
        }]);
      }
      setAnalise({ cardId, dados: { montados, divisao, pedidoErp, kanban, custos, especiais, coberturas: parametros, carregadaEm: horaCurta() } });
    } catch (falha) {
      setErro(mensagem(falha, 'Não foi possível montar a análise.'));
    } finally {
      setCarregandoAnalise(false);
    }
  }, [capa, ctx.card.id]);

  const aceitarSugestao = React.useCallback(() => {
    for (const mudanca of sugestoesAceitas(itens)) {
      if (mudanca.qtPedida <= 0 && !salvos.includes(mudanca.codprod)) {
        // Nunca gravado: sai da lista sem escrita.
        setItens((atual) => atual.filter((item) => item.codprod !== mudanca.codprod));
        setAlterados((atual) => atual.filter((codprod) => codprod !== mudanca.codprod));
      } else {
        alterar(mudanca.codprod, { qtPedida: mudanca.qtPedida });
      }
    }
  }, [itens, salvos, alterar]);

  /* ── salvar: gravar em lote, recalcular alertas, espelhar na capa ── */
  const salvar = React.useCallback(async (): Promise<boolean> => {
    const paraGravar = itens.filter((item) => alterados.includes(item.codprod));
    if (paraGravar.length === 0) return true;
    setOcupado(true);
    setErro('');
    try {
      const gravado = await acao('sgcItensGravar', { cardId: ctx.card.id, itensJson: JSON.stringify(paraGravar) });
      if (gravado.ok === false) throw new Error(String(gravado.erro ?? 'Não foi possível gravar os itens.'));
      const alertas = await acao('sgcAlertasGerar', { cardId: ctx.card.id });
      const espelho = { valor_total: String(gravado.total ?? total), alertas_pendentes: String(alertas.naoLidos ?? 0) };
      if (capaMudou(ctx.card, espelho)) {
        await atualizarCapaDoQuadro(ctx.card, espelho);
        await ctx.recarregar();
      }
      setAlterados([]);
      await pedido.recarregar(ctx.card.id);
      setSalvoEm(horaCurta());
      return true;
    } catch (falha) {
      setErro(mensagem(falha, 'Não foi possível salvar os itens.'));
      return false;
    } finally {
      setOcupado(false);
    }
  }, [itens, alterados, ctx, total, pedido]);

  const remover = React.useCallback(async (codprod: number) => {
    setAlterados((atual) => atual.filter((cod) => cod !== codprod));
    if (!salvos.includes(codprod)) {
      setItens((atual) => atual.filter((item) => item.codprod !== codprod));
      return;
    }
    const removido = pedido.itens.find((item) => item.codprod === codprod);
    setOcupado(true);
    setErro('');
    try {
      await acao('sgcEscItemRemover', { idCard: ctx.card.id, codprod, atualizadoEm: agora() });
      // Item sem origem em solicitação não dispara o par (a varredura completa
      // continua na saída da Análise); falhar nele não desfaz a remoção.
      if (removido && removido.idSolicitacao > 0) await devolverSolicitacoes(ctx.card.id, removido).catch(() => null);
      await pedido.recarregar(ctx.card.id);
    } catch (falha) {
      setErro(mensagem(falha, 'Não foi possível remover o item.'));
    } finally {
      setOcupado(false);
    }
  }, [salvos, pedido, ctx.card.id]);

  /* ── a fila do comercial (008): relê quando os itens do pedido mudam ── */
  const [fila, setFila] = React.useState<{ cardId: number; linhas: SolicitacaoDaMontagem[] } | null>(null);
  const [erroSolicitacoes, setErroSolicitacoes] = React.useState('');
  const buscarFila = React.useCallback(async () => (
    (await linhas('sgcSolicitacoesDaMontagem', { cardId: ctx.card.id })) as unknown as SolicitacaoDaMontagem[]
  ), [ctx.card.id]);
  const itensDoPedido = comSolicitacoes && pedido.cardId === ctx.card.id && !pedido.carregando ? pedido.itens : null;
  React.useEffect(() => {
    if (!itensDoPedido) return;
    let vivo = true;
    const cardId = ctx.card.id;
    buscarFila()
      .then((rows) => { if (vivo) { setFila({ cardId, linhas: rows }); setErroSolicitacoes(''); } })
      .catch((falha: unknown) => { if (vivo) setErroSolicitacoes(mensagem(falha, 'Não foi possível carregar as solicitações.')); });
    return () => { vivo = false; };
  }, [buscarFila, ctx.card.id, itensDoPedido]);
  const recarregarSolicitacoes = React.useCallback(async () => {
    setFila({ cardId: ctx.card.id, linhas: await buscarFila() });
  }, [buscarFila, ctx.card.id]);

  const comRecarga = React.useCallback(async (passos: () => Promise<void>) => {
    setOcupado(true);
    setErro('');
    try {
      await passos();
      setSalvoEm(horaCurta());
    } catch (falha) {
      setErro(mensagem(falha, 'Não foi possível concluir a ação.'));
    } finally {
      setOcupado(false);
    }
  }, []);

  const agendar = React.useCallback((codprod: number, mudanca: Partial<ItemPedido>) => {
    setAgendadas((atual) => new Map(atual).set(codprod, mudanca));
  }, []);

  const abrirTexto = React.useCallback((codprod: number, campo: CampoDeTexto) => {
    const item = itens.find((i) => i.codprod === codprod);
    setTexto({ codprod, campo, valor: campo === 'justificativa' ? item?.coberturaJustificativa ?? '' : item?.observacao ?? '' });
  }, [itens]);

  const valor = React.useMemo<ContextoRascunho>(() => ({
    cardId: ctx.card.id,
    capa,
    carregando: pedido.carregando,
    itens, alterados, salvos, meses, total, bloqueado,
    podeEditar: pedido.podeEditar,
    ocupado, erro, avisoCusto, salvoEm,
    analise: dadosDaAnalise,
    carregandoAnalise,
    solicitacoes: fila && fila.cardId === ctx.card.id ? fila.linhas : null,
    erroSolicitacoes,
    alterar, adicionar, adicionarItem, remover, montarAnalise, aceitarSugestao, salvar,
    recarregarSolicitacoes, comRecarga, agendar, abrirTexto, abrirProduto: setProdutoAberto, setErro,
  }), [
    ctx.card.id, capa, pedido.carregando, pedido.podeEditar, itens, alterados, salvos, meses, total, bloqueado, ocupado, erro, avisoCusto,
    salvoEm, dadosDaAnalise, carregandoAnalise, fila, erroSolicitacoes, alterar, adicionar, adicionarItem, remover, montarAnalise,
    aceitarSugestao, salvar, recarregarSolicitacoes, comRecarga, agendar, abrirTexto,
  ]);

  const rotulo = texto ? ROTULO_TEXTO[texto.campo] : null;
  return (
    <RascunhoContexto.Provider value={valor}>
      {children}
      {produtoAberto > 0 ? <DrillProduto codprod={produtoAberto} onFechar={() => setProdutoAberto(0)} /> : null}
      <Dialog open={texto !== null} onOpenChange={(aberto) => !aberto && setTexto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rotulo?.titulo}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <LabelledField label={rotulo?.rotulo ?? ''} hint="O texto é gravado no item quando você salvar a lista.">
              <Textarea
                rows={4}
                maxLength={500}
                value={texto?.valor ?? ''}
                onChange={(evento) => setTexto((atual) => (atual ? { ...atual, valor: evento.target.value } : atual))}
              />
            </LabelledField>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setTexto(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={bloqueado}
              onClick={() => {
                if (texto) {
                  alterar(texto.codprod, texto.campo === 'justificativa'
                    ? { coberturaJustificativa: texto.valor.trim() }
                    : { observacao: texto.valor.trim() });
                }
                setTexto(null);
              }}
            >
              {rotulo?.acao}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RascunhoContexto.Provider>
  );
}
