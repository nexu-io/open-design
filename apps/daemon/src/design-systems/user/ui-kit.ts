import { escapeJsString, escapeTsxText } from '../core/body.js';

/**
 * Returns the canonical list of UI kit component specs — one entry per role
 * component generated under `ui_kits/app/components/`. The order determines
 * `<script>` tag order in `index.html`; `App` must load last so all role
 * components it references are already mounted on `window`.
 */
export function defaultUiKitComponentSpecs(): Array<{ fileName: string; componentName: string; purpose: string }> {
  return [
    { fileName: 'App.jsx', componentName: 'App', purpose: 'Composes the workspace shell, navigation rail, review content, and composer surface.' },
    { fileName: 'Sidebar.jsx', componentName: 'Sidebar', purpose: 'Defines the compact navigation rail and active-section rhythm.' },
    { fileName: 'AssistantsList.jsx', componentName: 'AssistantsList', purpose: 'Models the assistant, thread, or object list that anchors a product workspace.' },
    { fileName: 'ChatArea.jsx', componentName: 'ChatArea', purpose: 'Composes the main conversation or review workspace with a header, content stream, and empty state.' },
    { fileName: 'InputBar.jsx', componentName: 'InputBar', purpose: 'Models the primary composer with attachments, actions, and send affordances.' },
    { fileName: 'MessageBubble.jsx', componentName: 'MessageBubble', purpose: 'Captures reusable message, note, or review-comment surfaces with metadata and status.' },
  ];
}

/**
 * Returns `true` when `text` is a small auto-generated UI kit scaffold that can
 * be safely overwritten by `writeDefaultUiKitComponentsIfMissing`. The heuristic
 * checks for a small byte size and the `od-ui-kit-*` class marker.
 *
 * @param text - Existing component file content.
 */
export function isReplaceableUiKitScaffold(text: string): boolean {
  return Buffer.byteLength(text, 'utf8') < 700 && /od-ui-kit-[a-z-]+/u.test(text);
}

/**
 * Renders the JSX source for a named UI kit role component.
 * Dispatches to a specific renderer for the 8 canonical role names, and falls
 * back to a generic placeholder component for any unknown name.
 *
 * @param name - Component name (e.g. `'App'`, `'Sidebar'`).
 * @param title - Design-system title embedded in default props.
 * @param purpose - Human-readable description used in the generic fallback.
 */
export function renderUiKitComponent(name: string, title: string, purpose: string): string {
  if (name === 'App') return renderAppUiKitComponent(title);
  if (name === 'Sidebar') return renderSidebarUiKitComponent(title);
  if (name === 'AssistantsList') return renderAssistantsListUiKitComponent(title);
  if (name === 'ChatArea') return renderChatAreaUiKitComponent(title);
  if (name === 'InputBar') return renderInputBarUiKitComponent(title);
  if (name === 'MessageBubble') return renderMessageBubbleUiKitComponent(title);
  if (name === 'PreviewCard') return renderPreviewCardUiKitComponent(title);
  if (name === 'Composer') return renderComposerUiKitComponent(title);
  return `function ${name}({ children, title = '${escapeJsString(title)}' }) {
  return (
    <section className="od-ui-kit-${name.toLowerCase()}">
      <small>${escapeTsxText(purpose)}</small>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

window.${name} = ${name};
`;
}

