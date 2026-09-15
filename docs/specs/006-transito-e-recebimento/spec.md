# Spec: Trânsito e recebimento — previsão, atraso e conclusão do trânsito

**ID:** 006-transito-e-recebimento · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

Depois que o pedido vai à indústria, ele quase nunca chega de uma vez: a indústria fatura em
duas, três, cinco notas, e cada nota tem o seu próprio prazo de entrega. O acompanhamento de
hoje é do pedido inteiro — um contador de dias desde o envio —, então a nota que atrasou fica
escondida atrás das que chegaram. Para saber qual é, o comprador abre o ERP e confere nota por
nota; quando descobre, já passaram dias em que ninguém cobrou a indústria.

Enquanto isso, o pedido só anda de fase se alguém lembrar de empurrá-lo, e quem negocia a
prorrogação dos títulos com a indústria não tem uma lista das notas vencidas: monta a lista à
mão, pedido a pedido, toda semana.

## Resultado esperado

Cada nota do pedido tem previsão de chegada e situação próprias, visíveis sem abrir o ERP; a
nota que passa do prazo avisa sozinha, uma vez por dia, até chegar; o pedido caminha sozinho
para o faturamento quando a última nota entra; e existe uma tela só com as notas vencidas, com
valor acumulado e faixas de atraso, para a negociação com a indústria começar pela pior.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | ver quais notas do pedido chegaram e qual atrasou; forçar a verificação de uma delas na hora | diária |
| gestor (gerência de compras) | o mesmo do analista, e acompanhar a lista consolidada de notas vencidas para cobrar a indústria e negociar prorrogação de título | diária |
| diretoria | ver a situação das notas e a lista de vencidas, sem operar | semanal |
| admin (TI) | manter o prazo de entrega de cada fornecedor, que é a origem de toda previsão | eventual |

O perfil **comercial** não aparece de propósito: não vê o quadro, o pedido nem a lista de notas
vencidas. O **nível de acesso** da plataforma continua valendo: quem tem acesso somente-leitura
vê tudo e não dispara nada; quem tem acesso restrito opera apenas os pedidos que criou.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — Previsão por nota, com prazo em dias úteis**
- **Dado que** o fornecedor do pedido tem prazo de entrega de **7 dias úteis** e o pedido tem a nota 90001 faturada em **24/08/2026** (segunda) e a nota 90002 faturada em **28/08/2026** (sexta)
- **Quando** o comprador abre o acompanhamento de recebimento do pedido
- **Então** a nota 90001 mostra previsão **02/09/2026** e a nota 90002 mostra **08/09/2026**, as duas com o prazo "7 dias úteis" escrito ao lado

**C-002 — Previsão com prazo em dias corridos**
- **Dado que** o fornecedor tem prazo de entrega de **10 dias corridos** e a nota 90006 foi faturada em **28/08/2026**
- **Quando** a previsão é calculada
- **Então** a previsão é **07/09/2026** — a contagem é de calendário, mesmo caindo em fim de semana ou feriado

**C-003 — Fornecedor sem prazo parametrizado**
- **Dado que** o fornecedor da nota 90009 não tem prazo de entrega cadastrado
- **Quando** o comprador abre o acompanhamento
- **Então** a nota aparece como **"Sem prazo parametrizado"**, sem previsão, não entra na lista de notas vencidas e nunca gera aviso de atraso

**C-004 — Nota sem data de faturamento**
- **Dado que** a nota 90010 foi registrada sem data de faturamento
- **Quando** a previsão é calculada
- **Então** ela recebe o mesmo tratamento de C-003: sem previsão, fora da lista de vencidas, sem aviso

**C-005 — Nota vencida**
- **Dado que** a nota 90011 tem previsão de **dois dias atrás** e continua sem entrada no ERP
- **Quando** o comprador abre o acompanhamento
- **Então** a nota aparece como **"Em atraso"**, com **2 dias de atraso**

