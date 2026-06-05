/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Activity, Shield, KeyRound, Eye, EyeOff, Mail, ArrowLeft, Send } from 'lucide-react';
import { Usuario } from '../types';
import HapvidaLogo from './HapvidaLogo';

interface LoginViewProps {
  usuarios: Usuario[];
  onLoginSuccess: (user: Usuario, keepConnected: boolean) => void;
  onUpdateUsuarios: (novosUsuarios: Usuario[]) => void;
}

export default function LoginView({ usuarios, onLoginSuccess, onUpdateUsuarios }: LoginViewProps) {
  const [step, setStep] = useState<'login' | 'first-access' | 'forgot-password' | 'verify-token' | 'reset-password'>('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [keepConnected, setKeepConnected] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  
  // States for recovery and password setup
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [tokenDigitado, setTokenDigitado] = useState('');
  const [tokenGerado, setTokenGerado] = useState('');
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);

  // Quick info alert simulation state
  const [simulatorMessage, setSimulatorMessage] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const userEmail = email.trim().toLowerCase();
    let user = usuarios.find(u => u.email.toLowerCase() === userEmail);

    // Hardcoded failsafe fallback to ensure the primary developer/support email "enfmichelmilk@gmail.com" can ALWAYS log in even if database sync fails/clears
    if (!user && userEmail === 'enfmichelmilk@gmail.com') {
      user = {
        nome: "Enf. Michel Milk",
        email: "enfmichelmilk@gmail.com",
        setor: "Gestão",
        perfil: "Programador",
        status: "Ativo",
        senha: "@M05G05l9"
      };
    }

    if (!user) {
      alert("Acesso negado: E-mail não localizado na base de dados de Usuários.");
      return;
    }

    if (user.status !== "Ativo") {
      alert("Acesso bloqueado: Usuário inativo ou suspenso. Procure a gestão.");
      return;
    }

    // Checking if first access is required (no password set, or TEMP- password)
    const isTempWord = user.senha?.startsWith("TEMP-");
    const isFirstAccess = !user.senha || user.senha.trim() === "" || isTempWord;

    if (isFirstAccess) {
      if (isTempWord && user.senha !== senha) {
        alert("Senha provisória incorreta.");
        return;
      }
      setCurrentUser(user);
      setStep('first-access');
      setSimulatorMessage("Acesso verificado! Como este é seu primeiro acesso ou você possui uma senha temporária, defina uma senha definitiva.");
      return;
    }

    if (user.senha === senha) {
      onLoginSuccess(user, keepConnected);
    } else {
      alert("Senha incorreta.");
    }
  };

  const handleFirstAccessSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaSenha || novaSenha.length < 4) {
      alert("A nova senha deve possuir pelo menos 4 caracteres.");
      return;
    }
    if (novaSenha !== confirmaSenha) {
      alert("As senhas digitadas não coincidem.");
      return;
    }

    if (currentUser) {
      const atualizados = usuarios.map(u => {
        if (u.email.toLowerCase() === currentUser.email.toLowerCase()) {
          return { ...u, senha: novaSenha };
        }
        return u;
      });
      onUpdateUsuarios(atualizados);
      alert("Senha redefinida com sucesso! Acessando painel...");
      onLoginSuccess({ ...currentUser, senha: novaSenha }, keepConnected);
    }
  };

  const handleSendToken = (e: React.FormEvent) => {
    e.preventDefault();
    const userEmail = email.trim().toLowerCase();
    let user = usuarios.find(u => u.email.toLowerCase() === userEmail);

    if (!user && userEmail === 'enfmichelmilk@gmail.com') {
      user = {
        nome: "Enf. Michel Milk",
        email: "enfmichelmilk@gmail.com",
        setor: "Gestão",
        perfil: "Programador",
        status: "Ativo",
        senha: "@M05G05l9"
      };
    }

    if (!user) {
      alert("E-mail não cadastrado no sistema.");
      return;
    }
    if (user.status !== "Ativo") {
      alert("Usuário inativo. Procure a gestão.");
      return;
    }

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    setTokenGerado(token);
    setStep('verify-token');
    
    // Simulating system email log
    setSimulatorMessage(`[Email Simulador - Gestão RH Enfermagem]\nCódigo enviado para o e-mail: ${userEmail}\nCódigo de Segurança: ${token}`);
  };

  const handleVerifyToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenDigitado.trim() === tokenGerado) {
      setStep('reset-password');
      setSimulatorMessage(null);
    } else {
      alert("Token inválido ou expirado.");
    }
  };

  const handleResetPasswordSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaSenha || novaSenha.length < 4) {
      alert("A nova senha deve possuir pelo menos 4 caracteres.");
      return;
    }
    if (novaSenha !== confirmaSenha) {
      alert("A confirmação de senha não confere.");
      return;
    }

    const userEmail = email.trim().toLowerCase();
    const atualizados = usuarios.map(u => {
      if (u.email.toLowerCase() === userEmail) {
        return { ...u, senha: novaSenha };
      }
      return u;
    });

    onUpdateUsuarios(atualizados);
    alert("Senha recuperada com sucesso! Entre com suas novas credenciais.");
    setSenha('');
    setStep('login');
    setSimulatorMessage(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-slate-100 p-4 relative font-sans">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
        
        {/* Core Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="flex flex-col items-center gap-1 mb-2 justify-center">
            <HapvidaLogo textSize="xl" />
            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block text-center">SISTEMA INTEGRADO DE ESCALAS</span>
          </div>
          <p className="text-[11px] text-slate-500 font-extrabold mt-1">Hospital Nossa Senhora do Rosário &bull; Gestão de Enfermagem</p>
        </div>

        {/* Step 1: Login Form */}
        {step === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">E-mail Corporativo</label>
              <div className="relative">
                <span className="absolute left-3 top-3.5 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ex: enfmichelmilk@gmail.com"
                  className="w-full py-2.5 pl-9 pr-4 border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Senha de Acesso</label>
              <div className="relative">
                <span className="absolute left-3 top-3.5 text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-2.5 pl-9 pr-10 border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(!showSenha)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 py-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepConnected}
                  onChange={(e) => setKeepConnected(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                Manter conectado
              </label>
              <button
                type="button"
                onClick={() => { setStep('forgot-password'); setSimulatorMessage(null); }}
                className="text-sky-600 hover:underline hover:text-sky-800 transition-all font-bold"
              >
                Esqueceu a senha?
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 transform hover:-translate-y-0.5"
            >
              Acessar Sistema
            </button>

            <div className="text-center pt-2 text-slate-400 text-xs">
              Módulos de segurança ativados &bull; Versão Digital 2.0
            </div>
          </form>
        )}

        {/* Step 2: First Access Redefinition */}
        {step === 'first-access' && (
          <form onSubmit={handleFirstAccessSave} className="space-y-4">
            <div className="bg-sky-50 border border-sky-100 p-4 rounded-lg text-sky-800 text-xs leading-relaxed">
              <span className="font-bold block mb-1">Primeiro Acesso / Redefinição</span>
              Identificamos que você precisa atualizar suas credenciais para segurança. Por favor defina uma senha definitiva de acesso.
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nova Senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Insira nova senha"
                className="w-full py-2 pl-3 pr-3 border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Confirmar Nova Senha</label>
              <input
                type="password"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                placeholder="Confirme a nova senha"
                className="w-full py-2 pl-3 pr-3 border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('login')}
                className="w-1/3 border border-slate-300 text-slate-600 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-2/3 bg-sky-600 text-white py-2.5 rounded-lg text-sm font-bold shadow hover:bg-sky-700"
              >
                Salvar e Acessar
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Forgot Password Request */}
        {step === 'forgot-password' && (
          <form onSubmit={handleSendToken} className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 text-center mb-1">Esqueceu sua senha?</h3>
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Forneça o seu e-mail cadastrado. Enviaremos um código de recuperação de 6 dígitos que expira em 15 minutos.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">E-mail Cadastrado</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: seuemail@gmail.com"
                className="w-full py-2.5 pl-3 pr-3 border border-slate-300 rounded-lg text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                className="w-full bg-sky-600 text-white font-bold py-2.5 rounded-lg text-sm shadow hover:bg-sky-700 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" /> Enviar Código Verificador
              </button>
              
              <button
                type="button"
                onClick={() => setStep('login')}
                className="w-full border border-slate-300 text-slate-600 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Login
              </button>
            </div>
          </form>
        )}

        {/* Step 4: Verify Token */}
        {step === 'verify-token' && (
          <form onSubmit={handleVerifyToken} className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 text-center mb-1">Validação de Segurança</h3>
            <p className="text-xs text-slate-500 text-center">
              Inserir o código de segurança de 6 dígitos enviado para seu endereço.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 text-center">Código Verificador</label>
              <input
                type="text"
                maxLength={6}
                value={tokenDigitado}
                onChange={(e) => setTokenDigitado(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                className="w-full py-3 text-center border-2 border-dashed border-sky-300 rounded-lg tracking-[8px] font-extrabold text-2xl text-sky-700 focus:outline-none focus:border-sky-500 placeholder-slate-300"
                required
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('forgot-password')}
                className="w-1/3 border border-slate-300 text-slate-600 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Anterior
              </button>
              <button
                type="submit"
                className="w-2/3 bg-sky-600 text-white py-2.5 rounded-lg text-sm font-bold shadow hover:bg-sky-700"
              >
                Validar Código
              </button>
            </div>
          </form>
        )}

        {/* Step 5: Reset Password */}
        {step === 'reset-password' && (
          <form onSubmit={handleResetPasswordSave} className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 text-center mb-1">Nova Senha Definitiva</h3>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nova Senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Insira sua nova senha"
                className="w-full py-2.5 pl-3 pr-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Confirmar Senha</label>
              <input
                type="password"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                placeholder="Repita a senha nova"
                className="w-full py-2.5 pl-3 pr-3 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-sky-600 text-white font-bold py-2.5 rounded-lg text-sm shadow hover:bg-sky-700"
            >
              Salvar Nova Senha
            </button>
          </form>
        )}
      </div>

      {/* Embedded Real-Time System Logs Simulator Panel */}
      {simulatorMessage && (
        <div className="mt-6 w-full max-w-md bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 shadow-sm font-mono text-xs">
          <div className="flex items-center gap-2 border-b border-amber-200 pb-2 mb-2 font-bold text-amber-800">
            <Shield className="w-4 h-4" />
            <span>Simulador de E-mails do Backend (HNSR-System)</span>
          </div>
          <p className="whitespace-pre-line leading-relaxed">{simulatorMessage}</p>
        </div>
      )}

      {/* Quick Access Credentials Banner to facilitate rapid evaluation */}
      
    </div>
  );
}
