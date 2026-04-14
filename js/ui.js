import { state } from './state.js';

// --- Funções Auxiliares de UI --- //

export const getLevelInfo = (pontos) => {
    if (pontos < 100) return { type: 'nivel1', label: 'BRONZE', bg: 'bg-orange-900/40', text: 'text-orange-400', dot: 'bg-orange-500' };
    if (pontos < 200) return { type: 'nivel2', label: 'PRATA', bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-400' };
    if (pontos < 300) return { type: 'nivel3', label: 'OURO', bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' };
    if (pontos < 400) return { type: 'nivel4', label: 'PLATINA', bg: 'bg-cyan-500/20', text: 'text-cyan-400', dot: 'bg-cyan-500' };
    if (pontos < 500) return { type: 'nivel5', label: 'DIAMANTE', bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400', dot: 'bg-fuchsia-500' };
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
    const headPlayer = team.players.reduce((max, p) => (p.categoria || 1) > (max.categoria || 1) ? p : max, team.players[0]);
    const firstName = headPlayer.name.split(' ')[0].toUpperCase();
    return `TIME DE ${firstName}`;
};

// --- Modais e Notificações --- //

export const showToast = (msg, type = 'success') => {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    toast.className = `fixed bottom-5 right-5 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-2xl transition-transform duration-300 flex items-center gap-2 sm:gap-3 z-[60] text-sm sm:text-base max-w-[90vw]`;
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

export const closeVictoryModalOnly = () => {
    document.getElementById('victoryModal').classList.add('hidden');
    document.getElementById('victoryModal').classList.remove('flex');
    state.score1 = 0;
    state.score2 = 0;
    document.getElementById('score1').innerText = state.score1;
    document.getElementById('score2').innerText = state.score2;
};

export const switchView = (view) => {
    ['public', 'login', 'admin', 'placar'].forEach(v => document.getElementById(`view-${v}`).classList.add('hidden-view'));
    ['btn-public', 'btn-admin', 'btn-placar'].forEach(b => document.getElementById(b).classList.remove('active'));
    
    if (view === 'public') { 
        document.getElementById('view-public').classList.remove('hidden-view'); 
        document.getElementById('btn-public').classList.add('active'); 
    } else if (view === 'placar') { 
        document.getElementById('view-placar').classList.remove('hidden-view'); 
        document.getElementById('btn-placar').classList.add('active'); 
    } else { 
        document.getElementById('btn-admin').classList.add('active'); 
        state.isAuthenticated ? document.getElementById('view-admin').classList.remove('hidden-view') : document.getElementById('view-login').classList.remove('hidden-view'); 
    }
    renderAll();
};

// --- Funções de Renderização --- //

export const renderPublic = () => {
    const grid = document.getElementById('publicGrid');
    if (state.players.length === 0) { grid.innerHTML = `<p class="opacity-50 text-center w-full">Nenhum atleta cadastrado.</p>`; return; }
    
    const maxPoints = state.players.length > 0 ? Math.max(...state.players.map(p => p.pontos || 0)) : 0;
    const sortFn = (a, b) => (b.pontos || 0) - (a.pontos || 0);
    
    const mestre = state.players.filter(p => (p.pontos || 0) >= 500).sort(sortFn);
    const diamante = state.players.filter(p => (p.pontos || 0) >= 400 && (p.pontos || 0) < 500).sort(sortFn);
    const platina = state.players.filter(p => (p.pontos || 0) >= 300 && (p.pontos || 0) < 400).sort(sortFn);
    const ouro = state.players.filter(p => (p.pontos || 0) >= 200 && (p.pontos || 0) < 300).sort(sortFn);
    const prata = state.players.filter(p => (p.pontos || 0) >= 100 && (p.pontos || 0) < 200).sort(sortFn);
    const bronze = state.players.filter(p => (p.pontos || 0) < 100).sort(sortFn);

    const renderGroup = (title, icon, colorClass, list) => {
        if (list.length === 0) return '';
        const cardsHTML = list.map(p => {
            const lvlInfo = getLevelInfo(p.pontos || 0), ptsValue = p.pontos || 0, desPerc = p.des || 0;
            const isDestaque = ptsValue === maxPoints && maxPoints >= 50;
            
            const innerCard = `<div class="fifa-card card-${lvlInfo.type} ${isDestaque ? '!w-full !h-full m-0' : 'w-full mx-auto'}"><div class="flex flex-col items-center justify-center"><span class="overall drop-shadow-md">${ptsValue}</span><span class="font-bold text-[9px] sm:text-[11px] opacity-90 tracking-[0.15em] mt-0.5 sm:mt-1">PONTOS</span></div><div class="w-9 h-9 sm:w-12 sm:h-12 my-1.5 sm:my-2 flex items-center justify-center bg-black/10 rounded-full border-2 ${isDestaque ? 'border-yellow-400/60 shadow-[0_0_15px_rgba(250,204,21,0.3)] text-yellow-200' : 'border-black/10'} shrink-0"><i data-lucide="${p.icon || 'user'}" class="w-4 h-4 sm:w-6 sm:h-6 opacity-80"></i></div><div class="player-name ${isDestaque ? 'text-yellow-100 drop-shadow-md' : ''}">${p.name}</div><div class="w-[90%] mt-1.5 sm:mt-2.5 flex flex-col items-center"><div class="flex justify-between w-full mb-1 px-1"><span class="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-90">Desempenho</span><span class="text-[9px] sm:text-[10px] font-bold opacity-90">${desPerc}%</span></div><div class="w-full bg-black/30 rounded-full h-1.5 sm:h-2 border border-white/20 overflow-hidden relative shadow-inner"><div class="bg-white h-full rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-1000" style="width: ${desPerc}%"></div></div></div></div>`;
            
            return `<div class="relative flex justify-center w-full sm:w-[210px] group ${isDestaque ? 'winner-frame-container' : ''}">${(p.streak || 0) >= 3 ? `<div class="absolute -top-3 -left-2 sm:-top-4 sm:-left-3 z-50 bg-orange-500 text-white text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-orange-500/50 border border-orange-300 animate-bounce" title="${p.streak} Vitórias Seguidas!"><i data-lucide="flame" class="w-3 h-3 sm:w-4 sm:h-4 fill-white"></i> ${p.streak}</div>` : ''}${(p.streak || 0) <= -3 ? `<div class="absolute -top-3 -left-2 sm:-top-4 sm:-left-3 z-50 bg-blue-500 text-white text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-blue-500/50 border border-blue-300" title="${Math.abs(p.streak)} Derrotas Seguidas"><i data-lucide="snowflake" class="w-3 h-3 sm:w-4 sm:h-4 fill-white"></i> ${Math.abs(p.streak)}</div>` : ''}${isDestaque ? `<div class="winner-frame-wrapper">${innerCard}</div>` : innerCard}</div>`;
        }).join('');
        return `<div class="w-full flex flex-col items-center mb-10"><h3 class="text-lg sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center gap-2 ${colorClass} border-b border-slate-700/50 pb-2 px-8 uppercase tracking-wider"><i data-lucide="${icon}" class="w-5 h-5 sm:w-6 h-6"></i> ${title}</h3><div class="grid grid-cols-[repeat(2,minmax(130px,180px))] sm:flex sm:flex-wrap gap-3 sm:gap-6 justify-center w-full max-w-[390px] sm:max-w-none mx-auto px-1 sm:px-0">${cardsHTML}</div></div>`;
    };

    grid.innerHTML = renderGroup('Mestre', 'flame', 'text-red-500', mestre) + renderGroup('Diamante', 'gem', 'text-fuchsia-500', diamante) + renderGroup('Platina', 'shield', 'text-cyan-500', platina) + renderGroup('Ouro', 'award', 'text-yellow-500', ouro) + renderGroup('Prata', 'medal', 'text-slate-400', prata) + renderGroup('Bronze', 'medal', 'text-orange-500', bronze);
    lucide.createIcons();
};

export const renderRanking = () => {
    const list = document.getElementById('rankingList');
    const sortedPlayers = [...state.players].sort((a,b) => (b.vitorias || 0) - (a.vitorias || 0));
    if (sortedPlayers.length === 0) { list.innerHTML = `<p class="opacity-50 text-sm text-center py-4">Aguardando resultados dos jogos...</p>`; return; }
    
    const top3 = sortedPlayers.slice(0, 3), rest = sortedPlayers.slice(3);
    let podiumHTML = '<div class="flex justify-center items-end gap-1 sm:gap-6 mb-8 mt-6">';
    [1, 0, 2].forEach(pos => {
        if (top3[pos]) {
            const p = top3[pos], heightClass = pos === 0 ? 'h-32 sm:h-40' : (pos === 1 ? 'h-24 sm:h-32' : 'h-20 sm:h-28');
            const isGold = pos === 0, isSilver = pos === 1;
            const bgClass = isGold ? 'bg-gradient-to-t from-yellow-600/20 to-yellow-500/40 border-yellow-500' : (isSilver ? 'bg-gradient-to-t from-slate-500/20 to-slate-400/40 border-slate-400' : 'bg-gradient-to-t from-amber-700/20 to-amber-600/40 border-amber-600');
            const borderColor = isGold ? 'border-yellow-500' : (isSilver ? 'border-slate-400' : 'border-amber-600');
            const textColor = isGold ? 'text-yellow-500' : (isSilver ? 'text-slate-300' : 'text-amber-600'), medal = isGold ? '🥇' : (isSilver ? '🥈' : '🥉');
            podiumHTML += `<div class="flex flex-col items-center w-20 sm:w-32 relative group"><div class="relative mb-2 sm:mb-3 flex flex-col items-center transition-transform group-hover:-translate-y-2"><div class="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-slate-900 flex items-center justify-center border-2 ${borderColor} shadow-[0_0_15px_currentColor] ${textColor} z-10"><i data-lucide="${p.icon || 'user'}" class="w-5 h-5 sm:w-8 sm:h-8"></i></div><span class="font-bold text-[10px] sm:text-sm text-center mt-1 sm:mt-2 text-slate-200 truncate w-full px-1 flex items-center justify-center gap-1">${medal} <span class="truncate">${p.name}</span></span></div><div class="w-full ${heightClass} ${bgClass} border-t-4 rounded-t-lg flex flex-col items-center pt-2 sm:pt-4 shadow-[inset_0_10px_20px_rgba(0,0,0,0.3)] relative overflow-hidden"><span class="text-2xl sm:text-4xl font-black ${textColor}">${p.vitorias || 0}</span><span class="text-[8px] sm:text-[10px] uppercase font-bold text-slate-400 mt-1">VITÓRIAS</span></div></div>`;
        }
    });
    podiumHTML += '</div>';
    
    let restHTML = '';
    if (rest.length > 0) {
        const listItems = rest.map((p, index) => {
            const rank = index + 4, lvlInfo = getLevelInfo(p.pontos || 0);
            return `<div class="p-3 sm:p-4 rounded-xl flex items-center justify-between border border-slate-700 bg-slate-800/50 hover:bg-slate-700/80 transition-colors"><div class="flex items-center gap-3 sm:gap-4"><span class="text-lg sm:text-xl w-8 text-center text-slate-500 font-bold">#${rank}</span><div class="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border border-slate-600 shrink-0"><i data-lucide="${p.icon || 'user'}" class="w-5 h-5 text-slate-400"></i></div><div><p class="text-base sm:text-lg font-bold text-slate-300 truncate max-w-[120px] sm:max-w-none">${p.name}</p><p class="text-[10px] uppercase tracking-widest text-slate-500">${p.pontos || 0} PTS • ${lvlInfo.label}</p></div></div><div class="text-right"><span class="text-xl sm:text-2xl font-bold text-slate-300">${p.vitorias || 0}</span><p class="text-[9px] uppercase font-bold text-slate-500">VITÓRIAS</p></div></div>`;
        }).join('');
        restHTML = `<div class="mt-8 text-center border-t border-slate-700/50 pt-6"><button onclick="toggleRanking()" class="text-xs sm:text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-all border border-slate-600 rounded-full px-4 sm:px-6 py-2">${state.showAllRanking ? 'OCULTAR LISTA' : 'VER TODOS (' + rest.length + ')'}</button></div><div class="flex flex-col gap-3 mt-4 sm:mt-6 ${state.showAllRanking ? 'animate-in fade-in slide-in-from-top-4' : 'hidden'}">${listItems}</div>`;
    }
    list.innerHTML = podiumHTML + restHTML; 
    lucide.createIcons();
};

export const renderAdmin = () => {
    const tbody = document.getElementById('adminTableBody');
    document.getElementById('playerCount').innerText = state.players.length;
    
    const selectAllCheckbox = document.getElementById('selectAll');
    if(selectAllCheckbox) selectAllCheckbox.checked = state.players.length > 0 && state.players.every(p => state.selectedPlayerIds.has(p.id));
    
    const maxPoints = state.players.length > 0 ? Math.max(...state.players.map(p => p.pontos || 0)) : 0;
    const sortedPlayersForAdmin = [...state.players].sort((a, b) => { 
        const catDiff = (b.categoria || 1) - (a.categoria || 1); 
        if (catDiff !== 0) return catDiff; 
        return (b.pontos || 0) - (a.pontos || 0); 
    });

    tbody.innerHTML = sortedPlayersForAdmin.map(p => {
        const lvlInfo = getLevelInfo(p.pontos || 0), catInfo = getCategoryInfo(p.categoria);
        const isDestaque = (p.pontos || 0) === maxPoints && maxPoints >= 50;

        return `<tr class="hover:bg-slate-700/30 transition-colors"><td class="px-2 sm:px-4 py-3 sm:py-4 text-center"><input type="checkbox" ${state.selectedPlayerIds.has(p.id) ? 'checked' : ''} onclick="togglePlayerSelection('${p.id}', this.checked)" class="w-3 h-3 sm:w-4 sm:h-4 accent-green-500 cursor-pointer"></td><td class="px-3 sm:px-6 py-3 sm:py-4 font-bold text-slate-200 flex items-center gap-1 sm:gap-2 whitespace-nowrap"><i data-lucide="${p.icon || 'user'}" class="w-3 h-3 sm:w-4 sm:h-4 opacity-50 shrink-0"></i>${p.name}${isDestaque ? `<i data-lucide="star" class="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400 fill-yellow-400 shrink-0" title="MVP (Líder 50+ Pts)"></i>` : ''}</td><td class="px-3 sm:px-6 py-3 sm:py-4 text-center whitespace-nowrap"><span class="px-2 py-1 rounded-md text-[9px] sm:text-[10px] font-bold ${catInfo.bg} ${catInfo.text} border ${catInfo.border} opacity-90">${catInfo.label}</span></td><td class="px-3 sm:px-6 py-3 sm:py-4 text-center font-bold text-yellow-500 whitespace-nowrap">${p.vitorias || 0} <span class="text-slate-500 text-xs font-normal">/ ${p.partidas || 0}</span>${(p.streak || 0) >= 3 ? `<span class="ml-1 text-orange-500 text-[10px] font-bold" title="${p.streak} Vitórias Seguidas"><i data-lucide="flame" class="w-3 h-3 inline fill-orange-500"></i>${p.streak}</span>` : ''}${(p.streak || 0) <= -3 ? `<span class="ml-1 text-blue-500 text-[10px] font-bold" title="${Math.abs(p.streak)} Derrotas Seguidas"><i data-lucide="snowflake" class="w-3 h-3 inline fill-blue-500"></i>${Math.abs(p.streak)}</span>` : ''}</td><td class="px-3 sm:px-6 py-3 sm:py-4 text-center whitespace-nowrap"><span class="px-2 py-1 rounded-md text-[9px] sm:text-[10px] font-bold ${lvlInfo.bg} ${lvlInfo.text} border border-current opacity-70">${lvlInfo.label}</span></td><td class="px-3 sm:px-6 py-3 py-4 text-right flex justify-end gap-1 sm:gap-2 whitespace-nowrap"><button onclick="editPlayer('${p.id}')" class="p-1.5 sm:p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg"><i data-lucide="edit-2" class="w-3 h-3 sm:w-4 sm:h-4"></i></button><button onclick="deletePlayer('${p.id}')" class="p-1.5 sm:p-2 hover:bg-red-500/20 text-red-400 rounded-lg"><i data-lucide="trash-2" class="w-3 h-3 sm:w-4 sm:h-4"></i></button></td></tr>`;
    }).join(''); 
    lucide.createIcons();
};

export const renderTeams = () => {
    const adminGrid = document.getElementById('adminTeamsGrid');
    const publicGrid = document.getElementById('publicTeamsGrid');
    const sections = [document.getElementById('adminTeamsSection'), document.getElementById('publicTeamsSection')];
    
    if (state.drawnTeams.length === 0) { 
        sections.forEach(s => s.classList.add('hidden')); 
        return; 
    }
    
    sections.forEach(s => s.classList.remove('hidden'));
    const maxPoints = state.players.length > 0 ? Math.max(...state.players.map(p => p.pontos || 0)) : 0;

    const content = state.drawnTeams.sort((a,b) => a.isWaitlist ? 1 : (b.isWaitlist ? -1 : parseInt(a.label) - parseInt(b.label))).map(t => {
        const teamName = t.isWaitlist ? '<i data-lucide="clock" class="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 mb-1"></i> Lista de Espera' : getTeamName(t);
        const playersSorted = [...t.players].sort((a, b) => { 
            const catDiff = (b.categoria || 1) - (a.categoria || 1); 
            if (catDiff !== 0) return catDiff; 
            return (b.pontos || 0) - (a.pontos || 0); 
        });
        
        return `<div class="team-container p-4 sm:p-5 rounded-xl border relative shadow-lg transition-colors ${t.isWaitlist ? 'bg-slate-800/40 border-slate-600' : 'border-slate-700 bg-slate-800/80'}">${state.isAuthenticated && !t.isWaitlist ? `<div class="absolute top-3 right-3 flex gap-1.5 sm:gap-2"><button onclick="redrawTeamWithWaitlist('${t.id}')" class="p-1.5 sm:p-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/30 transition-all" title="Sortear com Lista de Espera"><i data-lucide="refresh-cw" class="w-4 h-4 sm:w-4 sm:h-4"></i></button><button onclick="deleteTeam('${t.id}')" class="p-1.5 sm:p-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/30 transition-all" title="Remover Equipe"><i data-lucide="trash-2" class="w-4 h-4 sm:w-4 sm:h-4"></i></button></div>` : ''}${state.isAuthenticated && t.isWaitlist ? `<div class="absolute top-3 right-3 flex gap-2"><button onclick="deleteTeam('${t.id}')" class="p-1.5 sm:p-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/30 transition-all" title="Remover Equipe"><i data-lucide="trash-2" class="w-4 h-4 sm:w-4 sm:h-4"></i></button></div>` : ''}<h3 class="font-bold ${t.isWaitlist ? 'text-slate-400' : 'text-green-500'} text-base sm:text-lg mb-3 uppercase w-3/4">${teamName}</h3><div class="space-y-2 mt-2">${playersSorted.map(p => {
            const catInfo = getCategoryInfo(p.categoria), ptsValue = p.pontos || 0;
            const isDestaque = ptsValue === maxPoints && maxPoints >= 50;

            return `<div class="flex justify-between items-center text-xs sm:text-sm border-b border-slate-700/50 pb-1.5 last:border-0 last:pb-0"><span class="flex items-center gap-1 sm:gap-2"><span class="w-2 h-2 rounded-full ${catInfo.dot}"></span><i data-lucide="${p.icon || 'user'}" class="w-3 h-3 ${catInfo.text} opacity-80 shrink-0"></i><span class="font-bold ${catInfo.text} truncate max-w-[120px] sm:max-w-[150px]">${p.name}</span>${(p.streak || 0) >= 3 ? `<i data-lucide="flame" class="w-3 h-3 text-orange-500 fill-orange-500 shrink-0" title="${p.streak} Vitórias Seguidas!"></i>` : ''}${(p.streak || 0) <= -3 ? `<i data-lucide="snowflake" class="w-3 h-3 text-blue-500 fill-blue-500 shrink-0" title="${Math.abs(p.streak)} Derrotas Seguidas"></i>` : ''}${isDestaque ? `<i data-lucide="star" class="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" title="MVP (Líder)"></i>` : ''}</span><span class="opacity-60 text-[10px] sm:text-xs whitespace-nowrap shrink-0">${ptsValue} PTS</span></div>`;
        }).join('')}</div></div>`}).join('');
        
    adminGrid.innerHTML = publicGrid.innerHTML = content; 
    lucide.createIcons();
};

export const renderPlacarTeams = () => {
    const select1 = document.getElementById('team1Select'), select2 = document.getElementById('team2Select');
    if (!select1 || !select2) return;
    
    const val1 = select1.value, val2 = select2.value;
    let optionsHTML1 = '<option value="" class="bg-slate-800 text-sm text-slate-400">SELECIONE</option>';
    let optionsHTML2 = optionsHTML1;
    
    const validTeams = state.drawnTeams.filter(t => !t.isWaitlist).sort((a,b) => parseInt(a.label) - parseInt(b.label));
    
    validTeams.forEach(t => { 
        const teamName = getTeamName(t); 
        const opt = `<option value="${t.label}" class="bg-slate-800 text-sm text-white">${teamName}</option>`; 
        optionsHTML1 += opt; 
        optionsHTML2 += opt; 
    });
    
    select1.innerHTML = optionsHTML1; 
    select2.innerHTML = optionsHTML2;
    
    if (validTeams.find(t => t.label === val1)) select1.value = val1;
    if (validTeams.find(t => t.label === val2)) select2.value = val2;
};

export const renderAll = () => {
    renderPublic();
    renderAdmin();
    renderTeams();
    renderRanking();
    renderPlacarTeams();
};

// --- Bindings Globais para o HTML --- //
window.showToast = showToast;
window.switchView = switchView;
window.openConfirmModal = openConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.closeVictoryModalOnly = closeVictoryModalOnly;
window.toggleRanking = () => {
    state.showAllRanking = !state.showAllRanking;
    renderRanking();
};

// --- Inicialização de Event Listeners Físicos do HTML --- //
document.addEventListener('DOMContentLoaded', () => {
    // Liga a ação do botão confirmar dentro do Modal genérico
    const btnConfirm = document.getElementById('btnConfirmAction');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            // Executa a função que está guardada no estado
            if (state.confirmActionCallback) {
                state.confirmActionCallback();
            }
            closeConfirmModal();
        });
    }
});