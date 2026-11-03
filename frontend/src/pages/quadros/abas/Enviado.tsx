// Enviado para Indústria no card (R-141, C-049 da 002), no molde do legado
// (PipeWorkspace.tsx:10758-10905): o envio registrado (data, canal, contato,
// número do pedido, observação), o próximo movimento — Em Trânsito para BN só
// com nota vinculada — e os itens enviados, recolhidos.
//
// A contagem de notas é a do `sgcNfListar` que o bloco Notas fiscais já faz
// (`carga-do-card.ts`): nenhuma execução a mais.
import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { GradeMini, MiniCartao, Panel, PanelHeader, SecaoRecolhivel, Status } from '@/components/page';
import { fmtData, moeda } from '@/lib/formato';
import { proximoDoEnviado, totaisDoEnvio } from '@/lib/envio-industria';
import { usePedido } from './pedido-contexto';
import { useCarga } from './carga-do-card';
import ItensEnviados from './ItensEnviados';

export default function BlocoEnviado(ctx: ExtensaoContexto) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const nf = useCarga('sgcNfListar', ctx.card.id);
  const [itensAbertos, setItensAbertos] = React.useState(false);

  const capa = pedido.capa && pedido.capa.idCard === ctx.card.id ? pedido.capa : null;
  if (!capa) return null;

  const notas = Array.isArray(nf.dados?.nfs) ? nf.dados.nfs.length : 0;
  const proximo = proximoDoEnviado(notas);
  const totais = totaisDoEnvio(pedido.itens);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title="Pedido enviado"
          hint={capa.dtEnvio ? `Enviado em ${fmtData(capa.dtEnvio)}${capa.envioNome ? ` · registrado por ${capa.envioNome}` : ''}` : 'Data de envio não registrada'}
        />
        <div className="flex flex-col gap-3 p-4">
          <GradeMini colunas={3}>
            <MiniCartao rotulo="Método" valor={capa.canal === 'plataforma' ? 'Plataforma do fornecedor' : capa.canal ? 'E-mail' : '—'} />
            <MiniCartao rotulo={capa.canal === 'plataforma' ? 'Plataforma' : 'E-mail da indústria'} valor={capa.emailEnvio || '—'} title={capa.emailEnvio} />
            <MiniCartao rotulo="Pedido no ERP" valor={capa.numped || '—'} />
          </GradeMini>
          {capa.envioObs ? <p className="text-[12px] text-ink-secondary">Observação: {capa.envioObs}</p> : null}
        </div>
        {/* O próximo movimento (PW:10888-10905): o servidor é quem barra. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-rule-row px-4 py-3 text-[12px]">
          <ArrowRight className="size-3.5 text-ink-muted" aria-hidden />
          <span className="text-ink-secondary">Próximo movimento:</span>
          <span className="font-semibold text-ink">Em Trânsito para BN</span>
          <span className="ml-auto">
            {nf.dados ? <Status tone={proximo.liberado ? 'live' : 'attention'}>{proximo.texto}</Status> : null}
          </span>
        </div>
      </Panel>

      <SecaoRecolhivel
        titulo="Itens enviados"
        resumo={`${totais.produtos} ${totais.produtos === 1 ? 'produto' : 'produtos'} · ${moeda(totais.valor)}`}
        aberta={itensAbertos}
        onToggle={() => setItensAbertos((atual) => !atual)}
      >
        <div className="-m-4">
          <ItensEnviados itens={pedido.itens} />
        </div>
      </SecaoRecolhivel>
    </div>
  );
}
