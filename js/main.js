import { state } from './state.js';
import { initAuthObserver, loginUser, registerUser, resetPassword, logoutUser } from './authService.js';
import {
    switchView, showToast, openConfirmModal, closeConfirmModal,
    closeVictoryModalOnly, renderSorteioTable, renderAll, updateLiveEloPreview,
    closeMoveModal, closePlayerHistoryModal, editPlayer, resetForm, openMoveModal,
    updateSorteioCounters, changeHistoryPage, openPlayerHistoryModal, togglePlacarLock, 
    forceUnlockPlacar, toggleAuthMode, renderUserGroups
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

// Importação das novas variáveis e métodos do Firebase
import { 
    playersRef, teamsRef, matchHistoryRef, settingsRef, 
    globalGroupsRef, setGroupContext, deleteDoc, updateDoc,
    onSnapshot, addDoc, query, where, getDoc, doc, db,
    storage, ref, uploadBytes, getDownloadURL 
} from './firebase.js';

export const adjustBonus = (val) => {
    const el = document.getElementById('statBonus');
    el.value = Math.max(0, (parseInt(el.value) || 0) + val);
};

// ============================================================================
// LÓGICA DE GRUPOS (SAAS) E AUTENTICAÇÃO
// ============================================================================

export const handleAuthAction = async () => {
    const btn = document.getElementById('btnAuthMain');
    const mode = btn.getAttribute('data-mode') || 'login';
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPass').value.trim();
    
    if (!email || !pass) return showToast("Preencha o e-mail e a senha.", "error");

    const originalHtml = btn.innerHTML;
    btn.innerHTML = "AGUARDE...";
    btn.disabled = true;

    if (mode === 'register') {
        const name = document.getElementById('authName').value.trim();
        if (!name) { 
            btn.innerHTML = originalHtml; 
            btn.disabled = false; 
            return showToast("Preencha o seu nome.", "error"); 
        }
        
        const res = await registerUser(email, pass, name);
        if (res.success) {
            showToast("Conta criada! Bem-vindo.", "success");
        } else {
            showToast(res.message, "error");
        }
    } else {
        const res = await loginUser(email, pass);
        if (res.success) {
            showToast("Sessão iniciada!", "success");
            // Limpa os campos de input
            document.getElementById('authEmail').value = '';
            document.getElementById('authPass').value = '';
            // Força a ida para a tela de grupos
            switchView('groups');
        } else {
            showToast(res.message, "error");
        }
    }
    
    btn.innerHTML = originalHtml;
    btn.disabled = false;
};

export const handlePasswordReset = async () => {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) return showToast("Digite seu e-mail para recuperar a senha.", "error");
    
    const res = await resetPassword(email);
    if (res.success) showToast("E-mail de recuperação enviado!", "info");
    else showToast(res.message, "error");
};

// Função para parar todas as escutas do Firebase (EVITA O ERRO NO CONSOLE)
export const clearAllListeners = () => {
    // 1. Para as escutas do grupo atual (jogadores, times, etc)
    if (state.unsubscribeGroup && state.unsubscribeGroup.length > 0) {
        state.unsubscribeGroup.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        state.unsubscribeGroup = [];
    }
    // 2. Para a escuta da lista de grupos
    if (state.unsubscribeGroupsList) {
        state.unsubscribeGroupsList();
        state.unsubscribeGroupsList = null;
    }
};

export const handleLogout = async () => {
    // PRIMEIRO: Para tudo!
    clearAllListeners();
    
    // DEPOIS: Sai da conta
    await logoutUser();
    
    showToast("Sessão encerrada com segurança.", "info");
    switchView('auth');
};

// Carrega a lista de Rachas do Utilizador
export const loadUserGroups = () => {
    if (!state.user || !state.user.email) return;
    
    // Se já houver uma escuta ativa, desliga ela antes de começar outra
    if (state.unsubscribeGroupsList) state.unsubscribeGroupsList();

    try {
        let q;
        // Lógica Master corrigida
        if (state.isMaster) {
            console.log("Modo Master Ativado: Carregando todos os grupos.");
            q = query(globalGroupsRef); 
        } else {
            q = query(globalGroupsRef, where('memberEmails', 'array-contains', state.user.email));
        }
        
        state.unsubscribeGroupsList = onSnapshot(q, (snapshot) => {
            state.userGroups = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            if (!document.getElementById('view-groups').classList.contains('hidden-view')) {
                renderUserGroups();
            }
        }, (error) => {
            // Se o erro for de permissão durante o logout, ignoramos
            if (error.code !== 'permission-denied') {
                console.error("Erro ao buscar grupos:", error);
            }
        });
    } catch (e) {
        console.error("Erro na consulta de grupos:", e);
    }
};

