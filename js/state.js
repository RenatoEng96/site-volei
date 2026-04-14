/**
 * js/state.js
 * * Objeto central que guarda o estado global da aplicação.
 * Encapsular o estado num objeto permite que diferentes módulos (ui, admin, logic)
 * possam ler e modificar estes valores de forma partilhada e reativa.
 */

export const state = {
    // Dados provenientes do Firebase
    players: [],
    drawnTeams: [],
    
    // Controlo de seleção (checkboxes) e fluxo
    selectedPlayerIds: new Set(),
    isFirstLoad: true,
    
    // Autenticação
    isAuthenticated: false,
    currentUser: null,
    
    // Controlo da Interface (UI)
    showAllRanking: false,
    
    // Placar do Jogo
    score1: 0,
    score2: 0,
    
    // Callbacks para o modal de confirmação genérico
    confirmActionCallback: null
};