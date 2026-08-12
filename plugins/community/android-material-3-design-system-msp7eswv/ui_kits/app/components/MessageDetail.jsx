function MessageDetail({ message, mobileHidden, onBack, onArchive, onReply, onToggleStar }) {
  if (!message) {
    return <section className={`detail-column${mobileHidden ? ' pane-mobile-hidden' : ''}`}><div className="empty-state"><strong>Select a message</strong><p>Choose an item from the list to read it here.</p></div></section>;
  }

  return (
    <section className={`detail-column${mobileHidden ? ' pane-mobile-hidden' : ''}`} aria-label="Selected message">
      <div className="detail-toolbar">
        <button className="icon-button compact-back" type="button" onClick={onBack} aria-label="Back to messages">←</button>
        <div className="detail-actions">
          <button className="icon-button" type="button" aria-label={message.starred ? 'Unstar message' : 'Star message'} aria-pressed={message.starred} onClick={() => onToggleStar(message.id)}>{message.starred ? '★' : '☆'}</button>
          <button className="icon-button" type="button" onClick={() => onArchive(message.id)} aria-label="Archive message">⌁</button>
          <button className="icon-button" type="button" aria-label="More actions unavailable" title="More actions are not included in this focused example" disabled>⋮</button>
        </div>
      </div>
      <article className="message">
        <h2>{message.subject}</h2>
        <div className="message-meta">
          <span className="avatar" aria-hidden="true">{message.sender.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
          <div><strong>{message.sender}</strong><span>{message.email} · {message.time}</span></div>
        </div>
        <div className="message-body">
          <p>Hi team,</p>
          <p>{message.body}</p>
          <section className="task-card">
            <h3>Before Thursday</h3>
            <ul><li>Review the updated flow.</li><li>Confirm accessibility acceptance criteria.</li><li>Add unresolved questions to the planning note.</li></ul>
          </section>
          <p>Thanks for keeping the feedback focused on the customer task and the evidence we have.</p>
        </div>
        <div className="message-actions">
          <button className="button button-filled" type="button" onClick={() => onReply(message)}>Reply</button>
          <button className="button button-outlined" type="button" onClick={() => onArchive(message.id)}>Archive</button>
        </div>
      </article>
    </section>
  );
}

window.MessageDetail = MessageDetail;
