// As sete decisões do pedido, na coluna "Mover para" do card aberto
// (`acoesExtras` da spec 013 da lib), acima do Excluir.
//
// RF-032 / §8 do design: botão sem permissão fica DESABILITADO com o motivo no
// `title` — nunca some da tela (C-040).
//
// A ordem de cada decisão é sempre a mesma: escrita guardada por `:VAR_USER`
// → situação dos itens quando é o caso (F-07) → nota no histórico → movimento.
// A escrita vem ANTES do movimento porque é ela que satisfaz a condição que o
// gancho `sgcPodeMover` vai conferir (motivo do cancelamento, da reprovação).
import * as React from 'react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { instanteIso, marcarItensDaFase, type PedidoCapa } from '@/lib/pedido';
import { COPIA_COMPRAS } from '@/lib/quadro';
import type { ChaveFase } from '@/lib/transicoes';
import type { SessaoPersona } from '@/lib/persona';
import { Button, Alert } from '@/components/page';
import DialogoMotivo from '@/pages/quadros/DialogoMotivo';
import DialogoEnvio, { type DadosDoEnvio } from '@/pages/quadros/DialogoEnvio';
// spec 010 (R-060/R-077): única feature desta onda que edita este arquivo —
// os dois botões de extrato, em qualquer fase, com wrapper de execução
// próprio (D-006: não chama recarregarPedido(), o extrato não muda o pedido).
import { montarExtrato, linhasCsvExtrato, popupFoiBloqueado } from '@/lib/extrato';
import { extratoHtml } from '@/pages/quadros/extrato-html';
import { textoCsv, baixarCsv } from '@/lib/csv';

export interface MapaDeFases {
  chaveDe: (faseId: number) => ChaveFase | null;
  faseIdDe: (chave: ChaveFase) => number;
}

export interface AcoesDoPedidoProps {
  ctx: ExtensaoContexto;
  sessao: SessaoPersona;
  pedido: PedidoCapa | null;
  fases: MapaDeFases;
  recarregarPedido: () => Promise<void>;
}

type Dialogo = 'nenhum' | 'reprovarTecnica' | 'reprovarDiretoria' | 'cancelar' | 'envio';

const FINAIS: readonly ChaveFase[] = ['concluido', 'cancelado'];

