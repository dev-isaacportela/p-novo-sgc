# Spec: Quadro de compras

**ID:** 002-quadro-de-compras · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

O pedido de compra da Benenutri passa por dez etapas e quatro decisões de
pessoas diferentes — o analista monta, a gerência aprova tecnicamente, a
diretoria aprova e alguém envia à indústria —, mas hoje nada disso é garantido
pelo sistema: quem decide é conferido só na tela, a reprovação viaja sem motivo
quando alguém arrasta o cartão pelo caminho errado, o cancelamento acontece sem
justificativa e o envio à indústria é registrado depois, de memória. O
resultado é pedido que chega à diretoria sem ter passado pela gerência, pedido
cancelado sem ninguém saber por quê e pedido "enviado" que ninguém consegue
provar que saiu — cada um deles custa uma ligação para a indústria e, quando
falha, uma compra errada de dezenas de milhares de reais.

## Resultado esperado

Todo pedido de compra caminha pelas dez etapas numa ordem que o sistema
garante, cada decisão fica registrada com quem decidiu, quando e por quê, e
ninguém consegue pular uma aprovação nem cancelar em silêncio — nem pela tela,
nem por fora dela.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Analista de compras | criar o pedido do fornecedor e da filial, acompanhar o andamento, cancelar com motivo, registrar o envio à indústria | diária |
| Gerência de compras (gestor) | aprovar ou reprovar tecnicamente, mover o pedido em qualquer etapa, excluir pedido | diária |
| Diretoria | aprovar, reprovar ou devolver à gerência o pedido que está na etapa dela; excluir pedido | semanal |
| Administrador (TI) | manter as etapas, os campos e os avisos automáticos do quadro; atribuir a persona de cada pessoa | eventual |
| Comercial | nesta onda, nada no quadro: o comercial não vê pedidos, agenda nem fornecedores — a persona existe para barrar o acesso até as solicitações da onda 3 | — |

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

### Criação do pedido

**C-001 — Criar um pedido manualmente**
- **Dado que** a Ana é analista e escolheu o fornecedor "Nutrilatina", a filial "1 — Matriz" e o período de vendas de 01/08/2026 a 15/09/2026
- **Quando** confirma a criação
- **Então** nasce 1 pedido na etapa "Análise/Montagem de Pedido", com o título "1 — MATRIZ · NUTRILATINA", tendo a Ana como criadora e como responsável inicial

**C-002 — Criação sem os três obrigatórios é recusada**
- **Dado que** a Ana deixou a filial em branco
- **Quando** tenta confirmar a criação
- **Então** nenhum pedido é criado e a mensagem cita "filial"

**C-003 — Período de vendas já vem sugerido**
- **Dado que** hoje é 15/09/2026 e a Ana abriu a criação de pedido
- **Quando** a tela termina de carregar
- **Então** o período vem preenchido com 45 dias — de 01/08/2026 a 15/09/2026 — e é editável

### Quem move o quê

**C-004 — Analista entrega o pedido para a aprovação técnica**
- **Dado que** o pedido 10 está em "Análise/Montagem de Pedido" e a Ana é analista
- **Quando** move o pedido para "Aprovação Técnica"
- **Então** o pedido fica em "Aprovação Técnica" e a passagem fica registrada

**C-045 — O período aceita a quantidade de dias** *(2026-10-30, R-119)*
- **Dado que** a pessoa está criando o pedido e o fim do período de vendas é 30/10/2026
- **Quando** ela escreve "30" no campo **Dias** ao lado das datas e sai do campo
- **Então** o início vira 30/09/2026 (fim − 30) e o campo Dias continua mostrando 30; mudando o início para 01/10/2026, Dias passa a 29 — é derivado das datas; Dias vazio ou fora de 1 a 999 não mexe nas datas e avisa "Informe de 1 a 999 dias"; o padrão mostra 45 (a mesma conta do período padrão); escrever "45" direto no campo de data também resolve, mas o campo Dias é o caminho visível

**C-005 — A Análise nunca vai direto para a Diretoria**
- **Dado que** o pedido 10 está em "Análise/Montagem de Pedido"
- **Quando** qualquer pessoa tenta mandá-lo para "Aprovação da Diretoria"
- **Então** o pedido continua onde estava e a recusa diz "O pedido precisa passar pela Aprovação Técnica antes de ir para a Aprovação da Diretoria."

**C-006 — Diretoria só movimenta o que está na etapa dela**
- **Dado que** a Dora é diretoria e o pedido 11 está em "Aprovação Técnica"
- **Quando** tenta mover o pedido 11
- **Então** o pedido não sai do lugar e a recusa diz "Você só movimenta pedidos na fase Aprovação da Diretoria."

**C-007 — Gerência movimenta em qualquer etapa**
- **Dado que** o Gil é gestor e o pedido 12 está em "Em Trânsito para BN"
- **Quando** move o pedido para "Faturamento em Andamento"
- **Então** o pedido muda de etapa normalmente

**C-008 — Acesso somente leitura vê e não opera**
- **Dado que** o Gil é gestor e o acesso dele na plataforma foi mudado para somente leitura
- **Quando** abre qualquer pedido
- **Então** todos os destinos e todas as ações aparecem desabilitados com o motivo "Seu acesso é somente leitura." e nenhuma tentativa dele altera o pedido — o nível da plataforma vale acima da persona

