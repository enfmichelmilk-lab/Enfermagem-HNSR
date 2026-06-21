/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Colaborador, Absenteismo, Usuario, SolicitacaoFolga } from '../types';
import { IMPORTED_COLABORADORES, IMPORTED_ABSENTEISMO } from './importedData';

export const CID_NATIVO: Record<string, string> = {
  "A09": "Diarreia e gastroenterite de origem infecciosa presumida",
  "A90": "Dengue clássico",
  "J00": "Nasofaringite aguda (resfriado comum)",
  "M54.5": "Lombalgia baixa",
  "F41.1": "Transtorno de ansiedade generalizada",
  "Z76.2": "Consulta de vigilância de saúde de outro lactente ou criança saudável (Atestado Filho)",
  "B34.2": "Infecção por coronavírus de localização não especificada",
  "G43": "Enxaqueca",
  "F43.2": "Transtornos de adaptação (Sobrecarga de Estresse)",
  "K21": "Refluxo gastroesofágico",
  "I10": "Hipertensão essencial (primária)",
  "M54": "Dorsalgia",
  "E11": "Diabetes mellitus não-insulino-dependente"
};

export const SETORES_HOSPITALARES = [
  "2º ANDAR",
  "3º ANDAR",
  "4º ANDAR",
  "5º ANDAR",
  "6º ANDAR",
  "CENTRO CIRURGICO",
  "CME",
  "PSA",
  "PSI",
  "UTI 7º ANDAR",
  "UTI 9º ANDAR",
  "Folguista UI",
  "Folguista PS | UTI"
];

export const EQUIPES_ESCALA = [
  "Diurno A",
  "Diurno B",
  "Noturno A",
  "Noturno B",
  "Diário"
];

export const CARGOS_ENFERMAGEM = [
  "Supervisor(a)",
  "Coordenador(a)",
  "Gerente",
  "Enfermeiro(a)",
  "Tec. Enf.",
  "Aux. Enf.",
  "Administrativo",
  "Estagiária",
  "Outros"
];

export const USUARIOS_INICIAIS: Usuario[] = [
  {
    nome: "Enf. Michel Milk",
    email: "enfmichelmilk@gmail.com",
    setor: "Gestão",
    perfil: "Programador",
    status: "Ativo",
    senha: "@M05G05l9"
  },
  {
    nome: "Enf. Ana Souza",
    email: "anasouza@hnsr.com.br",
    setor: "Gestão",
    perfil: "Gerente",
    status: "Ativo",
    senha: "123"
  },
  {
    nome: "Claudia Reis",
    email: "claudia@hnsr.com.br",
    setor: "UTI 9º andar",
    perfil: "Enfermeiro(a)",
    status: "Ativo",
    senha: "123"
  },
  {
    nome: "Roberto Mendes",
    email: "roberto@hnsr.com.br",
    setor: "PSA (Pronto Socorro Adulto)",
    perfil: "Enfermeiro(a)",
    status: "Inativo",
    senha: "123"
  }
];

const SECTOR_MAPPING: Record<string, string> = {
  "UI 2º andar": "2º ANDAR",
  "UI 3º andar": "3º ANDAR",
  "UI 4º andar": "4º ANDAR",
  "UI 5º andar": "5º ANDAR",
  "UI 6º andar": "6º ANDAR",
  "CENTRO CIRURGICO": "CENTRO CIRURGICO",
  "CME (Central de Material e Esterilização)": "CME",
  "CME": "CME",
  "PSA (Pronto Socorro Adulto)": "PSA",
  "PSA": "PSA",
  "PSI (Pronto Socorro Infantil)": "PSI",
  "PSI": "PSI",
  "UTI 7º andar": "UTI 7º ANDAR",
  "UTI 8º andar": "UTI 7º ANDAR",
  "UTI 9º andar": "UTI 9º ANDAR"
};

