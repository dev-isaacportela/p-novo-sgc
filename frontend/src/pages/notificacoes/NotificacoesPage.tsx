// O que aconteceu nos meus pedidos: responsável novo, pedido movido e mensagem
// nova de outra pessoa (UI-07 B, RF-029).
//
// D-015: o feed sai de uma SQL sobre KB_LOG, KB_MOVIMENTO e KB_MENSAGEM — sem
// tabela, escrita ou gatilho novo. RNF-003: paginado em 25, com o total.
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { linha, linhas } from '@/lib/mitra-api';
import { fmtDataHora } from '@/lib/formato';
import {
  Badge, EmptyState, PageHeader, Pagination, Panel, PanelHeader,
  RowMeta, RowTitle, Table, Td, Th, Tr,
} from '@/components/page';

const POR_PAGINA = 25;

const ROTULO: Record<string, { texto: string; tom: 'neutral' | 'accent' | 'attention' }> = {
  responsavel: { texto: 'Responsável', tom: 'accent' },
  movimento: { texto: 'Etapa', tom: 'neutral' },
  mensagem: { texto: 'Mensagem', tom: 'attention' },
};

interface Notificacao {
  TIPO: string;
  CARD_ID: number;
  TITULO: string;
  QUEM: string;
  TEXTO: string;
  QUANDO: string;
}

export default function NotificacoesPage() {
  const navigate = useNavigate();
  const [itens, setItens] = React.useState<Notificacao[]>([]);
  const [total, setTotal] = React.useState(0);
  const [pagina, setPagina] = React.useState(1);
  const [carregando, setCarregando] = React.useState(true);

  React.useEffect(() => {
    let vivo = true;
    Promise.all([
      linhas('sgcNotificacoesListar', { limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
      linha('sgcNotificacoesListarTotal'),
    ]).then(
      ([registros, contagem]) => {
        if (!vivo) return;
        setItens(registros as unknown as Notificacao[]);
        setTotal(Number(contagem?.TOTAL ?? 0));
        setCarregando(false);
      },
      () => {
        if (vivo) setCarregando(false);
      },
    );
    return () => {
      vivo = false;
    };
  }, [pagina]);

  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));
  // Trocar de página é evento, não efeito: o "carregando" liga no clique.
  const irPara = (proxima: number) => {
    setCarregando(true);
    setPagina(proxima);
  };

  return (
    <>
      <PageHeader
        module="Compras"
        title="Notificações"
        description="O que outras pessoas fizeram nos pedidos em que você é responsável."
      />
      <Panel>
        <PanelHeader title="Últimas novidades" hint="Da mais recente para a mais antiga." />
        {itens.length === 0 && !carregando ? (
          <EmptyState title="Tudo em dia" hint="Nada aconteceu nos seus pedidos desde a última vez." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Pedido</Th>
                <Th>Quem</Th>
                <Th>Quando</Th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, indice) => {
                const rotulo = ROTULO[item.TIPO] ?? { texto: item.TIPO, tom: 'neutral' as const };
                return (
                  <Tr key={`${item.TIPO}-${item.CARD_ID}-${item.QUANDO}-${indice}`}>
                    <Td><Badge tone={rotulo.tom}>{rotulo.texto}</Badge></Td>
                    <Td>
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => navigate(`/quadro?card=${item.CARD_ID}`)}
                      >
                        <RowTitle>{item.TITULO}</RowTitle>
                        <RowMeta>{item.TEXTO}</RowMeta>
                      </button>
                    </Td>
                    <Td>{item.QUEM}</Td>
                    <Td>{fmtDataHora(item.QUANDO)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {total > 0 ? (
          <Pagination
            page={pagina}
            lastPage={ultimaPagina}
            total={total}
            unit="novidades"
            busy={carregando}
            onPrevious={() => irPara(Math.max(1, pagina - 1))}
            onNext={() => irPara(Math.min(ultimaPagina, pagina + 1))}
          />
        ) : null}
      </Panel>
    </>
  );
}