/** @internal Renders `App.jsx` — the root shell composing all role components. */
function renderAppUiKitComponent(title: string): string {
  return `const reviewModules = [
  { id: 'colors', label: 'Color review', summary: 'Primary, theme, and semantic color cards' },
  { id: 'type', label: 'Typography review', summary: 'Specimens, scale, and dense metadata rhythm' },
  { id: 'components', label: 'Component review', summary: 'Buttons, inputs, cards, and feedback states' },
];

const appStyles = {
  shell: { display: 'grid', gridTemplateColumns: '280px minmax(240px, 300px) 1fr', minHeight: '720px', background: 'var(--color-background, #f7f8fa)', color: 'var(--color-text, #202124)' },
  workspace: { padding: '24px', display: 'grid', gap: '16px', alignContent: 'start' },
  card: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 12, background: 'var(--color-surface, #fff)', padding: '16px' },
  eyebrow: { color: 'var(--color-text-secondary, #73777f)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0 },
};

function App({ title = '${escapeJsString(title)}', modules = reviewModules, summary = 'Source-backed design-system workspace' }) {
  const Sidebar = window.Sidebar;
  const AssistantsList = window.AssistantsList;
  const ChatArea = window.ChatArea;
  return (
    <main style={appStyles.shell}>
      <Sidebar title={title} />
      <AssistantsList />
      <section style={appStyles.workspace}>
        <span style={appStyles.eyebrow}>Review surface</span>
        <h1>{title}</h1>
        <p>{summary}</p>
        <ChatArea title={title + ' workspace'} />
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {modules.map((module) => (
            <article key={module.id} style={appStyles.card}>
              <strong>{module.label}</strong>
              <p>{module.summary}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

window.App = App;
`;
}

/** @internal Renders `Sidebar.jsx` — the navigation rail component. */
function renderSidebarUiKitComponent(title: string): string {
  return `const sidebarItems = [
  { id: 'design-system', label: 'Design System', badge: 'ready' },
  { id: 'design-files', label: 'Design Files', badge: '2' },
  { id: 'preview', label: 'Preview', badge: 'html' },
];

const sidebarStyles = {
  wrap: { width: 280, minHeight: 640, borderRight: '1px solid var(--color-border, #dfe3e8)', background: 'var(--color-background-soft, #fff)', padding: 16 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  mark: { width: 34, height: 34, borderRadius: 10, background: 'var(--color-primary, #00b96b)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 },
  item: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '11px 12px', borderRadius: 10, marginBottom: 8, border: '1px solid transparent' },
  active: { borderColor: 'var(--color-primary, #00b96b)', background: 'var(--color-primary-soft, rgba(0,185,107,.1))' },
  badge: { fontSize: 11, color: 'var(--color-text-secondary, #73777f)' },
};

function Sidebar({ title = '${escapeJsString(title)}', activeId = 'design-system', items = sidebarItems }) {
  return (
    <nav style={sidebarStyles.wrap} aria-label={title}>
      <div style={sidebarStyles.header}>
        <div style={sidebarStyles.mark}>{title.slice(0, 1)}</div>
        <strong>{title}</strong>
      </div>
      {items.map((item) => (
        <button key={item.id} type="button" style={{ ...sidebarStyles.item, ...(item.id === activeId ? sidebarStyles.active : {}) }}>
          <span>{item.label}</span>
          <span style={sidebarStyles.badge}>{item.badge}</span>
        </button>
      ))}
    </nav>
  );
}

window.Sidebar = Sidebar;
`;
}

/** @internal Renders `AssistantsList.jsx` — the assistant/thread list panel. */
function renderAssistantsListUiKitComponent(title: string): string {
  return `const assistantItems = [
  { id: 'default', name: '${escapeJsString(title)} reviewer', meta: 'Design review workspace', active: true },
  { id: 'tokens', name: 'Token specialist', meta: 'Colors, type, spacing, and states', active: false },
  { id: 'components', name: 'Component reviewer', meta: 'Cards, inputs, messages, and navigation', active: false },
];

const assistantsListStyles = {
  panel: { width: 280, borderRight: '1px solid var(--color-border, #dfe3e8)', background: 'var(--color-surface, #fff)', padding: 14, display: 'grid', alignContent: 'start', gap: 10 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  row: { display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, border: '1px solid transparent' },
  active: { borderColor: 'var(--color-primary, #00b96b)', background: 'var(--color-primary-soft, rgba(0,185,107,.1))' },
  avatar: { width: 32, height: 32, borderRadius: 10, background: 'var(--color-background-soft, #f7f8fa)', display: 'grid', placeItems: 'center', fontWeight: 700 },
  meta: { color: 'var(--color-text-secondary, #73777f)', fontSize: 12 },
};

function AssistantsList({ items = assistantItems }) {
  return (
    <aside style={assistantsListStyles.panel} aria-label="Assistants">
      <header style={assistantsListStyles.header}>
        <strong>Assistants</strong>
        <button type="button">New</button>
      </header>
      {items.map((item) => (
        <button key={item.id} type="button" style={{ ...assistantsListStyles.row, ...(item.active ? assistantsListStyles.active : {}) }}>
          <span style={assistantsListStyles.avatar}>{item.name.slice(0, 1)}</span>
          <span>
            <strong>{item.name}</strong>
            <small style={assistantsListStyles.meta}>{item.meta}</small>
          </span>
        </button>
      ))}
    </aside>
  );
}

window.AssistantsList = AssistantsList;
`;
}

