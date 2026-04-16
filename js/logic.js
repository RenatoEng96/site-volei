import { state } from './state.js';
import { db, appId, teamsRef, doc, addDoc, updateDoc, deleteDoc } from './firebase.js';
import { showToast, openConfirmModal, closeMoveModal } from './ui.js';

// --- Algoritmos de Balanceamento --- //

// NOVO MOTOR DE SORTEIO: Distribui iterativamente com base na menor soma atual 
// e aplica o desempate pelo nível máximo do jogador caso as somas sejam iguais.
function distributePlayersSmartly(playersList, capacities) {
    let buckets = capacities.map(() => []);

    // 1. Aleatoriedade total entre jogadores do mesmo nível
    let shuffledPlayers = [...playersList].map(p => ({...p, _rand: Math.random()}));
    let sortedPlayers = shuffledPlayers.sort((a, b) => {
        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
        if (catDiff !== 0) return catDiff;
        return a._rand - b._rand;
    });

    // 2. Distribuição Iterativa
    for (let p of sortedPlayers) {
        let eligibleIndices = [];
        for (let i = 0; i < buckets.length; i++) {
            if (buckets[i].length < capacities[i]) {
                eligibleIndices.push(i);
            }
        }
        if (eligibleIndices.length === 0) break; 

        // Embaralha os índices elegíveis para garantir aleatoriedade em empates absolutos
        eligibleIndices.sort(() => Math.random() - 0.5);

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
                        candWins = true; // O candidato tem um top-player mais fraco, ganha a prioridade
                        break;
                    } else if (cVal > bVal) {
                        break; // O melhor atual mantém a prioridade
                    }
                }
                if (candWins) {
                    bestBucketIndex = candidateIndex;
                }
            }
        }
        
        let { _rand, ...cleanPlayer } = p;
        buckets[bestBucketIndex].push({ ...cleanPlayer, waitlistRounds: 0 });
    }
    return buckets;
}

export function balanceStrongInside(playersList, playersPerTeam) {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    if (numberOfTeams === 0) return { teams: [], waitlist: playersList.map(p => ({...p, waitlistRounds: 0})) };

    // Sorteia a ordem da lista toda para não viciar quem vai ficar de fora em caso de empate de nível
    let shuffledPlayers = [...playersList].map(p => ({...p, _rand: Math.random()}));
    let sortedPlayers = shuffledPlayers.sort((a, b) => {
        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
        if (catDiff !== 0) return catDiff;
        return a._rand - b._rand;
    });

    const activePlayersCount = numberOfTeams * playersPerTeam;
    // Dentro Forte: Pega apenas os necessários para fechar os times completos
    const activePlayers = sortedPlayers.slice(0, activePlayersCount);
    // Os que sobraram vão direto para a espera
    const waitlistPlayers = sortedPlayers.slice(activePlayersCount).map(p => {
        let { _rand, ...clean } = p;
        return { ...clean, waitlistRounds: 0 };
    });

    const capacities = Array(numberOfTeams).fill(playersPerTeam);
    const teams = distributePlayersSmartly(activePlayers, capacities);

    return { teams, waitlist: waitlistPlayers };
}

export function balanceStrongOutside(playersList, playersPerTeam) {
    const numberOfTeams = Math.floor(playersList.length / playersPerTeam);
    const waitlistSize = playersList.length % playersPerTeam;
    if (numberOfTeams === 0) return { teams: [], waitlist: playersList.map(p => ({...p, waitlistRounds: 0})) };

    const capacities = Array(numberOfTeams).fill(playersPerTeam);
    if (waitlistSize > 0) {
        capacities.push(waitlistSize); // A lista de espera vira um "time/bucket" durante o sorteio
    }

    // Fora Forte: Distribui todo mundo entre times e o "time" da lista de espera
    const buckets = distributePlayersSmartly(playersList, capacities);

    const teams = buckets.slice(0, numberOfTeams);
    const waitlist = waitlistSize > 0 ? buckets[numberOfTeams] : [];

    return { teams, waitlist };
}

