// Criação manual do pedido de compra (C-05, RF-001..RF-004).
//
// Duas chamadas, nunca uma JAVASCRIPT aninhada (D-007): `api.cardCriar`
// (kbCardCriar, com a sessão — é o motor que dá ordem, texto de busca,
// movimento inicial e automação de "card criado") e, com o id devolvido,
// `sgcEscPedidoCriar`, que grava a capa em SGC_PEDIDO.
//
// R-002/C-08: o seletor de fornecedor sai de `sgcFornecedorListar({ ativo: 1 })`
// — fornecedor inativo não é oferecido, e `sgcWintFornecedores` nunca aparece
// em tela de pedido. C-09: as filiais vêm de `sgcFornecedorCarregar`, a única
// fonte do que aquele fornecedor atende.
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useKanban } from '@benenutri/mitra-kanban';

import { linhas } from '@/lib/mitra-api';
import { usePersona } from '@/lib/persona';
import { instanteIso, periodoPadrao, PRIORIDADES, tituloDoPedido, validarNovoPedido } from '@/lib/pedido';
import { QUADRO_COMPRAS } from '@/lib/quadro';
import { DatePicker } from '@/components/DatePicker';
import {
  Alert, Button, Code, EmptyState, Field, PageHeader, Panel, PanelHeader, SelectMenu,
} from '@/components/page';

const ROTULO_PRIORIDADE: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

interface Opcao {
  value: string;
  label: string;
  hint?: string;
}

export default function NovoPedidoPage() {
  const navigate = useNavigate();
  const api = useKanban();
  const sessao = usePersona();

  const [fornecedores, setFornecedores] = React.useState<Opcao[]>([]);
  const [filiais, setFiliais] = React.useState<Opcao[]>([]);
  const [codfornec, setCodfornec] = React.useState('');
  const [codfilial, setCodfilial] = React.useState('');
  const [periodo, setPeriodo] = React.useState(periodoPadrao);
  const [prioridade, setPrioridade] = React.useState<string>(PRIORIDADES[0]);
  const [erros, setErros] = React.useState<ReturnType<typeof validarNovoPedido>['erros']>({});
  const [falha, setFalha] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);

  React.useEffect(() => {
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
  }, []);

  // C-09: a filial só abre depois do fornecedor escolhido, e lista o que ele atende.
  React.useEffect(() => {
    if (!codfornec) return;
    let vivo = true;
    linhas('sgcFornecedorCarregar', { codfornec: Number(codfornec) }).then(
      (registros) => {
        if (!vivo) return;
        setFiliais(registros
          .filter((registro) => registro.CODFILIAL !== undefined && registro.CODFILIAL !== null)
          .map((registro) => ({ value: String(registro.CODFILIAL), label: String(registro.FILIAL ?? registro.CODFILIAL) })));
      },
      () => {
        if (vivo) setFiliais([]);
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
  }

  const nomeFornecedor = fornecedores.find((item) => item.value === codfornec)?.label ?? '';
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
        agora: instanteIso(),
      });
      navigate(`/quadro?card=${criado.id}`);
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : 'Não foi possível criar o pedido.');
    } finally {
      setGravando(false);
    }
  }

  if (!sessao) return <EmptyState title="Carregando..." />;

  if (!sessao.permissoes.criarPedido) {
    return (
      <>
        <PageHeader module="Compras" title="Novo pedido" />
        <Alert tone="error">Seu perfil não cria pedidos de compra.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        module="Compras"
        title="Novo pedido"
        description="O pedido nasce na Análise/Montagem, com você como criadora e responsável."
        actions={
          <>
            <Button onClick={() => navigate('/quadro')} disabled={gravando}>Voltar</Button>
            <Button variant="primary" onClick={criar} disabled={gravando}>
              {gravando ? 'Criando...' : 'Criar pedido'}
            </Button>
          </>
        }
      />

      {falha ? <Alert tone="error" className="mb-4">{falha}</Alert> : null}
      {!fornecedores.length ? (
        <Alert tone="warn" className="mb-4">
          Nenhum fornecedor parametrizado ainda. Cadastre o fornecedor em Fornecedores antes de criar o pedido.
        </Alert>
      ) : null}

      <Panel>
        <PanelHeader title="Pedido" hint="Fornecedor, filial e período de vendas são obrigatórios." />
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <Field label="Fornecedor" obrigatorio hint={erros.fornecedor}>
            <SelectMenu
              label="Fornecedor do pedido"
              value={codfornec}
              onChange={escolherFornecedor}
              options={fornecedores}
              placeholder={fornecedores.length ? 'Escolha o fornecedor' : 'Nenhum fornecedor ativo'}
              disabled={!fornecedores.length}
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
            <div className="flex h-9 items-center rounded-xl border border-input bg-muted px-3">
              <Code>{titulo.trim() === '·' ? 'FILIAL · FORNECEDOR' : titulo}</Code>
            </div>
          </Field>
        </div>
      </Panel>
    </>
  );
}
