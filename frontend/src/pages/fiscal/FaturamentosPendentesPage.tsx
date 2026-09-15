// Faturamentos pendentes (spec 005, RF-025): pedidos enviados que ainda não
// foram 100 % faturados, ordenados pelos dias úteis desde o envio.
//
// O total vem SEMPRE de `sgcFaturamentoPendenteListarTotal` (R-045: a página
// tem uma fatia, não o universo). As quatro faixas são filtro do SERVIDOR —
// filtrar na tela mostraria "3 de 20" quando o banco tem 200.
//
// R-041: o pedido em Produtos em B.O. CONTINUA aqui, com a previsão de
// liberação e os itens em aberto — quem sai é o aviso diário do cron, não a
// lista. Dois avisos por dia sobre o mesmo pedido foi defeito do SGC anterior.

import * as React from 'react';
import { Download, Eye, Mail, PhoneCall } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, EmptyState, FilterChip, IconButton, PageHeader, Pagination, Panel,
  RowMeta, RowTitle, SearchInput, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page';
import { comPadrao, linha, linhas } from '@/lib/mitra-api';
import { fmtData, fmtDataHora, hojeIso, moeda } from '@/lib/formato';
import { baixarCsv, textoCsv } from '@/lib/csv';
import { colunasDoCsv, nivelDeAlerta, type LinhaPendente } from '@/lib/faturamento';
import { usePersona } from '@/lib/persona';
import { DialogoCobranca, DialogoContato, type PedidoDaAba } from '@/pages/quadros/abas/nf-dialogos';

const LIMITE = 20;

interface PendenteLinha extends LinhaPendente {
  ID_CARD: number;
  CODFORNEC: number;
  CODFILIAL: string;
  EMAIL_ENVIO: string;
  PERC_QTD: number;
  ALERTA_NIVEL: number;
}

const FAIXAS = [
  { value: '', label: 'Todos' },
  { value: 'sem_contato', label: 'Sem contato' },
  { value: '3', label: '3 dias úteis ou mais' },
  { value: '5', label: '5 dias úteis ou mais' },
  { value: 'mais5', label: 'Acima de 5 dias úteis' },
];

/** O pedido como o diálogo de cobrança o espera — a lista já traz tudo. */
function comoPedido(registro: PendenteLinha): PedidoDaAba {
  return {
    ID_CARD: registro.ID_CARD, TITULO: String(registro.TITULO ?? ''), FASE: String(registro.FASE ?? ''),
    CODFORNEC: registro.CODFORNEC, FORNECEDOR: String(registro.FORNECEDOR ?? ''),
    CODFILIAL: registro.CODFILIAL, FILIAL: String(registro.FILIAL ?? ''),
    NUMPED_WINTHOR: String(registro.NUMPED ?? ''), DT_ENVIO: String(registro.DT_ENVIO ?? ''),
    EMAIL_ENVIO: registro.EMAIL_ENVIO, VL_TOTAL: Number(registro.VL_TOTAL ?? 0),
    VL_FATURADO: Number(registro.VL_FATURADO ?? 0),
    PERC_FATURADO_VALOR: Number(registro.PERC_VALOR ?? 0), PERC_FATURADO_QTD: Number(registro.PERC_QTD ?? 0),
    PRAZO_ACORDADO: '', VALIDADE_MINIMA: 0,
  };
}

