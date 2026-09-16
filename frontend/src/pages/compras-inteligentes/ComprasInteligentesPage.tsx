// Spec 011 (compras inteligentes) — `/compras-inteligentes`: o que comprar
// hoje, por fornecedor e filial.
//
// Custo de execução (RNF-001): abrir a tela custa 9 chamadas e trocar de
// fornecedor ou de filial custa 6, com 20 ou com 300 produtos — nada por linha.
// A carga da página traz fornecedores, eficiência e o quadro (3); o fornecedor
// traz as filiais (1); a filial dispara em paralelo parâmetros, vendas
// desconsideradas, coberturas e pedido aberto (4) e, com a lista de vendas
// desconsideradas em mãos, UMA `sgcWintRessuprimento` (1).
//
// Filtrar, ordenar, trocar de aba e ligar o seletor de licitação não custam
// nenhuma execução (RNF-005): a fórmula é recalculada na tela por
// `montarRessuprimento`, que é regra pura (R-083).
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useKanban } from '@benenutri/mitra-kanban';

import {
  Alert, Button, CheckRow, EmptyState, Field, GradeKpi, Kpi, PageHeader, Panel, PanelHeader,
  SearchInput, SelectMenu, Tabs, TabsContent, TabsList, TabsTrigger, Toolbar,
} from '@/components/page';
import { acao, linha as umaLinha, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { QUADRO_COMPRAS } from '@/lib/quadro';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { hojeIso, moeda } from '@/lib/formato';
import { coberturaDeLinha, limiteDeCobertura } from '@/lib/cobertura';
import type { Cobertura } from '@/lib/cobertura';
import {
  COLUNAS_CSV, JANELA_DIAS, aComprar, linhaCsv, montarRessuprimento, parametroDeLinha,
} from '@/lib/ressuprimento';
import type {
  AlvoDaCurva, EntradaCarrinho, LinhaRessuprimento, MedidaRessuprimento, ParametroCompra,
  StatusRessuprimento,
} from '@/lib/ressuprimento';
import { GradeRessuprimento } from './grid';
import { Carrinho } from './Carrinho';
import type { PedidoAberto } from './Carrinho';
import { DetalheSku, ParametrosDialogo, SilenciarDialogo, VendasDialogo } from './dialogos';
import type { AlvoParametro } from './dialogos';

interface Opcao { value: string; label: string; hint?: string }

const OPCOES_SITUACAO: Opcao[] = [
  { value: '', label: 'Qualquer situação' },
  { value: 'ruptura', label: 'Ruptura' },
  { value: 'elevada_exposicao', label: 'Elevada exposição' },
  { value: 'baixa_exposicao', label: 'Baixa exposição' },
  { value: 'adequado', label: 'Adequado' },
  { value: 'excesso', label: 'Excesso' },
];

/** A janela da tela: 153 dias terminados hoje, fixa e mostrada (D-016). */
function janelaDeHoje() {
  const fim = hojeIso();
  const inicio = new Date(`${fim}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - (JANELA_DIAS - 1));
  return { inicio: inicio.toISOString().slice(0, 10), fim };
}

const agoraCurto = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const instante = () => new Date().toISOString().slice(0, 19);

export default function ComprasInteligentesPage() {
  const navigate = useNavigate();
  const api = useKanban();
  const sessao = usePersona();
  const periodo = React.useMemo(() => janelaDeHoje(), []);

  const [fornecedores, setFornecedores] = React.useState<Opcao[]>([]);
  const [filiais, setFiliais] = React.useState<Opcao[]>([]);
  const [codfornec, setCodfornec] = React.useState('');
  const [codfilial, setCodfilial] = React.useState('');
  const [boardId, setBoardId] = React.useState(0);
  const [aderencia, setAderencia] = React.useState<number | null>(null);

  const [medidas, setMedidas] = React.useState<MedidaRessuprimento[]>([]);
  const [parametros, setParametros] = React.useState<ParametroCompra[]>([]);
  const [coberturas, setCoberturas] = React.useState<Cobertura[]>([]);
  const [desconsideradas, setDesconsideradas] = React.useState<number[]>([]);
  const [pedidoAberto, setPedidoAberto] = React.useState<PedidoAberto | null>(null);

  const [desconsiderarLicitacao, setDesconsiderarLicitacao] = React.useState(false);
  const [aba, setAba] = React.useState('comprar');
  const [situacao, setSituacao] = React.useState('');
  const [busca, setBusca] = React.useState('');
  const [quantidades, setQuantidades] = React.useState<Record<number, number>>({});
  const [carrinho, setCarrinho] = React.useState<EntradaCarrinho[]>([]);

  const [detalhe, setDetalhe] = React.useState<LinhaRessuprimento | null>(null);
  const [silenciando, setSilenciando] = React.useState<LinhaRessuprimento | null>(null);
  const [vendasDe, setVendasDe] = React.useState<LinhaRessuprimento | null>(null);
  const [parametroAlvo, setParametroAlvo] = React.useState<AlvoParametro | null>(null);

  const [carregando, setCarregando] = React.useState(false);
  const [recarga, setRecarga] = React.useState(0);
  const [erro, setErro] = React.useState('');
  const [salvoEm, setSalvoEm] = React.useState('');

  /* ── carga da página: fornecedores + eficiência + quadro (3 execuções) ── */
  React.useEffect(() => {
    let vivo = true;
    Promise.all([
      linhas('sgcFornecedorListar', { busca: '', ativo: 1, limite: 200, offset: 0 }),
      umaLinha('sgcEficienciaComprador', { compradorId: 0, codfornec: 0, dataInicio: '', dataFim: '' }),
      // O board vem aqui e não no carrinho: o id é o mesmo para todos os
      // grupos, e assim "criar pedido" custa 3 execuções por grupo, não 4.
      api.boardCarregar({ slug: QUADRO_COMPRAS }).catch(() => null),
    ]).then(([registros, eficiencia, quadro]) => {
      if (!vivo) return;
      setFornecedores(registros.map((r) => ({
        value: String(r.CODFORNEC), label: String(r.FORNECEDOR ?? ''), hint: String(r.CNPJ_FORMATADO ?? ''),
      })));
      const perc = eficiencia?.PERC_ADERENCIA;
      setAderencia(perc === null || perc === undefined ? null : Number(perc));
      setBoardId(Number(quadro?.board?.id ?? 0));
    }, () => vivo && setErro('Não foi possível carregar os fornecedores.'));
    return () => { vivo = false; };
  }, [api]);

  /* ── fornecedor escolhido: as filiais que ele atende (1 execução) ── */
  React.useEffect(() => {
    if (!codfornec) return;
    let vivo = true;
    acao('sgcFornecedorCarregar', { codfornec: Number(codfornec) }).then(
      (dados) => {
        if (!vivo) return;
        const registros: Record<string, unknown>[] = Array.isArray(dados.filiais) ? dados.filiais : [];
        setFiliais(registros
          .filter((r) => r.CODFILIAL !== undefined && r.CODFILIAL !== null)
          .map((r) => ({ value: String(r.CODFILIAL), label: String(r.FILIAL ?? r.CODFILIAL) })));
      },
      () => vivo && setFiliais([]),
    );
    return () => { vivo = false; };
  }, [codfornec]);

  /**
   * A carga pesada: 4 leituras em paralelo e, com o que voltou, UMA ao ERP —
   * as 5 execuções da troca de filial. `recarga` é o que a escrita de venda
   * incrementa para a medida ser refeita (a exclusão acontece na origem).
   */
  React.useEffect(() => {
    if (!codfornec || !codfilial) return;
    let vivo = true;
    Promise.all([
      linhas('sgcParametrosCompraListar', { codfornec: Number(codfornec), codfilial, limite: 600, offset: 0 }),
      linhas('sgcVendasDesconsideradasListar', { codfilial, codprod: 0, limite: 500, offset: 0 }),
      linhas('sgcCoberturaListar', { nivel: '', limite: 500, offset: 0 }),
      linhas('sgcPedidoAbertoDoFornecedor', { codfornec: Number(codfornec), codfilial, limite: 5, offset: 0 }),
    ])
      .then(async ([linhasParametro, linhasVenda, linhasCobertura, abertos]) => {
        // D-03: o `{{excluir}}` é montado do que VOLTOU do banco, nunca do que
        // a tela achou que gravou — escrita guardada recusada devolve 0 linhas.
        const excluir = linhasVenda.map((l) => Number(l.NUMTRANSITEM)).filter((n) => n > 0).slice(0, 500);
        if (!vivo) return;
        setParametros(linhasParametro.map(parametroDeLinha));
        setCoberturas(linhasCobertura.map(coberturaDeLinha));
        setDesconsideradas(excluir);
        setPedidoAberto(abertos.length > 0
          ? { idCard: Number(abertos[0].ID_CARD), titulo: String(abertos[0].TITULO ?? ''), faseChave: String(abertos[0].FASE_CHAVE ?? '') }
          : null);

        const rows = await linhas('sgcWintRessuprimento', {
          codfornec: Number(codfornec), codfilial,
          dataInicio: periodo.inicio, dataFim: periodo.fim, diasPeriodo: JANELA_DIAS,
          excluir: excluir.length > 0 ? excluir.join(', ') : '0',
        });
        if (!vivo) return;
        setMedidas(rows as unknown as MedidaRessuprimento[]);
        setQuantidades({});
        setErro('');
      })
      .catch(() => {
        if (!vivo) return;
        setErro('Não foi possível carregar a lista deste fornecedor nesta filial.');
        setMedidas([]);
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [codfornec, codfilial, periodo.inicio, periodo.fim, recarga]);

  /**
   * O alvo de cobertura por curva (R-089). Constante única: é a ÚNICA linha
   * desta tela que conhece a 012.
   */
  // S4 (R-103/R-111): trocar por limiteDeCobertura(coberturas, alvo, curva).alvoDias
  const alvoDaCurvaDias: AlvoDaCurva = React.useCallback((alvo) => limiteDeCobertura(coberturas, alvo).limiteDias, [coberturas]);

  /** O teto sem justificativa que viaja com o item do carrinho (R-112). */
  const coberturaLimiteDe = React.useCallback((l: LinhaRessuprimento) => limiteDeCobertura(coberturas, {
    codprod: Number(l.medida.CODPROD), codsec: Number(l.medida.CODSEC),
    codepto: Number(l.medida.CODEPTO), codfornec: Number(codfornec),
  }).limiteDias, [coberturas, codfornec]);

  // O mapa de unidades por caixa vem vazio de propósito: `sgcCustoUnidadesPorCaixa`
  // (7306) seria uma DÉCIMA execução na carga, e RNF-001 fecha em 9. Sem ele,
  // `unidadesPorCaixa` cai no cadastro do ERP e, na falta dele, na embalagem —
  // a mesma cadeia de RN-002 da 003, um degrau abaixo.
  const todas = React.useMemo(() => montarRessuprimento(
    medidas, parametros, alvoDaCurvaDias, new Map(),
    { codfornec: Number(codfornec), hoje: hojeIso(), desconsiderarLicitacao },
  ), [medidas, parametros, alvoDaCurvaDias, codfornec, desconsiderarLicitacao]);

  const termo = busca.trim().toLowerCase();
  const casa = React.useCallback((l: LinhaRessuprimento) => (
    termo === ''
    || String(l.medida.DESCRICAO).toLowerCase().includes(termo)
    || String(l.medida.CODPROD).includes(termo)
  ), [termo]);

  const visiveis = React.useMemo(() => {
    if (aba === 'comprar') return aComprar(todas).filter(casa);
    if (aba === 'transito') return todas.filter((l) => l.emTransito > 0).filter(casa);
    return todas.filter((l) => (situacao === '' || l.status === (situacao as StatusRessuprimento))).filter(casa);
  }, [aba, todas, situacao, casa]);

  const kpis = React.useMemo(() => {
    const fila = aComprar(todas);
    return {
      sugestao: fila.reduce((soma, l) => soma + l.sugerida * Number(l.medida.CUSTO_ULT_ENTRADA), 0),
      rupturas: todas.filter((l) => l.status === 'ruptura').length,
      silenciados: todas.filter((l) => l.silenciado).length,
      publico: todas.reduce((soma, l) => soma + Number(l.medida.VENDA_PUBLICA ?? 0), 0),
    };
  }, [todas]);

  const permissoes = sessao?.permissoes;
  const podeOperar = Boolean(permissoes?.operarComprasInteligentes);
  const podeParametrizar = Boolean(permissoes?.parametrizarCompras);
  const motivoBloqueio = permissoes?.somenteLeitura
    ? 'Seu acesso é somente leitura.'
    : 'Seu perfil não opera as compras inteligentes.';

  /* ── escritas: gravar e RELER o que o banco devolveu (D-03) ── */

  async function comRecarga(chamada: Promise<unknown>, relerMedidas = false) {
    await chamada;
    if (relerMedidas) {
      // A exclusão acontece na origem (RN-012): a medida do ERP precisa ser refeita.
      setCarregando(true);
      setRecarga((n) => n + 1);
    } else {
      const rows = await linhas('sgcParametrosCompraListar', {
        codfornec: Number(codfornec), codfilial, limite: 600, offset: 0,
      });
      setParametros(rows.map(parametroDeLinha));
    }
    setSalvoEm(agoraCurto());
  }

  const salvarParametro = (valores: { codprod: number; coberturaDias: number; leadTimeDias: number; gatilhoDias: number }) =>
    comRecarga(linhas('sgcEscParametroCompraSalvar', {
      codfornec: Number(codfornec), codfilial, ...valores, atualizadoEm: instante(),
    }));

  const silenciar = (valores: { codprod: number; silenciadoAte: string; motivo: string }) =>
    comRecarga(linhas('sgcEscParametroCompraSilenciar', {
      codfornec: Number(codfornec), codfilial, ...valores, atualizadoEm: instante(),
    }));

  const restaurar = (l: LinhaRessuprimento) =>
    comRecarga(linhas('sgcEscParametroCompraRestaurar', {
      codfornec: Number(codfornec), codfilial, codprod: Number(l.medida.CODPROD), atualizadoEm: instante(),
    }));

  const desconsiderarVenda = (venda: { numtransitem: number; codprod: number; dtmov: string; quantidade: number; motivo: string }) =>
    comRecarga(linhas('sgcEscVendaDesconsiderar', { ...venda, codfilial, em: instante() }), true);

  const reconsiderarVenda = (numtransitem: number) =>
    comRecarga(linhas('sgcEscVendaReconsiderar', { numtransitem }), true);

  function adicionar(l: LinhaRessuprimento, quantidade: number) {
    const codprod = Number(l.medida.CODPROD);
    if (pedidoAberto) return;
    setCarrinho((atual) => [
      ...atual.filter((e) => Number(e.linha.medida.CODPROD) !== codprod || e.codfilial !== codfilial),
      {
        linha: l, quantidade, codfornec: Number(codfornec), codfilial,
        fornecedor: fornecedores.find((f) => f.value === codfornec)?.label ?? '',
        filial: filiais.find((f) => f.value === codfilial)?.label ?? '',
      },
    ]);
  }

  function exportar() {
    baixarCsv(`compras-inteligentes-${periodo.fim}.csv`, textoCsv(COLUNAS_CSV, visiveis.map(linhaCsv)));
  }

  if (!sessao) return <EmptyState title="Carregando..." />;

  if (!sessao.permissoes.verComprasInteligentes) {
    return (
      <>
        <PageHeader module="Compras" title="Compras inteligentes" />
        <Alert tone="error">Seu perfil não tem acesso às compras inteligentes.</Alert>
      </>
    );
  }

  const grade = (
    <GradeRessuprimento
      linhas={visiveis}
      quantidades={quantidades}
      onQuantidade={(codprod, valor) => setQuantidades((atual) => ({ ...atual, [codprod]: valor }))}
      podeOperar={podeOperar}
      podeParametrizar={podeParametrizar}
      motivoBloqueio={motivoBloqueio}
      acoes={{
        onDetalhe: setDetalhe,
        onVendas: setVendasDe,
        onSilenciar: setSilenciando,
        onRestaurar: (l) => void restaurar(l),
        onParametros: (l) => setParametroAlvo({
          codprod: Number(l.medida.CODPROD),
          titulo: `Parâmetros de ${l.medida.DESCRICAO}`,
          coberturaDias: parametros.find((p) => p.codprod === Number(l.medida.CODPROD))?.coberturaDias ?? 0,
          leadTimeDias: parametros.find((p) => p.codprod === Number(l.medida.CODPROD))?.leadTimeDias ?? 0,
          gatilhoDias: parametros.find((p) => p.codprod === Number(l.medida.CODPROD))?.gatilhoDias ?? 0,
        }),
        onAdicionar: adicionar,
      }}
    />
  );

  return (
    <>
      <PageHeader
        module="Compras"
        title="Compras inteligentes"
        description={`O que comprar hoje, por fornecedor e filial. A janela são os últimos ${JANELA_DIAS} dias.`}
        meta={salvoEm ? <span>Salvo às {salvoEm}</span> : undefined}
        actions={
          <>
            <Button
              onClick={() => setParametroAlvo({
                codprod: 0,
                titulo: 'Parâmetros deste fornecedor',
                coberturaDias: parametros.find((p) => p.codprod === 0)?.coberturaDias ?? 0,
                leadTimeDias: parametros.find((p) => p.codprod === 0)?.leadTimeDias ?? 0,
                gatilhoDias: parametros.find((p) => p.codprod === 0)?.gatilhoDias ?? 0,
              })}
              disabled={!podeParametrizar || !codfilial}
              title={podeParametrizar ? undefined : motivoBloqueio}
            >
              Parâmetros do fornecedor
            </Button>
            <Button onClick={exportar} disabled={visiveis.length === 0}>
              <Download aria-hidden />
              Exportar CSV
            </Button>
          </>
        }
      />

      {erro ? <Alert tone="error" className="mb-4">{erro}</Alert> : null}

      <GradeKpi>
        <Kpi
          rotulo="Sugestão de compra"
          valor={kpis.sugestao > 0 ? moeda(kpis.sugestao) : '—'}
          hint="Soma da sugestão da aba A comprar, ao custo da última entrada."
        />
        <Kpi rotulo="Rupturas" valor={medidas.length === 0 ? '—' : kpis.rupturas} hint="Produtos sem estoque disponível." />
        <Kpi rotulo="Silenciados" valor={medidas.length === 0 ? '—' : kpis.silenciados} hint="Fora da fila de compra por prazo e motivo." />
        <Kpi
          rotulo="Aderência do comprador"
          valor={aderencia === null ? '—' : `${aderencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`}
          hint="Itens de pedidos nascidos aqui dentro de ±20 % da sugestão."
        />
      </GradeKpi>

      <Panel className="mt-4">
        <PanelHeader
          title="Ressuprimento"
          hint={`Janela de ${periodo.inicio} a ${periodo.fim}. Uma consulta ao ERP por carga — filtrar, ordenar e trocar de aba não custam nada.`}
        />
        <Toolbar>
          <Field label="Fornecedor" className="w-64">
            <SelectMenu
              label="Fornecedor"
              value={codfornec}
              onChange={(valor) => {
                setCodfornec(valor);
                setCodfilial('');
                setFiliais([]);
                setMedidas([]);
                setCarregando(false);
              }}
              options={fornecedores}
              placeholder={fornecedores.length ? 'Escolha o fornecedor' : 'Nenhum fornecedor ativo'}
              disabled={!fornecedores.length}
            />
          </Field>
          <Field label="Filial" className="w-56">
            <SelectMenu
              label="Filial"
              value={codfilial}
              onChange={(valor) => { setCarregando(true); setErro(''); setCodfilial(valor); }}
              options={filiais}
              placeholder={codfornec ? 'Escolha a filial' : 'Escolha o fornecedor primeiro'}
              disabled={!codfornec || !filiais.length}
            />
          </Field>
          <SearchInput
            placeholder="Buscar por produto ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="min-w-56 flex-1"
          />
          <CheckRow
            marcado={desconsiderarLicitacao}
            onToggle={() => setDesconsiderarLicitacao((atual) => !atual)}
            hint={`Venda pública na janela: ${kpis.publico.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un.`}
          >
            Desconsiderar venda para órgãos públicos
          </CheckRow>
        </Toolbar>

        {!codfilial ? (
          <EmptyState
            title="Escolha o fornecedor e a filial"
            hint="A lista traz todos os produtos ativos daquele fornecedor com situação, cobertura, gatilho e sugestão já calculados."
          />
        ) : carregando ? (
          <EmptyState title="Carregando a lista..." />
        ) : medidas.length === 0 ? (
          <EmptyState title="Nenhum produto ativo deste fornecedor nesta filial" />
        ) : (
          <Tabs value={aba} onValueChange={setAba}>
            <TabsList>
              <TabsTrigger value="comprar">A comprar</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="transito">Em trânsito</TabsTrigger>
            </TabsList>
            <TabsContent value="comprar">{grade}</TabsContent>
            <TabsContent value="todos">
              <Toolbar>
                <Field label="Situação" className="w-56">
                  <SelectMenu label="Situação" value={situacao} onChange={setSituacao} options={OPCOES_SITUACAO} />
                </Field>
              </Toolbar>
              {grade}
            </TabsContent>
            <TabsContent value="transito">{grade}</TabsContent>
          </Tabs>
        )}
      </Panel>

      <div className="mt-4">
        <Carrinho
          itens={carrinho}
          boardId={boardId}
          usuarioId={sessao.usuarioId}
          periodo={periodo}
          pedidoAberto={pedidoAberto}
          podeOperar={podeOperar}
          motivoBloqueio={motivoBloqueio}
          coberturaLimiteDe={coberturaLimiteDe}
          onRemover={(codprod, filial) => setCarrinho((atual) => atual.filter(
            (e) => Number(e.linha.medida.CODPROD) !== codprod || e.codfilial !== filial,
          ))}
          onLimpar={() => setCarrinho([])}
          onCriado={(cardId) => navigate(`/quadro?card=${cardId}`)}
        />
      </div>

      <DetalheSku linha={detalhe} codfilial={codfilial} onFechar={() => setDetalhe(null)} />
      <ParametrosDialogo alvo={parametroAlvo} onFechar={() => setParametroAlvo(null)} onSalvar={salvarParametro} />
      <SilenciarDialogo linha={silenciando} onFechar={() => setSilenciando(null)} onSilenciar={silenciar} />
      <VendasDialogo
        linha={vendasDe}
        codfilial={codfilial}
        periodo={periodo}
        desconsideradas={desconsideradas}
        onFechar={() => setVendasDe(null)}
        onDesconsiderar={desconsiderarVenda}
        onReconsiderar={reconsiderarVenda}
      />
    </>
  );
}
