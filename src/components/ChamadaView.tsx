/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  ClipboardCheck, 
  Calendar, 
  Clock, 
  User, 
  Briefcase, 
  ArrowRightLeft, 
  Copy, 
  Check, 
  Trash, 
  Plus, 
  ListOrdered, 
  X, 
  CheckCircle2, 
  FileText,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { subscribeCollection } from '../lib/firebase';
import { Colaborador, Usuario, Absenteismo, Ferias, SolicitacaoFolga, Chamada, ColaboradorChamadaStatus, ChamadaSetorMetric } from '../types';

interface ChamadaViewProps {
  colaboradores: Colaborador[];
  absenteismo: Absenteismo[];
  ferias: Ferias[];
  solicitacoes: SolicitacaoFolga[];
  usuarioLogado: Usuario;
  chamadas: Chamada[];
  onUpdateChamadas: (novasChamadas: Chamada[]) => void;
}

const SECTORS_LIST = [
  'UTI (9º andar)',
  'UTI (7º andar)',
  '6º Andar',
  '5º Andar',
  '4º Andar',
  '3º Andar',
  '2º Andar',
  'CC / CME',
  'PSA',
  'PSI'
];

const EQUIPES_DISPONIVEIS = ['Diurno A', 'Diurno B', 'Noturno A', 'Noturno B', 'Diarista'];

// Helper to normalized map colaborador sectors to our 10 standard sectors
const mapSectorToTarget = (setor: string): string => {
  const norm = (setor || '').toUpperCase().trim();
  if (norm.includes('9º') || norm.includes('9O') || norm.includes('UTI 9')) return 'UTI (9º andar)';
  if (norm.includes('7º') || norm.includes('7O') || norm.includes('8º') || norm.includes('8O') || norm.includes('UTI 8') || norm.includes('UTI 7')) return 'UTI (7º andar)';
  if (norm.includes('6º') || norm.includes('6O') || norm.includes('6 ANDAR')) return '6º Andar';
  if (norm.includes('5º') || norm.includes('5O') || norm.includes('5 ANDAR')) return '5º Andar';
  if (norm.includes('4º') || norm.includes('4O') || norm.includes('4 ANDAR')) return '4º Andar';
  if (norm.includes('3º') || norm.includes('3O') || norm.includes('3 ANDAR')) return '3º Andar';
  if (norm.includes('2º') || norm.includes('2O') || norm.includes('2 ANDAR')) return '2º Andar';
  if (norm.includes('CENTRO') || norm.includes('CIRURGICO') || norm.includes('CME') || norm.includes('CC')) return 'CC / CME';
  if (norm.includes('PSA') || norm.includes('PRONTO SOCORRO ADULTO')) return 'PSA';
  if (norm.includes('PSI') || norm.includes('PRONTO SOCORRO INFANTIL')) return 'PSI';
  return '2º Andar'; // Default fallback
};

