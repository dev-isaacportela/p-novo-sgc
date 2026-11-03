// O seletor de custo de um item (R-133): Padrão (Gestão de Custos, R-128), as
// tabelas especiais vigentes do produto ou Manual — com o campo do valor
// quando é manual. A regra (opções, escolha, o que grava) é de
// `lib/custo-do-item.ts`; aqui só se desenha.
import { Input, SelectMenu } from '@/components/page';
import { cn } from '@/lib/utils';
import type { CustoPadrao, TipoPreco } from '@/lib/compras';
import { custoDaEscolha, escolhaDoItem, opcoesDeCusto, type TabelaVigente } from '@/lib/custo-do-item';

export function SeletorDeCusto({
  rotulo,
  tipoPreco,
  precoCusto,
  padrao,
  tabelas,
  disabled,
  compacto,
  altura,
  onEscolher,
}: {
  rotulo: string;
  tipoPreco: TipoPreco;
  precoCusto: number;
  padrao: CustoPadrao;
  tabelas: TabelaVigente[];
  disabled?: boolean;
  /** R-137: a altura da linha compacta da tela ampla (28 px). */
  compacto?: boolean;
  /** A altura dos controles quando precisa casar com os campos ao lado (R-138: h-9, a do Input). */
  altura?: 'h-7' | 'h-8' | 'h-9';
  onEscolher: (custo: { precoCusto: number; tipoPreco: TipoPreco }) => void;
}) {
  const atual = { tipoPreco, precoCusto };
  const opcoes = opcoesDeCusto(padrao, tabelas, atual);
  return (
    // Manual põe o valor AO LADO do menu: a linha da tabela não cresce (R-137).
    <span className="flex w-full min-w-0 items-center gap-1">
      <SelectMenu
        label={`Custo de ${rotulo}`}
        value={escolhaDoItem(atual, tabelas)}
        options={opcoes}
        disabled={disabled}
        className={cn(altura ?? (compacto ? 'h-7' : 'h-8'), 'min-w-0 flex-1')}
        onChange={(escolha) => onEscolher(custoDaEscolha(escolha, padrao, precoCusto))}
      />
      {tipoPreco === 'manual' ? (
        <Input
          type="number"
          min={0}
          step="0.0001"
          className={cn(altura ?? (compacto ? 'h-7' : 'h-8'), 'w-24 shrink-0 text-right')}
          aria-label={`Custo manual de ${rotulo}`}
          value={String(precoCusto)}
          disabled={disabled}
          onChange={(evento) => onEscolher({ precoCusto: Number(evento.target.value) || 0, tipoPreco: 'manual' })}
        />
      ) : null}
    </span>
  );
}
