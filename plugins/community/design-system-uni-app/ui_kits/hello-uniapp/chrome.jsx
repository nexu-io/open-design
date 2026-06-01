/* Chrome: device frame, status bar, nav bar, tab bar */
const { useState } = React;

function StatusBar({ dark }) {
  return (
    <div className={"statusbar" + (dark ? " dark" : "")}>
      <span>9:41</span>
      <span className="sb-right">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="none"><rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor"/></svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none"><path d="M8 2.2C10 2.2 11.8 3 13.1 4.3l1.3-1.4C12.7 1.1 10.4.2 8 .2S3.3 1.1 1.6 2.9L2.9 4.3C4.2 3 6 2.2 8 2.2z" fill="currentColor" opacity=".95"/><path d="M8 5.4c1.1 0 2.1.4 2.9 1.2l1.3-1.4C11 4 9.6 3.4 8 3.4s-3 .6-4.2 1.8l1.3 1.4C5.9 5.8 6.9 5.4 8 5.4z" fill="currentColor" opacity=".95"/><circle cx="8" cy="9" r="1.6" fill="currentColor"/></svg>
        <span className="sb-bat" />
      </span>
    </div>
  );
}

function NavBar({ title, onBack, right, h5 }) {
  return (
    <div className={"navbar" + (h5 ? " h5" : "")}>
      {onBack && (
        <span className="nav-left uni-icon uni-icon-back" onClick={onBack} />
      )}
      <span className="nav-title">{title}</span>
      {right && <span className="nav-right uni-icon" onClick={right.onClick} dangerouslySetInnerHTML={{__html: right.glyph}} />}
    </div>
  );
}

const TABS = [
  { id: "component", label: "内置组件" },
  { id: "api", label: "接口" },
  { id: "extui", label: "扩展组件" },
  { id: "template", label: "模板" },
];

function TabBar({ active, onChange }) {
  return (
    <div className="tabbar">
      {TABS.map((t) => (
        <div key={t.id} className={"tab" + (active === t.id ? " active" : "")} onClick={() => onChange(t.id)}>
          <img src={`tab-${t.id}${active === t.id ? "-active" : ""}.png`} alt="" />
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function Device({ children }) {
  return (
    <div className="device">
      <div className="screen">{children}</div>
    </div>
  );
}

Object.assign(window, { StatusBar, NavBar, TabBar, Device, TABS });
