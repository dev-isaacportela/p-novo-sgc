// Adicionar à lista um produto que não veio na análise (spec 003, C-009).
//
// A busca é por código OU por parte do nome, devolve no máximo 20 resultados e
// já sai do ERP sem produto inativo e sem os departamentos 4 e 7 (RN-011). O
// escolhido entra na lista com quantidade zero.

import * as React from 'react';
import { Plus } from 'lucide-react';
import {
  Alert, Button, Code, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, IconButton, SearchInput, Table, Td, Th, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { moeda } from '@/lib/formato';

type Linha = Record<string, unknown>;

interface Props {
  codfilial: string;
  jaNaLista: number[];
  onFechar: () => void;
  onEscolher: (linha: Linha) => void;
}

/** Montado só enquanto está aberto: fechar desmonta e zera a busca sem efeito nenhum. */
export default function BuscarProduto({ codfilial, jaNaLista, onFechar, onEscolher }: Props) {
  const [termo, setTermo] = React.useState('');
  const [resultados, setResultados] = React.useState<Linha[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const [erro, setErro] = React.useState('');
  const [buscou, setBuscou] = React.useState(false);

  async function buscar() {
    const texto = termo.trim();
    if (!texto) return;
    setBuscando(true);
    setErro('');
    try {
      const soDigitos = /^\d+$/.test(texto);
      setResultados(await linhas('sgcWintBuscarProduto', {
        codprod: soDigitos ? Number(texto) : 0,
        busca: soDigitos ? '' : texto,
        codfilial,
      }));
      setBuscou(true);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível buscar no ERP.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(estado) => !estado && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar produto ao pedido</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-2">
              <SearchInput
                className="flex-1"
                placeholder="Código do produto ou parte do nome"
                value={termo}
                onChange={(evento) => setTermo(evento.target.value)}
                onKeyDown={(evento) => { if (evento.key === 'Enter') void buscar(); }}
              />
              <Button variant="primary" onClick={() => void buscar()} disabled={buscando || !termo.trim()}>
                Buscar
              </Button>
            </div>

            {erro ? <Alert tone="error">{erro}</Alert> : null}

            {resultados.length === 0 ? (
              <EmptyState
                title={buscou ? 'Nenhum produto encontrado' : 'Busque por código ou nome'}
                hint="A busca traz no máximo 20 produtos, sempre ativos e fora dos departamentos 4 e 7."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th numeric>Estoque</Th>
                    <Th numeric>Custo</Th>
                    <Th className="w-16 text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((linha) => {
                    const codprod = Number(linha.CODPROD);
                    return (
                      <Tr key={codprod}>
                        <Td>
                          <span className="font-semibold text-ink">{String(linha.DESCRICAO ?? '')}</span>
                          <span className="block text-[12px] text-ink-secondary">
                            <Code prefix="cód.">{codprod}</Code> · {String(linha.EMBALAGEM ?? '')}
                          </span>
                        </Td>
                        <Td numeric>{Number(linha.ESTOQUE ?? 0).toLocaleString('pt-BR')}</Td>
                        <Td numeric>{moeda(linha.CUSTO_ULT_ENTRADA as number)}</Td>
                        <Td className="text-right">
                          <IconButton
                            label={jaNaLista.includes(codprod) ? 'Este produto já está na lista' : 'Adicionar à lista'}
                            onClick={() => onEscolher(linha)}
                            disabled={jaNaLista.includes(codprod)}
                          >
                            <Plus aria-hidden />
                          </IconButton>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
