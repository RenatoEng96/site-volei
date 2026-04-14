// js/firebase.js

// 1. Importações do SDK do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 2. Configuração do seu Projeto
const firebaseConfig = {
    apiKey: "AIzaSyCWjwuRy4BVliXYUog-_qy6I8vWEPJBbHk",
    authDomain: "app-volei-34f53.firebaseapp.com",
    projectId: "app-volei-34f53",
    storageBucket: "app-volei-34f53.firebasestorage.app",
    messagingSenderId: "290138844370",
    appId: "1:290138844370:web:19a4c9b36fc8297668d10b"
};

const appId = 'app-volei-34f53'; 

// 3. Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 4. Referências das Coleções Principais
const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
const teamsRef = collection(db, 'artifacts', appId, 'public', 'data', 'teams');

// 5. Exportação de Variáveis e Funções para os outros módulos
export {
    app,
    auth,
    db,
    appId,
    playersRef,
    teamsRef,
    // Re-exportamos as funções do Firestore para que os outros ficheiros não precisem do link CDN
    doc,
    setDoc,
    collection,
    onSnapshot,
    deleteDoc,
    addDoc,
    updateDoc,
    // Autenticação
    signInAnonymously,
    onAuthStateChanged
};