// Spec 014 — composição Galderma por filial (`/galderma/composicao`, RF-021):
// quanto de compra (sell-in) e de venda cada filial representa no período, em
// reais ou unidades, por filial ou grupo — barras com o valor e a participação
// escritos em cada uma (R-116; pizza não entra, design.md §12.3) — e o estoque
// de agora a custo padrão do Gestão de Custos (R-128, C-030).
// RNF-004: abrir = composição, estoque e custo padrão; trocar filtro = 1 (a composição).
import * as React from 'react';
import {
  Alert, AlternaOpcoes, Dash, EmptyState, GradeGraficos, Input, LabelledField, PageHeader, Panel, PanelHeader, RowMeta,
  RowTitle, SelectMenu, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { hojeIso, moeda, numeroPt } from '@/lib/formato';
import { carregarCustoPadrao } from '@/lib/custo-padrao-carga';
import type { MapaCustoPadrao } from '@/lib/compras';
import { periodoDaCompetencia, recuarCompetencia, rotuloCompetencia } from '@/lib/galderma';
import { montarComposicao, valorizarEstoque, type Granularidade, type Indicador } from '@/lib/galderma-acompanhamento';
import { NavegacaoGalderma, SemAcessoGalderma } from './abas';
import { useAcessoGalderma } from './acesso';
import { GraficoBarras } from './grafico';
import { moedaCurta, unidadesPt } from './formato';

const PERIODOS = [
  { value: '1', label: 'Apenas o mês selecionado' }, { value: '3', label: '3 meses' }, { value: '6', label: '6 meses' },
  { value: '12', label: '12 meses' }, { value: '24', label: '24 meses' },
];
const un = (v: number) => numeroPt(v, 0);

export default function ComposicaoGaldermaPage() {
  const acesso = useAcessoGalderma();
  const [competencia, setCompetencia] = React.useState(hojeIso().slice(0, 7));
  const [meses, setMeses] = React.useState(12);
  const [indicador, setIndicador] = React.useState<Indicador>('valor');
  const [granularidade, setGranularidade] = React.useState<Granularidade>('filial');
  const [composicao, setComposicao] = React.useState<{ chave: string; linhas: Record<string, unknown>[]; erro: string } | null>(null);
  const [estoque, setEstoque] = React.useState<{ linhas: Record<string, unknown>[]; custos: MapaCustoPadrao | null } | null>(null);
  const [erroEstoque, setErroEstoque] = React.useState(false);

  const chave = `${competencia}|${meses}`;
  React.useEffect(() => {
    if (!acesso.ver) return undefined;
    let vivo = true;
    const inicio = periodoDaCompetencia(recuarCompetencia(competencia, meses - 1)).inicio;
    const fim = periodoDaCompetencia(competencia).fim;
    linhas('sgcWintGaldComposicao', { dataInicio: inicio, dataFim: fim })
      .then((rows) => vivo && setComposicao({ chave: `${competencia}|${meses}`, linhas: rows, erro: '' }))
      .catch((falha) => vivo && setComposicao({ chave: `${competencia}|${meses}`, linhas: [], erro: falha instanceof Error ? falha.message : 'ERP indisponível.' }));
    return () => { vivo = false; };
  }, [acesso.ver, competencia, meses]);

  // RN-AG-48: a posição de agora, uma vez só (não acompanha o período); falha esconde só o painel.
  React.useEffect(() => {
    if (!acesso.ver) return undefined;
    let vivo = true;
    linhas('sgcWintGaldEstoqueAtual')
      .then(async (rows) => {
        const custos = await carregarCustoPadrao([...new Set(rows.map((r) => Number(r.CODPROD)))]);
        if (vivo) setEstoque({ linhas: rows, custos });
      })
      .catch(() => vivo && setErroEstoque(true));
    return () => { vivo = false; };
  }, [acesso.ver]);

  const atual = composicao?.chave === chave ? composicao : null;
  const linhasComposicao = React.useMemo(() => montarComposicao(atual?.linhas ?? [], granularidade, indicador), [atual, granularidade, indicador]);
  const porFilial = React.useMemo(() => (estoque ? valorizarEstoque(estoque.linhas, estoque.custos, granularidade) : []), [estoque, granularidade]);

  if (acesso.carregando) return <RowMeta>Verificando acesso…</RowMeta>;
  if (!acesso.ver) return <SemAcessoGalderma />;

  const formatar = indicador === 'valor' ? moeda : unidadesPt;
  const curto = indicador === 'valor' ? moedaCurta : unidadesPt;
  const dados = linhasComposicao.map((l) => ({ name: l.codfilial ? `${l.codfilial} · ${l.filial}` : l.filial, sellin: l.sellin, vendas: l.vendas, partSellin: l.partSellin, partVendas: l.partVendas }));
  const comParticipacao = (campo: 'partSellin' | 'partVendas') => (valor: number, ponto: Record<string, string | number | null>) =>
    `${curto(valor)} · ${numeroPt(Number(ponto[campo]), 0)} %`;
  const periodo = meses === 1 ? `em ${rotuloCompetencia(competencia)}` : `de ${rotuloCompetencia(recuarCompetencia(competencia, meses - 1))} a ${rotuloCompetencia(competencia)}`;
  const semCusto = porFilial.reduce((s, f) => s + f.semCusto, 0);
  const totalEstoque = porFilial.reduce((t, f) => ({
    qtDisponivel: t.qtDisponivel + f.qtDisponivel, qtFisico: t.qtFisico + f.qtFisico,
    valorDisponivel: t.valorDisponivel + (f.valorDisponivel ?? 0), valorFisico: t.valorFisico + (f.valorFisico ?? 0),
  }), { qtDisponivel: 0, qtFisico: 0, valorDisponivel: 0, valorFisico: 0 });
  const erroCusto = estoque?.custos === null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader module="Compras" title="Composição Galderma por filial"
        description="Quanto de compra e de venda Galderma cada filial representa, e o estoque de agora." actions={<NavegacaoGalderma />} />

      <Panel>
        <Toolbar>
          <LabelledField label="Competência"><Input type="month" value={competencia} onChange={(e) => e.target.value && setCompetencia(e.target.value)} /></LabelledField>
          <LabelledField label="Período"><SelectMenu label="Período" value={String(meses)} options={PERIODOS} onChange={(v) => setMeses(Number(v))} /></LabelledField>
          <LabelledField label="Indicador">
            <AlternaOpcoes rotulo="Indicador" valor={indicador} onValor={setIndicador} opcoes={[{ value: 'valor', label: 'R$' }, { value: 'qtd', label: 'Unidades' }]} />
          </LabelledField>
          <LabelledField label="Granularidade">
            <AlternaOpcoes rotulo="Granularidade" valor={granularidade} onValor={setGranularidade} opcoes={[{ value: 'filial', label: 'Por filial' }, { value: 'grupo', label: 'Grupo' }]} />
          </LabelledField>
        </Toolbar>
        {atual?.erro ? <div className="p-4"><Alert tone="error">{`ERP indisponível: ${atual.erro}`}</Alert></div> : null}
      </Panel>

      <GradeGraficos>
        <GraficoBarras titulo="Sell-in (compras) por filial" hint={`Entradas do ERP ${periodo}; o percentual é a participação da filial.`}
          dados={dados} series={[{ chave: 'sellin', rotulo: 'Sell-in', indice: 0 }]} formatar={formatar} formatarEixo={curto} rotular={comParticipacao('partSellin')} />
        <GraficoBarras titulo="Vendas por filial" hint={`Venda válida, sem órgão público, ${periodo}.`}
          dados={dados} series={[{ chave: 'vendas', rotulo: 'Vendas', indice: 1 }]} formatar={formatar} formatarEixo={curto} rotular={comParticipacao('partVendas')} />
      </GradeGraficos>

      <Panel>
        <PanelHeader title="Estoque atual" hint="Posição de agora — não acompanha o período filtrado. Valor a custo padrão do Gestão de Custos." />
        {erroEstoque ? <div className="p-4"><Alert tone="warn">Não foi possível ler o estoque de agora no ERP.</Alert></div> : !estoque ? (
          <Toolbar><RowMeta>Carregando o estoque…</RowMeta></Toolbar>
        ) : porFilial.length === 0 ? <EmptyState title="Sem estoque Galderma agora." /> : (
          <>
            {erroCusto ? <div className="px-4 pt-3"><Alert tone="warn">Não foi possível ler o custo padrão do Gestão de Custos: os valores em reais aparecem como "Erro custo".</Alert></div> : null}
            {semCusto ? <div className="px-4 pt-3"><Alert tone="info">{`${semCusto} posição(ões) de produto sem custo padrão no Gestão de Custos: aparecem só em unidades e não somam em reais.`}</Alert></div> : null}
            <Table>
              <thead><Tr><Th>Filial</Th><Th numeric>Disponível (un.)</Th><Th numeric>Físico (un.)</Th><Th numeric>Disponível (R$)</Th><Th numeric>Físico (R$)</Th></Tr></thead>
              <tbody>
                {porFilial.map((f) => (
                  <Tr key={f.codfilial || 'grupo'}>
                    <Td><RowTitle>{f.codfilial ? `${f.codfilial} · ${f.filial}` : f.filial}</RowTitle>{f.semCusto ? <RowMeta>{`${f.semCusto} sem custo`}</RowMeta> : null}</Td>
                    <Td numeric>{un(f.qtDisponivel)}</Td>
                    <Td numeric>{un(f.qtFisico)}</Td>
                    <Td numeric>{f.valorDisponivel === null ? 'Erro custo' : f.valorDisponivel ? moeda(f.valorDisponivel) : <Dash />}</Td>
                    <Td numeric>{f.valorFisico === null ? 'Erro custo' : f.valorFisico ? moeda(f.valorFisico) : <Dash />}</Td>
                  </Tr>
                ))}
                {porFilial.length > 1 ? (
                  <Tr>
                    <Td><RowTitle>Total</RowTitle></Td><Td numeric><RowTitle>{un(totalEstoque.qtDisponivel)}</RowTitle></Td><Td numeric>{un(totalEstoque.qtFisico)}</Td>
                    <Td numeric>{erroCusto ? 'Erro custo' : <RowTitle>{moeda(totalEstoque.valorDisponivel)}</RowTitle>}</Td>
                    <Td numeric>{erroCusto ? 'Erro custo' : moeda(totalEstoque.valorFisico)}</Td>
                  </Tr>
                ) : null}
              </tbody>
            </Table>
          </>
        )}
      </Panel>
    </div>
  );
}
