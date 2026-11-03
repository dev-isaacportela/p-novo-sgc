// As decisões do card de empenho, acima do Excluir: enviar à técnica, aprovar e
// reprovar nas duas aprovações (a da diretoria congela e desmembra), registrar
// envio, previsão e recebimento do pedido, abrir pendência, reagrupar e
// cancelar o empenho. Botão sem permissão fica desabilitado com o motivo,
// nunca escondido. O servidor reconfere tudo (gancho e guarda de cada escrita).
import * as React from 'react';
import { useKanban, type ExtensaoContexto } from '@benenutri/mitra-kanban';

import { linhas } from '@/lib/mitra-api';
import { instanteIso } from '@/lib/pedido';
import {
  destinoAoAbrirPendencia, destinoDoReagrupamento, estadoDaCarga, FINAIS_EMPENHO, itemDeLinha, MENSAGENS_EMPENHO as M,
  motivoDeDestinoEmpenho, type ChaveEmpenho,
} from '@/lib/empenhos';
import { Button } from '@/components/page';
import { cargaDoCard, useEmpenho } from '@/pages/empenhos/contexto';
import { DialogoFormulario, type CampoDialogo } from '@/pages/empenhos/dialogos';
import { atualizarCapa, cancelarEmpenho, desmembrar, reagruparSePreciso, textoCmv, valorDaCapa } from '@/pages/empenhos/operacoes';

type Dialogo = 'reprovar' | 'cancelar' | 'envio' | 'previsao' | 'recebido' | 'pendencia' | null;

interface Acao { id: string; rotulo: string; motivo: string | null; perigo?: boolean; onClick: () => void }

