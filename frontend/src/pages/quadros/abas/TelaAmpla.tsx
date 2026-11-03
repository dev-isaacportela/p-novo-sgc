// A tela ampla da análise do pedido (R-133): um diálogo de tela cheia (até
// 1600 px) com as abas Análise (`tela-ampla-analise.tsx`) e Itens do pedido —
// no legado, "Carrinho". Tudo o que se muda aqui vai para o rascunho e só é
// gravado no Salvar do rodapé (as mesmas TRÊS chamadas, RNF-001).
//
// Atalhos: "/" foca a busca da Análise; Esc limpa a busca e, num segundo Esc,
// fecha a janela.
import * as React from 'react';
import { PencilLine, Trash2 } from 'lucide-react';
import {
  Alert, Button, ChipContagem, Code, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState,
  IconButton, Input, Status, TextLink,
} from '@/components/page';
import { cn } from '@/lib/utils';
import { hojeIso, moeda } from '@/lib/formato';
import { custoPadraoDe } from '@/lib/compras';
import { acimaDoLimite } from '@/lib/cobertura';
import { diferencaDoItem, rodapeDosItens, rotuloDias } from '@/lib/analise-pedido';
import { seloDoCusto, tabelasVigentes } from '@/lib/custo-do-item';
import { estaNoPedido, plural } from '@/lib/resumo-pedido';
import { useRascunho } from './rascunho-contexto';
import { AnaliseAmpla } from './tela-ampla-analise';
import { SeletorDeCusto } from './SeletorDeCusto';

type Aba = 'analise' | 'itens';
const fmt = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const TOM = { alert: 'alert', attention: 'attention', off: 'off' } as const;

