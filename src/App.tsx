/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  USUARIOS_INICIAIS, 
  COLABORADORES_INICIAIS, 
  ABSENTEISMO_INICIAL, 
  SOLICITACOES_FOLGA_INICIAL,
  mapSector
} from './data/mockData';
import { Usuario, Colaborador, Absenteismo, SolicitacaoFolga, Ferias } from './types';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import ColaboradoresView from './components/ColaboradoresView';
import AbsenteismoView from './components/AbsenteismoView';
import FolgasView from './components/FolgasView';
import UsuariosView from './components/UsuariosView';
import FeriasView from './components/FeriasView';
import ComissoesView from './components/ComissoesView';

export default function App() {
  // 1. Unified State engines with intelligent Local Persistence mirroring Sheets database
  const [usuarioLogado, setUsuarioLogado] = useState<Usuario | null>(null);
  const [activeView, setActiveView] = useState<string>('dashboard');

  const [usuarios, setUsuarios] = useState<Usuario[]>(() => {
    const cached = localStorage.getItem('hnsr_usuarios_db');
    const list: Usuario[] = cached ? JSON.parse(cached) : USUARIOS_INICIAIS;
    return list.map(u => ({
      ...u,
      setor: mapSector(u.setor)
    }));
  });

  const [colaboradores, setColaboradores] = useState<Colaborador[]>(() => {
    const cached = localStorage.getItem('hnsr_colaboradores_db');
    const list: Colaborador[] = cached ? JSON.parse(cached) : COLABORADORES_INICIAIS;
    return list.map(c => ({
      ...c,
      setor: mapSector(c.setor)
    }));
  });

  const [absenteismo, setAbsenteismo] = useState<Absenteismo[]>(() => {
    const cached = localStorage.getItem('hnsr_absenteismo_db');
    const list: Absenteismo[] = cached ? JSON.parse(cached) : ABSENTEISMO_INICIAL;
    return list.map(a => ({
      ...a,
      setor: mapSector(a.setor)
    }));
  });

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoFolga[]>(() => {
    const cached = localStorage.getItem('hnsr_solicitacoes_db');
    return cached ? JSON.parse(cached) : SOLICITACOES_FOLGA_INICIAL;
  });

  const [ferias, setFerias] = useState<Ferias[]>(() => {
    const cached = localStorage.getItem('hnsr_ferias_db');
    return cached ? JSON.parse(cached) : [];
  });

  const [dynamicSelos, setDynamicSelos] = useState<string[]>(() => {
    const cached = localStorage.getItem('hnsr_dynamic_selos');
    return cached ? JSON.parse(cached) : [];
  });

  // 2. Local Storage Synchronizations on revisions
  useEffect(() => {
    localStorage.setItem('hnsr_usuarios_db', JSON.stringify(usuarios));
  }, [usuarios]);

  useEffect(() => {
    localStorage.setItem('hnsr_colaboradores_db', JSON.stringify(colaboradores));
  }, [colaboradores]);

  useEffect(() => {
    localStorage.setItem('hnsr_absenteismo_db', JSON.stringify(absenteismo));
  }, [absenteismo]);

  useEffect(() => {
    localStorage.setItem('hnsr_solicitacoes_db', JSON.stringify(solicitacoes));
  }, [solicitacoes]);

  useEffect(() => {
    localStorage.setItem('hnsr_ferias_db', JSON.stringify(ferias));
  }, [ferias]);

  // Check if session keeps active on load
  useEffect(() => {
    const sessionLocal = localStorage.getItem('hnsr_active_session');
    const sessionTemp = sessionStorage.getItem('hnsr_active_session');
    
    if (sessionLocal) {
      setUsuarioLogado(JSON.parse(sessionLocal));
    } else if (sessionTemp) {
      setUsuarioLogado(JSON.parse(sessionTemp));
    }
  }, []);

  // 3. User callbacks
  const handleLoginSuccess = (usuario: Usuario, keepConnected: boolean) => {
    setUsuarioLogado(usuario);
    const pLower = usuario.perfil ? usuario.perfil.toLowerCase() : "";
    const isEnfermeiro = pLower === "enfermeiro(a)" || pLower === "enfermeiro" || pLower === "enfermeira";
    
    if (isEnfermeiro) {
      setActiveView('colaboradores');
    } else {
      setActiveView('dashboard');
    }
    
    if (keepConnected) {
      localStorage.setItem('hnsr_active_session', JSON.stringify(usuario));
    } else {
      sessionStorage.setItem('hnsr_active_session', JSON.stringify(usuario));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hnsr_active_session');
    sessionStorage.removeItem('hnsr_active_session');
    setUsuarioLogado(null);
  };

  const handleResetSystem = (mode: 'default' | 'empty') => {
    localStorage.removeItem('hnsr_usuarios_db');
    localStorage.removeItem('hnsr_colaboradores_db');
    localStorage.removeItem('hnsr_absenteismo_db');
    localStorage.removeItem('hnsr_solicitacoes_db');
    localStorage.removeItem('hnsr_ferias_db');
    localStorage.removeItem('hnsr_dynamic_selos');

    if (mode === 'default') {
      setUsuarios(USUARIOS_INICIAIS);
      setColaboradores(COLABORADORES_INICIAIS);
      setAbsenteismo(ABSENTEISMO_INICIAL);
      setSolicitacoes(SOLICITACOES_FOLGA_INICIAL);
      setFerias([]);
      setDynamicSelos([]);
    } else {
      setColaboradores([]);
      setAbsenteismo([]);
      setSolicitacoes([]);
      setFerias([]);
      setDynamicSelos([]);
      if (usuarioLogado) {
        setUsuarios([usuarioLogado]);
      } else {
        setUsuarios(USUARIOS_INICIAIS);
      }
    }
  };

  // 4. Operational View Dispatcher
  const renderViewContent = () => {
    if (!usuarioLogado) return null;

    const pLower = usuarioLogado.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    const isEnfermeiro = pLower === "enfermeiro(a)" || pLower === "enfermeiro" || pLower === "enfermeira";

    switch (activeView) {
      case 'dashboard':
        if (isEnfermeiro) {
          return (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-100 shadow-sm max-w-lg mx-auto my-12">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-sm font-bold text-slate-800 mt-2">Acesso Restrito ao Dashboard</h2>
              <p className="text-xs text-slate-500 mt-1 pb-4 border-b border-slate-150">
                Profissionais com perfil de Enfermeiro(a) não possuem nível de acesso administrativo para visualizar o Dashboard gerencial consolidado do hospital.
              </p>
              <button 
                onClick={() => setActiveView('colaboradores')}
                className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs transition"
              >
                Voltar para Colaboradores
              </button>
            </div>
          );
        }
        return (
          <DashboardView 
            colaboradores={colaboradores} 
            absenteismo={absenteismo} 
            onNavigate={(view) => setActiveView(view)}
          />
        );
      case 'colaboradores':
        return (
          <ColaboradoresView 
            colaboradores={colaboradores} 
            absenteismo={absenteismo}
            usuarioLogado={usuarioLogado}
            onUpdateColaboradores={setColaboradores}
            ferias={ferias}
            onUpdateFerias={setFerias}
            dynamicSelos={dynamicSelos}
            usuarios={usuarios}
            onUpdateUsuarios={setUsuarios}
          />
        );
      case 'absenteismo':
        if (isEnfermeiro) {
          return (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-100 shadow-sm max-w-lg mx-auto my-12">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-sm font-bold text-slate-800 mt-2">Acesso Restrito ao Absenteísmo</h2>
              <p className="text-xs text-slate-500 mt-1 pb-4 border-b border-slate-150">
                Profissionais com perfil de Enfermeiro(a) não possuem permissão para lançar absenteísmo ou licenças no consolidado geral.
              </p>
              <button 
                onClick={() => setActiveView('colaboradores')}
                className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs transition"
              >
                Voltar para Colaboradores
              </button>
            </div>
          );
        }
        return (
          <AbsenteismoView 
            absenteismo={absenteismo} 
            colaboradores={colaboradores}
            onUpdateAbsenteismo={setAbsenteismo}
          />
        );
      case 'folgas':
        return (
          <FolgasView 
            solicitacoes={solicitacoes} 
            colaboradores={colaboradores} 
            absenteismo={absenteismo}
            usuarioLogado={usuarioLogado}
            onUpdateSolicitacoes={setSolicitacoes}
            onUpdateColaboradores={setColaboradores}
            ferias={ferias}
          />
        );
      case 'ferias':
        return (
          <FeriasView 
            ferias={ferias}
            colaboradores={colaboradores}
            usuarioLogado={usuarioLogado}
            onUpdateFerias={setFerias}
          />
        );
      case 'comissoes':
        return (
          <ComissoesView
            colaboradores={colaboradores}
            dynamicSelos={dynamicSelos}
            onUpdateColaboradores={setColaboradores}
            onUpdateDynamicSelos={setDynamicSelos}
            usuarioLogado={usuarioLogado}
          />
        );
      case 'usuarios':
        return (
          <UsuariosView 
            usuarios={usuarios} 
            usuarioLogado={usuarioLogado}
            onUpdateUsuarios={setUsuarios}
            onResetSystem={handleResetSystem}
          />
        );
      default:
        return (
          <div className="p-8 text-center bg-white rounded-xl border">
            Visualização não localizada no sistema.
          </div>
        );
    }
  };

  return (
    <>
      {!usuarioLogado ? (
        <LoginView 
          usuarios={usuarios} 
          onLoginSuccess={handleLoginSuccess}
          onUpdateUsuarios={setUsuarios}
        />
      ) : (
        <div className="min-h-screen bg-slate-100 flex font-sans">
          {/* Main Hospital Sidebar navigation */}
          <Sidebar 
            usuario={usuarioLogado} 
            activeView={activeView} 
            onNavigate={(view) => setActiveView(view)} 
            onLogout={handleLogout}
          />
          
          {/* Main workspace arena */}
          <main className="flex-1 ml-64 p-8 min-h-screen">
            <div className="max-w-7xl mx-auto animate-fadeIn pb-12">
              {renderViewContent()}
            </div>
          </main>
        </div>
      )}
    </>
  );
}
