// Aba Alertas do pedido aberto (spec 003, RF-017 e RF-018).
//
// Todo alerta precisa ser LIDO antes de o pedido sair da Análise; item alertado
// que segue com quantidade precisa, além disso, de JUSTIFICATIVA. A justificativa
// vale para todos os alertas do mesmo produto (D-008: um UPDATE só).

import * as React from 'react';
import { CheckCheck, PencilLine } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, IconButton, LabelledField, Panel, PanelHeader, Status, Table, Td, Textarea, Th, Tr,
} from '@/components/page';
import { acao } from '@/lib/mitra-api';
import { fmtDataHora } from '@/lib/formato';
import { usePedido } from './pedido-contexto';
import { atualizarCapaDoQuadro, capaMudou } from './capa-do-quadro';

const ROTULO_TIPO: Record<string, string> = {
  vencimento: 'Lote a vencer',
  excesso: 'Excesso em outra filial',
};

const agora = () => new Date().toISOString().slice(0, 19);

export default function AbaAlertas(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const [erro, setErro] = React.useState('');
  const [salvando, setSalvando] = React.useState(false);
  const [justificando, setJustificando] = React.useState<{ codprod: number; texto: string } | null>(null);

  const bloqueado = ctx.travado || !pedido.podeEditar || salvando;
  const naoLidos = pedido.alertas.filter((alerta) => !alerta.lido).length;

  /**
   * Uma escrita, o recarregamento do pedido e — só quando a contagem muda — um
   * `kbCardAtualizar` para o cartão do quadro. `pendentesDepois` é calculado
   * aqui e não lido do estado recarregado: justificar não muda a contagem,
   * marcar como lido muda de forma previsível.
   */
  async function gravar(executar: () => Promise<void>, pendentesDepois: number) {
    setSalvando(true);
    setErro('');
    try {
      await executar();
      await pedido.recarregar(ctx.card.id);
      const espelho = { alertas_pendentes: String(pendentesDepois) };
      if (capaMudou(ctx.card, espelho)) {
        await atualizarCapaDoQuadro(ctx.card, espelho);
        await ctx.recarregar();
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar.');
    } finally {
      setSalvando(false);
    }
  }

  async function marcarLido(id: number) {
    const pendentes = pedido.alertas.filter((alerta) => !alerta.lido && alerta.id !== id).length;
    await gravar(async () => {
      await acao('sgcEscAlertaLer', { idCard: ctx.card.id, id, lidoEm: agora() });
    }, pendentes);
  }

  async function marcarTodosLidos() {
    await gravar(async () => {
      await acao('sgcEscAlertaLer', { idCard: ctx.card.id, id: 0, lidoEm: agora() });
    }, 0);
  }

  async function salvarJustificativa() {
    if (!justificando) return;
    const { codprod, texto } = justificando;
    setJustificando(null);
    await gravar(async () => {
      await acao('sgcEscAlertaJustificar', { idCard: ctx.card.id, codprod, justificativa: texto.trim() });
    }, naoLidos);
  }

  if (pedido.carregando) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando os alertas...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {pedido.erro ? <Alert tone="error">{pedido.erro}</Alert> : null}
      {erro ? <Alert tone="error">{erro}</Alert> : null}

      <Panel>
        <PanelHeader
          title="Alertas da análise"
          hint={naoLidos > 0
            ? `${naoLidos} ${naoLidos === 1 ? 'alerta ainda não lido' : 'alertas ainda não lidos'} — o pedido não sai da Análise assim.`
            : 'Todos os alertas foram lidos.'}
        >
          <Button variant="primary" size="sm" onClick={marcarTodosLidos} disabled={bloqueado || naoLidos === 0}>
            <CheckCheck aria-hidden />
            Marcar todos como lidos
          </Button>
        </PanelHeader>

        {pedido.alertas.length === 0 ? (
          <EmptyState
            title="Nenhum alerta neste pedido"
            hint="Os alertas nascem da análise: lote com validade próxima e estoque parado em outra filial. Salvar a lista de itens recalcula todos."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Alerta</Th>
                <Th>Leitura</Th>
                <Th>Justificativa</Th>
                <Th className="w-24 text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {pedido.alertas.map((alerta) => {
                const item = pedido.itens.find((linha) => linha.codprod === alerta.codprod);
                const exigeJustificativa = (item?.qtPedida ?? 0) > 0 && !alerta.justificativa.trim();
                return (
                  <Tr key={alerta.id}>
                    <Td>
                      <span className="font-semibold text-ink">{item?.descricao || `Produto ${alerta.codprod}`}</span>
                      <span className="block text-[12px] text-ink-secondary">
                        {ROTULO_TIPO[alerta.tipo] ?? alerta.tipo}
                      </span>
                    </Td>
                    <Td>{alerta.mensagem}</Td>
                    <Td>
                      {alerta.lido
                        ? <Status tone="live">Lido {alerta.lidoEm ? `em ${fmtDataHora(alerta.lidoEm)}` : ''}</Status>
                        : <Status tone="attention">Não lido</Status>}
                    </Td>
                    <Td>
                      {alerta.justificativa
                        ? alerta.justificativa
                        : <Status tone={exigeJustificativa ? 'alert' : 'off'}>
                          {exigeJustificativa ? 'Exigida: o item segue com quantidade' : 'Não exigida'}
                        </Status>}
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <IconButton
                          label="Marcar este alerta como lido"
                          onClick={() => void marcarLido(alerta.id)}
                          disabled={bloqueado || alerta.lido}
                        >
                          <CheckCheck aria-hidden />
                        </IconButton>
                        <IconButton
                          label="Justificar a compra mesmo com o alerta"
                          tone={exigeJustificativa ? 'attention' : 'neutral'}
                          onClick={() => setJustificando({ codprod: alerta.codprod, texto: alerta.justificativa })}
                          disabled={bloqueado}
                        >
                          <PencilLine aria-hidden />
                        </IconButton>
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <Dialog open={justificando !== null} onOpenChange={(aberto) => !aberto && setJustificando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justificar a compra mesmo com o alerta</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <LabelledField
              label="Por que comprar este produto mesmo assim?"
              hint="Vale para todos os alertas deste produto neste pedido."
            >
              <Textarea
                rows={4}
                value={justificando?.texto ?? ''}
                onChange={(evento) => setJustificando((atual) => (atual ? { ...atual, texto: evento.target.value } : atual))}
              />
            </LabelledField>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setJustificando(null)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void salvarJustificativa()}>Salvar justificativa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
