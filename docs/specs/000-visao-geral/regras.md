# Regras de negócio do SGC 2 — decisões fechadas

**Fonte:** artefato "Regras do SGC 2" (https://claude.ai/artifact/5JwnVhwL3ANHS9d7TzMc1b), revisto com o usuário em 2026-09-15. Este arquivo é a cópia de referência: as specs citam as regras pelo id; quem precisar do contexto original lê aqui, não no artefato.

**121 regras:** 89 manter · 31 ajustar · 1 descartar.

Como ler: **Hoje** é como o SGC atual (p-45547) faz; **Proposta** é o que foi levado à revisão; **Opções** são as alternativas oferecidas (a recomendada marcada); **Decisão** é o que o usuário fechou, com a nota dele quando houve. "Manter" confirma a proposta; "Ajustar" muda a proposta na direção da nota; "Descartar" tira do mapa.

## Onda 1

### Fluxo e fases

#### F-01 · As dez fases, na ordem do processo

- **Hoje:** Análise/Montagem de Pedido → Aprovação Técnica → Aprovação da Diretoria → Envio para Indústria → Enviado para Indústria → Em Trânsito para BN → Faturamento em Andamento → Produtos em B.O. → Compras Concluídas · Compras Canceladas. _(.specs/000-visao-geral)_
- **Proposta:** Mesmos dez nomes e mesma ordem, criados pelo instalador com uma chave fixa por fase. O administrador pode renomear e recolorir no construtor do motor, não remover nem reordenar.
- **Decisão:** Manter

#### F-02 · Fases finais

- **Hoje:** Compras Concluídas é final com sucesso; Compras Canceladas é final com falha. _(KANBAN_FASES.TIPO_FINALIZACAO)_
- **Proposta:** Igual: tipo "sucesso" e tipo "cancelado" do motor, que guarda a data de conclusão e o resultado.
- **Decisão:** Manter

#### F-03 · Transições permitidas

- **Hoje:** Análise → Técnica; Técnica → Diretoria ou → Análise (reprovação); Diretoria → Envio, → Técnica (devolver à gerência) ou → Análise (reprovação); Envio → Enviado ou → Diretoria (retorno); Enviado → Trânsito; Trânsito → Faturamento; Faturamento → B.O. ou → Concluídas; B.O. → Faturamento ou → Concluídas; qualquer fase → Canceladas. _(KANBAN_TRANSITIONS · add-aprovacao-tecnica.mjs)_
- **Proposta:** Mesma tabela, escrita na regra de tela e testada. O botão "Mover para" só mostra os destinos permitidos.
- **Opções:**
  - A (recomendada): Transições fixas no código da regra (não configuráveis). Regra de negócio testada, sem risco de alguém abrir um atalho na configuração.
  - B: Transições configuráveis pelo administrador. O motor não tem esse conceito; teria de entrar na lib.
- **Decisão:** Manter (opção A)

#### F-04 · Análise nunca vai direto para a Diretoria

- **Hoje:** A transição Análise → Diretoria está desativada no banco e barrada de novo na regra, com a mensagem "O pedido precisa passar pela Aprovação Técnica antes de ir para a Aprovação da Diretoria." _(PipeWorkspace.tsx (moveCardByBusinessRules))_
- **Proposta:** Igual, com a mesma mensagem.
- **Decisão:** Manter

#### F-05 · Campos obrigatórios por fase

- **Hoje:** Avançar exige os campos obrigatórios da fase atual; voltar e cancelar não exigem. _(PipeWorkspace.tsx · KANBAN_FIELD_PHASE_RULES)_
- **Proposta:** O motor valida obrigatórios em qualquer direção, o que barraria cancelar e voltar. No SGC 2 nenhum campo de fase é obrigatório: o que hoje é obrigatório vira pré-requisito da regra de saída (alertas, justificativas, prazo de pagamento, envio).
- **Opções:**
  - A (recomendada): Sem campos obrigatórios de fase; toda exigência é regra de saída da fase.
  - B: Campos obrigatórios por fase no construtor. Cancelar e voltar passam a exigir também (comportamento do motor).
- **Decisão:** Ajustar (opção A)

#### F-06 · Fases de Enviado a Concluídas durante a onda 1

- **Hoje:** Enviado → Trânsito exige nota vinculada; Trânsito → Faturamento é automático com 100 % recebido; Faturamento → Concluídas exige validades e validações de NF decididas. _(PipeWorkspace.tsx · specs 009 e 010)_
- **Proposta:** Na onda 1 essas travas ainda não existem (são da onda 2). Enquanto isso as fases ficam livres, respeitando só a persona.
- **Opções:**
  - A (recomendada): Fases livres na onda 1; as travas chegam com a onda 2.
  - B: Cards param em "Enviado para Indústria" até a onda 2 entrar.
  - C: Fases de Trânsito, Faturamento e B.O. ficam ocultas do quadro até a onda 2.
- **Decisão:** Ajustar (opção A)

#### F-07 · Situação do item acompanha a fase

- **Hoje:** Item nasce PENDENTE; vira APROVADO quando a Diretoria aprova; ENVIADO ao entrar em Enviado; EM FATURAMENTO na fase de faturamento; EM B.O. ou CONCLUÍDO no fim. _(SGC_PEDIDO_ITENS.STATUS)_
- **Proposta:** Onda 1 mantém PENDENTE, APROVADO e ENVIADO; os demais entram com a onda 2.
- **Decisão:** Manter

#### F-08 · Toda movimentação fica registrada

- **Hoje:** Cada mudança de fase grava histórico e um evento com a fase de origem, para a linha do tempo por etapa. _(KANBAN_CARD_HISTORY · KANBAN_CARD_LOG)_
- **Proposta:** O motor grava movimento e registro sozinho; o card aberto mostra as passagens por fase.
- **Decisão:** Manter

#### F-09 · Foto do formulário ao sair da fase

- **Hoje:** Ao mover, o sistema guarda os valores dos campos da fase que o card está deixando. _(PipeWorkspace.tsx (PHASE_SNAPSHOT))_
- **Proposta:** Nativo do motor: cada passagem guarda os campos da fase e mostra no card aberto. Nada a construir.
- **Decisão:** Manter

### Personas e permissões

#### P-01 · Cinco personas

- **Hoje:** admin (acesso total), analista (compradora, operação diária), gestor (gerência/coordenação, aprovação técnica), diretoria (aprovação final, segurança), comercial (só solicitações e telas do comercial). _(usePersona.ts)_
- **Proposta:** As mesmas cinco.
- **Decisão:** Manter

#### P-02 · Como a persona é resolvida

- **Hoje:** Persona gravada por usuário; sem persona, cai pelo nível de acesso da plataforma: ADMIN → admin, MEMBER → analista, RESTRICTED → comercial. Se falhar ao consultar, assume analista. _(usePersona.ts · SGC_USER_PERSONA)_
- **Proposta:** Mesmo mapa de fallback. Em falha, assumir o menor privilégio.
- **Opções:**
  - A (recomendada): Falha ao consultar → comercial (menor privilégio).
  - B: Falha ao consultar → analista, como hoje.
- **Decisão:** Ajustar (opção B)

#### P-03 · O que cada persona vê no menu

- **Hoje:** Comercial não vê Kanban, Agenda, Compras Inteligentes, Galderma, Análises nem Relatórios; Segurança e Configurações são de admin e diretoria; BKP só de admin. _(nav.ts)_
- **Proposta:** Onda 1: comercial não vê Quadro, Agenda nem Fornecedores; Segurança (personas) é de admin e diretoria; a administração do quadro (fases, campos, automações) é só de admin; BKP não existe.
- **Decisão:** Manter

#### P-04 · Quem cria e edita pedidos

- **Hoje:** admin e analista. _(getPermissions.canCreateCards / canEditCards)_
- **Proposta:** Igual.
- **Decisão:** Ajustar — gestor tambem

#### P-05 · Quem decide a Aprovação Técnica

- **Hoje:** admin e gestor. A diretoria não decide a técnica (admin cobre a ausência da gerência). _(getPermissions.canApproveTecnica)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### P-06 · Quem decide a Aprovação da Diretoria

- **Hoje:** admin e diretoria. _(getPermissions.canApproveCards)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### P-07 · Quem move card em cada fase

- **Hoje:** Diretoria só movimenta cards na fase Aprovação da Diretoria; gestor só na Aprovação Técnica; admin e analista em qualquer fase; comercial não move. _(PipeWorkspace.tsx (moveCardByBusinessRules))_
- **Proposta:** Igual, aplicado ao "Mover para" do card aberto: destino fora da regra aparece desabilitado com o motivo.
- **Decisão:** Manter — gestor tambem pode mover e em qualquer fase

#### P-08 · Níveis de acesso da plataforma além da persona

- **Hoje:** Usuário READ_ONLY não cria nem move; usuário RESTRICTED só opera os próprios cards. _(PipeWorkspace.tsx (isReadOnlyAccess / isRestrictedAccess))_
- **Proposta:** A persona já cobre quem pode o quê. Manter só o READ_ONLY como "vê e não opera".
- **Opções:**
  - A (recomendada): Manter só READ_ONLY (vê, não opera); descartar "só os próprios cards".
  - B: Manter as duas regras.
  - C: Descartar as duas: só a persona manda.
- **Decisão:** Ajustar (opção B)

#### P-09 · Quem exclui um pedido

- **Hoje:** admin, gestor e diretoria; o botão some para os outros e a ação é recusada se chegar por outro caminho. _(getPermissions.canDeleteCards · spec 001 HU-8)_
- **Proposta:** No motor, excluir card é de quem criou ou do administrador do quadro. Ver P-11.
- **Decisão:** Manter

#### P-10 · Quem cancela um agendamento

- **Hoje:** admin, gestor e diretoria. _(getPermissions.canDeleteAgenda)_
- **Proposta:** Igual, com a guarda no SQL.
- **Decisão:** Manter

#### P-11 · Administrador do quadro no motor × persona

- **Hoje:** Não existe o conceito: admin configura fases e campos na tela de Configurações. _(spec 007 · KB_BOARD.ADMINS_IDS)_
- **Proposta:** O motor tem "administradores do quadro": configuram fases, campos e automações, excluem card de outros, reabrem concluídos e apagam tarefa, anexo ou mensagem alheia. Quem entra nessa lista?
- **Opções:**
  - A (recomendada): Só a persona admin. Excluir pedido passa a ser de admin e de quem criou; gestor e diretoria cancelam com motivo (que é o caminho de negócio).
  - B: admin, gestor e diretoria são administradores do quadro (todos podem mexer em fases e campos).
  - C: Só admin, e a lib 1.3.0 ganha "quem pode excluir" configurável para preservar gestor e diretoria.
- **Decisão:** Ajustar (opção A) — [Confirmado: só admin administra o quadro, mas gestor e diretoria também excluem pedido. Exclusão feita pelo SGC com a persona conferida no servidor.]

#### P-12 · Persona conferida no servidor

- **Hoje:** Mover card é conferido só na tela; algumas escritas conferem a persona dentro do SQL. _(spec 017 questão 7 · SFs 2832–2834)_
- **Proposta:** Toda escrita do SGC 2 com regra de persona (aprovar, reprovar, cancelar, enviar, parametrizar fornecedor) confere a persona no SQL. Mover continua conferido na tela: o motor não chama regra do consumidor ao mover.
- **Decisão:** Manter

#### P-13 · Tela de Segurança

- **Hoje:** admin e diretoria atribuem a persona de cada usuário; usuários vêm do cadastro da plataforma, sem cadastro próprio. _(spec 007)_
- **Proposta:** Igual.
- **Decisão:** Manter

### Criação e filtros

#### C-01 · Por onde nasce um pedido

- **Hoje:** Manual (formulário interno), agenda (automático), carrinho das Compras Inteligentes, formulário público e card de B.O. _(.specs/000-visao-geral)_
- **Proposta:** Onda 1: manual e agenda. Carrinho, público e B.O. chegam nas ondas 2–4.
- **Decisão:** Ajustar — sem formulario publico. [Confirmado no chat em 2026-09-15: o formulário público sai do mapa do SGC 2, em todas as ondas.]

#### C-02 · O que a criação manual exige

- **Hoje:** Fornecedor, filial e período de vendas. O título é um campo editável. _(InternalInitialFormPage · TITLE_FIELD_ID)_
- **Proposta:** Fornecedor, filial e período obrigatórios; título gerado como "FILIAL · FORNECEDOR".
- **Opções:**
  - A (recomendada): Título automático e fixo.
  - B: Título automático, mas editável no card.
- **Decisão:** Ajustar (opção A)

#### C-03 · Criador e responsável inicial

- **Hoje:** Criador é quem criou; na agenda, quem agendou. Responsável inicial é o criador. _(add-processar-agenda.mjs)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### C-04 · Filtros do quadro

- **Hoje:** Filial, núcleo, responsável, etiqueta, prazo e busca. _(spec 001 HU-5)_
- **Proposta:** O motor filtra por busca, responsável, etiqueta e concluídos. Fornecedor e filial entram como campos do quadro e passam a valer na busca. Núcleo não volta.
- **Opções:**
  - A (recomendada): Descartar "núcleo".
  - B: Manter "núcleo" como campo de seleção do quadro.
- **Decisão:** Ajustar (opção A)

#### C-05 · Botão "Novo card" do motor

- **Hoje:** Não existe; a criação é pelo formulário interno. _(—)_
- **Proposta:** O botão genérico do motor fica desligado; criar pedido é só pela tela "Novo pedido".
- **Decisão:** Ajustar — manter criar novo pedido. [Confirmado: botão "Novo pedido" no quadro, no lugar do "Novo card" do motor, abrindo a tela de criação do SGC.]

#### C-06 · O que o cartão mostra no quadro

- **Hoje:** Título, fornecedor, valor total, prazo de faturamento, quantidade de alertas não lidos e, se cancelado, o motivo. _(PipeWorkspace.tsx)_
- **Proposta:** Título, fornecedor, filial e valor total (campos do quadro), responsáveis, etiquetas, os três tempos do motor (criação, tempo na fase, última alteração), alertas pendentes na fase de Análise e o motivo na fase Canceladas. Prazo de faturamento vem com a onda 2.
- **Decisão:** Manter

#### C-07 · Prioridade e prazo do card

- **Hoje:** Prioridade (baixa, média, alta) e data de entrega por card. _(KANBAN_CARDS.PRIORIDADE / DATA_ENTREGA)_
- **Proposta:** Prazo é nativo do motor. Prioridade sai; quem precisar marca com etiqueta.
- **Opções:**
  - A (recomendada): Descartar prioridade.
  - B: Manter prioridade como campo de seleção do quadro.
- **Decisão:** Ajustar (opção B)

### Aprovação técnica (gerência)

#### AT-01 · Só chega da Análise

- **Hoje:** A Aprovação Técnica recebe cards apenas da Análise/Montagem. _(spec 001 HU-9)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AT-02 · Aprovar

- **Hoje:** Grava quem aprovou e quando, limpa reprovação técnica anterior, registra o evento e move para a Diretoria. _(sgc_registrar_aprovacao_tecnica)_
- **Proposta:** Igual: ação "Aprovar" no card, só para gestor e admin.
- **Decisão:** Manter

#### AT-03 · Reprovar

- **Hoje:** Motivo obrigatório em campo próprio (separado do da diretoria), quem e quando, lista de produtos reprovados; o card volta à Análise. Só pelo botão "Reprovar Pedido"; "Mover para" a Análise é recusado. _(sgc_registrar_reprovacao_tecnica · moveCardByBusinessRules)_
- **Proposta:** Igual. Os produtos reprovados continuam sendo marcados?
- **Opções:**
  - A (recomendada): Manter a marcação de produtos reprovados (o analista vê quais itens devolveram o pedido).
  - B: Só o motivo em texto.
- **Decisão:** Ajustar (opção A)

#### AT-04 · Reenviar para a técnica

- **Hoje:** Ao sair de novo da Análise: limpa as reprovações anteriores (técnica e diretoria), remove itens com quantidade zero e recalcula o total. _(spec 001 HU-9.6 · sgc_remover_itens_zerados)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AT-05 · Diretoria devolve para a gerência

- **Hoje:** A transição Diretoria → Técnica existe e não exige motivo (só a volta para a Análise exige). _(add-aprovacao-tecnica.mjs)_
- **Proposta:** Manter como retorno livre?
- **Opções:**
  - A (recomendada): Retorno livre, sem motivo.
  - B: Exigir motivo como na reprovação.
  - C: Descartar a transição: diretoria só aprova ou reprova para a Análise.
- **Decisão:** Ajustar (opção A)

### Aprovação da diretoria

#### AD-01 · Só chega da Técnica

- **Hoje:** Recebe apenas cards aprovados pela gerência (ou devolvidos do Envio). _(spec 001 RN-13)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AD-02 · Aprovar

- **Hoje:** Grava quem e quando, limpa o motivo de reprovação; ao sair para o Envio os itens viram APROVADO. _(sgc_registrar_aprovacao)_
- **Proposta:** Igual: ação "Aprovar", só diretoria e admin.
- **Decisão:** Manter

#### AD-03 · Reprovar

- **Hoje:** Motivo obrigatório (campo separado do técnico), volta à Análise, só pelo botão. _(sgc_registrar_reprovacao)_
- **Proposta:** Igual.
- **Decisão:** Manter

### Cancelamento

#### CA-01 · De qualquer fase

- **Hoje:** Toda fase ativa pode ir para Compras Canceladas. _(spec 001 RN-9)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### CA-02 · Motivo obrigatório e caminho único

- **Hoje:** Grava motivo, quem e quando. "Mover para" e arrastar para Canceladas só abrem o formulário do motivo; não existe cancelamento silencioso. _(spec 001 HU-7 · RN-10)_
- **Proposta:** Igual: ação "Cancelar compra" com motivo; no "Mover para", Canceladas aparece desabilitada com "use Cancelar compra".
- **Decisão:** Manter

#### CA-03 · Cancelar dispensa exigências da fase

- **Hoje:** Cancelar é saída de exceção: não exige os campos obrigatórios da fase atual. _(spec 001 RN-11)_
- **Proposta:** Igual (e sem campos obrigatórios de fase, ver F-05).
- **Decisão:** Manter

#### CA-04 · Motivo visível

- **Hoje:** O motivo aparece no cartão do quadro e no detalhe. _(spec 001 HU-7.5)_
- **Proposta:** Igual: campo do quadro "motivo do cancelamento" na capa da fase Canceladas e na aba Itens.
- **Decisão:** Manter

#### CA-05 · Cancelado é final

- **Hoje:** Sem transição de saída. Só a exclusão do card. _(KANBAN_TRANSITIONS)_
- **Proposta:** O motor permite ao administrador do quadro reabrir um card concluído ou cancelado. Aceitar isso como exceção?
- **Opções:**
  - A (recomendada): Administrador do quadro pode reabrir (comportamento do motor).
  - B: Ninguém reabre; exige mudança na lib.
- **Decisão:** Manter (opção A)

### Envio à indústria

#### EN-01 · Dois canais de envio

- **Hoje:** Plataforma do fornecedor (link parametrizado) ou e-mail. _(spec 000 fase 4)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### EN-02 · E-mail do pedido

- **Hoje:** Destinatário: contato da linha de produto do fornecedor. Cópia obrigatória para compras@benenutri.com. Corpo com fornecedor, filial, tabela de itens (produto, embalagem, quantidade, custo, total), total do pedido e observações. Itens com quantidade zero não vão. _(add-enviar-email-industria.mjs · add-copia-compras-emails.mjs)_
- **Proposta:** Igual. O destinatário pode ser digitado livremente ou só escolhido entre os contatos cadastrados?
- **Opções:**
  - A (recomendada): Só contatos cadastrados na parametrização do fornecedor.
  - B: Contatos cadastrados ou e-mail digitado na hora.
- **Decisão:** Ajustar (opção A)

#### EN-03 · Registro do envio

- **Hoje:** Tipo de envio, data, e-mail usado, observação e o número do pedido no WinThor. _(sgc_salvar_envio_industria (SF 384))_
- **Proposta:** Igual. A data é obrigatória. O número do pedido no WinThor é obrigatório?
- **Opções:**
  - A (recomendada): Número do pedido obrigatório ao registrar o envio.
  - B: Opcional: pode ser preenchido depois.
- **Decisão:** Ajustar (opção A)

#### EN-04 · Só avança com o envio registrado

- **Hoje:** Envio → Enviado é barrado sem a data de envio ("Envie o resumo do pedido antes de mover…"). _(moveCardByBusinessRules)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### EN-05 · Envio atualiza a agenda vinculada

- **Hoje:** A data real de envio vai para o agendamento que gerou o card; se diferir da planejada, a planejada original é guardada e a data da agenda passa a ser a real. _(SF 384)_
- **Proposta:** Manter?
- **Opções:**
  - A (recomendada): Manter: a agenda mostra planejado × real.
  - B: Descartar: a agenda só sabe que o card foi gerado.
- **Decisão:** Ajustar (opção A)

#### EN-06 · Registro de comunicações

- **Hoje:** Tabela própria de comunicações com o fornecedor (tipo, assunto, destino, enviado). _(SGC_COMUNICACOES)_
- **Proposta:** Vira um registro no histórico do card ("Pedido enviado por e-mail para X às HH:MM").
- **Opções:**
  - A (recomendada): Registro no histórico do card.
  - B: Tabela própria de comunicações, como hoje.
- **Decisão:** Ajustar (opção B)

### Análise de montagem (itens)

#### AN-01 · Uma consulta traz a análise inteira

- **Hoje:** Para fornecedor, filial e período: todos os produtos ativos do fornecedor com estoque, venda dos três últimos meses, custo da última entrada, datas de última entrada e saída, quantidade pedida no ERP, trânsito e venda no período (total, PJ, PF e licitação). _(sgc_analise_montagem (Oracle))_
- **Proposta:** Igual, mesma consulta.
- **Decisão:** Manter

#### AN-02 · Produto ativo

- **Hoje:** Produto sem marcação em OBS2 e fora dos departamentos 4 e 7. _(ref-integracao-winthor)_
- **Proposta:** Igual, em toda consulta.
- **Decisão:** Manter

#### AN-03 · Venda e segregação de licitação

- **Hoje:** Só saídas com quantidade positiva. Clientes de órgão público (atividade 11 a 15 e 20) saem da venda e aparecem à parte como licitação. _(sgc_analise_montagem)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AN-04 · Sugestão de compra

- **Hoje:** Venda mensal = venda do período ÷ meses. Cobertura alvo 2 meses (2,5 se a venda mensal é menor que 5). Necessidade = arredondar para cima(venda mensal × alvo). Posição = estoque − trânsito, mínimo zero. Sugestão = necessidade − posição, mínimo zero; se há demanda e a posição não cobre um mês, sugere 1. Usa a venda total, inclusive licitação. _(compras.ts (calcSugestaoCompra))_
- **Proposta:** Igual. A base continua sendo a venda total?
- **Opções:**
  - A (recomendada): Venda total, inclusive licitação, como hoje.
  - B: Venda sem licitação (a licitação só informa).
- **Decisão:** Ajustar (opção A)

#### AN-05 · Arredondar por caixa

- **Hoje:** Unidades por caixa vêm da integração gestão-de-custos ou são lidas da embalagem ("CX 12"). Modo caixa cheia arredonda para cima; modo mínima não arredonda. _(compras.ts (getUnidadesPorCaixa) · SF 2353)_
- **Proposta:** Onda 1 lê só a embalagem do WinThor; a integração gestão-de-custos entra na onda 4.
- **Opções:**
  - A (recomendada): Só embalagem na onda 1.
  - B: Integração gestão-de-custos já na onda 1.
- **Decisão:** Ajustar (opção B)

#### AN-06 · Curva ABC por valor

- **Hoje:** Valor = venda × custo. A = até 80 % do acumulado, B = até 95 %, C = o resto. _(compras.ts (calcCurvaABC))_
- **Proposta:** Igual, calculada na análise e guardada no item.
- **Decisão:** Manter

#### AN-07 · Cobertura futura

- **Hoje:** Dias = (estoque − trânsito + quantidade pedida) ÷ venda diária. Acima do limite (90 dias, ou o da regra ABC) exige justificativa. _(compras.ts (calcCoberturaFuturaDias))_
- **Proposta:** Igual; limite fixo de 90 dias na onda 1, parametrizado por ABC na onda 4.
- **Decisão:** Ajustar — valor deve ser o parametrizado ou no maximo 35 dias [Confirmado: cobertura parametrizada por fornecedor → departamento → seção → SKU, vale a mais específica; sem parametrização, 35 dias. Entra na onda 1.]

#### AN-08 · Custo e tipo de preço

- **Hoje:** Custo unitário editável, iniciado pelo custo da última entrada; campo "tipo de preço" por item (padrão/especial). _(SGC_PEDIDO_ITENS.PRECO_CUSTO / TIPO_PRECO)_
- **Proposta:** Custo editável a partir da última entrada. O tipo de preço continua?
- **Opções:**
  - A (recomendada): Só o custo editável; tipo de preço sai.
  - B: Manter o tipo de preço.
- **Decisão:** Ajustar (opção B)

#### AN-09 · Montar a lista

- **Hoje:** Adicionar produto por busca (código ou nome, até 20 resultados), remover item, editar quantidade pedida. Item com quantidade zero é removido ao enviar para a técnica. _(sgc_buscar_produto · sgc_remover_itens_zerados)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AN-10 · Edições de item no histórico

- **Hoje:** Cada edição de item vira evento, consolidado em janelas de 4 segundos (até 40 linhas) para não estourar o teto de execuções. _(PipeWorkspace.tsx (ITEM_EVENT_FLUSH_MS))_
- **Proposta:** Registrar só um resumo da lista ao sair da Análise, não cada edição.
- **Opções:**
  - A (recomendada): Só o resumo ao sair da fase.
  - B: Cada edição, consolidada, como hoje.
- **Decisão:** Ajustar (opção A)

#### AN-11 · Período de vendas

- **Hoje:** Informado na criação (início e fim); a agenda carrega o período do agendamento. _(SGC_CARD_METADATA.PERIODO_INICIO/FIM)_
- **Proposta:** Igual, com sugestão padrão dos últimos 90 dias.
- **Opções:**
  - A (recomendada): Padrão: últimos 90 dias, editável.
  - B: Sem padrão: sempre informado.
- **Decisão:** Ajustar (opção A) — padrao 45 dias

#### AN-12 · Total do pedido

- **Hoje:** Soma de quantidade × custo dos itens; recalculado ao sair da Análise e mostrado na capa. _(sgc_atualizar_metadata)_
- **Proposta:** Igual, gravado no pedido e no campo "valor total" do quadro.
- **Decisão:** Manter

### Alertas da análise

#### AL-01 · RN-02: lote a vencer

- **Hoje:** Para os produtos do pedido, lotes com saldo e validade em até 90 dias, em qualquer filial, geram alerta de vencimento no item. _(sgcAlertaVencimentoLotes)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AL-02 · RN-03: excesso em outra filial

- **Hoje:** Produto com mais de 80 dias de estoque (estoque ÷ venda diária dos três meses) numa filial diferente da do pedido gera alerta de excesso. _(sgcAlertaExcessoFilial)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AL-03 · Quando os alertas são gerados

- **Hoje:** Ao montar a lista e ao salvar itens. _(useSGC.ts)_
- **Proposta:** Ao salvar a lista e de novo ao tentar enviar para a técnica (recalcula antes de barrar).
- **Decisão:** Manter

#### AL-04 · Leitura obrigatória

- **Hoje:** Todo alerta precisa ser marcado como lido antes de o pedido sair da Análise ("Alertas pendentes: N"). _(moveCardByBusinessRules)_
- **Proposta:** Igual, guardando quem leu e quando.
- **Decisão:** Manter

#### AL-05 · Item alertado exige justificativa

- **Hoje:** Produto com alerta ativo que continua na lista com quantidade maior que zero precisa de observação; sem ela o pedido não sai da Análise. _(spec 001 RN-15 · sgcAtualizarObservacaoItem)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AL-06 · Cobertura futura acima do limite exige justificativa

- **Hoje:** Item cuja cobertura futura passa do limite precisa de observação antes de sair da Análise. _(moveCardByBusinessRules)_
- **Proposta:** Igual.
- **Decisão:** Manter

### Prazo de pagamento

#### PZ-01 · Padrão × acordado

- **Hoje:** O prazo padrão vem da parametrização do fornecedor (faixa de valor do pedido → opções); o acordado é o negociado neste pedido. Os dois ficam no card. _(spec 001 HU-10)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### PZ-02 · Como se comparam

- **Hoje:** Comparação pelas parcelas em dias extraídas do texto ("28/35/42 dias" → 28, 35, 42); "à vista" = zero dia; texto idêntico é igual; um lado sem número é divergência, nunca igualdade. _(prazo-pagamento.ts)_
- **Proposta:** Igual (mesmo módulo, portado com os testes).
- **Decisão:** Manter

#### PZ-03 · Divergência exige justificativa

- **Hoje:** Parcelas diferentes, prazo médio menor ou não comparável → justificativa de pelo menos 10 caracteres. _(validarPrazoPagamentoMontagem)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### PZ-04 · A trava lê o que está gravado

- **Hoje:** Ao sair da Análise a regra lê os valores gravados no pedido, não o formulário aberto. _(moveCardByBusinessRules)_
- **Proposta:** Igual.
- **Decisão:** Manter

### Histórico do pedido

#### HI-01 · Que ações viram registro

- **Hoje:** Movimentação, foto da fase, cancelamento, aprovações e reprovações (técnica e diretoria), envio do pedido, leitura de alerta, justificativa de item, remoção de item; validade aceita/recusada e envio para B.O. (onda 2). _(spec 001 HU-11)_
- **Proposta:** O motor registra movimento, passagem e campos; o SGC acrescenta uma nota no registro para cada decisão da lista.
- **Decisão:** Manter

#### HI-02 · Onde a linha do tempo aparece

- **Hoje:** Aba "Linha do Tempo" agrupada por fase, com destaque das decisões. _(spec 001 HU-11.2)_
- **Proposta:** Aba "Alterações" do motor (prosa por dia, com filtro) mais as passagens por fase no card aberto.
- **Opções:**
  - A (recomendada): Só o que o motor já mostra.
  - B: Seção própria "Decisões" na aba Itens, agrupada por fase.
- **Decisão:** Manter (opção A)

### E-mails

#### EM-01 · Aviso de mudança de fase

- **Hoje:** Ao mover um card com "notificar" ligado, e-mail "[Kanban] Atualização de Tarefa: título" (ou "Card concluído"/"Card cancelado") para a lista de e-mails do card, com origem, destino, responsáveis e quem moveu. _(kanban_notify_move_open/success/cancel)_
- **Proposta:** Automações do motor por fase (gatilho "card movido" → e-mail aos responsáveis e a endereços fixos), configuráveis pelo administrador, com o texto do motor.
- **Opções:**
  - A (recomendada): Automações do motor, texto do motor.
  - B: Função própria com o texto e a lista por card de hoje.
- **Decisão:** Ajustar (opção A)

#### EM-02 · Cópia para compras@benenutri.com

- **Hoje:** Todo e-mail do sistema sai com cópia para compras@benenutri.com. _(add-copia-compras-emails.mjs)_
- **Proposta:** Envio à indústria mantém; nas automações do motor, compras@ entra como destinatário fixo.
- **Decisão:** Manter

#### EM-03 · Anexos por e-mail ao criador

- **Hoje:** Automação que envia os anexos do card ao criador numa fase específica. _(kanban_send_phase9_attachments_to_creator)_
- **Proposta:** Descartar.
- **Opções:**
  - A (recomendada): Descartar.
  - B: Manter como automação do motor.
- **Decisão:** Ajustar (opção B)

#### EM-04 · Menção no chat avisa por e-mail

- **Hoje:** Comentário com @menção envia e-mail ao mencionado. _(KANBAN_COMMENT_MENTIONS)_
- **Proposta:** Nativo do chat do motor.
- **Decisão:** Manter

### Fornecedores

#### FO-01 · Cadastro vem do WinThor

- **Hoje:** Fornecedores e filiais são lidos do ERP; o SGC só parametriza, ligado pelo CNPJ e pelo código. _(sgc_listar_fornecedores · CI_FORNECEDOR_PARAM)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### FO-02 · Parâmetros do fornecedor

- **Hoje:** CNPJ (14 dígitos), nome da indústria, prazo de entrega (dias, úteis ou corridos), pedido mínimo (maior que zero), janela de fechamento (dia início e fim, 1 a 31), link da plataforma de pedidos, validade mínima em dias, prazos de SLA de análise e de faturamento em dias úteis (vazio = 1 e 5). _(add-parametrizacao-fornecedor.mjs · add-prazos-sla-fornecedor.mjs)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### FO-03 · Filiais atendidas

- **Hoje:** Lista de filiais que o fornecedor atende. _(CI_FORNECEDOR_FILIAL)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### FO-04 · Linhas de produto, contatos e prazos

- **Hoje:** Cada linha tem nome, contatos (nome e e-mail válido de envio de pedido) e faixas de valor (de < até) com opções de prazo de pagamento (rótulo e parcelas em dias maiores que zero). _(CI_LINHA_PRODUTO · CI_LINHA_CONTATO · CI_FAIXA_PRAZO_PAGAMENTO · CI_OPCAO_PRAZO · CI_PARCELA_PRAZO)_
- **Proposta:** Igual; as parcelas de cada opção ficam como texto "30/60/90", o mesmo formato que a comparação de prazo lê.
- **Decisão:** Manter

#### FO-05 · Documentos do fornecedor

- **Hoje:** Endereço, nome e tipo (Documento ou Modelo de envio de pedido), com vencimento. _(CI_FORNECEDOR_DOCUMENTO)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### FO-06 · Log de alteração

- **Hoje:** Quem alterou, quando e o que (log detalhado campo a campo). _(CI_FORNECEDOR_LOG)_
- **Proposta:** Uma linha por salvamento (quem, quando), sem o detalhe campo a campo.
- **Opções:**
  - A (recomendada): Uma linha por salvamento.
  - B: Log campo a campo como hoje.
- **Decisão:** Manter (opção B)

#### FO-07 · Quem parametriza

- **Hoje:** admin, diretoria e gestor editam; analista vê. _(ciParamVerificarPermissaoEdicao)_
- **Proposta:** Igual, com a guarda no SQL.
- **Decisão:** Manter

#### FO-08 · Salvar substitui a parametrização inteira

- **Hoje:** Salvar apaga e regrava filiais, linhas, contatos, faixas e documentos do fornecedor. _(ciParamSalvarFornecedor)_
- **Proposta:** Igual (simples e sem estado parcial).
- **Decisão:** Manter

### Agenda de análises

#### AG-01 · O agendamento

- **Hoje:** Fornecedor, filial, data da análise, período de vendas (início e fim), recorrência (nenhuma, semanal, quinzenal, mensal), data-limite da recorrência, quem criou. _(SGC_AGENDA)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AG-02 · Reuniões operacionais na agenda

- **Hoje:** Além do planejamento de pedido, a agenda aceita reuniões com título, descrição e participantes (lista limpa e reinserida a cada edição). _(update-agenda-tipos-reuniao.mjs · spec 003)_
- **Proposta:** Onda 1 só planejamento de pedido.
- **Opções:**
  - A (recomendada): Só planejamento de pedido na onda 1.
  - B: Reuniões com participantes já na onda 1.
  - C: Reuniões nunca voltam.
- **Decisão:** Manter (opção B)

#### AG-03 · Cancelar é marcar, não apagar

- **Hoje:** Cancelamento desativa o agendamento e preserva o registro. _(spec 003 RN-3)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AG-04 · Atraso

- **Hoje:** Agendamento com data passada e não processado é sinalizado como atrasado. _(spec 003 HU-4)_
- **Proposta:** Igual.
- **Decisão:** Manter

#### AG-05 · Processamento automático

- **Hoje:** A cada 30 minutos: agendamentos ativos, não processados e com data até hoje viram um card na Análise (título "FILIAL - FORNECEDOR - Agenda", criador = quem agendou, origem AGENDA, período do agendamento), marcados como processados com o card gerado; se recorrente, cria a próxima ocorrência (+7, +14 ou +30 dias) até a data-limite. _(add-processar-agenda.mjs (SF 352))_
- **Proposta:** Igual. Recorrência mensal: mesmo dia do mês seguinte em vez de +30 dias?
- **Opções:**
  - A (recomendada): Mensal = mesmo dia do mês seguinte.
  - B: Mensal = +30 dias, como hoje.
- **Decisão:** Ajustar (opção A)

#### AG-06 · Processamento manual

- **Hoje:** Botão com quatro recortes: mês vigente, intervalo de datas, dias específicos ou um pedido. Nunca a base inteira sem recorte. _(update-agenda-processamento-filtrado.mjs)_
- **Proposta:** Um botão "Processar vencidos agora", que roda o mesmo processo do cron.
- **Opções:**
  - A (recomendada): Só "Processar vencidos agora".
  - B: Manter os quatro recortes.
- **Decisão:** Manter (opção B)

### Tela e gesto

#### UI-01 · Arrastar cartão entre colunas

- **Hoje:** A equipe arrasta desde a primeira versão; o SGC decidiu manter em 2026-09-14 (emenda 1 da constitution). O motor não arrasta: o cartão é só leitura e mover é no card aberto, em "Mover para". _(constitution 3.0.0 · README da lib)_
- **Proposta:** Seguir o motor: sem arrastar.
- **Opções:**
  - A (recomendada): Sem arrastar; mover no card aberto.
  - B: Pedir o arrastar na lib 1.3.0 (passa pela mesma regra de mover).
- **Decisão:** Ajustar (opção A)

#### UI-02 · Aviso passageiro de sucesso

- **Hoje:** Toast próprio para confirmações rápidas (emenda 2); erro fica como alerta na tela. _(constitution 3.0.0)_
- **Proposta:** O kit da Benenutri usa alerta no fluxo e "Salvo às HH:MM" no card; sem toast.
- **Opções:**
  - A (recomendada): Sem toast (padrão do kit).
  - B: Toast próprio, sobre os tokens.
- **Decisão:** Ajustar (opção A)

#### UI-03 · Campo de data

- **Hoje:** Seletor de data próprio (emenda 3), sem o controle nativo. _(constitution 3.0.0)_
- **Proposta:** Controle de data do kit.
- **Opções:**
  - A (recomendada): Controle do kit.
  - B: Seletor próprio, sobre os tokens.
- **Decisão:** Ajustar (opção B)

#### UI-04 · Identidade do quadro

- **Hoje:** Nome, subtítulo e cor primária configuráveis em Configurações. _(KANBAN_SETTINGS)_
- **Proposta:** Nome e descrição do quadro na administração do motor; a cor vem do design system e não se configura.
- **Decisão:** Manter

#### UI-05 · O card aberto

- **Hoje:** Painel com campos, itens, alertas, NF, B.O., checklist, comentários, anexos e linha do tempo. _(PipeWorkspace.tsx)_
- **Proposta:** Card do motor em três colunas: responsáveis, prazo e passagens à esquerda; abas Nesta fase, Chat, Tarefas, Anexos, Alterações mais Itens e Alertas do SGC no meio; "Mover para" e as ações (Aprovar, Reprovar, Cancelar, Enviar) à direita. Salva ao sair do campo, sem botão Salvar.
- **Decisão:** Manter

#### UI-06 · Comentários, checklist e anexos

- **Hoje:** Implementação própria do SGC. _(KANBAN_CARD_COMMENTS · KANBAN_CHECKLISTS · KANBAN_CARD_ATTACHMENTS)_
- **Proposta:** Chat, Tarefas e Anexos do motor. Arquivo anexado fica em endereço público (aviso na tela); documento sensível vai como link.
- **Decisão:** Manter

#### UI-07 · Tela de notificações

- **Hoje:** Feed de "você foi adicionado como responsável" e afins. _(NotificationsPage (SF 177))_
- **Proposta:** Sai na onda 1: o cartão já mostra mensagens novas para quem olha, e a menção avisa por e-mail.
- **Opções:**
  - A (recomendada): Descartar na onda 1.
  - B: Manter uma tela de notificações.
- **Decisão:** Ajustar (opção B)

### Desenho que depende de regra

#### DS-01 · Campos do quadro × dados do pedido

- **Hoje:** Tudo em tabelas próprias do SGC; o quadro tem 9 campos dinâmicos (núcleo, filial, fornecedor, tipo, observações, valor negociado, previsão de entrega, prioridade, etiquetas). _(docs/validacao/017/relatorio-conferir-seed.md)_
- **Proposta:** Campos do quadro só para o que precisa aparecer na capa e na busca: fornecedor, filial, valor total, alertas pendentes e motivo do cancelamento, gravados pelo SGC. Todo o resto (itens, aprovações, prazo de pagamento, envio) fica nas tabelas do pedido.
- **Opções:**
  - A (recomendada): Cinco campos do quadro espelhados; o resto nas tabelas do pedido.
  - B: Nada no quadro; a capa mostra só título, responsáveis e tempos até a lib ter capa em lote.
- **Decisão:** Ajustar (opção A)

#### DS-02 · Campos livres do administrador

- **Hoje:** Admin cria campos dinâmicos por fase em Configurações. _(KANBAN_FIELD_DEFS)_
- **Proposta:** Nativo do construtor do motor: o admin acrescenta campos (observações, previsão de entrega, etiquetas…) sem código; a regra do SGC não depende deles.
- **Decisão:** Manter

#### DS-03 · Etiquetas

- **Hoje:** Etiquetas por card com cor. _(KANBAN_TAGS)_
- **Proposta:** Etiquetas do motor (campo reservado, selo, filtro).
- **Decisão:** Manter

## Onda 2

### Nota fiscal e faturamento

#### O2-01 · Detecção automática de NF

- **Hoje:** A cada 30 minutos o sistema varre as entradas do WinThor e sugere o vínculo com o pedido (por número do pedido, por itens com score, ou por fornecedor e filial). Nenhum vínculo é efetivado sem confirmação humana. NF já vinculada a outro card não é sugerida. _(spec 009)_
- **Proposta:** Manter na onda 2.
- **Decisão:** Manter

#### O2-02 · Conferência NF × pedido

- **Hoje:** Item casado por código do produto, depois código de fábrica, depois EAN. Preço com tolerância de 1 %; quantidade maior; validade mínima de 120 dias da emissão (ou a do fornecedor). Toda comparação, inclusive conforme, vira ocorrência com decisão (aceito/recusado, quem, quando). Divergência não bloqueia o vínculo. _(spec 009)_
- **Proposta:** Manter na onda 2.
- **Decisão:** Manter

#### O2-03 · Faturamento e cobrança

- **Hoje:** Medido em valor e quantidade; 100 % em valor conclui. Atraso conta em dias úteis (seg–sex, sem feriados) a partir do envio, escalando em 3, 5 e mais 5 dias. Cobrança ao fornecedor é manual, por e-mail com cópia, com histórico de contatos. _(spec 009 · SLA do fornecedor)_
- **Proposta:** Manter na onda 2.
- **Decisão:** Manter

#### O2-07 · Registro híbrido de NF

- **Hoje:** Busca a nota no WinThor por número e fornecedor sem exigir entrada confirmada, pré-preenchendo o registro manual. _(spec 010)_
- **Proposta:** Manter na onda 2.
- **Decisão:** Manter

### Trânsito e recebimento

#### O2-04 · Recebimento nota a nota

- **Hoje:** Entrar em Trânsito exige ao menos uma NF. Previsão por nota = faturamento + prazo do fornecedor. Sincronização a cada 2 horas em horário comercial; alerta de atraso uma vez por dia por nota; com 100 % recebido o card vai sozinho para Faturamento em Andamento. _(spec 010)_
- **Proposta:** Manter na onda 2.
- **Decisão:** Manter

#### O2-05 · Concluir o pedido

- **Hoje:** Só com zero validades pendentes (as acima de 120 dias são aceitas sozinhas) e zero validações de NF sem decisão. _(moveCardByBusinessRules)_
- **Proposta:** Manter na onda 2.
- **Decisão:** Manter

### Produtos em B.O.

#### O2-06 · B.O.

- **Hoje:** Itens indisponíveis com previsão de liberação, carta de falta, clientes impactados nos últimos 60 dias, painel consolidado visível a todas as personas, alerta diário enquanto o card estiver em B.O. _(spec 001 · SFs 418–426)_
- **Proposta:** Manter na onda 2.
- **Decisão:** Manter

## Onda 3

### Solicitações do comercial

#### O3-01 · Solicitação

- **Hoje:** Comercial cria (produto, quantidade, justificativa, cliente, prioridade); analista avalia; recusa exige motivo; aprovada é vinculada ao pedido, nunca duplicada; 13 status acompanham a fase do card; rastreio pós-aprovação por cliente (venda a partir da aprovação); vendedor vem do Comercial 360 e cliente do TOTVS. _(spec 004)_
- **Proposta:** Manter na onda 3.
- **Decisão:** Manter

#### O3-02 · Solicitações na montagem

- **Hoje:** Na Análise aparecem as solicitações ativas do mesmo fornecedor e filial, para vincular ao pedido. _(spec 001 RN-8)_
- **Proposta:** Manter na onda 3.
- **Decisão:** Manter

### Indicadores e relatórios

#### O3-03 · KPIs e SLA

- **Hoje:** Agregação no backend; SLA por etapa (análise, faturamento, entrega) contra as metas do fornecedor, em dias úteis; cancelados fora; aderência = % de solicitações atendidas; construtor de relatórios salvos. _(spec 005)_
- **Proposta:** Manter na onda 3.
- **Decisão:** Manter

### Formulário público

#### O3-04 · Card por usuário externo

- **Hoje:** Só os campos declarados; cria o card na fase inicial; não lista nem consulta; sem limite de envios (dívida). _(spec 008)_
- **Proposta:** Manter na onda 3, com limite de envios.
- **Decisão:** Descartar — [Descartado por consequência da C-01: sem formulário público.]

### Extrato do pedido

#### O3-05 · PDF do pedido

- **Hoje:** Retrato, monocromático, logo embutida; marca d'água NÃO APROVADO nas fases de decisão e CANCELADO quando cancelado; três linhas de assinatura; prazo padrão × acordado com justificativa. _(spec 001 HU-12)_
- **Proposta:** Manter na onda 3.
- **Decisão:** Manter

## Onda 4

### Compras inteligentes

#### O4-01 · Sugestão por ponto de pedido

- **Hoje:** Consumo diário = venda ÷ dias; segurança = lead time × consumo; ponto de pedido = 2 × lead time × consumo; máximo = cobertura × consumo; sugerida = arredondar para cima(máximo − atual − trânsito), nunca negativa; status RUPTURA, EXCESSO, ELEVADA EXPOSIÇÃO, BAIXA EXPOSIÇÃO ou ADEQUADO; cálculo no backend. _(spec 002)_
- **Proposta:** Manter na onda 4.
- **Decisão:** Manter

#### O4-02 · Parâmetros e exceções

- **Hoje:** Precedência SKU > fornecedor > regra ABC > padrão (cobertura 35 dias, lead time 9, gatilho 15); produto silenciado sai da lista; vendas atípicas podem ser desconsideradas; lead time por média móvel. _(spec 002 · spec 006)_
- **Proposta:** Manter na onda 4.
- **Decisão:** Manter

#### O4-04 · Carrinho e eficiência

- **Hoje:** Carrinho por fornecedor cria o pedido no quadro; eficiência do comprador compara sugestão × compra; unidades por caixa vêm da integração gestão-de-custos. _(spec 002)_
- **Proposta:** Manter na onda 4.
- **Decisão:** Manter

#### O4-05 · Layout do sistema antigo (Opção A) — 2026-10-30

- **Hoje:** Cards de visão com contagem (a comprar, completar compra, todos, em trânsito), lista com painel de detalhe fixo (KPIs, gráfico compras × vendas com projeção, simulação, atributos, compras, vendas, filiais com excesso, parâmetros), carrinho persistido com retomada, pedido mínimo por grupo, variação de custo e arquivo de importação do WinThor. _(p-60523)_
- **Proposta:** Reproduzir o layout (mockups aprovados), com tokens e vocabulário do kit; o que a spec 011 não tinha entra como cenário novo com teste; o que não cabe fica adiado na spec.
- **Decisão:** Ajustar (R-117). Regra nova de gráfico: valor escrito em toda barra e ponto, inclusive projeção (R-116).

### Coberturas ABC

#### O4-03 · Cobertura por curva

- **Hoje:** Curva ABC 80/95; cobertura padrão por curva com limite sem justificativa (tolerância %); precedência Produto > Departamento > BU > Fornecedor; auditoria das alterações. _(spec 006)_
- **Proposta:** Manter na onda 4 (substitui o limite fixo de 90 dias da onda 1).
- **Decisão:** Manter

## Onda 5

### Movimentação de produtos

#### O5-01 · Estoque parado

- **Hoje:** Sem venda, excedentes e a vencer por filial (obrigatória); plano de ação Fato/Causa/Ação por produto; comercial não grava. _(spec 011)_
- **Proposta:** Manter na onda 5.
- **Decisão:** Manter

#### O5-02 · Perdas

- **Hoje:** Lotes vencidos com saldo e o rastro do lote entre filiais; janelas de 90, 180 e 365 dias. _(spec 012)_
- **Proposta:** Manter na onda 5.
- **Decisão:** Manter

#### O5-03 · Promocionais

- **Hoje:** Lotes a vencer na janela escolhida (90 dias padrão), custo da última entrada na filial, saldo vendável descontando bloqueado e reservado; única aba do comercial; exporta Excel. _(spec 014)_
- **Proposta:** Manter na onda 5.
- **Decisão:** Manter

#### O5-04 · Alerta de ruptura

- **Hoje:** Dispara quando consumiu ao menos 50 % do estoque reconstruído com aceleração de 1,5× sobre a base histórica (que exclui a janela recente), em tempo real menor que o esperado; mínimo 5 unidades; severidade pela cobertura no ritmo novo; reposição sugerida para 30 dias. _(spec 015)_
- **Proposta:** Manter na onda 5.
- **Decisão:** Manter

### Pedido Galderma

#### O5-05 · Mesa de negociação

- **Hoje:** Negociação mensal do fornecedor 1541: proposta da indústria × posição WinThor × decisão por filial, cobertura alvo 35 dias, log campo a campo. _(spec 013)_
- **Proposta:** Manter na onda 5.
- **Decisão:** Manter
