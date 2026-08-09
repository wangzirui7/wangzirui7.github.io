/**
 * Simple-Caixin for Loon / iOS v4.1
 * Based on Simple-Caixin (MPL-2.0) by EAK8T6Z / plasma-blue.
 *
 * v4.1 keeps v4's canvas/Shadow DOM support but removes the broad visual
 * overlay heuristic that could hide the entire Caixin article container.
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
    var v = String(value).trim().toLowerCase();
    if (/^(1|true|yes|on)$/.test(v)) return true;
    if (/^(0|false|no|off)$/.test(v)) return false;
    return fallback;
  }

  function getArgument(name) {
    try {
      if (typeof $argument === 'object' && $argument !== null && Object.prototype.hasOwnProperty.call($argument, name)) return $argument[name];
      if (typeof $argument === 'string') {
        var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var m = new RegExp('(?:^|[,&\\s])' + escaped + '=([^,&\\s]+)', 'i').exec($argument);
        if (m) return m[1];
      }
    } catch (_) {}
    return undefined;
  }

  function readOverride(name) {
    try {
      var v = $persistentStore.read(STORE_PREFIX + name);
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch (_) {}
    return undefined;
  }
  function writeOverride(name, value) { try { return $persistentStore.write(value ? 'true' : 'false', STORE_PREFIX + name); } catch (_) { return false; } }
  function clearOverride(name) { try { return $persistentStore.write('', STORE_PREFIX + name); } catch (_) { return false; } }
  function readBaseSetting(name) { return parseBool(getArgument(name), DEFAULTS[name]); }
  function readSetting(name) { var o = readOverride(name); return o === undefined ? readBaseSetting(name) : o; }
  function passThrough() { $done({}); }
  function responseBody(body) { $done({ body: body }); }
  function syntheticResponse(status, body, headers) { $done({ response: { status: status, headers: headers || { 'Cache-Control': 'no-store' }, body: body || '' } }); }

  function handleConfigRequest(url) {
    try {
      var values = {};
      (url.split('?')[1] || '').split('&').forEach(function (pair) {
        if (!pair) return;
        var i = pair.indexOf('=');
        var k = decodeURIComponent(i >= 0 ? pair.slice(0, i) : pair);
        var v = decodeURIComponent(i >= 0 ? pair.slice(i + 1) : '');
        values[k] = v;
      });
      if (parseBool(values.reset, false)) SETTINGS.forEach(clearOverride);
      else SETTINGS.forEach(function (name) { if (Object.prototype.hasOwnProperty.call(values, name)) writeOverride(name, parseBool(values[name], readSetting(name))); });
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
      var obj = JSON.parse(body), changed = false;
      [obj, obj && obj.data].forEach(function (target) {
        if (!target || typeof target !== 'object') return;
        ['new', 'hot', 'list', 'comments'].forEach(function (key) { if (Array.isArray(target[key])) { target[key] = []; changed = true; } });
        ['comment_count', 'commentCount', 'total', 'count'].forEach(function (key) { if (Object.prototype.hasOwnProperty.call(target, key)) { target[key] = typeof target[key] === 'string' ? '0' : 0; changed = true; } });
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
      ['relatarticle', 'related_article', 'relatedArticle', 'related_audio_info'].forEach(function (key) { if (Array.isArray(obj.data[key])) { obj.data[key] = []; changed = true; } });
      return changed ? JSON.stringify(obj) : null;
    } catch (_) { return null; }
  }

  function isArticleLikeHtml(url, body) {
    return /\/articlev5\/[^/]+\/[^/]+\.html(?:\?|$)/i.test(url) ||
      (/id=["']cx-main["']/i.test(body) && /id=["']cx-cons["']/i.test(body)) ||
      /id=["']Main_Content_Val["']/i.test(body) ||
      (/class=["'][^"']*\bcomMain\b/i.test(body) && /class=["'][^"']*\bconlf\b/i.test(body));
  }

  function stateFor(article) {
    return { cleanLayout: readSetting('cleanLayout'), hideAiVoice: readSetting('hideAiVoice'), hideComment: readSetting('hideComment'), hideRelated: readSetting('hideRelated'), hideWatermark: readSetting('hideWatermark'), showPanel: readSetting('showPanel') && article };
  }
  function baseStateFor(article) {
    return { cleanLayout: readBaseSetting('cleanLayout'), hideAiVoice: readBaseSetting('hideAiVoice'), hideComment: readBaseSetting('hideComment'), hideRelated: readBaseSetting('hideRelated'), hideWatermark: readBaseSetting('hideWatermark'), showPanel: readBaseSetting('showPanel') && article };
  }

  function activeClasses(state) {
    var map = { cleanLayout: 'simple-caixin-clean-layout', hideAiVoice: 'simple-caixin-hide-voice', hideComment: 'simple-caixin-hide-comment', hideRelated: 'simple-caixin-hide-related', hideWatermark: 'simple-caixin-hide-watermark' };
    var out = [];
    Object.keys(map).forEach(function (k) { if (state[k]) out.push(map[k]); });
    return out;
  }

  function addHtmlClasses(body, classes) {
    if (!classes.length) return body;
    return body.replace(/<html\b([^>]*)>/i, function (full, attrs) {
      var m = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(attrs);
      if (m) {
        var list = m[2].split(/\s+/).filter(Boolean);
        classes.forEach(function (c) { if (list.indexOf(c) < 0) list.push(c); });
        return full.replace(m[0], 'class=' + m[1] + list.join(' ') + m[1]);
      }
      return '<html' + attrs + ' class="' + classes.join(' ') + '">';
    });
  }

  function buildInjection(state, baseState) {
    var css = String.raw`
html.simple-caixin-clean-layout .littlenav,html.simple-caixin-clean-layout .littlenavwarp,html.simple-caixin-clean-layout .littlenavmore,html.simple-caixin-clean-layout .Nav{width:100%!important}
html.simple-caixin-clean-layout .littlenavwarp{display:flex!important;justify-content:center!important;gap:2rem!important;box-sizing:border-box!important;max-width:970px!important}
html.simple-caixin-clean-layout .littlenavwarp>.left{display:flex!important;justify-content:center!important;flex-wrap:wrap!important}
html.simple-caixin-clean-layout .Nav>ul{display:flex!important;flex-wrap:wrap!important;justify-content:center!important}
html.simple-caixin-clean-layout .comMain{max-width:990px!important;width:100%!important;padding:20px!important;box-sizing:border-box!important;margin-left:auto!important;margin-right:auto!important}
html.simple-caixin-clean-layout .conlf{width:100%!important;float:none!important}
html.simple-caixin-clean-layout .media.pip_none{padding:20px!important}
html.simple-caixin-clean-layout .media,html.simple-caixin-clean-layout .media_pic{width:100%!important;max-width:480px!important;height:auto!important;position:relative!important}
html.simple-caixin-clean-layout .media_pic{display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;background-color:#f0f0f0!important;min-height:unset!important}
html.simple-caixin-clean-layout .media_pic dt{width:100%!important;height:auto!important;display:flex!important;justify-content:center!important;align-items:center!important;aspect-ratio:3/2!important}
html.simple-caixin-clean-layout .media_pic img{max-width:100%!important;max-height:100%!important;width:auto!important;height:auto!important;object-fit:contain!important}
html.simple-caixin-clean-layout .media_pic dd{width:100%!important;text-align:center!important;margin:0!important}
html.simple-caixin-clean-layout .media dd{width:min(100%,480px)!important;box-sizing:border-box!important}
@supports not (aspect-ratio:1/1){html.simple-caixin-clean-layout .media_pic::before{content:"";display:block;padding-top:66.6%}html.simple-caixin-clean-layout .media_pic img{position:absolute;top:0;left:0;width:100%;height:100%}}
@media screen and (max-width:998px){html.simple-caixin-clean-layout .logimage{display:none!important}html.simple-caixin-clean-layout .Nav .navtabs{margin:0!important}html.simple-caixin-clean-layout .littlenavwarp>.searchbox{display:none!important}}
html.simple-caixin-clean-layout .sitenav,html.simple-caixin-clean-layout .icon_key,html.simple-caixin-clean-layout .subhead,html.simple-caixin-clean-layout .pip,html.simple-caixin-clean-layout .function01,html.simple-caixin-clean-layout .morelink,html.simple-caixin-clean-layout .greenBg,html.simple-caixin-clean-layout .redBg,html.simple-caixin-clean-layout .cx-wx-hb-tips,html.simple-caixin-clean-layout .conri,html.simple-caixin-clean-layout .f_ri,html.simple-caixin-clean-layout .fenghui_code,html.simple-caixin-clean-layout .hot_word_v2,html.simple-caixin-clean-layout .bottom_tong_ad,html.simple-caixin-clean-layout .copyright,html.simple-caixin-clean-layout .navBottom,html.simple-caixin-clean-layout .multimedia,html.simple-caixin-clean-layout .share_list,html.simple-caixin-clean-layout .renewals,html.simple-caixin-clean-layout .wifi-tips,html.simple-caixin-clean-layout .adsame-banner-box{display:none!important}
html.simple-caixin-clean-layout #cx-main,html.simple-caixin-clean-layout .cx-app-content-main{width:100%!important;max-width:760px!important;box-sizing:border-box!important;margin-left:auto!important;margin-right:auto!important;padding-left:max(16px,env(safe-area-inset-left))!important;padding-right:max(16px,env(safe-area-inset-right))!important}
html.simple-caixin-clean-layout #cx-cons,html.simple-caixin-clean-layout .cx-cons{width:100%!important;max-width:none!important;box-sizing:border-box!important}
html.simple-caixin-clean-layout #cx-picture,html.simple-caixin-clean-layout #cx-picture img,html.simple-caixin-clean-layout #cx-cons img,html.simple-caixin-clean-layout .cx-cons img,html.simple-caixin-clean-layout #cx-main img{max-width:100%!important;height:auto!important;box-sizing:border-box!important}
html.simple-caixin-clean-layout #cx-cons video,html.simple-caixin-clean-layout #cx-cons iframe,html.simple-caixin-clean-layout .cx-cons video,html.simple-caixin-clean-layout .cx-cons iframe{max-width:100%!important}
html.simple-caixin-clean-layout #cx-cons pre,html.simple-caixin-clean-layout .cx-cons pre{max-width:100%!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch}
html.simple-caixin-clean-layout #cx-cons table,html.simple-caixin-clean-layout .cx-cons table{max-width:100%!important}
html.simple-caixin-hide-voice #cx-audio,html.simple-caixin-hide-voice .pc-aivoice,html.simple-caixin-hide-voice .pc-aivoice.trial,html.simple-caixin-hide-voice .vioce-box-cons{display:none!important}
html.simple-caixin-hide-comment #cx-comment,html.simple-caixin-hide-comment .pc-comment,html.simple-caixin-hide-comment .comment,html.simple-caixin-hide-comment [class*="cx-comment"]{display:none!important}
html.simple-caixin-hide-related #cx-promote,html.simple-caixin-hide-related #cx-promotes,html.simple-caixin-hide-related .cx-promote,html.simple-caixin-hide-related .cx-promotes,html.simple-caixin-hide-related .related-article,html.simple-caixin-hide-related .relatarticle{display:none!important}
html.simple-caixin-hide-watermark #cx-customer,html.simple-caixin-hide-watermark #cx-customer *,html.simple-caixin-hide-watermark .watermark,html.simple-caixin-hide-watermark .water-mark,html.simple-caixin-hide-watermark .cx-watermark,html.simple-caixin-hide-watermark .cx-water-mark,html.simple-caixin-hide-watermark .shuiyin,html.simple-caixin-hide-watermark .cx-shuiyin,html.simple-caixin-hide-watermark [id*="watermark"],html.simple-caixin-hide-watermark [class*="watermark"],html.simple-caixin-hide-watermark [id*="water-mark"],html.simple-caixin-hide-watermark [class*="water-mark"],html.simple-caixin-hide-watermark [id*="shuiyin"],html.simple-caixin-hide-watermark [class*="shuiyin"]{display:none!important;visibility:hidden!important;opacity:0!important;background:none!important;background-image:none!important}
html.simple-caixin-hide-watermark #cx-customer::before,html.simple-caixin-hide-watermark #cx-customer::after,html.simple-caixin-hide-watermark .watermark::before,html.simple-caixin-hide-watermark .watermark::after,html.simple-caixin-hide-watermark .cx-watermark::before,html.simple-caixin-hide-watermark .cx-watermark::after{content:none!important;display:none!important;background:none!important;background-image:none!important}
#simple-caixin-loon-panel{position:fixed;top:max(58px,calc(env(safe-area-inset-top) + 8px));right:max(12px,calc(env(safe-area-inset-right) + 8px));z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#222;-webkit-tap-highlight-color:transparent;user-select:none}
#simple-caixin-loon-gear{width:44px;height:44px;display:flex;align-items:center;justify-content:center;margin-left:auto;border:0;border-radius:22px;background:rgba(248,248,248,.94);color:#222;box-shadow:0 1px 7px rgba(0,0,0,.2);font-size:19px;line-height:1;cursor:pointer;opacity:.58;touch-action:manipulation}
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-gear,#simple-caixin-loon-gear:active{opacity:1;transform:scale(.96)}
#simple-caixin-loon-menu{display:none;width:194px;margin-top:7px;padding:9px;border-radius:12px;background:rgba(250,250,250,.97);color:#222;box-shadow:0 4px 18px rgba(0,0,0,.24);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
#simple-caixin-loon-panel.sc-open #simple-caixin-loon-menu{display:block}.simple-caixin-loon-btn{display:block;width:100%;min-height:40px;margin:4px 0;padding:8px 10px;border:0;border-radius:8px;background:#ececec;color:inherit;font-size:13px;text-align:left;cursor:pointer;touch-action:manipulation}#simple-caixin-loon-note{padding:4px 3px 1px;font-size:10px;line-height:1.35;color:#777}
@media(prefers-color-scheme:dark){#simple-caixin-loon-gear,#simple-caixin-loon-menu{background:rgba(38,38,38,.95);color:#eee}.simple-caixin-loon-btn{background:#505050}#simple-caixin-loon-note{color:#aaa}}
`;

    var initialJson = JSON.stringify(state).replace(/</g, '\\u003c');
    var baseJson = JSON.stringify(baseState).replace(/</g, '\\u003c');
    var runtime = String.raw`
(function(){
'use strict';
if(window.__SIMPLE_CAIXIN_LOON_V41__)return;
window.__SIMPLE_CAIXIN_LOON_V41__=true;
var CONFIG_PATH=${JSON.stringify(CONFIG_PATH)};
var state=Object.assign({},${initialJson});
var baseState=Object.assign({},${baseJson});
var classMap={cleanLayout:'simple-caixin-clean-layout',hideAiVoice:'simple-caixin-hide-voice',hideComment:'simple-caixin-hide-comment',hideRelated:'simple-caixin-hide-related',hideWatermark:'simple-caixin-hide-watermark'};
var records={watermark:[],voice:[],comment:[],related:[]};
var shadowRoots=[];var observers=[];var scheduled=false;var panel=null;
function remember(el,bucket,props){if(!el||!el.style)return;var list=records[bucket];for(var i=0;i<list.length;i++)if(list[i].el===el)return;var old={};props.forEach(function(p){old[p]=[el.style.getPropertyValue(p),el.style.getPropertyPriority(p)]});list.push({el:el,old:old})}
function setImp(el,p,v){if(!el||!el.style)return;if(el.style.getPropertyValue(p)===v&&el.style.getPropertyPriority(p)==='important')return;el.style.setProperty(p,v,'important')}
function hideEl(el,bucket){if(!el||!el.style||el.id==='simple-caixin-loon-panel'||(el.closest&&el.closest('#simple-caixin-loon-panel')))return;remember(el,bucket,['display','visibility','opacity','pointer-events']);setImp(el,'display','none');setImp(el,'visibility','hidden');setImp(el,'opacity','0');setImp(el,'pointer-events','none')}
function restore(bucket){var list=records[bucket];while(list.length){var r=list.pop();if(!r.el||!r.el.style)continue;Object.keys(r.old).forEach(function(p){var o=r.old[p];if(o[0])r.el.style.setProperty(p,o[0],o[1]||'');else r.el.style.removeProperty(p)})}}
function roots(){var a=[document];for(var i=0;i<shadowRoots.length;i++)a.push(shadowRoots[i]);try{document.querySelectorAll('*').forEach(function(el){if(el.shadowRoot&&shadowRoots.indexOf(el.shadowRoot)<0)shadowRoots.push(el.shadowRoot)})}catch(_){}return a.concat(shadowRoots.filter(function(r,i,a){return a.indexOf(r)===i}))}
function deepQuery(selector){var out=[];roots().forEach(function(root){try{root.querySelectorAll(selector).forEach(function(el){if(out.indexOf(el)<0)out.push(el)})}catch(_){}});return out}
function hideSelector(selector,bucket){deepQuery(selector).forEach(function(el){hideEl(el,bucket)})}
function watermarkWords(text){text=String(text||'').replace(/\s+/g,'');return /财新网友|版权所有|翻版必究/.test(text)}
function safeTextWatermark(el){if(!el||!el.tagName||el.id==='simple-caixin-loon-panel'||(el.closest&&el.closest('#simple-caixin-loon-panel')))return false;var txt=String(el.textContent||'').replace(/\s+/g,'');if(!txt||txt.length>120||!watermarkWords(txt))return false;if(el.children&&el.children.length>4)return false;var s;try{s=getComputedStyle(el)}catch(_){return false}var op=parseFloat(s.opacity||'1');var overlay=/^(fixed|absolute|sticky)$/.test(s.position);var rotated=!!(s.transform&&s.transform!=='none');var inert=s.pointerEvents==='none';return overlay||rotated||inert||op<0.82}
function enforceWatermark(){if(!state.hideWatermark){restore('watermark');return}hideSelector('#cx-customer,#cx-customer *,[id*="watermark"],[class*="watermark"],[id*="water-mark"],[class*="water-mark"],[id*="shuiyin"],[class*="shuiyin"],.watermark,.water-mark,.cx-watermark,.cx-water-mark,.shuiyin,.cx-shuiyin','watermark');deepQuery('body *').forEach(function(el){if(safeTextWatermark(el))hideEl(el,'watermark')})}
function enforceFeature(on,sel,bucket){if(on)hideSelector(sel,bucket);else restore(bucket)}
function applyClasses(){var root=document.documentElement;if(!root)return;Object.keys(classMap).forEach(function(k){root.classList.toggle(classMap[k],!!state[k])})}
function label(name,on){var l={cleanLayout:['极简排版：关闭','极简排版：开启'],hideAiVoice:['语音：显示','语音：隐藏'],hideComment:['评论：显示','评论：隐藏'],hideRelated:['相关推荐：显示','相关推荐：隐藏'],hideWatermark:['水印：显示','水印：隐藏']};return l[name][on?1:0]}
function labels(){Object.keys(classMap).forEach(function(k){var b=document.querySelector('[data-sc-setting="'+k+'"]');if(b)b.textContent=label(k,!!state[k])})}
function send(values){var q=Object.keys(values).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(values[k])}).join('&');try{fetch(CONFIG_PATH+'?'+q+'&_='+Date.now(),{method:'GET',cache:'no-store',credentials:'same-origin'}).catch(function(){})}catch(_){}}
function save(){var v={};Object.keys(classMap).forEach(function(k){v[k]=state[k]?'1':'0'});send(v)}
function makeButton(name){var b=document.createElement('button');b.type='button';b.className='simple-caixin-loon-btn';b.setAttribute('data-sc-setting',name);b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();state[name]=!state[name];enforce();save()});return b}
function ensurePanel(){if(!state.showPanel||!document.body)return;panel=document.getElementById('simple-caixin-loon-panel');if(panel)return;panel=document.createElement('div');panel.id='simple-caixin-loon-panel';var g=document.createElement('button');g.id='simple-caixin-loon-gear';g.type='button';g.textContent='⚙️';g.setAttribute('aria-label','极简财新设置');var m=document.createElement('div');m.id='simple-caixin-loon-menu';['cleanLayout','hideAiVoice','hideComment','hideRelated','hideWatermark'].forEach(function(k){m.appendChild(makeButton(k))});var reset=document.createElement('button');reset.type='button';reset.className='simple-caixin-loon-btn';reset.textContent='恢复插件默认';reset.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();state=Object.assign({},baseState);enforce();send({reset:'1'})});m.appendChild(reset);var n=document.createElement('div');n.id='simple-caixin-loon-note';n.textContent='v4.1：已撤销会误删正文的广域覆盖层识别；仅清理明确水印节点、短文本水印、Shadow DOM 与 canvas 水印。';m.appendChild(n);panel.appendChild(g);panel.appendChild(m);document.body.appendChild(panel);g.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();panel.classList.toggle('sc-open')});panel.addEventListener('click',function(e){e.stopPropagation()});document.addEventListener('click',function(){if(panel)panel.classList.remove('sc-open')})}
function enforce(){scheduled=false;applyClasses();enforceWatermark();enforceFeature(state.hideAiVoice,'#cx-audio,.pc-aivoice,.pc-aivoice.trial,.vioce-box-cons','voice');enforceFeature(state.hideComment,'#cx-comment,.pc-comment,.comment,[class*="cx-comment"]','comment');enforceFeature(state.hideRelated,'#cx-promote,#cx-promotes,.cx-promote,.cx-promotes,.related-article,.relatarticle','related');ensurePanel();labels()}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(enforce,30)}
function observe(root){if(!window.MutationObserver||!root)return;for(var i=0;i<observers.length;i++)if(observers[i].root===root)return;var o=new MutationObserver(schedule);try{o.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});observers.push({root:root,observer:o})}catch(_){}}
try{if(window.Element&&Element.prototype.attachShadow){var originalAttachShadow=Element.prototype.attachShadow;Element.prototype.attachShadow=function(){var root=originalAttachShadow.apply(this,arguments);if(root&&shadowRoots.indexOf(root)<0){shadowRoots.push(root);observe(root);schedule()}return root}}}catch(_){}
function patchCanvasProto(proto){if(!proto||proto.__simpleCaixinWatermarkPatched)return;proto.__simpleCaixinWatermarkPatched=true;['fillText','strokeText'].forEach(function(name){var original=proto[name];if(typeof original!=='function')return;proto[name]=function(text){if(state.hideWatermark&&watermarkWords(text))return;return original.apply(this,arguments)}})}
try{patchCanvasProto(window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype)}catch(_){}
try{patchCanvasProto(window.OffscreenCanvasRenderingContext2D&&OffscreenCanvasRenderingContext2D.prototype)}catch(_){}
applyClasses();observe(document.documentElement);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enforce,{once:true});else enforce();var tick=0;var warm=setInterval(function(){enforce();tick++;if(tick>=20)clearInterval(warm)},500);
})();
`;
    return '<!-- simple-caixin-loon-v4.1 -->\n<style id="simple-caixin-loon-v41-style">' + css + '</style>\n<script id="simple-caixin-loon-v41-runtime">' + runtime.replace(/<\/script/gi, '<\\/script') + '</script>';
  }

  function injectHtml(url, body) {
    if (!body || typeof body !== 'string') return null;
    if (body.indexOf('simple-caixin-loon-v4.1') !== -1) return null;
    if (!/<html[\s>]|<head[\s>]|<body[\s>]/i.test(body)) return null;
    var article = isArticleLikeHtml(url, body), state = stateFor(article), baseState = baseStateFor(article);
    var prepared = addHtmlClasses(body, activeClasses(state)), payload = buildInjection(state, baseState);
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
  if (/\/ios\/article\/getArticleComments(?:\?|$)/i.test(url)) { var comments = cleanComments(body); return comments === null ? passThrough() : responseBody(comments); }
  if (/\/articlev5\/[^/]+\/[^/]+\.json(?:\?|$)/i.test(url)) { var related = cleanRelated(body); return related === null ? passThrough() : responseBody(related); }
  if (/\/api\/app-api\/auth\/newValidate(?:\?|$)/i.test(url)) return passThrough();
  if (/\.html?(?:\?|$)|\.shtml(?:\?|$)/i.test(url) || /<html[\s>]/i.test(body)) { var html = injectHtml(url, body); return html === null ? passThrough() : responseBody(html); }
  return passThrough();
})();
