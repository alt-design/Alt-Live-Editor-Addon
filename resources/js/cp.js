(function () {
    'use strict';

    if (typeof Statamic === 'undefined' || !Statamic.$events) {
        console.warn('[alt-live-editor] Statamic.$events not available — addon disabled');
        return;
    }

    var settings = (Statamic.$config && Statamic.$config.get('altLiveEditor')) || {};
    var DEBUG = !!settings.debug;

    function log() {
        if (!DEBUG) return;
        console.log.apply(console, ['[alt-live-editor]'].concat(Array.prototype.slice.call(arguments)));
    }

    function warn() {
        console.warn.apply(console, ['[alt-live-editor]'].concat(Array.prototype.slice.call(arguments)));
    }

    log('cp.js loaded');

    // The control panel can be mounted on a custom route (statamic.cp.route), so never
    // hardcode /cp. cpUrl is absolute; reduce it to a path prefix.
    var CP_ROOT = (function () {
        try {
            var cpUrl = Statamic.$config.get('cpUrl');
            if (cpUrl) return new URL(cpUrl, window.location.origin).pathname.replace(/\/$/, '');
            var cpRoot = Statamic.$config.get('cpRoot');
            if (cpRoot) return String(cpRoot).replace(/\/$/, '');
        } catch (e) {}
        return '/cp';
    })();

    function cpUrl(path) {
        return CP_ROOT + '/' + String(path).replace(/^\//, '');
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    // Messages from the preview drive the publish form and can trigger a save, so only
    // accept them from a frame this document actually hosts. An identity check on
    // event.source beats comparing origin strings: it can't be spoofed, and it still
    // works when a multi-site setup serves the preview from a different domain to the CP.
    function isTrusted(event) {
        if (!event.source || event.source === window) return false;
        var frames = document.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i++) {
            if (frames[i].contentWindow === event.source) return true;
        }
        return false;
    }

    // Never post back with '*' — that would leak entry content to whatever the frame
    // navigated to. Resolve the frame's real origin from its src.
    function originFor(targetWindow) {
        var frames = document.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i++) {
            if (frames[i].contentWindow !== targetWindow) continue;
            try {
                return new URL(frames[i].src, window.location.href).origin;
            } catch (e) {
                return window.location.origin;
            }
        }
        return window.location.origin;
    }

    function reply(targetWindow, payload) {
        payload.source = 'alt-live-editor-response';
        targetWindow.postMessage(payload, originFor(targetWindow));
    }

    var containers = new Map();
    if (DEBUG) window.__altLiveEditorContainers = containers;

    // Replace Live Preview's "Pop out" button so it toggles the publish sidebar visibility instead of
    // opening a new window (which would lose access to the asset picker, term picker, etc. that all
    // depend on the parent CP window's Vue state).
    function patchPopOutButton() {
        var header = document.querySelector('.live-preview-header');
        if (!header) return;
        var btn = Array.from(header.querySelectorAll('button')).find(function (b) { return /pop\s*out|pop\s*in/i.test(b.textContent.trim()); });
        if (!btn || btn.__altSidebarPatched) return;
        btn.__altSidebarPatched = true;

        // Set initial label. The "Pop out" text is in a deeply-nested text node, and Statamic also
        // renders a sibling "Pop in" button when popped out — we only ever show one Pop button, so
        // walk the entire subtree and replace any text matching "Pop out" / "Pop in".
        function repaint() {
            var hidden = document.body.dataset.altSidebarHidden === '1';
            var newLabel = hidden ? 'Show sidebar' : 'Hide sidebar';
            var walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null, false);
            var node, replaced = false;
            while ((node = walker.nextNode())) {
                if (/pop\s*(out|in)|hide sidebar|show sidebar/i.test(node.nodeValue)) {
                    node.nodeValue = newLabel;
                    replaced = true;
                }
            }
            if (!replaced) btn.appendChild(document.createTextNode(newLabel));
            btn.setAttribute('title', newLabel);
        }
        repaint();

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            toggleSidebarHidden();
        }, true);
    }

    // Hide via off-viewport positioning (not display:none) — keeps field layout intact so
    // our JS-triggered pickers (Browse Assets button click, Vue method calls) still work.
    function toggleSidebarHidden() {
        var editor = document.querySelector('.live-preview-editor');
        if (!editor) return;
        var hidden = document.body.dataset.altSidebarHidden === '1';
        if (hidden) {
            // Restore
            editor.style.position = '';
            editor.style.left = '';
            editor.style.top = '';
            editor.style.opacity = '';
            editor.style.pointerEvents = '';
            editor.style.width = editor.dataset.altOriginalWidth || '';
            delete editor.dataset.altOriginalWidth;
            document.body.dataset.altSidebarHidden = '0';
        } else {
            // Stash original width, hide off-screen but keep flow-style layout
            editor.dataset.altOriginalWidth = editor.style.width || '';
            editor.style.position = 'absolute';
            editor.style.left = '-100vw';
            editor.style.top = '0';
            editor.style.opacity = '0';
            editor.style.pointerEvents = 'none';
            // Don't blank width — keeps internal field widths/computed boxes correct so pickers can target them
            document.body.dataset.altSidebarHidden = '1';
        }
        // Repaint the button (find it again since DOM may have remounted)
        var header = document.querySelector('.live-preview-header');
        var btn = header && Array.from(header.querySelectorAll('button')).find(function (b) { return b.__altSidebarPatched; });
        if (btn) {
            var newLabel = !hidden ? 'Show sidebar' : 'Hide sidebar';
            var walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null, false);
            var node;
            while ((node = walker.nextNode())) {
                if (/pop\s*(out|in)|hide sidebar|show sidebar/i.test(node.nodeValue)) {
                    node.nodeValue = newLabel;
                    break;
                }
            }
            btn.setAttribute('title', newLabel);
        }
        try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }

    // (withSidebarVisible removed — the position:absolute hide keeps child layout intact, so the
    // picker's JS-driven trigger click works fine without un-hiding the sidebar visually.)

    // Live Preview portal mounts/unmounts as user opens/closes it. Watch the DOM and patch the button each time.
    var popOutObserver = new MutationObserver(function () { patchPopOutButton(); });
    popOutObserver.observe(document.body, { childList: true, subtree: true });

    // Recovery: catch the "Failed to construct 'URL': Invalid URL" promise rejection from Statamic's
    // updateIframeContents (happens when the live-preview POST returns an empty url, usually mid-picker
    // state). When detected, schedule a hard iframe reload so the user still sees the change.
    window.addEventListener('unhandledrejection', function (event) {
        var msg = event.reason && (event.reason.message || String(event.reason));
        if (msg && /Failed to construct 'URL'/.test(msg)) {
            log('caught Statamic URL crash — scheduling iframe hard reload');
            event.preventDefault();
            setTimeout(function () {
                try {
                    var iframe = document.querySelector('iframe.responsive, iframe.device, .live-preview-main iframe, iframe#live-preview-iframe, .live-preview iframe');
                    if (iframe && iframe.contentWindow) iframe.contentWindow.location.reload();
                } catch (e) {}
            }, 1200);
        }
    });

    Statamic.$events.$on('publish-container-created', function (payload) {
        if (payload && payload.name) {
            // Wrap setFieldValue so OUR mutations also fire the live-preview refresh.
            // Skip while a picker stack is open — Statamic's selector calls this via inject
            // and firing mid-flow races Statamic's own debounced update (causes empty url → URL crash).
            if (typeof payload.setFieldValue === 'function' && !payload.__altWrappedSetFieldValue) {
                var origSetFieldValue = payload.setFieldValue;
                payload.setFieldValue = function (path, value) {
                    var result = origSetFieldValue.apply(this, arguments);
                    if (!document.querySelector('.stack-content')) {
                        try { window.Statamic.$events.$emit('live-preview.' + payload.name + '.refresh'); } catch (e) {}
                    }
                    return result;
                };
                payload.__altWrappedSetFieldValue = true;
            }

            // Fallback: also watch the values ref directly. Statamic's native pickers (Asset selector,
            // Relationship selector) hold their own setFieldValue reference captured before we wrapped it,
            // so the wrap above won't fire for them.
            //
            // CRITICAL: skip our own refresh when a picker stack is open. Statamic's selector
            // (Selector-CoqEMzgH.js → assetsSelected → loadAssets) triggers a reactive set on values that
            // fires this watcher BEFORE Statamic's own debounced update has settled. Emitting our refresh
            // mid-flow makes Statamic POST partial values to the preview endpoint, get back an empty URL,
            // and crash updateIframeContents with "Failed to construct 'URL': Invalid URL". The
            // MutationObserver in onPickerClose handles refresh after the picker closes anyway.
            try {
                if (window.Vue && window.Vue.watch && payload.values && !payload.__altValueWatch) {
                    var lastEmit = 0;
                    window.Vue.watch(
                        function () { return payload.values && payload.values.value; },
                        function () {
                            if (document.querySelector('.stack-content')) return; // picker open — let it close first
                            var now = Date.now();
                            if (now - lastEmit < 150) return;
                            lastEmit = now;
                            try { window.Statamic.$events.$emit('live-preview.' + payload.name + '.refresh'); } catch (e) {}
                        },
                        { deep: true, flush: 'post' }
                    );
                    payload.__altValueWatch = true;
                }
            } catch (e) { warn('values watch setup failed', e); }

            containers.set(payload.name, payload);
            log('container captured:', payload.name, 'setFieldValue:', typeof payload.setFieldValue);
        }
    });

    Statamic.$events.$on('publish-container-destroyed', function (payload) {
        if (payload && payload.name) {
            containers.delete(payload.name);
        }
    });

    function unwrapRef(maybeRef) {
        if (maybeRef == null) return maybeRef;
        if (typeof maybeRef === 'object' && '__v_isRef' in maybeRef) return maybeRef.value;
        if (typeof maybeRef === 'object' && 'value' in maybeRef && Object.keys(maybeRef).length === 1) return maybeRef.value;
        return maybeRef;
    }

    function findRowPath(values, rowId, prefix) {
        if (!values || typeof values !== 'object') return null;
        var keys = Array.isArray(values) ? values.map(function (_, i) { return i; }) : Object.keys(values);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var v = values[key];
            if (v && typeof v === 'object') {
                if (v._id === rowId || v.id === rowId) {
                    return prefix + key;
                }
                var inner = findRowPath(v, rowId, prefix + key + '.');
                if (inner) return inner;
            }
        }
        return null;
    }

    function getByPath(obj, path) {
        if (!path) return obj;
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length; i++) {
            if (current == null) return undefined;
            current = current[parts[i]];
        }
        return current;
    }

    function resolveFieldPath(ctx, handle, rowId) {
        if (!rowId) return handle;
        var values = unwrapRef(ctx.values);
        var rowPath = findRowPath(values, rowId, '');
        return rowPath ? rowPath + '.' + handle : null;
    }

    // setFieldValue mutates via data_set, which doesn't always trigger the live-preview deep watcher
    // (especially for array splice or nested object changes). Fire the explicit refresh event Statamic's
    // own components use (see relationship/Item.vue and LivePreview.vue:299).
    function refreshLivePreview(ctx) {
        try {
            if (window.Statamic && window.Statamic.$events && ctx && ctx.name) {
                window.Statamic.$events.$emit('live-preview.' + ctx.name + '.refresh');
            }
        } catch (e) {}
    }

    function setFieldValueAndRefresh(ctx, path, value) {
        ctx.setFieldValue(path, value);
        refreshLivePreview(ctx);
    }

    function applyScalar(handle, value, rowId) {
        containers.forEach(function (ctx) {
            try {
                var path = resolveFieldPath(ctx, handle, rowId);
                if (path) setFieldValueAndRefresh(ctx, path, value);
                else warn('rowId not found', rowId);
            } catch (err) {
                warn('setFieldValue failed', handle, err);
            }
        });
    }

    // Wait for the open picker stack to close, then run the callback. Uses MutationObserver
    // instead of polling so we never race Statamic's debounced live-preview update.
    function onPickerClose(callback) {
        var openStack = document.querySelector('.stack-content');
        if (!openStack) { callback(); return; }
        var observer = new MutationObserver(function () {
            if (!document.querySelector('.stack-content')) {
                observer.disconnect();
                // Defer one tick so Statamic's confirm handler can flush its setFieldValue before we run.
                setTimeout(callback, 50);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Safety timeout — disconnect after 60s in case the stack never closes.
        setTimeout(function () { observer.disconnect(); }, 60000);
    }

    function reloadIframeHard() {
        var iframe = document.querySelector('iframe.responsive, iframe.device, .live-preview-main iframe, iframe[id="live-preview-iframe"]');
        if (iframe && iframe.contentWindow) {
            try { iframe.contentWindow.location.reload(); log('hard-reloaded live-preview iframe'); }
            catch (e) { warn('hard reload failed', e); }
        }
    }

    function startReplacePoll(ctx, path, originalSnapshot) {
        // Wait for the picker to close, then check if value changed; if so, perform replace-UX slicing
        // (when picker ADDED rather than replaced) and trigger a refresh + hard reload fallback.
        var origJson = JSON.stringify(originalSnapshot);
        onPickerClose(function () {
            try {
                var current = getByPath(unwrapRef(ctx.values), path);
                var currentJson = JSON.stringify(current);
                if (currentJson === origJson) return; // user cancelled

                var snap = JSON.parse(origJson);
                if (Array.isArray(current) && Array.isArray(snap) && current.length > snap.length) {
                    var added = current.filter(function (item) { return snap.indexOf(item) === -1; });
                    if (added.length > 0) {
                        log('auto-replace at', path, 'keeping only newest:', added);
                        setFieldValueAndRefresh(ctx, path, added);
                        // Nuclear-option iframe reload as last resort if Statamic's update flow stalls.
                        setTimeout(reloadIframeHard, 1500);
                        return;
                    }
                }

                log('picker value changed at', path, '— refreshing preview');
                refreshLivePreview(ctx);
                setTimeout(reloadIframeHard, 1500);
            } catch (e) { warn('picker-close handler error', e); }
        });
    }

    // Statamic 6 prefixes field ids with the publish container name ("field_base_<path>"); earlier
    // versions used "field_<path>". Try the container-prefixed id first, then the bare one.
    function fieldDomIds(ctx, path) {
        var suffix = path.replaceAll('.', '_');
        var ids = [];
        if (ctx && ctx.name) ids.push('field_' + ctx.name + '_' + suffix);
        ids.push('field_' + suffix);
        return ids;
    }

    // Asset and some other fieldtypes don't put the id on their wrapper, so fall back to the
    // <label for="..."> and walk up to the fieldtype element.
    function findFieldWrapper(ctx, path) {
        var ids = fieldDomIds(ctx, path);
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) return el;
            var label = document.querySelector('label[for="' + ids[i] + '"]');
            if (label) return label.closest('[class*="-fieldtype"]') || label.closest('.form-group') || label.parentElement;
        }
        return null;
    }

    function openNativeFieldPicker(handle, rowId, options) {
        log('openNativeFieldPicker', { handle: handle, rowId: rowId, containerCount: containers.size });
        options = options || {};

        // Resolve full dot-path
        var path = null;
        var sample = Array.from(containers.values())[0];
        if (sample) path = resolveFieldPath(sample, handle, rowId);
        if (!path) {
            warn('could not resolve field path for', handle, rowId, '— containers:', containers.size);
            return;
        }

        // Snapshot current value before opening picker; if user adds items, we'll auto-slice to keep only the additions (= replacement UX)
        if (options.autoReplace && sample) {
            var snap = getByPath(unwrapRef(sample.values), path);
            if (Array.isArray(snap)) {
                // Swap mode: if "Maximum items selected" is shown for this field, pop the last item
                // so the native Link/Browse button reappears. The polling will then capture the picked item.
                // This matches the user intent of "edit selection" — they want to replace, not add.
                var preWrapper = findFieldWrapper(sample, path);
                var atMax = preWrapper && /Maximum items selected/i.test(preWrapper.textContent || '');
                // Only swap-trim multi-item fields (e.g. entries with max=3). Trimming a single-asset field
                // (max_files=1) to an empty array sends an invalid value to the live-preview endpoint and
                // breaks Statamic's URL construction. For single-asset fields, Statamic's native picker
                // already does single-select replace — we just need to detect the close and refresh.
                if (atMax && snap.length > 1) {
                    var trimmed = snap.slice(0, -1);
                    try { setFieldValueAndRefresh(sample, path, trimmed); } catch (e) { warn('swap pre-trim failed', e); }
                    options._swapTrimDelay = 600;
                    // No polling needed — Statamic's natural flow will append the picked item.
                } else {
                    startReplacePoll(sample, path, snap.slice());
                }
            }
        }

        var id = fieldDomIds(sample, path)[0];
        var wrapper = findFieldWrapper(sample, path);
        if (!wrapper) {
            warn('field DOM not found for #' + id);
            return;
        }

        // Use Statamic's reveal API to walk up + expand collapsed ancestor sets + scroll
        if (window.Statamic && window.Statamic.$reveal && window.Statamic.$reveal.element) {
            window.Statamic.$reveal.element(wrapper);
        } else {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Highlight the field briefly so the user knows where it is
        var orig = wrapper.style.boxShadow;
        wrapper.style.transition = 'box-shadow 200ms';
        wrapper.style.boxShadow = '0 0 0 3px rgba(138, 21, 56, 0.5)';
        setTimeout(function () { wrapper.style.boxShadow = orig; }, 2000);

        // Click the appropriate native trigger based on fieldtype
        var triggerDelay = options._swapTrimDelay || 200;
        requestAnimationFrame(function () {
            setTimeout(function () { triggerNativePicker(wrapper); }, triggerDelay);
        });
    }

    function callVueMethod(el, methodNames) {
        // Walk up via __vueParentComponent looking for an instance with any of the methods
        var cur = el;
        var names = Array.isArray(methodNames) ? methodNames : [methodNames];
        for (var d = 0; d < 30 && cur; d++) {
            var vue = cur.__vueParentComponent;
            if (vue) {
                for (var i = 0; i < names.length; i++) {
                    var name = names[i];
                    // Try exposed (defineExpose)
                    if (vue.exposed && typeof vue.exposed[name] === 'function') {
                        try { vue.exposed[name](); return true; } catch (e) { warn('vue method threw', name, e); }
                    }
                    // Try setup context
                    if (vue.ctx && typeof vue.ctx[name] === 'function') {
                        try { vue.ctx[name](); return true; } catch (e) { warn('vue ctx method threw', name, e); }
                    }
                    // Try refs (input ref's method)
                    if (vue.refs) {
                        for (var k in vue.refs) {
                            var ref = vue.refs[k];
                            if (ref && ref.exposed && typeof ref.exposed[name] === 'function') {
                                try { ref.exposed[name](); return true; } catch (e) {}
                            }
                            if (ref && typeof ref[name] === 'function') {
                                try { ref[name](); return true; } catch (e) {}
                            }
                        }
                    }
                }
                cur = vue.parent ? vue.parent.vnode?.el : cur.parentElement;
            } else {
                cur = cur.parentElement;
            }
        }
        return false;
    }

    function triggerNativePicker(wrapper) {
        // Assets fieldtype — try Vue method first, fall back to button click
        if (wrapper.matches('.assets-fieldtype')) {
            if (callVueMethod(wrapper, ['openSelector', 'showSelector'])) return;
            var assetBtn = wrapper.querySelector('[data-asset-picker] button, [data-asset-browser] button');
            if (assetBtn) { assetBtn.click(); return; }
        }
        // Relationship fieldtypes — entries / users / taxonomy / nav / sites
        if (wrapper.matches('.entries-fieldtype, .users-fieldtype, .taxonomy-fieldtype, .navs-fieldtype, .sites-fieldtype, .form-fieldtype, [class*="-fieldtype"]')) {
            if (callVueMethod(wrapper, ['linkExistingItem', 'openSelector'])) return;
            // Fallback: match by button text — Statamic v6 uses "Link Entry"/"Link Term"/"Link Existing"
            var allButtons = wrapper.querySelectorAll('button');
            for (var i = 0; i < allButtons.length; i++) {
                var t = (allButtons[i].textContent || '').trim().toLowerCase();
                if (t === 'link entry' || t === 'link term' || t === 'link existing' || t === 'add' || t === 'add new' || t === 'select') { allButtons[i].click(); return; }
            }
        }
        // Tags fieldtype
        if (wrapper.matches('.tags-fieldtype')) {
            var tagInput = wrapper.querySelector('input');
            if (tagInput) { tagInput.focus(); return; }
        }
    }

    function getCsrfToken() {
        var meta = document.head.querySelector('meta[name="csrf-token"]');
        return meta ? meta.content : (window.Statamic && window.Statamic.$config ? window.Statamic.$config.get('csrfToken') : '');
    }

    function parseBardHtml(html) {
        return fetch(cpUrl('alt-live-editor/parse-bard'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({ html: html || '' }),
        }).then(function (r) { return r.json(); }).then(function (j) { return j.nodes || []; });
    }

    function applyBardEdit(handle, nodeIndex, value, rowId) {
        // Parse the edited HTML on the server (preserves formatting), then splice into the Bard JSON
        parseBardHtml(value).then(function (parsedNodes) {
            containers.forEach(function (ctx) {
                try {
                    var path = resolveFieldPath(ctx, handle, rowId);
                    if (!path) {
                        warn('bard rowId not found', rowId);
                        return;
                    }

                    var values = unwrapRef(ctx.values);
                    var current = getByPath(values, path);

                    if (!Array.isArray(current)) {
                        warn('bard value is not an array at path', path);
                        return;
                    }

                    var copy = current.map(function (n) { return JSON.parse(JSON.stringify(n)); });

                    // Walk to the Nth non-set node and identify its array index
                    var counter = 0;
                    var targetArrayIndex = -1;
                    for (var i = 0; i < copy.length; i++) {
                        if (copy[i] && copy[i].type === 'set') continue;
                        if (counter === nodeIndex) {
                            targetArrayIndex = i;
                            break;
                        }
                        counter++;
                    }

                    if (targetArrayIndex === -1) {
                        warn('could not locate target bard node', nodeIndex);
                        return;
                    }

                    var replacement = parsedNodes.length > 0
                        ? parsedNodes
                        : [{ type: copy[targetArrayIndex].type || 'paragraph' }];

                    copy.splice.apply(copy, [targetArrayIndex, 1].concat(replacement));

                    setFieldValueAndRefresh(ctx, path, copy);
                } catch (err) {
                    warn('bard update failed', handle, err);
                }
            });
        }).catch(function (err) {
            warn('parse-bard request failed', err);
        });
    }

    function fetchSetsConfig(blueprint, field, requestId, iframeWindow) {
        fetch(cpUrl('alt-live-editor/sets-config'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({ blueprint: blueprint, field: field }),
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
                reply(iframeWindow, {
                    requestId: requestId,
                    sets: res.j.sets || [],
                    row_id_handle: res.j.row_id_handle || 'id',
                    error: res.ok ? null : (res.j.error || 'HTTP error'),
                }, '*');
            })
            .catch(function (err) {
                reply(iframeWindow, {
                    requestId: requestId,
                    sets: [],
                    error: err.message,
                }, '*');
            });
    }

    // Settings panel — lives in parent CP window so it survives iframe reloads triggered by each change.
    function openSettingsPanel(blueprint, field, rowId, setType) {
        var existing = document.getElementById('alt-row-settings-panel');
        if (existing) existing.remove();

        var panel = document.createElement('div');
        panel.id = 'alt-row-settings-panel';
        panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:min(380px,92vw);background:#fff;border-left:1px solid #e5e7eb;box-shadow:-10px 0 30px rgba(0,0,0,.18);z-index:2147483647;display:flex;flex-direction:column;font-family:-apple-system,Segoe UI,sans-serif;transform:translateX(100%);transition:transform 220ms ease;';

        var title = setType ? setType.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Row';
        panel.innerHTML =
            '<div style="padding:18px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#8a1538,#5d0e26);color:#fff;">' +
                '<div>' +
                    '<div style="font:600 11px/1 -apple-system,sans-serif;letter-spacing:.15em;text-transform:uppercase;opacity:.7">Section settings</div>' +
                    '<div style="font:600 16px/1.2 -apple-system,sans-serif;margin-top:4px">' + esc(title) + '</div>' +
                '</div>' +
                '<button id="alt-row-settings-close" type="button" style="border:0;background:rgba(255,255,255,.12);color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:18px;line-height:1;width:32px;height:32px">×</button>' +
            '</div>' +
            '<div id="alt-row-settings-body" style="flex:1;overflow:auto;padding:18px 20px;background:#fafafa">' +
                '<div style="text-align:center;padding:40px 0;color:#888;font-size:13px">Loading options…</div>' +
            '</div>';

        document.body.appendChild(panel);
        requestAnimationFrame(function () { panel.style.transform = 'translateX(0)'; });

        function closePanel() {
            panel.style.transform = 'translateX(100%)';
            setTimeout(function () { panel.remove(); }, 220);
        }
        document.getElementById('alt-row-settings-close').onclick = closePanel;

        // Save context so we can refresh the panel after a change without re-querying everything
        panel.__altContext = { blueprint: blueprint, field: field, rowId: rowId, setType: setType };

        loadPanelFields(panel);
    }

    function loadPanelFields(panel) {
        var ctx = panel.__altContext;
        if (!ctx) return;

        // Find row values from publish container for current state (so toggles reflect what's saved)
        var rowValues = {};
        var sample = Array.from(containers.values())[0];
        if (sample) {
            var values = unwrapRef(sample.values);
            var loc = findRowIndexByPath(values, ctx.rowId);
            if (loc) {
                var rowArr = getByPath(values, loc.path);
                if (Array.isArray(rowArr) && rowArr[loc.index]) rowValues = rowArr[loc.index];
            }
        }

        fetch(cpUrl('alt-live-editor/row-options'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({ blueprint: ctx.blueprint, field: ctx.field, set: ctx.setType, values: rowValues }),
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
                var body = document.getElementById('alt-row-settings-body');
                if (!body) return;
                if (res.j.error || !res.j.fields || !res.j.fields.length) {
                    body.innerHTML = '<div style="text-align:center;padding:40px 16px;color:#888;font-size:13px">' + esc(res.j.error || 'No editable options for this section.') + '</div>';
                    return;
                }
                body.innerHTML = '';
                res.j.fields.forEach(function (f) { body.appendChild(makeOptionInput(f, ctx.field, ctx.rowId)); });
            });
    }

    function makeOptionInput(f, field, rowId) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:18px';

        var label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:6px;font:600 12px/1.4 -apple-system,sans-serif;color:#374151;margin-bottom:6px;letter-spacing:.02em';
        label.innerHTML = '<span>' + esc(f.display) + '</span>' + (f.required ? '<span style="color:#dc2626;font-size:11px">*</span>' : '');
        wrap.appendChild(label);

        if (f.instructions) {
            var hint = document.createElement('div');
            hint.style.cssText = 'font:400 11px/1.4 -apple-system,sans-serif;color:#9ca3af;margin-bottom:8px';
            hint.textContent = f.instructions;
            wrap.appendChild(hint);
        }

        function emit(value) {
            applyRowFieldUpdate(field, rowId, f.handle, value);
        }

        if (f.inline_renderable === false) {
            var fallback = document.createElement('button');
            fallback.type = 'button';
            fallback.style.cssText = 'width:100%;padding:10px 12px;border:1px dashed #d1d5db;background:#fff;color:#374151;font:600 12px/1.3 -apple-system,sans-serif;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;transition:all 120ms';
            var currentPreview = f.value == null || f.value === '' ? '<em style="color:#9ca3af;font-weight:400">empty</em>' : esc(String(typeof f.value === 'object' ? JSON.stringify(f.value).slice(0, 32) : f.value).slice(0, 32));
            fallback.innerHTML = '<span style="text-align:left;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + currentPreview + '</span><span style="font-size:11px;color:#8a1538;display:inline-flex;align-items:center;gap:4px;flex-shrink:0">Edit ↗</span>';
            fallback.onmouseenter = function () { fallback.style.borderColor = '#8a1538'; fallback.style.background = '#fef2f5'; };
            fallback.onmouseleave = function () { fallback.style.borderColor = '#d1d5db'; fallback.style.background = '#fff'; };
            fallback.onclick = function () { openNativeFieldPicker(f.handle, rowId, {}); };
            wrap.appendChild(fallback);
            return wrap;
        }

        var input;
        var inputStyle = 'width:100%;padding:8px 10px;border:1px solid #d1d5db;background:#fff;color:#111;font:400 13px/1.4 -apple-system,sans-serif;border-radius:6px;outline:none;box-sizing:border-box';

        if (f.type === 'toggle') {
            input = document.createElement('button');
            input.type = 'button';
            var on = !!f.value;
            function paintToggle() {
                input.innerHTML = '<span style="display:inline-block;width:36px;height:20px;background:' + (on ? '#8a1538' : '#d1d5db') + ';border-radius:999px;position:relative;transition:background 120ms;vertical-align:middle"><span style="position:absolute;top:2px;left:' + (on ? '18px' : '2px') + ';width:16px;height:16px;background:#fff;border-radius:50%;transition:left 120ms;box-shadow:0 1px 2px rgba(0,0,0,.2)"></span></span><span style="margin-left:10px;font-size:13px;color:#111;vertical-align:middle">' + (on ? 'On' : 'Off') + '</span>';
            }
            input.style.cssText = 'background:transparent;border:0;padding:0;cursor:pointer';
            paintToggle();
            input.onclick = function () { on = !on; paintToggle(); emit(on); };
        } else if (f.type === 'select' || f.type === 'radio' || f.type === 'button_group') {
            if ((f.type === 'button_group' || f.type === 'radio') && f.options.length <= 6) {
                input = document.createElement('div');
                input.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
                f.options.forEach(function (opt) {
                    var b = document.createElement('button');
                    b.type = 'button';
                    var isActive = String(f.value) === String(opt.value);
                    b.style.cssText = 'flex:1;min-width:60px;padding:8px 12px;border:1px solid ' + (isActive ? '#8a1538' : '#d1d5db') + ';background:' + (isActive ? '#8a1538' : '#fff') + ';color:' + (isActive ? '#fff' : '#374151') + ';font:600 12px/1 -apple-system,sans-serif;border-radius:6px;cursor:pointer;transition:all 120ms';
                    b.textContent = opt.label;
                    b.onclick = function () {
                        Array.from(input.children).forEach(function (c) { c.style.background = '#fff'; c.style.borderColor = '#d1d5db'; c.style.color = '#374151'; });
                        b.style.background = '#8a1538'; b.style.borderColor = '#8a1538'; b.style.color = '#fff';
                        emit(opt.value);
                    };
                    input.appendChild(b);
                });
            } else {
                input = document.createElement('select');
                input.style.cssText = inputStyle;
                f.options.forEach(function (opt) {
                    var o = document.createElement('option');
                    o.value = opt.value; o.textContent = opt.label;
                    if (String(f.value) === String(opt.value)) o.selected = true;
                    input.appendChild(o);
                });
                input.onchange = function () { emit(input.value); };
            }
        } else if (f.type === 'checkboxes') {
            input = document.createElement('div');
            input.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            var current = Array.isArray(f.value) ? f.value.slice() : [];
            f.options.forEach(function (opt) {
                var row = document.createElement('label');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font:400 13px/1.4 -apple-system,sans-serif;color:#374151';
                var cb = document.createElement('input');
                cb.type = 'checkbox'; cb.value = opt.value;
                cb.checked = current.indexOf(opt.value) !== -1;
                cb.onchange = function () {
                    if (cb.checked && current.indexOf(opt.value) === -1) current.push(opt.value);
                    else if (!cb.checked) current = current.filter(function (v) { return v !== opt.value; });
                    emit(current.slice());
                };
                var span = document.createElement('span'); span.textContent = opt.label;
                row.appendChild(cb); row.appendChild(span);
                input.appendChild(row);
            });
        } else if (f.type === 'color') {
            input = document.createElement('div');
            input.style.cssText = 'display:flex;gap:8px;align-items:center';
            var colorInput = document.createElement('input');
            colorInput.type = 'color'; colorInput.value = f.value || '#000000';
            colorInput.style.cssText = 'width:40px;height:34px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;padding:2px';
            var textInput = document.createElement('input');
            textInput.type = 'text'; textInput.value = f.value || '';
            textInput.style.cssText = inputStyle + ';flex:1';
            colorInput.oninput = function () { textInput.value = colorInput.value; emit(colorInput.value); };
            textInput.oninput = function () { colorInput.value = textInput.value; emit(textInput.value); };
            input.appendChild(colorInput); input.appendChild(textInput);
        } else if (f.type === 'range') {
            input = document.createElement('div');
            input.style.cssText = 'display:flex;gap:10px;align-items:center';
            var rangeInput = document.createElement('input');
            rangeInput.type = 'range';
            rangeInput.min = f.min != null ? f.min : 0;
            rangeInput.max = f.max != null ? f.max : 100;
            rangeInput.step = f.step != null ? f.step : 1;
            rangeInput.value = f.value != null ? f.value : (f.min != null ? f.min : 0);
            rangeInput.style.cssText = 'flex:1';
            var rangeVal = document.createElement('div');
            rangeVal.style.cssText = 'min-width:40px;text-align:right;font:600 12px/1 -apple-system,sans-serif;color:#8a1538';
            rangeVal.textContent = rangeInput.value;
            rangeInput.oninput = function () { rangeVal.textContent = rangeInput.value; emit(Number(rangeInput.value)); };
            input.appendChild(rangeInput); input.appendChild(rangeVal);
        } else if (f.type === 'integer' || f.type === 'float') {
            input = document.createElement('input');
            input.type = 'number';
            if (f.type === 'integer') input.step = 1;
            if (f.min != null) input.min = f.min;
            if (f.max != null) input.max = f.max;
            input.value = f.value != null ? f.value : '';
            input.style.cssText = inputStyle;
            input.onchange = function () { emit(f.type === 'integer' ? parseInt(input.value, 10) : parseFloat(input.value)); };
        } else if (f.type === 'date' || f.type === 'time') {
            input = document.createElement('input');
            input.type = f.type; input.value = f.value || '';
            input.style.cssText = inputStyle;
            input.onchange = function () { emit(input.value); };
        } else if (f.type === 'slug' || f.type === 'template' || f.type === 'video' || f.type === 'icon') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = f.value != null ? String(f.value) : '';
            input.placeholder = ({ video: 'YouTube/Vimeo URL', template: 'template/path', slug: 'auto-generated-slug', icon: 'icon name' })[f.type];
            input.style.cssText = inputStyle + ';font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px';
            input.oninput = function () { emit(input.value); };
        } else if (f.type === 'link') {
            input = document.createElement('input');
            input.type = 'url'; input.value = f.value != null ? String(f.value) : '';
            input.placeholder = 'https://…';
            input.style.cssText = inputStyle;
            input.oninput = function () { emit(input.value); };
        } else if (f.type === 'code') {
            input = document.createElement('textarea');
            input.value = f.value != null ? String(f.value) : '';
            input.rows = 6;
            input.style.cssText = inputStyle + ';font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;resize:vertical;min-height:120px';
            input.oninput = function () { emit(input.value); };
        } else if (f.type === 'width') {
            input = document.createElement('div');
            input.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
            [25, 33, 50, 66, 75, 100].forEach(function (w) {
                var b = document.createElement('button');
                b.type = 'button';
                var active = Number(f.value) === w;
                b.style.cssText = 'flex:1;min-width:48px;padding:8px 4px;border:1px solid ' + (active ? '#8a1538' : '#d1d5db') + ';background:' + (active ? '#8a1538' : '#fff') + ';color:' + (active ? '#fff' : '#374151') + ';font:600 11px/1 -apple-system,sans-serif;border-radius:6px;cursor:pointer';
                b.textContent = w + '%';
                b.onclick = function () {
                    Array.from(input.children).forEach(function (c) { c.style.background = '#fff'; c.style.borderColor = '#d1d5db'; c.style.color = '#374151'; });
                    b.style.background = '#8a1538'; b.style.borderColor = '#8a1538'; b.style.color = '#fff';
                    emit(w);
                };
                input.appendChild(b);
            });
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = f.value != null ? String(f.value) : '';
            input.style.cssText = inputStyle;
            input.oninput = function () { emit(input.value); };
        }

        wrap.appendChild(input);
        return wrap;
    }

    function fetchRowOptions(blueprint, field, rowId, setType, requestId, iframeWindow) {
        // Find row values for current state
        var rowValues = {};
        var sample = Array.from(containers.values())[0];
        if (sample) {
            var values = unwrapRef(sample.values);
            var loc = findRowIndexByPath(values, rowId);
            if (loc) {
                var rowArr = getByPath(values, loc.path);
                if (Array.isArray(rowArr) && rowArr[loc.index]) rowValues = rowArr[loc.index];
            }
        }

        fetch(cpUrl('alt-live-editor/row-options'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({ blueprint: blueprint, field: field, set: setType, values: rowValues }),
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
                reply(iframeWindow, {
                    requestId: requestId,
                    fields: res.j.fields || [],
                    error: res.ok ? null : (res.j.error || 'HTTP error'),
                }, '*');
            })
            .catch(function (err) {
                reply(iframeWindow, {
                    requestId: requestId,
                    fields: [],
                    error: err.message,
                }, '*');
            });
    }

    function applyRowFieldUpdate(field, rowId, handle, value) {
        containers.forEach(function (ctx) {
            try {
                var values = unwrapRef(ctx.values);
                var loc = findRowIndexByPath(values, rowId);
                if (!loc) { warn('row not found for option update', rowId); return; }
                var path = loc.path + '.' + loc.index + '.' + handle;
                setFieldValueAndRefresh(ctx, path, value);
            } catch (err) {
                warn('row field update failed', handle, err);
            }
        });
    }

    function generateRowId() {
        // 8-char random matching Statamic's RowId fieldtype generator
        var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        var id = '';
        for (var i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
        return id;
    }

    function findRowIndexByPath(values, rowId) {
        // Returns { path: 'page_builder', index: 3 } for a row in any array within values
        if (!values || typeof values !== 'object') return null;
        var keys = Array.isArray(values) ? values.map(function (_, i) { return i; }) : Object.keys(values);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var v = values[key];
            if (Array.isArray(v)) {
                for (var j = 0; j < v.length; j++) {
                    if (v[j] && (v[j]._id === rowId || v[j].id === rowId)) {
                        return { path: String(key), index: j };
                    }
                    var inner = findRowIndexByPath(v[j], rowId);
                    if (inner) return { path: key + '.' + j + '.' + inner.path, index: inner.index };
                }
            }
        }
        return null;
    }

    function getBlueprintToken() {
        var inertia = document.getElementById('statamic');
        if (!inertia) return null;
        try {
            var data = JSON.parse(inertia.getAttribute('data-page') || '{}');
            return data?.props?.blueprint?.token || null;
        } catch (e) { return null; }
    }

    function applyAddRow(field, refRowId, position, setType, defaults, rowIdHandle) {
        containers.forEach(function (ctx) {
            try {
                var values = unwrapRef(ctx.values);
                var allMeta = ctx.meta ? unwrapRef(ctx.meta) : {};

                var fieldPath = field;
                var refLocation = refRowId ? findRowIndexByPath(values, refRowId) : null;

                if (refRowId && refLocation) {
                    fieldPath = refLocation.path;
                }

                var current = getByPath(values, fieldPath);
                if (!Array.isArray(current)) {
                    warn('field is not an array', fieldPath);
                    return;
                }

                // Replicator's publish form always uses `_id` regardless of row_id_handle config — see preProcessRow.
                var idKey = '_id';
                var newRowId = generateRowId();

                // Token lives at props.blueprint.token in Inertia page data (NOT in field meta)
                var fieldMeta = getByPath(allMeta, fieldPath);
                var token = getBlueprintToken();

                var insert = function (rowDefaults, rowMeta) {
                    var newRow = Object.assign({}, rowDefaults || defaults || {}, { type: setType, enabled: true });
                    newRow[idKey] = newRowId;

                    var copy = current.slice();
                    var insertAt = refLocation ? (position === 'after' ? refLocation.index + 1 : refLocation.index) : copy.length;
                    copy.splice(insertAt, 0, newRow);

                    // setFieldMeta sets a value at a path (Laravel data_set); setMeta replaces the entire meta object.
                    if (rowMeta && ctx.setFieldMeta) {
                        ctx.setFieldMeta(fieldPath + '.existing.' + newRowId, rowMeta);
                    }
                    setFieldValueAndRefresh(ctx, fieldPath, copy);
                };

                // Strip numeric indices: "page_builder.5" → "page_builder" (endpoint wants the blueprint handle)
                var fieldPathForEndpoint = fieldPath.split('.').filter(function (p) { return !/^\d+$/.test(p); }).join('.');

                if (!token) {
                    warn('no blueprint token in page data, falling back without meta');
                    insert();
                    return;
                }

                fetch(cpUrl('fieldtypes/replicator/set'), {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': getCsrfToken(),
                    },
                    body: JSON.stringify({
                        token: token,
                        reference: unwrapRef(ctx.reference) || null,
                        field: fieldPathForEndpoint,
                        set: setType,
                    }),
                })
                    .then(function (r) {
                        return r.json().then(function (j) { return { ok: r.ok, j: j, status: r.status }; }, function () { return { ok: r.ok, j: null, status: r.status }; });
                    })
                    .then(function (res) {
                        if (res.ok && res.j) {
                            // Accept whatever defaults/new the endpoint gives us (empty objects are OK)
                            insert(res.j.defaults || {}, res.j.new || null);
                        } else {
                            warn('preload HTTP ' + res.status, res.j);
                            // Fall back to bare insert — better than failing entirely
                            insert();
                        }
                    })
                    .catch(function (err) {
                        warn('preload network error', err);
                        insert();
                    });
            } catch (err) {
                warn('add row failed', field, err);
            }
        });
    }

    function applyDeleteRow(field, rowId) {
        containers.forEach(function (ctx) {
            try {
                var values = unwrapRef(ctx.values);
                var loc = findRowIndexByPath(values, rowId);
                if (!loc) return;
                var current = getByPath(values, loc.path);
                if (!Array.isArray(current)) return;
                var copy = current.slice();
                copy.splice(loc.index, 1);
                setFieldValueAndRefresh(ctx, loc.path, copy);
            } catch (err) {
                warn('delete row failed', err);
            }
        });
    }

    function applyMoveRow(field, rowId, direction) {
        containers.forEach(function (ctx) {
            try {
                var values = unwrapRef(ctx.values);
                var loc = findRowIndexByPath(values, rowId);
                if (!loc) return;
                var current = getByPath(values, loc.path);
                if (!Array.isArray(current)) return;
                var newIndex = loc.index + direction;
                if (newIndex < 0 || newIndex >= current.length) return;
                var copy = current.slice();
                var item = copy.splice(loc.index, 1)[0];
                copy.splice(newIndex, 0, item);
                setFieldValueAndRefresh(ctx, loc.path, copy);
            } catch (err) {
                warn('move row failed', err);
            }
        });
    }

    function applyMoveRowTo(field, rowId, targetRowId, position) {
        containers.forEach(function (ctx) {
            try {
                var values = unwrapRef(ctx.values);
                var fromLoc = findRowIndexByPath(values, rowId);
                var toLoc = findRowIndexByPath(values, targetRowId);
                if (!fromLoc || !toLoc) return;
                if (fromLoc.path !== toLoc.path) {
                    warn('cross-field drag not supported');
                    return;
                }
                var current = getByPath(values, fromLoc.path);
                if (!Array.isArray(current)) return;

                var copy = current.slice();
                var item = copy.splice(fromLoc.index, 1)[0];

                // Recompute target index after removal
                var targetIndex = toLoc.index > fromLoc.index ? toLoc.index - 1 : toLoc.index;
                if (position === 'after') targetIndex += 1;

                copy.splice(targetIndex, 0, item);
                setFieldValueAndRefresh(ctx, fromLoc.path, copy);
            } catch (err) {
                warn('moveRowTo failed', err);
            }
        });
    }

    function uploadAsset(file, container, requestId, iframeWindow) {
        var fd = new FormData();
        fd.append('container', container);
        fd.append('folder', '/');
        fd.append('file', file, file.name);

        fetch(cpUrl('assets'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
            body: fd,
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
                if (!res.ok) {
                    reply(iframeWindow, {
                        requestId: requestId,
                        error: res.j.message || ('HTTP ' + (res.j.status || '')),
                    }, '*');
                    return;
                }
                // store endpoint returns the asset info as `data`
                var asset = res.j.data || res.j.asset || res.j;
                reply(iframeWindow, {
                    requestId: requestId,
                    asset: asset,
                }, '*');
            })
            .catch(function (err) {
                reply(iframeWindow, {
                    requestId: requestId,
                    error: err.message,
                }, '*');
            });
    }

    function fetchAssets(container, folder, requestId, iframeWindow) {
        var folderPath = folder && folder !== '/' ? folder.replace(/^\//, '') : '';
        var url = cpUrl('assets/browse/folders/') + encodeURIComponent(container) + (folderPath ? '/' + folderPath : '');

        fetch(url, {
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'include',
        })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) {
                var assets = res.ok ? (res.j.data || []) : [];
                var folders = res.ok ? (res.j.meta && res.j.meta.folders ? res.j.meta.folders : (res.j.folders || [])) : [];
                reply(iframeWindow, {
                    requestId: requestId,
                    assets: assets,
                    folders: folders,
                    error: res.ok ? null : 'HTTP ' + (res.j.message || ''),
                }, '*');
            })
            .catch(function (err) {
                reply(iframeWindow, {
                    requestId: requestId,
                    assets: [],
                    folders: [],
                    error: err.message,
                }, '*');
            });
    }

    function applyAssetField(handle, rowId, asset, index) {
        containers.forEach(function (ctx) {
            try {
                var path = resolveFieldPath(ctx, handle, rowId);
                if (!path) {
                    warn('asset rowId not found', rowId);
                    return;
                }
                var values = unwrapRef(ctx.values);
                var current = getByPath(values, path);
                var assetRef = asset.id || asset.path || '';

                if (Array.isArray(current)) {
                    if (index !== null && index !== undefined && index >= 0 && index < current.length) {
                        // Per-slide replace
                        var updated = current.slice();
                        updated[index] = assetRef;
                        setFieldValueAndRefresh(ctx, path, updated);
                    } else {
                        setFieldValueAndRefresh(ctx, path, [assetRef]);
                    }
                } else if (current && typeof current === 'object' && 'id' in current) {
                    setFieldValueAndRefresh(ctx, path, asset);
                } else {
                    setFieldValueAndRefresh(ctx, path, assetRef);
                }
            } catch (err) {
                warn('asset update failed', handle, err);
            }
        });
    }

    window.addEventListener('message', function (event) {
        var data = event.data;
        if (!data || data.source !== 'alt-live-editor') return;
        if (!isTrusted(event)) {
            warn('ignored message from an untrusted window', event.origin);
            return;
        }

        if (data.action === 'openNativeField') {
            openNativeFieldPicker(data.handle, data.rowId || null, { autoReplace: !!data.autoReplace });
            return;
        }

        if (data.action === 'fetchAssets') {
            fetchAssets(data.container || 'assets', data.folder || '/', data.requestId, event.source);
            return;
        }

        if (data.action === 'uploadAsset') {
            uploadAsset(data.file, data.container || 'assets', data.requestId, event.source);
            return;
        }

        if (data.action === 'fetchSetsConfig') {
            fetchSetsConfig(data.blueprint, data.field, data.requestId, event.source);
            return;
        }

        if (data.action === 'openSettingsPanel') {
            openSettingsPanel(data.blueprint, data.field, data.rowId, data.setType);
            return;
        }

        if (data.action === 'fetchRowOptions') {
            fetchRowOptions(data.blueprint, data.field, data.rowId, data.setType, data.requestId, event.source);
            return;
        }

        if (data.action === 'setRowField') {
            applyRowFieldUpdate(data.field, data.rowId, data.handle, data.value);
            return;
        }

        if (data.action === 'fetchCurrentTags') {
            // Read existing tag/array value from publish container values
            var foundTags = [];
            containers.forEach(function (ctx) {
                var values = unwrapRef(ctx.values);
                var path = resolveFieldPath(ctx, data.handle, data.rowId || null);
                if (path) {
                    var v = getByPath(values, path);
                    if (Array.isArray(v)) foundTags = v.slice();
                }
            });
            reply(event.source, {
                requestId: data.requestId,
                tags: foundTags,
            }, '*');
            return;
        }

        if (data.action === 'fetchCurrentEntriesValue') {
            var entriesVal = [];
            containers.forEach(function (ctx) {
                var path = resolveFieldPath(ctx, data.handle, data.rowId || null);
                if (path) {
                    var v = getByPath(unwrapRef(ctx.values), path);
                    if (Array.isArray(v)) entriesVal = v.slice();
                    else if (typeof v === 'string' && v) entriesVal = [v];
                }
            });
            reply(event.source, {
                requestId: data.requestId,
                value: entriesVal,
            }, '*');
            return;
        }

        if (data.action === 'fetchTaxonomyTerms') {
            fetch(cpUrl('alt-live-editor/taxonomy'), {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({ taxonomies: data.taxonomies, search: data.search || '' }),
            })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    reply(event.source, {
                        requestId: data.requestId,
                        terms: j.terms || [],
                    }, '*');
                })
                .catch(function (err) {
                    reply(event.source, {
                        requestId: data.requestId,
                        terms: [],
                        error: err.message,
                    }, '*');
                });
            return;
        }

        if (data.action === 'fetchEntries') {
            fetch(cpUrl('alt-live-editor/entries'), {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({ collections: data.collections, search: data.search || '' }),
            })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    reply(event.source, {
                        requestId: data.requestId,
                        entries: j.entries || [],
                    }, '*');
                })
                .catch(function (err) {
                    reply(event.source, {
                        requestId: data.requestId,
                        entries: [],
                        error: err.message,
                    }, '*');
                });
            return;
        }

        if (data.action === 'setEntriesField') {
            containers.forEach(function (ctx) {
                try {
                    var path = resolveFieldPath(ctx, data.handle, data.rowId || null);
                    if (path) setFieldValueAndRefresh(ctx, path, data.value || []);
                } catch (err) {
                    warn('entries update failed', err);
                }
            });
            return;
        }

        if (data.action === 'setTagsField') {
            containers.forEach(function (ctx) {
                try {
                    var path = resolveFieldPath(ctx, data.handle, data.rowId || null);
                    if (path) setFieldValueAndRefresh(ctx, path, data.tags || []);
                } catch (err) {
                    warn('tags update failed', err);
                }
            });
            return;
        }

        if (data.action === 'addRow') {
            applyAddRow(data.field, data.refRowId || null, data.position || 'after', data.setType, data.defaults || {}, data.rowIdHandle || 'id');
            return;
        }

        if (data.action === 'deleteRow') {
            applyDeleteRow(data.field, data.rowId);
            return;
        }

        if (data.action === 'moveRow') {
            applyMoveRow(data.field, data.rowId, data.direction || 1);
            return;
        }

        if (data.action === 'moveRowTo') {
            applyMoveRowTo(data.field, data.rowId, data.targetRowId, data.position || 'before');
            return;
        }

        if (data.action === 'savePublish') {
            // Trigger Statamic's actual Save button in the publish form
            var saveBtn = Array.from(document.querySelectorAll('button')).find(function (b) {
                var txt = (b.textContent || '').trim().toLowerCase();
                return txt === 'save' || txt === 'save & publish' || txt === 'save and publish' || txt === 'save changes' || txt.indexOf('save') === 0;
            });
            if (saveBtn) {
                saveBtn.click();
            } else {
                warn('no Save button found in CP');
            }
            return;
        }

        if (data.action === 'setAssetField') {
            applyAssetField(data.handle, data.rowId || null, data.asset || {}, data.index !== undefined ? data.index : null);
            return;
        }

        if (typeof data.handle !== 'string') return;

        if (data.bard) {
            applyBardEdit(data.handle, data.nodeIndex || 0, data.value, data.rowId || null);
        } else {
            applyScalar(data.handle, data.value, data.rowId || null);
        }
    });
})();
