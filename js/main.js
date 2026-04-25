import { state } from './state.js';
import { initAuthObserver, loginAdmin, logoutAdmin } from './authService.js';
import {
    switchView, showToast, openConfirmModal, closeConfirmModal,
    closeVictoryModalOnly, renderSorteioTable, renderAll, updateLiveEloPreview,
    closeMoveModal, closePlayerHistoryModal, editPlayer, resetForm, openMoveModal,
    updateSorteioCounters, changeHistoryPage, openPlayerHistoryModal, togglePlacarLock, 
    forceUnlockPlacar
} from './ui.js';
import {
    drawTeams, createWaitlist, clearTeams, confirmMovePlayer, deleteTeam,
    redrawTeamWithWaitlist, promoteWaitlistToTeam 
} from './controllers/draftController.js';
import {
    updateScore, resetScore, saveAndCloseVictoryModal, checkWinCondition, syncTeamsToCloud 
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
            
            state.eloEnabled = data.eloEnabled ?? true;
            const toggle = document.getElementById('toggleElo');
            if (toggle) toggle.checked = state.eloEnabled;

            // LÓGICA DE BLOQUEIO ABSOLUTO
            const matchActive = data.matchInProgress === true;
            const ownerId = data.matchOwner;
            const myId = state.localSessionId;

            // Só bloqueia se houver jogo E o dono for diferente de mim
            const shouldLock = matchActive && (ownerId !== myId);
            
            // Grava na memória global que o placar está travado
            state.isPlacarLocked = shouldLock; 
            
            togglePlacarLock(shouldLock);
        } else {
            state.isPlacarLocked = false;
            togglePlacarLock(false);
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
    syncTeamsToCloud,
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
    openMoveModal,
    handleLogin,
    handleLogout,
    updateSorteioCounters,
    changeHistoryPage,
    openPlayerHistoryModal,
    forceUnlockPlacar  
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