/**
 * Preview HMR Bridge — postMessage protocol between parent window and preview iframe.
 *
 * The build loop injects a small script into the generated app's index.html that:
 * 1. Responds to kriptik:hmr-ping messages with kriptik:hmr-pong (HMR detection)
 * 2. Captures ALL runtime errors and forwards them to the parent window
 *
 * This allows the parent window to:
 * - Detect whether Vite HMR is handling file updates natively
 * - Capture errors from the USER'S app (not KripTik's runtime)
 *
 * ERROR CAPTURE FLOW:
 * 1. User's app throws error in preview iframe
 * 2. This injected script catches it via window.onerror + unhandledrejection
 * 3. Posts message to parent: { type: 'kriptik:runtime-error', error: {...} }
 * 4. Parent receives in preview pane -> useUserAppErrorsStore.addError()
 *
 * The injection script (added by build loop scaffold phase):
 */

export const HMR_BRIDGE_SCRIPT = `<script>
(function() {
  var kriptikErrorBuffer = [];
  var kriptikMaxBuffer = 50;
  
  function sendToParent(type, data) {
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: type, timestamp: Date.now(), data: data }, '*');
      }
    } catch(e) {}
  }
  
  function captureError(errorEvent) {
    var errorData = {
      message: errorEvent.message || 'Unknown error',
      filename: errorEvent.filename,
      lineno: errorEvent.lineno,
      colno: errorEvent.colno,
      stack: errorEvent.error ? (errorEvent.error.stack || '') : '',
      severity: 'error',
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    kriptikErrorBuffer.push(errorData);
    if (kriptikErrorBuffer.length > kriptikMaxBuffer) {
      kriptikErrorBuffer.shift();
    }
    
    sendToParent('kriptik:runtime-error', errorData);
    console.error('[KripTik Preview Error]', errorData.message, errorData.filename + ':' + errorData.lineno);
  }
  
  function capturePromiseRejection(event) {
    var reason = event.reason;
    var errorData = {
      message: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack ? reason.stack : '',
      filename: '',
      lineno: 0,
      colno: 0,
      severity: 'error',
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    kriptikErrorBuffer.push(errorData);
    if (kriptikErrorBuffer.length > kriptikMaxBuffer) {
      kriptikErrorBuffer.shift();
    }
    
    sendToParent('kriptik:runtime-error', errorData);
    console.error('[KripTik Preview Promise Rejection]', errorData.message);
  }
  
  function captureReactError(error, componentStack) {
    var errorData = {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : '',
      componentStack: componentStack || '',
      filename: '',
      lineno: 0,
      colno: 0,
      severity: 'fatal',
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    kriptikErrorBuffer.push(errorData);
    sendToParent('kriptik:runtime-error', errorData);
    console.error('[KripTik Preview React Error]', errorData.message);
  }
  
  window.addEventListener('error', captureError, true);
  window.addEventListener('unhandledrejection', capturePromiseRejection, true);
  
  window.__kriptikCaptureReactError = captureReactError;
  window.__kriptikGetErrorBuffer = function() { return kriptikErrorBuffer; };
  window.__kriptikClearErrorBuffer = function() { kriptikErrorBuffer = []; };
  
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'kriptik:hmr-ping') {
      var viteConnected = false;
      try {
        viteConnected = !!(window.__vite_plugin_react_preamble_installed__);
      } catch(err) {}
      e.source.postMessage({
        type: 'kriptik:hmr-pong',
        viteConnected: viteConnected,
        timestamp: e.data.timestamp,
        errorCount: kriptikErrorBuffer.length
      }, '*');
    }
    
    if (e.data && e.data.type === 'kriptik:get-errors') {
      e.source.postMessage({
        type: 'kriptik:errors-response',
        errors: kriptikErrorBuffer,
        timestamp: Date.now()
      }, '*');
    }
    
    if (e.data && e.data.type === 'kriptik:clear-errors') {
      kriptikErrorBuffer = [];
    }
  });
  
  sendToParent('kriptik:preview-ready', { url: window.location.href });
})();
</script>`;

/**
 * Inject the HMR bridge script into an HTML string's <head>.
 * Used by the build loop when generating the initial index.html scaffold.
 */
export function injectHmrBridge(html: string): string {
    // Insert before </head> if present, otherwise before </body>, otherwise append
    if (html.includes('</head>')) {
        return html.replace('</head>', `${HMR_BRIDGE_SCRIPT}\n</head>`);
    }
    if (html.includes('</body>')) {
        return html.replace('</body>', `${HMR_BRIDGE_SCRIPT}\n</body>`);
    }
    return html + HMR_BRIDGE_SCRIPT;
}
