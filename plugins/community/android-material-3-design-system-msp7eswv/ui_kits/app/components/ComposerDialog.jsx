function ComposerDialog({ draft, onChange, onClose, onSend }) {
  const [errors, setErrors] = React.useState({});
  const subjectRef = React.useRef(null);

  React.useEffect(() => {
    subjectRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {
      to: draft.to.trim() ? '' : 'Enter at least one recipient.',
      subject: draft.subject.trim() ? '' : 'Add a subject before sending.',
      body: draft.body.trim() ? '' : 'Write a message before sending.',
    };
    setErrors(nextErrors);
    if (!Object.values(nextErrors).some(Boolean)) onSend();
  };

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="composer-title" onSubmit={submit}>
        <h2 id="composer-title">New message</h2>
        <label className="field">To<input value={draft.to} onChange={(event) => onChange('to', event.target.value)} aria-invalid={Boolean(errors.to)} aria-describedby={errors.to ? 'to-error' : undefined} />{errors.to && <span className="error-text" id="to-error">{errors.to}</span>}</label>
        <label className="field">Subject<input ref={subjectRef} value={draft.subject} onChange={(event) => onChange('subject', event.target.value)} aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? 'subject-error' : undefined} />{errors.subject && <span className="error-text" id="subject-error">{errors.subject}</span>}</label>
        <label className="field">Message<textarea value={draft.body} onChange={(event) => onChange('body', event.target.value)} aria-invalid={Boolean(errors.body)} aria-describedby={errors.body ? 'body-error' : undefined} />{errors.body && <span className="error-text" id="body-error">{errors.body}</span>}</label>
        <div className="dialog-actions"><button className="button button-outlined" type="button" onClick={onClose}>Save draft</button><button className="button button-filled" type="submit">Send</button></div>
      </form>
    </div>
  );
}

window.ComposerDialog = ComposerDialog;
