// Os avisos de excesso em outras filiais e de estoque bloqueado no topo do
// painel e da janela "Análise do Produto" (R-130): uma faixa de alerta por
// aviso, logo abaixo do cabeçalho do produto, com o detalhe (até 6 filiais;
// os lotes, como no legado) num expandir dentro dela. O detalhe rola por
// dentro: o topo do painel é fixo e não pode crescer além da tela.
import * as React from 'react';
import { ChevronDown, Lock, Warehouse } from 'lucide-react';

import { Alert, Button } from '@/components/page';
import { fmtData } from '@/lib/formato';
import {
  MAX_FILIAIS_DETALHE, fatosDoLote, filialCurta, motivoDoLote, resumoBloqueio, resumoExcesso, textoCobertura,
} from '@/lib/avisos-produto';
import type { LoteBloqueado } from '@/lib/avisos-produto';
import type { EstadoLotes } from './use-lotes-bloqueados';
import type { FilialComExcesso } from '@/lib/ressuprimento-detalhe';
import { cn } from '@/lib/utils';
import type { ReferenciaSugestao } from '@/lib/ressuprimento';
import { VendasNaFilial } from './vendas-filial-ui';

const inteiro = (valor: unknown) => Math.round(Number(valor) || 0).toLocaleString('pt-BR');

function Expandir({ aberto, onAlternar, rotulo }: { aberto: boolean; onAlternar: () => void; rotulo: string }) {
  return (
    <Button size="sm" variant="ghost" aria-expanded={aberto} onClick={onAlternar} className="h-7 shrink-0 px-2 text-current">
      {aberto ? 'Ocultar' : rotulo}
      <ChevronDown aria-hidden className={cn('transition-transform', aberto && 'rotate-180')} />
    </Button>
  );
}

/** R-139: o cartão da filial é um botão — abre (e fecha) o gráfico de vendas dela logo abaixo dos cartões. */
function CartaoFilial({ filial, selecionada, onClick }: { filial: FilialComExcesso; selecionada: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selecionada}
      onClick={onClick}
      title={`Ver as vendas em ${filial.filial} nos últimos 6 meses`}
      className={cn(
        'flex flex-col gap-0.5 rounded-xl border bg-card px-3 py-2 text-left text-ink transition-colors',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        selecionada ? 'border-primary ring-1 ring-primary' : 'border-rule-row',
      )}
    >
      <span className="text-[12px] font-semibold" title={filial.filial}>{filialCurta(filial.codfilial, filial.filial)}</span>
      <span className="text-[12px] text-ink-secondary">{`estoque ${inteiro(filial.estoque)} · ${textoCobertura(filial.coberturaDias)}`}</span>
    </button>
  );
}

function CartaoLote({ lote }: { lote: LoteBloqueado }) {
  const fatos = fatosDoLote(lote, fmtData);
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-rule-row bg-card px-3 py-2 text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold">{`Lote ${lote.NUMLOTE || '—'}`}</p>
          <p className="text-[12px] text-ink-secondary">{motivoDoLote(lote)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-title text-[15px] font-bold text-attention">{`${inteiro(lote.QTBLOQUEADA)} un.`}</p>
          {lote.CODDEVOL ? <p className="text-[11px] text-ink-secondary">{`Motivo ${lote.CODDEVOL}`}</p> : null}
        </div>
      </div>
      {fatos.length > 0 ? (
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-secondary">
          {fatos.map((f) => (
            <div key={f.rotulo} className="flex gap-1">
              <dt className="font-semibold text-ink-muted">{f.rotulo}</dt>
              <dd>{f.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function AvisosProduto({
  codprod,
  qtBloqueada,
  lotes,
  excessos,
  amplo = false,
  semPublico,
  unidadesPorCaixa,
  referencia,
}: {
  codprod: number;
  qtBloqueada: number;
  lotes: EstadoLotes;
  excessos: FilialComExcesso[];
  /** A janela tem largura para 3 colunas de cartões; o painel, 2. */
  amplo?: boolean;
  /** R-139: o recorte de venda da tela, para o gráfico da filial. */
  semPublico: boolean;
  unidadesPorCaixa?: number;
  referencia?: ReferenciaSugestao;
}) {
  const [aberto, setAberto] = React.useState<'' | 'excesso' | 'bloqueio'>('');
  const [filialAberta, setFilialAberta] = React.useState<{ codprod: number; codfilial: string } | null>(null);
  const selecionada = filialAberta && filialAberta.codprod === codprod ? excessos.find((f) => f.codfilial === filialAberta.codfilial) ?? null : null;
  const textoExcesso = resumoExcesso(excessos);
  const listaLotes = Array.isArray(lotes) ? lotes : null;
  const textoBloqueio = resumoBloqueio(qtBloqueada, listaLotes);
  if (!textoExcesso && !textoBloqueio) return null;
  const alternar = (qual: 'excesso' | 'bloqueio') => setAberto((atual) => (atual === qual ? '' : qual));
  const grade = cn('mt-2 grid w-full max-h-64 gap-2 overflow-y-auto', amplo ? 'sm:grid-cols-3' : 'sm:grid-cols-2');

  return (
    <div className="flex flex-col gap-2">
      {textoBloqueio ? (
        <Alert tone="warn" icon={<Lock aria-hidden />}>
          {/* Uma linha só (o completo no title e no detalhe): o topo do painel não pode crescer. */}
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate font-semibold" title={textoBloqueio}>
              {textoBloqueio}
              {lotes === undefined ? <span className="font-normal"> · carregando os lotes…</span> : null}
              {lotes === null ? <span className="font-normal"> · não foi possível ler os lotes</span> : null}
            </span>
            {listaLotes && listaLotes.length > 0 ? (
              <Expandir aberto={aberto === 'bloqueio'} onAlternar={() => alternar('bloqueio')} rotulo="Ver lotes" />
            ) : null}
          </div>
          {aberto === 'bloqueio' && listaLotes ? (
            <div className={grade}>{listaLotes.map((l, i) => <CartaoLote key={`${l.NUMLOTE ?? '-'}-${i}`} lote={l} />)}</div>
          ) : null}
        </Alert>
      ) : null}
      {textoExcesso ? (
        <Alert tone="warn" icon={<Warehouse aria-hidden />}>
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate font-semibold" title={textoExcesso}>{textoExcesso}</span>
            <Expandir aberto={aberto === 'excesso'} onAlternar={() => alternar('excesso')} rotulo="Ver filiais" />
          </div>
          {aberto === 'excesso' ? (
            <div className="w-full">
              <div className={grade}>
                {excessos.slice(0, MAX_FILIAIS_DETALHE).map((f) => (
                  <CartaoFilial
                    key={f.codfilial}
                    filial={f}
                    selecionada={selecionada?.codfilial === f.codfilial}
                    onClick={() => setFilialAberta((atual) => (atual && atual.codprod === codprod && atual.codfilial === f.codfilial ? null : { codprod, codfilial: f.codfilial }))}
                  />
                ))}
              </div>
              {selecionada ? (
                <VendasNaFilial
                  codprod={codprod}
                  codfilial={selecionada.codfilial}
                  filial={filialCurta(selecionada.codfilial, selecionada.filial)}
                  estoque={selecionada.estoque}
                  semPublico={semPublico}
                  unidadesPorCaixa={unidadesPorCaixa}
                  referencia={referencia}
                />
              ) : null}
            </div>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
