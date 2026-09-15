// Spec 001 (fornecedores) — RF-001..RF-004: listagem paginada, busca, filtro
// por filial e situação, seletor do ERP para iniciar uma parametrização nova.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Truck } from 'lucide-react';
import { linhas, linha, comPadrao } from '@/lib/mitra-api';
import {
  PageHeader, Panel, Toolbar, SearchInput, SelectMenu, FilterChip, Table, Th, Td, Tr,
  RowTitle, RowMeta, Code, Status, Dash, IconButton, Pagination, EmptyState, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody,
} from '@/components/page';
import { formatarCnpj, rotuloPrazoEntrega } from '@/lib/fornecedor';
import { moeda, fmtData } from '@/lib/formato';

const LIMITE = 20;

interface FornecedorLinha {
  ID: number; CODFORNEC: number; FORNECEDOR: string; CNPJ: string; CNPJ_FORMATADO: string;
  PRAZO_ENTREGA_DIAS: number; PRAZO_ENTREGA_TIPO: string; PEDIDO_MINIMO: number; ATIVO: number;
  ATUALIZADO_EM: string; QT_FILIAIS: number; QT_LINHAS: number;
}
interface ErpFornecedor { CODFORNEC: number; FORNECEDOR: string; CGC: string }
interface ErpFilial { CODFILIAL: string; FILIAL: string }

const OPCOES_SITUACAO = [
  { value: '0', label: 'Todas as situações' },
  { value: '1', label: 'Somente ativos' },
  { value: '2', label: 'Somente inativos' },
];

