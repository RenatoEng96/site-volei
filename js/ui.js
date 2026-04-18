import { state } from './state.js';

export const getDailyPlayerStats = () => {
    const today = new Date().toLocaleDateString('pt-BR');
    const todaysMatches = (state.matchHistory || []).filter(m => 
        m.dateString === today || new Date(m.timestamp).toLocaleDateString('pt-BR') === today
    );
    
    const stats = {};
    
    todaysMatches.forEach(m => {
        const t1Won = m.winner === 1; 
        const t2Won = m.winner === 2;
        
        if (m.team1 && m.team1.players) {
            m.team1.players.forEach(name => { 
                if (!stats[name]) stats[name] = { wins: 0, losses: 0 }; 
                if (t1Won) stats[name].wins++; else stats[name].losses++; 
            });
        }
        
        if (m.team2 && m.team2.players) {
            m.team2.players.forEach(name => { 
                if (!stats[name]) stats[name] = { wins: 0, losses: 0 }; 
                if (t2Won) stats[name].wins++; else stats[name].losses++; 
            });
        }
    });
    
    let maxWins = 0, maxLosses = 0;
    Object.values(stats).forEach(s => { 
        if (s.wins > maxWins) maxWins = s.wins; 
        if (s.losses > maxLosses) maxLosses = s.losses; 
    });
    
    const craques = new Set(), bagres = new Set();
    if (maxWins >= 3) Object.keys(stats).forEach(name => { if (stats[name].wins === maxWins) craques.add(name); });
    if (maxLosses >= 3) Object.keys(stats).forEach(name => { if (stats[name].losses === maxLosses) bagres.add(name); });
    
    return { stats, craques, bagres };
};