// Cria um Racha Novo
export const handleCreateGroup = async () => {
    const nameInput = document.getElementById('newGroupName');
    const name = nameInput.value.trim();
    if(!name) return showToast("Dê um nome ao seu grupo.", "error");

    try {
        await addDoc(globalGroupsRef, {
            name: name,
            adminUids: [state.user.uid], // Quem criou fica como admin
            memberEmails: [state.user.email],
            createdAt: Date.now()
        });
        showToast("Grupo criado com sucesso!", "success");
        nameInput.value = '';
        document.getElementById('createGroupModal').classList.add('hidden');
        document.getElementById('createGroupModal').classList.remove('flex');
    } catch(e) {
        console.error(e);
        showToast("Erro ao criar grupo.", "error");
    }
};

// O Utilizador clicou num Racha para entrar
export const selectGroup = (groupId, groupName) => {
    state.currentGroupId = groupId;
    state.currentGroupName = groupName;
    
    // Define a permissão (role)
    const group = state.userGroups.find(g => g.id === groupId);
    if (state.isMaster || (group && group.adminUids && group.adminUids.includes(state.user.uid))) {
        state.currentUserRole = 'admin';
    } else {
        state.currentUserRole = 'player';
    }

    // AGORA ATUALIZA O NOME LÁ NO RANKING
    const publicTitle = document.getElementById('publicGroupName');
    if (publicTitle) {
        publicTitle.innerHTML = `${groupName.toUpperCase()}`;
    }

    // MUDA O "CANO" DA BASE DE DADOS PARA A PASTA DESTE GRUPO
    setGroupContext(groupId);

    // Desliga os listeners antigos
    if (state.unsubscribeGroup && state.unsubscribeGroup.length > 0) {
        state.unsubscribeGroup.forEach(unsub => unsub());
    }
    state.unsubscribeGroup = [];

    initDatabaseListeners();
    switchView('public');
};

// ============================================================================
// INICIALIZAÇÃO DOS DADOS (Listeners do Firebase por Grupo)
// ============================================================================

const initDatabaseListeners = async () => {
    // Como as referências mudaram dinamicamente no firebase.js,
    // precisamos importá-las novamente para obter os caminhos atualizados
    const { playersRef, teamsRef, matchHistoryRef, settingsRef } = await import('./firebase.js');

    const unsubPlayers = onSnapshot(playersRef, (s) => {
        state.players = s.docs.map(d => ({id: d.id, ...d.data()}));
        if(state.isFirstLoad) {
            state.players.forEach(p => state.selectedPlayerIds.add(p.id));
            state.isFirstLoad = false;
        }
        renderAll();
    });

    const unsubTeams = onSnapshot(teamsRef, (s) => {
        state.drawnTeams = s.docs.map(d => ({id: d.id, ...d.data()}));
        renderAll();
    });

    const unsubMatches = onSnapshot(matchHistoryRef, (s) => {
        state.matchHistory = s.docs.map(d => ({id: d.id, ...d.data()}));
        renderAll();
    });

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.eloEnabled = data.eloEnabled ?? true;
            const toggle = document.getElementById('toggleElo');
            if (toggle) toggle.checked = state.eloEnabled;

            const matchActive = data.matchInProgress === true;
            const ownerId = data.matchOwner;
            const myId = state.localSessionId;
            const shouldLock = matchActive && (ownerId !== myId);
            
            state.isPlacarLocked = shouldLock; 
            togglePlacarLock(shouldLock);
        } else {
            state.isPlacarLocked = false;
            togglePlacarLock(false);
        }
    });

    state.unsubscribeGroup.push(unsubPlayers, unsubTeams, unsubMatches, unsubSettings);
};

