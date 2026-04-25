import { state } from '../state.js';
import { calculateEloMatch, calculatePlayerFinalEloChange } from '../services/rankingService.js';
import { db, doc, updateDoc, addDoc, playersRef, matchHistoryRef, settingsRef, setDoc } from '../firebase.js';
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
export const updateScore = (team, change) => {
    if (state.isPlacarLocked) return; // <-- BLOQUEIA CLIQUES FANTASMA
    // 1. Atualiza a pontuação APENAS no dispositivo local!
    if (team === 1) {
        state.score1 = Math.max(0, state.score1 + change);
        document.getElementById('score1').innerText = state.score1;
    } else {
        state.score2 = Math.max(0, state.score2 + change);
        document.getElementById('score2').innerText = state.score2;
    }
    
    if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
    checkWinCondition();
    // 2. Repare que removemos o updateDoc(settingsRef). O Firebase não recebe mais os pontos.
};

/**
 * Zera o placar local e na nuvem
 */
export const resetScore = () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Existe uma partida em andamento em outro dispositivo.", "info");
        return;
    }

    openConfirmModal("Zerar Placar", "Deseja realmente zerar a pontuação e liberar a quadra para outros usuários?", async () => {
        // 1. Reseta o estado local
        state.score1 = 0;
        state.score2 = 0;
        state.currentTeam1 = '';
        state.currentTeam2 = '';

        // 2. Limpa a Interface (UI)
        const s1 = document.getElementById('score1'); if(s1) s1.innerText = '0';
        const s2 = document.getElementById('score2'); if(s2) s2.innerText = '0';
        const t1 = document.getElementById('team1Select'); if(t1) t1.value = '';
        const t2 = document.getElementById('team2Select'); if(t2) t2.value = '';

        // 3. Libera a quadra no Firebase (Sincronização)
        try {
            // Usamos setDoc com merge para garantir que os campos de bloqueio sejam resetados
            await setDoc(settingsRef, { 
                matchInProgress: false, 
                matchOwner: null,
                team1: '',
                team2: '',
                score1: 0,
                score2: 0
            }, { merge: true });
            
            showToast("Placar reiniciado e quadra liberada.", "info");
        } catch (e) {
            console.error("Erro ao liberar quadra no reset:", e);
            showToast("Erro ao sincronizar liberação.", "error");
        }

        // 4. Atualiza o preview (que deve sumir, já que não há times)
        if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
    });
};

/**
 * Sincroniza a seleção de times no placar com a nuvem 
 * e aciona o preview de Elo.
 */
export const syncTeamsToCloud = async () => {
    if (state.isPlacarLocked) return; // <-- IMPEDE TROCAR TIMES DURANTE JOGO ALHEIO

    const select1 = document.getElementById('team1Select');
    const select2 = document.getElementById('team2Select');
    
    const t1 = select1?.value || '';
    const t2 = select2?.value || '';
    
    state.currentTeam1 = t1;
    state.currentTeam2 = t2;
    
    const isMatchActive = t1 !== '' || t2 !== '';
    
    try {
        // USAMOS setDoc com merge: true para garantir que o documento 'global' existe
        await setDoc(settingsRef, { 
            matchInProgress: isMatchActive,
            matchOwner: isMatchActive ? state.localSessionId : null
        }, { merge: true });
        
        console.log("Sinal de ocupado enviado:", isMatchActive);
    } catch (e) {
        console.error("Erro ao bloquear a quadra:", e);
    }
    
    if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
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
export const saveAndCloseVictoryModal = async () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Existe uma partida em andamento em outro dispositivo.", "info");
        return;
    }

    // 1. Recupera os dados da partida diretamente da UI
    const previewData = updateLiveEloPreview();

    if (!previewData) {
        showToast("Selecione dois times válidos no placar!", "error");
        return;
    }

    // Trava de segurança: impede salvamento duplo
    if (state.score1 === 0 && state.score2 === 0) {
        showToast("Esta partida já foi encerrada.", "warning");
        return;
    }

    const { changeT1, changeT2, team1, team2, isTeam1Winner } = previewData;
    const btnSave = document.getElementById('btnSaveResult');
    btnSave.innerText = "SALVANDO...";
    btnSave.disabled = true;

    try {
        const updatePromises = [];
        const processedPlayerIds = new Set();

        const processTeam = (team, change, isWinActual) => {
            team.players.forEach(p => {
                if (processedPlayerIds.has(p.id)) return; 
                processedPlayerIds.add(p.id);

                const dbPlayer = state.players.find(x => x.id === p.id);
                if (dbPlayer) {
                    const partidas = (dbPlayer.partidas || 0) + 1;
                    const vitorias = (dbPlayer.vitorias || 0) + (isWinActual ? 1 : 0);
                    const currentStreak = dbPlayer.streak || 0;
                    const newStreak = isWinActual ? (currentStreak >= 0 ? currentStreak + 1 : 1) : (currentStreak <= 0 ? currentStreak - 1 : -1);
                    
                    const finalChange = calculatePlayerFinalEloChange(change, isWinActual, currentStreak);
                    const newElo = Math.max(0, (dbPlayer.eloRating ?? 150) + finalChange);
                    
                    updatePromises.push(updateDoc(doc(playersRef, p.id), {
                        eloRating: newElo, partidas, vitorias, streak: newStreak, updatedAt: Date.now()
                    }));
                }
            });
        };

        processTeam(team1, changeT1, isTeam1Winner);
        processTeam(team2, changeT2, !isTeam1Winner);

        // Salva Histórico
        updatePromises.push(addDoc(matchHistoryRef, {
            timestamp: Date.now(),
            dateString: new Date().toLocaleDateString('pt-BR'),
            team1: { name: getTeamName(team1), score: state.score1, players: team1.players.map(p => p.name) },
            team2: { name: getTeamName(team2), score: state.score2, players: team2.players.map(p => p.name) },
            winner: isTeam1Winner ? 1 : 2,
            eloGain: isTeam1Winner ? changeT1 : changeT2
        }));

        await Promise.all(updatePromises);
        showToast(`Ranking Atualizado! +${isTeam1Winner ? changeT1 : changeT2} Elo.`, "success");

        // 2. DISPARA O RESET COMPLETO (Limpa placar e desmarca times)
        await closeVictoryModalOnly();
        
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar resultado.", "error");
    } finally {
        btnSave.innerText = "SALVAR RANKING";
        btnSave.disabled = false;
    }
};