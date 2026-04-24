import { state } from '../state.js';
import { calculateEloMatch, calculatePlayerFinalEloChange } from '../services/rankingService.js';
import { db, doc, updateDoc, addDoc, playersRef, matchHistoryRef, settingsRef } from '../firebase.js';
import { showToast, closeVictoryModalOnly, updateLiveEloPreview, getTeamName, openConfirmModal } from '../ui.js';

// ============================================================================
// CONFIGURAÇÕES DA PARTIDA (Podem vir do BD no futuro)
// ============================================================================
const MATCH_CONFIG = {
    TRADITIONAL_WIN_SCORE: 21,
    CAPOTE_WIN_SCORE: 8,
    MIN_SCORE_DIFF: 2
};

// ============================================================================
// LÓGICA DE PLACAR
// ============================================================================

/**
 * Atualiza o placar local e sincroniza com a nuvem
 */
export const updateScore = async (team, change) => {
    if (team === 1) { 
        state.score1 = Math.max(0, state.score1 + change); 
        document.getElementById('score1').innerText = state.score1; 
    } else { 
        state.score2 = Math.max(0, state.score2 + change); 
        document.getElementById('score2').innerText = state.score2; 
    }
    
    // Sincroniza com a nuvem para que todos vejam o placar em tempo real
    try { 
        await updateDoc(settingsRef, { score1: state.score1, score2: state.score2 }); 
    } catch(e) {
        console.error("Erro ao sincronizar placar:", e);
    }
    
    checkWinCondition();
};

/**
 * Zera o placar local e na nuvem
 */
export const resetScore = () => {
    openConfirmModal("Zerar Placar", "Deseja realmente zerar o placar da partida atual?", async () => {
        state.score1 = 0; 
        state.score2 = 0; 
        
        try { 
            await updateDoc(settingsRef, { score1: 0, score2: 0, team1: '', team2: '' }); 
        } catch(e) {
            console.error("Erro ao zerar na nuvem:", e);
        }
        
        document.getElementById('score1').innerText = state.score1; 
        document.getElementById('score2').innerText = state.score2;
        document.getElementById('team1Select').value = ''; 
        document.getElementById('team2Select').value = ''; 
        
        if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
        showToast("Placar zerado!", "info");
    });
};

// ============================================================================
// LÓGICA DE VITÓRIA E ENCERRAMENTO
// ============================================================================

/**
 * Verifica se alguma das condições de vitória foi atingida
 */
