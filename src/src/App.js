// src/App.js
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './utils/firebaseConfig';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Adiciona um estado de loading

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // Finaliza o loading após verificar o auth
    });

    // Limpa o listener quando o componente desmontar
    return () => unsubscribe();
  }, []);

  // Mostra uma tela de carregamento enquanto verifica a autenticação
  if (loading) {
    return <div>Carregando...</div>;
  }

  return user ? <Dashboard user={user} /> : <Login />;
}

export default App;
