/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { 
  Users, Stethoscope, AlertTriangle, UserCheck, 
  CalendarClock, TrendingUp, Hospital, Building2, Palmtree 
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Colaborador, Absenteismo, Ferias } from '../types';
import { CID_NATIVO } from '../data/mockData';

interface DashboardViewProps {
  colaboradores: Colaborador[];
  absenteismo: Absenteismo[];
  onNavigate: (view: string) => void;
  dynamicSelos?: string[];
  ferias?: Ferias[];
}

export default function DashboardView({ 
  colaboradores, 
  absenteismo, 
  onNavigate,
  dynamicSelos = [],
  ferias = []
}: DashboardViewProps) {
  
  // 1. KPI Helpers
  const totalActivos = colaboradores.length;
  
  const totalInss = useMemo(() => {
    return colaboradores.filter(c => c.inss_check === 'Sim').length;
  }, [colaboradores]);

  const totalAtestados = absenteismo.length;

  // Calculate lost days correctly
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

  const totalDiasPerdidos = useMemo(() => {
    return Math.round(absenteismo.reduce((acc, current) => acc + parseDurationToDays(current.duracao), 0));
  }, [absenteismo]);

  // Special committees and commissions counts
  const totalEtica = useMemo(() => {
    return colaboradores.filter(c => c.selo_etica === 'Sim' || c.selos_adicionais?.includes('Comissão de Ética')).length;
  }, [colaboradores]);

  const totalBrigada = useMemo(() => {
    return colaboradores.filter(c => c.selo_brigadista === 'Sim' || c.selos_adicionais?.includes('Brigadista') || c.selos_adicionais?.includes('Brigadistas Emergência')).length;
  }, [colaboradores]);

  const totalCipa = useMemo(() => {
    return colaboradores.filter(c => c.selo_cipa === 'Sim' || c.selos_adicionais?.includes('CIPA') || c.selos_adicionais?.includes('Membros da CIPA')).length;
  }, [colaboradores]);

  // Active vacations tracker indicator
  const totalFeriasAtivas = useMemo(() => {
    if (!ferias || ferias.length === 0) return 0;
    const hoje = new Date().toISOString().split('T')[0];
    return ferias.filter(f => f.status === 'Aprovado' && hoje >= f.dataInicio && hoje <= f.dataFim).length;
  }, [ferias]);

  // Render any custom dynamic seals
  const dynamicSeloCards = useMemo(() => {
    if (!dynamicSelos || dynamicSelos.length === 0) return null;
    return dynamicSelos.map(selo => {
      const count = colaboradores.filter(c => c.selos_adicionais?.includes(selo)).length;
      const initials = selo.substring(0, 3).toUpperCase();
      return (
        <div key={`ds-card-${selo}`} className="bg-white p-4 rounded-xl border border-sky-100 shadow-xs flex items-center gap-3.5 hover:border-sky-200 transition">
          <div className="w-10 h-10 bg-sky-50 text-sky-650 rounded-lg flex items-center justify-center shrink-0">
            <span className="font-extrabold text-xs font-sans text-sky-650">{initials}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider truncate max-w-[130px]" title={selo}>{selo}</span>
            <span className="text-lg font-black text-sky-950">{count} <span className="text-[10px] font-bold text-sky-700 font-sans">Membro{count !== 1 ? 's' : ''}</span></span>
            <span className="text-[9px] text-slate-450 font-semibold block uppercase font-sans">Selo Dinâmico</span>
          </div>
        </div>
      );
    });
  }, [dynamicSelos, colaboradores]);

  // Turnover tracking via termination date
  const totalDesligamentos = useMemo(() => {
    return colaboradores.filter(c => c.datarecisao && c.datarecisao !== '').length;
  }, [colaboradores]);

  const indiceDesligamento = useMemo(() => {
    if (totalActivos === 0) return '0%';
    const pct = (totalDesligamentos / totalActivos) * 100;
    return `${pct.toFixed(1)}%`;
  }, [totalDesligamentos, totalActivos]);

  // Grouped sector balances for Bank of Hours, Folga Feriado and other leave days
  const sectorBalances = useMemo(() => {
    const sectors: Record<string, { bh: number, ff: number, outras: number }> = {};
    colaboradores.forEach(c => {
      const s = c.setor || "Sem Setor";
      if (!sectors[s]) {
        sectors[s] = { bh: 0, ff: 0, outras: 0 };
      }
      sectors[s].bh += c.bancohoras || 0;
      sectors[s].ff += c.folgaferiado || 0;
      sectors[s].outras += (c.folgaenf || 0) + (c.brigada || 0) + (c.eleicao || 0);
    });

    return Object.entries(sectors).map(([name, data]) => ({
      name,
      bh: Math.round(data.bh),
      ff: Math.round(data.ff),
      outras: Math.round(data.outras)
    })).sort((a,b) => b.bh - a.bh);
  }, [colaboradores]);

  // 2. Automated Experience/Onboarding alerts (simulates the background GAS triggers)
  const experienceAlerts = useMemo(() => {
    const alerts: Array<{ colab: Colaborador; dias: number; dataVencimento: string }> = [];
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    colaboradores.forEach(c => {
      if (!c.datainicio) return;
      const partes = c.datainicio.split('-');
      if (partes.length !== 3) return;
      const dtAdmissao = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
      dtAdmissao.setHours(0, 0, 0, 0);

      const difTempo = Math.abs(hoje.getTime() - dtAdmissao.getTime());
      const difDias = Math.floor(difTempo / (1000 * 3600 * 24));

      // Let's bring up notifications for close matching rules (30, 60, 90 days +/- 10 days for nice simulator display)
      const targetDays = [30, 60, 90];
      const matchedTarget = targetDays.find(t => Math.abs(difDias - t) < 15);
      
      if (matchedTarget) {
        alerts.push({
          colab: c,
          dias: matchedTarget,
          dataVencimento: `${partes[2]}/${partes[1]}/${partes[0]}`
        });
      }
    });

    return alerts.slice(0, 4); // Limit to 4 alerts
  }, [colaboradores]);

  // 2.5. Automated COREN expiration alerts (expired or expiring in next 30 days)
  const corenAlerts = useMemo(() => {
    const alerts: Array<{ colab: Colaborador; status: 'vencido' | 'expirando'; diasRestantes: number; validadeFormatada: string }> = [];
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    colaboradores.forEach(c => {
      if (!c.validade_carteira) return;
      const partes = c.validade_carteira.split('-');
      if (partes.length !== 3) return;
      const dtValidade = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
      dtValidade.setHours(0, 0, 0, 0);

      const difTempo = dtValidade.getTime() - hoje.getTime();
      const difDias = Math.ceil(difTempo / (1000 * 3600 * 24));

      const validadeFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;

      if (difDias < 0) {
        alerts.push({
          colab: c,
          status: 'vencido',
          diasRestantes: difDias,
          validadeFormatada
        });
      } else if (difDias <= 30) {
        alerts.push({
          colab: c,
          status: 'expirando',
          diasRestantes: difDias,
          validadeFormatada
        });
      }
    });

    return alerts.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'vencido' ? -1 : 1;
      }
      return a.diasRestantes - b.diasRestantes;
    });
  }, [colaboradores]);

  // 3. Recharts chart preparation
  // a. Lost days by department
  const chartSectorData = useMemo(() => {
    const sectors: Record<string, number> = {};
    absenteismo.forEach(item => {
      const d = parseDurationToDays(item.duracao);
      const s = item.setor || "Não Informado";
      sectors[s] = (sectors[s] || 0) + d;
    });

    return Object.entries(sectors)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 5);
  }, [absenteismo]);

  // b. Classifications (Doughnut)
  const chartTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    absenteismo.forEach(item => {
      const type = item.tipo || "Outros";
      types[type] = (types[type] || 0) + 1; // Count entries as per gas
    });

    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [absenteismo]);

  const COLORS_DOUGHNUT = ['#ef4444', '#f59e0b', '#0284c7', '#10b981', '#64748b'];

  return (
    <div className="space-y-6 font-sans">
      
      {/* Title Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">Painel de Controle</h2>
          <p className="text-sm text-slate-500 font-medium">Hapvida - Hospital Nossa Senhora do Rosário &bull; Visão Geral Integrada de Recursos Humanos Enfermagem</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => onNavigate('colaboradores')} 
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs transition duration-150"
          >
            Fichas Ativas
          </button>
          <button 
            onClick={() => onNavigate('absenteismo')} 
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-md shadow-sky-600/10 transition duration-150"
          >
            Gerenciar Absenteísmo
          </button>
        </div>
      </div>

      {/* Primary KPI Grid: HR & Absenteismo Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Colaboradores</span>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight">{totalActivos}</span>
            <span className="text-[10px] text-teal-600 font-bold block bg-teal-50 px-1 py-0.5 rounded border border-teal-100 inline-block mt-0.5">Ativos</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Afastamentos INSS</span>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight">{totalInss}</span>
            <span className="text-[10px] text-indigo-600 font-bold block bg-indigo-55 px-1 py-0.5 rounded border border-indigo-100 inline-block mt-0.5">Licença Ativa</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="w-12 h-12 bg-pink-50 text-pink-650 rounded-xl flex items-center justify-center shrink-0">
            <Palmtree className="w-6 h-6 text-pink-600" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Colaboradores de Férias</span>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight text-pink-700">{totalFeriasAtivas} <span className="text-xs text-slate-450 font-bold">Ativa(s)</span></span>
            <button 
              onClick={() => onNavigate('ferias')} 
              className="text-[9px] text-pink-600 hover:text-pink-700 font-extrabold block bg-pink-50 px-1.5 py-0.5 rounded border border-pink-100 mt-0.5 transition cursor-pointer"
            >
              Ver Períodos 🌴
            </button>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Desligamentos (Turnover)</span>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight">{indiceDesligamento}</span>
            <span className="text-[10px] text-rose-600 font-bold block bg-rose-50 px-1 py-0.5 rounded border border-rose-100 inline-block mt-0.5">
              {totalDesligamentos} Saída{totalDesligamentos !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
            <CalendarClock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Dias Perdidos</span>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight">{totalDiasPerdidos} <span className="text-xs text-slate-400 font-bold">Dias</span></span>
            <span className="text-[10px] text-amber-600 font-bold block bg-amber-50 px-1 py-0.5 rounded border border-amber-100 inline-block mt-0.5">Impacto Escalar</span>
          </div>
        </div>

      </div>

      {/* Secondary KPI Grid: Institutional Committees & Commissions */}
      <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        
        <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-xs flex items-center gap-3.5 hover:border-purple-200 transition">
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="font-extrabold text-sm font-sans">Etc</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Comissão de Ética</span>
            <span className="text-lg font-black text-purple-900">{totalEtica} <span className="text-[10px] font-bold text-purple-700 font-sans">Membro{totalEtica !== 1 ? 's' : ''}</span></span>
            <span className="text-[9px] text-purple-600 font-semibold block uppercase">HNSR Comitê Ativo</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-xs flex items-center gap-3.5 hover:border-rose-200 transition">
          <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="font-extrabold text-sm font-sans">Bri</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Brigadistas Emergência</span>
            <span className="text-lg font-black text-rose-900">{totalBrigada} <span className="text-[10px] font-bold text-rose-700 font-sans">Profissiona{totalBrigada !== 1 ? 'is' : 'l'}</span></span>
            <span className="text-[9px] text-rose-600 font-semibold block uppercase">Prevenção Brigada</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs flex items-center gap-3.5 hover:border-emerald-200 transition">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="font-extrabold text-sm font-sans">Cip</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Membros da CIPA</span>
            <span className="text-lg font-black text-emerald-900">{totalCipa} <span className="text-[10px] font-bold text-emerald-700 font-sans">Membro{totalCipa !== 1 ? 's' : ''}</span></span>
            <span className="text-[9px] text-emerald-600 font-semibold block uppercase font-sans">Segurança Trabalho</span>
          </div>
        </div>

        {dynamicSeloCards}

      </div>

      {/* Secondary Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Stats Recharts Column */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-800">Impacto Geográfico do Absenteísmo</h3>
            <p className="text-xs text-slate-400">Total de dias perdidos acumulados por unidade de enfermagem (Top 5 Setores)</p>
          </div>

          <div className="h-64">
            {chartSectorData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSectorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }} />
                  <Bar dataKey="value" fill="#0284c7" radius={[4, 4, 0, 0]}>
                    {chartSectorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#b91c1c' : '#0284c7'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Nenhum dado analítico encontrado para plotagem.
              </div>
            )}
          </div>

          {/* Sub legend */}
          <div className="grid grid-cols-2 xs:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-600">
              <span className="w-2.5 h-2.5 rounded bg-red-700"></span>
              <span>Setor Mais Crítico</span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold text-slate-600">
              <span className="w-2.5 h-2.5 rounded bg-sky-600"></span>
              <span>Setor Monitorado</span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold text-slate-600 col-span-2 xs:col-span-1">
              <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
              <span>Valores em Diárias</span>
            </div>
          </div>
        </div>

        {/* Right Info Panel Panel: Experience Alerts & Classification Pie */}
        <div className="space-y-6">
          
          {/* Classification Share (Doughnut) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800">Classificação de Afastamentos</h3>
              <p className="text-[11px] text-slate-400">Distribuição percentual por volume de laudos</p>
            </div>

            <div className="h-44 flex items-center justify-center relative">
              {chartTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {chartTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS_DOUGHNUT[index % COLORS_DOUGHNUT.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <span className="text-xs text-slate-400">Sem registros</span>
              )}

              {/* Total indicator in center */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Registros</span>
                <span className="text-xl font-extrabold text-slate-800 leading-none">{totalAtestados}</span>
              </div>
            </div>

            {/* Custom Pie Legend */}
            <div className="space-y-1.5 text-xs">
              {chartTypeData.map((item, index) => (
                <div key={item.name} className="flex justify-between items-center text-slate-600 py-0.5 border-b border-dashed border-slate-100 last:border-0 hover:bg-slate-50 px-1 rounded transition">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full block shrink-0" style={{ backgroundColor: COLORS_DOUGHNUT[index % COLORS_DOUGHNUT.length] }}></span>
                    <span className="font-medium text-[11px]">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-800">{item.value} laudo{item.value !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active alerts for supervisors (GAS cron-job simulation) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Alertas de Experiência</h3>
                <p className="text-[11px] text-slate-400">Prazos de avaliação de desempenho (Robô GAS)</p>
              </div>
              <span className="animate-ping w-2 h-2 bg-rose-500 rounded-full shrink-0"></span>
            </div>

            <div className="space-y-3">
              {experienceAlerts.length > 0 ? (
                experienceAlerts.map(alert => (
                  <div key={alert.colab.matricula} className="p-3 bg-amber-50/50 hover:bg-amber-50 border border-amber-100 rounded-xl space-y-2 transition">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-xs text-amber-950 block">{alert.colab.nome}</span>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">{alert.colab.cargo} &bull; {alert.colab.setor}</span>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 font-extrabold px-1.5 py-0.5 rounded">
                        {alert.dias} Dias
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex justify-between items-center pt-1 border-t border-amber-100/60 font-medium">
                      <span>Admissão: <b className="text-slate-800">{alert.dataVencimento}</b></span>
                      <button 
                        onClick={() => {
                          // Quick hack to load colab and open modal by routing
                          onNavigate('colaboradores');
                        }}
                        className="text-amber-800 hover:underline font-bold text-[10px]"
                      >
                        Avaliar Ficha &rarr;
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-center text-xs text-slate-400">
                  Nenhum aviso de experiência pendente hoje.
                </div>
              )}
            </div>
          </div>

          {/* Alertas de COREN (Vencidos e a vencer em 30 dias) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800 animate-pulse">Alertas de COREN</h3>
                <p className="text-[11px] text-slate-400 font-sans">Carteiras vencidas ou com vencimento em 30 dias</p>
              </div>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {corenAlerts.length > 0 ? (
                corenAlerts.map(alert => {
                  const isVencido = alert.status === 'vencido';
                  return (
                    <div 
                      key={alert.colab.matricula} 
                      className={`p-3 border rounded-xl space-y-2.5 transition ${
                        isVencido 
                          ? 'bg-rose-50/40 hover:bg-rose-50 border-rose-100' 
                          : 'bg-amber-50/30 hover:bg-amber-50 border-amber-100/75'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="font-extrabold text-xs text-slate-900 block">{alert.colab.nome}</span>
                          <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                            COREN: {alert.colab.coren || 'Não informado'} &bull; {alert.colab.cargo}
                          </span>
                        </div>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                          isVencido 
                            ? 'bg-rose-100 text-rose-800 border-rose-200' 
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {isVencido ? 'Vencido' : `${alert.diasRestantes} dias`}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-600 flex justify-between items-center pt-2 border-t border-slate-100/80 font-semibold">
                        <span>Validade: <b className="text-slate-800">{alert.validadeFormatada}</b></span>
                        
                        {alert.colab.whatsapp ? (
                          <a
                            href={`https://api.whatsapp.com/send?phone=${
                              alert.colab.whatsapp.replace(/\D/g, '').startsWith('55') 
                                ? alert.colab.whatsapp.replace(/\D/g, '') 
                                : `55${alert.colab.whatsapp.replace(/\D/g, '')}`
                            }&text=${encodeURIComponent(
                              isVencido
                                ? `Olá, ${alert.colab.nome}! Identificamos que a validade da sua carteira do COREN (${alert.validadeFormatada}) consta como vencida no nosso sistema. Solicitamos, por gentileza, o envio de uma foto legível da sua nova carteirinha atualizada para regularizarmos seu cadastro. Atenciosamente, Gestão de Enfermagem.`
                                : `Olá, ${alert.colab.nome}! Identificamos que a sua carteira do COREN vencerá em breve, no dia ${alert.validadeFormatada} (${alert.diasRestantes} dias restantes). Solicitamos, por gentileza, que nos envie a foto da sua nova carteirinha atualizada assim que possível para regularizarmos seu cadastro. Atenciosamente, Gestão de Enfermagem.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold px-2.5 py-1 rounded-lg text-[9px] flex items-center gap-1 transition shadow-xs"
                          >
                            <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24">
                              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.451 5.436 0 9.854-4.394 9.857-9.792.001-2.615-1.012-5.074-2.854-6.92A9.734 9.734 0 0 0 12.01 2.14c-5.438 0-9.854 4.397-9.858 9.793-.001 1.96.512 3.878 1.483 5.578l-.976 3.565 3.656-.959zM17.92 14.76c-.326-.164-1.93-.954-2.227-1.062-.297-.109-.514-.164-.73.164-.216.327-.838 1.062-1.027 1.28-.189.217-.378.244-.704.08-1.558-.779-2.62-1.343-3.666-3.143-.275-.473.275-.439.789-1.464.086-.174.043-.327-.021-.462-.065-.136-.514-1.24-.704-1.697-.185-.445-.37-.383-.514-.39-.133-.006-.285-.007-.438-.007a.84.84 0 0 0-.608.283c-.203.223-.773.755-.773 1.84 0 1.086.79 2.137.9 2.285.11.148 1.554 2.373 3.766 3.328 1.104.476 1.966.654 2.634.786.669.132 1.216.114 1.674.045.51-.077 1.571-.643 1.794-1.264.223-.62.223-1.153.156-1.264-.067-.111-.243-.175-.569-.339z"/>
                            </svg>
                            <span>WhatsApp</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 text-[9px] italic font-normal">Sem WhatsApp</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-center text-xs text-slate-400">
                  Nenhum aviso de COREN vencido ou a vencer em 30 dias.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Setor Balances Panel (BH, FF & Outras Folgas por Setor) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 animate-fadeIn">
        <div>
          <h3 className="text-base font-bold text-slate-800">Saldos de Folgas e Banco de Horas por Setor</h3>
          <p className="text-xs text-slate-500 font-medium font-sans">Consolidação de saldo de Banco de Horas (BH), Folga Feriado (FF) e outras folgas (Enfermagem, Brigada, Eleição) por setor hospitalar</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recharts Bar Chart of Sector Balances */}
          <div className="lg:col-span-2 border border-slate-100 p-4 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-3 uppercase tracking-wider font-sans">Distribuição Analítica por Setor</span>
            <div className="h-64">
              {sectorBalances.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorBalances} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    <Bar dataKey="bh" name="Saldo BH (Horas)" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="ff" name="Saldo FF (Dias)" fill="#ea580c" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="outras" name="Outras Folgas (Dias)" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs">Sem dados de saldos.</div>
              )}
            </div>
          </div>

          {/* Breakdown Table/List */}
          <div className="border border-slate-100 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 block mb-3 uppercase tracking-wider font-sans">Resumo Consolidado</span>
            <div className="space-y-2.5 overflow-y-auto max-h-[220px] pr-1">
              {sectorBalances.map(item => (
                <div key={item.name} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:bg-slate-100/50 transition">
                  <span className="font-extrabold text-xs text-slate-800 block truncate" title={item.name}>{item.name}</span>
                  <div className="flex gap-2 flex-wrap mt-1.5 text-[10px] font-sans">
                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-100">
                      BH: <b>{item.bh}h</b>
                    </span>
                    <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-bold border border-orange-100">
                      FF: <b>{item.ff}d</b>
                    </span>
                    <span className="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-bold border border-teal-100">
                      Outras: <b>{item.outras}d</b>
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <span className="text-[10px] text-slate-400 font-semibold block mt-3 leading-tight font-sans">
              💡 Outras folgas contabiliza as folgas específicas de Enfermagem (Folga ENF), folgas por Brigada de Incêndio e por participação em Eleições.
            </span>
          </div>
        </div>
      </div>

      {/* Hospital units overview active panels */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-800">Quadro de Licenças INSS Atuais</h3>
          <p className="text-xs text-slate-500">Colaboradores com afastamento médico ativo gerenciados via prontuário</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {colaboradores.filter(c => c.inss_check === 'Sim').length > 0 ? (
            colaboradores.map(c => {
              if (c.inss_check !== 'Sim') return null;
              
              // Calculate days in leave
              let daysActive = -1;
              if (c.inss_entrada) {
                const parts = c.inss_entrada.split('-');
                if (parts.length === 3) {
                  const entryDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                  const difference = Math.abs(new Date().getTime() - entryDate.getTime());
                  daysActive = Math.floor(difference / (1000 * 3600 * 24));
                }
              }

              return (
                <div key={c.matricula} className="border border-red-100 bg-red-50/20 hover:bg-red-50/50 p-4 rounded-xl flex flex-col justify-between gap-3 transition">
                  <div className="space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-extrabold text-xs text-red-950 block">{c.nome}</span>
                      <span className="bg-red-100 text-red-800 border border-red-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                        Afastado
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold block">{c.cargo} &bull; Matrícula {c.matricula}</span>
                    <p className="text-[11px] text-slate-700 italic border-l-2 border-red-200 pl-2 py-0.5">
                      {c.inss_obs || "Sem informações adicionais."}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100/80 flex justify-between items-center text-[10px] text-slate-500">
                    <div>
                      <span>Início: <b>{c.inss_entrada ? c.inss_entrada.split('-').reverse().join('/') : '-'}</b></span>
                      {daysActive >= 0 && <span className="block text-slate-400 shrink-0">Período ativo: <b>{daysActive} dias</b></span>}
                    </div>
                    <div>
                      {c.inss_rep ? (
                        <div className="text-right">
                          <span className="block font-bold text-teal-800">Reposição:</span>
                          <span className="font-semibold block truncate max-w-[120px]" title={c.inss_rep}>{c.inss_rep}</span>
                        </div>
                      ) : (
                        <span className="text-rose-700 font-bold">Sem reposição vaga</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full p-6 text-center bg-slate-50 rounded-xl text-slate-400 text-xs border border-dashed border-slate-200">
              Nenhuma licença INSS ou afastamento crítico registrado atualmente.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
