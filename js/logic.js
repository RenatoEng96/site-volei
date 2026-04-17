import { state } from './state.js';
import { showToast, openConfirmModal, getTeamName, closeVictoryModalOnly } from './ui.js';
import { db, teamsRef, matchHistoryRef } from './firebase.js';
import { doc, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = 'app-volei-teste';

function distributePlayersSmartly(playersList, capacities) {
    let buckets = capacities.map(() => []);
    
    let sortedPlayers = [...playersList].map(p => ({...p, _rand: Math.random()})).sort((a, b) => { 
        const c = (parseInt(b.categoria)||1) - (parseInt(a.categoria)||1); 
        if(c !== 0) return c; 
        return a._rand - b._rand; 
    });
    
    for (let p of sortedPlayers) {
        let eligible = []; 
        for(let i=0; i<buckets.length; i++) {
            if(buckets[i].length < capacities[i]) eligible.push(i);
        }
        
        if(eligible.length === 0) break;
        
        for(let j=eligible.length-1; j>0; j--) { 
            const r = Math.floor(Math.random()*(j+1)); 
            [eligible[j], eligible[r]] = [eligible[r], eligible[j]]; 
        }
        
        let bestIdx = eligible[0];
        
        for(let i=1; i<eligible.length; i++) {
            let candIdx = eligible[i];
            let sumBest = buckets[bestIdx].reduce((acc,v) => acc + (parseInt(v.categoria)||1), 0);
            let sumCand = buckets[candIdx].reduce((acc,v) => acc + (parseInt(v.categoria)||1), 0);
            if(sumCand < sumBest) bestIdx = candIdx;
        }
        
        let {_rand, ...clean} = p; 
        buckets[bestIdx].push({...clean, waitlistRounds:0});
    }
    
    return buckets;
}

const balanceStrongInside = (playersList, ppt) => {
    const numTeams = Math.floor(playersList.length/ppt);
    
    if(numTeams === 0) {
        return { teams: [], waitlist: playersList.map(p => ({...p, waitlistRounds: 0})) };
    }
    
    let sorted = [...playersList].map(p => ({...p, _rand: Math.random()})).sort((a,b) => { 
        const c = (parseInt(b.categoria)||1) - (parseInt(a.categoria)||1); 
        if(c !== 0) return c; 
        return a._rand - b._rand; 
    });
    
    const active = sorted.slice(0, numTeams * ppt);
    const waitlist = sorted.slice(numTeams * ppt).map(p => {
        let {_rand, ...clean} = p; 
        return {...clean, waitlistRounds: 0};
    });
    
    return { 
        teams: distributePlayersSmartly(active, Array(numTeams).fill(ppt)), 
        waitlist 
    };
};

const balanceStrongOutside = (playersList, ppt) => {
    const numTeams = Math.floor(playersList.length/ppt);
    const waitSize = playersList.length % ppt;
    
    if(numTeams === 0) {
        return { teams: [], waitlist: playersList.map(p => ({...p, waitlistRounds: 0})) };
    }
    
    const capacities = Array(numTeams).fill(ppt); 
    if(waitSize > 0) capacities.push(waitSize);
    
    const buckets = distributePlayersSmartly(playersList, capacities);
    
    return { 
        teams: buckets.slice(0, numTeams), 
        waitlist: waitSize > 0 ? buckets[numTeams] : [] 
    };
};

export const drawTeams = async () => {
    const size = parseInt(document.getElementById('teamSize').value) || 4;
    const active = state.players.filter(p => state.selectedPlayerIds.has(p.id));
    
    if(active.length === 0) { 
        showToast("Selecione atletas!", "error"); 
        return; 
    }
    
    if(Math.floor(active.length/size) === 0) { 
        showToast(`Mínimo de ${size} jogadores!`, "error"); 
        return; 
    }
    
    const strat = document.getElementById('draftStrategy').value;
    let res = strat === 'FORA' ? balanceStrongOutside(active, size) : balanceStrongInside(active, size);
    
    openConfirmModal("Sorteio Geral", "Todas as equipes atuais serão refeitas.", async () => {
        await Promise.all(state.drawnTeams.map(t => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', t.id))));
        
        for(let i=0; i<res.teams.length; i++) {
            let sorted = res.teams[i].sort((a,b) => (parseInt(b.categoria)||1) - (parseInt(a.categoria)||1));
            await addDoc(teamsRef, {label: (i+1).toString(), players: sorted});
        }
        
        if(res.waitlist.length > 0) {
            await addDoc(teamsRef, {label: 'DE FORA', isWaitlist: true, players: res.waitlist});
        }
        
        showToast("Sorteio concluído!");
    });
};

export const clearTeams = () => {
    openConfirmModal("Limpar Equipes", "Deseja limpar todos os times?", async () => { 
        await Promise.all(state.drawnTeams.map(t => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', t.id)))); 
        showToast("Limpas!"); 
    });
};

export const deleteTeam = (id) => {
    openConfirmModal("Remover", "Remover equipe?", async () => { 
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', id)); 
        showToast("Removida."); 
    });
};

export const createWaitlist = async () => {
    const waitlistTeam = state.drawnTeams.find(t => t.isWaitlist);
    
    if (!waitlistTeam) { 
        showToast("Nenhuma lista de espera encontrada", "error"); 
        return; 
    }
    
    const updated = waitlistTeam.players.map(p => ({...p, waitlistRounds: (p.waitlistRounds || 0) + 1}));
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeam.id), {players: updated});
    showToast("Lista de espera atualizada!", "success");
};

export const redrawTeamWithWaitlist = async (teamId) => {
    const teamToReplace = state.drawnTeams.find(t => t.id === teamId);
    const waitlistTeam = state.drawnTeams.find(t => t.isWaitlist);
    
    if (!teamToReplace || !waitlistTeam || waitlistTeam.players.length === 0) {
        showToast("Lista de espera vazia ou time inválido!", "error"); 
        return;
    }

    const strat = document.getElementById('waitlistStrategy').value;
    const teamSize = teamToReplace.players.length;
    
    let newWaitlist = [...waitlistTeam.players];
    let leavingPlayers = [...teamToReplace.players].map(p => ({...p, waitlistRounds: 0}));
    let newTeamPlayers = [];

    if (strat === 'FORCAR') {
        // REGRA 1: FORÇAR ENTRADA DE QUEM ESTÁ DE FORA
        // Prioriza quem está na fila há mais rodadas
        newWaitlist.sort((a, b) => ((b.waitlistRounds || 0) - (a.waitlistRounds || 0)) || ((parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1)));
        
        if (newWaitlist.length >= teamSize) {
            newTeamPlayers = newWaitlist.splice(0, teamSize);
            newWaitlist.push(...leavingPlayers);
        } else {
            // Todos da fila entram. O resto será sorteado de forma equilibrada entre quem estava na quadra.
            newTeamPlayers = [...newWaitlist];
            const needed = teamSize - newTeamPlayers.length;
            
            // Usa a lógica original de sorteio para eleger quem fica na quadra
            const capacities = [needed, leavingPlayers.length - needed];
            let buckets = distributePlayersSmartly(leavingPlayers, capacities);
            
            newTeamPlayers.push(...buckets[0]);
            newWaitlist = buckets[1] || []; 
        }
    } else {
        // REGRA 2: BALANCEADO (Sortear misturando quadra e fila)
        // Junta quem está de fora e quem ia sair num bolão só
        let pool = [...newWaitlist, ...leavingPlayers];
        
        // Pede ao sistema original de balanceamento para dividir essa multidão em dois blocos:
        // O Bloco 0 ganha o tamanho do time. O Bloco 1 fica com o resto e vira a nova fila de espera.
        const capacities = [teamSize];
        if (pool.length > teamSize) {
            capacities.push(pool.length - teamSize);
        }
        
        let buckets = distributePlayersSmartly(pool, capacities);
        
        newTeamPlayers = buckets[0];
        newWaitlist = buckets.length > 1 ? buckets[1] : [];
    }

    // Adiciona +1 rodada de espera para quem acabou ficando na fila
    newWaitlist = newWaitlist.map(p => ({...p, waitlistRounds: (p.waitlistRounds || 0) + 1}));
    
    openConfirmModal("Sortear da Espera", "Confirmar substituição e gerar novo time?", async () => {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', teamId), { players: newTeamPlayers });
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', waitlistTeam.id), { players: newWaitlist });
        showToast("Time sorteado com sucesso!");
    });
};

export const calculateEloPreview = () => {
    const sel1 = document.getElementById('team1Select').value;
    const sel2 = document.getElementById('team2Select').value;
    
    if(!sel1 || !sel2 || sel1 === sel2) return null;
    
    const t1 = state.drawnTeams.find(t => t.label === sel1);
    const t2 = state.drawnTeams.find(t => t.label === sel2);
    
    if(!t1 || !t2) return null;
    
    const getElo = t => t.players.length === 0 ? 150 : t.players.reduce((acc,p) => acc + ((state.players.find(x => x.id === p.id) || {}).eloRating || 150), 0) / t.players.length;
    
    const e1 = getElo(t1);
    const e2 = getElo(t2);
    const p1 = 1 / (1 + Math.pow(10, (e2-e1)/400));
    const p2 = 1 / (1 + Math.pow(10, (e1-e2)/400));
    
    const winT1 = Math.round(32 * (1 - p1));
    const loseT1 = Math.round(32 * (0 - p1));
    const winT2 = Math.round(32 * (1 - p2));
    const loseT2 = Math.round(32 * (0 - p2));
    
    const isTeam1Winner = state.score1 > state.score2;
    
    return { 
        winT1, loseT1, winT2, loseT2, 
        changeT1: isTeam1Winner ? winT1 : loseT1, 
        changeT2: isTeam1Winner ? loseT2 : winT2, 
        team1: t1, team2: t2, isTeam1Winner 
    };
};

export const updateLiveEloPreview = () => { 
    const preview = calculateEloPreview();
    const container = document.getElementById('liveEloPreview');
    
    if (!preview) { 
        container.classList.add('hidden'); 
        return; 
    }
    
    container.innerHTML = `
        <div class="text-center">
            <span class="text-xs text-blue-400 font-bold uppercase block mb-1">Vitória Azul</span>
            <span class="text-green-400 font-black text-lg">+${preview.winT1} ELO</span> 
            <span class="text-slate-500 mx-1">|</span> 
            <span class="text-red-400 font-bold text-sm">-${preview.loseT2} ELO</span>
        </div>
        <div class="w-px h-8 bg-slate-700 hidden sm:block"></div>
        <div class="text-center">
            <span class="text-xs text-red-400 font-bold uppercase block mb-1">Vitória Vermelha</span>
            <span class="text-green-400 font-black text-lg">+${preview.winT2} ELO</span> 
            <span class="text-slate-500 mx-1">|</span> 
            <span class="text-red-400 font-bold text-sm">-${preview.loseT1} ELO</span>
        </div>
    `;
    
    container.classList.remove('hidden');
    container.classList.add('flex');
};

export const checkWinCondition = () => {
    if((state.score1 >= 21 || state.score2 >= 21) && Math.abs(state.score1 - state.score2) >= 2 || (state.score1 >= 8 && state.score2 === 0) || (state.score2 >= 8 && state.score1 === 0)) {
        const sel1 = document.getElementById('team1Select');
        const sel2 = document.getElementById('team2Select');
        
        document.getElementById('victoryTeamName').innerText = state.score1 > state.score2 ? (sel1.options[sel1.selectedIndex]?.text || "T1") : (sel2.options[sel2.selectedIndex]?.text || "T2");
        
        const btnSave = document.getElementById('btnSaveResult');
        const warn = document.getElementById('victoryTeamWarning');
        
        if (!state.isAuthenticated && !state.eloEnabled) {
            btnSave.classList.add('hidden');
            warn.innerText = "";
            warn.classList.add('hidden');
        } else if(!sel1.value || !sel2.value || sel1.value === sel2.value) { 
            btnSave.classList.add('hidden'); 
            warn.innerText = "Selecione duas equipes diferentes!";
            warn.classList.remove('hidden');
        } else { 
            btnSave.classList.remove('hidden'); 
            warn.classList.add('hidden'); 
        }
        
        document.getElementById('victoryModal').classList.remove('hidden'); 
        document.getElementById('victoryModal').classList.add('flex');
    }
};

export const updateScore = (t, c) => { 
    if(t === 1) {
        state.score1 = Math.max(0, state.score1 + c); 
        document.getElementById('score1').innerText = state.score1;
    } else {
        state.score2 = Math.max(0, state.score2 + c); 
        document.getElementById('score2').innerText = state.score2;
    } 
    checkWinCondition(); 
};

export const resetScore = () => {
    openConfirmModal("Zerar", "Zerar placar?", () => { 
        state.score1 = state.score2 = 0; 
        document.getElementById('score1').innerText = 0; 
        document.getElementById('score2').innerText = 0; 
    });
};

export const saveAndCloseVictoryModal = async () => {
    const preview = calculateEloPreview(); 
    if(!preview) return;
    
    const btnSave = document.getElementById('btnSaveResult'); 
    btnSave.innerText = "SALVANDO..."; 
    btnSave.disabled = true;
    
    try {
        const updates = [];
        
        [{t: preview.team1, c: preview.changeT1, a: preview.isTeam1Winner ? 1 : 0}, {t: preview.team2, c: preview.changeT2, a: preview.isTeam1Winner ? 0 : 1}].forEach(({t,c,a}) => {
            t.players.forEach(p => {
                const dbP = state.players.find(x => x.id === p.id);
                if(dbP) {
                    updates.push(updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', p.id), { 
                        eloRating: Math.max(0, (dbP.eloRating || 150) + c), 
                        partidas: (dbP.partidas || 0) + 1, 
                        vitorias: (dbP.vitorias || 0) + a 
                    }));
                }
            });
        });
        
        updates.push(addDoc(matchHistoryRef, { 
            timestamp: Date.now(), 
            team1: {name: getTeamName(preview.team1), score: state.score1, players: preview.team1.players.map(p => p.name)}, 
            team2: {name: getTeamName(preview.team2), score: state.score2, players: preview.team2.players.map(p => p.name)}, 
            winner: preview.isTeam1Winner ? 1 : 2 
        }));
        
        await Promise.all(updates); 
        showToast("Ranking Atualizado!", "success");
        closeVictoryModalOnly();
    } catch(e) { 
        showToast("Erro!", "error"); 
    } finally { 
        btnSave.innerText = "SALVAR RANKING"; 
        btnSave.disabled = false; 
    }
};

export const confirmMovePlayer = async () => {
    const { sourceTeamId, playerId } = state.moveData;
    const targetTeamId = document.getElementById('moveDestination').value;
    
    if (!sourceTeamId || !playerId || !targetTeamId) return;

    const sourceTeam = state.drawnTeams.find(t => t.id === sourceTeamId);
    const targetTeam = state.drawnTeams.find(t => t.id === targetTeamId);
    
    const playerIndex = sourceTeam.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    const playerToMove = sourceTeam.players.splice(playerIndex, 1)[0];
    targetTeam.players.push(playerToMove);
    
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', sourceTeamId), { players: sourceTeam.players });
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'teams', targetTeamId), { players: targetTeam.players });
    
    import('./ui.js').then(module => module.closeMoveModal());
    showToast("Jogador transferido!");
};