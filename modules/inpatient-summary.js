// ==UserScript==
// @name         住院患者一览汇总插件
// @namespace    http://tampermonkey.net/
// @version      1.3.28.3
// @description  v1.3.28.3：同步DRG助手成功取得8997名单后直接替换患者缓存，不合并旧助手名单；获取失败保留回退，DRG字典与WebDAV预警备份保持独立
// @author       MJP
// @match        *://11.12.199.244:8003/*
// @match        http://11.12.199.3:8996/attend/attendingPhysician*
// @match        http://11.12.199.3:8996/attend/patientQuery*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      11.12.199.244
// @connect      11.12.199.3
// @run-at       document-start
// ==/UserScript==
(function inpatientVisibleSummaryMain() {
    'use strict';


    /* ==============================================================
       v1.3.27：医疗管理系统患者接口实时数据认证桥
       - 8996：只捕获患者列表请求中的 token + 查询条件，写入本脚本GM存储后立即退出；
       - 8003：有有效认证时优先通过 GM_xmlhttpRequest 读取8997实时患者状态；
       - 8997不可用时，其余患者信息继续回退8003/DOM；责任医师不使用8003 ysmc，改由DRG助手快照兜底；
       - token不记录到localStorage、患者缓存或WebDAV，也不展示原文。
       ============================================================== */

    const DIRECT_PATIENT_AUTH_STORAGE_KEY =
        'oha_inpatient_summary_medical_management_auth_v1';
    const DIRECT_PATIENT_API_URL =
        'http://11.12.199.3:8997/hospitalApi/api/patient/page';
    const DIRECT_HELPER_LAST_REQUEST_BRIDGE =
        '__tmDoctorDrgLastPatientRequest_v252';

    /* 最近一次完整汇总所形成的患者实时字段，仅保留当前页面内存，不持久化。 */
    let directLastSummaryMeta = {
        attempted: false,
        success: false,
        returned: 0,
        matched: 0,
        error: '',
        doctorFallbackSource: '',
        doctorFallbackMatched: 0,
        doctorFallbackFilled: 0
    };

    function directPageWindow() {
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
                return unsafeWindow;
            }
        } catch (error) {}
        return window;
    }

    function directClone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return null;
        }
    }

    function directNormalizeHeaders(headers) {
        const result = {};
        if (!headers) return result;
        try {
            if (typeof Headers !== 'undefined' && headers instanceof Headers) {
                headers.forEach(function (value, key) {
                    result[String(key)] = String(value);
                });
                return result;
            }
        } catch (error) {}
        if (Array.isArray(headers)) {
            headers.forEach(function (item) {
                if (Array.isArray(item) && item.length >= 2) {
                    result[String(item[0])] = String(item[1]);
                }
            });
            return result;
        }
        if (typeof headers === 'object') {
            Object.keys(headers).forEach(function (key) {
                if (headers[key] !== undefined && headers[key] !== null) {
                    result[String(key)] = String(headers[key]);
                }
            });
        }
        return result;
    }

    function directHeaderValue(headers, targetName) {
        const source = directNormalizeHeaders(headers);
        const target = String(targetName || '').toLowerCase();
        const key = Object.keys(source).find(function (name) {
            return String(name).toLowerCase() === target;
        });
        return key ? String(source[key] || '').trim() : '';
    }

    function directParsePayload(body) {
        if (!body) return null;
        if (typeof body === 'string') {
            try {
                const parsed = JSON.parse(body);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed
                    : null;
            } catch (error) {
                try {
                    const params = new URLSearchParams(body);
                    const result = {};
                    params.forEach(function (value, key) {
                        result[key] = value;
                    });
                    return Object.keys(result).length ? result : null;
                } catch (ignore) {
                    return null;
                }
            }
        }
        if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
            const result = {};
            body.forEach(function (value, key) { result[key] = value; });
            return result;
        }
        if (typeof body === 'object' && !(body instanceof FormData)) {
            return directClone(body);
        }
        return null;
    }

    function directLooksLikePatientRequest(url, payload) {
        const currentUrl = String(url || '');
        if (/\/hospitalApi\/api\/patient\/page(?:\?|$)/i.test(currentUrl)) {
            return true;
        }
        return Boolean(
            payload &&
            typeof payload === 'object' &&
            Object.prototype.hasOwnProperty.call(payload, 'pageNum') &&
            Object.prototype.hasOwnProperty.call(payload, 'pageSize') &&
            Object.prototype.hasOwnProperty.call(payload, 'hospitalArea')
        );
    }

    function directPersistAuth(url, method, headers, payload, source) {
        const token = directHeaderValue(headers, 'token');
        const requestPayload = directClone(payload);
        if (!token || !requestPayload || !directLooksLikePatientRequest(url, requestPayload)) {
            return false;
        }
        try {
            GM_setValue(DIRECT_PATIENT_AUTH_STORAGE_KEY, {
                token: token,
                url: String(url || DIRECT_PATIENT_API_URL),
                method: String(method || 'POST').toUpperCase(),
                payload: requestPayload,
                hospitalArea: String(requestPayload.hospitalArea || ''),
                capturedAt: Date.now(),
                source: String(source || '8996')
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    function directReadAuth() {
        try {
            const value = GM_getValue(DIRECT_PATIENT_AUTH_STORAGE_KEY, null);
            if (!value) return null;
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function directCaptureFromDrgHelperBridge() {
        try {
            const page = directPageWindow();
            const request = page && page[DIRECT_HELPER_LAST_REQUEST_BRIDGE];
            if (!request || !request.payload) return false;
            return directPersistAuth(
                request.url || DIRECT_PATIENT_API_URL,
                request.method || 'POST',
                request.headers || {},
                request.payload,
                'DRG助手请求桥'
            );
        } catch (error) {
            return false;
        }
    }

    function directInstall8996AuthCapture() {
        const page = directPageWindow();
        if (!page) return;

        /* 优先复用DRG助手已经捕获的最终请求；互不依赖其GM存储。 */
        directCaptureFromDrgHelperBridge();
        let bridgeChecks = 0;
        const bridgeTimer = window.setInterval(function () {
            bridgeChecks += 1;
            directCaptureFromDrgHelperBridge();
            if (bridgeChecks >= 120) window.clearInterval(bridgeTimer);
        }, 1000);

        try {
            const Xhr = page.XMLHttpRequest;
            if (Xhr && Xhr.prototype && !Xhr.prototype.__ohaDirectPatientAuthCaptureV1) {
                const originalOpen = Xhr.prototype.open;
                const originalSetRequestHeader = Xhr.prototype.setRequestHeader;
                const originalSend = Xhr.prototype.send;

                Xhr.prototype.open = function (method, url) {
                    this.__ohaDirectUrl = String(url || '');
                    this.__ohaDirectMethod = String(method || 'POST').toUpperCase();
                    this.__ohaDirectHeaders = {};
                    return originalOpen.apply(this, arguments);
                };

                Xhr.prototype.setRequestHeader = function (name, value) {
                    try {
                        this.__ohaDirectHeaders = this.__ohaDirectHeaders || {};
                        this.__ohaDirectHeaders[String(name)] = String(value);
                    } catch (error) {}
                    return originalSetRequestHeader.apply(this, arguments);
                };

                Xhr.prototype.send = function (body) {
                    try {
                        const payload = directParsePayload(body);
                        directPersistAuth(
                            this.__ohaDirectUrl,
                            this.__ohaDirectMethod,
                            this.__ohaDirectHeaders || {},
                            payload,
                            'XHR'
                        );
                    } catch (error) {}
                    return originalSend.apply(this, arguments);
                };

                try {
                    Object.defineProperty(Xhr.prototype, '__ohaDirectPatientAuthCaptureV1', {
                        value: true,
                        configurable: true
                    });
                } catch (error) {
                    Xhr.prototype.__ohaDirectPatientAuthCaptureV1 = true;
                }
            }
        } catch (error) {}

        try {
            if (typeof page.fetch === 'function' && !page.fetch.__ohaDirectPatientAuthCaptureV1) {
                const originalFetch = page.fetch;
                const wrapped = function (input, init) {
                    const options = init || {};
                    try {
                        const url = typeof input === 'string' ? input : (input && input.url) || '';
                        const headers = options.headers || (input && input.headers) || {};
                        const payload = directParsePayload(options.body);
                        directPersistAuth(
                            url,
                            options.method || (input && input.method) || 'POST',
                            headers,
                            payload,
                            'fetch'
                        );
                    } catch (error) {}
                    return originalFetch.apply(this, arguments);
                };
                wrapped.__ohaDirectPatientAuthCaptureV1 = true;
                page.fetch = wrapped;
            }
        } catch (error) {}
    }

    if (
        location.hostname === '11.12.199.3' &&
        location.port === '8996'
    ) {
        directInstall8996AuthCapture();
        return;
    }

    /******************************************************************
     * v1.3.0
     * 1. 在“住院患者一览”的床号筛选控件右侧增加“汇总信息”。
     * 2. 只汇总当前筛选后、当前页真正可见的患者名片，不跨页抓取。
     * 3. 患者身份优先读取悬浮框管理器已建立的住院号↔患者卡片运行时索引；
     *    无法关联时，自动点击当前可见名片，从右侧“基本信息”读取住院号/费用。
     * 4. 已取得住院号时，费用优先调用现有8003接口：
     *      POST /PatientList/inpatientBedUsedInfo   body: zyh=住院号
     *    读取 zje/ZJE；接口失败再回退右侧基本信息。
     * 5. 主诊断直接读取当前可见患者名片中的诊断文本，因此展示结果严格对应
     *    当前筛选界面，不依赖AI，不产生Token消耗。
     * 6. 弹窗提供：患者数/总费用/人均费用/平均住院日、费用Top5、
     *    主诊断分布、关联明细表、复制表格、导出CSV、重新汇总。
     * 7. “汇总信息”按钮不再使用 left/top 绝对坐标。脚本先识别“输入床号”及其右侧
     *    的原生列表小图标，再把按钮作为同一工具栏中的下一个普通控件插入 DOM 文档流，
     *    由 HIS 原生布局决定最终坐标；避免不同父容器坐标系导致按钮始终覆盖输入框。
     * 8. 主诊断改为下拉式筛选，菜单自动列出本次汇总中已有的主诊断及人数；
     *    床号、住院天数、总费用继续支持点击表头排序。
     * 9. “汇总信息”移至右侧“基本信息”面板下方；其下增加“同步DRG助手”和责任医师筛选。
     * 10. 同步DRG助手读取 MedicalDoctorDrgSnapshotBridgeV1 快照，显示责任医师并支持按责任医师筛选患者卡片。
     * 11. 汇总操作界面增加DRG预警设置：多个主诊断可映射同一DRG组；每个DRG组独立保存疾病定额、
     *     每日花费预估和报红区间；按（疾病定额－当前费用）÷每日花费向上取整显示预计剩余天数。
     * 12. v1.3.1：DRG分组下拉同时读取DRG助手同步缓存，候选项显示分组 + 疾病定额 + 每日花费；
     *     选择同步分组时自动带入同步值，本插件已保存的本地设置优先。
     * 13. 主页责任医师改为高辨识度胶囊标签。
     * 14. v1.3.2：DRG助手同步改为“DRG字典同步”，仅保存DRG分组全名、疾病定额、每日花费预估；
     *     不再把DRG分组与具体患者建立同步对应关系。责任医师身份数据仍仅用于责任医师显示/筛选。
     * 15. DRG分组联想项采用完整名称（如“IU23 颈腰背疾病，伴合并症或并发症”）；输入过程中不再强制
     *     压缩为DRG编码，修复无法键入空格的问题。
     * 16. 患者关联明细增加责任医师下拉筛选；患者姓名、住院号表头增加“手动筛选”，点击后在二级视窗编辑。
     * 17. v1.3.3：患者关联明细表头改为双层结构，第一行仅显示列名/排序，第二行集中放置筛选控件。
     * 18. 明细表所有列支持拖拽调整列宽，并将列宽写入localStorage，重新打开汇总窗口或刷新页面后自动恢复。
     * 19. v1.3.4：修复双层表头第一行与筛选第二行之间的视觉空隙，thead整体吸顶，两行自然连续排列。
     * 20. 取消列宽520px上限，允许自由加宽；列宽缩小时单元格文本自动换行，行高随内容自适应。
     * 21. 患者关联明细的DRG分组列新增下拉式菜单筛选。
     * 22. v1.3.5：汇总窗口底部增加“重置布局”，一键清除已保存的明细列宽并立即恢复默认列宽。
     * 23. v1.3.6：DRG预警设置下方已保存主诊断映射预览框最大高度从88px提高至280px，超出后独立滚动。
     * 24. v1.3.7：底部新增“自适应布局”，按容器当前可用宽度重新分配14列列宽，尽量消除横向滚动；
     *     自动模式记忆并响应窗口/容器尺寸变化；手动拖动或重置布局时退出自动模式。
     * 25. v1.3.10：主页责任医师筛选下方新增“显示责任医师”勾选项；仅控制患者卡片责任医师胶囊是否显示，
     *     不影响责任医师同步数据与筛选功能，并记忆用户上次选择。
     * 26. v1.3.11：患者卡片下方责任医师标签由圆形胶囊改为轻量矩形风格，使其与原患者卡片视觉语言更一致。
     * 27. v1.3.12：患者关联明细标题右侧新增“展开/折叠”按钮；折叠时维持明细区独立纵向滚动，
     *     展开时取消明细区最大高度限制，由汇总窗口一级纵向滚动条统一滚动，并记忆上次状态。
     * 28. v1.3.13：患者关联明细的“住院号 / 患者姓名”筛选二级视窗新增当前名单预览，
     *     按对应列去重后一行一个展示；预览仅供核对/复制，不会自动写入筛选条件。
     * 29. v1.3.14：“同步DRG助手”与悬浮框管理器统一使用 oha_inpatient_summary_drg_sync_v1 本地缓存；
     *     任一侧同步均保存“责任医师患者身份记录 + DRG分组字典”，并通过共享事件即时通知另一侧刷新；
     *     localStorage持久化后页面刷新或重新进入仍可自动恢复，不再依赖当前页面内存。
     * 30. v1.3.15：患者关联明细“患者姓名 / 住院号”筛选二级界面的名单预览改为读取当前表格视图；
     *     床号/住院天数/费用排序及责任医师、主诊断、DRG分组、姓名、住院号等筛选变化后，预览顺序与当前明细顺序保持一致。
     * 31. v1.3.16：右侧“同步DRG助手”下方责任医师下拉与悬浮框管理器“DRG责任医师”下拉建立联动。
     *     当管理器启用“DRG助手筛选”时，任一侧切换责任医师会同步另一侧，并复用管理器既有筛选链路同步筛选病历管理患者；
     *     下拉候选统一按共享DRG缓存中的责任医师及人数生成。管理器未启用DRG助手筛选时，本插件仍保持原有的住院患者一览本地筛选能力。
     * 32. v1.3.17：主页面责任医师下拉按悬浮框管理器当前筛选模式切换显示语义。
     *     启用DRG助手筛选时继续使用共享DRG缓存生成“医师（人数）”并与管理器双向联动；
     *     自定义患者筛选模式或DRG筛选未启用时恢复v1.3.15显示方式：只按当前页已标记患者生成责任医师选项，
     *     显示“全部责任医师 / 医师姓名 / 未设置责任医师”，不再展示共享DRG全名单人数，也不向管理器回写选择。
     * 33. v1.3.18：接入悬浮框管理器“界面增强”模块。
     *     管理器可即时启用/禁用“住院患者一览汇总”；禁用后清理本插件注入的按钮、右侧控制区、责任医师标签、
     *     本地筛选隐藏类与汇总弹窗，并暂停DOM扫描；本地DRG缓存、DRG预警设置、列宽和显示偏好均不删除。
     *     重新启用后无需刷新页面即可重新扫描并恢复界面；管理器不存在或旧版无该设置时默认保持启用。
     * 34. v1.3.19：加入WebDAV脚本源码快照适配。
     *     通过悬浮框管理器 MedicalUserscriptSourceBackupRegistry 主动注册当前运行版本完整源码；
     *     管理器未就绪时进入预注册队列，之后可随源码自动备份或手动上传写入WebDAV。
     * 35. v1.3.20：基于回归后的v1.3.19重新迭代当前页汇总性能，不继承此前已搁置的布局试验分支。
     *     第一阶段8003费用查询由逐患者串行改为固定5路有限并发，并在每个worker请求完成后保留45ms节流；
     *     无住院号、接口失败或费用缺失的患者仍进入第二阶段，继续按原逻辑串行点击患者卡片读取右侧基本信息，
     *     避免并发操作DOM导致患者面板错配；主要用于降低OHA Windows经SSTP/VPN时网络往返延迟的累计放大。
     * 36. v1.3.22：同源8003费用请求优先通过浏览器fetch，失败后仍由原GM通道重试；
     *     保留5路有限并发及右侧基本信息串行兜底，正式版移除排查阶段的耗时与通道统计。
     * 37. v1.3.23：优化当前页汇总抓取策略。
     *     DOM继续用于确定当前筛选后真正可见的患者，并保留原字段解析作为兜底；汇总开始时优先一次调用
     *     POST /PatientList/GetzbqPatientList 批量取得病区患者元数据，以住院号或“姓名+床号”匹配当前可见患者，
     *     补齐住院号、床号、性别、年龄、住院天数、诊断和责任医师。诊断相关既有称呼、筛选和DRG映射语义不变。
     *     实时总费用仍由 /PatientList/inpatientBedUsedInfo 按住院号查询并保留固定5路有限并发；
     *     GetzbqPatientList读取失败时自动回退v1.3.22的DOM+运行时索引+右侧基本信息方案，不阻断汇总。
     * 38. v1.3.24：增加医疗管理系统患者接口直连测试。8996页面自动捕获 /hospitalApi/api/patient/page 的token与查询条件并写入本脚本GM存储；
     *     8003右侧控制区新增“测试直连”，通过GM_xmlhttpRequest直连8997，验证跨域、认证和患者匹配，不改写现有DRG助手缓存或汇总数据。
     * 39. v1.3.25：将8997从测试通道正式纳入当前页汇总。患者实时状态字段采用8997优先，8997不可用或字段缺失时继续由8003病区列表、费用接口及页面DOM兜底；
     *     DRG助手同步数据不再覆盖汇总中已经取得的实时责任医师/床号/费用等患者状态，仅继续提供DRG分组字典、疾病定额、每日花费等DRG业务配置；
     *     8997已返回实时费用的患者不再重复请求8003逐患者费用接口，减少重复网络请求；右侧“测试直连”按钮移除，直连改为汇总过程自动尝试。
     * 40. v1.3.26：修正字段级数据源优先级。患者关联明细“主诊断”固定以8003 GetzbqPatientList.zdmc为最高优先级，
     *     即使8997已匹配患者也允许8003诊断覆盖DOM展示文本，并统一清理“入院诊断：/主诊断：/诊断：”等显示前缀；
     *     “责任医师”在8997已匹配患者时严格只读取 attendDoc，attendDoc为空即保持空值，不再以groupDoctor、8003 ysmc、DRG助手快照或DOM补齐。
     * 41. v1.3.27：修正责任医师兜底语义并增强DRG助手同步。
     *     8003 GetzbqPatientList.ysmc 属于门诊医生字段，不再写入“责任医师”；8003继续只负责主诊断、人口学/住院信息及费用相关兜底。
     *     责任医师优先级改为：8997已匹配患者严格使用attendDoc（空值同样有效）→ 未被8997匹配患者使用DRG助手快照桥 → DRG助手共享本地缓存 → 无可靠来源时留空。
     *     “同步DRG助手”参考查房本扩展桥接发现范围：unsafeWindow/window/top/父级及可访问iframe/frame均参与搜索，并逐个尝试可用桥；桥不可用时保留共享本地缓存作为兼容兜底。
     * 42. v1.3.28：“同步DRG助手”按钮先请求8997，当前页责任医师严格使用attendDoc（空值有效）；
     *     未匹配者再用DRG助手快照/共享缓存兜底。DRG分组字典仍由助手同步；8997责任医师写入共享缓存供筛选使用。
     * 43. v1.3.28.3：同步成功的完整8997患者名单直接替换共享名单（空名单同样有效），
     *     不合并助手快照/旧患者缓存；8997获取失败才回退助手名单，DRG分组字典继续独立同步。
     ******************************************************************/

    const SCRIPT_PREFIX = 'oha-inpatient-visible-summary';
    const BUTTON_ID = SCRIPT_PREFIX + '-button';
    const STYLE_ID = SCRIPT_PREFIX + '-style';
    const OVERLAY_ID = SCRIPT_PREFIX + '-overlay';
    const RUNTIME_INDEX_KEY = '__medicalOpenHisPatientCardIdentityIndexV1__';
    const SUMMARY_FEE_CONCURRENCY = 5;
    const SUMMARY_FEE_WORKER_GAP_MS = 45;

    /* v1.3.18：悬浮框管理器“界面增强”运行开关。旧版管理器/无管理器时默认启用。 */
    const MANAGER_STORAGE_KEY = 'medicalUserscriptSuiteManagerV2';
    const INTERFACE_ENHANCEMENT_EVENT = 'medical-interface-enhancements-changed-v1';
    const INTERFACE_ENHANCEMENT_CHANNEL = 'medical-interface-enhancements-v1';
    let extFeatureRuntimeEnabled = false;
    let extFeatureObserver = null;
    let extFeatureBroadcastChannel = null;
    let extFeatureLifecycleInitialized = false;

    function extManagerFeatureEnabled() {
        try {
            const raw = localStorage.getItem(MANAGER_STORAGE_KEY);
            if (!raw) return true;
            const saved = JSON.parse(raw);
            const enhancements = saved && saved.interfaceEnhancements;
            if (!enhancements || typeof enhancements !== 'object') return true;
            return enhancements.inpatientSummary !== false;
        } catch (error) {
            return true;
        }
    }

    let scanTimer = null;
    let summaryRunning = false;
    let lastRows = [];
    /* 本次按钮结果绑定当前卡片；共享缓存另存精简的患者身份与责任医师。 */
    let extLastDoctorSync = { signature: '', rows: [] };
    /* 内存级页面缓存：不把患者信息持久写入浏览器，页面刷新后自动清空。 */
    let summaryCache = null;
    let currentViewRows = null;
    let tableViewState = { diagnosis: '', responsibleDoctor: '', drgGroup: '', patientNames: [], admissionNos: [], sortKey: 'bedNo', sortDirection: 'asc' };

    /* ==============================================================
       通用工具
       ============================================================== */

    function text(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function compact(value) {
        return text(value).replace(/\s+/g, '');
    }

    function normalizeSummaryDiagnosis(value) {
        return text(value)
            .replace(/^(?:入院诊断|主要诊断|主诊断|诊断)\s*[:：]\s*/i, '')
            .trim();
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function parseNumber(value) {
        const match = String(value == null ? '' : value)
            .replace(/[,，￥¥元\s]/g, '')
            .match(/-?\d+(?:\.\d+)?/);
        if (!match) return null;
        const number = Number(match[0]);
        return Number.isFinite(number) ? number : null;
    }

    function formatMoney(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '--';
        return number.toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function normalizeBed(value) {
        return compact(value)
            .replace(/[－—–]/g, '-')
            .replace(/(?:床位号|床位|床号|床)$/g, '')
            .replace(/^0+(?=\d)/, '');
    }

    function normalizeAdmissionNo(value) {
        const raw = compact(value);
        const match = raw.match(/(?:^|\D)(\d{5,10})(?:\D|$)/);
        return match ? match[1] : '';
    }

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (Number(style.opacity) === 0) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function waitFor(checker, timeout, interval) {
        const maximum = Number(timeout) || 2600;
        const step = Number(interval) || 90;
        return new Promise(function (resolve) {
            const started = Date.now();
            const timer = setInterval(function () {
                let result = null;
                try {
                    result = checker();
                } catch (error) {
                    result = null;
                }
                if (result) {
                    clearInterval(timer);
                    resolve(result);
                    return;
                }
                if (Date.now() - started >= maximum) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, step);
        });
    }

    /* ==============================================================
       患者卡片识别
       ============================================================== */

    function looksLikePatientCard(element) {
        if (!(element instanceof HTMLElement) || !isVisible(element)) return false;

        const value = compact(element.innerText || element.textContent || '');
        if (!value) return false;

        /* 当前OpenHIS患者卡片稳定特征：床号 + 年龄 + 性别 + 住院天数。 */
        if (!/\d{1,4}(?:-\d{1,4})?床/.test(value)) return false;
        if (!/\d{1,3}岁/.test(value)) return false;
        if (!/[男女]/.test(value)) return false;
        if (!/\d{1,4}天/.test(value)) return false;

        const rect = element.getBoundingClientRect();
        return (
            rect.width >= 130 && rect.width <= 420 &&
            rect.height >= 55 && rect.height <= 280
        );
    }

    function getVisiblePatientCards() {
        const candidates = Array.from(
            document.querySelectorAll('div,li,article,section,td')
        ).filter(looksLikePatientCard);

        /* 只保留最内层卡片，避免父容器也满足文本特征。 */
        const cards = candidates.filter(function (element) {
            return !Array.from(element.children).some(looksLikePatientCard);
        });

        return Array.from(new Set(cards)).filter(isVisible);
    }

    function leafTextElements(card) {
        return Array.from(
            card.querySelectorAll('span,a,div,p,label,td,strong,em,b')
        ).filter(function (element) {
            if (!(element instanceof HTMLElement)) return false;
            if (!isVisible(element)) return false;
            if (element.children.length > 0) return false;
            return Boolean(text(element.innerText || element.textContent));
        });
    }

    function possibleName(value) {
        const current = compact(value)
            .replace(/^接诊医师[:：]?/, '')
            .replace(/^责任医师[:：]?/, '')
            .replace(/^接诊[:：]?/, '')
            .replace(/^责任[:：]?/, '');

        if (!current) return false;
        if (!/^[\u4e00-\u9fa5A-Za-z·]{2,18}$/.test(current)) return false;

        const deny = [
            '男', '女', '男性', '女性', '自费', '医保', '职工医保', '居民医保',
            '基本信息', '流转信息', '责任医师', '接诊医师', '待查',
            '阴', '阳', '阴性', '阳性', '一般', '暂无数据', '未设置',
            '总费用', '账户余额', '刷新', '汇总信息'
        ];
        return !deny.includes(current);
    }

    function getCardBedNo(card) {
        const value = compact(card.innerText || '');
        const match = value.match(/(\d{1,4}(?:-\d{1,4})?)床/);
        return match ? normalizeBed(match[1]) : '';
    }

    function getCardAge(card) {
        const match = compact(card.innerText || '').match(/(\d{1,3})岁/);
        return match ? match[1] : '';
    }

    function getCardSex(card) {
        /* 优先识别“岁 男/女”附近，减少诊断文字误命中。 */
        const value = compact(card.innerText || '');
        let match = value.match(/\d{1,3}岁([男女])/);
        if (!match) match = value.match(/([男女])\d{1,4}天/);
        return match ? match[1] : '';
    }

    function getCardHospitalDays(card) {
        const match = compact(card.innerText || '').match(/(\d{1,4})天/);
        return match ? Number(match[1]) : null;
    }

    function getCardAdmissionNo(card) {
        const value = text(card.innerText || '');
        let match = value.match(/(?:住院号|住院编号|病案号)\s*[:：]?\s*([A-Za-z0-9_-]+)/i);
        if (match) return normalizeAdmissionNo(match[1]) || compact(match[1]);

        /* 部分页面把zyh写在onclick/data属性中但不显示。 */
        const attrs = [];
        [card].concat(Array.from(card.querySelectorAll('[onclick],[data-zyh],[data-inpatient-no],[data-admission-no]')))
            .forEach(function (element) {
                if (!(element instanceof HTMLElement)) return;
                ['onclick', 'data-zyh', 'data-inpatient-no', 'data-admission-no', 'data-id', 'value']
                    .forEach(function (name) {
                        const raw = element.getAttribute(name);
                        if (raw) attrs.push(raw);
                    });
            });
        for (const raw of attrs) {
            match = String(raw).match(/(?:zyh|inpatientNo|admissionNo)?[^0-9]{0,8}(\d{5,10})/i);
            if (match) return match[1];
        }
        return '';
    }

    function findPatientName(card) {
        const cardRect = card.getBoundingClientRect();
        const leaves = leafTextElements(card).filter(function (element) {
            const value = compact(element.innerText || element.textContent || '');
            if (!possibleName(value)) return false;
            const rect = element.getBoundingClientRect();
            const topRatio = (rect.top - cardRect.top) / Math.max(cardRect.height, 1);
            /* 患者姓名位于卡片上半部；接诊医师通常更靠下。 */
            return topRatio >= 0.10 && topRatio <= 0.48;
        });

        if (!leaves.length) return '';
        leaves.sort(function (a, b) {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            if (Math.abs(ar.top - br.top) > 3) return ar.top - br.top;
            return ar.left - br.left;
        });
        return compact(leaves[0].innerText || leaves[0].textContent || '');
    }

    function getElementFullText(element) {
        if (!element) return '';
        const candidates = [
            element.getAttribute && element.getAttribute('title'),
            element.getAttribute && element.getAttribute('data-original-title'),
            element.getAttribute && element.getAttribute('data-title'),
            element.innerText,
            element.textContent
        ];
        for (const item of candidates) {
            const value = text(item);
            if (value) return value;
        }
        return '';
    }

    function diagnosisCandidateAllowed(value, patientName) {
        const current = text(value);
        if (!current) return false;
        if (compact(current) === compact(patientName)) return false;
        if (/^(?:男|女|男性|女性|职工医保|居民医保|医保|自费|一般|阴|阳|阴性|阳性)$/.test(compact(current))) return false;
        if (/^(?:接诊医师|责任医师)?[:：]?[\u4e00-\u9fa5A-Za-z·]{2,10}$/.test(compact(current)) && current.length <= 8) {
            /* 短纯姓名样文本更可能是医师；诊断通常更长。 */
            if (!/[病症炎痛伤瘫梗压糖喘衰塞变征]/.test(current)) return false;
        }
        if (/\d{1,3}岁|\d{1,4}天|\d{1,4}(?:-\d{1,4})?床/.test(compact(current))) return false;
        if (/^(?:\d+条|暂无数据|未设置)$/.test(compact(current))) return false;
        return /[\u4e00-\u9fa5A-Za-z]/.test(current);
    }

    function getCardDiagnosis(card, patientName) {
        const leaves = leafTextElements(card);
        const nameElement = leaves.find(function (element) {
            return compact(element.innerText || element.textContent || '') === compact(patientName);
        });

        /* 第一优先：与患者姓名处于同一横排、位于姓名右侧的文本。 */
        if (nameElement) {
            const nameRect = nameElement.getBoundingClientRect();
            const sameRow = leaves.filter(function (element) {
                if (element === nameElement) return false;
                const rect = element.getBoundingClientRect();
                const verticalDistance = Math.abs(
                    (rect.top + rect.height / 2) -
                    (nameRect.top + nameRect.height / 2)
                );
                if (verticalDistance > Math.max(10, nameRect.height * 0.85)) return false;
                if (rect.left < nameRect.left + nameRect.width * 0.55) return false;
                return diagnosisCandidateAllowed(getElementFullText(element), patientName);
            });
            if (sameRow.length) {
                sameRow.sort(function (a, b) {
                    return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
                });
                return getElementFullText(sameRow[0]);
            }
        }

        /* 第二优先：卡片上部、姓名行附近的诊断文本。 */
        const cardRect = card.getBoundingClientRect();
        const upper = leaves.filter(function (element) {
            const rect = element.getBoundingClientRect();
            const ratio = (rect.top - cardRect.top) / Math.max(cardRect.height, 1);
            if (ratio < 0.23 || ratio > 0.57) return false;
            return diagnosisCandidateAllowed(getElementFullText(element), patientName);
        });

        upper.sort(function (a, b) {
            const aValue = getElementFullText(a);
            const bValue = getElementFullText(b);
            const aScore = (/[病症炎痛伤瘫梗压糖喘衰塞变征]/.test(aValue) ? 100 : 0) + aValue.length;
            const bScore = (/[病症炎痛伤瘫梗压糖喘衰塞变征]/.test(bValue) ? 100 : 0) + bValue.length;
            return bScore - aScore;
        });

        return upper.length ? getElementFullText(upper[0]) : '';
    }

    function readCardBase(card) {
        const name = findPatientName(card);
        return {
            card: card,
            admissionNo: getCardAdmissionNo(card),
            bedNo: getCardBedNo(card),
            name: name,
            sex: getCardSex(card),
            age: getCardAge(card),
            hospitalDays: getCardHospitalDays(card),
            diagnosis: normalizeSummaryDiagnosis(getCardDiagnosis(card, name)),
            fee: null,
            source: ''
        };
    }

    /* ==============================================================
       读取悬浮框管理器运行时患者索引（如果存在）
       ============================================================== */

    function getPageWindow() {
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
                return unsafeWindow;
            }
        } catch (error) {}
        return window;
    }

    function readRuntimeIndexEntries() {
        let topWindow = null;
        try {
            const pageWindow = getPageWindow();
            topWindow = pageWindow.top || pageWindow;
        } catch (error) {
            topWindow = getPageWindow();
        }

        let runtime = null;
        try {
            runtime = topWindow && topWindow[RUNTIME_INDEX_KEY];
        } catch (error) {
            runtime = null;
        }

        if (!runtime || typeof runtime !== 'object' || !runtime.sources) return [];

        const byAdmission = new Map();
        Object.keys(runtime.sources || {}).forEach(function (kind) {
            const source = runtime.sources[kind];
            const entries = source && Array.isArray(source.entries) ? source.entries : [];
            entries.forEach(function (entry) {
                const admissionNo = normalizeAdmissionNo(entry && entry.admissionNo);
                if (!admissionNo) return;
                const existing = byAdmission.get(admissionNo) || {
                    admissionNo: admissionNo,
                    name: '',
                    bedNo: '',
                    sex: '',
                    age: ''
                };
                ['name', 'bedNo', 'sex', 'age'].forEach(function (key) {
                    if (!existing[key] && entry && entry[key] != null) {
                        existing[key] = text(entry[key]);
                    }
                });
                byAdmission.set(admissionNo, existing);
            });
        });
        return Array.from(byAdmission.values());
    }

    function enrichRowsFromRuntimeIndex(rows) {
        const entries = readRuntimeIndexEntries();
        if (!entries.length) return rows;

        rows.forEach(function (row) {
            if (row.admissionNo) return;
            const rowName = compact(row.name);
            const rowBed = normalizeBed(row.bedNo);

            let matches = entries.filter(function (entry) {
                const nameMatched = rowName && compact(entry.name) === rowName;
                const bedMatched = rowBed && normalizeBed(entry.bedNo) === rowBed;
                return (nameMatched && bedMatched) || (nameMatched && !rowBed) || (bedMatched && !rowName);
            });

            if (matches.length !== 1 && rowName) {
                matches = entries.filter(function (entry) {
                    return compact(entry.name) === rowName;
                });
            }
            if (matches.length !== 1 && rowBed) {
                matches = entries.filter(function (entry) {
                    return normalizeBed(entry.bedNo) === rowBed;
                });
            }

            if (matches.length === 1) {
                row.admissionNo = normalizeAdmissionNo(matches[0].admissionNo);
                if (!row.name) row.name = text(matches[0].name);
                if (!row.bedNo) row.bedNo = normalizeBed(matches[0].bedNo);
                if (!row.sex) row.sex = text(matches[0].sex);
                if (!row.age) row.age = text(matches[0].age).replace(/岁$/, '');
            }
        });
        return rows;
    }

    /* ==============================================================
       v1.3.23：8003病区患者列表批量元数据
       ============================================================== */

    const PATIENT_LIST_URL =
        'http://11.12.199.244:8003/PatientList/GetzbqPatientList';
    const PATIENT_LIST_PAGE_SIZE = 150;
    const PATIENT_LIST_DEFAULT_WARD_CODE = '00000015';

    function detectPatientListWardCode() {
        const params = new URLSearchParams(location.search || '');
        const fromQuery = text(
            params.get('bqCode') ||
            params.get('wardCode') ||
            params.get('WardCode') || ''
        );
        if (fromQuery) return fromQuery;

        const selectors = [
            '[name="bqCode"]', '#bqCode',
            '[name="wardCode"]', '#wardCode',
            '[name="WardCode"]', '#WardCode',
            '[data-bq-code]', '[data-ward-code]'
        ];
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (!element) continue;
            const value = text(
                element.value ||
                element.getAttribute('data-bq-code') ||
                element.getAttribute('data-ward-code') ||
                element.getAttribute('value') || ''
            );
            if (value) return value;
        }
        return PATIENT_LIST_DEFAULT_WARD_CODE;
    }

    function patientListResponseRows(data) {
        if (!data || typeof data !== 'object') return [];
        const rows = data.rows || data.Rows || data.data || data.Data || [];
        return Array.isArray(rows)
            ? rows.filter(function (item) {
                return item && typeof item === 'object';
            })
            : [];
    }

    function parsePatientListResponse(responseText) {
        let data = null;
        try {
            data = JSON.parse(responseText || '{}');
        } catch (error) {
            const preview = String(responseText || '').slice(0, 160).toLowerCase();
            throw new Error(
                /<!doctype|<html|login|登录/.test(preview)
                    ? '病区患者列表接口返回登录页'
                    : '病区患者列表接口未返回有效JSON'
            );
        }
        return {
            rows: patientListResponseRows(data),
            totalPages: Math.max(1, Number(data.total) || 1),
            records: Math.max(0, Number(data.records) || 0)
        };
    }

    function patientListRequestBody(page, wardCode) {
        return [
            'rows=' + encodeURIComponent(PATIENT_LIST_PAGE_SIZE),
            'page=' + encodeURIComponent(page),
            'bqCode=' + encodeURIComponent(wardCode || ''),
            'ys=',
            'bedCode=',
            'ryrqks=',
            'ryrqjs=',
            'ryrqsort='
        ].join('&');
    }

    function requestPatientListPageViaGm(page, wardCode) {
        return new Promise(function (resolve, reject) {
            const url = PATIENT_LIST_URL +
                '?rows=' + encodeURIComponent(PATIENT_LIST_PAGE_SIZE) +
                '&page=' + encodeURIComponent(page);
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: patientListRequestBody(page, wardCode),
                anonymous: false,
                timeout: 16000,
                onload: function (response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error('HTTP ' + response.status));
                        return;
                    }
                    try {
                        resolve(parsePatientListResponse(response.responseText));
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: function () { reject(new Error('网络请求失败')); },
                ontimeout: function () { reject(new Error('请求超时')); }
            });
        });
    }

    async function requestPatientListPage(page, wardCode) {
        const url = PATIENT_LIST_URL +
            '?rows=' + encodeURIComponent(PATIENT_LIST_PAGE_SIZE) +
            '&page=' + encodeURIComponent(page);
        const sameOrigin = new URL(url, location.href).origin === location.origin;
        if (sameOrigin && typeof window.fetch === 'function') {
            const controller = typeof AbortController === 'function'
                ? new AbortController()
                : null;
            const timeout = controller
                ? window.setTimeout(function () { controller.abort(); }, 16000)
                : null;
            try {
                const response = await window.fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: patientListRequestBody(page, wardCode),
                    signal: controller ? controller.signal : undefined
                });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return parsePatientListResponse(await response.text());
            } catch (error) {
                /* OHA/WebView2同源fetch异常时自动回退GM通道。 */
            } finally {
                if (timeout !== null) window.clearTimeout(timeout);
            }
        }
        return requestPatientListPageViaGm(page, wardCode);
    }

    async function requestPatientListMetadata() {
        const wardCode = detectPatientListWardCode();
        const first = await requestPatientListPage(1, wardCode);
        let rows = first.rows.slice();
        const totalPages = Math.min(Math.max(1, first.totalPages), 20);
        for (let page = 2; page <= totalPages; page += 1) {
            const next = await requestPatientListPage(page, wardCode);
            rows = rows.concat(next.rows || []);
        }
        return rows;
    }

    function patientListSex(value) {
        const current = text(value);
        if (current === '1' || /男/.test(current)) return '男';
        if (current === '2' || /女/.test(current)) return '女';
        return '';
    }

    function patientListAge(row) {
        const direct = text(
            row && (row.age !== undefined ? row.age : row.nl)
        );
        const shown = text(row && (row.nlshow || row.NLSHOW || ''));
        const match = (direct || shown).match(/\d{1,3}/);
        return match ? match[0] : '';
    }

    function matchPatientListRow(row, listRows) {
        const admissionNo = normalizeAdmissionNo(row && row.admissionNo);
        if (admissionNo) {
            const direct = listRows.find(function (item) {
                return normalizeAdmissionNo(
                    item.zyh || item.ZYH || item.admissionNo || item.inpatientNo || ''
                ) === admissionNo;
            });
            if (direct) return direct;
        }

        const name = compact(row && row.name);
        const bed = normalizeBed(row && row.bedNo);
        let matches = listRows.filter(function (item) {
            const itemName = compact(item.xm || item.XM || item.name || '');
            const itemBed = normalizeBed(item.cwmc || item.CWMC || item.bedNo || '');
            return name && bed && itemName === name && itemBed === bed;
        });
        if (matches.length === 1) return matches[0];

        if (name) {
            matches = listRows.filter(function (item) {
                return compact(item.xm || item.XM || item.name || '') === name;
            });
            if (matches.length === 1) return matches[0];
        }
        if (bed) {
            matches = listRows.filter(function (item) {
                return normalizeBed(item.cwmc || item.CWMC || item.bedNo || '') === bed;
            });
            if (matches.length === 1) return matches[0];
        }
        return null;
    }

    function enrichRowsFromPatientList(rows, listRows) {
        if (!Array.isArray(listRows) || !listRows.length) return rows;
        (rows || []).forEach(function (row) {
            const item = matchPatientListRow(row, listRows);
            if (!item) return;

            const admissionNo = normalizeAdmissionNo(
                item.zyh || item.ZYH || item.admissionNo || item.inpatientNo || ''
            );
            const bedNo = normalizeBed(item.cwmc || item.CWMC || item.bedNo || '');
            const name = text(item.xm || item.XM || item.name || '');
            const sex = patientListSex(item.sex || item.XB || item.xb || '');
            const age = patientListAge(item);
            const days = Number(item.zyts !== undefined ? item.zyts : item.ZYTS);
            const diagnosis = normalizeSummaryDiagnosis(
                item.zdmc || item.ZDMC || item.diagnosis || ''
            );
            const preserveRealtime = row && row._ohaRealtime8997 === true;

            /*
             * v1.3.27：8003继续用于补充住院号/床号/人口学/住院日，并以zdmc作为主诊断最高优先级。
             * 注意：GetzbqPatientList.ysmc在本院语义为门诊医生，不属于当前责任医师，故无论8997是否可用都禁止写入责任医师。
             * 责任医师仅由8997 attendDoc或后续DRG助手快照/共享缓存提供。
             */
            if (admissionNo && (!preserveRealtime || !row.admissionNo)) row.admissionNo = admissionNo;
            if (bedNo && (!preserveRealtime || !row.bedNo)) row.bedNo = bedNo;
            if (name && (!preserveRealtime || !row.name)) row.name = name;
            if (sex && (!preserveRealtime || !row.sex)) row.sex = sex;
            if (age && (!preserveRealtime || !row.age)) row.age = age;
            if (Number.isFinite(days) && days >= 0 && (!preserveRealtime || !Number.isFinite(row.hospitalDays))) {
                row.hospitalDays = days;
            }
            if (diagnosis) row.diagnosis = diagnosis;
        });
        return rows;
    }

    /* ==============================================================
       8003床位/费用接口
       ============================================================== */

    function bedFeeRows(data) {
        if (!data || typeof data !== 'object') return [];
        const candidates = [data.rows, data.Rows, data.data, data.Data];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
            if (candidate && typeof candidate === 'object') return [candidate];
        }
        if (data.zyh || data.ZYH || data.inpatientNo || data.AdmissionNo) return [data];
        return [];
    }

    function findBedFeeRow(data, admissionNo) {
        const target = normalizeAdmissionNo(admissionNo);
        const rows = bedFeeRows(data).filter(function (item) {
            return item && typeof item === 'object';
        });
        if (!rows.length) return null;

        const matched = rows.find(function (row) {
            const current = normalizeAdmissionNo(
                row.zyh || row.ZYH || row.inpatientNo || row.AdmissionNo || ''
            );
            return current && current === target;
        });
        if (matched) return matched;

        /* 与现有查房本相同：唯一返回行且该行未携带住院号时接受。 */
        if (rows.length === 1) {
            const onlyNo = normalizeAdmissionNo(
                rows[0].zyh || rows[0].ZYH || rows[0].inpatientNo || rows[0].AdmissionNo || ''
            );
            if (!onlyNo) return rows[0];
        }
        return null;
    }

    const BED_FEE_URL = 'http://11.12.199.244:8003/PatientList/inpatientBedUsedInfo';

    function parseBedFeeResponse(responseText, zyh) {
        let data = null;
        try {
            data = JSON.parse(responseText || '{}');
        } catch (error) {
            throw new Error('接口未返回有效JSON');
        }
        const row = findBedFeeRow(data, zyh);
        if (!row) throw new Error('未匹配当前住院号');
        const rawFee = row.zje !== undefined ? row.zje : row.ZJE;
        return {
            admissionNo: normalizeAdmissionNo(
                row.zyh || row.ZYH || row.inpatientNo || row.AdmissionNo || zyh
            ) || zyh,
            fee: parseNumber(rawFee),
            row: row
        };
    }

    function requestBedFeeViaGm(zyh) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: BED_FEE_URL,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                data: 'zyh=' + encodeURIComponent(zyh),
                anonymous: false,
                timeout: 16000,
                onload: function (response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error('HTTP ' + response.status));
                        return;
                    }
                    try {
                        resolve(parseBedFeeResponse(response.responseText, zyh));
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: function () {
                    reject(new Error('网络请求失败'));
                },
                ontimeout: function () {
                    reject(new Error('请求超时'));
                }
            });
        });
    }

    async function requestBedFee(admissionNo) {
        const zyh = normalizeAdmissionNo(admissionNo);
        if (!zyh) throw new Error('缺少住院号');

        /* 同源请求复用浏览器会话；异源或fetch失败时使用原GM通道。 */
        const sameOrigin = new URL(BED_FEE_URL, location.href).origin === location.origin;
        if (sameOrigin && typeof window.fetch === 'function') {
            const controller = typeof AbortController === 'function'
                ? new AbortController()
                : null;
            const timeout = controller
                ? window.setTimeout(function () { controller.abort(); }, 16000)
                : null;
            try {
                const response = await window.fetch(BED_FEE_URL, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: 'zyh=' + encodeURIComponent(zyh),
                    signal: controller ? controller.signal : undefined
                });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return parseBedFeeResponse(await response.text(), zyh);
            } catch (error) {
                /* 保留原GM通道及上层右侧基本信息兜底。 */
            } finally {
                if (timeout !== null) window.clearTimeout(timeout);
            }
        }

        return requestBedFeeViaGm(zyh);
    }

    /* ==============================================================
       右侧“基本信息”兜底读取
       ============================================================== */

    function findBasicInfoPanel() {
        const candidates = Array.from(
            document.querySelectorAll('div,section,aside,article')
        ).filter(function (element) {
            if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
            const value = compact(element.innerText || '');
            if (!value.includes('住院号')) return false;
            if (!value.includes('入院日期')) return false;
            if (!value.includes('总费用')) return false;
            const rect = element.getBoundingClientRect();
            return rect.width >= 120 && rect.width <= 560 && rect.height >= 130;
        });

        candidates.sort(function (a, b) {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return ar.width * ar.height - br.width * br.height;
        });
        return candidates[0] || null;
    }

    function valueNearLabel(panel, labelText) {
        const labels = Array.from(panel.querySelectorAll('*')).filter(function (element) {
            return compact(element.textContent || '') === compact(labelText);
        });
        for (const label of labels) {
            const options = [
                label.nextElementSibling,
                label.parentElement && label.parentElement.querySelector(':scope > :last-child'),
                label.parentElement && label.parentElement.nextElementSibling
            ];
            for (const option of options) {
                const value = text(option && option.textContent);
                if (value && compact(value) !== compact(labelText)) return value;
            }
        }
        return '';
    }

    function extractBasicPanelInfo() {
        const panel = findBasicInfoPanel();
        if (!panel) return null;

        const raw = text(panel.innerText || '');
        let admissionNo = '';
        let match = raw.match(/住院号\s*[:：]?\s*([A-Za-z0-9_-]+)/i);
        if (match) admissionNo = normalizeAdmissionNo(match[1]) || compact(match[1]);
        if (!admissionNo) {
            admissionNo = normalizeAdmissionNo(valueNearLabel(panel, '住院号'));
        }

        let totalFee = null;
        match = raw.match(/总费用\s*[:：]?\s*([￥¥]?\s*[\d,]+(?:\.\d+)?)/);
        if (match) totalFee = parseNumber(match[1]);
        if (totalFee === null) {
            totalFee = parseNumber(valueNearLabel(panel, '总费用'));
        }

        let patientName = '';
        const firstLine = String(panel.innerText || '').trim().split(/\n+/)[0] || '';
        match = firstLine.match(/^([\u4e00-\u9fa5A-Za-z·]{2,18})[，,\s]/);
        if (match) patientName = compact(match[1]);

        return {
            panel: panel,
            admissionNo: admissionNo,
            patientName: patientName,
            fee: totalFee
        };
    }

    function findClickableTarget(card, row) {
        const leaves = leafTextElements(card);
        const nameElement = leaves.find(function (element) {
            return compact(element.innerText || element.textContent || '') === compact(row.name);
        });
        return nameElement || card.querySelector('a,img,[onclick],[role="button"]') || card;
    }

    function activateCard(card, row) {
        const target = findClickableTarget(card, row);
        try {
            target.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        } catch (error) {
            try { target.click(); } catch (ignore) {}
        }
    }

    function findLikelyActiveCard(cards) {
        const activeKeywords = /(?:^|\s)(?:active|selected|current|on)(?:\s|$)/i;
        return cards.find(function (card) {
            const classes = String(card.className || '');
            if (activeKeywords.test(classes)) return true;
            if (card.getAttribute('aria-selected') === 'true') return true;
            return false;
        }) || null;
    }

    async function resolveByRightPanel(row) {
        if (!row.card || !row.card.isConnected) return null;
        activateCard(row.card, row);

        const result = await waitFor(function () {
            const current = extractBasicPanelInfo();
            if (!current) return null;
            if (
                current.patientName && row.name &&
                compact(current.patientName) !== compact(row.name)
            ) {
                return null;
            }
            if (!current.admissionNo && current.fee === null) return null;
            return current;
        }, 3000, 90);

        return result;
    }

    /* ==============================================================
       汇总数据
       ============================================================== */

    function setProgress(message) {
        const element = document.getElementById(SCRIPT_PREFIX + '-progress');
        if (element) element.textContent = message || '';

        const button = document.getElementById(BUTTON_ID);
        if (button && summaryRunning) {
            button.textContent = message || '汇总中…';
        }
    }

    async function buildSummaryRows() {
        const cards = getVisiblePatientCards();
        if (!cards.length) {
            throw new Error('当前页面未找到可见患者名片。请确认已进入“住院患者一览”。');
        }

        let rows = cards.map(readCardBase);

        /*
         * v1.3.27：患者“现在是什么状态”仍优先读取8997实时接口。
         * 8997失败时不报错阻断：住院号/床号/人口学/主诊断/费用继续沿用8003与页面链路，
         * 责任医师单独改由DRG助手快照桥/共享缓存兜底，禁止使用8003 ysmc。
         */
        directLastSummaryMeta = {
            attempted: true,
            success: false,
            returned: 0,
            matched: 0,
            error: '',
            doctorFallbackSource: '',
            doctorFallbackMatched: 0,
            doctorFallbackFilled: 0
        };
        try {
            setProgress('读取同步DRG助手的8997名单…');
            const directResult = await directRequestMedicalManagementPatients();
            const mergeResult = directEnrichSummaryRows(rows, directResult.rows);
            rows.forEach(function (row) { if (row._ohaRealtime8997) row._oha8997Cached = directResult.cached === true; });
            directLastSummaryMeta = {
                attempted: true,
                success: true,
                returned: directResult.rows.length,
                cached: directResult.cached === true,
                capturedAt: directResult.capturedAt || '',
                matched: mergeResult.matched,
                error: '',
                doctorFallbackSource: '',
                doctorFallbackMatched: 0,
                doctorFallbackFilled: 0
            };
        } catch (error) {
            directLastSummaryMeta.error = String(error && error.message || error);
            console.warn(
                '[住院患者一览汇总] 8997实时患者数据不可用，其余字段回退8003/页面；责任医师改由DRG助手兜底：',
                error
            );
        }

        /* 8003继续补充/兜底其它字段；主诊断固定由zdmc覆盖。ysmc明确不作为责任医师来源。 */
        try {
            setProgress('补充病区患者列表…');
            const patientListRows = await requestPatientListMetadata();
            enrichRowsFromPatientList(rows, patientListRows);
        } catch (error) {
            console.warn(
                '[住院患者一览汇总] GetzbqPatientList读取失败，已回退原策略：',
                error
            );
        }

        enrichRowsFromRuntimeIndex(rows);

        /*
         * v1.3.27：责任医师专用兜底。
         * - 8997已匹配患者：attendDoc（包括空值）保持权威，不允许任何旧快照覆盖；
         * - 8997未匹配患者：优先读取DRG助手当前快照桥；桥不可用再读取共享本地缓存；
         * - 8003 ysmc不参与责任医师链路。
         */
        try {
            setProgress('补充责任医师…');
            const drgDoctorSource = await extReadDrgAssistantSource();
            if (drgDoctorSource && Array.isArray(drgDoctorSource.records)) {
                const fallbackStats = extApplyDrgAssistantDoctorFallback(
                    rows,
                    drgDoctorSource.records,
                    drgDoctorSource.sourceType
                );
                directLastSummaryMeta.doctorFallbackSource =
                    drgDoctorSource.sourceLabel || '';
                directLastSummaryMeta.doctorFallbackMatched =
                    fallbackStats.matched;
                directLastSummaryMeta.doctorFallbackFilled =
                    fallbackStats.filled;
            }
        } catch (error) {
            console.warn(
                '[住院患者一览汇总] DRG助手责任医师兜底读取失败，未可靠识别者保持空值：',
                error
            );
        }

        const originalActive = findLikelyActiveCard(cards);

        /*
         * 第一阶段：已有住院号的患者直接用8003接口读实时费用。
         * v1.3.20改为固定5路有限并发：
         * - 只并发网络请求，不并发点击患者卡片；
         * - 每个worker完成一次请求后保留45ms节流，避免瞬时压满HIS；
         * - 失败患者只做标记，阶段结束后按原患者顺序进入右侧基本信息串行兜底。
         */
        let nextSummaryIndex = 0;
        let completedSummaryCount = 0;
        const summaryWorkerCount = Math.max(
            1,
            Math.min(SUMMARY_FEE_CONCURRENCY, rows.length)
        );

        async function runFeeWorker() {
            while (true) {
                const index = nextSummaryIndex;
                nextSummaryIndex += 1;
                if (index >= rows.length) return;

                const row = rows[index];
                let requested = false;
                if (Number.isFinite(row.fee)) {
                    /* 8997已提供实时费用时不再重复逐患者请求8003。 */
                } else if (row.admissionNo) {
                    requested = true;
                    try {
                        const info = await requestBedFee(row.admissionNo);
                        row.admissionNo = info.admissionNo || row.admissionNo;
                        row.fee = info.fee;
                        row.source = '8003';
                    } catch (error) {
                        row._ohaSummaryNeedsPanel = true;
                    }
                } else {
                    row._ohaSummaryNeedsPanel = true;
                }

                completedSummaryCount += 1;
                setProgress(
                    '汇总 ' +
                    completedSummaryCount +
                    '/' +
                    rows.length +
                    '（' +
                    summaryWorkerCount +
                    '路并发）'
                );

                if (requested && SUMMARY_FEE_WORKER_GAP_MS > 0) {
                    await sleep(SUMMARY_FEE_WORKER_GAP_MS);
                }
            }
        }

        await Promise.all(
            Array.from(
                { length: summaryWorkerCount },
                function () {
                    return runFeeWorker();
                }
            )
        );

        const unresolvedPanel = rows.filter(function (row) {
            return row._ohaSummaryNeedsPanel === true;
        });
        rows.forEach(function (row) {
            try { delete row._ohaSummaryNeedsPanel; } catch (ignore) {}
        });

        /* 第二阶段：没有住院号或8003失败时，点击名片读取右侧基本信息。 */
        for (let index = 0; index < unresolvedPanel.length; index += 1) {
            const row = unresolvedPanel[index];
            setProgress('补充信息 ' + (index + 1) + '/' + unresolvedPanel.length);
            try {
                const panel = await resolveByRightPanel(row);
                if (panel) {
                    if (!row.admissionNo && panel.admissionNo) {
                        row.admissionNo = panel.admissionNo;
                    }
                    if (panel.fee !== null) {
                        row.fee = panel.fee;
                        row.source = '基本信息';
                    }
                }

                /* 如果刚由右侧取得住院号但费用仍缺失，再调用8003一次。 */
                if (row.admissionNo && row.fee === null) {
                    try {
                        const info = await requestBedFee(row.admissionNo);
                        row.fee = info.fee;
                        row.source = '8003';
                    } catch (ignore) {}
                }
            } catch (error) {
                console.warn('[住院患者一览汇总] 右侧信息读取失败：', row.name, error);
            }
            await sleep(90);
        }

        if (originalActive && originalActive.isConnected) {
            const originalRow = rows.find(function (row) {
                return row.card === originalActive;
            }) || readCardBase(originalActive);
            activateCard(originalActive, originalRow);
        }

        /* 去掉DOM引用，便于导出/复制和释放页面节点引用。 */
        rows = rows.map(function (row) {
            return {
                admissionNo: row.admissionNo || '',
                bedNo: row.bedNo || '',
                name: row.name || '',
                sex: row.sex || '',
                age: row.age || '',
                hospitalDays: Number.isFinite(row.hospitalDays) ? row.hospitalDays : null,
                diagnosis: normalizeSummaryDiagnosis(row.diagnosis || ''),
                responsibleDoctor: row.responsibleDoctor || '',
                _ohaRealtime8997: row._ohaRealtime8997 === true,
                _oha8997Cached: row._oha8997Cached === true,
                _ohaDrgDoctorFallback: row._ohaDrgDoctorFallback === true,
                _ohaResponsibleDoctorSource: row._ohaResponsibleDoctorSource || '',
                fee: Number.isFinite(row.fee) ? row.fee : null,
                source: row.source || ''
            };
        });

        /* 默认按床号自然顺序展示。 */
        rows.sort(function (a, b) {
            return String(a.bedNo || '').localeCompare(
                String(b.bedNo || ''),
                'zh-CN',
                { numeric: true }
            );
        });
        return rows;
    }

    /* ==============================================================
       汇总弹窗与可视化
       ============================================================== */

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${BUTTON_ID}{
    position:static!important;height:34px!important;min-width:88px!important;padding:0 13px!important;
    margin:0 0 0 12px!important;border:0!important;border-radius:3px!important;
    background:#159bd3!important;color:#fff!important;font-size:13px!important;
    line-height:34px!important;cursor:pointer!important;box-shadow:none!important;
    vertical-align:middle!important;white-space:nowrap!important;z-index:auto!important;
    display:inline-block!important;box-sizing:border-box!important;
}
#${BUTTON_ID}:hover{background:#118bc0!important;}
#${BUTTON_ID}:disabled{opacity:.62!important;cursor:not-allowed!important;}
#${OVERLAY_ID}{
    position:fixed;inset:0;z-index:2147483600;background:rgba(19,34,47,.46);
    display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;
    font-family:"Microsoft YaHei",Arial,sans-serif;
}
#${OVERLAY_ID} *{box-sizing:border-box;}
#${OVERLAY_ID} .oha-summary-modal{
    width:min(1180px,96vw);height:min(820px,94vh);background:#f6f9fb;border-radius:8px;
    overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.32);display:flex;flex-direction:column;
}
#${OVERLAY_ID} .oha-summary-head{
    height:48px;min-height:48px;background:#159bd3;color:#fff;display:flex;align-items:center;
    padding:0 16px;font-size:16px;font-weight:600;
}
#${OVERLAY_ID} .oha-summary-head .spacer{flex:1;}
#${OVERLAY_ID} .oha-summary-head button{
    border:0;background:transparent;color:#fff;font-size:24px;cursor:pointer;width:36px;height:36px;
}
#${OVERLAY_ID} .oha-summary-body{padding:14px;overflow:auto;flex:1;}
#${OVERLAY_ID} .oha-summary-cards{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-bottom:12px;}
#${OVERLAY_ID} .oha-kpi{background:#fff;border:1px solid #e5edf2;border-radius:6px;padding:11px 13px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
#${OVERLAY_ID} .oha-kpi .label{font-size:12px;color:#7b8b98;margin-bottom:6px;}
#${OVERLAY_ID} .oha-kpi .value{font-size:22px;color:#163b50;font-weight:600;white-space:nowrap;}
#${OVERLAY_ID} .oha-viz-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
#${OVERLAY_ID} .oha-panel{background:#fff;border:1px solid #e5edf2;border-radius:6px;padding:12px;}
#${OVERLAY_ID} .oha-panel-title{font-size:13px;font-weight:600;color:#284b5f;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
#${OVERLAY_ID} .oha-bar-row{display:grid;grid-template-columns:minmax(92px,170px) 1fr auto;gap:8px;align-items:center;margin:7px 0;font-size:12px;color:#455b67;}
#${OVERLAY_ID} .oha-bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#${OVERLAY_ID} .oha-bar-track{height:10px;border-radius:6px;background:#edf4f7;overflow:hidden;}
#${OVERLAY_ID} .oha-bar-fill{height:100%;min-width:2px;border-radius:6px;background:#44a8d2;}
#${OVERLAY_ID} .oha-bar-value{font-variant-numeric:tabular-nums;color:#61747f;white-space:nowrap;}
#${OVERLAY_ID} .oha-table-wrap{background:#fff;border:1px solid #e5edf2;border-radius:6px;overflow:auto;max-height:390px;}
#${OVERLAY_ID} table{width:100%;border-collapse:collapse;font-size:12px;table-layout:auto;}
#${OVERLAY_ID} th{position:sticky;top:0;z-index:2;background:#edf7fb;color:#274a5c;font-weight:600;border-bottom:1px solid #d5e6ed;padding:8px 9px;text-align:left;white-space:nowrap;}
#${OVERLAY_ID} th.oha-sortable{cursor:pointer;user-select:none;}
#${OVERLAY_ID} th.oha-sortable:hover{background:#e2f2f8;}
#${OVERLAY_ID} .oha-sort-arrow{display:inline-block;min-width:12px;margin-left:3px;color:#7c99a7;font-size:11px;}
#${OVERLAY_ID} th.oha-sort-active .oha-sort-arrow{color:#1189b9;font-weight:700;}
#${OVERLAY_ID} .oha-diagnosis-th{min-width:190px;}
#${OVERLAY_ID} .oha-diagnosis-head{display:flex;align-items:center;gap:6px;}
#${OVERLAY_ID} .oha-diagnosis-filter{width:158px;height:25px;border:1px solid #bed4de;border-radius:3px;background:#fff;color:#35505e;padding:0 24px 0 6px;font-size:11px;outline:none;cursor:pointer;}
#${OVERLAY_ID} .oha-diagnosis-filter:focus{border-color:#42a4ce;box-shadow:0 0 0 1px rgba(66,164,206,.12);}
#${OVERLAY_ID} .oha-detail-count{font-size:11px;font-weight:400;color:#7a8f9a;}
#${OVERLAY_ID} td{padding:8px 9px;border-bottom:1px solid #eef2f4;color:#364d59;vertical-align:top;}
#${OVERLAY_ID} tbody tr:hover td{background:#f7fbfd;}
#${OVERLAY_ID} .nowrap{white-space:nowrap;}
#${OVERLAY_ID} .money{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
#${OVERLAY_ID} .oha-empty{color:#9aa9b1;}
#${OVERLAY_ID} .oha-summary-foot{
    min-height:52px;background:#fff;border-top:1px solid #e1e8ec;display:flex;align-items:center;
    padding:8px 14px;gap:8px;
}
#${OVERLAY_ID} .oha-summary-foot .status{font-size:12px;color:#71838d;flex:1;min-width:100px;}
#${OVERLAY_ID} .oha-summary-foot button{
    height:32px;padding:0 13px;border-radius:4px;border:1px solid #bcd5e0;background:#f5fbfd;
    color:#117fac;cursor:pointer;font-size:12px;
}
#${OVERLAY_ID} .oha-summary-foot button.primary{background:#159bd3;border-color:#159bd3;color:#fff;}
#${OVERLAY_ID} .oha-summary-foot button:hover{filter:brightness(.97);}
@media(max-width:760px){
    #${OVERLAY_ID}{padding:6px;}
    #${OVERLAY_ID} .oha-summary-modal{width:99vw;height:97vh;}
    #${OVERLAY_ID} .oha-summary-cards{grid-template-columns:1fr 1fr;}
    #${OVERLAY_ID} .oha-viz-grid{grid-template-columns:1fr;}
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    function diagnosisStats(rows) {
        const map = new Map();
        rows.forEach(function (row) {
            const key = text(row.diagnosis) || '未识别';
            map.set(key, (map.get(key) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(function (entry) { return { label: entry[0], value: entry[1] }; })
            .sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label, 'zh-CN'); })
            .slice(0, 8);
    }

    function feeTopRows(rows) {
        return rows
            .filter(function (row) { return Number.isFinite(row.fee); })
            .slice()
            .sort(function (a, b) { return b.fee - a.fee; })
            .slice(0, 5)
            .map(function (row) {
                return {
                    label: (row.bedNo ? row.bedNo + '床 ' : '') + (row.name || '未识别'),
                    value: row.fee
                };
            });
    }

    function barRowsHtml(items, formatter) {
        if (!items.length) {
            return '<div class="oha-empty" style="font-size:12px;padding:8px 0;">暂无可展示数据</div>';
        }
        const max = Math.max.apply(null, items.map(function (item) { return Number(item.value) || 0; }).concat([1]));
        return items.map(function (item) {
            const percent = Math.max(2, Math.min(100, (Number(item.value) || 0) / max * 100));
            return '<div class="oha-bar-row">' +
                '<div class="oha-bar-label" title="' + escapeHtml(item.label) + '">' + escapeHtml(item.label) + '</div>' +
                '<div class="oha-bar-track"><div class="oha-bar-fill" style="width:' + percent.toFixed(1) + '%"></div></div>' +
                '<div class="oha-bar-value">' + escapeHtml(formatter(item.value)) + '</div>' +
                '</div>';
        }).join('');
    }

    function normalizeDiagnosisFilter(value) {
        return text(value).toLowerCase();
    }

    function diagnosisFilterOptions(rows) {
        const counts = new Map();
        let emptyCount = 0;
        (rows || []).forEach(function (row) {
            const diagnosis = text(row && row.diagnosis);
            if (!diagnosis) {
                emptyCount += 1;
                return;
            }
            counts.set(diagnosis, (counts.get(diagnosis) || 0) + 1);
        });

        const options = Array.from(counts.entries()).map(function (entry) {
            return { value: entry[0], count: entry[1] };
        });
        options.sort(function (a, b) {
            return b.count - a.count || a.value.localeCompare(b.value, 'zh-CN');
        });
        if (emptyCount > 0) options.push({ value: '__EMPTY__', count: emptyCount, label: '未识别' });
        return options;
    }

    function diagnosisSelectOptionsHtml(rows) {
        const options = diagnosisFilterOptions(rows);
        let html = '<option value="">全部主诊断（' + (rows || []).length + '）</option>';
        options.forEach(function (item) {
            const label = item.label || item.value;
            html += '<option value="' + escapeHtml(item.value) + '">' +
                escapeHtml(label) + '（' + item.count + '）</option>';
        });
        return html;
    }

    function compareTableRows(a, b, key, direction) {
        const dir = direction === 'desc' ? -1 : 1;
        if (key === 'bedNo') {
            const av = text(a.bedNo);
            const bv = text(b.bedNo);
            if (!av && !bv) return 0;
            if (!av) return 1;
            if (!bv) return -1;
            return av.localeCompare(bv, 'zh-CN', { numeric: true }) * dir;
        }

        const av = Number.isFinite(a[key]) ? a[key] : null;
        const bv = Number.isFinite(b[key]) ? b[key] : null;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
    }

    function extNormalizeManualFilterList(values, kind) {
        const input = Array.isArray(values) ? values : [];
        const seen = new Set();
        const result = [];
        input.forEach(function (value) {
            let current = kind === 'admissionNo'
                ? (normalizeAdmissionNo(value) || compact(value))
                : compact(value);
            if (!current || seen.has(current)) return;
            seen.add(current);
            result.push(current);
        });
        return result;
    }

    function extParseManualFilterText(value, kind) {
        return extNormalizeManualFilterList(
            String(value == null ? '' : value)
                .split(/[\r\n,，;；]+/)
                .map(function (item) { return item.trim(); })
                .filter(Boolean),
            kind
        );
    }

    function getCurrentTableRows() {
        const selectedDiagnosis = tableViewState.diagnosis || '';
        const selectedDoctor = tableViewState.responsibleDoctor || '';
        const selectedDrgGroup = tableViewState.drgGroup || '';
        const nameFilters = extNormalizeManualFilterList(tableViewState.patientNames || [], 'name');
        const admissionFilters = extNormalizeManualFilterList(tableViewState.admissionNos || [], 'admissionNo');

        const rows = lastRows.filter(function (row) {
            const diagnosis = text(row && row.diagnosis);
            if (selectedDiagnosis) {
                if (selectedDiagnosis === '__EMPTY__') {
                    if (diagnosis) return false;
                } else if (diagnosis !== selectedDiagnosis) {
                    return false;
                }
            }

            const doctor = text(row && row.responsibleDoctor);
            if (selectedDoctor) {
                if (selectedDoctor === '__EMPTY__') {
                    if (doctor) return false;
                } else if (doctor !== selectedDoctor) {
                    return false;
                }
            }

            const drgGroup = text(row && row.drgGroup);
            if (selectedDrgGroup) {
                if (selectedDrgGroup === '__EMPTY__') {
                    if (drgGroup) return false;
                } else if (drgGroup !== selectedDrgGroup) {
                    return false;
                }
            }

            if (nameFilters.length) {
                const name = compact(row && row.name);
                if (!nameFilters.includes(name)) return false;
            }

            if (admissionFilters.length) {
                const admissionNo = normalizeAdmissionNo(row && row.admissionNo) || compact(row && row.admissionNo);
                if (!admissionFilters.includes(admissionNo)) return false;
            }

            return true;
        });
        rows.sort(function (a, b) {
            return compareTableRows(a, b, tableViewState.sortKey, tableViewState.sortDirection);
        });
        return rows;
    }

    function sortArrowHtml(key) {
        if (tableViewState.sortKey !== key) return '↕';
        return tableViewState.sortDirection === 'asc' ? '▲' : '▼';
    }

    function updateTableView(overlay) {
        if (!overlay) overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;
        const tbody = overlay.querySelector('.oha-detail-tbody');
        if (!tbody) return;

        currentViewRows = getCurrentTableRows();
        tbody.innerHTML = tableRowsHtml(currentViewRows);

        const count = overlay.querySelector('.oha-detail-count');
        if (count) {
            count.textContent = '显示 ' + currentViewRows.length + ' / ' + lastRows.length + ' 名';
        }

        overlay.querySelectorAll('th.oha-sortable').forEach(function (th) {
            const key = th.getAttribute('data-sort-key') || '';
            th.classList.toggle('oha-sort-active', key === tableViewState.sortKey);
            const arrow = th.querySelector('.oha-sort-arrow');
            if (arrow) arrow.textContent = sortArrowHtml(key);
        });
    }

    function bindTableControls(overlay) {
        const diagnosisSelect = overlay.querySelector('.oha-diagnosis-filter');
        if (diagnosisSelect) {
            diagnosisSelect.value = tableViewState.diagnosis || '';
            diagnosisSelect.addEventListener('change', function () {
                tableViewState.diagnosis = diagnosisSelect.value || '';
                updateTableView(overlay);
            });
            diagnosisSelect.addEventListener('click', function (event) {
                event.stopPropagation();
            });
        }

        const doctorSelect = overlay.querySelector('.oha-responsible-filter');
        if (doctorSelect) {
            doctorSelect.value = tableViewState.responsibleDoctor || '';
            doctorSelect.addEventListener('change', function () {
                tableViewState.responsibleDoctor = doctorSelect.value || '';
                updateTableView(overlay);
            });
            doctorSelect.addEventListener('click', function (event) {
                event.stopPropagation();
            });
        }

        const drgGroupSelect = overlay.querySelector('.oha-drg-group-filter');
        if (drgGroupSelect) {
            drgGroupSelect.value = tableViewState.drgGroup || '';
            drgGroupSelect.addEventListener('change', function () {
                tableViewState.drgGroup = drgGroupSelect.value || '';
                updateTableView(overlay);
            });
            drgGroupSelect.addEventListener('click', function (event) {
                event.stopPropagation();
            });
        }

        overlay.querySelectorAll('.oha-manual-filter-btn').forEach(function (button) {
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                extOpenManualFilterEditor(overlay, button.getAttribute('data-filter-kind') || '');
            });
        });
        extUpdateManualFilterButtons(overlay);

        overlay.querySelectorAll('th.oha-sortable').forEach(function (th) {
            th.addEventListener('click', function (event) {
                if (event && event.target && event.target.closest && event.target.closest('.oha-col-resizer')) return;
                const key = th.getAttribute('data-sort-key');
                if (!key) return;
                if (tableViewState.sortKey === key) {
                    tableViewState.sortDirection = tableViewState.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    tableViewState.sortKey = key;
                    tableViewState.sortDirection = 'asc';
                }
                updateTableView(overlay);
            });
        });
    }

    function responsibleDoctorSelectOptionsHtml(rows) {
        const counts = new Map();
        let emptyCount = 0;
        (rows || []).forEach(function (row) {
            const doctor = text(row && row.responsibleDoctor);
            if (!doctor) {
                emptyCount += 1;
                return;
            }
            counts.set(doctor, (counts.get(doctor) || 0) + 1);
        });

        let html = '<option value="">全部责任医师（' + (rows || []).length + '）</option>';
        Array.from(counts.entries()).sort(function (a, b) {
            return a[0].localeCompare(b[0], 'zh-CN');
        }).forEach(function (entry) {
            html += '<option value="' + escapeHtml(entry[0]) + '">' +
                escapeHtml(entry[0]) + '（' + entry[1] + '）</option>';
        });
        if (emptyCount > 0) {
            html += '<option value="__EMPTY__">未设置责任医师（' + emptyCount + '）</option>';
        }
        return html;
    }

    function drgGroupSelectOptionsHtml(rows) {
        const counts = new Map();
        let emptyCount = 0;
        (rows || []).forEach(function (row) {
            const group = text(row && row.drgGroup);
            if (!group) {
                emptyCount += 1;
                return;
            }
            counts.set(group, (counts.get(group) || 0) + 1);
        });

        let html = '<option value="">全部DRG分组（' + (rows || []).length + '）</option>';
        Array.from(counts.entries()).sort(function (a, b) {
            return a[0].localeCompare(b[0], 'zh-CN', { numeric: true });
        }).forEach(function (entry) {
            html += '<option value="' + escapeHtml(entry[0]) + '">' +
                escapeHtml(entry[0]) + '（' + entry[1] + '）</option>';
        });
        if (emptyCount > 0) {
            html += '<option value="__EMPTY__">未设置DRG分组（' + emptyCount + '）</option>';
        }
        return html;
    }

    function extManualFilterState(kind) {
        if (kind === 'name') {
            return {
                title: '患者姓名 · 手动筛选',
                description: '每行填写一个患者姓名；也支持逗号或分号分隔。留空表示不过滤。',
                values: tableViewState.patientNames || [],
                placeholder: '例如：\n张三\n李四'
            };
        }
        return {
            title: '住院号 · 手动筛选',
            description: '每行填写一个住院号；也支持逗号或分号分隔。留空表示不过滤。',
            values: tableViewState.admissionNos || [],
            placeholder: '例如：\n80568\n80601'
        };
    }

    function extManualFilterPreviewValues(kind) {
        const seen = new Set();
        const result = [];

        /*
         * v1.3.15：预览不再直接遍历原始 lastRows。
         * 统一读取 getCurrentTableRows()，使预览与患者关联明细当前视图完全同序：
         * - 床号 / 住院天数 / 总费用排序会同步改变预览顺序；
         * - 责任医师、主诊断、DRG分组及姓名/住院号筛选也会同步反映；
         * - 二级界面打开时按“此刻”的表格状态重新计算，不依赖旧预览缓存。
         */
        const previewRows = getCurrentTableRows();

        previewRows.forEach(function (row) {
            let value = '';
            if (kind === 'name') {
                value = compact(row && row.name);
            } else {
                value = normalizeAdmissionNo(row && row.admissionNo) || compact(row && row.admissionNo);
            }
            if (!value || seen.has(value)) return;
            seen.add(value);
            result.push(value);
        });
        return result;
    }

    function extUpdateManualFilterButtons(overlay) {
        if (!overlay) return;
        overlay.querySelectorAll('.oha-manual-filter-btn').forEach(function (button) {
            const kind = button.getAttribute('data-filter-kind') || '';
            const values = kind === 'name'
                ? extNormalizeManualFilterList(tableViewState.patientNames || [], 'name')
                : extNormalizeManualFilterList(tableViewState.admissionNos || [], 'admissionNo');
            button.classList.toggle('active', values.length > 0);
            button.textContent = values.length ? '筛选 ' + values.length : '筛选';
            button.title = values.length
                ? ('已启用 ' + values.length + ' 项手动筛选，点击编辑')
                : '点击打开二级视窗手动编辑筛选项';
        });
    }

    function extOpenManualFilterEditor(overlay, kind) {
        if (!overlay || (kind !== 'name' && kind !== 'admissionNo')) return;
        const old = overlay.querySelector('.oha-manual-filter-mask');
        if (old) old.remove();

        const state = extManualFilterState(kind);
        const previewValues = extManualFilterPreviewValues(kind);
        const previewTitle = kind === 'name' ? '当前患者姓名预览' : '当前住院号预览';
        const mask = document.createElement('div');
        mask.className = 'oha-manual-filter-mask';
        mask.innerHTML = `
<div class="oha-manual-filter-dialog" role="dialog" aria-modal="true">
    <div class="oha-manual-filter-head">
        <span>${escapeHtml(state.title)}</span>
        <button type="button" class="oha-manual-filter-close" title="关闭">×</button>
    </div>
    <div class="oha-manual-filter-body">
        <div class="oha-manual-filter-tip">${escapeHtml(state.description)}</div>
        <div class="oha-manual-filter-preview-title">${escapeHtml(previewTitle)}（${previewValues.length} 项，一行一个）</div>
        <textarea class="oha-manual-filter-preview" readonly aria-label="${escapeHtml(previewTitle)}">${escapeHtml(previewValues.join('\n'))}</textarea>
        <div class="oha-manual-filter-edit-title">筛选条件</div>
        <textarea class="oha-manual-filter-textarea" placeholder="${escapeHtml(state.placeholder)}">${escapeHtml((state.values || []).join('\n'))}</textarea>
    </div>
    <div class="oha-manual-filter-foot">
        <button type="button" class="oha-manual-filter-clear">清空筛选</button>
        <span class="spacer"></span>
        <button type="button" class="oha-manual-filter-cancel">取消</button>
        <button type="button" class="oha-manual-filter-apply primary">应用筛选</button>
    </div>
</div>`;
        overlay.appendChild(mask);

        const close = function () {
            if (mask.isConnected) mask.remove();
        };
        mask.querySelector('.oha-manual-filter-close').addEventListener('click', close);
        mask.querySelector('.oha-manual-filter-cancel').addEventListener('click', close);
        mask.addEventListener('click', function (event) {
            if (event.target === mask) close();
        });

        mask.querySelector('.oha-manual-filter-clear').addEventListener('click', function () {
            if (kind === 'name') tableViewState.patientNames = [];
            else tableViewState.admissionNos = [];
            updateTableView(overlay);
            extUpdateManualFilterButtons(overlay);
            close();
        });

        mask.querySelector('.oha-manual-filter-apply').addEventListener('click', function () {
            const raw = mask.querySelector('.oha-manual-filter-textarea').value || '';
            const values = extParseManualFilterText(raw, kind);
            if (kind === 'name') tableViewState.patientNames = values;
            else tableViewState.admissionNos = values;
            updateTableView(overlay);
            extUpdateManualFilterButtons(overlay);
            close();
        });

        const textarea = mask.querySelector('.oha-manual-filter-textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    function tableRowsHtml(rows) {
        return rows.map(function (row, index) {
            return '<tr>' +
                '<td class="nowrap">' + (index + 1) + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.admissionNo || '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.bedNo ? row.bedNo + '床' : '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.name || '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.sex || '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.age ? row.age + '岁' : '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(Number.isFinite(row.hospitalDays) ? row.hospitalDays + '天' : '—') + '</td>' +
                '<td title="' + escapeHtml(row.diagnosis || '') + '">' + escapeHtml(row.diagnosis || '—') + '</td>' +
                '<td class="money">' + escapeHtml(Number.isFinite(row.fee) ? formatMoney(row.fee) : '—') + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderSummary(rows, statusText) {
        ensureStyle();
        closeSummary();
        lastRows = rows.slice();
        currentViewRows = null;
        tableViewState = { diagnosis: '', responsibleDoctor: '', drgGroup: '', patientNames: [], admissionNos: [], sortKey: 'bedNo', sortDirection: 'asc' };

        const feeRows = rows.filter(function (row) { return Number.isFinite(row.fee); });
        const totalFee = feeRows.reduce(function (sum, row) { return sum + row.fee; }, 0);
        const averageFee = feeRows.length ? totalFee / feeRows.length : null;
        const dayRows = rows.filter(function (row) { return Number.isFinite(row.hospitalDays); });
        const averageDays = dayRows.length
            ? dayRows.reduce(function (sum, row) { return sum + row.hospitalDays; }, 0) / dayRows.length
            : null;

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = `
<div class="oha-summary-modal" role="dialog" aria-modal="true">
    <div class="oha-summary-head">
        <span>住院患者一览 · 当前页汇总</span>
        <span class="spacer"></span>
        <button type="button" class="oha-summary-close" title="关闭">×</button>
    </div>
    <div class="oha-summary-body">
        <div class="oha-summary-cards">
            <div class="oha-kpi"><div class="label">当前显示患者</div><div class="value">${rows.length}</div></div>
            <div class="oha-kpi"><div class="label">当前页总费用</div><div class="value">${feeRows.length ? '¥' + formatMoney(totalFee) : '--'}</div></div>
            <div class="oha-kpi"><div class="label">人均费用</div><div class="value">${Number.isFinite(averageFee) ? '¥' + formatMoney(averageFee) : '--'}</div></div>
            <div class="oha-kpi"><div class="label">平均住院日</div><div class="value">${Number.isFinite(averageDays) ? averageDays.toFixed(1) + ' 天' : '--'}</div></div>
        </div>

        <div class="oha-viz-grid">
            <div class="oha-panel">
                <div class="oha-panel-title">费用 Top 5</div>
                ${barRowsHtml(feeTopRows(rows), function (value) { return '¥' + formatMoney(value); })}
            </div>
            <div class="oha-panel">
                <div class="oha-panel-title">主诊断分布（前 8 项）</div>
                ${barRowsHtml(diagnosisStats(rows), function (value) { return String(value) + '人'; })}
            </div>
        </div>

        <div class="oha-panel-title">患者关联明细 <span class="oha-detail-count">显示 ${rows.length} / ${rows.length} 名</span></div>
        <div class="oha-table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>住院号</th>
                        <th class="oha-sortable oha-sort-active" data-sort-key="bedNo" title="点击按床号排序">床号 <span class="oha-sort-arrow">▲</span></th>
                        <th>患者姓名</th><th>性别</th><th>年龄</th>
                        <th class="oha-sortable" data-sort-key="hospitalDays" title="点击按住院天数排序">住院天数 <span class="oha-sort-arrow">↕</span></th>
                        <th class="oha-diagnosis-th"><div class="oha-diagnosis-head"><span>主诊断</span><select class="oha-diagnosis-filter" title="按当前汇总中已有的主诊断筛选">${diagnosisSelectOptionsHtml(rows)}</select></div></th>
                        <th class="oha-sortable" data-sort-key="fee" style="text-align:right;" title="点击按总费用排序">总费用（元） <span class="oha-sort-arrow">↕</span></th>
                    </tr>
                </thead>
                <tbody class="oha-detail-tbody">${tableRowsHtml(rows)}</tbody>
            </table>
        </div>
    </div>
    <div class="oha-summary-foot">
        <div id="${SCRIPT_PREFIX}-progress" class="status">${escapeHtml(statusText || ('已汇总当前页 ' + rows.length + ' 名可见患者'))}</div>
        <button type="button" class="oha-reset-layout" title="清除已保存的列宽并恢复默认布局">重置布局</button>
        <button type="button" class="oha-copy">复制表格</button>
        <button type="button" class="oha-export">导出CSV</button>
        <button type="button" class="oha-refresh-summary primary">重新汇总</button>
        <button type="button" class="oha-summary-close">关闭</button>
    </div>
</div>`;

        document.body.appendChild(overlay);
        overlay.querySelectorAll('.oha-summary-close').forEach(function (button) {
            button.addEventListener('click', closeSummary);
        });
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeSummary();
        });
        const resetLayoutButton = overlay.querySelector('.oha-reset-layout');
        if (resetLayoutButton) {
            resetLayoutButton.addEventListener('click', function () {
                extResetTableColumnWidths(overlay);
            });
        }
        overlay.querySelector('.oha-copy').addEventListener('click', copySummaryTable);
        overlay.querySelector('.oha-export').addEventListener('click', exportSummaryCsv);
        overlay.querySelector('.oha-refresh-summary').addEventListener('click', runSummary);
        bindTableControls(overlay);
        updateTableView(overlay);
    }

    function showLoadingModal() {
        ensureStyle();
        closeSummary();
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = `
<div class="oha-summary-modal" style="width:min(560px,92vw);height:auto;min-height:180px;">
    <div class="oha-summary-head"><span>住院患者一览 · 当前页汇总</span><span class="spacer"></span><button type="button" class="oha-summary-close">×</button></div>
    <div class="oha-summary-body" style="display:flex;align-items:center;justify-content:center;min-height:110px;">
        <div style="text-align:center;color:#536a76;">
            <div style="font-size:15px;margin-bottom:10px;">正在读取当前筛选后可见患者信息…</div>
            <div id="${SCRIPT_PREFIX}-progress" style="font-size:13px;color:#159bd3;">准备中</div>
        </div>
    </div>
</div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.oha-summary-close').addEventListener('click', function () {
            if (!summaryRunning) closeSummary();
        });
    }

    function closeSummary() {
        const old = document.getElementById(OVERLAY_ID);
        if (old) {
            const watcher = old._ohaAutoLayoutWatcher;
            if (watcher) {
                if (watcher.observer) watcher.observer.disconnect();
                if (watcher.frame) window.cancelAnimationFrame(watcher.frame);
            }
            old.remove();
        }
    }

    function summaryText(rows) {
        const header = ['住院号', '床号', '患者姓名', '性别', '年龄', '住院天数', '主诊断', '总费用'];
        const lines = [header.join('\t')];
        rows.forEach(function (row) {
            lines.push([
                row.admissionNo || '',
                row.bedNo ? row.bedNo + '床' : '',
                row.name || '',
                row.sex || '',
                row.age ? row.age + '岁' : '',
                Number.isFinite(row.hospitalDays) ? row.hospitalDays + '天' : '',
                row.diagnosis || '',
                Number.isFinite(row.fee) ? row.fee.toFixed(2) : ''
            ].join('\t'));
        });
        return lines.join('\n');
    }

    function copyText(value) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(value);
        }
        return new Promise(function (resolve, reject) {
            const area = document.createElement('textarea');
            area.value = value;
            area.style.position = 'fixed';
            area.style.left = '-10000px';
            document.body.appendChild(area);
            area.select();
            try {
                const ok = document.execCommand('copy');
                area.remove();
                ok ? resolve() : reject(new Error('复制失败'));
            } catch (error) {
                area.remove();
                reject(error);
            }
        });
    }

    function copySummaryTable() {
        const rows = Array.isArray(currentViewRows) ? currentViewRows : lastRows;
        copyText(summaryText(rows)).then(function () {
            setProgress('已复制当前汇总表格');
        }).catch(function (error) {
            setProgress('复制失败：' + String(error && error.message || error));
        });
    }

    function csvCell(value) {
        const current = String(value == null ? '' : value);
        return '"' + current.replace(/"/g, '""') + '"';
    }

    function exportSummaryCsv() {
        const header = ['住院号', '床号', '患者姓名', '性别', '年龄', '住院天数', '主诊断', '总费用'];
        const lines = [header.map(csvCell).join(',')];
        const rows = Array.isArray(currentViewRows) ? currentViewRows : lastRows;
        rows.forEach(function (row) {
            lines.push([
                row.admissionNo || '',
                row.bedNo ? row.bedNo + '床' : '',
                row.name || '',
                row.sex || '',
                row.age ? row.age + '岁' : '',
                Number.isFinite(row.hospitalDays) ? row.hospitalDays + '天' : '',
                row.diagnosis || '',
                Number.isFinite(row.fee) ? row.fee.toFixed(2) : ''
            ].map(csvCell).join(','));
        });

        const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
            type: 'text/csv;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const stamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            '_',
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0')
        ].join('');
        link.href = url;
        link.download = '住院患者当前页汇总_' + stamp + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        setProgress('CSV已导出');
    }

    /* ==============================================================
       汇总缓存：在同一标签页中复用当前可见患者的汇总快照。
       患者名单、筛选结果或分页改变时，自动重新提取；“重新汇总”始终强制刷新。
       缓存仅在内存保存，不将住院号、姓名、费用等患者信息落盘。
       ============================================================== */

    function summaryPageSignature() {
        /* 只检查患者身份，不读取8003费用接口，也不触发患者名片点击。 */
        const identities = getVisiblePatientCards().map(function (card) {
            return [
                normalizeBed(getCardBedNo(card)),
                compact(findPatientName(card)),
                normalizeAdmissionNo(getCardAdmissionNo(card))
            ].join('|');
        }).sort();
        return JSON.stringify([
            location.pathname,
            location.search,
            location.hash,
            identities
        ]);
    }

    function openSummary() {
        if (!extFeatureRuntimeEnabled) return;
        if (summaryRunning || document.getElementById(OVERLAY_ID)) return;
        const signature = summaryPageSignature();
        if (summaryCache && summaryCache.signature === signature && summaryCache.rows.length) {
            /* renderSummary 将重算本地DRG设置及责任医师，保持同步设置实时生效。 */
            const cachedRows = summaryCache.rows.map(function (row) {
                return Object.assign({}, row);
            });
            const stamp = new Date(summaryCache.updatedAt).toLocaleString('zh-CN', { hour12: false });
            renderSummary(cachedRows,
                '已读取缓存（' + stamp + '，' + cachedRows.length + ' 名）；费用等信息截至缓存时间，点击“重新汇总”获取最新数据'
            );
            return;
        }
        /* 没有缓存或当前页患者发生变化时，执行首次/增量外的完整提取。 */
        runSummary();
    }

    async function runSummary() {
        if (!extFeatureRuntimeEnabled || summaryRunning) return;
        summaryRunning = true;
        extLastDoctorSync = { signature: '', rows: [] };

        const button = document.getElementById(BUTTON_ID);
        const oldText = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = '汇总中…';
        }
        /* 在调用接口前记录当前可见患者，防止首次汇总后复用到别的分页。 */
        const cacheSignature = summaryPageSignature();
        showLoadingModal();

        try {
            const rows = await buildSummaryRows();
            if (!extFeatureRuntimeEnabled) {
                closeSummary();
                return;
            }
            const missingAdmission = rows.filter(function (row) { return !row.admissionNo; }).length;
            const missingFee = rows.filter(function (row) { return !Number.isFinite(row.fee); }).length;
            const missingDiagnosis = rows.filter(function (row) { return !row.diagnosis; }).length;
            const notes = ['已汇总当前页 ' + rows.length + ' 名可见患者'];
            if (directLastSummaryMeta.success) {
                notes.push(
                    (directLastSummaryMeta.cached ? '8997缓存匹配 ' : '8997实时匹配 ') + directLastSummaryMeta.matched + '/' + rows.length + ' 名'
                );
                if (directLastSummaryMeta.doctorFallbackMatched > 0) {
                    notes.push(
                        '未匹配患者责任医师由' +
                        (directLastSummaryMeta.doctorFallbackSource || 'DRG助手') +
                        '补充 ' + directLastSummaryMeta.doctorFallbackFilled + ' 名'
                    );
                }
            } else if (directLastSummaryMeta.attempted) {
                if (directLastSummaryMeta.doctorFallbackMatched > 0) {
                    notes.push(
                        '8997不可用；责任医师已回退' +
                        (directLastSummaryMeta.doctorFallbackSource || 'DRG助手') +
                        '（识别 ' + directLastSummaryMeta.doctorFallbackFilled + ' 名）；其余字段继续8003/页面'
                    );
                } else {
                    notes.push('8997不可用；责任医师无可靠兜底已留空；其余字段继续8003/页面');
                }
            }
            if (missingAdmission) notes.push('住院号未识别 ' + missingAdmission + ' 名');
            if (missingFee) notes.push('费用未识别 ' + missingFee + ' 名');
            if (missingDiagnosis) notes.push('主诊断未识别 ' + missingDiagnosis + ' 名');
            renderSummary(rows, notes.join('；'));
            /* 仅成功汇总后覆盖缓存；之后重复打开不再逐一点击名片或请求8003。 */
            summaryCache = {
                signature: cacheSignature,
                updatedAt: Date.now(),
                rows: rows.map(function (row) { return Object.assign({}, row); })
            };
        } catch (error) {
            closeSummary();
            window.alert('汇总失败：' + String(error && error.message || error));
        } finally {
            summaryRunning = false;
            if (button) {
                button.disabled = false;
                button.textContent = oldText || '汇总信息';
            }
        }
    }

    /* ==============================================================
       按钮：插在原生刷新按钮左侧
       ============================================================== */

    function looksLikeRefreshButton(element) {
        if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
        const value = compact(
            (element.getAttribute('title') || '') + ' ' +
            (element.getAttribute('aria-label') || '') + ' ' +
            (element.innerText || '')
        ).toLowerCase();
        const classText = (
            String(element.className || '') + ' ' +
            Array.from(element.querySelectorAll('i,span,svg')).map(function (child) {
                return String(child.className && child.className.baseVal || child.className || '') + ' ' +
                    String(child.getAttribute && child.getAttribute('class') || '');
            }).join(' ')
        ).toLowerCase();

        if (/刷新|refresh|reload/.test(value)) return true;
        if (/refresh|reload|rotate|sync/.test(classText)) return true;
        return false;
    }

    function findNativeRefreshButton() {
        const all = Array.from(document.querySelectorAll('button,a,[role="button"],input[type="button"]'))
            .filter(looksLikeRefreshButton);
        if (!all.length) return null;

        /* 优先最靠近右上患者筛选区、尺寸接近截图中方形刷新按钮的候选。 */
        all.sort(function (a, b) {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            const aScore = (ar.top < 180 ? 1000 : 0) + ar.left - Math.abs(ar.width - ar.height) * 2;
            const bScore = (br.top < 180 ? 1000 : 0) + br.left - Math.abs(br.width - br.height) * 2;
            return bScore - aScore;
        });
        return all[0];
    }

    function findFilterToolbarAnchor() {
        const input = Array.from(document.querySelectorAll('input')).find(function (element) {
            return /床号/.test(text(element.getAttribute('placeholder') || '')) && isVisible(element);
        });
        if (!input) return null;

        let current = input.parentElement;
        for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
            const rect = current.getBoundingClientRect();
            if (rect.width >= 500 && rect.height <= 100) return current;
        }
        return input.parentElement;
    }

    function createSummaryButton() {
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = '汇总信息';
        button.title = '优先显示本页缓存；首次打开或可见患者变化时重新汇总';
        button.addEventListener('click', openSummary);
        return button;
    }

    function getBedFilterInput(refresh) {
        const candidates = Array.from(document.querySelectorAll('input')).filter(function (element) {
            const placeholder = text(element.getAttribute('placeholder') || '');
            if (!/输入床号|床号/.test(placeholder) || !isVisible(element)) return false;
            const rect = element.getBoundingClientRect();
            /* 工具栏床号框在截图中属于正常单行输入框；过滤下拉组件内部的小型/异常输入。 */
            return rect.width >= 70 && rect.width <= 240 && rect.height >= 22 && rect.height <= 46;
        });
        if (!candidates.length) return null;

        const refreshRect = refresh && isVisible(refresh) ? refresh.getBoundingClientRect() : null;
        candidates.sort(function (a, b) {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            function score(r, el) {
                let value = 0;
                const placeholder = text(el.getAttribute('placeholder') || '');
                if (placeholder === '输入床号') value += 2000;
                else if (/输入床号/.test(placeholder)) value += 1600;
                if (refreshRect) {
                    const dy = Math.abs((r.top + r.height / 2) - (refreshRect.top + refreshRect.height / 2));
                    value += Math.max(0, 800 - dy * 40);
                    if (r.left < refreshRect.left) value += 300;
                }
                /* 同条件下优先工具栏更靠右的输入框。 */
                value += r.left / 10;
                return value;
            }
            return score(br, b) - score(ar, a);
        });
        return candidates[0];
    }

    function findBedFilterTrailingControl(input, toolbar) {
        if (!input || !toolbar) return null;
        const inputRect = input.getBoundingClientRect();
        const centerY = inputRect.top + inputRect.height / 2;
        const selectors = 'i,span,a,button,[role="button"],[class*="icon"],[class*="menu"],[class*="list"]';
        const candidates = Array.from(toolbar.querySelectorAll(selectors)).filter(function (element) {
            if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
            if (element === input || element.id === BUTTON_ID) return false;
            if (element.contains(input) || input.contains(element)) return false;
            const rect = element.getBoundingClientRect();
            if (rect.width < 4 || rect.width > 52 || rect.height < 8 || rect.height > 44) return false;
            const elementCenterY = rect.top + rect.height / 2;
            if (Math.abs(elementCenterY - centerY) > 18) return false;
            /* 只找床号框紧邻右侧的小控件，避免误取最右侧刷新键。 */
            if (rect.left < inputRect.right - 8 || rect.left > inputRect.right + 85) return false;
            return true;
        });
        if (!candidates.length) return null;

        candidates.sort(function (a, b) {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            function score(el, rect) {
                const cls = (String(el.className || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
                let value = 0;
                if (/list|menu|bars|table|grid|icon/.test(cls)) value += 200;
                value -= Math.max(0, rect.left - inputRect.right) * 2;
                /* 嵌套图标时优先实际可见的最右边界，便于把按钮放到整个控件后面。 */
                value += rect.right / 1000;
                return value;
            }
            return score(b, br) - score(a, ar);
        });
        return candidates[0];
    }

    function directChildUnder(element, ancestor) {
        if (!element || !ancestor || !ancestor.contains(element)) return null;
        let current = element;
        while (current && current.parentElement && current.parentElement !== ancestor) {
            current = current.parentElement;
        }
        return current && current.parentElement === ancestor ? current : null;
    }

    function chooseFlowInsertionPoint(input, toolbar) {
        if (!input || !toolbar) return null;

        const trailing = findBedFilterTrailingControl(input, toolbar);
        let anchor = trailing || input;

        /*
         * 从床号框/列表图标向外逐层寻找一个“右侧确实有空间”的父容器。
         * 这样不会把按钮硬塞进宽度固定的 input-group 内，也不会依赖 viewport → offsetParent
         * 的坐标换算。优先停在最小可用容器，保证按钮就在红框所示的床号筛选区右侧。
         */
        let child = anchor;
        let parent = child.parentElement;
        while (parent && toolbar.contains(parent)) {
            const pr = parent.getBoundingClientRect();
            const cr = child.getBoundingClientRect();
            const freeRight = pr.right - cr.right;
            const parentStyle = window.getComputedStyle(parent);
            const isHorizontalLayout = /flex|inline|table-row/.test(parentStyle.display) ||
                Array.from(parent.children).some(function (node) {
                    if (!(node instanceof HTMLElement) || node === child || !isVisible(node)) return false;
                    const r = node.getBoundingClientRect();
                    return Math.abs((r.top + r.height / 2) - (cr.top + cr.height / 2)) <= 18;
                });

            if ((freeRight >= 110 && isHorizontalLayout) || parent === toolbar) {
                return { parent: parent, after: child };
            }
            child = parent;
            parent = parent.parentElement;
        }

        const toolbarChild = directChildUnder(anchor, toolbar) || directChildUnder(input, toolbar);
        return toolbarChild ? { parent: toolbar, after: toolbarChild } : { parent: toolbar, after: null };
    }

    function placeSummaryButtonInFlow(button, toolbar, refresh) {
        if (!button || !toolbar || !button.isConnected) return false;

        const input = getBedFilterInput(refresh);
        if (!input) return false;
        const point = chooseFlowInsertionPoint(input, toolbar);
        if (!point || !point.parent) return false;

        const parent = point.parent;
        const after = point.after;
        if (after && after.nextSibling !== button) {
            parent.insertBefore(button, after.nextSibling);
        } else if (!after && button.parentElement !== parent) {
            parent.appendChild(button);
        }

        /*
         * 跟随目标父容器的横向布局习惯，而不是创造一套新的绝对定位体系。
         * 若相邻原生控件使用 float，则按钮也沿用相同 float；flex/inline 布局保持普通 inline-block。
         */
        button.style.position = 'static';
        button.style.left = '';
        button.style.top = '';
        button.style.right = '';
        button.style.bottom = '';
        button.style.transform = '';
        button.style.marginLeft = '12px';
        button.style.marginTop = '0';
        button.style.marginBottom = '0';

        if (after instanceof HTMLElement) {
            const afterStyle = window.getComputedStyle(after);
            const parentStyle = window.getComputedStyle(parent);
            if (afterStyle.cssFloat && afterStyle.cssFloat !== 'none') {
                button.style.cssFloat = afterStyle.cssFloat;
                button.style.display = 'block';
            } else {
                button.style.cssFloat = 'none';
                button.style.display = /flex/.test(parentStyle.display) ? 'inline-flex' : 'inline-block';
                if (/flex/.test(parentStyle.display)) button.style.alignItems = 'center';
            }
        }
        return true;
    }

    function ensureButton() {
        if (!document.body) return false;
        ensureStyle();

        const existing = document.getElementById(BUTTON_ID);
        if (existing && existing.isConnected) {
            const currentToolbar = findFilterToolbarAnchor();
            const currentRefresh = findNativeRefreshButton();
            if (currentToolbar) placeSummaryButtonInFlow(existing, currentToolbar, currentRefresh);
            return true;
        }

        /* 页面必须已经具备患者列表语义，避免在其他8003模块误插按钮。 */
        const hasPatientContext =
            /\/PatientList\/InpatientList(?:[?#]|$)/i.test(location.href) ||
            Boolean(document.querySelector('input[placeholder*="床号"]')) ||
            getVisiblePatientCards().length > 0;
        if (!hasPatientContext) return false;

        const button = createSummaryButton();
        const toolbar = findFilterToolbarAnchor();
        const refresh = findNativeRefreshButton();

        /*
         * v1.3.0：改为真正的 DOM 流式插入。先临时挂到工具栏，再把它移动到
         * “输入床号 + 原生列表图标”之后；不再计算任何 left/top。
         */
        if (toolbar) {
            toolbar.appendChild(button);
            if (placeSummaryButtonInFlow(button, toolbar, refresh)) return true;

            /* 极端兜底：识别不到床号框时，保留为工具栏末尾普通控件。 */
            button.style.position = 'static';
            button.style.marginLeft = '12px';
            button.style.display = 'inline-block';
            return true;
        }
        return false;
    }

    function scan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(function () {
            try {
                ensureButton();
            } catch (error) {
                console.warn('[住院患者一览汇总] 初始化失败：', error);
            }
        }, 120);
    }

    function start() {
        ensureStyle();
        scan();

        const observer = new MutationObserver(function () {
            if (!document.getElementById(BUTTON_ID)) scan();
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        window.addEventListener('hashchange', scan);
        window.addEventListener('popstate', scan);
        window.addEventListener('resize', function () {
            const button = document.getElementById(BUTTON_ID);
            const toolbar = findFilterToolbarAnchor();
            const refresh = findNativeRefreshButton();
            if (button && toolbar) placeSummaryButtonInFlow(button, toolbar, refresh);
        });
    }



    /* ==============================================================
       v1.3.25：8003 -> 8997 医疗管理系统实时患者状态数据源
       ============================================================== */

    function directPatientApiRows(data) {
        if (!data || typeof data !== 'object') return [];
        const candidates = [
            data.data,
            data.rows,
            data.records,
            data.list,
            data.result && data.result.data,
            data.result && data.result.records
        ];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
        }
        return [];
    }

    function directLegacyRequestMedicalManagementPatients() {
        return new Promise(function (resolve, reject) {
            const auth = directReadAuth();
            if (!auth || !String(auth.token || '').trim()) {
                reject(new Error(
                    '尚未捕获医疗管理系统token。请先打开8996“在院患者/责任医师查询”页面并执行一次查询，然后再回到8003测试。'
                ));
                return;
            }

            const payload = directClone(auth.payload) || {};
            payload.pageNum = 1;
            payload.pageSize = 200;
            if (!payload.hospitalArea && auth.hospitalArea) {
                payload.hospitalArea = auth.hospitalArea;
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: DIRECT_PATIENT_API_URL,
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8',
                    'token': String(auth.token)
                },
                data: JSON.stringify(payload),
                anonymous: true,
                timeout: 16000,
                onload: function (response) {
                    if (response.status === 401 || response.status === 403) {
                        reject(new Error(
                            '认证失败（HTTP ' + response.status + '）。token可能已过期，请在8996重新执行一次查询后再试。'
                        ));
                        return;
                    }
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error('HTTP ' + response.status));
                        return;
                    }
                    let data = null;
                    try {
                        data = JSON.parse(response.responseText || '{}');
                    } catch (error) {
                        reject(new Error('8997接口未返回有效JSON'));
                        return;
                    }
                    const rows = directPatientApiRows(data);
                    if (!rows.length) {
                        const total = Number(data.total || data.records || 0);
                        if (total > 0) {
                            reject(new Error('接口返回了记录数，但未识别到患者数组结构'));
                            return;
                        }
                    }
                    resolve({
                        rows: rows,
                        total: Number(data.total || data.records || rows.length) || rows.length,
                        data: data,
                        auth: auth
                    });
                },
                onerror: function () {
                    reject(new Error('跨域请求失败'));
                },
                ontimeout: function () {
                    reject(new Error('请求超时'));
                }
            });
        });
    }

    function directMatchManagementPatient(row, records) {
        const admissionNo = normalizeAdmissionNo(row && row.admissionNo);
        if (admissionNo) {
            const direct = (records || []).find(function (item) {
                return normalizeAdmissionNo(
                    item && (item.mrId || item.MRID || item.zyh || item.admissionNo || '')
                ) === admissionNo;
            });
            if (direct) return direct;
        }

        const name = compact(row && row.name);
        const bed = normalizeBed(row && row.bedNo);
        const matches = (records || []).filter(function (item) {
            const itemName = compact(item && (item.name || item.xm || ''));
            const itemBed = normalizeBed(item && (item.bedNumber || item.cwmc || item.bedNo || ''));
            return name && bed && itemName === name && itemBed === bed;
        });
        return matches.length === 1 ? matches[0] : null;
    }

    function directManagementResponsibleDoctor(item) {
        /*
         * v1.3.26：责任医师字段严格对应医疗管理系统 attendDoc。
         * 不使用groupDoctor/其它医师字段替代；attendDoc为空即返回空值。
         */
        return text(item && item.attendDoc);
    }

    function directManagementAge(item) {
        const raw = text(item && (
            item.age !== undefined ? item.age :
            (item.nl !== undefined ? item.nl : item.patientAge)
        ));
        const match = raw.match(/\d{1,3}/);
        return match ? match[0] : '';
    }

    function directManagementHospitalDays(item) {
        const direct = parseNumber(item && (
            item.hospitalDays !== undefined ? item.hospitalDays :
            (item.inHospitalDays !== undefined ? item.inHospitalDays :
            (item.stayDays !== undefined ? item.stayDays : item.zyts))
        ));
        if (Number.isFinite(direct) && direct >= 0) {
            return Math.floor(direct);
        }

        const raw = text(item && (
            item.inTime || item.admissionTime || item.admissionDate || item.ryrq || ''
        ));
        if (!raw) return null;
        const parsed = new Date(raw.replace(/-/g, '/'));
        if (Number.isNaN(parsed.getTime())) return null;
        const start = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const days = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
        return days >= 0 ? days : null;
    }

    function directManagementFee(item) {
        return parseNumber(item && (
            item.cost !== undefined ? item.cost :
            (item.totalCost !== undefined ? item.totalCost :
            (item.inHospitalCost !== undefined ? item.inHospitalCost :
            (item.fee !== undefined ? item.fee : item.zje)))
        ));
    }

    function directEnrichSummaryRows(rows, records) {
        let matched = 0;
        let feeMatched = 0;
        let doctorMatched = 0;

        (rows || []).forEach(function (row) {
            const item = directMatchManagementPatient(row, records);
            if (!item) return;
            matched += 1;
            row._ohaRealtime8997 = true;

            const admissionNo = normalizeAdmissionNo(
                item.mrId || item.MRID || item.zyh || item.admissionNo || ''
            );
            const bedNo = normalizeBed(
                item.bedNumber || item.cwmc || item.bedNo || ''
            );
            const name = text(item.name || item.xm || '');
            const sex = patientListSex(item.sex || item.XB || item.xb || '');
            const age = directManagementAge(item);
            const days = directManagementHospitalDays(item);
            const doctor = directManagementResponsibleDoctor(item);
            const fee = directManagementFee(item);

            if (admissionNo) row.admissionNo = admissionNo;
            if (bedNo) row.bedNo = bedNo;
            if (name) row.name = name;
            if (sex) row.sex = sex;
            if (age) row.age = age;
            if (Number.isFinite(days) && days >= 0) row.hospitalDays = days;
            row.responsibleDoctor = doctor;
            if (doctor) {
                doctorMatched += 1;
            }
            if (Number.isFinite(fee)) {
                row.fee = fee;
                row.source = '8997';
                feeMatched += 1;
            }
        });

        return {
            matched: matched,
            feeMatched: feeMatched,
            doctorMatched: doctorMatched
        };
    }

    function directAuthAgeLabel(auth) {
        const stamp = Number(auth && auth.capturedAt);
        if (!Number.isFinite(stamp) || stamp <= 0) return '未知';
        const seconds = Math.max(0, Math.round((Date.now() - stamp) / 1000));
        if (seconds < 60) return seconds + '秒前';
        if (seconds < 3600) return Math.round(seconds / 60) + '分钟前';
        return (seconds / 3600).toFixed(1) + '小时前';
    }

    /* ==============================================================
       v1.3.0 扩展：右侧控制区、DRG预警、责任医师同步
       ============================================================== */

    const EXT_CONTROL_PANEL_ID = SCRIPT_PREFIX + '-right-controls';
    const EXT_SYNC_BUTTON_ID = SCRIPT_PREFIX + '-sync-drg';
    const EXT_DIRECT_TEST_BUTTON_ID = SCRIPT_PREFIX + '-direct-patient-api-test';
    const EXT_DOCTOR_FILTER_ID = SCRIPT_PREFIX + '-doctor-filter';
    const EXT_SHOW_DOCTOR_TOGGLE_ID = SCRIPT_PREFIX + '-show-doctor-toggle';
    const EXT_STYLE_ID = SCRIPT_PREFIX + '-v130-style';
    const EXT_DRG_BRIDGE_NAME = 'MedicalDoctorDrgSnapshotBridgeV1';

    /* v1.3.28.3：汇总和主页面同步复用管理器独立的8997链路。 */
    const EXT_SHARED_DRG_SYNC_BRIDGE = 'MedicalInpatientDrgSyncBridgeV1';
    const EXT_SHARED_DRG_SYNC_EVENT = 'medical-inpatient-drg-sync-state-v1';
    let extDrgSyncInFlight = false;

    async function directRequestMedicalManagementPatients(forceRefresh) {
        const coordinator = extDrgBridgeCandidates(EXT_SHARED_DRG_SYNC_BRIDGE)[0];
        if (coordinator && typeof coordinator.requestPatients === 'function') {
            if (forceRefresh === true && typeof coordinator.sync === 'function') {
                const synced = await coordinator.sync(true);
                if (synced.directError) throw new Error(synced.directError);
                const result = await Promise.resolve(coordinator.getSnapshot());
                if (!result) throw new Error('8997同步结果不可用，请重新同步');
                return Object.assign({}, result, { cached: synced.directCached === true });
            }
            return coordinator.requestPatients(forceRefresh === true);
        }
        /* 没有管理器时保留原独立直连策略；管理器报错时不绕路再发同一请求。 */
        return directLegacyRequestMedicalManagementPatients();
    }

    function extUpdateSharedDrgSyncButton(event) {
        const button = document.getElementById(EXT_SYNC_BUTTON_ID);
        if (!button) return;
        const detail = event && event.detail || {};
        const busy = detail.busy === true || extDrgSyncInFlight;
        button.disabled = busy;
        button.textContent = busy ? '同步中…' : '同步DRG助手';
        if (detail.message) button.title = String(detail.message);
    }

    function extReconcileSharedDoctorRows(rows, records) {
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
            const record = extMatchDoctorIdentity(row, records);
            if (!record) return;
            row.responsibleDoctor = text(record.responsibleDoctor);
            row._ohaRealtime8997 = record.doctorSource === '8997';
            row._oha8997Cached = record.doctorSource === '8997';
            row._ohaResponsibleDoctorSource = record.doctorSource === '8997'
                ? '8997-cache' : 'drg-assistant-cache';
        });
    }

    document.addEventListener(EXT_SHARED_DRG_SYNC_EVENT, extUpdateSharedDrgSyncButton);

    /* 只备份用户维护的诊断映射与DRG预警设置，不包含患者、认证或接口缓存。 */
    const EXT_BUSINESS_BACKUP_KEY = 'inpatient-summary';
    const EXT_BUSINESS_BACKUP_REGISTRY = 'MedicalUserscriptBackupRegistry';
    const EXT_BUSINESS_BACKUP_QUEUE = '__medicalUserscriptBackupAdapterQueueV1';
    const EXT_BUSINESS_BACKUP_READY_EVENT = 'medical-userscript-backup-registry-ready';

    function extBusinessBackupPage() {
        let page = extSourceBackupPageWindow();
        for (let depth = 0; page && depth < 8; depth += 1) {
            try {
                if (!page.parent || page.parent === page || page.parent.location.origin !== page.location.origin) break;
                page = page.parent;
            } catch (error) { break; }
        }
        return page;
    }

    function extNotifyDrgSettingsChanged() {
        try {
            const registry = extBusinessBackupPage()[EXT_BUSINESS_BACKUP_REGISTRY];
            if (registry && typeof registry.notifyChanged === 'function') registry.notifyChanged(EXT_BUSINESS_BACKUP_KEY);
        } catch (error) { /* 自动备份通知失败不影响本地设置。 */ }
    }

    function extNormalizeDrgWarningBackup(value) {
        function plainObject(object) {
            if (!object || Object.prototype.toString.call(object) !== '[object Object]') return false;
            const prototype = Object.getPrototypeOf(object);
            return prototype === null || Object.getPrototypeOf(prototype) === null;
        }
        function safeKey(key) {
            return key && key.length <= 500 && !['__proto__', 'constructor', 'prototype'].includes(key);
        }
        if (!plainObject(value) || value.schemaVersion !== 1 ||
            Object.keys(value).some(function (key) { return !['schemaVersion', 'diagnosisMap', 'drgConfigs'].includes(key); }) ||
            !plainObject(value.diagnosisMap) || !plainObject(value.drgConfigs)) {
            throw new Error('住院患者一览DRG预警备份格式不正确');
        }
        const mapKeys = Object.keys(value.diagnosisMap);
        const configKeys = Object.keys(value.drgConfigs);
        if (mapKeys.length > 20000 || configKeys.length > 5000) throw new Error('DRG预警设置超出安全范围');
        const diagnosisMap = {};
        const drgConfigs = {};
        mapKeys.forEach(function (key) {
            const group = value.diagnosisMap[key];
            if (!safeKey(key) || typeof group !== 'string' || !group.trim() || group.length > 500) {
                throw new Error('主诊断与DRG分组映射不正确');
            }
            diagnosisMap[key] = group;
        });
        configKeys.forEach(function (key) {
            const config = value.drgConfigs[key];
            if (!safeKey(key) || !plainObject(config) ||
                Object.keys(config).some(function (field) {
                    return !['groupName', 'quota', 'dailyCost', 'adjustment', 'updatedAt'].includes(field);
                }) || typeof config.groupName !== 'string' || !config.groupName.trim() || config.groupName.length > 500 ||
                typeof config.quota !== 'number' || !Number.isFinite(config.quota) || config.quota < 0 ||
                typeof config.dailyCost !== 'number' || !Number.isFinite(config.dailyCost) || config.dailyCost <= 0 ||
                typeof config.adjustment !== 'string' || config.adjustment.length > 100 ||
                !extParseAdjustment(config.adjustment).valid ||
                (config.updatedAt !== undefined && (typeof config.updatedAt !== 'number' ||
                    !Number.isFinite(config.updatedAt) || config.updatedAt < 0))) {
                throw new Error('DRG疾病定额、每日花费或报红区间不正确');
            }
            drgConfigs[key] = {
                groupName: config.groupName, quota: config.quota, dailyCost: config.dailyCost,
                adjustment: extParseAdjustment(config.adjustment).normalized
            };
            if (config.updatedAt !== undefined) drgConfigs[key].updatedAt = config.updatedAt;
        });
        return { schemaVersion: 1, diagnosisMap: diagnosisMap, drgConfigs: drgConfigs };
    }

    function extExportDrgWarningBackup() {
        return extNormalizeDrgWarningBackup({
            schemaVersion: 1, diagnosisMap: extReadDiagnosisMap(), drgConfigs: extReadDrgConfigs()
        });
    }

    function extImportDrgWarningBackup(value) {
        if (summaryRunning || extDrgSyncInFlight) throw new Error('正在汇总或同步，请在完成后恢复DRG预警设置');
        const safe = extNormalizeDrgWarningBackup(value);
        const previousMap = localStorage.getItem(EXT_DIAG_MAP_KEY);
        const previousConfigs = localStorage.getItem(EXT_DRG_CONFIG_KEY);
        try {
            localStorage.setItem(EXT_DIAG_MAP_KEY, JSON.stringify(safe.diagnosisMap));
            localStorage.setItem(EXT_DRG_CONFIG_KEY, JSON.stringify(safe.drgConfigs));
        } catch (error) {
            [[EXT_DIAG_MAP_KEY, previousMap], [EXT_DRG_CONFIG_KEY, previousConfigs]].forEach(function (entry) {
                try {
                    if (entry[1] === null) localStorage.removeItem(entry[0]);
                    else localStorage.setItem(entry[0], entry[1]);
                } catch (rollbackError) { console.warn('[住院患者一览DRG预警] 恢复回滚失败：', rollbackError); }
            });
            throw error;
        }
        extNotifyDrgSettingsChanged();
        try {
            if (extFeatureRuntimeEnabled && Array.isArray(lastRows) && lastRows.length) {
                extRefreshSummaryAfterSettings('已恢复住院患者一览DRG预警设置');
            }
        } catch (error) { console.warn('[住院患者一览DRG预警] 设置已恢复，刷新显示失败：', error); }
        return true;
    }

    function extRegisterDrgWarningBackup() {
        const page = extBusinessBackupPage();
        const adapter = {
            key: EXT_BUSINESS_BACKUP_KEY, name: '住院患者一览DRG预警设置',
            version: EXT_SOURCE_BACKUP_VERSION, adapterVersion: 1,
            exportData: extExportDrgWarningBackup,
            validateData: function (value) { extNormalizeDrgWarningBackup(value); return true; },
            importData: extImportDrgWarningBackup,
            isBusy: function () { return summaryRunning || extDrgSyncInFlight; },
            describeData: function (value) {
                const safe = extNormalizeDrgWarningBackup(value);
                return '主诊断映射' + Object.keys(safe.diagnosisMap).length + '项，DRG预警设置' +
                    Object.keys(safe.drgConfigs).length + '组';
            }
        };
        try {
            const registry = page[EXT_BUSINESS_BACKUP_REGISTRY];
            if (registry && typeof registry.register === 'function') return registry.register(adapter);
            const queue = Array.isArray(page[EXT_BUSINESS_BACKUP_QUEUE]) ? page[EXT_BUSINESS_BACKUP_QUEUE] : [];
            const index = queue.findIndex(function (item) { return item && item.key === EXT_BUSINESS_BACKUP_KEY; });
            if (index >= 0) queue[index] = adapter;
            else queue.push(adapter);
            page[EXT_BUSINESS_BACKUP_QUEUE] = queue;
            return true;
        } catch (error) {
            console.warn('[住院患者一览DRG预警] 备份适配器注册失败：', error);
            return false;
        }
    }


    /* v1.3.16：与悬浮框管理器的DRG责任医师筛选建立同页联动。 */
    const EXT_MANAGER_HOST_ID = 'medical-userscript-suite-manager-host-v2';
    const EXT_MANAGER_DRG_ENABLED_SELECTOR = '.openhis-drg-filter-enabled';
    const EXT_MANAGER_DRG_DOCTOR_SELECTOR = '.openhis-drg-doctor-filter';
    const EXT_MANAGER_OPENHIS_RUNTIME_EVENT = 'medical-openhis-patient-runtime-changed';

    const EXT_SYNC_CACHE_KEY = 'oha_inpatient_summary_drg_sync_v1';
    const EXT_SYNC_CACHE_EVENT = 'medical-drg-assistant-shared-cache-changed-v1';
    const EXT_DIAG_MAP_KEY = 'oha_inpatient_summary_diagnosis_drg_map_v1';
    const EXT_DRG_CONFIG_KEY = 'oha_inpatient_summary_drg_config_v1';
    const EXT_TABLE_COLUMN_WIDTHS_KEY = 'oha_inpatient_summary_table_column_widths_v1';
    const EXT_TABLE_AUTO_LAYOUT_KEY = 'oha_inpatient_summary_table_auto_layout_v1';
    const EXT_SHOW_DOCTOR_KEY = 'oha_inpatient_summary_show_responsible_doctor_v1';
    const EXT_DETAIL_TABLE_EXPANDED_KEY = 'oha_inpatient_summary_detail_table_expanded_v1';

    const EXT_DEFAULT_COLUMN_WIDTHS = {
        index: 44,
        admissionNo: 112,
        bedNo: 76,
        name: 96,
        responsibleDoctor: 122,
        sex: 60,
        age: 68,
        hospitalDays: 92,
        diagnosis: 210,
        drgGroup: 230,
        drgQuota: 104,
        drgDailyCost: 104,
        remainingDays: 96,
        fee: 116
    };
    const EXT_MIN_COLUMN_WIDTH = 18;

    const EXT_DEFAULT_DAILY_COST = 300;
    let extScanTimer = null;
    let extSelectedDoctor = '';
    let extManagerDrgLinkTimer = null;
    let extManagerRuntimeDocument = null;

    function extSafeJsonRead(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function extSafeJsonWrite(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('[住院患者一览汇总] 本地保存失败：', key, error);
            return false;
        }
    }

    function extShowResponsibleDoctorEnabled() {
        return extSafeJsonRead(EXT_SHOW_DOCTOR_KEY, true) !== false;
    }

    function extWriteShowResponsibleDoctor(enabled) {
        return extSafeJsonWrite(EXT_SHOW_DOCTOR_KEY, Boolean(enabled));
    }

    function extReadDetailTableExpanded() {
        return extSafeJsonRead(EXT_DETAIL_TABLE_EXPANDED_KEY, false) === true;
    }

    function extWriteDetailTableExpanded(expanded) {
        return extSafeJsonWrite(EXT_DETAIL_TABLE_EXPANDED_KEY, Boolean(expanded));
    }

    function extNumber(value) {
        const number = parseNumber(value);
        return number === null ? NaN : number;
    }

    function extDrgKey(value) {
        const raw = text(value).toUpperCase();
        if (!raw) return '';
        const match = raw.match(/\b[A-Z]{1,4}\d{1,4}[A-Z]?\b/);
        return match ? match[0] : raw;
    }

    function extDiagnosisKey(value) {
        return text(value);
    }

    function extReadDiagnosisMap() {
        const map = extSafeJsonRead(EXT_DIAG_MAP_KEY, {});
        return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
    }

    function extWriteDiagnosisMap(map) {
        const saved = extSafeJsonWrite(EXT_DIAG_MAP_KEY, map || {});
        if (saved) extNotifyDrgSettingsChanged();
        return saved;
    }

    function extReadDrgConfigs() {
        const configs = extSafeJsonRead(EXT_DRG_CONFIG_KEY, {});
        return configs && typeof configs === 'object' && !Array.isArray(configs) ? configs : {};
    }

    function extWriteDrgConfigs(configs) {
        const saved = extSafeJsonWrite(EXT_DRG_CONFIG_KEY, configs || {});
        if (saved) extNotifyDrgSettingsChanged();
        return saved;
    }

    function extReadTableColumnWidths() {
        const saved = extSafeJsonRead(EXT_TABLE_COLUMN_WIDTHS_KEY, {});
        const result = {};
        Object.keys(EXT_DEFAULT_COLUMN_WIDTHS).forEach(function (key) {
            const value = Number(saved && saved[key]);
            result[key] = Number.isFinite(value)
                ? Math.max(EXT_MIN_COLUMN_WIDTH, Math.round(value))
                : EXT_DEFAULT_COLUMN_WIDTHS[key];
        });
        return result;
    }

    function extWriteTableColumnWidths(widths) {
        const normalized = {};
        Object.keys(EXT_DEFAULT_COLUMN_WIDTHS).forEach(function (key) {
            const value = Number(widths && widths[key]);
            normalized[key] = Number.isFinite(value)
                ? Math.max(EXT_MIN_COLUMN_WIDTH, Math.round(value))
                : EXT_DEFAULT_COLUMN_WIDTHS[key];
        });
        return extSafeJsonWrite(EXT_TABLE_COLUMN_WIDTHS_KEY, normalized);
    }

    function extIsTableAutoLayout() {
        return extSafeJsonRead(EXT_TABLE_AUTO_LAYOUT_KEY, false) === true;
    }

    function extResetTableColumnWidths(overlay) {
        try {
            localStorage.removeItem(EXT_TABLE_COLUMN_WIDTHS_KEY);
            localStorage.removeItem(EXT_TABLE_AUTO_LAYOUT_KEY);
        } catch (error) {
            console.warn('[住院患者一览汇总] 清除列宽布局失败：', error);
        }

        const defaults = Object.assign({}, EXT_DEFAULT_COLUMN_WIDTHS);
        extApplyTableColumnWidths(overlay || document.getElementById(OVERLAY_ID), defaults);
        setProgress('患者关联明细列宽已恢复默认布局，可拖拽调宽或再次自适应');
    }

    function extTableColumns() {
        return [
            { key: 'index', label: '#' },
            { key: 'admissionNo', label: '住院号' },
            { key: 'bedNo', label: '床号' },
            { key: 'name', label: '患者姓名' },
            { key: 'responsibleDoctor', label: '责任医师' },
            { key: 'sex', label: '性别' },
            { key: 'age', label: '年龄' },
            { key: 'hospitalDays', label: '住院天数' },
            { key: 'diagnosis', label: '主诊断' },
            { key: 'drgGroup', label: 'DRG分组' },
            { key: 'drgQuota', label: '疾病定额' },
            { key: 'drgDailyCost', label: '每日花费' },
            { key: 'remainingDays', label: '剩余天数' },
            { key: 'fee', label: '总费用（元）' }
        ];
    }

    function extDetailColgroupHtml() {
        const widths = extReadTableColumnWidths();
        return '<colgroup>' + extTableColumns().map(function (column) {
            return '<col data-col-key="' + escapeHtml(column.key) + '" style="width:' + widths[column.key] + 'px">';
        }).join('') + '</colgroup>';
    }

    function extColumnHeaderHtml(label, key, extraClass, attrs) {
        const className = ['oha-resizable-th', extraClass || ''].filter(Boolean).join(' ');
        return '<th class="' + className + '" data-col-key="' + escapeHtml(key) + '" ' + (attrs || '') + '>' +
            '<div class="oha-th-content">' + label + '</div>' +
            '<span class="oha-col-resizer" data-col-key="' + escapeHtml(key) + '" title="拖拽调整列宽"></span>' +
            '</th>';
    }

    function extFilterCellHtml(content, key) {
        return '<th class="oha-filter-cell" data-col-key="' + escapeHtml(key) + '">' + (content || '') + '</th>';
    }

    function extApplyTableColumnWidths(overlay, widths) {
        if (!overlay) return;
        const table = overlay.querySelector('.oha-detail-table');
        if (!table) return;
        const current = widths || extReadTableColumnWidths();
        let totalWidth = 0;
        extTableColumns().forEach(function (column) {
            const key = column.key;
            const width = Math.max(EXT_MIN_COLUMN_WIDTH, Number(current[key]) || EXT_DEFAULT_COLUMN_WIDTHS[key]);
            const rounded = Math.round(width);
            const col = table.querySelector('col[data-col-key="' + key + '"]');
            if (col) col.style.width = rounded + 'px';
            totalWidth += rounded;
        });
        table.style.width = Math.max(totalWidth, EXT_MIN_COLUMN_WIDTH) + 'px';
    }

    /*
     * 自适应布局：先确保所有列都能换行，再按列的“实用最小宽度 + 可扩展权重”
     * 分配可用空间。算法输出整数像素且总和严格等于目标宽度，避免1~Npx舍入
     * 累积造成的微型横向滚动条。较长的主诊断和DRG名称分配更多弹性空间。
     */
    function extCalculateAutoColumnWidths(availableWidth) {
        const columns = extTableColumns();
        const practicalMinimums = {
            index: 30, admissionNo: 66, bedNo: 48, name: 60,
            responsibleDoctor: 63, sex: 34, age: 40, hospitalDays: 58,
            diagnosis: 115, drgGroup: 130, drgQuota: 68,
            drgDailyCost: 68, remainingDays: 62, fee: 78
        };
        const absoluteMinimum = EXT_MIN_COLUMN_WIDTH;
        const width = Math.max(columns.length * absoluteMinimum, Math.floor(availableWidth));
        const softTotal = columns.reduce(function (sum, column) {
            return sum + practicalMinimums[column.key];
        }, 0);
        const narrow = width < softTotal;
        const mins = columns.map(function (column) {
            return narrow ? absoluteMinimum : practicalMinimums[column.key];
        });
        const baseTotal = mins.reduce(function (sum, value) { return sum + value; }, 0);
        const flexible = columns.map(function (column, index) {
            return narrow
                ? practicalMinimums[column.key] - mins[index]
                : Math.max(1, EXT_DEFAULT_COLUMN_WIDTHS[column.key] - mins[index]);
        });
        const weightTotal = flexible.reduce(function (sum, value) { return sum + value; }, 0);
        const extra = Math.max(0, width - baseTotal);
        const fractional = columns.map(function (column, index) {
            return weightTotal > 0 ? (extra * flexible[index] / weightTotal) : (extra / columns.length);
        });
        const calculated = fractional.map(function (value, index) {
            return mins[index] + Math.floor(value);
        });
        const missing = width - calculated.reduce(function (sum, value) { return sum + value; }, 0);
        const order = fractional.map(function (value, index) {
            return { index: index, remainder: value - Math.floor(value) };
        }).sort(function (a, b) {
            return b.remainder - a.remainder || a.index - b.index;
        });
        for (let index = 0; index < missing; index += 1) {
            calculated[order[index % order.length].index] += 1;
        }
        const result = {};
        columns.forEach(function (column, index) { result[column.key] = calculated[index]; });
        return result;
    }

    function extFitTableToViewport(overlay, announce) {
        if (!overlay || !overlay.isConnected) return false;
        const wrap = overlay.querySelector('.oha-table-wrap');
        const table = overlay.querySelector('.oha-detail-table');
        if (!wrap || !table) return false;

        /* clientWidth会扣除纵向滚动条；再预留2px防止边框/小数舍入溢出。 */
        const usable = Math.floor(wrap.clientWidth) - 2;
        if (!Number.isFinite(usable) || usable <= 0) return false;
        const columnCount = extTableColumns().length;
        const target = Math.max(columnCount * EXT_MIN_COLUMN_WIDTH, usable);
        const fitted = extCalculateAutoColumnWidths(target);
        const existing = extReadTableColumnWidths();
        const unchanged = extTableColumns().every(function (column) {
            return existing[column.key] === fitted[column.key];
        });
        if (!unchanged || table.style.width !== target + 'px') {
            extApplyTableColumnWidths(overlay, fitted);
            extWriteTableColumnWidths(fitted);
        }
        wrap.scrollLeft = 0;
        if (announce) {
            setProgress('已自适应调整全部列宽，随窗口变化自动适配；手动拖拽可退出自动模式');
        }
        return true;
    }

    function extWatchAutoTableLayout(overlay) {
        if (!overlay || typeof ResizeObserver === 'undefined') return;
        const wrap = overlay.querySelector('.oha-table-wrap');
        if (!wrap) return;
        const state = { observer: null, frame: 0 };
        state.observer = new ResizeObserver(function () {
            if (!extIsTableAutoLayout() || state.frame) return;
            state.frame = window.requestAnimationFrame(function () {
                state.frame = 0;
                if (extIsTableAutoLayout() && overlay.isConnected) {
                    extFitTableToViewport(overlay, false);
                }
            });
        });
        state.observer.observe(wrap);
        overlay._ohaAutoLayoutWatcher = state;
    }

    function extBindColumnResizers(overlay) {
        if (!overlay) return;
        const table = overlay.querySelector('.oha-detail-table');
        if (!table) return;
        if (extIsTableAutoLayout()) extFitTableToViewport(overlay, false);
        else extApplyTableColumnWidths(overlay);
        extWatchAutoTableLayout(overlay);

        table.querySelectorAll('.oha-col-resizer').forEach(function (handle) {
            handle.addEventListener('mousedown', function (event) {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();

                const key = handle.getAttribute('data-col-key') || '';
                if (!key) return;
                const col = table.querySelector('col[data-col-key="' + key + '"]');
                const th = handle.closest('th');
                if (!col || !th) return;

                const startX = event.clientX;
                const startWidth = th.getBoundingClientRect().width;
                const widths = extReadTableColumnWidths();
                /* 手动拖动即尊重用户列宽，下次打开不再自动覆盖。 */
                extSafeJsonWrite(EXT_TABLE_AUTO_LAYOUT_KEY, false);
                document.body.classList.add('oha-column-resizing');

                const onMove = function (moveEvent) {
                    const next = Math.max(
                        EXT_MIN_COLUMN_WIDTH,
                        Math.round(startWidth + moveEvent.clientX - startX)
                    );
                    widths[key] = next;
                    extApplyTableColumnWidths(overlay, widths);
                };

                const onUp = function () {
                    document.removeEventListener('mousemove', onMove, true);
                    document.removeEventListener('mouseup', onUp, true);
                    document.body.classList.remove('oha-column-resizing');
                    extWriteTableColumnWidths(widths);
                };

                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mouseup', onUp, true);
            });
        });
    }

    function extParseAdjustment(raw) {
        let value = text(raw).replace(/％/g, '%');
        if (!value) value = '0%';

        let match = value.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))%$/);
        if (match) {
            const number = Number(match[1]);
            if (Number.isFinite(number)) {
                return {
                    valid: true,
                    type: 'percent',
                    value: number,
                    normalized: (number > 0 ? '+' : '') + number + '%'
                };
            }
        }

        match = value.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/);
        if (match) {
            const number = Number(match[1]);
            if (Number.isFinite(number)) {
                return {
                    valid: true,
                    type: 'amount',
                    value: number,
                    normalized: (number > 0 ? '+' : '') + number
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

    function extApplyAdjustment(base, adjustment) {
        if (!Number.isFinite(base)) return NaN;
        const current = adjustment && adjustment.valid
            ? adjustment
            : extParseAdjustment('0%');

        const threshold = current.type === 'percent'
            ? base * (1 + current.value / 100)
            : base + current.value;

        return Math.max(0, threshold);
    }

    function extRemainingDays(quota, currentFee, dailyCost) {
        if (
            !Number.isFinite(quota) ||
            !Number.isFinite(currentFee) ||
            !Number.isFinite(dailyCost) ||
            dailyCost <= 0
        ) {
            return null;
        }
        if (currentFee >= quota) return 0;
        return Math.ceil((quota - currentFee) / dailyCost);
    }

    function extReadSyncCache() {
        const cache = extSafeJsonRead(EXT_SYNC_CACHE_KEY, {
            syncedAt: '',
            capturedAt: '',
            records: [],
            groupProfiles: []
        });
        if (!cache || typeof cache !== 'object') {
            return { syncedAt: '', capturedAt: '', records: [], groupProfiles: [] };
        }
        if (!Array.isArray(cache.records)) cache.records = [];
        if (!Array.isArray(cache.groupProfiles)) cache.groupProfiles = [];
        return cache;
    }

    function extWriteSyncCache(cache) {
        const normalized = {
            schemaVersion: 2,
            syncedAt: cache && cache.syncedAt
                ? cache.syncedAt
                : new Date().toISOString(),
            capturedAt: text(cache && cache.capturedAt || ''),
            records: Array.isArray(cache && cache.records)
                ? cache.records
                : [],
            groupProfiles: Array.isArray(cache && cache.groupProfiles)
                ? cache.groupProfiles
                : []
        };

        const saved = extSafeJsonWrite(
            EXT_SYNC_CACHE_KEY,
            normalized
        );

        if (saved) {
            try {
                document.dispatchEvent(
                    new CustomEvent(
                        EXT_SYNC_CACHE_EVENT,
                        {
                            detail: {
                                key: EXT_SYNC_CACHE_KEY,
                                syncedAt: normalized.syncedAt,
                                patientCount: normalized.records.length,
                                groupCount: normalized.groupProfiles.length
                            }
                        }
                    )
                );
            } catch (error) {
                /* 同页通知失败不影响localStorage缓存。 */
            }
        }

        return saved;
    }

    function extFirstValue(source, keys) {
        if (!source || typeof source !== 'object') return '';
        const containers = [
            source,
            source.fields,
            source.values,
            source.data,
            source.raw,
            source.source,
            source.columnMap,
            source.columns
        ].filter(function (item) {
            return item && typeof item === 'object' && !Array.isArray(item);
        });

        for (const container of containers) {
            for (const key of keys) {
                if (
                    Object.prototype.hasOwnProperty.call(container, key) &&
                    container[key] !== null &&
                    container[key] !== undefined &&
                    text(container[key])
                ) {
                    return container[key];
                }
            }
        }
        return '';
    }

    function extSnapshotColumns(snapshot) {
        const columns = Array.isArray(snapshot && snapshot.columns)
            ? snapshot.columns
            : [];
        return columns.map(function (column, index) {
            if (typeof column === 'string') {
                return { key: column, title: column, index: index };
            }
            const object = column && typeof column === 'object' ? column : {};
            return {
                key: text(object.key || object.prop || object.field || object.name || object.title || object.label || index),
                title: text(object.title || object.label || object.name || object.key || object.prop || object.field || index),
                index: index
            };
        });
    }

    function extRowObjectFromColumns(row, columns) {
        if (!Array.isArray(row)) return row;
        const object = {};
        columns.forEach(function (column, index) {
            object[column.key] = row[index];
            if (column.title && column.title !== column.key) {
                object[column.title] = row[index];
            }
        });
        return object;
    }

    function extNormalizeSnapshotRecord(raw, fallbackAdmissionNo) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const admissionNo = normalizeAdmissionNo(
            extFirstValue(source, [
                'admissionNo', 'AdmissionNo', 'zyh', 'ZYH',
                '病案号', '住院号', '患者住院号'
            ]) || fallbackAdmissionNo
        );
        const name = text(extFirstValue(source, [
            'name', 'patientName', 'xm', 'XM', '患者姓名', '姓名'
        ]));
        const bedNo = normalizeBed(extFirstValue(source, [
            'bedNo', 'bed', 'ch', 'CH', 'cwh', '床号', '床位'
        ]));
        const responsibleDoctor = text(extFirstValue(source, [
            'responsibleDoctor', 'responsiblePhysician',
            'doctorName', 'zrysxm', 'zrys', 'ysxm',
            '责任医师', '责任医生'
        ]));
        const drgGroupRaw = text(extFirstValue(source, [
            'drgGroup', 'drg', 'DRGGroup', 'DRG分组', 'DRG预分组',
            'drgCode', 'DRGCode', 'DRG编码', '分组编码'
        ]));
        const drgGroupName = text(extFirstValue(source, [
            'drgGroupName', 'drgName', 'DRGGroupName',
            'DRG名称', '分组名称', '病组名称'
        ]));
        let drgGroup = drgGroupRaw;
        if (drgGroupName) {
            const code = extDrgKey(drgGroupRaw || drgGroupName);
            if (code && compact(drgGroupName) !== compact(code)) {
                drgGroup = code + ' ' + drgGroupName.replace(new RegExp('^' + code + '\\s*', 'i'), '').trim();
            } else if (!drgGroup) {
                drgGroup = drgGroupName;
            }
        }
        const allocation = extNumber(extFirstValue(source, [
            'drgAllocationFee', 'allocationFee',
            '拨付费用', '疾病定额', '定额'
        ]));
        const daily = extNumber(extFirstValue(source, [
            'drgDailyCost', 'dailyCost',
            '每日花费', '每日花费预估', '每日费用'
        ]));

        return {
            admissionNo: admissionNo || '',
            name: name,
            bedNo: bedNo,
            responsibleDoctor: responsibleDoctor,
            drgGroup: drgGroup,
            drgAllocationFee: Number.isFinite(allocation) ? allocation : null,
            drgDailyCost: Number.isFinite(daily) && daily > 0 ? daily : null
        };
    }

    function extSnapshotRecords(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return [];

        const columns = extSnapshotColumns(snapshot);
        const result = [];

        if (snapshot.records && typeof snapshot.records === 'object') {
            Object.keys(snapshot.records).forEach(function (key) {
                const record = extNormalizeSnapshotRecord(
                    snapshot.records[key],
                    key
                );
                if (
                    record.admissionNo ||
                    record.name ||
                    record.bedNo ||
                    record.responsibleDoctor ||
                    record.drgGroup
                ) {
                    result.push(record);
                }
            });
        }

        if (Array.isArray(snapshot.rows)) {
            snapshot.rows.forEach(function (row) {
                let object = row;
                if (Array.isArray(row)) {
                    object = extRowObjectFromColumns(row, columns);
                } else if (
                    row &&
                    typeof row === 'object' &&
                    Array.isArray(row.values)
                ) {
                    object = Object.assign(
                        {},
                        row,
                        extRowObjectFromColumns(row.values, columns)
                    );
                }
                const record = extNormalizeSnapshotRecord(object, '');
                if (
                    record.admissionNo ||
                    record.name ||
                    record.bedNo ||
                    record.responsibleDoctor ||
                    record.drgGroup
                ) {
                    result.push(record);
                }
            });
        }

        const dedup = new Map();
        result.forEach(function (record) {
            const key = record.admissionNo
                ? 'N|' + record.admissionNo
                : 'P|' + compact(record.name) + '|' + normalizeBed(record.bedNo);
            if (!key.replace(/[NP|]/g, '')) return;

            const old = dedup.get(key) || {};
            dedup.set(key, {
                admissionNo: record.admissionNo || old.admissionNo || '',
                name: record.name || old.name || '',
                bedNo: record.bedNo || old.bedNo || '',
                responsibleDoctor: record.responsibleDoctor || old.responsibleDoctor || '',
                drgGroup: record.drgGroup || old.drgGroup || '',
                drgAllocationFee: Number.isFinite(record.drgAllocationFee)
                    ? record.drgAllocationFee
                    : (Number.isFinite(old.drgAllocationFee) ? old.drgAllocationFee : null),
                drgDailyCost: Number.isFinite(record.drgDailyCost)
                    ? record.drgDailyCost
                    : (Number.isFinite(old.drgDailyCost) ? old.drgDailyCost : null)
            });
        });

        return Array.from(dedup.values());
    }

    function extDrgBridgeCandidates(bridgeName) {
        const windows = [];
        const seenWindows = new Set();
        const seenDocuments = new Set();
        const bridges = [];
        const seenBridges = new Set();

        function addWindow(win) {
            if (!win || seenWindows.has(win)) return;
            seenWindows.add(win);
            windows.push(win);
        }

        function visitDocument(doc) {
            if (!doc || seenDocuments.has(doc)) return;
            seenDocuments.add(doc);
            try { addWindow(doc.defaultView); } catch (error) {}
            try {
                Array.from(doc.querySelectorAll('iframe,frame')).forEach(function (frame) {
                    try { visitDocument(frame.contentDocument); } catch (error) {}
                });
            } catch (error) {}
        }

        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
                addWindow(unsafeWindow);
            }
        } catch (error) {}
        addWindow(window);

        try {
            const pageWindow = getPageWindow();
            addWindow(pageWindow);
            let current = pageWindow;
            for (let depth = 0; current && depth < 8; depth += 1) {
                try { addWindow(current.top); } catch (error) {}
                try {
                    if (!current.parent || current.parent === current) break;
                    current = current.parent;
                    addWindow(current);
                } catch (error) {
                    break;
                }
            }
        } catch (error) {}

        try { visitDocument(document); } catch (error) {}
        windows.slice().forEach(function (win) {
            try { visitDocument(win.document); } catch (error) {}
        });

        windows.forEach(function (current) {
            try {
                const bridge = current && current[bridgeName || EXT_DRG_BRIDGE_NAME];
                if (
                    bridge &&
                    typeof bridge.getSnapshot === 'function' &&
                    !seenBridges.has(bridge)
                ) {
                    seenBridges.add(bridge);
                    bridges.push(bridge);
                }
            } catch (error) {}
        });

        return bridges;
    }

    function extFindBridge() {
        const bridges = extDrgBridgeCandidates();
        return bridges.length ? bridges[0] : null;
    }

    async function extReadDrgAssistantSource() {
        const bridges = extDrgBridgeCandidates();
        let bridgeError = '';

        for (let index = 0; index < bridges.length; index += 1) {
            try {
                const snapshot = await Promise.resolve(
                    bridges[index].getSnapshot()
                );
                const records = extSnapshotRecords(snapshot);
                if (snapshot && records.length) {
                    return {
                        sourceType: 'bridge',
                        sourceLabel: 'DRG助手快照桥',
                        capturedAt: text(
                            snapshot.capturedAt ||
                            snapshot.capturedAtLabel ||
                            snapshot.generatedAt ||
                            ''
                        ),
                        snapshot: snapshot,
                        records: records,
                        groupProfiles: extBuildGroupProfileList(records),
                        bridgeError: ''
                    };
                }
            } catch (error) {
                bridgeError = String(error && error.message || error);
            }
        }

        const cache = extReadSyncCache();
        const cacheRecords = Array.isArray(cache.records) ? cache.records : [];
        const cacheProfiles = Array.isArray(cache.groupProfiles) ? cache.groupProfiles : [];
        if (cacheRecords.length || cacheProfiles.length) {
            return {
                sourceType: 'shared-cache',
                sourceLabel: cacheRecords.some(function (record) {
                    return record && record.doctorSource === '8997';
                }) ? '责任医师/DRG共享本地缓存' : 'DRG助手共享本地缓存',
                capturedAt: text(cache.capturedAt || cache.syncedAt || ''),
                snapshot: null,
                records: cacheRecords,
                groupProfiles: cacheProfiles,
                bridgeError: bridgeError
            };
        }

        return null;
    }

    function extApplyDrgAssistantDoctorFallback(rows, records, sourceType) {
        let matched = 0;
        let filled = 0;
        (rows || []).forEach(function (row) {
            /* 8997已匹配患者的attendDoc（包括空值）绝对优先。 */
            if (row && row._ohaRealtime8997 === true) return;

            const record = extMatchSyncedRecord(row, records || []);
            if (!record) {
                row.responsibleDoctor = '';
                return;
            }

            matched += 1;
            row.responsibleDoctor = text(record.responsibleDoctor || '');
            row._ohaDrgDoctorFallback = true;
            row._ohaResponsibleDoctorSource = sourceType === 'bridge'
                ? 'drg-assistant-bridge'
                : (record.doctorSource === '8997'
                    ? '8997-cache'
                    : 'drg-assistant-cache');
            if (row.responsibleDoctor) filled += 1;
        });
        return { matched: matched, filled: filled };
    }

    function extMatchSyncedRecord(row, records) {
        if (!row || !Array.isArray(records)) return null;
        const admissionNo = normalizeAdmissionNo(row.admissionNo);
        if (admissionNo) {
            const direct = records.find(function (record) {
                return normalizeAdmissionNo(record.admissionNo) === admissionNo;
            });
            if (direct) return direct;
        }

        const name = compact(row.name);
        const bed = normalizeBed(row.bedNo);

        let matches = records.filter(function (record) {
            const sameName = name && compact(record.name) === name;
            const sameBed = bed && normalizeBed(record.bedNo) === bed;
            return sameName && sameBed;
        });
        if (matches.length === 1) return matches[0];

        if (name) {
            matches = records.filter(function (record) {
                return compact(record.name) === name;
            });
            if (matches.length === 1) return matches[0];
        }

        if (bed) {
            matches = records.filter(function (record) {
                return normalizeBed(record.bedNo) === bed;
            });
            if (matches.length === 1) return matches[0];
        }
        return null;
    }

    function extDecorateRows(rows) {
        const diagnosisMap = extReadDiagnosisMap();
        (rows || []).forEach(function (row) {
            /*
             * v1.3.27：责任医师已在汇总阶段完成“8997 attendDoc → DRG助手快照/缓存 → 留空”。
             * 此处只规范化显示，不再从8003 ysmc或其它字段二次补齐。
             */
            row.responsibleDoctor = text(row.responsibleDoctor);

            const mappedGroup = text(diagnosisMap[extDiagnosisKey(row.diagnosis)] || '');
            row.drgGroup = mappedGroup;

            const profile = mappedGroup ? extEffectiveGroupProfile(mappedGroup) : null;
            if (profile && profile.name) {
                row.drgGroup = profile.name;
            }

            row.drgQuota = profile && Number.isFinite(profile.quota) && profile.quota >= 0
                ? profile.quota
                : null;

            row.drgDailyCost = profile && Number.isFinite(profile.dailyCost) && profile.dailyCost > 0
                ? profile.dailyCost
                : (row.drgGroup ? EXT_DEFAULT_DAILY_COST : null);

            row.drgAdjustment = text(
                profile && profile.adjustment
                    ? profile.adjustment
                    : '0%'
            ) || '0%';

            const adjustment = extParseAdjustment(row.drgAdjustment);
            row.drgWarningThreshold = Number.isFinite(row.drgQuota)
                ? extApplyAdjustment(row.drgQuota, adjustment)
                : null;

            row.remainingDays = extRemainingDays(
                Number(row.drgQuota),
                Number(row.fee),
                Number(row.drgDailyCost)
            );

            row.drgWarning = Boolean(
                Number.isFinite(row.fee) &&
                Number.isFinite(row.drgWarningThreshold) &&
                row.fee >= row.drgWarningThreshold
            );
        });
        return rows;
    }

    const extOriginalBuildSummaryRows = buildSummaryRows;
    buildSummaryRows = async function () {
        const rows = await extOriginalBuildSummaryRows();
        return extDecorateRows(rows);
    };

    function extEnsureStyle() {
        if (document.getElementById(EXT_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = EXT_STYLE_ID;
        style.textContent = `
#${EXT_CONTROL_PANEL_ID}{
    width:100%;margin-top:8px;display:flex;flex-direction:column;gap:7px;
    box-sizing:border-box;font-family:"Microsoft YaHei",Arial,sans-serif;
}
#${EXT_CONTROL_PANEL_ID} #${BUTTON_ID},
#${EXT_CONTROL_PANEL_ID} #${EXT_SYNC_BUTTON_ID}{
    position:static!important;display:block!important;width:100%!important;min-width:0!important;
    height:34px!important;margin:0!important;padding:0 8px!important;border:1px solid #0e8fc5!important;
    border-radius:3px!important;background:#159bd3!important;color:#fff!important;line-height:32px!important;
    font-size:12px!important;cursor:pointer!important;box-shadow:none!important;white-space:nowrap!important;
}
#${EXT_CONTROL_PANEL_ID} #${EXT_SYNC_BUTTON_ID}{
    background:#38a169!important;border-color:#31905f!important;
}
#${EXT_CONTROL_PANEL_ID} button:hover{filter:brightness(.96);}
#${EXT_CONTROL_PANEL_ID} button:disabled{opacity:.58!important;cursor:not-allowed!important;}
#${EXT_DOCTOR_FILTER_ID}{
    width:100%;height:32px;border:1px solid #b9d5df;border-radius:3px;background:#fff;color:#35515d;
    font-size:12px;padding:0 7px;outline:none;box-sizing:border-box;
}
#${EXT_CONTROL_PANEL_ID} .oha-show-doctor-toggle{
    min-height:24px;display:flex;align-items:center;gap:6px;padding:0 2px;
    color:#536d79;font-size:11.5px;line-height:20px;cursor:pointer;user-select:none;
}
#${EXT_CONTROL_PANEL_ID} .oha-show-doctor-toggle input{
    margin:0;width:14px;height:14px;cursor:pointer;accent-color:#159bd3;
}
.${SCRIPT_PREFIX}-doctor-line{
    display:block!important;
    max-width:calc(100% - 10px)!important;box-sizing:border-box!important;
    margin:3px 5px 2px!important;padding:3px 7px!important;
    border:1px solid #c9e3ee!important;border-radius:3px!important;
    background:#f4fbfe!important;color:#3b6f86!important;
    font-size:10.5px!important;font-weight:600!important;line-height:16px!important;
    white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
    box-shadow:none!important;
    vertical-align:middle!important;
}
.${SCRIPT_PREFIX}-doctor-line::before{
    content:"责任医师："!important;
    display:inline!important;
    margin-right:3px!important;
    background:transparent!important;color:#6f8d9b!important;
    font-size:10.5px!important;font-weight:400!important;
}
.${SCRIPT_PREFIX}-doctor-hidden{display:none!important;}

