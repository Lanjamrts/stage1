"use client";
import React, { useState, createContext, useContext } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-lg shadow-md text-sm font-medium border ${toast.type === 'success'
                ? 'bg-[#EBF7EE] border-[#1E7B4F] text-[#1E7B4F]'
                : toast.type === 'error'
                ? 'bg-[#FEF3F2] border-[#B42318] text-[#B42318]'
                : toast.type === 'warning'
                ? 'bg-[#FEF3C7] border-[#B7791F] text-[#B7791F]'
                : 'bg-[#EBF3FC] border-[#1F5FA8] text-[#1F5FA8]'
            }`}
          >
            {toast.message}
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-3 text-current hover:opacity-70"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast doit être utilisé à l'intérieur de ToastProvider");
  }
  return context;
};
