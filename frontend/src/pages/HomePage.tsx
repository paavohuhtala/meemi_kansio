import styled from 'styled-components';

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
`;

const Heading = styled.h1`
  font-size: ${({ theme }) => theme.fontSize.xxl};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function HomePage() {
  return (
    <Container>
      <Heading>Browse</Heading>
      <Subtitle>Media uploads will appear here.</Subtitle>
    </Container>
  );
}