**C-009 — Acesso restrito opera só os próprios pedidos**
- **Dado que** o usuário tem acesso restrito na plataforma e o pedido 13 foi criado por outra pessoa
- **Quando** tenta mover o pedido 13
- **Então** a recusa diz que ele só opera os pedidos que criou; o pedido 14, criado por ele, continua movível

**C-044 — O comercial não entra no quadro**
- **Dado que** o Leo tem a persona comercial
- **Quando** entra no sistema
- **Então** o menu não traz Quadro, Agenda nem Fornecedores; abrir o endereço do quadro direto mostra "Seu perfil não tem acesso ao quadro de compras." e qualquer tentativa dele de mover ou excluir pedido é recusada pelo servidor com a mesma frase

**C-010 — Pessoa sem persona atribuída age como analista**
- **Dado que** a Paula não tem persona atribuída e tem acesso comum na plataforma
- **Quando** abre um pedido em "Análise/Montagem de Pedido"
- **Então** pode criar, editar e mover como analista, e não vê as ações de aprovação

**C-011 — A regra não depende da tela**
- **Dado que** a Dora é diretoria e o pedido 11 está em "Aprovação Técnica"
- **Quando** o pedido 11 é mandado para outra etapa por fora da tela (uma chamada direta ao sistema, em nome da Dora)
- **Então** a movimentação é recusada com o mesmo motivo de C-006 e nada é gravado

**C-012 — As etapas 5 a 8 respeitam só a persona nesta onda**
- **Dado que** o pedido 12 está em "Enviado para Indústria" e não há nota fiscal vinculada
- **Quando** o Gil move para "Em Trânsito para BN"
- **Então** o pedido avança (as travas de nota, recebimento e faturamento são da onda 2)

### Aprovação técnica

**C-013 — Gestor aprova tecnicamente**
- **Dado que** o pedido 20 está em "Aprovação Técnica" e o Gil é gestor
- **Quando** usa a ação "Aprovar tecnicamente"
- **Então** o pedido vai para "Aprovação da Diretoria", fica gravado que o Gil aprovou e quando, e o histórico do pedido ganha a linha "Aprovado tecnicamente por Gil Gestor"

**C-014 — Reprovação técnica sem motivo é recusada**
- **Dado que** o Gil abriu a ação "Reprovar" do pedido 20 e deixou o motivo em branco
- **Quando** confirma
- **Então** nada é gravado, o pedido continua em "Aprovação Técnica" e a mensagem cita "motivo"

**C-015 — Reprovação técnica com motivo e produtos**
- **Dado que** o Gil informou o motivo "Preço acima do praticado" e marcou 2 produtos reprovados no pedido 20
- **Quando** confirma a reprovação
- **Então** o pedido volta para "Análise/Montagem de Pedido", o motivo e os 2 produtos ficam visíveis para o analista, e o histórico ganha "Reprovado tecnicamente por Gil Gestor"

**C-016 — Reenviar limpa a reprovação anterior**
- **Dado que** o pedido 20 voltou reprovado e a Ana corrigiu o que foi apontado
- **Quando** move de novo para "Aprovação Técnica"
- **Então** o motivo da reprovação técnica e a lista de produtos reprovados somem do pedido, e o gestor vê o pedido sem marca de reprovação

**C-017 — Devolver para a Análise só pelo botão de reprovar**
- **Dado que** o pedido 20 está em "Aprovação Técnica"
- **Quando** o Gil tenta mover direto para "Análise/Montagem de Pedido" sem usar "Reprovar"
- **Então** a movimentação é recusada com "Para devolver o pedido para análise, use a ação Reprovar e informe o motivo."

### Aprovação da diretoria

**C-018 — Diretoria aprova**
- **Dado que** o pedido 21 está em "Aprovação da Diretoria" e a Dora é diretoria
- **Quando** usa a ação "Aprovar"
- **Então** o pedido vai para "Envio para Indústria", fica gravado quem aprovou e quando, e o histórico ganha "Aprovado pela diretoria por Dora Diretora"

**C-019 — Diretoria reprova com motivo próprio**
- **Dado que** o pedido 21 já tinha uma reprovação técnica antiga registrada e a Dora informa o motivo "Fluxo de caixa do mês"
- **Quando** confirma a reprovação
- **Então** o pedido volta para "Análise/Montagem de Pedido" e o motivo da diretoria fica guardado separado do motivo da gerência — o analista consegue dizer quem devolveu o pedido

**C-020 — Diretoria devolve à gerência sem motivo**
- **Dado que** o pedido 21 está em "Aprovação da Diretoria"
- **Quando** a Dora usa a ação "Devolver à Aprovação Técnica"
- **Então** o pedido volta para "Aprovação Técnica" sem exigir motivo, e a passagem fica no histórico

**C-021 — A Diretoria só recebe da Técnica, mas aceita o retorno do Envio**
- **Dado que** o pedido 22 está em "Envio para Indústria"
- **Quando** alguém o move de volta para "Aprovação da Diretoria"
- **Então** a movimentação é aceita (retorno), enquanto de "Análise/Montagem" continua recusada (C-005)

### Cancelamento

**C-022 — Cancelar de qualquer etapa, com motivo**
- **Dado que** o pedido 30 está em "Faturamento em Andamento" e o Gil informou o motivo "Indústria cancelou a campanha"
- **Quando** confirma o cancelamento
- **Então** o pedido vai para "Compras Canceladas", o motivo aparece no cartão do quadro e no pedido aberto, e fica gravado quem cancelou e quando

