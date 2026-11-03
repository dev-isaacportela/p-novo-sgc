// A aba "Nesta fase" do card de empenho (spec 015 da lib): o que aparece muda
// com a fase e com o papel do card. Empenho: cabeçalho (editável na Análise,
// C-019), itens (a análise na Análise, só leitura depois), aprovações e os
// pedidos desmembrados com "faltam N de M". Pedido da indústria ou de
// transferência: dados do pedido, itens e pendências. Toda seção nasce
// recolhida com um resumo (R-126).
import * as React from 'react';
import { useKanban, type ExtensaoContexto } from '@benenutri/mitra-kanban';

import { linhas } from '@/lib/mitra-api';
import { fmtData, fmtDataHora, moeda, numeroPt } from '@/lib/formato';
import { instanteIso } from '@/lib/pedido';
import {
  alertaDoEmpenho, dataLimite, destinoAoFecharPendencia, diasAte, hojeEmBrasilia, itemDeLinha, prazoEmDias, textoSituacao,
  tituloDoEmpenho, type UnidadePrazo,
} from '@/lib/empenhos';
import {
  Alert, AlternaOpcoes, Badge, Button, CheckRow, Dash, Field, Input, LabelledField, SecaoRecolhivel, Status, Table, Td, Textarea, Th, Tr,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { cargaDoCard, useEmpenho } from '@/pages/empenhos/contexto';
import Analise from '@/pages/empenhos/analise';
import { CampoNumero, ResumoCmv } from '@/pages/empenhos/itens';
import { atualizarCapa, reagruparSePreciso } from '@/pages/empenhos/operacoes';

const TOM_ALERTA = { vencido: 'alert', critico: 'alert', atencao: 'attention' } as const;
const ROTULO_PENDENCIA: Record<string, string> = { BO: 'Falta na indústria', VENDA: 'Venda pendente', TRANSFERENCIA: 'Transferência' };
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function useSecoes(inicial: string | null = null) {
  const [aberta, setAberta] = React.useState<string | null>(inicial);
  return (id: string) => ({ aberta: aberta === id, onToggle: () => setAberta((a) => (a === id ? null : id)) });
}

/** C-019: número, recebimento, prazo/data limite, filial do pedido e "aceita parcial", só na Análise. */
function Cabecalho({ cardId, empenho, editavel, onSalvo, avisar }: {
  cardId: number; empenho: Record<string, unknown>; editavel: boolean; onSalvo: () => Promise<void>; avisar: ExtensaoContexto['avisar'];
}) {
  const api = useKanban();
  const [d, setD] = React.useState(() => ({
    numEmpenho: txt(empenho.NUM_EMPENHO), dtRecebimento: txt(empenho.DT_RECEBIMENTO), prazoDias: Number(empenho.PRAZO_DIAS) || 0,
    prazoUnidade: (txt(empenho.PRAZO_UNIDADE) === 'UTEIS' ? 'UTEIS' : 'CORRIDOS') as UnidadePrazo, dtLimite: txt(empenho.DT_LIMITE),
    codfilialPedido: txt(empenho.CODFILIAL_PEDIDO) || txt(empenho.CODFILIAL), aceitaParcial: Number(empenho.ACEITA_PARCIAL) === 1,
    observacao: txt(empenho.OBSERVACAO),
  }));
  const [gravando, setGravando] = React.useState(false);
  const comPrazo = (prazoDias: number, unidade = d.prazoUnidade, recebimento = d.dtRecebimento) =>
    setD((a) => ({ ...a, prazoDias, prazoUnidade: unidade, dtRecebimento: recebimento, dtLimite: dataLimite(recebimento, prazoDias, unidade) || a.dtLimite }));

  async function salvar() {
    setGravando(true);
    try {
      await linhas('sgcEscEmpCabecalhoSalvar', { cardId, ...d, aceitaParcial: d.aceitaParcial ? 1 : 0, agora: instanteIso() });
      await atualizarCapa(api, cardId, { titulo: tituloDoEmpenho(txt(empenho.CODIGO_EDITAL), d.numEmpenho), prazo: d.dtLimite });
      avisar('success', 'Cabeçalho salvo.');
      await onSalvo();
    } catch (erro) {
      avisar('error', erro instanceof Error ? erro.message : 'O cabeçalho não foi gravado.');
    } finally {
      setGravando(false);
    }
  }

  if (!editavel) {
    return (
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        {[
          ['Pregão', `${txt(empenho.CODIGO_EDITAL)} · ${txt(empenho.ORGAO)}`],
          ['Nº do empenho', txt(empenho.NUM_EMPENHO) || 'sem número'],
          ['Filial do contrato', `${txt(empenho.CODFILIAL)} — ${txt(empenho.FILIAL)}`],
          ['Filial do pedido', txt(empenho.CODFILIAL_PEDIDO) || txt(empenho.CODFILIAL)],
          ['Recebimento', fmtData(txt(empenho.DT_RECEBIMENTO))],
          ['Prazo', `${numeroPt(Number(empenho.PRAZO_DIAS) || 0)} dias ${txt(empenho.PRAZO_UNIDADE) === 'UTEIS' ? 'úteis' : 'corridos'} · limite ${fmtData(txt(empenho.DT_LIMITE))}`],
          ['Aceita parcial', Number(empenho.ACEITA_PARCIAL) === 1 ? 'Sim' : 'Não'],
          ['Observação', txt(empenho.OBSERVACAO) || '—'],
        ].map(([rotulo, valor]) => (
          <div key={rotulo}><dt className="text-[12px] text-ink-secondary">{rotulo}</dt><dd className="text-ink">{valor}</dd></div>
        ))}
      </dl>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <LabelledField label="Nº do empenho"><Input value={d.numEmpenho} onChange={(e) => setD((a) => ({ ...a, numEmpenho: e.target.value }))} /></LabelledField>
      <LabelledField label="Filial do pedido" hint="Os pedidos às indústrias saem por ela (C-011).">
        <Input value={d.codfilialPedido} onChange={(e) => setD((a) => ({ ...a, codfilialPedido: e.target.value.replace(/\D/g, '') }))} />
      </LabelledField>
      <Field label="Recebimento" obrigatorio><DatePicker value={d.dtRecebimento} onChange={(v) => comPrazo(d.prazoDias, d.prazoUnidade, v)} aria-label="Recebimento" /></Field>
      <Field label="Prazo de entrega">
        <div className="flex items-center gap-2">
          <CampoNumero rotulo="Prazo em dias" valor={d.prazoDias} onChange={(v) => comPrazo(Math.round(v))} className="w-20 text-right" />
          <AlternaOpcoes<UnidadePrazo> rotulo="Unidade do prazo" opcoes={[{ value: 'CORRIDOS', label: 'Corridos' }, { value: 'UTEIS', label: 'Úteis' }]} valor={d.prazoUnidade} onValor={(u) => comPrazo(d.prazoDias, u)} />
        </div>
      </Field>
      <Field label="Data limite de entrega">
        <DatePicker value={d.dtLimite} aria-label="Data limite" onChange={(v) => setD((a) => ({ ...a, dtLimite: v, prazoDias: prazoEmDias(a.dtRecebimento, v, a.prazoUnidade) ?? a.prazoDias }))} />
      </Field>
      <Field label="Entrega parcial">
        <CheckRow marcado={d.aceitaParcial} onToggle={() => setD((a) => ({ ...a, aceitaParcial: !a.aceitaParcial }))}>O órgão aceita entrega parcial</CheckRow>
      </Field>
      <LabelledField label="Observação" className="sm:col-span-2"><Textarea rows={2} value={d.observacao} onChange={(e) => setD((a) => ({ ...a, observacao: e.target.value }))} /></LabelledField>
      <div className="flex justify-end sm:col-span-2"><Button variant="primary" onClick={salvar} disabled={gravando || !d.dtRecebimento}>{gravando ? 'Salvando...' : 'Salvar cabeçalho'}</Button></div>
    </div>
  );
}

export default function ConteudoEmpenho({ ctx }: { ctx: ExtensaoContexto }) {
  const api = useKanban();
  const valor = useEmpenho();
  const { fases, sessao } = valor;
  const carga = cargaDoCard(valor, ctx.card.id);
  const secao = useSecoes();
  const [fechando, setFechando] = React.useState<number | null>(null);
  const chave = fases.chaveDe(ctx.card.faseId);

  if (!carga) return <p className="text-[13px] text-ink-secondary">Carregando o empenho...</p>;
  if (!carga.ok || !carga.empenho) return <Alert tone="warn">Este card não tem empenho vinculado.</Alert>;
  const e = carga.empenho;
  const itens = (carga.itens ?? []).map(itemDeLinha);
  const pedidos = carga.pedidos ?? [];
  const papel = String(carga.papel ?? '');
  const recarregar = async () => {
    await valor.recarregar();
    await ctx.recarregar();
  };
  const hoje = hojeEmBrasilia();
  const alerta = (chave === 'emp_concluido' || chave === 'emp_cancelado') ? null : alertaDoEmpenho(diasAte(hoje, txt(e.DT_LIMITE)), diasAte(hoje, txt(e.DT_VIGENCIA_FIM)));
  const congelado = txt(e.CONGELADO_EM)
    ? { valor: Number(e.VL_TOTAL) || 0, custo: Number(e.VL_CUSTO) || 0, cmv: e.CMV_PERC === null ? null : Number(e.CMV_PERC), em: txt(e.CONGELADO_EM) }
    : null;
  const situacao = textoSituacao(papel === 'EMPENHO' ? 'EMPENHO' : 'FORNECEDOR', pedidos, ctx.card.id);
  const resumoCabecalho = [`${txt(e.CODIGO_EDITAL)} · ${txt(e.ORGAO)}`, `limite ${fmtData(txt(e.DT_LIMITE))}`].join(' · ');
  const extraAlerta = alerta ? <Status tone={TOM_ALERTA[alerta.nivel]}>{alerta.texto}</Status> : null;
  const editavel = papel === 'EMPENHO' && chave === 'emp_analise' && sessao.permissoes.operarEmpenhos && !ctx.travado;

  async function fecharPendencia(id: number, status: 'RESOLVIDA' | 'CANCELADA') {
    setFechando(id);
    try {
      await linhas('sgcEscEmpPendenciaFechar', { id, status, agora: instanteIso() });
      const abertas = (carga!.pendencias ?? []).filter((pd) => Number(pd.ID_CARD) === ctx.card.id && txt(pd.STATUS) === 'ABERTA' && Number(pd.ID) !== id).length;
      const destino = destinoAoFecharPendencia(chave, abertas);
      if (destino) await ctx.mover(fases.faseIdDe(destino));
      await reagruparSePreciso(api, ctx.card.id, fases);
    } catch (erro) {
      ctx.avisar('error', erro instanceof Error ? erro.message : 'A pendência não foi fechada.');
    } finally {
      setFechando(null);
      await recarregar();
    }
  }

  const reprovacao = txt(e.REPROV_MOTIVO);
  const blocos: React.ReactNode[] = [];

  if (papel === 'EMPENHO') {
    blocos.push(
      <SecaoRecolhivel key="cab" titulo="Empenho" resumo={resumoCabecalho} extra={extraAlerta} {...secao('cab')}>
        <Cabecalho cardId={ctx.card.id} empenho={e} editavel={editavel} onSalvo={recarregar} avisar={ctx.avisar} />
      </SecaoRecolhivel>,
      <SecaoRecolhivel key="itens" titulo={chave === 'emp_analise' ? 'Análise dos itens' : 'Itens'} {...secao('itens')}
        resumo={<ResumoCmv itens={itens} congelado={congelado} />}>
        <Analise key={itens.map((i) => `${i.codprod}:${i.qtCompra}:${i.qtTransferencia}:${i.qtEstoque}:${i.precoVenda}`).join('|')}
          cardId={ctx.card.id} itensIniciais={itens} codfilial={txt(e.CODFILIAL)} codcli={Number(e.CODCLI) || 0}
          editavel={editavel} onSalvo={recarregar} avisar={ctx.avisar} />
      </SecaoRecolhivel>,
    );
    if (txt(e.TEC_EM) || txt(e.DIR_EM) || reprovacao || txt(e.CANC_MOTIVO)) {
      blocos.push(
        <SecaoRecolhivel key="decisoes" titulo="Decisões" {...secao('decisoes')}
          resumo={[txt(e.TEC_EM) && 'técnica aprovada', txt(e.DIR_EM) && 'diretoria aprovada', reprovacao && 'reprovado', txt(e.CANC_MOTIVO) && 'cancelado'].filter(Boolean).join(' · ')}>
          <ul className="flex flex-col gap-2 text-[13px] text-ink">
            {txt(e.TEC_EM) ? <li>Aprovação técnica por {txt(e.TEC_NOME) || '—'} em {fmtDataHora(txt(e.TEC_EM))}</li> : null}
            {txt(e.DIR_EM) ? <li>Aprovação da diretoria por {txt(e.DIR_NOME) || '—'} em {fmtDataHora(txt(e.DIR_EM))}</li> : null}
            {reprovacao ? <li>Reprovado ({txt(e.REPROV_FASE)}) por {txt(e.REPROV_NOME) || '—'} em {fmtDataHora(txt(e.REPROV_EM))}: “{reprovacao}”</li> : null}
            {txt(e.CANC_MOTIVO) ? <li>Cancelado por {txt(e.CANC_NOME) || '—'} em {fmtDataHora(txt(e.CANC_EM))}: “{txt(e.CANC_MOTIVO)}”</li> : null}
          </ul>
        </SecaoRecolhivel>,
      );
    }
    if (pedidos.length) {
      blocos.push(
        <SecaoRecolhivel key="pedidos" titulo="Pedidos do empenho" resumo={situacao} {...secao('pedidos')}>
          <Table>
            <thead><Tr><Th>Pedido</Th><Th>Fase</Th><Th>Nº</Th><Th numeric>Valor</Th></Tr></thead>
            <tbody>
              {pedidos.map((pd) => (
                <Tr key={txt(pd.ID_CARD)}>
                  <Td>{txt(pd.TITULO)}</Td>
                  <Td><Status tone={txt(pd.FASE) === 'emp_cancelado' ? 'off' : txt(pd.FASE) === 'emp_concluido' ? 'live' : 'attention'}>{txt(pd.FASE_NOME)}</Status></Td>
                  <Td>{txt(pd.NUM_PEDIDO) || <Dash />}</Td>
                  <Td numeric>{moeda(Number(pd.VL_TOTAL) || 0)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </SecaoRecolhivel>,
      );
    }
  } else {
    const p = carga.pedido ?? {};
    const transferencia = papel === 'TRANSFERENCIA';
    const meusItens = itens.filter((i) => (transferencia ? i.qtTransferencia > 0 : i.qtCompra > 0 && i.codfornec === Number(p.CODFORNEC)));
    const pendencias = (carga.pendencias ?? []).filter((pd) => Number(pd.ID_CARD) === ctx.card.id);
    const abertas = pendencias.filter((pd) => txt(pd.STATUS) === 'ABERTA');
    blocos.push(
      <SecaoRecolhivel key="pedido" titulo={transferencia ? 'Transferência entre filiais' : `Pedido · ${txt(p.FORNECEDOR)}`} extra={extraAlerta}
        resumo={[situacao, txt(p.NUM_PEDIDO) && `nº ${txt(p.NUM_PEDIDO)}`, `${moeda(Number(p.VL_TOTAL) || 0)}`].filter(Boolean).join(' · ')} {...secao('pedido')}>
        <dl className="mb-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
          {[
            ['Empenho', `${txt(e.CODIGO_EDITAL)} · ${txt(e.NUM_EMPENHO) || 'sem número'}`],
            ['Nº do pedido', txt(p.NUM_PEDIDO) || '—'], ['Enviado em', fmtData(txt(p.DT_PEDIDO)) || '—'],
            ['Previsão', fmtData(txt(p.DT_PREVISAO)) || '—'], ['Recebido', fmtData(txt(p.DT_RECEBIDO)) || '—'],
            ['Limite do empenho', fmtData(txt(e.DT_LIMITE)) || '—'],
          ].map(([rotulo, v]) => <div key={rotulo}><dt className="text-[12px] text-ink-secondary">{rotulo}</dt><dd className="text-ink">{v}</dd></div>)}
        </dl>
        <Table>
          <thead><Tr><Th>Produto</Th><Th numeric>{transferencia ? 'Transferir' : 'Comprar'}</Th>{transferencia ? <Th>Filial de origem</Th> : <Th numeric>Preço</Th>}</Tr></thead>
          <tbody>
            {meusItens.map((i) => (
              <Tr key={i.codprod}>
                <Td>{i.codprod} — {i.descricao}<span className="block text-[12px] text-ink-secondary">fábrica {i.codfab || '—'}</span></Td>
                <Td numeric>{numeroPt(transferencia ? i.qtTransferencia : i.qtCompra)}</Td>
                {transferencia ? <Td>{i.codfilialOrigem}</Td> : <Td numeric>{moeda(i.precoVenda)}</Td>}
              </Tr>
            ))}
          </tbody>
        </Table>
      </SecaoRecolhivel>,
      <SecaoRecolhivel key="pend" titulo="Pendências" extra={abertas.length ? <Badge tone="attention">{abertas.length} aberta(s)</Badge> : null}
        resumo={pendencias.length ? `${abertas.length} aberta(s) de ${pendencias.length}` : 'nenhuma pendência'} {...secao('pend')}>
        {pendencias.length === 0 ? <p className="text-[13px] text-ink-secondary">Nenhuma pendência neste pedido.</p> : (
          <Table>
            <thead><Tr><Th>Tipo</Th><Th>Descrição</Th><Th>Situação</Th><Th /></Tr></thead>
            <tbody>
              {pendencias.map((pd) => {
                const aberta = txt(pd.STATUS) === 'ABERTA';
                const id = Number(pd.ID);
                const motivo = sessao.permissoes.operarEmpenhos ? null : 'Seu perfil não fecha pendência.';
                return (
                  <Tr key={id}>
                    <Td>{ROTULO_PENDENCIA[txt(pd.TIPO)] ?? txt(pd.TIPO)}</Td>
                    <Td>{txt(pd.DESCRICAO)}<span className="block text-[12px] text-ink-secondary">aberta por {txt(pd.ABERTA_NOME) || '—'} em {fmtDataHora(txt(pd.ABERTA_EM))}{txt(pd.PREVISAO) ? ` · previsão ${fmtData(txt(pd.PREVISAO))}` : ''}</span></Td>
                    <Td>{aberta ? <Status tone="attention">Aberta</Status> : <Status tone="off">{txt(pd.STATUS) === 'CANCELADA' ? 'Cancelada' : 'Resolvida'} por {txt(pd.FECHADA_NOME) || '—'}</Status>}</Td>
                    <Td>
                      {aberta ? (
                        <span className="flex gap-2">
                          <Button size="sm" disabled={motivo !== null || fechando !== null || ctx.travado} title={motivo ?? 'Resolver'} onClick={() => void fecharPendencia(id, 'RESOLVIDA')}>Resolver</Button>
                          <Button size="sm" variant="ghost" disabled={motivo !== null || fechando !== null || ctx.travado} title={motivo ?? 'Cancelar'} onClick={() => void fecharPendencia(id, 'CANCELADA')}>Cancelar</Button>
                        </span>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </SecaoRecolhivel>,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reprovacao && chave === 'emp_analise' ? <Alert tone="warn">Reprovado: “{reprovacao}”</Alert> : null}
      {blocos}
    </div>
  );
}
