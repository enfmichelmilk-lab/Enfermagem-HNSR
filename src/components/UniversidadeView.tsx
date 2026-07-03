/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  GraduationCap, 
  Plus, 
  Trash2, 
  Upload, 
  FileCheck2, 
  Award, 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown,
  Printer,
  CheckCircle2, 
  Search, 
  BookOpen, 
  Users, 
  ChevronRight, 
  Loader2, 
  Calendar,
  AlertCircle,
  Clock,
  Briefcase,
  HelpCircle,
  Check,
  Clipboard,
  FileText,
  Sparkles,
  Pencil,
  RefreshCw,
  FileSignature,
  Paperclip,
  UserCheck,
  CheckSquare,
  Square
} from 'lucide-react';
import { Curso, CertificadoCurso, Colaborador, CourseTarget, Ferias, Usuario } from '../types';
import { subscribeCollection, saveDocument, removeDocument } from '../lib/firebase';
import { CARGOS_ENFERMAGEM, SETORES_HOSPITALARES, EQUIPES_ESCALA, CURSOS_INICIAIS } from '../data/mockData';
import { customAlert, customConfirm } from '../utils/customDialog';
import { isUserSubordinate } from '../utils/userFilters';

interface UniversidadeViewProps {
  colaboradores: Colaborador[];
  ferias?: Ferias[];
  usuarioLogado?: Usuario;
}

