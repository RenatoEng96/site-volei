/**
 * js/main.js
 * * Ponto de entrada principal da aplicação TimeCerto.
 * Este ficheiro importa todos os módulos necessários para o funcionamento do site.
 * Como usamos "type=module" no HTML, basta importar os ficheiros para que o seu 
 * código seja executado e as funções anexadas ao "window" fiquem disponíveis.
 */

// 1. Inicializa o Firebase e exporta referências
import './firebase.js';

// 2. Cria o estado global da aplicação
import './state.js';

// 3. Carrega as funções visuais (renderizações, modais, toasts)
import './ui.js';

// 4. Carrega as regras de negócio (sorteios, pontuações, placar)
import './logic.js';

// 5. Carrega o painel administrativo, CRUD e Sincronização em tempo real
import './admin.js';

// (Opcional) Log de inicialização para garantir que tudo carregou
document.addEventListener('DOMContentLoaded', () => {
    console.log("🏐 TimeCerto: Todos os módulos foram carregados com sucesso!");
});