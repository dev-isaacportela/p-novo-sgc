// Criação manual do pedido de compra (C-05, RF-001..RF-004), numa janela sobre
// o quadro (C-036 revisado, R-118 do 000): o botão "Novo pedido" do quadro é
// o único caminho — o item de menu e a página /pedidos/novo saíram.
//
// Duas chamadas, nunca uma JAVASCRIPT aninhada (D-007): `api.cardCriar`
// (kbCardCriar, com a sessão — é o motor que dá ordem, texto de busca,
// movimento inicial e automação de "card criado") e, com o id devolvido,
// `sgcEscPedidoCriar`, que grava a capa em SGC_PEDIDO.
//
// R-002/C-08: o seletor de fornecedor sai de `sgcFornecedorListar({ ativo: 1 })`
// — fornecedor inativo não é oferecido, e `sgcWintFornecedores` nunca aparece
// em tela de pedido. C-09: as filiais vêm de `sgcFornecedorCarregar`, a única
// fonte do que aquele fornecedor atende — é uma server function JAVASCRIPT, que
// devolve `{ fornecedor, filiais, contatos… }`, e por isso se chama com `acao`,
// não com `linhas` (que devolveria `[]` e deixaria a filial vazia para sempre).
//
// Orçamento de execuções: os fornecedores só são carregados quando a janela
// abre (1), e as filiais quando o fornecedor é escolhido (1). Fechar zera tudo.
import * as React from 'react';
import { useKanban } from '@benenutri/mitra-kanban';

