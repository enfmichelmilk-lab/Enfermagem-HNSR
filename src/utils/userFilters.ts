import { Colaborador, Usuario } from '../types';

/**
 * Checks if a collaborator is actually a subordinate (direct or indirect) of the logged-in user,
 * regardless of whether the logged-in user is an Enfermeiro(a) or a Supervisor/Coordenador/Gerente/etc.
 */
export const checkIsActualSubordinate = (
  c: Colaborador,
  usuarioLogado: Usuario | null | undefined,
  colaboradores: Colaborador[]
): boolean => {
  if (!usuarioLogado) return false;

  const uNome = usuarioLogado.nome ? usuarioLogado.nome.trim().toLowerCase() : "";
  const uEmail = usuarioLogado.email ? usuarioLogado.email.trim().toLowerCase() : "";

  // Helper to normalize names by removing common prefixes and trimming
  const normalizeName = (name: string): string => {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/^(enf\.|enfermeiro\(a\)|enfermeiro|enfermeira|dr\.|dra\.)\s+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Find all collaborator records that could represent this logged-in user
  const selfColabs = colaboradores.filter(x => 
    (x.email && x.email.trim().toLowerCase() === uEmail) || 
    (x.nome && x.nome.trim().toLowerCase() === uNome)
  );
  
  const selfNames = new Set<string>();
  selfNames.add(uNome);
  selfColabs.forEach(sc => {
    if (sc.nome) selfNames.add(sc.nome.trim().toLowerCase());
  });

  const colabEmail = c.email ? c.email.trim().toLowerCase() : "";
  const colabNome = c.nome ? c.nome.trim().toLowerCase() : "";
  
  // 1. Check if the collaborator is the logged-in user themselves
  const isSelf = 
    (colabEmail && colabEmail === uEmail) || 
    (colabNome && colabNome === uNome) ||
    Array.from(selfNames).some(sName => {
      const normS = normalizeName(sName);
      const normC = normalizeName(colabNome);
      return normS && normC && (normS.includes(normC) || normC.includes(normS));
    });

  if (isSelf) return true;

  // 2. Check direct and indirect subordinates
  const colabGestorDireto = c.gestordireto ? c.gestordireto.trim().toLowerCase() : "";
  const colabGestorIndireto = c.gestorindireto ? c.gestorindireto.trim().toLowerCase() : "";

  const isDirect = Array.from(selfNames).some(sName => {
    const normS = normalizeName(sName);
    const normG = normalizeName(colabGestorDireto);
    return normS && normG && (normS.includes(normG) || normG.includes(normS));
  });

  const isIndirect = Array.from(selfNames).some(sName => {
    const normS = normalizeName(sName);
    const normG = normalizeName(colabGestorIndireto);
    return normS && normG && (normS.includes(normG) || normG.includes(normS));
  });

  return isDirect || isIndirect;
};

/**
 * Checks if a collaborator should be visible to the logged-in user under the "Enfermeiro(a)" profile rules.
 * A collaborator is visible if:
 * 1. The collaborator IS the logged-in user themselves (matched by email, exact name, or normalized name).
 * 2. The collaborator lists the logged-in user as their direct manager (gestordireto).
 * 3. The collaborator lists the logged-in user as their indirect manager (gestorindireto).
 */
export const isUserSubordinate = (
  c: Colaborador,
  usuarioLogado: Usuario | null | undefined,
  colaboradores: Colaborador[]
): boolean => {
  if (!usuarioLogado) return false;
  
  const p = usuarioLogado.perfil ? usuarioLogado.perfil.toLowerCase() : "";
  const isEnf = p === "enfermeiro(a)" || p === "enfermeiro" || p === "enfermeira";
  
  // Non-enfermeiro (Supervisor, Coordenador, Gerente, Adm, Programador) has full visibility (filtered at view-level if needed by sector)
  if (!isEnf) return true;

  return checkIsActualSubordinate(c, usuarioLogado, colaboradores);
};
