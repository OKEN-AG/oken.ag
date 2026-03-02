import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useOperations', () => ({
  useOperationStats: () => ({
    isLoading: false,
    data: {
      totalVolume: 250000,
      activeCount: 1,
      totalCount: 1,
      totalSacas: 500,
      operations: [
        {
          id: 'op-123',
          client_name: 'Cliente XPTO',
          created_at: new Date('2026-01-01').toISOString(),
          gross_revenue: 12000,
          total_sacas: 180,
          status: 'pedido',
        },
      ],
    },
  }),
}));

describe('Dashboard navigation', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it('navigates to operation stepper instead of legacy documents route', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Cliente XPTO'));

    expect(navigateMock).toHaveBeenCalledWith('/operacao/op-123');
    expect(navigateMock).not.toHaveBeenCalledWith('/documentos', expect.anything());
  });
});
