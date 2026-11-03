// Spec 014 — acompanhamento Galderma (`/galderma/acompanhamento`, RF-017..RF-020):
// proposta da mesa × realizado do ERP por produto e mês, meta de sell-out
// ajustável com histórico, gráficos do período (valor em cada barra, R-116) e
// uma competência por vez na tabela, com os blocos de colunas que se escondem.
// RNF-004: abrir = histórico da mesa, realizado do ERP, metas lançadas, filiais
// e estoque inicial; trocar a competência da tabela = 1 (estoque inicial).
import * as React from 'react';
import { History } from 'lucide-react';
import {
  Alert, Button, ChipContagem, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, GradeGraficos, GradeKpi, Input, Kpi, LabelledField, PageHeader, Panel, PanelHeader, RowMeta, RowTitle, SearchInput,
  SelectMenu, Status, Table, Td, TextLink, Th, Toolbar, Tr, Code,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { fmtDataHora, hojeIso, moeda, numeroPt } from '@/lib/formato';
import { periodoDaCompetencia, rotuloCompetencia } from '@/lib/galderma';
import {
  anteriorDoSellout, janelaDoAcompanhamento, juntarAcompanhamento, lerSellout, ROTULO_SEMAFORO, serieMensal, textoDivergenciaEstoque,
  textoDoHistorico, totaisAcompanhamento, type LinhaAcompanhamento, type SemaforoMeta,
} from '@/lib/galderma-acompanhamento';
import { NavegacaoGalderma, SemAcessoGalderma } from './abas';
import { useAcessoGalderma } from './acesso';
import { GraficoBarras } from './grafico';
import { unidadesPt } from './formato';

const PERIODOS = [3, 6, 12, 24].map((n) => ({ value: String(n), label: `${n} meses` }));
const TODAS = { limite: 5000, offset: 0 };
const un = (v: number) => numeroPt(v, 0);
const pct = (v: number | null) => (v === null ? <Dash /> : `${numeroPt(v, 1)} %`);
const agora = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const TOM: Record<SemaforoMeta, 'live' | 'off' | 'attention' | 'alert'> = { dentro: 'live', atencao: 'attention', abaixo: 'alert', 'sem-meta': 'off' };

function Semaforo({ valor, tom }: { valor: number | null; tom: SemaforoMeta }) {
  return <Status tone={TOM[tom]}>{valor === null ? ROTULO_SEMAFORO[tom] : `${numeroPt(valor, 1)} % · ${ROTULO_SEMAFORO[tom]}`}</Status>;
}

type Bloco = 'sellout' | 'sellinProjetado' | 'sellinRealizado';
const BLOCOS: { chave: Bloco; rotulo: string }[] = [
  { chave: 'sellout', rotulo: 'Sell-out' }, { chave: 'sellinProjetado', rotulo: 'Sell-in projetado' }, { chave: 'sellinRealizado', rotulo: 'Sell-in realizado' },
];

interface Carga { historico: Record<string, unknown>[]; realizado: Record<string, unknown>[]; lancamentos: Record<string, unknown>[]; erroErp: string }

export default function AcompanhamentoGaldermaPage() {
  const acesso = useAcessoGalderma();
  const [ate, setAte] = React.useState(hojeIso().slice(0, 7));
  const [meses, setMeses] = React.useState(12);
  const [filial, setFilial] = React.useState('');
  const [busca, setBusca] = React.useState('');
  const [tabela, setTabela] = React.useState('');
  const [visiveis, setVisiveis] = React.useState<Set<Bloco>>(new Set(['sellout', 'sellinProjetado', 'sellinRealizado']));
  const [carga, setCarga] = React.useState<(Carga & { chave: string }) | null>(null);
  const [nomesFiliais, setNomesFiliais] = React.useState<Map<string, string>>(new Map());
  const [estoque, setEstoque] = React.useState<{ competencia: string; linhas: Record<string, unknown>[] | null } | null>(null);
  const [recarga, setRecarga] = React.useState(0);
  const [editando, setEditando] = React.useState<{ codprod: number; texto: string; erro: string } | null>(null);
  const [historico, setHistorico] = React.useState<Record<string, unknown>[] | null>(null);
  const [erro, setErro] = React.useState('');

  const { competencias } = React.useMemo(() => janelaDoAcompanhamento(ate, meses), [ate, meses]);
  const chave = `${ate}|${meses}|${recarga}`;
  const competenciaTabela = competencias.includes(tabela) ? tabela : competencias[competencias.length - 1];

  React.useEffect(() => {
    if (!acesso.ver) return undefined;
    let vivo = true;
    const janela = janelaDoAcompanhamento(ate, meses);
    const [inicio, fim] = [janela.competencias[0], janela.competencias[janela.competencias.length - 1]];
    const intervalo = { competenciaInicio: inicio, competenciaFim: fim, ...TODAS };
    // RN-AG-16: a falha do ERP não esconde a proposta.
    Promise.allSettled([
      linhas('sgcGaldAcompanhamento', intervalo),
      linhas('sgcWintGaldRealizadoMensal', { dataInicio: `${janela.inicioComTrimestre}-01`, dataFim: periodoDaCompetencia(fim).fim }),
      linhas('sgcGaldSelloutListar', intervalo),
    ]).then(([h, r, l]) => {
      if (!vivo) return;
      setCarga({
        chave: `${ate}|${meses}|${recarga}`,
        historico: h.status === 'fulfilled' ? h.value : [],
        realizado: r.status === 'fulfilled' ? r.value : [],
        lancamentos: l.status === 'fulfilled' ? l.value : [],
        erroErp: r.status === 'rejected' ? 'ERP indisponível: o realizado não carregou; a proposta da mesa continua.' : '',
      });
      setErro(h.status === 'rejected' ? 'Não foi possível carregar a proposta da mesa.' : '');
    });
    return () => { vivo = false; };
  }, [acesso.ver, ate, meses, recarga]);

  React.useEffect(() => {
    if (!acesso.ver) return;
    linhas('sgcWintFiliais').then((rows) => setNomesFiliais(new Map(rows.map((r) => [String(r.CODFILIAL), String(r.FILIAL)])))).catch(() => undefined);
  }, [acesso.ver]);

  // RN-AG-18: o estoque inicial reconstruído é da competência da tabela; falha zera só a coluna.
  React.useEffect(() => {
    if (!acesso.ver || !competenciaTabela) return undefined;
    let vivo = true;
    linhas('sgcWintGaldEstoqueInicial', { dataInicio: `${competenciaTabela}-01` })
      .then((rows) => vivo && setEstoque({ competencia: competenciaTabela, linhas: rows }))
      .catch(() => vivo && setEstoque({ competencia: competenciaTabela, linhas: null }));
    return () => { vivo = false; };
  }, [acesso.ver, competenciaTabela, recarga]);

  const dados = carga?.chave === chave ? carga : null;
  const filiaisComMovimento = React.useMemo(() => {
    const visiveisSet = new Set(competencias);
    return [...new Set((dados?.realizado ?? []).filter((r) => visiveisSet.has(String(r.MES))).map((r) => String(r.CODFILIAL)))].sort((a, b) => Number(a) - Number(b));
  }, [dados, competencias]);
  const todas = React.useMemo(() => (dados ? juntarAcompanhamento({
    historico: dados.historico, realizado: dados.realizado, lancamentos: dados.lancamentos, competencias,
    estoqueInicial: estoque?.competencia === competenciaTabela ? estoque.linhas : null, competenciaDoEstoque: competenciaTabela,
    filiais: filial ? [filial] : [],
  }) : []), [dados, competencias, estoque, competenciaTabela, filial]);
  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? todas.filter((l) => l.descricao.toLowerCase().includes(termo) || String(l.codprod).includes(termo)) : todas;
  }, [todas, busca]);
  const doMes = filtradas.filter((l) => l.competencia === competenciaTabela);
  const totais = totaisAcompanhamento(doMes);
  const serie = serieMensal(filtradas, competencias);

  if (acesso.carregando) return <RowMeta>Verificando acesso…</RowMeta>;
  if (!acesso.ver) return <SemAcessoGalderma />;

  async function salvarSellout(l: LinhaAcompanhamento) {
    if (!editando) return;
    const lido = lerSellout(editando.texto);
    if (!lido.ok) { setEditando({ ...editando, erro: lido.erro }); return; }
    const { antes, origemAnterior } = anteriorDoSellout(l);
    const base = { codprod: l.codprod, competencia: l.competencia };
    try {
      if (lido.valor === null) {
        if (l.selloutLancado === null) { setEditando(null); return; }
        await linhas('sgcEscGaldSelloutExcluir', base);
        await linhas('sgcEscGaldSelloutLogInserir', { ...base, antes, depois: '', origemAnterior: 'lancado', agora: agora() });
      } else {
        await linhas('sgcEscGaldSelloutSalvar', { ...base, previsaoSellout: lido.valor, agora: agora() });
        await linhas('sgcEscGaldSelloutLogInserir', { ...base, antes, depois: String(lido.valor), origemAnterior, agora: agora() });
      }
      setEditando(null);
      setRecarga((n) => n + 1);
    } catch (falha) {
      setEditando({ ...editando, erro: falha instanceof Error ? falha.message : 'Não foi possível gravar a meta.' });
    }
  }

  async function abrirHistorico() {
    setHistorico([]);
    const rows = await linhas('sgcGaldSelloutLogListar', { competenciaInicio: competencias[0], competenciaFim: competencias[competencias.length - 1], limite: 200, offset: 0 }).catch(() => []);
    setHistorico(rows);
  }

  const alternar = (b: Bloco) => setVisiveis((atual) => { const nova = new Set(atual); if (nova.has(b)) nova.delete(b); else nova.add(b); return nova; });
  const ocultos = BLOCOS.length - visiveis.size;
  const ve = (b: Bloco) => visiveis.has(b);
  const rotulo = rotuloCompetencia(competenciaTabela);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader module="Compras" title="Acompanhamento Galderma"
        description="O que a Galderma propôs contra o que foi vendido e comprado, mês a mês."
        actions={<><NavegacaoGalderma /><Button onClick={abrirHistorico}><History /> Histórico do sell-out</Button></>} />
      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {dados?.erroErp ? <Alert tone="warn">{dados.erroErp}</Alert> : null}

      <Panel>
        <Toolbar>
          <LabelledField label="Até a competência"><Input type="month" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} /></LabelledField>
          <LabelledField label="Período"><SelectMenu label="Período" value={String(meses)} options={PERIODOS} onChange={(v) => setMeses(Number(v))} /></LabelledField>
          <LabelledField label="Filial">
            <SelectMenu label="Filial" value={filial} onChange={setFilial}
              options={[{ value: '', label: 'Todas' }, ...filiaisComMovimento.map((f) => ({ value: f, label: `${f} · ${nomesFiliais.get(f) ?? `Filial ${f}`}` }))]} />
          </LabelledField>
          <LabelledField label="Produto"><SearchInput placeholder="Código ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} /></LabelledField>
        </Toolbar>
        <div className="p-4">
          <GradeKpi>
            <Kpi rotulo={`Sell-out · ${rotulo}`} valor={`${un(totais.vendaRealizada)} de ${un(totais.previsaoSellout)}`}
              hint={`${moeda(totais.valorVenda)} de ${moeda(totais.valorSelloutProjetado)}`} delta={pct(totais.percentualSellout)} />
            <Kpi rotulo={`Sell-in · ${rotulo}`} valor={`${un(totais.pedidoEnviado)} de ${un(totais.propostaSellin)}`}
              hint={`${moeda(totais.realizadoComDesconto)} de ${moeda(totais.propostaComDesconto)} com desconto`} delta={pct(totais.percentualSellin)} />
            <Kpi rotulo={`Comprado · ${rotulo}`} valor={moeda(totais.valorCompra)} hint={`${un(totais.compraRealizada)} unidades de entrada no ERP`} />
          </GradeKpi>
        </div>
      </Panel>

      <GradeGraficos>
        <GraficoBarras titulo="Sell-out: meta × realizado" hint="Unidades por mês; a meta é a lançada ou a da mesa."
          dados={serie.map((p) => ({ name: rotuloCompetencia(p.competencia), meta: p.previsao, realizado: p.realizado }))}
          series={[{ chave: 'meta', rotulo: 'Meta', indice: 0 }, { chave: 'realizado', rotulo: 'Realizado', indice: 1 }]} formatar={unidadesPt} />
        <GraficoBarras titulo="Sell-in: proposta × pedido enviado" hint="Unidades por mês."
          dados={serie.map((p) => ({ name: rotuloCompetencia(p.competencia), proposta: p.sellinProjetado, enviado: p.sellinComprado }))}
          series={[{ chave: 'proposta', rotulo: 'Proposta', indice: 2 }, { chave: 'enviado', rotulo: 'Pedido enviado', indice: 3 }]} formatar={unidadesPt} />
      </GradeGraficos>

      <Panel>
        <PanelHeader title={`Produtos · ${rotulo}`} hint="Uma competência por vez; clique na meta de sell-out para ajustá-la (a proposta da mesa não muda).">
          <div className="flex flex-wrap items-center gap-2">
            <SelectMenu label="Competência da tabela" value={competenciaTabela} onChange={setTabela}
              options={[...competencias].reverse().map((c) => ({ value: c, label: rotuloCompetencia(c) }))} />
            {BLOCOS.map((b) => <ChipContagem key={b.chave} ativo={ve(b.chave)} onClick={() => alternar(b.chave)}>{b.rotulo}</ChipContagem>)}
            {ocultos ? <TextLink onClick={() => setVisiveis(new Set(BLOCOS.map((b) => b.chave)))}>{`Mostrar tudo (${ocultos} ocultos)`}</TextLink> : null}
          </div>
        </PanelHeader>
        {doMes.length === 0 ? <EmptyState title="Nada neste mês." hint="Sem proposta, sem venda e sem meta lançada para os filtros escolhidos." /> : (
          <Table>
            <thead>
              <Tr>
                <Th className="min-w-[16rem]">Produto</Th><Th numeric>Preço sell-out</Th><Th numeric>Preço net</Th><Th numeric>Preço c/ desc.</Th>
                <Th numeric>Estoque inicial (Galderma)</Th><Th numeric>Estoque inicial (ERP)</Th>
                {ve('sellout') ? <><Th numeric>Média tri. Galderma</Th><Th numeric>Média tri. ERP</Th><Th numeric>Meta sell-out</Th><Th numeric>Valor projetado</Th><Th numeric>Vendido</Th><Th numeric>R$ vendido</Th><Th>% da meta</Th><Th numeric>Falta</Th></> : null}
                {ve('sellinProjetado') ? <><Th numeric>Proposta</Th><Th numeric>Net R$</Th><Th numeric>NF c/ desc.</Th><Th numeric>NF s/ desc.</Th><Th numeric>Meta lançada R$</Th></> : null}
                {ve('sellinRealizado') ? <><Th numeric>Pedido enviado</Th><Th numeric>Realizado net</Th><Th numeric>NF c/ desc.</Th><Th numeric>NF s/ desc.</Th><Th numeric>Entrada</Th><Th>% da meta</Th><Th numeric>Falta un.</Th><Th numeric>Falta R$</Th></> : null}
              </Tr>
            </thead>
            <tbody>
              {doMes.map((l) => (
                <Tr key={`${l.codprod}|${l.competencia}`}>
                  <Td><RowTitle>{l.descricao}</RowTitle><RowMeta><Code prefix="cód.">{l.codprod}</Code>{l.temProposta ? '' : l.selloutLancado === null ? ' · sem meta lançada' : ' · sem meta da mesa'}</RowMeta></Td>
                  <Td numeric>{l.precoSellout ? moeda(l.precoSellout) : <Dash />}</Td>
                  <Td numeric>{l.precoNet ? moeda(l.precoNet) : <Dash />}</Td>
                  <Td numeric>{l.precoListaDesc ? moeda(l.precoListaDesc) : <Dash />}</Td>
                  <Td numeric>{l.estoqueInicialInformado ? un(l.estoqueInicialInformado) : <Dash />}</Td>
                  <Td numeric><span title={textoDivergenciaEstoque(l.estoqueInicialErp, l.estoqueInicialInformado)}>{l.estoqueInicialErp === null ? <Dash /> : un(l.estoqueInicialErp)}</span></Td>
                  {ve('sellout') ? (
                    <>
                      <Td numeric>{un(l.mediaSelloutGalderma)}</Td>
                      <Td numeric>{un(l.mediaTriErp)}</Td>
                      <Td numeric>
                        {editando?.codprod === l.codprod && acesso.operar ? (
                          <div className="flex flex-col items-end gap-1">
                            <Input autoFocus className="w-24 text-right" aria-label={`Meta de sell-out de ${l.descricao}`} value={editando.texto}
                              onChange={(e) => setEditando({ ...editando, texto: e.target.value, erro: '' })}
                              onKeyDown={(e) => { if (e.key === 'Enter') salvarSellout(l); if (e.key === 'Escape') setEditando(null); }} />
                            {editando.erro ? <RowMeta><span className="text-destructive">{editando.erro}</span></RowMeta> : <RowMeta>Enter grava · Esc cancela · vazio remove</RowMeta>}
                          </div>
                        ) : (
                          <TextLink disabled={!acesso.operar} title={l.selloutLancado === null ? `Da mesa: ${un(l.previsaoMesa)}` : `Lançado por ${l.lancadoPor} em ${fmtDataHora(l.lancadoEm)} · mesa: ${un(l.previsaoMesa)}`}
                            onClick={() => setEditando({ codprod: l.codprod, texto: l.previsaoSellout ? String(l.previsaoSellout) : '', erro: '' })}>
                            {l.previsaoSellout ? `${un(l.previsaoSellout)}${l.selloutLancado === null ? '' : ' ✎'}` : '+ lançar'}
                          </TextLink>
                        )}
                      </Td>
                      <Td numeric>{moeda(l.valorSelloutProjetado)}</Td>
                      <Td numeric>{un(l.vendaRealizada)}</Td>
                      <Td numeric>{moeda(l.valorVenda)}</Td>
                      <Td><Semaforo valor={l.percentualSellout} tom={l.semaforoSellout} /></Td>
                      <Td numeric>{pct(l.faltaSelloutPct)}</Td>
                    </>
                  ) : null}
                  {ve('sellinProjetado') ? (
                    <><Td numeric>{un(l.propostaSellin)}</Td><Td numeric>{moeda(l.propostaNet)}</Td><Td numeric>{moeda(l.propostaComDesconto)}</Td><Td numeric>{moeda(l.propostaSemDesconto)}</Td><Td numeric>{l.metaSellinValor ? moeda(l.metaSellinValor) : <Dash />}</Td></>
                  ) : null}
                  {ve('sellinRealizado') ? (
                    <>
                      <Td numeric>{un(l.pedidoEnviado)}</Td><Td numeric>{moeda(l.realizadoNet)}</Td><Td numeric>{moeda(l.realizadoComDesconto)}</Td><Td numeric>{moeda(l.realizadoSemDesconto)}</Td>
                      <Td numeric>{un(l.compraRealizada)}</Td><Td><Semaforo valor={l.percentualSellin} tom={l.semaforoSellin} /></Td>
                      <Td numeric>{un(l.faltaSellinUn)}</Td><Td numeric>{moeda(l.faltaSellinValor)}</Td>
                    </>
                  ) : null}
                </Tr>
              ))}
              <Tr>
                <Td><RowTitle>Total</RowTitle></Td><Td /><Td /><Td /><Td /><Td />
                {ve('sellout') ? <><Td /><Td /><Td numeric><RowTitle>{un(totais.previsaoSellout)}</RowTitle></Td><Td numeric>{moeda(totais.valorSelloutProjetado)}</Td><Td numeric><RowTitle>{un(totais.vendaRealizada)}</RowTitle></Td><Td numeric>{moeda(totais.valorVenda)}</Td><Td>{pct(totais.percentualSellout)}</Td><Td numeric>{pct(totais.faltaSelloutPct)}</Td></> : null}
                {ve('sellinProjetado') ? <><Td numeric><RowTitle>{un(totais.propostaSellin)}</RowTitle></Td><Td /><Td numeric>{moeda(totais.propostaComDesconto)}</Td><Td /><Td /></> : null}
                {ve('sellinRealizado') ? <><Td numeric><RowTitle>{un(totais.pedidoEnviado)}</RowTitle></Td><Td /><Td numeric>{moeda(totais.realizadoComDesconto)}</Td><Td /><Td numeric>{un(totais.compraRealizada)}</Td><Td>{pct(totais.percentualSellin)}</Td><Td numeric>{un(totais.faltaSellinUn)}</Td><Td numeric>{moeda(totais.faltaSellinValor)}</Td></> : null}
              </Tr>
            </tbody>
          </Table>
        )}
        <Toolbar>
          <RowMeta>
            {'Meta: '}<Status tone="live">dentro ≥ 100 %</Status>{' · '}<Status tone="attention">atenção 70–99 %</Status>{' · '}
            <Status tone="alert">abaixo &lt; 70 %</Status>{' · '}<Status tone="off">sem meta</Status>
            {` · Fonte: ERP (venda válida, sem órgão público) e mesa de negociação · atualizado em ${fmtDataHora(agora())}`}
          </RowMeta>
        </Toolbar>
      </Panel>

      <Dialog open={historico !== null} onOpenChange={(v) => !v && setHistorico(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico do sell-out</DialogTitle>
            <DialogDescription>{`Mudanças da meta de sell-out de ${rotuloCompetencia(competencias[0])} a ${rotuloCompetencia(competencias[competencias.length - 1])}, da mais recente para a mais antiga.`}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {historico?.length ? (
              <Table><tbody>{historico.map((h) => (
                <Tr key={String(h.ID)}>
                  <Td>
                    <RowTitle>{`${String(h.DESCRICAO || `Produto ${h.CODPROD}`)} · ${rotuloCompetencia(String(h.COMPETENCIA))} — ${textoDoHistorico(h)}`}</RowTitle>
                    <RowMeta>{`${String(h.POR_NOME || '—')} · ${fmtDataHora(String(h.EM))}`}</RowMeta>
                  </Td>
                </Tr>
              ))}</tbody></Table>
            ) : <EmptyState title="Nenhuma mudança de meta no período." />}
          </DialogBody>
          <DialogFooter><Button onClick={() => setHistorico(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
