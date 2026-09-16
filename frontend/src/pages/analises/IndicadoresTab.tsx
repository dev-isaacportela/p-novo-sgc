// Spec 009 — aba Indicadores de `/analises`: os números do topo e os quatro
// blocos do período (RF-001, C-001..C-004).
//
// UMA carga por abertura: os cinco blocos saem de um `Promise.allSettled` só
// (RNF-001) e cada um vira `ok` / `vazio` / `erro` por `resultadosDosBlocos` —
// a falha de um não derruba os outros (RF-002/C-002).
import * as React from 'react';
import { linhas } from '@/lib/mitra-api';
import { DatePicker } from '@/components/DatePicker';
import {
  Dash, Field, GradeGraficos, GradeKpi, Kpi, Panel, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { intervaloPadrao, resultadosDosBlocos, serieSimples, type Bloco } from '@/lib/analises';
import { fmtData, moeda } from '@/lib/formato';
import { PainelLista, PainelSerie } from './blocos';

const NOMES = ['resumo', 'porFase', 'agenda', 'bo', 'leadTime'] as const;
const LIMITE_BLOCO = 50;

type Linha = Record<string, string | number | null>;
type Blocos = Record<string, Bloco<Linha>>;

const inteiro = (valor: unknown) => Number(valor ?? 0);
const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export default function IndicadoresTab({ codfilial }: { codfilial: string }) {
  const padrao = React.useMemo(() => intervaloPadrao(), []);
  const [dataInicio, setDataInicio] = React.useState(padrao.dataInicio);
  const [dataFim, setDataFim] = React.useState(padrao.dataFim);
  const [blocos, setBlocos] = React.useState<Blocos>({});
  const [recarga, setRecarga] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    const periodo = { codfilial, dataInicio, dataFim, hoje: '' };
    Promise.allSettled([
      linhas('sgcIndResumo', periodo),
      linhas('sgcIndPedidosPorFase', periodo),
      linhas('sgcIndAgendaAtrasos', { ...periodo, limite: LIMITE_BLOCO }),
      linhas('sgcIndProdutosBo', { codfilial, limite: LIMITE_BLOCO }),
      linhas('sgcIndLeadTime', periodo),
    ]).then((resultados) => {
      if (!vivo) return;
      setBlocos(resultadosDosBlocos([...NOMES], resultados as PromiseSettledResult<Linha[]>[]));
    });
    return () => { vivo = false; };
  }, [codfilial, dataInicio, dataFim, recarga]);

  const bloco = (nome: string): Bloco<Linha> => blocos[nome] ?? { estado: 'vazio', linhas: [], erro: '' };
  const recarregar = () => setRecarga((n) => n + 1);

  const resumo = bloco('resumo').linhas[0] ?? {};
  const kpi = (chave: string) => (
    bloco('resumo').estado !== 'ok' ? <Dash /> : inteiro(resumo[chave]).toLocaleString('pt-BR')
  );

  const porFase = bloco('porFase').linhas;
  const agenda = bloco('agenda').linhas;
  const produtosBo = bloco('bo').linhas;
  const leadTime = bloco('leadTime').linhas;

  const periodoTexto = `${fmtData(dataInicio)} a ${fmtData(dataFim)}`;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <Toolbar>
          <Field label="De" className="w-44">
            <DatePicker value={dataInicio} onChange={setDataInicio} max={dataFim} aria-label="Início do período" />
          </Field>
          <Field label="Até" className="w-44">
            <DatePicker value={dataFim} onChange={setDataFim} min={dataInicio} aria-label="Fim do período" />
          </Field>
        </Toolbar>
      </Panel>

      <GradeKpi>
        <Kpi
          rotulo="Pedidos abertos"
          valor={kpi('PEDIDOS_ABERTOS')}
          hint={bloco('resumo').estado === 'ok' ? `${moeda(resumo.VL_ABERTO)} em aberto` : periodoTexto}
        />
        <Kpi rotulo="Envios fora da data" valor={kpi('ENVIOS_ATRASADOS')} hint="Análises agendadas que passaram sem envio" />
        <Kpi rotulo="Faturamentos pendentes" valor={kpi('FATURAMENTOS_PENDENTES')} hint="Enviados sem faturamento completo" />
        <Kpi rotulo="Notas em atraso" valor={kpi('NFS_ATRASADAS')} hint="Previsão de recebimento vencida" />
      </GradeKpi>

      <GradeGraficos>
        <PainelSerie
          titulo="Pedidos por fase"
          hint={bloco('resumo').estado === 'ok'
            ? `${periodoTexto} · ${inteiro(resumo.FORNECEDORES_COM_PEDIDO)} fornecedores com pedido em andamento`
            : periodoTexto}
          rotulo="Pedidos"
          serie={serieSimples(porFase, 'FASE_NOME', 'QTD')}
          bloco={bloco('porFase')}
          aoRecarregar={recarregar}
          rodape={<p className="text-[12px] text-ink-secondary">As dez fases do quadro, inclusive as vazias.</p>}
        />

        <PainelSerie
          titulo="Tempo médio por fase"
          hint={`Dias corridos em cada etapa · ${periodoTexto}`}
          rotulo="Dias"
          indiceSerie={1}
          serie={serieSimples(leadTime, 'FASE_NOME', 'DIAS_MEDIA')}
          bloco={bloco('leadTime')}
          aoRecarregar={recarregar}
          rodape={
            <p className="text-[12px] text-ink-secondary">
              {leadTime.reduce((acc, l) => acc + inteiro(l.PASSAGENS), 0).toLocaleString('pt-BR')} passagens sustentam as médias.
            </p>
          }
        />

        <PainelSerie
          titulo="Produtos em B.O. por fornecedor"
          hint={bloco('resumo').estado === 'ok'
            ? `${inteiro(resumo.ITENS_BO)} itens em falta, hoje`
            : 'Itens em falta, hoje'}
          rotulo="Valor pendente"
          indiceSerie={2}
          serie={serieSimples(produtosBo, 'FORNECEDOR', 'VL_PENDENTE')}
          bloco={bloco('bo')}
          formatar={moeda}
          aoRecarregar={recarregar}
          rodape={<p className="text-[12px] text-ink-secondary">Os {LIMITE_BLOCO} maiores, pelo custo do item no pedido.</p>}
        />

        <PainelLista
          titulo="Análises agendadas em atraso"
          hint={`Sem envio registrado até hoje · ${periodoTexto}`}
          bloco={bloco('agenda')}
          aoRecarregar={recarregar}
          rodape={<p className="text-[12px] text-ink-secondary">As {LIMITE_BLOCO} mais antigas.</p>}
        >
          <Table>
            <thead>
              <Tr>
                <Th>Fornecedor</Th><Th>Filial</Th><Th>Planejada</Th><Th numeric>Atraso</Th><Th>Situação</Th>
              </Tr>
            </thead>
            <tbody>
              {agenda.map((l) => (
                <Tr key={String(l.ID_AGENDA)}>
                  <Td>{l.FORNECEDOR || <Dash />}</Td>
                  <Td>{l.FILIAL || <Dash />}</Td>
                  <Td>{fmtData(String(l.DATA_PLANEJADA))}</Td>
                  <Td numeric>{quantidade(inteiro(l.DIAS_ATRASO))} dias</Td>
                  <Td><Status tone="alert">Pendente e atrasada</Status></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </PainelLista>
      </GradeGraficos>
    </div>
  );
}
