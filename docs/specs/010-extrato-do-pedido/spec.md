# Spec: Extrato do pedido

**ID:** 010-extrato-do-pedido · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

O pedido de compra precisa circular fora do sistema: a aprovação em decisão às vezes é
colhida assinada em papel, o fornecedor pede o resumo por e-mail, a auditoria quer o
registro de uma decisão antiga, alguém arquiva o pedido concluído. Hoje isso vira print de
tela ou cópia manual dos dados — sem garantia de que reflete o que está gravado, sem a
marca de que o pedido ainda não foi aprovado, sem as linhas de assinatura, sem o prazo
negociado ao lado do padrão do fornecedor. Quando o print sai errado (mostra "aprovado"
para um pedido que só tem a data de uma aprovação técnica antiga, já devolvido pela
diretoria) o erro só aparece depois, com o papel já assinado.

## Resultado esperado

A partir de qualquer pedido aberto, em qualquer fase do processo, a pessoa gera num clique
um documento para imprimir (pela própria janela de impressão do navegador) e uma planilha
(CSV) com a fotografia fiel do pedido naquele instante: cabeçalho, prazo negociado, itens,
totais, decisões já tomadas e faturamento. O documento avisa sozinho quando o pedido ainda
não foi decidido (marca e linhas de assinatura) ou quando foi cancelado, sempre a partir da
fase em que o pedido está — nunca de uma data de aprovação antiga que ficou gravada.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista / gestor | tirar o extrato para colher assinatura, arquivar ou mandar ao fornecedor | ocasional, por pedido |
| admin | o mesmo, e conferir o documento de qualquer pedido | ocasional |
| diretoria | conferir a decisão impressa, auditar um pedido antigo | ocasional |

Qualquer pessoa com acesso ao quadro de compras tira o extrato de qualquer pedido, em
qualquer fase — o extrato não é uma decisão, é uma leitura. Quem não tem acesso ao quadro
(o comercial) não chega à tela.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — Marca e assinaturas nas fases de decisão**
- **Dado que** um pedido está na Análise, na Aprovação Técnica ou na Aprovação da Diretoria
- **Quando** a pessoa gera o extrato
- **Então** o documento traz a marca "NÃO APROVADO" em todas as páginas e três linhas de
  assinatura em branco: comprador responsável, aprovação técnica, aprovação da diretoria

**C-002 — A marca segue a fase, não uma data de aprovação antiga**
- **Dado que** um pedido já foi aprovado tecnicamente uma vez, a diretoria devolveu o
  pedido para a Análise, e a data daquela aprovação técnica continua gravada (nunca é
  apagada numa devolução)
- **Quando** a pessoa gera o extrato com o pedido de volta na Análise
- **Então** o documento ainda traz "NÃO APROVADO" e as três linhas de assinatura — a fase
  manda, não a data antiga

**C-003 — Marca de cancelamento**
- **Dado que** um pedido foi cancelado, com motivo registrado
- **Quando** a pessoa gera o extrato
- **Então** o documento traz a marca "CANCELADO", o motivo do cancelamento, e nenhuma linha
  de assinatura

**C-004 — Sem marca nas demais fases**
- **Dado que** um pedido está em Envio, Enviado, Trânsito, Faturamento, Produtos em B.O. ou
  Compras Concluídas
- **Quando** a pessoa gera o extrato
- **Então** o documento não traz marca nenhuma nem linha de assinatura

**C-005 — Prazo igual ao padrão do fornecedor**
- **Dado que** o prazo acordado no pedido é igual ao prazo padrão do fornecedor
- **Quando** a pessoa gera o extrato
- **Então** o documento mostra os dois prazos lado a lado, sem pedir justificativa

**C-006 — Prazo divergente, com justificativa**
- **Dado que** o prazo acordado diverge do padrão e a justificativa da diferença foi
  registrada
- **Quando** a pessoa gera o extrato
- **Então** o documento mostra os dois prazos, a diferença e o texto da justificativa

**C-007 — Prazo divergente, sem justificativa ainda**
- **Dado que** o prazo acordado diverge do padrão e o pedido ainda está na Análise, antes de
  a justificativa ser preenchida
- **Quando** a pessoa gera o extrato
- **Então** o documento mostra a diferença de prazo e deixa claro que a justificativa ainda
  não foi registrada — sem inventar um texto

**C-008 — Item sem quantidade fica fora**
- **Dado que** o pedido tem itens com quantidade pedida zerada (produtos que entraram na
  análise e saíram da lista final)
