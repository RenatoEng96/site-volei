import { state } from './state.js';
import { calculateEloMatch } from './services/rankingService.js';

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

export const showToast = (msg, type = 'success') => {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    
    let bgColor = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-blue-600');
    toast.className = `fixed bottom-5 right-5 ${bgColor} text-white px-4 py-2 rounded-xl shadow-2xl transition-transform duration-300 flex items-center gap-2 z-[60] text-sm`;
    toast.classList.remove('translate-y-24');
    
    setTimeout(() => toast.classList.add('translate-y-24'), 3500);
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

export const closeVictoryModalOnly = () => { 
    document.getElementById('victoryModal').classList.add('hidden'); 
    document.getElementById('victoryModal').classList.remove('flex'); 
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
// CONTROLE DO FORMULÁRIO DE ATLETAS (ADMIN)
// ============================================================================

export const editPlayer = (id) => {
    // 1. Busca o jogador no estado global
    const p = state.players.find(x => x.id === id);
    if (!p) return;

    // 2. Preenche os campos do formulário
    document.getElementById('editId').value = p.id;
    document.getElementById('playerName').value = p.name;
    document.getElementById('statCategoria').value = p.categoria || 1;
    document.getElementById('statJogos').value = p.partidas || 0;
    document.getElementById('statVit').value = p.vitorias || 0;
    document.getElementById('statBonus').value = p.eloRating ?? 150;
    document.getElementById('playerIcon').value = p.icon || 'user';

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

    // 5. Garante que o formulário esteja aberto e visível
    const formContent = document.getElementById('formContent');
    if (formContent && formContent.classList.contains('hidden')) {
        window.toggleUI('formContent', 'formToggleIcon');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Rola a tela suavemente para o formulário (útil no celular)
    document.getElementById('view-admin').scrollIntoView({ behavior: 'smooth' });
};

export const resetForm = () => {
    // 1. Limpa todos os campos
    document.getElementById('editId').value = '';
    document.getElementById('playerName').value = '';
    document.getElementById('statCategoria').value = '1';
    document.getElementById('statJogos').value = '0';
    document.getElementById('statVit').value = '0';
    document.getElementById('statBonus').value = '150';
    document.getElementById('playerIcon').value = 'user';
    
    if (window.removePhoto) window.removePhoto();

    // 2. Restaura o visual para "Modo Criação"
    document.getElementById('formTitle').innerHTML = '<i data-lucide="user-plus" class="w-5 h-5"></i> Novo Atleta';
    document.getElementById('btnSave').innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> SALVAR';
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

// ============================================================================
// RENDERIZADORES DE TELA (HTML Injection)
// (Cole aqui o seu código HTML original de formatação das listas)
// ============================================================================

export const renderPublic = () => { /* O seu código de cards de jogadores continua idêntico aqui */ };
export const renderRanking = () => { /* O seu código do pódio continua idêntico aqui */ };
export const renderSorteioTable = () => { /* Tabela de checkmarks continua idêntica */ };
export const renderAdminTable = () => { /* Tabela de edição continua idêntica */ };
export const renderTeams = () => { /* A lista de times sorteados e espera continua idêntica */ };
export const renderPlacarTeams = () => { /* Os selects do placar continuam idênticos */ };
export const renderMatchHistory = () => { /* O histórico paginado continua idêntico */ };

export const renderAll = () => { 
    renderPublic(); 
    renderSorteioTable(); 
    renderAdminTable(); 
    renderTeams(); 
    renderRanking(); 
    renderPlacarTeams(); 
    renderMatchHistory(); 
};