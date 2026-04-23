import { state } from './state.js';
import { 
    switchView, showToast, openConfirmModal, closeConfirmModal, openMoveModal, 
    closeMoveModal, closeVictoryModalOnly, renderSorteioTable, 
    changeHistoryPage, openPlayerHistoryModal, closePlayerHistoryModal, updateSorteioCounters  
} from './ui.js';
import { drawTeams, clearTeams, deleteTeam, createWaitlist, redrawTeamWithWaitlist, updateScore, resetScore, saveAndCloseVictoryModal, updateLiveEloPreview, confirmMovePlayer, promoteWaitlistToTeam, clearMatchHistory, syncTeamsToCloud } from './logic.js';
import { 
    toggleEloSystem, handleLogin, handleLogout, togglePlayerSelection, 
    toggleAllPlayers, savePlayer, deletePlayer, editPlayer, resetForm, 
    selectOnlyPlayersInTeams 
} from './admin.js';

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
    el.value = (parseInt(el.value) || 0) + val;
};

// Vinculando todas as funções globalmente para que o index.html consiga chamá-las através dos onlicks
Object.assign(window, {
    switchView, 
    toggleEloSystem, 
    handleLogin, 
    handleLogout, 
    drawTeams, 
    clearTeams, 
    deleteTeam, 
    createWaitlist, 
    redrawTeamWithWaitlist, 
    updateScore, 
    resetScore, 
    saveAndCloseVictoryModal, 
    closeVictoryModalOnly, 
    toggleAllPlayers, 
    togglePlayerSelection, 
    renderSorteioTable, 
    savePlayer, 
    deletePlayer, 
    editPlayer, 
    resetForm, 
    closeConfirmModal, 
    openMoveModal, 
    closeMoveModal, 
    updateLiveEloPreview, 
    handleImageUpload, 
    removePhoto, 
    adjustBonus, 
    confirmMovePlayer,
    clearMatchHistory,
    changeHistoryPage,
    openPlayerHistoryModal,
    closePlayerHistoryModal,
    selectOnlyPlayersInTeams,
    syncTeamsToCloud,
    updateSorteioCounters
});

document.addEventListener('DOMContentLoaded', () => {
    const btnConfirm = document.getElementById('btnConfirmAction');
    
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => { 
            if (state.confirmActionCallback) state.confirmActionCallback(); 
            closeConfirmModal(); 
        });
    }
    
    // Inicia na view correta
    switchView('public');
    
    // Inicia os ícones Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});