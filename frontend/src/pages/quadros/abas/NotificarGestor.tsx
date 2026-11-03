// "Notificar gestor" do legado (R-155, P-3, C-034 da 005; PW:11003-11116),
// dentro do acompanhamento do Trânsito: a partir de 5 dias úteis sem
// faturamento completo, quem opera a nota escolhe UM gestor, que recebe o
// aviso e entra nos responsáveis do card. A escalada automática do cron
// continua; isto é a mão do comprador, quando o cron ainda não bastou.
//
// Sob demanda: a lista de pessoas (`sgcPersonasListar`) só é lida quando o
// painel abre. Gravar = `sgcEscGestorNotificar` (guarda :VAR_USER, 5 dias
// úteis, alvo gestor, um por dia) → `kbCardAtualizar` só se o gestor ainda
// não é responsável → nota no histórico.
import * as React from 'react';
import { BellRing } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { Alert, Button, CartaoLinha, EmptyState, ListaCartoes, Status } from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import type { SessaoPersona } from '@/lib/persona';
import {
  gestoresDe, responsaveisComGestor, rotuloDiasUteis, textoNotificacaoGestor, type GestorDaLista,
} from '@/lib/acompanhamento';

const agora = () => new Date().toISOString().slice(0, 19);

type Props = ExtensaoContexto & {
  sessao: SessaoPersona;
  fornecedor: string;
  diasUteis: number;
  saldo: number;
};

export default function NotificarGestor({ sessao, fornecedor, diasUteis, saldo, ...ctx }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [gestores, setGestores] = React.useState<GestorDaLista[] | null>(null);
  const [escolhido, setEscolhido] = React.useState(0);
  const [ocupado, setOcupado] = React.useState(false);
  const [aviso, setAviso] = React.useState<{ tom: 'success' | 'error'; texto: string } | null>(null);
  const podeOperar = sessao.permissoes.operarNf;

  async function abrir() {
    setAberto(true);
    setAviso(null);
    if (gestores) return;
    try {
      setGestores(gestoresDe(await linhas('sgcPersonasListar', { busca: '', limite: 500, offset: 0 })));
    } catch (falha) {
      setGestores([]);
      setAviso({ tom: 'error', texto: falha instanceof Error ? falha.message : 'Não foi possível ler os gestores.' });
    }
  }

  async function confirmar() {
    const gestor = gestores?.find((g) => g.id === escolhido);
    if (!gestor) return;
    setOcupado(true);
    try {
      await acao('sgcEscGestorNotificar', {
        cardId: ctx.card.id, gestorId: gestor.id, criadoEm: agora(),
        texto: textoNotificacaoGestor({ fornecedor, diasUteis, saldo, quem: sessao.nome }),
      });
      const responsaveis = responsaveisComGestor(ctx.card.responsaveisIds ?? [], gestor.id);
      if (responsaveis.mudou) {
        await acao('kbCardAtualizar', {
          cardId: ctx.card.id, titulo: ctx.card.titulo, valoresJson: '{}',
          responsaveisIds: responsaveis.lista.join(','), prazo: ctx.card.prazo ?? '',
        });
      }
      await acao('kbNotaRegistrar', {
        cardId: ctx.card.id, usuarioId: 0,
        texto: `Gestor ${gestor.nome} notificado por ${sessao.nome}: pedido sem faturamento completo há ${rotuloDiasUteis(diasUteis)}.`,
      }).catch(() => null);
      await ctx.recarregar();
      setAberto(false);
      setEscolhido(0);
      setAviso({ tom: 'success', texto: `${gestor.nome} foi notificado e agora é responsável pelo pedido.` });
    } catch (falha) {
      setAviso({ tom: 'error', texto: falha instanceof Error ? falha.message : 'A notificação não foi gravada.' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="border-t border-rule-row">
      {aviso ? <div className="px-4 pt-3"><Alert tone={aviso.tom}>{aviso.texto}</Alert></div> : null}
      {!aberto ? (
        <div className="px-4 py-3">
          <Button
            size="sm"
            variant="danger"
            onClick={() => void abrir()}
            disabled={!podeOperar || ctx.travado}
            title={podeOperar ? undefined : 'Seu perfil não cobra o faturamento deste pedido.'}
          >
            <BellRing aria-hidden />
            Notificar gestor — {rotuloDiasUteis(diasUteis)} sem faturamento
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 py-3">
          <div className="flex items-center justify-between px-4">
            <p className="text-[13px] font-semibold text-ink">Escolha o gestor</p>
            <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
          </div>
          {gestores === null ? (
            <p className="px-4 text-[12px] text-ink-secondary">Carregando os gestores...</p>
          ) : gestores.length === 0 ? (
            <EmptyState title="Nenhum gestor cadastrado" hint="Atribua a persona gestor a alguém em Segurança." />
          ) : (
            <ListaCartoes rotulo="Gestores">
              {gestores.map((gestor) => (
                <CartaoLinha
                  key={gestor.id}
                  titulo={gestor.nome}
                  meta={gestor.email}
                  acoes={escolhido === gestor.id
                    ? <Status tone="live">Escolhido</Status>
                    : <Button size="sm" onClick={() => setEscolhido(gestor.id)}>Escolher</Button>}
                />
              ))}
            </ListaCartoes>
          )}
          <div className="flex justify-end px-4">
            <Button size="sm" variant="primary" onClick={() => void confirmar()} disabled={!escolhido || ocupado}>
              Confirmar notificação
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
