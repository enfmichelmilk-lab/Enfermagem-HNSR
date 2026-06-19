/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, CheckCircle, XCircle, Clock, Award, 
  HelpCircle, UserCheck, Timer, FilePlus, Sparkles, 
  HelpCircle as Help, Filter, RefreshCw, ChevronLeft, 
  ChevronRight, Users, Plus, Info, Check, CornerDownRight,
  Printer, Layers, TrendingUp, RefreshCcw, X
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend as RechartsLegend, ResponsiveContainer } from 'recharts';
import { SolicitacaoFolga, Colaborador, Usuario, Absenteismo, Ferias } from '../types';
import { SETORES_HOSPITALARES } from '../data/mockData';
import { subscribeCollection, saveDocument, removeDocument } from '../lib/firebase';
import HapvidaLogo from './HapvidaLogo';

const equipesDisponiveis = ['Todos', 'Diurno A', 'Diurno B', 'Noturno A', 'Noturno B', 'Diarista'];

const isColabOnInssOnDay = (colab: Colaborador, year: number, month: number, day: number): boolean => {
  if (!colab) return false;
  if (colab.inss_check !== 'Sim') return false;
  
  const targetDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const hasRetorno = colab.inss_retorno && colab.inss_retorno.trim() !== '';
  if (!hasRetorno) return true;
  return targetDateStr < colab.inss_retorno;
};

const isColabOnAtestado = (
  matricula: string,
  year: number,
  month: number,
  day: number,
  absenteismoList: Absenteismo[] = []
): boolean => {
  if (!absenteismoList || absenteismoList.length === 0) return false;
  
  const targetDate = new Date(year, month - 1, day, 12, 0, 0);

  return absenteismoList.some(item => {
    if (item.tipo !== 'Atestado') return false;
    if (item.matricula !== matricula) return false;
    if (!item.inicio) return false;

    const dateBeg = new Date(item.inicio + 'T12:00:00');
    if (isNaN(dateBeg.getTime())) return false;

    let durationInDays = 1;
    const durStr = item.duracao ? item.duracao.toLowerCase().trim().replace(',', '.') : '';
    const num = parseFloat(durStr);
    if (!isNaN(num) && /^[0-9.]+\s*$/.test(durStr)) {
      durationInDays = num;
    } else if (durStr.includes('hora')) {
      const match = durStr.match(/(\d+(\.\d+)?)/);
      durationInDays = match ? parseFloat(match[0]) / 24 : 1;
    } else if (durStr.includes('dia')) {
      const match = durStr.match(/(\d+(\.\d+)?)/);
      durationInDays = match ? parseFloat(match[0]) : 1;
    }

    const dateEnd = new Date(dateBeg);
    dateEnd.setDate(dateEnd.getDate() + Math.ceil(durationInDays) - 1);

    return targetDate >= dateBeg && targetDate <= dateEnd;
  });
};

const colabMatchesSector = (colabSector: string, filterValue: string | string[]) => {
  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0 || filterValue.includes('Todos')) return true;
    return filterValue.some(val => {
      if (val === 'Unidade de Internação') {
        const sec = colabSector.toUpperCase();
        return (sec.includes('ANDAR') || sec.includes('UI')) && !sec.includes('UTI');
      }
      if (val === 'UTI') {
        return colabSector.toUpperCase().includes('UTI');
      }
      return colabSector === val;
    });
  }

  if (filterValue === 'Todos') return true;
  if (filterValue === 'Unidade de Internação') {
    const sec = colabSector.toUpperCase();
    return (sec.includes('ANDAR') || sec.includes('UI')) && !sec.includes('UTI');
  }
  if (filterValue === 'UTI') {
    return colabSector.toUpperCase().includes('UTI');
  }
  return colabSector === filterValue;
};

const belongsToEquipe = (colab: Colaborador, equipeFilter: string) => {
  if (equipeFilter === 'Todos') return true;
  const eq = colab.equipe?.toLowerCase() || '';
  if (equipeFilter === 'Diurno A') return eq === 'diurno a' || eq === 'turno diurno a' || eq.includes('diurno a');
  if (equipeFilter === 'Diurno B') return eq === 'diurno b' || eq === 'turno diurno b' || eq.includes('diurno b');
  if (equipeFilter === 'Noturno A') return eq === 'noturno a' || eq === 'turno noturno a' || eq.includes('noturno a');
  if (equipeFilter === 'Noturno B') return eq === 'noturno b' || eq === 'turno noturno b' || eq.includes('noturno b');
  if (equipeFilter === 'Diarista') return eq === 'diário' || eq === 'diario' || eq === 'diarista' || eq.includes('diário') || eq.includes('diario') || eq.includes('diarista');
  return false;
};

const getCategoryForColab = (c: Colaborador): 'Gestão' | 'Unidade de Internação' | 'PSA | PSI | UTI' | 'Centro Cirurgico' => {
  const normCargo = (c.cargo || '').toUpperCase();
  const normSetor = (c.setor || '').toUpperCase();

  // 1. Gestão
  if (
    normCargo.includes('SUPERVISOR') ||
    normCargo.includes('COORDENADOR') ||
    normCargo.includes('GERENTE') ||
    normSetor.includes('GESTÃO') ||
    normSetor.includes('GESTAO') ||
    normSetor.includes('COORDENAÇÃO') ||
    normSetor.includes('COORDENACAO') ||
    normSetor.includes('LIDERANÇA') ||
    normSetor.includes('LIDERANCA')
  ) {
    return 'Gestão';
  }

  // 2. Centro Cirurgico
  if (
    normSetor.includes('CENTRO CIRURGICO') ||
    normSetor.includes('CENTRO CIRÚRGICO') ||
    normSetor.includes('CC') ||
    normSetor.includes('CME')
  ) {
    return 'Centro Cirurgico';
  }

  // 3. PSA | PSI | UTI
  if (
    normSetor.includes('UTI') ||
    normSetor.includes('PSA') ||
    normSetor.includes('PSI') ||
    normSetor.includes('PRONTO') ||
    (normCargo.includes('FOLGUISTA') && (normCargo.includes('UTI') || normCargo.includes('PS')))
  ) {
    return 'PSA | PSI | UTI';
  }

  // 4. Default: Unidade de Internação
  return 'Unidade de Internação';
};

interface FolgasViewProps {
  solicitacoes: SolicitacaoFolga[];
  colaboradores: Colaborador[];
  absenteismo?: Absenteismo[];
  usuarioLogado: Usuario;
  onUpdateSolicitacoes: (novasSols: SolicitacaoFolga[]) => void;
  onUpdateColaboradores: (novosColabs: Colaborador[]) => void;
  ferias?: Ferias[];
}

