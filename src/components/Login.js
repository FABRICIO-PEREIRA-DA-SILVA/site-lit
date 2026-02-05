// src/components/Login.js
import React, { useState } from 'react';
// 1. ADICIONAMOS O sendPasswordResetEmail AQUI NA IMPORTAÇÃO
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../utils/firebaseConfig';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // 2. ESTADO PARA MENSAGEM DE SUCESSO (E-mail enviado)
  const [message, setMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setMessage(''); // Limpa mensagem de sucesso se tentar logar
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // O onAuthStateChanged no App.js vai cuidar do redirecionamento
    } catch (err) {
      setError('Falha no login. Verifique seu e-mail e senha.');
      console.error(err);
    }
  };

  // 3. NOVA FUNÇÃO PARA REDEFINIR SENHA
  const handleResetPassword = async () => {
    if (!email) {
      setError('Por favor, digite seu e-mail no campo acima para redefinir a senha.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setError(''); // Limpa erros antigos
      setMessage('E-mail de redefinição enviado! Verifique sua caixa de entrada (e spam).');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('E-mail não cadastrado.');
      } else if (err.code === 'auth/invalid-email') {
        setError('E-mail inválido.');
      } else {
        setError('Erro ao enviar e-mail. Tente novamente.');
      }
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Painel de Controle</h2>
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Digite seu e-mail"
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">Senha</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Digite sua senha"
            />
          </div>

          {/* MENSAGENS DE ERRO E SUCESSO */}
          {error && <p className="error-message" style={{ color: 'red', fontSize: '14px' }}>{error}</p>}
          {message && <p className="success-message" style={{ color: 'green', fontSize: '14px' }}>{message}</p>}

          <button type="submit" className="login-button">Entrar</button>

          {/* 4. BOTÃO DE ESQUECI MINHA SENHA */}
          <button 
            type="button" 
            onClick={handleResetPassword} 
            className="forgot-password-button"
            style={{
              background: 'none',
              border: 'none',
              color: '#007bff',
              textDecoration: 'underline',
              cursor: 'pointer',
              marginTop: '15px',
              fontSize: '14px',
              width: '100%'
            }}
          >
            Esqueci minha senha
          </button>

        </form>
      </div>
    </div>
  );
}

export default Login;
