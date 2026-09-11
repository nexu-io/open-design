/* OD-PROTO-RUNTIME v1 — thin prototype layer over the Vue 3 global build.
   Load order in the document: vue.global.prod.js → od-proto.js → your fixtures → your app script.
   Structure and behaviour only: hash router with screen transitions, overlay
   manager (sheet / modal / drawer), reactive store with named scenarios,
   toasts, async status with a fake request, list transitions. It sets no
   palette, typography, spacing, or component look — the product's CSS owns all
   of that. Everything is exposed as `window.odProto`. */
(function (global) {
  'use strict';

  var Vue = global.Vue;
  if (!Vue) {
    console.error('[od-proto] vue.global.prod.js must load before od-proto.js');
    return;
  }

  var reactive = Vue.reactive;
  var computed = Vue.computed;
  var watch = Vue.watch;
  var nextTick = Vue.nextTick;
  var h = Vue.h;
  var Transition = Vue.Transition;
  var TransitionGroup = Vue.TransitionGroup;
  var Teleport = Vue.Teleport;
  var resolveComponent = Vue.resolveComponent;

  var EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var ENTER = '200ms';
  var LEAVE = '140ms';

  var CSS = [
    '/* OD-PROTO-RUNTIME v1 — motion and overlay structure only */',
    '.od-router{position:relative;min-height:100%}',
    '.od-router>.od-screen{min-height:100%}',
    '.od-push-enter-active,.od-pop-enter-active,.od-fade-enter-active{transition:opacity ' + ENTER + ' ' + EASE + ',transform ' + ENTER + ' ' + EASE + '}',
    '.od-push-leave-active,.od-pop-leave-active,.od-fade-leave-active{transition:opacity ' + LEAVE + ' ' + EASE + ',transform ' + LEAVE + ' ' + EASE + '}',
    '.od-push-enter-from{opacity:0;transform:translateX(24px)}',
    '.od-push-leave-to{opacity:0;transform:translateX(-16px)}',
    '.od-pop-enter-from{opacity:0;transform:translateX(-24px)}',
    '.od-pop-leave-to{opacity:0;transform:translateX(16px)}',
    '.od-fade-enter-from,.od-fade-leave-to{opacity:0}',
    '.od-overlay{position:fixed;inset:0;z-index:60;display:grid}',
    '.od-overlay-in-root{position:absolute}',
    '.od-overlay-sheet{align-items:end}',
    '.od-overlay-modal{place-items:center;padding:24px}',
    '.od-overlay-drawer{justify-items:end}',
    '.od-scrim{position:absolute;inset:0;background:rgba(16,18,22,.42)}',
    '.od-panel{position:relative;max-height:100%;overflow:auto;outline:none}',
    '.od-overlay-sheet .od-panel{width:100%}',
    '.od-overlay-drawer .od-panel{height:100%}',
    '.od-sheet-enter-active .od-scrim,.od-modal-enter-active .od-scrim,.od-drawer-enter-active .od-scrim{transition:opacity ' + ENTER + ' ' + EASE + '}',
    '.od-sheet-leave-active .od-scrim,.od-modal-leave-active .od-scrim,.od-drawer-leave-active .od-scrim{transition:opacity ' + LEAVE + ' ' + EASE + '}',
    '.od-sheet-enter-active .od-panel,.od-modal-enter-active .od-panel,.od-drawer-enter-active .od-panel{transition:opacity ' + ENTER + ' ' + EASE + ',transform ' + ENTER + ' ' + EASE + '}',
    '.od-sheet-leave-active .od-panel,.od-modal-leave-active .od-panel,.od-drawer-leave-active .od-panel{transition:opacity ' + LEAVE + ' ' + EASE + ',transform ' + LEAVE + ' ' + EASE + '}',
    '.od-sheet-enter-from .od-scrim,.od-sheet-leave-to .od-scrim,.od-modal-enter-from .od-scrim,.od-modal-leave-to .od-scrim,.od-drawer-enter-from .od-scrim,.od-drawer-leave-to .od-scrim{opacity:0}',
    '.od-sheet-enter-from .od-panel,.od-sheet-leave-to .od-panel{transform:translateY(100%)}',
    '.od-modal-enter-from .od-panel,.od-modal-leave-to .od-panel{opacity:0;transform:scale(.96)}',
    '.od-drawer-enter-from .od-panel,.od-drawer-leave-to .od-panel{transform:translateX(100%)}',
    '.od-toasts{position:fixed;left:0;right:0;bottom:24px;z-index:70;display:grid;justify-items:center;gap:8px;pointer-events:none}',
    '.od-toasts-in-root{position:absolute}',
    '.od-toasts>*{pointer-events:auto}',
    '.od-toast-enter-active{transition:opacity ' + ENTER + ' ' + EASE + ',transform ' + ENTER + ' ' + EASE + '}',
    '.od-toast-leave-active{transition:opacity ' + LEAVE + ' ' + EASE + ',transform ' + LEAVE + ' ' + EASE + '}',
    '.od-toast-enter-from,.od-toast-leave-to{opacity:0;transform:translateY(8px)}',
    '.od-list-enter-active{transition:opacity ' + ENTER + ' ' + EASE + ',transform ' + ENTER + ' ' + EASE + '}',
    '.od-list-leave-active{transition:opacity ' + LEAVE + ' ' + EASE + ',transform ' + LEAVE + ' ' + EASE + ';position:absolute;width:100%}',
    '.od-list-move{transition:transform ' + ENTER + ' ' + EASE + '}',
    '.od-list-enter-from{opacity:0;transform:translateY(6px)}',
    '.od-list-leave-to{opacity:0}',
    '.od-locked{overflow:hidden!important}',
    '.od-tools{position:fixed;right:12px;bottom:12px;z-index:90;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:#17181b;color:#f2f3f5;border-radius:8px;padding:10px 12px;display:grid;gap:6px;box-shadow:0 8px 24px rgba(0,0,0,.24)}',
    '.od-tools button{font:inherit;background:#2a2c31;color:inherit;border:1px solid #3a3d44;border-radius:6px;padding:4px 8px;cursor:pointer}',
    '.od-tools button[aria-pressed="true"]{background:#f2f3f5;color:#17181b}',
    '.od-tools-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
    '@media (prefers-reduced-motion:reduce){[class*="od-"][class*="-enter-active"],[class*="od-"][class*="-leave-active"],.od-list-move,.od-sheet-enter-active .od-panel,.od-sheet-leave-active .od-panel,.od-modal-enter-active .od-panel,.od-modal-leave-active .od-panel,.od-drawer-enter-active .od-panel,.od-drawer-leave-active .od-panel{transition-duration:1ms!important}}',
    '/* /OD-PROTO-RUNTIME v1 */'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('od-proto-style')) return;
    var style = document.createElement('style');
    style.id = 'od-proto-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof global.structuredClone === 'function') return global.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function parseHash(hash) {
    var raw = (hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    var parts = raw.split('?');
    var name = decodeURIComponent(parts[0]);
    var params = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        params[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1]) : '';
      });
    }
    return { name: name, params: params };
  }

  function buildHash(name, params) {
    var query = Object.keys(params || {}).filter(function (key) {
      return params[key] !== undefined && params[key] !== null;
    }).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]));
    }).join('&');
    return '#/' + encodeURIComponent(name) + (query ? '?' + query : '');
  }

  function sameRoute(a, b) {
    return !!a && !!b && a.name === b.name && JSON.stringify(a.params || {}) === JSON.stringify(b.params || {});
  }

  function overlayRoot() {
    return document.querySelector('[data-od-overlay-root]')
      || document.querySelector('[data-phone-screen]')
      || document.body;
  }

  function scrollHost() {
    return document.querySelector('[data-phone-content]')
      || document.querySelector('.od-scroll')
      || document.scrollingElement
      || document.documentElement;
  }

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function boot(options) {
    var opts = Object.assign({
      el: '#app',
      start: null,
      fixtures: null,
      actions: {},
      components: {},
      data: null,
      methods: {},
      computed: {},
      transition: 'od-push',
      backTransition: 'od-pop',
      tools: null
    }, options || {});

    injectCss();

    var fixtures = opts.fixtures || global.odFixtures || { scenarios: { default: { data: {} } } };
    var scenarios = fixtures.scenarios || { default: { data: {} } };
    var scenarioNames = Object.keys(scenarios);
    var query = new URLSearchParams(global.location.search);
    var requestedScenario = query.get('scenario');
    var initialScenario = (requestedScenario && scenarios[requestedScenario]) ? requestedScenario
      : (fixtures.default && scenarios[fixtures.default]) ? fixtures.default
      : (scenarioNames[0] || 'default');

    function scenarioData(name) {
      var scenario = scenarios[name] || {};
      return clone(Object.prototype.hasOwnProperty.call(scenario, 'data') ? scenario.data : scenario) || {};
    }

    var store = reactive({
      scenario: initialScenario,
      scenarios: scenarioNames,
      data: scenarioData(initialScenario),
      route: { name: '', params: {} },
      history: [],
      direction: 'forward',
      overlays: [],
      toasts: [],
      status: {},
      errors: {}
    });

    var scrollPositions = [];
    var toastSeq = 0;
    var lastFocused = null;

    function currentScenario() {
      return scenarios[store.scenario] || {};
    }

    function rememberScroll() {
      var host = scrollHost();
      scrollPositions[store.history.length] = host ? host.scrollTop : 0;
    }

    function restoreScroll(index) {
      var top = scrollPositions[index] || 0;
      nextTick(function () {
        var host = scrollHost();
        if (host) host.scrollTop = top;
      });
    }

    function applyRoute(route, direction) {
      store.direction = direction;
      store.route = { name: route.name, params: Object.assign({}, route.params || {}) };
      var hash = buildHash(route.name, route.params);
      if (global.location.hash !== hash) {
        try {
          global.history.replaceState(null, '', hash);
        } catch (error) {
          global.location.hash = hash;
        }
      }
    }

    var api = {
      store: store,
      go: function (name, params, navOptions) {
        var target = { name: name, params: params || {} };
        if (sameRoute(target, store.route)) return;
        var replace = !!(navOptions && navOptions.replace);
        store.overlays.splice(0, store.overlays.length);
        if (store.route.name && !replace) {
          rememberScroll();
          store.history.push({ name: store.route.name, params: Object.assign({}, store.route.params) });
        }
        applyRoute(target, 'forward');
        nextTick(function () {
          var host = scrollHost();
          if (host) host.scrollTop = 0;
        });
      },
      back: function (fallback) {
        store.overlays.splice(0, store.overlays.length);
        var previous = store.history.pop();
        if (!previous) {
          if (fallback) api.go(fallback, {}, { replace: true });
          return;
        }
        applyRoute(previous, 'back');
        restoreScroll(store.history.length);
      },
      open: function (name, payload) {
        if (store.overlays.some(function (entry) { return entry.name === name; })) return;
        lastFocused = document.activeElement;
        store.overlays.push({ name: name, payload: payload === undefined ? null : payload });
      },
      close: function (name) {
        if (store.overlays.length === 0) return;
        if (name === undefined) {
          store.overlays.pop();
        } else {
          var index = store.overlays.map(function (entry) { return entry.name; }).lastIndexOf(name);
          if (index >= 0) store.overlays.splice(index, 1);
        }
        if (store.overlays.length === 0 && lastFocused && typeof lastFocused.focus === 'function') {
          var target = lastFocused;
          lastFocused = null;
          nextTick(function () { try { target.focus(); } catch (error) { /* focus target gone */ } });
        }
      },
      isOpen: function (name) {
        return store.overlays.some(function (entry) { return entry.name === name; });
      },
      payload: function (name) {
        var entry = store.overlays.filter(function (item) { return item.name === name; }).pop();
        return entry ? entry.payload : null;
      },
      toast: function (text, toastOptions) {
        var settings = Object.assign({ kind: 'info', duration: 2400 }, toastOptions || {});
        var id = ++toastSeq;
        store.toasts.push({ id: id, text: text, kind: settings.kind });
        if (settings.duration > 0) {
          global.setTimeout(function () { api.dismissToast(id); }, settings.duration);
        }
        return id;
      },
      dismissToast: function (id) {
        var index = store.toasts.findIndex(function (toast) { return toast.id === id; });
        if (index >= 0) store.toasts.splice(index, 1);
      },
      act: function (name) {
        var action = opts.actions[name];
        if (typeof action !== 'function') {
          console.warn('[od-proto] unknown action: ' + name);
          return undefined;
        }
        var args = Array.prototype.slice.call(arguments, 1);
        return action.apply(null, [store.data].concat(args));
      },
      fake: function (fakeOptions) {
        var scenario = currentScenario();
        var settings = Object.assign({
          delay: typeof scenario.latency === 'number' ? scenario.latency : 600,
          fail: scenario.failRequests === true,
          result: null,
          error: 'Something went wrong. Please try again.'
        }, fakeOptions || {});
        return new Promise(function (resolve, reject) {
          global.setTimeout(function () {
            var shouldFail = typeof settings.fail === 'number' ? Math.random() < settings.fail : !!settings.fail;
            if (shouldFail) reject(new Error(settings.error));
            else resolve(settings.result);
          }, settings.delay);
        });
      },
      run: function (key, task) {
        store.status[key] = 'loading';
        delete store.errors[key];
        var promise;
        try {
          promise = Promise.resolve(typeof task === 'function' ? task() : task);
        } catch (error) {
          promise = Promise.reject(error);
        }
        return promise.then(function (result) {
          store.status[key] = 'success';
          return result;
        }, function (error) {
          store.status[key] = 'error';
          store.errors[key] = error && error.message ? error.message : String(error);
          throw error;
        });
      },
      status: function (key) {
        return store.status[key] || 'idle';
      },
      error: function (key) {
        return store.errors[key] || null;
      },
      scenario: function (name) {
        if (!scenarios[name]) {
          console.warn('[od-proto] unknown scenario: ' + name);
          return;
        }
        store.scenario = name;
        store.data = scenarioData(name);
        store.overlays.splice(0, store.overlays.length);
        store.toasts.splice(0, store.toasts.length);
        Object.keys(store.status).forEach(function (key) { delete store.status[key]; });
        Object.keys(store.errors).forEach(function (key) { delete store.errors[key]; });
      },
      reset: function () {
        api.scenario(store.scenario);
        store.history.splice(0, store.history.length);
        scrollPositions = [];
        if (opts.start) applyRoute({ name: opts.start, params: {} }, 'forward');
      },
      tools: function (visible) {
        toolsVisible.value = visible === undefined ? !toolsVisible.value : !!visible;
      }
    };

    var toolsVisible = Vue.ref(opts.tools === true || query.has('proto-tools'));

    // Root state shared by the root component and every screen: `store` plus
    // whatever `data` the app declares. `computed` and `methods` are mixed into
    // each screen as well, so a screen template reads `store`, a computed
    // value, or a method exactly as the root template does. Local `data` is
    // per screen instance; shared state belongs in the store.
    function rootData() {
      var extra = typeof opts.data === 'function' ? opts.data(store) : (opts.data || {});
      return Object.assign({ store: store }, clone(extra) || {});
    }

    // Screens declared as <template data-screen="name"> anywhere in the document.
    var screenNames = [];
    Array.prototype.slice.call(document.querySelectorAll('template[data-screen]')).forEach(function (template) {
      var name = template.getAttribute('data-screen');
      if (!name) return;
      screenNames.push(name);
      opts.components['screen-' + name] = {
        name: 'screen-' + name,
        template: template.innerHTML,
        data: rootData,
        computed: opts.computed,
        methods: opts.methods
      };
      template.parentNode.removeChild(template);
    });

    var initial = parseHash(global.location.hash);
    var startName = (initial && (screenNames.indexOf(initial.name) >= 0 || screenNames.length === 0)) ? initial.name
      : (opts.start || screenNames[0] || '');
    var startParams = (initial && initial.name === startName) ? initial.params : {};

    global.addEventListener('hashchange', function () {
      var parsed = parseHash(global.location.hash);
      if (!parsed || sameRoute(parsed, store.route)) return;
      var backIndex = -1;
      for (var index = store.history.length - 1; index >= 0; index -= 1) {
        if (sameRoute(store.history[index], parsed)) { backIndex = index; break; }
      }
      if (backIndex >= 0) {
        store.history.splice(backIndex + 1);
        store.history.pop();
        store.overlays.splice(0, store.overlays.length);
        applyRoute(parsed, 'back');
        restoreScroll(store.history.length);
      } else {
        api.go(parsed.name, parsed.params);
      }
    });

    global.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && store.overlays.length > 0) {
        event.preventDefault();
        api.close();
      }
      if (event.key === 'P' && event.altKey && event.shiftKey) {
        event.preventDefault();
        api.tools();
      }
    });

    watch(function () { return store.overlays.length; }, function (count) {
      var root = overlayRoot();
      var lockTargets = [document.documentElement, document.body, scrollHost()];
      if (root && root !== document.body) lockTargets.push(root);
      lockTargets.forEach(function (target) {
        if (!target || !target.classList) return;
        if (count > 0) target.classList.add('od-locked');
        else target.classList.remove('od-locked');
      });
    });

    var app = Vue.createApp({
      data: rootData,
      computed: opts.computed,
      methods: opts.methods
    });

    var globals = app.config.globalProperties;
    globals.$store = store;
    globals.$route = store.route;
    globals.$go = api.go;
    globals.$back = api.back;
    globals.$open = api.open;
    globals.$close = api.close;
    globals.$isOpen = api.isOpen;
    globals.$payload = api.payload;
    globals.$toast = api.toast;
    globals.$act = api.act;
    globals.$fake = api.fake;
    globals.$run = api.run;
    globals.$status = api.status;
    globals.$error = api.error;
    globals.$scenario = api.scenario;

    Object.keys(opts.components).forEach(function (name) {
      app.component(name, opts.components[name]);
    });

    app.component('od-router', {
      setup: function () {
        return function () {
          var name = store.route.name;
          if (!name) return h('div', { class: 'od-router' });
          var componentName = 'screen-' + name;
          var component = resolveComponent(componentName);
          var child = typeof component === 'string'
            ? h('div', { class: 'od-screen', key: name }, 'Missing screen: ' + name)
            : h(component, { key: name + ':' + JSON.stringify(store.route.params), class: 'od-screen', params: undefined });
          return h('div', { class: 'od-router' }, [
            h(Transition, {
              name: store.direction === 'back' ? opts.backTransition : opts.transition,
              mode: 'out-in'
            }, function () { return child; })
          ]);
        };
      }
    });

    app.component('od-overlay', {
      props: {
        name: { type: String, required: true },
        kind: { type: String, default: 'modal' },
        label: { type: String, default: '' },
        dismissible: { type: Boolean, default: true }
      },
      setup: function (props, context) {
        var open = computed(function () { return api.isOpen(props.name); });
        var payload = computed(function () { return api.payload(props.name); });
        var panel = Vue.ref(null);
        watch(open, function (isOpen) {
          if (!isOpen) return;
          nextTick(function () {
            var element = panel.value;
            if (!element) return;
            var first = element.querySelector('[autofocus]') || element.querySelector(FOCUSABLE) || element;
            try { first.focus({ preventScroll: true }); } catch (error) { /* non-focusable */ }
          });
        });
        return function () {
          var root = overlayRoot();
          var inRoot = root && root !== document.body;
          return h(Teleport, { to: root }, [
            h(Transition, { name: 'od-' + props.kind }, function () {
              if (!open.value) return null;
              return h('div', {
                class: ['od-overlay', 'od-overlay-' + props.kind, inRoot ? 'od-overlay-in-root' : ''],
                'data-od-overlay': props.name
              }, [
                h('div', {
                  class: 'od-scrim',
                  onClick: function () { if (props.dismissible) api.close(props.name); }
                }),
                h('div', {
                  class: 'od-panel',
                  role: 'dialog',
                  'aria-modal': 'true',
                  'aria-label': props.label || props.name,
                  tabindex: '-1',
                  ref: panel
                }, context.slots.default ? context.slots.default({
                  payload: payload.value,
                  close: function () { api.close(props.name); }
                }) : [])
              ]);
            })
          ]);
        };
      }
    });

    app.component('od-toasts', {
      setup: function () {
        return function () {
          var root = overlayRoot();
          var inRoot = root && root !== document.body;
          return h(Teleport, { to: root }, [
            h(TransitionGroup, {
              name: 'od-toast',
              tag: 'div',
              class: ['od-toasts', inRoot ? 'od-toasts-in-root' : ''],
              role: 'status',
              'aria-live': 'polite'
            }, function () {
              return store.toasts.map(function (toast) {
                return h('div', {
                  key: toast.id,
                  class: ['od-toast', 'od-toast-' + toast.kind],
                  onClick: function () { api.dismissToast(toast.id); }
                }, toast.text);
              });
            })
          ]);
        };
      }
    });

    app.component('od-tools', {
      setup: function () {
        return function () {
          if (!toolsVisible.value) return null;
          return h(Teleport, { to: document.body }, [
            h('div', { class: 'od-tools', 'data-od-tools': '' }, [
              h('div', { class: 'od-tools-row' }, [
                h('span', null, 'scenario'),
                store.scenarios.map(function (name) {
                  return h('button', {
                    key: name,
                    type: 'button',
                    'aria-pressed': store.scenario === name ? 'true' : 'false',
                    onClick: function () { api.scenario(name); }
                  }, (scenarios[name] && scenarios[name].label) || name);
                })
              ]),
              h('div', { class: 'od-tools-row' }, [
                h('span', null, 'route ' + (store.route.name || '-')),
                h('button', { type: 'button', onClick: function () { api.reset(); } }, 'reset'),
                h('button', { type: 'button', onClick: function () { api.tools(false); } }, 'hide')
              ])
            ])
          ]);
        };
      }
    });

    if (startName) applyRoute({ name: startName, params: startParams }, 'forward');

    var mounted = null;
    function mount() {
      if (mounted) return mounted;
      var target = typeof opts.el === 'string' ? document.querySelector(opts.el) : opts.el;
      if (!target) {
        console.error('[od-proto] mount target not found: ' + opts.el);
        return null;
      }
      if (!document.querySelector('[data-od-tools]') && !target.querySelector('od-tools')) {
        var toolsHost = document.createElement('div');
        toolsHost.setAttribute('data-od-tools-host', '');
        document.body.appendChild(toolsHost);
        Vue.createApp({ render: function () { return h(resolveComponent('od-tools')); } })
          .component('od-tools', app.component('od-tools'))
          .mount(toolsHost);
      }
      mounted = app.mount(target);
      return mounted;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { mount(); });
    } else {
      mount();
    }

    api.app = app;
    api.mount = mount;
    global.odProto = Object.assign(global.odProto || {}, api);
    return api;
  }

  global.odProto = Object.assign(global.odProto || {}, { boot: boot, version: 'OD-PROTO-RUNTIME v1' });
})(typeof window !== 'undefined' ? window : this);
