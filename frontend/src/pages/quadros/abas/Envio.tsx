// Envio para Indústria no card (R-150, C-048 da 002), no molde do
// `EnvioIndustriaPanel` do legado: o resumo do que vai ao fornecedor com
// "Copiar itens" e "Arquivo WinThor", os itens em cartões e, no fim, o mesmo
// "Registrar envio" da coluna da direita (`registrar-envio.ts`).
//
// O arquivo é o formato do SGC 2 (`textoImportacaoWinthor`, RN-023 da 011),
// não o do legado. Sem execução nova: itens e capa vêm do `PedidoProvider`;
// os contatos do fornecedor, só quando o diálogo abre (o mesmo de antes).
import * as React from 'react';
import { ClipboardCopy, FileDown, Send } from 'lucide-react';
import type { ExtensaoContexto } from '@benenutri/mitra-kanban';
import { Alert, Button, GradeMini, MiniCartao, Panel, PanelHeader } from '@/components/page';
import { hojeIso, moeda, numeroPt } from '@/lib/formato';
import { textoCopiarItens, totaisDoEnvio, itensDoEnvio } from '@/lib/envio-industria';
import { nomeArquivoWinthor, textoImportacaoWinthor } from '@/lib/carrinho';
import { baixarTexto } from '@/lib/csv';
import type { PedidoCapa } from '@/lib/pedido';
import type { SessaoPersona } from '@/lib/persona';
import DialogoEnvio from '@/pages/quadros/DialogoEnvio';
import { registrarEnvio } from '@/pages/quadros/registrar-envio';
import { usePedido, type CapaPedido } from './pedido-contexto';
import ItensEnviados from './ItensEnviados';

/** A capa no formato que o diálogo e o texto do e-mail já leem. */
function capaParaEnvio(capa: CapaPedido): PedidoCapa {
  return {
    ID_CARD: capa.idCard, CODFORNEC: capa.codfornec, FORNECEDOR: capa.fornecedor,
    CODFILIAL: capa.codfilial, FILIAL: capa.filial,
    PERIODO_INICIO: capa.periodoInicio, PERIODO_FIM: capa.periodoFim, NUMPED_WINTHOR: capa.numped,
  };
}

type Props = ExtensaoContexto & { sessao: SessaoPersona; recarregarPedido: () => Promise<void> };

export default function BlocoEnvio({ sessao, recarregarPedido, ...ctx }: Props) {
  const pedido = usePedido(ctx.card.id, ctx.card.criadoPor);
  const [aberto, setAberto] = React.useState(false);
  const [aviso, setAviso] = React.useState<{ tom: 'success' | 'error'; texto: string } | null>(null);

  const capa = pedido.capa && pedido.capa.idCard === ctx.card.id ? pedido.capa : null;
  const totais = totaisDoEnvio(pedido.itens);
  const podeRegistrar = sessao.permissoes.registrarEnvio;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoCopiarItens(pedido.itens));
      setAviso({ tom: 'success', texto: `${totais.produtos} ${totais.produtos === 1 ? 'item copiado' : 'itens copiados'}, sem a marca de origem.` });
    } catch {
      setAviso({ tom: 'error', texto: 'O navegador não deixou copiar. Verifique a permissão da área de transferência.' });
    }
  }

  function baixarArquivo() {
    if (!capa) return;
    const itens = itensDoEnvio(pedido.itens).map((item) => ({ codprod: item.codprod, preco: item.precoCusto, quantidade: item.qtPedida }));
    if (itens.some((item) => !(item.preco > 0))) {
      setAviso({ tom: 'error', texto: 'Há item sem custo: informe o preço antes de gerar o arquivo do WinThor.' });
      return;
    }
    baixarTexto(nomeArquivoWinthor(capa.codfornec, capa.codfilial, hojeIso()), textoImportacaoWinthor(itens));
    setAviso(null);
  }

  if (pedido.carregando && !capa) {
    return <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">Carregando o pedido...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso ? <Alert tone={aviso.tom}>{aviso.texto}</Alert> : null}
      <Panel>
        <PanelHeader title="Resumo do pedido para a indústria" hint="Confira o que vai ao fornecedor antes de registrar o envio." />
        <div className="flex flex-col gap-3 p-4">
          <GradeMini colunas={3}>
            <MiniCartao rotulo="Produtos" valor={totais.produtos} />
            <MiniCartao rotulo="Unidades" valor={numeroPt(totais.quantidade)} />
            <MiniCartao rotulo="Valor total" valor={moeda(totais.valor)} />
          </GradeMini>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copiar()} disabled={totais.produtos === 0} title="Código, produto, embalagem, quantidade e custo — sem a marca Comercial">
              <ClipboardCopy aria-hidden />
              Copiar itens
            </Button>
            <Button size="sm" onClick={baixarArquivo} disabled={totais.produtos === 0 || !capa} title="O pedido no layout de importação do WinThor; o SGC não grava no ERP">
              <FileDown aria-hidden />
              Arquivo WinThor
            </Button>
          </div>
        </div>
        <ItensEnviados itens={pedido.itens} />
        <div className="flex justify-end border-t border-rule-row px-4 py-3">
          <Button
            variant="primary"
            onClick={() => setAberto(true)}
            disabled={!podeRegistrar || ctx.travado || totais.produtos === 0}
            title={podeRegistrar ? undefined : 'Seu perfil não registra o envio do pedido.'}
          >
            <Send aria-hidden />
            Registrar envio
          </Button>
        </div>
      </Panel>

      <DialogoEnvio
        aberto={aberto}
        onFechar={() => setAberto(false)}
        pedido={capa ? capaParaEnvio(capa) : null}
        // A falha volta para o diálogo, que a mostra sem fechar.
        onConfirmar={async (dados) => {
          await registrarEnvio(ctx, capa ? capaParaEnvio(capa) : null, dados);
          await Promise.all([recarregarPedido(), pedido.recarregar(ctx.card.id)]);
        }}
      />
    </div>
  );
}
