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

export const appId = 'app-volei-34f53'; 

// 3. Inicialização
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 4. Referências das Coleções Principais
export const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
export const teamsRef = collection(db, 'artifacts', appId, 'public', 'data', 'teams');
export const matchHistoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'matchHistory'); // Nova Referência para o histórico

export { doc, setDoc, collection, onSnapshot, deleteDoc, addDoc, updateDoc, signInAnonymously, onAuthStateChanged };