/**
 * js/main.js
 * Ponto de entrada principal da aplicação TimeCerto.
 * Este ficheiro importa todos os módulos necessários para o funcionamento do site.
 * Como usamos "type=module" no HTML, basta importar os ficheiros para que o seu 
 * código seja executado e as funções anexadas ao "window" fiquem disponíveis.
 */

// 1. Inicializa o Firebase e exporta referências
import './firebase.js';

// 2. Cria o estado global da aplicação e importa-o para ser usado
import { state } from './state.js';

// 3. Carrega as funções visuais e importa as funções necessárias
import { closeConfirmModal, renderAdmin, renderAll } from './ui.js';

// Garante que as funções de renderização estão disponíveis globalmente
// Isto resolve o problema do botão "Selecionar Todos" não atualizar a interface
window.renderAdmin = renderAdmin;
window.renderAll = renderAll;

// 4. Carrega as regras de negócio (sorteios, pontuações, placar)
import './logic.js';

// 5. Carrega o painel administrativo, CRUD e Sincronização em tempo real
import './admin.js';

// (Opcional) Log de inicialização para garantir que tudo carregou
document.addEventListener('DOMContentLoaded', () => {
    console.log("🏐 TimeCerto: Todos os módulos foram carregados com sucesso (Separados)!");
    
    // Garante que o botão de confirmação genérico funciona corretamente
    const btnConfirm = document.getElementById('btnConfirmAction');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            // Executa a função de callback guardada no estado
            if (state && state.confirmActionCallback) {
                state.confirmActionCallback();
            }
            // Fecha o modal após confirmar
            closeConfirmModal();
        });
    }
});