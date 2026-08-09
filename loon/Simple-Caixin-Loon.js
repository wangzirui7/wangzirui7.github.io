/**
 * Simple-Caixin for Loon / iOS
 * Based on Simple-Caixin (MPL-2.0) by EAK8T6Z / plasma-blue.
 * Purpose: UI cleanup, watermark removal, responsive reading layout,
 *          AI voice toggle and comment toggle for Caixin web/iOS WebView.
 * Does NOT alter article entitlement, subscription, payment, or paywall checks.
 */

(function () {
  'use strict';

  const STORE_PREFIX = 'simple_caixin.';
  const CONFIG_PATH = '/__simple_caixin_config';

  function readBool(name, fallback) {
    try {
      const v = $persistentStore.read(STORE_PREFIX + name);
      if (v === null || v === undefined || v === '') return fallback;
      return String(v).toLowerCase() === 'true' || String(v) === '1';
    } catch (_) {
      return fallback;
    }
  }

  function writeBool(name, value) {
    try { return $persistentStore.write(value ? 'true' : 'false', STORE_PREFIX + name); }
    catch (_) { return false; }
  }

  function getHeader(headers, key) {
    if (!headers) return '';
    const target = key.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === target) return String(headers[k] || '');
    }
    return '';
  }

  function doneResponse(body, headers) {
    const h = Object.assign({}, headers || {});
    for (const k of Object.keys(h)) {
      if (k.toLowerCase() === 'content-length') delete h[k];
      if (k.toLowerCase() === 'content-encoding') delete h[k];
    }
    $done({ status: $response.status || 200, headers: h, body });
  }

  function handleConfigRequest(url) {
    try {
      const q = url.split('?')[1] || '';
      q.split('&').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx < 0) return;
        const key = decodeURIComponent(pair.slice(0, idx));
        const val = decodeURIComponent(pair.slice(idx + 1));
        if (key === 'hideAiVoice' || key === 'hideComment') {
          writeBool(key, val === '1' || val === 'true');
        }
      });
    } catch (_) {}

    $done({
      response: {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        },
        body: ''
      }
    });
  }

  function cleanComments(body) {
    const hideComment = readBool('hideComment', false);
    if (!hideComment) return body;
    try {
      const obj = JSON.parse(body);
      if (obj && obj.data && typeof obj.data === 'object') {
        if (Array.isArray(obj.data.new)) obj.data.new = [];
        if (Array.isArray(obj.data.hot)) obj.data.hot = [];
        if (Array.isArray(obj.data.list)) obj.data.list = [];
        if ('comment_count' in obj.data) obj.data.comment_count = '0';
      }
      if (obj && 'comment_count' in obj) obj.comment_count = '0';
      return JSON.stringify(obj);
    } catch (_) {
      return body;
    }
  }

  function cleanAudioMetadata(body) {
    const hideAiVoice = readBool('hideAiVoice', true);
    if (!hideAiVoice) return body;
    try {
      const obj = JSON.parse(body);
      const audio = obj && obj.data && obj.data.articleProperties && obj.data.articleProperties.audio;
      if (audio && typeof audio === 'object') {
        ['audioUrl', 'manAudioUrl', 'womanAudioUrl', 'manTrialAudioUrl', 'womanTrialAudioUrl'].forEach(k => {
          if (k in audio) audio[k] = '';
        });
      }
      return JSON.stringify(obj);
    } catch (_) {
      return body;
    }
  }

  function htmlInjection(hideAiVoice, hideComment) {
    const initialVoice = hideAiVoice ? 'true' : 'false';
    const initialComment = hideComment ? 'true' : 'false';

    return `<!-- simple-caixin-loon-v1 -->
<style id="simple-caixin-loon-style">
/* ===== Original Simple-Caixin features ===== */
.littlenav, .littlenavwarp, .littlenavmore, .Nav { width: 100% !important; }
.littlenavwarp { display:flex; justify-content:center; gap:2rem; box-sizing:border-box; max-width:970px; }
.littlenavwarp > .left { display:flex; justify-content:center; flex-wrap:wrap; }
.Nav > ul { display:flex; flex-wrap:wrap; justify-content:center; }
.comMain { max-width:990px !important; width:100% !important; padding:20px; box-sizing:border-box; margin-left:auto !important; margin-right:auto !important; }
.conlf { width:100% !important; float:none !important; }
.media.pip_none { padding:20px; }
.media, .media_pic { width:100% !important; max-width:480px !important; height:auto !important; position:relative; }
.media_pic { display:flex; flex-direction:column; justify-content:center; align-items:center; background-color:#f0f0f0; min-height:unset !important; }
.media_pic dt { width:100% !important; height:auto !important; display:flex; justify-content:center; align-items:center; aspect-ratio:3/2; }
.media_pic img { max-width:100%; max-height:100%; width:auto !important; height:auto !important; object-fit:contain !important; }
.media_pic dd { width:100%; text-align:center; margin:0; }
.media dd { width:min(100%,480px); box-sizing:border-box; }
@supports not (aspect-ratio: 1 / 1) {
  .media_pic::before { content:""; display:block; padding-top:66.6%; }
  .media_pic img { position:absolute; top:0; left:0; width:100%; height:100%; }
}
@media screen and (max-width:998px) {
  .logimage { display:none !important; }
  .Nav .navtabs { margin:0; }
  .littlenavwarp > .searchbox { display:none !important; }
}
.sitenav, .vioce-box-cons, .icon_key, .subhead, .pip, .function01, .morelink,
.greenBg, .redBg, .cx-wx-hb-tips, .conri, .f_ri, .fenghui_code, .comment,
.hot_word_v2, .bottom_tong_ad, .copyright, .navBottom, .multimedia,
.share_list, .renewals, .wifi-tips, .adsame-banner-box { display:none !important; }
#Main_Content_Val { background:none !important; background-image:none !important; }

/* ===== Loon / iPhone / iPad adaptations ===== */
html, body { max-width:100%; overflow-x:hidden; }
#cx-main, .cx-app-content-main, #cx-cons, .cx-cons, .cons, .conss {
  box-sizing:border-box !important;
  width:100% !important;
  max-width:760px !important;
  margin-left:auto !important;
  margin-right:auto !important;
}
.cx-app-content-main img, #cx-main img, #cx-cons img, .cx-cons img {
  max-width:100% !important;
  height:auto !important;
  object-fit:contain !important;
}
#cx-picture img { max-width:100% !important; height:auto !important; object-fit:contain !important; }
#cx-promote, #cx-promotes { max-width:760px !important; margin-left:auto !important; margin-right:auto !important; }

/* Dynamic toggles */
html.simple-caixin-hide-voice .pc-aivoice,
html.simple-caixin-hide-voice .pc-aivoice.trial,
html.simple-caixin-hide-voice #cx-audio { display:none !important; }
html.simple-caixin-hide-comment .pc-comment { display:none !important; }

/* Touch-friendly settings button */
#simple-caixin-loon-panel {
  position:fixed; top:max(10px, env(safe-area-inset-top)); right:max(10px, env(safe-area-inset-right));
  z-index:2147483647; font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
  opacity:.42; transition:opacity .2s, transform .2s; -webkit-tap-highlight-color:transparent;
}
#simple-caixin-loon-panel.sc-hidden { transform:translateY(-120px); opacity:0; pointer-events:none; }
#simple-caixin-loon-gear {
  width:34px; height:34px; display:flex; align-items:center; justify-content:center;
  border-radius:17px; background:rgba(245,245,245,.92); box-shadow:0 1px 6px rgba(0,0,0,.18);
  cursor:pointer; user-select:none; font-size:18px;
}
#simple-caixin-loon-menu {
  display:none; margin-top:6px; min-width:132px; padding:7px; border-radius:10px;
  background:rgba(250,250,250,.96); box-shadow:0 3px 16px rgba(0,0,0,.22); backdrop-filter:blur(10px);
}
#simple-caixin-loon-panel.sc-open { opacity:1; }
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-menu { display:block; }
.simple-caixin-loon-btn {
  display:block; width:100%; margin:4px 0; padding:8px 10px; border:0; border-radius:7px;
  background:#ececec; color:#222; font-size:13px; text-align:left; cursor:pointer;
}
@media (prefers-color-scheme: dark) {
  #simple-caixin-loon-gear, #simple-caixin-loon-menu { background:rgba(38,38,38,.94); color:#eee; }
  .simple-caixin-loon-btn { background:#505050; color:#fff; }
}
</style>
<script id="simple-caixin-loon-script">
(function(){
  'use strict';
  if (window.__SIMPLE_CAIXIN_LOON__) return;
  window.__SIMPLE_CAIXIN_LOON__ = true;

  var state = {
    hideAiVoice: ${initialVoice},
    hideComment: ${initialComment}
  };

  function apply(){
    var root = document.documentElement;
    root.classList.toggle('simple-caixin-hide-voice', !!state.hideAiVoice);
    root.classList.toggle('simple-caixin-hide-comment', !!state.hideComment);
    var vb = document.getElementById('sc-voice-btn');
    var cb = document.getElementById('sc-comment-btn');
    if (vb) vb.textContent = '语音：' + (state.hideAiVoice ? '已隐藏' : '已显示');
    if (cb) cb.textContent = '评论：' + (state.hideComment ? '已隐藏' : '已显示');
  }

  function sync(){
    var q = '?hideAiVoice=' + (state.hideAiVoice ? '1' : '0') +
            '&hideComment=' + (state.hideComment ? '1' : '0') + '&_=' + Date.now();
    try { fetch('${CONFIG_PATH}' + q, {method:'GET', cache:'no-store', credentials:'same-origin'}).catch(function(){}); } catch(e){}
  }

  function createPanel(){
    if (!document.body || document.getElementById('simple-caixin-loon-panel')) return;
    var p = document.createElement('div'); p.id='simple-caixin-loon-panel';
    var g = document.createElement('div'); g.id='simple-caixin-loon-gear'; g.textContent='⚙️'; g.setAttribute('aria-label','极简财新设置');
    var m = document.createElement('div'); m.id='simple-caixin-loon-menu';
    var v = document.createElement('button'); v.id='sc-voice-btn'; v.className='simple-caixin-loon-btn';
    var c = document.createElement('button'); c.id='sc-comment-btn'; c.className='simple-caixin-loon-btn';
    m.appendChild(v); m.appendChild(c); p.appendChild(g); p.appendChild(m); document.body.appendChild(p);
    g.addEventListener('click', function(ev){ ev.stopPropagation(); p.classList.toggle('sc-open'); apply(); });
    v.addEventListener('click', function(ev){ ev.stopPropagation(); state.hideAiVoice=!state.hideAiVoice; apply(); sync(); });
    c.addEventListener('click', function(ev){ ev.stopPropagation(); state.hideComment=!state.hideComment; apply(); sync(); });
    p.addEventListener('mouseenter', function(){ p.classList.add('sc-open'); });
    p.addEventListener('mouseleave', function(){ if (!('ontouchstart' in window)) p.classList.remove('sc-open'); });
    document.addEventListener('click', function(){ p.classList.remove('sc-open'); });
    var timer;
    window.addEventListener('scroll', function(){
      clearTimeout(timer); timer=setTimeout(function(){
        var y=window.pageYOffset || document.documentElement.scrollTop || 0;
        if (y <= 10 || p.classList.contains('sc-open')) p.classList.remove('sc-hidden');
        else p.classList.add('sc-hidden');
      },100);
    }, {passive:true});
    apply();
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createPanel, {once:true});
  else createPanel();
})();
</script>`;
  }

  function injectHtml(body) {
    if (!body || typeof body !== 'string') return body;
    if (body.indexOf('simple-caixin-loon-v1') !== -1) return body;
    if (!/<html[\s>]/i.test(body) && !/<head[\s>]/i.test(body)) return body;

    const payload = htmlInjection(readBool('hideAiVoice', true), readBool('hideComment', false));
    if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, payload + '\n</head>');
    if (/<body[\s>]/i.test(body)) return body.replace(/<body([^>]*)>/i, '<body$1>\n' + payload);
    return payload + body;
  }

  const url = ($request && $request.url) ? $request.url : '';

  // HTTP-request: same-origin bridge used by the injected settings panel.
  if (typeof $response === 'undefined') {
    if (url.indexOf(CONFIG_PATH) !== -1) return handleConfigRequest(url);
    return $done({});
  }

  let body = $response.body;
  if (typeof body !== 'string') return $done({});

  // Native/app comment list: honor the same persistent comment switch.
  if (/\/ios\/article\/getArticleComments(?:\?|$)/i.test(url)) {
    return doneResponse(cleanComments(body), $response.headers);
  }

  // Article authorization response: only suppress audio URLs when requested.
  // Content, power, subscription and entitlement fields are intentionally untouched.
  if (/\/api\/app-api\/auth\/newValidate(?:\?|$)/i.test(url)) {
    return doneResponse(cleanAudioMetadata(body), $response.headers);
  }

  // HTML pages and Caixin iOS article WebView.
  const ct = getHeader($response.headers, 'content-type');
  if (/text\/html|application\/xhtml\+xml/i.test(ct) || /<html[\s>]/i.test(body)) {
    const out = injectHtml(body);
    if (out !== body) return doneResponse(out, $response.headers);
  }

  return $done({});
})();
