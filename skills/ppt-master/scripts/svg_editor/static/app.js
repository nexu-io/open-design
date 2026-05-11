/* ============================================================
   PPT Master - SVG Editor  |  app.js
   Vanilla JS, IIFE pattern
   ============================================================ */
(function () {
    "use strict";

    // ---- DOM refs ---------------------------------------------------
    var slideListEl       = document.getElementById("slide-list");
    var svgPlaceholder    = document.getElementById("svg-placeholder");
    var svgContent        = document.getElementById("svg-content");
    var selectedElementEl = document.getElementById("selected-element");
    var annotationInput   = document.getElementById("annotation-input");
    var annotationText    = document.getElementById("annotation-text");
    var btnAddAnnotation  = document.getElementById("btn-add-annotation");
    var annotationsEl     = document.getElementById("annotations");
    var btnSave           = document.getElementById("btn-save");
    var modalOverlay      = document.getElementById("modal-overlay");
    var modalMessage      = document.getElementById("modal-message");
    var modalConfirm      = document.getElementById("modal-confirm");
    var modalCancel       = document.getElementById("modal-cancel");
    var elementPropsEl    = document.getElementById("element-props");

    // ---- State ------------------------------------------------------
    var currentSlide      = null;   // filename, e.g. "slide_01.svg"
    var selectedElementIds = new Set(); // id attrs of selected SVG elements
    var slideAnnotations  = {};     // {element_id: annotation_text} for current slide

    // ================================================================
    //  1.  loadSlides  -- GET /api/slides
    // ================================================================
    function loadSlides() {
        fetch("/api/slides")
            .then(function (res) { return res.json(); })
            .then(function (data) {
                slideListEl.innerHTML = "";
                (data.slides || []).forEach(function (s) {
                    var item = document.createElement("div");
                    item.className = "slide-item" + (s.name === currentSlide ? " active" : "");
                    item.setAttribute("data-name", s.name);

                    var nameSpan = document.createElement("span");
                    nameSpan.className = "slide-name";
                    nameSpan.textContent = s.name;
                    item.appendChild(nameSpan);

                    if (s.annotation_count > 0) {
                        var badge = document.createElement("span");
                        badge.className = "badge";
                        badge.textContent = s.annotation_count;
                        item.appendChild(badge);
                    }

                    item.addEventListener("click", function () {
                        selectSlide(s.name, item);
                    });
                    slideListEl.appendChild(item);
                });
            })
            .catch(function (err) {
                console.error("loadSlides:", err);
                showError("Failed to load slides: " + err.message);
            });
    }

    // ================================================================
    //  2.  selectSlide  -- GET /api/slide/{name}
    // ================================================================
    function selectSlide(name, el) {
        // Update active class in sidebar
        document.querySelectorAll(".slide-item").forEach(function (it) {
            it.classList.remove("active");
        });
        if (el) el.classList.add("active");

        currentSlide = name;
        selectedElementIds.clear();
        slideAnnotations = {};

        // Reset right panel and rubber band
        cancelRubberBand();
        clearSelection();

        fetch("/api/slide/" + encodeURIComponent(name))
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    console.error("selectSlide:", data.error);
                    return;
                }
                // Render SVG
                svgPlaceholder.style.display = "none";
                svgContent.style.display = "block";
                svgContent.innerHTML = sanitizeSvg(data.content);

                // Build annotations map from response
                (data.annotations || []).forEach(function (a) {
                    slideAnnotations[a.element_id] = a.annotation;
                });

                setupSvgInteraction();
                refreshAnnotationVisuals();
                updateAnnotationList();
            })
            .catch(function (err) {
                console.error("selectSlide:", err);
                showError("Failed to load slide: " + err.message);
            });
    }

    // ================================================================
    //  3.  setupSvgInteraction
    // ================================================================
    var SKIP_TAGS = ["defs", "style", "title", "desc"];

    function setupSvgInteraction() {
        var svg = svgContent.querySelector("svg");
        if (!svg) return;

        var allEls = svg.querySelectorAll("*");
        allEls.forEach(function (el) {
            var tag = el.tagName.toLowerCase();
            if (SKIP_TAGS.indexOf(tag) !== -1) return;
            if (el === svg) return;

            el.classList.add("svg-selectable");

            el.addEventListener("click", function (e) {
                e.stopPropagation();
                selectElement(el, e.ctrlKey || e.metaKey);
            });
        });

        // Click on blank area clears selection (skip the synthetic click after rubber band)
        svg.addEventListener("click", function (e) {
            if (suppressNextSvgClick) {
                suppressNextSvgClick = false;
                return;
            }
            if (e.target === svg) clearSelection();
        });
    }

    // ================================================================
    //  4.  selectElement
    // ================================================================
    function selectElement(elem, addToSelection) {
        var eid = elem.id;
        if (!eid) return;

        if (addToSelection) {
            // Ctrl+click: toggle this element
            if (selectedElementIds.has(eid)) {
                selectedElementIds.delete(eid);
                elem.classList.remove("svg-selected");
            } else {
                selectedElementIds.add(eid);
                elem.classList.add("svg-selected");
            }
        } else {
            // Normal click: clear others, select only this one
            selectedElementIds.forEach(function (id) {
                if (id !== eid) {
                    var old = svgContent.querySelector("#" + CSS.escape(id));
                    if (old) old.classList.remove("svg-selected");
                }
            });
            selectedElementIds.clear();
            selectedElementIds.add(eid);
            elem.classList.add("svg-selected");
        }

        updateSelectionPanel();
    }

    // ================================================================
    //  5.  clearSelection
    // ================================================================
    function clearSelection() {
        selectedElementIds.forEach(function (id) {
            var el = svgContent.querySelector("#" + CSS.escape(id));
            if (el) el.classList.remove("svg-selected");
        });
        selectedElementIds.clear();
        updateSelectionPanel();
    }

    function updateSelectionPanel() {
        var propsEl = elementPropsEl;
        var count = selectedElementIds.size;

        if (count === 0) {
            selectedElementEl.classList.add("empty");
            selectedElementEl.innerHTML = "Click an element on the slide to select it";
            annotationInput.style.display = "none";
            annotationText.value = "";
            propsEl.style.display = "none";
            propsEl.innerHTML = "";
            return;
        }

        selectedElementEl.classList.remove("empty");
        propsEl.style.display = "block";

        if (count === 1) {
            var eid = selectedElementIds.values().next().value;
            var el = svgContent.querySelector("#" + CSS.escape(eid));
            if (el) {
                var tag = el.tagName.toLowerCase();
                selectedElementEl.innerHTML =
                    '<span class="el-tag">&lt;' + escapeHtml(tag) + '&gt;</span>' +
                    '<span class="el-id">' + escapeHtml(eid) + '</span>';
                propsEl.innerHTML = renderPropertyTable(getElementProperties(el));
            }
        } else {
            selectedElementEl.innerHTML =
                '<span class="multi-count">' + count + ' elements selected</span>';
            propsEl.innerHTML = renderMultiSelectSummary(Array.from(selectedElementIds));
        }

        annotationInput.style.display = "block";
        annotationText.placeholder = count > 1
            ? "Describe how to modify all " + count + " elements..."
            : "Describe how the AI should modify this element...";
        annotationText.value = count === 1
            ? (slideAnnotations[selectedElementIds.values().next().value] || "")
            : "";
    }

    // ---- Rubber band selection ----
    var rubberBandEl = null;
    var rubberBandStart = null;
    var rubberBandUsed = false;
    var suppressNextSvgClick = false;
    var RUBBER_BAND_THRESHOLD = 5;

    function initRubberBand() {
        var overlay = document.getElementById("rubber-band-overlay");
        var container = document.getElementById("svg-container");

        container.addEventListener("mousedown", function (e) {
            // Only left mouse button
            if (e.button !== 0) return;

            // Always start tracking — rubber band only activates when
            // mousemove exceeds the threshold. This allows clicking on any
            // element (including SVG background rects) to still trigger
            // the element's click handler for selection.
            rubberBandStart = { x: e.clientX, y: e.clientY };
            rubberBandUsed = false;
        });

        document.addEventListener("mousemove", function (e) {
            if (!rubberBandStart) return;

            var dx = e.clientX - rubberBandStart.x;
            var dy = e.clientY - rubberBandStart.y;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < RUBBER_BAND_THRESHOLD) {
                return;
            }

            // Threshold exceeded — this is a drag, not a click
            if (!rubberBandUsed) {
                rubberBandUsed = true;
                overlay.classList.add("active");
            }

            if (!rubberBandEl) {
                rubberBandEl = document.createElement("div");
                rubberBandEl.id = "rubber-band";
                document.body.appendChild(rubberBandEl);
            }

            var x = Math.min(rubberBandStart.x, e.clientX);
            var y = Math.min(rubberBandStart.y, e.clientY);
            var w = Math.abs(dx);
            var h = Math.abs(dy);

            rubberBandEl.style.left = x + "px";
            rubberBandEl.style.top = y + "px";
            rubberBandEl.style.width = w + "px";
            rubberBandEl.style.height = h + "px";
        });

        document.addEventListener("mouseup", function (e) {
            if (!rubberBandStart) return;

            overlay.classList.remove("active");

            var dx = e.clientX - rubberBandStart.x;
            var dy = e.clientY - rubberBandStart.y;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (rubberBandEl) {
                rubberBandEl.remove();
                rubberBandEl = null;
            }

            // Only process if drag was beyond threshold
            if (dist >= RUBBER_BAND_THRESHOLD) {
                var rect = {
                    left: Math.min(rubberBandStart.x, e.clientX),
                    top: Math.min(rubberBandStart.y, e.clientY),
                    right: Math.max(rubberBandStart.x, e.clientX),
                    bottom: Math.max(rubberBandStart.y, e.clientY)
                };

                if (!e.ctrlKey && !e.metaKey) {
                    clearSelection();
                }

                selectByRubberBand(rect);
                suppressNextSvgClick = true;
                window.setTimeout(function () {
                    suppressNextSvgClick = false;
                }, 50);
            } else {
                // Below threshold: treat as click on empty space
                if (!e.ctrlKey && !e.metaKey) {
                    clearSelection();
                }
            }

            rubberBandStart = null;
        });
    }

    function cancelRubberBand() {
        rubberBandStart = null;
        if (rubberBandEl) {
            rubberBandEl.remove();
            rubberBandEl = null;
        }
        var ov = document.getElementById("rubber-band-overlay");
        if (ov) ov.classList.remove("active");
        suppressNextSvgClick = false;
    }

    function selectByRubberBand(screenRect) {
        var svg = svgContent.querySelector("svg");
        if (!svg) return;

        var selectableEls = svg.querySelectorAll(".svg-selectable");
        selectableEls.forEach(function (el) {
            try {
                var bbox = el.getBBox();
                var ctm = el.getScreenCTM();
                if (!ctm) return;

                // Transform bbox corners to screen coordinates
                var corners = [
                    { x: bbox.x, y: bbox.y },
                    { x: bbox.x + bbox.width, y: bbox.y },
                    { x: bbox.x, y: bbox.y + bbox.height },
                    { x: bbox.x + bbox.width, y: bbox.y + bbox.height }
                ];

                var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                corners.forEach(function (c) {
                    var sx = c.x * ctm.a + c.y * ctm.c + ctm.e;
                    var sy = c.x * ctm.b + c.y * ctm.d + ctm.f;
                    if (sx < minX) minX = sx;
                    if (sy < minY) minY = sy;
                    if (sx > maxX) maxX = sx;
                    if (sy > maxY) maxY = sy;
                });

                // AABB intersection
                if (minX < screenRect.right && maxX > screenRect.left &&
                    minY < screenRect.bottom && maxY > screenRect.top) {
                    var eid = el.id;
                    if (eid) {
                        selectedElementIds.add(eid);
                        el.classList.add("svg-selected");
                    }
                }
            } catch (err) {
                // getBBox can throw for elements with no geometry
            }
        });

        updateSelectionPanel();
    }

    // ================================================================
    //  Keyboard shortcuts
    // ================================================================
    function initKeyboardShortcuts() {
        document.addEventListener("keydown", function (e) {
            // Ctrl+A / Cmd+A: select all elements
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                // Don't intercept if focus is in textarea
                if (document.activeElement === annotationText) return;

                e.preventDefault();
                var svg = svgContent.querySelector("svg");
                if (!svg) return;

                svg.querySelectorAll(".svg-selectable").forEach(function (el) {
                    var eid = el.id;
                    if (eid) {
                        selectedElementIds.add(eid);
                        el.classList.add("svg-selected");
                    }
                });
                updateSelectionPanel();
            }

            // Escape: clear selection (skip if textarea is focused)
            if (e.key === "Escape") {
                if (document.activeElement === annotationText) return;
                clearSelection();
            }
        });
    }

    // ================================================================
    //  6.  Add annotation  -- POST /api/slide/{name}/annotate
    // ================================================================
    btnAddAnnotation.addEventListener("click", function () {
        if (!currentSlide || selectedElementIds.size === 0) return;

        var text = annotationText.value.trim();
        if (!text) return;

        var ids = Array.from(selectedElementIds);
        var promises = ids.map(function (eid) {
            return fetch("/api/slide/" + encodeURIComponent(currentSlide) + "/annotate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ element_id: eid, annotation: text })
            }).then(jsonOrThrow);
        });

        Promise.all(promises)
            .then(function () {
                ids.forEach(function (eid) {
                    slideAnnotations[eid] = text;
                });
                refreshAnnotationVisuals();
                updateAnnotationList();
                annotationText.value = "";
                loadSlides();
            })
            .catch(function (err) {
                console.error("addAnnotation:", err);
                showError("Failed to add annotation: " + err.message);
            });
    });

    // ================================================================
    //  7.  removeAnnotation  -- DELETE /api/slide/{name}/annotate/{id}
    // ================================================================
    function removeAnnotation(elementId) {
        if (!currentSlide) return;

        fetch("/api/slide/" + encodeURIComponent(currentSlide) + "/annotate/" + encodeURIComponent(elementId), {
            method: "DELETE"
        })
            .then(function (res) { return res.json(); })
            .then(function () {
                delete slideAnnotations[elementId];
                refreshAnnotationVisuals();
                updateAnnotationList();
                loadSlides();
            })
            .catch(function (err) {
                console.error("removeAnnotation:", err);
                showError("Failed to remove annotation: " + err.message);
            });
    }

    // ================================================================
    //  8.  refreshAnnotationVisuals
    // ================================================================
    function refreshAnnotationVisuals() {
        // Clear all annotated marks
        svgContent.querySelectorAll(".svg-annotated").forEach(function (el) {
            el.classList.remove("svg-annotated");
        });
        // Apply marks
        Object.keys(slideAnnotations).forEach(function (eid) {
            var el = svgContent.querySelector("#" + CSS.escape(eid));
            if (el) el.classList.add("svg-annotated");
        });
    }

    // ================================================================
    //  9.  updateAnnotationList
    // ================================================================
    function updateAnnotationList() {
        annotationsEl.innerHTML = "";

        var ids = Object.keys(slideAnnotations);
        if (ids.length === 0) {
            annotationsEl.innerHTML = '<div class="annotations-empty">No annotations yet</div>';
            return;
        }

        ids.forEach(function (eid) {
            var item = document.createElement("div");
            item.className = "annotation-item";

            // Try to resolve tag from live SVG
            var tag = "";
            var el = svgContent.querySelector("#" + CSS.escape(eid));
            if (el) tag = el.tagName.toLowerCase();

            var header = document.createElement("div");
            header.className = "ann-header";

            var leftSpan = document.createElement("span");
            if (tag) {
                var tagSpan = document.createElement("span");
                tagSpan.className = "ann-tag";
                tagSpan.textContent = "<" + tag + ">";
                leftSpan.appendChild(tagSpan);
            }
            var idSpan = document.createElement("span");
            idSpan.className = "ann-id";
            idSpan.textContent = eid;
            leftSpan.appendChild(idSpan);

            header.appendChild(leftSpan);

            var removeBtn = document.createElement("button");
            removeBtn.className = "ann-remove";
            removeBtn.innerHTML = "&times;";
            removeBtn.title = "Remove annotation";
            removeBtn.addEventListener("click", function () {
                removeAnnotation(eid);
            });
            header.appendChild(removeBtn);

            item.appendChild(header);

            var textDiv = document.createElement("div");
            textDiv.className = "ann-text";
            textDiv.textContent = slideAnnotations[eid];
            item.appendChild(textDiv);

            annotationsEl.appendChild(item);
        });
    }

    // ================================================================
    // 10.  Save all  -- two-step: confirm then save + shutdown
    // ================================================================
    var CONFIRM_MSG = "Submitting will close this page. Make sure you've added all the annotations you want.";
    var SUCCESS_MSG = "Annotations submitted.\n\nReturn to the chat and tell the AI you're ready — it will apply your edits.";

    btnSave.addEventListener("click", function () {
        // Step 1: show confirmation
        modalMessage.textContent = CONFIRM_MSG;
        modalConfirm.style.display = "";
        modalCancel.style.display = "";
        modalOverlay.style.display = "flex";
    });

    modalConfirm.addEventListener("click", function () {
        // Step 2: save + shutdown
        modalConfirm.style.display = "none";
        modalCancel.style.display = "none";

        fetch("/api/save-all", { method: "POST" })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    modalMessage.textContent = "Save failed: " + data.error;
                } else {
                    modalMessage.textContent = SUCCESS_MSG;
                    fetch("/api/shutdown", { method: "POST" }).catch(function () {});
                }
            })
            .catch(function (err) {
                modalMessage.textContent = "Save failed: " + err;
            });
    });

    modalCancel.addEventListener("click", function () {
        modalOverlay.style.display = "none";
    });

    // Close modal on overlay click
    modalOverlay.addEventListener("click", function (e) {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = "none";
        }
    });

    // ================================================================
    //  Utility
    // ================================================================
    function sanitizeSvg(svgString) {
        var doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
        doc.querySelectorAll("script,foreignObject").forEach(function (el) { el.remove(); });
        doc.querySelectorAll("*").forEach(function (el) {
            Array.from(el.attributes).forEach(function (attr) {
                if (attr.name.indexOf("on") === 0) el.removeAttribute(attr.name);
                // Strip dangerous URI protocols from href/xlink:href
                if ((attr.name === "href" || attr.name === "xlink:href") &&
                    (/^\s*javascript\s*:/i.test(attr.value) ||
                     /^\s*data\s*:/i.test(attr.value))) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return new XMLSerializer().serializeToString(doc.documentElement);
    }

    function showError(msg) {
        var banner = document.createElement("div");
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;padding:10px 16px;background:#ef4444;color:#fff;font-size:13px;text-align:center;z-index:999;cursor:pointer;";
        banner.textContent = msg;
        banner.onclick = function () { banner.remove(); };
        document.body.appendChild(banner);
        setTimeout(function () { banner.remove(); }, 5000);
    }

    function escapeHtml(str) {
        var d = document.createElement("div");
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
    }

    function jsonOrThrow(res) {
        return res.json().then(function (data) {
            if (!res.ok || data.error) {
                throw new Error(data.error || ("Request failed with status " + res.status));
            }
            return data;
        });
    }

    // ================================================================
    //  Property extraction & rendering
    // ================================================================
    function getElementProperties(elem) {
        var props = {};
        var tag = elem.tagName.toLowerCase();
        var style = window.getComputedStyle(elem);

        // Position (common to all)
        try {
            var bbox = elem.getBBox();
            props["position"] = Math.round(bbox.x) + ", " + Math.round(bbox.y);
            props["size"] = Math.round(bbox.width) + " x " + Math.round(bbox.height);
        } catch (e) {
            // no geometry
        }

        if (tag === "text" || tag === "tspan") {
            props["font"] = style.fontFamily || elem.getAttribute("font-family") || "";
            props["font-size"] = style.fontSize || elem.getAttribute("font-size") || "";
            props["font-weight"] = style.fontWeight || elem.getAttribute("font-weight") || "";
            props["fill"] = style.fill || elem.getAttribute("fill") || "";
            props["anchor"] = elem.getAttribute("text-anchor") || style.textAnchor || "";
            var text = elem.textContent || "";
            if (text.length > 50) text = text.substring(0, 50) + "...";
            props["content"] = text;
        } else if (tag === "rect") {
            props["fill"] = elem.getAttribute("fill") || style.fill || "";
            props["stroke"] = elem.getAttribute("stroke") || style.stroke || "";
        } else if (tag === "circle") {
            props["r"] = elem.getAttribute("r") || "";
            props["fill"] = elem.getAttribute("fill") || style.fill || "";
            props["stroke"] = elem.getAttribute("stroke") || style.stroke || "";
        } else if (tag === "ellipse") {
            props["rx"] = elem.getAttribute("rx") || "";
            props["ry"] = elem.getAttribute("ry") || "";
            props["fill"] = elem.getAttribute("fill") || style.fill || "";
        } else if (tag === "image") {
            var href = elem.getAttribute("href") || elem.getAttribute("xlink:href") || "";
            var parts = href.split("/");
            props["file"] = parts[parts.length - 1] || href;
        } else if (tag === "path") {
            props["fill"] = elem.getAttribute("fill") || style.fill || "";
            props["stroke"] = elem.getAttribute("stroke") || style.stroke || "";
        }

        return props;
    }

    function isSafeColor(val) {
        // Only allow values that look like CSS colors (hex, rgb, rgba, hsl, named).
        // Reject anything with ; : url @ \ to prevent CSS injection.
        return val.length < 100 && !/[;:@\\]|url\s*\(/i.test(val);
    }

    function renderPropertyTable(props) {
        var html = '<table class="prop-table">';
        Object.keys(props).forEach(function (key) {
            var val = props[key];
            if (!val) return;
            html += '<tr><td class="prop-key">' + escapeHtml(key) + '</td><td class="prop-val">';
            if ((key === "fill" || key === "stroke") && isSafeColor(val)) {
                html += '<span class="prop-color" style="background:' + escapeHtml(val) + ';"></span>';
            }
            html += escapeHtml(val) + '</td></tr>';
        });
        html += '</table>';
        return html;
    }

    function renderMultiSelectSummary(ids) {
        var typeCounts = {};
        var sharedFontSize = null;
        var allHaveFontSize = true;

        ids.forEach(function (eid) {
            var el = svgContent.querySelector("#" + CSS.escape(eid));
            if (!el) return;
            var tag = el.tagName.toLowerCase();
            typeCounts[tag] = (typeCounts[tag] || 0) + 1;

            if (tag === "text" || tag === "tspan") {
                var fs = window.getComputedStyle(el).fontSize || el.getAttribute("font-size") || "";
                if (sharedFontSize === null) {
                    sharedFontSize = fs;
                } else if (sharedFontSize !== fs) {
                    sharedFontSize = "mixed";
                }
            } else {
                allHaveFontSize = false;
            }
        });

        var summary = '<div class="multi-summary">';
        var parts = [];
        Object.keys(typeCounts).forEach(function (tag) {
            parts.push(typeCounts[tag] + " " + tag);
        });
        summary += parts.join(", ");

        if (allHaveFontSize && sharedFontSize && sharedFontSize !== "mixed") {
            summary += ' | font-size: ' + escapeHtml(sharedFontSize);
        } else if (allHaveFontSize && sharedFontSize === "mixed") {
            summary += ' | font-size: mixed';
        }
        summary += '</div>';

        // Element list
        summary += '<div class="multi-el-list">';
        ids.forEach(function (eid) {
            var el = svgContent.querySelector("#" + CSS.escape(eid));
            if (!el) return;
            var tag = el.tagName.toLowerCase();
            summary += '<div class="multi-el-item"><span class="el-tag">&lt;' +
                escapeHtml(tag) + '&gt;</span>' + escapeHtml(eid) + '</div>';
        });
        summary += '</div>';

        return summary;
    }

    // ================================================================
    //  Boot
    // ================================================================
    loadSlides();
    initRubberBand();
    initKeyboardShortcuts();
})();
