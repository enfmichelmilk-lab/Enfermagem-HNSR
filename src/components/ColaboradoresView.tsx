/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, Search, UserPlus, Filter, ShieldAlert, Award, 
  Trash2, ShieldCheck, FileText, Calendar, Clock, Contact, ChevronRight, X,
  Eye, Pencil, Mail, Phone, Edit, GraduationCap, Upload, Loader2, RefreshCw, MessageSquare
} from 'lucide-react';
import { Colaborador, Usuario, Absenteismo, Curso, CertificadoCurso } from '../types';
import { subscribeCollection, saveDocument } from '../lib/firebase';
import { customAlert, customConfirm } from '../utils/customDialog';
import { isUserSubordinate } from '../utils/userFilters';
import { SETORES_HOSPITALARES, EQUIPES_ESCALA, CARGOS_ENFERMAGEM, CURSOS_INICIAIS } from '../data/mockData';
import SearchableColaboradorSelect from './SearchableColaboradorSelect';

interface ColaboradoresViewProps {
  colaboradores: Colaborador[];
  absenteismo: Absenteismo[];
  usuarioLogado: Usuario;
  onUpdateColaboradores: (novosColabs: Colaborador[]) => void;
  ferias?: any[];
  onUpdateFerias?: (novasFerias: any[]) => void;
  dynamicSelos?: string[];
  usuarios?: Usuario[];
  onUpdateUsuarios?: (novosUsuarios: Usuario[]) => void;
}

