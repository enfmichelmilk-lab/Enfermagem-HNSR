/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Activity, Users, Stethoscope, CalendarCheck, UserCog, 
  LogOut, HeartHandshake, Palmtree, Award, ClipboardCheck, 
  Smartphone, X, Pin, GraduationCap
} from 'lucide-react';
import { Usuario } from '../types';
import HapvidaLogo from './HapvidaLogo';

interface SidebarProps {
  usuario: Usuario;
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
}

export default function Sidebar({ 
  usuario, 
  activeView, 
  onNavigate, 
  onLogout,
  isCollapsed,
  onToggleCollapse,
  isMobile,
  mobileMenuOpen,
  onCloseMobileMenu
}: SidebarProps) {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstalled, setIsInstalled] = React.useState<boolean>(false);
  const [showGuide, setShowGuide] = React.useState<boolean>(false);

  React.useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check if running in standalone window display mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  // Access check rule from JS.html
  const isAuthorizedAdmin = () => {
    const perfil = usuario.perfil ? usuario.perfil.toLowerCase() : "";
    const authList = ["supervisor(a)", "supervisor", "coordenador(a)", "coordenador", "gerente", "adm", "administrador", "programador"];
    return authList.some(role => perfil.includes(role));
  };

  const isEnfermeiroProfile = () => {
    const perfil = usuario.perfil ? usuario.perfil.toLowerCase() : "";
    return perfil === "enfermeiro(a)" || perfil === "enfermeiro" || perfil === "enfermeira";
  };

  const [isHovered, setIsHovered] = React.useState<boolean>(false);
  const showExpanded = isMobile ? true : (!isCollapsed || isHovered);
  const isSidebarCollapsed = !showExpanded;

  return (
    <nav 
      onMouseEnter={() => isCollapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed top-0 bottom-0 left-0 h-screen bg-white border-r border-slate-200 flex flex-col text-slate-800 font-sans transition-all duration-300
        ${isMobile 
          ? `z-50 w-64 ${mobileMenuOpen ? 'translate-x-0 opacity-100 visible' : '-translate-x-full pointer-events-none opacity-0 invisible'} shadow-2xl` 
          : `z-30 ${isCollapsed ? (isHovered ? 'w-64 shadow-2xl z-40' : 'w-20') : 'w-64'}`
        }
      `}
    >
      
      {/* Branding Header */}
      <div className={`p-4 border-b border-slate-100 flex flex-col gap-1.5 justify-center relative ${isSidebarCollapsed ? 'items-center px-1' : ''}`}>
        {isMobile && mobileMenuOpen && (
          <button
            onClick={onCloseMobileMenu}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            title="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <HapvidaLogo showText={!isSidebarCollapsed} textSize={isSidebarCollapsed ? "sm" : "lg"} animated={true} />
        {!isSidebarCollapsed && (
          <span className="text-[7.5px] text-slate-400 font-extrabold uppercase tracking-widest block pl-1">SISTEMA INTEGRADO DE ESCALAS</span>
        )}
      </div>

      {/* Logged in User Section */}
      <div className={`mx-3 my-4 p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center transition-all duration-350 ${isSidebarCollapsed ? 'flex-col gap-1 text-center py-3' : 'gap-3'}`}>
        <div 
          className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold border-2 border-white shadow-inner shrink-0"
          title={isSidebarCollapsed ? usuario.nome : undefined}
        >
          {usuario.nome ? usuario.nome.charAt(0).toUpperCase() : '?'}
        </div>
        {!isSidebarCollapsed ? (
          <div className="overflow-hidden flex-1 mini-profile-text">
            <span className="text-slate-800 font-extrabold text-[11px] block truncate leading-tight" title={usuario.nome}>
              {usuario.nome}
            </span>
            <span className="text-[8px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider inline-block mt-0.5 border border-sky-100">
              {usuario.perfil}
            </span>
          </div>
        ) : (
          <span className="text-[7px] text-slate-400 font-black uppercase text-center mt-0.5 tracking-tighter">
            {usuario.perfil ? usuario.perfil.substring(0, 4) : ''}
          </span>
        )}
      </div>

      {/* Main Navigation Links */}
      <ul className={`flex-1 px-2.5 space-y-1.5 overflow-y-auto ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
        
        {!isEnfermeiroProfile() && (
          <li>
            <button
              onClick={() => onNavigate('dashboard')}
              title={isSidebarCollapsed ? 'Dashboard' : undefined}
              className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
                isSidebarCollapsed 
                  ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                  : 'py-2.5 px-3.5 text-left'
              } ${
                activeView === 'dashboard'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Activity className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span>Dashboard</span>}
            </button>
          </li>
        )}

        <li>
          <button
            onClick={() => onNavigate('colaboradores')}
            title={isSidebarCollapsed ? 'Colaboradores' : undefined}
            className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
              isSidebarCollapsed 
                ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                : 'py-2.5 px-3.5 text-left'
            } ${
              activeView === 'colaboradores'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span>Colaboradores</span>}
          </button>
        </li>

        {!isEnfermeiroProfile() && (
          <li>
            <button
              onClick={() => onNavigate('absenteismo')}
              title={isSidebarCollapsed ? 'Absenteísmo' : undefined}
              className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
                isSidebarCollapsed 
                  ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                  : 'py-2.5 px-3.5 text-left'
              } ${
                activeView === 'absenteismo'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Stethoscope className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span>Absenteísmo</span>}
            </button>
          </li>
        )}

        <li>
          <button
            onClick={() => onNavigate('chamada')}
            title={isSidebarCollapsed ? 'Chamada Diária' : undefined}
            className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
              isSidebarCollapsed 
                ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                : 'py-2.5 px-3.5 text-left'
            } ${
              activeView === 'chamada'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className={`w-4 h-4 shrink-0 ${activeView === 'chamada' ? 'text-white' : 'text-emerald-500'}`} />
            {!isSidebarCollapsed && <span>Chamada Diária</span>}
          </button>
        </li>

        <li>
          <button
            onClick={() => onNavigate('folgas')}
            title={isSidebarCollapsed ? 'Solicitar Folga' : undefined}
            className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
              isSidebarCollapsed 
                ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                : 'py-2.5 px-3.5 text-left'
            } ${
              activeView === 'folgas'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <CalendarCheck className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span>Solicitar Folga</span>}
          </button>
        </li>

        <li>
          <button
            onClick={() => onNavigate('ferias')}
            title={isSidebarCollapsed ? 'Gestão de Férias' : undefined}
            className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
              isSidebarCollapsed 
                ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                : 'py-2.5 px-3.5 text-left'
            } ${
              activeView === 'ferias'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Palmtree className={`w-4 h-4 shrink-0 ${activeView === 'ferias' ? 'text-white' : 'text-amber-500'}`} />
            {!isSidebarCollapsed && <span>Gestão de Férias</span>}
          </button>
        </li>

        <li>
          <button
            onClick={() => onNavigate('comissoes')}
            title={isSidebarCollapsed ? 'Comissões (Selos)' : undefined}
            className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
              isSidebarCollapsed 
                ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                : 'py-2.5 px-3.5 text-left'
            } ${
              activeView === 'comissoes'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Award className={`w-4 h-4 shrink-0 ${activeView === 'comissoes' ? 'text-white' : 'text-indigo-500'}`} />
            {!isSidebarCollapsed && <span>Comissões (Selos)</span>}
          </button>
        </li>

        <li>
          <button
            onClick={() => onNavigate('universidade')}
            title={isSidebarCollapsed ? 'Univ. Corporativa' : undefined}
            className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
              isSidebarCollapsed 
                ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                : 'py-2.5 px-3.5 text-left'
            } ${
              activeView === 'universidade'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <GraduationCap className={`w-4 h-4 shrink-0 ${activeView === 'universidade' ? 'text-white' : 'text-sky-500'}`} />
            {!isSidebarCollapsed && <span>Univ. Corporativa</span>}
          </button>
        </li>

        {/* Conditionally Display Administrator Tab (Only and exclusively to enfmichelmilk@gmail.com) */}
        {usuario.email?.toLowerCase() === 'enfmichelmilk@gmail.com' && (
          <li>
            <button
              onClick={() => onNavigate('usuarios')}
              title={isSidebarCollapsed ? 'Acessos Web' : undefined}
              className={`w-full flex items-center gap-3 transition-all duration-150 rounded-lg text-sm font-semibold cursor-pointer ${
                isSidebarCollapsed 
                  ? 'justify-center p-2.5 h-10 w-10 shrink-0' 
                  : 'py-2.5 px-3.5 text-left'
              } ${
                activeView === 'usuarios'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <UserCog className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span>Acessos Web</span>}
            </button>
          </li>
        )}
      </ul>

      {/* Footer containing support details, collapse toggle, and Logout */}
      <div className={`p-3 border-t border-slate-100 space-y-2.5 ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
        {/* PWA Promotion action hook */}
        {deferredPrompt ? (
          <button
            onClick={handleInstallClick}
            title="Instalar Aplicativo"
            className={`w-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold transition duration-150 shadow-3xs cursor-pointer uppercase tracking-wider animate-pulse ${
              isSidebarCollapsed ? 'p-2.5 h-9 w-9 rounded-lg shrink-0' : 'py-2 px-3 rounded-xl gap-2 text-[9px]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            {!isSidebarCollapsed && <span>Instalar</span>}
          </button>
        ) : (
          !isInstalled && (
            <button
              onClick={() => setShowGuide(true)}
              title="Manual de Instalação no Celular"
              className={`w-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold transition duration-150 border border-slate-200 cursor-pointer uppercase tracking-wider ${
                isSidebarCollapsed ? 'p-2.5 h-9 w-9 rounded-lg shrink-0' : 'py-2 px-3 rounded-xl gap-2 text-[9px]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              {!isSidebarCollapsed && <span>Manual</span>}
            </button>
          )
        )}

        {isInstalled && (
          <div 
            title="Executando em modo PWA"
            className={`text-emerald-750 bg-emerald-50 border border-emerald-150 font-black text-center uppercase tracking-wider ${
              isSidebarCollapsed ? 'w-8 h-8 rounded-lg flex items-center justify-center text-[7px] font-extrabold' : 'text-[8px] py-1 px-2 rounded-lg'
            }`}
          >
            {isSidebarCollapsed ? "⚡" : "⚡ App HNSR"}
          </div>
        )}

        {/* Support element */}
        {!isSidebarCollapsed ? (
          <div className="text-[9px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center leading-normal">
            <HeartHandshake className="w-4 h-4 text-sky-500 mx-auto mb-1" />
            <span className="font-bold block text-slate-500">Milk Sistemas</span>
            Suporte: <a href="mailto:enfmichelmilk@gmail.com" className="text-sky-600 font-semibold hover:underline">Michel Milk</a>
          </div>
        ) : (
          <a 
            href="mailto:enfmichelmilk@gmail.com" 
            title="Desenvolvido por Michel Milk - Milk Sistemas" 
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-sky-600 transition duration-150 cursor-pointer"
          >
            <HeartHandshake className="w-4.5 h-4.5 text-sky-500" />
          </a>
        )}

        {/* Pin/Unpin Toggle Button (Only visible on desktop/iPad landscape when expanded) */}
        {!isMobile && !isSidebarCollapsed && (
          <button
            onClick={onToggleCollapse}
            className={`w-full flex items-center justify-center transition-all duration-200 border rounded-xl cursor-pointer py-2 px-3 gap-2
              ${isCollapsed 
                ? 'bg-sky-50 border-sky-100 text-sky-700 hover:bg-sky-100 hover:border-sky-200 text-[10px] font-extrabold uppercase tracking-wider animate-pulse' 
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 text-[10px] font-bold uppercase tracking-wider'
              }
            `}
            title={isCollapsed ? "Fixar Menu (manter sempre aberto)" : "Deixar Retrátil (recolher automaticamente)"}
          >
            <Pin className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isCollapsed ? 'rotate-45 text-slate-400' : 'text-sky-600'}`} />
            <span>{isCollapsed ? "Fixar Menu" : "Desafixar Menu"}</span>
          </button>
        )}
        
        <button
          onClick={onLogout}
          title="Encerrar Sessão"
          className={`flex items-center text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors font-bold cursor-pointer ${
            isSidebarCollapsed 
              ? 'justify-center p-2.5 h-10 w-10 rounded-lg shrink-0' 
              : 'w-full gap-3 py-2 px-3 rounded-lg text-xs text-left'
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && <span>Sair</span>}
        </button>
      </div>

      {/* PWA Help Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-55 p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="p-4 bg-slate-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sky-400" />
                <span className="font-extrabold text-xs uppercase tracking-wide">Manual de Instalação</span>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 font-medium leading-relaxed">
                Você pode instalar este painel de monitoramento como um aplicativo exclusivo no seu celular ou tablet! Ele funcionará em tela cheia, sem as barras do navegador.
              </p>
              
              <div className="space-y-3.5">
                {/* iOS Instructions */}
                <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1.5 font-black text-slate-850 uppercase text-[10px] tracking-wider text-sky-700">
                    <span>📱 No iPhone / iPad (Safari)</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-slate-600 font-semibold leading-relaxed">
                    <li>Toque no botão de <strong className="text-slate-800 font-extrabold">Compartilhar</strong> (ícone de retângulo com uma seta para cima 📤).</li>
                    <li>Role as opções disponíveis para baixo e toque em <strong className="text-slate-800 font-extrabold">"Adicionar à Tela de Início"</strong> (ícone ➕).</li>
                    <li>Toque em <strong className="text-sky-700 font-extrabold">"Adicionar"</strong> no canto superior direito para confirmar.</li>
                  </ol>
                </div>

                {/* Android Instructions */}
                <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1.5 font-black text-slate-850 uppercase text-[10px] tracking-wider text-emerald-700">
                    <span>🤖 No Android (Chrome / Edge)</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-slate-600 font-semibold leading-relaxed">
                    <li>Toque nos <strong className="text-slate-800 font-extrabold">três pontinhos</strong> (⫶) no canto superior direito do navegador.</li>
                    <li>Selecione <strong className="text-slate-800 font-extrabold">"Instalar aplicativo"</strong> ou <strong className="text-slate-800 font-extrabold">"Adicionar à tela inicial"</strong>.</li>
                    <li>Confirme tocando em <strong className="text-emerald-700 font-extrabold">"Instalar"</strong>.</li>
                  </ol>
                </div>
              </div>

              <button
                onClick={() => setShowGuide(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-950 text-white font-extrabold rounded-xl text-[10px] uppercase tracking-wider transition cursor-pointer text-center"
              >
                Concluir e fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