export const mapSector = (sec: string): string => {
  if (!sec) return "2º ANDAR";
  const trimmed = sec.trim();
  const upper = trimmed.toUpperCase();
  
  if (upper.includes("FOLGUISTA UI")) return "Folguista UI";
  if (upper.includes("FOLGUISTA PS") || upper.includes("FOLGUISTA UTI")) return "Folguista PS | UTI";
  if (upper.includes("2º") || upper.includes("2O")) return "2º ANDAR";
  if (upper.includes("3º") || upper.includes("3O")) return "3º ANDAR";
  if (upper.includes("4º") || upper.includes("4O")) return "4º ANDAR";
  if (upper.includes("5º") || upper.includes("5O")) return "5º ANDAR";
  if (upper.includes("6º") || upper.includes("6O")) return "6º ANDAR";
  if (upper.includes("CENTRO CIRURGICO") || upper.includes("CIRURGICO") || upper.includes("C.C.")) return "CENTRO CIRURGICO";
  if (upper.includes("CME") || upper.includes("CENTRAL DE MATERIAL")) return "CME";
  if (upper.includes("PSA") || upper.includes("PRONTO SOCORRO ADULTO")) return "PSA";
  if (upper.includes("PSI") || upper.includes("PRONTO SOCORRO INFANTIL")) return "PSI";
  if (upper.includes("UTI 7") || (upper.includes("UTI") && upper.includes("7º")) || (upper.includes("UTI") && upper.includes("7O"))) return "UTI 7º ANDAR";
  if (upper.includes("UTI 8") || (upper.includes("UTI") && upper.includes("8º")) || (upper.includes("UTI") && upper.includes("8O"))) return "UTI 7º ANDAR";
  if (upper.includes("UTI 9") || (upper.includes("UTI") && upper.includes("9º")) || (upper.includes("UTI") && upper.includes("9O"))) return "UTI 9º ANDAR";
  
  if (upper === "GESTAO" || upper === "GESTÃO") return "Gestão";
  
  return SECTOR_MAPPING[trimmed] || trimmed;
};

// Reference loaded from the processed text lists
export const COLABORADORES_INICIAIS: Colaborador[] = IMPORTED_COLABORADORES.map(c => ({
  ...c,
  setor: mapSector(c.setor)
}));

export const ABSENTEISMO_INICIAL: Absenteismo[] = IMPORTED_ABSENTEISMO.map(a => ({
  ...a,
  setor: mapSector(a.setor)
}));

export const SOLICITACOES_FOLGA_INICIAL: SolicitacaoFolga[] = [
  {
    id: "F-901",
    colaborador: "Amanda Bezerra",
    matricula: "10023",
    tipo: "Banco de Horas",
    data: "2026-06-12",
    status: "Pendente",
    solicitante: "Enf. Michel Milk",
    dataCriacao: "2026-06-02 14:32"
  },
  {
    id: "F-902",
    colaborador: "Daniel Oliveira",
    matricula: "12040",
    tipo: "Folga de Escala",
    data: "2026-06-15",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 09:12"
  },
  // Maria Aparecida da Silva Folgas (June 2026)
  {
    id: "F-101",
    colaborador: "Maria Aparecida da Silva",
    matricula: "66618",
    tipo: "Folga de Escala",
    data: "2026-06-05",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:11"
  },
  {
    id: "F-102",
    colaborador: "Maria Aparecida da Silva",
    matricula: "66618",
    tipo: "Folga de Escala",
    data: "2026-06-23",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:12"
  },
  {
    id: "F-103",
    colaborador: "Maria Aparecida da Silva",
    matricula: "66618",
    tipo: "Folga Eleição",
    data: "2026-06-29",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:13"
  },
  // Tania da Conceição Silva Godoi Folgas (June 2026)
  {
    id: "F-104",
    colaborador: "Tania da Conceição Silva Godoi",
    matricula: "49554",
    tipo: "Folga de Escala",
    data: "2026-06-13",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:14"
  },
  {
    id: "F-105",
    colaborador: "Tania da Conceição Silva Godoi",
    matricula: "49554",
    tipo: "Folga de Escala",
    data: "2026-06-16",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:15"
  },
  // Ana Claudia Gama Santos Folgas (June 2026)
  {
    id: "F-106",
    colaborador: "Ana Claudia Gama Santos",
    matricula: "42926",
    tipo: "Folga de Escala",
    data: "2026-06-07",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:16"
  },
  {
    id: "F-107",
    colaborador: "Ana Claudia Gama Santos",
    matricula: "42926",
    tipo: "Folga de Escala",
    data: "2026-06-19",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:17"
  },
  {
    id: "F-108",
    colaborador: "Ana Claudia Gama Santos",
    matricula: "42926",
    tipo: "Folga Feriado",
    data: "2026-06-21",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:18"
  },
  // Silvana Aparecida Patullo de Almeida Folgas (June 2026)
  {
    id: "F-109",
    colaborador: "Silvana Aparecida Patullo de Almeida",
    matricula: "28310",
    tipo: "Folga de Escala",
    data: "2026-06-01",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:19"
  },
  {
    id: "F-110",
    colaborador: "Silvana Aparecida Patullo de Almeida",
    matricula: "28310",
    tipo: "Folga Feriado",
    data: "2026-06-12",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:20"
  },
  {
    id: "F-111",
    colaborador: "Silvana Aparecida Patullo de Almeida",
    matricula: "28310",
    tipo: "Folga de Escala",
    data: "2026-06-20",
    status: "Aprovado",
    solicitante: "Claudia Reis",
    dataCriacao: "2026-06-01 10:21"
  }
];
