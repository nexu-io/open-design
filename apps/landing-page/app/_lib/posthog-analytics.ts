/*
 * PostHog product analytics for the marketing site.
 *
 * Mirrors `google-analytics.ts`: returns an inline <script> string injected
 * into <head>, with a single document-level event-delegation model. Runs
 * ALONGSIDE Google Analytics (two independent sinks — a single click can
 * produce both a GA `cta_click` and a PostHog event; that is intended).
 *
 * Coverage is MANUAL semantic events only — `autocapture` is disabled so the
 * event stream stays curated. The taxonomy lives in `buildTrackerScript`.
 *
 * Graceful skip: with no key the function returns '' and PostHog never loads,
 * exactly like GA when the measurement id is absent.
 */

// Fallback so production works even if the deploy platform forgets the env
// var. `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` override these.
const DEFAULT_KEY = 'phc_u5dHWkwdqN626opkbbjDKk7xNzxR2UsJbdQqx3DncbjU';
const DEFAULT_HOST = 'https://us.i.posthog.com';
const DEFAULT_DOWNLOAD_ATTRIBUTION_URL = 'https://download.open-design.ai/api/attribution/mint';

/**
 * The delegated tracker installed after `posthog.init`. Plain DOM, no bundler
 * runtime. Emitted verbatim inside the inline script (it is a string here so
 * the same source ships to every page). Anchors to hooks that already exist
 * in the markup; the only added attribute is `data-carousel-dir`.
 */
