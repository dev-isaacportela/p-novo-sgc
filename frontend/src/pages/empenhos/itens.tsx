// Peças dos itens do empenho, usadas na janela Novo empenho e na Análise: a
// busca de produto no ERP (C-012), o item novo com o custo padrão do Gestão de
// Custos (R-128) e o especial vigente do órgão, o campo numérico e o resumo do
// CMV com o aviso de 70 % que não bloqueia (C-013).
import * as React from 'react';

import { linhas } from '@/lib/mitra-api';
import { moeda } from '@/lib/formato';
import { AVISO_CMV, cmvAcimaDaReferencia, totaisEmpenho, type ItemEmpenho } from '@/lib/empenhos';
import { pct, type Produto } from '@/pages/empenhos/operacoes';
import { Alert, Badge, Button, Input, SearchInput } from '@/components/page';

/** Com vírgula, o ponto é milhar; sem vírgula, o ponto é a casa decimal. Vazio é 0. */
const lerNumero = (texto: string) => Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto) || 0;

/** Número digitado em pt-BR; o texto só se refaz quando o valor muda por fora. */
export function CampoNumero({ valor, onChange, rotulo, disabled, className }: {
  valor: number; onChange: (v: number) => void; rotulo: string; disabled?: boolean; className?: string;
}) {
  const [texto, setTexto] = React.useState(valor ? String(valor).replace('.', ',') : '');
  const [ultimo, setUltimo] = React.useState(valor);
  if (valor !== ultimo) {
    setUltimo(valor);
    if (lerNumero(texto) !== valor) setTexto(valor ? String(valor).replace('.', ',') : '');
  }
  return (
    <Input
      aria-label={rotulo}
      inputMode="decimal"
      className={className ?? 'w-24 text-right'}
      value={texto}
      disabled={disabled}
      onChange={(e) => {
        const limpo = e.target.value.replace(/[^\d,.]/g, '');
        setTexto(limpo);
        onChange(lerNumero(limpo));
      }}
    />
  );
}

/** Busca no ERP por código ou trecho do nome (2 letras), 20 linhas. */
export function BuscaProduto({ jaTem, onEscolher, disabled }: { jaTem: number[]; onEscolher: (p: Produto) => Promise<void>; disabled?: boolean }) {
  const [busca, setBusca] = React.useState('');
  const [achados, setAchados] = React.useState<Produto[]>([]);
  const [estado, setEstado] = React.useState<'parado' | 'buscando' | 'erro'>('parado');

  React.useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2 && !/^\d+$/.test(termo)) return undefined;
    let vivo = true;
    const espera = window.setTimeout(() => {
      setEstado('buscando');
      const codprod = /^\d+$/.test(termo) ? Number(termo) : 0;
      linhas('sgcWintEmpProdutos', { codprod, busca: codprod ? '' : termo })
        .then((rows) => {
          if (!vivo) return;
          setAchados(rows as Produto[]);
          setEstado('parado');
        })
        .catch(() => vivo && setEstado('erro'));
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [busca]);

  const visiveis = busca.trim().length < 2 && !/^\d+$/.test(busca.trim()) ? [] : achados;
  return (
    <div className="flex flex-col gap-2">
      <SearchInput placeholder="Produto do ERP: código ou nome (2 letras)" value={busca} onChange={(e) => setBusca(e.target.value)} disabled={disabled} aria-label="Buscar produto" />
      {estado === 'erro' ? <Alert tone="error">Não foi possível buscar no ERP.</Alert> : null}
      {visiveis.length ? (
        <ul className="max-h-56 overflow-auto rounded-xl border border-rule-row">
          {visiveis.map((p) => {
            const repetido = jaTem.includes(Number(p.CODPROD));
            return (
              <li key={p.CODPROD} className="flex items-center justify-between gap-3 border-b border-rule-row px-3 py-2 text-[13px] last:border-b-0">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{p.CODPROD} — {p.DESCRICAO}</span>
                  <span className="block text-[12px] text-ink-secondary">{p.FORNECEDOR || 'sem indústria'} · fábrica {p.CODFAB || '—'} · {p.EMBALAGEM}</span>
                </span>
                <Button size="sm" disabled={repetido || disabled} title={repetido ? 'Este produto já está no empenho.' : undefined}
                  onClick={() => void onEscolher(p).then(() => setBusca(''))}>
                  {repetido ? 'Já está' : 'Acrescentar'}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : estado === 'buscando' ? <p className="text-[12px] text-ink-secondary">Buscando...</p> : null}
    </div>
  );
}

/** C-013: valor de contrato, custo e CMV pela razão; o aviso não bloqueia. */
export function ResumoCmv({ itens, congelado }: { itens: ItemEmpenho[]; congelado?: { valor: number; custo: number; cmv: number | null; em: string } | null }) {
  const vivo = totaisEmpenho(itens);
  const t = congelado ?? vivo;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-secondary">
      <span>Valor do contrato <span className="font-semibold text-ink">{moeda(t.valor)}</span></span>
      <span>Custo <span className="font-semibold text-ink">{moeda(t.custo)}</span></span>
      <span>CMV <span className={cmvAcimaDaReferencia(t.cmv) ? 'font-semibold text-destructive' : 'font-semibold text-ink'}>{pct(t.cmv)}</span></span>
      {cmvAcimaDaReferencia(t.cmv) ? <Badge tone="alert">{AVISO_CMV}</Badge> : null}
      {congelado ? <Badge tone="neutral">congelado em {congelado.em.slice(0, 10).split('-').reverse().join('/')}</Badge> : null}
    </div>
  );
}
