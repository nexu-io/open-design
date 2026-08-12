/*
 * 案例素材替换入口
 *
 * 后续拿到真实材料后：
 * 1. 将图片和结果 HTML 放到 assets/cases/<scheme>/；
 * 2. 修改下面 caseData 中的 request、context、questionImage 和 resultUrl；
 * 3. questionImage / resultUrl 为 null 时，页面继续显示占位符。
 */
const caseData = {
  a2a: {
    number: "CASE / 01",
    title: "A2A 远程 Agent 多轮任务",
    request: "[占位] 用户在 Mobilework 工作空间提出网站设计需求。后续替换为真实首轮提示词。",
    context: `{
  "taskId": "<真实 taskId>",
  "contextId": "<真实 contextId>",
  "state": "TASK_STATE_INPUT_REQUIRED",
  "answers": "<用户回答>"
}`,
    questionImage: null,
    questionImagePath: "assets/cases/a2a/question.png",
    resultUrl: null,
    resultPath: "assets/cases/a2a/result/index.html",
  },
  elicitation: {
    number: "CASE / 02",
    title: "MCP Elicitation 固定 Schema Round-trip",
    request: "[占位] 用户在 OpenWork 中请求通过 Open Design 生成网站。后续替换为 Silver Wind Bakery 实际提示词。",
    context: `{
  "tool": "create_site_from_requirements",
  "elicitation": {
    "action": "accept",
    "content": {
      "siteType": "business",
      "outputMode": "single",
      "sections": ["home", "menu", "contact"]
    }
  },
  "sessionID": "<OpenWork/OpenCode session>"
}`,
    questionImage: null,
    questionImagePath: "assets/cases/elicitation/question.png",
    resultUrl: null,
    resultPath: "assets/cases/elicitation/result/index.html",
  },
  multiMcp: {
    number: "CASE / 03",
    title: "多轮 MCP 动态 Discovery Session",
    request: "[占位] 用户使用普通 MCP tools 发起模糊设计需求。后续替换为真实首轮请求。",
    context: `{
  "sessionId": "run-<discovery runId>",
  "status": "ready",
  "submissionAction": "accept_defaults",
  "additionalContext": "<表单外补充要求>",
  "generationRunId": "<new generation runId>"
}`,
    questionImage: null,
    questionImagePath: "assets/cases/multi-mcp/question.png",
    resultUrl: null,
    resultPath: "assets/cases/multi-mcp/result/index.html",
  },
};