export const checkWinCondition = () => {
    const isTradicionalWin = (state.score1 >= MATCH_CONFIG.TRADITIONAL_WIN_SCORE || state.score2 >= MATCH_CONFIG.TRADITIONAL_WIN_SCORE) && 
                             Math.abs(state.score1 - state.score2) >= MATCH_CONFIG.MIN_SCORE_DIFF;
    const isCapoteWin = (state.score1 >= MATCH_CONFIG.CAPOTE_WIN_SCORE && state.score2 === 0) || 
                        (state.score2 >= MATCH_CONFIG.CAPOTE_WIN_SCORE && state.score1 === 0);
    
    if (isTradicionalWin || isCapoteWin) {
        const select1 = document.getElementById('team1Select');
        const select2 = document.getElementById('team2Select');
        
        let winnerName = state.score1 > state.score2 
            ? (select1.value && select1.selectedIndex > 0 ? select1.options[select1.selectedIndex].text : "TIME 1 (AZUL)") 
            : (select2.value && select2.selectedIndex > 0 ? select2.options[select2.selectedIndex].text : "TIME 2 (VERMELHO)");
            
        document.getElementById('victoryTeamName').innerText = winnerName;
        
        const btnSaveResult = document.getElementById('btnSaveResult');
        const warning = document.getElementById('victoryTeamWarning');
        const eloInfoDiv = document.getElementById('victoryEloInfo');

        // Validações de segurança para o Placar Público
        if (!select1.value || !select2.value || select1.value === select2.value) { 
            btnSaveResult.classList.add('hidden'); 
            warning.classList.remove('hidden'); 
            warning.innerText = "Selecione duas equipes válidas e diferentes.";
            if(eloInfoDiv) eloInfoDiv.classList.add('hidden');
        } else if (!state.isAuthenticated && !state.eloEnabled) {
            btnSaveResult.classList.add('hidden'); 
            warning.classList.remove('hidden'); 
            warning.innerText = "O Placar Público está fechado. Apenas o administrador pode salvar os resultados.";
            if(eloInfoDiv) eloInfoDiv.classList.add('hidden');
        } else { 
            btnSaveResult.classList.remove('hidden'); 
            warning.classList.add('hidden'); 
            
            // Busca a prévia do Elo (Essa função continua no ui.js, pois mexe com o DOM)
            if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
        }
        
        document.getElementById('victoryModal').classList.remove('hidden'); 
        document.getElementById('victoryModal').classList.add('flex');
        
        if (isCapoteWin) showToast("🔥 VITÓRIA POR CAPOTE! 🔥", "success");
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

/**
 * Aplica o resultado matemático no banco de dados e salva o histórico
 */
export const saveAndCloseVictoryModal = async (previewData) => {
    // Trava de segurança: Se a pontuação já for 0, alguém já salvou.
    if (state.score1 === 0 && state.score2 === 0) {
        showToast("Esta partida já foi encerrada por outro usuário.", "warning");
        return;
    }

    if (!previewData) {
        showToast("Dados do placar ausentes!", "error");
        return;
    }

    const { changeT1, changeT2, team1, team2, isTeam1Winner } = previewData;
    const actualT1 = isTeam1Winner ? 1 : 0;
    const actualT2 = isTeam1Winner ? 0 : 1;

    const btnSave = document.getElementById('btnSaveResult');
    btnSave.innerText = "SALVANDO...";
    btnSave.disabled = true;

    try {
        const updatePromises = [];
        const processedPlayerIds = new Set(); // Previne que o mesmo ID compute pontos duas vezes

        // Processa o resultado para cada jogador usando o rankingService
        const processTeam = (team, change, isWinActual) => {
            team.players.forEach(p => {
                if (processedPlayerIds.has(p.id)) return; 
                processedPlayerIds.add(p.id);

                const dbPlayer = state.players.find(x => x.id === p.id);
                if (dbPlayer) {
                    const partidas = (dbPlayer.partidas || 0) + 1;
                    const vitorias = (dbPlayer.vitorias || 0) + isWinActual;
                    
                    const currentStreak = dbPlayer.streak || 0;
                    const newStreak = isWinActual === 1 ? (currentStreak >= 0 ? currentStreak + 1 : 1) : (currentStreak <= 0 ? currentStreak - 1 : -1);
                    
                    // Chama o serviço isolado para saber qual o Elo final do jogador
                    const finalChange = calculatePlayerFinalEloChange(change, isWinActual === 1, currentStreak);
                    const newElo = Math.max(0, (dbPlayer.eloRating !== undefined ? dbPlayer.eloRating : 150) + finalChange);
                    
                    updatePromises.push(updateDoc(doc(playersRef, p.id), {
                        eloRating: newElo, 
                        partidas, 
                        vitorias, 
                        streak: newStreak, 
                        updatedAt: Date.now()
                    }));
                }
            });
        };

        processTeam(team1, changeT1, actualT1);
        processTeam(team2, changeT2, actualT2);

        // Salvar histórico
        const matchRecord = {
            timestamp: Date.now(),
            dateString: new Date().toLocaleDateString('pt-BR'),
            team1: { name: getTeamName(team1), score: state.score1, players: team1.players.map(p => p.name) },
            team2: { name: getTeamName(team2), score: state.score2, players: team2.players.map(p => p.name) },
            winner: isTeam1Winner ? 1 : 2,
            eloGain: isTeam1Winner ? changeT1 : changeT2
        };
        updatePromises.push(addDoc(matchHistoryRef, matchRecord));

        await Promise.all(updatePromises);
        
        const ptsGanhos = isTeam1Winner ? changeT1 : changeT2;
        showToast(`Ranking Atualizado! Time vencedor faturou +${ptsGanhos} de Elo.`, "success");

        // Limpeza visual
        closeVictoryModalOnly();
        
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar resultado.", "error");
    } finally {
        btnSave.innerText = "SALVAR RANKING";
        btnSave.disabled = false;
    }
};