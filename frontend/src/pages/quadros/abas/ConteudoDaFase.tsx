// Conteúdo da aba "Nesta fase" do card (spec 015 da lib, R-050): o SGC 2 não
// tem uma aba por assunto — o card muda de assunto conforme a fase, como no
// SGC legado. Quem diz o que cada fase mostra é `lib/conteudo-da-fase.ts`
// (puro, testado); aqui só se desenha, na ordem, com os blocos das specs 003
// (Itens, Alertas), 005 (Notas fiscais), 006 (Recebimento), 007 (B.O.) e 008
// (Solicitações, só na Análise e antes de Itens — R-054) e, depois da
// Análise, os blocos do molde do legado (R-150): resumo, aprovação, envio,
// enviado, acompanhamento, conclusão e concluído.
// Cada bloco continua decidindo sozinho o que é editável (persona, fase,
// RESTRICTED), espelhando o servidor; a lib empilha os blocos com o mesmo
// espaçamento dos campos da fase.
import * as React from 'react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import type { SessaoPersona } from '@/lib/persona';
import { blocosDaFase, type Bloco } from '@/lib/conteudo-da-fase';
import type { MapaDeFases } from '@/pages/quadros/AcoesDoPedido';
import AbaItens from './Itens';
import AbaAlertas from './Alertas';
import AbaNotasFiscais from './NotasFiscais';
import AbaRecebimento from './Recebimento';
import AbaBo from './Bo';
import BlocoSolicitacoes from './Solicitacoes';
import ResumoDoPedido from './ResumoDoPedido';
import BlocoAprovacao from './Aprovacao';
import BlocoEnvio from './Envio';
import BlocoEnviado from './Enviado';
import BlocoAcompanhamento from './Acompanhamento';
import BlocoConclusao from './Conclusao';

type Props = ExtensaoContexto & {
  fases: MapaDeFases;
  sessao: SessaoPersona;
  /** A capa do `QuadroPage` (a que o `podeMover` lê) depois de o bloco Envio registrar o envio. */
  recarregarPedido: () => Promise<void>;
};

export default function ConteudoDaFase({ fases, sessao, recarregarPedido, ...ctx }: Props) {
  const blocos = blocosDaFase(fases.chaveDe(ctx.card.faseId));

  const desenhar = (bloco: Bloco): React.ReactNode => {
    switch (bloco) {
      case 'solicitacoes': return <BlocoSolicitacoes {...ctx} fases={fases} sessao={sessao} />;
      case 'itens': return <AbaItens {...ctx} />;
      case 'alertas': return <AbaAlertas {...ctx} />;
      case 'notas-fiscais': return <AbaNotasFiscais {...ctx} />;
      case 'recebimento': return <AbaRecebimento {...ctx} />;
      case 'bo': return <AbaBo {...ctx} fases={fases} sessao={sessao} />;
      // No Enviado o painel "Pedido enviado" já conta o envio: o selo sairia repetido.
      case 'resumo': return <ResumoDoPedido {...ctx} semEnvio={fases.chaveDe(ctx.card.faseId) === 'enviado'} />;
      case 'aprovacao': return <BlocoAprovacao {...ctx} />;
      case 'envio': return <BlocoEnvio {...ctx} sessao={sessao} recarregarPedido={recarregarPedido} />;
      case 'enviado': return <BlocoEnviado {...ctx} />;
      case 'acompanhamento': return <BlocoAcompanhamento {...ctx} />;
      case 'conclusao': return <BlocoConclusao {...ctx} />;
    }
  };

  return (
    <>
      {blocos.map((bloco) => <React.Fragment key={bloco}>{desenhar(bloco)}</React.Fragment>)}
    </>
  );
}
