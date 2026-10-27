// ==UserScript==
// @name         智慧医疗－门诊助手
// @namespace    http://tampermonkey.net/
// @version      1.7.3.16
// @description  v1.7.3.16：修复DOM图标排列调整后诊断新增误点常用/收藏图标；明确加号优先、排除相邻操作并限制按钮容器；同步WebDAV和全局AI注册版本，保留其余既有功能
// @author       ChatGPT
// @match        http://11.12.199.244:8003/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      api.deepseek.com
// @connect      open.bigmodel.cn
// @connect      api.openai.com
// @run-at       document-idle
// ==/UserScript==
(function medicalOutpatientAssistantMain() {
    'use strict';

    /*
     * 只允许最外层页面创建悬浮框。
     * 门诊工作站内部存在同源iframe，原v1.0会在顶层和iframe中分别创建，
     * 因而出现两个“门诊AI助手”悬浮框。
     * 顶层脚本仍可通过allDocuments()读取同源iframe内容。
     */
    if (window.top !== window.self) {
        return;
    }

    const IDS = {
        panel: 'medical-outpatient-ai-assistant-panel-v1',
        button: 'medical-outpatient-ai-assistant-button-v1',
        modal: 'medical-outpatient-ai-assistant-modal-v1'
    };

    const KEYS = {
        apiKey: 'medicalOutpatientAiDeepSeekApiKeyV1',
        model: 'medicalOutpatientAiDeepSeekModelV1',
        prompt: 'medicalOutpatientAiPromptV1',
        template: 'medicalOutpatientAiTemplateV1',
        autoDiagnosisSearch: 'medicalOutpatientAiAutoDiagnosisSearchV1',
        panelCollapsed: 'medicalOutpatientAiPanelCollapsedV1',
        panelPosition: 'medicalOutpatientAiPanelPositionV1',
        sectionCollapsed: 'medicalOutpatientAiSectionCollapsedV1',
        chatIncludePage: 'medicalOutpatientAiChatIncludePageV1',
        chatMarkdown: 'medicalOutpatientAiChatMarkdownV1',
        chatEnterToSend: 'medicalOutpatientAiChatEnterToSendV1',
        chatBubbleCopy: 'medicalOutpatientAiChatBubbleCopyV1',
        recordTemplates: 'medicalOutpatientAiRecordTemplatesV1',
        outpatientOrderTemplates: 'medicalOutpatientAiOrderTemplatesV1',
        outpatientOrderDraft: 'medicalOutpatientAiOrderDraftV1',
        outpatientOrderAutoSave: 'medicalOutpatientAiOrderAutoSaveV1',
        outpatientOrderContinueError: 'medicalOutpatientAiOrderContinueErrorV1',
        outpatientOrderTcmStarPrefix: 'medicalOutpatientAiOrderTcmStarPrefixV1',
        outpatientOrderSecondaryDirectoryVisible: 'medicalOutpatientAiOrderSecondaryDirectoryVisibleV1'
    };


    /*
     * 与“悬浮框管理器 v3.3.4”约定的共享接口。
     * 本脚本不要求管理器必须先加载：直接读取相同localStorage键即可。
     */
    const SHARED_LIBRARY_STORAGE_KEY =
        'medicalUserscriptSharedKnowledgeV1';

    const SHARED_LIBRARY_EVENT_NAME =
        'medical-userscript-shared-knowledge-changed';

    const SHARED_LIBRARY_OPEN_EVENT_NAME =
        'medical-userscript-open-shared-library-manager';

    const WESTERN_DRUG_DATALIST_ID =
        'outpatient-ai-western-drug-suggestions-v1';

    const CHARGE_ITEM_DATALIST_ID =
        'outpatient-ai-charge-item-suggestions-v1';

    /*
     * 原生简约深蓝风格配置。
     *
     * 本段外观参数及颜色计算方式完全参照
     * “智慧医疗病案首页－自动填写患者信息”脚本。
     */
    const NATIVE_SIMPLE_DARK_BLUE_STYLE = Object.freeze({
        panelWidth: 174,
        panelRadius: 7,
        headerColor: '#117fac',

        /*
         * 操作界面标题栏相对悬浮框标题栏的HSL明度增加值。
         */
        modalHeaderLightnessDelta: 0.15,

        primaryColor: '#159bd3',
        primaryHoverColor: '#118bc0',
        secondaryBackground: '#f3fbfe',
        secondaryHoverBackground: '#e5f6fc',
        secondaryBorderColor: '#b9d9e7',
        secondaryTextColor: '#117fac',
        panelShadow: '0 4px 14px rgba(0,0,0,.28)'
    });

    function lightenHexColor(
        hexColor,
        lightnessDelta
    ) {
        const normalized =
            String(
                hexColor || ''
            )
                .trim()
                .replace(
                    /^#/,
                    ''
                );

        if (
            !/^[0-9a-f]{6}$/i.test(
                normalized
            )
        ) {
            return '#117fac';
        }

        const red =
            parseInt(
                normalized.slice(
                    0,
                    2
                ),
                16
            ) /
            255;

        const green =
            parseInt(
                normalized.slice(
                    2,
                    4
                ),
                16
            ) /
            255;

        const blue =
            parseInt(
                normalized.slice(
                    4,
                    6
                ),
                16
            ) /
            255;

        const maximum =
            Math.max(
                red,
                green,
                blue
            );

        const minimum =
            Math.min(
                red,
                green,
                blue
            );

        let hue = 0;
        let saturation = 0;

        const lightness =
            (
                maximum +
                minimum
            ) /
            2;

        const difference =
            maximum -
            minimum;

        if (
            difference !== 0
        ) {
            saturation =
                lightness > 0.5
                    ? difference /
                        (
                            2 -
                            maximum -
                            minimum
                        )
                    : difference /
                        (
                            maximum +
                            minimum
                        );

            if (
                maximum === red
            ) {
                hue =
                    (
                        green -
                        blue
                    ) /
                    difference +
                    (
                        green < blue
                            ? 6
                            : 0
                    );
            } else if (
                maximum === green
            ) {
                hue =
                    (
                        blue -
                        red
                    ) /
                    difference +
                    2;
            } else {
                hue =
                    (
                        red -
                        green
                    ) /
                    difference +
                    4;
            }

            hue /=
                6;
        }

        const delta =
            Number(
                lightnessDelta
            );

        const targetLightness =
            Math.max(
                0,
                Math.min(
                    1,
                    lightness +
                    (
                        Number.isFinite(
                            delta
                        )
                            ? delta
                            : 0
                    )
                )
            );

        function hueToRgb(
            first,
            second,
            value
        ) {
            let current =
                value;

            if (
                current < 0
            ) {
                current += 1;
            }

            if (
                current > 1
            ) {
                current -= 1;
            }

            if (
                current < 1 / 6
            ) {
                return (
                    first +
                    (
                        second -
                        first
                    ) *
                    6 *
                    current
                );
            }

            if (
                current < 1 / 2
            ) {
                return second;
            }

            if (
                current < 2 / 3
            ) {
                return (
                    first +
                    (
                        second -
                        first
                    ) *
                    (
                        2 / 3 -
                        current
                    ) *
                    6
                );
            }

            return first;
        }

        let targetRed;
        let targetGreen;
        let targetBlue;

        if (
            saturation === 0
        ) {
            targetRed =
                targetLightness;

            targetGreen =
                targetLightness;

            targetBlue =
                targetLightness;
        } else {
            const second =
                targetLightness < 0.5
                    ? targetLightness *
                        (
                            1 +
                            saturation
                        )
                    : targetLightness +
                        saturation -
                        targetLightness *
                        saturation;

            const first =
                2 *
                targetLightness -
                second;

            targetRed =
                hueToRgb(
                    first,
                    second,
                    hue +
                    1 / 3
                );

            targetGreen =
                hueToRgb(
                    first,
                    second,
                    hue
                );

            targetBlue =
                hueToRgb(
                    first,
                    second,
                    hue -
                    1 / 3
                );
        }

        function toHex(
            value
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        value
                    )
                ) *
                255
            )
                .toString(16)
                .padStart(
                    2,
                    '0'
                );
        }

        return (
            '#' +
            toHex(
                targetRed
            ) +
            toHex(
                targetGreen
            ) +
            toHex(
                targetBlue
            )
        );
    }

    const MODAL_HEADER_COLOR =
        lightenHexColor(
            NATIVE_SIMPLE_DARK_BLUE_STYLE
                .headerColor,
            NATIVE_SIMPLE_DARK_BLUE_STYLE
                .modalHeaderLightnessDelta
        );


    const DEEPSEEK_ENDPOINT =
        'https://api.deepseek.com/chat/completions';

    /******************************************************************
     * 全局AI调用管理桥 v2
     *
     * 非敏感策略从悬浮框管理器共享localStorage读取；GLM / OpenAI API Key
     * 仅保存在当前业务脚本自己的Tampermonkey GM存储中。管理器通过注册
     * 适配器一次性同步密钥，不把密钥写入localStorage、WebDAV或源码备份。
     *
     * 全局模式：
     * - follow：沿用当前请求原本的直出/推理倾向；
     * - direct：强制直出；DeepSeek/GLM关闭thinking，OpenAI reasoning_effort=none；
     * - reasoning：强制推理；DeepSeek/GLM开启thinking，OpenAI使用配置推理强度。
     *
     * OpenAI使用Chat Completions而非Responses API，以保持七脚本现有
     * choices[0].message.content / SSE解析链完全兼容。
     ******************************************************************/
    const SUITE_GLOBAL_AI_CONFIG_STORAGE_KEY =
        'medicalUserscriptGlobalAiConfigV1';
    const SUITE_GLOBAL_AI_CHANGED_EVENT_NAME =
        'medical-userscript-global-ai-config-changed';
    const SUITE_GLOBAL_AI_REGISTRY_API_NAME =
        'MedicalUserscriptGlobalAiRegistry';
    const SUITE_GLOBAL_AI_ADAPTER_QUEUE_NAME =
        '__medicalUserscriptGlobalAiAdapterQueueV1';
    const SUITE_GLOBAL_AI_GLM_API_KEY_GM_KEY =
        'medicalOutpatientGlmApiKeyV1';
    const SUITE_GLOBAL_AI_OPENAI_API_KEY_GM_KEY =
        'medicalOutpatientOpenAiApiKeyV1';
    const SUITE_GLOBAL_AI_GLM_ENDPOINT =
        'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    const SUITE_GLOBAL_AI_OPENAI_ENDPOINT =
        'https://api.openai.com/v1/chat/completions';
    const SUITE_GLOBAL_AI_DEEPSEEK_ENDPOINT =
        'https://api.deepseek.com/chat/completions';
    const SUITE_GLOBAL_AI_NATIVE_GM_XMLHTTPREQUEST =
        GM_xmlhttpRequest;
    let suiteGlobalAiLocalDeepSeekKeyGetter = null;

    function suiteGlobalAiReadDeepSeekApiKey(fallbackValue) {
        if (typeof suiteGlobalAiLocalDeepSeekKeyGetter === 'function') {
            try {
                const stored = String(
                    suiteGlobalAiLocalDeepSeekKeyGetter() || ''
                ).trim();
                if (stored) return stored;
            } catch (error) {
                // 回退调用方当前请求头/界面值。
            }
        }
        return String(fallbackValue || '').trim();
    }

    function suiteGlobalAiConfig() {
        const defaults = {
            enabled: false,
            provider: 'deepseek',
            mode: 'follow',
            deepseekDirectModel: 'deepseek-v4-flash',
            deepseekReasoningModel: 'deepseek-v4-flash',
            glmDirectModel: 'glm-5.2',
            glmReasoningModel: 'glm-5.3',
            glmReasoningEffort: 'max',
            openaiDirectModel: 'gpt-5.6-luna',
            openaiReasoningModel: 'gpt-5.6-sol',
            openaiReasoningEffort: 'high'
        };
        let source = {};
        try {
            source = JSON.parse(
                localStorage.getItem(
                    SUITE_GLOBAL_AI_CONFIG_STORAGE_KEY
                ) || '{}'
            ) || {};
        } catch (error) {
            source = {};
        }
        const result = Object.assign({}, defaults, source || {});
        result.enabled = result.enabled === true;
        result.provider = ['deepseek', 'glm', 'openai'].includes(result.provider)
            ? result.provider
            : 'deepseek';
        result.mode = ['follow', 'direct', 'reasoning'].includes(result.mode)
            ? result.mode
            : 'follow';
        [
            'deepseekDirectModel',
            'deepseekReasoningModel',
            'glmDirectModel',
            'glmReasoningModel',
            'glmReasoningEffort',
            'openaiDirectModel',
            'openaiReasoningModel',
            'openaiReasoningEffort'
        ].forEach(function (key) {
            result[key] = String(result[key] || defaults[key]).trim() || defaults[key];
        });
        if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(result.openaiReasoningEffort)) {
            result.openaiReasoningEffort = 'high';
        }
        return result;
    }

    function suiteGlobalAiReadGlmApiKey() {
        try {
            return String(
                GM_getValue(
                    SUITE_GLOBAL_AI_GLM_API_KEY_GM_KEY,
                    ''
                ) || ''
            ).trim();
        } catch (error) {
            return '';
        }
    }

    function suiteGlobalAiReadOpenAiApiKey() {
        try {
            return String(
                GM_getValue(
                    SUITE_GLOBAL_AI_OPENAI_API_KEY_GM_KEY,
                    ''
                ) || ''
            ).trim();
        } catch (error) {
            return '';
        }
    }

    function suiteGlobalAiHasApiKey(provider, localDeepSeekKey) {
        const config = suiteGlobalAiConfig();

        /*
         * v3兼容修复：旧业务代码大量使用
         *     suiteGlobalAiHasApiKey(settings.apiKey)
         * 的单参数调用方式；全局AI桥引入后函数一度改成
         *     suiteGlobalAiHasApiKey(provider, localDeepSeekKey)
         * 导致单参数中的API Key被误当成provider，而真正的
         * localDeepSeekKey变成undefined。全局关闭时因此会错误提示
         * “请先配置API Key”；全局开启GLM/OpenAI时也可能错误依赖
         * 本地DeepSeek Key。
         *
         * 现在同时兼容两种调用：
         * 1. 单参数/旧式：参数就是本地DeepSeek Key；provider由全局配置决定；
         * 2. 双参数/新式：显式传provider + 本地DeepSeek Key。
         */
        const providerText = String(provider || '').trim().toLowerCase();
        const explicitProvider = ['deepseek', 'glm', 'openai'].includes(
            providerText
        );

        const effectiveProvider = explicitProvider
            ? providerText
            : (config.enabled ? config.provider : 'deepseek');

        const effectiveLocalDeepSeekKey = suiteGlobalAiReadDeepSeekApiKey(
            explicitProvider
                ? localDeepSeekKey
                : provider
        );

        if (!config.enabled) {
            return Boolean(effectiveLocalDeepSeekKey);
        }
        if (effectiveProvider === 'glm') {
            return Boolean(suiteGlobalAiReadGlmApiKey());
        }
        if (effectiveProvider === 'openai') {
            return Boolean(suiteGlobalAiReadOpenAiApiKey());
        }
        return Boolean(effectiveLocalDeepSeekKey);
    }

    function suiteGlobalAiBearerToken(headers) {
        const source = headers && typeof headers === 'object'
            ? headers
            : {};
        const key = Object.keys(source).find(function (name) {
            return String(name || '').toLowerCase() === 'authorization';
        });
        if (!key) return '';
        return String(source[key] || '')
            .replace(/^\s*Bearer\s+/i, '')
            .trim();
    }

    function suiteGlobalAiLooksLikeChatEndpoint(url) {
        const value = String(url || '').toLowerCase();
        return (
            value.includes('api.deepseek.com/chat/completions') ||
            value.includes('open.bigmodel.cn/api/paas/v4/chat/completions') ||
            value.includes('api.openai.com/v1/chat/completions')
        );
    }

    function suiteGlobalAiInferRequestedMode(body) {
        const openAiEffort = String(
            body && body.reasoning_effort || ''
        ).toLowerCase();
        if (['low', 'medium', 'high', 'xhigh', 'max'].includes(openAiEffort)) {
            return 'reasoning';
        }
        if (['none', 'minimal'].includes(openAiEffort)) {
            return 'direct';
        }
        const thinkingType = body && body.thinking &&
            typeof body.thinking === 'object'
                ? String(body.thinking.type || '').toLowerCase()
                : '';
        if (thinkingType === 'enabled') return 'reasoning';
        if (thinkingType === 'disabled') return 'direct';
        const model = String(body && body.model || '').toLowerCase();
        if (/reasoner|reasoning|(?:^|[-_])r1(?:[-_]|$)/.test(model)) {
            return 'reasoning';
        }
        if (/^deepseek-v4-flash$/i.test(model)) {
            return 'reasoning';
        }
        return 'direct';
    }

    function suiteGlobalAiSyntheticFailure(options, message) {
        let aborted = false;
        const timer = setTimeout(function () {
            if (aborted) return;
            const response = {
                status: 401,
                statusText: 'Unauthorized',
                responseText: JSON.stringify({
                    error: {
                        message: String(message || '全局AI调用配置不可用')
                    }
                }),
                responseHeaders: 'content-type: application/json\r\n',
                finalUrl: ''
            };
            if (options && typeof options.onload === 'function') {
                options.onload(response);
            } else if (options && typeof options.onerror === 'function') {
                options.onerror(response);
            }
        }, 0);
        return {
            abort: function () {
                aborted = true;
                clearTimeout(timer);
                if (options && typeof options.onabort === 'function') {
                    options.onabort({ status: 0, statusText: 'abort' });
                }
            }
        };
    }

    function suiteGlobalAiXmlhttpRequest(options) {
        const original = options && typeof options === 'object'
            ? options
            : {};
        if (!suiteGlobalAiLooksLikeChatEndpoint(original.url)) {
            return SUITE_GLOBAL_AI_NATIVE_GM_XMLHTTPREQUEST(original);
        }

        const config = suiteGlobalAiConfig();
        if (!config.enabled) {
            return SUITE_GLOBAL_AI_NATIVE_GM_XMLHTTPREQUEST(original);
        }

        let body = {};
        try {
            body = typeof original.data === 'string'
                ? JSON.parse(original.data || '{}')
                : Object.assign({}, original.data || {});
        } catch (error) {
            return SUITE_GLOBAL_AI_NATIVE_GM_XMLHTTPREQUEST(original);
        }

        const requestedMode = suiteGlobalAiInferRequestedMode(body);
        const effectiveMode = config.mode === 'follow'
            ? requestedMode
            : config.mode;
        const provider = config.provider;
        const localDeepSeekKey = suiteGlobalAiReadDeepSeekApiKey(
            suiteGlobalAiBearerToken(original.headers)
        );
        const apiKey = provider === 'glm'
            ? suiteGlobalAiReadGlmApiKey()
            : provider === 'openai'
                ? suiteGlobalAiReadOpenAiApiKey()
                : localDeepSeekKey;

        if (!suiteGlobalAiHasApiKey(provider, localDeepSeekKey)) {
            const label = provider === 'glm'
                ? 'GLM'
                : provider === 'openai'
                    ? 'OpenAI'
                    : 'DeepSeek';
            return suiteGlobalAiSyntheticFailure(
                original,
                '全局AI已选择' + label + '，但当前脚本尚未配置/同步对应API Key，请在悬浮框管理器“全局AI调用管理”中同步。'
            );
        }

        let model = provider === 'glm'
            ? (
                effectiveMode === 'reasoning'
                    ? config.glmReasoningModel
                    : config.glmDirectModel
            )
            : provider === 'openai'
                ? (
                    effectiveMode === 'reasoning'
                        ? config.openaiReasoningModel
                        : config.openaiDirectModel
                )
                : (
                    effectiveMode === 'reasoning'
                        ? config.deepseekReasoningModel
                        : config.deepseekDirectModel
                );

        if (
            provider === 'glm' &&
            effectiveMode === 'direct' &&
            /^glm-5\.3(?:-flash)?$/i.test(model)
        ) {
            model = 'glm-5.2';
        }

        body.model = model;

        if (provider === 'openai') {
            /* OpenAI Chat Completions没有thinking对象，使用reasoning_effort。 */
            delete body.thinking;
            body.reasoning_effort = effectiveMode === 'reasoning'
                ? (config.openaiReasoningEffort || 'high')
                : 'none';

            /* GPT-5.6系列使用max_completion_tokens；兼容七脚本现有max_tokens。 */
            if (
                body.max_tokens !== undefined &&
                body.max_completion_tokens === undefined
            ) {
                body.max_completion_tokens = body.max_tokens;
            }
            delete body.max_tokens;

            /* 最新推理模型不接受这些采样参数，统一移除避免400。 */
            delete body.temperature;
            delete body.top_p;
            delete body.top_logprobs;
            delete body.logprobs;
        } else {
            const oldThinking = body.thinking &&
                typeof body.thinking === 'object'
                    ? body.thinking
                    : {};
            body.thinking = Object.assign({}, oldThinking, {
                type: effectiveMode === 'reasoning'
                    ? 'enabled'
                    : 'disabled'
            });

            if (provider === 'glm') {
                if (effectiveMode === 'reasoning') {
                    body.reasoning_effort = config.glmReasoningEffort || 'max';
                } else {
                    delete body.reasoning_effort;
                }
            } else {
                delete body.reasoning_effort;
            }
        }

        const nextHeaders = Object.assign({}, original.headers || {});
        const authKey = Object.keys(nextHeaders).find(function (name) {
            return String(name || '').toLowerCase() === 'authorization';
        });
        if (authKey) delete nextHeaders[authKey];
        nextHeaders.Authorization = 'Bearer ' + apiKey;
        if (!Object.keys(nextHeaders).some(function (name) {
            return String(name || '').toLowerCase() === 'content-type';
        })) {
            nextHeaders['Content-Type'] = 'application/json';
        }

        const nextOptions = Object.assign({}, original, {
            url: provider === 'glm'
                ? SUITE_GLOBAL_AI_GLM_ENDPOINT
                : provider === 'openai'
                    ? SUITE_GLOBAL_AI_OPENAI_ENDPOINT
                    : SUITE_GLOBAL_AI_DEEPSEEK_ENDPOINT,
            headers: nextHeaders,
            data: JSON.stringify(body)
        });

        return SUITE_GLOBAL_AI_NATIVE_GM_XMLHTTPREQUEST(nextOptions);
    }

    function suiteGlobalAiPageWindow() {
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
                return unsafeWindow;
            }
        } catch (error) {
            // 回退window。
        }
        return window;
    }

    function suiteGlobalAiRegisterAdapter(spec) {
        const source = spec && typeof spec === 'object' ? spec : {};
        const page = suiteGlobalAiPageWindow();
        if (typeof source.getDeepSeekKey === 'function') {
            suiteGlobalAiLocalDeepSeekKeyGetter =
                source.getDeepSeekKey;
        }
        const adapter = {
            key: String(source.key || ''),
            name: String(source.name || source.key || ''),
            version: String(source.version || ''),
            adapterVersion: 2,
            setApiKey: function (provider, value) {
                const clean = String(value || '').trim();
                if (provider === 'glm') {
                    GM_setValue(SUITE_GLOBAL_AI_GLM_API_KEY_GM_KEY, clean);
                    return true;
                }
                if (provider === 'openai') {
                    GM_setValue(SUITE_GLOBAL_AI_OPENAI_API_KEY_GM_KEY, clean);
                    return true;
                }
                if (typeof source.setDeepSeekKey === 'function') {
                    source.setDeepSeekKey(clean);
                    return true;
                }
                return false;
            },
            clearApiKey: function (provider) {
                return this.setApiKey(provider, '');
            },
            hasApiKey: function (provider) {
                if (provider === 'glm') {
                    return Boolean(suiteGlobalAiReadGlmApiKey());
                }
                if (provider === 'openai') {
                    return Boolean(suiteGlobalAiReadOpenAiApiKey());
                }
                if (typeof source.getDeepSeekKey === 'function') {
                    return Boolean(String(source.getDeepSeekKey() || '').trim());
                }
                return false;
            }
        };

        try {
            if (
                page[SUITE_GLOBAL_AI_REGISTRY_API_NAME] &&
                typeof page[SUITE_GLOBAL_AI_REGISTRY_API_NAME].register === 'function'
            ) {
                page[SUITE_GLOBAL_AI_REGISTRY_API_NAME].register(adapter);
            } else {
                const queue = Array.isArray(page[SUITE_GLOBAL_AI_ADAPTER_QUEUE_NAME])
                    ? page[SUITE_GLOBAL_AI_ADAPTER_QUEUE_NAME]
                    : [];
                queue.push(adapter);
                page[SUITE_GLOBAL_AI_ADAPTER_QUEUE_NAME] = queue;
            }
        } catch (error) {
            console.warn('[全局AI调用管理] 适配器注册失败：', error);
        }
    }

    suiteGlobalAiRegisterAdapter({
        key: 'outpatient',
        name: '门诊助手',
        version: '1.7.3.16',
        getDeepSeekKey: function () {
            return String(GM_getValue(KEYS.apiKey, '') || '').trim();
        },
        setDeepSeekKey: function (value) {
            GM_setValue(KEYS.apiKey, value);
        }
    });


    const DEFAULT_MODEL =
        'deepseek-chat';

    const FIELD_DEFINITIONS = {
        chiefComplaint: {
            title: '主诉',
            labels: ['主诉']
        },
        presentIllness: {
            title: '现病史',
            labels: ['现病史']
        },
        pastHistory: {
            title: '既往史',
            labels: ['既往史']
        },
        menstrualHistory: {
            title: '月经史',
            labels: ['月经史']
        },
        allergyHistory: {
            title: '过敏史',
            labels: ['过敏史']
        },
        physicalExam: {
            title: '查体',
            labels: ['查体', '体格检查']
        },
        treatment: {
            title: '处理',
            labels: ['处理', '诊疗计划']
        },
        auxiliaryExam: {
            title: '辅助检查',
            labels: ['辅助检查']
        }
    };

    const TEMPLATE_PROMPTS = {
        initial: [
            '生成规范的门诊初诊病历。',
            '内容包括主诉、现病史、既往史、过敏史、必要时月经史、查体、辅助检查、初步诊断及处理建议。',
            '不得编造未提供的生命体征、检查结果、既往疾病、用药、过敏史和中医四诊。',
            '资料不足的内容留空，并列入缺失信息。'
        ].join('\n'),
        followup: [
            '生成规范的门诊复诊病历。',
            '重点描述治疗后的症状变化、用药依从性、不良反应、复查结果、当前查体和后续处理。',
            '不得把未提供的疗效、检查结果或患者陈述写成确定事实。'
        ].join('\n'),
        integrated: [
            '生成中西医结合门诊病历。',
            '西医部分需规范、客观；中医部分根据实际提供的望闻问切信息进行辨病辨证。',
            '四诊不足时不得强行辨证，应提示补充舌象、脉象、寒热、汗、饮食、睡眠、二便等资料。',
            '给出中医病名、证候及辨证依据建议，但不得虚构。'
        ].join('\n'),
        polish: [
            '仅对当前门诊病历进行医学语言润色和结构整理。',
            '不得新增原文没有的症状、检查、诊断、治疗、时间、数字或阴性症状。',
            '保留原始医学事实和先后顺序。'
        ].join('\n')
    };

    const state = {
        request: null,
        busy: false,
        taskType: '',
        generated: null,
        audit: null,
        sourceRecord: null,
        chatRequest: null,
        chatBusy: false,
        chatMessages: [],
        chatRenderFrame: 0,

        /*
         * 患者资料来源状态。
         *
         * page：由“读取当前页面”得到，可同时发送当前页面结构化快照。
         * manual：由医师粘贴或编辑，只发送文本，不混入上一位患者的网页快照。
         */
        sourceMode: 'unknown',
        sourceRevision: 0,
        lastGenerationFingerprint: '',
        generationSerial: 0,

        /*
         * 每次“重置信息”都会递增。
         * 旧请求即使稍后返回，也不得再写回当前患者的生成框。
         */
        resetSerial: 0,

        /* 门诊医嘱开立独立状态，不与病历生成任务互相覆盖。 */
        orderBusy: false,
        orderAiBusy: false,
        orderPaused: false,
        orderStopRequested: false,
        orderRunSerial: 0,
        orderActiveSerial: 0,
        orderForceStopTimer: 0,
        orderRestoreUi: null,
        orderProgressHideTimer: 0,
        outpatientApplicationPopupPool: [],
        outpatientApplicationPopupCursor: 0,

        /* 门诊诊断自动录入独立状态。 */
        diagnosisBusy: false,
        diagnosisPaused: false,
        diagnosisStopRequested: false,
        diagnosisRunSerial: 0,
        diagnosisActiveSerial: 0,
        diagnosisCurrentIndex: -1,
        diagnosisTotal: 0
    };

    function plain(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\r/g, '')
            .trim();
    }

    function compactText(value) {
        return plain(value)
            .replace(/\n{3,}/g, '\n\n');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    /*
     * 轻量、安全的Markdown渲染。
     * 不加载外部脚本，也不执行AI返回的HTML。
     */
    function markdownInlineToSafeHtml(value) {
        let source =
            String(
                value == null
                    ? ''
                    : value
            );

        const codeTokens = [];

        source =
            source.replace(
                /`([^`\n]+)`/g,
                (match, code) => {
                    const token =
                        '\u0000MD_CODE_' +
                        codeTokens.length +
                        '\u0000';

                    codeTokens.push(
                        '<code>' +
                        escapeHtml(code) +
                        '</code>'
                    );

                    return token;
                }
            );

        source =
            escapeHtml(source);

        source =
            source.replace(
                /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/gi,
                '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
            );

        source =
            source.replace(
                /\*\*([^*\n]+)\*\*/g,
                '<strong>$1</strong>'
            );

        source =
            source.replace(
                /__([^_\n]+)__/g,
                '<strong>$1</strong>'
            );

        source =
            source.replace(
                /~~([^~\n]+)~~/g,
                '<del>$1</del>'
            );

        source =
            source.replace(
                /(^|[^\*])\*([^*\n]+)\*(?!\*)/g,
                '$1<em>$2</em>'
            );

        source =
            source.replace(
                /(^|[^_])_([^_\n]+)_(?!_)/g,
                '$1<em>$2</em>'
            );

        codeTokens.forEach(
            (html, index) => {
                source =
                    source.replace(
                        '\u0000MD_CODE_' +
                        index +
                        '\u0000',
                        html
                    );
            }
        );

        return source;
    }

    function markdownTableCells(line) {
        return String(line || '')
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(cell => cell.trim());
    }

    function isMarkdownTableSeparator(line) {
        const cells =
            markdownTableCells(line);

        return (
            cells.length > 0 &&
            cells.every(cell =>
                /^:?-{3,}:?$/.test(cell)
            )
        );
    }

    function markdownToSafeHtml(markdown) {
        const lines =
            String(
                markdown == null
                    ? ''
                    : markdown
            )
                .replace(/\r/g, '')
                .split('\n');

        const html = [];
        let index = 0;

        const isBlockStart =
            line => {
                const trimmed =
                    String(line || '').trim();

                return (
                    !trimmed ||
                    /^```/.test(trimmed) ||
                    /^#{1,6}\s+/.test(trimmed) ||
                    /^>\s?/.test(trimmed) ||
                    /^[-+*]\s+/.test(trimmed) ||
                    /^\d+[.)]\s+/.test(trimmed) ||
                    /^([-*_])(?:\s*\1){2,}$/.test(trimmed)
                );
            };

        while (index < lines.length) {
            const line =
                lines[index];

            const trimmed =
                line.trim();

            if (!trimmed) {
                index += 1;
                continue;
            }

            const fence =
                trimmed.match(
                    /^```([\w.+-]*)\s*$/
                );

            if (fence) {
                const language =
                    plain(fence[1]);

                const codeLines = [];

                index += 1;

                while (
                    index < lines.length &&
                    !/^```\s*$/.test(
                        lines[index].trim()
                    )
                ) {
                    codeLines.push(lines[index]);
                    index += 1;
                }

                if (index < lines.length) {
                    index += 1;
                }

                html.push(
                    '<pre><code' +
                    (
                        language
                            ? (
                                ' data-language="' +
                                escapeHtml(language) +
                                '"'
                            )
                            : ''
                    ) +
                    '>' +
                    escapeHtml(
                        codeLines.join('\n')
                    ) +
                    '</code></pre>'
                );

                continue;
            }

            const heading =
                trimmed.match(
                    /^(#{1,6})\s+(.+)$/
                );

            if (heading) {
                const level =
                    heading[1].length;

                html.push(
                    '<h' +
                    level +
                    '>' +
                    markdownInlineToSafeHtml(
                        heading[2]
                    ) +
                    '</h' +
                    level +
                    '>'
                );

                index += 1;
                continue;
            }

            if (
                /^([-*_])(?:\s*\1){2,}$/.test(
                    trimmed
                )
            ) {
                html.push('<hr>');
                index += 1;
                continue;
            }

            if (
                index + 1 < lines.length &&
                trimmed.includes('|') &&
                isMarkdownTableSeparator(
                    lines[index + 1]
                )
            ) {
                const headers =
                    markdownTableCells(line);

                const rows = [];

                index += 2;

                while (
                    index < lines.length &&
                    lines[index].trim() &&
                    lines[index]
                        .trim()
                        .includes('|')
                ) {
                    rows.push(
                        markdownTableCells(
                            lines[index]
                        )
                    );

                    index += 1;
                }

                html.push(
                    '<div class="outpatient-ai-md-table-wrap">' +
                    '<table><thead><tr>' +
                    headers
                        .map(cell =>
                            '<th>' +
                            markdownInlineToSafeHtml(
                                cell
                            ) +
                            '</th>'
                        )
                        .join('') +
                    '</tr></thead><tbody>' +
                    rows
                        .map(row =>
                            '<tr>' +
                            headers
                                .map(
                                    (header, cellIndex) =>
                                        '<td>' +
                                        markdownInlineToSafeHtml(
                                            row[cellIndex] ||
                                            ''
                                        ) +
                                        '</td>'
                                )
                                .join('') +
                            '</tr>'
                        )
                        .join('') +
                    '</tbody></table></div>'
                );

                continue;
            }

            if (/^>\s?/.test(trimmed)) {
                const quoteLines = [];

                while (
                    index < lines.length &&
                    /^>\s?/.test(
                        lines[index].trim()
                    )
                ) {
                    quoteLines.push(
                        lines[index]
                            .trim()
                            .replace(/^>\s?/, '')
                    );

                    index += 1;
                }

                html.push(
                    '<blockquote>' +
                    quoteLines
                        .map(item =>
                            markdownInlineToSafeHtml(
                                item
                            )
                        )
                        .join('<br>') +
                    '</blockquote>'
                );

                continue;
            }

            if (/^[-+*]\s+/.test(trimmed)) {
                const items = [];

                while (
                    index < lines.length &&
                    /^[-+*]\s+/.test(
                        lines[index].trim()
                    )
                ) {
                    items.push(
                        lines[index]
                            .trim()
                            .replace(
                                /^[-+*]\s+/,
                                ''
                            )
                    );

                    index += 1;
                }

                html.push(
                    '<ul>' +
                    items
                        .map(item =>
                            '<li>' +
                            markdownInlineToSafeHtml(
                                item
                            ) +
                            '</li>'
                        )
                        .join('') +
                    '</ul>'
                );

                continue;
            }

            if (
                /^\d+[.)]\s+/.test(trimmed)
            ) {
                const items = [];

                while (
                    index < lines.length &&
                    /^\d+[.)]\s+/.test(
                        lines[index].trim()
                    )
                ) {
                    items.push(
                        lines[index]
                            .trim()
                            .replace(
                                /^\d+[.)]\s+/,
                                ''
                            )
                    );

                    index += 1;
                }

                html.push(
                    '<ol>' +
                    items
                        .map(item =>
                            '<li>' +
                            markdownInlineToSafeHtml(
                                item
                            ) +
                            '</li>'
                        )
                        .join('') +
                    '</ol>'
                );

                continue;
            }

            const paragraph = [
                trimmed
            ];

            index += 1;

            while (
                index < lines.length &&
                !isBlockStart(lines[index]) &&
                !(
                    index + 1 < lines.length &&
                    lines[index]
                        .trim()
                        .includes('|') &&
                    isMarkdownTableSeparator(
                        lines[index + 1]
                    )
                )
            ) {
                paragraph.push(
                    lines[index].trim()
                );

                index += 1;
            }

            html.push(
                '<p>' +
                paragraph
                    .map(item =>
                        markdownInlineToSafeHtml(
                            item
                        )
                    )
                    .join('<br>') +
                '</p>'
            );
        }

        return (
            html.join('') ||
            '<p></p>'
        );
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /*
     * 判断元素是否属于门诊助手自身界面。
     *
     * 原版本点击“引用到当前页面”时，会先在顶层document中搜索
     * “主诉、现病史、既往史”等标签。助手弹窗本身也有这些标签，
     * 因此脚本会误把内容再次写回助手自己的编辑框。
     */
    function isOwnAssistantUi(element) {
        if (
            !element ||
            !element.closest ||
            element.ownerDocument !== document
        ) {
            return false;
        }

        return Boolean(
            element.closest(
                '#' +
                IDS.modal +
                ',#' +
                IDS.panel
            )
        );
    }

    function isVisible(element) {
        if (
            !element ||
            !element.isConnected ||
            isOwnAssistantUi(element)
        ) {
            return false;
        }

        const style =
            element.ownerDocument.defaultView
                .getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || 1) !== 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function allDocuments() {
        const documents = [];
        const visited = new Set();

        function walk(doc) {
            if (!doc || visited.has(doc)) {
                return;
            }

            visited.add(doc);
            documents.push(doc);

            Array.from(
                doc.querySelectorAll('iframe')
            ).forEach(frame => {
                try {
                    if (frame.contentDocument) {
                        walk(frame.contentDocument);
                    }
                }
                catch (error) {
                    // 跨域iframe忽略。
                }
            });
        }

        walk(document);
        return documents;
    }

    function visibleElements(selector) {
        const result = [];

        allDocuments().forEach(doc => {
            Array.from(
                doc.querySelectorAll(selector)
            ).forEach(element => {
                if (isVisible(element)) {
                    result.push(element);
                }
            });
        });

        return result;
    }

    /*
     * 使用控件所属窗口的原生value setter。
     * 门诊病历表单可能位于同源iframe中，因此不能使用顶层窗口的
     * HTMLInputElement、HTMLTextAreaElement和Event对象。
     */
    function nativeValueSetter(
        element,
        value
    ) {
        const nextValue =
            String(
                value == null
                    ? ''
                    : value
            );

        const view =
            element.ownerDocument &&
            element.ownerDocument.defaultView
                ? element.ownerDocument.defaultView
                : window;

        let prototype =
            null;

        if (
            view.HTMLTextAreaElement &&
            element instanceof
                view.HTMLTextAreaElement
        ) {
            prototype =
                view.HTMLTextAreaElement
                    .prototype;
        }
        else if (
            view.HTMLInputElement &&
            element instanceof
                view.HTMLInputElement
        ) {
            prototype =
                view.HTMLInputElement
                    .prototype;
        }
        else if (
            view.HTMLSelectElement &&
            element instanceof
                view.HTMLSelectElement
        ) {
            prototype =
                view.HTMLSelectElement
                    .prototype;
        }

        let descriptor =
            prototype
                ? Object.getOwnPropertyDescriptor(
                    prototype,
                    'value'
                )
                : null;

        let currentPrototype =
            prototype;

        while (
            !descriptor &&
            currentPrototype
        ) {
            currentPrototype =
                Object.getPrototypeOf(
                    currentPrototype
                );

            if (currentPrototype) {
                descriptor =
                    Object.getOwnPropertyDescriptor(
                        currentPrototype,
                        'value'
                    );
            }
        }

        const previousValue =
            element.value;

        if (
            element._valueTracker &&
            typeof element
                ._valueTracker
                .setValue ===
                'function'
        ) {
            try {
                element._valueTracker
                    .setValue(
                        previousValue
                    );
            }
            catch (error) {
                // 跟踪器异常时继续。
            }
        }

        if (
            descriptor &&
            typeof descriptor.set ===
                'function'
        ) {
            descriptor.set.call(
                element,
                nextValue
            );
        }
        else {
            element.value =
                nextValue;
        }
    }

    function dispatchInputEvents(
        element
    ) {
        const view =
            element.ownerDocument &&
            element.ownerDocument.defaultView
                ? element.ownerDocument.defaultView
                : window;

        const EventConstructor =
            view.Event ||
            Event;

        [
            'input',
            'change'
        ].forEach(type => {
            element.dispatchEvent(
                new EventConstructor(
                    type,
                    {
                        bubbles: true,
                        cancelable: false
                    }
                )
            );
        });

        try {
            if (
                typeof element.blur ===
                'function'
            ) {
                element.blur();
            }
        }
        catch (error) {
            // 无法失焦时忽略。
        }
    }

    function setControlValue(
        element,
        value
    ) {
        if (
            !element ||
            isOwnAssistantUi(element) ||
            element.disabled
        ) {
            return false;
        }

        const nextValue =
            String(
                value == null
                    ? ''
                    : value
            );

        const hadReadonly =
            element.hasAttribute &&
            element.hasAttribute(
                'readonly'
            );

        try {
            if (hadReadonly) {
                element.removeAttribute(
                    'readonly'
                );
            }

            if (
                typeof element.focus ===
                'function'
            ) {
                element.focus();
            }

            if (
                element.matches &&
                element.matches(
                    'input,textarea,select'
                )
            ) {
                nativeValueSetter(
                    element,
                    nextValue
                );

                dispatchInputEvents(
                    element
                );

                if (
                    String(
                        element.value == null
                            ? ''
                            : element.value
                    ) !== nextValue
                ) {
                    nativeValueSetter(
                        element,
                        nextValue
                    );

                    dispatchInputEvents(
                        element
                    );
                }
            }
            else if (
                element.isContentEditable
            ) {
                element.textContent =
                    nextValue;

                dispatchInputEvents(
                    element
                );
            }
            else {
                return false;
            }

            const actualValue =
                element.isContentEditable
                    ? String(
                        element.innerText ||
                        element.textContent ||
                        ''
                    )
                    : String(
                        element.value == null
                            ? ''
                            : element.value
                    );

            return (
                actualValue ===
                    nextValue ||
                plain(actualValue) ===
                    plain(nextValue)
            );
        }
        catch (error) {
            console.warn(
                '[门诊助手] 写入控件失败：',
                error,
                element
            );

            return false;
        }
        finally {
            if (
                hadReadonly &&
                element.setAttribute
            ) {
                element.setAttribute(
                    'readonly',
                    'readonly'
                );
            }
        }
    }

    function controlValue(element) {
        if (!element) {
            return '';
        }

        if (
            element.matches(
                'input,textarea,select'
            )
        ) {
            return compactText(
                element.value
            );
        }

        if (element.isContentEditable) {
            return compactText(
                element.innerText ||
                element.textContent
            );
        }

        return '';
    }

    function candidateControls(root) {
        if (
            !root ||
            isOwnAssistantUi(root)
        ) {
            return [];
        }

        const result = [];

        if (
            root.matches &&
            root.matches(
                'textarea,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),[contenteditable="true"]'
            )
        ) {
            result.push(root);
        }

        if (root.querySelectorAll) {
            Array.from(
                root.querySelectorAll(
                    'textarea,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),[contenteditable="true"]'
                )
            ).forEach(element => {
                if (
                    isVisible(element) &&
                    !result.includes(element)
                ) {
                    result.push(element);
                }
            });
        }

        return result;
    }

    function normalizedLabelText(element) {
        return plain(
            element.innerText ||
            element.textContent
        )
            .replace(/[：:＊*]/g, '')
            .trim();
    }

    function labelMatches(text, labels) {
        const normalized =
            plain(text)
                .replace(/[：:＊*]/g, '')
                .trim();

        return labels.some(label => {
            const target =
                plain(label)
                    .replace(/[：:＊*]/g, '')
                    .trim();

            return (
                normalized === target ||
                normalized.startsWith(
                    target + ' '
                )
            );
        });
    }

    function findControlNearLabel(labels) {
        const selector = [
            'label',
            'span',
            'div',
            'td',
            'th',
            'p'
        ].join(',');

        for (const doc of allDocuments()) {
            const labelElements =
                Array.from(
                    doc.querySelectorAll(
                        selector
                    )
                )
                    .filter(isVisible)
                    .filter(element => {
                        const text =
                            normalizedLabelText(
                                element
                            );

                        return (
                            text.length <= 20 &&
                            labelMatches(
                                text,
                                labels
                            )
                        );
                    });

            for (const labelElement of labelElements) {
                const directRoots = [
                    labelElement,
                    labelElement.parentElement,
                    labelElement.nextElementSibling,
                    labelElement.parentElement
                        ? labelElement.parentElement
                            .nextElementSibling
                        : null
                ].filter(Boolean);

                for (const root of directRoots) {
                    const controls =
                        candidateControls(root)
                            .filter(isVisible)
                            .filter(control => {
                                const type =
                                    plain(
                                        control.getAttribute(
                                            'type'
                                        )
                                    ).toLowerCase();

                                return ![
                                    'button',
                                    'submit'
                                ].includes(type);
                            });

                    if (controls.length) {
                        const textarea =
                            controls.find(control =>
                                control.matches(
                                    'textarea,[contenteditable="true"]'
                                )
                            );

                        return (
                            textarea ||
                            controls[0]
                        );
                    }
                }

                let ancestor =
                    labelElement.parentElement;

                for (
                    let depth = 0;
                    ancestor && depth < 5;
                    depth += 1,
                    ancestor = ancestor.parentElement
                ) {
                    const controls =
                        candidateControls(
                            ancestor
                        )
                            .filter(isVisible)
                            .filter(control => {
                                const placeholder =
                                    plain(
                                        control.getAttribute(
                                            'placeholder'
                                        )
                                    );

                                return !/编码名称|拼音查询/.test(
                                    placeholder
                                );
                            });

                    if (controls.length === 1) {
                        return controls[0];
                    }

                    if (controls.length > 1) {
                        const textarea =
                            controls.find(control =>
                                control.matches(
                                    'textarea,[contenteditable="true"]'
                                )
                            );

                        if (textarea) {
                            return textarea;
                        }
                    }
                }
            }
        }

        return null;
    }

    function findFieldControl(fieldKey) {
        const definition =
            FIELD_DEFINITIONS[fieldKey];

        if (!definition) {
            return null;
        }

        for (const doc of allDocuments()) {
            const exactSelectors =
                definition.labels.flatMap(label => [
                    `textarea[placeholder*="${label}"]`,
                    `input[placeholder*="${label}"]`,
                    `[contenteditable="true"][data-placeholder*="${label}"]`
                ]);

            for (const selector of exactSelectors) {
                const control =
                    Array.from(
                        doc.querySelectorAll(
                            selector
                        )
                    ).find(isVisible);

                if (control) {
                    return control;
                }
            }
        }

        return findControlNearLabel(
            definition.labels
        );
    }

    function readNamedInput(labelNames) {
        const element =
            findControlNearLabel(
                labelNames
            );

        return controlValue(element);
    }

    function parsePatientBanner() {
        let pageText = '';

        allDocuments().forEach(doc => {
            pageText +=
                '\n' +
                plain(
                    doc.body
                        ? doc.body.innerText
                        : ''
                ).slice(0, 12000);
        });

        const result = {
            name: '',
            sex: '',
            age: '',
            insurance: ''
        };

        const slashMatch =
            pageText.match(
                /([\u4e00-\u9fa5·]{2,10})\s*\/\s*(男|女)\s*\/\s*(\d{1,3})岁(?:\s*\/\s*([^/\n]{1,20}))?/
            );

        if (slashMatch) {
            result.name =
                slashMatch[1] || '';
            result.sex =
                slashMatch[2] || '';
            result.age =
                slashMatch[3] || '';
            result.insurance =
                plain(
                    slashMatch[4] || ''
                );
        }

        return result;
    }

    function readCurrentRecord() {
        const fields = {};

        Object.keys(
            FIELD_DEFINITIONS
        ).forEach(key => {
            fields[key] =
                controlValue(
                    findFieldControl(key)
                );
        });

        const patient =
            parsePatientBanner();

        const vitals = {
            height:
                readNamedInput(
                    ['身高']
                ),
            weight:
                readNamedInput(
                    ['体重']
                ),
            temperature:
                readNamedInput(
                    ['体温']
                ),
            pulse:
                readNamedInput(
                    ['脉搏']
                ),
            respiration:
                readNamedInput(
                    ['呼吸']
                ),
            bloodGlucose:
                readNamedInput(
                    ['血糖']
                ),
            systolicPressure:
                readNamedInput(
                    ['收缩压']
                ),
            diastolicPressure:
                readNamedInput(
                    ['舒张压']
                ),
            onsetDate:
                readNamedInput(
                    ['发病日期']
                )
        };

        const record = {
            patient: patient,
            vitals: vitals,
            fields: fields,
            westernDiagnosisSearch:
                readDiagnosisSearchValue(
                    '西医诊断'
                ),
            tcmDiseaseSearch:
                readDiagnosisSearchValue(
                    '中医病名'
                ),
            tcmSyndromeSearch:
                readDiagnosisSearchValue(
                    '中医证候'
                ),
            tcmDiagnosisSearch:
                readDiagnosisSearchValue(
                    '中医病名'
                ) ||
                readDiagnosisSearchValue(
                    '中医证候'
                )
        };

        state.sourceRecord =
            record;

        return record;
    }

    function diagnosisInputCandidates(root) {
        if (!root) {
            return [];
        }

        return candidateControls(root)
            .filter(element => {
                if (
                    !element ||
                    !element.matches ||
                    !element.matches(
                        'input:not([type="hidden"]),textarea,[contenteditable="true"]'
                    )
                ) {
                    return false;
                }

                const type =
                    plain(
                        element.getAttribute
                            ? element.getAttribute('type')
                            : ''
                    ).toLowerCase();

                if (
                    type === 'checkbox' ||
                    type === 'radio' ||
                    type === 'button'
                ) {
                    return false;
                }

                const placeholder =
                    plain(
                        element.getAttribute
                            ? (
                                element.getAttribute('placeholder') ||
                                element.getAttribute('data-placeholder') ||
                                element.getAttribute('aria-label') ||
                                ''
                            )
                            : ''
                    );

                return (
                    /编码名称|拼音查询|诊断检索|诊断查询|输入诊断/.test(
                        placeholder
                    ) ||
                    Boolean(
                        element.closest &&
                        element.closest(
                            '.el-autocomplete,.autocomplete,[class*="autocomplete"],[class*="diagnos"]'
                        )
                    )
                );
            })
            .sort((first, second) => {
                const firstRect =
                    first.getBoundingClientRect();
                const secondRect =
                    second.getBoundingClientRect();

                if (
                    Math.abs(firstRect.top - secondRect.top) > 8
                ) {
                    return firstRect.top - secondRect.top;
                }

                return firstRect.left - secondRect.left;
            });
    }

    function exactTextElements(root, expectedText) {
        if (!root) {
            return [];
        }

        return Array.from(
            root.querySelectorAll(
                'label,span,div,td,th,p,b,strong'
            )
        )
            .filter(isVisible)
            .filter(element =>
                normalizedLabelText(element) ===
                expectedText
            )
            .sort((first, second) => {
                const firstRect =
                    first.getBoundingClientRect();
                const secondRect =
                    second.getBoundingClientRect();

                return (
                    firstRect.width * firstRect.height -
                    secondRect.width * secondRect.height
                );
            });
    }

    function findTcmDiagnosisRowRoot(labelElement) {
        let ancestor =
            labelElement;
        let best =
            null;

        for (
            let depth = 0;
            ancestor && depth < 11;
            depth += 1,
            ancestor = ancestor.parentElement
        ) {
            const textValue =
                normalizedLabelText(
                    ancestor
                );

            if (
                textValue.includes('西医诊断') &&
                depth > 2
            ) {
                break;
            }

            const candidates =
                diagnosisInputCandidates(
                    ancestor
                );

            const syndromeMarkers =
                exactTextElements(
                    ancestor,
                    '证候'
                );

            if (
                candidates.length >= 1 &&
                syndromeMarkers.length
            ) {
                best = {
                    root: ancestor,
                    candidates: candidates,
                    marker:
                        syndromeMarkers[0]
                };
                break;
            }
        }

        return best;
    }

    /*
     * 中医诊断行包含两个不同检索框：
     * 1. “中医病名”位于“中医诊断”标签与“证候”文字之间；
     * 2. “中医证候”位于“证候”文字右侧。
     * 原版本只按“中医诊断”整行寻找最近输入框，容易把病名写到证候框。
     */
    function tcmDiagnosisSearchControl(kind) {
        /*
         * 门诊中医诊断行的实际结构并不稳定：
         *
         *   中医诊断　主　疑似　[病名控件]　证候　[证型检索框]
         *
         * 病名框在为空或已经选中病名时，可能同时失去placeholder、
         * autocomplete类名，甚至由外层组件把真实input缩成透明编辑层。
         * 因而本版不再以“中医诊断”标签为唯一入口，而是：
         * 1. 先定位“证候”右侧较稳定的证型检索框；
         * 2. 再沿同一水平行向左反查最靠近它的文本编辑控件作为病名框；
         * 3. 最后才使用中医诊断标签与证候文字进行传统坐标兜底。
         */

        function visibleGeometry(element, allowTransparent) {
            if (
                !element ||
                !element.isConnected ||
                isOwnAssistantUi(element)
            ) {
                return false;
            }

            let style;
            let rect;

            try {
                style = element.ownerDocument.defaultView
                    .getComputedStyle(element);
                rect = element.getBoundingClientRect();
            }
            catch (error) {
                return false;
            }

            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                (allowTransparent || Number(style.opacity || 1) !== 0) &&
                rect.width > 0 &&
                rect.height > 0
            );
        }

        function isEditableTextControl(element, allowTransparent) {
            if (
                !element ||
                !element.matches ||
                !element.matches(
                    'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                ) ||
                !visibleGeometry(element, allowTransparent)
            ) {
                return false;
            }

            if (element.matches('input')) {
                const type = plain(
                    element.getAttribute('type') || 'text'
                ).toLowerCase();

                if (
                    [
                        'checkbox',
                        'radio',
                        'button',
                        'submit',
                        'reset',
                        'file',
                        'image',
                        'range',
                        'color',
                        'date',
                        'datetime-local',
                        'time',
                        'month',
                        'week',
                        'number'
                    ].includes(type)
                ) {
                    return false;
                }
            }

            const placeholder = plain(
                element.getAttribute('placeholder') ||
                element.getAttribute('data-placeholder') ||
                element.getAttribute('aria-label') ||
                element.getAttribute('title') ||
                ''
            );

            return !/国家医保|医保码|医保编码|诊断编码|疾病编码|备注|子位|部位/.test(
                placeholder
            );
        }

        function controlMeta(element) {
            const placeholder = plain(
                element.getAttribute('placeholder') ||
                element.getAttribute('data-placeholder') ||
                element.getAttribute('aria-label') ||
                element.getAttribute('title') ||
                ''
            );
            const classText = [
                element.className || '',
                element.parentElement
                    ? element.parentElement.className || ''
                    : '',
                element.parentElement && element.parentElement.parentElement
                    ? element.parentElement.parentElement.className || ''
                    : ''
            ].join(' ');

            return {
                placeholder: placeholder,
                classText: classText,
                searchLike:
                    /编码名称|拼音查询|诊断检索|诊断查询|输入诊断/.test(
                        placeholder
                    ) ||
                    /autocomplete|diagnos|combogrid|textbox-text/i.test(
                        classText
                    )
            };
        }

        function textMarkers(doc, expectedText) {
            const result = [];
            const seen = new Set();

            Array.from(
                doc.querySelectorAll(
                    'label,span,div,td,th,p,b,strong,em,i'
                )
            )
                .filter(element => visibleGeometry(element, false))
                .forEach(element => {
                    const normalized = normalizedLabelText(element);

                    if (
                        normalized !== expectedText &&
                        normalized !== expectedText + '：'
                    ) {
                        return;
                    }

                    if (seen.has(element)) {
                        return;
                    }

                    seen.add(element);
                    result.push(element);
                });

            return result
                .filter((element, index, array) => {
                    return !array.some(other => {
                        if (
                            other === element ||
                            !element.contains(other)
                        ) {
                            return false;
                        }

                        return (
                            normalizedLabelText(other) ===
                            normalizedLabelText(element)
                        );
                    });
                })
                .sort((first, second) => {
                    const firstRect = first.getBoundingClientRect();
                    const secondRect = second.getBoundingClientRect();

                    return (
                        firstRect.width * firstRect.height -
                        secondRect.width * secondRect.height
                    );
                });
        }

        function tcmRowLabelNear(doc, centerY) {
            const labels = outpatientDiagnosisExactLabels
                ? outpatientDiagnosisExactLabels(doc, '中医诊断')
                : [];

            const fallbackLabels = labels.length
                ? labels
                : textMarkers(doc, '中医诊断');

            return fallbackLabels
                .map(element => {
                    const rect = element.getBoundingClientRect();
                    const elementCenterY =
                        (rect.top + rect.bottom) / 2;

                    return {
                        element: element,
                        score: Math.abs(elementCenterY - centerY)
                    };
                })
                .filter(item => item.score <= 90)
                .sort((first, second) => first.score - second.score)[0] ||
                null;
        }

        function syndromeAnchorCandidates(doc) {
            const markers = textMarkers(doc, '证候');
            const controls = Array.from(
                doc.querySelectorAll(
                    'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                )
            ).filter(element => isEditableTextControl(element, false));

            const candidates = [];

            controls.forEach(control => {
                const rect = control.getBoundingClientRect();
                const centerY = (rect.top + rect.bottom) / 2;
                const meta = controlMeta(control);

                markers.forEach(marker => {
                    const markerRect = marker.getBoundingClientRect();
                    const markerCenterY =
                        (markerRect.top + markerRect.bottom) / 2;
                    const vertical = Math.abs(centerY - markerCenterY);

                    if (
                        vertical > 45 ||
                        rect.left < markerRect.right - 12 ||
                        rect.left > markerRect.right + 520
                    ) {
                        return;
                    }

                    const tcmLabel = tcmRowLabelNear(doc, centerY);
                    let score =
                        vertical * 100 +
                        Math.max(0, rect.left - markerRect.right);

                    if (meta.searchLike) {
                        score -= 2600;
                    }

                    if (tcmLabel) {
                        const labelRect = tcmLabel.element
                            .getBoundingClientRect();

                        if (labelRect.left < markerRect.left) {
                            score -= 900;
                        }
                    }

                    candidates.push({
                        control: control,
                        marker: marker,
                        markerRect: markerRect,
                        score: score
                    });
                });
            });

            candidates.sort((first, second) =>
                first.score - second.score
            );

            return candidates;
        }

        function diseaseFromSyndromeAnchor(doc, anchor) {
            if (!anchor || !anchor.control) {
                return null;
            }

            const syndromeInput = anchor.control;
            const syndromeRect = syndromeInput.getBoundingClientRect();
            const syndromeCenterY =
                (syndromeRect.top + syndromeRect.bottom) / 2;
            const markerRect = anchor.markerRect;
            const tcmLabel = tcmRowLabelNear(doc, syndromeCenterY);
            const leftBoundary = tcmLabel
                ? tcmLabel.element.getBoundingClientRect().right - 8
                : syndromeRect.left - 620;

            const controls = Array.from(
                doc.querySelectorAll(
                    'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                )
            )
                /*
                 * 允许opacity:0的组件编辑层参与候选。部分自动完成组件
                 * 未激活时会把真实input设为透明，但它仍具有正确坐标。
                 */
                .filter(element => isEditableTextControl(element, true))
                .filter(element => element !== syndromeInput)
                .map(element => {
                    const rect = element.getBoundingClientRect();
                    const centerY = (rect.top + rect.bottom) / 2;

                    if (
                        Math.abs(centerY - syndromeCenterY) > 34 ||
                        rect.left <= leftBoundary ||
                        rect.right > markerRect.left + 18 ||
                        rect.left < syndromeRect.left - 640 ||
                        rect.width < 18 ||
                        rect.height < 10
                    ) {
                        return null;
                    }

                    const meta = controlMeta(element);
                    const value = plain(
                        element.isContentEditable
                            ? element.textContent
                            : element.value
                    );
                    let score =
                        Math.abs(centerY - syndromeCenterY) * 100 +
                        Math.max(0, markerRect.left - rect.right);

                    /*
                     * 病名框就是“证候”左侧最靠近的可编辑文本控件。
                     */
                    score += Math.abs(
                        markerRect.left - rect.right
                    ) * 4;

                    if (meta.searchLike) {
                        score -= 1600;
                    }

                    if (value && !/^[A-Z]\d[\w.×X+_-]*$/i.test(value)) {
                        score -= 420;
                    }

                    return {
                        control: element,
                        score: score
                    };
                })
                .filter(Boolean)
                .sort((first, second) =>
                    first.score - second.score
                );

            return controls[0]
                ? controls[0].control
                : null;
        }

        for (const doc of allDocuments()) {
            const anchors = syndromeAnchorCandidates(doc);

            if (anchors.length) {
                if (kind === 'syndrome') {
                    return anchors[0].control;
                }

                const disease = diseaseFromSyndromeAnchor(
                    doc,
                    anchors[0]
                );

                if (disease) {
                    return disease;
                }
            }
        }

        /*
         * 传统标签坐标兜底。用于证候检索框本身没有placeholder，
         * 或医院页面暂时未渲染自动完成类名的情况。
         */
        for (const doc of allDocuments()) {
            const labels = outpatientDiagnosisExactLabels
                ? outpatientDiagnosisExactLabels(doc, '中医诊断')
                : textMarkers(doc, '中医诊断');

            for (const labelElement of labels) {
                const labelRect = labelElement.getBoundingClientRect();
                const labelCenterY =
                    (labelRect.top + labelRect.bottom) / 2;
                const markers = textMarkers(doc, '证候')
                    .filter(marker => {
                        const rect = marker.getBoundingClientRect();
                        const centerY =
                            (rect.top + rect.bottom) / 2;

                        return (
                            rect.left > labelRect.right - 5 &&
                            Math.abs(centerY - labelCenterY) <= 75
                        );
                    })
                    .sort((first, second) => {
                        const firstRect = first.getBoundingClientRect();
                        const secondRect = second.getBoundingClientRect();

                        return firstRect.left - secondRect.left;
                    });

                if (!markers.length) {
                    continue;
                }

                const markerRect = markers[0].getBoundingClientRect();
                const markerCenterY =
                    (markerRect.top + markerRect.bottom) / 2;
                const controls = Array.from(
                    doc.querySelectorAll(
                        'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                    )
                )
                    .filter(element => isEditableTextControl(element, true))
                    .map(element => {
                        const rect = element.getBoundingClientRect();
                        const centerY = (rect.top + rect.bottom) / 2;

                        return {
                            element: element,
                            rect: rect,
                            centerY: centerY,
                            meta: controlMeta(element)
                        };
                    })
                    .filter(item =>
                        Math.abs(item.centerY - markerCenterY) <= 38
                    );

                if (kind === 'syndrome') {
                    const after = controls
                        .filter(item =>
                            item.rect.left >= markerRect.right - 12
                        )
                        .sort((first, second) => {
                            const firstScore =
                                Math.max(0, first.rect.left - markerRect.right) -
                                (first.meta.searchLike ? 1500 : 0);
                            const secondScore =
                                Math.max(0, second.rect.left - markerRect.right) -
                                (second.meta.searchLike ? 1500 : 0);

                            return firstScore - secondScore;
                        });

                    if (after[0]) {
                        return after[0].element;
                    }
                }
                else {
                    const before = controls
                        .filter(item =>
                            item.rect.left > labelRect.right - 8 &&
                            item.rect.right <= markerRect.left + 18
                        )
                        .sort((first, second) =>
                            second.rect.right - first.rect.right
                        );

                    if (before[0]) {
                        return before[0].element;
                    }
                }
            }
        }

        return null;
    }

    /*
     * 返回指定诊断类型对应的检索输入框。
     *
     * 门诊系统中的“西医诊断”和“中医诊断”通常是自动完成组件，
     * 标签、检索框、疑似选项及其他控件可能被多层div包裹。
     * 因此不再只依赖固定父级层数，而是同时使用：
     * 1. 标签文字；
     * 2. 输入框placeholder；
     * 3. 标签和输入框的屏幕坐标；
     * 4. 最近共同容器；
     * 进行综合定位。
     */
    function diagnosisSearchControl(labelText) {
        if (
            labelText === '中医病名' ||
            labelText === '中医诊断'
        ) {
            return tcmDiagnosisSearchControl(
                'disease'
            );
        }

        if (labelText === '中医证候') {
            return tcmDiagnosisSearchControl(
                'syndrome'
            );
        }

        const oppositeLabel =
            labelText === '西医诊断'
                ? '中医诊断'
                : '西医诊断';

        for (const doc of allDocuments()) {
            const labelElements =
                Array.from(
                    doc.querySelectorAll(
                        'label,span,div,td,th,p'
                    )
                )
                    .filter(isVisible)
                    .filter(element => {
                        const value =
                            normalizedLabelText(
                                element
                            );

                        return (
                            value === labelText ||
                            value.startsWith(
                                labelText + ' '
                            )
                        );
                    });

            const allCandidateInputs =
                Array.from(
                    doc.querySelectorAll(
                        [
                            'input:not([type="hidden"])',
                            'textarea',
                            '[contenteditable="true"]'
                        ].join(',')
                    )
                )
                    .filter(isVisible)
                    .filter(element => {
                        if (
                            isOwnAssistantUi(
                                element
                            )
                        ) {
                            return false;
                        }

                        const placeholder =
                            plain(
                                element.getAttribute
                                    ? (
                                        element.getAttribute(
                                            'placeholder'
                                        ) ||
                                        element.getAttribute(
                                            'data-placeholder'
                                        ) ||
                                        ''
                                    )
                                    : ''
                            );

                        const ariaLabel =
                            plain(
                                element.getAttribute
                                    ? (
                                        element.getAttribute(
                                            'aria-label'
                                        ) ||
                                        ''
                                    )
                                    : ''
                            );

                        return (
                            /编码名称|拼音查询|诊断检索|诊断查询|输入诊断/.test(
                                placeholder + ' ' + ariaLabel
                            ) ||
                            Boolean(
                                element.closest &&
                                element.closest(
                                    '.el-autocomplete,.el-select,.autocomplete,[class*="autocomplete"],[class*="diagnos"]'
                                )
                            )
                        );
                    });

            for (const labelElement of labelElements) {
                const labelRect =
                    labelElement
                        .getBoundingClientRect();

                let ancestor =
                    labelElement;

                /*
                 * 优先在标签的最近祖先容器内寻找检索框。
                 */
                for (
                    let depth = 0;
                    ancestor && depth < 9;
                    depth += 1,
                    ancestor = ancestor.parentElement
                ) {
                    const ancestorText =
                        normalizedLabelText(
                            ancestor
                        );

                    if (
                        ancestorText.includes(
                            oppositeLabel
                        ) &&
                        depth > 2
                    ) {
                        /*
                         * 已经扩大到同时包含中西医两行的公共容器，
                         * 此后改用坐标评分，避免误选另一行输入框。
                         */
                        break;
                    }

                    const localCandidates =
                        candidateControls(
                            ancestor
                        )
                            .filter(element => {
                                const placeholder =
                                    plain(
                                        element.getAttribute
                                            ? (
                                                element.getAttribute(
                                                    'placeholder'
                                                ) ||
                                                element.getAttribute(
                                                    'data-placeholder'
                                                ) ||
                                                ''
                                            )
                                            : ''
                                    );

                                return (
                                    /编码名称|拼音查询|诊断检索|诊断查询|输入诊断/.test(
                                        placeholder
                                    ) ||
                                    Boolean(
                                        element.closest &&
                                        element.closest(
                                            '.el-autocomplete,.autocomplete,[class*="autocomplete"],[class*="diagnos"]'
                                        )
                                    )
                                );
                            });

                    if (localCandidates.length) {
                        const ranked =
                            localCandidates
                                .map(element => {
                                    const rect =
                                        element
                                            .getBoundingClientRect();

                                    const verticalDistance =
                                        Math.abs(
                                            (
                                                rect.top +
                                                rect.bottom
                                            ) /
                                            2 -
                                            (
                                                labelRect.top +
                                                labelRect.bottom
                                            ) /
                                            2
                                        );

                                    const horizontalPenalty =
                                        rect.left <
                                        labelRect.left
                                            ? 80
                                            : 0;

                                    return {
                                        element,
                                        score:
                                            verticalDistance +
                                            horizontalPenalty
                                    };
                                })
                                .sort(
                                    (
                                        first,
                                        second
                                    ) =>
                                        first.score -
                                        second.score
                                );

                        if (ranked[0]) {
                            return ranked[0]
                                .element;
                        }
                    }
                }

                /*
                 * 局部容器定位失败时，在当前文档所有疑似诊断检索框中，
                 * 选择与标签处于同一水平行且距离最近的一个。
                 */
                const rankedGlobal =
                    allCandidateInputs
                        .map(element => {
                            const rect =
                                element
                                    .getBoundingClientRect();

                            const verticalDistance =
                                Math.abs(
                                    (
                                        rect.top +
                                        rect.bottom
                                    ) /
                                    2 -
                                    (
                                        labelRect.top +
                                        labelRect.bottom
                                    ) /
                                    2
                                );

                            const horizontalPenalty =
                                rect.left <
                                labelRect.left
                                    ? 120
                                    : 0;

                            const excessiveDistancePenalty =
                                verticalDistance > 55
                                    ? 300
                                    : 0;

                            return {
                                element,
                                score:
                                    verticalDistance +
                                    horizontalPenalty +
                                    excessiveDistancePenalty
                            };
                        })
                        .sort(
                            (
                                first,
                                second
                            ) =>
                                first.score -
                                second.score
                        );

                if (
                    rankedGlobal[0] &&
                    rankedGlobal[0].score < 360
                ) {
                    return rankedGlobal[0]
                        .element;
                }
            }
        }

        return null;
    }

    function diagnosisRow(labelText) {
        const input =
            diagnosisSearchControl(
                labelText
            );

        if (!input) {
            return null;
        }

        return {
            root:
                input.parentElement ||
                input,
            inputs: [
                input
            ]
        };
    }

    function readDiagnosisSearchValue(labelText) {
        const input =
            diagnosisSearchControl(
                labelText
            );

        return controlValue(
            input
        );
    }

    /*
     * 自动完成检索框专用写入函数。
     *
     * 普通病历字段写入后会主动blur，以便Vue同步数据；
     * 但诊断检索框在尚未人工选中候选项时，一旦blur就会把检索词清空。
     * 因此这里绝不主动失焦，并额外派发beforeinput、input、change、
     * keydown、keyup等事件来触发医院系统的候选列表。
     */
    async function setAutocompleteSearchValue(
        element,
        value,
        keepFocused,
        focusBefore
    ) {
        if (
            !element ||
            !plain(value)
        ) {
            return false;
        }

        const nextValue =
            plain(value);

        const view =
            element.ownerDocument &&
            element.ownerDocument.defaultView
                ? element.ownerDocument.defaultView
                : window;

        const EventConstructor =
            view.Event ||
            Event;

        const KeyboardEventConstructor =
            view.KeyboardEvent ||
            KeyboardEvent;

        const InputEventConstructor =
            view.InputEvent ||
            null;

        try {
            if (
                focusBefore !== false &&
                typeof element.focus ===
                'function'
            ) {
                element.focus();
            }

            /*
             * 先清空再输入，确保自动完成组件识别为一次新的检索。
             */
            nativeValueSetter(
                element,
                ''
            );

            element.dispatchEvent(
                new EventConstructor(
                    'input',
                    {
                        bubbles: true
                    }
                )
            );

            if (InputEventConstructor) {
                try {
                    element.dispatchEvent(
                        new InputEventConstructor(
                            'beforeinput',
                            {
                                bubbles: true,
                                cancelable: true,
                                inputType:
                                    'insertText',
                                data:
                                    nextValue
                            }
                        )
                    );
                }
                catch (error) {
                    // 老版本浏览器不支持完整InputEvent参数时忽略。
                }
            }

            nativeValueSetter(
                element,
                nextValue
            );

            [
                'input',
                'change'
            ].forEach(type => {
                element.dispatchEvent(
                    new EventConstructor(
                        type,
                        {
                            bubbles: true
                        }
                    )
                );
            });

            [
                'keydown',
                'keyup'
            ].forEach(type => {
                try {
                    element.dispatchEvent(
                        new KeyboardEventConstructor(
                            type,
                            {
                                key: 'Process',
                                code: '',
                                keyCode: 229,
                                which: 229,
                                bubbles: true
                            }
                        )
                    );
                }
                catch (error) {
                    element.dispatchEvent(
                        new EventConstructor(
                            type,
                            {
                                bubbles: true
                            }
                        )
                    );
                }
            });

            /*
             * 给医院系统的防抖检索留出时间。
             */
            await sleep(420);

            /*
             * 如果自动完成组件在异步更新时恢复为空，再补写一次。
             */
            if (
                plain(
                    element.value
                ) !== nextValue
            ) {
                nativeValueSetter(
                    element,
                    nextValue
                );

                element.dispatchEvent(
                    new EventConstructor(
                        'input',
                        {
                            bubbles: true
                        }
                    )
                );

                element.dispatchEvent(
                    new EventConstructor(
                        'change',
                        {
                            bubbles: true
                        }
                    )
                );

                await sleep(180);
            }

            if (
                keepFocused &&
                typeof element.focus ===
                    'function'
            ) {
                element.focus();

                if (
                    typeof element.setSelectionRange ===
                    'function'
                ) {
                    const length =
                        String(
                            element.value ||
                            ''
                        ).length;

                    try {
                        element.setSelectionRange(
                            length,
                            length
                        );
                    }
                    catch (error) {
                        // 非文本输入框时忽略。
                    }
                }
            }

            return (
                plain(
                    element.value
                ) === nextValue
            );
        }
        catch (error) {
            console.warn(
                '[门诊助手] 诊断检索词写入失败：',
                error,
                element
            );

            return false;
        }
    }

    async function fillDiagnosisSearch(
        labelText,
        value,
        keepFocused,
        focusBefore
    ) {
        const input =
            diagnosisSearchControl(
                labelText
            );

        if (
            !input ||
            !plain(value)
        ) {
            console.warn(
                '[门诊助手] 未找到' +
                labelText +
                '检索框。'
            );

            return false;
        }

        const success =
            await setAutocompleteSearchValue(
                input,
                value,
                keepFocused !== false,
                focusBefore !== false
            );

        console.log(
            '[门诊助手] ' +
            labelText +
            '检索词写入结果：' +
            (
                success
                    ? '成功'
                    : '失败'
            ),
            input
        );

        return success;
    }


    /******************************************************************
     * 门诊诊断自动录入
     *
     * 与病案首页诊断列表脚本相同的核心原则：
     * 1. 按顺序逐条检索并真实点击医院诊断库候选项；
     * 2. 每个关键步骤均接入暂停、继续和中止检查；
     * 3. 中止后保留已经完成的页面选择，不点击就诊保存、结束就诊；
     * 4. 门诊页面没有病案首页的出院情况、入院病情和F3保存诊断；
     * 5. 本模块仅处理西医主诊断和副诊断，不再自动录入中医病名、证候。
     ******************************************************************/

    const OUTPATIENT_DIAGNOSIS_PROGRESS_ID =
        'outpatient-ai-diagnosis-progress-v1';

    class OutpatientDiagnosisStoppedError extends Error {
        constructor(message) {
            super(message || '用户已中止门诊诊断录入');
            this.name = 'OutpatientDiagnosisStoppedError';
            this.userStopped = true;
        }
    }

    function isOutpatientDiagnosisStoppedError(error) {
        return Boolean(
            error &&
            (
                error.userStopped ||
                error.name === 'OutpatientDiagnosisStoppedError'
            )
        );
    }

    function outpatientDiagnosisNormalize(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, '')
            .replace(/[：:*＊★☆]/g, '')
            .replace(/[（(].*?[）)]/g, '')
            .replace(/[【\[].*?[】\]]/g, '')
            .toLowerCase()
            .trim();
    }

    function outpatientDiagnosisNormalizeCode(value) {
        return String(value == null ? '' : value)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
    }

    function outpatientDiagnosisDisplayName(item) {
        if (!item) {
            return '';
        }

        if (item.kind === 'western') {
            return (
                (item.westernIndex === 0
                    ? '西医主诊断：'
                    : '西医副诊断：') +
                item.name
            );
        }

        if (item.kind === 'tcmDisease') {
            return '中医病名：' + item.name;
        }

        return '中医证型：' + item.name;
    }

    function buildOutpatientDiagnosisItems(modal) {
        const result = resultFromEditors(modal);
        const items = [];

        (result.westernDiagnoses || [])
            .filter(item => item && plain(item.name))
            .forEach((item, index) => {
                items.push({
                    kind: 'western',
                    westernIndex: index,
                    name: plain(item.name),
                    code: plain(item.code),
                    status: ''
                });
            });

        /*
         * 门诊中医病名、证候组件结构与西医诊断不同，且医院页面
         * 对中医检索框的激活状态不稳定。按当前需求，诊断自动录入
         * 仅处理西医主诊断和副诊断；中医病名、证候保留人工核对。
         */
        return items;
    }

    function outpatientDiagnosisModalTargets(preferredModal) {
        const targets = [];

        function add(modal) {
            if (modal && !targets.includes(modal)) {
                targets.push(modal);
            }
        }

        add(preferredModal);
        add(modalElement());
        document
            .querySelectorAll('#' + IDS.modal)
            .forEach(add);

        return targets;
    }

    function updateOutpatientDiagnosisControls(preferredModal) {
        outpatientDiagnosisModalTargets(preferredModal)
            .forEach(modal => {
                const start = modal.querySelector(
                    '.outpatient-ai-diagnosis-insert'
                );
                const pause = modal.querySelector(
                    '.outpatient-ai-diagnosis-pause'
                );
                const stop = modal.querySelector(
                    '.outpatient-ai-diagnosis-stop'
                );
                const status = modal.querySelector(
                    '.outpatient-ai-diagnosis-status'
                );

                if (start) {
                    start.disabled = Boolean(
                        state.diagnosisBusy ||
                        state.busy ||
                        state.orderBusy ||
                        state.orderAiBusy
                    );
                    start.textContent = state.diagnosisBusy
                        ? '正在录入诊断……'
                        : '录入诊断';
                }

                if (pause) {
                    pause.disabled = Boolean(
                        !state.diagnosisBusy ||
                        state.diagnosisStopRequested
                    );
                    pause.textContent = state.diagnosisPaused
                        ? '继续录入'
                        : '暂停录入';
                    pause.dataset.paused = state.diagnosisPaused
                        ? 'true'
                        : 'false';
                }

                if (stop) {
                    stop.disabled = !state.diagnosisBusy;
                    stop.textContent =
                        state.diagnosisBusy &&
                        state.diagnosisStopRequested
                            ? '正在中止……'
                            : '中止录入';
                }

                if (status) {
                    if (state.diagnosisBusy) {
                        const current =
                            state.diagnosisCurrentIndex >= 0
                                ? state.diagnosisCurrentIndex + 1
                                : 0;

                        status.style.display = 'block';
                        status.dataset.type = state.diagnosisPaused
                            ? 'paused'
                            : 'running';
                        status.textContent = state.diagnosisPaused
                            ? (
                                '诊断录入已暂停：当前' +
                                current + '/' +
                                state.diagnosisTotal +
                                '。点击“继续录入”后从当前步骤继续。'
                            )
                            : (
                                '正在录入诊断：' +
                                current + '/' +
                                state.diagnosisTotal +
                                '。'
                            );
                    }
                    else {
                        status.style.display = 'none';
                        status.textContent = '';
                        status.dataset.type = '';
                    }
                }
            });

        syncOutpatientDiagnosisProgressControls();
    }

    function showOutpatientDiagnosisProgress(message, type) {
        let box = document.getElementById(
            OUTPATIENT_DIAGNOSIS_PROGRESS_ID
        );

        if (!box) {
            box = document.createElement('div');
            box.id = OUTPATIENT_DIAGNOSIS_PROGRESS_ID;
            box.innerHTML = [
                '<div class="outpatient-diagnosis-progress-text"></div>',
                '<div class="outpatient-diagnosis-progress-actions">',
                '<button type="button" data-action="pause">暂停</button>',
                '<button type="button" data-action="stop">中止</button>',
                '</div>'
            ].join('');

            Object.assign(box.style, {
                position: 'fixed',
                right: '20px',
                bottom: '20px',
                zIndex: '2147483647',
                width: '420px',
                maxWidth: 'calc(100vw - 40px)',
                padding: '12px 14px',
                borderRadius: '7px',
                color: '#fff',
                fontFamily: 'Microsoft YaHei,Arial,sans-serif',
                fontSize: '13px',
                lineHeight: '1.65',
                whiteSpace: 'pre-line',
                boxShadow: '0 5px 18px rgba(0,0,0,.34)'
            });

            const actions = box.querySelector(
                '.outpatient-diagnosis-progress-actions'
            );

            Object.assign(actions.style, {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '9px'
            });

            actions.querySelectorAll('button')
                .forEach(button => {
                    Object.assign(button.style, {
                        minWidth: '72px',
                        height: '30px',
                        padding: '0 10px',
                        border: '1px solid rgba(255,255,255,.75)',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,.14)',
                        color: '#fff',
                        cursor: 'pointer'
                    });
                });

            actions
                .querySelector('[data-action="pause"]')
                .addEventListener(
                    'click',
                    toggleOutpatientDiagnosisPause
                );

            actions
                .querySelector('[data-action="stop"]')
                .addEventListener(
                    'click',
                    () => {
                        if (state.diagnosisBusy) {
                            requestOutpatientDiagnosisStop();
                        }
                        else {
                            box.remove();
                        }
                    }
                );

            document.body.appendChild(box);
        }

        const colors = {
            normal: '#159bd3',
            success: '#20985b',
            warning: '#b7791f',
            error: '#dc4c40'
        };

        box.style.background = colors[type || 'normal'] || colors.normal;
        box.querySelector(
            '.outpatient-diagnosis-progress-text'
        ).textContent = String(message || '');

        syncOutpatientDiagnosisProgressControls();
        return box;
    }

    function syncOutpatientDiagnosisProgressControls() {
        const box = document.getElementById(
            OUTPATIENT_DIAGNOSIS_PROGRESS_ID
        );

        if (!box) {
            return;
        }

        const pause = box.querySelector('[data-action="pause"]');
        const stop = box.querySelector('[data-action="stop"]');

        if (pause) {
            pause.style.display = state.diagnosisBusy ? '' : 'none';
            pause.disabled = Boolean(
                !state.diagnosisBusy ||
                state.diagnosisStopRequested
            );
            pause.textContent = state.diagnosisPaused
                ? '继续'
                : '暂停';
        }

        if (stop) {
            stop.disabled = false;
            stop.textContent = state.diagnosisBusy
                ? (
                    state.diagnosisStopRequested
                        ? '中止中……'
                        : '中止'
                )
                : '关闭';
        }
    }

    function toggleOutpatientDiagnosisPause() {
        if (
            !state.diagnosisBusy ||
            state.diagnosisStopRequested
        ) {
            return;
        }

        state.diagnosisPaused = !state.diagnosisPaused;
        updateOutpatientDiagnosisControls();

        showOutpatientDiagnosisProgress(
            state.diagnosisPaused
                ? '门诊诊断录入已暂停。点击“继续”后从当前步骤继续；已经选中的诊断会保留。'
                : '已继续门诊诊断录入。',
            state.diagnosisPaused ? 'warning' : 'normal'
        );
    }

    function requestOutpatientDiagnosisStop() {
        if (!state.diagnosisBusy) {
            return;
        }

        state.diagnosisStopRequested = true;
        state.diagnosisPaused = false;
        updateOutpatientDiagnosisControls();

        showOutpatientDiagnosisProgress(
            '正在安全中止门诊诊断录入……\n已经选中的诊断会保留，不会点击就诊保存或结束就诊。',
            'error'
        );
    }

    async function outpatientDiagnosisCheckpoint(runSerial) {
        if (
            state.diagnosisStopRequested ||
            runSerial !== state.diagnosisActiveSerial
        ) {
            throw new OutpatientDiagnosisStoppedError();
        }

        while (state.diagnosisPaused) {
            await sleep(120);

            if (
                state.diagnosisStopRequested ||
                runSerial !== state.diagnosisActiveSerial
            ) {
                throw new OutpatientDiagnosisStoppedError();
            }
        }
    }

    async function outpatientDiagnosisWait(ms, runSerial) {
        const deadline = Date.now() + Math.max(0, Number(ms) || 0);

        do {
            await outpatientDiagnosisCheckpoint(runSerial);

            if (Date.now() >= deadline) {
                break;
            }

            await sleep(
                Math.min(60, Math.max(1, deadline - Date.now()))
            );
        }
        while (Date.now() < deadline);
    }

    function outpatientDiagnosisInputPlaceholder(input) {
        if (!input || !input.getAttribute) {
            return '';
        }

        return plain(
            input.getAttribute('placeholder') ||
            input.getAttribute('data-placeholder') ||
            input.getAttribute('aria-label') ||
            input.getAttribute('title') ||
            ''
        );
    }

    function outpatientDiagnosisLooksLikeSearchInput(input) {
        if (
            !input ||
            !input.matches ||
            !input.matches(
                'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
            ) ||
            !isVisible(input) ||
            isOwnAssistantUi(input)
        ) {
            return false;
        }

        const placeholder = outpatientDiagnosisInputPlaceholder(input);
        const classText = String(input.className || '');
        const parentClass = String(
            input.parentElement ? input.parentElement.className || '' : ''
        );

        return (
            /编码名称|拼音查询|诊断检索|诊断查询|输入诊断/.test(
                placeholder
            ) ||
            /autocomplete|diagnos/i.test(
                classText + ' ' + parentClass
            )
        );
    }

    function outpatientDiagnosisExactLabels(doc, labelText) {
        return Array.from(
            doc.querySelectorAll('label,span,div,td,th,p,b,strong')
        )
            .filter(isVisible)
            .filter(element => {
                const text = normalizedLabelText(element);
                return (
                    text === labelText ||
                    text === labelText + '：' ||
                    text.startsWith(labelText + ' ')
                );
            })
            .sort((first, second) => {
                const firstRect = first.getBoundingClientRect();
                const secondRect = second.getBoundingClientRect();
                return (
                    firstRect.width * firstRect.height -
                    secondRect.width * secondRect.height
                );
            });
    }

    function outpatientDiagnosisIsEditableTextControl(input) {
        if (
            !input ||
            !input.matches ||
            !input.matches(
                'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
            ) ||
            !isVisible(input) ||
            isOwnAssistantUi(input)
        ) {
            return false;
        }

        if (input.matches('input')) {
            const type = plain(
                input.getAttribute('type') || 'text'
            ).toLowerCase();

            if (
                [
                    'checkbox',
                    'radio',
                    'button',
                    'submit',
                    'reset',
                    'file',
                    'image',
                    'range',
                    'color',
                    'date',
                    'datetime-local',
                    'time',
                    'month',
                    'week',
                    'number'
                ].includes(type)
            ) {
                return false;
            }
        }

        const placeholder = outpatientDiagnosisInputPlaceholder(input);

        /*
         * 门诊诊断行中，“国家医保码/编码”和“备注”等输入框与
         * 诊断名称输入框位于同一水平行。它们不能当作诊断检索框。
         *
         * 第二条“副诊断”名称输入框在空白状态下没有placeholder，
         * 因此不能再以placeholder作为必须条件，只把明确属于其他
         * 字段的输入框排除。
         */
        if (
            /国家医保|医保码|医保编码|诊断编码|疾病编码|备注|子位|部位/.test(
                placeholder
            )
        ) {
            return false;
        }

        return true;
    }

    function outpatientWesternDiagnosisBand(doc) {
        const labels = outpatientDiagnosisExactLabels(
            doc,
            '西医诊断'
        );

        if (!labels.length) {
            return null;
        }

        const label = labels[0];
        const labelRect = label.getBoundingClientRect();
        const tcmLabels = outpatientDiagnosisExactLabels(
            doc,
            '中医诊断'
        );
        const tcmRect = tcmLabels[0]
            ? tcmLabels[0].getBoundingClientRect()
            : null;

        return {
            label: label,
            labelRect: labelRect,
            top:
                labelRect.top - 48,
            bottom:
                tcmRect
                    ? tcmRect.top - 4
                    : labelRect.bottom + 180
        };
    }

    function outpatientWesternRoleMarkers(doc, band) {
        if (!doc || !band) {
            return [];
        }

        return Array.from(
            doc.querySelectorAll(
                'label,span,div,td,th,p,b,strong'
            )
        )
            .filter(isVisible)
            .filter(element => {
                const text = normalizedLabelText(element);

                if (text !== '主' && text !== '副') {
                    return false;
                }

                const rect = element.getBoundingClientRect();
                const centerY = (rect.top + rect.bottom) / 2;

                return (
                    centerY >= band.top &&
                    centerY < band.bottom &&
                    rect.left >= band.labelRect.right - 20 &&
                    rect.left <= band.labelRect.right + 170
                );
            })
            .filter((element, index, array) => {
                /*
                 * 同一个“主/副”文字可能被父、子元素同时命中，
                 * 仅保留面积最小的真实文字节点。
                 */
                return !array.some(other => {
                    if (other === element || !element.contains(other)) {
                        return false;
                    }

                    return (
                        normalizedLabelText(other) ===
                        normalizedLabelText(element)
                    );
                });
            })
            .sort((first, second) => {
                const firstRect = first.getBoundingClientRect();
                const secondRect = second.getBoundingClientRect();

                if (Math.abs(firstRect.top - secondRect.top) > 5) {
                    return firstRect.top - secondRect.top;
                }

                return firstRect.left - secondRect.left;
            });
    }

    function outpatientWesternInputNearRoleMarker(
        doc,
        marker,
        band,
        anchorInput
    ) {
        if (!doc || !marker || !band) {
            return null;
        }

        const markerRect = marker.getBoundingClientRect();
        const markerCenterY =
            (markerRect.top + markerRect.bottom) / 2;
        const anchorRect = anchorInput
            ? anchorInput.getBoundingClientRect()
            : null;

        const candidates = Array.from(
            doc.querySelectorAll(
                'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
            )
        )
            .filter(outpatientDiagnosisIsEditableTextControl)
            .map(input => {
                const rect = input.getBoundingClientRect();
                const centerY = (rect.top + rect.bottom) / 2;
                const centerX = (rect.left + rect.right) / 2;

                if (
                    centerY < band.top ||
                    centerY >= band.bottom ||
                    Math.abs(centerY - markerCenterY) > 26 ||
                    rect.left <= markerRect.right - 8 ||
                    rect.left > markerRect.right + 610
                ) {
                    return null;
                }

                const placeholder =
                    outpatientDiagnosisInputPlaceholder(input);

                let score =
                    Math.abs(centerY - markerCenterY) * 70 +
                    Math.max(0, rect.left - markerRect.right);

                /*
                 * 诊断名称输入框位于“主/副”和国家医保码输入框之间，
                 * 因而通常是该行最靠左的可编辑文本框。
                 */
                if (
                    /编码名称|拼音查询|诊断检索|诊断查询|输入诊断/.test(
                        placeholder
                    ) ||
                    /autocomplete|diagnos/i.test(
                        String(input.className || '') + ' ' +
                        String(
                            input.parentElement
                                ? input.parentElement.className || ''
                                : ''
                        )
                    )
                ) {
                    score -= 1800;
                }

                if (anchorRect) {
                    const anchorCenterX =
                        (anchorRect.left + anchorRect.right) / 2;

                    score +=
                        Math.abs(centerX - anchorCenterX) * 8 +
                        Math.abs(rect.width - anchorRect.width) * 3;
                }

                return {
                    input: input,
                    score: score
                };
            })
            .filter(Boolean)
            .sort((first, second) => first.score - second.score);

        return candidates[0]
            ? candidates[0].input
            : null;
    }

    function collectOutpatientWesternDiagnosisInputs() {
        const result = [];
        const seen = new Set();
        const tcmDisease = diagnosisSearchControl('中医病名');
        const tcmSyndrome = diagnosisSearchControl('中医证候');
        const excluded = new Set(
            [tcmDisease, tcmSyndrome].filter(Boolean)
        );
        const firstKnown = diagnosisSearchControl('西医诊断');

        function append(input) {
            if (
                !input ||
                excluded.has(input) ||
                seen.has(input) ||
                !outpatientDiagnosisIsEditableTextControl(input)
            ) {
                return;
            }

            seen.add(input);
            result.push(input);
        }

        allDocuments().forEach(doc => {
            const band = outpatientWesternDiagnosisBand(doc);

            if (!band) {
                return;
            }

            let anchor =
                firstKnown &&
                firstKnown.ownerDocument === doc
                    ? firstKnown
                    : null;

            if (anchor) {
                const rect = anchor.getBoundingClientRect();
                const centerY = (rect.top + rect.bottom) / 2;

                if (
                    centerY < band.top ||
                    centerY >= band.bottom
                ) {
                    anchor = null;
                }
            }

            if (!anchor) {
                anchor = Array.from(
                    doc.querySelectorAll(
                        'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                    )
                )
                    .filter(outpatientDiagnosisLooksLikeSearchInput)
                    .find(input => {
                        const rect = input.getBoundingClientRect();
                        const centerY = (rect.top + rect.bottom) / 2;

                        return (
                            centerY >= band.top &&
                            centerY < band.bottom &&
                            rect.right > band.labelRect.right - 8
                        );
                    }) || null;
            }

            /*
             * 第一优先级：按页面“主/副”行标记逐行寻找其右侧最近的
             * 文本输入框。这样即使副诊断为空且没有placeholder，也能
             * 被稳定识别。
             */
            const markers = outpatientWesternRoleMarkers(
                doc,
                band
            );

            markers.forEach(marker => {
                append(
                    outpatientWesternInputNearRoleMarker(
                        doc,
                        marker,
                        band,
                        anchor
                    )
                );
            });

            append(anchor);

            /*
             * 第二优先级：按第一行诊断输入框的横向位置补扫。
             * 用于页面未渲染“主/副”文字为独立节点的情况。
             */
            if (anchor) {
                const anchorRect = anchor.getBoundingClientRect();
                const anchorCenterX =
                    (anchorRect.left + anchorRect.right) / 2;
                const horizontalTolerance =
                    Math.max(85, anchorRect.width * 0.75);

                Array.from(
                    doc.querySelectorAll(
                        'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                    )
                )
                    .filter(outpatientDiagnosisIsEditableTextControl)
                    .forEach(input => {
                        if (excluded.has(input)) {
                            return;
                        }

                        const rect = input.getBoundingClientRect();
                        const centerY = (rect.top + rect.bottom) / 2;
                        const centerX = (rect.left + rect.right) / 2;

                        if (
                            centerY < band.top ||
                            centerY >= band.bottom ||
                            Math.abs(centerX - anchorCenterX) >
                                horizontalTolerance ||
                            rect.width < anchorRect.width * 0.42 ||
                            rect.width > anchorRect.width * 1.85
                        ) {
                            return;
                        }

                        append(input);
                    });
            }
        });

        append(firstKnown);

        result.sort((firstInput, secondInput) => {
            const firstRect = firstInput.getBoundingClientRect();
            const secondRect = secondInput.getBoundingClientRect();

            if (Math.abs(firstRect.top - secondRect.top) > 6) {
                return firstRect.top - secondRect.top;
            }

            return firstRect.left - secondRect.left;
        });

        return result;
    }

    function outpatientWesternVisibleRowCount(referenceInput) {
        const doc = referenceInput
            ? referenceInput.ownerDocument
            : null;
        const band = doc
            ? outpatientWesternDiagnosisBand(doc)
            : null;

        if (!doc || !band) {
            return 0;
        }

        return outpatientWesternRoleMarkers(
            doc,
            band
        ).length;
    }

    /*
     * v1.7.3.16：诊断工具栏增加/调整相邻图标后，泛匹配“添加”和
     * 按距离评分可能把“加入常用诊断”排在绿色加号前。现在优先采用
     * 明确的＋文字、plus图标或新增诊断语义；图标所属点击容器只能
     * 包含该图标，不能上溯到并排放置多个操作的整组容器。
     */
    function outpatientDiagnosisAddButtonCandidates(referenceInput) {
        if (!referenceInput) return [];

        const doc = referenceInput.ownerDocument;
        const band = outpatientWesternDiagnosisBand(doc);
        if (!band) return [];

        const westernInputs = collectOutpatientWesternDiagnosisInputs()
            .filter(input => input.ownerDocument === doc);
        const firstWesternInput = westernInputs[0] || referenceInput;
        const firstInputRect = firstWesternInput.getBoundingClientRect();
        const roleMarkers = outpatientWesternRoleMarkers(doc, band);
        const firstRoleRect = roleMarkers[0]
            ? roleMarkers[0].getBoundingClientRect()
            : null;
        const targetCenterY = firstRoleRect
            ? (firstRoleRect.top + firstRoleRect.bottom) / 2
            : (firstInputRect.top + firstInputRect.bottom) / 2;
        const candidates = [];
        const byElement = new Map();
        const byRect = new Map();

        function attributes(element, names) {
            return names.map(name => element.getAttribute(name) || '').join(' ');
        }

        function signature(element) {
            return attributes(element, [
                'class', 'id', 'title', 'aria-label', 'data-original-title',
                'data-title', 'data-tooltip', 'data-action', 'name', 'alt',
                'data-icon', 'href', 'xlink:href', 'src'
            ]) + ' ' + plain(element.textContent || '');
        }

        function isOtherAction(element) {
            return /常用|收藏|模板|导入|导出|复制|粘贴|编辑|删除|移除|减号|保存|提交|取消|关闭|favorite|favourite|collect|common|usual|template|import|export|copy|paste|edit|delete|remove|minus|save|submit|cancel|close/i.test(
                signature(element)
            );
        }

        function evidence(element) {
            const text = plain(element.textContent || '');
            let iconSignature = attributes(element, [
                'class', 'data-icon', 'href', 'xlink:href', 'src'
            ]);
            if (String(element.tagName || '').toLowerCase() === 'svg') {
                iconSignature += ' ' + Array.from(element.querySelectorAll('use'))
                    .map(icon => attributes(icon, ['href', 'xlink:href']))
                    .join(' ');
            }
            const labels = [
                'title', 'aria-label', 'data-original-title', 'data-title',
                'data-tooltip', 'alt', 'value'
            ].map(name => plain(element.getAttribute(name) || ''));

            if (/^[+＋﹢⊕✚➕]$/.test(text)) return 0;
            if (/(?:^|[\s_\-/#])plus(?:$|[\s_\-.#])/i.test(iconSignature)) {
                return 0;
            }

            /* Font Awesome等图标可能仅通过伪元素绘制加号。 */
            for (const pseudo of ['::before', '::after']) {
                try {
                    const content = String(
                        doc.defaultView.getComputedStyle(element, pseudo).content || ''
                    ).replace(/^["']|["']$/g, '').trim();
                    if (/^[+＋﹢⊕✚➕\uf055\uf067\uf0fe\uf196]$/.test(content)) {
                        return 0;
                    }
                } catch (error) {
                    // 不支持伪元素样式读取时继续检查明确标签和图标类。
                }
            }

            const addLabel = /^(?:新增|添加|增加)(?:一行|诊断行|西医诊断|诊断)?[：:]?$/;
            if (addLabel.test(text) || labels.some(label => addLabel.test(label))) return 1;
            if (/(?:^|[\s_\-/#])(?:add|addition|tianjia)(?:$|[\s_\-.#])/i.test(iconSignature)) {
                return 2;
            }
            return null;
        }

        function clickTarget(element) {
            const owner = element.closest('button,a,[role="button"],[onclick]');
            if (!owner || owner === element) return element;

            const iconRect = element.getBoundingClientRect();
            const ownerRect = owner.getBoundingClientRect();
            /*
             * 只提升到紧贴本图标的小按钮。较宽的父容器可能还包含
             * 常用、收藏等兄弟操作，此时在原图标上发送冒泡点击事件。
             */
            if (
                owner.contains(referenceInput) ||
                ownerRect.width > Math.max(44, iconRect.width + 20) ||
                ownerRect.height > Math.max(44, iconRect.height + 20) ||
                iconRect.left - ownerRect.left > 12 ||
                ownerRect.right - iconRect.right > 12 ||
                iconRect.top - ownerRect.top > 12 ||
                ownerRect.bottom - iconRect.bottom > 12
            ) {
                return element;
            }
            const hasOtherIcon = Array.from(owner.querySelectorAll(
                'button,a,[role="button"],[onclick],i,span,svg,img'
            )).some(other =>
                other !== element && !other.contains(element) &&
                !element.contains(other) && isVisible(other)
            );
            if (hasOtherIcon) return element;
            return owner;
        }

        Array.from(doc.querySelectorAll(
            'button,a,[role="button"],[onclick],i,span,div,svg,use,img,input[type="button"]'
        )).filter(isVisible).forEach(element => {
            if (
                isOwnAssistantUi(element) ||
                element.contains(referenceInput) ||
                element.closest('[disabled],[aria-disabled="true"],.disabled,.is-disabled')
            ) return;

            const rect = element.getBoundingClientRect();
            const centerY = (rect.top + rect.bottom) / 2;
            if (
                centerY < band.top - 6 || centerY >= band.bottom ||
                Math.abs(centerY - targetCenterY) > Math.max(26, firstInputRect.height + 8) ||
                rect.width < 6 || rect.height < 6 ||
                rect.width > 64 || rect.height > 64 ||
                rect.left < firstInputRect.right - 60 ||
                rect.left > firstInputRect.right + 700 ||
                isOtherAction(element)
            ) return;

            const priority = evidence(element);
            if (priority === null) return;

            const actionOwner = element.closest('button,a,[role="button"]');
            if (actionOwner && !actionOwner.contains(referenceInput) && isOtherAction(actionOwner)) return;

            const clickable = clickTarget(element);
            if (!isVisible(clickable) || isOtherAction(clickable)) return;

            /* 检查小型图标包装层，避免收藏按钮内部的＋被误当新增行。 */
            for (let parent = element.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
                const parentRect = parent.getBoundingClientRect();
                if (
                    parentRect.width > Math.max(44, rect.width + 20) ||
                    parentRect.height > Math.max(44, rect.height + 20) ||
                    rect.left - parentRect.left > 12 || parentRect.right - rect.right > 12 ||
                    parent.contains(referenceInput)
                ) break;
                if (isOtherAction(parent)) return;
                if (parent === clickable) break;
            }

            const clickRect = clickable.getBoundingClientRect();
            const rectKey = [
                Math.round(clickRect.left), Math.round(clickRect.top),
                Math.round(clickRect.width), Math.round(clickRect.height)
            ].join(':');
            const candidate = {
                element: clickable,
                priority: priority,
                score: Math.abs(centerY - targetCenterY) * 35 +
                    Math.abs(rect.left - firstInputRect.right)
            };
            const existing = byElement.get(clickable) || byRect.get(rectKey);
            if (existing) {
                if (priority < existing.priority || priority === existing.priority && candidate.score < existing.score) {
                    Object.assign(existing, candidate);
                }
                return;
            }
            byElement.set(clickable, candidate);
            byRect.set(rectKey, candidate);
            candidates.push(candidate);
        });

        candidates.sort((first, second) =>
            first.priority - second.priority || first.score - second.score
        );

        console.log('[门诊助手] 西医诊断新增按钮候选：', candidates.map(item => ({
            priority: item.priority,
            score: item.score,
            text: plain(item.element.textContent || item.element.getAttribute('title') || ''),
            rect: item.element.getBoundingClientRect(),
            element: item.element
        })));
        return candidates;
    }


    async function ensureOutpatientWesternDiagnosisInput(
        targetIndex,
        runSerial
    ) {
        let inputs = collectOutpatientWesternDiagnosisInputs();

        if (inputs[targetIndex]) {
            return inputs[targetIndex];
        }

        /*
         * 页面已有“副”诊断行时，禁止继续点击绿色“＋”。
         * v1.7.3.0因为副诊断空白框没有placeholder而漏识别，随后误点
         * “＋”，医院系统才会提示“添加失败或已重复”。
         */
        const initialReference = inputs[0] ||
            diagnosisSearchControl('西医诊断');
        const initialVisibleRows =
            outpatientWesternVisibleRowCount(initialReference);

        if (initialVisibleRows > targetIndex) {
            await outpatientDiagnosisWait(220, runSerial);
            inputs = collectOutpatientWesternDiagnosisInputs();

            if (inputs[targetIndex]) {
                return inputs[targetIndex];
            }

            throw new Error(
                '页面已经存在第' +
                (targetIndex + 1) +
                '行西医诊断，但未能定位该行的名称输入框。' +
                '为避免误点绿色“＋”，脚本已停止。'
            );
        }

        const maximumAttempts = Math.max(3, targetIndex + 2);

        for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
            await outpatientDiagnosisCheckpoint(runSerial);

            inputs = collectOutpatientWesternDiagnosisInputs();

            if (inputs[targetIndex]) {
                return inputs[targetIndex];
            }

            const referenceInput =
                inputs[inputs.length - 1] ||
                diagnosisSearchControl('西医诊断');
            const visibleRows =
                outpatientWesternVisibleRowCount(referenceInput);

            /*
             * 已经存在目标“主/副”行时，不再点击新增按钮。
             */
            if (visibleRows > targetIndex) {
                await outpatientDiagnosisWait(180, runSerial);
                inputs = collectOutpatientWesternDiagnosisInputs();

                if (inputs[targetIndex]) {
                    return inputs[targetIndex];
                }

                break;
            }

            const addCandidates =
                outpatientDiagnosisAddButtonCandidates(referenceInput);

            if (!addCandidates.length) {
                break;
            }

            let increased = false;
            let addPromptSeen = false;
            const candidate = addCandidates[0];
            const beforeInputs = inputs.length;
            const beforeRows = visibleRows;

            /*
             * 每轮只点击一次评分最高的“西医诊断”绿色＋。
             * 旧版会连续点击最多4个疑似按钮；页面重绘稍慢时，可能在
             * 新行尚未被识别前再次点击，或者误点相邻的中医绿色＋。
             */
            outpatientPathwayRealClick(candidate.element);

            const growthDeadline = Date.now() + 3600;

            while (Date.now() < growthDeadline) {
                await outpatientDiagnosisWait(120, runSerial);

                if (closeOutpatientDiagnosisAddPrompt()) {
                    addPromptSeen = true;
                    await outpatientDiagnosisWait(180, runSerial);
                }

                const afterInputs =
                    collectOutpatientWesternDiagnosisInputs();
                const afterRows =
                    outpatientWesternVisibleRowCount(
                        afterInputs[0] || referenceInput
                    );

                if (
                    afterInputs.length > beforeInputs ||
                    afterRows > beforeRows ||
                    afterInputs[targetIndex]
                ) {
                    inputs = afterInputs;
                    increased = true;
                    break;
                }
            }

            if (!increased) {
                console.warn(
                    '[门诊助手] 点击西医诊断绿色＋后未检测到新行：',
                    {
                        targetIndex: targetIndex,
                        beforeInputs: beforeInputs,
                        beforeRows: beforeRows,
                        addPromptSeen: addPromptSeen,
                        button: candidate.element
                    }
                );

                /*
                 * 医院已经返回“添加失败或已重复”时不再重复点击，避免
                 * 形成连续提示；若只是首次点击未命中，外层循环可重新
                 * 扫描一次按钮后再尝试。
                 */
                if (addPromptSeen) {
                    break;
                }
            }
        }

        inputs = collectOutpatientWesternDiagnosisInputs();

        if (inputs[targetIndex]) {
            return inputs[targetIndex];
        }

        const finalReference = inputs[0] ||
            diagnosisSearchControl('西医诊断');
        const finalRows =
            outpatientWesternVisibleRowCount(finalReference);

        throw new Error(
            '西医诊断需要第' +
            (targetIndex + 1) +
            '行；当前识别到' +
            inputs.length +
            '个诊断名称输入框、' +
            finalRows +
            '个“主/副”诊断行。' +
            (
                finalRows > targetIndex
                    ? '页面已有目标行，因此脚本未点击绿色“＋”。'
                    : '未能通过西医诊断区域的绿色“＋”创建新行。'
            )
        );
    }

    function outpatientDiagnosisFieldRoot(input) {
        if (!input) {
            return null;
        }

        return input.closest(
            'tr,.layui-form-item,.form-group,.form-row,.row,li,td'
        ) || input.parentElement;
    }

    function outpatientDiagnosisHiddenSnapshot(input) {
        const root = outpatientDiagnosisFieldRoot(input);

        if (!root || !root.querySelectorAll) {
            return '';
        }

        return Array.from(
            root.querySelectorAll(
                'input[type="hidden"],select,input:not([type])'
            )
        )
            .map(element => String(element.value || ''))
            .join('|');
    }

    function outpatientDiagnosisAutocompleteRoot(input) {
        if (!input) {
            return null;
        }

        const explicit = input.closest(
            '.el-autocomplete,.autocomplete,.layui-input-inline,' +
            '[class*="autocomplete"],[class*="auto-complete"],' +
            '[class*="diagnosis-name"],[class*="diagnos-name"]'
        );

        if (explicit) {
            const rect = explicit.getBoundingClientRect();
            const editableCount = explicit.querySelectorAll(
                'input:not([type="hidden"]),textarea,[contenteditable="true"]'
            ).length;

            if (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.width <= 520 &&
                rect.height <= 150 &&
                editableCount <= 3
            ) {
                return explicit;
            }
        }

        let current = input.parentElement;

        for (let level = 0; current && level < 4; level += 1) {
            const rect = current.getBoundingClientRect();
            const editableCount = current.querySelectorAll(
                'input:not([type="hidden"]),textarea,[contenteditable="true"]'
            ).length;
            const hiddenCount = current.querySelectorAll(
                'input[type="hidden"],[data-value],[data-id],[data-code]'
            ).length;

            if (
                hiddenCount > 0 &&
                editableCount <= 3 &&
                rect.width > 0 &&
                rect.width <= 520 &&
                rect.height > 0 &&
                rect.height <= 150
            ) {
                return current;
            }

            current = current.parentElement;
        }

        return input.parentElement;
    }

    function dispatchOutpatientDiagnosisDeleteSequence(input) {
        if (!input) {
            return;
        }

        const view = input.ownerDocument.defaultView || window;
        const KeyboardEventConstructor = view.KeyboardEvent || KeyboardEvent;
        const EventConstructor = view.Event || Event;
        const InputEventConstructor = view.InputEvent || null;

        try {
            input.focus();
        }
        catch (error) {
            // 忽略。
        }

        try {
            if (typeof input.setSelectionRange === 'function') {
                const length = String(input.value || '').length;
                input.setSelectionRange(0, length);
            }
        }
        catch (error) {
            // 非文本输入框时忽略。
        }

        try {
            input.dispatchEvent(
                new KeyboardEventConstructor('keydown', {
                    key: 'Backspace',
                    code: 'Backspace',
                    keyCode: 8,
                    which: 8,
                    bubbles: true,
                    cancelable: true
                })
            );
        }
        catch (error) {
            // 继续使用原生value setter。
        }

        nativeValueSetter(input, '');
        input.removeAttribute('value');

        if (InputEventConstructor) {
            try {
                input.dispatchEvent(
                    new InputEventConstructor('input', {
                        bubbles: true,
                        cancelable: false,
                        inputType: 'deleteContentBackward',
                        data: null
                    })
                );
            }
            catch (error) {
                input.dispatchEvent(
                    new EventConstructor('input', { bubbles: true })
                );
            }
        }
        else {
            input.dispatchEvent(
                new EventConstructor('input', { bubbles: true })
            );
        }

        input.dispatchEvent(
            new EventConstructor('change', { bubbles: true })
        );

        try {
            input.dispatchEvent(
                new KeyboardEventConstructor('keyup', {
                    key: 'Backspace',
                    code: 'Backspace',
                    keyCode: 8,
                    which: 8,
                    bubbles: true,
                    cancelable: true
                })
            );
        }
        catch (error) {
            // 忽略。
        }

        try {
            if (view.jQuery) {
                view.jQuery(input)
                    .val('')
                    .trigger('input')
                    .trigger('change')
                    .trigger('keyup');
            }
        }
        catch (error) {
            // jQuery不可用时忽略。
        }
    }

    function clearOutpatientDiagnosisStaleHiddenState(input) {
        const root = outpatientDiagnosisAutocompleteRoot(input);

        if (!root || !root.querySelectorAll) {
            return 0;
        }

        let cleared = 0;

        Array.from(
            root.querySelectorAll('input[type="hidden"]')
        ).forEach(hidden => {
            if (!plain(hidden.value)) {
                return;
            }

            const view = hidden.ownerDocument.defaultView || window;
            const EventConstructor = view.Event || Event;

            try {
                nativeValueSetter(hidden, '');
            }
            catch (error) {
                hidden.value = '';
            }

            hidden.removeAttribute('value');
            hidden.dispatchEvent(
                new EventConstructor('input', { bubbles: true })
            );
            hidden.dispatchEvent(
                new EventConstructor('change', { bubbles: true })
            );
            cleared += 1;
        });

        Array.from(
            root.querySelectorAll('[data-value],[data-id],[data-code]')
        ).forEach(element => {
            ['data-value', 'data-id', 'data-code'].forEach(attribute => {
                if (
                    element.hasAttribute(attribute) &&
                    plain(element.getAttribute(attribute))
                ) {
                    element.setAttribute(attribute, '');
                    cleared += 1;
                }
            });
        });

        return cleared;
    }

    async function resetOutpatientWesternDiagnosisInputState(
        input,
        runSerial
    ) {
        if (!input) {
            return;
        }

        await outpatientDiagnosisCheckpoint(runSerial);

        /*
         * 第二次录入失败通常不是诊断库问题，而是人工点击“×”删除后，
         * 自动完成组件仍保留上一条诊断ID、编码或候选弹层状态。
         * 这里模拟一次完整的“选中全部内容并退格删除”，再只清理该名称
         * 自动完成组件内部的隐藏值；不会触碰同一行的医保码、备注等字段。
         */
        try {
            input.focus();
            outpatientPathwayPressKey(input, 'Escape', 27);
        }
        catch (error) {
            // 忽略。
        }

        dispatchOutpatientDiagnosisDeleteSequence(input);
        const clearedHidden = clearOutpatientDiagnosisStaleHiddenState(input);

        await outpatientDiagnosisWait(180, runSerial);

        try {
            input.blur();
        }
        catch (error) {
            // 忽略。
        }

        await outpatientDiagnosisWait(120, runSerial);

        dispatchOutpatientDiagnosisDeleteSequence(input);

        console.log(
            '[门诊助手] 已重置西医诊断检索组件状态：',
            {
                input: input,
                clearedHidden: clearedHidden
            }
        );
    }

    function closeOutpatientDiagnosisAddPrompt() {
        const dialog = visibleOutpatientSystemDialog(
            /添加失败或已重复|已重复|重复添加|添加失败/
        );

        if (!dialog) {
            return false;
        }

        const controls = Array.from(
            dialog.querySelectorAll(
                'button,a,input[type="button"],input[type="submit"],' +
                '[role="button"],span'
            )
        ).filter(isVisible);

        const confirmButton = controls.find(element => {
            const value = element.tagName === 'INPUT'
                ? element.value
                : element.innerText || element.textContent;

            return /^(确认|确定|知道了|关闭|OK)$/i.test(
                plain(value)
            );
        });

        if (!confirmButton) {
            return false;
        }

        outpatientPathwayRealClick(
            confirmButton.closest(
                'button,a,[role="button"]'
            ) || confirmButton
        );

        return true;
    }

    function outpatientDiagnosisRowParts(row) {
        const cells = Array.from(
            row.querySelectorAll('td,[role="gridcell"]')
        ).filter(isVisible);
        const texts = cells.length
            ? cells.map(cell => plain(cell.innerText || cell.textContent))
            : [plain(row.innerText || row.textContent)];
        const fullText = texts.join(' ');
        const codeCandidates =
            fullText.toUpperCase().match(
                /\b[A-Z][A-Z0-9.×X+_-]{2,24}\b/g
            ) || [];

        return {
            cells: cells,
            texts: texts,
            fullText: fullText,
            normalizedText: outpatientDiagnosisNormalize(fullText),
            normalizedCodes: codeCandidates
                .filter(code => /\d/.test(code))
                .map(outpatientDiagnosisNormalizeCode)
        };
    }

    function outpatientDiagnosisPopupRows(input) {
        if (!input) {
            return [];
        }

        const inputDoc = input.ownerDocument;
        const inputRect = input.getBoundingClientRect();
        const selector = [
            'tbody tr',
            '.layui-table-body tr',
            '.datagrid-body .datagrid-row',
            '.datagrid-row',
            '[role="row"]',
            'li[role="option"]',
            '[role="option"]',
            '.autocomplete-suggestion',
            '.select2-results__option',
            '.dropdown-menu li',
            '.layui-form-select dl dd'
        ].join(',');
        const result = [];
        const seen = new Set();

        allDocuments().forEach(doc => {
            Array.from(doc.querySelectorAll(selector))
                .filter(isVisible)
                .forEach(row => {
                    if (
                        seen.has(row) ||
                        isOwnAssistantUi(row) ||
                        row.contains(input) ||
                        row.querySelector('th')
                    ) {
                        return;
                    }

                    seen.add(row);
                    const parts = outpatientDiagnosisRowParts(row);
                    const normalized = parts.normalizedText;

                    if (
                        !normalized ||
                        normalized.length > 360 ||
                        /名称拼音icd|诊断编码诊断名称|编码名称/.test(
                            normalized
                        ) ||
                        /暂无数据|无数据|没有数据/.test(normalized)
                    ) {
                        return;
                    }

                    const rect = row.getBoundingClientRect();
                    let distanceScore = 1800;

                    if (doc === inputDoc) {
                        const verticalDistance = Math.min(
                            Math.abs(rect.top - inputRect.bottom),
                            Math.abs(rect.bottom - inputRect.top)
                        );
                        const horizontalDistance = Math.abs(
                            rect.left - inputRect.left
                        );

                        if (
                            verticalDistance > 760 ||
                            horizontalDistance > 1250
                        ) {
                            return;
                        }

                        distanceScore =
                            verticalDistance +
                            horizontalDistance / 4;
                    }

                    result.push({
                        row: row,
                        parts: parts,
                        distanceScore: distanceScore
                    });
                });
        });

        return result.filter((entry, index, entries) => {
            return !entries.some(other =>
                other !== entry &&
                entry.row.contains(other.row) &&
                entry.parts.normalizedText ===
                    other.parts.normalizedText
            );
        });
    }

    function outpatientDiagnosisCandidateScore(entry, input, item) {
        const parts = entry.parts;
        const targetNames = [item.name]
            .filter(Boolean)
            .map(outpatientDiagnosisNormalize)
            .filter(Boolean);
        const targetCode = outpatientDiagnosisNormalizeCode(item.code);
        const firstText = outpatientDiagnosisNormalize(
            parts.texts[0] || ''
        );
        let score = entry.distanceScore;
        let matched = false;

        if (
            targetCode &&
            parts.normalizedCodes.includes(targetCode)
        ) {
            score -= 9000;
            matched = true;
        }
        else if (targetCode) {
            const similarCode = parts.normalizedCodes.some(code =>
                code.startsWith(targetCode) ||
                targetCode.startsWith(code)
            );

            if (similarCode) {
                score -= 2200;
                matched = true;
            }
        }

        targetNames.forEach(target => {
            if (!target) {
                return;
            }

            if (firstText === target) {
                score -= 8000;
                matched = true;
            }
            else if (parts.normalizedText === target) {
                score -= 7200;
                matched = true;
            }
            else if (
                firstText.includes(target) ||
                target.includes(firstText)
            ) {
                score -= 4300;
                matched = true;
            }
            else if (
                parts.normalizedText.includes(target) ||
                target.includes(parts.normalizedText)
            ) {
                score -= 2600;
                matched = true;
            }
        });

        return {
            score: score,
            matched: matched
        };
    }

    function rankOutpatientDiagnosisCandidates(input, item) {
        return outpatientDiagnosisPopupRows(input)
            .map(entry => {
                const ranked = outpatientDiagnosisCandidateScore(
                    entry,
                    input,
                    item
                );

                return {
                    row: entry.row,
                    parts: entry.parts,
                    score: ranked.score,
                    matched: ranked.matched
                };
            })
            .filter(entry => entry.matched)
            .sort((first, second) => first.score - second.score);
    }

    async function outpatientDiagnosisWriteSearch(
        input,
        value,
        runSerial
    ) {
        const nextValue = plain(value);

        if (!input || !nextValue) {
            return false;
        }

        await outpatientDiagnosisCheckpoint(runSerial);

        const view = input.ownerDocument.defaultView || window;
        const EventConstructor = view.Event || Event;
        const KeyboardEventConstructor =
            view.KeyboardEvent || KeyboardEvent;
        const InputEventConstructor = view.InputEvent || null;

        input.focus();
        nativeValueSetter(input, '');
        input.dispatchEvent(
            new EventConstructor('input', { bubbles: true })
        );

        if (InputEventConstructor) {
            try {
                input.dispatchEvent(
                    new InputEventConstructor('beforeinput', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'insertText',
                        data: nextValue
                    })
                );
            }
            catch (error) {
                // 旧版浏览器不支持完整InputEvent参数时忽略。
            }
        }

        nativeValueSetter(input, nextValue);

        ['input', 'change'].forEach(type => {
            input.dispatchEvent(
                new EventConstructor(type, { bubbles: true })
            );
        });

        ['keydown', 'keyup'].forEach(type => {
            try {
                input.dispatchEvent(
                    new KeyboardEventConstructor(type, {
                        key: 'Process',
                        code: '',
                        keyCode: 229,
                        which: 229,
                        bubbles: true
                    })
                );
            }
            catch (error) {
                input.dispatchEvent(
                    new EventConstructor(type, { bubbles: true })
                );
            }
        });

        await outpatientDiagnosisWait(460, runSerial);

        if (plain(input.value) !== nextValue) {
            nativeValueSetter(input, nextValue);
            input.dispatchEvent(
                new EventConstructor('input', { bubbles: true })
            );
            input.dispatchEvent(
                new EventConstructor('change', { bubbles: true })
            );
            await outpatientDiagnosisWait(220, runSerial);
        }

        input.focus();

        if (typeof input.setSelectionRange === 'function') {
            try {
                const length = String(input.value || '').length;
                input.setSelectionRange(length, length);
            }
            catch (error) {
                // 非文本输入框时忽略。
            }
        }

        return plain(input.value) === nextValue;
    }

    async function commitOutpatientDiagnosisCandidate(
        input,
        candidate,
        item,
        runSerial
    ) {
        const beforeHidden = outpatientDiagnosisHiddenSnapshot(input);
        const target = candidate.parts.cells.find(cell => {
            const text = outpatientDiagnosisNormalize(
                cell.innerText || cell.textContent
            );
            const desired = outpatientDiagnosisNormalize(item.name);
            return Boolean(
                desired &&
                (
                    text === desired ||
                    text.includes(desired) ||
                    desired.includes(text)
                )
            );
        }) || candidate.parts.cells[0] || candidate.row;

        outpatientPathwayRealClick(target);
        await outpatientDiagnosisWait(320, runSerial);

        let afterHidden = outpatientDiagnosisHiddenSnapshot(input);
        let stillOpen = rankOutpatientDiagnosisCandidates(
            input,
            item
        ).length > 0;

        if (stillOpen && beforeHidden === afterHidden) {
            outpatientPathwayRealClick(candidate.row);
            await outpatientDiagnosisWait(260, runSerial);
            afterHidden = outpatientDiagnosisHiddenSnapshot(input);
            stillOpen = rankOutpatientDiagnosisCandidates(
                input,
                item
            ).length > 0;
        }

        if (stillOpen && beforeHidden === afterHidden) {
            outpatientPathwayRealDoubleClick(target);
            await outpatientDiagnosisWait(280, runSerial);
            afterHidden = outpatientDiagnosisHiddenSnapshot(input);
            stillOpen = rankOutpatientDiagnosisCandidates(
                input,
                item
            ).length > 0;
        }

        if (stillOpen && beforeHidden === afterHidden) {
            input.focus();
            outpatientPathwayPressKey(input, 'Enter', 13);
            await outpatientDiagnosisWait(260, runSerial);
            afterHidden = outpatientDiagnosisHiddenSnapshot(input);
        }

        const selectedValue = plain(input.value);
        const candidateClosedBeforeBlur = Boolean(
            !candidate.row.isConnected ||
            !isVisible(candidate.row)
        );

        try {
            input.blur();
        }
        catch (error) {
            // 无法失焦时忽略。
        }

        await outpatientDiagnosisWait(140, runSerial);

        const valueAfterBlur = plain(input.value);
        const hiddenChanged = beforeHidden !== afterHidden;
        const popupRemainingAfterBlur =
            rankOutpatientDiagnosisCandidates(
                input,
                item
            ).length;
        const candidateClosedAfterBlur = Boolean(
            !candidate.row.isConnected ||
            !isVisible(candidate.row)
        );

        if (
            hiddenChanged ||
            candidateClosedBeforeBlur ||
            candidateClosedAfterBlur ||
            (
                popupRemainingAfterBlur === 0 &&
                valueAfterBlur
            )
        ) {
            return {
                name:
                    candidate.parts.texts[0] ||
                    valueAfterBlur ||
                    selectedValue ||
                    item.name,
                code:
                    candidate.parts.normalizedCodes[0] ||
                    item.code ||
                    ''
            };
        }

        throw new Error(
            '已点击候选项，但页面未确认选择：' + item.name
        );
    }

    async function selectOutpatientDiagnosisFromSystem(
        input,
        item,
        runSerial
    ) {
        const terms = [];

        [item.name, item.code].forEach(value => {
            const term = plain(value);

            if (
                term &&
                !terms.some(existing =>
                    outpatientDiagnosisNormalize(existing) ===
                    outpatientDiagnosisNormalize(term)
                )
            ) {
                terms.push(term);
            }
        });

        if (!terms.length) {
            throw new Error('诊断名称为空');
        }

        if (item.kind === 'western') {
            await resetOutpatientWesternDiagnosisInputState(
                input,
                runSerial
            );
        }

        for (const term of terms) {
            await outpatientDiagnosisCheckpoint(runSerial);

            const rowsVisibleBeforeSearch = new Set(
                outpatientDiagnosisPopupRows(input)
                    .map(entry => entry.row)
            );

            try {
                input.scrollIntoView({
                    block: 'center',
                    behavior: 'auto'
                });
            }
            catch (error) {
                // 页面不支持scrollIntoView参数时忽略。
            }

            await outpatientDiagnosisWriteSearch(
                input,
                term,
                runSerial
            );

            let allCandidates = rankOutpatientDiagnosisCandidates(
                input,
                item
            );
            let candidates = allCandidates.filter(
                candidate => !rowsVisibleBeforeSearch.has(candidate.row)
            );

            if (!candidates.length) {
                candidates = allCandidates;
            }

            if (!candidates.length) {
                await outpatientDiagnosisWait(520, runSerial);
                allCandidates = rankOutpatientDiagnosisCandidates(
                    input,
                    item
                );
                candidates = allCandidates.filter(
                    candidate => !rowsVisibleBeforeSearch.has(candidate.row)
                );

                if (!candidates.length) {
                    candidates = allCandidates;
                }
            }

            if (!candidates.length) {
                continue;
            }

            console.log(
                '[门诊助手] 门诊诊断候选：',
                outpatientDiagnosisDisplayName(item),
                candidates.slice(0, 5).map(candidate => ({
                    texts: candidate.parts.texts,
                    score: candidate.score
                }))
            );

            return commitOutpatientDiagnosisCandidate(
                input,
                candidates[0],
                item,
                runSerial
            );
        }

        throw new Error(
            '医院诊断库中未找到匹配项：' +
            outpatientDiagnosisDisplayName(item)
        );
    }

    async function activateOutpatientTcmDiseaseInput(runSerial) {
        /*
         * 极端兜底：部分组件未激活时，病名编辑input会被隐藏或缩成
         * 透明层，单纯扫描DOM无法识别。此时根据稳定的证型检索框
         * 和“证候”文字推算病名框区域，点击一次后再读取活动input。
         */
        for (const doc of allDocuments()) {
            await outpatientDiagnosisCheckpoint(runSerial);

            const syndromeInput = tcmDiagnosisSearchControl('syndrome');

            if (
                !syndromeInput ||
                syndromeInput.ownerDocument !== doc
            ) {
                continue;
            }

            const syndromeRect = syndromeInput.getBoundingClientRect();
            const syndromeCenterY =
                (syndromeRect.top + syndromeRect.bottom) / 2;
            const markers = Array.from(
                doc.querySelectorAll(
                    'label,span,div,td,th,p,b,strong,em,i'
                )
            )
                .filter(element => {
                    if (!element || !element.isConnected) {
                        return false;
                    }

                    const rect = element.getBoundingClientRect();
                    const style = doc.defaultView.getComputedStyle(element);

                    return (
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        rect.width > 0 &&
                        rect.height > 0 &&
                        normalizedLabelText(element) === '证候' &&
                        Math.abs(
                            (rect.top + rect.bottom) / 2 -
                            syndromeCenterY
                        ) <= 50 &&
                        rect.right <= syndromeRect.left + 30
                    );
                })
                .sort((first, second) => {
                    const firstRect = first.getBoundingClientRect();
                    const secondRect = second.getBoundingClientRect();

                    return (
                        Math.abs(firstRect.right - syndromeRect.left) -
                        Math.abs(secondRect.right - syndromeRect.left)
                    );
                });

            if (!markers.length) {
                continue;
            }

            const markerRect = markers[0].getBoundingClientRect();
            const clickX = Math.round(
                markerRect.left - Math.max(
                    22,
                    Math.min(58, markerRect.width + 28)
                )
            );
            const clickY = Math.round(syndromeCenterY);
            let target = null;

            try {
                target = doc.elementFromPoint(clickX, clickY);
            }
            catch (error) {
                target = null;
            }

            if (target) {
                realClick(
                    target.closest(
                        'input,textarea,[contenteditable="true"],[role="combobox"],.el-autocomplete,.autocomplete,.textbox,.combo,[class*="diagnos"]'
                    ) || target
                );

                await outpatientDiagnosisWait(180, runSerial);
            }

            const active = doc.activeElement;

            if (
                active &&
                active !== doc.body &&
                active !== doc.documentElement &&
                active.matches &&
                active.matches(
                    'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                )
            ) {
                const rect = active.getBoundingClientRect();
                const centerY = (rect.top + rect.bottom) / 2;

                if (
                    Math.abs(centerY - syndromeCenterY) <= 42 &&
                    rect.right <= markerRect.left + 24 &&
                    rect.left >= syndromeRect.left - 660
                ) {
                    return active;
                }
            }

            const retried = tcmDiagnosisSearchControl('disease');

            if (retried) {
                return retried;
            }

            /*
             * 点击后仍未获得activeElement时，检查点击目标附近的组件
             * 内部input。这里允许透明input，但仍要求与证候同一行。
             */
            let scope = target;

            for (let level = 0; scope && level < 5; level += 1) {
                const nearby = Array.from(
                    scope.querySelectorAll
                        ? scope.querySelectorAll(
                            'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
                        )
                        : []
                )
                    .filter(element => {
                        const rect = element.getBoundingClientRect();
                        const style = doc.defaultView.getComputedStyle(element);
                        const centerY = (rect.top + rect.bottom) / 2;

                        return (
                            style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            rect.width > 0 &&
                            rect.height > 0 &&
                            Math.abs(centerY - syndromeCenterY) <= 42 &&
                            rect.right <= markerRect.left + 24
                        );
                    });

                if (nearby[0]) {
                    return nearby[0];
                }

                scope = scope.parentElement;
            }
        }

        return null;
    }

    function outpatientDiagnosisLooseName(value, kind) {
        let normalized = outpatientDiagnosisNormalize(value)
            .replace(/^(?:中医)?(?:病名|疾病名称|证候|证型|辨证)/, '');

        if (kind === 'tcmSyndrome') {
            normalized = normalized.replace(/(?:证候|证型|证)$/, '');
        }

        return normalized;
    }

    function outpatientDiagnosisValueMatchesItem(value, item) {
        const current = outpatientDiagnosisLooseName(
            value,
            item && item.kind
        );
        const target = outpatientDiagnosisLooseName(
            item && item.name,
            item && item.kind
        );

        if (!current || !target) {
            return false;
        }

        if (current === target) {
            return true;
        }

        /*
         * 页面显示名称有时会比生成结果多/少“病、症、证”等尾缀，
         * 只在较长名称之间允许包含匹配，避免“中风”误命中无关短词。
         */
        return (
            Math.min(current.length, target.length) >= 3 &&
            (
                current.includes(target) ||
                target.includes(current)
            )
        );
    }

    function outpatientDiagnosisLowestCommonAncestor(first, second) {
        if (!first || !second) {
            return null;
        }

        const ancestors = new Set();
        let current = first;

        for (let level = 0; current && level < 14; level += 1) {
            ancestors.add(current);
            current = current.parentElement;
        }

        current = second;

        for (let level = 0; current && level < 14; level += 1) {
            if (ancestors.has(current)) {
                return current;
            }

            current = current.parentElement;
        }

        return null;
    }

    function outpatientTcmDiagnosisRowSnapshots() {
        const snapshots = [];
        const seenRoots = new Set();

        allDocuments().forEach(doc => {
            const labels = outpatientDiagnosisExactLabels(
                doc,
                '中医诊断'
            );
            const markers = outpatientDiagnosisExactLabels(
                doc,
                '证候'
            );

            labels.forEach(label => {
                const labelRect = label.getBoundingClientRect();
                const labelCenterY =
                    (labelRect.top + labelRect.bottom) / 2;

                markers
                    .map(marker => {
                        const rect = marker.getBoundingClientRect();
                        const centerY = (rect.top + rect.bottom) / 2;

                        return {
                            marker: marker,
                            rect: rect,
                            score:
                                Math.abs(centerY - labelCenterY) * 100 +
                                Math.max(0, rect.left - labelRect.right)
                        };
                    })
                    .filter(entry =>
                        entry.rect.left > labelRect.right - 10 &&
                        Math.abs(
                            (entry.rect.top + entry.rect.bottom) / 2 -
                            labelCenterY
                        ) <= 70
                    )
                    .sort((first, second) => first.score - second.score)
                    .slice(0, 1)
                    .forEach(entry => {
                        const root = outpatientDiagnosisLowestCommonAncestor(
                            label,
                            entry.marker
                        );

                        if (!root || seenRoots.has(root)) {
                            return;
                        }

                        seenRoots.add(root);

                        const values = [];

                        function addValue(value) {
                            const cleaned = plain(value);

                            if (
                                cleaned &&
                                !values.some(existing =>
                                    outpatientDiagnosisNormalize(existing) ===
                                    outpatientDiagnosisNormalize(cleaned)
                                )
                            ) {
                                values.push(cleaned);
                            }
                        }

                        addValue(root.innerText || root.textContent || '');

                        Array.from(
                            root.querySelectorAll(
                                'input,textarea,select,[contenteditable="true"],[data-value],[title],[aria-label]'
                            )
                        ).forEach(element => {
                            addValue(element.value);
                            addValue(element.textContent);
                            addValue(element.getAttribute('data-value'));
                            addValue(element.getAttribute('title'));
                            addValue(element.getAttribute('aria-label'));
                        });

                        snapshots.push({
                            doc: doc,
                            root: root,
                            label: label,
                            marker: entry.marker,
                            values: values
                        });
                    });
            });
        });

        return snapshots;
    }

    function outpatientDiagnosisCurrentSelection(item) {
        if (!item) {
            return null;
        }

        if (item.kind === 'western') {
            const inputs = collectOutpatientWesternDiagnosisInputs();
            const input = inputs[item.westernIndex] || null;

            if (!input) {
                return null;
            }

            const candidates = [
                input.value,
                input.getAttribute('value'),
                input.getAttribute('title'),
                input.getAttribute('aria-label')
            ];
            const row = input.closest(
                'tr,li,.form-row,.layui-form-item,.row,[class*="diagnos"]'
            ) || input.parentElement;

            if (row) {
                candidates.push(row.innerText || row.textContent || '');

                Array.from(row.querySelectorAll('input,select'))
                    .forEach(control => {
                        candidates.push(control.value);
                    });
            }

            const matched = candidates.find(value =>
                outpatientDiagnosisValueMatchesItem(value, item) ||
                (
                    item.code &&
                    outpatientDiagnosisNormalizeCode(value).includes(
                        outpatientDiagnosisNormalizeCode(item.code)
                    )
                )
            );

            return matched
                ? {
                    matched: true,
                    value: plain(input.value) || plain(matched),
                    source: 'western-input'
                }
                : null;
        }

        const directInput = diagnosisSearchControl(
            item.kind === 'tcmDisease'
                ? '中医病名'
                : '中医证候'
        );

        if (
            directInput &&
            outpatientDiagnosisValueMatchesItem(
                directInput.value || directInput.textContent,
                item
            )
        ) {
            return {
                matched: true,
                value:
                    plain(directInput.value || directInput.textContent) ||
                    item.name,
                source: 'tcm-input'
            };
        }

        const snapshots = outpatientTcmDiagnosisRowSnapshots();

        for (const snapshot of snapshots) {
            const matchedValue = snapshot.values.find(value =>
                outpatientDiagnosisValueMatchesItem(value, item)
            );

            if (matchedValue) {
                return {
                    matched: true,
                    value: item.name,
                    source: 'tcm-row-text',
                    root: snapshot.root
                };
            }
        }

        return null;
    }

    async function outpatientDiagnosisInputForItem(item, runSerial) {
        if (item.kind === 'western') {
            return ensureOutpatientWesternDiagnosisInput(
                item.westernIndex,
                runSerial
            );
        }

        let input = diagnosisSearchControl(
            item.kind === 'tcmDisease'
                ? '中医病名'
                : '中医证候'
        );

        if (!input && item.kind === 'tcmDisease') {
            input = await activateOutpatientTcmDiseaseInput(
                runSerial
            );
        }

        if (!input) {
            console.warn(
                '[门诊助手] 中医诊断输入框定位失败：',
                {
                    kind: item.kind,
                    tcmLabels: allDocuments().map(doc => ({
                        document: doc,
                        diseaseLabelCount: exactTextElements(
                            doc,
                            '中医诊断'
                        ).length,
                        syndromeMarkerCount: exactTextElements(
                            doc,
                            '证候'
                        ).length,
                        activeElement:
                            doc.activeElement || null
                    }))
                }
            );

            throw new Error(
                item.kind === 'tcmDisease'
                    ? '未识别到门诊页面的中医病名输入框'
                    : '未识别到门诊页面的中医证型（证候）输入框'
            );
        }

        return input;
    }

    function outpatientDiagnosisExistingValues() {
        const values = [];

        collectOutpatientWesternDiagnosisInputs()
            .forEach(input => {
                if (plain(input.value)) {
                    values.push('西医诊断：' + plain(input.value));
                }
            });

        const disease = diagnosisSearchControl('中医病名');
        const syndrome = diagnosisSearchControl('中医证候');

        if (disease && plain(disease.value)) {
            values.push('中医病名：' + plain(disease.value));
        }

        if (syndrome && plain(syndrome.value)) {
            values.push('中医证型：' + plain(syndrome.value));
        }

        return values;
    }

    function releaseOutpatientDiagnosisState(modal, runSerial) {
        if (
            runSerial != null &&
            state.diagnosisActiveSerial &&
            runSerial !== state.diagnosisActiveSerial
        ) {
            return;
        }

        state.diagnosisBusy = false;
        state.diagnosisPaused = false;
        state.diagnosisStopRequested = false;
        state.diagnosisCurrentIndex = -1;
        state.diagnosisTotal = 0;
        state.diagnosisActiveSerial = 0;
        updateOutpatientDiagnosisControls(modal);
        syncOutpatientOrderModalControls(modal);
    }

    async function executeOutpatientDiagnoses() {
        const modal = modalElement();

        if (!modal) {
            return;
        }

        if (state.diagnosisBusy) {
            showMessage(
                '已有门诊诊断录入任务正在执行，可先暂停或中止。',
                'warning'
            );
            return;
        }

        if (state.busy || state.orderBusy || state.orderAiBusy) {
            showMessage(
                '当前已有AI或门诊医嘱任务正在执行，请等待完成或先中止后再录入诊断。',
                'warning'
            );
            return;
        }

        const items = buildOutpatientDiagnosisItems(modal);

        if (!items.length) {
            showMessage(
                '病历生成结果中没有可录入的西医诊断。',
                'warning'
            );
            return;
        }

        const diagnosisLines = items
            .map((item, index) =>
                (index + 1) + '. ' +
                outpatientDiagnosisDisplayName(item)
            )
            .join('\n');

        const confirmed = window.confirm(
            '即将按顺序从医院诊断库检索并选择以下西医诊断：\n\n' +
            diagnosisLines +
            '\n\n录入过程不会点击“就诊保存”“结束就诊”或其他整页保存按钮。' +
            '\n请确认当前患者无误，是否继续？'
        );

        if (!confirmed) {
            return;
        }

        const existingValues = outpatientDiagnosisExistingValues();

        if (
            existingValues.length &&
            !window.confirm(
                '检测到门诊页面已有诊断输入内容：\n\n' +
                existingValues.slice(0, 8).join('\n') +
                (existingValues.length > 8 ? '\n……' : '') +
                '\n\n继续后，与目标一致的诊断会直接跳过；仅对空白或不一致项目重新检索。是否继续？'
            )
        ) {
            return;
        }

        const restore = assistantTemporaryHide(modal);
        state.diagnosisRunSerial += 1;
        const runSerial = state.diagnosisRunSerial;
        state.diagnosisActiveSerial = runSerial;
        state.diagnosisBusy = true;
        state.diagnosisPaused = false;
        state.diagnosisStopRequested = false;
        state.diagnosisCurrentIndex = -1;
        state.diagnosisTotal = items.length;
        updateOutpatientDiagnosisControls(modal);
        syncOutpatientOrderModalControls(modal);

        const success = [];

        try {
            /*
             * 关闭上一次操作残留的候选菜单或“添加失败或已重复”提示，
             * 给医院页面的删除动画和表单重绘留出时间。
             */
            allDocuments().forEach(doc => {
                const active = doc.activeElement;

                if (active && active !== doc.body) {
                    try {
                        outpatientPathwayPressKey(active, 'Escape', 27);
                    }
                    catch (error) {
                        // 忽略。
                    }
                }
            });

            if (closeOutpatientDiagnosisAddPrompt()) {
                await outpatientDiagnosisWait(220, runSerial);
            }

            await outpatientDiagnosisWait(360, runSerial);

            for (let index = 0; index < items.length; index += 1) {
                state.diagnosisCurrentIndex = index;
                updateOutpatientDiagnosisControls(modal);
                await outpatientDiagnosisCheckpoint(runSerial);

                const item = items[index];

                showOutpatientDiagnosisProgress(
                    '第' +
                    (index + 1) + '/' +
                    items.length +
                    '项：' +
                    outpatientDiagnosisDisplayName(item) +
                    '\n正在定位输入框并检索医院诊断库……',
                    'normal'
                );

                const existingSelection =
                    outpatientDiagnosisCurrentSelection(item);

                if (existingSelection && existingSelection.matched) {
                    const selected = {
                        name: existingSelection.value || item.name,
                        code: item.code || '',
                        alreadyExisted: true
                    };

                    success.push({
                        item: item,
                        selected: selected,
                        alreadyExisted: true
                    });

                    showOutpatientDiagnosisProgress(
                        '已完成' +
                        (index + 1) + '/' +
                        items.length +
                        '项：' +
                        outpatientDiagnosisDisplayName(item) +
                        '\n页面已存在相同诊断，已跳过重复检索。',
                        'success'
                    );

                    await outpatientDiagnosisWait(120, runSerial);
                    continue;
                }

                const input = await outpatientDiagnosisInputForItem(
                    item,
                    runSerial
                );
                const selected = await selectOutpatientDiagnosisFromSystem(
                    input,
                    item,
                    runSerial
                );

                success.push({
                    item: item,
                    selected: selected
                });

                showOutpatientDiagnosisProgress(
                    '已完成' +
                    (index + 1) + '/' +
                    items.length +
                    '项：' +
                    outpatientDiagnosisDisplayName(item) +
                    '\n已选择：' +
                    (selected.name || item.name),
                    'success'
                );

                await outpatientDiagnosisWait(180, runSerial);
            }

            showOutpatientDiagnosisProgress(
                '门诊西医诊断录入完成：共成功选择' +
                success.length +
                '项。\n请返回页面逐项核对诊断名称及主副顺序，随后手动保存门诊病历。',
                'success'
            );

            showMessage(
                '门诊诊断录入完成：成功' +
                success.length +
                '项。\n脚本未点击就诊保存或结束就诊，请人工核对后手动保存。',
                'success'
            );
        }
        catch (error) {
            if (isOutpatientDiagnosisStoppedError(error)) {
                showOutpatientDiagnosisProgress(
                    '门诊诊断录入已由用户中止。\n已完成' +
                    success.length +
                    '/' +
                    items.length +
                    '项；已经选中的诊断会保留，未执行整页保存。',
                    'warning'
                );

                showMessage(
                    '门诊诊断录入已中止。已完成' +
                    success.length +
                    '/' +
                    items.length +
                    '项；已经选中的诊断会保留。',
                    'warning'
                );
            }
            else {
                showOutpatientDiagnosisProgress(
                    '门诊诊断录入停止：' +
                    error.message +
                    '\n已完成' +
                    success.length +
                    '/' +
                    items.length +
                    '项；页面现场已保留供人工检查。',
                    'error'
                );

                showMessage(
                    '门诊诊断录入停止：' +
                    error.message +
                    '\n已完成' +
                    success.length +
                    '/' +
                    items.length +
                    '项。',
                    'error'
                );
            }
        }
        finally {
            restore();
            releaseOutpatientDiagnosisState(modal, runSerial);
        }
    }

    function extractJson(content) {
        const text =
            String(content || '')
                .trim()
                .replace(
                    /^```(?:json)?\s*/i,
                    ''
                )
                .replace(
                    /\s*```$/i,
                    ''
                )
                .trim();

        try {
            return JSON.parse(text);
        }
        catch (firstError) {
            const start =
                text.indexOf('{');
            const end =
                text.lastIndexOf('}');

            if (
                start >= 0 &&
                end > start
            ) {
                return JSON.parse(
                    text.slice(
                        start,
                        end + 1
                    )
                );
            }

            throw firstError;
        }
    }

    function aiRequest(
        apiKey,
        model,
        systemPrompt,
        userPayload,
        maxTokens
    ) {
        return new Promise(
            (resolve, reject) => {
                const request =
                    suiteGlobalAiXmlhttpRequest({
                        method: 'POST',
                        url: DEEPSEEK_ENDPOINT,
                        headers: {
                            'Content-Type':
                                'application/json',
                            Authorization:
                                'Bearer ' +
                                apiKey
                        },
                        data: JSON.stringify({
                            model:
                                model ||
                                DEFAULT_MODEL,
                            messages: [
                                {
                                    role: 'system',
                                    content:
                                        systemPrompt
                                },
                                {
                                    role: 'user',
                                    content:
                                        JSON.stringify(
                                            userPayload
                                        )
                                }
                            ],
                            response_format: {
                                type: 'json_object'
                            },
                            temperature: 0.1,
                            max_tokens:
                                maxTokens ||
                                6500,
                            stream: false
                        }),
                        timeout: 150000,
                        onload: response => {
                            state.request =
                                null;

                            if (
                                response.status < 200 ||
                                response.status >= 300
                            ) {
                                reject(
                                    new Error(
                                        'DeepSeek接口返回HTTP ' +
                                        response.status +
                                        '：' +
                                        String(
                                            response.responseText ||
                                            ''
                                        ).slice(
                                            0,
                                            800
                                        )
                                    )
                                );
                                return;
                            }

                            try {
                                const outer =
                                    JSON.parse(
                                        response.responseText
                                    );

                                const content =
                                    outer &&
                                    outer.choices &&
                                    outer.choices[0] &&
                                    outer.choices[0].message
                                        ? outer
                                            .choices[0]
                                            .message
                                            .content
                                        : '';

                                if (!content) {
                                    throw new Error(
                                        '接口没有返回有效内容'
                                    );
                                }

                                resolve(
                                    extractJson(
                                        content
                                    )
                                );
                            }
                            catch (error) {
                                reject(
                                    new Error(
                                        'DeepSeek结果解析失败：' +
                                        error.message
                                    )
                                );
                            }
                        },
                        onerror: () => {
                            state.request =
                                null;
                            reject(
                                new Error(
                                    'DeepSeek网络请求失败'
                                )
                            );
                        },
                        ontimeout: () => {
                            state.request =
                                null;
                            reject(
                                new Error(
                                    'DeepSeek请求超时'
                                )
                            );
                        },
                        onabort: () => {
                            state.request =
                                null;
                            reject(
                                new Error(
                                    '已停止当前AI任务'
                                )
                            );
                        }
                    });

                state.request =
                    request;
            }
        );
    }


    function chatRequest(
        apiKey,
        model,
        messages,
        maxTokens,
        onDelta
    ) {
        return new Promise(
            (resolve, reject) => {
                let processedLength = 0;
                let pendingLine = '';
                let assembledText = '';
                let settled = false;

                function responseTextOf(
                    response
                ) {
                    if (!response) {
                        return '';
                    }

                    if (
                        typeof response.responseText ===
                        'string'
                    ) {
                        return response.responseText;
                    }

                    if (
                        typeof response.response ===
                        'string'
                    ) {
                        return response.response;
                    }

                    return '';
                }

                function emitDelta(
                    value
                ) {
                    const delta =
                        String(
                            value == null
                                ? ''
                                : value
                        );

                    if (!delta) {
                        return;
                    }

                    assembledText +=
                        delta;

                    if (
                        typeof onDelta ===
                        'function'
                    ) {
                        onDelta(
                            delta,
                            assembledText
                        );
                    }
                }

                function parseSseLine(
                    line
                ) {
                    const trimmed =
                        String(
                            line || ''
                        ).trim();

                    if (
                        !trimmed ||
                        trimmed.startsWith(':')
                    ) {
                        return;
                    }

                    if (
                        !trimmed.startsWith(
                            'data:'
                        )
                    ) {
                        return;
                    }

                    const payload =
                        trimmed
                            .slice(5)
                            .trim();

                    if (
                        !payload ||
                        payload === '[DONE]'
                    ) {
                        return;
                    }

                    try {
                        const packet =
                            JSON.parse(
                                payload
                            );

                        const choice =
                            packet &&
                            packet.choices &&
                            packet.choices[0]
                                ? packet.choices[0]
                                : null;

                        const delta =
                            choice &&
                            choice.delta &&
                            typeof choice.delta.content ===
                                'string'
                                ? choice.delta.content
                                : (
                                    choice &&
                                    choice.message &&
                                    typeof choice.message.content ===
                                        'string'
                                        ? choice.message.content
                                        : ''
                                );

                        emitDelta(
                            delta
                        );
                    }
                    catch (error) {
                        /*
                         * SSE数据有可能在网络分片处被截断。
                         * 当前行留待下一次进度事件继续拼接。
                         */
                        pendingLine =
                            line +
                            '\n' +
                            pendingLine;
                    }
                }

                function consumeText(
                    chunk,
                    finalPass
                ) {
                    if (!chunk) {
                        return;
                    }

                    pendingLine +=
                        chunk;

                    const lines =
                        pendingLine.split(
                            /\r?\n/
                        );

                    pendingLine =
                        lines.pop() ||
                        '';

                    lines.forEach(
                        parseSseLine
                    );

                    if (
                        finalPass &&
                        pendingLine.trim()
                    ) {
                        const finalLine =
                            pendingLine;

                        pendingLine =
                            '';

                        parseSseLine(
                            finalLine
                        );
                    }
                }

                function consumeResponse(
                    response,
                    finalPass
                ) {
                    const fullText =
                        responseTextOf(
                            response
                        );

                    if (
                        fullText.length <
                        processedLength
                    ) {
                        processedLength =
                            0;
                        pendingLine =
                            '';
                    }

                    if (
                        fullText.length >
                        processedLength
                    ) {
                        const added =
                            fullText.slice(
                                processedLength
                            );

                        processedLength =
                            fullText.length;

                        consumeText(
                            added,
                            Boolean(
                                finalPass
                            )
                        );
                    }
                    else if (
                        finalPass &&
                        pendingLine.trim()
                    ) {
                        consumeText(
                            '',
                            true
                        );
                    }
                }

                function finishReject(
                    error
                ) {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    state.chatRequest =
                        null;

                    reject(
                        error
                    );
                }

                function finishResolve(
                    response
                ) {
                    if (settled) {
                        return;
                    }

                    consumeResponse(
                        response,
                        true
                    );

                    /*
                     * 兼容极少数不触发SSE进度、却返回普通JSON的环境。
                     */
                    if (!assembledText) {
                        const body =
                            responseTextOf(
                                response
                            ).trim();

                        if (
                            body &&
                            !body.startsWith(
                                'data:'
                            )
                        ) {
                            try {
                                const outer =
                                    JSON.parse(
                                        body
                                    );

                                const fallbackContent =
                                    outer &&
                                    outer.choices &&
                                    outer.choices[0] &&
                                    outer.choices[0].message
                                        ? String(
                                            outer
                                                .choices[0]
                                                .message
                                                .content ||
                                            ''
                                        )
                                        : '';

                                if (fallbackContent) {
                                    emitDelta(
                                        fallbackContent
                                    );
                                }
                            }
                            catch (error) {
                                // 继续由下方统一判断空结果。
                            }
                        }
                    }

                    const answer =
                        String(
                            assembledText ||
                            ''
                        ).trim();

                    if (!answer) {
                        finishReject(
                            new Error(
                                '接口没有返回有效内容'
                            )
                        );
                        return;
                    }

                    settled =
                        true;

                    state.chatRequest =
                        null;

                    resolve(
                        answer
                    );
                }

                const request =
                    suiteGlobalAiXmlhttpRequest({
                        method: 'POST',
                        url: DEEPSEEK_ENDPOINT,
                        headers: {
                            'Content-Type':
                                'application/json',
                            Authorization:
                                'Bearer ' +
                                apiKey
                        },
                        data: JSON.stringify({
                            model:
                                model ||
                                DEFAULT_MODEL,
                            messages:
                                messages,
                            temperature: 0.25,
                            max_tokens:
                                maxTokens ||
                                3000,
                            stream: true
                        }),
                        responseType: 'text',
                        timeout: 150000,

                        /*
                         * 回答生成阶段：只把新增token按普通文本写入气泡。
                         * Markdown不会在这里解析或渲染。
                         */
                        onprogress: response => {
                            consumeResponse(
                                response,
                                false
                            );
                        },

                        /*
                         * 部分Tampermonkey版本主要通过readyState=3暴露增量文本。
                         */
                        onreadystatechange: response => {
                            if (
                                response &&
                                (
                                    response.readyState === 3 ||
                                    response.readyState === 4
                                )
                            ) {
                                consumeResponse(
                                    response,
                                    false
                                );
                            }
                        },

                        onload: response => {
                            if (
                                response.status < 200 ||
                                response.status >= 300
                            ) {
                                finishReject(
                                    new Error(
                                        'DeepSeek接口返回HTTP ' +
                                        response.status +
                                        '：' +
                                        responseTextOf(
                                            response
                                        ).slice(
                                            0,
                                            800
                                        )
                                    )
                                );
                                return;
                            }

                            finishResolve(
                                response
                            );
                        },

                        onerror: () => {
                            finishReject(
                                new Error(
                                    'DeepSeek网络请求失败'
                                )
                            );
                        },

                        ontimeout: () => {
                            finishReject(
                                new Error(
                                    'DeepSeek请求超时'
                                )
                            );
                        },

                        onabort: () => {
                            finishReject(
                                new Error(
                                    '已停止当前AI对话请求'
                                )
                            );
                        }
                    });

                state.chatRequest =
                    request;
            }
        );
    }

    function stringArray(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map(item => {
                if (
                    item &&
                    typeof item === 'object'
                ) {
                    return plain(
                        item.name ||
                        item.text ||
                        item.message ||
                        JSON.stringify(item)
                    );
                }

                return plain(item);
            })
            .filter(Boolean);
    }

    function normalizeDiagnoses(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map(item => {
                if (
                    typeof item === 'string'
                ) {
                    return {
                        name: plain(item),
                        code: '',
                        type: ''
                    };
                }

                if (
                    item &&
                    typeof item === 'object'
                ) {
                    return {
                        name:
                            plain(
                                item.name ||
                                item.diagnosis
                            ),
                        code:
                            plain(
                                item.code
                            ),
                        type:
                            plain(
                                item.type
                            )
                    };
                }

                return null;
            })
            .filter(item =>
                item &&
                item.name
            );
    }

    function cleanTcmValue(
        value,
        type
    ) {
        let result =
            plain(
                value
            );

        if (type === 'disease') {
            result =
                result.replace(
                    /^(?:中医)?(?:病名|疾病名称)\s*[:：]?\s*/,
                    ''
                );
        }
        else {
            result =
                result.replace(
                    /^(?:中医)?(?:证候|证型|辨证)\s*[:：]?\s*/,
                    ''
                );
        }

        return plain(result);
    }

    function looksLikeTcmSyndrome(value) {
        const textValue =
            plain(value);

        return (
            /证$/.test(textValue) ||
            /气虚|血虚|阴虚|阳虚|气滞|血瘀|痰湿|痰瘀|湿热|寒湿|风寒|风热|肝阳|肝郁|脾虚|肾虚|气阴两虚|肝肾亏虚|脾肾阳虚|寒凝|热毒|瘀阻|痹阻/.test(
                textValue
            )
        );
    }

    function looksLikeTcmDisease(value) {
        const textValue =
            plain(value);

        return /腰痛|痹证|眩晕|中风|胸痹|心悸|不寐|消渴|痿证|咳嗽|喘证|胃脘痛|腹痛|泄泻|便秘|头痛|项痹|颈痹|膝痹|水肿|淋证|癃闭|郁证|胁痛|痉证|痫病|痴呆|耳鸣|耳聋/.test(
            textValue
        );
    }

    function normalizeTcmPair(
        disease,
        syndrome
    ) {
        let normalizedDisease =
            cleanTcmValue(
                disease,
                'disease'
            );

        let normalizedSyndrome =
            cleanTcmValue(
                syndrome,
                'syndrome'
            );

        if (
            looksLikeTcmSyndrome(
                normalizedDisease
            ) &&
            looksLikeTcmDisease(
                normalizedSyndrome
            )
        ) {
            const temporary =
                normalizedDisease;

            normalizedDisease =
                normalizedSyndrome;
            normalizedSyndrome =
                temporary;
        }

        return {
            disease:
                normalizedDisease,
            syndrome:
                normalizedSyndrome
        };
    }

    function normalizeGenerated(raw) {
        const source =
            raw &&
            typeof raw === 'object'
                ? raw
                : {};

        const record =
            source.record &&
            typeof source.record === 'object'
                ? source.record
                : source;

        const tcm =
            source.tcmDiagnosis &&
            typeof source.tcmDiagnosis === 'object'
                ? source.tcmDiagnosis
                : record.tcmDiagnosis &&
                    typeof record.tcmDiagnosis === 'object'
                    ? record.tcmDiagnosis
                    : {};

        const tcmPair =
            normalizeTcmPair(
                tcm.disease ||
                tcm.diseaseName,
                tcm.syndrome ||
                tcm.pattern
            );

        return {
            recordType:
                plain(
                    source.recordType ||
                    record.recordType
                ),
            chiefComplaint:
                compactText(
                    record.chiefComplaint
                ),
            presentIllness:
                compactText(
                    record.presentIllness
                ),
            pastHistory:
                compactText(
                    record.pastHistory
                ),
            menstrualHistory:
                compactText(
                    record.menstrualHistory
                ),
            allergyHistory:
                compactText(
                    record.allergyHistory
                ),
            physicalExam:
                compactText(
                    record.physicalExam
                ),
            auxiliaryExam:
                compactText(
                    record.auxiliaryExam
                ),
            treatment:
                compactText(
                    record.treatment ||
                    record.plan
                ),
            westernDiagnoses:
                normalizeDiagnoses(
                    source.westernDiagnoses ||
                    record.westernDiagnoses
                ),
            tcmDiagnosis: {
                disease:
                    tcmPair.disease,
                syndrome:
                    tcmPair.syndrome,
                basis:
                    compactText(
                        tcm.basis ||
                        tcm.reasoning
                    )
            },
            medicationAdvice:
                stringArray(
                    source.medicationAdvice
                ),
            testAdvice:
                stringArray(
                    source.testAdvice
                ),
            rehabilitationAdvice:
                stringArray(
                    source.rehabilitationAdvice
                ),
            riskAlerts:
                stringArray(
                    source.riskAlerts ||
                    source.warnings
                ),
            missingInformation:
                stringArray(
                    source.missingInformation
                )
        };
    }

    function normalizeAudit(raw) {
        const source =
            raw &&
            typeof raw === 'object'
                ? raw
                : {};

        return {
            riskLevel:
                plain(
                    source.riskLevel
                ) ||
                'medium',
            summary:
                compactText(
                    source.summary
                ),
            problems:
                stringArray(
                    source.problems ||
                    source.findings
                ),
            factualAdditions:
                stringArray(
                    source.factualAdditions ||
                    source.possibleFabrications
                ),
            contradictions:
                stringArray(
                    source.contradictions
                ),
            missingInformation:
                stringArray(
                    source.missingInformation
                ),
            revisionAdvice:
                stringArray(
                    source.revisionAdvice ||
                    source.suggestions
                ),
            revisedRecord:
                source.revisedRecord &&
                typeof source.revisedRecord === 'object'
                    ? normalizeGenerated({
                        record:
                            source.revisedRecord,
                        westernDiagnoses:
                            source.westernDiagnoses,
                        tcmDiagnosis:
                            source.tcmDiagnosis
                    })
                    : null
        };
    }

    function modalElement() {
        return document.getElementById(
            IDS.modal
        );
    }

    function showMessage(message, type) {
        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        const box =
            modal.querySelector(
                '.outpatient-ai-message'
            );

        box.className =
            'outpatient-ai-message ' +
            (
                type ||
                'normal'
            );

        box.textContent =
            String(message || '');

        /*
         * 错误和警告原先位于弹窗最底部，用户停留在上方时会误以为
         * “点击后没有反应”。出现异常时自动滚动到可见位置。
         */
        if (
            type === 'error' ||
            type === 'warning'
        ) {
            requestAnimationFrame(() => {
                try {
                    box.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest'
                    });
                }
                catch (error) {
                    box.scrollIntoView(false);
                }
            });
        }
    }

    function setBusy(busy, taskType) {
        state.busy =
            Boolean(busy);
        state.taskType =
            busy
                ? (
                    taskType ||
                    ''
                )
                : '';

        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        const generate =
            modal.querySelector(
                '.outpatient-ai-generate'
            );
        const audit =
            modal.querySelector(
                '.outpatient-ai-audit'
            );
        const completeEmpty =
            modal.querySelector(
                '.outpatient-ai-complete-empty'
            );
        const previewAudit =
            modal.querySelector(
                '.outpatient-ai-preview-audit'
            );
        const polish =
            modal.querySelector(
                '.outpatient-ai-polish'
            );
        const stop =
            modal.querySelector(
                '.outpatient-ai-stop'
            );

        if (generate) {
            generate.textContent =
                state.busy &&
                state.taskType === 'generate'
                    ? '正在生成……'
                    : '生成门诊病历';
        }

        if (audit) {
            audit.textContent =
                state.busy &&
                state.taskType === 'audit'
                    ? '正在审核……'
                    : '审核当前病历';
        }

        if (completeEmpty) {
            completeEmpty.textContent =
                state.busy &&
                state.taskType === 'complete-empty'
                    ? '正在预测补全……'
                    : 'AI预测补全空项';
        }

        if (previewAudit) {
            previewAudit.textContent =
                state.busy &&
                state.taskType === 'preview-audit'
                    ? '正在预审核……'
                    : '预审核';
        }

        if (polish) {
            polish.textContent =
                state.busy &&
                state.taskType === 'polish'
                    ? '正在润色……'
                    : 'AI润色';
        }

        modal.querySelectorAll(
            'button,input,select,textarea'
        ).forEach(element => {
            if (
                element.classList.contains(
                    'outpatient-ai-stop'
                )
            ) {
                return;
            }

            if (
                element.classList.contains(
                    'outpatient-ai-close'
                )
            ) {
                return;
            }

            /*
             * 即使旧任务卡在忙碌状态，重置按钮也必须可以使用。
             */
            if (
                element.classList.contains(
                    'outpatient-ai-reset-info'
                )
            ) {
                return;
            }

            if (
                element.classList.contains(
                    'outpatient-ai-toggle-section'
                )
            ) {
                return;
            }

            if (
                element.closest &&
                element.closest(
                    '.outpatient-ai-chat-window'
                )
            ) {
                return;
            }

            element.disabled =
                state.busy;
        });

        stop.disabled =
            !state.busy;

        updateOutpatientDiagnosisControls(modal);
    }

    function fieldEditorValue(modal, key) {
        const control =
            modal.querySelector(
                `[data-result-field="${key}"]`
            );

        return control
            ? compactText(
                control.value
            )
            : '';
    }

    function resultFromEditors(modal) {
        const diagnosesText =
            modal.querySelector(
                '.outpatient-ai-western-diagnoses'
            ).value;

        const westernDiagnoses =
            diagnosesText
                .split(/\n+/)
                .map(line => {
                    const text =
                        plain(line);

                    if (!text) {
                        return null;
                    }

                    const match =
                        text.match(
                            /^(.*?)\s*(?:[（(]([^）)]+)[）)])?$/
                        );

                    return {
                        name:
                            plain(
                                match
                                    ? match[1]
                                    : text
                            ),
                        code:
                            plain(
                                match
                                    ? match[2]
                                    : ''
                            ),
                        type: ''
                    };
                })
                .filter(Boolean);

        return {
            recordType:
                state.generated
                    ? state.generated.recordType
                    : '',
            chiefComplaint:
                fieldEditorValue(
                    modal,
                    'chiefComplaint'
                ),
            presentIllness:
                fieldEditorValue(
                    modal,
                    'presentIllness'
                ),
            pastHistory:
                fieldEditorValue(
                    modal,
                    'pastHistory'
                ),
            menstrualHistory:
                fieldEditorValue(
                    modal,
                    'menstrualHistory'
                ),
            allergyHistory:
                fieldEditorValue(
                    modal,
                    'allergyHistory'
                ),
            physicalExam:
                fieldEditorValue(
                    modal,
                    'physicalExam'
                ),
            auxiliaryExam:
                fieldEditorValue(
                    modal,
                    'auxiliaryExam'
                ),
            treatment:
                fieldEditorValue(
                    modal,
                    'treatment'
                ),
            westernDiagnoses:
                westernDiagnoses,
            tcmDiagnosis: {
                disease:
                    plain(
                        modal.querySelector(
                            '.outpatient-ai-tcm-disease'
                        ).value
                    ),
                syndrome:
                    plain(
                        modal.querySelector(
                            '.outpatient-ai-tcm-syndrome'
                        ).value
                    ),
                basis:
                    compactText(
                        modal.querySelector(
                            '.outpatient-ai-tcm-basis'
                        ).value
                    )
            },
            medicationAdvice:
                state.generated
                    ? state.generated.medicationAdvice
                    : [],
            testAdvice:
                state.generated
                    ? state.generated.testAdvice
                    : [],
            rehabilitationAdvice:
                state.generated
                    ? state.generated.rehabilitationAdvice
                    : [],
            riskAlerts:
                state.generated
                    ? state.generated.riskAlerts
                    : [],
            missingInformation:
                state.generated
                    ? state.generated.missingInformation
                    : []
        };
    }

    function renderGenerated(result) {
        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        Object.keys(
            FIELD_DEFINITIONS
        ).forEach(key => {
            const control =
                modal.querySelector(
                    `[data-result-field="${key}"]`
                );

            if (control) {
                control.value =
                    result
                        ? (
                            result[key] ||
                            ''
                        )
                        : '';
            }
        });

        modal.querySelector(
            '.outpatient-ai-western-diagnoses'
        ).value =
            result
                ? result.westernDiagnoses
                    .map(item =>
                        item.code
                            ? (
                                item.name +
                                '（' +
                                item.code +
                                '）'
                            )
                            : item.name
                    )
                    .join('\n')
                : '';

        modal.querySelector(
            '.outpatient-ai-tcm-disease'
        ).value =
            result
                ? result.tcmDiagnosis.disease
                : '';

        modal.querySelector(
            '.outpatient-ai-tcm-syndrome'
        ).value =
            result
                ? result.tcmDiagnosis.syndrome
                : '';

        modal.querySelector(
            '.outpatient-ai-tcm-basis'
        ).value =
            result
                ? result.tcmDiagnosis.basis
                : '';

        const adviceBox =
            modal.querySelector(
                '.outpatient-ai-advice-result'
            );

        if (!result) {
            adviceBox.innerHTML =
                '<div class="outpatient-ai-empty">尚未生成诊疗建议。</div>';
            return;
        }

        const blocks = [
            [
                '用药建议',
                result.medicationAdvice
            ],
            [
                '检验检查建议',
                result.testAdvice
            ],
            [
                '康复及其他治疗建议',
                result.rehabilitationAdvice
            ],
            [
                '风险提示',
                result.riskAlerts
            ],
            [
                '仍需补充的信息',
                result.missingInformation
            ]
        ];

        const html =
            blocks
                .filter(([, values]) =>
                    Array.isArray(values) &&
                    values.length
                )
                .map(([title, values]) =>
                    '<div class="outpatient-ai-advice-block">' +
                    '<strong>' +
                    escapeHtml(title) +
                    '</strong>' +
                    '<ul>' +
                    values
                        .map(value =>
                            '<li>' +
                            escapeHtml(value) +
                            '</li>'
                        )
                        .join('') +
                    '</ul>' +
                    '</div>'
                )
                .join('');

        adviceBox.innerHTML =
            html ||
            '<div class="outpatient-ai-empty">本次未返回额外诊疗建议。</div>';
    }

    function renderAudit(result) {
        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        const box =
            modal.querySelector(
                '.outpatient-ai-audit-result'
            );

        if (!result) {
            box.innerHTML =
                '<div class="outpatient-ai-empty">尚未执行当前页面审核或生成结果预审核。</div>';
            return;
        }

        const listBlock =
            (title, values, className) => {
                if (
                    !Array.isArray(values) ||
                    !values.length
                ) {
                    return '';
                }

                return (
                    '<div class="outpatient-ai-audit-block ' +
                    (
                        className ||
                        ''
                    ) +
                    '">' +
                    '<strong>' +
                    escapeHtml(title) +
                    '</strong>' +
                    '<ul>' +
                    values
                        .map(value =>
                            '<li>' +
                            escapeHtml(value) +
                            '</li>'
                        )
                        .join('') +
                    '</ul>' +
                    '</div>'
                );
            };

        box.innerHTML =
            '<div class="outpatient-ai-audit-summary">' +
            '<strong>风险等级：</strong>' +
            escapeHtml(
                result.riskLevel
            ) +
            '</div>' +
            (
                result.summary
                    ? '<div class="outpatient-ai-audit-summary">' +
                        escapeHtml(
                            result.summary
                        ) +
                        '</div>'
                    : ''
            ) +
            listBlock(
                '主要问题',
                result.problems,
                'warning'
            ) +
            listBlock(
                '可能存在的无依据新增或事实扩写',
                result.factualAdditions,
                'danger'
            ) +
            listBlock(
                '前后矛盾',
                result.contradictions,
                'danger'
            ) +
            listBlock(
                '缺失信息',
                result.missingInformation,
                ''
            ) +
            listBlock(
                '修改建议',
                result.revisionAdvice,
                ''
            ) +
            (
                result.revisedRecord
                    ? '<div class="outpatient-ai-safe-note">AI已返回建议修订稿。点击“采用审核修订稿”只会加载到本助手预览区，不会直接改写页面。</div>'
                    : ''
            );

        modal.querySelector(
            '.outpatient-ai-use-revised'
        ).disabled =
            !result.revisedRecord;
    }

    function buildFullRecord(result) {
        if (!result) {
            return '';
        }

        const lines = [];

        [
            [
                '主诉',
                result.chiefComplaint
            ],
            [
                '现病史',
                result.presentIllness
            ],
            [
                '既往史',
                result.pastHistory
            ],
            [
                '月经史',
                result.menstrualHistory
            ],
            [
                '过敏史',
                result.allergyHistory
            ],
            [
                '查体',
                result.physicalExam
            ],
            [
                '辅助检查',
                result.auxiliaryExam
            ],
            [
                '处理',
                result.treatment
            ]
        ].forEach(([title, value]) => {
            if (plain(value)) {
                lines.push(
                    title +
                    '：' +
                    compactText(value)
                );
            }
        });

        if (
            result.westernDiagnoses &&
            result.westernDiagnoses.length
        ) {
            lines.push(
                '西医诊断建议：' +
                result.westernDiagnoses
                    .map(item =>
                        item.code
                            ? (
                                item.name +
                                '（' +
                                item.code +
                                '）'
                            )
                            : item.name
                    )
                    .join('；')
            );
        }

        const tcmParts = [];

        if (
            result.tcmDiagnosis &&
            result.tcmDiagnosis.disease
        ) {
            tcmParts.push(
                result.tcmDiagnosis.disease
            );
        }

        if (
            result.tcmDiagnosis &&
            result.tcmDiagnosis.syndrome
        ) {
            tcmParts.push(
                result.tcmDiagnosis.syndrome
            );
        }

        if (tcmParts.length) {
            lines.push(
                '中医诊断建议：' +
                tcmParts.join('；')
            );
        }

        if (
            result.tcmDiagnosis &&
            result.tcmDiagnosis.basis
        ) {
            lines.push(
                '辨证依据：' +
                result.tcmDiagnosis.basis
            );
        }

        return lines.join('\n');
    }

    async function copyText(text) {
        const value =
            String(text || '');

        if (!value) {
            throw new Error(
                '没有可复制的内容'
            );
        }

        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(
                value
            );
            return;
        }

        const textarea =
            document.createElement(
                'textarea'
            );

        textarea.value =
            value;
        textarea.style.position =
            'fixed';
        textarea.style.left =
            '-9999px';

        document.body.appendChild(
            textarea
        );
        textarea.select();

        const success =
            document.execCommand(
                'copy'
            );

        textarea.remove();

        if (!success) {
            throw new Error(
                '浏览器未允许复制'
            );
        }
    }

    function pageSnapshotText(record) {
        const patient =
            record.patient || {};
        const vitals =
            record.vitals || {};
        const fields =
            record.fields || {};

        const lines = [
            patient.name
                ? (
                    '姓名：' +
                    patient.name
                )
                : '',
            patient.sex
                ? (
                    '性别：' +
                    patient.sex
                )
                : '',
            patient.age
                ? (
                    '年龄：' +
                    patient.age +
                    '岁'
                )
                : '',
            patient.insurance
                ? (
                    '医保：' +
                    patient.insurance
                )
                : '',
            vitals.height
                ? (
                    '身高：' +
                    vitals.height
                )
                : '',
            vitals.weight
                ? (
                    '体重：' +
                    vitals.weight
                )
                : '',
            vitals.temperature
                ? (
                    '体温：' +
                    vitals.temperature
                )
                : '',
            vitals.pulse
                ? (
                    '脉搏：' +
                    vitals.pulse
                )
                : '',
            vitals.respiration
                ? (
                    '呼吸：' +
                    vitals.respiration
                )
                : '',
            vitals.bloodGlucose
                ? (
                    '血糖：' +
                    vitals.bloodGlucose
                )
                : '',
            vitals.systolicPressure ||
            vitals.diastolicPressure
                ? (
                    '血压：' +
                    (
                        vitals.systolicPressure ||
                        ''
                    ) +
                    '/' +
                    (
                        vitals.diastolicPressure ||
                        ''
                    )
                )
                : '',
            vitals.onsetDate
                ? (
                    '发病日期：' +
                    vitals.onsetDate
                )
                : ''
        ].filter(Boolean);

        Object.keys(
            FIELD_DEFINITIONS
        ).forEach(key => {
            const value =
                fields[key];

            if (value) {
                lines.push(
                    FIELD_DEFINITIONS[key].title +
                    '：' +
                    value
                );
            }
        });

        if (
            record.westernDiagnosisSearch
        ) {
            lines.push(
                '当前西医诊断检索词：' +
                record.westernDiagnosisSearch
            );
        }

        if (
            record.tcmDiagnosisSearch
        ) {
            lines.push(
                '当前中医诊断检索词：' +
                record.tcmDiagnosisSearch
            );
        }

        return lines.join('\n');
    }

    function settingsFromModal(modal) {
        const apiKey =
            plain(
                modal.querySelector(
                    '.outpatient-ai-key'
                ).value
            );

        const model =
            plain(
                modal.querySelector(
                    '.outpatient-ai-model'
                ).value
            ) ||
            DEFAULT_MODEL;

        const prompt =
            compactText(
                modal.querySelector(
                    '.outpatient-ai-prompt'
                ).value
            );

        const template =
            modal.querySelector(
                '.outpatient-ai-template'
            ).value;

        const autoDiagnosis =
            modal.querySelector(
                '.outpatient-ai-auto-diagnosis'
            ).checked;

        GM_setValue(
            KEYS.apiKey,
            apiKey
        );
        GM_setValue(
            KEYS.model,
            model
        );
        GM_setValue(
            KEYS.prompt,
            prompt
        );
        GM_setValue(
            KEYS.template,
            template
        );
        GM_setValue(
            KEYS.autoDiagnosisSearch,
            autoDiagnosis
        );

        return {
            apiKey,
            model,
            prompt,
            template,
            autoDiagnosis
        };
    }

    function sourceEditor(modal) {
        return modal
            ? modal.querySelector(
                '.outpatient-ai-source'
            )
            : null;
    }

    function setSourceEditorText(
        modal,
        value,
        sourceMode
    ) {
        const editor =
            sourceEditor(modal);

        if (!editor) {
            return;
        }

        editor.dataset.programmaticWrite =
            '1';

        editor.value =
            String(
                value == null
                    ? ''
                    : value
            );

        delete editor.dataset
            .programmaticWrite;

        state.sourceMode =
            sourceMode ||
            'unknown';

        state.sourceRevision +=
            1;
    }

    function sourceFingerprint(value) {
        const textValue =
            String(
                value == null
                    ? ''
                    : value
            );

        let hash =
            2166136261;

        for (
            let index = 0;
            index < textValue.length;
            index += 1
        ) {
            hash ^=
                textValue.charCodeAt(
                    index
                );

            hash =
                Math.imul(
                    hash,
                    16777619
                );
        }

        return (
            textValue.length +
            ':' +
            (
                hash >>> 0
            ).toString(16)
        );
    }

    function recordSourceContext(
        modal
    ) {
        const editor =
            sourceEditor(modal);

        let sourceText =
            compactText(
                editor
                    ? editor.value
                    : ''
            );

        if (!sourceText) {
            const record =
                readCurrentRecord();

            sourceText =
                pageSnapshotText(
                    record
                );

            setSourceEditorText(
                modal,
                sourceText,
                'page'
            );

            return {
                text:
                    sourceText,
                mode:
                    'page',
                pageRecord:
                    record
            };
        }

        /*
         * 手工粘贴或编辑后的资料以文本框为唯一患者来源。
         * 不再附带state.sourceRecord，避免把上一位患者的姓名、
         * 年龄、生命体征和病历字段混入本次请求。
         */
        if (
            state.sourceMode ===
            'manual'
        ) {
            return {
                text:
                    sourceText,
                mode:
                    'manual',
                pageRecord:
                    null
            };
        }

        /*
         * 仅当资料明确来自“读取当前页面”时，重新读取一次当前页面，
         * 确保单页应用切换患者后不会继续使用旧快照。
         */
        if (
            state.sourceMode ===
            'page'
        ) {
            const freshRecord =
                readCurrentRecord();

            return {
                text:
                    sourceText,
                mode:
                    'page',
                pageRecord:
                    freshRecord
            };
        }

        /*
         * 兼容升级前已经存在于文本框中的内容：按手工资料处理，
         * 安全优先，不附带任何可能过期的网页快照。
         */
        state.sourceMode =
            'manual';
        state.sourceRecord =
            null;

        return {
            text:
                sourceText,
            mode:
                'manual',
            pageRecord:
                null
        };
    }

    function ensureRecordSource(modal) {
        return recordSourceContext(
            modal
        ).text;
    }

    function resetPreviewForNewSource(
        modal
    ) {
        state.generated =
            null;
        state.audit =
            null;

        renderGenerated(
            null
        );

        renderAudit(
            null
        );

        const revisedButton =
            modal.querySelector(
                '.outpatient-ai-use-revised'
            );

        if (revisedButton) {
            revisedButton.disabled =
                true;
        }
    }

    function missingEditorDefinitions(
        result
    ) {
        const missing = [];

        Object.keys(
            FIELD_DEFINITIONS
        ).forEach(key => {
            if (
                !plain(
                    result[key]
                )
            ) {
                missing.push({
                    key: key,
                    title:
                        FIELD_DEFINITIONS[key]
                            .title,
                    type: 'record'
                });
            }
        });

        if (
            !result.westernDiagnoses ||
            !result.westernDiagnoses.length
        ) {
            missing.push({
                key: 'westernDiagnoses',
                title: '西医诊断建议',
                type: 'westernDiagnoses'
            });
        }

        const tcm =
            result.tcmDiagnosis ||
            {};

        [
            {
                key: 'disease',
                title: '中医病名'
            },
            {
                key: 'syndrome',
                title: '中医证候'
            },
            {
                key: 'basis',
                title: '辨证依据'
            }
        ].forEach(item => {
            if (
                !plain(
                    tcm[item.key]
                )
            ) {
                missing.push({
                    key:
                        item.key,
                    title:
                        item.title,
                    type:
                        'tcmDiagnosis'
                });
            }
        });

        return missing;
    }

    function diagnosisText(
        diagnoses
    ) {
        return (
            Array.isArray(diagnoses)
                ? diagnoses
                : []
        )
            .filter(item =>
                item &&
                plain(item.name)
            )
            .map(item =>
                plain(item.code)
                    ? (
                        plain(item.name) +
                        '（' +
                        plain(item.code) +
                        '）'
                    )
                    : plain(item.name)
            )
            .join('\n');
    }

    function applyPredictedEmptyFields(
        modal,
        prediction,
        requestedMissing
    ) {
        const filled = [];
        const stillEmpty = [];

        requestedMissing.forEach(item => {
            if (item.type === 'record') {
                const control =
                    modal.querySelector(
                        `[data-result-field="${item.key}"]`
                    );

                const currentValue =
                    control
                        ? compactText(
                            control.value
                        )
                        : '';

                const predictedValue =
                    compactText(
                        prediction[item.key]
                    );

                if (
                    control &&
                    !currentValue &&
                    predictedValue
                ) {
                    control.value =
                        predictedValue;
                    filled.push(
                        item.title
                    );
                }
                else if (
                    !currentValue
                ) {
                    stillEmpty.push(
                        item.title
                    );
                }

                return;
            }

            if (
                item.type ===
                'westernDiagnoses'
            ) {
                const control =
                    modal.querySelector(
                        '.outpatient-ai-western-diagnoses'
                    );

                const currentValue =
                    control
                        ? compactText(
                            control.value
                        )
                        : '';

                const predictedValue =
                    diagnosisText(
                        prediction.westernDiagnoses
                    );

                if (
                    control &&
                    !currentValue &&
                    predictedValue
                ) {
                    control.value =
                        predictedValue;
                    filled.push(
                        item.title
                    );
                }
                else if (
                    !currentValue
                ) {
                    stillEmpty.push(
                        item.title
                    );
                }

                return;
            }

            if (
                item.type ===
                'tcmDiagnosis'
            ) {
                const selectorMap = {
                    disease:
                        '.outpatient-ai-tcm-disease',
                    syndrome:
                        '.outpatient-ai-tcm-syndrome',
                    basis:
                        '.outpatient-ai-tcm-basis'
                };

                const control =
                    modal.querySelector(
                        selectorMap[item.key]
                    );

                const currentValue =
                    control
                        ? compactText(
                            control.value
                        )
                        : '';

                const predictedValue =
                    compactText(
                        prediction.tcmDiagnosis &&
                        prediction.tcmDiagnosis[
                            item.key
                        ]
                    );

                if (
                    control &&
                    !currentValue &&
                    predictedValue
                ) {
                    control.value =
                        predictedValue;
                    filled.push(
                        item.title
                    );
                }
                else if (
                    !currentValue
                ) {
                    stillEmpty.push(
                        item.title
                    );
                }
            }
        });

        return {
            filled: filled,
            stillEmpty: stillEmpty
        };
    }

    async function completeEmptyFields() {
        const modal =
            modalElement();

        if (
            !modal ||
            state.busy
        ) {
            return;
        }

        const settings =
            settingsFromModal(
                modal
            );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showMessage(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        const currentResult =
            resultFromEditors(
                modal
            );

        const missing =
            missingEditorDefinitions(
                currentResult
            );

        if (!missing.length) {
            showMessage(
                '病历预览区当前没有空项，无需补全。',
                'warning'
            );
            return;
        }

        const sourceContext =
            recordSourceContext(
                modal
            );

        const sourceText =
            sourceContext.text;

        if (!sourceText) {
            showMessage(
                '没有可用于预测的患者资料，请先点击“读取当前页面”或粘贴患者病情资料。',
                'warning'
            );
            return;
        }

        const templatePrompt =
            TEMPLATE_PROMPTS[
                settings.template
            ] ||
            TEMPLATE_PROMPTS.initial;

        const systemPrompt = [
            '你是中国医疗机构门诊病历空项预测补全辅助工具。',
            '必须只输出JSON对象，不得输出Markdown、解释、前言或结尾。',
            '本次任务只允许补全missingFields中列出的空项；existingRecord中已有内容必须保持不变，不得改写、缩短、润色或覆盖。',
            '可以根据患者已提供资料和已有病历内容进行谨慎的医学归纳与预测，例如从明确症状概括主诉、整理现病史、提出待查性质的诊断建议。',
            '不得虚构具体日期、生命体征、数值、检查或化验结果、阴性症状、既往疾病、手术史、用药史、过敏史、月经史、查体阳性体征、舌象、脉象、疗效和诊断编码。',
            '既往史、过敏史、月经史、查体、辅助检查等若没有明确依据，必须继续留空，不得默认填写“无”“否认”“未见异常”或类似内容。',
            '中医病名、证候和辨证依据必须有实际四诊信息支持；资料不足时继续留空。',
            '诊断仅为建议；证据不足时可写“待查”，但不得强行确定。',
            '处理内容只能基于已给出的诊疗经过或医师明确提示；不得擅自生成处方、剂量或需要立即执行的医嘱。',
            '未能安全补全的字段保持空字符串，并在missingInformation中说明仍需补充什么资料。',
            'JSON结构必须为：',
            '{"record":{"chiefComplaint":"","presentIllness":"","pastHistory":"","menstrualHistory":"","allergyHistory":"","physicalExam":"","auxiliaryExam":"","treatment":""},"westernDiagnoses":[{"name":"","code":"","type":"主要诊断"}],"tcmDiagnosis":{"disease":"","syndrome":"","basis":""},"missingInformation":[]}'
        ].join('\n');

        setBusy(
            true,
            'complete-empty'
        );

        showMessage(
            '正在调用DeepSeek预测补全' +
            missing.length +
            '个空项……',
            'normal'
        );

        try {
            const raw =
                await aiRequest(
                    settings.apiKey,
                    settings.model,
                    systemPrompt,
                    {
                        templateRequirements:
                            templatePrompt,
                        physicianPrompt:
                            settings.prompt,
                        patientInformation:
                            sourceText,
                        currentPageRecord:
                            sourceContext.pageRecord,
                        existingRecord:
                            currentResult,
                        missingFields:
                            missing.map(item => ({
                                key:
                                    item.type ===
                                    'tcmDiagnosis'
                                        ? (
                                            'tcmDiagnosis.' +
                                            item.key
                                        )
                                        : item.key,
                                title:
                                    item.title
                            }))
                    },
                    5200
                );

            const prediction =
                normalizeGenerated(
                    raw
                );

            const applied =
                applyPredictedEmptyFields(
                    modal,
                    prediction,
                    missing
                );

            const previousGenerated =
                state.generated;

            state.generated =
                resultFromEditors(
                    modal
                );

            state.generated.recordType =
                currentResult.recordType ||
                prediction.recordType ||
                '';

            [
                'medicationAdvice',
                'testAdvice',
                'rehabilitationAdvice',
                'riskAlerts'
            ].forEach(key => {
                state.generated[key] =
                    previousGenerated &&
                    Array.isArray(
                        previousGenerated[key]
                    )
                        ? previousGenerated[key]
                        : [];
            });

            state.generated.missingInformation =
                prediction.missingInformation ||
                [];

            if (!applied.filled.length) {
                showMessage(
                    'AI未能在现有资料基础上安全补全任何空项。' +
                    (
                        applied.stillEmpty.length
                            ? (
                                '\n仍为空：' +
                                applied.stillEmpty.join('、')
                            )
                            : ''
                    ) +
                    (
                        state.generated.missingInformation.length
                            ? (
                                '\n需补充：' +
                                state.generated.missingInformation.join('；')
                            )
                            : ''
                    ),
                    'warning'
                );
                return;
            }

            showMessage(
                '已预测补全' +
                applied.filled.length +
                '项：' +
                applied.filled.join('、') +
                '。' +
                (
                    applied.stillEmpty.length
                        ? (
                            '\n因依据不足仍留空：' +
                            applied.stillEmpty.join('、') +
                            '。'
                        )
                        : ''
                ) +
                '\n原有非空内容未被覆盖；所有预测内容必须由医师逐项核对。',
                'success'
            );
        }
        catch (error) {
            showMessage(
                error.message,
                'error'
            );
        }
        finally {
            setBusy(
                false,
                ''
            );
        }
    }

    async function generateRecord() {
        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        if (state.busy) {
            showMessage(
                '已有AI任务正在执行，请等待完成或点击“停止”后再重新生成。',
                'warning'
            );
            return;
        }

        const settings =
            settingsFromModal(
                modal
            );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showMessage(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        const sourceContext =
            recordSourceContext(
                modal
            );

        const sourceText =
            sourceContext.text;

        if (!sourceText) {
            showMessage(
                '当前页面没有识别到病历内容，请在“患者病情资料”中粘贴患者信息。',
                'warning'
            );
            return;
        }

        const generationFingerprint =
            sourceFingerprint(
                [
                    sourceText,
                    settings.template,
                    settings.prompt,
                    settings.model
                ].join('\n---\n')
            );

        const sourceChanged =
            generationFingerprint !==
            state.lastGenerationFingerprint;

        /*
         * 更换患者资料后先清空上一位患者的预览。
         * 这样即使本次接口报错，也不会让旧内容停留在框中造成
         * “没有生成新内容”的错觉。
         */
        if (sourceChanged) {
            resetPreviewForNewSource(
                modal
            );
        }

        const generationId =
            ++state.generationSerial;

        const resetSerialAtStart =
            state.resetSerial;

        const templatePrompt =
            TEMPLATE_PROMPTS[
                settings.template
            ] ||
            TEMPLATE_PROMPTS.initial;

        const customPrompt =
            settings.prompt ||
            '请根据患者资料生成规范门诊病历。';

        const systemPrompt = [
            '你是中国医疗机构门诊病历书写辅助工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '输出内容仅供执业医师人工核对，不得自动保存、签名、开药或替代临床判断。',
            '严禁虚构患者未提供的症状、时间、诱因、阴性症状、生命体征、既往疾病、手术史、药物、过敏史、检查结果、舌象、脉象、诊断编码和疗效。',
            '患者资料不足时，相应病历字段留空，并把需要补充的内容列入missingInformation。',
            '现病史应围绕主诉，按起病时间、诱因、症状特点、伴随症状、诊疗经过、目前情况组织；只使用已提供事实。',
            '查体和辅助检查只能写患者资料中明确提供的内容。',
            '诊断仅作为建议；无法可靠判断时写“待查”或列入缺失信息，不得强行确定。',
            '中医辨证必须基于实际提供的望闻问切；四诊不全时不得强行给出确定证候。',
            '处理建议应区分“可直接写入病历的处理记录”和“需医师进一步确认的建议”。',
            'westernDiagnoses为数组，每项包含name、code、type；无可靠编码时code留空。',
            'tcmDiagnosis包含disease、syndrome、basis；资料不足时留空。',
            'JSON结构必须为：',
            '{"recordType":"初诊或复诊","record":{"chiefComplaint":"","presentIllness":"","pastHistory":"","menstrualHistory":"","allergyHistory":"","physicalExam":"","auxiliaryExam":"","treatment":""},"westernDiagnoses":[{"name":"","code":"","type":"主要诊断"}],"tcmDiagnosis":{"disease":"","syndrome":"","basis":""},"medicationAdvice":[],"testAdvice":[],"rehabilitationAdvice":[],"riskAlerts":[],"missingInformation":[]}'
        ].join('\n');

        setBusy(
            true,
            'generate'
        );

        showMessage(
            '正在调用DeepSeek生成门诊病历……',
            'normal'
        );

        try {
            const raw =
                await aiRequest(
                    settings.apiKey,
                    settings.model,
                    systemPrompt,
                    {
                        templateRequirements:
                            templatePrompt,
                        physicianPrompt:
                            customPrompt,
                        patientInformation:
                            sourceText,
                        currentPageRecord:
                            sourceContext.pageRecord
                    },
                    7500
                );

            if (
                generationId !==
                    state.generationSerial ||
                resetSerialAtStart !==
                    state.resetSerial
            ) {
                return;
            }

            state.generated =
                normalizeGenerated(
                    raw
                );

            state.lastGenerationFingerprint =
                generationFingerprint;

            renderGenerated(
                state.generated
            );

            showMessage(
                '门诊病历已生成。请逐项核对后再点击“引用到当前页面”；脚本不会自动保存。',
                'success'
            );
        }
        catch (error) {
            /*
             * “重置信息”主动废弃的旧请求不再显示错误。
             */
            if (
                generationId ===
                    state.generationSerial &&
                resetSerialAtStart ===
                    state.resetSerial
            ) {
                showMessage(
                    error.message,
                    'error'
                );
            }
        }
        finally {
            /*
             * 旧任务不得解除新任务的忙碌状态。
             */
            if (
                generationId ===
                    state.generationSerial &&
                resetSerialAtStart ===
                    state.resetSerial
            ) {
                setBusy(
                    false,
                    ''
                );
            }
        }
    }

    /*
     * AI润色只处理预览区中已经存在的病历文字：
     * 1. 不填充空项；
     * 2. 不新增、删除或改变医学事实；
     * 3. 不修改西医诊断、中医病名、中医证候及诊断编码；
     * 4. 不自动引用到医院页面，也不执行保存。
     */
    async function polishGeneratedRecord() {
        const modal =
            modalElement();

        if (
            !modal ||
            state.busy
        ) {
            return;
        }

        const settings =
            settingsFromModal(
                modal
            );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showMessage(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        const currentResult =
            resultFromEditors(
                modal
            );

        const polishFieldKeys = [
            'chiefComplaint',
            'presentIllness',
            'pastHistory',
            'menstrualHistory',
            'allergyHistory',
            'physicalExam',
            'auxiliaryExam',
            'treatment'
        ];

        const nonEmptyFields =
            polishFieldKeys.filter(function (key) {
                return Boolean(
                    compactText(
                        currentResult[key]
                    )
                );
            });

        const hasTcmBasis =
            Boolean(
                compactText(
                    currentResult.tcmDiagnosis &&
                    currentResult.tcmDiagnosis.basis
                )
            );

        if (
            !nonEmptyFields.length &&
            !hasTcmBasis
        ) {
            showMessage(
                '病历生成结果中没有可润色的非空文字。',
                'warning'
            );
            return;
        }

        const sourceContext =
            recordSourceContext(
                modal
            );

        const systemPrompt = [
            '你是中国医疗机构门诊病历文字润色工具。',
            '必须只输出JSON对象，不得输出Markdown、解释、前言或结尾。',
            '本次任务仅允许对existingRecord中已经非空的病历文字进行语言规范、语序调整、医学术语统一和结构优化。',
            '严禁新增、推断、补全或删除任何医学事实；不得改变症状、时间、诱因、部位、侧别、程度、频次、数字、单位、阴性或阳性表现、既往史、过敏史、查体、检查结果、用药、剂量、用法、频次和治疗经过。',
            'existingRecord中为空的字段必须继续保持空字符串，不得填入“无”“否认”“未见异常”等内容。',
            '不得修改西医诊断名称、诊断编码、诊断顺序、中医病名和中医证候；这些内容仅作为上下文，不在输出中改写。',
            '主诉应保持简洁，现病史可优化时间顺序和衔接，但不得增删事实。',
            '既往史、月经史、过敏史、查体、辅助检查和处理只能在原文事实范围内润色。',
            '中医辨证依据仅可规范已有表述，不得补造舌象、脉象或其他四诊信息。',
            '输出字段必须与输入一一对应；无法确认的内容保持原文。',
            'JSON结构必须为：',
            '{"record":{"chiefComplaint":"","presentIllness":"","pastHistory":"","menstrualHistory":"","allergyHistory":"","physicalExam":"","auxiliaryExam":"","treatment":""},"tcmDiagnosis":{"basis":""},"summary":""}'
        ].join('\n');

        setBusy(
            true,
            'polish'
        );

        showMessage(
            '正在调用DeepSeek润色当前病历文字……',
            'normal'
        );

        try {
            const raw =
                await aiRequest(
                    settings.apiKey,
                    settings.model,
                    systemPrompt,
                    {
                        physicianRequirements:
                            settings.prompt,
                        originalPatientInformation:
                            sourceContext.text,
                        existingRecord: {
                            record: {
                                chiefComplaint:
                                    currentResult.chiefComplaint,
                                presentIllness:
                                    currentResult.presentIllness,
                                pastHistory:
                                    currentResult.pastHistory,
                                menstrualHistory:
                                    currentResult.menstrualHistory,
                                allergyHistory:
                                    currentResult.allergyHistory,
                                physicalExam:
                                    currentResult.physicalExam,
                                auxiliaryExam:
                                    currentResult.auxiliaryExam,
                                treatment:
                                    currentResult.treatment
                            },
                            westernDiagnoses:
                                currentResult.westernDiagnoses,
                            tcmDiagnosis: {
                                disease:
                                    currentResult.tcmDiagnosis.disease,
                                syndrome:
                                    currentResult.tcmDiagnosis.syndrome,
                                basis:
                                    currentResult.tcmDiagnosis.basis
                            }
                        },
                        nonEmptyFields:
                            nonEmptyFields.concat(
                                hasTcmBasis
                                    ? ['tcmDiagnosis.basis']
                                    : []
                            )
                    },
                    6200
                );

            const polished =
                normalizeGenerated(
                    raw
                );

            const updated =
                resultFromEditors(
                    modal
                );

            const changedFields = [];

            polishFieldKeys.forEach(function (key) {
                const originalValue =
                    compactText(
                        currentResult[key]
                    );
                const polishedValue =
                    compactText(
                        polished[key]
                    );

                if (
                    originalValue &&
                    polishedValue
                ) {
                    updated[key] =
                        polishedValue;

                    if (
                        polishedValue !==
                        originalValue
                    ) {
                        changedFields.push(
                            FIELD_DEFINITIONS[key]
                                ? FIELD_DEFINITIONS[key].title
                                : key
                        );
                    }
                }
                else {
                    updated[key] =
                        originalValue;
                }
            });

            updated.tcmDiagnosis = {
                disease:
                    currentResult.tcmDiagnosis.disease,
                syndrome:
                    currentResult.tcmDiagnosis.syndrome,
                basis:
                    currentResult.tcmDiagnosis.basis
            };

            if (hasTcmBasis) {
                const polishedBasis =
                    compactText(
                        polished.tcmDiagnosis &&
                        polished.tcmDiagnosis.basis
                    );

                if (polishedBasis) {
                    if (
                        polishedBasis !==
                        compactText(
                            currentResult.tcmDiagnosis.basis
                        )
                    ) {
                        changedFields.push(
                            '辨证依据'
                        );
                    }

                    updated.tcmDiagnosis.basis =
                        polishedBasis;
                }
            }

            /*
             * 诊断和既有建议始终使用润色前的内容，避免模型越权修改。
             */
            updated.westernDiagnoses =
                currentResult.westernDiagnoses;
            updated.medicationAdvice =
                currentResult.medicationAdvice;
            updated.testAdvice =
                currentResult.testAdvice;
            updated.rehabilitationAdvice =
                currentResult.rehabilitationAdvice;
            updated.riskAlerts =
                currentResult.riskAlerts;
            updated.missingInformation =
                currentResult.missingInformation;
            updated.recordType =
                currentResult.recordType;

            state.generated =
                updated;

            renderGenerated(
                state.generated
            );

            if (!changedFields.length) {
                showMessage(
                    'AI已完成润色检查，但未发现需要改写的内容。原文保持不变。',
                    'warning'
                );
                return;
            }

            showMessage(
                'AI润色完成：' +
                changedFields.join('、') +
                '。\n仅更新本助手预览区；空项、诊断名称、诊断编码、中医病名和中医证候均未修改，请医师继续核对后再引用到页面。',
                'success'
            );
        }
        catch (error) {
            showMessage(
                error.message,
                'error'
            );
        }
        finally {
            setBusy(
                false,
                ''
            );
        }
    }

    function openAuditResultSection(modal) {
        if (!modal) {
            return;
        }

        const section =
            modal.querySelector(
                '[data-section-key="audit"]'
            );

        if (!section) {
            return;
        }

        setSectionCollapsed(
            section,
            false
        );

        setTimeout(
            () => {
                try {
                    section.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest'
                    });
                }
                catch (error) {
                    section.scrollIntoView(false);
                }
            },
            60
        );
    }

    async function previewAuditGeneratedRecord() {
        const modal =
            modalElement();

        if (
            !modal ||
            state.busy
        ) {
            return;
        }

        const settings =
            settingsFromModal(modal);

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showMessage(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        const previewRecord =
            resultFromEditors(modal);

        const previewText =
            buildFullRecord(
                previewRecord
            );

        if (!compactText(previewText)) {
            showMessage(
                '病历生成框中没有可预审核的内容。',
                'warning'
            );
            return;
        }

        const originalSource =
            compactText(
                modal.querySelector(
                    '.outpatient-ai-source'
                ).value
            ) ||
            pageSnapshotText(
                state.sourceRecord ||
                readCurrentRecord()
            );

        const systemPrompt = [
            '你是中国医疗机构门诊病历生成结果预审核工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '审核对象是门诊助手“病历生成结果”编辑区中的全部内容，不是直接审核医院网页。',
            '审核结果仅供执业医师人工复核，不得自动修改、保存、签名、删除、选择诊断或开立处方。',
            '必须逐项审核：主诉、现病史、既往史、过敏史、月经史、查体、辅助检查、处理、西医诊断、中医病名、中医证候、辨证依据。',
            '重点检查：与原始资料是否一致、是否存在无依据新增、主诉与现病史是否对应、时间顺序、医学术语、病历结构、前后矛盾、查体和辅助检查是否被虚构、诊断依据、中医病名和证候是否对应、辨证依据是否具备四诊、处理是否与诊断相符。',
            'revisionAdvice必须覆盖上述每一个项目。每条使用“项目名：现状判断；建议填写内容或书写要点；仍需核实的信息”的格式，具体到应写哪些内容和点。',
            '资料不足时只能指出待询问或待核实内容，不得自行补造疾病史、阴性症状、体征、检查结果、舌象、脉象、诊断编码或治疗事实。',
            'revisedRecord只能在不新增医学事实的前提下规范结构和语言；无法安全修订的字段保留原文或留空。',
            'JSON结构必须为：',
            '{"riskLevel":"low|medium|high","summary":"","problems":[],"factualAdditions":[],"contradictions":[],"missingInformation":[],"revisionAdvice":[],"revisedRecord":{"chiefComplaint":"","presentIllness":"","pastHistory":"","menstrualHistory":"","allergyHistory":"","physicalExam":"","auxiliaryExam":"","treatment":""},"westernDiagnoses":[],"tcmDiagnosis":{"disease":"","syndrome":"","basis":""}}'
        ].join('\n');

        setBusy(
            true,
            'preview-audit'
        );

        showMessage(
            '正在预审核病历生成框中的全部内容……',
            'normal'
        );

        try {
            const raw =
                await aiRequest(
                    settings.apiKey,
                    settings.model,
                    systemPrompt,
                    {
                        physicianAuditFocus:
                            settings.prompt,
                        originalPatientInformation:
                            originalSource,
                        generatedPreviewRecord:
                            previewRecord,
                        generatedPreviewText:
                            previewText
                    },
                    7600
                );

            state.audit =
                normalizeAudit(raw);

            renderAudit(
                state.audit
            );

            openAuditResultSection(
                modal
            );

            showMessage(
                '生成结果预审核完成。已在“病历AI审核结果”中给出逐项填写建议；不会自动改写或保存。',
                state.audit.riskLevel ===
                    'low'
                    ? 'success'
                    : 'warning'
            );
        }
        catch (error) {
            showMessage(
                error.message,
                'error'
            );
        }
        finally {
            setBusy(
                false,
                ''
            );
        }
    }

    async function auditCurrentRecord() {
        const modal =
            modalElement();

        if (
            !modal ||
            state.busy
        ) {
            return;
        }

        const settings =
            settingsFromModal(
                modal
            );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showMessage(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        const sourceRecord =
            readCurrentRecord();

        const sourceText =
            pageSnapshotText(
                sourceRecord
            );

        if (!sourceText) {
            showMessage(
                '当前页面没有识别到可审核的病历内容。',
                'warning'
            );
            return;
        }

        const systemPrompt = [
            '你是中国医疗机构门诊病历质量审核辅助工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '审核内容仅供执业医师人工复核，不得自动修改、保存、签名、删除或开药。',
            '重点审核：主诉与现病史是否对应、时间逻辑、医学术语、病历结构、前后矛盾、无依据新增、遗漏的重要信息、查体和辅助检查是否被虚构、诊断是否有依据、中医辨证是否缺少四诊、处理建议是否与诊断相符。',
            '不得因资料缺少而自行补写事实。',
            'revisedRecord只能在不新增医学事实的前提下整理和润色现有内容。',
            'JSON结构必须为：',
            '{"riskLevel":"low|medium|high","summary":"","problems":[],"factualAdditions":[],"contradictions":[],"missingInformation":[],"revisionAdvice":[],"revisedRecord":{"chiefComplaint":"","presentIllness":"","pastHistory":"","menstrualHistory":"","allergyHistory":"","physicalExam":"","auxiliaryExam":"","treatment":""},"westernDiagnoses":[],"tcmDiagnosis":{"disease":"","syndrome":"","basis":""}}'
        ].join('\n');

        setBusy(
            true,
            'audit'
        );

        showMessage(
            '正在调用DeepSeek审核当前门诊病历……',
            'normal'
        );

        try {
            const raw =
                await aiRequest(
                    settings.apiKey,
                    settings.model,
                    systemPrompt,
                    {
                        physicianAuditFocus:
                            settings.prompt,
                        currentPageRecord:
                            sourceRecord,
                        recordText:
                            sourceText
                    },
                    6500
                );

            state.audit =
                normalizeAudit(
                    raw
                );

            renderAudit(
                state.audit
            );

            showMessage(
                '当前病历审核完成。审核结果不会自动修改页面。',
                state.audit.riskLevel === 'low'
                    ? 'success'
                    : 'warning'
            );
        }
        catch (error) {
            showMessage(
                error.message,
                'error'
            );
        }
        finally {
            setBusy(
                false,
                ''
            );
        }
    }

    async function fillCurrentPage() {
        const modal =
            modalElement();

        if (
            !modal ||
            state.busy
        ) {
            return;
        }

        const result =
            resultFromEditors(
                modal
            );

        const nonEmptyFields =
            Object.keys(
                FIELD_DEFINITIONS
            ).filter(key =>
                plain(
                    result[key]
                )
            );

        if (!nonEmptyFields.length) {
            showMessage(
                '预览区没有可引用的病历内容。',
                'warning'
            );
            return;
        }

        const confirmed =
            window.confirm(
                '确认将预览区内容写入当前门诊病历页面吗？\n\n' +
                '只写入主诉、现病史、既往史、月经史、过敏史、查体、处理和辅助检查等可识别字段。\n' +
                '不会点击“就诊保存”“结束就诊”或其他保存按钮。'
            );

        if (!confirmed) {
            return;
        }

        let successCount = 0;
        const failed = [];
        const usedControls =
            new Set();

        for (const key of nonEmptyFields) {
            const control =
                findFieldControl(key);

            const definition =
                FIELD_DEFINITIONS[key];

            if (
                !control ||
                usedControls.has(control)
            ) {
                failed.push(
                    definition.title
                );

                console.warn(
                    '[门诊助手] 未找到独立的页面字段：' +
                    definition.title
                );

                continue;
            }

            usedControls.add(
                control
            );

            const written =
                setControlValue(
                    control,
                    result[key]
                );

            if (written) {
                successCount += 1;

                console.log(
                    '[门诊助手] 已写入页面字段：' +
                    definition.title,
                    control
                );

                await sleep(80);
            }
            else {
                failed.push(
                    definition.title
                );
            }
        }

        const settings =
            settingsFromModal(
                modal
            );

        const diagnosisWriteStatus = [];

        if (settings.autoDiagnosis) {
            const firstWestern =
                result.westernDiagnoses &&
                result.westernDiagnoses[0]
                    ? plain(
                        result
                            .westernDiagnoses[0]
                            .name
                    )
                    : '';

            const tcmDiagnosis =
                result.tcmDiagnosis ||
                {};

            const tcmDisease =
                plain(
                    tcmDiagnosis.disease
                );

            const tcmSyndrome =
                plain(
                    tcmDiagnosis.syndrome
                );

            /*
             * 中医病名与中医证候使用两个独立检索框。
             * 先分别触发检索，再在西医诊断写入后无焦点恢复中医检索词，
             * 避免自动完成组件因切换焦点而清空。
             */
            if (tcmDisease) {
                const diseaseWritten =
                    await fillDiagnosisSearch(
                        '中医病名',
                        tcmDisease,
                        false,
                        true
                    );

                diagnosisWriteStatus.push(
                    '中医病名检索词：' +
                    (
                        diseaseWritten
                            ? '已发送'
                            : '发送失败'
                    )
                );
            }

            if (tcmSyndrome) {
                const syndromeWritten =
                    await fillDiagnosisSearch(
                        '中医证候',
                        tcmSyndrome,
                        !firstWestern,
                        true
                    );

                diagnosisWriteStatus.push(
                    '中医证候检索词：' +
                    (
                        syndromeWritten
                            ? '已发送'
                            : '发送失败'
                    )
                );
            }

            if (firstWestern) {
                const westernWritten =
                    await fillDiagnosisSearch(
                        '西医诊断',
                        firstWestern,
                        true
                    );

                diagnosisWriteStatus.push(
                    '西医诊断检索词：' +
                    (
                        westernWritten
                            ? '已发送'
                            : '发送失败'
                    )
                );
            }

            if (tcmDisease) {
                await fillDiagnosisSearch(
                    '中医病名',
                    tcmDisease,
                    false,
                    false
                );
            }

            if (tcmSyndrome) {
                await fillDiagnosisSearch(
                    '中医证候',
                    tcmSyndrome,
                    false,
                    false
                );
            }

            if (!firstWestern) {
                diagnosisWriteStatus.push(
                    '西医诊断检索词：AI结果为空'
                );
            }
        }

        showMessage(
            '已写入' +
            successCount +
            '个病历字段。' +
            (
                failed.length
                    ? (
                        '\n未识别字段：' +
                        failed.join('、')
                    )
                    : ''
            ) +
            (
                diagnosisWriteStatus.length
                    ? (
                        '\n' +
                        diagnosisWriteStatus.join(
                            '；'
                        )
                    )
                    : ''
            ) +
            '\n诊断检索框只发送检索词，不会自动选择候选诊断。请保持检索框焦点并人工选择正确项目。' +
            '\n请人工核对诊断、内容和格式后手动保存。',
            failed.length
                ? 'warning'
                : 'success'
        );
    }

    function loadPageRecordIntoSource() {
        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        const record =
            readCurrentRecord();

        const text =
            pageSnapshotText(
                record
            );

        setSourceEditorText(
            modal,
            text,
            'page'
        );

        state.lastGenerationFingerprint =
            '';

        showMessage(
            text
                ? '已读取当前页面可见病历和患者基本信息；下次生成将使用当前患者的新快照。'
                : '未读取到有效内容，请确认当前处于门诊“病历”标签页。',
            text
                ? 'success'
                : 'warning'
        );
    }

    function clearGenerated() {
        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        state.generated =
            null;
        state.audit =
            null;

        renderGenerated(
            null
        );
        renderAudit(
            null
        );

        modal.querySelector(
            '.outpatient-ai-use-revised'
        ).disabled =
            true;

        showMessage(
            '生成结果和审核结果已清空。',
            'normal'
        );
    }

    function resetPatientInformation() {
        const modal =
            modalElement();

        if (!modal) {
            return;
        }

        /*
         * 先废弃旧任务代次，再中止请求。
         * 这样旧请求即使延迟返回，也不会覆盖新患者内容。
         */
        state.resetSerial +=
            1;
        state.generationSerial +=
            1;

        const activeRequest =
            state.request;

        state.request =
            null;

        if (
            activeRequest &&
            typeof activeRequest.abort ===
                'function'
        ) {
            try {
                activeRequest.abort();
            }
            catch (error) {
                // 请求已结束时忽略。
            }
        }

        state.busy =
            false;
        state.taskType =
            '';
        state.generated =
            null;
        state.audit =
            null;
        state.sourceRecord =
            null;
        state.sourceMode =
            'unknown';
        state.sourceRevision +=
            1;
        state.lastGenerationFingerprint =
            '';

        /*
         * 仅清除患者相关内容。
         * API Key、模型、病历类型和医师自定义提示词继续保留。
         */
        setSourceEditorText(
            modal,
            '',
            'unknown'
        );

        renderGenerated(
            null
        );

        renderAudit(
            null
        );

        const revisedButton =
            modal.querySelector(
                '.outpatient-ai-use-revised'
            );

        if (revisedButton) {
            revisedButton.disabled =
                true;
        }

        setBusy(
            false,
            ''
        );

        showMessage(
            '患者资料、旧页面快照、生成结果、审核结果及残留生成状态均已重置。请粘贴新患者资料或重新读取当前页面后再生成。',
            'success'
        );

        const source =
            sourceEditor(
                modal
            );

        if (source) {
            try {
                source.focus({
                    preventScroll: true
                });
            }
            catch (error) {
                source.focus();
            }
        }
    }

    function useRevisedRecord() {
        if (
            !state.audit ||
            !state.audit.revisedRecord
        ) {
            showMessage(
                '当前没有可采用的审核修订稿。',
                'warning'
            );
            return;
        }

        state.generated =
            state.audit.revisedRecord;

        renderGenerated(
            state.generated
        );

        showMessage(
            '审核修订稿已加载到预览区，尚未写入页面。',
            'success'
        );
    }

    function stopAiTask() {
        if (
            state.request &&
            typeof state.request.abort === 'function'
        ) {
            state.request.abort();
        }

        state.request =
            null;
        setBusy(
            false,
            ''
        );

        showMessage(
            '已请求停止当前AI任务。',
            'warning'
        );
    }

    function sectionState() {
        const value =
            GM_getValue(
                KEYS.sectionCollapsed,
                {}
            );

        return (
            value &&
            typeof value === 'object'
                ? value
                : {}
        );
    }

    function setSectionCollapsed(
        section,
        collapsed
    ) {
        const key =
            section.dataset.sectionKey;

        section.classList.toggle(
            'collapsed',
            collapsed
        );

        const button =
            section.querySelector(
                '.outpatient-ai-toggle-section'
            );

        if (button) {
            button.textContent =
                collapsed
                    ? '展开'
                    : '折叠';
        }

        const states =
            sectionState();

        states[key] =
            collapsed;

        GM_setValue(
            KEYS.sectionCollapsed,
            states
        );
    }


    function chatWindowElement(
        modal
    ) {
        const root =
            modal ||
            modalElement();

        return root
            ? root.querySelector(
                '.outpatient-ai-chat-window'
            )
            : null;
    }

    function setChatStatus(
        modal,
        message,
        type
    ) {
        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const status =
            chatWindow.querySelector(
                '.outpatient-ai-chat-status'
            );

        if (!status) {
            return;
        }

        status.className =
            'outpatient-ai-chat-status ' +
            (
                type ||
                'normal'
            );

        status.textContent =
            String(
                message ||
                ''
            );
    }

    function renderChatMessages(
        modal
    ) {
        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const list =
            chatWindow.querySelector(
                '.outpatient-ai-chat-messages'
            );

        if (!list) {
            return;
        }

        list.innerHTML =
            '';

        if (
            !state.chatMessages.length
        ) {
            const empty =
                document.createElement(
                    'div'
                );

            empty.className =
                'outpatient-ai-chat-empty';

            empty.textContent =
                '尚无对话。可询问病历书写、鉴别诊断、检查解读、治疗思路或当前页面内容。';

            list.appendChild(
                empty
            );

            return;
        }

        const markdownOption =
            chatWindow.querySelector(
                '.outpatient-ai-chat-markdown'
            );

        const markdownEnabled =
            Boolean(
                markdownOption &&
                markdownOption.checked
            );

        const bubbleCopyOption =
            chatWindow.querySelector(
                '.outpatient-ai-chat-bubble-copy'
            );

        const bubbleCopyEnabled =
            Boolean(
                bubbleCopyOption &&
                bubbleCopyOption.checked
            );

        state.chatMessages
            .forEach(message => {
                const item =
                    document.createElement(
                        'div'
                    );

                item.className =
                    'outpatient-ai-chat-message ' +
                    (
                        message.role ===
                            'assistant'
                            ? 'assistant'
                            : 'user'
                    );

                const role =
                    document.createElement(
                        'div'
                    );

                role.className =
                    'outpatient-ai-chat-role';

                const roleName =
                    document.createElement(
                        'span'
                    );

                roleName.className =
                    'outpatient-ai-chat-role-name';

                roleName.textContent =
                    message.role ===
                        'assistant'
                        ? 'AI助手'
                        : '医师';

                const copyButton =
                    document.createElement(
                        'button'
                    );

                copyButton.type =
                    'button';

                copyButton.className =
                    'outpatient-ai-chat-copy secondary';

                copyButton.textContent =
                    '复制全部';

                copyButton.title =
                    '复制本条对话气泡的全部原始文本';

                copyButton.style.display =
                    bubbleCopyEnabled
                        ? ''
                        : 'none';

                copyButton.disabled =
                    !String(
                        message.content ||
                        ''
                    );

                copyButton.addEventListener(
                    'click',
                    async event => {
                        event.preventDefault();
                        event.stopPropagation();

                        const originalText =
                            copyButton.textContent;

                        try {
                            await copyText(
                                String(
                                    message.content ||
                                    ''
                                )
                            );

                            copyButton.textContent =
                                '已复制';

                            setChatStatus(
                                modal,
                                (
                                    message.role ===
                                        'assistant'
                                        ? 'AI回答'
                                        : '医师消息'
                                ) +
                                '已全部复制。',
                                'success'
                            );
                        }
                        catch (error) {
                            copyButton.textContent =
                                '复制失败';

                            setChatStatus(
                                modal,
                                error.message,
                                'error'
                            );
                        }
                        finally {
                            window.setTimeout(
                                () => {
                                    if (
                                        copyButton &&
                                        copyButton.isConnected
                                    ) {
                                        copyButton.textContent =
                                            originalText;
                                    }
                                },
                                1200
                            );
                        }
                    }
                );

                role.appendChild(
                    roleName
                );

                role.appendChild(
                    copyButton
                );

                const content =
                    document.createElement(
                        'div'
                    );

                content.className =
                    'outpatient-ai-chat-content';

                if (
                    message.role ===
                        'assistant' &&
                    markdownEnabled &&
                    message.streaming !==
                        true &&
                    message.complete !==
                        false
                ) {
                    content.classList.add(
                        'markdown'
                    );

                    /*
                     * 只在回答完整结束后执行一次Markdown渲染。
                     * 流式生成过程中始终使用普通文本。
                     */
                    content.innerHTML =
                        markdownToSafeHtml(
                            message.content ||
                            ''
                        );
                }
                else {
                    content.textContent =
                        String(
                            message.content ||
                            ''
                        );
                }

                item.appendChild(
                    role
                );

                item.appendChild(
                    content
                );

                list.appendChild(
                    item
                );
            });

        list.scrollTop =
            list.scrollHeight;
    }

    /*
     * 将流式回答限制在浏览器动画帧内刷新。
     * 生成期间始终以普通文本显示，避免每个token触发Markdown重排。
     */
    function scheduleStreamingChatRender(
        modal
    ) {
        if (
            state.chatRenderFrame
        ) {
            return;
        }

        state.chatRenderFrame =
            window.requestAnimationFrame(
                () => {
                    state.chatRenderFrame =
                        0;

                    renderChatMessages(
                        modal
                    );
                }
            );
    }

    function setChatBusy(
        modal,
        busy
    ) {
        state.chatBusy =
            Boolean(
                busy
            );

        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const send =
            chatWindow.querySelector(
                '.outpatient-ai-chat-send'
            );

        const stop =
            chatWindow.querySelector(
                '.outpatient-ai-chat-stop'
            );

        const clear =
            chatWindow.querySelector(
                '.outpatient-ai-chat-clear'
            );

        const input =
            chatWindow.querySelector(
                '.outpatient-ai-chat-input'
            );

        const includePage =
            chatWindow.querySelector(
                '.outpatient-ai-chat-include-page'
            );

        const markdown =
            chatWindow.querySelector(
                '.outpatient-ai-chat-markdown'
            );

        const enterToSend =
            chatWindow.querySelector(
                '.outpatient-ai-chat-enter-send'
            );

        const bubbleCopy =
            chatWindow.querySelector(
                '.outpatient-ai-chat-bubble-copy'
            );

        if (send) {
            send.disabled =
                state.chatBusy;

            send.textContent =
                state.chatBusy
                    ? '发送中……'
                    : '发送';
        }

        if (stop) {
            stop.disabled =
                !state.chatBusy;
        }

        if (clear) {
            clear.disabled =
                state.chatBusy;
        }

        if (input) {
            input.disabled =
                state.chatBusy;
        }

        if (includePage) {
            includePage.disabled =
                state.chatBusy;
        }

        if (markdown) {
            markdown.disabled =
                state.chatBusy;
        }

        if (enterToSend) {
            enterToSend.disabled =
                state.chatBusy;
        }

        if (bubbleCopy) {
            bubbleCopy.disabled =
                state.chatBusy;
        }
    }

    function keepChatWindowInViewport(
        chatWindow
    ) {
        if (!chatWindow) {
            return;
        }

        const rect =
            chatWindow
                .getBoundingClientRect();

        if (
            rect.width <= 0 ||
            rect.height <= 0
        ) {
            return;
        }

        const maximumLeft =
            Math.max(
                6,
                window.innerWidth -
                rect.width -
                6
            );

        const maximumTop =
            Math.max(
                6,
                window.innerHeight -
                rect.height -
                6
            );

        const left =
            Math.max(
                6,
                Math.min(
                    rect.left,
                    maximumLeft
                )
            );

        const top =
            Math.max(
                6,
                Math.min(
                    rect.top,
                    maximumTop
                )
            );

        chatWindow.style.left =
            Math.round(
                left
            ) +
            'px';

        chatWindow.style.top =
            Math.round(
                top
            ) +
            'px';

        chatWindow.style.right =
            'auto';

        chatWindow.style.bottom =
            'auto';

        chatWindow.style.transform =
            'none';
    }

    function initializeChatDragging(
        modal
    ) {
        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const header =
            chatWindow.querySelector(
                '.outpatient-ai-chat-header'
            );

        if (
            !header ||
            header.dataset.dragBound ===
                '1'
        ) {
            return;
        }

        header.dataset.dragBound =
            '1';

        header.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.target.closest(
                        'button'
                    )
                ) {
                    return;
                }

                if (
                    event.pointerType ===
                        'mouse' &&
                    event.button !== 0
                ) {
                    return;
                }

                const initialRect =
                    chatWindow
                        .getBoundingClientRect();

                chatWindow.style.left =
                    initialRect.left +
                    'px';

                chatWindow.style.top =
                    initialRect.top +
                    'px';

                chatWindow.style.right =
                    'auto';

                chatWindow.style.bottom =
                    'auto';

                chatWindow.style.transform =
                    'none';

                const startX =
                    event.clientX;

                const startY =
                    event.clientY;

                const pointerId =
                    event.pointerId;

                header.style.cursor =
                    'grabbing';

                try {
                    header.setPointerCapture(
                        pointerId
                    );
                }
                catch (error) {
                    // 浏览器不支持指针捕获时继续。
                }

                function onMove(
                    moveEvent
                ) {
                    if (
                        moveEvent.pointerId !==
                            pointerId
                    ) {
                        return;
                    }

                    const maximumLeft =
                        Math.max(
                            6,
                            window.innerWidth -
                            initialRect.width -
                            6
                        );

                    const maximumTop =
                        Math.max(
                            6,
                            window.innerHeight -
                            initialRect.height -
                            6
                        );

                    const left =
                        Math.max(
                            6,
                            Math.min(
                                initialRect.left +
                                moveEvent.clientX -
                                startX,
                                maximumLeft
                            )
                        );

                    const top =
                        Math.max(
                            6,
                            Math.min(
                                initialRect.top +
                                moveEvent.clientY -
                                startY,
                                maximumTop
                            )
                        );

                    chatWindow.style.left =
                        Math.round(
                            left
                        ) +
                        'px';

                    chatWindow.style.top =
                        Math.round(
                            top
                        ) +
                        'px';

                    moveEvent.preventDefault();
                }

                function finish(
                    finishEvent
                ) {
                    if (
                        finishEvent &&
                        finishEvent.pointerId !==
                            pointerId
                    ) {
                        return;
                    }

                    document.removeEventListener(
                        'pointermove',
                        onMove,
                        true
                    );

                    document.removeEventListener(
                        'pointerup',
                        finish,
                        true
                    );

                    document.removeEventListener(
                        'pointercancel',
                        finish,
                        true
                    );

                    header.style.cursor =
                        'move';

                    try {
                        header.releasePointerCapture(
                            pointerId
                        );
                    }
                    catch (error) {
                        // 未捕获时忽略。
                    }

                    keepChatWindowInViewport(
                        chatWindow
                    );
                }

                document.addEventListener(
                    'pointermove',
                    onMove,
                    true
                );

                document.addEventListener(
                    'pointerup',
                    finish,
                    true
                );

                document.addEventListener(
                    'pointercancel',
                    finish,
                    true
                );

                event.preventDefault();
            }
        );
    }

    function openChatWindow(
        modal
    ) {
        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const includePage =
            chatWindow.querySelector(
                '.outpatient-ai-chat-include-page'
            );

        if (includePage) {
            includePage.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatIncludePage,
                        true
                    )
                );
        }

        const markdown =
            chatWindow.querySelector(
                '.outpatient-ai-chat-markdown'
            );

        if (markdown) {
            markdown.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatMarkdown,
                        true
                    )
                );
        }

        const enterToSend =
            chatWindow.querySelector(
                '.outpatient-ai-chat-enter-send'
            );

        if (enterToSend) {
            enterToSend.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatEnterToSend,
                        false
                    )
                );
        }

        const bubbleCopy =
            chatWindow.querySelector(
                '.outpatient-ai-chat-bubble-copy'
            );

        if (bubbleCopy) {
            bubbleCopy.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatBubbleCopy,
                        true
                    )
                );
        }

        updateChatInputSendHint(
            modal
        );

        chatWindow.classList.add(
            'show'
        );

        chatWindow.setAttribute(
            'aria-hidden',
            'false'
        );

        renderChatMessages(
            modal
        );

        setChatBusy(
            modal,
            state.chatBusy
        );

        initializeChatDragging(
            modal
        );

        requestAnimationFrame(
            () => {
                keepChatWindowInViewport(
                    chatWindow
                );

                const input =
                    chatWindow.querySelector(
                        '.outpatient-ai-chat-input'
                    );

                if (
                    input &&
                    !state.chatBusy
                ) {
                    input.focus();
                }
            }
        );
    }

    function closeChatWindow(
        modal
    ) {
        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        chatWindow.classList.remove(
            'show'
        );

        chatWindow.setAttribute(
            'aria-hidden',
            'true'
        );
    }

    function stopChatRequest(
        modal
    ) {
        if (
            state.chatRequest &&
            typeof state.chatRequest.abort ===
                'function'
        ) {
            state.chatRequest.abort();
        }

        setChatStatus(
            modal,
            '正在停止AI对话请求……',
            'warning'
        );
    }

    function clearChatMessages(
        modal
    ) {
        if (
            state.chatMessages.length &&
            !window.confirm(
                '确定清空本次AI助手对话吗？'
            )
        ) {
            return;
        }

        state.chatMessages =
            [];

        renderChatMessages(
            modal
        );

        setChatStatus(
            modal,
            '对话已清空。聊天内容仅保留在当前页面内存中。',
            'normal'
        );
    }

    function currentPageContextForChat() {
        const record =
            readCurrentRecord();

        return pageSnapshotText(
            record
        );
    }

    async function sendChatMessage(
        modal
    ) {
        if (
            !modal ||
            state.chatBusy
        ) {
            return;
        }

        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const input =
            chatWindow.querySelector(
                '.outpatient-ai-chat-input'
            );

        const includePage =
            chatWindow.querySelector(
                '.outpatient-ai-chat-include-page'
            );

        const question =
            compactText(
                input
                    ? input.value
                    : ''
            );

        if (!question) {
            setChatStatus(
                modal,
                '请输入需要咨询的问题或指令。',
                'warning'
            );
            return;
        }

        const settings =
            settingsFromModal(
                modal
            );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            setChatStatus(
                modal,
                '请先配置AI API Key（门诊助手本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        const usePageContext =
            Boolean(
                includePage &&
                includePage.checked
            );

        GM_setValue(
            KEYS.chatIncludePage,
            usePageContext
        );

        state.chatMessages.push({
            role: 'user',
            content:
                question
        });

        if (input) {
            input.value =
                '';
        }

        renderChatMessages(
            modal
        );

        const systemPrompt = [
            '你是医疗机构门诊工作站中的AI对话辅助助手。',
            '回答对象为执业医师，内容用于临床文书和诊疗思路辅助，必须提示对关键诊断、用药、剂量、禁忌和检查结果进行人工核对。',
            '不得声称已替代医师作出诊断，不得自动保存病历、选择诊断、开立处方或执行页面操作。',
            '只能依据对话中提供的资料和可选的当前网页内容回答；资料不足时明确指出待补充信息，不得虚构生命体征、化验、影像、查体、舌象或脉象。',
            '回答使用中文，可根据问题采用分段或简短条目。'
        ].join('\n');

        const messages = [
            {
                role: 'system',
                content:
                    systemPrompt
            }
        ];

        if (usePageContext) {
            const pageContext =
                currentPageContextForChat();

            messages.push({
                role: 'system',
                content:
                    pageContext
                        ? (
                            '以下为当前门诊网页中脚本能够识别到的内容。仅作为本次回答背景，不得把缺失项目推断为正常或阴性：\n' +
                            pageContext
                        )
                        : '当前网页未识别到可用病历内容。'
            });
        }

        state.chatMessages
            .slice(
                -14
            )
            .forEach(message => {
                messages.push({
                    role:
                        message.role,
                    content:
                        message.content
                });
            });

        setChatBusy(
            modal,
            true
        );

        setChatStatus(
            modal,
            usePageContext
                ? '正在结合当前网页内容调用DeepSeek……'
                : '正在调用DeepSeek……',
            'normal'
        );

        const streamingMessage = {
            role: 'assistant',
            content: '',
            streaming: true,
            complete: false
        };

        state.chatMessages.push(
            streamingMessage
        );

        renderChatMessages(
            modal
        );

        try {
            const answer =
                await chatRequest(
                    settings.apiKey,
                    settings.model,
                    messages,
                    3200,
                    (
                        delta,
                        fullText
                    ) => {
                        streamingMessage.content =
                            fullText;

                        /*
                         * 回答过程中实时显示普通文本。
                         * 此阶段不解析Markdown。
                         */
                        scheduleStreamingChatRender(
                            modal
                        );
                    }
                );

            streamingMessage.content =
                answer;
            streamingMessage.streaming =
                false;
            streamingMessage.complete =
                true;

            /*
             * 完整回答结束后再统一刷新一次。
             * 开启Markdown时，本次刷新是唯一一次Markdown渲染。
             */
            renderChatMessages(
                modal
            );

            setChatStatus(
                modal,
                usePageContext
                    ? '回答完成；本次请求已附带当前网页可识别内容。'
                    : '回答完成；本次请求未附带当前网页内容。',
                'success'
            );
        }
        catch (error) {
            streamingMessage.streaming =
                false;
            streamingMessage.complete =
                false;

            if (
                !compactText(
                    streamingMessage.content
                )
            ) {
                const index =
                    state.chatMessages
                        .indexOf(
                            streamingMessage
                        );

                if (index >= 0) {
                    state.chatMessages.splice(
                        index,
                        1
                    );
                }
            }

            renderChatMessages(
                modal
            );

            setChatStatus(
                modal,
                error.message,
                'error'
            );
        }
        finally {
            setChatBusy(
                modal,
                false
            );

            if (input) {
                input.focus();
            }
        }
    }

    function updateChatInputSendHint(
        modal
    ) {
        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const input =
            chatWindow.querySelector(
                '.outpatient-ai-chat-input'
            );

        const enterToSend =
            chatWindow.querySelector(
                '.outpatient-ai-chat-enter-send'
            );

        if (!input) {
            return;
        }

        input.placeholder =
            enterToSend &&
            enterToSend.checked
                ? '输入问题或指令。Enter发送，Shift+Enter换行。'
                : '输入问题或指令。Ctrl+Enter发送，Enter换行。';
    }

    function initializeChatWindow(
        modal
    ) {
        const chatWindow =
            chatWindowElement(
                modal
            );

        if (!chatWindow) {
            return;
        }

        const includePage =
            chatWindow.querySelector(
                '.outpatient-ai-chat-include-page'
            );

        if (includePage) {
            includePage.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatIncludePage,
                        true
                    )
                );

            includePage.addEventListener(
                'change',
                () => {
                    GM_setValue(
                        KEYS.chatIncludePage,
                        includePage.checked
                    );

                    setChatStatus(
                        modal,
                        includePage.checked
                            ? '已开启：发送问题时附带当前网页可识别内容。'
                            : '已关闭：仅根据本次对话内容回答。',
                        'normal'
                    );
                }
            );
        }

        const markdown =
            chatWindow.querySelector(
                '.outpatient-ai-chat-markdown'
            );

        if (markdown) {
            markdown.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatMarkdown,
                        true
                    )
                );

            markdown.addEventListener(
                'change',
                () => {
                    GM_setValue(
                        KEYS.chatMarkdown,
                        markdown.checked
                    );

                    renderChatMessages(
                        modal
                    );

                    setChatStatus(
                        modal,
                        markdown.checked
                            ? 'Markdown显示已开启：生成时实时显示普通文本，完成后统一渲染一次。'
                            : 'Markdown显示已关闭：回答按原始纯文本显示。',
                        'normal'
                    );
                }
            );
        }

        const enterToSend =
            chatWindow.querySelector(
                '.outpatient-ai-chat-enter-send'
            );

        if (enterToSend) {
            enterToSend.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatEnterToSend,
                        false
                    )
                );

            enterToSend.addEventListener(
                'change',
                () => {
                    GM_setValue(
                        KEYS.chatEnterToSend,
                        enterToSend.checked
                    );

                    updateChatInputSendHint(
                        modal
                    );

                    setChatStatus(
                        modal,
                        enterToSend.checked
                            ? '已开启回车直接发送：Enter发送，Shift+Enter换行。'
                            : '已关闭回车直接发送：Ctrl+Enter发送，Enter正常换行。',
                        'normal'
                    );
                }
            );
        }

        const bubbleCopy =
            chatWindow.querySelector(
                '.outpatient-ai-chat-bubble-copy'
            );

        if (bubbleCopy) {
            bubbleCopy.checked =
                Boolean(
                    GM_getValue(
                        KEYS.chatBubbleCopy,
                        true
                    )
                );

            bubbleCopy.addEventListener(
                'change',
                () => {
                    GM_setValue(
                        KEYS.chatBubbleCopy,
                        bubbleCopy.checked
                    );

                    renderChatMessages(
                        modal
                    );

                    setChatStatus(
                        modal,
                        bubbleCopy.checked
                            ? '气泡复制已开启：每条医师消息和AI回答均显示“复制全部”。'
                            : '气泡复制已关闭：对话气泡不再显示复制按钮。',
                        'normal'
                    );
                }
            );
        }

        updateChatInputSendHint(
            modal
        );

        chatWindow.querySelectorAll(
            '.outpatient-ai-chat-close'
        ).forEach(button => {
            button.addEventListener(
                'click',
                () => {
                    closeChatWindow(
                        modal
                    );
                }
            );
        });

        chatWindow.querySelector(
            '.outpatient-ai-chat-send'
        ).addEventListener(
            'click',
            () => {
                sendChatMessage(
                    modal
                );
            }
        );

        chatWindow.querySelector(
            '.outpatient-ai-chat-stop'
        ).addEventListener(
            'click',
            () => {
                stopChatRequest(
                    modal
                );
            }
        );

        chatWindow.querySelector(
            '.outpatient-ai-chat-clear'
        ).addEventListener(
            'click',
            () => {
                clearChatMessages(
                    modal
                );
            }
        );

        const input =
            chatWindow.querySelector(
                '.outpatient-ai-chat-input'
            );

        input.addEventListener(
            'keydown',
            event => {
                if (
                    event.key !==
                    'Enter' ||
                    event.isComposing ||
                    event.keyCode === 229
                ) {
                    return;
                }

                const enterSendOption =
                    chatWindow.querySelector(
                        '.outpatient-ai-chat-enter-send'
                    );

                const enterDirectly =
                    Boolean(
                        enterSendOption &&
                        enterSendOption.checked
                    );

                const shouldSend =
                    enterDirectly
                        ? !event.shiftKey
                        : (
                            event.ctrlKey ||
                            event.metaKey
                        );

                if (!shouldSend) {
                    return;
                }

                event.preventDefault();

                sendChatMessage(
                    modal
                );
            }
        );

        initializeChatDragging(
            modal
        );

        renderChatMessages(
            modal
        );

        setChatBusy(
            modal,
            false
        );
    }


    /******************************************************************
     * 门诊病历模板与门诊医嘱开立
     *
     * 本模块仅加入v1.5.6，不包含v1.5.7及之后的批量插入诊断逻辑。
     * 医嘱自动执行采用可见DOM交互，不调用医院后台接口。
     ******************************************************************/

    const OUTPATIENT_ORDER_MODULES = [
        '西药处方',
        '中药(新)',
        '康复处方',
        '常规项目',
        '耗材',
        '检验',
        '检查'
    ];

    const OUTPATIENT_ORDER_TAB_ALIASES = {
        '西药处方': ['西药处方', '西药'],
        '中药(新)': ['中药(新)', '中药'],
        '康复处方': ['康复处方', '康复医嘱', '康复'],
        '常规项目': ['常规项目', '项目'],
        '耗材': ['耗材'],
        '检验': ['检验'],
        '检查': ['检查']
    };

    function safeJsonParse(value, fallback) {
        try {
            return JSON.parse(String(value || ''));
        }
        catch (error) {
            return fallback;
        }
    }

    function recordTemplateList() {
        const value = GM_getValue(KEYS.recordTemplates, []);
        const list = Array.isArray(value)
            ? value
            : safeJsonParse(value, []);

        return Array.isArray(list)
            ? list.filter(item => item && plain(item.name) && item.record)
            : [];
    }

    function saveRecordTemplateList(list) {
        GM_setValue(
            KEYS.recordTemplates,
            Array.isArray(list) ? list : []
        );
    }

    function createRecordTemplateName(record) {
        const chief = plain(record && record.chiefComplaint);
        const firstDiagnosis = record && record.westernDiagnoses && record.westernDiagnoses[0]
            ? plain(record.westernDiagnoses[0].name)
            : '';
        const date = new Date();
        const stamp = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');

        return plain(firstDiagnosis || chief || '门诊病历模板') + ' ' + stamp;
    }

    function applyRecordTemplateRecord(modal, record) {
        if (!modal || !record) {
            return;
        }

        const normalized = normalizeGenerated(record);
        state.generated = normalized;
        renderGenerated(normalized);
        showMessage('病历模板已引用到编辑区，尚未写入医院页面。', 'success');
    }

    function saveCurrentRecordAsTemplate(modal) {
        const record = resultFromEditors(modal);
        const hasContent = Object.keys(FIELD_DEFINITIONS).some(key => plain(record[key])) ||
            record.westernDiagnoses.length ||
            plain(record.tcmDiagnosis.disease) ||
            plain(record.tcmDiagnosis.syndrome) ||
            plain(record.tcmDiagnosis.basis);

        if (!hasContent) {
            showMessage('当前病历编辑区为空，不能存为模板。', 'warning');
            return;
        }

        const suggested = createRecordTemplateName(record);
        const name = plain(window.prompt('请输入模板名称：', suggested));

        if (!name) {
            return;
        }

        const list = recordTemplateList();
        const existingIndex = list.findIndex(item => plain(item.name) === name);

        if (existingIndex >= 0) {
            const overwrite = window.confirm('已存在同名模板“' + name + '”，是否覆盖？');
            if (!overwrite) {
                return;
            }
        }

        const item = {
            id: existingIndex >= 0
                ? list[existingIndex].id
                : 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name,
            updatedAt: new Date().toISOString(),
            record
        };

        if (existingIndex >= 0) {
            list.splice(existingIndex, 1, item);
        }
        else {
            list.unshift(item);
        }

        saveRecordTemplateList(list);
        renderRecordTemplateManager(modal);
        showMessage('病历模板“' + name + '”已保存。', 'success');
    }

    function downloadTextFile(filename, content) {
        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openRecordTemplateManager(modal) {
        const manager = modal.querySelector('.outpatient-ai-template-manager');
        if (!manager) {
            return;
        }
        renderRecordTemplateManager(modal);

        /*
         * 不再使用通用的show类。医院页面自身也定义了.show，且部分规则
         * 带!important，会把模板窗口强制改成block并定位到左上角。
         */
        manager.dataset.open = 'true';
        manager.setAttribute('aria-hidden', 'false');
    }

    function closeRecordTemplateManager(modal) {
        const manager = modal.querySelector('.outpatient-ai-template-manager');
        if (manager) {
            delete manager.dataset.open;
            manager.setAttribute('aria-hidden', 'true');
        }
    }

    function renderRecordTemplateManager(modal) {
        const listBox = modal && modal.querySelector('.outpatient-ai-template-list');
        if (!listBox) {
            return;
        }

        const list = recordTemplateList();
        if (!list.length) {
            listBox.innerHTML = '<div class="outpatient-ai-template-empty">尚未保存病历模板。</div>';
            return;
        }

        listBox.innerHTML = list.map(item => {
            const record = item.record || {};
            const diagnosis = record.westernDiagnoses && record.westernDiagnoses[0]
                ? record.westernDiagnoses[0].name
                : '';
            const summary = plain(record.chiefComplaint || diagnosis || record.presentIllness || '').slice(0, 90);
            const time = plain(item.updatedAt).replace('T', ' ').slice(0, 16);
            return `
<div class="outpatient-ai-template-card" data-template-id="${escapeHtml(item.id)}">
  <div class="outpatient-ai-template-card-main">
    <div class="outpatient-ai-template-card-name">${escapeHtml(item.name)}</div>
    <div class="outpatient-ai-template-card-summary">${escapeHtml(summary || '未填写摘要')}</div>
    <div class="outpatient-ai-template-card-time">最后更新：${escapeHtml(time || '未知')}</div>
  </div>
  <div class="outpatient-ai-template-card-actions">
    <button type="button" data-template-action="apply">引用</button>
    <button type="button" data-template-action="overwrite" class="secondary">覆盖</button>
    <button type="button" data-template-action="rename" class="secondary">重命名</button>
    <button type="button" data-template-action="delete" class="danger">删除</button>
  </div>
</div>`;
        }).join('');
    }

    function handleRecordTemplateAction(modal, event) {
        const button = event.target.closest('[data-template-action]');
        const card = event.target.closest('.outpatient-ai-template-card');
        if (!button || !card) {
            return;
        }

        const id = card.dataset.templateId;
        const action = button.dataset.templateAction;
        const list = recordTemplateList();
        const index = list.findIndex(item => String(item.id) === String(id));
        if (index < 0) {
            renderRecordTemplateManager(modal);
            return;
        }

        const item = list[index];
        if (action === 'apply') {
            applyRecordTemplateRecord(modal, item.record);
            closeRecordTemplateManager(modal);
            return;
        }

        if (action === 'overwrite') {
            if (!window.confirm('用当前病历编辑区覆盖模板“' + item.name + '”？')) {
                return;
            }
            item.record = resultFromEditors(modal);
            item.updatedAt = new Date().toISOString();
            saveRecordTemplateList(list);
            renderRecordTemplateManager(modal);
            showMessage('模板“' + item.name + '”已覆盖。', 'success');
            return;
        }

        if (action === 'rename') {
            const nextName = plain(window.prompt('请输入新的模板名称：', item.name));
            if (!nextName || nextName === item.name) {
                return;
            }
            if (list.some((other, otherIndex) => otherIndex !== index && plain(other.name) === nextName)) {
                window.alert('已存在同名模板。');
                return;
            }
            item.name = nextName;
            item.updatedAt = new Date().toISOString();
            saveRecordTemplateList(list);
            renderRecordTemplateManager(modal);
            return;
        }

        if (action === 'delete') {
            if (!window.confirm('确定删除模板“' + item.name + '”？')) {
                return;
            }
            list.splice(index, 1);
            saveRecordTemplateList(list);
            renderRecordTemplateManager(modal);
            showMessage('病历模板已删除。', 'success');
        }
    }

    function exportRecordTemplates() {
        const payload = {
            type: 'medical-outpatient-record-templates',
            version: 1,
            exportedAt: new Date().toISOString(),
            templates: recordTemplateList()
        };
        downloadTextFile(
            '门诊病历模板_' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify(payload, null, 2)
        );
    }

    function importRecordTemplates(modal, file) {
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || ''));
                const incoming = Array.isArray(parsed)
                    ? parsed
                    : parsed.templates;
                if (!Array.isArray(incoming)) {
                    throw new Error('文件中没有templates数组');
                }
                const current = recordTemplateList();
                incoming.forEach(raw => {
                    if (!raw || !plain(raw.name) || !raw.record) {
                        return;
                    }
                    const name = plain(raw.name);
                    const existing = current.findIndex(item => plain(item.name) === name);
                    const normalized = {
                        id: raw.id || 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                        name,
                        updatedAt: raw.updatedAt || new Date().toISOString(),
                        record: raw.record
                    };
                    if (existing >= 0) {
                        current.splice(existing, 1, normalized);
                    }
                    else {
                        current.push(normalized);
                    }
                });
                saveRecordTemplateList(current);
                renderRecordTemplateManager(modal);
                showMessage('病历模板导入完成。', 'success');
            }
            catch (error) {
                showMessage('模板导入失败：' + error.message, 'error');
            }
        };
        reader.readAsText(file, 'utf-8');
    }


    function outpatientOrderTemplateList() {
        const value = GM_getValue(
            KEYS.outpatientOrderTemplates,
            []
        );

        const list = Array.isArray(value)
            ? value
            : safeJsonParse(value, []);

        return Array.isArray(list)
            ? list.filter(item =>
                item &&
                plain(item.name) &&
                Array.isArray(item.items)
            )
            : [];
    }

    function saveOutpatientOrderTemplateList(list) {
        GM_setValue(
            KEYS.outpatientOrderTemplates,
            Array.isArray(list) ? list : []
        );
    }

    function createOutpatientOrderTemplateName(items) {
        const names = (Array.isArray(items) ? items : [])
            .map(item => plain(item.name || item.searchName))
            .filter(Boolean)
            .slice(0, 2);

        const date = new Date();
        const stamp = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');

        return (
            names.join('＋') ||
            '门诊医嘱模板'
        ) + ' ' + stamp;
    }

    function currentOutpatientOrderItemsForTemplate(modal) {
        if (outpatientOrderEditorMode(modal) === 'json' && !commitOutpatientOrderJsonEditor(modal, true)) {
            return [];
        }
        return getOutpatientOrderRows(modal)
            .map(normalizeOutpatientOrderItem)
            .filter(item =>
                plain(item.name) ||
                plain(item.searchName) ||
                plain(item.secondaryName)
            );
    }

    function saveCurrentOutpatientOrdersAsTemplate(modal) {
        const items =
            currentOutpatientOrderItemsForTemplate(modal);

        if (!items.length) {
            showMessage(
                '当前门诊医嘱草稿为空，不能存为模板。',
                'warning'
            );
            return;
        }

        const suggested =
            createOutpatientOrderTemplateName(items);

        const name = plain(
            window.prompt(
                '请输入门诊医嘱模板名称：',
                suggested
            )
        );

        if (!name) {
            return;
        }

        const list =
            outpatientOrderTemplateList();

        const existingIndex =
            list.findIndex(item =>
                plain(item.name) === name
            );

        if (
            existingIndex >= 0 &&
            !window.confirm(
                '已存在同名门诊医嘱模板“' +
                name +
                '”，是否覆盖？'
            )
        ) {
            return;
        }

        const templateItem = {
            id: existingIndex >= 0
                ? list[existingIndex].id
                : 'order_tpl_' +
                    Date.now() +
                    '_' +
                    Math.random()
                        .toString(36)
                        .slice(2, 8),
            name,
            updatedAt: new Date().toISOString(),
            items
        };

        if (existingIndex >= 0) {
            list.splice(
                existingIndex,
                1,
                templateItem
            );
        } else {
            list.unshift(templateItem);
        }

        saveOutpatientOrderTemplateList(list);
        renderOutpatientOrderTemplateManager(modal);
        showMessage(
            '门诊医嘱模板“' + name + '”已保存。',
            'success'
        );
    }

    function openOutpatientOrderTemplateManager(modal) {
        const manager = modal.querySelector(
            '.outpatient-ai-order-template-manager'
        );

        if (!manager) {
            return;
        }

        renderOutpatientOrderTemplateManager(modal);
        manager.dataset.open = 'true';
        manager.setAttribute(
            'aria-hidden',
            'false'
        );
    }

    function closeOutpatientOrderTemplateManager(modal) {
        const manager = modal.querySelector(
            '.outpatient-ai-order-template-manager'
        );

        if (manager) {
            delete manager.dataset.open;
            manager.setAttribute(
                'aria-hidden',
                'true'
            );
        }
    }

    function outpatientOrderTemplateSummary(items) {
        const normalized =
            (Array.isArray(items) ? items : [])
                .map(normalizeOutpatientOrderItem);

        const moduleCounts = {};
        normalized.forEach(item => {
            moduleCounts[item.module] =
                (moduleCounts[item.module] || 0) + 1;
        });

        const moduleText = Object.keys(moduleCounts)
            .map(moduleName =>
                moduleName + moduleCounts[moduleName] + '项'
            )
            .join('、');

        const names = normalized
            .map(item => plain(item.name || item.searchName))
            .filter(Boolean)
            .slice(0, 4)
            .join('、');

        return [
            moduleText,
            names
        ].filter(Boolean).join('；');
    }

    function renderOutpatientOrderTemplateManager(modal) {
        const listBox = modal && modal.querySelector(
            '.outpatient-ai-order-template-list'
        );

        if (!listBox) {
            return;
        }

        const list =
            outpatientOrderTemplateList();

        if (!list.length) {
            listBox.innerHTML =
                '<div class="outpatient-ai-template-empty">尚未保存门诊医嘱模板。</div>';
            return;
        }

        listBox.innerHTML = list.map(item => {
            const summary =
                outpatientOrderTemplateSummary(item.items);

            const time = plain(item.updatedAt)
                .replace('T', ' ')
                .slice(0, 16);

            return `
<div class="outpatient-ai-template-card outpatient-ai-order-template-card" data-order-template-id="${escapeHtml(item.id)}">
  <div class="outpatient-ai-template-card-main">
    <div class="outpatient-ai-template-card-name">${escapeHtml(item.name)}</div>
    <div class="outpatient-ai-template-card-summary">${escapeHtml(summary || '未填写摘要')}</div>
    <div class="outpatient-ai-template-card-time">最后更新：${escapeHtml(time || '未知')}</div>
  </div>
  <div class="outpatient-ai-template-card-actions">
    <button type="button" data-order-template-action="apply">引用</button>
    <button type="button" data-order-template-action="overwrite" class="secondary">覆盖</button>
    <button type="button" data-order-template-action="rename" class="secondary">重命名</button>
    <button type="button" data-order-template-action="delete" class="danger">删除</button>
  </div>
</div>`;
        }).join('');
    }

    function handleOutpatientOrderTemplateAction(
        modal,
        event
    ) {
        const button = event.target.closest(
            '[data-order-template-action]'
        );

        const card = event.target.closest(
            '.outpatient-ai-order-template-card'
        );

        if (!button || !card) {
            return;
        }

        const id = card.dataset.orderTemplateId;
        const action = button.dataset.orderTemplateAction;
        const list = outpatientOrderTemplateList();
        const index = list.findIndex(item =>
            String(item.id) === String(id)
        );

        if (index < 0) {
            renderOutpatientOrderTemplateManager(modal);
            return;
        }

        const item = list[index];

        if (action === 'apply') {
            const current =
                currentOutpatientOrderItemsForTemplate(modal);

            if (
                current.length &&
                !window.confirm(
                    '引用模板“' +
                    item.name +
                    '”将替换当前门诊医嘱草稿，是否继续？'
                )
            ) {
                return;
            }

            renderOutpatientOrderRows(
                modal,
                item.items
            );

            closeOutpatientOrderTemplateManager(modal);
            showMessage(
                '门诊医嘱模板“' +
                item.name +
                '”已引用到草稿，请核对后再执行。',
                'success'
            );
            return;
        }

        if (action === 'overwrite') {
            const current =
                currentOutpatientOrderItemsForTemplate(modal);

            if (!current.length) {
                showMessage(
                    '当前门诊医嘱草稿为空，不能覆盖模板。',
                    'warning'
                );
                return;
            }

            if (!window.confirm(
                '用当前门诊医嘱草稿覆盖模板“' +
                item.name +
                '”？'
            )) {
                return;
            }

            item.items = current;
            item.updatedAt =
                new Date().toISOString();

            saveOutpatientOrderTemplateList(list);
            renderOutpatientOrderTemplateManager(modal);
            showMessage(
                '门诊医嘱模板“' +
                item.name +
                '”已覆盖。',
                'success'
            );
            return;
        }

        if (action === 'rename') {
            const nextName = plain(
                window.prompt(
                    '请输入新的模板名称：',
                    item.name
                )
            );

            if (!nextName || nextName === item.name) {
                return;
            }

            if (list.some((other, otherIndex) =>
                otherIndex !== index &&
                plain(other.name) === nextName
            )) {
                window.alert('已存在同名门诊医嘱模板。');
                return;
            }

            item.name = nextName;
            item.updatedAt =
                new Date().toISOString();

            saveOutpatientOrderTemplateList(list);
            renderOutpatientOrderTemplateManager(modal);
            return;
        }

        if (action === 'delete') {
            if (!window.confirm(
                '确定删除门诊医嘱模板“' +
                item.name +
                '”？'
            )) {
                return;
            }

            list.splice(index, 1);
            saveOutpatientOrderTemplateList(list);
            renderOutpatientOrderTemplateManager(modal);
            showMessage(
                '门诊医嘱模板已删除。',
                'success'
            );
        }
    }

    function exportOutpatientOrderTemplates() {
        const payload = {
            type: 'medical-outpatient-order-templates',
            version: 1,
            exportedAt: new Date().toISOString(),
            templates: outpatientOrderTemplateList()
        };

        downloadTextFile(
            '门诊医嘱模板_' +
            new Date().toISOString().slice(0, 10) +
            '.json',
            JSON.stringify(payload, null, 2)
        );
    }

    function importOutpatientOrderTemplates(
        modal,
        file
    ) {
        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const parsed = JSON.parse(
                    String(reader.result || '')
                );

                const incoming = Array.isArray(parsed)
                    ? parsed
                    : parsed.templates;

                if (!Array.isArray(incoming)) {
                    throw new Error(
                        '文件中没有templates数组'
                    );
                }

                const current =
                    outpatientOrderTemplateList();

                incoming.forEach(raw => {
                    if (
                        !raw ||
                        !plain(raw.name) ||
                        !Array.isArray(raw.items)
                    ) {
                        return;
                    }

                    const name = plain(raw.name);
                    const existing = current.findIndex(item =>
                        plain(item.name) === name
                    );

                    const normalized = {
                        id: raw.id ||
                            'order_tpl_' +
                            Date.now() +
                            '_' +
                            Math.random()
                                .toString(36)
                                .slice(2, 8),
                        name,
                        updatedAt: raw.updatedAt ||
                            new Date().toISOString(),
                        items: raw.items
                            .map(normalizeOutpatientOrderItem)
                    };

                    if (existing >= 0) {
                        current.splice(
                            existing,
                            1,
                            normalized
                        );
                    } else {
                        current.push(normalized);
                    }
                });

                saveOutpatientOrderTemplateList(current);
                renderOutpatientOrderTemplateManager(modal);
                showMessage(
                    '门诊医嘱模板导入完成。',
                    'success'
                );
            }
            catch (error) {
                showMessage(
                    '门诊医嘱模板导入失败：' +
                    error.message,
                    'error'
                );
            }
        };

        reader.readAsText(
            file,
            'utf-8'
        );
    }


    function sharedKnowledgePlain(
        value
    ) {
        return String(
            value == null
                ? ''
                : value
        )
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .replace(/[ \t]+/g, ' ')
            .trim();
    }

    function normalizeSharedKnowledgeKey(
        value
    ) {
        return sharedKnowledgePlain(value)
            .replace(/[★☆*]/g, '')
            .replace(/[（）()【】\[\]{}]/g, '')
            .replace(/[\s·•・,，;；:：\/\\_-]+/g, '')
            .toLowerCase();
    }

    function westernDrugPinyinInitials(
        value
    ) {
        const source =
            sharedKnowledgePlain(value);

        if (!source) {
            return '';
        }

        const boundaries =
            '阿芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖昔压匝';

        const initials =
            'ABCDEFGHJKLMNOPQRSTWXYZ';

        let result = '';

        Array.from(source)
            .forEach(function (character) {
                if (/[a-z0-9]/i.test(character)) {
                    result += character.toUpperCase();
                    return;
                }

                if (
                    /[\s★☆*（）()【】\[\]{}·•・,，;；:：\/\\_\-+%.]/
                        .test(character)
                ) {
                    return;
                }

                let matched = '';

                for (
                    let index = boundaries.length - 1;
                    index >= 0;
                    index -= 1
                ) {
                    try {
                        if (
                            character.localeCompare(
                                boundaries[index],
                                'zh-CN',
                                {
                                    sensitivity: 'base'
                                }
                            ) >= 0
                        ) {
                            matched =
                                initials[index] || '';
                            break;
                        }
                    }
                    catch (error) {
                        if (
                            character.localeCompare(
                                boundaries[index]
                            ) >= 0
                        ) {
                            matched =
                                initials[index] || '';
                            break;
                        }
                    }
                }

                result += matched;
            });

        return result
            .replace(/[^A-Z0-9]/g, '');
    }

    function normalizeSharedAliasList(
        value
    ) {
        const source =
            Array.isArray(value)
                ? value
                : String(value || '')
                    .split(/[|｜、,，;；\n]+/);

        return source
            .map(sharedKnowledgePlain)
            .filter(Boolean);
    }

    function normalizeOutpatientSharedLibrary(
        raw
    ) {
        const source =
            raw &&
            typeof raw === 'object'
                ? raw
                : {};

        const sourceSettings =
            source.settings &&
            typeof source.settings === 'object'
                ? source.settings
                : {};

        return {
            builtinCatalogVersion:
                sharedKnowledgePlain(
                    source.builtinCatalogVersion
                ),
            builtinChargeCatalogVersion:
                sharedKnowledgePlain(
                    source.builtinChargeCatalogVersion
                ),
            settings: {
                enableTcmNameMapping:
                    Boolean(
                        sourceSettings
                            .enableTcmNameMapping
                    ),
                enableWesternDrugSuggestion:
                    Boolean(
                        sourceSettings
                            .enableWesternDrugSuggestion
                    ),
                enableWesternDrugPinyinInitials:
                    Boolean(
                        sourceSettings
                            .enableWesternDrugPinyinInitials
                    ),
                enableChargeItemSuggestion:
                    Boolean(
                        sourceSettings
                            .enableChargeItemSuggestion
                    ),
                enableChargeItemPinyinInitials:
                    Boolean(
                        sourceSettings
                            .enableChargeItemPinyinInitials
                    )
            },
            tcmMappings:
                (
                    Array.isArray(
                        source.tcmMappings
                    )
                        ? source.tcmMappings
                        : []
                )
                    .map(function (item) {
                        const value =
                            item &&
                            typeof item === 'object'
                                ? item
                                : {};

                        return {
                            from:
                                sharedKnowledgePlain(
                                    value.from ||
                                    value.source ||
                                    value.name
                                ),
                            to:
                                sharedKnowledgePlain(
                                    value.to ||
                                    value.target ||
                                    value.localName ||
                                    value.searchName
                                ),
                            aliases:
                                normalizeSharedAliasList(
                                    value.aliases ||
                                    value.otherNames ||
                                    []
                                ),
                            enabled:
                                value.enabled !== false
                        };
                    })
                    .filter(function (item) {
                        return item.from && item.to;
                    }),
            westernDrugs:
                (
                    Array.isArray(
                        source.westernDrugs
                    )
                        ? source.westernDrugs
                        : []
                )
                    .map(function (item) {
                        const value =
                            item &&
                            typeof item === 'object'
                                ? item
                                : {};

                        const name =
                            sharedKnowledgePlain(
                                value.name ||
                                value.drugName ||
                                value.genericName
                            );

                        const searchName =
                            sharedKnowledgePlain(
                                value.searchName ||
                                value.lookupName ||
                                value.mnemonic ||
                                value.pinyin ||
                                name
                            );

                        return {
                            name:
                                name || searchName,
                            searchName:
                                searchName || name,
                            specification:
                                sharedKnowledgePlain(
                                    value.specification ||
                                    value.spec
                                ),
                            unit:
                                sharedKnowledgePlain(
                                    value.unit
                                ),
                            manufacturer:
                                sharedKnowledgePlain(
                                    value.manufacturer ||
                                    value.factory
                                ),
                            code:
                                sharedKnowledgePlain(
                                    value.code ||
                                    value.drugCode
                                ),
                            aliases:
                                normalizeSharedAliasList(
                                    value.aliases ||
                                    value.otherNames ||
                                    []
                                ),
                            note:
                                sharedKnowledgePlain(
                                    value.note ||
                                    value.remark
                                ),
                            enabled:
                                value.enabled !== false
                        };
                    })
                    .filter(function (item) {
                        return item.name || item.searchName;
                    }),
            chargeItems:
                (
                    Array.isArray(
                        source.chargeItems
                    )
                        ? source.chargeItems
                        : []
                )
                    .map(function (item) {
                        const value =
                            item &&
                            typeof item === 'object'
                                ? item
                                : {};

                        const name =
                            sharedKnowledgePlain(
                                value.name ||
                                value.chargeItemName ||
                                value.itemName ||
                                value.projectName
                            );

                        let unit =
                            sharedKnowledgePlain(
                                value.unit ||
                                value.billingUnit ||
                                value.pricingUnit
                            );

                        if (unit === '22') {
                            unit = '';
                        }

                        return {
                            name: name,
                            unit: unit,
                            price:
                                value.price == null
                                    ? (
                                        value.unitPrice == null
                                            ? ''
                                            : sharedKnowledgePlain(
                                                value.unitPrice
                                            )
                                    )
                                    : sharedKnowledgePlain(
                                        value.price
                                    ),
                            enabled:
                                value.enabled !== false
                        };
                    })
                    .filter(function (item) {
                        return item.name;
                    })
        };
    }


    let outpatientSharedLibraryCache =
        null;

    let outpatientSharedLibraryRawCache =
        '';

    function loadOutpatientSharedLibrary() {
        const rawText =
            localStorage.getItem(
                SHARED_LIBRARY_STORAGE_KEY
            ) ||
            '{}';

        if (
            outpatientSharedLibraryCache &&
            rawText ===
                outpatientSharedLibraryRawCache
        ) {
            return outpatientSharedLibraryCache;
        }

        try {
            outpatientSharedLibraryCache =
                normalizeOutpatientSharedLibrary(
                    JSON.parse(
                        rawText
                    )
                );
        }
        catch (error) {
            outpatientSharedLibraryCache =
                normalizeOutpatientSharedLibrary({});
        }

        outpatientSharedLibraryRawCache =
            rawText;

        return outpatientSharedLibraryCache;
    }


    function resolveSharedTcmName(
        value
    ) {
        const original =
            sharedKnowledgePlain(value)
                .replace(/^[★☆*]+\s*/, '');

        const library =
            loadOutpatientSharedLibrary();

        if (
            !original ||
            !library.settings
                .enableTcmNameMapping
        ) {
            return original;
        }

        const key =
            normalizeSharedKnowledgeKey(
                original
            );

        const matched =
            library.tcmMappings
                .find(function (item) {
                    if (
                        !item ||
                        item.enabled === false
                    ) {
                        return false;
                    }

                    return [
                        item.from,
                        item.to
                    ]
                        .concat(
                            item.aliases || []
                        )
                        .some(function (name) {
                            return (
                                normalizeSharedKnowledgeKey(
                                    name
                                ) === key
                            );
                        });
                });

        return matched
            ? matched.to
            : original;
    }

    function westernDrugSuggestionEnabled() {
        return Boolean(
            loadOutpatientSharedLibrary()
                .settings
                .enableWesternDrugSuggestion
        );
    }

    function westernDrugPinyinInitialsEnabled() {
        const library =
            loadOutpatientSharedLibrary();

        return Boolean(
            library.settings
                .enableWesternDrugSuggestion &&
            library.settings
                .enableWesternDrugPinyinInitials
        );
    }

    function sharedWesternDrugEntries() {
        const library =
            loadOutpatientSharedLibrary();

        return library.settings
            .enableWesternDrugSuggestion
                ? library.westernDrugs
                    .filter(function (item) {
                        return item.enabled !== false;
                    })
                : [];
    }

    function westernDrugNameCounts(
        entries
    ) {
        const counts =
            new Map();

        (
            Array.isArray(entries)
                ? entries
                : []
        ).forEach(function (item) {
            const key =
                normalizeSharedKnowledgeKey(
                    item &&
                    (
                        item.name ||
                        item.searchName
                    )
                );

            if (!key) {
                return;
            }

            counts.set(
                key,
                (
                    counts.get(key) ||
                    0
                ) +
                1
            );
        });

        return counts;
    }

    function westernDrugSuggestionValue(
        item,
        nameCounts
    ) {
        const name =
            sharedKnowledgePlain(
                item &&
                (
                    item.name ||
                    item.searchName
                )
            );

        if (!name) {
            return '';
        }

        const nameKey =
            normalizeSharedKnowledgeKey(
                name
            );

        const duplicateCount =
            nameCounts instanceof Map
                ? (
                    nameCounts.get(nameKey) ||
                    0
                )
                : 0;

        if (duplicateCount <= 1) {
            return name;
        }

        return [
            name,
            sharedKnowledgePlain(
                item.specification
            ),
            sharedKnowledgePlain(
                item.manufacturer
            ),
            sharedKnowledgePlain(
                item.code
            )
        ]
            .filter(Boolean)
            .join('｜');
    }

    function westernDrugPinyinSuggestionValue(
        item,
        nameCounts
    ) {
        const initials =
            westernDrugPinyinInitials(
                item &&
                (
                    item.name ||
                    item.searchName
                )
            );

        const normalValue =
            westernDrugSuggestionValue(
                item,
                nameCounts
            );

        if (!initials || !normalValue) {
            return '';
        }

        return initials +
            '｜' +
            normalValue;
    }

    function findSharedWesternDrug(
        value
    ) {
        const rawValue =
            sharedKnowledgePlain(
                value
            );

        const key =
            normalizeSharedKnowledgeKey(
                rawValue
            );

        if (!key) {
            return null;
        }

        const entries =
            sharedWesternDrugEntries();

        const nameCounts =
            westernDrugNameCounts(
                entries
            );

        /*
         * 同名不同规格时，datalist的value会携带“名称｜规格｜厂家｜编码”。
         * 先按完整显示值精确定位，再退回到名称、检索名、编码和别名匹配。
         */
        const exactDisplay =
            entries.find(function (item) {
                return (
                    sharedKnowledgePlain(
                        westernDrugSuggestionValue(
                            item,
                            nameCounts
                        )
                    ).toLowerCase() ===
                    rawValue.toLowerCase()
                );
            });

        if (exactDisplay) {
            return exactDisplay;
        }

        if (
            westernDrugPinyinInitialsEnabled()
        ) {
            const exactPinyinDisplay =
                entries.find(function (item) {
                    return (
                        sharedKnowledgePlain(
                            westernDrugPinyinSuggestionValue(
                                item,
                                nameCounts
                            )
                        ).toLowerCase() ===
                        rawValue.toLowerCase()
                    );
                });

            if (exactPinyinDisplay) {
                return exactPinyinDisplay;
            }

            const pinyinMatches =
                entries.filter(function (item) {
                    return [
                        item.name,
                        item.searchName
                    ]
                        .concat(
                            item.aliases || []
                        )
                        .some(function (candidate) {
                            return (
                                normalizeSharedKnowledgeKey(
                                    westernDrugPinyinInitials(
                                        candidate
                                    )
                                ) === key
                            );
                        });
                });

            if (pinyinMatches.length === 1) {
                return pinyinMatches[0];
            }
        }

        return entries.find(function (item) {
            return [
                item.name,
                item.searchName,
                item.code,
                item.specification,
                item.manufacturer
            ]
                .concat(
                    item.aliases || []
                )
                .some(function (candidate) {
                    return (
                        normalizeSharedKnowledgeKey(
                            candidate
                        ) === key
                    );
                });
        }) || null;
    }



    const CHARGE_ITEM_SUGGESTION_MODULES = [
        '康复处方',
        '常规项目',
        '检验',
        '检查'
    ];

    function chargeItemSuggestionEnabled() {
        return Boolean(
            loadOutpatientSharedLibrary()
                .settings
                .enableChargeItemSuggestion
        );
    }

    function chargeItemPinyinInitialsEnabled() {
        const library =
            loadOutpatientSharedLibrary();

        return Boolean(
            library.settings
                .enableChargeItemSuggestion &&
            library.settings
                .enableChargeItemPinyinInitials
        );
    }

    function sharedChargeItemEntries() {
        const library =
            loadOutpatientSharedLibrary();

        return library.settings
            .enableChargeItemSuggestion
                ? library.chargeItems
                    .filter(function (item) {
                        return item.enabled !== false;
                    })
                : [];
    }

    function chargeItemNameCounts(
        entries
    ) {
        const counts =
            new Map();

        (
            Array.isArray(entries)
                ? entries
                : []
        ).forEach(function (item) {
            const key =
                normalizeSharedKnowledgeKey(
                    item &&
                    item.name
                );

            if (!key) {
                return;
            }

            counts.set(
                key,
                (
                    counts.get(key) ||
                    0
                ) +
                1
            );
        });

        return counts;
    }

    function chargeItemSuggestionValue(
        item,
        nameCounts
    ) {
        const name =
            sharedKnowledgePlain(
                item &&
                item.name
            );

        if (!name) {
            return '';
        }

        const key =
            normalizeSharedKnowledgeKey(
                name
            );

        const duplicateCount =
            nameCounts instanceof Map
                ? (
                    nameCounts.get(key) ||
                    0
                )
                : 0;

        if (duplicateCount <= 1) {
            return name;
        }

        return [
            name,
            sharedKnowledgePlain(
                item.unit
            ),
            sharedKnowledgePlain(
                item.price
            )
        ]
            .filter(function (value) {
                return value !== '';
            })
            .join('｜');
    }

    function chargeItemPinyinSuggestionValue(
        item,
        nameCounts
    ) {
        const initials =
            westernDrugPinyinInitials(
                item &&
                item.name
            );

        const normalValue =
            chargeItemSuggestionValue(
                item,
                nameCounts
            );

        if (!initials || !normalValue) {
            return '';
        }

        return initials +
            '｜' +
            normalValue;
    }

    function findSharedChargeItem(
        value
    ) {
        const rawValue =
            sharedKnowledgePlain(
                value
            );

        const key =
            normalizeSharedKnowledgeKey(
                rawValue
            );

        if (!key) {
            return null;
        }

        const entries =
            sharedChargeItemEntries();

        const nameCounts =
            chargeItemNameCounts(
                entries
            );

        const exactDisplay =
            entries.find(function (item) {
                return (
                    sharedKnowledgePlain(
                        chargeItemSuggestionValue(
                            item,
                            nameCounts
                        )
                    ).toLowerCase() ===
                    rawValue.toLowerCase()
                );
            });

        if (exactDisplay) {
            return exactDisplay;
        }

        if (
            chargeItemPinyinInitialsEnabled()
        ) {
            const exactPinyinDisplay =
                entries.find(function (item) {
                    return (
                        sharedKnowledgePlain(
                            chargeItemPinyinSuggestionValue(
                                item,
                                nameCounts
                            )
                        ).toLowerCase() ===
                        rawValue.toLowerCase()
                    );
                });

            if (exactPinyinDisplay) {
                return exactPinyinDisplay;
            }

            const pinyinMatches =
                entries.filter(function (item) {
                    return (
                        normalizeSharedKnowledgeKey(
                            westernDrugPinyinInitials(
                                item.name
                            )
                        ) === key
                    );
                });

            if (pinyinMatches.length === 1) {
                return pinyinMatches[0];
            }
        }

        const exactNameMatches =
            entries.filter(function (item) {
                return (
                    normalizeSharedKnowledgeKey(
                        item.name
                    ) === key
                );
            });

        return exactNameMatches.length === 1
            ? exactNameMatches[0]
            : null;
    }


    function sharedKnowledgeStatusText() {
        const library =
            loadOutpatientSharedLibrary();

        return (
            '中药映射：' +
            (
                library.settings
                    .enableTcmNameMapping
                    ? '开'
                    : '关'
            ) +
            '（' +
            library.tcmMappings.length +
            '条）；西药联想：' +
            (
                library.settings
                    .enableWesternDrugSuggestion
                    ? '开'
                    : '关'
            ) +
            '（' +
            library.westernDrugs.length +
            '条，拼音' +
            (
                library.settings
                    .enableWesternDrugPinyinInitials
                    ? '开'
                    : '关'
            ) +
            '）；收费项目联想：' +
            (
                library.settings
                    .enableChargeItemSuggestion
                    ? '开'
                    : '关'
            ) +
            '（' +
            library.chargeItems.length +
            '条，拼音' +
            (
                library.settings
                    .enableChargeItemPinyinInitials
                    ? '开'
                    : '关'
            ) +
            '）；药品目录：' +
            (
                library.builtinCatalogVersion
                    ? '已加载'
                    : '未加载'
            ) +
            '；收费目录：' +
            (
                library.builtinChargeCatalogVersion
                    ? '已加载'
                    : '未加载'
            )
        );
    }


    function tcmStarPrefixEnabled() {
        return Boolean(GM_getValue(KEYS.outpatientOrderTcmStarPrefix, false));
    }

    function stripLeadingTcmStarPrefix(value) {
        return plain(value).replace(/^[★☆*]+\s*/, '');
    }

    function formatTcmSearchName(value, enabled) {
        const clean = stripLeadingTcmStarPrefix(value);
        if (!clean) {
            return '';
        }
        const mapped = resolveSharedTcmName(clean);
        return enabled ? '★' + mapped : mapped;
    }

    function applyTcmStarPrefixToOrderRows(modal, enabled) {
        if (!modal) {
            return;
        }
        modal.querySelectorAll('.outpatient-ai-order-row').forEach(row => {
            const moduleControl = row.querySelector('[data-order-field="module"]');
            const nameControl = row.querySelector('[data-order-field="name"]');
            const searchControl = row.querySelector('[data-order-field="searchName"]');
            if (!moduleControl || !searchControl || moduleControl.value !== '中药(新)') {
                return;
            }
            const source = plain(nameControl && nameControl.value) || plain(searchControl.value);
            searchControl.value = formatTcmSearchName(source, enabled);
            searchControl.dispatchEvent(new Event('input', { bubbles: true }));
            searchControl.dispatchEvent(new Event('change', { bubbles: true }));
        });
        saveOutpatientOrderDraft(modal);
    }


    function ensureWesternDrugDatalist(
        modal
    ) {
        if (!modal) {
            return null;
        }

        let datalist =
            modal.querySelector(
                '#' +
                WESTERN_DRUG_DATALIST_ID
            );

        if (!datalist) {
            datalist =
                document.createElement(
                    'datalist'
                );

            datalist.id =
                WESTERN_DRUG_DATALIST_ID;

            modal.appendChild(
                datalist
            );
        }

        return datalist;
    }

    function renderWesternDrugDatalist(
        modal
    ) {
        const datalist =
            ensureWesternDrugDatalist(
                modal
            );

        if (!datalist) {
            return;
        }

        const entries =
            sharedWesternDrugEntries();

        const nameCounts =
            westernDrugNameCounts(
                entries
            );

        const options = [];
        const seen = new Set();

        entries.forEach(function (item) {
            const optionValue =
                westernDrugSuggestionValue(
                    item,
                    nameCounts
                );

            const optionKey =
                sharedKnowledgePlain(
                    optionValue
                ).toLowerCase();

            if (
                !optionValue ||
                !optionKey ||
                seen.has(optionKey)
            ) {
                return;
            }

            seen.add(optionKey);

            const labelParts = [
                item.name !==
                    item.searchName
                    ? item.searchName
                    : '',
                item.specification,
                item.unit,
                item.manufacturer,
                item.code,
                (
                    item.aliases &&
                    item.aliases.length
                        ? item.aliases
                            .slice(0, 4)
                            .join('、')
                        : ''
                )
            ].filter(Boolean);

            options.push(
                '<option value="' +
                escapeHtml(
                    optionValue
                ) +
                '" label="' +
                escapeHtml(
                    labelParts.join('｜')
                ) +
                '"></option>'
            );

            if (
                westernDrugPinyinInitialsEnabled()
            ) {
                const pinyinValue =
                    westernDrugPinyinSuggestionValue(
                        item,
                        nameCounts
                    );

                const pinyinKey =
                    sharedKnowledgePlain(
                        pinyinValue
                    ).toLowerCase();

                if (
                    pinyinValue &&
                    pinyinKey &&
                    !seen.has(pinyinKey)
                ) {
                    seen.add(pinyinKey);

                    options.push(
                        '<option value="' +
                        escapeHtml(
                            pinyinValue
                        ) +
                        '" label="' +
                        escapeHtml(
                            '拼音首字母｜' +
                            labelParts.join('｜')
                        ) +
                        '"></option>'
                    );
                }
            }
        });

        datalist.innerHTML =
            options.join('');
    }

    function configureWesternDrugRowSuggestion(
        row
    ) {
        if (!row) {
            return;
        }

        const moduleControl =
            row.querySelector(
                '[data-order-field="module"]'
            );

        const nameControl =
            row.querySelector(
                '[data-order-field="name"]'
            );

        const searchControl =
            row.querySelector(
                '[data-order-field="searchName"]'
            );

        const enabled =
            Boolean(
                moduleControl &&
                moduleControl.value ===
                    '西药处方' &&
                westernDrugSuggestionEnabled()
            );

        [
            nameControl,
            searchControl
        ].forEach(function (control) {
            if (!control) {
                return;
            }

            if (enabled) {
                control.setAttribute(
                    'list',
                    WESTERN_DRUG_DATALIST_ID
                );

                control.setAttribute(
                    'autocomplete',
                    'off'
                );

                control.title =
                    westernDrugPinyinInitialsEnabled()
                        ? '输入医院药品名称、检索名、编码、别名或拼音首字母，可从共享联想库选择。'
                        : '输入医院药品名称、检索名、编码或别名，可从共享联想库选择。';
            }
            else {
                control.removeAttribute(
                    'list'
                );

                control.removeAttribute(
                    'title'
                );
            }
        });
    }

    function applyWesternDrugSuggestionToRow(
        row,
        sourceControl
    ) {
        if (
            !row ||
            !sourceControl ||
            !westernDrugSuggestionEnabled()
        ) {
            return false;
        }

        const moduleControl =
            row.querySelector(
                '[data-order-field="module"]'
            );

        if (
            !moduleControl ||
            moduleControl.value !==
                '西药处方'
        ) {
            return false;
        }

        const matched =
            findSharedWesternDrug(
                sourceControl.value
            );

        if (!matched) {
            return false;
        }

        const nameControl =
            row.querySelector(
                '[data-order-field="name"]'
            );

        const searchControl =
            row.querySelector(
                '[data-order-field="searchName"]'
            );

        if (nameControl) {
            nameControl.value =
                matched.name ||
                matched.searchName;
        }

        if (searchControl) {
            searchControl.value =
                matched.searchName ||
                matched.name;
        }

        return true;
    }


    function ensureChargeItemDatalist(
        modal
    ) {
        if (!modal) {
            return null;
        }

        let datalist =
            modal.querySelector(
                '#' +
                CHARGE_ITEM_DATALIST_ID
            );

        if (!datalist) {
            datalist =
                document.createElement(
                    'datalist'
                );

            datalist.id =
                CHARGE_ITEM_DATALIST_ID;

            modal.appendChild(
                datalist
            );
        }

        return datalist;
    }

    function renderChargeItemDatalist(
        modal
    ) {
        const datalist =
            ensureChargeItemDatalist(
                modal
            );

        if (!datalist) {
            return;
        }

        const entries =
            sharedChargeItemEntries();

        const nameCounts =
            chargeItemNameCounts(
                entries
            );

        const options = [];
        const seen = new Set();

        const pinyinEnabled =
            chargeItemPinyinInitialsEnabled();

        entries.forEach(function (item) {
            const optionValue =
                chargeItemSuggestionValue(
                    item,
                    nameCounts
                );

            const optionKey =
                sharedKnowledgePlain(
                    optionValue
                ).toLowerCase();

            if (
                !optionValue ||
                !optionKey ||
                seen.has(optionKey)
            ) {
                return;
            }

            seen.add(optionKey);

            const labelParts = [
                item.unit
                    ? '计价单位：' +
                        item.unit
                    : '',
                item.price !== ''
                    ? '单价：¥' +
                        item.price
                    : ''
            ].filter(Boolean);

            options.push(
                '<option value="' +
                escapeHtml(
                    optionValue
                ) +
                '" label="' +
                escapeHtml(
                    labelParts.join('｜')
                ) +
                '"></option>'
            );

            if (
                pinyinEnabled
            ) {
                const pinyinValue =
                    chargeItemPinyinSuggestionValue(
                        item,
                        nameCounts
                    );

                const pinyinKey =
                    sharedKnowledgePlain(
                        pinyinValue
                    ).toLowerCase();

                if (
                    pinyinValue &&
                    pinyinKey &&
                    !seen.has(pinyinKey)
                ) {
                    seen.add(pinyinKey);

                    options.push(
                        '<option value="' +
                        escapeHtml(
                            pinyinValue
                        ) +
                        '" label="' +
                        escapeHtml(
                            '拼音首字母' +
                            (
                                labelParts.length
                                    ? '｜' +
                                        labelParts.join('｜')
                                    : ''
                            )
                        ) +
                        '"></option>'
                    );
                }
            }
        });

        datalist.innerHTML =
            options.join('');
    }

    function configureChargeItemRowSuggestion(
        row
    ) {
        if (!row) {
            return;
        }

        const moduleControl =
            row.querySelector(
                '[data-order-field="module"]'
            );

        const moduleName =
            moduleControl
                ? moduleControl.value
                : '';

        const enabled =
            Boolean(
                CHARGE_ITEM_SUGGESTION_MODULES
                    .includes(
                        moduleName
                    ) &&
                chargeItemSuggestionEnabled()
            );

        const controls = [
            row.querySelector(
                '[data-order-field="name"]'
            )
        ];

        /*
         * 检验模块的“检索名”对应医院一级目录，不等于具体收费项目名，
         * 因此不把收费项目联想绑定到该字段，避免覆盖人工配置的一级目录。
         */
        if (moduleName !== '检验') {
            controls.push(
                row.querySelector(
                    '[data-order-field="searchName"]'
                )
            );
        }

        if (
            moduleName === '检验' ||
            moduleName === '检查'
        ) {
            controls.push(
                row.querySelector(
                    '[data-order-field="secondaryName"]'
                )
            );
        }

        controls.forEach(function (control) {
            if (!control) {
                return;
            }

            if (enabled) {
                control.setAttribute(
                    'list',
                    CHARGE_ITEM_DATALIST_ID
                );

                control.setAttribute(
                    'autocomplete',
                    'off'
                );

                control.title =
                    chargeItemPinyinInitialsEnabled()
                        ? '输入收费项目名称或拼音首字母，可从共享收费项目联想库选择；候选项显示计价单位和单价。'
                        : '输入收费项目名称，可从共享收费项目联想库选择；候选项显示计价单位和单价。';
            }
            else if (
                control.getAttribute(
                    'list'
                ) === CHARGE_ITEM_DATALIST_ID
            ) {
                control.removeAttribute(
                    'list'
                );

                control.removeAttribute(
                    'title'
                );
            }
        });
    }

    function applyChargeItemSuggestionToRow(
        row,
        sourceControl
    ) {
        if (
            !row ||
            !sourceControl ||
            !chargeItemSuggestionEnabled()
        ) {
            return false;
        }

        const moduleControl =
            row.querySelector(
                '[data-order-field="module"]'
            );

        const moduleName =
            moduleControl
                ? moduleControl.value
                : '';

        if (
            !CHARGE_ITEM_SUGGESTION_MODULES
                .includes(
                    moduleName
                )
        ) {
            return false;
        }

        const matched =
            findSharedChargeItem(
                sourceControl.value
            );

        if (!matched) {
            return false;
        }

        const nameControl =
            row.querySelector(
                '[data-order-field="name"]'
            );

        const searchControl =
            row.querySelector(
                '[data-order-field="searchName"]'
            );

        const secondaryControl =
            row.querySelector(
                '[data-order-field="secondaryName"]'
            );

        const unitControl =
            row.querySelector(
                '[data-order-field="unit"]'
            );

        if (nameControl) {
            nameControl.value =
                matched.name;
        }

        if (
            searchControl &&
            moduleName !== '检验'
        ) {
            searchControl.value =
                matched.name;
        }

        if (
            secondaryControl &&
            (
                moduleName === '检验' ||
                moduleName === '检查'
            )
        ) {
            secondaryControl.value =
                matched.name;
        }

        if (
            unitControl &&
            matched.unit
        ) {
            unitControl.value =
                matched.unit;
        }

        return true;
    }


    /*
     * v1.7.3.9
     * 原生 <datalist> 有一个容易误判的行为：
     * 用户只是在输入框中键入文字，候选菜单已经弹出，但并未点击/选择候选；
     * 当用户直接点击弹窗其他位置使输入框失焦时，浏览器仍会派发 change。
     *
     * 旧版在所有 change 上直接执行 applyWesternDrugSuggestionToRow /
     * applyChargeItemSuggestionToRow，因此只要当前文字恰好能命中共享库，
     * 就会被误认为“用户已经选择联想项”，并自动覆盖同一行其他字段。
     *
     * 本版只记录真正的 datalist 选择动作：
     * 1. Chromium 正常情况下选中原生候选会产生
     *    inputType="insertReplacementText"；
     * 2. 为兼容医院当前 Chrome 109，再保留一个保守兜底：
     *    必须是真实用户 input、当前值精确等于 datalist option、
     *    data===null、且不是粘贴/拖放/输入法组合/删除；
     *    同时满足键盘曾导航候选，或本次值长度发生明显跳变。
     *
     * 单纯手工输入、粘贴、输入法提交、以及“弹出联想后直接点外部”
     * 都不会得到 chosen 标记，因此 change 只保存原文字，不联动改写。
     */
    function outpatientOrderSuggestionDatalistId(
        control
    ) {
        if (
            !control ||
            !control.getAttribute
        ) {
            return '';
        }

        const listId =
            String(
                control.getAttribute('list') ||
                ''
            ).trim();

        return (
            listId === WESTERN_DRUG_DATALIST_ID ||
            listId === CHARGE_ITEM_DATALIST_ID
        )
            ? listId
            : '';
    }

    function outpatientOrderSuggestionExactOption(
        control
    ) {
        const listId =
            outpatientOrderSuggestionDatalistId(
                control
            );

        if (!listId) {
            return null;
        }

        const datalist =
            document.getElementById(
                listId
            );

        if (!datalist) {
            return null;
        }

        const currentValue =
            String(
                control.value == null
                    ? ''
                    : control.value
            );

        return Array.from(
            datalist.options || []
        ).find(function (option) {
            return (
                String(
                    option.value == null
                        ? ''
                        : option.value
                ) === currentValue
            );
        }) || null;
    }

    function resetOutpatientOrderSuggestionSelectionState(
        control
    ) {
        if (!control || !control.dataset) {
            return;
        }

        delete control.dataset
            .outpatientSuggestionChosen;

        delete control.dataset
            .outpatientSuggestionChosenValue;

        delete control.dataset
            .outpatientSuggestionKeyboardNav;

        control.dataset
            .outpatientSuggestionLastValue =
            String(
                control.value == null
                    ? ''
                    : control.value
            );
    }

    function markOutpatientOrderSuggestionInputEvent(
        control,
        event
    ) {
        if (
            !control ||
            !event ||
            !outpatientOrderSuggestionDatalistId(
                control
            )
        ) {
            return;
        }

        const currentValue =
            String(
                control.value == null
                    ? ''
                    : control.value
            );

        const previousValue =
            String(
                control.dataset
                    .outpatientSuggestionLastValue ||
                ''
            );

        const exactOption =
            outpatientOrderSuggestionExactOption(
                control
            );

        const inputType =
            String(
                event.inputType ||
                ''
            );

        const replacementSelection =
            exactOption &&
            (
                inputType ===
                    'insertReplacementText' ||
                inputType ===
                    'insertFromAutoFill'
            );

        const excludedLegacyInput =
            /paste|drop|composition|delete/i
                .test(
                    inputType
                );

        /*
         * Chrome 109兼容兜底。
         * isTrusted确保脚本自己dispatchEvent的input不会被识别成用户选择。
         */
        const legacySelection =
            Boolean(
                exactOption &&
                event.isTrusted &&
                event.data == null &&
                !excludedLegacyInput &&
                currentValue !==
                    previousValue &&
                (
                    control.dataset
                        .outpatientSuggestionKeyboardNav ===
                        '1' ||
                    Math.abs(
                        currentValue.length -
                        previousValue.length
                    ) > 1
                )
            );

        if (
            replacementSelection ||
            legacySelection
        ) {
            control.dataset
                .outpatientSuggestionChosen =
                '1';

            control.dataset
                .outpatientSuggestionChosenValue =
                currentValue;
        }
        else {
            /*
             * 正常键入/粘贴/继续编辑都会撤销之前的候选选择标记。
             */
            delete control.dataset
                .outpatientSuggestionChosen;

            delete control.dataset
                .outpatientSuggestionChosenValue;
        }

        delete control.dataset
            .outpatientSuggestionKeyboardNav;

        control.dataset
            .outpatientSuggestionLastValue =
            currentValue;
    }

    function consumeOutpatientOrderSuggestionCommit(
        control
    ) {
        if (
            !control ||
            !control.dataset ||
            control.dataset
                .outpatientSuggestionChosen !==
                '1'
        ) {
            return false;
        }

        const currentValue =
            String(
                control.value == null
                    ? ''
                    : control.value
            );

        const chosenValue =
            String(
                control.dataset
                    .outpatientSuggestionChosenValue ||
                ''
            );

        const valid =
            Boolean(
                currentValue &&
                currentValue ===
                    chosenValue &&
                outpatientOrderSuggestionExactOption(
                    control
                )
            );

        /*
         * 一个明确选择只消费一次。
         * 后续失焦若浏览器再次派发change，也不会重复套用。
         */
        delete control.dataset
            .outpatientSuggestionChosen;

        delete control.dataset
            .outpatientSuggestionChosenValue;

        delete control.dataset
            .outpatientSuggestionKeyboardNav;

        control.dataset
            .outpatientSuggestionLastValue =
            currentValue;

        return valid;
    }



    function refreshOutpatientSharedKnowledge(
        modal,
        applyExistingRows
    ) {
        if (!modal) {
            return;
        }

        renderWesternDrugDatalist(
            modal
        );

        renderChargeItemDatalist(
            modal
        );

        modal.querySelectorAll(
            '.outpatient-ai-order-row'
        ).forEach(function (row) {
            configureWesternDrugRowSuggestion(
                row
            );

            configureChargeItemRowSuggestion(
                row
            );

            if (!applyExistingRows) {
                return;
            }

            const moduleControl =
                row.querySelector(
                    '[data-order-field="module"]'
                );

            const nameControl =
                row.querySelector(
                    '[data-order-field="name"]'
                );

            const searchControl =
                row.querySelector(
                    '[data-order-field="searchName"]'
                );

            if (
                moduleControl &&
                moduleControl.value ===
                    '中药(新)' &&
                searchControl
            ) {
                searchControl.value =
                    formatTcmSearchName(
                        plain(
                            nameControl &&
                            nameControl.value
                        ) ||
                        plain(
                            searchControl.value
                        ),
                        tcmStarPrefixEnabled()
                    );
            }
            else if (
                moduleControl &&
                moduleControl.value ===
                    '西药处方'
            ) {
                applyWesternDrugSuggestionToRow(
                    row,
                    nameControl ||
                    searchControl
                );
            }
            else if (
                moduleControl &&
                CHARGE_ITEM_SUGGESTION_MODULES
                    .includes(
                        moduleControl.value
                    )
            ) {
                applyChargeItemSuggestionToRow(
                    row,
                    nameControl ||
                    searchControl
                );
            }
        });

        const status =
            modal.querySelector(
                '.outpatient-ai-order-shared-status'
            );

        if (status) {
            status.textContent =
                sharedKnowledgeStatusText();
        }

        saveOutpatientOrderDraft(
            modal
        );
    }


    function defaultOutpatientOrderItem(moduleName) {
        return {
            enabled: true,
            module: OUTPATIENT_ORDER_MODULES.includes(moduleName) ? moduleName : '西药处方',
            name: '',
            searchName: '',
            secondaryName: '',
            dose: '',
            unit: '',
            route: '',
            frequency: '',
            days: '',
            quantity: '',
            department: '',
            note: ''
        };
    }

    function normalizeOutpatientOrderItem(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const moduleName = plain(source.module || source.type || source.tab || '西药处方');
        const matched = OUTPATIENT_ORDER_MODULES.find(name =>
            moduleName === name ||
            (OUTPATIENT_ORDER_TAB_ALIASES[name] || []).some(alias => moduleName.includes(alias))
        ) || '西药处方';
        return {
            enabled: source.enabled !== false,
            module: matched,
            name: plain(source.name || source.itemName || source.drugName || source.herbName),
            searchName: plain(source.searchName || source.lookupName || source.name || source.itemName),
            secondaryName: plain(source.secondaryName || source.subdirectory || source.secondaryDirectory),
            dose: plain(source.dose || source.amount || source.times),
            unit: plain(source.unit),
            route: plain(source.route || source.usage || source.method),
            frequency: plain(source.frequency || source.freq),
            days: plain(source.days || source.decoctionCount || source.course),
            quantity: plain(source.quantity || source.total || source.count),
            department: plain(source.department || source.executionDepartment),
            note: plain(source.note || source.remark)
        };
    }

    function getOutpatientOrderRows(modal) {
        return Array.from(modal.querySelectorAll('.outpatient-ai-order-row')).map(row => {
            const item = {
                enabled: row.querySelector('[data-order-field="enabled"]').checked,
                module: row.querySelector('[data-order-field="module"]').value,
                name: plain(row.querySelector('[data-order-field="name"]').value),
                searchName: plain(row.querySelector('[data-order-field="searchName"]').value),
                secondaryName: plain(row.querySelector('[data-order-field="secondaryName"]').value),
                dose: plain(row.querySelector('[data-order-field="dose"]').value),
                unit: plain(row.querySelector('[data-order-field="unit"]').value),
                route: plain(row.querySelector('[data-order-field="route"]').value),
                frequency: plain(row.querySelector('[data-order-field="frequency"]').value),
                days: plain(row.querySelector('[data-order-field="days"]').value),
                quantity: plain(row.querySelector('[data-order-field="quantity"]').value),
                department: plain(row.querySelector('[data-order-field="department"]').value),
                note: plain(row.querySelector('[data-order-field="note"]').value)
            };
            if (item.module === '中药(新)') {
                item.searchName = formatTcmSearchName(item.name || item.searchName, tcmStarPrefixEnabled());
                item.quantity = item.dose;
            }
            return item;
        });
    }

    function saveOutpatientOrderDraft(modal) {
        const rows = getOutpatientOrderRows(modal);
        GM_setValue(KEYS.outpatientOrderDraft, rows);
    }

    function outpatientOrderModuleOptions(selected) {
        return OUTPATIENT_ORDER_MODULES.map(name =>
            '<option value="' + escapeHtml(name) + '"' + (name === selected ? ' selected' : '') + '>' + escapeHtml(name) + '</option>'
        ).join('');
    }


    function outpatientOrderSecondaryDirectoryVisible(modal) {
        if (!modal) {
            return true;
        }
        return modal.dataset.outpatientOrderSecondaryDirectoryVisible !== 'false';
    }

    function refreshOutpatientOrderSecondaryDirectoryToggle(modal) {
        if (!modal) {
            return;
        }
        const visible = outpatientOrderSecondaryDirectoryVisible(modal);
        const button = modal.querySelector('.outpatient-ai-order-toggle-secondary-directory');
        const table = modal.querySelector('.outpatient-ai-order-table');
        const searchHeader = modal.querySelector('.outpatient-ai-order-search-header');

        modal.classList.toggle('outpatient-ai-order-secondary-directory-visible', visible);
        if (table) {
            table.classList.toggle('outpatient-ai-order-secondary-directory-visible', visible);
        }
        if (searchHeader) {
            searchHeader.textContent = visible ? '一级／下拉检索名' : '检索名';
        }
        if (button) {
            button.textContent = visible ? '隐藏二级目录' : '显示二级目录';
            button.setAttribute('aria-pressed', visible ? 'true' : 'false');
            button.classList.toggle('active', visible);
            button.title = visible
                ? '隐藏二级目录列；已填写的二级目录内容不会删除'
                : '显示检验、检查使用的二级目录列';
        }
    }

    function setOutpatientOrderSecondaryDirectoryVisible(modal, visible, persist) {
        if (!modal) {
            return;
        }
        modal.dataset.outpatientOrderSecondaryDirectoryVisible = visible ? 'true' : 'false';
        refreshOutpatientOrderSecondaryDirectoryToggle(modal);
        if (persist !== false) {
            GM_setValue(KEYS.outpatientOrderSecondaryDirectoryVisible, Boolean(visible));
        }
    }

    function outpatientOrderEditorMode(modal) {
        return modal && modal.dataset.outpatientOrderEditorMode === 'json'
            ? 'json'
            : 'gui';
    }

    function setOutpatientOrderJsonStatus(modal, message, type) {
        const status = modal && modal.querySelector('.outpatient-ai-order-json-status');
        if (!status) return;
        status.textContent = String(message || '');
        status.classList.toggle('error', type === 'error');
        status.classList.toggle('success', type === 'success');
    }

    function syncOutpatientOrderJsonFromRows(modal) {
        const editor = modal && modal.querySelector('.outpatient-ai-order-json-editor');
        if (!editor) return;
        editor.value = JSON.stringify({ items: getOutpatientOrderRows(modal) }, null, 2);
        setOutpatientOrderJsonStatus(modal, 'JSON已与图形化草稿同步。', 'success');
    }

    function parseOutpatientOrderJsonEditor(modal) {
        const editor = modal && modal.querySelector('.outpatient-ai-order-json-editor');
        if (!editor) throw new Error('未找到门诊医嘱JSON编辑框。');
        const source = String(editor.value || '').trim();
        if (!source) return [];
        const parsed = JSON.parse(source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
        const list = Array.isArray(parsed) ? parsed : parsed && parsed.items;
        if (!Array.isArray(list)) {
            throw new Error('JSON根节点必须是数组，或包含items数组。');
        }
        return list.map(normalizeOutpatientOrderItem);
    }

    function commitOutpatientOrderJsonEditor(modal, showError) {
        try {
            const items = parseOutpatientOrderJsonEditor(modal);
            modal.dataset.outpatientOrderJsonCommitting = '1';
            renderOutpatientOrderRows(modal, items);
            delete modal.dataset.outpatientOrderJsonCommitting;
            setOutpatientOrderJsonStatus(modal, 'JSON语法正确，已同步到图形化草稿。', 'success');
            return true;
        }
        catch (error) {
            delete modal.dataset.outpatientOrderJsonCommitting;
            setOutpatientOrderJsonStatus(modal, 'JSON错误：' + error.message, 'error');
            if (showError !== false) {
                showMessage('门诊医嘱JSON解析失败：' + error.message, 'error');
            }
            return false;
        }
    }

    function setOutpatientOrderEditorMode(modal, mode, parseCurrentJson) {
        const target = mode === 'json' ? 'json' : 'gui';
        const current = outpatientOrderEditorMode(modal);
        if (target === 'gui' && current === 'json' && parseCurrentJson !== false) {
            if (!commitOutpatientOrderJsonEditor(modal, true)) return false;
        }
        if (target === 'json' && current !== 'json') {
            syncOutpatientOrderJsonFromRows(modal);
        }
        modal.dataset.outpatientOrderEditorMode = target;
        modal.classList.toggle('outpatient-ai-order-mode-json', target === 'json');
        modal.classList.toggle('outpatient-ai-order-mode-gui', target === 'gui');
        const guiButton = modal.querySelector('.outpatient-ai-order-mode-gui-button');
        const jsonButton = modal.querySelector('.outpatient-ai-order-mode-json-button');
        if (guiButton) {
            guiButton.classList.toggle('active', target === 'gui');
            guiButton.setAttribute('aria-pressed', target === 'gui' ? 'true' : 'false');
        }
        if (jsonButton) {
            jsonButton.classList.toggle('active', target === 'json');
            jsonButton.setAttribute('aria-pressed', target === 'json' ? 'true' : 'false');
        }
        return true;
    }

    function selectedOutpatientOrderRow(modal) {
        return modal && modal.querySelector('.outpatient-ai-order-row.outpatient-ai-order-row-selected');
    }

    function selectOutpatientOrderRow(modal, row) {
        if (!modal || !row) return;
        modal.querySelectorAll('.outpatient-ai-order-row-selected').forEach(item => {
            item.classList.remove('outpatient-ai-order-row-selected');
        });
        row.classList.add('outpatient-ai-order-row-selected');
        const rows = Array.from(modal.querySelectorAll('.outpatient-ai-order-row'));
        modal.dataset.outpatientOrderSelectedIndex = String(Math.max(0, rows.indexOf(row)));
    }

    function ensureOutpatientOrderJsonCommittedForTool(modal) {
        if (outpatientOrderEditorMode(modal) !== 'json') return true;
        return commitOutpatientOrderJsonEditor(modal, true);
    }

    function afterOutpatientOrderDraftTool(modal) {
        const selected = selectedOutpatientOrderRow(modal);
        updateOutpatientOrderIndexes(modal);
        if (selected && selected.isConnected) {
            const rows = Array.from(modal.querySelectorAll('.outpatient-ai-order-row'));
            const index = rows.indexOf(selected);
            if (index >= 0) modal.dataset.outpatientOrderSelectedIndex = String(index);
        }
        if (outpatientOrderEditorMode(modal) === 'json') {
            syncOutpatientOrderJsonFromRows(modal);
        }
    }

    function renderOutpatientOrderRows(modal, items) {
        const body = modal.querySelector('.outpatient-ai-order-table-body');
        if (!body) {
            return;
        }
        const rows = (Array.isArray(items) ? items : []).map(normalizeOutpatientOrderItem);
        const starPrefix = tcmStarPrefixEnabled();
        rows.forEach(item => {
            if (item.module === '中药(新)') {
                item.searchName = formatTcmSearchName(item.name || item.searchName, starPrefix);
                item.quantity = item.dose;
            }
        });
        body.innerHTML = rows.map((item, index) => `
<tr class="outpatient-ai-order-row">
  <td><input type="checkbox" data-order-field="enabled" ${item.enabled ? 'checked' : ''}></td>
  <td class="outpatient-ai-order-index">${index + 1}</td>
  <td><select data-order-field="module">${outpatientOrderModuleOptions(item.module)}</select></td>
  <td><input data-order-field="name" value="${escapeHtml(item.name)}"></td>
  <td><input data-order-field="searchName" value="${escapeHtml(item.searchName)}"></td>
  <td class="outpatient-ai-order-secondary-column"><input data-order-field="secondaryName" value="${escapeHtml(item.secondaryName)}"></td>
  <td><input data-order-field="dose" value="${escapeHtml(item.dose)}"></td>
  <td><input data-order-field="unit" value="${escapeHtml(item.unit)}"></td>
  <td><input data-order-field="route" value="${escapeHtml(item.route)}"></td>
  <td><input data-order-field="frequency" value="${escapeHtml(item.frequency)}"></td>
  <td><input data-order-field="days" value="${escapeHtml(item.days)}"></td>
  <td><input data-order-field="quantity" value="${escapeHtml(item.quantity)}"></td>
  <td><input data-order-field="department" value="${escapeHtml(item.department)}"></td>
  <td><input data-order-field="note" value="${escapeHtml(item.note)}"></td>
  <td>
    <button type="button" class="outpatient-ai-order-row-up secondary" title="上移">↑</button>
    <button type="button" class="outpatient-ai-order-row-down secondary" title="下移">↓</button>
    <button type="button" class="outpatient-ai-order-row-delete danger" title="删除">×</button>
  </td>
</tr>`).join('');
        const selectedIndex = Number(modal.dataset.outpatientOrderSelectedIndex);
        const renderedRows = Array.from(body.querySelectorAll('.outpatient-ai-order-row'));
        if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && renderedRows[selectedIndex]) {
            renderedRows[selectedIndex].classList.add('outpatient-ai-order-row-selected');
        }
        else if (!renderedRows.length) {
            delete modal.dataset.outpatientOrderSelectedIndex;
        }
        refreshOutpatientSharedKnowledge(modal, false);
        saveOutpatientOrderDraft(modal);
        if (modal.dataset.outpatientOrderJsonCommitting !== '1') {
            syncOutpatientOrderJsonFromRows(modal);
        }
    }

    function updateOutpatientOrderIndexes(modal) {
        modal.querySelectorAll('.outpatient-ai-order-row').forEach((row, index) => {
            const cell = row.querySelector('.outpatient-ai-order-index');
            if (cell) {
                cell.textContent = String(index + 1);
            }
        });
        saveOutpatientOrderDraft(modal);
    }

    function parseOutpatientOrderText(text) {
        const source = String(text || '').trim();
        if (!source) {
            return [];
        }
        try {
            const parsed = JSON.parse(source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
            const list = Array.isArray(parsed) ? parsed : parsed.items;
            if (Array.isArray(list)) {
                return list.map(normalizeOutpatientOrderItem);
            }
        }
        catch (error) {
            // 非JSON时继续按行解析。
        }

        let currentModule = '西药处方';
        const result = [];
        source.split(/\n+/).forEach(rawLine => {
            let line = plain(rawLine).replace(/^\d+[.、)）]\s*/, '');
            if (!line) {
                return;
            }
            const explicitModule = OUTPATIENT_ORDER_MODULES.find(moduleName =>
                line === moduleName || line.startsWith(moduleName + '：') || line.startsWith(moduleName + ':')
            );
            if (explicitModule) {
                currentModule = explicitModule;
                line = plain(line.replace(explicitModule, '').replace(/^[:：]/, ''));
                if (!line) {
                    return;
                }
            }
            const tokens = line.split(/[\t|，,;；]+/).map(plain).filter(Boolean);
            const item = defaultOutpatientOrderItem(currentModule);
            item.name = tokens[0] || '';
            item.searchName = item.name;
            const doseMatch = line.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|mL|片|粒|支|瓶|袋|付|次|项|个|枚)/i);
            if (doseMatch) {
                item.dose = doseMatch[1];
                item.unit = doseMatch[2];
            }
            const freqMatch = line.match(/\b(qd|bid|tid|qid|qn|qod|st|prn|q\d+h|q\d+d)\b/i);
            if (freqMatch) {
                item.frequency = freqMatch[1];
            }
            const routeDictionary = ['口服', '静脉滴注', '静脉注射', '肌肉注射', '皮下注射', '外用', '鼻饲', '雾化', '领药', '自煎', '代煎', '冲服'];
            const routeCodeMatch = line.match(/(?:^|[\s,，;；])(?:po|kf|ivdrip|ivgtt|ivd|iv|im|sc|wy|bs|ly|wh)(?=$|[\s,，;；])/i);
            item.route = routeDictionary.find(value => line.includes(value)) ||
                (routeCodeMatch ? normalizeOutpatientRoute(routeCodeMatch[0].trim()) : '');
            const daysMatch = line.match(/(\d+)\s*(?:天|付)/);
            if (daysMatch) {
                item.days = daysMatch[1];
            }
            if (item.name) {
                result.push(item);
            }
        });
        return result;
    }

    async function generateOutpatientOrdersByAi(modal) {
        if (state.orderAiBusy || state.busy) {
            showMessage('当前已有AI任务正在执行。', 'warning');
            return;
        }
        const settings = settingsFromModal(modal);
        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showMessage('请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。', 'warning');
            return;
        }
        const source = compactText(modal.querySelector('.outpatient-ai-order-source').value);
        if (!source) {
            showMessage('请先粘贴门诊医嘱或诊疗方案。', 'warning');
            return;
        }

        const button = modal.querySelector('.outpatient-ai-order-ai-parse');
        state.orderAiBusy = true;
        button.disabled = true;
        button.textContent = '正在解析……';
        try {
            const systemPrompt = [
                '你是中国医院HIS门诊医嘱结构化助手。',
                '只能整理用户已经提供的医嘱，不得自行增加药物、检查、检验或治疗。',
                '输出JSON对象，格式为：{"items":[...] }。',
                '每个item字段：enabled、module、name、searchName、secondaryName、dose、unit、route、frequency、days、quantity、department、note。',
                'module只能是：' + OUTPATIENT_ORDER_MODULES.join('、') + '。',
                '检验：searchName填写一级下拉目录名称，secondaryName填写树状二级目录具体项目。',
                '检查：searchName填写检索词，secondaryName填写最终树状项目名称。',
                '不确定字段使用空字符串。'
            ].join('\n');
            const parsed = await aiRequest(
                settings.apiKey,
                settings.model,
                systemPrompt,
                { source },
                5000
            );
            const items = Array.isArray(parsed.items) ? parsed.items : [];
            renderOutpatientOrderRows(modal, items);
            showMessage('AI已解析' + items.length + '条门诊医嘱，请核对后再执行。', 'success');
        }
        catch (error) {
            showMessage('门诊医嘱AI解析失败：' + error.message, 'error');
        }
        finally {
            state.orderAiBusy = false;
            button.disabled = false;
            button.textContent = 'AI解析医嘱';
        }
    }

    function outpatientOrderModalTargets(preferredModal) {
        const targets = [];
        const add = element => {
            if (element && !targets.includes(element)) {
                targets.push(element);
            }
        };

        add(preferredModal);
        add(modalElement());
        document.querySelectorAll('#' + IDS.modal).forEach(add);
        return targets;
    }

    function syncOutpatientOrderModalControls(preferredModal) {
        outpatientOrderModalTargets(preferredModal).forEach(modal => {
            const execute = modal.querySelector('.outpatient-ai-order-execute');
            const pause = modal.querySelector('.outpatient-ai-order-pause');
            const stop = modal.querySelector('.outpatient-ai-order-stop');
            const templateManage = modal.querySelector('.outpatient-ai-order-template-manage');
            const templateSave = modal.querySelector('.outpatient-ai-order-template-save');
            const editorTools = modal.querySelectorAll('.outpatient-ai-order-editor-tool');

            editorTools.forEach(button => {
                button.disabled = Boolean(state.orderBusy);
            });

            if (execute) {
                execute.disabled = Boolean(
                    state.orderBusy ||
                    state.diagnosisBusy
                );
                execute.textContent = state.orderBusy
                    ? '正在执行……'
                    : '执行已勾选';
            }
            if (pause) {
                pause.disabled = !state.orderBusy;
                pause.textContent = state.orderPaused ? '继续' : '暂停';
            }
            if (stop) {
                stop.disabled = !state.orderBusy;
                stop.textContent = state.orderStopRequested && state.orderBusy ? '中止中……' : '中止';
            }
            if (templateManage) {
                templateManage.disabled = Boolean(state.orderBusy);
            }
            if (templateSave) {
                templateSave.disabled = Boolean(state.orderBusy);
            }
        });

        updateOutpatientDiagnosisControls(preferredModal);
    }

    function syncOutpatientOrderProgressControls() {
        const box = document.getElementById('outpatient-ai-order-progress-v1');
        if (!box) {
            return;
        }

        const pause = box.querySelector('[data-progress-action="pause"]');
        const stop = box.querySelector('[data-progress-action="stop"]');

        if (pause) {
            pause.disabled = !state.orderBusy;
            pause.textContent = state.orderPaused ? '继续' : '暂停';
            pause.style.display = state.orderBusy ? '' : 'none';
        }

        if (stop) {
            stop.disabled = false;
            stop.textContent = state.orderBusy
                ? (state.orderStopRequested ? '中止中……' : '中止')
                : '关闭';
        }
    }

    function clearOutpatientOrderForceStopTimer() {
        if (state.orderForceStopTimer) {
            window.clearTimeout(state.orderForceStopTimer);
            state.orderForceStopTimer = 0;
        }
    }

    function releaseOutpatientOrderUi(preferredModal, runSerial, preserveStopRequest) {
        /*
         * 只允许当前任务复位当前任务的按钮，避免旧任务延迟返回后
         * 把新任务的“正在执行”错误地改回空闲状态。
         */
        if (
            runSerial != null &&
            state.orderActiveSerial &&
            runSerial !== state.orderActiveSerial
        ) {
            return false;
        }

        clearOutpatientOrderForceStopTimer();
        state.orderBusy = false;
        state.orderPaused = false;
        if (!preserveStopRequest) {
            state.orderStopRequested = false;
        }
        state.orderActiveSerial = 0;

        const restore = state.orderRestoreUi;
        state.orderRestoreUi = null;
        if (typeof restore === 'function') {
            try {
                restore();
            }
            catch (error) {
                // 页面已切换时忽略恢复失败。
            }
        }

        syncOutpatientOrderModalControls(preferredModal);
        syncOutpatientOrderProgressControls();

        /* OpenHIS可能在同一帧重绘助手，连续校正两次按钮状态。 */
        window.setTimeout(() => syncOutpatientOrderModalControls(modalElement()), 0);
        window.setTimeout(() => syncOutpatientOrderModalControls(modalElement()), 220);
        return true;
    }

    function toggleOutpatientOrderPause() {
        if (!state.orderBusy || state.orderStopRequested) {
            return;
        }

        state.orderPaused = !state.orderPaused;
        syncOutpatientOrderModalControls(modalElement());
        syncOutpatientOrderProgressControls();

        showOutpatientOrderProgress(
            state.orderPaused ? '执行已暂停。点击“继续”后从当前步骤继续。' : '已继续执行。',
            'normal'
        );
    }

    function requestOutpatientOrderStop(closeWhenIdle) {
        if (!state.orderBusy) {
            syncOutpatientOrderModalControls(modalElement());
            if (closeWhenIdle !== false) {
                hideOutpatientOrderProgress(0);
            }
            return;
        }

        const activeSerial = state.orderActiveSerial;
        state.orderStopRequested = true;
        state.orderPaused = false;

        /*
         * 立即让当前任务序号失效并释放界面按钮，不再等待1.2秒。
         * 后台旧流程在下一个checkpoint会因序号不一致自动退出。
         */
        state.orderRunSerial += 1;
        releaseOutpatientOrderUi(modalElement(), activeSerial, true);
        syncOutpatientOrderModalControls(modalElement());
        syncOutpatientOrderProgressControls();
        showOutpatientOrderProgress('门诊医嘱任务已中止。', 'error');

        if (closeWhenIdle) {
            window.setTimeout(() => hideOutpatientOrderProgress(0), 300);
        }
    }

    function outpatientOrderProgressBox() {
        let box = document.getElementById('outpatient-ai-order-progress-v1');
        if (box) {
            return box;
        }

        box = document.createElement('div');
        box.id = 'outpatient-ai-order-progress-v1';
        box.innerHTML = `
<div class="outpatient-ai-order-progress-head">
  <div class="outpatient-ai-order-progress-title">门诊医嘱执行</div>
  <button type="button" class="outpatient-ai-order-progress-close" data-progress-action="close" title="关闭">×</button>
</div>
<div class="outpatient-ai-order-progress-text">正在准备……</div>
<div class="outpatient-ai-order-progress-actions">
  <button type="button" data-progress-action="pause">暂停</button>
  <button type="button" data-progress-action="stop">中止</button>
</div>`;
        document.body.appendChild(box);

        /* 使用捕获阶段代理，避免医院页面的全局click处理器吞掉按钮事件。 */
        box.addEventListener('click', event => {
            const button = event.target.closest('[data-progress-action]');
            if (!button || !box.contains(button)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }

            const action = button.dataset.progressAction;
            if (action === 'pause') {
                toggleOutpatientOrderPause();
            }
            else if (action === 'stop') {
                if (state.orderBusy) {
                    requestOutpatientOrderStop(true);
                }
                else {
                    hideOutpatientOrderProgress(0);
                }
            }
            else if (action === 'close') {
                if (state.orderBusy) {
                    requestOutpatientOrderStop(false);
                }
                hideOutpatientOrderProgress(0);
            }
        }, true);

        syncOutpatientOrderProgressControls();
        return box;
    }

    function showOutpatientOrderProgress(text, type) {
        if (state.orderProgressHideTimer) {
            window.clearTimeout(state.orderProgressHideTimer);
            state.orderProgressHideTimer = 0;
        }

        const box = outpatientOrderProgressBox();
        box.classList.add('show');
        box.classList.toggle('error', type === 'error');
        box.classList.toggle('success', type === 'success');
        box.querySelector('.outpatient-ai-order-progress-text').textContent = String(text || '正在执行……');
        syncOutpatientOrderProgressControls();
    }

    function hideOutpatientOrderProgress(delay) {
        if (state.orderProgressHideTimer) {
            window.clearTimeout(state.orderProgressHideTimer);
            state.orderProgressHideTimer = 0;
        }

        const close = () => {
            const box = document.getElementById('outpatient-ai-order-progress-v1');
            if (box) {
                box.classList.remove('show');
            }
            state.orderProgressHideTimer = 0;
        };

        const wait = Math.max(0, Number(delay) || 0);
        if (!wait) {
            close();
            return;
        }
        state.orderProgressHideTimer = window.setTimeout(close, wait);
    }

    async function outpatientOrderCheckpoint(runSerial) {
        const expectedSerial = runSerial == null
            ? (state.orderActiveSerial || null)
            : runSerial;

        if (
            state.orderStopRequested ||
            (expectedSerial != null && expectedSerial !== state.orderRunSerial)
        ) {
            throw new Error('用户已中止门诊医嘱执行');
        }

        while (state.orderPaused) {
            await sleep(80);
            if (
                state.orderStopRequested ||
                (expectedSerial != null && expectedSerial !== state.orderRunSerial)
            ) {
                throw new Error('用户已中止门诊医嘱执行');
            }
        }
    }

    async function outpatientOrderWait(ms, runSerial) {
        const expectedSerial = runSerial == null
            ? (state.orderActiveSerial || null)
            : runSerial;
        const end = Date.now() + Math.max(0, Number(ms) || 0);
        do {
            await outpatientOrderCheckpoint(expectedSerial);
            if (Date.now() >= end) {
                break;
            }
            await sleep(Math.min(50, Math.max(1, end - Date.now())));
        }
        while (Date.now() < end);
    }

    function assistantTemporaryHide(modal) {
        const shown = modal && modal.classList.contains('show');
        const body = modal && modal.querySelector('.outpatient-ai-body');
        const scrollTop = body ? body.scrollTop : 0;
        if (shown) {
            modal.classList.remove('show');
        }
        return () => {
            if (!shown || !modal) {
                return;
            }
            modal.classList.add('show');
            requestAnimationFrame(() => {
                if (body) {
                    body.scrollTop = scrollTop;
                }
            });
        };
    }

    function normalizedUiText(value) {
        return plain(value).replace(/[\s：:（）()]/g, '').toLowerCase();
    }

    function visibleElements(doc, selector) {
        return Array.from(doc.querySelectorAll(selector)).filter(isVisible);
    }

    function elementClickableTarget(element) {
        if (!element) {
            return null;
        }

        /*
         * 必须先判断真正的按钮/链接，再判断表格行。
         * 门诊“新处方”按钮位于表格布局的td/tr中，旧版使用
         * element.closest('tr,...,button') 时，closest会返回距离更近的tr，
         * 实际点击的是整行而不是按钮，所以页面不会创建空白处方。
         */
        const directControl = element.closest(
            'button,a,input[type="button"],input[type="submit"],[role="button"],[onclick]'
        );
        if (directControl) {
            return directControl;
        }

        return element.closest(
            '[role="option"],[role="treeitem"],.el-tree-node__content,.layui-tree-txt,.datagrid-row,li,tr'
        ) || element;
    }

    function dispatchKeyboard(element, key, keyCode) {
        if (!element) {
            return;
        }
        const view = element.ownerDocument.defaultView || window;
        ['keydown', 'keypress', 'keyup'].forEach(type => {
            try {
                element.dispatchEvent(new view.KeyboardEvent(type, {
                    key,
                    code: key === 'Enter' ? 'Enter' : key,
                    keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));
            }
            catch (error) {
                const event = element.ownerDocument.createEvent('Event');
                event.initEvent(type, true, true);
                event.keyCode = keyCode;
                event.which = keyCode;
                element.dispatchEvent(event);
            }
        });
    }

    function clickVisibleElement(element) {
        const target = elementClickableTarget(element);
        if (!target) {
            return false;
        }
        try {
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        catch (error) {
            // 忽略旧浏览器参数不兼容。
        }
        try {
            target.click();
            return true;
        }
        catch (error) {
            try {
                const view = target.ownerDocument.defaultView || window;
                target.dispatchEvent(new view.MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view
                }));
                return true;
            }
            catch (secondError) {
                return false;
            }
        }
    }

    function findExactVisibleText(text, options) {
        const target = normalizedUiText(text);
        if (!target) {
            return null;
        }
        const config = options || {};
        const selectors = config.selector || 'button,a,span,div,td,li,label';
        let best = null;
        let bestScore = -Infinity;
        allDocuments().forEach(doc => {
            visibleElements(doc, selectors).forEach(element => {
                if (isOwnAssistantUi(element)) {
                    return;
                }
                const value = normalizedUiText(element.textContent);
                if (!value) {
                    return;
                }
                let score = -Infinity;
                if (value === target) {
                    score = 100;
                }
                else if (config.allowContains && value.includes(target)) {
                    score = 50 - Math.abs(value.length - target.length);
                }
                if (score > bestScore) {
                    const rect = element.getBoundingClientRect();
                    score -= Math.max(0, rect.width * rect.height / 500000);
                    if (score > bestScore) {
                        best = element;
                        bestScore = score;
                    }
                }
            });
        });
        return best;
    }

    async function clickOutpatientOrderTab(moduleName) {
        const aliases = OUTPATIENT_ORDER_TAB_ALIASES[moduleName] || [moduleName];
        let target = null;
        for (const alias of aliases) {
            target = findExactVisibleText(alias, {
                selector: 'a,span,div,li,button',
                allowContains: false
            });
            if (target) {
                break;
            }
        }
        if (!target) {
            throw new Error('未找到门诊模块标签页：' + moduleName);
        }

        /*
         * 门诊处方表格存在横向滚动容器。这里禁止使用scrollIntoView，
         * 否则浏览器会为了“露出”标签或按钮而改变父容器scrollLeft，
         * 表现为整个OpenHIS工作区突然向左/向右错位。
         */
        clickElementAtCurrentPosition(target);
        await outpatientOrderWait(450);
        return true;
    }

    function visibleHospitalTables() {
        const tables = [];
        allDocuments().forEach(doc => {
            visibleElements(doc, 'table').forEach(table => {
                if (!isOwnAssistantUi(table)) {
                    tables.push(table);
                }
            });
        });
        return tables;
    }

    function tableHeaderEntries(table) {
        const rows = Array.from(table.querySelectorAll('tr')).filter(isVisible);
        const headerRows = rows.slice(0, Math.min(3, rows.length));
        const entries = [];
        headerRows.forEach(row => {
            Array.from(row.children).filter(isVisible).forEach(cell => {
                const rect = cell.getBoundingClientRect();
                const text = plain(cell.textContent);
                if (text) {
                    entries.push({
                        text,
                        key: normalizedUiText(text),
                        center: (rect.left + rect.right) / 2,
                        left: rect.left,
                        right: rect.right,
                        rect,
                        cell
                    });
                }
            });
        });
        return entries;
    }

    function bestOutpatientOrderTable(moduleName) {
        const expected = {
            '西药处方': ['名称', '剂量', '用法', '频次'],
            '中药(新)': ['名称', '规格', '剂量', '自付比例'],
            '康复处方': ['项目名称', '执行科室', '每次治疗量'],
            '常规项目': ['项目名称', '执行科室', '数量'],
            '耗材': ['项目名称', '执行科室', '数量'],
            '检验': ['项目名称', '项目编码', '执行科室'],
            '检查': ['项目名称', '申请类型', '组套名称']
        }[moduleName] || ['名称'];
        let best = null;
        let bestScore = -Infinity;
        visibleHospitalTables().forEach(table => {
            const text = normalizedUiText(table.textContent);
            let score = expected.reduce((sum, word) => sum + (text.includes(normalizedUiText(word)) ? 12 : 0), 0);
            const rect = table.getBoundingClientRect();
            score += Math.min(8, rect.width / 200);
            if (score > bestScore) {
                best = table;
                bestScore = score;
            }
        });
        return bestScore > 10 ? best : null;
    }

    function tableDataRows(table) {
        if (!table) {
            return [];
        }
        return Array.from(table.querySelectorAll('tr')).filter(row => {
            if (!isVisible(row)) {
                return false;
            }
            const controls = row.querySelectorAll('input,select,textarea,[contenteditable="true"]');
            const addOrRemove = normalizedUiText(row.textContent).includes('操作');
            return controls.length > 0 && !addOrRemove;
        });
    }

    function headerCentersByText(table, headerText) {
        const key = normalizedUiText(headerText);
        return tableHeaderEntries(table)
            .filter(entry => entry.key === key || entry.key.includes(key))
            .sort((a, b) => a.center - b.center);
    }

    function rowCellAtCenter(row, center) {
        const cells = Array.from(row.children).filter(isVisible);
        let best = null;
        let distance = Infinity;
        cells.forEach(cell => {
            const rect = cell.getBoundingClientRect();
            const current = Math.abs(((rect.left + rect.right) / 2) - center);
            if (current < distance) {
                best = cell;
                distance = current;
            }
        });
        return best;
    }

    function rowCellByHeader(table, row, headerText, occurrence) {
        const centers = headerCentersByText(table, headerText);
        const index = Math.max(0, Number(occurrence) || 0);
        const entry = centers[index] || centers[0];
        return entry ? rowCellAtCenter(row, entry.center) : null;
    }

    function editableControl(cell) {
        if (!cell) {
            return null;
        }
        return Array.from(cell.querySelectorAll('input,textarea,select,[contenteditable="true"]')).find(isVisible) || null;
    }

    async function ensureOutpatientTableRow(moduleName, rowIndex) {
        const table = bestOutpatientOrderTable(moduleName);
        if (!table) {
            throw new Error('未识别到“' + moduleName + '”表格。');
        }
        let rows = tableDataRows(table);
        while (rows.length <= rowIndex) {
            const last = rows[rows.length - 1];
            if (!last) {
                throw new Error('“' + moduleName + '”没有可用首行。');
            }
            const plusCandidates = Array.from(last.querySelectorAll('button,a,span,i')).filter(element => {
                if (!isVisible(element)) {
                    return false;
                }
                const text = normalizedUiText(element.textContent + ' ' + (element.title || '') + ' ' + (element.className || ''));
                return text.includes('新增') || text.includes('添加') || text.includes('plus') || text === '+';
            });
            const plus = plusCandidates[0] || Array.from(last.querySelectorAll('button,a,span')).filter(isVisible).slice(-2)[0];
            if (!plus) {
                throw new Error('未找到“' + moduleName + '”新增行按钮。');
            }
            clickVisibleElement(plus);
            await outpatientOrderWait(280);
            rows = tableDataRows(table);
        }
        return { table, row: rows[rowIndex] };
    }

    function setHospitalControlValue(control, value) {
        if (!control || value == null || String(value) === '') {
            return false;
        }
        const text = String(value);
        try {
            control.focus();
        }
        catch (error) {
            // 忽略。
        }
        if (control.tagName === 'SELECT') {
            const option = Array.from(control.options).find(item =>
                normalizedUiText(item.textContent) === normalizedUiText(text) ||
                normalizedUiText(item.value) === normalizedUiText(text)
            );
            if (option) {
                control.value = option.value;
            }
            else {
                control.value = text;
            }
        }
        else if (control.isContentEditable) {
            control.textContent = text;
        }
        else {
            nativeValueSetter(control, text);
        }
        dispatchInputEvents(control);
        return true;
    }

    function candidateElementsForLookup(control, targetText) {
        const target = normalizedUiText(targetText);
        const candidates = [];
        const doc = control.ownerDocument;
        const controlRect = control.getBoundingClientRect();
        const selectors = [
            'tr',
            'li',
            '[role="option"]',
            '[role="treeitem"]',
            '.combobox-item',
            '.combo-panel .datagrid-row',
            '.panel-body .datagrid-row',
            '.datagrid-body .datagrid-row',
            '.el-tree-node__content',
            '.layui-table-view .layui-table-body div'
        ].join(',');

        visibleElements(doc, selectors).forEach(element => {
            /* 只排除当前编辑行本身，不再排除整个同源table，避免候选表格被误杀。 */
            if (element === control || element.contains(control)) {
                return;
            }
            const text = normalizedUiText(element.textContent);
            if (!text || (!text.includes(target) && !target.includes(text))) {
                return;
            }
            const rect = element.getBoundingClientRect();
            if (rect.width < 12 || rect.height < 8) {
                return;
            }

            let score = text === target ? 180 : 95 - Math.abs(text.length - target.length);
            const belowDistance = rect.top - controlRect.bottom;
            const horizontalDistance = Math.abs(rect.left - controlRect.left);
            if (belowDistance >= -12 && belowDistance < 420) score += 55;
            if (horizontalDistance < 520) score += 35;
            if (rect.top < controlRect.top - 80) score -= 120;
            if (rect.width > 1200 || rect.height > 180) score -= 140;

            const classText = normalizedUiText(element.className || '');
            if (classText.includes('comboboxitem')) score += 80;
            if (classText.includes('datagridrowselected') || classText.includes('selected')) score += 25;
            candidates.push({ element, score, text, rect });
        });

        return candidates
            .sort((a, b) => b.score - a.score)
            .map(item => item.element);
    }

    function dispatchAutocompleteEvent(control, type, init) {
        if (!control) {
            return;
        }
        const doc = control.ownerDocument;
        const view = doc.defaultView || window;
        const config = Object.assign({
            bubbles: true,
            cancelable: true
        }, init || {});
        try {
            let event;
            if (type === 'beforeinput' || type === 'input') {
                const Constructor = view.InputEvent || view.Event;
                event = new Constructor(type, config);
            }
            else if (type.indexOf('key') === 0) {
                event = new view.KeyboardEvent(type, config);
            }
            else {
                event = new view.Event(type, config);
            }
            control.dispatchEvent(event);
        }
        catch (error) {
            const event = doc.createEvent('Event');
            event.initEvent(type, true, true);
            control.dispatchEvent(event);
        }
    }

    function triggerAutocompleteFrameworkEvents(control, key) {
        if (!control) {
            return;
        }
        const view = control.ownerDocument.defaultView || window;
        try {
            if (view.jQuery) {
                const $control = view.jQuery(control);
                $control.trigger('input');
                $control.trigger('keyup');
                $control.trigger('propertychange');
            }
        }
        catch (error) {
            // 页面未使用jQuery或节点已被重绘时忽略。
        }

        dispatchAutocompleteEvent(control, 'keyup', {
            key: key || '',
            code: '',
            keyCode: 0,
            which: 0
        });
    }

    async function typeIntoAutocompleteControl(control, value) {
        const text = plain(value);
        if (!control || !text) {
            return false;
        }

        try {
            control.focus();
            if (typeof control.select === 'function') {
                control.select();
            }
        }
        catch (error) {
            // 旧控件不支持select时继续。
        }

        /* 不能调用dispatchInputEvents：该函数末尾会blur，正是候选框不弹的根因。 */
        if (!control.isContentEditable && control.tagName !== 'SELECT') {
            nativeValueSetter(control, '');
        }
        else if (control.isContentEditable) {
            control.textContent = '';
        }
        dispatchAutocompleteEvent(control, 'input', {
            data: null,
            inputType: 'deleteContentBackward'
        });
        triggerAutocompleteFrameworkEvents(control, 'Backspace');
        await outpatientOrderWait(60);

        let current = '';
        for (const character of Array.from(text)) {
            await outpatientOrderCheckpoint();
            current += character;
            dispatchAutocompleteEvent(control, 'keydown', {
                key: character,
                code: '',
                keyCode: 0,
                which: 0
            });
            dispatchAutocompleteEvent(control, 'beforeinput', {
                data: character,
                inputType: 'insertText'
            });

            if (control.isContentEditable) {
                control.textContent = current;
            }
            else {
                nativeValueSetter(control, current);
            }

            dispatchAutocompleteEvent(control, 'input', {
                data: character,
                inputType: 'insertText'
            });
            dispatchAutocompleteEvent(control, 'keyup', {
                key: character,
                code: '',
                keyCode: 0,
                which: 0
            });
            triggerAutocompleteFrameworkEvents(control, character);
            await outpatientOrderWait(75);
        }

        try {
            control.focus();
        }
        catch (error) {
            // 忽略。
        }
        return true;
    }

    function setHospitalControlValueWithoutBlur(control, value, options) {
        if (!control || value == null || String(value) === '') {
            return false;
        }
        const text = String(value);
        const config = options || {};
        try {
            control.focus();
            if (config.selectAll !== false && typeof control.select === 'function') {
                control.select();
            }
        }
        catch (error) {
            // 忽略。
        }

        if (control.tagName === 'SELECT') {
            const option = Array.from(control.options || []).find(item =>
                normalizedUiText(item.textContent) === normalizedUiText(text) ||
                normalizedUiText(item.value) === normalizedUiText(text)
            );
            control.value = option ? option.value : text;
        }
        else if (control.isContentEditable) {
            control.textContent = text;
        }
        else {
            nativeValueSetter(control, text);
        }

        dispatchAutocompleteEvent(control, 'input', {
            data: text,
            inputType: 'insertReplacementText'
        });
        if (config.change !== false) {
            dispatchAutocompleteEvent(control, 'change');
        }
        triggerAutocompleteFrameworkEvents(control, text.slice(-1));
        return true;
    }

    function dispatchGridCellActivation(cell, doubleClick) {
        if (!cell || !isVisible(cell)) {
            return false;
        }

        const doc = cell.ownerDocument;
        const view = doc.defaultView || window;
        const rect = cell.getBoundingClientRect();
        const clientX = Math.max(rect.left + 3, Math.min(rect.right - 3, (rect.left + rect.right) / 2));
        const clientY = Math.max(rect.top + 3, Math.min(rect.bottom - 3, (rect.top + rect.bottom) / 2));
        const hit = doc.elementFromPoint(clientX, clientY);
        const target = hit && cell.contains(hit) ? hit : cell;
        const snapshot = captureElementScrollState(cell);

        const types = ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'];
        if (doubleClick) {
            types.push('dblclick');
        }

        let dispatched = false;
        types.forEach(type => {
            try {
                target.dispatchEvent(new view.MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view,
                    button: 0,
                    buttons: type === 'mousedown' ? 1 : 0,
                    detail: type === 'dblclick' ? 2 : 1,
                    clientX,
                    clientY
                }));
                dispatched = true;
            }
            catch (error) {
                // 继续尝试其他事件。
            }
        });

        restoreElementScrollState(snapshot);
        return dispatched;
    }

    async function activateOutpatientCellEditor(cell, timeout) {
        if (!cell) {
            return null;
        }

        const wait = Math.max(300, Number(timeout) || 1600);
        const doc = cell.ownerDocument;
        const originalRect = cell.getBoundingClientRect();

        /*
         * 不能使用clickVisibleElement(cell)：该通用函数会把td提升为closest('tr')，
         * 实际只选中整行，名称/剂量编辑器不会出现。这里直接在单元格中心派发
         * 一次真实点击；若单击未激活，再补一次双击。
         */
        dispatchGridCellActivation(cell, false);

        const deadline = Date.now() + wait;
        let doubleClickSent = false;
        while (Date.now() < deadline) {
            await outpatientOrderCheckpoint();

            const inside = editableControl(cell);
            if (inside) {
                return inside;
            }

            /*
             * EasyUI的datagrid editor有时被挂到单元格外层，按屏幕重叠位置寻找
             * 当前激活的input，而不是要求input必须是td的子节点。
             */
            const nearby = visibleElements(
                doc,
                'input:not([type="hidden"]),textarea,select,[contenteditable="true"]'
            ).filter(control => {
                if (isOwnAssistantUi(control)) {
                    return false;
                }
                const rect = control.getBoundingClientRect();
                const centerX = (rect.left + rect.right) / 2;
                const centerY = (rect.top + rect.bottom) / 2;
                return (
                    centerX >= originalRect.left - 16 &&
                    centerX <= originalRect.right + 16 &&
                    centerY >= originalRect.top - 18 &&
                    centerY <= originalRect.bottom + 18
                );
            }).sort((first, second) => {
                const a = first.getBoundingClientRect();
                const b = second.getBoundingClientRect();
                return Math.abs(a.left - originalRect.left) - Math.abs(b.left - originalRect.left);
            });

            if (nearby[0]) {
                return nearby[0];
            }

            if (!doubleClickSent && Date.now() > deadline - wait + 360) {
                doubleClickSent = true;
                dispatchGridCellActivation(cell, true);
            }

            await sleep(60);
        }

        return null;
    }

    async function lookupAndSelectInCell(cell, text, options) {
        const value = plain(text);
        if (!value) {
            return true;
        }
        const config = options || {};
        const control = editableControl(cell);
        if (!control) {
            throw new Error('目标单元格没有可编辑检索框：' + value);
        }
        clickVisibleElement(control);
        await outpatientOrderWait(80);
        setHospitalControlValue(control, value);
        await outpatientOrderWait(260);
        let candidates = candidateElementsForLookup(control, value);
        if (!candidates.length && config.pressEnterFirst !== false) {
            dispatchKeyboard(control, 'Enter', 13);
            await outpatientOrderWait(300);
            candidates = candidateElementsForLookup(control, value);
        }
        if (!candidates.length) {
            if (control.tagName === 'SELECT') {
                return true;
            }
            throw new Error('未找到检索候选项：' + value);
        }
        clickVisibleElement(candidates[0]);
        await outpatientOrderWait(260);
        return true;
    }

    async function setOrderFieldByHeader(context, header, value, occurrence, popup) {
        if (!plain(value)) {
            return true;
        }
        const cell = rowCellByHeader(context.table, context.row, header, occurrence);
        if (!cell) {
            return false;
        }
        if (popup) {
            return lookupAndSelectInCell(cell, value, { pressEnterFirst: true });
        }
        const control = editableControl(cell);
        if (!control) {
            return false;
        }
        setHospitalControlValue(control, value);
        await outpatientOrderWait(80);
        return true;
    }

    /*
     * 门诊西药处方和中药（新）一样，必须先点击底部“新处方”才会生成
     * 第1行。旧版直接寻找首行，因此空处方页面固定报“没有可用首行”。
     * 以下逻辑改为：单次点击新处方 → 使用当前焦点名称编辑器录入第1项
     * → 后续药品点击最右侧加号新增行。
     */
    function bestWesternMedicineTable() {
        let best = null;
        let bestScore = -Infinity;

        visibleHospitalTables().forEach(table => {
            const entries = tableHeaderEntries(table);
            const keys = entries.map(entry => entry.key);
            const rect = table.getBoundingClientRect();
            const has = text => keys.some(key => key === normalizedUiText(text) || key.includes(normalizedUiText(text)));

            let score = 0;
            score += has('名称') ? 34 : 0;
            score += has('规格') ? 12 : 0;
            score += has('每次剂量') || has('剂量') ? 22 : 0;
            score += has('用法') ? 22 : 0;
            score += has('频次') ? 18 : 0;
            score += has('药品总量') || has('数量') ? 18 : 0;
            score += has('操作') ? 14 : 0;
            score += Math.min(12, rect.width / 120);

            /* 中药双列表格会出现两个名称列，西药表格通常只有一个。 */
            const nameCount = entries.filter(entry => entry.key === normalizedUiText('名称')).length;
            if (nameCount > 1) {
                score -= 55;
            }

            if (score > bestScore) {
                best = table;
                bestScore = score;
            }
        });

        return bestScore > 48 ? best : null;
    }

    function westernMedicineGridRoot(table) {
        if (!table) {
            return null;
        }
        return table.closest('.datagrid-view') ||
            table.closest('.datagrid-wrap') ||
            table.closest('.datagrid') ||
            table.parentElement;
    }

    function isWesternMedicineBodyRow(row) {
        if (!row || !isVisible(row) || isOwnAssistantUi(row)) {
            return false;
        }

        const cells = Array.from(row.querySelectorAll(':scope > td')).filter(isVisible);
        const rect = row.getBoundingClientRect();
        if (cells.length < 10 || rect.width < 620 || rect.height < 12) {
            return false;
        }

        const rowText = normalizedUiText(row.textContent || '');
        if (
            rowText.includes(normalizedUiText('处方号组号基本信息每次剂量')) ||
            rowText.includes(normalizedUiText('名称规格单价剂量单位用法'))
        ) {
            return false;
        }

        const classText = normalizedUiText(row.className || '');
        const inBody = Boolean(row.closest('.datagrid-body'));
        const hasControl = Boolean(
            row.querySelector('input,select,textarea,[contenteditable="true"],input[type="checkbox"]')
        );
        const hasOperation = Array.from(
            row.querySelectorAll('button,a,span,i,[role="button"]')
        ).some(element => {
            if (!isVisible(element)) {
                return false;
            }
            const elementRect = element.getBoundingClientRect();
            if (elementRect.left < rect.left + rect.width * 0.86) {
                return false;
            }
            const text = normalizedUiText(
                (element.textContent || '') + ' ' +
                (element.title || '') + ' ' +
                (element.className || '')
            );
            return text.includes('plus') || text.includes('add') ||
                text.includes('新增') || text === '+';
        });

        return inBody || classText.includes('datagridrow') || hasControl || hasOperation;
    }

    function westernMedicineDataRows(table) {
        if (!table) {
            return [];
        }

        const root = westernMedicineGridRoot(table);
        const candidates = [];
        const seen = new Set();
        const addRows = rows => {
            Array.from(rows || []).forEach(row => {
                if (!seen.has(row)) {
                    seen.add(row);
                    candidates.push(row);
                }
            });
        };

        if (root) {
            addRows(root.querySelectorAll('.datagrid-body tr.datagrid-row'));
            addRows(root.querySelectorAll('.datagrid-body tbody > tr'));
        }
        addRows(table.querySelectorAll('tbody > tr'));

        /*
         * 部分EasyUI页面把表头和数据体拆成不同table，按屏幕位置补扫。
         */
        const headerRect = table.getBoundingClientRect();
        allDocuments().forEach(doc => {
            visibleElements(doc, 'tr').forEach(row => {
                if (seen.has(row) || isOwnAssistantUi(row)) {
                    return;
                }
                const rect = row.getBoundingClientRect();
                if (
                    rect.top < headerRect.bottom - 8 ||
                    rect.top > headerRect.bottom + 520 ||
                    rect.width < Math.max(620, headerRect.width * 0.60)
                ) {
                    return;
                }
                const overlap = Math.max(
                    0,
                    Math.min(rect.right, headerRect.right) - Math.max(rect.left, headerRect.left)
                );
                if (overlap / Math.max(1, Math.min(rect.width, headerRect.width)) < 0.68) {
                    return;
                }
                seen.add(row);
                candidates.push(row);
            });
        });

        /* 冻结列和普通列可能生成同一Y坐标的两条tr，保留更宽、单元格更多者。 */
        const grouped = [];
        candidates
            .filter(isWesternMedicineBodyRow)
            .sort((a, b) => {
                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();
                if (Math.abs(ar.top - br.top) > 4) {
                    return ar.top - br.top;
                }
                return br.width - ar.width;
            })
            .forEach(row => {
                const rect = row.getBoundingClientRect();
                const existingIndex = grouped.findIndex(item =>
                    Math.abs(item.getBoundingClientRect().top - rect.top) < 4
                );
                if (existingIndex < 0) {
                    grouped.push(row);
                    return;
                }
                const existing = grouped[existingIndex];
                const existingRect = existing.getBoundingClientRect();
                const rowCells = row.querySelectorAll(':scope > td').length;
                const existingCells = existing.querySelectorAll(':scope > td').length;
                if (rect.width > existingRect.width + 20 || rowCells > existingCells) {
                    grouped[existingIndex] = row;
                }
            });

        return grouped.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    }

    function westernHeaderCenters(table, headerText) {
        const key = normalizedUiText(headerText);
        const entries = tableHeaderEntries(table);
        const exact = entries.filter(entry => entry.key === key);
        const source = exact.length ? exact : entries.filter(entry => entry.key.includes(key));
        const unique = [];
        source.sort((a, b) => a.center - b.center).forEach(entry => {
            if (!unique.some(item => Math.abs(item.center - entry.center) < 8)) {
                unique.push(entry);
            }
        });
        return unique;
    }

    function westernMedicineCell(context, headerNames, occurrence) {
        if (!context || !context.table || !context.row) {
            return null;
        }
        const names = Array.isArray(headerNames) ? headerNames : [headerNames];
        const index = Math.max(0, Number(occurrence) || 0);
        for (const name of names) {
            const entries = westernHeaderCenters(context.table, name);
            const entry = entries[index] || entries[0];
            if (entry) {
                return rowCellAtCenter(context.row, entry.center);
            }
        }
        return null;
    }

    function findWesternMedicineAddButton(row) {
        if (!row) {
            return null;
        }
        const rowRect = row.getBoundingClientRect();
        const candidates = [];
        Array.from(row.querySelectorAll('button,a,span,i,[role="button"]')).forEach(element => {
            if (!isVisible(element) || isDisabledUiControl(elementClickableTarget(element) || element)) {
                return;
            }
            const rect = element.getBoundingClientRect();
            if (rect.left < rowRect.left + rowRect.width * 0.84) {
                return;
            }
            const text = normalizedUiText(
                (element.textContent || '') + ' ' +
                (element.title || '') + ' ' +
                (element.className || '')
            );
            let score = 0;
            if (text === '+' || text.includes('plus')) score += 130;
            if (text.includes('add') || text.includes('新增') || text.includes('添加')) score += 100;
            if (text.includes('minus') || text.includes('remove') || text.includes('删除')) score -= 160;
            score += Math.max(0, 50 - Math.abs(rowRect.right - rect.right));
            if (score > 0) {
                candidates.push({ element, score });
            }
        });
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0] ? candidates[0].element : null;
    }

    async function waitWesternMedicineRows(minimum, timeout) {
        const deadline = Date.now() + Math.max(500, Number(timeout) || 2800);
        while (Date.now() < deadline) {
            await outpatientOrderCheckpoint();
            const table = bestWesternMedicineTable();
            const rows = westernMedicineDataRows(table);
            if (table && rows.length >= minimum) {
                return { table, rows };
            }
            await sleep(80);
        }
        return null;
    }

    function focusedWesternMedicineNameEditor() {
        const table = bestWesternMedicineTable();
        const nameHeaders = table ? westernHeaderCenters(table, '名称') : [];
        const nameHeader = nameHeaders[0] || null;
        const headerRect = table ? table.getBoundingClientRect() : null;

        for (const doc of allDocuments()) {
            const active = doc.activeElement;
            if (!active || !isVisible(active) || isOwnAssistantUi(active)) {
                continue;
            }
            if (!active.matches('input:not([type="hidden"]),textarea,[contenteditable="true"]')) {
                continue;
            }
            const rect = active.getBoundingClientRect();
            if (headerRect && rect.top < headerRect.bottom - 14) {
                continue;
            }
            if (nameHeader && Math.abs(((rect.left + rect.right) / 2) - nameHeader.center) > 115) {
                continue;
            }
            return active;
        }
        return null;
    }

    async function startNewWesternMedicinePrescription() {
        await clickOutpatientOrderTab('西药处方');
        await outpatientOrderCheckpoint();
        await outpatientOrderWait(420);

        const candidate = outpatientNewPrescriptionCandidates({ includeDisabled: false })[0] || null;
        if (!candidate) {
            throw new Error('门诊西药页面未定位到下方“新处方”按钮。');
        }
        if (!clickOutpatientNewPrescriptionOnce(candidate)) {
            throw new Error('已定位西药“新处方”按钮，但未能派发有效点击。');
        }

        /* 只点击一次，不因暂时识别不到首行而重复创建处方。 */
        state.outpatientWesternDirectEditor = null;
        const deadline = Date.now() + 1900;
        while (Date.now() < deadline) {
            await outpatientOrderCheckpoint();
            state.outpatientWesternDirectEditor = focusedWesternMedicineNameEditor();
            if (state.outpatientWesternDirectEditor) {
                break;
            }
            await sleep(60);
        }
        return {
            direct: true,
            editor: state.outpatientWesternDirectEditor || null
        };
    }

    async function ensureWesternMedicineRow(rowIndex) {
        let ready = await waitWesternMedicineRows(1, 3000);
        if (!ready) {
            throw new Error('已点击“新处方”，但未识别到门诊西药首行。');
        }

        let table = ready.table;
        let rows = ready.rows;
        while (rows.length <= rowIndex) {
            const beforeCount = rows.length;
            const plus = findWesternMedicineAddButton(rows[rows.length - 1]);
            if (!plus) {
                throw new Error('未找到西药处方最右侧操作列的新增加号。');
            }

            const clickTarget = elementClickableTarget(plus) || plus;
            if (!dispatchMouseSequenceAtElement(clickTarget)) {
                throw new Error('已找到西药新增加号，但点击失败。');
            }

            const deadline = Date.now() + 3200;
            let added = false;
            while (Date.now() < deadline) {
                await outpatientOrderWait(100);
                table = bestWesternMedicineTable();
                rows = westernMedicineDataRows(table);
                if (rows.length > beforeCount) {
                    added = true;
                    break;
                }
            }
            if (!added) {
                throw new Error('已点击西药新增加号，但没有生成下一行。');
            }
        }

        return { table, row: rows[rowIndex] };
    }

    function normalizedWesternDrugName(value) {
        return normalizedUiText(value)
            .replace(/[★☆*]/g, '')
            .replace(/[【】\[\]]/g, '');
    }

    async function selectWesternMedicineNameByControl(control, drugName) {
        const value = plain(drugName);
        if (!control || !value) {
            throw new Error('西药名称为空或名称检索输入框不存在。');
        }

        await typeIntoAutocompleteControl(control, value);
        const target = normalizedWesternDrugName(value);

        const waitCandidates = async timeout => {
            const deadline = Date.now() + Math.max(400, Number(timeout) || 2400);
            while (Date.now() < deadline) {
                await outpatientOrderCheckpoint();
                const candidates = candidateElementsForLookup(control, value)
                    .filter(candidate => {
                        const text = normalizedWesternDrugName(candidate.textContent || '');
                        return text && (text.includes(target) || target.includes(text));
                    })
                    .sort((first, second) => {
                        const firstText = normalizedWesternDrugName(first.textContent || '');
                        const secondText = normalizedWesternDrugName(second.textContent || '');
                        const firstExact = firstText === target ? 1 : 0;
                        const secondExact = secondText === target ? 1 : 0;
                        return secondExact - firstExact;
                    });
                if (candidates.length) {
                    return candidates;
                }
                await sleep(80);
            }
            return [];
        };

        let candidates = await waitCandidates(2600);
        if (!candidates.length) {
            try {
                control.focus();
            }
            catch (error) {
                // 忽略。
            }
            dispatchKeyboard(control, 'ArrowDown', 40);
            triggerAutocompleteFrameworkEvents(control, 'ArrowDown');
            candidates = await waitCandidates(1000);
        }

        if (!candidates.length) {
            throw new Error('已键入西药名称“' + value + '”，但医院未弹出可选择的候选项。');
        }

        const candidate = candidates[0];
        const clickTarget = elementClickableTarget(candidate) || candidate;
        if (!dispatchMouseSequenceAtElement(clickTarget)) {
            throw new Error('已找到西药候选项“' + value + '”，但点击确认失败。');
        }
        await outpatientOrderWait(320);

        if (isVisible(control) && normalizedWesternDrugName(controlValue(control)).includes(target)) {
            dispatchKeyboard(control, 'Enter', 13);
        }
        await outpatientOrderWait(480);
        return true;
    }

    async function selectWesternMedicineName(cell, drugName) {
        if (!cell || !plain(drugName)) {
            throw new Error('西药名称为空或名称单元格不存在。');
        }
        const control = await activateOutpatientCellEditor(cell, 1800);
        if (!control) {
            throw new Error('点击名称单元格后未出现西药检索输入框：' + drugName);
        }
        return selectWesternMedicineNameByControl(control, drugName);
    }

    async function writeWesternMedicineField(context, headerNames, value, occurrence, popup) {
        if (!plain(value)) {
            return true;
        }
        const cell = westernMedicineCell(context, headerNames, occurrence);
        if (!cell) {
            return false;
        }
        const control = await activateOutpatientCellEditor(cell, 1800);
        if (!control) {
            return false;
        }

        if (popup) {
            if (control.tagName === 'SELECT') {
                const target = normalizedUiText(value);
                const option = Array.from(control.options || []).find(item => {
                    const text = normalizedUiText(item.textContent || item.value || '');
                    return text === target || text.includes(target) || target.includes(text);
                });
                if (!option) {
                    return false;
                }
                control.value = option.value;
                dispatchAutocompleteEvent(control, 'input');
                dispatchAutocompleteEvent(control, 'change');
                await outpatientOrderWait(100);
                dispatchKeyboard(control, 'Enter', 13);
                await outpatientOrderWait(180);
                return true;
            }

            await typeIntoAutocompleteControl(control, value);
            let candidates = [];
            const deadline = Date.now() + 1900;
            while (Date.now() < deadline) {
                await outpatientOrderCheckpoint();
                candidates = candidateElementsForLookup(control, value);
                if (candidates.length) {
                    break;
                }
                await sleep(80);
            }
            if (candidates.length) {
                const clickTarget = elementClickableTarget(candidates[0]) || candidates[0];
                dispatchMouseSequenceAtElement(clickTarget);
                await outpatientOrderWait(240);
                return true;
            }

            /* 部分EasyUI下拉框支持输入后直接Enter确认。 */
            dispatchKeyboard(control, 'Enter', 13);
            await outpatientOrderWait(220);
            return normalizedUiText(controlValue(control)).includes(normalizedUiText(value));
        }

        setHospitalControlValueWithoutBlur(control, value, {
            selectAll: true,
            change: false
        });
        await outpatientOrderWait(80);
        dispatchKeyboard(control, 'Enter', 13);
        await outpatientOrderWait(220);
        if (isVisible(control) && plain(controlValue(control)) === plain(value)) {
            dispatchKeyboard(control, 'Tab', 9);
            await outpatientOrderWait(150);
        }
        return true;
    }


    /*
     * 门诊西药用法统一翻译。
     * 医嘱草稿可继续填写po、ivdrip、im等临床缩写，真正操作医院
     * “用法”列前转换成该下拉框显示的中文名称。
     */
    const OUTPATIENT_ROUTE_ALIASES = Object.freeze([
        { name: '口服', codes: ['po', 'kf', '口服给药'] },
        { name: '含化', codes: ['hh'] },
        { name: '局部麻醉', codes: ['jbmz', '局麻'] },
        { name: '皮下注射', codes: ['pxzs', 'sc', 'subcut', '皮下'] },
        { name: '舌下用药', codes: ['sxyy', '舌下'] },
        { name: '肌肉注射', codes: ['jrzs', 'im', '肌注', '肌内注射'] },
        { name: '局部用药', codes: ['jbyy', '局部给药'] },
        { name: '外用', codes: ['wy'] },
        { name: '冲管', codes: ['cg'] },
        { name: '鼻饲', codes: ['bs', '鼻饲给药'] },
        { name: '领药', codes: ['ly'] },
        { name: '穴位注射', codes: ['xwzs'] },
        { name: '胃管注入', codes: ['wgzr', '胃管给药'] },
        { name: '皮试', codes: ['ps'] },
        { name: '静脉滴注', codes: ['jmdz', 'ivdrip', 'ivgtt', 'ivd', '静滴', '静脉输液', '静脉点滴'] },
        { name: '静脉注射', codes: ['jmzs', 'iv', 'ivpush', '静注'] },
        { name: '雾化', codes: ['wh', '雾化吸入', 'nebulization'] },
        { name: '外敷', codes: ['wf'] },
        { name: '冲洗', codes: ['cx'] },
        { name: '耗材', codes: ['hc'] },
        { name: '注射用药', codes: ['zsyy', '注射'] },
        { name: '阴道用药', codes: ['ydyy', '阴道给药'] },
        { name: '关节腔内用药', codes: ['gjqnyy', '关节腔注射'] },
        { name: '喷雾用药', codes: ['pwyy', '喷雾'] },
        { name: '滴眼', codes: ['dy', '眼用', '滴眼用药'] },
        { name: '喷喉', codes: ['ph', '咽喉喷雾'] },
        { name: '敷伤口', codes: ['fsk', '伤口外敷'] },
        { name: '擦皮肤', codes: ['cpf', '皮肤涂擦'] },
        { name: '滴鼻', codes: ['db', '鼻用'] },
        { name: '直肠用药', codes: ['zcyy', '灌肠', '直肠给药'] },
        { name: '吸入用药', codes: ['xryy', '吸入'] },
        { name: '皮内注射', codes: ['pnzs', '皮内'] }
    ]);

    function normalizeOutpatientRoute(value) {
        const original = plain(value);
        const normalized = normalizedUiText(original)
            .replace(/[()（）\[\]【】]/g, '');
        if (!normalized) {
            return '';
        }
        const matched = OUTPATIENT_ROUTE_ALIASES.find(item => {
            if (normalizedUiText(item.name) === normalized) {
                return true;
            }
            return item.codes.some(code => {
                const key = normalizedUiText(code)
                    .replace(/[()（）\[\]【】]/g, '');
                return key === normalized;
            });
        });
        return matched ? matched.name : original;
    }


    function selectOverlappingWesternMedicineCell(cell) {
        if (!cell) {
            return null;
        }
        const direct = Array.from(cell.querySelectorAll('select')).find(isVisible);
        if (direct) {
            return direct;
        }
        const cellRect = cell.getBoundingClientRect();
        const candidates = [];
        allDocuments().forEach(doc => {
            visibleElements(doc, 'select').forEach(select => {
                if (isOwnAssistantUi(select)) {
                    return;
                }
                const rect = select.getBoundingClientRect();
                const overlapX = Math.max(0, Math.min(rect.right, cellRect.right) - Math.max(rect.left, cellRect.left));
                const overlapY = Math.max(0, Math.min(rect.bottom, cellRect.bottom) - Math.max(rect.top, cellRect.top));
                const overlapArea = overlapX * overlapY;
                const selectArea = Math.max(1, rect.width * rect.height);
                if (overlapArea / selectArea >= 0.42) {
                    candidates.push({ select, score: overlapArea });
                }
            });
        });
        candidates.sort((a, b) => b.score - a.score);
        return candidates.length ? candidates[0].select : null;
    }

    async function chooseWesternMedicineMinimumSelfPay(context) {
        let cell = westernMedicineCell(context, '自付比例', 0);
        if (!cell) {
            return false;
        }
        let select = selectOverlappingWesternMedicineCell(cell);
        if (!select) {
            dispatchMouseSequenceAtElement(cell);
            await outpatientOrderWait(140);
            select = selectOverlappingWesternMedicineCell(cell);
        }
        if (!select) {
            return false;
        }
        const options = Array.from(select.options || [])
            .map((option, index) => ({
                option,
                index,
                number: numericSelectOption(option)
            }))
            .filter(item => item.number != null)
            .sort((a, b) => a.number - b.number || a.index - b.index);
        if (!options.length) {
            return false;
        }
        const minimum = options[0];
        select.selectedIndex = minimum.index;
        try {
            select.value = minimum.option.value;
        }
        catch (error) {
            // selectedIndex已生效时忽略。
        }
        ['input', 'change'].forEach(type => {
            select.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        });
        try {
            const view = select.ownerDocument.defaultView || window;
            if (view.jQuery) {
                view.jQuery(select).val(minimum.option.value).trigger('input').trigger('change');
            }
        }
        catch (error) {
            // 医院页面未使用jQuery管理该下拉框时忽略。
        }
        await outpatientOrderWait(180);
        const selected = select.options && select.options[select.selectedIndex];
        return numericSelectOption(selected) === minimum.number;
    }

    async function fillWestMedicineItem(item, index) {
        const drugName = item.searchName || item.name;
        let context = null;

        /* 首项优先使用“新处方”后医院自动聚焦的名称编辑器，避免重新点标签使其失焦。 */
        if (
            index === 0 &&
            state.outpatientWesternDirectEditor &&
            isVisible(state.outpatientWesternDirectEditor)
        ) {
            const directEditor = state.outpatientWesternDirectEditor;
            state.outpatientWesternDirectEditor = null;
            await selectWesternMedicineNameByControl(directEditor, drugName);
        }
        else {
            await clickOutpatientOrderTab('西药处方');
            context = await ensureWesternMedicineRow(index);
            const nameCell = westernMedicineCell(context, '名称', 0);
            await selectWesternMedicineName(nameCell, drugName);
        }

        /* 药品候选确认后行会重绘，必须重新取得当前行再填写其余字段。 */
        context = await ensureWesternMedicineRow(index);

        if (!(await writeWesternMedicineField(context, ['剂量', '每次剂量'], item.dose, 0, false))) {
            throw new Error('未能填写“每次剂量”。');
        }
        if (!(await writeWesternMedicineField(context, '单位', item.unit, 0, true))) {
            throw new Error('未能选择“每次剂量单位”：' + item.unit);
        }
        const routeText = normalizeOutpatientRoute(item.route);
        if (!(await writeWesternMedicineField(context, '用法', routeText, 0, true))) {
            throw new Error('未能选择“用法”：' + (item.route || routeText));
        }
        if (!(await writeWesternMedicineField(context, '频次', item.frequency, 0, true))) {
            throw new Error('未能选择“频次”：' + item.frequency);
        }
        if (!(await writeWesternMedicineField(context, '天数', item.days, 0, false))) {
            throw new Error('未能填写“天数”。');
        }
        if (!(await writeWesternMedicineField(context, '数量', item.quantity, 0, false))) {
            throw new Error('未能填写“药品总量－数量”。');
        }

        context = await ensureWesternMedicineRow(index);
        if (!(await chooseWesternMedicineMinimumSelfPay(context))) {
            throw new Error('未能将西药自付比例自动选择为最小值。');
        }

        return true;
    }

    function uniqueHeaderCentersByText(table, headerText) {
        const entries = headerCentersByText(table, headerText);
        const unique = [];

        entries.forEach(entry => {
            if (!unique.some(existing => Math.abs(existing.center - entry.center) < 8)) {
                unique.push(entry);
            }
        });

        return unique.sort((a, b) => a.center - b.center);
    }

    function bestTraditionalMedicineTable() {
        let best = null;
        let bestScore = -Infinity;

        visibleHospitalTables().forEach(table => {
            const names = uniqueHeaderCentersByText(table, '名称');
            const doses = uniqueHeaderCentersByText(table, '剂量');
            const quantities = uniqueHeaderCentersByText(table, '数量');
            const specs = uniqueHeaderCentersByText(table, '规格');
            const operations = uniqueHeaderCentersByText(table, '操作');
            const rect = table.getBoundingClientRect();

            let score = 0;
            score += Math.min(2, names.length) * 36;
            score += Math.min(2, doses.length) * 24;
            score += Math.min(2, quantities.length) * 10;
            score += Math.min(2, specs.length) * 8;
            score += operations.length ? 18 : 0;
            score += Math.min(12, rect.width / 120);

            if (names.length < 2 || doses.length < 2) {
                score -= 100;
            }

            if (score > bestScore) {
                best = table;
                bestScore = score;
            }
        });

        return bestScore > 55 ? best : null;
    }

    function traditionalMedicineGridRoot(table) {
        if (!table) {
            return null;
        }

        /*
         * 门诊中药使用EasyUI datagrid时，表头与数据体通常不是同一个table：
         * 表头位于.datagrid-header，真正处方行位于同一.datagrid-view下的
         * .datagrid-body。旧版只在表头table内寻找tr，所以即使空白处方已经
         * 创建，也始终得到0行，继而重复点击“新处方”。
         */
        return table.closest('.datagrid-view') ||
            table.closest('.datagrid-wrap') ||
            table.closest('.datagrid') ||
            table.parentElement;
    }

    function isTraditionalMedicineBodyRow(row) {
        if (!row || !isVisible(row) || isOwnAssistantUi(row)) {
            return false;
        }

        const cells = Array.from(row.querySelectorAll(':scope > td')).filter(isVisible);
        if (cells.length < 8) {
            return false;
        }

        const rect = row.getBoundingClientRect();
        if (rect.width < 360 || rect.height < 12) {
            return false;
        }

        const inBody = Boolean(row.closest('.datagrid-body'));
        const classText = normalizedUiText(row.className || '');
        const rowText = normalizedUiText(row.textContent || '');
        const hasEditorOrSelector = Boolean(
            row.querySelector('input,select,textarea,[contenteditable="true"],input[type="checkbox"]')
        );
        const hasOperationControl = Array.from(
            row.querySelectorAll('button,a,span,i,[role="button"]')
        ).some(element => {
            if (!isVisible(element)) {
                return false;
            }
            const elementRect = element.getBoundingClientRect();
            if (elementRect.left < rect.left + rect.width * 0.82) {
                return false;
            }
            const text = normalizedUiText(
                (element.textContent || '') + ' ' +
                (element.title || '') + ' ' +
                (element.className || '')
            );
            return text.includes('plus') || text.includes('minus') ||
                text.includes('add') || text.includes('remove') ||
                text.includes('新增') || text.includes('删除') ||
                text === '+' || text === '-';
        });

        /* 排除偶然混入的表头行。 */
        if (
            rowText.includes(normalizedUiText('名称规格单价剂量单位数量')) ||
            rowText.includes(normalizedUiText('自付比例操作'))
        ) {
            return false;
        }

        return inBody || classText.includes('datagrid-row') ||
            hasEditorOrSelector || hasOperationControl;
    }

    function traditionalMedicineDataRows(table) {
        if (!table) {
            return [];
        }

        const root = traditionalMedicineGridRoot(table);
        const candidates = [];
        const seen = new Set();
        const addRows = rows => {
            Array.from(rows || []).forEach(row => {
                if (!seen.has(row)) {
                    seen.add(row);
                    candidates.push(row);
                }
            });
        };

        /* 优先取EasyUI真正的数据体；兼容非EasyUI时再回退到当前table。 */
        if (root) {
            addRows(root.querySelectorAll('.datagrid-body tr.datagrid-row'));
            addRows(root.querySelectorAll('.datagrid-body tbody > tr'));
        }
        addRows(table.querySelectorAll('tbody > tr'));

        /*
         * 部分门诊版本把表头、冻结列、普通数据列拆在互不相邻的table中，
         * table.closest('.datagrid-view')也无法覆盖真实数据行。此时不再依赖
         * DOM父子关系，而按屏幕位置补充扫描：只收集位于双列中药表头正下方、
         * 与表头横向大面积重叠的可见行。截图中“新处方”成功后出现的第1行
         * 即可由此识别。
         */
        const headerRect = table.getBoundingClientRect();
        allDocuments().forEach(doc => {
            addRows(visibleElements(doc, 'tr').filter(row => {
                if (isOwnAssistantUi(row)) {
                    return false;
                }
                const rect = row.getBoundingClientRect();
                const overlap = Math.max(
                    0,
                    Math.min(rect.right, headerRect.right) - Math.max(rect.left, headerRect.left)
                );
                const overlapRatio = overlap / Math.max(1, Math.min(rect.width, headerRect.width));
                return (
                    rect.top >= headerRect.bottom - 6 &&
                    rect.top <= headerRect.bottom + 520 &&
                    rect.width >= Math.max(360, headerRect.width * 0.58) &&
                    overlapRatio >= 0.72
                );
            }));
        });

        const rows = candidates.filter(isTraditionalMedicineBodyRow);

        /*
         * EasyUI冻结列与普通列可能各有一条同top的row。只保留单元格更多、
         * 宽度更大的主数据行，避免把同一处方行识别成两行。
         */
        const logicalRows = [];
        rows.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return ar.top - br.top || br.width - ar.width;
        }).forEach(row => {
            const rect = row.getBoundingClientRect();
            const existingIndex = logicalRows.findIndex(existing => {
                const other = existing.getBoundingClientRect();
                return Math.abs(other.top - rect.top) < 4;
            });

            if (existingIndex < 0) {
                logicalRows.push(row);
                return;
            }

            const existing = logicalRows[existingIndex];
            const existingCells = existing.querySelectorAll(':scope > td').length;
            const currentCells = row.querySelectorAll(':scope > td').length;
            const existingRect = existing.getBoundingClientRect();
            if (currentCells > existingCells || rect.width > existingRect.width) {
                logicalRows[existingIndex] = row;
            }
        });

        return logicalRows.sort((a, b) =>
            a.getBoundingClientRect().top - b.getBoundingClientRect().top
        );
    }

    function traditionalMedicineCell(context, headerText, slot) {
        if (!context || !context.table || !context.row) {
            return null;
        }

        const entries = uniqueHeaderCentersByText(context.table, headerText);
        const targetIndex = Math.max(0, Number(slot) || 0);
        const target = entries[targetIndex];
        if (!target) {
            return null;
        }

        /*
         * 门诊双列中药的表头和数据体由EasyUI拆成不同table。只按单元格
         * “中心点最近”定位时，右侧名称列偶尔会再次落到左侧名称列。
         * 这里改为优先计算数据单元格与目标表头横向区间的重叠宽度，
         * 再用中心距离兜底，从而明确区分左、右两组名称和剂量。
         */
        const cells = Array.from(context.row.querySelectorAll(':scope > td')).filter(isVisible);
        if (!cells.length) {
            return null;
        }

        const scored = cells.map(cell => {
            const rect = cell.getBoundingClientRect();
            const overlap = Math.max(
                0,
                Math.min(rect.right, target.right) - Math.max(rect.left, target.left)
            );
            const targetWidth = Math.max(1, target.right - target.left);
            const cellWidth = Math.max(1, rect.width);
            const overlapRatio = overlap / Math.max(1, Math.min(targetWidth, cellWidth));
            const centerDistance = Math.abs(((rect.left + rect.right) / 2) - target.center);
            let score = overlapRatio * 1000 - centerDistance;

            /* 右侧槽位必须位于左右同名表头的分界线右侧，反之亦然。 */
            if (entries.length >= 2) {
                const boundary = (entries[0].center + entries[1].center) / 2;
                const cellCenter = (rect.left + rect.right) / 2;
                if (targetIndex === 0 && cellCenter > boundary) score -= 1200;
                if (targetIndex === 1 && cellCenter < boundary) score -= 1200;
            }
            return { cell, score };
        }).sort((a, b) => b.score - a.score);

        return scored[0] && scored[0].score > -900
            ? scored[0].cell
            : rowCellAtCenter(context.row, target.center);
    }

    function findTraditionalMedicineAddButton(row) {
        if (!row) {
            return null;
        }

        const rowRect = row.getBoundingClientRect();
        const candidates = Array.from(row.querySelectorAll('button,a,span,i')).filter(element => {
            if (!isVisible(element)) {
                return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.left > rowRect.left + rowRect.width * 0.82;
        });

        const scored = candidates.map(element => {
            const text = normalizedUiText(
                (element.textContent || '') + ' ' +
                (element.title || '') + ' ' +
                (element.className || '')
            );
            const rect = element.getBoundingClientRect();
            let score = 0;
            if (text.includes('新增') || text.includes('添加')) score += 120;
            if (text.includes('plus') || text.includes('add')) score += 110;
            if (text === '+') score += 100;
            if (text.includes('minus') || text.includes('remove') || text.includes('delete')) score -= 120;
            score += rect.left / 1000;
            return { element, score };
        }).sort((a, b) => b.score - a.score);

        if (scored[0] && scored[0].score > 25) {
            return scored[0].element;
        }

        /* 操作列通常固定为先加号、后减号。 */
        const rightMost = candidates.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        return rightMost.length >= 2 ? rightMost[rightMost.length - 2] : rightMost[0] || null;
    }

    async function waitTraditionalMedicineRows(minimum, timeout) {
        const deadline = Date.now() + Math.max(800, Number(timeout) || 4500);
        while (Date.now() < deadline) {
            await outpatientOrderCheckpoint();
            const table = bestTraditionalMedicineTable();
            const rows = traditionalMedicineDataRows(table);
            if (table && rows.length >= minimum) {
                return { table, rows };
            }
            await sleep(100);
        }
        return null;
    }

    function isDisabledUiControl(element) {
        if (!element) {
            return true;
        }
        const target = elementClickableTarget(element) || element;
        const classText = normalizedUiText(target.className || '');
        return Boolean(
            target.disabled ||
            target.getAttribute('disabled') !== null ||
            target.getAttribute('aria-disabled') === 'true' ||
            classText.includes('disabled') ||
            classText.includes('is-disabled')
        );
    }

    function captureElementScrollState(element) {
        const records = [];
        const seen = new Set();
        let current = element;

        while (current) {
            if (!seen.has(current)) {
                seen.add(current);
                records.push({
                    element: current,
                    left: Number(current.scrollLeft) || 0,
                    top: Number(current.scrollTop) || 0
                });
            }
            current = current.parentElement;
        }

        const doc = element && element.ownerDocument;
        const view = doc && doc.defaultView;
        return {
            records,
            view,
            windowX: view ? (view.pageXOffset || 0) : 0,
            windowY: view ? (view.pageYOffset || 0) : 0
        };
    }

    function restoreElementScrollState(snapshot) {
        if (!snapshot) {
            return;
        }

        snapshot.records.forEach(record => {
            try {
                record.element.scrollLeft = record.left;
                record.element.scrollTop = record.top;
            }
            catch (error) {
                // 节点已被医院页面重绘时忽略。
            }
        });

        if (snapshot.view) {
            try {
                snapshot.view.scrollTo(snapshot.windowX, snapshot.windowY);
            }
            catch (error) {
                // 忽略。
            }
        }
    }

    function dispatchMouseSequenceAtElement(element) {
        if (!element || !isVisible(element)) {
            return false;
        }

        const doc = element.ownerDocument;
        const view = doc.defaultView || window;
        const rect = element.getBoundingClientRect();
        const clientX = Math.max(rect.left + 2, Math.min(rect.right - 2, (rect.left + rect.right) / 2));
        const clientY = Math.max(rect.top + 2, Math.min(rect.bottom - 2, (rect.top + rect.bottom) / 2));

        const eventTypes = [
            'pointerover',
            'mouseover',
            'mousemove',
            'pointerdown',
            'mousedown',
            'pointerup',
            'mouseup',
            'click'
        ];

        let dispatched = false;
        eventTypes.forEach(type => {
            try {
                let event;
                if (type.indexOf('pointer') === 0 && typeof view.PointerEvent === 'function') {
                    event = new view.PointerEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        view,
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true,
                        button: 0,
                        buttons: type.indexOf('down') >= 0 ? 1 : 0,
                        clientX,
                        clientY
                    });
                }
                else {
                    event = new view.MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        view,
                        button: 0,
                        buttons: type.indexOf('down') >= 0 ? 1 : 0,
                        clientX,
                        clientY
                    });
                }
                element.dispatchEvent(event);
                dispatched = true;
            }
            catch (error) {
                try {
                    const event = doc.createEvent('MouseEvents');
                    event.initMouseEvent(
                        type,
                        true,
                        true,
                        view,
                        1,
                        0,
                        0,
                        clientX,
                        clientY,
                        false,
                        false,
                        false,
                        false,
                        0,
                        null
                    );
                    element.dispatchEvent(event);
                    dispatched = true;
                }
                catch (ignore) {
                    // 继续尝试后续事件。
                }
            }
        });

        return dispatched;
    }

    function clickElementAtCurrentPosition(element) {
        if (!element || !isVisible(element)) {
            return false;
        }

        const snapshot = captureElementScrollState(element);
        const doc = element.ownerDocument;
        const rect = element.getBoundingClientRect();
        const centerX = (rect.left + rect.right) / 2;
        const centerY = (rect.top + rect.bottom) / 2;
        const hit = doc.elementFromPoint(centerX, centerY);

        /*
         * 优先点击鼠标在该坐标真正命中的节点。图标字体按钮常见结构为
         * <a><i></i><span>新处方</span></a>，医院事件可能绑定在任一层。
         */
        const targets = [];
        const add = target => {
            if (target && isVisible(target) && !targets.includes(target)) {
                targets.push(target);
            }
        };

        add(hit);
        add(element);
        add(elementClickableTarget(hit));
        add(elementClickableTarget(element));

        let result = false;
        for (const target of targets) {
            result = dispatchMouseSequenceAtElement(target) || result;

            try {
                if (typeof target.click === 'function') {
                    target.click();
                    result = true;
                }
            }
            catch (error) {
                // 继续尝试下一层。
            }

            try {
                const view = target.ownerDocument.defaultView || window;
                if (view.jQuery) {
                    view.jQuery(target).trigger('click');
                    result = true;
                }
            }
            catch (error) {
                // 页面未使用jQuery或节点已重绘时忽略。
            }
        }

        /* 点击本身不得改变页面或表格的横向位置。 */
        restoreElementScrollState(snapshot);
        window.setTimeout(() => restoreElementScrollState(snapshot), 0);
        window.setTimeout(() => restoreElementScrollState(snapshot), 120);
        return result;
    }

    function outpatientNewPrescriptionCandidates(options) {
        const candidates = [];
        const includeDisabled = Boolean(options && options.includeDisabled);

        allDocuments().forEach(doc => {
            visibleElements(
                doc,
                'button,a,span,div,i,input[type="button"],input[type="submit"],[role="button"]'
            ).forEach(element => {
                if (isOwnAssistantUi(element)) {
                    return;
                }

                const text = normalizedUiText(
                    element.value || element.textContent || element.title || ''
                );
                if (text !== normalizedUiText('新处方')) {
                    return;
                }

                const rect = element.getBoundingClientRect();
                if (rect.width < 8 || rect.height < 8) {
                    return;
                }

                const target = elementClickableTarget(element) || element;
                if (!target || !isVisible(target)) {
                    return;
                }
                if (!includeDisabled && isDisabledUiControl(target)) {
                    return;
                }

                const targetRect = target.getBoundingClientRect();
                const view = doc.defaultView || window;
                const viewWidth = Math.max(1, view.innerWidth || doc.documentElement.clientWidth || 1);
                const viewHeight = Math.max(1, view.innerHeight || doc.documentElement.clientHeight || 1);
                const targetText = normalizedUiText(target.textContent || target.value || '');
                const parentText = normalizedUiText(
                    (target.parentElement && target.parentElement.textContent) || ''
                );
                const tag = String(target.tagName || '').toLowerCase();
                const classText = normalizedUiText(target.className || '');

                let score = 100;
                if (targetText === normalizedUiText('新处方')) score += 80;
                if (tag === 'button' || tag === 'a' || tag === 'input') score += 70;
                if (/btn|button|primary|info/.test(classText)) score += 30;
                if (targetRect.top > viewHeight * 0.60) score += 45;
                if (targetRect.left > viewWidth * 0.38 && targetRect.left < viewWidth * 0.78) score += 35;
                if (parentText.includes('删除明细')) score += 55;
                if (parentText.includes('药房') || parentText.includes('特殊处方') || parentText.includes('电子处方')) score += 25;
                if (targetRect.width >= 45 && targetRect.width <= 105) score += 20;
                if (targetRect.height >= 22 && targetRect.height <= 50) score += 20;

                /* 越接近实际按钮文字节点、面积越小，越优先。 */
                score -= Math.min(30, Math.max(0, targetRect.width * targetRect.height - 800) / 250);

                candidates.push({
                    source: element,
                    target,
                    score,
                    rect: targetRect
                });
            });
        });

        const unique = [];
        const seen = new Set();
        candidates
            .sort((a, b) => b.score - a.score)
            .forEach(item => {
                const key = item.target;
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(item);
                }
            });

        return unique;
    }

    function findOutpatientNewPrescriptionButton() {
        const candidates = outpatientNewPrescriptionCandidates();
        return candidates[0] ? candidates[0].target : null;
    }

    function clickOutpatientActionButton(element) {
        const target = elementClickableTarget(element) || element;
        if (!target || isDisabledUiControl(target)) {
            return false;
        }

        /*
         * 绝不调用scrollIntoView。按钮在截图中本来已经可见，滚动只会让
         * EasyUI横向表格错位。使用当前屏幕坐标模拟真实鼠标点击。
         */
        return clickElementAtCurrentPosition(element) ||
            clickElementAtCurrentPosition(target);
    }

    function clickOutpatientNewPrescriptionOnce(candidate) {
        if (!candidate) {
            return false;
        }

        const source = candidate.source || candidate.target || candidate;
        const target = candidate.target || elementClickableTarget(source) || source;
        if (!source || !target || isDisabledUiControl(target)) {
            return false;
        }

        const doc = source.ownerDocument;
        const rect = source.getBoundingClientRect();
        const hit = doc.elementFromPoint(
            (rect.left + rect.right) / 2,
            (rect.top + rect.bottom) / 2
        );
        const clickTarget = hit || source || target;
        const snapshot = captureElementScrollState(target);

        /*
         * 只派发一套鼠标序列，绝不再补target.click()或jQuery.trigger()。
         * v1.6.4一次调用会在多个节点上重复派发click，首个click已创建处方后，
         * 后续click马上触发“不能重复创建处方”。
         */
        const dispatched = dispatchMouseSequenceAtElement(clickTarget);
        restoreElementScrollState(snapshot);
        window.setTimeout(() => restoreElementScrollState(snapshot), 80);
        return dispatched;
    }

    function currentTraditionalMedicinePrescriptionState() {
        const table = bestTraditionalMedicineTable();
        const rows = traditionalMedicineDataRows(table);
        const candidate = outpatientNewPrescriptionCandidates({ includeDisabled: true })[0] || null;
        const button = candidate ? candidate.target : null;
        return {
            table,
            rows,
            candidate,
            button,
            buttonDisabled: Boolean(button && isDisabledUiControl(button))
        };
    }

    function focusedTraditionalMedicineNameEditor() {
        const table = bestTraditionalMedicineTable();
        const nameHeaders = table ? uniqueHeaderCentersByText(table, '名称') : [];
        const leftName = nameHeaders[0] || null;
        const headerRect = table ? table.getBoundingClientRect() : null;

        for (const doc of allDocuments()) {
            const active = doc.activeElement;
            if (!active || isOwnAssistantUi(active) || !isVisible(active)) {
                continue;
            }
            if (!active.matches('input:not([type="hidden"]),textarea,[contenteditable="true"]')) {
                continue;
            }

            const rect = active.getBoundingClientRect();
            if (headerRect && rect.top < headerRect.bottom - 12) {
                continue;
            }
            if (leftName && Math.abs(((rect.left + rect.right) / 2) - leftName.center) > 95) {
                continue;
            }
            return active;
        }
        return null;
    }

    async function startNewTraditionalMedicinePrescription() {
        await clickOutpatientOrderTab('中药(新)');
        await outpatientOrderCheckpoint();
        await outpatientOrderWait(420);

        /*
         * 按当前门诊系统的真实行为处理：点击“新处方”后，医院会立即生成
         * 第1行，并把闪烁光标放到左侧名称列。这里彻底取消“是否创建成功”
         * 的表格行判断，也不再轮询按钮变灰状态；本次任务只点击一次，随后
         * 直接进入名称录入阶段，从而避免因识别不到空行而再次点击。
         */
        const candidate = outpatientNewPrescriptionCandidates({ includeDisabled: false })[0] || null;
        if (!candidate) {
            throw new Error('门诊中药页面未定位到红框所示底部“新处方”按钮。');
        }

        const clicked = clickOutpatientNewPrescriptionOnce(candidate);
        if (!clicked) {
            throw new Error('已定位红框处“新处方”按钮，但未能派发有效点击事件。');
        }

        /*
         * 不判断“空白行是否创建”，只短暂等待医院把光标交给名称编辑框。
         * 等待期间绝不再次点击“新处方”。
         */
        const focusDeadline = Date.now() + 1800;
        state.outpatientTcmDirectEditor = null;
        while (Date.now() < focusDeadline) {
            await outpatientOrderCheckpoint();
            state.outpatientTcmDirectEditor = focusedTraditionalMedicineNameEditor();
            if (state.outpatientTcmDirectEditor) {
                break;
            }
            await sleep(60);
        }
        state.outpatientTcmDirectEditorTop = state.outpatientTcmDirectEditor
            ? state.outpatientTcmDirectEditor.getBoundingClientRect().top
            : null;

        /* 无论是否成功取得焦点，都不再返回创建失败，也绝不重复点击。 */
        return {
            direct: true,
            editor: state.outpatientTcmDirectEditor || null
        };
    }

    async function ensureTraditionalMedicineRow(rowIndex) {
        let ready = await waitTraditionalMedicineRows(1, 2600);
        if (!ready) {
            throw new Error('未识别到门诊“中药(新)”双列表格或首行。');
        }

        let table = ready.table;
        let rows = ready.rows;
        while (rows.length <= rowIndex) {
            const beforeCount = rows.length;
            const last = rows[rows.length - 1];
            const plus = findTraditionalMedicineAddButton(last);
            if (!plus) {
                throw new Error('未找到门诊中药最右侧操作列的新增加号。');
            }

            clickVisibleElement(plus);
            const deadline = Date.now() + 3600;
            let added = false;
            while (Date.now() < deadline) {
                await outpatientOrderWait(100);
                table = bestTraditionalMedicineTable();
                rows = traditionalMedicineDataRows(table);
                if (rows.length > beforeCount) {
                    added = true;
                    break;
                }
            }
            if (!added) {
                throw new Error('已点击中药新增加号，但没有生成下一行。');
            }
        }

        return { table, row: rows[rowIndex] };
    }

    function normalizedHerbName(value) {
        return normalizedUiText(value).replace(/[★☆*]/g, '');
    }

    async function selectTraditionalMedicineNameByControl(control, herbName) {
        const value = plain(herbName);
        if (!control || !value) {
            throw new Error('中药名称为空或名称检索输入框不存在。');
        }

        await typeIntoAutocompleteControl(control, value);

        const target = normalizedHerbName(value);
        const waitCandidates = async timeout => {
            const deadline = Date.now() + Math.max(300, Number(timeout) || 2200);
            while (Date.now() < deadline) {
                await outpatientOrderCheckpoint();
                const list = candidateElementsForLookup(control, value).filter(candidate => {
                    const text = normalizedHerbName(candidate.textContent || '');
                    return text && (text.includes(target) || target.includes(text));
                });
                if (list.length) {
                    return list;
                }
                await sleep(80);
            }
            return [];
        };

        let candidates = await waitCandidates(2400);

        /* EasyUI有时收到方向键后才真正展开panel。 */
        if (!candidates.length) {
            try {
                control.focus();
            }
            catch (error) {
                // 忽略。
            }
            dispatchKeyboard(control, 'ArrowDown', 40);
            triggerAutocompleteFrameworkEvents(control, 'ArrowDown');
            candidates = await waitCandidates(900);
        }

        if (!candidates.length) {
            throw new Error('已键入中药名称“' + value + '”，但医院未弹出可选择的候选项。');
        }

        const candidate = candidates[0];
        const clickTarget = elementClickableTarget(candidate) || candidate;
        /* 候选项只派发一套鼠标事件，避免多次click造成重复选择或编辑器重绘。 */
        const clicked = dispatchMouseSequenceAtElement(clickTarget);
        if (!clicked) {
            throw new Error('已找到中药候选项“' + value + '”，但点击确认失败。');
        }
        await outpatientOrderWait(220);

        /* 某些候选行点击只负责高亮，需要再按一次Enter完成回填。 */
        if (isVisible(control) && normalizedHerbName(controlValue(control)).includes(target)) {
            dispatchKeyboard(control, 'Enter', 13);
        }
        await outpatientOrderWait(420);
        return true;
    }

    async function selectTraditionalMedicineName(cell, herbName) {
        const value = plain(herbName);
        if (!cell || !value) {
            throw new Error('中药名称为空或名称单元格不存在。');
        }

        const control = await activateOutpatientCellEditor(cell, 1800);
        if (!control) {
            throw new Error('点击名称单元格后未出现中药检索输入框：' + value);
        }
        return selectTraditionalMedicineNameByControl(control, value);
    }

    async function writeTraditionalMedicineDose(context, slot, value) {
        if (!plain(value)) {
            return true;
        }
        const cell = traditionalMedicineCell(context, '剂量', slot);
        if (!cell) {
            return false;
        }
        const control = await activateOutpatientCellEditor(cell, 1800);
        if (!control) {
            return false;
        }

        /* 剂量必须在编辑框仍保持焦点时提交，不能先blur再按Enter。 */
        setHospitalControlValueWithoutBlur(control, value, {
            selectAll: true,
            change: false
        });
        await outpatientOrderWait(80);
        dispatchKeyboard(control, 'Enter', 13);
        await outpatientOrderWait(260);

        /* Enter未提交时再用Tab促使EasyUI结束编辑。 */
        const displayed = plain(controlValue(control));
        if (isVisible(control) && displayed === plain(value)) {
            dispatchKeyboard(control, 'Tab', 9);
            await outpatientOrderWait(160);
        }
        return true;
    }

    async function writeTraditionalMedicineQuantity(context, slot, value) {
        if (!plain(value)) {
            return true;
        }
        const cell = traditionalMedicineCell(context, '数量', slot);
        if (!cell) {
            return false;
        }
        const control = await activateOutpatientCellEditor(cell, 1800);
        if (!control) {
            return false;
        }

        setHospitalControlValueWithoutBlur(control, value, {
            selectAll: true,
            change: false
        });
        await outpatientOrderWait(80);
        dispatchKeyboard(control, 'Enter', 13);
        await outpatientOrderWait(260);

        const displayed = plain(controlValue(control));
        if (isVisible(control) && displayed === plain(value)) {
            dispatchKeyboard(control, 'Tab', 9);
            await outpatientOrderWait(160);
        }
        return true;
    }

    function traditionalMedicineCellValue(context, header, slot) {
        const cell = traditionalMedicineCell(context, header, slot);
        if (!cell) {
            return '';
        }
        const control = editableControl(cell);
        return plain((control ? controlValue(control) : '') || cell.textContent);
    }


    function numericSelectOption(option) {
        if (!option || option.disabled) {
            return null;
        }
        const text = plain(option.textContent || option.label || option.value);
        const value = plain(option.value);
        const candidates = [text, value];
        for (const candidate of candidates) {
            const match = String(candidate || '').match(/-?\d+(?:\.\d+)?/);
            if (!match) {
                continue;
            }
            const number = Number(match[0]);
            if (Number.isFinite(number)) {
                return number;
            }
        }
        return null;
    }

    function selectOverlappingTraditionalMedicineCell(cell) {
        if (!cell) {
            return null;
        }
        const direct = Array.from(cell.querySelectorAll('select')).find(isVisible);
        if (direct) {
            return direct;
        }

        const cellRect = cell.getBoundingClientRect();
        const candidates = [];
        allDocuments().forEach(doc => {
            visibleElements(doc, 'select').forEach(select => {
                if (isOwnAssistantUi(select)) {
                    return;
                }
                const rect = select.getBoundingClientRect();
                const overlapX = Math.max(
                    0,
                    Math.min(rect.right, cellRect.right) - Math.max(rect.left, cellRect.left)
                );
                const overlapY = Math.max(
                    0,
                    Math.min(rect.bottom, cellRect.bottom) - Math.max(rect.top, cellRect.top)
                );
                const overlapArea = overlapX * overlapY;
                const selectArea = Math.max(1, rect.width * rect.height);
                if (overlapArea / selectArea >= 0.45) {
                    candidates.push({ select, score: overlapArea });
                }
            });
        });
        candidates.sort((a, b) => b.score - a.score);
        return candidates.length ? candidates[0].select : null;
    }

    async function chooseTraditionalMedicineMinimumSelfPay(context, slot) {
        let cell = traditionalMedicineCell(context, '自付比例', slot);
        if (!cell) {
            return false;
        }

        let select = selectOverlappingTraditionalMedicineCell(cell);
        if (!select) {
            /* 某些版本只有点击单元格后才挂载原生select。 */
            dispatchMouseSequenceAtElement(cell);
            await outpatientOrderWait(140);
            select = selectOverlappingTraditionalMedicineCell(cell);
        }
        if (!select) {
            return false;
        }

        const options = Array.from(select.options || [])
            .map((option, index) => ({
                option,
                index,
                number: numericSelectOption(option)
            }))
            .filter(item => item.number != null);
        if (!options.length) {
            return false;
        }

        options.sort((a, b) => a.number - b.number || a.index - b.index);
        const minimum = options[0];
        if (select.selectedIndex !== minimum.index) {
            select.selectedIndex = minimum.index;
            try {
                select.value = minimum.option.value;
            }
            catch (error) {
                // selectedIndex已完成赋值时忽略value只读异常。
            }
            ['input', 'change'].forEach(type => {
                select.dispatchEvent(new Event(type, {
                    bubbles: true,
                    cancelable: true
                }));
            });
            if (window.jQuery) {
                try {
                    window.jQuery(select).val(minimum.option.value).trigger('change');
                }
                catch (error) {
                    // 医院页面未使用jQuery管理该控件时忽略。
                }
            }
            await outpatientOrderWait(180);
        }

        const selected = select.options && select.options[select.selectedIndex];
        const selectedNumber = numericSelectOption(selected);
        return selectedNumber != null && selectedNumber === minimum.number;
    }

    async function fillTraditionalMedicineItem(item, itemIndex) {
        /* 第1味已有闪烁光标时，不再重复点击标签页，以免编辑框失焦。 */
        const hasDirectFirstEditor = Boolean(
            itemIndex === 0 &&
            state.outpatientTcmDirectEditor &&
            isVisible(state.outpatientTcmDirectEditor)
        );
        if (!hasDirectFirstEditor) {
            await clickOutpatientOrderTab('中药(新)');
        }

        const rowIndex = Math.floor(itemIndex / 2);
        const slot = itemIndex % 2;
        const targetName = formatTcmSearchName(
            item.searchName || item.name,
            tcmStarPrefixEnabled()
        );
        let context = null;

        /*
         * 第1味药优先直接使用“新处方”点击后医院自动聚焦的名称输入框，
         * 不再先判断空白行是否已创建。截图中已经出现闪烁光标时会立即键入。
         */
        if (
            itemIndex === 0 &&
            state.outpatientTcmDirectEditor &&
            isVisible(state.outpatientTcmDirectEditor)
        ) {
            /* 先清空状态引用，避免首味失败后第二味继续复用左侧编辑框。 */
            const directEditor = state.outpatientTcmDirectEditor;
            state.outpatientTcmDirectEditor = null;
            await selectTraditionalMedicineNameByControl(
                directEditor,
                targetName
            );
        }
        else {
            context = await ensureTraditionalMedicineRow(rowIndex);
            const nameCell = traditionalMedicineCell(context, '名称', slot);
            if (!nameCell) {
                throw new Error(
                    '未识别到门诊中药第' + (rowIndex + 1) + '行' +
                    (slot === 0 ? '左侧' : '右侧') + '名称单元格。'
                );
            }
            await selectTraditionalMedicineName(nameCell, targetName);
        }

        /* 选药后整行会重绘，再重新按几何位置定位当前处方行。 */
        context = await ensureTraditionalMedicineRow(rowIndex);
        const selectedName = traditionalMedicineCellValue(context, '名称', slot);
        if (!normalizedHerbName(selectedName).includes(normalizedHerbName(targetName))) {
            throw new Error(
                '中药候选选择后目标药位仍未写入“' + targetName +
                '”，当前显示为“' + (selectedName || '空') + '”。'
            );
        }

        const doseWritten = await writeTraditionalMedicineDose(context, slot, item.dose);
        if (plain(item.dose) && !doseWritten) {
            throw new Error('已选择“' + targetName + '”，但未找到对应剂量输入框。');
        }

        /*
         * 门诊双列中药右侧药位的“数量”不会随剂量自动变化，常停留为1。
         * 每次剂量提交后重新扫描当前行，并将左右对应数量明确写成同一克数。
         */
        context = await ensureTraditionalMedicineRow(rowIndex);
        const quantityWritten = await writeTraditionalMedicineQuantity(context, slot, item.dose);
        if (plain(item.dose) && !quantityWritten) {
            throw new Error('已填写“' + targetName + '”剂量，但未找到对应数量输入框。');
        }

        context = await ensureTraditionalMedicineRow(rowIndex);
        const quantityValue = traditionalMedicineCellValue(context, '数量', slot);
        const quantityNumberMatch = String(quantityValue || '').match(/-?\d+(?:\.\d+)?/);
        const doseNumberMatch = String(item.dose || '').match(/-?\d+(?:\.\d+)?/);
        if (
            doseNumberMatch &&
            quantityNumberMatch &&
            Number(quantityNumberMatch[0]) !== Number(doseNumberMatch[0])
        ) {
            throw new Error(
                '“' + targetName + '”数量未与剂量同步：剂量' + item.dose +
                '，当前数量' + quantityValue + '。'
            );
        }

        /* 中药左右两组“自付比例”均按下拉选项中的最小数字自动选择。 */
        context = await ensureTraditionalMedicineRow(rowIndex);
        const minimumSelfPaySelected = await chooseTraditionalMedicineMinimumSelfPay(context, slot);
        if (!minimumSelfPaySelected) {
            throw new Error('“' + targetName + '”未能将自付比例自动选择为最小值。');
        }
        await outpatientOrderWait(120);
    }

    /*
     * 门诊中药底部“付数、用法、是否代煎、代煎付数”自v1.6.8起完全由人工填写。
     * 这里不再保留任何自动定位或自动修改底部表单的执行函数。
     */


    /******************************************************************
     * 康复处方、常规项目、耗材：新处方及逐行录入
     *
     * 三个模块都采用EasyUI可编辑表格。真实流程与西药/中药相同：
     * 先单次点击底部“新处方”生成首行；选择收费项目后整行会重绘；
     * 后续项目通过当前最后一行最右侧“＋”新增。
     ******************************************************************/

    const GENERIC_OUTPATIENT_MODULE_HEADERS = Object.freeze({
        '康复处方': ['项目名称', '执行科室', '每次治疗量', '频次', '次数', '操作'],
        '常规项目': ['项目名称', '执行科室', '单价', '单位', '数量', '操作'],
        '耗材': ['项目名称', '执行科室', '单价', '单位', '数量', '操作']
    });

    function bestGenericOutpatientTable(moduleName) {
        const expected = GENERIC_OUTPATIENT_MODULE_HEADERS[moduleName] || ['项目名称', '操作'];
        let best = null;
        let bestScore = -Infinity;
        visibleHospitalTables().forEach(table => {
            const entries = tableHeaderEntries(table);
            const keys = entries.map(entry => entry.key);
            const rect = table.getBoundingClientRect();
            let score = expected.reduce((sum, header) => {
                const key = normalizedUiText(header);
                return sum + (keys.some(value => value === key || value.includes(key)) ? 18 : 0);
            }, 0);
            score += Math.min(12, rect.width / 120);
            if (keys.some(value => value.includes(normalizedUiText('处方号')))) {
                score += 10;
            }
            if (entries.filter(entry => entry.key === normalizedUiText('名称')).length > 1) {
                score -= 45;
            }
            if (score > bestScore) {
                best = table;
                bestScore = score;
            }
        });
        return bestScore >= 45 ? best : null;
    }

    function genericOutpatientGridRoot(table) {
        return table && (
            table.closest('.datagrid-view') ||
            table.closest('.datagrid-wrap') ||
            table.closest('.datagrid') ||
            table.parentElement
        );
    }

    function isGenericOutpatientBodyRow(row, table) {
        if (!row || !isVisible(row) || isOwnAssistantUi(row)) {
            return false;
        }
        const cells = Array.from(row.querySelectorAll(':scope > td')).filter(isVisible);
        const rect = row.getBoundingClientRect();
        if (cells.length < 7 || rect.width < 520 || rect.height < 12) {
            return false;
        }
        if (table) {
            const headerRect = table.getBoundingClientRect();
            if (rect.top < headerRect.bottom - 8 || rect.top > headerRect.bottom + 520) {
                return false;
            }
        }
        const rowText = normalizedUiText(row.textContent || '');
        if (
            rowText.includes(normalizedUiText('处方号基本信息项目用法')) ||
            rowText.includes(normalizedUiText('项目名称执行科室单价单位'))
        ) {
            return false;
        }
        const classText = normalizedUiText(row.className || '');
        const hasOperation = Array.from(row.querySelectorAll('button,a,span,i,[role="button"]')).some(element => {
            if (!isVisible(element)) {
                return false;
            }
            const er = element.getBoundingClientRect();
            const text = normalizedUiText((element.textContent || '') + ' ' + (element.title || '') + ' ' + (element.className || ''));
            return er.left > rect.left + rect.width * 0.84 &&
                (text.includes('plus') || text.includes('add') || text.includes('新增') || text === '+');
        });
        return Boolean(
            row.closest('.datagrid-body') ||
            classText.includes('datagridrow') ||
            row.querySelector('input,select,textarea,[contenteditable="true"]') ||
            hasOperation
        );
    }

    function genericOutpatientDataRows(table) {
        if (!table) {
            return [];
        }
        const root = genericOutpatientGridRoot(table);
        const candidates = [];
        const seen = new Set();
        const add = collection => Array.from(collection || []).forEach(row => {
            if (!seen.has(row)) {
                seen.add(row);
                candidates.push(row);
            }
        });
        if (root) {
            add(root.querySelectorAll('.datagrid-body tr.datagrid-row'));
            add(root.querySelectorAll('.datagrid-body tbody > tr'));
        }
        add(table.querySelectorAll('tbody > tr'));

        const headerRect = table.getBoundingClientRect();
        allDocuments().forEach(doc => {
            visibleElements(doc, 'tr').forEach(row => {
                if (seen.has(row) || isOwnAssistantUi(row)) {
                    return;
                }
                const rect = row.getBoundingClientRect();
                if (
                    rect.top < headerRect.bottom - 8 ||
                    rect.top > headerRect.bottom + 520 ||
                    rect.width < Math.max(520, headerRect.width * 0.58)
                ) {
                    return;
                }
                const overlap = Math.max(0, Math.min(rect.right, headerRect.right) - Math.max(rect.left, headerRect.left));
                if (overlap / Math.max(1, Math.min(rect.width, headerRect.width)) < 0.66) {
                    return;
                }
                seen.add(row);
                candidates.push(row);
            });
        });

        const grouped = [];
        candidates
            .filter(row => isGenericOutpatientBodyRow(row, table))
            .sort((a, b) => {
                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();
                return Math.abs(ar.top - br.top) > 4 ? ar.top - br.top : br.width - ar.width;
            })
            .forEach(row => {
                const rect = row.getBoundingClientRect();
                const index = grouped.findIndex(item => Math.abs(item.getBoundingClientRect().top - rect.top) < 4);
                if (index < 0) {
                    grouped.push(row);
                    return;
                }
                const old = grouped[index];
                if (
                    rect.width > old.getBoundingClientRect().width + 20 ||
                    row.querySelectorAll(':scope > td').length > old.querySelectorAll(':scope > td').length
                ) {
                    grouped[index] = row;
                }
            });
        return grouped.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    }

    function genericHeaderCenters(table, headerNames) {
        const names = Array.isArray(headerNames) ? headerNames : [headerNames];
        for (const name of names) {
            const key = normalizedUiText(name);
            const entries = tableHeaderEntries(table);
            const exact = entries.filter(entry => entry.key === key);
            const source = exact.length ? exact : entries.filter(entry => entry.key.includes(key));
            if (source.length) {
                const unique = [];
                source.sort((a, b) => a.center - b.center).forEach(entry => {
                    if (!unique.some(item => Math.abs(item.center - entry.center) < 8)) {
                        unique.push(entry);
                    }
                });
                return unique;
            }
        }
        return [];
    }

    function genericOutpatientCell(context, headerNames, occurrence) {
        if (!context || !context.table || !context.row) {
            return null;
        }
        const entries = genericHeaderCenters(context.table, headerNames);
        const index = Math.max(0, Number(occurrence) || 0);
        const entry = entries[index] || entries[0];
        return entry ? rowCellAtCenter(context.row, entry.center) : null;
    }

    function findGenericOutpatientAddButton(row) {
        if (!row) {
            return null;
        }
        const rowRect = row.getBoundingClientRect();
        const candidates = [];
        Array.from(row.querySelectorAll('button,a,span,i,[role="button"]')).forEach(element => {
            if (!isVisible(element) || isDisabledUiControl(elementClickableTarget(element) || element)) {
                return;
            }
            const rect = element.getBoundingClientRect();
            if (rect.left < rowRect.left + rowRect.width * 0.84) {
                return;
            }
            const text = normalizedUiText((element.textContent || '') + ' ' + (element.title || '') + ' ' + (element.className || ''));
            let score = 0;
            if (text === '+' || text.includes('plus')) score += 100;
            if (text.includes('新增') || text.includes('添加') || text.includes('add')) score += 80;
            score += Math.max(0, 45 - Math.abs(rowRect.right - rect.right));
            if (score > 0) candidates.push({ element, score });
        });
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0] ? candidates[0].element : null;
    }

    async function waitGenericOutpatientRows(moduleName, minimum, timeout) {
        const deadline = Date.now() + Math.max(500, Number(timeout) || 2800);
        while (Date.now() < deadline) {
            await outpatientOrderCheckpoint();
            const table = bestGenericOutpatientTable(moduleName);
            const rows = genericOutpatientDataRows(table);
            if (table && rows.length >= minimum) {
                return { table, rows };
            }
            await sleep(80);
        }
        return null;
    }

    function focusedGenericOutpatientNameEditor(moduleName) {
        const table = bestGenericOutpatientTable(moduleName);
        const nameHeader = table ? genericHeaderCenters(table, ['项目名称', '名称'])[0] : null;
        const headerRect = table ? table.getBoundingClientRect() : null;
        for (const doc of allDocuments()) {
            const active = doc.activeElement;
            if (!active || !isVisible(active) || isOwnAssistantUi(active)) {
                continue;
            }
            if (!active.matches('input:not([type="hidden"]),textarea,[contenteditable="true"]')) {
                continue;
            }
            const rect = active.getBoundingClientRect();
            if (headerRect && rect.top < headerRect.bottom - 14) {
                continue;
            }
            if (nameHeader && Math.abs(((rect.left + rect.right) / 2) - nameHeader.center) > 130) {
                continue;
            }
            return active;
        }
        return null;
    }

    async function startNewGenericOutpatientPrescription(moduleName) {
        await clickOutpatientOrderTab(moduleName);
        await outpatientOrderCheckpoint();
        await outpatientOrderWait(420);
        const candidate = outpatientNewPrescriptionCandidates({ includeDisabled: false })[0] || null;
        if (!candidate) {
            throw new Error('“' + moduleName + '”页面未定位到底部“新处方”按钮。');
        }
        if (!clickOutpatientNewPrescriptionOnce(candidate)) {
            throw new Error('已定位“' + moduleName + '”新处方按钮，但未能派发有效点击。');
        }

        state.outpatientGenericDirectEditors = state.outpatientGenericDirectEditors || {};
        state.outpatientGenericDirectEditors[moduleName] = null;
        const deadline = Date.now() + 1900;
        while (Date.now() < deadline) {
            await outpatientOrderCheckpoint();
            const editor = focusedGenericOutpatientNameEditor(moduleName);
            if (editor) {
                state.outpatientGenericDirectEditors[moduleName] = editor;
                break;
            }
            await sleep(60);
        }
        return true;
    }

    async function ensureGenericOutpatientRow(moduleName, rowIndex) {
        let ready = await waitGenericOutpatientRows(moduleName, 1, 3200);
        if (!ready) {
            throw new Error('已点击“新处方”，但未识别到“' + moduleName + '”首行。');
        }
        let table = ready.table;
        let rows = ready.rows;
        while (rows.length <= rowIndex) {
            const before = rows.length;
            const plus = findGenericOutpatientAddButton(rows[rows.length - 1]);
            if (!plus) {
                throw new Error('未找到“' + moduleName + '”当前最后一行最右侧新增加号。');
            }
            if (!dispatchMouseSequenceAtElement(elementClickableTarget(plus) || plus)) {
                throw new Error('“' + moduleName + '”新增加号点击失败。');
            }
            const deadline = Date.now() + 3200;
            let added = false;
            while (Date.now() < deadline) {
                await outpatientOrderWait(100);
                table = bestGenericOutpatientTable(moduleName);
                rows = genericOutpatientDataRows(table);
                if (rows.length > before) {
                    added = true;
                    break;
                }
            }
            if (!added) {
                throw new Error('已点击“' + moduleName + '”新增加号，但没有生成下一行。');
            }
        }
        return { table, row: rows[rowIndex] };
    }

    async function selectGenericOutpatientNameByControl(control, value, moduleName) {
        const name = plain(value);
        if (!control || !name) {
            throw new Error('“' + moduleName + '”项目名称为空或检索输入框不存在。');
        }
        await typeIntoAutocompleteControl(control, name);
        const target = normalizedUiText(name);
        const waitCandidates = async timeout => {
            const deadline = Date.now() + Math.max(500, Number(timeout) || 2600);
            while (Date.now() < deadline) {
                await outpatientOrderCheckpoint();
                const candidates = candidateElementsForLookup(control, name)
                    .filter(candidate => {
                        const text = normalizedUiText(candidate.textContent || '');
                        return text && (text.includes(target) || target.includes(text));
                    })
                    .sort((a, b) => {
                        const at = normalizedUiText(a.textContent || '');
                        const bt = normalizedUiText(b.textContent || '');
                        return Number(bt === target) - Number(at === target);
                    });
                if (candidates.length) return candidates;
                await sleep(80);
            }
            return [];
        };
        let candidates = await waitCandidates(2700);
        if (!candidates.length) {
            dispatchKeyboard(control, 'Enter', 13);
            candidates = await waitCandidates(1100);
        }
        if (!candidates.length) {
            throw new Error('已键入“' + name + '”，但医院未弹出可选择的收费项目候选项。');
        }
        const selected = elementClickableTarget(candidates[0]) || candidates[0];
        if (!dispatchMouseSequenceAtElement(selected)) {
            throw new Error('已找到收费项目候选项“' + name + '”，但点击确认失败。');
        }
        await outpatientOrderWait(520);
        return true;
    }

    async function selectGenericOutpatientName(cell, value, moduleName) {
        const control = await activateOutpatientCellEditor(cell, 1900);
        if (!control) {
            throw new Error('点击“' + moduleName + '”项目名称单元格后未出现检索框。');
        }
        return selectGenericOutpatientNameByControl(control, value, moduleName);
    }

    async function writeGenericOutpatientField(context, headerNames, value, popup) {
        if (!plain(value)) {
            return true;
        }
        const cell = genericOutpatientCell(context, headerNames, 0);
        if (!cell) {
            return false;
        }
        const control = await activateOutpatientCellEditor(cell, 1800);
        if (!control) {
            return false;
        }
        if (popup) {
            if (control.tagName === 'SELECT') {
                const target = normalizedUiText(value);
                const option = Array.from(control.options || []).find(item => {
                    const text = normalizedUiText(item.textContent || item.value || '');
                    return text === target || text.includes(target) || target.includes(text);
                });
                if (!option) return false;
                control.value = option.value;
                dispatchAutocompleteEvent(control, 'input');
                dispatchAutocompleteEvent(control, 'change');
                await outpatientOrderWait(160);
                return true;
            }
            await typeIntoAutocompleteControl(control, value);
            const deadline = Date.now() + 2200;
            let candidates = [];
            while (Date.now() < deadline) {
                await outpatientOrderCheckpoint();
                candidates = candidateElementsForLookup(control, value);
                if (candidates.length) break;
                await sleep(80);
            }
            if (candidates.length) {
                const target = elementClickableTarget(candidates[0]) || candidates[0];
                dispatchMouseSequenceAtElement(target);
                await outpatientOrderWait(320);
                return true;
            }
            dispatchKeyboard(control, 'Enter', 13);
            await outpatientOrderWait(260);
            return normalizedUiText(controlValue(control)).includes(normalizedUiText(value));
        }
        setHospitalControlValueWithoutBlur(control, value, { selectAll: true, change: false });
        await outpatientOrderWait(80);
        dispatchKeyboard(control, 'Enter', 13);
        await outpatientOrderWait(220);
        if (isVisible(control)) {
            dispatchKeyboard(control, 'Tab', 9);
            await outpatientOrderWait(120);
        }
        return true;
    }

    function genericOutpatientCellText(context, headerNames) {
        const cell = genericOutpatientCell(context, headerNames, 0);
        if (!cell) return '';
        const control = editableControl(cell);
        return plain(control ? controlValue(control) : cell.textContent);
    }

    async function fillGenericOutpatientItem(item, rowIndex) {
        const moduleName = item.module;
        state.outpatientGenericPrescriptionStarted = state.outpatientGenericPrescriptionStarted || {};
        state.outpatientGenericDirectEditors = state.outpatientGenericDirectEditors || {};

        if (!state.outpatientGenericPrescriptionStarted[moduleName]) {
            await startNewGenericOutpatientPrescription(moduleName);
            /* 点击成功后立即记忆，首条后续字段失败也绝不再次点击新处方。 */
            state.outpatientGenericPrescriptionStarted[moduleName] = true;
        }

        const searchName = item.searchName || item.name;
        let context = null;
        const direct = rowIndex === 0 ? state.outpatientGenericDirectEditors[moduleName] : null;
        if (direct && isVisible(direct)) {
            state.outpatientGenericDirectEditors[moduleName] = null;
            await selectGenericOutpatientNameByControl(direct, searchName, moduleName);
        }
        else {
            await clickOutpatientOrderTab(moduleName);
            context = await ensureGenericOutpatientRow(moduleName, rowIndex);
            const nameCell = genericOutpatientCell(context, ['项目名称', '名称'], 0);
            if (!nameCell) {
                throw new Error('未识别到“' + moduleName + '”项目名称列。');
            }
            await selectGenericOutpatientName(nameCell, searchName, moduleName);
        }

        /* 收费项目选中后整行重绘，重新定位当前行。 */
        context = await ensureGenericOutpatientRow(moduleName, rowIndex);

        if (plain(item.department)) {
            const departmentOk = await writeGenericOutpatientField(context, '执行科室', item.department, true);
            if (!departmentOk) {
                throw new Error('未能从院内执行科室列表选择“' + item.department + '”。');
            }
            context = await ensureGenericOutpatientRow(moduleName, rowIndex);
        }

        if (moduleName === '康复处方') {
            const amount = plain(item.dose || item.quantity || '1');
            if (!(await writeGenericOutpatientField(context, '每次治疗量', amount, false))) {
                throw new Error('未能填写康复“每次治疗量”。');
            }
            context = await ensureGenericOutpatientRow(moduleName, rowIndex);
            if (plain(item.unit)) {
                await writeGenericOutpatientField(context, '单位', item.unit, true);
            }
            if (plain(item.frequency)) {
                if (!(await writeGenericOutpatientField(context, '频次', item.frequency, true))) {
                    throw new Error('未能选择康复频次“' + item.frequency + '”。');
                }
                context = await ensureGenericOutpatientRow(moduleName, rowIndex);
            }
            if (plain(item.quantity)) {
                await writeGenericOutpatientField(context, '次数', item.quantity, false);
            }
            if (plain(item.note)) {
                await writeGenericOutpatientField(context, '部位', item.note, false);
            }
        }
        else {
            /* 常规项目与耗材均以“数量”为实际开立数量，未填写时默认1。 */
            const quantity = plain(item.quantity || item.dose || '1');
            if (!(await writeGenericOutpatientField(context, '数量', quantity, false))) {
                throw new Error('未能填写“' + moduleName + '”数量。');
            }
            context = await ensureGenericOutpatientRow(moduleName, rowIndex);
            if (plain(item.unit)) {
                await writeGenericOutpatientField(context, '单位', item.unit, true);
            }
            if (plain(item.note)) {
                await writeGenericOutpatientField(context, '部位', item.note, false);
            }
        }

        /* 项目选择后若医院已自动回填执行科室，不强制覆盖；若用户明确填写则必须有结果。 */
        if (plain(item.department)) {
            context = await ensureGenericOutpatientRow(moduleName, rowIndex);
            const actualDepartment = genericOutpatientCellText(context, '执行科室');
            if (!normalizedUiText(actualDepartment).includes(normalizedUiText(item.department))) {
                throw new Error('执行科室未回写为“' + item.department + '”，当前显示“' + (actualDepartment || '空') + '”。');
            }
        }
        return true;
    }

    function leftApplicationPanelRoot(moduleName) {
        const tab = findExactVisibleText(moduleName, {
            selector: 'a,span,div,li,button',
            allowContains: false
        });
        const doc = tab ? tab.ownerDocument : document;
        const width = (doc.defaultView || window).innerWidth || 1600;
        const controls = visibleElements(doc, 'input,select,[role="combobox"],.combo,.textbox,.layui-form-select')
            .filter(control => {
                if (isOwnAssistantUi(control)) return false;
                const rect = control.getBoundingClientRect();
                return rect.left < width * 0.48 && rect.top > 205 && rect.top < 520;
            })
            .sort((a, b) => {
                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();
                return ar.top - br.top || ar.left - br.left || br.width - ar.width;
            });
        return { doc, controls };
    }

    async function chooseNativeSelectOption(select, text) {
        if (!select || !plain(text) || select.tagName !== 'SELECT') {
            return false;
        }
        const target = normalizedUiText(text);
        const option = Array.from(select.options || []).find(item => {
            const value = normalizedUiText(item.textContent || item.value);
            return value === target || value.includes(target) || target.includes(value);
        });
        if (!option) {
            return false;
        }
        select.value = option.value;
        Array.from(select.options || []).forEach(item => {
            item.selected = item === option;
        });
        dispatchInputEvents(select);
        try {
            const view = select.ownerDocument.defaultView || window;
            if (view.jQuery) {
                view.jQuery(select).val(option.value).trigger('input').trigger('change');
            }
        }
        catch (error) {
            // 忽略。
        }
        await outpatientOrderWait(320);
        return true;
    }

    function applicationExactTextTargets(element, text) {
        if (!element) return [];
        const target = normalizedUiText(text);
        const candidates = [element].concat(
            Array.from(element.querySelectorAll('span,a,div,td,[role="treeitem"],[role="option"],.tree-title,.layui-tree-txt'))
        ).filter(isVisible).filter(item => normalizedUiText(item.textContent || '') === target);
        const result = [];
        candidates.forEach(item => {
            const clickable = elementClickableTarget(item) || item;
            if (clickable && !result.includes(clickable)) result.push(clickable);
        });
        return result.length ? result : [elementClickableTarget(element) || element];
    }

    function applicationTreeCandidate(text, moduleName) {
        const target = normalizedUiText(text);
        if (!target) return null;
        let best = null;
        let bestScore = -Infinity;
        allDocuments().forEach(doc => {
            const width = (doc.defaultView || window).innerWidth || 1600;
            visibleElements(doc, 'li,a,span,div,[role="treeitem"],.tree-node,.tree-title,.layui-tree-txt,.el-tree-node__content').forEach(element => {
                if (isOwnAssistantUi(element)) return;
                const rect = element.getBoundingClientRect();
                const topRect = labTopLevelRect(element) || rect;
                const viewport = labTopViewportSize();
                if (topRect.left > viewport.width * 0.40 || topRect.top < 245 || topRect.height > 110 || topRect.width > viewport.width * 0.40) return;
                if (element.closest('.combobox-panel,.combo-panel,.layui-form-select dl,.select2-results,.el-select-dropdown')) return;
                const value = normalizedUiText(element.textContent || '');
                if (!value || (!value.includes(target) && !target.includes(value))) return;
                let score = value === target ? 240 : 110 - Math.abs(value.length - target.length);
                if (/tree|node|leaf|file|title|layui-tree-txt/i.test(String(element.className || ''))) score += 35;
                if (element.querySelector('ul,ol')) score -= 45;
                if (moduleName === '检查' && /检查费/.test(plain(element.parentElement && element.parentElement.textContent))) score += 6;
                if (score > bestScore) {
                    best = element;
                    bestScore = score;
                }
            });
        });
        return best;
    }

    async function waitExactApplicationTreeLeaf(text, timeout, moduleName) {
        const deadline = Date.now() + Math.max(500, Number(timeout) || 3600);
        while (Date.now() < deadline) {
            await outpatientOrderCheckpoint();
            const candidate = applicationTreeCandidate(text, moduleName);
            if (candidate) return candidate;
            await sleep(90);
        }
        return null;
    }

    function labRectDistance(rectA, rectB) {
        if (!rectA || !rectB) return Infinity;
        const horizontal = Math.max(0, Math.max(rectA.left - rectB.right, rectB.left - rectA.right));
        const vertical = Math.max(0, Math.max(rectA.top - rectB.bottom, rectB.top - rectA.bottom));
        return horizontal + vertical;
    }

    /*
     * HIS的处方主体可能放在同源iframe内。getBoundingClientRect()在iframe中
     * 返回的是“框架内部坐标”，旧版却按顶层页面的Y坐标筛选，所以截图中明明
     * 能看到“全部”，脚本仍会判断未找到。这里统一换算为顶层视口坐标。
     */
    function labTopLevelRect(element) {
        if (!element || !element.getBoundingClientRect) return null;
        const local = element.getBoundingClientRect();
        let left = local.left;
        let top = local.top;
        let right = local.right;
        let bottom = local.bottom;
        let view = element.ownerDocument && element.ownerDocument.defaultView;
        const visited = new Set();

        while (view && view !== window.top && !visited.has(view)) {
            visited.add(view);
            let frame = null;
            try {
                frame = view.frameElement;
            }
            catch (error) {
                frame = null;
            }
            if (!frame || !frame.getBoundingClientRect) break;
            const frameRect = frame.getBoundingClientRect();
            left += frameRect.left;
            right += frameRect.left;
            top += frameRect.top;
            bottom += frameRect.top;
            view = frame.ownerDocument && frame.ownerDocument.defaultView;
        }

        return {
            left,
            top,
            right,
            bottom,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
            x: left,
            y: top
        };
    }

    function labTopViewportSize() {
        let topWindow = window;
        try {
            topWindow = window.top || window;
        }
        catch (error) {
            topWindow = window;
        }
        return {
            width: topWindow.innerWidth || window.innerWidth || 1600,
            height: topWindow.innerHeight || window.innerHeight || 900
        };
    }

    function labHorizontalOverlapRatio(rectA, rectB) {
        if (!rectA || !rectB) return 0;
        const overlap = Math.max(0, Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left));
        const denominator = Math.max(1, Math.min(rectA.width, rectB.width));
        return overlap / denominator;
    }

    function labControlDisplayValue(element) {
        if (!element) return '';

        if (element.tagName === 'SELECT') {
            const option = element.options && element.selectedIndex >= 0
                ? element.options[element.selectedIndex]
                : null;
            return plain(option ? option.textContent || option.value : element.value);
        }

        if (/^(INPUT|TEXTAREA)$/.test(element.tagName)) {
            return plain(element.value || element.getAttribute('value') || '');
        }

        const editor = element.querySelector && element.querySelector([
            'input.combo-text',
            'input.textbox-text',
            'input[role="combobox"]',
            '.layui-select-title input',
            '.select2-selection__rendered',
            '.el-input__inner',
            '.ant-select-selection-item',
            '.ivu-select-selected-value',
            'input:not([type="hidden"])'
        ].join(','));

        if (editor) {
            const value = /^(INPUT|TEXTAREA)$/.test(editor.tagName)
                ? editor.value
                : editor.textContent;
            if (plain(value)) return plain(value);
        }

        return plain(element.innerText || element.textContent || '');
    }

    function compactLabDropdownControl(element) {
        if (!element) return null;

        const known = element.closest && element.closest([
            '.combo',
            '.textbox.combo',
            '.easyui-combobox',
            '[role="combobox"]',
            '.layui-form-select',
            '.select2-container',
            '.el-select',
            '.ant-select',
            '.ivu-select'
        ].join(','));

        if (known) {
            const rect = known.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.height <= 72) {
                return known;
            }
        }

        let current = element;
        let best = element;

        for (let level = 0; current && level < 5; level += 1) {
            const rect = current.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.height > 74 || rect.width > 760) break;

            const hasArrow = Boolean(current.querySelector && current.querySelector([
                '.combo-arrow',
                '.textbox-addon-right',
                '.textbox-addon',
                '.layui-edge',
                '.select2-selection__arrow',
                '.el-select__caret',
                '.ant-select-arrow',
                '.ivu-select-arrow',
                '[class*="arrow"]'
            ].join(',')));

            if (hasArrow || /^(INPUT|SELECT)$/.test(current.tagName)) {
                best = current;
            }

            const parent = current.parentElement;
            if (!parent) break;
            const parentRect = parent.getBoundingClientRect();
            if (
                parentRect.height > 74 ||
                parentRect.width > 760 ||
                Math.abs(parentRect.top - rect.top) > 12 ||
                Math.abs(parentRect.left - rect.left) > 18
            ) break;

            current = parent;
        }

        return best;
    }

    function labPrimarySearchAnchors(doc) {
        return Array.from(doc.querySelectorAll('input:not([type="hidden"]),textarea,[contenteditable="true"]'))
            .filter(element => {
                if (!isVisible(element) || isOwnAssistantUi(element)) return false;
                const semantic = normalizedUiText([
                    element.getAttribute && element.getAttribute('placeholder'),
                    element.getAttribute && element.getAttribute('aria-label'),
                    element.getAttribute && element.getAttribute('title'),
                    element.value
                ].filter(Boolean).join(' '));
                return semantic.includes(normalizedUiText('组套名称简拼')) ||
                    semantic.includes(normalizedUiText('组套简拼'));
            });
    }

    function outpatientLabPrimaryDropdownEntries() {
        const candidates = [];
        const seen = new Set();
        const viewport = labTopViewportSize();

        const appendCandidate = (doc, rawElement, sourceKind, anchor) => {
            const control = compactLabDropdownControl(rawElement);
            if (!control || seen.has(control) || isOwnAssistantUi(control)) return;

            const rect = labTopLevelRect(control);
            if (!rect) return;
            const editor = labDropdownEditor(control, true);
            const display = plain(
                (editor && controlValue(editor)) ||
                labControlDisplayValue(control)
            );
            const semantic = normalizedUiText([
                display,
                control.getAttribute && control.getAttribute('placeholder'),
                control.getAttribute && control.getAttribute('aria-label'),
                control.getAttribute && control.getAttribute('title'),
                editor && editor.getAttribute && editor.getAttribute('placeholder'),
                editor && editor.getAttribute && editor.getAttribute('aria-label')
            ].filter(Boolean).join(' '));

            if (
                semantic.includes(normalizedUiText('组套名称简拼')) ||
                semantic.includes(normalizedUiText('组套简拼'))
            ) return;

            const anchorRect = anchor ? labTopLevelRect(anchor) : null;
            const anchored = Boolean(anchorRect &&
                rect.bottom <= anchorRect.top + 16 &&
                anchorRect.top - rect.bottom >= -8 &&
                anchorRect.top - rect.bottom <= 105 &&
                labHorizontalOverlapRatio(rect, anchorRect) >= 0.42);

            /*
             * 非锚定候选仍按顶层视口约束；锚定候选以“简拼框正上方”为准，
             * 不再依赖iframe内部的局部Y坐标。
             */
            if (!anchored && (
                rect.left > viewport.width * 0.50 ||
                rect.top < 145 ||
                rect.top > Math.min(480, viewport.height * 0.60)
            )) return;

            if (
                rect.width < 70 ||
                rect.width > 760 ||
                rect.height < 14 ||
                rect.height > 74
            ) return;

            const classRole = String(control.className || '') + ' ' +
                String(control.getAttribute && control.getAttribute('role') || '');
            const hasArrow = Boolean(control.querySelector && control.querySelector([
                '.combo-arrow',
                '.textbox-addon-right',
                '.textbox-addon',
                '.layui-edge',
                '.select2-selection__arrow',
                '.el-select__caret',
                '.ant-select-arrow',
                '.ivu-select-arrow',
                '[class*="arrow"]'
            ].join(',')));
            const exactAll = normalizedUiText(display) === normalizedUiText('全部');
            const looksDropdown = exactAll || anchored ||
                control.tagName === 'SELECT' ||
                /combo|select|combobox/i.test(classRole) ||
                hasArrow;

            if (!looksDropdown) return;

            seen.add(control);

            let score = Math.abs(rect.top - 270) * 3 + Math.abs(rect.left - 248) / 3;
            if (anchored) score -= 26000;
            if (exactAll) score -= 16000;
            if (rect.width >= 250 && rect.width <= 410) score -= 1500;
            if (hasArrow) score -= 1200;
            if (/combo|select|combobox/i.test(classRole)) score -= 800;
            if (sourceKind === 'exact-all') score -= 1800;
            if (sourceKind === 'anchor-band') score -= 5000;
            if (/^(INPUT|SELECT)$/.test(rawElement.tagName)) score -= 500;

            candidates.push({ doc, control, editor, display, score, exactAll, anchored });
        };

        allDocuments().forEach(doc => {
            const anchors = labPrimarySearchAnchors(doc);

            /*
             * 最可靠路径：从“组套名称简拼”框向上反查同宽的一级目录框。
             * 该院页面中“全部”输入区和箭头可能是两个并列节点，均允许入选。
             */
            anchors.forEach(anchor => {
                const anchorRect = labTopLevelRect(anchor);
                if (!anchorRect) return;
                Array.from(doc.querySelectorAll([
                    'input:not([type="hidden"]):not([disabled])',
                    'select:not([disabled])',
                    '[role="combobox"]',
                    '.combo',
                    '.textbox.combo',
                    '.easyui-combobox',
                    '.layui-form-select',
                    '.select2-container',
                    '.el-select',
                    '.ant-select',
                    '.ivu-select',
                    'div',
                    'span',
                    'a',
                    'button'
                ].join(','))).forEach(element => {
                    if (!isVisible(element) || isOwnAssistantUi(element) || element === anchor) return;
                    const rect = labTopLevelRect(element);
                    if (!rect) return;
                    const verticalGap = anchorRect.top - rect.bottom;
                    if (verticalGap < -8 || verticalGap > 105) return;
                    if (labHorizontalOverlapRatio(rect, anchorRect) < 0.42) return;
                    if (rect.height > 74 || rect.width < 60 || rect.width > 760) return;
                    const value = normalizedUiText(labControlDisplayValue(element));
                    const classRole = String(element.className || '') + ' ' +
                        String(element.getAttribute && element.getAttribute('role') || '');
                    if (
                        value === normalizedUiText('全部') ||
                        /combo|select|combobox|arrow|addon/i.test(classRole) ||
                        /^(INPUT|SELECT)$/.test(element.tagName)
                    ) {
                        appendCandidate(doc, element, 'anchor-band', anchor);
                    }
                });
            });

            const selectors = [
                '.combo',
                '.textbox.combo',
                '.easyui-combobox',
                '[role="combobox"]',
                'input.combo-text',
                'input.textbox-text',
                '.layui-form-select',
                '.select2-container',
                '.el-select',
                '.ant-select',
                '.ivu-select',
                'select:not([disabled])',
                'input:not([type="hidden"]):not([disabled])'
            ].join(',');

            Array.from(doc.querySelectorAll(selectors)).forEach(element => {
                if (!isVisible(element)) return;
                appendCandidate(doc, element, 'control', null);
            });

            Array.from(doc.querySelectorAll('input,select,span,div,a,button,[role="combobox"]'))
                .forEach(element => {
                    if (!isVisible(element)) return;
                    const value = labControlDisplayValue(element);
                    if (normalizedUiText(value) !== normalizedUiText('全部')) return;
                    const nearestAnchor = anchors
                        .map(anchor => ({ anchor, distance: labRectDistance(labTopLevelRect(element), labTopLevelRect(anchor)) }))
                        .sort((a, b) => a.distance - b.distance)[0];
                    appendCandidate(doc, element, 'exact-all', nearestAnchor && nearestAnchor.distance < 180 ? nearestAnchor.anchor : null);
                });
        });

        return candidates.sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            const ar = labTopLevelRect(a.control);
            const br = labTopLevelRect(b.control);
            return (ar ? ar.top : 0) - (br ? br.top : 0);
        });
    }

    function labPrimaryDropdownControl() {
        const entries = outpatientLabPrimaryDropdownEntries();
        return entries[0] ? entries[0].control : null;
    }

    function labDropdownEditor(control, allowGeneric) {
        if (!control) return null;
        const candidates = [];
        const seen = new Set();
        const controlRect = labTopLevelRect(control);

        const append = element => {
            if (!element || seen.has(element) || !element.isConnected) return;
            if (element.type === 'hidden' || element.disabled) return;
            if (!isVisible(element) && element !== control) return;

            const semantic = normalizedUiText([
                element.getAttribute && element.getAttribute('placeholder'),
                element.getAttribute && element.getAttribute('aria-label'),
                element.getAttribute && element.getAttribute('title')
            ].filter(Boolean).join(' '));
            if (
                semantic.includes(normalizedUiText('组套名称简拼')) ||
                semantic.includes(normalizedUiText('组套简拼'))
            ) return;

            const rect = labTopLevelRect(element);
            const overlapX = rect && controlRect
                ? Math.max(0, Math.min(rect.right, controlRect.right) - Math.max(rect.left, controlRect.left))
                : 0;
            const overlapY = rect && controlRect
                ? Math.max(0, Math.min(rect.bottom, controlRect.bottom) - Math.max(rect.top, controlRect.top))
                : 0;
            const close = overlapX > 0 && overlapY > 0 || labRectDistance(rect, controlRect) < 70;
            if (!close && element !== control) return;

            seen.add(element);
            candidates.push(element);
        };

        if (control.matches && control.matches('input:not([type="hidden"]),textarea,[contenteditable="true"]')) {
            append(control);
        }

        const roots = [
            control,
            control.closest && control.closest('.combo,.textbox.combo,.easyui-combobox,.layui-form-select,.select2-container,.el-select,.ant-select,.ivu-select'),
            control.parentElement
        ].filter(Boolean);

        roots.forEach(root => {
            if (!root.querySelectorAll) return;
            Array.from(root.querySelectorAll([
                'input.combo-text',
                'input.textbox-text',
                'input[role="combobox"]',
                '.layui-select-title input',
                '.select2-search__field',
                '.el-input__inner',
                '.ant-select-selection-search-input',
                '.ivu-select-input',
                'input:not([type="hidden"])',
                '[contenteditable="true"]'
            ].join(','))).forEach(append);
        });

        const active = control.ownerDocument && control.ownerDocument.activeElement;
        if (active && active !== control.ownerDocument.body) append(active);

        candidates.sort((a, b) => {
            const ar = labTopLevelRect(a);
            const br = labTopLevelRect(b);
            let sa = labRectDistance(ar, controlRect);
            let sb = labRectDistance(br, controlRect);
            if (/combo-text|textbox-text|combobox/i.test(String(a.className || '') + ' ' + String(a.getAttribute && a.getAttribute('role') || ''))) sa -= 1200;
            if (/combo-text|textbox-text|combobox/i.test(String(b.className || '') + ' ' + String(b.getAttribute && b.getAttribute('role') || ''))) sb -= 1200;
            if (a === control) sa -= 400;
            if (b === control) sb -= 400;
            return sa - sb || ((br && br.width) || 0) - ((ar && ar.width) || 0);
        });

        if (candidates.length) return candidates[0];
        return allowGeneric && /^(INPUT|TEXTAREA)$/.test(control.tagName) ? control : null;
    }

    function labDropdownClickTargets(control) {
        if (!control) return [];
        const result = [];
        const append = element => {
            if (element && element.isConnected && !result.includes(element) && isVisible(element)) result.push(element);
        };

        if (control.querySelector) {
            [
                '.combo-arrow',
                '.textbox-addon-right',
                '.textbox-addon',
                '.layui-edge',
                '.select2-selection__arrow',
                '.select2-selection',
                '.el-input__suffix',
                '.el-input',
                '.ant-select-arrow',
                '.ant-select-selector',
                '.ivu-select-arrow',
                '.ivu-select-selection',
                '[role="combobox"]'
            ].forEach(selector => append(control.querySelector(selector)));
        }

        /*
         * 截图中的箭头是输入区右侧独立兄弟节点，不一定在control内部。
         * 按同一水平带和右侧距离寻找箭头/按钮，且优先于文本输入区点击。
         */
        const controlRect = labTopLevelRect(control);
        const doc = control.ownerDocument;
        if (controlRect && doc) {
            Array.from(doc.querySelectorAll([
                '.combo-arrow',
                '.textbox-addon-right',
                '.textbox-addon',
                '[class*="arrow"]',
                'button',
                'a',
                '[role="button"]',
                'span',
                'div'
            ].join(','))).filter(isVisible).forEach(element => {
                if (element === control || isOwnAssistantUi(element)) return;
                const rect = labTopLevelRect(element);
                if (!rect || rect.width > 90 || rect.height > 72) return;
                const verticalOverlap = Math.max(0, Math.min(rect.bottom, controlRect.bottom) - Math.max(rect.top, controlRect.top));
                const horizontalGap = rect.left - controlRect.right;
                const classText = String(element.className || '') + ' ' + plain(element.textContent || '');
                const arrowLike = /arrow|addon|caret|triangle|down|下拉|▼|▾|⌄/i.test(classText) || element.tagName === 'BUTTON';
                if (verticalOverlap >= Math.min(rect.height, controlRect.height) * 0.45 && horizontalGap >= -18 && horizontalGap <= 95 && arrowLike) {
                    append(element);
                }
            });
        }

        append(labDropdownEditor(control, true));
        append(control);

        return result.sort((a, b) => {
            const ac = String(a.className || '') + ' ' + String(a.getAttribute && a.getAttribute('role') || '');
            const bc = String(b.className || '') + ' ' + String(b.getAttribute && b.getAttribute('role') || '');
            const as = /arrow|addon|caret/i.test(ac) ? -1000 : 0;
            const bs = /arrow|addon|caret/i.test(bc) ? -1000 : 0;
            return as - bs;
        });
    }

    function labDropdownOptionCandidates(control, text) {
        const target = normalizedUiText(text);
        if (!control || !target) return [];
        const controlRect = labTopLevelRect(control);
        const result = [];
        const seen = new Set();
        const orderedDocs = [control.ownerDocument].concat(allDocuments().filter(doc => doc !== control.ownerDocument));

        orderedDocs.forEach(doc => {
            const viewport = labTopViewportSize();
            visibleElements(doc, [
                '.combobox-item',
                '.combo-panel .combobox-item',
                '.combo-panel div',
                '.panel-body .combobox-item',
                '[role="option"]',
                '.layui-form-select dl dd',
                '.select2-results__option',
                '.dropdown-menu li',
                '.dropdown-menu a',
                '.el-select-dropdown__item',
                '.ant-select-item-option',
                '.ivu-select-item',
                '.datagrid-row',
                'li',
                'dd'
            ].join(',')).forEach(element => {
                if (seen.has(element) || isOwnAssistantUi(element)) return;
                if (element.closest('[role="tree"],.tree,.layui-tree,.el-tree')) return;
                const rect = labTopLevelRect(element);
                if (!rect || !controlRect) return;
                if (
                    rect.left > viewport.width * 0.56 ||
                    rect.top < controlRect.top - 90 ||
                    rect.top > controlRect.bottom + 760 ||
                    rect.width < 25 ||
                    rect.height < 10 ||
                    rect.width > viewport.width * 0.56 ||
                    rect.height > 130
                ) return;

                const value = normalizedUiText(element.textContent || element.innerText || '');
                if (!value || (!value.includes(target) && !target.includes(value))) return;
                seen.add(element);

                let score = Math.abs(rect.left - controlRect.left) + Math.abs(rect.top - controlRect.bottom) / 2;
                if (doc === control.ownerDocument) score -= 2200;
                if (value === target) score -= 10000;
                else score -= 3200 - Math.abs(value.length - target.length) * 10;
                if (/combobox-item|option|datagrid-row/i.test(String(element.className || ''))) score -= 900;
                result.push({ element, score });
            });
        });

        return result.sort((a, b) => a.score - b.score).map(item => item.element);
    }

    function visibleLabDropdownPanels(control) {
        if (!control) return [];
        const controlRect = labTopLevelRect(control);
        const result = [];
        const seen = new Set();
        const orderedDocs = [control.ownerDocument].concat(allDocuments().filter(doc => doc !== control.ownerDocument));

        orderedDocs.forEach(doc => {
            const viewport = labTopViewportSize();
            Array.from(doc.querySelectorAll([
                '.combo-panel',
                '.panel-body',
                '[role="listbox"]',
                '.layui-form-select dl',
                '.select2-results',
                '.dropdown-menu',
                '.el-select-dropdown',
                '.ant-select-dropdown',
                '.ivu-select-dropdown',
                'div',
                'ul'
            ].join(','))).filter(isVisible).forEach(panel => {
                if (seen.has(panel) || isOwnAssistantUi(panel)) return;
                if (panel.closest('[role="tree"],.tree,.layui-tree,.el-tree')) return;
                const rect = labTopLevelRect(panel);
                if (!rect || !controlRect) return;
                if (
                    rect.left > viewport.width * 0.56 ||
                    rect.top < controlRect.top - 70 ||
                    rect.top > controlRect.bottom + 780 ||
                    rect.width < 120 ||
                    rect.width > viewport.width * 0.58 ||
                    rect.height < 50 ||
                    rect.height > 620 ||
                    panel.scrollHeight <= panel.clientHeight + 3
                ) return;

                const optionCount = panel.querySelectorAll([
                    '.combobox-item', '[role="option"]', 'li', 'dd', '.datagrid-row', 'div'
                ].join(',')).length;
                if (!optionCount) return;

                seen.add(panel);
                let score = Math.abs(rect.left - controlRect.left) + Math.abs(rect.top - controlRect.bottom);
                if (doc === control.ownerDocument) score -= 1800;
                if (/combo-panel|listbox|dropdown|select/i.test(String(panel.className || '') + ' ' + String(panel.getAttribute && panel.getAttribute('role') || ''))) score -= 1800;
                result.push({ panel, score });
            });
        });

        return result.sort((a, b) => a.score - b.score).map(item => item.panel);
    }

    async function scrollLabDropdownForOption(control, text) {
        let options = labDropdownOptionCandidates(control, text);
        if (options.length) return options;

        const panels = visibleLabDropdownPanels(control);
        for (const panel of panels) {
            const original = panel.scrollTop;
            const maximum = Math.max(0, panel.scrollHeight - panel.clientHeight);
            const step = Math.max(60, Math.floor(panel.clientHeight * 0.72));

            for (let top = 0; top <= maximum + step; top += step) {
                panel.scrollTop = Math.min(top, maximum);
                try {
                    panel.dispatchEvent(new panel.ownerDocument.defaultView.Event('scroll', { bubbles: true }));
                }
                catch (error) {
                    // 忽略。
                }
                await outpatientOrderWait(110);
                options = labDropdownOptionCandidates(control, text);
                if (options.length) return options;
                if (top >= maximum) break;
            }

            panel.scrollTop = original;
        }

        return [];
    }

    function labOpenMenuOptionCandidates(text) {
        const target = normalizedUiText(text);
        if (!target) return [];
        const viewport = labTopViewportSize();
        const result = [];
        allDocuments().forEach(doc => {
            visibleElements(doc, [
                '.combobox-item',
                '.combo-panel .combobox-item',
                '[role="option"]',
                '.layui-form-select dl dd',
                '.select2-results__option',
                '.dropdown-menu li',
                '.dropdown-menu a',
                '.el-select-dropdown__item',
                '.ant-select-item-option',
                '.ivu-select-item',
                'li',
                'dd'
            ].join(',')).forEach(element => {
                if (isOwnAssistantUi(element) || element.closest('[role="tree"],.tree,.layui-tree,.el-tree')) return;
                const rect = labTopLevelRect(element);
                if (!rect || rect.left > viewport.width * 0.48 || rect.top < 150 || rect.top > viewport.height * 0.86) return;
                const value = normalizedUiText(element.textContent || element.innerText || '');
                if (value !== target) return;
                let score = rect.left + rect.top / 10;
                if (/combobox-item|option/i.test(String(element.className || ''))) score -= 1200;
                result.push({ element, score });
            });
        });
        return result.sort((a, b) => a.score - b.score).map(item => item.element);
    }

    async function selectLabPrimaryDirectory(primaryName, secondaryName) {
        let entries = outpatientLabPrimaryDropdownEntries();

        /*
         * 用户截图中下拉菜单已经展开时，即使外层组合框被框架重绘，也先直接
         * 接管已展开菜单中的目标项，不再立即报“找不到全部”。
         */
        let alreadyOpen = labOpenMenuOptionCandidates(primaryName);
        if (alreadyOpen.length) {
            const option = applicationExactTextTargets(alreadyOpen[0], primaryName)[0] || alreadyOpen[0];
            dispatchMouseSequenceAtElement(option);
            await outpatientOrderWait(760);
            const leaf = await waitExactApplicationTreeLeaf(secondaryName, 4200, '检验');
            if (leaf) return true;
        }

        if (!entries.length) {
            /* 再等待一次页面重绘，并重新从简拼框上方反查。 */
            await outpatientOrderWait(420);
            entries = outpatientLabPrimaryDropdownEntries();
        }

        if (!entries.length) {
            throw new Error('检验页面仍未锁定左上一级目录框。新版已按iframe顶层坐标，并从“组套名称简拼”框正上方反查“全部”输入区及独立箭头，但页面未返回可操作节点。');
        }

        for (const entry of entries.slice(0, 10)) {
            const control = entry.control;
            const clickTargets = labDropdownClickTargets(control);

            for (let attempt = 0; attempt < Math.max(1, clickTargets.length); attempt += 1) {
                const clickTarget = clickTargets[attempt] || control;
                if (!dispatchMouseSequenceAtElement(clickTarget)) continue;
                await outpatientOrderWait(360);

                let options = labDropdownOptionCandidates(control, primaryName);
                let editor = labDropdownEditor(control, true);
                let hadReadonly = false;
                let readonlyValue = null;

                if (!options.length && editor) {
                    hadReadonly = editor.hasAttribute && editor.hasAttribute('readonly');
                    readonlyValue = hadReadonly ? editor.getAttribute('readonly') : null;
                    try {
                        if (hadReadonly) editor.removeAttribute('readonly');
                        await typeIntoAutocompleteControl(editor, primaryName);
                        await outpatientOrderWait(560);
                        options = labDropdownOptionCandidates(control, primaryName);
                    }
                    finally {
                        if (hadReadonly && editor.isConnected) {
                            if (readonlyValue == null) editor.setAttribute('readonly', '');
                            else editor.setAttribute('readonly', readonlyValue);
                        }
                    }
                }

                if (!options.length) {
                    options = await scrollLabDropdownForOption(control, primaryName);
                }

                if (!options.length) {
                    options = labOpenMenuOptionCandidates(primaryName);
                }

                if (options.length) {
                    const exactTarget = applicationExactTextTargets(options[0], primaryName)[0] || options[0];
                    try {
                        exactTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
                    }
                    catch (error) {
                        // 忽略。
                    }
                    dispatchMouseSequenceAtElement(exactTarget);
                    await outpatientOrderWait(820);
                }
                else if (editor) {
                    try { editor.focus(); } catch (error) { /* 忽略。 */ }
                    dispatchKeyboard(editor, 'ArrowDown', 40);
                    await outpatientOrderWait(160);
                    dispatchKeyboard(editor, 'Enter', 13);
                    await outpatientOrderWait(820);
                }

                let treeLeaf = await waitExactApplicationTreeLeaf(secondaryName, 4400, '检验');
                if (treeLeaf) return true;

                editor = labDropdownEditor(control, true);
                if (editor && editor.isConnected) {
                    dispatchKeyboard(editor, 'Enter', 13);
                    await outpatientOrderWait(680);
                    treeLeaf = await waitExactApplicationTreeLeaf(secondaryName, 3200, '检验');
                    if (treeLeaf) return true;
                }
            }
        }

        for (const doc of allDocuments()) {
            const selects = Array.from(doc.querySelectorAll('select:not([disabled])'));
            for (const select of selects) {
                if (isOwnAssistantUi(select)) continue;
                const parent = select.closest('.combo,.textbox,.layui-form-select,.select2-container') || select;
                const rect = labTopLevelRect(parent);
                const viewport = labTopViewportSize();
                if (!rect || rect.left > viewport.width * 0.50) continue;
                if (await chooseNativeSelectOption(select, primaryName)) {
                    await outpatientOrderWait(760);
                    if (await waitExactApplicationTreeLeaf(secondaryName, 4000, '检验')) return true;
                }
            }
        }

        return false;
    }

    async function waitRightApplicationCandidate(text, timeout) {
        const target = normalizedUiText(text);
        const end = Date.now() + (Number(timeout) || 4200);
        while (Date.now() < end) {
            await outpatientOrderCheckpoint();
            let found = null;
            for (const doc of allDocuments()) {
                const width = (doc.defaultView || window).innerWidth || 1600;
                const rows = visibleElements(doc, 'tr,[role="row"],.datagrid-row').filter(row => {
                    if (isOwnAssistantUi(row)) return false;
                    const rect = row.getBoundingClientRect();
                    const value = normalizedUiText(row.textContent || '');
                    const topRect = labTopLevelRect(row) || rect;
                    const viewport = labTopViewportSize();
                    return topRect.left > viewport.width * 0.34 && topRect.top > 245 && value.includes(target);
                });
                if (rows[0]) {
                    found = rows[0];
                    break;
                }
            }
            if (found) return found;
            await sleep(130);
        }
        return null;
    }

    async function activateOutpatientApplicationTreeLeaf(leaf, text) {
        if (!leaf) return null;
        const targets = applicationExactTextTargets(leaf, text);
        for (const target of targets) {
            try {
                target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
            }
            catch (error) {
                // 忽略。
            }
            await outpatientOrderWait(90);
            dispatchMouseSequenceAtElement(target);
            const imported = await waitRightApplicationCandidate(text, 3000);
            if (imported) return imported;
        }
        const fallback = elementClickableTarget(leaf) || leaf;
        dispatchMouseSequenceAtElement(fallback);
        await outpatientOrderWait(120);
        dispatchMouseSequenceAtElement(fallback);
        return waitRightApplicationCandidate(text, 2600);
    }

    function findSaveApplicationButton() {
        const labels = ['F3:保存申请单', 'F3：保存申请单', '保存申请单'];
        for (const label of labels) {
            const button = findExactVisibleText(label, {
                selector: 'button,a,input[type="button"],input[type="submit"],span,div',
                allowContains: true
            });
            if (button && !isDisabledUiControl(elementClickableTarget(button) || button)) return button;
        }
        return null;
    }

    function visibleOutpatientSystemDialog(pattern) {
        let found = null;
        allDocuments().some(doc => {
            const dialogs = visibleElements(doc, '.layui-layer,.modal,.messager-window,.window,.ui-dialog,.el-message-box,.ant-modal,[role="dialog"]')
                .filter(dialog => !isOwnAssistantUi(dialog));
            found = dialogs.find(dialog => pattern.test(plain(dialog.textContent || ''))) || null;
            return Boolean(found);
        });
        return found;
    }

    function dispatchFunctionKey(doc, key, keyCode) {
        if (!doc) return false;
        const view = doc.defaultView || window;
        const targets = [doc.activeElement, doc.body, doc.documentElement].filter(Boolean);
        let sent = false;
        targets.forEach(target => {
            ['keydown', 'keypress', 'keyup'].forEach(type => {
                try {
                    const event = new view.KeyboardEvent(type, {
                        key,
                        code: key,
                        keyCode,
                        which: keyCode,
                        bubbles: true,
                        cancelable: true
                    });
                    try {
                        Object.defineProperty(event, 'keyCode', { get: () => keyCode });
                        Object.defineProperty(event, 'which', { get: () => keyCode });
                    }
                    catch (error) {
                        // 只读属性时忽略。
                    }
                    target.dispatchEvent(event);
                    sent = true;
                }
                catch (error) {
                    // 继续其他目标。
                }
            });
            try {
                if (view.jQuery) {
                    ['keydown', 'keypress', 'keyup'].forEach(type => {
                        view.jQuery(target).trigger(view.jQuery.Event(type, {
                            key,
                            code: key,
                            keyCode,
                            which: keyCode
                        }));
                    });
                    sent = true;
                }
            }
            catch (error) {
                // 忽略。
            }
        });
        return sent;
    }

    function prepareOutpatientApplicationPopupPool(items, autoSave) {
        state.outpatientApplicationPopupPool = [];
        state.outpatientApplicationPopupCursor = 0;
        if (!autoSave) return;
        const applications = items.filter(item => item.module === '检验' || item.module === '检查');
        applications.forEach((item, index) => {
            let popup = null;
            try {
                popup = window.open('about:blank', 'outpatient-application-' + Date.now() + '-' + index);
                if (popup && popup.document) {
                    popup.document.title = (item.module || '申请单') + '－等待医院页面加载';
                    popup.document.body.innerHTML = '<div style="font-family:Microsoft YaHei;padding:24px;color:#555">正在等待医院打开' + (item.module || '申请单') + '页面……</div>';
                }
            }
            catch (error) {
                popup = null;
            }
            state.outpatientApplicationPopupPool.push({ popup, item, used: false });
        });
    }

    function claimOutpatientApplicationPopup(item) {
        const pool = state.outpatientApplicationPopupPool || [];
        for (let index = state.outpatientApplicationPopupCursor || 0; index < pool.length; index += 1) {
            const entry = pool[index];
            if (entry.used) continue;
            entry.used = true;
            state.outpatientApplicationPopupCursor = index + 1;
            return entry.popup && !entry.popup.closed ? entry.popup : null;
        }
        return null;
    }

    function beginOutpatientApplicationPopupRouting(preparedWindow) {
        if (!preparedWindow || preparedWindow.closed) return () => {};
        const records = [];
        allDocuments().forEach(doc => {
            const view = doc.defaultView;
            if (!view || typeof view.open !== 'function') return;
            try {
                const original = view.open;
                view.open = function(url, target, features) {
                    if (preparedWindow && !preparedWindow.closed && url && url !== 'about:blank') {
                        try {
                            preparedWindow.location.href = url;
                            if (target && target !== '_blank') preparedWindow.name = target;
                            preparedWindow.focus();
                            return preparedWindow;
                        }
                        catch (error) {
                            // 回退原window.open。
                        }
                    }
                    return original.call(view, url, target, features);
                };
                records.push({ view, original });
            }
            catch (error) {
                // 只读window时忽略。
            }
        });
        return () => records.forEach(record => {
            try { record.view.open = record.original; }
            catch (error) { /* 忽略。 */ }
        });
    }

    function closeUnusedOutpatientApplicationPopups() {
        (state.outpatientApplicationPopupPool || []).forEach(entry => {
            if (!entry.used && entry.popup && !entry.popup.closed) {
                try { entry.popup.close(); }
                catch (error) { /* 忽略。 */ }
            }
        });
        state.outpatientApplicationPopupPool = [];
        state.outpatientApplicationPopupCursor = 0;
    }

    async function simulateOutpatientF3Save(moduleName, item) {
        const saveButton = moduleName === '检验' || moduleName === '检查'
            ? findSaveApplicationButton()
            : null;
        const doc = saveButton ? saveButton.ownerDocument : (
            findExactVisibleText(moduleName, { selector: 'a,span,div,li,button', allowContains: false })?.ownerDocument || document
        );
        const prepared = moduleName === '检验' || moduleName === '检查'
            ? claimOutpatientApplicationPopup(item)
            : null;
        const restoreRouting = beginOutpatientApplicationPopupRouting(prepared);
        try {
            const sent = dispatchFunctionKey(doc, 'F3', 114);
            if (!sent) {
                throw new Error('未能向医院页面发送F3保存快捷键。');
            }
            await outpatientOrderWait(moduleName === '检验' || moduleName === '检查' ? 1500 : 850);
            const errorDialog = visibleOutpatientSystemDialog(/保存失败|未能保存|不能保存|请选择|不能为空|申请项目为空|缺少执行科室|缺少部位|缺少方法/);
            if (errorDialog) {
                throw new Error('医院保存提示：' + plain(errorDialog.textContent || '').slice(0, 180));
            }
            return true;
        }
        finally {
            restoreRouting();
            if (prepared && !prepared.closed) {
                try {
                    if (prepared.location.href === 'about:blank') {
                        prepared.close();
                    }
                }
                catch (error) {
                    /* 已跳转到医院申请单页面时会因窗口上下文变化读取失败，此时保留该页。 */
                }
            }
        }
    }



    /*
     * 门诊检验、检查兼容层：直接移植“临床路径组套跨标签页自动录入 v1.40”
     * 的一级下拉、左侧树检索、原生/jQuery回车、树节点点击及右侧引入确认方法。
     * 仅将状态等待接入门诊助手的暂停/中止机制，保存仍沿用门诊助手的F3流程。
     */
    function outpatientPathwayEventPoint(element) {
        const rect = element.getBoundingClientRect();

        return {
            x: Math.round(rect.left + Math.max(1, rect.width) / 2),
            y: Math.round(rect.top + Math.max(1, rect.height) / 2)
        };
    }

    function outpatientPathwayDispatchPointerMouse(element, type, point, detail) {
        if (!element) return;

        const win = element.ownerDocument.defaultView;
        const options = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: win,
            clientX: point.x,
            clientY: point.y,
            screenX: point.x,
            screenY: point.y,
            button: 0,
            buttons: /down/.test(type) ? 1 : 0,
            detail: detail || 1
        };

        try {
            if (/^pointer/.test(type) &&
                typeof win.PointerEvent === 'function') {
                element.dispatchEvent(
                    new win.PointerEvent(type, Object.assign({
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true
                    }, options))
                );
                return;
            }
        }
        catch (error) {
            // 旧版浏览器或框架不支持PointerEvent时继续发送MouseEvent。
        }

        if (!/^pointer/.test(type)) {
            element.dispatchEvent(
                new win.MouseEvent(type, options)
            );
        }
    }

    function outpatientPathwayRealClick(element) {
        if (!element) return;

        const point = outpatientPathwayEventPoint(element);

        outpatientPathwayDispatchPointerMouse(element, 'pointerdown', point, 1);
        outpatientPathwayDispatchPointerMouse(element, 'mousedown', point, 1);
        outpatientPathwayDispatchPointerMouse(element, 'pointerup', point, 1);
        outpatientPathwayDispatchPointerMouse(element, 'mouseup', point, 1);
        outpatientPathwayDispatchPointerMouse(element, 'click', point, 1);

        try {
            element.focus({ preventScroll: true });
        }
        catch (error) {
            try {
                element.focus();
            }
            catch (ignore) {
                // 忽略。
            }
        }
    }

    function outpatientPathwayRealDoubleClick(element) {
        if (!element) return;

        const point = outpatientPathwayEventPoint(element);

        outpatientPathwayRealClick(element);
        outpatientPathwayRealClick(element);
        outpatientPathwayDispatchPointerMouse(element, 'dblclick', point, 2);
    }

    function outpatientPathwayClickDocumentPoint(doc, x, y, fallback) {
        let target = null;

        try {
            target = doc.elementFromPoint(x, y);
        }
        catch (error) {
            target = null;
        }

        target = target || fallback;

        if (!target) return null;

        const point = {
            x: Math.round(x),
            y: Math.round(y)
        };

        outpatientPathwayDispatchPointerMouse(target, 'pointerdown', point, 1);
        outpatientPathwayDispatchPointerMouse(target, 'mousedown', point, 1);
        outpatientPathwayDispatchPointerMouse(target, 'pointerup', point, 1);
        outpatientPathwayDispatchPointerMouse(target, 'mouseup', point, 1);
        outpatientPathwayDispatchPointerMouse(target, 'click', point, 1);

        try {
            target.focus({ preventScroll: true });
        }
        catch (error) {
            try {
                target.focus();
            }
            catch (ignore) {
                // 忽略。
            }
        }

        return target;
    }

    function outpatientPathwayPressKey(element, key, code) {
        if (!element) return;
        const win = element.ownerDocument.defaultView;
        const options = { key: key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true };
        element.dispatchEvent(new win.KeyboardEvent('keydown', options));
        element.dispatchEvent(new win.KeyboardEvent('keyup', options));
    }

    function outpatientPathwaySetInputValue(doc, input, value) {
        if (!input) return;
        const win = doc.defaultView;
        if (input.isContentEditable) {
            input.focus();
            input.textContent = String(value);
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
            input.dispatchEvent(new win.Event('change', { bubbles: true }));
            input.blur();
            return;
        }
        const proto = input instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        input.focus();
        if (descriptor && descriptor.set) descriptor.set.call(input, String(value)); else input.value = String(value);
        input.setAttribute('value', String(value));
        if (win.jQuery) win.jQuery(input).val(String(value)).trigger('input').trigger('change').trigger('keyup');
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
        input.blur();
    }

    function outpatientPathwayTriggerSelect(doc, select, option) {
        const win = doc.defaultView;
        select.value = option.value;
        Array.from(select.options || []).forEach(item => { item.selected = item === option; });
        if (win.jQuery) win.jQuery(select).val(option.value).trigger('input').trigger('change');
        select.dispatchEvent(new win.Event('input', { bubbles: true }));
        select.dispatchEvent(new win.Event('change', { bubbles: true }));
        try { if (win.layui && win.layui.form) win.layui.form.render('select'); } catch (error) { /* skip */ }
    }

    function outpatientPathwayCheckSearchInput(doc) {
        const inputs = Array.from(
            doc.querySelectorAll(
                'input:not([type="hidden"]):not([disabled])'
            )
        ).filter(isVisible);

        return inputs.find(function (input) {
            const placeholder = normalizedUiText(
                input.getAttribute('placeholder') || ''
            );
            const title = normalizedUiText(
                input.getAttribute('title') || ''
            );
            const aria = normalizedUiText(
                input.getAttribute('aria-label') || ''
            );

            return (
                placeholder.includes(
                    normalizedUiText('组套名称简拼')
                ) ||
                placeholder.includes(
                    normalizedUiText('组套名称')
                ) ||
                title.includes(
                    normalizedUiText('组套名称简拼')
                ) ||
                aria.includes(
                    normalizedUiText('组套名称简拼')
                )
            );
        }) || null;
    }

    function outpatientPathwayCheckTreeClickable(element) {
        if (!element) return null;

        return element.closest([
            '[role="treeitem"]',
            '.tree-node',
            '.tree-title',
            '.layui-tree-txt',
            '.ztree li',
            'li',
            'a',
            'button'
        ].join(',')) || element;
    }

    function outpatientPathwayCollectCheckTreeCandidates(term) {
        const target = normalizedUiText(term);
        const candidates = [];
        const seen = new Set();

        allDocuments().forEach(function (doc) {
            const viewportWidth =
                doc.defaultView.innerWidth || 1600;

            Array.from(doc.querySelectorAll([
                '[role="treeitem"]',
                '.tree-node',
                '.tree-title',
                '.layui-tree-txt',
                '.ztree li',
                'li',
                'a',
                'span',
                'div',
                'td'
            ].join(',')))
                .filter(isVisible)
                .forEach(function (element) {
                    if (
                        seen.has(element) ||
                        element.closest('#' + IDS.modal) ||
                        element.closest('#' + IDS.panel)
                    ) {
                        return;
                    }

                    seen.add(element);

                    const display = plain(
                        element.innerText ||
                        element.textContent
                    );

                    if (normalizedUiText(display) !== target) {
                        return;
                    }

                    const rect =
                        element.getBoundingClientRect();

                    /*
                     * 检查项目字典位于页面左侧树形区域。
                     * 排除右侧“已申请明细”和上方申请项目表中的同名文字。
                     */
                    if (
                        rect.left >
                        viewportWidth * 0.48
                    ) {
                        return;
                    }

                    if (
                        rect.width < 8 ||
                        rect.height < 8 ||
                        rect.width > 560 ||
                        rect.height > 120
                    ) {
                        return;
                    }

                    const clickable =
                        outpatientPathwayCheckTreeClickable(element);

                    if (!clickable) {
                        return;
                    }

                    const classText = [
                        element.className || '',
                        clickable.className || ''
                    ].join(' ');
                    let score =
                        rect.left +
                        rect.top / 8 +
                        rect.width / 15;

                    if (
                        element.matches(
                            '[role="treeitem"],li,a,.tree-node,.tree-title,.layui-tree-txt'
                        )
                    ) {
                        score -= 900;
                    }

                    if (
                        /tree|node|leaf|ztree|layui-tree/i.test(
                            classText
                        )
                    ) {
                        score -= 1300;
                    }

                    if (
                        /selected|active|current/i.test(
                            classText
                        )
                    ) {
                        score -= 250;
                    }

                    candidates.push({
                        doc: doc,
                        element: element,
                        clickable: clickable,
                        score: score
                    });
                });
        });

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        return candidates;
    }

    async function outpatientPathwayWaitCheckTreeCandidate(
        term,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 3500);

        while (Date.now() < deadline) {
            const candidates =
                outpatientPathwayCollectCheckTreeCandidates(term);

            if (candidates.length) {
                return candidates[0];
            }

            await outpatientOrderWait(100);
        }

        return null;
    }


    function outpatientPathwayDispatchCheckSearchEnter(input) {
        if (!input) {
            return;
        }

        const doc = input.ownerDocument;
        const win = doc.defaultView;

        try {
            input.focus({
                preventScroll: true
            });
        }
        catch (error) {
            input.focus();
        }

        try {
            const length = String(
                input.value || ''
            ).length;

            if (
                typeof input.setSelectionRange ===
                'function'
            ) {
                input.setSelectionRange(
                    length,
                    length
                );
            }
        }
        catch (error) {
            // 部分旧控件不支持setSelectionRange。
        }

        /*
         * 医院检查树只在回车事件后真正执行筛选。
         * 旧版pressKey仅发送keydown和keyup，部分jQuery旧组件
         * 监听的是keypress或jQuery包装事件，因此这里完整发送：
         * keydown → keypress → keyup，并补发jQuery事件。
         */
        ['keydown', 'keypress', 'keyup'].forEach(
            function (type) {
                const options = {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    charCode:
                        type === 'keypress'
                            ? 13
                            : 0,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                    composed: true
                };

                try {
                    input.dispatchEvent(
                        new win.KeyboardEvent(
                            type,
                            options
                        )
                    );
                }
                catch (error) {
                    const event =
                        doc.createEvent(
                            'KeyboardEvent'
                        );

                    try {
                        event.initKeyboardEvent(
                            type,
                            true,
                            true,
                            win,
                            'Enter',
                            0,
                            '',
                            false,
                            ''
                        );
                    }
                    catch (ignore) {
                        // 继续尝试旧式Event。
                    }

                    try {
                        Object.defineProperty(
                            event,
                            'keyCode',
                            {
                                get: function () {
                                    return 13;
                                }
                            }
                        );
                        Object.defineProperty(
                            event,
                            'which',
                            {
                                get: function () {
                                    return 13;
                                }
                            }
                        );
                    }
                    catch (ignore) {
                        // 忽略只读属性。
                    }

                    input.dispatchEvent(event);
                }
            }
        );

        if (win.jQuery) {
            const $input = win.jQuery(input);

            ['keydown', 'keypress', 'keyup'].forEach(
                function (type) {
                    const event =
                        win.jQuery.Event(type);

                    event.key = 'Enter';
                    event.code = 'Enter';
                    event.keyCode = 13;
                    event.which = 13;
                    event.charCode =
                        type === 'keypress'
                            ? 13
                            : 0;

                    $input.trigger(event);
                }
            );
        }
    }

    async function outpatientPathwaySubmitCheckSearch(
        searchInput,
        term
    ) {
        if (!searchInput) {
            return null;
        }

        const doc =
            searchInput.ownerDocument;

        /*
         * 先清空再填写，避免上一个检查项目残留值导致医院组件
         * 判断为“内容未变化”而不重新检索。
         */
        outpatientPathwaySetInputValue(
            doc,
            searchInput,
            ''
        );

        await outpatientOrderWait(90);

        outpatientPathwaySetInputValue(
            doc,
            searchInput,
            term
        );

        await outpatientOrderWait(120);

        outpatientPathwayDispatchCheckSearchEnter(
            searchInput
        );

        /*
         * 回车后左侧树会异步重建。固定等待一段时间，再从新DOM中
         * 重新查找目标，避免点击筛选前的旧节点。
         */
        await outpatientOrderWait(650);

        let candidate =
            await outpatientPathwayWaitCheckTreeCandidate(
                term,
                3600
            );

        if (
            candidate &&
            candidate.element &&
            !candidate.element.isConnected
        ) {
            candidate = null;
        }

        if (!candidate) {
            /*
             * 某些旧组件第一次回车只把输入框置为活动状态，
             * 第二次回车才真正触发查询。
             */
            outpatientPathwayDispatchCheckSearchEnter(
                searchInput
            );

            await outpatientOrderWait(650);

            candidate =
                await outpatientPathwayWaitCheckTreeCandidate(
                    term,
                    3000
                );
        }

        return candidate;
    }

    function outpatientPathwayCheckTreeExactTextTargets(
        candidate,
        term
    ) {
        const target = normalizedUiText(term);
        const targets = [];
        const seen = new Set();

        function append(element, priority) {
            if (
                !element ||
                seen.has(element) ||
                !element.isConnected ||
                !isVisible(element)
            ) {
                return;
            }

            const rect =
                element.getBoundingClientRect();

            if (
                rect.width < 5 ||
                rect.height < 5 ||
                rect.width > 650 ||
                rect.height > 140
            ) {
                return;
            }

            seen.add(element);

            targets.push({
                element: element,
                priority: priority,
                area: rect.width * rect.height
            });
        }

        const roots = [
            candidate && candidate.element,
            candidate && candidate.clickable
        ].filter(Boolean);

        roots.forEach(function (root) {
            /*
             * 优先寻找显示名称完全等于目标的最深层文字节点。
             * 医院树控件的点击事件通常绑定在文字span、title节点
             * 或叶子li上，不能只点击外围大容器。
             */
            Array.from(
                root.querySelectorAll
                    ? root.querySelectorAll(
                        'span,a,label,div,td,[role="treeitem"],.tree-title,.tree-node,.layui-tree-txt'
                    )
                    : []
            )
                .filter(isVisible)
                .forEach(function (element) {
                    const display = normalizedUiText(
                        element.innerText ||
                        element.textContent
                    );

                    if (display !== target) {
                        return;
                    }

                    let priority = 20;

                    if (
                        element.matches(
                            '.tree-title,.layui-tree-txt,a,label,span'
                        )
                    ) {
                        priority -= 8;
                    }

                    if (
                        element.children.length === 0
                    ) {
                        priority -= 5;
                    }

                    append(element, priority);
                });

            const rootText = normalizedUiText(
                root.innerText ||
                root.textContent
            );

            if (rootText === target) {
                append(root, 25);
            }

            let parent = root.parentElement;
            let level = 0;

            while (
                parent &&
                level < 4
            ) {
                const display = normalizedUiText(
                    parent.innerText ||
                    parent.textContent
                );

                if (display === target) {
                    append(
                        parent,
                        30 + level
                    );
                }

                if (
                    parent.matches(
                        'li,[role="treeitem"],.tree-node,.ztree li'
                    )
                ) {
                    append(
                        parent,
                        40 + level
                    );
                }

                parent = parent.parentElement;
                level += 1;
            }
        });

        targets.sort(function (a, b) {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }

            return a.area - b.area;
        });

        return targets.map(function (entry) {
            return entry.element;
        });
    }

    function outpatientPathwayDispatchCheckTreeNativeClick(element) {
        if (!element) {
            return;
        }

        const doc = element.ownerDocument;
        const win = doc.defaultView;
        const rect =
            element.getBoundingClientRect();
        const x = Math.round(
            rect.left + rect.width / 2
        );
        const y = Math.round(
            rect.top + rect.height / 2
        );

        /*
         * 坐标点击可命中树节点覆盖层或实际文字节点；
         * 随后再补发DOM click和jQuery click，兼容旧版树插件。
         */
        outpatientPathwayClickDocumentPoint(
            doc,
            x,
            y,
            element
        );

        try {
            element.click();
        }
        catch (error) {
            // 忽略不支持原生click的节点。
        }

        if (win.jQuery) {
            const $element =
                win.jQuery(element);

            ['mousedown', 'mouseup', 'click'].forEach(
                function (type) {
                    const event =
                        win.jQuery.Event(type);

                    event.which = 1;
                    event.button = 0;
                    event.pageX = x;
                    event.pageY = y;
                    event.clientX = x;
                    event.clientY = y;

                    $element.trigger(event);
                }
            );
        }
    }

    async function outpatientPathwayTryCheckTreeTarget(
        element,
        term
    ) {
        if (
            !element ||
            !element.isConnected
        ) {
            return false;
        }

        element.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'auto'
        });

        await outpatientOrderWait(120);

        /*
         * 正常流程只需要单击左侧具体项目，医院页面会立即把该项目
         * 引入右侧候选框。检测到右侧出现项目后立刻返回，不再重复点击。
         */
        outpatientPathwayDispatchCheckTreeNativeClick(
            element
        );

        if (await outpatientPathwayWaitCheckCandidateImported(
            term,
            2600
        )) {
            return true;
        }

        /*
         * 仅在单击没有引入时补一次原生双击作为兼容兜底。
         */
        outpatientPathwayRealDoubleClick(element);

        return outpatientPathwayWaitCheckCandidateImported(
            term,
            2200
        );
    }


    async function outpatientPathwayActivateCheckTreeCandidate(
        candidate,
        term
    ) {
        if (
            !candidate ||
            !candidate.element ||
            !candidate.element.isConnected
        ) {
            candidate =
                await outpatientPathwayWaitCheckTreeCandidate(
                    term,
                    2400
                );
        }

        if (!candidate) {
            return false;
        }

        /*
         * 回车检索后树DOM可能再次重建，因此点击前重新定位一次，
         * 避免使用已经失效或只代表外围容器的旧节点。
         */
        const refreshed =
            await outpatientPathwayWaitCheckTreeCandidate(
                term,
                1400
            );

        if (refreshed) {
            candidate = refreshed;
        }

        const targets =
            outpatientPathwayCheckTreeExactTextTargets(
                candidate,
                term
            );

        for (const target of targets) {
            if (await outpatientPathwayTryCheckTreeTarget(
                target,
                term
            )) {
                return true;
            }
        }

        /*
         * 最后兜底点击候选对象原始element和clickable。
         */
        const fallbackTargets = [
            candidate.element,
            candidate.clickable
        ].filter(Boolean);

        for (const target of fallbackTargets) {
            if (await outpatientPathwayTryCheckTreeTarget(
                target,
                term
            )) {
                return true;
            }
        }

        return false;
    }

    function outpatientPathwayCheckApplicationTableRoots() {
        const roots = [];
        const seen = new Set();

        allDocuments().forEach(function (doc) {
            const viewportWidth =
                doc.defaultView.innerWidth || 1600;

            Array.from(doc.querySelectorAll([
                'table',
                '.layui-table-view',
                '.datagrid',
                '[role="grid"]'
            ].join(',')))
                .filter(isVisible)
                .forEach(function (root) {
                    if (
                        seen.has(root) ||
                        root.closest('#' + IDS.modal) ||
                        root.closest('#' + IDS.panel)
                    ) {
                        return;
                    }

                    const rect =
                        root.getBoundingClientRect();

                    /*
                     * 检查申请区位于页面右侧，左侧检查树不应参与
                     * “申请明细是否仍存在”的判断。
                     */
                    if (
                        rect.right <
                        viewportWidth * 0.52 ||
                        rect.left <
                        viewportWidth * 0.34
                    ) {
                        return;
                    }

                    const headerText = normalizedUiText(
                        Array.from(
                            root.querySelectorAll(
                                'th,[role="columnheader"],.datagrid-header td'
                            )
                        )
                            .map(function (cell) {
                                return plain(
                                    cell.innerText ||
                                    cell.textContent
                                );
                            })
                            .join(' ')
                    );
                    const rootText = normalizedUiText(
                        root.innerText ||
                        root.textContent
                    );

                    const upperSignature =
                        headerText.includes(
                            normalizedUiText('项目名称')
                        ) &&
                        headerText.includes(
                            normalizedUiText('数量')
                        ) &&
                        (
                            headerText.includes(
                                normalizedUiText('申请类型')
                            ) ||
                            headerText.includes(
                                normalizedUiText('项目编码')
                            ) ||
                            headerText.includes(
                                normalizedUiText('执行科室')
                            )
                        );

                    const detailSignature =
                        headerText.includes(
                            normalizedUiText('组套名称')
                        ) &&
                        headerText.includes(
                            normalizedUiText('金额')
                        ) &&
                        (
                            headerText.includes(
                                normalizedUiText('申请类型')
                            ) ||
                            headerText.includes(
                                normalizedUiText('执行科室')
                            ) ||
                            headerText.includes(
                                normalizedUiText('操作')
                            )
                        );

                    const textSignature =
                        rootText.includes(
                            normalizedUiText('已申请单明细')
                        ) ||
                        rootText.includes(
                            normalizedUiText('申请单总金额')
                        );

                    if (
                        !upperSignature &&
                        !detailSignature &&
                        !textSignature
                    ) {
                        return;
                    }

                    seen.add(root);
                    roots.push({
                        doc: doc,
                        root: root,
                        rect: rect,
                        type: upperSignature
                            ? 'upper'
                            : 'detail'
                    });
                });
        });

        return roots;
    }

    function outpatientPathwayCheckRightSideContainsImportedItem(term) {
        const target = normalizedUiText(term);

        return allDocuments().some(function (doc) {
            const viewportWidth =
                doc.defaultView.innerWidth || 1600;

            return Array.from(doc.querySelectorAll([
                'tr',
                '[role="row"]',
                '.datagrid-row',
                'td',
                '[role="gridcell"]',
                'div',
                'span'
            ].join(',')))
                .filter(isVisible)
                .some(function (element) {
                    if (
                        element.closest('#' + IDS.modal) ||
                        element.closest('#' + IDS.panel) ||
                        element.closest('#' + IDS.status)
                    ) {
                        return false;
                    }

                    const rect =
                        element.getBoundingClientRect();

                    /*
                     * 左侧树区域通常位于页面左半侧。
                     * 只识别页面右侧候选项目/申请明细中的同名项目。
                     */
                    if (
                        rect.left <
                        viewportWidth * 0.36
                    ) {
                        return false;
                    }

                    if (
                        rect.width < 6 ||
                        rect.height < 6 ||
                        rect.width > 1000 ||
                        rect.height > 180
                    ) {
                        return false;
                    }

                    const display = normalizedUiText(
                        element.innerText ||
                        element.textContent
                    );

                    return (
                        display === target ||
                        (
                            display.includes(target) &&
                            display.length <=
                                target.length + 30
                        )
                    );
                });
        });
    }

    function outpatientPathwayCheckApplicationCandidateContains(term) {
        const target = normalizedUiText(term);

        /*
         * 这里只检查右侧上方“选择组套/候选项目”表格，
         * 用来确认左侧树项目已经真正被点击并引入右侧。
         */
        return outpatientPathwayCheckApplicationTableRoots()
            .filter(function (entry) {
                return entry.type === 'upper';
            })
            .some(function (entry) {
                return Array.from(
                    entry.root.querySelectorAll(
                        'tr,[role="row"],.datagrid-row,td,[role="gridcell"]'
                    )
                )
                    .filter(isVisible)
                    .some(function (element) {
                        const display = normalizedUiText(
                            element.innerText ||
                            element.textContent
                        );

                        return (
                            display === target ||
                            display.includes(target)
                        );
                    });
            });
    }

    async function outpatientPathwayWaitCheckCandidateImported(
        term,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 2600);

        while (Date.now() < deadline) {
            if (
                outpatientPathwayCheckRightSideContainsImportedItem(term) ||
                outpatientPathwayCheckApplicationCandidateContains(term) ||
                outpatientPathwayCheckApplicationDetailContains(term)
            ) {
                return true;
            }

            await outpatientOrderWait(90);
        }

        return false;
    }

    function outpatientPathwayCheckApplicationDetailContains(term) {
        const target = normalizedUiText(term);

        return outpatientPathwayCheckApplicationTableRoots().some(
            function (entry) {
                return Array.from(
                    entry.root.querySelectorAll(
                        'tr,[role="row"],.datagrid-row,td,[role="gridcell"]'
                    )
                )
                    .filter(isVisible)
                    .some(function (element) {
                        const display = normalizedUiText(
                            element.innerText ||
                            element.textContent
                        );

                        return (
                            display === target ||
                            display.includes(target)
                        );
                    });
            }
        );
    }

    function outpatientPathwayLabDropdownKnownOptionSelectors() {
        return [
            '.combobox-item',
            '.combo-panel .combobox-item',
            '.combo-panel div',
            '.panel-body .combobox-item',
            '[role="option"]',
            '.layui-form-select dl dd',
            '.select2-results__option',
            '.dropdown-menu li',
            '.dropdown-menu a',
            '.el-select-dropdown__item',
            '.ant-select-item-option',
            '.ivu-select-item'
        ].join(',');
    }

    function outpatientPathwayLabNativePresetSelectCandidates(
        term
    ) {
        const target =
            normalizedUiText(term);
        const candidates = [];

        allDocuments().forEach(
            function (doc) {
                const viewportWidth =
                    doc.defaultView.innerWidth ||
                    1600;

                Array.from(
                    doc.querySelectorAll(
                        'select:not([disabled])'
                    )
                ).forEach(function (select) {
                    if (
                        select.closest(
                            '#' + IDS.modal
                        ) ||
                        select.closest(
                            '#' + IDS.panel
                        )
                    ) {
                        return;
                    }

                    const rect =
                        select.getBoundingClientRect();
                    const visualParent =
                        select.closest(
                            '.combo,.textbox,.layui-form-select,.select2-container'
                        );
                    const visualRect =
                        visualParent &&
                        visualParent.getBoundingClientRect
                            ? visualParent.getBoundingClientRect()
                            : rect;

                    /*
                     * 检验组套下拉框位于页面左侧上方。
                     * 隐藏原生select也允许参与，因为EasyUI通常用隐藏
                     * select保存真实值，外层combo负责显示。
                     */
                    if (
                        visualRect.left >
                        viewportWidth * 0.46
                    ) {
                        return;
                    }

                    const option =
                        Array.from(
                            select.options || []
                        ).find(function (entry) {
                            return (
                                normalizedUiText(
                                    entry.textContent ||
                                    entry.innerText
                                ) === target
                            );
                        });

                    if (!option) {
                        return;
                    }

                    let score =
                        visualRect.top +
                        visualRect.left / 10;

                    if (
                        normalizedUiText(
                            select.value ||
                            (
                                select.options &&
                                select.selectedIndex >= 0
                                    ? select.options[
                                        select.selectedIndex
                                      ].textContent
                                    : ''
                            )
                        ) === target
                    ) {
                        score -= 1200;
                    }

                    candidates.push({
                        doc: doc,
                        select: select,
                        option: option,
                        score: score
                    });
                });
            }
        );

        candidates.sort(
            function (a, b) {
                return a.score - b.score;
            }
        );

        return candidates;
    }

    function outpatientPathwayLabVisualPresetControls() {
        const candidates = [];

        allDocuments().forEach(
            function (doc) {
                const viewportWidth =
                    doc.defaultView.innerWidth ||
                    1600;
                const viewportHeight =
                    doc.defaultView.innerHeight ||
                    900;

                Array.from(
                    doc.querySelectorAll([
                        '.combo',
                        '.textbox.combo',
                        '.easyui-combobox',
                        '[role="combobox"]',
                        'input.combo-text',
                        'input.textbox-text',
                        '.layui-form-select',
                        '.select2-container',
                        '.el-select',
                        '.ant-select',
                        '.ivu-select'
                    ].join(','))
                )
                    .filter(isVisible)
                    .forEach(function (element) {
                        if (
                            element.closest(
                                '#' + IDS.modal
                            ) ||
                            element.closest(
                                '#' + IDS.panel
                            )
                        ) {
                            return;
                        }

                        const rect =
                            element.getBoundingClientRect();

                        if (
                            rect.left >
                                viewportWidth * 0.46 ||
                            rect.top >
                                viewportHeight * 0.62 ||
                            rect.width < 55 ||
                            rect.width > 650 ||
                            rect.height < 16 ||
                            rect.height > 90
                        ) {
                            return;
                        }

                        const display =
                            plain(
                                element.value ||
                                element.innerText ||
                                element.textContent
                            );
                        const placeholder =
                            plain(
                                element.getAttribute &&
                                element.getAttribute(
                                    'placeholder'
                                )
                            );
                        const ariaLabel =
                            plain(
                                element.getAttribute &&
                                element.getAttribute(
                                    'aria-label'
                                )
                            );
                        const title =
                            plain(
                                element.getAttribute &&
                                element.getAttribute(
                                    'title'
                                )
                            );
                        const semanticText =
                            normalizedUiText(
                                [
                                    placeholder,
                                    ariaLabel,
                                    title,
                                    display
                                ].join(' ')
                            );

                        /*
                         * 严格排除树状列表上方的“组套名称简拼”搜索栏。
                         * 该输入框不再作为低优先级候选，而是完全禁止使用。
                         */
                        if (
                            semanticText.includes(
                                normalizedUiText(
                                    '组套名称简拼'
                                )
                            ) ||
                            semanticText.includes(
                                normalizedUiText(
                                    '简拼'
                                )
                            )
                        ) {
                            return;
                        }

                        /*
                         * 只保留真正的下拉/组合框候选。
                         * 普通文本输入框即使位于左上角也不得进入候选列表。
                         */
                        const classAndRole =
                            String(
                                element.className ||
                                ''
                            ) +
                            ' ' +
                            String(
                                element.getAttribute &&
                                element.getAttribute(
                                    'role'
                                ) ||
                                ''
                            );

                        const isRealDropdownControl =
                            /combo|select|combobox/i.test(
                                classAndRole
                            ) ||
                            Boolean(
                                element.closest &&
                                element.closest(
                                    '.combo,.textbox.combo,.easyui-combobox,.layui-form-select,.select2-container,.el-select,.ant-select,.ivu-select'
                                )
                            );

                        if (!isRealDropdownControl) {
                            return;
                        }

                        /*
                         * 优先选择当前显示“全部”或位于左侧第一行的组合框。
                         */
                        let score =
                            rect.top +
                            rect.left / 8;

                        if (
                            normalizedUiText(display) ===
                            normalizedUiText('全部')
                        ) {
                            score -= 2200;
                        }

                        if (
                            /combo|select|combobox/i.test(
                                String(
                                    element.className ||
                                    ''
                                ) +
                                ' ' +
                                String(
                                    element.getAttribute &&
                                    element.getAttribute(
                                        'role'
                                    ) ||
                                    ''
                                )
                            )
                        ) {
                            score -= 600;
                        }

                        candidates.push({
                            doc: doc,
                            element: element,
                            score: score
                        });
                    });
            }
        );

        candidates.sort(
            function (a, b) {
                return a.score - b.score;
            }
        );

        return candidates;
    }

    function outpatientPathwayLabDropdownExactOptions(
        doc,
        dropdownTerm
    ) {
        const target =
            normalizedUiText(dropdownTerm);

        return Array.from(
            doc.querySelectorAll(
                outpatientPathwayLabDropdownKnownOptionSelectors()
            )
        )
            .filter(isVisible)
            .filter(function (element) {
                if (
                    element.closest(
                        '#' + IDS.modal
                    ) ||
                    element.closest(
                        '#' + IDS.panel
                    )
                ) {
                    return false;
                }

                const rect =
                    element.getBoundingClientRect();
                const viewportWidth =
                    doc.defaultView.innerWidth ||
                    1600;

                if (
                    rect.left >
                        viewportWidth * 0.50 ||
                    rect.width < 20 ||
                    rect.width > 700 ||
                    rect.height < 10 ||
                    rect.height > 100
                ) {
                    return false;
                }

                return (
                    normalizedUiText(
                        element.innerText ||
                        element.textContent
                    ) === target
                );
            })
            .sort(function (a, b) {
                const classA =
                    String(
                        a.className ||
                        ''
                    );
                const classB =
                    String(
                        b.className ||
                        ''
                    );
                let scoreA =
                    a.getBoundingClientRect().top;
                let scoreB =
                    b.getBoundingClientRect().top;

                if (
                    /combobox-item|option|select/i.test(
                        classA
                    )
                ) {
                    scoreA -= 1500;
                }

                if (
                    /combobox-item|option|select/i.test(
                        classB
                    )
                ) {
                    scoreB -= 1500;
                }

                return scoreA - scoreB;
            });
    }

    function outpatientPathwayLabDropdownEditor(
        control
    ) {
        if (!control) {
            return null;
        }

        const candidates = [];

        if (
            control.matches &&
            control.matches(
                'input,textarea'
            )
        ) {
            candidates.push(control);
        }

        if (control.querySelectorAll) {
            candidates.push(
                ...Array.from(
                    control.querySelectorAll([
                        'input.combo-text',
                        'input.textbox-text',
                        'input[role="combobox"]',
                        '.layui-select-title input',
                        '.select2-search__field',
                        '.el-input__inner',
                        '.ant-select-selection-search-input',
                        '.ivu-select-input',
                        'input:not([type="hidden"])'
                    ].join(','))
                )
            );
        }

        const wrapper =
            control.closest &&
            control.closest(
                '.combo,.textbox.combo,.easyui-combobox,.layui-form-select,.select2-container,.el-select,.ant-select,.ivu-select'
            );

        if (
            wrapper &&
            wrapper !== control &&
            wrapper.querySelectorAll
        ) {
            candidates.push(
                ...Array.from(
                    wrapper.querySelectorAll([
                        'input.combo-text',
                        'input.textbox-text',
                        'input[role="combobox"]',
                        '.layui-select-title input',
                        '.select2-search__field',
                        '.el-input__inner',
                        '.ant-select-selection-search-input',
                        '.ivu-select-input',
                        'input:not([type="hidden"])'
                    ].join(','))
                )
            );
        }

        const unique = [];
        const seen = new Set();

        candidates.forEach(function (input) {
            if (
                !input ||
                seen.has(input) ||
                !input.isConnected
            ) {
                return;
            }

            seen.add(input);

            const semanticText =
                normalizedUiText([
                    input.getAttribute &&
                        input.getAttribute(
                            'placeholder'
                        ),
                    input.getAttribute &&
                        input.getAttribute(
                            'aria-label'
                        ),
                    input.getAttribute &&
                        input.getAttribute(
                            'title'
                        )
                ].join(' '));

            /*
             * 再次硬性排除树状列表搜索栏。
             */
            if (
                semanticText.includes(
                    normalizedUiText(
                        '组套名称简拼'
                    )
                ) ||
                semanticText.includes(
                    normalizedUiText(
                        '简拼'
                    )
                )
            ) {
                return;
            }

            unique.push(input);
        });

        unique.sort(function (a, b) {
            const rectA =
                a.getBoundingClientRect();
            const rectB =
                b.getBoundingClientRect();
            let scoreA =
                rectA.top +
                rectA.left / 10;
            let scoreB =
                rectB.top +
                rectB.left / 10;

            if (
                /combo-text|textbox-text|combobox/i.test(
                    String(
                        a.className ||
                        ''
                    ) +
                    ' ' +
                    String(
                        a.getAttribute &&
                        a.getAttribute(
                            'role'
                        ) ||
                        ''
                    )
                )
            ) {
                scoreA -= 800;
            }

            if (
                /combo-text|textbox-text|combobox/i.test(
                    String(
                        b.className ||
                        ''
                    ) +
                    ' ' +
                    String(
                        b.getAttribute &&
                        b.getAttribute(
                            'role'
                        ) ||
                        ''
                    )
                )
            ) {
                scoreB -= 800;
            }

            return scoreA - scoreB;
        });

        return unique[0] || null;
    }

    function outpatientPathwayScrollLabDropdownOptionIntoView(
        option
    ) {
        if (!option) {
            return;
        }

        try {
            option.scrollIntoView({
                block: 'center',
                inline: 'nearest'
            });
        }
        catch (error) {
            try {
                option.scrollIntoView();
            }
            catch (ignore) {
                // 忽略。
            }
        }

        const panel =
            option.closest(
                '.combo-panel,.panel-body,[role="listbox"],.layui-form-select dl,.select2-results,.el-select-dropdown,.ant-select-dropdown,.ivu-select-dropdown'
            );

        if (panel) {
            try {
                const optionRect =
                    option.getBoundingClientRect();
                const panelRect =
                    panel.getBoundingClientRect();

                if (
                    optionRect.top <
                    panelRect.top
                ) {
                    panel.scrollTop -=
                        panelRect.top -
                        optionRect.top +
                        12;
                }
                else if (
                    optionRect.bottom >
                    panelRect.bottom
                ) {
                    panel.scrollTop +=
                        optionRect.bottom -
                        panelRect.bottom +
                        12;
                }
            }
            catch (error) {
                // 忽略。
            }
        }
    }

    async function outpatientPathwayQueryLabDropdownInternally(
        doc,
        control,
        term
    ) {
        const editor =
            outpatientPathwayLabDropdownEditor(
                control
            );

        if (!editor) {
            return [];
        }

        const hadReadonly =
            editor.hasAttribute(
                'readonly'
            );
        const readonlyValue =
            editor.getAttribute(
                'readonly'
            );

        /*
         * 部分EasyUI组合框把可视输入框标记为readonly，
         * 但内部仍监听input/keyup。临时解除只作用于当前下拉控件，
         * 不会触碰树状列表上方搜索栏。
         */
        try {
            if (hadReadonly) {
                editor.removeAttribute(
                    'readonly'
                );
            }

            try {
                editor.focus();
            }
            catch (error) {
                // 忽略。
            }

            outpatientPathwaySetInputValue(
                doc,
                editor,
                ''
            );
            await outpatientOrderWait(70);

            outpatientPathwaySetInputValue(
                doc,
                editor,
                term
            );

            [
                'input',
                'change',
                'keyup'
            ].forEach(function (eventName) {
                try {
                    if (
                        eventName === 'keyup'
                    ) {
                        editor.dispatchEvent(
                            new doc.defaultView.KeyboardEvent(
                                eventName,
                                {
                                    key:
                                        term.slice(-1) ||
                                        '',
                                    code: '',
                                    bubbles: true,
                                    cancelable: true
                                }
                            )
                        );
                    }
                    else {
                        editor.dispatchEvent(
                            new doc.defaultView.Event(
                                eventName,
                                {
                                    bubbles: true,
                                    cancelable: true
                                }
                            )
                        );
                    }
                }
                catch (error) {
                    // 忽略。
                }
            });

            await outpatientOrderWait(520);

            let options =
                outpatientPathwayLabDropdownExactOptions(
                    doc,
                    dropdownTerm
                );

            if (!options.length) {
                /*
                 * 某些组合框需按一次向下键触发筛选结果。
                 */
                outpatientPathwayPressKey(
                    editor,
                    'ArrowDown',
                    40
                );
                await outpatientOrderWait(260);

                options =
                    outpatientPathwayLabDropdownExactOptions(
                        doc,
                        dropdownTerm
                    );
            }

            return options;
        }
        finally {
            if (hadReadonly) {
                if (readonlyValue === null) {
                    editor.setAttribute(
                        'readonly',
                        ''
                    );
                }
                else {
                    editor.setAttribute(
                        'readonly',
                        readonlyValue
                    );
                }
            }
        }
    }

    async function outpatientPathwaySelectLabPresetFromDropdown(
        dropdownTerm,
        treeTerm
    ) {
        /*
         * 第一优先：真实select的完全同名option。
         * 这是下拉菜单本体，不涉及树状列表搜索栏。
         */
        const nativeCandidates =
            outpatientPathwayLabNativePresetSelectCandidates(
                dropdownTerm
            );

        for (const candidate of nativeCandidates) {
            outpatientPathwayTriggerSelect(
                candidate.doc,
                candidate.select,
                candidate.option
            );

            await outpatientOrderWait(620);

            const treeCandidate =
                await outpatientPathwayWaitCheckTreeCandidate(
                    treeTerm,
                    3400
                );

            if (treeCandidate) {
                return treeCandidate;
            }
        }

        /*
         * 第二优先：EasyUI/layui/select2等可视下拉控件。
         * 始终在该下拉控件内部完成搜索和选中。
         */
        const visualControls =
            outpatientPathwayLabVisualPresetControls();

        for (const entry of visualControls) {
            const doc =
                entry.doc;
            const control =
                entry.element;
            const editor =
                outpatientPathwayLabDropdownEditor(
                    control
                );
            const clickTarget =
                editor ||
                (
                    control.querySelector &&
                    control.querySelector([
                        '.combo-arrow',
                        '.textbox-addon',
                        '.layui-select-title',
                        '.select2-selection',
                        '.el-input',
                        '.ant-select-selector',
                        '.ivu-select-selection',
                        '[role="combobox"]'
                    ].join(','))
                ) ||
                control;

            outpatientPathwayRealClick(clickTarget);
            await outpatientOrderWait(320);

            /*
             * 先检查当前已展开下拉列表中是否存在完全同名项。
             */
            let options =
                outpatientPathwayLabDropdownExactOptions(
                    doc,
                    dropdownTerm
                );

            /*
             * 当前可见列表没有目标时，只在本下拉控件自身的编辑框
             * 中输入目标名称进行过滤，绝不调用“组套名称简拼”栏。
             */
            if (!options.length) {
                options =
                    await outpatientPathwayQueryLabDropdownInternally(
                        doc,
                        control,
                        dropdownTerm
                    );
            }

            if (!options.length) {
                outpatientPathwayPressKey(
                    clickTarget,
                    'Escape',
                    27
                );
                await outpatientOrderWait(120);
                continue;
            }

            const option =
                options[0];

            outpatientPathwayScrollLabDropdownOptionIntoView(
                option
            );
            await outpatientOrderWait(100);

            outpatientPathwayRealClick(option);
            await outpatientOrderWait(720);

            let treeCandidate =
                await outpatientPathwayWaitCheckTreeCandidate(
                    treeTerm,
                    3600
                );

            /*
             * 某些组件选项点击后还需Enter确认当前项。
             */
            if (!treeCandidate) {
                const activeEditor =
                    outpatientPathwayLabDropdownEditor(
                        control
                    );

                if (activeEditor) {
                    outpatientPathwayPressKey(
                        activeEditor,
                        'Enter',
                        13
                    );
                    await outpatientOrderWait(620);

                    treeCandidate =
                        await outpatientPathwayWaitCheckTreeCandidate(
                            treeTerm,
                            2600
                        );
                }
            }

            if (treeCandidate) {
                return treeCandidate;
            }
        }

        return null;
    }

    async function outpatientPathwayFindLabTreeCandidate(
        dropdownTerm,
        treeTerm
    ) {
        /*
         * 检验流程只允许两步：
         * 1. 在左上方下拉菜单内搜索并选择组套；
         * 2. 在下方树状列表中查找并点击具体项目。
         *
         * 明确禁止调用树状列表上方“组套名称简拼”搜索栏，
         * 避免该搜索栏与下拉菜单的当前组套状态发生冲突。
         */
        const candidate =
            await outpatientPathwaySelectLabPresetFromDropdown(
                dropdownTerm,
                treeTerm
            );

        if (candidate) {
            return candidate;
        }

        /*
         * 下拉菜单选择成功但树节点渲染稍慢时，只等待树，
         * 不再触发任何额外文本搜索。
         */
        return await outpatientPathwayWaitCheckTreeCandidate(
            treeTerm,
            3600
        );
    }

    async function fillLabApplicationItem(item, autoSave) {
        await clickOutpatientOrderTab('检验');
        await outpatientOrderWait(420);

        const dropdownTerm = String(item.searchName || item.name || '').trim();
        const treeTerm = String(item.secondaryName || dropdownTerm).trim();

        if (!dropdownTerm) {
            throw new Error('检验一级/下拉检索名称为空');
        }
        if (!treeTerm) {
            throw new Error('检验二级目录检索名称为空');
        }

        /*
         * 完全沿用临床路径脚本的检验方法：
         * 1. 扫描真实原生select（包括EasyUI隐藏select），精确选择一级组套；
         * 2. 原生select不可用时，再操作可视组合框，并只在组合框内部检索；
         * 3. 等待左侧树生成二级目录，按树节点原生坐标+jQuery事件点击；
         * 4. 确认项目真正进入右侧候选/申请区域。
         */
        let candidate = await outpatientPathwayFindLabTreeCandidate(
            dropdownTerm,
            treeTerm
        );

        if (!candidate) {
            throw new Error(
                '检验下拉菜单未找到一级组套“' + dropdownTerm +
                '”，或选中后左侧树未生成二级目录“' + treeTerm + '”'
            );
        }

        let imported = await outpatientPathwayActivateCheckTreeCandidate(
            candidate,
            treeTerm
        );

        if (!imported) {
            candidate = await outpatientPathwayWaitCheckTreeCandidate(treeTerm, 2600);
            if (candidate) {
                imported = await outpatientPathwayActivateCheckTreeCandidate(
                    candidate,
                    treeTerm
                );
            }
        }

        if (!imported) {
            throw new Error(
                '已在检验下拉菜单中选中一级组套“' + dropdownTerm +
                '”，但点击二级目录“' + treeTerm + '”后未引入右侧候选框'
            );
        }

        if (autoSave) {
            await simulateOutpatientF3Save('检验', item);
        }
        return true;
    }


    function outpatientCheckSearchInput() {
        const candidates = [];
        allDocuments().forEach(doc => {
            const view = doc.defaultView || window;
            const width = view.innerWidth || 1600;
            const height = view.innerHeight || 900;
            visibleElements(doc, 'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]').forEach(control => {
                if (isOwnAssistantUi(control)) return;
                const rect = control.getBoundingClientRect();
                if (
                    rect.left > width * 0.48 ||
                    rect.top < 230 ||
                    rect.top > Math.min(500, height * 0.62) ||
                    rect.width < 120 ||
                    rect.width > 720 ||
                    rect.height < 16 ||
                    rect.height > 85
                ) return;
                const semantic = normalizedUiText([
                    control.getAttribute && control.getAttribute('placeholder'),
                    control.getAttribute && control.getAttribute('aria-label'),
                    control.getAttribute && control.getAttribute('title'),
                    control.name,
                    control.id
                ].filter(Boolean).join(' '));
                const value = normalizedUiText(controlValue(control));
                let score = Math.abs(rect.top - 307) + Math.abs(rect.left - 250) / 4;
                if (semantic.includes(normalizedUiText('组套名称简拼'))) score -= 9000;
                else if (semantic.includes(normalizedUiText('组套名称')) && semantic.includes(normalizedUiText('简拼'))) score -= 7000;
                else if (value.includes(normalizedUiText('组套名称简拼'))) score -= 5000;
                else return;
                candidates.push({ control, score });
            });
        });
        return candidates.sort((a, b) => a.score - b.score)[0]?.control || null;
    }

    async function fillExaminationApplicationItem(item, autoSave) {
        await clickOutpatientOrderTab('检查');
        await outpatientOrderWait(420);

        const searchTerm = String(item.searchName || item.name || '').trim();
        const treeTerm = String(item.secondaryName || item.name || searchTerm).trim();

        if (!searchTerm) {
            throw new Error('检查项目检索名称为空');
        }

        let searchInput = null;
        allDocuments().some(doc => {
            searchInput = outpatientPathwayCheckSearchInput(doc);
            return Boolean(searchInput);
        });

        if (!searchInput) {
            throw new Error('检查页面未找到“组套名称简拼”检索框');
        }

        /*
         * 完全沿用临床路径脚本方法：清空旧值→写入检索名→发送完整
         * keydown/keypress/keyup及jQuery Enter→等待树DOM重建。
         * 当检索名与最终树项目名不同，输入仍使用searchTerm，树节点改按treeTerm等待。
         */
        outpatientPathwaySetInputValue(searchInput.ownerDocument, searchInput, '');
        await outpatientOrderWait(90);
        outpatientPathwaySetInputValue(searchInput.ownerDocument, searchInput, searchTerm);
        await outpatientOrderWait(120);
        outpatientPathwayDispatchCheckSearchEnter(searchInput);
        await outpatientOrderWait(650);

        let candidate = await outpatientPathwayWaitCheckTreeCandidate(treeTerm, 3600);
        if (!candidate) {
            outpatientPathwayDispatchCheckSearchEnter(searchInput);
            await outpatientOrderWait(650);
            candidate = await outpatientPathwayWaitCheckTreeCandidate(treeTerm, 3000);
        }

        /* 同名时直接调用临床路径原submit方法作一次完整兜底。 */
        if (!candidate && normalizedUiText(searchTerm) === normalizedUiText(treeTerm)) {
            candidate = await outpatientPathwaySubmitCheckSearch(searchInput, searchTerm);
        }

        if (!candidate) {
            throw new Error(
                '检索并回车后，左侧检查项目树中未找到：' + treeTerm
            );
        }

        const imported = await outpatientPathwayActivateCheckTreeCandidate(
            candidate,
            treeTerm
        );

        if (!imported) {
            throw new Error(
                '已检索到左侧检查项目“' + treeTerm +
                '”，但点击后未引入右侧候选框'
            );
        }

        if (autoSave) {
            await simulateOutpatientF3Save('检查', item);
        }
        return true;
    }


    async function clickOutpatientPrescriptionSave(moduleName) {
        await clickOutpatientOrderTab(moduleName);
        return simulateOutpatientF3Save(moduleName, { module: moduleName });
    }

    function setOutpatientOrderBusy(modal, busy) {
        state.orderBusy = Boolean(busy);
        if (!state.orderBusy) {
            state.orderPaused = false;
        }
        syncOutpatientOrderModalControls(modal);
        syncOutpatientOrderProgressControls();
    }

    function hardResetOutpatientOrderUi(preferredModal, runSerial) {
        /*
         * finally中的兜底复位。只要没有更新的任务正在执行，就直接把所有
         * 门诊助手实例的执行按钮恢复，避免错误后永久显示“正在执行……” 。
         */
        if (
            state.orderActiveSerial &&
            runSerial != null &&
            state.orderActiveSerial !== runSerial
        ) {
            return false;
        }

        clearOutpatientOrderForceStopTimer();
        state.orderBusy = false;
        state.orderPaused = false;
        state.orderStopRequested = false;
        state.orderActiveSerial = 0;

        outpatientOrderModalTargets(preferredModal).forEach(modal => {
            const execute = modal.querySelector('.outpatient-ai-order-execute');
            const pause = modal.querySelector('.outpatient-ai-order-pause');
            const stop = modal.querySelector('.outpatient-ai-order-stop');

            if (execute) {
                execute.disabled = false;
                execute.textContent = '执行已勾选';
            }
            if (pause) {
                pause.disabled = true;
                pause.textContent = '暂停';
            }
            if (stop) {
                stop.disabled = true;
                stop.textContent = '中止';
            }
        });

        syncOutpatientOrderModalControls(preferredModal);
        syncOutpatientOrderProgressControls();
        return true;
    }

    function buildOutpatientOrderFinalDetail(success, failed) {
        const lines = [
            '执行结束：成功' + success.length + '项，失败' + failed.length + '项。'
        ];
        if (failed.length) {
            lines.push('', '失败明细：');
            failed.forEach((item, index) => {
                lines.push((index + 1) + '. ' + item);
            });
        }
        return lines.join('\n');
    }

    async function executeOutpatientOrders(modal) {
        if (state.orderBusy) {
            showOutpatientOrderProgress('已有门诊医嘱任务正在执行，可先暂停或中止。', 'error');
            return;
        }

        if (state.diagnosisBusy) {
            showMessage('门诊诊断正在录入，请先完成或中止诊断任务。', 'warning');
            return;
        }

        if (outpatientOrderEditorMode(modal) === 'json' && !commitOutpatientOrderJsonEditor(modal, true)) {
            return;
        }

        const items = getOutpatientOrderRows(modal).filter(
            item => item.enabled && plain(item.name || item.searchName)
        );
        if (!items.length) {
            showMessage('没有勾选可执行的门诊医嘱。', 'warning');
            return;
        }
        if (!window.confirm('即将按顺序操作门诊医嘱页面。执行前请确认当前患者无误。\n\n是否继续？')) {
            return;
        }

        const autoSave = modal.querySelector('.outpatient-ai-order-auto-save').checked;
        const continueOnError = modal.querySelector('.outpatient-ai-order-continue-error').checked;

        /* 在用户点击“执行已勾选”的同步调用链中预开申请单标签页，避免检验/检查保存后的弹窗被浏览器拦截。 */
        prepareOutpatientApplicationPopupPool(items, autoSave);

        const restore = assistantTemporaryHide(modal);

        clearOutpatientOrderForceStopTimer();
        state.orderStopRequested = false;
        state.orderPaused = false;
        state.orderRunSerial += 1;
        const runSerial = state.orderRunSerial;
        state.orderActiveSerial = runSerial;
        state.orderRestoreUi = restore;
        setOutpatientOrderBusy(modal, true);

        const success = [];
        const failed = [];
        const moduleIndexes = {};
        let westernPrescriptionStarted = false;
        let tcmPrescriptionStarted = false;
        state.outpatientWesternDirectEditor = null;
        state.outpatientGenericPrescriptionStarted = {};
        state.outpatientGenericDirectEditors = {};
        state.outpatientTcmDirectEditor = null;
        state.outpatientTcmDirectEditorTop = null;

        try {
            for (let index = 0; index < items.length; index += 1) {
                await outpatientOrderCheckpoint(runSerial);
                const item = items[index];
                showOutpatientOrderProgress(
                    '第' + (index + 1) + '/' + items.length + '项：' + item.module + '－' + (item.name || item.searchName),
                    'normal'
                );

                try {
                    const currentIndex = moduleIndexes[item.module] || 0;
                    if (item.module === '西药处方') {
                        if (!westernPrescriptionStarted) {
                            showOutpatientOrderProgress('正在单次点击西药“新处方”；随后录入第1种药品……', 'normal');
                            await startNewWesternMedicinePrescription();
                            westernPrescriptionStarted = true;
                        }
                        await fillWestMedicineItem(item, currentIndex);
                    }
                    else if (item.module === '中药(新)') {
                        if (!tcmPrescriptionStarted) {
                            showOutpatientOrderProgress('正在单次点击“新处方”；点击后将直接录入第1味中药……', 'normal');
                            await startNewTraditionalMedicinePrescription();
                            tcmPrescriptionStarted = true;
                        }
                        await fillTraditionalMedicineItem(item, currentIndex);
                    }
                    else if (item.module === '检验') {
                        await fillLabApplicationItem(item, autoSave);
                    }
                    else if (item.module === '检查') {
                        await fillExaminationApplicationItem(item, autoSave);
                    }
                    else {
                        await fillGenericOutpatientItem(item, currentIndex);
                    }

                    moduleIndexes[item.module] = currentIndex + 1;
                    success.push(item.module + '：' + (item.name || item.searchName));
                }
                catch (error) {
                    if (/用户已中止门诊医嘱执行/.test(error.message || '')) {
                        throw error;
                    }
                    failed.push(
                        '第' + (index + 1) + '项 ' + item.module + '－' +
                        (item.name || item.searchName) + '：' + error.message
                    );
                    showOutpatientOrderProgress(failed[failed.length - 1], 'error');
                    if (!continueOnError) {
                        throw error;
                    }
                    await outpatientOrderWait(350, runSerial);
                }
            }

            const tcmItems = items.filter(item => item.module === '中药(新)');
            if (tcmItems.length && tcmPrescriptionStarted) {
                showOutpatientOrderProgress(
                    '中药名称、剂量及数量已处理；付数和用法请在医院页面人工填写。',
                    'normal'
                );
            }

            if (autoSave) {
                for (const moduleName of ['西药处方', '中药(新)', '康复处方', '常规项目', '耗材']) {
                    await outpatientOrderCheckpoint(runSerial);
                    if (!items.some(item => item.module === moduleName)) {
                        continue;
                    }
                    if (moduleName === '中药(新)') {
                        /* 付数、用法改为人工填写，避免在未核对底部信息时自动保存中药处方。 */
                        showOutpatientOrderProgress(
                            '中药处方未自动保存：请人工填写付数和用法后点击保存处方。',
                            'normal'
                        );
                        continue;
                    }
                    await clickOutpatientOrderTab(moduleName);
                    const saved = await clickOutpatientPrescriptionSave(moduleName);
                    if (!saved) {
                        failed.push(moduleName + '：模拟F3保存未成功，请人工核对并保存。');
                    }
                }
            }

            showOutpatientOrderProgress(
                '执行结束：成功' + success.length + '项，失败' + failed.length + '项。',
                failed.length ? 'error' : 'success'
            );
        }
        catch (error) {
            const message = plain(error && error.message) || '未知错误';
            if (!failed.some(text => text.includes(message))) {
                failed.push(message);
            }
            showOutpatientOrderProgress(
                /用户已中止/.test(message) ? '执行已由用户中止。' : '执行已停止：' + message,
                'error'
            );
        }
        finally {
            /*
             * 无论异常发生在检索、候选点击还是页面重绘等待阶段，都必须释放busy。
             * 旧任务若已被强制中止，则release会自动忽略对新任务的干扰。
             */
            const released = releaseOutpatientOrderUi(modal, runSerial);
            if (!released) {
                try {
                    restore();
                }
                catch (error) {
                    // 忽略。
                }
            }

            /* 双重兜底：立即复位，并在医院页面重绘后的两个时点再次复位。 */
            hardResetOutpatientOrderUi(modal, runSerial);
            window.setTimeout(() => hardResetOutpatientOrderUi(modalElement(), runSerial), 120);
            window.setTimeout(() => hardResetOutpatientOrderUi(modalElement(), runSerial), 650);

            closeUnusedOutpatientApplicationPopups();

            const finalDetail = buildOutpatientOrderFinalDetail(success, failed);
            showOutpatientOrderProgress(
                finalDetail,
                failed.length ? 'error' : 'success'
            );
            showMessage(
                finalDetail +
                (autoSave ? '' : '\n当前未启用自动保存，请逐标签页核对后人工保存。'),
                failed.length ? 'warning' : 'success'
            );

            if (failed.length) {
                /* 失败时保留右下角窗口，滚动即可查看每个失败条目和原因。 */
                syncOutpatientOrderProgressControls();
            }
            else {
                hideOutpatientOrderProgress(3600);
            }
        }
    }

    function initializeOutpatientOrderAndTemplates(modal) {
        const savedDraft = GM_getValue(KEYS.outpatientOrderDraft, []);
        const draft = Array.isArray(savedDraft) ? savedDraft : safeJsonParse(savedDraft, []);
        renderOutpatientOrderRows(modal, Array.isArray(draft) ? draft : []);

        modal.querySelector('.outpatient-ai-record-template-manage').addEventListener('click', () => openRecordTemplateManager(modal));
        modal.querySelector('.outpatient-ai-record-template-save').addEventListener('click', () => saveCurrentRecordAsTemplate(modal));
        modal.querySelectorAll('.outpatient-ai-template-manager-close').forEach(button => {
            button.addEventListener('click', () => closeRecordTemplateManager(modal));
        });
        modal.querySelector('.outpatient-ai-template-list').addEventListener('click', event => handleRecordTemplateAction(modal, event));
        modal.querySelector('.outpatient-ai-template-export').addEventListener('click', exportRecordTemplates);
        modal.querySelector('.outpatient-ai-template-import').addEventListener('click', () => {
            modal.querySelector('.outpatient-ai-template-import-file').click();
        });
        modal.querySelector('.outpatient-ai-template-import-file').addEventListener('change', event => {
            importRecordTemplates(modal, event.target.files && event.target.files[0]);
            event.target.value = '';
        });

        modal.querySelector('.outpatient-ai-order-template-manage').addEventListener('click', () => {
            openOutpatientOrderTemplateManager(modal);
        });
        modal.querySelector('.outpatient-ai-order-template-save').addEventListener('click', () => {
            saveCurrentOutpatientOrdersAsTemplate(modal);
        });
        modal.querySelectorAll('.outpatient-ai-order-template-manager-close').forEach(button => {
            button.addEventListener('click', () => closeOutpatientOrderTemplateManager(modal));
        });
        modal.querySelector('.outpatient-ai-order-template-list').addEventListener('click', event => {
            handleOutpatientOrderTemplateAction(modal, event);
        });
        modal.querySelector('.outpatient-ai-order-template-export').addEventListener('click', exportOutpatientOrderTemplates);
        modal.querySelector('.outpatient-ai-order-template-import').addEventListener('click', () => {
            modal.querySelector('.outpatient-ai-order-template-import-file').click();
        });
        modal.querySelector('.outpatient-ai-order-template-import-file').addEventListener('change', event => {
            importOutpatientOrderTemplates(modal, event.target.files && event.target.files[0]);
            event.target.value = '';
        });

        modal.querySelector('.outpatient-ai-order-ai-parse').addEventListener('click', () => generateOutpatientOrdersByAi(modal));
        modal.querySelector('.outpatient-ai-order-local-parse').addEventListener('click', () => {
            const items = parseOutpatientOrderText(modal.querySelector('.outpatient-ai-order-source').value);
            renderOutpatientOrderRows(modal, items);
            showMessage('已本地解析' + items.length + '条医嘱，请人工核对。', items.length ? 'success' : 'warning');
        });
        modal.querySelector('.outpatient-ai-order-add').addEventListener('click', () => {
            if (!ensureOutpatientOrderJsonCommittedForTool(modal)) return;
            const rows = getOutpatientOrderRows(modal);
            rows.push(defaultOutpatientOrderItem('西药处方'));
            modal.dataset.outpatientOrderSelectedIndex = String(rows.length - 1);
            renderOutpatientOrderRows(modal, rows);
            if (outpatientOrderEditorMode(modal) === 'json') syncOutpatientOrderJsonFromRows(modal);
        });
        modal.querySelector('.outpatient-ai-order-clear').addEventListener('click', () => {
            if (window.confirm('确定清空当前门诊医嘱草稿？')) {
                renderOutpatientOrderRows(modal, []);
            }
        });
        modal.querySelector('.outpatient-ai-order-execute').addEventListener('click', event => {
            event.preventDefault();
            executeOutpatientOrders(modal);
        });
        modal.querySelector('.outpatient-ai-order-pause').addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            toggleOutpatientOrderPause();
        });
        modal.querySelector('.outpatient-ai-order-stop').addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            requestOutpatientOrderStop(false);
        });
        const orderTableBody = modal.querySelector('.outpatient-ai-order-table-body');
        const syncTcmRowFields = event => {
            const row =
                event.target.closest(
                    '.outpatient-ai-order-row'
                );

            if (!row) {
                saveOutpatientOrderDraft(modal);
                return;
            }

            /*
             * 原生datalist在“未选候选、直接失焦”时也可能触发change。
             * 因此不能把change本身当成“用户选中了联想项”。
             * 先在真实input事件阶段记录明确的候选选择动作。
             */
            if (
                event.type === 'input' &&
                outpatientOrderSuggestionDatalistId(
                    event.target
                )
            ) {
                markOutpatientOrderSuggestionInputEvent(
                    event.target,
                    event
                );
            }

            const moduleControl =
                row.querySelector(
                    '[data-order-field="module"]'
                );

            const moduleName =
                moduleControl
                    ? moduleControl.value
                    : '';

            if (moduleName === '中药(新)') {
                const nameControl =
                    row.querySelector(
                        '[data-order-field="name"]'
                    );

                const searchControl =
                    row.querySelector(
                        '[data-order-field="searchName"]'
                    );

                const doseControl =
                    row.querySelector(
                        '[data-order-field="dose"]'
                    );

                const quantityControl =
                    row.querySelector(
                        '[data-order-field="quantity"]'
                    );

                if (
                    event.target === moduleControl ||
                    event.target === nameControl ||
                    event.target === searchControl
                ) {
                    const source =
                        plain(
                            nameControl &&
                            nameControl.value
                        ) ||
                        plain(
                            searchControl &&
                            searchControl.value
                        );

                    if (searchControl) {
                        searchControl.value =
                            formatTcmSearchName(
                                source,
                                tcmStarPrefixEnabled()
                            );
                    }
                }

                if (
                    doseControl &&
                    quantityControl
                ) {
                    quantityControl.value =
                        plain(
                            doseControl.value
                        );
                }
            }
            else if (moduleName === '西药处方') {
                const nameControl =
                    row.querySelector(
                        '[data-order-field="name"]'
                    );

                const searchControl =
                    row.querySelector(
                        '[data-order-field="searchName"]'
                    );

                if (
                    event.type === 'change' &&
                    (
                        event.target === nameControl ||
                        event.target === searchControl
                    ) &&
                    consumeOutpatientOrderSuggestionCommit(
                        event.target
                    )
                ) {
                    applyWesternDrugSuggestionToRow(
                        row,
                        event.target
                    );
                }
            }
            else if (
                CHARGE_ITEM_SUGGESTION_MODULES
                    .includes(
                        moduleName
                    )
            ) {
                const nameControl =
                    row.querySelector(
                        '[data-order-field="name"]'
                    );

                const searchControl =
                    row.querySelector(
                        '[data-order-field="searchName"]'
                    );

                const secondaryControl =
                    row.querySelector(
                        '[data-order-field="secondaryName"]'
                    );

                if (
                    event.type === 'change' &&
                    (
                        event.target === nameControl ||
                        (
                            moduleName !== '检验' &&
                            event.target === searchControl
                        ) ||
                        event.target === secondaryControl
                    ) &&
                    consumeOutpatientOrderSuggestionCommit(
                        event.target
                    )
                ) {
                    applyChargeItemSuggestionToRow(
                        row,
                        event.target
                    );
                }
            }

            if (event.target === moduleControl) {
                configureWesternDrugRowSuggestion(
                    row
                );

                configureChargeItemRowSuggestion(
                    row
                );
            }

            saveOutpatientOrderDraft(
                modal
            );
            if (outpatientOrderEditorMode(modal) === 'gui') {
                syncOutpatientOrderJsonFromRows(modal);
            }
        };

        orderTableBody.addEventListener(
            'focusin',
            event => {
                if (
                    outpatientOrderSuggestionDatalistId(
                        event.target
                    )
                ) {
                    resetOutpatientOrderSuggestionSelectionState(
                        event.target
                    );
                }
            }
        );

        orderTableBody.addEventListener(
            'keydown',
            event => {
                const control =
                    event.target;

                if (
                    !outpatientOrderSuggestionDatalistId(
                        control
                    )
                ) {
                    return;
                }

                if (
                    event.key === 'ArrowDown' ||
                    event.key === 'ArrowUp'
                ) {
                    control.dataset
                        .outpatientSuggestionKeyboardNav =
                        '1';
                }
                else if (
                    event.key === 'Escape'
                ) {
                    delete control.dataset
                        .outpatientSuggestionChosen;

                    delete control.dataset
                        .outpatientSuggestionChosenValue;

                    delete control.dataset
                        .outpatientSuggestionKeyboardNav;
                }
            }
        );

        orderTableBody.addEventListener('input', syncTcmRowFields);
        orderTableBody.addEventListener('change', syncTcmRowFields);
        orderTableBody.addEventListener('click', event => {
            const row = event.target.closest('.outpatient-ai-order-row');
            if (!row) {
                return;
            }
            selectOutpatientOrderRow(modal, row);
            if (event.target.closest('.outpatient-ai-order-row-delete')) {
                row.remove();
                delete modal.dataset.outpatientOrderSelectedIndex;
                afterOutpatientOrderDraftTool(modal);
                return;
            }
            if (event.target.closest('.outpatient-ai-order-row-up')) {
                const previous = row.previousElementSibling;
                if (previous) {
                    row.parentNode.insertBefore(row, previous);
                    afterOutpatientOrderDraftTool(modal);
                }
                return;
            }
            if (event.target.closest('.outpatient-ai-order-row-down')) {
                const next = row.nextElementSibling;
                if (next) {
                    row.parentNode.insertBefore(next, row);
                    afterOutpatientOrderDraftTool(modal);
                }
            }
        });

        modal.querySelector('.outpatient-ai-order-insert-after').addEventListener('click', () => {
            if (state.orderBusy || !ensureOutpatientOrderJsonCommittedForTool(modal)) return;
            const selected = selectedOutpatientOrderRow(modal);
            if (!selected) {
                showMessage('请先单击需要插入位置的医嘱行。', 'warning');
                return;
            }
            const rows = getOutpatientOrderRows(modal);
            const domRows = Array.from(modal.querySelectorAll('.outpatient-ai-order-row'));
            const index = domRows.indexOf(selected);
            if (index < 0) {
                showMessage('未能确定当前选中行的位置。', 'error');
                return;
            }
            rows.splice(index + 1, 0, defaultOutpatientOrderItem(rows[index]?.module || '西药处方'));
            modal.dataset.outpatientOrderSelectedIndex = String(index + 1);
            renderOutpatientOrderRows(modal, rows);
            if (outpatientOrderEditorMode(modal) === 'json') syncOutpatientOrderJsonFromRows(modal);
        });

        modal.querySelector('.outpatient-ai-order-mode-gui-button').addEventListener('click', () => {
            if (state.orderBusy) return;
            setOutpatientOrderEditorMode(modal, 'gui', true);
        });
        modal.querySelector('.outpatient-ai-order-mode-json-button').addEventListener('click', () => {
            if (state.orderBusy) return;
            setOutpatientOrderEditorMode(modal, 'json', false);
        });

        modal.querySelector('.outpatient-ai-order-enable-all').addEventListener('click', () => {
            if (state.orderBusy || !ensureOutpatientOrderJsonCommittedForTool(modal)) return;
            modal.querySelectorAll('[data-order-field="enabled"]').forEach(control => { control.checked = true; });
            saveOutpatientOrderDraft(modal);
            if (outpatientOrderEditorMode(modal) === 'json') syncOutpatientOrderJsonFromRows(modal);
            showMessage('当前门诊医嘱草稿已全选。', 'success');
        });
        modal.querySelector('.outpatient-ai-order-enable-none').addEventListener('click', () => {
            if (state.orderBusy || !ensureOutpatientOrderJsonCommittedForTool(modal)) return;
            modal.querySelectorAll('[data-order-field="enabled"]').forEach(control => { control.checked = false; });
            saveOutpatientOrderDraft(modal);
            if (outpatientOrderEditorMode(modal) === 'json') syncOutpatientOrderJsonFromRows(modal);
            showMessage('当前门诊医嘱草稿已全不选。', 'success');
        });
        modal.querySelector('.outpatient-ai-order-delete-enabled').addEventListener('click', () => {
            if (state.orderBusy || !ensureOutpatientOrderJsonCommittedForTool(modal)) return;
            const rows = getOutpatientOrderRows(modal);
            const count = rows.filter(item => item.enabled).length;
            if (!count) {
                showMessage('当前没有勾选需要删除的医嘱。', 'warning');
                return;
            }
            if (!window.confirm('确认从门诊医嘱草稿中删除已勾选的' + count + '条医嘱？')) return;
            delete modal.dataset.outpatientOrderSelectedIndex;
            renderOutpatientOrderRows(modal, rows.filter(item => !item.enabled));
            if (outpatientOrderEditorMode(modal) === 'json') syncOutpatientOrderJsonFromRows(modal);
            showMessage('已从草稿删除' + count + '条勾选医嘱。', 'success');
        });

        const orderJsonEditor = modal.querySelector('.outpatient-ai-order-json-editor');
        let orderJsonTimer = 0;
        orderJsonEditor.addEventListener('input', () => {
            window.clearTimeout(orderJsonTimer);
            setOutpatientOrderJsonStatus(modal, '正在检查JSON……', '');
            orderJsonTimer = window.setTimeout(() => {
                commitOutpatientOrderJsonEditor(modal, false);
            }, 420);
        });

        const autoSave = modal.querySelector('.outpatient-ai-order-auto-save');
        const continueError = modal.querySelector('.outpatient-ai-order-continue-error');
        const tcmStarPrefix = modal.querySelector('.outpatient-ai-order-tcm-star-prefix');
        const secondaryDirectoryToggle = modal.querySelector('.outpatient-ai-order-toggle-secondary-directory');
        autoSave.checked = Boolean(GM_getValue(KEYS.outpatientOrderAutoSave, false));
        continueError.checked = Boolean(GM_getValue(KEYS.outpatientOrderContinueError, true));
        tcmStarPrefix.checked = tcmStarPrefixEnabled();
        setOutpatientOrderSecondaryDirectoryVisible(
            modal,
            Boolean(GM_getValue(KEYS.outpatientOrderSecondaryDirectoryVisible, true)),
            false
        );
        setOutpatientOrderEditorMode(modal, 'gui', false);
        syncOutpatientOrderJsonFromRows(modal);
        autoSave.addEventListener('change', () => GM_setValue(KEYS.outpatientOrderAutoSave, autoSave.checked));
        continueError.addEventListener('change', () => GM_setValue(KEYS.outpatientOrderContinueError, continueError.checked));
        tcmStarPrefix.addEventListener('change', () => {
            GM_setValue(KEYS.outpatientOrderTcmStarPrefix, tcmStarPrefix.checked);
            applyTcmStarPrefixToOrderRows(modal, tcmStarPrefix.checked);
        });
        if (secondaryDirectoryToggle) {
            secondaryDirectoryToggle.addEventListener('click', () => {
                if (state.orderBusy) {
                    showOutpatientOrderProgress('任务执行期间不能切换二级目录显示状态。', 'error');
                    return;
                }
                setOutpatientOrderSecondaryDirectoryVisible(
                    modal,
                    !outpatientOrderSecondaryDirectoryVisible(modal),
                    true
                );
            });
        }
        modal.querySelector('.outpatient-ai-order-open-shared-library').addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent(SHARED_LIBRARY_OPEN_EVENT_NAME));
        });
        document.addEventListener(SHARED_LIBRARY_EVENT_NAME, () => {
            refreshOutpatientSharedKnowledge(modal, true);
        });
        window.addEventListener('storage', event => {
            if (event.key === SHARED_LIBRARY_STORAGE_KEY) {
                refreshOutpatientSharedKnowledge(modal, true);
            }
        });
        applyTcmStarPrefixToOrderRows(modal, tcmStarPrefix.checked);
        refreshOutpatientSharedKnowledge(modal, true);
        setOutpatientOrderBusy(modal, false);
        syncOutpatientOrderModalControls(modal);
    }


    function initializeSections(modal) {
        const states =
            sectionState();

        modal.querySelectorAll(
            '.outpatient-ai-section'
        ).forEach(section => {
            const key =
                section.dataset.sectionKey;

            const collapsed =
                Object.prototype
                    .hasOwnProperty
                    .call(states, key)
                    ? Boolean(
                        states[key]
                    )
                    : section.dataset
                        .defaultCollapsed ===
                        'true';

            setSectionCollapsed(
                section,
                collapsed
            );

            section.querySelector(
                '.outpatient-ai-toggle-section'
            ).addEventListener(
                'click',
                () => {
                    setSectionCollapsed(
                        section,
                        !section.classList
                            .contains(
                                'collapsed'
                            )
                    );
                }
            );
        });
    }

    function createModal() {
        let modal =
            modalElement();

        if (modal) {
            return modal;
        }

        modal =
            document.createElement(
                'div'
            );

        modal.id =
            IDS.modal;

        modal.innerHTML = `
<div class="outpatient-ai-mask"></div>
<div class="outpatient-ai-dialog">
  <div class="outpatient-ai-header">
    <span>门诊助手</span>
    <button type="button" class="outpatient-ai-close" title="关闭">×</button>
  </div>
  <div class="outpatient-ai-body">
    <div class="outpatient-ai-section" data-section-key="settings" data-default-collapsed="false">
      <div class="outpatient-ai-section-title">
        <span>DeepSeek设置与任务类型</span>
        <button type="button" class="outpatient-ai-toggle-section">折叠</button>
      </div>
      <div class="outpatient-ai-section-content">
        <div class="outpatient-ai-settings-grid">
          <label>DeepSeek API Key
            <input type="password" class="outpatient-ai-key" placeholder="sk-...；仅保存在本油猴脚本存储中">
          </label>
          <label>模型
            <input type="text" class="outpatient-ai-model" placeholder="deepseek-chat">
          </label>
          <label>病历类型
            <select class="outpatient-ai-template">
              <option value="initial">门诊初诊病历</option>
              <option value="followup">门诊复诊病历</option>
              <option value="integrated">中西医结合门诊病历</option>
              <option value="polish">仅润色当前病历</option>
            </select>
          </label>
          <label class="outpatient-ai-check-label">
            <input type="checkbox" class="outpatient-ai-auto-diagnosis">
            引用病历时把首个诊断发送到诊断检索框（不自动选择）
          </label>
        </div>
      </div>
    </div>

    <div class="outpatient-ai-section" data-section-key="source" data-default-collapsed="false">
      <div class="outpatient-ai-section-title">
        <span>患者病情资料与AI提示词</span>
        <button type="button" class="outpatient-ai-toggle-section">折叠</button>
      </div>
      <div class="outpatient-ai-section-content">
        <label class="outpatient-ai-label">患者病情资料
          <textarea class="outpatient-ai-source" placeholder="可以点击“读取当前页面”，也可以直接粘贴患者主诉、现病史、既往史、检查化验、中医四诊、诊断和既往治疗等信息。"></textarea>
        </label>
        <label class="outpatient-ai-label">医师自定义提示词
          <textarea class="outpatient-ai-prompt" placeholder="示例：按照规范门诊初诊病历书写，现病史按时间顺序扩写，但不得新增未提供的医学事实；同时给出西医诊断建议及中医辨证需要补充的信息。"></textarea>
        </label>
        <div class="outpatient-ai-toolbar">
          <button type="button" class="outpatient-ai-read-page secondary">读取当前页面</button>
          <button type="button" class="outpatient-ai-generate">生成门诊病历</button>
          <button type="button" class="outpatient-ai-audit">审核当前病历</button>
          <button type="button" class="outpatient-ai-stop danger" disabled>停止</button>
          <button type="button" class="outpatient-ai-clear secondary">清空结果</button>
          <button type="button" class="outpatient-ai-reset-info secondary">重置信息</button>
          <button type="button" class="outpatient-ai-record-template-manage secondary">模板管理</button>
        </div>
      </div>
    </div>

    <div class="outpatient-ai-section" data-section-key="record-preview" data-default-collapsed="false">
      <div class="outpatient-ai-section-title">
        <span>病历生成结果（可编辑）</span>
        <div class="outpatient-ai-section-actions">
          <button type="button" class="outpatient-ai-polish secondary">AI润色</button>
          <button type="button" class="outpatient-ai-record-template-save secondary">存为模板</button>
          <button type="button" class="outpatient-ai-preview-audit secondary">预审核</button>
          <button type="button" class="outpatient-ai-chat-open secondary">AI助手</button>
          <button type="button" class="outpatient-ai-complete-empty secondary">AI预测补全空项</button>
          <button type="button" class="outpatient-ai-toggle-section">折叠</button>
        </div>
      </div>
      <div class="outpatient-ai-section-content">
        <div class="outpatient-ai-record-grid">
          <label>主诉<textarea data-result-field="chiefComplaint"></textarea></label>
          <label>现病史<textarea data-result-field="presentIllness"></textarea></label>
          <label>既往史<textarea data-result-field="pastHistory"></textarea></label>
          <label>过敏史<textarea data-result-field="allergyHistory"></textarea></label>
          <label>月经史<textarea data-result-field="menstrualHistory"></textarea></label>
          <label>查体<textarea data-result-field="physicalExam"></textarea></label>
          <label>辅助检查<textarea data-result-field="auxiliaryExam"></textarea></label>
          <label>处理<textarea data-result-field="treatment"></textarea></label>
        </div>
        <div class="outpatient-ai-diagnosis-grid">
          <label>西医诊断建议（每行一条）
            <textarea class="outpatient-ai-western-diagnoses"></textarea>
          </label>
          <label>中医病名
            <input type="text" class="outpatient-ai-tcm-disease">
          </label>
          <label>中医证候
            <input type="text" class="outpatient-ai-tcm-syndrome">
          </label>
          <label class="wide">辨证依据
            <textarea class="outpatient-ai-tcm-basis"></textarea>
          </label>
        </div>
        <div class="outpatient-ai-toolbar">
          <button type="button" class="outpatient-ai-fill">引用到当前页面</button>
          <button type="button" class="outpatient-ai-copy secondary">复制病历全文</button>
          <button type="button" class="outpatient-ai-diagnosis-insert">录入诊断</button>
          <button type="button" class="outpatient-ai-diagnosis-pause secondary" disabled>暂停录入</button>
          <button type="button" class="outpatient-ai-diagnosis-stop danger" disabled>中止录入</button>
        </div>
        <div class="outpatient-ai-diagnosis-status" aria-live="polite"></div>
        <div class="outpatient-ai-safe-note">“引用到当前页面”只写入能够识别的病历字段；勾选自动诊断时仍只发送检索词。“录入诊断”仅按顺序自动检索并选择西医主诊断和副诊断，不再录入中医病名或中医证候；脚本不会点击“就诊保存”“结束就诊”“保存处方”等按钮，完成后必须由医师逐项核对并手动保存。</div>
      </div>
    </div>


    <div class="outpatient-ai-section" data-section-key="outpatient-orders" data-default-collapsed="true">
      <div class="outpatient-ai-section-title">
        <span>门诊医嘱开立</span>
        <button type="button" class="outpatient-ai-toggle-section">展开</button>
      </div>
      <div class="outpatient-ai-section-content">
        <label class="outpatient-ai-label">医嘱资料或AI整理要求
          <textarea class="outpatient-ai-order-source" placeholder="可粘贴西药、中药、康复、常规项目、耗材、检验和检查医嘱；支持JSON，也可点击AI解析。"></textarea>
        </label>
        <div class="outpatient-ai-toolbar">
          <button type="button" class="outpatient-ai-order-ai-parse">AI解析医嘱</button>
          <button type="button" class="outpatient-ai-order-local-parse secondary">解析粘贴文本</button>
          <button type="button" class="outpatient-ai-order-add secondary">新增空白行</button>
          <button type="button" class="outpatient-ai-order-execute">执行已勾选</button>
          <button type="button" class="outpatient-ai-order-pause secondary" disabled>暂停</button>
          <button type="button" class="outpatient-ai-order-stop danger" disabled>中止</button>
          <button type="button" class="outpatient-ai-order-clear secondary">清空草稿</button>
          <button type="button" class="outpatient-ai-order-template-manage secondary">模板管理</button>
        </div>
        <div class="outpatient-ai-order-options">
          <label><input type="checkbox" class="outpatient-ai-order-auto-save">执行后自动按F3保存处方／申请单</label>
          <label><input type="checkbox" class="outpatient-ai-order-continue-error">单项失败后继续执行</label>
          <label><input type="checkbox" class="outpatient-ai-order-tcm-star-prefix">中药检索名称加★前缀</label>
          <button type="button" class="outpatient-ai-order-open-shared-library secondary">映射／联想库</button>
          <button type="button" class="outpatient-ai-order-template-save secondary">存为模板</button>
          <div class="outpatient-ai-order-edit-tools">
            <button type="button" class="outpatient-ai-order-insert-after secondary outpatient-ai-order-editor-tool">在选中行后插入空白</button>
            <span class="outpatient-ai-order-editor-switch">
              <button type="button" class="outpatient-ai-order-mode-gui-button secondary active outpatient-ai-order-editor-tool" aria-pressed="true">GUI图形化编辑</button>
              <button type="button" class="outpatient-ai-order-mode-json-button secondary outpatient-ai-order-editor-tool" aria-pressed="false">JSON代码编辑</button>
            </span>
            <button type="button" class="outpatient-ai-order-enable-all secondary outpatient-ai-order-editor-tool">全选</button>
            <button type="button" class="outpatient-ai-order-enable-none secondary outpatient-ai-order-editor-tool">全不选</button>
            <button type="button" class="outpatient-ai-order-delete-enabled danger outpatient-ai-order-editor-tool">删除已勾选</button>
            <button type="button" class="outpatient-ai-order-toggle-secondary-directory secondary outpatient-ai-order-editor-tool" aria-pressed="true">隐藏二级目录</button>
          </div>
          <span class="outpatient-ai-order-shared-status"></span>
          <span>中药(新)自动录入名称、剂量、数量并选择最低自付比例；西药po自动转换为口服并选择最低自付比例；检验先从“组套名称简拼”框正上方锁定“全部”一级下拉框（兼容内嵌框架与独立箭头），再选择二级树；检查直接使用“组套名称简拼”检索框；除中药外自动保存使用F3。</span>
        </div>
        <div class="outpatient-ai-order-json-panel">
          <textarea class="outpatient-ai-order-json-editor" spellcheck="false" placeholder='可编辑 {"items":[...]} 或直接填写数组格式的门诊医嘱JSON。'></textarea>
          <div class="outpatient-ai-order-json-status">JSON与图形化草稿同步。</div>
        </div>
        <div class="outpatient-ai-order-table-wrap">
          <table class="outpatient-ai-order-table">
            <thead>
              <tr>
                <th>启用</th><th>序</th><th>模块</th><th>名称</th><th class="outpatient-ai-order-search-header">一级／下拉检索名</th><th class="outpatient-ai-order-secondary-column">二级目录</th>
                <th>剂量／次数</th><th>单位</th><th>用法</th><th>频次</th><th>天数／付数</th><th>数量</th>
                <th>执行科室</th><th>备注／部位</th><th>操作</th>
              </tr>
            </thead>
            <tbody class="outpatient-ai-order-table-body"></tbody>
          </table>
        </div>
        <div class="outpatient-ai-safe-note">脚本仅模拟当前页面上的点击和输入。西药po会转换为口服，自付比例选择最小值；康复处方、常规项目和耗材先单次点击新处方再录入。中药(新)付数、用法和保存仍由人工完成；检验从左侧简拼框正上方锁定“全部”一级下拉并选择二级树，检查直接在“组套名称简拼”框检索后选择左侧项目。勾选自动保存后，除中药外均模拟F3；申请单弹出页会尽量预开并保留。所有医嘱必须由医师人工审核。</div>
      </div>
    </div>

    <div class="outpatient-ai-section" data-section-key="advice" data-default-collapsed="true">
      <div class="outpatient-ai-section-title">
        <span>诊疗建议与缺失资料</span>
        <button type="button" class="outpatient-ai-toggle-section">展开</button>
      </div>
      <div class="outpatient-ai-section-content">
        <div class="outpatient-ai-result outpatient-ai-advice-result">
          <div class="outpatient-ai-empty">尚未生成诊疗建议。</div>
        </div>
      </div>
    </div>

    <div class="outpatient-ai-section" data-section-key="audit" data-default-collapsed="true">
      <div class="outpatient-ai-section-title">
        <span>病历AI审核结果</span>
        <button type="button" class="outpatient-ai-toggle-section">展开</button>
      </div>
      <div class="outpatient-ai-section-content">
        <div class="outpatient-ai-result outpatient-ai-audit-result">
          <div class="outpatient-ai-empty">尚未执行当前页面审核或生成结果预审核。</div>
        </div>
        <div class="outpatient-ai-toolbar">
          <button type="button" class="outpatient-ai-use-revised secondary" disabled>采用审核修订稿</button>
        </div>
      </div>
    </div>

    <div class="outpatient-ai-message normal">请先填写API Key，再读取页面或粘贴患者资料。AI结果必须由医师人工核对。</div>
  </div>
  <div class="outpatient-ai-footer">
    <button type="button" class="outpatient-ai-close secondary">关闭</button>
  </div>
</div>

<div class="outpatient-ai-chat-window" aria-hidden="true">
  <div class="outpatient-ai-chat-header">
    <span>AI助手对话</span>
    <button type="button" class="outpatient-ai-chat-close" title="关闭">×</button>
  </div>
  <div class="outpatient-ai-chat-body">
    <div class="outpatient-ai-chat-options">
      <label class="outpatient-ai-chat-context-option">
        <input type="checkbox" class="outpatient-ai-chat-include-page">
        基于当前网页页面内容
      </label>
      <label class="outpatient-ai-chat-context-option">
        <input type="checkbox" class="outpatient-ai-chat-markdown">
        Markdown显示
      </label>
      <label class="outpatient-ai-chat-context-option">
        <input type="checkbox" class="outpatient-ai-chat-bubble-copy">
        气泡复制
      </label>
      <label class="outpatient-ai-chat-context-option">
        <input type="checkbox" class="outpatient-ai-chat-enter-send">
        回车直接发送
      </label>
    </div>
    <div class="outpatient-ai-chat-context-note">网页内容勾选时，每次发送都会读取当前门诊页面中脚本可识别的患者信息、生命体征、病历字段及诊断检索词；回答生成过程中会以普通文本实时显示，完整回答结束后按Markdown设置统一显示。“气泡复制”控制每条消息右上角的“复制全部”按钮；开启“回车直接发送”后Enter发送、Shift+Enter换行，关闭时Ctrl+Enter发送、Enter换行。</div>
    <div class="outpatient-ai-chat-messages"></div>
    <textarea class="outpatient-ai-chat-input" placeholder="输入问题或指令。Ctrl+Enter发送，Enter换行。"></textarea>
    <div class="outpatient-ai-chat-toolbar">
      <button type="button" class="outpatient-ai-chat-send">发送</button>
      <button type="button" class="outpatient-ai-chat-stop danger" disabled>停止</button>
      <button type="button" class="outpatient-ai-chat-clear secondary">清空对话</button>
      <button type="button" class="outpatient-ai-chat-close secondary">关闭</button>
    </div>
    <div class="outpatient-ai-chat-status normal">聊天内容仅保留在当前页面内存中；AI回答必须由医师人工核对。</div>
  </div>
</div>

<div class="outpatient-ai-template-manager" aria-hidden="true">
  <div class="outpatient-ai-template-manager-dialog">
    <div class="outpatient-ai-template-manager-header">
      <span>门诊病历模板管理</span>
      <button type="button" class="outpatient-ai-template-manager-close" title="关闭">×</button>
    </div>
    <div class="outpatient-ai-template-manager-toolbar">
      <div class="outpatient-ai-template-manager-toolbar-buttons">
        <button type="button" class="outpatient-ai-template-import secondary">导入模板</button>
        <button type="button" class="outpatient-ai-template-export secondary">导出全部</button>
      </div>
      <input type="file" class="outpatient-ai-template-import-file" accept="application/json,.json" hidden>
      <div class="outpatient-ai-template-manager-note">引用只填入助手编辑区，不会自动写入医院页面或保存。</div>
    </div>
    <div class="outpatient-ai-template-list"></div>
    <div class="outpatient-ai-template-manager-footer">
      <button type="button" class="outpatient-ai-template-manager-close secondary">关闭</button>
    </div>
  </div>
</div>

<div class="outpatient-ai-order-template-manager" aria-hidden="true">
  <div class="outpatient-ai-order-template-manager-dialog">
    <div class="outpatient-ai-order-template-manager-header">
      <span>门诊医嘱模板管理</span>
      <button type="button" class="outpatient-ai-order-template-manager-close" title="关闭">×</button>
    </div>
    <div class="outpatient-ai-template-manager-toolbar">
      <div class="outpatient-ai-template-manager-toolbar-buttons">
        <button type="button" class="outpatient-ai-order-template-import secondary">导入模板</button>
        <button type="button" class="outpatient-ai-order-template-export secondary">导出全部</button>
      </div>
      <input type="file" class="outpatient-ai-order-template-import-file" accept="application/json,.json" hidden>
      <div class="outpatient-ai-template-manager-note">引用模板只替换门诊助手中的医嘱草稿，不会自动执行、开立或保存医院处方。</div>
    </div>
    <div class="outpatient-ai-order-template-list"></div>
    <div class="outpatient-ai-template-manager-footer">
      <button type="button" class="outpatient-ai-order-template-manager-close secondary">关闭</button>
    </div>
  </div>
</div>`;

        document.body.appendChild(
            modal
        );

        const apiKey =
            modal.querySelector(
                '.outpatient-ai-key'
            );
        const model =
            modal.querySelector(
                '.outpatient-ai-model'
            );
        const template =
            modal.querySelector(
                '.outpatient-ai-template'
            );
        const prompt =
            modal.querySelector(
                '.outpatient-ai-prompt'
            );
        const autoDiagnosis =
            modal.querySelector(
                '.outpatient-ai-auto-diagnosis'
            );

        apiKey.value =
            GM_getValue(
                KEYS.apiKey,
                ''
            );
        model.value =
            GM_getValue(
                KEYS.model,
                DEFAULT_MODEL
            ) ||
            DEFAULT_MODEL;
        template.value =
            GM_getValue(
                KEYS.template,
                'initial'
            );
        prompt.value =
            GM_getValue(
                KEYS.prompt,
                ''
            );
        autoDiagnosis.checked =
            Boolean(
                GM_getValue(
                    KEYS.autoDiagnosisSearch,
                    false
                )
            );

        const sourceInput =
            modal.querySelector(
                '.outpatient-ai-source'
            );

        if (sourceInput) {
            sourceInput.addEventListener(
                'input',
                () => {
                    if (
                        sourceInput.dataset
                            .programmaticWrite ===
                            '1'
                    ) {
                        return;
                    }

                    /*
                     * 一旦医师粘贴或修改患者资料，立即使上一位患者的
                     * 结构化网页快照失效。
                     */
                    state.sourceMode =
                        'manual';
                    state.sourceRecord =
                        null;
                    state.sourceRevision +=
                        1;
                }
            );
        }

        [
            apiKey,
            model,
            template,
            prompt,
            autoDiagnosis
        ].forEach(element => {
            element.addEventListener(
                'change',
                () => {
                    settingsFromModal(
                        modal
                    );
                }
            );
        });

        modal.querySelectorAll(
            '.outpatient-ai-close'
        ).forEach(button => {
            button.addEventListener(
                'click',
                () => {
                    closeChatWindow(
                        modal
                    );

                    closeOutpatientOrderTemplateManager(
                        modal
                    );

                    modal.classList.remove(
                        'show'
                    );
                }
            );
        });

        const modalMask =
            modal.querySelector(
                '.outpatient-ai-mask'
            );

        if (modalMask) {
            modalMask.addEventListener(
                'click',
                () => {
                    closeChatWindow(
                        modal
                    );

                    closeOutpatientOrderTemplateManager(
                        modal
                    );

                    modal.classList.remove(
                        'show'
                    );
                }
            );
        }

        modal.addEventListener(
            'click',
            event => {
                if (
                    event.target === modal
                ) {
                    closeChatWindow(
                        modal
                    );

                    closeOutpatientOrderTemplateManager(
                        modal
                    );

                    modal.classList.remove(
                        'show'
                    );
                }
            }
        );

        modal.querySelector(
            '.outpatient-ai-read-page'
        ).addEventListener(
            'click',
            loadPageRecordIntoSource
        );

        modal.querySelector(
            '.outpatient-ai-generate'
        ).addEventListener(
            'click',
            generateRecord
        );

        modal.querySelector(
            '.outpatient-ai-audit'
        ).addEventListener(
            'click',
            auditCurrentRecord
        );

        modal.querySelector(
            '.outpatient-ai-stop'
        ).addEventListener(
            'click',
            stopAiTask
        );

        modal.querySelector(
            '.outpatient-ai-clear'
        ).addEventListener(
            'click',
            clearGenerated
        );

        modal.querySelector(
            '.outpatient-ai-reset-info'
        ).addEventListener(
            'click',
            resetPatientInformation
        );

        modal.querySelector(
            '.outpatient-ai-preview-audit'
        ).addEventListener(
            'click',
            previewAuditGeneratedRecord
        );

        modal.querySelector(
            '.outpatient-ai-polish'
        ).addEventListener(
            'click',
            polishGeneratedRecord
        );

        modal.querySelector(
            '.outpatient-ai-chat-open'
        ).addEventListener(
            'click',
            () => {
                openChatWindow(
                    modal
                );
            }
        );

        modal.querySelector(
            '.outpatient-ai-complete-empty'
        ).addEventListener(
            'click',
            completeEmptyFields
        );

        modal.querySelector(
            '.outpatient-ai-fill'
        ).addEventListener(
            'click',
            fillCurrentPage
        );

        modal.querySelector(
            '.outpatient-ai-diagnosis-insert'
        ).addEventListener(
            'click',
            executeOutpatientDiagnoses
        );

        modal.querySelector(
            '.outpatient-ai-diagnosis-pause'
        ).addEventListener(
            'click',
            toggleOutpatientDiagnosisPause
        );

        modal.querySelector(
            '.outpatient-ai-diagnosis-stop'
        ).addEventListener(
            'click',
            requestOutpatientDiagnosisStop
        );

        modal.querySelector(
            '.outpatient-ai-copy'
        ).addEventListener(
            'click',
            async () => {
                try {
                    const result =
                        resultFromEditors(
                            modal
                        );

                    await copyText(
                        buildFullRecord(
                            result
                        )
                    );

                    showMessage(
                        '病历全文已复制。',
                        'success'
                    );
                }
                catch (error) {
                    showMessage(
                        error.message,
                        'error'
                    );
                }
            }
        );

        modal.querySelector(
            '.outpatient-ai-use-revised'
        ).addEventListener(
            'click',
            useRevisedRecord
        );

        initializeSections(
            modal
        );

        initializeChatWindow(
            modal
        );

        initializeOutpatientOrderAndTemplates(
            modal
        );

        updateOutpatientDiagnosisControls(
            modal
        );

        return modal;
    }

    function showModal() {
        const modal =
            createModal();

        updateOutpatientDiagnosisControls(
            modal
        );

        modal.classList.add(
            'show'
        );
    }


    /******************************************************************
     * 可拖动、可折叠悬浮框
     *
     * 外观和运行架构参照“自动填写患者信息”脚本。
     ******************************************************************/

    const OUTPATIENT_PANEL_POSITION_KEY =
        'medicalOutpatientAssistantPanelPositionV12';

    const OUTPATIENT_PANEL_COLLAPSED_KEY =
        'medicalOutpatientAssistantPanelCollapsedV12';

    const OUTPATIENT_PANEL_ID =
        IDS.panel;

    const OUTPATIENT_BUTTON_ID =
        IDS.button;

    const OUTPATIENT_REFERENCE_PANEL_ID =
        'medical-auto-fill-panel';

    const OUTPATIENT_PANEL_GAP =
        12;

    function clampPanelNumber(
        value,
        minimum,
        maximum
    ) {
        return Math.min(
            Math.max(
                value,
                minimum
            ),
            maximum
        );
    }

    function hasSavedOutpatientPanelPosition() {
        try {
            return Boolean(
                localStorage.getItem(
                    OUTPATIENT_PANEL_POSITION_KEY
                )
            );
        } catch (error) {
            return false;
        }
    }

    function loadOutpatientPanelPosition() {
        try {
            const value =
                JSON.parse(
                    localStorage.getItem(
                        OUTPATIENT_PANEL_POSITION_KEY
                    ) ||
                    'null'
                );

            if (
                value &&
                Number.isFinite(value.left) &&
                Number.isFinite(value.top)
            ) {
                return value;
            }
        } catch (error) {
            // 读取失败时使用默认位置。
        }

        return null;
    }

    function saveOutpatientPanelPosition(
        panel
    ) {
        if (!panel) {
            return;
        }

        const rect =
            panel.getBoundingClientRect();

        try {
            localStorage.setItem(
                OUTPATIENT_PANEL_POSITION_KEY,
                JSON.stringify({
                    left:
                        Math.round(
                            rect.left
                        ),
                    top:
                        Math.round(
                            rect.top
                        )
                })
            );
        } catch (error) {
            // 本地存储失败不影响使用。
        }
    }

    function loadOutpatientPanelCollapsed() {
        try {
            return (
                localStorage.getItem(
                    OUTPATIENT_PANEL_COLLAPSED_KEY
                ) === '1'
            );
        } catch (error) {
            return false;
        }
    }

    function saveOutpatientPanelCollapsed(
        collapsed
    ) {
        try {
            localStorage.setItem(
                OUTPATIENT_PANEL_COLLAPSED_KEY,
                collapsed
                    ? '1'
                    : '0'
            );
        } catch (error) {
            // 本地存储失败不影响折叠。
        }
    }

    function keepOutpatientPanelInViewport(
        panel,
        savePosition
    ) {
        if (!panel) {
            return;
        }

        const rect =
            panel.getBoundingClientRect();

        const margin =
            6;

        const maximumLeft =
            Math.max(
                margin,
                window.innerWidth -
                rect.width -
                margin
            );

        const maximumTop =
            Math.max(
                margin,
                window.innerHeight -
                rect.height -
                margin
            );

        const left =
            clampPanelNumber(
                rect.left,
                margin,
                maximumLeft
            );

        const top =
            clampPanelNumber(
                rect.top,
                margin,
                maximumTop
            );

        panel.style.left =
            Math.round(left) +
            'px';

        panel.style.top =
            Math.round(top) +
            'px';

        panel.style.right =
            'auto';

        panel.style.bottom =
            'auto';

        if (savePosition !== false) {
            saveOutpatientPanelPosition(
                panel
            );
        }
    }

    function positionOutpatientPanelAboveReference(
        panel
    ) {
        if (
            !panel ||
            hasSavedOutpatientPanelPosition()
        ) {
            return false;
        }

        const referencePanel =
            document.getElementById(
                OUTPATIENT_REFERENCE_PANEL_ID
            );

        if (
            !referencePanel ||
            !referencePanel.isConnected
        ) {
            panel.style.left =
                'auto';

            panel.style.top =
                'auto';

            panel.style.right =
                '20px';

            panel.style.bottom =
                '230px';

            return false;
        }

        const referenceRect =
            referencePanel
                .getBoundingClientRect();

        const panelRect =
            panel.getBoundingClientRect();

        const margin =
            6;

        let left =
            referenceRect.right -
            panelRect.width;

        let top =
            referenceRect.top -
            panelRect.height -
            OUTPATIENT_PANEL_GAP;

        if (top < margin) {
            left =
                referenceRect.left -
                panelRect.width -
                OUTPATIENT_PANEL_GAP;

            top =
                referenceRect.top;
        }

        if (left < margin) {
            left =
                referenceRect.right -
                panelRect.width;

            top =
                Math.max(
                    margin,
                    referenceRect.top -
                    panelRect.height -
                    OUTPATIENT_PANEL_GAP
                );
        }

        const maximumLeft =
            Math.max(
                margin,
                window.innerWidth -
                panelRect.width -
                margin
            );

        const maximumTop =
            Math.max(
                margin,
                window.innerHeight -
                panelRect.height -
                margin
            );

        left =
            clampPanelNumber(
                left,
                margin,
                maximumLeft
            );

        top =
            clampPanelNumber(
                top,
                margin,
                maximumTop
            );

        panel.style.left =
            Math.round(left) +
            'px';

        panel.style.top =
            Math.round(top) +
            'px';

        panel.style.right =
            'auto';

        panel.style.bottom =
            'auto';

        return true;
    }

    function applyOutpatientPanelInitialPosition(
        panel
    ) {
        const savedPosition =
            loadOutpatientPanelPosition();

        if (savedPosition) {
            panel.style.left =
                savedPosition.left +
                'px';

            panel.style.top =
                savedPosition.top +
                'px';

            panel.style.right =
                'auto';

            panel.style.bottom =
                'auto';

            requestAnimationFrame(
                function () {
                    keepOutpatientPanelInViewport(
                        panel,
                        false
                    );
                }
            );

            return;
        }

        positionOutpatientPanelAboveReference(
            panel
        );
    }

    function setOutpatientPanelCollapsed(
        panel,
        collapsed,
        saveState
    ) {
        if (!panel) {
            return;
        }

        const body =
            panel.querySelector(
                '.outpatient-ai-floating-body'
            );

        const toggleButton =
            panel.querySelector(
                '.outpatient-ai-floating-toggle'
            );

        if (
            !body ||
            !toggleButton
        ) {
            return;
        }

        panel.dataset.collapsed =
            collapsed
                ? 'true'
                : 'false';

        body.style.display =
            collapsed
                ? 'none'
                : 'block';

        toggleButton.textContent =
            collapsed
                ? '＋'
                : '－';

        toggleButton.title =
            collapsed
                ? '展开'
                : '折叠';

        toggleButton.setAttribute(
            'aria-label',
            collapsed
                ? '展开门诊助手'
                : '折叠门诊助手'
        );

        if (saveState !== false) {
            saveOutpatientPanelCollapsed(
                collapsed
            );
        }

        /*
         * v1.7.3.10：展开/折叠只改变自身高度，不再重新执行“参考患者信息悬浮框”定位。
         *
         * 原逻辑在没有本脚本原生位置记录时，会在任何一次折叠状态变化后重新
         * positionOutpatientPanelAboveReference()。悬浮框管理器即使已经把门诊助手
         * 移到其他位置，也不会写入本脚本自己的位置键，因此在管理器绑定/解绑状态下
         * 都可能先跳回默认位置；绑定状态随后又被管理器排回去，于是表现为“闪一下”。
         *
         * 现在折叠后只做视口边界校正，保持当前 left/top 不变。位置只有用户真正拖动
         * 门诊助手时才由 finishDragging() 写入原生位置记录。
         */
        requestAnimationFrame(
            function () {
                keepOutpatientPanelInViewport(
                    panel,
                    false
                );
            }
        );
    }

    function toggleOutpatientPanelCollapsed(
        panel
    ) {
        const collapsed =
            panel.dataset.collapsed ===
            'true';

        setOutpatientPanelCollapsed(
            panel,
            !collapsed,
            true
        );
    }

    function enableOutpatientPanelDrag(
        panel,
        dragHandle
    ) {
        let dragging = false;
        let activePointerId = null;
        let startPointerX = 0;
        let startPointerY = 0;
        let startPanelLeft = 0;
        let startPanelTop = 0;
        let previousUserSelect = '';

        dragHandle.addEventListener(
            'pointerdown',
            function (event) {
                if (
                    event.target.closest(
                        '.outpatient-ai-floating-toggle'
                    )
                ) {
                    return;
                }

                if (
                    event.pointerType === 'mouse' &&
                    event.button !== 0
                ) {
                    return;
                }

                const rect =
                    panel.getBoundingClientRect();

                dragging = true;
                activePointerId = event.pointerId;
                startPointerX = event.clientX;
                startPointerY = event.clientY;
                startPanelLeft = rect.left;
                startPanelTop = rect.top;

                panel.style.left =
                    Math.round(rect.left) +
                    'px';

                panel.style.top =
                    Math.round(rect.top) +
                    'px';

                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
                panel.style.transition = 'none';
                panel.style.opacity = '0.94';

                previousUserSelect =
                    document.documentElement
                        .style.userSelect;

                document.documentElement
                    .style.userSelect =
                    'none';

                dragHandle.style.cursor =
                    'grabbing';

                try {
                    dragHandle.setPointerCapture(
                        activePointerId
                    );
                } catch (error) {
                    // 浏览器不支持时忽略。
                }

                event.preventDefault();
            }
        );

        dragHandle.addEventListener(
            'pointermove',
            function (event) {
                if (
                    !dragging ||
                    event.pointerId !== activePointerId
                ) {
                    return;
                }

                const offsetX =
                    event.clientX -
                    startPointerX;

                const offsetY =
                    event.clientY -
                    startPointerY;

                const margin = 6;

                const maximumLeft =
                    Math.max(
                        margin,
                        window.innerWidth -
                        panel.offsetWidth -
                        margin
                    );

                const maximumTop =
                    Math.max(
                        margin,
                        window.innerHeight -
                        panel.offsetHeight -
                        margin
                    );

                const left =
                    clampPanelNumber(
                        startPanelLeft +
                        offsetX,
                        margin,
                        maximumLeft
                    );

                const top =
                    clampPanelNumber(
                        startPanelTop +
                        offsetY,
                        margin,
                        maximumTop
                    );

                panel.style.left =
                    Math.round(left) +
                    'px';

                panel.style.top =
                    Math.round(top) +
                    'px';

                event.preventDefault();
            }
        );

        function finishDragging(
            event
        ) {
            if (!dragging) {
                return;
            }

            if (
                event &&
                event.pointerId !== undefined &&
                event.pointerId !== activePointerId
            ) {
                return;
            }

            dragging = false;

            try {
                dragHandle.releasePointerCapture(
                    activePointerId
                );
            } catch (error) {
                // 未捕获指针时忽略。
            }

            activePointerId = null;
            panel.style.transition = '';
            panel.style.opacity = '1';
            dragHandle.style.cursor = 'move';

            document.documentElement
                .style.userSelect =
                previousUserSelect;

            keepOutpatientPanelInViewport(
                panel,
                true
            );
        }

        dragHandle.addEventListener(
            'pointerup',
            finishDragging
        );

        dragHandle.addEventListener(
            'pointercancel',
            finishDragging
        );

        dragHandle.addEventListener(
            'lostpointercapture',
            finishDragging
        );
    }

    function createPanel() {
        if (
            document.getElementById(
                OUTPATIENT_PANEL_ID
            )
        ) {
            return;
        }

        const panel =
            document.createElement(
                'div'
            );

        panel.id =
            OUTPATIENT_PANEL_ID;

        panel.dataset.medicalSuiteKey =
            'outpatient';

        panel.dataset.medicalPanelName =
            '门诊助手';

        Object.assign(
            panel.style,
            {
                position: 'fixed',
                width:
                    NATIVE_SIMPLE_DARK_BLUE_STYLE.panelWidth +
                    'px',
                zIndex: '2147483646',
                overflow: 'hidden',
                borderRadius:
                    NATIVE_SIMPLE_DARK_BLUE_STYLE.panelRadius +
                    'px',
                background: '#ffffff',
                boxShadow:
                    NATIVE_SIMPLE_DARK_BLUE_STYLE.panelShadow,
                fontFamily:
                    '"Microsoft YaHei",Arial,sans-serif',
                opacity: '1'
            }
        );

        const header =
            document.createElement(
                'div'
            );

        header.className =
            'outpatient-ai-floating-header';

        Object.assign(
            header.style,
            {
                height: '31px',
                padding: '0 7px 0 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background:
                    NATIVE_SIMPLE_DARK_BLUE_STYLE.headerColor,
                color: '#ffffff',
                cursor: 'move',
                userSelect: 'none',
                touchAction: 'none'
            }
        );

        const title =
            document.createElement(
                'span'
            );

        title.textContent =
            '门诊助手';

        Object.assign(
            title.style,
            {
                minWidth: '0',
                overflow: 'hidden',
                fontSize: '13px',
                fontWeight: 'bold',
                lineHeight: '31px',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                pointerEvents: 'none'
            }
        );

        const toggleButton =
            document.createElement(
                'button'
            );

        toggleButton.type = 'button';
        toggleButton.className =
            'outpatient-ai-floating-toggle';

        Object.assign(
            toggleButton.style,
            {
                width: '24px',
                height: '24px',
                flex: 'none',
                padding: '0',
                border: 'none',
                borderRadius: '4px',
                background: 'rgba(255,255,255,.16)',
                color: '#ffffff',
                fontSize: '18px',
                lineHeight: '22px',
                textAlign: 'center',
                cursor: 'pointer'
            }
        );

        toggleButton.addEventListener(
            'pointerdown',
            function (event) {
                event.stopPropagation();
            }
        );

        toggleButton.addEventListener(
            'click',
            function (event) {
                event.stopPropagation();
                toggleOutpatientPanelCollapsed(
                    panel
                );
            }
        );

        header.appendChild(title);
        header.appendChild(toggleButton);

        const body =
            document.createElement(
                'div'
            );

        body.className =
            'outpatient-ai-floating-body';

        Object.assign(
            body.style,
            {
                padding: '8px',
                background: '#ffffff'
            }
        );

        const button =
            document.createElement(
                'button'
            );

        button.id =
            OUTPATIENT_BUTTON_ID;

        button.type = 'button';
        button.textContent =
            '打开门诊助手';

        Object.assign(
            button.style,
            {
                width: '158px',
                height: '40px',
                padding: '0',
                border: 'none',
                borderRadius: '5px',
                background:
                    NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor,
                color: '#ffffff',
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow:
                    '0 2px 7px rgba(0,0,0,.18)'
            }
        );

        button.addEventListener(
            'mouseenter',
            function () {
                if (!button.disabled) {
                    button.style.background =
                        NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryHoverColor;
                }
            }
        );

        button.addEventListener(
            'mouseleave',
            function () {
                if (!button.disabled) {
                    button.style.background =
                        NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor;
                }
            }
        );

        button.addEventListener(
            'click',
            showModal
        );

        body.appendChild(button);
        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        setOutpatientPanelCollapsed(
            panel,
            loadOutpatientPanelCollapsed(),
            false
        );

        applyOutpatientPanelInitialPosition(
            panel
        );

        enableOutpatientPanelDrag(
            panel,
            header
        );
    }


    GM_addStyle(`
#${IDS.panel}{
  font-family:"Microsoft YaHei",Arial,sans-serif;
  font-size:13px;
}
#${IDS.panel} .outpatient-ai-floating-header,
#${IDS.panel} .outpatient-ai-floating-toggle,
#${IDS.panel} .outpatient-ai-floating-body,
#${IDS.panel} #${IDS.button}{
  box-sizing:border-box;
}
#${IDS.modal}{
  position:fixed;
  inset:0;
  z-index:2147483647;
  display:none;
  font-family:"Microsoft YaHei",Arial,sans-serif;
  color:#333;
  font-size:13px;
}
#${IDS.modal}.show{
  display:block;
}
#${IDS.modal} .outpatient-ai-mask{
  position:absolute;
  inset:0;
  background:rgba(0,0,0,.38);
}
#${IDS.modal} .outpatient-ai-dialog{
  position:absolute;
  left:50%;
  top:50%;
  transform:translate(-50%,-50%);
  display:flex;
  flex-direction:column;
  width:900px;
  max-width:calc(100vw - 30px);
  max-height:calc(100vh - 40px);
  overflow:hidden;
  border-radius:8px;
  background:#fff;
  color:#333;
  box-shadow:0 10px 35px rgba(0,0,0,.35);
}
#${IDS.modal} .outpatient-ai-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex:none;
  padding:14px 18px;
  background:${MODAL_HEADER_COLOR};
  color:#fff;
  font-size:16px;
  font-weight:bold;
}
#${IDS.modal} .outpatient-ai-header .outpatient-ai-close{
  width:30px;
  height:30px;
  min-width:0;
  min-height:0;
  padding:0;
  border:0;
  background:transparent;
  color:#fff;
  font-size:26px;
  line-height:28px;
  cursor:pointer;
}
#${IDS.modal} .outpatient-ai-body{
  flex:1;
  max-height:calc(100vh - 180px);
  padding:14px 18px 18px;
  overflow:auto;
  background:#f7f9fb;
}
#${IDS.modal} .outpatient-ai-footer{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  flex:none;
  gap:10px;
  padding:12px 18px;
  border-top:1px solid #eee;
  background:#fafafa;
}
#${IDS.modal} button{
  min-width:88px;
  min-height:34px;
  padding:0 14px;
  border:1px solid ${NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor};
  border-radius:4px;
  background:${NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor};
  color:#fff;
  font-family:inherit;
  font-size:13px;
  cursor:pointer;
}
#${IDS.modal} button:hover:not(:disabled):not(.outpatient-ai-close){
  background:${NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryHoverColor};
}
#${IDS.modal} button.secondary{
  border-color:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryBorderColor};
  background:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryBackground};
  color:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryTextColor};
}
#${IDS.modal} button.secondary:hover:not(:disabled){
  background:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryHoverBackground};
}
#${IDS.modal} button.danger{
  border-color:#e5534b;
  background:#e5534b;
  color:#fff;
}
#${IDS.modal} button.danger:hover:not(:disabled){
  background:#d9463e;
}
#${IDS.modal} button:disabled{
  cursor:not-allowed;
  opacity:.52;
}
#${IDS.modal} input,
#${IDS.modal} select,
#${IDS.modal} textarea{
  box-sizing:border-box;
  width:100%;
  min-width:0;
  border:1px solid #cbd6de;
  border-radius:4px;
  padding:6px 8px;
  background:#fff;
  color:#333;
  font-family:inherit;
  font-size:13px;
  outline:none;
}
#${IDS.modal} input,
#${IDS.modal} select{
  min-height:32px;
}
#${IDS.modal} textarea{
  resize:vertical;
  line-height:1.55;
}
#${IDS.modal} input:focus,
#${IDS.modal} select:focus,
#${IDS.modal} textarea:focus{
  border-color:${NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor};
  box-shadow:0 0 0 2px rgba(21,155,211,.12);
}
#${IDS.modal} .outpatient-ai-section{
  margin-bottom:12px;
  padding:12px;
  overflow:hidden;
  border:1px solid #dde5eb;
  border-radius:6px;
  background:#fff;
}
#${IDS.modal} .outpatient-ai-section-title{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:10px;
  padding-bottom:7px;
  border-bottom:1px solid #edf1f4;
  color:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryTextColor};
  font-size:14px;
  font-weight:bold;
}
#${IDS.modal} .outpatient-ai-section-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  flex-wrap:wrap;
  gap:8px;
}
#${IDS.modal} .outpatient-ai-complete-empty{
  min-width:132px;
  min-height:28px;
  height:28px;
  padding:0 10px;
  font-size:12px;
}
#${IDS.modal} .outpatient-ai-toggle-section{
  min-width:58px;
  min-height:28px;
  height:28px;
  padding:0 10px;
  border-color:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryBorderColor};
  background:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryBackground};
  color:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryTextColor};
  font-size:12px;
}
#${IDS.modal} .outpatient-ai-toggle-section:hover:not(:disabled){
  background:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryHoverBackground};
}
#${IDS.modal} .outpatient-ai-section-content{
  padding:0;
}
#${IDS.modal} .outpatient-ai-section.collapsed .outpatient-ai-section-title{
  margin-bottom:0;
  padding-bottom:0;
  border-bottom:0;
}
#${IDS.modal} .outpatient-ai-section.collapsed .outpatient-ai-section-content{
  display:none;
}
#${IDS.modal} .outpatient-ai-settings-grid{
  display:grid;
  grid-template-columns:2fr 1fr 1fr 1.6fr;
  gap:10px 14px;
  align-items:end;
}
#${IDS.modal} .outpatient-ai-settings-grid label,
#${IDS.modal} .outpatient-ai-label,
#${IDS.modal} .outpatient-ai-record-grid label,
#${IDS.modal} .outpatient-ai-diagnosis-grid label{
  display:flex;
  flex-direction:column;
  gap:5px;
  min-width:0;
}
#${IDS.modal} .outpatient-ai-check-label{
  display:flex!important;
  flex-direction:row!important;
  align-items:center;
  gap:7px;
  min-height:34px;
  padding:7px 8px;
  border:1px solid #e1e7ec;
  border-radius:4px;
  background:#fafcfd;
  font-size:12px;
  cursor:pointer;
}
#${IDS.modal} .outpatient-ai-check-label input{
  width:16px;
  min-height:0;
  height:16px;
  margin:0;
  flex:none;
}
#${IDS.modal} .outpatient-ai-source{
  height:145px;
}
#${IDS.modal} .outpatient-ai-prompt{
  height:95px;
  margin-top:8px;
}
#${IDS.modal} .outpatient-ai-toolbar{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:9px;
  margin-top:10px;
}
#${IDS.modal} .outpatient-ai-record-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px 14px;
}
#${IDS.modal} .outpatient-ai-record-grid textarea{
  height:104px;
}
#${IDS.modal} .outpatient-ai-record-grid label:nth-child(2) textarea{
  height:165px;
}
#${IDS.modal} .outpatient-ai-diagnosis-grid{
  display:grid;
  grid-template-columns:2fr 1fr 1fr;
  gap:10px 14px;
  margin-top:12px;
}
#${IDS.modal} .outpatient-ai-diagnosis-grid .wide{
  grid-column:1 / -1;
}
#${IDS.modal} .outpatient-ai-diagnosis-grid textarea{
  height:90px;
}
#${IDS.modal} .outpatient-ai-result{
  max-height:360px;
  overflow:auto;
  padding:10px 11px;
  border:1px solid #dde5eb;
  border-radius:5px;
  background:#fafcfd;
  line-height:1.65;
}
#${IDS.modal} .outpatient-ai-empty{
  color:#777;
}
#${IDS.modal} .outpatient-ai-advice-block,
#${IDS.modal} .outpatient-ai-audit-block{
  margin-bottom:8px;
  padding:8px 9px;
  border:1px solid #e1e7ec;
  border-radius:4px;
  background:#fff;
}
#${IDS.modal} .outpatient-ai-advice-block ul,
#${IDS.modal} .outpatient-ai-audit-block ul{
  margin:5px 0 0 19px;
  padding:0;
}
#${IDS.modal} .outpatient-ai-audit-block.warning{
  border-color:#f1d99a;
  background:#fff9e9;
  color:#7d5d00;
}
#${IDS.modal} .outpatient-ai-audit-block.danger{
  border-color:#efc2bd;
  background:#fff0ee;
  color:#a72f27;
}
#${IDS.modal} .outpatient-ai-audit-summary{
  margin-bottom:8px;
  padding:8px 9px;
  border:1px solid #d6e9f1;
  border-radius:4px;
  background:#f3fbfe;
}
#${IDS.modal} .outpatient-ai-diagnosis-status{
  display:none;
  flex:1 1 100%;
  margin-top:1px;
  padding:8px 10px;
  border:1px solid #cce8f3;
  border-radius:5px;
  background:#f2f8fb;
  color:#176f94;
  line-height:1.55;
  white-space:pre-line;
}
#${IDS.modal} .outpatient-ai-diagnosis-status[data-type="paused"]{
  border-color:#f1d99a;
  background:#fff9e9;
  color:#7d5d00;
}
#${IDS.modal} .outpatient-ai-diagnosis-pause[data-paused="true"]{
  border-color:#e4a83a;
  background:#e4a83a;
  color:#fff;
}
#${IDS.modal} .outpatient-ai-safe-note{
  margin-top:10px;
  padding:9px 10px;
  border:1px solid #f1d99a;
  border-radius:5px;
  background:#fff9e9;
  color:#7d5d00;
  line-height:1.6;
}
#${IDS.modal} .outpatient-ai-message{
  margin-top:12px;
  padding:9px 11px;
  border-radius:5px;
  white-space:pre-line;
  line-height:1.6;
}
#${IDS.modal} .outpatient-ai-message.normal{
  border:1px solid #cce8f3;
  background:#f2f8fb;
  color:#176f94;
}
#${IDS.modal} .outpatient-ai-message.success{
  border:1px solid #c7ead5;
  background:#eaf8ef;
  color:#176b38;
}
#${IDS.modal} .outpatient-ai-message.warning{
  border:1px solid #f1d99a;
  background:#fff9e9;
  color:#7d5d00;
}
#${IDS.modal} .outpatient-ai-message.error{
  border:1px solid #efc2bd;
  background:#fff0ee;
  color:#a72f27;
}

#${IDS.modal} .outpatient-ai-polish,
#${IDS.modal} .outpatient-ai-record-template-save,
#${IDS.modal} .outpatient-ai-preview-audit,
#${IDS.modal} .outpatient-ai-chat-open{
  min-width:82px;
  min-height:28px;
  height:28px;
  padding:0 10px;
  font-size:12px;
}
#${IDS.modal} .outpatient-ai-record-template-save{
  width:96px;
  min-width:96px;
  flex-shrink:0;
}
#${IDS.modal} .outpatient-ai-chat-window{
  position:fixed;
  left:50%;
  top:50%;
  z-index:8;
  display:none;
  width:620px;
  max-width:calc(100vw - 24px);
  max-height:calc(100vh - 24px);
  transform:translate(-50%,-50%);
  overflow:hidden;
  border:1px solid #c9dbe4;
  border-radius:8px;
  background:#fff;
  color:#333;
  box-shadow:0 12px 38px rgba(0,0,0,.38);
}
#${IDS.modal} .outpatient-ai-chat-window.show{
  display:block;
}
#${IDS.modal} .outpatient-ai-chat-header{
  height:44px;
  padding:0 12px 0 15px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  background:${MODAL_HEADER_COLOR};
  color:#fff;
  font-size:15px;
  font-weight:bold;
  cursor:move;
  user-select:none;
  touch-action:none;
}
#${IDS.modal} .outpatient-ai-chat-header .outpatient-ai-chat-close{
  width:30px;
  height:30px;
  min-width:30px;
  min-height:30px;
  padding:0;
  border:0;
  background:transparent;
  color:#fff;
  font-size:25px;
  line-height:28px;
}
#${IDS.modal} .outpatient-ai-chat-body{
  padding:12px;
  background:#f7f9fb;
}
#${IDS.modal} .outpatient-ai-chat-options{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
}
#${IDS.modal} .outpatient-ai-chat-context-option{
  display:flex;
  align-items:center;
  gap:8px;
  width:max-content;
  max-width:100%;
  padding:7px 9px;
  border:1px solid #d6e5ec;
  border-radius:5px;
  background:#fff;
  color:#333;
  font-size:13px;
  cursor:pointer;
}
#${IDS.modal} .outpatient-ai-chat-context-option input{
  width:16px;
  height:16px;
  min-height:0;
  margin:0;
  flex:none;
}
#${IDS.modal} .outpatient-ai-chat-context-note{
  margin:7px 0 9px;
  color:#60737d;
  font-size:12px;
  line-height:1.55;
}
#${IDS.modal} .outpatient-ai-chat-messages{
  height:300px;
  overflow:auto;
  padding:10px;
  border:1px solid #d8e2e8;
  border-radius:5px;
  background:#fff;
}
#${IDS.modal} .outpatient-ai-chat-empty{
  padding:22px 12px;
  color:#7c8b93;
  text-align:center;
  line-height:1.7;
}
#${IDS.modal} .outpatient-ai-chat-message{
  max-width:88%;
  margin-bottom:10px;
  padding:8px 10px;
  border:1px solid #dce6eb;
  border-radius:6px;
  background:#fff;
  line-height:1.65;
}
#${IDS.modal} .outpatient-ai-chat-message.user{
  margin-left:auto;
  border-color:#cce8f3;
  background:#f2f8fb;
}
#${IDS.modal} .outpatient-ai-chat-message.assistant{
  margin-right:auto;
}
#${IDS.modal} .outpatient-ai-chat-role{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  min-height:24px;
  margin-bottom:4px;
  color:${NATIVE_SIMPLE_DARK_BLUE_STYLE.secondaryTextColor};
  font-size:12px;
  font-weight:bold;
}
#${IDS.modal} .outpatient-ai-chat-role-name{
  min-width:0;
}
#${IDS.modal} .outpatient-ai-chat-copy{
  width:auto;
  min-width:58px;
  min-height:22px;
  height:22px;
  padding:0 7px;
  flex:none;
  border-radius:3px;
  font-size:11px;
  line-height:20px;
}
#${IDS.modal} .outpatient-ai-chat-content{
  white-space:pre-wrap;
  word-break:break-word;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown{
  white-space:normal;
  line-height:1.68;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown p{
  margin:0 0 8px;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown p:last-child{
  margin-bottom:0;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown h1,
#${IDS.modal} .outpatient-ai-chat-content.markdown h2,
#${IDS.modal} .outpatient-ai-chat-content.markdown h3,
#${IDS.modal} .outpatient-ai-chat-content.markdown h4,
#${IDS.modal} .outpatient-ai-chat-content.markdown h5,
#${IDS.modal} .outpatient-ai-chat-content.markdown h6{
  margin:10px 0 6px;
  line-height:1.4;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown h1{
  font-size:18px;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown h2{
  font-size:16px;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown h3{
  font-size:15px;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown ul,
#${IDS.modal} .outpatient-ai-chat-content.markdown ol{
  margin:5px 0 9px;
  padding-left:24px;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown li{
  margin:2px 0;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown blockquote{
  margin:7px 0;
  padding:6px 9px;
  border-left:3px solid #b9d9e7;
  background:#f6fafc;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown pre{
  margin:8px 0;
  padding:9px;
  overflow:auto;
  border:1px solid #d8e2e8;
  border-radius:4px;
  background:#f5f7f8;
  white-space:pre;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown code{
  padding:1px 4px;
  border-radius:3px;
  background:#f0f3f5;
  font-family:Consolas,Monaco,monospace;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown pre code{
  padding:0;
  background:transparent;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown a{
  text-decoration:underline;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown hr{
  margin:9px 0;
  border:0;
  border-top:1px solid #d8e2e8;
}
#${IDS.modal} .outpatient-ai-md-table-wrap{
  max-width:100%;
  margin:8px 0;
  overflow:auto;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown table{
  width:100%;
  border-collapse:collapse;
  font-size:12px;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown th,
#${IDS.modal} .outpatient-ai-chat-content.markdown td{
  padding:5px 7px;
  border:1px solid #d8e2e8;
  text-align:left;
  vertical-align:top;
}
#${IDS.modal} .outpatient-ai-chat-content.markdown th{
  font-weight:bold;
  background:#f6fafc;
}
#${IDS.modal} .outpatient-ai-chat-input{
  height:92px;
  margin-top:9px;
  resize:vertical;
}
#${IDS.modal} .outpatient-ai-chat-toolbar{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:9px;
}
#${IDS.modal} .outpatient-ai-chat-toolbar button{
  min-width:78px;
}
#${IDS.modal} .outpatient-ai-chat-status{
  margin-top:9px;
  padding:8px 9px;
  border-radius:5px;
  white-space:pre-line;
  line-height:1.55;
  font-size:12px;
}
#${IDS.modal} .outpatient-ai-chat-status.normal{
  border:1px solid #cce8f3;
  background:#f2f8fb;
  color:#176f94;
}
#${IDS.modal} .outpatient-ai-chat-status.success{
  border:1px solid #c7ead5;
  background:#eaf8ef;
  color:#176b38;
}
#${IDS.modal} .outpatient-ai-chat-status.warning{
  border:1px solid #f1d99a;
  background:#fff9e9;
  color:#7d5d00;
}
#${IDS.modal} .outpatient-ai-chat-status.error{
  border:1px solid #efc2bd;
  background:#fff0ee;
  color:#a72f27;
}
@media(max-width:940px){
  #${IDS.modal} .outpatient-ai-dialog{
    width:calc(100vw - 30px);
  }
  #${IDS.modal} .outpatient-ai-settings-grid{
    grid-template-columns:1fr 1fr;
  }
}
@media(max-width:650px){
  #${IDS.modal} .outpatient-ai-settings-grid,
  #${IDS.modal} .outpatient-ai-record-grid,
  #${IDS.modal} .outpatient-ai-diagnosis-grid{
    grid-template-columns:1fr;
  }
  #${IDS.modal} .outpatient-ai-diagnosis-grid .wide{
    grid-column:auto;
  }
  #${IDS.modal} .outpatient-ai-dialog{
    max-height:calc(100vh - 20px);
  }
  #${IDS.modal} .outpatient-ai-body{
    max-height:calc(100vh - 150px);
    padding:12px;
  }
  #${IDS.modal} .outpatient-ai-header,
  #${IDS.modal} .outpatient-ai-footer{
    padding-left:12px;
    padding-right:12px;
  }
}

@media(max-width:650px){
  #${IDS.modal} .outpatient-ai-chat-window{
    width:calc(100vw - 16px);
    max-height:calc(100vh - 16px);
  }
  #${IDS.modal} .outpatient-ai-chat-messages{
    height:240px;
  }
}
/* 门诊病历模板 */
#${IDS.modal} .outpatient-ai-template-manager{
  position:fixed!important;
  left:0!important;
  top:0!important;
  right:0!important;
  bottom:0!important;
  z-index:2147483647!important;
  display:none!important;
  align-items:center!important;
  justify-content:center!important;
  box-sizing:border-box!important;
  padding:20px!important;
  background:rgba(0,0,0,.42)!important;
}
#${IDS.modal} .outpatient-ai-template-manager[data-open="true"]{
  display:flex!important;
}
#${IDS.modal} .outpatient-ai-template-manager-dialog{
  position:relative!important;
  left:auto!important;
  top:auto!important;
  transform:none!important;
  width:760px!important;
  max-width:calc(100vw - 40px)!important;
  height:auto!important;
  max-height:calc(100vh - 40px)!important;
  display:flex!important;
  flex-direction:column!important;
  box-sizing:border-box!important;
  overflow:hidden!important;
  border:1px solid ${NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor}!important;
  border-radius:8px!important;
  background:#fff!important;
  color:#333!important;
  box-shadow:0 12px 36px rgba(0,0,0,.34)!important;
}
#${IDS.modal} .outpatient-ai-template-manager-header{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  flex:none!important;
  min-height:52px!important;
  box-sizing:border-box!important;
  padding:10px 16px!important;
  color:#fff!important;
  background:${MODAL_HEADER_COLOR}!important;
  font-size:15px!important;
  font-weight:700!important;
}
#${IDS.modal} .outpatient-ai-template-manager-header button{
  width:30px!important;
  min-width:30px!important;
  height:30px!important;
  min-height:30px!important;
  padding:0!important;
  border:0!important;
  color:#fff!important;
  background:transparent!important;
  font-size:25px!important;
  line-height:28px!important;
  cursor:pointer!important;
}
#${IDS.modal} .outpatient-ai-template-manager-toolbar{
  display:flex!important;
  flex-direction:column!important;
  gap:8px!important;
  flex:none!important;
  box-sizing:border-box!important;
  padding:11px 14px!important;
  border-bottom:1px solid #d9edf5!important;
  background:#f7fbfd!important;
}
#${IDS.modal} .outpatient-ai-template-manager-toolbar-buttons{
  display:flex!important;
  flex-wrap:wrap!important;
  gap:8px!important;
}
#${IDS.modal} .outpatient-ai-template-manager-note{
  color:#5d6b73!important;
  line-height:1.5!important;
}
#${IDS.modal} .outpatient-ai-template-import-file{
  display:none!important;
  width:0!important;
  height:0!important;
  padding:0!important;
  border:0!important;
}
#${IDS.modal} .outpatient-ai-template-list{
  flex:1!important;
  min-height:230px!important;
  max-height:460px!important;
  overflow:auto!important;
  box-sizing:border-box!important;
  padding:12px 14px!important;
  background:#f8fcfe!important;
}
#${IDS.modal} .outpatient-ai-template-empty{
  padding:70px 20px!important;
  text-align:center!important;
  color:#7b8b94!important;
}
#${IDS.modal} .outpatient-ai-template-card{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;
  align-items:center!important;
  gap:12px!important;
  box-sizing:border-box!important;
  margin-bottom:9px!important;
  padding:11px 12px!important;
  border:1px solid #c9e4ef!important;
  border-radius:6px!important;
  background:#fff!important;
}
#${IDS.modal} .outpatient-ai-template-card-main{min-width:0!important;}
#${IDS.modal} .outpatient-ai-template-card-name{font-weight:700!important;color:#117fac!important;}
#${IDS.modal} .outpatient-ai-template-card-summary{
  margin-top:4px!important;
  overflow:hidden!important;
  color:#45545d!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
#${IDS.modal} .outpatient-ai-template-card-time{margin-top:4px!important;font-size:11px!important;color:#8b979e!important;}
#${IDS.modal} .outpatient-ai-template-card-actions{display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:5px!important;}
#${IDS.modal} .outpatient-ai-template-card-actions button{
  min-width:62px!important;
  min-height:30px!important;
  padding:0 10px!important;
}
#${IDS.modal} .outpatient-ai-template-manager-footer{
  display:flex!important;
  justify-content:flex-end!important;
  flex:none!important;
  box-sizing:border-box!important;
  padding:10px 14px!important;
  border-top:1px solid #d9edf5!important;
  background:#fff!important;
}
@media(max-width:720px){
  #${IDS.modal} .outpatient-ai-template-manager{padding:8px!important;}
  #${IDS.modal} .outpatient-ai-template-manager-dialog{max-width:calc(100vw - 16px)!important;max-height:calc(100vh - 16px)!important;}
  #${IDS.modal} .outpatient-ai-template-card{grid-template-columns:1fr!important;}
  #${IDS.modal} .outpatient-ai-template-card-actions{justify-content:flex-start!important;}
}

/* 门诊医嘱模板管理 */
#${IDS.modal} .outpatient-ai-order-template-manager{
  position:fixed!important;
  left:0!important;
  top:0!important;
  right:0!important;
  bottom:0!important;
  z-index:2147483647!important;
  display:none!important;
  align-items:center!important;
  justify-content:center!important;
  box-sizing:border-box!important;
  padding:20px!important;
  background:rgba(0,0,0,.42)!important;
}
#${IDS.modal} .outpatient-ai-order-template-manager[data-open="true"]{
  display:flex!important;
}
#${IDS.modal} .outpatient-ai-order-template-manager-dialog{
  position:relative!important;
  width:760px!important;
  max-width:calc(100vw - 40px)!important;
  max-height:calc(100vh - 40px)!important;
  display:flex!important;
  flex-direction:column!important;
  overflow:hidden!important;
  border:1px solid ${NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor}!important;
  border-radius:8px!important;
  background:#fff!important;
  box-shadow:0 12px 36px rgba(0,0,0,.34)!important;
}
#${IDS.modal} .outpatient-ai-order-template-manager-header{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  min-height:52px!important;
  padding:10px 16px!important;
  color:#fff!important;
  background:${MODAL_HEADER_COLOR}!important;
  font-size:15px!important;
  font-weight:700!important;
}
#${IDS.modal} .outpatient-ai-order-template-manager-header button{
  width:30px!important;
  height:30px!important;
  padding:0!important;
  border:0!important;
  color:#fff!important;
  background:transparent!important;
  font-size:25px!important;
  cursor:pointer!important;
}
#${IDS.modal} .outpatient-ai-order-template-list{
  flex:1!important;
  min-height:230px!important;
  max-height:460px!important;
  overflow:auto!important;
  padding:12px 14px!important;
  background:#f8fcfe!important;
}
#${IDS.modal} .outpatient-ai-order-template-manager-footer{
  display:flex!important;
  justify-content:flex-end!important;
  padding:10px 14px!important;
  border-top:1px solid #d9edf5!important;
  background:#fff!important;
}
#${IDS.modal} .outpatient-ai-order-template-import-file{
  display:none!important;
}
@media(max-width:720px){
  #${IDS.modal} .outpatient-ai-order-template-manager{padding:8px!important;}
  #${IDS.modal} .outpatient-ai-order-template-manager-dialog{max-width:calc(100vw - 16px)!important;max-height:calc(100vh - 16px)!important;}
}

/* 门诊医嘱开立 */
#${IDS.modal} .outpatient-ai-order-source{
  min-height:96px;
  font-family:Consolas,"Microsoft YaHei",monospace;
}
#${IDS.modal} .outpatient-ai-order-options{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:12px;
  margin:8px 0;
  padding:8px 10px;
  border:1px solid #cce6f0;
  border-radius:5px;
  background:#f4fbfe;
}
#${IDS.modal} .outpatient-ai-order-options label{
  display:inline-flex;
  align-items:center;
  gap:5px;
  margin:0;
}
#${IDS.modal} .outpatient-ai-order-options .outpatient-ai-order-open-shared-library,
#${IDS.modal} .outpatient-ai-order-options .outpatient-ai-order-template-save,
#${IDS.modal} .outpatient-ai-order-options .outpatient-ai-order-toggle-secondary-directory{
  width:auto;
  min-width:104px;
  height:32px;
  padding:0 11px;
  flex:0 0 auto;
}
#${IDS.modal} .outpatient-ai-order-options .outpatient-ai-order-shared-status{
  min-width:220px;
  color:#52636b;
  font-size:12px;
  line-height:1.55;
}
#${IDS.modal} .outpatient-ai-order-edit-tools{
  display:flex;
  flex:1 1 100%;
  flex-wrap:wrap;
  align-items:center;
  gap:7px;
  padding-top:7px;
  border-top:1px dashed #c8e1eb;
}
#${IDS.modal} .outpatient-ai-order-edit-tools button{
  width:auto;
  min-width:78px;
  height:32px;
  padding:0 11px;
  flex:0 0 auto;
}
#${IDS.modal} .outpatient-ai-order-editor-switch{
  display:inline-flex;
  align-items:center;
  gap:0;
}
#${IDS.modal} .outpatient-ai-order-editor-switch button{
  border-radius:0!important;
}
#${IDS.modal} .outpatient-ai-order-editor-switch button:first-child{
  border-radius:4px 0 0 4px!important;
}
#${IDS.modal} .outpatient-ai-order-editor-switch button:last-child{
  margin-left:-1px;
  border-radius:0 4px 4px 0!important;
}
#${IDS.modal} .outpatient-ai-order-editor-switch button.active{
  position:relative;
  z-index:1;
  border-color:#159bd3!important;
  background:#e5f6fc!important;
  color:#117fac!important;
  font-weight:700!important;
}
#${IDS.modal} .outpatient-ai-order-json-panel{
  display:none;
  margin:8px 0;
}
#${IDS.modal}.outpatient-ai-order-mode-json .outpatient-ai-order-json-panel{
  display:block;
}
#${IDS.modal}.outpatient-ai-order-mode-json .outpatient-ai-order-table-wrap{
  display:none;
}
#${IDS.modal} .outpatient-ai-order-json-editor{
  width:100%;
  min-height:310px;
  box-sizing:border-box;
  padding:10px 12px;
  border:1px solid #b9d9e7;
  border-radius:5px;
  resize:vertical;
  font:12px/1.55 Consolas,"Microsoft YaHei",monospace;
  background:#fbfdfe;
}
#${IDS.modal} .outpatient-ai-order-json-status{
  margin-top:6px;
  color:#52636b;
  font-size:12px;
}
#${IDS.modal} .outpatient-ai-order-json-status.success{color:#16834d;}
#${IDS.modal} .outpatient-ai-order-json-status.error{color:#c33b31;}
#${IDS.modal} .outpatient-ai-order-row{cursor:pointer;}
#${IDS.modal} .outpatient-ai-order-row.outpatient-ai-order-row-selected td{
  background:#e8f7fd!important;
  box-shadow:inset 0 1px 0 #77c7e6,inset 0 -1px 0 #77c7e6;
}
#${IDS.modal} .outpatient-ai-order-row.outpatient-ai-order-row-selected td:first-child{
  box-shadow:inset 3px 0 0 #159bd3,inset 0 1px 0 #77c7e6,inset 0 -1px 0 #77c7e6;
}
#${IDS.modal} .outpatient-ai-order-table-wrap{
  width:100%;
  overflow:auto;
  border:1px solid #c8e1eb;
  border-radius:5px;
  background:#fff;
}
#${IDS.modal} .outpatient-ai-order-table{
  width:1900px;
  border-collapse:collapse;
  table-layout:fixed;
}
#${IDS.modal}:not(.outpatient-ai-order-secondary-directory-visible) .outpatient-ai-order-secondary-column{
  display:none!important;
}
#${IDS.modal}:not(.outpatient-ai-order-secondary-directory-visible) .outpatient-ai-order-table{
  width:1730px;
}
#${IDS.modal} .outpatient-ai-order-toggle-secondary-directory.active{
  border-color:#159bd3!important;
  background:#e5f6fc!important;
  color:#117fac!important;
}
#${IDS.modal} .outpatient-ai-order-table th,
#${IDS.modal} .outpatient-ai-order-table td{
  padding:5px;
  border-right:1px solid #dcebf1;
  border-bottom:1px solid #dcebf1;
  vertical-align:middle;
  text-align:center;
}
#${IDS.modal} .outpatient-ai-order-table th{
  position:sticky;
  top:0;
  z-index:2;
  color:#30444f;
  background:#edf7fb;
  font-weight:600;
}
#${IDS.modal} .outpatient-ai-order-table input,
#${IDS.modal} .outpatient-ai-order-table select{
  width:100%;
  min-width:0;
  height:30px;
  padding:3px 5px;
}
#${IDS.modal} .outpatient-ai-order-table th:nth-child(1){width:42px;}
#${IDS.modal} .outpatient-ai-order-table th:nth-child(2){width:44px;}
#${IDS.modal} .outpatient-ai-order-table th:nth-child(3){width:110px;}
#${IDS.modal} .outpatient-ai-order-table th:nth-child(4),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(5),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(6){width:170px;}
#${IDS.modal} .outpatient-ai-order-table th:nth-child(7),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(8),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(9),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(10),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(11),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(12){width:92px;}
#${IDS.modal} .outpatient-ai-order-table th:nth-child(13),
#${IDS.modal} .outpatient-ai-order-table th:nth-child(14){width:130px;}
#${IDS.modal} .outpatient-ai-order-table th:nth-child(15){width:115px;}
#${IDS.modal} .outpatient-ai-order-row td:last-child{white-space:nowrap;}
#${IDS.modal} .outpatient-ai-order-row td:last-child button{
  min-width:28px;
  padding:5px 7px;
  margin:0 1px;
}
#outpatient-ai-order-progress-v1{
  position:fixed!important;
  right:22px!important;
  bottom:22px!important;
  z-index:2147483647!important;
  display:none;
  width:390px;
  max-width:calc(100vw - 44px);
  box-sizing:border-box;
  padding:11px 13px 12px;
  border:1px solid #159bd3;
  border-radius:7px;
  background:#fff;
  box-shadow:0 8px 26px rgba(0,0,0,.28);
  font-family:"Microsoft YaHei",Arial,sans-serif;
  pointer-events:auto!important;
}
#outpatient-ai-order-progress-v1.show{display:block!important;}
#outpatient-ai-order-progress-v1.error{border-color:#e85a4f;}
#outpatient-ai-order-progress-v1.success{border-color:#20a05a;}
#outpatient-ai-order-progress-v1 .outpatient-ai-order-progress-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom:5px;
}
#outpatient-ai-order-progress-v1 .outpatient-ai-order-progress-title{
  color:#117fac;
  font-weight:700;
}
#outpatient-ai-order-progress-v1.error .outpatient-ai-order-progress-title{color:#b9362c;}
#outpatient-ai-order-progress-v1.success .outpatient-ai-order-progress-title{color:#087a3d;}
#outpatient-ai-order-progress-v1 .outpatient-ai-order-progress-close{
  width:26px;
  min-width:26px;
  height:26px;
  min-height:26px;
  padding:0;
  border:0;
  border-radius:4px;
  color:#66757d;
  background:transparent;
  font-size:21px;
  line-height:24px;
  cursor:pointer;
}
#outpatient-ai-order-progress-v1 .outpatient-ai-order-progress-close:hover{background:#eef5f8;}
#outpatient-ai-order-progress-v1 .outpatient-ai-order-progress-text{
  max-height:150px;
  overflow:auto;
  white-space:pre-wrap;
  line-height:1.55;
}
#outpatient-ai-order-progress-v1 .outpatient-ai-order-progress-actions{
  display:flex;
  justify-content:flex-end;
  gap:7px;
  margin-top:9px;
}
#outpatient-ai-order-progress-v1 button{
  padding:5px 13px;
  border:1px solid #159bd3;
  border-radius:4px;
  color:#117fac;
  background:#f3fbfe;
  cursor:pointer;
}
#outpatient-ai-order-progress-v1 button:disabled{opacity:.5;cursor:not-allowed;}



`);

    function initialize() {
        createPanel();

        window.addEventListener(
            'resize',
            function () {
                const panel =
                    document.getElementById(
                        OUTPATIENT_PANEL_ID
                    );

                if (!panel) {
                    return;
                }

                /*
                 * v1.7.3.10：窗口变化只负责把当前坐标限制在可视区域内。
                 * 不再因为“没有本脚本自己的位置记录”而重新锚定到患者信息悬浮框。
                 * 这样外部悬浮框管理器写入的实时位置不会被门诊助手抢回。
                 */
                keepOutpatientPanelInViewport(
                    panel,
                    false
                );
            }
        );

        new MutationObserver(
            function () {
                /*
                 * v1.7.3.10：MutationObserver 只负责在页面重建后补回悬浮框。
                 *
                 * 旧版每次 childList 变化都会在“无原生位置记录”时重新定位门诊助手。
                 * 其他任意悬浮框展开/折叠、按钮文字变化、管理器重排等都会制造 DOM
                 * 变化，因此门诊助手会反复闪回同一个默认参考位置。
                 *
                 * 门诊助手的默认位置只在 createPanel() 创建时计算一次；创建完成后，
                 * 页面其他 DOM 变化不再拥有改变其 left/top 的权限。
                 */
                createPanel();
            }
        ).observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );

        console.log(
            '[门诊助手 v1.7.3.16] 已加载：修复诊断新增按钮误点相邻图标；保留原有AI、诊断、医嘱与共享联想功能。'
        );
    }

    if (
        document.readyState === 'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            initialize,
            {
                once: true
            }
        );
    }
    else {
        initialize();
    }

    /******************************************************************
     * WebDAV数据备份与脚本源码快照适配
     *
     * 仅备份明确白名单内的长期配置；API Key、患者资料、临时草稿和
     * 当前任务状态均不进入备份。源码快照只用于WebDAV留档，不自动安装。
     ******************************************************************/

    const SUITE_BACKUP_ADAPTER_KEY =
        "outpatient";

    const SUITE_BACKUP_GM_KEYS = [
            KEYS.model,
            KEYS.prompt,
            KEYS.template,
            KEYS.autoDiagnosisSearch,
            KEYS.panelCollapsed,
            KEYS.panelPosition,
            KEYS.sectionCollapsed,
            KEYS.chatIncludePage,
            KEYS.chatMarkdown,
            KEYS.chatEnterToSend,
            KEYS.chatBubbleCopy,
            KEYS.recordTemplates,
            KEYS.outpatientOrderTemplates,
            KEYS.outpatientOrderAutoSave,
            KEYS.outpatientOrderContinueError,
            KEYS.outpatientOrderTcmStarPrefix,
            KEYS.outpatientOrderSecondaryDirectoryVisible
    ];

    function suiteBackupPageWindow() {
        try {
            if (
                typeof unsafeWindow !==
                    'undefined' &&
                unsafeWindow
            ) {
                return unsafeWindow;
            }
        } catch (error) {
            // 回退到当前window。
        }

        return window;
    }

    function suiteBackupExportData() {
        const gm = {};

        SUITE_BACKUP_GM_KEYS
            .forEach(
                function (storageKey) {
                    const value =
                        GM_getValue(
                            storageKey,
                            undefined
                        );

                    if (
                        value !== undefined
                    ) {
                        gm[storageKey] =
                            value;
                    }
                }
            );

        return {
            schemaVersion: 1,
            gm: gm
        };
    }

    function suiteBackupValidateData(
        data
    ) {
        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data)
        ) {
            return '备份数据不是有效对象。';
        }

        const gm =
            data.gm &&
            typeof data.gm === 'object' &&
            !Array.isArray(data.gm)
                ? data.gm
                : {};

        const allowed =
            new Set(
                SUITE_BACKUP_GM_KEYS
            );

        const invalid =
            Object.keys(gm)
                .find(
                    function (storageKey) {
                        return !allowed.has(
                            storageKey
                        );
                    }
                );

        return invalid
            ? (
                '备份中包含未授权存储键：' +
                invalid
            )
            : true;
    }

    function suiteBackupImportData(
        data
    ) {
        const validation =
            suiteBackupValidateData(
                data
            );

        if (validation !== true) {
            throw new Error(
                String(validation)
            );
        }

        const gm =
            data.gm || {};

        SUITE_BACKUP_GM_KEYS
            .forEach(
                function (storageKey) {
                    if (
                        Object.prototype
                            .hasOwnProperty.call(
                                gm,
                                storageKey
                            )
                    ) {
                        GM_setValue(
                            storageKey,
                            gm[storageKey]
                        );
                    }
                }
            );

        return true;
    }

    function suiteBackupSelfSourceText() {
        const header = [
            "// ==UserScript==",
            "// @name         智慧医疗－门诊助手",
            "// @namespace    http://tampermonkey.net/",
            "// @version      1.7.3.16",
            "// @description  v1.7.3.16：修复DOM图标排列调整后诊断新增误点常用/收藏图标；明确加号优先、排除相邻操作并限制按钮容器；同步WebDAV和全局AI注册版本，保留其余既有功能",
            "// @author       ChatGPT",
            "// @match        http://11.12.199.244:8003/*",
            "// @grant        GM_xmlhttpRequest",
            "// @grant        GM_getValue",
            "// @grant        GM_setValue",
            "// @grant        GM_addStyle",
            "// @grant        unsafeWindow",
            "// @connect      api.deepseek.com",
            "// @connect      open.bigmodel.cn",
           "// @connect      api.openai.com",
            "// @run-at       document-idle",
            "// ==/UserScript==",
            ""
        ].join('\n');

        return (
            header +
            '(' +
            Function.prototype.toString.call(
                medicalOutpatientAssistantMain
            ) +
            ')();\n'
        );
    }

    function suiteBackupRegister() {
        const page =
            suiteBackupPageWindow();

        const adapter = {
            key:
                SUITE_BACKUP_ADAPTER_KEY,
            name:
                "门诊助手AI病历生成与审核",
            version:
                "1.7.3.16",
            adapterVersion: 2,
            exportData:
                suiteBackupExportData,
            validateData:
                suiteBackupValidateData,
            importData:
                suiteBackupImportData,
            isBusy:
                function () {
                    return Boolean(
                        state.busy || state.chatBusy || state.orderBusy || state.orderAiBusy || state.diagnosisBusy
                    );
                },
            describeData:
                function (data) {
                    return (
                        '长期配置' +
                        Object.keys(
                            data &&
                            data.gm ||
                            {}
                        ).length +
                        '项（已排除API Key、患者资料和临时草稿）'
                    );
                }
        };

        try {
            if (
                page.MedicalUserscriptBackupRegistry &&
                typeof page
                    .MedicalUserscriptBackupRegistry
                    .register ===
                    'function'
            ) {
                page.MedicalUserscriptBackupRegistry
                    .register(adapter);
            } else {
                const queue =
                    Array.isArray(
                        page.__medicalUserscriptBackupAdapterQueueV1
                    )
                        ? page.__medicalUserscriptBackupAdapterQueueV1
                        : [];

                queue.push(adapter);
                page.__medicalUserscriptBackupAdapterQueueV1 =
                    queue;
            }
        } catch (error) {
            console.warn(
                '[WebDAV数据备份适配] 注册失败：',
                error
            );
        }

        const sourceProvider = {
            id:
                SUITE_BACKUP_ADAPTER_KEY,
            name:
                "门诊助手AI病历生成与审核",
            version:
                "1.7.3.16",
            role:
                'business',
            fileName:
                "智慧医疗－门诊助手_v1.7.3.16.user.js",
            exportSource:
                suiteBackupSelfSourceText
        };

        try {
            if (
                page.MedicalUserscriptSourceBackupRegistry &&
                typeof page
                    .MedicalUserscriptSourceBackupRegistry
                    .register ===
                    'function'
            ) {
                page.MedicalUserscriptSourceBackupRegistry
                    .register(
                        sourceProvider
                    );
            } else {
                const sourceQueue =
                    Array.isArray(
                        page.__medicalUserscriptSourceBackupQueueV1
                    )
                        ? page.__medicalUserscriptSourceBackupQueueV1
                        : [];

                sourceQueue.push(
                    sourceProvider
                );
                page.__medicalUserscriptSourceBackupQueueV1 =
                    sourceQueue;
            }
        } catch (error) {
            console.warn(
                '[脚本源码备份适配] 注册失败：',
                error
            );
        }

        let lastSnapshot = '';

        try {
            lastSnapshot =
                JSON.stringify(
                    suiteBackupExportData()
                );
        } catch (error) {
            lastSnapshot = '';
        }

        setInterval(
            function () {
                let nextSnapshot = '';

                try {
                    nextSnapshot =
                        JSON.stringify(
                            suiteBackupExportData()
                        );
                } catch (error) {
                    return;
                }

                if (
                    nextSnapshot ===
                    lastSnapshot
                ) {
                    return;
                }

                lastSnapshot =
                    nextSnapshot;

                try {
                    const registry =
                        suiteBackupPageWindow()
                            .MedicalUserscriptBackupRegistry;

                    if (
                        registry &&
                        typeof registry.notifyChanged ===
                            'function'
                    ) {
                        registry.notifyChanged(
                            SUITE_BACKUP_ADAPTER_KEY
                        );
                    }
                } catch (error) {
                    // 自动通知失败不影响本地设置。
                }
            },
            12000
        );
    }

    suiteBackupRegister();

})();
