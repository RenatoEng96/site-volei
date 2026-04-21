# Próximas Etapas
## Correções
- ~~Fazer o foguinho e gelinho aparecer junto do Craque.~~
- ~~Remover o ícone de estrela.~~
- ~~Na tela do celular, na aba Sorteio, o botão sortear times fica por cima da quantidade de jogadores.~~
- ~~Na aba Placar, no celular, seria bom adicionar o nome do time depois de "Se Vencer" no preview de ganho e perda de Elo, pois no celular fica um em cima do outro.~~
- ~~Mostrar o número do elo na base de atletas cadastrados da lista da aba Admin.~~
- ~~Alterar a função do botão Ajuste Elo, para que ao inves de fazer incremostos no ele ele sirva para definir o valor do elo atual.~~
- ~~Adicionar um botão de cancelar abaixo de salvar na tela de cadastrar e editar um jogador para suspender a edição ou cadastro de novo jogador. Atualmente se você clicar para editar não tem como cadastrar um novo jogador.~~


## Funcionalidades Gerais
- ~~Adicionar a data ao histórico de partidas, cada dia deve ficar em uma página: 1, 2, 3, etc.~~
- ~~Ao clicar em uma partida no histórico deve mostrar quais eram os jogadores daquele time e o Elo ganho e perdido.~~
- ~~Ao clicar na cartinha deve mostrar o histórico das partidas daquele jogador com o resultado, data, elo, time.~~
- ~~Na aba sorteio adicionar um botão, na lista de quem vai jogar hoje, com o nome selecionar apenas jogadores em times, para selecionar~~
~~todos os jogadores que estão em times e lista de espera.~~ 
- ~~Fazer com que o placar seja atualizado simultaneamente para todas as pessoas que accessem o site.~~
- Adicionar filtro para pesquisar jogadores pelo nome, ou ordem alfabética ou padrao por nível.
- Travar placar e os sorteios enquanto houver uma partida em andamento.
- Adicionar botão de excluir na lista de espera.
- Alterar pódio para pontos de Elo ao invés de vitórias.
- Colocar nas cartinhas o número da posição no ranking.



## Novas Funcionalidades (Para Monetizar o App)
- **Adptar o site para funcionar com o futsal e socyte.**
    - Opção para selecionar selecionar ou não goleiros
    - Mudar o placar para tempo de jogo, com alarme no final
    - Criar um botão de configuração do placar, para alterar a quantidade de pontos para vencer a partida ou trocar de pontos para tempo.
    - Colocar a condição de vitória ou número de gols.
    - Por uma tela de confirmação de vitória antes de pedir para salvar os pontos de Elo.
    - Opção de selecionar quem fez o gol
    - Adicionar quantidade de gols nas cartinhas 
    - A opção de escolher a modalidade do esporte (vôlei ou futebol) fica no adimin

- **Deve se adicionar dois tipos de acesso. Usuário e Admin.**
    - O admin vai poder designar alguns jogadores para serem moderadores, esses vão cadastrar jogadores, ativar Elo, etc.
    - Qualquer pessoa pode se cadastrar no sistema. Com esse cadastro, a pessoa vai poder ser o admin de um racha ou apenas um jogador normal para acessar os resultados sorteios e placar.
    - Um jogador pode participar de mais de um racha, podendo podendo selecionar qual grupo de racha ele vai abrir, caso esteja cadastrado em mais de um.
    - Cada usuário admin e seus usuários públicos vão ter seu próprio banco de dados.  
    - Usando de exemplo o Vôlei. Lima vai fazer seu cadastro de admin e todos os outros vão gerar um login e senha normal. Lima de posse do nome de usário de cada um vai criar o racha chamado Turma do vôlei e adicinar todos os outros.
    - Quando os outros entrarem com seu usuário vão escoler o racha turma do vôlei, ou outro racha que estja cadastrado, para ver o ranking palcar etc.
    - Como Lima vai ter a versão paga do app quando os outros jogadores acessrem o turma do vôlei não vai aparecer nenhum tipo de "ANÚNCIO", Caso eles acessem um racha na versão gratuita vai ter os anúncios.

- **Inserir um sistema de gerenciamento de mensalidades dos jogadores**
    - Obs: Esse mensalidade é a do racha normal, não tem nada haver com a mensalidade do aplicativo, que só é paga pelo admin.
    - Caso o admin faça adesão ao sistema pago, além de não ter anúncios ele vai poder gerenciar a mensalidade do racha pelo app.
    - Novamento exemplo do vêlei, digamos que a mensalidade do vêlei na chacara seja R$ 15,00, quando um jogador normal entrar em seu perfil vai mostrar a data e a chave Pix para ele realizar o pagamento. Ao ser feito o pagamento vai contabilizar automaticamente para o admin o status de pago, caso um jogador fique dois meses em atraso os sitema deve excluir esse jogador dos sorteios. 
    - Fazer tipo um extrato bancário para prestação de conta do racha. Por exemplo, vai-se somar o saldo pago pelas mensalidades dos jogadores como também resgistrar um débito para algum gasto, como compra de uma bola, rede, menslidade do app, etc. Isso para deixar mais transparente a contabilidade do racha.
    - O sistema terá três formas de monetização:
        - Anúncios
        - Assinatura, focado em donos de Society e rachas pagos.
        - Compra do App por jogadores normais para remover os anúncios, pagamento único. 


## Falhas encontradas pelo Gemini
- Risco de Duplicação no Elo: Na função de salvar o resultado do placar, o sistema itera sobre os jogadores do Time 1 e Time 2 para aplicar as mudanças de Elo, vitórias e partidas. Se, por causa de alguma manipulação manual na tela de transferências, o mesmo jogador acabar listado nos dois times simultaneamente, o banco de dados registrará o acréscimo de partidas e mudanças de elo duas vezes no mesmo segundo, criando inconsistências.   
- Condição de Vitória "Engessada" (Hardcoded): A função checkWinCondition está amarrada aos números 21 (vitória tradicional com diferença de 2) e 8x0 (capote). Se a turma decidir jogar um set mais curto (15 pontos) ou prolongado (25 pontos), o sistema não vai reconhecer a vitória. Além disso, se o jogo estiver 8x0 (abrindo o modal) e o marcador por acidente fechar o modal e adicionar mais um ponto (9x0), o sistema continuará validando a vitória a cada clique.
- Estado Zumbi: No arquivo state.js, existe a propriedade currentUser: null. Ela nunca é populada nem utilizada no restante da aplicação, já que o controle de visualização do painel usa apenas a flag booleana isAuthenticated
- Caminhos Redundantes no Banco de Dados: No arquivo firebase.js, você já exportou referências limpas e prontas para uso como playersRef e teamsRef. Porém, nos arquivos logic.js e admin.js, várias funções (como o update e o delete) ignoram isso e reconstroem o caminho do zero manualmente: doc(db, 'artifacts', appId, 'public', 'data', 'players', id). Isso não quebra o site, mas deixa o código mais sujo e difícil de manter caso o banco mude de lugar.
- Renderização Excessiva na Tabela de Sorteio: No renderSorteioTable, os checkboxes de cada jogador possuem um evento onclick que dispara a atualização do estado e chama renderSorteioTable() novamente. Isso significa que se você marcar 5 jogadores rapidamente, a tabela inteira é destruída e reconstruída do zero 5 vezes. Isso pode causar pequenos travamentos em celulares mais antigos.
