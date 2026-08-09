/*
 * 极简财新 · iOS App / Loon 版
 *
 * 已按财新 iOS App 的实际请求适配：
 *   - 正文 WebView：mappsv5.caixin.com/articlev5/.../*.html
 *   - 评论接口：  mapiv5.caixin.com/ios/article/getArticleComments
 *   - 相关推荐：  mappsv5.caixin.com/articlev5/.../*.json
 *
 * [Script]
 * http-response ^https?:\/\/mappsv5\.caixin\.com\/articlev5\/[^\/]+\/[^\/]+\.html(?:\?.*)?$ script-path=Simple-Caixin-Loon.js, requires-body=true, timeout=10, tag=Caixin-Reader
 * http-response ^https?:\/\/mapiv5\.caixin\.com\/ios\/article\/getArticleComments(?:\?.*)?$ script-path=Simple-Caixin-Loon.js, requires-body=true, timeout=10, argument="hideComments=true", tag=Caixin-Comments
 * http-response ^https?:\/\/mappsv5\.caixin\.com\/articlev5\/[^\/]+\/[^\/]+\.json(?:\?.*)?$ script-path=Simple-Caixin-Loon.js, requires-body=true, timeout=10, argument="hideRelated=true", tag=Caixin-Related
 *
 * [MITM]
 * hostname = mappsv5.caixin.com, mapiv5.caixin.com
 *
 * 可选参数（分别写在相应的 [Script] 规则中）：
 *   hideAudio=false       默认 true，隐藏文章页 AI/音频模块
 *   hideComments=true     默认 false，隐藏 App 原生评论列表
 *   hideRelated=true      默认 false，隐藏文章相关推荐
 *
 * 仅做阅读界面精简；不修改订阅、登录、付费或正文内容。
 * Based on Simple-Caixin by EAK8T6Z (MPL-2.0).
 */

