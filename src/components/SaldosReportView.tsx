/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Calendar, RefreshCw, Search, Layers, AlertCircle, 
  CheckCircle, Save, X, Pencil, ArrowRightLeft, TrendingDown, TrendingUp, Info
} from 'lucide-react';
import { db, saveDocument, removeDocument } from '../lib/firebase';
import { Colaborador, SaldosHistorico, Usuario, SolicitacaoFolga } from '../types';
import { customAlert, customConfirm } from '../utils/customDialog';

interface SaldosReportViewProps {
  colaboradores: Colaborador[];
  saldosHistorico: SaldosHistorico[];
  solicitacoes: SolicitacaoFolga[];
  usuarioLogado?: Usuario;
}

// Unidade Resolver logic according to requirements
const getUnidadeForSector = (setor: string, cargo?: string): 'UTI' | 'Unidade de Internação' | 'PS' | 'Centro Cirúrgico' | 'Gestão' => {
  const norm = (setor || '').toUpperCase().trim();
  
  if (norm.includes('GESTAO') || norm.includes('GESTÃO')) {
    return 'Gestão';
  }
  
  // UTI - Todos os colaboradores da UTI 7º andar e UTI 9º andar
  if (norm.includes('UTI 7') || (norm.includes('7º') && norm.includes('UTI')) || norm.includes('UTI 9') || (norm.includes('9º') && norm.includes('UTI')) || norm.includes('UTI')) {
    if (norm.includes('FOLGUISTA PS') || norm.includes('FOLGUISTA UI')) {
      // guard folguistas
    } else {
      return 'UTI';
    }
  }

  // PS - PSI, PSA e Folguista PS | UTI
  if (norm.includes('PSI') || norm.includes('PSA') || norm.includes('FOLGUISTA PS') || norm.includes('PRONTO SOCORRO')) {
    return 'PS';
  }

  // Centro Cirurgico - Todos os colaboradores do centro cirurgico e CME.
  if (norm.includes('CENTRO') || norm.includes('CIRURGICO') || norm.includes('CIRÚRGICO') || norm.includes('CC') || norm.includes('CME')) {
    return 'Centro Cirúrgico';
  }

  // Unidade de internação - Todos os colaboradores do 2º andar, 3º andar, 4º andar, 5º andar, 6º andar e Folguista UI
  return 'Unidade de Internação';
};

// Standardized Turno Name Resolver
const getTurnoName = (equipeRaw: string): string => {
  const eq = (equipeRaw || '').trim().toLowerCase();
  if (eq.includes('diurno a')) return 'Diurno A';
  if (eq.includes('diurno b')) return 'Diurno B';
  if (eq.includes('noturno a')) return 'Noturno A';
  if (eq.includes('noturno b')) return 'Noturno B';
  if (eq.includes('diarista')) return 'Diarista';
  return 'Outros';
};

// Standardized Sector Name Resolver for grouping
const normalizeSectorName = (setor: string): string => {
  const norm = (setor || '').trim().toUpperCase();
  if (norm.includes('9º') || norm.includes('9O') || norm.includes('UTI 9')) return 'UTI 9º Andar';
  if (norm.includes('7º') || norm.includes('7O') || norm.includes('8º') || norm.includes('8O') || norm.includes('UTI 8') || norm.includes('UTI 7')) return 'UTI 7º Andar';
  if (norm.includes('6º') || norm.includes('6O') || norm.includes('6 ANDAR')) return '6º Andar';
  if (norm.includes('5º') || norm.includes('5O') || norm.includes('5 ANDAR')) return '5º Andar';
  if (norm.includes('4º') || norm.includes('4O') || norm.includes('4 ANDAR')) return '4º Andar';
  if (norm.includes('3º') || norm.includes('3O') || norm.includes('3 ANDAR')) return '3º Andar';
  if (norm.includes('2º') || norm.includes('2O') || norm.includes('2 ANDAR')) return '2º Andar';
  if (norm.includes('FOLGUISTA UI')) return 'Folguista UI';
  if (norm.includes('FOLGUISTA PS') || norm.includes('FOLGUISTA UTI')) return 'Folguista PS | UTI';
  if (norm.includes('PSI') || norm.includes('PRONTO SOCORRO INFANTIL')) return 'PSI';
  if (norm.includes('PSA') || norm.includes('PRONTO SOCORRO ADULTO')) return 'PSA';
  if (norm.includes('CME')) return 'CME';
  if (norm.includes('CENTRO') || norm.includes('CIRURGICO') || norm.includes('CIRÚRGICO') || norm.includes('CC')) return 'Centro Cirúrgico';
  return setor || 'Geral';
};