export default function AcoesEmpenho({ ctx }: { ctx: ExtensaoContexto }) {
  const api = useKanban();
  const valor = useEmpenho();
  const { fases, sessao } = valor;
  const carga = cargaDoCard(valor, ctx.card.id);
  const [dialogo, setDialogo] = React.useState<Dialogo>(null);
  const [ocupado, setOcupado] = React.useState(false);

  const chave = fases.chaveDe(ctx.card.faseId);
  if (!chave || !carga?.ok || !carga.empenho) return null;
  const empenho = carga.empenho;
  const souCriador = Number(ctx.card.criadoPor ?? 0) === sessao.usuarioId;
  const estado = estadoDaCarga(carga, ctx.card.id, souCriador);
  const p = sessao.permissoes;
  const leitura = p.somenteLeitura ? M.leitura : null;
  const semPerfil = (pode: boolean) => (pode ? null : leitura ?? 'Seu perfil não faz esta ação no empenho.');
  const destinoMotivo = (destino: ChaveEmpenho) => motivoDeDestinoEmpenho(sessao.persona, sessao.acesso, chave, destino, estado);
  const ir = (destino: ChaveEmpenho) => ctx.mover(fases.faseIdDe(destino));

  async function executar(passo: () => Promise<void>, ok?: string) {
    setOcupado(true);
    try {
      await passo();
      if (ok) ctx.avisar('success', ok);
    } catch (erro) {
      ctx.avisar('error', erro instanceof Error ? erro.message : 'Não foi possível concluir.');
      throw erro;
    } finally {
      await valor.recarregar();
      await ctx.recarregar();
      setOcupado(false);
    }
  }
  const clicar = (passo: () => Promise<void>, ok?: string) => () => void executar(passo, ok).catch(() => undefined);

  async function aprovarDiretoria() {
    await linhas('sgcEscEmpAprovarDiretoria', { cardId: ctx.card.id, agora: instanteIso() });
    await atualizarCapa(api, ctx.card.id, { valores: { valor_contrato: valorDaCapa(Number(empenho.VL_TOTAL) || 0), cmv: textoCmv(empenho.CMV_PERC === null ? null : Number(empenho.CMV_PERC)) } });
    const total = await desmembrar(api, ctx.card, carga!, fases, sessao.usuarioId);
    // C-022: nada a comprar nem transferir — o empenho conclui sem pedido.
    if (total === 0) ctx.avisar('success', 'Não há pedido a gerar: todos os itens saem do estoque.');
    await ir(total === 0 ? 'emp_concluido' : 'emp_pedidos');
  }

  const acoes: Acao[] = [];
  const papel = estado.papel;
  const naoFinal = !(FINAIS_EMPENHO as readonly string[]).includes(chave);

  if (papel === 'EMPENHO') {
    if (chave === 'emp_analise') {
      acoes.push({ id: 'tecnica', rotulo: 'Enviar à Aprovação Técnica', motivo: destinoMotivo('emp_tecnica'), onClick: clicar(() => ir('emp_tecnica')) });
    }
    if (chave === 'emp_tecnica') {
      acoes.push(
        { id: 'aprovar', rotulo: 'Aprovar tecnicamente', motivo: semPerfil(p.aprovarTecnica), onClick: clicar(async () => {
          await linhas('sgcEscEmpAprovarTecnica', { cardId: ctx.card.id, agora: instanteIso() });
          await ir('emp_diretoria');
        }) },
        { id: 'reprovar', rotulo: 'Reprovar', motivo: semPerfil(p.aprovarTecnica), onClick: () => setDialogo('reprovar') },
      );
    }
    if (chave === 'emp_diretoria') {
      acoes.push(
        { id: 'aprovar', rotulo: 'Aprovar e desmembrar', motivo: semPerfil(p.aprovarDiretoria), onClick: clicar(aprovarDiretoria) },
        { id: 'reprovar', rotulo: 'Reprovar', motivo: semPerfil(p.aprovarDiretoria), onClick: () => setDialogo('reprovar') },
      );
    }
    if (chave === 'emp_pedidos') {
      const destino = destinoDoReagrupamento((carga.pedidos ?? []).map((pd) => String(pd.FASE)));
      acoes.push({ id: 'reagrupar', rotulo: 'Reagrupar o empenho', motivo: destino ? destinoMotivo(destino) : M.reagrupar,
        onClick: clicar(() => ir(destino ?? 'emp_concluido')) });
    }
  } else if (papel === 'FORNECEDOR' || papel === 'TRANSFERENCIA') {
    const operar = semPerfil(p.operarEmpenhos);
    if (chave === 'emp_envio') acoes.push({ id: 'envio', rotulo: 'Registrar envio à indústria', motivo: operar, onClick: () => setDialogo('envio') });
    if (chave === 'emp_aguardando') acoes.push({ id: 'previsao', rotulo: 'Informar previsão de chegada', motivo: operar, onClick: () => setDialogo('previsao') });
    if (chave === 'emp_transito') acoes.push({ id: 'recebido', rotulo: 'Marcar recebido na BN', motivo: operar, onClick: () => setDialogo('recebido') });
    if (['emp_envio', 'emp_aguardando', 'emp_transito', 'emp_pendencia'].includes(chave) && papel === 'FORNECEDOR') {
      acoes.push({ id: 'pendencia', rotulo: 'Abrir pendência', motivo: operar, onClick: () => setDialogo('pendencia') });
    }
  }
  if (naoFinal && papel) {
    const pode = p.operarEmpenhos || (p.aprovarDiretoria && chave === 'emp_diretoria');
    acoes.push({ id: 'cancelar', rotulo: 'Cancelar empenho', perigo: true, motivo: semPerfil(pode) ?? (sessao.persona === 'diretoria' && chave !== 'emp_diretoria' ? M.diretoria : null),
      onClick: () => setDialogo('cancelar') });
  }
  if (!acoes.length) return null;

  const fechar = () => setDialogo(null);
  const itensDoPedido = (carga.itens ?? []).map(itemDeLinha).filter((i) => (papel === 'TRANSFERENCIA' ? i.qtTransferencia > 0 : i.qtCompra > 0 && i.codfornec === Number(carga.pedido?.CODFORNEC)));
  const reprovarFase = chave === 'emp_diretoria' ? 'diretoria' : 'tecnica';

  const dialogos: Record<Exclude<Dialogo, null>, { titulo: string; descricao: string; campos: CampoDialogo[]; confirmar: string; perigo?: boolean; gravar: (v: Record<string, string>) => Promise<void> }> = {
    reprovar: {
      titulo: 'Reprovar o empenho', confirmar: 'Reprovar e devolver',
      descricao: 'O empenho volta à Análise com o motivo no histórico; as aprovações já dadas são apagadas.',
      campos: [{ chave: 'motivo', tipo: 'texto', rotulo: 'Motivo da reprovação', minimo: true, longo: true }],
      gravar: async ({ motivo }) => {
        await linhas('sgcEscEmpReprovar', { cardId: ctx.card.id, fase: reprovarFase, motivo, agora: instanteIso() });
        await ir('emp_analise');
      },
    },
    cancelar: {
      titulo: 'Cancelar empenho', confirmar: 'Cancelar empenho', perigo: true,
      descricao: 'O empenho e todos os pedidos abertos dele vão para Empenhos Cancelados com o motivo. Não existe cancelar uma indústria só.',
      campos: [{ chave: 'motivo', tipo: 'texto', rotulo: 'Motivo do cancelamento', minimo: true, longo: true }],
      gravar: ({ motivo }) => cancelarEmpenho(api, ctx.card.id, carga, fases, motivo),
    },
    envio: {
      titulo: 'Registrar envio à indústria', confirmar: 'Registrar e mover',
      descricao: 'O número e a data do pedido à indústria levam o card para Aguardando Indústria.',
      campos: [{ chave: 'numPedido', tipo: 'texto', rotulo: 'Número do pedido' }, { chave: 'dtPedido', tipo: 'data', rotulo: 'Data do envio' }],
      gravar: async (v) => {
        await linhas('sgcEscEmpPedidoEnvio', { cardId: ctx.card.id, numPedido: v.numPedido, dtPedido: v.dtPedido });
        await ir('emp_aguardando');
      },
    },
    previsao: {
      titulo: 'Previsão de chegada', confirmar: 'Registrar e mover',
      descricao: 'Com a previsão, o card vai para Em Trânsito para BN.',
      campos: [{ chave: 'dtPrevisao', tipo: 'data', rotulo: 'Previsão de chegada' }],
      gravar: async (v) => {
        await linhas('sgcEscEmpPedidoPrevisao', { cardId: ctx.card.id, dtPrevisao: v.dtPrevisao });
        await ir('emp_transito');
      },
    },
    recebido: {
      titulo: 'Recebido na BN', confirmar: 'Registrar e concluir',
      descricao: 'Grava a data do recebimento e conclui o pedido; o último pedido a terminar reagrupa o empenho.',
      campos: [{ chave: 'dtRecebido', tipo: 'data', rotulo: 'Data do recebimento' }],
      gravar: async (v) => {
        await linhas('sgcEscEmpPedidoRecebido', { cardId: ctx.card.id, dtRecebido: v.dtRecebido });
        await ir('emp_concluido');
        const destino = await reagruparSePreciso(api, ctx.card.id, fases);
        if (destino) ctx.avisar('success', 'Era o último pedido: o empenho voltou a ser um só.');
      },
    },
    pendencia: {
      titulo: 'Abrir pendência', confirmar: 'Abrir pendência',
      descricao: 'A pendência segura o card: ele vai para Pedidos com Pendência e só avança quando ela for fechada.',
      campos: [
        { chave: 'codprod', tipo: 'escolha', rotulo: 'Produto', opcoes: itensDoPedido.map((i) => ({ value: String(i.codprod), label: `${i.codprod} — ${i.descricao}` })) },
        { chave: 'tipo', tipo: 'escolha', rotulo: 'Tipo', opcoes: [{ value: 'BO', label: 'Falta na indústria' }, { value: 'VENDA', label: 'Venda pendente' }] },
        { chave: 'descricao', tipo: 'texto', rotulo: 'Descrição', minimo: true, longo: true },
        { chave: 'previsao', tipo: 'data', rotulo: 'Previsão de solução', opcional: true },
      ],
      gravar: async (v) => {
        await linhas('sgcEscEmpPendenciaAbrir', { cardId: ctx.card.id, codprod: Number(v.codprod) || 0, tipo: v.tipo, descricao: v.descricao, previsao: v.previsao, agora: instanteIso() });
        const destino = destinoAoAbrirPendencia(chave);
        if (destino) await ir(destino);
      },
    },
  };
  const aberto = dialogo ? dialogos[dialogo] : null;

  return (
    <div className="flex flex-col gap-2">
      {acoes.map((item) => (
        <Button
          key={item.id}
          variant={item.perigo ? 'danger' : item.id === 'aprovar' ? 'primary' : 'secondary'}
          disabled={item.motivo !== null || ocupado || ctx.travado}
          title={item.motivo ?? item.rotulo}
          onClick={item.onClick}
        >
          {item.rotulo}
        </Button>
      ))}
      {aberto ? (
        <DialogoFormulario
          aberto
          onFechar={fechar}
          titulo={aberto.titulo}
          descricao={aberto.descricao}
          campos={aberto.campos}
          rotuloConfirmar={aberto.confirmar}
          perigo={aberto.perigo}
          onConfirmar={(v) => executar(() => aberto.gravar(v))}
        />
      ) : null}
    </div>
  );
}
