import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import styled, { css } from 'styled-components';

type ButtonVariant = 'primary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  asChild?: boolean;
}

const StyledButton = styled.button<{ $variant: ButtonVariant; $loading: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.fontSize.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  cursor: pointer;
  transition: background 0.15s;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${({ $variant, theme }) => {
    if ($variant === 'primary')
      return css`
        background: ${theme.colors.primary};
        color: white;
        &:hover:not(:disabled) {
          background: ${theme.colors.primaryHover};
        }
      `;
    if ($variant === 'danger')
      return css`
        background: ${theme.colors.error};
        color: white;
        &:hover:not(:disabled) {
          background: ${theme.colors.errorHover};
        }
      `;
    return css`
      background: none;
      color: ${theme.colors.textSecondary};
      padding: 0;
      &:hover:not(:disabled) {
        color: ${theme.colors.text};
      }
    `;
  }}

  ${({ $loading }) =>
    $loading &&
    css`
      opacity: 0.6;
      cursor: wait;
    `}
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading = false, asChild = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : StyledButton;
    return (
      <Comp
        ref={ref}
        $variant={variant}
        $loading={loading}
        disabled={disabled || loading}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';
