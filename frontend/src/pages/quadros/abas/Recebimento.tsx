// Aba Recebimento do pedido aberto (spec 006, RF-005/RF-006/RF-015).
//
// Uma consulta por abertura (RNF-001): `sgcNfsRecebimentoCard` traz as notas
// já com previsão, situação e dias de atraso — a tela não calcula data
// nenhuma (D-003). Trocar de aba não recarrega; a aba só consulta quando é
// aberta (D-011), porque nota só interessa da fase Enviado em diante.
//
// Sem `contagem` na AbaExtra (R-049): ela é síncrona e lê só `card.valores`, e
// não existe campo do quadro para "notas pendentes". O resumo "2 de 3
// recebidas" aparece DENTRO da aba, onde a consulta já rodou.

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Button, Code, Dash, EmptyState, MetaDot, Panel, PanelHeader, Stat,
  Status, Table, Td, Th, Tr, RowMeta, RowTitle,
} from '@/components/page';
import { linhas, acao } from '@/lib/mitra-api';
import { fmtData, hojeIso, moeda } from '@/lib/formato';
import { rotuloPrazoEntrega } from '@/lib/fornecedor';
import {
  notaDeLinha, resumoRecebimento, rotuloAtraso, rotuloSituacao, tomSituacao,
  type NotaRecebimento,
} from '@/lib/recebimento';
import { usePersona } from '@/lib/persona';
import { usePedido } from './pedido-contexto';

function textoDoResumo(resumo: ReturnType<typeof resumoRecebimento>): string {
  if (resumo.total === 0) return 'Nenhuma nota fiscal vinculada a este pedido ainda.';
  if (resumo.completo) return `${resumo.total} de ${resumo.total} notas recebidas — o pedido segue para o faturamento.`;
  const base = `${resumo.recebidas} de ${resumo.total} ${resumo.total === 1 ? 'nota recebida' : 'notas recebidas'}`;
  if (resumo.atrasadas > 0) {
    return `${base} · ${resumo.atrasadas} ${resumo.atrasadas === 1 ? 'nota em atraso' : 'notas em atraso'}.`;
  }
  return `${base}.`;
}

export default function AbaRecebimento(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const sessao = usePersona();
  const [notas, setNotas] = React.useState<NotaRecebimento[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const [sincronizando, setSincronizando] = React.useState(false);
  const [confirmacao, setConfirmacao] = React.useState('');

  const [recarga, setRecarga] = React.useState(0);
  const cardId = ctx.card.id;

  React.useEffect(() => {
    let vivo = true;
    linhas('sgcNfsRecebimentoCard', { cardId, hoje: hojeIso() })
      .then((rows) => {
        if (!vivo) return;
        setNotas(rows.map(notaDeLinha));
        setErro('');
      })
      .catch((falha: unknown) => {
        if (vivo) setErro(falha instanceof Error ? falha.message : 'Não foi possível ler as notas deste pedido.');
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [cardId, recarga]);

  const resumo = resumoRecebimento(notas);
  // R-028/R-038: `operarNf` governa "Verificar entrada"; RESTRICTED só opera os
  // pedidos que criou — o mesmo `podeEditar` que o servidor confere (A2).
  const podeOperar = Boolean(sessao?.permissoes.operarNf) && pedido.podeEditar;
  const bloqueado = ctx.travado || sincronizando || !podeOperar;
  const motivoBloqueio = podeOperar
    ? undefined
    : 'Seu perfil não verifica o recebimento das notas deste pedido.';

  async function verificarEntrada() {
    setSincronizando(true);
    setErro('');
    setConfirmacao('');
    const faseAntes = ctx.card.faseId;
    try {
      const resposta = await acao('sgcRecebimentoSincronizar', { cardId });
      if (resposta.ok !== true) {
        setErro(String(resposta.error || 'A verificação não foi concluída.'));
        return;
      }
      const atualizadas = Number(resposta.recebidas) || 0;
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setConfirmacao(atualizadas === 0
        ? `Verificado às ${hora} — nenhuma nota nova deu entrada no WinThor.`
        : `Verificado às ${hora} — ${atualizadas} ${atualizadas === 1 ? 'nota atualizada' : 'notas atualizadas'}.`);
      setCarregando(true);
      setRecarga((atual) => atual + 1);
      // O movimento é do servidor; a tela só reflete quando ele aconteceu.
      if (Number(resposta.movidos) > 0 || faseAntes !== ctx.card.faseId) await ctx.recarregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível falar com o WinThor.');
    } finally {
      setSincronizando(false);
    }
  }

  if (carregando) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando as notas do pedido...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <Panel>
        <PanelHeader title="Recebimento das notas" hint={textoDoResumo(resumo)}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void verificarEntrada()}
            disabled={bloqueado}
            title={motivoBloqueio}
          >
            <RefreshCw aria-hidden />
            Verificar entrada no WinThor
          </Button>
        </PanelHeader>

        {confirmacao ? (
          <p className="border-b border-rule-row px-4 py-2 text-[12px] text-ink-secondary" aria-live="polite">
            {confirmacao}
          </p>
        ) : null}

        {notas.length === 0 ? (
          <EmptyState
            title="Nenhuma nota fiscal vinculada"
            hint="As notas chegam pela aba Notas fiscais, por detecção automática no WinThor ou pelo registro do número. A previsão de recebimento aparece aqui assim que a primeira for vinculada."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nota</Th>
                <Th>Faturamento</Th>
                <Th>Prazo</Th>
                <Th>Previsão</Th>
                <Th>Recebimento</Th>
                <Th>Situação</Th>
                <Th numeric>Valor</Th>
              </tr>
            </thead>
            <tbody>
              {notas.map((nota) => {
                const prazo = rotuloPrazoEntrega(nota.prazoDias, nota.prazoTipo);
                const atraso = rotuloAtraso(nota);
                return (
                  <Tr key={nota.id}>
                    <Td>
                      <RowTitle>
                        <Code>NF {nota.numnota}</Code>
                      </RowTitle>
                      <RowMeta>
                        {nota.serie ? `Série ${nota.serie}` : 'Sem série'}
                        {nota.codfilial ? <> <MetaDot /> Filial {nota.codfilial}</> : null}
                      </RowMeta>
                    </Td>
                    <Td>{nota.dtEmissao ? fmtData(nota.dtEmissao) : <Dash />}</Td>
                    <Td>{prazo || <Dash />}</Td>
                    <Td>{nota.dtPrevisao ? fmtData(nota.dtPrevisao) : <Dash />}</Td>
                    <Td>{nota.dtRecebimento ? fmtData(nota.dtRecebimento) : <Dash />}</Td>
                    <Td>
                      <Status tone={tomSituacao(nota.situacao)}>{rotuloSituacao(nota.situacao)}</Status>
                      {atraso ? <RowMeta>{atraso}</RowMeta> : null}
                    </Td>
                    <Td numeric>{nota.vlTotal ? moeda(nota.vlTotal) : <Dash />}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {notas.length > 0 ? (
          <p className="border-t border-rule-row px-4 py-3 text-[12px] text-ink-secondary">
            <Stat>{resumo.recebidas}</Stat> recebidas
            <MetaDot />
            <Stat>{resumo.pendentes}</Stat> pendentes
            {resumo.semPrazo > 0 ? (
              <>
                <MetaDot />
                <Stat>{resumo.semPrazo}</Stat> sem prazo parametrizado
              </>
            ) : null}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
