// Visão de calendário da agenda (R-121, spec 004 C-022): a grade do mês com os
// agendamentos de cada dia — a data da análise e as recorrências projetadas
// até o fim do mês (`agruparPorDia`, regra pura). A grade, a navegação e o
// calendário são os mesmos helpers do DatePicker (`lib/data.ts`).
//
// Clicar num agendamento abre a edição (quem pode); a situação é a mesma régua
// da lista (`situacao`), com ponto e texto, nunca só cor.
import * as React from 'react';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';

import { Button, EmptyState, Status } from '@/components/page';
import { gradeDoMes, mesAdjacente, nomeDiaSemanaAbrev, nomeMes } from '@/lib/data';
import { agruparPorDia, situacao } from '@/lib/agenda';
import type { SituacaoAgenda } from '@/lib/agenda';
import { hojeIso } from '@/lib/formato';
import { cn } from '@/lib/utils';

export interface LinhaDoCalendario {
  ID: number; FORNECEDOR: string; FILIAL: string; CODFILIAL: string;
  DATA_ANALISE: string; RECORRENCIA: string; DATA_LIMITE_RECORRENCIA?: string | null;
  ATIVO: number; PROCESSADO_EM: string | null;
}

const TOM: Record<SituacaoAgenda, 'off' | 'alert' | 'live'> = {
  pendente: 'off', atrasado: 'alert', processado: 'live', cancelado: 'off',
};

const DOIS = (n: number) => String(n).padStart(2, '0');
const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export function AgendaCalendario({
  mes,
  onMes,
  linhas,
  carregando,
  podeEditar,
  onEditar,
}: {
  /** `AAAA-MM`. */
  mes: string;
  onMes: (mes: string) => void;
  linhas: LinhaDoCalendario[];
  carregando: boolean;
  podeEditar: boolean;
  onEditar: (id: number) => void;
}) {
  const [ano, numeroMes] = mes.split('-').map(Number);
  const hoje = hojeIso();
  const dias = React.useMemo(() => gradeDoMes(ano, numeroMes), [ano, numeroMes]);
  const porDia = React.useMemo(() => agruparPorDia(linhas, mes), [linhas, mes]);
  const irPara = (delta: number) => {
    const alvo = mesAdjacente({ ano, mes: numeroMes }, delta);
    onMes(`${alvo.ano}-${DOIS(alvo.mes)}`);
  };
  const totalNoMes = [...porDia.values()].reduce((soma, lista) => soma + lista.length, 0);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => irPara(-1)} aria-label="Mês anterior"><ChevronLeft aria-hidden /></Button>
          <Button size="sm" onClick={() => irPara(1)} aria-label="Mês seguinte"><ChevronRight aria-hidden /></Button>
          <Button size="sm" onClick={() => onMes(hoje.slice(0, 7))}>Hoje</Button>
          <span className="ml-2 font-title text-[15px] font-bold text-ink">{`${capitalizar(nomeMes(numeroMes))} de ${ano}`}</span>
        </div>
        <span className="text-[12px] text-ink-secondary">
          {carregando ? 'Carregando...' : `${totalNoMes} ${totalNoMes === 1 ? 'análise' : 'análises'} no mês, recorrências incluídas`}
        </span>
      </div>

      {/* Legenda: a situação é ponto + texto (nunca só cor); recorrência e hoje têm marca própria. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-secondary" aria-label="Legenda">
        <Status tone="off">Pendente</Status>
        <Status tone="alert">Atrasado</Status>
        <Status tone="live">Processado</Status>
        <Status tone="off">Cancelado</Status>
        <span className="inline-flex items-center gap-1"><Repeat className="size-3 text-ink-muted" aria-hidden />recorrência projetada</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm ring-2 ring-brand-500" aria-hidden />hoje</span>
      </div>

      {!carregando && totalNoMes === 0 ? (
        <EmptyState title="Nenhuma análise neste mês" hint="Use as setas para outro mês ou crie um agendamento." />
      ) : null}

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${nomeMes(numeroMes)} de ${ano}`}>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="px-1 py-1 text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase" aria-hidden>
            {nomeDiaSemanaAbrev(i)}
          </span>
        ))}
        {dias.map((dia) => {
          const doDia = porDia.get(dia.iso) ?? [];
          const ehHoje = dia.iso === hoje;
          return (
            <div
              key={dia.iso}
              role="gridcell"
              aria-label={dia.iso}
              className={cn(
                'flex min-h-24 min-w-0 flex-col gap-1 overflow-hidden rounded-lg border border-rule-row p-1.5',
                !dia.noMes && 'bg-muted/40 text-ink-muted',
                ehHoje && 'ring-2 ring-brand-500',
              )}
            >
              <span className={cn('text-[12px] font-semibold', dia.noMes ? 'text-ink' : 'text-ink-muted')}>
                {Number(dia.iso.slice(8, 10))}
              </span>
              {doDia.map(({ linha, recorrente }) => {
                const sit = situacao(linha, hoje);
                const rotulo = `${linha.FORNECEDOR} · ${linha.FILIAL || linha.CODFILIAL}`;
                const conteudo = (
                  <>
                    <Status tone={TOM[sit]} truncar>{rotulo}</Status>
                    {recorrente ? <Repeat className="size-3 shrink-0 text-ink-muted" aria-label="recorrência" /> : null}
                  </>
                );
                return podeEditar && (sit === 'pendente' || sit === 'atrasado') && !recorrente ? (
                  <button
                    key={`${linha.ID}-${dia.iso}`}
                    type="button"
                    onClick={() => onEditar(linha.ID)}
                    title={`Editar: ${rotulo}`}
                    className="flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                  >
                    {conteudo}
                  </button>
                ) : (
                  <span
                    key={`${linha.ID}-${dia.iso}`}
                    title={recorrente ? `Recorrência de ${rotulo}` : rotulo}
                    className="flex w-full min-w-0 items-center gap-1 overflow-hidden px-1 py-0.5 text-[12px]"
                  >
                    {conteudo}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
