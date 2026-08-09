/**
 * Simple-Caixin for Loon / iOS v2
 * Based on Simple-Caixin (MPL-2.0) by EAK8T6Z / plasma-blue.
 *
 * Goals:
 * - preserve the upstream reading-cleanup behavior on Caixin article pages;
 * - make settings usable on touch devices and persist them in Loon;
 * - adapt the Caixin iOS WebView without altering article entitlement/paywall data;
 * - keep reversible UI toggles reversible (audio metadata is never destroyed).
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

  function responseBody(body) {
    $done({ body: body });
  }

  function passThrough() {
    $done({});
  }

  function syntheticResponse(status, body, headers) {
    $done({
      response: {
        status: status,
        headers: headers || { 'Cache-Control': 'no-store' },
        body: body || ''
      }
    });
  }

  function handleConfigRequest(url) {
    try {
      var query = url.split('?')[1] || '';
      var values = {};
      query.split('&').forEach(function (pair) {
        if (!pair) return;
        var idx = pair.indexOf('=');
        var rawKey = idx >= 0 ? pair.slice(0, idx) : pair;
        var rawValue = idx >= 0 ? pair.slice(idx + 1) : '';
        values[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
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

    syntheticResponse(204, '', {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
  }

  function handleAdRequest() {
    if (!readSetting('blockAds')) return passThrough();
    syntheticResponse(204, '', {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8'
    });
  }

  function cleanComments(body) {
    if (!readSetting('hideComment')) return null;
    try {
      var obj = JSON.parse(body);
      if (!obj || typeof obj !== 'object') return null;
      var changed = false;
      var targets = [obj, obj.data];
      targets.forEach(function (target) {
        if (!target || typeof target !== 'object') return;
        ['new', 'hot', 'list', 'comments'].forEach(function (key) {
          if (Array.isArray(target[key])) {
            target[key] = [];
            changed = true;
          }
        });
        ['comment_count', 'commentCount', 'total', 'count'].forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = typeof target[key] === 'string' ? '0' : 0;
            changed = true;
          }
        });
      });
      return changed ? JSON.stringify(obj) : null;
    } catch (_) {
      return null;
    }
  }

  function cleanRelated(body) {
    if (!readSetting('hideRelated')) return null;
    try {
      var obj = JSON.parse(body);
      if (!obj || !obj.data || typeof obj.data !== 'object') return null;
      var changed = false;
      ['relatarticle', 'related_article', 'relatedArticle', 'related_audio_info'].forEach(function (key) {
        if (Array.isArray(obj.data[key])) {
          obj.data[key] = [];
          changed = true;
        }
      });
      return changed ? JSON.stringify(obj) : null;
    } catch (_) {
      return null;
    }
  }

  function isArticleLikeHtml(url, body) {
    if (/\/articlev5\/[^/]+\/[^/]+\.html(?:\?|$)/i.test(url)) return true;
    if (/id=["']cx-main["']/i.test(body) && /id=["']cx-cons["']/i.test(body)) return true;
    if (/id=["']Main_Content_Val["']/i.test(body)) return true;
    if (/class=["'][^"']*\bcomMain\b/i.test(body) && /class=["'][^"']*\bconlf\b/i.test(body)) return true;
    return false;
  }

  function buildInjection(isArticlePage) {
    var state = {
      cleanLayout: readSetting('cleanLayout'),
      hideAiVoice: readSetting('hideAiVoice'),
      hideComment: readSetting('hideComment'),
      hideRelated: readSetting('hideRelated'),
      hideWatermark: readSetting('hideWatermark'),
      showPanel: readSetting('showPanel') && isArticlePage
    };
    var baseState = {
      cleanLayout: readBaseSetting('cleanLayout'),
      hideAiVoice: readBaseSetting('hideAiVoice'),
      hideComment: readBaseSetting('hideComment'),
      hideRelated: readBaseSetting('hideRelated'),
      hideWatermark: readBaseSetting('hideWatermark'),
      showPanel: readBaseSetting('showPanel') && isArticlePage
    };

    var css = String.raw`
/* ===== Simple-Caixin upstream layout/cleanup, scoped by state ===== */
html.simple-caixin-clean-layout .littlenav,
html.simple-caixin-clean-layout .littlenavwarp,
html.simple-caixin-clean-layout .littlenavmore,
html.simple-caixin-clean-layout .Nav { width:100% !important; }
html.simple-caixin-clean-layout .littlenavwarp {
  display:flex !important; justify-content:center !important; gap:2rem !important;
  box-sizing:border-box !important; max-width:970px !important;
}
html.simple-caixin-clean-layout .littlenavwarp > .left {
  display:flex !important; justify-content:center !important; flex-wrap:wrap !important;
}
html.simple-caixin-clean-layout .Nav > ul {
  display:flex !important; flex-wrap:wrap !important; justify-content:center !important;
}
html.simple-caixin-clean-layout .comMain {
  max-width:990px !important; width:100% !important; padding:20px !important;
  box-sizing:border-box !important; margin-left:auto !important; margin-right:auto !important;
}
html.simple-caixin-clean-layout .conlf { width:100% !important; float:none !important; }
html.simple-caixin-clean-layout .media.pip_none { padding:20px !important; }
html.simple-caixin-clean-layout .media,
html.simple-caixin-clean-layout .media_pic {
  width:100% !important; max-width:480px !important; height:auto !important; position:relative !important;
}
html.simple-caixin-clean-layout .media_pic {
  display:flex !important; flex-direction:column !important; justify-content:center !important;
  align-items:center !important; background-color:#f0f0f0 !important; min-height:unset !important;
}
html.simple-caixin-clean-layout .media_pic dt {
  width:100% !important; height:auto !important; display:flex !important;
  justify-content:center !important; align-items:center !important; aspect-ratio:3/2 !important;
}
html.simple-caixin-clean-layout .media_pic img {
  max-width:100% !important; max-height:100% !important; width:auto !important; height:auto !important;
  object-fit:contain !important;
}
html.simple-caixin-clean-layout .media_pic dd {
  width:100% !important; text-align:center !important; margin:0 !important;
}
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

