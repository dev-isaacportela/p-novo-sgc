// "Análise de venda futura" com escolha de modelo (spec 011, R-124; R-126):
// dois blocos com rótulo — "Previsão pelo modelo" (seletor, texto de ajuda e
// os quatro KPIs, com a linha de fatos em pílulas embaixo) e "Regra de
// ressuprimento (consumo ponderado)" (as seis grandezas da RN-006). Vive no
// painel de detalhe (uma coluna) e na janela Análise do Produto, sobre a
// `Previsao` que a página já calculou para o produto aberto — nenhuma
// consulta aqui. Números inteiros onde é estoque/alvo, 1 casa no consumo, no
// MAPE e no TS, 0 no MAD; subtítulo curto, explicação longa no `title`.
import { Alert, Badge, Dash, EmptyState, GradeMini, MiniCartao, RowMeta, SelectMenu } from '@/components/page';
import { numeroPt } from '@/lib/formato';
import { LIMITE_TS, MODELOS, PONTOS_MINIMOS, modeloEscolhido, textoDosParametros } from '@/lib/previsao';
import type { ModeloPrevisao, Previsao, SugestaoProjetada } from '@/lib/previsao';
import { textoDaSugestao } from '@/lib/ressuprimento';
import type { LinhaRessuprimento, ReferenciaSugestao } from '@/lib/ressuprimento';
import { diasDoMes, somarMeses } from '@/lib/ressuprimento-detalhe';

const ORIGEM_LEAD = { sku: 'do produto', fornecedor: 'do fornecedor', medido: 'medido no ERP', padrao: 'padrão' } as const;

function Bloco({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{rotulo}</p>
      {children}
    </div>
  );
}

