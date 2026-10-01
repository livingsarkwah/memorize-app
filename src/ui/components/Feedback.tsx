import { useApp } from '../AppState';
import { Sheet } from './Sheet';

/** Renders the app-wide confirm/problem dialog. */
export function DialogHost() {
  const { dialog, closeDialog, answerConfirm } = useApp();
  if (!dialog) return null;

  if (dialog.kind === 'confirm') {
    return (
      <Sheet title={dialog.title} dialog onClose={closeDialog}>
        <p className="dlg-body">{dialog.body}</p>
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={() => answerConfirm(false)}>Cancel</button>
          <button type="button" className={`btn ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => answerConfirm(true)}>{dialog.confirmLabel}</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={dialog.title} dialog onClose={closeDialog}>
      <p className="dlg-body">{dialog.message}</p>
      {dialog.problems.length > 0 && (
        <ul className="errlist">
          {dialog.problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}
          {dialog.problems.length > 6 && <li>and {dialog.problems.length - 6} more</li>}
        </ul>
      )}
      <div className="dlg-actions">
        <button type="button" className="btn primary" onClick={closeDialog}>Close</button>
      </div>
    </Sheet>
  );
}

/** The one-line message that appears above the tab bar. */
export function ToastHost() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && <button type="button" onClick={() => { const run = toast.action!.run; dismissToast(); run(); }}>{toast.action.label}</button>}
    </div>
  );
}