export const getLevelInfo = (elo) => {
    const e = elo ?? 150;
    if (e < 250) return { type: 'nivel1', label: 'BRONZE', bg: 'bg-orange-900/40', text: 'text-orange-400', dot: 'bg-orange-500' };
    if (e < 350) return { type: 'nivel2', label: 'PRATA', bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-400' };
    if (e < 450) return { type: 'nivel3', label: 'OURO', bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' };
    if (e < 550) return { type: 'nivel4', label: 'PLATINA', bg: 'bg-cyan-500/20', text: 'text-cyan-400', dot: 'bg-cyan-500' };
    if (e < 700) return { type: 'nivel5', label: 'DIAMANTE', bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400', dot: 'bg-fuchsia-500' };
    return { type: 'nivel6', label: 'MESTRE', bg: 'bg-red-600/20', text: 'text-red-500', dot: 'bg-red-600' };
};

export const getCategoryInfo = (cat) => {
    const c = parseInt(cat) || 1;
    if (c === 5) return { label: 'CABEÇA DE CHAVE', bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', dot: 'bg-indigo-500' };
    if (c === 4) return { label: 'AVANÇADO', bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30', dot: 'bg-teal-500' };
    if (c === 3) return { label: 'MÉDIO', bg: 'bg-lime-500/20', text: 'text-lime-400', border: 'border-lime-500/30', dot: 'bg-lime-500' };
    if (c === 2) return { label: 'BÁSICO', bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', dot: 'bg-pink-500' };
    return { label: 'INICIANTE', bg: 'bg-stone-500/20', text: 'text-stone-400', border: 'border-stone-500/30', dot: 'bg-stone-500' };
};

export const getTeamName = (team) => {
    if (!team.players || team.players.length === 0) return `EQUIPE ${team.label}`;
    const headPlayer = team.players.reduce((max, p) => (parseInt(p.categoria) || 1) > (parseInt(max.categoria) || 1) ? p : max, team.players[0]);
    return `TIME DE ${headPlayer.name.split(' ')[0].toUpperCase()}`;
};

export const showToast = (msg, type = 'success') => {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    
    let bgColor = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-blue-600');
    toast.className = `fixed bottom-5 right-5 ${bgColor} text-white px-4 py-2 rounded-xl shadow-2xl transition-transform duration-300 flex items-center gap-2 z-[60] text-sm`;
    toast.classList.remove('translate-y-24');
    
    setTimeout(() => toast.classList.add('translate-y-24'), 3500);
};

export const openConfirmModal = (title, message, callback) => {
    document.getElementById('confirmTitle').innerText = title; 
    document.getElementById('confirmMessage').innerText = message;
    state.confirmActionCallback = callback;
    document.getElementById('confirmModal').classList.remove('hidden'); 
    document.getElementById('confirmModal').classList.add('flex'); 
    lucide.createIcons();
};

export const closeConfirmModal = () => { 
    document.getElementById('confirmModal').classList.add('hidden'); 
    document.getElementById('confirmModal').classList.remove('flex'); 
    state.confirmActionCallback = null; 
};

export const openMoveModal = (teamId, playerId) => {
    state.moveData = { sourceTeamId: teamId, playerId: playerId };
    const player = state.drawnTeams.find(t => t.id === teamId).players.find(p => p.id === playerId);
    document.getElementById('movePlayerName').innerText = player.name;
    
    let options = '';
    const sortedTeams = [...state.drawnTeams].sort((a,b) => a.isWaitlist ? 1 : (b.isWaitlist ? -1 : parseInt(a.label) - parseInt(b.label)));
    
    sortedTeams.forEach(t => {
        if (t.id !== teamId) {
            options += `<option value="${t.id}">${t.isWaitlist ? "Lista de Espera" : getTeamName(t)}</option>`;
        }
    });
    
    document.getElementById('moveDestination').innerHTML = options;
    document.getElementById('movePlayerModal').classList.remove('hidden'); 
    document.getElementById('movePlayerModal').classList.add('flex');
};

export const closeMoveModal = () => { 
    document.getElementById('movePlayerModal').classList.add('hidden'); 
    document.getElementById('movePlayerModal').classList.remove('flex'); 
    state.moveData = { sourceTeamId: null, playerId: null }; 
};

export const closeVictoryModalOnly = () => { 
    document.getElementById('victoryModal').classList.add('hidden'); 
    document.getElementById('victoryModal').classList.remove('flex'); 
    state.score1 = 0; 
    state.score2 = 0; 
    document.getElementById('score1').innerText = 0; 
    document.getElementById('score2').innerText = 0; 
    document.getElementById('team1Select').value = ''; 
    document.getElementById('team2Select').value = ''; 
    if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
};

export const switchView = (view) => {
    ['public', 'sorteio', 'login', 'admin', 'placar'].forEach(v => { 
        const e = document.getElementById(`view-${v}`); 
        if(e) e.classList.add('hidden-view'); 
    });
    
    ['btn-public', 'btn-sorteio', 'btn-admin', 'btn-placar'].forEach(b => { 
        const e = document.getElementById(b); 
        if(e) e.classList.remove('active'); 
    });
    
    if (view === 'public') { 
        document.getElementById('view-public').classList.remove('hidden-view'); 
        document.getElementById('btn-public').classList.add('active'); 
    } else if (view === 'sorteio') { 
        document.getElementById('view-sorteio').classList.remove('hidden-view'); 
        document.getElementById('btn-sorteio').classList.add('active'); 
    } else if (view === 'placar') { 
        document.getElementById('view-placar').classList.remove('hidden-view'); 
        document.getElementById('btn-placar').classList.add('active'); 
    } else { 
        document.getElementById('btn-admin').classList.add('active'); 
        if (state.isAuthenticated) {
            document.getElementById('view-admin').classList.remove('hidden-view');
        } else {
            document.getElementById('view-login').classList.remove('hidden-view');
        }
    }
    
    renderAll();
};

export const renderPublic = () => {
    const grid = document.getElementById('publicGrid');
    if (state.players.length === 0) { 
        grid.innerHTML = `<p class="opacity-50 text-center w-full">Nenhum atleta cadastrado.</p>`; 
        return; 
    }
    
    const { stats, craques, bagres } = getDailyPlayerStats();
    const maxElo = state.players.length > 0 ? Math.max(...state.players.map(p => p.eloRating ?? 150)) : 0;
    
    const sortFn = (a, b) => { 
        const eloDiff = (b.eloRating ?? 150) - (a.eloRating ?? 150); 
        if (eloDiff !== 0) return eloDiff; 
        return (a.name || '').localeCompare(b.name || ''); 
    };
    
    const renderGroup = (title, icon, colorClass, list) => {
        if (list.length === 0) return '';
        
        const cardsHTML = list.map(p => {
            const lvlInfo = getLevelInfo(p.eloRating ?? 150);
            const ptsValue = p.eloRating ?? 150;
            const isDestaque = ptsValue === maxElo && maxElo > 150;
            const vitorias = p.vitorias || 0;
            const derrotas = (p.partidas || 0) - vitorias;
            
            const isCraque = craques.has(p.name);
            const isBagre = bagres.has(p.name);
            const streak = p.streak || 0;
            const pStats = stats[p.name] || { wins: 0, losses: 0 };
            
            // Selos posicionados fora do card, na lateral superior esquerda, empilhados com número
            const hasBadges = streak >= 3 || streak <= -3 || isCraque || isBagre;
            const badgesHTML = hasBadges ? `
                <div class="absolute -top-2 -left-2 sm:-left-4 flex flex-col gap-1.5 z-40 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)] items-start">
                    ${streak >= 3 ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-orange-500/50 flex items-center gap-1" title="${streak} Vitórias Seguidas!"><i data-lucide="flame" class="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 fill-orange-500"></i><span class="text-orange-500 font-black text-xs sm:text-sm pr-1.5">${streak}</span></div>` : ''}
                    ${streak <= -3 ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-blue-500/50 flex items-center gap-1" title="${Math.abs(streak)} Derrotas Seguidas"><i data-lucide="snowflake" class="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 fill-blue-500"></i><span class="text-blue-500 font-black text-xs sm:text-sm pr-1.5">${Math.abs(streak)}</span></div>` : ''}
                    ${isCraque ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-yellow-400/50 flex items-center gap-1" title="Craque do Dia!"><i data-lucide="crown" class="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 fill-yellow-400"></i><span class="text-yellow-400 font-black text-xs sm:text-sm pr-1.5">${pStats.wins}</span></div>` : ''}
                    ${isBagre ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-emerald-400/50 flex items-center gap-1" title="Bagre do Dia!"><i data-lucide="fish" class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400"></i><span class="text-emerald-400 font-black text-xs sm:text-sm pr-1.5">${pStats.losses}</span></div>` : ''}
                </div>
            ` : '';
            
            const innerCard = `
                <div class="fifa-card card-${lvlInfo.type} ${isDestaque ? '!w-full !h-full m-0' : 'w-full mx-auto !h-[330px]'}">
                    <div class="flex flex-col items-center justify-center">
                        <span class="overall !text-4xl">${ptsValue}</span>
                        <span class="font-bold text-[8px] opacity-90 tracking-[0.15em]">ELO</span>
                    </div>
                    <div class="w-24 h-24 mt-3 mb-1 flex items-center justify-center bg-black/10 rounded-full border-2 ${isDestaque ? 'border-yellow-400/60 text-yellow-200' : 'border-black/10'} shrink-0 overflow-hidden">
                        ${p.photo ? `<img src="${p.photo}" class="w-full h-full object-cover">` : `<i data-lucide="${p.icon || 'user'}" class="w-12 h-12 opacity-80"></i>`}
                    </div>
                    <div class="player-name ${isDestaque ? 'text-yellow-100' : ''}">${p.name}</div>
                    <div class="w-full mt-2 flex justify-evenly items-center px-4">
                        <div class="flex flex-col items-center">
                            <span class="text-base font-black text-white">${vitorias}</span>
                            <span class="text-[8px] font-bold uppercase opacity-80">Vit</span>
                        </div>
                        <div class="w-px h-6 bg-white/30"></div>
                        <div class="flex flex-col items-center">
                            <span class="text-base font-black text-white">${derrotas}</span>
                            <span class="text-[8px] font-bold uppercase opacity-80">Der</span>
                        </div>
                    </div>
                </div>`;
                
            return `
                <div class="relative flex justify-center w-full sm:w-[210px] mt-4 group ${isDestaque ? 'winner-frame-container' : ''}">
                    ${badgesHTML}
                    ${isDestaque ? `<div class="winner-frame-wrapper !h-[340px]">${innerCard}</div>` : innerCard}
                </div>`;
        }).join('');
        
        return `
            <div class="w-full flex flex-col items-center mb-10">
                <h3 class="text-lg sm:text-2xl font-bold mb-4 flex items-center gap-2 ${colorClass} border-b border-slate-700/50 pb-2 px-8 uppercase tracking-wider">
                    <i data-lucide="${icon}" class="w-5 h-5"></i> ${title}
                </h3>
                <div class="grid grid-cols-[repeat(2,minmax(130px,180px))] sm:flex sm:flex-wrap gap-3 sm:gap-6 justify-center w-full mx-auto px-1 sm:px-0 pt-4">
                    ${cardsHTML}
                </div>
            </div>`;
    };

    grid.innerHTML = 
        renderGroup('Mestre', 'flame', 'text-red-500', state.players.filter(p => (p.eloRating ?? 150) >= 700).sort(sortFn)) + 
        renderGroup('Diamante', 'gem', 'text-fuchsia-500', state.players.filter(p => (p.eloRating ?? 150) >= 550 && (p.eloRating ?? 150) < 700).sort(sortFn)) + 
        renderGroup('Platina', 'shield', 'text-cyan-500', state.players.filter(p => (p.eloRating ?? 150) >= 450 && (p.eloRating ?? 150) < 550).sort(sortFn)) + 
        renderGroup('Ouro', 'award', 'text-yellow-500', state.players.filter(p => (p.eloRating ?? 150) >= 350 && (p.eloRating ?? 150) < 450).sort(sortFn)) + 
        renderGroup('Prata', 'medal', 'text-slate-400', state.players.filter(p => (p.eloRating ?? 150) >= 250 && (p.eloRating ?? 150) < 350).sort(sortFn)) + 
        renderGroup('Bronze', 'medal', 'text-orange-500', state.players.filter(p => (p.eloRating ?? 150) < 250).sort(sortFn));
        
    lucide.createIcons();
};

export const renderRanking = () => {
    const list = document.getElementById('rankingList');
    
    const sortedPlayers = [...state.players].sort((a,b) => { 
        const vitDiff = (b.vitorias || 0) - (a.vitorias || 0); 
        if (vitDiff !== 0) return vitDiff; 
        return (a.name || '').localeCompare(b.name || ''); 
    });
    
    if (sortedPlayers.length === 0) { 
        list.innerHTML = `<p class="opacity-50 text-sm text-center py-4">Aguardando resultados...</p>`; 
        return; 
    }
    
    const top3 = sortedPlayers.slice(0, 3);
    let podiumHTML = '<div class="flex justify-center items-end gap-1 sm:gap-6 mb-8 mt-6">';
    
    [1, 0, 2].forEach(pos => {
        if (top3[pos]) {
            const p = top3[pos];
            const heightClass = pos === 0 ? 'h-32' : (pos === 1 ? 'h-24' : 'h-20');
            const isGold = pos === 0;
            const isSilver = pos === 1;
            const bgClass = isGold ? 'bg-gradient-to-t from-yellow-600/20 to-yellow-500/40 border-yellow-500' : (isSilver ? 'bg-gradient-to-t from-slate-500/20 to-slate-400/40 border-slate-400' : 'bg-gradient-to-t from-amber-700/20 to-amber-600/40 border-amber-600');
            const textColor = isGold ? 'text-yellow-500' : (isSilver ? 'text-slate-300' : 'text-amber-600');
            const medal = isGold ? '🥇' : (isSilver ? '🥈' : '🥉');
            
            podiumHTML += `
                <div class="flex flex-col items-center w-20 relative group">
                    <div class="relative mb-2 flex flex-col items-center">
                        <div class="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border-2 shadow-[0_0_15px_currentColor] ${textColor} z-10 overflow-hidden">
                            ${p.photo ? `<img src="${p.photo}" class="w-full h-full object-cover">` : `<i data-lucide="${p.icon || 'user'}" class="w-5 h-5"></i>`}
                        </div>
                        <span class="font-bold text-[10px] text-center mt-1 text-slate-200 truncate w-full px-1 flex justify-center gap-1">
                            ${medal} <span class="truncate">${p.name}</span>
                        </span>
                    </div>
                    <div class="w-full ${heightClass} ${bgClass} border-t-4 rounded-t-lg flex flex-col items-center pt-2 shadow-[inset_0_10px_20px_rgba(0,0,0,0.3)] relative overflow-hidden">
                        <span class="text-2xl font-black ${textColor}">${p.vitorias || 0}</span>
                    </div>
                </div>`;
        }
    });
    
    podiumHTML += '</div>';
    list.innerHTML = podiumHTML; 
    lucide.createIcons();
};

export const renderSorteioTable = () => {
    const tbody = document.getElementById('sorteioTableBody');
    if(!tbody) return;
    
    const countElement = document.getElementById('playerCountSorteio');
    if(countElement) {
        countElement.innerText = `${state.selectedPlayerIds.size} / ${state.players.length} Selecionados`;
    }
    
    const selectAllCheckbox = document.getElementById('selectAll');
    if(selectAllCheckbox) {
        selectAllCheckbox.checked = state.players.length > 0 && state.players.every(p => state.selectedPlayerIds.has(p.id));
    }
    
    const sorted = [...state.players].sort((a, b) => { 
        const c = (parseInt(b.categoria)||1) - (parseInt(a.categoria)||1); 
        if(c !== 0) return c; 
        return a.name.localeCompare(b.name); 
    });
    
    tbody.innerHTML = sorted.map(p => {
        const lvlInfo = getLevelInfo(p.eloRating ?? 150);
        const catInfo = getCategoryInfo(p.categoria);
        const isSelected = state.selectedPlayerIds.has(p.id);
        
        return `
            <tr class="hover:bg-slate-700/30 transition-colors cursor-pointer" onclick="togglePlayerSelection('${p.id}', !state.selectedPlayerIds.has('${p.id}')); renderSorteioTable();">
                <td class="px-2 py-3 text-center" onclick="event.stopPropagation()">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="togglePlayerSelection('${p.id}', this.checked); renderSorteioTable();" class="w-4 h-4 accent-green-500 cursor-pointer">
                </td>
                <td class="px-3 py-3 font-bold text-slate-200 flex items-center gap-2 whitespace-nowrap">
                    <div class="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                        ${p.photo ? `<img src="${p.photo}" class="w-full h-full object-cover">` : `<i data-lucide="${p.icon || 'user'}" class="w-3 h-3 text-slate-400"></i>`}
                    </div>
                    ${p.name}
                </td>
                <td class="px-3 py-3 text-center whitespace-nowrap">
                    <span class="px-2 py-1 rounded-md text-[9px] font-bold ${catInfo.bg} ${catInfo.text} opacity-90">${catInfo.label}</span>
                </td>
                <td class="px-3 py-3 text-center whitespace-nowrap">
                    <span class="px-2 py-1 rounded-md text-[9px] font-bold ${lvlInfo.bg} ${lvlInfo.text} opacity-70">${lvlInfo.label}</span>
                </td>
            </tr>`;
    }).join('');
    
    lucide.createIcons();
};

export const renderAdminTable = () => {
    const tbody = document.getElementById('adminTableBody');
    if(!tbody) return;
    
    const sorted = [...state.players].sort((a, b) => { 
        const c = (parseInt(b.categoria)||1) - (parseInt(a.categoria)||1); 
        if(c !== 0) return c; 
        return a.name.localeCompare(b.name); 
    });
    
    tbody.innerHTML = sorted.map(p => {
        const lvlInfo = getLevelInfo(p.eloRating ?? 150);
        const catInfo = getCategoryInfo(p.categoria);
        
        return `
            <tr class="hover:bg-slate-700/30 transition-colors">
                <td class="px-3 py-3 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border-2 ${catInfo.border}">
                            ${p.photo ? `<img src="${p.photo}" class="w-full h-full object-cover">` : `<i data-lucide="${p.icon || 'user'}" class="w-4 h-4 ${catInfo.text}"></i>`}
                        </div>
                        <div class="flex flex-col">
                            <span class="font-bold text-slate-200">${p.name}</span>
                            <span class="text-[9px] font-black ${catInfo.text} tracking-wider uppercase mt-0.5">${catInfo.label}</span>
                        </div>
                    </div>
                </td>
                <td class="px-3 py-3 text-center font-bold text-yellow-500 whitespace-nowrap">
                    ${p.vitorias || 0} <span class="text-slate-500 text-xs">/ ${p.partidas || 0}</span>
                </td>
                <td class="px-3 py-3 text-center whitespace-nowrap">
                    <span class="px-2 py-1 rounded-md text-[9px] font-bold ${lvlInfo.bg} ${lvlInfo.text} opacity-70">${lvlInfo.label}</span>
                </td>
                <td class="px-3 py-3 text-right whitespace-nowrap">
                    <div class="flex justify-end gap-1">
                        <button onclick="editPlayer('${p.id}')" class="p-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg">
                            <i data-lucide="edit-2" class="w-3 h-3"></i>
                        </button>
                        <button onclick="deletePlayer('${p.id}')" class="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
    
    lucide.createIcons();
};

export const renderTeams = () => {
    const adminGrid = document.getElementById('adminTeamsGrid');
    const placarGrid = document.getElementById('placarTeamsGrid'); 
    const sections = [document.getElementById('adminTeamsSection'), document.getElementById('placarTeamsSection')]; 
    
    if (state.drawnTeams.length === 0) { 
        sections.forEach(s => { if(s) s.classList.add('hidden'); }); 
        return; 
    }
    
    sections.forEach(s => { if(s) s.classList.remove('hidden'); });
    
    const sortedTeams = state.drawnTeams.sort((a,b) => a.isWaitlist ? 1 : (b.isWaitlist ? -1 : parseInt(a.label) - parseInt(b.label)));
    
    const { stats, craques, bagres } = getDailyPlayerStats();
    const maxElo = state.players.length > 0 ? Math.max(...state.players.map(p => p.eloRating ?? 150)) : 0;
    
    const content = sortedTeams.map(t => {
        const teamName = t.isWaitlist ? '<i data-lucide="clock" class="inline w-4 h-4 mr-1"></i> Lista de Espera' : getTeamName(t);
        const pSorted = [...t.players].sort((a,b) => { 
            const c = (parseInt(b.categoria)||1) - (parseInt(a.categoria)||1); 
            if(c !== 0) return c; 
            return a.name.localeCompare(b.name); 
        });
        
        const controlsHTML = !t.isWaitlist ? `
            <div class="absolute top-3 right-3 flex gap-1">
                <button onclick="redrawTeamWithWaitlist('${t.id}')" class="p-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400" title="Substituir Pela Espera">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                </button>
                <button onclick="deleteTeam('${t.id}')" class="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500" title="Excluir Equipe">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
            </div>` : `
            <div class="absolute top-3 right-3 flex gap-1">
                <button onclick="promoteWaitlistToTeam('${t.id}')" class="p-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400" title="Formar Novo Time com a Espera">
                    <i data-lucide="arrow-up-circle" class="w-3 h-3"></i>
                </button>
            </div>`;

        const playersHTML = pSorted.map(p => {
            const dbPlayer = state.players.find(x => x.id === p.id) || p;
            const catInfo = getCategoryInfo(dbPlayer.categoria);
            const ptsValue = dbPlayer.eloRating ?? 150;
            
            const pStats = stats[dbPlayer.name] || { wins: 0, losses: 0 };
            const isCraque = craques.has(dbPlayer.name);
            const isBagre = bagres.has(dbPlayer.name);
            const isDestaque = ptsValue === maxElo && maxElo > 150;
            const waitlistBadge = (t.isWaitlist && p.waitlistRounds > 0) ? `<span class="bg-blue-500/20 text-blue-400 text-[8px] font-black px-1.5 py-0.5 rounded ml-1" title="Rodadas na Espera">${p.waitlistRounds}R</span>` : '';

            return `
                <div class="flex justify-between items-center text-xs sm:text-sm border-b border-slate-700/50 pb-1.5 last:border-0 last:pb-0 group">
                    <span class="flex items-center gap-1 sm:gap-2">
                        <span class="w-2 h-2 rounded-full ${catInfo.dot} shrink-0"></span>
                        <div class="w-5 h-5 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                            ${dbPlayer.photo ? `<img src="${dbPlayer.photo}" class="w-full h-full object-cover">` : `<i data-lucide="${dbPlayer.icon || 'user'}" class="w-3 h-3 ${catInfo.text} opacity-80"></i>`}
                        </div>
                        <span class="font-bold ${catInfo.text} truncate max-w-[110px] sm:max-w-[130px] ml-1">${dbPlayer.name}</span>
                        <span class="text-[9px] font-bold text-slate-500 shrink-0 mx-0.5" title="Vitórias/Derrotas Diárias">(${pStats.wins}V ${pStats.losses}D)</span>
                        ${waitlistBadge}
                        ${(dbPlayer.streak || 0) >= 3 ? `<span class="flex items-center" title="${dbPlayer.streak} Vitórias Seguidas!"><i data-lucide="flame" class="w-3 h-3 text-orange-500 fill-orange-500 shrink-0"></i><span class="text-[9px] font-black text-orange-500 ml-0.5">${dbPlayer.streak}</span></span>` : ''}
                        ${(dbPlayer.streak || 0) <= -3 ? `<span class="flex items-center" title="${Math.abs(dbPlayer.streak)} Derrotas Seguidas"><i data-lucide="snowflake" class="w-3 h-3 text-blue-500 fill-blue-500 shrink-0"></i><span class="text-[9px] font-black text-blue-500 ml-0.5">${Math.abs(dbPlayer.streak)}</span></span>` : ''}
                        ${isCraque ? `<span class="flex items-center" title="Craque do Dia!"><i data-lucide="crown" class="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400 fill-yellow-400 shrink-0"></i><span class="text-[9px] font-black text-yellow-400 ml-0.5">${pStats.wins}</span></span>` : ''}
                        ${isBagre ? `<span class="flex items-center" title="Bagre do Dia"><i data-lucide="fish" class="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400 shrink-0"></i><span class="text-[9px] font-black text-emerald-400 ml-0.5">${pStats.losses}</span></span>` : ''}
                        ${isDestaque ? `<i data-lucide="star" class="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" title="MVP (Líder)"></i>` : ''}
                    </span>
                    <div class="flex items-center gap-1 sm:gap-2">
                        <span class="opacity-60 text-[10px] sm:text-xs whitespace-nowrap shrink-0">${ptsValue} ELO</span>
                        <button onclick="openMoveModal('${t.id}', '${p.id}')" class="p-1 text-slate-400 hover:text-blue-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity focus:opacity-100" title="Transferir Jogador">
                            <i data-lucide="arrow-right-left" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="team-container w-full p-4 rounded-xl border relative shadow-lg ${t.isWaitlist ? 'bg-slate-800/40 border-slate-600' : 'border-slate-700 bg-slate-800/80'}">
                ${controlsHTML}
                <h3 class="font-bold ${t.isWaitlist ? 'text-slate-400' : 'text-green-500'} text-base mb-3 uppercase w-3/4">${teamName}</h3>
                <div class="space-y-2 mt-2">
                    ${playersHTML}
                </div>
            </div>`;
    }).join('');
    
    if (adminGrid) adminGrid.innerHTML = content;
    if (placarGrid) placarGrid.innerHTML = content; 
    
    lucide.createIcons();
};

export const renderPlacarTeams = () => {
    const select1 = document.getElementById('team1Select');
    const select2 = document.getElementById('team2Select');
    
    if (!select1 || !select2) return;
    
    const val1 = select1.value;
    const val2 = select2.value;
    
    let optHTML = '<option value="" class="bg-slate-800 text-sm text-slate-400">SELECIONE</option>';
    
    state.drawnTeams
        .filter(t => !t.isWaitlist)
        .sort((a,b) => parseInt(a.label) - parseInt(b.label))
        .forEach(t => { 
            optHTML += `<option value="${t.label}" class="bg-slate-800 text-sm text-white">${getTeamName(t)}</option>`; 
        });
        
    select1.innerHTML = optHTML; 
    select2.innerHTML = optHTML;
    
    select1.value = val1; 
    select2.value = val2;
};

export const renderMatchHistory = () => {
    const container = document.getElementById('historyList');
    const btnClear = document.getElementById('btnClearHistory');
    
    if (btnClear) {
        if (state.isAuthenticated && state.matchHistory && state.matchHistory.length > 0) {
            btnClear.classList.remove('hidden');
            btnClear.classList.add('flex');
        } else {
            btnClear.classList.add('hidden');
            btnClear.classList.remove('flex');
        }
    }

    if (!container) return;
    
    if (!state.matchHistory || state.matchHistory.length === 0) { 
        container.innerHTML = `<p class="text-slate-500 text-center text-sm py-4">Nenhuma partida registrada.</p>`; 
        return; 
    }
    
    container.innerHTML = state.matchHistory
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(m => {
            const t1Color = m.winner === 1 ? 'text-blue-400' : 'text-slate-400';
            const t2Color = m.winner === 2 ? 'text-red-400' : 'text-slate-400';
            
            return `
                <div class="bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 flex justify-between items-center">
                    <div class="flex-1 text-right font-bold text-sm ${t1Color}">${m.team1.name}</div>
                    <div class="px-3 font-black text-lg">${m.team1.score} x ${m.team2.score}</div>
                    <div class="flex-1 text-left font-bold text-sm ${t2Color}">${m.team2.name}</div>
                </div>`;
        }).join('');
};

export const renderAll = () => { 
    renderPublic(); 
    renderSorteioTable(); 
    renderAdminTable(); 
    renderTeams(); 
    renderRanking(); 
    renderPlacarTeams(); 
    renderMatchHistory(); 
};