export default function FolgasView({ 
  solicitacoes, colaboradores, absenteismo = [], usuarioLogado, 
  onUpdateSolicitacoes, onUpdateColaboradores, ferias = []
}: FolgasViewProps) {
  
  // Date selection states
  const [currentYear, setCurrentYear] = useState(2026);
  // Default to June (6) since initial mock requests are in June 2026
  const [currentMonth, setCurrentMonth] = useState(6);
  const [selectedSetor, setSelectedSetor] = useState('Todos');

  // Tab and Compare states
  const [activeTab, setActiveTab] = useState<'escala' | 'comparar'>('escala');
  const [compareSetor, setCompareSetor] = useState('Todos');
  const [comparePlantao, setComparePlantao] = useState('Todos');
  const [compareCargo, setCompareCargo] = useState('Todos');
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [printLayoutMode, setPrintLayoutMode] = useState<'escala_setor_sem' | 'escala_setor_com' | 'escala_comparar_enf' | 'escala_comparar_tec'>('escala_setor_sem');

  const canImmediateApprove = useMemo(() => {
    const perfil = usuarioLogado?.perfil || '';
    return perfil === 'Supervisor(a)' || 
           perfil === 'Coordenador(a)' || 
           perfil === 'Gerente' || 
           perfil === 'Programador';
  }, [usuarioLogado]);

  const getColabStatus = React.useCallback((colab: Colaborador) => {
    const hasDateSaida = !!colab.datarecisao;
    const hasReposition = hasDateSaida && (
      (colab.infosubst && colab.infosubst.trim() !== '') ||
      colaboradores.some(other => other.matricula !== colab.matricula && !other.datarecisao && other.infosubst === colab.matricula)
    );

    return {
      shouldRemove: hasDateSaida && hasReposition,
      displayName: hasDateSaida ? 'VAGA' : colab.nome,
      isVaga: hasDateSaida
    };
  }, [colaboradores]);

  // New Single-Shift Four-Quadro Comparison States
  const [compareEquipe1, setCompareEquipe1] = useState('Noturno B');
  const [selectedDay1, setSelectedDay1] = useState(1);
  const [compareRoleMode, setCompareRoleMode] = useState<'enfermeiros' | 'tecnicos_auxiliares'>('enfermeiros');

  // Load initial remanejamentos from Firestore cloud and keep updated in real-time
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

  const handleExportClick = (tipo: 'com' | 'sem') => {
    // Generate CSV content of the four comparison quadros
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += `ESCALA DE COMPARACAO - ${monthNames[currentMonth - 1].toUpperCase()} DE ${currentYear}\n`;
    csv += `Categoria: ${compareRoleMode === 'enfermeiros' ? 'Enfermeiros' : 'Técnicos e Auxiliares'}\n`;
    csv += `Turno/Equipe: ${compareEquipe1 === 'Todos' ? 'Todos os Turnos (A+B+Diaristas)' : compareEquipe1}\n`;
    csv += `Remanejamentos: ${tipo === 'com' ? 'EXIBIDOS (COM REMANEJAMENTO)' : 'OCULTADOS (SEM REMANEJAMENTO)'}\n\n`;

    const quadros = [
      { name: 'Gestão', colabs: gestaoColabs },
      { name: 'Unidade de Internação', colabs: unidadeInternacaoColabs },
      { name: 'PSA | PSI | UTI', colabs: psaPsiUtiColabs },
      { name: 'Centro Cirúrgico', colabs: centroCirurgicoColabs }
    ];

    quadros.forEach(q => {
      csv += `QUADRO: ${q.name.toUpperCase()} (Total: ${q.colabs.length} profissionais)\n`;
      csv += `Nome;Cargo;Matricula;Setor;`;
      for (let d = 1; d <= daysInMonth; d++) {
        csv += `${d};`;
      }
      csv += '\n';

      q.colabs.forEach(colab => {
        const colabName = colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome;
        csv += `${colabName};${colab.cargo};${colab.matricula};${colab.setor};`;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const hasInss = isColabOnInssOnDay(colab, currentYear, currentMonth, d);
          const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, d, absenteismo);
          const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
          const { isWorkDay } = checkRosteredStatus(colab, d);
          const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];

          let cellVal = '';
          if (hasInss) {
            cellVal = 'INSS';
          } else if (hasAtestado) {
            cellVal = 'AT';
          } else if (req && req.status === 'Aprovado') {
            cellVal = getShorthand(req.tipo);
          } else if (tipo === 'com' && remSector) {
            cellVal = `REM (${remSector})`;
          } else if (isWorkDay) {
            cellVal = 'P';
          } else {
            cellVal = 'EF';
          }
          csv += `${cellVal};`;
        }
        csv += '\n';
      });

      csv += '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `escala_comparacao_quadros_${tipo === 'com' ? 'com_remanejamento' : 'sem_remanejamento'}_${currentMonth}_${currentYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper: check if a collaborator is on vacation on a day
  const isColabOnFeriasOnDay = (matricula: string, dNum: number) => {
    const targetDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    return ferias.some(f => {
      if (f.matricula !== matricula) return false;
      if (f.status !== 'Aprovado') return false; // Only approved vacations reflect on scale
      return targetDateStr >= f.dataInicio && targetDateStr <= f.dataFim;
    });
  };

  // Active state calculation helper for column totals
  const isColabActiveOnDay = (colab: Colaborador, dNum: number) => {
    // Explicitly exclude VAGA (vacant/terminated) profiles from the daily staff summation calculations
    if (getColabStatus(colab).isVaga) {
      return false;
    }
    if (isColabOnInssOnDay(colab, currentYear, currentMonth, dNum)) {
      return false;
    }
    if (isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo)) {
      return false;
    }
    if (isColabOnFeriasOnDay(colab.matricula, dNum)) {
      return false; // discounted because they are on vacation (férias)
    }
    const { isWorkDay } = checkRosteredStatus(colab, dNum);
    if (!isWorkDay) return false;

    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
    if (req && req.status === 'Aprovado') {
      return false; // they are on approved leave, hence not active on duty
    }
    return true;
  };

  // Sector Toggle Helper For Multiple Selection
  const handleSectorToggle = (
    sector: string, 
    currentSelection: string[], 
    setSelection: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (sector === 'Todos') {
      setSelection(['Todos']);
      return;
    }

    let nextSelection = currentSelection.filter(s => s !== 'Todos');

    if (nextSelection.includes(sector)) {
      nextSelection = nextSelection.filter(s => s !== sector);
    } else {
      nextSelection.push(sector);
    }

    if (nextSelection.length === 0) {
      nextSelection = ['Todos'];
    }
    setSelection(nextSelection);
  };

  // Helper to format selections list
  const getSectorsLabel = (sectors: string[]) => {
    if (sectors.includes('Todos')) return 'Todos os Setores';
    
    const formatted = sectors.map(s => {
      if (s === 'Unidade de Internação') return 'Unidade de Internação';
      if (s === 'UTI') return 'Geral de UTI';
      return s;
    });

    if (formatted.length <= 2) {
      return formatted.join(', ');
    }
    return `${formatted[0]} e +${formatted.length - 1}`;
  };

  // Role identification helper functions
  const isEnfermeiroFn = (cargo: string) => {
    const c = cargo ? cargo.toLowerCase() : '';
    if (c.includes('tec') || c.includes('aux') || c.includes('tecnico') || c.includes('técnico') || c.includes('auxiliar')) return false;
    return c.includes('enf') || c.includes('coordenador') || c.includes('supervisor') || c.includes('gerente') || c.includes('direto');
  };

  const isTecnicoOuAuxiliarFn = (cargo: string) => {
    const c = cargo ? cargo.toLowerCase() : '';
    return c.includes('tec') || c.includes('aux') || c.includes('tecnico') || c.includes('técnico') || c.includes('auxiliar');
  };

  // Master Single-Shift filtered comparison list
  const activeComparativoColabs = useMemo(() => {
    return colaboradores
      .filter(c => {
        if (getColabStatus(c).shouldRemove) return false;

        const equipeMatch = belongsToEquipe(c, compareEquipe1);
        
        let roleMatch = true;
        if (compareRoleMode === 'enfermeiros') {
          roleMatch = isEnfermeiroFn(c.cargo);
        } else if (compareRoleMode === 'tecnicos_auxiliares') {
          roleMatch = isTecnicoOuAuxiliarFn(c.cargo);
        }

        return equipeMatch && roleMatch;
      })
      .sort((a, b) => {
        const aCargo = a.cargo?.toLowerCase() || '';
        const bCargo = b.cargo?.toLowerCase() || '';
        const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') || aCargo.includes('coordenador') || aCargo.includes('supervisor') ? 1 : 0;
        const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') || bCargo.includes('coordenador') || bCargo.includes('supervisor') ? 1 : 0;
        if (aIsEnf !== bIsEnf) return bIsEnf - aIsEnf;
        return a.nome.localeCompare(b.nome);
      });
  }, [colaboradores, compareEquipe1, compareRoleMode, getColabStatus]);

  // Subdivided lists for the four quadros exactly as determined
  const gestaoColabs = useMemo(() => activeComparativoColabs.filter(c => getCategoryForColab(c) === 'Gestão'), [activeComparativoColabs]);
  const unidadeInternacaoColabs = useMemo(() => activeComparativoColabs.filter(c => getCategoryForColab(c) === 'Unidade de Internação'), [activeComparativoColabs]);
  const psaPsiUtiColabs = useMemo(() => activeComparativoColabs.filter(c => getCategoryForColab(c) === 'PSA | PSI | UTI'), [activeComparativoColabs]);
  const centroCirurgicoColabs = useMemo(() => activeComparativoColabs.filter(c => getCategoryForColab(c) === 'Centro Cirurgico'), [activeComparativoColabs]);

  // Backward-compatibility references for parts that expect group1Colabs/group2Colabs
  const group1Colabs = activeComparativoColabs;
  const group2Colabs = activeComparativoColabs;

  // Modal State for visual cell-clicks
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTargetColab, setModalTargetColab] = useState<Colaborador | null>(null);
  const [modalTargetDate, setModalTargetDate] = useState(''); // YYYY-MM-DD
  const [modalExistingFolga, setModalExistingFolga] = useState<SolicitacaoFolga | null>(null);
  
  // Form input inside the modal
  const [modalTipoFolga, setModalTipoFolga] = useState<'Folga de Escala' | 'Banco de Horas' | 'Folga Feriado' | 'Folga Enfermagem' | 'Folga Brigada' | 'Folga Eleição' | 'Integração' | 'Falta' | 'Folga Troca de Plantão'>('Folga de Escala');
  const [modalImmediateApproval, setModalImmediateApproval] = useState(true);
  const [modalCustomRemSetor, setModalCustomRemSetor] = useState('');

  // Toggle for extra metadata columns to adjust horizontal space
  const [showAppSupportColumns, setShowAppSupportColumns] = useState(true);

  // Month Navigation Helper
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // Number of days in the selected month
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  // Day names for the month headers
  const getDayOfWeekDetails = (day: number) => {
    const date = new Date(currentYear, currentMonth - 1, day);
    const dayOfWeek = date.getDay();
    const letters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // D, S, T...
    const names = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return {
      letter: letters[dayOfWeek],
      name: names[dayOfWeek],
      isWeekend,
      dayOfWeek
    };
  };

  // Get active unique sectors from employees
  const setoresDisponiveis = useMemo(() => {
    const sets = new Set(colaboradores.map(c => c.setor));
    return ['Todos', ...Array.from(sets).sort()];
  }, [colaboradores]);

  // Composite sectors list for dropdown selection
  const listSectorsForComparison = useMemo(() => {
    const base = [...setoresDisponiveis];
    const hasUI = colaboradores.some(c => {
      const sec = c.setor.toUpperCase();
      return (sec.includes('ANDAR') || sec.includes('UI')) && !sec.includes('UTI');
    });
    const hasUTI = colaboradores.some(c => c.setor.toUpperCase().includes('UTI'));
    
    const finalSectors = ['Todos'];
    if (hasUI) finalSectors.push('Unidade de Internação');
    if (hasUTI) finalSectors.push('UTI');
    base.forEach(s => {
      if (s !== 'Todos' && !finalSectors.includes(s)) {
        finalSectors.push(s);
      }
    });
    return finalSectors;
  }, [setoresDisponiveis, colaboradores]);

  // Shorten cargo labels for comparison grid
  const formatCargoAbbreviated = (cargo: string) => {
    const cLower = cargo.toLowerCase();
    if (cLower.includes('auxiliar') || cLower.includes('aux.')) return 'Aux. Enf.';
    if (cLower.includes('técnico') || cLower.includes('tecnico') || cLower.includes('tec.')) return 'Téc. Enf.';
    if (cLower.includes('enfermeiro') || cLower.includes('enfermeira') || cLower.includes('enf')) return 'Enf.';
    if (cLower.includes('supervisor') || cLower.includes('superv')) return 'Supervisor(a)';
    if (cLower.includes('coordenador') || cLower.includes('coord')) return 'Coord. Enf.';
    return cargo;
  };

  // Format bancohoras decimals to HH:MM format like "-01:08" or "15:56"
  const formatBHValue = (bancoHoras: number) => {
    if (bancoHoras === 0 || isNaN(bancoHoras)) return '';
    const isNegative = bancoHoras < 0;
    const absHours = Math.abs(bancoHoras);
    const hours = Math.floor(absHours);
    const minutes = Math.round((absHours - hours) * 60);
    const sign = isNegative ? '-' : '+';
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    return `${sign}${formattedHours}:${formattedMinutes}`;
  };

  // Set default sector to logged-in user's sector if it matches
  React.useEffect(() => {
    if (selectedSetor === 'Todos' && usuarioLogado.setor && usuarioLogado.perfil !== 'Enfermeiro(a)') {
      setSelectedSetor(usuarioLogado.setor);
    }
  }, [usuarioLogado, selectedSetor]);

  // Role-Based Collaborators Filtering
  const filteredColaboradores = useMemo(() => {
    let list = [];
    if (usuarioLogado.perfil === "Enfermeiro(a)") {
      // Enfermeiro: sees themselves and direct reports (liderados)
      list = colaboradores.filter(c => {
        const isSelf = c.nome.toLowerCase() === usuarioLogado.nome.toLowerCase() || 
                       c.email.toLowerCase() === usuarioLogado.email.toLowerCase();
        const isDirectSubordinate = c.gestordireto.toLowerCase() === usuarioLogado.nome.toLowerCase();
        const isIndirectSubordinate = c.gestorindireto.toLowerCase() === usuarioLogado.nome.toLowerCase();
        return isSelf || isDirectSubordinate || isIndirectSubordinate;
      });
    } else {
      // Supervisor(a), Coordenador(a), Gerente: see everyone, filterable by sector
      if (selectedSetor && selectedSetor !== 'Todos') {
        list = colaboradores.filter(c => c.setor === selectedSetor);
      } else {
        list = colaboradores;
      }
    }
    // Filter out if replacement is signaled
    return list.filter(c => !getColabStatus(c).shouldRemove);
  }, [colaboradores, usuarioLogado, selectedSetor, getColabStatus]);

  // Role-Based Solicitations Filtering
  const filteredSolicitacoes = useMemo(() => {
    const perfil = usuarioLogado?.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    const isEnfermeiro = perfil === "enfermeiro(a)" || perfil === "enfermeiro" || perfil === "enfermeira";
    
    if (isEnfermeiro) {
      const uNome = usuarioLogado.nome ? usuarioLogado.nome.trim().toLowerCase() : "";
      const uEmail = usuarioLogado.email ? usuarioLogado.email.trim().toLowerCase() : "";
      
      return solicitacoes.filter(s => {
        const colab = colaboradores.find(c => c.matricula === s.matricula);
        if (colab) {
          const colabGestorDireto = colab.gestordireto ? colab.gestordireto.trim().toLowerCase() : "";
          const colabGestorIndireto = colab.gestorindireto ? colab.gestorindireto.trim().toLowerCase() : "";
          const colabEmail = colab.email ? colab.email.trim().toLowerCase() : "";
          const colabNome = colab.nome ? colab.nome.trim().toLowerCase() : "";
          
          return colabGestorDireto === uNome || 
                 colabGestorIndireto === uNome || 
                 colabEmail === uEmail || 
                 colabNome === uNome;
        }
        return false;
      });
    }
    return solicitacoes;
  }, [solicitacoes, colaboradores, usuarioLogado]);

  // Fast O(1) solicitations lookup map indexed by `${matricula}-${date_str}`
  const solicitacoesLookup = useMemo(() => {
    const map: Record<string, SolicitacaoFolga> = {};
    solicitacoes.forEach(sol => {
      // Ignore strictly refused requests since they shouldn't occupy scale space, or we can index them in case
      if (sol.status !== 'Recusado') {
        map[`${sol.matricula}-${sol.data}`] = sol;
      }
    });
    return map;
  }, [solicitacoes]);

  // Helper: check if a day is a rostered duty day OR rostered rest day
  const checkRosteredStatus = (colab: Colaborador, dayNum: number) => {
    const { dayOfWeek } = getDayOfWeekDetails(dayNum);
    const equipeType = colab.equipe || '';

    let isWorkDay = false;
    let explanation = '';

    if (equipeType.includes('Diário') || equipeType.toLowerCase().includes('diarista')) {
      // Diário is Mon-Fri duty, Sat-Sun rest
      isWorkDay = dayOfWeek !== 0 && dayOfWeek !== 6;
      explanation = isWorkDay ? 'Regime Diário (Segunda a Sexta-feira)' : 'Roteiro de Descanso de Final de Semana';
    } else if (equipeType.includes('A')) {
      // Turno A: Odd days duty normally, but in June B is Odd and A is Even
      if (currentMonth === 6) {
        isWorkDay = dayNum % 2 === 0;
        explanation = isWorkDay ? 'Plantão Escalado A (Dias Pares em Junho)' : 'Folga Regular de Reciprocidade (Plantão 12x36)';
      } else {
        isWorkDay = dayNum % 2 !== 0;
        explanation = isWorkDay ? 'Plantão Escalado A (Dias Ímpares)' : 'Folga Regular de Reciprocidade (Plantão 12x36)';
      }
    } else if (equipeType.includes('B')) {
      // Turno B: Even days duty normally, but in June B is Odd and A is Even
      if (currentMonth === 6) {
        isWorkDay = dayNum % 2 !== 0;
        explanation = isWorkDay ? 'Plantão Escalado B (Dias Ímpares em Junho)' : 'Folga Regular de Reciprocidade (Plantão 12x36)';
      } else {
        isWorkDay = dayNum % 2 === 0;
        explanation = isWorkDay ? 'Plantão Escalado B (Dias Pares)' : 'Folga Regular de Reciprocidade (Plantão 12x36)';
      }
    } else {
      // Fallback
      if (currentMonth === 6) {
        isWorkDay = dayNum % 2 === 0;
        explanation = 'Plantão A (Dias Pares em Junho)';
      } else {
        isWorkDay = dayNum % 2 !== 0;
        explanation = 'Plantão A/Alternado';
      }
    }

    return { isWorkDay, explanation };
  };

  // Calculation of historical active presence counts for comparative charts of the four requested quadros
  const comparisonData = useMemo(() => {
    const data = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const activeColabs = colaboradores.filter(c => {
        if (getColabStatus(c).shouldRemove) return false;

        const equipeMatch = belongsToEquipe(c, compareEquipe1);
        
        let roleMatch = true;
        if (compareRoleMode === 'enfermeiros') {
          roleMatch = isEnfermeiroFn(c.cargo);
        } else if (compareRoleMode === 'tecnicos_auxiliares') {
          roleMatch = isTecnicoOuAuxiliarFn(c.cargo);
        }

        return equipeMatch && roleMatch && isColabActiveOnDay(c, d);
      });

      const gestao = activeColabs.filter(c => getCategoryForColab(c) === 'Gestão').length;
      const ui = activeColabs.filter(c => getCategoryForColab(c) === 'Unidade de Internação').length;
      const psa = activeColabs.filter(c => getCategoryForColab(c) === 'PSA | PSI | UTI').length;
      const cc = activeColabs.filter(c => getCategoryForColab(c) === 'Centro Cirurgico').length;

      data.push({
        dia: d,
        "Gestão": gestao,
        "Unidade de Internação": ui,
        "PSA | PSI | UTI": psa,
        "Centro Cirúrgico": cc,
        "Total": gestao + ui + psa + cc
      });
    }
    return data;
  }, [colaboradores, daysInMonth, currentYear, currentMonth, compareEquipe1, compareRoleMode, getColabStatus, isColabActiveOnDay]);

  // Abbreviations Helper
  const getShorthand = (tipo: string): string => {
    switch (tipo) {
      case 'Folga de Escala': return 'F';
      case 'Banco de Horas': return 'BH';
      case 'Folga Feriado': return 'FF';
      case 'Folga Enfermagem': return 'FE';
      case 'Folga Brigada': return 'B';
      case 'Folga Eleição': return 'E';
      case 'Integração': return 'I';
      case 'Falta': return 'A';
      case 'Folga Troca de Plantão': return 'X';
      default: return 'F';
    }
  };

  // Full labels translation
  const getFullLabel = (tipo: string) => {
    switch (tipo) {
      case 'Folga de Escala': return 'Folga (F)';
      case 'Banco de Horas': return 'Banco de Horas (BH)';
      case 'Folga Feriado': return 'Folga Feriado (FF)';
      case 'Folga Enfermagem': return 'Folga Enfermagem (FE)';
      case 'Folga Brigada': return 'Brigada de Incêndio (B)';
      case 'Folga Eleição': return 'Eleição (E)';
      case 'Integração': return 'Integração (I)';
      case 'Falta': return 'Ausente - Falta s/ justificativa (A)';
      case 'Folga Troca de Plantão': return 'Descanso por Troca de Plantão (X)';
      default: return tipo;
    }
  };

  // Action: Open Modal to register or manage a folga
  const handleCellClick = (colab: Colaborador, dayNum: number) => {
    const formattedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const existing = solicitacoesLookup[`${colab.matricula}-${formattedDate}`] || null;

    setModalTargetColab(colab);
    setModalTargetDate(formattedDate);
    setModalExistingFolga(existing);
    
    // Set current remSetor if it exists
    const remKey = `${colab.matricula}-${formattedDate}`;
    setModalCustomRemSetor(remanejamentos[remKey] || '');
    
    // Default form inputs
    setModalTipoFolga('Folga de Escala');
    // Supervisors approval auto-enabled, Nurses file pending
    setModalImmediateApproval(
      usuarioLogado.perfil === 'Supervisor(a)' || 
      usuarioLogado.perfil === 'Coordenador(a)' || 
      usuarioLogado.perfil === 'Gerente' || 
      usuarioLogado.perfil === 'Programador'
    );
    setIsModalOpen(true);
  };

  const handleSaveRemanejamento = async () => {
    if (!modalTargetColab) return;
    const remKey = `${modalTargetColab.matricula}-${modalTargetDate}`;
    if (modalCustomRemSetor.trim() === '') {
      await removeDocument('remanejamentos', remKey);
      setRemanejamentos(prev => {
        const next = { ...prev };
        delete next[remKey];
        return next;
      });
    } else {
      const data = { id: remKey, setor: modalCustomRemSetor.trim() };
      await saveDocument('remanejamentos', remKey, data);
      setRemanejamentos(prev => ({
        ...prev,
        [remKey]: modalCustomRemSetor.trim()
      }));
    }
    alert("Remanejamento atualizado com sucesso!");
    setIsModalOpen(false);
  };

  // Action: Launch new leave request (from inline modal)
  const handleLaunchFolgaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTargetColab) return;

    // Balance checks if type is limited
    if (modalTargetColab) {
      if (modalTipoFolga === 'Banco de Horas' && modalTargetColab.bancohoras <= 0) {
        alert(`Aviso: O colaborador selecionado não possui saldo positivo de Banco de Horas (${modalTargetColab.bancohoras}h).`);
        return;
      }
      if (modalTipoFolga === 'Folga Enfermagem' && modalTargetColab.folgaenf <= 0) {
        alert(`Aviso: O colaborador possui saldo insuficiente para Folga Enfermagem (${modalTargetColab.folgaenf} dia[s]).`);
        return;
      }
      if (modalTipoFolga === 'Folga Feriado' && modalTargetColab.folgaferiado <= 0) {
        alert(`Aviso: O colaborador possui saldo insuficiente para Folga Feriado (${modalTargetColab.folgaferiado} dia[s]).`);
        return;
      }
      if (modalTipoFolga === 'Folga Brigada' && modalTargetColab.brigada <= 0) {
        alert(`Aviso: Saldo insuficiente de Folga Brigada (${modalTargetColab.brigada} dia[s]).`);
        return;
      }
      if (modalTipoFolga === 'Folga Eleição' && modalTargetColab.eleicao <= 0) {
        alert(`Aviso: Saldo insuficiente de Eleição (${modalTargetColab.eleicao} dia[s]).`);
        return;
      }
      // Enforce at most 2 Folga de Escala (FS) per month
      if (modalTipoFolga === 'Folga de Escala') {
        const parts = modalTargetDate.split('-');
        const targetMonthPrefix = `${parts[0]}-${parts[1]}`;
        const existingCount = solicitacoes.filter(s => 
          s.matricula === modalTargetColab.matricula && 
          s.tipo === 'Folga de Escala' && 
          s.status === 'Aprovado' && 
          s.data.startsWith(targetMonthPrefix)
        ).length;

        if (existingCount >= 2) {
          alert(`Erro: O limite máximo de 2 Folgas de Escala por direito ao mês foi atingido para este colaborador neste mês (${parts[1]}/${parts[0]}).`);
          return;
        }
      }
    }

    const isSupervisor = 
      usuarioLogado.perfil === 'Supervisor(a)' || 
      usuarioLogado.perfil === 'Coordenador(a)' || 
      usuarioLogado.perfil === 'Gerente' || 
      usuarioLogado.perfil === 'Programador';
    const statusDesejado = (isSupervisor && modalImmediateApproval) ? 'Aprovado' : 'Pendente';

    const novaSolicitacao: SolicitacaoFolga = {
      id: `F-${Math.floor(100 + Math.random() * 900)}`,
      colaborador: modalTargetColab.nome,
      matricula: modalTargetColab.matricula,
      tipo: modalTipoFolga,
      data: modalTargetDate,
      status: statusDesejado,
      solicitante: usuarioLogado.nome || 'Gestor Enfermagem',
      dataCriacao: new Date().toLocaleString('pt-BR').slice(0, 16)
    };

    // Apply immediate discount on balances if pre-approved
    if (statusDesejado === 'Aprovado') {
      let updatedColab = { ...modalTargetColab };
      const carimboLog = `[${new Date().toLocaleString('pt-BR')} - ${usuarioLogado.nome}]: Lançado e aprovado folga imediata (${modalTipoFolga}) para o dia ${modalTargetDate.split('-').reverse().join('/')}.`;

      if (modalTipoFolga === 'Banco de Horas') {
        updatedColab.bancohoras = Math.max(0, modalTargetColab.bancohoras - 12);
      } else if (modalTipoFolga === 'Folga Enfermagem') {
        updatedColab.folgaenf = Math.max(0, modalTargetColab.folgaenf - 1);
      } else if (modalTipoFolga === 'Folga Feriado') {
        updatedColab.folgaferiado = Math.max(0, modalTargetColab.folgaferiado - 1);
      } else if (modalTipoFolga === 'Folga Brigada') {
        updatedColab.brigada = Math.max(0, modalTargetColab.brigada - 1);
      } else if (modalTipoFolga === 'Folga Eleição') {
        updatedColab.eleicao = Math.max(0, modalTargetColab.eleicao - 1);
      }

      updatedColab.historico = carimboLog + (updatedColab.historico ? "\n\n" + updatedColab.historico : "");
      
      const novosColabs = colaboradores.map(c => c.matricula === modalTargetColab.matricula ? updatedColab : c);
      onUpdateColaboradores(novosColabs);
    }

    onUpdateSolicitacoes([novaSolicitacao, ...solicitacoes]);
    alert(statusDesejado === 'Aprovado' 
      ? `Folga concedida e registrada. Saldo debitado do profissional.` 
      : "Solicitação enviada! Aguardando homologação superior."
    );

    setIsModalOpen(false);
  };

  // Action: Approve leave request inline
  const handleApproveInline = (sol: SolicitacaoFolga) => {
    // Enforce 2 Folga de Escala limit when approving
    if (sol.tipo === 'Folga de Escala') {
      const parts = sol.data.split('-');
      const targetMonthPrefix = `${parts[0]}-${parts[1]}`;
      const existingCount = solicitacoes.filter(s => 
        s.matricula === sol.matricula && 
        s.tipo === 'Folga de Escala' && 
        s.status === 'Aprovado' && 
        s.data.startsWith(targetMonthPrefix) &&
        s.id !== sol.id
      ).length;

      if (existingCount >= 2) {
        alert(`Erro: Não é possível aprovar. O colaborador já possui o limite máximo de 2 Folgas de Escala aprovadas para este mês (${parts[1]}/${parts[0]}).`);
        return;
      }
    }

    const targetColab = colaboradores.find(c => c.matricula === sol.matricula);
    if (targetColab) {
      let updatedColab = { ...targetColab };
      const carimbo = `[${new Date().toLocaleString('pt-BR')} - ${usuarioLogado.nome}]: Folga concedida (${sol.tipo}) para o dia ${sol.data.split('-').reverse().join('/')}.`;

      if (sol.tipo === 'Banco de Horas') {
        updatedColab.bancohoras = Math.max(0, targetColab.bancohoras - 12);
      } else if (sol.tipo === 'Folga Enfermagem') {
        updatedColab.folgaenf = Math.max(0, targetColab.folgaenf - 1);
      } else if (sol.tipo === 'Folga Feriado') {
        updatedColab.folgaferiado = Math.max(0, targetColab.folgaferiado - 1);
      } else if (sol.tipo === 'Folga Brigada') {
        updatedColab.brigada = Math.max(0, targetColab.brigada - 1);
      } else if (sol.tipo === 'Folga Eleição') {
        updatedColab.eleicao = Math.max(0, targetColab.eleicao - 1);
      }

      updatedColab.historico = carimbo + (updatedColab.historico ? "\n\n" + updatedColab.historico : "");

      const novosColabs = colaboradores.map(c => c.matricula === sol.matricula ? updatedColab : c);
      onUpdateColaboradores(novosColabs);
    }

    const novasSols = solicitacoes.map(s => s.id === sol.id ? { ...s, status: 'Aprovado' as const } : s);
    onUpdateSolicitacoes(novasSols);
    alert("Solicitação homologada e aprovada com sucesso!");
    setIsModalOpen(false);
  };

  // Action: Decline leave request inline
  const handleRejectInline = (sol: SolicitacaoFolga) => {
    if (confirm(`Deseja realmente recusar esta solicitação de folga para ${sol.colaborador}?`)) {
      const novasSols = solicitacoes.map(s => s.id === sol.id ? { ...s, status: 'Recusado' as const } : s);
      onUpdateSolicitacoes(novasSols);
      alert("Solicitação recusada.");
      setIsModalOpen(false);
    }
  };

  // Action: Cancel/Delete approved or pending folga with restitution
  const handleCancelInline = (sol: SolicitacaoFolga) => {
    if (confirm(`Deseja realmente excluir/estornar esta folga de ${sol.colaborador}? Qualquer saldo deduzido será devolvido.`)) {
      // Restitution process
      if (sol.status === 'Aprovado') {
        const targetColab = colaboradores.find(c => c.matricula === sol.matricula);
        if (targetColab) {
          let updatedColab = { ...targetColab };
          const carimbo = `[${new Date().toLocaleString('pt-BR')} - ${usuarioLogado.nome}]: Estornada/cancelada folga de ${sol.data.split('-').reverse().join('/')}. Saldo re-creditado.`;

          if (sol.tipo === 'Banco de Horas') {
            updatedColab.bancohoras = targetColab.bancohoras + 12;
          } else if (sol.tipo === 'Folga Enfermagem') {
            updatedColab.folgaenf = targetColab.folgaenf + 1;
          } else if (sol.tipo === 'Folga Feriado') {
            updatedColab.folgaferiado = targetColab.folgaferiado + 1;
          } else if (sol.tipo === 'Folga Brigada') {
            updatedColab.brigada = targetColab.brigada + 1;
          } else if (sol.tipo === 'Folga Eleição') {
            updatedColab.eleicao = targetColab.eleicao + 1;
          }

          updatedColab.historico = carimbo + (updatedColab.historico ? "\n\n" + updatedColab.historico : "");
          const novosColabs = colaboradores.map(c => c.matricula === sol.matricula ? updatedColab : c);
          onUpdateColaboradores(novosColabs);
        }
      }

      const novasSols = solicitacoes.filter(s => s.id !== sol.id);
      onUpdateSolicitacoes(novasSols);
      alert("Folga removida com sucesso!");
      setIsModalOpen(false);
    }
  };

  // Local helper to render a single Quadro table on the comparison page
  const renderQuadroTable = (
    title: string, 
    colabsList: Colaborador[], 
    categoryKey: string
  ) => {
    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Title block */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-650 block" />
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">
              Quadro: {title}
            </h4>
          </div>
          <span className="bg-slate-100 text-slate-705 border border-slate-200 text-[10px] font-black px-2.5 py-1 rounded-lg">
            Profissionais: <b>{colabsList.length}</b>
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs max-w-full font-sans">
          <table 
            style={{ minWidth: showAppSupportColumns ? '1550px' : '1000px' }}
            className="border-collapse table-fixed text-[9px] select-none w-full"
          >
            <thead>
              <tr className="bg-slate-100 text-slate-850 font-extrabold border-b border-slate-350 text-center">
                <th className="w-32 p-1 border-r border-slate-250 bg-slate-100 text-left sticky left-0 z-10 font-black">Colaborador</th>
                <th className="w-11 p-1 border-r border-slate-250 bg-slate-100">BH</th>
                <th className="w-8 p-1 border-r border-slate-250 bg-slate-100">FF</th>
                <th className="w-8 p-1 border-r border-slate-250 bg-slate-100">FS</th>
                {showAppSupportColumns && (
                  <>
                    <th className="w-13 p-1 border-r border-slate-250 bg-slate-100 text-slate-500 font-semibold text-[8px]">Matrícula</th>
                    <th className="w-13 p-1 border-r border-slate-250 bg-slate-100 text-slate-500 font-semibold text-[8px]">Coren</th>
                    <th className="w-14 p-1 border-r border-slate-250 bg-slate-100">Cargo</th>
                    <th className="w-13 p-1 border-r border-slate-300 bg-slate-150 font-semibold">Horário</th>
                  </>
                )}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const dNum = index + 1;
                  const { isWeekend } = getDayOfWeekDetails(dNum);
                  const isFocused = selectedDay1 === dNum;
                  return (
                    <th 
                      key={`hdr-d-${categoryKey}-${dNum}`} 
                      onClick={() => setSelectedDay1(dNum)}
                      className={`w-6 cursor-pointer text-center border-r border-slate-250 transition-all ${
                        isFocused
                          ? 'bg-amber-400 text-slate-900 border-x border-amber-600 scale-105 shadow-xs font-black' 
                          : isWeekend 
                          ? 'bg-rose-50 text-rose-600 font-bold' 
                          : 'bg-slate-100 hover:bg-slate-205'
                      }`}
                      title="Clique para destacar este dia em todos os quadros"
                    >
                      <div className="text-[8px] font-black">{dNum}</div>
                    </th>
                  );
                })}
              </tr>
              <tr className="bg-slate-50 text-slate-700 text-center border-b border-slate-300">
                <td className="p-1 border-r border-slate-200 bg-slate-50 sticky left-0 z-10 text-left font-bold text-slate-400 uppercase text-[7px]">Plantão Focado</td>
                <td className="p-1 border-r border-slate-205"></td>
                <td className="p-1 border-r border-slate-205"></td>
                <td className="p-1 border-r border-slate-205"></td>
                {showAppSupportColumns && (
                  <>
                    <td className="p-1 border-r border-slate-205"></td>
                    <td className="p-1 border-r border-slate-205"></td>
                    <td className="p-1 border-r border-slate-205"></td>
                    <td className="p-1 border-r border-slate-300 bg-slate-100/50"></td>
                  </>
                )}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const dNum = index + 1;
                  const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                  const isFocused = selectedDay1 === dNum;
                  return (
                    <td 
                      key={`hdr-l-${categoryKey}-${dNum}`}
                      onClick={() => setSelectedDay1(dNum)}
                      className={`p-0.5 border-r border-slate-200 font-black cursor-pointer text-[7.5px] uppercase ${
                        isFocused 
                          ? 'bg-amber-300 text-amber-955 font-bold'
                          : isWeekend 
                          ? 'bg-rose-100/60 text-rose-550' 
                          : 'bg-slate-50 text-slate-400'
                      }`}
                    >
                      {letter}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {colabsList.length === 0 ? (
                <tr>
                  <td colSpan={showAppSupportColumns ? 8 + daysInMonth : 4 + daysInMonth} className="p-6 text-center text-slate-400 bg-slate-50/50 italic font-bold">
                    Nenhum profissional localizado para o quadro {title}.
                  </td>
                </tr>
              ) : (
                colabsList.map(colab => {
                  return (
                    <tr key={`r-${categoryKey}-${colab.matricula}`} className="border-b border-slate-200 hover:bg-slate-50/50">
                      <td className={`p-1 font-extrabold border-r border-slate-200 sticky left-0 z-10 bg-white shadow-[1px_0_0_0_rgba(226,232,240,1)] max-w-[128px] truncate text-left text-[8.5px] ${colab.datarecisao ? 'text-rose-600' : 'text-slate-850'}`} title={colab.nome}>
                        {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                      </td>
                      <td className={`p-1 text-center font-mono border-r border-slate-200 text-[8px] font-semibold ${colab.bancohoras < 0 ? 'text-rose-650' : colab.bancohoras > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {formatBHValue(colab.bancohoras)}
                      </td>
                      <td className="p-1 text-center border-r border-slate-200 text-slate-650 font-bold">
                        {colab.folgaferiado || ''}
                      </td>
                      <td className="p-1 text-center border-r border-slate-200 text-slate-650 font-bold">
                        {colab.folgaenf || ''}
                      </td>
                      {showAppSupportColumns && (
                        <>
                          <td className="p-1 text-center text-slate-400 font-mono border-r border-slate-200 whitespace-nowrap text-[8px]">
                            {colab.matricula}
                          </td>
                          <td className="p-1 text-center text-slate-400 font-mono border-r border-slate-200 whitespace-nowrap text-[8px]">
                            {colab.coren || 'N/D'}
                          </td>
                          <td className="p-1 text-center border-r border-slate-200 whitespace-nowrap text-[8px] font-bold text-slate-500" title={colab.cargo}>
                            {formatCargoAbbreviated(colab.cargo)}
                          </td>
                          <td className="p-1 text-center border-r border-slate-300 bg-slate-50/60 font-mono text-[7.5px] font-semibold text-slate-500 whitespace-nowrap">
                            {colab.horario || '19:00/07:05'}
                          </td>
                        </>
                      )}
                      {Array.from({ length: daysInMonth }, (_, index) => {
                        const dNum = index + 1;
                        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                        const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                        const { isWorkDay } = checkRosteredStatus(colab, dNum);
                        const { isWeekend } = getDayOfWeekDetails(dNum);
                        const isFocused = selectedDay1 === dNum;

                        let tdBg = 'bg-white';
                        if (isFocused) {
                          tdBg = 'bg-amber-50/30';
                        } else if (isWeekend) {
                          tdBg = 'bg-slate-100/50';
                        } else if (!isWorkDay) {
                          tdBg = 'bg-slate-50/70';
                        }

                        const hasInss = isColabOnInssOnDay(colab, currentYear, currentMonth, dNum);
                        if (hasInss) {
                          return (
                            <td 
                              key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                              onClick={() => handleCellClick(colab, dNum)} 
                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase bg-rose-50`}
                              title="Afastamento INSS / Licença Ativo"
                            >
                              <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-red-650 text-white border-red-500 font-extrabold font-sans">
                                INSS
                              </span>
                            </td>
                          );
                        }

                        const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo);
                        if (hasAtestado) {
                          return (
                            <td 
                              key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                              onClick={() => handleCellClick(colab, dNum)} 
                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase bg-rose-50`}
                              title="Atestado Médico Ativo (Absenteísmo)"
                            >
                              <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-red-100 text-red-650 border-red-350 font-extrabold font-sans">
                                AT
                              </span>
                            </td>
                          );
                        }

                        const hasFerias = isColabOnFeriasOnDay(colab.matricula, dNum);
                        if (hasFerias) {
                          return (
                            <td 
                              key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                              onClick={() => handleCellClick(colab, dNum)} 
                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase bg-purple-50`}
                              title="Férias de Escala Ativa"
                            >
                              <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-purple-600 text-white border-purple-550 font-extrabold font-sans">
                                F
                              </span>
                            </td>
                          );
                        }

                        if (req) {
                          const isApproved = req.status === 'Aprovado';
                          const shorthand = getShorthand(req.tipo);
                          
                          if (isApproved) {
                            let badgeStyle = 'bg-emerald-100 text-emerald-850 border-emerald-250';
                            if (shorthand === 'FF') {
                              badgeStyle = 'bg-sky-100 text-sky-850 border-sky-250 font-black';
                            } else if (shorthand === 'BH') {
                              badgeStyle = 'bg-amber-100 text-amber-850 border-amber-250';
                            } else if (shorthand === 'FE') {
                              badgeStyle = 'bg-purple-100 text-purple-850 border-purple-250';
                            } else if (shorthand === 'B') {
                              badgeStyle = 'bg-rose-150 text-rose-850 border-rose-300';
                            } else if (shorthand === 'E') {
                              badgeStyle = 'bg-teal-100 text-teal-850 border-teal-200';
                            } else if (shorthand === 'I') {
                              badgeStyle = 'bg-blue-105 text-blue-800 border-blue-200';
                            } else if (shorthand === 'A') {
                              badgeStyle = 'bg-red-100 text-red-800 border-red-200';
                            } else if (shorthand === 'AT') {
                              badgeStyle = 'bg-rose-105 text-rose-850 border-rose-250';
                            }

                            return (
                              <td 
                                key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                                onClick={() => handleCellClick(colab, dNum)} 
                                className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                              >
                                <span className={`block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none ${badgeStyle}`}>
                                  {shorthand}
                                </span>
                              </td>
                            );
                          } else {
                            // Pending, show with question mark
                            return (
                              <td 
                                key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                                onClick={() => handleCellClick(colab, dNum)} 
                                className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                                title={`Solicitação de ${req.tipo} pendente de homologação`}
                              >
                                <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-amber-400 text-slate-900 border-amber-500 font-extrabold font-sans">
                                  {shorthand}?
                                </span>
                              </td>
                            );
                          }
                        }

                        // Evaluate remanejamento
                        const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                        if (remSector) {
                          return (
                            <td 
                              key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                              onClick={() => handleCellClick(colab, dNum)} 
                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                            >
                              <span className="block py-0.5 rounded-sm border text-[7.5px] tracking-tight leading-none bg-teal-50 text-teal-700 border-teal-300 font-bold font-sans truncate" title={`Remanejado para: ${remSector}`}>
                                {remSector}
                              </span>
                            </td>
                          );
                        }

                        if (isWorkDay) {
                          return (
                            <td 
                              key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                              onClick={() => handleCellClick(colab, dNum)} 
                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                            >
                            </td>
                          );
                        }

                        return (
                          <td 
                            key={`td-${categoryKey}-${colab.matricula}-${dNum}`} 
                            onClick={() => handleCellClick(colab, dNum)} 
                            className={`p-0.5 border-r border-slate-200 text-center align-middle font-bold cursor-pointer transition-all ${tdBg}`}
                          />
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-sky-50 font-bold text-sky-950 border-t border-slate-350">
              <tr className="text-center font-black">
                <td className="p-1 border-r border-slate-205 bg-sky-50 text-left sticky left-0 z-10 text-[9.5px]">TOTAIS ATIVOS GERAL:</td>
                <td className="p-1 border-r border-slate-205 text-slate-400 text-[8px]">---</td>
                <td className="p-1 border-r border-slate-205 text-slate-400 text-[8px]">---</td>
                <td className="p-1 border-r border-slate-205 text-slate-400 text-[8px]">---</td>
                {showAppSupportColumns && (
                  <>
                    <td className="p-1 border-r border-slate-205 text-slate-400 text-[8px]">---</td>
                    <td className="p-1 border-r border-slate-205 text-slate-400 text-[8px]">---</td>
                    <td className="p-1 border-r border-slate-205 text-slate-400 text-[8px]">---</td>
                    <td className="p-1 border-r border-slate-300 bg-slate-100/50 text-slate-400 text-[8px]">---</td>
                  </>
                )}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const dNum = index + 1;
                  const activeCount = colabsList.filter(c => isColabActiveOnDay(c, dNum)).length;
                  const isFocused = selectedDay1 === dNum;
                  return (
                    <td 
                      key={`tot-${categoryKey}-${dNum}`}
                      onClick={() => setSelectedDay1(dNum)}
                      className={`p-1 border-r border-slate-200 text-[8.5px] font-black cursor-pointer transition-all ${
                        isFocused 
                          ? 'bg-amber-400 text-amber-955 text-[10px]' 
                          : 'bg-[#FCF8E3] text-amber-900 hover:bg-[#F2EECC]'
                      }`}
                    >
                      {activeCount}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Top Title Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 leading-none">Quadro Relacional de Folgas</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Visualização modular integrada de escalas e plantões (Plantão A / Plantão B)
          </p>
        </div>

        {/* Dynamic Context Tag */}
        <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200 gap-1.5 text-xs font-semibold text-slate-600">
          <div className="bg-white py-1 px-3 rounded-md shadow-xs border border-slate-200/50 flex items-center gap-1.5 text-slate-800">
            <Users className="w-3.5 h-3.5 text-sky-600" />
            <span>Perfil: <b>{usuarioLogado.perfil}</b></span>
          </div>
          <div className="py-1 px-3 flex items-center">
            <span>Setor: {usuarioLogado.setor || 'Geral'}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs + Export Action */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('escala')}
            className={`py-2 px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'escala'
                ? 'bg-white shadow-xs text-slate-800 border border-slate-250'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-sky-600" />
            <span>Escala de Folgas</span>
          </button>
          <button
            onClick={() => setActiveTab('comparar')}
            className={`py-2 px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'comparar'
                ? 'bg-white shadow-xs text-slate-800 border border-slate-250'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Comparador & Cobertura</span>
          </button>
        </div>

        <button
          onClick={() => setIsPrintPreviewOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 px-4 rounded-xl text-xs shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-500 shrink-0"
          title="Exportar Escala de Plantão de Enfermagem em formato PDF otimizado"
        >
          <Printer className="w-3.5 h-3.5 shrink-0" />
          <span>Exportar Escala (PDF)</span>
        </button>
      </div>

      {/* Roster Grid Operations Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        
        {/* Navigations & Filters */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Calendar Stepper */}
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 self-start">
            <button 
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white hover:shadow-xs rounded-lg text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
              title="Mês Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-extrabold text-slate-800 tracking-wide select-none min-w-[130px] text-center">
              {monthNames[currentMonth - 1]} de {currentYear}
            </span>
            <button 
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white hover:shadow-xs rounded-lg text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
              title="Próximo Mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grouping Filters */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {usuarioLogado.perfil !== 'Enfermeiro(a)' ? (
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Filtrar por Setor:</span>
                <select
                  value={selectedSetor}
                  onChange={(e) => setSelectedSetor(e.target.value)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:bg-white focus:border-sky-500 transition-colors cursor-pointer"
                >
                  {setoresDisponiveis.map(setName => (
                    <option key={setName} value={setName}>{setName}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="bg-indigo-50/50 text-indigo-800 text-[11px] font-bold py-1.5 px-3 rounded-lg border border-indigo-100 flex items-center gap-1.5 leading-tight">
                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Exibindo seu auto-registro e a equipe de técnicos sob sua liderança direta</span>
              </div>
            )}

            {/* Clear reset helper */}
            <button 
              onClick={() => {
                setCurrentMonth(6);
                setCurrentYear(2026);
                setSelectedSetor('Todos');
              }}
              className="p-2 hover:bg-slate-50 hover:text-slate-800 text-slate-400 rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer flex items-center gap-1.5 font-bold"
              title="Resetar data e setores"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Gabarito</span>
            </button>
          </div>

        </div>

        {/* Legend block */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/50 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-bold text-slate-500">
          <span className="text-slate-400 uppercase tracking-wider text-[9px]">Gabarito Visual:</span>
          
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-emerald-600 rounded text-white flex items-center justify-center text-[9px] font-extrabold shadow-xs">FS</span>
            <span>Folga de Escala</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-emerald-600 rounded text-white flex items-center justify-center text-[9px] font-extrabold shadow-xs">BH</span>
            <span>Banco de Horas</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-emerald-600 rounded text-white flex items-center justify-center text-[9px] font-extrabold shadow-xs">FF</span>
            <span>Folga Feriado</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-emerald-600 rounded text-white flex items-center justify-center text-[9px] font-extrabold shadow-xs">FE</span>
            <span>Folga Eleitoral</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-emerald-600 rounded text-white flex items-center justify-center text-[9px] font-extrabold shadow-xs">FB</span>
            <span>Folga Brigada</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-amber-400 text-slate-900 rounded flex items-center justify-center text-[9px] font-black shadow-xs tracking-tighter">?</span>
            <span>Solicitação Pendente (Homologar)</span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
            <span className="w-4 h-3.5 bg-white border border-slate-200 rounded"></span>
            <span>Dia Plantão (12h)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-3.5 bg-slate-100 rounded border border-slate-200"></span>
            <span>Dia Descanso Regular (E/F)</span>
          </div>
        </div>

        {/* Dynamic Skeleton table container */}
        {activeTab === 'escala' ? (
          usuarioLogado.perfil !== 'Enfermeiro(a)' ? (
            <div className="space-y-10">
              {['Diurno A', 'Diurno B', 'Noturno A', 'Noturno B', 'Diarista'].map((shiftName) => {
                const belongsToShift = (colab: Colaborador, sName: string) => {
                  const eq = colab.equipe?.toLowerCase() || '';
                  if (sName === 'Diurno A') return eq === 'diurno a' || eq === 'turno diurno a' || eq.includes('diurno a');
                  if (sName === 'Diurno B') return eq === 'diurno b' || eq === 'turno diurno b' || eq.includes('diurno b');
                  if (sName === 'Noturno A') return eq === 'noturno a' || eq === 'turno noturno a' || eq.includes('noturno a');
                  if (sName === 'Noturno B') return eq === 'noturno b' || eq === 'turno noturno b' || eq.includes('noturno b');
                  if (sName === 'Diarista') return eq === 'diário' || eq === 'diario' || eq === 'diarista' || eq.includes('diário') || eq.includes('diario') || eq.includes('diarista');
                  return false;
                };

                const shiftColabs = filteredColaboradores.filter(c => belongsToShift(c, shiftName));
                const sortedShiftColabs = [...shiftColabs].sort((a, b) => {
                  const aCargo = a.cargo?.toLowerCase() || '';
                  const bCargo = b.cargo?.toLowerCase() || '';
                  const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') ? 1 : 0;
                  const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') ? 1 : 0;
                  if (aIsEnf !== bIsEnf) {
                    return bIsEnf - aIsEnf; // nurse first
                  }
                  return a.nome.localeCompare(b.nome);
                });

                return (
                  <div key={shiftName} className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                    {/* Shift heading band */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-600 block" />
                        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                          Equipe {shiftName}
                        </h3>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-50 py-0.5 px-2 rounded-lg border">
                        {shiftColabs.length} Co-colaborador(es)
                      </span>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 max-w-full">
                      <table 
                        style={{ minWidth: showAppSupportColumns ? '1550px' : '1300px' }}
                        className="border-collapse text-[11px] text-slate-600 table-fixed leading-tight"
                      >
                        
                        <thead className="bg-slate-100 text-slate-700 tracking-wide font-extrabold border-b border-slate-200">
                          <tr>
                            <th className="w-44 text-left p-2.5 bg-slate-100 border-r border-slate-200 sticky left-0 z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Colaborador</th>
                            {showAppSupportColumns && (
                              <>
                                <th className="w-18 text-center p-2 border-r border-slate-200 static md:sticky md:left-[176px] z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-slate-100">Escala</th>
                                <th className="w-20 text-center p-2 border-r border-slate-200 static md:sticky md:left-[248px] z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-slate-100">Matrícula</th>
                                <th className="w-24 text-center p-2 border-r border-slate-200 static md:sticky md:left-[328px] z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-slate-100">Cargo</th>
                              </>
                            )}
                            {Array.from({ length: daysInMonth }, (_, index) => {
                              const dNum = index + 1;
                              const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                              return (
                                <th key={dNum} className={`w-9 text-center p-1 border-r border-slate-200 select-none ${isWeekend ? 'bg-rose-50 text-rose-600' : ''}`}>
                                  <div className="text-[10px] opacity-75">{letter}</div>
                                  <div className="text-[12px] font-extrabold">{dNum}</div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>

                        <tbody>
                          {sortedShiftColabs.length > 0 ? (
                            sortedShiftColabs.map((colab) => {
                              const isManagerOrAdminSelf = colab.nome.toLowerCase() === usuarioLogado.nome.toLowerCase();
                              
                              return (
                                <tr key={colab.matricula} className="hover:bg-slate-100/50 transition bg-white">
                                  <td className="p-2.5 font-bold text-slate-800 border-b border-r border-slate-200 bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] overflow-hidden text-ellipsis whitespace-nowrap" title={colab.nome}>
                                    <div className="flex items-center gap-1">
                                      {isManagerOrAdminSelf && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Você" />}
                                      <span className={`${isManagerOrAdminSelf ? 'text-emerald-700' : ''} ${colab.datarecisao ? 'text-rose-600 font-extrabold' : ''}`}>
                                        {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                                      </span>
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-medium tracking-tight mt-0.5">{colab.setor}</div>
                                  </td>

                                  {showAppSupportColumns && (
                                    <>
                                      <td className="p-2 text-center font-bold text-slate-600 border-b border-r border-slate-200 bg-white static md:sticky md:left-[176px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                                        {colab.equipe.replace('Turno ', '').replace('Diurno', 'D').replace('Noturno', 'N')}
                                      </td>

                                      <td className="p-2 text-center text-slate-500 font-mono border-b border-r border-slate-200 bg-white static md:sticky md:left-[248px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                                        {colab.matricula}
                                      </td>

                                      <td className="p-2 text-center text-slate-500 font-medium border-b border-r border-slate-200 bg-white static md:sticky md:left-[328px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap text-ellipsis overflow-hidden">
                                        {colab.cargo}
                                      </td>
                                    </>
                                  )}

                                  {Array.from({ length: daysInMonth }, (_, index) => {
                                    const dNum = index + 1;
                                    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                                    const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                                    const { isWorkDay } = checkRosteredStatus(colab, dNum);

                                    const hasInss = isColabOnInssOnDay(colab, currentYear, currentMonth, dNum);
                                    if (hasInss) {
                                      const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nAfastamento INSS / Licença Ativo`;
                                      return (
                                        <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle bg-rose-50" title={cellTitle}>
                                          <div className="mx-auto w-7 h-7 bg-red-650 text-white border border-red-500 font-extrabold text-[8px] rounded-lg shadow-sm flex items-center justify-center transition-all duration-150 hover:scale-105 select-none font-sans leading-none">
                                            INSS
                                          </div>
                                        </td>
                                      );
                                    }

                                    const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo);
                                    if (hasAtestado) {
                                      const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nAtestado Médico Ativo`;
                                      return (
                                        <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle bg-rose-50" title={cellTitle}>
                                          <div className="mx-auto w-7 h-7 bg-red-100 text-red-600 border border-red-300 font-extrabold text-[10px] rounded-lg shadow-sm flex items-center justify-center transition-all duration-150 hover:scale-105 select-none font-sans">
                                            AT
                                          </div>
                                        </td>
                                      );
                                    }

                                    const hasFerias = isColabOnFeriasOnDay(colab.matricula, dNum);
                                    if (hasFerias) {
                                      const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nFérias de Escala Ativa`;
                                      return (
                                        <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle bg-purple-50" title={cellTitle}>
                                          <div className="mx-auto w-7 h-7 bg-purple-600 hover:bg-purple-700 text-white border border-purple-500 font-extrabold text-[10px] rounded-lg shadow-sm flex items-center justify-center transition-all duration-150 hover:scale-105 select-none font-sans">
                                            F
                                          </div>
                                        </td>
                                      );
                                    }

                                    const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                                    if (remSector) {
                                      const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nRemanejado para o setor: ${remSector}`;
                                      return (
                                        <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle bg-amber-50" title={cellTitle}>
                                          <div className="mx-auto w-7 h-7 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-[8px] rounded-lg shadow-sm flex flex-col items-center justify-center transition-all duration-150 hover:scale-105 select-none font-sans leading-none">
                                            <span className="text-[6px] opacity-75">REM</span>
                                            <span className="text-[7px] truncate max-w-full px-0.5">{remSector}</span>
                                          </div>
                                        </td>
                                      );
                                    }

                                    if (req) {
                                      const isApproved = req.status === 'Aprovado';
                                      const shorthand = getShorthand(req.tipo);
                                      const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nTipo: ${req.tipo}\nStatus: ${req.status}\nSolicitado por: ${req.solicitante}`;

                                      if (isApproved) {
                                        return (
                                          <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle fill-slate-100" title={cellTitle}>
                                            <div className="mx-auto w-7 h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg shadow-sm flex items-center justify-center transition-all duration-150 hover:scale-105 select-none">
                                              {shorthand}
                                            </div>
                                          </td>
                                        );
                                      } else {
                                        return (
                                          <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle" title={cellTitle}>
                                            <div className="mx-auto w-7 h-7 bg-amber-400 hover:bg-amber-500 text-slate-900 font-extrabold text-[10px] rounded-lg shadow-xs flex items-center justify-center animate-pulse transition-all duration-150 hover:scale-105 select-none tracking-tighter" title="Pendente homologar">
                                              {shorthand}?
                                            </div>
                                          </td>
                                        );
                                      }
                                    }

                                    const cellExplanation = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nDia da semana: ${getDayOfWeekDetails(dNum).name}\nStatus: ${isWorkDay ? 'Plantão Escalado' : 'Folga Regular'}`;

                                    return (
                                      <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className={`p-1 border-b border-r border-slate-200 text-center align-middle cursor-pointer transition-all select-none ${isWorkDay ? 'bg-white hover:bg-sky-50' : 'bg-slate-100/70 hover:bg-slate-200/50'}`} title={cellExplanation}>
                                        <span className="text-[9px] opacity-0 hover:opacity-100 text-sky-600 font-bold transition-opacity">+</span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={showAppSupportColumns ? 4 + daysInMonth : 1 + daysInMonth} className="p-6 text-center text-slate-450 font-bold bg-white leading-normal">
                                <span>Nenhum profissional localizado nesta equipe para a visualização atual.</span>
                              </td>
                            </tr>
                          )}

                          {/* Combined Totals row for Técnicos + Auxiliares */}
                          <tr className="bg-sky-50/80 select-none font-bold text-sky-900 border-t-2 border-sky-200">
                            <td className="p-2.5 font-extrabold border-b border-r border-slate-200 bg-sky-50 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] overflow-hidden text-ellipsis whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-sky-600 animate-pulse animate-duration-1000" />
                                <span>Total Técnico + Auxiliar</span>
                              </div>
                            </td>
                             {showAppSupportColumns && (
                               <>
                                 <td className="p-2 text-center border-b border-r border-slate-200 bg-sky-50 static md:sticky md:left-[176px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] font-extrabold font-sans">---</td>
                                 <td className="p-2 text-center border-b border-r border-slate-200 bg-sky-50 static md:sticky md:left-[248px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] font-extrabold font-sans">---</td>
                                 <td className="p-2 text-center border-b border-r border-slate-200 bg-sky-50 static md:sticky md:left-[328px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] font-extrabold overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-sans">Ativos no Dia</td>
                               </>
                             )}
                            {Array.from({ length: daysInMonth }, (_, index) => {
                              const dNum = index + 1;
                              const count = shiftColabs.filter(colab => {
                                const cargoLower = colab.cargo?.toLowerCase() || '';
                                const isTec = cargoLower.includes('tec') || cargoLower.includes('tecnico') || cargoLower.includes('técnico');
                                const isAux = cargoLower.includes('aux') || cargoLower.includes('auxiliar');
                                if (!isTec && !isAux) return false;

                                return isColabActiveOnDay(colab, dNum);
                              }).length;

                              return (
                                <td key={`joint-tot-${dNum}`} className="p-1 border-b border-r border-slate-200 text-center font-black text-xs text-sky-900 bg-sky-50/90 shadow-inner">
                                  {count}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>

                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Standard view for nurse */
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-inner bg-slate-50 max-w-full">
              <table 
                style={{ minWidth: showAppSupportColumns ? '1550px' : '1300px' }}
                className="border-collapse text-[11px] text-slate-600 table-fixed leading-tight"
              >
                <thead className="bg-slate-100 text-slate-700 tracking-wide font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="w-44 text-left p-2.5 bg-slate-100 border-r border-slate-200 sticky left-0 z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Colaborador</th>
                    {showAppSupportColumns && (
                      <>
                        <th className="w-18 text-center p-2 border-r border-slate-200 static md:sticky md:left-[176px] z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-slate-100">Escala</th>
                        <th className="w-20 text-center p-2 border-r border-slate-200 static md:sticky md:left-[248px] z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-slate-100">Matrícula</th>
                        <th className="w-24 text-center p-2 border-r border-slate-200 static md:sticky md:left-[328px] z-15 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-slate-100">Cargo</th>
                      </>
                    )}
                    {Array.from({ length: daysInMonth }, (_, index) => {
                      const dNum = index + 1;
                      const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                      return (
                        <th key={dNum} className={`w-9 text-center p-1 border-r border-slate-200 select-none ${isWeekend ? 'bg-rose-50 text-rose-600' : ''}`}>
                          <div className="text-[10px] opacity-75">{letter}</div>
                          <div className="text-[12px] font-extrabold">{dNum}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const sortedList = [...filteredColaboradores].sort((a, b) => {
                      const aCargo = a.cargo?.toLowerCase() || '';
                      const bCargo = b.cargo?.toLowerCase() || '';
                      const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') ? 1 : 0;
                      const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') ? 1 : 0;
                      if (aIsEnf !== bIsEnf) {
                        return bIsEnf - aIsEnf; // nurse first
                      }
                      return a.nome.localeCompare(b.nome);
                    });

                    return sortedList.length > 0 ? (
                      sortedList.map((colab) => {
                        const isManagerOrAdminSelf = colab.nome.toLowerCase() === usuarioLogado.nome.toLowerCase();
                        return (
                          <tr key={colab.matricula} className="hover:bg-slate-100/50 transition bg-white">
                            <td className="p-2.5 font-bold text-slate-800 border-b border-r border-slate-200 bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] overflow-hidden text-ellipsis whitespace-nowrap" title={colab.nome}>
                              <div className="flex items-center gap-1">
                                {isManagerOrAdminSelf && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Você" />}
                                <span className={`${isManagerOrAdminSelf ? 'text-emerald-700' : ''} ${colab.datarecisao ? 'text-rose-600 font-extrabold' : ''}`}>
                                  {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                                </span>
                              </div>
                              <div className="text-[9px] text-slate-400 font-medium tracking-tight mt-0.5">{colab.setor}</div>
                            </td>
                            {showAppSupportColumns && (
                              <>
                                <td className="p-2 text-center font-bold text-slate-600 border-b border-r border-slate-200 bg-white static md:sticky md:left-[176px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                                  {colab.equipe.replace('Turno ', '').replace('Diurno', 'D').replace('Noturno', 'N')}
                                </td>
                                <td className="p-2 text-center text-slate-500 font-mono border-b border-r border-slate-200 bg-white static md:sticky md:left-[248px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">
                                  {colab.matricula}
                                </td>
                                <td className="p-2 text-center text-slate-500 font-medium border-b border-r border-slate-200 bg-white static md:sticky md:left-[328px] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap text-ellipsis overflow-hidden">
                                  {colab.cargo}
                                </td>
                              </>
                            )}
                            {Array.from({ length: daysInMonth }, (_, index) => {
                              const dNum = index + 1;
                              const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                              const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                              const { isWorkDay } = checkRosteredStatus(colab, dNum);

                              const hasInss = isColabOnInssOnDay(colab, currentYear, currentMonth, dNum);
                              if (hasInss) {
                                const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nAfastamento INSS / Licença Ativo`;
                                return (
                                  <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle bg-rose-50" title={cellTitle}>
                                    <div className="mx-auto w-7 h-7 bg-red-650 text-white border border-red-500 font-extrabold text-[8px] rounded-lg shadow-sm flex items-center justify-center transition-all duration-150 hover:scale-105 select-none font-sans leading-none">
                                      INSS
                                    </div>
                                  </td>
                                );
                              }

                              const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo);
                              if (hasAtestado) {
                                const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nAtestado Médico Ativo`;
                                return (
                                  <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle bg-rose-50" title={cellTitle}>
                                    <div className="mx-auto w-7 h-7 bg-red-100 text-red-600 border border-red-300 font-extrabold text-[10px] rounded-lg shadow-sm flex items-center justify-center transition-all duration-150 hover:scale-105 select-none font-sans">
                                      AT
                                    </div>
                                  </td>
                                );
                              }

                              if (req) {
                                const isApproved = req.status === 'Aprovado';
                                const shorthand = getShorthand(req.tipo);
                                const cellTitle = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nTipo: ${req.tipo}\nStatus: ${req.status}\nSolicitado por: ${req.solicitante}`;
                                if (isApproved) {
                                  return (
                                    <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle fill-slate-100" title={cellTitle}>
                                      <div className="mx-auto w-7 h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg shadow-sm flex items-center justify-center transition-all duration-150 hover:scale-105 select-none animate-scaleIn">
                                        {shorthand}
                                      </div>
                                    </td>
                                  );
                                } else {
                                  return (
                                    <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className="p-1 border-b border-r border-slate-200 text-center cursor-pointer align-middle animate-scaleIn" title={cellTitle}>
                                      <div className="mx-auto w-7 h-7 bg-amber-400 hover:bg-amber-500 text-slate-900 font-extrabold text-[10px] rounded-lg shadow-xs flex items-center justify-center animate-pulse select-none tracking-tighter">
                                        {shorthand}?
                                      </div>
                                    </td>
                                  );
                                }
                              }

                              const cellExplanation = `${colab.nome}\nData: ${dNum}/${currentMonth}/${currentYear}\nDia da semana: ${getDayOfWeekDetails(dNum).name}\nStatus: ${isWorkDay ? 'Plantão Escalado' : 'Folga Regular'}`;
                              return (
                                <td key={dNum} onClick={() => handleCellClick(colab, dNum)} className={`p-1 border-b border-r border-slate-200 text-center align-middle cursor-pointer transition-all select-none ${isWorkDay ? 'bg-white hover:bg-sky-50' : 'bg-slate-100/70 hover:bg-slate-200/50'}`} title={cellExplanation}>
                                  <span className="text-[9px] opacity-0 hover:opacity-100 text-sky-600 font-bold transition-opacity">+</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={showAppSupportColumns ? 4 + daysInMonth : 1 + daysInMonth} className="p-12 text-center text-slate-400 font-bold bg-white leading-normal">
                          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          <span>Nenhum profissional localizado para esta visualização de escala.</span>
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )) : (
            <div className="space-y-6">
            
            {/* Main Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="bg-sky-500/20 text-sky-300 font-extrabold text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-sky-400/20">
                  Módulo de Comparação & Detalhamento de Cobertura
                </span>
                <h3 className="text-base font-black flex items-center gap-2 mt-2">
                  <Layers className="w-5 h-5 text-sky-400" />
                  <span>Comparador Avançado de Escalas Assistenciais</span>
                </h3>
                <p className="text-[11px] text-slate-350 mt-1 max-w-2xl font-medium leading-relaxed">
                  Monitore e compare simultaneamente dois grupos de trabalho de enfermagem. Clique em qualquer número de cabeçalho do calendário (ex: <span className="text-amber-300 font-bold font-mono">1</span>, <span className="text-amber-300 font-bold font-mono">2</span>... <span className="text-amber-300 font-bold font-mono">30</span>) para atualizar instantaneamente o detalhamento de cobertura de leitos (Andar por Andar) no painel lateral direito.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <div className="bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10 text-xs text-right">
                  <span className="text-[8px] uppercase font-black tracking-widest block text-slate-450">Escala de Referência</span>
                  <span className="font-extrabold text-[11px] text-sky-305 block">{monthNames[currentMonth - 1]} de {currentYear}</span>
                </div>
                
                {/* Export Buttons */}
                <div className="flex flex-col gap-1.5 sm:flex-row">
                  <button
                    onClick={() => {
                      if (compareRoleMode === 'enfermeiros') {
                        setPrintLayoutMode('escala_comparar_enf');
                      } else {
                        setPrintLayoutMode('escala_comparar_tec');
                      }
                      setIsPrintPreviewOpen(true);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold px-3 py-2 text-[10px] rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                    title="Exportar a escala comparativa em PDF / Impressora"
                  >
                    <span>🖨️ Exportar Comparador em PDF</span>
                  </button>

                  <button
                    onClick={() => handleExportClick('com')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3 py-2 text-[10px] rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                    title="Exportar escala com os remanejamentos aplicados em planilha CSV"
                  >
                    <span>📥 Planilha CSV (Com Remanejo)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Toggles for Nurse/Technician mode requested by the user */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-slate-100 rounded-xl text-slate-700">
                  <span className="font-extrabold text-xs">🩺</span>
                </span>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide block">Categoria Profissional</h4>
                  <span className="text-[10px] text-slate-400 font-bold block">Selecione para dividir a comparação da escala</span>
                </div>
              </div>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-205/60 w-full sm:w-auto">
                <button
                  type="button"
                  id="tab-role-enfermeiros"
                  onClick={() => setCompareRoleMode('enfermeiros')}
                  className={`flex-1 sm:flex-initial text-center px-4 py-2 text-xs font-extrabold rounded-lg transition-all duration-150 ${compareRoleMode === 'enfermeiros' ? 'bg-white text-indigo-950 shadow-xs scale-[1.02]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Comparação escala Enfermeiros
                </button>
                <button
                  type="button"
                  id="tab-role-tecnicos"
                  onClick={() => setCompareRoleMode('tecnicos_auxiliares')}
                  className={`flex-1 sm:flex-initial text-center px-4 py-2 text-xs font-extrabold rounded-lg transition-all duration-150 ${compareRoleMode === 'tecnicos_auxiliares' ? 'bg-white text-indigo-950 shadow-xs scale-[1.02]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Comparação escala Técnicos e Auxiliares
                </button>
              </div>
            </div>

            {/* INNER FUNCTIONAL BLOCKS FOR GROUPS RENDERING */}
            {(() => {
              return (
                <div className="space-y-6">
                  {/* Synchronized Turno Selector */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="p-2.5 bg-indigo-50 text-indigo-705 rounded-xl">
                        <Clock className="w-5 h-5 text-indigo-600" />
                      </span>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Sincronizador de Turno Geral</h4>
                        <p className="text-[10px] text-slate-450 font-bold">Aplica o mesmo turno selecionado e filtra todos os 4 quadros integradamente</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <span className="text-slate-500 font-extrabold text-[10px] uppercase whitespace-nowrap">SELECIONE O TURNO (APLICA A TODOS):</span>
                      <select
                        value={compareEquipe1}
                        onChange={(e) => setCompareEquipe1(e.target.value)}
                        className="px-4 py-2 text-xs font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-650 w-full md:w-64"
                      >
                        {equipesDisponiveis.map(eq => (
                          <option key={`common-eq-${eq}`} value={eq}>
                            {eq === 'Todos' ? 'Todos os Turnos (A+B+Diaristas)' : eq}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Layout focus day active bar info */}
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl py-2 px-5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-3xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="font-semibold text-[11px] text-slate-700">
                        Breakdown de Cobertura integrado ativo em: <strong className="text-blue-700 uppercase font-black">Dia {selectedDay1}</strong>
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-450 font-bold italic">
                      💡 Clique sobre o número de qualquer dia no cabeçalho das tabelas para transpor o dia focado!
                    </p>
                  </div>

                  {/* The 4 Frame Tables exactly as designed */}
                  <div className="space-y-6">
                    {renderQuadroTable('Gestão', gestaoColabs, 'gestao')}
                    {renderQuadroTable('Unidade de Internação', unidadeInternacaoColabs, 'unidade-internacao')}
                    {renderQuadroTable('PSA | PSI | UTI', psaPsiUtiColabs, 'psa-psi-uti')}
                    {renderQuadroTable('Centro Cirúrgico', centroCirurgicoColabs, 'centro-cirurgico')}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 1. Modal of scale settings */}
      {isModalOpen && modalTargetColab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs transition-opacity animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-250 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-sky-800 to-indigo-900 px-6 py-5 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="bg-white/20 text-white font-extrabold text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/25">
                  Gerenciamento de Plantão & Folga
                </span>
                <h3 className="text-sm font-black mt-1.5 flex items-center gap-1.5 leading-none">
                  {modalTargetColab.datarecisao ? `Vaga (${modalTargetColab.nome})` : modalTargetColab.nome}
                </h3>
                <p className="text-[10px] text-sky-200 mt-1 font-bold">
                  Data selecionada: <span className="text-amber-300 font-extrabold">{modalTargetDate.split('-').reverse().join('/')}</span>
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-205 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable if too long */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar text-xs">
              
              {/* Collaborator Details Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="grid grid-cols-2 gap-3 font-semibold text-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">MATRÍCULA / REGISTRO</span>
                    <span className="font-mono text-[11px] text-slate-800 font-bold">{modalTargetColab.matricula}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">CARGO & SETOR</span>
                    <span className="text-[11px] text-slate-800 font-bold">{modalTargetColab.cargo} ({modalTargetColab.setor})</span>
                  </div>
                </div>

                {/* Current Balances Row (Saldos) */}
                <div className="border-t border-slate-200 pt-3 mt-1.5 col-span-2">
                  <span className="text-[10px] text-slate-450 uppercase block font-black tracking-wider mb-2">Saldos de Direitos de Folga Ativos</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-sky-50 border border-sky-150 p-2 rounded-xl">
                      <span className="text-[9px] text-sky-700 block font-black">Banco de Horas</span>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">{modalTargetColab.bancohoras}h</span>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-150 p-2 rounded-xl">
                      <span className="text-[9px] text-indigo-700 block font-black">Folga Enfermagem</span>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">{modalTargetColab.folgaenf}d</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-150 p-2 rounded-xl text-center">
                      <span className="text-[9px] text-rose-700 block font-black">Folga Feriado</span>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">{modalTargetColab.folgaferiado}d</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-150 p-2 rounded-xl">
                      <span className="text-[9px] text-emerald-700 block font-black">Folga Eleição</span>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">{modalTargetColab.eleicao}d</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-150 p-2 rounded-xl font-bold">
                      <span className="text-[9px] text-amber-805 block font-black">Folga Brigada</span>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">{modalTargetColab.brigada}d</span>
                    </div>
                    <div className="bg-purple-50 border border-purple-150 p-2 rounded-xl font-bold">
                      <span className="text-[9px] text-purple-700 block font-black">Escala Mensal (FS)</span>
                      <span className="text-xs font-black text-slate-800 mt-0.5 block">Max 2/mês</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Existing Active Folga Section */}
              {modalExistingFolga ? (
                <div className="bg-indigo-50/75 border border-indigo-200 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1.5 text-indigo-950 font-extrabold pb-2 border-b border-indigo-200/50">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-650 animate-pulse" />
                    <span>Registro de Folga Localizado: {modalExistingFolga.tipo}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-semibold text-[11px] text-slate-650">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold uppercase">STATUS DA HOMOLOGAÇÃO</span>
                      <span className={`font-black uppercase tracking-wider ${modalExistingFolga.status === 'Aprovado' ? 'text-emerald-700' : 'text-amber-600 animate-pulse'}`}>
                        {modalExistingFolga.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold uppercase">Lançado / Solicitado Por</span>
                      <span className="text-slate-800 font-bold">{modalExistingFolga.solicitante}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[9px] text-slate-400 block font-bold uppercase">CRIADO EM</span>
                      <span className="font-mono text-[10px] text-slate-600 font-bold">{modalExistingFolga.dataCriacao}</span>
                    </div>
                  </div>

                  {/* Actions for Existing Folga */}
                  <div className="pt-3 mt-1.5 flex flex-wrap gap-2">
                    {usuarioLogado.perfil !== 'Enfermeiro(a)' && modalExistingFolga.status === 'Pendente' && (
                      <button
                        onClick={() => handleApproveInline(modalExistingFolga)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 px-4 rounded-xl cursor-pointer shadow-xs active:scale-95 transition-all w-full flex items-center justify-center gap-1.5 border border-emerald-505"
                      >
                        <span>✓ Homologar & Aprovar Folga</span>
                      </button>
                    )}
                    {usuarioLogado.perfil !== 'Enfermeiro(a)' && modalExistingFolga.status === 'Pendente' && (
                      <button
                        onClick={() => handleRejectInline(modalExistingFolga)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-1.5 px-3 rounded-xl cursor-pointer shadow-xs active:scale-95 transition-all flex-1 text-center"
                      >
                        Recusar
                      </button>
                    )}
                    <button
                      onClick={() => handleCancelInline(modalExistingFolga)}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold py-1.5 px-3 rounded-xl cursor-pointer shadow-xs active:scale-95 transition-all flex-1 text-center"
                    >
                      Estornar/Remover Folga
                    </button>
                  </div>
                </div>
              ) : (
                /* Create New Folga Request Form */
                <form onSubmit={handleLaunchFolgaSubmit} className="space-y-4 border border-slate-200 p-4 rounded-2xl bg-white shadow-xs">
                  <h4 className="font-extrabold text-slate-800 flex items-center gap-1 text-xs border-b border-slate-100 pb-2">
                    <span>📝 Lançar Nova Solicitação de Folga</span>
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="text-[10px] text-slate-450 block font-black uppercase tracking-wider mb-1">Tipo de Folga</label>
                      <select
                        value={modalTipoFolga}
                        onChange={(e: any) => setModalTipoFolga(e.target.value)}
                        className="w-full font-bold bg-slate-50 border border-slate-200 p-2 rounded-xl text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
                      >
                        <option value="Folga de Escala">Folga de Escala (FS)</option>
                        <option value="Banco de Horas">Banco de Horas (BH)</option>
                        <option value="Folga Feriado">Folga Feriado (FF)</option>
                        <option value="Folga Enfermagem font-semibold">Folga Enfermagem (FE - Doação/Treinamento)</option>
                        <option value="Folga Brigada">Folga Brigada (FB)</option>
                        <option value="Folga Eleição">Folga Eleição (FE - Eleitoral)</option>
                        <option value="Integração">Integração</option>
                        <option value="Falta">Falta / Ausência</option>
                        <option value="Folga Troca de Plantão">Folga Troca de Plantão</option>
                      </select>
                    </div>

                    {canImmediateApprove && (
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-450 block font-black uppercase tracking-wider mb-2">HOMOLOGAÇÃO SUPERIOR</span>
                        <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-705 select-none">
                          <input 
                            type="checkbox"
                            checked={modalImmediateApproval}
                            onChange={(e) => setModalImmediateApproval(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          <span>Aprovação Imediata</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="bg-indigo-650 hover:bg-indigo-750 text-white font-extrabold py-2.5 px-4 rounded-xl cursor-pointer w-full text-center shadow-xs hover:shadow-md transition active:scale-95"
                  >
                    Conceder / Lançar Folga
                  </button>
                </form>
              )}

              {/* Remanejamento Section (Disponível para Gestão / Supervisão) */}
              {usuarioLogado.perfil !== 'Enfermeiro(a)' && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl space-y-4">
                  <div className="text-slate-500 font-extrabold text-[11px] tracking-wider uppercase">
                    REMANEJAMENTO DE SETOR
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input 
                      type="text"
                      placeholder="Ex: 2|3, U9, 5"
                      value={modalCustomRemSetor}
                      onChange={(e) => setModalCustomRemSetor(e.target.value)}
                      className="flex-1 font-bold bg-white border border-slate-300 p-3 rounded-xl text-slate-850 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
                    />
                    
                    <button
                      type="button"
                      onClick={handleSaveRemanejamento}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs transition active:scale-95 cursor-pointer shadow-xs border border-indigo-500"
                    >
                      Salvar
                    </button>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-450 uppercase block font-black tracking-wider text-left">
                      CLIQUE PARA MONTAR O REMANEJAMENTO:
                    </span>
                    <div className="flex flex-wrap gap-2 justify-start">
                      {[
                        { label: '2° Andar (2)', value: '2' },
                        { label: '3° Andar (3)', value: '3' },
                        { label: '4° Andar (4)', value: '4' },
                        { label: '5° Andar (5)', value: '5' },
                        { label: '6° Andar (6)', value: '6' },
                        { label: 'UTI 7° (U7)', value: 'U7' },
                        { label: 'UTI 9° (U9)', value: 'U9' },
                        { label: 'CC (CC)', value: 'CC' },
                        { label: 'CME (CME)', value: 'CME' },
                        { label: 'PSA (PSA)', value: 'PSA' },
                        { label: 'PSI (PSI)', value: 'PSI' },
                      ].map((item) => {
                        const isSelected = modalCustomRemSetor.split('|').map(s => s.trim()).includes(item.value);
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => {
                              const current = modalCustomRemSetor.trim();
                              if (!current) {
                                setModalCustomRemSetor(item.value);
                                return;
                              }
                              const parts = current.split('|').map(p => p.trim()).filter(Boolean);
                              if (parts.includes(item.value)) {
                                const nextParts = parts.filter(p => p !== item.value);
                                setModalCustomRemSetor(nextParts.join('|'));
                              } else {
                                parts.push(item.value);
                                setModalCustomRemSetor(parts.join('|'));
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-[10px] font-extrabold transition-all duration-155 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-120 border-indigo-405 text-indigo-705 font-black'
                                : 'bg-white border-slate-205 text-slate-705 hover:bg-slate-50 font-bold'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-snug font-bold">
                    Regra: Internação = somente o número (ex: 2|3). UTI = Letra U + andar (ex: U9).
                  </p>
                  
                  {remanejamentos[`${modalTargetColab.matricula}-${modalTargetDate}`] && (
                    <p className="text-[10px] text-indigo-650 font-bold bg-indigo-50/50 p-2 rounded-lg inline-block border border-indigo-100">
                      * Atualmente remanejado para: <b>{remanejamentos[`${modalTargetColab.matricula}-${modalTargetDate}`]}</b>
                    </p>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 2. Print preview layout */}
      {isPrintPreviewOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 p-4 sm:p-6 md:p-8 flex flex-col items-center">
          
          {/* Settings Toolbar (Hide in actual printer output) */}
          <div className="bg-white p-5 rounded-2xl shadow-xl w-full max-w-5xl border border-slate-200 mb-6 shrink-0 print:hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeIn">
            <div>
              <h3 className="text-sm font-black text-slate-850 flex items-center gap-1.5 uppercase tracking-wide">
                <span>🖨️ Configuração de Impressão de Escala</span>
              </h3>
              <p className="text-[11px] text-slate-405 mt-1 max-w-xl font-semibold leading-relaxed">
                Selecione o modelo ideal abaixo. Recomendamos configurar as opções de impressão do navegador para <b>Orientação: Paisagem (Landscape)</b> e habilitar a opção <b>Gráficos de Plano de Fundo (Background graphics)</b> para exibir o gabarito de cores.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={printLayoutMode}
                onChange={(e: any) => setPrintLayoutMode(e.target.value)}
                className="p-2 bg-slate-50 border border-slate-205 rounded-xl text-xs font-bold text-slate-750 cursor-pointer"
              >
                <option value="escala_setor_sem">Escala Local ({selectedSetor}) - Sem Remanejo</option>
                <option value="escala_setor_com">Escala Local ({selectedSetor}) - Com Remanejo</option>
                <option value="escala_comparar_enf">Escala Comparação - Enfermeiros</option>
                <option value="escala_comparar_tec">Escala Comparação - Técnicos/Auxiliares</option>
              </select>

              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow-xs active:scale-95 transition-all cursor-pointer border border-emerald-500"
                >
                  Imprimir Escala (PDF)
                </button>
                <button
                  onClick={() => setIsPrintPreviewOpen(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold px-4 py-2 rounded-xl text-xs transition active:scale-95 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>

          {/* Printable Container */}
          <div className="bg-white w-full max-w-5xl p-8 rounded-3xl shadow-xl border border-slate-300 print:shadow-none print:border-none print:p-0 print:max-w-none print:rounded-none">
            
            {/* Print Document Header */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-5 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="bg-sky-600 text-white font-extrabold px-2 py-0.5 rounded text-[11px] tracking-tight">Hapvida</span>
                  <h2 className="text-base font-black text-slate-905 tracking-tight uppercase">Hospital Nossa Senhora do Rosário</h2>
                </div>
                <h3 className="text-xs font-bold text-slate-750 uppercase tracking-wider mt-1">Escala de Cobertura Assistencial e Folgas (Enfermagem)</h3>
                <p className="text-[10px] text-slate-450 uppercase font-black mt-2">
                  Período: <strong className="text-slate-800 font-extrabold">{monthNames[currentMonth - 1]} de {currentYear}</strong>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 font-bold block">SISTEMA INTEGRADO</span>
                <span className="text-[10px] text-slate-800 font-black tracking-tighter uppercase block">HNSR FOLGAS CLOUD</span>
                <span className="text-[8px] text-slate-400 mt-2 block">{new Date().toLocaleString('pt-BR')}</span>
              </div>
            </div>

            {/* Main Print Grid Body based on layout */}
            <div className="space-y-6">
              {(() => {
                const renderPrintTable = (colabsList: Colaborador[], showCategoryHeader?: string) => {
                  const getSectorPriority = (sectorName: string): number => {
                    const s = (sectorName || '').trim().toUpperCase();
                    if (s.includes('PSI')) return 1;
                    if (s.includes('PSA')) return 2;
                    if (s.includes('CME')) return 3;
                    if (s.includes('CC') || s.includes('CENTRO CIRURGICO') || s.includes('CIRURGICO') || s.includes('CENTRO CIRÚRGICO')) return 4;
                    if (s.includes('2')) return 5;
                    if (s.includes('3')) return 6;
                    if (s.includes('4')) return 7;
                    if (s.includes('5')) return 8;
                    if (s.includes('6')) return 9;
                    if (s.includes('7') || s.includes('UTI 7')) return 10;
                    if (s.includes('9') || s.includes('UTI 9')) return 11;
                    return 999;
                  };

                  const sortedList = [...colabsList].sort((a, b) => {
                    const pA = getSectorPriority(a.setor);
                    const pB = getSectorPriority(b.setor);
                    if (pA !== pB) {
                      return pA - pB;
                    }
                    return a.nome.localeCompare(b.nome);
                  });

                  return (
                    <div className="mb-6 last:mb-0 break-inside-avoid" key={showCategoryHeader || 'all'}>
                      {showCategoryHeader && (
                        <div className="bg-slate-100 text-slate-800 font-black text-[11px] tracking-wider uppercase px-4 py-2 rounded-xl mb-3 border border-slate-300 flex items-center justify-between">
                          <span className="text-slate-900 font-extrabold">{showCategoryHeader}</span>
                          <span className="text-[9px] text-slate-500 font-bold">{sortedList.length} PROFISSIONAL(IS)</span>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-slate-300 text-[10px] leading-tight">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-black">
                              <th className="border border-slate-300 p-2 text-left">Colaborador</th>
                              <th className="border border-slate-300 p-1 text-center w-12">Cargo</th>
                              <th className="border border-slate-300 p-1 text-center w-12">Setor</th>
                              <th className="border border-slate-300 p-1 text-center w-12">Equipe</th>
                              {Array.from({ length: daysInMonth }, (_, d) => d + 1).map(dNum => {
                                const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                                return (
                                  <th key={`print-head-${dNum}`} className={`border border-slate-300 text-center p-1 w-6.5 font-bold ${isWeekend ? 'bg-rose-50 text-rose-600' : ''}`}>
                                    <div className="text-[7.5px] font-medium leading-none">{letter}</div>
                                    <div className="text-[10px] font-black leading-none mt-0.5">{dNum}</div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedList.length === 0 ? (
                              <tr>
                                <td colSpan={4 + daysInMonth} className="p-4 text-center text-slate-450 font-bold italic">
                                  Nenhum colaborador alocado neste quadro.
                                </td>
                              </tr>
                            ) : (
                              sortedList.map(colab => {
                                return (
                                  <tr key={`print-row-${colab.matricula}`} className="bg-white hover:bg-slate-50 transition border border-slate-300">
                                    <td className="border border-slate-300 p-2 font-bold text-slate-800 text-[10px] truncate max-w-[150px]">
                                      {colab.nome}
                                    </td>
                                    <td className="border border-slate-300 p-1 text-center text-[8.5px] font-medium text-slate-500 uppercase">
                                      {colab.cargo?.replace('Enfermeiro(a) ', '')?.slice(0, 10)}
                                    </td>
                                    <td className="border border-slate-300 p-1 text-center text-[8.5px] font-extrabold text-slate-600 uppercase">
                                      {colab.setor?.replace('º ANDAR', '°')?.replace('ANDAR', '')?.trim()}
                                    </td>
                                    <td className="border border-slate-300 p-1 text-center text-[8.5px] font-bold text-slate-500 uppercase">
                                      {colab.equipe?.replace('Turno ', '')?.replace('Diurno ', 'D')?.replace('Noturno ', 'N')?.slice(0, 5)}
                                    </td>
                                    {Array.from({ length: daysInMonth }, (_, d) => d + 1).map(dNum => {
                                      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                                      const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                                      const { isWorkDay } = checkRosteredStatus(colab, dNum);
                                      
                                      // INSS checking
                                      const hasInss = isColabOnInssOnDay(colab, currentYear, currentMonth, dNum);
                                      if (hasInss) {
                                        return (
                                          <td key={`print-cell-${dNum}`} className="border border-slate-300 p-0 text-center align-middle bg-rose-50 text-red-700 font-black text-[9px] select-none">
                                            INSS
                                          </td>
                                        );
                                      }

                                      // Medical Certificate checking
                                      const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo);
                                      if (hasAtestado) {
                                        return (
                                          <td key={`print-cell-${dNum}`} className="border border-slate-300 p-0 text-center align-middle bg-rose-50 text-red-600 font-black text-[9px] select-none">
                                            AT
                                          </td>
                                        );
                                      }

                                      // Remanejamento checking
                                      const showRem = printLayoutMode === 'escala_setor_com' || printLayoutMode.startsWith('escala_comparar');
                                      const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                                      if (showRem && remSector) {
                                        return (
                                          <td key={`print-cell-${dNum}`} className="border border-slate-300 p-0 text-center align-middle bg-amber-50 text-amber-955 font-black text-[7.5px] select-none uppercase tracking-tighter" title={`Remanejado p/ ${remSector}`}>
                                            {remSector}
                                          </td>
                                        );
                                      }

                                      // Check approved / pending leaves
                                      if (req) {
                                        const isApproved = req.status === 'Aprovado';
                                        const shorthand = getShorthand(req.tipo);
                                        return (
                                          <td key={`print-cell-${dNum}`} className={`border border-slate-300 p-0 text-center align-middle font-black text-[9px] select-none ${isApproved ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                            {shorthand}{isApproved ? '' : '?'}
                                          </td>
                                        );
                                      }

                                      // Standard scale
                                      return (
                                        <td key={`print-cell-${dNum}`} className={`border border-slate-300 p-0 text-center align-middle font-bold text-[8.5px] select-none ${isWorkDay ? 'bg-white text-slate-800' : 'bg-slate-100 text-slate-400'}`}>
                                          {isWorkDay ? '' : '-'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                };

                let printColabs: Colaborador[] = [];
                if (printLayoutMode.startsWith('escala_setor')) {
                  printColabs = [...filteredColaboradores];
                  return renderPrintTable(printColabs);
                } else {
                  // comparative view filter
                  const cRole = printLayoutMode === 'escala_comparar_enf' ? 'enfermeiro' : 'tecnico';
                  const baseList = colaboradores.filter(c => {
                    const eq = c.equipe?.toLowerCase() || '';
                    const fitsShift = compareEquipe1 === 'Todos' || eq === compareEquipe1.toLowerCase() || eq.includes(compareEquipe1.toLowerCase());
                    const cargoLower = c.cargo?.toLowerCase() || '';
                    const isEnf = cargoLower.includes('enfermeiro') || cargoLower.includes('enfermeira') || cargoLower.startsWith('enf') || cargoLower.includes('coordenador') || cargoLower.includes('supervisor');
                    
                    if (cRole === 'enfermeiro') {
                      return fitsShift && isEnf;
                    } else {
                      return fitsShift && !isEnf;
                    }
                  });

                  // Split into 4 quadros:
                  const gestaoList = baseList.filter(c => getCategoryForColab(c) === 'Gestão');
                  const uiList = baseList.filter(c => getCategoryForColab(c) === 'Unidade de Internação');
                  const psUtiList = baseList.filter(c => getCategoryForColab(c) === 'PSA | PSI | UTI');
                  const ccList = baseList.filter(c => getCategoryForColab(c) === 'Centro Cirurgico');

                  return (
                    <div className="space-y-6">
                      {renderPrintTable(gestaoList, "Gestão")}
                      {renderPrintTable(uiList, "Unidade de Internação")}
                      {renderPrintTable(psUtiList, "PS e UTI")}
                      {renderPrintTable(ccList, "CC (Centro Cirúrgico)")}
                    </div>
                  );
                }
              })()}
            </div>

            {/* Print Document Legend Footer */}
            <div className="mt-8 pt-5 border-t border-slate-200 grid grid-cols-4 gap-4 text-[9px] text-slate-500 font-bold self-start">
              <div>
                <span className="text-slate-750 font-extrabold block mb-1">GABARITO DE LEGENDAS:</span>
                <span>(Vazio): Plantão Escalado de 12 horas</span><br/>
                <span>-: Dia de Descanso Operacional / Folga de Equipe</span>
              </div>
              <div>
                <span className="text-slate-750 font-extrabold block mb-1">AFASTAMENTOS:</span>
                <span><b>INSS</b>: Afastamento Previdenciário ou Licença</span><br/>
                <span><b>AT</b>: Atestado de Saúde Homologado</span>
              </div>
              <div>
                <span className="text-slate-755 font-extrabold block mb-1">FOLGAS CONCEDIDAS:</span>
                <span><b>FS</b>: Folga de Escala mensal comum</span><br/>
                <span><b>BH</b>: Lançamento de folga por Banco de Horas</span><br/>
                <span><b>FF</b>: Folga Feriado (Compensatória)</span>
              </div>
              <div>
                <span className="text-slate-755 font-extrabold block mb-1">OUTROS REQUISITOS:</span>
                <span><b>FE</b>: Folga por Convocação Eleitoral</span><br/>
                <span><b>FB</b>: Folga decorrente de Brigada de Incêndio</span><br/>
                <span><b>REM</b>: Profissional remanejado para outro setor assistencial</span>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}