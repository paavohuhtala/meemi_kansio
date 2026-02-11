import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Label as RadixLabel } from 'radix-ui';
import styled from 'styled-components';

const StyledLabel = styled(RadixLabel.Root)`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  user-select: none;
`;

export const Label = forwardRef<HTMLLabelElement, ComponentPropsWithoutRef<typeof RadixLabel.Root>>(
  (props, ref) => {
    return <StyledLabel ref={ref} {...props} />;
  }
);
Label.displayName = 'Label';