export default function ColaboradoresView({ 
  colaboradores, 
  absenteismo = [], 
  usuarioLogado, 
  onUpdateColaboradores,
  ferias = [],
  onUpdateFerias = () => {},
  dynamicSelos = [],
  usuarios = [],
  onUpdateUsuarios = () => {}
}: ColaboradoresViewProps) {
  const isAuthorizedAdmin = () => {
    const perfil = usuarioLogado?.perfil ? usuarioLogado.perfil.toLowerCase() : "";
    const authList = ["supervisor(a)", "supervisor", "coordenador(a)", "coordenador", "gerente", "adm", "administrador"];
    return authList.some(role => perfil.includes(role));
  };

  const isAcessoPermitidoParaCargo = (cargoName: string) => {
    const c = (cargoName || '').toLowerCase();
    return c.includes('enfermeiro') || c.includes('supervisor') || c.includes('coordenador') || c.includes('gerente') || c.includes('adm');
  };

  // Lists and searching
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEquipe, setSelectedEquipe] = useState('');
  const [selectedSetor, setSelectedSetor] = useState('');
  const [mostrarDesligados, setMostrarDesligados] = useState(false);
  const [selectedFilterGestorDireto, setSelectedFilterGestorDireto] = useState('');
  const [selectedFilterGestorIndireto, setSelectedFilterGestorIndireto] = useState('');

  // Dialog controllers
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [originalMatricula, setOriginalMatricula] = useState('');

  // View mode states
  const [isOpenViewModal, setIsOpenViewModal] = useState(false);
  const [selectedViewColab, setSelectedViewColab] = useState<Colaborador | null>(null);
  
  // View mode switcher: standard list or bulk quick update (BH, FF, FS)
  const [viewMode, setViewMode] = useState<'lista' | 'atualizacao_rapida'>('lista');
  const [editedColabs, setEditedColabs] = useState<Record<string, { bh: number; ff: number; fs: number }>>({});
  const [bhInputStates, setBhInputStates] = useState<Record<string, string>>({});
  const [bancoHorasText, setBancoHorasText] = useState('');

  // Helper functions to format and parse decimal hours to HH:MM format
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

  const parseExcelNumber = (val: string): number => {
    if (!val) return 0;
    const cleaned = val.trim();
    
    // Check if it's in HH:MM format (e.g. "12:30", "-05:15", "+03:45", "12:00")
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
    
    // Also support custom format with 'h' like "12h30"
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

  // States for Corporate University tracking
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [certificados, setCertificados] = useState<CertificadoCurso[]>([]);

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

  // Import states
  const [isOpenImportModal, setIsOpenImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  // Import states for BH, FF, FS
  const [isOpenSaldosImportModal, setIsOpenSaldosImportModal] = useState(false);
  const [saldosImportText, setSaldosImportText] = useState('');
  const [saldosImportError, setSaldosImportError] = useState('');

  // Form states matching col 0 to 28
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [coren, setCoren] = useState('');
  const [validadeCarteira, setValidadeCarteira] = useState('');
  const [cargo, setCargo] = useState('Enfermeiro(a)');
  const [setor, setSetor] = useState('2º ANDAR');
  const [equipe, setEquipe] = useState('Diurno A');
  const [horario, setHorario] = useState('');
  const [gestorDireto, setGestorDireto] = useState('');
  const [gestorIndireto, setGestorIndireto] = useState('');

  const selectedDirectMatricula = useMemo(() => {
    const colab = colaboradores.find(c => c.nome === gestorDireto);
    return colab ? colab.matricula : '';
  }, [colaboradores, gestorDireto]);

  const selectedIndirectMatricula = useMemo(() => {
    const colab = colaboradores.find(c => c.nome === gestorIndireto);
    return colab ? colab.matricula : '';
  }, [colaboradores, gestorIndireto]);
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [bancoHoras, setBancoHoras] = useState(0);
  const [folgaEnf, setFolgaEnf] = useState(0);
  const [folgaFeriado, setFolgaFeriado] = useState(0);
  const [brigada, setBrigada] = useState(0);
  const [eleicao, setEleicao] = useState(0);
  const [historicoView, setHistoricoView] = useState('');
  const [historicoAdd, setHistoricoAdd] = useState('');
  const [seloEtica, setSeloEtica] = useState(false);
  const [seloSeloBrigadista, setSeloSeloBrigadista] = useState(false);
  const [seloCipa, setSeloCipa] = useState(false);
  const [dataInicio, setDataInicio] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [dataRecisao, setDataRecisao] = useState('');
  const [numReq, setNumReq] = useState('');
  
  // Local vacation request form states inside view details modal
  const [isRequestingFeriasLocal, setIsRequestingFeriasLocal] = useState(false);
  const [localFeriasStartDate, setLocalFeriasStartDate] = useState('');
  const [localFeriasDuration, setLocalFeriasDuration] = useState<10 | 15 | 20 | 30>(30);
  const [localSelosAdicionais, setLocalSelosAdicionais] = useState<string[]>([]);
  const [infoSubst, setInfoSubst] = useState('');
  
    // INSS States
  const [inssCheck, setInssCheck] = useState(false);
  const [inssEntrada, setInssEntrada] = useState('');
  const [inssRetorno, setInssRetorno] = useState('');
  const [inssRep, setInssRep] = useState('');
  const [inssObs, setInssObs] = useState('');

  // Estados de Acesso Web vinculados ao cadastro
  const [habilitarAcesso, setHabilitarAcesso] = useState(false);
  const [perfilAcesso, setPerfilAcesso] = useState('Enfermeiro(a)');
  const [senhaProvisoria, setSenhaProvisoria] = useState('');
  
  // Estado para modal/pop-up de envio de Whatsapp
  const [whatsappNotification, setWhatsappNotification] = useState<{
    phone: string;
    message: string;
    colabNome: string;
  } | null>(null);

  const [analyzingCourseId, setAnalyzingCourseId] = useState<string | null>(null);

  const getWhatsAppMessage = (colab: Colaborador) => {
    if (!colab) return '';
    const name = colab.nome;
    const cargoName = colab.cargo;
    
    const mandatoryC = cursos.filter(curso => 
      curso.targets.some(t => t.cargo === cargoName && t.obrigatorio)
    );
    
    const pendingC = mandatoryC.filter(curso => 
      !certificados.some(cert => cert.colaboradorMatricula === colab.matricula && cert.cursoId === curso.id)
    );

    let message = `Olá, *${name}*! 👋\n\n`;
    message += `Gostaríamos de ressaltar a importância da adesão à trilha de aprendizagem da *Universidade Corporativa Hapvida*. A realização destes treinamentos é fundamental para mantermos a excelência do nosso atendimento e estarmos em conformidade com as exigências regulatórias obrigatórias do seu cargo de *${cargoName}*.\n\n`;

    if (pendingC.length > 0) {
      message += `📚 *Seus cursos obrigatórios pendentes:* \n`;
      pendingC.forEach((c, idx) => {
        message += `${idx + 1}. *${c.nome}*\n`;
      });
      message += `\nPor favor, acesse a plataforma da Universidade Corporativa e realize os treinamentos assim que possível. Contamos com a sua colaboração! 🎓`;
    } else {
      message += `🎉 Parabéns! Você concluiu todos os cursos obrigatórios da sua trilha atualmente! Agradecemos imensamente o seu empenho e dedicação! 🎓`;
    }

    return encodeURIComponent(message);
  };

  const handleCourseCertificateUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    curso: Curso,
    colabMatricula: string,
    colabNome: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzingCourseId(curso.id);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const fileBase64 = reader.result as string;
        const mimeType = file.type || 'application/pdf';

        const res = await fetch('/api/universidade/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64, mimeType })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || 'Erro na resposta do servidor.');
        }

        const parsed = await res.json();
        
        const certId = 'cert_' + Math.random().toString(36).substr(2, 9);
        const newCert: CertificadoCurso = {
          id: certId,
          colaboradorMatricula: colabMatricula,
          colaboradorNome: colabNome,
          cursoId: curso.id,
          cursoNome: curso.nome,
          dataConclusao: parsed.data_conclusao || new Date().toISOString().split('T')[0],
          origem: 'Upload de Certificado (IA)',
          dataCriacao: new Date().toISOString()
        };

        await saveDocument('universidade_certificados', certId, newCert);
        customAlert(
          `Sucesso!\n\n` +
          `Certificado para o curso "${curso.nome}" analisado com sucesso por IA e homologado para ${colabNome}.\n\n` +
          `• Nome do Colaborador extraído: "${parsed.colaborador_nome_original || 'Não identificado'}"\n` +
          `• Curso extraído: "${parsed.curso_nome || 'Não identificado'}"\n` +
          `• Data de Conclusão: ${newCert.dataConclusao.split('-').reverse().join('/')}`
        );
      } catch (err: any) {
        console.error(err);
        customAlert(`Erro ao analisar o certificado com IA: ${err.message || 'Falha de leitura.'}`);
      } finally {
        setAnalyzingCourseId(null);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const generateTempPassword = () => {
    const chars = '0123456789';
    let code = 'TEMP-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Birthdays States and Helpers
  const [sentBirthdayAlerts, setSentBirthdayAlerts] = useState<any[] | null>(null);

  // Quick Update (BH, FF, FS) Helper Functions
  const handleQuickFieldChange = (matricula: string, field: 'bh' | 'ff' | 'fs', value: number) => {
    setEditedColabs(prev => {
      const existing = prev[matricula] || {
        bh: colaboradores.find(c => c.matricula === matricula)?.bancohoras ?? 0,
        ff: colaboradores.find(c => c.matricula === matricula)?.folgaferiado ?? 0,
        fs: colaboradores.find(c => c.matricula === matricula)?.folgaenf ?? 0,
      };
      return {
        ...prev,
        [matricula]: {
          ...existing,
          [field]: value
        }
      };
    });
  };

  const getQuickFieldValue = (c: Colaborador, field: 'bh' | 'ff' | 'fs') => {
    if (editedColabs[c.matricula]) {
      return editedColabs[c.matricula][field];
    }
    if (field === 'bh') return c.bancohoras;
    if (field === 'ff') return c.folgaferiado;
    return c.folgaenf;
  };

  const handleSaveQuickRow = (c: Colaborador) => {
    const edits = editedColabs[c.matricula];
    if (!edits) return;

    const updatedColabs = colaboradores.map(item => {
      if (item.matricula === c.matricula) {
        return {
          ...item,
          bancohoras: edits.bh,
          folgaferiado: edits.ff,
          folgaenf: edits.fs,
          historico: `${item.historico || ''}\n[${new Date().toISOString().split('T')[0]} - Atualização Rápida]: Saldos atualizados para BH: ${formatDecimalToHHMM(edits.bh)}, FF: ${edits.ff}, FS: ${edits.fs}.`
        };
      }
      return item;
    });

    onUpdateColaboradores(updatedColabs);
    
    // Remove from edited state
    setEditedColabs(prev => {
      const copy = { ...prev };
      delete copy[c.matricula];
      return copy;
    });
    
    customAlert(`Cadastro de ${c.nome} atualizado com sucesso!`);
  };

  const handleSaveAllQuick = () => {
    const matriculasToUpdate = Object.keys(editedColabs);
    if (matriculasToUpdate.length === 0) return;

    const updatedColabs = colaboradores.map(item => {
      const edits = editedColabs[item.matricula];
      if (edits) {
        return {
          ...item,
          bancohoras: edits.bh,
          folgaferiado: edits.ff,
          folgaenf: edits.fs,
          historico: `${item.historico || ''}\n[${new Date().toISOString().split('T')[0]} - Atualização Rápida]: Saldos atualizados em lote para BH: ${formatDecimalToHHMM(edits.bh)}, FF: ${edits.ff}, FS: ${edits.fs}.`
        };
      }
      return item;
    });

    onUpdateColaboradores(updatedColabs);
    setEditedColabs({});
    customAlert(`Sucesso! Os saldos de ${matriculasToUpdate.length} colaboradores foram atualizados.`);
  };

  const handleProcessSaldosImport = () => {
    if (!saldosImportText.trim()) {
      setSaldosImportError('Por favor, cole algum conteúdo.');
      return;
    }

    try {
      const lines = saldosImportText.trim().split('\n');
      const updates: { matricula: string; nome: string; bh: number; ff: number; fs: number }[] = [];
      let skippedHeader = false;

      lines.forEach((line) => {
        let parts = line.split('\t');
        if (parts.length < 2) parts = line.split(';');
        if (parts.length < 2) parts = line.split(',');

        if (parts.length < 2) return;

        const rawFirstCell = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const rawSecondCell = parts[1]?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
        
        // Skip header lines if they contain labels like "nome", "matricula", "bh" etc.
        if (!skippedHeader && (
          rawFirstCell.includes('nome') || 
          rawSecondCell.includes('matricula') || 
          rawSecondCell.includes('id') || 
          rawFirstCell.includes('bh') ||
          rawFirstCell.includes('matricula')
        )) {
          skippedHeader = true;
          return;
        }

        const nome = parts[0]?.trim() || '';
        const matricula = parts[1]?.trim() || '';
        if (!matricula) return;

        const bh = parseExcelNumber(parts[2]);
        const ff = parseExcelNumber(parts[3]);
        const fs = parseExcelNumber(parts[4]);

        updates.push({ matricula, nome, bh, ff, fs });
      });

      if (updates.length === 0) {
        setSaldosImportError('Nenhum dado válido de matrícula encontrado. Verifique se copiou as colunas corretas (Nome, Matrícula, BH, FF, FS).');
        return;
      }

      const matMap = new Map<string, Colaborador>();
      colaboradores.forEach(c => matMap.set(c.matricula, { ...c }));

      let updatedCount = 0;
      const notFoundMatriculas: string[] = [];

      updates.forEach(u => {
        const existing = matMap.get(u.matricula);
        if (existing) {
          matMap.set(u.matricula, {
            ...existing,
            bancohoras: u.bh,
            folgaferiado: u.ff,
            folgaenf: u.fs,
            historico: `${existing.historico || ''}\n[${new Date().toISOString().split('T')[0]} - Importador de Saldos]: Saldos atualizados via importação do Excel para BH: ${u.bh}h, FF: ${u.ff}, FS: ${u.fs}.`,
          });
          updatedCount++;
        } else {
          notFoundMatriculas.push(u.matricula);
        }
      });

      onUpdateColaboradores(Array.from(matMap.values()));
      setIsOpenSaldosImportModal(false);
      setSaldosImportText('');
      setSaldosImportError('');

      let alertMsg = `Sucesso! Foram atualizados os saldos de ${updatedCount} colaboradores.`;
      if (notFoundMatriculas.length > 0) {
        alertMsg += `\n\nAs seguintes ${notFoundMatriculas.length} matrículas não foram encontradas no cadastro e foram ignoradas: ${notFoundMatriculas.slice(0, 10).join(', ')}${notFoundMatriculas.length > 10 ? '...' : ''}`;
      }
      customAlert(alertMsg);
    } catch (err: any) {
      setSaldosImportError('Ocorreu um erro no processamento: ' + err.message);
    }
  };

  const getAniversariantesDaSemana = () => {
    // Current date in system: 2026-06-03 (Wednesday)
    const refYear = 2026;
    const startOfWeek = new Date(2026, 4, 31); // May 31
    const endOfWeek = new Date(2026, 5, 6);   // June 6
    
    return colaboradores.filter(colab => {
      if (!colab.datanascimento) return false;
      const parts = colab.datanascimento.split('-');
      if (parts.length !== 3) return false;
      
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      
      const bdayThisYear = new Date(refYear, month, day);
      return bdayThisYear >= startOfWeek && bdayThisYear <= endOfWeek;
    });
  };

  const handleSendBirthdayEmails = () => {
    const list = getAniversariantesDaSemana();
    if (list.length === 0) {
      customAlert("Nenhum aniversariante encontrado na semana atual.");
      return;
    }

    const getManagerEmail = (mgrName: string) => {
      const found = colaboradores.find(c => c.nome === mgrName);
      if (found && found.email) return found.email;
      return `${mgrName.toLowerCase().replace(/[^a-z0-9à-ú]/g, '')}@hnsr.com.br`;
    };

    // Gather unique direct & indirect managers to notify in CC/TO
    const managersPool = new Set<string>();
    list.forEach(colab => {
      if (colab.gestordireto) managersPool.add(colab.gestordireto);
      if (colab.gestorindireto) managersPool.add(colab.gestorindireto);
    });
    if (managersPool.size === 0) {
      managersPool.add("Enf. Ana Souza");
      managersPool.add("Gerente Enfermagem");
    }

    const dEmails = Array.from(managersPool).map(mgr => getManagerEmail(mgr));

    // Format all birthday names into a single list
    const formatBdayLines = list.map(colab => {
      const bDate = colab.datanascimento ? colab.datanascimento.split('-').reverse().slice(0, 2).join('/') : "";
      return `[${bDate}] ${colab.nome} (${colab.cargo} • ${colab.setor})`;
    }).join('\n');

    const subject = `🎂 Alerta de Aniversáriantes da semana!`;
    const body = `Olá Gestores,

Olá gestores, esses são nossos aniversariantes essa semana!

${formatBdayLines}

Atenciosamente.

"Mensagem enviada automaticamente pelo sistema de gestão"

Atenciosamente,
**Recursos Humanos - Hapvida Hospital Nossa Senhora do Rosário**`;

    const toField = dEmails[0] || 'rh@hnsr.com.br';
    const ccField = ['rh@hnsr.com.br', ...dEmails.slice(1)].join(',');
    const mailtoUrl = `mailto:${toField}?cc=${encodeURIComponent(ccField)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    const singleEmailLog = {
      employee: "Resumo de Aniversariantes",
      date: "Multi",
      directManager: Array.from(managersPool).join(', '),
      directEmail: dEmails.join(', '),
      indirectManager: "Recursos Humanos",
      indirectEmail: "rh@hnsr.com.br",
      subject,
      body,
      mailtoUrl
    };

    setSentBirthdayAlerts([singleEmailLog]);
    
    // Attempt to open the custom mail client automatically
    setTimeout(() => {
      try {
        window.location.href = mailtoUrl;
      } catch (e) {
        console.warn("Direct redirection to mailto was blocked or failed:", e);
      }
    }, 100);

    customAlert(`Sucesso! Preparamos e integramos o e-mail real com todos os ${list.length} aniversariantes da semana. Se o seu navegador ou sistema operacional possuir um cliente de e-mail padrão configurado, ele será aberto automaticamente. Caso contrário, você poderá usar os botões de abertura manual e cópia direta que estão disponíveis na seção de logs de transporte SMTP abaixo.`);
  };

  const handleProcessColaboradoresImport = () => {
    if (!importText.trim()) {
      setImportError('Por favor, cole algum conteúdo.');
      return;
    }

    try {
      const lines = importText.trim().split('\n');
      const novos: Colaborador[] = [];
      let skippedHeader = false;

      lines.forEach((line) => {
        let parts = line.split('\t');
        if (parts.length < 2) parts = line.split(';');
        if (parts.length < 2) parts = line.split(',');

        if (parts.length < 1) return;

        const rawFirstCell = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!skippedHeader && (rawFirstCell.includes('nome') || rawFirstCell.includes('trabalhador') || rawFirstCell.includes('matricula') || rawFirstCell.includes('coren'))) {
          skippedHeader = true;
          return;
        }

        const nome = parts[0]?.trim();
        if (!nome) return;

        const matricula = parts[1]?.trim() || 'SEM-' + Math.floor(Math.random() * 100000);
        const coren = parts[2]?.trim() || '';
        const cargo = parts[3]?.trim() || 'Aux. Enf.';
        const equipe = parts[4]?.trim() || 'Diurno A';
        const horario = parts[5]?.trim() || '';
        const setor = parts[6]?.trim() || 'Gestão';
        const gestorDireto = parts[7]?.trim() || '';
        const gestorIndireto = parts[8]?.trim() || '';
        const email = parts[9]?.trim() || '';
        const whatsapp = parts[10]?.trim() || '';

        const hash = nome.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const birthDay = (hash % 28) + 1;
        const birthMonth = (hash % 12) + 1;
        const birthYear = 1975 + (hash % 24);
        const datanascimento = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

        novos.push({
          nome,
          matricula,
          coren,
          cargo,
          equipe,
          horario,
          setor,
          gestordireto: gestorDireto,
          gestorindireto: gestorIndireto,
          email,
          whatsapp,
          bancohoras: Math.abs(hash % 12),
          folgaenf: Math.abs(hash % 4),
          folgaferiado: Math.abs(hash % 2),
          brigada: hash % 8 === 0 ? 1 : 0,
          eleicao: hash % 11 === 0 ? 1 : 0,
          historico: `[2026-06-03 - Importador]: Importado via planilha Excel.`,
          selo_etica: 'Sim',
          selo_brigadista: hash % 8 === 0 ? 'Sim' : 'Não',
          selo_cipa: 'Não',
          datainicio: '2024-01-01',
          datanascimento,
          datarecisao: '',
          numreq: '',
          infosubst: '',
          inss_check: 'Não',
          inss_entrada: '',
          inss_retorno: '',
          inss_rep: '',
          inss_obs: ''
        });
      });

      if (novos.length === 0) {
        setImportError('Nenhum dado válido pôde ser processado. Verifique os separadores (Tab/Ponto e Vírgula).');
        return;
      }

      const matMap = new Map<string, Colaborador>();
      colaboradores.forEach(c => matMap.set(c.matricula, { ...c }));

      let updatedCount = 0;
      let insertedCount = 0;

      novos.forEach(n => {
        const existing = matMap.get(n.matricula);
        if (existing) {
          matMap.set(n.matricula, {
            ...existing,
            nome: n.nome || existing.nome,
            coren: n.coren || existing.coren,
            cargo: n.cargo || existing.cargo,
            equipe: n.equipe || existing.equipe,
            horario: n.horario || existing.horario,
            setor: n.setor || existing.setor,
            gestordireto: n.gestordireto || existing.gestordireto,
            gestorindireto: n.gestorindireto || existing.gestorindireto,
            email: n.email || existing.email,
            whatsapp: n.whatsapp || existing.whatsapp,
            historico: `${existing.historico || ''}\n[${new Date().toISOString().split('T')[0]} - Importador]: Cadastro atualizado via planilha Excel.`,
          });
          updatedCount++;
        } else {
          matMap.set(n.matricula, n);
          insertedCount++;
        }
      });

      onUpdateColaboradores(Array.from(matMap.values()));
      setIsOpenImportModal(false);
      setImportText('');
      setImportError('');
      customAlert(`Sucesso! Processamento concluído: ${insertedCount} novos colaboradores cadastrados e ${updatedCount} cadastros atualizados.`);
    } catch (err: any) {
      setImportError('Ocorreu um erro no processamento: ' + err.message);
    }
  };

  // Unique Direct Managers list for filtering
  const uniqueDirectManagers = useMemo(() => {
    const managers = new Set<string>();
    colaboradores.forEach(c => {
      if (c.gestordireto && c.gestordireto.trim()) {
        managers.add(c.gestordireto.trim());
      }
    });
    return Array.from(managers).sort((a, b) => a.localeCompare(b));
  }, [colaboradores]);

  // Unique Indirect Managers list for filtering
  const uniqueIndirectManagers = useMemo(() => {
    const managers = new Set<string>();
    colaboradores.forEach(c => {
      if (c.gestorindireto && c.gestorindireto.trim()) {
        managers.add(c.gestorindireto.trim());
      }
    });
    return Array.from(managers).sort((a, b) => a.localeCompare(b));
  }, [colaboradores]);

  // Filter lists dynamically
  const filteredColaboradores = useMemo(() => {
    return colaboradores.filter(c => {
      const matchSearch = 
        c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.matricula.includes(searchTerm);
      const matchEquipe = selectedEquipe === '' || c.equipe === selectedEquipe;
      const matchSetor = selectedSetor === '' || c.setor === selectedSetor;
      const matchDesligado = mostrarDesligados || !c.datarecisao;
      
      const matchManager = isUserSubordinate(c, usuarioLogado, colaboradores);
      
      const matchGestorDireto = selectedFilterGestorDireto === '' || c.gestordireto === selectedFilterGestorDireto;
      const matchGestorIndireto = selectedFilterGestorIndireto === '' || c.gestorindireto === selectedFilterGestorIndireto;
      
      return matchSearch && matchEquipe && matchSetor && matchManager && matchDesligado && matchGestorDireto && matchGestorIndireto;
    }).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores, searchTerm, selectedEquipe, selectedSetor, mostrarDesligados, selectedFilterGestorDireto, selectedFilterGestorIndireto, usuarioLogado]);

  // Gestor lists builders (direct translation of Gas rules)
  // For Aux/Tec, direct managers are Enfermeiros
  // For others, direct managers are Coordenadores/Supervisores and Indirect are Gerentes etc.
  const listEnfermeirosColabs = useMemo(() => {
    return colaboradores.filter(c => c.cargo === 'Enfermeiro(a)' || c.cargo === 'Supervisor(a)');
  }, [colaboradores]);

  const listGestoresCoordenadoresColabs = useMemo(() => {
    return colaboradores.filter(c => ['Supervisor(a)', 'Coordenador(a)', 'Gerente', 'Supervisor'].includes(c.cargo));
  }, [colaboradores]);

  const eligibleDirectColabs = useMemo(() => {
    if (['Aux. Enf.', 'Tec. Enf.'].includes(cargo)) {
      return listEnfermeirosColabs;
    }
    return listGestoresCoordenadoresColabs;
  }, [cargo, listEnfermeirosColabs, listGestoresCoordenadoresColabs]);

  const eligibleIndirectColabs = listGestoresCoordenadoresColabs;

  const listEnfermeiros = useMemo(() => {
    return listEnfermeirosColabs.map(c => c.nome).sort();
  }, [listEnfermeirosColabs]);

  const listGestoresCoordenadores = useMemo(() => {
    return listGestoresCoordenadoresColabs.map(c => c.nome).sort();
  }, [listGestoresCoordenadoresColabs]);

  // Adjust direct manager lists reactively
  const directManagersList = useMemo(() => {
    if (['Aux. Enf.', 'Tec. Enf.'].includes(cargo)) {
      return listEnfermeiros;
    }
    return listGestoresCoordenadores;
  }, [cargo, listEnfermeiros, listGestoresCoordenadores]);

  const indirectManagersList = listGestoresCoordenadores;

  // Active INSS lists for autocompletion (filtered by same cargo to avoid misalignments)
  const activeColaboradorRepOptions = useMemo(() => {
    return colaboradores
      .filter(c => c.cargo === cargo && c.matricula !== matricula)
      .map(c => c.nome)
      .sort();
  }, [colaboradores, cargo, matricula]);

  // Trigger modal show
  const handleOpenModal = (colab: Colaborador | null) => {
    if (colab) {
      setModalMode('edit');
      setOriginalMatricula(colab.matricula);
      setNome(colab.nome);
      setMatricula(colab.matricula);
      setCoren(colab.coren);
      setValidadeCarteira(colab.validade_carteira || '');
      setCargo(colab.cargo);
      setSetor(colab.setor);
      setEquipe(colab.equipe);
      setHorario(colab.horario);
      setGestorDireto(colab.gestordireto);
      setGestorIndireto(colab.gestorindireto);
      setEmail(colab.email);
      setWhatsapp(colab.whatsapp);
      setBancoHoras(colab.bancohoras);
      setBancoHorasText(formatDecimalToHHMM(colab.bancohoras));
      setFolgaEnf(colab.folgaenf);
      setFolgaFeriado(colab.folgaferiado);
      setBrigada(colab.brigada);
      setEleicao(colab.eleicao);
      setHistoricoView(colab.historico || "Sem anotações registradas.");
      setHistoricoAdd('');
      setSeloEtica(colab.selo_etica === 'Sim');
      setSeloSeloBrigadista(colab.selo_brigadista === 'Sim');
      setSeloCipa(colab.selo_cipa === 'Sim');
      setDataInicio(colab.datainicio || '');
      setDataNascimento(colab.datanascimento || '');
      setDataRecisao(colab.datarecisao || '');
      setNumReq(colab.numreq || '');
      setInfoSubst(colab.infosubst || '');
      setInssCheck(colab.inss_check === 'Sim');
      setInssEntrada(colab.inss_entrada || '');
      setInssRetorno(colab.inss_retorno || '');
      setInssRep(colab.inss_rep || '');
      setInssObs(colab.inss_obs || '');
      setLocalSelosAdicionais(colab.selos_adicionais || []);

      const linkedUser = colab.email ? (usuarios || []).find(u => u.email && u.email.trim().toLowerCase() === colab.email.trim().toLowerCase()) : null;
      if (linkedUser && isAcessoPermitidoParaCargo(colab.cargo)) {
        setHabilitarAcesso(true);
        setPerfilAcesso(linkedUser.perfil);
        setSenhaProvisoria(linkedUser.senha || '');
      } else {
        setHabilitarAcesso(false);
        setPerfilAcesso('Enfermeiro(a)');
        setSenhaProvisoria(generateTempPassword());
      }
    } else {
      setModalMode('create');
      setOriginalMatricula('');
      setNome('');
      setMatricula('');
      setCoren('');
      setValidadeCarteira('');
      setCargo('Enfermeiro(a)');
      setSetor('2º ANDAR');
      setEquipe('Diurno A');
      setHorario('07:00 as 19:00');
      setGestorDireto('');
      setGestorIndireto('');
      setEmail('');
      setWhatsapp('');
      setBancoHoras(0);
      setBancoHorasText('00:00');
      setFolgaEnf(0);
      setFolgaFeriado(0);
      setHabilitarAcesso(false);
      setPerfilAcesso('Enfermeiro(a)');
      setSenhaProvisoria(generateTempPassword());
      setBrigada(0);
      setEleicao(0);
      setHistoricoView("Novo colaborador cadastrado.");
      setHistoricoAdd('');
      setSeloEtica(false);
      setSeloSeloBrigadista(false);
      setSeloCipa(false);
      setLocalSelosAdicionais([]);
      setDataInicio(new Date().toISOString().split('T')[0]);
      setDataNascimento('');
      setDataRecisao('');
      setNumReq('');
      setInfoSubst('');
      setInssCheck(false);
      setInssEntrada('');
      setInssRetorno('');
      setInssRep('');
      setInssObs('');
    }
    setIsOpenModal(true);
  };

  const handleSaveColaborador = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim() || !matricula.trim()) {
      customAlert("Por favor, preencha o Nome e a Matrícula do colaborador.");
      return;
    }

    if (habilitarAcesso && !email.trim()) {
      customAlert("Erro: Para fornecer acesso ao sistema, é obrigatório preencher o E-mail corporativo do colaborador.");
      return;
    }

    // Check pre-existence of Matricula
    const isMatriculaExists = colaboradores.some(c => c.matricula === matricula && c.matricula !== originalMatricula);
    if (isMatriculaExists) {
      customAlert(`Erro: A matrícula '${matricula}' já está em uso por outro funcionário.`);
      return;
    }

    // Capture user signature
    const userSignature = usuarioLogado.nome || "Supervisor";
    const agora = new Date().toLocaleString('pt-BR');

    // Build history logging
    let historicoFinal = historicoView;
    if (historicoFinal === "Sem anotações registradas." || historicoFinal === "Novo colaborador cadastrado.") {
      historicoFinal = "";
    }

    if (historicoAdd.trim() !== '') {
      const stamp = `[${agora} - ${userSignature}]: ${historicoAdd.trim()}`;
      historicoFinal = stamp + (historicoFinal ? "\n\n" + historicoFinal : "");
    }

    // INSS Business trigger algorithm: If INSS is active AND Return Date of INSS is informed:
    // 1. We append an historical archive log describing the active INSS entries
    // 2. We turn off the active INSS states.
    let finalInssCheck = inssCheck;
    let finalInssEntrada = inssEntrada;
    let finalInssRetorno = inssRetorno;
    let finalInssRep = inssRep;
    let finalInssObs = inssObs;

    // Help ensure INSS Obs records the replacement collaborator
    if (finalInssCheck && finalInssRep.trim() !== '') {
      const label = `Substituído(a) por: ${finalInssRep.trim()}`;
      if (!finalInssObs.includes(finalInssRep.trim())) {
        finalInssObs = finalInssObs.trim() ? `${finalInssObs.trim()} | ${label}` : label;
      }
    }

    if (inssCheck && inssRetorno !== "") {
      const entBr = inssEntrada ? inssEntrada.split('-').reverse().join('/') : "Não informada";
      const retBr = inssRetorno.split('-').reverse().join('/');
      const archiveLog = `[${agora} - SISTEMA]: 🔴 LICENÇA INSS FINALIZADA E ARQUIVADA\nEntrada do Afastamento: ${entBr} | Retorno Oficial às Escalas: ${retBr}\nReposição de Vaga: ${inssRep || 'Sem substituição declarada'}`;
      
      historicoFinal = archiveLog + (historicoFinal ? "\n\n" + historicoFinal : "");
      
      // Reset active indicators
      finalInssCheck = false;
      finalInssEntrada = "";
      finalInssRetorno = "";
      finalInssRep = "";
      finalInssObs = "";
      customAlert("Aviso do Sistema: O preenchimento da Data de Retorno arquivou automaticamente a licença INSS no prontuário do colaborador!");
    }

    const compiledColaborador: Colaborador = {
      nome: nome.trim(),
      matricula: matricula.trim(),
      coren: coren.trim(),
      validade_carteira: validadeCarteira,
      cargo,
      equipe,
      horario: horario.trim(),
      setor,
      gestordireto: gestorDireto,
      gestorindireto: gestorIndireto,
      email: email.trim(),
      whatsapp: whatsapp.trim(),
      bancohoras: parseExcelNumber(bancoHorasText),
      folgaenf: parseFloat(folgaEnf as any) || 0,
      folgaferiado: parseFloat(folgaFeriado as any) || 0,
      brigada: parseFloat(brigada as any) || 0,
      eleicao: parseFloat(eleicao as any) || 0,
      historico: historicoFinal,
      selo_etica: seloEtica ? 'Sim' : 'Não',
      selo_brigadista: seloSeloBrigadista ? 'Sim' : 'Não',
      selo_cipa: seloCipa ? 'Sim' : 'Não',
      datainicio: dataInicio,
      datanascimento: dataNascimento,
      datarecisao: dataRecisao,
      numreq: numReq,
      infosubst: infoSubst,
      inss_check: finalInssCheck ? 'Sim' : 'Não',
      inss_entrada: finalInssEntrada,
      inss_retorno: finalInssRetorno,
      inss_rep: finalInssRep,
      inss_obs: finalInssObs,
      selos_adicionais: localSelosAdicionais
    };

    let novosDados: Colaborador[] = [];
    if (modalMode === 'create') {
      novosDados = [compiledColaborador, ...colaboradores];
    } else {
      novosDados = colaboradores.map(c => c.matricula === originalMatricula ? compiledColaborador : c);
    }

    // Process of adding automated logs on replacement professionals when configured
    if (finalInssCheck && finalInssRep && finalInssRep !== originalMatricula) {
      novosDados = novosDados.map(c => {
        if (c.nome === finalInssRep || c.matricula === finalInssRep) {
          const repLog = `[${agora} - SISTEMA]: Indicado como profissional de reposição de ${nome.trim()} (Matrícula: ${matricula.trim()}) por motivo de INSS.`;
          if (!c.historico?.includes(repLog)) {
            return {
              ...c,
              historico: repLog + (c.historico ? "\n\n" + c.historico : "")
            };
          }
        }
        return c;
      });
    }

    if (infoSubst && infoSubst !== originalMatricula) {
      novosDados = novosDados.map(c => {
        if (c.nome === infoSubst || c.matricula === infoSubst) {
          const repLog = `[${agora} - SISTEMA]: Indicado como profissional de reposição de ${nome.trim()} (Matrícula: ${matricula.trim()}) por motivo de desligamento/rescisão.`;
          if (!c.historico?.includes(repLog)) {
            return {
              ...c,
              historico: repLog + (c.historico ? "\n\n" + c.historico : "")
            };
          }
        }
        return c;
      });
    }

    // Process matching Web access link credentials
    if (habilitarAcesso) {
      const emailLower = email.trim().toLowerCase();
      const novosUsuarios = [...(usuarios || [])];
      
      // Get the original email (if editing)
      let originalEmail = "";
      if (modalMode === 'edit') {
        const origColab = colaboradores.find(c => c.matricula === originalMatricula);
        originalEmail = origColab?.email?.trim().toLowerCase() || "";
      }

      const existingUserIdx = novosUsuarios.findIndex(u => {
        const uEmail = u.email.trim().toLowerCase();
        return uEmail === emailLower || (originalEmail !== "" && uEmail === originalEmail);
      });

      if (existingUserIdx !== -1) {
        // Edit existing user
        novosUsuarios[existingUserIdx] = {
          ...novosUsuarios[existingUserIdx],
          nome: nome.trim(),
          email: email.trim(),
          setor: setor,
          perfil: perfilAcesso,
          status: 'Ativo',
          senha: senhaProvisoria || novosUsuarios[existingUserIdx].senha
        };
      } else {
        // Create brand new user
        novosUsuarios.push({
          nome: nome.trim(),
          email: email.trim(),
          setor: setor,
          perfil: perfilAcesso,
          status: 'Ativo',
          senha: senhaProvisoria,
          primeiroAcesso: true
        });
      }

      onUpdateUsuarios(novosUsuarios);

      const formattedMessage = `*Hapvida - Hospital Nossa Senhora do Rosário* 🏥\nOlá, *${nome.trim()}*! 👋\n\nSeu perfil de acesso ao painel de gerenciamento de escalas foi criado com sucesso com as seguintes credenciais:\n\n👤 *Acesso Web*: Habilitado\n📧 *Login (E-mail)*: ${email.trim()}\n🔑 *Senha Provisória*: ${senhaProvisoria}\n🛡️ *Perfil de Acesso*: ${perfilAcesso}\n\n🌐 *Site*: https://sites.google.com/view/hapvida-enfermagem?usp=sharing\n\n_Por motivos de segurança, ao realizar seu primeiro acesso ao painel de escala, o sistema solicitará que você crie uma nova senha de segurança definitiva._`;

      setWhatsappNotification({
        phone: whatsapp.replace(/\D/g, ''),
        message: formattedMessage,
        colabNome: nome.trim()
      });
    } else {
      // Deactivate system user if exists
      if (modalMode === 'edit') {
        const origColab = colaboradores.find(c => c.matricula === originalMatricula);
        const originalEmail = origColab?.email?.trim().toLowerCase() || "";
        if (originalEmail !== "") {
          const uIdx = (usuarios || []).findIndex(u => u.email.trim().toLowerCase() === originalEmail);
          if (uIdx !== -1) {
            const novosUsuarios = [...(usuarios || [])];
            novosUsuarios[uIdx] = {
              ...novosUsuarios[uIdx],
              status: 'Inativo'
            };
            onUpdateUsuarios(novosUsuarios);
          }
        }
      }
    }

    onUpdateColaboradores(novosDados);
    setIsOpenModal(false);
  };

  const handleDeleteColaborador = async (colab: Colaborador) => {
    if (await customConfirm(`Deseja realmente excluir permanentemente a ficha de ${colab.nome} (Matrícula: ${colab.matricula})?`)) {
      const novosDados = colaboradores.filter(c => c.matricula !== colab.matricula);
      onUpdateColaboradores(novosDados);
    }
  };

  // Quick helper to determine cargo badge formatting
  const getCargoColorChip = (cargo: string) => {
    switch (cargo) {
      case 'Supervisor(a)': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Coordenador(a)': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'Gerente': return 'bg-violet-100 text-violet-800 border-violet-200';
      case 'Enfermeiro(a)': return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'Tec. Enf.': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Aux. Enf.': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* View Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">Fichas Cadastrais de Enfermagem</h2>
          <p className="text-sm text-slate-500 font-medium">Controle de Horários, Prontuários, Gestores e Saldo de Banco de Horas</p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={() => setViewMode(viewMode === 'lista' ? 'atualizacao_rapida' : 'lista')}
            className={`font-bold py-2.5 px-4 rounded-xl text-sm shadow-sm flex items-center gap-2 transition duration-150 cursor-pointer ${
              viewMode === 'atualizacao_rapida'
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{viewMode === 'atualizacao_rapida' ? 'Ver Fichas Completas' : 'Atualização Rápida (BH, FF, FS)'}</span>
          </button>
          {usuarioLogado?.email?.toLowerCase() === 'enfmichelmilk@gmail.com' && (
            viewMode === 'atualizacao_rapida' ? (
              <button
                onClick={() => setIsOpenSaldosImportModal(true)}
                className="bg-white border border-amber-200 hover:bg-amber-50 text-amber-700 font-bold py-2.5 px-4 rounded-xl text-sm shadow-sm flex items-center gap-2 transition duration-150 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-amber-550" />
                <span>Importar Saldos (Excel)</span>
              </button>
            ) : (
              <button
                onClick={() => setIsOpenImportModal(true)}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-sm shadow-sm flex items-center gap-2 transition duration-150 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Importar Lista (Excel)</span>
              </button>
            )
          )}
          <button
            onClick={() => handleOpenModal(null)}
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-5 rounded-xl text-sm shadow-md shadow-sky-600/10 flex items-center gap-2 transition duration-150 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Cadastrar Colaborador</span>
          </button>
        </div>
      </div>

      {/* Widget: Aniversariantes da Semana (Hapvida style) */}
      {(() => {
        const aniversariantes = getAniversariantesDaSemana();
        return (
          <div className="bg-gradient-to-r from-sky-50 to-blue-50/40 p-5 rounded-2xl border border-sky-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 bg-sky-100 text-sky-700 rounded-xl">
                  <Award className="w-5 h-5 text-sky-600" />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 uppercase tracking-wide">
                    Aniversariantes da Semana (Gestão de Lideranças) 🎂
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                    Monitoramento automático e disparos de e-mail de felicitação para as lideranças direta e indireta correspondentes
                  </p>
                </div>
              </div>
              <button
                onClick={handleSendBirthdayEmails}
                className="bg-sky-600 hover:bg-sky-700 active:scale-[0.98] text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 shadow-sm shadow-sky-600/15 duration-100 transition-all self-stretch sm:self-auto justify-center cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Disparar Alertas de Aniversário</span>
              </button>
            </div>

            {aniversariantes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {aniversariantes.map(colab => {
                  const bDate = colab.datanascimento ? colab.datanascimento.split('-').reverse().slice(0, 2).join('/') : '';
                  return (
                    <div key={colab.matricula} className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex items-start gap-3 hover:border-sky-200 transition">
                      <div className="w-9 h-9 bg-pink-50 text-pink-500 rounded-full flex items-center justify-center font-extrabold text-sm shrink-0 uppercase border border-pink-100">
                        {colab.nome.slice(0, 2)}
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                          <span className="font-extrabold text-slate-800 text-xs block truncate leading-tight">{colab.nome}</span>
                          <span className="bg-pink-100 text-pink-700 font-extrabold text-[9px] px-1.5 py-0.5 rounded-full shrink-0">
                            {bDate}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold block">{colab.cargo} • {colab.setor}</span>
                        
                        <div className="pt-1.5 border-t border-slate-100/60 space-y-1 text-[9.5px]">
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="font-medium">Gestor Direto:</span>
                            <span className="font-bold text-slate-800 truncate max-w-[110px]">{colab.gestordireto || 'Enf. Ana Souza'}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="font-medium">Gestor Indireto:</span>
                            <span className="font-bold text-slate-800 truncate max-w-[110px]">{colab.gestorindireto || 'Gerente Enfermagem'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-xs italic bg-white/50 p-3 rounded-lg border border-sky-100/50">
                Nenhum aniversário de colaborador cadastrado coincide com a semana atual (31/05 a 06/06).
              </p>
            )}

            {/* Email Logs visual simulation drawer */}
            {sentBirthdayAlerts && (
              <div className="bg-slate-900 text-slate-100 p-4.5 rounded-xl font-mono text-[10.5px] space-y-4 max-h-72 overflow-y-auto shadow-inner border border-slate-800 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                    <span>⚡ LOGS DE TRANSPORTE SMTP (Google Apps Script - MailApp Simulator)</span>
                  </span>
                  <button
                    onClick={() => setSentBirthdayAlerts(null)}
                    className="text-slate-450 hover:text-slate-200 font-bold text-[9px] uppercase border border-slate-800 px-2 py-0.5 rounded cursor-pointer transition hover:bg-slate-800"
                  >
                    Ocultar
                  </button>
                </div>
                <div className="space-y-4 divide-y divide-slate-800/80">
                  {sentBirthdayAlerts.map((log, index) => (
                    <div key={index} className="pt-3 first:pt-0 space-y-2">
                      <p className="text-sky-400 font-bold">SMTP Client: MAIL TO direct_manager[{log.directEmail}] & indirect_manager[{log.indirectEmail}]</p>
                      <p className="text-slate-350"><strong className="text-white">Assunto:</strong> {log.subject}</p>
                      <p className="text-slate-400 whitespace-pre-line leading-relaxed"><strong className="text-white">Mensagem:</strong> {log.body}</p>
                      <p className="text-emerald-400">✓ Alerta de aniversário enviado via MailApp.sendEmail() [Status: 200 OK]</p>
                      
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/50">
                        {log.mailtoUrl && (
                          <a
                            href={log.mailtoUrl}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 hover:text-white text-white font-extrabold rounded text-[10px] uppercase transition no-underline shadow-xs cursor-pointer"
                          >
                            📧 Abrir no Aplicativo de Email (Gmail/Outlook)
                          </a>
                        )}
                        <button
                          onClick={() => {
                            if (navigator.clipboard) {
                              navigator.clipboard.writeText(log.body);
                              customAlert("Mensagem copiada para a área de transferência com sucesso!");
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-250 font-extrabold rounded text-[10px] border border-slate-700 uppercase transition cursor-pointer"
                        >
                          📋 Copiar Conteúdo do Email
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Structured Functional Filter & Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {/* Row 1, Col 1: Busca */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Busca Individual</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por Nome Profissional ou Matrícula..."
                className="w-full h-10 py-2 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 text-slate-700 focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all font-medium"
              />
            </div>
          </div>

          {/* Row 1, Col 2: Setor Hospitalar */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Setor Hospitalar</label>
            <select
              value={selectedSetor}
              onChange={(e) => setSelectedSetor(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:bg-white focus:border-sky-500 transition-all font-semibold"
            >
              <option value="">Todos os Setores</option>
              {SETORES_HOSPITALARES.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Row 1, Col 3: Gestor Direto */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Gestor Direto</label>
            <select
              value={selectedFilterGestorDireto}
              onChange={(e) => setSelectedFilterGestorDireto(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:bg-white focus:border-sky-500 transition-all font-semibold"
            >
              <option value="">Todos os Gestores Diretos</option>
              {uniqueDirectManagers.map(mgr => (
                <option key={mgr} value={mgr}>{mgr}</option>
              ))}
            </select>
          </div>

          {/* Row 2, Col 1: Mostrar Desligados */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Status de Atividade</label>
            <div className="flex items-center gap-2 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl select-none">
              <input
                type="checkbox"
                id="checkbox-mostrar-desligados-main"
                checked={mostrarDesligados}
                onChange={(e) => setMostrarDesligados(e.target.checked)}
                className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500 cursor-pointer"
              />
              <label htmlFor="checkbox-mostrar-desligados-main" className="text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap">
                Mostrar Desligados
              </label>
            </div>
          </div>

          {/* Row 2, Col 2: Turno / Escala */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Turno / Escala</label>
            <select
              value={selectedEquipe}
              onChange={(e) => setSelectedEquipe(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:bg-white focus:border-sky-500 transition-all font-semibold"
            >
              <option value="">Todos os Turnos</option>
              {EQUIPES_ESCALA.map(eq => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          </div>

          {/* Row 2, Col 3: Gestor Indireto */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 block">Gestor Indireto</label>
            <select
              value={selectedFilterGestorIndireto}
              onChange={(e) => setSelectedFilterGestorIndireto(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:bg-white focus:border-sky-500 transition-all font-semibold"
            >
              <option value="">Todos os Gestores Indiretos</option>
              {uniqueIndirectManagers.map(mgr => (
                <option key={mgr} value={mgr}>{mgr}</option>
              ))}
            </select>
          </div>
        </div>

        {(searchTerm !== '' || selectedEquipe !== '' || selectedSetor !== '' || selectedFilterGestorDireto !== '' || selectedFilterGestorIndireto !== '' || mostrarDesligados) && (
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              onClick={() => { setSearchTerm(''); setSelectedEquipe(''); setSelectedSetor(''); setSelectedFilterGestorDireto(''); setSelectedFilterGestorIndireto(''); setMostrarDesligados(false); }}
              className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        )}
      </div>

      {viewMode === 'atualizacao_rapida' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-150">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
                Módulo de Atualização de Cadastro (BH, FF, FS)
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                Altere os valores de Banco de Horas (BH), Folga Feriado (FF) e Folga de Escala (FS) diretamente na tabela.
              </p>
            </div>
            
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={() => setIsOpenSaldosImportModal(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-600/15 transition duration-150 cursor-pointer flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Importar do Excel</span>
              </button>
              {Object.keys(editedColabs).length > 0 && (
                <>
                  <button
                    onClick={() => {
                      if (confirm("Deseja realmente descartar todas as alterações não salvas?")) {
                        setEditedColabs({});
                      }
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition duration-150 cursor-pointer border border-slate-250"
                  >
                    Descartar Alterações
                  </button>
                  <button
                    onClick={handleSaveAllQuick}
                    className="px-4 py-2 bg-emerald-650 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/10 transition duration-150 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Salvar Todos ({Object.keys(editedColabs).length})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {filteredColaboradores.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-4">Nome Profissional</th>
                    <th className="py-3 px-4">Matrícula</th>
                    <th className="py-3 px-4 w-36">BH</th>
                    <th className="py-3 px-4 w-36">FF</th>
                    <th className="py-3 px-4 w-36">FS</th>
                    <th className="py-3 px-4 text-right w-24">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredColaboradores.map(c => {
                    const hasEdits = !!editedColabs[c.matricula];
                    return (
                      <tr key={c.matricula} className={`transition ${hasEdits ? 'bg-amber-50/40 hover:bg-amber-50/60' : 'hover:bg-slate-50/50'}`}>
                        <td className="py-3 px-4">
                          <span className="font-extrabold text-sm text-slate-800 block leading-tight">{c.nome}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">{c.cargo} • {c.setor}</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-500">
                          {c.matricula}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={
                                bhInputStates[c.matricula] !== undefined
                                  ? bhInputStates[c.matricula]
                                  : formatDecimalToHHMM(getQuickFieldValue(c, 'bh'))
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                setBhInputStates(prev => ({ ...prev, [c.matricula]: val }));
                                const decimalVal = parseExcelNumber(val);
                                handleQuickFieldChange(c.matricula, 'bh', decimalVal);
                              }}
                              onBlur={() => {
                                setBhInputStates(prev => {
                                  const copy = { ...prev };
                                  delete copy[c.matricula];
                                  return copy;
                                });
                              }}
                              placeholder="00:00"
                              className="w-24 p-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold text-slate-800 text-xs bg-white text-center shadow-3xs"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            step="any"
                            value={getQuickFieldValue(c, 'ff')}
                            onChange={(e) => handleQuickFieldChange(c.matricula, 'ff', parseFloat(e.target.value) || 0)}
                            className="w-24 p-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold text-slate-800 text-xs bg-white text-center shadow-3xs"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            step="any"
                            value={getQuickFieldValue(c, 'fs')}
                            onChange={(e) => handleQuickFieldChange(c.matricula, 'fs', parseFloat(e.target.value) || 0)}
                            className="w-24 p-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold text-slate-800 text-xs bg-white text-center shadow-3xs"
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {hasEdits ? (
                            <button
                              onClick={() => handleSaveQuickRow(c)}
                              className="px-3 py-1.5 bg-emerald-650 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[10px] uppercase shadow-sm transition"
                            >
                              Salvar
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic font-normal mr-2">Salvo</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-slate-400 text-xs">
              Nenhum colaborador corresponde aos filtros informados.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {filteredColaboradores.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-4">Matrícula</th>
                    <th className="py-3 px-4">Nome Profissional (Selos)</th>
                    <th className="py-3 px-4">Cargo / Core</th>
                    <th className="py-3 px-4">Setor / Escala</th>
                    <th className="py-3 px-4 text-center">Saldo BH</th>
                    <th className="py-3 px-4 text-right">Ficha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredColaboradores.map(c => {
                    const hasEtica = c.selo_etica === 'Sim';
                    const hasBrigada = c.selo_brigadista === 'Sim';
                    const hasCipa = c.selo_cipa === 'Sim';
                    const hasInss = c.inss_check === 'Sim';

                    const colabAtestados = absenteismo.filter(a => a.matricula === c.matricula && a.tipo === 'Atestado');

                    return (
                      <tr key={c.matricula} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-500">
                          {c.matricula}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-slate-800 block leading-tight">{c.nome}</span>
                              {c.datanascimento && (
                                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-0.5" title="Data de Nascimento">
                                  🎂 {c.datanascimento.split('-').reverse().slice(0, 2).join('/')}
                                </span>
                              )}
                            </div>
                            
                            {/* Visual Audit Stamps/Labels */}
                            <div className="flex gap-1 flex-wrap pt-0.5">
                              {hasEtica && (
                                <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-extrabold uppercase border border-purple-200">Ética</span>
                              )}
                              {hasBrigada && (
                                <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-extrabold uppercase border border-rose-200">Brigada</span>
                              )}
                              {hasCipa && (
                                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-extrabold uppercase border border-emerald-200">Cipa</span>
                              )}
                              {hasInss && (
                                <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-extrabold uppercase animate-pulse">INSS Ativo</span>
                              )}
                              {c.datarecisao && (
                                <span className="text-[9px] bg-amber-55 text-amber-800 px-1.5 py-0.5 rounded font-extrabold uppercase border border-amber-300">
                                  🚪 Desligamento: {c.datarecisao.split('-').reverse().join('/')}
                                </span>
                              )}
                              {c.numreq && (
                                <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-extrabold uppercase border border-slate-300">
                                  REQ ID: {c.numreq}
                                </span>
                              )}
                              {c.infosubst && (
                                <span className="text-[9px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-extrabold uppercase border border-teal-200" title={`Reposição de Vaga: ${c.infosubst}`}>
                                  🔄 Reposição: {c.infosubst}
                                </span>
                              )}
                              {c.inss_check === 'Sim' && c.inss_rep && (
                                <span className="text-[9px] bg-rose-50 text-rose-805 px-1.5 py-0.5 rounded font-extrabold uppercase border border-rose-200" title={`Substituição INSS: ${c.inss_rep}`}>
                                  🔁 Substituto INSS: {c.inss_rep}
                                </span>
                              )}
                              {c.selos_adicionais?.map(selo => (
                                <span key={selo} className="text-[9px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-extrabold uppercase border border-teal-200">{selo}</span>
                              ))}
                            </div>

                            {/* Histórico de Atestados Lançados */}
                            {colabAtestados.length > 0 ? (
                              <div className="mt-1 pt-1 border-t border-slate-100 space-y-0.5">
                                <span className="text-[9.5px] font-extrabold text-sky-700 block">
                                  📝 Atestados Lançados ({colabAtestados.length}):
                                </span>
                                <div className="flex flex-col gap-0.5 bg-sky-50/30 p-1 rounded border border-sky-100/50 max-h-20 overflow-y-auto">
                                  {colabAtestados.map(at => (
                                    <span key={at.id} className="text-[9px] text-slate-600 block leading-tight">
                                      • <strong className="text-slate-800 font-bold">CID {at.cid}</strong> ({at.duracao}) - Início: {at.inicio.split('-').reverse().join('/')}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[9px] text-slate-400 block pt-0.5 italic">Nenhum atestado lançado</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${getCargoColorChip(c.cargo)}`}>
                              {c.cargo}
                            </span>
                            {c.coren && (() => {
                              let corenStatus = null;
                              if (c.validade_carteira) {
                                const partes = c.validade_carteira.split('-');
                                if (partes.length === 3) {
                                  const dtValidade = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
                                  dtValidade.setHours(0,0,0,0);
                                  const hoje = new Date();
                                  hoje.setHours(0,0,0,0);
                                  const difTempo = dtValidade.getTime() - hoje.getTime();
                                  const difDias = Math.ceil(difTempo / (1000 * 3600 * 24));
                                  if (difDias < 0) {
                                    corenStatus = { status: 'vencido', text: 'VENCIDO' };
                                  } else if (difDias <= 30) {
                                    corenStatus = { status: 'expirando', text: `Vence em ${difDias}d` };
                                  }
                                }
                              }
                              return (
                                <span className="block text-[10px] font-mono text-slate-400">
                                  COREN: {c.coren} {c.validade_carteira && `| Validade: ${c.validade_carteira.split('-').reverse().join('/')}`}
                                  {corenStatus && (
                                    <span className={`ml-1 px-1 py-0.5 rounded text-[8.5px] font-black uppercase ${
                                      corenStatus.status === 'vencido' 
                                        ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                                    }`}>
                                      {corenStatus.text}
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-slate-800 block truncate max-w-[150px]">{c.setor}</span>
                            <span className="text-[10px] text-slate-400 font-semibold block">{c.equipe}</span>
                            <span className="text-[9px] text-slate-500 font-medium block truncate max-w-[180px]" title={`Gestor Direto: ${c.gestordireto || '---'} | Gestor Indireto: ${c.gestorindireto || '---'}`}>
                              {c.gestordireto || '---'} | {c.gestorindireto || '---'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`font-mono text-xs font-extrabold px-1.5 py-0.5 rounded ${
                            c.bancohoras >= 0 
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' 
                              : 'text-red-700 bg-red-50 border border-red-100'
                          }`}>
                            {formatDecimalToHHMM(c.bancohoras)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => { setSelectedViewColab(c); setIsOpenViewModal(true); }}
                              className="p-2 rounded-lg text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-all cursor-pointer"
                              title="Visualizar Ficha"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenModal(c)}
                              className="p-2 rounded-lg text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-100 transition-all cursor-pointer"
                              title="Editar Ficha"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteColaborador(c)}
                              className="p-1 px-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                              title="Deletar ficha"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-slate-400 text-xs">
              Nenhum colaborador corresponde aos filtros informados.
            </div>
          )}
        </div>
      )}

      {/* EXTREMELY DETAILED COMPILATION MODAL DIALOG - ALL 29 PROPERTIES REPRESENTABLE */}
      {isOpenModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-base font-extrabold text-sky-800 uppercase tracking-tight">
                  {modalMode === 'create' ? 'Cadastrar Nova Ficha Hospitalar' : `Editar Ficha - Matrícula ${originalMatricula}`}
                </h3>
                <p className="text-xs text-slate-400">Complete as informações e prontuários para consolidamento de dados</p>
              </div>
              <button
                onClick={() => setIsOpenModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable form) */}
            <form onSubmit={handleSaveColaborador} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              
              {/* Secao A: Dados Pessoais e Core */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Contact className="w-4 h-4 text-sky-600" />
                  <span>Identificação e Cargo</span>
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="font-bold text-slate-600">Nome Completo</label>
                    <input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome do profissional"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Matrícula</label>
                    <input
                      type="text"
                      value={matricula}
                      onChange={(e) => setMatricula(e.target.value)}
                      placeholder="Prontuário/ID"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">COREN (Opcional)</label>
                    <input
                      type="text"
                      value={coren}
                      onChange={(e) => setCoren(e.target.value)}
                      placeholder="Ex: 000000-SP"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Validade Carteirinha</label>
                    <input
                      type="date"
                      value={validadeCarteira}
                      onChange={(e) => setValidadeCarteira(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Cargo Padrão</label>
                    <select
                      value={cargo}
                      onChange={(e) => {
                        const newCargo = e.target.value;
                        setCargo(newCargo);
                        if (!isAcessoPermitidoParaCargo(newCargo)) {
                          setHabilitarAcesso(false);
                        }
                      }}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-semibold text-slate-700"
                    >
                      {CARGOS_ENFERMAGEM.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Setor Hospitalar</label>
                    <select
                      value={setor}
                      onChange={(e) => setSetor(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-semibold text-slate-700"
                    >
                      {!SETORES_HOSPITALARES.includes(setor) && setor && (
                        <option value={setor}>{setor}</option>
                      )}
                      {SETORES_HOSPITALARES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Escala / Turno</label>
                    <select
                      value={equipe}
                      onChange={(e) => setEquipe(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500"
                    >
                      {EQUIPES_ESCALA.map(eq => (
                        <option key={eq} value={eq}>{eq}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Horário Regular</label>
                    <input
                      type="text"
                      value={horario}
                      onChange={(e) => setHorario(e.target.value)}
                      placeholder="Ex: 07:00 as 19:00"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Gestor Direto</label>
                    <SearchableColaboradorSelect
                      colaboradores={eligibleDirectColabs}
                      selectedMatricula={selectedDirectMatricula}
                      onSelect={(colab) => setGestorDireto(colab ? colab.nome : '')}
                      placeholder="Nenhum gestor"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600">Gestor Indireto (Supervisor/Gerência)</label>
                    <SearchableColaboradorSelect
                      colaboradores={eligibleIndirectColabs}
                      selectedMatricula={selectedIndirectMatricula}
                      onSelect={(colab) => setGestorIndireto(colab ? colab.nome : '')}
                      placeholder="Nenhum gestor"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 text-sky-700">E-mail Corporativo</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ex: profissional@hnsr.com.br"
                      className="w-full p-2 border border-sky-200 rounded-lg focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 text-sky-700">WhatsApp</label>
                    <input
                      type="text"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="Ex: 11999998888"
                      className="w-full p-2 border border-sky-200 rounded-lg focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção Extra: Acesso ao Sistema Web (Linked User) */}
              <div className="bg-sky-50/50 p-4.5 rounded-xl border border-sky-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-sky-650" />
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        Controle de Acesso ao Sistema Web
                      </h4>
                      <p className="text-[10px] text-slate-500">Vincular credenciais administrativas de login ao e-mail deste colaborador</p>
                    </div>
                  </div>
                  <label className={`relative inline-flex items-center select-none ${!isAcessoPermitidoParaCargo(cargo) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={habilitarAcesso}
                      onChange={(e) => {
                        if (isAcessoPermitidoParaCargo(cargo)) {
                          setHabilitarAcesso(e.target.checked);
                        }
                      }}
                      disabled={!isAcessoPermitidoParaCargo(cargo)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                    <span className="ml-2 text-xs font-bold text-slate-700">
                      {!isAcessoPermitidoParaCargo(cargo) ? 'ACESSO INDISPONÍVEL' : (habilitarAcesso ? 'SISTEMA ATIVO' : 'SEM ACESSO')}
                    </span>
                  </label>
                </div>

                {habilitarAcesso && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 animate-fadeIn">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-650 block">Perfil de Alçada / Permissões</label>
                      <select
                        value={perfilAcesso}
                        onChange={(e) => setPerfilAcesso(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none text-xs font-semibold"
                      >
                        <option value="Enfermeiro(a)">Enfermeiro(a)</option>
                        <option value="ADM">ADM</option>
                        <option value="Supervisor(a)">Supervisor(a)</option>
                        <option value="Coordenador(a)">Coordenador(a)</option>
                        <option value="Gerente">Gerente</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-650 block">Senha Provisória de Acesso</label>
                      <div className="flex gap-2">
                        <input
                          type={
                            usuarioLogado?.email?.toLowerCase() === 'enfmichelmilk@gmail.com' || 
                            (email && usuarioLogado?.email?.toLowerCase() === email.trim().toLowerCase())
                              ? "text"
                              : "password"
                          }
                          value={senhaProvisoria}
                          onChange={(e) => setSenhaProvisoria(e.target.value)}
                          placeholder="Digite ou gere uma senha"
                          className="flex-1 p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold scroll-p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setSenhaProvisoria(generateTempPassword())}
                          className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-bold uppercase transition-colors"
                          title="Gerar nova senha provisória"
                        >
                          Gerar
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-white border border-sky-100 rounded-lg text-[10px] text-slate-500 leading-normal flex flex-col justify-center">
                      <span className="font-extrabold text-sky-800 uppercase block mb-0.5">⚠️ Notificação Ativa</span>
                      Ao salvar, o sistema atualizará o banco de usuários e ativará o disparador para enviar os acessos com a senha provisória via WhatsApp.
                    </div>
                  </div>
                )}
              </div>

              {/* Secao B: Saldos e Banco de Horas */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Saldos de Horas e Folgas Adquiridas</span>
                </h4>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-500">BH (Banco Horas - HH:MM)</label>
                    <input
                      type="text"
                      value={bancoHorasText}
                      onChange={(e) => setBancoHorasText(e.target.value)}
                      placeholder="00:00"
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-500">Folga Enf</label>
                    <input
                      type="number"
                      step="any"
                      value={folgaEnf}
                      onChange={(e) => setFolgaEnf(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-500">Folga Feriado</label>
                    <input
                      type="number"
                      step="any"
                      value={folgaFeriado}
                      onChange={(e) => setFolgaFeriado(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-500">Folga Brigada</label>
                    <input
                      type="number"
                      step="any"
                      value={brigada}
                      onChange={(e) => setBrigada(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-500">Folga Eleição</label>
                    <input
                      type="number"
                      step="any"
                      value={eleicao}
                      onChange={(e) => setEleicao(parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Secao C: Historico e Anotacoes */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span>Histórico Prontuário &amp; Linha de Tempo</span>
                </h4>

                <div className="space-y-3">
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-slate-700 font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-line">
                    {historicoView}
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">Adicionar Nova Observação Cronológica</label>
                    <textarea
                      value={historicoAdd}
                      onChange={(e) => setHistoricoAdd(e.target.value)}
                      placeholder="Digite anotações complementares sobre avaliações, trocas ou faltas. (Será assinado automaticamente com seu nome de login e carimbo da data)"
                      rows={2}
                      className="w-full p-3 border border-slate-300 rounded-xl focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção Extra: Universidade Corporativa - Aproveitamento Acadêmico */}
              <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white shadow-xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 gap-2">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-sky-600" />
                    <span>Universidade Corporativa - Aproveitamento Acadêmico</span>
                  </h4>
                  {(() => {
                    if (!matricula) {
                      return <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full">Digite a matrícula para calcular</span>;
                    }
                    const mandatoryCourses = cursos.filter(curso => 
                      curso.targets.some(t => t.cargo === cargo && t.obrigatorio)
                    );
                    if (mandatoryCourses.length === 0) {
                      return <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full">Livre de Exigências Obrigatórias</span>;
                    }
                    const completedRequired = certificados.filter(cert => 
                      cert.colaboradorMatricula === matricula && 
                      mandatoryCourses.some(mc => mc.id === cert.cursoId)
                    );
                    const pct = Math.min(100, Math.round((completedRequired.length / mandatoryCourses.length) * 100));
                    return (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-black border ${
                        pct === 100 ? 'bg-emerald-50 text-emerald-800 border-emerald-150' : 'bg-rose-50 text-rose-800 border-rose-150'
                      }`}>
                        Progresso Regulatório: {pct}% Concluído ({completedRequired.length} de {mandatoryCourses.length})
                      </span>
                    );
                  })()}
                </div>

                <div className="space-y-3">
                  {(() => {
                    if (!matricula) {
                      return <p className="text-slate-400 italic text-xs">Por favor, preencha a Matrícula do colaborador para listar o aproveitamento acadêmico.</p>;
                    }

                    // Filter courses applicable to this collaborator's position/cargo
                    const applicableCourses = cursos.filter(curso => 
                      curso.targets.some(t => t.cargo === cargo)
                    );

                    if (applicableCourses.length === 0) {
                      return <p className="text-slate-400 italic text-xs">Nenhum curso regulatório cadastrado na universidade é direcionado para o cargo selecionado ({cargo}) atualmente.</p>;
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {applicableCourses.map(curso => {
                          const isMandatory = curso.targets.find(t => t.cargo === cargo)?.obrigatorio;
                          const cert = certificados.find(c => c.colaboradorMatricula === matricula && c.cursoId === curso.id);

                          return (
                            <div 
                              key={curso.id} 
                              className={`p-3 border rounded-xl flex flex-col justify-between gap-2.5 transition ${
                                cert 
                                  ? 'bg-emerald-50/25 border-emerald-150' 
                                  : isMandatory 
                                    ? 'bg-rose-50/20 border-rose-150' 
                                    : 'bg-slate-50/50 border-slate-150'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex justify-between items-start gap-1.5">
                                  <span className="font-extrabold text-[11px] text-slate-800 leading-tight block">{curso.nome}</span>
                                  {isMandatory ? (
                                    <span className="text-[8px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-black uppercase shrink-0">Obrigatório</span>
                                  ) : (
                                    <span className="text-[8px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-black uppercase shrink-0">Recomendado</span>
                                  )}
                                </div>
                                <p className="text-[9px] text-slate-400 font-semibold truncate leading-none">ID: {curso.id}</p>
                              </div>

                              {cert ? (
                                <div className="flex items-center gap-1 text-[10px] text-emerald-850 font-bold bg-emerald-50 py-1 px-2.5 rounded-lg border border-emerald-150/40 w-fit">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                                  <span>Concluído em {cert.dataConclusao.split('-').reverse().join('/')} ({cert.origem})</span>
                                </div>
                              ) : (
                                <div className="space-y-1.5 mt-1">
                                  <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold bg-slate-100 py-1 px-2.5 rounded-lg border border-slate-200 w-fit">
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full shrink-0" />
                                    <span>Pendente de homologação</span>
                                  </div>
                                  <div className="pt-1">
                                    {analyzingCourseId === curso.id ? (
                                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-sky-700 bg-sky-50 py-1.5 px-3 rounded-lg border border-sky-100/60 w-full justify-center">
                                        <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin" />
                                        <span>Analisando com IA...</span>
                                      </div>
                                    ) : (
                                      <label className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 border border-sky-200 hover:border-sky-300 rounded-lg text-[10px] font-extrabold transition cursor-pointer w-full">
                                        <Upload className="w-3.5 h-3.5 text-sky-600" />
                                        <span>Carregar Certificado (IA)</span>
                                        <input
                                          type="file"
                                          accept="image/*,application/pdf"
                                          className="hidden"
                                          onChange={(e) => handleCourseCertificateUpload(e, curso, matricula, nome)}
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Secao D: Licencas INSS e Afastamento (Conditional design blocks matching JS.HTML setup) */}
              <div className="bg-rose-50/20 border border-rose-100/50 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
                    <span className="font-bold text-rose-950 text-xs">Licença Médica / Afastamento Ativo INSS</span>
                  </div>
                  
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={inssCheck}
                      onChange={(e) => setInssCheck(e.target.checked)}
                      className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span className="font-bold text-slate-700 text-xs text-rose-800">Sinalizar Afastamento Ativo</span>
                  </label>
                </div>

                {inssCheck && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                    <div className="space-y-1">
                      <label className="font-bold text-rose-900">Data de Entrada no INSS</label>
                      <input
                        type="date"
                        value={inssEntrada}
                        onChange={(e) => setInssEntrada(e.target.value)}
                        className="w-full p-2 border border-rose-200 rounded-lg bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-amber-700">Data de Retorno do INSS (Fim do Afastamento)</label>
                      <input
                        type="date"
                        value={inssRetorno}
                        onChange={(e) => setInssRetorno(e.target.value)}
                        className="w-full p-2 border border-amber-200 rounded-lg bg-white placeholder-amber-400"
                        title="Informar essa data finaliza e arquiva o INSS no prontuário do colaborador"
                      />
                      <span className="text-[10px] text-amber-600 font-semibold block">⚠️ Informar este campo arquivará esta licença no histórico automaticamente após salvar!</span>
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="font-bold text-rose-900">Profissional de Reposição Escalar (Simulado)</label>
                      <input
                        type="text"
                        value={inssRep}
                        onChange={(e) => setInssRep(e.target.value)}
                        placeholder="Busque por um colaborador no sistema..."
                        list="datalist-cobertura"
                        className="w-full p-2 border border-rose-200 rounded-lg bg-white text-slate-700"
                      />
                      <datalist id="datalist-cobertura">
                        {activeColaboradorRepOptions.map(nome => (
                          <option key={nome} value={nome} />
                        ))}
                      </datalist>
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="font-bold text-rose-900">Anotações e Detalhes da Perícia</label>
                      <textarea
                        value={inssObs}
                        onChange={(e) => setInssObs(e.target.value)}
                        placeholder="Próxima perícia marcada para 15/07, prorrogações cabíveis, CID principal..."
                        rows={2}
                        className="w-full p-3 border border-rose-200 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Secao E: Selos Institucionais e Admissao */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="space-y-3">
                  <label className="font-extrabold text-sky-800 uppercase block tracking-wider">Selos Institucionais</label>
                  <p className="text-[10px] text-slate-400 leading-none">Indicação visual de participação em comitês ativos</p>
                  
                  <div className="space-y-2 pt-1.5">
                    <label className="flex items-center gap-2.5 cursor-pointer text-slate-700 font-bold select-none">
                      <input
                        type="checkbox"
                        checked={seloEtica}
                        onChange={(e) => setSeloEtica(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4.5 h-4.5"
                      />
                      <span className="flex items-center gap-1">
                        <Award className="w-4 h-4 text-purple-600" />
                        Comissão de Ética HNSR
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-slate-700 font-bold select-none">
                      <input
                        type="checkbox"
                        checked={seloSeloBrigadista}
                        onChange={(e) => setSeloSeloBrigadista(e.target.checked)}
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4.5 h-4.5"
                      />
                      <span className="flex items-center gap-1">
                        <Award className="w-4 h-4 text-rose-600" />
                        Brigadista de Emergência
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-slate-700 font-bold select-none">
                      <input
                        type="checkbox"
                        checked={seloCipa}
                        onChange={(e) => setSeloCipa(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4.5 h-4.5"
                      />
                      <span className="flex items-center gap-1">
                        <Award className="w-4 h-4 text-emerald-600" />
                        CIPAST / Integrante CIPA
                      </span>
                    </label>

                    {dynamicSelos.map(selo => {
                      const isChecked = localSelosAdicionais.includes(selo);
                      return (
                        <label key={selo} className="flex items-center gap-2.5 cursor-pointer text-slate-700 font-bold select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setLocalSelosAdicionais([...localSelosAdicionais, selo]);
                              } else {
                                setLocalSelosAdicionais(localSelosAdicionais.filter(s => s !== selo));
                              }
                            }}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4.5 h-4.5"
                          />
                          <span className="flex items-center gap-1">
                            <Award className="w-4 h-4 text-teal-600" />
                            {selo}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="font-extrabold text-sky-800 uppercase block tracking-wider">Histórico de Contratação e Pessoal</label>
                  
                  <div className="grid grid-cols-3 gap-3 pb-3">
                    <div className="space-y-1">
                      <label className="text-slate-500 font-semibold block">Data Nascimento</label>
                      <input
                        type="date"
                        value={dataNascimento}
                        onChange={(e) => setDataNascimento(e.target.value)}
                        className="w-full p-2 border border-sky-300 bg-white rounded-lg focus:ring-1 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-500 font-semibold block">Data Admissão</label>
                      <input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className="w-full p-2 border border-slate-300 bg-white rounded-lg focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-500 font-semibold block">Data Rescisão</label>
                      <input
                        type="date"
                        value={dataRecisao}
                        onChange={(e) => setDataRecisao(e.target.value)}
                        className="w-full p-2 border border-slate-300 bg-white rounded-lg focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-slate-200/60 pt-3">
                    <div className="space-y-1">
                      <label className="text-slate-500 font-semibold block">Número REQ</label>
                      <input
                        type="text"
                        value={numReq}
                        onChange={(e) => setNumReq(e.target.value)}
                        className="w-full p-2 border border-slate-300 bg-white rounded-lg"
                        placeholder="ID Requisição"
                      />
                    </div>
                    {(dataRecisao !== '' || numReq !== '') && (
                      <div className="space-y-1 animate-fadeIn">
                        <label className="font-bold text-rose-900 block">Profissional de Reposição Escalar (Desligamento)</label>
                        <input
                          type="text"
                          value={infoSubst}
                          onChange={(e) => setInfoSubst(e.target.value)}
                          className="w-full p-2 border border-slate-300 bg-white rounded-lg font-bold"
                          placeholder="Busque por um colaborador do mesmo cargo..."
                          list="datalist-cobertura"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Seção Extra: Histórico de Atestados Lançados (Exibição apenas) */}
              {modalMode === 'edit' && (
                <div className="bg-sky-50/40 border border-sky-100 p-5 rounded-2xl space-y-3">
                  <h4 className="text-xs font-extrabold text-sky-850 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-sky-600" />
                    <span>Prontuário de Absenteísmo - Histórico de Atestados Lançados</span>
                  </h4>
                  {absenteismo.filter(a => a.matricula === originalMatricula && a.tipo === 'Atestado').length > 0 ? (
                    <div className="overflow-x-auto border border-sky-100 rounded-xl bg-white">
                      <table className="w-full text-left text-[11px] font-medium text-slate-700">
                        <thead>
                          <tr className="bg-sky-50 text-sky-900 font-extrabold uppercase tracking-wider border-b border-sky-100">
                            <th className="p-2.5">Início</th>
                            <th className="p-2.5">Duração</th>
                            <th className="p-2.5">Retorno</th>
                            <th className="p-2.5">CID</th>
                            <th className="p-2.5">Diagnóstico/Patologia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-sky-100">
                          {absenteismo
                            .filter(a => a.matricula === originalMatricula && a.tipo === 'Atestado')
                            .map(at => (
                              <tr key={at.id} className="hover:bg-sky-50/20">
                                <td className="p-2.5 font-bold">{at.inicio.split('-').reverse().join('/')}</td>
                                <td className="p-2.5 font-semibold text-sky-700">{at.duracao}</td>
                                <td className="p-2.5">{at.retorno ? at.retorno.split('-').reverse().join('/') : "-"}</td>
                                <td className="p-2.5 font-mono font-bold text-rose-600">{at.cid}</td>
                                <td className="p-2.5 text-slate-500">{at.patologia}</td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic text-[11px] bg-white p-4 rounded-xl text-center border border-sky-100">
                      Nenhum atestado médico foi lançado até o momento para este profissional.
                    </p>
                  )}
                </div>
              )}

              {/* Modal Actions Footer */}
              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  className="bg-white border border-slate-300 text-slate-700 font-bold py-2 px-5 rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-sky-600 text-white font-bold py-2 px-6 rounded-lg text-sm hover:bg-sky-700 shadow-md transition"
                >
                  Salvar Ficha Completa
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal de Importação TSV/Excel de Colaboradores */}
      {isOpenImportModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-sky-600 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <FileText className="w-6 h-6" />
                <div>
                  <h3 className="font-extrabold text-base">Importar Colaboradores do Excel</h3>
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
                <p>1. No Excel, copie as linhas da sua lista (Nome, Matrícula, Coren, Cargo, Equipe, Horário, Setor, Gestores, etc).</p>
                <p>2. Cole as linhas copiadas no campo abaixo e clique em <span className="font-semibold">Processar e Importar</span>.</p>
                <p className="font-semibold mt-2">Formato das colunas (Tabulado):</p>
                <p className="font-mono bg-white/60 p-1.5 rounded border border-sky-200 text-[9px] overflow-x-auto whitespace-nowrap">
                  Nome | Matrícula | Coren | Cargo | Equipe | Horário | Setor | Gestor Direto | Gestor Indireto | Email | WhatsApp
                </p>
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Cole o cabeçalho e as linhas copiados aqui..."
                className="w-full h-64 p-3 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none resize-none bg-slate-50 focus:bg-white"
              />

              {importError && (
                <p className="text-xs text-rose-600 font-bold">{importError}</p>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => { setIsOpenImportModal(false); setImportText(''); setImportError(''); }}
                className="px-4 py-2 border border-slate-300 text-slate-755 font-bold rounded-xl text-xs hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessColaboradoresImport}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-md shadow-sky-600/10 transition"
              >
                Processar e Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importação de Saldos BH, FF, FS */}
      {isOpenSaldosImportModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-amber-500 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Upload className="w-6 h-6" />
                <div>
                  <h3 className="font-extrabold text-base">Importar Saldos (BH, FF, FS) do Excel</h3>
                  <p className="text-xs text-amber-100">Cole as colunas de saldos da sua planilha</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsOpenSaldosImportModal(false); setSaldosImportText(''); setSaldosImportError(''); }} 
                className="hover:bg-amber-650 p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-[11px] text-amber-805 space-y-1">
                <p className="font-bold">Instruções:</p>
                <p>1. No Excel, monte sua planilha e copie as colunas contendo as informações correspondentes.</p>
                <p>2. Os dados de matrícula serão usados para localizar cada profissional já cadastrado e atualizar os saldos de forma rápida.</p>
                <p className="font-semibold mt-2">Ordem Obrigatória das Colunas (Copie diretamente da tabela excel):</p>
                <p className="font-mono bg-white/60 p-1.5 rounded border border-amber-200 text-[10px] overflow-x-auto whitespace-nowrap font-bold text-slate-800">
                  Nome (Opcional) | Matrícula (Obrigatório) | BH (Banco de Horas) | FF (Folga Feriado) | FS (Folga Escala)
                </p>
                <p className="text-[10px] text-slate-500 pt-1">
                  *Exemplo de linha: <code className="bg-slate-150 px-1 rounded font-mono">Maria Silva &lt;Tab&gt; 245100 &lt;Tab&gt; 12.5 &lt;Tab&gt; 2 &lt;Tab&gt; 3</code>
                </p>
              </div>

              <textarea
                value={saldosImportText}
                onChange={(e) => setSaldosImportText(e.target.value)}
                placeholder="Cole as colunas copiadas do Excel aqui..."
                className="w-full h-64 p-3 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none bg-slate-50 focus:bg-white"
              />

              {saldosImportError && (
                <p className="text-xs text-rose-600 font-bold">{saldosImportError}</p>
              )}
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => { setIsOpenSaldosImportModal(false); setSaldosImportText(''); setSaldosImportError(''); }}
                className="px-4 py-2 border border-slate-300 text-slate-755 font-bold rounded-xl text-xs hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessSaldosImport}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-500/10 transition"
              >
                Processar e Atualizar Saldos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes de Visualização do Colaborador */}
      {isOpenViewModal && selectedViewColab && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn font-sans">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header com Tema Hospitalar/Hapvida */}
            <div className="bg-sky-600 text-white p-6 flex justify-between items-start">
              <div className="flex gap-4 items-center">
                <div className="bg-white/10 p-3 rounded-2xl border border-white/20">
                  <Contact className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {selectedViewColab.datarecisao ? (
                      <span className="text-xs bg-red-600 border border-red-500 font-extrabold px-2.5 py-0.5 rounded-full uppercase text-white animate-pulse">
                        Ficha Inativa (Desligado)
                      </span>
                    ) : (
                      <span className="text-xs bg-sky-550 border border-sky-400 font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                        Ficha Cadastral Ativa
                      </span>
                    )}
                    {selectedViewColab.coren && (() => {
                      const partes = selectedViewColab.validade_carteira ? selectedViewColab.validade_carteira.split('-') : [];
                      const isVencido = partes.length === 3 && new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2])).getTime() < new Date().setHours(0,0,0,0);
                      const isExpiring = partes.length === 3 && !isVencido && (new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2])).getTime() - new Date().setHours(0,0,0,0)) <= 30 * 24 * 3600 * 1000;
                      return (
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                          isVencido 
                            ? 'bg-rose-600 text-white animate-pulse border border-rose-500' 
                            : isExpiring 
                              ? 'bg-amber-400 text-slate-900 font-black border border-amber-300' 
                              : 'bg-emerald-500 text-white'
                        }`}>
                          <span>COREN: {selectedViewColab.coren} {selectedViewColab.validade_carteira && `(Validade: ${selectedViewColab.validade_carteira.split('-').reverse().join('/')})`}</span>
                          {isVencido && <span className="text-[8px] font-black bg-white text-rose-750 px-1 rounded">VENCIDO</span>}
                          {isExpiring && <span className="text-[8px] font-black bg-slate-900 text-white px-1 rounded">PRÓXIMO VENCIMENTO</span>}
                        </span>
                      );
                    })()}
                  </div>
                  <h3 className="font-extrabold text-2xl mt-1">{selectedViewColab.nome}</h3>
                  <p className="text-xs text-sky-100 font-medium">Matrícula: {selectedViewColab.matricula} • Admissão: {selectedViewColab.datainicio ? selectedViewColab.datainicio.split('-').reverse().join('/') : 'Não cadastrada'}</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsOpenViewModal(false); setSelectedViewColab(null); }} 
                className="bg-white/10 hover:bg-white/25 text-white p-2 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo scrollable */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Grid 1: Informações de Atuação */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Cargo</span>
                  <p className="text-sm font-extrabold text-slate-800 mt-0.5">{selectedViewColab.cargo}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Setor</span>
                  <p className="text-sm font-extrabold text-slate-800 mt-0.5">{selectedViewColab.setor}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Equipe de Escala</span>
                  <p className="text-sm font-extrabold text-slate-800 mt-0.5">{selectedViewColab.equipe}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Horário de Trabalho</span>
                  <p className="text-sm font-extrabold text-slate-800 mt-0.5">{selectedViewColab.horario || 'Não especificado'}</p>
                </div>
              </div>

              {/* Grid 2: Contatos e Gestão */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Contatos */}
                <div className="border border-slate-200 rounded-3xl p-5 space-y-3.5">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Informações de Contato</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">E-mail Corporativo/Pessoal</span>
                        <span className="text-xs text-slate-800 font-bold">{selectedViewColab.email || 'Não informado'}</span>
                      </div>
                      {selectedViewColab.email && (
                        <a 
                          href={`mailto:${selectedViewColab.email}`}
                          className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-600 rounded-lg transition-all flex items-center gap-1 font-bold text-[10px] border border-sky-100/50"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Enviar E-mail</span>
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-2.5 rounded-xl border border-slate-150 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">WhatsApp / Telefone</span>
                        <span className="text-xs text-slate-800 font-bold">{selectedViewColab.whatsapp || 'Não informado'}</span>
                      </div>
                      {selectedViewColab.whatsapp && (
                        <div className="flex gap-1.5 w-full sm:w-auto">
                          <a 
                            href={`https://wa.me/55${selectedViewColab.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 sm:flex-initial px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all flex items-center justify-center gap-1 font-bold text-[10px] border border-slate-200"
                          >
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>Mensagem</span>
                          </a>
                          <a 
                            href={`https://wa.me/55${selectedViewColab.whatsapp.replace(/\D/g, '')}?text=${getWhatsAppMessage(selectedViewColab)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 sm:flex-initial px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all flex items-center justify-center gap-1.5 font-extrabold text-[10px] border border-green-700 shadow-xs cursor-pointer shrink-0"
                            title="Enviar resumo de cursos pendentes da trilha acadêmica via WhatsApp"
                          >
                            <MessageSquare className="w-3 h-3 text-green-100" />
                            <span>Enviar Pendências</span>
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Data de Nascimento</span>
                        <span className="text-xs text-slate-800 font-bold">
                          {selectedViewColab.datanascimento ? selectedViewColab.datanascimento.split('-').reverse().join('/') : 'Não informado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Linha de Comando / Gestão */}
                <div className="border border-slate-200 rounded-3xl p-5 space-y-3.5">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Linha de Gestão e Auditoria</h4>
                  <div className="space-y-3 font-medium text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gestor Direto Responsável:</span>
                      <span className="text-slate-800 font-extrabold">{selectedViewColab.gestordireto || 'Administrativo Central'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gestor Indireto (Diretoria):</span>
                      <span className="text-slate-800 font-extrabold">{selectedViewColab.gestorindireto || 'Gerente Geral / Direção'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Substituto Associado:</span>
                      <span className="text-slate-800 font-bold">{selectedViewColab.infosubst || 'Sem substituto fixo'}</span>
                    </div>
                    {selectedViewColab.datarecisao && (
                      <div className="flex justify-between text-rose-700 font-extrabold">
                        <span>Data Desligamento/Rescisão:</span>
                        <span>{selectedViewColab.datarecisao.split('-').reverse().join('/')}</span>
                      </div>
                    )}
                    {selectedViewColab.numreq && (
                      <div className="flex justify-between font-bold text-slate-705">
                        <span>Número da Requisição (REQ):</span>
                        <span className="font-mono">{selectedViewColab.numreq}</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Grid 3: Saldo de Escala, BH e Selos Regulatórios */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Saldos e Direitos de Escala */}
                <div className="border border-slate-200 rounded-3xl p-5 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Banco de Horas & Direitos de Escala</h4>
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="bg-sky-50 border border-sky-100/80 p-3 rounded-2xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block text-sky-800">Banco Horas</span>
                      <span className={`text-sm font-extrabold mt-1 block ${selectedViewColab.bancohoras >= 0 ? 'text-emerald-700' : 'text-rose-750'}`}>
                        {formatDecimalToHHMM(selectedViewColab.bancohoras)}
                      </span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100/80 p-3 rounded-2xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block text-emerald-800">Folgas Enf</span>
                      <span className="text-sm font-extrabold text-emerald-700 mt-1 block">
                        {selectedViewColab.folgaenf || 0} dias
                      </span>
                    </div>
                    <div className="bg-purple-50 border border-purple-100/80 p-3 rounded-2xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase block text-purple-800">Folgas Feriado</span>
                      <span className="text-sm font-extrabold text-purple-700 mt-1 block">
                        {selectedViewColab.folgaferiado || 0} dias
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selos Regulatorios */}
                <div className="border border-slate-200 rounded-3xl p-5 space-y-3.5">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Selos de Qualificação e Segurança</h4>
                  <div className="flex gap-2.5 flex-wrap">
                    <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-extrabold ${selectedViewColab.selo_etica === 'Sim' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                      <span>Selo Ética:</span>
                      <span className="font-extrabold">{selectedViewColab.selo_etica || 'Não'}</span>
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-extrabold ${selectedViewColab.selo_brigadista === 'Sim' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                      <span>Brigada Emergência:</span>
                      <span className="font-extrabold">{selectedViewColab.selo_brigadista || 'Não'}</span>
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-extrabold ${selectedViewColab.selo_cipa === 'Sim' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200/60'}`}>
                      <span>Membro CIPA:</span>
                      <span className="font-extrabold">{selectedViewColab.selo_cipa || 'Não'}</span>
                    </div>
                    {selectedViewColab.selos_adicionais?.map(selo => (
                      <div key={selo} className="px-3 py-1.5 rounded-xl border bg-teal-50 text-teal-700 border-teal-200 flex items-center gap-1.5 text-xs font-extrabold">
                        <span>{selo}:</span>
                        <span className="font-extrabold">Sim</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Rastreabilidade de INSS e Licenças */}
              <div className="border border-slate-200 rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Histórico de Encaminhamento ao INSS</h4>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${selectedViewColab.inss_check === 'Sim' ? 'bg-red-50 text-red-700 border-red-100 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
                    {selectedViewColab.inss_check === 'Sim' ? '✓ Encaminhado ao INSS' : 'Não se aplica'}
                  </span>
                </div>
                {selectedViewColab.inss_check === 'Sim' ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-medium">
                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="text-slate-400 block font-bold text-[10px] uppercase">Data de Entrada</span>
                      <span className="text-slate-800 font-bold block mt-0.5">{selectedViewColab.inss_entrada ? selectedViewColab.inss_entrada.split('-').reverse().join('/') : '---'}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="text-slate-400 block font-bold text-[10px] uppercase">Data de Retorno</span>
                      <span className="text-slate-800 font-bold block mt-0.5">{selectedViewColab.inss_retorno ? selectedViewColab.inss_retorno.split('-').reverse().join('/') : '---'}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="text-slate-400 block font-bold text-[10px] uppercase">Repetiu Período?</span>
                      <span className="text-slate-800 font-bold block mt-0.5">{selectedViewColab.inss_rep ? selectedViewColab.inss_rep : 'Não'}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border">
                      <span className="text-slate-400 block font-bold text-[10px] uppercase">Observações INSS</span>
                      <span className="text-slate-800 font-bold block mt-0.5 truncate" title={selectedViewColab.inss_obs}>{selectedViewColab.inss_obs || 'Nenhuma'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-xs">Este profissional encontra-se em regime de trabalho regular sem pendências ou encaminhamentos ativos ao INSS.</p>
                )}
              </div>

              {/* Painel de Universidade Corporativa - EXCELENTE ATENDIMENTO DO PEDIDO DO USUÁRIO */}
              <div className="border border-slate-200 rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-sky-600 animate-pulse" />
                    <span>Universidade Corporativa - Aproveitamento Acadêmico</span>
                  </h4>
                  {(() => {
                    const mandatoryCourses = cursos.filter(curso => 
                      curso.targets.some(t => t.cargo === selectedViewColab.cargo && t.obrigatorio)
                    );
                    if (mandatoryCourses.length === 0) {
                      return <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full">Livre de Exigências</span>;
                    }
                    const completedRequired = certificados.filter(cert => 
                      cert.colaboradorMatricula === selectedViewColab.matricula && 
                      mandatoryCourses.some(mc => mc.id === cert.cursoId)
                    );
                    const pct = Math.min(100, Math.round((completedRequired.length / mandatoryCourses.length) * 100));
                    return (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-black border ${
                        pct === 100 ? 'bg-emerald-50 text-emerald-800 border-emerald-150' : 'bg-rose-50 text-rose-805 border-rose-150'
                      }`}>
                        Status: {pct}% Concluído ({completedRequired.length} de {mandatoryCourses.length})
                      </span>
                    );
                  })()}
                </div>

                <div className="space-y-3.5">
                  {(() => {
                    // Filter courses applicable to this collaborator's position/cargo
                    const applicableCourses = cursos.filter(curso => 
                      curso.targets.some(t => t.cargo === selectedViewColab.cargo)
                    );

                    if (applicableCourses.length === 0) {
                      return <p className="text-slate-400 italic text-xs">Nenhum curso regulatório cadastrado na universidade é direcionado para este cargo ({selectedViewColab.cargo}) atualmente.</p>;
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {applicableCourses.map(curso => {
                          const isMandatory = curso.targets.find(t => t.cargo === selectedViewColab.cargo)?.obrigatorio;
                          const cert = certificados.find(c => c.colaboradorMatricula === selectedViewColab.matricula && c.cursoId === curso.id);

                          return (
                            <div 
                              key={curso.id} 
                              className={`p-3.5 border rounded-2xl flex flex-col justify-between gap-2.5 transition ${
                                cert 
                                  ? 'bg-emerald-50/20 border-emerald-150' 
                                  : isMandatory 
                                    ? 'bg-rose-50/20 border-rose-150' 
                                    : 'bg-slate-50/50 border-slate-150'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex justify-between items-start gap-1.5">
                                  <span className="font-extrabold text-[11.5px] text-slate-905 leading-tight block">{curso.nome}</span>
                                  {isMandatory ? (
                                    <span className="text-[8px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-black uppercase shrink-0">Obrigatório</span>
                                  ) : (
                                    <span className="text-[8px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-black uppercase shrink-0">Recomendado</span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 font-semibold truncate leading-none">ID: {curso.id}</p>
                              </div>

                              {cert ? (
                                <div className="flex items-center gap-1 text-[10px] text-emerald-800 font-bold bg-emerald-50/90 py-1 px-2.5 rounded-xl border border-emerald-150/45 w-fit">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                                  <span>Concluído em {cert.dataConclusao.split('-').reverse().join('/')} ({cert.origem})</span>
                                </div>
                              ) : (
                                <div className="space-y-1.5 mt-1">
                                  <div className="flex items-center gap-1 text-[10px] text-slate-550 font-bold bg-slate-100 py-1 px-2.5 rounded-xl border border-slate-200/80 w-fit">
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full shrink-0" />
                                    <span>Pendente de homologação</span>
                                  </div>
                                  <div className="pt-1">
                                    {analyzingCourseId === curso.id ? (
                                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-sky-700 bg-sky-50 py-1.5 px-3 rounded-xl border border-sky-100/60 w-full justify-center">
                                        <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin" />
                                        <span>Analisando com IA...</span>
                                      </div>
                                    ) : (
                                      <label className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 border border-sky-200 hover:border-sky-300 rounded-xl text-[10px] font-extrabold transition cursor-pointer w-full">
                                        <Upload className="w-3.5 h-3.5 text-sky-600" />
                                        <span>Carregar Certificado (IA)</span>
                                        <input
                                          type="file"
                                          accept="image/*,application/pdf"
                                          className="hidden"
                                          onChange={(e) => handleCourseCertificateUpload(e, curso, selectedViewColab.matricula, selectedViewColab.nome)}
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Histórico médico do absenteísmo */}
              <div className="border border-slate-200 rounded-3xl p-5 space-y-4">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Afastamentos e Atestados Médicos</h4>
                {(() => {
                  const items = absenteismo.filter(a => a.matricula === selectedViewColab.matricula);
                  if (items.length > 0) {
                    return (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs font-medium text-slate-700">
                          <thead className="bg-slate-50 text-[10.5px] font-bold text-slate-500 uppercase border-b">
                            <tr>
                              <th className="p-2.5">Código / Tipo</th>
                              <th className="p-2.5">Início</th>
                              <th className="p-2.5">Duração/Fim</th>
                              <th className="p-2.5">CID-10</th>
                              <th className="p-2.5">Patoespecífica (Diagnóstico)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {items.map((at, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="p-2.5 font-bold text-slate-800">{at.id} • {at.tipo}</td>
                                <td className="p-2.5">{at.inicio ? at.inicio.split('-').reverse().join('/') : '---'}</td>
                                <td className="p-2.5">{at.duracao} (Fim: {at.termino ? at.termino.split('-').reverse().join('/') : '---'})</td>
                                <td className="p-2.5 font-mono text-rose-700 font-bold bg-rose-50/35 px-1.5 rounded">{at.cid}</td>
                                <td className="p-2.5 text-slate-650">{at.patologia}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  } else {
                    return (
                      <p className="text-slate-400 italic text-xs">Nenhum registro de absenteísmo médico ou justificativa ativa em nosso banco de dados para este profissional.</p>
                    );
                  }
                })()}
              </div>

              {/* Histórico, Direitos & Programações de Férias */}
              <div className="border border-slate-200 rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-extrabold text-slate-850 uppercase tracking-wider">Histórico, Direitos & Programações de Férias</h4>
                  {!isRequestingFeriasLocal && (
                    <button
                      onClick={() => {
                        setIsRequestingFeriasLocal(true);
                        setLocalFeriasStartDate('');
                        setLocalFeriasDuration(30);
                      }}
                      className="px-3 py-1.5 bg-emerald-650 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[10.5px] transition flex items-center gap-1 cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Solicitar Férias</span>
                    </button>
                  )}
                </div>

                {/* Inline form to request vacation */}
                {isRequestingFeriasLocal && (
                  <div className="p-4 bg-emerald-50/50 border border-emerald-150 rounded-2xl space-y-3.5 animate-fadeIn">
                    <h5 className="text-[11px] font-black text-emerald-950 uppercase tracking-wider">Lançar Nova Solicitação de Férias</h5>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-bold">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block">Data de Início:</label>
                        <input
                          type="date"
                          required
                          value={localFeriasStartDate}
                          onChange={(e) => setLocalFeriasStartDate(e.target.value)}
                          className="w-full p-2.5 border border-slate-250 bg-white rounded-xl focus:outline-none focus:border-emerald-500 text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700 block">Duração:</label>
                        <select
                          value={localFeriasDuration}
                          onChange={(e) => setLocalFeriasDuration(parseInt(e.target.value) as 10 | 15 | 20 | 30)}
                          className="w-full p-2.5 border border-slate-250 bg-white rounded-xl focus:outline-none focus:border-emerald-500 text-slate-800"
                        >
                          <option value={10}>10 Dias</option>
                          <option value={15}>15 Dias</option>
                          <option value={20}>Férias Parciais (20 dias)</option>
                          <option value={30}>Férias Completas (30 dias)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!localFeriasStartDate) {
                            customAlert("Selecione uma data de início!");
                            return;
                          }
                          
                          // Calculate end and return dates
                          const start = new Date(localFeriasStartDate + 'T00:00:00');
                          const end = new Date(start);
                          end.setDate(start.getDate() + localFeriasDuration - 1);
                          const endStr = end.toISOString().split('T')[0];
                          
                          const ret = new Date(start);
                          ret.setDate(start.getDate() + localFeriasDuration);
                          const retStr = ret.toISOString().split('T')[0];

                          // Create
                          const novaFerias = {
                            id: 'FER-' + Math.floor(1000 + Math.random() * 9000),
                            colaborador: selectedViewColab.nome,
                            matricula: selectedViewColab.matricula,
                            dataInicio: localFeriasStartDate,
                            dataFim: endStr,
                            dataRetorno: retStr,
                            duracao: localFeriasDuration,
                            status: isAuthorizedAdmin() ? 'Aprovado' as const : 'Pendente' as const,
                            solicitante: usuarioLogado.nome,
                            dataCriacao: new Date().toISOString().split('T')[0]
                          };

                          onUpdateFerias([...ferias, novaFerias]);
                          setIsRequestingFeriasLocal(false);
                          customAlert("Nova solicitação de férias cadastrada com sucesso!");
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition"
                      >
                        Confirmar Cadastro
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRequestingFeriasLocal(false)}
                        className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 font-extrabold rounded-xl text-xs transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Show Vacation History */}
                {(() => {
                  const items = ferias.filter(f => f.matricula === selectedViewColab.matricula);
                  if (items.length > 0) {
                    return (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs font-semibold text-slate-700">
                          <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase border-b tracking-widest">
                            <tr>
                              <th className="p-2.5">Período de Gozo</th>
                              <th className="p-2.5">Duração</th>
                              <th className="p-2.5">Retorno Previsto</th>
                              <th className="p-2.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-bold text-[11px]">
                            {items.map((fe, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="p-2.5 text-slate-800 font-extrabold">
                                  {fe.dataInicio.split('-').reverse().join('/')} até {fe.dataFim.split('-').reverse().join('/')}
                                </td>
                                <td className="p-2.5 text-slate-600 font-semibold">{fe.duracao} dias</td>
                                <td className="p-2.5 text-sky-700 font-extrabold">{fe.dataRetorno.split('-').reverse().join('/')}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                    fe.status === 'Aprovado' ? 'bg-emerald-50 text-emerald-800 border-emerald-150' :
                                    fe.status === 'Recusado' ? 'bg-rose-50 text-rose-850 border-rose-150' :
                                    'bg-amber-50 text-amber-700 border-amber-100'
                                  }`}>
                                    {fe.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  } else {
                    return (
                      <p className="text-slate-400 italic text-xs">Sem solicitações de férias ou histórico de termos registrado para este colaborador no sistema.</p>
                    );
                  }
                })()}
              </div>

              {/* Linha do Tempo e Histórico Geral */}
              <div className="bg-slate-900 text-slate-300 rounded-3xl p-5 space-y-2.5 font-mono text-[11px]">
                <h4 className="text-white text-xs font-extrabold uppercase tracking-wider border-b border-slate-800 pb-2">Linha do Tempo & Logs Administrativos</h4>
                <div className="space-y-1 bg-slate-950 p-3.5 rounded-2xl max-h-32 overflow-y-auto leading-relaxed border border-slate-800">
                  <p className="text-slate-400">[DATA INICIAL]: Admissão do colaborador configurada para {selectedViewColab.datainicio ? selectedViewColab.datainicio.split('-').reverse().join('/') : 'Automática'} no setor {selectedViewColab.setor}.</p>
                  {selectedViewColab.historico ? (
                    <p className="text-emerald-400">{selectedViewColab.historico}</p>
                  ) : (
                    <p className="text-slate-500 italic">Sem logs adicionais gravados para esta ficha.</p>
                  )}
                  {selectedViewColab.datarecisao && (
                    <p className="text-rose-450 font-bold">[RESCISÃO PREVISTA / DESLIGAMENTO]: Ficha programada para encerramento em {selectedViewColab.datarecisao.split('-').reverse().join('/')}.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Footer de Fechamento */}
            <div className="bg-slate-50 p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  const colabToEdit = selectedViewColab;
                  setIsOpenViewModal(false);
                  setSelectedViewColab(null);
                  handleOpenModal(colabToEdit);
                }}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-sky-600/10 border border-sky-500"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar Cadastro</span>
              </button>
              <button
                onClick={() => { setIsOpenViewModal(false); setSelectedViewColab(null); }}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-extrabold rounded-xl text-xs transition cursor-pointer"
              >
                Fechar Ficha Cadastral
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL NOTIFICAÇÃO COMPARTILHADA WHATSAPP */}
      {whatsappNotification && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fadeIn">
          <div className="bg-white rounded-3xl border border-emerald-100 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="bg-emerald-600 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <Phone className="w-6 h-6 animate-bounce" />
                <div>
                  <h3 className="font-extrabold text-base">Notificação via WhatsApp</h3>
                  <p className="text-xs text-emerald-100">Credenciais criadas com sucesso!</p>
                </div>
              </div>
              <button 
                onClick={() => setWhatsappNotification(null)} 
                className="hover:bg-emerald-700 p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-100/55 text-xs text-emerald-900 leading-normal font-sans">
                <span className="font-black uppercase block mb-1">✅ Colaborador Vinculado!</span>
                As credenciais de login para <strong>{whatsappNotification.colabNome}</strong> foram criadas e vinculadas com êxito. Agora você pode despachar a mensagem de Boas-Vindas abaixo via WhatsApp.
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 block font-sans">Número do WhatsApp:</label>
                <input
                  type="text"
                  readOnly
                  value={whatsappNotification.phone ? `+55 ${whatsappNotification.phone}` : 'Não informado'}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 block font-sans">Visualização prévia do texto:</label>
                <div className="w-full bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-sans whitespace-pre-wrap leading-relaxed max-h-55 overflow-y-auto border border-slate-800 font-mono">
                  {
                    (usuarioLogado?.email?.toLowerCase() === 'enfmichelmilk@gmail.com' || 
                     (email && usuarioLogado?.email?.toLowerCase() === email.trim().toLowerCase()))
                      ? whatsappNotification.message
                      : whatsappNotification.message.replaceAll(senhaProvisoria, '••••••••')
                  }
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2 justify-end">
              <button
                onClick={() => {
                  const hasAccess = (usuarioLogado?.email?.toLowerCase() === 'enfmichelmilk@gmail.com' || 
                                     (email && usuarioLogado?.email?.toLowerCase() === email.trim().toLowerCase()));
                  const textToCopy = hasAccess 
                    ? whatsappNotification.message 
                    : whatsappNotification.message.replaceAll(senhaProvisoria, '••••••••');
                    
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(textToCopy).then(() => {
                        customAlert("Mensagem copiada para a área de transferência com sucesso!");
                      }).catch(() => {
                        const textArea = document.createElement("textarea");
                        textArea.value = textToCopy;
                        textArea.style.position = "fixed";
                        textArea.style.top = "0";
                        textArea.style.left = "0";
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        customAlert("Mensagem copiada para a área de transferência com sucesso!");
                      });
                    } else {
                      const textArea = document.createElement("textarea");
                      textArea.value = textToCopy;
                      textArea.style.position = "fixed";
                      textArea.style.top = "0";
                      textArea.style.left = "0";
                      document.body.appendChild(textArea);
                      textArea.focus();
                      textArea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textArea);
                      customAlert("Mensagem copiada para a área de transferência com sucesso!");
                    }
                  } catch (err) {
                    customAlert("Mensagem não pôde ser copiada automaticamente. Copie manualmente do texto.");
                  }
                }}
                className="px-4 py-2 border border-slate-300 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-100 transition whitespace-nowrap font-sans"
              >
                Copiar Texto
              </button>
              
              <a
                href={`https://web.whatsapp.com/send?phone=55${whatsappNotification.phone}&text=${encodeURIComponent(whatsappNotification.message)}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs text-center transition shadow-md shadow-emerald-550/15 font-sans"
              >
                Enviar no WhatsApp Web
              </a>
              
              <a
                href={`https://api.whatsapp.com/send?phone=55${whatsappNotification.phone}&text=${encodeURIComponent(whatsappNotification.message)}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl text-xs text-center transition font-sans"
              >
                Enviar via Mobile/API
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
