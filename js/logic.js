import { state } from './state.js';
import { db, appId, teamsRef, doc, addDoc, updateDoc, deleteDoc } from './firebase.js';
import { showToast, openConfirmModal } from './ui.js';

// --- Algoritmos de Balanceamento (Rigorosamente baseados no TeamBalancer.kt) --- //

export function balanceStrongInside(playersList, playersPerTeam) {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    
    if (numberOfTeams === 0) {
        return { teams: [], waitlist: [...playersList] };
    }

    // 1. Shuffled
    let shuffledPlayers = [...playersList];
    for (let i = shuffledPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
    }
    
    // 2. Sorted By Descending (rating = categoria de 1 a 5)
    let sortedPlayers = shuffledPlayers.sort((a, b) => (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1));
    
    const activePlayersCount = numberOfTeams * playersPerTeam;
    const activePlayers = sortedPlayers.slice(0, activePlayersCount);
    const waitlist = sortedPlayers.slice(activePlayersCount);
    
    const teams = Array.from({ length: numberOfTeams }, () => []);
    
    let direction = 1;
    let currentTeamIndex = 0;
    
    // Distribuição em zigue-zague (Serpentine Draft)
    for (const player of activePlayers) {
        teams[currentTeamIndex].push(player);
        currentTeamIndex += direction;
        
        if (currentTeamIndex >= numberOfTeams) {
            direction = -1;
            currentTeamIndex = numberOfTeams - 1;
        } else if (currentTeamIndex < 0) {
            direction = 1;
            currentTeamIndex = 0;
        }
    }
    
    return { teams, waitlist };
}

export function balanceStrongOutside(playersList, playersPerTeam) {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    const waitlistSize = playersList.length % playersPerTeam;
    
    if (numberOfTeams === 0) {
        return { teams: [], waitlist: [...playersList] };
    }

    // 1. Shuffled
    let shuffledPlayers = [...playersList];
    for (let i = shuffledPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
    }
    
    // 2. Sorted By Descending
    let sortedPlayers = shuffledPlayers.sort((a, b) => (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1));
    
    const teams = Array.from({ length: numberOfTeams }, () => []);
    const waitlist = [];
    
    const buckets = [...teams];
    if (waitlistSize > 0) buckets.push(waitlist);
    
    const capacities = buckets.map((_, i) => i < numberOfTeams ? playersPerTeam : waitlistSize);
    
    const draftOrder = [];
    const currentCaps = new Array(buckets.length).fill(0);
    let dir = 1;
    let cur = 0;
    
    while (draftOrder.length < playersList.length) {
        if (currentCaps[cur] < capacities[cur]) {
            draftOrder.push(cur);
            currentCaps[cur]++;
        }
        
        const next = cur + dir;
        if (next >= buckets.length || next < 0) {
            dir *= -1;
        } else {
            cur = next;
        }
    }
    
    sortedPlayers.forEach((player, index) => { 
        const bucketIndex = draftOrder[index]; 
        buckets[bucketIndex].push(player); 
    });

    // --- LÓGICA DE BALANCEAMENTO ALEATÓRIO PÓS-SORTEIO ---
    if (waitlist.length > 0 && teams.length >= 2) {
        let attempts = 0;
        while (attempts < 5) {
            let weakestTeam = teams[0];
            let strongestTeam = teams[0];
            let minSum = Infinity;
            let maxSum = -Infinity;

            // Encontra a equipa mais fraca e a mais forte baseada no somatório das categorias
            teams.forEach(t => {
                const sum = t.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0);
                if (sum < minSum) { minSum = sum; weakestTeam = t; }
                if (sum > maxSum) { maxSum = sum; strongestTeam = t; }
            });

            const diff = maxSum - minSum;
            if (diff <= 0) break; // Equipas perfeitamente niveladas

            // Encontra o jogador mais fraco da equipa mais fraca
            let weakestPlayer = weakestTeam[0];
            let minRating = Infinity;
            weakestTeam.forEach(p => {
                const r = parseInt(p.categoria) || 1;
                if (r < minRating) { minRating = r; weakestPlayer = p; }
            });

            // Descobre qual é a maior nota atualmente na lista de espera
            let maxWaitlistRating = -Infinity;
            waitlist.forEach(p => {
                const r = parseInt(p.categoria) || 1;
                if (r > maxWaitlistRating) { maxWaitlistRating = r; }
            });

            const weakestPlayerRating = parseInt(weakestPlayer.categoria) || 1;

            // Filtra os candidatos: > que o jogador fraco E diferente do líder da espera
            const candidates = waitlist.filter(p => {
                const r = parseInt(p.categoria) || 1;
                return r > weakestPlayerRating && r !== maxWaitlistRating;
            });

            if (candidates.length > 0) {
                // Sorteia um candidato válido para entrar
                const swapIn = candidates[Math.floor(Math.random() * candidates.length)];
                
                // Realiza a troca (Swap)
                const weakestIdx = weakestTeam.indexOf(weakestPlayer);
                weakestTeam.splice(weakestIdx, 1);
                
                const swapInIdx = waitlist.indexOf(swapIn);
                waitlist.splice(swapInIdx, 1);

                weakestTeam.push(swapIn);
                waitlist.push(weakestPlayer);
            } else {
                break; // Sem candidatos válidos, encerra o pós-balanceamento
            }
            attempts++;
        }
    }

    return { teams, waitlist };
}