/* ===== iPhone/iPad article WebView ===== */
html.simple-caixin-clean-layout #cx-main,
html.simple-caixin-clean-layout .cx-app-content-main {
  width:100% !important; max-width:760px !important; box-sizing:border-box !important;
  margin-left:auto !important; margin-right:auto !important;
  padding-left:max(16px, env(safe-area-inset-left)) !important;
  padding-right:max(16px, env(safe-area-inset-right)) !important;
}
html.simple-caixin-clean-layout #cx-cons,
html.simple-caixin-clean-layout .cx-cons { width:100% !important; max-width:none !important; box-sizing:border-box !important; }
html.simple-caixin-clean-layout #cx-picture,
html.simple-caixin-clean-layout #cx-picture img,
html.simple-caixin-clean-layout #cx-cons img,
html.simple-caixin-clean-layout .cx-cons img,
html.simple-caixin-clean-layout #cx-main img {
  max-width:100% !important; height:auto !important; box-sizing:border-box !important;
}
html.simple-caixin-clean-layout #cx-cons video,
html.simple-caixin-clean-layout #cx-cons iframe,
html.simple-caixin-clean-layout .cx-cons video,
html.simple-caixin-clean-layout .cx-cons iframe { max-width:100% !important; }
html.simple-caixin-clean-layout #cx-cons pre,
html.simple-caixin-clean-layout .cx-cons pre { max-width:100% !important; overflow-x:auto !important; -webkit-overflow-scrolling:touch; }
html.simple-caixin-clean-layout #cx-cons table,
html.simple-caixin-clean-layout .cx-cons table { max-width:100% !important; }

/* ===== Reversible feature toggles ===== */
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
html.simple-caixin-hide-watermark #Main_Content_Val,
html.simple-caixin-hide-watermark #cx-main,
html.simple-caixin-hide-watermark .cx-app-content-main,
html.simple-caixin-hide-watermark #cx-cons,
html.simple-caixin-hide-watermark .cx-cons {
  background-image:none !important;
}
html.simple-caixin-hide-watermark #cx-customer,
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
html.simple-caixin-hide-watermark [class*="shuiyin"] { display:none !important; background:none !important; background-image:none !important; }
html.simple-caixin-hide-watermark body::before,
html.simple-caixin-hide-watermark body::after,
html.simple-caixin-hide-watermark #cx-main::before,
html.simple-caixin-hide-watermark #cx-main::after,
html.simple-caixin-hide-watermark #cx-cons::before,
html.simple-caixin-hide-watermark #cx-cons::after { background-image:none !important; }

