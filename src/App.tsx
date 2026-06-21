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
import { Usuario, Colaborador, Absenteismo, SolicitacaoFolga, Ferias, Chamada } from './types';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import ColaboradoresView from './components/ColaboradoresView';
import AbsenteismoView from './components/AbsenteismoView';
import FolgasView from './components/FolgasView';
import UsuariosView from './components/UsuariosView';
import FeriasView from './components/FeriasView';
import ComissoesView from './components/ComissoesView';
import ChamadaView from './components/ChamadaView';
import { subscribeCollection, saveDocument, removeDocument } from './lib/firebase';

export default function App() {
  // 1. Unified State engines with intelligent Local Persistence mirroring Sheets database
  const [usuarioLogado, setUsuarioLogado] = useState<Usuario | null>(null);
  const [activeView, setActiveView] = useState<string>('dashboard');

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [absenteismo, setAbsenteismo] = useState<Absenteismo[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoFolga[]>([]);
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [dynamicSelos, setDynamicSelos] = useState<string[]>([]);
  const [chamadas, setChamadas] = useState<Chamada[]>([]);

  // Responsive Sidebar collapsible states
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 2. Real-Time Firestore Synchronization Subscriptions on Mount
  useEffect(() => {
    const unsub1 = subscribeCollection<Usuario>(
      'usuarios',
      async (data) => {
        // Automatically cleanup and deduplicate programador profiles in Firestore & Local storage
        const targetEmail = 'enfmichelmilk@gmail.com';
        const progUsers = data.filter(u => u.email?.toLowerCase() === targetEmail);
        
        // Identify if profiles need deletion (i.e. duplicates or incorrect casing/values)
        const needsCorrection = progUsers.length > 1 || 
          (progUsers.length === 1 && (
            progUsers[0].senha !== '@M05G05l9' || 
            progUsers[0].perfil !== 'Programador' || 
            progUsers[0].status !== 'Ativo' ||
            progUsers[0].email !== targetEmail
          ));

        if (needsCorrection) {
          console.log("[Autocorrect] Found duplicate, outdated, or misconfigured developer credentials. Rebuilding cleanly...");
          
          // Delete all occurrences of this email from Firestore
          for (const u of data) {
            if (u.email && u.email.toLowerCase() === targetEmail) {
              const docId = (u as any).id || u.email;
              if (docId) {
                await removeDocument('usuarios', docId);
              }
            }
          }
          
          // Re-create a single clean true Programmer profile under correct lowercase id
          const cleanModel: Usuario = {
            nome: "Enf. Michel Milk",
            email: targetEmail,
            setor: "Gestão",
            perfil: "Programador",
            status: "Ativo",
            senha: "@M05G05l9"
          };
          await saveDocument('usuarios', targetEmail, cleanModel);
          return;
        }

        if (progUsers.length === 0) {
          const cleanModel: Usuario = {
            nome: "Enf. Michel Milk",
            email: targetEmail,
            setor: "Gestão",
            perfil: "Programador",
            status: "Ativo",
            senha: "@M05G05l9"
          };
          await saveDocument('usuarios', targetEmail, cleanModel);
          return;
        }

        setUsuarios(data.map(u => ({ ...u, setor: mapSector(u.setor) })));
      },
      'hnsr_usuarios_db',
      USUARIOS_INICIAIS
    );

    const unsub2 = subscribeCollection<Colaborador>(
      'colaboradores',
      (data) => {
        // Detect and automatically clean up any corrupted profiles without a valid matricula
        const invalidColabs = data.filter(c => !c.matricula || c.matricula.trim() === "");
        if (invalidColabs.length > 0) {
          console.log("[Seeding/Sync] Auto-cleaning invalid/empty-matricula collaborators:", invalidColabs);
          invalidColabs.forEach(async (c) => {
            const docId = (c as any).id || c.email || c.matricula;
            if (docId) {
              await removeDocument('colaboradores', docId);
            }
          });
          const cleanData = data.filter(c => c.matricula && c.matricula.trim() !== "");
          setColaboradores(cleanData.map(c => ({ ...c, setor: mapSector(c.setor) })));
          localStorage.setItem('hnsr_colaboradores_db', JSON.stringify(cleanData));
        } else {
          setColaboradores(data.map(c => ({ ...c, setor: mapSector(c.setor) })));
        }
      },
      'hnsr_colaboradores_db',
      COLABORADORES_INICIAIS
    );

    const unsub3 = subscribeCollection<Absenteismo>(
      'absenteismo',
      (data) => {
        setAbsenteismo(data.map(a => ({ ...a, setor: mapSector(a.setor) })));
      },
      'hnsr_absenteismo_db',
      ABSENTEISMO_INICIAL
    );

    const unsub4 = subscribeCollection<SolicitacaoFolga>(
      'solicitacoes',
      (data) => {
        setSolicitacoes(data);
      },
      'hnsr_solicitacoes_db',
      SOLICITACOES_FOLGA_INICIAL
    );

    const unsub5 = subscribeCollection<Ferias>(
      'ferias',
      (data) => {
        setFerias(data);
      },
      'hnsr_ferias_db',
      []
    );

    const unsub6 = subscribeCollection<any>(
      'dynamic_selos',
      (data) => {
        setDynamicSelos(data.map(item => item.id));
      },
      'hnsr_dynamic_selos',
      []
    );

    const unsub7 = subscribeCollection<Chamada>(
      'chamadas',
      (data) => {
        const sorted = [...data].sort((a, b) => {
          const dateCompare = b.data.localeCompare(a.data);
          if (dateCompare !== 0) return dateCompare;
          return (b.dataCriacao || '').localeCompare(a.dataCriacao || '');
        });
        setChamadas(sorted);
      },
      'hnsr_chamadas_db',
      []
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      unsub7();
    };
  }, []);

  // 3. Custom Sync Handler hooks filtering mutations and synchronizing up to Firestore
  const handleUpdateUsuarios = async (val: React.SetStateAction<Usuario[]>) => {
    const nextList = typeof val === 'function' ? (val as Function)(usuarios) : val;
    for (const item of nextList) {
      const match = usuarios.find(u => u.email === item.email);
      if (!match || JSON.stringify(match) !== JSON.stringify(item)) {
        await saveDocument('usuarios', item.email, item);
      }
    }
    for (const item of usuarios) {
      if (!nextList.some((n: any) => n.email === item.email)) {
        await removeDocument('usuarios', item.email);
      }
    }
    setUsuarios(nextList);
    localStorage.setItem('hnsr_usuarios_db', JSON.stringify(nextList));
  };

  const handleUpdateColaboradores = async (val: React.SetStateAction<Colaborador[]>) => {
    const nextList = typeof val === 'function' ? (val as Function)(colaboradores) : val;
    for (const item of nextList) {
      const match = colaboradores.find(c => 
        (c.matricula && item.matricula && c.matricula === item.matricula) ||
        ((c as any).id && (item as any).id && (c as any).id === (item as any).id)
      );
      if (!match || JSON.stringify(match) !== JSON.stringify(item)) {
        const docId = item.matricula || (item as any).id || item.email;
        if (docId) {
          await saveDocument('colaboradores', docId, item);
        }
      }
    }
    for (const item of colaboradores) {
      const isStillPresent = nextList.some((n: any) => 
        (n.matricula && item.matricula && n.matricula === item.matricula) ||
        (n.id && (item as any).id && n.id === (item as any).id)
      );
      if (!isStillPresent) {
        const docId = item.matricula || (item as any).id || item.email;
        if (docId) {
          await removeDocument('colaboradores', docId);
        }
      }
    }
    setColaboradores(nextList);
    localStorage.setItem('hnsr_colaboradores_db', JSON.stringify(nextList));
  };

  const handleUpdateAbsenteismo = async (val: React.SetStateAction<Absenteismo[]>) => {
    const nextList = typeof val === 'function' ? (val as Function)(absenteismo) : val;
    for (const item of nextList) {
      const match = absenteismo.find(a => a.id === item.id);
      if (!match || JSON.stringify(match) !== JSON.stringify(item)) {
        await saveDocument('absenteismo', item.id, item);
      }
    }
    for (const item of absenteismo) {
      if (!nextList.some((n: any) => n.id === item.id)) {
        await removeDocument('absenteismo', item.id);
      }
    }
    setAbsenteismo(nextList);
    localStorage.setItem('hnsr_absenteismo_db', JSON.stringify(nextList));
  };

  const handleUpdateSolicitacoes = async (val: React.SetStateAction<SolicitacaoFolga[]>) => {
    const nextList = typeof val === 'function' ? (val as Function)(solicitacoes) : val;
    for (const item of nextList) {
      const match = solicitacoes.find(s => s.id === item.id);
      if (!match || JSON.stringify(match) !== JSON.stringify(item)) {
        await saveDocument('solicitacoes', item.id, item);
      }
    }
    for (const item of solicitacoes) {
      if (!nextList.some((n: any) => n.id === item.id)) {
        await removeDocument('solicitacoes', item.id);
      }
    }
    setSolicitacoes(nextList);
    localStorage.setItem('hnsr_solicitacoes_db', JSON.stringify(nextList));
  };

  const handleUpdateFerias = async (val: React.SetStateAction<Ferias[]>) => {
    const nextList = typeof val === 'function' ? (val as Function)(ferias) : val;
    for (const item of nextList) {
      const match = ferias.find(f => f.id === item.id);
      if (!match || JSON.stringify(match) !== JSON.stringify(item)) {
        await saveDocument('ferias', item.id, item);
      }
    }
    for (const item of ferias) {
      if (!nextList.some((n: any) => n.id === item.id)) {
        await removeDocument('ferias', item.id);
      }
    }
    setFerias(nextList);
    localStorage.setItem('hnsr_ferias_db', JSON.stringify(nextList));
  };

  const handleUpdateDynamicSelos = async (val: React.SetStateAction<string[]>) => {
    const nextList = typeof val === 'function' ? (val as Function)(dynamicSelos) : val;
    for (const item of nextList) {
      if (!dynamicSelos.includes(item)) {
        await saveDocument('dynamic_selos', item, { id: item, nome: item });
      }
    }
    for (const item of dynamicSelos) {
      if (!nextList.includes(item)) {
        await removeDocument('dynamic_selos', item);
      }
    }
    setDynamicSelos(nextList);
    localStorage.setItem('hnsr_dynamic_selos', JSON.stringify(nextList));
  };

  const handleUpdateChamadas = async (val: React.SetStateAction<Chamada[]>) => {
    const nextList = typeof val === 'function' ? (val as Function)(chamadas) : val;
    const sortedNextList = [...nextList].sort((a, b) => {
      const dateCompare = b.data.localeCompare(a.data);
      if (dateCompare !== 0) return dateCompare;
      return (b.dataCriacao || '').localeCompare(a.dataCriacao || '');
    });

    for (const item of sortedNextList) {
      const match = chamadas.find(c => c.id === item.id);
      if (!match || JSON.stringify(match) !== JSON.stringify(item)) {
        await saveDocument('chamadas', item.id, item);
      }
    }
    for (const item of chamadas) {
      if (!sortedNextList.some((n: any) => n.id === item.id)) {
        await removeDocument('chamadas', item.id);
      }
    }
    setChamadas(sortedNextList);
    localStorage.setItem('hnsr_chamadas_db', JSON.stringify(sortedNextList));
  };

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
    localStorage.removeItem('hnsr_chamadas_db');

    if (mode === 'default') {
      setUsuarios(USUARIOS_INICIAIS);
      setColaboradores(COLABORADORES_INICIAIS);
      setAbsenteismo(ABSENTEISMO_INICIAL);
      setSolicitacoes(SOLICITACOES_FOLGA_INICIAL);
      setFerias([]);
      setDynamicSelos([]);
      setChamadas([]);
    } else {
      setColaboradores([]);
      setAbsenteismo([]);
      setSolicitacoes([]);
      setFerias([]);
      setDynamicSelos([]);
      setChamadas([]);
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
            dynamicSelos={dynamicSelos}
            ferias={ferias}
          />
        );
      case 'colaboradores':
        return (
          <ColaboradoresView 
            colaboradores={colaboradores} 
            absenteismo={absenteismo}
            usuarioLogado={usuarioLogado}
            onUpdateColaboradores={handleUpdateColaboradores}
            ferias={ferias}
            onUpdateFerias={handleUpdateFerias}
            dynamicSelos={dynamicSelos}
            usuarios={usuarios}
            onUpdateUsuarios={handleUpdateUsuarios}
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
            onUpdateAbsenteismo={handleUpdateAbsenteismo}
            usuarioLogado={usuarioLogado}
          />
        );
      case 'chamada':
        return (
          <ChamadaView
            colaboradores={colaboradores}
            absenteismo={absenteismo}
            ferias={ferias}
            solicitacoes={solicitacoes}
            usuarioLogado={usuarioLogado}
            chamadas={chamadas}
            onUpdateChamadas={handleUpdateChamadas}
          />
        );
      case 'folgas':
        return (
          <FolgasView 
            solicitacoes={solicitacoes} 
            colaboradores={colaboradores} 
            absenteismo={absenteismo}
            usuarioLogado={usuarioLogado}
            onUpdateSolicitacoes={handleUpdateSolicitacoes}
            onUpdateColaboradores={handleUpdateColaboradores}
            ferias={ferias}
            chamadas={chamadas}
          />
        );
      case 'ferias':
        return (
          <FeriasView 
            ferias={ferias}
            colaboradores={colaboradores}
            usuarioLogado={usuarioLogado}
            onUpdateFerias={handleUpdateFerias}
          />
        );
      case 'comissoes':
        return (
          <ComissoesView
            colaboradores={colaboradores}
            dynamicSelos={dynamicSelos}
            onUpdateColaboradores={handleUpdateColaboradores}
            onUpdateDynamicSelos={handleUpdateDynamicSelos}
            usuarioLogado={usuarioLogado}
          />
        );
      case 'usuarios':
        if (usuarioLogado?.email?.toLowerCase() !== 'enfmichelmilk@gmail.com') {
          return (
            <div className="p-8 text-center bg-white rounded-2xl border border-rose-100 shadow-sm max-w-lg mx-auto my-12">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-sm font-bold text-slate-800 mt-2">Acesso Restrito</h2>
              <p className="text-xs text-slate-500 mt-1 pb-4 border-b border-slate-150">
                Apenas o Programador (enfmichelmilk@gmail.com) possui permissão para visualizar e gerenciar os acessos web do sistema.
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
          <UsuariosView 
            usuarios={usuarios} 
            usuarioLogado={usuarioLogado}
            onUpdateUsuarios={handleUpdateUsuarios}
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
          onUpdateUsuarios={handleUpdateUsuarios}
        />
      ) : (
        <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans">
          {/* Mobile hamburger header bar */}
          {isMobile && (
            <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-20 shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                  title="Abrir menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <span className="font-extrabold text-sm text-sky-700 uppercase tracking-widest pl-1">
                  HNSR ESCALAS
                </span>
              </div>
              <span className="text-[10px] text-sky-750 bg-sky-50 px-2.5 py-0.5 rounded font-black uppercase border border-sky-100">
                {usuarioLogado.perfil}
              </span>
            </div>
          )}

          {/* Mobile backdrop overlay to close side drawer when clicking outside */}
          {isMobile && mobileMenuOpen && (
            <div 
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-25 transition-opacity duration-200" 
              aria-hidden="true"
            />
          )}

          {/* Main Hospital Sidebar navigation */}
          <Sidebar 
            usuario={usuarioLogado} 
            activeView={activeView} 
            onNavigate={(view) => {
              setActiveView(view);
              setMobileMenuOpen(false);
            }} 
            onLogout={handleLogout}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
            isMobile={isMobile}
            mobileMenuOpen={mobileMenuOpen}
            onCloseMobileMenu={() => setMobileMenuOpen(false)}
          />
          
          {/* Main workspace arena */}
          <main className={`flex-1 transition-all duration-305 p-4 md:p-8 min-h-screen ${isMobile ? 'ml-0 pt-20' : isCollapsed ? 'ml-20' : 'ml-64'}`}>
            <div className="max-w-7xl mx-auto animate-fadeIn pb-12">
              {renderViewContent()}
            </div>
          </main>
        </div>
      )}
    </>
  );
}