// Extra: Função de salvaguarda de espalhamento de cabeças de chave. 
// Opcional, mas ajuda a garantir que jogadores de nível 5 (Cabeça de Chave) não fiquem na mesma equipa se houver vagas.
export function preventDoubleCabeças(result, mandatoryIds) {
    let teams = result.teams.map(t => [...t]);
    let waitlist = [...result.waitlist];
    
    for (let i = 0; i < teams.length; i++) {
        let team = teams[i];
        let cabecas = team.filter(p => parseInt(p.categoria) === 5);
        
        while (cabecas.length > 1) {
            let toMoveIndex = cabecas.findIndex(p => !mandatoryIds.has(p.id));
            let toMove = toMoveIndex !== -1 ? cabecas.splice(toMoveIndex, 1)[0] : cabecas.pop();
            let swapped = false;
            
            let teamWithZeroIndex = teams.findIndex(t => t.filter(p => parseInt(p.categoria) === 5).length === 0);
            if (teamWithZeroIndex !== -1) {
                let otherTeam = teams[teamWithZeroIndex];
                let nonCabecas = otherTeam.filter(p => parseInt(p.categoria) !== 5).sort((a, b) => (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1));
                if (nonCabecas.length > 0) {
                    let swapTarget = nonCabecas[0];
                    team.splice(team.indexOf(toMove), 1, swapTarget);
                    otherTeam.splice(otherTeam.indexOf(swapTarget), 1, toMove);
                    swapped = true;
                }
            }
            
            if (!swapped && waitlist.length > 0) {
                let nonCabecasWait = waitlist.filter(p => parseInt(p.categoria) !== 5).sort((a, b) => (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1));
                if (nonCabecasWait.length > 0) {
                    let swapTarget = nonCabecasWait[0];
                    team.splice(team.indexOf(toMove), 1, swapTarget);
                    waitlist.splice(waitlist.indexOf(swapTarget), 1, toMove);
                    swapped = true;
                }
            }
            if (!swapped) break; 
        }
    }
    return { teams, waitlist };
}

// --- Funções de Controlo de Equipas --- //

export const drawTeams = async (size) => {
    const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
    if (activePlayers.length === 0) { showToast("Selecione os atletas para o jogo!", "error"); return; }

    const numTeamsToDraw = Math.floor(activePlayers.length / size);
    if (numTeamsToDraw === 0) { showToast(`Selecione pelo menos ${size} jogadores para o sorteio!`, "error"); return; }

    const strategy = document.getElementById('draftStrategy').value;
    let result = { teams: [], waitlist: [] };
    
    strategy === 'FORA' ? result = balanceStrongOutside(activePlayers, size) : result = balanceStrongInside(activePlayers, size);
    
    // Aplica a salvaguarda extra
    result = preventDoubleCabeças(result, new Set());

    openConfirmModal("Sorteio Geral", "Deseja realizar um novo sorteio geral? Todas as equipes atuais serão desfeitas.", async () => {
        try {
            const deletePromises = state.drawnTeams.map(t => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', t.id)));
            await Promise.all(deletePromises);
            
            for (let i = 0; i < result.teams.length; i++) {
                let sortedTeam = result.teams[i].sort((a, b) => {
                    const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                    if (catDiff !== 0) return catDiff;
                    return (b.pontos || 0) - (a.pontos || 0);
                });
                await addDoc(teamsRef, { label: (i + 1).toString(), players: sortedTeam });
            }
            
            if (result.waitlist.length > 0) {
                let sortedWaitlist = result.waitlist.sort((a, b) => {
                    const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                    if (catDiff !== 0) return catDiff;
                    return (b.pontos || 0) - (a.pontos || 0);
                });
                await addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: sortedWaitlist });
                showToast(`Sorteio concluído! ${result.waitlist.length} atleta(s) na espera.`);
            } else { 
                showToast("Equipes perfeitamente equilibradas geradas!"); 
            }
        } catch(e) { showToast("Erro ao realizar Sorteio Geral", "error"); }
    });
};

