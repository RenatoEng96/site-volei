import { state } from '../state.js';
import { balanceStrongInside, balanceStrongOutside } from '../services/rankingService.js';
import { teamsRef, doc, addDoc, deleteDoc, updateDoc } from '../firebase.js';
import { showToast, openConfirmModal, closeMoveModal } from '../ui.js';

// ============================================================================
// SORTEIO PRINCIPAL
// ============================================================================

export const drawTeams = async () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Uma partida está em andamento agora.", "info");
        return;
    }

    const sizeInput = document.getElementById('teamSize');
    const size = sizeInput ? parseInt(sizeInput.value) || 4 : 4;

    // Trava de segurança: impede sorteios se um jogo estiver rolando
    const t1 = document.getElementById('team1Select')?.value;
    const t2 = document.getElementById('team2Select')?.value;
    if (t1 && t2 && (state.score1 > 0 || state.score2 > 0)) {
        showToast("Sorteio bloqueado! Um jogo está em andamento. Zere o placar primeiro.", "error");
        return;
    }

    const activePlayers = state.players.filter(p => state.selectedPlayerIds.has(p.id));
    if (activePlayers.length === 0) { 
        showToast("Selecione os atletas para o jogo!", "error"); 
        return; 
    }

    const numTeamsToDraw = Math.floor(activePlayers.length / size);
    if (numTeamsToDraw === 0) { 
        showToast(`Selecione pelo menos ${size} jogadores para o sorteio!`, "error"); 
        return; 
    }

    const strategy = document.getElementById('draftStrategy').value;
    
    // Delega a matemática pesada para o rankingService
    let result = strategy === 'FORA' 
        ? balanceStrongOutside(activePlayers, size) 
        : balanceStrongInside(activePlayers, size);

    openConfirmModal("Sorteio Geral", "Todas as equipes atuais serão desfeitas e os contadores zerados.", async () => {
        try {
            // 1. Limpa todas as equipes atuais no banco de dados
            const deletePromises = state.drawnTeams.map(t => deleteDoc(doc(teamsRef, t.id)));
            await Promise.all(deletePromises);
            
            // 2. Salva as novas equipes
            for (let i = 0; i < result.teams.length; i++) {
                let sortedTeam = result.teams[i].sort((a, b) => {
                    const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                    if (catDiff !== 0) return catDiff;
                    return a.name.localeCompare(b.name); 
                });
                await addDoc(teamsRef, { label: (i + 1).toString(), players: sortedTeam });
            }
            
            // 3. Salva a lista de espera (se houver)
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
        } catch(e) { 
            console.error(e);
            showToast("Erro ao realizar Sorteio Geral", "error"); 
        }
    });
};

// ============================================================================
// GERENCIAMENTO DE LISTA DE ESPERA E SUBSTITUIÇÕES
// ============================================================================

export const createWaitlist = () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Uma partida está em andamento agora.", "info");
        return;
    }

    openConfirmModal("Atualizar Lista de Espera", "Os atletas selecionados (que não estejam em times) formarão a nova lista de espera. Deseja continuar?", async () => {
        try {
            const waitlistTeamDoc = state.drawnTeams.find(t => t.isWaitlist);
            const normalTeams = state.drawnTeams.filter(t => !t.isWaitlist);

            // 1. Coleta os IDs de todos os jogadores que já estão em times normais (para os proteger)
            const playersInNormalTeamsIds = new Set(
                normalTeams.flatMap(t => t.players.map(p => p.id))
            );

            // 2. Filtra quem deve estar na espera: Tem que estar selecionado E NÃO estar num time normal
            const selectedForWaitlist = state.players.filter(p => 
                state.selectedPlayerIds.has(p.id) && !playersInNormalTeamsIds.has(p.id)
            );

            // 3. Monta a nova lista de espera preservando o histórico de quem já estava lá
            let updatedWaitlist = [];
            if (waitlistTeamDoc) {
                const existingWaitlistMap = new Map(waitlistTeamDoc.players.map(p => [p.id, p]));
                selectedForWaitlist.forEach(p => {
                    if (existingWaitlistMap.has(p.id)) {
                        updatedWaitlist.push(existingWaitlistMap.get(p.id)); // Mantém rodadas antigas
                    } else {
                        updatedWaitlist.push({ ...p, waitlistRounds: 0 }); // Novo na espera
                    }
                });
            } else {
                updatedWaitlist = selectedForWaitlist.map(p => ({ ...p, waitlistRounds: 0 }));
            }

            // 4. Ordena por categoria e ordem alfabética
            updatedWaitlist.sort((a, b) => {
                const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                if (catDiff !== 0) return catDiff;
                return (a.name || '').localeCompare(b.name || '');
            });

            // 5. Atualiza o banco de dados
            if (waitlistTeamDoc) {
                if (updatedWaitlist.length > 0) {
                    await updateDoc(doc(teamsRef, waitlistTeamDoc.id), { players: updatedWaitlist });
                } else {
                    await deleteDoc(doc(teamsRef, waitlistTeamDoc.id));
                }
            } else if (updatedWaitlist.length > 0) {
                await addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: updatedWaitlist });
            }
            
            showToast("Lista de espera atualizada com sucesso!", "success");
        } catch (e) {
            console.error(e);
            showToast("Erro ao atualizar a lista de espera.", "error");
        }
    });
};