export function AnaliseVendaFutura({
  linha,
  previsao,
  modelo,
  onModelo,
  projetada,
  referencia,
  hoje,
  compacto = false,
}: {
  linha: LinhaRessuprimento;
  /** `null` enquanto o histórico do SKU não voltou. */
  previsao: Previsao | null;
  modelo: ModeloPrevisao;
  onModelo: (modelo: ModeloPrevisao) => void;
  projetada: SugestaoProjetada | null;
  referencia: ReferenciaSugestao;
  hoje: string;
  /** No painel lateral: tudo em uma coluna. */
  compacto?: boolean;
}) {
  const escolhido = previsao ? modeloEscolhido(previsao, modelo) : null;
  const vencedor = previsao?.suficiente ? previsao.modelos.find((m) => m.modelo === previsao.bestFit) ?? null : null;
  const opcoes = MODELOS.map((m) => {
    const calculado = previsao?.suficiente ? previsao.modelos.find((r) => r.modelo === m.value) ?? null : null;
    const mad = m.value === 'bestfit' ? vencedor?.mad : calculado?.mad;
    return {
      value: m.value,
      label: m.value === 'bestfit' && vencedor ? `Best Fit → ${vencedor.rotulo}` : m.label,
      // O MAD vem primeiro: a descrição longa é o que a lista corta.
      hint: `${mad === undefined ? '' : `MAD ${numeroPt(mad)} · `}${m.descricao}`,
    };
  });
  const proximoMes = somarMeses(String(hoje).slice(0, 7), 1);
  const projecaoRegra = Math.round(Math.max(0, linha.consumoDiario) * diasDoMes(proximoMes));
  const leadMedido = Number(linha.medida.LEAD_TIME_MEDIDO ?? 0);
  const colunas = compacto ? 1 : 4;

  return (
    <div className="flex flex-col gap-5">
      <Bloco rotulo="Previsão pelo modelo">
        <div className={compacto ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'}>
          <RowMeta>Escolha o modelo matemático. O Best Fit compara o MAD histórico e usa automaticamente o menor erro.</RowMeta>
          <SelectMenu
            label="Modelo de previsão"
            value={modelo}
            onChange={(v) => onModelo(v as ModeloPrevisao)}
            options={opcoes}
            disabled={!previsao?.suficiente}
            className={compacto ? undefined : 'sm:w-72'}
          />
        </div>
        {!previsao ? (
          <EmptyState title="Carregando…" />
        ) : !previsao.suficiente || !escolhido ? (
          <Alert tone="info">
            {`Menos de ${PONTOS_MINIMOS} meses fechados com venda (${previsao.serie.pontos.length}): sem projeção por modelo. A sugestão segue o consumo ponderado por recência.`}
          </Alert>
        ) : (
          <>
            <GradeMini colunas={colunas}>
              <MiniCartao
                rotulo="Projeção mensal"
                valor={`${numeroPt(Math.round(escolhido.previsao))} un.`}
                hint={`${escolhido.rotulo}${textoDosParametros(escolhido) ? ` · ${textoDosParametros(escolhido)}` : ''}`}
                title="A previsão do próximo mês pelo modelo escolhido, sobre os meses fechados"
              />
              <MiniCartao rotulo="MAD" valor={numeroPt(escolhido.mad)} hint={`MAPE ${numeroPt(escolhido.mape, 1)} %`} title="Erro médio absoluto dos passos de um mês; MAPE é o mesmo erro em % do real" />
              <MiniCartao
                rotulo="Tracking Signal"
                valor={numeroPt(escolhido.ts, 1)}
                tone={escolhido.sobControle ? 'neutral' : 'attention'}
                hint={`limite ±${LIMITE_TS} · ${escolhido.sobControle ? 'sob controle' : 'fora de controle'}`}
                title="Erro acumulado dividido pelo MAD; fora de ±4 o modelo vem errando sempre para o mesmo lado"
              />
              <MiniCartao
                rotulo="Sugestão projetada"
                valor={projetada ? textoDaSugestao(projetada.sugestao, linha.unidadesPorCaixa, referencia) : <Dash />}
                hint={projetada ? `demanda ${numeroPt(projetada.demandaDiaria, 1)} un./dia` : undefined}
                title={projetada ? `Demanda = projeção ÷ 30, vezes a cobertura, menos disponível e trânsito, à caixa · alvo no lead time ${numeroPt(Math.ceil(projetada.alvoLeadTime))} un.` : undefined}
              />
            </GradeMini>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">{`${previsao.serie.pontos.length} ${previsao.serie.pontos.length === 1 ? 'mês usado' : 'meses usados'}`}</Badge>
              <Badge tone={previsao.serie.outliersAjustados > 0 ? 'attention' : 'neutral'}>{`${previsao.serie.outliersAjustados} ${previsao.serie.outliersAjustados === 1 ? 'outlier ajustado' : 'outliers ajustados'}`}</Badge>
              <Badge tone="neutral">{`3 m ${numeroPt(Math.round(previsao.medias.m3))}`}</Badge>
              <Badge tone="neutral">{`6 m ${numeroPt(Math.round(previsao.medias.m6))}`}</Badge>
              <Badge tone="neutral">{`12 m ${numeroPt(Math.round(previsao.medias.m12))}`}</Badge>
              {escolhido.semSazonalidade ? <Badge tone="attention">sem meses para a sazonalidade: Holt</Badge> : null}
            </div>
          </>
        )}
      </Bloco>

      <Bloco rotulo="Regra de ressuprimento (consumo ponderado)">
        <GradeMini colunas={compacto ? 1 : 6}>
          <MiniCartao rotulo="Consumo diário" valor={linha.consumoDiario > 0 && linha.consumoDiario < 0.05 ? '< 0,1 un.' : `${numeroPt(linha.consumoDiario, 1)} un.`} hint="ponderado por recência" title="Média da venda diária na janela, cada dia pesando 0,85 elevado aos dias até o fim" />
          <MiniCartao rotulo="Projeção do mês" valor={`${numeroPt(projecaoRegra)} un.`} hint="consumo × dias" title="Consumo diário × dias do mês seguinte" />
          <MiniCartao rotulo="Estoque de segurança" valor={`${numeroPt(Math.ceil(linha.estoqueSeguranca))} un.`} hint="lead × consumo" title="Lead time × consumo diário" />
          <MiniCartao rotulo="Ponto de pedido" valor={`${numeroPt(Math.ceil(linha.pontoDePedido))} un.`} hint="2 × lead × consumo" title="2 × lead time × consumo diário" />
          <MiniCartao rotulo="Estoque máximo" valor={`${numeroPt(Math.ceil(linha.estoqueMaximo))} un.`} hint={`${linha.coberturaDias} dias`} title="Cobertura resolvida × consumo diário" />
          <MiniCartao
            rotulo="Lead time medido"
            valor={leadMedido > 0 ? `${leadMedido} d` : <Dash />}
            hint={leadMedido > 0 ? `em uso: ${linha.leadTimeDias} d (${ORIGEM_LEAD[linha.parametros.origemLeadTime]})` : 'sem entrada casada'}
            title={leadMedido > 0 ? 'Média das entradas dos últimos 12 meses, da emissão do pedido à entrada' : 'Nenhuma entrada casada com pedido ao ERP nos últimos 12 meses'}
          />
        </GradeMini>
      </Bloco>
    </div>
  );
}
