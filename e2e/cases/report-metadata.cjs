module.exports = {
  'prototype-basic': {
    module: 'Project creation and generation',
    assertions: [
      'Can create a prototype project and enter the workspace',
      'Receives the mocked artifact after sending a prompt',
      'Generated file appears in the workspace',
      'Preview iframe shows the expected title',
    ],
  },
  'deck-basic': {
    module: 'Project creation and generation',
    assertions: [
      'Can create a project through the deck tab',
      'Receives a deck artifact after sending a prompt',
      'Deck file appears in the workspace',
      'Preview iframe shows the expected title',
    ],
  },
  'design-system-selection': {
    module: 'Project creation and generation',
    assertions: [
      'Design system picker can search and select the target system',
      'Project metadata keeps the selected design system after creation',
      'Project opens into the workspace instead of remaining on the create view',
    ],
  },
  'example-use-prompt': {
    module: 'Project creation and generation',
    assertions: [
      'Examples page Use this prompt action creates a project directly',
      'Created project title and metadata include the selected skill name',
      'Chat input is prefilled with the example prompt',
    ],
  },
  'conversation-persistence': {
    module: 'Conversation lifecycle',
    assertions: [
      'Can create a second conversation and send a new prompt',
      'Current conversation messages survive refresh',
      'History menu can switch back to an older conversation',
      'Older conversation content still renders correctly after switching back',
    ],
  },
  'conversation-delete-recovery': {
    module: 'Conversation lifecycle',
    assertions: [
      'Deleting the active conversation does not leave the UI in an empty dead state',
      'UI falls back to a remaining conversation',
      'Deleted conversation messages no longer render',
    ],
  },
  'question-form-selection-limit': {
    module: 'Conversation lifecycle',
    assertions: [
      'Question form checkbox with maxSelections=2 allows at most two selections',
      'A new unchecked option is not selected after the limit is reached',
      'Selected count remains inside the configured limit',
    ],
  },
  'question-form-submit-persistence': {
    module: 'Conversation lifecycle',
    assertions: [
      'Submitting a question form writes a user answer message',
      'Form immediately enters answered and locked state',
      'Refresh restores locked state and selected answers from history',
    ],
  },
  'generation-does-not-create-extra-file': {
    module: 'Project creation and generation',
    assertions: [
      'First generation creates only the expected artifact file',
      'Refreshing without sending a new prompt does not create extra files',
      'Files API returns the same file set before and after refresh',
    ],
  },
  'file-mention': {
    module: 'File workflow',
    assertions: [
      'Mention popover can search and select a preset file',
      'Input inserts @filename',
      'Staged attachment shows the selected file',
    ],
  },
  'file-upload-send': {
    module: 'File workflow',
    assertions: [
      'Composer file input can upload a file',
      'Staged attachment appears after upload',
      'Sent user message preserves the uploaded attachment',
    ],
  },
  'deep-link-preview': {
    module: 'File workflow',
    assertions: [
      'Generated artifact updates the URL to the file route',
      'Leaving the project file route still allows returning through the file route',
      'Preview iframe restores the correct file after re-entering',
    ],
  },
  'design-files-upload': {
    module: 'File workflow',
    assertions: [
      'Design Files panel can upload an image',
      'Uploaded file row appears in the Design Files list',
      'Right preview panel shows file information',
      'Double-clicking the file row opens it as a tab',
    ],
  },
  'design-files-delete': {
    module: 'File workflow',
    assertions: [
      'Design Files row menu can trigger delete',
      'Confirmed delete removes the file row from the list',
      'Matching open tab is also cleaned up when the file was open',
    ],
  },
  'design-files-tab-persistence': {
    module: 'File workflow',
    assertions: [
      'Multiple file tabs can be open at once',
      'Active tab state persists after switching',
      'Refresh restores the tab set',
      'Previously active tab remains selected after refresh',
    ],
  },
};
