// Conteúdo da aba "Nesta fase" do card (spec 015 da lib, R-050): o SGC 2 não
// tem uma aba por assunto — o card muda de assunto conforme a fase, como no
// SGC legado. Quem diz o que cada fase mostra é `lib/conteudo-da-fase.ts`
// (puro, testado); aqui só se desenha, na ordem, com os blocos das specs 003
// (Itens, Alertas), 005 (Notas fiscais), 006 (Recebimento), 007 (B.O.) e 008
// (Solicitações, só na Análise e antes de Itens — R-054).
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

type Props = ExtensaoContexto & { fases: MapaDeFases; sessao: SessaoPersona };

export default function ConteudoDaFase({ fases, sessao, ...ctx }: Props) {
  const blocos = blocosDaFase(fases.chaveDe(ctx.card.faseId));

  const desenhar = (bloco: Bloco): React.ReactNode => {
    switch (bloco) {
      case 'solicitacoes': return <BlocoSolicitacoes {...ctx} fases={fases} sessao={sessao} />;
      case 'itens': return <AbaItens {...ctx} />;
      case 'alertas': return <AbaAlertas {...ctx} />;
      case 'notas-fiscais': return <AbaNotasFiscais {...ctx} />;
      case 'recebimento': return <AbaRecebimento {...ctx} />;
      case 'bo': return <AbaBo {...ctx} fases={fases} sessao={sessao} />;
    }
  };

  return (
    <>
      {blocos.map((bloco) => <React.Fragment key={bloco}>{desenhar(bloco)}</React.Fragment>)}
    </>
  );
}
