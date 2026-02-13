import { createContext, useCallback, useContext, useState } from 'react';
import { Toast } from 'radix-ui';
import styled, { keyframes } from 'styled-components';

const slideIn = keyframes`
  from { transform: translateX(calc(100% + 32px)); }
  to   { transform: translateX(0); }
`;

const slideOut = keyframes`
  from { transform: translateX(0); }
  to   { transform: translateX(calc(100% + 32px)); }
`;

const StyledViewport = styled(Toast.Viewport)`
  position: fixed;
  bottom: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 400px;
  width: 100%;
  z-index: 200;
  list-style: none;
  margin: 0;
`;

const StyledRoot = styled(Toast.Root)<{ $variant: 'success' | 'error' }>`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme, $variant }) =>
    $variant === 'error' ? theme.colors.error : theme.colors.success};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);

  &[data-state='open'] {
    animation: ${slideIn} 0.2s ease-out;
  }

  &[data-state='closed'] {
    animation: ${slideOut} 0.2s ease-in;
  }
`;

const StyledTitle = styled(Toast.Title)`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
`;

interface ToastItem {
  id: number;
  message: string;
  variant: 'success' | 'error';
}

interface ToastContextValue {
  toast: (message: string, variant?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: 'success' | 'error' = 'success') => {
    setToasts((prev) => [...prev, { id: nextId++, message, variant }]);
  }, []);

  function handleOpenChange(id: number, open: boolean) {
    if (!open) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }
  }

  return (
    <ToastContext value={{ toast }}>
      <Toast.Provider duration={3000}>
        {children}
        {toasts.map((t) => (
          <StyledRoot
            key={t.id}
            $variant={t.variant}
            onOpenChange={(open) => handleOpenChange(t.id, open)}
          >
            <StyledTitle>{t.message}</StyledTitle>
          </StyledRoot>
        ))}
        <StyledViewport />
      </Toast.Provider>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
