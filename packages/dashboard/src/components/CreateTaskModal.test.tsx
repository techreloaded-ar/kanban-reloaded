import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CreateTaskModal } from './CreateTaskModal.js';
import { createCreateTaskModalProps } from '../test-utils/propFactories.js';
import { createMockAgent } from '../test-utils/mockHelpers.js';

describe('CreateTaskModal', () => {
  describe('validation', () => {
    it('blocks submission when title is empty via native required validation', async () => {
      const user = userEvent.setup();
      const onCreateTask = vi.fn().mockResolvedValue(undefined);
      render(<CreateTaskModal {...createCreateTaskModalProps({ onCreateTask })} />);

      const titleInput = screen.getByLabelText('Titolo');
      expect(titleInput).toBeRequired();

      await user.click(screen.getByRole('button', { name: 'Crea' }));

      // Native required validation prevents handleSubmit from firing
      expect(onCreateTask).not.toHaveBeenCalled();
    });

    it('shows error when title contains only whitespace', async () => {
      const user = userEvent.setup();
      const onCreateTask = vi.fn().mockResolvedValue(undefined);
      render(<CreateTaskModal {...createCreateTaskModalProps({ onCreateTask })} />);

      await user.type(screen.getByLabelText('Titolo'), '   ');
      await user.click(screen.getByRole('button', { name: 'Crea' }));

      expect(screen.getByText('Il titolo è obbligatorio')).toBeInTheDocument();
      expect(onCreateTask).not.toHaveBeenCalled();
    });

    it('clears validation error when user types after whitespace-only submission', async () => {
      const user = userEvent.setup();
      render(<CreateTaskModal {...createCreateTaskModalProps()} />);

      // Whitespace passes native required but fails custom trim check
      const titleInput = screen.getByLabelText('Titolo');
      await user.type(titleInput, '   ');
      await user.click(screen.getByRole('button', { name: 'Crea' }));
      expect(screen.getByText('Il titolo è obbligatorio')).toBeInTheDocument();

      // Typing clears the error
      await user.type(titleInput, 'N');
      expect(screen.queryByText('Il titolo è obbligatorio')).not.toBeInTheDocument();
    });
  });

  describe('successful submission', () => {
    it('calls onCreateTask with correct payload including all fields', async () => {
      const user = userEvent.setup();
      const onCreateTask = vi.fn().mockResolvedValue(undefined);
      render(<CreateTaskModal {...createCreateTaskModalProps({ onCreateTask })} />);

      await user.type(screen.getByLabelText('Titolo'), 'New feature');
      await user.type(screen.getByLabelText('Descrizione'), 'Build the thing');
      await user.type(screen.getByLabelText('Criteri di Accettazione'), 'It works');
      // Click "Alta" priority button
      await user.click(screen.getByRole('button', { name: 'Alta' }));
      await user.click(screen.getByRole('button', { name: 'Crea' }));

      await waitFor(() => {
        expect(onCreateTask).toHaveBeenCalledWith({
          title: 'New feature',
          description: 'Build the thing',
          acceptanceCriteria: 'It works',
          priority: 'high',
          agentId: null,
        });
      });
    });

    it('resets form after successful submit', async () => {
      const user = userEvent.setup();
      const onCreateTask = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      const { rerender } = render(
        <CreateTaskModal {...createCreateTaskModalProps({ onCreateTask, onClose })} />,
      );

      await user.type(screen.getByLabelText('Titolo'), 'Temporary title');
      await user.click(screen.getByRole('button', { name: 'Crea' }));

      await waitFor(() => {
        expect(onCreateTask).toHaveBeenCalled();
      });

      // Re-render the modal as open again (simulating re-open)
      rerender(
        <CreateTaskModal {...createCreateTaskModalProps({ onCreateTask, onClose })} />,
      );

      expect(screen.getByLabelText('Titolo')).toHaveValue('');
    });

    it('calls onClose after successful submit', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const onCreateTask = vi.fn().mockResolvedValue(undefined);
      render(<CreateTaskModal {...createCreateTaskModalProps({ onCreateTask, onClose })} />);

      await user.type(screen.getByLabelText('Titolo'), 'Task title');
      await user.click(screen.getByRole('button', { name: 'Crea' }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe('agent selection', () => {
    it('sends selected agentId in payload', async () => {
      const user = userEvent.setup();
      const onCreateTask = vi.fn().mockResolvedValue(undefined);
      const agents = [
        createMockAgent({ id: 'agent-1', name: 'Claude' }),
        createMockAgent({ id: 'agent-2', name: 'GPT' }),
      ];
      render(
        <CreateTaskModal
          {...createCreateTaskModalProps({ onCreateTask, availableAgents: agents })}
        />,
      );

      await user.type(screen.getByLabelText('Titolo'), 'Agent task');
      // Select the second agent
      await user.click(screen.getByRole('button', { name: 'GPT' }));
      await user.click(screen.getByRole('button', { name: 'Crea' }));

      await waitFor(() => {
        expect(onCreateTask).toHaveBeenCalledWith(
          expect.objectContaining({ agentId: 'agent-2' }),
        );
      });
    });

    it('does not show agent section when no agents available', () => {
      render(<CreateTaskModal {...createCreateTaskModalProps({ availableAgents: [] })} />);

      expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    });
  });

  describe('API error handling', () => {
    it('displays error message when onCreateTask rejects', async () => {
      const user = userEvent.setup();
      const onCreateTask = vi.fn().mockRejectedValue(new Error('Network error'));
      const onClose = vi.fn();
      render(<CreateTaskModal {...createCreateTaskModalProps({ onCreateTask, onClose })} />);

      await user.type(screen.getByLabelText('Titolo'), 'Will fail');
      await user.click(screen.getByRole('button', { name: 'Crea' }));

      await waitFor(() => {
        expect(screen.getByText('Errore durante la creazione del task')).toBeInTheDocument();
      });
      // Modal should NOT close on error
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('calls onClose when Annulla button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CreateTaskModal {...createCreateTaskModalProps({ onClose })} />);

      await user.click(screen.getByRole('button', { name: 'Annulla' }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('modal visibility', () => {
    it('does not render content when isOpen is false', () => {
      render(<CreateTaskModal {...createCreateTaskModalProps({ isOpen: false })} />);

      expect(screen.queryByText('Crea Task')).not.toBeInTheDocument();
    });

    it('renders content when isOpen is true', () => {
      render(<CreateTaskModal {...createCreateTaskModalProps({ isOpen: true })} />);

      expect(screen.getByText('Crea Task')).toBeInTheDocument();
    });
  });
});
