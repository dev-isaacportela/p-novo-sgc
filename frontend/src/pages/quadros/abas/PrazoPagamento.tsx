// Bloco de prazo de pagamento da aba Itens (spec 003, RF-019 e RF-020).
//
// Os dois lados ficam lado a lado com a diferença em dias: o PADRÃO do
// fornecedor e o ACORDADO neste pedido. Divergiram, a justificativa passa a ser
// obrigatória (mínimo de 10 caracteres) e a mesma regra pura
// (`validarPrazoMontagem`) que barra aqui é a que barra na saída da Análise.
//
// Os dois são gravados NORMALIZADOS (D-005): é isso que faz a comparação de
// texto do servidor coincidir com a comparação de parcelas da tela.
//
// A sugestão do padrão é sob demanda, nunca ao abrir o card: abrir um pedido
// não pode custar execução extra (RNF-002). Vem das faixas do fornecedor
// (spec 001) e, na falta delas, da condição praticada no ERP.

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Alert, Button, Input, LabelledField, Panel, PanelHeader, Status, Textarea } from '@/components/page';
import { acao, linhas } from '@/lib/mitra-api';
import {
  MINIMO_JUSTIFICATIVA_PRAZO, compararPrazo, normalizarPrazo, textoDeParcelas, validarPrazoMontagem,
} from '@/lib/prazo-pagamento';

const TOM_STATUS = { ok: 'live', ganho: 'live', alerta: 'attention', neutro: 'off' } as const;

interface Props {
  cardId: number;
  codfornec: number;
  codfilial: string;
  vlTotal: number;
  prazoPadrao: string;
  prazoAcordado: string;
  prazoJustificativa: string;
  bloqueado: boolean;
  onSalvo: (prazo: { prazoPadrao: string; prazoAcordado: string; prazoJustificativa: string }) => void;
}

type Linha = Record<string, unknown>;

/** Faixa de valor do fornecedor (001) que cobre o valor deste pedido. */
function parcelasDaFaixa(faixas: Linha[], valor: number): string {
  const faixa = faixas.find((linha) => {
    const de = Number(linha.VALOR_DE ?? 0);
    const ate = Number(linha.VALOR_ATE ?? 0);
    return valor >= de && (ate === 0 || valor <= ate);
  });
  return faixa ? String(faixa.PARCELAS ?? '') : '';
}

export default function PrazoPagamento(props: Props) {
  const [padrao, setPadrao] = React.useState(props.prazoPadrao);
  const [acordado, setAcordado] = React.useState(props.prazoAcordado);
  const [justificativa, setJustificativa] = React.useState(props.prazoJustificativa);
  const [erro, setErro] = React.useState('');
  const [aviso, setAviso] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);

  // Trocou o card ou o pedido foi recarregado: os campos voltam ao que está
  // gravado. Ajuste durante a renderização (padrão do React para estado
  // derivado de prop), não em efeito — digitar não mexe nas props.
  const gravado = `${props.cardId}|${props.prazoPadrao}|${props.prazoAcordado}|${props.prazoJustificativa}`;
  const [base, setBase] = React.useState(gravado);
  if (base !== gravado) {
    setBase(gravado);
    setPadrao(props.prazoPadrao);
    setAcordado(props.prazoAcordado);
    setJustificativa(props.prazoJustificativa);
  }

  const comparacao = compararPrazo(padrao, acordado);
  const bloqueio = validarPrazoMontagem({ padrao, acordado, justificativa });

  async function sugerirPadrao() {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      const fornecedor = await acao('sgcFornecedorCarregar', { codfornec: props.codfornec });
      const daFaixa = parcelasDaFaixa((fornecedor.faixas ?? []) as Linha[], props.vlTotal);
      if (daFaixa) {
        setPadrao(daFaixa);
        setAviso('Prazo padrão trazido da faixa de valor parametrizada para este fornecedor.');
        return;
      }
      const pedidos = await linhas('sgcWintPrazoPagamento', { codfornec: props.codfornec, codfilial: props.codfilial });
      const primeiro = pedidos[0];
      if (!primeiro) {
        setAviso('Este fornecedor ainda não tem faixa parametrizada nem pedido recente no ERP. Informe o prazo padrão à mão.');
        return;
      }
      const dias = [primeiro.PRAZO1, primeiro.PRAZO2, primeiro.PRAZO3].map(Number).filter((dia) => dia > 0);
      setPadrao(textoDeParcelas(dias));
      setAviso('Sem faixa parametrizada: o padrão veio da condição praticada no último pedido de compra do ERP.');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível sugerir o prazo padrão.');
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    setOcupado(true);
    setErro('');
    setAviso('');
    const prazo = {
      prazoPadrao: normalizarPrazo(padrao),
      prazoAcordado: normalizarPrazo(acordado),
      prazoJustificativa: justificativa.trim(),
    };
    try {
      await acao('sgcEscPedidoPrazo', { idCard: props.cardId, ...prazo });
      props.onSalvo(prazo);
      setAviso('Prazo de pagamento salvo.');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o prazo de pagamento.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Prazo de pagamento" hint="O padrão do fornecedor e o acordado neste pedido, lado a lado.">
        <Button size="sm" onClick={() => void sugerirPadrao()} disabled={props.bloqueado || ocupado}>
          <Sparkles aria-hidden />
          Sugerir padrão
        </Button>
        <Button variant="primary" size="sm" onClick={() => void salvar()} disabled={props.bloqueado || ocupado}>
          Salvar prazo
        </Button>
      </PanelHeader>

      <div className="flex flex-col gap-4 px-4 py-4">
        {erro ? <Alert tone="error">{erro}</Alert> : null}
        {aviso ? <Alert tone="info">{aviso}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <LabelledField label="Prazo padrão do fornecedor" hint="Ex.: 30/60/90, 30 dias, à vista" obrigatorio>
            <Input value={padrao} onChange={(evento) => setPadrao(evento.target.value)} disabled={props.bloqueado} />
          </LabelledField>
          <LabelledField label="Prazo acordado neste pedido" hint="Ex.: 28/35/42" obrigatorio>
            <Input value={acordado} onChange={(evento) => setAcordado(evento.target.value)} disabled={props.bloqueado} />
          </LabelledField>
        </div>

        <p className="text-[13px]">
          <Status tone={TOM_STATUS[comparacao.tom]}>{comparacao.rotulo}</Status>
        </p>

        {comparacao.exigeJustificativa ? (
          <LabelledField
            label="Justificativa da diferença"
            obrigatorio
            hintTone={justificativa.trim().length < MINIMO_JUSTIFICATIVA_PRAZO ? 'error' : 'muted'}
            hint={`${justificativa.trim().length} de ${MINIMO_JUSTIFICATIVA_PRAZO} caracteres no mínimo`}
          >
            <Textarea
              rows={3}
              value={justificativa}
              onChange={(evento) => setJustificativa(evento.target.value)}
              disabled={props.bloqueado}
            />
          </LabelledField>
        ) : null}

        {bloqueio ? <Alert tone="warn">{bloqueio}</Alert> : null}
      </div>
    </Panel>
  );
}