- **Quando** a pessoa gera o extrato
- **Então** só aparecem os itens com quantidade pedida maior que zero

**C-009 — Total do pedido**
- **Dado que** o pedido tem itens com quantidade e custo definidos
- **Quando** a pessoa gera o extrato
- **Então** o total mostrado é o mesmo total que a capa do pedido já exibe no quadro

**C-010 — Faturamento aparece quando há nota vinculada**
- **Dado que** o pedido já recebeu ao menos uma nota fiscal vinculada
- **Quando** a pessoa gera o extrato
- **Então** o documento traz a lista das notas (número, data, valor) e o percentual já
  faturado

**C-011 — Sem nota, sem seção de faturamento**
- **Dado que** o pedido ainda não tem nenhuma nota fiscal vinculada
- **Quando** a pessoa gera o extrato
- **Então** a seção de faturamento não aparece

**C-012 — Número do pedido no fornecedor só depois do envio**
- **Dado que** o pedido já foi enviado à indústria, com o número do pedido no fornecedor
  registrado
- **Quando** a pessoa gera o extrato
- **Então** o cabeçalho mostra esse número; num pedido que ainda não foi enviado, o campo
  não aparece preenchido

**C-013 — Pop-up bloqueado avisa em vez de falhar em silêncio**
- **Dado que** o navegador da pessoa está configurado para bloquear janelas novas
- **Quando** ela pede o extrato em PDF
- **Então** aparece um aviso explicando que é preciso permitir pop-ups para este site, e a
  tela continua normal — nada trava, nada some sem explicação

**C-014 — O CSV traz as mesmas linhas do PDF**
- **Dado que** o pedido tem itens com quantidade pedida
- **Quando** a pessoa baixa o extrato em CSV
- **Então** as linhas de item são exatamente as mesmas que aparecem no documento impresso,
  na mesma ordem

**C-015 — O nome do arquivo identifica o pedido**
- **Dado que** a pessoa gera o extrato de um pedido
- **Quando** o arquivo (PDF impresso ou CSV) é salvo
- **Então** o nome identifica de qual pedido se trata

**C-016 — A emissão mostra a hora de quem gerou o documento**
- **Dado que** a pessoa gera o extrato às 14h05, horário local dela
- **Quando** ela olha o documento
- **Então** a data e a hora de emissão mostradas são 14h05, não um horário de outro fuso

**C-017 — Qualquer persona com acesso ao quadro consegue**
- **Dado que** admin, analista, gestor ou diretoria abrem um pedido
- **Quando** procuram o extrato
- **Então** os dois botões (PDF e CSV) aparecem habilitados, em qualquer fase do pedido —
  inclusive Compras Concluídas e Compras Canceladas, onde hoje não há nenhuma outra ação
  disponível no pedido

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE oferecer, no pedido aberto e em qualquer fase, uma ação para gerar o extrato em PDF (pela janela de impressão) e outra para baixar em CSV | As duas ações aparecem habilitadas nas dez fases, para quem tem acesso ao quadro (C-017) | must |
| RF-002 | A marca do documento e as linhas de assinatura DEVEM seguir a fase atual do pedido, mesmo que datas de aprovação técnica ou da diretoria de um ciclo anterior continuem gravadas | Pedido devolvido à Análise depois de uma aprovação técnica antiga ainda mostra "NÃO APROVADO" (C-002) | must |
| RF-003 | Nas fases de decisão (Análise, Aprovação Técnica, Aprovação da Diretoria) o documento DEVE trazer a marca "NÃO APROVADO" e três linhas de assinatura em branco | C-001 | must |
| RF-004 | Na fase Compras Canceladas o documento DEVE trazer a marca "CANCELADO" e o motivo do cancelamento, sem linha de assinatura | C-003 | must |
| RF-005 | Nas demais fases o documento NÃO DEVE trazer marca nem linha de assinatura | C-004 | must |
| RF-006 | O documento DEVE mostrar o prazo de pagamento padrão do fornecedor e o acordado neste pedido lado a lado, e a justificativa da diferença quando ela existir | C-005, C-006, C-007 | must |
| RF-007 | A lista de itens DEVE trazer só os itens com quantidade pedida maior que zero, com código, descrição, embalagem, quantidade, custo unitário e total por item | C-008 | must |
| RF-008 | O documento DEVE mostrar o total do pedido igual ao total que a capa do quadro já mostra | C-009 | must |
| RF-009 | O documento DEVE mostrar as notas fiscais já vinculadas ao pedido e o percentual faturado quando existir ao menos uma; sem nenhuma nota, essa seção não aparece | C-010, C-011 | must |
| RF-010 | O cabeçalho DEVE identificar fornecedor, filial, período de vendas analisado, quem criou o pedido e o número do pedido no fornecedor quando o envio já tiver sido registrado; a ausência de um dado não impede o resto do documento | C-012 | must |
| RF-011 | Se a janela de impressão não abrir (bloqueio de pop-up), o sistema DEVE avisar a pessoa com uma mensagem explicando o motivo, sem travar a tela | C-013 | must |
| RF-012 | O CSV DEVE trazer as mesmas linhas de item do documento impresso, na mesma ordem | C-014 | must |
| RF-013 | O nome do arquivo gerado (PDF ou CSV) DEVE identificar o pedido | C-015 | should |
| RF-014 | A data e a hora de emissão mostradas no documento DEVEM refletir o relógio local de quem o gerou | C-016 | should |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Gerar o extrato DEVE reaproveitar só as leituras que o sistema já faz para abrir o pedido — nenhuma leitura nova entra no sistema por causa desta feature, mesmo que cada clique busque o dado mais recente em vez de reusar o que a tela já tinha carregado | revisão do código: zero leitura nova criada por esta feature; o clique sempre busca de novo, dentro do teto de execuções do sistema |
| RNF-002 | O documento impresso cabe em folha A4 retrato, com cabeçalho, prazo e itens legíveis, mesmo com 20 ou mais itens | inspeção visual no simulador com um pedido de 20+ itens |

