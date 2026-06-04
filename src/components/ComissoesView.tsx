/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Award, PlusCircle, Trash2, UserPlus, HelpCircle, 
  Search, ShieldCheck, ClipboardList, Info, Users
} from 'lucide-react';
import { Colaborador, Usuario } from '../types';

interface ComissoesViewProps {
  colaboradores: Colaborador[];
  dynamicSelos: string[];
  onUpdateColaboradores: (novosColabs: Colaborador[]) => void;
  onUpdateDynamicSelos: (novosSelos: string[]) => void;
  usuarioLogado: Usuario;
}

export default function ComissoesView({
  colaboradores,
  dynamicSelos,
  onUpdateColaboradores,
  onUpdateDynamicSelos,
  usuarioLogado
}: ComissoesViewProps) {
  // Built-in fixed / default seals
  const defaultSelos = ['Comissão de Ética', 'Brigadista', 'CIPA'];
  
  // Overall seals merged (Default + Dynamic)
  const allSelos = useMemo(() => {
    return [...defaultSelos, ...dynamicSelos];
  }, [dynamicSelos]);

  const [activeSelo, setActiveSelo] = useState<string>('Comissão de Ética');
  const [newSeloName, setNewSeloName] = useState('');
  const [isNewSeloModalOpen, setIsNewSeloModalOpen] = useState(false);
  const [fastAddMatricula, setFastAddMatricula] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Authorized Admin check
  const isAuthorizedAdmin = () => {
    const perfil = usuarioLogado.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    const authList = ["supervisor(a)", "supervisor", "coordenador(a)", "coordenador", "gerente", "adm", "administrador"];
    return authList.some(role => perfil.includes(role));
  };

  // Helper to check if a collaborator possesses a seal
  const hasSelo = (colab: Colaborador, selo: string): boolean => {
    if (selo === 'Comissão de Ética') return colab.selo_etica === 'Sim';
    if (selo === 'Brigadista') return colab.selo_brigadista === 'Sim';
    if (selo === 'CIPA') return colab.selo_cipa === 'Sim';
    return !!colab.selos_adicionais?.includes(selo);
  };

  // List of collaborators with the active seal
  const colabsInActiveSelo = useMemo(() => {
    return colaboradores.filter(c => hasSelo(c, activeSelo) && 
      (c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || c.matricula.includes(searchTerm))
    ).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores, activeSelo, searchTerm]);

  // List of candidate collaborators to be added (do not have this seal yet)
  const candidateColabs = useMemo(() => {
    return colaboradores
      .filter(c => !hasSelo(c, activeSelo))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores, activeSelo]);

  // Handle adding a collaborator to active seal
  const handleAddColabToSelo = (matricula: string) => {
    if (!matricula) return;

    const novosColabs = colaboradores.map(c => {
      if (c.matricula === matricula) {
        if (activeSelo === 'Comissão de Ética') return { ...c, selo_etica: 'Sim' as const };
        if (activeSelo === 'Brigadista') return { ...c, selo_brigadista: 'Sim' as const };
        if (activeSelo === 'CIPA') return { ...c, selo_cipa: 'Sim' as const };
        
        const extra = c.selos_adicionais || [];
        if (!extra.includes(activeSelo)) {
          return { ...c, selos_adicionais: [...extra, activeSelo] };
        }
      }
      return c;
    });

    onUpdateColaboradores(novosColabs);
    setFastAddMatricula('');
  };

  // Handle removing a collaborator from active seal
  const handleRemoveColabFromSelo = (matricula: string) => {
    if (!isAuthorizedAdmin()) {
      alert("Apenas coordenadores ou supervisores possuem autorização para alterar comissões e selos.");
      return;
    }

    if (!confirm(`Deseja realmente remover este colaborador do selo "${activeSelo}"?`)) {
      return;
    }

    const novosColabs = colaboradores.map(c => {
      if (c.matricula === matricula) {
        if (activeSelo === 'Comissão de Ética') return { ...c, selo_etica: 'Não' as const };
        if (activeSelo === 'Brigadista') return { ...c, selo_brigadista: 'Não' as const };
        if (activeSelo === 'CIPA') return { ...c, selo_cipa: 'Não' as const };
        
        const extra = c.selos_adicionais || [];
        return { ...c, selos_adicionais: extra.filter(s => s !== activeSelo) };
      }
      return c;
    });

    onUpdateColaboradores(novosColabs);
  };

  // Create a new custom seal
  const handleCreateSelo = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSeloName.trim();
    if (!name) return;

    if (allSelos.some(s => s.toLowerCase() === name.toLowerCase())) {
      alert("Este selo já existe no sistema!");
      return;
    }

    const novosSelos = [...dynamicSelos, name];
    onUpdateDynamicSelos(novosSelos);
    localStorage.setItem('hnsr_dynamic_selos', JSON.stringify(novosSelos));

    setActiveSelo(name);
    setNewSeloName('');
    setIsNewSeloModalOpen(false);
    alert(`Novo selo "${name}" criado com sucesso! Ele foi integrado ao cadastro de colaboradores.`);
  };

  return (
    <div className="space-y-6" id="view-comissoes">
      
      {/* Header Info Banner */}
      <div className="bg-gradient-to-r from-sky-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md flex justify-between items-center flex-wrap gap-4">
        <div>
          <span className="bg-sky-500/20 text-sky-300 font-extrabold text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-sky-400/20">
            Painel do Núcleo de Qualificação & Segurança
          </span>
          <h2 className="text-xl font-black flex items-center gap-2 mt-2">
            <Award className="w-5 h-5 text-amber-400" />
            <span>Gestão de Comissões e Selos Institucionais</span>
          </h2>
          <p className="text-xs text-slate-350 mt-1 max-w-xl font-medium leading-relaxed">
            Consulte a equipe associada aos conselhos de ética, brigada oficial, comitê de CIPA ou crie novos selos operacionais para credenciar e sinalizar proficiência no prontuário do colaborador.
          </p>
        </div>
        
        <div className="flex gap-2.5 flex-wrap">
          {usuarioLogado?.email?.toLowerCase() === 'enfmichelmilk@gmail.com' && (
            <button
              onClick={() => {
                if (window.confirm("ATENÇÃO: Deseja realmente resetar TODOS os selos e comissões de todos os colaboradores e remover todos os selos personalizados permanentemente? Esta ação é irreversível.")) {
                  const resetColaboradores = colaboradores.map(c => ({
                    ...c,
                    selo_etica: 'Não' as const,
                    selo_brigadista: 'Não' as const,
                    selo_cipa: 'Não' as const,
                    selos_adicionais: []
                  }));
                  onUpdateColaboradores(resetColaboradores);
                  onUpdateDynamicSelos([]);
                  setActiveSelo('Comissão de Ética');
                  alert("Todas as comissões, selos nativos e selos personalizados foram redefinidos para o estado padrão com sucesso!");
                }
              }}
              className="bg-red-650 hover:bg-red-700 border border-red-500 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 transition duration-150 cursor-pointer active:scale-95 shadow-md shadow-red-550/10"
            >
              <Trash2 className="w-4 h-4" />
              <span>Resetar Selos</span>
            </button>
          )}

          <button
            onClick={() => {
              if (!isAuthorizedAdmin()) {
                alert("Apenas coordenadores ou supervisores possuem autorização para criar novos selos.");
                return;
              }
              setIsNewSeloModalOpen(true);
            }}
            className="bg-amber-500 hover:bg-amber-600 border border-amber-400 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 transition duration-150 cursor-pointer active:scale-95 shadow-md shadow-amber-500/10"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Criar Novo Selo</span>
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Left Side: Submenu Navigation */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-2 lg:col-span-1 shadow-xs">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block px-2.5 mb-2">Selos e Comitês</span>
          <ul className="space-y-1">
            {allSelos.map(selo => {
              const count = colaboradores.filter(c => hasSelo(c, selo)).length;
              const isActive = activeSelo === selo;
              return (
                <li key={selo}>
                  <button
                    onClick={() => { setActiveSelo(selo); setSearchTerm(''); }}
                    className={`w-full text-left py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all leading-tight ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-650 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate pr-2">{selo}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right Side: Active Seal Detail & Fast Add */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Action Bar for active seal */}
          <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-sky-600" />
                  <span>Integrantes do Selo:</span>
                  <span className="bg-sky-100 text-sky-800 px-2.5 py-0.5 rounded-full text-xs font-black">{activeSelo}</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">Sinalização de proficiência ativa na escala de serviço.</p>
              </div>
              
              {/* Search Integrantes */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar integrantes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-9 pr-3 text-[11px] font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-sans"
                />
              </div>
            </div>

            {/* Fast Add form section */}
            <div className="p-3 bg-sky-50/50 border border-sky-100 rounded-xl flex flex-col md:flex-row items-center gap-3">
              <div className="flex items-center gap-2 text-sky-900 font-extrabold text-xs shrink-0 select-none">
                <UserPlus className="w-4 h-4 text-sky-600" />
                <span>Adsorção Rápida:</span>
              </div>
              
              <div className="flex-1 w-full">
                <select
                  value={fastAddMatricula}
                  onChange={(e) => {
                    const mat = e.target.value;
                    setFastAddMatricula(mat);
                    if (mat) handleAddColabToSelo(mat);
                  }}
                  className="w-full bg-white border border-slate-200 text-slate-850 text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer focus:border-sky-500 shadow-3xs"
                >
                  <option value="">Selecione um profissional para adicionar a este comitê/selo...</option>
                  {candidateColabs.map(c => (
                    <option key={c.matricula} value={c.matricula}>
                      {c.nome} (S: {c.setor} • cargo: {c.cargo})
                    </option>
                  ))}
                </select>
              </div>
              
              <span className="text-[10px] text-slate-400 font-semibold italic select-none">Basta selecionar para ingressar instantaneamente!</span>
            </div>
          </div>

          {/* Table list of members */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-semibold text-slate-700 font-sans">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-[9px] font-black border-b border-slate-100 select-none">
                  <tr>
                    <th className="p-4">Colaborador</th>
                    <th className="p-4">Cargo</th>
                    <th className="p-4">Setor</th>
                    <th className="p-4">Equipe</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {colabsInActiveSelo.length > 0 ? (
                    colabsInActiveSelo.map((c) => (
                      <tr key={c.matricula} className="hover:bg-slate-50/40 transition-colors">
                        <td className="p-4">
                          <div>
                            <span className="font-extrabold text-slate-800 text-xs block">{c.nome}</span>
                            <span className="text-[10px] text-slate-400 block font-mono mt-0.5">Matrícula: {c.matricula}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-650">{c.cargo}</td>
                        <td className="p-4">
                          <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md font-extrabold text-[10px] uppercase">
                            {c.setor}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 font-mono text-[10px]">{c.equipe}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleRemoveColabFromSelo(c.matricula)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition cursor-pointer"
                            title="Remover deste comitê"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400 font-bold bg-white leading-normal">
                        <Users className="w-8 h-8 text-slate-350 mx-auto mb-2" />
                        <span>Nenhum profissional associado a este selo ou comissão no momento.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>

      {/* modal block for creating new Dynamic Selo */}
      {isNewSeloModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn font-sans">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4.5 border-b border-slate-100 flex justify-between items-center">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4.5 h-4.5 text-sky-600 shrink-0" />
                <span>Cadastrar Novo Selo</span>
              </h4>
              <button 
                onClick={() => { setIsNewSeloModalOpen(false); setNewSeloName(''); }} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-450 p-1.5 rounded-lg transition"
              >
                <XIcon className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSelo} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-650 block">Nome do Selo / Badge / Comissão:</label>
                <input
                  type="text"
                  required
                  placeholder="EX: Selo Urgência e Emergência, Comissão de Ética ..."
                  value={newSeloName}
                  onChange={(e) => setNewSeloName(e.target.value)}
                  className="w-full text-xs font-bold text-slate-800 border border-slate-200 bg-slate-50/50 p-2.5 rounded-xl focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                />
                <span className="text-[10px] text-slate-400 block font-normal leading-normal">
                  Este selo será catalogado na central e adicionado como uma caixa de seleção opcional em todas as fichas de cadastro de usuários e colaboradores de escalas do hospital.
                </span>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-700 text-white font-extrabold py-2 px-5 text-xs rounded-xl flex-1 transition duration-155 active:scale-95 text-center shadow-md shadow-sky-600/10"
                >
                  Confirmar Cadastro
                </button>
                <button
                  type="button"
                  onClick={() => { setIsNewSeloModalOpen(false); setNewSeloName(''); }}
                  className="border border-slate-200 bg-white hover:bg-slate-55 text-slate-500 font-extrabold py-2 px-4 text-xs rounded-xl transition"
                >
                  Cancelar
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}

// Inline fallback XIcon since lucide-react might not have X immediately searchable if it had any bundle variance
function XIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