/* ===== Touch-friendly settings panel ===== */
#simple-caixin-loon-panel {
  position:fixed; top:max(10px, env(safe-area-inset-top)); right:max(10px, env(safe-area-inset-right));
  z-index:2147483647; font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
  color:#222; -webkit-tap-highlight-color:transparent; user-select:none;
}
#simple-caixin-loon-gear {
  width:44px; height:44px; display:flex; align-items:center; justify-content:center; margin-left:auto;
  border:0; border-radius:22px; background:rgba(248,248,248,.92); color:#222;
  box-shadow:0 1px 7px rgba(0,0,0,.20); font-size:19px; line-height:1; cursor:pointer;
  opacity:.48; transition:opacity .16s ease, transform .16s ease; touch-action:manipulation;
}
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-gear,
#simple-caixin-loon-gear:active { opacity:1; transform:scale(.96); }
#simple-caixin-loon-menu {
  display:none; width:190px; margin-top:7px; padding:9px; border-radius:12px;
  background:rgba(250,250,250,.97); color:#222; box-shadow:0 4px 18px rgba(0,0,0,.24);
  -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
}
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-menu { display:block; }
.simple-caixin-loon-btn {
  display:block; width:100%; min-height:38px; margin:4px 0; padding:8px 10px;
  border:0; border-radius:8px; background:#ececec; color:inherit; font-size:13px; text-align:left;
  cursor:pointer; touch-action:manipulation;
}
#simple-caixin-loon-note { padding:4px 3px 1px; font-size:10px; line-height:1.35; color:#777; }
@media (prefers-color-scheme: dark) {
  #simple-caixin-loon-gear, #simple-caixin-loon-menu { background:rgba(38,38,38,.95); color:#eee; }
  .simple-caixin-loon-btn { background:#505050; }
  #simple-caixin-loon-note { color:#aaa; }
}
#htmlRoot[data-theme="dark"] #simple-caixin-loon-gear,
#htmlRoot[data-theme="dark"] #simple-caixin-loon-menu { background:rgba(38,38,38,.95); color:#eee; }
#htmlRoot[data-theme="dark"] .simple-caixin-loon-btn { background:#505050; }
#htmlRoot[data-theme="dark"] #simple-caixin-loon-note { color:#aaa; }
`;

    var initialJson = JSON.stringify(state).replace(/</g, '\\u003c');
    var baseJson = JSON.stringify(baseState).replace(/</g, '\\u003c');
    var runtime = String.raw`
(function(){
  'use strict';
  if (window.__SIMPLE_CAIXIN_LOON_V2__) return;
  window.__SIMPLE_CAIXIN_LOON_V2__ = true;

  var CONFIG_PATH = ${JSON.stringify(CONFIG_PATH)};
  var initialState = ${initialJson};
  var baseState = ${baseJson};
  var state = Object.assign({}, initialState);
  var classMap = {
    cleanLayout:'simple-caixin-clean-layout',
    hideAiVoice:'simple-caixin-hide-voice',
    hideComment:'simple-caixin-hide-comment',
    hideRelated:'simple-caixin-hide-related',
    hideWatermark:'simple-caixin-hide-watermark'
  };

  function label(name, enabled) {
    var labels = {
      cleanLayout:['极简排版：关闭','极简排版：开启'],
      hideAiVoice:['语音：显示','语音：隐藏'],
      hideComment:['评论：显示','评论：隐藏'],
      hideRelated:['相关推荐：显示','相关推荐：隐藏'],
      hideWatermark:['水印：显示','水印：隐藏']
    };
    return labels[name][enabled ? 1 : 0];
  }

  function apply() {
    var root = document.documentElement;
    Object.keys(classMap).forEach(function(name){
      root.classList.toggle(classMap[name], !!state[name]);
      var button = document.querySelector('[data-sc-setting="' + name + '"]');
      if (button) button.textContent = label(name, !!state[name]);
    });
  }

  function send(values) {
    var query = Object.keys(values).map(function(key){
      return encodeURIComponent(key) + '=' + encodeURIComponent(values[key]);
    }).join('&');
    try {
      fetch(CONFIG_PATH + '?' + query + '&_=' + Date.now(), {
        method:'GET', cache:'no-store', credentials:'same-origin'
      }).catch(function(){});
    } catch (_) {}
  }

  function saveState() {
    var values = {};
    Object.keys(classMap).forEach(function(name){ values[name] = state[name] ? '1' : '0'; });
    send(values);
  }

  function makeButton(name) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'simple-caixin-loon-btn';
    button.setAttribute('data-sc-setting', name);
    button.addEventListener('click', function(event){
      event.preventDefault(); event.stopPropagation();
      state[name] = !state[name];
      apply(); saveState();
    });
    return button;
  }

  function createPanel() {
    apply();
    if (!initialState.showPanel || !document.body || document.getElementById('simple-caixin-loon-panel')) return;

    var panel = document.createElement('div'); panel.id = 'simple-caixin-loon-panel';
    var gear = document.createElement('button'); gear.id = 'simple-caixin-loon-gear'; gear.type = 'button';
    gear.textContent = '⚙️'; gear.setAttribute('aria-label', '极简财新设置');
    var menu = document.createElement('div'); menu.id = 'simple-caixin-loon-menu';

    ['cleanLayout','hideAiVoice','hideComment','hideRelated','hideWatermark'].forEach(function(name){
      menu.appendChild(makeButton(name));
    });

    var reset = document.createElement('button'); reset.type = 'button'; reset.className = 'simple-caixin-loon-btn';
    reset.textContent = '恢复插件默认';
    reset.addEventListener('click', function(event){
      event.preventDefault(); event.stopPropagation();
      state = Object.assign({}, baseState); apply(); send({reset:'1'});
    });
    menu.appendChild(reset);

    var note = document.createElement('div'); note.id = 'simple-caixin-loon-note';
    note.textContent = '语音/页面元素即时生效；原生评论与相关推荐的接口结果在下次加载时生效。';
    menu.appendChild(note);

    panel.appendChild(gear); panel.appendChild(menu); document.body.appendChild(panel);
    gear.addEventListener('click', function(event){
      event.preventDefault(); event.stopPropagation(); panel.classList.toggle('sc-open');
    });
    panel.addEventListener('click', function(event){ event.stopPropagation(); });
    document.addEventListener('click', function(){ panel.classList.remove('sc-open'); });
    window.addEventListener('scroll', function(){
      if (!panel.classList.contains('sc-open')) gear.style.opacity = '.32';
    }, {passive:true});
    window.addEventListener('touchstart', function(){ gear.style.opacity = '.48'; }, {passive:true});
    apply();
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createPanel, {once:true});
  else createPanel();
})();
`;

    return '<!-- simple-caixin-loon-v2 -->\n' +
      '<style id="simple-caixin-loon-v2-style">' + css + '</style>\n' +
      '<script id="simple-caixin-loon-v2-runtime">' + runtime.replace(/<\/script/gi, '<\\/script') + '</script>';
  }

  function injectHtml(url, body) {
    if (!body || typeof body !== 'string') return null;
    if (body.indexOf('simple-caixin-loon-v2') !== -1) return null;
    if (!/<html[\s>]|<head[\s>]|<body[\s>]/i.test(body)) return null;

    var articleLike = isArticleLikeHtml(url, body);
    var payload = buildInjection(articleLike);

    if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, payload + '\n</head>');
    if (/<body[\s>]/i.test(body)) return body.replace(/<body([^>]*)>/i, '<body$1>\n' + payload);
    return payload + body;
  }

  var url = (typeof $request !== 'undefined' && $request.url) ? $request.url : '';

  // Request phase: settings bridge and ad endpoints only.
  if (typeof $response === 'undefined') {
    if (url.indexOf(CONFIG_PATH) !== -1) return handleConfigRequest(url);
    if (/^https?:\/\/(?:gg|dolphin)\.caixin\.com\/s(?:\?|$)/i.test(url)) return handleAdRequest();
    return passThrough();
  }

  var body = (typeof $response.body === 'string') ? $response.body : '';
  if (!body) return passThrough();

  // Native comment list. Only rewrite when the switch is on.
  if (/\/ios\/article\/getArticleComments(?:\?|$)/i.test(url)) {
    var comments = cleanComments(body);
    return comments === null ? passThrough() : responseBody(comments);
  }

  // Native related-content payload. Keep all other fields intact.
  if (/\/articlev5\/[^/]+\/[^/]+\.json(?:\?|$)/i.test(url)) {
    var related = cleanRelated(body);
    return related === null ? passThrough() : responseBody(related);
  }

  // Deliberately do not modify newValidate or any entitlement/paywall response.
  if (/\/api\/app-api\/auth\/newValidate(?:\?|$)/i.test(url)) return passThrough();

  if (/\.html(?:\?|$)/i.test(url) || /<html[\s>]/i.test(body)) {
    var html = injectHtml(url, body);
    return html === null ? passThrough() : responseBody(html);
  }

  return passThrough();
})();
