// ==UserScript==
// @name         住院管理系统 - 医师、DRG、费用助手（含报红筛选）
// @namespace    http://tampermonkey.net/
// @version      2.5.16
// @description  v2.5.16：“提取当前页面信息”扩充为当前住院列表完整字段快照，并继续保留原DRG分组、拨付费用、每日花费基线字段与8003读取桥接兼容性；供掌上OHA住院视图读取
// @author       YourName
// @match        http://11.12.199.3:8996/attend/attendingPhysician*
// @match        http://11.12.199.3:8996/attend/patientQuery*
// @match        http://11.12.199.244:8003/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';


    /*
     * v2.5.16：DRG查房本兼容桥与住院列表完整快照。
     *
     * 同一Tampermonkey脚本同时匹配8996与8003：
     * - 在8996 DRG页面由用户点击“提取当前页面信息”，把标准化快照保存到本脚本GM存储；
     * - 在8003患者信息页不创建DRG助手UI，只向网页window暴露只读桥接；
     * - 患者信息脚本可按住院号读取最新DRG基线，不依赖跨域localStorage。
     */
    const DRG_ROUND_BOOK_SNAPSHOT_STORAGE_KEY =
        'tm_drg_round_book_snapshot_v1';

    const DRG_ROUND_BOOK_BRIDGE_NAME =
        'MedicalDoctorDrgSnapshotBridgeV1';

    function cloneDrgSnapshotValue(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return null;
        }
    }

    function readDrgRoundBookSnapshot() {
        try {
            const value = GM_getValue(
                DRG_ROUND_BOOK_SNAPSHOT_STORAGE_KEY,
                null
            );

            if (!value) {
                return null;
            }

            const parsed =
                typeof value === 'string'
                    ? JSON.parse(value)
                    : value;

            return (
                parsed &&
                typeof parsed === 'object'
            )
                ? cloneDrgSnapshotValue(parsed)
                : null;
        } catch (error) {
            return null;
        }
    }

    function writeDrgRoundBookSnapshot(snapshot) {
        const value =
            cloneDrgSnapshotValue(snapshot);

        if (!value) {
            throw new Error(
                'DRG基线快照序列化失败'
            );
        }

        GM_setValue(
            DRG_ROUND_BOOK_SNAPSHOT_STORAGE_KEY,
            value
        );

        return value;
    }

    function installDrgRoundBookBridge() {
        const pageWindow =
            typeof unsafeWindow !== 'undefined'
                ? unsafeWindow
                : window;

        const api = {
            version: 2,

            getSnapshot() {
                return readDrgRoundBookSnapshot();
            },

            getPatient(admissionNo) {
                const target =
                    String(
                        admissionNo || ''
                    )
                        .replace(/\s+/g, '')
                        .trim();

                if (!target) {
                    return null;
                }

                const snapshot =
                    readDrgRoundBookSnapshot();

                const record =
                    snapshot &&
                    snapshot.records &&
                    snapshot.records[target];

                return record
                    ? cloneDrgSnapshotValue(record)
                    : null;
            },

            getMeta() {
                const snapshot =
                    readDrgRoundBookSnapshot();

                if (!snapshot) {
                    return {
                        available: false,
                        capturedAt: '',
                        count: 0
                    };
                }

                return {
                    available: true,
                    capturedAt:
                        snapshot.capturedAt || '',
                    count:
                        Number(snapshot.count) ||
                        Object.keys(
                            snapshot.records || {}
                        ).length,
                    sourceUrl:
                        snapshot.sourceUrl || '',
                    schemaVersion:
                        Number(snapshot.schemaVersion) || 1,
                    columnCount:
                        Array.isArray(snapshot.columns)
                            ? snapshot.columns.length
                            : 0
                };
            }
        };

        try {
            pageWindow[
                DRG_ROUND_BOOK_BRIDGE_NAME
            ] = api;
        } catch (error) {
            // 极少数环境下页面window只读时忽略。
        }
    }

    /*
     * 8003只承担桥接，不运行8996页面的DOM扫描、悬浮框和XHR拦截逻辑。
     */
    if (
        location.hostname ===
            '11.12.199.244' &&
        location.port === '8003'
    ) {
        installDrgRoundBookBridge();
        return;
    }

    const EMPTY = '__EMPTY__';
    const DEFAULT_DAILY_COST = 300;

    // 延续旧版存储键，升级脚本后原有设置仍可继续使用
    const OLD_FEE_KEY_PREFIX = 'tm_fee_warning_v2';
    const DRG_FEE_KEY_PREFIX = 'tm_drg_fee_warning_v3';
    const DRG_DAILY_COST_KEY_PREFIX = 'tm_drg_daily_cost_v1';
    const ADJUSTMENT_KEY_PREFIX = 'tm_fee_adjustment_v1';
    const OPACITY_KEY = 'tm_panel_opacity_v2';
    const DRG_HISTORY_KEY = 'tm_drg_history_v1';
    const DRG_ASSIGN_PREFIX = 'tm_drg_assignment_v1';
    const MANUAL_FILTER_KEY_PREFIX = 'tm_manual_keyword_filter_v1';

    // 在院患者/责任医师查询分页设置
    // v2.5.2：在院患者与责任医师查询共用同一个分页设置，不再按路径分别记忆
    const PATIENT_PAGE_SIZE_KEY = 'tm_patient_page_size_v2_global';
    const DEFAULT_PATIENT_PAGE_SIZE = 100;
    const MAX_PATIENT_PAGE_SIZE = 99999;

    // 全量导出采用后台分批请求，不把全部数据渲染到页面，避免数千条记录卡死浏览器
    const EXPORT_BATCH_SIZE = 300;
    const EXPORT_MAX_PAGES = 10000;

    let collapsed = false;
    let feeSort = 'none';
    let remainingDaysSort = 'none';
    let refreshTimer = null;

    const $ = (selector, root = document) =>
        root.querySelector(selector);

    const $$ = (selector, root = document) =>
        Array.from(root.querySelectorAll(selector));

    function clean(value) {
        return String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function money(value) {
        const number = parseFloat(
            String(value ?? '')
                .replace(/,/g, '')
                .replace(/[^\d.-]/g, '')
        );

        return Number.isFinite(number) ? number : NaN;
    }

    function formatMoney(value) {
        return Number.isFinite(value)
            ? value.toLocaleString('zh-CN', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            })
            : '';
    }

    function drgGroupKey(value) {
        const text = clean(value).toUpperCase();

        if (!text) {
            return '';
        }

        const match = text.match(
            /\b[A-Z]{1,4}\d{1,4}[A-Z]?\b/
        );

        return match ? match[0] : text;
    }

    function safeGet(key, fallback = '') {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (error) {
            return fallback;
        }
    }

    function safeSet(key, value) {
        try {
            localStorage.setItem(key, String(value));
            return true;
        } catch (error) {
            return false;
        }
    }

    function safeRemove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    function manualFilterStorageKey() {
        return (
            `${MANUAL_FILTER_KEY_PREFIX}|` +
            `${location.pathname}`
        );
    }

    function parseManualKeywords(raw) {
        return Array.from(
            new Set(
                String(raw || '')
                    .split(/\r?\n/)
                    .map(clean)
                    .filter(Boolean)
            )
        );
    }

    function getManualFilterRaw() {
        return safeGet(
            manualFilterStorageKey(),
            ''
        );
    }

    function saveManualFilterRaw(raw) {
        raw = String(raw || '')
            .replace(/\r/g, '')
            .trim();

        if (raw) {
            safeSet(
                manualFilterStorageKey(),
                raw
            );
        } else {
            safeRemove(
                manualFilterStorageKey()
            );
        }

        return raw;
    }

    function getManualFilterKeywords() {
        return parseManualKeywords(
            getManualFilterRaw()
        );
    }

    function rowMatchesManualKeywords(
        row,
        keywords
    ) {
        if (!keywords?.length) {
            return true;
        }

        const text = clean(
            row?.innerText || ''
        ).toLowerCase();

        return keywords.some(keyword =>
            text.includes(
                String(keyword).toLowerCase()
            )
        );
    }

    function updateManualFilterButton() {
        const button =
            $('#tm-manual-filter-btn');

        if (!button) {
            return;
        }

        const keywords =
            getManualFilterKeywords();

        const active =
            keywords.length > 0;

        button.textContent = '手筛';
        button.title = active
            ? `当前已启用 ${keywords.length} 个关键词`
            : '手动关键词筛选';

        button.style.background = active
            ? '#67c23a'
            : '#e6a23c';
    }

    function ensureManualFilterDialog() {
        if (
            document.getElementById(
                'tm-manual-filter-overlay'
            )
        ) {
            return;
        }

        const overlay =
            document.createElement('div');

        overlay.id =
            'tm-manual-filter-overlay';

        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 1000001;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.25);
            padding: 16px;
            box-sizing: border-box;
        `;

        overlay.innerHTML = `
            <div
                style="
                    width: 540px;
                    max-width: 96vw;
                    background: #fff;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0,0,0,.18);
                    border: 1px solid #dcdfe6;
                    overflow: hidden;
                    font-family: Arial, 'Microsoft YaHei', sans-serif;
                "
            >
                <div
                    style="
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                        padding:10px 12px;
                        background:#409eff;
                        color:#fff;
                    "
                >
                    <strong style="font-size:13px;">
                        手动关键词筛选
                    </strong>

                    <button
                        id="tm-manual-filter-close-x"
                        type="button"
                        style="
                            border:0;
                            background:transparent;
                            color:#fff;
                            font-size:16px;
                            cursor:pointer;
                            line-height:1;
                        "
                        title="关闭"
                    >
                        ×
                    </button>
                </div>

                <div style="padding:12px;">
                    <div
                        style="
                            color:#606266;
                            font-size:12px;
                            line-height:1.6;
                            margin-bottom:8px;
                        "
                    >
                        一行一个关键词；命中任一关键词即显示。留空表示不启用手动筛选。
                    </div>

                    <textarea
                        id="tm-manual-filter-text"
                        placeholder="例如：\n高佳蕾\n脑梗\n330床"
                        style="
                            width:100%;
                            height:220px;
                            box-sizing:border-box;
                            resize:vertical;
                            padding:8px 10px;
                            border:1px solid #dcdfe6;
                            border-radius:4px;
                            outline:none;
                            font-size:12px;
                            line-height:1.6;
                            font-family:Consolas, 'Microsoft YaHei', sans-serif;
                        "
                    ></textarea>

                    <div
                        id="tm-manual-filter-tip"
                        style="
                            margin-top:6px;
                            color:#909399;
                            font-size:11px;
                            line-height:1.5;
                        "
                    ></div>

                    <div
                        style="
                            display:flex;
                            justify-content:flex-end;
                            gap:8px;
                            margin-top:12px;
                        "
                    >
                        <button
                            id="tm-manual-filter-apply"
                            type="button"
                            class="tm-mini-btn"
                            style="background:#409eff;"
                        >
                            应用筛选
                        </button>

                        <button
                            id="tm-manual-filter-clear"
                            type="button"
                            class="tm-mini-btn"
                            style="background:#909399;"
                        >
                            清空
                        </button>

                        <button
                            id="tm-manual-filter-close"
                            type="button"
                            class="tm-mini-btn"
                            style="background:#e6a23c;"
                        >
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeDialog = () => {
            overlay.style.display = 'none';
        };

        $('#tm-manual-filter-close-x', overlay)
            .addEventListener(
                'click',
                closeDialog
            );

        $('#tm-manual-filter-close', overlay)
            .addEventListener(
                'click',
                closeDialog
            );

        overlay.addEventListener(
            'click',
            event => {
                if (event.target === overlay) {
                    closeDialog();
                }
            }
        );

        $('#tm-manual-filter-clear', overlay)
            .addEventListener(
                'click',
                () => {
                    const textarea =
                        $('#tm-manual-filter-text', overlay);

                    if (textarea) {
                        textarea.value = '';
                    }

                    saveManualFilterRaw('');
                    updateManualFilterButton();
                    applyFilters();

                    const tip =
                        $('#tm-manual-filter-tip', overlay);

                    if (tip) {
                        tip.textContent =
                            '已清空手动关键词筛选。';
                    }
                }
            );

        $('#tm-manual-filter-apply', overlay)
            .addEventListener(
                'click',
                () => {
                    const textarea =
                        $('#tm-manual-filter-text', overlay);

                    const raw = saveManualFilterRaw(
                        textarea?.value || ''
                    );

                    const keywords =
                        parseManualKeywords(raw);

                    updateManualFilterButton();
                    applyFilters();

                    closeDialog();

                    setStatus(
                        keywords.length
                            ? `已应用手动筛选：${keywords.length} 个关键词。`
                            : '已关闭手动关键词筛选。'
                    );
                }
            );

        document.addEventListener(
            'keydown',
            event => {
                if (
                    event.key === 'Escape' &&
                    overlay.style.display !== 'none'
                ) {
                    closeDialog();
                }
            }
        );
    }

    function openManualFilterDialog() {
        ensureManualFilterDialog();

        const overlay =
            document.getElementById(
                'tm-manual-filter-overlay'
            );

        if (!overlay) {
            return;
        }

        const textarea =
            $('#tm-manual-filter-text', overlay);

        const tip =
            $('#tm-manual-filter-tip', overlay);

        const keywords =
            getManualFilterKeywords();

        if (textarea) {
            textarea.value =
                getManualFilterRaw();
            textarea.focus();
        }

        if (tip) {
            tip.textContent = keywords.length
                ? `当前已填写 ${keywords.length} 个关键词。`
                : '当前未启用手动关键词筛选。';
        }

        overlay.style.display = 'flex';
    }


    /* =========================================================
     * 患者列表每页数量：在院患者 + 责任医师查询
     * ========================================================= */

    function normalizePatientPageSize(value) {
        const number = parseInt(value, 10);

        if (!Number.isFinite(number)) {
            return DEFAULT_PATIENT_PAGE_SIZE;
        }

        return Math.max(
            1,
            Math.min(
                MAX_PATIENT_PAGE_SIZE,
                number
            )
        );
    }

    function getPatientPageSize() {
        return normalizePatientPageSize(
            safeGet(
                PATIENT_PAGE_SIZE_KEY,
                DEFAULT_PATIENT_PAGE_SIZE
            )
        );
    }

    function savePatientPageSize(value) {
        const size = normalizePatientPageSize(value);

        safeSet(
            PATIENT_PAGE_SIZE_KEY,
            size
        );

        return size;
    }

    /*
     * 重要：
     * Tampermonkey 在部分 Chrome/版本组合中，用户脚本的 window 与网页自己的
     * JavaScript window 可能不是同一个执行环境。
     *
     * v2.5 直接修改 XMLHttpRequest.prototype 时，悬浮框虽然正常工作，
     * 但 HIS 自己发出的 Axios/XHR 请求仍可能绕过拦截，所以 Network 里仍是
     * pageSize: 10。
     *
     * v2.5.2 改为通过 unsafeWindow 直接挂接“网页自身”的 XHR/fetch。
     * 同时不再依赖接口 URL，而是检查最终请求体：只要当前页面请求 JSON 中
     * 同时存在 pageNum/pageSize，就把最终发送的 pageSize 改成悬浮框设定值。
     */

    const PAGE_WINDOW =
        typeof unsafeWindow !== 'undefined'
            ? unsafeWindow
            : window;

    const PAGE_SIZE_BRIDGE =
        '__tmDoctorDrgPatientPageSize_v252';

    const LAST_PATIENT_REQUEST_BRIDGE =
        '__tmDoctorDrgLastPatientRequest_v252';

    const EXPORT_BYPASS_BRIDGE =
        '__tmDoctorDrgExportBypass_v252';

    function syncPatientPageSizeToPageWindow() {
        try {
            PAGE_WINDOW[PAGE_SIZE_BRIDGE] =
                getPatientPageSize();
        } catch (error) {
            // 极少数环境下 unsafeWindow 属性写入失败时忽略
        }
    }

    function getBridgedPatientPageSize() {
        try {
            const value = parseInt(
                PAGE_WINDOW[PAGE_SIZE_BRIDGE],
                10
            );

            if (
                Number.isFinite(value) &&
                value >= 1
            ) {
                return Math.min(
                    MAX_PATIENT_PAGE_SIZE,
                    value
                );
            }
        } catch (error) {
            // 回退到本地设置
        }

        return getPatientPageSize();
    }

    function modifyPatientPageUrl(url) {
        try {
            const original = String(url || '');
            const parsed = new URL(
                original,
                location.origin
            );

            const size =
                getBridgedPatientPageSize();

            let changed = false;

            ['pageSize', 'size', 'limit'].forEach(key => {
                if (parsed.searchParams.has(key)) {
                    const oldValue =
                        parsed.searchParams.get(key);

                    parsed.searchParams.set(
                        key,
                        String(size)
                    );

                    changed = true;

                    console.log(
                        `[医师DRG助手 v2.5.3] URL ${key}: ${oldValue} → ${size}`
                    );
                }
            });

            if (!changed) {
                return url;
            }

            if (
                original.startsWith('/') &&
                parsed.origin === location.origin
            ) {
                return (
                    parsed.pathname +
                    parsed.search +
                    parsed.hash
                );
            }

            return parsed.href;
        } catch (error) {
            return url;
        }
    }

    function isPatientListPayload(data) {
        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data)
        ) {
            return false;
        }

        /*
         * 当前责任医师/在院患者请求体已确认包含：
         * pageNum、pageSize、hospitalArea，以及姓名/病案号等查询条件。
         *
         * 核心判断使用 pageNum + pageSize；
         * 脚本本身只在两个患者查询页面运行，因此不会影响其它 HIS 页面。
         */
        return (
            Object.prototype.hasOwnProperty.call(
                data,
                'pageNum'
            ) &&
            Object.prototype.hasOwnProperty.call(
                data,
                'pageSize'
            )
        );
    }

    function isExportBypassActive() {
        try {
            return Boolean(
                PAGE_WINDOW[EXPORT_BYPASS_BRIDGE]
            );
        } catch (error) {
            return false;
        }
    }

    function clonePlainData(value) {
        try {
            return JSON.parse(
                JSON.stringify(value)
            );
        } catch (error) {
            return null;
        }
    }

    function normalizeRequestHeaders(headers) {
        const result = {};

        if (!headers) {
            return result;
        }

        try {
            if (
                typeof Headers !== 'undefined' &&
                headers instanceof Headers
            ) {
                headers.forEach((value, key) => {
                    result[key] = value;
                });

                return result;
            }
        } catch (error) {
            // 继续按其它格式处理
        }

        if (Array.isArray(headers)) {
            headers.forEach(item => {
                if (
                    Array.isArray(item) &&
                    item.length >= 2
                ) {
                    result[String(item[0])] =
                        String(item[1]);
                }
            });

            return result;
        }

        if (typeof headers === 'object') {
            Object.keys(headers).forEach(key => {
                if (
                    headers[key] !== undefined &&
                    headers[key] !== null
                ) {
                    result[key] = String(headers[key]);
                }
            });
        }

        return result;
    }

    function rememberPatientRequest(data, meta = {}) {
        if (
            isExportBypassActive() ||
            !isPatientListPayload(data)
        ) {
            return;
        }

        const payload = clonePlainData(data);

        if (!payload) {
            return;
        }

        try {
            PAGE_WINDOW[LAST_PATIENT_REQUEST_BRIDGE] = {
                url: String(meta.url || ''),
                method: String(
                    meta.method || 'POST'
                ).toUpperCase(),
                headers: normalizeRequestHeaders(
                    meta.headers
                ),
                payload,
                capturedAt: Date.now()
            };
        } catch (error) {
            // 忽略缓存失败
        }
    }

    function readLastPatientRequest() {
        try {
            const value =
                PAGE_WINDOW[LAST_PATIENT_REQUEST_BRIDGE];

            if (
                value &&
                value.payload &&
                isPatientListPayload(value.payload)
            ) {
                return clonePlainData(value);
            }
        } catch (error) {
            // 忽略
        }

        return null;
    }

    function modifyPatientPageObject(data, meta = {}) {
        if (!isPatientListPayload(data)) {
            return false;
        }

        if (isExportBypassActive()) {
            return false;
        }

        // 保存“修改前”的当前查询条件，供“导出全部数据”后台分批复用
        rememberPatientRequest(data, meta);

        const size =
            getBridgedPatientPageSize();

        const oldSize = data.pageSize;

        data.pageSize = size;

        console.log(
            `[医师DRG助手 v2.5.3] 患者分页请求 pageSize: ${oldSize} → ${size}`,
            data
        );

        return true;
    }

    function modifyPatientPageBody(body, meta = {}) {
        /*
         * Axios 在该 HIS 中发送的是 JSON 字符串。
         */
        if (typeof body === 'string') {
            try {
                const data = JSON.parse(body);

                if (modifyPatientPageObject(data, meta)) {
                    return JSON.stringify(data);
                }
            } catch (error) {
                // 不是 JSON 时继续尝试表单编码
            }

            try {
                const params =
                    new URLSearchParams(body);

                if (
                    params.has('pageNum') &&
                    params.has('pageSize')
                ) {
                    const oldSize =
                        params.get('pageSize');

                    const size =
                        getBridgedPatientPageSize();

                    params.set(
                        'pageSize',
                        String(size)
                    );

                    console.log(
                        `[医师DRG助手 v2.5.3] 表单 pageSize: ${oldSize} → ${size}`
                    );

                    return params.toString();
                }
            } catch (error) {
                // 保留原请求体
            }

            return body;
        }

        if (body instanceof URLSearchParams) {
            if (
                body.has('pageNum') &&
                body.has('pageSize')
            ) {
                body.set(
                    'pageSize',
                    String(
                        getBridgedPatientPageSize()
                    )
                );
            }

            return body;
        }

        if (body instanceof FormData) {
            if (
                body.has('pageNum') &&
                body.has('pageSize')
            ) {
                body.set(
                    'pageSize',
                    String(
                        getBridgedPatientPageSize()
                    )
                );
            }

            return body;
        }

        return body;
    }

    function installPatientPageInterceptor() {
        syncPatientPageSizeToPageWindow();

        const pageXhr =
            PAGE_WINDOW.XMLHttpRequest;

        if (
            pageXhr?.prototype &&
            !pageXhr.prototype
                .__tmPatientPageV252Installed
        ) {
            const originalOpen =
                pageXhr.prototype.open;

            const originalSend =
                pageXhr.prototype.send;

            const originalSetRequestHeader =
                pageXhr.prototype.setRequestHeader;

            pageXhr.prototype.open = function (
                method,
                url,
                ...args
            ) {
                this.__tmPatientPageV252Url =
                    String(url || '');

                this.__tmPatientPageV252Method =
                    String(method || 'POST').toUpperCase();

                this.__tmPatientPageV252Headers = {};

                const newUrl =
                    modifyPatientPageUrl(url);

                return originalOpen.call(
                    this,
                    method,
                    newUrl,
                    ...args
                );
            };

            pageXhr.prototype.setRequestHeader = function (
                name,
                value
            ) {
                try {
                    this.__tmPatientPageV252Headers =
                        this.__tmPatientPageV252Headers || {};

                    this.__tmPatientPageV252Headers[
                        String(name)
                    ] = String(value);
                } catch (error) {
                    // 不影响原请求
                }

                return originalSetRequestHeader.call(
                    this,
                    name,
                    value
                );
            };

            pageXhr.prototype.send = function (body) {
                /*
                 * send() 收到的是浏览器最终发送前的请求体。
                 * 同时保存当前查询 URL/方法/请求头/条件，供后台全量导出复用。
                 */
                const newBody =
                    modifyPatientPageBody(
                        body,
                        {
                            url: this.__tmPatientPageV252Url,
                            method: this.__tmPatientPageV252Method,
                            headers: this.__tmPatientPageV252Headers
                        }
                    );

                return originalSend.call(
                    this,
                    newBody
                );
            };

            try {
                Object.defineProperty(
                    pageXhr.prototype,
                    '__tmPatientPageV252Installed',
                    {
                        value: true,
                        configurable: true
                    }
                );
            } catch (error) {
                pageXhr.prototype
                    .__tmPatientPageV252Installed = true;
            }

            console.log(
                '[医师DRG助手 v2.5.3] 已直接挂接网页自身 XMLHttpRequest'
            );
        }

        if (
            typeof PAGE_WINDOW.fetch === 'function' &&
            !PAGE_WINDOW.fetch
                .__tmPatientPageV252Installed
        ) {
            const originalFetch =
                PAGE_WINDOW.fetch;

            const wrappedFetch =
                function (input, init = {}) {
                    let newInput = input;
                    let newInit = {
                        ...init
                    };

                    const url =
                        typeof input === 'string'
                            ? input
                            : input?.url || '';

                    if (typeof input === 'string') {
                        newInput =
                            modifyPatientPageUrl(input);
                    }

                    if (
                        Object.prototype.hasOwnProperty.call(
                            newInit,
                            'body'
                        )
                    ) {
                        newInit.body =
                            modifyPatientPageBody(
                                newInit.body,
                                {
                                    url,
                                    method:
                                        newInit.method ||
                                        input?.method ||
                                        'POST',
                                    headers:
                                        newInit.headers ||
                                        input?.headers ||
                                        {}
                                }
                            );
                    }

                    return originalFetch.call(
                        this,
                        newInput,
                        newInit
                    );
                };

            wrappedFetch
                .__tmPatientPageV252Installed = true;

            PAGE_WINDOW.fetch =
                wrappedFetch;

            console.log(
                '[医师DRG助手 v2.5.3] 已直接挂接网页自身 fetch'
            );
        }
    }

    /*
     * document-start 立即安装一次。
     * 同时在后续 UI 初始化时还会再次检查，以兼容 HIS 的 SPA 路由切换。
     */
    installPatientPageInterceptor();

    function findPagedArray(container) {
        if (!container) {
            return null;
        }

        if (Array.isArray(container)) {
            return {
                records: container,
                total: container.length
            };
        }

        if (typeof container !== 'object') {
            return null;
        }

        const arrayKeys = [
            'records',
            'rows',
            'list',
            'content',
            'items',
            'dataList'
        ];

        const totalKeys = [
            'total',
            'totalCount',
            'count',
            'recordCount'
        ];

        for (const key of arrayKeys) {
            if (Array.isArray(container[key])) {
                let total = NaN;

                for (const totalKey of totalKeys) {
                    const value = Number(
                        container[totalKey]
                    );

                    if (Number.isFinite(value)) {
                        total = value;
                        break;
                    }
                }

                return {
                    records: container[key],
                    total
                };
            }
        }

        return null;
    }

    function extractPagedResult(json) {
        const candidates = [
            json,
            json?.data,
            json?.result,
            json?.data?.data,
            json?.result?.data
        ];

        for (const candidate of candidates) {
            const found = findPagedArray(candidate);

            if (found) {
                return found;
            }
        }

        return {
            records: [],
            total: NaN
        };
    }

    function sanitizeExportHeaders(headers) {
        const result = {};

        Object.entries(
            normalizeRequestHeaders(headers)
        ).forEach(([key, value]) => {
            const lower = key.toLowerCase();

            // 这些头由浏览器自动维护，不允许脚本自行设置
            if ([
                'content-length',
                'host',
                'origin',
                'referer',
                'cookie',
                'connection',
                'accept-encoding'
            ].includes(lower)) {
                return;
            }

            result[key] = value;
        });

        const hasContentType =
            Object.keys(result).some(
                key =>
                    key.toLowerCase() ===
                    'content-type'
            );

        if (!hasContentType) {
            result['Content-Type'] =
                'application/json;charset=UTF-8';
        }

        return result;
    }

    async function fetchExportPage(
        request,
        pageNum,
        pageSize
    ) {
        const payload = clonePlainData(
            request.payload
        );

        if (!payload) {
            throw new Error(
                '无法复制当前查询条件'
            );
        }

        payload.pageNum = pageNum;
        payload.pageSize = pageSize;

        const url = request.url ||
            '/hospitalApi/api/patient/page';

        const method =
            String(request.method || 'POST')
                .toUpperCase();

        const options = {
            method,
            credentials: 'same-origin',
            headers: sanitizeExportHeaders(
                request.headers
            )
        };

        if (
            method !== 'GET' &&
            method !== 'HEAD'
        ) {
            options.body = JSON.stringify(payload);
        }

        let responsePromise;

        try {
            PAGE_WINDOW[EXPORT_BYPASS_BRIDGE] =
                true;

            responsePromise = PAGE_WINDOW.fetch(
                url,
                options
            );
        } finally {
            PAGE_WINDOW[EXPORT_BYPASS_BRIDGE] =
                false;
        }

        const response = await responsePromise;

        if (!response.ok) {
            throw new Error(
                `第${pageNum}页请求失败：HTTP ${response.status}`
            );
        }

        const json = await response.json();
        const result = extractPagedResult(json);

        if (!Array.isArray(result.records)) {
            throw new Error(
                '无法识别接口返回的数据列表'
            );
        }

        return result;
    }

    function flattenExportRecord(
        value,
        prefix = '',
        output = {}
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            if (prefix) {
                output[prefix] = '';
            }

            return output;
        }

        if (Array.isArray(value)) {
            if (prefix) {
                output[prefix] = JSON.stringify(value);
            }

            return output;
        }

        if (typeof value !== 'object') {
            if (prefix) {
                output[prefix] = value;
            }

            return output;
        }

        Object.keys(value).forEach(key => {
            const child = value[key];
            const childKey = prefix
                ? `${prefix}.${key}`
                : key;

            if (
                child &&
                typeof child === 'object' &&
                !Array.isArray(child)
            ) {
                flattenExportRecord(
                    child,
                    childKey,
                    output
                );
            } else if (Array.isArray(child)) {
                output[childKey] =
                    JSON.stringify(child);
            } else {
                output[childKey] =
                    child ?? '';
            }
        });

        return output;
    }

    function csvCell(value) {
        let text;

        if (
            value === null ||
            value === undefined
        ) {
            text = '';
        } else if (
            typeof value === 'object'
        ) {
            text = JSON.stringify(value);
        } else {
            text = String(value);
        }

        return `"${text.replace(/"/g, '""')}"`;
    }

    function exportRecordsToCsv(records) {
        const flatRecords = records.map(
            record => flattenExportRecord(record)
        );

        const columns = [];
        const seen = new Set();

        flatRecords.forEach(record => {
            Object.keys(record).forEach(key => {
                if (!seen.has(key)) {
                    seen.add(key);
                    columns.push(key);
                }
            });
        });

        if (!columns.length) {
            throw new Error(
                '返回数据中没有可导出的字段'
            );
        }

        const lines = [
            columns.map(csvCell).join(',')
        ];

        flatRecords.forEach(record => {
            lines.push(
                columns.map(key =>
                    csvCell(record[key])
                ).join(',')
            );
        });

        const csv =
            '\ufeff' + lines.join('\r\n');

        const blob = new Blob(
            [csv],
            {
                type:
                    'text/csv;charset=utf-8;'
            }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const pageName =
            location.pathname.includes(
                'attendingPhysician'
            )
                ? '责任医师查询'
                : '在院患者查询';

        const now = new Date();
        const stamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            '_',
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ].join('');

        link.href = url;
        link.download =
            `${pageName}_全部数据_${stamp}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 3000);
    }

    async function exportAllPatientData() {
        const button =
            $('#tm-export-all-btn');

        if (button?.disabled) {
            return;
        }

        const request =
            readLastPatientRequest();

        if (!request) {
            setStatus(
                '尚未捕获患者查询条件。请先点击页面“查询”，再执行全部导出。',
                true
            );

            return;
        }

        const confirmed = window.confirm(
            '确认导出当前查询条件下的全部数据吗？\n\n' +
            '导出将在后台分批获取全部记录，不会改变当前页面的每页显示数量。'
        );

        if (!confirmed) {
            setStatus('已取消导出。');
            return;
        }

        const oldText =
            button?.textContent ||
            '导出全部数据';

        if (button) {
            button.disabled = true;
            button.textContent =
                '准备导出…';
        }

        try {
            const allRecords = [];
            let total = NaN;
            let pageNum = 1;

            while (pageNum <= EXPORT_MAX_PAGES) {
                if (button) {
                    const suffix =
                        Number.isFinite(total)
                            ? ` ${allRecords.length}/${total}`
                            : ` 第${pageNum}批`;

                    button.textContent =
                        `导出中${suffix}`;
                }

                setStatus(
                    Number.isFinite(total)
                        ? `正在后台导出：已获取 ${allRecords.length} / ${total} 条；页面每页显示量不会改变。`
                        : `正在后台导出第 ${pageNum} 批数据；页面每页显示量不会改变。`
                );

                const result =
                    await fetchExportPage(
                        request,
                        pageNum,
                        EXPORT_BATCH_SIZE
                    );

                if (
                    Number.isFinite(result.total) &&
                    result.total >= 0
                ) {
                    total = result.total;
                }

                const batch = result.records;

                if (!batch.length) {
                    break;
                }

                allRecords.push(...batch);

                if (
                    Number.isFinite(total) &&
                    allRecords.length >= total
                ) {
                    break;
                }

                if (
                    !Number.isFinite(total) &&
                    batch.length < EXPORT_BATCH_SIZE
                ) {
                    break;
                }

                pageNum++;
            }

            if (!allRecords.length) {
                throw new Error(
                    '当前查询没有可导出的数据'
                );
            }

            if (
                Number.isFinite(total) &&
                allRecords.length > total
            ) {
                allRecords.length = total;
            }

            exportRecordsToCsv(allRecords);

            setStatus(
                `全部导出完成：共 ${allRecords.length} 条。导出采用后台每批 ${EXPORT_BATCH_SIZE} 条，不会一次性渲染到表格。`
            );
        } catch (error) {
            console.error(
                '[医师DRG助手 v2.5.3] 全部导出失败：',
                error
            );

            setStatus(
                `全部导出失败：${error?.message || error}`,
                true
            );
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = oldText;
            }
        }
    }

    function triggerPatientPageQuery() {
        const candidates = $$(
            'button, .el-button'
        );

        const queryButton =
            candidates.find(button =>
                clean(button.innerText) === '查询'
            );

        if (queryButton) {
            queryButton.click();
            return true;
        }

        return false;
    }

    function applyPatientPageSize() {
        const input =
            $('#tm-page-size-input');

        if (!input) {
            return;
        }

        const raw = clean(input.value);
        const number = parseInt(raw, 10);

        if (
            !Number.isFinite(number) ||
            number < 1 ||
            number > MAX_PATIENT_PAGE_SIZE
        ) {
            input.focus();

            setStatus(
                `每页数量应填写 1～${MAX_PATIENT_PAGE_SIZE} 的整数。`,
                true
            );

            return;
        }

        const size =
            savePatientPageSize(number);

        input.value = String(size);

        // 立即把新值同步给网页自身的 XHR/fetch 拦截器
        syncPatientPageSizeToPageWindow();
        installPatientPageInterceptor();

        const triggered =
            triggerPatientPageQuery();

        setStatus(
            triggered
                ? `已统一设置每页 ${size} 条（在院患者/责任医师共用），并已重新执行页面查询。`
                : `已统一设置每页 ${size} 条（在院患者/责任医师共用）；下次点击页面“查询”时生效。`
        );
    }

    function adjustmentStorageKey() {
        return `${ADJUSTMENT_KEY_PREFIX}|${location.pathname}`;
    }

    function parseAdjustment(raw) {
        let text = clean(raw).replace(/％/g, '%');

        if (!text) {
            text = '0%';
        }

        const percent = text.match(
            /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))%$/
        );

        if (percent) {
            const value = Number(percent[1]);

            if (Number.isFinite(value)) {
                return {
                    valid: true,
                    type: 'percent',
                    value,
                    normalized: `${value > 0 ? '+' : ''}${value}%`
                };
            }
        }

        const amount = text.match(
            /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/
        );

        if (amount) {
            const value = Number(amount[1]);

            if (Number.isFinite(value)) {
                return {
                    valid: true,
                    type: 'amount',
                    value,
                    normalized: `${value > 0 ? '+' : ''}${value}`
                };
            }
        }

        return {
            valid: false,
            type: 'percent',
            value: 0,
            normalized: '0%'
        };
    }

    function applyAdjustment(base, adjustment) {
        if (!Number.isFinite(base)) {
            return NaN;
        }

        const threshold =
            adjustment.type === 'percent'
                ? base * (1 + adjustment.value / 100)
                : base + adjustment.value;

        return Math.max(0, threshold);
    }

    function getCurrentAdjustment() {
        const raw =
            $('#tm-fee-adjustment-input')?.value ??
            safeGet(adjustmentStorageKey(), '0%');

        const parsed = parseAdjustment(raw);

        return parsed.valid
            ? parsed
            : parseAdjustment('0%');
    }

    function getMainRows(table) {
        const tbody =
            table &&
            $('.el-table__body-wrapper tbody', table);

        if (!tbody) {
            return [];
        }

        return Array.from(tbody.children).filter(row =>
            row.classList.contains('el-table__row')
        );
    }

    function getTable() {
        let best = null;
        let bestScore = -1;

        $$('.el-table').forEach(table => {
            const header =
                $('.el-table__header-wrapper', table);

            if (!header) {
                return;
            }

            const text = clean(header.innerText);

            let score = 0;

            if (text.includes('病案号')) {
                score += 10;
            }

            if (text.includes('患者姓名')) {
                score += 10;
            }

            if (text.includes('责任医师')) {
                score += 8;
            }

            if (text.includes('在院费用')) {
                score += 8;
            }

            if (text.includes('拨付费用')) {
                score += 8;
            }

            if (
                text.includes('DRG预分组') ||
                text.includes('DRG分组')
            ) {
                score += 8;
            }

            score += Math.min(
                getMainRows(table).length,
                20
            );

            if (score > bestScore) {
                bestScore = score;
                best = table;
            }
        });

        return bestScore >= 10 ? best : null;
    }

    function getHeaders(table) {
        const wrapper =
            table &&
            $('.el-table__header-wrapper', table);

        if (!wrapper) {
            return [];
        }

        return $$('thead th', wrapper).map(th =>
            clean(
                (
                    $('.cell', th) ||
                    th
                ).innerText
            )
        );
    }

    function colIndex(table, names) {
        const headers = getHeaders(table);

        for (const name of names) {
            const index = headers.findIndex(
                header => header === name
            );

            if (index !== -1) {
                return index;
            }
        }

        for (const name of names) {
            const index = headers.findIndex(
                header => header.includes(name)
            );

            if (index !== -1) {
                return index;
            }
        }

        return -1;
    }

    function getRowGroups(table) {
        const groups = [];
        const seen = new Set();

        function add(wrapper) {
            const tbody =
                wrapper &&
                $('tbody', wrapper);

            if (!tbody || seen.has(tbody)) {
                return;
            }

            const rows = Array.from(
                tbody.children
            ).filter(row =>
                row.classList.contains('el-table__row')
            );

            if (!rows.length) {
                return;
            }

            seen.add(tbody);

            groups.push({
                tbody,
                rows
            });
        }

        add(
            $('.el-table__body-wrapper', table)
        );

        $$(
            '.el-table__fixed-body-wrapper',
            table
        ).forEach(add);

        return groups;
    }

    function cellText(row, index) {
        if (
            !row ||
            index < 0 ||
            !row.cells?.[index]
        ) {
            return '';
        }

        const cell = row.cells[index];

        return clean(
            (
                $('.cell', cell) ||
                cell
            ).innerText
        );
    }

    /*
     * 完整快照同时保存“列定义 + 每行字段”。字段键优先使用稳定的语义键，
     * 未识别列使用 column_N；即使医院后续调整中文列名或列顺序，掌上OHA
     * 仍可通过 columns 中的 label/index 还原当前页面。原有DRG基线字段保留
     * 在记录顶层，避免影响患者信息脚本按住院号读取的旧逻辑。
     */
    function snapshotCanonicalColumnKey(label) {
        const text = clean(label);

        const rules = [
            ['sequence', ['序号']],
            ['admissionNo', ['病案号', '住院号']],
            ['hospitalizationCount', ['住院次数']],
            ['bedNo', ['床号']],
            ['attendingDoctor', ['主管医师', '主治医师', '经治医师']],
            ['responsibleDoctor', ['责任医师']],
            ['patientName', ['患者姓名', '姓名']],
            ['sex', ['性别']],
            ['age', ['年龄']],
            ['admissionDate', ['入院时间', '入院日期']],
            ['department', ['当前科室', '科室', '病区']],
            ['drgGroup', ['DRG预分组', 'DRG分组']],
            ['diagnosis', ['主要诊断', '入院诊断', '诊断']],
            ['inHospitalCost', ['在院费用', '住院费用', '总费用']],
            ['allocationFee', ['拨付费用']],
            ['dailyCost', ['每日花费', '每日费用']]
        ];

        for (const [key, aliases] of rules) {
            if (
                aliases.some(alias =>
                    text === alias ||
                    text.includes(alias)
                )
            ) {
                return key;
            }
        }

        return '';
    }

    function buildSnapshotColumns(table) {
        const used = new Set();

        return getHeaders(table).map((label, index) => {
            const base =
                snapshotCanonicalColumnKey(label) ||
                'column_' + (index + 1);
            let key = base;
            let suffix = 2;

            while (used.has(key)) {
                key = base + '_' + suffix;
                suffix += 1;
            }

            used.add(key);

            return {
                index,
                key,
                label:
                    clean(label) ||
                    '未命名列' + (index + 1)
            };
        });
    }

    function snapshotCellText(row, index) {
        const cell = row?.cells?.[index];

        if (!cell) {
            return '';
        }

        const controlValues = $$(
            'input:not([type="checkbox"]):not([type="radio"]), textarea, select',
            cell
        )
            .map(control => clean(control.value))
            .filter(Boolean);

        if (controlValues.length) {
            return Array.from(
                new Set(controlValues)
            ).join(' / ');
        }

        return cellText(row, index);
    }

    function snapshotFieldsForRow(row, columns) {
        const fields = {};

        columns.forEach(column => {
            fields[column.key] =
                snapshotCellText(
                    row,
                    column.index
                );
        });

        return fields;
    }

    function firstSnapshotField(fields, keys) {
        for (const key of keys) {
            const value = clean(fields?.[key]);

            if (value) {
                return value;
            }
        }

        return '';
    }

    function getIdentity(table, row) {
        const parts = [
            ['病案号'],
            ['住院次数'],
            ['患者姓名'],
            ['床号']
        ].map(names => {
            const index = colIndex(table, names);

            return index === -1
                ? ''
                : cellText(row, index);
        });

        const identity = parts.join('|');

        return identity.replace(/\|/g, '')
            ? identity
            : clean(row.innerText).slice(0, 120);
    }

    function assignmentKey(table, row) {
        return (
            `${DRG_ASSIGN_PREFIX}|` +
            `${location.pathname}|` +
            `${encodeURIComponent(
                getIdentity(table, row)
            )}`
        );
    }

    function readHistory() {
        try {
            const value = JSON.parse(
                safeGet(DRG_HISTORY_KEY, '[]')
            );

            return Array.isArray(value)
                ? value
                    .map(clean)
                    .filter(Boolean)
                    .slice(0, 200)
                : [];
        } catch (error) {
            return [];
        }
    }

    function writeHistory(values) {
        const unique = Array.from(
            new Set(
                values
                    .map(clean)
                    .filter(Boolean)
            )
        ).slice(0, 200);

        safeSet(
            DRG_HISTORY_KEY,
            JSON.stringify(unique)
        );

        return unique;
    }

    function addHistory(value) {
        value = clean(value);

        if (!value) {
            return readHistory();
        }

        return writeHistory([
            value,
            ...readHistory().filter(
                item => item !== value
            )
        ]);
    }

    function readAssignment(table, row) {
        return clean(
            safeGet(
                assignmentKey(table, row),
                ''
            )
        );
    }

    function saveAssignment(table, row, value) {
        value = clean(value);

        if (value) {
            safeSet(
                assignmentKey(table, row),
                value
            );

            addHistory(value);
        } else {
            safeRemove(
                assignmentKey(table, row)
            );
        }
    }

    function getDrgValue(row, drgIndex) {
        if (
            drgIndex < 0 ||
            !row.cells?.[drgIndex]
        ) {
            return '';
        }

        const cell = row.cells[drgIndex];

        if (cell.dataset.tmServerDrg) {
            return clean(
                cell.dataset.tmServerDrg
            );
        }

        const input = $(
            '.tm-drg-local-input',
            cell
        );

        return input
            ? clean(input.value)
            : cellText(row, drgIndex);
    }

    function drgFeeMemoryKey(drgValue) {
        const group = drgGroupKey(drgValue);

        return group
            ? (
                `${DRG_FEE_KEY_PREFIX}|` +
                `${location.pathname}|` +
                `${encodeURIComponent(group)}`
            )
            : '';
    }

    function migrateOldFeeWarning(drgValue) {
        const exactDrg = clean(drgValue);

        if (!exactDrg) {
            return NaN;
        }

        const prefix =
            `${OLD_FEE_KEY_PREFIX}|${location.pathname}|`;

        const suffix =
            `|${encodeURIComponent(exactDrg)}`;

        try {
            for (
                let i = 0;
                i < localStorage.length;
                i++
            ) {
                const key = localStorage.key(i);

                if (
                    !key?.startsWith(prefix) ||
                    !key.endsWith(suffix)
                ) {
                    continue;
                }

                const value = money(
                    localStorage.getItem(key)
                );

                if (
                    !Number.isFinite(value) ||
                    value < 0
                ) {
                    continue;
                }

                const newKey =
                    drgFeeMemoryKey(drgValue);

                if (newKey) {
                    safeSet(newKey, value);
                }

                return value;
            }
        } catch (error) {
            // 忽略旧数据迁移失败
        }

        return NaN;
    }

    function readDrgFeeWarning(drgValue) {
        const key = drgFeeMemoryKey(drgValue);

        if (!key) {
            return NaN;
        }

        const value = money(
            safeGet(key, '')
        );

        if (
            Number.isFinite(value) &&
            value >= 0
        ) {
            return value;
        }

        return migrateOldFeeWarning(drgValue);
    }

    function saveDrgFeeWarning(drgValue, value) {
        const key = drgFeeMemoryKey(drgValue);

        if (!key) {
            return false;
        }

        if (
            value === '' ||
            value === null ||
            value === undefined
        ) {
            return safeRemove(key);
        }

        const number = money(value);

        if (
            !Number.isFinite(number) ||
            number < 0
        ) {
            return false;
        }

        return safeSet(key, number);
    }

    function drgDailyCostMemoryKey(drgValue) {
        const group = drgGroupKey(drgValue);

        return group
            ? (
                `${DRG_DAILY_COST_KEY_PREFIX}|` +
                `${location.pathname}|` +
                `${encodeURIComponent(group)}`
            )
            : '';
    }

    function readDrgDailyCost(drgValue) {
        const key =
            drgDailyCostMemoryKey(drgValue);

        if (!key) {
            return DEFAULT_DAILY_COST;
        }

        const value = money(
            safeGet(key, '')
        );

        return (
            Number.isFinite(value) &&
            value > 0
        )
            ? value
            : DEFAULT_DAILY_COST;
    }

    function saveDrgDailyCost(drgValue, value) {
        const key =
            drgDailyCostMemoryKey(drgValue);

        if (!key) {
            return false;
        }

        if (
            value === '' ||
            value === null ||
            value === undefined
        ) {
            return safeRemove(key);
        }

        const number = money(value);

        if (
            !Number.isFinite(number) ||
            number <= 0
        ) {
            return false;
        }

        return safeSet(key, number);
    }

    function calculateRemainingDays(
        baseWarning,
        currentFee,
        dailyCost
    ) {
        if (
            !Number.isFinite(baseWarning) ||
            !Number.isFinite(currentFee) ||
            !Number.isFinite(dailyCost) ||
            dailyCost <= 0
        ) {
            return NaN;
        }

        if (currentFee >= baseWarning) {
            return 0;
        }

        return Math.ceil(
            (baseWarning - currentFee) /
            dailyCost
        );
    }

    function buildHistorySelect(select) {
        const history = readHistory();
        const signature = JSON.stringify(history);

        if (
            select.dataset.tmSignature ===
            signature
        ) {
            return;
        }

        select.dataset.tmSignature = signature;
        select.innerHTML =
            '<option value="">▼</option>';

        history.forEach(value => {
            const option =
                document.createElement('option');

            option.value = value;
            option.textContent = value;
            option.title = value;

            select.appendChild(option);
        });
    }

    function refreshAllHistorySelects() {
        $$('.tm-drg-history-select')
            .forEach(buildHistorySelect);
    }


    function getCurrentPageDrgSet() {
        const table = getTable();
        const values = new Set();

        if (!table) {
            return values;
        }

        const drgIndex = colIndex(
            table,
            [
                'DRG预分组',
                'DRG分组'
            ]
        );

        if (drgIndex < 0) {
            return values;
        }

        getMainRows(table).forEach(row => {
            const value =
                getDrgValue(
                    row,
                    drgIndex
                );

            if (value) {
                values.add(value);
            }
        });

        return values;
    }


    function currentDrgSnapshotStatusText() {
        const snapshot =
            readDrgRoundBookSnapshot();

        if (!snapshot) {
            return '尚未提取住院列表完整快照。';
        }

        const count =
            Number(snapshot.count) ||
            Object.keys(
                snapshot.records || {}
            ).length;

        return (
            '最近提取：' +
            (
                snapshot.capturedAtLabel ||
                snapshot.capturedAt ||
                '时间未知'
            ) +
            '；' +
            count +
            ' 位患者；' +
            (
                Number(snapshot.columnCount) ||
                (Array.isArray(snapshot.columns)
                    ? snapshot.columns.length
                    : 0)
            ) +
            ' 列。'
        );
    }

    function captureCurrentPageDrgInfo() {
        const table = getTable();

        if (!table) {
            throw new Error(
                '未识别到当前患者表格'
            );
        }

        /*
         * 先准备编辑器，确保系统DRG保存在dataset，
         * 空白系统DRG时也能读取脚本手工补录值。
         */
        prepareDrgEditors();

        const columns =
            buildSnapshotColumns(table);

        const admissionIndex =
            colIndex(
                table,
                ['住院号', '病案号']
            );

        const nameIndex =
            colIndex(
                table,
                ['患者姓名', '姓名']
            );

        const drgIndex =
            colIndex(
                table,
                ['DRG预分组', 'DRG分组']
            );

        if (admissionIndex < 0) {
            throw new Error(
                '当前表格未找到住院号/病案号列'
            );
        }

        if (drgIndex < 0) {
            throw new Error(
                '当前表格未找到DRG分组列'
            );
        }

        const rows =
            getMainRows(table);

        if (!rows.length) {
            throw new Error(
                '当前页面没有可提取患者'
            );
        }

        const records = {};
        const capturedRows = [];
        let capturedCount = 0;
        let drgCount = 0;
        let allocationCount = 0;

        rows.forEach((row, rowIndex) => {
            const fields =
                snapshotFieldsForRow(
                    row,
                    columns
                );

            const admissionNo =
                clean(
                    cellText(
                        row,
                        admissionIndex
                    )
                )
                    .replace(
                        /[^A-Za-z0-9-]/g,
                        ''
                    );

            if (!admissionNo) {
                return;
            }

            const drgCell =
                row.cells?.[drgIndex];

            const serverDrg =
                clean(
                    drgCell?.dataset
                        ?.tmServerDrg || ''
                );

            const manualDrg =
                clean(
                    readAssignment(
                        table,
                        row
                    )
                );

            const effectiveDrg =
                clean(
                    getDrgValue(
                        row,
                        drgIndex
                    )
                ) ||
                serverDrg ||
                manualDrg;

            const allocationFee =
                effectiveDrg
                    ? readDrgFeeWarning(
                        effectiveDrg
                    )
                    : NaN;

            const dailyCost =
                effectiveDrg
                    ? readDrgDailyCost(
                        effectiveDrg
                    )
                    : NaN;

            const drgColumnKey =
                columns[drgIndex]?.key;

            if (drgColumnKey) {
                fields[drgColumnKey] =
                    effectiveDrg;
            }

            const patientName =
                nameIndex >= 0
                    ? cellText(
                        row,
                        nameIndex
                    )
                    : firstSnapshotField(
                        fields,
                        ['patientName']
                    );

            const record = {
                rowIndex:
                    rowIndex + 1,
                admissionNo,
                name:
                    patientName,
                patientName,
                sequence:
                    firstSnapshotField(
                        fields,
                        ['sequence']
                    ) || String(rowIndex + 1),
                bedNo:
                    firstSnapshotField(
                        fields,
                        ['bedNo']
                    ),
                sex:
                    firstSnapshotField(
                        fields,
                        ['sex']
                    ),
                age:
                    firstSnapshotField(
                        fields,
                        ['age']
                    ),
                admissionDate:
                    firstSnapshotField(
                        fields,
                        ['admissionDate']
                    ),
                department:
                    firstSnapshotField(
                        fields,
                        ['department']
                    ),
                attendingDoctor:
                    firstSnapshotField(
                        fields,
                        ['attendingDoctor']
                    ),
                responsibleDoctor:
                    firstSnapshotField(
                        fields,
                        ['responsibleDoctor']
                    ),
                diagnosis:
                    firstSnapshotField(
                        fields,
                        ['diagnosis']
                    ),
                inHospitalCost:
                    firstSnapshotField(
                        fields,
                        ['inHospitalCost']
                    ),
                drgGroup:
                    effectiveDrg,
                drgSource:
                    serverDrg
                        ? 'system'
                        : manualDrg
                            ? 'manual'
                            : '',
                serverDrg,
                manualDrg,
                allocationFee:
                    Number.isFinite(
                        allocationFee
                    )
                        ? allocationFee
                        : null,
                dailyCost:
                    Number.isFinite(
                        dailyCost
                    )
                        ? dailyCost
                        : null,
                fields
            };

            /*
             * records 继续按住院号索引，供旧版患者信息脚本 getPatient() 读取；
             * rows 保留当前页面的原始顺序，供掌上OHA完整住院视图使用。
             */
            records[admissionNo] = record;
            capturedRows.push(record);

            capturedCount += 1;

            if (effectiveDrg) {
                drgCount += 1;
            }

            if (
                Number.isFinite(
                    allocationFee
                )
            ) {
                allocationCount += 1;
            }
        });

        if (!capturedCount) {
            throw new Error(
                '当前页面没有识别到有效住院号'
            );
        }

        const now =
            new Date();

        const snapshot = {
            kind:
                'medical-doctor-drg-inpatient-page-snapshot',
            schemaVersion: 2,
            fullSnapshot: true,
            capturedAt:
                now.toISOString(),
            capturedAtLabel:
                now.toLocaleString(),
            sourceUrl:
                location.href,
            sourcePath:
                location.pathname,
            count:
                capturedCount,
            columnCount:
                columns.length,
            drgCount,
            allocationCount,
            defaultDailyCost:
                DEFAULT_DAILY_COST,
            columns,
            rows:
                capturedRows,
            records
        };

        writeDrgRoundBookSnapshot(
            snapshot
        );

        return snapshot;
    }

    function updateDrgSnapshotManagerStatus() {
        const element =
            $('#tm-drg-snapshot-status');

        if (!element) {
            return;
        }

        element.textContent =
            currentDrgSnapshotStatusText();
    }

    function captureCurrentPageDrgInfoFromManager() {
        const button =
            $('#tm-drg-capture-current-page');

        if (button?.disabled) {
            return;
        }

        const oldText =
            button?.textContent ||
            '提取当前页面信息';

        if (button) {
            button.disabled = true;
            button.textContent =
                '正在提取…';
        }

        try {
            const snapshot =
                captureCurrentPageDrgInfo();

            updateDrgSnapshotManagerStatus();

            setStatus(
                `住院列表完整快照已提取：${snapshot.count}人、${snapshot.columnCount}列；` +
                `有DRG ${snapshot.drgCount}人；` +
                `已设置拨付费用 ${snapshot.allocationCount}人。` +
                '所有当前页面字段已保存；原DRG分组（含系统/手工来源）、拨付费用和每日花费预设接口保持兼容。'
            );
        } catch (error) {
            setStatus(
                `提取当前页面信息失败：${error?.message || error}`,
                true
            );
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent =
                    oldText;
            }
        }
    }

    function afterDrgHistoryChanged(message) {
        refreshAllHistorySelects();
        updateDropdowns();
        loadSelectedDrgSettings();
        applyFilters();

        if (message) {
            setStatus(message);
        }

        renderDrgHistoryManager();
    }

    function removeDrgHistoryItem(value) {
        const history =
            readHistory();

        const next =
            history.filter(
                item => item !== value
            );

        writeHistory(next);

        afterDrgHistoryChanged(
            `已从本地DRG历史中删除：${value}`
        );
    }

    function clearUnusedDrgHistory() {
        const current =
            getCurrentPageDrgSet();

        const history =
            readHistory();

        const next =
            history.filter(value =>
                current.has(value)
            );

        const removed =
            history.length - next.length;

        writeHistory(next);

        afterDrgHistoryChanged(
            removed > 0
                ? `已清除 ${removed} 个当前页面未使用的DRG历史项。`
                : '没有发现可清除的冗余DRG历史项。'
        );
    }

    function clearAllDrgHistory() {
        if (
            !window.confirm(
                '确定清空全部本地DRG历史项吗？\n\n' +
                '不会删除医院系统返回的DRG，也不会删除患者已保存的本地补录、预警费用和每日花费设置。'
            )
        ) {
            return;
        }

        const count =
            readHistory().length;

        writeHistory([]);

        afterDrgHistoryChanged(
            `已清空 ${count} 个本地DRG历史项。`
        );
    }

    function closeDrgHistoryManager() {
        $('#tm-drg-history-manager')
            ?.remove();
    }

    function renderDrgHistoryManager() {
        const manager =
            $('#tm-drg-history-manager');

        if (!manager) {
            return;
        }

        const list =
            $('#tm-drg-history-list', manager);

        const count =
            $('#tm-drg-history-count', manager);

        if (!list || !count) {
            return;
        }

        const history =
            readHistory();

        const current =
            getCurrentPageDrgSet();

        count.textContent =
            `本地历史 ${history.length} 项；当前页面实际使用 ${current.size} 项`;

        list.innerHTML = '';

        if (!history.length) {
            const empty =
                document.createElement('div');

            empty.style.cssText = `
                padding:18px 8px;
                text-align:center;
                color:#909399;
                font-size:12px;
            `;

            empty.textContent =
                '暂无本地DRG历史项';

            list.appendChild(empty);
            return;
        }

        history.forEach(value => {
            const row =
                document.createElement('div');

            row.style.cssText = `
                display:grid;
                grid-template-columns:1fr auto auto;
                align-items:center;
                gap:6px;
                padding:6px 4px;
                border-bottom:1px solid #f0f0f0;
            `;

            const name =
                document.createElement('div');

            name.style.cssText = `
                min-width:0;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
                font-size:12px;
                color:#303133;
            `;

            name.textContent = value;
            name.title = value;

            const source =
                document.createElement('span');

            source.style.cssText = `
                padding:2px 5px;
                border-radius:3px;
                font-size:10px;
                white-space:nowrap;
            `;

            if (current.has(value)) {
                source.textContent =
                    '当前页使用';
                source.style.color =
                    '#67c23a';
                source.style.background =
                    '#f0f9eb';
            } else {
                source.textContent =
                    '历史冗余';
                source.style.color =
                    '#e6a23c';
                source.style.background =
                    '#fdf6ec';
            }

            const button =
                document.createElement('button');

            button.type = 'button';
            button.className =
                'tm-mini-btn';
            button.textContent =
                '删除';
            button.style.cssText = `
                background:#f56c6c;
                padding:4px 7px;
                font-size:11px;
            `;

            button.addEventListener(
                'click',
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    removeDrgHistoryItem(
                        value
                    );
                }
            );

            row.append(
                name,
                source,
                button
            );

            list.appendChild(row);
        });
    }

    function openDrgHistoryManager() {
        if ($('#tm-drg-history-manager')) {
            renderDrgHistoryManager();
            return;
        }

        const manager =
            document.createElement('div');

        manager.id =
            'tm-drg-history-manager';

        manager.style.cssText = `
            position:fixed;
            inset:0;
            z-index:1000001;
            display:flex;
            align-items:center;
            justify-content:center;
            background:rgba(0,0,0,.28);
        `;

        manager.innerHTML = `
            <div
                style="
                    width:460px;
                    max-width:calc(100vw - 30px);
                    max-height:75vh;
                    display:flex;
                    flex-direction:column;
                    box-sizing:border-box;
                    background:#fff;
                    border:1px solid #dcdfe6;
                    border-radius:7px;
                    box-shadow:0 8px 28px rgba(0,0,0,.25);
                    overflow:hidden;
                "
            >
                <div
                    style="
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                        padding:10px 12px;
                        background:#409eff;
                        color:#fff;
                    "
                >
                    <strong style="font-size:13px;">
                        DRG历史项管理
                    </strong>

                    <span
                        id="tm-drg-history-close"
                        style="
                            cursor:pointer;
                            font-size:12px;
                        "
                    >
                        关闭
                    </span>
                </div>

                <div
                    style="
                        padding:9px 12px 5px;
                        color:#606266;
                        font-size:11px;
                        line-height:1.5;
                    "
                >
                    <div id="tm-drg-history-count"></div>
                    <div style="color:#909399;margin-top:2px;">
                        这里只管理脚本保存的本地历史候选项；
                        医院系统当前返回的DRG不会被删除。
                    </div>
                </div>

                <div
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        padding:6px 12px 9px;
                    "
                >
                    <button
                        id="tm-drg-capture-current-page"
                        class="tm-mini-btn"
                        style="
                            flex:none;
                            background:#409eff;
                            padding:6px 10px;
                        "
                        title="提取当前已加载住院列表的全部列与字段；同时保留原DRG分组、拨付费用和每日花费基线，供8003查房本及掌上OHA读取"
                    >
                        提取当前页面信息
                    </button>

                    <span
                        id="tm-drg-snapshot-status"
                        style="
                            min-width:0;
                            color:#909399;
                            font-size:10px;
                            line-height:1.45;
                        "
                    ></span>
                </div>

                <div
                    id="tm-drg-history-list"
                    style="
                        flex:1;
                        min-height:80px;
                        overflow:auto;
                        padding:0 12px;
                    "
                ></div>

                <div
                    style="
                        display:flex;
                        gap:7px;
                        padding:10px 12px;
                        border-top:1px solid #ebeef5;
                    "
                >
                    <button
                        id="tm-drg-clear-unused"
                        class="tm-mini-btn"
                        style="
                            flex:1;
                            background:#e6a23c;
                        "
                    >
                        清除冗余项
                    </button>

                    <button
                        id="tm-drg-clear-all-history"
                        class="tm-mini-btn"
                        style="
                            flex:1;
                            background:#f56c6c;
                        "
                    >
                        清空全部历史
                    </button>

                    <button
                        id="tm-drg-manager-close-btn"
                        class="tm-mini-btn"
                        style="
                            background:#909399;
                        "
                    >
                        关闭
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(
            manager
        );

        $('#tm-drg-history-close', manager)
            .addEventListener(
                'click',
                closeDrgHistoryManager
            );

        $('#tm-drg-capture-current-page', manager)
            .addEventListener(
                'click',
                captureCurrentPageDrgInfoFromManager
            );

        $('#tm-drg-manager-close-btn', manager)
            .addEventListener(
                'click',
                closeDrgHistoryManager
            );

        $('#tm-drg-clear-unused', manager)
            .addEventListener(
                'click',
                clearUnusedDrgHistory
            );

        $('#tm-drg-clear-all-history', manager)
            .addEventListener(
                'click',
                clearAllDrgHistory
            );

        manager.addEventListener(
            'click',
            event => {
                if (event.target === manager) {
                    closeDrgHistoryManager();
                }
            }
        );

        renderDrgHistoryManager();
        updateDrgSnapshotManagerStatus();
    }

    function prepareDrgEditors() {
        const table = getTable();

        if (!table) {
            return;
        }

        const drgIndex = colIndex(
            table,
            [
                'DRG预分组',
                'DRG分组'
            ]
        );

        if (drgIndex < 0) {
            return;
        }

        getMainRows(table).forEach(row => {
            const cell = row.cells?.[drgIndex];

            if (!cell) {
                return;
            }

            if (
                cell.dataset.tmDrgPrepared === '1'
            ) {
                return;
            }

            const original =
                cellText(row, drgIndex);

            cell.dataset.tmDrgPrepared = '1';
            cell.dataset.tmServerDrg = original;

            if (original) {
                return;
            }

            const saved =
                readAssignment(table, row);

            const content =
                $('.cell', cell) ||
                cell;

            content.innerHTML = '';

            const editor =
                document.createElement('div');

            editor.className = 'tm-drg-editor';

            const input =
                document.createElement('input');

            input.type = 'text';
            input.className =
                'tm-drg-local-input';
            input.placeholder =
                '手动补录DRG';
            input.value = saved;
            input.title =
                '输入后按回车，或点击其他位置自动保存';

            const select =
                document.createElement('select');

            select.className =
                'tm-drg-history-select';
            select.title =
                '从历史DRG中选择';

            buildHistorySelect(select);

            const clearButton =
                document.createElement('button');

            clearButton.type = 'button';
            clearButton.className =
                'tm-drg-clear-button';
            clearButton.textContent = '×';
            clearButton.title =
                '清除此患者的本地DRG补录';

            function commit() {
                const value = clean(input.value);

                input.value = value;

                saveAssignment(
                    table,
                    row,
                    value
                );

                cell.classList.toggle(
                    'tm-drg-local-filled',
                    Boolean(value)
                );

                refreshAllHistorySelects();
                updateDropdowns();
                loadSelectedDrgSettings();
                applyFilters();
            }

            input.addEventListener(
                'keydown',
                event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        input.blur();
                    }
                }
            );

            input.addEventListener(
                'change',
                commit
            );

            input.addEventListener(
                'blur',
                commit
            );

            input.addEventListener(
                'click',
                event => event.stopPropagation()
            );

            select.addEventListener(
                'change',
                event => {
                    event.stopPropagation();

                    if (!select.value) {
                        return;
                    }

                    input.value = select.value;
                    select.value = '';

                    commit();
                }
            );

            select.addEventListener(
                'click',
                event => event.stopPropagation()
            );

            clearButton.addEventListener(
                'click',
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    input.value = '';
                    commit();
                }
            );

            editor.append(
                input,
                select,
                clearButton
            );

            content.appendChild(editor);

            cell.classList.toggle(
                'tm-drg-local-filled',
                Boolean(saved)
            );

        });

        refreshAllHistorySelects();
    }

    function captureOriginalFee(cell) {
        if (!cell) {
            return NaN;
        }

        const existing = Number(
            cell.dataset.tmOriginalFee
        );

        if (Number.isFinite(existing)) {
            return existing;
        }

        const text = clean(
            (
                $('.cell', cell) ||
                cell
            ).innerText
        );

        const value = money(text);

        if (Number.isFinite(value)) {
            cell.dataset.tmOriginalFee =
                String(value);

            cell.dataset.tmOriginalFeeText =
                text;

            return value;
        }

        return NaN;
    }

    function feeValue(row, feeIndex) {
        if (
            feeIndex >= 0 &&
            row.cells?.[feeIndex]
        ) {
            const value = captureOriginalFee(
                row.cells[feeIndex]
            );

            return Number.isFinite(value)
                ? value
                : 0;
        }

        return 0;
    }

    function renderAllocationDisplays(table) {
        if (!table) {
            return;
        }

        const feeIndex = colIndex(
            table,
            ['在院费用']
        );

        const allocationIndex = colIndex(
            table,
            ['拨付费用']
        );

        const drgIndex = colIndex(
            table,
            [
                'DRG预分组',
                'DRG分组'
            ]
        );

        if (
            feeIndex < 0 ||
            allocationIndex < 0
        ) {
            return;
        }

        const adjustment =
            getCurrentAdjustment();

        getMainRows(table).forEach(row => {
            const feeCell =
                row.cells?.[feeIndex];

            const allocationCell =
                row.cells?.[allocationIndex];

            if (!feeCell || !allocationCell) {
                return;
            }

            const currentFee =
                captureOriginalFee(feeCell);

            const drg =
                getDrgValue(row, drgIndex);

            const baseWarning =
                readDrgFeeWarning(drg);

            const dailyCost =
                readDrgDailyCost(drg);

            const remainingDays =
                calculateRemainingDays(
                    baseWarning,
                    currentFee,
                    dailyCost
                );

            const remainingAmount =
                Number.isFinite(baseWarning) &&
                Number.isFinite(currentFee)
                    ? Math.max(
                        0,
                        baseWarning - currentFee
                    )
                    : NaN;

            const adjustedThreshold =
                applyAdjustment(
                    baseWarning,
                    adjustment
                );

            const content =
                $('.cell', allocationCell) ||
                allocationCell;

            let display = $(
                '.tm-allocation-warning-display',
                allocationCell
            );

            if (!display) {
                content.innerHTML = '';

                display =
                    document.createElement('div');

                display.className =
                    'tm-allocation-warning-display';

                content.appendChild(display);
            }

            allocationCell.classList.add(
                'tm-allocation-display-cell'
            );

            display.innerHTML = '';

            const warningText =
                document.createElement('span');

            warningText.className =
                'tm-allocation-warning-amount';

            const daysText =
                document.createElement('span');

            daysText.className =
                'tm-allocation-remaining-days';

            if (Number.isFinite(baseWarning)) {
                warningText.textContent =
                    formatMoney(baseWarning);

                daysText.textContent =
                    Number.isFinite(remainingDays)
                        ? ` / 预计${remainingDays}天`
                        : ' / 预计—天';

                if (remainingDays === 0) {
                    daysText.classList.add(
                        'tm-allocation-reached'
                    );
                }

                display.classList.remove(
                    'tm-allocation-empty'
                );

                allocationCell.title = [
                    `DRG组：${drgGroupKey(drg) || '未识别DRG'}`,
                    `当前在院费用：${formatMoney(currentFee)}元`,
                    `基础预警费用：${formatMoney(baseWarning)}元`,
                    `距基础预警费用：${formatMoney(remainingAmount)}元`,
                    `每日花费：${formatMoney(dailyCost)}元/天`,
                    `预计剩余住院天数：${remainingDays}天`,
                    '计算公式：向上取整［(基础预警费用－当前费用)÷每日花费］',
                    `报红区间：${adjustment.normalized}`,
                    `实际报红线：${formatMoney(adjustedThreshold)}元`
                ].join('\n');
            } else {
                warningText.textContent = '—';
                daysText.textContent =
                    ' / 预计—天';

                display.classList.add(
                    'tm-allocation-empty'
                );

                allocationCell.title =
                    drg
                        ? (
                            `DRG组 ${drgGroupKey(drg)} ` +
                            `尚未设置预警费用；每日花费默认为` +
                            `${DEFAULT_DAILY_COST}元/天`
                        )
                        : (
                            '该患者尚无DRG分组，无法匹配' +
                            '预警费用和预计剩余天数'
                        );
            }

            display.append(
                warningText,
                daysText
            );
        });
    }

    function injectStyle() {
        if ($('#tm-assistant-style')) {
            return;
        }

        const style =
            document.createElement('style');

        style.id = 'tm-assistant-style';

        style.textContent = `
            .el-table__body tr.tm-fee-warning-row > td {
                background: #fff1f0 !important;
            }

            .el-table__body tr.tm-fee-warning-row:hover > td {
                background: #ffe4e1 !important;
            }

            .el-table__body tr.tm-fee-warning-row > td:first-child {
                box-shadow: inset 4px 0 0 #f56c6c;
            }

            .el-table__body td.tm-fee-warning-cell {
                background: #ffd8d5 !important;
            }

            .el-table__body td.tm-fee-warning-cell .cell {
                color: #d93025 !important;
                font-weight: 700 !important;
            }

            .tm-allocation-warning-display {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-wrap: nowrap;
                white-space: nowrap;
                cursor: help;
                font-weight: 700;
                font-size: 12px;
            }

            .tm-allocation-warning-amount {
                color: #409eff;
            }

            .tm-allocation-remaining-days {
                color: #67c23a;
            }

            .tm-allocation-reached {
                color: #f56c6c !important;
            }

            .tm-allocation-empty,
            .tm-allocation-empty .tm-allocation-warning-amount,
            .tm-allocation-empty .tm-allocation-remaining-days {
                color: #c0c4cc !important;
                font-weight: 400;
            }

            tr.tm-fee-warning-row .tm-allocation-warning-display,
            tr.tm-fee-warning-row .tm-allocation-warning-amount,
            tr.tm-fee-warning-row .tm-allocation-remaining-days {
                color: #b42318 !important;
            }

            .tm-drg-editor {
                display: flex;
                align-items: center;
                gap: 3px;
                width: 100%;
                min-width: 130px;
            }

            .tm-drg-local-input {
                width: 100%;
                min-width: 72px;
                height: 25px;
                box-sizing: border-box;
                padding: 2px 5px;
                border: 1px solid #dcdfe6;
                border-radius: 3px;
                outline: none;
                font-size: 11px;
                background: #fff;
            }

            .tm-drg-local-input:focus {
                border-color: #409eff;
                box-shadow: 0 0 0 1px rgba(64,158,255,.18);
            }

            .tm-drg-history-select {
                width: 30px;
                height: 25px;
                padding: 0;
                border: 1px solid #409eff;
                border-radius: 3px;
                color: #409eff;
                background: #ecf5ff;
                cursor: pointer;
                font-size: 11px;
            }

            .tm-drg-clear-button {
                width: 24px;
                height: 25px;
                padding: 0;
                border: 0;
                border-radius: 3px;
                color: #fff;
                background: #f56c6c;
                cursor: pointer;
                font-size: 15px;
                line-height: 25px;
            }

            td.tm-drg-local-filled {
                background: #f0f9eb !important;
            }

            td.tm-drg-local-filled .tm-drg-local-input {
                color: #3a7a19;
                font-weight: 700;
                border-color: #67c23a;
                background: #f0f9eb;
            }

            .tm-mini-btn {
                padding: 5px 8px;
                color: #fff;
                border: 0;
                border-radius: 4px;
                cursor: pointer;
                white-space: nowrap;
            }

            .tm-mini-btn:disabled {
                cursor: not-allowed;
                opacity: .5;
            }
        `;

        document.head.appendChild(style);
    }

    function getOpacity() {
        const value = parseInt(
            safeGet(OPACITY_KEY, '95'),
            10
        );

        return (
            Number.isFinite(value) &&
            value >= 30 &&
            value <= 100
        )
            ? value
            : 95;
    }

    function setOpacity(value, save = true) {
        value = Math.max(
            30,
            Math.min(
                100,
                parseInt(value, 10) || 95
            )
        );

        const panel =
            $('#tm-filter-container');

        const range =
            $('#tm-opacity-range');

        const label =
            $('#tm-opacity-value');

        if (panel) {
            panel.style.opacity =
                String(value / 100);
        }

        if (range) {
            range.value = String(value);
        }

        if (label) {
            label.textContent = `${value}%`;
        }

        if (save) {
            safeSet(OPACITY_KEY, value);
        }
    }

    function createPanel() {
        if ($('#tm-filter-container')) {
            return;
        }

        injectStyle();

        const opacity = getOpacity();

        const panel =
            document.createElement('div');

        panel.id = 'tm-filter-container';

        panel.style.cssText = `
            position: fixed;
            top: 15px;
            right: 165px;
            z-index: 999999;
            width: 380px;
            box-sizing: border-box;
            background: #fff;
            padding: 10px;
            border: 1px solid #dcdfe6;
            box-shadow: 0 4px 12px rgba(0,0,0,.18);
            border-radius: 6px;
            font-family: Arial,"Microsoft YaHei",sans-serif;
            user-select: none;
            opacity: ${opacity / 100};
        `;

        panel.innerHTML = `
            <div
                id="tm-toggle-header"
                style="
                    cursor:move;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    border-bottom:1px solid #f0f0f0;
                    padding-bottom:5px;
                    margin-bottom:8px;
                "
            >
                <b style="font-size:13px;color:#409eff;">
                    ☰ 医师、DRG与费用助手
                </b>

                <span
                    id="tm-toggle-icon"
                    style="
                        font-size:12px;
                        color:#909399;
                        cursor:pointer;
                    "
                >
                    [收起]
                </span>
            </div>

            <div
                id="tm-filter-content"
                style="
                    display:flex;
                    flex-direction:column;
                    gap:8px;
                "
            >
                <div
                    style="
                        display:grid;
                        grid-template-columns:68px 1fr;
                        align-items:center;
                        gap:6px;
                    "
                >
                    <span style="font-size:12px;color:#606266;">
                        责任医师：
                    </span>

                    <select
                        id="tm-doctor-select"
                        style="
                            width:100%;
                            padding:4px 6px;
                            border:1px solid #dcdfe6;
                            border-radius:4px;
                            font-size:12px;
                            background:#fff;
                        "
                    >
                        <option value="">
                            -- 全部显示 --
                        </option>

                        <option value="${EMPTY}">
                            -- 未填写 --
                        </option>
                    </select>
                </div>

                <div
                    style="
                        display:grid;
                        grid-template-columns:68px 1fr auto;
                        align-items:center;
                        gap:6px;
                    "
                >
                    <span style="font-size:12px;color:#606266;">
                        DRG分组：
                    </span>

                    <select
                        id="tm-drg-select"
                        style="
                            width:100%;
                            padding:4px 6px;
                            border:1px solid #dcdfe6;
                            border-radius:4px;
                            font-size:12px;
                            background:#fff;
                        "
                    >
                        <option value="">
                            -- 全部显示 --
                        </option>

                        <option value="${EMPTY}">
                            -- 未填写 --
                        </option>
                    </select>

                    <button
                        id="tm-drg-manage-btn"
                        class="tm-mini-btn"
                        title="管理脚本保存的DRG历史候选项"
                        style="
                            background:#e6a23c;
                            padding:5px 8px;
                        "
                    >
                        管理
                    </button>
                </div>

                <div
                    style="
                        display:grid;
                        grid-template-columns:68px 1fr;
                        align-items:center;
                        gap:6px;
                    "
                >
                    <span style="font-size:12px;color:#606266;">
                        报红筛选：
                    </span>

                    <select
                        id="tm-warning-filter-select"
                        style="
                            width:100%;
                            padding:4px 6px;
                            border:1px solid #dcdfe6;
                            border-radius:4px;
                            font-size:12px;
                            background:#fff;
                        "
                    >
                        <option value="all">
                            -- 全部状态 --
                        </option>

                        <option value="warning">
                            -- 仅显示报红 --
                        </option>

                        <option value="normal">
                            -- 仅显示未报红 --
                        </option>

                        <option value="unconfigured">
                            -- 仅显示未设置预警费 --
                        </option>
                    </select>
                </div>

                <div style="display:flex;gap:6px;">
                    <button
                        id="tm-filter-btn"
                        class="tm-mini-btn"
                        style="
                            flex:1;
                            background:#409eff;
                        "
                    >
                        应用筛选
                    </button>

                    <button
                        id="tm-reset-btn"
                        class="tm-mini-btn"
                        style="background:#909399;"
                    >
                        重置筛选
                    </button>
                </div>

                <div
                    style="
                        border-top:1px dashed #f0f0f0;
                        padding-top:7px;
                    "
                >
                    <div
                    style="
                        display:grid;
                        grid-template-columns:68px minmax(0,1fr) auto auto auto;
                        align-items:center;
                        gap:6px;
                    "
                >
                    <span style="font-size:12px;color:#606266;">
                        每页显示：
                    </span>

                    <input
                        id="tm-page-size-input"
                        type="number"
                        min="1"
                        max="${MAX_PATIENT_PAGE_SIZE}"
                        step="1"
                        value="${getPatientPageSize()}"
                        title="适用于在院患者和责任医师查询；两个页面统一记忆同一个每页数量"
                        style="
                            width:100%;
                            min-width:0;
                            box-sizing:border-box;
                            padding:4px 6px;
                            border:1px solid #dcdfe6;
                            border-radius:4px;
                            font-size:12px;
                        "
                    >

                    <button
                        id="tm-page-size-apply-btn"
                        class="tm-mini-btn"
                        style="background:#409eff;"
                    >
                        应用
                    </button>

                    <button
                        id="tm-manual-filter-btn"
                        class="tm-mini-btn"
                        title="打开手动关键词筛选"
                        style="background:#e6a23c;"
                    >
                        手筛
                    </button>

                    <button
                        id="tm-export-all-btn"
                        class="tm-mini-btn"
                        title="按当前页面查询条件后台分批抓取全部记录并导出CSV；不会把全部记录渲染到表格"
                        style="background:#13c2c2;"
                    >
                        导出
                    </button>
                </div>

                <div
                    id="tm-page-size-tip"
                    style="
                        margin-left:74px;
                        margin-top:4px;
                        color:#909399;
                        font-size:10px;
                        line-height:1.5;
                    "
                >
                    两页共用；量大易卡，全部请用“导出”。
                </div>

                    <div
                        style="
                            display:grid;
                            grid-template-columns:68px 1fr auto auto;
                            align-items:center;
                            gap:6px;
                            margin-top:7px;
                        "
                    >
                        <span style="font-size:12px;color:#606266;">
                            DRG预警费：
                        </span>

                        <input
                            id="tm-fee-warning-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="先选择具体DRG"
                            style="
                                width:100%;
                                box-sizing:border-box;
                                padding:4px 6px;
                                border:1px solid #dcdfe6;
                                border-radius:4px;
                                font-size:12px;
                            "
                        >

                        <button
                            id="tm-save-warning-btn"
                            class="tm-mini-btn"
                            style="background:#67c23a;"
                        >
                            保存
                        </button>

                        <button
                            id="tm-clear-warning-btn"
                            class="tm-mini-btn"
                            style="background:#f56c6c;"
                        >
                            清除
                        </button>
                    </div>

                    <div
                        id="tm-warning-memory-tip"
                        style="
                            margin-left:74px;
                            margin-top:4px;
                            color:#909399;
                            font-size:10px;
                        "
                    >
                        选择具体DRG后，可独立保存该分组的基础预警费用
                    </div>

                    <div
                        style="
                            display:grid;
                            grid-template-columns:68px 1fr auto auto;
                            align-items:center;
                            gap:6px;
                            margin-top:7px;
                        "
                    >
                        <span style="font-size:12px;color:#606266;">
                            每日花费：
                        </span>

                        <input
                            id="tm-daily-cost-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="默认300元/天"
                            style="
                                width:100%;
                                box-sizing:border-box;
                                padding:4px 6px;
                                border:1px solid #dcdfe6;
                                border-radius:4px;
                                font-size:12px;
                            "
                        >

                        <button
                            id="tm-save-daily-cost-btn"
                            class="tm-mini-btn"
                            style="background:#67c23a;"
                        >
                            保存
                        </button>

                        <button
                            id="tm-reset-daily-cost-btn"
                            class="tm-mini-btn"
                            style="background:#909399;"
                        >
                            默认
                        </button>
                    </div>

                    <div
                        id="tm-daily-cost-tip"
                        style="
                            margin-left:74px;
                            margin-top:4px;
                            color:#909399;
                            font-size:10px;
                        "
                    >
                        每个DRG可独立设置；未设置时默认300元/天
                    </div>
                </div>

                <div
                    style="
                        border-top:1px dashed #f0f0f0;
                        padding-top:7px;
                    "
                >
                    <div
                        style="
                            display:grid;
                            grid-template-columns:68px 1fr auto;
                            align-items:center;
                            gap:6px;
                        "
                    >
                        <span style="font-size:12px;color:#606266;">
                            报红区间：
                        </span>

                        <input
                            id="tm-fee-adjustment-input"
                            type="text"
                            placeholder="0%、-5%、+200"
                            style="
                                width:100%;
                                box-sizing:border-box;
                                padding:4px 6px;
                                border:1px solid #dcdfe6;
                                border-radius:4px;
                                font-size:12px;
                            "
                        >

                        <button
                            id="tm-apply-adjustment-btn"
                            class="tm-mini-btn"
                            style="background:#e6a23c;"
                        >
                            应用
                        </button>
                    </div>

                    <div
                        style="
                            margin-left:74px;
                            margin-top:4px;
                            color:#909399;
                            font-size:10px;
                            line-height:1.5;
                        "
                    >
                        百分比：-5%、+10%；金额：-100、+200；默认0%
                    </div>
                </div>

                <div
                    style="
                        display:flex;
                        align-items:center;
                        gap:6px;
                        border-top:1px dashed #f0f0f0;
                        padding-top:7px;
                    "
                >
                    <span
                        style="
                            width:68px;
                            font-size:12px;
                            color:#606266;
                        "
                    >
                        在院费用：
                    </span>

                    <button
                        id="tm-sort-btn"
                        class="tm-mini-btn"
                        style="
                            flex:1;
                            background:#67c23a;
                        "
                    >
                        点击排序（默认）
                    </button>
                </div>

                <div
                    style="
                        display:flex;
                        align-items:center;
                        gap:6px;
                    "
                >
                    <span
                        style="
                            width:68px;
                            font-size:12px;
                            color:#606266;
                        "
                    >
                        剩余天数：
                    </span>

                    <button
                        id="tm-days-sort-btn"
                        class="tm-mini-btn"
                        style="
                            flex:1;
                            background:#409eff;
                        "
                    >
                        点击排序（默认）
                    </button>
                </div>

                <div
                    style="
                        display:grid;
                        grid-template-columns:68px 1fr 40px;
                        align-items:center;
                        gap:6px;
                        border-top:1px dashed #f0f0f0;
                        padding-top:7px;
                    "
                >
                    <span style="font-size:12px;color:#606266;">
                        透明度：
                    </span>

                    <input
                        id="tm-opacity-range"
                        type="range"
                        min="30"
                        max="100"
                        step="5"
                        value="${opacity}"
                        style="
                            width:100%;
                            margin:0;
                            cursor:pointer;
                        "
                    >

                    <span
                        id="tm-opacity-value"
                        style="
                            font-size:11px;
                            color:#606266;
                            text-align:right;
                        "
                    >
                        ${opacity}%
                    </span>
                </div>

                <div
                    style="
                        padding:5px 6px;
                        background:#ecf5ff;
                        border-radius:4px;
                        color:#409eff;
                        font-size:10px;
                        line-height:1.5;
                    "
                >
                    “拨付费用”列显示“DRG预警费用 / 预计剩余天数”；
                    预计天数按该DRG每日花费计算，未设置时默认300元/天。
                    剩余天数排序与在院费用排序互斥。
                </div>

                <div
                    id="tm-filter-status"
                    style="
                        display:none;
                        padding:5px 6px;
                        background:#f5f7fa;
                        border-radius:4px;
                        font-size:11px;
                        line-height:1.5;
                    "
                ></div>
            </div>
        `;

        document.body.appendChild(panel);

        $('#tm-fee-adjustment-input').value =
            safeGet(
                adjustmentStorageKey(),
                '0%'
            );

        $('#tm-page-size-apply-btn').addEventListener(
            'click',
            applyPatientPageSize
        );

        $('#tm-page-size-input').addEventListener(
            'keydown',
            event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyPatientPageSize();
                }
            }
        );

        $('#tm-export-all-btn').addEventListener(
            'click',
            exportAllPatientData
        );

        $('#tm-manual-filter-btn').addEventListener(
            'click',
            openManualFilterDialog
        );

        updateManualFilterButton();

        $('#tm-drg-manage-btn').addEventListener(
            'click',
            openDrgHistoryManager
        );

        $('#tm-toggle-icon').addEventListener(
            'click',
            event => {
                event.stopPropagation();

                collapsed = !collapsed;

                $('#tm-filter-content').style.display =
                    collapsed
                        ? 'none'
                        : 'flex';

                event.currentTarget.textContent =
                    collapsed
                        ? '[展开]'
                        : '[收起]';
            }
        );

        $('#tm-filter-btn').addEventListener(
            'click',
            applyFilters
        );

        $('#tm-reset-btn').addEventListener(
            'click',
            resetFilters
        );

        $('#tm-sort-btn').addEventListener(
            'click',
            toggleFeeSort
        );

        $('#tm-days-sort-btn').addEventListener(
            'click',
            toggleRemainingDaysSort
        );

        $('#tm-save-warning-btn').addEventListener(
            'click',
            saveSelectedDrgWarning
        );

        $('#tm-clear-warning-btn').addEventListener(
            'click',
            clearSelectedDrgWarning
        );

        $('#tm-save-daily-cost-btn').addEventListener(
            'click',
            saveSelectedDrgDailyCost
        );

        $('#tm-reset-daily-cost-btn').addEventListener(
            'click',
            resetSelectedDrgDailyCost
        );

        $('#tm-apply-adjustment-btn').addEventListener(
            'click',
            saveAndApplyAdjustment
        );

        $('#tm-doctor-select').addEventListener(
            'change',
            onFilterChanged
        );

        $('#tm-drg-select').addEventListener(
            'change',
            onFilterChanged
        );

        $('#tm-warning-filter-select').addEventListener(
            'change',
            applyFilters
        );

        $('#tm-doctor-select').addEventListener(
            'focus',
            updateDropdowns
        );

        $('#tm-drg-select').addEventListener(
            'focus',
            updateDropdowns
        );

        $('#tm-fee-warning-input').addEventListener(
            'keydown',
            event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    saveSelectedDrgWarning();
                }
            }
        );

        $('#tm-daily-cost-input').addEventListener(
            'keydown',
            event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    saveSelectedDrgDailyCost();
                }
            }
        );

        $('#tm-fee-adjustment-input').addEventListener(
            'keydown',
            event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    saveAndApplyAdjustment();
                }
            }
        );

        $('#tm-opacity-range').addEventListener(
            'input',
            event => {
                setOpacity(event.target.value);
            }
        );

        enableDrag(
            panel,
            $('#tm-toggle-header')
        );

        updateDropdowns();
        loadSelectedDrgSettings();

        setOpacity(opacity, false);
    }

    function enableDrag(element, handle) {
        let mouseX = 0;
        let mouseY = 0;
        let elementX = 0;
        let elementY = 0;

        handle.addEventListener(
            'mousedown',
            event => {
                if (
                    event.target.id ===
                    'tm-toggle-icon'
                ) {
                    return;
                }

                event.preventDefault();

                const rect =
                    element.getBoundingClientRect();

                mouseX = event.clientX;
                mouseY = event.clientY;
                elementX = rect.left;
                elementY = rect.top;

                document.addEventListener(
                    'mousemove',
                    move
                );

                document.addEventListener(
                    'mouseup',
                    stop
                );
            }
        );

        function move(event) {
            let left =
                elementX +
                event.clientX -
                mouseX;

            let top =
                elementY +
                event.clientY -
                mouseY;

            left = Math.max(
                0,
                Math.min(
                    left,
                    innerWidth -
                    element.offsetWidth
                )
            );

            top = Math.max(
                0,
                Math.min(
                    top,
                    innerHeight - 35
                )
            );

            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
            element.style.right = 'auto';
        }

        function stop() {
            document.removeEventListener(
                'mousemove',
                move
            );

            document.removeEventListener(
                'mouseup',
                stop
            );
        }
    }

    function fillSelect(select, values) {
        if (!select) {
            return;
        }

        const current = select.value;
        const signature = JSON.stringify(values);

        if (
            select.dataset.tmSignature ===
            signature
        ) {
            return;
        }

        select.dataset.tmSignature = signature;

        select.innerHTML = `
            <option value="">
                -- 全部显示 --
            </option>

            <option value="${EMPTY}">
                -- 未填写 --
            </option>
        `;

        values.forEach(value => {
            const option =
                document.createElement('option');

            option.value = value;
            option.textContent = value;
            option.title = value;

            select.appendChild(option);
        });

        select.value =
            current === '' ||
            current === EMPTY ||
            values.includes(current)
                ? current
                : '';
    }

    function updateDropdowns() {
        const table = getTable();

        if (!table) {
            return;
        }

        prepareDrgEditors();

        const doctorIndex = colIndex(
            table,
            ['责任医师']
        );

        const drgIndex = colIndex(
            table,
            [
                'DRG预分组',
                'DRG分组'
            ]
        );

        const doctors = new Set();
        const drgs = new Set(readHistory());

        getMainRows(table).forEach(row => {
            const doctor =
                doctorIndex < 0
                    ? ''
                    : cellText(
                        row,
                        doctorIndex
                    );

            const drg =
                getDrgValue(row, drgIndex);

            if (doctor) {
                doctors.add(doctor);
            }

            if (drg) {
                drgs.add(drg);
            }
        });

        const sortZh = (a, b) =>
            a.localeCompare(
                b,
                'zh-CN',
                {
                    numeric: true
                }
            );

        fillSelect(
            $('#tm-doctor-select'),
            Array.from(doctors).sort(sortZh)
        );

        fillSelect(
            $('#tm-drg-select'),
            Array.from(drgs).sort(sortZh)
        );
    }

    function selectedDrgValue() {
        const value =
            $('#tm-drg-select')?.value || '';

        return (
            value &&
            value !== EMPTY
        )
            ? value
            : '';
    }

    function loadSelectedDrgSettings() {
        const feeInput =
            $('#tm-fee-warning-input');

        if (!feeInput) {
            return;
        }

        const drg = selectedDrgValue();
        const enabled = Boolean(drg);

        const dailyInput =
            $('#tm-daily-cost-input');

        const feeTip =
            $('#tm-warning-memory-tip');

        const dailyTip =
            $('#tm-daily-cost-tip');

        [
            feeInput,
            $('#tm-save-warning-btn'),
            $('#tm-clear-warning-btn'),
            dailyInput,
            $('#tm-save-daily-cost-btn'),
            $('#tm-reset-daily-cost-btn')
        ].forEach(control => {
            if (control) {
                control.disabled = !enabled;
            }
        });

        if (!enabled) {
            feeInput.value = '';
            feeInput.placeholder =
                '先选择具体DRG';

            if (dailyInput) {
                dailyInput.value = '';
                dailyInput.placeholder =
                    `默认${DEFAULT_DAILY_COST}元/天`;
            }

            if (feeTip) {
                feeTip.textContent =
                    '请先在上方选择一个具体DRG分组';
            }

            if (dailyTip) {
                dailyTip.textContent =
                    `请先选择DRG；未设置时默认${DEFAULT_DAILY_COST}元/天`;
            }

            return;
        }

        const warning =
            readDrgFeeWarning(drg);

        const dailyCost =
            readDrgDailyCost(drg);

        feeInput.value =
            Number.isFinite(warning)
                ? String(warning)
                : '';

        feeInput.placeholder =
            '输入基础预警费用';

        if (dailyInput) {
            dailyInput.value =
                String(dailyCost);

            dailyInput.placeholder =
                `默认${DEFAULT_DAILY_COST}元/天`;
        }

        if (feeTip) {
            feeTip.textContent =
                `当前保存对象：${drgGroupKey(drg)}（按DRG组独立记忆）`;
        }

        if (dailyTip) {
            dailyTip.textContent =
                `当前 ${drgGroupKey(drg)} 每日花费：${formatMoney(dailyCost)}元/天`;
        }
    }

    function saveSelectedDrgWarning() {
        const drg = selectedDrgValue();

        const input =
            $('#tm-fee-warning-input');

        if (!drg) {
            setStatus(
                '请先选择一个具体DRG分组，再保存预警费用。',
                true
            );

            return;
        }

        const raw = clean(
            input?.value || ''
        );

        if (!raw) {
            setStatus(
                '预警费用为空。如需删除，请点击“清除”。',
                true
            );

            return;
        }

        const value = money(raw);

        if (
            !Number.isFinite(value) ||
            value < 0
        ) {
            setStatus(
                '预警费用格式不正确，应填写大于或等于0的金额。',
                true
            );

            return;
        }

        if (
            !saveDrgFeeWarning(drg, value)
        ) {
            setStatus(
                '预警费用保存失败，请检查浏览器本地存储权限。',
                true
            );

            return;
        }

        input.value = String(value);

        applyFilters();

        setStatus(
            `已保存 ${drgGroupKey(drg)} 的基础预警费用：${formatMoney(value)}元。`
        );
    }

    function clearSelectedDrgWarning() {
        const drg = selectedDrgValue();

        if (!drg) {
            setStatus(
                '请先选择一个具体DRG分组。',
                true
            );

            return;
        }

        saveDrgFeeWarning(drg, '');

        const input =
            $('#tm-fee-warning-input');

        if (input) {
            input.value = '';
        }

        applyFilters();

        setStatus(
            `已清除 ${drgGroupKey(drg)} 的基础预警费用。`
        );
    }

    function saveSelectedDrgDailyCost() {
        const drg = selectedDrgValue();

        const input =
            $('#tm-daily-cost-input');

        if (!drg) {
            setStatus(
                '请先选择一个具体DRG分组，再保存每日花费。',
                true
            );

            return;
        }

        const value = money(
            clean(input?.value || '')
        );

        if (
            !Number.isFinite(value) ||
            value <= 0
        ) {
            input?.focus();

            setStatus(
                '每日花费格式不正确，应填写大于0的金额，例如300。',
                true
            );

            return;
        }

        if (
            !saveDrgDailyCost(drg, value)
        ) {
            setStatus(
                '每日花费保存失败，请检查浏览器本地存储权限。',
                true
            );

            return;
        }

        if (input) {
            input.value = String(value);
        }

        loadSelectedDrgSettings();
        applyFilters();

        setStatus(
            `已保存 ${drgGroupKey(drg)} 的每日花费：${formatMoney(value)}元/天。`
        );
    }

    function resetSelectedDrgDailyCost() {
        const drg = selectedDrgValue();

        if (!drg) {
            setStatus(
                '请先选择一个具体DRG分组。',
                true
            );

            return;
        }

        saveDrgDailyCost(drg, '');

        loadSelectedDrgSettings();
        applyFilters();

        setStatus(
            `已将 ${drgGroupKey(drg)} 的每日花费恢复为默认${DEFAULT_DAILY_COST}元/天。`
        );
    }

    function saveAndApplyAdjustment() {
        const input =
            $('#tm-fee-adjustment-input');

        const parsed = parseAdjustment(
            input?.value || ''
        );

        if (!parsed.valid) {
            input?.focus();

            setStatus(
                '报红区间格式错误。可输入-5%、+10%、-100、+200、0%或0。',
                true
            );

            return;
        }

        if (input) {
            input.value = parsed.normalized;
        }

        safeSet(
            adjustmentStorageKey(),
            parsed.normalized
        );

        applyFilters();

        setStatus(
            `报红区间已应用：${parsed.normalized}。`
        );
    }

    function onFilterChanged() {
        loadSelectedDrgSettings();
        applyFilters();
    }

    function matches(value, selected) {
        if (selected === '') {
            return true;
        }

        if (selected === EMPTY) {
            return value === '';
        }

        return value === selected;
    }

    function getWarningState(
        row,
        feeIndex,
        drgIndex,
        adjustment
    ) {
        const drg =
            getDrgValue(row, drgIndex);

        const baseWarning =
            readDrgFeeWarning(drg);

        if (!Number.isFinite(baseWarning)) {
            return {
                type: 'unconfigured',
                drg,
                baseWarning: NaN,
                threshold: NaN,
                fee: feeValue(row, feeIndex)
            };
        }

        const threshold =
            applyAdjustment(
                baseWarning,
                adjustment
            );

        const fee =
            feeValue(row, feeIndex);

        return {
            type:
                fee > threshold
                    ? 'warning'
                    : 'normal',
            drg,
            baseWarning,
            threshold,
            fee
        };
    }

    function matchesWarningFilter(
        state,
        selected
    ) {
        if (
            !selected ||
            selected === 'all'
        ) {
            return true;
        }

        return state?.type === selected;
    }

    function warningFilterLabel(value) {
        const labels = {
            all: '全部状态',
            warning: '仅显示报红',
            normal: '仅显示未报红',
            unconfigured: '仅显示未设置预警费'
        };

        return labels[value] || labels.all;
    }

    function clearWarningStyles(groups) {
        groups.forEach(group => {
            group.rows.forEach(row => {
                row.classList.remove(
                    'tm-fee-warning-row'
                );

                Array.from(
                    row.cells || []
                ).forEach(cell =>
                    cell.classList.remove(
                        'tm-fee-warning-cell'
                    )
                );
            });
        });
    }

    function applyWarnings(
        groups,
        visible,
        feeIndex,
        drgIndex,
        rowStates = []
    ) {
        clearWarningStyles(groups);

        const adjustment =
            getCurrentAdjustment();

        let count = 0;
        let configuredCount = 0;

        groups[0].rows.forEach(
            (row, index) => {
                if (!visible[index]) {
                    return;
                }

                const state =
                    rowStates[index] ||
                    getWarningState(
                        row,
                        feeIndex,
                        drgIndex,
                        adjustment
                    );

                if (
                    state.type ===
                    'unconfigured'
                ) {
                    return;
                }

                configuredCount++;

                if (state.type !== 'warning') {
                    return;
                }

                count++;

                groups.forEach(group => {
                    group.rows[index]
                        ?.classList.add(
                            'tm-fee-warning-row'
                        );
                });

                row.cells?.[feeIndex]
                    ?.classList.add(
                        'tm-fee-warning-cell'
                    );
            }
        );

        return {
            adjustment,
            count,
            configuredCount
        };
    }

    function setStatus(
        message,
        isError = false
    ) {
        const box =
            $('#tm-filter-status');

        if (!box) {
            return;
        }

        box.style.display = 'block';

        box.style.color =
            isError
                ? '#d93025'
                : '#606266';

        box.textContent = message;
    }

    function applyFilters() {
        const table = getTable();

        if (!table) {
            return;
        }

        prepareDrgEditors();

        const groups =
            getRowGroups(table);

        if (!groups.length) {
            return;
        }

        const doctorIndex = colIndex(
            table,
            ['责任医师']
        );

        const drgIndex = colIndex(
            table,
            [
                'DRG预分组',
                'DRG分组'
            ]
        );

        const feeIndex = colIndex(
            table,
            ['在院费用']
        );

        const selectedDoctor =
            $('#tm-doctor-select')?.value || '';

        const selectedDrg =
            $('#tm-drg-select')?.value || '';

        const selectedWarningFilter =
            $('#tm-warning-filter-select')
                ?.value || 'all';

        const manualKeywords =
            getManualFilterKeywords();

        const adjustment =
            getCurrentAdjustment();

        const rowStates =
            groups[0].rows.map(row =>
                getWarningState(
                    row,
                    feeIndex,
                    drgIndex,
                    adjustment
                )
            );

        const baseVisible =
            groups[0].rows.map(row => {
                const doctor =
                    doctorIndex < 0
                        ? ''
                        : cellText(
                            row,
                            doctorIndex
                        );

                const drg =
                    getDrgValue(
                        row,
                        drgIndex
                    );

                return (
                    matches(
                        doctor,
                        selectedDoctor
                    ) &&
                    matches(
                        drg,
                        selectedDrg
                    )
                );
            });

        const keywordVisible =
            baseVisible.map(
                (matched, index) =>
                    matched &&
                    rowMatchesManualKeywords(
                        groups[0].rows[index],
                        manualKeywords
                    )
            );

        const visible =
            keywordVisible.map(
                (matched, index) =>
                    matched &&
                    matchesWarningFilter(
                        rowStates[index],
                        selectedWarningFilter
                    )
            );

        groups.forEach(group => {
            group.rows.forEach(
                (row, index) => {
                    row.style.display =
                        visible[index]
                            ? ''
                            : 'none';
                }
            );
        });

        renderAllocationDisplays(table);

        const warning =
            applyWarnings(
                groups,
                visible,
                feeIndex,
                drgIndex,
                rowStates
            );

        const shown =
            visible.filter(Boolean).length;

        const baseShown =
            baseVisible.filter(Boolean).length;

        const keywordShown =
            keywordVisible.filter(Boolean).length;

        const baseWarningCount =
            rowStates.filter(
                (state, index) =>
                    baseVisible[index] &&
                    state.type === 'warning'
            ).length;

        const baseNormalCount =
            rowStates.filter(
                (state, index) =>
                    baseVisible[index] &&
                    state.type === 'normal'
            ).length;

        const baseUnconfiguredCount =
            rowStates.filter(
                (state, index) =>
                    baseVisible[index] &&
                    state.type === 'unconfigured'
            ).length;

        const manualFilterText =
            manualKeywords.length
                ? `；手筛 ${manualKeywords.length} 词命中 ${keywordShown} 条`
                : '；手筛未启用';

        setStatus(
            `当前显示 ${shown} / ${groups[0].rows.length} 条` +
            `；报红筛选：${warningFilterLabel(selectedWarningFilter)}` +
            `；报红区间 ${warning.adjustment.normalized}` +
            `；医师/DRG匹配 ${baseShown} 条` +
            manualFilterText +
            `（报红 ${baseWarningCount}、未报红 ${baseNormalCount}` +
            `、未设置预警费 ${baseUnconfiguredCount}）`,
            warning.count > 0
        );
    }

    function resetFilters() {
        const doctor =
            $('#tm-doctor-select');

        const drg =
            $('#tm-drg-select');

        const warningFilter =
            $('#tm-warning-filter-select');

        if (doctor) {
            doctor.value = '';
        }

        if (drg) {
            drg.value = '';
        }

        if (warningFilter) {
            warningFilter.value = 'all';
        }

        loadSelectedDrgSettings();
        applyFilters();
    }

    function resetFeeSortButton() {
        const button =
            $('#tm-sort-btn');

        if (!button) {
            return;
        }

        button.textContent =
            '点击排序（默认）';

        button.style.background =
            '#67c23a';
    }

    function resetRemainingDaysSortButton() {
        const button =
            $('#tm-days-sort-btn');

        if (!button) {
            return;
        }

        button.textContent =
            '点击排序（默认）';

        button.style.background =
            '#409eff';
    }

    function toggleFeeSort() {
        const button =
            $('#tm-sort-btn');

        if (!button) {
            return;
        }

        remainingDaysSort = 'none';
        resetRemainingDaysSortButton();

        if (feeSort === 'none') {
            feeSort = 'asc';

            button.textContent =
                '正序 ↑（低 → 高）';

            button.style.background =
                '#e6a23c';
        } else if (feeSort === 'asc') {
            feeSort = 'desc';

            button.textContent =
                '逆序 ↓（高 → 低）';

            button.style.background =
                '#f56c6c';
        } else {
            feeSort = 'none';
            resetFeeSortButton();
        }

        sortRows();
    }

    function toggleRemainingDaysSort() {
        const button =
            $('#tm-days-sort-btn');

        if (!button) {
            return;
        }

        feeSort = 'none';
        resetFeeSortButton();

        if (remainingDaysSort === 'none') {
            remainingDaysSort = 'asc';

            button.textContent =
                '正序 ↑（少 → 多）';

            button.style.background =
                '#e6a23c';
        } else if (
            remainingDaysSort === 'asc'
        ) {
            remainingDaysSort = 'desc';

            button.textContent =
                '逆序 ↓（多 → 少）';

            button.style.background =
                '#f56c6c';
        } else {
            remainingDaysSort = 'none';
            resetRemainingDaysSortButton();
        }

        sortRows();
    }

    function compareOptionalNumber(
        a,
        b,
        direction
    ) {
        const aValid = Number.isFinite(a);
        const bValid = Number.isFinite(b);

        // 无法计算剩余天数的记录始终放在最后
        if (aValid && !bValid) {
            return -1;
        }

        if (!aValid && bValid) {
            return 1;
        }

        if (!aValid && !bValid) {
            return 0;
        }

        return direction === 'asc'
            ? a - b
            : b - a;
    }

    function sortRows() {
        const table = getTable();

        if (!table) {
            return;
        }

        const groups =
            getRowGroups(table);

        if (!groups.length) {
            return;
        }

        const rows = groups[0].rows;

        const feeIndex = colIndex(
            table,
            ['在院费用']
        );

        const drgIndex = colIndex(
            table,
            [
                'DRG预分组',
                'DRG分组'
            ]
        );

        rows.forEach((row, index) => {
            if (
                row.dataset.tmOriginalOrder ===
                undefined
            ) {
                row.dataset.tmOriginalOrder =
                    String(index);
            }
        });

        const records = rows.map(
            (row, index) => {
                const fee =
                    feeValue(row, feeIndex);

                const drg =
                    getDrgValue(row, drgIndex);

                const baseWarning =
                    readDrgFeeWarning(drg);

                const dailyCost =
                    readDrgDailyCost(drg);

                const remainingDays =
                    calculateRemainingDays(
                        baseWarning,
                        fee,
                        dailyCost
                    );

                return {
                    index,

                    original: parseInt(
                        row.dataset.tmOriginalOrder ||
                        index,
                        10
                    ),

                    fee,
                    remainingDays
                };
            }
        );

        records.sort((a, b) => {
            let result = 0;

            if (
                remainingDaysSort === 'asc'
            ) {
                result =
                    compareOptionalNumber(
                        a.remainingDays,
                        b.remainingDays,
                        'asc'
                    );
            } else if (
                remainingDaysSort === 'desc'
            ) {
                result =
                    compareOptionalNumber(
                        a.remainingDays,
                        b.remainingDays,
                        'desc'
                    );
            } else if (feeSort === 'asc') {
                result = a.fee - b.fee;
            } else if (feeSort === 'desc') {
                result = b.fee - a.fee;
            } else {
                return a.original - b.original;
            }

            return (
                result ||
                (a.original - b.original)
            );
        });

        groups.forEach(group => {
            const currentRows =
                group.rows.slice();

            records.forEach(record => {
                const row =
                    currentRows[record.index];

                if (row) {
                    group.tbody.appendChild(row);
                }
            });
        });

        applyFilters();
    }

    function scheduleRefresh() {
        clearTimeout(refreshTimer);

        refreshTimer = setTimeout(
            () => {
                createPanel();
                prepareDrgEditors();
                updateDropdowns();
                loadSelectedDrgSettings();
                applyFilters();
            },
            250
        );
    }

    function observePage() {
        const observer =
            new MutationObserver(
                mutations => {
                    const relevant =
                        mutations.some(
                            mutation => {
                                const target =
                                    mutation.target;

                                if (
                                    target?.closest?.(
                                        '#tm-filter-container'
                                    )
                                ) {
                                    return false;
                                }

                                if (
                                    target?.closest?.(
                                        '#tm-drg-history-manager'
                                    )
                                ) {
                                    return false;
                                }

                                if (
                                    target?.closest?.(
                                        '.tm-drg-editor'
                                    )
                                ) {
                                    return false;
                                }

                                if (
                                    target?.closest?.(
                                        '.tm-allocation-warning-display'
                                    )
                                ) {
                                    return false;
                                }

                                return (
                                    mutation.type ===
                                    'childList'
                                );
                            }
                        );

                    if (relevant) {
                        scheduleRefresh();
                    }
                }
            );

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );
    }

    setTimeout(() => {
        installPatientPageInterceptor();
        createPanel();
        prepareDrgEditors();
        updateDropdowns();
        loadSelectedDrgSettings();
        applyFilters();
        observePage();
    }, 1200);

    setInterval(() => {
        installPatientPageInterceptor();
        syncPatientPageSizeToPageWindow();
        createPanel();
        prepareDrgEditors();
        updateDropdowns();

        renderAllocationDisplays(
            getTable()
        );
    }, 3000);
})();
