// packages/dsh-runtime/src/index.ts
// Updated event listener for @deepseek-ai/dsh 0.1.5-rc.1+
eventEmitter.on('session/event', (event: any) => {
  if (event.type === 'assistant/chunk') {
    // Legacy support
    accumulateText(event.payload);
  } else if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
    const payload = event.payload || {};
    const contentBlocks = payload.content || payload.message?.content || [];
    for (const block of contentBlocks) {
      if (block.type === 'text' && block.text) {
        accumulateText({ type: 'text-delta', text: block.text });
      } else if (block.type === 'reasoning' && block.text) {
        accumulateText({ type: 'reasoning-delta', text: block.text });
      }
    }
  }
});