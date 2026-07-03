/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Palmtree, Calendar, Users, Briefcase, PlusCircle, Trash2, 
  CheckCircle, XCircle, AlertCircle, FileText, Search, ClipboardList, Info, HelpCircle,
  Pencil
} from 'lucide-react';
import { Ferias, Colaborador, Usuario } from '../types';
import SearchableColaboradorSelect from './SearchableColaboradorSelect';
import { customAlert, customConfirm } from '../utils/customDialog';
import { isUserSubordinate } from '../utils/userFilters';

interface FeriasViewProps {
  ferias: Ferias[];
  colaboradores: Colaborador[];
  usuarioLogado: Usuario;
  onUpdateFerias: (novasFerias: Ferias[]) => void;
}

export default function FeriasView({ 
  ferias, 
  colaboradores, 
  usuarioLogado, 
  onUpdateFerias 
}: FeriasViewProps) {
  // Navigation internal tabs
  const [activeSubTab, setActiveSubTab] = useState<'lista' | 'solicitar'>('lista');
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSetor, setSelectedSetor] = useState('Todos');

  // New Vacation Form States
  const [selectedColabMatricula, setSelectedColabMatricula] = useState('');
  const [startDate, setStartDate] = useState('');
  const [duration, setDuration] = useState<10 | 15 | 20 | 30>(30);
  const [homologateImmediately, setHomologateImmediately] = useState(true);

  // Edit Vacation States
  const [editingFerias, setEditingFerias] = useState<Ferias | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editDuration, setEditDuration] = useState<10 | 15 | 20 | 30>(30);
  const [editStatus, setEditStatus] = useState<'Pendente' | 'Aprovado' | 'Recusado'>('Pendente');

  // Check if current user is Nurse or higher
  const isAuthorizedAdmin = () => {
    const perfil = usuarioLogado.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    const authList = ["supervisor(a)", "supervisor", "coordenador(a)", "coordenador", "gerente", "adm", "administrador"];
    return authList.some(role => perfil.includes(role));
  };

  const isEnfermeiro = useMemo(() => {
    const perfil = usuarioLogado?.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    return perfil === "enfermeiro(a)" || perfil === "enfermeiro" || perfil === "enfermeira";
  }, [usuarioLogado]);

  // Filter eligible employees based on logged-in user
  const eligibleColaboradores = useMemo(() => {
    if (isEnfermeiro) {
      return colaboradores.filter(c => isUserSubordinate(c, usuarioLogado, colaboradores));
    }
    
    // Otherwise return all active employees
    return colaboradores;
  }, [colaboradores, usuarioLogado, isEnfermeiro]);

  // Handle Form Submission
  const handleSubmitSolicitation = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedColabMatricula) {
      customAlert("Por favor, selecione um colaborador.");
      return;
    }
    if (!startDate) {
      customAlert("Por favor, informe a data de início das férias.");
      return;
    }

    const selectedColab = colaboradores.find(c => c.matricula === selectedColabMatricula);
    if (!selectedColab) {
      customAlert("Colaborador não encontrado.");
      return;
    }

    // Calculate end date (dataFim)
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + duration - 1);
    const dataFim = end.toISOString().split('T')[0];

    // Calculate return date (dataRetorno)
    const ret = new Date(start);
    ret.setDate(start.getDate() + duration);
    const dataRetorno = ret.toISOString().split('T')[0];

    // Check for overlap with existing vacation for the same employee
    const hasOverlap = ferias.some(f => {
      if (f.matricula !== selectedColab.matricula || f.status === 'Recusado') return false;
      // Overlap calculation: (StartA <= EndB) and (EndA >= StartB)
      return (startDate <= f.dataFim && dataFim >= f.dataInicio);
    });

    if (hasOverlap) {
      customAlert(`O colaborador ${selectedColab.nome} já possui férias registradas que se sobrepõem a esse período.`);
      return;
    }

    const novaSolicitacao: Ferias = {
      id: `fer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      colaborador: selectedColab.nome,
      matricula: selectedColab.matricula,
      dataInicio: startDate,
      dataFim: dataFim,
      dataRetorno: dataRetorno,
      duracao: duration,
      status: homologateImmediately || isAuthorizedAdmin() ? 'Aprovado' : 'Pendente',
      solicitante: usuarioLogado.nome,
      dataCriacao: new Date().toLocaleDateString('pt-BR')
    };

    const novasFeriasList = [...ferias, novaSolicitacao];
    onUpdateFerias(novasFeriasList);
    
    customAlert(`Férias solicitadas com sucesso! Período: de ${startDate.split('-').reverse().join('/')} até ${dataFim.split('-').reverse().join('/')}. Retorno em ${dataRetorno.split('-').reverse().join('/')}.`);
    
    // Reset Form
    setSelectedColabMatricula('');
    setStartDate('');
    setDuration(30);
    setActiveSubTab('lista');
  };

  // Delete vacation
  const handleDeleteFerias = async (id: string) => {
    if (await customConfirm("Deseja realmente excluir/cancelar este registro de férias? Isso removerá o bloqueio correspondente na escala.")) {
      const updated = ferias.filter(f => f.id !== id);
      onUpdateFerias(updated);
    }
  };

  // Approve vacation
  const handleApproveFerias = (id: string) => {
    const updated = ferias.map(f => {
      if (f.id === id) {
        return { ...f, status: 'Aprovado' as const };
      }
      return f;
    });
    onUpdateFerias(updated);
  };

  // Reject vacation
  const handleRejectFerias = (id: string) => {
    const updated = ferias.map(f => {
      if (f.id === id) {
        return { ...f, status: 'Recusado' as const };
      }
      return f;
    });
    onUpdateFerias(updated);
  };

  // List of Hospital Sectors based on colaboradores data
  const setoresSelect = useMemo(() => {
    const sets = new Set(colaboradores.map(c => c.setor));
    return ['Todos', ...Array.from(sets)].sort();
  }, [colaboradores]);

  // List of filtered vacation entries
  const filteredFerias = useMemo(() => {
    return ferias.filter(f => {
      const matchSearch = f.colaborador.toLowerCase().includes(searchTerm.toLowerCase()) || f.matricula.includes(searchTerm);
      
      const colab = colaboradores.find(c => c.matricula === f.matricula);
      const matchSetor = selectedSetor === 'Todos' || (colab && colab.setor === selectedSetor);
      
      let matchManager = true;
      if (isEnfermeiro) {
        if (colab) {
          matchManager = isUserSubordinate(colab, usuarioLogado, colaboradores);
        } else {
          matchManager = false;
        }
      }
      
      return matchSearch && matchSetor && matchManager;
    }).sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  }, [ferias, colaboradores, searchTerm, selectedSetor, usuarioLogado, isEnfermeiro]);

  // Calculate real time Preview in Form
  const previewDates = useMemo(() => {
    if (!startDate) return null;
    try {
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(start);
      end.setDate(start.getDate() + duration - 1);
      const dataFim = end.toISOString().split('T')[0];

      const ret = new Date(start);
      ret.setDate(start.getDate() + duration);
      const dataRetorno = ret.toISOString().split('T')[0];

      return {
        fim: dataFim.split('-').reverse().join('/'),
        retorno: dataRetorno.split('-').reverse().join('/')
      };
    } catch {
      return null;
    }
  }, [startDate, duration]);

  return (
    <div className="space-y-6" id="view-gestao-ferias">
      {/* Header Info Panel */}
      <div className="bg-gradient-to-r from-sky-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md flex justify-between items-center flex-wrap gap-4">
        <div>
          <span className="bg-sky-500/20 text-sky-300 font-extrabold text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-sky-400/20">
            Módulo Operacional do Sistema
          </span>
          <h2 className="text-xl font-black flex items-center gap-2 mt-2">
            <Palmtree className="w-5 h-5 text-amber-400" />
            <span>Gestão e Planejamento de Férias</span>
          </h2>
          <p className="text-xs text-slate-350 mt-1 max-w-xl font-medium leading-relaxed">
            Administre períodos de descanso programados de 20 ou 30 dias de seu time. Férias ativas geram preenchimento automático de escala em todos os plantões correspondentes.
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab('lista')}
            className={`py-2 px-4 rounded-xl font-extrabold text-xs transition border cursor-pointer ${
              activeSubTab === 'lista'
                ? 'bg-white text-slate-900 border-white shadow-sm'
                : 'bg-transparent text-white border-white/20 hover:bg-white/5'
            }`}
          >
            Quadro de Férias
          </button>
          {!isEnfermeiro && (
            <button
              onClick={() => setActiveSubTab('solicitar')}
              className={`py-2 px-4 rounded-xl font-extrabold text-xs transition border cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'solicitar'
                  ? 'bg-amber-500 text-white border-amber-400 shadow-md shadow-amber-500/10'
                  : 'bg-transparent text-white border-white/20 hover:bg-white/5'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Solicitar Novas Férias</span>
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'lista' ? (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar por colaborador ou matrícula..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-500 transition-all font-sans"
                />
              </div>

              <div className="w-48">
                <select
                  value={selectedSetor}
                  onChange={(e) => setSelectedSetor(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-sky-500 transition-all cursor-pointer"
                >
                  <option value="">Filtro de Setor</option>
                  {setoresSelect.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              <span>{filteredFerias.length} registro(s) listado(s)</span>
            </div>
          </div>

          {/* Table Board */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-medium text-slate-700 font-sans">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-[9px] font-black border-b border-slate-100 select-none">
                  <tr>
                    <th className="p-4">Colaborador</th>
                    <th className="p-4">Setor</th>
                    <th className="p-4">Início</th>
                    <th className="p-4">Término</th>
                    <th className="p-4">Retorno</th>
                    <th className="p-4 text-center">Duração</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Solicitado Por</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold">
                  {filteredFerias.length > 0 ? (
                    filteredFerias.map((f) => {
                      const colab = colaboradores.find(c => c.matricula === f.matricula);
                      return (
                        <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <div>
                              <span className="font-extrabold text-slate-800 block text-xs">{f.colaborador}</span>
                              <span className="text-[10px] text-slate-400 block font-mono mt-0.5">Matrícula: {f.matricula}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold text-[10px] uppercase">
                              {colab ? colab.setor : 'Não Encontrado'}
                            </span>
                          </td>
                          <td className="p-4 font-extrabold text-slate-800">
                            {f.dataInicio.split('-').reverse().join('/')}
                          </td>
                          <td className="p-4 font-extrabold text-slate-800">
                            {f.dataFim.split('-').reverse().join('/')}
                          </td>
                          <td className="p-4 font-black text-sky-700">
                            {f.dataRetorno.split('-').reverse().join('/')}
                          </td>
                          <td className="p-4 text-center">
                            <span className="bg-amber-100 text-amber-900 border border-amber-200/50 px-2 py-0.5 rounded-full font-black text-[10px]">
                              {f.duracao} dias
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full ${
                              f.status === 'Aprovado' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : f.status === 'Recusado'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                f.status === 'Aprovado' ? 'bg-emerald-500' : f.status === 'Recusado' ? 'bg-rose-500' : 'bg-amber-500'
                              }`} />
                              {f.status}
                            </span>
                          </td>
                          <td className="p-4 text-center leading-normal text-slate-550 block mt-2 text-[11px]">
                            {f.solicitante} <br />
                            <span className="text-[9px] text-slate-400 font-normal">{f.dataCriacao}</span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isEnfermeiro ? (
                                <span className="text-[10px] text-slate-400 font-semibold bg-slate-50 px-2 py-1 rounded border">SOMENTE LEITURA</span>
                              ) : (
                                <>
                                  {f.status === 'Pendente' && !isAuthorizedAdmin() && (
                                    <span className="text-[10px] text-slate-400 font-medium italic block mr-2">Sob Análise</span>
                                  )}
                                  {f.status === 'Pendente' && isAuthorizedAdmin() && (
                                    <>
                                      <button
                                        onClick={() => handleApproveFerias(f.id)}
                                        className="p-1 px-2.5 bg-emerald-100 flex items-center justify-center text-emerald-700 text-[10px] border border-emerald-250 font-extrabold hover:bg-emerald-200 rounded-lg transition"
                                        title="Aprovar e homologar a escala"
                                      >
                                        Aprovar
                                      </button>
                                      <button
                                        onClick={() => handleRejectFerias(f.id)}
                                        className="p-1 px-2 bg-slate-100 text-slate-600 text-[10px] hover:bg-rose-50 hover:text-rose-600 rounded-lg transition font-extrabold"
                                        title="Recusar solicitação"
                                      >
                                        Recusar
                                      </button>
                                    </>
                                  )}

                                  <button
                                    onClick={() => {
                                      setEditingFerias(f);
                                      setEditStartDate(f.dataInicio);
                                      setEditDuration(f.duracao);
                                      setEditStatus(f.status);
                                    }}
                                    className="p-1.5 hover:bg-sky-50 text-slate-400 hover:text-sky-600 rounded-xl transition cursor-pointer"
                                    title="Editar período de férias"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteFerias(f.id)}
                                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition cursor-pointer"
                                    title="Excluir de forma lógica"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-bold bg-white leading-normal">
                        Nenhum registro de férias catalogado para a filtragem atual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Solicitation form view */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Form Card */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 space-y-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-850 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-2">
              <ClipboardList className="w-4 animate-bounce h-4 text-sky-600" />
              <span>Formulário de Entrada de Férias</span>
            </h3>

            <form onSubmit={handleSubmitSolicitation} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Colaborador Selector */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-650 block">Selecione o Colaborador:</label>
                  <SearchableColaboradorSelect
                    colaboradores={eligibleColaboradores}
                    selectedMatricula={selectedColabMatricula}
                    onSelect={(colab) => setSelectedColabMatricula(colab ? colab.matricula : '')}
                    required={true}
                    placeholder="Escolha um profissional de sua competência..."
                  />
                  <span className="text-[10px] text-slate-400 block font-normal leading-normal">
                    {usuarioLogado.perfil === 'Enfermeiro(a)' || usuarioLogado.perfil.includes('Enfermeiro')
                      ? 'Em perfil de Enfermeiro(a), apenas sua ficha e de seu setor/equipe direta estão disponíveis.'
                      : 'Em perfil administrativo, todos os colaboradores do hospital estão legíveis.'}
                  </span>
                </div>

                {/* Data Inicio input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-650 block">Data de Início das Férias:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs font-extrabold text-slate-800 border border-slate-200 bg-slate-50/50 p-2.5 rounded-xl focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                  />
                  <span className="text-[10px] text-slate-400 block font-normal leading-normal">
                    Informe o primeiro dia em que o colaborador entrará em descanso programado.
                  </span>
                </div>

              </div>

              {/* Duration selector: 10, 15, 20 or 30 days */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-650 block">Duração Programada:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2.5 rounded-xl text-center font-bold text-xs select-none shadow-3xs">
                    <input
                      type="radio"
                      name="duracao"
                      checked={duration === 10}
                      onChange={() => setDuration(10)}
                      className="w-4 h-4 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span className="text-slate-800">10 Dias</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2.5 rounded-xl text-center font-bold text-xs select-none shadow-3xs">
                    <input
                      type="radio"
                      name="duracao"
                      checked={duration === 15}
                      onChange={() => setDuration(15)}
                      className="w-4 h-4 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span className="text-slate-800">15 Dias</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2.5 rounded-xl text-center font-bold text-xs select-none shadow-3xs">
                    <input
                      type="radio"
                      name="duracao"
                      checked={duration === 20}
                      onChange={() => setDuration(20)}
                      className="w-4 h-4 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span className="text-slate-800">20 Dias</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2.5 rounded-xl text-center font-bold text-xs select-none shadow-3xs">
                    <input
                      type="radio"
                      name="duracao"
                      checked={duration === 30}
                      onChange={() => setDuration(30)}
                      className="w-4 h-4 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span className="text-slate-800">30 Dias</span>
                  </label>
                </div>
              </div>

              {/* Fast Inline homologation toggle */}
              {isAuthorizedAdmin() && (
                <div className="flex items-center justify-between p-3.5 bg-indigo-50/60 border border-indigo-150 rounded-2xl">
                  <div>
                    <span className="text-xs font-extrabold text-indigo-900 block leading-tight">Homologação Automática e Ativa</span>
                    <span className="text-[10px] text-indigo-600 font-normal">Inserir as férias diretamente no status de Aprovado sem passar pelo crivo retroativo das lideranças</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={homologateImmediately}
                    onChange={(e) => setHomologateImmediately(e.target.checked)}
                    className="w-4.5 h-4.5 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
                  />
                </div>
              )}

              {/* Submit panel */}
              <button
                type="submit"
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-extrabold py-3 text-center rounded-xl transition duration-150 cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/10 active:scale-95"
              >
                <Palmtree className="w-4 h-4" />
                <span>Salvar e Lançar Férias</span>
              </button>

            </form>
          </div>

          {/* Interactive Calculation Preview Sheet Sidebar */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 space-y-4">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-indigo-100 pb-2 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-sky-700 shrink-0" />
              <span>Simulador em Tempo Real</span>
            </h4>

            {previewDates ? (
              <div className="space-y-3.5 bg-white p-4.5 rounded-2xl border border-slate-150 text-xs">
                
                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase font-black tracking-widest block text-slate-400">Início do Descanso:</span>
                  <strong className="text-slate-800 text-sm font-black">{startDate.split('-').reverse().join('/')}</strong>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase font-black tracking-widest block text-slate-400">Termo / Último Dia de Gozo:</span>
                  <strong className="text-slate-800 text-sm font-black">{previewDates.fim}</strong>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase font-black tracking-widest block text-slate-400">Retorno das Atividades:</span>
                  <strong className="text-sky-700 text-sm font-extrabold block bg-sky-50 px-2.5 py-1.5 border border-sky-200 rounded-xl mt-1">
                    {previewDates.retorno}
                  </strong>
                </div>

                <div className="pt-2 border-t border-slate-100 text-[10.5px] text-slate-500 font-medium leading-relaxed">
                  <p>
                    ⚠️ <strong>Dação de Férias:</strong> Durante o intervalo de {duration} dias, os plantões deste profissional serão coloridos com <strong>V</strong> em roxo. 
                    Nenhuma folga paralela precisará ser inserida no decorrer do mês.
                  </p>
                </div>

              </div>
            ) : (
              <div className="text-center p-6 bg-white/70 border border-dashed border-slate-200 rounded-2xl text-slate-450 leading-relaxed text-xs">
                <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span>Selecione a data inicial para renderizar os termos de gozo e dia de reapresentação regulamentar do profissional.</span>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Modal de Edição de Férias */}
      {editingFerias && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Palmtree className="w-5 h-5 text-sky-600" />
                <span>Editar Registro de Férias</span>
              </h3>
              <button
                onClick={() => setEditingFerias(null)}
                className="text-slate-400 hover:text-slate-600 font-extrabold text-lg"
              >
                ×
              </button>
            </div>

            <div className="space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <p className="text-xs text-slate-500 font-medium font-sans">Profissional:</p>
              <h4 className="text-xs font-black text-slate-800">{editingFerias.colaborador}</h4>
              <p className="text-[10px] text-slate-400 font-mono">Matrícula: {editingFerias.matricula}</p>
            </div>

            <div className="space-y-4 font-sans font-semibold">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Data de Início:</label>
                <input
                  type="date"
                  required
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-250 rounded-xl font-bold text-xs focus:outline-none focus:border-sky-500 text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Duração (Dias de Gozo):</label>
                <select
                  value={editDuration}
                  onChange={(e) => setEditDuration(parseInt(e.target.value) as 10 | 15 | 20 | 30)}
                  className="w-full p-2.5 bg-white border border-slate-250 rounded-xl font-bold text-xs focus:outline-none focus:border-sky-500 text-slate-800"
                >
                  <option value={10}>10 Dias</option>
                  <option value={15}>15 Dias</option>
                  <option value={20}>20 Dias Parciais</option>
                  <option value={30}>30 Dias Completos</option>
                </select>
              </div>

              {isAuthorizedAdmin() && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Status da Solicitação:</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full p-2.5 bg-white border border-slate-250 rounded-xl font-bold text-xs focus:outline-none focus:border-sky-500 text-slate-800"
                  >
                    <option value="Pendente">Pendente</option>
                    <option value="Aprovado">Aprovado (Válido na Escala)</option>
                    <option value="Recusado">Recusado</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (!editStartDate) {
                    customAlert("Informe a data de início!");
                    return;
                  }

                  // Recalculate end and return dates
                  const start = new Date(editStartDate + 'T00:00:00');
                  const end = new Date(start);
                  end.setDate(start.getDate() + editDuration - 1);
                  const dataFim = end.toISOString().split('T')[0];

                  const ret = new Date(start);
                  ret.setDate(start.getDate() + editDuration);
                  const dataRetorno = ret.toISOString().split('T')[0];

                  // Map update
                  const updatedList = ferias.map(f => {
                    if (f.id === editingFerias.id) {
                      return {
                        ...f,
                        dataInicio: editStartDate,
                        dataFim: dataFim,
                        dataRetorno: dataRetorno,
                        duracao: editDuration,
                        status: editStatus
                      };
                    }
                    return f;
                  });

                  onUpdateFerias(updatedList);
                  setEditingFerias(null);
                  customAlert("Registro de férias atualizado com sucesso!");
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl text-xs transition"
              >
                Confirmar Alteração
              </button>
              <button
                type="button"
                onClick={() => setEditingFerias(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 font-extrabold rounded-xl text-xs transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
