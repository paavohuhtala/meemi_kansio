import { forwardRef, type InputHTMLAttributes } from 'react';
import styled from 'styled-components';

const StyledInput = styled.input`
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSize.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => {
    return <StyledInput ref={ref} {...props} />;
  }
);
Input.displayName = 'Input';
