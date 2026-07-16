function App() {
  const Sidebar = window.Sidebar;
  const ChatArea = window.ChatArea;
  const AssistantsList = window.AssistantsList;
  const InputBar = window.InputBar;

  return (
    <div className="g2-app" data-g2-mode="regular">
      <Sidebar />
      <section className="g2-workspace">
        <header className="g2-header">
          <div>
            <p className="g2-meta">G2 glasses HUD · regular 640 mode</p>
            <h1 className="g2-title">Live control surface</h1>
          </div>
          <span className="g2-tertiary">Focus #0D76FFA6</span>
        </header>
        <div className="g2-layout">
          <ChatArea />
          <AssistantsList />
        </div>
        <InputBar />
      </section>
    </div>
  );
}

window.App = App;
