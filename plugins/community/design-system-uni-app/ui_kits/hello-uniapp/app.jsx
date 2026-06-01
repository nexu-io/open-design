/* App — routing, nav stack, overlay manager */
const { useState: useState_, useCallback } = React;

const TAB_TITLE = { component: "内置组件", api: "接口", extui: "扩展组件", template: "模板" };

function App() {
  const [tab, setTab] = useState_("component");
  const [demo, setDemo] = useState_(null);      // { id, title }
  const [overlay, setOverlay] = useState_(null); // { type, props }
  const toastTimer = React.useRef(null);

  const hideOverlay = useCallback(() => { clearTimeout(toastTimer.current); setOverlay(null); }, []);

  const app = {
    hideOverlay,
    showActionSheet: (items) => setOverlay({ type: "actionsheet", props: { items } }),
    showModal: ({ title, body, showCancel = true, onConfirm }) =>
      setOverlay({ type: "modal", props: { title, body, showCancel, onConfirm: onConfirm || hideOverlay } }),
    showToast: ({ icon, text, loading, duration = 1500 }) => {
      setOverlay({ type: "toast", props: { icon, text, loading } });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(hideOverlay, duration);
    },
  };

  const openDemo = (id) => setDemo({ id, title: id });

  let view, nav;
  if (demo) {
    const DemoComp = DEMOS[demo.id] || (() => <Placeholder title={demo.title} />);
    nav = <NavBar title={demo.title} onBack={() => setDemo(null)} />;
    view = <div className="body"><DemoComp /></div>;
  } else {
    nav = <NavBar title={TAB_TITLE[tab]} right={{ glyph: "&#xe534;", onClick: () => app.showToast({ text: "关于 uni-app" }) }} />;
    if (tab === "component") view = <ComponentHome openDemo={openDemo} />;
    else if (tab === "api") view = <ApiPage app={app} />;
    else if (tab === "extui") view = <ExtUIPage />;
    else view = <TemplatePage app={app} />;
  }

  return (
    <Device>
      <StatusBar />
      {nav}
      {view}
      {!demo && <TabBar active={tab} onChange={(t) => { setDemo(null); setTab(t); }} />}
      {overlay && overlay.type === "actionsheet" && <ActionSheet {...overlay.props} onClose={hideOverlay} />}
      {overlay && overlay.type === "modal" && <Modal {...overlay.props} onCancel={hideOverlay} />}
      {overlay && overlay.type === "toast" && <Toast {...overlay.props} />}
    </Device>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
