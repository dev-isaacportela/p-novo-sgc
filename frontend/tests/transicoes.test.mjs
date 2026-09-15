// Spec 002 — a tabela de transições e os motivos de recusa
// (`src/lib/transicoes.ts`), o espelho de tela da SQL `sgcPodeMover`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FASES, MOTIVOS, TRANSICOES, motivoDeDestino, motivoDeExcluir } from '../src/lib/transicoes.ts';

const LIVRE = {
  souCriador: true,
  temMotivoCancelamento: true,
  temMotivoTecnico: true,
  temMotivoDiretoria: true,
  envioRegistrado: true,
};
const CRU = {
  souCriador: true,
  temMotivoCancelamento: false,
  temMotivoTecnico: false,
  temMotivoDiretoria: false,
  envioRegistrado: false,
};

test('RN-003: a tabela devolve exatamente 22 pares liberados — 14 do fluxo e 8 para Canceladas', () => {
  const pares = FASES.flatMap((origem) => TRANSICOES[origem].map((destino) => `${origem}>${destino}`));
  assert.equal(pares.length, 22);
  assert.equal(pares.filter((par) => par.endsWith('>cancelado')).length, 8);
  assert.equal(pares.filter((par) => !par.endsWith('>cancelado')).length, 14);
  assert.equal(new Set(pares).size, 22, 'nenhum par repetido');
});

test('RN-004 / C-005: da Análise para a Diretoria nunca, com a mensagem de F-04', () => {
  assert.equal(motivoDeDestino('gestor', 'MEMBER', 'analise', 'diretoria', LIVRE), MOTIVOS.semTecnica);
  assert.equal(motivoDeDestino('gestor', 'MEMBER', 'analise', 'tecnica', LIVRE), null);
  // Qualquer outro par fora da tabela tem a frase genérica, não a de F-04.
  assert.equal(motivoDeDestino('gestor', 'MEMBER', 'analise', 'envio', LIVRE), MOTIVOS.semTransicao);
});

test('RN-005: 5 personas x 10 fases — a diretoria só movimenta na fase dela e o comercial em nenhuma', () => {
  for (const origem of FASES) {
    const livresDiretoria = FASES.filter((destino) => motivoDeDestino('diretoria', 'MEMBER', origem, destino, LIVRE) === null);
    if (origem === 'diretoria') assert.deepEqual(livresDiretoria.sort(), [...TRANSICOES.diretoria].sort());
    else assert.deepEqual(livresDiretoria, [], `diretoria não movimenta a partir de ${origem}`);

    for (const destino of FASES) {
      assert.equal(motivoDeDestino('comercial', 'MEMBER', origem, destino, LIVRE), MOTIVOS.comercial);
    }
    for (const persona of ['admin', 'analista', 'gestor']) {
      const livres = FASES.filter((destino) => motivoDeDestino(persona, 'MEMBER', origem, destino, LIVRE) === null);
      assert.deepEqual(livres.sort(), [...TRANSICOES[origem]].sort(), `${persona} a partir de ${origem}`);
    }
  }
});

test('RN-008 / C-026: Compras Concluídas e Compras Canceladas não têm saída para nenhuma persona', () => {
  assert.equal(TRANSICOES.concluido.length, 0);
  assert.equal(TRANSICOES.cancelado.length, 0);
  for (const persona of ['admin', 'analista', 'gestor', 'diretoria', 'comercial']) {
    for (const origem of ['concluido', 'cancelado']) {
      for (const destino of FASES) {
        assert.ok(motivoDeDestino(persona, 'MEMBER', origem, destino, LIVRE) !== null, `${persona} ${origem}>${destino}`);
      }
    }
  }
});

test('C-008: acesso somente leitura fecha os 100 pares com "Seu acesso é somente leitura."', () => {
  let fechados = 0;
  for (const origem of FASES) {
    for (const destino of FASES) {
      assert.equal(motivoDeDestino('gestor', 'READ_ONLY', origem, destino, LIVRE), MOTIVOS.leitura);
      fechados += 1;
    }
  }
  assert.equal(fechados, 100);
  assert.equal(motivoDeExcluir('gestor', 'READ_ONLY', { souCriador: true }), MOTIVOS.leitura);
});

test('C-009: acesso restrito opera só os próprios pedidos', () => {
  assert.equal(motivoDeDestino('gestor', 'RESTRICTED', 'analise', 'tecnica', { ...LIVRE, souCriador: false }), MOTIVOS.restrito);
  assert.equal(motivoDeDestino('gestor', 'RESTRICTED', 'analise', 'tecnica', LIVRE), null);
});

test('C-023 / RN-006: Compras Canceladas aparece desabilitada nas 8 fases ativas enquanto não há motivo', () => {
  const ativas = FASES.filter((fase) => TRANSICOES[fase].includes('cancelado'));
  assert.equal(ativas.length, 8);
  for (const origem of ativas) {
    assert.equal(motivoDeDestino('gestor', 'MEMBER', origem, 'cancelado', CRU), MOTIVOS.cancelar);
    assert.equal(motivoDeDestino('gestor', 'MEMBER', origem, 'cancelado', LIVRE), null, 'com motivo gravado, libera');
  }
});

test('C-017 / C-029: devolver para a Análise pede a ação Reprovar, e Enviado pede o envio registrado', () => {
  assert.equal(motivoDeDestino('gestor', 'MEMBER', 'tecnica', 'analise', CRU), MOTIVOS.reprovar);
  assert.equal(motivoDeDestino('diretoria', 'MEMBER', 'diretoria', 'analise', CRU), MOTIVOS.reprovar);
  assert.equal(motivoDeDestino('gestor', 'MEMBER', 'envio', 'enviado', CRU), MOTIVOS.envio);
  assert.equal(motivoDeDestino('gestor', 'MEMBER', 'envio', 'enviado', LIVRE), null);
});

test('RN-015: motivoDeExcluir espelha o gancho — admin, gestor e diretoria excluem; analista vê o motivo', () => {
  assert.equal(motivoDeExcluir('admin', 'ADMIN', { souCriador: false }), null);
  assert.equal(motivoDeExcluir('gestor', 'MEMBER', { souCriador: false }), null);
  assert.equal(motivoDeExcluir('diretoria', 'MEMBER', { souCriador: false }), null);
  assert.equal(motivoDeExcluir('analista', 'MEMBER', { souCriador: true }), MOTIVOS.excluir);
  assert.equal(motivoDeExcluir('comercial', 'MEMBER', { souCriador: true }), MOTIVOS.comercial);
});
