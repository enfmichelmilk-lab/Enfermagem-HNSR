/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  UserCog, UserPlus, ShieldAlert, CheckCircle, Mail,
  RefreshCw, Power, AlertCircle, Edit3, X, Trash2, Database
} from 'lucide-react';
import { Usuario } from '../types';
import { SETORES_HOSPITALARES } from '../data/mockData';

interface UsuariosViewProps {
  usuarios: Usuario[];
  usuarioLogado: Usuario;
  onUpdateUsuarios: (novosUsuarios: Usuario[]) => void;
  onResetSystem: (mode: 'default' | 'empty') => void;
}

export default function UsuariosView({ usuarios, usuarioLogado, onUpdateUsuarios, onResetSystem }: UsuariosViewProps) {
  // Creation States
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [setor, setSetor] = useState('Gestão');
  const [perfil, setPerfil] = useState('Enfermeiro(a)');

  // Selected for edits
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editSetor, setEditSetor] = useState('Gestão');
  const [editPerfil, setEditPerfil] = useState('Enfermeiro(a)');

  // Email simulation cache to overlay on top of screen
  const [simulatedEmail, setSimulatedEmail] = useState<{ to: string; subject: string; html: string } | null>(null);

  const handleCreateCredential = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim() || !email.trim()) {
      alert("Por favor, preencha o Nome Completo e o E-mail corporativo.");
      return;
    }

    // Role block rule from 4_Modulo_Usuarios.gs
    const perfilLower = perfil.toLowerCase();
    if (perfilLower.includes("tecnico") || perfilLower.includes("técnico") || perfilLower.includes("tec")) {
      alert("Técnicos de enfermagem não possuem permissão de acesso ao painel Gestão RH Enfermagem HNSR.");
      return;
    }

    // Checking email pre-existence
    const isEmailExists = usuarios.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (isEmailExists) {
      alert("Este e-mail já está cadastrado no sistema.");
      return;
    }

    // Generating recognizable temporary password
    const provisoryPassword = "TEMP-" + Math.floor(100000 + Math.random() * 900000).toString();

    const novoUsuario: Usuario = {
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      setor,
      perfil,
      status: 'Ativo',
      senha: provisoryPassword
    };

    onUpdateUsuarios([novoUsuario, ...usuarios]);
    alert("Credencial criada com sucesso! O e-mail simulado com o link de acesso direto do sistema e o código provisório foi gerado abaixo.");

    const systemLink = window.location.origin;

    // Mounting stylized HTML email simulation layout
    const htmlEmailTemplate = `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); background-color: #ffffff;">
        <div style="background-color: #0284c7; padding: 25px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800;">Hapvida</h2>
          <p style="margin: 5px 0 0; font-size: 13px; font-weight: 500;">Hospital Nossa Senhora do Rosário</p>
        </div>
        <div style="padding: 30px; text-align: center; background-color: #ffffff;">
          <p style="font-size: 16px; margin-bottom: 10px;">Olá, <b>${nome.trim()}</b>!</p>
          <p style="font-size: 14px; color: #64748b; line-height: 1.5;">Seu perfil de acesso ao painel de gerenciamento de escalas foi criado com sucesso.</p>
          
          <p style="font-size: 14px; margin-top: 25px; color: #475569; font-weight: bold;">Sua senha provisória de acesso é:</p>
          <div style="margin: 10px auto; background: #f0f9ff; padding: 15px; border-radius: 12px; border: 2px dashed #0284c7; display: inline-block; width: auto;">
            <p style="color: #0369a1; letter-spacing: 2px; margin: 0; font-size: 24px; font-family: monospace; font-weight: bold;">${provisoryPassword}</p>
          </div>
          
          <p style="font-size: 12px; color: #dc2626; margin-top: 15px; font-weight: 500;">Por motivos de segurança, no seu primeiro acesso o sistema exigirá que você crie uma nova senha definitiva.</p>
          
          <div style="margin-top: 25px;">
            <a href="${systemLink}" target="_blank" style="display: inline-block; padding: 12px 28px; background-color: #0284c7; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 10px rgba(2, 132, 199, 0.25);">Acessar o Sistema</a>
          </div>
          <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Link de acesso: <span style="font-family: monospace; color: #0284c7;">${systemLink}</span></p>
        </div>
        <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; font-weight: bold; color: #0284c7;">Hapvida - Hospital Nossa Senhora do Rosário</p>
        </div>
      </div>
    `;

    setSimulatedEmail({
      to: email.trim().toLowerCase(),
      subject: "Bem-vindo ao Sistema - Hapvida Hospital Nossa Senhora do Rosário",
      html: htmlEmailTemplate
    });

    // Reset Creation form
    setNome('');
    setEmail('');
  };

  const handleToggleStatus = (targetEmail: string) => {
    // Cannot toggle yourself off
    if (targetEmail.toLowerCase() === usuarioLogado.email.toLowerCase()) {
      alert("Não é possível suspender ou inativar seu próprio acesso administrativo!");
      return;
    }

    const novosUsuarios = usuarios.map(u => {
      if (u.email.toLowerCase() === targetEmail.toLowerCase()) {
        const nextStatus = u.status === 'Ativo' ? 'Inativo' as const : 'Ativo' as const;
        return { ...u, status: nextStatus };
      }
      return u;
    });

    onUpdateUsuarios(novosUsuarios);
  };

  const handleOpenEdit = (user: Usuario) => {
    setEditingUser(user);
    setEditNome(user.nome);
    setEditSetor(user.setor);
    setEditPerfil(user.perfil);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const novosUsuarios = usuarios.map(u => {
      if (u.email.toLowerCase() === editingUser.email.toLowerCase()) {
        return {
          ...u,
          nome: editNome.trim(),
          setor: editSetor,
          perfil: editPerfil
        };
      }
      return u;
    });

    onUpdateUsuarios(novosUsuarios);
    setEditingUser(null);
    alert("Alterações nas credenciais salvas com sucesso!");
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Page Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 leading-tight font-sans">Acessos e Usuários Web</h2>
          <p className="text-sm text-slate-500 font-medium">Controle de Credenciais Administrativas do Painel Nursing de Enfermagem</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side Form create creds */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 self-start text-xs">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-sky-600 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-800">Criar Credencial de Enfermagem</h3>
          </div>

          <form onSubmit={handleCreateCredential} className="space-y-4">
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">Nome Completo</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Enf. Maria Santos"
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">E-mail Corporativo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: mariasantos@hnsr.com.br"
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">Setor</label>
                <select
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
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
                <label className="font-bold text-slate-600 block">Perfil / Alçada</label>
                <select
                  value={perfil}
                  onChange={(e) => setPerfil(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                >
                  <option value="Enfermeiro(a)">Enfermeiro(a)</option>
                  <option value="ADM">ADM</option>
                  <option value="Supervisor(a)">Supervisor(a)</option>
                  <option value="Coordenador(a)">Coordenador(a)</option>
                  <option value="Gerente">Gerente</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-center gap-1.5"
            >
              Criar Credencial
            </button>
          </form>

          {/* Quick Notice representation */}
          <div className="bg-red-50 text-red-900 border border-red-100 p-3.5 rounded-xl text-[10px] leading-normal space-y-1">
            <span className="font-extrabold flex items-center gap-1">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" /> Restrição Alçada de Enfermagem
            </span>
            <p>Perfis Técnicos de Enfermagem ("Tec. Enf." ou "Aux. Enf.") são bloqueados de possuírem contas web ativas por regras corporativas do hospital.</p>
          </div>
        </div>

        {/* Right side registers grid list */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">Contas Registradas no Sistema</h3>
            <p className="text-[11px] text-slate-400">Ativação, suspensão e mudança relacional de perfis cadastrados</p>
          </div>

          <div className="overflow-x-auto text-[11px] font-medium">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 text-[10px] uppercase font-extrabold tracking-wider">
                  <th className="py-2.5 px-3">Profissional</th>
                  <th className="py-2.5 px-3">E-mail</th>
                  <th className="py-2.5 px-3">Setor / Perfil</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 leading-tight">
                {usuarios.map(u => {
                  const isActive = u.status === 'Ativo';
                  const isOwnAccount = u.email.toLowerCase() === usuarioLogado.email.toLowerCase();

                  return (
                    <tr key={u.email} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-3">
                        <span className="font-extrabold text-slate-800 block text-xs leading-none">{u.nome}</span>
                        {isOwnAccount && (
                          <span className="text-[8px] bg-slate-100 text-slate-500 font-extrabold px-1.5 py-0.5 rounded uppercase mt-1 inline-block border">Minha Conta</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-400">
                        {u.email}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-slate-800 font-bold block">{u.setor}</span>
                        <span className="text-[9px] bg-sky-50 text-sky-800 font-extrabold px-1 py-0.2 rounded border border-sky-100 inline-block uppercase mt-0.5">{u.perfil}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[9px] ${
                          isActive 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1 text-sky-600 hover:bg-sky-50 rounded"
                            title="Editar credencial"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={() => handleToggleStatus(u.email)}
                            className={`p-1 rounded ${
                              isActive 
                                ? 'text-rose-500 hover:bg-rose-50' 
                                : 'text-emerald-500 hover:bg-emerald-50'
                            }`}
                            title={isActive ? 'Desativar acesso' : 'Ativar acesso'}
                            disabled={isOwnAccount}
                          >
                            <Power className="w-3.5 h-3.5 focus:outline-none" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* SEÇÃO DE CONTROLE E LIMPEZA DE DADOS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
          <Database className="w-5 h-5 text-rose-600 animate-pulse" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Manutenção & Limpeza de Dados</h3>
            <p className="text-[11px] text-slate-400">Gerenciar o armazenamento persistente local do navegador (Reset / Wipes)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
          <div className="p-4 border border-slate-100 bg-slate-50 rounded-xl flex flex-col justify-between space-y-3.5">
            <div>
              <span className="font-extrabold text-slate-800 text-xs block flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-emerald-600" />
                Redefinir para Padrões Iniciais (Hospital HNSR Demo)
              </span>
              <p className="text-slate-500 mt-1.5 leading-normal text-[11px]">
                Esta opção apaga quaisquer modificações locais efetuadas (novos colaboradores cadastrados, atestados lançados, solicitações registradas e novas férias) e restaura o banco de dados inicial completo com as listas padrão hospitalares para testes rápidos.
              </p>
            </div>
            <button
              onClick={() => {
                if (window.confirm("Aviso: Isso irá redefinir todas as escalas, colaboradores, atestados e férias para os valores de teste iniciais. Deseja continuar?")) {
                  onResetSystem('default');
                  alert("Banco de dados local do Hospital HNSR foi reestruturado para as configurações iniciais com sucesso!");
                }
              }}
              className="mt-1 w-fit bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurar Dados Demo
            </button>
          </div>

          <div className="p-4 border border-slate-100 bg-slate-50 rounded-xl flex flex-col justify-between space-y-3.5">
            <div>
              <span className="font-extrabold text-slate-800 text-xs block flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-650" />
                Limpar Absolutamente Tudo (Banco de Dados Vazio)
              </span>
              <p className="text-slate-500 mt-1.5 leading-normal text-[11px]">
                Esta opção exclui permanentemente todos os colaboradores cadastrados, solicitações de folgas, registros de absenteísmo, cronogramas de férias e selos personalizados. Suas credenciais administrativas ativas ({usuarioLogado.nome}) serão mantidas para evitar o bloqueio de seu acesso ao painel.
              </p>
            </div>
            <button
              onClick={() => {
                if (window.confirm("CUIDADO: Esta ação é irreversível e excluirá permanentemente todos os registros, colaboradores e escalas do sistema. Deseja iniciar do zero com o banco limpo?")) {
                  onResetSystem('empty');
                  alert("Todas as bases foram limpas! Você está pronto para cadastrar ou importar novos colaboradores de uma planilha limpa.");
                }
              }}
              className="mt-1 w-fit bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Banco de Dados
            </button>
          </div>
        </div>
      </div>

      {/* STYLISH HTML EMAIL TEMPLATE SIMULATOR PANEL */}
      {simulatedEmail && (
        <div className="bg-slate-950 text-slate-100 rounded-2xl p-6 border border-slate-800 space-y-4 font-sans animate-fadeIn relative">
          <button
            onClick={() => setSimulatedEmail(null)}
            className="absolute right-4 top-4 text-slate-500 hover:text-slate-200 p-1 rounded hover:bg-slate-900"
          >
            <X className="w-4 h-4 font-bold" />
          </button>
          
          <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <Mail className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-slate-100 tracking-tight">E-mail de Notificação Disparado (Simulador de Saída)</h4>
              <p className="text-[10px] text-slate-500 font-semibold uppercase font-mono">Disparo: Gmail GAS Server Integration &rarr; Destino: {simulatedEmail.to}</p>
            </div>
          </div>

          <div className="bg-slate-900 p-3 rounded-lg flex flex-col gap-1 text-[11px] font-mono border border-slate-800/80">
            <span><b>Destinatário:</b> <span className="text-sky-400">{simulatedEmail.to}</span></span>
            <span><b>Assunto:</b> <span className="text-amber-400 font-bold">{simulatedEmail.subject}</span></span>
          </div>

          {/* Embedded rendering of the welcome HTML */}
          <div className="bg-slate-800 p-4 rounded-xl flex justify-center shadow-inner overflow-x-auto">
            <div 
              className="bg-white rounded-lg overflow-hidden shrink-0 transform scale-95 origin-top"
              dangerouslySetInnerHTML={{ __html: simulatedEmail.html }}
            />
          </div>
        </div>
      )}

      {/* EDITING DIALOG INLINE */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xs font-bold text-sky-800 uppercase tracking-tight">Editar Acesso HNSR</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4.5 h-4.5 font-bold" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs font-sans">
              
              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">Nome Completo</label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">E-mail (Inalterável)</label>
                <input
                  type="text"
                  value={editingUser.email}
                  className="w-full p-2 border border-slate-200 bg-slate-100 text-slate-500 font-mono rounded-lg"
                  readOnly
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">Setor</label>
                  <select
                    value={editSetor}
                    onChange={(e) => setEditSetor(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  >
                    {!SETORES_HOSPITALARES.includes(editSetor) && editSetor && (
                      <option value={editSetor}>{editSetor}</option>
                    )}
                    {SETORES_HOSPITALARES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">Perfil / Alçada</label>
                  <select
                    value={editPerfil}
                    onChange={(e) => setEditPerfil(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
                  >
                    <option value="Enfermeiro(a)">Enfermeiro(a)</option>
                    <option value="ADM">ADM</option>
                    <option value="Supervisor(a)">Supervisor(a)</option>
                    <option value="Coordenador(a)">Coordenador(a)</option>
                    <option value="Gerente">Gerente</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="bg-white border text-slate-600 py-2 px-4 rounded-lg font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-sky-600 text-white font-bold py-2 px-5 rounded-lg shadow-md"
                >
                  Salvar
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
