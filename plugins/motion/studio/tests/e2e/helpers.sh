#!/bin/bash
# E2E test helpers for agent-browser that work reliably with React components.
# Uses JS-based clicks (element.click()) instead of pointer events to avoid
# stale ref issues after iframe reloads.

# Click a button by its exact text content
click_button() {
  local text="$1"
  agent-browser eval --stdin <<EVALEOF
(function() {
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.trim() === '${text}') {
      btns[i].click();
      return 'clicked: ${text}';
    }
  }
  return 'not found: ${text}';
})()
EVALEOF
}

# Click a button whose text contains a substring
click_button_contains() {
  local text="$1"
  agent-browser eval --stdin <<EVALEOF
(function() {
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.includes('${text}')) {
      btns[i].click();
      return 'clicked: ' + btns[i].textContent.trim().substring(0, 60);
    }
  }
  return 'not found: ${text}';
})()
EVALEOF
}

# Set an input value by label text and commit via Enter
set_input() {
  local label="$1"
  local value="$2"
  agent-browser eval --stdin <<EVALEOF
(function() {
  var labels = document.querySelectorAll('label, span');
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].textContent.trim() === '${label}') {
      var input = labels[i].closest('[class]')?.querySelector('input');
      if (!input) continue;
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '${value}');
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', bubbles: true}));
      return 'set ${label} = ${value}';
    }
  }
  return 'not found: ${label}';
})()
EVALEOF
}

# Select from a combobox/select by label and option value
select_option() {
  local label="$1"
  local value="$2"
  agent-browser eval --stdin <<EVALEOF
(function() {
  var selects = document.querySelectorAll('select');
  for (var i = 0; i < selects.length; i++) {
    var lbl = selects[i].closest('[class]')?.querySelector('label, span');
    if (lbl && lbl.textContent.trim() === '${label}') {
      selects[i].value = '${value}';
      selects[i].dispatchEvent(new Event('change', {bubbles: true}));
      return 'selected ${label} = ${value}';
    }
  }
  return 'not found: ${label}';
})()
EVALEOF
}

# Wait for text to appear in the page
wait_for_text() {
  local text="$1"
  local timeout="${2:-10000}"
  agent-browser wait --text "${text}" --timeout "${timeout}" 2>/dev/null || echo "timeout waiting for: ${text}"
}
