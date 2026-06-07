/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Activity, Users, Stethoscope, CalendarCheck, UserCog, LogOut, HeartHandshake, Palmtree, Award, ClipboardCheck, Smartphone } from 'lucide-react';
import { Usuario } from '../types';
import HapvidaLogo from './HapvidaLogo';

interface SidebarProps {
  usuario: Usuario;
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

export default function Sidebar({ usuario, activeView, onNavigate, onLogout }: SidebarProps) {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstalled, setIsInstalled] = React.useState<boolean>(false);

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

  return (
    <nav className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 text-slate-800 z-10 font-sans">
      
      {/* Branding Header */}
      <div className="p-4 border-b border-slate-100 flex flex-col gap-1.5 justify-center">
        <HapvidaLogo textSize="lg" animated={true} />
        <span className="text-[7.5px] text-slate-400 font-extrabold uppercase tracking-widest block pl-1">SISTEMA INTEGRADO DE ESCALAS</span>
      </div>

      {/* Logged in User Section */}
      <div className="mx-4 my-4 p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold border-2 border-white shadow-inner">
          {usuario.nome ? usuario.nome.charAt(0).toUpperCase() : '?'}
        </div>
        <div className="overflow-hidden flex-1">
          <span className="text-slate-800 font-bold text-xs block truncate leading-tight" title={usuario.nome}>
            {usuario.nome}
          </span>
          <span className="text-[9px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider inline-block mt-0.5 border border-sky-100">
            {usuario.perfil}
          </span>
        </div>
      </div>

      {/* Main Navigation Links */}
      <ul className="flex-1 px-3 space-y-1.5">
        
        {!isEnfermeiroProfile() && (
          <li>
            <button
              onClick={() => onNavigate('dashboard')}
              className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
                activeView === 'dashboard'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Activity className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </button>
          </li>
        )}

        <li>
          <button
            onClick={() => onNavigate('colaboradores')}
            className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
              activeView === 'colaboradores'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Colaboradores</span>
          </button>
        </li>

        {!isEnfermeiroProfile() && (
          <li>
            <button
              onClick={() => onNavigate('absenteismo')}
              className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
                activeView === 'absenteismo'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Stethoscope className="w-4 h-4 shrink-0" />
              <span>Absenteísmo</span>
            </button>
          </li>
        )}

        <li>
          <button
            onClick={() => onNavigate('chamada')}
            className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
              activeView === 'chamada'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>Chamada Diária</span>
          </button>
        </li>

        <li>
          <button
            onClick={() => onNavigate('folgas')}
            className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
              activeView === 'folgas'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <CalendarCheck className="w-4 h-4 shrink-0" />
            <span>Solicitar Folga</span>
          </button>
        </li>

        <li>
          <button
            onClick={() => onNavigate('ferias')}
            className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
              activeView === 'ferias'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Palmtree className="w-4 h-4 shrink-0 text-amber-500" />
            <span>Gestão de Férias</span>
          </button>
        </li>

        <li>
          <button
            onClick={() => onNavigate('comissoes')}
            className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
              activeView === 'comissoes'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Award className="w-4 h-4 shrink-0 text-indigo-500" />
            <span>Comissões (Selos)</span>
          </button>
        </li>

        {/* Conditionally Display Administrator Tab (Only and exclusively to enfmichelmilk@gmail.com) */}
        {usuario.email?.toLowerCase() === 'enfmichelmilk@gmail.com' && (
          <li>
            <button
              onClick={() => onNavigate('usuarios')}
              className={`w-full text-left py-2.5 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-all duration-150 ${
                activeView === 'usuarios'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/10'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <UserCog className="w-4 h-4 shrink-0" />
              <span>Acessos Web</span>
            </button>
          </li>
        )}
      </ul>

      {/* Footer containing support details and Logout */}
      <div className="p-4 border-t border-slate-100 space-y-3">
        {/* PWA Promotion action hook */}
        {deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-[10px] transition duration-150 shadow-3xs cursor-pointer uppercase tracking-wider animate-pulse"
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span>Instalar Aplicativo</span>
          </button>
        )}

        {isInstalled && (
          <div className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-150 py-1.5 px-2 rounded-lg font-black text-center uppercase tracking-wider">
            ⚡ Executando como Aplicativo
          </div>
        )}

        <div className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center leading-normal">
          <HeartHandshake className="w-4.5 h-4.5 text-sky-500 mx-auto mb-1" />
          <span className="font-bold block text-slate-500">Milk Sistemas</span>
          Suporte: <a href="mailto:enfmichelmilk@gmail.com" className="text-sky-600 font-semibold hover:underline">Michel Milk</a>
        </div>
        
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 py-2 px-3 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors w-full text-left cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Encerrar Sessão</span>
        </button>
      </div>
    </nav>
  );
}
