import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';
import { state } from './state.js';

/**
 * Realiza o login real no Firebase.
 * Substitui a verificação manual de "admin/12345".
 */
export const loginAdmin = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // O Firebase gerencia o estado da sessão automaticamente
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Erro na autenticação:", error.code);
        let message = "Erro ao entrar.";
        
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            message = "E-mail ou senha incorretos.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Formato de e-mail inválido.";
        }
        
        return { success: false, message };
    }
};

/**
 * Encerra a sessão do usuário.
 */
export const logoutAdmin = async () => {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, message: "Erro ao sair." };
    }
};

/**
 * Observador de estado de autenticação.
 * Este é o "coração" da segurança no frontend. Ele deteta se o 
 * utilizador está logado e atualiza o estado global.
 */
export const initAuthObserver = (callback) => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Verifica se o UID do utilizador logado coincide com o seu UID de Admin
            // (Isso impede que outros utilizadores logados via e-mail virem admins)
            const ADMIN_UID = "lDvT8onqvthNuycl1npALGbjvl12";
            
            state.isAuthenticated = (user.uid === ADMIN_UID);
            state.user = user;
        } else {
            state.isAuthenticated = false;
            state.user = null;
        }
        
        if (callback) callback(state.isAuthenticated);
    });
};