// Nurse detection for sorting first
const isEnfermeiro = (cargo: string): boolean => {
  const norm = (cargo || '').toUpperCase();
  return norm.includes('ENFERMEIR') || norm.includes('COORDENADOR') || norm.includes('SUPERVISOR') || norm.includes('GESTOR');
};

// Calculates the balances at the end of a given month, correcting for future approved leave requests
const calculateMonthBalance = (
  colab: Colaborador,
  month: string,
  solSols: SolicitacaoFolga[]
) => {
  // Global current balances
  let bancohoras = typeof colab.bancohoras === 'number' ? colab.bancohoras : 0;
  let folgaferiado = typeof colab.folgaferiado === 'number' ? colab.folgaferiado : 0;
  let folgaenf = typeof colab.folgaenf === 'number' ? colab.folgaenf : 0;

  // Add back any approved folgas scheduled in months strictly AFTER the target month
  const approvedFutureSols = (solSols || []).filter(s => 
    s.matricula === colab.matricula && 
    s.status === 'Aprovado' && 
    s.data && s.data.slice(0, 7) > month
  );

  approvedFutureSols.forEach(s => {
    if (s.tipo === 'Banco de Horas') {
      bancohoras += 12;
    } else if (s.tipo === 'Folga Feriado') {
      folgaferiado += 1;
    } else if (s.tipo === 'Folga Enfermagem') {
      folgaenf += 1;
    }
  });

  return {
    bancohoras,
    folgaferiado,
    folgaenf
  };
};

