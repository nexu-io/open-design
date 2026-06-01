/* Primitive components — canonical uni-app built-ins */
const { useState: useStateP } = React;

function Button({ type, plain, mini, disabled, loading, children, onClick }) {
  const cls = ["btn", type, plain && "plain", mini && "mini"].filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={disabled} onClick={disabled ? undefined : onClick}>
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}

function Switch({ value, onChange }) {
  return <div className={"uswitch" + (value ? " on" : "")} onClick={() => onChange(!value)}><div className="knob" /></div>;
}

function Checkbox({ value, onChange }) {
  return (
    <div className={"ucheck" + (value ? " on" : "")} onClick={() => onChange(!value)}>
      <span className="uni-icon uni-icon-checkmarkempty" style={{ fontWeight: 700 }} />
    </div>
  );
}

function Radio({ value, onChange }) {
  return <div className={"uradio" + (value ? " on" : "")} onClick={() => onChange(true)} />;
}

function Slider({ value, onChange, min = 0, max = 100 }) {
  const ref = React.useRef(null);
  const pct = ((value - min) / (max - min)) * 100;
  const move = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    let p = (clientX - r.left) / r.width;
    p = Math.max(0, Math.min(1, p));
    onChange(Math.round(min + p * (max - min)));
  };
  const onDown = (e) => {
    move(e.clientX);
    const mv = (ev) => move(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  return (
    <div className="slider">
      <div className="track" ref={ref} onPointerDown={onDown}>
        <div className="fill" style={{ width: pct + "%" }} />
        <div className="thumb" style={{ left: pct + "%" }} />
      </div>
      <span className="val">{value}</span>
    </div>
  );
}

function Badge({ type, children, dot, count }) {
  const cls = ["badge", type, dot && "dot", count && "count"].filter(Boolean).join(" ");
  return <span className={cls}>{!dot && children}</span>;
}

function List({ children, header }) {
  return (
    <div>
      {header && <div className="list-divider">{header}</div>}
      <div className="list">{children}</div>
    </div>
  );
}

function Cell({ label, value, nav, onClick, children }) {
  return (
    <div className={"cell" + (nav ? " nav" : "")} onClick={onClick}>
      <span className="c-label">{label}</span>
      {children ? <span className="c-val">{children}</span> : value != null && <span className="c-val">{value}</span>}
      {nav && <span className="chev" />}
    </div>
  );
}

function Card({ title, foot, children }) {
  return (
    <div className="card">
      {title && <div className="card-head">{title}</div>}
      <div className="card-body">{children}</div>
      {foot && <div className="card-foot">{foot}</div>}
    </div>
  );
}

function Progress({ value }) {
  return (
    <div className="progress-row">
      <div className="progress"><div className="bar" style={{ width: value + "%" }} /></div>
      <span className="p-val">{value}%</span>
    </div>
  );
}

Object.assign(window, { Button, Switch, Checkbox, Radio, Slider, Badge, List, Cell, Card, Progress });
