import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CapabilityRoute from '@/components/security/CapabilityRoute';

const hasCapabilityMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasCapability: hasCapabilityMock,
  }),
}));

describe('CapabilityRoute', () => {
  it('renders child page when profile has required capability', () => {
    hasCapabilityMock.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/portal/backoffice']}>
        <Routes>
          <Route
            path="/portal/backoffice"
            element={(
              <CapabilityRoute capability="portal.backoffice.view">
                <div>Portal Backoffice</div>
              </CapabilityRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Portal Backoffice')).toBeInTheDocument();
  });

  it('redirects to dashboard when profile lacks required capability', () => {
    hasCapabilityMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/portal/investidor']}>
        <Routes>
          <Route path="/" element={<div>Dashboard</div>} />
          <Route
            path="/portal/investidor"
            element={(
              <CapabilityRoute capability="portal.investidor.view">
                <div>Portal Investidor</div>
              </CapabilityRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Portal Investidor')).not.toBeInTheDocument();
  });
});
