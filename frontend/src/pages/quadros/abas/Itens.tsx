// Aba Itens do pedido aberto (spec 003): a análise de montagem, a lista
// editável, o prazo de pagamento e o total.
//
// Custo de execução (RNF-001): salvar são TRÊS chamadas, qualquer que seja o
// número de itens alterados — `sgcItensGravar` (lote), `sgcAlertasGerar` e,
// só quando o total ou a contagem de alertas mudou, um `kbCardAtualizar` com
// os dois campos do quadro juntos. Montar a análise não grava nada (D-014).

import * as React from 'react';
import { ListPlus, PencilLine, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, IconButton, Input, LabelledField, Panel, PanelHeader, SelectMenu,
  Status, Table, Td, Textarea, Th, Toolbar, Tr,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import { moeda } from '@/lib/formato';
import type { ItemPedido, LinhaAnalise } from '@/lib/compras';
import { AVISO_ERRO_CUSTO, carregarCustoPadrao } from '@/lib/custo-padrao-carga';
import {
  coberturaDoItem, itemDeProdutoBuscado, mesesDoPeriodo, montarItens, totalDoPedido, custoPadraoDe,
} from '@/lib/compras';
import { acimaDoLimite, coberturaDeLinha, type Cobertura } from '@/lib/cobertura';
import { usePedido } from './pedido-contexto';
import { atualizarCapaDoQuadro, capaMudou } from './capa-do-quadro';
import BuscarProduto from './BuscarProduto';
import PrazoPagamento from './PrazoPagamento';
import { devolverSolicitacoes } from './verificar-saida';

const TIPOS_DE_PRECO = [
  { value: 'padrao', label: 'Padrão' },
  { value: 'especial', label: 'Especial' },
];

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const agora = () => new Date().toISOString().slice(0, 19);
const horaCurta = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function AbaItens(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const [itens, setItens] = React.useState<ItemPedido[]>([]);
  const [alterados, setAlterados] = React.useState<number[]>([]);
  const [erro, setErro] = React.useState('');
  const [avisoCusto, setAvisoCusto] = React.useState('');
  const [salvoEm, setSalvoEm] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [buscando, setBuscando] = React.useState(false);
  // D-32 (R-104): a parametrização lida na remontagem serve também ao produto
  // adicionado por busca — antes ele caía sempre no padrão 35.
  const [parametrizacao, setParametrizacao] = React.useState<Cobertura[]>([]);
  const [justificando, setJustificando] = React.useState<{ codprod: number; texto: string } | null>(null);

  // Recarregou o pedido: a lista da tela volta a ser a do servidor e as
  // alterações pendentes somem (ajuste durante a renderização, não em efeito —
  // é o padrão do React para estado derivado de prop que muda).
  const [base, setBase] = React.useState(pedido.itens);
  if (base !== pedido.itens) {
    setBase(pedido.itens);
    setItens(pedido.itens);
    setAlterados([]);
  }

  const capa = pedido.capa;
  const meses = React.useMemo(
    () => mesesDoPeriodo(capa?.periodoInicio ?? '', capa?.periodoFim ?? ''),
    [capa?.periodoInicio, capa?.periodoFim],
  );
  const total = React.useMemo(() => totalDoPedido(itens), [itens]);
  const salvos = React.useMemo(() => pedido.itens.map((item) => item.codprod), [pedido.itens]);
  const bloqueado = ctx.travado || !pedido.podeEditar || ocupado;

  function alterar(codprod: number, mudanca: Partial<ItemPedido>) {
    setItens((atual) => atual.map((item) => {
      if (item.codprod !== codprod) return item;
      const alterado = { ...item, ...mudanca };
      return { ...alterado, coberturaDias: coberturaDoItem(alterado, meses) ?? 0 };
    }));
    setAlterados((atual) => (atual.includes(codprod) ? atual : [...atual, codprod]));
  }

  /* ── montar a análise: três leituras, nenhuma escrita (D-014) ────────── */
  async function montarAnalise() {
    if (!capa) return;
    setOcupado(true);
    setErro('');
    try {
      const [analise, coberturas] = await Promise.all([
        linhas('sgcWintAnaliseMontagem', {
          codfornec: capa.codfornec, codfilial: capa.codfilial,
          dataInicio: capa.periodoInicio, dataFim: capa.periodoFim,
        }),
        linhas('sgcCoberturaListar', { nivel: '', limite: 500, offset: 0 }),
      ]);
      const codprods = analise.map((linha) => Number(linha.CODPROD)).join(',');
      // A integração pode não existir no ambiente: sem ela, as unidades por
      // caixa caem na embalagem (RN-002), que é o fallback da regra pura.
      const porCaixa = new Map<number, number>();
      try {
        for (const linha of await linhas('sgcCustoUnidadesPorCaixa', { codprods })) {
          porCaixa.set(Number(linha.CODPROD), Number(linha.UNIDADES_POR_CAIXA));
        }
      } catch { /* embalagem resolve */ }
      // R-128: o custo de compra é o custo padrão do Gestão de Custos (lotes de 500); falhou, "Erro custo" em todos.
      const custos = await carregarCustoPadrao(analise.map((linha) => Number(linha.CODPROD)));
      setAvisoCusto(custos === null ? AVISO_ERRO_CUSTO : '');

      const parametros = coberturas.map(coberturaDeLinha);
      setParametrizacao(parametros);
      const montados = montarItens(
        analise as unknown as LinhaAnalise[],
        parametros,
        porCaixa,
        { inicio: capa.periodoInicio, fim: capa.periodoFim },
        capa.codfornec,
        custos,
      );
      // O que já estava na lista manda: a análise não apaga decisão tomada.
      const jaNaLista = new Map(itens.map((item) => [item.codprod, item]));
      setItens(montados.map((item) => jaNaLista.get(item.codprod) ?? item));
      setAlterados(montados.filter((item) => !jaNaLista.has(item.codprod)).map((item) => item.codprod));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível montar a análise.');
    } finally {
      setOcupado(false);
    }
  }

  function aplicarSugestoes() {
    for (const item of itens) {
      if (item.qtSugerida > 0 && item.qtPedida !== item.qtSugerida) alterar(item.codprod, { qtPedida: item.qtSugerida });
    }
  }

  /* ── salvar: gravar em lote, recalcular alertas, espelhar na capa ───── */
  async function salvar() {
    const paraGravar = itens.filter((item) => alterados.includes(item.codprod));
    if (paraGravar.length === 0) return;
    setOcupado(true);
    setErro('');
    try {
      const gravado = await acao('sgcItensGravar', { cardId: ctx.card.id, itensJson: JSON.stringify(paraGravar) });
      if (gravado.ok === false) throw new Error(String(gravado.erro ?? 'Não foi possível gravar os itens.'));
      const alertas = await acao('sgcAlertasGerar', { cardId: ctx.card.id });
      const espelho = {
        valor_total: String(gravado.total ?? total),
        alertas_pendentes: String(alertas.naoLidos ?? 0),
      };
      if (capaMudou(ctx.card, espelho)) {
        await atualizarCapaDoQuadro(ctx.card, espelho);
        await ctx.recarregar();
      }
      await pedido.recarregar(ctx.card.id);
      setSalvoEm(horaCurta());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar os itens.');
    } finally {
      setOcupado(false);
    }
  }

  async function remover(codprod: number) {
    if (!salvos.includes(codprod)) {
      setItens((atual) => atual.filter((item) => item.codprod !== codprod));
      setAlterados((atual) => atual.filter((cod) => cod !== codprod));
      return;
    }
    const removido = pedido.itens.find((item) => item.codprod === codprod);
    setOcupado(true);
    setErro('');
    try {
      await acao('sgcEscItemRemover', { idCard: ctx.card.id, codprod, atualizadoEm: agora() });
      // Item sem origem em solicitação não dispara o par (a varredura completa
      // continua na saída da Análise, verificar-saida.ts); falhar nele não
      // desfaz a remoção, que o servidor já concedeu.
      if (removido && removido.idSolicitacao > 0) await devolverSolicitacoes(ctx.card.id, removido).catch(() => null);
      await pedido.recarregar(ctx.card.id);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível remover o item.');
    } finally {
      setOcupado(false);
    }
  }

  if (pedido.carregando) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando os itens...</p>;
  }
  if (!capa) {
    return <Alert tone="error">{pedido.erro || 'Este card não tem um pedido de compra associado.'}</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {avisoCusto ? <Alert tone="error">{avisoCusto}</Alert> : null}

      <Panel>
        <PanelHeader
          title={`Itens do pedido — ${moeda(total)}`}
          hint={salvoEm
            ? `Salvo às ${salvoEm}. ${itens.length} itens na lista.`
            : `${itens.length} itens na lista${alterados.length > 0 ? `, ${alterados.length} com alteração não salva` : ''}.`}
        >
          <Button variant="primary" size="sm" onClick={() => void salvar()} disabled={bloqueado || alterados.length === 0}>
            Salvar
          </Button>
        </PanelHeader>

        <Toolbar>
          <Button size="sm" onClick={() => void montarAnalise()} disabled={bloqueado}>
            <RefreshCw aria-hidden />
            {itens.length === 0 ? 'Montar a análise' : 'Recalcular a análise'}
          </Button>
          <Button size="sm" onClick={aplicarSugestoes} disabled={bloqueado || itens.length === 0}>
            <Wand2 aria-hidden />
            Aplicar as sugestões
          </Button>
          <Button size="sm" onClick={() => setBuscando(true)} disabled={bloqueado}>
            <ListPlus aria-hidden />
            Adicionar produto
          </Button>
        </Toolbar>

        {itens.length === 0 ? (
          <EmptyState
            title="A lista ainda está vazia"
            hint="Montar a análise traz os produtos deste fornecedor nesta filial, com venda, estoque, trânsito, sugestão e cobertura já calculados. Nada é gravado até você salvar."
            action={<Button variant="primary" onClick={() => void montarAnalise()} disabled={bloqueado}>Montar a análise</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Curva</Th>
                <Th numeric>Venda</Th>
                <Th numeric>Licitação</Th>
                <Th numeric>Estoque</Th>
                <Th numeric>Trânsito</Th>
                <Th numeric>Un/cx</Th>
                <Th numeric>Sugestão</Th>
                <Th numeric className="w-28">Quantidade</Th>
                <Th numeric className="w-28">Custo</Th>
                <Th className="w-32">Tipo de preço</Th>
                <Th>Cobertura</Th>
                <Th numeric>Total</Th>
                <Th className="w-20 text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const excedeu = acimaDoLimite(item.qtPedida > 0 ? item.coberturaDias : null, item.coberturaLimite);
                const pendente = excedeu && !item.coberturaJustificativa.trim();
                return (
                  <Tr key={item.codprod}>
                    <Td>
                      <span className="font-semibold text-ink">{item.descricao}</span>
                      <span className="block text-[12px] text-ink-secondary">
                        <Code prefix="cód.">{item.codprod}</Code> · {item.embalagem || '—'} · {item.unidade || '—'}
                      </span>
                      {item.solicitacaoDe ? (
                        <span className="block text-[12px] text-ink-secondary">Solicitação de {item.solicitacaoDe}</span>
                      ) : null}
                    </Td>
                    <Td>{item.curvaAbc}</Td>
                    <Td numeric>{item.qtVendaTotal > 0 ? quantidade(item.qtVendaTotal) : <Dash />}</Td>
                    <Td numeric>{item.qtVendaLicitacao > 0 ? quantidade(item.qtVendaLicitacao) : <Dash />}</Td>
                    <Td numeric>{item.qtEstoque > 0 ? quantidade(item.qtEstoque) : <Dash />}</Td>
                    <Td numeric>{item.qtTransito > 0 ? quantidade(item.qtTransito) : <Dash />}</Td>
                    <Td numeric>{item.unPorCaixa > 1 ? quantidade(item.unPorCaixa) : <Dash />}</Td>
                    <Td numeric>{item.qtSugerida > 0 ? quantidade(item.qtSugerida) : <Dash />}</Td>
                    <Td numeric>
                      <Input
                        type="number"
                        min={0}
                        className="text-right"
                        aria-label={`Quantidade de ${item.descricao}`}
                        value={String(item.qtPedida)}
                        disabled={bloqueado}
                        onChange={(evento) => alterar(item.codprod, { qtPedida: Number(evento.target.value) || 0 })}
                      />
                    </Td>
                    <Td numeric>
                      <Input
                        type="number"
                        min={0}
                        step="0.0001"
                        className="text-right"
                        aria-label={`Custo de ${item.descricao}`}
                        value={String(item.precoCusto)}
                        disabled={bloqueado}
                        onChange={(evento) => alterar(item.codprod, { precoCusto: Number(evento.target.value) || 0 })}
                      />
                    </Td>
                    <Td>
                      <SelectMenu
                        label={`Tipo de preço de ${item.descricao}`}
                        value={item.tipoPreco}
                        options={TIPOS_DE_PRECO}
                        disabled={bloqueado}
                        onChange={(valor) => alterar(item.codprod, { tipoPreco: valor === 'especial' ? 'especial' : 'padrao' })}
                      />
                    </Td>
                    <Td>
                      {item.qtPedida <= 0 || item.qtVendaTotal <= 0 ? <Dash /> : (
                        <Status tone={pendente ? 'attention' : excedeu ? 'off' : 'live'}>
                          {/* O teto da curva tem fração (49,5): `quantidade` é o mesmo formatador das outras células. */}
                          {`${Math.round(item.coberturaDias)} d / ${quantidade(item.coberturaLimite)} d`}
                          {pendente ? ' — justifique' : ''}
                        </Status>
                      )}
                    </Td>
                    <Td numeric>{item.qtPedida > 0 ? moeda(item.qtPedida * item.precoCusto) : <Dash />}</Td>
                    <Td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <IconButton
                          label="Justificar a cobertura acima do limite"
                          tone={pendente ? 'attention' : 'neutral'}
                          disabled={bloqueado}
                          onClick={() => setJustificando({ codprod: item.codprod, texto: item.coberturaJustificativa })}
                        >
                          <PencilLine aria-hidden />
                        </IconButton>
                        <IconButton
                          label="Remover o item do pedido"
                          tone="danger"
                          disabled={bloqueado}
                          onClick={() => void remover(item.codprod)}
                        >
                          <Trash2 aria-hidden />
                        </IconButton>
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <PrazoPagamento
        cardId={ctx.card.id}
        codfornec={capa.codfornec}
        codfilial={capa.codfilial}
        vlTotal={total}
        prazoPadrao={capa.prazoPadrao}
        prazoAcordado={capa.prazoAcordado}
        prazoJustificativa={capa.prazoJustificativa}
        bloqueado={bloqueado}
        onSalvo={(prazo) => pedido.definirCapa({ ...capa, ...prazo })}
      />

      {buscando ? (
        <BuscarProduto
          codfilial={capa.codfilial}
          jaNaLista={itens.map((item) => item.codprod)}
          onFechar={() => setBuscando(false)}
          onEscolher={(linha) => {
            const novo = itemDeProdutoBuscado(linha, parametrizacao, capa.codfornec);
            setItens((atual) => [...atual, novo]);
            setAlterados((atual) => [...atual, novo.codprod]);
            setBuscando(false);
            // R-128: o custo do produto acrescentado vem do Gestão de Custos (1 execução).
            void carregarCustoPadrao([novo.codprod]).then((custos) => {
              const custo = custoPadraoDe(custos, novo.codprod);
              if (custos === null) setAvisoCusto(AVISO_ERRO_CUSTO);
              setItens((atual) => atual.map((item) => (item.codprod === novo.codprod ? { ...item, precoCusto: custo.valor } : item)));
            });
          }}
        />
      ) : null}

      <Dialog open={justificando !== null} onOpenChange={(aberto) => !aberto && setJustificando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justificar a cobertura acima do limite</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <LabelledField
              label="Por que comprar esta quantidade?"
              hint="A justificativa é gravada no item quando você salvar a lista."
            >
              <Textarea
                rows={4}
                value={justificando?.texto ?? ''}
                onChange={(evento) => setJustificando((atual) => (atual ? { ...atual, texto: evento.target.value } : atual))}
              />
            </LabelledField>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setJustificando(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (justificando) alterar(justificando.codprod, { coberturaJustificativa: justificando.texto.trim() });
                setJustificando(null);
              }}
            >
              Usar esta justificativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
