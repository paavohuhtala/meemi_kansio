import { DropdownMenu } from 'radix-ui';
import styled, { keyframes } from 'styled-components';

const slideDown = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const DropdownMenuRoot = DropdownMenu.Root;
export const DropdownMenuTrigger = DropdownMenu.Trigger;
export const DropdownMenuPortal = DropdownMenu.Portal;

export const DropdownMenuContent = styled(DropdownMenu.Content)`
  min-width: 160px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.xs};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: ${slideDown} 0.15s ease-out;
  z-index: 50;
`;

export const DropdownMenuItem = styled(DropdownMenu.Item)`
  all: unset;
  display: flex;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  cursor: pointer;
  user-select: none;

  &[data-highlighted] {
    background: ${({ theme }) => theme.colors.surfaceHover};
    outline: none;
  }
`;

export const DropdownMenuLabel = styled(DropdownMenu.Label)`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  user-select: none;
`;

export const DropdownMenuSeparator = styled(DropdownMenu.Separator)`
  height: 1px;
  background: ${({ theme }) => theme.colors.border};
  margin: ${({ theme }) => theme.spacing.xs} 0;
`;
