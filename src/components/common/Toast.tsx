interface ToastProps {
  message: string | null;
  isError?: boolean;
  onRetry?: () => void;
  onDismiss: () => void;
}

/** Doubles as both the transient "3 items added to your grocery list" toast
 *  and the original's persistent "couldn't save your changes" warning band —
 *  same markup, driven by whether onRetry is provided. */
export function Toast({ message, isError, onRetry, onDismiss }: ToastProps) {
  if (!message) return null;
  return (
    <div className="save-warning" style={{ display: 'flex' }}>
      <span>{message}</span>
      {onRetry && <button type="button" className="btn small" onClick={onRetry}>Retry</button>}
      <button type="button" className="close-x" onClick={onDismiss} aria-label="Dismiss">{'\u2715'}</button>
    </div>
  );
}