**C-023 — Não existe cancelamento silencioso**
- **Dado que** o pedido 30 está em qualquer etapa ativa
- **Quando** a pessoa abre a lista de destinos
- **Então** "Compras Canceladas" aparece desabilitada com o motivo 'Use a ação "Cancelar compra" para informar o motivo.'

**C-024 — Cancelar sem motivo é recusado**
- **Dado que** a pessoa deixou o motivo em branco no formulário de cancelamento
- **Quando** confirma
- **Então** nada é gravado e a mensagem cita "motivo"

**C-025 — Cancelar não cobra nada da etapa atual**
- **Dado que** o pedido 31 está em "Análise/Montagem de Pedido" com pendências que impedem o avanço
- **Quando** é cancelado com motivo
- **Então** o cancelamento acontece mesmo assim

**C-026 — Cancelado e Concluído são finais**
- **Dado que** o pedido 30 está em "Compras Canceladas"
- **Quando** alguém abre a lista de destinos
- **Então** nenhum destino está disponível (só o administrador do quadro reabre)

### Envio à indústria

**C-027 — Registrar o envio por e-mail**
- **Dado que** o pedido 40 está em "Envio para Indústria", o fornecedor tem 2 contatos cadastrados na linha de produto, a data de envio é 15/09/2026 e o número do pedido no ERP é 998877
- **Quando** a Ana confirma o envio por e-mail escolhendo 1 dos contatos
- **Então** sai 1 e-mail para o contato escolhido com cópia obrigatória para compras@benenutri.com, o envio fica registrado no pedido (canal, data, destinatário e número do pedido) e aparece na lista de comunicações do pedido

**C-028 — Envio sem data ou sem número do pedido é recusado**
- **Dado que** a Ana deixou o número do pedido no ERP em branco
- **Quando** confirma o envio
- **Então** nada é enviado nem gravado e a mensagem cita "número do pedido"

**C-029 — "Enviado para Indústria" exige o envio registrado**
- **Dado que** o pedido 41 está em "Envio para Indústria" sem envio registrado
- **Quando** alguém tenta movê-lo para "Enviado para Indústria"
- **Então** a movimentação é recusada com "Registre o envio do pedido (plataforma ou e-mail) antes de mover para Enviado para Indústria."

**C-030 — Envio pela plataforma do fornecedor**
- **Dado que** o fornecedor tem link de plataforma e a Ana escolheu o canal "plataforma"
- **Quando** confirma o envio com data e número do pedido
- **Então** nenhum e-mail é disparado, o envio fica registrado com o canal "plataforma" e a comunicação aparece na lista com o link usado

**C-031 — O envio atualiza a agenda que gerou o pedido**
- **Dado que** o pedido 42 nasceu de um agendamento planejado para 10/09/2026 e o envio real aconteceu em 15/09/2026
- **Quando** o envio é registrado
- **Então** o agendamento passa a mostrar a data real 15/09/2026 e preserva a planejada 10/09/2026

### Avisos automáticos

**C-032 — Mudança de etapa avisa por e-mail**
- **Dado que** o pedido 50 tem 2 responsáveis
- **Quando** entra em "Aprovação Técnica"
- **Então** sai 1 e-mail para os 2 responsáveis com cópia para compras@benenutri.com, citando o pedido e a etapa de destino

**C-033 — Conclusão manda os anexos ao criador**
- **Dado que** o pedido 51 tem 2 anexos e foi criado pela Ana
- **Quando** entra em "Compras Concluídas"
- **Então** a Ana recebe 1 e-mail listando os 2 anexos (nome e endereço); sem anexos, o e-mail diz "Nenhum anexo"

**C-034 — Cancelamento avisa com assunto próprio**
- **Dado que** o pedido 30 foi cancelado
- **Quando** entra em "Compras Canceladas"
- **Então** o e-mail sai com o assunto de pedido cancelado e traz o motivo do cancelamento

### Quadro, permissões e telas

**C-035 — O cartão mostra o essencial**
- **Dado que** o pedido 10 tem fornecedor "Nutrilatina", filial "1 — Matriz", valor total R$ 128.450,00 e prioridade "alta"
- **Quando** alguém olha o quadro
- **Então** o cartão mostra os quatro dados, os responsáveis, as etiquetas e os três tempos; na etapa de Análise mostra também os alertas pendentes e, em Canceladas, o motivo

**C-036 — Criar pedido é pelo botão do SGC** *(revisado em 2026-10-30, R-118)*
- **Dado que** qualquer pessoa com permissão de criar abre o quadro
- **Quando** procura como criar
- **Então** existe um único botão, "Novo pedido", que abre a criação do pedido numa janela sobre o quadro — não o formulário genérico de card, e não uma página à parte; o menu lateral não tem "Novo pedido", e o pedido criado aparece na etapa de Análise e abre em seguida

**C-037 — O quadro atualiza sozinho**
- **Dado que** o quadro está aberto e outra pessoa move um pedido
- **Quando** passam 60 segundos
- **Então** a tela mostra o pedido na etapa nova sem que ninguém recarregue, e sem piscar indicador de carregamento

**C-038 — Administração do quadro é só do administrador**
- **Dado que** o Gil é gestor
- **Quando** tenta abrir a administração do quadro
- **Então** o acesso é recusado; para o administrador, a administração abre e permite renomear e recolorir etapas

