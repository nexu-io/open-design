/* Tab pages: component accordion home, API actions, extended components, templates */
const { useState: useSt } = React;

/* ---------- 内置组件 (accordion) ---------- */
const CATEGORIES = [
  { id: "view", name: "视图容器", pages: ["view", "scroll-view", "swiper", "movable-view"] },
  { id: "content", name: "基础内容", pages: ["text", "rich-text", "progress"] },
  { id: "form", name: "表单组件", pages: ["button", "checkbox", "input", "radio", "slider", "switch", "textarea"] },
  { id: "nav", name: "导航", pages: ["navigator"] },
  { id: "media", name: "媒体组件", pages: ["image", "video"] },
  { id: "canvas", name: "画布", pages: ["canvas"] },
];

function ComponentHome({ openDemo }) {
  const [open, setOpen] = useSt("form");
  return (
    <div className="body">
      <div className="home-hero">
        <div className="hero-title">uni-app内置组件，展示样式仅供参考，文档详见：</div>
        <div className="hero-link">https://uniapp.dcloud.io/component/</div>
      </div>
      {CATEGORIES.map((cat) => (
        <div className="panel" key={cat.id}>
          <div className="panel-h" onClick={() => setOpen(open === cat.id ? "" : cat.id)}>
            <span>{cat.name}</span>
            <span className="uni-icon" dangerouslySetInnerHTML={{ __html: open === cat.id ? "&#xe581;" : "&#xe470;" }} />
          </div>
          {open === cat.id && (
            <div className="panel-c">
              {cat.pages.map((p) => (
                <div className="nav-item" key={p} onClick={() => openDemo(p)}>
                  <span>{p}</span>
                  <span className="chev" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ height: 16 }} />
    </div>
  );
}

function Placeholder({ title }) {
  return (
    <div>
      <PageHead title={title} />
      <div style={{ textAlign: "center", padding: "60px 30px", color: "#999" }}>
        <div className="uni-icon uni-icon-info" style={{ fontSize: 46, color: "#c9c9c9" }} />
        <p style={{ fontSize: 14, marginTop: 16, lineHeight: 1.6 }}>
          <b>{title}</b> 组件在真实 Hello uni-app 中可交互演示。<br />本 UI kit 重点还原了表单与基础组件的视觉与交互。
        </p>
      </div>
    </div>
  );
}

/* ---------- 接口 (API actions) ---------- */
function ApiPage({ app }) {
  return (
    <div className="body">
      <div className="home-hero"><div className="hero-title">uni-app 接口能力，点击体验交互效果</div></div>
      <List header="界面">
        <Cell label="操作菜单 ActionSheet" nav onClick={() => app.showActionSheet([
          { label: "拍照" }, { label: "从相册选择" }, { label: "删除", danger: true, onClick: () => app.showToast({ icon: "uni-icon-checkmarkempty", text: "已删除" }) },
        ])} />
        <Cell label="模态弹窗 Modal" nav onClick={() => app.showModal({ title: "提示", body: "确定要退出登录吗？", onConfirm: () => { app.hideOverlay(); app.showToast({ icon: "uni-icon-checkmarkempty", text: "已退出" }); } })} />
        <Cell label="消息提示 Toast" nav onClick={() => app.showToast({ icon: "uni-icon-checkmarkempty", text: "操作成功" })} />
        <Cell label="加载提示 Loading" nav onClick={() => app.showToast({ loading: true, text: "加载中", duration: 1600 })} />
      </List>
      <List header="设备 & 网络">
        <Cell label="扫码 scanCode" nav onClick={() => app.showToast({ icon: "uni-icon-scan", text: "启动扫码" })} />
        <Cell label="获取位置 getLocation" nav onClick={() => app.showToast({ icon: "uni-icon-location", text: "定位中", loading: false })} />
        <Cell label="网络请求 request" nav onClick={() => app.showToast({ loading: true, text: "请求中", duration: 1400 })} />
        <Cell label="剪贴板 setClipboardData" nav onClick={() => app.showToast({ icon: "uni-icon-checkmarkempty", text: "已复制" })} />
      </List>
      <div style={{ height: 16 }} />
    </div>
  );
}

/* ---------- 扩展组件 (uni-ui showcase) ---------- */
function ExtUIPage() {
  return (
    <div className="body">
      <div className="section-label">Badge 数字角标</div>
      <div className="chips">
        <Badge>Primary</Badge><Badge type="success">Success</Badge><Badge type="warning">Warning</Badge>
        <Badge type="danger">Danger</Badge><Badge type="royal">Royal</Badge>
      </div>
      <div className="chips" style={{ paddingTop: 0, alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>消息</span><Badge count>9</Badge>
        <span style={{ fontSize: 14, marginLeft: 8 }}>通知</span><Badge count>99+</Badge>
        <span style={{ fontSize: 14, marginLeft: 8 }}>动态</span><Badge dot />
      </div>

      <div className="section-label">Tag 标签</div>
      <div className="chips">
        <span className="tag">默认标签</span><span className="tag outline">描边标签</span>
        <span className="tag grey">灰色标签</span>
      </div>

      <div className="section-label">Card 卡片</div>
      <Card title="uni-app 插件市场" foot={<span>ext.dcloud.net.cn</span>}>
        数千款组件、SDK 与项目模板，开箱即用，覆盖各端的丰富生态。
      </Card>

      <div className="section-label">Steps 步骤条</div>
      <Steps current={1} />

      <div className="section-label">NoticeBar 通告栏</div>
      <div style={{ background: "#fffbe8", color: "#a67d00", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span className="uni-icon uni-icon-info" style={{ color: "#ffbe00" }} />
        <span>uni-app 已支持发布到 14 个平台，欢迎体验。</span>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

function Steps({ current }) {
  const steps = ["下单", "付款", "发货", "收货"];
  return (
    <div style={{ display: "flex", padding: "18px 8px" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
          {i > 0 && <div style={{ position: "absolute", left: "-50%", top: 11, width: "100%", height: 1, background: i <= current ? "#007aff" : "#ddd" }} />}
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: i <= current ? "#007aff" : "#fff", border: "1px solid " + (i <= current ? "#007aff" : "#ccc"), color: i <= current ? "#fff" : "#999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, zIndex: 1 }}>{i + 1}</div>
          <span style={{ fontSize: 12, marginTop: 6, color: i <= current ? "#007aff" : "#999" }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- 模板 (composed screens) ---------- */
function TemplatePage({ app }) {
  const [push, setPush] = useSt(true); const [wifi, setWifi] = useSt(false);
  return (
    <div className="body">
      <div className="section-label">设置 Settings 模板</div>
      <List>
        <Cell label="消息通知"><Switch value={push} onChange={setPush} /></Cell>
        <Cell label="仅 Wi-Fi 下载"><Switch value={wifi} onChange={setWifi} /></Cell>
      </List>
      <List>
        <Cell label="账号与安全" nav onClick={() => app.showToast({ text: "账号与安全" })} />
        <Cell label="清除缓存" value="12.4 MB" nav onClick={() => app.showModal({ title: "清除缓存", body: "确定清除 12.4 MB 缓存？", onConfirm: () => { app.hideOverlay(); app.showToast({ icon: "uni-icon-checkmarkempty", text: "已清除" }); } })} />
        <Cell label="关于 uni-app" value="v3.0" nav onClick={() => app.showToast({ text: "Hello uni-app" })} />
      </List>

      <div className="section-label">图文列表 Media list 模板</div>
      <List>
        {[["跨平台框架对比评测", "深入测试一周，主流多端框架大比武"], ["uni-app 性能优化指南", "setData 差量同步与编译期优化"], ["插件市场精选", "数千款组件，开箱即用"]].map(([t, d], i) => (
          <div className="cell" key={i} style={{ alignItems: "flex-start", padding: "12px 16px" }}>
            <div style={{ width: 42, height: 42, borderRadius: 6, background: "linear-gradient(135deg,#2b9939,#1f7a2c)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginRight: 12, flex: "0 0 auto" }}>u</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, color: "#000" }}>{t}</div>
              <div style={{ fontSize: 12, color: "#8f8f94", marginTop: 3, lineHeight: 1.4 }}>{d}</div>
            </div>
          </div>
        ))}
      </List>
      <div className="pad mt"><Button type="primary">查看更多案例</Button></div>
      <div style={{ height: 16 }} />
    </div>
  );
}

Object.assign(window, { ComponentHome, Placeholder, ApiPage, ExtUIPage, TemplatePage, CATEGORIES });