const schemeData = {
  a2a: {
    overline: "REMOTE AGENT DELEGATION",
    title: "A2A：把 Open Design 作为远程 Agent 委托",
    description:
      "任务在 WORKING、INPUT_REQUIRED、COMPLETED 等状态间流转。Open Design 返回结构化问题，Mobilework 收集回答后，使用同一个 taskId 和 contextId 恢复任务。",
    state: "A2A Task + Artifact",
    client: "A2A 1.0 Client 与状态处理",
    resume: "taskId + contextId",
    note: "INPUT_REQUIRED 是等待用户输入的中断态，不是失败；固定轮询次数也不应被当作超时依据。",
    verification: "已实现并通过自动测试",
    consoleTitle: "A2A TASK · LIVE FLOW",
    log: 'task.status.state = "TASK_STATE_INPUT_REQUIRED" → resume same task',
    context: `{
  "jsonrpc": "2.0",
  "method": "message/send",
  "taskId": "a8b2…",
  "contextId": "ctx-01",
  "state": "INPUT_REQUIRED"
}`,
    steps: [
      ["USER", "提出需求", "Mobilework Chat", ""],
      ["RPC", "创建任务", "message/send", ""],
      ["?", "返回问题", "INPUT_REQUIRED", "input"],
      ["ANS", "继续任务", "same task/context", ""],
      ["HTML", "完成交付", "COMPLETED", "complete"],
    ],
  },
  elicitation: {
    overline: "FIXED SCHEMA · NATIVE ROUND-TRIP",
    title: "MCP Elicitation：固定 Schema 的原生表单转接",
    description:
      "OpenCode 调用 create_site_from_requirements 后，Open Design 在同一次 tool call 中发出固定网站需求表单。OpenCode 将 Schema 转成 OpenWork Question UI，答案回传后原调用继续创建项目和 run。",
    state: "同一次 MCP Tool Call",
    client: "Elicitation handler + Question UI",
    resume: "McpInvocation + sessionID",
    note: "当前是固定 SITE_REQUIREMENTS_FORM PoC，不是动态 discovery；single-file 已完成真实人工 E2E。",
    verification: "真实 OpenWork GUI E2E 已通过",
    consoleTitle: "MCP ELICITATION · SAME CALL ROUND-TRIP",
    log: 'create_site_from_requirements → elicitInput → action="accept" → startRun',
    context: `{
  "method": "elicitation/create",
  "tool": "create_site_from_requirements",
  "requestedSchema": {
    "properties": {
      "siteType": { "enum": ["personal", "business", "event", "dashboard"] },
      "outputMode": { "enum": ["single", "multi"] }
    }
  },
  "result": { "action": "accept", "outputMode": "single" }
}`,
    steps: [
      ["TOOL", "调用建站工具", "create_site_from_requirements", ""],
      ["FORM", "发起表单", "elicitation/create", ""],
      ["UI", "原生问题界面", "OpenWork Question UI", "input"],
      ["RAW", "回传稳定值", "same invocation", ""],
      ["RUN", "继续生成", "createProject + startRun", "complete"],
    ],
  },
  multiMcp: {
    overline: "DYNAMIC FORM · PERSISTED SESSION",
    title: "多轮 MCP：动态问题与持久化 Discovery Session",
    description:
      "内层 Agent 根据原始请求动态生成完整 question-form，daemon 将表单和答案保存到 SQLite。用户下一轮明确提交、接受默认或跳过后，只需 sessionId 即可从权威 brief 启动新的 generation conversation。",
    state: "SQLite Discovery Session",
    client: "普通 MCP tools，无源码改动",
    resume: "持久化 discovery sessionId",
    note: "支持 submit、accept_defaults、skip 和 additionalContext；生成阶段禁用内层 open-design MCP，并执行 deliveryValidation。",
    verification: "188 个聚焦测试通过",
    consoleTitle: "MULTI-ROUND MCP · PERSISTED SESSION FLOW",
    log: 'begin_discovery → session.status="ready" → generate_from_discovery(sessionId)',
    context: `{
  "sessionId": "run-79309e96-…",
  "status": "ready",
  "submissionAction": "accept_defaults",
  "additionalContext": "生成多文件页面",
  "generation": { "conversation": "new", "runId": "53b54a86-…" }
}`,
    steps: [
      ["DISC", "启动发现", "begin_discovery", ""],
      ["FORM", "动态生成表单", "inner Agent", ""],
      ["DB", "持久化会话", "SQLite sessionId", "input"],
      ["OK", "用户明确动作", "submit / defaults / skip", ""],
      ["RUN", "隔离生成并校验", "new conversation", "complete"],
    ],
  },
};