export const drawTeams = async () => {
    const sizeInput = document.getElementById('teamSize');
    const size = sizeInput ? parseInt(sizeInput.value) || 4 : 4;

    const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
    if (activePlayers.length === 0) { showToast("Selecione os atletas para o jogo!", "error"); return; }

    const numTeamsToDraw = Math.floor(activePlayers.length / size);
    if (numTeamsToDraw === 0) { showToast(`Selecione pelo menos ${size} jogadores para o sorteio!`, "error"); return; }

    const strategy = document.getElementById('draftStrategy').value;
    let result = strategy === 'FORA' ? balanceStrongOutside(activePlayers, size) : balanceStrongInside(activePlayers, size);

    openConfirmModal("Sorteio Geral", "Todas as equipes atuais serão desfeitas e os contadores zerados.", async () => {
        try {
            const deletePromises = state.drawnTeams.map(t => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', t.id)));
            await Promise.all(deletePromises);
            
            for (let i = 0; i < result.teams.length; i++) {
                let sortedTeam = result.teams[i].sort((a, b) => {
                    const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                    if (catDiff !== 0) return catDiff;
                    return a.name.localeCompare(b.name); 
                });
                await addDoc(teamsRef, { label: (i + 1).toString(), players: sortedTeam });
            }
            
            if (result.waitlist.length > 0) {
                let sortedWaitlist = result.waitlist.sort((a, b) => {
                    const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                    if (catDiff !== 0) return catDiff;
                    return a.name.localeCompare(b.name);
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
    openConfirmModal("Sorteio de Substituições", "Deseja substituir este time considerando as prioridades da lista de espera?", async () => {
        const targetTeamDoc = state.drawnTeams.find(t => t.id === teamId);
        if (!targetTeamDoc) return;

        const waitlistTeamDoc = state.drawnTeams.find(t => t.isWaitlist);
        const otherTeams = state.drawnTeams.filter(t => t.id !== teamId && !t.isWaitlist);
        
        let targetSum = 0;
        if (otherTeams.length > 0) {
            const totalOtherSum = otherTeams.reduce((acc, t) => acc + t.players.reduce((sum, p) => sum + (parseInt(p.categoria) || 1), 0), 0);
            targetSum = totalOtherSum / otherTeams.length;
        }

        const currentTeamPlayers = targetTeamDoc.players.map(p => ({...p, isFromTeam: true}));
        const waitlistPlayers = waitlistTeamDoc ? waitlistTeamDoc.players.map(p => ({...p, isFromWaitlist: true})) : [];
        
        const allAssignedIds = new Set([
            ...state.drawnTeams.filter(t => !t.isWaitlist).flatMap(t => t.players.map(p => p.id)),
            ...waitlistPlayers.map(p => p.id)
        ]);
        
        const activeSelected = state.players.filter(p => state.selectedPlayerIds.has(p.id));
        const newUnassigned = activeSelected.filter(p => !allAssignedIds.has(p.id)).map(p => ({...p, isNew: true, waitlistRounds: 0})); 
        
        let pool = [...currentTeamPlayers, ...waitlistPlayers, ...newUnassigned];
        
        const sizeInput = document.getElementById('teamSize');
        const N = sizeInput ? parseInt(sizeInput.value) || 4 : 4;

        if (pool.length < N) {
            showToast("Não há jogadores suficientes para formar um time completo.", "warning");
            return;
        }

        if (targetSum === 0) { 
            targetSum = pool.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0) * (N / pool.length);
        }

        // LÓGICA DA ESTRATÉGIA DA ESPERA
        const wlStrategy = document.getElementById('waitlistStrategy') ? document.getElementById('waitlistStrategy').value : 'BALANCEADO';
        
        // Se a estratégia for "FORCAR", todos da espera tornam-se obrigatórios (até ao limite N)
        let mandatory = pool.filter(p => p.isFromWaitlist && (wlStrategy === 'FORCAR' ? true : p.waitlistRounds >= 1));
        
        mandatory.sort((a, b) => {
            if (b.waitlistRounds !== a.waitlistRounds) return b.waitlistRounds - a.waitlistRounds;
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });
        
        if (mandatory.length > N) {
            mandatory = mandatory.slice(0, N);
        }

        const baseTeam = mandatory;
        const remainingPool = pool.filter(p => !baseTeam.some(m => m.id === p.id));
        const slotsLeft = N - baseTeam.length;

        let limitedPool = remainingPool;
        
        for (let i = limitedPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [limitedPool[i], limitedPool[j]] = [limitedPool[j], limitedPool[i]];
        }

        if (limitedPool.length > 12) {
            limitedPool.sort((a, b) => {
                const aVal = a.isFromWaitlist ? 1 : (a.isNew ? 0 : -1);
                const bVal = b.isFromWaitlist ? 1 : (b.isNew ? 0 : -1);
                if (bVal !== aVal) return bVal - aVal;
                return (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            });
            limitedPool = limitedPool.slice(0, 12);
        }

        function getCombinations(arr, k) {
            if (k === 0) return [[]];
            if (arr.length === 0) return [];
            const results = [];
            function helper(start, combo) {
                if (combo.length === k) { results.push([...combo]); return; }
                for (let i = start; i < arr.length; i++) {
                    combo.push(arr[i]); helper(i + 1, combo); combo.pop();
                }
            }
            helper(0, []);
            return results;
        }

        const combos = getCombinations(limitedPool, slotsLeft);
        
        let bestCombos = [];
        let minDiff = Infinity;
        let bestSwapCount = -1;

        if (slotsLeft === 0) {
            bestCombos = [baseTeam];
        } else {
            for (const combo of combos) {
                const candidateTeam = [...baseTeam, ...combo];
                const sum = candidateTeam.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0);
                const diff = Math.abs(sum - targetSum);
                const waitlistCount = candidateTeam.filter(p => p.isFromWaitlist || p.isNew).length;

                let isBetter = false;
                let isEqual = false;

                if (diff < minDiff) {
                    isBetter = true;
                } else if (diff === minDiff) {
                    if (waitlistCount > bestSwapCount) {
                        isBetter = true;
                    } else if (waitlistCount === bestSwapCount) {
                        isEqual = true; 
                    }
                }

                if (isBetter) {
                    minDiff = diff;
                    bestSwapCount = waitlistCount;
                    bestCombos = [candidateTeam];
                } else if (isEqual) {
                    bestCombos.push(candidateTeam); 
                }
            }
        }

        let bestTeam = bestCombos.length > 0 
            ? bestCombos[Math.floor(Math.random() * bestCombos.length)] 
            : baseTeam;

        const newTeamIds = new Set(bestTeam.map(p => p.id));
        
        const newTeam = bestTeam.map(p => {
            const { isFromTeam, isFromWaitlist, isNew, ...rest } = p;
            return { ...rest, waitlistRounds: 0 }; 
        }).sort((a, b) => {
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });

        const newWaitlist = pool.filter(p => !newTeamIds.has(p.id)).map(p => {
            const { isFromTeam, isFromWaitlist, isNew, ...rest } = p;
            let rounds = 0;
            if (isFromWaitlist) {
                rounds = (p.waitlistRounds || 0) + 1; 
            } else if (isFromTeam || isNew) {
                rounds = 0; 
            }
            return { ...rest, waitlistRounds: rounds };
        }).sort((a, b) => {
            if (b.waitlistRounds !== a.waitlistRounds) return (b.waitlistRounds || 0) - (a.waitlistRounds || 0);
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });

        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', targetTeamDoc.id), { players: newTeam });
            
            if (waitlistTeamDoc) {
                if (newWaitlist.length > 0) {
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id), { players: newWaitlist });
                } else {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id));
                }
            } else if (newWaitlist.length > 0) {
                await addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: newWaitlist });
            }
            showToast("Substituição feita e lotação corrigida!", "success");
        } catch(e) { console.error(e); showToast("Erro ao substituir equipe", "error"); }
    });
};

