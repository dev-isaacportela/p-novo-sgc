// A janela Novo empenho sobre o quadro (C-008..C-013). Três chamadas, nunca uma
// JAVASCRIPT aninhada: `api.cardCriar` (kbCardCriar — o motor dá ordem, busca,
// movimento e automação), `sgcEscEmpEmpenhoCriar` (a capa, guardada pelo card
// do quadro de empenhos criado por quem chama) e `sgcEmpItensGravar` (os itens
// em lote). O card nasce na Análise.
import * as React from 'react';
import { useKanban } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { instanteIso } from '@/lib/pedido';
import { hojeIso, moeda } from '@/lib/formato';
import { QUADRO_EMPENHOS } from '@/lib/quadro';
import {
  dataLimite, prazoEmDias, tituloDoEmpenho, totaisEmpenho, validarNovoEmpenho, type ItemEmpenho, type UnidadePrazo,
} from '@/lib/empenhos';
import {
  Alert, AlternaOpcoes, Button, CheckRow, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, Field, Input, LabelledField, SelectMenu, Table, Td, Th, Tr, type SelectOption,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { BuscaProduto, CampoNumero, ResumoCmv } from '@/pages/empenhos/itens';
import DialogoPregao from '@/pages/empenhos/DialogoPregao';
import { itemDoProduto, textoCmv, valorDaCapa } from '@/pages/empenhos/operacoes';

interface Pregao { ID: number; CODIGO_EDITAL: string; ORGAO: string; CODCLI: number }

const vazio = () => ({
  idPregao: 0, numEmpenho: '', codfilial: '', codfilialPedido: '', dtRecebimento: hojeIso(), prazoDias: 0,
  prazoUnidade: 'CORRIDOS' as UnidadePrazo, dtLimite: '', aceitaParcial: false, observacao: '',
});

export default function NovoEmpenhoDialogo({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: (cardId: number) => void }) {
  const api = useKanban();
  const sessao = usePersona();
  const [d, setD] = React.useState(vazio);
  // C-011: a filial do pedido acompanha a do contrato até alguém escolher outra.
  const [pedidoTocado, setPedidoTocado] = React.useState(false);
  const [itens, setItens] = React.useState<ItemEmpenho[]>([]);
  const [pregoes, setPregoes] = React.useState<Pregao[]>([]);
  const [filiais, setFiliais] = React.useState<SelectOption[]>([]);
  const [novoPregao, setNovoPregao] = React.useState(false);
  const [falha, setFalha] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);
  const [versaoPregoes, setVersaoPregoes] = React.useState(0);

  const [ultimoAberto, setUltimoAberto] = React.useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setD(vazio()); setItens([]); setFalha(null); setPedidoTocado(false);
    }
  }

  React.useEffect(() => {
    if (!aberto) return undefined;
    let vivo = true;
    linhas('sgcEmpPregoesListar', { busca: '', limite: 200, offset: 0 }).then((rows) => vivo && setPregoes(rows as Pregao[])).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [aberto, versaoPregoes]);

  React.useEffect(() => {
    if (!aberto || filiais.length) return;
    linhas('sgcWintFiliais').then((rows) => setFiliais(rows.map((r) => ({ value: String(r.CODFILIAL), label: `${r.CODFILIAL} — ${r.FILIAL}` })))).catch(() => undefined);
  }, [aberto, filiais.length]);

  const pregao = pregoes.find((p) => Number(p.ID) === d.idPregao) ?? null;
  const nomeFilial = filiais.find((f) => f.value === d.codfilial)?.label.replace(/^\S+ — /, '') ?? '';
  const comPrazo = (parte: Partial<ReturnType<typeof vazio>>) => setD((a) => {
    const n = { ...a, ...parte };
    return { ...n, dtLimite: dataLimite(n.dtRecebimento, n.prazoDias, n.prazoUnidade) || n.dtLimite };
  });
  const falta = validarNovoEmpenho({ ...d, itens, prazoInvalido: d.prazoDias < 0 });
  const mudar = (codprod: number, parte: Partial<ItemEmpenho>) => setItens((atual) => atual.map((i) => (i.codprod === codprod ? { ...i, ...parte } : i)));

  async function criar() {
    if (falta.length || !pregao) return;
    setGravando(true);
    setFalha(null);
    try {
      const t = totaisEmpenho(itens);
      const criado = await api.cardCriar({
        boardId: (await api.boardCarregar({ slug: QUADRO_EMPENHOS })).board.id,
        titulo: tituloDoEmpenho(pregao.CODIGO_EDITAL, d.numEmpenho),
        valores: { orgao: pregao.ORGAO, filial: nomeFilial, valor_contrato: valorDaCapa(t.valor), cmv: textoCmv(t.cmv) },
        responsaveisIds: sessao?.usuarioId ? [sessao.usuarioId] : [],
        prazo: d.dtLimite,
      });
      if (!criado.ok || !criado.id) throw new Error(criado.error || 'O empenho não foi criado.');
      await linhas('sgcEscEmpEmpenhoCriar', {
        cardId: criado.id, idPregao: d.idPregao, numEmpenho: d.numEmpenho.trim(), codfilial: d.codfilial, filial: nomeFilial,
        codfilialPedido: d.codfilialPedido || d.codfilial, dtRecebimento: d.dtRecebimento, prazoDias: d.prazoDias,
        prazoUnidade: d.prazoUnidade, dtLimite: d.dtLimite, aceitaParcial: d.aceitaParcial ? 1 : 0, observacao: d.observacao, agora: instanteIso(),
      });
      const gravado = await acao('sgcEmpItensGravar', { cardId: criado.id, itensJson: JSON.stringify(itens), removerJson: '[]' });
      if (!gravado.ok) throw new Error(String(gravado.erro || gravado.error || 'Os itens não foram gravados; abra o card e salve a análise.'));
      onCriado(criado.id);
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : 'Não foi possível criar o empenho.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <>
      <Dialog open={aberto && !novoPregao} onOpenChange={(estaAberto) => !estaAberto && !gravando && onFechar()}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Novo empenho</DialogTitle>
            <DialogDescription>O empenho nasce na Análise, com você como criador e responsável.</DialogDescription>
          </DialogHeader>
          <DialogBody className="overflow-x-hidden">
            <div className="flex min-w-0 flex-col gap-4">
              {falha ? <Alert tone="error">{falha}</Alert> : null}
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Pregão" obrigatorio className="sm:col-span-2">
                  <div className="flex gap-2">
                    <SelectMenu label="Pregão" className="min-w-0 flex-1" value={d.idPregao ? String(d.idPregao) : ''}
                      onChange={(v) => setD((a) => ({ ...a, idPregao: Number(v) }))}
                      options={pregoes.map((p) => ({ value: String(p.ID), label: `${p.CODIGO_EDITAL} · ${p.ORGAO}` }))} />
                    <Button onClick={() => setNovoPregao(true)}>Novo pregão</Button>
                  </div>
                </Field>
                <LabelledField label="Nº do empenho"><Input value={d.numEmpenho} onChange={(e) => setD((a) => ({ ...a, numEmpenho: e.target.value }))} /></LabelledField>
                <Field label="Filial do contrato" obrigatorio>
                  <SelectMenu label="Filial do contrato" value={d.codfilial} options={filiais}
                    onChange={(v) => setD((a) => ({ ...a, codfilial: v, codfilialPedido: pedidoTocado ? a.codfilialPedido : v }))} />
                </Field>
                <Field label="Filial do pedido" hint="Os pedidos às indústrias saem por ela.">
                  <SelectMenu label="Filial do pedido" value={d.codfilialPedido} options={filiais}
                    onChange={(v) => { setPedidoTocado(true); setD((a) => ({ ...a, codfilialPedido: v })); }} />
                </Field>
                <Field label="Recebimento" obrigatorio><DatePicker value={d.dtRecebimento} onChange={(v) => comPrazo({ dtRecebimento: v })} aria-label="Recebimento" /></Field>
                <Field label="Prazo de entrega">
                  <div className="flex items-center gap-2">
                    <CampoNumero rotulo="Prazo em dias" valor={d.prazoDias} onChange={(v) => comPrazo({ prazoDias: Math.round(v) })} className="w-20 text-right" />
                    <AlternaOpcoes<UnidadePrazo> rotulo="Unidade do prazo" valor={d.prazoUnidade} onValor={(u) => comPrazo({ prazoUnidade: u })}
                      opcoes={[{ value: 'CORRIDOS', label: 'Corridos' }, { value: 'UTEIS', label: 'Úteis' }]} />
                  </div>
                </Field>
                <Field label="Data limite de entrega">
                  <DatePicker value={d.dtLimite} aria-label="Data limite"
                    onChange={(v) => setD((a) => ({ ...a, dtLimite: v, prazoDias: prazoEmDias(a.dtRecebimento, v, a.prazoUnidade) ?? a.prazoDias }))} />
                </Field>
                <Field label="Entrega parcial">
                  <CheckRow marcado={d.aceitaParcial} onToggle={() => setD((a) => ({ ...a, aceitaParcial: !a.aceitaParcial }))}>Aceita parcial</CheckRow>
                </Field>
              </div>

              <BuscaProduto
                jaTem={itens.map((i) => i.codprod)}
                disabled={!pregao}
                onEscolher={async (p) => {
                  const novo = await itemDoProduto(p, Number(pregao?.CODCLI) || 0);
                  setItens((atual) => [...atual, novo]);
                }}
              />
              {!pregao ? <p className="text-[12px] text-ink-secondary">Escolha o pregão antes dos itens: o custo especial é o do órgão.</p> : null}
              {itens.length ? (
                <Table>
                  <thead><Tr><Th>Produto</Th><Th numeric>Qtd</Th><Th numeric>Preço contrato</Th><Th numeric>Custo padrão</Th><Th numeric>Especial</Th><Th numeric>Total</Th><Th /></Tr></thead>
                  <tbody>
                    {itens.map((i) => (
                      <Tr key={i.codprod}>
                        <Td>{i.codprod} — {i.descricao}<span className="block text-[12px] text-ink-secondary">{i.fornecedor || 'sem indústria'}</span></Td>
                        <Td numeric><CampoNumero rotulo="Quantidade" valor={i.qtEmpenho} onChange={(v) => mudar(i.codprod, { qtEmpenho: v })} /></Td>
                        <Td numeric><CampoNumero rotulo="Preço do contrato" valor={i.precoVenda} onChange={(v) => mudar(i.codprod, { precoVenda: v })} /></Td>
                        <Td numeric>{i.custoPadrao ? moeda(i.custoPadrao) : 'sem custo'}</Td>
                        <Td numeric>{i.custoEspecial ? moeda(i.custoEspecial) : '—'}</Td>
                        <Td numeric>{moeda(i.qtEmpenho * i.precoVenda)}</Td>
                        <Td><Button size="sm" variant="ghost" onClick={() => setItens((atual) => atual.filter((x) => x.codprod !== i.codprod))}>Remover</Button></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              ) : null}
              <ResumoCmv itens={itens} />
              {falta.length ? <p className="text-[12px] text-ink-secondary">Falta: {falta.join(', ')}.</p> : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={onFechar} disabled={gravando}>Voltar</Button>
            <Button variant="primary" onClick={criar} disabled={gravando || falta.length > 0} title={falta.length ? `Falta: ${falta.join(', ')}` : undefined}>
              {gravando ? 'Criando...' : 'Criar empenho'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DialogoPregao
        aberto={aberto && novoPregao}
        onFechar={() => setNovoPregao(false)}
        onCriado={(id) => {
          setVersaoPregoes((v) => v + 1);
          setD((a) => ({ ...a, idPregao: id }));
        }}
      />
    </>
  );
}