export default function SaldosReportView({ colaboradores, saldosHistorico, solicitacoes, usuarioLogado }: SaldosReportViewProps) {
  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-06');
  const [selectedUnidade, setSelectedUnidade] = useState<'PS' | 'Centro Cirúrgico' | 'UTI' | 'Unidade de Internação' | 'Gestão' | 'Geral'>('PS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);

  const handleManualReload = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 300);
  };

  // Edit Modal State
  const [editingRecord, setEditingRecord] = useState<SaldosHistorico | null>(null);
  const [editBhText, setEditBhText] = useState<string>('00:00');
  const [editFf, setEditFf] = useState<number>(0);
  const [editFs, setEditFs] = useState<number>(0);

  // Helper functions for formatting and parsing
  const formatDecimalToHHMM = (decimalHours: number): string => {
    if (decimalHours === 0 || isNaN(decimalHours)) return '00:00';
    const isNegative = decimalHours < 0;
    const absHours = Math.abs(decimalHours);
    const hours = Math.floor(absHours);
    const minutes = Math.round((absHours - hours) * 60);
    const sign = isNegative ? '-' : '+';
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    return `${sign}${formattedHours}:${formattedMinutes}`;
  };

  const formatDeltaBH = (delta: number): string => {
    if (delta === 0 || isNaN(delta)) return '00:00';
    const isNegative = delta < 0;
    const absHours = Math.abs(delta);
    const hours = Math.floor(absHours);
    const minutes = Math.round((absHours - hours) * 60);
    const sign = isNegative ? '-' : '+';
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    return `${sign}${formattedHours}:${formattedMinutes}`;
  };

  const parseExcelNumber = (val: string): number => {
    if (!val) return 0;
    const cleaned = val.trim();
    
    if (cleaned.includes(':')) {
      const isNegative = cleaned.startsWith('-');
      const partClean = cleaned.replace(/[+-]/g, '');
      const parts = partClean.split(':');
      if (parts.length >= 2) {
        const hours = parseFloat(parts[0]) || 0;
        const minutes = parseFloat(parts[1]) || 0;
        const decimalHours = hours + (minutes / 60);
        return isNegative ? -decimalHours : decimalHours;
      }
    }
    
    if (cleaned.toLowerCase().includes('h')) {
      const isNegative = cleaned.startsWith('-');
      const partClean = cleaned.toLowerCase().replace(/[+-]/g, '');
      const parts = partClean.split('h');
      if (parts.length >= 2) {
        const hours = parseFloat(parts[0]) || 0;
        const minutesStr = parts[1].replace(/[^0-9]/g, '');
        const minutes = parseFloat(minutesStr) || 0;
        const decimalHours = hours + (minutes / 60);
        return isNegative ? -decimalHours : decimalHours;
      } else if (parts.length === 1) {
        const hours = parseFloat(parts[0]) || 0;
        return isNegative ? -hours : hours;
      }
    }

    const withDot = cleaned.replace(',', '.');
    const parsed = parseFloat(withDot);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Previous month calculator
  const prevMonth = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    if (!year || !month) return '';
    let prevYear = year;
    let prevMonthNum = month - 1;
    if (prevMonthNum === 0) {
      prevMonthNum = 12;
      prevYear = year - 1;
    }
    return `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`;
  }, [selectedMonth]);

  // Derived database snapshots from reactive prop
  const historicoCurrent = useMemo(() => {
    return saldosHistorico.filter(h => h.mes === selectedMonth);
  }, [saldosHistorico, selectedMonth]);

  const historicoPrev = useMemo(() => {
    return saldosHistorico.filter(h => h.mes === prevMonth);
  }, [saldosHistorico, prevMonth]);

  // Trigger Bulk snapshot capture / update
  const handleCollectSnapshots = async () => {
    const isGeral = selectedUnidade === 'Geral';
    const unitColabs = colaboradores.filter(c => isGeral || getUnidadeForSector(c.setor, c.cargo) === selectedUnidade);
    if (unitColabs.length === 0) {
      customAlert(`Atenção: Nenhum colaborador ativo encontrado na unidade ${selectedUnidade} atualmente.`);
      return;
    }

    const confirmMessage = isGeral
      ? `Deseja gerar o relatório geral de saldos para todas as unidades no mês de ${selectedMonth}? Isto irá salvar as horas e folgas atuais de todos os colaboradores ativos como os dados oficiais deste mês.`
      : `Deseja gerar o relatório de saldos para a unidade ${selectedUnidade} no mês de ${selectedMonth}? Isto irá salvar as horas e folgas atuais dos colaboradores ativos como os dados oficiais deste mês.`;
    const confirmed = await customConfirm(confirmMessage);
    if (!confirmed) return;

    setLoading(true);
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      let savedCount = 0;

      for (const colab of unitColabs) {
        const recordId = `${colab.matricula || ''}_${selectedMonth}`;
        if (!colab.matricula) continue;

        const computed = calculateMonthBalance(colab, selectedMonth, solicitacoes);
        const recordData: SaldosHistorico = {
          id: recordId,
          matricula: colab.matricula,
          nome: colab.nome || '',
          setor: colab.setor || '',
          mes: selectedMonth,
          bancohoras: computed.bancohoras,
          folgaferiado: computed.folgaferiado,
          folgaenf: computed.folgaenf,
          dataAtualizacao: timestamp
        };

        await saveDocument('saldos_historico', recordId, recordData);
        savedCount++;
      }

      customAlert(`Sucesso! Relatório de ${selectedMonth} atualizado para ${savedCount} colaboradores.`);
    } catch (err) {
      console.error('Erro ao gerar snapshot:', err);
      customAlert('Erro ao salvar relatório de saldos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Open Edit Modal for a single snapshot
  const handleStartEdit = (record: SaldosHistorico) => {
    setEditingRecord(record);
    setEditBhText(formatDecimalToHHMM(record.bancohoras));
    setEditFf(record.folgaferiado);
    setEditFs(record.folgaenf);
  };

  // Save manual edit
  const handleSaveEdit = async () => {
    if (!editingRecord) return;

    setLoading(true);
    try {
      const updatedRecord: SaldosHistorico = {
        ...editingRecord,
        bancohoras: parseExcelNumber(editBhText),
        folgaferiado: Number(editFf) || 0,
        folgaenf: Number(editFs) || 0,
        dataAtualizacao: new Date().toISOString().split('T')[0]
      };

      await saveDocument('saldos_historico', editingRecord.id, updatedRecord);
      setEditingRecord(null);
      customAlert('Saldo histórico atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar edição:', err);
      customAlert('Erro ao salvar alterações.');
    } finally {
      setLoading(false);
    }
  };

  // Delete a snapshot
  const handleDeleteSnapshot = async (record: SaldosHistorico) => {
    const confirmed = await customConfirm(`Deseja realmente excluir o registro histórico de ${record.nome} para ${record.mes}?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      await removeDocument('saldos_historico', record.id);
      customAlert('Registro removido com sucesso!');
    } catch (err) {
      console.error(err);
      customAlert('Erro ao excluir registro.');
    } finally {
      setLoading(false);
    }
  };

  // Compile list data
  const reportData = useMemo(() => {
    const matriculasMap = new Map<string, {
      matricula: string;
      nome: string;
      setor: string;
      cargo: string;
      equipe: string;
      current?: SaldosHistorico;
      prev?: SaldosHistorico;
    }>();

    const isGeral = selectedUnidade === 'Geral';

    // 1. Add current snapshot
    historicoCurrent
      .filter(h => isGeral || getUnidadeForSector(h.setor) === selectedUnidade)
      .forEach(h => {
        const active = colaboradores.find(c => c.matricula === h.matricula);
        matriculasMap.set(h.matricula, {
          matricula: h.matricula,
          nome: h.nome,
          setor: h.setor,
          cargo: active?.cargo || 'Técnico de Enfermagem',
          equipe: active?.equipe || 'Outros',
          current: h
        });
      });

    // 2. Add prev snapshot
    historicoPrev
      .filter(h => isGeral || getUnidadeForSector(h.setor) === selectedUnidade)
      .forEach(h => {
        const existing = matriculasMap.get(h.matricula);
        if (existing) {
          existing.prev = h;
        } else {
          const active = colaboradores.find(c => c.matricula === h.matricula);
          matriculasMap.set(h.matricula, {
            matricula: h.matricula,
            nome: h.nome,
            setor: h.setor,
            cargo: active?.cargo || 'Técnico de Enfermagem',
            equipe: active?.equipe || 'Outros',
            prev: h
          });
        }
      });

    // 3. Add active colaboradores from selected Unidade who might not have snapshots yet
    colaboradores
      .filter(c => isGeral || getUnidadeForSector(c.setor, c.cargo) === selectedUnidade)
      .forEach(c => {
        const existing = matriculasMap.get(c.matricula);
        if (!existing) {
          matriculasMap.set(c.matricula, {
            matricula: c.matricula,
            nome: c.nome,
            setor: c.setor,
            cargo: c.cargo,
            equipe: c.equipe
          });
        }
      });

    const list = Array.from(matriculasMap.values());

    // Filter by search term
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      return list.filter(item => 
        item.nome.toLowerCase().includes(term) || 
        item.matricula.toLowerCase().includes(term)
      );
    }

    return list;
  }, [historicoCurrent, historicoPrev, colaboradores, selectedUnidade, searchTerm]);

  // Grouped data: Turno -> Sector -> Sorted Colaboradores
  const groupedReportData = useMemo(() => {
    const groups: Record<string, Record<string, typeof reportData>> = {};

    reportData.forEach(item => {
      const turno = getTurnoName(item.equipe);
      const sector = normalizeSectorName(item.setor);

      if (!groups[turno]) {
        groups[turno] = {};
      }
      if (!groups[turno][sector]) {
        groups[turno][sector] = [];
      }
      groups[turno][sector].push(item);
    });

    // Sort order for Turnos
    const turnoOrder = ['Diurno A', 'Noturno A', 'Diurno B', 'Noturno B', 'Diarista', 'Outros'];
    const activeTurnos = Object.keys(groups).sort((a, b) => {
      const idxA = turnoOrder.indexOf(a);
      const idxB = turnoOrder.indexOf(b);
      const posA = idxA === -1 ? 99 : idxA;
      const posB = idxB === -1 ? 99 : idxB;
      return posA - posB;
    });

    const sortedGroups: Record<string, Record<string, typeof reportData>> = {};

    activeTurnos.forEach(turno => {
      sortedGroups[turno] = {};
      const activeSectors = Object.keys(groups[turno]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      activeSectors.forEach(sector => {
        sortedGroups[turno][sector] = [...groups[turno][sector]].sort((a, b) => {
          const aIsEnf = isEnfermeiro(a.cargo);
          const bIsEnf = isEnfermeiro(b.cargo);
          if (aIsEnf && !bIsEnf) return -1;
          if (!aIsEnf && bIsEnf) return 1;
          return a.nome.localeCompare(b.nome, 'pt-BR');
        });
      });
    });

    return sortedGroups;
  }, [reportData]);

  // Totals for KPIs
  const kpiTotals = useMemo(() => {
    let bhTotal = 0;
    let ffTotal = 0;
    let fsTotal = 0;
    let count = 0;

    reportData.forEach(item => {
      const activeColab = colaboradores.find(c => c.matricula === item.matricula);
      const computedCurrent = activeColab ? calculateMonthBalance(activeColab, selectedMonth, solicitacoes) : null;

      const bhCurrent = item.current ? item.current.bancohoras : (computedCurrent ? computedCurrent.bancohoras : 0);
      const ffCurrent = item.current ? item.current.folgaferiado : (computedCurrent ? computedCurrent.folgaferiado : 0);
      const fsCurrent = item.current ? item.current.folgaenf : (computedCurrent ? computedCurrent.folgaenf : 0);

      bhTotal += bhCurrent;
      ffTotal += ffCurrent;
      fsTotal += fsCurrent;
      count++;
    });

    return { bhTotal, ffTotal, fsTotal, count };
  }, [reportData, colaboradores, solicitacoes, selectedMonth]);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div id="saldos-report-header" className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-3xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Histórico Mensal de Saldos</h1>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Relatório comparativo de banco de horas e folgas por unidade</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mês Selector */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-2xl">
            <Calendar className="w-4 h-4 text-slate-500 ml-2" />
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-700 text-sm focus:outline-none pr-2 cursor-pointer"
            />
          </div>

          <button
            id="saldos-reload-btn"
            onClick={handleManualReload}
            title="Recarregar dados"
            className="p-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sector Selection Tabs & Actions */}
      <div id="saldos-tabs-container" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Unidade Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-2xl w-full md:w-auto">
            {[
              { id: 'PS', label: 'Pronto Socorro (PS)' },
              { id: 'Centro Cirúrgico', label: 'Centro Cirúrgico' },
              { id: 'UTI', label: 'U.T.I.' },
              { id: 'Unidade de Internação', label: 'Unidade de Internação' },
              { id: 'Gestão', label: 'Gestão' },
              { id: 'Geral', label: 'Geral (Todos)' }
            ].map((unid) => (
              <button
                key={unid.id}
                onClick={() => setSelectedUnidade(unid.id as any)}
                className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                  selectedUnidade === unid.id 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-550 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                {unid.label}
              </button>
            ))}
          </div>

          {/* Action to collect balances */}
          <button
            id="saldos-collect-btn"
            onClick={handleCollectSnapshots}
            disabled={loading}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-sm rounded-xl transition-all shadow-md shadow-sky-500/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>Coletar e Salvar Saldos</span>
          </button>
        </div>

        {/* Info card */}
        <div id="saldos-info-card" className="bg-amber-50 border border-amber-200 p-5 rounded-3xl shadow-3xs flex gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-amber-900 text-xs uppercase tracking-wider">Como funciona</h4>
            <p className="text-xs text-amber-800 leading-relaxed mt-1 font-medium">
              Todo dia 10, após atualizar os saldos dos colaboradores ativos, clique em <strong>Coletar e Salvar Saldos</strong>. 
              Isso salvará uma foto fixa dos saldos para o mês atual, que será comparada com o mês anterior para exibir as horas consumidas/descontadas.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div id="saldos-kpi-grid" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-3xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Colaboradores Com Relatório</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-extrabold text-slate-800">{kpiTotals.count}</span>
            <span className="text-xs font-bold text-slate-500">ativos</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-3xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Acumulado Banco de Horas (BH)</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-extrabold text-sky-600 font-mono">{formatDecimalToHHMM(kpiTotals.bhTotal)}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-3xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Acumulado Folga Feriado (FF)</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-extrabold text-emerald-600">{kpiTotals.ffTotal}</span>
            <span className="text-xs font-bold text-slate-500">dias</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-3xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Acumulado Folga Escala (FS)</span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-extrabold text-purple-600">{kpiTotals.fsTotal}</span>
            <span className="text-xs font-bold text-slate-500">dias</span>
          </div>
        </div>
      </div>

      {/* Search & Filter bar */}
      <div id="saldos-search-bar" className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar colaborador por nome ou matrícula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
          />
        </div>

        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
          Exibindo <span className="text-slate-700 font-black">{reportData.length}</span> colaboradores em <span className="text-sky-500 font-black">{selectedUnidade}</span>
        </div>
      </div>

      {/* Grouped Lists */}
      {loading && reportData.length === 0 ? (
        <div id="saldos-loading-state" className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400 bg-white rounded-3xl border border-slate-200/80 shadow-3xs">
          <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
          <span className="text-sm font-bold">Carregando relatórios mensais...</span>
        </div>
      ) : reportData.length === 0 ? (
        <div id="saldos-empty-state" className="p-16 flex flex-col items-center justify-center text-center gap-3 text-slate-400 bg-white rounded-3xl border border-slate-200/80 shadow-3xs">
          <AlertCircle className="w-10 h-10 text-amber-500" />
          <span className="text-base font-extrabold text-slate-700">Nenhum dado localizado</span>
          <p className="text-xs text-slate-500 max-w-md leading-relaxed">
            Não existem registros históricos salvos para a unidade <strong>{selectedUnidade}</strong> em <strong>{selectedMonth}</strong>, e nenhum colaborador correspondente foi encontrado.
          </p>
          <button
            onClick={handleCollectSnapshots}
            className="mt-2 px-4 py-2 bg-sky-100 hover:bg-sky-200 text-sky-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Gerar Relatório com Saldos Atuais agora
          </button>
        </div>
      ) : (
        <div id="saldos-grouped-container" className="space-y-8">
          {Object.entries(groupedReportData).map(([turno, setores]) => (
            <div key={turno} id={`turno-section-${turno.replace(/\s+/g, '-')}`} className="bg-white rounded-3xl border border-slate-200/80 shadow-3xs overflow-hidden">
              {/* Turno Header Banner */}
              <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100/30 border-b border-slate-150 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Turno: {turno}
                  </h3>
                </div>
                <span className="text-[10px] font-black text-slate-500 bg-slate-200/40 px-3 py-1 rounded-full uppercase tracking-wider">
                  {Object.values(setores).reduce((sum, list) => sum + list.length, 0)} Colaboradores
                </span>
              </div>

              <div className="p-6 space-y-8">
                {Object.entries(setores).map(([setor, list]) => (
                  <div key={setor} id={`sector-group-${setor.replace(/\s+/g, '-')}`} className="space-y-3">
                    {/* Sector Sub-header */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-black text-sky-700 bg-sky-50 border border-sky-150 px-3 py-1 rounded-lg uppercase tracking-wider">
                        {setor}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {list.length} {list.length === 1 ? 'colaborador' : 'colaboradores'}
                      </span>
                    </div>

                    {/* Sector Table */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-150/80">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            <th className="py-3 px-4 w-1/4">Colaborador</th>
                            <th className="py-3 px-3">Cargo</th>
                            <th className="py-3 px-3 text-center border-l border-slate-100 bg-sky-50/10 text-sky-750">BH Anterior ({prevMonth})</th>
                            <th className="py-3 px-3 text-center bg-sky-50/20 text-sky-750">Descontado / Alterado</th>
                            <th className="py-3 px-3 text-center bg-sky-50/10 text-sky-750">BH Atual ({selectedMonth})</th>
                            <th className="py-3 px-3 text-center border-l border-slate-100 bg-emerald-50/10 text-emerald-850">FF Anterior</th>
                            <th className="py-3 px-3 text-center bg-emerald-50/20 text-emerald-850">Diferença FF</th>
                            <th className="py-3 px-3 text-center bg-emerald-50/10 text-emerald-850">FF Atual</th>
                            <th className="py-3 px-3 text-center border-l border-slate-100 bg-purple-50/10 text-purple-850">FS Anterior</th>
                            <th className="py-3 px-3 text-center bg-purple-50/20 text-purple-850">Diferença FS</th>
                            <th className="py-3 px-3 text-center bg-purple-50/10 text-purple-850">FS Atual</th>
                            <th className="py-3 px-3 text-center border-l border-slate-100">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {list.map((item) => {
                            const activeColab = colaboradores.find(c => c.matricula === item.matricula);
                            const computedPrev = activeColab ? calculateMonthBalance(activeColab, prevMonth, solicitacoes) : null;
                            const computedCurrent = activeColab ? calculateMonthBalance(activeColab, selectedMonth, solicitacoes) : null;

                            const bhPrev = item.prev ? item.prev.bancohoras : (computedPrev ? computedPrev.bancohoras : 0);
                            const bhCurrent = item.current ? item.current.bancohoras : (computedCurrent ? computedCurrent.bancohoras : 0);
                            const bhDelta = bhCurrent - bhPrev;

                            const ffPrev = item.prev ? item.prev.folgaferiado : (computedPrev ? computedPrev.folgaferiado : 0);
                            const ffCurrent = item.current ? item.current.folgaferiado : (computedCurrent ? computedCurrent.folgaferiado : 0);
                            const ffDelta = ffCurrent - ffPrev;

                            const fsPrev = item.prev ? item.prev.folgaenf : (computedPrev ? computedPrev.folgaenf : 0);
                            const fsCurrent = item.current ? item.current.folgaenf : (computedCurrent ? computedCurrent.folgaenf : 0);
                            const fsDelta = fsCurrent - fsPrev;

                            const hasCurrentRecord = !!item.current;
                            const hasPrevRecord = !!item.prev;
                            const isEnf = isEnfermeiro(item.cargo);

                            return (
                              <tr 
                                key={item.matricula} 
                                className={`hover:bg-slate-50/40 transition-all text-xs ${!hasCurrentRecord ? 'bg-amber-50/10' : ''}`}
                              >
                                {/* Name */}
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-[10px] shrink-0 ${
                                      isEnf ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {item.nome.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-extrabold text-slate-800 block leading-tight truncate">{item.nome}</span>
                                      <span className="text-[9px] text-slate-400 font-mono">Matrícula: {item.matricula}</span>
                                    </div>
                                  </div>
                                </td>

                                {/* Cargo */}
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isEnf 
                                      ? 'bg-sky-50 text-sky-700 border border-sky-150' 
                                      : 'bg-slate-50 text-slate-600 border border-slate-150'
                                  }`}>
                                    {item.cargo}
                                  </span>
                                </td>

                                {/* BH Prev */}
                                <td className="py-3 px-3 text-center border-l border-slate-100 bg-sky-50/5 text-[11px] font-mono text-slate-600">
                                  <span className={hasPrevRecord ? 'font-bold text-slate-800' : 'text-slate-450 italic font-normal'}>
                                    {formatDecimalToHHMM(bhPrev)}
                                  </span>
                                </td>

                                {/* BH Delta */}
                                <td className="py-3 px-3 text-center bg-sky-50/10 text-[11px] font-mono font-bold">
                                  <span className={
                                    bhDelta < 0 ? 'text-red-600 font-extrabold' : 
                                    bhDelta > 0 ? 'text-emerald-600 font-extrabold' : 
                                    'text-slate-400'
                                  }>
                                    {formatDeltaBH(bhDelta)}
                                  </span>
                                </td>

                                {/* BH Current */}
                                <td className="py-3 px-3 text-center bg-sky-50/5 text-[11px] font-mono font-extrabold">
                                  {hasCurrentRecord ? (
                                    <span className={bhCurrent >= 0 ? 'text-emerald-700 font-extrabold' : 'text-red-700 font-extrabold'}>
                                      {formatDecimalToHHMM(bhCurrent)}
                                    </span>
                                  ) : (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className={`${bhCurrent >= 0 ? 'text-emerald-600/70' : 'text-red-600/70'} italic text-[10px] font-medium`}>
                                        {formatDecimalToHHMM(bhCurrent)}
                                      </span>
                                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase scale-90">Pendente</span>
                                    </div>
                                  )}
                                </td>

                                {/* FF Prev */}
                                <td className="py-3 px-3 text-center border-l border-slate-100 bg-emerald-50/5 font-semibold">
                                  <span className={hasPrevRecord ? 'text-slate-800 font-bold' : 'text-slate-450 italic font-normal'}>
                                    {ffPrev}
                                  </span>
                                </td>

                                {/* FF Delta */}
                                <td className="py-3 px-3 text-center bg-emerald-50/15 font-bold">
                                  <span className={
                                    ffDelta < 0 ? 'text-red-600 font-extrabold' : 
                                    ffDelta > 0 ? 'text-emerald-600 font-extrabold' : 
                                    'text-slate-400'
                                  }>
                                    {ffDelta > 0 ? `+${ffDelta}` : ffDelta}
                                  </span>
                                </td>

                                {/* FF Current */}
                                <td className="py-3 px-3 text-center bg-emerald-50/5 font-extrabold text-emerald-800">
                                  {hasCurrentRecord ? (
                                    <span className="text-emerald-850 font-black">{ffCurrent}</span>
                                  ) : (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-emerald-600/70 italic text-[10px] font-medium">{ffCurrent}</span>
                                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase scale-90">Pendente</span>
                                    </div>
                                  )}
                                </td>

                                {/* FS Prev */}
                                <td className="py-3 px-3 text-center border-l border-slate-100 bg-purple-50/5 font-semibold">
                                  <span className={hasPrevRecord ? 'text-slate-800 font-bold' : 'text-slate-450 italic font-normal'}>
                                    {fsPrev}
                                  </span>
                                </td>

                                {/* FS Delta */}
                                <td className="py-3 px-3 text-center bg-purple-50/15 font-bold">
                                  <span className={
                                    fsDelta < 0 ? 'text-red-600 font-extrabold' : 
                                    fsDelta > 0 ? 'text-emerald-600 font-extrabold' : 
                                    'text-slate-400'
                                  }>
                                    {fsDelta > 0 ? `+${fsDelta}` : fsDelta}
                                  </span>
                                </td>

                                {/* FS Current */}
                                <td className="py-3 px-3 text-center bg-purple-50/5 font-extrabold text-purple-800">
                                  {hasCurrentRecord ? (
                                    <span className="text-purple-800 font-black">{fsCurrent}</span>
                                  ) : (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-purple-600/70 italic text-[10px] font-medium">{fsCurrent}</span>
                                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase scale-90">Pendente</span>
                                    </div>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="py-3 px-3 text-center border-l border-slate-100">
                                  {item.current ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => handleStartEdit(item.current!)}
                                        title="Editar registro histórico"
                                        className="p-1 bg-slate-50 border border-slate-200 rounded-lg hover:bg-sky-50 hover:border-sky-300 hover:text-sky-600 transition-all cursor-pointer text-slate-500"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteSnapshot(item.current!)}
                                        title="Excluir do histórico"
                                        className="p-1 bg-slate-50 border border-slate-200 rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all cursor-pointer text-slate-500"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={async () => {
                                        setLoading(true);
                                        try {
                                          const activeColab = colaboradores.find(c => c.matricula === item.matricula);
                                          if (!activeColab) return;
                                          const recordId = `${activeColab.matricula || ''}_${selectedMonth}`;
                                          const computed = calculateMonthBalance(activeColab, selectedMonth, solicitacoes);
                                          const recordData: SaldosHistorico = {
                                            id: recordId,
                                            matricula: activeColab.matricula,
                                            nome: activeColab.nome || '',
                                            setor: activeColab.setor || '',
                                            mes: selectedMonth,
                                            bancohoras: computed.bancohoras,
                                            folgaferiado: computed.folgaferiado,
                                            folgaenf: computed.folgaenf,
                                            dataAtualizacao: new Date().toISOString().split('T')[0]
                                          };
                                          await saveDocument('saldos_historico', recordId, recordData);
                                          customAlert(`Sucesso! Registro de saldos de ${activeColab.nome} foi salvo para ${selectedMonth}.`);
                                        } catch (e) {
                                          console.error(e);
                                        } finally {
                                          setLoading(false);
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-150 rounded-lg text-[9px] font-extrabold transition-all cursor-pointer whitespace-nowrap"
                                    >
                                      Criar Registro
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal Dialog */}
      {editingRecord && (
        <div id="saldos-edit-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-sky-100 text-sky-700 rounded-xl flex items-center justify-center font-bold">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm leading-tight">Editar Registro Histórico</h3>
                  <span className="text-[10px] text-slate-500 font-bold uppercase mt-0.5 block">{editingRecord.nome} • {editingRecord.mes}</span>
                </div>
              </div>
              <button 
                onClick={() => setEditingRecord(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* BH */}
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Banco de Horas (HH:MM)</label>
                <input
                  type="text"
                  value={editBhText}
                  onChange={(e) => setEditBhText(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-mono font-bold text-center text-sm bg-slate-50/50"
                  placeholder="00:00"
                />
              </div>

              {/* FF & FS side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Folga Feriado (Dias)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editFf}
                    onChange={(e) => setEditFf(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-bold text-center text-sm bg-slate-50/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Folga Enfermagem (Dias)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editFs}
                    onChange={(e) => setEditFs(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 font-bold text-center text-sm bg-slate-50/50"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-extrabold rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-sky-500/15 cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
