// ==UserScript==
// @name         智慧医疗－住院病案首页可编辑打印与诊断桥接
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  修复第一页识别：兼容普通白色div、Canvas/SVG、Shadow DOM及未知类名页面；新增手动点选第一页；保留诊断桥接、编辑校准与打印功能
// @match        *://11.12.199.244:8003/*
// @match        *://11.12.199.244:8000/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) {
        return;
    }

    const IS_DIAGNOSIS_HOST = location.port === '8003';
    const IS_PRINT_HOST = location.port === '8000';

    const IDS = Object.freeze({
        panel: 'medical-record-print-editor-panel-v1',
        style: 'medical-record-print-editor-style-v1',
        status: 'medical-record-print-editor-status-v1',
        overlay: 'medical-record-print-editor-overlay-v1',
        calibration: 'medical-record-print-editor-calibration-v1'
    });

    const KEYS = Object.freeze({
        diagnosisRecords: 'medicalRecordPrintDiagnosisRecordsV1',
        editorDrafts: 'medicalRecordPrintEditorDraftsV1',
        panelPosition: 'medicalRecordPrintEditorPanelPositionV1',
        panelCollapsed: 'medicalRecordPrintEditorPanelCollapsedV1'
    });

    const SETTINGS = Object.freeze({
        maxDiagnosisRecords: 30,
        diagnosisRowsPerHalf: 9,
        defaultFontFamily: 'SimSun, 宋体, serif',

        /*
         * 截图所示住院病案首页第一页诊断表的数据区默认位置。
         * 坐标均相对于整张纸，使用0～1比例；页面缩放后仍保持对齐。
         * 若不同模板位置有偏差，点击“校准诊断区域”拖动、缩放蓝框即可。
         */
        defaultDiagnosisArea: {
            left: 0.049,
            top: 0.635,
            width: 0.902,
            height: 0.219
        },

        /*
         * 入院病情在病案首页打印表中的数字编码。
         */
        admissionCodeMap: {
            '有': '1',
            '临床未确定': '2',
            '情况不明': '3',
            '无': '4'
        }
    });

    const state = {
        page: null,
        overlay: null,
        calibration: null,
        calibrationVisible: false,
        selectedElement: null,
        diagnosisItems: [],
        customItems: [],
        diagnosisArea: null,
        editMode: true,
        captureTimer: null,
        resizeObserver: null,
        manualLocateActive: false
    };

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function normalizeText(value) {
        return String(value || '')
            .replace(/\s+/g, '')
            .replace(/[：:]/g, '')
            .trim();
    }

    function plainText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function clamp(value, minimum, maximum) {
        return Math.min(Math.max(Number(value), minimum), maximum);
    }

    function isVisible(element) {
        if (!element || !element.isConnected) {
            return false;
        }

        const win = element.ownerDocument.defaultView;
        const style = win.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0;
    }

    function allSameOriginDocuments() {
        const result = [];
        const seen = new Set();

        function collect(doc) {
            if (!doc || seen.has(doc)) {
                return;
            }

            seen.add(doc);
            result.push(doc);

            let frames = [];

            try {
                frames = Array.from(doc.querySelectorAll('iframe,frame'));
            }
            catch (error) {
                return;
            }

            frames.forEach(function (frame) {
                try {
                    collect(frame.contentDocument || frame.contentWindow.document);
                }
                catch (error) {
                    // 跨域框架跳过。
                }
            });
        }

        collect(document);
        return result;
    }

    function showStatus(message, type, duration) {
        let box = document.getElementById(IDS.status);

        if (!box) {
            box = document.createElement('div');
            box.id = IDS.status;
            document.body.appendChild(box);
        }

        const colors = {
            normal: '#159bd3',
            success: '#20985b',
            warning: '#b7791f',
            error: '#dc4c40'
        };

        Object.assign(box.style, {
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            zIndex: '2147483647',
            minWidth: '340px',
            maxWidth: '760px',
            padding: '12px 15px',
            borderRadius: '6px',
            background: colors[type || 'normal'] || colors.normal,
            color: '#ffffff',
            fontSize: '13px',
            lineHeight: '1.7',
            whiteSpace: 'pre-line',
            boxShadow: '0 4px 15px rgba(0,0,0,.28)',
            pointerEvents: 'none'
        });

        box.textContent = message;
        clearTimeout(box.hideTimer);
        box.hideTimer = setTimeout(function () {
            box.remove();
        }, duration || (type === 'error' ? 12000 : 7000));
    }

    function loadObject(key, fallback) {
        const value = GM_getValue(key, fallback);

        if (!value || typeof value !== 'object') {
            return fallback;
        }

        return value;
    }

    function safeArray(value) {
        return Array.isArray(value) ? value : [];
    }

    /******************************************************************
     * 一、8003诊断列表页面：自动采集诊断脚本结果
     ******************************************************************/

    function readPatientIdentityFromText(text) {
        const source = plainText(text);
        let name = '';
        let inpatientNo = '';

        const slashPattern = source.match(
            /([\u4e00-\u9fa5·]{2,8})\s*[\/｜|]\s*(男|女)\s*[\/｜|]\s*\d{1,3}\s*岁[\s\S]{0,90}?[\/｜|]\s*(\d{4,12})(?:\D|$)/
        );

        if (slashPattern) {
            name = slashPattern[1];
            inpatientNo = slashPattern[3];
        }

        if (!name) {
            const nameMatch = source.match(/(?:患者姓名|病人姓名|姓名)\s*[：:]?\s*([\u4e00-\u9fa5·]{2,8})/);
            name = nameMatch ? nameMatch[1] : '';
        }

        if (!inpatientNo) {
            const numberMatch = source.match(/(?:住院号|病案号)\s*[：:]?\s*(\d{4,12})/);
            inpatientNo = numberMatch ? numberMatch[1] : '';
        }

        return {
            name: name,
            inpatientNo: inpatientNo
        };
    }

    function readCurrentPatientIdentity() {
        const texts = [];

        allSameOriginDocuments().forEach(function (doc) {
            try {
                const visibleHeaderCandidates = Array.from(
                    doc.querySelectorAll('body,header,.header,.patient-info,.userinfo,.layui-header')
                ).filter(isVisible);

                visibleHeaderCandidates.slice(0, 12).forEach(function (element) {
                    const value = plainText(element.innerText || element.textContent || '');

                    if (value && value.length < 6000) {
                        texts.push(value);
                    }
                });
            }
            catch (error) {
                // 忽略单个文档读取失败。
            }
        });

        for (const text of texts) {
            const identity = readPatientIdentityFromText(text);

            if (identity.name || identity.inpatientNo) {
                return identity;
            }
        }

        return {
            name: '',
            inpatientNo: ''
        };
    }

    function readDiagnosisRowsFromModal() {
        let modal = null;

        for (const doc of allSameOriginDocuments()) {
            modal = doc.getElementById('medical-diagnosis-auto-fill-modal-v2');

            if (modal) {
                break;
            }
        }

        if (!modal) {
            return [];
        }

        const rows = Array.from(
            modal.querySelectorAll('.diagnosis-result-body tr')
        );

        return rows.map(function (row, index) {
            function value(selector) {
                const element = row.querySelector(selector);

                if (!element) {
                    return '';
                }

                if ('value' in element) {
                    return String(element.value || '').trim();
                }

                return plainText(element.innerText || element.textContent || '');
            }

            const enabledElement = row.querySelector('.diag-enabled');
            const enabled = enabledElement ? enabledElement.checked : true;
            const category = value('.diag-category');

            return {
                enabled: enabled,
                order: index,
                sourceName: value('.diag-source'),
                standardName: value('.diag-standard'),
                systemCode: value('.diag-code').toUpperCase(),
                category: category,
                diagnosisType: value('.diag-type'),
                outcome: value('.diag-outcome'),
                admissionCondition: value('.diag-admission'),
                status: value('.diag-status')
            };
        }).filter(function (item) {
            return item.enabled &&
                item.category === '西医' &&
                (item.standardName || item.sourceName);
        });
    }

    function upsertDiagnosisRecord(record) {
        const records = safeArray(GM_getValue(KEYS.diagnosisRecords, []));
        const patientKey = record.inpatientNo || record.name || ('unknown-' + record.pageKey);
        const next = records.filter(function (item) {
            const key = item.inpatientNo || item.name || ('unknown-' + item.pageKey);
            return key !== patientKey;
        });

        next.unshift(record);

        GM_setValue(
            KEYS.diagnosisRecords,
            next.slice(0, SETTINGS.maxDiagnosisRecords)
        );
    }

    function captureDiagnosisResults(options) {
        const settings = options || {};
        const items = readDiagnosisRowsFromModal();

        if (!items.length) {
            if (!settings.silent) {
                showStatus('未在诊断列表操作窗口中读取到已勾选的西医诊断。', 'warning');
            }
            return null;
        }

        const identity = readCurrentPatientIdentity();
        const sortedItems = items.slice().sort(function (a, b) {
            const aPrimary = a.diagnosisType === '主要诊断' ? 0 : 1;
            const bPrimary = b.diagnosisType === '主要诊断' ? 0 : 1;

            if (aPrimary !== bPrimary) {
                return aPrimary - bPrimary;
            }

            return a.order - b.order;
        });

        const record = {
            name: identity.name,
            inpatientNo: identity.inpatientNo,
            savedAt: Date.now(),
            pageKey: location.pathname + location.search,
            items: sortedItems
        };

        upsertDiagnosisRecord(record);

        if (!settings.silent) {
            showStatus(
                '已同步' + sortedItems.length + '条西医诊断到病案首页打印桥接。\n' +
                '患者：' + (identity.name || '未识别') +
                '　住院号：' + (identity.inpatientNo || '未识别'),
                'success'
            );
        }

        return record;
    }

    function scheduleDiagnosisCapture(showMessage) {
        clearTimeout(state.captureTimer);

        const startedAt = Date.now();

        async function attempt() {
            const record = captureDiagnosisResults({
                silent: !showMessage
            });

            if (record || Date.now() - startedAt > 120000) {
                return;
            }

            state.captureTimer = setTimeout(attempt, 1500);
        }

        state.captureTimer = setTimeout(attempt, 500);
    }

    function initializeDiagnosisBridge() {
        document.addEventListener('click', function (event) {
            const target = event.target && event.target.closest
                ? event.target.closest('button,a,[role="button"],input[type="button"],input[type="submit"]')
                : null;

            if (!target) {
                return;
            }

            if (target.closest('.diag-fill')) {
                scheduleDiagnosisCapture(true);
                return;
            }

            const text = normalizeText(
                (target.tagName === 'INPUT' ? target.value : '') + ' ' +
                (target.innerText || target.textContent || '') + ' ' +
                (target.getAttribute('title') || '')
            );

            if (text.includes('F3') && text.includes('保存诊断')) {
                setTimeout(function () {
                    captureDiagnosisResults({ silent: false });
                }, 350);
            }
        }, true);

        window.addEventListener('beforeunload', function () {
            captureDiagnosisResults({ silent: true });
        });

        const observer = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (mutation) {
                const target = mutation.target;
                return target && target.closest &&
                    target.closest('#medical-diagnosis-auto-fill-modal-v2');
            });

            if (relevant) {
                clearTimeout(state.captureTimer);
                state.captureTimer = setTimeout(function () {
                    captureDiagnosisResults({ silent: true });
                }, 900);
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false
        });

        console.info('[病案首页打印桥接] 8003诊断采集已启用。');
    }

    /******************************************************************
     * 二、8000病案首页预览页：识别纸张和建立编辑层
     ******************************************************************/

    function collectOpenRoots(doc) {
        const roots = [];
        const seen = new Set();
        const queue = [doc];

        while (queue.length) {
            const root = queue.shift();

            if (!root || seen.has(root)) {
                continue;
            }

            seen.add(root);
            roots.push(root);

            let elements = [];

            try {
                elements = Array.from(root.querySelectorAll('*'));
            }
            catch (error) {
                elements = [];
            }

            elements.forEach(function (element) {
                if (element.shadowRoot && !seen.has(element.shadowRoot)) {
                    queue.push(element.shadowRoot);
                }
            });
        }

        return roots;
    }

    function queryAllOpenRoots(doc, selector) {
        const result = [];
        const seen = new Set();

        collectOpenRoots(doc).forEach(function (root) {
            let elements = [];

            try {
                elements = Array.from(root.querySelectorAll(selector));
            }
            catch (error) {
                elements = [];
            }

            elements.forEach(function (element) {
                if (!seen.has(element)) {
                    seen.add(element);
                    result.push(element);
                }
            });
        });

        return result;
    }

    function isEditorOwnedElement(element) {
        if (!element || !element.closest) {
            return false;
        }

        return Boolean(
            element.closest('#' + IDS.panel) ||
            element.closest('#' + IDS.status) ||
            element.closest('#' + IDS.overlay) ||
            element.closest('#' + IDS.calibration)
        );
    }

    function isPortraitPageRect(rect) {
        if (!rect) {
            return false;
        }

        if (
            rect.width < 180 ||
            rect.height < 250 ||
            rect.width > 2200 ||
            rect.height > 3300
        ) {
            return false;
        }

        const ratio = rect.width / rect.height;

        return ratio >= 0.48 && ratio <= 0.95;
    }

    function normalizePageContainer(element) {
        if (!element || !element.isConnected) {
            return null;
        }

        let current = element;

        /*
         * canvas、svg、img、object、embed自身不适合直接插入HTML编辑层，
         * 因此向上寻找尺寸相近的HTML容器。
         */
        for (let level = 0; current && level < 7; level += 1) {
            const rect = current.getBoundingClientRect();

            if (
                current instanceof current.ownerDocument.defaultView.HTMLElement &&
                isPortraitPageRect(rect) &&
                !/^(HTML|BODY)$/.test(current.tagName)
            ) {
                return current;
            }

            current = current.parentElement;
        }

        return null;
    }

    function addCandidateWithAncestors(result, element) {
        let current = element;

        for (let level = 0; current && level < 7; level += 1) {
            if (!isEditorOwnedElement(current)) {
                const normalized = normalizePageContainer(current);

                if (normalized) {
                    result.push(normalized);
                }
            }

            current = current.parentElement;
        }
    }

    function getPageCandidateElements(doc) {
        const result = [];
        const selectors = [
            '.page',
            '.pdf-page',
            '.pageContainer',
            '.viewer-page',
            '.canvasWrapper',
            '.sheet',
            '.paper',
            '.print-page',
            '.page-item',
            '.page-view',
            '.pdfViewer .page',
            '[data-page-number]',
            '[class*="page"]',
            '[id*="page"]',
            'canvas',
            'svg',
            'img',
            'object',
            'embed'
        ].join(',');

        queryAllOpenRoots(doc, selectors)
            .forEach(function (element) {
                addCandidateWithAncestors(result, element);
            });

        /*
         * 某些医院打印控件把整张纸作为普通白色div，
         * 类名中不含page，也没有canvas。这里额外扫描可见的竖版白色容器。
         */
        const allElements = queryAllOpenRoots(doc, 'div,section,article,main');

        allElements.slice(0, 10000)
            .forEach(function (element) {
                if (
                    isEditorOwnedElement(element) ||
                    !isVisible(element)
                ) {
                    return;
                }

                const rect = element.getBoundingClientRect();

                if (!isPortraitPageRect(rect)) {
                    return;
                }

                let style;

                try {
                    style = element.ownerDocument.defaultView.getComputedStyle(element);
                }
                catch (error) {
                    return;
                }

                const background = String(style.backgroundColor || '');
                const hasWhiteBackground =
                    background === 'rgb(255, 255, 255)' ||
                    background === 'rgba(255, 255, 255, 1)' ||
                    background === '#fff' ||
                    background === '#ffffff';

                const hasVisual =
                    element.querySelector &&
                    Boolean(element.querySelector('canvas,svg,img,object,embed'));

                const text = normalizeText(
                    element.innerText ||
                    element.textContent ||
                    ''
                );

                if (
                    hasWhiteBackground ||
                    hasVisual ||
                    text.includes('住院病案首页')
                ) {
                    result.push(element);
                }
            });

        /*
         * 再从视口中央几个点反查元素。截图中的第一页通常位于视口中央，
         * 即使它没有任何可识别类名，也能由elementsFromPoint找到。
         */
        const win = doc.defaultView;
        const points = [
            [0.50, 0.38],
            [0.50, 0.52],
            [0.42, 0.45],
            [0.58, 0.45]
        ];

        points.forEach(function (point) {
            let elements = [];

            try {
                elements = doc.elementsFromPoint(
                    win.innerWidth * point[0],
                    win.innerHeight * point[1]
                );
            }
            catch (error) {
                elements = [];
            }

            elements.forEach(function (element) {
                addCandidateWithAncestors(result, element);
            });
        });

        return Array.from(new Set(result));
    }

    function scorePageCandidate(element) {
        if (
            !isVisible(element) ||
            isEditorOwnedElement(element)
        ) {
            return Number.NEGATIVE_INFINITY;
        }

        const rect = element.getBoundingClientRect();

        if (!isPortraitPageRect(rect)) {
            return Number.NEGATIVE_INFINITY;
        }

        const ratio = rect.width / rect.height;
        const visualCount = element.querySelectorAll
            ? element.querySelectorAll('canvas,svg,img,object,embed').length
            : 0;
        const text = normalizeText(
            element.innerText ||
            element.textContent ||
            ''
        );

        let style = null;

        try {
            style = element.ownerDocument.defaultView.getComputedStyle(element);
        }
        catch (error) {
            style = null;
        }

        const background = style
            ? String(style.backgroundColor || '')
            : '';

        const hasWhiteBackground =
            background === 'rgb(255, 255, 255)' ||
            background === 'rgba(255, 255, 255, 1)' ||
            background === '#fff' ||
            background === '#ffffff';

        let score = rect.width * rect.height / 1000;

        score += visualCount * 1800;
        score -= Math.abs(ratio - 0.707) * 12000;
        score -= Math.max(0, rect.top) / 25;

        if (hasWhiteBackground) {
            score += 5000;
        }

        if (
            style &&
            style.boxShadow &&
            style.boxShadow !== 'none'
        ) {
            score += 900;
        }

        if (text.includes('住院病案首页')) {
            score += 18000;
        }

        if (element.getAttribute('data-page-number') === '1') {
            score += 12000;
        }
        else if (element.hasAttribute('data-page-number')) {
            score += 5000;
        }

        const classAndId = (
            String(element.className || '') +
            ' ' +
            String(element.id || '')
        ).toLowerCase();

        if (/page|paper|sheet/.test(classAndId)) {
            score += 3200;
        }

        /*
         * 页面容器通常不会大到覆盖整个查看器，面积过大时降权。
         */
        const viewportArea =
            element.ownerDocument.defaultView.innerWidth *
            element.ownerDocument.defaultView.innerHeight;

        if (rect.width * rect.height > viewportArea * 0.82) {
            score -= 14000;
        }

        return score;
    }

    function findAllPageCandidates() {
        const candidates = [];

        allSameOriginDocuments().forEach(function (doc) {
            getPageCandidateElements(doc)
                .forEach(function (element) {
                    const score = scorePageCandidate(element);

                    if (
                        Number.isFinite(score) &&
                        score > Number.NEGATIVE_INFINITY
                    ) {
                        const rect = element.getBoundingClientRect();

                        candidates.push({
                            doc: doc,
                            element: element,
                            score: score,
                            top: rect.top,
                            left: rect.left
                        });
                    }
                });
        });

        candidates.sort(function (a, b) {
            const aNumber = Number(
                a.element.getAttribute('data-page-number')
            );
            const bNumber = Number(
                b.element.getAttribute('data-page-number')
            );

            if (aNumber === 1 && bNumber !== 1) {
                return -1;
            }

            if (bNumber === 1 && aNumber !== 1) {
                return 1;
            }

            if (Math.abs(a.top - b.top) > 36) {
                return a.top - b.top;
            }

            return b.score - a.score;
        });

        const unique = [];

        candidates.forEach(function (candidate) {
            const duplicate = unique.some(function (item) {
                const first = item.element.getBoundingClientRect();
                const second = candidate.element.getBoundingClientRect();

                return (
                    Math.abs(first.left - second.left) < 6 &&
                    Math.abs(first.top - second.top) < 6 &&
                    Math.abs(first.width - second.width) < 8 &&
                    Math.abs(first.height - second.height) < 8
                );
            });

            if (!duplicate) {
                unique.push(candidate);
            }
        });

        return unique;
    }

    function findFirstPage() {
        const candidates = findAllPageCandidates();

        if (!candidates.length) {
            return null;
        }

        const numberedFirst = candidates.find(function (candidate) {
            return candidate.element.getAttribute('data-page-number') === '1';
        });

        if (numberedFirst) {
            return numberedFirst;
        }

        /*
         * 优先选择视口中部、A4比例最接近且得分最高的候选。
         */
        const visibleCandidates = candidates.filter(function (candidate) {
            const rect = candidate.element.getBoundingClientRect();
            const win = candidate.doc.defaultView;

            return (
                rect.bottom > 0 &&
                rect.top < win.innerHeight &&
                rect.right > 0 &&
                rect.left < win.innerWidth
            );
        });

        return (visibleCandidates.length
            ? visibleCandidates
            : candidates
        ).sort(function (a, b) {
            return b.score - a.score;
        })[0];
    }

    function findPageFromManualClick(doc, target, clientX, clientY) {
        const raw = [];
        const seen = new Set();

        function add(element) {
            if (!element || seen.has(element)) {
                return;
            }

            seen.add(element);
            raw.push(element);
        }

        let current = target;

        for (let level = 0; current && level < 10; level += 1) {
            add(current);
            current = current.parentElement;
        }

        try {
            doc.elementsFromPoint(clientX, clientY)
                .forEach(add);
        }
        catch (error) {
            // 旧浏览器不支持elementsFromPoint时仅使用事件目标。
        }

        const candidates = [];

        raw.forEach(function (element) {
            let ancestor = element;

            for (let level = 0; ancestor && level < 8; level += 1) {
                const normalized = normalizePageContainer(ancestor);

                if (
                    normalized &&
                    !isEditorOwnedElement(normalized)
                ) {
                    const rect = normalized.getBoundingClientRect();

                    if (
                        clientX >= rect.left &&
                        clientX <= rect.right &&
                        clientY >= rect.top &&
                        clientY <= rect.bottom
                    ) {
                        const baseScore = scorePageCandidate(normalized);
                        const areaPenalty =
                            rect.width * rect.height / 100000;

                        candidates.push({
                            doc: doc,
                            element: normalized,
                            score: baseScore - areaPenalty,
                            top: rect.top,
                            left: rect.left
                        });
                    }
                }

                ancestor = ancestor.parentElement;
            }
        });

        candidates.sort(function (a, b) {
            return b.score - a.score;
        });

        return candidates[0] || null;
    }

    function beginManualPageSelection() {
        if (state.manualLocateActive) {
            return;
        }

        state.manualLocateActive = true;
        const listeners = [];
        const previousCursors = [];

        showStatus(
            '请在第一页白色纸张内部单击一次。按Esc可取消手动定位。',
            'warning'
        );

        allSameOriginDocuments().forEach(function (doc) {
            previousCursors.push({
                doc: doc,
                cursor: doc.documentElement.style.cursor
            });

            doc.documentElement.style.cursor = 'crosshair';

            const handler = function (event) {
                if (
                    event.target &&
                    event.target.closest &&
                    event.target.closest('#' + IDS.panel)
                ) {
                    return;
                }

                const page = findPageFromManualClick(
                    doc,
                    event.target,
                    event.clientX,
                    event.clientY
                );

                cleanup();

                if (!page) {
                    showStatus(
                        '未能从点击位置识别纸张，请点击第一页白色区域中央后重试。',
                        'error'
                    );
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                initializePageEditor({
                    forcedPage: page,
                    silent: false
                });
            };

            doc.addEventListener(
                'pointerdown',
                handler,
                true
            );

            listeners.push({
                doc: doc,
                handler: handler
            });
        });

        const keyHandler = function (event) {
            if (event.key === 'Escape') {
                cleanup();
                showStatus('已取消手动定位。', 'normal');
            }
        };

        document.addEventListener(
            'keydown',
            keyHandler,
            true
        );

        function cleanup() {
            if (!state.manualLocateActive) {
                return;
            }

            state.manualLocateActive = false;

            listeners.forEach(function (item) {
                item.doc.removeEventListener(
                    'pointerdown',
                    item.handler,
                    true
                );
            });

            previousCursors.forEach(function (item) {
                item.doc.documentElement.style.cursor =
                    item.cursor;
            });

            document.removeEventListener(
                'keydown',
                keyHandler,
                true
            );
        }
    }

    function getDraftKey() {
        const url = new URL(location.href);
        const importantParameters = [
            'hospitalCode',
            'itemCode',
            'orgId',
            'systemCode',
            'patientId',
            'inpatientNo',
            'caseId'
        ];
        const parts = [url.pathname];

        importantParameters.forEach(function (name) {
            const value = url.searchParams.get(name);

            if (value) {
                parts.push(name + '=' + value);
            }
        });

        if (parts.length === 1) {
            parts.push(url.search);
        }

        return parts.join('|');
    }

    function getCurrentDraft() {
        const drafts = loadObject(KEYS.editorDrafts, {});
        return drafts[getDraftKey()] || null;
    }

    function saveCurrentDraft() {
        if (!state.page || !state.overlay) {
            return;
        }

        readOverlayValues();

        const drafts = loadObject(KEYS.editorDrafts, {});
        drafts[getDraftKey()] = {
            updatedAt: Date.now(),
            diagnosisArea: state.diagnosisArea,
            diagnosisItems: state.diagnosisItems,
            customItems: state.customItems
        };

        GM_setValue(KEYS.editorDrafts, drafts);
        showStatus('当前病案首页编辑草稿已保存。', 'success');
    }

    function removeCurrentDraft() {
        const drafts = loadObject(KEYS.editorDrafts, {});
        delete drafts[getDraftKey()];
        GM_setValue(KEYS.editorDrafts, drafts);
    }

    function ensurePagePositioning(pageElement) {
        const win = pageElement.ownerDocument.defaultView;
        const style = win.getComputedStyle(pageElement);

        if (style.position === 'static') {
            pageElement.style.position = 'relative';
        }
    }

    function createOverlay(pageElement) {
        const old = pageElement.querySelector('#' + IDS.overlay);

        if (old) {
            old.remove();
        }

        ensurePagePositioning(pageElement);

        const overlay = pageElement.ownerDocument.createElement('div');
        overlay.id = IDS.overlay;
        overlay.className = 'medical-record-editor-overlay';
        Object.assign(overlay.style, {
            position: 'absolute',
            inset: '0',
            zIndex: '9999',
            pointerEvents: 'none',
            overflow: 'visible'
        });

        pageElement.appendChild(overlay);
        state.overlay = overlay;

        return overlay;
    }

    function pageRect() {
        return state.page ? state.page.element.getBoundingClientRect() : null;
    }

    function normalizedRectFromElement(element) {
        const rect = element.getBoundingClientRect();
        const page = pageRect();

        if (!page || !page.width || !page.height) {
            return null;
        }

        return {
            left: clamp((rect.left - page.left) / page.width, 0, 1),
            top: clamp((rect.top - page.top) / page.height, 0, 1),
            width: clamp(rect.width / page.width, 0.01, 1),
            height: clamp(rect.height / page.height, 0.01, 1)
        };
    }

    function applyNormalizedRect(element, rect) {
        element.style.left = (rect.left * 100) + '%';
        element.style.top = (rect.top * 100) + '%';
        element.style.width = (rect.width * 100) + '%';
        element.style.height = (rect.height * 100) + '%';
    }

    function setSelectedElement(element) {
        if (state.selectedElement && state.selectedElement !== element) {
            state.selectedElement.classList.remove('selected');
        }

        state.selectedElement = element || null;

        if (state.selectedElement) {
            state.selectedElement.classList.add('selected');
        }
    }

    function enableWrapperDrag(wrapper, handle, item, isCustom) {
        handle.addEventListener('pointerdown', function (event) {
            if (!state.editMode || event.button !== 0) {
                return;
            }

            const page = pageRect();
            const startRect = wrapper.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const pointerId = event.pointerId;

            setSelectedElement(wrapper);
            event.preventDefault();
            event.stopPropagation();

            try {
                handle.setPointerCapture(pointerId);
            }
            catch (error) {
                // 不支持指针捕获时继续使用document监听。
            }

            const dragDocument = wrapper.ownerDocument;

            function onMove(moveEvent) {
                if (moveEvent.pointerId !== pointerId) {
                    return;
                }

                const left = clamp(
                    startRect.left - page.left + moveEvent.clientX - startX,
                    0,
                    page.width - startRect.width
                );
                const top = clamp(
                    startRect.top - page.top + moveEvent.clientY - startY,
                    0,
                    page.height - startRect.height
                );

                wrapper.style.left = (left / page.width * 100) + '%';
                wrapper.style.top = (top / page.height * 100) + '%';
                moveEvent.preventDefault();
            }

            function finish(finishEvent) {
                if (finishEvent && finishEvent.pointerId !== pointerId) {
                    return;
                }

                dragDocument.removeEventListener('pointermove', onMove, true);
                dragDocument.removeEventListener('pointerup', finish, true);
                dragDocument.removeEventListener('pointercancel', finish, true);

                const normalized = normalizedRectFromElement(wrapper);

                if (normalized) {
                    item.rect = normalized;
                }

                if (isCustom) {
                    readCustomItemsFromDom();
                }
            }

            dragDocument.addEventListener('pointermove', onMove, true);
            dragDocument.addEventListener('pointerup', finish, true);
            dragDocument.addEventListener('pointercancel', finish, true);
        });
    }

    function createEditableWrapper(item, className, options) {
        const config = options || {};
        const doc = state.page.doc;
        const wrapper = doc.createElement('div');
        wrapper.className = 'medical-edit-wrapper ' + (className || '');
        wrapper.dataset.itemId = item.id;
        Object.assign(wrapper.style, {
            position: 'absolute',
            pointerEvents: 'auto',
            resize: 'none',
            overflow: config.resizable ? 'visible' : 'visible'
        });

        applyNormalizedRect(wrapper, item.rect);

        const input = config.multiline
            ? doc.createElement('textarea')
            : doc.createElement('input');

        if (!config.multiline) {
            input.type = 'text';
        }

        input.className = 'medical-edit-input';
        input.value = item.text || '';
        input.spellcheck = false;
        input.dataset.kind = item.kind || 'custom';
        input.dataset.itemId = item.id;

        Object.assign(input.style, {
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            border: '1px dashed rgba(17,127,172,.65)',
            outline: 'none',
            padding: config.center ? '0' : '0 2px',
            margin: '0',
            resize: config.resizable ? 'both' : 'none',
            overflow: 'hidden',
            background: item.transparent ? 'transparent' : '#ffffff',
            color: '#000000',
            fontFamily: SETTINGS.defaultFontFamily,
            textAlign: config.center ? 'center' : 'left',
            verticalAlign: 'middle',
            whiteSpace: config.multiline ? 'pre-wrap' : 'nowrap'
        });

        if (config.multiline) {
            input.style.lineHeight = '1.25';
        }

        const handle = doc.createElement('span');
        handle.className = 'medical-edit-drag-handle';
        handle.textContent = '↕';
        handle.title = '拖动';

        wrapper.appendChild(input);
        wrapper.appendChild(handle);
        state.overlay.appendChild(wrapper);

        input.addEventListener('focus', function () {
            setSelectedElement(wrapper);
        });

        input.addEventListener('input', function () {
            item.text = input.value;
            updateInputFont(wrapper, item);
        });

        input.addEventListener('mouseup', function () {
            if (config.resizable) {
                setTimeout(function () {
                    const normalized = normalizedRectFromElement(wrapper);

                    if (normalized) {
                        item.rect = normalized;
                    }
                }, 0);
            }
        });

        wrapper.addEventListener('pointerdown', function () {
            setSelectedElement(wrapper);
        });

        enableWrapperDrag(wrapper, handle, item, item.kind === 'custom');

        if (config.resizable && typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(function () {
                const normalized = normalizedRectFromElement(wrapper);

                if (normalized) {
                    item.rect = normalized;
                }
            });
            observer.observe(wrapper);
        }

        updateInputFont(wrapper, item);

        return wrapper;
    }

    function updateInputFont(wrapper, item) {
        const input = wrapper.querySelector('.medical-edit-input');
        const page = pageRect();

        if (!input || !page) {
            return;
        }

        let size = Number(item.fontSize || 0);

        if (!size) {
            if (item.kind === 'diagnosis-name') {
                const length = Math.max(1, String(input.value || '').length);
                size = page.width * 0.0158 * Math.min(1, 15 / length);
                size = Math.max(page.width * 0.0105, size);
            }
            else if (item.kind === 'diagnosis-code') {
                size = page.width * 0.0132;
            }
            else if (item.kind === 'diagnosis-admission') {
                size = page.width * 0.014;
            }
            else {
                size = page.width * 0.018;
            }
        }

        input.style.fontSize = Math.max(6, size) + 'px';
        input.style.lineHeight = Math.max(7, wrapper.getBoundingClientRect().height - 2) + 'px';

        if (item.kind === 'custom') {
            input.style.lineHeight = '1.25';
        }
    }

    function diagnosisCellRect(area, half, rowIndex, column) {
        const columnFractions = {
            left: {
                name: [0.000, 0.313],
                code: [0.313, 0.448],
                admission: [0.448, 0.497]
            },
            right: {
                name: [0.497, 0.810],
                code: [0.810, 0.947],
                admission: [0.947, 1.000]
            }
        };
        const range = columnFractions[half][column];
        const rowHeight = area.height / SETTINGS.diagnosisRowsPerHalf;
        const insetX = 0.0015;
        const insetY = 0.0013;

        return {
            left: area.left + area.width * range[0] + insetX,
            top: area.top + rowHeight * rowIndex + insetY,
            width: area.width * (range[1] - range[0]) - insetX * 2,
            height: rowHeight - insetY * 2
        };
    }

    function buildDiagnosisEditorItems(diagnoses) {
        const maxRows = SETTINGS.diagnosisRowsPerHalf * 2;
        const usable = diagnoses.slice(0, maxRows);
        const items = [];

        usable.forEach(function (diagnosis, index) {
            const half = index < SETTINGS.diagnosisRowsPerHalf ? 'left' : 'right';
            const rowIndex = index % SETTINGS.diagnosisRowsPerHalf;
            const prefix = 'diagnosis-' + index + '-';

            items.push({
                id: prefix + 'name',
                kind: 'diagnosis-name',
                text: diagnosis.standardName || diagnosis.sourceName || '',
                rect: diagnosisCellRect(state.diagnosisArea, half, rowIndex, 'name')
            });

            items.push({
                id: prefix + 'code',
                kind: 'diagnosis-code',
                text: diagnosis.systemCode || '',
                rect: diagnosisCellRect(state.diagnosisArea, half, rowIndex, 'code')
            });

            items.push({
                id: prefix + 'admission',
                kind: 'diagnosis-admission',
                text: SETTINGS.admissionCodeMap[diagnosis.admissionCondition] || diagnosis.admissionCondition || '',
                rect: diagnosisCellRect(state.diagnosisArea, half, rowIndex, 'admission')
            });
        });

        return {
            items: items,
            ignoredCount: Math.max(0, diagnoses.length - maxRows)
        };
    }

    function renderDiagnosisItems() {
        if (!state.overlay) {
            return;
        }

        Array.from(state.overlay.querySelectorAll('.medical-diagnosis-field'))
            .forEach(function (element) {
                element.remove();
            });

        const built = buildDiagnosisEditorItems(state.diagnosisItems);

        built.items.forEach(function (item) {
            const center = item.kind === 'diagnosis-code' || item.kind === 'diagnosis-admission';
            createEditableWrapper(item, 'medical-diagnosis-field', {
                multiline: false,
                resizable: false,
                center: center
            });
        });

        updateEditMode();
    }

    function renderCustomItems() {
        if (!state.overlay) {
            return;
        }

        Array.from(state.overlay.querySelectorAll('.medical-custom-field'))
            .forEach(function (element) {
                element.remove();
            });

        state.customItems.forEach(function (item) {
            createEditableWrapper(item, 'medical-custom-field', {
                multiline: true,
                resizable: true,
                center: false
            });
        });

        updateEditMode();
    }

    function readCustomItemsFromDom() {
        if (!state.overlay) {
            return;
        }

        const map = new Map(state.customItems.map(function (item) {
            return [item.id, item];
        }));

        Array.from(state.overlay.querySelectorAll('.medical-custom-field'))
            .forEach(function (wrapper) {
                const item = map.get(wrapper.dataset.itemId);
                const input = wrapper.querySelector('.medical-edit-input');

                if (!item || !input) {
                    return;
                }

                item.text = input.value;
                item.rect = normalizedRectFromElement(wrapper) || item.rect;
                item.transparent = input.style.background === 'transparent';
                item.fontSize = parseFloat(input.style.fontSize) || item.fontSize || 0;
            });
    }

    function readOverlayValues() {
        if (!state.overlay) {
            return;
        }

        const diagnosisMap = {};

        Array.from(state.overlay.querySelectorAll('.medical-diagnosis-field'))
            .forEach(function (wrapper) {
                const id = wrapper.dataset.itemId || '';
                const input = wrapper.querySelector('.medical-edit-input');
                const match = id.match(/^diagnosis-(\d+)-(name|code|admission)$/);

                if (!match || !input) {
                    return;
                }

                const index = Number(match[1]);
                const key = match[2];
                diagnosisMap[index] = diagnosisMap[index] || {};
                diagnosisMap[index][key] = input.value.trim();
            });

        Object.keys(diagnosisMap).forEach(function (indexText) {
            const index = Number(indexText);
            const values = diagnosisMap[index];
            const item = state.diagnosisItems[index];

            if (!item) {
                return;
            }

            item.standardName = values.name || item.standardName || '';
            item.systemCode = values.code || '';

            const admissionReverse = Object.keys(SETTINGS.admissionCodeMap)
                .find(function (key) {
                    return SETTINGS.admissionCodeMap[key] === values.admission;
                });

            item.admissionCondition = admissionReverse || values.admission || '';
        });

        readCustomItemsFromDom();
    }

    function addCustomTextBox() {
        if (!state.page || !state.overlay) {
            showStatus('尚未定位到第一页纸张。', 'error');
            return;
        }

        const item = {
            id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            kind: 'custom',
            text: '双击此处编辑文字',
            transparent: false,
            fontSize: 0,
            rect: {
                left: 0.12,
                top: 0.18,
                width: 0.30,
                height: 0.055
            }
        };

        state.customItems.push(item);
        const wrapper = createEditableWrapper(item, 'medical-custom-field', {
            multiline: true,
            resizable: true,
            center: false
        });
        updateEditMode();

        const input = wrapper.querySelector('.medical-edit-input');
        input.focus();
        input.select();
    }

    function deleteSelectedElement() {
        const selected = state.selectedElement;

        if (!selected) {
            showStatus('请先单击选中一个自定义文本框。', 'warning');
            return;
        }

        if (selected.classList.contains('medical-diagnosis-field')) {
            showStatus('诊断固定单元格不能删除，可直接清空其中的文字。', 'warning');
            return;
        }

        const id = selected.dataset.itemId;
        state.customItems = state.customItems.filter(function (item) {
            return item.id !== id;
        });
        selected.remove();
        state.selectedElement = null;
    }

    function changeSelectedFont(delta) {
        const selected = state.selectedElement;

        if (!selected) {
            showStatus('请先选中需要调整字号的文本框。', 'warning');
            return;
        }

        const input = selected.querySelector('.medical-edit-input');

        if (!input) {
            return;
        }

        const current = parseFloat(input.style.fontSize) || 10;
        input.style.fontSize = Math.max(6, current + delta) + 'px';

        const item = state.customItems.find(function (entry) {
            return entry.id === selected.dataset.itemId;
        });

        if (item) {
            item.fontSize = Math.max(6, current + delta);
        }
    }

    function toggleSelectedBackground() {
        const selected = state.selectedElement;

        if (!selected) {
            showStatus('请先选中需要切换底色的文本框。', 'warning');
            return;
        }

        const input = selected.querySelector('.medical-edit-input');

        if (!input) {
            return;
        }

        const transparent = input.style.background === 'transparent';
        input.style.background = transparent ? '#ffffff' : 'transparent';

        const item = state.customItems.find(function (entry) {
            return entry.id === selected.dataset.itemId;
        });

        if (item) {
            item.transparent = !transparent;
        }
    }

    function updateEditMode() {
        if (!state.overlay) {
            return;
        }

        state.overlay.classList.toggle('view-mode', !state.editMode);
        state.overlay.style.pointerEvents = state.editMode ? 'none' : 'none';

        Array.from(state.overlay.querySelectorAll('.medical-edit-wrapper'))
            .forEach(function (wrapper) {
                wrapper.style.pointerEvents = state.editMode ? 'auto' : 'none';
            });
    }

    function createCalibrationBox() {
        if (!state.overlay) {
            return null;
        }

        if (state.calibration && state.calibration.isConnected) {
            return state.calibration;
        }

        const doc = state.page.doc;
        const box = doc.createElement('div');
        box.id = IDS.calibration;
        box.className = 'medical-calibration-box';
        box.innerHTML = '<span class="medical-calibration-title">诊断数据区：拖动蓝框，右下角缩放</span>';
        Object.assign(box.style, {
            position: 'absolute',
            zIndex: '10020',
            border: '2px solid #159bd3',
            background: 'rgba(21,155,211,.10)',
            boxSizing: 'border-box',
            resize: 'both',
            overflow: 'hidden',
            pointerEvents: 'auto',
            display: 'none'
        });

        applyNormalizedRect(box, state.diagnosisArea);
        state.overlay.appendChild(box);
        state.calibration = box;

        const title = box.querySelector('.medical-calibration-title');
        enableWrapperDrag(box, title, { rect: state.diagnosisArea }, false);

        function commit() {
            const rect = normalizedRectFromElement(box);

            if (!rect) {
                return;
            }

            state.diagnosisArea = rect;
            renderDiagnosisItems();
        }

        box.addEventListener('mouseup', function () {
            setTimeout(commit, 0);
        });

        box.addEventListener('pointerup', function () {
            setTimeout(commit, 0);
        });

        return box;
    }

    function toggleCalibration(button) {
        const box = createCalibrationBox();

        if (!box) {
            showStatus('尚未定位到第一页纸张。', 'error');
            return;
        }

        state.calibrationVisible = !state.calibrationVisible;
        box.style.display = state.calibrationVisible ? 'block' : 'none';
        button.textContent = state.calibrationVisible ? '完成校准' : '校准诊断区域';

        Array.from(state.overlay.querySelectorAll('.medical-diagnosis-field'))
            .forEach(function (element) {
                element.style.visibility = state.calibrationVisible ? 'hidden' : 'visible';
            });

        if (!state.calibrationVisible) {
            const rect = normalizedRectFromElement(box);

            if (rect) {
                state.diagnosisArea = rect;
            }

            renderDiagnosisItems();
            showStatus('诊断区域校准已应用。', 'success');
        }
    }

    function initializePageEditor(options) {
        const initOptions = options || {};
        const page = initOptions.forcedPage || findFirstPage();

        if (!page) {
            if (!initOptions.silent) {
                showStatus(
                    '尚未识别到第一页纸张。请点击“手动点选第一页”，再单击白色纸张中央。',
                    'warning'
                );
            }
            return false;
        }

        if (state.resizeObserver) {
            state.resizeObserver.disconnect();
        }

        if (
            state.overlay &&
            state.overlay.isConnected
        ) {
            state.overlay.remove();
        }

        state.page = page;
        ensureEditorStyle(page.doc);
        createOverlay(page.element);

        const draft = getCurrentDraft();
        state.diagnosisArea = draft && draft.diagnosisArea
            ? draft.diagnosisArea
            : Object.assign({}, SETTINGS.defaultDiagnosisArea);
        state.diagnosisItems = draft && Array.isArray(draft.diagnosisItems)
            ? draft.diagnosisItems
            : [];
        state.customItems = draft && Array.isArray(draft.customItems)
            ? draft.customItems
            : [];

        renderDiagnosisItems();
        renderCustomItems();
        createCalibrationBox();

        state.resizeObserver = new ResizeObserver(function () {
            Array.from(state.overlay.querySelectorAll('.medical-edit-wrapper'))
                .forEach(function (wrapper) {
                    const id = wrapper.dataset.itemId;
                    const custom = state.customItems.find(function (item) {
                        return item.id === id;
                    });
                    const item = custom || {
                        kind: wrapper.querySelector('.medical-edit-input')
                            ? wrapper.querySelector('.medical-edit-input').dataset.kind
                            : ''
                    };
                    updateInputFont(wrapper, item);
                });
        });
        state.resizeObserver.observe(page.element);

        showStatus('已定位第一页纸张，编辑层已加载。', 'success');
        return true;
    }

    /******************************************************************
     * 三、引用诊断记录
     ******************************************************************/

    function diagnosisRecordLabel(record) {
        const date = new Date(Number(record.savedAt || 0));
        const dateText = Number.isFinite(date.getTime())
            ? date.toLocaleString('zh-CN', { hour12: false })
            : '';

        return [
            record.name || '姓名未识别',
            record.inpatientNo || '住院号未识别',
            safeArray(record.items).length + '条',
            dateText
        ].join(' / ');
    }

    function refreshDiagnosisRecordSelect(select) {
        const records = safeArray(GM_getValue(KEYS.diagnosisRecords, []));
        select.innerHTML = '';

        if (!records.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '暂无已同步诊断记录';
            select.appendChild(option);
            return records;
        }

        records.forEach(function (record, index) {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = diagnosisRecordLabel(record);
            select.appendChild(option);
        });

        return records;
    }

    function readPatientIdentityFromPreview() {
        const texts = [];

        allSameOriginDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll('.textLayer,body'))
                .filter(isVisible)
                .slice(0, 5)
                .forEach(function (element) {
                    const value = plainText(element.innerText || element.textContent || '');

                    if (value && value.length < 10000) {
                        texts.push(value);
                    }
                });
        });

        for (const text of texts) {
            const identity = readPatientIdentityFromText(text);

            if (identity.name || identity.inpatientNo) {
                return identity;
            }
        }

        return {
            name: '',
            inpatientNo: ''
        };
    }

    function importDiagnosisRecord(select) {
        if (!state.page || !state.overlay) {
            if (!initializePageEditor()) {
                return;
            }
        }

        const records = safeArray(GM_getValue(KEYS.diagnosisRecords, []));
        const index = Number(select.value);
        const record = records[index];

        if (!record) {
            showStatus('没有可引用的诊断记录。请先在8003诊断列表脚本中完成解析或填写。', 'error');
            return;
        }

        const previewIdentity = readPatientIdentityFromPreview();
        const canCompare = Boolean(
            (record.inpatientNo && previewIdentity.inpatientNo) ||
            (record.name && previewIdentity.name)
        );
        const mismatch = canCompare && (
            (record.inpatientNo && previewIdentity.inpatientNo && record.inpatientNo !== previewIdentity.inpatientNo) ||
            (record.name && previewIdentity.name && record.name !== previewIdentity.name)
        );

        if (mismatch) {
            showStatus(
                '患者信息不一致，已停止引用。\n' +
                '诊断记录：' + (record.name || '-') + ' / ' + (record.inpatientNo || '-') + '\n' +
                '当前预览：' + (previewIdentity.name || '-') + ' / ' + (previewIdentity.inpatientNo || '-'),
                'error',
                15000
            );
            return;
        }

        if (!canCompare) {
            const confirmed = window.confirm(
                '当前预览页面未能自动读取姓名或住院号。\n\n' +
                '准备引用：' + diagnosisRecordLabel(record) + '\n\n' +
                '请人工确认这就是当前患者，确认后继续。'
            );

            if (!confirmed) {
                return;
            }
        }

        const diagnoses = safeArray(record.items)
            .filter(function (item) {
                return item.category === '西医';
            })
            .sort(function (a, b) {
                const aPrimary = a.diagnosisType === '主要诊断' ? 0 : 1;
                const bPrimary = b.diagnosisType === '主要诊断' ? 0 : 1;

                if (aPrimary !== bPrimary) {
                    return aPrimary - bPrimary;
                }

                return Number(a.order || 0) - Number(b.order || 0);
            });

        state.diagnosisItems = diagnoses;
        renderDiagnosisItems();

        const maxRows = SETTINGS.diagnosisRowsPerHalf * 2;
        const ignored = Math.max(0, diagnoses.length - maxRows);

        showStatus(
            '已引用' + Math.min(diagnoses.length, maxRows) + '条西医诊断。' +
            (ignored
                ? '\n模板最多容纳' + maxRows + '条，另外' + ignored + '条未引用。'
                : ''),
            ignored ? 'warning' : 'success'
        );
    }

    /******************************************************************
     * 四、打印编辑版
     ******************************************************************/

    function ensurePrintStyle(doc) {
        const styleId = IDS.style + '-print';

        if (doc.getElementById(styleId)) {
            return;
        }

        const style = doc.createElement('style');
        style.id = styleId;
        style.textContent = `
@media print {
    @page { margin: 0; size: auto; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    body.medical-record-print-mode * { visibility: hidden !important; }
    body.medical-record-print-mode .medical-print-page,
    body.medical-record-print-mode .medical-print-page * { visibility: visible !important; }
    body.medical-record-print-mode .medical-print-page {
        position: relative !important;
        left: auto !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        transform: none !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        break-after: page;
        page-break-after: always;
    }
    body.medical-record-print-mode .medical-print-page:last-child {
        break-after: auto;
        page-break-after: auto;
    }
    .medical-edit-input {
        border: none !important;
        outline: none !important;
        resize: none !important;
        box-shadow: none !important;
    }
    .medical-edit-drag-handle,
    .medical-calibration-box {
        display: none !important;
    }
    .medical-edit-wrapper.selected {
        outline: none !important;
    }
}
`;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function printEditedVersion() {
        if (!state.page || !state.overlay) {
            if (!initializePageEditor()) {
                return;
            }
        }

        readOverlayValues();

        if (state.calibrationVisible) {
            state.calibrationVisible = false;
            state.calibration.style.display = 'none';
            Array.from(state.overlay.querySelectorAll('.medical-diagnosis-field'))
                .forEach(function (element) {
                    element.style.visibility = 'visible';
                });
        }

        const doc = state.page.doc;
        const pages = findAllPageCandidates().filter(function (candidate) {
            return candidate.doc === doc;
        });

        ensurePrintStyle(doc);
        doc.body.classList.add('medical-record-print-mode');

        pages.forEach(function (candidate) {
            candidate.element.classList.add('medical-print-page');
        });

        if (!pages.length) {
            state.page.element.classList.add('medical-print-page');
        }

        const printWindow = doc.defaultView;

        setTimeout(function () {
            printWindow.focus();
            printWindow.print();

            setTimeout(function () {
                doc.body.classList.remove('medical-record-print-mode');
                pages.forEach(function (candidate) {
                    candidate.element.classList.remove('medical-print-page');
                });
                state.page.element.classList.remove('medical-print-page');
            }, 1000);
        }, 150);
    }

    /******************************************************************
     * 五、编辑器悬浮面板
     ******************************************************************/

    function ensureEditorStyle(targetDocument) {
        const styleDocument = targetDocument || document;

        if (styleDocument.getElementById(IDS.style)) {
            return;
        }

        const style = styleDocument.createElement('style');
        style.id = IDS.style;
        style.textContent = `
#${IDS.panel}{position:fixed;right:18px;top:115px;z-index:2147483600;width:228px;border-radius:7px;overflow:hidden;background:#fff;box-shadow:0 4px 15px rgba(0,0,0,.30);font-family:"Microsoft YaHei",Arial,sans-serif;color:#333;}
#${IDS.panel} .mpr-header{height:32px;padding:0 7px 0 10px;display:flex;align-items:center;justify-content:space-between;background:#117fac;color:#fff;cursor:move;user-select:none;}
#${IDS.panel} .mpr-title{font-size:13px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#${IDS.panel} .mpr-toggle{width:25px;height:24px;border:0;border-radius:4px;background:rgba(255,255,255,.15);color:#fff;font-size:17px;cursor:pointer;}
#${IDS.panel} .mpr-body{padding:8px;background:#fff;}
#${IDS.panel} .mpr-row{display:flex;gap:6px;margin-bottom:7px;}
#${IDS.panel} button,#${IDS.panel} select{height:31px;border-radius:4px;font-size:12px;box-sizing:border-box;}
#${IDS.panel} button{flex:1;border:1px solid #159bd3;background:#159bd3;color:#fff;cursor:pointer;padding:0 6px;}
#${IDS.panel} button.secondary{border-color:#b9d9e7;background:#f3fbfe;color:#117fac;}
#${IDS.panel} button.warning{border-color:#b7791f;background:#b7791f;color:#fff;}
#${IDS.panel} button.danger{border-color:#dc4c40;background:#dc4c40;color:#fff;}
#${IDS.panel} select{width:100%;border:1px solid #c7d5dc;background:#fff;padding:0 5px;color:#333;}
#${IDS.panel} .mpr-note{padding:7px 8px;border-radius:4px;background:#fff8e8;color:#795b00;font-size:11px;line-height:1.55;}
.medical-edit-wrapper{box-sizing:border-box;}
.medical-edit-wrapper.selected{outline:1px solid #e53e3e;outline-offset:1px;}
.medical-edit-drag-handle{position:absolute;left:-8px;top:-8px;width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#159bd3;color:#fff;font-size:9px;line-height:14px;cursor:move;z-index:3;box-shadow:0 1px 3px rgba(0,0,0,.25);}
.medical-record-editor-overlay.view-mode .medical-edit-input{border-color:transparent!important;}
.medical-record-editor-overlay.view-mode .medical-edit-drag-handle{display:none!important;}
.medical-calibration-title{display:block;height:20px;padding:2px 5px;background:#159bd3;color:#fff;font-family:"Microsoft YaHei",Arial,sans-serif;font-size:11px;line-height:16px;cursor:move;white-space:nowrap;overflow:hidden;}
`;
        (styleDocument.head || styleDocument.documentElement).appendChild(style);
    }

    function createEditorPanel() {
        if (document.getElementById(IDS.panel)) {
            return;
        }

        ensureEditorStyle();

        const panel = document.createElement('div');
        panel.id = IDS.panel;
        panel.innerHTML = `
<div class="mpr-header">
    <span class="mpr-title">病案首页编辑打印</span>
    <button type="button" class="mpr-toggle">－</button>
</div>
<div class="mpr-body">
    <div class="mpr-row"><button type="button" class="mpr-locate">自动定位页面</button><button type="button" class="mpr-manual-locate secondary">手动点选第一页</button></div>
    <div class="mpr-row"><button type="button" class="mpr-edit-mode secondary">预览模式</button><button type="button" class="mpr-calibrate secondary">校准诊断区域</button></div>
    <select class="mpr-record-select"></select>
    <div class="mpr-row" style="margin-top:7px;"><button type="button" class="mpr-import">引用诊断</button><button type="button" class="mpr-add secondary">新增文本框</button></div>
    <div class="mpr-row"><button type="button" class="mpr-background secondary">白底/透明</button><button type="button" class="mpr-save secondary">保存草稿</button></div>
    <div class="mpr-row"><button type="button" class="mpr-font-minus secondary">字号－</button><button type="button" class="mpr-font-plus secondary">字号＋</button><button type="button" class="mpr-delete danger">删除</button></div>
    <div class="mpr-row"><button type="button" class="mpr-clear secondary">清空编辑</button></div>
    <div class="mpr-row"><button type="button" class="mpr-print warning">打印编辑版</button></div>
    <div class="mpr-note">自动定位失败时，点击“手动点选第一页”，再单击白色纸张中央。诊断表默认容纳18条：左9条、右9条；超出部分不引用。</div>
</div>`;
        document.body.appendChild(panel);

        const header = panel.querySelector('.mpr-header');
        const body = panel.querySelector('.mpr-body');
        const toggle = panel.querySelector('.mpr-toggle');
        const recordSelect = panel.querySelector('.mpr-record-select');
        const editModeButton = panel.querySelector('.mpr-edit-mode');
        const calibrationButton = panel.querySelector('.mpr-calibrate');

        refreshDiagnosisRecordSelect(recordSelect);

        let collapsed = Boolean(GM_getValue(KEYS.panelCollapsed, false));

        function applyCollapsed() {
            body.style.display = collapsed ? 'none' : 'block';
            toggle.textContent = collapsed ? '＋' : '－';
        }

        applyCollapsed();

        toggle.addEventListener('click', function (event) {
            event.stopPropagation();
            collapsed = !collapsed;
            GM_setValue(KEYS.panelCollapsed, collapsed);
            applyCollapsed();
        });

        panel.querySelector('.mpr-locate').addEventListener('click', function () {
            initializePageEditor();
            refreshDiagnosisRecordSelect(recordSelect);
        });

        editModeButton.addEventListener('click', function () {
            state.editMode = !state.editMode;
            updateEditMode();
            editModeButton.textContent = state.editMode ? '预览模式' : '编辑模式';
        });

        panel.querySelector('.mpr-import').addEventListener('click', function () {
            importDiagnosisRecord(recordSelect);
        });

        calibrationButton.addEventListener('click', function () {
            toggleCalibration(calibrationButton);
        });

        panel.querySelector('.mpr-add').addEventListener('click', addCustomTextBox);
        panel.querySelector('.mpr-delete').addEventListener('click', deleteSelectedElement);
        panel.querySelector('.mpr-font-minus').addEventListener('click', function () {
            changeSelectedFont(-1);
        });
        panel.querySelector('.mpr-font-plus').addEventListener('click', function () {
            changeSelectedFont(1);
        });
        panel.querySelector('.mpr-background').addEventListener('click', toggleSelectedBackground);
        panel.querySelector('.mpr-save').addEventListener('click', saveCurrentDraft);

        panel.querySelector('.mpr-clear').addEventListener('click', function () {
            if (!window.confirm('确认清空当前页面的诊断引用和所有自定义文本框吗？')) {
                return;
            }

            state.diagnosisItems = [];
            state.customItems = [];
            state.diagnosisArea = Object.assign({}, SETTINGS.defaultDiagnosisArea);
            removeCurrentDraft();
            renderDiagnosisItems();
            renderCustomItems();

            if (state.calibration) {
                applyNormalizedRect(state.calibration, state.diagnosisArea);
            }

            showStatus('当前页面编辑内容已清空。', 'success');
        });

        panel.querySelector('.mpr-print').addEventListener('click', printEditedVersion);

        const savedPosition = GM_getValue(KEYS.panelPosition, null);

        if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
            panel.style.left = savedPosition.left + 'px';
            panel.style.top = savedPosition.top + 'px';
            panel.style.right = 'auto';
        }

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', function (event) {
            if (event.target.closest('.mpr-toggle')) {
                return;
            }

            dragging = true;
            const rect = panel.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
            event.preventDefault();
        });

        document.addEventListener('mousemove', function (event) {
            if (!dragging) {
                return;
            }

            const left = clamp(event.clientX - offsetX, 4, window.innerWidth - panel.offsetWidth - 4);
            const top = clamp(event.clientY - offsetY, 4, window.innerHeight - 32);
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });

        document.addEventListener('mouseup', function () {
            if (!dragging) {
                return;
            }

            dragging = false;
            const rect = panel.getBoundingClientRect();
            GM_setValue(KEYS.panelPosition, {
                left: Math.round(rect.left),
                top: Math.round(rect.top)
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.ctrlKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveCurrentDraft();
            }

            if (event.key === 'Delete' && state.selectedElement) {
                const active = document.activeElement;

                if (!active || !/^(INPUT|TEXTAREA)$/.test(active.tagName)) {
                    deleteSelectedElement();
                }
            }
        });
    }

    async function initializePrintEditor() {
        createEditorPanel();

        for (let attempt = 0; attempt < 40; attempt += 1) {
            if (initializePageEditor({ silent: true })) {
                break;
            }

            await sleep(300);
        }

        if (!state.page) {
            showStatus(
                '病案首页纸张尚未自动识别。可点击“自动定位页面”，仍失败时点击“手动点选第一页”。',
                'warning'
            );
        }

        console.info('[病案首页可编辑打印] 8000编辑器已启用。');
    }

    function initialize() {
        if (!document.body) {
            setTimeout(initialize, 80);
            return;
        }

        if (IS_DIAGNOSIS_HOST) {
            initializeDiagnosisBridge();
        }

        if (IS_PRINT_HOST) {
            initializePrintEditor();
        }
    }

    initialize();
})();
