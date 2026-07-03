/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Stethoscope, Search, Calendar, FolderHeart, CalendarDays,
  PlusCircle, Trash2, TrendingDown, ClipboardList, RefreshCw, X, FileText, Edit, Pencil,
  Upload, Sparkles, MessageCircle, Send, Link, Mail, Check, Layers, AlertCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Absenteismo, Colaborador, Usuario } from '../types';
import SearchableColaboradorSelect from './SearchableColaboradorSelect';
import { CID_NATIVO, SETORES_HOSPITALARES, EQUIPES_ESCALA } from '../data/mockData';
import { customAlert, customConfirm } from '../utils/customDialog';
import { isUserSubordinate } from '../utils/userFilters';

export interface DraftCertificado {
  id: string;
  colaboradorOriginal: string;
  nomeCorrespondente: string;
  matricula: string;
  setor: string;
  cargo: string;
  turno: string;
  inicio: string;
  duracao: number;
  cid: string;
  patologia: string;
  status: 'processando' | 'sucesso' | 'erro';
  origem: string;
  errorMsg?: string;
}

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
  const isEnfermeiro = useMemo(() => {
    const p = usuarioLogado?.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    return p === "enfermeiro(a)" || p === "enfermeiro" || p === "enfermeira";
  }, [usuarioLogado]);

  const allowedMatriculas = useMemo(() => {
    if (!usuarioLogado) return null;
    const p = usuarioLogado.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    const isEnf = p === "enfermeiro(a)" || p === "enfermeiro" || p === "enfermeira";
    if (!isEnf) return null;

    const set = new Set<string>();
    colaboradores.forEach(c => {
      if (isUserSubordinate(c, usuarioLogado, colaboradores)) {
        set.add(c.matricula);
      }
    });
    return set;
  }, [colaboradores, usuarioLogado]);

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

  // Batch Intelligent Ingestion (WhatsApp Files, Chat Copypaste, OneDrive, Email) states
  const [isOpenBatchModal, setIsOpenBatchModal] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<DraftCertificado[]>([]);
  const [batchActiveTab, setBatchActiveTab] = useState<'files' | 'text' | 'onedrive'>('files');
  const [batchPText, setBatchPText] = useState('');
  const [batchIsAnalyzingText, setBatchIsAnalyzingText] = useState(false);
  const [batchGlobalError, setBatchGlobalError] = useState('');
  const [oneDriveFolderLink, setOneDriveFolderLink] = useState('');

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

  // Gemini AI CID-10 search states
  const [geminiSearchQuery, setGeminiSearchQuery] = useState('');
  const [isGeminiSearching, setIsGeminiSearching] = useState(false);
  const [geminiSearchResults, setGeminiSearchResults] = useState<{ codigo: string; descricao: string; detalhes: string; }[]>([]);
  const [showGeminiSearchPanel, setShowGeminiSearchPanel] = useState(false);
  const [geminiSearchError, setGeminiSearchError] = useState('');

  // Gemini AI Medical Certificate extraction states
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractSuccess, setExtractSuccess] = useState<{
    detectedName: string;
    matched: boolean;
    details?: {
      inicio: string;
      duracao: number;
      cid: string;
      patologia: string;
    }
  } | null>(null);

  const handleFileChangeAndExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setExtractError('Arquivo muito grande! Escolha uma imagem ou PDF de até 10MB.');
      return;
    }

    setIsExtracting(true);
    setExtractError('');
    setExtractSuccess(null);

    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/absenteismo/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileBase64,
          mimeType: file.type || 'image/jpeg',
        }),
      });

      if (!response.ok) {
        throw new Error('Falha no processamento pela Inteligência Artificial. Verifique a conexão e o formato do documento.');
      }

      const data = await response.json();
      
      const detectedName = data.colaborador_nome_original || '';
      const detectedInicio = data.data_inicio || '';
      const detectedDuracao = data.duracao_dias || 1;
      const detectedCid = (data.cid || '').trim().toUpperCase();
      const detectedPatologia = data.patologia_diagnostico || '';

      if (detectedInicio) {
        setInicio(detectedInicio);
      }
      if (detectedDuracao) {
        setDuracaoNum(detectedDuracao);
      }
      if (detectedCid) {
        setCid(detectedCid);
      }
      if (detectedPatologia) {
        setPatologia(detectedPatologia);
      } else if (detectedCid && CID_NATIVO[detectedCid]) {
        setPatologia(CID_NATIVO[detectedCid]);
      }

      // Try matching the collaborator names
      let matchedColab = null;
      if (detectedName) {
        const cleanedDetected = detectedName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Exact match
        matchedColab = colaboradores.find(c => {
          const cleanName = c.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return cleanName === cleanedDetected;
        });

        // Similarity match
        if (!matchedColab) {
          matchedColab = colaboradores.find(c => {
            const cleanName = c.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return cleanName.includes(cleanedDetected) || cleanedDetected.includes(cleanName);
          });
        }
      }

      if (matchedColab) {
        handleNomeSelectChange(matchedColab.nome);
        setExtractSuccess({
          detectedName: matchedColab.nome,
          matched: true,
          details: {
            inicio: detectedInicio,
            duracao: detectedDuracao,
            cid: detectedCid,
            patologia: detectedPatologia || CID_NATIVO[detectedCid] || 'CID Livre'
          }
        });
      } else {
        setExtractSuccess({
          detectedName: detectedName || 'Não identificado',
          matched: false,
          details: {
            inicio: detectedInicio,
            duracao: detectedDuracao,
            cid: detectedCid,
            patologia: detectedPatologia || CID_NATIVO[detectedCid] || 'CID Livre'
          }
        });
      }

    } catch (err: any) {
      console.error(err);
      setExtractError(err.message || 'Erro ao extrair dados do certificado médicos via IA.');
    } finally {
      setIsExtracting(false);
      e.target.value = '';
    }
  };

  const handleGeminiCidSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiSearchQuery.trim()) return;

    setIsGeminiSearching(true);
    setGeminiSearchError('');
    setGeminiSearchResults([]);

    try {
      const response = await fetch('/api/cid10/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: geminiSearchQuery.trim() }),
      });

      if (!response.ok) {
        throw new Error('Falha ao obter resultados da inteligência artificial.');
      }

      const data = await response.json();
      if (data && Array.isArray(data.results)) {
        setGeminiSearchResults(data.results);
      } else {
        throw new Error('Formato de resposta inesperado do serviço da IA.');
      }
    } catch (err: any) {
      console.error(err);
      setGeminiSearchError(err.message || 'Erro de conexão com o servidor.');
    } finally {
      setIsGeminiSearching(false);
    }
  };

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

      const matchAllowed = allowedMatriculas === null || allowedMatriculas.has(item.matricula);

      return matchSearch && matchTurno && matchSetor && matchMonth && matchAllowed;
    });
  }, [absenteismo, searchTerm, selectedTurnos, selectedSetores, selectedMeses, allowedMatriculas]);

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
      customAlert("Por favor, preencha todos os campos obrigatórios do lançamento.");
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
    setExtractError('');
    setExtractSuccess(null);
    setIsExtracting(false);
    setIsOpenModal(true);
  };

  const handleDeleteAbs = async (id: string, name: string) => {
    if (await customConfirm(`Deseja remover as faltas no prontuário de ${name} (Lançamento #${id})?`)) {
      onUpdateAbsenteismo(absenteismo.filter(a => a.id !== id));
    }
  };

  // Normalize and match collaborator by name
  const findMatchingColaborador = (extractedName: string) => {
    if (!extractedName) return null;
    const normExtracted = extractedName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // First try exact or near-match
    let matched = colaboradores.find(c => {
      const normDB = c.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normDB.includes(normExtracted) || normExtracted.includes(normDB);
    });

    if (matched) return matched;

    // Try splitting first/last names to find partial overlaps
    const words = normExtracted.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      return colaboradores.find(c => {
        const normDB = c.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return words.every(word => normDB.includes(word));
      });
    }

    return null;
  };

  const handleProcessBatchFiles = async (files: FileList | File[]) => {
    setBatchGlobalError('');
    const filesArray = Array.from(files);

    if (filesArray.length === 0) return;

    // Create a draft for each file with "processing" state
    const newDrafts: DraftCertificado[] = filesArray.map((file, idx) => ({
      id: `draft_file_${Date.now()}_${idx}`,
      colaboradorOriginal: file.name,
      nomeCorrespondente: '',
      matricula: '',
      setor: '',
      cargo: '',
      turno: '',
      inicio: new Date().toISOString().split('T')[0],
      duracao: 1,
      cid: '',
      patologia: '',
      status: 'processando',
      origem: `WhatsApp Web File: ${file.name}`
    }));

    setBatchDrafts(prev => [...newDrafts, ...prev]);

    // Send each file to server in parallel
    filesArray.forEach(async (file, idx) => {
      const draftId = newDrafts[idx].id;

      try {
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/absenteismo/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileBase64,
            mimeType: file.type || 'image/jpeg'
          })
        });

        if (!res.ok) {
          throw new Error('Falha ao processar arquivo no servidor.');
        }

        const parsedAI = await res.json();
        const detectedName = parsedAI.colaborador_nome_original || '';
        const match = findMatchingColaborador(detectedName);

        setBatchDrafts(prev => prev.map(d => {
          if (d.id === draftId) {
            return {
              ...d,
              status: 'sucesso',
              colaboradorOriginal: detectedName || file.name,
              nomeCorrespondente: match ? match.nome : '',
              matricula: match ? match.matricula : '',
              setor: match ? match.setor : '',
              cargo: match ? match.cargo : '',
              turno: match ? (match.equipe || 'Unspecified') : '',
              inicio: parsedAI.data_inicio || new Date().toISOString().split('T')[0],
              duracao: parsedAI.duracao_dias || 1,
              cid: (parsedAI.cid || '').toUpperCase(),
              patologia: parsedAI.patologia_diagnostico || 'Queixa médica'
            };
          }
          return d;
        }));

      } catch (err: any) {
        console.error(err);
        setBatchDrafts(prev => prev.map(d => {
          if (d.id === draftId) {
            return {
              ...d,
              status: 'erro',
              errorMsg: err.message || 'Erro ao extrair dados via IA.'
            };
          }
          return d;
        }));
      }
    });
  };

  const handleProcessPastedText = async () => {
    if (!batchPText.trim()) {
      setBatchGlobalError('Cole o e-mail, texto de WhatsApp do grupo ou notas na caixa acima.');
      return;
    }

    setBatchIsAnalyzingText(true);
    setBatchGlobalError('');

    try {
      const res = await fetch('/api/absenteismo/extract-text-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ textContent: batchPText })
      });

      if (!res.ok) {
        throw new Error('Não foi possível processar o texto do e-mail/chat através da Inteligência Artificial.');
      }

      const rawExtracted: any[] = await res.json();

      if (rawExtracted.length === 0) {
        setBatchGlobalError('A Inteligência Artificial analisou o texto, mas não identificou nenhum relato estruturado de atestado com nome e dias.');
        return;
      }

      const newlyPastedDrafts: DraftCertificado[] = rawExtracted.map((item, idx) => {
        const match = findMatchingColaborador(item.colaborador_nome_original);
        return {
          id: `draft_text_${Date.now()}_${idx}`,
          colaboradorOriginal: item.colaborador_nome_original || 'Nome Desconhecido',
          nomeCorrespondente: match ? match.nome : '',
          matricula: match ? match.matricula : '',
          setor: match ? match.setor : '',
          cargo: match ? match.cargo : '',
          turno: match ? (match.equipe || 'Unspecified') : '',
          inicio: item.data_inicio || new Date().toISOString().split('T')[0],
          duracao: item.duracao_dias || 1,
          cid: (item.cid || '').toUpperCase(),
          patologia: item.patologia_diagnostico || 'Relato de Afastamento',
          status: 'sucesso',
          origem: 'E-mail / WhatsApp Copiado'
        };
      });

      setBatchDrafts(prev => [...newlyPastedDrafts, ...prev]);
      setBatchPText(''); // empty the box on success

    } catch (err: any) {
      console.error(err);
      setBatchGlobalError(err.message || 'Erro desconhecido ao processar o texto.');
    } finally {
      setBatchIsAnalyzingText(false);
    }
  };

  const updateDraftField = (id: string, field: keyof DraftCertificado, value: any) => {
    setBatchDrafts(prev => prev.map(d => {
      if (d.id === id) {
        const updated = { ...d, [field]: value };
        // If they pick/update the exact matching collaborator name
        if (field === 'nomeCorrespondente') {
          const matched = colaboradores.find(c => c.nome === value);
          if (matched) {
            updated.matricula = matched.matricula;
            updated.setor = matched.setor;
            updated.cargo = matched.cargo;
            updated.turno = matched.equipe || 'Unspecified';
          }
        }
        return updated;
      }
      return d;
    }));
  };

  const handleLaunchAllVerifiedDrafts = () => {
    // Only launch success items with a valid corresponding employee
    const readyItems = batchDrafts.filter(d => d.status === 'sucesso' && d.nomeCorrespondente);

    if (readyItems.length === 0) {
      customAlert('Nenhum atestado revisado com colaborador válido está pronto para ser lançado.');
      return;
    }

    const newAbsenteismos: Absenteismo[] = readyItems.map(draft => {
      const onsetDate = draft.inicio || new Date().toISOString().split('T')[0];
      const termDate = new Date(onsetDate);
      termDate.setDate(termDate.getDate() + (draft.duracao - 1));
      const formattedTerm = termDate.toISOString().split('T')[0];

      return {
        id: `abs_batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        tipo: 'Atestado',
        colaborador: draft.nomeCorrespondente,
        matricula: draft.matricula,
        setor: draft.setor,
        cargo: draft.cargo,
        turno: draft.turno,
        inicio: onsetDate,
        termino: formattedTerm,
        retorno: formattedTerm,
        duracao: draft.duracao === 1 ? '1 Dia' : `${draft.duracao} Dias`,
        cid: draft.cid,
        patologia: draft.patologia || 'Justificativa Médica'
      };
    });

    onUpdateAbsenteismo([...newAbsenteismos, ...absenteismo]);
    
    // Clear successfully launched ones, leave errors/unmatched
    setBatchDrafts(prev => prev.filter(d => !readyItems.some(ri => ri.id === d.id)));
    customAlert(`Sucesso! ${newAbsenteismos.length} atestados foram lançados e suas escalas foram atualizadas automaticamente no sistema!`);

    if (batchDrafts.length === readyItems.length) {
      setIsOpenBatchModal(false);
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
      customAlert(`Sucesso! ${novos.length} registros de absenteísmo importados.`);
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
          {!isEnfermeiro && (
            <>
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
                  setExtractError('');
                  setExtractSuccess(null);
                  setIsExtracting(false);
                  setIsOpenModal(true);
                  if (colaboradores.length > 0) handleNomeSelectChange(colaboradores[0].nome);
                }}
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4.5 rounded-xl text-sm shadow-md shadow-sky-600/10 flex items-center gap-2 transition duration-150 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Lançar Afastamento</span>
              </button>
              
              <button
                onClick={() => {
                  setBatchDrafts([]);
                  setBatchPText('');
                  setBatchGlobalError('');
                  setIsOpenBatchModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4.5 rounded-xl text-sm shadow-md shadow-emerald-600/10 flex items-center gap-2 transition duration-150 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 animate-pulse text-emerald-100" />
                <span>Importador Inteligente IA</span>
              </button>
            </>
          )}
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
                        {!isEnfermeiro ? (
                          <>
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
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold bg-slate-50 px-2 py-1 rounded border">SOMENTE LEITURA</span>
                        )}
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
               
               {/* AI-Powered Document Scanner Block (Atestado inteligente) */}
               {modalMode === 'create' && (
                 <div className="bg-sky-50/50 rounded-xl p-3.5 border border-sky-100 flex flex-col gap-2 relative">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-1.5 text-sky-800 font-extrabold text-[10.5px] uppercase tracking-wide">
                       <Sparkles className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
                       <span>Leitura Inteligente de Atestado (IA)</span>
                     </div>
                   </div>
                   <div className="text-[10px] text-slate-500 font-medium leading-relaxed">
                     Quer poupar tempo digitando? Selecione ou solte a imagem (.jpg, .png) ou PDF do atestado físico. O sistema analisará o diagnóstico, data e preencherá a ficha para você!
                   </div>
                   
                   <div 
                     className={`border-2 border-dashed rounded-xl p-3.5 flex flex-col items-center justify-center gap-2 transition cursor-pointer relative bg-white
                       ${isExtracting ? 'border-sky-300 bg-sky-50/25' : 'border-slate-200 hover:border-sky-400 hover:bg-slate-50/30'}
                     `}
                     onClick={() => !isExtracting && document.getElementById('atestado-file-input')?.click()}
                   >
                     <input 
                       id="atestado-file-input"
                       type="file" 
                       accept="image/png, image/jpeg, image/jpg, application/pdf"
                       className="hidden" 
                       onChange={handleFileChangeAndExtract} 
                     />
                     
                     {isExtracting ? (
                       <div className="flex flex-col items-center gap-1.5 text-center py-1">
                         <RefreshCw className="w-5 h-5 text-sky-600 animate-spin" />
                         <span className="font-extrabold text-sky-850 text-[11px]">Lendo documento com Inteligência Artificial...</span>
                         <span className="text-[9px] text-slate-400">Extraindo campos, datas e dados do CID...</span>
                       </div>
                     ) : (
                       <div className="flex flex-col items-center gap-1 text-center">
                         <Upload className="w-5 h-5 text-slate-400" />
                         <span className="font-bold text-slate-700 text-[10.5px]">Selecione a Imagem ou PDF do Atestado</span>
                         <span className="text-[9px] text-slate-400 font-medium">JPEG, PNG ou PDF até 10MB</span>
                       </div>
                     )}
                   </div>

                   {extractError && (
                     <div className="text-[10px] text-rose-600 font-bold bg-rose-50 p-2.5 rounded-lg border border-rose-100 flex items-center gap-1.5">
                       <span>⚠️ {extractError}</span>
                     </div>
                   )}

                   {extractSuccess && (
                     <div className="text-[10px] text-emerald-850 font-bold bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-100 flex flex-col gap-1 shadow-2xs leading-relaxed">
                       <span className="text-emerald-700 font-black text-[10px] uppercase tracking-wider block">✓ Extração da IA Concluída!</span>
                       <div className="font-bold text-slate-700 text-[10.5px]">
                         Nome Extraído: <strong className="text-sky-800">{extractSuccess.detectedName}</strong> 
                         {extractSuccess.matched ? (
                           <span className="text-emerald-600 font-extrabold ml-1 bg-emerald-100/60 px-1.5 py-0.5 rounded text-[8.5px] uppercase tracking-wider">Colaborador Vinculado✓</span>
                         ) : (
                           <span className="text-amber-600 font-extrabold ml-1 bg-amber-100/60 px-1.5 py-0.5 rounded text-[8.5px] uppercase tracking-wider">Atenção: Procure e selecione na lista abaixo!</span>
                         )}
                       </div>
                       {extractSuccess.details && (
                         <div className="text-slate-500 font-semibold text-[9.5px] mt-0.5 flex flex-wrap gap-x-2 border-t border-dashed border-emerald-100/50 pt-1">
                           <span>📅 Início: <strong className="text-slate-700">{extractSuccess.details.inicio ? extractSuccess.details.inicio.split('-').reverse().join('/') : 'Não lido'}</strong></span>
                           <span>⏳ Duração: <strong className="text-slate-700">{extractSuccess.details.duracao} dia(s)</strong></span>
                           <span>🩺 CID: <strong className="text-slate-700">{extractSuccess.details.cid || 'Não informado'}</strong></span>
                           <span className="w-full mt-0.5 block">🔬 Descrição: <strong className="text-slate-700 font-medium italic">"{extractSuccess.details.patologia || 'N/A'}"</strong></span>
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               )}
              
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

              {/* Gemini AI Powered CID-10 Smart Search */}
              <div className="space-y-1.5 pt-1.5">
                <div className="flex justify-between items-center bg-sky-50/70 p-2 rounded-lg border border-sky-100">
                  <div className="flex items-center gap-1.5 text-[11px] text-sky-850 font-bold">
                    <span>✨ Pesquisa de CID por Sintomas ou Palavras-Chave</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGeminiSearchPanel(!showGeminiSearchPanel)}
                    className="text-[10px] bg-sky-600 hover:bg-sky-700 text-white font-extrabold py-1 px-2.5 rounded-md transition shadow-xs cursor-pointer uppercase tracking-wider"
                  >
                    {showGeminiSearchPanel ? 'Ocultar Buscador' : 'Buscar por IA (Gemini)'}
                  </button>
                </div>

                {showGeminiSearchPanel && (
                  <div className="bg-sky-50/30 border border-sky-100 p-3 rounded-lg space-y-3 animate-fadeIn">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={geminiSearchQuery}
                        onChange={(e) => setGeminiSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleGeminiCidSearch(e);
                          }
                        }}
                        placeholder="Ex: 'Dor de cabeça forte', 'Diarreia e vômito', 'Fratura de punho'..."
                        className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-xs leading-normal font-bold focus:outline-none focus:border-sky-500 font-sans"
                      />
                      <button
                        type="button"
                        onClick={handleGeminiCidSearch}
                        disabled={isGeminiSearching}
                        className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-black py-2 px-3.5 rounded-lg transition disabled:bg-slate-300 disabled:text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        {isGeminiSearching ? 'Buscando...' : 'Buscar'}
                      </button>
                    </div>

                    {geminiSearchError && (
                      <div className="text-[10px] text-rose-600 font-bold bg-rose-50 p-2 rounded-md border border-rose-100">{geminiSearchError}</div>
                    )}

                    {geminiSearchResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border-t border-sky-100/60 pt-2">
                        <span className="text-[9px] text-slate-400 font-black tracking-wider block uppercase mb-1">Resultados Sugeridos:</span>
                        {geminiSearchResults.map((res) => (
                          <div
                            key={res.codigo}
                            onClick={() => {
                              setCid(res.codigo);
                              setPatologia(res.descricao);
                              setShowGeminiSearchPanel(false);
                            }}
                            className="hover:bg-sky-105/90 cursor-pointer p-2 rounded-lg bg-white border border-slate-200 text-left transition duration-150 hover:shadow-xs hover:border-sky-300"
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-extrabold text-[10px] text-sky-800 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded font-mono uppercase">{res.codigo}</span>
                              <span className="text-[9px] text-sky-600 font-black uppercase tracking-wider">Selecionar ✓</span>
                            </div>
                            <p className="font-extrabold text-slate-800 text-[11px] leading-snug">{res.descricao}</p>
                            {res.detalhes && <p className="text-[9.5px] text-slate-500 mt-1 leading-snug font-medium italic">{res.detalhes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                    className="w-full p-2 border border-slate-250 bg-white text-slate-700 rounded-lg font-bold"
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

      {/* Central de Importação Inteligente em Lote (WhatsApp, Email & OneDrive) */}
      {isOpenBatchModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn font-sans overflow-hidden">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-scaleUp">
            
            {/* Modal Header */}
            <div className="bg-emerald-600 text-white p-5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-emerald-100" />
                <div>
                  <h3 className="font-extrabold text-xl uppercase tracking-tight">Central de Importação IA Inteligente</h3>
                  <p className="text-xs text-emerald-100 font-medium">Lançamento agilizado para grupos de WhatsApp, e-mails e pastas de arquivos</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsOpenBatchModal(false); }} 
                className="hover:bg-emerald-700 p-2 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TAB PICKER */}
            <div className="bg-slate-50 border-b border-slate-200 p-3 flex gap-2 shrink-0">
              <button
                onClick={() => { setBatchActiveTab('files'); setBatchGlobalError(''); }}
                className={`py-2 px-4 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
                  batchActiveTab === 'files' 
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/10' 
                    : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Multi-Upload de WhatsApp (Fotos/PDF)</span>
              </button>

              <button
                onClick={() => { setBatchActiveTab('text'); setBatchGlobalError(''); }}
                className={`py-2 px-4 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
                  batchActiveTab === 'text' 
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/10' 
                    : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Copiar e Colar de E-mails ou WhatsApp</span>
              </button>

              <button
                onClick={() => { setBatchActiveTab('onedrive'); setBatchGlobalError(''); }}
                className={`py-2 px-4 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
                  batchActiveTab === 'onedrive' 
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/10' 
                    : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                <span>Organizar com OneDrive / SharePoint</span>
              </button>
            </div>

            {/* ACTIVE TAB PANEL & GRID REVIEW */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* GLOBAL ERRORS */}
              {batchGlobalError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl text-xs font-bold leading-relaxed flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{batchGlobalError}</span>
                </div>
              )}

              {/* TAB 1: FILES UPLOAD (MULTIPLES FILES) */}
              {batchActiveTab === 'files' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-3xl p-8 bg-slate-50 transition text-center relative cursor-pointer group">
                    <input 
                      type="file"
                      multiple
                      accept="image/png, image/jpeg, image/jpg, application/pdf"
                      onChange={(e) => {
                        if (e.target.files) handleProcessBatchFiles(e.target.files);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="space-y-3 pointer-events-none">
                      <div className="bg-emerald-100 text-emerald-700 p-3.5 rounded-full w-14 h-14 flex items-center justify-center mx-auto transition group-hover:scale-110">
                        <Upload className="w-7 h-7" />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-slate-800">Arraste múltiplos atestados médicos aqui</p>
                        <p className="text-xs text-slate-500 mt-1">Selecione ou solte arquivos de uma só vez (fotos ou PDFs baixados do WhatsApp Web)</p>
                      </div>
                      <div className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wide bg-emerald-50 max-w-xs mx-auto py-1.5 px-3 rounded-lg border border-emerald-100">
                        A Inteligência Artificial lê tudo de forma automática
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex gap-3 text-xs leading-relaxed font-medium text-slate-600">
                    <span className="bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">💡</span>
                    <p>
                      <strong>Dica Prática para Gestores</strong>: Quando os coordenadores enviarem atestados no grupo de WhatsApp, baixe todos eles no seu computador de uma vez e simplesmente selecione/arraste todos juntos para o espaço acima!
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: COPY PASTE TEXT */}
              {batchActiveTab === 'text' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-black text-slate-500 uppercase tracking-wider block">
                      Cole a mensagem do WhatsApp ou o texto de e-mail enviado:
                    </label>
                    <textarea
                      rows={6}
                      value={batchPText}
                      onChange={(e) => setBatchPText(e.target.value)}
                      placeholder="Ex: Enfermeiro Michel, segue justificativas da enfermaria: Maria Helena (matrícula 22340) apresentou atestado de 2 dias CID M545 a partir de 19/06. O técnico João Pedro da Silva, de licença gala por 5 dias desde ontem..."
                      className="w-full p-4 border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-bold text-xs rounded-2xl text-slate-700 leading-relaxed placeholder:text-slate-400"
                    ></textarea>
                  </div>

                  <button
                    onClick={handleProcessPastedText}
                    disabled={batchIsAnalyzingText}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg transition duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:bg-emerald-300"
                  >
                    {batchIsAnalyzingText ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Extraindo relatórios do texto via Gemini IA...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analisar Texto e Estruturar Atestados</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* TAB 3: ONEDRIVE / SHAREPOINT LINK TRACKING */}
              {batchActiveTab === 'onedrive' && (
                <div className="space-y-4">
                  <div className="bg-sky-50 rounded-2xl p-5 border border-sky-100 space-y-3.5">
                    <div className="flex items-center gap-2 text-sky-850 font-black text-xs uppercase tracking-wider">
                      <FolderHeart className="w-4.5 h-4.5 text-sky-600" />
                      <span>Salvando atestados em pastas compartilhadas públicas</span>
                    </div>
                    <p className="text-xs text-slate-650 leading-relaxed font-semibold">
                      Muitos hospitais utilizam o <strong>Microsoft OneDrive</strong> ou <strong>SharePoint</strong> para guardar arquivos brutos de atestados que os colaboradores enviam. Você pode colar o link da pasta pública abaixo para tê-lo como centralizador de consulta. Os arquivos que os gestores coletam do WhatsApp podem ser salvos lá, e você realiza a leitura puxando e arrastando direto para a nossa aba <strong className="text-sky-800">Multi-Upload</strong>.
                    </p>

                    <div className="space-y-1.5 border-t border-sky-150 pt-3">
                      <label className="text-[10px] font-bold text-sky-850 uppercase tracking-widest block">URL da Pasta da Equipe do OneDrive / SharePoint:</label>
                      <input 
                        type="text"
                        value={oneDriveFolderLink}
                        onChange={(e) => setOneDriveFolderLink(e.target.value)}
                        placeholder="https://onedrive.live.com/redir?resid=... ou link do SharePoint"
                        className="w-full p-2.5 border border-sky-200 bg-white font-bold text-xs rounded-xl text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-[10.5px] font-bold text-slate-700 uppercase tracking-tight block">Workflow Recomendado para sua Escala:</div>
                    
                    <div className="flex gap-2.5 items-start text-xs font-semibold leading-relaxed">
                      <span className="bg-sky-100 text-sky-850 font-black text-[10px] rounded-full w-5 h-5 flex items-center justify-center shrink-0">1</span>
                      <p className="text-slate-600">
                        Crie uma pasta chamada <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600">"Atestados Enfermaria HNS"</code> no seu OneDrive e adicione os gestores como editores.
                      </p>
                    </div>

                    <div className="flex gap-2.5 items-start text-xs font-semibold leading-relaxed">
                      <span className="bg-sky-100 text-sky-850 font-black text-[10px] rounded-full w-5 h-5 flex items-center justify-center shrink-0">2</span>
                      <p className="text-slate-600">
                        Sempre que o gestor postar fotos no grupo de WhatsApp, eles também podem enviar para essa pasta corporativa.
                      </p>
                    </div>

                    <div className="flex gap-2.5 items-start text-xs font-semibold leading-relaxed">
                      <span className="bg-sky-100 text-sky-850 font-black text-[10px] rounded-full w-5 h-5 flex items-center justify-center shrink-0">3</span>
                      <p className="text-slate-600">
                        Para lançar: abra a pasta do OneDrive, selecione todos os novos arquivos e arraste-os para o <strong className="text-emerald-700">Multi-Upload</strong> desta central inteligente para cadastrá-los em bloco.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* REAL-TIME DRAFTS REVIEW GRID */}
              {batchDrafts.length > 0 && (
                <div className="space-y-3.5 border-t border-slate-200 pt-5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-emerald-600" />
                      <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-tight">Rascunhos Extraídos e prontos para Revisão ({batchDrafts.length})</h4>
                    </div>
                    <button 
                      onClick={() => setBatchDrafts([])}
                      className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Lista
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="p-3">Origem / Lido por IA</th>
                          <th className="p-3">Colaborador Local no Sistema</th>
                          <th className="p-3 w-32">Início</th>
                          <th className="p-3 w-16">Dias</th>
                          <th className="p-3 w-20">CID</th>
                          <th className="p-3">Patologia / Diagnóstico</th>
                          <th className="p-3 w-16 text-center">Status</th>
                          <th className="p-3 w-10 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {batchDrafts.map((draft) => {
                          const isProcessing = draft.status === 'processando';
                          const isError = draft.status === 'erro';

                          return (
                            <tr key={draft.id} className={`hover:bg-slate-50 transition ${isError ? 'bg-rose-50/20' : ''}`}>
                              
                              {/* INFO ORIGINAL */}
                              <td className="p-3">
                                <div className="max-w-[180px] break-all">
                                  <div className="font-black text-slate-800 text-[10.5px]">
                                    {draft.colaboradorOriginal}
                                  </div>
                                  <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">
                                    {draft.origem}
                                  </div>
                                </div>
                              </td>

                              {/* MAPPED COLLABORATOR DROPDOWN */}
                              <td className="p-3">
                                {isProcessing ? (
                                  <div className="h-7 w-28 bg-slate-100 rounded-lg animate-pulse" />
                                ) : (
                                  <div className="space-y-1">
                                    <select
                                      value={draft.nomeCorrespondente}
                                      onChange={(e) => updateDraftField(draft.id, 'nomeCorrespondente', e.target.value)}
                                      className={`w-full p-2 border rounded-lg font-bold text-xs focus:ring-1 focus:ring-emerald-500 bg-white ${
                                        draft.nomeCorrespondente 
                                          ? 'border-emerald-200 text-emerald-950' 
                                          : 'border-rose-300 text-rose-650 bg-rose-50/25 animate-pulse'
                                      }`}
                                    >
                                      <option value="">-- Selecione o Colaborador --</option>
                                      {colaboradores.map(c => (
                                        <option key={c.matricula} value={c.nome}>
                                          {c.nome} ({c.cargo} | {c.setor})
                                        </option>
                                      ))}
                                    </select>
                                    {!draft.nomeCorrespondente && (
                                      <div className="text-[9px] text-rose-600 font-extrabold uppercase">
                                        ⚠️ Vincule um colaborador ativo no sistema
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* ONSET DATE */}
                              <td className="p-3">
                                {isProcessing ? (
                                  <div className="h-7 w-24 bg-slate-100 rounded-lg animate-pulse" />
                                ) : (
                                  <input 
                                    type="date"
                                    value={draft.inicio}
                                    onChange={(e) => updateDraftField(draft.id, 'inicio', e.target.value)}
                                    className="p-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                )}
                              </td>

                              {/* DURATION */}
                              <td className="p-3">
                                {isProcessing ? (
                                  <div className="h-7 w-12 bg-slate-100 rounded-lg animate-pulse" />
                                ) : (
                                  <input 
                                    type="number"
                                    min={1}
                                    value={draft.duracao}
                                    onChange={(e) => updateDraftField(draft.id, 'duracao', parseInt(e.target.value) || 1)}
                                    className="p-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 w-full text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                )}
                              </td>

                              {/* CID */}
                              <td className="p-3">
                                {isProcessing ? (
                                  <div className="h-7 w-14 bg-slate-100 rounded-lg animate-pulse" />
                                ) : (
                                  <input 
                                    type="text"
                                    maxLength={8}
                                    value={draft.cid}
                                    onChange={(e) => updateDraftField(draft.id, 'cid', e.target.value.toUpperCase())}
                                    className="p-1.5 border border-slate-200 rounded-lg text-xs font-black text-slate-805 w-full text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    placeholder="Ex: A09"
                                  />
                                )}
                              </td>

                              {/* PATHOLOGY DIAGNOSIS */}
                              <td className="p-3">
                                {isProcessing ? (
                                  <div className="h-7 w-32 bg-slate-100 rounded-lg animate-pulse" />
                                ) : (
                                  <input 
                                    type="text"
                                    value={draft.patologia}
                                    onChange={(e) => updateDraftField(draft.id, 'patologia', e.target.value)}
                                    className="p-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    placeholder="Motivo da ausência"
                                  />
                                )}
                              </td>

                              {/* QUALITY BADGE STATUS */}
                              <td className="p-3 text-center">
                                {isProcessing ? (
                                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-500 mx-auto" />
                                ) : isError ? (
                                  <div className="inline-flex items-center gap-1 text-[9px] bg-rose-100 text-rose-700 py-1 px-2 rounded-full font-black uppercase">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Falhou</span>
                                  </div>
                                ) : (
                                  <div className={`inline-flex items-center gap-1 text-[9px] py-1 px-2 rounded-full font-black uppercase ${
                                    draft.nomeCorrespondente 
                                      ? 'bg-emerald-100 text-emerald-700' 
                                      : 'bg-yellow-105 text-yellow-800'
                                  }`}>
                                    <Check className="w-3 h-3" />
                                    <span>{draft.nomeCorrespondente ? 'Revisado' : 'Ajustar'}</span>
                                  </div>
                                )}
                              </td>

                              {/* ACTIONS */}
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => setBatchDrafts(prev => prev.filter(d => d.id !== draft.id))}
                                  className="p-1 text-slate-400 hover:text-rose-600 transition hover:bg-slate-100 rounded-lg cursor-pointer mx-auto block"
                                  title="Remover"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* SUBMIT BUTTON */}
                  <div className="flex justify-end pt-3">
                    <button
                      onClick={handleLaunchAllVerifiedDrafts}
                      disabled={batchDrafts.filter(d => d.status === 'sucesso' && d.nomeCorrespondente).length === 0}
                      className="py-4 px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-lg transition duration-200 flex items-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed uppercase tracking-tight"
                    >
                      <Check className="w-5 h-5 font-black" />
                      <span>Confirmar Lançamento de Todos ({batchDrafts.filter(d => d.status === 'sucesso' && d.nomeCorrespondente).length} Atestados)</span>
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-4.5 border-t border-slate-150 flex justify-between shrink-0">
              <span className="text-xs text-slate-500 font-medium self-center">
                Ativo: <strong>Gemini 3.5 Flash Engine</strong> para extração médica estruturada.
              </span>
              <button
                onClick={() => { setIsOpenBatchModal(false); }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl text-xs transition shadow-md cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
