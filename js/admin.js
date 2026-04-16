import { state } from './state.js';
import { auth, playersRef, teamsRef, matchHistoryRef, doc, setDoc, addDoc, deleteDoc, onSnapshot, signInAnonymously, onAuthStateChanged, appId, db } from './firebase.js';
import { showToast, openConfirmModal, getLevelInfo, getCategoryInfo, switchView, renderAll } from './ui.js';

onAuthStateChanged(auth, (user) => {
    state.currentUser = user;
    if (user) { 
        const loading = document.getElementById('loading-overlay');
        if (loading) loading.classList.add('hidden'); 
        setupSync(); 
    }
});

signInAnonymously(auth).catch(error => {
    console.error("Erro na autenticação:", error);
    showToast("Erro ao conectar com o servidor.", "error");
});

export const setupSync = () => {
    onSnapshot(playersRef, (snapshot) => {
        state.players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (state.isFirstLoad) {
            state.players.forEach(p => state.selectedPlayerIds.add(p.id));
            state.isFirstLoad = false;
        }
        renderAll();
    });

    onSnapshot(teamsRef, (snapshot) => {
        state.drawnTeams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    });

    // NOVO: Sync do Histórico
    onSnapshot(matchHistoryRef, (snapshot) => { 
        state.matchHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
        if (typeof window.renderMatchHistory === 'function') window.renderMatchHistory(); 
    });
};

export const handleLogin = () => {
    if (document.getElementById('loginUser').value === 'admin' && document.getElementById('loginPass').value === '12345') { 
        state.isAuthenticated = true; switchView('admin'); showToast("Sessão iniciada com sucesso!");
    } else { showToast("Acesso Negado!", "error"); }
};

export const handleLogout = () => { state.isAuthenticated = false; switchView('public'); showToast("Sessão terminada.", "info"); };

export const togglePlayerSelection = (id, isChecked) => {
    isChecked ? state.selectedPlayerIds.add(id) : state.selectedPlayerIds.delete(id);
    const allSelected = state.players.length > 0 && state.players.every(p => state.selectedPlayerIds.has(p.id));
    const selectAllCheckbox = document.getElementById('selectAll');
    if(selectAllCheckbox) selectAllCheckbox.checked = allSelected;
    const countElement = document.getElementById('playerCount');
    if (countElement) countElement.innerText = `${state.selectedPlayerIds.size} / ${state.players.length} Selecionados`;
};

export const toggleAllPlayers = (isChecked) => {
    isChecked ? state.players.forEach(p => state.selectedPlayerIds.add(p.id)) : state.selectedPlayerIds.clear();
    if (typeof window.renderAdmin === 'function') window.renderAdmin();
};

export const adjustBonus = (change) => {
    const input = document.getElementById('statBonus');
    input.value = (parseInt(input.value) || 0) + change;
};

