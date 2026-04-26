import { state } from '../state.js';
import { 
    db, doc, addDoc, updateDoc, deleteDoc, playersRef, settingsRef, matchHistoryRef, storage, ref, uploadBytes, getDownloadURL, deleteObject,
    globalGroupsRef, 
} from '../firebase.js';
import { showToast, openConfirmModal, renderSorteioTable, resetForm } from '../ui.js';
import { arrayUnion, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; // NOVO IMPORT

// ============================================================================
// CONFIGURAÇÕES GLOBAIS
// ============================================================================

/**
 * Ativa ou desativa a permissão para visitantes usarem o placar
 */
export const toggleEloSystem = async (enabled) => {
    if (!state.isAuthenticated) { 
        showToast("Apenas administradores podem alterar isso.", "error"); 
        return; 
    }
    
    try {
        await updateDoc(settingsRef, { eloEnabled: enabled });
        showToast(enabled ? "Placar Público Ativado!" : "Placar Público Desativado!", "info");
    } catch (error) {
        console.error(error);
        showToast("Erro ao alterar configuração.", "error");
    }
};

/**
 * Limpa todo o histórico de partidas do banco de dados
 */
export const clearMatchHistory = () => {
    openConfirmModal("Limpar Histórico", "Deseja realmente apagar todo o histórico de partidas?", async () => {
        try {
            // Mapeia todas as partidas e cria uma requisição de delete para cada uma
            const deletePromises = state.matchHistory.map(m => deleteDoc(doc(matchHistoryRef, m.id)));
            await Promise.all(deletePromises);
            showToast("Histórico de partidas limpo!", "info");
        } catch (e) { 
            console.error(e); 
            showToast("Erro ao limpar histórico", "error"); 
        }
    });
};

// ============================================================================
// SELEÇÃO DE JOGADORES (Sorteio)
// ============================================================================

export const togglePlayerSelection = (id, isChecked) => { 
    if (isChecked) {
        state.selectedPlayerIds.add(id);
    } else {
        state.selectedPlayerIds.delete(id);
    }
};

export const toggleAllPlayers = (isChecked) => { 
    if (isChecked) {
        state.players.forEach(p => state.selectedPlayerIds.add(p.id));
    } else {
        state.selectedPlayerIds.clear();
    }
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

// ============================================================================
// HELPER: LIMPEZA DO STORAGE
// ============================================================================
const deletePhotoFromStorage = async (photoUrl) => {
    // Só tenta deletar se for realmente um link do Firebase Storage
    if (!photoUrl || !photoUrl.includes('firebasestorage')) return;
    try {
        const photoRef = ref(storage, photoUrl);
        await deleteObject(photoRef);
        console.log("Foto antiga removida do Storage com sucesso.");
    } catch (error) {
        // Se o erro for apenas "A foto já não existe", ignoramos pacificamente
        if (error.code === 'storage/object-not-found') {
            console.log("Aviso: A foto antiga já não estava no Storage. Limpeza ignorada.");
        } else {
            // Se for um erro real (ex: falta de permissão), aí sim mostramos no console
            console.error("Erro real ao limpar foto do Storage:", error);
        }
    }
};

// ============================================================================
// GERENCIAMENTO DE ATLETAS (CRUD)
// ============================================================================

export const savePlayer = async () => {
    const nameInput = document.getElementById('playerName');
    const emailInput = document.getElementById('playerEmail');
    const editIdInput = document.getElementById('editId');
    const photoDataInput = document.getElementById('photoData'); 
    
    let name = nameInput.value.trim();
    let newPhotoUrl = photoDataInput.value; 
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const id = editIdInput.value;

    if(!name && !email) {
        return showToast("Preencha o nome ou o e-mail do atleta!", "error");
    }
    
    const btn = document.getElementById('btnSave'); 
    btn.disabled = true; 
    btn.innerText = "SALVANDO...";
    
    try {
        // 1. BUSCA DE PERFIL GLOBAL: Se o e-mail existir na coleção 'users', puxa nome e foto oficiais
        if (email) {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', email));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const globalProfile = querySnapshot.docs[0].data();
                if (globalProfile.name) name = globalProfile.name;
                if (globalProfile.photo) newPhotoUrl = globalProfile.photo;
                showToast("Dados sincronizados com o perfil do jogador!", "info");
            }
        }

        // 2. CÁLCULO DO ELO
        const elo = Math.max(0, parseInt(document.getElementById('statBonus').value) || 150);

        const playerData = { 
            name, 
            categoria: parseInt(document.getElementById('statCategoria').value), 
            partidas: parseInt(document.getElementById('statJogos').value), 
            vitorias: parseInt(document.getElementById('statVit').value), 
            eloRating: elo, 
            icon: document.getElementById('playerIcon').value, 
            photo: newPhotoUrl, 
            updatedAt: Date.now()
        };

        if (email) playerData.email = email;

        // 3. RECUPERA A FOTO ANTIGA (Caso seja uma edição)
        let oldPhotoUrl = null;
        if (id) {
            const existingPlayer = state.players.find(p => p.id === id);
            if (existingPlayer && existingPlayer.photo) {
                oldPhotoUrl = existingPlayer.photo;
            }
        }

        // 4. SALVA OU ATUALIZA NO FIREBASE
        if (id) {
            await updateDoc(doc(playersRef, id), playerData);
            
            // Se tinha uma foto antiga e ela é diferente da nova, apaga a velha do Storage para poupar espaço
            if (oldPhotoUrl && oldPhotoUrl !== newPhotoUrl) {
                if (window.deletePhotoFromStorage) {
                    await window.deletePhotoFromStorage(oldPhotoUrl);
                }
            }
            showToast("Atleta atualizado!"); 
        } else {
            playerData.streak = 0;
            await addDoc(playersRef, playerData);
            showToast("Novo atleta cadastrado!"); 
        }
        
        // 5. VINCULA O JOGADOR AO GRUPO
        if (email && state.currentGroupId) {
            const groupDocRef = doc(db, 'groups', state.currentGroupId);
            const { arrayUnion } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            await updateDoc(groupDocRef, {
                memberEmails: arrayUnion(email)
            });
        }

        // 6. LIMPEZA TOTAL DO FORMULÁRIO (Evita o vazamento da foto para o próximo cadastro)
        photoDataInput.value = ''; 
        if (document.getElementById('photoPreview')) {
            document.getElementById('photoPreview').src = '';
            document.getElementById('photoPreview').classList.add('hidden');
        }
        if (document.getElementById('photoPlaceholder')) {
            document.getElementById('photoPlaceholder').classList.remove('hidden');
        }

        if (window.resetForm) window.resetForm();
        if (document.getElementById('playerModal')) {
            document.getElementById('playerModal').classList.add('hidden');
        }
        
    } catch(e) { 
        console.error(e);
        showToast("Erro ao salvar atleta", "error"); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = "<i data-lucide='save' class='w-4 h-4'></i> SALVAR"; 
        if (typeof lucide !== 'undefined') lucide.createIcons(); 
    }
};

export const deletePlayer = (id) => {
    openConfirmModal("Excluir Atleta", "Tem a certeza que deseja remover este atleta da base?", async () => { 
        try {
            // Antes de excluir o documento, pega o link da foto para deletar do Storage
            const playerInfo = state.players.find(p => p.id === id);
            const photoUrlToDelete = playerInfo ? playerInfo.photo : null;

            // Deleta o jogador do Firestore
            await deleteDoc(doc(playersRef, id)); 

            // Se ele tinha foto, deleta o arquivo físico do Storage
            if (photoUrlToDelete) {
                await deletePhotoFromStorage(photoUrlToDelete);
            }

            showToast("Atleta removido."); 
        } catch(e) {
            console.error(e);
            showToast("Erro ao excluir", "error");
        }
    });
};

// ============================================================================
// UPLOAD DE FOTOS (FIREBASE STORAGE)
// ============================================================================

window.handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Bloqueia o botão de salvar para o usuário não clicar antes da foto carregar
    const btnSave = document.getElementById('btnSave');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerText = "CARREGANDO FOTO...";
    }
    
    showToast("A fazer upload da foto...", "info");

    try {
        // 1. Cria um nome único para o ficheiro (ex: jogadores/123456789_xpto.jpg)
        const fileExtension = file.name.split('.').pop();
        const fileName = `jogadores/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
        
        // 2. Prepara o espaço no Firebase Storage
        const storageRef = ref(storage, fileName);

        // 3. Envia o ficheiro para o Firebase
        const snapshot = await uploadBytes(storageRef, file);
        
        // 4. Pede ao Firebase o Link (URL) público dessa imagem
        const downloadURL = await getDownloadURL(snapshot.ref);

        // 5. Mostra a bolinha com a foto na tela para o utilizador
        document.getElementById('photoPreview').src = downloadURL;
        document.getElementById('photoPreview').classList.remove('hidden');
        document.getElementById('photoPlaceholder').classList.add('hidden');
        document.getElementById('btnRemovePhoto').classList.remove('hidden');
        
        // 6. GUARDA O LINK NO CAMPO ESCONDIDO (É isto que vai para o Firestore ao salvar)
        document.getElementById('photoData').value = downloadURL; 
        
        showToast("Foto pronta!");
    } catch (error) {
        console.error("Erro no upload:", error);
        showToast("Erro ao fazer upload da imagem", "error");
    } finally {
        // Libera o botão de salvar novamente
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = "<i data-lucide='save' class='w-4 h-4'></i> SALVAR";
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
};

// Função auxiliar para remover a foto caso o usuário clique em "Remover Foto"
window.removePhoto = async () => {
    const currentUrl = document.getElementById('photoData').value;
    const editId = document.getElementById('editId').value;

    // Se existe um link de foto no formulário
    if (currentUrl) {
        let isSavedPhoto = false;
        
        // Verifica se essa foto já estava salva no banco
        if (editId) {
            const p = state.players.find(x => x.id === editId);
            if (p && p.photo === currentUrl) isSavedPhoto = true;
        }

        // Se a foto NÃO estava salva (foi um upload feito agora e o usuário se arrependeu)
        // Podemos deletar do Storage instantaneamente para não acumular lixo!
        if (!isSavedPhoto) {
            await deletePhotoFromStorage(currentUrl);
        }
    }

    // Limpa a interface do formulário
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoPlaceholder').classList.remove('hidden');
    document.getElementById('photoData').value = ''; 
    document.getElementById('btnRemovePhoto').classList.add('hidden');
    document.getElementById('playerPhoto').value = ''; 
};