**C-039 — Excluir pedido é de gestor, diretoria e administrador**
- **Dado que** a Ana é analista e abriu o pedido 10
- **Quando** procura excluir
- **Então** não existe a opção para ela, e a exclusão é recusada mesmo se tentada por fora da tela; para o Gil, a exclusão funciona

**C-040 — Ação sem permissão fica desabilitada, não some**
- **Dado que** a Ana é analista e o pedido 20 está em "Aprovação Técnica"
- **Quando** abre o pedido
- **Então** as ações "Aprovar tecnicamente" e "Reprovar" aparecem desabilitadas com o motivo, em vez de sumirem da tela

**C-041 — Notificações do que é meu**
- **Dado que** a Ana é responsável por 3 pedidos e, na última hora, foi incluída como responsável em 1 pedido, 1 dos seus pedidos mudou de etapa e chegou 1 mensagem nova de outra pessoa
- **Quando** abre a tela de notificações
- **Então** vê as 3 novidades, da mais recente para a mais antiga, com o pedido e quem fez, em páginas de 25

**C-042 — Personas por usuário**
- **Dado que** o administrador abriu a tela de segurança
- **Quando** define a persona "gestor" para o Gil
- **Então** o Gil passa a decidir a aprovação técnica na sessão seguinte; a mesma tela é recusada para quem não é administrador nem diretoria

**C-043 — As decisões ficam no histórico do pedido**
- **Dado que** o pedido 20 foi aprovado tecnicamente, reprovado pela diretoria, reenviado e cancelado
- **Quando** alguém abre o histórico do pedido
- **Então** encontra as 4 decisões em ordem, cada uma com quem decidiu, quando e o motivo quando houver, além das passagens por etapa

### O card depois da Análise (R-150)

**C-046 — O card abre com o resumo do pedido e os selos do que aconteceu**
- **Dado que** o pedido foi aprovado tecnicamente pelo Gil, aprovado pela diretoria e enviado por e-mail com o número 8372
- **Quando** alguém abre o card em qualquer fase depois da Análise
- **Então** o topo mostra fornecedor, filial, valor do pedido, o % faturado com a barra (depois do envio; antes, o prazo de pagamento) e os selos "Aprovação técnica por Gil em…", "Aprovado pela diretoria por… em…" e "Enviado à indústria"; num pedido cancelado, o selo "Compra cancelada" traz motivo, quem e quando

**C-047 — A aprovação lê a análise do pedido antes dos itens**
- **Dado que** o pedido em Aprovação Técnica ou da Diretoria tem 12 itens, 2 em preço especial e 2 com cobertura acima do limite da curva
- **Quando** quem aprova abre o card
- **Então** vê "Análise para aprovação" com itens, cobertura média hoje → depois da compra, os itens acima do limite com o valor e o preço especial com o % do pedido; e "Indicadores do pedido", recolhido, com cada indicador abrindo os produtos que o compõem

**C-048 — O envio mostra o que vai ao fornecedor**
- **Dado que** o pedido está em Envio para Indústria
- **Quando** o comprador abre o card
- **Então** vê produtos, unidades e valor total, "Copiar itens" (código, produto, embalagem, quantidade e custo, sem a marca Comercial), "Arquivo WinThor" no formato da RN-023 da 011, os itens em cartões com o total e "Registrar envio" no fim — o mesmo diálogo da coluna da direita

**C-049 — O enviado diz como saiu e o que falta para o trânsito**
- **Dado que** o pedido está em Enviado para Indústria, sem nota vinculada
- **Quando** o comprador abre o card
- **Então** vê data, método, contato e número do pedido do envio, a observação, e "Próximo movimento: Em Trânsito para BN — Vincule a nota fiscal para liberar"; com 1 nota, "1 nota vinculada"