export const savePlayer = async () => {
    const name = document.getElementById('playerName').value.trim();
    const editId = document.getElementById('editId').value;
    if (!name) { showToast("Preencha o nome!", "error"); return; }
    
    const existingPlayer = editId ? state.players.find(x => x.id === editId) : null;
    const partidas = Math.max(0, parseInt(document.getElementById('statJogos').value) || 0);
    const vitorias = Math.max(0, parseInt(document.getElementById('statVit').value) || 0);
    const validVitorias = Math.min(partidas, vitorias); 
    
    const newElo = Math.max(0, (existingPlayer && existingPlayer.eloRating !== undefined ? existingPlayer.eloRating : 150) + (parseInt(document.getElementById('statBonus').value) || 0));
    const playerObj = { 
        name, categoria: parseInt(document.getElementById('statCategoria').value), 
        partidas, vitorias: validVitorias, eloRating: newElo, icon: document.getElementById('playerIcon').value || 'user',
        des: partidas > 0 ? Math.round((validVitorias / partidas) * 100) : 0,
        streak: existingPlayer ? (existingPlayer.streak || 0) : 0,
        photo: document.getElementById('photoData') ? document.getElementById('photoData').value : '',
        type: getLevelInfo(newElo).type, updatedAt: Date.now() 
    };

    try {
        const btnSave = document.getElementById('btnSave');
        btnSave.disabled = true; btnSave.innerText = "A SALVAR...";
        if (editId) { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', editId), playerObj); showToast("Atleta atualizado!"); } 
        else { const docRef = await addDoc(playersRef, playerObj); state.selectedPlayerIds.add(docRef.id); showToast("Atleta cadastrado!"); }
        resetForm();
    } catch (e) { showToast("Erro ao salvar atleta", "error"); } 
    finally { 
        const btnSave = document.getElementById('btnSave'); btnSave.disabled = false; btnSave.innerHTML = `<i data-lucide="save" class="w-4 h-4 sm:w-5 sm:h-5"></i> SALVAR`; lucide.createIcons();
    }
};

export const deletePlayer = (id) => { openConfirmModal("Excluir Atleta", "Tem a certeza que deseja excluir este atleta permanentemente?", async () => { try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', id)); showToast("Atleta removido.", "error"); } catch (e) { showToast("Erro ao excluir", "error"); } }); };

export const editPlayer = (id) => {
    const p = state.players.find(x => x.id === id);
    if (!p) return;
    document.getElementById('playerName').value = p.name;
    document.getElementById('statCategoria').value = p.categoria || 1;
    document.getElementById('statJogos').value = p.partidas || 0;
    document.getElementById('statVit').value = p.vitorias || 0;
    document.getElementById('statBonus').value = '0'; 
    document.getElementById('playerIcon').value = p.icon || 'user';
    document.getElementById('editId').value = id;
    document.getElementById('formTitle').innerHTML = `<i data-lucide="edit-3"></i> Editar Atleta`;
    document.getElementById('btnSave').innerHTML = `<i data-lucide="save" class="w-4 h-4 sm:w-5 sm:h-5"></i> ATUALIZAR`;
    document.getElementById('btnCancel').classList.remove('hidden');
    
    const photoPreview = document.getElementById('photoPreview'), photoPlaceholder = document.getElementById('photoPlaceholder'), photoData = document.getElementById('photoData'), btnRemovePhoto = document.getElementById('btnRemovePhoto');
    if (p.photo) {
        if(photoPreview) { photoPreview.src = p.photo; photoPreview.classList.remove('hidden'); }
        if(photoPlaceholder) photoPlaceholder.classList.add('hidden');
        if(photoData) photoData.value = p.photo;
        if(btnRemovePhoto) btnRemovePhoto.classList.remove('hidden');
    } else { removePhoto(); }

    const formContent = document.getElementById('formContent');
    const formToggleIcon = document.getElementById('formToggleIcon');
    if(formContent && formContent.classList.contains('hidden')) {
        formContent.classList.remove('hidden');
        formToggleIcon.classList.remove('rotate-180');
    }

    lucide.createIcons();
    document.getElementById('admin-form-anchor').scrollIntoView({ behavior: 'smooth' });
};

export const removePhoto = () => {
    const [photoPreview, photoPlaceholder, photoData, fileInput, btnRemovePhoto] = ['photoPreview', 'photoPlaceholder', 'photoData', 'playerPhoto', 'btnRemovePhoto'].map(id => document.getElementById(id));
    if (photoPreview) { photoPreview.src = ''; photoPreview.classList.add('hidden'); }
    if (photoPlaceholder) photoPlaceholder.classList.remove('hidden');
    if (photoData) photoData.value = '';
    if (fileInput) fileInput.value = '';
    if (btnRemovePhoto) btnRemovePhoto.classList.add('hidden');
};

export const resetForm = () => {
    ['playerName', 'editId'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('statCategoria').value = '5';
    ['statJogos', 'statVit', 'statBonus'].forEach(id => document.getElementById(id).value = '0');
    document.getElementById('playerIcon').value = 'user';
    document.getElementById('formTitle').innerHTML = `<i data-lucide="user-plus"></i> Novo Atleta`;
    document.getElementById('btnSave').innerHTML = `<i data-lucide="save" class="w-4 h-4 sm:w-5 sm:h-5"></i> SALVAR`;
    document.getElementById('btnCancel').classList.add('hidden');
    
    const formContent = document.getElementById('formContent');
    const formToggleIcon = document.getElementById('formToggleIcon');
    if(formContent && !formContent.classList.contains('hidden')) {
        formContent.classList.add('hidden');
        formToggleIcon.classList.add('rotate-180');
    }

    removePhoto(); lucide.createIcons();
};

window.handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const size = 150; canvas.width = size; canvas.height = size;
            ctx.drawImage(img, 0, 0, size, size);
            const base64 = canvas.toDataURL('image/jpeg', 0.7);
            if (document.getElementById('photoPreview')) {
                document.getElementById('photoPreview').src = base64;
                document.getElementById('photoPreview').classList.remove('hidden');
                document.getElementById('photoPlaceholder').classList.add('hidden');
                document.getElementById('photoData').value = base64;
                const btnRemovePhoto = document.getElementById('btnRemovePhoto');
                if(btnRemovePhoto) btnRemovePhoto.classList.remove('hidden');
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

// --- Bindings Globais --- //
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.togglePlayerSelection = togglePlayerSelection;
window.toggleAllPlayers = toggleAllPlayers;
window.adjustBonus = adjustBonus;
window.savePlayer = savePlayer;
window.deletePlayer = deletePlayer;
window.editPlayer = editPlayer;
window.resetForm = resetForm;
window.removePhoto = removePhoto;