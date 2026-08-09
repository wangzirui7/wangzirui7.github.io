/**
 * Simple-Caixin for Loon / iOS v3
 * Based on Simple-Caixin (MPL-2.0) by EAK8T6Z / plasma-blue.
 *
 * v3 focuses on Caixin App's asynchronous WebView rendering:
 * - initial state is written into <html> before page JavaScript runs;
 * - dynamic watermark/audio/comment/related nodes are continuously enforced;
 * - the settings panel is kept below the native iOS/iPadOS status area;
 * - entitlement, article content, subscription and paywall responses are untouched.
 */

(function () {
  'use strict';

  var STORE_PREFIX = 'simple_caixin.override.';
  var CONFIG_PATH = '/__simple_caixin_config';
  var SETTINGS = ['cleanLayout', 'hideAiVoice', 'hideComment', 'hideRelated', 'hideWatermark', 'showPanel'];
  var DEFAULTS = {
    cleanLayout: true,
    hideAiVoice: true,
    hideComment: false,
    hideRelated: false,
    hideWatermark: true,
    showPanel: true,
    blockAds: true
  };

  function parseBool(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    var normalized = String(value).trim().toLowerCase();
    if (/^(1|true|yes|on)$/.test(normalized)) return true;
    if (/^(0|false|no|off)$/.test(normalized)) return false;
    return fallback;
  }

  function getArgument(name) {
    try {
      if (typeof $argument === 'object' && $argument !== null && Object.prototype.hasOwnProperty.call($argument, name)) {
        return $argument[name];
      }
      if (typeof $argument === 'string') {
        var source = $argument;
        var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('(?:^|[,&\\s])' + escaped + '=([^,&\\s]+)', 'i').exec(source);
        if (match) return match[1];
      }
    } catch (_) {}
    return undefined;
  }

  function readOverride(name) {
    try {
      var value = $persistentStore.read(STORE_PREFIX + name);
      if (value === 'true') return true;
      if (value === 'false') return false;
    } catch (_) {}
    return undefined;
  }

  function writeOverride(name, value) {
    try { return $persistentStore.write(value ? 'true' : 'false', STORE_PREFIX + name); }
    catch (_) { return false; }
  }

  function clearOverride(name) {
    try { return $persistentStore.write('', STORE_PREFIX + name); }
    catch (_) { return false; }
  }

  function readBaseSetting(name) {
    return parseBool(getArgument(name), DEFAULTS[name]);
  }

  function readSetting(name) {
    var override = readOverride(name);
    if (override !== undefined) return override;
    return readBaseSetting(name);
  }

  function passThrough() { $done({}); }
  function responseBody(body) { $done({ body: body }); }

  function syntheticResponse(status, body, headers) {
    $done({ response: { status: status, headers: headers || { 'Cache-Control': 'no-store' }, body: body || '' } });
  }

  function handleConfigRequest(url) {
    try {
      var query = url.split('?')[1] || '';
      var values = {};
      query.split('&').forEach(function (pair) {
        if (!pair) return;
        var idx = pair.indexOf('=');
        var key = decodeURIComponent(idx >= 0 ? pair.slice(0, idx) : pair);
        var value = decodeURIComponent(idx >= 0 ? pair.slice(idx + 1) : '');
        values[key] = value;
      });
      if (parseBool(values.reset, false)) {
        SETTINGS.forEach(clearOverride);
      } else {
        SETTINGS.forEach(function (name) {
          if (Object.prototype.hasOwnProperty.call(values, name)) {
            writeOverride(name, parseBool(values[name], readSetting(name)));
          }
        });
      }
    } catch (_) {}
    syntheticResponse(204, '', { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  }

  function handleAdRequest() {
    if (!readSetting('blockAds')) return passThrough();
    syntheticResponse(204, '', { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
  }

  function cleanComments(body) {
    if (!readSetting('hideComment')) return null;
    try {
      var obj = JSON.parse(body);
      if (!obj || typeof obj !== 'object') return null;
      var changed = false;
      [obj, obj.data].forEach(function (target) {
        if (!target || typeof target !== 'object') return;
        ['new', 'hot', 'list', 'comments'].forEach(function (key) {
          if (Array.isArray(target[key])) { target[key] = []; changed = true; }
        });
        ['comment_count', 'commentCount', 'total', 'count'].forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = typeof target[key] === 'string' ? '0' : 0;
            changed = true;
          }
        });
      });
      return changed ? JSON.stringify(obj) : null;
    } catch (_) { return null; }
  }

  function cleanRelated(body) {
    if (!readSetting('hideRelated')) return null;
    try {
      var obj = JSON.parse(body);
      if (!obj || !obj.data || typeof obj.data !== 'object') return null;
      var changed = false;
      ['relatarticle', 'related_article', 'relatedArticle', 'related_audio_info'].forEach(function (key) {
        if (Array.isArray(obj.data[key])) { obj.data[key] = []; changed = true; }
      });
      return changed ? JSON.stringify(obj) : null;
    } catch (_) { return null; }
  }

  function isArticleLikeHtml(url, body) {
    if (/\/articlev5\/[^/]+\/[^/]+\.html(?:\?|$)/i.test(url)) return true;
    if (/id=["']cx-main["']/i.test(body) && /id=["']cx-cons["']/i.test(body)) return true;
    if (/id=["']Main_Content_Val["']/i.test(body)) return true;
    if (/class=["'][^"']*\bcomMain\b/i.test(body) && /class=["'][^"']*\bconlf\b/i.test(body)) return true;
    return false;
  }

  function makeState(isArticlePage) {
    return {
      cleanLayout: readSetting('cleanLayout'),
      hideAiVoice: readSetting('hideAiVoice'),
      hideComment: readSetting('hideComment'),
      hideRelated: readSetting('hideRelated'),
      hideWatermark: readSetting('hideWatermark'),
      showPanel: readSetting('showPanel') && isArticlePage
    };
  }

  function makeBaseState(isArticlePage) {
    return {
      cleanLayout: readBaseSetting('cleanLayout'),
      hideAiVoice: readBaseSetting('hideAiVoice'),
      hideComment: readBaseSetting('hideComment'),
      hideRelated: readBaseSetting('hideRelated'),
      hideWatermark: readBaseSetting('hideWatermark'),
      showPanel: readBaseSetting('showPanel') && isArticlePage
    };
  }

  function stateClasses(state) {
    var map = {
      cleanLayout: 'simple-caixin-clean-layout',
      hideAiVoice: 'simple-caixin-hide-voice',
      hideComment: 'simple-caixin-hide-comment',
      hideRelated: 'simple-caixin-hide-related',
      hideWatermark: 'simple-caixin-hide-watermark'
    };
    var out = [];
    Object.keys(map).forEach(function (key) { if (state[key]) out.push(map[key]); });
    return out;
  }

  function injectHtmlClasses(body, classes) {
    if (!classes.length) return body;
    return body.replace(/<html\b([^>]*)>/i, function (full, attrs) {
      var classMatch = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(attrs);
      if (classMatch) {
        var merged = classMatch[2].split(/\s+/).filter(Boolean);
        classes.forEach(function (name) { if (merged.indexOf(name) === -1) merged.push(name); });
        return full.replace(classMatch[0], 'class=' + classMatch[1] + merged.join(' ') + classMatch[1]);
      }
      return '<html' + attrs + ' class="' + classes.join(' ') + '">';
    });
  }

  function buildInjection(state, baseState) {
    var css = String.raw`
/* Upstream Simple-Caixin layout, now guarded by server-injected state classes. */
html.simple-caixin-clean-layout .littlenav,
html.simple-caixin-clean-layout .littlenavwarp,
html.simple-caixin-clean-layout .littlenavmore,
html.simple-caixin-clean-layout .Nav { width:100% !important; }
html.simple-caixin-clean-layout .littlenavwarp { display:flex !important; justify-content:center !important; gap:2rem !important; box-sizing:border-box !important; max-width:970px !important; }
html.simple-caixin-clean-layout .littlenavwarp > .left { display:flex !important; justify-content:center !important; flex-wrap:wrap !important; }
html.simple-caixin-clean-layout .Nav > ul { display:flex !important; flex-wrap:wrap !important; justify-content:center !important; }
html.simple-caixin-clean-layout .comMain { max-width:990px !important; width:100% !important; padding:20px !important; box-sizing:border-box !important; margin-left:auto !important; margin-right:auto !important; }
html.simple-caixin-clean-layout .conlf { width:100% !important; float:none !important; }
html.simple-caixin-clean-layout .media.pip_none { padding:20px !important; }
html.simple-caixin-clean-layout .media,
html.simple-caixin-clean-layout .media_pic { width:100% !important; max-width:480px !important; height:auto !important; position:relative !important; }
html.simple-caixin-clean-layout .media_pic { display:flex !important; flex-direction:column !important; justify-content:center !important; align-items:center !important; background-color:#f0f0f0 !important; min-height:unset !important; }
html.simple-caixin-clean-layout .media_pic dt { width:100% !important; height:auto !important; display:flex !important; justify-content:center !important; align-items:center !important; aspect-ratio:3/2 !important; }
html.simple-caixin-clean-layout .media_pic img { max-width:100% !important; max-height:100% !important; width:auto !important; height:auto !important; object-fit:contain !important; }
html.simple-caixin-clean-layout .media_pic dd { width:100% !important; text-align:center !important; margin:0 !important; }
html.simple-caixin-clean-layout .media dd { width:min(100%,480px) !important; box-sizing:border-box !important; }
@supports not (aspect-ratio: 1 / 1) {
  html.simple-caixin-clean-layout .media_pic::before { content:""; display:block; padding-top:66.6%; }
  html.simple-caixin-clean-layout .media_pic img { position:absolute; top:0; left:0; width:100%; height:100%; }
}
@media screen and (max-width:998px) {
  html.simple-caixin-clean-layout .logimage { display:none !important; }
  html.simple-caixin-clean-layout .Nav .navtabs { margin:0 !important; }
  html.simple-caixin-clean-layout .littlenavwarp > .searchbox { display:none !important; }
}
html.simple-caixin-clean-layout .sitenav,
html.simple-caixin-clean-layout .icon_key,
html.simple-caixin-clean-layout .subhead,
html.simple-caixin-clean-layout .pip,
html.simple-caixin-clean-layout .function01,
html.simple-caixin-clean-layout .morelink,
html.simple-caixin-clean-layout .greenBg,
html.simple-caixin-clean-layout .redBg,
html.simple-caixin-clean-layout .cx-wx-hb-tips,
html.simple-caixin-clean-layout .conri,
html.simple-caixin-clean-layout .f_ri,
html.simple-caixin-clean-layout .fenghui_code,
html.simple-caixin-clean-layout .hot_word_v2,
html.simple-caixin-clean-layout .bottom_tong_ad,
html.simple-caixin-clean-layout .copyright,
html.simple-caixin-clean-layout .navBottom,
html.simple-caixin-clean-layout .multimedia,
html.simple-caixin-clean-layout .share_list,
html.simple-caixin-clean-layout .renewals,
html.simple-caixin-clean-layout .wifi-tips,
html.simple-caixin-clean-layout .adsame-banner-box { display:none !important; }

/* iOS/iPadOS WebView reading layout. */
html.simple-caixin-clean-layout #cx-main,
html.simple-caixin-clean-layout .cx-app-content-main { width:100% !important; max-width:760px !important; box-sizing:border-box !important; margin-left:auto !important; margin-right:auto !important; padding-left:max(16px, env(safe-area-inset-left)) !important; padding-right:max(16px, env(safe-area-inset-right)) !important; }
html.simple-caixin-clean-layout #cx-cons,
html.simple-caixin-clean-layout .cx-cons { width:100% !important; max-width:none !important; box-sizing:border-box !important; }
html.simple-caixin-clean-layout #cx-picture,
html.simple-caixin-clean-layout #cx-picture img,
html.simple-caixin-clean-layout #cx-cons img,
html.simple-caixin-clean-layout .cx-cons img,
html.simple-caixin-clean-layout #cx-main img { max-width:100% !important; height:auto !important; box-sizing:border-box !important; }
html.simple-caixin-clean-layout #cx-cons video,
html.simple-caixin-clean-layout #cx-cons iframe,
html.simple-caixin-clean-layout .cx-cons video,
html.simple-caixin-clean-layout .cx-cons iframe { max-width:100% !important; }
html.simple-caixin-clean-layout #cx-cons pre,
html.simple-caixin-clean-layout .cx-cons pre { max-width:100% !important; overflow-x:auto !important; -webkit-overflow-scrolling:touch; }
html.simple-caixin-clean-layout #cx-cons table,
html.simple-caixin-clean-layout .cx-cons table { max-width:100% !important; }

/* CSS fallback for dynamic modules; JS below also enforces inline state. */
html.simple-caixin-hide-voice .pc-aivoice,
html.simple-caixin-hide-voice .pc-aivoice.trial,
html.simple-caixin-hide-voice #cx-audio,
html.simple-caixin-hide-voice .vioce-box-cons { display:none !important; }
html.simple-caixin-hide-comment .pc-comment,
html.simple-caixin-hide-comment .comment,
html.simple-caixin-hide-comment #cx-comment,
html.simple-caixin-hide-comment [class*="cx-comment"] { display:none !important; }
html.simple-caixin-hide-related #cx-promote,
html.simple-caixin-hide-related #cx-promotes,
html.simple-caixin-hide-related .cx-promote,
html.simple-caixin-hide-related .cx-promotes,
html.simple-caixin-hide-related .related-article,
html.simple-caixin-hide-related .relatarticle { display:none !important; }
html.simple-caixin-hide-watermark #cx-customer,
html.simple-caixin-hide-watermark #cx-customer *,
html.simple-caixin-hide-watermark .watermark,
html.simple-caixin-hide-watermark .water-mark,
html.simple-caixin-hide-watermark .cx-watermark,
html.simple-caixin-hide-watermark .cx-water-mark,
html.simple-caixin-hide-watermark .shuiyin,
html.simple-caixin-hide-watermark .cx-shuiyin,
html.simple-caixin-hide-watermark [id*="watermark"],
html.simple-caixin-hide-watermark [class*="watermark"],
html.simple-caixin-hide-watermark [id*="water-mark"],
html.simple-caixin-hide-watermark [class*="water-mark"],
html.simple-caixin-hide-watermark [id*="shuiyin"],
html.simple-caixin-hide-watermark [class*="shuiyin"] { display:none !important; visibility:hidden !important; opacity:0 !important; background:none !important; background-image:none !important; }
html.simple-caixin-hide-watermark,
html.simple-caixin-hide-watermark body,
html.simple-caixin-hide-watermark #Main_Content_Val,
html.simple-caixin-hide-watermark #cx-main,
html.simple-caixin-hide-watermark .cx-app-content-main,
html.simple-caixin-hide-watermark #cx-cons,
html.simple-caixin-hide-watermark .cx-cons { background-image:none !important; }
html.simple-caixin-hide-watermark body::before,
html.simple-caixin-hide-watermark body::after,
html.simple-caixin-hide-watermark #cx-main::before,
html.simple-caixin-hide-watermark #cx-main::after,
html.simple-caixin-hide-watermark #cx-cons::before,
html.simple-caixin-hide-watermark #cx-cons::after { background-image:none !important; content:none !important; }

/* Touch panel: keep below iOS/iPadOS status bar even when WKWebView reports zero safe-area inset. */
#simple-caixin-loon-panel { position:fixed; top:max(58px, calc(env(safe-area-inset-top) + 8px)); right:max(12px, calc(env(safe-area-inset-right) + 8px)); z-index:2147483647; font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif; color:#222; -webkit-tap-highlight-color:transparent; user-select:none; }
#simple-caixin-loon-gear { width:44px; height:44px; display:flex; align-items:center; justify-content:center; margin-left:auto; border:0; border-radius:22px; background:rgba(248,248,248,.94); color:#222; box-shadow:0 1px 7px rgba(0,0,0,.20); font-size:19px; line-height:1; cursor:pointer; opacity:.58; transition:opacity .16s ease,transform .16s ease; touch-action:manipulation; }
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-gear,#simple-caixin-loon-gear:active { opacity:1; transform:scale(.96); }
#simple-caixin-loon-menu { display:none; width:194px; margin-top:7px; padding:9px; border-radius:12px; background:rgba(250,250,250,.97); color:#222; box-shadow:0 4px 18px rgba(0,0,0,.24); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-menu { display:block; }
.simple-caixin-loon-btn { display:block; width:100%; min-height:40px; margin:4px 0; padding:8px 10px; border:0; border-radius:8px; background:#ececec; color:inherit; font-size:13px; text-align:left; cursor:pointer; touch-action:manipulation; }
#simple-caixin-loon-note { padding:4px 3px 1px; font-size:10px; line-height:1.35; color:#777; }
@media (prefers-color-scheme:dark) { #simple-caixin-loon-gear,#simple-caixin-loon-menu { background:rgba(38,38,38,.95); color:#eee; } .simple-caixin-loon-btn { background:#505050; } #simple-caixin-loon-note { color:#aaa; } }
#htmlRoot[data-theme="dark"] #simple-caixin-loon-gear,#htmlRoot[data-theme="dark"] #simple-caixin-loon-menu { background:rgba(38,38,38,.95); color:#eee; }
#htmlRoot[data-theme="dark"] .simple-caixin-loon-btn { background:#505050; }
#htmlRoot[data-theme="dark"] #simple-caixin-loon-note { color:#aaa; }
`;

    var initialJson = JSON.stringify(state).replace(/</g, '\\u003c');
    var baseJson = JSON.stringify(baseState).replace(/</g, '\\u003c');
    var runtime = String.raw`
(function(){
  'use strict';
  if (window.__SIMPLE_CAIXIN_LOON_V3__) return;
  window.__SIMPLE_CAIXIN_LOON_V3__ = true;

  var CONFIG_PATH = ${JSON.stringify(CONFIG_PATH)};
  var state = Object.assign({}, ${initialJson});
  var baseState = Object.assign({}, ${baseJson});
  var classMap = { cleanLayout:'simple-caixin-clean-layout', hideAiVoice:'simple-caixin-hide-voice', hideComment:'simple-caixin-hide-comment', hideRelated:'simple-caixin-hide-related', hideWatermark:'simple-caixin-hide-watermark' };
  var records = { watermark:[], voice:[], comment:[], related:[], background:[] };
  var scheduled = false;
  var panel = null;

  function saveStyle(el, bucket, properties) {
    if (!el || !el.style) return;
    var list = records[bucket];
    for (var i=0;i<list.length;i+=1) if (list[i].el === el) return;
    var old = {};
    properties.forEach(function(prop){ old[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]; });
    list.push({el:el, old:old});
  }

  function setImportant(el, prop, value) {
    if (!el || !el.style) return;
    if (el.style.getPropertyValue(prop) === value && el.style.getPropertyPriority(prop) === 'important') return;
    el.style.setProperty(prop, value, 'important');
  }

  function forceHidden(el, bucket) {
    if (!el || !el.style) return;
    saveStyle(el, bucket, ['display','visibility','opacity','pointer-events']);
    setImportant(el,'display','none'); setImportant(el,'visibility','hidden'); setImportant(el,'opacity','0'); setImportant(el,'pointer-events','none');
  }

  function clearBg(el) {
    if (!el || !el.style) return;
    saveStyle(el, 'background', ['background','background-image']);
    setImportant(el,'background-image','none');
    if (/url\(|linear-gradient|radial-gradient/i.test(String(getComputedStyle(el).backgroundImage || ''))) setImportant(el,'background','none');
  }

  function restoreBucket(bucket) {
    var list = records[bucket];
    while (list.length) {
      var rec = list.pop();
      if (!rec.el || !rec.el.style) continue;
      Object.keys(rec.old).forEach(function(prop){
        var old = rec.old[prop];
        if (old[0]) rec.el.style.setProperty(prop, old[0], old[1] || '');
        else rec.el.style.removeProperty(prop);
      });
    }
  }

  function queryAll(selector) {
    try { return document.querySelectorAll(selector); } catch (_) { return []; }
  }

  function hideSelector(selector, bucket) {
    var nodes = queryAll(selector);
    for (var i=0;i<nodes.length;i+=1) forceHidden(nodes[i], bucket);
  }

  function looksLikeCopyrightWatermark(el) {
    if (!el || !el.textContent) return false;
    var text = String(el.textContent).replace(/\s+/g,'').trim();
    if (!text || text.length > 100) return false;
    return /财新网友.{0,30}(版权所有|翻版必究)/.test(text) || /(版权所有.{0,20}翻版必究)/.test(text);
  }

  function applyRootClasses() {
    var root = document.documentElement;
    if (!root) return;
    Object.keys(classMap).forEach(function(name){ root.classList.toggle(classMap[name], !!state[name]); });
  }

  function enforceWatermark() {
    if (!state.hideWatermark) { restoreBucket('watermark'); restoreBucket('background'); return; }
    hideSelector('body #cx-customer,body #cx-customer *,body [id*="watermark"],body [class*="watermark"],body [id*="water-mark"],body [class*="water-mark"],body [id*="shuiyin"],body [class*="shuiyin"],body .watermark,body .water-mark,body .cx-watermark,body .cx-water-mark,body .shuiyin,body .cx-shuiyin', 'watermark');
    var bases = queryAll('html,body,#Main_Content_Val,#cx-main,.cx-app-content-main,#cx-cons,.cx-cons');
    for (var i=0;i<bases.length;i+=1) clearBg(bases[i]);
    var candidates = queryAll('body div,body span,body canvas,body svg');
    for (var j=0;j<candidates.length;j+=1) {
      var el = candidates[j];
      if (looksLikeCopyrightWatermark(el)) forceHidden(el, 'watermark');
      if ((el.tagName === 'CANVAS' || el.tagName === 'svg') && el.closest && el.closest('#cx-customer,[class*="watermark"],[id*="watermark"]')) forceHidden(el, 'watermark');
    }
  }

  function enforceFeature(name, enabled, selector, bucket) {
    if (enabled) hideSelector(selector, bucket); else restoreBucket(bucket);
  }

  function label(name, enabled) {
    var labels = { cleanLayout:['极简排版：关闭','极简排版：开启'], hideAiVoice:['语音：显示','语音：隐藏'], hideComment:['评论：显示','评论：隐藏'], hideRelated:['相关推荐：显示','相关推荐：隐藏'], hideWatermark:['水印：显示','水印：隐藏'] };
    return labels[name][enabled ? 1 : 0];
  }

  function applyButtonLabels() {
    Object.keys(classMap).forEach(function(name){ var b=document.querySelector('[data-sc-setting="'+name+'"]'); if(b) b.textContent=label(name,!!state[name]); });
  }

  function enforceDom() {
    scheduled = false;
    applyRootClasses();
    enforceWatermark();
    enforceFeature('hideAiVoice', state.hideAiVoice, '#cx-audio,.pc-aivoice,.pc-aivoice.trial,.vioce-box-cons', 'voice');
    enforceFeature('hideComment', state.hideComment, '#cx-comment,.pc-comment,.comment,[class*="cx-comment"]', 'comment');
    enforceFeature('hideRelated', state.hideRelated, '#cx-promote,#cx-promotes,.cx-promote,.cx-promotes,.related-article,.relatarticle', 'related');
    ensurePanel();
    applyButtonLabels();
  }

  function scheduleEnforce() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(enforceDom, 30);
  }

  function send(values) {
    var query = Object.keys(values).map(function(key){ return encodeURIComponent(key)+'='+encodeURIComponent(values[key]); }).join('&');
    try { fetch(CONFIG_PATH+'?'+query+'&_='+Date.now(), {method:'GET',cache:'no-store',credentials:'same-origin'}).catch(function(){}); } catch (_) {}
  }

  function saveState() {
    var values = {};
    Object.keys(classMap).forEach(function(name){ values[name]=state[name]?'1':'0'; });
    send(values);
  }

  function makeButton(name) {
    var b=document.createElement('button'); b.type='button'; b.className='simple-caixin-loon-btn'; b.setAttribute('data-sc-setting',name);
    b.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); state[name]=!state[name]; enforceDom(); saveState(); });
    return b;
  }

  function ensurePanel() {
    if (!state.showPanel || !document.body) return;
    panel = document.getElementById('simple-caixin-loon-panel');
    if (panel) return;
    panel=document.createElement('div'); panel.id='simple-caixin-loon-panel';
    var gear=document.createElement('button'); gear.id='simple-caixin-loon-gear'; gear.type='button'; gear.textContent='⚙️'; gear.setAttribute('aria-label','极简财新设置');
    var menu=document.createElement('div'); menu.id='simple-caixin-loon-menu';
    ['cleanLayout','hideAiVoice','hideComment','hideRelated','hideWatermark'].forEach(function(name){ menu.appendChild(makeButton(name)); });
    var reset=document.createElement('button'); reset.type='button'; reset.className='simple-caixin-loon-btn'; reset.textContent='恢复插件默认';
    reset.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); state=Object.assign({},baseState); enforceDom(); send({reset:'1'}); });
    menu.appendChild(reset);
    var note=document.createElement('div'); note.id='simple-caixin-loon-note'; note.textContent='动态水印/语音/网页元素即时处理；App 原生评论和推荐在下次接口加载时生效。'; menu.appendChild(note);
    panel.appendChild(gear); panel.appendChild(menu); document.body.appendChild(panel);
    gear.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); panel.classList.toggle('sc-open'); });
    panel.addEventListener('click',function(ev){ ev.stopPropagation(); });
    document.addEventListener('click',function(){ if(panel) panel.classList.remove('sc-open'); });
  }

  applyRootClasses();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enforceDom, {once:true}); else enforceDom();

  if (window.MutationObserver && document.documentElement) {
    var observer=new MutationObserver(scheduleEnforce);
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  }
  var ticks=0;
  var warmup=setInterval(function(){ enforceDom(); ticks+=1; if(ticks>=12) clearInterval(warmup); },500);
})();
`;

    return '<!-- simple-caixin-loon-v3 -->\n<style id="simple-caixin-loon-v3-style">' + css + '</style>\n<script id="simple-caixin-loon-v3-runtime">' + runtime.replace(/<\/script/gi, '<\\/script') + '</script>';
  }

  function injectHtml(url, body) {
    if (!body || typeof body !== 'string') return null;
    if (body.indexOf('simple-caixin-loon-v3') !== -1) return null;
    if (!/<html[\s>]|<head[\s>]|<body[\s>]/i.test(body)) return null;

    var article = isArticleLikeHtml(url, body);
    var state = makeState(article);
    var baseState = makeBaseState(article);
    var prepared = injectHtmlClasses(body, stateClasses(state));
    var payload = buildInjection(state, baseState);

    if (/<\/head>/i.test(prepared)) return prepared.replace(/<\/head>/i, payload + '\n</head>');
    if (/<body[\s>]/i.test(prepared)) return prepared.replace(/<body([^>]*)>/i, '<body$1>\n' + payload);
    return payload + prepared;
  }

  var url = (typeof $request !== 'undefined' && $request.url) ? $request.url : '';

  if (typeof $response === 'undefined') {
    if (url.indexOf(CONFIG_PATH) !== -1) return handleConfigRequest(url);
    if (/^https?:\/\/(?:gg|dolphin)\.caixin\.com\/s(?:\?|$)/i.test(url)) return handleAdRequest();
    return passThrough();
  }

  var body = (typeof $response.body === 'string') ? $response.body : '';
  if (!body) return passThrough();

  if (/\/ios\/article\/getArticleComments(?:\?|$)/i.test(url)) {
    var comments = cleanComments(body);
    return comments === null ? passThrough() : responseBody(comments);
  }

  if (/\/articlev5\/[^/]+\/[^/]+\.json(?:\?|$)/i.test(url)) {
    var related = cleanRelated(body);
    return related === null ? passThrough() : responseBody(related);
  }

  /* Never modify entitlement/paywall validation. */
  if (/\/api\/app-api\/auth\/newValidate(?:\?|$)/i.test(url)) return passThrough();

  if (/\.html?(?:\?|$)|\.shtml(?:\?|$)/i.test(url) || /<html[\s>]/i.test(body)) {
    var html = injectHtml(url, body);
    return html === null ? passThrough() : responseBody(html);
  }

  return passThrough();
})();