export default function TelaAmpla({ aberta, onFechar, titulo }: { aberta: boolean; onFechar: () => void; titulo: string }) {
  const r = useRascunho();
  const [aba, setAba] = React.useState<Aba>('analise');
  const [busca, setBusca] = React.useState('');
  const refBusca = React.useRef<HTMLInputElement | null>(null);
  const noPedido = r.itens.filter(estaNoPedido);

  React.useEffect(() => {
    if (!aberta || aba !== 'analise') return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.key !== '/' || alvo?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      refBusca.current?.focus();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta, aba]);

  return (
    <Dialog open={aberta} onOpenChange={(abrir) => !abrir && !r.ocupado && onFechar()}>
      <DialogContent
        className="h-[92vh] max-h-[92vh] sm:max-w-[min(1600px,calc(100%-2rem))]"
        onEscapeKeyDown={(e) => {
          if (busca) { e.preventDefault(); setBusca(''); }
        }}
      >
        <DialogHeader>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pr-8">
            <DialogTitle className="min-w-0 truncate">Análise de produtos</DialogTitle>
            <span className="min-w-0 truncate text-[12px] text-ink-secondary">{titulo}</span>
            <div className="ml-auto flex gap-1.5" role="tablist" aria-label="Abas da tela ampla">
              <ChipContagem ativo={aba === 'analise'} onClick={() => setAba('analise')}>Análise</ChipContagem>
              <ChipContagem ativo={aba === 'itens'} onClick={() => setAba('itens')}>{`Itens do pedido (${noPedido.length})`}</ChipContagem>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
          {r.erro ? <Alert tone="error">{r.erro}</Alert> : null}
          {r.avisoCusto ? <Alert tone="error">{r.avisoCusto}</Alert> : null}
          {aba === 'analise' ? <AnaliseAmpla busca={busca} onBusca={setBusca} refBusca={refBusca} /> : <ItensDoPedido />}
        </div>

        <DialogFooter className="sm:items-center">
          <span className="mr-auto text-[12px] text-ink-secondary">
            {r.alterados.length > 0
              ? `${plural(r.alterados.length, 'alteração não salva', 'alterações não salvas')} · total ${moeda(r.total)}`
              : r.salvoEm ? `Salvo às ${r.salvoEm} · total ${moeda(r.total)}` : `Total ${moeda(r.total)}`}
          </span>
          <Button onClick={onFechar} disabled={r.ocupado}>Fechar</Button>
          <Button variant="primary" onClick={() => void r.salvar()} disabled={r.bloqueado || r.alterados.length === 0}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A aba Itens do pedido: o "carrinho" do legado, só com o que tem quantidade. */
function ItensDoPedido() {
  const r = useRascunho();
  const hoje = hojeIso();
  const itens = r.itens.filter(estaNoPedido);
  const rodape = rodapeDosItens(itens);
  if (itens.length === 0) {
    return <EmptyState title="Nenhum item no pedido" hint="Adicione produtos na aba Análise." />;
  }
  const celula = 'border-b border-rule-row px-3 py-2 align-top';
  const cabeca = 'sticky top-0 z-10 border-b border-rule-row bg-card px-3 py-2 text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink-muted uppercase';
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-rule-table">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th scope="col" className={cn(cabeca, 'text-left')}>Produto</th>
            <th scope="col" className={cn(cabeca, 'text-right')}>Sugerida</th>
            <th scope="col" className={cn(cabeca, 'text-right')}>Pedido</th>
            <th scope="col" className={cn(cabeca, 'text-right')}>Diferença</th>
            <th scope="col" className={cn(cabeca, 'text-right')}>Dias</th>
            <th scope="col" className={cn(cabeca, 'text-left')}>Custo un.</th>
            <th scope="col" className={cn(cabeca, 'text-right')}>Total</th>
            <th scope="col" className={cabeca}><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const diferenca = diferencaDoItem(item);
            const dias = rotuloDias(item.qtVendaTotal > 0 ? item.coberturaDias : null, item.coberturaLimite);
            const pendente = acimaDoLimite(item.qtVendaTotal > 0 ? item.coberturaDias : null, item.coberturaLimite) && !item.coberturaJustificativa.trim();
            const selo = seloDoCusto(item.tipoPreco);
            return (
              <tr key={item.codprod} className={cn('transition-colors hover:bg-accent', item.tipoPreco === 'especial' && 'bg-attention-bg')}>
                <td className={celula}>
                  <span className="block font-semibold break-words text-ink">{item.descricao}</span>
                  <span className="block text-[12px] text-ink-secondary">
                    <Code>{item.codprod}</Code>{` · ${item.embalagem || '—'}${item.solicitacaoDe ? ` · solicitação de ${item.solicitacaoDe}` : ''}`}
                  </span>
                  <TextLink className="text-[12px]" disabled={r.bloqueado} onClick={() => r.abrirTexto(item.codprod, 'observacao')}>
                    {item.observacao ? `Observação: ${item.observacao}` : 'Adicionar observação'}
                  </TextLink>
                </td>
                <td className={cn(celula, 'text-right whitespace-nowrap')}>{fmt(item.qtSugerida)}</td>
                <td className={cn(celula, 'text-right')}>
                  <Input
                    type="number"
                    min={0}
                    className="ml-auto h-8 w-24 text-right"
                    aria-label={`Quantidade de ${item.descricao}`}
                    value={String(item.qtPedida)}
                    disabled={r.bloqueado}
                    onChange={(evento) => r.alterar(item.codprod, { qtPedida: Math.max(0, Number(evento.target.value) || 0) })}
                  />
                </td>
                <td className={cn(celula, 'text-right whitespace-nowrap')}>
                  {diferenca.tom === 'neutral' ? '0' : <Status tone={diferenca.tom}>{`${diferenca.valor > 0 ? '+' : ''}${fmt(diferenca.valor)}`}</Status>}
                </td>
                <td className={cn(celula, 'text-right whitespace-nowrap')}>
                  <span className="inline-flex items-center gap-1">
                    {dias.tom === 'neutral' ? dias.texto : <Status tone={TOM[dias.tom]}>{dias.texto}</Status>}
                    <IconButton
                      label={pendente ? 'Justificar a cobertura acima do limite (pendente)' : 'Justificar a cobertura acima do limite'}
                      tone={pendente ? 'attention' : 'neutral'}
                      disabled={r.bloqueado}
                      onClick={() => r.abrirTexto(item.codprod, 'justificativa')}
                    >
                      <PencilLine aria-hidden />
                    </IconButton>
                  </span>
                  {pendente ? <span className="block text-[11px] text-attention">justifique</span> : null}
                </td>
                <td className={cn(celula, 'w-56 min-w-56')}>
                  <SeletorDeCusto
                    rotulo={item.descricao}
                    tipoPreco={item.tipoPreco}
                    precoCusto={item.precoCusto}
                    padrao={custoPadraoDe(r.analise?.custos, item.codprod)}
                    tabelas={tabelasVigentes(r.analise?.especiais ?? [], item.codprod, hoje)}
                    disabled={r.bloqueado}
                    onEscolher={(custo) => r.alterar(item.codprod, custo)}
                  />
                  {selo ? <span className="mt-0.5 block text-[11px] font-semibold text-attention">{selo}</span> : null}
                </td>
                <td className={cn(celula, 'text-right whitespace-nowrap')}>{moeda(item.qtPedida * item.precoCusto)}</td>
                <td className={cn(celula, 'text-right')}>
                  <IconButton label={`Tirar ${item.descricao} do pedido`} tone="danger" disabled={r.bloqueado} onClick={() => void r.remover(item.codprod)}>
                    <Trash2 aria-hidden />
                  </IconButton>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="text-[12px] font-semibold text-ink">
            <td className="sticky bottom-0 border-t border-rule-table bg-card px-3 py-2">{`${plural(itens.length, 'item', 'itens')} · ${fmt(rodape.unidades)} un.`}</td>
            <td className="sticky bottom-0 border-t border-rule-table bg-card px-3 py-2 font-normal text-ink-secondary" colSpan={4}>{rodape.custos}</td>
            <td className="sticky bottom-0 border-t border-rule-table bg-card" />
            <td className="sticky bottom-0 border-t border-rule-table bg-card px-3 py-2 text-right">{moeda(rodape.total)}</td>
            <td className="sticky bottom-0 border-t border-rule-table bg-card" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
