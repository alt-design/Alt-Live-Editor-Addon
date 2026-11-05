(function () {
    'use strict';

    var SELECTOR = '[data-alt-editable-handle]';
    var PICKER_WRAPPERS = '[data-alt-editable-entries-handle], [data-alt-editable-taxonomy-handle], [data-alt-editable-tags-handle], [data-alt-editable-image-handle]';
    var INIT_ATTR = 'altLiveEditorInit';

    var settings = window.__ALT_LIVE_EDITOR__ || {};
    var PICKERS = settings.pickers || {};

    // The control panel embeds us, so the parent's origin is the referrer's origin. On a
    // single-domain install that's the same as ours; on a multi-site setup it may not be,
    // which is why we resolve it rather than assuming.
    var PARENT_ORIGIN = (function () {
        try {
            if (document.referrer) return new URL(document.referrer).origin;
        } catch (e) {}
        return window.location.origin;
    })();

    // Everything we send carries entry content, so address the parent explicitly instead
    // of broadcasting with '*'.
    function send(payload) {
        payload.source = 'alt-live-editor';
        window.parent.postMessage(payload, PARENT_ORIGIN);
    }

    // Replies drive our UI (and can hand us asset URLs), so only accept them from the
    // window that actually embedded us.
    function onReply(requestId, handler) {
        var listener = function (event) {
            if (event.source !== window.parent || event.origin !== PARENT_ORIGIN) return;
            var d = event.data;
            if (!d || d.source !== 'alt-live-editor-response' || d.requestId !== requestId) return;
            window.removeEventListener('message', listener);
            handler(d);
        };
        window.addEventListener('message', listener);
        return listener;
    }

    function pickerFor(type) {
        return PICKERS[type] === 'builtin' ? 'builtin' : 'native';
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    // Firefox doesn't implement contenteditable="plaintext-only" — it treats the
    // unknown value as "false", leaving the field silently uneditable. Fall back to
    // "true" there; the paste handler below already strips formatting either way.
    var PLAINTEXT_EDITABLE = (function () {
        var probe = document.createElement('div');
        probe.setAttribute('contenteditable', 'plaintext-only');
        return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
    })();

    function postValue(el) {
        var isBard = el.hasAttribute('data-alt-editable-bard');
        var type = el.getAttribute('data-alt-editable-type') || (isBard ? 'html' : 'text');
        var value = type === 'html' ? el.innerHTML : el.innerText;

        if (el.dataset.altPlaceholder && el.innerText === el.dataset.altPlaceholder) {
            value = '';
        }

        var payload = {
            handle: el.getAttribute('data-alt-editable-handle'),
            rowId: el.getAttribute('data-alt-editable-rowid') || null,
            value: value,
        };

        if (isBard) {
            payload.bard = true;
            payload.nodeIndex = parseInt(el.getAttribute('data-alt-editable-node-index') || '0', 10);
        }

        send(payload);
        showAppliedPill(el);
    }

    function enhance(el) {
        if (el.dataset[INIT_ATTR]) return;
        el.dataset[INIT_ATTR] = '1';

        var isBard = el.hasAttribute('data-alt-editable-bard');

        el.setAttribute('contenteditable', isBard ? 'true' : PLAINTEXT_EDITABLE);
        el.setAttribute('spellcheck', 'true');
        el.style.outline = '1px dashed rgba(138, 21, 56, 0.4)';
        el.style.outlineOffset = '2px';
        el.style.borderRadius = '2px';
        el.style.transition = 'outline-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease';
        el.style.cursor = 'text';

        var isEmpty = el.getAttribute('data-alt-editable-empty') === '1' || el.innerText.trim() === '';
        if (isEmpty && !isBard) {
            var handle = el.getAttribute('data-alt-editable-handle') || 'field';
            el.dataset.altPlaceholder = 'Edit ' + handle;
            el.textContent = el.dataset.altPlaceholder;
            el.style.color = 'rgba(138, 21, 56, 0.55)';
            el.style.fontStyle = 'italic';
            el.style.padding = '2px 8px';
            el.style.minWidth = '60px';
            el.style.display = 'inline-block';
            el.style.background = 'rgba(138, 21, 56, 0.06)';
        }

        attachFieldTooltip(el);

        el.addEventListener('focus', function () {
            el.style.outline = '2px solid rgba(138, 21, 56, 0.9)';
            el.style.backgroundColor = 'rgba(138, 21, 56, 0.04)';
            if (el.dataset.altPlaceholder && el.innerText === el.dataset.altPlaceholder) {
                el.textContent = '';
                el.style.color = '';
                el.style.fontStyle = '';
            }
        });

        el.addEventListener('blur', function () {
            el.style.outline = '1px dashed rgba(138, 21, 56, 0.4)';
            el.style.backgroundColor = '';
            if (el.dataset.altPlaceholder && el.innerText.trim() === '') {
                el.textContent = el.dataset.altPlaceholder;
                el.style.color = 'rgba(138, 21, 56, 0.55)';
                el.style.fontStyle = 'italic';
            }
            postValue(el);
        });

        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !isBard) {
                e.preventDefault();
                el.blur();
            }
            if (e.key === 'Escape') {
                el.blur();
            }
        });

        if (!isBard) {
            el.addEventListener('paste', function (e) {
                e.preventDefault();
                var text = (e.clipboardData || window.clipboardData).getData('text/plain');
                document.execCommand('insertText', false, text);
            });
        }
    }

    function attachFieldTooltip(el) {
        var handle = el.getAttribute('data-alt-editable-handle');
        if (!handle) return;
        el.setAttribute('title', 'Editing: ' + handle);
    }

    // Deliberately not "Saved" — the edit has only been pushed into the publish form.
    // Nothing is persisted until the editor hits Save.
    function showAppliedPill(el) {
        var pill = document.createElement('span');
        pill.textContent = '✓ Updated';
        pill.style.cssText = 'position:absolute;background:#16a34a;color:#fff;padding:3px 8px;border-radius:4px;font:600 11px/1 -apple-system,sans-serif;letter-spacing:.3px;z-index:2147483646;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.2);opacity:0;transition:opacity 200ms;';

        var rect = el.getBoundingClientRect();
        pill.style.top = (rect.top + window.scrollY - 26) + 'px';
        pill.style.left = (rect.left + window.scrollX) + 'px';

        document.body.appendChild(pill);

        requestAnimationFrame(function () { pill.style.opacity = '1'; });
        setTimeout(function () {
            pill.style.opacity = '0';
            setTimeout(function () { pill.remove(); }, 250);
        }, 1100);
    }

    function enhanceImage(el) {
        if (el.dataset[INIT_ATTR]) return;
        el.dataset[INIT_ATTR] = '1';

        var overlay = document.createElement('span');
        overlay.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit image';
        overlay.style.cssText = 'position:absolute;top:10px;right:10px;padding:6px 12px;background:rgba(17,24,39,.92);color:#fff;font:600 12px/1 -apple-system,Segoe UI,sans-serif;border-radius:999px;cursor:pointer;opacity:1;transition:transform 120ms, background 120ms;pointer-events:none;z-index:99999;letter-spacing:.3px;box-shadow:0 4px 12px rgba(0,0,0,.3);backdrop-filter:blur(4px);display:inline-flex;align-items:center';
        el.appendChild(overlay);

        el.style.outline = '2px dashed rgba(138, 21, 56, 0.6)';
        el.style.outlineOffset = '2px';
        el.style.cursor = 'pointer';

        el.addEventListener('mouseenter', function () {
            overlay.style.background = '#8a1538';
            overlay.style.transform = 'scale(1.05)';
            el.style.outline = '2px solid rgba(138, 21, 56, 0.95)';
        });

        el.addEventListener('mouseleave', function () {
            overlay.style.background = 'rgba(17,24,39,.92)';
            overlay.style.transform = '';
            el.style.outline = '2px dashed rgba(138, 21, 56, 0.6)';
        });

        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var handle = el.getAttribute('data-alt-editable-image-handle');
            var rowId = el.getAttribute('data-alt-editable-rowid') || null;

            if (pickerFor('image') === 'builtin') {
                var indexAttr = el.getAttribute('data-alt-editable-index');
                openAssetPicker(
                    handle,
                    rowId,
                    el.getAttribute('data-alt-editable-container') || 'assets',
                    indexAttr === null ? null : parseInt(indexAttr, 10),
                );
                return;
            }

            send({
                action: 'openNativeField',
                handle: handle,
                rowId: rowId,
                autoReplace: true,
            });
        });
    }

    function openAssetPicker(handle, rowId, container, index) {
        var requestId = String(Date.now()) + ':' + Math.random();

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;';
        overlay.id = 'alt-asset-picker-overlay';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'width:min(900px,92vw);max-height:80vh;background:#fff;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;';

        var header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:12px;';
        header.innerHTML = '<strong style="font-size:16px;color:#111">Choose or upload an image for "' + esc(handle) + '"</strong>' +
            '<div style="display:flex;gap:8px"><button id="alt-asset-picker-upload" style="border:0;background:#8a1538;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Upload new</button>' +
            '<button id="alt-asset-picker-close" style="border:0;background:#f3f4f6;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:14px">Cancel</button></div>';

        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #f3f4f6;background:#fafafa;';
        toolbar.innerHTML = '<input id="alt-asset-search" placeholder="Search assets…" style="flex:1;border:1px solid #e5e7eb;background:#fff;padding:6px 10px;border-radius:6px;font:400 13px/1.4 -apple-system,sans-serif;outline:none">' +
            '<span id="alt-asset-breadcrumb" style="font:500 12px/1 -apple-system,sans-serif;color:#666;white-space:nowrap;"></span>';

        var body = document.createElement('div');
        body.style.cssText = 'padding:16px;overflow:auto;flex:1;position:relative';
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#888">Loading assets…</div>';

        // Insert toolbar between header and body
        dialog.appendChild(toolbar);

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(fileInput);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        document.getElementById('alt-asset-picker-close').onclick = function () { overlay.remove(); };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        document.getElementById('alt-asset-picker-upload').onclick = function () { fileInput.click(); };
        fileInput.onchange = function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) return;

            body.innerHTML = '<div style="text-align:center;padding:40px;color:#8a1538">Uploading ' + esc(file.name) + '…</div>';

            var uploadId = String(Date.now()) + ':up:' + Math.random();
            onReply(uploadId, function (d) {
                if (d.error) {
                    body.innerHTML = '<div style="text-align:center;padding:40px;color:#b91c1c">Upload failed: ' + esc(d.error) + '</div>';
                } else if (d.asset) {
                    // Auto-select the uploaded asset
                    send({
                        action: 'setAssetField',
                        handle: handle,
                        rowId: rowId,
                        index: index,
                        asset: d.asset,
                    });
                    overlay.remove();
                }
            });

            send({
                action: 'uploadAsset',
                container: container,
                requestId: uploadId,
                file: file,
                filename: file.name,
            });
        };

        var currentFolder = '/';
        var allAssets = [];
        var allFolders = [];

        var onPick = function (asset) {
            send({
                action: 'setAssetField',
                handle: handle,
                rowId: rowId,
                index: index,
                asset: asset,
            });
            overlay.remove();
        };

        var doSearch = function () {
            var q = (document.getElementById('alt-asset-search').value || '').toLowerCase().trim();
            var filtered = q ? allAssets.filter(function (a) {
                return (a.basename || a.path || '').toLowerCase().indexOf(q) !== -1;
            }) : allAssets;
            var foldersFiltered = q ? [] : allFolders;
            renderAssetGrid(body, filtered, foldersFiltered, null, onPick, function (folder) {
                navigateFolder(folder);
            });
        };

        var renderBreadcrumb = function () {
            var parts = currentFolder.split('/').filter(function (p) { return p; });
            var html = '<span style="cursor:pointer;text-decoration:underline" data-folder="/">' + esc(container) + '</span>';
            var path = '';
            for (var i = 0; i < parts.length; i++) {
                path += '/' + parts[i];
                html += ' › <span style="cursor:pointer;text-decoration:underline" data-folder="' + esc(path) + '">' + esc(parts[i]) + '</span>';
            }
            var bc = document.getElementById('alt-asset-breadcrumb');
            bc.innerHTML = html;
            Array.from(bc.querySelectorAll('[data-folder]')).forEach(function (el) {
                el.onclick = function () { navigateFolder(el.getAttribute('data-folder')); };
            });
        };

        var navigateFolder = function (folder) {
            currentFolder = folder;
            renderBreadcrumb();
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#888">Loading…</div>';
            var navId = String(Date.now()) + ':nav:' + Math.random();
            onReply(navId, function (d) {
                allAssets = d.assets || [];
                allFolders = d.folders || [];
                doSearch();
            });
            send({
                action: 'fetchAssets',
                container: container,
                folder: folder,
                requestId: navId,
            });
        };

        onReply(requestId, function (data) {
            allAssets = data.assets || [];
            allFolders = data.folders || [];
            renderBreadcrumb();
            doSearch();
        });

        document.getElementById('alt-asset-search').oninput = doSearch;

        send({
            action: 'fetchAssets',
            container: container,
            folder: '/',
            requestId: requestId,
        });
    }

    function renderAssetGrid(container, assets, folders, error, onPick, onFolderPick) {
        if (error) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#b91c1c">Failed to load assets: ' + esc(error) + '</div>';
            return;
        }
        if ((!assets || !assets.length) && (!folders || !folders.length)) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#888">No matching assets.</div>';
            return;
        }
        container.innerHTML = '';
        var grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px';

        (folders || []).forEach(function (folder) {
            var card = document.createElement('button');
            card.type = 'button';
            card.style.cssText = 'border:1px solid #e5e7eb;border-radius:8px;padding:0;cursor:pointer;background:#fff7ec;overflow:hidden;display:block;text-align:left;font-family:inherit';
            card.onmouseenter = function () { card.style.borderColor = '#8a1538'; card.style.boxShadow = '0 0 0 2px rgba(138,21,56,.2)'; };
            card.onmouseleave = function () { card.style.borderColor = '#e5e7eb'; card.style.boxShadow = ''; };
            var folderName = folder.basename || folder.path || folder;
            card.innerHTML = '<div style="aspect-ratio:1;background:#fef3e0;display:flex;align-items:center;justify-content:center"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8a1538" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>' +
                '<div style="padding:6px 8px;font-size:11px;color:#444;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Folder: ' + esc(folderName) + '</div>';
            card.onclick = function () { onFolderPick(folder.path || folder); };
            grid.appendChild(card);
        });

        (assets || []).filter(function (a) { return a.is_image !== false; }).forEach(function (asset) {
            var card = document.createElement('button');
            card.type = 'button';
            card.style.cssText = 'border:1px solid #e5e7eb;border-radius:8px;padding:0;cursor:pointer;background:#fafafa;overflow:hidden;display:block;text-align:left;font-family:inherit';
            card.onmouseenter = function () { card.style.borderColor = '#8a1538'; card.style.boxShadow = '0 0 0 2px rgba(138,21,56,.2)'; };
            card.onmouseleave = function () { card.style.borderColor = '#e5e7eb'; card.style.boxShadow = ''; };

            var imgSrc = asset.thumbnail || asset.url || '';
            var meta = asset.width && asset.height ? asset.width + '×' + asset.height : (asset.size_formatted || '');
            card.innerHTML = '<div style="aspect-ratio:1;background:#fff url(' + esc(JSON.stringify(imgSrc)) + ') center/cover no-repeat"></div>' +
                '<div style="padding:6px 8px;font-size:11px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(asset.basename || asset.path || '') + '</div>' +
                (meta ? '<div style="padding:0 8px 6px;font-size:10px;color:#999">' + esc(meta) + '</div>' : '');
            card.onclick = function () { onPick(asset); };
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }

    function removeAllDropIndicators() {
        document.querySelectorAll('.alt-drop-indicator').forEach(function (n) { n.remove(); });
    }

    function suppressLinkNavigation() {
        // In live preview, prevent <a href> navigations — the iframe is for editing, not browsing.
        // Use capture phase so we beat Alpine.js and other framework handlers.
        document.addEventListener('click', function (e) {
            var link = e.target.closest('a[href]');
            if (!link) return;
            var href = link.getAttribute('href') || '';
            if (link.target === '_blank') return;             // allow new tabs
            if (href.startsWith('javascript:')) return;       // allow JS handlers
            if (href.startsWith('#')) return;                 // allow in-page anchors
            e.preventDefault();
            if (link.closest(PICKER_WRAPPERS)) return;
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);
    }

    function setupDragDrop() {
        document.addEventListener('dragover', function (e) {
            if (!window.__altDragRowId) return;
            var row = e.target.closest && e.target.closest('[data-alt-row="1"]');
            if (!row || row.getAttribute('data-alt-row-id') === window.__altDragRowId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            removeAllDropIndicators();
            var rect = row.getBoundingClientRect();
            var before = (e.clientY - rect.top) < rect.height / 2;

            var indicator = document.createElement('div');
            indicator.className = 'alt-drop-indicator';
            indicator.style.cssText = 'height:4px;background:#8a1538;margin:4px 0;border-radius:2px;box-shadow:0 0 12px rgba(138,21,56,.5);pointer-events:none;';

            if (before) row.parentNode.insertBefore(indicator, row);
            else row.parentNode.insertBefore(indicator, row.nextSibling);
        });

        document.addEventListener('drop', function (e) {
            if (!window.__altDragRowId) return;
            var row = e.target.closest && e.target.closest('[data-alt-row="1"]');
            if (!row || row.getAttribute('data-alt-row-id') === window.__altDragRowId) {
                removeAllDropIndicators();
                return;
            }
            e.preventDefault();

            var rect = row.getBoundingClientRect();
            var before = (e.clientY - rect.top) < rect.height / 2;
            var targetRowId = row.getAttribute('data-alt-row-id');
            var position = before ? 'before' : 'after';

            send({
                action: 'moveRowTo',
                field: window.__altDragField,
                rowId: window.__altDragRowId,
                targetRowId: targetRowId,
                position: position,
            });

            removeAllDropIndicators();
            window.__altDragRowId = null;
        });
    }

    function enhanceRow(el) {
        if (el.dataset[INIT_ATTR]) return;
        el.dataset[INIT_ATTR] = '1';

        el.style.position = 'relative';

        var field = el.getAttribute('data-alt-row-field');
        var index = parseInt(el.getAttribute('data-alt-row-index') || '0', 10);
        var rowId = el.getAttribute('data-alt-row-id');
        var blueprint = el.getAttribute('data-alt-row-blueprint');
        var isLast = el.getAttribute('data-alt-row-last') === '1';
        var type = el.getAttribute('data-alt-row-type');

        // Toolbar (delete + up + down) — appears on hover
        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'position:absolute;top:8px;right:8px;display:flex;gap:4px;opacity:0;transition:opacity 120ms;z-index:99998;pointer-events:none;';

        function tbBtn(label, svg, action) {
            var b = document.createElement('button');
            b.type = 'button';
            b.title = label;
            b.setAttribute('aria-label', label);
            b.className = 'alt-le-control';
            b.innerHTML = svg;
            b.style.cssText = 'width:32px;height:32px;border:0;background:rgba(17,24,39,.92);color:#fff;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:auto;backdrop-filter:blur(4px);';
            b.onmouseenter = function () { b.style.background = '#8a1538'; };
            b.onmouseleave = function () { b.style.background = 'rgba(17,24,39,.92)'; };
            b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); action(); };
            return b;
        }

        // Drag handle
        var dragHandle = tbBtn('Drag to reorder', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>', function () {});
        dragHandle.style.cursor = 'grab';
        dragHandle.onclick = null;
        dragHandle.tabIndex = -1;
        dragHandle.setAttribute('aria-hidden', 'true');
        toolbar.appendChild(dragHandle);

        toolbar.appendChild(tbBtn('Move up', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>', function () {
            send({ action: 'moveRow', field: field, rowId: rowId, direction: -1 });
        }));
        toolbar.appendChild(tbBtn('Move down', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>', function () {
            send({ action: 'moveRow', field: field, rowId: rowId, direction: 1 });
        }));
        toolbar.appendChild(tbBtn('Section settings', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', function () {
            openRowSettingsPanel(field, rowId, blueprint, type);
        }));

        toolbar.appendChild(tbBtn('Delete row', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1.4 14a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>', function () {
            if (confirm('Delete this "' + (type || 'row') + '" section?')) {
                send({ action: 'deleteRow', field: field, rowId: rowId });
            }
        }));

        el.appendChild(toolbar);

        el.addEventListener('mouseenter', function () { toolbar.style.opacity = '1'; });
        el.addEventListener('mouseleave', function () {
            if (!toolbar.contains(document.activeElement)) toolbar.style.opacity = '0';
        });
        toolbar.addEventListener('focusin', function () { toolbar.style.opacity = '1'; });
        toolbar.addEventListener('focusout', function (e) {
            if (!toolbar.contains(e.relatedTarget) && !el.matches(':hover')) toolbar.style.opacity = '0';
        });

        // Native HTML5 drag-and-drop, gated by mousedown on the drag handle
        el.draggable = false;
        dragHandle.addEventListener('mousedown', function () { el.draggable = true; dragHandle.style.cursor = 'grabbing'; });
        dragHandle.addEventListener('mouseup', function () { el.draggable = false; dragHandle.style.cursor = 'grab'; });

        el.addEventListener('dragstart', function (e) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', rowId);
            el.style.opacity = '0.4';
            window.__altDragRowId = rowId;
            window.__altDragField = field;
        });
        el.addEventListener('dragend', function () {
            el.style.opacity = '';
            el.draggable = false;
            dragHandle.style.cursor = 'grab';
            removeAllDropIndicators();
            window.__altDragRowId = null;
        });

        // "+ Add section above" before the row
        var addAbove = makeAddSectionButton(field, blueprint, index, 'before', rowId);
        el.parentNode.insertBefore(addAbove, el);

        // For the last row, also add a button after
        if (isLast) {
            var addBelow = makeAddSectionButton(field, blueprint, index, 'after', rowId);
            if (el.nextSibling) el.parentNode.insertBefore(addBelow, el.nextSibling);
            else el.parentNode.appendChild(addBelow);
        }
    }

    function openRowSettingsPanel(field, rowId, blueprint, type) {
        // Panel lives in the PARENT CP window so it survives iframe reloads (every setting change
        // refreshes the preview iframe; if the panel were inside, it'd vanish after one change).
        send({
            action: 'openSettingsPanel',
            blueprint: blueprint,
            field: field,
            rowId: rowId,
            setType: type,
        });
    }


    function makeAddSectionButton(field, blueprint, refIndex, position, refRowId) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'alt-le-control';
        btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add section ' + position + '</span>';
        btn.style.cssText = 'display:block;width:calc(100% - 32px);margin:8px auto;padding:8px 12px;border:1.5px dashed rgba(138,21,56,.4);background:transparent;color:rgba(138,21,56,.65);cursor:pointer;border-radius:8px;font:600 12px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.3px;text-transform:uppercase;transition:all 120ms;opacity:0.4;';
        function highlight() {
            btn.style.opacity = '1';
            btn.style.background = 'rgba(138,21,56,.06)';
            btn.style.borderColor = '#8a1538';
            btn.style.color = '#8a1538';
        }
        function unhighlight() {
            if (document.activeElement === btn || btn.matches(':hover')) return;
            btn.style.opacity = '0.4';
            btn.style.background = 'transparent';
            btn.style.borderColor = 'rgba(138,21,56,.4)';
            btn.style.color = 'rgba(138,21,56,.65)';
        }
        btn.onmouseenter = highlight;
        btn.onmouseleave = unhighlight;
        btn.addEventListener('focus', highlight);
        btn.addEventListener('blur', unhighlight);
        btn.onclick = function (e) {
            e.preventDefault();
            openSetPicker(field, blueprint, refRowId, position);
        };
        return btn;
    }

    function openSetPicker(field, blueprint, refRowId, position) {
        var requestId = String(Date.now()) + ':sets:' + Math.random();

        var overlay = document.createElement('div');
        overlay.id = 'alt-set-picker-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,sans-serif;';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'width:min(560px,92vw);max-height:80vh;background:#fff;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;';
        dialog.innerHTML = '<div style="padding:18px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;"><strong style="font-size:16px;color:#111">Add a new section</strong><button id="alt-set-picker-close" style="border:0;background:#f3f4f6;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:14px">Cancel</button></div>';

        var body = document.createElement('div');
        body.style.cssText = 'padding:16px;overflow:auto;flex:1';
        body.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Loading section types…</div>';
        dialog.appendChild(body);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        document.getElementById('alt-set-picker-close').onclick = function () { overlay.remove(); };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        onReply(requestId, function (data) {

            if (data.error || !data.sets || !data.sets.length) {
                body.innerHTML = '<div style="text-align:center;padding:30px;color:#b91c1c">' + esc(data.error || 'No sets available.') + '</div>';
                return;
            }

            body.innerHTML = '';
            data.sets.forEach(function (set) {
                var card = document.createElement('button');
                card.type = 'button';
                card.style.cssText = 'display:flex;width:100%;align-items:center;gap:14px;padding:14px 16px;border:1px solid #e5e7eb;background:#fafafa;border-radius:8px;cursor:pointer;margin-bottom:8px;text-align:left;font-family:inherit;';
                card.onmouseenter = function () { card.style.borderColor = '#8a1538'; card.style.background = '#fff'; };
                card.onmouseleave = function () { card.style.borderColor = '#e5e7eb'; card.style.background = '#fafafa'; };

                var iconHtml = '<div style="width:36px;height:36px;background:#8a1538;color:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font:600 14px/1 sans-serif">' + esc((set.display || set.handle).charAt(0).toUpperCase()) + '</div>';
                var info = '<div style="flex:1"><div style="font:600 14px/1.2 sans-serif;color:#111">' + esc(set.display || set.handle) + '</div>';
                if (set.instructions) info += '<div style="font:400 12px/1.4 sans-serif;color:#666;margin-top:3px">' + esc(set.instructions) + '</div>';
                info += '</div>';
                card.innerHTML = iconHtml + info;

                card.onclick = function () {
                    send({
                        action: 'addRow',
                        field: field,
                        refRowId: refRowId,
                        position: position,
                        setType: set.handle,
                        defaults: set.defaults || {},
                        meta: set.meta || {},
                        rowIdHandle: data.row_id_handle || 'id',
                    });
                    overlay.remove();
                };
                body.appendChild(card);
            });
        });

        send({
            action: 'fetchSetsConfig',
            field: field,
            blueprint: blueprint,
            requestId: requestId,
        });
    }

    function enhanceTags(el) {
        if (el.dataset[INIT_ATTR]) return;
        el.dataset[INIT_ATTR] = '1';

        var overlay = document.createElement('span');
        overlay.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit tags';
        overlay.style.cssText = 'position:absolute;top:-26px;right:0;padding:4px 10px;background:rgba(17,24,39,.92);color:#fff;font:600 10px/1 -apple-system,Segoe UI,sans-serif;border-radius:999px;opacity:1;transition:transform 120ms, background 120ms;pointer-events:none;z-index:99999;letter-spacing:.3px;box-shadow:0 4px 10px rgba(0,0,0,.25);display:inline-flex;align-items:center';
        el.appendChild(overlay);
        el.style.outline = '2px dashed rgba(138, 21, 56, 0.5)';
        el.style.outlineOffset = '2px';
        el.style.borderRadius = '2px';

        el.addEventListener('mouseenter', function () { overlay.style.background = '#8a1538'; el.style.outline = '2px solid rgba(138,21,56,.95)'; });
        el.addEventListener('mouseleave', function () { overlay.style.background = 'rgba(17,24,39,.92)'; el.style.outline = '2px dashed rgba(138,21,56,.5)'; });

        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var handle = el.getAttribute('data-alt-editable-tags-handle');
            var rowId = el.getAttribute('data-alt-editable-rowid') || null;

            if (pickerFor('tags') === 'builtin') {
                openTagsPicker(handle, rowId);
                return;
            }

            send({
                action: 'openNativeField',
                handle: handle,
                rowId: rowId,
            });
        });
    }

    function openTagsPicker(handle, rowId) {
        var requestId = String(Date.now()) + ':tags:' + Math.random();

        var overlay = document.createElement('div');
        overlay.id = 'alt-tags-picker-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'width:min(520px,92vw);background:#fff;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;';
        dialog.innerHTML = '<div style="padding:18px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center"><strong style="font-size:16px;color:#111">Edit tags: ' + esc(handle) + '</strong><button id="alt-tags-close" style="border:0;background:#f3f4f6;padding:6px 12px;border-radius:6px;cursor:pointer">Cancel</button></div>';

        var body = document.createElement('div');
        body.style.cssText = 'padding:16px';
        dialog.appendChild(body);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        document.getElementById('alt-tags-close').onclick = function () { overlay.remove(); };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        onReply(requestId, function (d) {
            renderTagsEditor(body, d.tags || [], function (newTags) {
                send({
                    action: 'setTagsField',
                    handle: handle,
                    rowId: rowId,
                    tags: newTags,
                });
                overlay.remove();
            });
        });

        send({
            action: 'fetchCurrentTags',
            handle: handle,
            rowId: rowId,
            requestId: requestId,
        });
    }

    function renderTagsEditor(container, tags, onSave) {
        var current = tags.slice();

        var render = function () {
            container.innerHTML = '';
            var list = document.createElement('div');
            list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;min-height:36px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa';
            if (!current.length) {
                list.innerHTML = '<span style="color:#999;font-size:12px;font-style:italic;align-self:center">No tags yet — add some below.</span>';
            } else {
                current.forEach(function (tag, idx) {
                    var pill = document.createElement('span');
                    pill.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:#8a1538;color:#fff;padding:4px 8px 4px 10px;border-radius:999px;font-size:12px;';
                    pill.innerHTML = esc(tag) + '<button type="button" style="background:transparent;border:0;color:#fff;cursor:pointer;font-size:14px;padding:0 4px;line-height:1">×</button>';
                    pill.querySelector('button').onclick = function () {
                        current.splice(idx, 1);
                        render();
                    };
                    list.appendChild(pill);
                });
            }
            container.appendChild(list);

            var input = document.createElement('input');
            input.placeholder = 'Add a tag and press Enter…';
            input.style.cssText = 'width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;box-sizing:border-box;outline:none;';
            input.onkeydown = function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var v = input.value.trim();
                    if (v && current.indexOf(v) === -1) {
                        current.push(v);
                        render();
                        setTimeout(function () { container.querySelector('input').focus(); }, 0);
                    }
                }
            };
            container.appendChild(input);

            var saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.textContent = 'Save tags';
            saveBtn.style.cssText = 'margin-top:14px;width:100%;padding:10px;background:#8a1538;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;letter-spacing:.3px;';
            saveBtn.onclick = function () { onSave(current); };
            container.appendChild(saveBtn);

            input.focus();
        };
        render();
    }

    function enhanceEntries(el) {
        if (el.dataset[INIT_ATTR]) return;
        el.dataset[INIT_ATTR] = '1';

        var overlay = document.createElement('span');
        overlay.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit selection';
        overlay.style.cssText = 'position:absolute;top:-26px;right:0;padding:4px 10px;background:rgba(17,24,39,.92);color:#fff;font:600 10px/1 -apple-system,Segoe UI,sans-serif;border-radius:999px;opacity:1;transition:transform 120ms, background 120ms;pointer-events:none;z-index:99999;letter-spacing:.3px;box-shadow:0 4px 10px rgba(0,0,0,.25);display:inline-flex;align-items:center;white-space:nowrap';
        el.appendChild(overlay);
        el.style.outline = '2px dashed rgba(138, 21, 56, 0.5)';
        el.style.outlineOffset = '2px';
        el.style.borderRadius = '2px';

        el.addEventListener('mouseenter', function () { overlay.style.background = '#8a1538'; el.style.outline = '2px solid rgba(138,21,56,.95)'; });
        el.addEventListener('mouseleave', function () { overlay.style.background = 'rgba(17,24,39,.92)'; el.style.outline = '2px dashed rgba(138,21,56,.5)'; });

        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var handle = el.getAttribute('data-alt-editable-entries-handle');
            var rowId = el.getAttribute('data-alt-editable-rowid') || null;

            if (pickerFor('entries') === 'builtin') {
                var max = el.getAttribute('data-alt-editable-max');
                openEntriesPicker(
                    handle,
                    rowId,
                    el.getAttribute('data-alt-editable-collections') || '',
                    max ? parseInt(max, 10) : null,
                );
                return;
            }

            send({
                action: 'openNativeField',
                handle: handle,
                rowId: rowId,
                autoReplace: true,
            });
        });
    }

    function openEntriesPicker(handle, rowId, collections, max) {
        var requestId = String(Date.now()) + ':entries:' + Math.random();

        var overlay = document.createElement('div');
        overlay.id = 'alt-entries-picker-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'width:min(720px,92vw);max-height:80vh;background:#fff;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;';
        dialog.innerHTML = '<div style="padding:18px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:12px"><strong style="font-size:16px;color:#111">Select ' + (max ? 'up to ' + max + ' ' : '') + 'entries for "' + esc(handle) + '"</strong><button id="alt-entries-close" style="border:0;background:#f3f4f6;padding:6px 12px;border-radius:6px;cursor:pointer">Cancel</button></div>';

        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding:12px 16px;border-bottom:1px solid #f3f4f6;background:#fafafa';
        toolbar.innerHTML = '<input id="alt-entries-search" placeholder="Search entries…" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font:400 13px/1.4 -apple-system,sans-serif;outline:none;box-sizing:border-box">';

        var body = document.createElement('div');
        body.style.cssText = 'padding:8px 16px;overflow:auto;flex:1';

        var footer = document.createElement('div');
        footer.style.cssText = 'padding:14px 18px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafafa';
        footer.innerHTML = '<span id="alt-entries-count" style="font:500 12px/1 sans-serif;color:#666">0 selected</span><button id="alt-entries-save" type="button" style="background:#8a1538;color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">Save selection</button>';

        dialog.appendChild(toolbar);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        document.getElementById('alt-entries-close').onclick = function () { overlay.remove(); };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        var selectedIds = [];
        var lastFetched = [];

        // Get current value first
        send({
            action: 'fetchCurrentEntriesValue',
            handle: handle,
            rowId: rowId,
            requestId: requestId + ':current',
        });

        onReply(requestId + ':current', function (d) {
            selectedIds = Array.isArray(d.value) ? d.value.slice() : [];
            fetchEntries();
        });

        function fetchEntries(search) {
            body.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Loading entries…</div>';
            var fetchId = String(Date.now()) + ':efetch:' + Math.random();
            onReply(fetchId, function (d) {
                lastFetched = d.entries || [];
                renderList();
            });
            send({
                action: 'fetchEntries',
                collections: collections,
                search: search || '',
                requestId: fetchId,
            });
        }

        function renderList() {
            body.innerHTML = '';
            if (!lastFetched.length) {
                body.innerHTML = '<div style="text-align:center;padding:30px;color:#888">No entries found.</div>';
                updateCount();
                return;
            }
            lastFetched.forEach(function (entry) {
                var row = document.createElement('label');
                var isSelected = selectedIds.indexOf(entry.id) !== -1;
                row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px;cursor:pointer;background:' + (isSelected ? '#fff0f3' : '#fff') + ';transition:background 120ms;';
                row.onmouseenter = function () { if (!isSelected) row.style.background = '#fafafa'; };
                row.onmouseleave = function () { if (!isSelected) row.style.background = '#fff'; };

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = isSelected;
                cb.style.cssText = 'width:16px;height:16px;accent-color:#8a1538;cursor:pointer';
                cb.onchange = function () {
                    var idx = selectedIds.indexOf(entry.id);
                    if (cb.checked && idx === -1) {
                        if (max && selectedIds.length >= max) {
                            cb.checked = false;
                            return;
                        }
                        selectedIds.push(entry.id);
                    } else if (!cb.checked && idx !== -1) {
                        selectedIds.splice(idx, 1);
                    }
                    isSelected = cb.checked;
                    row.style.background = isSelected ? '#fff0f3' : '#fff';
                    updateCount();
                };

                var info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0';
                info.innerHTML = '<div style="font:600 13px/1.2 sans-serif;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(entry.title || entry.slug || entry.id) + '</div>' +
                    '<div style="font:400 11px/1.2 sans-serif;color:#888;margin-top:3px">' + esc((entry.collection_title || entry.collection || '') + (entry.slug ? ' · /' + entry.slug : '')) + '</div>';

                row.appendChild(cb);
                row.appendChild(info);
                body.appendChild(row);
            });
            updateCount();
        }

        function updateCount() {
            document.getElementById('alt-entries-count').textContent = selectedIds.length + ' selected' + (max ? ' (max ' + max + ')' : '');
        }

        document.getElementById('alt-entries-search').oninput = function () {
            var v = document.getElementById('alt-entries-search').value;
            fetchEntries(v);
        };

        document.getElementById('alt-entries-save').onclick = function () {
            send({
                action: 'setEntriesField',
                handle: handle,
                rowId: rowId,
                value: selectedIds,
            });
            overlay.remove();
        };
    }

    function enhanceTaxonomy(el) {
        if (el.dataset[INIT_ATTR]) return;
        el.dataset[INIT_ATTR] = '1';

        var overlay = document.createElement('span');
        overlay.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit terms';
        overlay.style.cssText = 'position:absolute;top:-26px;right:0;padding:4px 10px;background:rgba(17,24,39,.92);color:#fff;font:600 10px/1 -apple-system,Segoe UI,sans-serif;border-radius:999px;opacity:1;transition:transform 120ms, background 120ms;pointer-events:none;z-index:99999;letter-spacing:.3px;box-shadow:0 4px 10px rgba(0,0,0,.25);display:inline-flex;align-items:center;white-space:nowrap';
        el.appendChild(overlay);
        el.style.outline = '2px dashed rgba(138, 21, 56, 0.5)';
        el.style.outlineOffset = '2px';
        el.style.borderRadius = '2px';

        el.addEventListener('mouseenter', function () { overlay.style.background = '#8a1538'; el.style.outline = '2px solid rgba(138,21,56,.95)'; });
        el.addEventListener('mouseleave', function () { overlay.style.background = 'rgba(17,24,39,.92)'; el.style.outline = '2px dashed rgba(138,21,56,.5)'; });

        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var handle = el.getAttribute('data-alt-editable-taxonomy-handle');
            var rowId = el.getAttribute('data-alt-editable-rowid') || null;

            if (pickerFor('taxonomy') === 'builtin') {
                var max = el.getAttribute('data-alt-editable-max');
                openTaxonomyPicker(
                    handle,
                    rowId,
                    el.getAttribute('data-alt-editable-taxonomies') || '',
                    max ? parseInt(max, 10) : null,
                );
                return;
            }

            send({
                action: 'openNativeField',
                handle: handle,
                rowId: rowId,
                autoReplace: true,
            });
        });
    }

    function openTaxonomyPicker(handle, rowId, taxonomies, max) {
        var requestId = String(Date.now()) + ':tax:' + Math.random();

        var overlay = document.createElement('div');
        overlay.id = 'alt-taxonomy-picker-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'width:min(640px,92vw);max-height:80vh;background:#fff;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden;display:flex;flex-direction:column;';
        dialog.innerHTML = '<div style="padding:18px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:12px"><strong style="font-size:16px;color:#111">Select ' + (max ? 'up to ' + max + ' ' : '') + 'terms for "' + esc(handle) + '"</strong><button id="alt-tax-close" style="border:0;background:#f3f4f6;padding:6px 12px;border-radius:6px;cursor:pointer">Cancel</button></div>';

        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding:12px 16px;border-bottom:1px solid #f3f4f6;background:#fafafa';
        toolbar.innerHTML = '<input id="alt-tax-search" placeholder="Search terms…" style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;outline:none;box-sizing:border-box">';

        var body = document.createElement('div');
        body.style.cssText = 'padding:8px 16px;overflow:auto;flex:1';

        var footer = document.createElement('div');
        footer.style.cssText = 'padding:14px 18px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fafafa';
        footer.innerHTML = '<span id="alt-tax-count" style="font:500 12px/1 sans-serif;color:#666">0 selected</span><button id="alt-tax-save" type="button" style="background:#8a1538;color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px">Save selection</button>';

        dialog.appendChild(toolbar);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        document.getElementById('alt-tax-close').onclick = function () { overlay.remove(); };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        var selectedIds = [];
        var lastFetched = [];

        send({
            action: 'fetchCurrentEntriesValue',
            handle: handle,
            rowId: rowId,
            requestId: requestId + ':current',
        });

        onReply(requestId + ':current', function (d) {
            selectedIds = Array.isArray(d.value) ? d.value.slice() : [];
            fetchTerms('');
        });

        function fetchTerms(search) {
            body.innerHTML = '<div style="text-align:center;padding:30px;color:#888">Loading…</div>';
            var fid = String(Date.now()) + ':tfetch:' + Math.random();
            onReply(fid, function (d) {
                lastFetched = d.terms || [];
                renderList();
            });
            send({
                action: 'fetchTaxonomyTerms',
                taxonomies: taxonomies,
                search: search,
                requestId: fid,
            });
        }

        function renderList() {
            body.innerHTML = '';
            if (!lastFetched.length) { body.innerHTML = '<div style="text-align:center;padding:30px;color:#888">No terms found.</div>'; updateCount(); return; }
            lastFetched.forEach(function (term) {
                var isSel = selectedIds.indexOf(term.id) !== -1 || selectedIds.indexOf(term.slug) !== -1;
                var row = document.createElement('label');
                row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px;cursor:pointer;background:' + (isSel ? '#fff0f3' : '#fff');
                row.onmouseenter = function () { if (!isSel) row.style.background = '#fafafa'; };
                row.onmouseleave = function () { if (!isSel) row.style.background = '#fff'; };

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = isSel;
                cb.style.cssText = 'width:16px;height:16px;accent-color:#8a1538;cursor:pointer';
                cb.onchange = function () {
                    var idx = selectedIds.indexOf(term.id);
                    if (cb.checked && idx === -1) {
                        if (max && selectedIds.length >= max) { cb.checked = false; return; }
                        selectedIds.push(term.id);
                    } else if (!cb.checked && idx !== -1) selectedIds.splice(idx, 1);
                    isSel = cb.checked;
                    row.style.background = isSel ? '#fff0f3' : '#fff';
                    updateCount();
                };

                var info = document.createElement('div');
                info.style.cssText = 'flex:1';
                info.innerHTML = '<div style="font:600 13px/1.2 sans-serif;color:#111">' + esc(term.title || term.slug) + '</div>' +
                    '<div style="font:400 11px/1.2 sans-serif;color:#888;margin-top:3px">' + esc((term.taxonomy_title || term.taxonomy) + ' · ' + term.slug) + '</div>';
                row.appendChild(cb);
                row.appendChild(info);
                body.appendChild(row);
            });
            updateCount();
        }

        function updateCount() {
            document.getElementById('alt-tax-count').textContent = selectedIds.length + ' selected' + (max ? ' (max ' + max + ')' : '');
        }

        document.getElementById('alt-tax-search').oninput = function () {
            fetchTerms(document.getElementById('alt-tax-search').value);
        };
        document.getElementById('alt-tax-save').onclick = function () {
            send({
                action: 'setEntriesField',
                handle: handle,
                rowId: rowId,
                value: selectedIds,
            });
            overlay.remove();
        };
    }

    function enhanceAll(root) {
        var scope = root || document;
        scope.querySelectorAll('[data-alt-row="1"]').forEach(enhanceRow);
        scope.querySelectorAll(SELECTOR).forEach(enhance);
        scope.querySelectorAll('[data-alt-editable-image-handle]').forEach(enhanceImage);
        scope.querySelectorAll('[data-alt-editable-tags-handle]').forEach(enhanceTags);
        scope.querySelectorAll('[data-alt-editable-entries-handle]').forEach(enhanceEntries);
        scope.querySelectorAll('[data-alt-editable-taxonomy-handle]').forEach(enhanceTaxonomy);
    }

    function showActiveBadge() {
        if (document.getElementById('alt-live-editor-badge')) return;
        var badge = document.createElement('div');
        badge.id = 'alt-live-editor-badge';
        badge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:6px;box-shadow:0 0 0 0 rgba(22,163,74,.7);animation:alte-pulse 2s infinite;"></span>Live Editor active';
        badge.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:2147483645;background:rgba(17,24,39,.92);color:#fff;padding:8px 14px;border-radius:999px;font:600 12px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.3px;box-shadow:0 4px 12px rgba(0,0,0,.25);user-select:none;backdrop-filter:blur(4px);';

        var style = document.createElement('style');
        style.textContent = '.alt-le-control:focus-visible{outline:2px solid #2563eb;outline-offset:2px}@keyframes alte-pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.7)}70%{box-shadow:0 0 0 8px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}';
        document.head.appendChild(style);

        document.body.appendChild(badge);
    }

    function showSaveButton() {
        if (document.getElementById('alt-live-editor-save')) return;
        var btn = document.createElement('button');
        btn.id = 'alt-live-editor-save';
        btn.type = 'button';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-3px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save changes';
        btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483645;background:#16a34a;color:#fff;padding:10px 18px;border:0;border-radius:999px;font:600 13px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.3px;cursor:pointer;box-shadow:0 6px 16px rgba(22,163,74,.4);backdrop-filter:blur(4px);transition:transform 120ms, box-shadow 120ms;';
        btn.onmouseenter = function () { btn.style.transform = 'translateY(-2px)'; btn.style.boxShadow = '0 8px 20px rgba(22,163,74,.5)'; };
        btn.onmouseleave = function () { btn.style.transform = ''; btn.style.boxShadow = '0 6px 16px rgba(22,163,74,.4)'; };
        btn.onclick = function () {
            btn.disabled = true;
            btn.innerHTML = 'Saving…';
            send({ action: 'savePublish' });
            setTimeout(function () { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-3px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save changes'; }, 2000);
        };
        document.body.appendChild(btn);
    }

    function setupFloatingFormatToolbar() {
        var toolbar = document.createElement('div');
        toolbar.id = 'alt-format-toolbar';
        toolbar.style.cssText = 'position:absolute;background:#111827;color:#fff;border-radius:6px;padding:4px;display:none;z-index:2147483646;box-shadow:0 8px 20px rgba(0,0,0,.35);font-family:-apple-system,Segoe UI,sans-serif;';

        function btn(label, html, action) {
            var b = document.createElement('button');
            b.type = 'button';
            b.title = label;
            b.setAttribute('aria-label', label);
            b.className = 'alt-le-control';
            b.innerHTML = html;
            b.style.cssText = 'background:transparent;border:0;color:#fff;width:30px;height:30px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:600;display:inline-flex;align-items:center;justify-content:center';
            b.onmousedown = function (e) { e.preventDefault(); };
            b.onmouseenter = function () { b.style.background = 'rgba(255,255,255,.1)'; };
            b.onmouseleave = function () { b.style.background = 'transparent'; };
            b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); action(); };
            return b;
        }

        toolbar.appendChild(btn('Bold (Cmd+B)', '<b>B</b>', function () { document.execCommand('bold'); }));
        toolbar.appendChild(btn('Italic (Cmd+I)', '<i>I</i>', function () { document.execCommand('italic'); }));
        toolbar.appendChild(btn('Underline (Cmd+U)', '<u>U</u>', function () { document.execCommand('underline'); }));
        toolbar.appendChild(btn('Link (Cmd+K)', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>', function () {
            var url = prompt('URL:', 'https://');
            if (url) document.execCommand('createLink', false, url);
        }));
        toolbar.appendChild(btn('Clear', '×', function () { document.execCommand('removeFormat'); }));

        document.body.appendChild(toolbar);

        document.addEventListener('selectionchange', function () {
            var sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
                toolbar.style.display = 'none';
                return;
            }
            // Only show inside a Bard contenteditable
            var anchor = sel.anchorNode;
            var bardHost = null;
            while (anchor) {
                if (anchor.nodeType === 1 && anchor.hasAttribute && anchor.hasAttribute('data-alt-editable-bard')) {
                    bardHost = anchor;
                    break;
                }
                anchor = anchor.parentNode;
            }
            if (!bardHost) {
                toolbar.style.display = 'none';
                return;
            }
            var rect = sel.getRangeAt(0).getBoundingClientRect();
            toolbar.style.display = 'block';
            toolbar.style.left = (rect.left + window.scrollX + (rect.width / 2) - 80) + 'px';
            toolbar.style.top = (rect.top + window.scrollY - 42) + 'px';
        });
    }

    function init() {
        showActiveBadge();
        showSaveButton();
        setupFloatingFormatToolbar();
        setupDragDrop();
        suppressLinkNavigation();
        enhanceAll(document);

        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.matches && node.matches(SELECTOR)) enhance(node);
                    if (node.querySelectorAll) enhanceAll(node);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
