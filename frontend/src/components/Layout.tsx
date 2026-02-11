import { Link, Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../hooks/useAuth';

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

const NavLinks = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-left: auto;
  align-items: center;
`;

const NavLink = styled(Link)`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Username = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`;

const LogoutBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSize.sm};
  padding: 0;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      <Nav>
        <Logo to="/">meemi</Logo>
        <NavLinks>
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          <Username>{user?.username}</Username>
          <LogoutBtn onClick={() => logout()}>Log out</LogoutBtn>
        </NavLinks>
      </Nav>
      <Outlet />
    </>
  );
}
