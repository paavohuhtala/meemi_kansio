import { AlertDialog } from 'radix-ui';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const scaleIn = keyframes`
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
`;

export const AlertDialogRoot = AlertDialog.Root;
export const AlertDialogTrigger = AlertDialog.Trigger;
export const AlertDialogPortal = AlertDialog.Portal;

export const AlertDialogOverlay = styled(AlertDialog.Overlay)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  animation: ${fadeIn} 0.15s ease-out;
  z-index: 100;
`;

export const AlertDialogContent = styled(AlertDialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(400px, 90vw);
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  animation: ${scaleIn} 0.15s ease-out;
  z-index: 101;
`;

export const AlertDialogTitle = styled(AlertDialog.Title)`
  font-size: ${({ theme }) => theme.fontSize.lg};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

export const AlertDialogDescription = styled(AlertDialog.Description)`
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

export const AlertDialogActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
`;

export const AlertDialogCancel = AlertDialog.Cancel;
export const AlertDialogAction = AlertDialog.Action;
