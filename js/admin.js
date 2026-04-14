import { state } from './state.js';
import { app, auth, db, appId, playersRef, teamsRef, doc, setDoc, addDoc, deleteDoc, onSnapshot, signInAnonymously, onAuthStateChanged } from './firebase.js';
import { showToast, openConfirmModal, getLevelInfo, switchView, renderAll, renderAdmin } from './ui.js';

// --- Autenticação e Sincronização em Tempo Real --- //

onAuthStateChanged(auth, (user) => {
    state.currentUser = user;
    if (user) { 
        const loading = document.getElementById('loading-overlay');
        if (loading) loading.classList.add('hidden'); 
        setupSync(); 
    }
});

// Inicializar sessão anónima automaticamente
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
};

// --- Funções de Autenticação Admin --- //

export const handleLogin = () => {
    const userVal = document.getElementById('loginUser').value;
    const passVal = document.getElementById('loginPass').value;
    
    // Mantenha estas credenciais simples ou mude para Firebase Auth real mais tarde
    if (userVal === 'admin' && passVal === '12345') { 
        state.isAuthenticated = true; 
        switchView('admin'); 
        showToast("Sessão iniciada com sucesso!");
    } else { 
        showToast("Acesso Negado!", "error"); 
    }
};

export const handleLogout = () => { 
    state.isAuthenticated = false; 
    switchView('public'); 
    showToast("Sessão terminada.", "info");
};

// --- Gestão de Jogadores (CRUD) --- //

export const togglePlayerSelection = (id, isChecked) => {
    if (isChecked) state.selectedPlayerIds.add(id);
    else state.selectedPlayerIds.delete(id);
    
    const allSelected = state.players.length > 0 && state.players.every(p => state.selectedPlayerIds.has(p.id));
    const selectAllCheckbox = document.getElementById('selectAll');
    if(selectAllCheckbox) selectAllCheckbox.checked = allSelected;
};

export const toggleAllPlayers = (isChecked) => {
    if (isChecked) state.players.forEach(p => state.selectedPlayerIds.add(p.id));
    else state.selectedPlayerIds.clear();
    renderAdmin();
};

export const adjustBonus = (change) => {
    const input = document.getElementById('statBonus');
    let val = parseInt(input.value) || 0;
    input.value = val + change;
};

export const savePlayer = async () => {
    const name = document.getElementById('playerName').value.trim();
    const categoria = parseInt(document.getElementById('statCategoria').value);
    const partidas = Math.max(0, parseInt(document.getElementById('statJogos').value) || 0);
    const vitorias = Math.max(0, parseInt(document.getElementById('statVit').value) || 0);
    const deltaBonus = parseInt(document.getElementById('statBonus').value) || 0;
    const icon = document.getElementById('playerIcon').value || 'user';
    const editId = document.getElementById('editId').value;

    if (!name) { showToast("Preencha o nome!", "error"); return; }
    
    const existingPlayer = editId ? state.players.find(x => x.id === editId) : null;
    const streak = existingPlayer ? (existingPlayer.streak || 0) : 0;
    
    const currentBonus = existingPlayer ? (existingPlayer.bonus || 0) : 0;
    const bonus = currentBonus + deltaBonus;

    const validVitorias = Math.min(partidas, vitorias); 
    const derrotas = partidas - validVitorias;
    const des = partidas > 0 ? Math.round((validVitorias / partidas) * 100) : 0;
    
    const pontos = Math.max(0, (validVitorias * 20) - (derrotas * 15) + bonus);
    const lvlInfo = getLevelInfo(pontos);
    
    const playerObj = { 
        name, categoria, partidas, des, pontos, icon, vitorias: validVitorias,
        streak, bonus,
        type: lvlInfo.type,
        updatedAt: Date.now() 
    };

    try {
        const btnSave = document.getElementById('btnSave');
        const originalText = btnSave.innerText;
        btnSave.disabled = true;
        btnSave.innerText = "A SALVAR...";

        if (editId) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', editId), playerObj);
            showToast("Atleta atualizado!");
        } else {
            const docRef = await addDoc(playersRef, playerObj);
            state.selectedPlayerIds.add(docRef.id);
            showToast("Atleta cadastrado!");
        }
        
        resetForm();
    } catch (e) { 
        console.error(e);
        showToast("Erro ao salvar atleta", "error"); 
    } finally {
        const btnSave = document.getElementById('btnSave');
        btnSave.disabled = false;
        btnSave.innerHTML = `<i data-lucide="save" class="w-4 h-4 sm:w-5 sm:h-5"></i> SALVAR`;
        lucide.createIcons();
    }
};

export const deletePlayer = (id) => {
    openConfirmModal("Excluir Atleta", "Tem a certeza que deseja excluir este atleta permanentemente?", async () => {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', id));
            showToast("Atleta removido.", "error");
        } catch (e) { showToast("Erro ao excluir", "error"); }
    });
};

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
    
    lucide.createIcons();
    document.getElementById('admin-form-anchor').scrollIntoView({ behavior: 'smooth' });
};

export const resetForm = () => {
    document.getElementById('playerName').value = '';
    document.getElementById('editId').value = '';
    document.getElementById('statCategoria').value = '5';
    document.getElementById('statJogos').value = '0';
    document.getElementById('statVit').value = '0';
    document.getElementById('statBonus').value = '0';
    document.getElementById('playerIcon').value = 'user';
    
    document.getElementById('formTitle').innerHTML = `<i data-lucide="user-plus"></i> Novo Atleta`;
    document.getElementById('btnSave').innerHTML = `<i data-lucide="save" class="w-4 h-4 sm:w-5 sm:h-5"></i> SALVAR`;
    document.getElementById('btnCancel').classList.add('hidden');
    
    lucide.createIcons();
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