export const createWaitlist = () => {
    openConfirmModal("Sincronizar Presenças", "Isso irá remover os atletas desmarcados dos times e adicionar os novos marcados na lista de espera. Deseja continuar?", async () => {
        try {
            const waitlistTeamDoc = state.drawnTeams.find(t => t.isWaitlist);
            let currentWaitlistPlayers = [];
            const updatePromises = [];
            
            for (const team of state.drawnTeams) {
                if (!team.isWaitlist) {
                    const filteredPlayers = team.players.filter(p => state.selectedPlayerIds.has(p.id));
                    if (filteredPlayers.length !== team.players.length) {
                        if (filteredPlayers.length === 0) {
                            updatePromises.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', team.id)));
                        } else {
                            updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', team.id), { players: filteredPlayers }));
                        }
                    }
                } else {
                    currentWaitlistPlayers = team.players.filter(p => state.selectedPlayerIds.has(p.id));
                }
            }
            
            const playersInNormalTeamsIds = new Set(
                state.drawnTeams
                    .filter(t => !t.isWaitlist)
                    .flatMap(t => t.players.filter(p => state.selectedPlayerIds.has(p.id)).map(p => p.id))
            );
            const playersInWaitlistIds = new Set(currentWaitlistPlayers.map(p => p.id));
            
            const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
            const newPlayersToAdd = activePlayers.filter(p => !playersInNormalTeamsIds.has(p.id) && !playersInWaitlistIds.has(p.id));
            
            const newPlayersWithRounds = newPlayersToAdd.map(p => ({ ...p, waitlistRounds: 0 }));
            
            const updatedWaitlist = [...currentWaitlistPlayers, ...newPlayersWithRounds].sort((a, b) => {
                const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                if (catDiff !== 0) return catDiff;
                return a.name.localeCompare(b.name);
            });
            
            if (waitlistTeamDoc) {
                if (updatedWaitlist.length > 0) {
                    updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id), { players: updatedWaitlist }));
                } else {
                    // Correção do Bug do Parêntese
                    updatePromises.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeamDoc.id)));
                }
            } else if (updatedWaitlist.length > 0) {
                updatePromises.push(addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: updatedWaitlist }));
            }
            
            await Promise.all(updatePromises);
            showToast("Sincronização de presença concluída!", "success");
        } catch (e) { 
            console.error(e);
            showToast("Erro ao atualizar presenças", "error"); 
        }
    });
};