import { acao, linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { instanteIso, periodoPadrao, PRIORIDADES, tituloDoPedido, validarNovoPedido } from '@/lib/pedido';
import { QUADRO_COMPRAS } from '@/lib/quadro';
import { DatePicker } from '@/components/DatePicker';
import {
  Alert, Button, Code, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, Field, SelectMenu,
} from '@/components/page';

const ROTULO_PRIORIDADE: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

type Registro = Record<string, unknown>;

interface Opcao {
  value: string;
  label: string;
  hint?: string;
}

export function NovoPedidoDialogo({
  aberto,
  onFechar,
  onCriado,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriado: (cardId: number) => void;
}) {
  const api = useKanban();
  const sessao = usePersona();

  const [fornecedores, setFornecedores] = React.useState<Opcao[] | null>(null);
  const [filiais, setFiliais] = React.useState<Opcao[]>([]);
  const [codfornec, setCodfornec] = React.useState('');
  const [codfilial, setCodfilial] = React.useState('');
  const [periodo, setPeriodo] = React.useState(periodoPadrao);
  const [prioridade, setPrioridade] = React.useState<string>(PRIORIDADES[0]);
  const [erros, setErros] = React.useState<ReturnType<typeof validarNovoPedido>['erros']>({});
  const [falha, setFalha] = React.useState<string | null>(null);
  const [semParametro, setSemParametro] = React.useState(false);
  const [gravando, setGravando] = React.useState(false);

  // Fechou: a janela volta ao zero — ajuste de estado durante a renderização,
  // não em efeito.
  const [estavaAberto, setEstavaAberto] = React.useState(aberto);
  if (estavaAberto !== aberto) {
    setEstavaAberto(aberto);
    if (!aberto) {
      setFornecedores(null);
      setFiliais([]);
      setCodfornec('');
      setCodfilial('');
      setPeriodo(periodoPadrao());
      setPrioridade(PRIORIDADES[0]);
      setErros({});
      setFalha(null);
      setSemParametro(false);
    }
  }

  // Os fornecedores só quando a janela abre.
  React.useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    linhas('sgcFornecedorListar', { busca: '', ativo: 1, limite: 200, offset: 0 }).then(
      (registros) => {
        if (!vivo) return;
        setFornecedores(registros.map((registro) => ({
          value: String(registro.CODFORNEC),
          label: String(registro.FORNECEDOR ?? ''),
          hint: String(registro.CNPJ_FORMATADO ?? ''),
        })));
      },
      () => {
        if (vivo) setFornecedores([]);
      },
    );
    return () => {
      vivo = false;
    };
  }, [aberto]);

  // C-09: a filial só abre depois do fornecedor escolhido, e lista o que ele
  // atende. Fornecedor sem parametrização devolve `fornecedor: null` — aí não
  // há filial nenhuma e o pedido não pode nascer.
  React.useEffect(() => {
    if (!codfornec) return;
    let vivo = true;
    acao('sgcFornecedorCarregar', { codfornec: Number(codfornec) }).then(
      (dados) => {
        if (!vivo) return;
        const parametrizado = Boolean(dados.fornecedor);
        const registros: Registro[] = Array.isArray(dados.filiais) ? dados.filiais : [];
        setSemParametro(!parametrizado);
        setFiliais(registros
          .filter((registro) => registro.CODFILIAL !== undefined && registro.CODFILIAL !== null)
          .map((registro) => ({ value: String(registro.CODFILIAL), label: String(registro.FILIAL ?? registro.CODFILIAL) })));
      },
      () => {
        if (!vivo) return;
        setFiliais([]);
        setSemParametro(true);
      },
    );
    return () => {
      vivo = false;
    };
  }, [codfornec]);

  function escolherFornecedor(valor: string) {
    setCodfornec(valor);
    setCodfilial('');
    setFiliais([]);
    setSemParametro(false);
  }

  const lista = fornecedores ?? [];
  const nomeFornecedor = lista.find((item) => item.value === codfornec)?.label ?? '';
  const nomeFilial = filiais.find((item) => item.value === codfilial)?.label ?? '';
  const titulo = tituloDoPedido(nomeFilial, nomeFornecedor);

  async function criar() {
    const validacao = validarNovoPedido({ codfornec, codfilial, inicio: periodo.inicio, fim: periodo.fim });
    setErros(validacao.erros);
    setFalha(null);
    if (!validacao.ok) return;

    setGravando(true);
    try {
      // R-009/D-010: a prioridade nasce aqui e só vive no campo do quadro.
      const criado = await api.cardCriar({
        boardId: (await api.boardCarregar({ slug: QUADRO_COMPRAS })).board.id,
        titulo,
        valores: { fornecedor: nomeFornecedor, filial: nomeFilial, prioridade },
        responsaveisIds: sessao?.usuarioId ? [sessao.usuarioId] : [],
      });
      if (!criado.ok || !criado.id) throw new Error(criado.error || 'O pedido não foi criado.');

      await linhas('sgcEscPedidoCriar', {
        cardId: criado.id,
        codfornec: Number(codfornec),
        fornecedor: nomeFornecedor,
        codfilial,
        filial: nomeFilial,
        periodoInicio: periodo.inicio,
        periodoFim: periodo.fim,
        // Lista fechada de `sgcEscPedidoCriar` (R-098/R-106): esta janela cria
        // sempre pedido manual; o carrinho de /compras-inteligentes manda
        // 'compras_inteligentes'.
        origem: 'manual',
        agora: instanteIso(),
      });
      onCriado(criado.id);
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : 'Não foi possível criar o pedido.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(estaAberto) => !estaAberto && !gravando && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo pedido</DialogTitle>
          <DialogDescription>O pedido nasce na Análise/Montagem, com você como criadora e responsável.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {falha ? <Alert tone="error">{falha}</Alert> : null}
            {fornecedores !== null && fornecedores.length === 0 ? (
              <Alert tone="warn">
                Nenhum fornecedor parametrizado ainda. Cadastre o fornecedor em Fornecedores antes de criar o pedido.
              </Alert>
            ) : null}
            {semParametro ? (
              <Alert tone="warn">
                Este fornecedor ainda não tem parametrização (filiais e contatos). Cadastre em Fornecedores antes de criar o pedido.
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fornecedor" obrigatorio hint={erros.fornecedor}>
                <SelectMenu
                  label="Fornecedor do pedido"
                  value={codfornec}
                  onChange={escolherFornecedor}
                  options={lista}
                  placeholder={fornecedores === null ? 'Carregando...' : lista.length ? 'Escolha o fornecedor' : 'Nenhum fornecedor ativo'}
                  disabled={!lista.length}
                />
              </Field>
              <Field label="Filial" obrigatorio hint={erros.filial}>
                <SelectMenu
                  label="Filial atendida"
                  value={codfilial}
                  onChange={setCodfilial}
                  options={filiais}
                  placeholder={codfornec ? 'Escolha a filial' : 'Escolha o fornecedor primeiro'}
                  disabled={!codfornec || !filiais.length}
                />
              </Field>
              <Field label="Início do período de vendas" obrigatorio hint={erros.periodo}>
                <DatePicker
                  value={periodo.inicio}
                  onChange={(valor) => setPeriodo((atual) => ({ ...atual, inicio: valor }))}
                  aria-label="Início do período de vendas"
                />
              </Field>
              <Field label="Fim do período de vendas" obrigatorio>
                <DatePicker
                  value={periodo.fim}
                  onChange={(valor) => setPeriodo((atual) => ({ ...atual, fim: valor }))}
                  aria-label="Fim do período de vendas"
                />
              </Field>
              <Field label="Prioridade">
                <SelectMenu
                  label="Prioridade do pedido"
                  value={prioridade}
                  onChange={setPrioridade}
                  options={PRIORIDADES.map((valor) => ({ value: valor, label: ROTULO_PRIORIDADE[valor] }))}
                />
              </Field>
              <Field label="Título do pedido" hint="Gerado a partir da filial e do fornecedor; não é editável.">
                <div
                  className="flex h-9 min-w-0 items-center overflow-hidden rounded-xl border border-input bg-muted px-3"
                  title={titulo.trim() === '·' ? undefined : titulo}
                >
                  <span className="truncate"><Code>{titulo.trim() === '·' ? 'FILIAL · FORNECEDOR' : titulo}</Code></span>
                </div>
              </Field>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={gravando}>Cancelar</Button>
          <Button variant="primary" onClick={() => void criar()} disabled={gravando || semParametro}>
            {gravando ? 'Criando...' : 'Criar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
