import { Link, Outlet, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../hooks/useAuth';
import { useGlobalFileDrop } from '../hooks/useGlobalFileDrop';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './DropdownMenu';

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Logo = styled(Link)`
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const NavLink = styled(Link)`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Spacer = styled.div`
  margin-left: auto;
`;

const TriggerButton = styled.button`
  all: unset;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

const DragOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: none;
`;

const DragOverlayText = styled.p`
  font-size: ${({ theme }) => theme.fontSize.xl};
  color: white;
  background: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.lg} ${({ theme }) => theme.spacing.xl};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
`;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isDragging } = useGlobalFileDrop(ACCEPTED_TYPES);

  return (
    <>
      <Nav>
        <Logo to="/">meemi_kansio</Logo>
        <NavLink to="/upload">Upload</NavLink>
        <Spacer />
        <DropdownMenuRoot>
          <DropdownMenuTrigger asChild>
            <TriggerButton>
              {user?.username} &#9662;
            </TriggerButton>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user?.role === 'admin' && (
                <DropdownMenuItem onSelect={() => navigate('/admin')}>
                  Admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => logout()}>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </Nav>
      <Outlet />
      {isDragging && (
        <DragOverlay data-testid="drag-overlay">
          <DragOverlayText>Drop to upload</DragOverlayText>
        </DragOverlay>
      )}
    </>
  );
}