// --- NOVAS FUNÇÕES: PERFIL DO USUÁRIO ---
export const saveUserProfile = async () => {
    const name = document.getElementById('userProfileNameInput').value.trim();
    const photo = document.getElementById('userProfilePhotoData').value;
    
    if (!name) return showToast("Preencha o seu nome.", "error");
    
    const btn = document.getElementById('btnSaveProfile');
    btn.innerHTML = "SALVANDO...";
    btn.disabled = true;
    
    try {
        // Agora incluímos o e-mail e usamos setDoc para garantir que o registro seja criado ou atualizado
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        
        await setDoc(doc(db, 'users', state.user.uid), {
            name: name,
            photo: photo,
            email: state.user.email.toLowerCase(), // CRUCIAL para o Admin te encontrar
            updatedAt: Date.now()
        }, { merge: true });

        state.userProfile = { ...state.userProfile, name, photo };
        showToast("Perfil atualizado com sucesso!", "success");
    } catch (e) {
        console.error(e);
        showToast("Erro ao salvar perfil.", "error");
    } finally {
        btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> SALVAR PERFIL';
        btn.disabled = false;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

export const removeUserProfilePhoto = () => {
    const photoPreview = document.getElementById('userProfilePhotoPreview');
    const photoPlaceholder = document.getElementById('userProfilePhotoPlaceholder');
    const photoData = document.getElementById('userProfilePhotoData');
    const btnRemove = document.getElementById('btnRemoveProfilePhoto');

    // Limpa a interface
    photoPreview.src = '';
    photoPreview.classList.add('hidden');
    photoPlaceholder.classList.remove('hidden');
    photoData.value = ''; // Esvazia o valor que será salvo
    btnRemove.classList.add('hidden');

    showToast("Foto removida. Não esqueça de clicar em 'Salvar Perfil'.", "info");
};

window.handleUserProfilePhotoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const btnSave = document.getElementById('btnSaveProfile');
    btnSave.disabled = true;
    btnSave.innerText = "CARREGANDO FOTO...";
    showToast("A fazer upload da sua foto...", "info");

    try {
        const fileExtension = file.name.split('.').pop();
        const fileName = `users/${state.user.uid}_${Date.now()}.${fileExtension}`;
        const storageRef = ref(storage, fileName);
        
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        document.getElementById('userProfilePhotoPreview').src = downloadURL;
        document.getElementById('userProfilePhotoPreview').classList.remove('hidden');
        document.getElementById('userProfilePhotoPlaceholder').classList.add('hidden');
        document.getElementById('userProfilePhotoData').value = downloadURL;
        document.getElementById('btnRemoveProfilePhoto').classList.remove('hidden'); 
        
        showToast("Foto carregada com sucesso!");
    } catch (error) {
        console.error("Erro no upload:", error);
        showToast("Erro ao processar imagem", "error");
    } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> SALVAR PERFIL';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

// --- NOVAS FUNÇÕES: GERENCIAR GRUPOS ---
window.renameGroup = async (groupId, currentName) => {
    const newName = prompt("Digite o novo nome para este grupo:", currentName);
    if (newName && newName.trim() !== "" && newName !== currentName) {
        try {
            await updateDoc(doc(db, 'groups', groupId), { name: newName.trim() });
            showToast("Grupo renomeado com sucesso!", "success");
        } catch (e) {
            showToast("Erro ao renomear o grupo.", "error");
        }
    }
};

window.deleteGroup = (groupId) => {
    openConfirmModal("Excluir Grupo", "Deseja apagar este grupo permanentemente? Todos os jogadores e dados serão perdidos. Esta ação NÃO pode ser desfeita.", async () => {
        try {
            await deleteDoc(doc(db, 'groups', groupId));
            showToast("Grupo excluído com sucesso.", "info");
        } catch (e) {
            showToast("Erro ao excluir o grupo.", "error");
        }
    });
};

// ============================================================================
// BINDINGS GLOBAIS (Disponibilizando para o HTML)
// ============================================================================

Object.assign(window, {
    switchView, toggleEloSystem, drawTeams, clearTeams, deleteTeam, redrawTeamWithWaitlist, 
    promoteWaitlistToTeam, createWaitlist, updateScore, resetScore, syncTeamsToCloud, 
    saveAndCloseVictoryModal, closeVictoryModalOnly, toggleAllPlayers, togglePlayerSelection, 
    renderSorteioTable, savePlayer, deletePlayer, closeConfirmModal, updateLiveEloPreview, 
    handleImageUpload, removePhoto, adjustBonus, confirmMovePlayer, clearMatchHistory, 
    selectOnlyPlayersInTeams, closeMoveModal, closePlayerHistoryModal, editPlayer, resetForm, 
    openMoveModal, updateSorteioCounters, changeHistoryPage, openPlayerHistoryModal, forceUnlockPlacar,
    // NOVOS BINDINGS DE SAAS:
    handleAuthAction, toggleAuthMode, handlePasswordReset, handleLogout, 
    handleCreateGroup, selectGroup, saveUserProfile, removeUserProfilePhoto
});

// ============================================================================
// BOOTSTRAP DA APLICAÇÃO
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // O Observador agora escuta se a pessoa entrou na conta
    initAuthObserver(async (isAuthenticated, user) => {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        
        if (isAuthenticated && user) {
            state.isMaster = (user.email.trim().toLowerCase() === 'renato96.ram@gmail.com');
            
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if(userDoc.exists()) {
                    state.userProfile = userDoc.data();
                    
                    // PREENCHE A INTERFACE DO PERFIL SE TIVER DADOS SALVOS
                    document.getElementById('userProfileNameInput').value = state.userProfile.name || '';
                    if (state.userProfile.photo) {
                        const img = document.getElementById('userProfilePhotoPreview');
                        img.src = state.userProfile.photo;
                        img.classList.remove('hidden');
                        document.getElementById('userProfilePhotoPlaceholder').classList.add('hidden');
                        document.getElementById('userProfilePhotoData').value = state.userProfile.photo;
                        document.getElementById('btnRemoveProfilePhoto').classList.remove('hidden');
                    }
                }
            } catch (error) { console.error("Erro ao puxar perfil", error); }

            switchView('groups');
            loadUserGroups();
        } else {
            clearAllListeners();
            switchView('auth');
        }
    });

    const btnConfirm = document.getElementById('btnConfirmAction');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            if (state.confirmActionCallback) state.confirmActionCallback();
            closeConfirmModal();
        });
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});