**C-050 — Compras × vendas do fornecedor na aprovação** *(R-156, P-1)*
- **Dado que** o pedido da Fresenius na filial 1 analisou as vendas de 19/09 a 02/11 e soma R$ 328.859,14
- **Quando** quem aprova abre "Compras × vendas do fornecedor" no card
- **Então** o card consulta o WinThor só nesse momento e mostra o comprado e o vendido do fornecedor na filial no período, o % compras × vendas de hoje e o de depois deste pedido; sem meta de compras (decisão do usuário), e com "sem compra nem venda no período" quando o fornecedor não aparece

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE criar o pedido a partir de fornecedor, filial e período de vendas, os três obrigatórios; cada data do período pode ser escrita como data ou como quantidade de dias a partir da outra ponta (R-119) | C-001 cria 1 pedido na primeira etapa; C-002 recusa citando o campo em falta; C-045 resolve "45" para a data | must |
| RF-002 | O título do pedido DEVE ser gerado como "FILIAL · FORNECEDOR" e não é editável | pedido de filial "1 — Matriz" e fornecedor "Nutrilatina" nasce "1 — MATRIZ · NUTRILATINA" | must |
| RF-003 | O período de vendas DEVE vir sugerido com os últimos 45 dias, editável | em 15/09/2026 a sugestão é 01/08/2026 a 15/09/2026 | must |
| RF-004 | O criador do pedido DEVE ser quem criou e também o responsável inicial | o pedido de C-001 mostra a Ana nos dois papéis | must |
| RF-005 | O quadro DEVE ter as dez etapas do processo, na ordem, identificadas por uma chave que não muda quando o administrador renomeia ou recolore | renomear "Produtos em B.O." para "Pendências" não quebra nenhuma regra de C-004 a C-034 | must |
| RF-006 | O cartão DEVE mostrar fornecedor, filial, valor total e prioridade, mais alertas pendentes na Análise e o motivo em Canceladas | C-035 | must |
| RF-007 | O quadro DEVE se atualizar sozinho a cada 60 segundos | C-037 | should |
| RF-008 | O quadro DEVE oferecer "Novo pedido" no lugar do botão genérico de criar cartão, abrindo a criação numa janela sobre o quadro; criar pedido não é item de menu (R-118) | C-036: existe um botão, ele abre a janela, e nenhum menu leva a uma página de criação | must |
| RF-009 | As transições DEVEM ser exatamente: Análise→Técnica; Técnica→Diretoria ou →Análise; Diretoria→Envio, →Técnica ou →Análise; Envio→Enviado ou →Diretoria; Enviado→Trânsito; Trânsito→Faturamento; Faturamento→B.O. ou →Concluídas; B.O.→Faturamento ou →Concluídas; qualquer etapa ativa→Canceladas | as 10 etapas × 10 destinos conferidas uma a uma: 22 pares liberados (14 do fluxo + 8 cancelamentos), os demais recusados | must |
| RF-010 | Destino fora da regra DEVE aparecer desabilitado com o motivo, nunca sumir | C-005, C-006, C-017, C-023, C-029 | must |
| RF-011 | A mesma regra de movimentação DEVE valer no servidor, independentemente da tela | C-011: a chamada direta é recusada com o mesmo motivo | must |
| RF-012 | A persona DEVE ser um dado por usuário; sem persona vale o nível de acesso da plataforma e, em falha, analista | C-010 | must |
| RF-033 | A persona comercial DEVE ficar fora do quadro, da agenda e dos fornecedores — no menu, na rota e no servidor | C-044 | must |
| RF-013 | Aprovar tecnicamente DEVE gravar quem e quando, limpar a reprovação anterior e levar o pedido à Diretoria | C-013 | must |
| RF-014 | Reprovar tecnicamente DEVE exigir motivo, aceitar a lista de produtos reprovados e devolver o pedido à Análise | C-014, C-015 | must |
| RF-015 | Sair de novo da Análise DEVE limpar as reprovações anteriores (técnica e diretoria) | C-016 | must |
| RF-016 | Aprovar na diretoria DEVE gravar quem e quando e levar o pedido ao Envio | C-018 | must |
| RF-017 | Reprovar na diretoria DEVE exigir motivo, guardado separado do motivo da gerência, e devolver à Análise | C-019 | must |
| RF-018 | A diretoria DEVE poder devolver o pedido à Aprovação Técnica sem motivo | C-020 | must |
| RF-019 | Cancelar DEVE ser possível de qualquer etapa ativa, exigir motivo, ser o único caminho para Canceladas e deixar o motivo visível | C-022, C-023, C-024, C-025 | must |
| RF-020 | Registrar o envio DEVE exigir canal, data e número do pedido no ERP, e aceitar só contatos cadastrados do fornecedor | C-027, C-028, C-030 | must |
| RF-021 | O e-mail do pedido DEVE sair com cópia obrigatória para compras@benenutri.com | C-027: 1 destinatário + a cópia fixa | must |
| RF-022 | Mover para "Enviado para Indústria" DEVE exigir o envio registrado | C-029 | must |
| RF-023 | Toda comunicação enviada ao fornecedor DEVE ficar registrada e visível no pedido | C-027, C-030 | must |
| RF-024 | O envio DEVE atualizar o agendamento que gerou o pedido, preservando a data planejada | C-031 | should |
| RF-025 | A entrada em cada etapa DEVE disparar aviso por e-mail aos responsáveis, com cópia para compras@benenutri.com | C-032, C-034 | must |
| RF-026 | A entrada em "Compras Concluídas" DEVE mandar os anexos do pedido ao criador | C-033 | should |
| RF-027 | Excluir pedido DEVE ser permitido a gestor, diretoria e administrador, e recusado aos demais também fora da tela | C-039 | must |
| RF-028 | A administração do quadro (etapas, campos, avisos) DEVE ser só do administrador | C-038 | must |
| RF-029 | A tela de notificações DEVE listar responsável novo, pedido movido e mensagem nova nos meus pedidos, paginada | C-041 | should |
| RF-030 | A tela de segurança DEVE permitir a administrador e diretoria atribuir a persona de cada usuário | C-042 | must |
| RF-031 | Cada decisão (aprovação, reprovação, cancelamento, envio) DEVE virar uma linha no histórico do pedido | C-043 | must |
| RF-032 | Ação sem permissão DEVE aparecer desabilitada com o motivo, nunca escondida | C-040 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir um pedido custa no máximo 2 consultas ao servidor | contador de execuções no teste de abertura do pedido: 2 |
| RNF-002 | O quadro se atualiza a cada 60 s sem indicador de carregamento e para quando a aba fica escondida | cronômetro e observação: 1 atualização por minuto, 0 com a aba oculta |
| RNF-003 | Toda listagem responde paginada, em páginas de 25, com o total | notificações com 60 registros: 3 páginas, total 60 |
| RNF-004 | A decisão de movimentação custa 1 consulta e devolve uma única resposta (pode/motivo) | teste da regra no servidor: 1 linha de resposta |
| RNF-005 | A matriz de permissões existe no máximo duas vezes — na tela e no servidor — e as duas concordam | teste que percorre 5 personas × 10 etapas × 10 destinos nos dois lados, sem divergência |