const outputData = {
  default: {
    overline: "NO EXTRA POLICY",
    title: "不选择模式，保留 Open Design 原有生成行为",
    description:
      "服务不会拼接网站目录约束，也不会执行该策略的自动修复、最终校验或输出策略元数据。适合无需固定部署结构的任务。",
    policy: "UNSET",
    command: "pnpm tools-dev run web --daemon-port 7456 --web-port 5175",
    route: false,
    files: [
      ["generated output", "ANY", "由当前工作流决定", "muted"],
      ["HTML / CSS / JS / assets", "…", "不追加目录强约束", "muted"],
    ],
    rules: [
      "不追加 single-html 或 multi-file 的专用提示词",
      "不执行站点产物归一化与策略校验",
      "保持当前 Open Design 工作流的原始交付方式",
    ],
  },
  single: {
    overline: "ONE FILE · MULTIPLE VIEWS",
    title: "单文件交付，也能表达多页面网站",
    description:
      "最终可见站点只有 index.html。样式、脚本和图片全部内嵌；当业务需要多个页面时，在同一文档内使用 Hash 路由切换逻辑页面。",
    policy: "ENFORCED",
    command: "pnpm tools-dev run web --site-output-mode single-html --daemon-port 7456 --web-port 5175",
    route: true,
    files: [["index.html", "HTML", "CSS + JS + data URI", "highlight"]],
    rules: [
      "最终站点只保留一个 index.html",
      "CSS 写入 <style>，JavaScript 写入 <script>",
      "图片等资源使用 data URL / Base64 内嵌",
      "多页面需求使用 #/path Hash 路由，不生成额外 HTML",
    ],
  },
  multi: {
    overline: "CANONICAL MULTI-FILE DELIVERY",
    title: "先写标准文件，有必要时再增加扩展文件",
    description:
      "产物必须包含 index.html、styles.css、script.js 和 assets/。有内容时优先使用标准文件；只有确有多页面或拆分需要时，才保留额外 HTML、CSS 或 JS。",
    policy: "ENFORCED",
    command: "pnpm tools-dev run web --site-output-mode multi-file --daemon-port 7456 --web-port 5175",
    route: false,
    files: [
      ["index.html", "HTML", "入口文件", "highlight"],
      ["styles.css", "CSS", "主样式优先写入", "highlight"],
      ["script.js", "JS", "主脚本优先写入", "highlight"],
      ["assets/", "DIR", "无图片时也保留", "folder"],
      ["about.html", "HTML", "仅在确有需要时", ""],
    ],
    rules: [
      "强制存在 index.html、styles.css、script.js 和 assets/",
      "非空内容优先归并到三个标准文件",
      "空资源目录也必须保留，便于稳定部署",
      "有实际语义的附加页面或模块不会被粗暴删除",
    ],
  },
};

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const motionReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeScheme = "a2a";
  let activeMode = "single";
  let autoTimer = null;
  let autoIndex = 0;

  const elements = {
    topbar: $("#topbar"),
    progress: $("#pageProgress"),
    schemeOverline: $("#schemeOverline"),
    schemeTitle: $("#schemeTitle"),
    schemeDescription: $("#schemeDescription"),
    schemeState: $("#schemeState"),
    schemeClient: $("#schemeClient"),
    schemeResume: $("#schemeResume"),
    schemeNote: $("#schemeNote"),
    schemeVerification: $("#schemeVerification"),
    consoleTitle: $("#consoleTitle"),
    consoleLog: $("#consoleLog"),
    contextPreview: $("#contextPreview"),
    flowCanvas: $("#flowCanvas"),
    modeOverline: $("#modeOverline"),
    modeTitle: $("#modeTitle"),
    modeDescription: $("#modeDescription"),
    modeRules: $("#modeRules"),
    modeCommand: $("#modeCommand"),
    policyState: $("#policyState"),
    fileTree: $("#fileTree"),
    routeDemo: $("#routeDemo"),
    autoDemo: $("#autoDemo"),
    toast: $("#toast"),
    dialog: $("#caseDialog"),
  };

  function renderScheme(key, focus = false) {
    const data = schemeData[key];
    if (!data) return;
    activeScheme = key;

    $$("[data-scheme]").forEach((button) => {
      const selected = button.dataset.scheme === key;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      if (focus && selected) button.focus();
    });

    elements.schemeOverline.textContent = data.overline;
    elements.schemeTitle.textContent = data.title;
    elements.schemeDescription.textContent = data.description;
    elements.schemeState.textContent = data.state;
    elements.schemeClient.textContent = data.client;
    elements.schemeResume.textContent = data.resume;
    elements.schemeNote.textContent = data.note;
    elements.schemeVerification.textContent = data.verification;
    elements.consoleTitle.textContent = data.consoleTitle;
    elements.consoleLog.textContent = data.log;
    elements.contextPreview.textContent = data.context;

    elements.flowCanvas.replaceChildren(
      ...data.steps.map(([icon, title, detail, state]) => {
        const step = document.createElement("div");
        step.className = `flow-step${state ? ` is-${state}` : ""}`;
        step.innerHTML = `<span class="flow-node-icon">${icon}</span><div><b>${title}</b><small>${detail}</small></div>`;
        return step;
      }),
    );
  }

  function renderMode(key, focus = false) {
    const data = outputData[key];
    if (!data) return;
    activeMode = key;

    $$("[data-mode]").forEach((button) => {
      const selected = button.dataset.mode === key;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      if (focus && selected) button.focus();
    });

    elements.modeOverline.textContent = data.overline;
    elements.modeTitle.textContent = data.title;
    elements.modeDescription.textContent = data.description;
    elements.policyState.textContent = data.policy;
    elements.modeCommand.textContent = data.command;
    elements.routeDemo.hidden = !data.route;

    elements.fileTree.replaceChildren(
      ...data.files.map(([name, type, detail, style], index) => {
        const line = document.createElement("div");
        line.className = `tree-line${style === "folder" ? " is-folder" : ""}${style === "highlight" ? " is-highlight" : ""}${style === "muted" ? " is-muted" : ""}`;
        line.style.animationDelay = `${index * 45}ms`;
        line.innerHTML = `<span class="file-icon">${type}</span><span>${name}</span><small>${detail}</small>`;
        return line;
      }),
    );

    elements.modeRules.replaceChildren(
      ...data.rules.map((rule, index) => {
        const item = document.createElement("li");
        item.textContent = rule;
        item.style.animationDelay = `${index * 45}ms`;
        return item;
      }),
    );
  }

  function setupTabs(selector, keys, render) {
    $$(selector).forEach((button) => {
      button.addEventListener("click", () => render(button.dataset.scheme || button.dataset.mode));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const currentKey = button.dataset.scheme || button.dataset.mode;
        const current = keys.indexOf(currentKey);
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
        render(keys[(current + direction + keys.length) % keys.length], true);
      });
    });
  }

  function setupScrollEffects() {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? window.scrollY / max : 0;
      elements.progress.style.width = `${Math.min(100, ratio * 100)}%`;
      elements.topbar.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });

    if (motionReduced || !("IntersectionObserver" in window)) {
      $$(".reveal").forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12 },
    );
    $$(".reveal").forEach((element) => revealObserver.observe(element));

    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          $$(".main-nav a").forEach((link) => {
            link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
          });
        });
      },
      { rootMargin: "-35% 0px -55%", threshold: 0 },
    );
    $$("main > section[id]").forEach((section) => navObserver.observe(section));
  }

  function setupRouteDemo() {
    const routeLabels = {
      "#/home": ["Home", "一个 HTML，多个逻辑页面"],
      "#/about": ["About", "Hash 变化，局部视图切换"],
      "#/contact": ["Contact", "刷新后仍可恢复当前视图"],
    };
    $$(".route-chip").forEach((button) => {
      button.addEventListener("click", () => {
        $$(".route-chip").forEach((item) => item.classList.toggle("is-active", item === button));
        const [title, detail] = routeLabels[button.dataset.route];
        const screen = $("#routeScreen");
        $("b", screen).textContent = title;
        $("small", screen).textContent = detail;
        screen.animate?.([{ opacity: 0.45, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, easing: "ease-out" });
      });
    });
  }

  function setupCopy() {
    $("#copyCommand").addEventListener("click", async () => {
      const command = elements.modeCommand.textContent;
      try {
        await navigator.clipboard.writeText(command);
        showToast("命令已复制");
      } catch {
        showToast("请手动复制命令");
      }
    });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
  }

  function setupAutoDemo() {
    const schemes = Object.keys(schemeData);
    const modes = Object.keys(outputData);
    elements.autoDemo.addEventListener("click", () => {
      if (autoTimer) {
        window.clearInterval(autoTimer);
        autoTimer = null;
        elements.autoDemo.classList.remove("is-playing");
        $("span:last-child", elements.autoDemo).textContent = "自动演示";
        return;
      }
      elements.autoDemo.classList.add("is-playing");
      $("span:last-child", elements.autoDemo).textContent = "停止播放";
      autoTimer = window.setInterval(() => {
        autoIndex += 1;
        renderScheme(schemes[autoIndex % schemes.length]);
        renderMode(modes[autoIndex % modes.length]);
      }, 3200);
    });
  }

  function setupFullscreen() {
    $("#presentMode").addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        showToast("浏览器未开放全屏权限");
      }
    });
  }

  function setupCases() {
    $$(".case-card").forEach((card) => {
      $(".case-button", card).addEventListener("click", () => openCase(card.dataset.case));
    });
    $("#closeDialog").addEventListener("click", () => elements.dialog.close());
    elements.dialog.addEventListener("click", (event) => {
      if (event.target === elements.dialog) elements.dialog.close();
    });
  }

  function openCase(key) {
    const data = caseData[key];
    if (!data) return;
    $("#dialogOverline").textContent = data.number;
    $("#dialogTitle").textContent = data.title;
    $("#dialogRequest").textContent = data.request;
    $("#dialogContext").textContent = data.context;
    renderCaseAsset(
      $("#dialogImageSlot"),
      data.questionImage,
      data.questionImagePath,
      "image",
    );
    renderCaseAsset(
      $("#dialogResultSlot"),
      data.resultUrl,
      data.resultPath,
      "result",
    );
    elements.dialog.showModal();
  }

  function renderCaseAsset(slot, source, placeholderPath, kind) {
    slot.replaceChildren();
    slot.classList.toggle("has-asset", Boolean(source));

    if (source && kind === "image") {
      const image = document.createElement("img");
      image.src = source;
      image.alt = "真实问题交互截图";
      slot.append(image);
      return;
    }

    if (source && kind === "result") {
      const frame = document.createElement("iframe");
      frame.src = source;
      frame.title = "真实生成结果预览";
      frame.loading = "lazy";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
      slot.append(frame);
      return;
    }

    const title = document.createElement("b");
    title.textContent = kind === "image" ? "拖入 / 替换截图" : "接入 iframe 预览";
    const path = document.createElement("small");
    path.textContent = placeholderPath;
    slot.append(title, path);
  }

  setupTabs("[data-scheme]", Object.keys(schemeData), renderScheme);
  setupTabs("[data-mode]", Object.keys(outputData), renderMode);
  setupScrollEffects();
  setupRouteDemo();
  setupCopy();
  setupAutoDemo();
  setupFullscreen();
  setupCases();
  renderScheme(activeScheme);
  renderMode(activeMode);
})();
