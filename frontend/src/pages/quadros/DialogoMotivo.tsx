// Diálogo de decisão com motivo obrigatório: reprovação técnica (com os
// produtos reprovados), reprovação da diretoria e cancelamento da compra.
//
// RN-009 / RF-019: a recusa por motivo vazio é da regra pura (`validarMotivo`)
// e também do `WHERE` da escrita — aqui só se mostra o erro onde o olho já está.
// §9.5: cabeçalho e rodapé parados, só o miolo rola.
import * as React from 'react';

import { validarMotivo } from '@/lib/pedido';
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, LabelledField, Input, Textarea,
} from '@/components/page';

export interface DialogoMotivoProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao: string;
  rotulo: string;
  rotuloConfirmar: string;
  /** Reprovação técnica (AT-03): os códigos dos produtos reprovados. */
  comProdutos?: boolean;
  onConfirmar: (dados: { motivo: string; produtos: string }) => Promise<void>;
}

export default function DialogoMotivo({
  aberto, onFechar, titulo, descricao, rotulo, rotuloConfirmar, comProdutos, onConfirmar,
}: DialogoMotivoProps) {
  const [motivo, setMotivo] = React.useState('');
  const [produtos, setProdutos] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);

  // Abrir o diálogo limpa o formulário. Ajuste de estado durante a renderização
  // (o mesmo padrão do DatePicker), não em efeito: efeito aqui seria um
  // "cascading render" que só espelha uma prop.
  const [ultimoAberto, setUltimoAberto] = React.useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setMotivo('');
      setProdutos('');
      setErro(null);
    }
  }

  async function confirmar() {
    const problema = validarMotivo(motivo);
    if (problema) {
      setErro(problema);
      return;
    }
    setGravando(true);
    try {
      await onConfirmar({ motivo: motivo.trim(), produtos: produtos.trim() });
      onFechar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível gravar.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <LabelledField
            label={rotulo}
            obrigatorio
            hint={erro ?? undefined}
            hintTone="error"
          >
            <Textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              rows={4}
              placeholder="Escreva o motivo para quem vai receber o pedido de volta."
            />
          </LabelledField>
          {comProdutos ? (
            <>
              <LabelledField
                label="Produtos reprovados"
                hint="Códigos separados por vírgula, como 1024,2088."
              >
                <Input
                  value={produtos}
                  onChange={(evento) => setProdutos(evento.target.value)}
                  placeholder="1024,2088"
                  inputMode="numeric"
                />
              </LabelledField>
              {/* A lista de itens para marcar é da spec 003: quando ela entrar,
                  este campo vira a seleção dos produtos do pedido. */}
              <Alert tone="info">
                A marcação item a item chega com a aba Itens; por enquanto, informe os códigos.
              </Alert>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onFechar} disabled={gravando}>Voltar</Button>
          <Button variant="primary" onClick={confirmar} disabled={gravando}>
            {gravando ? 'Gravando...' : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