## Entidades do domínio

- **Pedido de compra** — a compra de um fornecedor para uma filial, num período de vendas. Nasce na Análise, caminha pelas etapas e termina concluído ou cancelado. Tem criador, responsáveis, valor total, prioridade e as decisões tomadas sobre ele.
- **Etapa** — uma das dez fases do processo. Tem nome e cor editáveis pelo administrador e uma identidade estável de que as regras dependem.
- **Persona** — o papel da pessoa no SGC: analista, gestor, diretoria, administrador ou comercial. É um dado atribuído por usuário e decide o que cada um pode fazer. O comercial, nesta onda, é quem **não** usa o quadro.
- **Decisão** — aprovação técnica, reprovação técnica, aprovação da diretoria, reprovação da diretoria, devolução, cancelamento e envio. Cada uma guarda quem, quando e, quando exigido, o motivo.
- **Comunicação** — cada envio do pedido à indústria (por e-mail ou pela plataforma), com destinatário, cópia, assunto, conteúdo, quem enviou e quando.
- **Notificação** — o que aconteceu nos pedidos de uma pessoa: entrou como responsável, o pedido mudou de etapa, chegou mensagem nova de outra pessoa.

## Regras de negócio

- **RN-001** — A persona vem do cadastro do usuário; sem persona atribuída, vale o nível de acesso da plataforma (administrador → admin, comum → analista, restrito → comercial); se a consulta falhar, vale analista.
- **RN-002** — Acesso somente leitura não opera nada; acesso restrito opera apenas os pedidos que a própria pessoa criou. Os dois valem **além** da persona, nunca no lugar dela.
- **RN-021** — A persona comercial não vê o quadro, a agenda nem os fornecedores: o item some do menu, a rota é recusada e o servidor nega qualquer movimento ou exclusão feito por ela.
- **RN-003** — As transições permitidas são as de RF-009 e não são configuráveis.
- **RN-004** — De "Análise/Montagem de Pedido" para "Aprovação da Diretoria" nunca, com a mensagem de C-005.
- **RN-005** — Movimenta o pedido: administrador, analista e gestor em qualquer etapa; diretoria só na etapa "Aprovação da Diretoria"; comercial, nenhuma.
- **RN-006** — "Compras Canceladas" só se alcança pelo formulário de cancelamento, com motivo preenchido; a lista de destinos sempre mostra a etapa desabilitada.
- **RN-007** — Cancelar não exige nada da etapa atual.
- **RN-008** — "Compras Concluídas" e "Compras Canceladas" não têm saída; só o administrador do quadro reabre.
- **RN-009** — Reprovação (técnica ou da diretoria) só acontece pela ação própria, com motivo obrigatório; os dois motivos são guardados separados.
- **RN-010** — Ao sair de novo da Análise, as reprovações anteriores são apagadas.
- **RN-011** — "Aprovação da Diretoria" só recebe de "Aprovação Técnica" ou, como retorno, de "Envio para Indústria".
- **RN-012** — O envio exige canal, data e número do pedido no ERP; por e-mail, o destinatário sai dos contatos cadastrados do fornecedor e a cópia para compras@benenutri.com é obrigatória.
- **RN-013** — "Enviado para Indústria" só recebe pedido com envio registrado.
- **RN-014** — O título é "FILIAL · FORNECEDOR" e o período sugerido são os últimos 45 dias.
- **RN-015** — Excluem o pedido: administrador, gestor e diretoria. Ninguém mais, nem por fora da tela.
- **RN-016** — Administra o quadro (etapas, campos, avisos automáticos): só o administrador.
- **RN-017** — Nenhum campo de etapa é obrigatório; toda exigência é regra de saída da etapa, para que voltar e cancelar nunca sejam barrados por formulário incompleto.
- **RN-018** — A prioridade do pedido é normal, alta ou urgente, e nasce normal.
- **RN-019** — Viram linha no histórico: movimentação, foto dos campos ao sair da etapa, aprovações, reprovações, devolução, cancelamento e envio.
- **RN-020** — Nas etapas de "Enviado para Indústria" a "Produtos em B.O.", nesta onda, a única exigência é a persona.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | criar com fornecedor/filial/período devolve 1 pedido na etapa 1, título "1 — MATRIZ · NUTRILATINA", criador e responsável = quem criou | regra de negócio |
| C-002 | filial vazia → recusa, e a mensagem contém "filial"; 0 pedidos criados | regra de tela |
| C-003 | com hoje = 15/09/2026, a sugestão é início 01/08/2026 e fim 15/09/2026 | regra de tela |
| C-004 | analista move 1→2: resposta ok e o pedido consultado está na etapa 2 | regra de negócio |
| C-005 | mover 1→3 devolve recusa com a mensagem exata de F-04 e o pedido continua na etapa 1 | regra de negócio |
| C-006 | diretoria movendo pedido na etapa 2 → recusa citando "Aprovação da Diretoria"; na etapa 3 → aceita | regra de negócio |
| C-007 | gestor move 6→7 com sucesso | regra de negócio |
| C-008 | gestor com acesso somente leitura: 0 destinos liberados nas 10 etapas e a recusa cita "somente leitura" | regra de tela e de negócio |
| C-009 | acesso restrito: pedido de outro → recusa; pedido próprio → aceita | regra de negócio |
| C-010 | usuário sem linha de persona resolve para analista e move 1→2 | regra de negócio |
| C-011 | a regra chamada diretamente (sem passar pela tela) devolve pode=0 e o mesmo motivo de C-006 | regra de negócio |
| C-012 | gestor move 5→6 sem nenhum dado de nota fiscal: aceito | regra de negócio |
| C-013 | aprovar técnica grava quem/quando, zera o motivo anterior, e o histórico ganha 1 linha "Aprovado tecnicamente por Gil Gestor" | regra de negócio |
| C-014 | motivo vazio → recusa com "motivo"; nada gravado | regra de negócio |
| C-015 | reprovar grava motivo + 2 códigos de produto e o pedido volta à etapa 1 | regra de negócio |
| C-016 | depois do reenvio, motivo técnico e produtos reprovados voltam vazios | regra de negócio |
| C-017 | mover 2→1 sem reprovação registrada → recusa citando "Reprovar" | regra de negócio |
| C-018 | aprovar diretoria grava quem/quando e o pedido vai para a etapa 4 | regra de negócio |
| C-019 | motivo da diretoria gravado em campo próprio; o motivo técnico antigo continua legível | regra de negócio |
| C-020 | devolver 3→2 sem motivo: aceito, 1 passagem registrada | regra de negócio |
| C-021 | mover 4→3 aceito; 1→3 recusado | regra de negócio |
| C-022 | cancelar da etapa 7 grava motivo/quem/quando e leva o pedido à etapa 10 | regra de negócio |
| C-023 | a lista de destinos de qualquer etapa ativa traz "Compras Canceladas" com motivo 'Use a ação "Cancelar compra"…' | regra de tela |
| C-024 | motivo vazio → recusa com "motivo"; a etapa não muda | regra de negócio |
| C-025 | pedido com pendências de Análise cancela normalmente | regra de negócio |
| C-026 | pedido na etapa 10: 0 destinos liberados | regra de tela |
| C-027 | envio por e-mail: 1 destinatário + compras@benenutri.com na cópia; 1 comunicação gravada; data, canal e número do pedido no pedido | regra de negócio |
| C-028 | número do pedido vazio → recusa citando "número do pedido"; 0 e-mails e 0 comunicações | regra de negócio |
| C-029 | mover 4→5 sem data de envio → recusa com a mensagem de EN-04 | regra de negócio |
| C-030 | canal plataforma: 0 e-mails enviados, 1 comunicação do tipo plataforma gravada | regra de negócio |
| C-031 | a data real do envio chega ao agendamento de origem e a planejada continua legível | regra de negócio |
| C-032 | entrar na etapa 2 dispara 1 e-mail com 2 responsáveis + a cópia fixa | regra de negócio |
| C-033 | entrar na etapa 9 com 2 anexos: o corpo lista as 2 linhas "nome — endereço"; sem anexos, "Nenhum anexo" | regra de negócio |
| C-034 | entrar na etapa 10: assunto de cancelado e o motivo no corpo | regra de negócio |
| C-035 | o cartão devolve os 4 valores de capa e, na etapa 1, o número de alertas pendentes | regra de tela |
| C-036 | o rótulo do botão é "Novo pedido" e o menu de nenhuma persona, em nenhum nível, tem `/pedidos/novo` (R-118); a janela em si é verificação manual | regra de tela |
| C-037 | o intervalo de atualização configurado é 60000 ms | regra de tela |
| C-038 | gestor: administração recusada; admin: liberada | regra de negócio |
| C-039 | excluir como analista → recusa; como gestor → aceito; como diretoria → aceito | regra de negócio |
| C-040 | analista na etapa 2: as 2 ações de aprovação vêm desabilitadas com motivo (presentes, não ausentes) | regra de tela |
| C-041 | com 1 responsável novo + 1 movimentação + 1 mensagem nova, a lista devolve 3 linhas em ordem decrescente e o total 3 | regra de negócio |
| C-042 | salvar persona "gestor" para o Gil devolve 1 linha atualizada; a mesma escrita como analista → recusa | regra de negócio |
| C-043 | depois das 4 decisões, o histórico do pedido tem 4 linhas de decisão, cada uma com quem e quando | regra de negócio |
| C-044 | persona comercial: o menu devolve 0 itens de compras, a rota do quadro é recusada e `PODE = 0` em mover e excluir, com a frase do perfil | regra de tela e de negócio |
| C-045 | `diasRelativos` aceita "45", "45d", "45 dias" e recusa "1234", "abc", "15/09"; `resolverRelativo("45", 30/10/2026, −1)` = 15/09/2026, `("30", 01/10, 1)` = 31/10, `"0"` = a base, vira mês e ano; `diasEntre` 15/09→30/10 = 45 | regra de tela |
| RN-001 | sem persona e acesso comum → analista; acesso administrador → admin; acesso restrito → comercial | regra de tela |
| RN-002 | somente leitura + persona gestor → não opera; restrito + analista → só os próprios | regra de tela |
| RN-021 | comercial: `verQuadro` falso na tela e recusa no servidor em mover e excluir | regra de tela e de negócio |
| RN-003 | a tabela de transições devolve exatamente 22 pares liberados: 14 do fluxo e 8 para Canceladas | regra de tela |
| RN-004 | o par etapa 1 → etapa 3 é o único recusado com a mensagem de F-04, nas duas camadas | regra de tela e de negócio |
| RN-005 | 5 personas × 10 etapas: diretoria só libera a etapa 3; comercial, nenhuma | regra de tela |
| RN-006 | destino "Compras Canceladas" sem motivo gravado → recusa no servidor | regra de negócio |
| RN-007 | cancelar a partir da etapa 1 com pendências de saída: aceito, com 0 verificações de saída executadas | regra de negócio |
| RN-008 | etapas 9 e 10: 0 destinos liberados para qualquer persona | regra de tela |
| RN-009 | reprovação sem motivo recusada nos dois lados (tela e servidor) | regra de negócio |
| RN-010 | ao mover 1→2 com reprovações gravadas, os 3 campos de reprovação ficam vazios depois | regra de negócio |
| RN-011 | entrar na etapa 3 vindo da 2 e da 4 é aceito; vindo da 1, recusado | regra de negócio |
| RN-012 | envio com contato fora da lista cadastrada → recusa | regra de tela |
| RN-013 | mover 4→5 com data de envio gravada → aceito; sem ela → recusado | regra de negócio |
| RN-014 | título de "1 — Matriz" + "Nutrilatina" = "1 — MATRIZ · NUTRILATINA"; período de 15/09/2026 = 01/08 a 15/09 | regra de tela |
| RN-015 | excluir: admin/gestor/diretoria = 1; analista/comercial = 0 | regra de negócio |
| RN-016 | administrar o quadro: admin = 1; as outras 4 personas = 0 | regra de negócio |
| RN-017 | o quadro é criado com 0 campos obrigatórios, e mover para trás e cancelar não cobram formulário | regra de negócio |
| RN-018 | prioridade aceita normal/alta/urgente e nasce normal | regra de negócio |
| RN-019 | as 7 ações da lista geram 7 linhas de histórico, cada uma com autor e instante | regra de negócio |
| RN-020 | nas etapas 5, 6, 7 e 8 a única recusa possível é de persona | regra de negócio |
| C-046 | `resumo-do-pedido.test.mjs`: selos na ordem (técnica, diretoria, envio), reprovação como alerta com a da diretoria primeiro, cancelamento com motivo/quem/quando, faturado satura em 100 e diz quanto falta | regra de tela |
| C-047 | `aprovacao.test.mjs`: total, cobertura média atual → após, preço especial e os 9 indicadores com a lista de produtos (limite de cobertura do item, não 60 fixo) | regra de tela |
| C-048 | `envio-industria.test.mjs`: só vai o que tem quantidade, totais, texto do "Copiar itens" com cabeçalho e número pt-BR | regra de tela |
| C-049 | `envio-industria.test.mjs`: próximo movimento travado sem nota e liberado com 1 ou mais | regra de tela |
| C-050 | `aprovacao.test.mjs`: acha o fornecedor no ranking da `sgcWintComprasVsVendas` (009), % hoje e depois do pedido, `null` sem venda | regra de tela |