export const confirmMovePlayer = async () => {
    const destTeamId = document.getElementById('moveDestination').value;
    const { sourceTeamId, playerId } = state.moveData;

    if (!destTeamId || !sourceTeamId || !playerId) {
        showToast("Erro ao transferir jogador.", "error");
        return;
    }

    const sourceTeam = state.drawnTeams.find(t => t.id === sourceTeamId);
    const destTeam = state.drawnTeams.find(t => t.id === destTeamId);

    if (!sourceTeam || !destTeam) return;

    const playerIndex = sourceTeam.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    const playerToMove = sourceTeam.players.splice(playerIndex, 1)[0];

    if (destTeam.isWaitlist) {
        // CORREÇÃO: Ao mover manualmente para a espera, o contador é zerado
        playerToMove.waitlistRounds = 0;
    } else if (sourceTeam.isWaitlist) {
        playerToMove.waitlistRounds = 0;
    }

    destTeam.players.push(playerToMove);

    const sortFn = (a, b) => {
        if (destTeam.isWaitlist || sourceTeam.isWaitlist) {
            if (b.waitlistRounds !== a.waitlistRounds) return (b.waitlistRounds || 0) - (a.waitlistRounds || 0);
        }
        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
        if (catDiff !== 0) return catDiff;
        return a.name.localeCompare(b.name);
    };

    sourceTeam.players.sort(sortFn);
    destTeam.players.sort(sortFn);

    try {
        closeMoveModal();
        const updates = [];

        if (sourceTeam.players.length === 0) {
            updates.push(deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', sourceTeamId)));
        } else {
            updates.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', sourceTeamId), { players: sourceTeam.players }));
        }

        updates.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', destTeamId), { players: destTeam.players }));

        await Promise.all(updates);
        showToast("Transferência concluída!", "success");
    } catch (e) {
        console.error(e);
        showToast("Erro ao transferir jogador.", "error");
    }
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

// --- Funções de Placar e Sistema Elo --- //

export function calculateEloPreview() {
    const select1 = document.getElementById('team1Select');
    const select2 = document.getElementById('team2Select');
    if (!select1 || !select2 || !select1.value || !select2.value || select1.value === select2.value) return null;

    const team1 = state.drawnTeams.find(t => t.label === select1.value);
    const team2 = state.drawnTeams.find(t => t.label === select2.value);
    if (!team1 || !team2) return null;

    const getTeamElo = (team) => {
        if (team.players.length === 0) return 150;
        const sum = team.players.reduce((acc, p) => {
            const dbPlayer = state.players.find(x => x.id === p.id);
            const currentElo = dbPlayer && dbPlayer.eloRating !== undefined ? dbPlayer.eloRating : 150;
            return acc + currentElo;
        }, 0);
        return sum / team.players.length;
    };

    const eloT1 = getTeamElo(team1);
    const eloT2 = getTeamElo(team2);
    const expectedT1 = 1 / (1 + Math.pow(10, (eloT2 - eloT1) / 400));
    const expectedT2 = 1 / (1 + Math.pow(10, (eloT1 - eloT2) / 400));

    const isTeam1Winner = state.score1 > state.score2;
    const K = 32;

    const changeT1 = Math.round(K * ((isTeam1Winner ? 1 : 0) - expectedT1));
    const changeT2 = Math.round(K * ((isTeam1Winner ? 0 : 1) - expectedT2));

    return { changeT1, changeT2, team1, team2, isTeam1Winner };
}

export function checkWinCondition() {
    const isTradicionalWin = (state.score1 >= 21 || state.score2 >= 21) && Math.abs(state.score1 - state.score2) >= 2;
    const isCapoteWin = (state.score1 >= 8 && state.score2 === 0) || (state.score2 >= 8 && state.score1 === 0);
    
    if (isTradicionalWin || isCapoteWin) {
        const select1 = document.getElementById('team1Select'), select2 = document.getElementById('team2Select');
        let winnerName = state.score1 > state.score2 ? (select1.value && select1.selectedIndex > 0 ? select1.options[select1.selectedIndex].text : "TIME 1 (AZUL)") : (select2.value && select2.selectedIndex > 0 ? select2.options[select2.selectedIndex].text : "TIME 2 (VERMELHO)");
        document.getElementById('victoryTeamName').innerText = winnerName;
        
        const btnSaveResult = document.getElementById('btnSaveResult');
        const warning = document.getElementById('victoryTeamWarning');
        const eloInfoDiv = document.getElementById('victoryEloInfo');

        if (!select1.value || !select2.value || select1.value === select2.value) { 
            btnSaveResult.classList.add('hidden'); 
            warning.classList.remove('hidden'); 
            if(eloInfoDiv) eloInfoDiv.classList.add('hidden');
        } else { 
            btnSaveResult.classList.remove('hidden'); 
            warning.classList.add('hidden'); 
            
            const preview = calculateEloPreview();
            if (preview && eloInfoDiv) {
                const winChange = preview.isTeam1Winner ? preview.changeT1 : preview.changeT2;
                const loseChange = preview.isTeam1Winner ? preview.changeT2 : preview.changeT1;
                
                eloInfoDiv.innerHTML = `
                    <div class="flex justify-between items-center px-2">
                        <span class="text-green-400 font-bold flex items-center gap-1 text-base"><i data-lucide="trending-up" class="w-5 h-5"></i> +${winChange} ELO</span>
                        <span class="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Recompensa</span>
                        <span class="text-red-400 font-bold flex items-center gap-1 text-base"><i data-lucide="trending-down" class="w-5 h-5"></i> ${loseChange} ELO</span>
                    </div>
                `;
                eloInfoDiv.classList.remove('hidden');
            }
        }
        
        document.getElementById('victoryModal').classList.remove('hidden'); 
        document.getElementById('victoryModal').classList.add('flex');
        if (isCapoteWin) showToast("🔥 VITÓRIA POR CAPOTE (8 a 0)! 🔥", "success");
        lucide.createIcons();
    }
}

export const updateScore = (team, change) => {
    if (team === 1) { state.score1 = Math.max(0, state.score1 + change); document.getElementById('score1').innerText = state.score1; }
    else { state.score2 = Math.max(0, state.score2 + change); document.getElementById('score2').innerText = state.score2; }
    checkWinCondition();
};

export const resetScore = () => {
    openConfirmModal("Zerar Placar", "Deseja realmente zerar o placar da partida atual?", () => {
        state.score1 = 0; state.score2 = 0; 
        document.getElementById('score1').innerText = state.score1; 
        document.getElementById('score2').innerText = state.score2;
        document.getElementById('team1Select').value = ''; 
        document.getElementById('team2Select').value = ''; 
        showToast("Placar zerado!", "info");
    });
};

export const saveAndCloseVictoryModal = async () => {
    const preview = calculateEloPreview();
    if (!preview) {
        showToast("Selecione dois times válidos e diferentes no placar!", "error");
        return;
    }

    const { changeT1, changeT2, team1, team2, isTeam1Winner } = preview;
    const actualT1 = isTeam1Winner ? 1 : 0;
    const actualT2 = isTeam1Winner ? 0 : 1;

    const btnSave = document.getElementById('btnSaveResult');
    btnSave.innerText = "SALVANDO...";
    btnSave.disabled = true;

    try {
        const updatePromises = [];

        team1.players.forEach(p => {
            const dbPlayer = state.players.find(x => x.id === p.id);
            if (dbPlayer) {
                const currentElo = dbPlayer.eloRating !== undefined ? dbPlayer.eloRating : 150;
                const newElo = Math.max(0, currentElo + changeT1);
                
                const partidas = (dbPlayer.partidas || 0) + 1;
                const vitorias = (dbPlayer.vitorias || 0) + actualT1;
                const streak = actualT1 === 1 ? 
                    (dbPlayer.streak >= 0 ? dbPlayer.streak + 1 : 1) : 
                    (dbPlayer.streak <= 0 ? dbPlayer.streak - 1 : -1);

                updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', p.id), {
                    eloRating: newElo,
                    partidas: partidas,
                    vitorias: vitorias,
                    streak: streak,
                    updatedAt: Date.now()
                }));
            }
        });

        team2.players.forEach(p => {
            const dbPlayer = state.players.find(x => x.id === p.id);
            if (dbPlayer) {
                const currentElo = dbPlayer.eloRating !== undefined ? dbPlayer.eloRating : 150;
                const newElo = Math.max(0, currentElo + changeT2);
                
                const partidas = (dbPlayer.partidas || 0) + 1;
                const vitorias = (dbPlayer.vitorias || 0) + actualT2;
                const streak = actualT2 === 1 ? 
                    (dbPlayer.streak >= 0 ? dbPlayer.streak + 1 : 1) : 
                    (dbPlayer.streak <= 0 ? dbPlayer.streak - 1 : -1);

                updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', p.id), {
                    eloRating: newElo,
                    partidas: partidas,
                    vitorias: vitorias,
                    streak: streak,
                    updatedAt: Date.now()
                }));
            }
        });

        await Promise.all(updatePromises);
        
        const ptsGanhos = isTeam1Winner ? changeT1 : changeT2;
        showToast(`Ranking Atualizado! Time vencedor faturou +${ptsGanhos} de Elo.`, "success");

        document.getElementById('victoryModal').classList.add('hidden');
        document.getElementById('victoryModal').classList.remove('flex');
        
        state.score1 = 0; state.score2 = 0; 
        document.getElementById('score1').innerText = state.score1; 
        document.getElementById('score2').innerText = state.score2;
        document.getElementById('team1Select').value = ''; 
        document.getElementById('team2Select').value = ''; 
        
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar resultado.", "error");
    } finally {
        btnSave.innerText = "SALVAR RANKING";
        btnSave.disabled = false;
    }
};

