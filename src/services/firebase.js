import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBI4OQNl6W03iUyyNza1br5vjKuiGHRecQ",
  authDomain: "akr-xerox.firebaseapp.com",
  projectId: "akr-xerox",
  storageBucket: "akr-xerox.firebasestorage.app",
  messagingSenderId: "277399943938",
  appId: "1:277399943938:web:a485a891500b2556a0e01b"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;