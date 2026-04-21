import { auth, db, playersRef, teamsRef, matchHistoryRef, settingsRef, appId } from './firebase.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { onSnapshot, doc, setDoc, updateDoc, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from './state.js';
import { renderAll, switchView, showToast, openConfirmModal, renderSorteioTable } from './ui.js';

// O appId agora é importado diretamente do firebase.js para garantir que as atualizações e exclusões
// sejam feitas no banco de dados real (app-volei-34f53) e não num banco de testes.

onAuthStateChanged(auth, (user) => {
    if (user) { 
        document.getElementById('loading-overlay').classList.add('hidden'); 
        
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
        
        // NOVO: Lê estado da chave Placar Aberto do Firebase
        onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                state.eloEnabled = data.eloEnabled;
                const toggle = document.getElementById('toggleElo');
                if (toggle) toggle.checked = state.eloEnabled;

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
            }
        });
    }
});

signInAnonymously(auth);

export const toggleEloSystem = async (enabled) => {
    if (!state.isAuthenticated) { 
        showToast("Apenas admins podem alterar isso.", "error"); 
        return; 
    }
    await setDoc(settingsRef, { eloEnabled: enabled }, { merge: true });
    showToast(enabled ? "Placar Público Ativado!" : "Placar Público Desativado!", "info");
};

export const handleLogin = () => { 
    if(document.getElementById('loginUser').value === 'admin' && document.getElementById('loginPass').value === '12345') { 
        state.isAuthenticated = true; 
        switchView('admin'); 
        showToast("Sessão iniciada."); 
    } else {
        showToast("Negado!", "error");
    }
};

export const handleLogout = () => { 
    state.isAuthenticated = false; 
    switchView('public'); 
    showToast("Sessão terminada."); 
};

export const togglePlayerSelection = (id, isC) => { 
    isC ? state.selectedPlayerIds.add(id) : state.selectedPlayerIds.delete(id); 
};

export const toggleAllPlayers = (isC) => { 
    isC ? state.players.forEach(p => state.selectedPlayerIds.add(p.id)) : state.selectedPlayerIds.clear(); 
    renderSorteioTable(); 
};

export const selectOnlyPlayersInTeams = () => {
    state.selectedPlayerIds.clear();
    state.drawnTeams.forEach(team => {
        team.players.forEach(p => state.selectedPlayerIds.add(p.id));
    });
    renderSorteioTable();
    showToast("Atletas em times selecionados!", "info");
};

export const savePlayer = async () => {
    const name = document.getElementById('playerName').value.trim();
    const id = document.getElementById('editId').value;
    
    if(!name) return showToast("Preencha o nome!", "error");
    
    const btn = document.getElementById('btnSave'); 
    btn.disabled = true; 
    btn.innerText = "SALVANDO...";
    
    try {
        const elo = Math.max(0, parseInt(document.getElementById('statBonus').value) || 150);
        
        const obj = { 
            name, 
            categoria: parseInt(document.getElementById('statCategoria').value), 
            partidas: parseInt(document.getElementById('statJogos').value), 
            vitorias: parseInt(document.getElementById('statVit').value), 
            eloRating: elo, 
            icon: document.getElementById('playerIcon').value, 
            photo: document.getElementById('photoData').value 
        };
        
        if(id) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', id), obj);
        } else {
            await addDoc(playersRef, obj);
        }
        
        showToast("Salvo!"); 
        resetForm();
    } catch(e) { 
        showToast("Erro", "error"); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = "<i data-lucide='save' class='w-4 h-4'></i> SALVAR"; 
        lucide.createIcons(); 
    }
};

export const deletePlayer = (id) => {
    openConfirmModal("Excluir", "Remover atleta?", async () => { 
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', id)); 
        showToast("Removido."); 
    });
};

export const editPlayer = (id) => { 
    const p = state.players.find(x => x.id === id); 
    document.getElementById('playerName').value = p.name; 
    document.getElementById('editId').value = id; 
    document.getElementById('statCategoria').value = p.categoria || 5;
    document.getElementById('statJogos').value = p.partidas || 0;
    document.getElementById('statVit').value = p.vitorias || 0;
    document.getElementById('playerIcon').value = p.icon || 'user';
    document.getElementById('statBonus').value = p.eloRating !== undefined ? p.eloRating : 150;

    if (p.photo) {
        document.getElementById('photoPreview').src = p.photo;
        document.getElementById('photoPreview').classList.remove('hidden');
        document.getElementById('photoPlaceholder').classList.add('hidden');
        document.getElementById('photoData').value = p.photo;
        document.getElementById('btnRemovePhoto').classList.remove('hidden');
    } else {
        import('./main.js').then(m => m.removePhoto());
    }
    
    document.getElementById('formContent').classList.remove('hidden'); 
};

export const resetForm = () => { 
    ['playerName', 'editId', 'statJogos', 'statVit', 'statBonus', 'photoData', 'playerPhoto'].forEach(id => document.getElementById(id).value = ''); 
    document.getElementById('statCategoria').value = '5'; 
    document.getElementById('formContent').classList.add('hidden'); 
    import('./main.js').then(m => m.removePhoto()); 
};