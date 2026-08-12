function NavigationRail({ theme, onToggleTheme }) {
  const destinations = [
    { icon: '⌂', label: 'Inbox', current: true },
    { icon: '★', label: 'Starred' },
    { icon: '⌁', label: 'Archive' },
  ];

  const Destination = ({ item }) => (
    <button className="nav-action" aria-current={item.current ? 'page' : undefined} type="button">
      <span className="nav-icon" aria-hidden="true">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );

  return (
    <>
      <header className="top-app-bar">
        <strong>Material Inbox</strong>
        <button className="icon-button" type="button" onClick={onToggleTheme} aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}>
          {theme === 'light' ? '◐' : '☀'}
        </button>
      </header>
      <nav className="navigation-rail" aria-label="Primary destinations">
        <div className="brand-mark" aria-hidden="true">M3</div>
        {destinations.map((item) => <Destination key={item.label} item={item} />)}
        <button className="nav-action theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}>
          <span className="nav-icon" aria-hidden="true">{theme === 'light' ? '◐' : '☀'}</span>
          <span>Theme</span>
        </button>
      </nav>
      <nav className="bottom-navigation" aria-label="Primary destinations">
        {destinations.map((item) => <Destination key={item.label} item={item} />)}
      </nav>
    </>
  );
}

window.NavigationRail = NavigationRail;
