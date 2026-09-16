// Spec 009 — aba Compras × vendas de `/analises` (RF-006, C-005, C-006, RN-011,
// RN-012).
//
// A comparação casa entrada com saída POR FILIAL e não existe consolidada: sem
// filial escolhida no cabeçalho, a tela assume a primeira da lista e DIZ qual
// (`filialDoRecorte`) — nunca chama a consulta com a filial vazia, que devolve
// zero linhas de propósito.
import * as React from 'react';
import { linhas } from '@/lib/mitra-api';
import { GradeGraficos, Panel, SelectMenu, Toolbar, Field } from '@/components/page';
import {
  filialDoRecorte, listarPeriodos, periodoCorrente, periodoRange, resultadosDosBlocos,
  serieComparativa, type Bloco, type FilialErp,
} from '@/lib/analises';
import { fmtData, moeda } from '@/lib/formato';
import { PainelComparativo } from './blocos';

const LIMITE = 50;
type Linha = Record<string, string | number | null>;

export default function ComprasVendasTab({ codfilial, filiais }: { codfilial: string; filiais: FilialErp[] }) {
  const periodos = React.useMemo(() => listarPeriodos(), []);
  const [periodo, setPeriodo] = React.useState(() => periodoCorrente());
  const VAZIO: Bloco<Linha> = React.useMemo(() => ({ estado: 'vazio', linhas: [], erro: '' }), []);
  const [carregado, setCarregado] = React.useState<Bloco<Linha>>(VAZIO);
  const [recarga, setRecarga] = React.useState(0);

  const recorte = filialDoRecorte(filiais, codfilial);
  const { dataInicio, dataFim } = periodoRange(periodo);

  React.useEffect(() => {
    // RN-012: sem nenhuma filial no ERP a tela NÃO chama a consulta — com a
    // filial vazia ela devolveria zero linhas de propósito.
    if (!recorte.codfilial) return undefined;
    let vivo = true;
    Promise.allSettled([
      linhas('sgcWintComprasVsVendas', { codfilial: recorte.codfilial, dataInicio, dataFim, limite: LIMITE }),
    ]).then((resultados) => {
      if (!vivo) return;
      setCarregado(resultadosDosBlocos(['comparacao'], resultados as PromiseSettledResult<Linha[]>[]).comparacao);
    });
    return () => { vivo = false; };
  }, [recorte.codfilial, dataInicio, dataFim, recarga]);

  const bloco = recorte.codfilial ? carregado : VAZIO;

  const nomeDaFilial = filiais.find((f) => f.CODFILIAL === recorte.codfilial)?.FILIAL ?? recorte.codfilial;
  const hint = `${recorte.aviso || `Filial: ${nomeDaFilial}`} · ${fmtData(dataInicio)} a ${fmtData(dataFim)}`;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <Toolbar>
          <Field label="Período" className="w-64">
            <SelectMenu
              label="Período"
              value={periodo}
              onChange={setPeriodo}
              options={periodos}
              placeholder="Mês ou trimestre"
            />
          </Field>
        </Toolbar>
      </Panel>

      <GradeGraficos>
        <PainelComparativo
          titulo="Comprado × vendido por fornecedor"
          hint={hint}
          rotuloA="Comprado (qtd.)"
          rotuloB="Vendido (qtd.)"
          serie={serieComparativa(bloco.linhas, 'FORNECEDOR', 'QT_COMPRADA', 'QT_VENDIDA')}
          bloco={bloco}
          aoRecarregar={() => setRecarga((n) => n + 1)}
          rodape={
            <p className="text-[12px] text-ink-secondary">
              Os {LIMITE} fornecedores de maior venda no período. Valores:{' '}
              {moeda(bloco.linhas.reduce((acc, l) => acc + Number(l.VL_COMPRADO ?? 0), 0))} comprados contra{' '}
              {moeda(bloco.linhas.reduce((acc, l) => acc + Number(l.VL_VENDIDO ?? 0), 0))} vendidos, dos quais{' '}
              {moeda(bloco.linhas.reduce((acc, l) => acc + Number(l.VL_VENDIDO_LICITACAO ?? 0), 0))} de licitação.
            </p>
          }
        />

        <PainelComparativo
          titulo="Venda total × venda de licitação"
          hint={hint}
          rotuloA="Venda total (qtd.)"
          rotuloB="Licitação (qtd.)"
          serie={serieComparativa(bloco.linhas, 'FORNECEDOR', 'QT_VENDIDA', 'QT_VENDIDA_LICITACAO')}
          bloco={bloco}
          aoRecarregar={() => setRecarga((n) => n + 1)}
          rodape={
            <p className="text-[12px] text-ink-secondary">
              A venda para órgão público entra em coluna própria em vez de sumir da conta — quem quiser a leitura sem
              licitação subtrai.
            </p>
          }
        />
      </GradeGraficos>
    </div>
  );
}
