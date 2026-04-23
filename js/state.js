export const state = {
    players: [], 
    drawnTeams: [], 
    matchHistory: [],
    selectedPlayerIds: new Set(), 
    isFirstLoad: true,
    isAuthenticated: false, 
    eloEnabled: false, // <-- Flag para permitir/bloquear o Placar Público 
    score1: 0, 
    score2: 0,
    historyCurrentPage: 0, // Adicionado recentemente
    confirmActionCallback: null, 
    moveData: { 
        sourceTeamId: null, 
        playerId: null 
    }
};