import { state } from '../state.js';
import { db, doc, addDoc, updateDoc, deleteDoc, playersRef, settingsRef, matchHistoryRef } from '../firebase.js';
import { showToast, openConfirmModal, renderSorteioTable } from '../ui.js';

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
// GERENCIAMENTO DE ATLETAS (CRUD)
// ============================================================================

export const savePlayer = async () => {
    const name = document.getElementById('playerName').value.trim();
    const id = document.getElementById('editId').value;
    
    if(!name) {
        return showToast("Preencha o nome do atleta!", "error");
    }
    
    const btn = document.getElementById('btnSave'); 
    btn.disabled = true; 
    btn.innerText = "SALVANDO...";
    
    try {
        // Conforme a melhoria solicitada: Pega o valor exato do input, e não apenas faz incremento
        const elo = Math.max(0, parseInt(document.getElementById('statBonus').value) || 150);
        
        const playerData = { 
            name, 
            categoria: parseInt(document.getElementById('statCategoria').value), 
            partidas: parseInt(document.getElementById('statJogos').value), 
            vitorias: parseInt(document.getElementById('statVit').value), 
            eloRating: elo, 
            icon: document.getElementById('playerIcon').value, 
            photo: document.getElementById('photoData').value,
            updatedAt: Date.now()
        };
        
        if (id) {
            await updateDoc(doc(playersRef, id), playerData);
            showToast("Atleta atualizado!"); 
        } else {
            // Inicializa a streak como 0 para novos jogadores
            playerData.streak = 0;
            await addDoc(playersRef, playerData);
            showToast("Atleta cadastrado!"); 
        }
        
        // Dispara a função global de limpar o formulário
        if (window.resetForm) window.resetForm();
        
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
            await deleteDoc(doc(playersRef, id)); 
            showToast("Atleta removido."); 
        } catch(e) {
            console.error(e);
            showToast("Erro ao excluir", "error");
        }
    });
};