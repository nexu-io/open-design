'use client';

import dynamic from 'next/dynamic';

import { installErrorHandlers } from '../../src/analytics/error-tracking';
import { MatrixLoader } from '../../src/components/MatrixLoader';
import { installWebObservability } from '../../src/observability/install';
import { installChatScrollExperiments } from '../../src/runtime/chat-scroll-experiments';
import { installChatScrollTakeover } from '../../src/runtime/chat-scroll-takeover';

// Install browser exception handlers at module-load time, before any other
// client code can throw. The hooks buffer events until AnalyticsProvider
// finishes `bootstrapExceptionTracking()` with the PostHog key, so even
// errors thrown during the dynamic import of `src/App` are captured.
installErrorHandlers();

// Install the rest of the observability surface (long tasks, white-screen
// detector, resource-error capture, boot timing, visibility tracking).
// Same buffer + consent-bypass transport as the exception handler above
// so events fired before AnalyticsProvider initialises still flush.
installWebObservability();

// The one consumer of the scroll-freeze probe's verdict: when the chat log's
// compositor-side scroll extent goes stale, answer the wheel from JavaScript
// instead. Deliberately NOT part of `installWebObservability()` — that entry
// point is for observers, and this changes behaviour. It is off unless an
// operator has set `open-design:chat-scroll-takeover` to `'1'`, in which case
// this call reads one storage key and returns without registering anything.
installChatScrollTakeover();

// 滚动冻结的两个未证伪假设(H2 自观察 / H3 msg-enter 的 fill:both)各有一个
// localStorage 开关,好让同一个包能做 A/B。两个都不设时这一调用读两个键就返回,
// 根节点上不留任何痕迹 —— 行为和没有这行时一模一样。
// 必须在 React 挂载**之前**跑:H3 是入场动画,类名晚一帧到就会先闪一次动画。
// 操作说明(怎么开、怎么关、开了会失去什么)写在模块顶部的 docblock 里。
installChatScrollExperiments();

// The product is a fully client-driven SPA — every component reads
// localStorage, window.location, etc. — so we opt out of static-time
// rendering for the entire tree. This keeps `next build --output export`
// from trying to evaluate browser-only code while still emitting a real
// shell HTML the daemon can serve as the SPA fallback.
const App = dynamic(() => import('../../src/App').then((m) => m.App), {
  ssr: false,
  // Keeps the `od-loading-shell` class on the outer node: the white-screen
  // detector filters this whole subtree out by that class when deciding
  // whether the app really mounted (`src/observability/white-screen.ts`).
  loading: () => (
    <div className="od-loading-shell">
      <MatrixLoader />
      <span>Loading OpenDesign…</span>
    </div>
  ),
});

export function ClientApp() {
  return <App />;
}
