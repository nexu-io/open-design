function ChatArea() {
  const MessageBubble = window.MessageBubble;

  return (
    <main className="g2-thread" aria-label="G2 message workspace">
      <MessageBubble sender="Call" meta="Connected">
        Front display is active. Keep the action bar visible and controls close to the current task.
      </MessageBubble>
      <MessageBubble sender="Assistant" meta="AI reply" tone="ai">
        Suggested next prompt is ready. Use the compact command surface when switching to 320 mode.
      </MessageBubble>
      <MessageBubble sender="Teleprompter" meta="Preview">
        Keep type large, direct, and source-backed. Avoid dashboard density and marketing layout.
      </MessageBubble>
    </main>
  );
}

window.ChatArea = ChatArea;