export default function FaturamentosPendentesPage() {
  const navigate = useNavigate();
  const sessao = usePersona();
  const [busca, setBusca] = React.useState('');
  const [faixa, setFaixa] = React.useState('');
  const [pagina, setPagina] = React.useState(1);
  const [versao, setVersao] = React.useState(0);

  const [registros, setRegistros] = React.useState<PendenteLinha[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');

  const [contatando, setContatando] = React.useState<PendenteLinha | null>(null);
  const [cobrando, setCobrando] = React.useState<PendenteLinha | null>(null);

  React.useEffect(() => {
    let vivo = true;
    const filtros = comPadrao(
      { faixa, busca, hoje: hojeIso(), limite: String(LIMITE), offset: String((pagina - 1) * LIMITE) },
      { faixa: '', busca: '', hoje: hojeIso(), limite: String(LIMITE), offset: '0' },
    );
    Promise.all([
      linhas('sgcFaturamentoPendenteListar', filtros),
      linha('sgcFaturamentoPendenteListarTotal', { faixa: filtros.faixa, busca: filtros.busca, hoje: filtros.hoje }),
    ])
      .then(([rows, totalRow]) => {
        if (!vivo) return;
        setRegistros(rows as unknown as PendenteLinha[]);
        setTotal(Number(totalRow?.TOTAL ?? 0));
      })
      .catch((falha) => { if (vivo) setErro(falha instanceof Error ? falha.message : 'Falha ao carregar a lista.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [busca, faixa, pagina, versao]);

  const podeContatar = !!sessao?.permissoes.registrarContato;
  const motivo = sessao && !podeContatar
    ? 'O seu perfil vê os faturamentos pendentes, mas não registra contato nem envia cobrança.'
    : '';
  const lastPage = Math.max(1, Math.ceil(total / LIMITE));
  const faixaAtual = FAIXAS.find((f) => f.value === faixa && f.value !== '');

  function exportar() {
    // R-037: a exportação é sobre o que a tela já carregou — sem segunda
    // consulta e sem server function nova.
    const { cabecalho, corpo } = colunasDoCsv(registros);
    baixarCsv(`faturamentos-pendentes-${hojeIso()}.csv`, textoCsv(cabecalho, corpo));
  }

  // A-8 / R-028: sem porteiro, o comercial digitava `/faturamentos-pendentes` e
  // lia a lista inteira — o item some do menu, mas a rota não é do menu. Mesma
  // recusa de SegurancaPage e QuadroPage, com a permissão de `permissoes.ts`.
  if (!sessao) return <EmptyState title="Carregando..." />;
  if (!sessao.permissoes.verFaturamentoPendente) {
    return (
      <>
        <PageHeader module="Fiscal" title="Faturamentos pendentes" />
        <Alert tone="error">Seu perfil não tem acesso aos faturamentos pendentes.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Fiscal"
        title="Faturamentos pendentes"
        description="Pedidos enviados sem faturamento completo, por dias úteis desde o envio."
        meta={<span><strong>{total.toLocaleString('pt-BR')}</strong> pedidos</span>}
        actions={(
          <Button onClick={exportar} disabled={registros.length === 0}>
            <Download aria-hidden />
            Exportar CSV
          </Button>
        )}
      />

      <Panel>
        {erro ? <Alert tone="error">{erro}</Alert> : null}
        {motivo ? <Alert tone="info">{motivo}</Alert> : null}

        <Toolbar>
          <SearchInput
            placeholder="Buscar por fornecedor, pedido ou número do WinThor"
            value={busca}
            onChange={(evento) => { setCarregando(true); setPagina(1); setBusca(evento.target.value); }}
            className="min-w-56 flex-1"
          />
          <div className="flex flex-wrap gap-2">
            {FAIXAS.map((opcao) => (
              <Button
                key={opcao.value || 'todos'}
                size="sm"
                variant={faixa === opcao.value ? 'primary' : 'secondary'}
                onClick={() => { setCarregando(true); setPagina(1); setFaixa(opcao.value); }}
              >
                {opcao.label}
              </Button>
            ))}
          </div>
        </Toolbar>

        {faixaAtual ? (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            <FilterChip
              label="Faixa"
              value={faixaAtual.label}
              onClear={() => { setCarregando(true); setPagina(1); setFaixa(''); }}
            />
          </div>
        ) : null}

        {!carregando && registros.length === 0 ? (
          <EmptyState
            title="Nenhum faturamento pendente nesta faixa"
            hint="Pedido 100 % faturado sai da lista sozinho, na rodada diária."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Fornecedor</Th>
                <Th numeric>Valor</Th>
                <Th numeric>Faturado</Th>
                <Th numeric>Dias úteis</Th>
                <Th>Último contato</Th>
                <Th className="w-40 text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {registros.map((registro) => {
                const dias = Number(registro.DIAS_UTEIS ?? 0);
                const nivel = nivelDeAlerta(dias);
                const emBo = String(registro.FASE ?? '') === 'bo';
                return (
                  <Tr key={registro.ID_CARD}>
                    <Td>
                      <RowTitle>{registro.TITULO}</RowTitle>
                      <RowMeta>
                        {registro.NUMPED ? `pedido ${registro.NUMPED} · ` : ''}
                        enviado em {fmtData(String(registro.DT_ENVIO ?? ''))}
                      </RowMeta>
                      {emBo ? (
                        <RowMeta>
                          Em B.O.: {Number(registro.QT_BO_ABERTO ?? 0)} itens em aberto
                          {registro.DT_PREVISAO_BO ? ` · previsão ${fmtData(registro.DT_PREVISAO_BO)}` : ' · sem previsão'}
                        </RowMeta>
                      ) : null}
                    </Td>
                    <Td>
                      {registro.FORNECEDOR}
                      <RowMeta>{registro.FILIAL}</RowMeta>
                    </Td>
                    <Td numeric>{moeda(registro.VL_TOTAL)}</Td>
                    <Td numeric>
                      {moeda(registro.VL_FATURADO)}
                      <RowMeta>{Number(registro.PERC_VALOR ?? 0).toFixed(2).replace('.', ',')} %</RowMeta>
                    </Td>
                    <Td numeric>
                      <Status tone={nivel === 5 ? 'alert' : nivel === 3 ? 'attention' : 'off'}>{dias}</Status>
                    </Td>
                    <Td>
                      {registro.DT_ULTIMO_CONTATO ? (
                        <>
                          {fmtDataHora(registro.DT_ULTIMO_CONTATO)}
                          <RowMeta>{registro.ULTIMO_CONTATO_POR}</RowMeta>
                        </>
                      ) : <Status tone="attention">Sem contato</Status>}
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <IconButton
                          label="Registrar contato com a indústria"
                          onClick={() => setContatando(registro)}
                          disabled={!podeContatar}
                        >
                          <PhoneCall aria-hidden />
                        </IconButton>
                        <IconButton
                          label="Enviar cobrança por e-mail"
                          onClick={() => setCobrando(registro)}
                          disabled={!podeContatar}
                        >
                          <Mail aria-hidden />
                        </IconButton>
                        <IconButton label="Abrir o pedido no quadro" onClick={() => navigate(`/quadro?card=${registro.ID_CARD}`)}>
                          <Eye aria-hidden />
                        </IconButton>
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={pagina}
          lastPage={lastPage}
          total={total}
          unit="pedidos"
          busy={carregando}
          onPrevious={() => { setCarregando(true); setPagina((p) => Math.max(1, p - 1)); }}
          onNext={() => { setCarregando(true); setPagina((p) => Math.min(lastPage, p + 1)); }}
        />
      </Panel>

      <DialogoContato
        aberto={contatando !== null}
        onOpenChange={(aberto) => !aberto && setContatando(null)}
        cardId={contatando?.ID_CARD ?? 0}
        aoRegistrar={async () => { setVersao((atual) => atual + 1); }}
      />
      {cobrando ? (
        <DialogoCobranca
          aberto
          onOpenChange={(aberto) => !aberto && setCobrando(null)}
          pedido={comoPedido(cobrando)}
          diasUteis={Number(cobrando.DIAS_UTEIS ?? 0)}
          aoEnviar={async () => { setVersao((atual) => atual + 1); }}
        />
      ) : null}
    </>
  );
}
