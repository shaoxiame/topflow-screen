(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopFlowManagerConfirm = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var serial = 0;
  var colors = ['--tf-bg', '--tf-surface', '--tf-text', '--tf-muted', '--tf-line', '--tf-accent', '--tf-soft', '--tf-soft-text', '--tf-danger', '--tf-focus'];

  function create(root, sourcePanel) {
    var doc = root && root.document, pending = null, disposed = false;
    function ask(message) {
      // A second caller must not execute a second operation on one confirmation.
      if (disposed || pending || !doc || !doc.body || typeof doc.createElement !== 'function') return Promise.resolve(false);
      return new Promise(function (resolve) {
        var previousFocus = doc.activeElement, observer = null;
        var overlay = doc.createElement('div'), card = doc.createElement('div');
        var eyebrow = doc.createElement('span'), title = doc.createElement('h3'), description = doc.createElement('p');
        var actions = doc.createElement('div'), cancel = doc.createElement('button'), accept = doc.createElement('button');
        var id = 'tf-confirm-' + (++serial);
        overlay.className = 'tf-package-shell tf-confirm-overlay';
        card.className = 'tf-confirm-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', id + '-title'); card.setAttribute('aria-describedby', id + '-message');
        eyebrow.className = 'tf-confirm-eyebrow'; eyebrow.textContent = 'TopFlow 屏幕';
        title.className = 'tf-confirm-title'; title.id = id + '-title'; title.textContent = '确认操作';
        description.className = 'tf-confirm-message'; description.id = id + '-message'; description.textContent = String(message == null ? '' : message);
        actions.className = 'tf-confirm-actions';
        cancel.className = 'tf-confirm-cancel'; cancel.type = 'button'; cancel.textContent = '取消';
        accept.className = 'tf-confirm-accept'; accept.type = 'button'; accept.textContent = '确认';
        actions.appendChild(cancel); actions.appendChild(accept);
        card.appendChild(eyebrow); card.appendChild(title); card.appendChild(description); card.appendChild(actions); overlay.appendChild(card);
        function syncTheme() {
          var theme = sourcePanel && sourcePanel.getAttribute('data-tf-theme');
          overlay.setAttribute('data-tf-theme', theme === 'dark' ? 'dark' : 'light');
          if (!sourcePanel || typeof root.getComputedStyle !== 'function') return;
          var style;
          try { style = root.getComputedStyle(sourcePanel); } catch (_) { return; }
          if (!style || typeof style.getPropertyValue !== 'function') return;
          colors.forEach(function (name) {
            var value = String(style.getPropertyValue(name) || '').trim();
            if (value) overlay.style.setProperty(name, value); else overlay.style.removeProperty(name);
          });
        }
        function focus(element) { if (element && typeof element.focus === 'function') { try { element.focus({ preventScroll: true }); } catch (_) { element.focus(); } } }
        function finish(confirmed) {
          if (!pending || pending.overlay !== overlay) return;
          pending = null;
          if (observer) observer.disconnect();
          doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('focusin', onFocus, true);
          cancel.removeEventListener('click', onCancel); accept.removeEventListener('click', onAccept);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (previousFocus && doc.documentElement.contains(previousFocus)) focus(previousFocus);
          resolve(confirmed === true);
        }
        function onCancel() { finish(false); }
        function onAccept() { finish(true); }
        function onKey(event) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
          else if (event.key === 'Tab') {
            event.preventDefault(); event.stopPropagation();
            var active = doc.activeElement;
            focus(active === cancel ? accept : active === accept ? cancel : event.shiftKey ? accept : cancel);
          }
        }
        function onFocus(event) { if (pending && !card.contains(event.target)) focus(cancel); }
        pending = { overlay: overlay, finish: finish };
        syncTheme();
        if (sourcePanel && typeof root.MutationObserver === 'function') {
          observer = new root.MutationObserver(syncTheme);
          observer.observe(sourcePanel, { attributes: true, attributeFilter: ['data-tf-theme', 'class', 'style'] });
        }
        cancel.addEventListener('click', onCancel); accept.addEventListener('click', onAccept);
        doc.addEventListener('keydown', onKey, true); doc.addEventListener('focusin', onFocus, true);
        // UFI uses a container-query root; mounting there would constrain fixed positioning.
        doc.body.appendChild(overlay); focus(cancel);
      });
    }
    function dispose() { if (disposed) return; disposed = true; if (pending) pending.finish(false); }
    return { ask: ask, dispose: dispose };
  }
  return { create: create };
});
