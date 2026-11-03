// Spec 013 — o rastro de um lote vencido (RF-018, C-037): o cabeçalho com o
// que a lista já trouxe (sem consulta) e a linha do tempo em todas as filiais,
// numa chamada ao abrir. A remessa de entrega futura aparece marcada, nunca
// como uma segunda venda (P-02).
import * as React from 'react';
import {
  Alert, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, GradeMini, MiniCartao,
  RowMeta, Status, Table, Td, Th, Tr,
} from '@/components/page';
import { linhas } from '@/lib/mitra-api';
import { fmtData, moeda, numeroPt } from '@/lib/formato';
import { ehTransferencia, rotaTransferencia, rotuloOperacao } from '@/lib/movimentacao';
import { useCarga } from './carga';

type Linha = Record<string, unknown>;

export default function LoteHistoricoDialogo({ lote, onFechar }: { lote: Linha; onFechar: () => void }) {
  const carregar = React.useCallback(
    () => linhas('sgcWintMovLoteHistorico', { codprod: Number(lote.CODPROD), numlote: String(lote.NUMLOTE ?? ''), limite: 300 }),
    [lote],
  );
  const { dados, erro, carregando } = useCarga(carregar);
  const movimentos = dados ?? [];
  const texto = (v: unknown) => String(v ?? '');

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rastro do lote {texto(lote.NUMLOTE)}</DialogTitle>
          <DialogDescription>{texto(lote.DESCRICAO)} · cód. {texto(lote.CODPROD)} · perda na filial {texto(lote.CODFILIAL)}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <GradeMini colunas={4}>
            <MiniCartao rotulo="Entrou na empresa" valor={lote.DT_ENTRADA ? fmtData(texto(lote.DT_ENTRADA)) : <Dash />} hint={lote.FILIAL_ENTRADA ? `filial ${texto(lote.FILIAL_ENTRADA)}` : undefined} />
            <MiniCartao rotulo="Chegou nesta filial" valor={fmtData(texto(lote.DT_CHEGADA_FILIAL || lote.DT_ENTRADA)) || <Dash />} />
            <MiniCartao
              rotulo="Última venda"
              valor={lote.DT_ULT_VENDA ? fmtData(texto(lote.DT_ULT_VENDA)) : 'Nunca vendido'}
              tone={lote.DT_ULT_VENDA ? 'neutral' : 'attention'}
              hint={`${numeroPt(lote.QT_VENDIDA_FILIAL as number)} vendidos aqui`}
            />
            <MiniCartao rotulo="Venceu" valor={fmtData(texto(lote.DTVALIDADE))} hint={`${numeroPt(lote.QT_PERDIDA as number)} un. · ${moeda(lote.VALOR_PERDA as number)}`} />
          </GradeMini>
          {erro ? <Alert tone="error">Não foi possível ler o ERP: {erro}</Alert> : null}
          {carregando ? <Alert tone="info">Lendo os movimentos do lote…</Alert> : (
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Operação</Th>
                  <Th>Filial</Th>
                  <Th numeric>Quantidade</Th>
                  <Th>Nota / parte</Th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m, i) => {
                  const remessa = Number(m.REMESSA) === 1;
                  const transferencia = ehTransferencia(m.CODOPER);
                  const rota = m.CODOPER === 'ET'
                    ? rotaTransferencia(m.FILIAL_ORIGEM, m.CODFILIAL)
                    : rotaTransferencia(m.CODFILIAL, m.FILIAL_DESTINO);
                  return (
                    <Tr key={i}>
                      <Td>{fmtData(texto(m.DTMOV))}</Td>
                      <Td>
                        <Status tone={remessa ? 'off' : m.SENTIDO === 'ENTRADA' ? 'live' : 'attention'}>{rotuloOperacao(m.CODOPER, m.SENTIDO, remessa)}</Status>
                        {Number(m.CANCELADO) === 1 ? <RowMeta>cancelado</RowMeta> : null}
                      </Td>
                      <Td>{transferencia && rota ? rota : texto(m.CODFILIAL)}</Td>
                      <Td numeric>{numeroPt(m.QT as number)}</Td>
                      <Td>
                        {m.NUMNOTA ? `NF ${texto(m.NUMNOTA)}` : <Dash />}
                        <RowMeta>{texto(m.CLIENTE || m.FORNECEDOR) || '—'}</RowMeta>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
