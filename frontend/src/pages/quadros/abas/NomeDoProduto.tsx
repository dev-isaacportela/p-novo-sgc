// O nome do produto que abre o drill-in (R-133): a Análise do Produto da 011,
// com o item do pedido no topo. O mesmo botão na tela ampla, na lista dos
// itens e nos cartões de solicitação.
import { cn } from '@/lib/utils';
import { useRascunho } from './rascunho-contexto';

export function NomeDoProduto({ codprod, descricao, truncar }: { codprod: number; descricao: string; truncar?: boolean }) {
  const r = useRascunho();
  return (
    <button
      type="button"
      onClick={() => r.abrirProduto(codprod)}
      title={`Abrir a análise de ${descricao}`}
      className={cn(
        'max-w-full rounded-sm text-left font-semibold text-ink hover:text-primary hover:underline',
        'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        truncar ? 'truncate' : 'break-words',
      )}
    >
      {descricao}
    </button>
  );
}
