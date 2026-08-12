const INITIAL_MESSAGES = [
  { id: 1, sender: 'Maya Chen', email: 'maya@example.com', subject: 'Adaptive navigation review', snippet: 'I added the compact and expanded acceptance criteria…', body: 'I added the compact, medium, and expanded acceptance criteria to the review. Please check that the list-detail transition preserves focus and keeps the primary action visible.', time: '9:42 AM', unread: true },
  { id: 2, sender: 'Ravi Patel', email: 'ravi@example.com', subject: 'Research synthesis', snippet: 'The latest interviews reinforce the need for…', body: 'The latest interviews reinforce the need for a clear unread state and predictable archive recovery. The findings are summarized in the shared research note.', time: '8:18 AM', unread: true },
  { id: 3, sender: 'Jordan Lee', email: 'jordan@example.com', subject: 'Copy pass complete', snippet: 'Error messages now include a recovery action…', body: 'The copy pass is complete. Error messages now identify the problem and include a concrete recovery action instead of relying on generic failure language.', time: 'Yesterday', unread: false },
  { id: 4, sender: 'Amina Yusuf', email: 'amina@example.com', subject: 'Accessibility checks', snippet: 'Keyboard traversal and 200% text zoom both pass…', body: 'Keyboard traversal and 200 percent text zoom both pass in the new flow. I left one note about announcing the archive snackbar to assistive technology.', time: 'Mon', unread: false },
];

function App() {
  const [messages, setMessages] = React.useState(INITIAL_MESSAGES);
  const [selectedId, setSelectedId] = React.useState(INITIAL_MESSAGES[0].id);
  const [query, setQuery] = React.useState('');
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [showList, setShowList] = React.useState(true);
  const [theme, setTheme] = React.useState('light');
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ to: '', subject: '', body: '' });
  const [snackbar, setSnackbar] = React.useState(null);
  const archivedRef = React.useRef(null);

  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const visibleMessages = messages.filter((message) => {
    const haystack = `${message.sender} ${message.subject} ${message.snippet}`.toLowerCase();
    return (!unreadOnly || message.unread) && haystack.includes(query.trim().toLowerCase());
  });
  const selected = messages.find((message) => message.id === selectedId) || visibleMessages[0] || null;

  const selectMessage = (id) => {
    setSelectedId(id);
    setMessages((current) => current.map((message) => message.id === id ? { ...message, unread: false } : message));
    setShowList(false);
  };

  const archive = (id) => {
    const item = messages.find((message) => message.id === id);
    if (!item) return;
    archivedRef.current = item;
    setMessages((current) => current.filter((message) => message.id !== id));
    setSelectedId(messages.find((message) => message.id !== id)?.id ?? null);
    setShowList(true);
    setSnackbar({ message: 'Message archived', actionLabel: 'Undo' });
  };

  const undoArchive = () => {
    if (archivedRef.current) setMessages((current) => [archivedRef.current, ...current]);
    archivedRef.current = null;
    setSnackbar(null);
  };

  const reply = (message) => {
    setDraft({ to: message.email, subject: `Re: ${message.subject}`, body: '' });
    setComposerOpen(true);
  };

  const send = () => {
    setComposerOpen(false);
    setDraft({ to: '', subject: '', body: '' });
    setSnackbar({ message: 'Message sent' });
  };

  return (
    <main className="inbox-app">
      <NavigationRail theme={theme} onToggleTheme={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} />
      <MailList messages={visibleMessages} selectedId={selected?.id} query={query} unreadOnly={unreadOnly} mobileHidden={!showList} onQueryChange={setQuery} onUnreadChange={setUnreadOnly} onSelect={selectMessage} />
      <MessageDetail message={selected} mobileHidden={showList} onBack={() => setShowList(true)} onArchive={archive} onReply={reply} />
      <button className="fab" type="button" onClick={() => setComposerOpen(true)}>✎ Compose</button>
      {composerOpen && <ComposerDialog draft={draft} onChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))} onClose={() => setComposerOpen(false)} onSend={send} />}
      {snackbar && <Snackbar message={snackbar.message} actionLabel={snackbar.actionLabel} onAction={undoArchive} onDismiss={() => setSnackbar(null)} />}
    </main>
  );
}

window.App = App;
