// src/components/CustomDialogContainer.tsx

import React, { useState, useEffect } from 'react';
import { registerDialogListener } from '../utils/customDialog';
import { AlertCircle, HelpCircle, Check, X } from 'lucide-react';

interface DialogState {
  isOpen: boolean;
  message: string;
  type: 'alert' | 'confirm';
  title: string;
  resolve: (value: boolean) => void;
}

export default function CustomDialogContainer() {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    registerDialogListener((config) => {
      setDialog({
        isOpen: true,
        message: config.message,
        type: config.type,
        title: config.title || (config.type === 'confirm' ? 'Confirmação' : 'Aviso do Sistema'),
        resolve: config.resolve,
      });
    });
  }, []);

  if (!dialog || !dialog.isOpen) return null;

  const handleAction = (value: boolean) => {
    setDialog((prev) => prev ? { ...prev, isOpen: false } : null);
    dialog.resolve(value);
  };

  const isDanger = 
    dialog.message.toLowerCase().includes('excluir') || 
    dialog.message.toLowerCase().includes('remover') || 
    dialog.message.toLowerCase().includes('deletar') || 
    dialog.message.toLowerCase().includes('limpar') || 
    dialog.message.toLowerCase().includes('resetar');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={() => {
          if (dialog.type === 'alert') {
            handleAction(true);
          }
        }}
      />

      {/* Modal Box */}
      <div 
        className="relative bg-white rounded-3xl border border-slate-150 p-6 max-w-sm w-full shadow-2xl flex flex-col text-center items-center z-10 transition-transform duration-300 animate-scaleUp"
        role="dialog"
        aria-modal="true"
      >
        {/* Icon wrapper */}
        <div className={`mb-4 p-3 rounded-2xl flex items-center justify-center ${
          dialog.type === 'confirm' 
            ? isDanger 
              ? 'bg-rose-50 text-rose-600' 
              : 'bg-sky-50 text-sky-600'
            : 'bg-amber-50 text-amber-600'
        }`}>
          {dialog.type === 'confirm' ? (
            isDanger ? (
              <AlertCircle className="w-8 h-8 stroke-[2.2]" />
            ) : (
              <HelpCircle className="w-8 h-8 stroke-[2.2]" />
            )
          ) : (
            <AlertCircle className="w-8 h-8 stroke-[2.2]" />
          )}
        </div>

        {/* Title */}
        <h3 className="font-sans font-bold text-base text-slate-800 tracking-tight leading-tight mb-2">
          {dialog.title}
        </h3>

        {/* Message */}
        <p className="font-sans text-xs text-slate-550 leading-relaxed mb-6 whitespace-pre-wrap max-h-48 overflow-y-auto px-1">
          {dialog.message}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full mt-auto">
          {dialog.type === 'confirm' && (
            <button
              id="dialog_btn_cancel"
              type="button"
              onClick={() => handleAction(false)}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 hover:text-slate-900 font-bold rounded-2xl text-xs transition cursor-pointer select-none"
            >
              Cancelar
            </button>
          )}
          <button
            id="dialog_btn_confirm"
            type="button"
            onClick={() => handleAction(true)}
            className={`flex-1 py-3 px-4 text-white active:scale-95 font-bold rounded-2xl text-xs transition cursor-pointer select-none shadow-xs ${
              isDanger && dialog.type === 'confirm'
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' 
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
            }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