(function () {
  'use strict';

  var url = (typeof $request !== 'undefined' && $request.url) ? $request.url : '';
  var body = (typeof $response !== 'undefined' && typeof $response.body === 'string') ? $response.body : '';

  function boolArgument(name, fallback) {
    if (typeof $argument === 'object' && $argument !== null &&
        Object.prototype.hasOwnProperty.call($argument, name)) {
      var objectValue = $argument[name];
      if (typeof objectValue === 'boolean') return objectValue;
      return !/^(false|0|no|off)$/i.test(String(objectValue));
    }

    var source = typeof $argument === 'string' ? $argument : '';
    var escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var match = new RegExp('(?:^|[,&\\s])' + escapedName + '=([^,&\\s]+)', 'i').exec(source);

    if (!match) return fallback;

    return !/^(false|0|no|off)$/i.test(match[1]);
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  function passThrough() {
    $done({});
  }

  function emptyComments() {
    if (!boolArgument('hideComments', false) || !body) {
      passThrough();
      return;
    }

    try {
      var comments = JSON.parse(body);
      if (comments && comments.data) {
        if (isArray(comments.data.new)) comments.data.new = [];
        if (Object.prototype.hasOwnProperty.call(comments.data, 'comment_count')) comments.data.comment_count = '0';
      }
      if (comments && Object.prototype.hasOwnProperty.call(comments, 'comment_count')) comments.comment_count = '0';
      $done({ body: JSON.stringify(comments) });
    } catch (error) {
      passThrough();
    }
  }

  function emptyRelated() {
    if (!boolArgument('hideRelated', false) || !body) {
      passThrough();
      return;
    }

    try {
      var articleData = JSON.parse(body);
      if (articleData && articleData.data && isArray(articleData.data.relatarticle)) {
        articleData.data.relatarticle = [];
      }
      $done({ body: JSON.stringify(articleData) });
    } catch (error) {
      passThrough();
    }
  }

  if (/^https?:\/\/mapiv5\.caixin\.com\/ios\/article\/getArticleComments(?:\?.*)?$/i.test(url)) {
    emptyComments();
    return;
  }

  if (/^https?:\/\/mappsv5\.caixin\.com\/articlev5\/[^/]+\/[^/]+\.json(?:\?.*)?$/i.test(url)) {
    emptyRelated();
    return;
  }

  if (!/^https?:\/\/mappsv5\.caixin\.com\/articlev5\/[^/]+\/[^/]+\.html(?:\?.*)?$/i.test(url) ||
      !/<!doctype\s+html|<html[\s>]/i.test(body)) {
    passThrough();
    return;
  }

  // 防止同一个响应经过多个同类规则时重复注入。
  if (body.indexOf('id="simple-caixin-ios-loon-style"') !== -1) {
    passThrough();
    return;
  }

  var hideAudioByDefault = boolArgument('hideAudio', true);
  var baseCSS = [
    '/* 极简财新：iOS App 正文 WebView */',
    'html, body { max-width: 100% !important; overflow-x: hidden !important; }',
    '#cx-customer, #cx-main, .cx-app-content-main, #cx-cons, .cx-cons { background-image: none !important; }',
    '#cx-main, .cx-app-content-main { width: 100% !important; max-width: none !important; box-sizing: border-box !important; padding: 0 16px 32px !important; }',
    '#cx-cons, .cx-cons { width: 100% !important; max-width: none !important; box-sizing: border-box !important; }',
    '#cx-cons img, .cx-cons img, #cx-main img, .cx-app-content-main img { max-width: 100% !important; height: auto !important; }',
    '/* 推广卡片与正文末尾推广链接 */',
    '#cx-promote, #cx-promotes, .cx-promote, .cx-promotes, .cx-app-promote, .cx-app-promotes { display: none !important; }'
  ];

  if (hideAudioByDefault) {
    baseCSS.push('#cx-audio, .cx-audio, .pc-aivoice, .pc-aivoice.trial { display: none !important; }');
  }

  var pageRuntime = [
    '(function () {',
    '  "use strict";',
    '  if (window.__simpleCaixinIOSLoonLoaded) return;',
    '  window.__simpleCaixinIOSLoonLoaded = true;',
    '  var storageKey = "simple-caixin-ios-loon:hideAudio";',
    '  var defaultValue = ' + (hideAudioByDefault ? 'true' : 'false') + ';',
    '  function hideAudio() {',
    '    try {',
    '      var value = window.localStorage.getItem(storageKey);',
    '      return value === null ? defaultValue : value === "true";',
    '    } catch (error) {',
    '      return defaultValue;',
    '    }',
    '  }',
    '  function setHideAudio(value) {',
    '    try { window.localStorage.setItem(storageKey, String(value)); } catch (error) {}',
    '  }',
    '  function applyAudioSetting() {',
    '    var style = document.getElementById("simple-caixin-ios-loon-audio-style");',
    '    if (!style) {',
    '      style = document.createElement("style");',
    '      style.id = "simple-caixin-ios-loon-audio-style";',
    '      (document.head || document.documentElement).appendChild(style);',
    '    }',
    '    style.textContent = "#cx-audio, .cx-audio, .pc-aivoice, .pc-aivoice.trial { display: " + (hideAudio() ? "none" : "block") + " !important; }";',
    '  }',
    '  function addAudioButton() {',
    '    if (!document.body || document.getElementById("simple-caixin-ios-loon-audio-button")) return;',
    '    var button = document.createElement("button");',
    '    button.id = "simple-caixin-ios-loon-audio-button";',
    '    button.type = "button";',
    '    button.setAttribute("aria-label", "切换文章音频显示");',
    '    button.style.cssText = "position:fixed;right:12px;bottom:24px;z-index:2147483647;padding:6px 9px;border:1px solid rgba(0,0,0,.25);border-radius:14px;background:rgba(255,255,255,.9);color:#333;font-size:12px;line-height:16px;box-shadow:0 1px 4px rgba(0,0,0,.18);touch-action:manipulation;";',
    '    function label() { button.textContent = "音频：" + (hideAudio() ? "隐藏" : "显示"); }',
    '    button.addEventListener("click", function (event) {',
    '      event.preventDefault();',
    '      event.stopPropagation();',
    '      setHideAudio(!hideAudio());',
    '      applyAudioSetting();',
    '      label();',
    '    });',
    '    label();',
    '    document.body.appendChild(button);',
    '  }',
    '  function start() { applyAudioSetting(); addAudioButton(); }',
    '  if (document.readyState === "loading") {',
    '    document.addEventListener("DOMContentLoaded", start);',
    '  } else {',
    '    start();',
    '  }',
    '}());'
  ].join('\n');

  var styleTag = '<style id="simple-caixin-ios-loon-style">' + baseCSS.join('\n') + '</style>';
  var runtimeTag = '<script id="simple-caixin-ios-loon-runtime">' + pageRuntime.replace(/<\/script/gi, '<\\/script') + '</script>';

  if (/<\/head>/i.test(body)) {
    body = body.replace(/<\/head>/i, styleTag + '</head>');
  } else {
    body = styleTag + body;
  }

  if (/<\/body>/i.test(body)) {
    body = body.replace(/<\/body>/i, runtimeTag + '</body>');
  } else if (/<\/html>/i.test(body)) {
    body = body.replace(/<\/html>/i, runtimeTag + '</html>');
  } else {
    body += runtimeTag;
  }

  // 允许内联 CSS/JS 运行，并让 Loon 根据新 body 重算长度和编码。
  var originalHeaders = $response.headers || {};
  var outputHeaders = {};
  var excludedHeaders = /^(content-security-policy|content-security-policy-report-only|x-content-security-policy|x-webkit-csp|content-length|content-encoding)$/i;
  var headerName;

  for (headerName in originalHeaders) {
    if (Object.prototype.hasOwnProperty.call(originalHeaders, headerName) && !excludedHeaders.test(headerName)) {
      outputHeaders[headerName] = originalHeaders[headerName];
    }
  }

  $done({ body: body, headers: outputHeaders });
}());
