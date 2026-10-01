// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '../../src/ui/components/Sheet';
import './setup';

function Page({ onClose, open = true }: { onClose: () => void; open?: boolean }) {
  return (
    <>
      <div className="frame"><button>Behind</button></div>
      {open && (
        <Sheet title="Practice settings" onClose={onClose}>
          <button>First</button>
          <button>Last</button>
        </Sheet>
      )}
    </>
  );
}

describe('Sheet', () => {
  it('is a modal dialog that makes the rest of the app inert, and undoes that on close', () => {
    const { rerender } = render(<Page onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Practice settings' })).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('.frame')).toHaveAttribute('inert');
    rerender(<Page onClose={() => {}} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.frame')).not.toHaveAttribute('inert');
  });

  it('puts focus in the dialog and returns it to the opener afterwards', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = render(<Page onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
    rerender(<Page onClose={() => {}} open={false} />);
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('closes on Escape, on the close button, and on a tap outside', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Page onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.pointer({ target: document.querySelector('.overlay')!, keys: '[MouseLeft]' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close when tapping inside the panel', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Page onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Page onClose={() => {}} />);
    screen.getByRole('button', { name: 'Last' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus(); // wrapped to the first control
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus(); // and back to the last
  });
});