#${OVERLAY_ID} .oha-summary-modal{width:min(1380px,97vw)!important;height:min(860px,95vh)!important;}
#${OVERLAY_ID} .oha-summary-cards{grid-template-columns:repeat(5,minmax(140px,1fr))!important;}
#${OVERLAY_ID} .oha-drg-settings{
    background:#fff;border:1px solid #dce9ef;border-radius:6px;padding:12px;margin:0 0 12px;
}
#${OVERLAY_ID} .oha-drg-settings-title{
    display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#264d61;margin-bottom:10px;
}
#${OVERLAY_ID} .oha-drg-settings-title .tip{font-weight:400;font-size:11px;color:#8598a3;}
#${OVERLAY_ID} .oha-drg-form{
    display:grid;grid-template-columns:minmax(130px,1fr) minmax(130px,1fr) minmax(130px,1fr) minmax(130px,1fr) auto auto;
    gap:8px;align-items:end;
}
#${OVERLAY_ID} .oha-drg-field{display:flex;flex-direction:column;gap:4px;font-size:11px;color:#6d7f89;}
#${OVERLAY_ID} .oha-drg-field input{
    height:30px;border:1px solid #bfd5df;border-radius:4px;padding:0 8px;font-size:12px;color:#324f5e;outline:none;
}
#${OVERLAY_ID} .oha-drg-field input:focus{border-color:#42a4ce;box-shadow:0 0 0 1px rgba(66,164,206,.12);}
#${OVERLAY_ID} .oha-drg-settings button{
    height:30px;border:1px solid #b8d3df;border-radius:4px;background:#f4fbfd;color:#147fa9;
    padding:0 10px;font-size:11px;cursor:pointer;white-space:nowrap;
}
#${OVERLAY_ID} .oha-drg-settings button.primary{background:#159bd3;border-color:#159bd3;color:#fff;}
#${OVERLAY_ID} .oha-drg-settings button.danger{background:#fff4f4;border-color:#e7b5b5;color:#c94b4b;}
#${OVERLAY_ID} .oha-diagnosis-checks{
    margin-top:9px;display:flex;gap:6px 12px;flex-wrap:wrap;padding:8px;background:#f8fbfc;border-radius:5px;
    max-height:98px;overflow:auto;border:1px solid #edf2f5;
}
#${OVERLAY_ID} .oha-diagnosis-checks label{
    display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#4e6571;max-width:320px;
}
#${OVERLAY_ID} .oha-diagnosis-checks span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#${OVERLAY_ID} .oha-drg-map-preview{
    margin-top:9px;border:1px solid #e4eef3;border-radius:5px;background:#fafcfd;overflow:hidden;
}
#${OVERLAY_ID} .oha-drg-map-preview-head{
    display:flex;align-items:center;justify-content:space-between;gap:8px;
    padding:6px 8px;font-size:11px;font-weight:600;color:#476578;background:#f3f9fc;
}
#${OVERLAY_ID} .oha-drg-map-toggle{
    flex:none;height:25px!important;padding:0 9px!important;font-size:11px!important;
}
#${OVERLAY_ID} .oha-drg-map-preview-content[hidden]{display:none!important;}
#${OVERLAY_ID} .oha-drg-map-list{
    margin-top:0;padding:2px 8px;font-size:11px;color:#5d717c;line-height:1.7;
    max-height:280px;overflow-y:auto;overflow-x:auto;
}
#${OVERLAY_ID} .oha-drg-map-item{
    display:grid;grid-template-columns:minmax(160px,1.5fr) minmax(90px,.7fr) auto auto auto auto;
    gap:8px;align-items:center;border-top:1px dashed #e8eef1;padding:4px 0;
}
#${OVERLAY_ID} .oha-drg-map-item:first-child{border-top:0;}
#${OVERLAY_ID} .oha-drg-map-item .diag{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#${OVERLAY_ID} tr.oha-drg-warning-row td{background:#fff1f0!important;}
#${OVERLAY_ID} tr.oha-drg-warning-row:hover td{background:#ffe7e4!important;}
#${OVERLAY_ID} tr.oha-drg-warning-row td:first-child{box-shadow:inset 4px 0 0 #e2574c;}
#${OVERLAY_ID} td.oha-drg-warning-fee{color:#d93025!important;font-weight:700!important;}
#${OVERLAY_ID} .oha-drg-remain-zero{color:#d93025;font-weight:700;}
#${OVERLAY_ID} .oha-drg-remain{white-space:nowrap;text-align:center;font-variant-numeric:tabular-nums;}
#${OVERLAY_ID} .oha-responsible{white-space:nowrap;color:#247295;}
#${OVERLAY_ID} .oha-drg-group{white-space:nowrap;color:#6a4b8a;font-weight:600;}
#${OVERLAY_ID} .oha-summary-foot{flex-wrap:wrap;}
#${OVERLAY_ID} .oha-summary-foot .status{flex:1 1 180px;}
#${OVERLAY_ID} .oha-summary-foot .oha-auto-layout{background:#e9f7ed;border-color:#9acbaa;color:#207c4a;}
#${OVERLAY_ID} .oha-detail-title{display:flex;align-items:center;gap:8px;}
#${OVERLAY_ID} .oha-detail-title .oha-detail-toggle{
    margin-left:auto;flex:none;height:25px;padding:0 10px;border:1px solid #b8d3df;border-radius:4px;
    background:#f4fbfd;color:#147fa9;font-size:11px;line-height:23px;cursor:pointer;white-space:nowrap;
}
#${OVERLAY_ID} .oha-detail-title .oha-detail-toggle:hover{filter:brightness(.97);}
#${OVERLAY_ID} .oha-table-wrap.oha-detail-expanded{
    max-height:none!important;
    overflow-x:auto!important;
    overflow-y:visible!important;
}
#${OVERLAY_ID} .oha-detail-table{table-layout:fixed!important;width:auto;min-width:0!important;border-collapse:collapse!important;border-spacing:0!important;}
#${OVERLAY_ID} .oha-detail-table thead{position:sticky!important;top:0!important;z-index:6!important;background:#edf7fb!important;}
#${OVERLAY_ID} .oha-detail-table thead tr{margin:0!important;padding:0!important;border-spacing:0!important;}
#${OVERLAY_ID} .oha-detail-table thead tr.oha-header-row th{
    position:relative!important;top:auto!important;height:32px!important;min-height:32px!important;z-index:2!important;
    padding:5px 8px!important;border-bottom:0!important;vertical-align:middle!important;
}
#${OVERLAY_ID} .oha-detail-table thead tr.oha-filter-row th{
    position:relative!important;top:auto!important;height:31px!important;min-height:31px!important;z-index:1!important;
    background:#f6fbfd!important;padding:2px 5px!important;border-top:0!important;vertical-align:middle!important;
}
#${OVERLAY_ID} .oha-detail-table th,#${OVERLAY_ID} .oha-detail-table td{
    overflow:visible!important;text-overflow:clip!important;white-space:normal!important;
    overflow-wrap:anywhere!important;word-break:break-word!important;height:auto!important;line-height:1.35!important;
}
#${OVERLAY_ID} .oha-detail-table td.nowrap,#${OVERLAY_ID} .oha-detail-table .oha-responsible,#${OVERLAY_ID} .oha-detail-table .oha-drg-group,#${OVERLAY_ID} .oha-detail-table .oha-drg-remain{
    white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;
}
#${OVERLAY_ID} .oha-detail-table .oha-resizable-th{position:relative!important;padding-right:8px!important;}
#${OVERLAY_ID} .oha-detail-table .oha-th-content{overflow:visible!important;text-overflow:clip!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;}
#${OVERLAY_ID} .oha-detail-table .oha-col-resizer{
    position:absolute;right:-2px;top:0;width:7px;height:100%;cursor:col-resize;z-index:8;user-select:none;
}
#${OVERLAY_ID} .oha-detail-table .oha-col-resizer::after{
    content:"";position:absolute;right:3px;top:6px;bottom:6px;width:1px;background:#c8dbe4;opacity:.75;
}
#${OVERLAY_ID} .oha-detail-table .oha-col-resizer:hover::after{background:#159bd3;opacity:1;width:2px;}
body.oha-column-resizing{cursor:col-resize!important;user-select:none!important;}
#${OVERLAY_ID} .oha-filter-cell{white-space:nowrap;overflow:visible!important;}
#${OVERLAY_ID} .oha-filter-cell .oha-diagnosis-filter,#${OVERLAY_ID} .oha-filter-cell .oha-drg-group-filter{width:100%!important;max-width:100%!important;min-width:0!important;}
#${OVERLAY_ID} .oha-filter-placeholder{color:#a6b4bb;font-size:10px;text-align:center;display:block;}
#${OVERLAY_ID} .oha-column-filter-head{display:flex;align-items:center;gap:5px;white-space:nowrap;}
#${OVERLAY_ID} .oha-filter-cell .oha-manual-filter-btn{width:100%;max-width:100%;min-width:0!important;}
#${OVERLAY_ID} .oha-manual-filter-btn{
    height:23px;padding:0 6px;border:1px solid #b8d3df;border-radius:3px;background:#fff;color:#4f7384;
    font-size:10px;cursor:pointer;white-space:nowrap;
}
#${OVERLAY_ID} .oha-manual-filter-btn.active{background:#159bd3;border-color:#159bd3;color:#fff;}
#${OVERLAY_ID} .oha-responsible-filter,#${OVERLAY_ID} .oha-drg-group-filter{
    width:100%;max-width:100%;min-width:0!important;height:25px;border:1px solid #bed4de;border-radius:3px;background:#fff;color:#35505e;
    padding:0 22px 0 6px;font-size:11px;outline:none;cursor:pointer;
}
#${OVERLAY_ID} .oha-manual-filter-mask{
    position:fixed;inset:0;z-index:2147483646;background:rgba(22,36,46,.42);display:flex;align-items:center;justify-content:center;padding:20px;
}
#${OVERLAY_ID} .oha-manual-filter-dialog{
    width:min(560px,92vw);background:#fff;border-radius:7px;overflow:hidden;box-shadow:0 12px 38px rgba(0,0,0,.30);
}
#${OVERLAY_ID} .oha-manual-filter-head{
    height:44px;background:#159bd3;color:#fff;display:flex;align-items:center;padding:0 13px;font-size:14px;font-weight:600;
}
#${OVERLAY_ID} .oha-manual-filter-head button{margin-left:auto;border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer;}
#${OVERLAY_ID} .oha-manual-filter-body{padding:14px;}
#${OVERLAY_ID} .oha-manual-filter-tip{font-size:12px;color:#71838d;margin-bottom:9px;line-height:1.6;}
#${OVERLAY_ID} .oha-manual-filter-preview-title,
#${OVERLAY_ID} .oha-manual-filter-edit-title{
    font-size:11px;font-weight:600;color:#516b78;margin:8px 0 5px;
}
#${OVERLAY_ID} .oha-manual-filter-preview{
    width:100%;height:128px;resize:vertical;border:1px solid #d6e5eb;border-radius:4px;padding:8px 10px;
    background:#f7fafb;font-family:Consolas,"Microsoft YaHei",monospace;font-size:12px;line-height:1.5;color:#526a76;
    outline:none;white-space:pre;overflow:auto;
}
#${OVERLAY_ID} .oha-manual-filter-textarea{
    width:100%;height:170px;resize:vertical;border:1px solid #bfd5df;border-radius:4px;padding:9px 10px;
    font-family:Consolas,"Microsoft YaHei",monospace;font-size:13px;line-height:1.55;color:#304c5a;outline:none;
}
#${OVERLAY_ID} .oha-manual-filter-textarea:focus{border-color:#42a4ce;box-shadow:0 0 0 1px rgba(66,164,206,.12);}
#${OVERLAY_ID} .oha-manual-filter-foot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #e6edf1;background:#f8fbfc;}
#${OVERLAY_ID} .oha-manual-filter-foot .spacer{flex:1;}
#${OVERLAY_ID} .oha-manual-filter-foot button{height:30px;padding:0 11px;border:1px solid #b8d3df;border-radius:4px;background:#fff;color:#426575;cursor:pointer;font-size:11px;}
#${OVERLAY_ID} .oha-manual-filter-foot button.primary{background:#159bd3;border-color:#159bd3;color:#fff;}
@media(max-width:980px){
    #${OVERLAY_ID} .oha-drg-form{grid-template-columns:1fr 1fr;}
    #${OVERLAY_ID} .oha-summary-cards{grid-template-columns:1fr 1fr!important;}
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    function extDiagnosisChoicesHtml(rows) {
        const values = Array.from(new Set(
            (rows || [])
                .map(function (row) { return text(row.diagnosis); })
                .filter(Boolean)
        )).sort(function (a, b) {
            return a.localeCompare(b, 'zh-CN');
        });

        if (!values.length) {
            return '<span class="oha-empty">当前汇总无可识别主诊断</span>';
        }

        return values.map(function (diagnosis) {
            return '<label title="' + escapeHtml(diagnosis) + '">' +
                '<input type="checkbox" class="oha-drg-diag-checkbox" value="' + escapeHtml(diagnosis) + '">' +
                '<span>' + escapeHtml(diagnosis) + '</span>' +
                '</label>';
        }).join('');
    }

    function extMostFrequentFinite(values) {
        const normalized = (values || []).map(function (value) {
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        }).filter(function (value) {
            return value !== null;
        });
        if (!normalized.length) return null;

        const counter = new Map();
        normalized.forEach(function (value) {
            const key = String(value);
            counter.set(key, (counter.get(key) || 0) + 1);
        });

        let best = normalized[0];
        let bestCount = 0;
        counter.forEach(function (count, key) {
            const number = Number(key);
            if (count > bestCount) {
                bestCount = count;
                best = number;
            }
        });
        return best;
    }

    function extMostFrequentText(values) {
        const normalized = (values || []).map(function (value) {
            return text(value);
        }).filter(Boolean);
        if (!normalized.length) return '';

        const counter = new Map();
        normalized.forEach(function (value) {
            counter.set(value, (counter.get(value) || 0) + 1);
        });
        return normalized.slice().sort(function (a, b) {
            const countDiff = (counter.get(b) || 0) - (counter.get(a) || 0);
            if (countDiff) return countDiff;
            return b.length - a.length;
        })[0] || '';
    }

    function extBuildGroupProfileList(records) {
        const buckets = new Map();
        (records || []).forEach(function (record) {
            const fullName = text(record && record.drgGroup);
            const key = extDrgKey(fullName);
            if (!key) return;

            if (!buckets.has(key)) {
                buckets.set(key, { key: key, names: [], quotas: [], dailyCosts: [], count: 0 });
            }
            const bucket = buckets.get(key);
            bucket.count += 1;
            if (fullName) bucket.names.push(fullName);

            const quota = Number(record && record.drgAllocationFee);
            if (Number.isFinite(quota) && quota >= 0) bucket.quotas.push(quota);

            const daily = Number(record && record.drgDailyCost);
            if (Number.isFinite(daily) && daily > 0) bucket.dailyCosts.push(daily);
        });

        return Array.from(buckets.values()).map(function (bucket) {
            const name = extMostFrequentText(bucket.names) || bucket.key;
            return {
                key: bucket.key,
                name: name,
                quota: extMostFrequentFinite(bucket.quotas),
                dailyCost: extMostFrequentFinite(bucket.dailyCosts),
                count: bucket.count
            };
        }).sort(function (a, b) {
            return a.key.localeCompare(b.key, 'zh-CN', { numeric: true });
        });
    }

    function extSyncedGroupProfiles() {
        const cache = extReadSyncCache();
        const profiles = {};
        const list = Array.isArray(cache.groupProfiles) && cache.groupProfiles.length
            ? cache.groupProfiles
            : extBuildGroupProfileList(cache.records || []);

        list.forEach(function (item) {
            const key = extDrgKey(item && (item.key || item.name || item.group));
            if (!key) return;
            profiles[key] = {
                key: key,
                name: text(item.name || item.group || key) || key,
                quota: Number.isFinite(Number(item.quota)) ? Number(item.quota) : null,
                dailyCost: Number.isFinite(Number(item.dailyCost)) && Number(item.dailyCost) > 0
                    ? Number(item.dailyCost)
                    : null,
                count: Number(item.count || 0)
            };
        });
        return profiles;
    }

    function extEffectiveGroupProfile(group) {
        const key = extDrgKey(group);
        if (!key) return null;

        const local = extReadDrgConfigs()[key] || null;
        const synced = extSyncedGroupProfiles()[key] || null;

        const localQuota = local ? Number(local.quota) : NaN;
        const syncedQuota = synced ? Number(synced.quota) : NaN;
        const localDaily = local ? Number(local.dailyCost) : NaN;
        const syncedDaily = synced ? Number(synced.dailyCost) : NaN;
        const inputName = text(group);
        const localName = local ? text(local.groupName || '') : '';
        const syncedName = synced ? text(synced.name || '') : '';
        const name = localName || syncedName || inputName || key;

        return {
            key: key,
            group: key,
            name: name,
            quota: Number.isFinite(localQuota) && localQuota >= 0
                ? localQuota
                : (Number.isFinite(syncedQuota) && syncedQuota >= 0 ? syncedQuota : null),
            dailyCost: Number.isFinite(localDaily) && localDaily > 0
                ? localDaily
                : (Number.isFinite(syncedDaily) && syncedDaily > 0 ? syncedDaily : null),
            adjustment: local && text(local.adjustment)
                ? text(local.adjustment)
                : '0%',
            hasLocal: Boolean(local),
            hasSynced: Boolean(synced),
            syncedCount: synced ? Number(synced.count || 0) : 0
        };
    }

    function extKnownGroups(rows) {
        const labels = new Map();
        function add(value, preferred) {
            const raw = text(value);
            const key = extDrgKey(raw);
            if (!key) return;
            const current = labels.get(key) || '';
            const candidate = text(preferred || raw || key) || key;
            if (!current || candidate.length > current.length || current === key) {
                labels.set(key, candidate);
            }
        }

        const configs = extReadDrgConfigs();
        Object.keys(configs).forEach(function (key) {
            add(key, configs[key] && configs[key].groupName);
        });
        const synced = extSyncedGroupProfiles();
        Object.keys(synced).forEach(function (key) {
            add(key, synced[key].name);
        });
        Object.values(extReadDiagnosisMap()).forEach(function (group) { add(group); });
        (rows || []).forEach(function (row) { add(row && row.drgGroup); });

        return Array.from(labels.entries()).map(function (entry) {
            return { key: entry[0], name: entry[1] || entry[0] };
        }).sort(function (a, b) {
            return a.key.localeCompare(b.key, 'zh-CN', { numeric: true });
        });
    }

    function extFindKnownGroup(value, rows) {
        const raw = text(value);
        const key = extDrgKey(raw);
        if (!key) return null;
        return extKnownGroups(rows).find(function (item) {
            return item.key === key || text(item.name) === raw;
        }) || null;
    }

    function extGroupDatalistHtml(rows) {
        return extKnownGroups(rows).map(function (item) {
            const profile = extEffectiveGroupProfile(item.name || item.key);
            const parts = [];

            if (profile && Number.isFinite(profile.quota)) {
                parts.push('疾病定额 ¥' + formatMoney(profile.quota));
            }
            if (profile && Number.isFinite(profile.dailyCost)) {
                parts.push('每日花费 ¥' + formatMoney(profile.dailyCost) + '/天');
            }
            if (profile && profile.hasSynced) {
                parts.push('DRG助手同步');
            } else if (profile && profile.hasLocal) {
                parts.push('本地设置');
            }

            const label = parts.length ? parts.join(' ｜ ') : 'DRG分组';
            return '<option value="' + escapeHtml(item.name || item.key) + '" label="' + escapeHtml(label) + '">' +
                escapeHtml(label) +
                '</option>';
        }).join('');
    }

    const EXT_DRG_MAP_PREVIEW_COLLAPSED_KEY = 'oha_inpatient_summary_drg_map_preview_collapsed_v1';

    function extReadMapPreviewCollapsed() {
        return extSafeJsonRead(EXT_DRG_MAP_PREVIEW_COLLAPSED_KEY, false) === true;
    }

    function extWriteMapPreviewCollapsed(collapsed) {
        extSafeJsonWrite(EXT_DRG_MAP_PREVIEW_COLLAPSED_KEY, Boolean(collapsed));
    }

    function extSavedMappingsHtml() {
        const map = extReadDiagnosisMap();
        const configs = extReadDrgConfigs();
        const diagnoses = Object.keys(map).sort(function (a, b) {
            return a.localeCompare(b, 'zh-CN');
        });

        if (!diagnoses.length) {
            return '<div class="oha-empty">尚未保存“主诊断 → DRG分组”映射。</div>';
        }

        return diagnoses.map(function (diagnosis) {
            const mappedName = text(map[diagnosis]);
            const group = extDrgKey(mappedName);
            const profile = extEffectiveGroupProfile(mappedName || group);
            const config = configs[group] || {};
            const quota = profile ? Number(profile.quota) : Number(config.quota);
            const daily = profile ? Number(profile.dailyCost) : Number(config.dailyCost);
            const adjustment = text((profile && profile.adjustment) || config.adjustment || '0%') || '0%';
            const groupName = text((profile && profile.name) || mappedName || group);
            return '<div class="oha-drg-map-item">' +
                '<span class="diag" title="' + escapeHtml(diagnosis) + '">' + escapeHtml(diagnosis) + '</span>' +
                '<strong title="' + escapeHtml(groupName) + '">' + escapeHtml(groupName || '—') + '</strong>' +
                '<span>定额：' + (Number.isFinite(quota) ? escapeHtml(formatMoney(quota)) : '—') + '</span>' +
                '<span>日均：' + (Number.isFinite(daily) ? escapeHtml(formatMoney(daily)) : '—') + '</span>' +
                '<span>报红：' + escapeHtml(adjustment) + '</span>' +
                '<button type="button" class="oha-drg-remove-map" data-diagnosis="' + escapeHtml(diagnosis) + '">移除</button>' +
                '</div>';
        }).join('');
    }

    function extDrgSettingsHtml(rows) {
        return `
<div class="oha-drg-settings">
    <div class="oha-drg-settings-title">
        <span>DRG预警设置</span>
        <span class="tip">DRG助手只同步“分组全名 + 疾病定额 + 每日花费”，不导入患者与DRG分组的对应关系；患者DRG仅按本页“主诊断 → DRG分组”映射确定。选择同步分组后自动带入数值，本地保存值优先。报红区间支持 0%、+5%、-5%、+100、-100。</span>
    </div>
    <div class="oha-drg-form">
        <label class="oha-drg-field">DRG分组
            <input type="text" class="oha-drg-group-input" list="${SCRIPT_PREFIX}-drg-groups" placeholder="输入或选择DRG完整名称（支持空格）">
            <datalist id="${SCRIPT_PREFIX}-drg-groups">${extGroupDatalistHtml(rows)}</datalist>
        </label>
        <label class="oha-drg-field">疾病定额（元）
            <input type="number" min="0" step="0.01" class="oha-drg-quota-input" placeholder="固定疾病定额">
        </label>
        <label class="oha-drg-field">每日花费预估（元/天）
            <input type="number" min="0.01" step="0.01" class="oha-drg-daily-input" value="${EXT_DEFAULT_DAILY_COST}">
        </label>
        <label class="oha-drg-field">报红区间
            <input type="text" class="oha-drg-adjust-input" value="0%" placeholder="0% / +5% / -100">
        </label>
        <button type="button" class="oha-drg-save primary">保存设置</button>
        <button type="button" class="oha-drg-delete-group danger">删除DRG设置</button>
    </div>
    <div class="oha-diagnosis-checks">${extDiagnosisChoicesHtml(rows)}</div>
    <div style="margin-top:7px;font-size:11px;color:#8a99a1;">
        剩余天数 = 向上取整［(疾病定额－当前在院费用) ÷ 每日花费预估］；达到疾病定额后显示0天。
        报红线 = 疾病定额按“报红区间”调整后的金额。
    </div>
    <div class="oha-drg-map-preview">
        <div class="oha-drg-map-preview-head">
            <span>已保存映射预览（${Object.keys(extReadDiagnosisMap()).length} 项）</span>
            <button type="button" class="oha-drg-map-toggle"
                aria-controls="${SCRIPT_PREFIX}-drg-map-preview-content"
                aria-expanded="${!extReadMapPreviewCollapsed()}"
                title="展开或折叠下方已保存的主诊断与DRG分组映射">
                ${extReadMapPreviewCollapsed() ? '展开' : '折叠'}
            </button>
        </div>
        <div id="${SCRIPT_PREFIX}-drg-map-preview-content" class="oha-drg-map-preview-content" ${extReadMapPreviewCollapsed() ? 'hidden' : ''}>
            <div class="oha-drg-map-list">${extSavedMappingsHtml()}</div>
        </div>
    </div>
</div>`;
    }

    function extLoadGroupConfigIntoForm(overlay) {
        const groupInput = overlay.querySelector('.oha-drg-group-input');
        const quotaInput = overlay.querySelector('.oha-drg-quota-input');
        const dailyInput = overlay.querySelector('.oha-drg-daily-input');
        const adjustInput = overlay.querySelector('.oha-drg-adjust-input');
        if (!groupInput || !quotaInput || !dailyInput || !adjustInput) return;

        const known = extFindKnownGroup(groupInput.value, lastRows);
        const profile = extEffectiveGroupProfile(known ? known.name : groupInput.value);
        const group = profile ? profile.key : extDrgKey(groupInput.value);

        quotaInput.value = profile && Number.isFinite(profile.quota)
            ? String(profile.quota)
            : '';

        dailyInput.value = profile && Number.isFinite(profile.dailyCost) && profile.dailyCost > 0
            ? String(profile.dailyCost)
            : String(EXT_DEFAULT_DAILY_COST);

        adjustInput.value = profile && text(profile.adjustment)
            ? text(profile.adjustment)
            : '0%';

        quotaInput.title = profile && profile.hasSynced && !profile.hasLocal
            ? '该值来自DRG助手同步，可直接修改后保存为本插件固定设置'
            : '';
        dailyInput.title = profile && profile.hasSynced && !profile.hasLocal
            ? '该值来自DRG助手同步，可直接修改后保存为本插件固定设置'
            : '';

        const map = extReadDiagnosisMap();
        overlay.querySelectorAll('.oha-drg-diag-checkbox').forEach(function (checkbox) {
            checkbox.checked = group && extDrgKey(map[checkbox.value]) === group;
        });
    }

    function extRefreshSummaryAfterSettings(message) {
        extDecorateRows(lastRows);
        renderSummary(lastRows.slice(), message || 'DRG预警设置已更新');
    }

    function extBindDrgSettings(overlay) {
        const groupInput = overlay.querySelector('.oha-drg-group-input');
        if (!groupInput) return;

        /* 只折叠预览列表，不隐藏DRG设置表单、诊断复选框或操作按钮。 */
        const previewToggle = overlay.querySelector('.oha-drg-map-toggle');
        const previewContent = overlay.querySelector('.oha-drg-map-preview-content');
        if (previewToggle && previewContent) {
            previewToggle.addEventListener('click', function () {
                const collapsed = !previewContent.hidden;
                previewContent.hidden = collapsed;
                previewToggle.textContent = collapsed ? '展开' : '折叠';
                previewToggle.setAttribute('aria-expanded', String(!collapsed));
                extWriteMapPreviewCollapsed(collapsed);
            });
        }

        function normalizeKnownGroupName() {
            const known = extFindKnownGroup(groupInput.value, lastRows);
            if (known && known.name) groupInput.value = known.name;
            extLoadGroupConfigIntoForm(overlay);
        }

        groupInput.addEventListener('change', normalizeKnownGroupName);
        /* 输入阶段不改写value，确保可以正常键入“IU23 + 空格 + 中文名称”。 */
        groupInput.addEventListener('input', function () {
            const known = extKnownGroups(lastRows).find(function (item) {
                return text(item.name) === text(groupInput.value);
            });
            if (known) extLoadGroupConfigIntoForm(overlay);
        });
        groupInput.addEventListener('blur', normalizeKnownGroupName);

        overlay.querySelector('.oha-drg-save').addEventListener('click', function () {
            const typedGroupName = text(groupInput.value);
            const group = extDrgKey(typedGroupName);
            if (!group) {
                window.alert('请先填写DRG分组。');
                return;
            }

            const quota = extNumber(overlay.querySelector('.oha-drg-quota-input').value);
            const daily = extNumber(overlay.querySelector('.oha-drg-daily-input').value);
            const adjustment = extParseAdjustment(
                overlay.querySelector('.oha-drg-adjust-input').value
            );

            if (!Number.isFinite(quota) || quota < 0) {
                window.alert('疾病定额应填写大于或等于0的金额。');
                return;
            }
            if (!Number.isFinite(daily) || daily <= 0) {
                window.alert('每日花费预估应填写大于0的金额。');
                return;
            }
            if (!adjustment.valid) {
                window.alert('报红区间格式不正确。可填写 0%、+5%、-5%、+100、-100 等。');
                return;
            }

            const known = extFindKnownGroup(typedGroupName, lastRows);
            const groupName = text((known && known.name) || typedGroupName || group);
            groupInput.value = groupName;

            const configs = extReadDrgConfigs();
            configs[group] = {
                groupName: groupName,
                quota: quota,
                dailyCost: daily,
                adjustment: adjustment.normalized,
                updatedAt: Date.now()
            };
            extWriteDrgConfigs(configs);

            const checked = Array.from(
                overlay.querySelectorAll('.oha-drg-diag-checkbox:checked')
            ).map(function (checkbox) {
                return extDiagnosisKey(checkbox.value);
            }).filter(Boolean);

            const map = extReadDiagnosisMap();
            checked.forEach(function (diagnosis) {
                map[diagnosis] = groupName;
            });
            extWriteDiagnosisMap(map);

            extRefreshSummaryAfterSettings(
                '已保存 ' + groupName + '：定额 ' + formatMoney(quota) +
                ' 元，每日花费 ' + formatMoney(daily) +
                ' 元，报红区间 ' + adjustment.normalized +
                (checked.length ? '；关联主诊断 ' + checked.length + ' 项' : '')
            );
        });

        overlay.querySelector('.oha-drg-delete-group').addEventListener('click', function () {
            const group = extDrgKey(groupInput.value);
            if (!group) {
                window.alert('请先填写或选择要删除的DRG分组。');
                return;
            }
            if (!window.confirm('确定删除 ' + group + ' 的预警设置，并解除所有指向该DRG分组的主诊断映射吗？')) {
                return;
            }

            const configs = extReadDrgConfigs();
            delete configs[group];
            extWriteDrgConfigs(configs);

            const map = extReadDiagnosisMap();
            Object.keys(map).forEach(function (diagnosis) {
                if (extDrgKey(map[diagnosis]) === group) {
                    delete map[diagnosis];
                }
            });
            extWriteDiagnosisMap(map);
            extRefreshSummaryAfterSettings('已删除 ' + group + ' 的DRG预警设置及对应主诊断映射');
        });

        overlay.querySelectorAll('.oha-drg-remove-map').forEach(function (button) {
            button.addEventListener('click', function () {
                const diagnosis = button.getAttribute('data-diagnosis') || '';
                const map = extReadDiagnosisMap();
                delete map[diagnosis];
                extWriteDiagnosisMap(map);
                extRefreshSummaryAfterSettings('已解除主诊断“' + diagnosis + '”的DRG映射');
            });
        });

        extLoadGroupConfigIntoForm(overlay);
    }

    tableRowsHtml = function (rows) {
        return (rows || []).map(function (row, index) {
            const warningClass = row.drgWarning ? ' class="oha-drg-warning-row"' : '';
            const feeClass = row.drgWarning ? 'money oha-drg-warning-fee' : 'money';
            const remainClass = row.remainingDays === 0
                ? 'oha-drg-remain oha-drg-remain-zero'
                : 'oha-drg-remain';

            const warningTitle = (
                Number.isFinite(row.drgWarningThreshold)
            )
                ? (
                    '疾病定额：' + formatMoney(row.drgQuota) + '元\n' +
                    '报红区间：' + (row.drgAdjustment || '0%') + '\n' +
                    '实际报红线：' + formatMoney(row.drgWarningThreshold) + '元\n' +
                    '每日花费预估：' + (
                        Number.isFinite(row.drgDailyCost)
                            ? formatMoney(row.drgDailyCost) + '元/天'
                            : '—'
                    )
                )
                : '';

            return '<tr' + warningClass + '>' +
                '<td class="nowrap">' + (index + 1) + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.admissionNo || '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.bedNo ? row.bedNo + '床' : '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.name || '—') + '</td>' +
                '<td class="oha-responsible">' + escapeHtml(row.responsibleDoctor || '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.sex || '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(row.age ? row.age + '岁' : '—') + '</td>' +
                '<td class="nowrap">' + escapeHtml(Number.isFinite(row.hospitalDays) ? row.hospitalDays + '天' : '—') + '</td>' +
                '<td title="' + escapeHtml(row.diagnosis || '') + '">' + escapeHtml(row.diagnosis || '—') + '</td>' +
                '<td class="oha-drg-group">' + escapeHtml(row.drgGroup || '—') + '</td>' +
                '<td class="money">' + escapeHtml(Number.isFinite(row.drgQuota) ? formatMoney(row.drgQuota) : '—') + '</td>' +
                '<td class="money">' + escapeHtml(Number.isFinite(row.drgDailyCost) ? formatMoney(row.drgDailyCost) : '—') + '</td>' +
                '<td class="' + remainClass + '">' + escapeHtml(Number.isFinite(row.remainingDays) ? row.remainingDays + '天' : '—') + '</td>' +
                '<td class="' + feeClass + '" title="' + escapeHtml(warningTitle) + '">' +
                    escapeHtml(Number.isFinite(row.fee) ? formatMoney(row.fee) : '—') +
                '</td>' +
                '</tr>';
        }).join('');
    };

    summaryText = function (rows) {
        const header = [
            '住院号', '床号', '患者姓名', '责任医师', '性别', '年龄',
            '住院天数', '主诊断', 'DRG分组', '疾病定额', '每日花费预估',
            '剩余天数', '总费用', '报红区间', '实际报红线'
        ];
        const lines = [header.join('\t')];
        (rows || []).forEach(function (row) {
            lines.push([
                row.admissionNo || '',
                row.bedNo ? row.bedNo + '床' : '',
                row.name || '',
                row.responsibleDoctor || '',
                row.sex || '',
                row.age ? row.age + '岁' : '',
                Number.isFinite(row.hospitalDays) ? row.hospitalDays + '天' : '',
                row.diagnosis || '',
                row.drgGroup || '',
                Number.isFinite(row.drgQuota) ? row.drgQuota.toFixed(2) : '',
                Number.isFinite(row.drgDailyCost) ? row.drgDailyCost.toFixed(2) : '',
                Number.isFinite(row.remainingDays) ? row.remainingDays + '天' : '',
                Number.isFinite(row.fee) ? row.fee.toFixed(2) : '',
                row.drgAdjustment || '',
                Number.isFinite(row.drgWarningThreshold) ? row.drgWarningThreshold.toFixed(2) : ''
            ].join('\t'));
        });
        return lines.join('\n');
    };

    exportSummaryCsv = function () {
        const header = [
            '住院号', '床号', '患者姓名', '责任医师', '性别', '年龄',
            '住院天数', '主诊断', 'DRG分组', '疾病定额', '每日花费预估',
            '剩余天数', '总费用', '报红区间', '实际报红线'
        ];
        const lines = [header.map(csvCell).join(',')];
        const rows = Array.isArray(currentViewRows) ? currentViewRows : lastRows;

        rows.forEach(function (row) {
            lines.push([
                row.admissionNo || '',
                row.bedNo ? row.bedNo + '床' : '',
                row.name || '',
                row.responsibleDoctor || '',
                row.sex || '',
                row.age ? row.age + '岁' : '',
                Number.isFinite(row.hospitalDays) ? row.hospitalDays + '天' : '',
                row.diagnosis || '',
                row.drgGroup || '',
                Number.isFinite(row.drgQuota) ? row.drgQuota.toFixed(2) : '',
                Number.isFinite(row.drgDailyCost) ? row.drgDailyCost.toFixed(2) : '',
                Number.isFinite(row.remainingDays) ? row.remainingDays + '天' : '',
                Number.isFinite(row.fee) ? row.fee.toFixed(2) : '',
                row.drgAdjustment || '',
                Number.isFinite(row.drgWarningThreshold) ? row.drgWarningThreshold.toFixed(2) : ''
            ].map(csvCell).join(','));
        });

        const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
            type: 'text/csv;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const now = new Date();
        const stamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            '_',
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0')
        ].join('');
        link.href = url;
        link.download = '住院患者当前页汇总_DRG_' + stamp + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        setProgress('CSV已导出');
    };

    function extApplyDetailTableExpandedState(overlay, expanded, persist) {
        if (!overlay) return;
        const wrap = overlay.querySelector('.oha-table-wrap');
        const toggle = overlay.querySelector('.oha-detail-toggle');
        if (!wrap || !toggle) return;

        const isExpanded = Boolean(expanded);
        wrap.classList.toggle('oha-detail-expanded', isExpanded);
        toggle.textContent = isExpanded ? '折叠' : '展开';
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.title = isExpanded
            ? '折叠患者关联明细：恢复明细区独立纵向滚动条'
            : '展开患者关联明细：取消明细区高度限制，改用汇总窗口一级纵向滚动条';

        if (isExpanded) wrap.scrollTop = 0;
        if (persist) extWriteDetailTableExpanded(isExpanded);

        if (extIsTableAutoLayout()) {
            window.requestAnimationFrame(function () {
                if (overlay.isConnected) extFitTableToViewport(overlay, false);
            });
        }
    }

    function extBindDetailTableToggle(overlay) {
        if (!overlay) return;
        const toggle = overlay.querySelector('.oha-detail-toggle');
        if (!toggle) return;

        extApplyDetailTableExpandedState(overlay, extReadDetailTableExpanded(), false);

        toggle.addEventListener('click', function () {
            const wrap = overlay.querySelector('.oha-table-wrap');
            if (!wrap) return;
            const nextExpanded = !wrap.classList.contains('oha-detail-expanded');
            extApplyDetailTableExpandedState(overlay, nextExpanded, true);
        });
    }

    renderSummary = function (rows, statusText) {
        ensureStyle();
        extEnsureStyle();
        closeSummary();

        extDecorateRows(rows);
        lastRows = rows.slice();
        currentViewRows = null;
        tableViewState = { diagnosis: '', responsibleDoctor: '', drgGroup: '', patientNames: [], admissionNos: [], sortKey: 'bedNo', sortDirection: 'asc' };

        const feeRows = rows.filter(function (row) {
            return Number.isFinite(row.fee);
        });
        const totalFee = feeRows.reduce(function (sum, row) {
            return sum + row.fee;
        }, 0);
        const averageFee = feeRows.length ? totalFee / feeRows.length : null;

        const dayRows = rows.filter(function (row) {
            return Number.isFinite(row.hospitalDays);
        });
        const averageDays = dayRows.length
            ? dayRows.reduce(function (sum, row) {
                return sum + row.hospitalDays;
            }, 0) / dayRows.length
            : null;

        const warningCount = rows.filter(function (row) {
            return row.drgWarning;
        }).length;

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = `
<div class="oha-summary-modal" role="dialog" aria-modal="true">
    <div class="oha-summary-head">
        <span>住院患者一览 · 当前页汇总 / DRG预警</span>
        <span class="spacer"></span>
        <button type="button" class="oha-summary-close" title="关闭">×</button>
    </div>
    <div class="oha-summary-body">
        <div class="oha-summary-cards">
            <div class="oha-kpi"><div class="label">当前显示患者</div><div class="value">${rows.length}</div></div>
            <div class="oha-kpi"><div class="label">当前页总费用</div><div class="value">${feeRows.length ? '¥' + formatMoney(totalFee) : '--'}</div></div>
            <div class="oha-kpi"><div class="label">人均费用</div><div class="value">${Number.isFinite(averageFee) ? '¥' + formatMoney(averageFee) : '--'}</div></div>
            <div class="oha-kpi"><div class="label">平均住院日</div><div class="value">${Number.isFinite(averageDays) ? averageDays.toFixed(1) + ' 天' : '--'}</div></div>
            <div class="oha-kpi"><div class="label">DRG报红患者</div><div class="value">${warningCount}</div></div>
        </div>

        ${extDrgSettingsHtml(rows)}

        <div class="oha-viz-grid">
            <div class="oha-panel">
                <div class="oha-panel-title">费用 Top 5</div>
                ${barRowsHtml(feeTopRows(rows), function (value) { return '¥' + formatMoney(value); })}
            </div>
            <div class="oha-panel">
                <div class="oha-panel-title">主诊断分布（前 8 项）</div>
                ${barRowsHtml(diagnosisStats(rows), function (value) { return String(value) + '人'; })}
            </div>
        </div>

        <div class="oha-panel-title oha-detail-title">
            <span>患者关联明细</span>
            <span class="oha-detail-count">显示 ${rows.length} / ${rows.length} 名</span>
            <button type="button" class="oha-detail-toggle" aria-expanded="false"
                title="展开患者关联明细：取消明细区高度限制，改用汇总窗口一级纵向滚动条">展开</button>
        </div>
        <div class="oha-table-wrap">
            <table class="oha-detail-table">
                ${extDetailColgroupHtml()}
                <thead>
                    <tr class="oha-header-row">
                        ${extColumnHeaderHtml('#', 'index')}
                        ${extColumnHeaderHtml('住院号', 'admissionNo')}
                        ${extColumnHeaderHtml('床号 <span class="oha-sort-arrow">▲</span>', 'bedNo', 'oha-sortable oha-sort-active', 'data-sort-key="bedNo" title="点击按床号排序"')}
                        ${extColumnHeaderHtml('患者姓名', 'name')}
                        ${extColumnHeaderHtml('责任医师', 'responsibleDoctor')}
                        ${extColumnHeaderHtml('性别', 'sex')}
                        ${extColumnHeaderHtml('年龄', 'age')}
                        ${extColumnHeaderHtml('住院天数 <span class="oha-sort-arrow">↕</span>', 'hospitalDays', 'oha-sortable', 'data-sort-key="hospitalDays" title="点击按住院天数排序"')}
                        ${extColumnHeaderHtml('主诊断', 'diagnosis', 'oha-diagnosis-th')}
                        ${extColumnHeaderHtml('DRG分组', 'drgGroup')}
                        ${extColumnHeaderHtml('疾病定额', 'drgQuota', '', 'style="text-align:right;"')}
                        ${extColumnHeaderHtml('每日花费', 'drgDailyCost', '', 'style="text-align:right;"')}
                        ${extColumnHeaderHtml('剩余天数 <span class="oha-sort-arrow">↕</span>', 'remainingDays', 'oha-sortable', 'data-sort-key="remainingDays" title="点击按预计剩余天数排序"')}
                        ${extColumnHeaderHtml('总费用（元） <span class="oha-sort-arrow">↕</span>', 'fee', 'oha-sortable', 'data-sort-key="fee" style="text-align:right;" title="点击按总费用排序"')}
                    </tr>
                    <tr class="oha-filter-row">
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'index')}
                        ${extFilterCellHtml('<button type="button" class="oha-manual-filter-btn" data-filter-kind="admissionNo">筛选</button>', 'admissionNo')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'bedNo')}
                        ${extFilterCellHtml('<button type="button" class="oha-manual-filter-btn" data-filter-kind="name">筛选</button>', 'name')}
                        ${extFilterCellHtml('<select class="oha-responsible-filter" title="按责任医师筛选患者关联明细">' + responsibleDoctorSelectOptionsHtml(rows) + '</select>', 'responsibleDoctor')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'sex')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'age')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'hospitalDays')}
                        ${extFilterCellHtml('<select class="oha-diagnosis-filter" title="按当前汇总中已有的主诊断筛选">' + diagnosisSelectOptionsHtml(rows) + '</select>', 'diagnosis')}
                        ${extFilterCellHtml('<select class="oha-drg-group-filter" title="按当前汇总中的DRG分组筛选">' + drgGroupSelectOptionsHtml(rows) + '</select>', 'drgGroup')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'drgQuota')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'drgDailyCost')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'remainingDays')}
                        ${extFilterCellHtml('<span class="oha-filter-placeholder">—</span>', 'fee')}
                    </tr>
                </thead>
                <tbody class="oha-detail-tbody">${tableRowsHtml(rows)}</tbody>
            </table>
        </div>
    </div>
    <div class="oha-summary-foot">
        <div id="${SCRIPT_PREFIX}-progress" class="status">${escapeHtml(statusText || ('已汇总当前页 ' + rows.length + ' 名可见患者'))}</div>
        <button type="button" class="oha-auto-layout" title="按明细表可用宽度自动分配各列，消除横向滚动；记忆自适应模式">自适应布局</button>
        <button type="button" class="oha-reset-layout" title="清除已保存的列宽并恢复默认布局">重置布局</button>
        <button type="button" class="oha-copy">复制表格</button>
        <button type="button" class="oha-export">导出CSV</button>
        <button type="button" class="oha-refresh-summary primary">重新汇总</button>
        <button type="button" class="oha-summary-close">关闭</button>
    </div>
</div>`;

        document.body.appendChild(overlay);
        overlay.querySelectorAll('.oha-summary-close').forEach(function (button) {
            button.addEventListener('click', closeSummary);
        });
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeSummary();
        });
        const autoLayoutButton = overlay.querySelector('.oha-auto-layout');
        if (autoLayoutButton) {
            autoLayoutButton.addEventListener('click', function () {
                if (extFitTableToViewport(overlay, true)) {
                    extSafeJsonWrite(EXT_TABLE_AUTO_LAYOUT_KEY, true);
                }
            });
        }
        const resetLayoutButton = overlay.querySelector('.oha-reset-layout');
        if (resetLayoutButton) {
            resetLayoutButton.addEventListener('click', function () {
                extResetTableColumnWidths(overlay);
            });
        }
        overlay.querySelector('.oha-copy').addEventListener('click', copySummaryTable);
        overlay.querySelector('.oha-export').addEventListener('click', exportSummaryCsv);
        overlay.querySelector('.oha-refresh-summary').addEventListener('click', runSummary);

        bindTableControls(overlay);
        extBindColumnResizers(overlay);
        extBindDrgSettings(overlay);
        extBindDetailTableToggle(overlay);
        updateTableView(overlay);
    };

    function extAllManagedCards() {
        const set = new Set();
        getVisiblePatientCards().forEach(function (card) {
            set.add(card);
        });
        document.querySelectorAll('[data-oha-responsible-managed="1"]').forEach(function (card) {
            if (card instanceof HTMLElement && card.isConnected) {
                set.add(card);
            }
        });
        return Array.from(set);
    }

    function extResponsibleLine(card) {
        let line = card.querySelector('.' + SCRIPT_PREFIX + '-doctor-line');
        if (!line) {
            line = document.createElement('div');
            line.className = SCRIPT_PREFIX + '-doctor-line';
            card.appendChild(line);
        }
        return line;
    }

    function extApplyResponsibleToCards() {
        if (!extFeatureRuntimeEnabled) return;
        const records = extReadSyncCache().records || [];
        const syncedRows = extLastDoctorSync.rows;
        const cards = getVisiblePatientCards();
        if (!cards.length) {
            extRefreshDoctorFilterOptions();
            return;
        }

        let rows = cards.map(readCardBase);
        enrichRowsFromRuntimeIndex(rows);
        const showResponsibleDoctor = extShowResponsibleDoctorEnabled();

        rows.forEach(function (row) {
            const card = row.card;
            /* 只复用本次按钮操作对应的卡片节点，不把上一页的同名患者误认作当前患者。 */
            const buttonMatched = syncedRows.find(function (item) {
                return item.card === card;
            }) || null;
            const liveMatched = Array.isArray(lastRows) && lastRows.length
                ? extMatchSyncedRecord(row, lastRows)
                : null;
            const syncedMatched = extMatchSyncedRecord(row, records);
            const liveDoctor = buttonMatched
                ? text(buttonMatched.responsibleDoctor)
                : (liveMatched ? text(liveMatched.responsibleDoctor) : '');
            const syncedDoctor = syncedMatched ? text(syncedMatched.responsibleDoctor) : '';
            /*
             * v1.3.26：只要当前汇总已经匹配到患者，责任医师空值也是有效实时结果，
             * 不再回退DRG助手旧快照；只有尚无当前汇总记录时才保留旧版兼容显示。
             */
            const doctor = buttonMatched || liveMatched ? liveDoctor : syncedDoctor;
            const sourceLabel = buttonMatched
                ? (buttonMatched._ohaRealtime8997
                    ? (buttonMatched._oha8997Cached ? '8997名单缓存' : '8997实时接口')
                    : (buttonMatched._ohaResponsibleDoctorSource === '8997-cache'
                        ? '8997上次同步缓存' : 'DRG助手兜底'))
                : (liveMatched
                    ? '当前汇总实时数据'
                    : (syncedMatched && syncedMatched.doctorSource === '8997'
                        ? '8997上次同步缓存' : 'DRG助手同步兼容'));
            const identityMatched = buttonMatched || liveMatched || syncedMatched;

            card.dataset.ohaResponsibleManaged = '1';
            card.dataset.ohaResponsibleDoctor = doctor;
            if (identityMatched && identityMatched.admissionNo) {
                card.dataset.ohaResponsibleAdmissionNo = identityMatched.admissionNo;
            }

            const oldLine = card.querySelector('.' + SCRIPT_PREFIX + '-doctor-line');
            if (doctor && showResponsibleDoctor) {
                const line = oldLine || extResponsibleLine(card);
                line.textContent = doctor;
                line.title = '责任医师：' + doctor + '（' + sourceLabel + '）';
            } else if (oldLine) {
                oldLine.remove();
            }
        });

        extRefreshDoctorFilterOptions();
        extApplyDoctorFilter();
    }

    function extManagerCandidateDocuments() {
        const result = [];
        const seen = new Set();

        function add(doc) {
            if (!doc || seen.has(doc)) return;
            seen.add(doc);
            result.push(doc);
        }

        add(document);

        try {
            const pageWindow = getPageWindow();
            if (pageWindow && pageWindow.document) add(pageWindow.document);

            let current = pageWindow;
            for (let depth = 0; current && depth < 8; depth += 1) {
                try {
                    if (current.document) add(current.document);
                    if (!current.parent || current.parent === current) break;
                    current = current.parent;
                } catch (error) {
                    break;
                }
            }

            try {
                if (pageWindow && pageWindow.top && pageWindow.top.document) {
                    add(pageWindow.top.document);
                }
            } catch (error) {}
        } catch (error) {}

        return result;
    }

    function extFindManagerDrgControls() {
        const documents = extManagerCandidateDocuments();
        for (const doc of documents) {
            try {
                const host = doc.getElementById(EXT_MANAGER_HOST_ID);
                const root = host && host.shadowRoot;
                if (!root) continue;

                const enabled = root.querySelector(EXT_MANAGER_DRG_ENABLED_SELECTOR);
                const select = root.querySelector(EXT_MANAGER_DRG_DOCTOR_SELECTOR);
                if (enabled && select) {
                    return {
                        document: doc,
                        root: root,
                        enabled: enabled,
                        select: select
                    };
                }
            } catch (error) {
                /* 跨框架或管理器正在重建时继续尝试其他同源document。 */
            }
        }
        return null;
    }

    function extManagerDrgFilterEnabled() {
        const controls = extFindManagerDrgControls();
        return Boolean(controls && controls.enabled && controls.enabled.checked);
    }

    function extSetLocalDoctorSelection(value, applyFilter) {
        const doctor = text(value || '');
        const select = document.getElementById(EXT_DOCTOR_FILTER_ID);

        if (select) {
            const exists = Array.from(select.options).some(function (option) {
                return option.value === doctor;
            });
            if (doctor && !exists) {
                const option = document.createElement('option');
                option.value = doctor;
                option.textContent = doctor;
                select.appendChild(option);
            }
            select.value = doctor;
        }

        extSelectedDoctor = doctor;
        if (applyFilter !== false) extApplyDoctorFilter();
    }

    function extPullDoctorSelectionFromManager() {
        const controls = extFindManagerDrgControls();
        if (!controls || !controls.enabled.checked) return false;
        extSetLocalDoctorSelection(controls.select.value || '', true);
        return true;
    }

    function extPushDoctorSelectionToManager(value) {
        const controls = extFindManagerDrgControls();
        if (!controls || !controls.enabled.checked) return false;

        const doctor = text(value || '');
        const optionExists = Array.from(controls.select.options).some(function (option) {
            return option.value === doctor;
        });
        if (doctor && !optionExists) return false;

        if (controls.select.value !== doctor) {
            controls.select.value = doctor;
        }

        try {
            const ownerWindow = controls.select.ownerDocument &&
                controls.select.ownerDocument.defaultView;
            const EventCtor = ownerWindow && ownerWindow.Event
                ? ownerWindow.Event
                : Event;
            controls.select.dispatchEvent(
                new EventCtor('change', { bubbles: true, composed: true })
            );
        } catch (error) {
            try {
                controls.select.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (ignore) {
                return false;
            }
        }
        return true;
    }

    function extBindManagerRuntimeDocument(doc) {
        if (!doc || extManagerRuntimeDocument === doc) return;
        extManagerRuntimeDocument = doc;
        try {
            doc.addEventListener(
                EXT_MANAGER_OPENHIS_RUNTIME_EVENT,
                function (event) {
                    if (!extFeatureRuntimeEnabled) return;
                    const detail = event && event.detail || {};
                    if (detail.drgFilterEnabled === true) {
                        extSetLocalDoctorSelection(
                            detail.drgSelectedDoctor || '',
                            true
                        );
                    } else {
                        /*
                         * v1.3.17：管理器退出DRG助手筛选（包括切到自定义患者筛选）后，
                         * 主页面下拉立即恢复v1.3.15“当前页责任医师”显示模式。
                         */
                        extRefreshDoctorFilterOptions();
                        extApplyDoctorFilter();
                    }
                }
            );
        } catch (error) {}
    }

    function extEnsureManagerDrgLink() {
        const controls = extFindManagerDrgControls();
        if (!controls) return false;

        extBindManagerRuntimeDocument(controls.document);

        if (!controls.select.__ohaSummaryDoctorLinkedV1316) {
            controls.select.__ohaSummaryDoctorLinkedV1316 = true;
            controls.select.addEventListener('change', function () {
                if (!extFeatureRuntimeEnabled) return;
                if (controls.enabled.checked) {
                    extSetLocalDoctorSelection(controls.select.value || '', true);
                }
            });
        }

        if (!controls.enabled.__ohaSummaryDoctorLinkedV1316) {
            controls.enabled.__ohaSummaryDoctorLinkedV1316 = true;
            controls.enabled.addEventListener('change', function () {
                if (!extFeatureRuntimeEnabled) return;
                window.setTimeout(function () {
                    extRefreshDoctorFilterOptions();
                    if (controls.enabled.checked) {
                        extPullDoctorSelectionFromManager();
                    } else {
                        /* 退出DRG模式后仅保留住院患者一览当前页本地筛选。 */
                        extApplyDoctorFilter();
                    }
                }, 0);
            });
        }

        if (controls.enabled.checked) {
            extPullDoctorSelectionFromManager();
        }
        return true;
    }

    function extScheduleManagerDrgLink() {
        if (!extFeatureRuntimeEnabled) return;
        clearTimeout(extManagerDrgLinkTimer);
        extManagerDrgLinkTimer = window.setTimeout(function () {
            extManagerDrgLinkTimer = null;
            try {
                extEnsureManagerDrgLink();
            } catch (error) {
                console.warn('[住院患者一览汇总] DRG责任医师联动初始化失败：', error);
            }
        }, 80);
    }

    function extRefreshDoctorFilterOptions() {
        const select = document.getElementById(EXT_DOCTOR_FILTER_ID);
        if (!select) return;

        const managerControls = extFindManagerDrgControls();
        const managerDrgMode = Boolean(
            managerControls &&
            managerControls.enabled &&
            managerControls.enabled.checked
        );

        if (managerDrgMode) {
            /*
             * DRG助手筛选模式：沿用v1.3.16。
             * 候选与悬浮框管理器统一按共享DRG缓存统计，并显示患者人数。
             */
            const counts = new Map();
            const cache = extReadSyncCache();
            const records = cache.records || [];
            records.forEach(function (record) {
                const doctor = text(record && record.responsibleDoctor);
                if (!doctor) return;
                counts.set(doctor, (counts.get(doctor) || 0) + 1);
            });

            /* 共享缓存尚未形成时，退回当前页已标记卡片，避免菜单为空。 */
            if (!counts.size && !cache.syncedAt) {
                extAllManagedCards().forEach(function (card) {
                    const doctor = text(card.dataset.ohaResponsibleDoctor || '');
                    if (!doctor) return;
                    counts.set(doctor, (counts.get(doctor) || 0) + 1);
                });
            }

            const total = Array.from(counts.values()).reduce(function (sum, count) {
                return sum + Number(count || 0);
            }, 0);
            const current = text(managerControls.select.value || '');

            let html = '<option value="">全部责任医师（' + total + '）</option>';
            Array.from(counts.entries()).sort(function (a, b) {
                return a[0].localeCompare(b[0], 'zh-CN');
            }).forEach(function (entry) {
                html += '<option value="' + escapeHtml(entry[0]) + '">' +
                    escapeHtml(entry[0]) + '（' + entry[1] + '）</option>';
            });

            select.innerHTML = html;
            if (Array.from(select.options).some(function (option) {
                return option.value === current;
            })) {
                select.value = current;
                extSelectedDoctor = current;
            } else {
                select.value = '';
                extSelectedDoctor = '';
            }
            select.title = 'DRG助手筛选模式：与悬浮框管理器DRG责任医师同步，并联动筛选病历管理患者';
            return;
        }

        /*
         * v1.3.17：自定义患者筛选模式（以及未启用DRG筛选时）恢复v1.3.15。
         * 只根据当前页已标记患者生成菜单，不展示共享DRG缓存中的全名单/人数。
         */
        const doctors = new Set();
        let emptyCount = 0;

        extAllManagedCards().forEach(function (card) {
            const doctor = text(card.dataset.ohaResponsibleDoctor || '');
            if (doctor) doctors.add(doctor);
            else emptyCount += 1;
        });

        const current = extSelectedDoctor || select.value || '';
        let html = '<option value="">全部责任医师</option>';
        Array.from(doctors).sort(function (a, b) {
            return a.localeCompare(b, 'zh-CN');
        }).forEach(function (doctor) {
            html += '<option value="' + escapeHtml(doctor) + '">' + escapeHtml(doctor) + '</option>';
        });
        if (emptyCount > 0) {
            html += '<option value="__EMPTY__">未设置责任医师</option>';
        }

        select.innerHTML = html;
        if (Array.from(select.options).some(function (option) {
            return option.value === current;
        })) {
            select.value = current;
            extSelectedDoctor = current;
        } else {
            select.value = '';
            extSelectedDoctor = '';
        }
        select.title = '当前页责任医师筛选（兼容v1.3.15显示模式；不联动管理器DRG筛选）';
    }

    function extApplyDoctorFilter() {
        if (!extFeatureRuntimeEnabled) return;
        const selected = extSelectedDoctor || '';
        extAllManagedCards().forEach(function (card) {
            const doctor = text(card.dataset.ohaResponsibleDoctor || '');
            const show = !selected ||
                (selected === '__EMPTY__' ? !doctor : doctor === selected);
            card.classList.toggle(SCRIPT_PREFIX + '-doctor-hidden', !show);
        });
    }

    function extMatchDoctorIdentity(row, records) {
        const admissionNo = normalizeAdmissionNo(row && row.admissionNo);
        const items = Array.isArray(records) ? records : [];
        if (admissionNo) {
            const byAdmission = items.filter(function (item) {
                return normalizeAdmissionNo(item && (
                    item.mrId || item.MRID || item.zyh || item.admissionNo || ''
                )) === admissionNo;
            });
            if (byAdmission.length === 1) return byAdmission[0];
            if (byAdmission.length > 1) return null;
        }
        const name = compact(row && row.name);
        const bedNo = normalizeBed(row && row.bedNo);
        if (!name || !bedNo) return null;
        const matches = items.filter(function (item) {
            const itemNo = normalizeAdmissionNo(item && (
                item.mrId || item.MRID || item.zyh || item.admissionNo || ''
            ));
            return (!admissionNo || !itemNo || itemNo === admissionNo) &&
                compact(item && (item.name || item.xm || '')) === name &&
                normalizeBed(item && (item.bedNumber || item.cwmc || item.bedNo || '')) === bedNo;
        });
        return matches.length === 1 ? matches[0] : null;
    }

    function extApplyDirectDoctorPriority(rows, records) {
        let matched = 0;
        let filled = 0;
        (rows || []).forEach(function (row) {
            const item = extMatchDoctorIdentity(row, records);
            if (!item) return;
            row.responsibleDoctor = directManagementResponsibleDoctor(item);
            row._ohaRealtime8997 = true;
            row._ohaResponsibleDoctorSource = '8997';
            if (!row.admissionNo) {
                row.admissionNo = normalizeAdmissionNo(
                    item.mrId || item.MRID || item.zyh || item.admissionNo || ''
                );
            }
            matched += 1;
            if (row.responsibleDoctor) filled += 1;
        });
        return { matched: matched, filled: filled };
    }

    function extMergeSyncedDoctors(targetRows, syncedRows) {
        (targetRows || []).forEach(function (row) {
            const synced = extMatchDoctorIdentity(row, syncedRows);
            if (!synced) return;
            row.responsibleDoctor = text(synced.responsibleDoctor);
            /* 本次8997未匹配的患者允许使用本次DRG助手兜底，覆盖上次实时标记。 */
            row._ohaRealtime8997 = synced._ohaRealtime8997 === true;
            row._oha8997Cached = synced._oha8997Cached === true;
            row._ohaResponsibleDoctorSource = text(synced._ohaResponsibleDoctorSource);
        });
    }

    function extBuildDoctorSyncCacheRecords(sourceRecords) {
        /* 单一助手来源仅在8997不可用时使用，不追加其它患者名单。 */
        return (sourceRecords || []).map(function (record) {
            return {
                admissionNo: record.admissionNo || '', name: record.name || '', bedNo: record.bedNo || '',
                responsibleDoctor: text(record.responsibleDoctor),
                doctorSource: record.doctorSource === '8997' ? '8997' : '',
                drgGroup: '', drgAllocationFee: null, drgDailyCost: null
            };
        }).filter(function (record) { return record.admissionNo || record.name || record.bedNo; });
    }

    function extBuildDirectDoctorSyncCacheRecords(rows) {
        /* 读取完整8997名单，不能以当前页卡片子集或旧助手名单代替。 */
        const records = new Map();
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
            const source = row && typeof row === 'object' ? row : {};
            const admissionNo = normalizeAdmissionNo(
                source.mrId || source.MRID || source.zyh || source.ZYH || source.admissionNo || ''
            );
            const name = text(source.name || source.xm || source.XM || '');
            const bedNo = normalizeBed(source.bedNumber || source.cwmc || source.CWMC || source.bedNo || '');
            if (!admissionNo && !(name && bedNo)) return;
            const key = admissionNo ? 'N|' + admissionNo : 'P|' + compact(name) + '|' + bedNo;
            records.set(key, {
                admissionNo: admissionNo, name: name, bedNo: bedNo,
                responsibleDoctor: directManagementResponsibleDoctor(source), doctorSource: '8997',
                drgGroup: '', drgAllocationFee: null, drgDailyCost: null
            });
        });
        return Array.from(records.values());
    }

    async function extSyncDrgAssistant() {
        if (!extFeatureRuntimeEnabled || extDrgSyncInFlight) return;
        if (summaryRunning) {
            window.alert('当前页正在汇总，请等待汇总结束后再同步DRG助手。');
            return;
        }
        extDrgSyncInFlight = true;
        const button = document.getElementById(EXT_SYNC_BUTTON_ID);
        const oldText = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = '同步中…';
        }

        try {
            /* 恢复本插件隐藏的卡片，按当前页患者身份匹配8997与DRG助手数据。 */
            extAllManagedCards().forEach(function (card) {
                card.classList.remove(SCRIPT_PREFIX + '-doctor-hidden');
            });
            const signature = summaryPageSignature();
            const rows = getVisiblePatientCards().map(readCardBase);
            enrichRowsFromRuntimeIndex(rows);
            rows.forEach(function (row) {
                row.responsibleDoctor = '';
                row._ohaRealtime8997 = false;
                row._oha8997Cached = false;
                row._ohaResponsibleDoctorSource = '';
            });

            let directResult = null;
            let directError = '';
            let directStats = { matched: 0, filled: 0 };
            try {
                directResult = await directRequestMedicalManagementPatients(true);
                if (!directResult || !Array.isArray(directResult.rows) ||
                    (directResult.total != null && Number(directResult.total) !== directResult.rows.length)) {
                    throw new Error('8997同步名单不完整，保留原有回退策略');
                }
                directStats = extApplyDirectDoctorPriority(rows, directResult.rows);
                rows.forEach(function (row) { if (row._ohaRealtime8997) row._oha8997Cached = directResult.cached === true; });
            } catch (error) {
                directResult = null;
                directError = String(error && error.message || error);
                console.warn('[住院患者一览汇总] 同步DRG助手：8997责任医师不可用，尝试DRG助手兜底：', error);
            }

            const hasDirectRoster = Boolean(directResult && Array.isArray(directResult.rows));
            let source = null;
            let sourceError = '';
            try {
                source = await extReadDrgAssistantSource();
            } catch (error) {
                sourceError = String(error && error.message || error);
            }
            if (!hasDirectRoster && !source) {
                throw new Error(
                    (directError ? '8997：' + directError + '；' : '8997未匹配当前页患者；') +
                    'DRG助手快照桥及共享本地缓存也不可用' +
                    (sourceError ? '（' + sourceError + '）' : '')
                );
            }

            const sourceRecords = source && Array.isArray(source.records) ? source.records : [];
            const records = hasDirectRoster
                ? extBuildDirectDoctorSyncCacheRecords(directResult.rows)
                : extBuildDoctorSyncCacheRecords(sourceRecords);
            const groupProfiles = source && Array.isArray(source.groupProfiles)
                ? source.groupProfiles
                : [];
            const fallbackStats = !hasDirectRoster && source
                ? extApplyDrgAssistantDoctorFallback(rows, records, source.sourceType)
                : { matched: 0, filled: 0 };

            /* 成功的完整8997名单直接替换（含空名单），不混入助手患者或当前页子集。 */
            if (hasDirectRoster || (source && source.sourceType === 'bridge')) {
                const saved = extWriteSyncCache({
                    syncedAt: new Date().toISOString(),
                    capturedAt: hasDirectRoster ? directResult.capturedAt || '' : source.capturedAt || '',
                    records: records,
                    groupProfiles: groupProfiles
                });
                if (!saved) throw new Error('DRG助手共享名单保存失败，请重新同步');
            }

            extLastDoctorSync = { signature: signature, rows: rows };
            if (Array.isArray(lastRows) && lastRows.length) {
                extMergeSyncedDoctors(lastRows, rows);
            }
            if (summaryCache && summaryCache.signature === signature) {
                extMergeSyncedDoctors(summaryCache.rows, rows);
            }
            extApplyResponsibleToCards();

            const doctorStatus = hasDirectRoster
                ? '8997责任医师匹配 ' + directStats.matched + '/' + rows.length +
                    ' 名（非空 ' + directStats.filled + ' 名）'
                : (directError ? '8997不可用，已尝试DRG助手兜底' : '8997未匹配当前页，已尝试DRG助手兜底');
            const groupStatus = source
                ? (source.sourceType === 'bridge' ? 'DRG助手快照桥' : 'DRG助手共享本地缓存') +
                    '提供 ' + groupProfiles.length + ' 个DRG分组字典项'
                : 'DRG助手无可用字典';
            const status = doctorStatus + (hasDirectRoster
                ? '；患者名单以8997为准，共 ' + records.length + ' 名；'
                : '；DRG助手兜底 ' + fallbackStats.filled + ' 名；') + groupStatus;

            if (document.getElementById(OVERLAY_ID) && Array.isArray(lastRows) && lastRows.length) {
                renderSummary(lastRows.slice(), status);
            }
            if (button) {
                button.title = status + (directError ? '；8997错误：' + directError : '');
                button.textContent = hasDirectRoster
                    ? '8997已同步'
                    : (source && source.sourceType === 'bridge'
                        ? '已用助手快照'
                        : '已用本地缓存');
                setTimeout(function () {
                    if (button.isConnected) button.textContent = '同步DRG助手';
                }, 1800);
            }
        } catch (error) {
            window.alert('同步DRG助手失败：' + String(error && error.message || error));
            if (button) button.textContent = oldText || '同步DRG助手';
        } finally {
            extDrgSyncInFlight = false;
            if (button) button.disabled = false;
            extApplyDoctorFilter();
        }
    }


    async function extTestDirectPatientApi() {
        const button = document.getElementById(EXT_DIRECT_TEST_BUTTON_ID);
        const oldText = button ? button.textContent : '测试直连';
        if (button) {
            button.disabled = true;
            button.textContent = '直连测试中…';
        }
        try {
            const result = await directRequestMedicalManagementPatients(true);
            const visibleRows = getVisiblePatientCards().map(readCardBase);
            let matched = 0;
            visibleRows.forEach(function (row) {
                if (directMatchManagementPatient(row, result.rows)) matched += 1;
            });

            console.log(
                '[住院患者一览汇总][8997实时接口诊断] 成功',
                {
                    total: result.total,
                    returned: result.rows.length,
                    visible: visibleRows.length,
                    matched: matched,
                    authCapturedAt: result.auth && result.auth.capturedAt,
                    authSource: result.auth && result.auth.source,
                    sample: result.rows.slice(0, 3)
                }
            );

            if (button) button.textContent = '直连 ' + result.rows.length + '人';
            window.alert(
                '医疗管理系统实时接口连接成功。\n\n' +
                '8997返回：' + result.rows.length + ' 名（total=' + result.total + '）\n' +
                '当前HIS可见：' + visibleRows.length + ' 名\n' +
                '成功匹配：' + matched + ' 名\n' +
                '数据时间：' + (result.capturedAt || directAuthAgeLabel(result.auth)) + '\n\n' +
                (result.provider === 'suite-manager'
                    ? '说明：本次复用管理器同步DRG助手的独立8997请求结果。'
                    : '说明：本次由患者一览独立请求8997获得。')
            );
            setTimeout(function () {
                if (button && button.isConnected) button.textContent = oldText;
            }, 3000);
        } catch (error) {
            console.warn('[住院患者一览汇总][8997实时接口诊断] 失败：', error);
            if (button) button.textContent = oldText;
            window.alert(
                '医疗管理系统实时接口连接失败：\n' +
                String(error && error.message || error)
            );
        } finally {
            if (button) button.disabled = false;
        }
    }

    function extCreateRightControls() {
        const controls = document.createElement('div');
        controls.id = EXT_CONTROL_PANEL_ID;

        let summaryButton = document.getElementById(BUTTON_ID);
        if (!summaryButton) {
            summaryButton = createSummaryButton();
        }
        controls.appendChild(summaryButton);

        const syncButton = document.createElement('button');
        syncButton.id = EXT_SYNC_BUTTON_ID;
        const sharedSync = extDrgBridgeCandidates(EXT_SHARED_DRG_SYNC_BRIDGE)[0];
        syncButton.disabled = extDrgSyncInFlight || Boolean(sharedSync && sharedSync.isBusy && sharedSync.isBusy());
        syncButton.type = 'button';
        syncButton.textContent = '同步DRG助手';
        syncButton.title = '责任医师优先读取8997 attendDoc，未匹配患者回退DRG助手快照/共享缓存；DRG分组字典仍来自助手。8003 ysmc不作为责任医师来源。';
        syncButton.addEventListener('click', extSyncDrgAssistant);
        controls.appendChild(syncButton);

        const select = document.createElement('select');
        select.id = EXT_DOCTOR_FILTER_ID;
        select.title = '按责任医师筛选当前住院患者一览卡片';
        select.innerHTML = '<option value="">全部责任医师</option>';
        select.addEventListener('change', function () {
            extSelectedDoctor = select.value || '';
            extApplyDoctorFilter();

            /*
             * v1.3.16：仅当悬浮框管理器已启用DRG助手筛选时，
             * 将本插件选择同步给管理器。管理器原有change处理会继续负责
             * 保存drgSelectedDoctor并调用病历管理患者筛选链路。
             */
            extPushDoctorSelectionToManager(extSelectedDoctor);
        });
        controls.appendChild(select);

        const showDoctorLabel = document.createElement('label');
        showDoctorLabel.className = 'oha-show-doctor-toggle';
        showDoctorLabel.title = '控制是否在患者卡片下方显示责任医师胶囊；不影响责任医师筛选';
        const showDoctorCheckbox = document.createElement('input');
        showDoctorCheckbox.id = EXT_SHOW_DOCTOR_TOGGLE_ID;
        showDoctorCheckbox.type = 'checkbox';
        showDoctorCheckbox.checked = extShowResponsibleDoctorEnabled();
        const showDoctorText = document.createElement('span');
        showDoctorText.textContent = '显示责任医师';
        showDoctorLabel.appendChild(showDoctorCheckbox);
        showDoctorLabel.appendChild(showDoctorText);
        showDoctorCheckbox.addEventListener('change', function () {
            extWriteShowResponsibleDoctor(showDoctorCheckbox.checked);
            extApplyResponsibleToCards();
        });
        controls.appendChild(showDoctorLabel);

        return controls;
    }

    function extEnsureRightControls() {
        if (!extFeatureRuntimeEnabled) return false;
        extEnsureStyle();

        const basicPanel = findBasicInfoPanel();
        if (!basicPanel || !basicPanel.parentElement) return false;

        let controls = document.getElementById(EXT_CONTROL_PANEL_ID);
        if (!controls) {
            controls = extCreateRightControls();
        }

        /*
         * 不再向顶部筛选栏插入按钮。直接把整个控制区作为“基本信息”面板的后续兄弟节点，
         * 让HIS右侧栏自己的纵向文档流把它排到截图红框位置。
         */
        if (controls.parentElement !== basicPanel.parentElement || basicPanel.nextElementSibling !== controls) {
            basicPanel.parentElement.insertBefore(controls, basicPanel.nextSibling);
        }

        const rect = basicPanel.getBoundingClientRect();
        if (rect.width > 80) {
            controls.style.width = Math.round(rect.width) + 'px';
            controls.style.maxWidth = Math.round(rect.width) + 'px';
        }

        const showDoctorCheckbox = document.getElementById(EXT_SHOW_DOCTOR_TOGGLE_ID);
        if (showDoctorCheckbox) {
            showDoctorCheckbox.checked = extShowResponsibleDoctorEnabled();
        }

        extApplyResponsibleToCards();
        extScheduleManagerDrgLink();
        return true;
    }

    function extScheduleScan() {
        if (!extFeatureRuntimeEnabled) return;
        clearTimeout(extScanTimer);
        extScanTimer = setTimeout(function () {
            if (!extFeatureRuntimeEnabled) return;
            try {
                extEnsureRightControls();
            } catch (error) {
                console.warn('[住院患者一览汇总] 右侧控制区初始化失败：', error);
            }
        }, 140);
    }

    /*
     * v1.3.18：运行期启停。禁用并不删除任何持久化设置，只停止界面增强并清理已注入DOM。
     */
    function extCleanupManagedCards() {
        document.querySelectorAll('[data-oha-responsible-managed="1"]').forEach(function (card) {
            if (!(card instanceof HTMLElement)) return;
            card.classList.remove(SCRIPT_PREFIX + '-doctor-hidden');
            const line = card.querySelector('.' + SCRIPT_PREFIX + '-doctor-line');
            if (line) line.remove();
            delete card.dataset.ohaResponsibleManaged;
            delete card.dataset.ohaResponsibleDoctor;
            delete card.dataset.ohaResponsibleAdmissionNo;
        });
    }

    function extFeatureRouteHandler() {
        if (extFeatureRuntimeEnabled) extScheduleScan();
    }

    function extFeatureResizeHandler() {
        if (!extFeatureRuntimeEnabled) return;
        extScheduleScan();
        if (typeof ResizeObserver === 'undefined') {
            const overlay = document.getElementById(OVERLAY_ID);
            if (overlay && extIsTableAutoLayout()) extFitTableToViewport(overlay, false);
        }
    }

    function extActivateFeature() {
        if (extFeatureRuntimeEnabled) return;
        extFeatureRuntimeEnabled = true;
        ensureStyle();
        extEnsureStyle();
        extScheduleScan();

        if (!extFeatureObserver && document.documentElement) {
            extFeatureObserver = new MutationObserver(function (mutations) {
                if (!extFeatureRuntimeEnabled) return;
                let shouldScan = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        shouldScan = true;
                        break;
                    }
                }
                if (shouldScan) extScheduleScan();
            });
            extFeatureObserver.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }

        window.addEventListener('hashchange', extFeatureRouteHandler);
        window.addEventListener('popstate', extFeatureRouteHandler);
        window.addEventListener('resize', extFeatureResizeHandler);

        setTimeout(function () {
            if (!extFeatureRuntimeEnabled) return;
            extApplyResponsibleToCards();
            extScheduleManagerDrgLink();
        }, 350);

        /* 管理器Shadow DOM可能稍晚于业务页创建，再补一次绑定。 */
        setTimeout(function () {
            if (extFeatureRuntimeEnabled) extScheduleManagerDrgLink();
        }, 900);
    }

    function extDeactivateFeature() {
        extFeatureRuntimeEnabled = false;
        extLastDoctorSync = { signature: '', rows: [] };
        clearTimeout(scanTimer);
        clearTimeout(extScanTimer);
        clearTimeout(extManagerDrgLinkTimer);
        scanTimer = null;
        extScanTimer = null;
        extManagerDrgLinkTimer = null;

        if (extFeatureObserver) {
            extFeatureObserver.disconnect();
            extFeatureObserver = null;
        }

        window.removeEventListener('hashchange', extFeatureRouteHandler);
        window.removeEventListener('popstate', extFeatureRouteHandler);
        window.removeEventListener('resize', extFeatureResizeHandler);

        closeSummary();
        const controls = document.getElementById(EXT_CONTROL_PANEL_ID);
        if (controls) controls.remove();
        const button = document.getElementById(BUTTON_ID);
        if (button) button.remove();
        extCleanupManagedCards();

        const baseStyle = document.getElementById(STYLE_ID);
        if (baseStyle) baseStyle.remove();
        const extensionStyle = document.getElementById(EXT_STYLE_ID);
        if (extensionStyle) extensionStyle.remove();
    }

    function extApplyFeatureState() {
        if (extManagerFeatureEnabled()) extActivateFeature();
        else extDeactivateFeature();
    }

    function extInitializeFeatureLifecycle() {
        if (extFeatureLifecycleInitialized) {
            extApplyFeatureState();
            return;
        }
        extFeatureLifecycleInitialized = true;

        document.addEventListener(INTERFACE_ENHANCEMENT_EVENT, function () {
            extApplyFeatureState();
        });

        if (typeof BroadcastChannel === 'function') {
            try {
                extFeatureBroadcastChannel = new BroadcastChannel(INTERFACE_ENHANCEMENT_CHANNEL);
                extFeatureBroadcastChannel.addEventListener('message', function () {
                    extApplyFeatureState();
                });
            } catch (error) {
                extFeatureBroadcastChannel = null;
            }
        }

        extApplyFeatureState();
    }

    /* 覆盖旧版 start：由管理器设置决定是否真正启动界面增强。 */
    start = extInitializeFeatureLifecycle;


    function extRefreshSharedDrgCacheView() {
        if (!extFeatureRuntimeEnabled) return;
        try {
            const records = extReadSyncCache().records || [];
            extReconcileSharedDoctorRows(lastRows, records);
            if (summaryCache) extReconcileSharedDoctorRows(summaryCache.rows, records);
            extReconcileSharedDoctorRows(extLastDoctorSync.rows, records);
            /* 管理器同步后，以新共享名单更新已有行和卡片，不保留旧按钮同步的医师值。 */
            extApplyResponsibleToCards();
            extApplyDoctorFilter();
            extScheduleManagerDrgLink();

            const overlay =
                document.getElementById(OVERLAY_ID);

            if (
                overlay &&
                Array.isArray(lastRows) &&
                lastRows.length
            ) {
                extDecorateRows(lastRows);
                updateTableView(overlay);
                setProgress(
                    '已读取与悬浮框管理器共用的DRG助手本地缓存；责任医师与DRG分组字典已更新'
                );
            }
        } catch (error) {
            console.warn(
                '[住院患者一览汇总] 刷新DRG共享缓存失败：',
                error
            );
        }
    }

    document.addEventListener(
        EXT_SYNC_CACHE_EVENT,
        function () {
            if (!extFeatureRuntimeEnabled) return;
            setTimeout(
                extRefreshSharedDrgCacheView,
                0
            );
        }
    );

    window.addEventListener(
        'storage',
        function (event) {
            if (!event) return;
            if (event.key === MANAGER_STORAGE_KEY) {
                setTimeout(extApplyFeatureState, 0);
                return;
            }
            if (
                event.key === EXT_SYNC_CACHE_KEY &&
                extFeatureRuntimeEnabled
            ) {
                setTimeout(
                    extRefreshSharedDrgCacheView,
                    0
                );
            }
        }
    );


    /* ==============================================================
       v1.3.19：WebDAV脚本源码快照适配
       - 只注册当前完整可安装源码，不上传患者汇总缓存或患者身份数据；
       - 实际WebDAV地址、账号、自动上传策略继续完全由悬浮框管理器统一管理；
       - 管理器尚未初始化时进入预注册队列，管理器就绪后自动接管。
       ============================================================== */

    const EXT_SOURCE_BACKUP_REGISTRY_NAME =
        'MedicalUserscriptSourceBackupRegistry';
    const EXT_SOURCE_BACKUP_QUEUE_NAME =
        '__medicalUserscriptSourceBackupQueueV1';
    const EXT_SOURCE_BACKUP_VERSION = '1.3.28.3';
    const EXT_SOURCE_BACKUP_ID = 'inpatient-summary';

    function extSourceBackupPageWindow() {
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
                return unsafeWindow;
            }
        } catch (error) {
            // 退回当前window。
        }
        return window;
    }

    function extSourceBackupSelfSourceText() {
        const header = [
            '// ==UserScript==',
            '// @name         住院患者一览汇总插件',
            '// @namespace    http://tampermonkey.net/',
            '// @version      1.3.28.3',
            '// @description  v1.3.28.3：同步DRG助手成功取得8997名单后直接替换患者缓存，不合并旧助手名单；获取失败保留回退，DRG字典与WebDAV预警备份保持独立',
            '// @author       MJP',
            '// @match        *://11.12.199.244:8003/*',
            '// @match        http://11.12.199.3:8996/attend/attendingPhysician*',
            '// @match        http://11.12.199.3:8996/attend/patientQuery*',
            '// @grant        GM_xmlhttpRequest',
            '// @grant        GM_getValue',
            '// @grant        GM_setValue',
            '// @grant        unsafeWindow',
            '// @connect      11.12.199.244',
            '// @connect      11.12.199.3',
            '// @run-at       document-start',
            '// ==/UserScript==',
            ''
        ].join('\n');

        return (
            header +
            '(' +
            Function.prototype.toString.call(
                inpatientVisibleSummaryMain
            ) +
            ')();\n'
        );
    }

    function extRegisterWebdavSourceBackup() {
        const page = extSourceBackupPageWindow();
        const provider = {
            id: EXT_SOURCE_BACKUP_ID,
            name: '住院患者一览汇总插件',
            version: EXT_SOURCE_BACKUP_VERSION,
            role: 'enhancement',
            fileName:
                '住院患者一览汇总插件_v' +
                EXT_SOURCE_BACKUP_VERSION +
                '.user.js',
            exportSource: extSourceBackupSelfSourceText
        };

        try {
            const registry = page && page[EXT_SOURCE_BACKUP_REGISTRY_NAME];
            if (registry && typeof registry.register === 'function') {
                registry.register(provider);
                return true;
            }

            const queue = Array.isArray(
                page && page[EXT_SOURCE_BACKUP_QUEUE_NAME]
            )
                ? page[EXT_SOURCE_BACKUP_QUEUE_NAME]
                : [];
            queue.push(provider);
            page[EXT_SOURCE_BACKUP_QUEUE_NAME] = queue;
            return true;
        } catch (error) {
            console.warn(
                '[住院患者一览汇总][WebDAV源码备份] 注册失败：',
                error
            );
            return false;
        }
    }

    extRegisterDrgWarningBackup();
    const extBackupPage = extBusinessBackupPage();
    try { extBackupPage.document.addEventListener(EXT_BUSINESS_BACKUP_READY_EVENT, extRegisterDrgWarningBackup); } catch (error) {}
    extRegisterWebdavSourceBackup();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
