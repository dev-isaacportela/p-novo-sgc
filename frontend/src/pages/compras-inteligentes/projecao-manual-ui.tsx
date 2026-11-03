// Spec 019 (projeção manual): o bloco do ajuste que vale — no painel e na
// Análise do Produto, logo depois do bloco de silenciado — e a janela de
// ajustar, alterar e remover. Escrita nenhuma acontece aqui: quem chama as
// `sgcEsc*` é a página, que depois RELÊ o que o banco devolveu (D-03 da 011).
import * as React from 'react';
import { TrendingUp } from 'lucide-react';

import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, LabelledField,
  RowMeta, Textarea,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';
import { fmtData, hojeIso } from '@/lib/formato';
import {
  MOTIVO_MAXIMO, PERCENTUAL_MAXIMO, PERCENTUAL_MINIMO, lerPercentual, previaDaProjecao, textoDoPercentual, validadeMaxima,
  validadePadrao, validarProjecao,
} from '@/lib/projecao-manual';
import type { LinhaRessuprimento } from '@/lib/ressuprimento';

const consumo = (valor: number) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');

/** RF-007: "Projeção manual +20 % até dd/mm/aaaa", o motivo e o consumo medido ao lado do ajustado. */
export function BlocoProjecaoManual({
  linha,
  podeParametrizar,
  motivoBloqueio,
  onAlterar,
}: {
  linha: LinhaRessuprimento;
  podeParametrizar: boolean;
  motivoBloqueio: string;
  onAlterar: (linha: LinhaRessuprimento) => void;
}) {
  const p = linha.projecao;
  if (!p) return null;
  return (
    <Alert tone="info">
      <div className="flex flex-wrap items-start gap-3">
        <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide uppercase">{`Projeção manual ${textoDoPercentual(p.percentual)} até ${fmtData(p.validaAte)}`}</p>
          <p className="mt-0.5">{p.motivo ? `Motivo: ${p.motivo}` : 'Sem motivo informado'}</p>
          <p className="mt-0.5">{`Consumo medido ${consumo(linha.consumoMedido)} → ajustado ${consumo(linha.consumoDiario)} un./dia`}</p>
        </div>
        <Button
          size="sm"
          disabled={!podeParametrizar}
          title={podeParametrizar ? 'Alterar ou remover o ajuste' : motivoBloqueio}
          onClick={() => onAlterar(linha)}
        >
          Alterar
        </Button>
      </div>
    </Alert>
  );
}

/** O botão de ajustar, ao lado de Parâmetros (painel e janela); sem permissão, desabilitado com o motivo. */
export function BotaoProjecaoManual({
  linha,
  podeParametrizar,
  motivoBloqueio,
  onProjecao,
}: {
  linha: LinhaRessuprimento;
  podeParametrizar: boolean;
  motivoBloqueio: string;
  onProjecao: (linha: LinhaRessuprimento) => void;
}) {
  return (
    <Button size="sm" disabled={!podeParametrizar} title={podeParametrizar ? 'Ajustar a venda projetada deste produto, com prazo' : motivoBloqueio} onClick={() => onProjecao(linha)}>
      <TrendingUp aria-hidden />
      {linha.projecao ? `Projeção ${textoDoPercentual(linha.projecao.percentual)}` : 'Projeção manual'}
    </Button>
  );
}

export interface ValoresProjecao { codprod: number; percentual: number; validaAte: string; motivo: string }

/** C-005 / C-006: percentual, validade e motivo, com a prévia; "Remover ajuste" quando há um valendo. */
export function ProjecaoManualDialogo({
  linha,
  onFechar,
  onSalvar,
  onRemover,
}: {
  linha: LinhaRessuprimento | null;
  onFechar: () => void;
  onSalvar: (valores: ValoresProjecao) => Promise<void>;
  onRemover: (codprod: number) => Promise<void>;
}) {
  const hoje = hojeIso();
  const [percentual, setPercentual] = React.useState('');
  const [ate, setAte] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [erros, setErros] = React.useState<string[]>([]);
  const [salvando, setSalvando] = React.useState(false);

  const codprod = linha ? Number(linha.medida.CODPROD) : 0;
  const [ultimo, setUltimo] = React.useState(codprod);
  if (codprod !== ultimo) {
    setUltimo(codprod);
    // RN-004: a validade nasce em hoje + 30; alterar parte do que está gravado.
    setPercentual(linha?.projecao ? String(linha.projecao.percentual).replace('.', ',') : '');
    setAte(linha?.projecao?.validaAte || validadePadrao(hoje));
    setMotivo(linha?.projecao?.motivo ?? '');
    setErros([]);
  }

  if (!linha) return null;

  const lido = lerPercentual(percentual);
  const previa = Number.isFinite(lido) && lido !== 0 ? previaDaProjecao(linha.consumoMedido, linha.coberturaDias, lido) : null;

  async function executar(acao: () => Promise<void>, falhou: string) {
    setSalvando(true);
    setErros([]);
    try {
      await acao();
      onFechar();
    } catch (falha) {
      setErros([falha instanceof Error ? falha.message : falhou]);
    } finally {
      setSalvando(false);
    }
  }

  function salvar() {
    const v = validarProjecao({ percentual, validaAte: ate, motivo }, hoje);
    if (!v.ok) {
      setErros(v.erros);
      return;
    }
    void executar(() => onSalvar({ codprod, percentual: v.percentual, validaAte: ate, motivo: motivo.trim() }), 'Não foi possível gravar o ajuste.');
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Projeção manual de ${linha.medida.DESCRICAO}`}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erros.length > 0 ? <Alert tone="error">{erros.join(' ')}</Alert> : null}
            <Alert tone="info">
              O percentual multiplica a venda projetada deste produto nesta filial até a data escolhida: a sugestão,
              a cobertura, a situação e a previsão partem da venda ajustada. O histórico e o erro dos modelos não mudam.
            </Alert>
            <LabelledField label="Ajuste da venda (%)" obrigatorio hint={`De ${PERCENTUAL_MINIMO} % a +${PERCENTUAL_MAXIMO} %; negativo reduz.`}>
              <Input inputMode="decimal" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="20" aria-label="Ajuste da venda em %" />
            </LabelledField>
            <LabelledField label="Vale até" obrigatorio hint="No dia seguinte o ajuste deixa de valer sozinho.">
              <DatePicker value={ate} onChange={setAte} min={hoje} max={validadeMaxima(hoje)} aria-label="Vale até" />
            </LabelledField>
            <LabelledField label="Motivo" obrigatorio hint="Fica visível no painel, ao lado do ajuste.">
              <Textarea rows={3} maxLength={MOTIVO_MAXIMO} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </LabelledField>
            {previa ? (
              <RowMeta>
                {`Consumo ${consumo(previa.consumoAntes)} → ${consumo(previa.consumoDepois)} un./dia · máximo ${inteiro(previa.maximoAntes)} → ${inteiro(previa.maximoDepois)} un. (${linha.coberturaDias} dias)`}
              </RowMeta>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          {linha.projecao ? (
            <Button variant="danger" onClick={() => void executar(() => onRemover(codprod), 'Não foi possível remover o ajuste.')} disabled={salvando}>
              Remover ajuste
            </Button>
          ) : null}
          <Button onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Gravar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
