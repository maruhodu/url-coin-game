// [js/firebase-config.js]
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged,
    createUserWithEmailAndPassword, // [필수] 추가됨
    signInWithEmailAndPassword,      // [필수] 추가됨
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    onSnapshot, 
    getDocs, 
    collection,
    query,
    where,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


const firebaseConfig = {
    apiKey: "AIzaSyA_nnU0BHoqSxkThsueohCRhroBTCqc9Zk",
    authDomain: "url-coin-game.firebaseapp.com",
    projectId: "url-coin-game",
    storageBucket: "url-coin-game.firebasestorage.app",
    messagingSenderId: "178821151004",
    appId: "1:178821151004:web:cbf50191c7e6f044e0a2d9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// 모든 기능을 한 번에 export
export { 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, // [중요] 내보내기 필수
    signInWithEmailAndPassword,     // [중요] 내보내기 필수
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    onSnapshot,
    getDocs,
    collection,
    query,
    where,
    deleteDoc,
    deleteUser
};

console.log("Firebase Config Loaded");