export default function AcoesDoPedido({ ctx, sessao, pedido, fases, recarregarPedido }: AcoesDoPedidoProps) {
  const [dialogo, setDialogo] = React.useState<Dialogo>('nenhum');
  const [ocupado, setOcupado] = React.useState(false);
  const [avisoPopup, setAvisoPopup] = React.useState(false);
  const fechar = () => setDialogo('nenhum');

  const chave = fases.chaveDe(ctx.card.faseId);
  const permissoes = sessao.permissoes;

  /** Registra a decisão no histórico do pedido (RF-031, `kbNotaRegistrar` da lib). */
  const nota = (texto: string) => acao('kbNotaRegistrar', { cardId: ctx.card.id, texto, usuarioId: 0 }).catch(() => null);

  /** Toda decisão passa por aqui: trava a coluna, avisa o erro na faixa do card. */
  async function executar(passos: () => Promise<void>) {
    setOcupado(true);
    try {
      await passos();
      await recarregarPedido();
    } catch (erro) {
      ctx.avisar('error', erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.');
    } finally {
      setOcupado(false);
    }
  }

  const mover = (destino: ChaveFase) => ctx.mover(fases.faseIdDe(destino));

  async function aprovarTecnica() {
    await linhas('sgcEscPedidoTecnicaAprovar', { cardId: ctx.card.id, agora: instanteIso() });
    await nota(`Aprovado tecnicamente por ${sessao.nome}`);
    await mover('diretoria');
  }

  async function reprovarTecnica({ motivo, produtos }: { motivo: string; produtos: string }) {
    await linhas('sgcEscPedidoTecnicaReprovar', { cardId: ctx.card.id, motivo, produtos, agora: instanteIso() });
    await nota(`Reprovado tecnicamente por ${sessao.nome}: ${motivo}`);
    await mover('analise');
  }

  async function aprovarDiretoria() {
    await linhas('sgcEscPedidoDiretoriaAprovar', { cardId: ctx.card.id, agora: instanteIso() });
    // F-07 / C-03: a situação dos itens é gravada pela tela, porque a escrita
    // da 003 é guardada por `:VAR_USER`.
    await marcarItensDaFase(ctx.card.id, 'aprovado');
    await nota(`Aprovado pela diretoria por ${sessao.nome}`);
    await mover('envio');
  }

  async function reprovarDiretoria({ motivo }: { motivo: string }) {
    await linhas('sgcEscPedidoDiretoriaReprovar', { cardId: ctx.card.id, motivo, agora: instanteIso() });
    await nota(`Reprovado pela diretoria por ${sessao.nome}: ${motivo}`);
    await mover('analise');
  }

  async function cancelar({ motivo }: { motivo: string }) {
    await linhas('sgcEscPedidoCancelar', { cardId: ctx.card.id, motivo, agora: instanteIso() });
    // D-004: o campo do quadro é espelho de mão única (pedido → quadro), para a
    // capa de Canceladas não custar uma consulta por cartão (CA-04).
    await acao('kbCardAtualizar', {
      cardId: ctx.card.id,
      titulo: ctx.card.titulo,
      responsaveisIds: (ctx.card.responsaveisIds ?? []).join(','),
      prazo: ctx.card.prazo ?? '',
      valoresJson: JSON.stringify({ motivo_cancelamento: motivo }),
    });
    await nota(`Compra cancelada por ${sessao.nome}: ${motivo}`);
    await mover('cancelado');
  }

  async function registrarEnvio(dados: DadosDoEnvio) {
    // D-016: o texto do pedido é montado aqui, onde os dados já estão — o JS do
    // servidor só envia, grava e registra.
    const assunto = `Pedido de compra ${dados.numped} — ${pedido?.FILIAL ?? ''}`;
    const corpo = [
      `<p>Segue o pedido de compra <strong>${dados.numped}</strong>.</p>`,
      `<p>Fornecedor: ${pedido?.FORNECEDOR ?? ''}<br>Filial: ${pedido?.FILIAL ?? ''}<br>`,
      `Período de vendas analisado: ${pedido?.PERIODO_INICIO ?? ''} a ${pedido?.PERIODO_FIM ?? ''}</p>`,
      dados.obs ? `<p>${dados.obs}</p>` : '',
      `<p>Cópia para ${COPIA_COMPRAS}.</p>`,
    ].join('');

    const resposta = await acao('sgcEnvioIndustriaRegistrar', {
      cardId: ctx.card.id, canal: dados.canal, para: dados.contato, assunto, corpo,
      dtEnvio: dados.data, numped: dados.numped, obs: dados.obs,
    });
    if (!resposta?.ok) throw new Error(String(resposta?.error ?? 'O envio não foi registrado.'));
    await marcarItensDaFase(ctx.card.id, 'enviado');
    await ctx.recarregar();
    ctx.avisar('success', 'Envio registrado no pedido.');
  }

  /**
   * Busca os dados de novo, direto do servidor (D-004: a prop `pedido` pode
   * estar `null` ou desatualizada) — `sgcPedidoCarregar` + `sgcNfListar` em
   * paralelo, R-077, sempre relidas a cada clique.
   */
  async function dadosDoExtrato() {
    const [capa, nf] = await Promise.all([
      acao('sgcPedidoCarregar', { cardId: ctx.card.id }),
      acao('sgcNfListar', { cardId: ctx.card.id }),
    ]);
    if (!capa?.ok || !capa?.pedido) throw new Error('Não foi possível carregar os dados do pedido.');
    return montarExtrato(capa.pedido, capa.itens ?? [], chave as ChaveFase, nf?.nfs ?? []);
  }

  /** D-006: wrapper próprio — trava o botão, mostra erro, mas NÃO chama `recarregarPedido()`: gerar o extrato não muda o pedido. */
  async function extratoPdf() {
    setAvisoPopup(false);
    // D-005: a janela abre DENTRO do clique, antes do `await` — só assim o
    // navegador trata `window.open` como ação direta da pessoa.
    const janela = window.open('', '_blank');
    if (popupFoiBloqueado(janela) || !janela) {
      setAvisoPopup(true);
      return;
    }
    janela.document.write('<p style="font-family:sans-serif;padding:2rem;">Gerando o extrato…</p>');
    setOcupado(true);
    try {
      const modelo = await dadosDoExtrato();
      janela.document.open();
      janela.document.write(extratoHtml(modelo));
      janela.document.close();
    } catch (erro) {
      janela.close();
      ctx.avisar('error', erro instanceof Error ? erro.message : 'Não foi possível gerar o extrato.');
    } finally {
      setOcupado(false);
    }
  }

  async function extratoCsv() {
    setOcupado(true);
    try {
      const modelo = await dadosDoExtrato();
      const { cabecalho, linhas: linhasCsv } = linhasCsvExtrato(modelo);
      baixarCsv(`${modelo.nomeArquivo}.csv`, textoCsv(cabecalho, linhasCsv));
    } catch (erro) {
      ctx.avisar('error', erro instanceof Error ? erro.message : 'Não foi possível gerar o extrato.');
    } finally {
      setOcupado(false);
    }
  }

  if (!chave) return null;

  const motivoSemPermissao = permissoes.somenteLeitura
    ? 'Seu acesso é somente leitura.'
    : 'Seu perfil não faz esta ação no pedido.';
  const naoFinal = !FINAIS.includes(chave);

  const acoes: { id: string; rotulo: string; permitido: boolean; onClick: () => void }[] = [];
  // RF-001/C-017 (010): em QUALQUER fase, para toda persona com `verQuadro` —
  // inclusive Compras Concluídas e Compras Canceladas, onde hoje mais nenhuma
  // ação aparece.
  acoes.push(
    { id: 'extrato-pdf', rotulo: 'Extrato (PDF)', permitido: permissoes.verQuadro, onClick: extratoPdf },
    { id: 'extrato-csv', rotulo: 'Extrato (CSV)', permitido: permissoes.verQuadro, onClick: extratoCsv },
  );
  if (chave === 'tecnica') {
    acoes.push(
      { id: 'aprovar-tecnica', rotulo: 'Aprovar tecnicamente', permitido: permissoes.aprovarTecnica, onClick: () => executar(aprovarTecnica) },
      { id: 'reprovar-tecnica', rotulo: 'Reprovar', permitido: permissoes.aprovarTecnica, onClick: () => setDialogo('reprovarTecnica') },
    );
  }
  if (chave === 'diretoria') {
    acoes.push(
      { id: 'aprovar-diretoria', rotulo: 'Aprovar', permitido: permissoes.aprovarDiretoria, onClick: () => executar(aprovarDiretoria) },
      { id: 'reprovar-diretoria', rotulo: 'Reprovar', permitido: permissoes.aprovarDiretoria, onClick: () => setDialogo('reprovarDiretoria') },
      {
        id: 'devolver-tecnica',
        rotulo: 'Devolver à Aprovação Técnica',
        permitido: permissoes.aprovarDiretoria,
        onClick: () => executar(async () => { await mover('tecnica'); }),
      },
    );
  }
  if (chave === 'envio') {
    acoes.push({ id: 'registrar-envio', rotulo: 'Registrar envio', permitido: permissoes.registrarEnvio, onClick: () => setDialogo('envio') });
  }
  if (naoFinal) {
    acoes.push({ id: 'cancelar', rotulo: 'Cancelar compra', permitido: permissoes.cancelar, onClick: () => setDialogo('cancelar') });
  }

  if (!acoes.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {acoes.map((item) => (
        <Button
          key={item.id}
          variant={item.id === 'cancelar' ? 'danger' : 'secondary'}
          disabled={!item.permitido || ocupado || ctx.travado}
          title={item.permitido ? item.rotulo : motivoSemPermissao}
          onClick={item.onClick}
        >
          {item.rotulo}
        </Button>
      ))}

      {avisoPopup ? (
        <Alert tone="warn">
          O navegador bloqueou a janela do extrato. Permita pop-ups para este site e tente novamente.
        </Alert>
      ) : null}

      <DialogoMotivo
        aberto={dialogo === 'reprovarTecnica'}
        onFechar={fechar}
        titulo="Reprovar tecnicamente"
        descricao="O pedido volta para a Análise/Montagem com o motivo e os produtos reprovados visíveis para quem montou."
        rotulo="Motivo da reprovação"
        rotuloConfirmar="Reprovar e devolver"
        comProdutos
        onConfirmar={(dados) => executar(() => reprovarTecnica(dados))}
      />
      <DialogoMotivo
        aberto={dialogo === 'reprovarDiretoria'}
        onFechar={fechar}
        titulo="Reprovar na diretoria"
        descricao="O motivo da diretoria fica guardado separado do motivo da gerência, e o pedido volta para a Análise/Montagem."
        rotulo="Motivo da reprovação"
        rotuloConfirmar="Reprovar e devolver"
        onConfirmar={(dados) => executar(() => reprovarDiretoria(dados))}
      />
      <DialogoMotivo
        aberto={dialogo === 'cancelar'}
        onFechar={fechar}
        titulo="Cancelar compra"
        descricao="O pedido vai para Compras Canceladas e o motivo aparece no cartão do quadro. Não existe cancelamento sem motivo."
        rotulo="Motivo do cancelamento"
        rotuloConfirmar="Cancelar compra"
        onConfirmar={(dados) => executar(() => cancelar(dados))}
      />
      <DialogoEnvio
        aberto={dialogo === 'envio'}
        onFechar={fechar}
        pedido={pedido}
        onConfirmar={(dados) => executar(() => registrarEnvio(dados))}
      />
    </div>
  );
}
