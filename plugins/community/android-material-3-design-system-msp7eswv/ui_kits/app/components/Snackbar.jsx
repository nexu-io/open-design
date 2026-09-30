function Snackbar({ notificationId, message, actionLabel, onAction, onDismiss }) {
  React.useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [notificationId, onDismiss]);

  return (
    <div className="snackbar" role="status" aria-live="polite">
      <span>{message}</span>
      {actionLabel && <button type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

window.Snackbar = Snackbar;
