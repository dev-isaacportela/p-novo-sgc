// O seletor de custo de um item (R-133): Padrão (Gestão de Custos, R-128), as
// tabelas especiais vigentes do produto ou Manual — com o campo do valor
// quando é manual. A regra (opções, escolha, o que grava) é de
// `lib/custo-do-item.ts`; aqui só se desenha.
import { Input, SelectMenu } from '@/components/page';
import type { CustoPadrao, TipoPreco } from '@/lib/compras';
import { custoDaEscolha, escolhaDoItem, opcoesDeCusto, type TabelaVigente } from '@/lib/custo-do-item';

export function SeletorDeCusto({
  rotulo,
  tipoPreco,
  precoCusto,
  padrao,
  tabelas,
  disabled,
  onEscolher,
}: {
  rotulo: string;
  tipoPreco: TipoPreco;
  precoCusto: number;
  padrao: CustoPadrao;
  tabelas: TabelaVigente[];
  disabled?: boolean;
  onEscolher: (custo: { precoCusto: number; tipoPreco: TipoPreco }) => void;
}) {
  const atual = { tipoPreco, precoCusto };
  const opcoes = opcoesDeCusto(padrao, tabelas, atual);
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <SelectMenu
        label={`Custo de ${rotulo}`}
        value={escolhaDoItem(atual, tabelas)}
        options={opcoes}
        disabled={disabled}
        className="h-8"
        onChange={(escolha) => onEscolher(custoDaEscolha(escolha, padrao, precoCusto))}
      />
      {tipoPreco === 'manual' ? (
        <Input
          type="number"
          min={0}
          step="0.0001"
          className="h-8 text-right"
          aria-label={`Custo manual de ${rotulo}`}
          value={String(precoCusto)}
          disabled={disabled}
          onChange={(evento) => onEscolher({ precoCusto: Number(evento.target.value) || 0, tipoPreco: 'manual' })}
        />
      ) : null}
    </span>
  );
}