/** @internal Renders `ChatArea.jsx` — the main conversation / content stream panel. */
function renderChatAreaUiKitComponent(title: string): string {
  return `const chatMessages = [
  { id: 'user', role: 'You', text: 'Create a compact review surface from the captured source evidence.' },
  { id: 'assistant', role: '${escapeJsString(title)}', text: 'The system uses focused preview cards, source-backed tokens, and reusable app-kit components.' },
];

const chatAreaStyles = {
  wrap: { minHeight: 640, background: 'var(--color-background, #f7f8fa)', display: 'grid', gridTemplateRows: 'auto 1fr auto' },
  header: { minHeight: 54, borderBottom: '1px solid var(--color-border, #dfe3e8)', padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface, #fff)' },
  stream: { padding: 22, display: 'grid', alignContent: 'start', gap: 14, overflow: 'auto' },
  note: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 12, background: 'var(--color-surface, #fff)', padding: 14 },
  composerSlot: { borderTop: '1px solid var(--color-border, #dfe3e8)', background: 'var(--color-surface, #fff)', padding: 16 },
};

function ChatArea({ title = '${escapeJsString(title)} review', messages = chatMessages }) {
  const InputBar = window.InputBar;
  const MessageBubble = window.MessageBubble;
  return (
    <section style={chatAreaStyles.wrap} aria-label={title}>
      <header style={chatAreaStyles.header}>
        <strong>{title}</strong>
        <button type="button">Open source context</button>
      </header>
      <div style={chatAreaStyles.stream}>
        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} text={message.text} fromUser={message.id === 'user'} />
        ))}
      </div>
      <div style={chatAreaStyles.composerSlot}><InputBar title={title + ' prompt'} /></div>
    </section>
  );
}

window.ChatArea = ChatArea;
`;
}

/** @internal Renders `InputBar.jsx` — the primary prompt composer. */
function renderInputBarUiKitComponent(title: string): string {
  return `const inputActions = ['Attach', 'Source', 'Revise'];

const inputBarStyles = {
  wrap: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 14, background: 'var(--color-surface, #fff)', padding: 12, display: 'grid', gap: 10 },
  field: { minHeight: 82, border: 0, outline: 0, resize: 'vertical', font: 'inherit', color: 'var(--color-text, #202124)' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 999, padding: '6px 10px', background: 'var(--color-background-soft, #f7f8fa)' },
  send: { border: 0, borderRadius: 10, padding: '9px 14px', background: 'var(--color-primary, #00b96b)', color: '#fff', fontWeight: 700 },
};

function InputBar({ title = '${escapeJsString(title)} prompt', actions = inputActions }) {
  return (
    <form style={inputBarStyles.wrap} aria-label={title}>
      <textarea style={inputBarStyles.field} placeholder="Describe the design revision, evidence to inspect, or preview card to improve." />
      <div style={inputBarStyles.toolbar}>
        <div style={inputBarStyles.actions}>
          {actions.map((action) => <button key={action} type="button" style={inputBarStyles.chip}>{action}</button>)}
        </div>
        <button type="submit" style={inputBarStyles.send}>Send</button>
      </div>
    </form>
  );
}

window.InputBar = InputBar;
`;
}

