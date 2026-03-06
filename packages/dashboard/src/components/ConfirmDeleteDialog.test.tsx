import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog.js';

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDeleteDialog>[0]> = {}) {
  const defaultProps = {
    isOpen: true,
    taskTitle: 'Implementare login',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const result = render(<ConfirmDeleteDialog {...defaultProps} />);
  return { ...result, props: defaultProps };
}

describe('ConfirmDeleteDialog', () => {
  it('renders the correct confirmation message with the task title', () => {
    renderDialog({ taskTitle: 'Refactor API layer' });

    expect(screen.getByText('Elimina Task')).toBeInTheDocument();
    expect(screen.getByText(/Refactor API layer/)).toBeInTheDocument();
    expect(
      screen.getByText(/L'operazione non e reversibile/),
    ).toBeInTheDocument();
  });

  it('calls onConfirm when the Conferma button is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: /Conferma/ }));

    expect(props.onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the Annulla button is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Escape key is pressed', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.keyboard('{Escape}');

    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it('does not render content when isOpen is false', () => {
    renderDialog({ isOpen: false });

    expect(screen.queryByText('Elimina Task')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annulla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conferma/ })).not.toBeInTheDocument();
  });
});
