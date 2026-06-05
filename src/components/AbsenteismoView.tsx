/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Stethoscope, Search, Calendar, FolderHeart, CalendarDays,
  PlusCircle, Trash2, TrendingDown, ClipboardList, RefreshCw, X, FileText, Edit, Pencil 
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Absenteismo, Colaborador, Usuario } from '../types';
import SearchableColaboradorSelect from './SearchableColaboradorSelect';
import { CID_NATIVO, SETORES_HOSPITALARES, EQUIPES_ESCALA } from '../data/mockData';

interface AbsenteismoViewProps {
  absenteismo: Absenteismo[];
  colaboradores: Colaborador[];
  onUpdateAbsenteismo: (novosAbs: Absenteismo[]) => void;
  usuarioLogado?: Usuario;
}

export default function AbsenteismoView({ 
  absenteismo, 
  colaboradores, 
  onUpdateAbsenteismo,
  usuarioLogado
}: AbsenteismoViewProps) {
  // Search query inputs
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMeses, setSelectedMeses] = useState<string[]>([]);
  const [selectedTurnos, setSelectedTurnos] = useState<string[]>([]);
  const [selectedSetores, setSelectedSetores] = useState<string[]>([]);

  // Toggles for GAS styled multi-select dropdown boxes
  const [openDropdown, setOpenDropdown] = useState<'mes' | 'turno' | 'setor' | null>(null);

  // Modal controller
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState('');

  // Import states
  const [isOpenImportModal, setIsOpenImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  // Form states for adding absenteeism reports
  const [colaboradorNome, setColaboradorNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [tipo, setTipo] = useState<'Atestado' | 'Licença / Outros'>('Atestado');
  const [inicio, setInicio] = useState('');
  const [duracaoNum, setDuracaoNum] = useState<number>(1);
  const [cid, setCid] = useState('');
  const [patologia, setPatologia] = useState('');
  const [setorForm, setSetorForm] = useState('');
  const [turnoForm, setTurnoForm] = useState('');

  // 1. Interactive Helper: Auto calculates final dates based on duration count
  const calculatedFim = useMemo(() => {
    if (!inicio || !duracaoNum) return '';
    try {
      const d = new Date(inicio);
      d.setDate(d.getDate() + Math.floor(duracaoNum));
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }, [inicio, duracaoNum]);

  // 2. Interactive Helper: Autocompletes pathology names based on custom standard CIDs
  const handleCidBlur = (code: string) => {
    const uppercaseCode = code.trim().toUpperCase();
    if (CID_NATIVO[uppercaseCode]) {
      setPatologia(CID_NATIVO[uppercaseCode]);
    } else {
      setPatologia("CID livre.");
    }
  };

  // 3. Dynamic lists of active months (parsed elegantly using spreadsheet formats from JS.html)
  const availableMonths = useMemo(() => {
    const months: Record<string, string> = {};
    absenteismo.forEach(item => {
      const dateVal = item.inicio;
      if (!dateVal) return;
      const parsedS = dateVal.trim().split('T')[0];
      const p = parsedS.split('-');
      if (p.length === 3) {
        const ym = `${p[0]}-${p[1]}`;
        const label = new Date(parseInt(p[0]), parseInt(p[1]) - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        months[ym] = label.charAt(0).toUpperCase() + label.slice(1);
      }
    });
    return Object.entries(months).map(([ym, label]) => ({ ym, label }));
  }, [absenteismo]);

  // Handle multi-select checklists
  const toggleCheckbox = (list: string[], setList: (v: string[]) => void, value: string) => {
    if (list.includes(value)) {
      setList(list.filter(item => item !== value));
    } else {
      setList([...list, value]);
    }
  };

  // Duration parsers as implemented in critical GAS logic
  const parseDurationToDays = (duracao: string): number => {
    if (!duracao) return 0;
    const s = duracao.toLowerCase().trim().replace(',', '.');
    const num = parseFloat(s);
    if (!isNaN(num) && /^[0-9.]+\s*$/.test(s)) return num;
    if (s.includes('hora')) {
      const match = s.match(/(\d+(\.\d+)?)/);
      return match ? parseFloat(match[0]) / 24 : 0;
    }
    if (s.includes('dia')) {
      const match = s.match(/(\d+(\.\d+)?)/);
      return match ? parseFloat(match[0]) : 0;
    }
    return isNaN(num) ? 0 : num;
  };

  // 4. Filtering algorithm from JS.html
  const filteredAbsenteismo = useMemo(() => {
    return absenteismo.filter(item => {
      const termLower = searchTerm.toLowerCase();
      const matchSearch = 
        item.colaborador.toLowerCase().includes(termLower) || 
        item.matricula.includes(termLower) || 
        item.cid.toLowerCase().includes(termLower);

      const matchTurno = selectedTurnos.length === 0 || selectedTurnos.includes(item.turno);
      const matchSetor = selectedSetores.length === 0 || selectedSetores.includes(item.setor);

      // Month matching
      let matchMonth = true;
      if (selectedMeses.length > 0 && item.inicio) {
        const p = item.inicio.trim().split('T')[0].split('-');
        if (p.length === 3) {
          const ym = `${p[0]}-${p[1]}`;
          matchMonth = selectedMeses.includes(ym);
        } else {
          matchMonth = false;
        }
      }

      return matchSearch && matchTurno && matchSetor && matchMonth;
    });
  }, [absenteismo, searchTerm, selectedTurnos, selectedSetores, selectedMeses]);

  // 5. Reactive Analytical KPI counts on filtered states!
  const totalRegistros = filteredAbsenteismo.length;

  const totalDiasPerdidos = useMemo(() => {
    return Math.round(filteredAbsenteismo.reduce((acc, curr) => acc + parseDurationToDays(curr.duracao), 0));
  }, [filteredAbsenteismo]);

  const criticalSetor = useMemo(() => {
    if (filteredAbsenteismo.length === 0) return '-';
    const sectors: Record<string, number> = {};
    filteredAbsenteismo.forEach(item => {
      const d = parseDurationToDays(item.duracao);
      sectors[item.setor] = (sectors[item.setor] || 0) + d;
    });
    const sorted = Object.entries(sectors).sort((a,b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : '-';
  }, [filteredAbsenteismo]);

  const predominantCid = useMemo(() => {
    if (filteredAbsenteismo.length === 0) return '-';
    const cids: Record<string, number> = {};
    filteredAbsenteismo.forEach(item => {
      const c = item.cid.toUpperCase();
      cids[c] = (cids[c] || 0) + 1;
    });
    const sorted = Object.entries(cids).sort((a,b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : '-';
  }, [filteredAbsenteismo]);

  // 6. Reactive calculations for Recharts visualizations matching Gas scripts
  const chartSectorData = useMemo(() => {
    const sectors: Record<string, number> = {};
    filteredAbsenteismo.forEach(item => {
      const d = parseDurationToDays(item.duracao);
      sectors[item.setor] = (sectors[item.setor] || 0) + d;
    });
    return Object.entries(sectors)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 5);
  }, [filteredAbsenteismo]);

  const chartTurnoData = useMemo(() => {
    const turnos: Record<string, number> = {};
    filteredAbsenteismo.forEach(item => {
      const d = parseDurationToDays(item.duracao);
      turnos[item.turno] = (turnos[item.turno] || 0) + d;
    });
    return Object.entries(turnos)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a,b) => b.value - a.value);
  }, [filteredAbsenteismo]);

  const chartCidData = useMemo(() => {
    const cids: Record<string, number> = {};
    filteredAbsenteismo.forEach(item => {
      const c = item.cid.toUpperCase();
      cids[c] = (cids[c] || 0) + 1; // Count volume
    });
    return Object.entries(cids)
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 5);
  }, [filteredAbsenteismo]);

  const chartTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    filteredAbsenteismo.forEach(item => {
      types[item.tipo] = (types[item.tipo] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [filteredAbsenteismo]);

  const COLORS_DOUGHNUT = ['#ef4444', '#f59e0b', '#0284c7', '#10b981', '#64748b'];

  // Handle auto complete of Employee detail in Form (corresponds to autoPreencherColabAbs in JS.html)
  const handleNomeSelectChange = (nome: string) => {
    setColaboradorNome(nome);
    const targetColab = colaboradores.find(c => c.nome === nome);
    if (targetColab) {
      setMatricula(targetColab.matricula);
      setSetorForm(targetColab.setor);
      setTurnoForm(targetColab.equipe);
    } else {
      setMatricula('');
      setSetorForm('');
      setTurnoForm('');
    }
  };

  const handleSaveAbs = (e: React.FormEvent) => {
    e.preventDefault();

    if (!colaboradorNome || !inicio || !duracaoNum) {
      alert("Por favor, preencha todos os campos obrigatórios do lançamento.");
      return;
    }

    if (modalMode === 'edit') {
      const updatedList = absenteismo.map(a => {
        if (a.id === editingId) {
          return {
            ...a,
            tipo,
            colaborador: colaboradorNome,
            matricula,
            setor: setorForm,
            cargo: colaboradores.find(c => c.nome === colaboradorNome)?.cargo || a.cargo || "Outros",
            turno: turnoForm,
            inicio,
            duracao: `${duracaoNum} Dias`,
            termino: calculatedFim,
            retorno: calculatedFim,
            cid: cid.toUpperCase().trim(),
            patologia: patologia.trim() || a.patologia || "Diagonóstico consolidado"
          };
        }
        return a;
      });
      onUpdateAbsenteismo(updatedList);
      setIsOpenModal(false);
      // Reset Form
      setColaboradorNome('');
      setMatricula('');
      setCid('');
      setPatologia('');
      setInicio('');
      setEditingId('');
    } else {
      const novosDados: Absenteismo = {
        id: 'ABS-' + new Date().getTime().toString().slice(-4),
        tipo,
        colaborador: colaboradorNome,
        matricula,
        setor: setorForm,
        cargo: colaboradores.find(c => c.nome === colaboradorNome)?.cargo || "Outros",
        turno: turnoForm,
        inicio,
        duracao: `${duracaoNum} Dias`,
        termino: calculatedFim,
        retorno: calculatedFim,
        cid: cid.toUpperCase().trim(),
        patologia: patologia.trim() || "Diagonóstico consolidado"
      };

      onUpdateAbsenteismo([novosDados, ...absenteismo]);
      setIsOpenModal(false);

      // Reset Form
      setColaboradorNome('');
      setMatricula('');
      setCid('');
      setPatologia('');
      setInicio('');
    }
  };

  const handleOpenEditModal = (item: Absenteismo) => {
    setModalMode('edit');
    setEditingId(item.id);
    setColaboradorNome(item.colaborador);
    setMatricula(item.matricula);
    setTipo(item.tipo);
    setInicio(item.inicio);
    const parsedDur = parseInt(item.duracao, 10);
    setDuracaoNum(isNaN(parsedDur) ? 1 : parsedDur);
    setCid(item.cid);
    setPatologia(item.patologia);
    setSetorForm(item.setor);
    setTurnoForm(item.turno);
    setIsOpenModal(true);
  };

  const handleDeleteAbs = (id: string, name: string) => {
    if (confirm(`Deseja remover as faltas no prontuário de ${name} (Lançamento #${id})?`)) {
      onUpdateAbsenteismo(absenteismo.filter(a => a.id !== id));
    }
  };

  const handleProcessAbsenteismoImport = () => {
    if (!importText.trim()) {
      setImportError('Por favor, cole algum conteúdo.');
      return;
    }

    try {
      const lines = importText.trim().split('\n');
      const novos: Absenteismo[] = [];
      let skippedHeader = false;

      const parseDate = (dStr: string) => {
        if (!dStr) return '';
        const parts = dStr.trim().split('/');
        if (parts.length !== 3) return '';
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      };

      lines.forEach((line, idx) => {
        let parts = line.split('\t');
        if (parts.length < 2) parts = line.split(';');
        if (parts.length < 2) parts = line.split(',');

        if (parts.length < 5) return;

        const rawFirstCell = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!skippedHeader && (rawFirstCell.includes('matricula') || rawFirstCell.includes('nome') || rawFirstCell.includes('trabalhador') || rawFirstCell.includes('cargo') || rawFirstCell.includes('setor'))) {
          skippedHeader = true;
          return;
        }

        const matricula = parts[0]?.trim();
        const nome = parts[1]?.trim();
        const setor = parts[2]?.trim() || '';
        const cargo = parts[3]?.trim() || '';
        const turno = parts[4]?.trim() || '';
        const dataAtestadoRaw = parts[5]?.trim() || '';
        const diasAtestado = parts[6]?.trim() || '1';
        const dataTerminoRaw = parts[7]?.trim() || '';
        const cid = parts[8]?.trim() || 'Não informado';

        if (!nome) return;

        const inicio = parseDate(dataAtestadoRaw) || new Date().toISOString().split('T')[0];
        const termino = parseDate(dataTerminoRaw) || inicio;

        let patologia = "Patologia associada ao CID " + cid;
        const cidNormalizer = cid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (CID_NATIVO[cidNormalizer]) {
          patologia = CID_NATIVO[cidNormalizer];
        } else if (cidNormalizer.startsWith('M54')) {
          patologia = "Lombalgia / Dorsalgia (dor nas costas)";
        } else if (cidNormalizer.startsWith('A09')) {
          patologia = "Gastroenterite e diarreia aguda";
        } else if (cidNormalizer.startsWith('F41')) {
          patologia = "Transtorno de ansiedade generalizada (Estresse)";
        }

        novos.push({
          id: 'ABS-IMP-' + (1000 + idx) + '-' + new Date().getTime().toString().slice(-4),
          tipo: 'Atestado',
          colaborador: nome,
          matricula: matricula === '0' || !matricula ? 'SEM-' + Math.floor(Math.random() * 100000) : matricula,
          setor,
          cargo,
          turno,
          inicio,
          duracao: diasAtestado === '1' ? '1 Dia' : `${diasAtestado} Dias`,
          termino,
          retorno: termino,
          cid,
          patologia
        });
      });

      if (novos.length === 0) {
        setImportError('Nenhum dado válido pôde ser processado. Verifique o cabeçalho e separadores.');
        return;
      }

      onUpdateAbsenteismo([...novos, ...absenteismo]);
      setIsOpenImportModal(false);
      setImportText('');
      setImportError('');
      alert(`Sucesso! ${novos.length} registros de absenteísmo importados.`);
    } catch (err: any) {
      setImportError('Erro ao parsear dados: ' + err.message);
    }
  };

  // Helper dictionary lookup to display full diagnostics inline
  const getCidRealValue = (cid: string) => {
    const uppercase = cid.toUpperCase().trim();
    return CID_NATIVO[uppercase] || 'CID Código';
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Page Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">Painel de Absenteísmo e Atestados</h2>
          <p className="text-sm text-slate-500 font-medium">Lançamento de Licenças Médicas, Rastreabilidade CID-10 e Diagnósticos Estatísticos</p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          {usuarioLogado?.email?.toLowerCase() === 'enfmichelmilk@gmail.com' && (
            <button
              onClick={() => setIsOpenImportModal(true)}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-sm shadow-sm flex items-center gap-2 transition duration-150 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>Importar Lista (Excel)</span>
            </button>
          )}
          <button
            onClick={() => {
              setModalMode('create');
              setEditingId('');
              setColaboradorNome('');
              setMatricula('');
              setCid('');
              setPatologia('');
              setInicio('');
              setTipo('Atestado');
              setIsOpenModal(true);
              if (colaboradores.length > 0) handleNomeSelectChange(colaboradores[0].nome);
            }}
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-5 rounded-xl text-sm shadow-md shadow-sky-600/10 flex items-center gap-2 transition duration-150 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Lançar Afastamento</span>
          </button>
        </div>
      </div>

      {/* FILTER ACCORDION ACTIONS PANEL FROM WEB UI */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 items-end relative">
        <div className="w-full lg:flex-1 space-y-1">
          <label className="text-xs font-bold text-slate-500 block">Pesquisa Geral</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtro rápido por Colaborador, Matrícula ou CID..."
              className="w-full py-2 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 text-slate-700 focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-medium"
            />
          </div>
        </div>

        {/* Dynamic Month Checklist Toggle */}
        <div className="w-full sm:w-1/3 lg:w-48 space-y-1 relative">
          <label className="text-xs font-bold text-slate-500 block">Mês Histórico</label>
          <div 
            onClick={() => setOpenDropdown(openDropdown === 'mes' ? null : 'mes')}
            className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-semibold cursor-pointer flex justify-between items-center"
          >
            <span>{selectedMeses.length > 0 ? `${selectedMeses.length} Meses` : "Todos"}</span>
            <span className="pointer-events-none">&bull;&bull;&bull;</span>
          </div>

          {openDropdown === 'mes' && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 p-3 mt-1.5 rounded-xl shadow-xl space-y-2 z-20 max-h-48 overflow-y-auto animate-fadeIn">
              {availableMonths.map(m => (
                <label key={m.ym} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-slate-50 rounded">
                  <input
                    type="checkbox"
                    checked={selectedMeses.includes(m.ym)}
                    onChange={() => toggleCheckbox(selectedMeses, setSelectedMeses, m.ym)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-700 font-semibold leading-none">{m.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Turno Checklist Toggle */}
        <div className="w-full sm:w-1/3 lg:w-44 space-y-1 relative">
          <label className="text-xs font-bold text-slate-500 block">Turno / Escala</label>
          <div 
            onClick={() => setOpenDropdown(openDropdown === 'turno' ? null : 'turno')}
            className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-semibold cursor-pointer flex justify-between items-center"
          >
            <span>{selectedTurnos.length > 0 ? `${selectedTurnos.length} Especial` : "Todos"}</span>
            <span className="pointer-events-none">&bull;&bull;&bull;</span>
          </div>

          {openDropdown === 'turno' && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 p-3 mt-1.5 rounded-xl shadow-xl space-y-2 z-20 animate-fadeIn">
              {EQUIPES_ESCALA.map(eq => (
                <label key={eq} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-slate-50 rounded">
                  <input
                    type="checkbox"
                    checked={selectedTurnos.includes(eq)}
                    onChange={() => toggleCheckbox(selectedTurnos, setSelectedTurnos, eq)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-700 font-semibold leading-none">{eq}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Setor Checklist Toggle */}
        <div className="w-full sm:w-1/3 lg:w-52 space-y-1 relative">
          <label className="text-xs font-bold text-slate-500 block">Setor Hospitalar</label>
          <div 
            onClick={() => setOpenDropdown(openDropdown === 'setor' ? null : 'setor')}
            className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-semibold cursor-pointer flex justify-between items-center"
          >
            <span>{selectedSetores.length > 0 ? `${selectedSetores.length} Unidades` : "Todos"}</span>
            <span className="pointer-events-none">&bull;&bull;&bull;</span>
          </div>

          {openDropdown === 'setor' && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 p-3 mt-1.5 rounded-xl shadow-xl space-y-2 z-20 max-h-48 overflow-y-auto animate-fadeIn col-span-2">
              {SETORES_HOSPITALARES.map(st => (
                <label key={st} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-slate-50 rounded">
                  <input
                    type="checkbox"
                    checked={selectedSetores.includes(st)}
                    onChange={() => toggleCheckbox(selectedSetores, setSelectedSetores, st)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-700 font-semibold leading-none">{st}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {(searchTerm !== '' || selectedMeses.length > 0 || selectedTurnos.length > 0 || selectedSetores.length > 0) && (
          <button
            onClick={() => { setSearchTerm(''); setSelectedMeses([]); setSelectedTurnos([]); setSelectedSetores([]); }}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-505 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            Limpar
          </button>
        )}
      </div>

      {/* DASHBOARD MODULE INTEGRATION - CONSTRUCTED ANALYTICALLY REACTIVE TO ACTIVE FILTER */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block mb-1">Total Registros</span>
          <span className="text-xl font-extrabold text-slate-800 font-mono block leading-none">{totalRegistros}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block mb-1">Impacto (Dias Perdidos)</span>
          <span className="text-xl font-extrabold text-sky-700 font-mono block leading-none">{totalDiasPerdidos} d</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center overflow-hidden">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block mb-1">Unidade Mais Crítica</span>
          <span className="text-sm font-extrabold text-red-600 block leading-tight truncate px-1" title={criticalSetor}>{criticalSetor}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center" title={predominantCid !== '-' ? getCidRealValue(predominantCid) : "Sem dados"}>
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block mb-1">CID Predominante</span>
          <span className="text-xl font-mono font-extrabold text-amber-600 block leading-none">{predominantCid}</span>
        </div>

      </div>

      {/* DYNAMIC REACTIVE CHARTS GRID - USING NATIVE RECHARTS ELEMENTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Sector dias lost Chart */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Impacto (Dias) por Unidade Hospitalar</h4>
          <div className="h-44">
            {chartSectorData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSectorData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="value" fill="#0284c7" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">Sem dados para plotar</div>
            )}
          </div>
        </div>

        {/* Turnos dias lost Chart */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm font-sans">
          <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Impacto (Dias) por Especialidades de Turno</h4>
          <div className="h-44">
            {chartTurnoData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartTurnoData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">Sem dados para plotar</div>
            )}
          </div>
        </div>

        {/* CID Frequency Chart */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm font-sans">
          <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">Top CIDs mais Recorrentes (Volume Ocorrências)</h4>
          <div className="h-44">
            {chartCidData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartCidData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="value" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">Sem dados para plotar</div>
            )}
          </div>
        </div>

        {/* Classification Share (Doughnut) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <h4 className="text-xs font-bold text-slate-700 mb-1 border-b border-slate-100 pb-2">Volume por Classificação (Atestado vs Licença)</h4>
          <div className="h-32 flex items-center justify-center relative">
            {chartTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {chartTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS_DOUGHNUT[index % COLORS_DOUGHNUT.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 text-xs font-mono">Sem dados para plotar</div>
            )}
          </div>
          
          <div className="flex justify-center gap-4 text-[10px] text-slate-500 font-bold max-w-full truncate overflow-ellipsis">
            {chartTypeData.map((entry, idx) => (
              <div key={entry.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS_DOUGHNUT[idx % COLORS_DOUGHNUT.length] }}></span>
                <span>{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main logs table list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wide">Linha de Lançamentos de Atendimento (Histórico Ativo)</span>
          <span className="text-xs font-bold text-slate-400 bg-white border px-2 py-0.5 rounded-lg">Mostrando {filteredAbsenteismo.length} logs</span>
        </div>

        {filteredAbsenteismo.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                  <th className="py-3 px-4">Lançamento / Tipo</th>
                  <th className="py-3 px-4">Nome Profissional (Matrícula)</th>
                  <th className="py-3 px-4">Data Início</th>
                  <th className="py-3 px-4">Quantidade / Dias</th>
                  <th className="py-3 px-4">Código CID-10 (Patologia)</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredAbsenteismo.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded ${
                          item.tipo === 'Atestado' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {item.tipo}
                        </span>
                        <span className="block font-mono text-[10px] text-slate-400">#${item.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <span className="font-extrabold text-sm text-slate-800 block leading-none">{item.colaborador}</span>
                        <span className="text-[10px] text-slate-400 block font-semibold">{item.setor} &bull; Matrícula {item.matricula}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono font-bold">
                      {item.inicio.split('-').reverse().join('/')}
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-extrabold">
                      {item.duracao}
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <span className="font-mono text-xs font-extrabold text-slate-900 bg-slate-100 py-0.5 px-2 rounded border">
                          {item.cid}
                        </span>
                        <span className="text-[10px] block text-slate-400 truncate max-w-[200px]" title={item.patologia}>
                          {item.patologia}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-1.5 justify-end items-center">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="p-2 text-sky-600 hover:bg-sky-50 border border-sky-100 rounded-lg transition-all cursor-pointer"
                          title="Editar Afastamento"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAbs(item.id, item.colaborador)}
                          className="p-2 text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 rounded-lg transition-all cursor-pointer"
                          title="Remover Afastamento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-slate-400 text-xs">
            Nenhum laudo ou justificativa de falta foi localizado neste grupo de filtros.
          </div>
        )}
      </div>

      {/* LAUNCHING INTERACTIVE ABSENTEÍSMO MODAL OVERLAY */}
      {isOpenModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-extrabold text-sky-800 uppercase tracking-tight">
                  {modalMode === 'edit' ? 'Editar Afastamento / Atestado' : 'Lançar Afastamento / Atestado'}
                </h3>
              </div>
              <button
                onClick={() => setIsOpenModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAbs} className="p-6 space-y-4 text-xs font-sans">
              
              <div className="space-y-1">
                <label className="font-bold text-slate-600">Colaborador</label>
                <SearchableColaboradorSelect
                  colaboradores={colaboradores}
                  selectedMatricula={matricula}
                  onSelect={(colab) => {
                    if (colab) {
                      handleNomeSelectChange(colab.nome);
                    } else {
                      handleNomeSelectChange('');
                    }
                  }}
                  required={true}
                  placeholder="Selecione o colaborador..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Matrícula</label>
                  <input
                    type="text"
                    value={matricula}
                    className="w-full p-2 border border-slate-200 bg-slate-100 text-slate-500 rounded-lg font-mono font-bold"
                    readOnly
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Tipo de Afastamento</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as any)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  >
                    <option value="Atestado">Atestado</option>
                    <option value="Licença / Outros">Licença / Outros</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">
                    {tipo === 'Atestado' ? 'Início Afastamento (Data)' : 'Início / Data Entrada'}
                  </label>
                  <input
                    type="date"
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Quantidade (Dias de afastamento)</label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={duracaoNum}
                    onChange={(e) => setDuracaoNum(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1 bg-sky-55/40 p-2.5 rounded-lg border-2 border-dashed border-sky-100">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Retorno / Fim Estimado</span>
                <span className="text-sm font-extrabold text-sky-850 font-mono">
                  {calculatedFim ? `${calculatedFim.split('-').reverse().join('/')}` : 'Preencher início e dias'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 items-end">
                <div className="col-span-1 space-y-1">
                  <label className="font-bold text-slate-600 block">CID-10</label>
                  <input
                    type="text"
                    value={cid}
                    onChange={(e) => setCid(e.target.value)}
                    onBlur={(e) => handleCidBlur(e.target.value)}
                    placeholder="Ex: A09"
                    className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-extrabold uppercase"
                    required
                  />
                </div>
                
                <div className="col-span-3 space-y-1">
                  <label className="font-bold text-slate-600">Patologia Diagnóstico</label>
                  <input
                    type="text"
                    value={patologia}
                    onChange={(e) => setPatologia(e.target.value)}
                    placeholder="Auto-preenchido pelo CID ou preenchimento livre"
                    className="w-full p-2 border border-slate-200 bg-slate-50 text-slate-700 rounded-lg font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  className="bg-white border text-slate-700 py-2 px-4 rounded-lg font-bold hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-700 font-bold text-white py-2 px-5 rounded-lg shadow-md hover:shadow-lg transition flex items-center gap-1 cursor-pointer"
                >
                  {modalMode === 'edit' ? 'Salvar Alterações' : 'Confirmar Lançamento'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal de Importação TSV/Excel de Absenteísmo */}
      {isOpenImportModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn font-sans">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-sky-600 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <FileText className="w-6 h-6" />
                <div>
                  <h3 className="font-extrabold text-base">Importar Absenteísmo do Excel</h3>
                  <p className="text-xs text-sky-100">Cole as linhas da sua tabela</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsOpenImportModal(false); setImportText(''); setImportError(''); }} 
                className="hover:bg-sky-750 p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-sky-50 p-4 rounded-xl border border-sky-100 text-[11px] text-sky-800 space-y-1">
                <p className="font-bold">Instruções:</p>
                <p>1. No Excel, copie as linhas da sua lista de atestados médicos (Matrícula, Nome, Setor, Cargo, Turno, Data do Atestado, Dias, Data do Fim, CID, etc).</p>
                <p>2. Cole o conteúdo copiado na área abaixo e clique em <span className="font-semibold">Processar e Importar</span>.</p>
                <p className="font-semibold mt-2">Formato recomendado das colunas (separados por Tab):</p>
                <p className="font-mono bg-white/60 p-1.5 rounded border border-sky-200 text-[9px] overflow-x-auto whitespace-nowrap">
                  Matricula | Nome do Trabalhador | Setor | Cargo | Turno | Data Atestado (DD/MM/AAAA) | Dias Atestado | Data Término | CID 10
                </p>
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Cole o cabeçalho e as linhas de justificativas aqui..."
                className="w-full h-64 p-3 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none resize-none bg-slate-50 focus:bg-white"
              />

              {importError && (
                <p className="text-xs text-rose-600 font-bold">{importError}</p>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3 p-5">
              <button
                onClick={() => { setIsOpenImportModal(false); setImportText(''); setImportError(''); }}
                className="px-4 py-2 border border-slate-300 text-slate-755 font-bold rounded-xl text-xs hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessAbsenteismoImport}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-md shadow-sky-600/10 transition"
              >
                Processar e Importar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