export const redrawTeamWithWaitlist = async (teamId) => {
    openConfirmModal("Sortear Substituições", "Deseja retirar os jogadores da espera e montar um novo time substituindo este?", async () => {
        const targetTeamDoc = state.drawnTeams.find(t => t.id === teamId);
        if (!targetTeamDoc) return;

        const waitlistTeamDoc = state.drawnTeams.find(t => t.isWaitlist);
        const waitlistIds = new Set(waitlistTeamDoc ? waitlistTeamDoc.players.map(p => p.id) : []);
        const allPlayersInTeams = new Set(state.drawnTeams.filter(t => !t.isWaitlist).flatMap(t => t.players.map(p => p.id)));
        const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
        const newlySelected = activePlayers.filter(p => !allPlayersInTeams.has(p.id) && !waitlistIds.has(p.id));
        
        let incomingPlayers = [...(waitlistTeamDoc ? waitlistTeamDoc.players : []), ...newlySelected];

        if (incomingPlayers.length === 0) {
            showToast("Não há ninguém na lista de espera para entrar!", "error");
            return;
        }

        incomingPlayers = incomingPlayers.sort(() => Math.random() - 0.5);

        let originalTeamPlayers = [...targetTeamDoc.players];
        let newTeamPlayers = [];
        let nextWaitlist = [];
        let swapCount = Math.min(incomingPlayers.length, originalTeamPlayers.length);

        for (let i = 0; i < swapCount; i++) {
            let inP = incomingPlayers[i];
            let closestIdx = 0;
            let minDiff = Infinity;
            for(let j = 0; j < originalTeamPlayers.length; j++) {
                let diff = Math.abs((parseInt(originalTeamPlayers[j].categoria) || 1) - (parseInt(inP.categoria) || 1));
                if(diff < minDiff) { minDiff = diff; closestIdx = j; }
            }
            let outP = originalTeamPlayers.splice(closestIdx, 1)[0];
            nextWaitlist.push(outP);
            newTeamPlayers.push(inP);
        }
        newTeamPlayers.push(...originalTeamPlayers);

        for (let i = swapCount; i < incomingPlayers.length; i++) { nextWaitlist.push(incomingPlayers[i]); }

        let localResult = preventDoubleCabeças({ teams: [newTeamPlayers], waitlist: nextWaitlist }, new Set());
        
        newTeamPlayers = localResult.teams[0].sort((a, b) => {
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return (b.pontos || 0) - (a.pontos || 0);
        });
        
        nextWaitlist = localResult.waitlist.sort((a, b) => {
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return (b.pontos || 0) - (a.pontos || 0);
        });

        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', targetTeamDoc.id), { players: newTeamPlayers });
            if (waitlistTeamDoc) {
                if (nextWaitlist.length > 0) {
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id), { players: nextWaitlist });
                } else {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id));
                }
            } else if (nextWaitlist.length > 0) {
                await addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: nextWaitlist });
            }
            showToast("Time atualizado com a Lista de Espera!", "success");
        } catch(e) { console.error(e); showToast("Erro ao substituir equipe", "error"); }
    });
};