export const clearTeams = () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Uma partida está em andamento agora.", "info");
        return;
    }

    openConfirmModal("Limpar Todas as Equipes", "Deseja realmente excluir todas as equipes geradas?", async () => {
        try {
            const deletePromises = state.drawnTeams.map(t => deleteDoc(doc(teamsRef, t.id)));
            await Promise.all(deletePromises);
            showToast("Todas as equipes foram removidas!", "info");
        } catch (e) { 
            showToast("Erro ao limpar equipes", "error"); 
        }
    });
};

// ============================================================================
// TRANSFERÊNCIAS MANUAIS E EXCLUSÕES INDIVIDUAIS
// ============================================================================

export const confirmMovePlayer = async () => {
    if (state.isPlacarLocked) {
        showToast("Ação bloqueada: Uma partida está em andamento agora.", "info");
        return;
    }

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

    // Reseta rodadas de espera se estiver entrando ou saindo da lista de espera
    if (destTeam.isWaitlist || sourceTeam.isWaitlist) {
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
            updates.push(deleteDoc(doc(teamsRef, sourceTeamId)));
        } else {
            updates.push(updateDoc(doc(teamsRef, sourceTeamId), { players: sourceTeam.players }));
        }

        updates.push(updateDoc(doc(teamsRef, destTeamId), { players: destTeam.players }));

        await Promise.all(updates);
        showToast("Transferência concluída!", "success");
    } catch (e) {
        console.error(e);
        showToast("Erro ao transferir jogador.", "error");
    }
};

export const deleteTeam = (id) => {
    const t1 = document.getElementById('team1Select')?.value;
    const t2 = document.getElementById('team2Select')?.value;
    if (t1 && t2 && (state.score1 > 0 || state.score2 > 0)) {
        showToast("Exclusão bloqueada! Um jogo está em andamento no placar.", "error");
        return;
    }

    const teamToDelete = state.drawnTeams.find(t => t.id === id);
    if (!teamToDelete) return;

    const modalMsg = teamToDelete.isWaitlist 
        ? "Deseja remover a lista de espera do sorteio?" 
        : "Deseja desmanchar esta equipe? Os jogadores serão enviados para a lista de espera.";

    openConfirmModal("Remover Equipe", modalMsg, async () => {
        try { 
            if (teamToDelete.isWaitlist) {
                await deleteDoc(doc(teamsRef, id)); 
                showToast("Lista de espera removida.", "info"); 
            } else {
                const waitlistTeam = state.drawnTeams.find(t => t.isWaitlist);
                const playersToMove = teamToDelete.players.map(p => ({ ...p, waitlistRounds: 0 }));
                const updates = [deleteDoc(doc(teamsRef, id))];

                if (waitlistTeam) {
                    const updatedWaitlistPlayers = [...waitlistTeam.players, ...playersToMove].sort((a, b) => {
                        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                        if (catDiff !== 0) return catDiff;
                        return a.name.localeCompare(b.name);
                    });
                    updates.push(updateDoc(doc(teamsRef, waitlistTeam.id), { players: updatedWaitlistPlayers }));
                } else {
                    const sortedPlayers = playersToMove.sort((a, b) => {
                        const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
                        if (catDiff !== 0) return catDiff;
                        return a.name.localeCompare(b.name);
                    });
                    updates.push(addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: sortedPlayers }));
                }

                await Promise.all(updates);
                showToast("Equipe desfeita! Jogadores na espera.", "info");
            }
        } catch (e) { 
            console.error(e);
            showToast("Erro ao excluir equipe", "error"); 
        }
    });
};

// ============================================================================
// SUBSTITUIÇÃO AVANÇADA (LISTA DE ESPERA)
// ============================================================================

