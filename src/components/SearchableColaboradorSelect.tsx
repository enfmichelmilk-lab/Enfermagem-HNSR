import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, User, X } from 'lucide-react';
import { Colaborador } from '../types';

interface SearchableColaboradorSelectProps {
  colaboradores: Colaborador[];
  selectedMatricula: string;
  onSelect: (colab: Colaborador | null) => void;
  placeholder?: string;
  disabledPlaceholder?: string;
  className?: string;
  required?: boolean;
}

export default function SearchableColaboradorSelect({
  colaboradores,
  selectedMatricula,
  onSelect,
  placeholder = 'Escolha um profissional de sua competência...',
  disabledPlaceholder = 'Sem profissionais disponíveis',
  className = '',
  required = false,
}: SearchableColaboradorSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter and sort alphabetically by name (A-Z)
  const listColaboradores = useMemo(() => {
    const list = [...colaboradores];
    // Sort A-Z
    list.sort((a, b) => a.nome.localeCompare(b.nome));

    if (!search.trim()) return list;

    const normalizedSearch = search.toLowerCase().trim();
    return list.filter(c => 
      c.nome.toLowerCase().includes(normalizedSearch) ||
      c.matricula.toLowerCase().includes(normalizedSearch) ||
      c.setor.toLowerCase().includes(normalizedSearch) ||
      c.cargo.toLowerCase().includes(normalizedSearch)
    );
  }, [colaboradores, search]);

  const selectedColab = useMemo(() => {
    return colaboradores.find(c => c.matricula === selectedMatricula) || null;
  }, [colaboradores, selectedMatricula]);

  const handleSelectOption = (colab: Colaborador) => {
    onSelect(colab);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setSearch('');
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className} font-sans`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 px-3 py-2.5 rounded-xl text-left cursor-pointer focus:outline-none focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-3xs"
      >
        <span className={`text-xs font-bold leading-normal truncate ${selectedColab ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedColab ? (
            `${selectedColab.nome} (S: ${selectedColab.setor} • M: ${selectedColab.matricula} • Cargo: ${selectedColab.cargo})`
          ) : (
            colaboradores.length > 0 ? placeholder : disabledPlaceholder
          )}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedColab && !required && (
            <span
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-650 transition cursor-pointer"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100 max-w-full">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/30 relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 transition-colors font-sans"
              placeholder="Pesquisar por nome, matrícula, setor ou cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* List Options */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 py-1">
            {listColaboradores.length === 0 ? (
              <div className="px-4 py-3 text-center text-xs font-bold text-slate-400 block italic">
                Nenhum colaborador encontrado
              </div>
            ) : (
              listColaboradores.map(c => {
                const isSelected = c.matricula === selectedMatricula;
                return (
                  <button
                    key={c.matricula}
                    type="button"
                    onClick={() => handleSelectOption(c)}
                    className={`w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-sky-50/70 transition-colors flex items-center justify-between ${
                      isSelected ? 'bg-sky-50 text-sky-850 font-bold' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-extrabold truncate text-slate-800">{c.nome}</span>
                      <span className="text-[10px] text-slate-450 font-semibold block uppercase">
                        S: {c.setor} &bull; M: {c.matricula} &bull; C: {c.cargo}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-sky-600 shrink-0 font-bold text-[10px] uppercase bg-sky-100/50 px-1.5 py-0.5 rounded-md border border-sky-100">
                        Selecionado
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