Verificação manual (só olho humano verifica):

- [ ] C-035 — o cartão no quadro, nos dois temas, com os quatro dados e os três tempos sem quebra de linha feia
- [ ] C-040 — as ações desabilitadas mostram o motivo ao passar o mouse
- [ ] C-023 — a lista de destinos com "Compras Canceladas" apagada, e a ação "Cancelar compra" visível ao lado
- [ ] C-041 e C-042 — notificações e segurança no layout do sistema, em tema claro e escuro

## Fora de escopo

- [ ] **Itens do pedido, análise de vendas e alertas** — são da spec 003; aqui só existe o lugar onde eles aparecem e o ponto em que a saída da Análise os consulta.
- [ ] **Agenda de análises e criação automática de pedido** — spec 004; esta spec só recebe o pedido criado por ela e devolve a data real do envio.
- [ ] **Parametrização de fornecedor (contatos, linhas, prazos, filiais)** — spec 001; aqui os contatos são apenas lidos.
- [ ] **Travas de nota fiscal, recebimento, faturamento e B.O.** — onda 2. Nesta onda as etapas 5 a 8 respeitam só a persona.
- [ ] **Prazo de pagamento: comparação e justificativa** — o pedido guarda os valores, mas a exigência ao sair da Análise é da spec 003.
- [ ] **Arrastar cartão entre colunas** — decidido contra (UI-01): mover é no pedido aberto.
- [ ] **Aviso passageiro de sucesso (toast)** — decidido contra (UI-02).
- [ ] **Solicitações do comercial** — onda 3. A persona comercial existe nesta onda só para barrar o acesso (C-044); ela não ganha tela nenhuma aqui.
- [ ] **Formulário público** — fora do SGC 2, em todas as ondas.
- [ ] **Migração dos pedidos do sistema antigo** — o sistema começa vazio.
- [ ] **Transições configuráveis pelo administrador** — decidido contra (F-03 A): a tabela é regra testada.
- [ ] **Relatórios e indicadores do quadro** — onda 3.

## Pendências

Nenhuma. Toda ambiguidade encontrada foi resolvida pelas decisões de
`../000-visao-geral/regras.md` ou pelo comportamento do sistema antigo.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