/** @internal Renders `MessageBubble.jsx` — a message/note/review-comment surface. */
function renderMessageBubbleUiKitComponent(title: string): string {
  return `const messageBubbleStyles = {
  bubble: { maxWidth: 680, border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 14, background: 'var(--color-surface, #fff)', padding: 14, display: 'grid', gap: 8 },
  user: { marginLeft: 'auto', background: 'var(--color-primary-soft, rgba(0,185,107,.1))', borderColor: 'var(--color-primary, #00b96b)' },
  meta: { display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--color-text-secondary, #73777f)', fontSize: 12 },
  text: { margin: 0, lineHeight: 1.55 },
  status: { justifySelf: 'start', borderRadius: 999, padding: '4px 8px', background: 'var(--color-background-soft, #f7f8fa)', fontSize: 12 },
};

function MessageBubble({ role = '${escapeJsString(title)}', text = 'Source-backed design-system guidance belongs in compact, reviewable message surfaces.', status = 'grounded', fromUser = false }) {
  return (
    <article style={{ ...messageBubbleStyles.bubble, ...(fromUser ? messageBubbleStyles.user : {}) }}>
      <div style={messageBubbleStyles.meta}>
        <strong>{role}</strong>
        <span>{status}</span>
      </div>
      <p style={messageBubbleStyles.text}>{text}</p>
      <span style={messageBubbleStyles.status}>Uses captured evidence</span>
    </article>
  );
}

window.MessageBubble = MessageBubble;
`;
}

/** @internal Renders `PreviewCard.jsx` — a review-card module with swatch strip and checks. */
function renderPreviewCardUiKitComponent(title: string): string {
  return `const defaultChecks = [
  'Matches source evidence',
  'Shows real component states',
  'Reusable in future projects',
];

const previewCardStyles = {
  card: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 12, background: 'var(--color-surface, #fff)', overflow: 'hidden' },
  header: { padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid var(--color-border, #dfe3e8)' },
  body: { padding: 18, display: 'grid', gap: 14 },
  swatches: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 },
  swatch: { minHeight: 52, borderRadius: 10, border: '1px solid var(--color-border, #dfe3e8)' },
  check: { display: 'flex', gap: 8, color: 'var(--color-text-secondary, #73777f)' },
};

function PreviewCard({ title = '${escapeJsString(title)} module', summary = 'Captures source-backed review states for one design-system module.', checks = defaultChecks }) {
  return (
    <article style={previewCardStyles.card}>
      <header style={previewCardStyles.header}>
        <div>
          <strong>{title}</strong>
          <p>{summary}</p>
        </div>
        <button type="button">Looks good</button>
      </header>
      <div style={previewCardStyles.body}>
        <div style={previewCardStyles.swatches}>
          {['var(--color-primary, #00b96b)', 'var(--color-surface, #fff)', 'var(--color-background-soft, #f7f8fa)', 'var(--color-text, #202124)'].map((color) => (
            <span key={color} style={{ ...previewCardStyles.swatch, background: color }} />
          ))}
        </div>
        {checks.map((check) => <span key={check} style={previewCardStyles.check}>- {check}</span>)}
      </div>
    </article>
  );
}

window.PreviewCard = PreviewCard;
`;
}

/** @internal Renders `Composer.jsx` — a revision-feedback composer with action chips. */
function renderComposerUiKitComponent(title: string): string {
  return `const composerActions = ['Attach evidence', 'Open source context', 'Request revision'];

const composerStyles = {
  wrap: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 14, background: 'var(--color-surface, #fff)', padding: 14, display: 'grid', gap: 12 },
  field: { minHeight: 92, border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 10, padding: 12, resize: 'vertical', font: 'inherit' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 999, padding: '6px 10px', background: 'var(--color-background-soft, #f7f8fa)' },
  send: { border: 0, borderRadius: 10, padding: '10px 14px', background: 'var(--color-primary, #00b96b)', color: '#fff', fontWeight: 700 },
};

function Composer({ title = '${escapeJsString(title)} feedback', actions = composerActions }) {
  return (
    <form style={composerStyles.wrap} aria-label={title}>
      <textarea style={composerStyles.field} placeholder="Describe what needs revision while keeping the source evidence intact." />
      <div style={composerStyles.toolbar}>
        <div style={composerStyles.chips}>
          {actions.map((action) => <button key={action} type="button" style={composerStyles.chip}>{action}</button>)}
        </div>
        <button type="submit" style={composerStyles.send}>Send</button>
      </div>
    </form>
  );
}

window.Composer = Composer;
`;
}
