import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { listInvites, createInvite, type Invite } from '../api/invites';

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
`;

const Heading = styled.h1`
  font-size: ${({ theme }) => theme.fontSize.xxl};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Section = styled.section`
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSize.lg};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const CreateRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Input = styled.input`
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSize.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  width: 120px;
`;

const Button = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: white;
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSize.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};

  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: 500;
`;

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const Badge = styled.span<{ $variant: 'active' | 'used' | 'expired' }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: 0.75rem;
  font-weight: 500;
  background: ${({ $variant, theme }) =>
    $variant === 'active'
      ? theme.colors.success + '22'
      : $variant === 'used'
        ? theme.colors.primary + '22'
        : theme.colors.error + '22'};
  color: ${({ $variant, theme }) =>
    $variant === 'active'
      ? theme.colors.success
      : $variant === 'used'
        ? theme.colors.primary
        : theme.colors.error};
`;

const Code = styled.code`
  background: ${({ theme }) => theme.colors.bg};
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

function inviteStatus(invite: Invite): 'active' | 'used' | 'expired' {
  if (invite.used_by) return 'used';
  if (new Date(invite.expires_at) < new Date()) return 'expired';
  return 'active';
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState('72');

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['invites'],
    queryFn: listInvites,
  });

  const mutation = useMutation({
    mutationFn: () => createInvite(parseInt(hours) || 72),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
  });

  return (
    <Container>
      <Heading>Admin</Heading>
      <Section>
        <SectionTitle>Invites</SectionTitle>
        <CreateRow>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating...' : 'New invite'}
          </Button>
          <Input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            min="1"
          />
          <span style={{ color: '#888', fontSize: '0.875rem' }}>hours</span>
        </CreateRow>

        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th>Expires</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => {
                const status = inviteStatus(invite);
                return (
                  <tr key={invite.id}>
                    <Td><Code>{invite.code}</Code></Td>
                    <Td><Badge $variant={status}>{status}</Badge></Td>
                    <Td>{new Date(invite.expires_at).toLocaleDateString()}</Td>
                    <Td>{new Date(invite.created_at).toLocaleDateString()}</Td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr>
                  <Td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>
                    No invites yet
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Section>
    </Container>
  );
}
