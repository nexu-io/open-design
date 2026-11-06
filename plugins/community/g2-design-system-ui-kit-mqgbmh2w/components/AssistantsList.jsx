function AssistantsList() {
  return (
    <aside className="g2-assistants" aria-label="AI status cards">
      <section className="g2-card">
        <div className="g2-ai-orb" aria-hidden="true" />
        <strong>AI status</strong>
        <p className="g2-secondary">Listening for contextual commands.</p>
      </section>
      <section className="g2-card">
        <strong>Device</strong>
        <p className="g2-tertiary">Battery 82% · Network stable</p>
      </section>
    </aside>
  );
}

window.AssistantsList = AssistantsList;