**C-006 — A entrada no ERP vira recebimento**
- **Dado que** a nota 90005 está pendente e o ERP registra a entrada dela, sem cancelamento
- **Quando** a verificação de entrada roda
- **Então** a nota passa a **"Recebida"** com a data de entrada do ERP e sai da lista de vencidas

**C-007 — Nota cancelada no ERP não é recebimento**
- **Dado que** a nota 90007 existe no ERP com data de cancelamento preenchida
- **Quando** a verificação roda
- **Então** a nota **continua pendente** — cancelada no ERP não conta como recebida

**C-008 — A mesma nota com entrada em duas filiais**
- **Dado que** a nota 90008 deu entrada na filial 1 (três dias atrás) e na filial 2 (ontem), e o pedido é da **filial 2**
- **Quando** a verificação roda
- **Então** o recebimento gravado é o da **filial 2**, com a data de ontem

**C-009 — O pedido anda sozinho quando a última nota chega**
- **Dado que** o pedido está em Trânsito com 2 notas, 1 já recebida, e o ERP acabou de registrar a entrada da outra
- **Quando** a verificação roda
- **Então** o pedido passa para **Faturamento em Andamento**, o movimento fica registrado como feito pelo sistema em nome do primeiro responsável do pedido, o histórico do pedido ganha uma linha e os responsáveis recebem o aviso de que as notas chegaram

**C-010 — Uma nota pendente segura o pedido**
- **Dado que** o pedido em Trânsito tem 3 notas, 2 recebidas e 1 sem entrada
- **Quando** a verificação roda
- **Então** o pedido **continua em Trânsito** e o acompanhamento mostra "2 de 3 notas recebidas"

**C-011 — Aviso de atraso uma vez por dia por nota**
- **Dado que** existem 5 notas vencidas em pedidos nas fases Enviado e Em Trânsito
- **Quando** a verificação roda três vezes no mesmo dia
- **Então** são gerados **5 avisos** no total, um por nota, e não 15; no dia seguinte, as notas que continuarem vencidas avisam de novo

**C-012 — O atraso de uma nota não contamina as outras**
- **Dado que** o pedido tem uma nota em atraso e duas recebidas
- **Quando** o acompanhamento é consultado
- **Então** as duas recebidas continuam "Recebida", cada nota com a sua própria previsão e situação

**C-013 — Verificar a entrada na hora**
- **Dado que** o comprador não quer esperar o ciclo automático de duas em duas horas
- **Quando** ele aciona "Verificar entrada no ERP" no pedido aberto
- **Então** só aquele pedido é verificado e a resposta diz quantas notas foram atualizadas

**C-014 — Falha em um fornecedor não derruba os outros**
- **Dado que** há notas pendentes de dois fornecedores e a consulta ao ERP falha para o primeiro
- **Quando** a verificação roda
- **Então** as notas do segundo fornecedor são atualizadas normalmente, nada do primeiro é sobrescrito, e o resultado informa a falha daquele fornecedor

**C-015 — Lista de notas vencidas**
- **Dado que** há pedidos nas fases Enviado e Em Trânsito com notas vencidas, e mais uma nota vencida num pedido que já está em Faturamento
- **Quando** o gestor abre a lista de notas vencidas
- **Então** a lista traz todas as notas vencidas dos pedidos nas duas primeiras fases, o total de notas e o valor acumulado batem com o que está na lista, e a nota do pedido em Faturamento **não** aparece

**C-016 — Faixas de atraso**
- **Dado que** há notas com 2, 5 e 9 dias de atraso
- **Quando** o gestor filtra por "até 3 dias", depois "de 4 a 7" e depois "mais de 7"
- **Então** cada faixa devolve a sua nota: a de 2 dias, a de 5 dias e a de 9 dias (esta junto das demais acima de 7)

**C-017 — Busca na lista de vencidas**
- **Dado que** a lista está aberta
- **Quando** o gestor busca por "90012", por parte do nome do fornecedor ou pelo número do pedido no ERP
- **Então** a lista devolve as notas correspondentes em cada uma das três buscas