export default function ChamadaView({
  colaboradores,
  absenteismo,
  ferias,
  solicitacoes,
  usuarioLogado,
  chamadas,
  onUpdateChamadas
}: ChamadaViewProps) {
  // Ordered historically descending
  const sortedChamadas = useMemo(() => {
    return [...chamadas].sort((a, b) => {
      const dateCompare = b.data.localeCompare(a.data);
      if (dateCompare !== 0) return dateCompare;
      return b.dataCriacao.localeCompare(a.dataCriacao);
    });
  }, [chamadas]);

  // Form Creation State
  const [isCreating, setIsCreating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [selectedTurno, setSelectedTurno] = useState('Diurno A');
  const [enfermeiroRef, setEnfermeiroRef] = useState(usuarioLogado.nome || '');

  // Active Draft Session State
  const [draftColaboradores, setDraftColaboradores] = useState<ColaboradorChamadaStatus[]>([]);
  const [draftMetricas, setDraftMetricas] = useState<{ [setorName: string]: ChamadaSetorMetric }>({});
  
  // Modal export copy text and copy alert states
  const [viewingReportText, setViewingReportText] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isViewingDetails, setIsViewingDetails] = useState<Chamada | null>(null);

  // Load and sync real-time remanejamentos from off-scale
  const [remanejamentos, setRemanejamentos] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsubscribe = subscribeCollection<any>(
      'remanejamentos',
      (data) => {
        const mapped: Record<string, string> = {};
        data.forEach((item) => {
          mapped[item.id] = item.setor;
        });
        setRemanejamentos(mapped);
      },
      'hnsr_remanejamentos_db',
      []
    );
    return () => unsubscribe();
  }, []);

  // Helper detection of dynamic status of employees on this target date
  const getColaboradorStatusOnDate = (colab: Colaborador, targetDateStr: string) => {
    // 0. Active INSS / Licença check
    if (colab.inss_check === 'Sim') {
      const hasRetorno = colab.inss_retorno && colab.inss_retorno.trim() !== '';
      if (!hasRetorno || targetDateStr < colab.inss_retorno) {
        const infoMsg = hasRetorno 
          ? `Afastado INSS / Licença (Até retorno em ${formatDateBR(colab.inss_retorno)})`
          : `Afastado INSS / Licença (Sem Data de Retorno Informada)`;
        return { 
          status: 'Atestado' as const, 
          info: infoMsg
        };
      }
    }

    // 1. Vacation Active
    const vacationMatch = ferias.find(f => {
      return (
        f.matricula === colab.matricula && 
        f.status === 'Aprovado' && 
        targetDateStr >= f.dataInicio && 
        targetDateStr <= f.dataFim
      );
    });
    if (vacationMatch) {
      return { status: 'Férias' as const, info: `Férias (Retorno em ${formatDateBR(vacationMatch.dataRetorno)})` };
    }

    // 2. Absenteismo / Leave Active
    const leaveMatch = absenteismo.find(a => {
      if (a.matricula !== colab.matricula) return false;
      const start = a.inicio;
      const end = a.retorno || a.termino;
      if (!start) return false;
      if (end) {
        return targetDateStr >= start && targetDateStr <= end;
      }
      return start === targetDateStr;
    });
    if (leaveMatch) {
      return { 
        status: 'Atestado' as const, 
        info: `${leaveMatch.tipo === 'Atestado' ? 'Atestado' : 'Afastamento'} (Patologia: ${leaveMatch.patologia || 'Não Informada'}${leaveMatch.cid ? ` - CID: ${leaveMatch.cid}` : ''})` 
      };
    }

    // 3. Approved Folga / Repouso
    const folgaMatch = solicitacoes.find(s => {
      return (
        s.matricula === colab.matricula &&
        s.data === targetDateStr &&
        s.status === 'Aprovado'
      );
    });
    if (folgaMatch) {
      return { status: 'Folga' as const, info: `Folga (${folgaMatch.tipo})` };
    }

    return null;
  };

  // Human date format helper (YYYY-MM-DD to DD/MM/YYYY)
  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Master initializer of draft chamada list
  const handleStartChamada = () => {
    // Gather all eligible employees who worked in this shift/turno
    // If Diarista is chosen, filter where c.equipe is Diarista
    // For others, filter matching team shift
    const filtered = colaboradores.filter(c => {
      const equipeLower = (c.equipe || '').toLowerCase().trim();
      const selectedLower = selectedTurno.toLowerCase().trim();
      
      // If we seek standard matching or similar
      return equipeLower === selectedLower;
    }).sort((a, b) => {
      const aCargo = a.cargo?.toLowerCase() || '';
      const bCargo = b.cargo?.toLowerCase() || '';
      const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') ? 1 : 0;
      const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') ? 1 : 0;
      if (aIsEnf !== bIsEnf) return bIsEnf - aIsEnf;
      return a.nome.localeCompare(b.nome);
    });

    const activeDrafts = filtered.map(c => {
      const predState = getColaboradorStatusOnDate(c, selectedDate);
      const remState = remanejamentos[`${c.matricula}-${selectedDate}`];
      
      let initialStatus: 'Presente' | 'Atestado' | 'Falta' | 'Férias' | 'Folga' | 'Pendente' = 'Pendente';
      if (predState) {
        initialStatus = predState.status;
      } else if (remState) {
        initialStatus = 'Presente';
      }

      return {
        matricula: c.matricula,
        nome: c.nome,
        cargo: c.cargo,
        setorOriginal: mapSectorToTarget(c.setor),
        status: initialStatus,
        remanejadoPara: remState || undefined,
        info: predState ? predState.info : undefined
      };
    });

    // Populate standard empty metrics for all 10 standard sectors
    const standardMetricas: { [setorName: string]: ChamadaSetorMetric } = {};
    SECTORS_LIST.forEach(s => {
      standardMetricas[s] = {
        setor: s,
        totalPacientes: 0,
        pacientesAcamados: 0,
        pacientesVM: 0,
        altasPrevistas: 0
      };
    });

    setDraftColaboradores(activeDrafts);
    setDraftMetricas(standardMetricas);
    setIsCreating(true);
  };

  const handleUpdateDraftStatus = (matricula: string, newStatus: 'Presente' | 'Atestado' | 'Falta') => {
    setDraftColaboradores(prev => 
      prev.map(c => c.matricula === matricula ? { ...c, status: newStatus } : c)
    );
  };

  const handleUpdateDraftRemanejamento = (matricula: string, targetSectorSector: string) => {
    setDraftColaboradores(prev => 
      prev.map(c => c.matricula === matricula ? { 
        ...c, 
        remanejadoPara: targetSectorSector === '' ? undefined : targetSectorSector 
      } : c)
    );
  };

  const handleUpdateMetricas = (sectorName: string, field: keyof ChamadaSetorMetric, value: number) => {
    setDraftMetricas(prev => ({
      ...prev,
      [sectorName]: {
        ...prev[sectorName],
        [field]: isNaN(value) ? 0 : value
      }
    }));
  };

  // Master generator of WhatsApp friendly text body
  const generateWhatsAppText = (
    dateStr: string,
    turnoName: string,
    enfermeiroName: string,
    colabStatuses: ColaboradorChamadaStatus[],
    metrics: { [setorName: string]: ChamadaSetorMetric }
  ) => {
    const headerDate = formatDateBR(dateStr);
    
    let text = `Chamada\n`;
    text += `🗓️Data: ${headerDate}\n`;
    text += `🌓Turno: ${turnoName}\n`;
    text += `🩺 Enfermeiro(a) Referencia: ${enfermeiroName}\n\n`;

    SECTORS_LIST.forEach((sectorKey) => {
      const metric = metrics[sectorKey] || {
        totalPacientes: 0,
        pacientesVM: 0,
        pacientesAcamados: 0,
        altasPrevistas: 0
      };

      // 1. Compile Nurses present in sector (original present of this sector who are nurses AND wasn't remanejado, plus incoming remanejado nurses)
      const nursesPresent: string[] = [];
      colabStatuses.forEach(col => {
        const isNurse = (col.cargo || '').toLowerCase().includes('enfermeiro') || (col.cargo || '').toLowerCase().includes('enfermeira');
        if (!isNurse) return;

        const isOrigPresentNotInMove = col.setorOriginal === sectorKey && col.status === 'Presente' && !col.remanejadoPara;
        const isIncomingPresentMove = col.remanejadoPara === sectorKey && col.status === 'Presente';

        if (isOrigPresentNotInMove) {
          nursesPresent.push(col.nome);
        } else if (isIncomingPresentMove) {
          nursesPresent.push(`${col.nome} (Remanejado(a) de ${col.setorOriginal})`);
        }
      });

      const nursesText = nursesPresent.length > 0 ? nursesPresent.join(', ') : 'Nenhum';

      // 2. Count technicians present in sector (original present non-nurses who weren't remanejado, plus incoming remanejado technicians)
      let techniciansCount = 0;
      colabStatuses.forEach(col => {
        const isNurse = (col.cargo || '').toLowerCase().includes('enfermeiro') || (col.cargo || '').toLowerCase().includes('enfermeira');
        if (isNurse) return;

        const isOrigPresentNotInMove = col.setorOriginal === sectorKey && col.status === 'Presente' && !col.remanejadoPara;
        const isIncomingPresentMove = col.remanejadoPara === sectorKey && col.status === 'Presente';

        if (isOrigPresentNotInMove || isIncomingPresentMove) {
          techniciansCount++;
        }
      });

      // 3. Compile anyone originally from this sector marked with Atestado (defined either of draft or scheduled)
      const leavesList: string[] = [];
      colabStatuses.forEach(col => {
        if (col.setorOriginal === sectorKey && (col.status === 'Atestado' || col.status === 'Falta')) {
          const detail = col.status === 'Falta' ? 'Falta Sem Justificativa' : (col.info || 'Atestado');
          leavesList.push(`${col.nome} (${detail})`);
        }
      });
      const atestadoText = leavesList.length > 0 ? leavesList.join(', ') : 'Nenhum';

      // 4. Compile all remanejamentos originating from or coming to this sector
      const remanejadoDetails: string[] = [];
      colabStatuses.forEach(col => {
        // Outgoing remanejamento
        if (col.setorOriginal === sectorKey && col.remanejadoPara && col.status === 'Presente') {
          remanejadoDetails.push(`${col.nome} remanejado(a) para ${col.remanejadoPara}`);
        }
        // Incoming remanejamento
        if (col.remanejadoPara === sectorKey && col.status === 'Presente') {
          remanejadoDetails.push(`${col.nome} recebido(a) de ${col.setorOriginal}`);
        }
      });

      const remanejadoText = remanejadoDetails.length > 0 ? remanejadoDetails.join(', ') : 'Nenhum';

      text += `> ${sectorKey}\n`;
      text += `* Enfermeiro(a): ${nursesText}\n`;
      text += `* Técnicos: ${techniciansCount}\n`;
      text += `* Total Pacientes: ${metric.totalPacientes}\n`;
      text += `* Pacientes em VM: ${metric.pacientesVM}\n`;
      text += `* Atestado: ${atestadoText}\n`;
      text += `* Remanejado: ${remanejadoText}\n\n`;
    });

    return text.trim();
  };

  const handleSaveChamada = () => {
    if (!enfermeiroRef.trim()) {
      alert("Por favor, preencha o campo do Enfermeiro Referência.");
      return;
    }

    const newId = `chamada_${Date.now()}`;
    const generatedReport = generateWhatsAppText(
      selectedDate,
      selectedTurno,
      enfermeiroRef,
      draftColaboradores,
      draftMetricas
    );

    const novaChamada: Chamada = {
      id: newId,
      data: selectedDate,
      turno: selectedTurno,
      enfermeiroReferencia: enfermeiroRef,
      statusColaboradores: draftColaboradores,
      metricasSetor: draftMetricas,
      dataCriacao: new Date().toISOString(),
      usuarioCriador: usuarioLogado.email
    };

    onUpdateChamadas([novaChamada, ...chamadas]);
    setViewingReportText(generatedReport);
    setIsCreating(false);
  };

  const handleDeleteChamada = (id: string) => {
    const target = chamadas.find(c => c.id === id);
    if (target && target.usuarioCriador && target.usuarioCriador !== usuarioLogado.email) {
      alert(`Erro de Segurança: Somente o usuário que criou este registro de chamada (${target.usuarioCriador}) pode excluí-lo.`);
      return;
    }

    if (window.confirm("Deseja realmente excluir este registro de chamada permanentemente?")) {
      const filtered = chamadas.filter(c => c.id !== id);
      onUpdateChamadas(filtered);
    }
  };

  const handleCopyTextToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  // Grouping of draft colaboradores by sector for easy form layout
  const groupedDraftColaboradores = useMemo(() => {
    const groups: { [sectorName: string]: ColaboradorChamadaStatus[] } = {};
    SECTORS_LIST.forEach(s => {
      groups[s] = [];
    });

    draftColaboradores.forEach(c => {
      if (groups[c.setorOriginal]) {
        groups[c.setorOriginal].push(c);
      } else {
        // Fallback or unmapped
        if (!groups['2º Andar']) groups['2º Andar'] = [];
        groups['2º Andar'].push(c);
      }
    });

    return groups;
  }, [draftColaboradores]);

  return (
    <div className="w-full font-sans space-y-6">
      
      {/* Upper Module Briefing Banner */}
      <div className="bg-gradient-to-r from-sky-600 to-sky-700 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10">
          <ClipboardCheck className="w-64 h-64" />
        </div>
        <div className="relative z-10 space-y-2">
          <span className="bg-sky-500/55 text-white text-[9px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full border border-sky-400">
            Controle de Presença diário
          </span>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
            <ClipboardCheck className="w-7 h-7" />
            Chamada Diária Assistencial
          </h1>
          <p className="text-sky-100 text-xs font-semibold leading-relaxed max-w-2xl">
            Realize chamadas de enfermeiros(as) e técnicos(as) consolidados por setores e turnos. 
            Mapeie métricas de leitos, acompanhe afastamentos ou férias vinculados em tempo real e exporte o fechamento diretamente do hospital para o WhatsApp.
          </p>
        </div>
      </div>

      {!isCreating ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main creation parameters card */}
          <div className="lg:col-span-1 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md h-fit space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 pb-3.5 border-b border-slate-100">
              <Plus className="w-4 h-4 text-sky-600" />
              Iniciar Nova Chamada
            </h2>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Selecione a Data:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Turno de Trabalho:
                </label>
                <select
                  value={selectedTurno}
                  onChange={(e) => setSelectedTurno(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-850 cursor-pointer focus:outline-none focus:border-sky-500 transition-colors"
                >
                  {EQUIPES_DISPONIVEIS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Enfermeiro(a) Referência:
                </label>
                <input
                  type="text"
                  value={enfermeiroRef}
                  onChange={(e) => setEnfermeiroRef(e.target.value)}
                  placeholder="Nome do enfermeiro responsável..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>

              <button
                type="button"
                onClick={handleStartChamada}
                className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-sky-600/10 cursor-pointer transitionAll duration-150"
              >
                <ClipboardCheck className="w-4 h-4" />
                Carregar Lista de Chamada
              </button>
            </div>
          </div>

          {/* History collection cards list */}
          <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 pb-3.5 border-b border-slate-100">
              <ListOrdered className="w-4 h-4 text-indigo-500" />
              Histórico de Chamadas Registradas
            </h2>

            {sortedChamadas.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-2">
                <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-500">Nenhuma chamada diária registrada ainda.</p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Gere o controle do dia selecionando o turno ao lado e clicando no botão para iniciar o painel assistencial.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                {sortedChamadas.map((ch) => {
                  const presentCount = ch.statusColaboradores.filter(c => c.status === 'Presente').length;
                  const absCount = ch.statusColaboradores.filter(c => c.status === 'Atestado').length;
                  const missingCount = ch.statusColaboradores.filter(c => c.status === 'Falta').length;

                  return (
                    <div key={ch.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-base text-slate-850">
                            {formatDateBR(ch.data)}
                          </span>
                          <span className="bg-indigo-50 text-indigo-700 font-black rounded-md px-2 py-0.5 text-[9px] uppercase border border-indigo-100">
                            {ch.turno}
                          </span>
                        </div>
                        <div className="space-y-0.5 text-slate-500 font-semibold text-[11px]">
                          <p>
                            Enf. Referência: <span className="text-slate-800 font-bold">{ch.enfermeiroReferencia}</span>
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-emerald-600">Presentes: <strong>{presentCount}</strong></span>
                            <span>&bull;</span>
                            <span className="text-rose-600">Atestados: <strong>{absCount}</strong></span>
                            <span>&bull;</span>
                            <span className="text-amber-600">Faltas: <strong>{missingCount}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            const txt = generateWhatsAppText(ch.data, ch.turno, ch.enfermeiroReferencia, ch.statusColaboradores, ch.metricasSetor);
                            setViewingReportText(txt);
                          }}
                          className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black rounded-lg text-[10px] uppercase flex items-center gap-1 cursor-pointer transition border border-emerald-250"
                        >
                          <Copy className="w-3 h-3" />
                          Texto Zap
                        </button>

                        <button
                          onClick={() => setIsViewingDetails(ch)}
                          className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-[10px] uppercase cursor-pointer border border-slate-200 transition"
                        >
                          Detalhes
                        </button>

                        <button
                          onClick={() => handleDeleteChamada(ch.id)}
                          className="p-2 text-slate-400 hover:text-red-650 rounded-lg hover:bg-red-55 border border-transparent hover:border-red-150 transition cursor-pointer"
                          title="Excluir Chamada"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Full screen Draft Creation interactive form panel */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md overflow-hidden font-sans">
          
          {/* Draft Form Header */}
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-[10px] font-black tracking-widest text-sky-600 uppercase bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                Lançamento Ativo
              </span>
              <h2 className="text-base font-black text-slate-850 flex items-center gap-1.5 leading-normal mt-1">
                Chamada de {formatDateBR(selectedDate)} &bull; {selectedTurno}
              </h2>
              <p className="text-slate-500 text-[11px] font-semibold">
                Responsável: <strong className="text-slate-800">{enfermeiroRef}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Deseja cancelar o preenchimento desta chamada? Seus dados serão perdidos.")) {
                    setIsCreating(false);
                  }
                }}
                className="px-4 py-2 text-slate-550 bg-slate-100 hover:bg-slate-200 font-extrabold rounded-xl text-xs uppercase cursor-pointer transition duration-150"
              >
                Voltar
              </button>
              
              <button
                type="button"
                onClick={handleSaveChamada}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-600/10 transition duration-150"
              >
                <CheckCircle2 className="w-4 h-4" />
                Finalizar e Exportar
              </button>
            </div>
          </div>

          {/* Core Body: Sectors list panels */}
          <div className="p-6 space-y-8 max-h-[800px] overflow-y-auto">
            
            <div className="bg-blue-50/50 border border-blue-200 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-blue-800 font-semibold leading-relaxed">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                Cada setor possui caixas de preenchimento de métricas da enfermagem de leitos e de equipes. 
                Os profissionais de férias, atestado ou folgas programados para essa data no sistema já aparecem pré-identificados e dispensados do check inicial.
              </div>
            </div>

            {SECTORS_LIST.map((sectorName) => {
              const metric = draftMetricas[sectorName] || {
                totalPacientes: 0,
                pacientesVM: 0,
                pacientesAcamados: 0,
                altasPrevistas: 0
              };
              const subColaboradores = groupedDraftColaboradores[sectorName] || [];

              return (
                <div key={sectorName} className="border border-slate-100 rounded-2xl overflow-hidden shadow-2xs">
                  
                  {/* Sector Title & Metrics Strip Container */}
                  <div className="bg-slate-50/70 border-b border-slate-100 p-4">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                      
                      {/* Sector Title Label */}
                      <span className="text-xs font-black uppercase text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-3xs tracking-wider">
                        {sectorName}
                      </span>

                      {/* Required Metrics Fields Grid input */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs w-full xl:max-w-3xl">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block uppercase">Total Pacientes:</label>
                          <input
                            type="number"
                            min="0"
                            value={metric.totalPacientes || ''}
                            onChange={(e) => handleUpdateMetricas(sectorName, 'totalPacientes', parseInt(e.target.value) || 0)}
                            className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-250 p-2 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                            placeholder="0"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block uppercase">Pacientes em VM:</label>
                          <input
                            type="number"
                            min="0"
                            value={metric.pacientesVM || ''}
                            onChange={(e) => handleUpdateMetricas(sectorName, 'pacientesVM', parseInt(e.target.value) || 0)}
                            className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-250 p-2 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                            placeholder="0"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block uppercase">Acamados:</label>
                          <input
                            type="number"
                            min="0"
                            value={metric.pacientesAcamados || ''}
                            onChange={(e) => handleUpdateMetricas(sectorName, 'pacientesAcamados', parseInt(e.target.value) || 0)}
                            className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-250 p-2 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                            placeholder="0"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block uppercase">Altas Previstas:</label>
                          <input
                            type="number"
                            min="0"
                            value={metric.altasPrevistas || ''}
                            onChange={(e) => handleUpdateMetricas(sectorName, 'altasPrevistas', parseInt(e.target.value) || 0)}
                            className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-250 p-2 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                            placeholder="0"
                          />
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Team Roll list of this Sector */}
                  <div className="p-4 bg-white">
                    {subColaboradores.length === 0 ? (
                      <div className="text-center py-4 text-xs font-semibold text-slate-400 italic block">
                        Nenhum colaborador alocado neste setor para este turno.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {subColaboradores.map((colab) => {
                          const isSpecialStatus = ['Férias'].includes(colab.status);

                          return (
                            <div key={colab.matricula} className="py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                              <div className="space-y-0.5">
                                <p className="font-extrabold text-slate-800">
                                  {colab.nome} 
                                  <span className="text-[10px] text-slate-400 font-semibold ml-2">({colab.matricula})</span>
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">
                                  {colab.cargo}
                                </p>
                                {colab.info && (
                                  <p className="text-[9px] text-rose-600 font-extrabold mr-2 animate-pulse">
                                    ★ Registro Ativo: {colab.info}
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                
                                {/* If already pre-identified status (vacation/atestado) show badge instead of options */}
                                {isSpecialStatus ? (
                                  <div className="bg-amber-50/50 text-amber-800 border border-amber-200 font-bold rounded-xl px-3 py-1.5 flex items-center gap-1 text-[10px] uppercase">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    {colab.info || colab.status}
                                  </div>
                                ) : (
                                  <>
                                    {/* Action Status Check Radio buttons group */}
                                    <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-205/60 text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDraftStatus(colab.matricula, 'Presente')}
                                        className={`px-2.5 py-1.5 rounded-lg font-black uppercase cursor-pointer transition ${
                                          colab.status === 'Presente'
                                            ? 'bg-emerald-600 text-white shadow-3xs'
                                            : 'text-slate-500 hover:text-slate-850'
                                        }`}
                                      >
                                        Presente
                                      </button>
                                      
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDraftStatus(colab.matricula, 'Atestado')}
                                        className={`px-2.5 py-1.5 rounded-lg font-black uppercase cursor-pointer transition ${
                                          colab.status === 'Atestado'
                                            ? 'bg-rose-600 text-white shadow-3xs'
                                            : 'text-slate-500 hover:text-slate-850'
                                        }`}
                                      >
                                        Atestado
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleUpdateDraftStatus(colab.matricula, 'Falta')}
                                        className={`px-2.5 py-1.5 rounded-lg font-black uppercase cursor-pointer transition ${
                                          colab.status === 'Falta'
                                            ? 'bg-amber-600 text-white shadow-3xs'
                                            : 'text-slate-500 hover:text-slate-850'
                                        }`}
                                      >
                                        Falta
                                      </button>
                                    </div>

                                    {/* Remanejamento Action drop down */}
                                    {colab.status === 'Presente' && (
                                      <div className="flex items-center gap-1.5">
                                        <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                                        <select
                                          value={colab.remanejadoPara || ''}
                                          onChange={(e) => handleUpdateDraftRemanejamento(colab.matricula, e.target.value)}
                                          className="text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-250 rounded-lg p-1 px-1.5 cursor-pointer focus:outline-none focus:border-sky-500 transition-colors"
                                        >
                                          <option value="">Não remanejado</option>
                                          {SECTORS_LIST.map(s => {
                                            if (s === sectorName) return null; // Avoid same transfer
                                            return <option key={s} value={s}>Transferir para {s}</option>;
                                          })}
                                        </select>
                                      </div>
                                    )}
                                  </>
                                )}

                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}

          </div>

          {/* Bottom Save Action Controls */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              onClick={() => {
                if (window.confirm("Deseja realmente cancelar? Dados editados serão perdidos.")) {
                  setIsCreating(false);
                }
              }}
              className="px-4 py-2 text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 font-extrabold rounded-xl text-xs uppercase cursor-pointer transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveChamada}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl text-xs uppercase cursor-pointer shadow-md shadow-sky-600/10 transition"
            >
              Gravar e Copiar Relatório
            </button>
          </div>

        </div>
      )}

      {/* SUCCESS DETAILED MODAL WITH EXTRACTED WHATSAPP WRAPPERS */}
      {viewingReportText && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-150 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-sm text-slate-800">Relatório da Chamada Gerado com Sucesso!</h3>
              </div>
              <button
                onClick={() => setViewingReportText(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-650 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Document Print/Copy Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 font-medium">
                O texto abaixo foi formatado conforme solicitado para fácil envio no grupo de enfermagem do WhatsApp. Clique no botão de cópia rápida para transferir o conteúdo instantaneamente.
              </p>

              {/* Text formatting view block */}
              <div className="relative">
                <pre className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-750 font-mono overflow-auto max-h-96 whitespace-pre-wrap leading-normal leading-relaxed select-all">
                  {viewingReportText}
                </pre>

                <button
                  type="button"
                  onClick={() => handleCopyTextToClipboard(viewingReportText)}
                  className={`absolute right-4 top-4 p-2.5 rounded-xl border flex items-center gap-1 select-none cursor-pointer transition shadow-3xs ${
                    copiedSuccess 
                      ? 'bg-emerald-600 border-emerald-600 text-white' 
                      : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {copiedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase">Copiar Texto</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Bottom Actions footer bar */}
            <div className="p-4 bg-slate-50/80 border-t border-slate-150 flex items-center justify-end gap-2">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(viewingReportText)}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-xs uppercase flex items-center gap-1.5 cursor-pointer shadow"
              >
                Enviar Direto no WhatsApp
              </a>
              <button
                type="button"
                onClick={() => setViewingReportText(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-250 text-slate-700 font-black rounded-lg text-xs uppercase cursor-pointer"
              >
                Voltar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Chamada details modal */}
      {isViewingDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-150 bg-slate-50/50 flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="font-extrabold text-sm text-slate-800">
                  Chamada Realizada em {formatDateBR(isViewingDetails.data)}
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold">
                  Turno: <strong className="text-slate-700">{isViewingDetails.turno}</strong> | Referência: <strong className="text-slate-700">{isViewingDetails.enfermeiroReferencia}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsViewingDetails(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-650 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Detailed Body */}
            <div className="p-5 max-h-[500px] overflow-y-auto text-xs grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-4">
                <h4 className="font-extrabold text-slate-800 border-b pb-1">Métricas de Setores Recebidas:</h4>
                <div className="space-y-3">
                  {SECTORS_LIST.map(sectorName => {
                    const metric = isViewingDetails.metricasSetor[sectorName] || {
                      totalPacientes: 0,
                      pacientesVM: 0,
                      pacientesAcamados: 0,
                      altasPrevistas: 0
                    };
                    return (
                      <div key={sectorName} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl space-y-1.5 config_item">
                        <span className="font-black text-slate-705 block uppercase text-[10px] tracking-wide">{sectorName}</span>
                        <div className="grid grid-cols-4 gap-1.5 text-slate-500 text-[10px]">
                          <div>Pacientes: <strong className="text-slate-700">{metric.totalPacientes}</strong></div>
                          <div>Em VM: <strong className="text-slate-700">{metric.pacientesVM}</strong></div>
                          <div>Acamados: <strong className="text-slate-700">{metric.pacientesAcamados}</strong></div>
                          <div>Altas: <strong className="text-slate-700">{metric.altasPrevistas}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-extrabold text-slate-800 border-b pb-1">Status de Profissionais Checkados:</h4>
                <div className="space-y-2.5 divide-y divide-slate-100 pr-1">
                  {isViewingDetails.statusColaboradores.map(c => {
                    return (
                      <div key={c.matricula} className="pt-2 flex items-center justify-between text-[11px]">
                        <div>
                          <p className="font-extrabold text-slate-800">{c.nome} <span className="text-[10px] font-normal text-slate-400">({c.matricula})</span></p>
                          <p className="text-[9px] text-slate-400 uppercase font-semibold">{c.cargo} &bull; Orig: {c.setorOriginal}</p>
                        </div>

                        <div className="text-right">
                          <span className={`inline-block px-1.5 py-0.5 rounded font-black uppercase text-[8px] border ${
                            c.status === 'Presente' 
                              ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                              : c.status === 'Atestado' 
                              ? 'bg-rose-50 border-rose-100 text-rose-700' 
                              : c.status === 'Falta'
                              ? 'bg-amber-50 border-amber-100 text-amber-700'
                              : 'bg-slate-50 border-slate-100 text-slate-600'
                          }`}>
                            {c.status}
                          </span>
                          {c.remanejadoPara && (
                            <span className="block text-[8px] text-indigo-600 font-bold mt-1 uppercase">
                              Remanejado(a) p/ {c.remanejadoPara}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = generateWhatsAppText(
                    isViewingDetails.data,
                    isViewingDetails.turno,
                    isViewingDetails.enfermeiroReferencia,
                    isViewingDetails.statusColaboradores,
                    isViewingDetails.metricasSetor
                  );
                  setIsViewingDetails(null);
                  setViewingReportText(text);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-xs uppercase cursor-pointer"
              >
                Gerar WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setIsViewingDetails(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-250 text-slate-700 font-black rounded-lg text-xs uppercase cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