// --- NOVA FUNÇÃO: Promover Lista de Espera para Time --- //
export const promoteWaitlistToTeam = async (waitlistTeamId) => {
    openConfirmModal("Promover Lista de Espera", "Deseja criar um novo time equilibrado usando os jogadores da lista de espera?", async () => {
        const waitlistDoc = state.drawnTeams.find(t => t.id === waitlistTeamId && t.isWaitlist);
        if (!waitlistDoc) return;

        const sizeInput = document.getElementById('teamSize');
        const N = sizeInput ? parseInt(sizeInput.value) || 4 : 4;

        if (waitlistDoc.players.length < N) {
            showToast(`A lista precisa ter pelo menos ${N} jogadores.`, "warning");
            return;
        }

        // 1. Calcula a força média dos times já existentes
        const existingTeams = state.drawnTeams.filter(t => !t.isWaitlist);
        let targetSum = 0;
        if (existingTeams.length > 0) {
            const totalSum = existingTeams.reduce((acc, t) => acc + t.players.reduce((sum, p) => sum + (parseInt(p.categoria) || 1), 0), 0);
            targetSum = totalSum / existingTeams.length;
        } else {
            targetSum = waitlistDoc.players.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0) * (N / waitlistDoc.players.length);
        }

        // 2. Prepara a lista e gera combinações possíveis para achar a mais equilibrada
        let pool = [...waitlistDoc.players];
        // Embaralha para garantir aleatoriedade no desempate
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        function getCombinations(arr, k) {
            if (k === 0) return [[]];
            if (arr.length === 0) return [];
            const results = [];
            function helper(start, combo) {
                if (combo.length === k) { results.push([...combo]); return; }
                for (let i = start; i < arr.length; i++) {
                    combo.push(arr[i]); helper(i + 1, combo); combo.pop();
                }
            }
            helper(0, []);
            return results;
        }

        const combos = getCombinations(pool, N);
        let bestCombos = [];
        let minDiff = Infinity;

        for (const combo of combos) {
            const sum = combo.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0);
            const diff = Math.abs(sum - targetSum);
            if (diff < minDiff) {
                minDiff = diff;
                bestCombos = [combo];
            } else if (diff === minDiff) {
                bestCombos.push(combo);
            }
        }

        // 3. Escolhe a combinação que mais se aproxima da média dos outros times
        let bestTeam = bestCombos[Math.floor(Math.random() * bestCombos.length)];

        const newTeamPlayers = bestTeam.map(p => ({...p, waitlistRounds: 0})).sort((a, b) => {
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });

        // 4. Quem sobrou continua na espera
        const newTeamIds = new Set(newTeamPlayers.map(p => p.id));
        const remainingWaitlist = pool.filter(p => !newTeamIds.has(p.id));

        const sortedWaitlist = remainingWaitlist.sort((a, b) => {
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });

        try {
            // Calcula qual será o número do novo time (maior número existente + 1)
            const existingTeams = state.drawnTeams.filter(t => !t.isWaitlist);
            let nextLabelNumber = 1;
            if (existingTeams.length > 0) {
                const maxLabel = Math.max(...existingTeams.map(t => parseInt(t.label) || 0));
                nextLabelNumber = maxLabel + 1;
            }

            await addDoc(teamsRef, { label: nextLabelNumber.toString(), players: newTeamPlayers });

            if (sortedWaitlist.length > 0) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistDoc.id), { players: sortedWaitlist });
            } else {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistDoc.id));
            }
            showToast("Nova equipe formada a partir da espera!", "success");
        } catch (e) {
            console.error(e);
            showToast("Erro ao promover lista de espera.", "error");
        }
    });
};

window.drawTeams = drawTeams;
window.redrawTeamWithWaitlist = redrawTeamWithWaitlist;
window.createWaitlist = createWaitlist;
window.clearTeams = clearTeams;
window.deleteTeam = deleteTeam;
window.updateScore = updateScore;
window.resetScore = resetScore;
window.confirmMovePlayer = confirmMovePlayer;
window.saveAndCloseVictoryModal = saveAndCloseVictoryModal;
window.promoteWaitlistToTeam = promoteWaitlistToTeam;