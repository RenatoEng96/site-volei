import { state } from '../state.js';
import { 
    db, doc, addDoc, updateDoc, deleteDoc, playersRef, settingsRef, matchHistoryRef, teamsRef, storage, ref, uploadBytes, getDownloadURL, deleteObject,
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
    const mode = document.getElementById('formMode')?.value || 'manual';
    const editIdInput = document.getElementById('editId');
    const id = editIdInput.value;

    let name = '';
    let newPhotoUrl = '';
    let email = '';
    
    const btn = document.getElementById('btnSave'); 
    btn.disabled = true; 
    btn.innerText = "SALVANDO...";
    
    try {
        // 1. VALIDAÇÃO E BUSCA DE DADOS CONFORME O MODO
        if (mode === 'email') {
            const emailInput = document.getElementById('playerEmail');
            email = emailInput ? emailInput.value.trim().toLowerCase() : '';
            
            if (!email) {
                throw new Error("Preencha o e-mail da conta do jogador!");
            }
            
            // Busca o perfil na coleção global 'users'
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', email));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const globalProfile = querySnapshot.docs[0].data();
                name = globalProfile.name || 'Jogador sem nome';
                newPhotoUrl = globalProfile.photo || '';
                showToast("Dados importados do perfil do jogador!", "info");
            } else {
                throw new Error("Nenhum usuário encontrado com este e-mail.");
            }
        } else {
            // Modo Manual
            const nameInput = document.getElementById('playerName');
            const photoDataInput = document.getElementById('photoData');
            name = nameInput.value.trim();
            newPhotoUrl = photoDataInput.value;
            email = ''; // Força remover o e-mail se estiver mudando de Vinculado para Manual
            
            if (!name) {
                throw new Error("Preencha o nome do atleta!");
            }
        }

        // 2. CÁLCULO DO ELO E MONTAGEM DO OBJETO
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

        const { deleteField, arrayUnion, arrayRemove } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

        // Trata o campo de e-mail no Firestore
        if (mode === 'email') {
            playerData.email = email;
        } else {
            // Se for manual, apagamos o campo e-mail APENAS se for uma EDIÇÃO (se o 'id' existir)
            if (id) {
                playerData.email = deleteField();
            }
            // Se não tiver 'id' (novo cadastro), simplesmente não adicionamos a propriedade 'email' ao objeto
        }

        // 3. RECUPERA A FOTO E E-MAIL ANTIGOS (Caso seja uma edição)
        let oldPhotoUrl = null;
        let oldEmail = null;
        let oldName = null;
        if (id) {
            const existingPlayer = state.players.find(p => p.id === id);
            if (existingPlayer) {
                if (existingPlayer.photo) oldPhotoUrl = existingPlayer.photo;
                if (existingPlayer.email) oldEmail = existingPlayer.email;
                if (existingPlayer.name) oldName = existingPlayer.name;
            }
        }

        // 4. SALVA OU ATUALIZA NO FIREBASE
        if (id) {
            await updateDoc(doc(playersRef, id), playerData);
            
            // Se tinha uma foto antiga DE CADASTRO MANUAL (sem e-mail anterior) 
            // e ela é diferente da nova, apaga a velha do Storage para poupar espaço
            if (oldPhotoUrl && oldPhotoUrl !== newPhotoUrl && !oldEmail) {
                await deletePhotoFromStorage(oldPhotoUrl);
            }
            
            // ATUALIZA O NOME NAS EQUIPES SORTEADAS
            state.drawnTeams.forEach(async team => {
                let updated = false;
                const newPlayers = team.players.map(p => {
                    if (p.id === id) {
                        updated = true;
                        return { ...p, ...playerData };
                    }
                    return p;
                });
                if (updated) {
                    await updateDoc(doc(teamsRef, team.id), { players: newPlayers });
                }
            });

            // ATUALIZA O NOME NO HISTÓRICO DE PARTIDAS
            if (oldName && oldName !== name) {
                state.matchHistory.forEach(async m => {
                    let mUpdated = false;
                    let t1Players = m.team1.players ? [...m.team1.players] : [];
                    let t2Players = m.team2.players ? [...m.team2.players] : [];
                    
                    const updateArray = (arr) => {
                        let changed = false;
                        for (let i=0; i<arr.length; i++) {
                            if (arr[i] === oldName) {
                                arr[i] = name;
                                changed = true;
                                mUpdated = true;
                            }
                        }
                        return changed;
                    };
                    
                    updateArray(t1Players);
                    updateArray(t2Players);
                    
                    if (mUpdated) {
                        await updateDoc(doc(matchHistoryRef, m.id), {
                            "team1.players": t1Players,
                            "team2.players": t2Players
                        });
                    }
                });
            }
            
            showToast("Atleta atualizado!");
        } else {
            playerData.streak = 0;
            await addDoc(playersRef, playerData);
            showToast("Novo atleta cadastrado!"); 
        }
        
        // 5. VINCULA OU DESVINCULA O JOGADOR NO GRUPO GLOBAL
        if (state.currentGroupId) {
            const groupDocRef = doc(db, 'groups', state.currentGroupId);
            
            if (mode === 'email' && email) {
                await updateDoc(groupDocRef, { memberEmails: arrayUnion(email) });
            } else if (mode === 'manual' && oldEmail) {
                // Se mudou de e-mail para manual, remove o e-mail antigo da lista de acesso do grupo
                await updateDoc(groupDocRef, { memberEmails: arrayRemove(oldEmail) });
            }
        }

        // 6. LIMPEZA TOTAL DO FORMULÁRIO (Evita o vazamento da foto para o próximo cadastro)
        const photoDataInput = document.getElementById('photoData');
        if(photoDataInput) photoDataInput.value = ''; 
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
        showToast(e.message || "Erro ao salvar atleta", "error"); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = "<i data-lucide='save' class='w-4 h-4'></i> SALVAR"; 
        if (typeof lucide !== 'undefined') lucide.createIcons(); 
    }
};

export const deletePlayer = (id) => {
    openConfirmModal("Excluir Atleta", "Tem a certeza que deseja remover este atleta do grupo?", async () => { 
        try {
            const playerInfo = state.players.find(p => p.id === id);
            if (!playerInfo) return;

            const photoUrlToDelete = playerInfo.photo;
            const playerEmail = playerInfo.email;

            // 1. Deleta o jogador da subcoleção do grupo
            await deleteDoc(doc(playersRef, id)); 

            // 2. Se era um jogador manual (SEM E-MAIL vinculado), deletamos a foto física do Storage
            if (!playerEmail && photoUrlToDelete) {
                await deletePhotoFromStorage(photoUrlToDelete);
            }

            // 3. Se tinha e-mail vinculado, NÃO apagamos a foto global, apenas removemos o acesso dele ao grupo
            if (playerEmail && state.currentGroupId) {
                const groupDocRef = doc(db, 'groups', state.currentGroupId);
                const { arrayRemove } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
                await updateDoc(groupDocRef, {
                    memberEmails: arrayRemove(playerEmail)
                });
            }

            showToast("Atleta removido do grupo."); 
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