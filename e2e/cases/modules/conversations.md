# Conversation Lifecycle

This module covers chat conversation lifecycle behavior inside a project.

## Automated Cases

- `conversation-persistence`: create a second conversation, send a prompt, refresh, and switch back through history.
- `conversation-delete-recovery`: delete the active conversation and verify the UI falls back to a remaining conversation.
- `question-form-selection-limit`: verify checkbox max selection limits in question forms.
- `question-form-submit-persistence`: verify submitted question forms persist answers and locked state through refresh.

## Future Coverage

- Conversation rename.
- Automatic recovery after deleting the final conversation.
- History menu open and close state.
- Long conversation list scrolling.
- Title generation after multi-turn conversations.