**C-018 — Exportar a lista**
- **Dado que** o gestor filtrou a faixa "mais de 7 dias"
- **Quando** ele exporta
- **Então** o arquivo gerado tem uma linha de cabeçalho e uma linha por nota **do filtro aplicado**, com as mesmas colunas da tela

**C-019 — Concluir com validação de nota pendente é recusado**
- **Dado que** o pedido está em Faturamento com uma comparação de nota fiscal ainda sem decisão
- **Quando** alguém tenta mover o pedido para Compras Concluídas
- **Então** o movimento é recusado com o motivo da pendência, e o pedido continua em Faturamento

**C-020 — Quem pode o quê**
- **Dado que** o comercial, a diretoria e um usuário somente-leitura abrem o sistema
- **Quando** cada um tenta acompanhar e verificar o recebimento
- **Então** o comercial não vê a lista de vencidas nem o acompanhamento; a diretoria vê os dois e não consegue disparar a verificação; o somente-leitura vê tudo com os comandos desabilitados, e uma tentativa por fora da tela é recusada do mesmo jeito

**C-021 — Mudar a parametrização corrige as previsões em aberto**
- **Dado que** o prazo do fornecedor passa de 7 para 10 dias úteis
- **Quando** o acompanhamento é consultado de novo
- **Então** a previsão da nota 90001 passa de 02/09/2026 para **07/09/2026**, sem nenhum reprocessamento e sem tocar nas notas já recebidas

**C-022 — Nota registrada antes de entrar no ERP**
- **Dado que** o comprador registrou a nota pelo número, antes de ela dar entrada
- **Quando** o acompanhamento é consultado
- **Então** a nota aparece com previsão e situação normais, e só vira "Recebida" quando o ERP confirmar a entrada