function buildTrackerScript(pageName: string, downloadAttributionUrl: string): string {
  return `
  (function () {
    if (typeof window.posthog === 'undefined') return;

    // Shared global so other inline scripts (e.g. the homepage reveal
    // IntersectionObserver) can emit events without re-implementing the guard.
    // Reads window.posthog on every call (no cached reference) so the snippet
    // queue still receives events fired before array.js finishes loading.
    window.__odTrack = function (name, props) {
      try { if (window.posthog) window.posthog.capture(name, props || {}); } catch (e) {}
    };

    var REPO = 'github.com/nexu-io/open-design';
    var PAGE = ${JSON.stringify(pageName)};
    var DOWNLOAD_ATTRIBUTION_URL = ${JSON.stringify(downloadAttributionUrl)};

    var localeNow = function () {
      return (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
    };

    var platformNow = function () {
      var ua = (navigator.userAgent || '').toLowerCase();
      var p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toLowerCase();
      if (/win/.test(p) || /windows/.test(ua)) return 'windows';
      if (/mac/.test(p) || (/mac os x/.test(ua) && !/iphone|ipad|ipod/.test(ua))) return 'macos';
      if (/linux/.test(p) || (/linux/.test(ua) && !/android/.test(ua))) return 'linux';
      return 'other';
    };

    var collectUtms = function () {
      var out = {};
      try {
        var params = new URLSearchParams(window.location.search || '');
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
          var value = params.get(key);
          if (value) out[key] = value;
        });
      } catch (e) {}
      return out;
    };

    window.__odPrepareDownloadLink = function (link, href) {
      if (!DOWNLOAD_ATTRIBUTION_URL || !link || link.__odAttributionInFlight) return false;
      var lower = String(href || '').toLowerCase();
      if (lower.indexOf(REPO + '/releases') === -1 && lower.indexOf('download.open-design.ai/') === -1) return false;
      link.__odAttributionInFlight = true;
      var fallback = function () {
        try { window.location.href = href; } catch (e) {}
      };
      var distinctId = '';
      try {
        distinctId = window.posthog && typeof window.posthog.get_distinct_id === 'function'
          ? String(window.posthog.get_distinct_id() || '')
          : '';
      } catch (e) {}
      fetch(DOWNLOAD_ATTRIBUTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          webDistinctId: distinctId,
          landingUrl: window.location.href,
          referrer: document.referrer || '',
          assetUrl: href,
          pageName: PAGE,
          platform: platformNow(),
          utm: collectUtms(),
        }),
      })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (body) {
          var next = body && (body.downloadUrl || body.url);
          if (typeof next === 'string' && next) {
            window.location.href = next;
            return;
          }
          fallback();
        })
        .catch(fallback);
      return true;
    };

    // A desktop-originated first-party navigation carries a short-lived,
    // single-use token. Resolve it only on our own Pages origin, then ask
    // PostHog to identify the current browser person as that installation.
    // Third-party links never receive this parameter.
    var bridgeToken = '';
    try { bridgeToken = new URLSearchParams(window.location.search || '').get('od_bridge') || ''; } catch (e) {}
    if (bridgeToken) {
      fetch('/api/attribution/bridge/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token: bridgeToken }),
      })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (body) {
          var installationId = body && body.installationId;
          if (typeof installationId === 'string' && installationId && window.posthog && typeof window.posthog.identify === 'function') {
            window.posthog.identify(installationId, {
              od_source_resolution: 'client_web_bridge',
              od_source_bound_at: new Date().toISOString(),
            });
          }
        })
        .catch(function () {});
    }

    // The section (area) an element lives in. Header chrome reports 'header';
    // otherwise the nearest [data-od-id] section id, matching the埋点文档
    // section taxonomy (hero/official-strip/labs/work/testimonial/faq/cta/footer).
    var areaOf = function (el) {
      if (el.closest && el.closest('header.nav, [data-chrome-headroom]')) return 'header';
      var sec = el.closest && el.closest('[data-od-id]');
      return sec ? (sec.getAttribute('data-od-id') || 'unknown') : 'unknown';
    };

    var textOf = function (el) {
      var t = (el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '';
      return t.trim().replace(/\\s+/g, ' ').slice(0, 80);
    };

    // Unified click event matching the埋点文档2.0 schema: a single 'ui_click'
    // event distinguished by the page_name / area / element triplet (the page
    // is now carried as a property, not baked into the event name, so every
    // landing route reports correctly instead of masquerading as the home page).
    var click = function (el, element, extra) {
      var props = { page_name: PAGE, locale: localeNow(), area: areaOf(el), element: element };
      if (extra) for (var k in extra) props[k] = extra[k];
      window.__odTrack('ui_click', props);
    };

    // Semantic page_view (in addition to PostHog's auto $pageview) so the
    // landing funnel reads consistently with the rest of 埋点文档2.0.
    window.__odTrack('page_view', { page_name: PAGE, locale: localeNow() });

    // (a) Click delegation — one event, element discriminator. First match wins.
    document.addEventListener('click', function (event) {
      var t = event.target;
      if (!t || !t.closest) return;

      // Language switch (locale option) and the dropdown trigger.
      var localeLink = t.closest('[data-locale-link]');
      if (localeLink) {
        click(localeLink, 'language_switch', { lang_to: localeLink.getAttribute('data-locale-code') || '' });
        return;
      }
      if (t.closest('[data-locale-switch] summary')) { click(t, 'language_menu'); return; }

      // Share / copy interactions (sub-page templates + plugin detail).
      var tplShare = t.closest('[data-tpl-card-share]');
      if (tplShare) {
        click(tplShare, 'template_share', { template_title: tplShare.getAttribute('data-share-title') || '' });
        return;
      }
      var shareOpen = t.closest('[data-share-open]');
      if (shareOpen) { click(shareOpen, 'share_open', { share_key: shareOpen.getAttribute('data-share-open') || '' }); return; }
      var copyEl = t.closest('[data-share-copy], [data-copy-link]');
      if (copyEl) { click(copyEl, 'share_copy'); return; }

      // Contributor wire row.
      var wire = t.closest('[data-live-wire-item]');
      if (wire) { click(wire, 'contributor', { wire_index: wire.getAttribute('data-live-wire-item') || '' }); return; }

      // Testimonial carousel arrows.
      var carousel = t.closest('.nav-btn');
      if (carousel) {
        click(carousel, 'carousel_nav', { direction: carousel.getAttribute('data-carousel-dir') || 'unknown' });
        return;
      }

      // Link-based CTAs.
      var link = t.closest('a[href]');
      if (!link) return;
      var href = link.href || '';
      var lowerHref = href.toLowerCase();
      var lowerLabel = textOf(link).toLowerCase();

      // Explicit placement (hero / cta / nav) so the multiple desktop-download
      // buttons are distinguishable in PostHog without decoding section ids;
      // falls back to the section area when the attribute is absent.
      var placementOf = function (el) { return (el.getAttribute && el.getAttribute('data-download-placement')) || areaOf(el); };
      if (lowerHref.indexOf(REPO + '/releases') !== -1 || /\\.(dmg|exe|appimage|deb|zip)(\\?|$)/.test(lowerHref)) {
        click(link, 'download_desktop', { platform: platformNow(), link_url: href, download_target: 'direct', placement: placementOf(link) });
        if (window.__odPrepareDownloadLink && window.__odPrepareDownloadLink(link, href)) {
          event.preventDefault();
        }
        return;
      }
      // Download CTAs that route to the /download/ installer-matrix page instead
      // of a direct asset (the header nav button opts out of direct-asset
      // rewriting via data-download-page; sub-page CTAs link to /download/
      // outright). Still a download intent — emit under the same element so the
      // funnel is complete, distinguished by download_target.
      if (link.getAttribute('data-download-page') !== null || /\\/download\\/?$/.test((link.pathname || '').toLowerCase())) {
        click(link, 'download_desktop', { platform: platformNow(), link_url: href, download_target: 'download_page', placement: placementOf(link) });
        return;
      }
      if (lowerHref === 'https://' + REPO || lowerHref === 'https://' + REPO + '/' || lowerLabel.indexOf('star') !== -1) {
        click(link, 'star_us_on_github', { link_url: href });
        return;
      }
      if (lowerHref.indexOf('discord.gg/') !== -1) { click(link, 'join_discord', { link_url: href }); return; }
      if (lowerHref.indexOf(REPO + '/issues') !== -1) { click(link, 'open_issue', { link_url: href }); return; }
      if (link.closest('[data-nav-primary]')) { click(link, 'nav_link', { link_text: textOf(link), link_url: href }); return; }
    });

    // (c) FAQ accordion — <details> 'toggle' does not bubble, listen in capture.
    document.addEventListener('toggle', function (event) {
      var d = event.target;
      if (!d || !d.closest || !d.closest('li.faq-item')) return;
      var summary = d.querySelector ? d.querySelector('summary') : null;
      click(d, d.open ? 'faq_open' : 'faq_close', {
        question: summary ? (summary.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80) : '',
      });
    }, true);
  })();`;
}

export function posthogHeadHtml(
  apiKey: string | undefined,
  host: string | undefined,
  pageName = 'landing_home',
): string {
  const key = apiKey || DEFAULT_KEY;
  if (!key) return '';
  const apiHost = host || DEFAULT_HOST;
  const downloadAttributionUrl =
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.PUBLIC_DOWNLOAD_ATTRIBUTION_URL)
    || DEFAULT_DOWNLOAD_ATTRIBUTION_URL;

  return `<!-- PostHog -->
<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init(${JSON.stringify(key)}, {
    api_host: ${JSON.stringify(apiHost)},
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    persistence: 'localStorage+cookie'
  });
${buildTrackerScript(pageName, downloadAttributionUrl)}
</script>`;
}

export function injectPostHog(html: string, apiKey: string | undefined, host: string | undefined): string {
  const headHtml = posthogHeadHtml(apiKey, host);
  if (!headHtml) return html;
  if (html.includes('posthog.init(')) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${headHtml}\n</head>`);
  }
  return `${headHtml}\n${html}`;
}