export const createWaitlist = () => {
    const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
    if (activePlayers.length === 0) { showToast("Selecione os atletas para adicionar à espera!", "error"); return; }
    
    openConfirmModal("Criar Lista de Espera", "Deseja mover os jogadores selecionados para a Lista de Espera?", async () => {
        try {
            const waitlistTeamDoc = state.drawnTeams.find(t => t.isWaitlist);
            let currentWaitlistPlayers = waitlistTeamDoc ? [...waitlistTeamDoc.players] : [];
            const existingIds = new Set(currentWaitlistPlayers.map(p => p.id));
            const newPlayersToAdd = activePlayers.filter(p => !existingIds.has(p.id));
            
            if (newPlayersToAdd.length === 0 && activePlayers.length > 0) { 
                showToast("Os jogadores selecionados já estão na espera!", "info"); 
                return; 
            }
            
            const updatedWaitlist = [...currentWaitlistPlayers, ...newPlayersToAdd].sort((a, b) => {
                const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                if (catDiff !== 0) return catDiff;
                return (b.pontos || 0) - (a.pontos || 0);
            });
            
            const updatePromises = [];
            for (const team of state.drawnTeams) {
                if (!team.isWaitlist) {
                    const filteredPlayers = team.players.filter(p => !state.selectedPlayerIds.has(p.id));
                    if (filteredPlayers.length !== team.players.length) {
                        if (filteredPlayers.length === 0) updatePromises.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', team.id)));
                        else updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', team.id), { players: filteredPlayers }));
                    }
                }
            }
            
            if (waitlistTeamDoc) updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id), { players: updatedWaitlist }));
            else updatePromises.push(addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: updatedWaitlist }));
            
            await Promise.all(updatePromises);
            showToast("Lista de Espera criada/atualizada com sucesso!", "success");
        } catch (e) { showToast("Erro ao criar lista de espera", "error"); }
    });
};

export const clearTeams = () => {
    openConfirmModal("Limpar Todas as Equipes", "Deseja realmente excluir todas as equipes geradas?", async () => {
        try {
            const deletePromises = state.drawnTeams.map(t => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', t.id)));
            await Promise.all(deletePromises);
            showToast("Todas as equipes foram removidas!", "info");
        } catch (e) { showToast("Erro ao limpar equipes", "error"); }
    });
};

export const deleteTeam = (id) => {
    openConfirmModal("Remover Equipe", "Deseja remover esta equipe do sorteio?", async () => {
        try { 
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', id)); 
            showToast("Equipe removida.", "info"); 
        } catch (e) { showToast("Erro ao excluir", "error"); }
    });
};

// --- Funções de Placar --- //

export function checkWinCondition() {
    const isTradicionalWin = (state.score1 >= 21 || state.score2 >= 21) && Math.abs(state.score1 - state.score2) >= 2;
    const isCapoteWin = (state.score1 >= 8 && state.score2 === 0) || (state.score2 >= 8 && state.score1 === 0);
    
    if (isTradicionalWin || isCapoteWin) {
        const select1 = document.getElementById('team1Select');
        const select2 = document.getElementById('team2Select');
        
        let winnerName = state.score1 > state.score2 
            ? (select1.value && select1.selectedIndex > 0 ? select1.options[select1.selectedIndex].text : "TIME 1 (AZUL)") 
            : (select2.value && select2.selectedIndex > 0 ? select2.options[select2.selectedIndex].text : "TIME 2 (VERMELHO)");
        
        document.getElementById('victoryTeamName').innerText = winnerName;
        
        if (!select1.value || !select2.value || select1.value === select2.value) { 
            document.getElementById('btnSaveResult').classList.add('hidden'); 
            document.getElementById('victoryTeamWarning').classList.remove('hidden'); 
        } else { 
            document.getElementById('btnSaveResult').classList.remove('hidden'); 
            document.getElementById('victoryTeamWarning').classList.add('hidden'); 
        }
        
        document.getElementById('victoryModal').classList.remove('hidden'); 
        document.getElementById('victoryModal').classList.add('flex');
        
        if (isCapoteWin) showToast("🔥 VITÓRIA POR CAPOTE (8 a 0)! 🔥", "success");
        lucide.createIcons();
    }
}

export const updateScore = (team, change) => {
    if (team === 1) { 
        state.score1 = Math.max(0, state.score1 + change); 
        document.getElementById('score1').innerText = state.score1; 
    } else { 
        state.score2 = Math.max(0, state.score2 + change); 
        document.getElementById('score2').innerText = state.score2; 
    }
    checkWinCondition();
};

export const resetScore = () => {
    openConfirmModal("Zerar Placar", "Deseja realmente zerar o placar da partida atual?", () => {
        state.score1 = 0; 
        state.score2 = 0; 
        document.getElementById('score1').innerText = state.score1; 
        document.getElementById('score2').innerText = state.score2;
        document.getElementById('team1Select').value = ''; 
        document.getElementById('team2Select').value = ''; 
        showToast("Placar zerado!", "info");
    });
};

// --- Bindings Globais --- //
window.drawTeams = drawTeams;
window.redrawTeamWithWaitlist = redrawTeamWithWaitlist;
window.createWaitlist = createWaitlist;
window.clearTeams = clearTeams;
window.deleteTeam = deleteTeam;
window.updateScore = updateScore;
window.resetScore = resetScore;