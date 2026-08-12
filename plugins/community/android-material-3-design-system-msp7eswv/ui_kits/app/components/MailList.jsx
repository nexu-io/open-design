function MailList({ messages, selectedId, query, unreadOnly, mobileHidden, onQueryChange, onUnreadChange, onSelect }) {
  return (
    <section className={`mail-column${mobileHidden ? ' pane-mobile-hidden' : ''}`} aria-label="Message list">
      <header className="mail-header">
        <div className="mail-title-row">
          <h1>Inbox</h1>
          <span className="count">{messages.length} messages</span>
        </div>
        <label>
          <span className="sr-only">Search messages</span>
          <input className="search" type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search mail" />
        </label>
        <div className="filter-row" aria-label="Message filters">
          <button className="filter-chip" type="button" aria-pressed={!unreadOnly} onClick={() => onUnreadChange(false)}>All</button>
          <button className="filter-chip" type="button" aria-pressed={unreadOnly} onClick={() => onUnreadChange(true)}>Unread</button>
        </div>
      </header>
      {messages.length === 0 ? (
        <div className="empty-state"><strong>No messages found</strong><p>Try a different search or show all mail.</p></div>
      ) : (
        <ul className="mail-list">
          {messages.map((message) => (
            <li key={message.id}>
              <button className="mail-item" type="button" aria-current={selectedId === message.id ? 'true' : undefined} onClick={() => onSelect(message.id)}>
                <span className="avatar" aria-hidden="true">{message.sender.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                <span className="mail-copy">
                  <span className="sender-line"><span className="sender">{message.sender}</span>{message.unread && <span className="unread-dot" aria-label="Unread" />}</span>
                  <span className="subject">{message.subject}</span>
                  <span className="snippet">{message.snippet}</span>
                </span>
                <span className="time">{message.time}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

window.MailList = MailList;
