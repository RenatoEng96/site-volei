import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAkZD_lIj7P1rMNdFYUciAppb6TqZ4dyVQ",
    authDomain: "testes-site-volei.firebaseapp.com",
    projectId: "testes-site-volei",
    storageBucket: "testes-site-volei.firebasestorage.app",
    messagingSenderId: "381521124753",
    appId: "1:381521124753:web:d1bbb4e5a5f574116cce30",
    measurementId: "G-1Q5TTB0FQ5"
};

export const appId = 'app-volei-teste';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
export const teamsRef = collection(db, 'artifacts', appId, 'public', 'data', 'teams');
export const matchHistoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'matchHistory');
export const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');

export { signInAnonymously, onAuthStateChanged, doc, setDoc, collection, onSnapshot, deleteDoc, addDoc, updateDoc };