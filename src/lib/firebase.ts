import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBQn69HSj_p3K1FTpPiBZMgHlbj5MnnWg0",
  authDomain: "coinzo-1a2a8.firebaseapp.com",
  databaseURL: "https://coinzo-1a2a8-default-rtdb.firebaseio.com",
  projectId: "coinzo-1a2a8",
  storageBucket: "coinzo-1a2a8.firebasestorage.app",
  messagingSenderId: "655863310444",
  appId: "1:655863310444:web:eecf7db53e38bbbd8f5049",
  measurementId: "G-38422J73NZ",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