export default function UniversidadeView({ colaboradores, ferias = [], usuarioLogado }: UniversidadeViewProps) {
  const isEnfermeiroProfile = React.useMemo(() => {
    const perfil = usuarioLogado?.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    return perfil === "enfermeiro(a)" || perfil === "enfermeiro" || perfil === "enfermeira";
  }, [usuarioLogado]);

  const allowedMatriculas = React.useMemo(() => {
    if (!isEnfermeiroProfile) return null;
    const allowed = new Set<string>();
    colaboradores.forEach(c => {
      if (isUserSubordinate(c, usuarioLogado, colaboradores)) {
        allowed.add(c.matricula);
      }
    });
    return allowed;
  }, [isEnfermeiroProfile, colaboradores, usuarioLogado]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [certificados, setCertificados] = useState<CertificadoCurso[]>([]);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cursos' | 'certificados' | 'relatorios'>('dashboard');
  const [reportFilterSetor, setReportFilterSetor] = useState('');
  const [reportFilterTurno, setReportFilterTurno] = useState('');
  
  // Real-time subscribers
  useEffect(() => {
    const unsubCursos = subscribeCollection<Curso>(
      'universidade_cursos',
      (data) => setCursos(data.sort((a, b) => (b.dataCriacao || '').localeCompare(a.dataCriacao || ''))),
      'hnsr_universidade_cursos_db',
      CURSOS_INICIAIS
    );

    const unsubCertificados = subscribeCollection<CertificadoCurso>(
      'universidade_certificados',
      (data) => setCertificados(data.sort((a, b) => (b.dataCriacao || '').localeCompare(a.dataCriacao || ''))),
      'hnsr_universidade_certificados_db',
      []
    );

    return () => {
      unsubCursos();
      unsubCertificados();
    };
  }, []);

  // NEW COURSE STATES
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [newCourseNome, setNewCourseNome] = useState('');
  const [newCourseDesc, setNewCourseDesc] = useState('');
  const [newCourseTargets, setNewCourseTargets] = useState<{ [cargo: string]: { selected: boolean; obrigatorio: boolean } }>({});

  // Initialize targets for form
  useEffect(() => {
    const initial: typeof newCourseTargets = {};
    CARGOS_ENFERMAGEM.forEach(c => {
      initial[c] = { selected: false, obrigatorio: false };
    });
    setNewCourseTargets(initial);
  }, [isAddingCourse]);

  // MANUAL CERTIFICATE UPLOAD STATES
  const [certMode, setCertMode] = useState<'ia' | 'manual'>('ia');
  const [manualSelectedMatricula, setManualSelectedMatricula] = useState<string>('');
  const [manualFiles, setManualFiles] = useState<{ [cursoId: string]: { fileName: string, fileBase64: string } }>({});
  const [manualCompletionDates, setManualCompletionDates] = useState<{ [cursoId: string]: string }>({});
  const [manualCheckedCourses, setManualCheckedCourses] = useState<{ [cursoId: string]: boolean }>({});

  const handleManualFileChange = async (cursoId: string, file: File | null) => {
    if (!file) {
      setManualFiles(prev => {
        const copy = { ...prev };
        delete copy[cursoId];
        return copy;
      });
      return;
    }

    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      setManualFiles(prev => ({
        ...prev,
        [cursoId]: {
          fileName: file.name,
          fileBase64
        }
      }));
    } catch (err) {
      console.error("Erro ao converter arquivo de certificado manual para base64:", err);
      customAlert("Erro ao carregar arquivo de certificado.");
    }
  };

  const handleManualHomologate = async (curso: Curso) => {
    if (!manualSelectedMatricula) {
      customAlert("Por favor, selecione um colaborador antes!");
      return;
    }

    const colab = colaboradores.find(c => c.matricula === manualSelectedMatricula);
    if (!colab) {
      customAlert("Colaborador não encontrado.");
      return;
    }

    const completionDate = manualCompletionDates[curso.id] || new Date().toISOString().split('T')[0];
    const fileData = manualFiles[curso.id];

    const certId = `CERT-MAN-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const newCert: CertificadoCurso = {
      id: certId,
      colaboradorMatricula: colab.matricula,
      colaboradorNome: colab.nome,
      cursoId: curso.id,
      cursoNome: curso.nome,
      dataConclusao: completionDate,
      origem: "Homologação Manual (Sem IA)",
      dataCriacao: new Date().toISOString().split('T')[0],
      fileName: fileData ? fileData.fileName : undefined,
      fileBase64: fileData ? fileData.fileBase64 : undefined
    };

    try {
      await saveDocument('universidade_certificados', certId, newCert);
      setCertificados(prev => [newCert, ...prev]);
      
      // Clean up inputs for this specific course
      setManualFiles(prev => {
        const copy = { ...prev };
        delete copy[curso.id];
        return copy;
      });
      setManualCompletionDates(prev => {
        const copy = { ...prev };
        delete copy[curso.id];
        return copy;
      });
      setManualCheckedCourses(prev => {
        const copy = { ...prev };
        delete copy[curso.id];
        return copy;
      });

      customAlert(`Sucesso!\n\nCurso "${curso.nome}" homologado manualmente com sucesso para o colaborador ${colab.nome}.`);
    } catch (err) {
      console.error("Erro ao salvar certificado manual:", err);
      customAlert("Erro ao salvar homologação.");
    }
  };

  const handleManualBulkHomologate = async () => {
    if (!manualSelectedMatricula) {
      customAlert("Por favor, selecione um colaborador antes!");
      return;
    }

    const colab = colaboradores.find(c => c.matricula === manualSelectedMatricula);
    if (!colab) {
      customAlert("Colaborador não encontrado.");
      return;
    }

    // Get checked courses
    const checkedCourseIds = Object.keys(manualCheckedCourses).filter(id => manualCheckedCourses[id]);
    if (checkedCourseIds.length === 0) {
      customAlert("Selecione pelo menos um curso para homologar em lote!");
      return;
    }

    let successCount = 0;
    for (const cursoId of checkedCourseIds) {
      const curso = cursos.find(c => c.id === cursoId);
      if (!curso) continue;

      const completionDate = manualCompletionDates[cursoId] || new Date().toISOString().split('T')[0];
      const fileData = manualFiles[cursoId];

      const certId = `CERT-MAN-${Date.now()}-${successCount}-${Math.random().toString(36).substr(2, 4)}`;
      const newCert: CertificadoCurso = {
        id: certId,
        colaboradorMatricula: colab.matricula,
        colaboradorNome: colab.nome,
        cursoId: curso.id,
        cursoNome: curso.nome,
        dataConclusao: completionDate,
        origem: "Homologação Manual (Sem IA)",
        dataCriacao: new Date().toISOString().split('T')[0],
        fileName: fileData ? fileData.fileName : undefined,
        fileBase64: fileData ? fileData.fileBase64 : undefined
      };

      try {
        await saveDocument('universidade_certificados', certId, newCert);
        setCertificados(prev => [newCert, ...prev]);
        successCount++;
      } catch (err) {
        console.error(`Erro ao salvar certificado manual em lote para ${cursoId}:`, err);
      }
    }

    // Clean up inputs for checked courses
    setManualFiles(prev => {
      const copy = { ...prev };
      checkedCourseIds.forEach(id => delete copy[id]);
      return copy;
    });
    setManualCompletionDates(prev => {
      const copy = { ...prev };
      checkedCourseIds.forEach(id => delete copy[id]);
      return copy;
    });
    setManualCheckedCourses({});

    customAlert(`Sucesso!\n\n${successCount} curso(s) homologado(s) manualmente com sucesso para o colaborador ${colab.nome}.`);
  };

  // AI FILE UPLOAD STATES (MULTIPLES FILES & DRAG-AND-DROP IN TUTORIAL MODE)
  interface BatchCertFileDraft {
    id: string;
    fileName: string;
    status: 'processando' | 'sucesso' | 'erro';
    errorMsg?: string;
    colaboradorOriginal?: string;
    matchedMatricula: string;
    cursoOriginal?: string;
    matchedCourseId: string;
    dataConclusao: string;
    fileBase64?: string;
    mimeType?: string;
  }

  const [batchFileDrafts, setBatchFileDrafts] = useState<BatchCertFileDraft[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI TEXT PASTE STATES
  const [pastedText, setPastedText] = useState('');
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [extractedTextList, setExtractedTextList] = useState<any[]>([]);
  const [errorTextMsg, setErrorTextMsg] = useState('');

  // Course filter states
  const [courseSearch, setCourseSearch] = useState('');
  const [certSearch, setCertSearch] = useState('');

  // Dashboard filter states
  const [dashSearchColab, setDashSearchColab] = useState('');
  const [dashFilterSetor, setDashFilterSetor] = useState('');
  const [dashFilterTurno, setDashFilterTurno] = useState('');
  const [manualColabSearch, setManualColabSearch] = useState('');

  // Saven Handler Course
  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseNome.trim()) {
      customAlert("O nome do curso é obrigatório!");
      return;
    }

    const finalTargets: CourseTarget[] = Object.keys(newCourseTargets)
      .filter(cargo => newCourseTargets[cargo].selected)
      .map(cargo => ({
        cargo,
        obrigatorio: newCourseTargets[cargo].obrigatorio
      }));

    if (editingCourseId) {
      // Editing Mode
      const updatedCurso: Curso = {
        id: editingCourseId,
        nome: newCourseNome.trim(),
        descricao: newCourseDesc.trim(),
        targets: finalTargets,
        dataCriacao: cursos.find(c => c.id === editingCourseId)?.dataCriacao || new Date().toISOString().split('T')[0]
      };

      try {
        await saveDocument('universidade_cursos', updatedCurso.id, updatedCurso);
        setCursos(prev => prev.map(c => c.id === editingCourseId ? updatedCurso : c));
        setIsAddingCourse(false);
        setEditingCourseId(null);
        setNewCourseNome('');
        setNewCourseDesc('');
        // reset targets state
        const initial: { [cargo: string]: { selected: boolean; obrigatorio: boolean } } = {};
        CARGOS_ENFERMAGEM.forEach(c => {
          initial[c] = { selected: false, obrigatorio: false };
        });
        setNewCourseTargets(initial);
        customAlert("Curso atualizado com sucesso!");
      } catch (err) {
        console.error(err);
        customAlert("Erro ao atualizar curso no banco.");
      }
    } else {
      // Creation Mode
      const newCurso: Curso = {
        id: `CUR-${Date.now()}`,
        nome: newCourseNome.trim(),
        descricao: newCourseDesc.trim(),
        targets: finalTargets,
        dataCriacao: new Date().toISOString().split('T')[0]
      };

      try {
        await saveDocument('universidade_cursos', newCurso.id, newCurso);
        setCursos(prev => [newCurso, ...prev]);
        setIsAddingCourse(false);
        setNewCourseNome('');
        setNewCourseDesc('');
        // reset targets state
        const initial: { [cargo: string]: { selected: boolean; obrigatorio: boolean } } = {};
        CARGOS_ENFERMAGEM.forEach(c => {
          initial[c] = { selected: false, obrigatorio: false };
        });
        setNewCourseTargets(initial);
        customAlert("Curso cadastrado com sucesso!");
      } catch (err) {
        console.error(err);
        customAlert("Erro ao salvar curso no banco.");
      }
    }
  };

  // Helper: Edit course
  const handleEditCourse = (curso: Curso) => {
    setEditingCourseId(curso.id);
    setNewCourseNome(curso.nome);
    setNewCourseDesc(curso.descricao || '');
    
    // Set targets for form
    const initial: { [cargo: string]: { selected: boolean; obrigatorio: boolean } } = {};
    CARGOS_ENFERMAGEM.forEach(c => {
      const match = curso.targets.find(t => t.cargo === c);
      initial[c] = { 
        selected: !!match, 
        obrigatorio: match ? match.obrigatorio : false 
      };
    });
    setNewCourseTargets(initial);
    setIsAddingCourse(true);
    
    // Scroll smoothly to form
    setTimeout(() => {
      document.getElementById('course-form-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Helper: Delete course
  const handleDeleteCourse = async (courseId: string) => {
    const confirm = await customConfirm("Deseja realmente remover este curso da universidade corporativa?");
    if (!confirm) return;

    try {
      await removeDocument('universidade_cursos', courseId);
      const cleanList = cursos.filter(c => c.id !== courseId);
      setCursos(cleanList);
      localStorage.setItem('hnsr_universidade_cursos_db', JSON.stringify(cleanList));
      customAlert("Curso removido com sucesso.");
    } catch (err) {
      console.error(err);
      customAlert("Erro ao remover curso do banco.");
    }
  };

  // Helper: Clean and Reset Course Database to default mock standard courses
  const handleResetCoursesDatabase = async () => {
    const confirm = await customConfirm("ATENÇÃO: Deseja realmente LIMPAR e corrigr o banco de dados de cursos? Todos os cursos personalizados serão excluídos e os cursos padrão clínicos do HNSR serão restaurados.");
    if (!confirm) return;

    try {
      // 1. Delete all current courses from Firestore & localStorage backup
      for (const curso of cursos) {
        await removeDocument('universidade_cursos', curso.id);
      }

      // 2. Clear local storage backup completely
      localStorage.removeItem('hnsr_universidade_cursos_db');

      // 3. Write standard clinical mock courses to Firestore
      for (const item of CURSOS_INICIAIS) {
        await saveDocument('universidade_cursos', item.id, item);
      }

      // 4. Update local state
      setCursos(CURSOS_INICIAIS);
      localStorage.setItem('hnsr_universidade_cursos_db', JSON.stringify(CURSOS_INICIAIS));

      customAlert("Banco de dados de cursos limpo e corrigido com sucesso!");
    } catch (err) {
      console.error("Erro ao resetar banco de dados de cursos:", err);
      customAlert("Erro ao limpar e resetar o banco de dados de cursos.");
    }
  };

  // PROCESS BATCH CERTIFICATE FILES UPLOAD & EXTRACTION via Gemini
  const handleBatchFilesUpload = async (files: FileList | File[]) => {
    const filesArray = Array.from(files);
    if (filesArray.length === 0) return;

    // Create initial drafts with "processando" state
    const newDrafts: BatchCertFileDraft[] = filesArray.map((file, idx) => ({
      id: `draft-cert-file-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      fileName: file.name,
      status: 'processando',
      matchedMatricula: '',
      matchedCourseId: '',
      dataConclusao: new Date().toISOString().split('T')[0]
    }));

    // Prepend new drafts so the user sees the latest files first
    setBatchFileDrafts(prev => [...newDrafts, ...prev]);

    // Send each file to the API concurrently
    filesArray.forEach(async (file, idx) => {
      const draftId = newDrafts[idx].id;

      try {
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });

        const mimeType = file.type || 'application/pdf';

        // Store fileBase64 and mimeType on the draft immediately so it can be retried later if it fails
        setBatchFileDrafts(prev => prev.map(d => 
          d.id === draftId ? { ...d, fileBase64, mimeType } : d
        ));

        const res = await fetch('/api/universidade/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64,
            mimeType
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || "Falha ao analisar o arquivo na IA.");
        }

        const parsed = await res.json();
        const matchedColab = findColaboradorByName(parsed.colaborador_nome_original);
        const matchedCurId = findCourseByName(parsed.curso_nome);

        setBatchFileDrafts(prev => prev.map(d => {
          if (d.id === draftId) {
            return {
              ...d,
              status: 'sucesso',
              colaboradorOriginal: parsed.colaborador_nome_original || 'Não identificado',
              matchedMatricula: matchedColab ? matchedColab.matricula : '',
              cursoOriginal: parsed.curso_nome || 'Não identificado',
              matchedCourseId: matchedCurId || '',
              dataConclusao: parsed.data_conclusao || new Date().toISOString().split('T')[0]
            };
          }
          return d;
        }));

      } catch (err: any) {
        console.error(err);
        setBatchFileDrafts(prev => prev.map(d => {
          if (d.id === draftId) {
            return {
              ...d,
              status: 'erro',
              errorMsg: err.message || 'Erro semântico ou de leitura por IA.'
            };
          }
          return d;
        }));
      }
    });

    // Clear file input so same files can be re-selected if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // RETRY SINGLE DRAFT EXTRACTION WITH AI
  const handleRetryDraftExtraction = async (draftId: string) => {
    const draft = batchFileDrafts.find(d => d.id === draftId);
    if (!draft || !draft.fileBase64) {
      customAlert("Não foi possível recuperar os dados do arquivo para reprocessamento.");
      return;
    }

    setBatchFileDrafts(prev => prev.map(d => 
      d.id === draftId ? { ...d, status: 'processando', errorMsg: undefined } : d
    ));

    try {
      const res = await fetch('/api/universidade/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: draft.fileBase64,
          mimeType: draft.mimeType || 'application/pdf'
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || "Falha ao analisar o arquivo na IA.");
      }

      const parsed = await res.json();
      const matchedColab = findColaboradorByName(parsed.colaborador_nome_original);
      const matchedCurId = findCourseByName(parsed.curso_nome);

      setBatchFileDrafts(prev => prev.map(d => {
        if (d.id === draftId) {
          return {
            ...d,
            status: 'sucesso',
            colaboradorOriginal: parsed.colaborador_nome_original || 'Não identificado',
            matchedMatricula: matchedColab ? matchedColab.matricula : '',
            cursoOriginal: parsed.curso_nome || 'Não identificado',
            matchedCourseId: matchedCurId || '',
            dataConclusao: parsed.data_conclusao || new Date().toISOString().split('T')[0]
          };
        }
        return d;
      }));
    } catch (err: any) {
      console.error(err);
      setBatchFileDrafts(prev => prev.map(d => {
        if (d.id === draftId) {
          return {
            ...d,
            status: 'erro',
            errorMsg: err.message || 'Erro semântico ou de leitura por IA.'
          };
        }
        return d;
      }));
    }
  };

  // PROCESS PASTED TEXT INGESTION
  const handleTextExtract = async () => {
    if (!pastedText.trim()) {
      customAlert("Por favor, cole um texto com dados para extrair!");
      return;
    }

    setIsExtractingText(true);
    setExtractedTextList([]);
    setErrorTextMsg('');

    try {
      const res = await fetch('/api/universidade/extract-text-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textContent: pastedText })
      });

      if (!res.ok) {
        throw new Error("Falha na interpretação da Inteligência Artificial.");
      }

      const listResult = await res.json();
      if (!Array.isArray(listResult)) {
        throw new Error("O servidor retornou uma resposta em formato inválido.");
      }

      const mapped = listResult.map((item: any, idx: number) => {
        const matched = findColaboradorByName(item.colaborador_nome_original);
        return {
          id: `EXT-${idx}-${Date.now()}`,
          colaborador_nome_original: item.colaborador_nome_original,
          matchedMatricula: matched ? matched.matricula : '',
          matchedNome: matched ? matched.nome : item.colaborador_nome_original,
          cursoId: findCourseByName(item.curso_nome),
          curso_nome_original: item.curso_nome,
          dataConclusao: item.data_conclusao || new Date().toISOString().split('T')[0],
          selected: true
        };
      });

      setExtractedTextList(mapped);
      if (mapped.length === 0) {
        customAlert("Nenhum certificado foi identificado no texto colado.");
      }
    } catch (err: any) {
      setErrorTextMsg(err.message || "Erro desconhecido ao processar texto com a IA.");
    } finally {
      setIsExtractingText(false);
    }
  };

  // Helper matching tools
  const normalizeText = (text: string): string => {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents/diacritics
      .replace(/[®™•°ºª§]/g, '') // Remove trademark and other special symbols
      .replace(/[-–—]/g, ' ') // Convert all kinds of hyphens/dashes to space
      .replace(/[^\w\s]/g, ' ') // Replace other punctuation with space
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  };

  const findColaboradorByName = (originalName: string): Colaborador | null => {
    if (!originalName || colaboradores.length === 0) return null;
    const normOrig = normalizeText(originalName);

    // 1. Exact match on normalized strings
    const exact = colaboradores.find(c => normalizeText(c.nome) === normOrig);
    if (exact) return exact;

    // 2. Substring/inclusion match
    const incl = colaboradores.find(c => {
      const normCol = normalizeText(c.nome);
      return normCol.includes(normOrig) || normOrig.includes(normCol);
    });
    if (incl) return incl;

    // 3. Score-based matching on split words of length > 2
    const origWords = normOrig.split(' ').filter(w => w.length > 2);
    if (origWords.length > 0) {
      let bestColab: Colaborador | null = null;
      let maxScore = 0;
      for (const c of colaboradores) {
        const colabWords = normalizeText(c.nome).split(' ').filter(w => w.length > 2);
        const score = origWords.filter(w => colabWords.includes(w)).length;
        if (score > maxScore) {
          maxScore = score;
          bestColab = c;
        }
      }
      // Require at least 2 words to match to avoid false positive first name matches
      if (maxScore >= 2) {
        return bestColab;
      }
    }

    return null;
  };

  const findCourseByName = (originalCourse: string): string => {
    if (!originalCourse || cursos.length === 0) return '';
    const normOrig = normalizeText(originalCourse);

    // 1. Exact match on normalized strings
    const exact = cursos.find(c => normalizeText(c.nome) === normOrig);
    if (exact) return exact.id;

    // 2. Inclusion match on normalized strings
    const incl = cursos.find(c => {
      const normCur = normalizeText(c.nome);
      return normCur.includes(normOrig) || normOrig.includes(normCur);
    });
    if (incl) return incl.id;

    // 3. Fallback: Word overlap matching for slightly modified titles
    const origWords = normOrig.split(' ').filter(w => w.length > 2);
    if (origWords.length > 0) {
      let bestMatch: string = '';
      let maxScore = 0;
      for (const cur of cursos) {
        const curWords = normalizeText(cur.nome).split(' ').filter(w => w.length > 2);
        const score = origWords.filter(w => curWords.includes(w)).length;
        if (score > maxScore) {
          maxScore = score;
          bestMatch = cur.id;
        }
      }
      // Require at least 2 words to match, or 1 word if it's the only word in input
      if (maxScore >= 2 || (maxScore >= 1 && origWords.length === 1)) {
        return bestMatch;
      }
    }

    return '';
  };

  // SAVE THE MANUALLY ADJUSTED FILE DRAFTS TO FIRESTORE
  const handleSaveBatchFileCertificates = async () => {
    const successDrafts = batchFileDrafts.filter(d => d.status === 'sucesso');
    if (successDrafts.length === 0) {
      customAlert("Não há certificados processados com sucesso para homologação no lote atual!");
      return;
    }

    const unassigned = successDrafts.find(d => !d.matchedMatricula || !d.matchedCourseId);
    if (unassigned) {
      customAlert(`O certificado extraído do arquivo "${unassigned.fileName}" precisa ter um colaborador e um curso selecionados!`);
      return;
    }

    let successes = 0;
    for (const draft of successDrafts) {
      const colab = colaboradores.find(c => c.matricula === draft.matchedMatricula);
      const curso = cursos.find(c => c.id === draft.matchedCourseId);

      if (colab && curso) {
        const newCert: CertificadoCurso = {
          id: `CERT-${Date.now()}-${successes}-${Math.random().toString(36).substr(2, 3)}`,
          colaboradorMatricula: colab.matricula,
          colaboradorNome: colab.nome,
          cursoId: curso.id,
          cursoNome: curso.nome,
          dataConclusao: draft.dataConclusao || new Date().toISOString().split('T')[0],
          origem: "Upload de Certificado (IA)",
          dataCriacao: new Date().toISOString().split('T')[0]
        };

        try {
          await saveDocument('universidade_certificados', newCert.id, newCert);
          setCertificados(prev => [newCert, ...prev]);
          successes++;
        } catch (err) {
          console.error("Erro ao salvar certificado do lote de arquivos:", err);
        }
      }
    }

    // Filter out successfully saved drafts, leaving only error ones or resetting
    setBatchFileDrafts(prev => prev.filter(d => d.status !== 'sucesso'));
    customAlert(`${successes} certificados foram homologados e vinculados com sucesso!`);
  };

  const handleRemoveFileDraft = (id: string) => {
    setBatchFileDrafts(prev => prev.filter(d => d.id !== id));
  };

  const handleClearFileDraftsList = () => {
    setBatchFileDrafts([]);
  };

  // SAVE TEXT LIST EXTRACT LOGS
  const handleSaveTextListCertificates = async () => {
    const selectedItems = extractedTextList.filter(item => item.selected);
    if (selectedItems.length === 0) {
      customAlert("Selecione pelo menos um certificado válido da lista para salvar!");
      return;
    }

    // Verify all selected have a valid collaborator and course
    const invalidItem = selectedItems.find(item => !item.matchedMatricula || !item.cursoId);
    if (invalidItem) {
      customAlert(`O registro de "${invalidItem.colaborador_nome_original}" ainda está com colaborador ou curso não definido!`);
      return;
    }

    let successes = 0;
    for (const item of selectedItems) {
      const colab = colaboradores.find(c => c.matricula === item.matchedMatricula);
      const curso = cursos.find(c => c.id === item.cursoId);
      
      if (colab && curso) {
        const newCert: CertificadoCurso = {
          id: `CERT-${Date.now()}-${successes}`,
          colaboradorMatricula: colab.matricula,
          colaboradorNome: colab.nome,
          cursoId: curso.id,
          cursoNome: curso.nome,
          dataConclusao: item.dataConclusao || new Date().toISOString().split('T')[0],
          origem: "Cópia de Lista (IA)",
          dataCriacao: new Date().toISOString().split('T')[0]
        };

        try {
          await saveDocument('universidade_certificados', newCert.id, newCert);
          setCertificados(prev => [newCert, ...prev]);
          successes++;
        } catch (err) {
          console.error("Erro ao salvar um dos cursos em lote:", err);
        }
      }
    }

    setExtractedTextList([]);
    setPastedText('');
    customAlert(`${successes} certificados em lote foram homologados e integrados com sucesso ao sistema!`);
  };

  // Helper Delete Certificate
  const handleDeleteCert = async (certId: string) => {
    const confirm = await customConfirm("Deseja realmente excluir este certificado do sistema?");
    if (!confirm) return;

    try {
      await removeDocument('universidade_certificados', certId);
      const cleanList = certificados.filter(c => c.id !== certId);
      setCertificados(cleanList);
      localStorage.setItem('hnsr_universidade_certificados_db', JSON.stringify(cleanList));
      customAlert("Certificado removido do prontuário com sucesso.");
    } catch (err) {
      console.error(err);
      customAlert("Erro ao excluir certificado do banco.");
    }
  };


  // ==========================================
  // MATHEMATICAL METAPROCESSOR: CALCULATE MATHS
  // ==========================================

  // Filter collaborateurs who are active in the system
  const activeColaboradores = colaboradores.filter(c => {
    if (c.datarecisao) return false;
    if (allowedMatriculas && !allowedMatriculas.has(c.matricula)) return false;
    return true;
  });

  // Computes progress for a single collaborator
  const getColaboradorProgress = (colab: Colaborador): { pct: number; completedCount: number; requiredCount: number } => {
    // 1. Find all mandatory courses applicable to this collaborator's position/cargo
    const mandatoryCourses = cursos.filter(curso => 
      curso.targets.some(t => t.cargo === colab.cargo && t.obrigatorio)
    );

    if (mandatoryCourses.length === 0) {
      return { pct: 100, completedCount: 0, requiredCount: 0 };
    }

    // 2. Out of these mandatory courses, find how many are registered completed in certificados
    const completedRequired = certificados.filter(cert => 
      cert.colaboradorMatricula === colab.matricula && 
      mandatoryCourses.some(mc => mc.id === cert.cursoId)
    );

    const pct = Math.min(100, Math.round((completedRequired.length / mandatoryCourses.length) * 100));
    return {
      pct,
      completedCount: completedRequired.length,
      requiredCount: mandatoryCourses.length
    };
  };

  // Filtered list of collaborators for the dashboard
  const dashboardColaboradores = activeColaboradores.filter(colab => {
    if (dashSearchColab) {
      const s = dashSearchColab.toLowerCase();
      const nameMatch = colab.nome.toLowerCase().includes(s);
      const matMatch = colab.matricula.toLowerCase().includes(s);
      const cargoMatch = colab.cargo.toLowerCase().includes(s);
      if (!nameMatch && !matMatch && !cargoMatch) return false;
    }
    if (dashFilterSetor) {
      if (colab.setor !== dashFilterSetor) return false;
    }
    if (dashFilterTurno) {
      if (colab.equipe !== dashFilterTurno) return false;
    }
    return true;
  });

  // Overall completion average %
  const getOverallProgress = (): number => {
    if (dashboardColaboradores.length === 0) return 0;
    let sum = 0;
    dashboardColaboradores.forEach(c => {
      sum += getColaboradorProgress(c).pct;
    });
    return Math.round(sum / dashboardColaboradores.length);
  };

  const checkCurrentlyINSS = (c: Colaborador): boolean => {
    const hoje = new Date().toISOString().split('T')[0];
    if (c.inss_check === 'Sim') {
      const hasRetorno = c.inss_retorno && c.inss_retorno.trim() !== '';
      if (!hasRetorno || hoje < c.inss_retorno) {
        return true;
      }
    }
    return false;
  };

  const checkCurrentlyOnVacation = (c: Colaborador): boolean => {
    const hoje = new Date().toISOString().split('T')[0];
    return (ferias || []).some(f => 
      f.matricula === c.matricula &&
      f.status === 'Aprovado' &&
      hoje >= f.dataInicio &&
      hoje <= f.dataFim
    );
  };

  // Real active compliance adhesion (excluding INSS and vacation)
  const getAdhesionProgress = (): { pct: number; workingCount: number; inssCount: number; feriasCount: number } => {
    const inssCount = activeColaboradores.filter(checkCurrentlyINSS).length;
    const feriasCount = activeColaboradores.filter(checkCurrentlyOnVacation).length;

    const workingColabs = activeColaboradores.filter(c => !checkCurrentlyINSS(c) && !checkCurrentlyOnVacation(c));
    
    if (workingColabs.length === 0) {
      return { pct: 0, workingCount: 0, inssCount, feriasCount };
    }

    let sum = 0;
    workingColabs.forEach(c => {
      sum += getColaboradorProgress(c).pct;
    });
    
    const pct = Math.round(sum / workingColabs.length);
    return {
      pct,
      workingCount: workingColabs.length,
      inssCount,
      feriasCount
    };
  };

  // Progress by turno / equipe
  const getProgressByTurno = (): { name: string; pct: number; count: number }[] => {
    const turnos = EQUIPES_ESCALA;
    return turnos.map(turno => {
      const colabs = activeColaboradores.filter(c => c.equipe === turno);
      if (colabs.length === 0) return { name: turno, pct: 0, count: 0 };
      const sum = colabs.reduce((acc, c) => acc + getColaboradorProgress(c).pct, 0);
      return {
        name: turno,
        pct: Math.round(sum / colabs.length),
        count: colabs.length
      };
    });
  };

  // Progress by sector groups:
  // PS (PSA e PSI); UTI (UTI 7º andar e UTI 9º andar); UI (2, 3, 4, 5 e 6º andar) e CC (CC e CME)
  const getProgressBySectorGroup = (): { id: string; name: string; description: string; pct: number; count: number }[] => {
    const groups = [
      { 
        id: 'PS', 
        name: 'Pronto Socorro (PS)', 
        description: 'PSA e PSI', 
        filter: (s: string) => {
          const u = s.toUpperCase();
          return u === 'PSA' || u === 'PSI' || u.includes('PRONTO') || u.includes('PS');
        } 
      },
      { 
        id: 'UTI', 
        name: 'Unidade de Terapia Intensiva (UTI)', 
        description: 'UTI 7º andar e UTI 9º andar', 
        filter: (s: string) => {
          const u = s.toUpperCase();
          return u.includes('7º ANDAR') || u.includes('9º ANDAR') || u.includes('UTI');
        }
      },
      { 
        id: 'UI', 
        name: 'Unidades de Internação (UI)', 
        description: '2º, 3º, 4º, 5º e 6º andar', 
        filter: (s: string) => {
          const u = s.toUpperCase();
          return u.includes('2º ANDAR') || u.includes('3º ANDAR') || u.includes('4º ANDAR') || u.includes('5º ANDAR') || u.includes('6º ANDAR') || u.includes('UI') || u.includes('FOLGUISTA UI');
        }
      },
      { 
        id: 'CC', 
        name: 'Centro Cirúrgico e CME (CC)', 
        description: 'CC e CME', 
        filter: (s: string) => {
          const u = s.toUpperCase();
          return u === 'CENTRO CIRURGICO' || u === 'CME' || u.includes('CIRURG') || u.includes('CME');
        }
      }
    ];

    return groups.map(g => {
      const colabs = activeColaboradores.filter(c => g.filter(c.setor));
      if (colabs.length === 0) return { id: g.id, name: g.name, description: g.description, pct: 0, count: 0 };
      const sum = colabs.reduce((acc, c) => acc + getColaboradorProgress(c).pct, 0);
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        pct: Math.round(sum / colabs.length),
        count: colabs.length
      };
    });
  };

  // Filtration arrays
  const filteredCursos = cursos.filter(c => 
    c.nome.toLowerCase().includes(courseSearch.toLowerCase()) ||
    (c.descricao && c.descricao.toLowerCase().includes(courseSearch.toLowerCase()))
  );

  const filteredCertificados = certificados.filter(cert => {
    if (allowedMatriculas && !allowedMatriculas.has(cert.colaboradorMatricula)) {
      return false;
    }
    return cert.colaboradorNome.toLowerCase().includes(certSearch.toLowerCase()) ||
      cert.cursoNome.toLowerCase().includes(certSearch.toLowerCase()) ||
      cert.colaboradorMatricula.includes(certSearch);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1 text-slate-800">
      
      {/* Header com Design High-End */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex items-center gap-3">
          <div className="bg-sky-50 text-sky-600 p-3.5 rounded-2xl border border-sky-100 shadow-md">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Universidade Corporativa HNSR</h1>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Gestão de cursos regulamentares, homologações via IA e relatórios de conformidade.</p>
          </div>
        </div>

        {/* Botoes Laterais */}
        {!isEnfermeiroProfile && (
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => { setActiveTab('cursos'); setIsAddingCourse(true); }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition border border-slate-950 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Inserir Novo Curso</span>
            </button>
            
            <button
              onClick={() => setActiveTab('certificados')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-sky-600/10 transition border border-sky-500 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Importação de Certificados</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1 bg-slate-100/60 p-1 rounded-2xl max-w-xl print:hidden">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold transition cursor-pointer text-center ${
            activeTab === 'dashboard' 
              ? 'bg-white text-slate-900 shadow-xs' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
          }`}
        >
          Estatísticas & Dash
        </button>
        <button
          onClick={() => setActiveTab('cursos')}
          className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold transition cursor-pointer text-center ${
            activeTab === 'cursos' 
              ? 'bg-white text-slate-900 shadow-xs' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
          }`}
        >
          Cursos Disponíveis ({cursos.length})
        </button>
        <button
          onClick={() => setActiveTab('certificados')}
          className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold transition cursor-pointer text-center ${
            activeTab === 'certificados' 
              ? 'bg-white text-slate-900 shadow-xs' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
          }`}
        >
          Homologações ({certificados.length})
        </button>
        <button
          onClick={() => setActiveTab('relatorios')}
          className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold transition cursor-pointer text-center ${
            activeTab === 'relatorios' 
              ? 'bg-white text-slate-900 shadow-xs' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
          }`}
        >
          Relatório de Cursos
        </button>
      </div>

      {/* RENDER CONTENT PANELS */}
      <div className="mt-4">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="univ-dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Top Summary Widgets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* Total de Concluídos Geral */}
                <div className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between shadow-xs relative overflow-hidden">
                  <div className="space-y-1 z-10">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Aproveitamento Geral</span>
                    <h3 className="text-3xl font-black text-slate-950">{getOverallProgress()}%</h3>
                    <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Conformidade Média</span>
                    </p>
                  </div>
                  {/* Circular progress meter */}
                  <div className="relative w-16 h-16 flex items-center justify-center z-10">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="32" cy="32" r="28" className="stroke-slate-100" strokeWidth="5" fill="transparent" />
                      <circle 
                        cx="32" cy="32" r="28" 
                        className="stroke-sky-500" strokeWidth="5.5" fill="transparent"
                        strokeDasharray={2 * Math.PI * 28}
                        strokeDashoffset={(2 * Math.PI * 28) * (1 - getOverallProgress() / 100)}
                      />
                    </svg>
                    <span className="absolute text-[11px] font-black text-slate-800">{getOverallProgress()}%</span>
                  </div>
                </div>

                {/* Porcentagem de Adesão (Ativos Sem Férias / INSS) */}
                <div className="bg-emerald-50/40 border border-emerald-250 rounded-3xl p-5 flex items-center justify-between shadow-xs relative overflow-hidden">
                  <div className="space-y-1 z-10">
                    <span className="text-[10px] text-emerald-800 font-black uppercase tracking-widest">Adesão Real (Ativos)</span>
                    <h3 className="text-3xl font-black text-emerald-950">{getAdhesionProgress().pct}%</h3>
                    <div className="text-[9px] text-slate-500 font-bold leading-tight">
                      <p>Ativos: <span className="text-emerald-800 font-black">{getAdhesionProgress().workingCount} profs</span></p>
                      <p className="text-[9px] text-slate-400 font-medium">
                        Excluídos: {getAdhesionProgress().feriasCount} Férias | {getAdhesionProgress().inssCount} INSS
                      </p>
                    </div>
                  </div>
                  {/* Circular progress meter */}
                  <div className="relative w-16 h-16 flex items-center justify-center z-10">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="32" cy="32" r="28" className="stroke-emerald-100" strokeWidth="5" fill="transparent" />
                      <circle 
                        cx="32" cy="32" r="28" 
                        className="stroke-emerald-600" strokeWidth="5.5" fill="transparent"
                        strokeDasharray={2 * Math.PI * 28}
                        strokeDashoffset={(2 * Math.PI * 28) * (1 - getAdhesionProgress().pct / 100)}
                      />
                    </svg>
                    <span className="absolute text-[11px] font-black text-emerald-800">{getAdhesionProgress().pct}%</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between shadow-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Cursos Regulamentares</span>
                    <h3 className="text-3xl font-black text-slate-950">{cursos.length}</h3>
                    <p className="text-[10px] text-slate-500 font-semibold">Programas de treinamento ativos</p>
                  </div>
                  <div className="bg-slate-50 text-slate-600 p-3 rounded-2xl">
                    <BookOpen className="w-5.5 h-5.5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between shadow-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Log de Certificados</span>
                    <h3 className="text-3xl font-black text-sky-600">{certificados.length}</h3>
                    <p className="text-[10px] text-slate-500 font-semibold">Envios homologados no sistema</p>
                  </div>
                  <div className="bg-sky-50 text-sky-600 p-3 rounded-2xl">
                    <Award className="w-5.5 h-5.5" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between shadow-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest text-[#cf1515]">Auditório Regulado</span>
                    <h3 className="text-3xl font-black text-slate-900">{dashboardColaboradores.length}</h3>
                    <p className="text-[10px] text-slate-500 font-semibold">Profissionais sob monitoramento</p>
                  </div>
                  <div className="bg-orange-50 text-orange-600 p-3 rounded-2xl">
                    <Users className="w-5.5 h-5.5" />
                  </div>
                </div>

              </div>

              {/* DASHBOARD SEARCH & FILTERS */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Buscar Colaborador
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Nome, matrícula ou cargo..."
                      value={dashSearchColab}
                      onChange={(e) => setDashSearchColab(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 hover:border-slate-305 pl-9 pr-8 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                    />
                    {dashSearchColab && (
                      <button 
                        type="button"
                        onClick={() => setDashSearchColab('')}
                        className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 font-black cursor-pointer text-sm"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Filtrar por Setor
                  </label>
                  <div className="relative">
                    <select
                      value={dashFilterSetor}
                      onChange={(e) => setDashFilterSetor(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 hover:border-slate-305 px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold appearance-none cursor-pointer"
                    >
                      <option value="">Todos os Setores</option>
                      {SETORES_HOSPITALARES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-3.5 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-500 pointer-events-none"></div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Filtrar por Turno
                  </label>
                  <div className="relative">
                    <select
                      value={dashFilterTurno}
                      onChange={(e) => setDashFilterTurno(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 hover:border-slate-305 px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold appearance-none cursor-pointer"
                    >
                      <option value="">Todos os Turnos</option>
                      {EQUIPES_ESCALA.map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-3.5 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-500 pointer-events-none"></div>
                  </div>
                </div>
              </div>

              {/* POR SETOR REQUISITADO */}
              {/* PS (PSA e PSI); UTI (UTI 7º andar e UTI 9º andar); UI (2, 3, 4, 5 e 6º andar) e CC (CC e CME) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. SECTOR PERCENTAGE BREAKDOWNS - EXTREMELY SPECIALIZED! */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Aproveitamento Médio por Setor</h3>
                    <p className="text-[11px] text-slate-500 font-semibold">Agrupamento específico conforme protocolo de conformidade clínica.</p>
                  </div>

                  <div className="space-y-4">
                    {getProgressBySectorGroup().map((grp) => (
                      <div key={grp.id} className="space-y-1.5">
                        <div className="flex justify-between items-end">
                          <div>
                            <span className="text-xs font-black text-slate-800">{grp.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold ml-1.5 italic">({grp.description})</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-sky-600">{grp.pct}%</span>
                            <span className="text-[10px] text-slate-400 font-medium ml-1">({grp.count} colabs)</span>
                          </div>
                        </div>
                        {/* Progress Bar Layout */}
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              grp.pct >= 90 ? 'bg-emerald-500' :
                              grp.pct >= 50 ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`}
                            style={{ width: `${grp.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. TURNO PERCENTAGE BREAKDOWNS */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Homologações por Turno de Trabalho</h3>
                    <p className="text-[11px] text-slate-500 font-semibold">Índices de capacitação segmentados pelas equipes da escala hospitalar.</p>
                  </div>

                  <div className="space-y-4">
                    {getProgressByTurno().map((trn, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between items-end">
                          <div>
                            <span className="text-xs font-black text-slate-800">{trn.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-900">{trn.pct}%</span>
                            <span className="text-[10px] text-slate-400 font-medium ml-1">({trn.count} ativos)</span>
                          </div>
                        </div>
                        {/* Custom progress color based on score */}
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-slate-700 rounded-full transition-all duration-300"
                            style={{ width: `${trn.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Colab rankings and checklist */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                <div className="p-6 border-b border-secondary/10 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Status Individual de Capacitação</h3>
                    <p className="text-[11px] text-slate-500 font-semibold">Nível geral de conformidade com cursos recomendados e mandatórios.</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-[10px] font-black tracking-wider uppercase text-slate-500 border-b">
                      <tr>
                        <th className="p-3.5 pl-6">Profissional</th>
                        <th className="p-3.5">Cargo / Setor</th>
                        <th className="p-3.5 text-center">Curso Mandatórios</th>
                        <th className="p-3.5">Gráfico de Conclusão</th>
                        <th className="p-3.5 text-right pr-6">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-[11px] text-slate-705">
                      {dashboardColaboradores.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400 font-extrabold uppercase tracking-wide">
                            Nenhum colaborador encontrado com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        dashboardColaboradores.map((colab) => {
                          const progress = getColaboradorProgress(colab);
                          return (
                            <tr key={colab.matricula} className="hover:bg-slate-50/50 transition">
                              <td className="p-3.5 pl-6">
                                <div>
                                  <span className="font-extrabold text-slate-900">{colab.nome}</span>
                                  <p className="text-[9px] text-slate-400 font-bold tracking-tight">Matrícula: {colab.matricula}</p>
                                </div>
                              </td>
                              <td className="p-3.5">
                                <div>
                                  <span className="text-slate-800 font-semibold">{colab.cargo}</span>
                                  <p className="text-[9px] text-slate-500 font-bold">{colab.setor}</p>
                                </div>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full text-[10px]">
                                  {progress.completedCount} de {progress.requiredCount}
                                </span>
                              </td>
                              <td className="p-3.5 max-w-[200px]">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${
                                        progress.pct === 100 ? 'bg-emerald-500' :
                                        progress.pct >= 50 ? 'bg-amber-400' :
                                        'bg-rose-400'
                                      }`}
                                      style={{ width: `${progress.pct}%` }}
                                    />
                                  </div>
                                  <span className="font-black text-slate-800 shrink-0 text-[10px]">{progress.pct}%</span>
                                </div>
                              </td>
                              <td className="p-3.5 text-right pr-6">
                                {progress.pct === 100 ? (
                                  <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-150 text-[10px] font-black">
                                    <Check className="w-3 h-3" />
                                    <span>Regularizado</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-800 px-2 py-0.5 rounded-full border border-rose-150 text-[10px] font-black">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Pendente</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.div>
          )}

          {/* TAB 2: CURSOS */}
          {activeTab === 'cursos' && (
            <motion.div
              key="univ-cursos"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 border border-slate-200 rounded-2xl shadow-xs">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3.5 top-2.5 w-4.5 h-4.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar cursos cadastrados..."
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                  />
                </div>

                {!isEnfermeiroProfile && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <button
                      onClick={() => {
                        if (isAddingCourse && editingCourseId) {
                          // Reset editing mode and set to create mode
                          setEditingCourseId(null);
                          setNewCourseNome('');
                          setNewCourseDesc('');
                          const initial: typeof newCourseTargets = {};
                          CARGOS_ENFERMAGEM.forEach(c => {
                            initial[c] = { selected: false, obrigatorio: false };
                          });
                          setNewCourseTargets(initial);
                        } else {
                          setIsAddingCourse(prev => !prev);
                        }
                      }}
                      className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      {isAddingCourse ? (
                        <span>{editingCourseId ? 'Cadastrar Novo Curso' : 'Fechar Formulário'}</span>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Cadastrar Novo Curso</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleResetCoursesDatabase}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-rose-650/10"
                      title="Limpar e Corrigir Banco de Cursos"
                    >
                      <RefreshCw className="w-4 h-4 animate-spin-hover" />
                      <span>Limpar e Corrigir Banco</span>
                    </button>
                  </div>
                )}
              </div>

              {/* COURSE CADASTRO FORM */}
              {isAddingCourse && (
                <motion.div
                  id="course-form-section"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md overflow-hidden"
                >
                  <form onSubmit={handleSaveCourse} className="space-y-5">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                        {editingCourseId ? "Editar Programa de Treinamento" : "Novo Programa de Treinamento"}
                      </h3>
                      <p className="text-[10px] text-slate-500">
                        {editingCourseId ? "Altere os dados do curso e ajuste as regras de obrigatoriedade por cargo." : "Defina o nome, ementa técnica e a obrigatoriedade de conclusão para cada cargo."}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-extrabold text-slate-600">Nome do Curso / Capacitação *</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: NR-32 Segurança Clínica, Ética Hospitalar, Suporte à Parada"
                          value={newCourseNome}
                          onChange={(e) => setNewCourseNome(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-extrabold text-slate-600">Ementa / Descrição (Opcional)</label>
                        <input
                          type="text"
                          placeholder="Breve descrição dos objetivos pedagógicos e regulatórios do treinamento..."
                          value={newCourseDesc}
                          onChange={(e) => setNewCourseDesc(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                        />
                      </div>
                    </div>

                     {/* TARGETS FOR POSITION AND OBLIGATORINESS: CHIP GRID */}
                    <div className="space-y-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        <div>
                          <label className="text-[11px] font-extrabold text-slate-800 block uppercase tracking-wider">Público Alvo e Configuração de Exigência</label>
                          <p className="text-[9px] text-slate-400">Selecione para quais cargos este curso é direcionado e marque a obrigatoriedade.</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const updated: typeof newCourseTargets = {};
                              CARGOS_ENFERMAGEM.forEach(c => {
                                updated[c] = { selected: true, obrigatorio: true };
                              });
                              setNewCourseTargets(updated);
                            }}
                            className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black rounded-xl transition duration-150 cursor-pointer shadow-xs"
                          >
                            Selecionar Todos (Obrigatório)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const updated: typeof newCourseTargets = {};
                              CARGOS_ENFERMAGEM.forEach(c => {
                                updated[c] = { selected: false, obrigatorio: false };
                              });
                              setNewCourseTargets(updated);
                            }}
                            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-650 text-[10px] font-black rounded-xl transition duration-150 cursor-pointer"
                          >
                            Limpar Tudo
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {CARGOS_ENFERMAGEM.map((cargo) => {
                          const state = newCourseTargets[cargo] || { selected: false, obrigatorio: false };
                          return (
                            <div 
                              key={cargo} 
                              className={`p-3.5 border rounded-2xl flex flex-col justify-between gap-2.5 transition ${
                                state.selected 
                                  ? 'bg-sky-50/50 border-sky-200 shadow-sm' 
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2 justify-between">
                                <span className="font-extrabold text-xs text-slate-900">{cargo}</span>
                                <input
                                  type="checkbox"
                                  checked={state.selected}
                                  onChange={(e) => {
                                    setNewCourseTargets(prev => ({
                                      ...prev,
                                      [cargo]: { ...prev[cargo], selected: e.target.checked }
                                    }));
                                  }}
                                  className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
                                />
                              </div>

                              {state.selected && (
                                <div className="flex gap-1.5 bg-white p-1 rounded-lg border border-sky-100 max-w-full">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewCourseTargets(prev => ({
                                        ...prev,
                                        [cargo]: { ...prev[cargo], obrigatorio: true }
                                      }));
                                    }}
                                    className={`flex-1 py-1 rounded text-[9px] font-black text-center transition ${
                                      state.obrigatorio 
                                        ? 'bg-rose-500 text-white' 
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                  >
                                    Obrigatório
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNewCourseTargets(prev => ({
                                        ...prev,
                                        [cargo]: { ...prev[cargo], obrigatorio: false }
                                      }));
                                    }}
                                    className={`flex-1 py-1 rounded text-[9px] font-black text-center transition ${
                                      !state.obrigatorio 
                                        ? 'bg-sky-500 text-white' 
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                  >
                                    Recomendado / Opcional
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingCourse(false);
                          setEditingCourseId(null);
                          setNewCourseNome('');
                          setNewCourseDesc('');
                          const initial: typeof newCourseTargets = {};
                          CARGOS_ENFERMAGEM.forEach(c => {
                            initial[c] = { selected: false, obrigatorio: false };
                          });
                          setNewCourseTargets(initial);
                        }}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-100 font-extrabold rounded-xl text-xs text-slate-500 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl text-xs transition cursor-pointer"
                      >
                        {editingCourseId ? "Atualizar Curso na Universidade" : "Salvar Curso na Universidade"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* LIST READ-ONLY ACTIVE COURSES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredCursos.length > 0 ? (
                  filteredCursos.map((curso) => (
                    <div 
                      key={curso.id} 
                      className="bg-white border border-slate-200 hover:border-slate-300 transition duration-250 p-5 rounded-3xl flex flex-col justify-between gap-5 shadow-xs relative"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="bg-sky-50 text-sky-600 p-2.5 rounded-xl border border-sky-100">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          {!isEnfermeiroProfile && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditCourse(curso)}
                                className="text-slate-400 hover:text-sky-600 p-1 rounded-lg hover:bg-sky-50 transition cursor-pointer"
                                title="Editar Curso"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCourse(curso.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                title="Remover Curso"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="font-extrabold text-slate-900 text-xs leading-snug">{curso.nome}</h4>
                          <span className="text-[9px] font-bold text-slate-400 font-mono tracking-tight">{curso.id}</span>
                          <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">{curso.descricao || "Sem ementa ou descrição complementar cadastrada."}</p>
                        </div>
                      </div>

                      {/* TARGET AND OBLIGATORINESS DETAILS */}
                      <div className="space-y-2 border-t border-slate-100 pt-3">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Obrigatoriedades de Cargo:</span>
                        
                        <div className="flex flex-wrap gap-1.5">
                          {curso.targets.length > 0 ? (
                            curso.targets.map((tgt, idx) => (
                              <span 
                                key={idx} 
                                className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                                  tgt.obrigatorio 
                                    ? 'bg-rose-50 text-rose-800 border-rose-150' 
                                    : 'bg-sky-50 text-sky-800 border-sky-150'
                                }`}
                              >
                                {tgt.cargo} {tgt.obrigatorio ? '(Obrigatorio)' : '(Recomendado)'}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Disponível para livre adesão (livre).</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full bg-slate-50 border border-dashed border-slate-200 text-center py-12 rounded-3xl space-y-2">
                    <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-slate-550 font-bold text-xs">Nenhum curso corresponde à busca realizada.</p>
                  </div>
                )}
              </div>

            </motion.div>
          )}

          {/* TAB 3: CERTIFICADOS / HOMOLOGAÇÕES */}
          {activeTab === 'certificados' && (
            <motion.div
              key="univ-certificados"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              
              {/* SUB-TAB SELECTOR TO TOGGLE BETWEEN IA AND MANUAL */}
              {!isEnfermeiroProfile && (
                <div className="flex border border-slate-200/80 rounded-2xl bg-slate-50 p-1 w-full sm:max-w-md">
                  <button
                    type="button"
                    onClick={() => setCertMode('ia')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer text-center ${
                      certMode === 'ia'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/40'
                        : 'text-slate-550 hover:text-slate-800'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-sky-500" />
                    <span>Homologação Inteligente (IA)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCertMode('manual')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer text-center ${
                      certMode === 'manual'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/40'
                        : 'text-slate-550 hover:text-slate-800'
                    }`}
                  >
                    <FileSignature className="w-4 h-4 text-emerald-500" />
                    <span>Carregamento Manual (Sem IA)</span>
                  </button>
                </div>
              )}

              {!isEnfermeiroProfile && (certMode === 'ia' ? (
                <>
                  {/* AREA DE IMPORTADORES INTERATIVOS (DOIS MODOS: MULTI-ARQUIVOS OU LISTA EM TEXTO) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* MODE A: OCR CERTIFICATE FILE ANALYZER via Gemini (MULTIPLES FILES & DRAG-AND-DROP) */}
                <div 
                  className={`bg-white border transition-all duration-300 rounded-3xl p-6 shadow-xs space-y-4 relative ${
                    isDragging ? 'border-sky-500 bg-sky-50/15 ring-2 ring-sky-200' : 'border-slate-200'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) {
                      handleBatchFilesUpload(e.dataTransfer.files);
                    }
                  }}
                >
                  <div className="border-b border-slate-100 pb-2">
                    <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1">
                      <Upload className="w-4 h-4 text-sky-600" />
                      <span>Analisar e Homologar Certificados (Arraste / Multi-arquivos)</span>
                    </h4>
                    <p className="text-[10px] text-slate-500">Arraste múltiplos arquivos de certificados ou clique para carregar. A IA lerá o nome do profissional e do curso.</p>
                  </div>

                  <div className="space-y-4">
                    {/* File Dropzone */}
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed p-6 text-center rounded-2xl cursor-pointer transition flex flex-col justify-center items-center gap-2 ${
                        isDragging ? 'border-sky-500 bg-sky-50/40 text-sky-700' : 'border-slate-200 bg-slate-50 hover:bg-sky-50/20 hover:border-sky-400'
                      }`}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={(e) => {
                          if (e.target.files) {
                            handleBatchFilesUpload(e.target.files);
                          }
                        }} 
                        accept="application/pdf,image/*" 
                        multiple
                        className="hidden" 
                      />
                      <FileText className={`w-10 h-10 ${isDragging ? 'text-sky-600' : 'text-slate-400'}`} />
                      <div>
                        <span className="text-xs font-black text-slate-700 block">Arraste aqui ou Selecione Certificados</span>
                        <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">Suporta PDFs ou Imagens simultâneas (Processamento em Lote)</span>
                      </div>
                    </div>

                    {/* Progress / Files Queue List */}
                    {batchFileDrafts.length > 0 && (
                      <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1 border-t border-slate-100 pt-3">
                        <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded-xl text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                          <span>Lista de Arquivos carregados ({batchFileDrafts.length})</span>
                          <button
                            type="button"
                            onClick={handleClearFileDraftsList}
                            className="text-rose-600 hover:text-rose-800 transition"
                          >
                            Limpar Tudo
                          </button>
                        </div>

                        {batchFileDrafts.map((draft, idx) => (
                          <div 
                            key={draft.id} 
                            className={`p-3.5 rounded-2xl border transition text-xs space-y-2.5 ${
                              draft.status === 'processando' 
                                ? 'bg-slate-50 border-slate-200' 
                                : draft.status === 'erro' 
                                  ? 'bg-rose-50/30 border-rose-100' 
                                  : 'bg-emerald-50/15 border-emerald-150'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2 border-b border-dashed border-slate-150 pb-1.5">
                              <div className="min-w-0">
                                <span className="font-extrabold text-[11px] text-slate-800 block truncate" title={draft.fileName}>
                                  {idx + 1}. {draft.fileName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {draft.status === 'processando' && (
                                  <span className="text-[9px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-black uppercase flex items-center gap-1">
                                    <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-600" />
                                    Lendo...
                                  </span>
                                )}
                                {draft.status === 'erro' && (
                                  <span className="text-[9px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-black uppercase">
                                    Erro IA
                                  </span>
                                )}
                                {draft.status === 'sucesso' && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black uppercase">
                                    Sucesso OCR
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFileDraft(draft.id)}
                                  className="text-slate-400 hover:text-rose-600 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {draft.status === 'processando' && (
                              <div className="p-2 border border-slate-200 bg-white rounded-xl flex items-center gap-2.5 font-mono text-[9px] text-slate-500">
                                <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin shrink-0" />
                                <span>Agente decodificando marcas do arquivo com IA...</span>
                              </div>
                            )}

                            {draft.status === 'erro' && (
                              <div className="space-y-2">
                                <div className="p-2 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-[10px] font-semibold">
                                  Falha na leitura: {draft.errorMsg}
                                </div>
                                {draft.fileBase64 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryDraftExtraction(draft.id)}
                                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 border border-sky-200 hover:border-sky-300 rounded-xl text-[10px] font-extrabold transition cursor-pointer"
                                  >
                                    <RefreshCw className="w-3 h-3 text-sky-600 animate-none" />
                                    Tentar Novamente com IA
                                  </button>
                                )}
                              </div>
                            )}

                            {draft.status === 'sucesso' && (
                              <div className="grid grid-cols-1 gap-2.5">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wilder block">Profissional Detectado:</label>
                                  <span className="text-[10px] text-slate-400 italic block leading-none">Original: "{draft.colaboradorOriginal}"</span>
                                  <select
                                    value={draft.matchedMatricula}
                                    onChange={(e) => {
                                      setBatchFileDrafts(prev => prev.map(d => 
                                        d.id === draft.id ? { ...d, matchedMatricula: e.target.value } : d
                                      ));
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-505 font-bold"
                                  >
                                    <option value="">-- Selecione o Colaborador --</option>
                                    {colaboradores.map(c => (
                                      <option key={c.matricula} value={c.matricula}>{c.nome} ({c.cargo} | {c.matricula})</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wilder block">Curso Identificado:</label>
                                  <span className="text-[10px] text-slate-400 italic block leading-none">Original: "{draft.cursoOriginal}"</span>
                                  <select
                                    value={draft.matchedCourseId}
                                    onChange={(e) => {
                                      setBatchFileDrafts(prev => prev.map(d => 
                                        d.id === draft.id ? { ...d, matchedCourseId: e.target.value } : d
                                      ));
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-505 font-bold"
                                  >
                                    <option value="">-- Selecione o Curso Regulamentar --</option>
                                    {cursos.map(cur => (
                                      <option key={cur.id} value={cur.id}>{cur.nome}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wilder block font-sans">Data de Conclusão:</label>
                                  <input
                                    type="date"
                                    value={draft.dataConclusao}
                                    onChange={(e) => {
                                      setBatchFileDrafts(prev => prev.map(d => 
                                        d.id === draft.id ? { ...d, dataConclusao: e.target.value } : d
                                      ));
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Save Action for multi files */}
                        {batchFileDrafts.some(d => d.status === 'sucesso') && (
                          <div className="flex justify-end pt-1 bg-white sticky bottom-0 border-t border-slate-100 py-2">
                            <button
                              type="button"
                              onClick={handleSaveBatchFileCertificates}
                              className="px-4 py-2 bg-sky-650 hover:bg-sky-750 text-white font-extrabold rounded-xl text-xs transition duration-150 cursor-pointer shadow-md shadow-sky-600/10 flex items-center gap-1"
                            >
                              Homologar Arquivos do Lote ({batchFileDrafts.filter(d => d.status === 'sucesso').length})
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>

                {/* MODE B: BATCH PASTE LIST ANALYZER via Gemini */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-2">
                    <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1">
                      <Clipboard className="w-4 h-4 text-amber-600" />
                      <span>Processamento de Lista ou Mensagem Copiada (Lote)</span>
                    </h4>
                    <p className="text-[10px] text-slate-500">Cole mensagens do WhatsApp, boletins informativos ou logs manuscritos contendo aprovações.</p>
                  </div>

                  <div className="space-y-3">
                    <textarea
                      rows={4}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder={`Exemplo de texto livre para colar:
- Maria Augusta concluiu o curso de SAV no dia 20/06
- Roberto Mendes finalizou Ética e NR-32 hoje de manhã
- Ana de Souza matricula 102 concluído.`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                    />

                    <div className="flex justify-end">
                      <button
                        onClick={handleTextExtract}
                        disabled={isExtractingText}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white hover:text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        {isExtractingText ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Analisando com IA...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            <span>Extrair Certificados da Cópia</span>
                          </>
                        )}
                      </button>
                    </div>

                    {errorTextMsg && (
                      <div className="p-3 bg-rose-50 text-rose-850 rounded-2xl text-[10px] border border-rose-100 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span>Falha na leitura do lote: {errorTextMsg}</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* BATCH CHECKLIST TABLE FOR COPIED TEXT PREVIEW */}
              {extractedTextList.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-4"
                >
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Homologar Lote Processado pela IA</h4>
                      <p className="text-[10px] text-slate-400">Selecione cada linha, refine as associações obtidas e homologue em lote.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 font-black text-slate-500 border-b text-[10px] uppercase">
                        <tr>
                          <th className="p-3 text-center w-12">Ativo</th>
                          <th className="p-3">Nome Extraído</th>
                          <th className="p-3">Colaborador Mapeado</th>
                          <th className="p-3">Curso Mapeado</th>
                          <th className="p-3">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 font-semibold text-[11px] text-slate-700">
                        {extractedTextList.map((item, idx) => (
                          <tr key={item.id} className={`hover:bg-slate-50/50 ${item.selected ? 'bg-sky-50/10' : 'opacity-40'}`}>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => {
                                  const cpy = [...extractedTextList];
                                  cpy[idx].selected = e.target.checked;
                                  setExtractedTextList(cpy);
                                }}
                                className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
                              />
                            </td>
                            <td className="p-3">
                              <div>
                                <span className="font-bold text-slate-900">"{item.colaborador_nome_original}"</span>
                                <p className="text-[9px] text-slate-400">Curso: "{item.curso_nome_original}"</p>
                              </div>
                            </td>
                            <td className="p-3">
                              <select
                                value={item.matchedMatricula}
                                onChange={(e) => {
                                  const cpy = [...extractedTextList];
                                  cpy[idx].matchedMatricula = e.target.value;
                                  setExtractedTextList(cpy);
                                }}
                                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold w-56"
                              >
                                <option value="">-- Ignorar ou Não Vinculado --</option>
                                {colaboradores.map(col => (
                                  <option key={col.matricula} value={col.matricula}>{col.nome} ({col.matricula})</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3">
                              <select
                                value={item.cursoId}
                                onChange={(e) => {
                                  const cpy = [...extractedTextList];
                                  cpy[idx].cursoId = e.target.value;
                                  setExtractedTextList(cpy);
                                }}
                                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold w-56"
                              >
                                <option value="">-- Mapear Curso --</option>
                                {cursos.map(cur => (
                                  <option key={cur.id} value={cur.id}>{cur.nome}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3">
                              <input
                                type="date"
                                value={item.dataConclusao}
                                onChange={(e) => {
                                  const cpy = [...extractedTextList];
                                  cpy[idx].dataConclusao = e.target.value;
                                  setExtractedTextList(cpy);
                                }}
                                className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-[11px] font-semibold w-28"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => setExtractedTextList([])}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs text-slate-500 font-extrabold transition cursor-pointer"
                    >
                      Descartar Lote
                    </button>
                    <button
                      onClick={handleSaveTextListCertificates}
                      className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-sky-600/10 transition cursor-pointer"
                    >
                      Homologar Selecionados ({extractedTextList.filter(i => i.selected).length})
                    </button>
                  </div>
                </motion.div>
              )}
                </>
              ) : (
                /* MODE C: MANUAL CERTIFICATE UPLOAD MODULE (SEM IA) */
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
                  <div className="border-b border-slate-100 pb-3">
                    <h4 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <FileSignature className="w-5 h-5 text-emerald-600" />
                      <span>Carregar Certificado Manualmente (Sem Depender de IA)</span>
                    </h4>
                    <p className="text-xs text-slate-500">Insira manualmente as aprovações, anexe arquivos opcionais e vincule os cursos pendentes de forma direta.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Colaborador Selection Dropdown Card */}
                    <div className="md:col-span-1 bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-4 h-fit">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                          1. Buscar Colaborador
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Pesquisar por nome, cargo ou matr..."
                            value={manualColabSearch}
                            onChange={(e) => setManualColabSearch(e.target.value)}
                            className="w-full bg-white border border-slate-200 pl-9 pr-8 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                          />
                          {manualColabSearch && (
                            <button
                              type="button"
                              onClick={() => setManualColabSearch('')}
                              className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 font-black cursor-pointer text-sm"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                          Selecione o Colaborador
                        </label>
                        <div className="relative">
                          <select
                            value={manualSelectedMatricula}
                            onChange={(e) => {
                              setManualSelectedMatricula(e.target.value);
                              setManualFiles({});
                              setManualCompletionDates({});
                              setManualCheckedCourses({});
                            }}
                            className="w-full bg-white border border-slate-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold appearance-none cursor-pointer"
                          >
                            <option value="">-- Escolha um colaborador --</option>
                            {activeColaboradores
                              .filter(c => {
                                if (!manualColabSearch) return true;
                                const s = manualColabSearch.toLowerCase();
                                return c.nome.toLowerCase().includes(s) || 
                                       c.matricula.toLowerCase().includes(s) || 
                                       c.cargo.toLowerCase().includes(s);
                              })
                              .map(c => (
                                <option key={c.matricula} value={c.matricula}>
                                  {c.nome} ({c.cargo})
                                </option>
                              ))
                            }
                          </select>
                          <div className="absolute right-3 top-3.5 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-500 pointer-events-none"></div>
                        </div>
                      </div>

                      {/* Selected Colaborador Profile Mini-card */}
                      {manualSelectedMatricula && (
                        (() => {
                          const colab = activeColaboradores.find(c => c.matricula === manualSelectedMatricula);
                          if (!colab) return null;
                          return (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-2.5 text-xs shadow-xs"
                            >
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                <UserCheck className="w-4 h-4 text-emerald-600" />
                                <span className="font-extrabold text-slate-800">Ficha do Profissional</span>
                              </div>
                              <div className="space-y-1.5 font-semibold text-slate-600">
                                <div><span className="text-slate-400">Nome:</span> <span className="text-slate-900 font-extrabold">{colab.nome}</span></div>
                                <div><span className="text-slate-400">Matrícula:</span> <span className="text-slate-900 font-bold">{colab.matricula}</span></div>
                                <div><span className="text-slate-400">Cargo:</span> <span className="text-slate-950 font-bold">{colab.cargo}</span></div>
                                <div><span className="text-slate-400">Equipe:</span> <span className="text-slate-900">{colab.equipe}</span></div>
                                <div><span className="text-slate-400">Setor:</span> <span className="text-slate-900">{colab.setor}</span></div>
                              </div>
                            </motion.div>
                          );
                        })()
                      )}
                    </div>

                    {/* Pending Courses List Card */}
                    <div className="md:col-span-2 space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                          2. Trilha de Cursos Pendentes
                        </label>
                      </div>

                      {!manualSelectedMatricula ? (
                        <div className="border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400 bg-slate-50/50">
                          <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                          <p className="text-xs font-bold">Por favor, selecione um colaborador no menu à esquerda para visualizar seus cursos pendentes.</p>
                        </div>
                      ) : (
                        (() => {
                          const colab = activeColaboradores.find(c => c.matricula === manualSelectedMatricula);
                          if (!colab) return null;

                          // Find all pending courses (no certificate registered yet)
                          const pending = cursos.filter(curso => {
                            const isCompleted = certificados.some(cert => 
                              cert.colaboradorMatricula === colab.matricula && cert.cursoId === curso.id
                            );
                            return !isCompleted;
                          }).sort((a, b) => a.nome.localeCompare(b.nome));

                          if (pending.length === 0) {
                            return (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-8 text-center text-emerald-800 space-y-2"
                              >
                                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
                                <h5 className="font-extrabold text-xs uppercase tracking-wider">Tudo Concluído!</h5>
                                <p className="text-xs font-semibold text-emerald-700 max-w-md mx-auto">Este profissional concluiu todos os cursos cadastrados na Universidade Corporativa Hapvida.</p>
                              </motion.div>
                            );
                          }

                          const checkedCount = Object.keys(manualCheckedCourses).filter(id => manualCheckedCourses[id]).length;

                          return (
                            <div className="space-y-4">
                              {/* Bulk actions header */}
                              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/60 text-xs">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const allChecked: typeof manualCheckedCourses = {};
                                      pending.forEach(c => allChecked[c.id] = true);
                                      setManualCheckedCourses(allChecked);
                                    }}
                                    className="text-sky-600 hover:text-sky-850 font-extrabold transition cursor-pointer"
                                  >
                                    Selecionar Todos
                                  </button>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => setManualCheckedCourses({})}
                                    className="text-slate-500 hover:text-slate-800 font-extrabold transition cursor-pointer"
                                  >
                                    Limpar Seleção
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={handleManualBulkHomologate}
                                  disabled={checkedCount === 0}
                                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-xs transition disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                                >
                                  <FileCheck2 className="w-3.5 h-3.5" />
                                  <span>Homologar Selecionados ({checkedCount})</span>
                                </button>
                              </div>

                              {/* Table list */}
                              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                                        <th className="p-3 w-10 text-center">Sel.</th>
                                        <th className="p-3">Curso / Trilha</th>
                                        <th className="p-3">Data Conclusão</th>
                                        <th className="p-3">Certificado (PDF/IMG)</th>
                                        <th className="p-3 text-right">Ação</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {pending.map((curso) => {
                                        const isMandatory = curso.targets.some(t => t.cargo === colab.cargo && t.obrigatorio);
                                        const isChecked = !!manualCheckedCourses[curso.id];
                                        const fileData = manualFiles[curso.id];
                                        const compDate = manualCompletionDates[curso.id] || new Date().toISOString().split('T')[0];

                                        return (
                                          <tr key={curso.id} className={`hover:bg-slate-50/50 transition ${isChecked ? 'bg-sky-50/10' : ''}`}>
                                            <td className="p-3 text-center">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setManualCheckedCourses(prev => ({
                                                    ...prev,
                                                    [curso.id]: !prev[curso.id]
                                                  }));
                                                }}
                                                className="text-slate-400 hover:text-sky-600 transition cursor-pointer"
                                              >
                                                {isChecked ? (
                                                  <CheckSquare className="w-4.5 h-4.5 text-sky-600" />
                                                ) : (
                                                  <Square className="w-4.5 h-4.5 text-slate-300" />
                                                )}
                                              </button>
                                            </td>
                                            <td className="p-3 space-y-1 max-w-xs">
                                              <div className="font-extrabold text-slate-800 break-words">{curso.nome}</div>
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                {isMandatory ? (
                                                  <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider border border-rose-100">Obrigatório</span>
                                                ) : (
                                                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider border border-slate-200">Opcional</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="p-3">
                                              <input
                                                type="date"
                                                value={compDate}
                                                max={new Date().toISOString().split('T')[0]}
                                                onChange={(e) => {
                                                  setManualCompletionDates(prev => ({
                                                    ...prev,
                                                    [curso.id]: e.target.value
                                                  }));
                                                }}
                                                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 focus:ring-1 focus:ring-sky-500 focus:outline-none cursor-pointer"
                                              />
                                            </td>
                                            <td className="p-3">
                                              <div className="flex items-center gap-1.5">
                                                <input
                                                  type="file"
                                                  id={`manual-file-${curso.id}`}
                                                  accept="application/pdf,image/*"
                                                  onChange={(e) => handleManualFileChange(curso.id, e.target.files?.[0] || null)}
                                                  className="hidden"
                                                />
                                                {fileData ? (
                                                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg px-2 py-1 flex items-center gap-1 text-[10px] font-black max-w-[140px] truncate" title={fileData.fileName}>
                                                    <Paperclip className="w-3 h-3 text-emerald-600 shrink-0" />
                                                    <span className="truncate shrink">{fileData.fileName}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleManualFileChange(curso.id, null)}
                                                      className="text-rose-500 hover:text-rose-700 font-black ml-1 scale-110 cursor-pointer"
                                                    >
                                                      &times;
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <label
                                                    htmlFor={`manual-file-${curso.id}`}
                                                    className="bg-slate-100 hover:bg-slate-200 border border-slate-250 hover:border-slate-300 rounded-lg px-2.5 py-1 flex items-center gap-1 text-[10px] font-black text-slate-600 transition cursor-pointer"
                                                  >
                                                    <Upload className="w-3 h-3 text-slate-500" />
                                                    <span>Anexar Arquivo</span>
                                                  </label>
                                                )}
                                              </div>
                                            </td>
                                            <td className="p-3 text-right">
                                              <button
                                                type="button"
                                                onClick={() => handleManualHomologate(curso)}
                                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-lg text-[10px] transition cursor-pointer flex items-center gap-1 ml-auto"
                                              >
                                                <Check className="w-3 h-3" />
                                                <span>Homologar</span>
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* HOMOLOGATIONS ARCHIVE / REGISTERED CERTIFICATES */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Histórico de Conclusões Registradas</h3>
                    <p className="text-[11px] text-slate-500 font-semibold">Consulte certificados validados no banco de dados corporativo.</p>
                  </div>

                  <div className="relative w-full md:max-w-xs">
                    <Search className="absolute left-3 top-2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar por colaborador ou curso..."
                      value={certSearch}
                      onChange={(e) => setCertSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 pl-9 pr-3 py-1.5 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 border-b tracking-wider uppercase">
                      <tr>
                        <th className="p-3.5 pl-6">Profissional</th>
                        <th className="p-3.5">Matrícula</th>
                        <th className="p-3.5">Curso Homologado</th>
                        <th className="p-3.5">Conclusão</th>
                        <th className="p-3.5">Origem / Método</th>
                        <th className="p-3.5 text-right pr-6">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-[11px] text-slate-700">
                      {filteredCertificados.length > 0 ? (
                        filteredCertificados.map((cert) => (
                          <tr key={cert.id} className="hover:bg-slate-50/50 transition">
                            <td className="p-3.5 pl-6 font-extrabold text-slate-900">{cert.colaboradorNome}</td>
                            <td className="p-3.5 font-mono text-slate-400 text-[10px]">{cert.colaboradorMatricula}</td>
                            <td className="p-3.5">
                              <span className="bg-sky-50 text-sky-800 px-2 py-0.5 rounded-full border border-sky-150 inline-flex items-center gap-1 text-[10px] font-black">
                                <Award className="w-3.5 h-3.5" />
                                <span>{cert.cursoNome}</span>
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-500 font-extrabold">
                              {cert.dataConclusao.split('-').reverse().join('/')}
                            </td>
                            <td className="p-3.5">
                              <span className="text-[10px] text-slate-400 italic">{cert.origem}</span>
                            </td>
                            <td className="p-3.5 text-right pr-6">
                              {isEnfermeiroProfile ? (
                                <span className="text-[9px] bg-slate-100 text-slate-500 font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-slate-200">SOMENTE LEITURA</span>
                              ) : (
                                <button
                                  onClick={() => handleDeleteCert(cert.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="text-center p-10 text-slate-400 italic">
                            Nenhum certificado registrado encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.div>
          )}

          {/* TAB 4: RELATÓRIOS DE CURSOS */}
          {activeTab === 'relatorios' && (
            <motion.div
              key="univ-relatorios"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* PRINT-ONLY HEADER */}
              <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
                <div className="flex justify-between items-end">
                  <div>
                    <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight">Relatório de Conformidade de Treinamento</h1>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Universidade Corporativa HNSR</p>
                  </div>
                  <div className="text-right text-[9px] font-bold text-slate-500 uppercase">
                    <p>Emissão: {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR')}</p>
                    <p>Status: Ativos Operacionais (Excl. Férias/INSS)</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] font-bold">
                  <div>
                    <span className="text-slate-400 uppercase text-[8px] block">Setor Filtrado</span>
                    <span className="text-slate-900">{reportFilterSetor || 'TODOS OS SETORES'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase text-[8px] block">Turno/Equipe Filtrado</span>
                    <span className="text-slate-900">{reportFilterTurno || 'TODOS OS TURNOS'}</span>
                  </div>
                </div>
              </div>

              {/* ACTION TOOLBAR (Hidden in actual printout) */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center print:hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  
                  {/* Setor Filter */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                      Filtrar por Setor
                    </label>
                    <div className="relative">
                      <select
                        value={reportFilterSetor}
                        onChange={(e) => setReportFilterSetor(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold appearance-none cursor-pointer"
                      >
                        <option value="">Todos os Setores</option>
                        {SETORES_HOSPITALARES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-3.5 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-500 pointer-events-none"></div>
                    </div>
                  </div>

                  {/* Turno Filter */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                      Filtrar por Turno
                    </label>
                    <div className="relative">
                      <select
                        value={reportFilterTurno}
                        onChange={(e) => setReportFilterTurno(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold appearance-none cursor-pointer"
                      >
                        <option value="">Todos os Turnos</option>
                        {EQUIPES_ESCALA.map(e => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-3.5 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-500 pointer-events-none"></div>
                    </div>
                  </div>

                </div>

                <div className="flex items-end shrink-0">
                  <button
                    onClick={() => window.print()}
                    className="w-full md:w-auto px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir Relatório</span>
                  </button>
                </div>
              </div>

              {/* CORE DATA CALCULATION FOR REPORT */}
              {(() => {
                const reportWorkingColaboradores = activeColaboradores.filter(c => !checkCurrentlyINSS(c) && !checkCurrentlyOnVacation(c));
                
                const reportFilteredColabs = reportWorkingColaboradores.filter(c => {
                  if (reportFilterSetor && c.setor !== reportFilterSetor) return false;
                  if (reportFilterTurno && c.equipe !== reportFilterTurno) return false;
                  return true;
                });

                const reportCoursesWithStats = cursos.map(curso => {
                  const requiredColabs = reportFilteredColabs.filter(colab =>
                    curso.targets.some(t => t.cargo === colab.cargo && t.obrigatorio)
                  );
                  const completedCount = requiredColabs.filter(colab =>
                    certificados.some(cert => cert.colaboradorMatricula === colab.matricula && cert.cursoId === curso.id)
                  ).length;
                  const totalRequired = requiredColabs.length;
                  const pct = totalRequired === 0 ? 100 : Math.round((completedCount / totalRequired) * 100);
                  return {
                    curso,
                    completedCount,
                    totalRequired,
                    pct
                  };
                }).sort((a, b) => {
                  if (a.totalRequired === 0 && b.totalRequired > 0) return 1;
                  if (b.totalRequired === 0 && a.totalRequired > 0) return -1;
                  return a.pct - b.pct;
                });

                const colabsWithProgress = reportFilteredColabs.map(colab => {
                  const progress = getColaboradorProgress(colab);
                  return {
                    colab,
                    progress
                  };
                });

                const top5Colabs = [...colabsWithProgress]
                  .sort((a, b) => b.progress.pct - a.progress.pct || a.colab.nome.localeCompare(b.colab.nome))
                  .slice(0, 5);

                const bottom5Colabs = [...colabsWithProgress]
                  .sort((a, b) => a.progress.pct - b.progress.pct || a.colab.nome.localeCompare(b.colab.nome))
                  .slice(0, 5);

                return (
                  <div className="space-y-6">

                    {/* TWO PRIMARY PANELS FOR THE REPORT */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                      
                      {/* COURSES COMPLETION LIST TABLE (Takes 2 columns) */}
                      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs print:border-none print:shadow-none print:p-0">
                        <div className="flex items-center justify-between mb-5">
                          <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Adesão dos Cursos</h3>
                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">Ordenado do menor para o maior índice de conclusão obrigatória.</p>
                          </div>
                          <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-[9px] font-black uppercase print:hidden">
                            {cursos.length} Cursos Mapeados
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-150 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                                <th className="pb-3 pl-2">Curso</th>
                                <th className="pb-3 text-center">Concluintes / Obrigados</th>
                                <th className="pb-3">Percentual</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-700">
                              {reportCoursesWithStats.map(({ curso, completedCount, totalRequired, pct }) => (
                                <tr key={curso.id} className="hover:bg-slate-50/40 transition">
                                  <td className="py-3.5 pl-2 max-w-[280px]">
                                    <div>
                                      <span className="font-extrabold text-slate-900 text-xs block">{curso.nome}</span>
                                      <span className="text-[9px] text-slate-400 font-mono">ID: {curso.id}</span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 text-center font-bold text-slate-600">
                                    {totalRequired === 0 ? (
                                      <span className="bg-slate-50 text-slate-400 px-2 py-0.5 rounded-full text-[9px] font-black uppercase">
                                        Não se aplica
                                      </span>
                                    ) : (
                                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full text-[10px] font-black">
                                        {completedCount} de {totalRequired}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3.5 pr-2">
                                    {totalRequired === 0 ? (
                                      <span className="text-slate-400 italic text-[10px]">Sem alvos obrigatórios</span>
                                    ) : (
                                      <div className="flex items-center gap-3">
                                        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden w-24">
                                          <div 
                                            className={`h-full rounded-full ${
                                              pct === 100 ? 'bg-emerald-500' :
                                              pct >= 50 ? 'bg-amber-400' :
                                              'bg-rose-400'
                                            }`}
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                        <span className="font-black text-slate-900 shrink-0 text-xs">{pct}%</span>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* INDIVIDUAL COLLABORATORS BOARDS (melhores / piores) - TAKES 1 column on web, styled perfectly for print */}
                      <div className="space-y-6 lg:col-span-1 print:grid print:grid-cols-2 print:gap-6 print:space-y-0 print:col-span-3">
                        
                        {/* BOARD A: 5 MELHORES COLABORADORES */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs print:border print:border-slate-300 print:shadow-none print:rounded-2xl">
                          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                            <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl print:bg-white print:border print:border-emerald-200">
                              <TrendingUp className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-slate-950 uppercase tracking-wider">Top 5 - Maior Conclusão</h4>
                              <p className="text-[9px] text-slate-400 font-bold">Colaboradores com maior adesão aos cursos obrigatórios.</p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {top5Colabs.length > 0 ? (
                              top5Colabs.map(({ colab, progress }, idx) => (
                                <div key={colab.matricula} className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/30 border border-emerald-100/50 hover:bg-emerald-50/50 transition">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-5 h-5 flex items-center justify-center bg-emerald-500 text-white rounded-full text-[10px] font-black shrink-0">
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0">
                                      <span className="font-extrabold text-slate-900 text-xs block truncate" title={colab.nome}>
                                        {colab.nome}
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-bold block truncate">
                                        {colab.cargo} ({colab.setor})
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-black text-emerald-800">{progress.pct}%</span>
                                    <span className="text-[8px] text-slate-400 font-bold block">{progress.completedCount}/{progress.requiredCount} curs</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] text-slate-400 italic text-center py-4">Nenhum colaborador elegível.</p>
                            )}
                          </div>
                        </div>

                        {/* BOARD B: 5 PIORES COLABORADORES */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs print:border print:border-slate-300 print:shadow-none print:rounded-2xl">
                          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                            <div className="bg-rose-50 text-rose-600 p-2 rounded-xl print:bg-white print:border print:border-rose-200">
                              <TrendingDown className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-slate-950 uppercase tracking-wider">Top 5 - Menor Conclusão</h4>
                              <p className="text-[9px] text-slate-400 font-bold">Colaboradores com menor adesão aos cursos obrigatórios.</p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {bottom5Colabs.length > 0 ? (
                              bottom5Colabs.map(({ colab, progress }, idx) => (
                                <div key={colab.matricula} className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/30 border border-rose-100/50 hover:bg-rose-50/50 transition">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-5 h-5 flex items-center justify-center bg-rose-500 text-white rounded-full text-[10px] font-black shrink-0">
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0">
                                      <span className="font-extrabold text-slate-900 text-xs block truncate" title={colab.nome}>
                                        {colab.nome}
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-bold block truncate">
                                        {colab.cargo} ({colab.setor})
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xs font-black text-rose-800">{progress.pct}%</span>
                                    <span className="text-[8px] text-slate-400 font-bold block">{progress.completedCount}/{progress.requiredCount} curs</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] text-slate-400 italic text-center py-4">Nenhum colaborador elegível.</p>
                            )}
                          </div>
                        </div>

                      </div>

                    </div>

                    {/* PRINT-ONLY SIGNATURE SECTION */}
                    <div className="hidden print:block mt-12 pt-8 border-t border-slate-200">
                      <div className="grid grid-cols-2 gap-12 text-center text-[10px] font-bold">
                        <div>
                          <div className="border-b border-slate-400 w-48 mx-auto h-8 mb-2"></div>
                          <span>Assinatura do Responsável Técnico</span>
                          <span className="block text-[8px] text-slate-400">Universidade Corporativa HNSR</span>
                        </div>
                        <div>
                          <div className="border-b border-slate-400 w-48 mx-auto h-8 mb-2"></div>
                          <span>Núcleo de Educação Permanente (NEP)</span>
                          <span className="block text-[8px] text-slate-400">Gerência de Enfermagem</span>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })()}

            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  );
}