**C-023 — Pedido cujas notas já chegaram recebidas**
- **Dado que** o pedido está em Em Trânsito com 2 notas que já nasceram recebidas (foram vinculadas depois de a entrada existir no ERP), e nenhuma nota dele está pendente
- **Quando** a verificação roda
- **Então** o pedido é movido para Faturamento em Andamento do mesmo jeito — a verificação não olha só o que mudou na rodada, olha todo pedido em trânsito com nota

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE calcular, por nota, a previsão de recebimento a partir da data de faturamento dela e do prazo de entrega do fornecedor | Os números de C-001 e C-002 | must |
| RF-002 | O prazo DEVE ser respeitado como dias úteis ou dias corridos, conforme o cadastro do fornecedor | C-001 em úteis, C-002 em corridos | must |
| RF-003 | Nota sem prazo parametrizado ou sem data de faturamento DEVE aparecer como "Sem prazo parametrizado", sem previsão, fora da lista de vencidas e sem aviso | C-003, C-004 | must |
| RF-004 | A previsão NÃO DEVE ser armazenada: é recalculada a cada consulta | Mudar o prazo do fornecedor muda a previsão de todas as notas em aberto (C-021) | must |
| RF-005 | Cada nota DEVE ter situação própria entre recebida, em atraso, chegando, dentro do prazo e sem prazo | C-005, C-012 | must |
| RF-006 | O acompanhamento do pedido DEVE listar, por nota: número, série, data de faturamento, prazo, previsão, data de recebimento, situação e valor | Todas as colunas com valor ou traço, nunca zero inventado (C-001) | must |
| RF-007 | O sistema DEVE verificar sozinho, de duas em duas horas no horário comercial, a entrada das notas pendentes no ERP | Uma rodada por janela; a rodada registra quantas notas atualizou (C-006) | must |
| RF-008 | A data de recebimento DEVE ser a data de entrada consolidada no ERP; nota cancelada no ERP não conta | C-006, C-007 | must |
| RF-009 | Havendo entrada da mesma nota em mais de uma filial, DEVE valer a entrada da filial do pedido | C-008 | must |
| RF-010 | Com 100 % das notas do pedido recebidas, o pedido DEVE ir sozinho de Em Trânsito para Faturamento em Andamento, com registro no histórico | C-009 | must |
| RF-011 | O movimento automático DEVE ficar registrado como do sistema, em nome do primeiro responsável do pedido (ou de quem o criou, se não houver responsável) | C-009 | must |
| RF-012 | Com qualquer nota pendente, o pedido DEVE permanecer em Em Trânsito | C-010 | must |
| RF-013 | Nota vencida DEVE gerar aviso aos responsáveis do pedido uma vez por dia, enquanto seguir sem entrada | 5 notas vencidas, 3 rodadas no mesmo dia, 5 avisos (C-011) | must |
| RF-014 | A chegada completa das notas DEVE gerar aviso aos responsáveis | C-009 | must |
| RF-015 | O comprador DEVE poder verificar a entrada de um pedido na hora, sem esperar o ciclo | A verificação sob demanda trata só aquele pedido (C-013) | must |
| RF-016 | A verificação DEVE consultar o ERP uma vez por fornecedor, com todas as notas dele | Com 12 notas de 2 fornecedores, 2 consultas (RNF-002) | must |
| RF-017 | Falha do ERP para um fornecedor NÃO DEVE interromper os demais nem sobrescrever dado | C-014 | must |
| RF-018 | O sistema DEVE oferecer uma lista das notas vencidas dos pedidos em Enviado e Em Trânsito, com total de notas e valor acumulado | C-015 | must |
| RF-019 | A lista DEVE filtrar por faixa de atraso (até 3, de 4 a 7, mais de 7 dias) e buscar por número da nota, fornecedor ou número do pedido no ERP | C-016, C-017 | must |
| RF-020 | A lista DEVE ser exportável, com as mesmas colunas e o filtro aplicado | C-018 | must |
| RF-021 | A lista DEVE oferecer a verificação de todos os pedidos monitorados sem esperar o ciclo | O comando devolve quantas notas foram atualizadas (C-013) | should |
| RF-022 | Concluir o pedido DEVE ser recusado enquanto houver comparação de nota fiscal sem decisão, com o motivo na recusa | C-019 | must |
| RF-023 | Acompanhar e ver a lista é de admin, analista, gestor e diretoria; verificar a entrada é de admin, analista e gestor; o comercial não vê nada desta feature | C-020 | must |
| RF-024 | A recusa por perfil DEVE valer também fora da tela | Chamada direta com perfil sem direito não grava nada (C-020) | must |
| RF-025 | A verificação DEVE alcançar **todo** pedido em Em Trânsito com ao menos uma nota, mesmo que nenhuma nota dele tenha mudado naquela rodada | Pedido com todas as notas já recebidas é movido na primeira rodada (C-023) | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir o acompanhamento de um pedido custa **uma** consulta, qualquer que seja o número de notas | Contador de chamadas com 1 e com 12 notas: sempre 1 |
| RNF-002 | A verificação consulta o ERP **uma vez por fornecedor**, nunca por nota nem por pedido | Contador de consultas ao ERP numa rodada com 12 notas de 2 fornecedores: 2 |
| RNF-003 | Uma rodada automática trata no máximo **30 pedidos**, e sempre todas as notas de cada pedido escolhido | Rodada com 45 pedidos pendentes: 30 tratados, nenhum pedido pela metade |
| RNF-004 | A lista de vencidas é paginada e responde em até 2 s com 2.000 notas | Cronômetro sobre a base de teste ampliada |
| RNF-005 | Nenhuma operação desta feature escreve no ERP | Revisão das consultas: todas são de leitura |
| RNF-006 | Falha do ERP não perde dado: a nota simplesmente continua pendente até a rodada seguinte | C-014 |

## Entidades do domínio

