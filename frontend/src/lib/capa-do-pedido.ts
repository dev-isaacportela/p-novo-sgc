// A capa que abre o card em toda fase depois da Análise (R-141, C-046 da
// 002): o mesmo que o SGC legado mostra na coluna da esquerda
// (PipeWorkspace.tsx:8603-8720) — fornecedor, filial, valor, % faturado e os
// selos de quem aprovou, de quando saiu para a indústria e do cancelamento.
// Puro: lê só a capa que `sgcPedidoCarregar` já traz (`P.*`), sem SF nova.
// Testado em tests/capa-do-pedido.test.mjs.
import { fmtData, fmtDataHora } from './formato.ts';

export interface CapaDoResumo {
  vlTotal: number;
  vlFaturado: number;
  percFaturadoValor: number;
  tecEm: string;
  tecNome: string;
  tecMotivo: string;
  dirEm: string;
  dirNome: string;
  dirMotivo: string;
  dtEnvio: string;
  canal: string;
  emailEnvio: string;
  numped: string;
  envioNome: string;
  cancMotivo: string;
  cancEm: string;
  cancNome: string;
}

export type TomDoSelo = 'live' | 'attention' | 'alert' | 'neutral';

export interface SeloDoPedido {
  chave: 'tecnica' | 'diretoria' | 'envio' | 'reprovacao' | 'cancelado';
  titulo: string;
  texto: string;
  tom: TomDoSelo;
}

const preenchido = (valor: unknown) => String(valor ?? '').trim() !== '';
const numero = (valor: unknown) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);
const porQuem = (nome: string, em: string) =>
  [preenchido(nome) ? `por ${nome}` : '', preenchido(em) ? `em ${fmtDataHora(em)}` : ''].filter(Boolean).join(' ');

/** Texto do canal do envio, como o legado escreve no card Enviado (PW:10776-10795). */
export function textoDoEnvio(capa: Pick<CapaDoResumo, 'dtEnvio' | 'canal' | 'emailEnvio' | 'numped'>): string {
  const canal = capa.canal === 'plataforma'
    ? 'pela plataforma do fornecedor'
    : preenchido(capa.emailEnvio) ? `por e-mail para ${capa.emailEnvio}` : 'por e-mail';
  const pedido = preenchido(capa.numped) ? ` · pedido nº ${capa.numped}` : '';
  return `${fmtData(capa.dtEnvio)} ${canal}${pedido}`;
}

/**
 * Os selos, na ordem em que aconteceram. Aprovação só conta com a data
 * preenchida E sem motivo de reprovação (a reprovação zera a data no
 * servidor); a reprovação que ainda estiver na capa aparece como alerta.
 */
export function selosDoPedido(capa: CapaDoResumo): SeloDoPedido[] {
  const selos: SeloDoPedido[] = [];
  if (preenchido(capa.tecEm) && !preenchido(capa.tecMotivo)) {
    selos.push({ chave: 'tecnica', titulo: 'Aprovação técnica', texto: porQuem(capa.tecNome, capa.tecEm), tom: 'live' });
  }
  if (preenchido(capa.dirEm) && !preenchido(capa.dirMotivo)) {
    selos.push({ chave: 'diretoria', titulo: 'Aprovado pela diretoria', texto: porQuem(capa.dirNome, capa.dirEm), tom: 'live' });
  }
  // RN-KAN-42 do legado: só uma reprovação ativa, a da diretoria primeiro.
  const reprovacao = preenchido(capa.dirMotivo) ? { de: 'Reprovado pela diretoria', motivo: capa.dirMotivo }
    : preenchido(capa.tecMotivo) ? { de: 'Reprovação técnica', motivo: capa.tecMotivo } : null;
  if (reprovacao) selos.push({ chave: 'reprovacao', titulo: reprovacao.de, texto: reprovacao.motivo, tom: 'alert' });
  if (preenchido(capa.dtEnvio)) {
    const quem = preenchido(capa.envioNome) ? ` · registrado por ${capa.envioNome}` : '';
    selos.push({ chave: 'envio', titulo: 'Enviado à indústria', texto: `${textoDoEnvio(capa)}${quem}`, tom: 'neutral' });
  }
  if (preenchido(capa.cancMotivo)) {
    const quem = porQuem(capa.cancNome, capa.cancEm);
    selos.push({ chave: 'cancelado', titulo: 'Compra cancelada', texto: quem ? `${capa.cancMotivo} — ${quem}` : capa.cancMotivo, tom: 'alert' });
  }
  return selos;
}

/**
 * O faturado do topo: percentual em valor (o que o cron e a aba gravam em
 * `PERC_FATURADO_VALOR`), limitado a 0–100 para a barra, e quanto falta.
 * A régua de conclusão não muda aqui (P-6 do levantamento).
 */
export function faturadoDoPedido(capa: Pick<CapaDoResumo, 'vlTotal' | 'vlFaturado' | 'percFaturadoValor'>): {
  pct: number;
  pctBarra: number;
  falta: number;
} {
  const vlTotal = numero(capa.vlTotal);
  const vlFaturado = numero(capa.vlFaturado);
  const pct = numero(capa.percFaturadoValor) || (vlTotal > 0 ? (vlFaturado / vlTotal) * 100 : 0);
  return { pct, pctBarra: Math.max(0, Math.min(100, pct)), falta: Math.max(0, vlTotal - vlFaturado) };
}

/** `12,5 %` — uma casa, vírgula, como o legado mostra o faturado (`toFixed(1)`). */
export function rotuloPercentual(pct: number): string {
  return `${numero(pct).toFixed(1).replace('.', ',')} %`;
}
