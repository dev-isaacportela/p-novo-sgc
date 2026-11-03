// C-004 / C-005: cadastrar pregão — edital único, órgão escolhido na busca de
// clientes do ERP (2 letras ou o código), fim da vigência. O `NOT EXISTS` da
// escrita recusa o edital repetido; a tela confere antes para dar a frase.
import * as React from 'react';

import { linhas } from '@/lib/mitra-api';
import { instanteIso } from '@/lib/pedido';
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Field, Input, LabelledField, SearchInput,
} from '@/components/page';
import { DatePicker } from '@/components/DatePicker';

const EDITAL_REPETIDO = 'Já existe um pregão com este edital';

interface Orgao { CODCLI: number; CLIENTE: string; CNPJ: string; CODATV1: number; RAMO: string }

export default function DialogoPregao({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: (idPregao: number) => void }) {
  const [edital, setEdital] = React.useState('');
  const [busca, setBusca] = React.useState('');
  const [orgaos, setOrgaos] = React.useState<Orgao[]>([]);
  const [orgao, setOrgao] = React.useState<Orgao | null>(null);
  const [vigencia, setVigencia] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);

  const [ultimoAberto, setUltimoAberto] = React.useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setEdital(''); setBusca(''); setOrgaos([]); setOrgao(null); setVigencia(''); setErro(null);
    }
  }

  React.useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2 && !/^\d+$/.test(termo)) return undefined;
    let vivo = true;
    const espera = window.setTimeout(() => {
      const codcli = /^\d+$/.test(termo) ? Number(termo) : 0;
      linhas('sgcWintEmpClientes', { codcli, busca: codcli ? '' : termo }).then((rows) => vivo && setOrgaos(rows as Orgao[])).catch(() => vivo && setOrgaos([]));
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [busca]);

  async function criar() {
    const codigo = edital.trim();
    if (!codigo || !orgao) return setErro('Informe o edital e escolha o órgão.');
    setGravando(true);
    setErro(null);
    try {
      const mesmo = (rows: Record<string, unknown>[]) => rows.find((r) => String(r.CODIGO_EDITAL).trim().toUpperCase() === codigo.toUpperCase());
      if (mesmo(await linhas('sgcEmpPregoesListar', { busca: codigo, limite: 50, offset: 0 }))) return setErro(EDITAL_REPETIDO);
      await linhas('sgcEscEmpPregaoCriar', { codigoEdital: codigo, orgao: orgao.CLIENTE, codcli: orgao.CODCLI, vigenciaFim: vigencia, agora: instanteIso() });
      const criado = mesmo(await linhas('sgcEmpPregoesListar', { busca: codigo, limite: 50, offset: 0 }));
      if (!criado) throw new Error('O pregão não foi gravado: seu perfil não cadastra pregão.');
      onCriado(Number(criado.ID));
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível cadastrar o pregão.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(estaAberto) => !estaAberto && !gravando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo pregão</DialogTitle>
          <DialogDescription>O pregão nasce ativo, com o órgão do ERP, e já fica escolhido no empenho.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            {erro ? <Alert tone="error">{erro}</Alert> : null}
            <LabelledField label="Edital" obrigatorio><Input value={edital} onChange={(e) => setEdital(e.target.value)} placeholder="PE 12/2026" /></LabelledField>
            <Field label="Órgão (cliente do ERP)" obrigatorio hint={orgao ? `${orgao.CODCLI} — ${orgao.CLIENTE} · ${orgao.RAMO || 'sem ramo'}` : 'Código ou 2 letras do nome; órgãos públicos primeiro.'}>
              <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar órgão" />
              {orgaos.length && !orgao ? (
                <ul className="mt-1 max-h-48 overflow-auto rounded-xl border border-rule-row">
                  {orgaos.map((o) => (
                    <li key={o.CODCLI} className="border-b border-rule-row last:border-b-0">
                      <button type="button" className="w-full px-3 py-2 text-left text-[13px] hover:bg-accent" onClick={() => setOrgao(o)}>
                        <span className="font-semibold text-ink">{o.CODCLI} — {o.CLIENTE}</span>
                        <span className="block text-[12px] text-ink-secondary">{o.RAMO || 'sem ramo'} · {o.CNPJ}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {orgao ? <Button size="sm" variant="ghost" onClick={() => setOrgao(null)}>Trocar órgão</Button> : null}
            </Field>
            <Field label="Fim da vigência"><DatePicker value={vigencia} onChange={setVigencia} aria-label="Fim da vigência" /></Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={gravando}>Voltar</Button>
          <Button variant="primary" onClick={criar} disabled={gravando || !edital.trim() || !orgao}>{gravando ? 'Gravando...' : 'Cadastrar pregão'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