export const redrawTeamWithWaitlist = async (teamId) => {
    const t1 = document.getElementById('team1Select')?.value;
    const t2 = document.getElementById('team2Select')?.value;
    if (t1 && t2 && (state.score1 > 0 || state.score2 > 0)) {
        showToast("Troca bloqueada! Um jogo está em andamento no placar.", "error");
        return;
    }
    
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

        const wlStrategy = document.getElementById('waitlistStrategy') ? document.getElementById('waitlistStrategy').value : 'BALANCEADO';
        
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

                if (diff < minDiff) {
                    minDiff = diff; bestSwapCount = waitlistCount; bestCombos = [candidateTeam];
                } else if (diff === minDiff) {
                    if (waitlistCount > bestSwapCount) {
                        bestSwapCount = waitlistCount; bestCombos = [candidateTeam];
                    } else if (waitlistCount === bestSwapCount) {
                        bestCombos.push(candidateTeam); 
                    }
                }
            }
        }

        let bestTeam = bestCombos.length > 0 ? bestCombos[Math.floor(Math.random() * bestCombos.length)] : baseTeam;
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
            if (isFromWaitlist) { rounds = (p.waitlistRounds || 0) + 1; } 
            else if (isFromTeam || isNew) { rounds = 0; }
            return { ...rest, waitlistRounds: rounds };
        }).sort((a, b) => {
            if (b.waitlistRounds !== a.waitlistRounds) return (b.waitlistRounds || 0) - (a.waitlistRounds || 0);
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });

        try {
            await updateDoc(doc(teamsRef, targetTeamDoc.id), { players: newTeam });
            if (waitlistTeamDoc) {
                if (newWaitlist.length > 0) { await updateDoc(doc(teamsRef, waitlistTeamDoc.id), { players: newWaitlist }); } 
                else { await deleteDoc(doc(teamsRef, waitlistTeamDoc.id)); }
            } else if (newWaitlist.length > 0) {
                await addDoc(teamsRef, { label: 'DE FORA', isWaitlist: true, players: newWaitlist });
            }
            showToast("Substituição feita e lotação corrigida!", "success");
        } catch(e) { console.error(e); showToast("Erro ao substituir equipe", "error"); }
    });
};

export const promoteWaitlistToTeam = async (waitlistTeamId) => {
    const t1 = document.getElementById('team1Select')?.value;
    const t2 = document.getElementById('team2Select')?.value;
    if (t1 && t2 && (state.score1 > 0 || state.score2 > 0)) {
        showToast("Ação bloqueada! Um jogo está em andamento no placar.", "error");
        return;
    }

    openConfirmModal("Promover Lista de Espera", "Deseja criar um novo time equilibrado usando os jogadores da lista de espera?", async () => {
        const waitlistDoc = state.drawnTeams.find(t => t.id === waitlistTeamId && t.isWaitlist);
        if (!waitlistDoc) return;

        const sizeInput = document.getElementById('teamSize');
        const N = sizeInput ? parseInt(sizeInput.value) || 4 : 4;

        if (waitlistDoc.players.length < N) {
            showToast(`A lista precisa ter pelo menos ${N} jogadores.`, "warning");
            return;
        }

        const existingTeams = state.drawnTeams.filter(t => !t.isWaitlist);
        let targetSum = 0;
        if (existingTeams.length > 0) {
            const totalSum = existingTeams.reduce((acc, t) => acc + t.players.reduce((sum, p) => sum + (parseInt(p.categoria) || 1), 0), 0);
            targetSum = totalSum / existingTeams.length;
        } else {
            targetSum = waitlistDoc.players.reduce((acc, p) => acc + (parseInt(p.categoria) || 1), 0) * (N / waitlistDoc.players.length);
        }

        let pool = [...waitlistDoc.players];
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
                minDiff = diff; bestCombos = [combo];
            } else if (diff === minDiff) {
                bestCombos.push(combo);
            }
        }

        let bestTeam = bestCombos[Math.floor(Math.random() * bestCombos.length)];

        const newTeamPlayers = bestTeam.map(p => ({...p, waitlistRounds: 0})).sort((a, b) => {
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });

        const newTeamIds = new Set(newTeamPlayers.map(p => p.id));
        const remainingWaitlist = pool.filter(p => !newTeamIds.has(p.id));
        const sortedWaitlist = remainingWaitlist.sort((a, b) => {
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1);
            if (catDiff !== 0) return catDiff;
            return a.name.localeCompare(b.name);
        });

        try {
            let nextLabelNumber = 1;
            if (existingTeams.length > 0) {
                const maxLabel = Math.max(...existingTeams.map(t => parseInt(t.label) || 0));
                nextLabelNumber = maxLabel + 1;
            }

            await addDoc(teamsRef, { label: nextLabelNumber.toString(), players: newTeamPlayers });

            if (sortedWaitlist.length > 0) {
                await updateDoc(doc(teamsRef, waitlistDoc.id), { players: sortedWaitlist });
            } else {
                await deleteDoc(doc(teamsRef, waitlistDoc.id));
            }
            showToast("Nova equipe formada a partir da espera!", "success");
        } catch (e) { console.error(e); showToast("Erro ao promover lista de espera.", "error"); }
    });
};