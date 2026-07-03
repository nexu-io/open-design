function MessageBubble({ sender, meta, children, tone = "default" }) {
  return (
    <article className="g2-message" data-tone={tone}>
      <div className="g2-meta">{sender} · {meta}</div>
      <div>{children}</div>
    </article>
  );
}

window.MessageBubble = MessageBubble;
