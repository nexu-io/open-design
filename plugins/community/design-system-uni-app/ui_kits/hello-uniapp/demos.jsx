/* Demo pages for built-in components (opened from the accordion home) */
const { useState: useS } = React;

function PageHead({ title }) {
  return <div className="page-head"><span className="ph-title">{title}</span></div>;
}

function ButtonDemo() {
  const [loading, setLoading] = useS(true);
  React.useEffect(() => { const t = setTimeout(() => setLoading(true), 300); return () => clearTimeout(t); }, []);
  return (
    <div>
      <PageHead title="button" />
      <div className="pad">
        <Button type="primary">页面主操作 Normal</Button>
        <Button type="primary" loading>页面主操作 Loading</Button>
        <Button type="primary" disabled>页面主操作 Disabled</Button>
        <Button type="default">页面次要操作 Normal</Button>
        <Button type="default" disabled>页面次要操作 Disabled</Button>
        <Button type="warn">警告类操作 Normal</Button>
        <Button type="warn" disabled>警告类操作 Disabled</Button>
        <div className="btn-area">
          <Button type="primary" plain>按钮</Button>
          <Button type="default" plain>按钮</Button>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
            <Button type="primary" mini>按钮</Button>
            <Button type="default" mini>按钮</Button>
            <Button type="warn" mini>按钮</Button>
          </div>
        </div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

function SwitchDemo() {
  const [a, setA] = useS(true); const [b, setB] = useS(false);
  const [c, setC] = useS(true); const [d, setD] = useS(false);
  return (
    <div>
      <PageHead title="switch" />
      <List header="Switch 开关">
        <Cell label="开启状态"><Switch value={a} onChange={setA} /></Cell>
        <Cell label="关闭状态"><Switch value={b} onChange={setB} /></Cell>
      </List>
      <div style={{ height: 14 }} />
      <List header="Checkbox 复选框">
        <Cell label="同意用户协议"><Checkbox value={c} onChange={setC} /></Cell>
        <Cell label="订阅消息推送"><Checkbox value={d} onChange={setD} /></Cell>
      </List>
    </div>
  );
}

function RadioDemo() {
  const [v, setV] = useS("a");
  const opts = [["a", "中国 China"], ["b", "美国 USA"], ["c", "日本 Japan"]];
  return (
    <div>
      <PageHead title="radio" />
      <div className="list">
        {opts.map(([k, l]) => (
          <div key={k} className="opt-row" onClick={() => setV(k)}>
            <Radio value={v === k} onChange={() => setV(k)} />
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckboxDemo() {
  const [set, setSet] = useS({ usa: true, cn: false, jp: false });
  const toggle = (k) => setSet((s) => ({ ...s, [k]: !s[k] }));
  const opts = [["usa", "美国 USA"], ["cn", "中国 China"], ["jp", "日本 Japan"]];
  return (
    <div>
      <PageHead title="checkbox" />
      <div className="list">
        {opts.map(([k, l]) => (
          <div key={k} className="opt-row" onClick={() => toggle(k)}>
            <Checkbox value={set[k]} onChange={() => toggle(k)} />
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SliderDemo() {
  const [v, setV] = useS(60); const [v2, setV2] = useS(30);
  return (
    <div>
      <PageHead title="slider" />
      <List header="设置数值">
        <Slider value={v} onChange={setV} />
      </List>
      <div style={{ height: 14 }} />
      <List header="带步长">
        <Slider value={v2} onChange={(n) => setV2(Math.round(n / 10) * 10)} />
      </List>
    </div>
  );
}

function ProgressDemo() {
  const [p, setP] = useS(45);
  return (
    <div>
      <PageHead title="progress" />
      <div className="list">
        <Progress value={20} />
        <Progress value={45} />
        <Progress value={p} />
        <Progress value={100} />
      </div>
      <div className="pad mt">
        <Button type="primary" mini onClick={() => setP((x) => Math.min(100, x + 10))}>加 10%</Button>
      </div>
    </div>
  );
}

function InputDemo() {
  const [name, setName] = useS(""); const [pwd, setPwd] = useS("");
  return (
    <div>
      <PageHead title="input" />
      <div className="form-group">
        <div className="field"><span className="f-label">姓名</span><input placeholder="请输入姓名" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><span className="f-label">手机号</span><input placeholder="请输入手机号" inputMode="numeric" /></div>
        <div className="field"><span className="f-label">密码</span><input type="password" placeholder="请输入密码" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
      </div>
      <div className="hint">输入框聚焦时键盘自动弹起，placeholder 颜色 #b2b2b2。</div>
    </div>
  );
}

function TextDemo() {
  return (
    <div>
      <PageHead title="text" />
      <div className="pad" style={{ paddingBottom: 20 }}>
        <p className="uni-h3" style={{ margin: "12px 0", fontWeight: 700 }}>标题文本 H3</p>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: "#333" }}>uni-app 是一个使用 Vue.js 开发所有前端应用的框架，开发者编写一套代码，可发布到 iOS、Android、Web 以及各种小程序等多个平台。</p>
        <p style={{ fontSize: 13, color: "#8f8f94", marginTop: 14 }}>这是一段次要说明文字（caption）。</p>
        <a className="uni-link" style={{ color: "#576b95", fontSize: 14 }}>这是一个链接 →</a>
      </div>
    </div>
  );
}

const DEMOS = {
  button: ButtonDemo, switch: SwitchDemo, radio: RadioDemo, checkbox: CheckboxDemo,
  slider: SliderDemo, progress: ProgressDemo, input: InputDemo, text: TextDemo,
};

Object.assign(window, { DEMOS, PageHead });
