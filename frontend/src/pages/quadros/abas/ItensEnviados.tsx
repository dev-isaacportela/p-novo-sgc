// Os itens que foram (ou vão) ao fornecedor, em cartões (R-141): Envio,
// Enviado e Trânsito do legado mostram a mesma tabela — produto, embalagem,
// quantidade, custo e total, com o rodapé dos totais (PW:10813-10886 e
// 11155-11212). Sem a marca "Comercial": é o que a indústria vê. Só leitura;
// lê os itens do `PedidoProvider`, sem execução nova.
import { CartaoLinha, ListaCartoes, MetaDot, RodapeTotal, Status } from '@/components/page';
import { moeda, numeroPt } from '@/lib/formato';
import { itensDoEnvio, totaisDoEnvio } from '@/lib/envio-industria';
import type { ItemPedido } from '@/lib/compras';

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Aprovado', enviado: 'Enviado', faturado: 'Faturado', bo: 'Em B.O.', concluido: 'Concluído',
};

export default function ItensEnviados({ itens, comStatus = false }: { itens: ItemPedido[]; comStatus?: boolean }) {
  const enviados = itensDoEnvio(itens);
  const totais = totaisDoEnvio(itens);
  return (
    <>
      <ListaCartoes rotulo="Itens do pedido">
        {enviados.map((item) => (
          <CartaoLinha
            key={item.codprod}
            titulo={item.descricao}
            meta={<>Código {item.codprod}{item.embalagem ? <> <MetaDot /> {item.embalagem}</> : null}</>}
            valor={moeda(item.qtPedida * item.precoCusto)}
            valorMeta={`${numeroPt(item.qtPedida)} × ${moeda(item.precoCusto)}`}
          >
            {comStatus ? <Status tone={item.status === 'enviado' ? 'live' : 'off'}>{ROTULO_STATUS[item.status] ?? item.status}</Status> : null}
          </CartaoLinha>
        ))}
      </ListaCartoes>
      <RodapeTotal rotulo={`${totais.produtos} ${totais.produtos === 1 ? 'produto' : 'produtos'} · ${numeroPt(totais.quantidade)} unidades`} valor={moeda(totais.valor)} />
    </>
  );
}