- **Nota fiscal do pedido** — a nota que a indústria emitiu contra o pedido. Já existe quando esta feature começa (é vinculada e conferida em outra parte do sistema); aqui ela ganha **data de recebimento** e **data do último aviso de atraso**.
- **Previsão de recebimento** — quando aquela nota deveria chegar. Não é um dado guardado: é sempre a data de faturamento da nota mais o prazo do fornecedor, apurada no momento da consulta.
- **Prazo de entrega do fornecedor** — quantos dias, úteis ou corridos, o fornecedor leva para entregar. É parametrização do cadastro de fornecedores; sem ela não existe previsão.
- **Situação da nota** — recebida, em atraso, chegando, dentro do prazo ou sem prazo. Derivada da previsão e do recebimento, nunca gravada.
- **Aviso** — a mensagem que o processo automático deixa para os responsáveis do pedido: nota atrasada ou notas recebidas.

## Regras de negócio

- **RN-001 — Previsão.** Previsão da nota = data de faturamento + prazo do fornecedor. Em dias úteis, contam-se de segunda a sexta, **sem feriados**; data de faturamento em sábado ou domingo recua para a sexta anterior antes da contagem. Em dias corridos, é soma de calendário. Conferência de referência: 24/08/2026 (segunda) + 15 dias úteis = 14/09/2026.
- **RN-002 — Sem prazo.** Fornecedor sem prazo de entrega cadastrado (ausente ou zero) ou nota sem data de faturamento: situação "sem prazo", sem previsão, fora da lista de vencidas e sem aviso.
- **RN-003 — Situação da nota**, nesta ordem: com data de recebimento é **recebida**; sem previsão é **sem prazo**; previsão anterior a hoje é **em atraso**; previsão até dois dias à frente é **chegando**; o resto é **dentro do prazo**.
- **RN-004 — Recebimento.** Data de recebimento = data de entrada consolidada da nota no ERP. Nota com cancelamento no ERP não é recebimento. Entrada na filial do pedido tem prioridade sobre entrada em outra filial.
- **RN-005 — Dias de atraso.** Diferença em dias **corridos** entre a previsão e hoje — mercadoria parada não descansa no fim de semana. Faixas da lista: até 3, de 4 a 7, mais de 7.
- **RN-006 — Conclusão do trânsito.** O pedido sai de Em Trânsito para Faturamento sozinho quando **toda** nota vinculada tem data de recebimento e existe ao menos uma nota. A avaliação é de **todo** pedido em Em Trânsito com nota, e não só dos que tiveram nota atualizada na rodada — uma nota pode já ter nascido recebida, e sem isso o pedido nunca andaria. O movimento é do sistema, em nome do primeiro responsável do pedido, ou de quem o criou quando não há responsável. Mover à mão de Em Trânsito para Faturamento continua permitido, sem exigência.
- **RN-007 — Aviso de atraso.** Uma vez por dia por nota, enquanto a nota estiver em atraso. A nota guarda a data do último aviso, e o aviso guarda a sua própria identidade de dia — as duas travas, para a rodada repetida não duplicar.
- **RN-008 — Aviso de chegada.** Ao mover o pedido por 100 % recebido, um aviso aos responsáveis, uma vez por pedido por dia.
- **RN-009 — Uma consulta por fornecedor.** A verificação agrupa as notas pendentes por fornecedor e faz uma consulta ao ERP por fornecedor, com todas as notas dele. Falha em um fornecedor é registrada e o processo segue nos demais.
- **RN-010 — Lote.** Uma rodada automática trata no máximo 30 pedidos, escolhidos pelos de faturamento mais antigo, sempre com todas as notas do pedido. A verificação sob demanda trata só o pedido pedido.
- **RN-011 — Alcance do monitoramento.** Só notas de pedidos nas fases Enviado e Em Trânsito são verificadas e só elas entram na lista de vencidas. Pedido cancelado ou excluído sai do monitoramento.
- **RN-012 — Perfis.** Acompanhar e ver a lista: admin, analista, gestor, diretoria. Verificar a entrada e sincronizar: admin, analista, gestor. Comercial não vê. Somente-leitura não opera. Acesso restrito opera apenas os pedidos que criou.
- **RN-013 — Conclusão do pedido.** Concluir exige zero comparação de nota fiscal sem decisão e zero item pendente de B.O. — as duas condições são verificadas no servidor e a recusa diz qual falhou.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | consulta do pedido T1 devolve previsão `2026-09-02` para a nota 90001 e `2026-09-08` para a 90002, com prazo 7 e tipo úteis | regra de negócio |
| C-002 | a nota 90006 (10 dias corridos, faturada em 28/08/2026) devolve previsão `2026-09-07` | regra de negócio |
| C-003 | a nota 90009, de fornecedor sem parametrização, devolve previsão vazia, situação `sem_prazo` e não aparece na lista de vencidas | regra de negócio |
| C-004 | a nota 90010, sem data de faturamento, devolve situação `sem_prazo` | regra de negócio |
| C-005 | a nota 90011 devolve situação `atrasada` e 2 dias de atraso | regra de negócio |
| C-006 | rodada de verificação: a nota 90005 passa a ter recebimento igual à data de entrada do ERP e situação `recebida`; a contagem de notas recebidas na resposta é 2 | regra de negócio |
| C-007 | a nota 90007, cuja entrada no ERP tem cancelamento, continua sem recebimento depois da rodada | regra de negócio |
| C-008 | a nota 90008, com entrada na filial 1 (hoje−3) e na filial 2 (hoje−1), num pedido da filial 2, grava recebimento em hoje−1 | regra de negócio |
| C-009 | depois da rodada, o pedido T2 está na fase `faturamento`, o movimento tem origem `sistema` e usuário = primeiro responsável (gil), existe 1 nota no histórico e 1 aviso `nf_recebida` | regra de negócio |
| C-010 | depois da rodada, o pedido T1 continua em `transito` com 2 de 3 notas recebidas | regra de negócio |
| C-011 | primeira rodada do dia cria **5** avisos `nf_atrasada`; a segunda e a terceira, no mesmo dia, criam **0** | regra de negócio |
| C-012 | no pedido T1, as notas 90001 e 90002 continuam `recebida` enquanto a 90003 está `atrasada` | regra de negócio |
| C-013 | verificação com o pedido T3 informado toca só as notas do T3; as do T1 ficam como estavam | regra de negócio |
| C-014 | com a consulta ao ERP falhando para o fornecedor 1042, a rodada grava o recebimento do fornecedor 1015 e devolve 1 erro, com o código do fornecedor 1042 | regra de negócio |
| C-015 | a lista traz as 5 notas vencidas dos pedidos deste cenário e não traz a 90015, de pedido em `faturamento`; o total de notas e o valor acumulado batem com a contagem e a soma que o próprio teste faz no banco pela mesma regra (sem número literal — outras suítes têm notas na mesma lista) | regra de negócio |
| C-016 | entre as notas destes pedidos: faixa "até 3" traz só a 90011; "de 4 a 7" só a 90012; "mais de 7" traz a 90013, a 90003 e a 90006 | regra de negócio |
| C-017 | busca "90012" traz a 90012; busca "NESTLE" e busca "900500" (pedido no ERP) trazem as 3 notas do pedido E5 | regra de negócio |
| C-018 | 3 notas viram 4 linhas de texto (cabeçalho + 3), com ponto e vírgula como separador, valor em vírgula decimal e aspas no campo que contém o separador | regra de tela |
| C-019 | o servidor recusa mover o pedido F6 de `faturamento` para `concluido`, com motivo citando a validação pendente | regra de negócio |
| C-020 | verificação chamada por `leo` (comercial) e por `dora` (diretoria) devolve recusa sem gravar; gravação de recebimento com o comercial como autor não altera nenhuma linha | regra de negócio |
| C-021 | trocando o prazo do fornecedor 1015 de 7 para 10 dias úteis, a nota 90001 passa a prever `2026-09-07`; as notas recebidas mantêm a data de recebimento | regra de negócio |
| C-022 | a nota 90006, registrada sem entrada no ERP, tem previsão e situação e continua sem recebimento depois da rodada | regra de negócio |
| C-023 | pedido em trânsito com 2 notas já recebidas e nenhuma pendente é movido para faturamento na primeira rodada, com o mesmo registro de movimento e aviso de C-009 | regra de negócio |
| RN-001 | 24/08/2026 + 15 dias úteis = 14/09/2026; 29/08/2026 (sábado) + 1 dia útil = 31/08/2026 | regra de negócio |
| RN-002 | prazo 0 → sem previsão; data de faturamento vazia → sem previsão | regra de negócio |
| RN-003 | recebida vence atraso; previsão hoje−1 → `atrasada`; hoje+2 → `em_transito`; hoje+3 → `dentro_prazo`; sem previsão → `sem_prazo` | regra de tela + regra de negócio |
| RN-004 | entrada com cancelamento é descartada; das duas filiais vale a do pedido | regra de negócio |
| RN-005 | atraso 3 → faixa "até 3"; 4 e 7 → "de 4 a 7"; 8 → "mais de 7" | regra de tela |
| RN-006 | com 1 de 2 notas recebidas o pedido não move; com 2 de 2, move uma vez só (a rodada seguinte não move de novo); pedido em trânsito **sem nenhuma** nota não move | regra de negócio |
| RN-007 | a nota atrasada com aviso de hoje não avisa de novo; apagando a data do último aviso, avisa — e o aviso repetido do mesmo dia é recusado pela identidade do aviso | regra de negócio |
| RN-008 | o aviso de chegada é gravado uma vez para o pedido movido | regra de negócio |
| RN-009 | rodada com notas de 2 fornecedores faz 2 consultas ao ERP (uma por fornecedor), com todas as notas de cada um | regra de negócio |
| RN-010 | com 45 pedidos pendentes, a rodada trata 30 e nenhum deles fica com nota não avaliada | regra de negócio |
| RN-011 | nota de pedido em `faturamento` não é verificada nem listada; nota de pedido excluído idem | regra de negócio |
| RN-012 | matriz de perfis: os quatro que veem, os três que operam, comercial fora, somente-leitura sem operação | regra de tela |
| RN-013 | com uma validação pendente o servidor recusa concluir; sem nenhuma, libera | regra de negócio |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 — a tabela de notas do pedido nos dois temas, com as situações legíveis por texto e não só por cor
  - [ ] C-005 — a nota em atraso destacada sem virar alarme visual no meio de notas normais
  - [ ] C-015 — a lista de vencidas com total e valor no topo, faixas como filtro e a tabela rolando sem quebrar em tela estreita
  - [ ] C-018 — o arquivo exportado abre no editor de planilha com as colunas separadas
  - [ ] C-020 — comandos desabilitados (nunca escondidos) para quem só lê, com o motivo ao passar o mouse

## Fora de escopo

- [ ] **Vincular a nota ao pedido, conferir nota contra pedido, faturamento e cobrança** — é a spec 005. Aqui a nota já existe e já está vinculada.
- [ ] **A exigência de ao menos uma nota para entrar em Em Trânsito** — a trava é entregue pela 005; esta spec só depende de ela existir.
- [ ] **Produtos em B.O.** — spec 007. Aqui só a parte da recusa de conclusão que já existe.
- [ ] **Feriados no cálculo de dias úteis** — dia útil é segunda a sexta, decisão fechada; calendário de feriados não entra.
- [ ] **Prorrogação de título dentro do sistema** — a lista apoia a negociação; o registro continua no ERP.
- [ ] **Detectar automaticamente a nota antes de ela entrar no ERP** (manifesto do destinatário) — o caminho para a nota em trânsito é o registro pelo número, que é da 005.
- [ ] **Editar previsão à mão ou registrar promessa de entrega da transportadora** — a previsão é sempre calculada.
- [ ] **Rastreamento de transporte, conhecimento de frete, ocorrência de entrega.**
- [ ] **Qualquer escrita no ERP.**

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-004, C-007, C-014, C-019, C-020)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
