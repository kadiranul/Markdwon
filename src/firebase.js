// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyCN0UBQqD_jdV_ca7630nLmF6-NDtdCszY",
  authDomain: "markdown-95cdd.firebaseapp.com",
  databaseURL: "https://markdown-95cdd-default-rtdb.firebaseio.com",
  projectId: "markdown-95cdd",
  storageBucket: "markdown-95cdd.firebasestorage.app",
  messagingSenderId: "721409164560",
  appId: "1:721409164560:web:cda03e2517dc18148a1195",
  measurementId: "G-09RMX1K683"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { db, analytics }; 