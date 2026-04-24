/**
 * SERVIÇO DE RANKING E BALANCEAMENTO
 * Contém apenas funções puras matemáticas e algoritmos de distribuição.
 * Zero manipulação de interface (DOM) neste arquivo.
 */

// ============================================================================
// 1. SISTEMA ELO
// ============================================================================

const K_FACTOR = 32;
// Conforme sua regra customizada: redução de penalidade para 70% nas derrotas
const LOSS_PENALTY_FACTOR = 0.7; 
const STREAK_BONUS = 5;

/**
 * Calcula a expectativa de vitória de um time contra o outro
 */
const getExpectedScore = (eloA, eloB) => {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
};

/**
 * Calcula a prévia de ganho/perda de Elo baseada no Elo médio de dois times.
 * Retorna os pontos brutos de vitória e derrota para ambos.
 */
export const calculateEloMatch = (team1Elo, team2Elo) => {
    const expectedT1 = getExpectedScore(team1Elo, team2Elo);
    const expectedT2 = getExpectedScore(team2Elo, team1Elo);

    return {
        winT1: Math.round(K_FACTOR * (1 - expectedT1)),
        loseT1: Math.round(K_FACTOR * (0 - expectedT1) * LOSS_PENALTY_FACTOR),
        winT2: Math.round(K_FACTOR * (1 - expectedT2)),
        loseT2: Math.round(K_FACTOR * (0 - expectedT2) * LOSS_PENALTY_FACTOR)
    };
};

/**
 * Calcula a variação final de Elo para um jogador individual, 
 * aplicando a sua regra de Streak (Foguinho/Gelinho).
 */
export const calculatePlayerFinalEloChange = (baseChange, isWin, currentStreak) => {
    let finalChange = baseChange;
    
    // Se ganhou e atingiu/manteve uma sequência de 3+ vitórias, aplica o bônus
    if (isWin) {
        const newStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
        if (newStreak >= 3) {
            finalChange += STREAK_BONUS;
        }
    }
    return finalChange;
};


// ============================================================================
// 2. ALGORITMOS DE SORTEIO (BALANCEAMENTO SMART)
// ============================================================================

/**
 * Motor Central de Distribuição: Distribui iterativamente com base na menor soma 
 * de categorias e aplica o desempate pela qualidade dos jogadores no time.
 */
const distributePlayersSmartly = (playersList, capacities) => {
    let buckets = capacities.map(() => []);

    // 1. Embaralha perfeitamente a lista inteira primeiro (Fisher-Yates)
    let sortedPlayers = [...playersList];
    for (let i = sortedPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sortedPlayers[i], sortedPlayers[j]] = [sortedPlayers[j], sortedPlayers[i]];
    }

    // 2. Ordena por categoria. 
    // O JS mantém a ordem aleatória do embaralhamento para quem empatar na categoria
    sortedPlayers.sort((a, b) => (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1));

    // 3. Distribuição Iterativa
    for (let p of sortedPlayers) {
        let eligibleIndices = [];
        for (let i = 0; i < buckets.length; i++) {
            if (buckets[i].length < capacities[i]) eligibleIndices.push(i);
        }
        if (eligibleIndices.length === 0) break; 

        // Embaralha os índices elegíveis para garantir aleatoriedade real em empates absolutos
        for (let j = eligibleIndices.length - 1; j > 0; j--) {
            const randomIndex = Math.floor(Math.random() * (j + 1));
            [eligibleIndices[j], eligibleIndices[randomIndex]] = [eligibleIndices[randomIndex], eligibleIndices[j]];
        }

        let bestBucketIndex = eligibleIndices[0];

        for (let i = 1; i < eligibleIndices.length; i++) {
            let candidateIndex = eligibleIndices[i];
            let bestBucket = buckets[bestBucketIndex];
            let candidateBucket = buckets[candidateIndex];

            let sumBest = bestBucket.reduce((acc, val) => acc + (parseInt(val.categoria) || 1), 0);
            let sumCand = candidateBucket.reduce((acc, val) => acc + (parseInt(val.categoria) || 1), 0);

            if (sumCand < sumBest) {
                bestBucketIndex = candidateIndex; // Candidato tem soma menor
            } else if (sumCand === sumBest) {
                // Desempate de qualidade: Quem tem menos jogadores de nível muito alto recebe o próximo
                let sortedBest = [...bestBucket].map(x => parseInt(x.categoria) || 1).sort((a,b) => b - a);
                let sortedCand = [...candidateBucket].map(x => parseInt(x.categoria) || 1).sort((a,b) => b - a);
                
                let candWins = false;
                for (let j = 0; j < Math.max(sortedBest.length, sortedCand.length); j++) {
                    let bVal = sortedBest[j] || 0;
                    let cVal = sortedCand[j] || 0;
                    if (cVal < bVal) {
                        candWins = true; // Candidato tem um top-player mais fraco, ganha a prioridade
                        break;
                    } else if (cVal > bVal) {
                        break; // O melhor atual mantém a prioridade
                    }
                }
                if (candWins) bestBucketIndex = candidateIndex;
            }
        }
        
        buckets[bestBucketIndex].push({ ...p, waitlistRounds: 0 });
    }
    return buckets;
};

/**
 * Estratégia "Dentro Forte": Fecha apenas os times completos. Os que sobraram vão para a espera.
 */
export const balanceStrongInside = (playersList, playersPerTeam) => {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    if (numberOfTeams === 0) return { teams: [], waitlist: playersList.map(p => ({...p, waitlistRounds: 0})) };

    // Sorteia a ordem da lista toda para não viciar quem vai ficar de fora
    let sortedPlayers = [...playersList];
    for (let i = sortedPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sortedPlayers[i], sortedPlayers[j]] = [sortedPlayers[j], sortedPlayers[i]];
    }

    sortedPlayers.sort((a, b) => (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1));

    const activePlayersCount = numberOfTeams * playersPerTeam;
    const activePlayers = sortedPlayers.slice(0, activePlayersCount);
    const waitlistPlayers = sortedPlayers.slice(activePlayersCount).map(p => ({ ...p, waitlistRounds: 0 }));

    const capacities = Array(numberOfTeams).fill(playersPerTeam);
    const teams = distributePlayersSmartly(activePlayers, capacities);

    return { teams, waitlist: waitlistPlayers };
};

/**
 * Estratégia "Fora Forte": Distribui todos, colocando a lista de espera no sorteio como um "time".
 */
export const balanceStrongOutside = (playersList, playersPerTeam) => {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    const waitlistSize = playersList.length % playersPerTeam;
    
    if (numberOfTeams === 0) return { teams: [], waitlist: playersList.map(p => ({...p, waitlistRounds: 0})) };

    const capacities = Array(numberOfTeams).fill(playersPerTeam);
    if (waitlistSize > 0) {
        capacities.push(waitlistSize); // A lista de espera vira um bucket no sorteio
    }

    const buckets = distributePlayersSmartly(playersList, capacities);

    const teams = buckets.slice(0, numberOfTeams);
    const waitlist = waitlistSize > 0 ? buckets[numberOfTeams] : [];

    return { teams, waitlist };
};