/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Usuario {
  nome: string;
  email: string;
  setor: string;
  perfil: string;
  status: 'Ativo' | 'Inativo';
  senha?: string;
  primeiroAcesso?: boolean;
}

export interface Colaborador {
  nome: string;
  matricula: string;
  coren: string;
  validade_carteira?: string; // YYYY-MM-DD
  cargo: string;
  equipe: string;
  horario: string;
  setor: string;
  gestordireto: string;
  gestorindireto: string;
  email: string;
  whatsapp: string;
  bancohoras: number;
  folgaenf: number;
  folgaferiado: number;
  brigada: number;
  eleicao: number;
  historico: string;
  selo_etica: 'Sim' | 'Não';
  selo_brigadista: 'Sim' | 'Não';
  selo_cipa: 'Sim' | 'Não';
  datainicio: string; // YYYY-MM-DD
  datanascimento: string; // YYYY-MM-DD
  datarecisao: string; // YYYY-MM-DD
  numreq: string;
  infosubst: string;
  // Campos INSS
  inss_check: 'Sim' | 'Não';
  inss_entrada: string;
  inss_retorno: string;
  inss_rep: string;
  inss_obs: string;
  selos_adicionais?: string[];
}

export interface Absenteismo {
  id: string;
  tipo: 'Atestado' | 'Licença / Outros';
  colaborador: string;
  matricula: string;
  setor: string;
  cargo: string;
  turno: string;
  inicio: string; // YYYY-MM-DD
  duracao: string; // Ex: "3 Dias" or "12 Horas"
  termino?: string; // Auto-calculado
  retorno?: string; // Auto-calculado
  cid: string;
  patologia: string;
}

export interface SolicitacaoFolga {
  id: string;
  colaborador: string;
  matricula: string;
  tipo: string;
  data: string; // YYYY-MM-DD
  status: 'Pendente' | 'Aprovado' | 'Recusado';
  solicitante: string;
  dataCriacao: string;
}

export interface Ferias {
  id: string;
  colaborador: string;
  matricula: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  dataRetorno: string; // YYYY-MM-DD
  duracao: number;
  status: 'Pendente' | 'Aprovado' | 'Recusado';
  solicitante: string;
  dataCriacao: string;
  justificativa?: string;
}

export interface ChamadaSetorMetric {
  setor: string; // UTI (9º andar), CC / CME, etc.
  totalPacientes: number;
  pacientesAcamados: number;
  pacientesVM: number;
  altasPrevistas: number;
}

export interface ColaboradorChamadaStatus {
  matricula: string;
  nome: string;
  cargo: string;
  setorOriginal: string;
  status: 'Presente' | 'Atestado' | 'Falta' | 'Férias' | 'Folga' | 'Pendente';
  remanejadoPara?: string; // e.g. 'CC / CME'
  remanejamentoTipo?: 'remanejar' | 'assumir_mais_um';
  info?: string; // description of leave
  isExtra?: boolean;
}

export interface Chamada {
  id: string;
  data: string; // YYYY-MM-DD
  turno: string; // e.g. "Diurno A", "Diurno B", etc.
  enfermeiroReferencia: string;
  statusColaboradores: ColaboradorChamadaStatus[];
  metricasSetor: { [setorName: string]: ChamadaSetorMetric };
  dataCriacao: string;
  usuarioCriador?: string;
}

export interface CourseTarget {
  cargo: string;
  obrigatorio: boolean;
}

export interface Curso {
  id: string;
  nome: string;
  descricao?: string;
  targets: CourseTarget[];
  dataCriacao: string;
}

export interface CertificadoCurso {
  id: string;
  colaboradorMatricula: string;
  colaboradorNome: string;
  cursoId: string;
  cursoNome: string;
  dataConclusao: string; // YYYY-MM-DD
  origem: string;
  dataCriacao: string;
  fileName?: string;
  fileBase64?: string;
}

export interface SaldosHistorico {
  id: string; // `${matricula}_${mes}`
  matricula: string;
  nome: string;
  setor: string;
  mes: string; // YYYY-MM
  bancohoras: number;
  folgaferiado: number;
  folgaenf: number;
  dataAtualizacao: string; // YYYY-MM-DD
}


