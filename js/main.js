import { state } from './state.js';
import { initAuthObserver, loginAdmin, logoutAdmin } from './authService.js';
import {
    switchView, showToast, openConfirmModal, closeConfirmModal,
    closeVictoryModalOnly, renderSorteioTable, renderAll, updateLiveEloPreview,
    closeMoveModal, closePlayerHistoryModal, editPlayer, resetForm 
} from './ui.js';
import {
    drawTeams, createWaitlist, clearTeams, confirmMovePlayer, deleteTeam,
    redrawTeamWithWaitlist, promoteWaitlistToTeam 
} from './controllers/draftController.js';
import {
    updateScore, resetScore, saveAndCloseVictoryModal, checkWinCondition
} from './controllers/matchController.js';
import {
    toggleEloSystem, togglePlayerSelection, toggleAllPlayers,
    selectOnlyPlayersInTeams, savePlayer, deletePlayer, clearMatchHistory
} from './controllers/adminController.js';
import { 
    playersRef, teamsRef, matchHistoryRef, settingsRef, onSnapshot 
} from './firebase.js';

// ============================================================================
// MANIPULAÇÃO DE IMAGENS (Formulário)
// ============================================================================

export const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('photoPreview').src = e.target.result;
            document.getElementById('photoPreview').classList.remove('hidden');
            document.getElementById('photoPlaceholder').classList.add('hidden');
            document.getElementById('photoData').value = e.target.result;
            document.getElementById('btnRemovePhoto').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
};

export const removePhoto = () => {
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoPlaceholder').classList.remove('hidden');
    document.getElementById('photoData').value = '';
    document.getElementById('playerPhoto').value = '';
    document.getElementById('btnRemovePhoto').classList.add('hidden');
};

export const adjustBonus = (val) => {
    const el = document.getElementById('statBonus');
    el.value = Math.max(0, (parseInt(el.value) || 0) + val);
};

// ============================================================================
// INICIALIZAÇÃO DOS DADOS (Listeners do Firebase)
// ============================================================================

const initDatabaseListeners = () => {
    onSnapshot(playersRef, (s) => {
        state.players = s.docs.map(d => ({id: d.id, ...d.data()}));
        if(state.isFirstLoad) {
            state.players.forEach(p => state.selectedPlayerIds.add(p.id));
            state.isFirstLoad = false;
        }
        renderAll();
    });

    onSnapshot(teamsRef, (s) => {
        state.drawnTeams = s.docs.map(d => ({id: d.id, ...d.data()}));
        renderAll();
    });

    onSnapshot(matchHistoryRef, (s) => {
        state.matchHistory = s.docs.map(d => ({id: d.id, ...d.data()}));
        renderAll();
    });

    onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.eloEnabled = data.eloEnabled;
            
            const toggle = document.getElementById('toggleElo');
            if (toggle) toggle.checked = state.eloEnabled;

            let needsPreviewUpdate = false;

            // Sincroniza Seleção de Times no Placar
            if (data.team1 !== undefined) {
                state.currentTeam1 = data.team1;
                const t1 = document.getElementById('team1Select');
                if (t1 && t1.value !== data.team1) { 
                    t1.value = data.team1; 
                    needsPreviewUpdate = true; 
                }
            }

            if (data.team2 !== undefined) {
                state.currentTeam2 = data.team2;
                const t2 = document.getElementById('team2Select');
                if (t2 && t2.value !== data.team2) { 
                    t2.value = data.team2; 
                    needsPreviewUpdate = true; 
                }
            }

            // Sincroniza Pontos em Tempo Real
            if (data.score1 !== undefined) {
                state.score1 = data.score1;
                const s1 = document.getElementById('score1');
                if (s1) s1.innerText = state.score1;
            }
            if (data.score2 !== undefined) {
                state.score2 = data.score2;
                const s2 = document.getElementById('score2');
                if (s2) s2.innerText = state.score2;
            }

            if (needsPreviewUpdate) updateLiveEloPreview();

            // Verifica condições de vitória para abrir modais simultaneamente nas telas de todos
            checkWinCondition();

            // Fechamento sincronizado do modal
            if (state.score1 === 0 && state.score2 === 0) {
                closeVictoryModalOnly();
            }
        }
    });
};

// ============================================================================
// CONTROLO DE LOGIN / LOGOUT
// ============================================================================

export const handleLogin = async () => {
    const email = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();

    if (!email || !pass) {
        showToast("Preencha o e-mail e a senha.", "error");
        return;
    }

    const btn = document.querySelector('button[onclick="handleLogin()"]');
    const originalText = btn.innerText;
    btn.innerText = "A ENTRAR...";
    btn.disabled = true;

    const result = await loginAdmin(email, pass);

    if (result.success) {
        showToast("Login efetuado com sucesso!", "success");
        document.getElementById('loginUser').value = '';
        document.getElementById('loginPass').value = '';
        switchView('admin');
    } else {
        showToast(result.message, "error");
    }

    btn.innerText = originalText;
    btn.disabled = false;
};

export const handleLogout = async () => {
    const result = await logoutAdmin();
    if (result.success) {
        showToast("Sessão encerrada com segurança.", "info");
        switchView('public');
    } else {
        showToast(result.message, "error");
    }
};

// ============================================================================
// BINDINGS GLOBAIS (Disponibilizando para o HTML)
// ============================================================================

Object.assign(window, {
    switchView,
    toggleEloSystem,
    drawTeams,
    clearTeams,
    deleteTeam,
    redrawTeamWithWaitlist, 
    promoteWaitlistToTeam,  
    createWaitlist,
    updateScore,
    resetScore,
    saveAndCloseVictoryModal,
    closeVictoryModalOnly,
    toggleAllPlayers,
    togglePlayerSelection,
    renderSorteioTable,
    savePlayer,
    deletePlayer,
    closeConfirmModal,
    updateLiveEloPreview,
    handleImageUpload,
    removePhoto,
    adjustBonus,
    confirmMovePlayer,
    clearMatchHistory,
    selectOnlyPlayersInTeams,
    closeMoveModal,        
    closePlayerHistoryModal,
    editPlayer, 
    resetForm,
    handleLogin,
    handleLogout  
});

// ============================================================================
// BOOTSTRAP DA APLICAÇÃO
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa o observador de autenticação (Segurança Real)
    initAuthObserver((isAuthenticated) => {
        document.getElementById('loading-overlay').classList.add('hidden');
    });

    // 2. Inicia a escuta do banco de dados
    initDatabaseListeners();

    // 3. Configura o modal de confirmação genérico
    const btnConfirm = document.getElementById('btnConfirmAction');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            if (state.confirmActionCallback) state.confirmActionCallback();
            closeConfirmModal();
        });
    }

    // 4. Configuração inicial da view
    switchView('public');

    // 5. Injeta os ícones Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});