## Entidades do domínio

- **Extrato do pedido** — documento derivado do pedido, montado no instante em que a pessoa
  pede: cabeçalho, prazo negociado, itens com quantidade, total, decisões já registradas
  (aprovação técnica, aprovação da diretoria, cancelamento) e o que já foi faturado. Não é
  gravado em lugar nenhum; cada pedido gera um extrato novo, sempre com o dado mais recente.

## Regras de negócio

- **RN-001 — A fase manda.** A marca do documento e as linhas de assinatura dependem
  exclusivamente da fase em que o pedido está agora. Uma data de aprovação técnica ou da
  diretoria de um ciclo anterior, ainda gravada, nunca decide sozinha se o pedido está
  aprovado.
- **RN-002 — Fases de decisão.** Análise, Aprovação Técnica e Aprovação da Diretoria mostram
  a marca "NÃO APROVADO" e três linhas de assinatura: comprador responsável, aprovação
  técnica, aprovação da diretoria.
- **RN-003 — Cancelamento.** A fase Compras Canceladas mostra a marca "CANCELADO" e o motivo
  do cancelamento; nenhuma linha de assinatura.
- **RN-004 — Demais fases.** Envio, Enviado, Trânsito, Faturamento, Produtos em B.O.,
  Compras Concluídas não mostram marca nem assinatura.
- **RN-005 — Prazo padrão × acordado.** O documento sempre mostra os dois prazos. Quando
  divergem, mostra a diferença e a justificativa registrada; sem justificativa ainda
  registrada, mostra que ela está pendente, sem inventar texto.
- **RN-006 — Itens.** Só entram na lista os itens com quantidade pedida maior que zero.
- **RN-007 — Total.** O total do pedido no extrato é o mesmo que a capa do quadro mostra.
- **RN-008 — Faturamento.** A seção de faturamento só existe quando há ao menos uma nota
  fiscal vinculada ao pedido.
- **RN-009 — Número no fornecedor.** O número do pedido no fornecedor só aparece depois que
  o envio à indústria foi registrado.
- **RN-010 — Nome do arquivo.** O nome do arquivo (PDF ou CSV) identifica o pedido.
- **RN-011 — Hora local.** A data e a hora de emissão são as do relógio de quem gera o
  documento, não um horário gravado em outro fuso.
- **RN-012 — CSV espelha o PDF.** As linhas de item do CSV são as mesmas do documento
  impresso.
- **RN-013 — Pop-up bloqueado.** Se a janela de impressão não abrir, a pessoa recebe um
  aviso explicando o motivo, em vez de nada acontecer.

## Testes

