/**
 * Simple-Caixin for Loon / iOS v4.3
 * Based on Simple-Caixin (MPL-2.0) by EAK8T6Z / plasma-blue.
 *
 * v4.3 fixes a self-matching selector bug: the old state class contained the
 * word "watermark", so [class*="watermark"] could match and hide <html> itself.
 * It also hard-protects the document/article roots from any watermark cleanup.
 * Entitlement, subscription, payment, login and article content are untouched.
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
        var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var match = new RegExp('(?:^|[,&\\s])' + escaped + '=([^,&\\s]+)', 'i').exec($argument);
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
    return override === undefined ? readBaseSetting(name) : override;
  }

  function passThrough() { $done({}); }
  function responseBody(body) { $done({ body: body }); }

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
      var values = {};
      var query = url.split('?')[1] || '';
      query.split('&').forEach(function (pair) {
        if (!pair) return;
        var index = pair.indexOf('=');
        var key = decodeURIComponent(index >= 0 ? pair.slice(0, index) : pair);
        var value = decodeURIComponent(index >= 0 ? pair.slice(index + 1) : '');
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
      var object = JSON.parse(body);
      var changed = false;
      [object, object && object.data].forEach(function (target) {
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
      return changed ? JSON.stringify(object) : null;
    } catch (_) {
      return null;
    }
  }

  function cleanRelated(body) {
    if (!readSetting('hideRelated')) return null;
    try {
      var object = JSON.parse(body);
      if (!object || !object.data || typeof object.data !== 'object') return null;
      var changed = false;
      ['relatarticle', 'related_article', 'relatedArticle', 'related_audio_info'].forEach(function (key) {
        if (Array.isArray(object.data[key])) {
          object.data[key] = [];
          changed = true;
        }
      });
      return changed ? JSON.stringify(object) : null;
    } catch (_) {
      return null;
    }
  }

  function isArticleLikeHtml(url, body) {
    return /\/articlev5\/[^/]+\/[^/]+\.html(?:\?|$)/i.test(url) ||
      (/id=["']cx-main["']/i.test(body) && /id=["']cx-cons["']/i.test(body)) ||
      /id=["']Main_Content_Val["']/i.test(body) ||
      (/class=["'][^"']*\bcomMain\b/i.test(body) && /class=["'][^"']*\bconlf\b/i.test(body));
  }

  function stateFor(articlePage) {
    return {
      cleanLayout: readSetting('cleanLayout'),
      hideAiVoice: readSetting('hideAiVoice'),
      hideComment: readSetting('hideComment'),
      hideRelated: readSetting('hideRelated'),
      hideWatermark: readSetting('hideWatermark'),
      showPanel: readSetting('showPanel') && articlePage
    };
  }

  function baseStateFor(articlePage) {
    return {
      cleanLayout: readBaseSetting('cleanLayout'),
      hideAiVoice: readBaseSetting('hideAiVoice'),
      hideComment: readBaseSetting('hideComment'),
      hideRelated: readBaseSetting('hideRelated'),
      hideWatermark: readBaseSetting('hideWatermark'),
      showPanel: readBaseSetting('showPanel') && articlePage
    };
  }

  function activeClasses(state) {
    var classMap = {
      cleanLayout: 'simple-caixin-clean-layout',
      hideAiVoice: 'simple-caixin-hide-voice',
      hideComment: 'simple-caixin-hide-comment',
      hideRelated: 'simple-caixin-hide-related',
      hideWatermark: 'simple-caixin-hide-wm'
    };
    var classes = [];
    Object.keys(classMap).forEach(function (name) {
      if (state[name]) classes.push(classMap[name]);
    });
    return classes;
  }

  function addHtmlClasses(body, classes) {
    if (!classes.length) return body;
    return body.replace(/<html\b([^>]*)>/i, function (full, attributes) {
      var match = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(attributes);
      if (match) {
        var existing = match[2].split(/\s+/).filter(Boolean);
        classes.forEach(function (className) {
          if (existing.indexOf(className) < 0) existing.push(className);
        });
        return full.replace(match[0], 'class=' + match[1] + existing.join(' ') + match[1]);
      }
      return '<html' + attributes + ' class="' + classes.join(' ') + '">';
    });
  }

  function buildInjection(state, baseState) {
    var css = String.raw`
/* Original Simple-Caixin reading cleanup. */
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
@supports not (aspect-ratio:1/1) {
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

/* iOS/iPadOS article layout. */
html.simple-caixin-clean-layout #cx-main,
html.simple-caixin-clean-layout .cx-app-content-main { width:100% !important; max-width:760px !important; box-sizing:border-box !important; margin-left:auto !important; margin-right:auto !important; padding-left:max(16px,env(safe-area-inset-left)) !important; padding-right:max(16px,env(safe-area-inset-right)) !important; }
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

/* Reversible feature switches. */
html.simple-caixin-hide-voice #cx-audio,
html.simple-caixin-hide-voice .pc-aivoice,
html.simple-caixin-hide-voice .pc-aivoice.trial,
html.simple-caixin-hide-voice .vioce-box-cons { display:none !important; }
html.simple-caixin-hide-comment #cx-comment,
html.simple-caixin-hide-comment .pc-comment,
html.simple-caixin-hide-comment .comment,
html.simple-caixin-hide-comment [class*="cx-comment"] { display:none !important; }
html.simple-caixin-hide-related #cx-promote,
html.simple-caixin-hide-related #cx-promotes,
html.simple-caixin-hide-related .cx-promote,
html.simple-caixin-hide-related .cx-promotes,
html.simple-caixin-hide-related .related-article,
html.simple-caixin-hide-related .relatarticle { display:none !important; }

/* Watermark state deliberately uses -wm, not -watermark, to avoid self-match. */
html.simple-caixin-hide-wm .watermark,
html.simple-caixin-hide-wm .water-mark,
html.simple-caixin-hide-wm .cx-watermark,
html.simple-caixin-hide-wm .cx-water-mark,
html.simple-caixin-hide-wm .shuiyin,
html.simple-caixin-hide-wm .cx-shuiyin,
html.simple-caixin-hide-wm [id*="watermark"],
html.simple-caixin-hide-wm [class*="watermark"],
html.simple-caixin-hide-wm [id*="water-mark"],
html.simple-caixin-hide-wm [class*="water-mark"],
html.simple-caixin-hide-wm [id*="shuiyin"],
html.simple-caixin-hide-wm [class*="shuiyin"] { display:none !important; visibility:hidden !important; opacity:0 !important; background:none !important; background-image:none !important; }
html.simple-caixin-hide-wm #cx-customer::before,
html.simple-caixin-hide-wm #cx-customer::after,
html.simple-caixin-hide-wm .watermark::before,
html.simple-caixin-hide-wm .watermark::after,
html.simple-caixin-hide-wm .cx-watermark::before,
html.simple-caixin-hide-wm .cx-watermark::after { content:none !important; display:none !important; background:none !important; background-image:none !important; }

/* Touch settings panel. */
#simple-caixin-loon-panel { position:fixed; top:max(58px,calc(env(safe-area-inset-top) + 8px)); right:max(12px,calc(env(safe-area-inset-right) + 8px)); z-index:2147483647; font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif; color:#222; -webkit-tap-highlight-color:transparent; user-select:none; }
#simple-caixin-loon-gear { width:44px; height:44px; display:flex; align-items:center; justify-content:center; margin-left:auto; border:0; border-radius:22px; background:rgba(248,248,248,.94); color:#222; box-shadow:0 1px 7px rgba(0,0,0,.2); font-size:19px; line-height:1; cursor:pointer; opacity:.58; touch-action:manipulation; }
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-gear,
#simple-caixin-loon-gear:active { opacity:1; transform:scale(.96); }
#simple-caixin-loon-menu { display:none; width:204px; margin-top:7px; padding:9px; border-radius:12px; background:rgba(250,250,250,.97); color:#222; box-shadow:0 4px 18px rgba(0,0,0,.24); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); }
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-menu { display:block; }
.simple-caixin-loon-btn { display:block; width:100%; min-height:40px; margin:4px 0; padding:8px 10px; border:0; border-radius:8px; background:#ececec; color:inherit; font-size:13px; text-align:left; cursor:pointer; touch-action:manipulation; }
#simple-caixin-loon-note { padding:4px 3px 1px; font-size:10px; line-height:1.35; color:#777; }
@media(prefers-color-scheme:dark) {
  #simple-caixin-loon-gear,#simple-caixin-loon-menu { background:rgba(38,38,38,.95); color:#eee; }
  .simple-caixin-loon-btn { background:#505050; }
  #simple-caixin-loon-note { color:#aaa; }
}
`;

    var initialJson = JSON.stringify(state).replace(/</g, '\\u003c');
    var baseJson = JSON.stringify(baseState).replace(/</g, '\\u003c');
    var runtime = String.raw`
(function(){
  'use strict';
  if(window.__SIMPLE_CAIXIN_LOON_V43__) return;
  window.__SIMPLE_CAIXIN_LOON_V43__ = true;

  var CONFIG_PATH = ${JSON.stringify(CONFIG_PATH)};
  var state = Object.assign({}, ${initialJson});
  var baseState = Object.assign({}, ${baseJson});
  var classMap = {
    cleanLayout:'simple-caixin-clean-layout',
    hideAiVoice:'simple-caixin-hide-voice',
    hideComment:'simple-caixin-hide-comment',
    hideRelated:'simple-caixin-hide-related',
    hideWatermark:'simple-caixin-hide-wm'
  };
  var records = {watermark:[],voice:[],comment:[],related:[]};
  var shadowRoots = [];
  var observers = [];
  var scheduled = false;
  var panel = null;

  function protectedNode(el) {
    if(!el || el.nodeType !== 1) return true;
    if(el.id === 'simple-caixin-loon-panel' || (el.closest && el.closest('#simple-caixin-loon-panel'))) return true;
    var main = document.getElementById('cx-main');
    var content = document.getElementById('cx-cons');
    var customer = document.getElementById('cx-customer');
    if(el === document.documentElement || el === document.body || el === main || el === content || el === customer) return true;
    if(el.classList && el.classList.contains('cx-app-content-main')) return true;
    if(el.contains && ((main && el.contains(main)) || (content && el.contains(content)))) return true;
    return false;
  }

  function remember(el,bucket,properties) {
    if(!el || !el.style) return;
    var list = records[bucket];
    for(var i=0;i<list.length;i+=1) if(list[i].el === el) return;
    var old = {};
    properties.forEach(function(property){
      old[property] = [el.style.getPropertyValue(property),el.style.getPropertyPriority(property)];
    });
    list.push({el:el,old:old});
  }

  function setImportant(el,property,value) {
    if(!el || !el.style) return;
    if(el.style.getPropertyValue(property) === value && el.style.getPropertyPriority(property) === 'important') return;
    el.style.setProperty(property,value,'important');
  }

  function hideElement(el,bucket) {
    if(protectedNode(el)) return;
    remember(el,bucket,['display','visibility','opacity','pointer-events']);
    setImportant(el,'display','none');
    setImportant(el,'visibility','hidden');
    setImportant(el,'opacity','0');
    setImportant(el,'pointer-events','none');
  }

  function restore(bucket) {
    var list = records[bucket];
    while(list.length) {
      var record = list.pop();
      if(!record.el || !record.el.style) continue;
      Object.keys(record.old).forEach(function(property){
        var old = record.old[property];
        if(old[0]) record.el.style.setProperty(property,old[0],old[1] || '');
        else record.el.style.removeProperty(property);
      });
    }
  }

  function roots() {
    var output = [document];
    for(var i=0;i<shadowRoots.length;i+=1) output.push(shadowRoots[i]);
    try {
      document.querySelectorAll('*').forEach(function(el){
        if(el.shadowRoot && shadowRoots.indexOf(el.shadowRoot) < 0) shadowRoots.push(el.shadowRoot);
      });
    } catch(_) {}
    return output.concat(shadowRoots.filter(function(root,index,array){ return array.indexOf(root) === index; }));
  }

  function deepQuery(selector) {
    var output = [];
    roots().forEach(function(root){
      try {
        root.querySelectorAll(selector).forEach(function(el){
          if(output.indexOf(el) < 0) output.push(el);
        });
      } catch(_) {}
    });
    return output;
  }

  function hideSelector(selector,bucket) {
    deepQuery(selector).forEach(function(el){ hideElement(el,bucket); });
  }

  function watermarkWords(text) {
    return /财新网友|版权所有|翻版必究/.test(String(text || '').replace(/\s+/g,''));
  }

  function shortTextWatermark(el) {
    if(protectedNode(el)) return false;
    var text = String(el.textContent || '').replace(/\s+/g,'');
    if(!text || text.length > 140 || !watermarkWords(text)) return false;
    if(el.children && el.children.length > 5) return false;
    var style;
    try { style = getComputedStyle(el); } catch(_) { return false; }
    var opacity = parseFloat(style.opacity || '1');
    var overlay = /^(fixed|absolute|sticky)$/.test(style.position);
    var rotated = !!(style.transform && style.transform !== 'none');
    var inert = style.pointerEvents === 'none';
    return overlay || rotated || inert || opacity < 0.82;
  }

  function enforceWatermark() {
    if(!state.hideWatermark) {
      restore('watermark');
      return;
    }
    hideSelector('.watermark,.water-mark,.cx-watermark,.cx-water-mark,.shuiyin,.cx-shuiyin,[id*="watermark"],[class*="watermark"],[id*="water-mark"],[class*="water-mark"],[id*="shuiyin"],[class*="shuiyin"]','watermark');
    deepQuery('body *').forEach(function(el){
      if(shortTextWatermark(el)) hideElement(el,'watermark');
    });
  }

  function enforceFeature(enabled,selector,bucket) {
    if(enabled) hideSelector(selector,bucket);
    else restore(bucket);
  }

  function applyClasses() {
    var root = document.documentElement;
    if(!root) return;
    Object.keys(classMap).forEach(function(name){
      root.classList.toggle(classMap[name],!!state[name]);
    });
  }

  function label(name,enabled) {
    var labels = {
      cleanLayout:['极简排版：关闭','极简排版：开启'],
      hideAiVoice:['语音：显示','语音：隐藏'],
      hideComment:['评论：显示','评论：隐藏'],
      hideRelated:['相关推荐：显示','相关推荐：隐藏'],
      hideWatermark:['水印：显示','水印：隐藏']
    };
    return labels[name][enabled ? 1 : 0];
  }

  function updateLabels() {
    Object.keys(classMap).forEach(function(name){
      var button = document.querySelector('[data-sc-setting="' + name + '"]');
      if(button) button.textContent = label(name,!!state[name]);
    });
  }

  function send(values) {
    var query = Object.keys(values).map(function(key){
      return encodeURIComponent(key) + '=' + encodeURIComponent(values[key]);
    }).join('&');
    try {
      fetch(CONFIG_PATH + '?' + query + '&_=' + Date.now(),{method:'GET',cache:'no-store',credentials:'same-origin'}).catch(function(){});
    } catch(_) {}
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
    button.setAttribute('data-sc-setting',name);
    button.addEventListener('click',function(event){
      event.preventDefault();
      event.stopPropagation();
      state[name] = !state[name];
      enforce();
      saveState();
    });
    return button;
  }

  function ensurePanel() {
    if(!state.showPanel || !document.body) return;
    panel = document.getElementById('simple-caixin-loon-panel');
    if(panel) return;

    panel = document.createElement('div');
    panel.id = 'simple-caixin-loon-panel';
    var gear = document.createElement('button');
    gear.id = 'simple-caixin-loon-gear';
    gear.type = 'button';
    gear.textContent = '⚙️';
    gear.setAttribute('aria-label','极简财新设置');
    var menu = document.createElement('div');
    menu.id = 'simple-caixin-loon-menu';
    ['cleanLayout','hideAiVoice','hideComment','hideRelated','hideWatermark'].forEach(function(name){
      menu.appendChild(makeButton(name));
    });
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'simple-caixin-loon-btn';
    reset.textContent = '恢复插件默认';
    reset.addEventListener('click',function(event){
      event.preventDefault();
      event.stopPropagation();
      state = Object.assign({},baseState);
      enforce();
      send({reset:'1'});
    });
    menu.appendChild(reset);
    var note = document.createElement('div');
    note.id = 'simple-caixin-loon-note';
    note.textContent = 'v4.3：修复水印选择器匹配到 HTML 根节点导致正文整体消失；正文根节点已强制保护。';
    menu.appendChild(note);
    panel.appendChild(gear);
    panel.appendChild(menu);
    document.body.appendChild(panel);
    gear.addEventListener('click',function(event){
      event.preventDefault();
      event.stopPropagation();
      panel.classList.toggle('sc-open');
    });
    panel.addEventListener('click',function(event){ event.stopPropagation(); });
    document.addEventListener('click',function(){ if(panel) panel.classList.remove('sc-open'); });
  }

  function enforce() {
    scheduled = false;
    applyClasses();
    enforceWatermark();
    enforceFeature(state.hideAiVoice,'#cx-audio,.pc-aivoice,.pc-aivoice.trial,.vioce-box-cons','voice');
    enforceFeature(state.hideComment,'#cx-comment,.pc-comment,.comment,[class*="cx-comment"]','comment');
    enforceFeature(state.hideRelated,'#cx-promote,#cx-promotes,.cx-promote,.cx-promotes,.related-article,.relatarticle','related');
    ensurePanel();
    updateLabels();
  }

  function schedule() {
    if(scheduled) return;
    scheduled = true;
    setTimeout(enforce,40);
  }

  function observe(root) {
    if(!window.MutationObserver || !root) return;
    for(var i=0;i<observers.length;i+=1) if(observers[i].root === root) return;
    var observer = new MutationObserver(schedule);
    try {
      observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
      observers.push({root:root,observer:observer});
    } catch(_) {}
  }

  try {
    if(window.Element && Element.prototype.attachShadow) {
      var originalAttachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(){
        var root = originalAttachShadow.apply(this,arguments);
        if(root && shadowRoots.indexOf(root) < 0) {
          shadowRoots.push(root);
          observe(root);
          schedule();
        }
        return root;
      };
    }
  } catch(_) {}

  function patchCanvasPrototype(prototype) {
    if(!prototype || prototype.__simpleCaixinWatermarkPatched) return;
    prototype.__simpleCaixinWatermarkPatched = true;
    ['fillText','strokeText'].forEach(function(name){
      var original = prototype[name];
      if(typeof original !== 'function') return;
      prototype[name] = function(text){
        if(state.hideWatermark && watermarkWords(text)) return;
        return original.apply(this,arguments);
      };
    });
  }

  try { patchCanvasPrototype(window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype); } catch(_) {}
  try { patchCanvasPrototype(window.OffscreenCanvasRenderingContext2D && OffscreenCanvasRenderingContext2D.prototype); } catch(_) {}

  applyClasses();
  observe(document.documentElement);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',enforce,{once:true});
  else enforce();
  var tick = 0;
  var warmup = setInterval(function(){
    enforce();
    tick += 1;
    if(tick >= 20) clearInterval(warmup);
  },500);
})();
`;

    return '<!-- simple-caixin-loon-v4.3 -->\n' +
      '<style id="simple-caixin-loon-v43-style">' + css + '</style>\n' +
      '<script id="simple-caixin-loon-v43-runtime">' + runtime.replace(/<\/script/gi,'<\\/script') + '</script>';
  }

  function injectHtml(url, body) {
    if (!body || typeof body !== 'string') return null;
    if (body.indexOf('simple-caixin-loon-v4.3') !== -1) return null;
    if (!/<html[\s>]|<head[\s>]|<body[\s>]/i.test(body)) return null;
    var articlePage = isArticleLikeHtml(url,body);
    var state = stateFor(articlePage);
    var baseState = baseStateFor(articlePage);
    var prepared = addHtmlClasses(body,activeClasses(state));
    var payload = buildInjection(state,baseState);
    if (/<\/head>/i.test(prepared)) return prepared.replace(/<\/head>/i,payload + '\n</head>');
    if (/<body[\s>]/i.test(prepared)) return prepared.replace(/<body([^>]*)>/i,'<body$1>\n' + payload);
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

  if (/\/api\/app-api\/auth\/newValidate(?:\?|$)/i.test(url)) return passThrough();

  if (/\.html?(?:\?|$)|\.shtml(?:\?|$)/i.test(url) || /<html[\s>]/i.test(body)) {
    var html = injectHtml(url,body);
    return html === null ? passThrough() : responseBody(html);
  }

  return passThrough();
})();
