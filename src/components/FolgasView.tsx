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
  Printer, Layers, TrendingUp, RefreshCcw
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

  // New Double-Scale Comparison States
  const [compareSectors1, setCompareSectors1] = useState<string[]>(['Unidade de Internação']);
  const [compareEquipe1, setCompareEquipe1] = useState('Noturno B');
  const [compareSectors2, setCompareSectors2] = useState<string[]>(['UTI']);
  const [compareEquipe2, setCompareEquipe2] = useState('Noturno A');
  const [isSector1DropdownOpen, setIsSector1DropdownOpen] = useState(false);
  const [isSector2DropdownOpen, setIsSector2DropdownOpen] = useState(false);
  const [selectedDay1, setSelectedDay1] = useState(1);
  const [selectedDay2, setSelectedDay2] = useState(1);
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
    // Generate CSV content of the comparison tables
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += `ESCALA DE COMPARACAO - ${monthNames[currentMonth - 1].toUpperCase()} DE ${currentYear}\n`;
    csv += `Categoria: ${compareRoleMode === 'enfermeiros' ? 'Enfermeiros' : 'Técnicos e Auxiliares'}\n`;
    csv += `Remanejamentos: ${tipo === 'com' ? 'EXIBIDOS (COM REMANEJAMENTO)' : 'OCULTADOS (SEM REMANEJAMENTO)'}\n\n`;

    // Group A Section
    csv += `GRUPO A - Setores: ${compareSectors1.join('/')} - Equipe: ${compareEquipe1}\n`;
    csv += `Nome;Cargo;Matricula;Setor;`;
    for (let d = 1; d <= daysInMonth; d++) {
      csv += `${d};`;
    }
    csv += '\n';

    group1Colabs.forEach(colab => {
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

    // Group B Section
    csv += `GRUPO B - Setores: ${compareSectors2.join('/')} - Equipe: ${compareEquipe2}\n`;
    csv += `Nome;Cargo;Matricula;Setor;`;
    for (let d = 1; d <= daysInMonth; d++) {
      csv += `${d};`;
    }
    csv += '\n';

    group2Colabs.forEach(colab => {
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

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `escala_comparacao_${tipo === 'com' ? 'com_remanejamento' : 'sem_remanejamento'}_${currentMonth}_${currentYear}.csv`);
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

  // Group 1 collaborators filtered and sorted
  const group1Colabs = useMemo(() => {
    return colaboradores
      .filter(c => {
        if (getColabStatus(c).shouldRemove) return false;

        const sectorMatch = colabMatchesSector(c.setor, compareSectors1);
        const equipeMatch = belongsToEquipe(c, compareEquipe1);
        
        let roleMatch = true;
        if (compareRoleMode === 'enfermeiros') {
          roleMatch = isEnfermeiroFn(c.cargo);
        } else if (compareRoleMode === 'tecnicos_auxiliares') {
          roleMatch = isTecnicoOuAuxiliarFn(c.cargo);
        }

        return sectorMatch && equipeMatch && roleMatch;
      })
      .sort((a, b) => {
        const aCargo = a.cargo?.toLowerCase() || '';
        const bCargo = b.cargo?.toLowerCase() || '';
        const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') || aCargo.includes('coordenador') || aCargo.includes('supervisor') ? 1 : 0;
        const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') || bCargo.includes('coordenador') || bCargo.includes('supervisor') ? 1 : 0;
        if (aIsEnf !== bIsEnf) return bIsEnf - aIsEnf;
        return a.nome.localeCompare(b.nome);
      });
  }, [colaboradores, compareSectors1, compareEquipe1, compareRoleMode, getColabStatus]);

  // Group 2 collaborators filtered and sorted
  const group2Colabs = useMemo(() => {
    return colaboradores
      .filter(c => {
        if (getColabStatus(c).shouldRemove) return false;

        const sectorMatch = colabMatchesSector(c.setor, compareSectors2);
        const equipeMatch = belongsToEquipe(c, compareEquipe2);

        let roleMatch = true;
        if (compareRoleMode === 'enfermeiros') {
          roleMatch = isEnfermeiroFn(c.cargo);
        } else if (compareRoleMode === 'tecnicos_auxiliares') {
          roleMatch = isTecnicoOuAuxiliarFn(c.cargo);
        }

        return sectorMatch && equipeMatch && roleMatch;
      })
      .sort((a, b) => {
        const aCargo = a.cargo?.toLowerCase() || '';
        const bCargo = b.cargo?.toLowerCase() || '';
        const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') || aCargo.includes('coordenador') || aCargo.includes('supervisor') ? 1 : 0;
        const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') || bCargo.includes('coordenador') || bCargo.includes('supervisor') ? 1 : 0;
        if (aIsEnf !== bIsEnf) return bIsEnf - aIsEnf;
        return a.nome.localeCompare(b.nome);
      });
  }, [colaboradores, compareSectors2, compareEquipe2, compareRoleMode, getColabStatus]);

  // Modal State for visual cell-clicks
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTargetColab, setModalTargetColab] = useState<Colaborador | null>(null);
  const [modalTargetDate, setModalTargetDate] = useState(''); // YYYY-MM-DD
  const [modalExistingFolga, setModalExistingFolga] = useState<SolicitacaoFolga | null>(null);
  
  // Form input inside the modal
  const [modalTipoFolga, setModalTipoFolga] = useState<'Folga de Escala' | 'Banco de Horas' | 'Folga Feriado' | 'Folga Enfermagem' | 'Folga Brigada' | 'Folga Eleição' | 'Integração' | 'Falta' | 'Folga Troca de Plantão'>('Folga de Escala');
  const [modalImmediateApproval, setModalImmediateApproval] = useState(true);

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

  // Calculation of historical active presence counts for comparative charts
  const comparisonData = useMemo(() => {
    const data = [];
    for (let d = 1; d <= daysInMonth; d++) {
      // Counting working staff in selected (main) roster on day d using centralized helper
      const mainActiveCount = filteredColaboradores.filter(colab => {
        return isColabActiveOnDay(colab, d);
      }).length;

      // Counting working staff in comparative target roster on day d
      const compColabs = colaboradores.filter(colab => {
        if (compareSetor !== 'Todos' && colab.setor !== compareSetor) return false;
        
        // filter by plantao
        if (comparePlantao !== 'Todos') {
          const eq = colab.equipe?.toLowerCase() || '';
          const match = comparePlantao === 'Diarista' 
            ? (eq.includes('diario') || eq.includes('diário') || eq.includes('diarista'))
            : eq.includes(comparePlantao.toLowerCase());
          if (!match) return false;
        }

        // filter by cargo
        if (compareCargo !== 'Todos') {
          const cargo = colab.cargo?.toLowerCase() || '';
          const match = compareCargo === 'Enfermeiro'
            ? (cargo.includes('enfermeiro') || cargo.includes('enfermeira') || cargo.startsWith('enf'))
            : cargo.includes(compareCargo.toLowerCase());
          if (!match) return false;
        }

        return true;
      });

      const compActiveCount = compColabs.filter(colab => {
        return isColabActiveOnDay(colab, d);
      }).length;

      data.push({
        dia: d,
        "Seu Grupo (Ativos)": mainActiveCount,
        "Grupo Comparado (Ativos)": compActiveCount
      });
    }
    return data;
  }, [filteredColaboradores, colaboradores, daysInMonth, currentYear, currentMonth, compareSetor, comparePlantao, compareCargo, isColabActiveOnDay]);

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
    
    // Default form inputs
    setModalTipoFolga('Folga de Escala');
    // Supervisors approval auto-enabled, Nurses file pending
    setModalImmediateApproval(usuarioLogado.perfil !== 'Enfermeiro(a)');
    setIsModalOpen(true);
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

    const isSupervisor = usuarioLogado.perfil !== 'Enfermeiro(a)';
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
              // Internal helper to get subsector breakdown for sidebar
              const getSubsectorBreakdown = (colabs: Colaborador[], selectedDay: number, sectorFilters: string | string[]) => {
                const counts: Record<string, number> = {};
                colabs.forEach(c => {
                  if (isColabOnAtestado(c.matricula, currentYear, currentMonth, selectedDay, absenteismo)) {
                    return; // medical leave
                  }

                  const { isWorkDay } = checkRosteredStatus(c, selectedDay);
                  if (!isWorkDay) return;

                  const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                  const req = solicitacoesLookup[`${c.matricula}-${dateStr}`];
                  if (req && req.status === 'Aprovado') {
                    return; // off duty
                  }
                  counts[c.setor] = (counts[c.setor] || 0) + 1;
                });

                if (compareRoleMode === 'tecnicos_auxiliares') {
                  const getCount = (setor: string) => counts[setor] || 0;
                  const psCount = getCount('PSA') + getCount('PSI');
                  const ccCount = getCount('CENTRO CIRURGICO') + getCount('CME') + getCount('Centro Cirurgico') + getCount('CC');
                  const uiCount = getCount('2º ANDAR') + getCount('3º ANDAR') + getCount('4º ANDAR') + getCount('5º ANDAR') + getCount('6º ANDAR');
                  const utiCount = getCount('UTI 7º ANDAR') + getCount('UTI 9º ANDAR') + getCount('UTI 7º andar') + getCount('UTI 9º andar');

                  const items = [
                    { name: 'PS (PSA e PSI)', count: psCount },
                    { name: 'CC (CC e CME)', count: ccCount },
                    { name: 'UI (2, 3, 4, 5 e 6º andar)', count: uiCount },
                    { name: 'UTI (7 e 8º andar)', count: utiCount },
                  ];

                  const total = items.reduce((acc, x) => acc + x.count, 0);
                  return { items, total };
                }

                let sectorList: string[] = [];
                const filterArr = Array.isArray(sectorFilters) ? sectorFilters : [sectorFilters];
                
                if (filterArr.includes('Todos')) {
                  const sets = new Set(colaboradores.map(c => c.setor));
                  sectorList = Array.from(sets).sort();
                } else {
                  const listSet = new Set<string>();
                  filterArr.forEach(filter => {
                    if (filter === 'Unidade de Internação') {
                      ['2º ANDAR', '3º ANDAR', '4º ANDAR', '5º ANDAR', '6º ANDAR'].forEach(x => listSet.add(x));
                    } else if (filter === 'UTI') {
                      ['UTI 7º ANDAR', 'UTI 9º ANDAR'].forEach(x => listSet.add(x));
                    } else {
                      listSet.add(filter);
                    }
                  });
                  sectorList = Array.from(listSet).sort();
                }

                const items = sectorList.map(name => ({
                  name,
                  count: counts[name] || 0
                }));

                const total = items.reduce((acc, x) => acc + x.count, 0);
                return { items, total };
              };

              return (
                <div className="space-y-8">

                  {/* ========================================================= */}
                  {/* SCALE COMPARATOR BLOCK 1: GROUP 1 (Top Table) */}
                  {/* ========================================================= */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    
                    {/* Select Controls & Meta */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-7 h-7 bg-sky-600 rounded-lg text-white font-extrabold text-xs flex items-center justify-center shadow-sm">1</span>
                        <div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider block">Quadro de Escala Superior (A)</h4>
                          <span className="text-[10px] text-slate-400 font-bold block">Primeira equipe selecionada para dimensionamento correlacionado</span>
                        </div>
                      </div>

                      {/* Dropdown selectors */}
                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold leading-normal">
                        {/* Custom Multiselect for Sectors */}
                        <div className="relative">
                          <span className="text-slate-450 block text-[9px] uppercase font-black mb-1">Setor do Grupo A:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsSector1DropdownOpen(!isSector1DropdownOpen);
                              setIsSector2DropdownOpen(false); // Close other dropdown
                            }}
                            className="w-56 p-2 text-left border border-slate-200 rounded-xl font-black text-slate-700 bg-slate-50 hover:bg-slate-100/80 cursor-pointer focus:outline-none flex justify-between items-center whitespace-nowrap overflow-hidden text-ellipsis shadow-sm"
                          >
                            <span className="truncate">{getSectorsLabel(compareSectors1)}</span>
                            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
                          </button>
                          
                          {isSector1DropdownOpen && (
                            <>
                              {/* Backdrop to dismiss */}
                              <div 
                                className="fixed inset-0 z-20" 
                                onClick={() => setIsSector1DropdownOpen(false)} 
                              />
                              <div className="absolute left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-72 overflow-y-auto p-2 space-y-1">
                                {listSectorsForComparison.map(s => {
                                  const isSelected = compareSectors1.includes(s);
                                  return (
                                    <label
                                      key={`cmp1-sec-multi-${s}`}
                                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-700 text-xs font-bold leading-none select-none"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleSectorToggle(s, compareSectors1, setCompareSectors1)}
                                        className="rounded text-sky-650 focus:ring-sky-500 w-4 h-4"
                                      />
                                      <span className="truncate">
                                        {s === 'Todos' ? 'Todos os Setores' : s === 'Unidade de Internação' ? 'Unidade de Internação (2º ao 6º)' : s === 'UTI' ? 'Geral de UTI (8º e 9º)' : s}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>

                        <div>
                          <span className="text-slate-450 block text-[9px] uppercase font-black mb-1">Turno / Escala:</span>
                          <select
                            value={compareEquipe1}
                            onChange={(e) => setCompareEquipe1(e.target.value)}
                            className="p-2 border border-slate-200 rounded-xl font-black text-slate-700 bg-slate-50 hover:bg-slate-100/80 cursor-pointer focus:outline-none focus:border-sky-500"
                          >
                            {equipesDisponiveis.map(eq => (
                              <option key={`cmp1-eq-${eq}`} value={eq}>
                                {eq === 'Todos' ? 'Todos os Turnos (A+B+Diaristas)' : eq}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-end self-end">
                          <span className="bg-sky-50 text-sky-700 border border-sky-100 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg">
                            Profissionais Localizados: <b>{group1Colabs.length}</b>
                          </span>
                        </div>
                      </div>

                      {/* Focus day summary indicator */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3.5 flex items-center gap-2 shrink-0 self-end">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="font-semibold text-[10px] text-slate-600">
                          Breakdown de Cobertura Lateral Ativo em: <strong className="text-slate-800 uppercase font-bold text-sky-700">Dia {selectedDay1}</strong>
                        </span>
                      </div>

                    </div>

                    {/* Stacked Layout: Grid on left (10 col) + Breakdown on right (2 col) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      
                      {/* Grid Spreadsheet Scrollable Wrapper */}
                      <div className="md:col-span-10 overflow-x-auto border border-slate-200 rounded-xl shadow-xs max-w-full font-sans">
                        <table 
                          style={{ minWidth: showAppSupportColumns ? '1550px' : '1000px' }}
                          className="border-collapse table-fixed text-[9px] select-none"
                        >
                          
                          {/* Headers */}
                          <thead>
                            <tr className="bg-slate-100 text-slate-850 font-extrabold border-b border-slate-350 text-center">
                              <th className="w-32 p-1 border-r border-slate-250 bg-slate-100 text-left sticky left-0 z-10 font-black">Colaborador</th>
                              <th className="w-11 p-1 border-r border-slate-250 bg-slate-100">BH</th>
                              <th className="w-8 p-1 border-r border-slate-250 bg-slate-100">FF</th>
                              <th className="w-8 p-1 border-r border-slate-250 bg-slate-100">FS</th>
                              {showAppSupportColumns && (
                                <>
                                  <th className="w-13 p-1 border-r border-slate-250 bg-slate-100 text-slate-500 font-semibold">Matrícula</th>
                                  <th className="w-13 p-1 border-r border-slate-250 bg-slate-100 text-slate-500 font-semibold">Coren</th>
                                  <th className="w-14 p-1 border-r border-slate-250 bg-slate-100">Cargo</th>
                                  <th className="w-13 p-1 border-r border-slate-300 bg-slate-150 font-semibold">Horário</th>
                                </>
                              )}
                              
                              {/* Day Numbers header */}
                              {Array.from({ length: daysInMonth }, (_, index) => {
                                const dNum = index + 1;
                                const { isWeekend } = getDayOfWeekDetails(dNum);
                                const isFocused = selectedDay1 === dNum;
                                return (
                                  <th 
                                    key={`cmp1-hdr-d-${dNum}`} 
                                    onClick={() => setSelectedDay1(dNum)}
                                    className={`w-6 cursor-pointer text-center border-r border-slate-250 transition-all ${
                                      isFocused
                                        ? 'bg-amber-400 text-slate-900 border-x border-amber-600 scale-105 shadow-xs font-black' 
                                        : isWeekend 
                                        ? 'bg-rose-50 text-rose-600 font-bold' 
                                        : 'bg-slate-100 hover:bg-slate-200'
                                    }`}
                                    title="Clique para destacar o detalhamento lateral deste dia"
                                  >
                                    <div className="text-[8px] font-black">{dNum}</div>
                                  </th>
                                );
                              })}
                            </tr>

                            {/* Row 2: Weekday indicator letters */}
                            <tr className="bg-slate-50 text-slate-700 text-center border-b border-slate-300">
                              <td className="p-1 border-r border-slate-200 bg-slate-50 sticky left-0 z-10 text-left font-bold text-slate-400 uppercase text-[7.5px]">Plantão Focado</td>
                              <td className="p-1 border-r border-slate-200"></td>
                              <td className="p-1 border-r border-slate-200"></td>
                              <td className="p-1 border-r border-slate-200"></td>
                              {showAppSupportColumns && (
                                <>
                                  <td className="p-1 border-r border-slate-200"></td>
                                  <td className="p-1 border-r border-slate-200"></td>
                                  <td className="p-1 border-r border-slate-200"></td>
                                  <td className="p-1 border-r border-slate-300 bg-slate-100"></td>
                                </>
                              )}

                              {Array.from({ length: daysInMonth }, (_, index) => {
                                const dNum = index + 1;
                                const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                                const isFocused = selectedDay1 === dNum;
                                return (
                                  <td 
                                    key={`cmp1-hdr-l-${dNum}`}
                                    onClick={() => setSelectedDay1(dNum)}
                                    className={`p-0.5 border-r border-slate-200 font-black cursor-pointer text-[7.5px] uppercase ${
                                      isFocused 
                                        ? 'bg-amber-300 text-amber-950 font-bold'
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

                          {/* Body Rows */}
                          <tbody className="bg-white">
                            {group1Colabs.length > 0 ? (
                              group1Colabs.map((colab) => {
                                return (
                                  <tr key={`cmp1-r-${colab.matricula}`} className="border-b border-slate-200 hover:bg-slate-50/50">
                                    
                                    {/* Name Column Left-Pinned */}
                                    <td className={`p-1 font-extrabold border-r border-slate-200 sticky left-0 z-10 bg-white shadow-[1px_0_0_0_rgba(226,232,240,1)] max-w-[128px] truncate text-left text-[8.5px] ${colab.datarecisao ? 'text-rose-600' : 'text-slate-800'}`} title={colab.nome}>
                                      {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                                    </td>

                                    {/* BH Banco de horas */}
                                    <td className={`p-1 text-center font-mono border-r border-slate-200 text-[8px] font-semibold ${colab.bancohoras < 0 ? 'text-rose-600' : colab.bancohoras > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                      {formatBHValue(colab.bancohoras)}
                                    </td>

                                    {/* FF Folga feriado balance */}
                                    <td className="p-1 text-center border-r border-slate-200 text-slate-655 font-bold">
                                      {colab.folgaferiado || ''}
                                    </td>

                                    {/* FS Folga escala balance */}
                                    <td className="p-1 text-center border-r border-slate-200 text-slate-655 font-bold">
                                      {colab.folgaenf || ''}
                                    </td>

                                    {showAppSupportColumns && (
                                      <>
                                        {/* Matrícula */}
                                        <td className="p-1 text-center text-slate-400 font-mono border-r border-slate-200 whitespace-nowrap text-[8px]">
                                          {colab.matricula}
                                        </td>

                                        {/* Coren */}
                                        <td className="p-1 text-center text-slate-400 font-mono border-r border-slate-200 whitespace-nowrap text-[8px]">
                                          {colab.coren || 'N/D'}
                                        </td>

                                        {/* Cargo */}
                                        <td className="p-1 text-center border-r border-slate-200 whitespace-nowrap text-[8px] font-bold text-slate-600" title={colab.cargo}>
                                          {formatCargoAbbreviated(colab.cargo)}
                                        </td>

                                        {/* Horário */}
                                        <td className="p-1 text-center border-r border-slate-300 bg-slate-50/60 font-mono text-[7.5px] font-semibold text-slate-500 whitespace-nowrap">
                                          {colab.horario || '19:00/07:05'}
                                        </td>
                                      </>
                                    )}

                                    {/* Days Columns */}
                                    {Array.from({ length: daysInMonth }, (_, index) => {
                                      const dNum = index + 1;
                                      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                                      const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                                      const { isWorkDay } = checkRosteredStatus(colab, dNum);
                                      const { isWeekend } = getDayOfWeekDetails(dNum);
                                      const isFocused = selectedDay1 === dNum;

                                      // Evaluate day background
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
                                            key={`cmp1-td-${colab.matricula}-${dNum}`} 
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
                                            key={`cmp1-td-${colab.matricula}-${dNum}`} 
                                            onClick={() => handleCellClick(colab, dNum)} 
                                            className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase bg-rose-50`}
                                            title="Atestado Médico Ativo (Absenteísmo)"
                                          >
                                            <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-red-100 text-red-600 border-red-300 font-extrabold font-sans">
                                              AT
                                            </span>
                                          </td>
                                        );
                                      }

                                      const hasFerias = isColabOnFeriasOnDay(colab.matricula, dNum);
                                      if (hasFerias) {
                                        return (
                                          <td 
                                            key={`cmp1-td-${colab.matricula}-${dNum}`} 
                                            onClick={() => handleCellClick(colab, dNum)} 
                                            className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase bg-purple-50`}
                                            title="Férias de Escala Ativa"
                                          >
                                            <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-purple-600 text-white border-purple-500 font-extrabold font-sans">
                                              F
                                            </span>
                                          </td>
                                        );
                                      }

                                      // Evaluate code
                                      if (req) {
                                        const isApproved = req.status === 'Aprovado';
                                        const shorthand = getShorthand(req.tipo);
                                        
                                        // Specific colored cell states for approved leaves
                                        if (isApproved) {
                                          let badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-250'; // standard F
                                          if (shorthand === 'FF') {
                                            badgeStyle = 'bg-sky-100 text-sky-850 border-sky-250 font-black';
                                          } else if (shorthand === 'BH') {
                                            badgeStyle = 'bg-amber-100 text-amber-850 border-amber-250';
                                          } else if (shorthand === 'FE') {
                                            badgeStyle = 'bg-purple-100 text-purple-850 border-purple-250';
                                          } else if (shorthand === 'B') {
                                            badgeStyle = 'bg-rose-150 text-rose-850 border-rose-300';
                                          } else if (shorthand === 'E') {
                                            badgeStyle = 'bg-teal-100 text-teal-850 border-teal-250';
                                          } else if (shorthand === 'I') {
                                            badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
                                          } else if (shorthand === 'A') {
                                            badgeStyle = 'bg-red-100 text-red-800 border-red-200';
                                          } else if (shorthand === 'AT') {
                                            badgeStyle = 'bg-rose-105 text-rose-850 border-rose-250';
                                          }

                                          return (
                                            <td 
                                              key={`cmp1-td-${colab.matricula}-${dNum}`} 
                                              onClick={() => handleCellClick(colab, dNum)} 
                                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                                            >
                                              <span className={`block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none ${badgeStyle}`}>
                                                {shorthand}
                                              </span>
                                            </td>
                                          );
                                        } else {
                                          return (
                                            <td 
                                              key={`cmp1-td-${colab.matricula}-${dNum}`} 
                                              onClick={() => handleCellClick(colab, dNum)} 
                                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-bold cursor-pointer transition-all ${tdBg}`}
                                              title="Lançamento sob análise operacional"
                                            >
                                              <span className="block py-0.5 rounded-sm border border-dashed border-amber-200 bg-amber-50/80 text-amber-600 text-[7px] leading-tight">
                                                {shorthand}?
                                              </span>
                                            </td>
                                          );
                                        }
                                      }

                                      const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                                      if (remSector) {
                                        return (
                                          <td 
                                            key={`cmp1-td-${colab.matricula}-${dNum}`} 
                                            onClick={() => handleCellClick(colab, dNum)} 
                                            className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                                            title={`Remanejado para o setor: ${remSector}`}
                                          >
                                            <span className="block py-0.5 rounded-sm border text-[6.5px] px-0.5 tracking-tight leading-none bg-amber-105 text-amber-850 border-amber-300 font-extrabold font-sans">
                                              R: {remSector}
                                            </span>
                                          </td>
                                        );
                                      }

                                      return (
                                        <td 
                                          key={`cmp1-td-${colab.matricula}-${dNum}`} 
                                          onClick={() => handleCellClick(colab, dNum)} 
                                          className={`p-0.5 border-r border-slate-200 text-center align-middle cursor-pointer transition-all hover:bg-sky-50 text-[6.5px] font-black ${tdBg}`}
                                          title={isWorkDay ? 'Plantão de Trabalho Escalonado' : 'Folga Regular de Reciprocidade (EF)'}
                                        >
                                          {/* Keep cells completely empty as preferred */}
                                          <span className="opacity-0 hover:opacity-105 text-sky-500 font-black">+</span>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={showAppSupportColumns ? 8 + daysInMonth : 4 + daysInMonth} className="p-8 text-center text-slate-400 bg-slate-50 italic font-medium font-sans">
                                  Nenhum profissional cadastrado com as condições especificadas para o Quadro Superior (A).
                                </td>
                              </tr>
                            )}
                          </tbody>

                          {/* Footer - Aggregation Total (Ativos no Dia) */}
                          <tfoot className="bg-[#FAF8E5] border-t-2 border-slate-350 text-slate-900 font-extrabold text-center">
                            <tr className="border-b border-slate-300">
                              <td className="p-1.5 border-r border-slate-200 bg-[#FCF8E3] text-left text-[8px] font-black text-amber-955 uppercase sticky left-0 z-10 shadow-[1px_0_0_0_rgba(226,232,240,1)]">
                                Ativos no Plantão (Total)
                              </td>
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
                                const activeCount = group1Colabs.filter(c => isColabActiveOnDay(c, dNum)).length;
                                const isFocused = selectedDay1 === dNum;
                                return (
                                  <td 
                                    key={`cmp1-tot-${dNum}`}
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

                      {/* Right Sidebar: Dynamic Breakdown allocation (2 col) */}
                      <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between text-xs space-y-4">
                        
                        <div className="space-y-3">
                          <div className="border-b border-slate-200 pb-2 flex items-center gap-1.5 font-sans">
                            <Users className="w-4 h-4 text-sky-600" />
                            <h5 className="font-extrabold text-slate-800 uppercase tracking-tight text-[10px]">
                              Leitos (Dia {selectedDay1})
                            </h5>
                          </div>
                          
                          <p className="text-[10px] text-slate-450 leading-tight font-medium font-sans">
                            Distribuição física do efetivo ativo escalado neste plantão de foco:
                          </p>

                          {/* Render Floors breakdown list */}
                          {(() => {
                            const { items, total } = getSubsectorBreakdown(group1Colabs, selectedDay1, compareSectors1);
                            return (
                              <div className="space-y-2.5 pt-1 font-sans">
                                {items.map(item => (
                                  <div key={`cmp1-break-${item.name}`} className="space-y-1">
                                    <div className="flex justify-between items-center text-[10.5px] text-slate-705 font-bold leading-none">
                                      <span className="truncate max-w-[100px] uppercase font-bold text-slate-650">{item.name}</span>
                                      <span className="font-black bg-white border border-slate-200 px-1.5 py-0.5 rounded-md text-sky-700 text-[9.5px]">
                                        {item.count}
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-200/60 rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className="bg-sky-505 h-full rounded-full transition-all duration-305"
                                        style={{ width: `${total > 0 ? (item.count / total) * 100 : 0}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                                
                                <div className="border-t border-dashed border-slate-250 pt-2 flex justify-between items-center font-black text-slate-800 text-[10.5px]">
                                  <span>Total Geral Ativo</span>
                                  <span className="text-amber-800 bg-[#FCF8E3] px-2 py-0.5 rounded-md border border-amber-200">
                                    {total}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="bg-sky-50/70 border border-sky-100 p-2.5 rounded-lg text-[9px] leading-tight text-sky-850 font-medium font-sans">
                          💡 <b>Dica:</b> Quer dimensionar outro dia do mês? Basta clicar em qualquer cabeçalho de coluna para transpor!
                        </div>

                      </div>

                    </div>

                  </div>


                  {/* ========================================================= */}
                  {/* SCALE COMPARATOR BLOCK 2: GROUP 2 (Bottom Table) */}
                  {/* ========================================================= */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    
                    {/* Select Controls & Meta */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-7 h-7 bg-indigo-650 rounded-lg text-white font-extrabold text-xs flex items-center justify-center shadow-sm">B</span>
                        <div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider block">Quadro de Escala Inferior (B)</h4>
                          <span className="text-[10px] text-slate-400 font-bold block">Segunda equipe selecionada para dimensionamento correlacionado</span>
                        </div>
                      </div>

                      {/* Dropdown selectors */}
                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold leading-normal">
                        {/* Custom Multiselect for Sectors */}
                        <div className="relative">
                          <span className="text-slate-455 block text-[9px] uppercase font-black mb-1">Setor do Grupo B:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsSector2DropdownOpen(!isSector2DropdownOpen);
                              setIsSector1DropdownOpen(false); // Close other dropdown
                            }}
                            className="w-56 p-2 text-left border border-slate-200 rounded-xl font-black text-slate-700 bg-slate-50 hover:bg-slate-100/80 cursor-pointer focus:outline-none flex justify-between items-center whitespace-nowrap overflow-hidden text-ellipsis shadow-sm"
                          >
                            <span className="truncate">{getSectorsLabel(compareSectors2)}</span>
                            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
                          </button>
                          
                          {isSector2DropdownOpen && (
                            <>
                              {/* Backdrop to dismiss */}
                              <div 
                                className="fixed inset-0 z-20" 
                                onClick={() => setIsSector2DropdownOpen(false)} 
                              />
                              <div className="absolute left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-72 overflow-y-auto p-2 space-y-1">
                                {listSectorsForComparison.map(s => {
                                  const isSelected = compareSectors2.includes(s);
                                  return (
                                    <label
                                      key={`cmp2-sec-multi-${s}`}
                                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-700 text-xs font-bold leading-none select-none"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleSectorToggle(s, compareSectors2, setCompareSectors2)}
                                        className="rounded text-indigo-655 focus:ring-indigo-500 w-4 h-4"
                                      />
                                      <span className="truncate">
                                        {s === 'Todos' ? 'Todos os Setores' : s === 'Unidade de Internação' ? 'Unidade de Internação (2º ao 6º)' : s === 'UTI' ? 'Geral de UTI (8º e 9º)' : s}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>

                        <div>
                          <span className="text-slate-455 block text-[9px] uppercase font-black mb-1">Turno / Escala:</span>
                          <select
                            value={compareEquipe2}
                            onChange={(e) => setCompareEquipe2(e.target.value)}
                            className="p-2 border border-slate-200 rounded-xl font-black text-slate-700 bg-slate-50 hover:bg-slate-100/80 cursor-pointer focus:outline-none focus:border-indigo-500"
                          >
                            {equipesDisponiveis.map(eq => (
                              <option key={`cmp2-eq-${eq}`} value={eq}>
                                {eq === 'Todos' ? 'Todos os Turnos (A+B+Diaristas)' : eq}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-end self-end">
                          <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg">
                            Profissionais Localizados: <b>{group2Colabs.length}</b>
                          </span>
                        </div>
                      </div>

                      {/* Focus day summary indicator */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3.5 flex items-center gap-2 shrink-0 self-end">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="font-semibold text-[10px] text-slate-650">
                          Breakdown de Cobertura Lateral Ativo em: <strong className="text-slate-800 uppercase font-bold text-indigo-700">Dia {selectedDay2}</strong>
                        </span>
                      </div>

                    </div>

                    {/* Stacked Layout: Grid on left (10 col) + Breakdown on right (2 col) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 font-sans">
                      
                      {/* Grid Spreadsheet Scrollable Wrapper */}
                      <div className="md:col-span-10 overflow-x-auto border border-slate-200 rounded-xl shadow-xs max-w-full font-sans">
                        <table 
                          style={{ minWidth: showAppSupportColumns ? '1550px' : '1000px' }}
                          className="border-collapse table-fixed text-[9px] select-none"
                        >
                          
                          {/* Headers */}
                          <thead>
                            <tr className="bg-slate-100 text-slate-855 font-extrabold border-b border-slate-350 text-center">
                              <th className="w-32 p-1 border-r border-slate-250 bg-slate-100 text-left sticky left-0 z-10 font-black">Colaborador</th>
                              <th className="w-11 p-1 border-r border-slate-250 bg-slate-100">BH</th>
                              <th className="w-8 p-1 border-r border-slate-250 bg-slate-100">FF</th>
                              <th className="w-8 p-1 border-r border-slate-250 bg-slate-100">FS</th>
                              {showAppSupportColumns && (
                                <>
                                  <th className="w-13 p-1 border-r border-slate-250 bg-slate-100 text-slate-500 font-semibold">Matrícula</th>
                                  <th className="w-13 p-1 border-r border-slate-250 bg-slate-100 text-slate-500 font-semibold">Coren</th>
                                  <th className="w-14 p-1 border-r border-slate-250 bg-slate-100 font-semibold font-sans">Cargo</th>
                                  <th className="w-13 p-1 border-r border-slate-300 bg-slate-150 font-semibold">Horário</th>
                                </>
                              )}
                              
                              {/* Day Numbers header */}
                              {Array.from({ length: daysInMonth }, (_, index) => {
                                const dNum = index + 1;
                                const { isWeekend } = getDayOfWeekDetails(dNum);
                                const isFocused = selectedDay2 === dNum;
                                return (
                                  <th 
                                    key={`cmp2-hdr-d-${dNum}`} 
                                    onClick={() => setSelectedDay2(dNum)}
                                    className={`w-6 cursor-pointer text-center border-r border-slate-250 transition-all ${
                                      isFocused
                                        ? 'bg-amber-400 text-slate-900 border-x border-amber-600 scale-105 shadow-xs font-black' 
                                        : isWeekend 
                                        ? 'bg-rose-50 text-rose-600 font-bold' 
                                        : 'bg-slate-100 hover:bg-slate-200'
                                    }`}
                                    title="Clique para destacar o detalhamento lateral deste dia"
                                  >
                                    <div className="text-[8px] font-black">{dNum}</div>
                                  </th>
                                );
                              })}
                            </tr>

                            {/* Row 2: Weekday indicator letters */}
                            <tr className="bg-slate-50 text-slate-700 text-center border-b border-slate-300">
                              <td className="p-1 border-r border-slate-200 bg-slate-50 sticky left-0 z-10 text-left font-bold text-slate-400 uppercase text-[7.5px]">Plantão Focado</td>
                              <td className="p-1 border-r border-slate-200"></td>
                              <td className="p-1 border-r border-slate-205"></td>
                              <td className="p-1 border-r border-slate-200"></td>
                              {showAppSupportColumns && (
                                <>
                                  <td className="p-1 border-r border-slate-200"></td>
                                  <td className="p-1 border-r border-slate-200"></td>
                                  <td className="p-1 border-r border-slate-200"></td>
                                  <td className="p-1 border-r border-slate-300 bg-slate-100"></td>
                                </>
                              )}

                              {Array.from({ length: daysInMonth }, (_, index) => {
                                const dNum = index + 1;
                                const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                                const isFocused = selectedDay2 === dNum;
                                return (
                                  <td 
                                    key={`cmp2-hdr-l-${dNum}`}
                                    onClick={() => setSelectedDay2(dNum)}
                                    className={`p-0.5 border-r border-slate-200 font-black cursor-pointer text-[7.5px] uppercase ${
                                      isFocused 
                                        ? 'bg-amber-300 text-amber-955 font-bold'
                                        : isWeekend 
                                        ? 'bg-rose-100/60 text-rose-550' 
                                        : 'bg-slate-50 text-slate-450'
                                    }`}
                                  >
                                    {letter}
                                  </td>
                                );
                              })}
                            </tr>
                          </thead>

                          {/* Body Rows */}
                          <tbody className="bg-white">
                            {group2Colabs.length > 0 ? (
                              group2Colabs.map((colab) => {
                                return (
                                  <tr key={`cmp2-r-${colab.matricula}`} className="border-b border-slate-200 hover:bg-slate-50/50">
                                    
                                    {/* Name Column Left-Pinned */}
                                    <td className={`p-1 font-extrabold border-r border-slate-200 sticky left-0 z-10 bg-white shadow-[1px_0_0_0_rgba(226,232,240,1)] max-w-[128px] truncate text-left text-[8.5px] ${colab.datarecisao ? 'text-rose-600' : 'text-slate-800'}`} title={colab.nome}>
                                      {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                                    </td>

                                    {/* BH Banco de horas */}
                                    <td className={`p-1 text-center font-mono border-r border-slate-200 text-[8px] font-semibold ${colab.bancohoras < 0 ? 'text-rose-600' : colab.bancohoras > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                      {formatBHValue(colab.bancohoras)}
                                    </td>

                                    {/* FF Folga feriado balance */}
                                    <td className="p-1 text-center border-r border-slate-205 text-slate-655 font-bold">
                                      {colab.folgaferiado || ''}
                                    </td>

                                    {/* FS Folga escala balance */}
                                    <td className="p-1 text-center border-r border-slate-205 text-slate-655 font-bold">
                                      {colab.folgaenf || ''}
                                    </td>

                                    {showAppSupportColumns && (
                                      <>
                                        {/* Matrícula */}
                                        <td className="p-1 text-center text-slate-400 font-mono border-r border-slate-200 whitespace-nowrap text-[8px]">
                                          {colab.matricula}
                                        </td>

                                        {/* Coren */}
                                        <td className="p-1 text-center text-slate-400 font-mono border-r border-slate-200 whitespace-nowrap text-[8px]">
                                          {colab.coren || 'N/D'}
                                        </td>

                                        {/* Cargo */}
                                        <td className="p-1 text-center border-r border-slate-200 whitespace-nowrap text-[8px] font-bold text-slate-600 font-sans" title={colab.cargo}>
                                          {formatCargoAbbreviated(colab.cargo)}
                                        </td>

                                        {/* Horário */}
                                        <td className="p-1 text-center border-r border-slate-300 bg-slate-50/65 font-mono text-[7.5px] font-semibold text-slate-500 whitespace-nowrap">
                                          {colab.horario || '19:00/07:05'}
                                        </td>
                                      </>
                                    )}

                                    {/* Days Columns */}
                                    {Array.from({ length: daysInMonth }, (_, index) => {
                                      const dNum = index + 1;
                                      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                                      const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                                      const { isWorkDay } = checkRosteredStatus(colab, dNum);
                                      const { isWeekend } = getDayOfWeekDetails(dNum);
                                      const isFocused = selectedDay2 === dNum;

                                      // Evaluate day background
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
                                            key={`cmp2-td-${colab.matricula}-${dNum}`} 
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
                                            key={`cmp2-td-${colab.matricula}-${dNum}`} 
                                            onClick={() => handleCellClick(colab, dNum)} 
                                            className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase bg-rose-50`}
                                            title="Atestado Médico Ativo (Absenteísmo)"
                                          >
                                            <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-red-100 text-red-600 border-red-300 font-extrabold font-sans">
                                              AT
                                            </span>
                                          </td>
                                        );
                                      }

                                      const hasFerias = isColabOnFeriasOnDay(colab.matricula, dNum);
                                      if (hasFerias) {
                                        return (
                                          <td 
                                            key={`cmp2-td-${colab.matricula}-${dNum}`} 
                                            onClick={() => handleCellClick(colab, dNum)} 
                                            className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase bg-purple-50`}
                                            title="Férias de Escala Ativa"
                                          >
                                            <span className="block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none bg-purple-600 text-white border-purple-500 font-extrabold font-sans">
                                              F
                                            </span>
                                          </td>
                                        );
                                      }

                                      // Evaluate code
                                      if (req) {
                                        const isApproved = req.status === 'Aprovado';
                                        const shorthand = getShorthand(req.tipo);
                                        
                                        // Specific colored cell states for approved leaves
                                        if (isApproved) {
                                          let badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-250'; // standard F
                                          if (shorthand === 'FF') {
                                            badgeStyle = 'bg-sky-100 text-sky-850 border-sky-250 font-black';
                                          } else if (shorthand === 'BH') {
                                            badgeStyle = 'bg-amber-100 text-amber-850 border-amber-250';
                                          } else if (shorthand === 'FE') {
                                            badgeStyle = 'bg-purple-100 text-purple-850 border-purple-200';
                                          } else if (shorthand === 'B') {
                                            badgeStyle = 'bg-rose-150 text-rose-850 border-rose-350';
                                          } else if (shorthand === 'E') {
                                            badgeStyle = 'bg-teal-100 text-teal-850 border-teal-250';
                                          } else if (shorthand === 'I') {
                                            badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
                                          } else if (shorthand === 'A') {
                                            badgeStyle = 'bg-red-100 text-red-800 border-red-200';
                                          } else if (shorthand === 'AT') {
                                            badgeStyle = 'bg-rose-105 text-rose-850 border-rose-250';
                                          }

                                          return (
                                            <td 
                                              key={`cmp2-td-${colab.matricula}-${dNum}`} 
                                              onClick={() => handleCellClick(colab, dNum)} 
                                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                                            >
                                              <span className={`block py-0.5 rounded-sm border text-[8px] tracking-tight leading-none ${badgeStyle}`}>
                                                {shorthand}
                                              </span>
                                            </td>
                                          );
                                        } else {
                                          return (
                                            <td 
                                              key={`cmp2-td-${colab.matricula}-${dNum}`} 
                                              onClick={() => handleCellClick(colab, dNum)} 
                                              className={`p-0.5 border-r border-slate-200 text-center align-middle font-bold cursor-pointer transition-all ${tdBg}`}
                                              title="Lançamento sob análise operacional"
                                            >
                                              <span className="block py-0.5 rounded-sm border border-dashed border-amber-200 bg-amber-50/80 text-amber-600 text-[7px] leading-tight font-sans">
                                                {shorthand}?
                                              </span>
                                            </td>
                                          );
                                        }
                                      }

                                      const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                                      if (remSector) {
                                        return (
                                          <td 
                                            key={`cmp2-td-${colab.matricula}-${dNum}`} 
                                            onClick={() => handleCellClick(colab, dNum)} 
                                            className={`p-0.5 border-r border-slate-200 text-center align-middle font-black cursor-pointer shadow-2xs transition-all uppercase ${tdBg}`}
                                            title={`Remanejado para o setor: ${remSector}`}
                                          >
                                            <span className="block py-0.5 rounded-sm border text-[6.5px] px-0.5 tracking-tight leading-none bg-amber-105 text-amber-855 border-amber-300 font-extrabold font-sans">
                                              R: {remSector}
                                            </span>
                                          </td>
                                        );
                                      }

                                      return (
                                        <td 
                                          key={`cmp2-td-${colab.matricula}-${dNum}`} 
                                          onClick={() => handleCellClick(colab, dNum)} 
                                          className={`p-0.5 border-r border-slate-200 text-center align-middle cursor-pointer transition-all hover:bg-sky-50 text-[6.5px] font-black ${tdBg}`}
                                          title={isWorkDay ? 'Plantão de Trabalho Escalonado' : 'Folga Regular de Reciprocidade (EF)'}
                                        >
                                          {/* Keep cells completely empty as preferred */}
                                          <span className="opacity-0 hover:opacity-105 text-sky-500 font-black">+</span>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={showAppSupportColumns ? 8 + daysInMonth : 4 + daysInMonth} className="p-8 text-center text-slate-400 bg-slate-50 italic font-medium font-sans">
                                  Nenhum profissional cadastrado com as condições especificadas para o Quadro Inferior (B).
                                </td>
                              </tr>
                            )}
                          </tbody>

                          {/* Footer - Aggregation Total (Ativos no Dia) */}
                          <tfoot className="bg-[#FAF8E5] border-t-2 border-slate-350 text-slate-900 font-extrabold text-center font-sans">
                            <tr className="border-b border-slate-300 font-sans">
                              <td className="p-1.5 border-r border-slate-200 bg-[#FCF8E3] text-left text-[8px] font-black text-amber-955 uppercase sticky left-0 z-10 shadow-[1px_0_0_0_rgba(226,232,240,1)] font-sans">
                                Ativos no Plantão (Total)
                              </td>
                              <td className="p-1 border-r border-slate-200 text-slate-400 text-[8px]">---</td>
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
                                const activeCount = group2Colabs.filter(c => isColabActiveOnDay(c, dNum)).length;
                                const isFocused = selectedDay2 === dNum;
                                return (
                                  <td 
                                    key={`cmp2-tot-${dNum}`}
                                    onClick={() => setSelectedDay2(dNum)}
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

                      {/* Right Sidebar: Dynamic Breakdown allocation (2 col) */}
                      <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between text-xs space-y-4 font-sans">
                        
                        <div className="space-y-3">
                          <div className="border-b border-slate-200 pb-2 flex items-center gap-1.5 font-sans">
                            <Users className="w-4 h-4 text-indigo-650" />
                            <h5 className="font-extrabold text-slate-800 uppercase tracking-tight text-[10px]">
                              Leitos (Dia {selectedDay2})
                            </h5>
                          </div>
                          
                          <p className="text-[10px] text-slate-450 leading-tight font-medium font-sans">
                            Distribuição física do efetivo ativo escalado neste plantão de foco:
                          </p>

                          {/* Render Floors breakdown list */}
                          {(() => {
                            const { items, total } = getSubsectorBreakdown(group2Colabs, selectedDay2, compareSectors2);
                            return (
                              <div className="space-y-2.5 pt-1 font-sans">
                                {items.map(item => (
                                  <div key={`cmp2-break-${item.name}`} className="space-y-1 font-sans">
                                    <div className="flex justify-between items-center text-[10.5px] text-slate-700 font-bold leading-none">
                                      <span className="truncate max-w-[100px] uppercase font-bold text-slate-655">{item.name}</span>
                                      <span className="font-black bg-white border border-slate-200 px-1.5 py-0.5 rounded-md text-indigo-700 text-[9.5px]">
                                        {item.count}
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-200/60 rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className="bg-indigo-550 h-full rounded-full transition-all duration-305"
                                        style={{ width: `${total > 0 ? (item.count / total) * 100 : 0}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                                
                                <div className="border-t border-dashed border-slate-250 pt-2 flex justify-between items-center font-black text-slate-800 text-[10.5px]">
                                  <span>Total Geral Ativo</span>
                                  <span className="text-amber-800 bg-[#FCF8E3] px-2 py-0.5 rounded-md border border-amber-200 font-sans">
                                    {total}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="bg-indigo-50/70 border border-indigo-100 p-2.5 rounded-lg text-[9px] leading-tight text-indigo-850 font-medium font-sans">
                          💡 <b>Dica:</b> Quer dimensionar outro dia do mês? Basta clicar em qualquer cabeçalho de coluna para transpor!
                        </div>

                      </div>

                    </div>

                  </div>

                </div>
              );
            })()}

            {/* Analysis Grid & Metrics block */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left column: Chart */}
              <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Gráfico de Cobertura Diária Ativa</h4>
                    <span className="text-[10px] text-slate-450 font-medium font-sans">Quantidade absoluta de profissionais em plantão ativo por dia do mês</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-sky-650">
                      <span className="w-2.5 h-2.5 bg-sky-500 rounded-xs" />
                      <span>Seu Grupo (Referência)</span>
                    </span>
                    <span className="flex items-center gap-1 text-indigo-650 font-medium">
                      <span className="w-2.5 h-2.5 bg-indigo-550 rounded-xs" />
                      <span>Grupo Comparado</span>
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="dia" stroke="#94a3b8" fontSize={9} fontWeight="bold" />
                      <YAxis stroke="#94a3b8" fontSize={9} fontWeight="bold" allowDecimals={false} />
                      <Tooltip 
                        contentStyle={{ fontSize: '11px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                        labelFormatter={(value) => `Dia: ${value}/${currentMonth}/${currentYear}`}
                      />
                      <Bar name="Seu Setor Ativos" dataKey="Seu Grupo (Ativos)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      <Bar name="Grupo Comparado Ativos" dataKey="Grupo Comparado (Ativos)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right column: Highlights and AI assistance panel */}
              <div className="space-y-4 text-xs font-sans">
                
                {/* Metric Summary Cards */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-slate-700">
                  <h4 className="font-bold text-slate-600 text-[10px] tracking-wider uppercase border-b border-slate-200 pb-1 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-slate-450" />
                    <span>Diagnóstico de Presença</span>
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="block text-slate-400 font-extrabold text-[8px] uppercase leading-none mb-1">Média Setor A</span>
                      <span className="text-base font-black text-slate-800 leading-none">
                        {(comparisonData.reduce((acc, c) => acc + c["Seu Grupo (Ativos)"], 0) / daysInMonth).toFixed(1)} <b className="text-[10px] text-slate-400 font-normal">/dia</b>
                      </span>
                    </div>
                    
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="block text-slate-400 font-extrabold text-[8px] uppercase leading-none mb-1">Média Setor B</span>
                      <span className="text-base font-black text-indigo-700 leading-none">
                        {(comparisonData.reduce((acc, c) => acc + c["Grupo Comparado (Ativos)"], 0) / daysInMonth).toFixed(1)} <b className="text-[10px] text-slate-400 font-normal">/dia</b>
                      </span>
                    </div>
                  </div>

                  {/* Specific comparative alerts */}
                  {(() => {
                    // find days with zero active on group A
                    const groupADeficits = comparisonData.filter(c => c["Seu Grupo (Ativos)"] <= 1).map(c => c.dia);
                    const groupBDeficits = comparisonData.filter(c => c["Grupo Comparado (Ativos)"] <= 1).map(c => c.dia);

                    return (
                      <div className="space-y-2 text-[10px] leading-relaxed">
                        {groupADeficits.length > 0 && (
                          <div className="bg-rose-50 text-rose-800 p-2.5 rounded-xl border border-rose-100 font-medium font-sans">
                            <span className="font-black block uppercase text-[8px] tracking-wider mb-px">Déficits Cobertura (Seu Grupo):</span>
                            <span>{groupADeficits.length} dias possuem plantão crítico (≤ 1 profissional ativo): <b className="font-mono text-xs">{groupADeficits.join(', ')}</b></span>
                          </div>
                        )}

                        {groupBDeficits.length > 0 && (
                          <div className="bg-indigo-50 text-indigo-800 p-2.5 rounded-xl border border-indigo-100 font-medium font-sans">
                            <span className="font-black block uppercase text-[8px] tracking-wider mb-px font-sans">Déficits Cobertura (Comp.):</span>
                            <span>{groupBDeficits.length} dias possuem plantão crítico (≤ 1 profissional ativo): <b className="font-mono text-xs">{groupBDeficits.join(', ')}</b></span>
                          </div>
                        )}

                        {groupADeficits.length === 0 && groupBDeficits.length === 0 && (
                          <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-100 font-medium font-sans font-sans">
                            <span className="font-black block uppercase text-[8px] tracking-wider mb-px">Escalas em Conformidade:</span>
                            <span>Excelente! Ambas as escalas possuem no mínimo 2 profissionais ativos para cobertura em todos os dias do mês.</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Intelligent Relocation Box */}
                {(() => {
                  // Find a day with Group A deficit and Group B surplus
                  const potentialSwapDay = comparisonData.find(c => c["Seu Grupo (Ativos)"] <= 1 && c["Grupo Comparado (Ativos)"] >= 3);
                  
                  return (
                    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 border border-slate-800 relative overflow-hidden font-sans">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-sky-505/10 rounded-full blur-2xl font-sans" />
                      
                      <div className="flex items-center gap-1.5 mb-2 font-sans">
                        <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                        <h4 className="font-black uppercase tracking-wider text-[9px] text-yellow-400">Sugestão de Remanejamento Hapvida</h4>
                      </div>

                      {potentialSwapDay ? (
                        <div className="space-y-1.5 text-[11px] leading-relaxed font-semibold font-sans">
                          <p>
                            Detectamos um desbalanceamento operacional crítico no dia <span className="text-yellow-300 font-mono font-bold">{potentialSwapDay.dia}/{currentMonth}/{currentYear}</span>.
                          </p>
                          <div className="bg-white/5 p-2 rounded-lg border border-white/10 space-y-0.5 text-[10px]">
                            <div className="text-slate-350">Grupo Setor A: <span className="text-rose-300 font-extrabold">{potentialSwapDay["Seu Grupo (Ativos)"]} ativo(s)</span></div>
                            <div className="text-slate-350">Grupo Setor B: <span className="text-emerald-300 font-extrabold">{potentialSwapDay["Grupo Comparado (Ativos)"]} ativo(s)</span></div>
                          </div>
                          <p className="text-slate-300 text-[10.5px] leading-snug font-normal">
                            💡 <b>Recomendação:</b> Redirecione temporariamente 1 profissional do grupo mais populoso para o grupo em déficit nesta data para suprir o plantão.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-350 font-normal font-sans">
                          <p>
                            Não identificamos pontos críticos de desbalanceamento agudo com excedentes sobressalentes nas condições selecionadas para este mês.
                          </p>
                          <p className="text-[9px] text-slate-455 leading-snug font-sans">
                            O algoritmo relacional faz leituras do histórico em tempo real comparando turnos conflitantes do mesmo calendário.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

            </div>

          </div>
        )}

        {/* Little warning box */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start gap-2.5 text-[11px] leading-relaxed text-slate-500">
          <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-700 block">Dica operacional de uso de escala:</span>
            <span>Ao clicar em qualquer célula vazia na fileira do respectivo profissional, você abrirá a central inteligente de lançamentos já pré-calculando as escalas "Plantão A" (Dias Ímpares) e "Plantão B" (Dias Pares) de forma automática. Clique em células com códigos para aprovar ou remover no ato!</span>
          </div>
        </div>

      </div>

      {/* Grid List view of Requests for Logs */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-800">Quadro Completo de Homologação de Folhas</h3>
          <p className="text-[11px] text-slate-400">Total geral de solicitações enviadas de folga para todos os times de enfermagem</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredSolicitacoes.length > 0 ? (
            filteredSolicitacoes.slice(0, 9).map(sol => {
              const isPending = sol.status === 'Pendente';
              const isApproved = sol.status === 'Aprovado';
              const isRecusado = sol.status === 'Recusado';

              return (
                <div key={sol.id} className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-all text-xs ${
                  isApproved 
                    ? 'border-emerald-100 bg-emerald-50/20' 
                    : isRecusado
                    ? 'border-rose-100 bg-rose-50/20'
                    : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50'
                }`}>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-800 text-sm leading-tight block truncate max-w-[150px]" title={sol.colaborador}>
                        {sol.colaborador}
                      </span>
                      <span className={`text-[10px] border font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                        isApproved 
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : isRecusado
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                        {sol.status}
                      </span>
                    </div>

                    <div className="space-y-0.5 text-slate-500 font-semibold leading-tight pt-1">
                      <span className="block text-slate-400 text-[10px]">Matrícula: {sol.matricula}</span>
                      <span className="block">Tipo: <b className="text-slate-700">{sol.tipo}</b></span>
                      <span className="block font-mono">Data: <b className="text-sky-700">{sol.data.split('-').reverse().join('/')}</b></span>
                      <span className="block text-[10px] text-slate-400 font-medium">Lançador: {sol.solicitante} &bull; {sol.dataCriacao}</span>
                    </div>
                  </div>

                  {/* Operational indicators */}
                  <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight font-mono">
                      #{sol.id}
                    </span>
                    
                    <div className="flex items-center gap-2">
                      {isPending && usuarioLogado.perfil !== 'Enfermeiro(a)' && (
                        <>
                          <button
                            onClick={() => handleApproveInline(sol)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 rounded-md border border-emerald-500 text-[10px] shadow-sm cursor-pointer"
                          >
                            Conceder
                          </button>
                          <button
                            onClick={() => handleRejectInline(sol)}
                            className="bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 font-bold py-1 px-2 rounded-md text-[10px] cursor-pointer"
                          >
                            Recusar
                          </button>
                        </>
                      )}
                      
                      {/* Let Nurse or Manager easily delete/cancel pending or approved leaves */}
                      {(isPending || isApproved) && (
                        <button
                          onClick={() => handleCancelInline(sol)}
                          className="text-rose-600 hover:text-rose-800 font-bold text-[10px] hover:underline cursor-pointer"
                        >
                          Cancelar/Estornar
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              );
            })
          ) : (
            <div className="col-span-full p-8 text-center text-slate-400 bg-slate-50 border border-dashed rounded-xl">
              Nenhuma solicitação de folga ou folha de escala pendente no sistema.
            </div>
          )}
        </div>
      </div>

      {/* ABSOLUTE INTERACTIVE MODAL OVERLAY (Visual Cell Launchpad) */}
      {isModalOpen && modalTargetColab && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-xs text-slate-700">
            
            {/* Header */}
            <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="bg-sky-100 text-sky-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider block w-max mb-1">
                  Atendimento Escala
                </span>
                <h4 className="text-base font-extrabold text-slate-800 leading-tight">Lançar Folga ou Afastamento</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Definir folha de escala para o profissional</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-150 rounded-lg transition-transform cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              
              {/* Profile Card Summary */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 leading-normal flex items-start gap-3">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs shrink-0 text-slate-500">
                  <Clock className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <span className="font-extrabold text-slate-800 text-[13px] block leading-tight">{modalTargetColab.nome}</span>
                  <div className="font-semibold text-slate-500 space-y-0.5 mt-1 leading-tight text-[10px]">
                    <span className="block">Matrícula: <b>{modalTargetColab.matricula}</b> &bull; Coren: <b>{modalTargetColab.coren || 'N/A'}</b></span>
                    <span className="block">Escala: <b>{modalTargetColab.equipe}</b> &bull; Cargo: <b>{modalTargetColab.cargo}</b></span>
                    <span className="block text-indigo-600 font-semibold flex items-center gap-1">
                      <CornerDownRight className="w-3 h-3 text-indigo-400" />
                      <span>Data do lançamento: <b>{modalTargetDate.split('-').reverse().join('/')}</b> ({getDayOfWeekDetails(parseInt(modalTargetDate.split('-')[2])).name})</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Roster Type Evaluation Alert */}
              <div className="p-3 rounded-xl border text-[11px] leading-relaxed">
                {(() => {
                  const dayNum = parseInt(modalTargetDate.split('-')[2]);
                  const { isWorkDay, explanation } = checkRosteredStatus(modalTargetColab, dayNum);
                  if (isWorkDay) {
                    return (
                      <div className="text-emerald-800 bg-emerald-50/50 border-emerald-100 flex gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>Dia Útil de Trabalho (Plantão):</strong> {explanation}. 
                          <span className="block text-slate-500 mt-0.5">Desejável o lançamento de folga para cobertura de escala ou abatimento de banco se aplicável.</span>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div className="text-amber-800 bg-amber-50/50 border-amber-100 flex gap-2">
                        <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>⚠️ Dia de Descanso Regular (E/F):</strong> {explanation}.
                          <span className="block text-slate-500 mt-0.5">Este dia já é uma folga natural do profissional. Lançar folga extra neste dia poderá gerar superposição ou duplicidade desnecessária.</span>
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>

              {/* Balances Board */}
              <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <span className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider block">Ativos Disponíveis deste Profissional</span>
                <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-bold">
                  <div className="bg-white p-1.5 border border-slate-200/60 rounded-lg">
                    <span className="block text-slate-400 text-[8px]">BH</span>
                    <span className="text-xs font-extrabold text-sky-700">{modalTargetColab.bancohoras}h</span>
                  </div>
                  <div className="bg-white p-1.5 border border-slate-200/60 rounded-lg">
                    <span className="block text-slate-400 text-[8px]">FE</span>
                    <span className="text-xs font-extrabold text-indigo-700">{modalTargetColab.folgaenf}d</span>
                  </div>
                  <div className="bg-white p-1.5 border border-slate-200/60 rounded-lg">
                    <span className="block text-slate-400 text-[8px]">FF</span>
                    <span className="text-xs font-extrabold text-violet-700">{modalTargetColab.folgaferiado}d</span>
                  </div>
                  <div className="bg-white p-1.5 border border-slate-200/60 rounded-lg">
                    <span className="block text-slate-400 text-[8px]">B</span>
                    <span className="text-xs font-extrabold text-rose-700">{modalTargetColab.brigada}d</span>
                  </div>
                  <div className="bg-white p-1.5 border border-slate-200/60 rounded-lg">
                    <span className="block text-slate-400 text-[8px]">E</span>
                    <span className="text-xs font-extrabold text-amber-700">{modalTargetColab.eleicao}d</span>
                  </div>
                </div>
              </div>

              {/* Remanejamento Section */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider block">Remanejamento de Setor</span>
                {remanejamentos[`${modalTargetColab.matricula}-${modalTargetDate}`] ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 bg-yellow-50 border border-yellow-250 rounded-lg text-slate-800 text-[11px] leading-tight font-medium">
                      <span>Remanejado para: <strong className="font-extrabold text-amber-900">{remanejamentos[`${modalTargetColab.matricula}-${modalTargetDate}`]}</strong></span>
                      <span className="text-[7.5px] uppercase font-black tracking-widest bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full select-none">ATIVO</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const remId = `${modalTargetColab.matricula}-${modalTargetDate}`;
                        const updated = { ...remanejamentos };
                        delete updated[remId];
                        setRemanejamentos(updated);
                        localStorage.setItem('hnsr_remanejamentos_db', JSON.stringify(updated));
                        removeDocument('remanejamentos', remId);
                      }}
                      className="w-full bg-rose-50 hover:bg-rose-105 border border-rose-200 text-rose-700 font-extrabold py-1.5 text-center rounded-lg transition-colors cursor-pointer text-[11px]"
                    >
                      Remover Remanejamento
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      className="w-full p-2.5 bg-white border border-slate-250 rounded-lg text-slate-705 font-bold focus:outline-none focus:border-indigo-500 transition-colors text-[11px]"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const remId = `${modalTargetColab.matricula}-${modalTargetDate}`;
                          const updated = { ...remanejamentos, [remId]: val };
                          setRemanejamentos(updated);
                          localStorage.setItem('hnsr_remanejamentos_db', JSON.stringify(updated));
                          saveDocument('remanejamentos', remId, { id: remId, setor: val });

                          const dayNum = parseInt(modalTargetDate.split('-')[2]);
                          const { isWorkDay } = checkRosteredStatus(modalTargetColab, dayNum);
                          if (!isWorkDay) {
                            const alreadyHas = solicitacoes.some(s => s.matricula === modalTargetColab.matricula && s.data === modalTargetDate);
                            if (!alreadyHas) {
                              const newSol: SolicitacaoFolga = {
                                id: `bh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                colaborador: modalTargetColab.nome,
                                matricula: modalTargetColab.matricula,
                                data: modalTargetDate,
                                tipo: 'Banco de Horas',
                                status: 'Aprovado',
                                solicitante: usuarioLogado.nome,
                                dataCriacao: new Date().toLocaleDateString('pt-BR')
                              };
                              const updatedSols = [...solicitacoes, newSol];
                              onUpdateSolicitacoes(updatedSols);
                              localStorage.setItem('hnsr_solicitacoes_db', JSON.stringify(updatedSols));
                            }
                          }
                          setIsModalOpen(false);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Remanejar para outro setor...</option>
                      {SETORES_HOSPITALARES.map(s => (
                        <option key={`rem-opt-${s}`} value={s}>{s}</option>
                      ))}
                      <option value="Diurno A">Diurno A</option>
                      <option value="Diurno B">Diurno B</option>
                    </select>
                    <span className="text-[10px] text-slate-400 font-medium block font-sans">Sinaliza na escala de comparação o setor temporário do profissional</span>
                  </div>
                )}
              </div>

              {/* ACTION BRANCH A: EXISTING LEAVE */}
              {modalExistingFolga ? (
                <div className="border border-slate-150 p-4 rounded-xl bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold font-semibold">
                    <span>Folga Cadastrada Ativa</span>
                    <span className={`text-[10px] border px-2 py-0.5 rounded-full ${
                      modalExistingFolga.status === 'Aprovado' 
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {modalExistingFolga.status}
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-[11px] leading-relaxed">
                    <div>Tipo: <strong className="text-slate-800">{modalExistingFolga.tipo}</strong></div>
                    <div>Solicitado por: <strong className="text-slate-800">{modalExistingFolga.solicitante}</strong></div>
                    <div>Data do registro: <span className="text-slate-500">{modalExistingFolga.dataCriacao}</span></div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-150">
                    {modalExistingFolga.status === 'Pendente' && usuarioLogado.perfil !== 'Enfermeiro(a)' && (
                      <>
                        <button
                          onClick={() => handleApproveInline(modalExistingFolga)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 font-bold py-2 px-3 text-white rounded-lg transition border border-emerald-500 cursor-pointer text-center"
                        >
                          Homologar/Aprovar
                        </button>
                        <button
                          onClick={() => handleRejectInline(modalExistingFolga)}
                          className="flex-1 bg-slate-100 hover:bg-rose-50 border border-slate-200 text-slate-600 hover:text-rose-600 font-bold py-2 px-3 rounded-lg transition cursor-pointer text-center"
                        >
                          Recusar Folga
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => handleCancelInline(modalExistingFolga)}
                      className="w-full bg-rose-50 hover:bg-rose-100/80 border border-rose-200 text-rose-700 font-extrabold py-2 px-3 rounded-lg transition-colors cursor-pointer text-center"
                    >
                      Excluir / Devolver Saldo
                    </button>
                  </div>
                </div>
              ) : (
                /* ACTION BRANCH B: FORM FOR NEW LEAVE */
                <form onSubmit={handleLaunchFolgaSubmit} className="space-y-4">
                  
                  <div className="space-y-1">
                    <label className="font-bold text-slate-650 block">Qual Tipo de Folga / Licença?</label>
                    <select
                      value={modalTipoFolga}
                      onChange={(e) => setModalTipoFolga(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:bg-white focus:border-sky-500 transition-colors"
                    >
                      <option value="Folga de Escala">Folga (F)</option>
                      <option value="Banco de Horas">Banco de Horas (BH) - Consome 12h [Saldo: {modalTargetColab?.bancohoras}h]</option>
                      <option value="Folga Feriado">Folga Feriado (FF) [Saldo: {modalTargetColab?.folgaferiado}d]</option>
                      <option value="Folga Enfermagem">Folga Enfermagem (FE) [Saldo: {modalTargetColab?.folgaenf}d]</option>
                      <option value="Folga Brigada">Brigada de Incêndio (B) [Saldo: {modalTargetColab?.brigada}d]</option>
                      <option value="Folga Eleição">Eleição (E) [Saldo: {modalTargetColab?.eleicao}d]</option>
                      <option value="Integração">Integração (I)</option>
                      <option value="Folga Troca de Plantão">Troca de Plantão (X)</option>
                      <option value="Falta">Ausente - Falta s/ justificativa (A)</option>
                    </select>
                  </div>

                  {/* Immediate authorization Toggle for Supervisors */}
                  {usuarioLogado.perfil !== 'Enfermeiro(a)' && (
                    <div className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                      <div>
                        <span className="font-bold text-indigo-900 block leading-tight">Homologação Imediata</span>
                        <span className="text-[10px] text-indigo-500">Lançar folga no status de Aprovado de imediato</span>
                      </div>
                      <input 
                        type="checkbox"
                        checked={modalImmediateApproval}
                        onChange={(e) => setModalImmediateApproval(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4" /> 
                    <span>Lançar nesta data</span>
                  </button>
                </form>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-white hover:bg-slate-100 text-slate-500 font-bold py-1.5 px-4 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Voltar ao Quadro
              </button>
            </div>

          </div>

        </div>
      )}

      {/* EXPORT / PRINT MODAL OVERLAY */}
      {isPrintPreviewOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn print-backdrop-overlay">
          
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col text-slate-700 text-xs">
            
            {/* Modal Header */}
            <div className="bg-slate-50 p-5 border-b border-slate-200/60 flex justify-between items-center">
              <div>
                <h4 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-emerald-600" />
                  <span>Configuração e Visualização do PDF de Impressão (Fitted A4 landscape)</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Impressão calibrada para folha unificada A4. Altere a escala desejada no menu abaixo.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const timer = setTimeout(() => {
                      window.print();
                    }, 150);
                    return () => clearTimeout(timer);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 px-5 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Exportar PDF</span>
                </button>
                <button
                  onClick={() => setIsPrintPreviewOpen(false)}
                  className="bg-white hover:bg-slate-100 text-slate-500 font-extrabold py-2 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Selector of layout - NON PRINTABLE */}
            <div className="p-4 bg-indigo-50/65 border-b border-indigo-100 flex flex-wrap gap-4 items-center justify-between no-print">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span className="font-extrabold text-slate-800 text-xs">Selecione o Modelo de Escala para Visualização:</span>
                <select
                  value={printLayoutMode}
                  onChange={(e) => setPrintLayoutMode(e.target.value as any)}
                  className="bg-white border border-indigo-200 text-slate-800 text-[11px] font-extrabold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                >
                  <option value="escala_setor_sem">Escala por Setor (Sem Remanejamento)</option>
                  <option value="escala_setor_com">Escala por Setor (Com Remanejamento)</option>
                  <option value="escala_comparar_enf">Escala Comparativa Enfermeiros (Com Remanejamento)</option>
                  <option value="escala_comparar_tec">Escala Comparativo Técnicos e Auxiliares (Com Remanejamento)</option>
                </select>
              </div>
              <div className="text-[10px] text-indigo-700 font-bold bg-indigo-100/60 px-3 py-1.5 rounded-xl border border-indigo-200 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Formatado para folha unificada de tamanho A4 (Impressão em modo Paisagem/Landscape).</span>
              </div>
            </div>

            {/* Print preview content wrapper */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
              
              {/* Paper Simulator sheet */}
              <div id="escala-print-area" className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 min-h-[21cm] w-full text-[10px] text-slate-850 mx-auto font-sans">
                
                {/* Print CSS overrides */}
                <style dangerouslySetInnerHTML={{ __html: `
                  @media print {
                    body * {
                      visibility: hidden !important;
                    }
                    #escala-print-area, #escala-print-area * {
                      visibility: visible !important;
                    }
                    #escala-print-area {
                      position: absolute !important;
                      left: 0 !important;
                      top: 0 !important;
                      width: 100% !important;
                      background: white !important;
                      color: black !important;
                      padding: 10px !important;
                      margin: 0 !important;
                      box-shadow: none !important;
                      border: none !important;
                    }
                    .no-print {
                      display: none !important;
                    }
                    /* Reset modal parent layouts during printing */
                    .print-backdrop-overlay {
                      position: absolute !important;
                      inset: 0 !important;
                      width: 100% !important;
                      height: auto !important;
                      max-height: none !important;
                      overflow: visible !important;
                      display: block !important;
                      background: transparent !important;
                    }
                    .print-backdrop-overlay > div {
                      max-height: none !important;
                      overflow: visible !important;
                      box-shadow: none !important;
                      border: none !important;
                      background: transparent !important;
                    }
                    .print-backdrop-overlay .overflow-y-auto {
                      overflow: visible !important;
                      max-height: none !important;
                    }
                    @page {
                      size: landscape;
                      margin: 0.4cm;
                    }
                    .print-table-container {
                      margin-bottom: 20px !important;
                      break-inside: avoid !important;
                    }
                  }
                `}} />

                {/* Cover Header with Logo */}
                <div className="flex justify-between items-start border-b-2 border-sky-605 pb-4 mb-4">
                  
                  {/* Brand hapvida logo */}
                  <div className="flex flex-col items-start gap-1">
                    <HapvidaLogo textSize="lg" animated={false} />
                    <span className="text-[7.5px] uppercase tracking-widest font-black text-slate-400 block mt-0.5">SISTEMA INTEGRADO DE ESCALAS</span>
                  </div>

                  <div className="text-right leading-tight">
                    <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest">Escala de Plantões Assistenciais</h2>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">
                      { (printLayoutMode === 'escala_comparar_enf' || printLayoutMode === 'escala_comparar_tec') ? (
                        <span>ESCALA COMPARATIVA DE COBERTURA</span>
                      ) : (
                        <span>Setor: <span className="text-sky-700 font-extrabold">{selectedSetor === 'Todos' ? 'TODOS OS SETORES' : selectedSetor.toUpperCase()}</span></span>
                      ) }
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium">
                      {(printLayoutMode === 'escala_comparar_enf') ? 'Categoria: ENFERMEIROS' : (printLayoutMode === 'escala_comparar_tec') ? 'Categoria: TÉCNICOS E AUXILIARES' : ''} Período de Referência: {monthNames[currentMonth - 1]} de {currentYear}
                    </p>
                  </div>

                </div>

                {/* Print layout routing based on printLayoutMode */}
                <div className="space-y-6">
                  { (printLayoutMode === 'escala_comparar_enf' || printLayoutMode === 'escala_comparar_tec') ? (() => {
                    const printRoleMode = (printLayoutMode === 'escala_comparar_enf') ? 'enfermeiros' : 'tecnicos_auxiliares';
                    
                    const printGroup1Colabs = colaboradores
                      .filter(c => {
                        if (getColabStatus(c).shouldRemove) return false;
                        const sectorMatch = colabMatchesSector(c.setor, compareSectors1);
                        const equipeMatch = belongsToEquipe(c, compareEquipe1);
                        let roleMatch = true;
                        if (printRoleMode === 'enfermeiros') {
                          roleMatch = isEnfermeiroFn(c.cargo);
                        } else {
                          roleMatch = isTecnicoOuAuxiliarFn(c.cargo);
                        }
                        return sectorMatch && equipeMatch && roleMatch;
                      })
                      .sort((a, b) => {
                        const aCargo = a.cargo?.toLowerCase() || '';
                        const bCargo = b.cargo?.toLowerCase() || '';
                        const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') || aCargo.includes('coordenador') || aCargo.includes('supervisor') ? 1 : 0;
                        const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') || bCargo.includes('coordenador') || bCargo.includes('supervisor') ? 1 : 0;
                        if (aIsEnf !== bIsEnf) return bIsEnf - aIsEnf;
                        return a.nome.localeCompare(b.nome);
                      });

                    const printGroup2Colabs = colaboradores
                      .filter(c => {
                        if (getColabStatus(c).shouldRemove) return false;
                        const sectorMatch = colabMatchesSector(c.setor, compareSectors2);
                        const equipeMatch = belongsToEquipe(c, compareEquipe2);
                        let roleMatch = true;
                        if (printRoleMode === 'enfermeiros') {
                          roleMatch = isEnfermeiroFn(c.cargo);
                        } else {
                          roleMatch = isTecnicoOuAuxiliarFn(c.cargo);
                        }
                        return sectorMatch && equipeMatch && roleMatch;
                      })
                      .sort((a, b) => {
                        const aCargo = a.cargo?.toLowerCase() || '';
                        const bCargo = b.cargo?.toLowerCase() || '';
                        const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') || aCargo.includes('coordenador') || aCargo.includes('supervisor') ? 1 : 0;
                        const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') || bCargo.includes('coordenador') || bCargo.includes('supervisor') ? 1 : 0;
                        if (aIsEnf !== bIsEnf) return bIsEnf - aIsEnf;
                        return a.nome.localeCompare(b.nome);
                      });

                    return (
                      <div className="space-y-8">
                        {/* Group 1 Comparison Table */}
                        <div className="print-table-container space-y-1.5 avoid-break">
                          <div className="flex items-center justify-between border-b border-slate-350 pb-0.5">
                            <span className="font-extrabold text-[10px] text-slate-850 uppercase tracking-wider">
                              &raquo; GRUPO COMPARATIVO 1: {compareSectors1.join('/')} - {compareEquipe1}
                            </span>
                            <span className="text-[8.5px] text-slate-400 font-bold block">
                              Total de Profissionais nesta escala: {printGroup1Colabs.length}
                            </span>
                          </div>
                          <table className="print-table w-full border-collapse border border-slate-300 table-fixed text-[8.2px] text-slate-705">
                            <thead className="bg-slate-50 text-slate-800 tracking-wide font-extrabold">
                              <tr className="border-b border-slate-350">
                                <th className="w-28 text-left p-1 border-r border-slate-200 bg-slate-50">Colaborador</th>
                                <th className="w-12 text-center p-1 border-r border-slate-200 bg-slate-50">Cargo</th>
                                <th className="w-12 text-center p-1 border-r border-slate-200 bg-slate-50 font-mono">Matrícula</th>
                                <th className="w-10 text-center p-1 border-r border-slate-200 bg-slate-50">Saldo BH</th>
                                <th className="w-10 text-center p-1 border-r border-slate-200 bg-slate-50">Saldo FF</th>
                                {Array.from({ length: daysInMonth }, (_, index) => {
                                  const dNum = index + 1;
                                  const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                                  return (
                                    <th key={`comp-prh1-${dNum}`} className={`w-5 text-center select-none p-0.5 border-r border-slate-200 font-black ${isWeekend ? 'bg-rose-50 text-rose-600' : 'bg-slate-100'}`}>
                                      <div className="text-[6px] opacity-75">{letter}</div>
                                      <div className="text-[7.5px]">{dNum}</div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {printGroup1Colabs.length > 0 ? (
                                printGroup1Colabs.map((colab) => (
                                  <tr key={`comp1-r-${colab.matricula}`} className="border-b border-slate-200 bg-white">
                                    <td className="p-1 font-bold text-slate-850 border-r border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap text-[8.2px]" title={colab.nome}>
                                      {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                                    </td>
                                    <td className="p-1 text-center font-medium border-r border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap text-[7.5px]" title={colab.cargo}>
                                      {formatCargoAbbreviated(colab.cargo)}
                                    </td>
                                    <td className="p-1 text-center text-slate-505 font-mono border-r border-slate-200 whitespace-nowrap text-[7.5px]">
                                      {colab.matricula}
                                    </td>
                                    <td className={`p-1 text-center font-mono border-r border-slate-200 whitespace-nowrap text-[7.5px] font-semibold ${colab.bancohoras < 0 ? 'text-red-650' : 'text-emerald-750'}`}>
                                      {formatBHValue(colab.bancohoras)}
                                    </td>
                                    <td className="p-1 text-center text-slate-655 font-bold border-r border-slate-200 whitespace-nowrap text-[7.5px]">
                                      {colab.folgaferiado || ''}
                                    </td>
                                    {Array.from({ length: daysInMonth }, (_, index) => {
                                      const dNum = index + 1;
                                      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                                      const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                                      const { isWorkDay } = checkRosteredStatus(colab, dNum);

                                      const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo);
                                      if (hasAtestado) {
                                        return (
                                          <td key={`comp1-prcd-at-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-rose-100 text-red-600 text-[8px] uppercase">
                                            AT
                                          </td>
                                        );
                                      }

                                      const hasFerias = isColabOnFeriasOnDay(colab.matricula, dNum);
                                      if (hasFerias) {
                                        return (
                                          <td key={`comp1-prcd-fer-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-purple-100 text-purple-700 text-[8px] uppercase">
                                            F
                                          </td>
                                        );
                                      }

                                      const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                                      if (remSector) {
                                        return (
                                          <td key={`comp1-prcd-rem-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-semibold bg-amber-50 text-[#92400e] text-[6.5px] uppercase">
                                            R:{remSector}
                                          </td>
                                        );
                                      }

                                      if (req) {
                                        const isApproved = req.status === 'Aprovado';
                                        const shorthand = getShorthand(req.tipo);
                                        if (isApproved) {
                                          return (
                                            <td key={`comp1-prcd-req-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-emerald-100 text-emerald-800 text-[8px] uppercase">
                                              {shorthand}
                                            </td>
                                          );
                                        } else {
                                          return (
                                            <td key={`comp1-prcd-reqp-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-amber-100 text-amber-800 text-[7px]">
                                              {shorthand}?
                                            </td>
                                          );
                                        }
                                      }

                                      return (
                                        <td key={`comp1-prcd-free-${colab.matricula}-${dNum}`} className={`p-0.5 border-r border-slate-200 text-center align-middle font-bold ${isWorkDay ? 'bg-white' : 'bg-slate-50'}`}>
                                          {isWorkDay ? '' : ''}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5 + daysInMonth} className="p-4 text-center text-slate-400 font-bold bg-white italic">
                                    Nenhum profissional localizado nesta escala comparativa.
                                  </td>
                                </tr>
                              )}
                              
                              {/* Totals row */}
                              <tr className="bg-sky-50 font-bold text-sky-950 border-t border-slate-350">
                                <td className="p-1 font-black text-sky-905 border-r border-slate-200">Ativos no Dia</td>
                                <td className="p-1 border-r border-slate-200 text-center">---</td>
                                <td className="p-1 border-r border-slate-200 text-center font-mono">---</td>
                                <td className="p-1 border-r border-slate-200 text-center">---</td>
                                <td className="p-1 border-r border-slate-200 text-center">---</td>
                                {Array.from({ length: daysInMonth }, (_, index) => {
                                  const dNum = index + 1;
                                  const count = printGroup1Colabs.filter(c => isColabActiveOnDay(c, dNum)).length;
                                  return (
                                    <td key={`comp1-joint-tot-print-${dNum}`} className="p-0.5 border-r border-slate-200 text-center font-black text-[7.5px] text-sky-900 bg-sky-50">
                                      {count}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Group 2 Comparison Table */}
                        <div className="print-table-container space-y-1.5 avoid-break">
                          <div className="flex items-center justify-between border-b border-slate-350 pb-0.5">
                            <span className="font-extrabold text-[10px] text-slate-850 uppercase tracking-wider">
                              &raquo; GRUPO COMPARATIVO 2: {compareSectors2.join('/')} - {compareEquipe2}
                            </span>
                            <span className="text-[8.5px] text-slate-400 font-bold block">
                              Total de Profissionais nesta escala: {printGroup2Colabs.length}
                            </span>
                          </div>
                          <table className="print-table w-full border-collapse border border-slate-300 table-fixed text-[8.2px] text-slate-705">
                            <thead className="bg-slate-50 text-slate-800 tracking-wide font-extrabold">
                              <tr className="border-b border-slate-350">
                                <th className="w-28 text-left p-1 border-r border-slate-200 bg-slate-50">Colaborador</th>
                                <th className="w-12 text-center p-1 border-r border-slate-200 bg-slate-50">Cargo</th>
                                <th className="w-12 text-center p-1 border-r border-slate-200 bg-slate-50 font-mono">Matrícula</th>
                                <th className="w-10 text-center p-1 border-r border-slate-200 bg-slate-50">Saldo BH</th>
                                <th className="w-10 text-center p-1 border-r border-slate-200 bg-slate-50">Saldo FF</th>
                                {Array.from({ length: daysInMonth }, (_, index) => {
                                  const dNum = index + 1;
                                  const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                                  return (
                                    <th key={`comp-prh2-${dNum}`} className={`w-5 text-center select-none p-0.5 border-r border-slate-200 font-black ${isWeekend ? 'bg-rose-50 text-rose-600' : 'bg-slate-100'}`}>
                                      <div className="text-[6px] opacity-75">{letter}</div>
                                      <div className="text-[7.5px]">{dNum}</div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {printGroup2Colabs.length > 0 ? (
                                printGroup2Colabs.map((colab) => (
                                  <tr key={`comp2-r-${colab.matricula}`} className="border-b border-slate-200 bg-white">
                                    <td className="p-1 font-bold text-slate-850 border-r border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap text-[8.2px]" title={colab.nome}>
                                      {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                                    </td>
                                    <td className="p-1 text-center font-medium border-r border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap text-[7.5px]" title={colab.cargo}>
                                      {formatCargoAbbreviated(colab.cargo)}
                                    </td>
                                    <td className="p-1 text-center text-slate-505 font-mono border-r border-slate-200 whitespace-nowrap text-[7.5px]">
                                      {colab.matricula}
                                    </td>
                                    <td className={`p-1 text-center font-mono border-r border-slate-200 whitespace-nowrap text-[7.5px] font-semibold ${colab.bancohoras < 0 ? 'text-red-650' : 'text-emerald-750'}`}>
                                      {formatBHValue(colab.bancohoras)}
                                    </td>
                                    <td className="p-1 text-center text-slate-655 font-bold border-r border-slate-200 whitespace-nowrap text-[7.5px]">
                                      {colab.folgaferiado || ''}
                                    </td>
                                    {Array.from({ length: daysInMonth }, (_, index) => {
                                      const dNum = index + 1;
                                      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                                      const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                                      const { isWorkDay } = checkRosteredStatus(colab, dNum);

                                      const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo);
                                      if (hasAtestado) {
                                        return (
                                          <td key={`comp2-prcd-at-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-rose-100 text-red-600 text-[8px] uppercase">
                                            AT
                                          </td>
                                        );
                                      }

                                      const hasFerias = isColabOnFeriasOnDay(colab.matricula, dNum);
                                      if (hasFerias) {
                                        return (
                                          <td key={`comp2-prcd-fer-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-purple-100 text-purple-700 text-[8px] uppercase">
                                            F
                                          </td>
                                        );
                                      }

                                      const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                                      if (remSector) {
                                        return (
                                          <td key={`comp2-prcd-rem-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-semibold bg-amber-50 text-[#92400e] text-[6.5px] uppercase">
                                            R:{remSector}
                                          </td>
                                        );
                                      }

                                      if (req) {
                                        const isApproved = req.status === 'Aprovado';
                                        const shorthand = getShorthand(req.tipo);
                                        if (isApproved) {
                                          return (
                                            <td key={`comp2-prcd-req-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-emerald-100 text-emerald-800 text-[8px] uppercase">
                                              {shorthand}
                                            </td>
                                          );
                                        } else {
                                          return (
                                            <td key={`comp2-prcd-reqp-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-amber-100 text-amber-800 text-[7px]">
                                              {shorthand}?
                                            </td>
                                          );
                                        }
                                      }

                                      return (
                                        <td key={`comp2-prcd-free-${colab.matricula}-${dNum}`} className={`p-0.5 border-r border-slate-200 text-center align-middle font-bold ${isWorkDay ? 'bg-white' : 'bg-slate-50'}`}>
                                          {isWorkDay ? '' : ''}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5 + daysInMonth} className="p-4 text-center text-slate-400 font-bold bg-white italic">
                                    Nenhum profissional localizado nesta escala comparativa.
                                  </td>
                                </tr>
                              )}
                              
                              {/* Totals row */}
                              <tr className="bg-sky-50 font-bold text-sky-950 border-t border-slate-350">
                                <td className="p-1 font-black text-sky-905 border-r border-slate-200">Ativos no Dia</td>
                                <td className="p-1 border-r border-slate-200 text-center">---</td>
                                <td className="p-1 border-r border-slate-200 text-center font-mono">---</td>
                                <td className="p-1 border-r border-slate-200 text-center">---</td>
                                <td className="p-1 border-r border-slate-200 text-center">---</td>
                                {Array.from({ length: daysInMonth }, (_, index) => {
                                  const dNum = index + 1;
                                  const count = printGroup2Colabs.filter(c => isColabActiveOnDay(c, dNum)).length;
                                  return (
                                    <td key={`comp2-joint-tot-print-${dNum}`} className="p-0.5 border-r border-slate-200 text-center font-black text-[7.5px] text-sky-900 bg-sky-50">
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
                  })() : (
                    ['Diurno A', 'Diurno B', 'Noturno A', 'Noturno B', 'Diarista'].map((shiftName) => {
                    const belongsToShift = (colab: Colaborador, sName: string) => {
                      const eq = colab.equipe?.toLowerCase() || '';
                      if (sName === 'Diurno A') return eq === 'diurno a' || eq === 'turno diurno a' || eq.includes('diurno a');
                      if (sName === 'Diurno B') return eq === 'diurno b' || eq === 'turno diurno b' || eq.includes('diurno b');
                      if (sName === 'Noturno A') return eq === 'noturno a' || eq === 'turno noturno a' || eq.includes('noturno a');
                      if (sName === 'Noturno B') return eq === 'noturno b' || eq === 'turno noturno b' || eq.includes('noturno b');
                      if (sName === 'Diarista') return eq === 'diário' || eq === 'diario' || eq === 'diarista' || eq.includes('diário') || eq.includes('diario') || eq.includes('diarista');
                      return false;
                    };

                    const shiftColabs = colaboradores
                      .filter(c => (selectedSetor === 'Todos' || c.setor === selectedSetor) && belongsToShift(c, shiftName))
                      .sort((a, b) => {
                        const aCargo = a.cargo?.toLowerCase() || '';
                        const bCargo = b.cargo?.toLowerCase() || '';
                        const aIsEnf = aCargo.includes('enfermeiro') || aCargo.includes('enfermeira') || aCargo.startsWith('enf') ? 1 : 0;
                        const bIsEnf = bCargo.includes('enfermeiro') || bCargo.includes('enfermeira') || bCargo.startsWith('enf') ? 1 : 0;
                        if (aIsEnf !== bIsEnf) return bIsEnf - aIsEnf;
                        return a.nome.localeCompare(b.nome);
                      });

                    return (
                      <div key={`print-shift-${shiftName}`} className="print-table-container space-y-1.5 avoid-break">
                        
                        {/* Header banner */}
                        <div className="flex items-center justify-between border-b border-slate-350 pb-0.5">
                          <span className="font-extrabold text-[10px] text-slate-800 uppercase tracking-wider">
                            &raquo; Equipe {shiftName}
                          </span>
                          <span className="text-[8.5px] text-slate-400 font-bold block">
                            Total de Profissionais nesta equipe: {shiftColabs.length}
                          </span>
                        </div>

                        {/* Shift Table Grid */}
                        <table className="print-table w-full border-collapse border border-slate-300 table-fixed text-[8.5px] text-slate-705">
                          
                          <thead className="bg-slate-50 text-slate-800 tracking-wide font-extrabold">
                            <tr className="border-b border-slate-350">
                              <th className="w-36 text-left p-1 border-r border-slate-200 bg-slate-50">Colaborador</th>
                              <th className="w-14 text-center p-1 border-r border-slate-200 bg-slate-50">Cargo</th>
                              <th className="w-14 text-center p-1 border-r border-slate-200 bg-slate-50">Matrícula</th>
                              {Array.from({ length: daysInMonth }, (_, index) => {
                                const dNum = index + 1;
                                const { letter, isWeekend } = getDayOfWeekDetails(dNum);
                                return (
                                  <th key={`prh-${shiftName}-${dNum}`} className={`w-6 text-center select-none p-0.5 border-r border-slate-200 font-black ${isWeekend ? 'bg-rose-50 text-rose-600' : 'bg-slate-100'}`}>
                                    <div className="text-[6.5px] opacity-75">{letter}</div>
                                    <div className="text-[8px]">{dNum}</div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>

                          <tbody>
                            {shiftColabs.length > 0 ? (
                              shiftColabs.map((colab) => (
                                <tr key={`prcol-${shiftName}-${colab.matricula}`} className="border-b border-slate-200 bg-white">
                                  <td className="p-1 font-bold text-slate-850 border-r border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap text-[8.5px]" title={colab.nome}>
                                    {colab.datarecisao ? `VAGA (${colab.nome})` : colab.nome}
                                  </td>
                                  
                                  <td className="p-1 text-center font-medium border-r border-slate-200 overflow-hidden text-ellipsis whitespace-nowrap text-[7.5px]" title={colab.cargo}>
                                    {colab.cargo.replace(' de Enfermagem', '')}
                                  </td>

                                  <td className="p-1 text-center text-slate-500 font-mono border-r border-slate-200 whitespace-nowrap text-[7.5px]">
                                    {colab.matricula}
                                  </td>

                                  {Array.from({ length: daysInMonth }, (_, index) => {
                                    const dNum = index + 1;
                                    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
                                    const req = solicitacoesLookup[`${colab.matricula}-${dateStr}`];
                                    const { isWorkDay } = checkRosteredStatus(colab, dNum);

                                    const hasAtestado = isColabOnAtestado(colab.matricula, currentYear, currentMonth, dNum, absenteismo);
                                    if (hasAtestado) {
                                      return (
                                        <td key={`prcd-${shiftName}-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-rose-100 text-red-600 text-[8.5px] uppercase">
                                          AT
                                        </td>
                                      );
                                    }

                                    const hasFerias = isColabOnFeriasOnDay(colab.matricula, dNum);
                                    if (hasFerias) {
                                      return (
                                        <td key={`prcd-${shiftName}-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-purple-100 text-purple-700 text-[8px] uppercase">
                                          F
                                        </td>
                                      );
                                    }

                                    const remSector = remanejamentos[`${colab.matricula}-${dateStr}`];
                                    if (remSector) {
                                      return (
                                        <td key={`prcd-${shiftName}-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-semibold bg-amber-50 text-[#92400e] text-[6.5px] uppercase">
                                          R:{remSector}
                                        </td>
                                      );
                                    }

                                    if (req) {
                                      const isApproved = req.status === 'Aprovado';
                                      const shorthand = getShorthand(req.tipo);
                                      if (isApproved) {
                                        return (
                                          <td key={`prcd-${shiftName}-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-emerald-100 text-emerald-800 text-[8.5px] uppercase">
                                            {shorthand}
                                          </td>
                                        );
                                      } else {
                                        return (
                                          <td key={`prcd-${shiftName}-${colab.matricula}-${dNum}`} className="p-0.5 border-r border-slate-200 text-center align-middle font-black bg-amber-100 text-amber-800 text-[7px]" title="Pendente homologação">
                                            {shorthand}?
                                          </td>
                                        );
                                      }
                                    }

                                    return (
                                      <td key={`prcd-${shiftName}-${colab.matricula}-${dNum}`} className={`p-0.5 border-r border-slate-200 text-center align-middle font-bold ${isWorkDay ? 'bg-white' : 'bg-slate-50'}`}>
                                        {isWorkDay ? '' : ''}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={3 + daysInMonth} className="p-4 text-center text-slate-400 font-bold bg-white italic">
                                  Nenhum profissional localizado nesta escala para {selectedSetor === 'Todos' ? 'Geral' : selectedSetor}.
                                </td>
                              </tr>
                            )}

                            {/* Aggregation total row */}
                            <tr className="bg-sky-50 font-bold text-sky-950 border-t border-slate-350">
                              <td className="p-1 font-black text-sky-905 border-r border-slate-200">
                                Total Técnico + Auxiliar
                              </td>
                              <td className="p-1 border-r border-slate-200 font-bold text-center">---</td>
                              <td className="p-1 border-r border-slate-200 font-bold text-center">---</td>
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
                                  <td key={`joint-tot-print-${dNum}`} className="p-0.5 border-r border-slate-200 text-center font-black text-[8px] text-sky-900 bg-sky-50">
                                    {count}
                                  </td>
                                );
                              })}
                            </tr>

                          </tbody>

                        </table>
                      </div>
                    );
                  })
                )}
                </div>

                {/* Legend container and signature sections at the footer */}
                <div className="mt-8 border-t border-slate-300 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4 avoid-break">
                  
                  {/* Legend Block */}
                  <div className="space-y-2 text-slate-600 text-[8.5px] leading-relaxed font-semibold">
                    <span className="font-extrabold uppercase text-slate-500 block tracking-wider">LEGENDA OPERACIONAL DE ESCALA:</span>
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div><b>FS:</b> Folga de Escala</div>
                      <div><b>BH:</b> Banco de Horas</div>
                      <div><b>FF:</b> Folga Feriado</div>
                      <div><b>FE:</b> Folga Eleições</div>
                      <div><b>FB:</b> Folga Brigada</div>
                      <div><b>X:</b> Troca de Plantão</div>
                      <div><b>?:</b> Pendente Homologação</div>
                      <div className="col-span-3 border-t pt-1.5 mt-1 text-[8px] font-medium text-slate-400 py-1">
                        * O dia em branco representa Plantão Ativo de 12 horas.
                        <br />
                        * E/F representa Descanso Regulamentar de Escala/Folga para turnos intercalados.
                      </div>
                    </div>
                  </div>

                  {/* Signatures and Sign-off */}
                  <div className="flex flex-col justify-end text-[9px] text-slate-600 space-y-6 md:pl-10">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <div className="border-b border-slate-400 h-8" />
                        <span className="block font-bold text-slate-700 mt-1">Responsável Técnico (RT)</span>
                        <span className="block text-[8px] text-slate-450">Assinatura e Carimbo</span>
                      </div>
                      <div className="text-center">
                        <div className="border-b border-slate-400 h-8" />
                        <span className="block font-bold text-slate-700 mt-1">Coordenação de Enfermagem</span>
                        <span className="block text-[8px] text-slate-450">Hapvida Saúde</span>
                      </div>
                    </div>
                    <div className="text-right text-[7.5px] text-slate-400 font-medium pt-1">
                      Impresso via Portal de Escalas Hapvida em {new Date().toLocaleDateString('pt-BR')} as {new Date().toLocaleTimeString('pt-BR')}
                    </div>
                  </div>

                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-3.5 border-t border-slate-200/60 flex justify-end gap-2">
              <button
                onClick={() => setIsPrintPreviewOpen(false)}
                className="bg-white hover:bg-slate-100 text-slate-500 font-extrabold py-1.5 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                Retornar ao Portal
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
