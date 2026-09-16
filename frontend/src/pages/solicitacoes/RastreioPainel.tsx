// Spec 008 — o painel de rastreio pós-aprovação (RF-014..RF-017, RF-021).
//
// Dois eixos INDEPENDENTES, lado a lado (RN-014: colapsar esconderia um dos
// dois fatos): o cliente que motivou a compra comprou? e o que entrou está
// girando? A consulta ao ERP é UMA por lote de 120 solicitações (RNF-003), e
// mudar um dos três limites reclassifica em memória, sem consulta nova
// (RNF-004) — toda a régua é pura, em `lib/solicitacoes.ts`.
//
// RF-017/C-016: lote que falha vira "Sem dado" nos dois eixos e um aviso no
// topo. Silêncio viraria "sem alerta", que é a resposta errada.
import * as React from 'react';
import { Download } from 'lucide-react';
import {
  Alert, Button, Code, Dash, EmptyState, Input, LabelledField, Panel, PanelHeader,
  RowMeta, RowTitle, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { fmtData, hojeIso } from '@/lib/formato';
import {
  LIMITES_PADRAO, alvoDeRastreio, chaveRastreio, classificarRastreio, colunasDoCsv, dataReferencia,
  indexarRastreio, linhaDoCsv, lotesDePares, montarPares, resumoRastreio, rotuloEstoque, rotuloVenda,
  type LimitesRastreio, type LinhaSolicitacao, type RastreioRow, type RastreioSolicitacao,
} from '@/lib/solicitacoes';

const numeroBr = (valor: number) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export default function RastreioPainel({ registros }: { registros: LinhaSolicitacao[] }) {
  const hoje = hojeIso();
  const [limites, setLimites] = React.useState<LimitesRastreio>(LIMITES_PADRAO);
  const [linhasRastreio, setLinhasRastreio] = React.useState<RastreioRow[]>([]);
  const [lotesComFalha, setLotesComFalha] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');

  // RN-015: só entram as aprovadas COM data de aprovação — é ela a referência.
  const alvos = React.useMemo(() => registros.filter(alvoDeRastreio), [registros]);
  const pares = React.useMemo(() => montarPares(alvos), [alvos]);

  React.useEffect(() => {
    let vivo = true;
    // Um lote que estoura não derruba os outros (RF-017): o que falhou vira
    // "sem dado", e o painel diz quantas ficaram sem leitura. Sem par nenhum,
    // `allSettled([])` resolve vazio na microtarefa seguinte — nenhuma consulta
    // sai, e nada precisa de setState síncrono dentro do efeito.
    const lotes = lotesDePares(pares);
    Promise.allSettled(lotes.map((lote) => linhas('sgcWintRastreioSolicitacoes', { pares: lote })))
      .then((resultados) => {
        if (!vivo) return;
        const todas: RastreioRow[] = [];
        let falhas = 0;
        for (const resultado of resultados) {
          if (resultado.status === 'fulfilled') todas.push(...(resultado.value as unknown as RastreioRow[]));
          else falhas += 1;
        }
        setLinhasRastreio(todas);
        setLotesComFalha(falhas);
        setErro('');
      })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível ler o rastreio.');
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [pares]);

  // RNF-004: trocar um limite reclassifica ESTES dados — nenhuma consulta nova.
  const porChave = React.useMemo(
    () => indexarRastreio(linhasRastreio, hoje, limites),
    [linhasRastreio, hoje, limites],
  );

  const detalheDe = React.useCallback(
    (registro: LinhaSolicitacao): RastreioSolicitacao | null => porChave.get(
      chaveRastreio(registro.CODPROD, registro.CODFILIAL, dataReferencia(registro), registro.CODCLI),
    ) ?? null,
    [porChave],
  );

  // Solicitação sem linha no retorno entra no resumo como `sem_dado` — é o
  // número que o aviso de RF-017 mostra.
  const resumo = React.useMemo(
    () => resumoRastreio(alvos.map((registro) => detalheDe(registro) ?? classificarRastreio(null, hoje))),
    [alvos, detalheDe, hoje],
  );

  function limite(campo: keyof LimitesRastreio, valor: string) {
    const numero = Number(valor);
    setLimites((atual) => ({ ...atual, [campo]: Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : 0 }));
  }

  function exportar() {
    const linhasCsv = alvos.map((registro) => linhaDoCsv(registro, detalheDe(registro)));
    baixarCsv(`rastreio-solicitacoes-${hoje}.csv`, textoCsv(colunasDoCsv(), linhasCsv));
  }

  const semDado = resumo.sem_dado ?? 0;

  return (
    <Panel className="mt-4">
      <PanelHeader
        title="Rastreio pós-aprovação"
        hint={carregando
          ? 'Lendo o giro e a venda ao cliente no ERP...'
          : `${alvos.length} solicitações aprovadas nesta página · ${resumo.comprou ?? 0} com venda ao cliente · ${resumo.parado ?? 0} paradas na filial`}
      >
        <Button onClick={exportar} disabled={carregando || alvos.length === 0} title={alvos.length === 0 ? 'Nada para exportar nesta página.' : undefined}>
          <Download aria-hidden />
          Exportar CSV
        </Button>
      </PanelHeader>

      {erro ? <Alert tone="error">{erro}</Alert> : null}
      {semDado > 0 || lotesComFalha > 0 ? (
        <div className="px-4 pt-3">
          <Alert tone="warn">
            {semDado} solicitação(ões) ficaram <strong>sem dado</strong> nos dois eixos
            {lotesComFalha > 0 ? ` — ${lotesComFalha} lote(s) do rastreio não puderam ser lidos.` : '.'}
            {' '}Isso não é "sem alerta": é leitura que faltou.
          </Alert>
        </div>
      ) : null}

      <Toolbar>
        <LabelledField label="Carência (dias)" hint="Antes disso não se cobra resultado." className="w-40">
          <Input
            type="number"
            min={0}
            value={String(limites.carenciaDias)}
            onChange={(evento) => limite('carenciaDias', evento.target.value)}
          />
        </LabelledField>
        <LabelledField label="Sem saída (dias)" hint="A partir daí, parado na filial." className="w-40">
          <Input
            type="number"
            min={0}
            value={String(limites.paradoDias)}
            onChange={(evento) => limite('paradoDias', evento.target.value)}
          />
        </LabelledField>
        <LabelledField label="Cobertura (dias)" hint="Acima disso, estoque em excesso." className="w-40">
          <Input
            type="number"
            min={0}
            value={String(limites.coberturaDias)}
            onChange={(evento) => limite('coberturaDias', evento.target.value)}
          />
        </LabelledField>
      </Toolbar>

      {alvos.length === 0 ? (
        <EmptyState
          title="Nenhuma solicitação aprovada nesta página"
          hint="O rastreio só responde por solicitação com data de aprovação — é dela que a leitura parte."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th>Cliente</Th>
              <Th>Aprovada em</Th>
              <Th>O cliente comprou?</Th>
              <Th>O estoque girou?</Th>
              <Th numeric>Estoque</Th>
              <Th numeric>Cobertura</Th>
            </tr>
          </thead>
          <tbody>
            {alvos.map((registro) => {
              const detalhe = detalheDe(registro);
              const venda = rotuloVenda(detalhe ? detalhe.venda : 'sem_dado');
              const estoque = rotuloEstoque(detalhe ? detalhe.estoque : 'sem_dado');
              return (
                <Tr key={registro.ID}>
                  <Td>
                    <RowTitle>{registro.DESCRICAO}</RowTitle>
                    <RowMeta><Code prefix="cód.">{registro.CODPROD}</Code> · {registro.FILIAL || registro.CODFILIAL}</RowMeta>
                  </Td>
                  <Td>
                    {Number(registro.CODCLI) > 0 ? (
                      <>
                        <RowTitle>{registro.CLIENTE}</RowTitle>
                        <RowMeta><Code prefix="cód.">{registro.CODCLI}</Code></RowMeta>
                      </>
                    ) : <RowMeta>Sem cliente informado</RowMeta>}
                  </Td>
                  <Td>{fmtData(registro.AVALIADO_EM)}</Td>
                  <Td>
                    <Status tone={venda.tom}>{venda.label}</Status>
                    {detalhe && detalhe.qtVendidaCliente > 0 ? (
                      <RowMeta>{numeroBr(detalhe.qtVendidaCliente)} ao cliente</RowMeta>
                    ) : null}
                    {detalhe && detalhe.qtVendidaCliente === 0 && detalhe.qtVendidaFilial > 0 ? (
                      <RowMeta>{numeroBr(detalhe.qtVendidaFilial)} vendidas na filial a outros clientes</RowMeta>
                    ) : null}
                  </Td>
                  <Td>
                    <Status tone={estoque.tom}>{estoque.label}</Status>
                    {detalhe && detalhe.diasSemSaida !== null ? (
                      <RowMeta>última saída há {detalhe.diasSemSaida} dia(s)</RowMeta>
                    ) : null}
                  </Td>
                  <Td numeric>{detalhe ? numeroBr(detalhe.qtEstoque) : <Dash />}</Td>
                  <Td numeric>
                    {detalhe && detalhe.diasCobertura !== null ? `${Math.round(detalhe.diasCobertura)} d` : <Dash />}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
