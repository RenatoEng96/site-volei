/**
 * Estado Global da Aplicação (Single Source of Truth)
 * Centraliza todas as variáveis voláteis que a interface precisa para se renderizar.
 */
export const state = {
    // Gerador robusto de ID de sessão
    localSessionId: (() => {
        try {
            let s = sessionStorage.getItem('tc_sid');
            if (!s) {
                s = Math.random().toString(36).substring(2, 15);
                sessionStorage.setItem('tc_sid', s);
            }
            return s;
        } catch (e) {
            // Caso o navegador bloqueie o sessionStorage (ex: aba anônima restrita)
            return "temp-" + Math.random().toString(36).substring(2, 15);
        }
    })(),

    // ---------------------------------------------------
    // 1. DADOS DO BANCO (Atualizados via onSnapshot)
    // ---------------------------------------------------
    players: [],            // Lista de todos os jogadores cadastrados
    drawnTeams: [],         // Times atualmente sorteados (inclui a Lista de Espera)
    matchHistory: [],       // Histórico de partidas jogadas
    eloEnabled: false,      // Flag global que define se o Placar Aberto está ativo
    isPlacarLocked: false,  // <-- NOVO: Controle absoluto de bloqueio da quadra
    // ---------------------------------------------------
    // 2. ESTADO DE AUTENTICAÇÃO E SEGURANÇA
    // ---------------------------------------------------
    isAuthenticated: false, // Define se o utilizador atual é o Admin
    user: null,             // Armazena o objeto de utilizador do Firebase (contém o UID)

    // ---------------------------------------------------
    // 3. ESTADO DA INTERFACE E NAVEGAÇÃO
    // ---------------------------------------------------
    isFirstLoad: true,      // Flag para selecionar todos os jogadores na primeira vez que a lista carrega
    historyCurrentPage: 0,  // Controle de paginação/dias na aba de histórico
    
    // ---------------------------------------------------
    // 4. ESTADO DO PLACAR DA PARTIDA ATUAL
    // ---------------------------------------------------
    score1: 0,              // Pontos do Time 1 (Azul)
    score2: 0,              // Pontos do Time 2 (Vermelho)
    currentTeam1: '',       // ID/Label do Time 1 selecionado
    currentTeam2: '',       // ID/Label do Time 2 selecionado

    // ---------------------------------------------------
    // 5. ESTADO DE INTERAÇÃO DO UTILIZADOR (Modais e Seleções)
    // ---------------------------------------------------
    selectedPlayerIds: new Set(), // IDs dos jogadores selecionados para o próximo sorteio
    confirmActionCallback: null,  // Guarda a função que será executada se o utilizador clicar em "Confirmar" no modal genérico
    
    // Dados temporários para o modal de transferência de jogadores
    moveData: { 
        sourceTeamId: null, 
        playerId: null 
    }
};