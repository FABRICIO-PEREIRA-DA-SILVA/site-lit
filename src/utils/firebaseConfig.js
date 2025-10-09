   // src/utils/firebaseConfig.js
   import { initializeApp } from 'firebase/app';
   import { getAuth } from 'firebase/auth';
   import { getFirestore } from 'firebase/firestore';
   import { getStorage } from 'firebase/storage';

   const firebaseConfig = {
    apiKey: "AIzaSyBsrLrPdlZRdfqb47ALbueIBnTVHJ0f-bU",
    authDomain: "boletim-visitas.firebaseapp.com",
    projectId: "boletim-visitas",
    storageBucket: "boletim-visitas.firebasestorage.app",
    messagingSenderId: "731728494304",
    appId: "1:731728494304:web:1880c5645ee11f81e99a85"
    };


   const app = initializeApp(firebaseConfig);
   export const auth = getAuth(app);
   export const db = getFirestore(app);
   export const storage = getStorage(app);