**Obrigatório.** Todo sistema e toda feature nascem com testes automatizados: cenário sem
teste é cenário não entregue.

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 / RN-002 | pedido sem motivo de reprovação, na fase Aprovação Técnica: o extrato sai com marca de "não aprovado" e as três linhas de assinatura | regra de tela |
| C-002 / RN-001 | pedido com a data de uma aprovação técnica antiga preenchida, mas de volta na fase Análise: o extrato ainda sai com marca de "não aprovado" e assinaturas — nunca sem marca só porque a data existe | regra de tela |
| C-003 / RN-003 | pedido cancelado, com motivo: marca de "cancelado", motivo presente, zero linha de assinatura | regra de tela |
| C-004 / RN-004 | pedido em cada uma das seis fases fora da decisão e do cancelamento: zero marca, zero assinatura, nas seis | regra de tela |
| C-005 / RN-005 | prazo padrão e acordado idênticos: os dois aparecem, sem pedido de justificativa | regra de tela |
| C-006 / RN-005 | prazo divergente com justificativa preenchida: a diferença e o texto da justificativa aparecem | regra de tela |
| C-007 / RN-005 | prazo divergente sem justificativa preenchida: a diferença aparece e o campo de justificativa mostra que está pendente, nunca um texto inventado | regra de tela |
| C-008 / RN-006 | lista de itens com um de quantidade zero e um de quantidade 5: só o de quantidade 5 aparece | regra de tela |
| C-009 / RN-007 | total do extrato é exatamente o valor total gravado no pedido, não uma soma recalculada dos itens | regra de tela |
| C-010 / RN-008 | pedido com uma nota fiscal vinculada: a seção de faturamento aparece com a nota e o percentual | regra de tela |
| C-011 / RN-008 | pedido sem nenhuma nota fiscal: a seção de faturamento não existe no resultado | regra de tela |
| C-012 / RN-009 | pedido com envio registrado e número no fornecedor: o número aparece; pedido sem envio: o campo sai vazio | regra de tela |
| C-013 / RN-013 | a janela de impressão bloqueada (devolvida como nula pelo navegador) aciona o aviso; uma janela válida não aciona | regra de tela |
| C-014 / RN-012 | as linhas de item do CSV têm a mesma quantidade e os mesmos valores das linhas do documento impresso, na mesma ordem | regra de tela |
| C-015 / RN-010 | pedido de identificação 4321: o nome do arquivo contém essa identificação | regra de tela |
| C-016 / RN-011 | gerando às 15/09/2026 14:05 (hora local simulada no teste), a emissão mostrada é 15/09/2026 14:05 | regra de tela |
| C-017 | já coberto por `frontend/tests/permissoes.test.mjs` (spec 002): acesso ao quadro é `true` para admin, analista, gestor e diretoria, e `false` para comercial — o extrato usa exatamente essa permissão, nenhuma nova | regra de tela |

- Cada cenário C-00N e cada regra RN-00N tem pelo menos uma linha acima.
- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 / C-003 / C-004 — o documento aberto de verdade na janela de impressão
        (Ctrl+P), marca d'água e assinaturas legíveis, sem cor, cabendo em folha A4 retrato
  - [ ] C-013 — pop-up bloqueado de verdade na configuração do navegador: o aviso aparece e
        a tela continua usável
  - [ ] C-017 — abrir o quadro como cada persona com acesso e conferir os dois botões, em
        mais de uma fase

## Fora de escopo

- [ ] **Conferências de nota fiscal (divergências de preço, prazo, validade, lote)** — quem
      precisa disso abre a aba de notas fiscais do pedido; o extrato só mostra a lista de
      notas e o percentual faturado.
- [ ] **Itens ou painel de Produtos em B.O.** — não entram no documento.
- [ ] **Linha do tempo completa do pedido** — o extrato traz só as decisões (aprovação
      técnica, aprovação da diretoria, cancelamento), não a lista de todos os eventos.
- [ ] **Exportação em planilha Excel** — só documento para impressão (PDF pela janela do
      navegador) e CSV.
- [ ] **Assinatura eletrônica** — as linhas de assinatura são só para impressão e assinatura
      manual em papel.
- [ ] **Envio do extrato por e-mail pelo sistema** — a pessoa baixa ou imprime; o sistema não
      manda o documento para ninguém.
- [ ] **Extrato de vários pedidos de uma vez** — sempre um pedido por vez, a partir do pedido
      aberto.
- [ ] **Formulário público (HU do card por usuário externo)** — descartado do SGC 2 inteiro
      (C-01 do 000), não é reintroduzido aqui.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-007, C-011, C-012, C-013)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
