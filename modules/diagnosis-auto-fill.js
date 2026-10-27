// ==UserScript==
// @name         智慧医疗病案首页－诊断列表AI辅助填写
// @namespace    http://tampermonkey.net/
// @version      4.0.8
// @description  v4.0.8：批量同步WebDAV数据备份注册、源码快照版本、源码备份文件名及统一管理器脚本版本信息至4.0.8；保留v4.0.7全局AI密钥校验兼容修复、DeepSeek/智谱GLM/OpenAI全局AI调用适配及其余既有功能
// @match        *://11.12.199.244:8003/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      api.deepseek.com
// @connect      open.bigmodel.cn
// @connect      api.openai.com
// @run-at       document-idle
// ==/UserScript==
(function medicalDiagnosisAutoFillMain() {
    'use strict';
    if (window.top !== window.self) {
        return;
    }

    /*
     * 原生简约深蓝风格配置。
     *
     * 这些参数直接参与本脚本悬浮框的创建，不依赖外部管理器
     * 使用 CSS !important 覆盖。以后需要手工改风格时，只需修改这里。
     */
    const NATIVE_SIMPLE_DARK_BLUE_STYLE = Object.freeze({
        panelWidth: 174,
        panelRadius: 7,
        headerColor: '#117fac',

        /*
         * 操作界面标题栏相对悬浮框标题栏的HSL明度增加值。
         * 0.15表示提高15个百分点；例如可改为0.04、0.08。
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

    /*
     * 在保持色相和饱和度不变的前提下，提高十六进制颜色的HSL明度。
     * lightnessDelta使用0～1的小数，例如0.15表示提高15个百分点。
     */
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


    const IDS = {
        panel: 'medical-diagnosis-auto-fill-panel-v2',
        button: 'medical-diagnosis-auto-fill-button-v2',
        modal: 'medical-diagnosis-auto-fill-modal-v2',
        style: 'medical-diagnosis-auto-fill-style-v2',
        status: 'medical-diagnosis-auto-fill-status-v2'
    };
    const KEYS = {
        apiKey: 'medicalDiagnosisDeepSeekApiKeyV2',
        model: 'medicalDiagnosisDeepSeekModelV2',
        position: 'medicalDiagnosisPanelPositionV2',
        collapsed: 'medicalDiagnosisPanelCollapsedV2',
        draft: 'medicalDiagnosisDraftV2'
    };
    const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

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
        'medicalDiagnosisGlmApiKeyV1';
    const SUITE_GLOBAL_AI_OPENAI_API_KEY_GM_KEY =
        'medicalDiagnosisOpenAiApiKeyV1';
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
        key: 'diagnosis',
        name: '诊断列表AI辅助填写',
        version: '4.0.8',
        getDeepSeekKey: function () {
            return String(GM_getValue(KEYS.apiKey, '') || '').trim();
        },
        setDeepSeekKey: function (value) {
            GM_setValue(KEYS.apiKey, value);
        }
    });

    const DEFAULT_MODEL = 'deepseek-v4-flash';
    const SHARED_LIBRARY_STORAGE_KEY =
        'medicalUserscriptSharedKnowledgeV1';

    const SHARED_LIBRARY_EVENT_NAME =
        'medical-userscript-shared-knowledge-changed';

    const SHARED_LIBRARY_API_NAME =
        'MedicalUserscriptSharedLibrary';

    let sharedDiagnosisLibraryCache = null;
    let sharedDiagnosisLibraryRawCache = '';

    function sharedDiagnosisPlainText(value) {
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

    function normalizeSharedDiagnosisKey(value) {
        return sharedDiagnosisPlainText(value)
            .replace(/[★☆*]/g, '')
            .replace(/[（）()【】\[\]{}]/g, '')
            .replace(/[\s·•・,，;；:：\/\\_-]+/g, '')
            .toLowerCase()
            .trim();
    }

    function normalizeSharedDiagnosisMappings(rawLibrary) {
        const source =
            rawLibrary &&
            typeof rawLibrary === 'object'
                ? rawLibrary
                : {};

        const settings =
            source.settings &&
            typeof source.settings === 'object'
                ? source.settings
                : {};

        const mappings =
            (
                Array.isArray(
                    source.diagnosisMappings
                )
                    ? source.diagnosisMappings
                    : []
            )
                .map(function (item) {
                    const value =
                        item &&
                        typeof item === 'object'
                            ? item
                            : {};

                    const from =
                        sharedDiagnosisPlainText(
                            value.from ||
                            value.source ||
                            value.standardName ||
                            value.diagnosisName ||
                            value.name
                        );

                    const to =
                        sharedDiagnosisPlainText(
                            value.to ||
                            value.target ||
                            value.localName ||
                            value.hospitalName ||
                            value.searchName
                        );

                    if (!from || !to) {
                        return null;
                    }

                    const aliases =
                        (
                            Array.isArray(
                                value.aliases
                            )
                                ? value.aliases
                                : String(
                                    value.aliases ||
                                    value.otherNames ||
                                    ''
                                ).split(/[|｜、,，;；\n]+/)
                        )
                            .map(sharedDiagnosisPlainText)
                            .filter(Boolean);

                    return {
                        from: from,
                        to: to,
                        aliases: aliases,
                        enabled:
                            value.enabled !== false
                    };
                })
                .filter(Boolean);

        return {
            enabled:
                Boolean(
                    settings
                        .enableDiagnosisNameMapping
                ),
            mappings: mappings
        };
    }

    function loadSharedDiagnosisLibrary() {
        let rawText = '{}';

        try {
            rawText =
                localStorage.getItem(
                    SHARED_LIBRARY_STORAGE_KEY
                ) ||
                '{}';
        }
        catch (error) {
            rawText = '{}';
        }

        if (
            sharedDiagnosisLibraryCache &&
            rawText ===
                sharedDiagnosisLibraryRawCache
        ) {
            return sharedDiagnosisLibraryCache;
        }

        try {
            sharedDiagnosisLibraryCache =
                normalizeSharedDiagnosisMappings(
                    JSON.parse(rawText)
                );
        }
        catch (error) {
            sharedDiagnosisLibraryCache =
                normalizeSharedDiagnosisMappings({});
        }

        sharedDiagnosisLibraryRawCache =
            rawText;

        return sharedDiagnosisLibraryCache;
    }

    function clearSharedDiagnosisLibraryCache() {
        sharedDiagnosisLibraryCache = null;
        sharedDiagnosisLibraryRawCache = '';
    }

    function resolveSharedDiagnosisName(value) {
        const original =
            sharedDiagnosisPlainText(value);

        if (!original) {
            return original;
        }

        try {
            const api =
                window[
                    SHARED_LIBRARY_API_NAME
                ];

            if (
                api &&
                typeof api.resolveDiagnosisName ===
                    'function'
            ) {
                const resolved =
                    sharedDiagnosisPlainText(
                        api.resolveDiagnosisName(
                            original
                        )
                    );

                return resolved || original;
            }
        }
        catch (error) {
            /* 管理器接口暂不可用时回退到同一localStorage结构。 */
        }

        const library =
            loadSharedDiagnosisLibrary();

        if (!library.enabled) {
            return original;
        }

        const key =
            normalizeSharedDiagnosisKey(
                original
            );

        const matched =
            library.mappings
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
                                normalizeSharedDiagnosisKey(
                                    name
                                ) === key
                            );
                        });
                });

        return matched
            ? matched.to
            : original;
    }

    document.addEventListener(
        SHARED_LIBRARY_EVENT_NAME,
        clearSharedDiagnosisLibraryCache
    );

    window.addEventListener(
        'storage',
        function (event) {
            if (
                !event ||
                event.key ===
                    SHARED_LIBRARY_STORAGE_KEY
            ) {
                clearSharedDiagnosisLibraryCache();
            }
        }
    );

    const ROLE_OPTIONS = {
        中医: [
            '主病',
            '主证'
        ],
        西医: [
            '主要诊断',
            '次要诊断'
        ]
    };
    const OUTCOME_OPTIONS = [
        '治愈',
        '好转',
        '未愈',
        '死亡',
        '其他'
    ];
    const ADMISSION_OPTIONS = [
        '有',
        '临床未确定',
        '情况不明',
        '无'
    ];
    const state = {
        items: [],
        running: false,
        fillRunning: false,
        paused: false,
        stopRequested: false,
        automationGeneration: 4
    };

    class UserStoppedError extends Error {
        constructor(message) {
            super(message || '用户已中止填写');
            this.name = 'UserStoppedError';
            this.userStopped = true;
        }
    }

    function isUserStoppedError(error) {
        return Boolean(error && (error.userStopped || error.name === 'UserStoppedError'));
    }

    function updateFillControlButtons(modal) {
        if (!modal) {
            return;
        }

        const pauseButton = modal.querySelector('.diag-pause');
        const stopButton = modal.querySelector('.diag-stop');
        const lockedButtons = modal.querySelectorAll(
            '.diag-parse, .diag-ai, .diag-select-all'
        );

        lockedButtons.forEach(function (button) {
            button.disabled = state.fillRunning;
        });

        if (pauseButton) {
            pauseButton.disabled = !state.fillRunning || state.stopRequested;
            pauseButton.textContent = state.paused ? '继续填写' : '暂停填写';
            pauseButton.dataset.paused = state.paused ? 'true' : 'false';
        }

        if (stopButton) {
            stopButton.disabled = !state.fillRunning || state.stopRequested;
            stopButton.textContent = state.stopRequested ? '正在中止…' : '中止填写';
        }
    }

    function resetFillControlState(modal) {
        state.fillRunning = false;
        state.paused = false;
        state.stopRequested = false;
        updateFillControlButtons(modal);
    }

    async function waitForResumeOrStop(modal, rowIndex, itemName, stageText) {
        let pauseStatusShown = false;

        while (state.paused && !state.stopRequested) {
            if (!pauseStatusShown) {
                const detail = stageText || '下一步';
                if (Number.isInteger(rowIndex)) {
                    updateRowStatus(modal, rowIndex, '已暂停，等待继续', 'paused');
                }
                showStatus(
                    '填写已暂停。\n' +
                    '当前位置：' + detail +
                    (itemName ? '（' + itemName + '）' : '') +
                    '。\n点击“继续填写”后从这里继续；点击“中止填写”将结束本次任务，且不会执行底部F3保存。',
                    'normal'
                );
                pauseStatusShown = true;
            }
            await sleep(150);
        }

        if (state.stopRequested) {
            throw new UserStoppedError('用户已中止填写');
        }
    }
    const sleep = function (ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    };
    function normalize(text) {
        return String(text || '')
            .replace(/\s+/g, '')
            .replace(/[：:*＊]/g, '')
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .trim();
    }
    function normalizeCode(text) {
        return String(text || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
    }
    /******************************************************************
    * v4.0 新版HIS诊断自动录入引擎
    *
    * 仅保留脚本外围框架；本区不调用v3.x的自动录入函数。
    * 固定事务顺序：
    * 1. 类别；2. 医院诊断库检索并落值；3. 诊断类型；
    * 4. 出院情况；5. 入院病情；6. 添加并核对临时列表。
    ******************************************************************/
    function v4IsVisible(element) {
        if (!element ||
            !element.isConnected ||
            !element.ownerDocument) {
            return false;
        }
        const win = element.ownerDocument.defaultView;
        const style = win.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 1 &&
            rect.height > 1;
    }

    function v4PlainText(element) {
        return String(element &&
            (element.innerText ||
                element.textContent) || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function v4Documents() {
        const result = [];
        const visited = new Set();
        function collect(doc) {
            if (!doc ||
                visited.has(doc)) {
                return;
            }
            visited.add(doc);
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
                    collect(frame.contentDocument ||
                        frame.contentWindow.document);
                }
                catch (error) {
                    // 不访问跨域框架。
                }
            });
        }
        collect(document);
        return result;
    }

    function v4Click(element) {
        if (!element) {
            throw new Error('点击目标为空');
        }
        const win = element.ownerDocument.defaultView;
        try {
            element.scrollIntoView({
                block: 'center',
                inline: 'nearest',
                behavior: 'auto'
            });
        }
        catch (error) {
            // 旧浏览器不支持完整scrollIntoView参数时继续点击。
        }
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (type) {
            const EventConstructor = type.indexOf('pointer') === 0 &&
                win.PointerEvent
                ? win.PointerEvent
                : win.MouseEvent;
            element.dispatchEvent(new EventConstructor(type, {
                bubbles: true,
                cancelable: true,
                view: win,
                button: 0,
                buttons: type.indexOf('down') >= 0
                    ? 1
                    : 0
            }));
        });
        element.click();
    }

    function v4DoubleClick(element) {
        const win = element.ownerDocument.defaultView;
        v4Click(element);
        v4Click(element);
        element.dispatchEvent(new win.MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: win,
            detail: 2
        }));
    }

    function v4PressKey(element, key, code) {
        const win = element.ownerDocument.defaultView;
        const options = {
            bubbles: true,
            cancelable: true,
            key: key,
            code: key,
            keyCode: code,
            which: code
        };
        element.dispatchEvent(new win.KeyboardEvent('keydown', options));
        element.dispatchEvent(new win.KeyboardEvent('keyup', options));
    }

    function v4TextElements(doc, targetText, scope) {
        const root = scope ||
            doc.body;
        const target = normalize(targetText);
        if (!root ||
            !target) {
            return [];
        }
        const exact = [];
        const partial = [];
        const walker = doc.createTreeWalker(root, doc.defaultView.NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent ||
                !v4IsVisible(parent)) {
                continue;
            }
            const text = normalize(node.nodeValue);
            if (text === target) {
                exact.push(parent);
            }
            else if (text.includes(target)) {
                partial.push(parent);
            }
        }
        const matches = exact.length
            ? exact
            : partial;
        return matches.filter(function (element, index) {
            return matches.indexOf(element) === index;
        });
    }

    function v4Clickable(element) {
        return element &&
            (element.closest('button,a,label,li,[role="button"],[role="tab"],[onclick]') ||
                element);
    }

    function v4CurrentTabSelected(element) {
        let current = element;
        for (let level = 0; current && level < 3; level += 1) {
            const classes = String(current.className || '').toLowerCase();
            if (/active|selected|current/.test(classes) ||
                current.getAttribute('aria-selected') === 'true') {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    async function activateDiagnosisTab() {
        const candidates = [];
        v4Documents().forEach(function (doc) {
            v4TextElements(doc, '诊断列表').forEach(function (label) {
                const target = v4Clickable(label);
                const rect = target.getBoundingClientRect();
                candidates.push({
                    target: target,
                    score: rect.top * 4 +
                        rect.left -
                        (/A|BUTTON|LI/.test(target.tagName)
                            ? 1000
                            : 0)
                });
            });
        });
        if (!candidates.length) {
            throw new Error('未找到“诊断列表”标签页');
        }
        candidates.sort(function (a, b) {
            return a.score - b.score;
        });
        if (!v4CurrentTabSelected(candidates[0].target)) {
            v4Click(candidates[0].target);
            await sleep(600);
        }
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            if (v4LocateForm()) {
                return;
            }
            await sleep(150);
        }
        throw new Error('已点击诊断列表，但新版右侧录入表单未出现');
    }

    function v4ContainsFormLabels(root) {
        const text = normalize(v4PlainText(root));
        return text.includes('类别') &&
            text.includes('诊断类型') &&
            text.includes('出院诊断') &&
            text.includes('出院情况') &&
            text.includes('入院病情') &&
            (text.includes('添加诊断') ||
                text.includes('新增诊断') ||
                text.includes('保存'));
    }

    function v4LocateForm() {
        const forms = [];
        v4Documents().forEach(function (doc) {
            v4TextElements(doc, '出院诊断').forEach(function (label) {
                let root = label.parentElement;
                for (let level = 0; root && level < 12; level += 1) {
                    if (v4ContainsFormLabels(root)) {
                        const rect = root.getBoundingClientRect();
                        forms.push({
                            doc: doc,
                            root: root,
                            area: rect.width * rect.height,
                            rightBias: -rect.left
                        });
                        break;
                    }
                    root = root.parentElement;
                }
            });
        });
        forms.sort(function (a, b) {
            return a.area - b.area ||
                a.rightBias - b.rightBias;
        });
        return forms[0] ||
            null;
    }

    function v4FieldLabel(context, labelText) {
        const matches = v4TextElements(context.doc, labelText, context.root);
        const target = normalize(labelText);
        const controls = v4VisibleFieldControls(context.root);
        const ranked = matches.map(function (element) {
            const rect = element.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const exact = normalize(v4PlainText(element)) === target;
            const inTableHeader = Boolean(element.closest('thead,th'));
            const nearby = controls.map(function (control) {
                const visual = v4ControlVisual(control);
                if (!visual ||
                    !v4IsVisible(visual) ||
                    element.contains(visual)) {
                    return null;
                }
                const controlRect = visual.getBoundingClientRect();
                const controlCenterY = controlRect.top + controlRect.height / 2;
                if (controlRect.left < rect.right - 12 ||
                    controlRect.left > rect.right + 950 ||
                    Math.abs(controlCenterY - centerY) > 65) {
                    return null;
                }
                let score = Math.abs(controlCenterY - centerY) * 100 +
                    Math.max(0, controlRect.left - rect.right);
                if (target === '出院诊断' &&
                    control.matches('input:not([readonly]),textarea,[contenteditable="true"]')) {
                    score -= 15000;
                }
                return score;
            }).filter(function (value) {
                return value !== null;
            });
            nearby.sort(function (a, b) {
                return a - b;
            });
            return {
                element: element,
                hasNearbyControl: nearby.length > 0,
                score: (exact ? -30000 : 0) +
                    (inTableHeader ? 250000 : 0) +
                    (nearby.length ? nearby[0] - 120000 : 80000) -
                    rect.left * 8
            };
        });
        ranked.sort(function (a, b) {
            return a.score - b.score;
        });
        return ranked[0]
            ? ranked[0].element
            : null;
    }

    function v4VisibleFieldControls(root) {
        return Array.from(root.querySelectorAll(
            'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]),' +
            'textarea,[contenteditable="true"],select,.layui-form-select,.select2-container,.textbox.combo,' +
            '.combo,[role="combobox"]'
        )).filter(function (element) {
            if (element.matches('select') &&
                !v4IsVisible(element)) {
                return true;
            }
            return v4IsVisible(element);
        });
    }

    function v4FindFieldRow(context, labelText) {
        const label = v4FieldLabel(context, labelText);
        if (!label) {
            throw new Error('未找到字段标签“' + labelText + '”');
        }
        const labelRect = label.getBoundingClientRect();
        const candidates = [];
        let current = label.parentElement;
        for (let level = 0; current && current !== context.root.parentElement; level += 1) {
            const controls = v4VisibleFieldControls(current);
            const usable = controls.filter(function (control) {
                const visual = control.matches('select') &&
                    !v4IsVisible(control)
                    ? control.nextElementSibling
                    : control;
                if (!visual ||
                    !v4IsVisible(visual)) {
                    return false;
                }
                const rect = visual.getBoundingClientRect();
                const centerY = rect.top + rect.height / 2;
                const labelCenterY = labelRect.top + labelRect.height / 2;
                return rect.left >= labelRect.left - 20 &&
                    Math.abs(centerY - labelCenterY) <= 55;
            });
            if (usable.length) {
                const rect = current.getBoundingClientRect();
                candidates.push({
                    root: current,
                    controls: usable,
                    score: rect.width * rect.height +
                        level * 2000
                });
            }
            if (current === context.root) {
                break;
            }
            current = current.parentElement;
        }
        if (!candidates.length) {
            /*
            * 新版页面可能把标签列和输入列放在两个并列容器中，
            * 直到很高层祖先才汇合。此时不再依赖祖先结构，直接按
            * “标签右侧 + 同一水平行”从当前表单内选择控件。
            */
            const globalControls = v4VisibleFieldControls(context.root)
                .filter(function (control) {
                    const visual = v4ControlVisual(control);
                    if (!visual ||
                        !v4IsVisible(visual) ||
                        label.contains(visual)) {
                        return false;
                    }
                    const rect = visual.getBoundingClientRect();
                    const centerY = rect.top + rect.height / 2;
                    const labelCenterY = labelRect.top + labelRect.height / 2;
                    return rect.left >= labelRect.right - 12 &&
                        rect.left <= labelRect.right + 950 &&
                        Math.abs(centerY - labelCenterY) <= 70;
                });
            if (globalControls.length) {
                let commonRoot = label.parentElement;
                const firstVisual = v4ControlVisual(globalControls[0]);
                while (commonRoot &&
                    commonRoot !== context.root &&
                    !commonRoot.contains(firstVisual)) {
                    commonRoot = commonRoot.parentElement;
                }
                return {
                    label: label,
                    root: commonRoot || context.root,
                    controls: globalControls
                };
            }
            const rect = label.getBoundingClientRect();
            throw new Error('已定位右侧“' + labelText +
                '”标签（x=' + Math.round(rect.left) +
                '，y=' + Math.round(rect.top) +
                '），但其右侧同一水平行没有可填写控件');
        }
        candidates.sort(function (a, b) {
            return a.score - b.score;
        });
        return {
            label: label,
            root: candidates[0].root,
            controls: candidates[0].controls
        };
    }

    function v4ControlVisual(control) {
        if (!control) {
            return null;
        }
        if (control.matches('select') &&
            !v4IsVisible(control)) {
            const siblings = [
                control.nextElementSibling,
                control.previousElementSibling
            ];
            const visual = siblings.find(function (element) {
                return element &&
                    v4IsVisible(element);
            });
            return visual ||
                control;
        }
        return control;
    }

    function v4ChooseFieldControl(row, labelText) {
        const labelRect = row.label.getBoundingClientRect();
        const labelCenterY = labelRect.top + labelRect.height / 2;
        const ranked = row.controls.map(function (control) {
            const visual = v4ControlVisual(control);
            const rect = visual.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            let score = Math.abs(centerY - labelCenterY) * 100 +
                Math.max(0, rect.left - labelRect.right);
            if (rect.left < labelRect.left) {
                score += 50000;
            }
            if (normalize(labelText) === '出院诊断' &&
                control.matches('input:not([readonly]),textarea')) {
                score -= 10000;
            }
            return {
                control: control,
                visual: visual,
                score: score
            };
        });
        ranked.sort(function (a, b) {
            return a.score - b.score;
        });
        return ranked[0] ||
            null;
    }

    function v4Field(context, labelText) {
        const row = v4FindFieldRow(context, labelText);
        const chosen = v4ChooseFieldControl(row, labelText);
        if (!chosen) {
            throw new Error('未定位“' + labelText + '”控件');
        }
        const nativeSelect = chosen.control.matches('select')
            ? chosen.control
            : Array.from(row.root.querySelectorAll('select')).find(function (select) {
                return !select.disabled;
            }) || null;
        const input = chosen.control.matches('input,textarea')
            ? chosen.control
            : chosen.visual.querySelector &&
                chosen.visual.querySelector('input:not([type="hidden"]),textarea');
        return {
            labelText: labelText,
            row: row.root,
            label: row.label,
            control: chosen.control,
            visual: chosen.visual,
            input: input || null,
            select: nativeSelect
        };
    }

    function v4RadioText(context, radio) {
        const parts = [
            radio.value,
            radio.getAttribute('data-value'),
            radio.getAttribute('aria-label')
        ];
        if (radio.labels) {
            Array.from(radio.labels).forEach(function (label) {
                parts.push(v4PlainText(label));
            });
        }
        const parentLabel = radio.closest('label');
        if (parentLabel) {
            parts.push(v4PlainText(parentLabel));
        }
        if (radio.nextSibling &&
            radio.nextSibling.nodeType === 3) {
            parts.push(radio.nextSibling.nodeValue);
        }
        if (radio.nextElementSibling) {
            parts.push(v4PlainText(radio.nextElementSibling));
        }
        return parts.map(normalize).filter(Boolean);
    }

    function v4FindCategoryRadio(context, category) {
        const target = normalize(category);
        const radios = Array.from(context.root.querySelectorAll('input[type="radio"]'));
        const exact = radios.find(function (radio) {
            return v4RadioText(context, radio).some(function (text) {
                return text === target;
            });
        });
        if (exact) {
            return exact;
        }
        const labels = v4TextElements(context.doc, category, context.root);
        if (!labels.length ||
            !radios.length) {
            return null;
        }
        const labelRect = labels[0].getBoundingClientRect();
        const labelX = labelRect.left + labelRect.width / 2;
        const labelY = labelRect.top + labelRect.height / 2;
        const ranked = radios.map(function (radio) {
            const visual = radio.nextElementSibling &&
                v4IsVisible(radio.nextElementSibling)
                ? radio.nextElementSibling
                : radio;
            const rect = visual.getBoundingClientRect();
            return {
                radio: radio,
                score: Math.abs(rect.left + rect.width / 2 - labelX) +
                    Math.abs(rect.top + rect.height / 2 - labelY) * 4
            };
        }).sort(function (a, b) {
            return a.score - b.score;
        });
        return ranked[0]
            ? ranked[0].radio
            : null;
    }

    async function v4SetCategory(context, category) {
        let current = v4LocateForm() || context;
        const radio = v4FindCategoryRadio(current, category);
        if (!radio) {
            throw new Error('未找到类别“' + category + '”的radio');
        }
        if (radio.checked) {
            return current;
        }
        const visual = radio.labels &&
            radio.labels[0] ||
            radio.nextElementSibling &&
            v4IsVisible(radio.nextElementSibling) &&
            radio.nextElementSibling ||
            radio.closest('label') ||
            radio;
        v4Click(visual);
        const deadline = Date.now() + 4500;
        while (Date.now() < deadline) {
            current = v4LocateForm() || current;
            const refreshed = v4FindCategoryRadio(current, category);
            if (refreshed &&
                refreshed.checked) {
                await sleep(260);
                return v4LocateForm() || current;
            }
            await sleep(120);
        }
        throw new Error('类别“' + category + '”点击后未保持选中');
    }

    function v4CurrentFieldText(field) {
        if (field.input &&
            String(field.input.value || '').trim()) {
            return String(field.input.value).trim();
        }
        const selected = field.visual.querySelector &&
            field.visual.querySelector('.layui-this,.select2-selection__rendered,' +
                '.combobox-item-selected,[aria-selected="true"],.selected');
        if (selected) {
            return v4PlainText(selected);
        }
        if (field.visual &&
            field.visual !== field.select &&
            v4IsVisible(field.visual)) {
            const visualText = v4PlainText(field.visual);
            if (visualText) {
                return visualText;
            }
        }
        if (field.select) {
            const option = field.select.options[field.select.selectedIndex];
            if (option) {
                return String(option.textContent || '').trim();
            }
        }
        return v4PlainText(field.visual);
    }

    function v4FindPopupOption(field, desiredText) {
        const target = normalize(desiredText);
        const controlRect = field.visual.getBoundingClientRect();
        const selectors = [
            '.layui-form-select dl dd',
            '.select2-results__option',
            '.combobox-item',
            '.dropdown-menu li',
            '.dropdown-item',
            '[role="option"]',
            '.el-select-dropdown__item',
            '.ant-select-item-option',
            '.ivu-select-item'
        ].join(',');
        const candidates = Array.from(field.visual.ownerDocument.querySelectorAll(selectors))
            .filter(v4IsVisible)
            .filter(function (option) {
                return normalize(v4PlainText(option)) === target &&
                    !/disabled/.test(String(option.className || '').toLowerCase()) &&
                    option.getAttribute('aria-disabled') !== 'true';
            })
            .map(function (option) {
                const rect = option.getBoundingClientRect();
                return {
                    option: option,
                    score: Math.abs(rect.left - controlRect.left) +
                        Math.abs(rect.top - controlRect.bottom) * 2
                };
            });
        candidates.sort(function (a, b) {
            return a.score - b.score;
        });
        return candidates[0]
            ? candidates[0].option
            : null;
    }

    function v4FindEasyUiFieldWidget(field) {
        const doc = field.visual.ownerDocument;
        const win = doc.defaultView;
        const $ = win.jQuery;
        if (!$ ||
            !$.fn) {
            return null;
        }
        const visibleInput = field.input ||
            field.visual.querySelector &&
                field.visual.querySelector('input:not([type="hidden"])');
        const originals = Array.from(field.row.querySelectorAll(
            '.combobox-f,.combogrid-f,.combo-f,.easyui-combobox,.easyui-combogrid'
        ));
        for (const element of originals) {
            for (const method of ['combobox', 'combogrid']) {
                if (typeof $.fn[method] !== 'function') {
                    continue;
                }
                try {
                    const wrapped = $(element);
                    const textbox = wrapped[method]('textbox');
                    const textboxElement = textbox &&
                        textbox[0];
                    if (visibleInput) {
                        if (textboxElement !== visibleInput) {
                            continue;
                        }
                    }
                    else if (!textboxElement ||
                        !field.visual.contains(textboxElement)) {
                        continue;
                    }
                    const options = wrapped[method]('options') || {};
                    let data = [];
                    if (method === 'combobox') {
                        data = wrapped.combobox('getData') || [];
                    }
                    return {
                        element: element,
                        method: method,
                        wrapped: wrapped,
                        options: options,
                        data: Array.isArray(data) ? data : []
                    };
                }
                catch (error) {
                    // 继续识别其他组件。
                }
            }
        }
        return null;
    }

    function v4RowText(row, options) {
        if (row === null ||
            row === undefined) {
            return '';
        }
        if (typeof row !== 'object') {
            return String(row);
        }
        const keys = [
            options && options.textField,
            'text', 'label', 'name', 'Name', 'mc', 'MC'
        ].filter(Boolean);
        for (const key of keys) {
            if (row[key] !== undefined &&
                row[key] !== null &&
                String(row[key]).trim()) {
                return String(row[key]);
            }
        }
        return '';
    }

    function v4RowValue(row, options) {
        if (row === null ||
            row === undefined ||
            typeof row !== 'object') {
            return row;
        }
        const keys = [
            options && options.valueField,
            'value', 'id', 'code', 'Value', 'ID'
        ].filter(Boolean);
        for (const key of keys) {
            if (row[key] !== undefined &&
                row[key] !== null) {
                return row[key];
            }
        }
        return undefined;
    }

    async function v4SelectDropdown(context, labelText, desiredText) {
        let current = v4LocateForm() || context;
        let field = v4Field(current, labelText);
        if (normalize(v4CurrentFieldText(field)) === normalize(desiredText)) {
            return current;
        }
        const clickTarget = field.input ||
            field.visual.querySelector &&
                field.visual.querySelector('.layui-select-title,.select2-selection,' +
                    '.textbox-text,.combo-text,[role="combobox"]') ||
            field.visual;
        if (v4IsVisible(clickTarget)) {
            v4Click(clickTarget);
            await sleep(180);
            const option = v4FindPopupOption(field, desiredText);
            if (option) {
                v4Click(option);
                await sleep(260);
                current = v4LocateForm() || current;
                field = v4Field(current, labelText);
                if (normalize(v4CurrentFieldText(field)) === normalize(desiredText)) {
                    return current;
                }
            }
        }
        const widget = v4FindEasyUiFieldWidget(field);
        if (widget) {
            const row = widget.data.find(function (item) {
                return normalize(v4RowText(item, widget.options)) === normalize(desiredText);
            });
            const value = v4RowValue(row, widget.options);
            if (row &&
                value !== undefined) {
                if (widget.method === 'combobox') {
                    widget.wrapped.combobox('select', value);
                }
                else {
                    widget.wrapped.combogrid('setValue', value);
                }
                await sleep(280);
            }
        }
        current = v4LocateForm() || current;
        field = v4Field(current, labelText);
        if (normalize(v4CurrentFieldText(field)) === normalize(desiredText)) {
            return current;
        }
        if (field.select) {
            const option = Array.from(field.select.options).find(function (item) {
                return normalize(item.textContent) === normalize(desiredText);
            });
            if (option) {
                field.select.value = option.value;
                const win = current.doc.defaultView;
                field.select.dispatchEvent(new win.Event('input', { bubbles: true }));
                field.select.dispatchEvent(new win.Event('change', { bubbles: true }));
                await sleep(300);
            }
        }
        current = v4LocateForm() || current;
        field = v4Field(current, labelText);
        if (normalize(v4CurrentFieldText(field)) !== normalize(desiredText)) {
            throw new Error('“' + labelText + '”无法选择“' + desiredText +
                '”；当前显示“' + (v4CurrentFieldText(field) || '空') + '”');
        }
        return current;
    }

    function v4LookupInput(context) {
        const field = v4Field(context, '出院诊断');
        const input = field.input ||
            field.control.matches('input,textarea') &&
                field.control;
        if (!input) {
            throw new Error('未找到“出院诊断”检索输入框');
        }
        if (input.type &&
            /hidden|radio|checkbox/.test(input.type)) {
            throw new Error('“出院诊断”定位到了非文本控件');
        }
        return input;
    }

    function v4SetInputValue(input, value) {
        const doc = input.ownerDocument;
        const win = doc.defaultView;
        const text = String(value || '');
        v4Click(input);
        try {
            input.focus({ preventScroll: true });
        }
        catch (error) {
            input.focus();
        }
        let inserted = false;
        try {
            input.select();
            inserted = Boolean(doc.execCommand &&
                doc.execCommand('insertText', false, text));
        }
        catch (error) {
            inserted = false;
        }
        if (!inserted ||
            String(input.value || '') !== text) {
            const prototype = input instanceof win.HTMLTextAreaElement
                ? win.HTMLTextAreaElement.prototype
                : win.HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
            if (descriptor &&
                descriptor.set) {
                descriptor.set.call(input, text);
            }
            else {
                input.value = text;
            }
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
        }
        input.setAttribute('value', text);
    }

    function v4FireCompleteLookupEvents(input) {
        const doc = input.ownerDocument;
        const win = doc.defaultView;
        const $ = win.jQuery;
        const value = String(input.value || '');
        const last = value.slice(-1);
        const code = /[\u3400-\u9fff]/.test(last)
            ? 229
            : last
                ? last.toUpperCase().charCodeAt(0)
                : 0;
        if ($ &&
            $.Event) {
            $(input)
                .val(value)
                .trigger('input')
                .trigger('change')
                .trigger($.Event('keyup', {
                    key: last,
                    keyCode: code,
                    which: code
                }));
        }
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
        input.dispatchEvent(new win.KeyboardEvent('keyup', {
            bubbles: true,
            cancelable: true,
            key: last,
            keyCode: code,
            which: code
        }));
        try {
            const propertyEvent = new win.Event('propertychange', {
                bubbles: true
            });
            Object.defineProperty(propertyEvent, 'propertyName', {
                configurable: true,
                value: 'value'
            });
            input.dispatchEvent(propertyEvent);
        }
        catch (error) {
            // 现代浏览器不支持propertychange时忽略。
        }
    }

    function v4TriggerLookupPlugin(input, term) {
        const doc = input.ownerDocument;
        const win = doc.defaultView;
        const $ = win.jQuery;
        const used = [];
        if (!$ ||
            !$.fn) {
            return used;
        }
        try {
            const autocomplete = $(input).data('ui-autocomplete') ||
                $(input).data('autocomplete');
            if (autocomplete &&
                typeof autocomplete.search === 'function') {
                autocomplete.search(term);
                used.push('autocomplete.search');
            }
        }
        catch (error) {
            // 继续尝试其他组件。
        }
        try {
            const typeahead = $(input).data('typeahead') ||
                $(input).data('bs.typeahead');
            if (typeahead &&
                typeof typeahead.lookup === 'function') {
                typeahead.lookup();
                used.push('typeahead.lookup');
            }
        }
        catch (error) {
            // 继续尝试EasyUI。
        }
        const originals = Array.from(doc.querySelectorAll(
            '.combogrid-f,.combobox-f,.combo-f,.easyui-combogrid,.easyui-combobox'
        ));
        originals.some(function (element) {
            return ['combogrid', 'combobox'].some(function (method) {
                if (typeof $.fn[method] !== 'function') {
                    return false;
                }
                try {
                    const wrapped = $(element);
                    const textbox = wrapped[method]('textbox');
                    if (!textbox ||
                        textbox[0] !== input) {
                        return false;
                    }
                    const options = wrapped[method]('options') || {};
                    const query = options.keyHandler &&
                        options.keyHandler.query;
                    if (typeof query === 'function') {
                        try {
                            wrapped[method]('showPanel');
                        }
                        catch (error) {
                            // 面板已打开时可忽略。
                        }
                        query.call(element, term);
                        used.push(method + '.keyHandler.query');
                        return true;
                    }
                }
                catch (error) {
                    return false;
                }
                return false;
            });
        });
        return used;
    }

    function v4LookupPanel(input) {
        const doc = input.ownerDocument;
        const inputRect = input.getBoundingClientRect();
        const selector = [
            '.datagrid-view', '.datagrid', '[role="grid"]',
            '.autocomplete-suggestions', '.dropdown-menu',
            '.select2-dropdown', '.layui-table-view', 'table'
        ].join(',');
        const candidates = Array.from(doc.querySelectorAll(selector))
            .filter(v4IsVisible)
            .map(function (panel) {
                const text = normalize(v4PlainText(panel)).toLowerCase();
                const rect = panel.getBoundingClientRect();
                const hasHeader = text.includes('名称') &&
                    text.includes('拼音') &&
                    (text.includes('icd10') ||
                        text.includes('icd'));
                const distance = Math.abs(rect.left - inputRect.left) +
                    Math.min(Math.abs(rect.top - inputRect.bottom),
                        Math.abs(rect.bottom - inputRect.top));
                return {
                    panel: panel,
                    hasHeader: hasHeader,
                    distance: distance,
                    area: rect.width * rect.height
                };
            })
            .filter(function (entry) {
                return entry.hasHeader ||
                    entry.distance < 500;
            });
        candidates.sort(function (a, b) {
            return Number(b.hasHeader) - Number(a.hasHeader) ||
                a.distance - b.distance ||
                a.area - b.area;
        });
        return candidates[0]
            ? candidates[0].panel
            : null;
    }

    function v4ExtractCodes(text) {
        return (String(text || '').toUpperCase()
            .match(/\b[A-Z][A-Z0-9.\-]{2,20}\b/g) || [])
            .filter(function (value) {
                return /\d/.test(value);
            });
    }

    function v4LookupRowParts(row) {
        const cells = Array.from(row.querySelectorAll('td,[role="gridcell"]'))
            .filter(v4IsVisible);
        const texts = cells.length
            ? cells.map(v4PlainText)
            : [v4PlainText(row)];
        const fullText = texts.join(' ');
        return {
            cells: cells,
            texts: texts,
            fullText: fullText,
            normalized: normalize(fullText),
            codes: v4ExtractCodes(fullText).map(normalizeCode)
        };
    }

    function v4TargetNames(item, term) {
        const names = [];
        function add(value) {
            const text = normalize(cleanDiagnosisText(value || ''))
                .toLowerCase();
            if (text && !names.includes(text)) {
                names.push(text);
            }
        }
        [
            item.standardName,
            item.searchName,
            cleanDiagnosisText(item.sourceName),
            term
        ].forEach(function (value) {
            add(value);
            add(resolveSharedDiagnosisName(value));
        });
        return names;
    }

    function v4NamesCompatible(candidateName, targetNames) {
        const candidate = normalize(cleanDiagnosisText(candidateName || ''))
            .toLowerCase();
        if (!candidate) {
            return false;
        }
        return targetNames.some(function (name) {
            if (candidate === name) {
                return true;
            }
            /*
             * HIS候选有时会在标准名称后附加分型文字。
             * 只对长度较充足的诊断名称允许包含匹配，
             * 避免短词把默认列表中的无关项目误判为目标。
             */
            return Math.min(candidate.length, name.length) >= 3 &&
                (candidate.includes(name) || name.includes(candidate));
        });
    }

    function v4CodesCompatible(candidateCodes, expectedCode) {
        const expected = normalizeCode(expectedCode);
        if (!expected) {
            return false;
        }
        return (candidateCodes || []).some(function (value) {
            const candidate = normalizeCode(value);
            if (!candidate) {
                return false;
            }
            return candidate === expected ||
                (Math.min(candidate.length, expected.length) >= 3 &&
                    (candidate.startsWith(expected) ||
                        expected.startsWith(candidate)));
        });
    }

    function v4CandidateMatchesItem(parts, item, term) {
        const firstCellName = parts && parts.texts
            ? String(parts.texts[0] || '')
            : '';
        const nameMatch = v4NamesCompatible(
            firstCellName,
            v4TargetNames(item, term)
        );
        const codeMatch = v4CodesCompatible(
            parts && parts.codes,
            item.systemCode
        );
        return {
            matched: Boolean(nameMatch || codeMatch),
            nameMatch: nameMatch,
            codeMatch: codeMatch,
            candidateName: firstCellName
        };
    }

    function v4LookupRows(input, item, term) {
        const panel = v4LookupPanel(input);
        if (!panel) {
            return [];
        }
        const selector = [
            'tbody tr', '.datagrid-row', '[role="row"]',
            '.autocomplete-suggestion', '.dropdown-menu li',
            '.select2-results__option', '[role="option"]'
        ].join(',');
        const seen = new Set();
        return Array.from(panel.querySelectorAll(selector))
            .filter(v4IsVisible)
            .filter(function (row) {
                if (seen.has(row)) {
                    return false;
                }
                seen.add(row);
                const parts = v4LookupRowParts(row);
                const text = parts.normalized.toLowerCase();
                if (!text ||
                    (text.includes('名称') && text.includes('拼音') && text.includes('icd')) ||
                    /没有找到.*相关数据|未找到.*相关数据|暂无相关数据|无相关数据/.test(text) ||
                    /^(主病|主证|主要诊断|次要诊断)$/.test(text)) {
                    return false;
                }
                /*
                 * 三列表格只证明它“像候选”，不证明它是目标诊断。
                 * 未带检索词的默认列表会从 A00.000 开始，
                 * 因此此处必须使用名称/ICD硬匹配。
                 */
                return v4CandidateMatchesItem(parts, item, term).matched;
            });
    }

    function v4ScoreLookupRow(row, input, item, term) {
        const parts = v4LookupRowParts(row);
        const first = normalize(parts.texts[0]).toLowerCase();
        const names = v4TargetNames(item, term);
        const expectedCode = normalizeCode(item.systemCode);
        const rect = row.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        let score = Math.abs(rect.top - inputRect.bottom) +
            Math.abs(rect.left - inputRect.left) / 3;
        if (expectedCode &&
            parts.codes.includes(expectedCode)) {
            score -= 6000;
        }
        names.forEach(function (name, index) {
            if (first === name) {
                score -= 5000 - index * 250;
            }
            else if (first.includes(name) ||
                name.includes(first)) {
                score -= 2200 - index * 120;
            }
            else if (parts.normalized.toLowerCase().includes(name)) {
                score -= 900;
            }
        });
        return score;
    }

    async function v4WaitLookupRows(input, item, term) {
        const startedAt = Date.now();
        const deadline = startedAt + 7000;
        let eventStage = 0;
        let pluginTrace = [];
        while (Date.now() < deadline) {
            const rows = v4LookupRows(input, item, term);
            if (rows.length) {
                return {
                    rows: rows,
                    trace: pluginTrace
                };
            }
            const elapsed = Date.now() - startedAt;
            if (eventStage < 1 &&
                elapsed >= 350) {
                eventStage = 1;
                v4FireCompleteLookupEvents(input);
                pluginTrace.push('完整input/change/keyup/propertychange');
            }
            if (eventStage < 2 &&
                elapsed >= 1150) {
                eventStage = 2;
                pluginTrace = pluginTrace.concat(v4TriggerLookupPlugin(input, term));
            }
            if (eventStage < 3 &&
                elapsed >= 2600) {
                eventStage = 3;
                v4SetInputValue(input, term);
                v4FireCompleteLookupEvents(input);
                pluginTrace.push('二次完整检索事件');
            }
            await sleep(120);
        }
        return {
            rows: [],
            trace: pluginTrace
        };
    }

    function v4FormHiddenSnapshot(context) {
        return Array.from(context.root.querySelectorAll(
            'input[type="hidden"],select'
        )).map(function (element) {
            return String(element.value || '');
        }).join('|');
    }

    async function v4CommitLookupRow(context, input, row, item, term) {
        const parts = v4LookupRowParts(row);
        const compatibility = v4CandidateMatchesItem(parts, item, term);
        if (!compatibility.matched) {
            throw new Error('候选“' +
                (compatibility.candidateName || v4PlainText(row)) +
                '”与目标诊断“' +
                (item.standardName || item.searchName || item.sourceName) +
                '”的名称/ICD均不匹配，已阻止点击');
        }
        const expectedName = String(parts.texts[0] || '').trim();
        const beforeHidden = v4FormHiddenSnapshot(context);
        const target = parts.cells[0] ||
            row;
        v4Click(target);
        await sleep(380);
        let panel = v4LookupPanel(input);
        let hiddenChanged = v4FormHiddenSnapshot(v4LocateForm() || context) !== beforeHidden;
        if (panel &&
            v4IsVisible(row) &&
            !hiddenChanged) {
            v4DoubleClick(row);
            await sleep(420);
            panel = v4LookupPanel(input);
            hiddenChanged = v4FormHiddenSnapshot(v4LocateForm() || context) !== beforeHidden;
        }
        if (panel &&
            v4IsVisible(row) &&
            !hiddenChanged) {
            input.focus();
            v4PressKey(input, 'Enter', 13);
            await sleep(380);
        }
        const current = v4LocateForm() || context;
        const currentInput = v4LookupInput(current);
        const value = String(currentInput.value || '').trim();
        const normalizedValue = normalize(value);
        const normalizedExpected = normalize(expectedName);
        if (!value) {
            throw new Error('医院诊断候选点击后未写入“出院诊断”');
        }
        if (normalizedExpected &&
            normalizedValue !== normalizedExpected &&
            !normalizedExpected.includes(normalizedValue) &&
            !normalizedValue.includes(normalizedExpected)) {
            throw new Error('候选点击后检索框为“' + value +
                '”，与候选“' + expectedName + '”不一致');
        }
        v4PressKey(currentInput, 'Escape', 27);
        return {
            name: expectedName ||
                value ||
                item.standardName,
            code: String(parts.texts[parts.texts.length - 1] ||
                item.systemCode || '').trim(),
            inputValue: value,
            term: term
        };
    }

    function v4SearchTerms(item) {
        const terms = [];
        function add(value) {
            const text = String(value || '').trim();
            if (text &&
                !terms.some(function (existing) {
                    return normalize(existing) === normalize(text);
                })) {
                terms.push(text);
            }
        }
        [
            item.standardName,
            item.searchName,
            cleanDiagnosisText(item.sourceName)
        ].forEach(function (value) {
            add(resolveSharedDiagnosisName(value));
        });
        [
            item.standardName,
            item.searchName,
            cleanDiagnosisText(item.sourceName),
            item.systemCode
        ].forEach(add);
        return terms;
    }

    async function v4SelectDiagnosis(context, item) {
        let current = context;
        const traces = [];
        for (const term of v4SearchTerms(item)) {
            current = v4LocateForm() || current;
            const input = v4LookupInput(current);
            v4PressKey(input, 'Escape', 27);
            v4SetInputValue(input, term);
            const lookup = await v4WaitLookupRows(input, item, term);
            traces.push(term + ':' + (lookup.trace.join('+') || '原生输入'));
            if (!lookup.rows.length) {
                continue;
            }
            const ranked = lookup.rows.filter(function (row) {
                /* 点击前再独立复核，不信任上一层返回的候选集。 */
                return v4CandidateMatchesItem(
                    v4LookupRowParts(row),
                    item,
                    term
                ).matched;
            }).map(function (row) {
                return {
                    row: row,
                    score: v4ScoreLookupRow(row, input, item, term)
                };
            }).sort(function (a, b) {
                return a.score - b.score;
            });
            if (!ranked[0]) {
                continue;
            }
            try {
                return await v4CommitLookupRow(current, input, ranked[0].row, item, term);
            }
            catch (error) {
                console.warn('[诊断自动填写v4] 候选未落值，尝试下一个检索名称：', error);
            }
        }
        throw new Error('医院诊断库未找到与目标名称或ICD匹配的候选' +
            '（已拒绝默认首项）；已尝试：' + traces.join('；'));
    }

    function v4BuildMatchKeys(item, selected) {
        const names = [
            item.sourceName,
            item.searchName,
            item.standardName,
            selected && selected.name,
            selected && selected.inputValue
        ].map(function (value) {
            return normalize(cleanDiagnosisText(value || ''))
                .toLowerCase();
        }).filter(Boolean);
        const codes = [
            item.systemCode,
            selected && selected.code
        ].map(normalizeCode).filter(Boolean);
        return {
            names: Array.from(new Set(names)),
            codes: Array.from(new Set(codes))
        };
    }

    function v4IsLookupContainer(element) {
        const text = normalize(v4PlainText(element)).toLowerCase();
        return text.includes('名称') &&
            text.includes('拼音') &&
            text.includes('icd');
    }

    function v4HasDiagnosisListHeaders(element) {
        const text = normalize(v4PlainText(element));
        return text.includes('诊断类别') &&
            text.includes('出院诊断') &&
            text.includes('疾病编码') &&
            text.includes('诊断类型');
    }

    function v4DiagnosisRowCells(row) {
        return Array.from(row.querySelectorAll(
            'td,[role="cell"],[role="gridcell"],.layui-table-cell,.el-table__cell'
        )).filter(v4IsVisible).map(v4PlainText).filter(Boolean);
    }

    function v4IsDiagnosisRecordRow(row, context, lookupPanel) {
        if (!row ||
            row.closest('thead,th') ||
            row.closest('#' + IDS.modal + ',#' + IDS.panel)) {
            return false;
        }
        if (lookupPanel && lookupPanel.contains(row)) {
            return false;
        }
        if (row.closest(
            '.dropdown-menu,.select2-dropdown,.select2-results,' +
            '.combo-panel,.autocomplete-suggestions,.layui-select-dropdown'
        )) {
            return false;
        }
        const nearestGrid = row.closest(
            'table,[role="grid"],.datagrid-view,.datagrid,.layui-table-view,.el-table'
        );
        if (nearestGrid && v4IsLookupContainer(nearestGrid)) {
            return false;
        }

        const text = v4PlainText(row);
        if (!text ||
            text.length > 1000 ||
            v4HasDiagnosisListHeaders(row)) {
            return false;
        }

        let hasHeaderContainer = false;
        let ancestor = nearestGrid || row.parentElement;
        for (let level = 0; ancestor && level < 8; level += 1) {
            if (ancestor === row.ownerDocument.body) {
                break;
            }
            if (v4HasDiagnosisListHeaders(ancestor)) {
                hasHeaderContainer = true;
                break;
            }
            ancestor = ancestor.parentElement;
        }

        const cells = v4DiagnosisRowCells(row);
        const normalizedText = normalize(text);
        const hasRecordSemantics = cells.length >= 5 &&
            /(西医|中医)/.test(normalizedText) &&
            /(主要诊断|次要诊断|主病|主证)/.test(normalizedText);
        return hasHeaderContainer || hasRecordSemantics;
    }

    function v4TemporaryRows(context) {
        const rows = [];
        const seen = new Set();
        let lookupPanel = null;
        try {
            lookupPanel = v4LookupPanel(v4LookupInput(context));
        }
        catch (error) {
            lookupPanel = null;
        }
        v4Documents().forEach(function (doc) {
            Array.from(doc.querySelectorAll(
                'tbody tr,[role="row"],.datagrid-row,.diagnosis-row,' +
                '.layui-table tr,.el-table__row,.ant-table-row,[class*="table-row"]'
            )).filter(v4IsVisible).forEach(function (row) {
                if (seen.has(row)) {
                    return;
                }
                seen.add(row);
                if (!v4IsDiagnosisRecordRow(row, context, lookupPanel)) {
                    return;
                }
                const text = v4PlainText(row);
                rows.push({
                    row: row,
                    text: text,
                    cells: v4DiagnosisRowCells(row)
                });
            });
        });
        return rows;
    }

    function v4RowMatches(text, keys) {
        const normalizedText = normalize(text).toLowerCase();
        const normalizedCodeText = normalizeCode(text);
        return keys.names.some(function (name) {
            return name.length >= 2 &&
                normalizedText.includes(name);
        }) ||
            keys.codes.some(function (code) {
                return normalizedCodeText.includes(code);
            });
    }

    function v4CountMatches(context, item, selected) {
        const keys = v4BuildMatchKeys(item, selected);
        return v4TemporaryRows(context).filter(function (entry) {
            return v4RowMatches(entry.text, keys);
        }).length;
    }

    function v4VisibleMessage() {
        const candidates = [];
        v4Documents().forEach(function (doc) {
            Array.from(doc.querySelectorAll(
                '.layui-layer,.layui-layer-content,.toast,.alert,.message,' +
                '.modal.show,[role="alert"],[role="dialog"]'
            )).filter(v4IsVisible).forEach(function (element) {
                const text = v4PlainText(element);
                if (text &&
                    text.length <= 800) {
                    candidates.push({
                        element: element,
                        text: text,
                        area: element.getBoundingClientRect().width *
                            element.getBoundingClientRect().height
                    });
                }
            });
        });
        candidates.sort(function (a, b) {
            return a.area - b.area;
        });
        return candidates[0] ||
            null;
    }

    function v4FindButton(context, texts) {
        const targets = texts.map(normalize);
        const elements = Array.from(context.root.querySelectorAll(
            'button,a,input[type="button"],input[type="submit"],' +
            '[role="button"],[onclick],.layui-btn,.btn,.l-btn'
        )).filter(v4IsVisible);
        const matched = elements.filter(function (element) {
            const text = normalize(element.value ||
                element.getAttribute('title') ||
                v4PlainText(element));
            return targets.some(function (target) {
                return text === target ||
                    text.includes(target);
            }) &&
                !text.includes('刷新列表') &&
                !/F3.*保存诊断/i.test(text);
        });
        matched.sort(function (a, b) {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return ra.top - rb.top ||
                ra.left - rb.left;
        });
        return matched[0] ||
            null;
    }

    async function v4AddDiagnosis(context, item, selected) {
        let current = v4LocateForm() || context;
        const before = v4CountMatches(current, item, selected);
        if (before > 0) {
            return {
                alreadyExisted: true,
                beforeCount: before,
                afterCount: before
            };
        }
        const button = v4FindButton(current, ['添加诊断', '新增诊断', '保存']);
        if (!button) {
            throw new Error('未找到右侧“添加诊断”按钮');
        }
        v4Click(button);
        const deadline = Date.now() + 7000;
        let lastMessage = '';
        while (Date.now() < deadline) {
            await sleep(180);
            current = v4LocateForm() || current;
            const after = v4CountMatches(current, item, selected);
            /*
             * 左侧已经出现目标诊断就是最终事实。
             * 不再强制要求计数必须 +1，避免虚拟表格重用行节点、
             * 或重复诊断已存在时被误判为失败。
             */
            if (after > 0) {
                return {
                    alreadyExisted: before > 0 && after <= before,
                    beforeCount: before,
                    afterCount: after
                };
            }
            const message = v4VisibleMessage();
            lastMessage = message
                ? message.text
                : lastMessage;
            if (/已存在|重复诊断|不能重复/.test(lastMessage)) {
                const confirmButton = message &&
                    Array.from(message.element.querySelectorAll(
                        'button,a,[role="button"],.layui-layer-btn a'
                    )).filter(v4IsVisible).find(function (element) {
                        return /^(确定|确认|知道了|关闭)$/.test(normalize(v4PlainText(element)));
                    });
                if (confirmButton) {
                    v4Click(confirmButton);
                }
                return {
                    alreadyExisted: true,
                    beforeCount: before,
                    afterCount: after,
                    message: lastMessage
                };
            }
            if (/失败|错误|不能为空|请选择|无效/.test(lastMessage)) {
                throw new Error('添加诊断失败：' + lastMessage);
            }
        }
        throw new Error('点击“添加诊断”后未在左侧临时列表确认该诊断' +
            (lastMessage ? '；页面提示：' + lastMessage : ''));
    }

    function v4VerifyBeforeAdd(context, item, selected) {
        const category = item.category || '西医';
        const categoryRadio = v4FindCategoryRadio(context, category);
        if (!categoryRadio ||
            !categoryRadio.checked) {
            throw new Error('添加前类别不是“' + category + '”');
        }
        const typeText = v4CurrentFieldText(v4Field(context, '诊断类型'));
        const desiredType = item.diagnosisType ||
            (category === '中医' ? '主病' : '次要诊断');
        if (normalize(typeText) !== normalize(desiredType)) {
            throw new Error('添加前诊断类型应为“' + desiredType +
                '”，当前为“' + (typeText || '空') + '”');
        }
        const inputValue = String(v4LookupInput(context).value || '').trim();
        if (!inputValue) {
            throw new Error('添加前“出院诊断”为空');
        }
        if (!selected ||
            !selected.name) {
            throw new Error('添加前没有已确认的医院诊断库候选');
        }
    }

    async function fillOneDiagnosis(item) {
        let context = v4LocateForm();
        if (!context) {
            throw new Error('未识别新版诊断录入表单');
        }
        const category = item.category || '西医';
        const diagnosisType = item.diagnosisType ||
            (category === '中医' ? '主病' : '次要诊断');
        item.category = category;
        item.diagnosisType = diagnosisType;

        /* 第一步只切换类别，不触碰诊断类型。 */
        context = await v4SetCategory(context, category);

        /* 第二步先完成医院诊断库检索与候选落值。 */
        const selected = await v4SelectDiagnosis(context, item);
        context = v4LocateForm() || context;

        /* 检索完成后才依次设置其余三个下拉项。 */
        const categoryRadio = v4FindCategoryRadio(context, category);
        if (!categoryRadio ||
            !categoryRadio.checked) {
            throw new Error('诊断候选落值后类别发生变化，已停止当前诊断');
        }
        context = await v4SelectDropdown(context, '诊断类型', diagnosisType);
        context = await v4SelectDropdown(context, '出院情况', item.outcome || '好转');
        context = await v4SelectDropdown(context, '入院病情', item.admissionCondition || '有');
        context = v4LocateForm() || context;
        v4VerifyBeforeAdd(context, item, selected);
        const saveResult = await v4AddDiagnosis(context, item, selected);
        return {
            item: item,
            selected: selected,
            saveResult: saveResult
        };
    }

    function formatSuccessRecord(record) {
        const item = record.item;
        const selected = record.selected || {};
        return (item.category || '') + '／' +
            (item.diagnosisType || '') + '：' +
            (selected.name || item.standardName || item.sourceName) +
            (selected.code ? '（' + selected.code + '）' : '');
    }

    function v4VerifyTemporaryRecords(records) {
        const context = v4LocateForm();
        if (!context) {
            throw new Error('F3保存前未识别诊断录入表单');
        }
        const missing = records.filter(function (record) {
            return v4CountMatches(context, record.item, record.selected) < 1;
        });
        if (missing.length) {
            throw new Error('F3保存前左侧临时列表缺少：' +
                missing.map(function (record) {
                    return record.selected.name || record.item.sourceName;
                }).join('、'));
        }
    }

    function v4FindWholeSaveButton() {
        const candidates = [];
        const seen = new Set();
        function add(element) {
            const clickable = v4Clickable(element);
            if (!clickable ||
                seen.has(clickable) ||
                !v4IsVisible(clickable) ||
                clickable.closest('#' + IDS.modal + ',#' + IDS.panel)) {
                return;
            }
            const text = normalize(clickable.value ||
                clickable.getAttribute('title') ||
                clickable.getAttribute('aria-label') ||
                v4PlainText(clickable));
            const hotkeys = text.match(/F\d+/gi) || [];
            const exactF3 = /^F3保存诊断$/i.test(text);
            const exactSave = text === '保存诊断';
            if ((!exactF3 && !exactSave) || hotkeys.length > 1) {
                return;
            }
            seen.add(clickable);
            const rect = clickable.getBoundingClientRect();
            const interactive = /BUTTON|A|INPUT/.test(clickable.tagName) ||
                clickable.getAttribute('role') === 'button' ||
                clickable.hasAttribute('onclick');
            candidates.push({
                element: clickable,
                score: (exactF3 ? -100000 : -50000) +
                    (interactive ? -20000 : 0) -
                    rect.top +
                    Math.min(rect.width * rect.height, 20000) / 1000
            });
        }
        v4Documents().forEach(function (doc) {
            Array.from(doc.querySelectorAll(
                'button,a,input[type="button"],input[type="submit"],' +
                '[role="button"],[onclick]'
            )).forEach(add);
            v4TextElements(doc, 'F3：保存诊断').forEach(add);
            v4TextElements(doc, 'F3:保存诊断').forEach(add);
        });
        candidates.sort(function (a, b) {
            return a.score - b.score;
        });
        return candidates[0]
            ? candidates[0].element
            : null;
    }

    async function saveWholeDiagnosisList(records) {
        v4VerifyTemporaryRecords(records);
        const summary = records.map(formatSuccessRecord).join('\n');
        const confirmed = window.confirm(
            '以下诊断均已加入左侧临时列表：\n\n' +
            summary +
            '\n\n确认点击底部“F3：保存诊断”正式保存吗？'
        );
        if (!confirmed) {
            return {
                cancelled: true,
                message: ''
            };
        }
        if (state.stopRequested) {
            throw new UserStoppedError('用户已中止填写');
        }
        const button = v4FindWholeSaveButton();
        if (!button) {
            throw new Error('未找到底部“F3：保存诊断”按钮');
        }
        const beforeMessage = v4VisibleMessage();
        v4Click(button);
        let finalMessage = '';
        const deadline = Date.now() + 4500;
        while (Date.now() < deadline) {
            await sleep(180);
            const current = v4VisibleMessage();
            if (current &&
                (!beforeMessage ||
                    current.text !== beforeMessage.text)) {
                finalMessage = current.text;
                if (/失败|错误|异常|不能为空|无效/.test(finalMessage)) {
                    throw new Error('底部F3保存诊断失败：' + finalMessage);
                }
                if (/成功|保存完成|提交完成/.test(finalMessage)) {
                    break;
                }
            }
        }
        return {
            cancelled: false,
            message: finalMessage
        };
    }


    /******************************************************************
    * 输入文本解析
    ******************************************************************/
    function detectHeading(text) {
        const value = normalize(text);
        const mappings = [
            {
                patterns: [
                    '中医主病',
                    '主病'
                ],
                category: '中医',
                diagnosisType: '主病'
            },
            {
                patterns: [
                    '中医主证',
                    '主证',
                    '中医证候',
                    '证候'
                ],
                category: '中医',
                diagnosisType: '主证'
            },
            {
                patterns: [
                    '西医主要诊断',
                    '西医主诊断',
                    '主要诊断'
                ],
                category: '西医',
                diagnosisType: '主要诊断'
            },
            {
                patterns: [
                    '西医次要诊断',
                    '西医其他诊断',
                    '次要诊断',
                    '其他诊断'
                ],
                category: '西医',
                diagnosisType: '次要诊断'
            }
        ];
        for (const mapping of mappings) {
            if (mapping.patterns
                .some(function (pattern) {
                return (value ===
                    normalize(pattern));
            })) {
                return mapping;
            }
        }
        return null;
    }
    function parseInlineHeading(line) {
        const match = String(line || '')
            .match(/^\s*(中医主病|主病|中医主证|主证|中医证候|证候|西医主要诊断|西医主诊断|主要诊断|西医次要诊断|西医其他诊断|次要诊断|其他诊断)\s*[：:]\s*(.*)$/);
        if (!match) {
            return null;
        }
        return {
            heading: detectHeading(match[1]),
            content: String(match[2] ||
                '').trim()
        };
    }
    function stripLineNumber(line) {
        return String(line || '')
            .replace(/^\s*(?:\d+[.、)）\]]|[-*•])\s*/, '')
            .trim();
    }
    function inferAdmissionCondition(text) {
        const value = String(text || '');
        if (/(入院后发现|住院后发现|入院后查出|住院后查出|入院后确诊|住院后确诊)/
            .test(value)) {
            return '情况不明';
        }
        if (/待查/.test(value)) {
            return '临床未确定';
        }
        return '有';
    }
    function cleanDiagnosisText(text) {
        return String(text || '')
            .replace(/[【\[(（]?\s*(?:入院后发现|住院后发现|入院后查出|住院后查出|入院后确诊|住院后确诊)\s*[】\])）]?/g, '')
            .replace(/[（(]?\s*待查\s*[）)]?/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function splitCodeAndName(text) {
        const cleaned = String(text || '')
            .trim();
        const parts = cleaned
            .split(/[|\t]/)
            .map(function (part) {
            return part.trim();
        })
            .filter(Boolean);
        let systemCode = '';
        let name = cleaned;
        if (parts.length >= 2) {
            const codePart = parts.find(function (part) {
                return (/^[A-Z][A-Z0-9.×X+_-]{2,24}$/i
                    .test(part) &&
                    /\d/.test(part));
            });
            if (codePart) {
                systemCode =
                    codePart
                        .toUpperCase();
                name =
                    parts.find(function (part) {
                        return (part !==
                            codePart);
                    }) ||
                        cleaned;
            }
        }
        return {
            systemCode: systemCode,
            name: name
        };
    }
    function makeDiagnosisItem(rawText, currentHeading, index, counters) {
        const sourceName = String(rawText ||
            '').trim();
        const admissionCondition = inferAdmissionCondition(sourceName);
        const cleanedForSearch = cleanDiagnosisText(sourceName);
        const split = splitCodeAndName(cleanedForSearch);
        let category = currentHeading
            ? currentHeading.category
            : '西医';
        let diagnosisType = currentHeading
            ? currentHeading
                .diagnosisType
            : '';
        const roleLocked = Boolean(currentHeading);
        if (!currentHeading) {
            if (/证$/.test(split.name)) {
                category =
                    '中医';
                diagnosisType =
                    '主证';
            }
            else {
                category =
                    '西医';
                diagnosisType =
                    counters.western === 0
                        ? '主要诊断'
                        : '次要诊断';
            }
        }
        if (category ===
            '西医') {
            counters.western += 1;
        }
        return {
            enabled: true,
            sourceName: sourceName,
            searchName: split.name,
            standardName:
                resolveSharedDiagnosisName(
                    split.name
                ) ||
                split.name,
            systemCode: split.systemCode,
            category: category,
            diagnosisType: diagnosisType,
            outcome: '好转',
            admissionCondition: admissionCondition,
            confidence: split.systemCode
                ? 1
                : '',
            note: '',
            status: '',
            roleLocked: roleLocked,
            originalIndex: index
        };
    }
    function parseDiagnosisLines(text) {
        const lines = String(text || '')
            .split(/\r?\n/);
        const items = [];
        const counters = {
            western: 0
        };
        let currentHeading = null;
        lines.forEach(function (rawLine) {
            let line = stripLineNumber(rawLine);
            if (!line) {
                return;
            }
            const inline = parseInlineHeading(line);
            if (inline) {
                currentHeading =
                    inline.heading;
                if (!inline.content) {
                    return;
                }
                line =
                    inline.content;
            }
            else {
                const heading = detectHeading(line.replace(/[：:]$/, ''));
                if (heading) {
                    currentHeading =
                        heading;
                    return;
                }
            }
            items.push(makeDiagnosisItem(line, currentHeading, items.length, counters));
        });
        return items;
    }
    /******************************************************************
    * DeepSeek辅助判断编码和系统名称
    ******************************************************************/
    function deepSeekRequest(apiKey, model, items) {
        const payloadItems = items.map(function (item, index) {
            return {
                index: index,
                sourceName: item.sourceName,
                cleanedName: item.searchName,
                existingCode: item.systemCode ||
                    '',
                currentCategory: item.category,
                currentDiagnosisType: item.diagnosisType,
                roleLocked: Boolean(item.roleLocked),
                admissionCondition: item
                    .admissionCondition
            };
        });
        const systemPrompt = [
            '你是中国住院病案首页诊断字典检索与编码辅助工具。',
            '任务是根据用户已提供的诊断文字，返回医院诊断字典可能使用的标准检索名称和编码候选。',
            '不得新增诊断事实，不得推断未提供的病因、部位、分期、严重程度或并发症。',
            '西医疾病优先给出中国临床版ICD-10常用编码；中医病名或中医证候如能可靠判断可给出中医病证分类代码，否则systemCode留空。',
            'category只能是“西医”或“中医”。',
            'diagnosisKind只能是“西医疾病”“中医病名”“中医证候”。',
            'roleLocked为true时，不得改变currentCategory和currentDiagnosisType。',
            'roleLocked为false时，只负责判断西医疾病、中医病名或中医证候：中医病名对应主病，中医证候对应主证；西医诊断的主要或次要顺序由脚本处理，不要自行提升诊断级别。',
            '入院病情只使用输入中的明确信息：含“待查”对应临床未确定；明确写入院后或住院后发现、查出、确诊对应情况不明；其余保持有。',
            '出院情况固定为好转。',
            '保持输入顺序和index不变。',
            '只输出JSON对象，不要输出Markdown。结构如下：',
            '{"items":[{"index":0,"standardName":"系统标准检索名称","systemCode":"编码或空字符串","category":"西医或中医","diagnosisKind":"西医疾病或中医病名或中医证候","confidence":0.0,"note":"简短说明"}]}'
        ].join('\n');
        return new Promise(function (resolve, reject) {
            suiteGlobalAiXmlhttpRequest({
                method: 'POST',
                url: DEEPSEEK_ENDPOINT,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' +
                        apiKey
                },
                data: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                diagnoses: payloadItems
                            })
                        }
                    ],
                    response_format: {
                        type: 'json_object'
                    },
                    thinking: {
                        type: 'disabled'
                    },
                    temperature: 0.1,
                    max_tokens: 4096,
                    stream: false
                }),
                timeout: 90000,
                onload: function (response) {
                    if (response.status < 200 ||
                        response.status >= 300) {
                        reject(new Error('DeepSeek接口返回HTTP ' +
                            response.status +
                            '：' +
                            String(response
                                .responseText ||
                                '').slice(0, 500)));
                        return;
                    }
                    try {
                        const outer = JSON.parse(response
                            .responseText);
                        const content = outer &&
                            outer.choices &&
                            outer.choices[0] &&
                            outer.choices[0]
                                .message
                            ? outer
                                .choices[0]
                                .message
                                .content
                            : '';
                        if (!content) {
                            throw new Error('接口未返回有效内容');
                        }
                        resolve(JSON.parse(content));
                    }
                    catch (error) {
                        reject(new Error('DeepSeek结果解析失败：' +
                            error.message));
                    }
                },
                onerror: function () {
                    reject(new Error('DeepSeek网络请求失败'));
                },
                ontimeout: function () {
                    reject(new Error('DeepSeek请求超时'));
                }
            });
        });
    }
    function applyAiResult(items, result) {
        const aiItems = Array.isArray(result.items)
            ? result.items
            : [];
        aiItems.forEach(function (aiItem) {
            const index = Number(aiItem.index);
            if (!Number.isInteger(index) ||
                !items[index]) {
                return;
            }
            const target = items[index];
            const aiStandardName =
                String(aiItem.standardName ||
                    target.standardName ||
                    target.searchName ||
                    target.sourceName).trim();

            target.standardName =
                resolveSharedDiagnosisName(
                    aiStandardName
                ) ||
                aiStandardName;
            target.systemCode =
                String(aiItem.systemCode ||
                    target.systemCode ||
                    '')
                    .trim()
                    .toUpperCase();
            target.confidence =
                Math.max(0, Math.min(1, Number(aiItem
                    .confidence ||
                    0)));
            target.note =
                String(aiItem.note ||
                    '').trim();
            if (!target.roleLocked) {
                const kind = String(aiItem
                    .diagnosisKind ||
                    '');
                if (aiItem.category ===
                    '中医' ||
                    kind ===
                        '中医病名' ||
                    kind ===
                        '中医证候') {
                    target.category =
                        '中医';
                    target.diagnosisType =
                        kind ===
                            '中医证候'
                            ? '主证'
                            : '主病';
                }
                else {
                    target.category =
                        '西医';
                }
            }
        });
        let foundWesternPrimary = false;
        items.forEach(function (item) {
            if (item.category !==
                '西医') {
                return;
            }
            if (item.roleLocked) {
                if (item.diagnosisType ===
                    '主要诊断') {
                    foundWesternPrimary =
                        true;
                }
                return;
            }
            if (!foundWesternPrimary) {
                item.diagnosisType =
                    '主要诊断';
                foundWesternPrimary =
                    true;
            }
            else {
                item.diagnosisType =
                    '次要诊断';
            }
        });
        return aiItems.length;
    }
    function showStatus(message, type) {
        const messageType = type ||
            'normal';
        let box = document.getElementById(IDS.status);
        if (!box) {
            box =
                document.createElement('div');
            box.id =
                IDS.status;
            document.body
                .appendChild(box);
        }
        const colors = {
            normal: '#159bd3',
            success: '#20985b',
            error: '#dc4c40'
        };
        Object.assign(box.style, {
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            zIndex: '2147483647',
            minWidth: '320px',
            maxWidth: '720px',
            padding: '12px 15px',
            borderRadius: '6px',
            background: colors[messageType] ||
                colors.normal,
            color: '#ffffff',
            fontSize: '13px',
            lineHeight: '1.7',
            whiteSpace: 'pre-line',
            boxShadow: '0 4px 15px rgba(0,0,0,.28)'
        });
        box.textContent =
            message;
        clearTimeout(box.hideTimer);
        box.hideTimer =
            setTimeout(function () {
                box.remove();
            }, messageType ===
                'error'
                ? 16000
                : 7000);
    }
    function createSelect(options, value) {
        const select = document.createElement('select');
        options.forEach(function (optionText) {
            const option = document.createElement('option');
            option.value =
                optionText;
            option.textContent =
                optionText;
            select.appendChild(option);
        });
        select.value =
            value;
        return select;
    }
    function replaceSelectOptions(select, options, desiredValue) {
        select.innerHTML =
            '';
        options.forEach(function (text) {
            const option = document.createElement('option');
            option.value =
                text;
            option.textContent =
                text;
            select.appendChild(option);
        });
        select.value =
            options.includes(desiredValue)
                ? desiredValue
                : options[0];
    }
    function renderResultTable(modal) {
        const tbody = modal.querySelector('.diagnosis-result-body');
        tbody.innerHTML =
            '';
        state.items.forEach(function (item, index) {
            const row = document.createElement('tr');
            row.dataset.index =
                String(index);
            function appendCell(child) {
                const cell = document.createElement('td');
                cell.appendChild(child);
                row.appendChild(cell);
                return cell;
            }
            const enabled = document.createElement('input');
            enabled.type =
                'checkbox';
            enabled.checked =
                item.enabled !== false;
            enabled.className =
                'diag-enabled';
            appendCell(enabled);
            const order = document.createElement('span');
            order.textContent =
                String(index + 1);
            appendCell(order);
            const source = document.createElement('input');
            source.type =
                'text';
            source.value =
                item.sourceName ||
                    '';
            source.className =
                'diag-source';
            appendCell(source);
            const standard = document.createElement('input');
            standard.type =
                'text';
            standard.value =
                item.standardName ||
                    '';
            standard.className =
                'diag-standard';
            appendCell(standard);
            const code = document.createElement('input');
            code.type =
                'text';
            code.value =
                item.systemCode ||
                    '';
            code.className =
                'diag-code';
            appendCell(code);
            const category = createSelect([
                '西医',
                '中医'
            ], item.category ||
                '西医');
            category.className =
                'diag-category';
            appendCell(category);
            const type = createSelect(ROLE_OPTIONS[item.category ||
                '西医'], item.diagnosisType);
            type.className =
                'diag-type';
            appendCell(type);
            category.addEventListener('change', function () {
                const options = ROLE_OPTIONS[category.value];
                let desired;
                if (category.value ===
                    '中医') {
                    desired =
                        /证$/.test(source.value
                            .trim())
                            ? '主证'
                            : '主病';
                }
                else {
                    const previousRows = Array.from(tbody.querySelectorAll('tr')).slice(0, index);
                    const hasPrimary = previousRows.some(function (previousRow) {
                        return (previousRow
                            .querySelector('.diag-category')
                            .value ===
                            '西医' &&
                            previousRow
                                .querySelector('.diag-type')
                                .value ===
                                '主要诊断');
                    });
                    desired =
                        hasPrimary
                            ? '次要诊断'
                            : '主要诊断';
                }
                replaceSelectOptions(type, options, desired);
            });
            const outcome = createSelect(OUTCOME_OPTIONS, item.outcome ||
                '好转');
            outcome.className =
                'diag-outcome';
            appendCell(outcome);
            const admission = createSelect(ADMISSION_OPTIONS, item
                .admissionCondition ||
                '有');
            admission.className =
                'diag-admission';
            appendCell(admission);
            const confidence = document.createElement('span');
            confidence.className =
                'diag-confidence';
            confidence.textContent =
                item.confidence === '' ||
                    item.confidence ===
                        undefined
                    ? '-'
                    : Math.round(Number(item.confidence) * 100) + '%';
            confidence.title =
                item.note ||
                    '';
            appendCell(confidence);
            const status = document.createElement('span');
            status.className =
                'diag-status';
            status.textContent =
                item.status ||
                    '待填写';
            appendCell(status);
            tbody.appendChild(row);
        });
        modal.querySelector('.diagnosis-result-wrap').style.display =
            state.items.length
                ? 'block'
                : 'none';
    }
    function readItemsFromTable(modal) {
        const rows = Array.from(modal.querySelectorAll('.diagnosis-result-body tr'));
        return rows.map(function (row, index) {
            const old = state.items[index] ||
                {};
            const sourceName = row.querySelector('.diag-source').value.trim();
            return {
                enabled: row.querySelector('.diag-enabled').checked,
                sourceName: sourceName,
                searchName: cleanDiagnosisText(splitCodeAndName(sourceName).name),
                standardName: row.querySelector('.diag-standard').value.trim(),
                systemCode: row.querySelector('.diag-code')
                    .value
                    .trim()
                    .toUpperCase(),
                category: row.querySelector('.diag-category').value,
                diagnosisType: row.querySelector('.diag-type').value,
                outcome: row.querySelector('.diag-outcome').value,
                admissionCondition: row.querySelector('.diag-admission').value,
                confidence: old.confidence ===
                    undefined
                    ? ''
                    : old.confidence,
                note: old.note ||
                    '',
                status: row.querySelector('.diag-status').textContent,
                roleLocked: Boolean(old.roleLocked),
                originalIndex: index
            };
        });
    }
    function updateRowStatus(modal, index, text, type) {
        const row = modal.querySelector('.diagnosis-result-body ' +
            'tr[data-index="' +
            index +
            '"]');
        if (!row) {
            return;
        }
        const status = row.querySelector('.diag-status');
        status.textContent =
            text;
        status.dataset.type =
            type ||
                '';
    }
    function ensureStyle() {
        if (document.getElementById(IDS.style)) {
            return;
        }
        const style = document.createElement('style');
        style.id =
            IDS.style;
        style.textContent = `
#${IDS.modal}{
position:fixed;
inset:0;
z-index:2147483647;
display:none;
font-family:"Microsoft YaHei",Arial,sans-serif;
color:#333;
}
#${IDS.modal}.show{display:block;}
#${IDS.modal} .diag-mask{position:absolute;inset:0;background:rgba(0,0,0,.42);}
#${IDS.modal} .diag-dialog{
position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
width:1220px;max-width:calc(100vw - 24px);max-height:calc(100vh - 30px);
background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 12px 38px rgba(0,0,0,.35);
}
#${IDS.modal} .diag-header{
display:flex;align-items:center;justify-content:space-between;padding:13px 17px;
background:${MODAL_HEADER_COLOR};color:#fff;font-size:16px;font-weight:bold;
}
#${IDS.modal} .diag-close{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer;}
#${IDS.modal} .diag-body{padding:14px 16px;max-height:calc(100vh - 145px);overflow:auto;}
#${IDS.modal} .diag-grid{display:grid;grid-template-columns:1.4fr .8fr .8fr;gap:10px;margin-bottom:10px;}
#${IDS.modal} label{display:flex;flex-direction:column;gap:5px;font-size:13px;}
#${IDS.modal} input,#${IDS.modal} textarea,#${IDS.modal} select{
box-sizing:border-box;border:1px solid #cfd8dc;border-radius:4px;font-size:13px;background:#fff;color:#333;
}
#${IDS.modal} input,#${IDS.modal} select{height:32px;padding:4px 7px;}
#${IDS.modal} textarea{width:100%;min-height:170px;padding:8px;resize:vertical;line-height:1.6;}
#${IDS.modal} .diag-tip{
padding:9px 11px;margin:10px 0;background:#fff8e8;color:#795b00;border-radius:5px;
font-size:12px;line-height:1.65;white-space:pre-line;
}
#${IDS.modal} .diag-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
#${IDS.modal} .diag-actions button,#${IDS.modal} .diag-footer button{
height:34px;padding:0 14px;border-radius:4px;border:1px solid #159bd3;
background:#159bd3;color:#fff;cursor:pointer;
}
#${IDS.modal} .diag-actions button.secondary,#${IDS.modal} .diag-footer button.secondary{
background:#fff;color:#159bd3;
}
#${IDS.modal} .diag-actions button.danger{
background:#d9534f;border-color:#d9534f;color:#fff;
}
#${IDS.modal} .diag-actions button.danger:hover{
background:#c9302c;border-color:#c9302c;
}
#${IDS.modal} .diag-actions button[data-paused="true"]{
background:#f0ad4e;border-color:#f0ad4e;color:#fff;
}
#${IDS.modal} .diag-actions button:disabled,#${IDS.modal} .diag-footer button:disabled{
opacity:.5;cursor:not-allowed;
}
#${IDS.modal} .diag-result-wrap{display:none;overflow:auto;border:1px solid #ddd;border-radius:5px;}
#${IDS.modal} table{width:100%;min-width:1170px;border-collapse:collapse;table-layout:fixed;}
#${IDS.modal} th,#${IDS.modal} td{
border-bottom:1px solid #e6e6e6;border-right:1px solid #eee;padding:5px;
text-align:center;font-size:12px;vertical-align:middle;
}
#${IDS.modal} th{position:sticky;top:0;background:#f2f8fb;z-index:2;}
#${IDS.modal} td input,#${IDS.modal} td select{width:100%;height:29px;font-size:12px;padding:3px 5px;}
#${IDS.modal} th:nth-child(1),#${IDS.modal} td:nth-child(1){width:38px;}
#${IDS.modal} th:nth-child(2),#${IDS.modal} td:nth-child(2){width:38px;}
#${IDS.modal} th:nth-child(3),#${IDS.modal} td:nth-child(3){width:190px;}
#${IDS.modal} th:nth-child(4),#${IDS.modal} td:nth-child(4){width:190px;}
#${IDS.modal} th:nth-child(5),#${IDS.modal} td:nth-child(5){width:110px;}
#${IDS.modal} th:nth-child(6),#${IDS.modal} td:nth-child(6){width:65px;}
#${IDS.modal} th:nth-child(7),#${IDS.modal} td:nth-child(7){width:90px;}
#${IDS.modal} th:nth-child(8),#${IDS.modal} td:nth-child(8){width:75px;}
#${IDS.modal} th:nth-child(9),#${IDS.modal} td:nth-child(9){width:100px;}
#${IDS.modal} th:nth-child(10),#${IDS.modal} td:nth-child(10){width:60px;}
#${IDS.modal} th:nth-child(11),#${IDS.modal} td:nth-child(11){width:90px;}
#${IDS.modal} .diag-status[data-type="success"]{color:#17884d;font-weight:bold;}
#${IDS.modal} .diag-status[data-type="error"]{color:#d13b31;font-weight:bold;}
#${IDS.modal} .diag-status[data-type="paused"]{color:#c67c00;font-weight:bold;}
#${IDS.modal} .diag-status[data-type="stopped"]{color:#8a4b08;font-weight:bold;}
#${IDS.modal} .diag-footer{
display:flex;justify-content:flex-end;gap:9px;padding:11px 16px;border-top:1px solid #eee;background:#fafafa;
}
@media(max-width:760px){#${IDS.modal} .diag-grid{grid-template-columns:1fr;}}
`;
        document.head.appendChild(style);
    }
    function createModal() {
        let modal = document.getElementById(IDS.modal);
        if (modal)
            return modal;
        ensureStyle();
        modal = document.createElement('div');
        modal.id = IDS.modal;
        modal.innerHTML = `
<div class="diag-mask"></div>
<div class="diag-dialog">
<div class="diag-header">
<span>诊断列表自动填写（DeepSeek辅助编码与系统名称）</span>
<button type="button" class="diag-close">×</button>
</div>
<div class="diag-body">
<div class="diag-grid">
<label>DeepSeek API Key
<input type="password" class="diag-api-key" placeholder="sk-...；仅保存在油猴脚本存储中">
</label>
<label>模型
<select class="diag-model">
<option value="deepseek-v4-flash">deepseek-v4-flash</option>
<option value="deepseek-v4-pro">deepseek-v4-pro</option>
</select>
</label>
<label>每行也可直接写编码
<input type="text" value="M51.100x002+1 | 腰椎间盘突出伴神经根病" readonly>
</label>
</div>
<label>诊断列表
<textarea class="diag-source-text" placeholder="推荐格式：
中医主病：
腰痛
中医主证：
寒湿阻滞证
西医主要诊断：
腰椎间盘突出伴神经根病
西医次要诊断：
腰椎管狭窄症
颈椎间盘突出（待查）
双下肢动脉粥样硬化【入院后发现】"></textarea>
</label>
<div class="diag-tip">填写规则：
1. 中医类别：诊断类型选择“主病”或“主证”。
2. 西医类别：第一条西医诊断选择“主要诊断”，其余选择“次要诊断”。
3. 入院时已经确诊：入院病情选择“有”；诊断文字含“待查”：自动选择“临床未确定”；文字标注“入院后发现/查出/确诊”：自动选择“情况不明”。
4. 出院情况默认全部选择“好转”。
5. v4自动录入按“类别→医院诊断候选→诊断类型→出院情况→入院病情→添加诊断”的顺序执行。
6. AI只辅助给出编码和系统检索名称；保存病案首页前仍需人工核对。
7. “暂停填写”会在当前诊断完成后暂停；“中止填写”会安全结束本次任务，保留左侧临时列表且不执行F3保存。
8. 若悬浮框管理器已启用“诊断名称本地化映射”，脚本会优先使用医院本地诊断名检索；原始诊断文字仍保留。</div>
<div class="diag-actions">
<button type="button" class="diag-parse">解析文本</button>
<button type="button" class="diag-ai">DeepSeek辅助匹配</button>
<button type="button" class="diag-fill">填写已勾选诊断</button>
<button type="button" class="diag-pause secondary" disabled>暂停填写</button>
<button type="button" class="diag-stop danger" disabled>中止填写</button>
<button type="button" class="diag-select-all secondary">全选/全不选</button>
</div>
<div class="diagnosis-result-wrap">
<table>
<thead><tr>
<th>填</th><th>序</th><th>原诊断</th><th>系统检索名称</th><th>编码</th>
<th>类别</th><th>诊断类型</th><th>出院情况</th><th>入院病情</th><th>置信度</th><th>状态</th>
</tr></thead>
<tbody class="diagnosis-result-body"></tbody>
</table>
</div>
</div>
<div class="diag-footer">
<button type="button" class="diag-cancel secondary">关闭</button>
</div>
</div>`;
        document.body.appendChild(modal);
        const close = function () {
            modal.classList.remove('show');
        };
        modal.querySelector('.diag-close').addEventListener('click', close);
        modal.querySelector('.diag-cancel').addEventListener('click', close);
        modal.querySelector('.diag-mask').addEventListener('click', close);
        const apiKeyInput = modal.querySelector('.diag-api-key');
        const modelSelect = modal.querySelector('.diag-model');
        const sourceText = modal.querySelector('.diag-source-text');
        apiKeyInput.value = GM_getValue(KEYS.apiKey, '');
        modelSelect.value = GM_getValue(KEYS.model, DEFAULT_MODEL);
        sourceText.value = GM_getValue(KEYS.draft, '');
        apiKeyInput.addEventListener('change', function () {
            GM_setValue(KEYS.apiKey, apiKeyInput.value.trim());
        });
        modelSelect.addEventListener('change', function () {
            GM_setValue(KEYS.model, modelSelect.value);
        });
        sourceText.addEventListener('input', function () {
            GM_setValue(KEYS.draft, sourceText.value);
        });
        modal.querySelector('.diag-parse').addEventListener('click', function () {
            state.items = parseDiagnosisLines(sourceText.value);
            if (!state.items.length) {
                showStatus('请先输入至少一个诊断。', 'error');
                return;
            }
            renderResultTable(modal);
            showStatus('已按中医主病、主证及西医主要/次要诊断规则解析' + state.items.length + '条诊断。');
        });
        modal.querySelector('.diag-ai').addEventListener('click', async function () {
            if (state.running)
                return;
            const apiKey = apiKeyInput.value.trim();
            if (!suiteGlobalAiHasApiKey(apiKey)) {
                showStatus('请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。', 'error');
                return;
            }
            state.items = readItemsFromTable(modal);
            if (!state.items.length)
                state.items = parseDiagnosisLines(sourceText.value);
            if (!state.items.length) {
                showStatus('请先输入并解析诊断。', 'error');
                return;
            }
            GM_setValue(KEYS.apiKey, apiKey);
            GM_setValue(KEYS.model, modelSelect.value);
            state.running = true;
            const aiButton = modal.querySelector('.diag-ai');
            aiButton.disabled = true;
            aiButton.textContent = 'AI分析中…';
            showStatus('正在调用DeepSeek分析编码和系统检索名称……');
            try {
                const result = await deepSeekRequest(apiKey, modelSelect.value, state.items);
                const count = applyAiResult(state.items, result);
                renderResultTable(modal);
                showStatus('DeepSeek已返回' + count + '条候选，请核对类别、诊断类型、编码和名称后再填写。', 'success');
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
            finally {
                state.running = false;
                aiButton.disabled = false;
                aiButton.textContent = 'DeepSeek辅助匹配';
            }
        });
        const pauseButton = modal.querySelector('.diag-pause');
        const stopButton = modal.querySelector('.diag-stop');

        pauseButton.addEventListener('click', function () {
            if (!state.fillRunning || state.stopRequested) {
                return;
            }

            state.paused = !state.paused;
            updateFillControlButtons(modal);

            if (state.paused) {
                showStatus(
                    '已请求暂停。\n当前正在处理的诊断会先完成当前安全步骤，然后暂停在下一条诊断或F3保存之前。',
                    'normal'
                );
            }
            else {
                showStatus('已继续填写。', 'normal');
            }
        });

        stopButton.addEventListener('click', function () {
            if (!state.fillRunning || state.stopRequested) {
                return;
            }

            const confirmed = window.confirm(
                '确定中止本次诊断填写吗？\n\n' +
                '当前正在处理的诊断会先完成当前安全步骤，然后停止。\n' +
                '已经加入左侧临时列表的诊断不会删除，脚本也不会执行底部F3保存。'
            );

            if (!confirmed) {
                return;
            }

            state.stopRequested = true;
            state.paused = false;
            updateFillControlButtons(modal);
            showStatus(
                '已请求中止。\n当前安全步骤结束后停止，不再填写后续诊断，也不会执行底部F3保存。',
                'normal'
            );
        });

        modal.querySelector('.diag-select-all').addEventListener('click', function () {
            const boxes = Array.from(modal.querySelectorAll('.diag-enabled'));
            const shouldCheck = boxes.some(function (box) {
                return !box.checked;
            });
            boxes.forEach(function (box) {
                box.checked = shouldCheck;
            });
        });
        modal.querySelector('.diag-fill').addEventListener('click', async function () {
            if (state.running) {
                return;
            }

            state.items = readItemsFromTable(modal);
            const selected = state.items.map(function (item, index) {
                return {
                    item: item,
                    index: index
                };
            }).filter(function (entry) {
                return entry.item.enabled;
            });

            if (!selected.length) {
                showStatus('没有勾选需要填写的诊断。', 'error');
                return;
            }

            state.running = true;
            state.fillRunning = true;
            state.paused = false;
            state.stopRequested = false;

            const fillButton = modal.querySelector('.diag-fill');
            fillButton.disabled = true;
            fillButton.textContent = '正在填写…';
            updateFillControlButtons(modal);

            const successes = [];
            const failures = [];
            const processedIndexes = new Set();
            let formalSaved = false;
            let formalSaveCancelled = false;
            let formalSaveMessage = '';
            let userStopped = false;

            try {
                await activateDiagnosisTab();
                await sleep(350);

                for (let selectedPosition = 0; selectedPosition < selected.length; selectedPosition += 1) {
                    const entry = selected[selectedPosition];
                    const item = entry.item;
                    const index = entry.index;
                    const progressText = '第' + (selectedPosition + 1) + '/' + selected.length + '条';

                    await waitForResumeOrStop(
                        modal,
                        index,
                        item.sourceName,
                        '开始填写' + progressText
                    );

                    updateRowStatus(modal, index, '填写中（' + progressText + '）', '');
                    showStatus('正在填写' + progressText + '：' + item.sourceName);

                    try {
                        const record = await fillOneDiagnosis(item);
                        successes.push(record);

                        if (record.saveResult && record.saveResult.alreadyExisted) {
                            updateRowStatus(modal, index, '已存在，已跳过', 'success');
                        }
                        else {
                            updateRowStatus(modal, index, '已加入临时列表', 'success');
                        }
                    }
                    catch (error) {
                        failures.push(item.sourceName + '：' + error.message);
                        updateRowStatus(modal, index, '失败', 'error');
                        console.error('[诊断自动填写失败]', item, error);
                    }

                    processedIndexes.add(index);

                    /*
                    * 暂停和中止采用“安全停止”方式：
                    * 当前诊断完成后才暂停或退出，避免在右侧表单只填到一半。
                    */
                    await sleep(300);

                    if (state.stopRequested) {
                        throw new UserStoppedError('用户已中止填写');
                    }
                }

                /*
                * 所有诊断完成后、F3确认之前仍允许暂停或中止。
                */
                await waitForResumeOrStop(
                    modal,
                    null,
                    '',
                    '准备核对并执行F3保存'
                );

                if (!failures.length && successes.length === selected.length) {
                    showStatus(
                        '全部' + successes.length +
                        '条诊断已加入左侧临时列表，正在进行最终核对，随后将弹出F3保存确认对话框……'
                    );
                    await sleep(450);

                    if (state.stopRequested) {
                        throw new UserStoppedError('用户已中止填写');
                    }

                    const result = await saveWholeDiagnosisList(successes);
                    if (result.cancelled) {
                        formalSaveCancelled = true;
                    }
                    else {
                        formalSaved = true;
                        formalSaveMessage = result.message || '';
                    }
                }
                else if (successes.length) {
                    showStatus(
                        '已有' + successes.length + '条诊断加入左侧临时列表，但有' +
                        failures.length + '条失败，因此未点击底部F3保存诊断。\n' +
                        '请检查失败项；脚本不会自动点击“刷新列表”。',
                        'error'
                    );
                }
            }
            catch (error) {
                if (isUserStoppedError(error)) {
                    userStopped = true;
                    console.log('[诊断自动填写] 用户中止本次任务。');
                }
                else {
                    failures.push(error.message);
                }
            }
            finally {
                state.running = false;
                resetFillControlState(modal);
                fillButton.disabled = false;
                fillButton.textContent = '填写已勾选诊断';
            }

            const successText = successes.map(formatSuccessRecord).join('\n');

            if (userStopped) {
                selected.forEach(function (entry) {
                    if (!processedIndexes.has(entry.index)) {
                        updateRowStatus(modal, entry.index, '已中止，未填写', 'stopped');
                    }
                });

                const remainingCount = Math.max(0, selected.length - processedIndexes.size);
                showStatus(
                    '本次填写已中止。\n' +
                    '已加入或确认存在：' + successes.length + '条。\n' +
                    '失败：' + failures.length + '条。\n' +
                    '未继续处理：' + remainingCount + '条。' +
                    (successes.length ? '\n\n已完成项：\n' + successText : '') +
                    (failures.length ? '\n\n失败项：\n' + failures.join('\n') : '') +
                    '\n\n已加入左侧临时列表的诊断保持不变；脚本未执行底部F3保存，也未点击刷新列表。',
                    'normal'
                );
            }
            else if (formalSaved && !failures.length) {
                showStatus(
                    '已完成' + successes.length + '条诊断：\n' +
                    successText +
                    '\n\n您已确认，脚本已点击一次底部“F3：保存诊断”。' +
                    (formalSaveMessage ? '\n页面提示：' + formalSaveMessage : '') +
                    '\n全程未点击“刷新列表”，请核对左侧诊断列表。',
                    'success'
                );
            }
            else if (formalSaveCancelled && !failures.length) {
                showStatus(
                    '全部' + successes.length + '条诊断已加入左侧临时列表。\n' +
                    '您已在确认对话框中选择“取消”，因此脚本没有点击底部F3保存诊断。\n' +
                    '左侧临时列表保持不变，可核对后手动点击F3保存诊断。',
                    'normal'
                );
            }
            else {
                showStatus(
                    '已加入临时列表' + successes.length + '条，失败' + failures.length + '条。' +
                    (successes.length ? '\n成功项：\n' + successText : '') +
                    (failures.length ? '\n失败项：\n' + failures.join('\n') : '') +
                    '\n\n未完成全部诊断，因此未执行底部F3正式保存；脚本未刷新列表。',
                    'error'
                );
            }
        });
        return modal;
    }
    function openModal() {
        const modal = createModal();
        modal.classList.add('show');
        if (state.items.length)
            renderResultTable(modal);
    }
    function clamp(value, minimum, maximum) {
        return Math.min(Math.max(value, minimum), maximum);
    }
    function loadPosition() {
        const value = GM_getValue(KEYS.position, null);
        if (value && Number.isFinite(value.left) && Number.isFinite(value.top))
            return value;
        return null;
    }
    function savePosition(panel) {
        const rect = panel.getBoundingClientRect();
        GM_setValue(KEYS.position, {
            left: Math.round(rect.left),
            top: Math.round(rect.top)
        });
    }
    function keepPanelInViewport(panel, save) {
        const rect = panel.getBoundingClientRect();
        const margin = 6;
        const left = clamp(rect.left, margin, Math.max(margin, window.innerWidth - rect.width - margin));
        const top = clamp(rect.top, margin, Math.max(margin, window.innerHeight - rect.height - margin));
        panel.style.left = Math.round(left) + 'px';
        panel.style.top = Math.round(top) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        if (save !== false)
            savePosition(panel);
    }
    function positionAboveExistingPanels(panel) {
        const references = [
            document.getElementById('medical-auto-fill-panel'),
            document.getElementById('medical-inpatient-auto-fill-panel')
        ].filter(function (element) {
            return element && element.isConnected && isVisible(element);
        });
        if (!references.length) {
            panel.style.left = '8px';
            panel.style.top = 'auto';
            panel.style.right = 'auto';
            panel.style.bottom = '148px';
            return;
        }
        const rects = references.map(function (element) {
            return element.getBoundingClientRect();
        });
        const highestTop = Math.min.apply(null, rects.map(function (rect) {
            return rect.top;
        }));
        const left = rects.sort(function (a, b) {
            return a.top - b.top;
        })[0].left;
        const panelRect = panel.getBoundingClientRect();
        panel.style.left = Math.max(6, left) + 'px';
        panel.style.top = Math.max(6, highestTop - panelRect.height - 10) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }
    function setCollapsed(panel, collapsed, save) {
        const body = panel.querySelector('.diagnosis-floating-body');
        const toggle = panel.querySelector('.diagnosis-floating-toggle');
        panel.dataset.collapsed = collapsed ? 'true' : 'false';
        body.style.display = collapsed ? 'none' : 'block';
        toggle.textContent = collapsed ? '＋' : '－';
        toggle.title = collapsed ? '展开' : '折叠';
        if (save !== false)
            GM_setValue(KEYS.collapsed, collapsed);
        requestAnimationFrame(function () {
            keepPanelInViewport(panel, save !== false);
        });
    }
    function enableDrag(panel, handle) {
        let dragging = false;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let previousUserSelect = '';
        handle.addEventListener('pointerdown', function (event) {
            if (event.target.closest('.diagnosis-floating-toggle'))
                return;
            if (event.pointerType === 'mouse' && event.button !== 0)
                return;
            const rect = panel.getBoundingClientRect();
            dragging = true;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            previousUserSelect = document.documentElement.style.userSelect;
            document.documentElement.style.userSelect = 'none';
            handle.style.cursor = 'grabbing';
            try {
                handle.setPointerCapture(pointerId);
            }
            catch (error) { }
            event.preventDefault();
        });
        handle.addEventListener('pointermove', function (event) {
            if (!dragging || event.pointerId !== pointerId)
                return;
            const margin = 6;
            const left = clamp(startLeft + event.clientX - startX, margin, Math.max(margin, window.innerWidth - panel.offsetWidth - margin));
            const top = clamp(startTop + event.clientY - startY, margin, Math.max(margin, window.innerHeight - panel.offsetHeight - margin));
            panel.style.left = Math.round(left) + 'px';
            panel.style.top = Math.round(top) + 'px';
            event.preventDefault();
        });
        function finish(event) {
            if (!dragging)
                return;
            if (event && event.pointerId !== undefined && event.pointerId !== pointerId)
                return;
            dragging = false;
            document.documentElement.style.userSelect = previousUserSelect;
            handle.style.cursor = 'move';
            keepPanelInViewport(panel, true);
        }
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);
        handle.addEventListener('lostpointercapture', finish);
    }
    function createPanel() {
        if (document.getElementById(IDS.panel))
            return;
        const panel = document.createElement('div');
        panel.id = IDS.panel;
        Object.assign(panel.style, {
            position: 'fixed',
            width: NATIVE_SIMPLE_DARK_BLUE_STYLE.panelWidth + 'px',
            zIndex: '2147483646',
            overflow: 'hidden',
            borderRadius: NATIVE_SIMPLE_DARK_BLUE_STYLE.panelRadius + 'px',
            background: '#ffffff',
            boxShadow: NATIVE_SIMPLE_DARK_BLUE_STYLE.panelShadow,
            fontFamily: '"Microsoft YaHei",Arial,sans-serif',
            opacity: '1'
        });
        const header = document.createElement('div');
        header.className = 'diagnosis-floating-header';
        Object.assign(header.style, {
            height: '31px',
            padding: '0 7px 0 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: NATIVE_SIMPLE_DARK_BLUE_STYLE.headerColor,
            color: '#ffffff',
            cursor: 'move',
            userSelect: 'none',
            touchAction: 'none'
        });
        const title = document.createElement('span');
        title.textContent = '诊断列表';
        Object.assign(title.style, {
            minWidth: '0',
            overflow: 'hidden',
            fontSize: '13px',
            fontWeight: 'bold',
            lineHeight: '31px',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            pointerEvents: 'none'
        });
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'diagnosis-floating-toggle';
        Object.assign(toggle.style, {
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
        });
        toggle.addEventListener('pointerdown', function (event) {
            event.stopPropagation();
        });
        toggle.addEventListener('click', function (event) {
            event.stopPropagation();
            setCollapsed(panel, panel.dataset.collapsed !== 'true', true);
        });
        header.appendChild(title);
        header.appendChild(toggle);
        const body = document.createElement('div');
        body.className = 'diagnosis-floating-body';
        Object.assign(body.style, {
            padding: '8px',
            background: '#fff'
        });
        const button = document.createElement('button');
        button.id = IDS.button;
        button.type = 'button';
        button.textContent = '自动填写诊断列表';
        Object.assign(button.style, {
            width: '158px',
            height: '40px',
            padding: '0',
            border: 'none',
            borderRadius: '5px',
            background: NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor,
            color: '#ffffff',
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 2px 7px rgba(0,0,0,.18)'
        });
        button.addEventListener('mouseenter', function () {
            if (!button.disabled) {
                button.style.background = NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryHoverColor;
            }
        });

        button.addEventListener('mouseleave', function () {
            if (!button.disabled) {
                button.style.background = NATIVE_SIMPLE_DARK_BLUE_STYLE.primaryColor;
            }
        });

        button.addEventListener('click', openModal);
        body.appendChild(button);
        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);
        setCollapsed(panel, Boolean(GM_getValue(KEYS.collapsed, false)), false);
        const saved = loadPosition();
        if (saved) {
            panel.style.left = saved.left + 'px';
            panel.style.top = saved.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            requestAnimationFrame(function () {
                keepPanelInViewport(panel, false);
            });
        }
        else {
            positionAboveExistingPanels(panel);
        }
        enableDrag(panel, header);
    }
    function init() {
        createPanel();
        window.addEventListener('resize', function () {
            const panel = document.getElementById(IDS.panel);
            if (panel)
                keepPanelInViewport(panel, true);
        });
        new MutationObserver(function () {
            createPanel();
            if (!loadPosition()) {
                const panel = document.getElementById(IDS.panel);
                if (panel)
                    positionAboveExistingPanels(panel);
            }
        }).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    }
    else {
        init();
    }

    /******************************************************************
     * WebDAV数据备份与脚本源码快照适配
     *
     * 仅备份明确白名单内的长期配置；API Key、患者资料、临时草稿和
     * 当前任务状态均不进入备份。源码快照只用于WebDAV留档，不自动安装。
     ******************************************************************/

    const SUITE_BACKUP_ADAPTER_KEY =
        "diagnosis";

    const SUITE_BACKUP_GM_KEYS = [
            KEYS.model,
            KEYS.position,
            KEYS.collapsed
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
            "// @name         智慧医疗病案首页－诊断列表AI辅助填写",
            "// @namespace    http://tampermonkey.net/",
            "// @version      4.0.8",
            "// @description  v4.0.8：批量同步WebDAV数据备份注册、源码快照版本、源码备份文件名及统一管理器脚本版本信息至4.0.8；保留v4.0.7全局AI密钥校验兼容修复、DeepSeek/智谱GLM/OpenAI全局AI调用适配及其余既有功能",
            "// @match        *://11.12.199.244:8003/*",
            "// @grant        GM_xmlhttpRequest",
            "// @grant        GM_getValue",
            "// @grant        GM_setValue",
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
                medicalDiagnosisAutoFillMain
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
                "诊断列表自动填写",
            version:
                "4.0.8",
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
                        state.fillRunning || state.running
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
                "诊断列表自动填写",
            version:
                "4.0.8",
            role:
                'business',
            fileName:
                "智慧医疗病案首页－诊断列表AI辅助填写_v4.0.8.user.js",
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
