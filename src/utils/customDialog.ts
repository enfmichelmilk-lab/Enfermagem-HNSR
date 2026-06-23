// src/utils/customDialog.ts

type DialogType = 'alert' | 'confirm';

interface DialogConfig {
  message: string;
  type: DialogType;
  title?: string;
  resolve: (value: boolean) => void;
}

let activeResolver: ((config: DialogConfig) => void) | null = null;

export const registerDialogListener = (fn: (config: DialogConfig) => void) => {
  activeResolver = fn;
};

export const customAlert = (message: string, title?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (activeResolver) {
      activeResolver({
        message,
        type: 'alert',
        title: title || 'Aviso do Sistema',
        resolve
      });
    } else {
      // Fallback if not mounted
      window.alert(message);
      resolve(true);
    }
  });
};

export const customConfirm = (message: string, title?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (activeResolver) {
      activeResolver({
        message,
        type: 'confirm',
        title: title || 'Confirmação',
        resolve
      });
    } else {
      // Fallback if not mounted
      const res = window.confirm(message);
      resolve(res);
    }
  });
};

// Set to window for absolute convenience and easy global access
if (typeof window !== 'undefined') {
  (window as any).customAlert = customAlert;
  (window as any).customConfirm = customConfirm;
}