export default function FornecedoresPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [codfilial, setCodfilial] = useState('');
  const [ativo, setAtivo] = useState('0');
  const [pagina, setPagina] = useState(1);

  const [linhasFornecedor, setLinhasFornecedor] = useState<FornecedorLinha[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  const [filiaisErp, setFiliaisErp] = useState<ErpFilial[]>([]);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [fornecedoresErp, setFornecedoresErp] = useState<ErpFornecedor[] | null>(null);

  // Filiais do filtro, buscadas uma vez na montagem (RNF-004).
  useEffect(() => {
    linhas('sgcWintFiliais').then((rows) => setFiliaisErp(rows as unknown as ErpFilial[])).catch(() => setFiliaisErp([]));
  }, []);

  useEffect(() => {
    let vivo = true;
    const filtros = comPadrao(
      { busca, codfilial, ativo, limite: String(LIMITE), offset: String((pagina - 1) * LIMITE) },
      { busca: '', codfilial: '', ativo: '0', limite: String(LIMITE), offset: '0' },
    );
    Promise.all([linhas('sgcFornecedorListar', filtros), linha('sgcFornecedorListarTotal', filtros)])
      .then(([rows, totalRow]) => {
        if (!vivo) return;
        setLinhasFornecedor(rows as unknown as FornecedorLinha[]);
        setTotal(Number(totalRow?.TOTAL ?? 0));
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [busca, codfilial, ativo, pagina]);

  // Cadastro do ERP para o seletor: recorte inteiro, sem paginação (D-003) —
  // o SelectMenu filtra na tela, sem nova ida ao servidor por tecla.
  useEffect(() => {
    if (!seletorAberto || fornecedoresErp !== null) return;
    linhas('sgcWintFornecedores', { busca: '' })
      .then((rows) => setFornecedoresErp(rows as unknown as ErpFornecedor[]))
      .catch(() => setFornecedoresErp([]));
  }, [seletorAberto, fornecedoresErp]);

  const lastPage = Math.max(1, Math.ceil(total / LIMITE));
  const filialSelecionada = filiaisErp.find((f) => f.CODFILIAL === codfilial);
  const situacaoSelecionada = OPCOES_SITUACAO.find((o) => o.value === ativo && o.value !== '0');

  function abrirSeletor() {
    setFornecedoresErp(null);
    setSeletorAberto(true);
  }

  return (
    <>
      <PageHeader
        module="Cadastros"
        title="Fornecedores"
        description="Cadastro do ERP e parametrização de compra por fornecedor."
        meta={<>
          <span><strong>{total.toLocaleString('pt-BR')}</strong> fornecedores</span>
        </>}
        actions={<Button variant="primary" onClick={abrirSeletor}>Parametrizar fornecedor</Button>}
      />

      <Panel>
        <Toolbar>
          <SearchInput
            placeholder="Buscar por nome, CNPJ ou código"
            value={busca}
            onChange={(e) => { setCarregando(true); setPagina(1); setBusca(e.target.value); }}
            className="min-w-56 flex-1"
          />
          <div className="w-52">
            <SelectMenu
              label="Filial"
              placeholder="Todas as filiais"
              value={codfilial}
              onChange={(v) => { setCarregando(true); setPagina(1); setCodfilial(v); }}
              options={[{ value: '', label: 'Todas as filiais' }, ...filiaisErp.map((f) => ({ value: f.CODFILIAL, label: f.FILIAL }))]}
            />
          </div>
          <div className="w-48">
            <SelectMenu
              label="Situação"
              value={ativo}
              onChange={(v) => { setCarregando(true); setPagina(1); setAtivo(v); }}
              options={OPCOES_SITUACAO}
            />
          </div>
        </Toolbar>

        {filialSelecionada || situacaoSelecionada ? (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {filialSelecionada ? (
              <FilterChip label="Filial" value={filialSelecionada.FILIAL} onClear={() => { setCarregando(true); setPagina(1); setCodfilial(''); }} />
            ) : null}
            {situacaoSelecionada ? (
              <FilterChip label="Situação" value={situacaoSelecionada.label} onClear={() => { setCarregando(true); setPagina(1); setAtivo('0'); }} />
            ) : null}
          </div>
        ) : null}

        {!carregando && linhasFornecedor.length === 0 ? (
          <EmptyState
            title="Nenhum fornecedor encontrado"
            hint="Ajuste a busca ou os filtros, ou parametrize um fornecedor novo do ERP."
            action={<Button variant="primary" onClick={abrirSeletor}>Parametrizar fornecedor</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Fornecedor</Th>
                <Th>Prazo de entrega</Th>
                <Th numeric>Pedido mínimo</Th>
                <Th numeric>Filiais</Th>
                <Th numeric>Linhas</Th>
                <Th>Situação</Th>
                <Th>Atualizado</Th>
                <Th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {linhasFornecedor.map((f) => (
                <Tr key={f.ID}>
                  <Td><Code>{f.CODFORNEC}</Code></Td>
                  <Td>
                    <RowTitle>{f.FORNECEDOR}</RowTitle>
                    <RowMeta>{f.CNPJ_FORMATADO || formatarCnpj(f.CNPJ)}</RowMeta>
                  </Td>
                  <Td>{rotuloPrazoEntrega(f.PRAZO_ENTREGA_DIAS, f.PRAZO_ENTREGA_TIPO) || <Dash />}</Td>
                  <Td numeric>{moeda(f.PEDIDO_MINIMO)}</Td>
                  <Td numeric>{f.QT_FILIAIS}</Td>
                  <Td numeric>{f.QT_LINHAS}</Td>
                  <Td>{f.ATIVO ? <Status tone="live">Ativo</Status> : <Status tone="off">Inativo</Status>}</Td>
                  <Td>{f.ATUALIZADO_EM ? fmtData(f.ATUALIZADO_EM) : <Dash />}</Td>
                  <Td>
                    <IconButton label="Abrir parametrização" onClick={() => navigate(`/fornecedores/${f.CODFORNEC}`)}>
                      <Eye aria-hidden />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={pagina}
          lastPage={lastPage}
          total={total}
          unit="fornecedores"
          busy={carregando}
          onPrevious={() => { setCarregando(true); setPagina((p) => Math.max(1, p - 1)); }}
          onNext={() => { setCarregando(true); setPagina((p) => Math.min(lastPage, p + 1)); }}
        />
      </Panel>

      <Dialog open={seletorAberto} onOpenChange={setSeletorAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Parametrizar fornecedor</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {fornecedoresErp === null ? (
              <p className="py-6 text-center text-[13px] text-ink-secondary">Carregando cadastro do ERP…</p>
            ) : fornecedoresErp.length === 0 ? (
              <EmptyState title="Nenhum fornecedor no ERP" hint="Cadastre o fornecedor no WinThor antes de parametrizar aqui." />
            ) : (
              <SelectMenu
                label="Fornecedor do ERP"
                placeholder="Escolha um fornecedor"
                value=""
                onChange={(v) => { setSeletorAberto(false); navigate(`/fornecedores/${v}`); }}
                options={fornecedoresErp.map((f) => ({
                  value: String(f.CODFORNEC), label: f.FORNECEDOR, hint: `Código ${f.CODFORNEC}${f.CGC?.trim() ? ` · ${f.CGC.trim()}` : ''}`,
                }))}
              />
            )}
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-secondary">
              <Truck className="size-3.5" aria-hidden />
              Fornecedor já parametrizado abre a parametrização existente.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
