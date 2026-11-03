// O topo do card na Análise (R-133), no desenho do SGC legado: o banner de
// reprovação (quando o pedido voltou), os quatro números do pedido, a barra
// de aderência à sugestão com "Aceitar sugestão" e as faixas de aviso. Lê e
// mexe no rascunho — aceitar a sugestão não grava nada até Salvar.
//
// A reprovação só aparecia no histórico do card (a nota da 002): agora fica
// aqui, e só aqui.
import { CircleAlert, OctagonX, Tag, UserRound, Wand2 } from 'lucide-react';
import { Alert, BarraConsumo, Button, GradeMini, MiniCartao, Panel } from '@/components/page';
import { moeda } from '@/lib/formato';
import {
  aderenciaASugestao, faixasDoResumo, numerosDoPedido, plural, textoDaAderencia, textoDosAlertas,
} from '@/lib/resumo-pedido';
import { usePedido } from './pedido-contexto';
import { useRascunho } from './rascunho-contexto';

const quantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export default function ResumoDoPedido({ cardId, criadoPor }: { cardId: number; criadoPor?: number | null }) {
  const pedido = usePedido(cardId, criadoPor);
  const r = useRascunho();
  if (!r.capa) return null;

  const numeros = numerosDoPedido(r.itens, pedido.alertas);
  const aderencia = aderenciaASugestao(r.itens);
  const faixas = faixasDoResumo(r.itens, pedido.alertas);
  const textoAlertas = textoDosAlertas(faixas);
  const descricaoDe = (codprod: number) => r.itens.find((item) => item.codprod === codprod)?.descricao;

  return (
    <div className="flex flex-col gap-3">
      {r.capa.reprovacoes.map((rep) => (
        <Alert key={rep.origem} tone="error" icon={<OctagonX aria-hidden />}>
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{rep.titulo}</span>
            <span>{rep.instrucao}</span>
            <span><span className="font-semibold">Motivo:</span> {rep.motivo}</span>
            {rep.produtos.length > 0 ? (
              <span>
                <span className="font-semibold">{`Produtos com reprovação (${rep.produtos.length}):`}</span>{' '}
                {rep.produtos.map((codprod) => (descricaoDe(codprod) ? `${descricaoDe(codprod)} (${codprod})` : String(codprod))).join(' · ')}
              </span>
            ) : null}
          </span>
        </Alert>
      ))}

      <GradeMini colunas={4}>
        <MiniCartao rotulo="Itens" valor={numeros.itens.toLocaleString('pt-BR')} hint={`${quantidade(numeros.unidades)} un.`} />
        <MiniCartao rotulo="Valor total" valor={moeda(numeros.valor)} hint={r.alterados.length > 0 ? 'com alterações não salvas' : undefined} />
        <MiniCartao rotulo="Preço especial" valor={numeros.especiais.toLocaleString('pt-BR')} tone={numeros.especiais > 0 ? 'attention' : 'neutral'} hint="itens com tabela especial" />
        <MiniCartao rotulo="Alertas" valor={numeros.alertas.toLocaleString('pt-BR')} tone={numeros.alertas > 0 ? 'alert' : 'neutral'} hint="não lidos" />
      </GradeMini>

      <Panel>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {`Aderência à sugestão${aderencia.pct === null ? '' : ` · ${aderencia.pct} %`}`}
            </span>
            <BarraConsumo pct={aderencia.pct ?? 0} tone={aderencia.pct === null ? 'off' : aderencia.tom} rotulo={textoDaAderencia(aderencia)} />
          </div>
          <Button
            size="sm"
            onClick={r.aceitarSugestao}
            disabled={r.bloqueado || aderencia.alterados.length === 0}
            title="Grava a quantidade sugerida nos itens alterados; sugestão 0 tira o item do pedido. Nada é gravado até Salvar."
          >
            <Wand2 aria-hidden />
            {`Aceitar sugestão (${aderencia.alterados.length})`}
          </Button>
        </div>
      </Panel>

      {textoAlertas ? <Alert tone="warn" icon={<CircleAlert aria-hidden />}>{textoAlertas}</Alert> : null}
      {faixas.especiais > 0 ? (
        <Alert tone="info" icon={<Tag aria-hidden />}>{`${plural(faixas.especiais, 'item', 'itens')} com preço especial`}</Alert>
      ) : null}
      {faixas.solicitacoes.itens > 0 ? (
        <Alert tone="info" icon={<UserRound aria-hidden />}>
          {`${plural(faixas.solicitacoes.itens, 'item', 'itens')} de solicitação comercial (${quantidade(faixas.solicitacoes.unidades)} un.)`}
        </Alert>
      ) : null}
    </div>
  );
}
