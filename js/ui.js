import { state } from './state.js';
import { calculateEloMatch } from './services/rankingService.js';
import { settingsRef, updateDoc } from './firebase.js';

// ============================================================================
// HELPERS DE FORMATAÇÃO VISUAL
// ============================================================================

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

export const getDailyPlayerStats = () => {
    const today = new Date().toLocaleDateString('pt-BR');
    const todaysMatches = (state.matchHistory || []).filter(m => m.dateString === today);
    
    const stats = {};
    todaysMatches.forEach(m => {
        const t1Won = m.winner === 1; 
        const t2Won = m.winner === 2;
        
        if (m.team1?.players) m.team1.players.forEach(name => { 
            if (!stats[name]) stats[name] = { wins: 0, losses: 0 }; 
            t1Won ? stats[name].wins++ : stats[name].losses++; 
        });
        if (m.team2?.players) m.team2.players.forEach(name => { 
            if (!stats[name]) stats[name] = { wins: 0, losses: 0 }; 
            t2Won ? stats[name].wins++ : stats[name].losses++; 
        });
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

// ============================================================================
// CONTROLE DE NAVEGAÇÃO E MODAIS
// ============================================================================

/**
 * Abre o modal de transferência de jogador, definindo a origem
 * e populando as opções de destino.
 */
export const openMoveModal = (teamId, playerId) => {
    // 1. Bloqueia se houver jogo em andamento
    const t1 = document.getElementById('team1Select')?.value;
    const t2 = document.getElementById('team2Select')?.value;
    if (t1 && t2 && (state.score1 > 0 || state.score2 > 0)) {
        showToast("Transferência bloqueada! Um jogo está em andamento no placar.", "error");
        return;
    }

    // 2. Guarda os dados da origem no estado global
    state.moveData = { sourceTeamId: teamId, playerId: playerId };

    // 3. Procura o jogador para exibir o nome no modal
    const team = state.drawnTeams.find(t => t.id === teamId);
    const player = team?.players.find(p => p.id === playerId);
    
    if (!player) return;
    document.getElementById('movePlayerName').innerText = player.name;
    
    // 4. Gera as opções de destino (excluindo o time atual)
    let options = '';
    const sortedTeams = [...state.drawnTeams].sort((a,b) => 
        a.isWaitlist ? 1 : (b.isWaitlist ? -1 : parseInt(a.label) - parseInt(b.label))
    );
    
    sortedTeams.forEach(t => {
        if (t.id !== teamId) {
            options += `<option value="${t.id}">${t.isWaitlist ? "Lista de Espera" : getTeamName(t)}</option>`;
        }
    });
    
    // 5. Atualiza o HTML e exibe o modal
    document.getElementById('moveDestination').innerHTML = options;
    const modal = document.getElementById('movePlayerModal');
    modal.classList.remove('hidden'); 
    modal.classList.add('flex');

    if (typeof lucide !== 'undefined') lucide.createIcons();
};

export const showToast = (msg, type = 'success') => {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    
    let bgColor = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-blue-600');
    toast.className = `fixed bottom-5 right-5 ${bgColor} text-white px-4 py-2 rounded-xl shadow-2xl transition-transform duration-300 flex items-center gap-2 z-[60] text-sm`;
    toast.classList.remove('translate-y-24');
    
    setTimeout(() => toast.classList.add('translate-y-24'), 3500);
};

export const switchView = (view) => {
    // 1. Esconde TODAS as views
    ['public', 'sorteio', 'auth', 'admin', 'placar', 'groups'].forEach(v => { 
        const e = document.getElementById(`view-${v}`); 
        if(e) e.classList.add('hidden-view'); 
    });
    
    // 2. Remove o status de "ativo" de todos os botões do menu topo
    ['btn-public', 'btn-sorteio', 'btn-admin', 'btn-placar', 'btn-groups'].forEach(b => { 
        const e = document.getElementById(b); 
        if(e) e.classList.remove('active'); 
    });
    
    // 3. Controle da visibilidade do Menu de Navegação (Só aparece se estiver DENTRO de um grupo)
    const navButtons = document.getElementById('mainNavButtons');
    if (view === 'auth' || view === 'groups') {
        if(navButtons) navButtons.classList.add('hidden-view');
    } else {
        if(navButtons) navButtons.classList.remove('hidden-view');
    }

    // 4. Mostra a view correta e ativa o botão correspondente
    if (view === 'public') { 
        document.getElementById('view-public').classList.remove('hidden-view'); 
        document.getElementById('btn-public').classList.add('active'); 
    } else if (view === 'sorteio') { 
        document.getElementById('view-sorteio').classList.remove('hidden-view'); 
        document.getElementById('btn-sorteio').classList.add('active'); 
    } else if (view === 'placar') { 
        document.getElementById('view-placar').classList.remove('hidden-view'); 
        document.getElementById('btn-placar').classList.add('active'); 
    } else if (view === 'groups') {
        document.getElementById('view-groups').classList.remove('hidden-view'); 
        if(document.getElementById('btn-groups')) document.getElementById('btn-groups').classList.add('active');
    } else if (view === 'auth') {
        document.getElementById('view-auth').classList.remove('hidden-view');
    } else if (view === 'admin') { 
        // Proteção: Só entra no Admin se estiver logado E for Admin/Master do grupo atual
        if (state.isAuthenticated && (state.currentUserRole === 'admin' || state.isMaster)) {
            document.getElementById('view-admin').classList.remove('hidden-view');
            document.getElementById('btn-admin').classList.add('active'); 
        } else if (state.isAuthenticated) {
            showToast("Você não é administrador deste grupo.", "error");
            switchView('public'); // Redireciona para o ranking
        } else {
            document.getElementById('view-auth').classList.remove('hidden-view');
        }
    }
    
    // Atualiza os dados apenas se estiver numa tela de grupo
    if(view !== 'auth' && view !== 'groups') {
        renderAll();
    }
};

export const openConfirmModal = (title, message, callback) => {
    document.getElementById('confirmTitle').innerText = title; 
    document.getElementById('confirmMessage').innerText = message;
    state.confirmActionCallback = callback;
    document.getElementById('confirmModal').classList.remove('hidden'); 
    document.getElementById('confirmModal').classList.add('flex'); 
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

export const closeConfirmModal = () => { 
    document.getElementById('confirmModal').classList.add('hidden'); 
    document.getElementById('confirmModal').classList.remove('flex'); 
    state.confirmActionCallback = null; 
};

export const closeVictoryModalOnly = async () => { 
    const modal = document.getElementById('victoryModal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }

    state.score1 = 0; state.score2 = 0;
    state.currentTeam1 = ''; state.currentTeam2 = '';

    const s1 = document.getElementById('score1'); if(s1) s1.innerText = '0'; 
    const s2 = document.getElementById('score2'); if(s2) s2.innerText = '0'; 
    const t1 = document.getElementById('team1Select'); if(t1) t1.value = ''; 
    const t2 = document.getElementById('team2Select'); if(t2) t2.value = ''; 

    // Liberta o placar na nuvem para que outros possam usar
    try { 
        await updateDoc(settingsRef, { matchInProgress: false, matchOwner: null }); 
    } catch(e) {}
    
    if (typeof updateLiveEloPreview === 'function') updateLiveEloPreview();
};

export const closeMoveModal = () => { 
    const modal = document.getElementById('movePlayerModal');
    if(modal) {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
    state.moveData = { sourceTeamId: null, playerId: null }; 
};

export const closePlayerHistoryModal = () => {
    const modal = document.getElementById('playerHistoryModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

// ============================================================================
// ATUALIZAÇÕES ESPECÍFICAS DE TELA
// ============================================================================

/**
 * Atualiza o painel visual com a previsão de pontos da partida atual,
 * utilizando o serviço de matemática.
 */
export const updateLiveEloPreview = () => {
    const previewDiv = document.getElementById('liveEloPreview');
    const select1 = document.getElementById('team1Select');
    const select2 = document.getElementById('team2Select');
    
    if (!previewDiv || !select1 || !select2 || !select1.value || !select2.value || select1.value === select2.value) {
        if(previewDiv) {
            previewDiv.classList.add('hidden');
            previewDiv.classList.remove('flex');
        }
        return null;
    }

    const team1 = state.drawnTeams.find(t => t.label === select1.value);
    const team2 = state.drawnTeams.find(t => t.label === select2.value);
    if (!team1 || !team2) return null;

    const getTeamElo = (team) => {
        if (team.players.length === 0) return 150;
        const sum = team.players.reduce((acc, p) => {
            const dbPlayer = state.players.find(x => x.id === p.id);
            return acc + (dbPlayer?.eloRating ?? 150);
        }, 0);
        return sum / team.players.length;
    };

    const eloT1 = getTeamElo(team1);
    const eloT2 = getTeamElo(team2);
    
    // Chama o serviço puramente matemático
    const matchPreview = calculateEloMatch(eloT1, eloT2);

    previewDiv.innerHTML = `
        <div class="flex-1 text-center">
            <p class="text-[10px] sm:text-xs text-slate-400 font-bold uppercase mb-1">Se Vencer</p>
            <p class="text-green-400 font-black text-lg sm:text-xl">+${matchPreview.winT1} ELO</p>
            <p class="text-red-400 font-bold text-xs sm:text-sm">${matchPreview.loseT1} ELO se perder</p>
        </div>
        <div class="shrink-0 bg-slate-800 p-2 sm:p-3 rounded-full border border-slate-700">
            <i data-lucide="swords" class="w-4 h-4 sm:w-6 sm:h-6 text-slate-400"></i>
        </div>
        <div class="flex-1 text-center">
            <p class="text-[10px] sm:text-xs text-slate-400 font-bold uppercase mb-1">Se Vencer</p>
            <p class="text-green-400 font-black text-lg sm:text-xl">+${matchPreview.winT2} ELO</p>
            <p class="text-red-400 font-bold text-xs sm:text-sm">${matchPreview.loseT2} ELO se perder</p>
        </div>
    `;
    
    previewDiv.classList.remove('hidden');
    previewDiv.classList.add('flex');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Retorna os dados para que o matchController possa usá-los se o utilizador clicar em "Salvar"
    return {
        ...matchPreview,
        team1,
        team2,
        changeT1: state.score1 > state.score2 ? matchPreview.winT1 : matchPreview.loseT1,
        changeT2: state.score1 > state.score2 ? matchPreview.loseT2 : matchPreview.winT2,
        isTeam1Winner: state.score1 > state.score2
    };
};

// ============================================================================
// HELPERS DE INTERAÇÃO (Tabelas e Paginação)
// ============================================================================

export const updateSorteioCounters = () => {
    const countElement = document.getElementById('playerCountSorteio');
    if(countElement) countElement.innerText = `${state.selectedPlayerIds.size} / ${state.players.length} Selecionados`;
    
    const selectAllCheckbox = document.getElementById('selectAll');
    if(selectAllCheckbox) selectAllCheckbox.checked = state.players.length > 0 && state.selectedPlayerIds.size === state.players.length;
};

export const changeHistoryPage = (idx) => {
    state.historyCurrentPage = idx;
    renderMatchHistory();
};

export const openPlayerHistoryModal = (playerName) => {
    const modal = document.getElementById('playerHistoryModal');
    const list = document.getElementById('playerHistoryList');
    document.getElementById('playerHistoryTitle').innerText = `Histórico de ${playerName}`;

    const pMatches = state.matchHistory.filter(m =>
        (m.team1.players && m.team1.players.includes(playerName)) ||
        (m.team2.players && m.team2.players.includes(playerName))
    ).sort((a,b) => b.timestamp - a.timestamp);

    if(pMatches.length === 0) {
        list.innerHTML = '<p class="text-center text-slate-500 py-4 text-sm">Nenhuma partida registrada.</p>';
    } else {
        list.innerHTML = pMatches.map((m, idx) => {
            const inT1 = m.team1.players && m.team1.players.includes(playerName);
            const myTeam = inT1 ? 1 : 2;
            const isWin = m.winner === myTeam;
            const t1Color = m.winner === 1 ? 'text-blue-400' : 'text-slate-400';
            const t2Color = m.winner === 2 ? 'text-red-400' : 'text-slate-400';
            
            const eloGain = m.eloGain || 0;
            const eloLoss = Math.round(eloGain * 0.7); // Mantém a sua regra dos 70%
            const myEloChange = isWin ? `+${eloGain}` : `-${eloLoss}`;
            const eloColor = isWin ? 'text-green-400' : 'text-red-400';

            return `
                <div class="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden mb-2">
                    <div class="p-3 cursor-pointer hover:bg-slate-800 transition-colors" onclick="document.getElementById('p-match-det-${idx}').classList.toggle('hidden')">
                        <div class="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
                            <span class="text-slate-400 font-bold">${m.dateString}</span>
                            <span class="font-black ${eloColor} bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-[10px]">${isWin ? 'VITÓRIA' : 'DERROTA'} (${myEloChange} ELO)</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <div class="flex-1 text-right font-bold text-[11px] ${t1Color} truncate">${m.team1.name}</div>
                            <div class="px-3 font-black text-sm">${m.team1.score} x ${m.team2.score}</div>
                            <div class="flex-1 text-left font-bold text-[11px] ${t2Color} truncate">${m.team2.name}</div>
                        </div>
                    </div>
                    <div id="p-match-det-${idx}" class="hidden p-3 bg-slate-950/80 border-t border-slate-800/50 text-[10px] text-slate-300">
                        <div class="flex justify-between gap-4">
                            <div class="flex-1 text-right">
                                <p class="text-slate-500 font-bold uppercase mb-1">Time Azul</p>
                                <p>${(m.team1.players || []).join('<br>')}</p>
                                <p class="mt-2 font-bold ${m.winner === 1 ? 'text-green-400' : 'text-red-400'}">${m.winner === 1 ? '+'+eloGain : '-'+eloLoss} ELO</p>
                            </div>
                            <div class="flex-1 text-left">
                                <p class="text-slate-500 font-bold uppercase mb-1">Time Vermelho</p>
                                <p>${(m.team2.players || []).join('<br>')}</p>
                                <p class="mt-2 font-bold ${m.winner === 2 ? 'text-green-400' : 'text-red-400'}">${m.winner === 2 ? '+'+eloGain : '-'+eloLoss} ELO</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

// ============================================================================
// CONTROLE DO FORMULÁRIO DE ATLETAS (ADMIN)
// ============================================================================

export const setFormMode = (mode) => {
    const modeInput = document.getElementById('formMode');
    if (modeInput) modeInput.value = mode;

    const btnManual = document.getElementById('btnModeManual');
    const btnEmail = document.getElementById('btnModeEmail');
    const manualFields = document.getElementById('manualFields');
    const emailFields = document.getElementById('emailFields');

    if (mode === 'manual') {
        btnManual.className = "flex-1 py-2 text-xs font-bold rounded-md bg-slate-800 text-white transition-all shadow";
        btnEmail.className = "flex-1 py-2 text-xs font-bold rounded-md text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all";
        manualFields.classList.remove('hidden');
        emailFields.classList.add('hidden');
    } else {
        btnEmail.className = "flex-1 py-2 text-xs font-bold rounded-md bg-slate-800 text-white transition-all shadow";
        btnManual.className = "flex-1 py-2 text-xs font-bold rounded-md text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all";
        emailFields.classList.remove('hidden');
        manualFields.classList.add('hidden');
    }
};

export const editPlayer = (id) => {
    // 1. Busca o jogador no estado global
    const p = state.players.find(x => x.id === id);
    if (!p) return;

    // 2. Preenche TODOS os campos do formulário
    document.getElementById('editId').value = p.id;
    document.getElementById('playerName').value = p.name;
    document.getElementById('statCategoria').value = p.categoria || 1;
    document.getElementById('statJogos').value = p.partidas || 0;
    document.getElementById('statVit').value = p.vitorias || 0;
    document.getElementById('statBonus').value = p.eloRating ?? 150;
    document.getElementById('playerIcon').value = p.icon || 'user';
    
    // Puxa o e-mail para edição, se existir
    const emailInput = document.getElementById('playerEmail');
    if(emailInput) emailInput.value = p.email || '';

    // Define o modo de formulário com base na existência de e-mail
    if (p.email) {
        setFormMode('email');
    } else {
        setFormMode('manual');
    }

    // 3. Trata a foto de perfil
    if (p.photo) {
        document.getElementById('photoPreview').src = p.photo;
        document.getElementById('photoPreview').classList.remove('hidden');
        document.getElementById('photoPlaceholder').classList.add('hidden');
        document.getElementById('photoData').value = p.photo;
        document.getElementById('btnRemovePhoto').classList.remove('hidden');
    } else {
        if (window.removePhoto) window.removePhoto();
    }

    // 4. Muda o visual do formulário para "Modo Edição"
    document.getElementById('formTitle').innerHTML = '<i data-lucide="edit" class="w-5 h-5"></i> Editar Atleta';
    document.getElementById('btnSave').innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> ATUALIZAR';

    // 5. GARANTE QUE O FORMULÁRIO ABRA AUTOMATICAMENTE
    const formContent = document.getElementById('formContent');
    const formIcon = document.getElementById('formToggleIcon');
    if (formContent) formContent.classList.remove('hidden');
    if (formIcon) formIcon.classList.add('rotate-180');

    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // 6. Rola a tela suavemente para o formulário
    document.getElementById('view-admin').scrollIntoView({ behavior: 'smooth' });
};

export const resetForm = () => {
    // 1. Limpa os campos de texto
    document.getElementById('editId').value = '';
    document.getElementById('playerName').value = '';
    document.getElementById('statCategoria').value = '1';
    document.getElementById('statJogos').value = '0';
    document.getElementById('statVit').value = '0';
    document.getElementById('statBonus').value = '150';
    document.getElementById('playerIcon').value = 'user';
    
    const emailInput = document.getElementById('playerEmail');
    if(emailInput) emailInput.value = '';

    // Reseta o modo do formulário para manual
    setFormMode('manual');

    // 2. Limpa a Foto APENAS VISUALMENTE (Sem deletar do Storage)
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoPlaceholder').classList.remove('hidden');
    document.getElementById('photoData').value = ''; 
    document.getElementById('btnRemovePhoto').classList.add('hidden');
    const fileInput = document.getElementById('playerPhoto');
    if(fileInput) fileInput.value = '';

    // 3. Restaura o visual do botão
    document.getElementById('formTitle').innerHTML = '<i data-lucide="user-plus" class="w-5 h-5"></i> Novo Atleta';
    document.getElementById('btnSave').innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> SALVAR';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // 4. Fecha o formulário
    const formContent = document.getElementById('formContent');
    const formIcon = document.getElementById('formToggleIcon');
    if (formContent) formContent.classList.add('hidden');
    if (formIcon) formIcon.classList.remove('rotate-180');
};

// ============================================================================
// RENDERIZADORES DE TELA (HTML Injection)
// (Cole aqui o seu código HTML original de formatação das listas)
// ============================================================================

export const renderPublic = () => {
    const grid = document.getElementById('publicGrid');
    if (state.players.length === 0) { 
        grid.innerHTML = `<p class="opacity-50 text-center w-full">Nenhum atleta cadastrado.</p>`; 
        return; 
    }
    
    const { stats, craques, bagres } = getDailyPlayerStats();
    const maxElo = state.players.length > 0 ? Math.max(...state.players.map(p => p.eloRating ?? 150)) : 0;
    const globalEloRank = [...state.players].sort((a, b) => (b.eloRating ?? 150) - (a.eloRating ?? 150) || a.name.localeCompare(b.name));
    
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
            
            // Selos posicionados fora do card. Fogo/Gelo não aparecem se o jogador for Craque ou Bagre.
            const hasBadges = streak >= 3 || streak <= -3 || isCraque || isBagre;
            const badgesHTML = hasBadges ? `
                <div class="absolute -top-2 -left-2 sm:-left-4 flex flex-col gap-1.5 z-40 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)] items-start">
                    ${(streak >= 3) ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-orange-500/50 flex items-center gap-1" title="${streak} Vitórias Seguidas!"><i data-lucide="flame" class="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 fill-orange-500"></i><span class="text-orange-500 font-black text-xs sm:text-sm pr-1.5">${streak}</span></div>` : ''}
                    ${(streak <= -3) ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-blue-500/50 flex items-center gap-1" title="${Math.abs(streak)} Derrotas Seguidas"><i data-lucide="snowflake" class="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 fill-blue-500"></i><span class="text-blue-500 font-black text-xs sm:text-sm pr-1.5">${Math.abs(streak)}</span></div>` : ''}
                    ${isCraque ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-yellow-400/50 flex items-center gap-1" title="Craque do Dia!"><i data-lucide="crown" class="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 fill-yellow-400"></i><span class="text-yellow-400 font-black text-xs sm:text-sm pr-1.5">${pStats.wins}</span></div>` : ''}
                    ${isBagre ? `<div class="bg-slate-900/90 p-1 sm:p-1.5 rounded-full border border-emerald-400/50 flex items-center gap-1" title="Bagre do Dia!"><i data-lucide="fish" class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400"></i><span class="text-emerald-400 font-black text-xs sm:text-sm pr-1.5">${pStats.losses}</span></div>` : ''}
                </div>
            ` : '';
            
            const rankPosition = globalEloRank.findIndex(x => x.id === p.id) + 1;

            const innerCard = `
                <div onclick="openPlayerHistoryModal('${p.name}')" class="fifa-card cursor-pointer card-${lvlInfo.type} ${isDestaque ? '!w-full !h-full m-0' : 'w-full mx-auto !h-[330px]'} relative">
                    <div class="absolute top-3 right-4 text-sm sm:text-lg font-black italic text-white/50 drop-shadow-md">#${rankPosition}</div>
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
        const eloDiff = (b.eloRating ?? 150) - (a.eloRating ?? 150); 
        if (eloDiff !== 0) return eloDiff; 
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
                        <div class="flex flex-col items-center">
                            <span class="text-xl font-black ${textColor}">${p.eloRating ?? 150}</span>
                            <span class="text-[8px] font-bold text-slate-400 uppercase mt-[-4px]">ELO</span>
                        </div>
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
    
    const searchTerm = document.getElementById('searchSorteio')?.value.toLowerCase() || '';
    const sortMode = document.getElementById('sortSorteio')?.value || 'default';

    let filtered = state.players.filter(p => p.name.toLowerCase().includes(searchTerm));

    const sorted = filtered.sort((a, b) => { 
        if (sortMode === 'alpha') {
            return (a.name || '').localeCompare(b.name || '');
        } else {
            // 1º Critério: Categoria (Maior para menor)
            const catDiff = (parseInt(b.categoria) || 1) - (parseInt(a.categoria) || 1); 
            if(catDiff !== 0) return catDiff; 
            
            // 2º Critério: Elo (Maior para menor)
            const eloDiff = (b.eloRating ?? 150) - (a.eloRating ?? 150);
            if (eloDiff !== 0) return eloDiff;
            
            // 3º Critério: Ordem Alfabética
            return (a.name || '').localeCompare(b.name || ''); 
        }
    });
    
    tbody.innerHTML = sorted.map(p => {
        const lvlInfo = getLevelInfo(p.eloRating ?? 150);
        const catInfo = getCategoryInfo(p.categoria);
        const isSelected = state.selectedPlayerIds.has(p.id);
        
        return `
            <tr class="hover:bg-slate-700/30 transition-colors cursor-pointer" onclick="const c = document.getElementById('chk-${p.id}'); c.checked = !c.checked; togglePlayerSelection('${p.id}', c.checked); updateSorteioCounters();">
                <td class="px-2 py-3 text-center" onclick="event.stopPropagation()">
                    <input type="checkbox" id="chk-${p.id}" ${isSelected ? 'checked' : ''} onclick="togglePlayerSelection('${p.id}', this.checked); updateSorteioCounters();" class="w-4 h-4 accent-green-500 cursor-pointer">
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
                    <div class="flex flex-col items-center justify-center">
                        <span class="font-bold text-white text-sm">${p.eloRating ?? 150}</span>
                        <span class="px-2 py-0.5 mt-0.5 rounded-md text-[8px] font-bold ${lvlInfo.bg} ${lvlInfo.text} opacity-70">${lvlInfo.label}</span>
                    </div>
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
                    <div class="flex flex-col items-center justify-center">
                        <span class="font-bold text-white text-sm">${p.eloRating ?? 150}</span>
                        <span class="px-2 py-0.5 mt-0.5 rounded-md text-[8px] font-bold ${lvlInfo.bg} ${lvlInfo.text} opacity-70">${lvlInfo.label}</span>
                    </div>
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
                <button onclick="deleteTeam('${t.id}')" class="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500" title="Excluir Lista de Espera">
                    <i data-lucide="trash-2" class="w-3 h-3"></i>
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
                        ${((dbPlayer.streak || 0) >= 3) ? `<span class="flex items-center" title="${dbPlayer.streak} Vitórias Seguidas!"><i data-lucide="flame" class="w-3 h-3 text-orange-500 fill-orange-500 shrink-0"></i><span class="text-[9px] font-black text-orange-500 ml-0.5">${dbPlayer.streak}</span></span>` : ''}
                        ${((dbPlayer.streak || 0) <= -3) ? `<span class="flex items-center" title="${Math.abs(dbPlayer.streak)} Derrotas Seguidas"><i data-lucide="snowflake" class="w-3 h-3 text-blue-500 fill-blue-500 shrink-0"></i><span class="text-[9px] font-black text-blue-500 ml-0.5">${Math.abs(dbPlayer.streak)}</span></span>` : ''}
                        ${isCraque ? `<span class="flex items-center" title="Craque do Dia!"><i data-lucide="crown" class="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400 fill-yellow-400 shrink-0"></i><span class="text-[9px] font-black text-yellow-400 ml-0.5">${pStats.wins}</span></span>` : ''}
                       ${isBagre ? `<span class="flex items-center" title="Bagre do Dia"><i data-lucide="fish" class="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400 shrink-0"></i><span class="text-[9px] font-black text-emerald-400 ml-0.5">${pStats.losses}</span></span>` : ''}
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
    
    // Puxa o estado atualizado da nuvem, se existir, senão usa o local
    const val1 = state.currentTeam1 !== undefined ? state.currentTeam1 : select1.value;
    const val2 = state.currentTeam2 !== undefined ? state.currentTeam2 : select2.value;
    
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
            btnClear.classList.remove('hidden'); btnClear.classList.add('flex');
        } else {
            btnClear.classList.add('hidden'); btnClear.classList.remove('flex');
        }
    }
    if (!container) return;
    if (!state.matchHistory || state.matchHistory.length === 0) { 
        container.innerHTML = `<p class="text-slate-500 text-center text-sm py-4">Nenhuma partida registrada.</p>`; 
        return; 
    }
    
    const matches = [...state.matchHistory].sort((a,b) => b.timestamp - a.timestamp);
    const groups = [];
    let currentGroup = null;

    matches.forEach(m => {
        const dString = m.dateString || new Date(m.timestamp).toLocaleDateString('pt-BR');
        if (!currentGroup || currentGroup.date !== dString) {
            currentGroup = { date: dString, matches: [] };
            groups.push(currentGroup);
        }
        currentGroup.matches.push(m);
    });

    if (state.historyCurrentPage >= groups.length) state.historyCurrentPage = Math.max(0, groups.length - 1);
    const activeGroup = groups[state.historyCurrentPage];

    let paginationHTML = '<div class="flex gap-2 overflow-x-auto no-scrollbar mb-4 pb-2 border-b border-slate-700/50">';
    groups.forEach((g, idx) => {
        const isActive = idx === state.historyCurrentPage;
        paginationHTML += `<button onclick="changeHistoryPage(${idx})" class="px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}">${g.date}</button>`;
    });
    paginationHTML += '</div>';

    let matchesHTML = activeGroup.matches.map((m, mIdx) => {
        const t1Color = m.winner === 1 ? 'text-blue-400' : 'text-slate-400';
        const t2Color = m.winner === 2 ? 'text-red-400' : 'text-slate-400';
        const eloGain = m.eloGain || 0;
        const eloLoss = Math.round(eloGain * 0.7);

        return `
            <div class="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden mb-3">
                <div class="p-3 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors group" onclick="document.getElementById('match-details-${mIdx}').classList.toggle('hidden')">
                    <div class="flex-1 text-right font-bold text-sm ${t1Color}">${m.team1.name}</div>
                    <div class="px-3 font-black text-lg">${m.team1.score} x ${m.team2.score}</div>
                    <div class="flex-1 text-left font-bold text-sm ${t2Color}">${m.team2.name}</div>
                </div>
                <div id="match-details-${mIdx}" class="hidden p-3 bg-slate-950/80 border-t border-slate-800/50 text-xs text-slate-300">
                    <div class="flex justify-between gap-4">
                        <div class="flex-1 text-right border-r border-slate-800 pr-4">
                            <p class="text-[10px] text-blue-400 font-bold uppercase mb-2">Time Azul</p>
                            <p class="mb-3">${(m.team1.players || []).join('<br>')}</p>
                            <p class="font-black text-sm ${m.winner === 1 ? 'text-green-400' : 'text-red-400'}">
                                ${m.winner === 1 ? '+' + eloGain : '-' + eloLoss} ELO
                            </p>
                        </div>
                        <div class="flex-1 text-left pl-4">
                            <p class="text-[10px] text-red-400 font-bold uppercase mb-2">Time Vermelho</p>
                            <p class="mb-3">${(m.team2.players || []).join('<br>')}</p>
                            <p class="font-black text-sm ${m.winner === 2 ? 'text-green-400' : 'text-red-400'}">
                                ${m.winner === 2 ? '+' + eloGain : '-' + eloLoss} ELO
                            </p>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');

    container.innerHTML = paginationHTML + matchesHTML;
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

export const togglePlacarLock = (isLocked) => {
    const overlay = document.getElementById('placar-lock-overlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !isLocked);
        // Garante que o ícone do Lucide seja renderizado se o elemento for mostrado
        if (isLocked && typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Lista de controles que devem ser desativados visualmente
    const controlsToDisable = [
        'btnSaveResult', 
        'btnClearHistory',
        'teamSize', 
        'draftStrategy',
        'waitlistStrategy',
        'waitlistStrategyPlacar'
    ];

    controlsToDisable.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = isLocked;
            el.style.opacity = isLocked ? "0.5" : "1";
            el.style.cursor = isLocked ? "not-allowed" : "default";
        }
    });

    // Oculta botões de ação nas cartinhas (remover/mover) para evitar cliques acidentais
    const actionButtons = document.querySelectorAll('.remove-player-btn, .move-player-btn');
    actionButtons.forEach(btn => {
        btn.style.visibility = isLocked ? 'hidden' : 'visible';
    });
};

export const forceUnlockPlacar = async () => {
    openConfirmModal("Forçar Desbloqueio", "Isto interromperá a partida que está a ser marcada no outro aparelho. Tem a certeza?", async () => {
        try { 
            await updateDoc(settingsRef, { matchInProgress: false, matchOwner: null }); 
            showToast("Placar desbloqueado à força.", "info");
        } catch(e) {}
    });
};

// ============================================================================
// HELPERS DE UI PARA AUTENTICAÇÃO E GRUPOS
// ============================================================================

export const toggleAuthMode = (mode) => {
    const isRegister = mode === 'register';
    
    // Altera os títulos
    document.getElementById('authTitle').innerText = isRegister ? 'Criar Conta' : 'Bem-vindo';
    document.getElementById('authSubtitle').innerText = isRegister ? 'Preencha seus dados para começar.' : 'Faça login para acessar seus grupos.';
    
    // Mostra/Esconde o campo de Nome
    const nameContainer = document.getElementById('registerNameContainer');
    if(isRegister) {
        nameContainer.classList.remove('hidden');
    } else {
        nameContainer.classList.add('hidden');
    }

    // Atualiza os botões principais
    const btnMain = document.getElementById('btnAuthMain');
    btnMain.innerHTML = isRegister ? '<i data-lucide="user-plus" class="w-5 h-5"></i> CADASTRAR' : '<i data-lucide="log-in" class="w-5 h-5"></i> ENTRAR';
    
    // Atualiza o texto do rodapé (alternar entre login e registro)
    const btnToggle = document.getElementById('btnToggleAuth');
    if (isRegister) {
        btnToggle.innerHTML = 'Já tem conta? <span class="font-bold underline text-blue-400">Faça login</span>';
        btnToggle.setAttribute('onclick', "toggleAuthMode('login')");
    } else {
        btnToggle.innerHTML = 'Ainda não tem conta? <span class="font-bold underline text-blue-400">Cadastre-se</span>';
        btnToggle.setAttribute('onclick', "toggleAuthMode('register')");
    }

    // Se a função existir, recria os ícones Lucide recém-injetados
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Salva na memória da página (num atributo do botão) em qual modo estamos para o main.js saber o que fazer
    btnMain.setAttribute('data-mode', isRegister ? 'register' : 'login');
};

export const renderUserGroups = () => {
    const grid = document.getElementById('userGroupsGrid');
    const msg = document.getElementById('noGroupsMessage');
    
    if (!grid || !msg) return;

    if (!state.userGroups || state.userGroups.length === 0) {
        grid.innerHTML = '';
        msg.classList.remove('hidden');
        msg.classList.add('flex');
        return;
    }

    msg.classList.add('hidden');
    msg.classList.remove('flex');

    grid.innerHTML = state.userGroups.map(group => {
        const isAdmin = state.isMaster || (group.adminUids && group.adminUids.includes(state.user?.uid));
        
        let roleTag = '';
        let roleBg = '';
        let menuDots = '';

        if (isAdmin) {
            roleTag = '<i data-lucide="shield-check" class="w-3 h-3"></i> Admin';
            roleBg = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            
            // Adiciona os três pontinhos para admins
            menuDots = `
                <div class="relative z-20" onclick="event.stopPropagation();">
                    <button onclick="document.getElementById('menu-${group.id}').classList.toggle('hidden')" class="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-700 transition-colors">
                        <i data-lucide="more-vertical" class="w-5 h-5"></i>
                    </button>
                    <div id="menu-${group.id}" class="hidden absolute right-0 top-8 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                        <button onclick="renameGroup('${group.id}', '${group.name}'); document.getElementById('menu-${group.id}').classList.add('hidden')" class="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-2"><i data-lucide="edit-2" class="w-4 h-4"></i> Renomear</button>
                        <button onclick="deleteGroup('${group.id}'); document.getElementById('menu-${group.id}').classList.add('hidden')" class="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-slate-800 flex items-center gap-2 border-t border-slate-800"><i data-lucide="trash-2" class="w-4 h-4"></i> Excluir</button>
                    </div>
                </div>
            `;
        } else {
            roleTag = '<i data-lucide="user" class="w-3 h-3"></i> Jogador';
            roleBg = 'bg-slate-700/50 text-slate-300 border-slate-600/50';
        }

        const dateStr = group.createdAt ? new Date(group.createdAt).toLocaleDateString('pt-BR') : '--/--/----';

        return `
            <div onclick="selectGroup('${group.id}', '${group.name}')" class="bg-slate-900/50 hover:bg-slate-800 border border-slate-700 rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10 group-card flex flex-col justify-between h-full min-h-[140px] relative">
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="text-xl font-bold text-white group-card-hover:text-blue-400 transition-colors pr-6">${group.name}</h3>
                        ${menuDots}
                    </div>
                    <span class="inline-block px-2 py-1 rounded-md text-[10px] font-bold border flex items-center gap-1 w-max ${roleBg}">${roleTag}</span>
                    <p class="text-xs text-slate-500 mt-3 flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> Criado em ${dateStr}</p>
                </div>
                <div class="mt-4 flex justify-end">
                    <span class="text-sm font-bold text-blue-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">ENTRAR <i data-lucide="arrow-right" class="w-4 h-4"></i></span>
                </div>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
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

//updateSorteioCounters 
// changeHistoryPage 
// openPlayerHistoryModal 