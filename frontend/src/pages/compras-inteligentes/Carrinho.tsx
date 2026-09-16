// O carrinho da spec 011 (RF-017, RF-018 / C-018, C-019, RN-015, RN-016).
//
// O pedido nasce pelo MESMO caminho de `/pedidos/novo` (R-091/D-007): três
// execuções por grupo de fornecedor + filial — `api.cardCriar` (o motor da lib,
// que dá ordem, texto de busca, movimento inicial e automação), `sgcEscPedidoCriar`
// com `origem: 'compras_inteligentes'` e `sgcItensGravar` em lote. Nenhuma
// Server Function JavaScript nova.
//
// O `valor_total` da capa vai no próprio `cardCriar`, porque a tela já sabe a
// soma: um `kbCardAtualizar` a mais custaria execução (D-008).
import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { useKanban } from '@benenutri/mitra-kanban';

import {
  Alert, Button, Code, Dash, EmptyState, IconButton, Panel, PanelHeader, RowMeta, RowTitle,
  Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import { moeda } from '@/lib/formato';
import { instanteIso, tituloDoPedido } from '@/lib/pedido';
import { agruparCarrinho, coberturaFuturaComCompra, itemDoCarrinho, motivoDaSugestao } from '@/lib/ressuprimento';
import type { EntradaCarrinho, LinhaRessuprimento } from '@/lib/ressuprimento';

/** Só as fases em que o pedido ainda bloqueia o carrinho (RN-016). */
const NOME_DA_FASE: Record<string, string> = {
  analise: 'Análise/Montagem de Pedido',
  tecnica: 'Aprovação Técnica',
  diretoria: 'Aprovação da Diretoria',
  envio: 'Envio para Indústria',
};

export interface PedidoAberto {
  idCard: number;
  titulo: string;
  faseChave: string;
}

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function Carrinho({
  itens,
  boardId,
  usuarioId,
  periodo,
  pedidoAberto,
  podeOperar,
  motivoBloqueio,
  coberturaLimiteDe,
  onRemover,
  onLimpar,
  onCriado,
}: {
  itens: EntradaCarrinho[];
  boardId: number;
  usuarioId: number;
  periodo: { inicio: string; fim: string };
  /** O pedido do fornecedor + filial que ainda não foi enviado à indústria, se houver. */
  pedidoAberto: PedidoAberto | null;
  podeOperar: boolean;
  motivoBloqueio: string;
  /** O limite de cobertura resolvido para a linha — injetado pela página (R-111). */
  coberturaLimiteDe: (linha: LinhaRessuprimento) => number;
  onRemover: (codprod: number, codfilial: string) => void;
  onLimpar: () => void;
  onCriado: (cardId: number) => void;
}) {
  const api = useKanban();
  const [erro, setErro] = React.useState('');
  const [criando, setCriando] = React.useState(false);

  const grupos = React.useMemo(() => agruparCarrinho(itens), [itens]);
  const total = grupos.reduce((soma, grupo) => soma + grupo.total, 0);

  async function criarPedidos() {
    if (pedidoAberto) return;
    setCriando(true);
    setErro('');
    try {
      let ultimo = 0;
      for (const grupo of grupos) {
        // 1 — o card, com a capa do quadro já preenchida (D-008).
        const criado = await api.cardCriar({
          boardId,
          titulo: tituloDoPedido(grupo.filial, grupo.fornecedor),
          valores: {
            fornecedor: grupo.fornecedor,
            filial: grupo.filial,
            prioridade: grupo.prioridade,
            valor_total: String(grupo.total),
          },
          responsaveisIds: usuarioId ? [usuarioId] : [],
        });
        if (!criado.ok || !criado.id) throw new Error(criado.error || 'O pedido não foi criado.');

        // 2 — a capa em SGC_PEDIDO, com a origem que recorta a eficiência (R-092).
        await linhas('sgcEscPedidoCriar', {
          cardId: criado.id,
          codfornec: grupo.codfornec,
          fornecedor: grupo.fornecedor,
          codfilial: grupo.codfilial,
          filial: grupo.filial,
          periodoInicio: periodo.inicio,
          periodoFim: periodo.fim,
          origem: 'compras_inteligentes',
          agora: instanteIso(),
        });

        // 3 — os itens, INTEIROS (R-112), num upsert em lote que já recalcula o
        // total da capa. Campo que nascer vazio fica vazio para sempre, porque a
        // remontagem da Análise preserva o item existente (RN-017).
        const itensJson = grupo.itens.map(
          ({ linha, quantidade: escolhida }) => itemDoCarrinho(linha, escolhida, coberturaLimiteDe(linha)),
        );
        const gravado = await acao('sgcItensGravar', { cardId: criado.id, itensJson: JSON.stringify(itensJson) });
        if (gravado && gravado.ok === false) throw new Error(String(gravado.erro ?? 'Os itens não foram gravados.'));
        ultimo = criado.id;
      }
      onLimpar();
      if (ultimo) onCriado(ultimo);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível criar o pedido.');
    } finally {
      setCriando(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={`Carrinho — ${moeda(total)}`}
        hint={itens.length === 0
          ? 'Escolha os produtos na lista acima; cada fornecedor e filial vira um pedido.'
          : `${itens.length} produtos em ${grupos.length} ${grupos.length === 1 ? 'pedido' : 'pedidos'}.`}
      >
        <Button size="sm" onClick={onLimpar} disabled={criando || itens.length === 0}>Esvaziar</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void criarPedidos()}
          disabled={criando || itens.length === 0 || !podeOperar || Boolean(pedidoAberto)}
          title={!podeOperar ? motivoBloqueio : pedidoAberto ? 'Já existe um pedido aberto para este fornecedor e filial.' : undefined}
        >
          {criando ? 'Criando...' : 'Criar o pedido'}
        </Button>
      </PanelHeader>

      {erro ? <Toolbar><Alert tone="error">{erro}</Alert></Toolbar> : null}

      {/* RF-018: a recusa cita o pedido e a fase em que ele está. */}
      {pedidoAberto ? (
        <Toolbar>
          <Alert tone="warn">
            {`Já existe um pedido aberto para este fornecedor e filial: ${pedidoAberto.titulo}, em ${NOME_DA_FASE[pedidoAberto.faseChave] ?? pedidoAberto.faseChave}. `}
            Envie ou cancele esse pedido antes de abrir outro.
          </Alert>
        </Toolbar>
      ) : null}

      {itens.length === 0 ? (
        <EmptyState
          title="O carrinho está vazio"
          hint="O pedido nasce na Análise/Montagem, com os itens já dentro e a quantidade que você escolheu."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th>Pedido</Th>
              <Th>Por que comprar</Th>
              <Th numeric>Quantidade</Th>
              <Th numeric>Cobertura futura</Th>
              <Th numeric>Total</Th>
              <Th className="w-16 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => grupo.itens.map(({ linha, quantidade: escolhida }) => {
              const codprod = Number(linha.medida.CODPROD);
              const futura = coberturaFuturaComCompra(linha, escolhida);
              return (
                <Tr key={`${grupo.codfornec}-${grupo.codfilial}-${codprod}`}>
                  <Td>
                    <RowTitle>{String(linha.medida.DESCRICAO)}</RowTitle>
                    <RowMeta><Code prefix="cód.">{codprod}</Code></RowMeta>
                  </Td>
                  <Td>
                    {tituloDoPedido(grupo.filial, grupo.fornecedor)}
                    <RowMeta>
                      <Status tone={grupo.prioridade === 'alta' ? 'alert' : 'live'}>
                        {grupo.prioridade === 'alta' ? 'Prioridade alta' : 'Prioridade normal'}
                      </Status>
                    </RowMeta>
                  </Td>
                  <Td>{motivoDaSugestao(linha)}</Td>
                  <Td numeric>{quantidade(escolhida)}</Td>
                  <Td numeric>{futura === null ? <Dash /> : `${Math.round(futura)} d`}</Td>
                  <Td numeric>{moeda(escolhida * Number(linha.medida.CUSTO_ULT_ENTRADA))}</Td>
                  <Td className="text-right">
                    <IconButton
                      label="Tirar do carrinho"
                      tone="danger"
                      disabled={criando}
                      onClick={() => onRemover(codprod, grupo.codfilial)}
                    >
                      <Trash2 aria-hidden />
                    </IconButton>
                  </Td>
                </Tr>
              );
            }))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
