// ==UserScript==
// @name         智慧医疗－中草药AI辅助批量录入
// @namespace    http://tampermonkey.net/
// @version      1.18.19
// @description  v1.18.19：中草药模块新增处方单打印，支持勾选药味、A5/A4预览、版式校准、元素映射和配置备份；保留既有录入及AI功能
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
(function medicalHerbAiBatchFillMain() {
    'use strict';

    if (window.top !== window.self) {
        return;
    }

    /******************************************************************
     * 一、基础配置
     ******************************************************************/


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
        panel: 'medical-herb-auto-fill-panel-v1',
        button: 'medical-herb-auto-fill-button-v1',
        modal: 'medical-herb-auto-fill-modal-v1',
        style: 'medical-herb-auto-fill-style-v1',
        status: 'medical-herb-auto-fill-status-v1',
        warningFrontStyle: 'medical-herb-warning-front-style-v1'
    };

    const KEYS = {
        apiKey: 'medicalHerbDeepSeekApiKeyV1',
        model: 'medicalHerbDeepSeekModelV1',
        draft: 'medicalHerbDraftV1',
        decoctionMode: 'medicalHerbDecoctionModeV1',
        doseCount: 'medicalHerbDoseCountV1',
        prescriptionLayout: 'medicalHerbPrescriptionLayoutV1',
        prescriptionLayoutRollback: 'medicalHerbPrescriptionLayoutRollbackV1',
        saveAfterFill: 'medicalHerbSaveAfterFillV1',
        preferStarred: 'medicalHerbPreferStarredV1',
        syndromeText: 'medicalHerbSyndromeTextV1',
        tcmClinicalText: 'medicalHerbTcmClinicalTextV1',
        tcmFourDiagnosisText: 'medicalHerbTcmFourDiagnosisTextV1',
        tcmMergedText: 'medicalHerbTcmMergedTextV1',
        tcmInputMode: 'medicalHerbTcmInputModeV1',
        tcmPrescriptionCollapsed: 'medicalHerbTcmPrescriptionCollapsedV1',
        herbWarningEnabled: 'medicalHerbWarningEnabledV1',
        herbWarningRenderEnabled: 'medicalHerbWarningRenderEnabledV1',
        herbWarningFirstOnly: 'medicalHerbWarningFirstOnlyV1',
        herbWarningRouteTimelineCompensation: 'medicalHerbWarningRouteTimelineCompensationV1',
        herbWarningRenderThresholdDays: 'medicalHerbWarningRenderThresholdDaysV1',
        herbWarningAlertThresholdDays: 'medicalHerbWarningAlertThresholdDaysV1',
        herbWarningCollapsed: 'medicalHerbWarningCollapsedV1',
        position: 'medicalHerbPanelPositionV1',
        collapsed: 'medicalHerbPanelCollapsedV1'
    };



    /******************************************************************
     * 悬浮框管理器共享知识库接入
     *
     * 数据来源：悬浮框管理器 v3.3.4 的统一 localStorage 接口。
     * 即使管理器脚本尚未完成初始化，本脚本也可按相同结构直接读取。
     ******************************************************************/
    const SUITE_SHARED_KNOWLEDGE_STORAGE_KEY =
        'medicalUserscriptSharedKnowledgeV1';

    function suiteSharedPlain(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .replace(/[ \t]+/g, ' ')
            .trim();
    }

    function suiteSharedKey(value) {
        return suiteSharedPlain(value)
            .replace(/[★☆*＊]/g, '')
            .replace(/[（）()【】\[\]{}]/g, '')
            .replace(/[\s·•・,，;；:：\/\\_\-]+/g, '')
            .toLowerCase();
    }

    function suiteSharedAliasList(value) {
        const source = Array.isArray(value)
            ? value
            : String(value || '').split(/[|｜、,，;；\n]+/);

        return source
            .map(suiteSharedPlain)
            .filter(Boolean);
    }

    function suiteSharedPinyinInitials(value) {
        const source = suiteSharedPlain(value);

        if (!source) return '';

        const boundaries =
            '阿芭擦搭蛾发噶哈击喀垃妈拿哦啪期然撒塌挖昔压匝';
        const initials =
            'ABCDEFGHJKLMNOPQRSTWXYZ';
        let result = '';

        Array.from(source).forEach(function (character) {
            if (/[a-z0-9]/i.test(character)) {
                result += character.toUpperCase();
                return;
            }

            if (/[\s★☆*＊（）()【】\[\]{}·•・,，;；:：\/\\_\-+%.]/.test(character)) {
                return;
            }

            let matched = '';

            for (let index = boundaries.length - 1; index >= 0; index -= 1) {
                try {
                    if (character.localeCompare(
                        boundaries[index],
                        'zh-CN',
                        { sensitivity: 'base' }
                    ) >= 0) {
                        matched = initials[index] || '';
                        break;
                    }
                }
                catch (error) {
                    if (character.localeCompare(boundaries[index]) >= 0) {
                        matched = initials[index] || '';
                        break;
                    }
                }
            }

            result += matched;
        });

        return result.replace(/[^A-Z0-9]/g, '');
    }

    function loadSuiteSharedKnowledge() {
        let source = {};

        try {
            source = JSON.parse(
                localStorage.getItem(
                    SUITE_SHARED_KNOWLEDGE_STORAGE_KEY
                ) || '{}'
            ) || {};
        }
        catch (error) {
            source = {};
        }

        const settings = source.settings && typeof source.settings === 'object'
            ? source.settings
            : {};

        return {
            settings: {
                enableTcmNameMapping:
                    Boolean(settings.enableTcmNameMapping),
                enableWesternDrugSuggestion:
                    Boolean(settings.enableWesternDrugSuggestion),
                enableWesternDrugPinyinInitials:
                    Boolean(settings.enableWesternDrugPinyinInitials),
                enableChargeItemSuggestion:
                    Boolean(settings.enableChargeItemSuggestion),
                enableChargeItemPinyinInitials:
                    Boolean(settings.enableChargeItemPinyinInitials)
            },
            tcmMappings: (Array.isArray(source.tcmMappings)
                ? source.tcmMappings
                : [])
                .map(function (item) {
                    const entry = item && typeof item === 'object'
                        ? item
                        : {};

                    return {
                        from: suiteSharedPlain(
                            entry.from || entry.source || entry.name
                        ),
                        to: suiteSharedPlain(
                            entry.to || entry.target || entry.localName ||
                            entry.searchName
                        ),
                        aliases: suiteSharedAliasList(
                            entry.aliases || entry.otherNames || []
                        ),
                        enabled: entry.enabled !== false
                    };
                })
                .filter(function (item) {
                    return item.from && item.to;
                }),
            westernDrugs: (Array.isArray(source.westernDrugs)
                ? source.westernDrugs
                : [])
                .map(function (item) {
                    const entry = item && typeof item === 'object'
                        ? item
                        : {};
                    const name = suiteSharedPlain(
                        entry.name || entry.drugName || entry.genericName
                    );
                    const searchName = suiteSharedPlain(
                        entry.searchName || entry.lookupName ||
                        entry.mnemonic || entry.pinyin || name
                    );

                    return {
                        name: name || searchName,
                        searchName: searchName || name,
                        specification: suiteSharedPlain(
                            entry.specification || entry.spec
                        ),
                        unit: suiteSharedPlain(entry.unit),
                        manufacturer: suiteSharedPlain(
                            entry.manufacturer || entry.factory
                        ),
                        code: suiteSharedPlain(
                            entry.code || entry.drugCode
                        ),
                        aliases: suiteSharedAliasList(
                            entry.aliases || entry.otherNames || []
                        ),
                        note: suiteSharedPlain(
                            entry.note || entry.remark
                        ),
                        enabled: entry.enabled !== false
                    };
                })
                .filter(function (item) {
                    return item.name || item.searchName;
                }),
            chargeItems: (Array.isArray(source.chargeItems)
                ? source.chargeItems
                : [])
                .map(function (item) {
                    const entry = item && typeof item === 'object'
                        ? item
                        : {};

                    return {
                        name: suiteSharedPlain(
                            entry.name || entry.itemName ||
                            entry.chargeName
                        ),
                        unit: suiteSharedPlain(
                            entry.unit || entry.billingUnit
                        ),
                        price: suiteSharedPlain(
                            entry.price || entry.unitPrice
                        ),
                        aliases: suiteSharedAliasList(
                            entry.aliases || entry.otherNames || []
                        ),
                        enabled: entry.enabled !== false
                    };
                })
                .filter(function (item) {
                    return item.name;
                })
        };
    }

    function suiteResolveTcmName(value) {
        const original = suiteSharedPlain(value)
            .replace(/^\s*[★☆*＊]+\s*/, '')
            .trim();
        const library = loadSuiteSharedKnowledge();

        if (!original || !library.settings.enableTcmNameMapping) {
            return original;
        }

        const key = suiteSharedKey(original);
        const match = library.tcmMappings.find(function (item) {
            if (!item || item.enabled === false) return false;

            return [item.from, item.to]
                .concat(item.aliases || [])
                .some(function (candidate) {
                    return suiteSharedKey(candidate) === key;
                });
        });

        return match && match.to
            ? match.to
            : original;
    }

    function suiteSharedSuggestionScore(query, values, pinyinEnabled) {
        const target = suiteSharedKey(query);

        if (!target) return 1;

        let score = -1;

        (values || []).forEach(function (value) {
            const normalized = suiteSharedKey(value);

            if (!normalized) return;

            if (normalized === target) {
                score = Math.max(score, 1000);
            }
            else if (normalized.startsWith(target)) {
                score = Math.max(score, 700 - normalized.length);
            }
            else if (normalized.includes(target)) {
                score = Math.max(score, 400 - normalized.length);
            }

            if (pinyinEnabled) {
                const initials = suiteSharedKey(
                    suiteSharedPinyinInitials(value)
                );

                if (initials === target) {
                    score = Math.max(score, 900);
                }
                else if (initials.startsWith(target)) {
                    score = Math.max(score, 620 - initials.length);
                }
                else if (initials.includes(target)) {
                    score = Math.max(score, 320 - initials.length);
                }
            }
        });

        return score;
    }

    function suiteWesternDrugSuggestions(query, limit) {
        const library = loadSuiteSharedKnowledge();

        if (!library.settings.enableWesternDrugSuggestion) {
            return [];
        }

        const maximum = Math.max(1, Math.min(100, Number(limit) || 30));
        const pinyinEnabled = Boolean(
            library.settings.enableWesternDrugPinyinInitials
        );

        return library.westernDrugs
            .filter(function (item) {
                return item && item.enabled !== false;
            })
            .map(function (item) {
                return {
                    item: item,
                    score: suiteSharedSuggestionScore(
                        query,
                        [
                            item.name,
                            item.searchName,
                            item.code,
                            item.specification,
                            item.manufacturer
                        ].concat(item.aliases || []),
                        pinyinEnabled
                    )
                };
            })
            .filter(function (entry) {
                return entry.score >= 0;
            })
            .sort(function (first, second) {
                return second.score - first.score ||
                    String(first.item.name).localeCompare(
                        String(second.item.name),
                        'zh-CN'
                    );
            })
            .slice(0, maximum)
            .map(function (entry) {
                const result = Object.assign({}, entry.item);

                if (pinyinEnabled) {
                    result.pinyinInitials =
                        suiteSharedPinyinInitials(
                            result.name || result.searchName
                        );
                }

                return result;
            });
    }

    function suiteChargeItemSuggestions(query, limit) {
        const library = loadSuiteSharedKnowledge();

        if (!library.settings.enableChargeItemSuggestion) {
            return [];
        }

        const maximum = Math.max(1, Math.min(100, Number(limit) || 30));
        const pinyinEnabled = Boolean(
            library.settings.enableChargeItemPinyinInitials
        );

        return library.chargeItems
            .filter(function (item) {
                return item && item.enabled !== false;
            })
            .map(function (item) {
                return {
                    item: item,
                    score: suiteSharedSuggestionScore(
                        query,
                        [item.name].concat(item.aliases || []),
                        pinyinEnabled
                    )
                };
            })
            .filter(function (entry) {
                return entry.score >= 0;
            })
            .sort(function (first, second) {
                return second.score - first.score ||
                    String(first.item.name).localeCompare(
                        String(second.item.name),
                        'zh-CN'
                    );
            })
            .slice(0, maximum)
            .map(function (entry) {
                const result = Object.assign({}, entry.item);

                if (pinyinEnabled) {
                    result.pinyinInitials =
                        suiteSharedPinyinInitials(result.name);
                }

                return result;
            });
    }

    function suiteWesternDisplayValue(item) {
        if (!item) return '';

        return [
            '西药',
            suiteSharedPlain(item.name || item.searchName),
            suiteSharedPlain(item.specification),
            suiteSharedPlain(item.manufacturer),
            suiteSharedPlain(item.code)
        ].filter(Boolean).join('｜');
    }

    function suiteChargeDisplayValue(item) {
        if (!item) return '';

        return [
            '收费',
            suiteSharedPlain(item.name),
            suiteSharedPlain(item.unit),
            suiteSharedPlain(item.price)
        ].filter(Boolean).join('｜');
    }

    function suiteResolveWesternDrug(value) {
        const raw = suiteSharedPlain(value);
        const key = suiteSharedKey(raw);
        const library = loadSuiteSharedKnowledge();

        if (
            !key ||
            !library.settings.enableWesternDrugSuggestion
        ) {
            return null;
        }

        const entries = library.westernDrugs.filter(function (item) {
            return item && item.enabled !== false;
        });

        const exactDisplay = entries.find(function (item) {
            return suiteSharedPlain(
                suiteWesternDisplayValue(item)
            ).toLowerCase() === raw.toLowerCase();
        });

        if (exactDisplay) return exactDisplay;

        const exact = entries.filter(function (item) {
            return [
                item.name,
                item.searchName,
                item.code,
                item.specification,
                item.manufacturer
            ].concat(item.aliases || [])
                .some(function (candidate) {
                    return suiteSharedKey(candidate) === key;
                });
        });

        if (exact.length === 1) return exact[0];

        if (library.settings.enableWesternDrugPinyinInitials) {
            const pinyin = entries.filter(function (item) {
                return [item.name, item.searchName]
                    .concat(item.aliases || [])
                    .some(function (candidate) {
                        return suiteSharedKey(
                            suiteSharedPinyinInitials(candidate)
                        ) === key;
                    });
            });

            if (pinyin.length === 1) return pinyin[0];
        }

        return null;
    }

    function suiteResolveChargeItem(value) {
        const raw = suiteSharedPlain(value);
        const key = suiteSharedKey(raw);
        const library = loadSuiteSharedKnowledge();

        if (
            !key ||
            !library.settings.enableChargeItemSuggestion
        ) {
            return null;
        }

        const entries = library.chargeItems.filter(function (item) {
            return item && item.enabled !== false;
        });

        const exactDisplay = entries.find(function (item) {
            return suiteSharedPlain(
                suiteChargeDisplayValue(item)
            ).toLowerCase() === raw.toLowerCase();
        });

        if (exactDisplay) return exactDisplay;

        const exact = entries.filter(function (item) {
            return [item.name].concat(item.aliases || [])
                .some(function (candidate) {
                    return suiteSharedKey(candidate) === key;
                });
        });

        if (exact.length === 1) return exact[0];

        if (library.settings.enableChargeItemPinyinInitials) {
            const pinyin = entries.filter(function (item) {
                return suiteSharedKey(
                    suiteSharedPinyinInitials(item.name)
                ) === key;
            });

            if (pinyin.length === 1) return pinyin[0];
        }

        return null;
    }


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
        'medicalHerbGlmApiKeyV1';
    const SUITE_GLOBAL_AI_OPENAI_API_KEY_GM_KEY =
        'medicalHerbOpenAiApiKeyV1';
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
        key: 'herb',
        name: '中草药自动录入',
        version: '1.18.19',
        getDeepSeekKey: function () {
            return String(GM_getValue(KEYS.apiKey, '') || '').trim();
        },
        setDeepSeekKey: function (value) {
            GM_setValue(KEYS.apiKey, value);
        }
    });

    const DEFAULT_MODEL = 'deepseek-v4-flash';
    const DEEPSEEK_MAX_ATTEMPTS = 3;
    const DEEPSEEK_RETRYABLE_STATUS = new Set([
        408,
        409,
        425,
        429,
        500,
        502,
        503,
        504
    ]);

    const state = {
        items: [],
        auditIssues: [],
        aiAuditIssues: [],
        formulaAnalysis: null,
        tcmPrescriptionSuggestion: null,
        running: false,
        paused: false,
        abortRequested: false,
        lastApiMeta: null,
        herbWarningResults: [],
        herbWarningMeta: null,
        herbWarningScanBusy: false,
        herbWarningFrontSignature: '',
        herbWarningFrontWatcherTimer: null,
        herbWarningFrontRenderTimer: null,
        herbWarningAutoScanTimer: null,
        herbWarningContext: null,
        herbWarningContextObserver: null,
        herbWarningObservedRoot: null,
        herbWarningFrontDirty: true,
        /*
         * v1.18.9：浏览器标签页返回前台后进入短暂静默保护期。
         * 保护期仅抑制由自动静默扫描产生的预警气泡；手工扫描、管理器
         * 医嘱标签联动等非静默扫描仍按原设置正常提示。
         */
        herbWarningForegroundQuietUntil: 0,
        herbWarningRenderedCells: new Set(),
        herbWarningLastScanAt: 0
    };

    /*
     * DeepSeek API统一请求层（v1.18）
     *
     * 优化目标：
     * 1. 默认使用当前快速模型deepseek-v4-flash；旧模型名自动迁移。
     * 2. 明确关闭V4默认思考模式，减少等待和无效推理输出。
     * 3. 对429、5xx、网络错误、超时、空content及JSON解析失败进行有限重试。
     * 4. 检查finish_reason，避免把截断结果当作普通JSON解析错误。
     * 5. 合并模式只发送一份患者原文，避免重复提交相同病历内容。
     */
    function normalizeDeepSeekModel(value) {
        const model = String(value || '').trim();
        const legacyModels = [
            'deepseek-chat',
            'deepseek-reasoner',
            'deepseek-v3',
            'deepseek-r1'
        ];

        if (!model || legacyModels.includes(model.toLowerCase())) {
            return DEFAULT_MODEL;
        }

        return model;
    }

    function createDeepSeekError(message, options) {
        const error = new Error(message);
        const details = options || {};

        error.retryable = Boolean(details.retryable);
        error.status = Number(details.status || 0);
        error.code = String(details.code || '');
        error.finishReason = String(details.finishReason || '');

        return error;
    }

    function parseResponseHeaders(rawHeaders) {
        const result = {};

        String(rawHeaders || '')
            .split(/\r?\n/)
            .forEach(function (line) {
                const separator = line.indexOf(':');

                if (separator <= 0) {
                    return;
                }

                const name = line.slice(0, separator).trim().toLowerCase();
                const value = line.slice(separator + 1).trim();

                if (name) {
                    result[name] = value;
                }
            });

        return result;
    }

    function getDeepSeekRetryDelay(error, attempt) {
        const retryAfter = Number(error && error.retryAfterSeconds);

        if (Number.isFinite(retryAfter) && retryAfter > 0) {
            return Math.min(8000, Math.max(500, retryAfter * 1000));
        }

        const base = error && error.status === 429
            ? 1200
            : 650;
        const exponential = base * Math.pow(2, Math.max(0, attempt - 1));
        const jitter = Math.floor(Math.random() * 260);

        return Math.min(5000, exponential + jitter);
    }

    function deepSeekRequestOnce(apiKey, requestBody, timeoutMs) {
        return new Promise(function (resolve, reject) {
            suiteGlobalAiXmlhttpRequest({
                method: 'POST',
                url: DEEPSEEK_ENDPOINT,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    Authorization: 'Bearer ' + apiKey
                },
                data: JSON.stringify(requestBody),
                timeout: timeoutMs,
                onload: function (response) {
                    const status = Number(response.status || 0);
                    const responseText = String(response.responseText || '');
                    const responseHeaders = parseResponseHeaders(
                        response.responseHeaders
                    );

                    if (status < 200 || status >= 300) {
                        let detail = responseText.slice(0, 800);

                        try {
                            const errorBody = JSON.parse(responseText);
                            detail = errorBody && errorBody.error
                                ? String(
                                    errorBody.error.message ||
                                    errorBody.error.code ||
                                    detail
                                )
                                : detail;
                        }
                        catch (error) {
                            // 保留原始响应摘要。
                        }

                        const requestError = createDeepSeekError(
                            'DeepSeek接口返回HTTP ' + status +
                            (detail ? '：' + detail : ''),
                            {
                                retryable: DEEPSEEK_RETRYABLE_STATUS.has(status),
                                status: status,
                                code: 'http_error'
                            }
                        );
                        const retryAfter = Number(responseHeaders['retry-after']);

                        if (Number.isFinite(retryAfter)) {
                            requestError.retryAfterSeconds = retryAfter;
                        }

                        reject(requestError);
                        return;
                    }

                    let outer;

                    try {
                        outer = JSON.parse(responseText.trim());
                    }
                    catch (error) {
                        reject(createDeepSeekError(
                            'DeepSeek外层响应解析失败：' + error.message,
                            {
                                retryable: true,
                                status: status,
                                code: 'outer_json_parse_failed'
                            }
                        ));
                        return;
                    }

                    if (outer && outer.error) {
                        reject(createDeepSeekError(
                            'DeepSeek接口错误：' + String(
                                outer.error.message ||
                                outer.error.code ||
                                '未知错误'
                            ),
                            {
                                retryable: true,
                                status: status,
                                code: String(outer.error.code || 'api_error')
                            }
                        ));
                        return;
                    }

                    const choice = outer &&
                        Array.isArray(outer.choices)
                        ? outer.choices[0]
                        : null;
                    const finishReason = choice
                        ? String(choice.finish_reason || '')
                        : '';
                    const message = choice && choice.message
                        ? choice.message
                        : null;
                    const content = message
                        ? String(message.content || '').trim()
                        : '';

                    if (finishReason === 'length') {
                        reject(createDeepSeekError(
                            'DeepSeek输出达到长度上限，JSON可能被截断',
                            {
                                retryable: true,
                                status: status,
                                code: 'output_truncated',
                                finishReason: finishReason
                            }
                        ));
                        return;
                    }

                    if (finishReason === 'insufficient_system_resource') {
                        reject(createDeepSeekError(
                            'DeepSeek当前系统资源不足',
                            {
                                retryable: true,
                                status: status,
                                code: 'insufficient_system_resource',
                                finishReason: finishReason
                            }
                        ));
                        return;
                    }

                    if (finishReason === 'content_filter') {
                        reject(createDeepSeekError(
                            'DeepSeek未能返回完整内容（content_filter）',
                            {
                                retryable: false,
                                status: status,
                                code: 'content_filter',
                                finishReason: finishReason
                            }
                        ));
                        return;
                    }

                    if (!content) {
                        reject(createDeepSeekError(
                            'DeepSeek返回了空content',
                            {
                                retryable: true,
                                status: status,
                                code: 'empty_content',
                                finishReason: finishReason
                            }
                        ));
                        return;
                    }

                    let parsed;

                    try {
                        parsed = extractJsonObject(content);
                    }
                    catch (error) {
                        reject(createDeepSeekError(
                            'DeepSeek结构化结果解析失败：' + error.message,
                            {
                                retryable: true,
                                status: status,
                                code: 'content_json_parse_failed',
                                finishReason: finishReason
                            }
                        ));
                        return;
                    }

                    resolve({
                        result: parsed,
                        usage: outer.usage || null,
                        finishReason: finishReason || 'stop',
                        requestId: String(outer.id || '')
                    });
                },
                onerror: function () {
                    reject(createDeepSeekError(
                        'DeepSeek网络请求失败',
                        {
                            retryable: true,
                            code: 'network_error'
                        }
                    ));
                },
                ontimeout: function () {
                    reject(createDeepSeekError(
                        'DeepSeek请求超时',
                        {
                            retryable: true,
                            code: 'timeout'
                        }
                    ));
                }
            });
        });
    }

    async function deepSeekJsonRequest(
        apiKey,
        model,
        systemPrompt,
        userPayload,
        options
    ) {
        const settings = options || {};
        const normalizedModel = normalizeDeepSeekModel(model);
        const maximumAttempts = Math.max(
            1,
            Math.min(
                DEEPSEEK_MAX_ATTEMPTS,
                Number(settings.maxAttempts) || DEEPSEEK_MAX_ATTEMPTS
            )
        );
        const timeoutMs = Math.max(
            30000,
            Number(settings.timeoutMs) || 75000
        );
        const startedAt = Date.now();
        let maxTokens = Math.max(
            512,
            Number(settings.maxTokens) || 4096
        );
        let lastError = null;

        for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
            const requestBody = {
                model: normalizedModel,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(userPayload)
                    }
                ],
                response_format: {
                    type: 'json_object'
                },
                thinking: {
                    type: 'disabled'
                },
                temperature: Number.isFinite(Number(settings.temperature))
                    ? Number(settings.temperature)
                    : 0.1,
                max_tokens: maxTokens,
                stream: false
            };

            try {
                const response = await deepSeekRequestOnce(
                    apiKey,
                    requestBody,
                    timeoutMs
                );

                state.lastApiMeta = {
                    model: normalizedModel,
                    attempts: attempt,
                    elapsedMs: Date.now() - startedAt,
                    finishReason: response.finishReason,
                    usage: response.usage,
                    requestId: response.requestId
                };

                return response.result;
            }
            catch (error) {
                lastError = error;

                if (
                    !error.retryable ||
                    attempt >= maximumAttempts
                ) {
                    break;
                }

                if (
                    error.code === 'output_truncated' ||
                    error.code === 'content_json_parse_failed'
                ) {
                    maxTokens = Math.min(
                        Number(settings.maxTokenCeiling) || 7200,
                        Math.ceil(maxTokens * 1.35)
                    );
                }

                const delay = getDeepSeekRetryDelay(error, attempt);

                showStatus(
                    'DeepSeek连接波动，正在自动重试（' +
                    (attempt + 1) + '/' + maximumAttempts + '）……\n' +
                    error.message,
                    'warning'
                );

                await sleep(delay);
            }
        }

        state.lastApiMeta = {
            model: normalizeDeepSeekModel(model),
            attempts: maximumAttempts,
            elapsedMs: Date.now() - startedAt,
            failed: true,
            errorCode: lastError ? String(lastError.code || '') : ''
        };

        throw lastError || new Error('DeepSeek请求失败');
    }

    function getLastApiTimingText() {
        const meta = state.lastApiMeta;

        if (!meta || !Number.isFinite(Number(meta.elapsedMs))) {
            return '';
        }

        return '；API耗时' +
            (Number(meta.elapsedMs) / 1000).toFixed(1) +
            '秒' +
            (Number(meta.attempts) > 1
                ? '（' + meta.attempts + '次请求）'
                : '');
    }

    /*
     * 医院中草药表格实际列顺序：
     * 0=行号，1=组号，2=名称，3=开始时间，后续列依次排列。
     * 表头坐标识别失败时，必须按这个真实顺序兜底，避免把药名误填进组号列。
     */
    const COLUMN_FALLBACK_INDEX = {
        组号: 1,
        名称: 2,
        开始时间: 3,
        规格: 4,
        剂数: 5,
        剂量: 6,
        单位: 7,
        用法: 8,
        自付比例: 9,
        嘱托: 10,
        代煎: 11,
        出院带药: 12,
        转自费: 13,
        计费: 14,
        精麻: 15,
        操作: 16
    };

    /*
     * 新版住院中草药表格只保留每味药自身字段；剂数、用法、代煎、
     * 出院带药、转自费和计费移动到页面底部，整张处方统一设置。
     * 当表头坐标暂时不可用时，按截图所示的新列顺序兜底。
     */
    const UNIFIED_FOOTER_COLUMN_FALLBACK_INDEX = {
        名称: 1,
        开始时间: 2,
        规格: 3,
        剂量: 4,
        单位: 5,
        自付比例: 6,
        嘱托: 7,
        操作: 8
    };

    const sleep = function (ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    };

    /******************************************************************
     * 二、安全审方规则
     *
     * 说明：
     * 1. 这里按经典“十八反、十九畏”做保守提示。
     * 2. 只提示，不自动删药、改药或改剂量。
     * 3. 炮制品、别名、地区规范及特殊临床使用，必须由医师和药师复核。
     ******************************************************************/

    const CLASSIC_CONTRAINDICATION_RULES = [
        {
            type: '十八反',
            leftLabel: '甘草类',
            rightLabel: '甘遂、大戟、海藻、芫花类',
            left: ['甘草'],
            right: ['甘遂', '大戟', '海藻', '芫花']
        },
        {
            type: '十八反',
            leftLabel: '乌头类',
            rightLabel: '贝母、瓜蒌、半夏、白蔹、白及类',
            left: ['乌头类'],
            right: ['贝母', '瓜蒌', '半夏', '白蔹', '白及']
        },
        {
            type: '十八反',
            leftLabel: '藜芦',
            rightLabel: '人参、沙参、丹参、玄参、细辛、芍药类',
            left: ['藜芦'],
            right: ['人参', '沙参', '丹参', '玄参', '细辛', '芍药']
        },
        {
            type: '十九畏',
            leftLabel: '硫黄',
            rightLabel: '朴硝',
            left: ['硫黄'],
            right: ['朴硝']
        },
        {
            type: '十九畏',
            leftLabel: '水银',
            rightLabel: '砒霜',
            left: ['水银'],
            right: ['砒霜']
        },
        {
            type: '十九畏',
            leftLabel: '狼毒',
            rightLabel: '密陀僧',
            left: ['狼毒'],
            right: ['密陀僧']
        },
        {
            type: '十九畏',
            leftLabel: '巴豆',
            rightLabel: '牵牛',
            left: ['巴豆'],
            right: ['牵牛']
        },
        {
            type: '十九畏',
            leftLabel: '丁香',
            rightLabel: '郁金',
            left: ['丁香'],
            right: ['郁金']
        },
        {
            type: '十九畏',
            leftLabel: '川乌、草乌',
            rightLabel: '犀角',
            left: ['川乌', '草乌'],
            right: ['犀角']
        },
        {
            type: '十九畏',
            leftLabel: '牙硝',
            rightLabel: '三棱',
            left: ['牙硝', '朴硝'],
            right: ['三棱']
        },
        {
            type: '十九畏',
            leftLabel: '官桂',
            rightLabel: '石脂',
            left: ['官桂'],
            right: ['石脂']
        },
        {
            type: '十九畏',
            leftLabel: '人参',
            rightLabel: '五灵脂',
            left: ['人参'],
            right: ['五灵脂']
        }
    ];

    const HIGH_RISK_HERBS = [
        '乌头类',
        '川乌',
        '草乌',
        '附子',
        '马钱子',
        '巴豆',
        '斑蝥',
        '蟾酥',
        '雄黄',
        '朱砂',
        '水银',
        '砒霜',
        '生半夏',
        '生天南星',
        '洋金花',
        '罂粟壳'
    ];

    const SPECIAL_PREPARATION_KEYWORDS = [
        '先煎',
        '后下',
        '包煎',
        '烊化',
        '冲服',
        '另煎',
        '兑服',
        '煎汤代水',
        '研末冲服'
    ];

    /******************************************************************
     * 三、通用DOM工具
     ******************************************************************/

    function normalize(text) {
        return String(text || '')
            .replace(/\s+/g, '')
            .replace(/[：:*＊★☆]/g, '')
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .trim();
    }

    function normalizePlainText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function hasStarMark(text) {
        return /[★☆＊*]/.test(String(text || ''));
    }

    /*
     * “优先带★”不再参与候选列表评分。
     * 勾选时，直接在面板的“系统检索名称”前统一加上★；
     * 取消勾选时，统一去掉开头的★、☆、*或＊。
     * 后续医院字典检索完全沿用v1.2的普通名称检索流程。
     */
    function removeLeadingStarPrefix(name) {
        return String(name || '')
            .replace(/^\s*[★☆*＊]+\s*/, '')
            .trim();
    }

    function applyStarPrefix(name, enabled) {
        const plainName = removeLeadingStarPrefix(name);
        const mappedName = suiteResolveTcmName(plainName);

        if (!mappedName) {
            return '';
        }

        /*
         * 固定执行顺序：
         * 原始药名 → 清除旧星号 → 本地化映射 → 根据勾选状态添加★。
         */
        return enabled ? '★' + mappedName : mappedName;
    }

    function syncStarPrefixToItems(items, enabled) {
        (Array.isArray(items) ? items : []).forEach(function (item) {
            item.standardName = applyStarPrefix(
                item.standardName || item.sourceName,
                enabled
            );
        });

        return items;
    }

    function syncStarPrefixToResultTable(modal, enabled) {
        const rows = Array.from(modal.querySelectorAll('.herb-result-body tr'));

        if (!rows.length) {
            syncStarPrefixToItems(state.items, enabled);
            return;
        }

        rows.forEach(function (row) {
            const standardInput = row.querySelector('.herb-standard');
            const sourceInput = row.querySelector('.herb-source');

            if (!standardInput) {
                return;
            }

            standardInput.value = applyStarPrefix(
                standardInput.value || (sourceInput ? sourceInput.value : ''),
                enabled
            );
        });

        state.items = readItemsFromTable(modal);
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

    function realClick(element) {
        if (!element) {
            return;
        }

        const win = element.ownerDocument.defaultView;

        element.dispatchEvent(new win.MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: win
        }));

        element.dispatchEvent(new win.MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: win
        }));

        element.click();
    }

    function realDoubleClick(element) {
        if (!element) {
            return;
        }

        const win = element.ownerDocument.defaultView;

        element.dispatchEvent(new win.MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: win,
            detail: 2
        }));
    }

    function pressKey(element, key, keyCode) {
        if (!element) {
            return;
        }

        const win = element.ownerDocument.defaultView;
        const options = {
            key: key,
            code: key,
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        };

        element.dispatchEvent(new win.KeyboardEvent('keydown', options));
        element.dispatchEvent(new win.KeyboardEvent('keyup', options));
    }

    function getAllDocuments() {
        const documents = [];
        const visited = new Set();

        function collect(doc) {
            if (!doc || visited.has(doc)) {
                return;
            }

            visited.add(doc);
            documents.push(doc);

            let frames = [];

            try {
                frames = Array.from(doc.querySelectorAll('iframe,frame'));
            }
            catch (error) {
                return;
            }

            frames.forEach(function (frame) {
                try {
                    const childDocument = frame.contentDocument ||
                        frame.contentWindow.document;

                    if (childDocument) {
                        collect(childDocument);
                    }
                }
                catch (error) {
                    // 跨域iframe无法访问时跳过。
                }
            });
        }

        collect(document);
        return documents;
    }

    function findTextElements(doc, text, fuzzy, scope) {
        const root = scope || doc.body;

        if (!doc || !root) {
            return [];
        }

        const target = normalize(text);
        const exact = [];
        const partial = [];
        const walker = doc.createTreeWalker(
            root,
            doc.defaultView.NodeFilter.SHOW_TEXT
        );

        let node;

        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            const value = normalize(node.nodeValue);

            if (!value || !parent || !isVisible(parent)) {
                continue;
            }

            if (value === target) {
                exact.push(parent);
            }
            else if (fuzzy && value.includes(target)) {
                partial.push(parent);
            }
        }

        const matches = exact.length ? exact : partial;
        const unique = [];
        const seen = new Set();

        matches.forEach(function (element) {
            if (!seen.has(element)) {
                seen.add(element);
                unique.push(element);
            }
        });

        unique.sort(function (a, b) {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();

            return rectA.width * rectA.height -
                rectB.width * rectB.height;
        });

        return unique;
    }

    function setNativeInputValue(doc, input, value, focus, blur) {
        const win = doc.defaultView;
        const prototype = input instanceof win.HTMLTextAreaElement
            ? win.HTMLTextAreaElement.prototype
            : win.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

        if (focus !== false) {
            try {
                input.focus();
            }
            catch (error) {
                // 忽略聚焦失败。
            }
        }

        if (descriptor && descriptor.set) {
            descriptor.set.call(input, String(value));
        }
        else {
            input.value = String(value);
        }

        input.setAttribute('value', String(value));

        if (win.jQuery) {
            win.jQuery(input)
                .val(String(value))
                .trigger('input')
                .trigger('change')
                .trigger('keyup');
        }

        input.dispatchEvent(new win.Event('input', {
            bubbles: true
        }));

        input.dispatchEvent(new win.Event('change', {
            bubbles: true
        }));

        input.dispatchEvent(new win.KeyboardEvent('keyup', {
            bubbles: true,
            cancelable: true,
            key: ''
        }));

        if (blur !== false) {
            input.blur();
        }
    }

    function getSelectVisual(select) {
        if (!select) {
            return null;
        }

        const selector = [
            '.layui-form-select',
            '.select2-container',
            '.el-select',
            '.ant-select',
            '.ivu-select',
            '.combo',
            '.textbox.combo',
            '[role="combobox"]'
        ].join(',');

        const adjacent = [
            select.nextElementSibling,
            select.previousElementSibling
        ].filter(Boolean);

        for (const element of adjacent) {
            if (element.matches && element.matches(selector)) {
                return element;
            }
        }

        let parent = select.parentElement;

        for (let level = 0; parent && level < 4; level += 1) {
            const nested = parent.querySelector(selector);

            if (nested && nested !== select) {
                return nested;
            }

            parent = parent.parentElement;
        }

        return select;
    }

    function findOption(select, desiredText) {
        if (!select || !select.options) {
            return null;
        }

        const target = normalize(desiredText);
        const options = Array.from(select.options || []);

        return options.find(function (option) {
            return normalize(option.textContent) === target;
        }) || options.find(function (option) {
            const value = normalize(option.textContent);

            return value.endsWith(target) || target.endsWith(value);
        }) || null;
    }

    function triggerSelect(doc, select, option) {
        const win = doc.defaultView;

        select.value = option.value;

        Array.from(select.options || []).forEach(function (item) {
            item.selected = item === option;
        });

        if (win.jQuery) {
            win.jQuery(select)
                .val(option.value)
                .trigger('input')
                .trigger('change');
        }

        select.dispatchEvent(new win.Event('input', {
            bubbles: true
        }));

        select.dispatchEvent(new win.Event('change', {
            bubbles: true
        }));

        try {
            if (win.layui &&
                win.layui.form &&
                typeof win.layui.form.render === 'function') {
                win.layui.form.render('select');
            }
        }
        catch (error) {
            console.warn('[中草药自动录入] Layui下拉框重绘失败', error);
        }
    }

    async function chooseVisualOption(doc, visual, desiredText) {
        if (!visual) {
            return false;
        }

        const clickTarget = visual.querySelector([
            '.layui-select-title input',
            '.layui-select-title',
            '.select2-selection',
            '.el-input',
            '.ant-select-selector',
            '.ivu-select-selection',
            '[role="combobox"]'
        ].join(',')) || visual;

        realClick(clickTarget);
        await sleep(160);

        const target = normalize(desiredText);
        const optionSelector = [
            '.layui-form-select dl dd',
            '.select2-results__option',
            '.dropdown-menu li',
            '[role="option"]',
            '.el-select-dropdown__item',
            '.ant-select-item-option',
            '.ivu-select-item'
        ].join(',');

        const options = Array.from(doc.querySelectorAll(optionSelector))
            .filter(isVisible)
            .filter(function (element) {
                return normalize(element.innerText || element.textContent) === target;
            });

        if (!options.length) {
            return false;
        }

        const visualRect = visual.getBoundingClientRect();

        options.sort(function (a, b) {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            const scoreA = Math.abs(rectA.left - visualRect.left) +
                Math.abs(rectA.top - visualRect.bottom);
            const scoreB = Math.abs(rectB.left - visualRect.left) +
                Math.abs(rectB.top - visualRect.bottom);

            return scoreA - scoreB;
        });

        realClick(options[0]);
        await sleep(160);
        return true;
    }

    async function setSelectValue(doc, select, desiredText) {
        const option = findOption(select, desiredText);

        if (!option) {
            const values = Array.from(select.options || [])
                .map(function (item) {
                    return normalizePlainText(item.textContent);
                })
                .filter(Boolean)
                .join('、');

            throw new Error(
                '下拉框中没有“' + desiredText + '”选项；当前选项：' +
                (values || '空')
            );
        }

        const visual = getSelectVisual(select);
        let clicked = false;

        if (visual && visual !== select && isVisible(visual)) {
            clicked = await chooseVisualOption(doc, visual, desiredText);
        }

        if (!clicked) {
            triggerSelect(doc, select, option);
            await sleep(160);
        }
    }

    function showStatus(message, type) {
        const messageType = type || 'normal';
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
            background: colors[messageType] || colors.normal,
            color: '#ffffff',
            fontSize: '13px',
            lineHeight: '1.7',
            whiteSpace: 'pre-line',
            boxShadow: '0 4px 15px rgba(0,0,0,.28)'
        });

        box.textContent = message;

        clearTimeout(box.hideTimer);
        box.hideTimer = setTimeout(function () {
            box.remove();
        }, messageType === 'error' ? 18000 : 8000);
    }

    async function checkpoint() {
        if (state.abortRequested) {
            const error = new Error('用户已中止本次录入');
            error.name = 'AbortError';
            throw error;
        }

        while (state.paused) {
            showStatus('录入已暂停。点击“继续”后从当前步骤继续。', 'warning');
            await sleep(260);

            if (state.abortRequested) {
                const error = new Error('用户已中止本次录入');
                error.name = 'AbortError';
                throw error;
            }
        }
    }

    /******************************************************************
     * 四、中药名称规范化及本地审方
     ******************************************************************/

    function stripPreparationPrefix(name) {
        let value = String(name || '')
            .replace(/[★☆*＊]/g, '')
            .replace(/\s+/g, '')
            .replace(/[（(][^）)]*[）)]/g, '')
            .trim();

        const prefixes = [
            '麸炒',
            '清炒',
            '炒焦',
            '炒炭',
            '酒炙',
            '醋炙',
            '盐炙',
            '姜炙',
            '蜜炙',
            '酒制',
            '醋制',
            '盐制',
            '姜制',
            '制',
            '炙',
            '炒',
            '生'
        ];

        for (const prefix of prefixes) {
            if (value.startsWith(prefix) && value.length > prefix.length + 1) {
                value = value.slice(prefix.length);
                break;
            }
        }

        return value;
    }

    function canonicalHerbName(name) {
        const original = String(name || '')
            .replace(/[★☆*＊]/g, '')
            .replace(/\s+/g, '')
            .trim();
        const value = stripPreparationPrefix(original);

        if (/^(川乌|草乌|乌头|附子|黑顺片|白附片|炮附片|淡附片|盐附子|天雄)$/.test(value)) {
            return '乌头类';
        }

        if (/^(川贝母|浙贝母|平贝母|伊贝母|湖北贝母|贝母)$/.test(value)) {
            return '贝母';
        }

        if (/^(瓜蒌|全瓜蒌|瓜蒌皮|瓜蒌仁|瓜蒌子|天花粉)$/.test(value)) {
            return '瓜蒌';
        }

        if (/^(法半夏|姜半夏|清半夏|生半夏|半夏)$/.test(original) ||
            /^(法半夏|姜半夏|清半夏|半夏)$/.test(value)) {
            return '半夏';
        }

        if (/^(京大戟|红大戟|大戟)$/.test(value)) {
            return '大戟';
        }

        if (/^(北沙参|南沙参|沙参)$/.test(value)) {
            return '沙参';
        }

        if (/^(白芍|赤芍|芍药)$/.test(value)) {
            return '芍药';
        }

        if (/^(朴硝|芒硝|玄明粉)$/.test(value)) {
            return '朴硝';
        }

        if (/^(砒石|砒霜|信石)$/.test(value)) {
            return '砒霜';
        }

        if (/^(牵牛子|黑丑|白丑|二丑|牵牛)$/.test(value)) {
            return '牵牛';
        }

        if (/^(牙硝|芒硝)$/.test(value)) {
            return '牙硝';
        }

        if (/^(肉桂|官桂|桂心)$/.test(value)) {
            return '官桂';
        }

        if (/^(赤石脂|白石脂|石脂)$/.test(value)) {
            return '石脂';
        }

        if (/^(红参|生晒参|人参)$/.test(value)) {
            return '人参';
        }

        if (/^(甘草|炙甘草|生甘草)$/.test(original) || value === '甘草') {
            return '甘草';
        }

        return value;
    }

    function hasCanonicalHerb(items, names) {
        return items.filter(function (item) {
            return item.enabled !== false &&
                names.includes(canonicalHerbName(item.standardName || item.sourceName));
        });
    }

    function auditFormula(items) {
        const enabledItems = items.filter(function (item) {
            return item.enabled !== false;
        });
        const issues = [];

        CLASSIC_CONTRAINDICATION_RULES.forEach(function (rule) {
            const leftItems = hasCanonicalHerb(enabledItems, rule.left);
            const rightItems = hasCanonicalHerb(enabledItems, rule.right);

            if (leftItems.length && rightItems.length) {
                const leftNames = leftItems.map(function (item) {
                    return item.standardName || item.sourceName;
                });
                const rightNames = rightItems.map(function (item) {
                    return item.standardName || item.sourceName;
                });

                issues.push({
                    severity: 'danger',
                    type: rule.type,
                    herbs: leftNames.concat(rightNames),
                    message: rule.type + '提示：' +
                        leftNames.join('、') + ' 与 ' +
                        rightNames.join('、') +
                        '同方出现，请停止自动提交并由医师、药师复核。'
                });
            }
        });

        const nameMap = new Map();

        enabledItems.forEach(function (item) {
            const canonical = canonicalHerbName(item.standardName || item.sourceName);

            if (!canonical) {
                return;
            }

            if (!nameMap.has(canonical)) {
                nameMap.set(canonical, []);
            }

            nameMap.get(canonical).push(item);
        });

        nameMap.forEach(function (sameItems, canonical) {
            if (sameItems.length > 1) {
                issues.push({
                    severity: 'warning',
                    type: '重复用药',
                    herbs: sameItems.map(function (item) {
                        return item.standardName || item.sourceName;
                    }),
                    message: '发现可能重复的饮片：' +
                        sameItems.map(function (item) {
                            return item.standardName || item.sourceName;
                        }).join('、') +
                        '。请核对是否为不同炮制品或重复录入。'
                });
            }
        });

        enabledItems.forEach(function (item) {
            const displayName = item.standardName || item.sourceName || '未命名中药';
            const canonical = canonicalHerbName(displayName);

            if (!Number.isFinite(Number(item.doseG)) || Number(item.doseG) <= 0) {
                issues.push({
                    severity: 'danger',
                    type: '剂量缺失',
                    herbs: [displayName],
                    message: displayName + '未识别到有效克数，禁止自动录入。'
                });
            }

            if (HIGH_RISK_HERBS.includes(canonical) ||
                HIGH_RISK_HERBS.includes(stripPreparationPrefix(displayName)) ||
                HIGH_RISK_HERBS.includes(displayName)) {
                issues.push({
                    severity: 'warning',
                    type: '高风险饮片',
                    herbs: [displayName],
                    message: displayName +
                        '属于需要重点复核的饮片，请核对炮制品、剂量、煎煮方法、处方权限及药房规范。'
                });
            }

            const specialPreparation = String(item.specialPreparation || '');

            if (SPECIAL_PREPARATION_KEYWORDS.some(function (keyword) {
                return specialPreparation.includes(keyword);
            })) {
                issues.push({
                    severity: 'info',
                    type: '特殊煎法',
                    herbs: [displayName],
                    message: displayName + '注明“' + specialPreparation +
                        '”。当前页面截图未显示逐味特殊煎法字段，脚本不会自动代替医嘱备注，请人工确认。'
                });
            }
        });

        return issues;
    }

    function mergeAuditIssues(localIssues, aiIssues) {
        const all = [];
        const seen = new Set();

        [].concat(localIssues || [], aiIssues || []).forEach(function (issue) {
            if (!issue || !issue.message) {
                return;
            }

            const normalizedIssue = {
                severity: ['danger', 'warning', 'info'].includes(issue.severity)
                    ? issue.severity
                    : 'warning',
                type: String(issue.type || '其他'),
                herbs: Array.isArray(issue.herbs) ? issue.herbs : [],
                message: String(issue.message || '').trim()
            };
            const key = normalize(normalizedIssue.type + normalizedIssue.message);

            if (!seen.has(key)) {
                seen.add(key);
                all.push(normalizedIssue);
            }
        });

        all.sort(function (a, b) {
            const order = {
                danger: 0,
                warning: 1,
                info: 2
            };

            return order[a.severity] - order[b.severity];
        });

        return all;
    }

    /******************************************************************
     * 五、处方文本解析
     ******************************************************************/

    function cleanHerbName(name) {
        return String(name || '')
            .replace(/^\s*(?:\d+[.、)）\]]|[-•])\s*/, '')
            .replace(/[★☆*＊]/g, '')
            .replace(/^[：:，,、;；]+|[：:，,、;；]+$/g, '')
            .replace(/\s+/g, '')
            .trim();
    }

    function convertDoseToGram(value, unit) {
        const number = Number(value);
        const normalizedUnit = String(unit || '').toLowerCase();

        if (!Number.isFinite(number)) {
            return {
                doseG: '',
                conversionNote: '剂量无法转换'
            };
        }

        if (normalizedUnit === 'g' || unit === '克') {
            return {
                doseG: number,
                conversionNote: ''
            };
        }

        if (normalizedUnit === 'mg' || unit === '毫克') {
            return {
                doseG: number / 1000,
                conversionNote: unit + '已换算为克'
            };
        }

        return {
            doseG: '',
            conversionNote: '原单位为“' + unit + '”，脚本不自动换算，请人工改成克数'
        };
    }

    function extractSpecialPreparation(text) {
        const found = SPECIAL_PREPARATION_KEYWORDS.filter(function (keyword) {
            return String(text || '').includes(keyword);
        });

        return found.join('、');
    }

    function parseHerbText(text) {
        const source = String(text || '')
            .replace(/\r/g, '\n')
            .replace(/[；;，,、]+/g, '\n')
            .replace(/\n{2,}/g, '\n');
        const lines = source
            .split('\n')
            .map(function (line) {
                return line.trim();
            })
            .filter(Boolean);
        const items = [];

        lines.forEach(function (line) {
            const normalizedLine = line
                .replace(/([克gG毫克mMgG钱两])(?=[\u4e00-\u9fa5★☆*＊])/g, '$1 ')
                .replace(/\s+/g, ' ')
                .trim();

            const regex = /(?:^|\s+)([★☆*＊]?[\u4e00-\u9fa5A-Za-z·\-]{1,24}?)\s*(\d+(?:\.\d+)?)\s*(毫克|mg|MG|克|g|G|钱|两)(?:\s*[（(]([^）)\n]{1,40})[）)])?/g;
            let match;
            let matchedCount = 0;

            while ((match = regex.exec(normalizedLine))) {
                const sourceName = cleanHerbName(match[1]);

                if (!sourceName) {
                    continue;
                }

                const converted = convertDoseToGram(match[2], match[3]);
                const inlineNote = String(match[4] || '').trim();
                const lineSpecial = extractSpecialPreparation(inlineNote ||
                    (matchedCount === 0 ? normalizedLine : ''));

                items.push({
                    enabled: true,
                    sourceName: sourceName,
                    standardName: sourceName,
                    doseG: converted.doseG,
                    originalDose: String(match[2]) + String(match[3]),
                    unit: '克',
                    specialPreparation: inlineNote || lineSpecial,
                    note: converted.conversionNote,
                    aiWarnings: [],
                    confidence: '',
                    status: '待录入',
                    originalIndex: items.length
                });

                matchedCount += 1;
            }

            if (!matchedCount) {
                const fallback = line.match(/^\s*(.+?)\s+(\d+(?:\.\d+)?)\s*(毫克|mg|MG|克|g|G|钱|两)(?:\s*[（(]([^）)]*)[）)])?\s*$/);

                if (fallback) {
                    const converted = convertDoseToGram(fallback[2], fallback[3]);

                    items.push({
                        enabled: true,
                        sourceName: cleanHerbName(fallback[1]),
                        standardName: cleanHerbName(fallback[1]),
                        doseG: converted.doseG,
                        originalDose: String(fallback[2]) + String(fallback[3]),
                        unit: '克',
                        specialPreparation: String(fallback[4] || '').trim(),
                        note: converted.conversionNote,
                        aiWarnings: [],
                        confidence: '',
                        status: '待录入',
                        originalIndex: items.length
                    });
                }
            }
        });

        return items;
    }

    /******************************************************************
     * 六、DeepSeek提取、规范名称与审方
     ******************************************************************/

    function extractJsonObject(text) {
        const content = String(text || '').trim();

        try {
            return JSON.parse(content);
        }
        catch (error) {
            const withoutFence = content
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim();

            try {
                return JSON.parse(withoutFence);
            }
            catch (secondError) {
                const start = withoutFence.indexOf('{');
                const end = withoutFence.lastIndexOf('}');

                if (start >= 0 && end > start) {
                    return JSON.parse(withoutFence.slice(start, end + 1));
                }

                throw secondError;
            }
        }
    }

    function deepSeekRequest(apiKey, model, sourceText, items) {
        const payloadItems = items.map(function (item, index) {
            return {
                index: index,
                sourceName: item.sourceName,
                standardName: removeLeadingStarPrefix(item.standardName),
                doseG: item.doseG,
                originalDose: item.originalDose,
                specialPreparation: item.specialPreparation
            };
        });

        const systemPrompt = [
            '你是中国医院中药饮片处方文字提取与安全审方辅助工具。',
            '必须只输出JSON对象，不要输出Markdown、解释性前言或结尾。',
            '任务一：核对用户文本中的每味中药、炮制品名称、每剂剂量和明确写出的特殊煎法。',
            '任务二：给出适合在医院中药饮片字典中检索的standardName。应保留炮制品差异，例如炒麦芽、炙甘草、制附子，不得擅自改成另一味药。',
            '任务三：审查十八反、十九畏、重复用药、可能的超常剂量、高风险或毒性饮片、特殊煎法。',
            '不得新增用户未提供的药物，不得擅自删除药物，不得自动调整剂量。',
            '对剂量、炮制或配伍不能确定时，必须写“需人工核对”，不得编造确定结论。',
            '患者的妊娠、肝肾功能、过敏史、疾病禁忌未提供时，不得推断患者特异性禁忌。',
            'severity只能是danger、warning、info。',
            '保持items的index和顺序不变。',
            '所有note、warnings、summary必须简洁，避免重复描述，以缩短响应时间。',
            'JSON结构示例：',
            '{"items":[{"index":0,"standardName":"炒麦芽","doseG":15,"specialPreparation":"","confidence":0.95,"note":"","warnings":[]}],"formulaWarnings":[{"severity":"danger","type":"十八反","herbs":["甘草","甘遂"],"message":"同方出现，需医师药师复核"}],"summary":"简短总结"}'
        ].join('\n');

        return deepSeekJsonRequest(
            apiKey,
            model,
            systemPrompt,
            {
                originalText: sourceText,
                parsedItems: payloadItems
            },
            {
                temperature: 0.1,
                maxTokens: 3200,
                maxTokenCeiling: 5200,
                timeoutMs: 70000,
                maxAttempts: 3
            }
        );
    }

    function applyAiResult(items, result) {
        const aiItems = Array.isArray(result.items) ? result.items : [];

        aiItems.forEach(function (aiItem) {
            const index = Number(aiItem.index);

            if (!Number.isInteger(index) || !items[index]) {
                return;
            }

            const target = items[index];

            target.standardName = String(
                aiItem.standardName ||
                target.standardName ||
                target.sourceName
            ).trim();

            if (Number.isFinite(Number(aiItem.doseG)) && Number(aiItem.doseG) > 0) {
                target.doseG = Number(aiItem.doseG);
            }

            target.specialPreparation = String(
                aiItem.specialPreparation ||
                target.specialPreparation ||
                ''
            ).trim();

            target.confidence = Math.max(
                0,
                Math.min(1, Number(aiItem.confidence || 0))
            );

            target.note = [
                target.note,
                String(aiItem.note || '').trim()
            ].filter(Boolean).join('；');

            target.aiWarnings = Array.isArray(aiItem.warnings)
                ? aiItem.warnings.map(function (warning) {
                    return String(warning || '').trim();
                }).filter(Boolean)
                : [];
        });

        const aiIssues = Array.isArray(result.formulaWarnings)
            ? result.formulaWarnings
            : [];
        const localIssues = auditFormula(items);

        state.aiAuditIssues = aiIssues;
        state.auditIssues = mergeAuditIssues(localIssues, state.aiAuditIssues);

        return {
            count: aiItems.length,
            summary: String(result.summary || '').trim()
        };
    }

    /******************************************************************
     * 七、DeepSeek方解与主方判断
     *
     * 说明：
     * 1. 主方判断只作处方结构辅助识别，不替代医师辨证。
     * 2. 当组成不典型时，必须输出“自拟方”或“无法判断”，不能强行套方。
     * 3. 未提供辨证、主治或症状时，只能依据药物组成和剂量关系推测。
     ******************************************************************/

    function deepSeekFormulaRequest(apiKey, model, syndromeText, items) {
        const payloadItems = items.filter(function (item) {
            return item.enabled !== false;
        }).map(function (item, index) {
            return {
                index: index,
                name: removeLeadingStarPrefix(item.standardName || item.sourceName),
                doseG: item.doseG,
                specialPreparation: item.specialPreparation || ''
            };
        });

        const systemPrompt = [
            '你是中医方剂学与临床处方分析辅助工具。',
            '必须只输出JSON对象，不要输出Markdown、前言或结尾。',
            '请根据药物组成、剂量比例以及用户可选提供的辨证或主治信息，完成方解和主方判断。',
            '不得新增处方中不存在的药物，不得把推测写成确定诊断，不得替代医师辨证和药师审方。',
            '主方判断应优先比较经典方、常用经验方及其常见加减；组成不典型时必须判断为“自拟方”或“无法判断”，不得强行套用著名方剂。',
            'classification只能是“原方”“加减方”“合方”“自拟方”“无法判断”之一。',
            'confidence为0到1之间的小数。',
            'matchedHerbs只列与主方核心组成相符的现有药物；missingCoreHerbs列可能缺少的核心药物；addedHerbs列处方中相对主方的加味药。',
            '方解应包括治法、药物配伍层次或药组作用、整体作用；可按君臣佐使分析，但不适合强分时应明确写“按药组分析”。',
            '若未提供辨证信息，pathogenesisInference必须明确说明“仅据方药组成推测”。',
            '各字段保持精炼；reason不超过180字，structureAnalysis不超过300字，integratedExplanation不超过600字。',
            'JSON结构如下：',
            '{"mainFormula":{"name":"方名或空字符串","classification":"原方/加减方/合方/自拟方/无法判断","confidence":0.0,"matchedHerbs":[],"missingCoreHerbs":[],"addedHerbs":[],"reason":"判断依据"},"formulaExplanation":{"treatmentPrinciple":"治法","pathogenesisInference":"病机推测或信息不足说明","structureAnalysis":"君臣佐使或药组分析","integratedExplanation":"完整方解","clinicalCaution":"需人工结合辨证核对的要点"}}'
        ].join('\n');

        return deepSeekJsonRequest(
            apiKey,
            model,
            systemPrompt,
            {
                syndromeOrIndication: String(syndromeText || '').trim(),
                formulaItems: payloadItems
            },
            {
                temperature: 0.12,
                maxTokens: 3600,
                maxTokenCeiling: 5600,
                timeoutMs: 75000,
                maxAttempts: 3
            }
        );
    }

    function toStringArray(value) {
        return Array.isArray(value)
            ? value.map(function (item) {
                return String(item || '').trim();
            }).filter(Boolean)
            : [];
    }

    function applyFormulaAnalysisResult(result) {
        const main = result && result.mainFormula && typeof result.mainFormula === 'object'
            ? result.mainFormula
            : {};
        const explanation = result && result.formulaExplanation &&
            typeof result.formulaExplanation === 'object'
            ? result.formulaExplanation
            : {};
        const classifications = ['原方', '加减方', '合方', '自拟方', '无法判断'];
        const classification = classifications.includes(String(main.classification || '').trim())
            ? String(main.classification).trim()
            : '无法判断';
        const confidence = Math.max(0, Math.min(1, Number(main.confidence || 0)));

        state.formulaAnalysis = {
            mainFormula: {
                name: String(main.name || '').trim(),
                classification: classification,
                confidence: confidence,
                matchedHerbs: toStringArray(main.matchedHerbs),
                missingCoreHerbs: toStringArray(main.missingCoreHerbs),
                addedHerbs: toStringArray(main.addedHerbs),
                reason: String(main.reason || '').trim()
            },
            formulaExplanation: {
                treatmentPrinciple: String(explanation.treatmentPrinciple || '').trim(),
                pathogenesisInference: String(explanation.pathogenesisInference || '').trim(),
                structureAnalysis: String(explanation.structureAnalysis || '').trim(),
                integratedExplanation: String(explanation.integratedExplanation || '').trim(),
                clinicalCaution: String(explanation.clinicalCaution || '').trim()
            }
        };

        return state.formulaAnalysis;
    }

    function getFormulaAnalysisPlainText() {
        const analysis = state.formulaAnalysis;

        if (!analysis) {
            return '';
        }

        const main = analysis.mainFormula || {};
        const explanation = analysis.formulaExplanation || {};
        const displayName = main.name ||
            (main.classification === '自拟方' ? '自拟方' : '未识别明确主方');

        return [
            '主方判断：' + displayName,
            '判断类型：' + (main.classification || '无法判断'),
            '置信度：' + Math.round(Number(main.confidence || 0) * 100) + '%',
            '匹配药味：' + (toStringArray(main.matchedHerbs).join('、') || '无'),
            '可能缺少的核心药：' + (toStringArray(main.missingCoreHerbs).join('、') || '无'),
            '加味药：' + (toStringArray(main.addedHerbs).join('、') || '无'),
            '判断依据：' + (main.reason || '未提供'),
            '治法：' + (explanation.treatmentPrinciple || '未提供'),
            '病机分析：' + (explanation.pathogenesisInference || '未提供'),
            '配伍结构：' + (explanation.structureAnalysis || '未提供'),
            '方解：' + (explanation.integratedExplanation || '未提供'),
            '核对提示：' + (explanation.clinicalCaution || '需结合患者实际辨证及处方目的人工核对。')
        ].join('\n');
    }

    function renderFormulaAnalysis(modal) {
        const box = modal.querySelector('.herb-formula-box');
        const content = modal.querySelector('.herb-formula-content');

        if (!box || !content) {
            return;
        }

        const analysis = state.formulaAnalysis;

        if (!analysis) {
            content.innerHTML = '<div class="herb-formula-empty">解析处方后，点击“生成方解与主方判断”。结果仅供临床辅助核对。</div>';
            return;
        }

        const main = analysis.mainFormula || {};
        const explanation = analysis.formulaExplanation || {};
        const displayName = main.name ||
            (main.classification === '自拟方' ? '自拟方' : '未识别明确主方');
        const listText = function (value) {
            const values = toStringArray(value);
            return values.length ? values.join('、') : '无';
        };

        content.innerHTML = [
            '<div class="herb-formula-main">',
            '<div><strong>主方判断：</strong>' + escapeHtml(displayName) + '</div>',
            '<div><strong>判断类型：</strong>' + escapeHtml(main.classification || '无法判断') +
                '　<strong>置信度：</strong>' + Math.round(Number(main.confidence || 0) * 100) + '%</div>',
            '<div><strong>匹配药味：</strong>' + escapeHtml(listText(main.matchedHerbs)) + '</div>',
            '<div><strong>可能缺少的核心药：</strong>' + escapeHtml(listText(main.missingCoreHerbs)) + '</div>',
            '<div><strong>加味药：</strong>' + escapeHtml(listText(main.addedHerbs)) + '</div>',
            '<div><strong>判断依据：</strong>' + escapeHtml(main.reason || '未提供') + '</div>',
            '</div>',
            '<div class="herb-formula-detail"><strong>治法：</strong>' +
                escapeHtml(explanation.treatmentPrinciple || '未提供') + '</div>',
            '<div class="herb-formula-detail"><strong>病机分析：</strong>' +
                escapeHtml(explanation.pathogenesisInference || '未提供') + '</div>',
            '<div class="herb-formula-detail"><strong>配伍结构：</strong>' +
                escapeHtml(explanation.structureAnalysis || '未提供') + '</div>',
            '<div class="herb-formula-detail"><strong>方解：</strong>' +
                escapeHtml(explanation.integratedExplanation || '未提供') + '</div>',
            '<div class="herb-formula-caution"><strong>核对提示：</strong>' +
                escapeHtml(explanation.clinicalCaution || '需结合患者实际辨证及处方目的人工核对。') + '</div>'
        ].join('');
    }

    /******************************************************************
     * 八、辨证论治与中药处方建议
     *
     * 说明：
     * 1. 输入患者基本病情和中医四诊信息后，由DeepSeek生成辨病、辨证、治法及候选处方。
     * 2. AI候选处方不会直接写入医院系统，必须点击“引用处方到中药文本框”后再次解析、审方和人工确认。
     * 3. 不能确定的信息必须明确列入缺失信息，不得假设妊娠、过敏、肝肾功能等患者特异性情况。
     ******************************************************************/

    function deepSeekTcmPrescriptionRequest(
        apiKey,
        model,
        clinicalText,
        fourDiagnosisText,
        combinedText
    ) {
        const systemPrompt = [
            '你是中国医院中医临床辨证论治与中药饮片处方建议辅助工具。',
            '必须只输出JSON对象，不要输出Markdown、前言或结尾。',
            '本结果仅供有资质医师和临床药师人工复核，不得替代面诊、辨证、处方审核和患者知情。',
            '请综合患者基本病情与中医四诊信息，完成辨病、辨证、病机、治法和候选中药饮片处方。',
            '用户可能分别提供病情和四诊，也可能只在combinedPatientInformation中直接粘贴一整段混合文本。合并文本不要求标题、换行或固定段落；你必须自行识别其中的主诉、病史、诊断、症状、舌象、舌苔、脉象及其他四诊信息。',
            '当combinedPatientInformation非空时，应以该整段文本为主要原始资料，不得因patientClinicalInformation或traditionalChineseMedicineFourExaminations为空而拒绝分析。',
            '患者资料不足时可以给出保守候选，但必须在missingInformation中逐项说明，不得把推测写成确定事实。',
            '不得假设未提供的年龄、体重、妊娠哺乳、过敏史、肝肾功能、出血风险、电解质、合并用药或实验室结果。',
            '药名必须使用规范中药饮片名称并保留必要炮制品差异，例如炙甘草、炒白术、制附子。',
            '每味药必须给出单剂克数doseG；不能确定剂量时不得编造，应减少处方确定性并在warnings或missingInformation中提示。',
            '不得为了凑方强行套用经典方；可判断为原方、加减方、合方、自拟方或无法判断。',
            '处方应尽量精简，避免无依据的大方；默认建议6至18味，确需超出时必须说明理由。',
            '重点核对十八反、十九畏、重复用药、毒性饮片、超常剂量、特殊煎法及老年人常见风险。',
            '高风险或毒性饮片仅在资料充分且确有必要时提出，并必须在warnings和reviewPoints中明确提示炮制、剂量、煎法及人工复核要求。',
            'administration只能是“代煎”“自煎”“外用”“冲服”之一；内服汤剂通常选择“自煎”。',
            'doseCount必须是1至14之间的整数；confidence必须是0到1的小数。',
            'evidence、differentialSyndromes、missingInformation、cautions、adjustments、reviewPoints、warnings均为字符串数组。',
            '为提高响应速度，内容应精炼：每味rationale不超过45字，单条warning不超过50字，overallRationale不超过350字。',
            'JSON结构如下：',
            '{"differentiation":{"diseaseName":"中医病名","syndromeName":"证型","pathogenesis":"病机","treatmentPrinciple":"治法","evidence":[],"differentialSyndromes":[],"missingInformation":[],"cautions":[],"confidence":0.0},"prescription":{"formulaName":"方名或自拟方","classification":"原方/加减方/合方/自拟方/无法判断","doseCount":7,"administration":"自煎","items":[{"name":"黄芪","doseG":20,"specialPreparation":"","role":"君药","rationale":"配伍依据","warnings":[],"confidence":0.9}],"instructions":"水煎服，日一剂，早晚分服；具体按医嘱","adjustments":[],"reviewPoints":[],"overallRationale":"处方整体依据"}}'
        ].join('\n');
        const combinedValue = String(combinedText || '').trim();
        const userPayload = combinedValue
            ? {
                combinedPatientInformation: combinedValue
            }
            : {
                patientClinicalInformation: String(clinicalText || '').trim(),
                traditionalChineseMedicineFourExaminations: String(
                    fourDiagnosisText || ''
                ).trim(),
                combinedPatientInformation: ''
            };

        return deepSeekJsonRequest(
            apiKey,
            model,
            systemPrompt,
            userPayload,
            {
                temperature: 0.12,
                maxTokens: 5000,
                maxTokenCeiling: 7200,
                timeoutMs: 90000,
                maxAttempts: 3
            }
        );
    }

    function normalizeSuggestedAdministration(value) {
        const text = String(value || '').trim();

        if (text.includes('外用')) {
            return '外用';
        }

        if (text.includes('冲服')) {
            return '冲服';
        }

        if (text.includes('代煎')) {
            return '代煎';
        }

        return '自煎';
    }

    function normalizeTcmPrescriptionResult(result) {
        const differentiation = result &&
            result.differentiation &&
            typeof result.differentiation === 'object'
            ? result.differentiation
            : {};
        const prescription = result &&
            result.prescription &&
            typeof result.prescription === 'object'
            ? result.prescription
            : {};
        const rawItems = Array.isArray(prescription.items)
            ? prescription.items
            : [];
        const items = rawItems.map(function (raw) {
            const dose = Number(raw && raw.doseG);
            const confidence = Number(raw && raw.confidence);

            return {
                name: String(raw && raw.name || '').trim(),
                doseG: Number.isFinite(dose) && dose > 0 ? dose : '',
                specialPreparation: String(raw && raw.specialPreparation || '').trim(),
                role: String(raw && raw.role || '').trim(),
                rationale: String(raw && raw.rationale || '').trim(),
                warnings: toStringArray(raw && raw.warnings),
                confidence: Math.max(
                    0,
                    Math.min(
                        1,
                        Number.isFinite(confidence) ? confidence : 0
                    )
                )
            };
        }).filter(function (item) {
            return item.name;
        });
        const rawDoseCount = Number(prescription.doseCount);
        const doseCount = Number.isInteger(rawDoseCount)
            ? Math.max(1, Math.min(14, rawDoseCount))
            : 7;
        const differentiationConfidence = Number(differentiation.confidence);

        if (!items.length) {
            throw new Error('AI未返回可用的中药处方药味，请补充四诊信息后重试');
        }

        state.tcmPrescriptionSuggestion = {
            differentiation: {
                diseaseName: String(differentiation.diseaseName || '').trim(),
                syndromeName: String(differentiation.syndromeName || '').trim(),
                pathogenesis: String(differentiation.pathogenesis || '').trim(),
                treatmentPrinciple: String(differentiation.treatmentPrinciple || '').trim(),
                evidence: toStringArray(differentiation.evidence),
                differentialSyndromes: toStringArray(differentiation.differentialSyndromes),
                missingInformation: toStringArray(differentiation.missingInformation),
                cautions: toStringArray(differentiation.cautions),
                confidence: Math.max(
                    0,
                    Math.min(
                        1,
                        Number.isFinite(differentiationConfidence)
                            ? differentiationConfidence
                            : 0
                    )
                )
            },
            prescription: {
                formulaName: String(prescription.formulaName || '自拟方').trim(),
                classification: String(prescription.classification || '自拟方').trim(),
                doseCount: doseCount,
                administration: normalizeSuggestedAdministration(
                    prescription.administration
                ),
                items: items,
                instructions: String(prescription.instructions || '').trim(),
                adjustments: toStringArray(prescription.adjustments),
                reviewPoints: toStringArray(prescription.reviewPoints),
                overallRationale: String(prescription.overallRationale || '').trim()
            }
        };

        return state.tcmPrescriptionSuggestion;
    }

    function tcmSuggestionAuditItems() {
        const suggestion = state.tcmPrescriptionSuggestion;

        if (!suggestion || !suggestion.prescription) {
            return [];
        }

        return suggestion.prescription.items.map(function (item, index) {
            return {
                enabled: true,
                sourceName: item.name,
                standardName: item.name,
                doseG: item.doseG,
                originalDose: item.doseG === '' ? '' : String(item.doseG) + 'g',
                unit: '克',
                specialPreparation: item.specialPreparation,
                note: '',
                aiWarnings: item.warnings,
                confidence: item.confidence,
                status: 'AI辨证处方候选',
                originalIndex: index
            };
        });
    }

    function prescriptionSuggestionToHerbText() {
        const suggestion = state.tcmPrescriptionSuggestion;

        if (!suggestion || !suggestion.prescription) {
            return '';
        }

        return suggestion.prescription.items.map(function (item) {
            const special = item.specialPreparation
                ? '（' + item.specialPreparation + '）'
                : '';

            return item.name + item.doseG + 'g' + special;
        }).join('、');
    }

    function getTcmPrescriptionPlainText() {
        const suggestion = state.tcmPrescriptionSuggestion;

        if (!suggestion) {
            return '';
        }

        const differentiation = suggestion.differentiation || {};
        const prescription = suggestion.prescription || {};
        const lines = [
            '中医病名：' + (differentiation.diseaseName || '未明确'),
            '中医证型：' + (differentiation.syndromeName || '未明确'),
            '辨证置信度：' + Math.round(Number(differentiation.confidence || 0) * 100) + '%',
            '辨证依据：' + (toStringArray(differentiation.evidence).join('；') || '未提供'),
            '病机分析：' + (differentiation.pathogenesis || '未提供'),
            '治法：' + (differentiation.treatmentPrinciple || '未提供'),
            '鉴别证候：' + (toStringArray(differentiation.differentialSyndromes).join('；') || '无'),
            '主方判断：' + (prescription.formulaName || '自拟方') +
                '（' + (prescription.classification || '自拟方') + '）',
            '建议剂数：' + (prescription.doseCount || 7) + '剂',
            '建议用法：' + resolveHerbAdministration(
                prescription.administration || '自煎'
            ).description,
            '候选处方：'
        ];

        (prescription.items || []).forEach(function (item, index) {
            lines.push(
                String(index + 1) + '. ' + item.name + ' ' + item.doseG + 'g' +
                (item.specialPreparation ? '（' + item.specialPreparation + '）' : '') +
                (item.role ? '；' + item.role : '') +
                (item.rationale ? '；' + item.rationale : '') +
                (item.warnings && item.warnings.length
                    ? '；提示：' + item.warnings.join('、')
                    : '')
            );
        });

        lines.push(
            '整体处方依据：' + (prescription.overallRationale || '未提供'),
            '煎服说明：' + (prescription.instructions || '具体按医嘱'),
            '随证加减：' + (toStringArray(prescription.adjustments).join('；') || '无'),
            '人工复核重点：' + (toStringArray(prescription.reviewPoints).join('；') || '需核对药名、炮制、剂量、煎法及患者禁忌'),
            '资料缺失：' + (toStringArray(differentiation.missingInformation).join('；') || '未列出'),
            '慎用提示：' + (toStringArray(differentiation.cautions).join('；') || '无')
        );

        return lines.join('\n');
    }

    function renderTcmPrescriptionSuggestion(modal) {
        const resultBox = modal.querySelector('.herb-tcm-result');
        const applyButton = modal.querySelector('.herb-tcm-apply');
        const copyButton = modal.querySelector('.herb-tcm-copy');

        if (!resultBox) {
            return;
        }

        const suggestion = state.tcmPrescriptionSuggestion;

        if (!suggestion) {
            resultBox.innerHTML = '<div class="herb-tcm-empty">录入患者基本病情和望、闻、问、切四诊信息后，点击“生成辨证处方建议”。AI结果不会自动写入医院系统。</div>';

            if (applyButton) {
                applyButton.disabled = true;
            }

            if (copyButton) {
                copyButton.disabled = true;
            }

            return;
        }

        const differentiation = suggestion.differentiation || {};
        const prescription = suggestion.prescription || {};
        const auditIssues = auditFormula(tcmSuggestionAuditItems());
        const listHtml = function (values) {
            const items = toStringArray(values);

            return items.length
                ? '<ul>' + items.map(function (item) {
                    return '<li>' + escapeHtml(item) + '</li>';
                }).join('') + '</ul>'
                : '<span class="herb-tcm-muted">无</span>';
        };
        const itemRows = (prescription.items || []).map(function (item, index) {
            return '<tr>' +
                '<td>' + (index + 1) + '</td>' +
                '<td>' + escapeHtml(item.name) + '</td>' +
                '<td>' + escapeHtml(String(item.doseG)) + 'g</td>' +
                '<td>' + escapeHtml(item.specialPreparation || '-') + '</td>' +
                '<td>' + escapeHtml(item.role || '-') + '</td>' +
                '<td class="herb-tcm-left">' + escapeHtml(item.rationale || '-') + '</td>' +
                '<td class="herb-tcm-left">' + escapeHtml(
                    item.warnings && item.warnings.length
                        ? item.warnings.join('；')
                        : '-'
                ) + '</td>' +
                '</tr>';
        }).join('');
        const auditHtml = auditIssues.length
            ? '<div class="herb-tcm-audit"><strong>本地配伍复核：</strong>' +
                auditIssues.map(function (issue) {
                    return '<div class="herb-tcm-audit-item ' +
                        escapeHtml(issue.severity) + '">' +
                        escapeHtml(issue.type + '：' + issue.message) +
                        '</div>';
                }).join('') +
                '</div>'
            : '<div class="herb-tcm-audit safe">本地十八反、十九畏及基础完整性检查未发现红色项目，仍需医师和药师人工复核。</div>';

        resultBox.innerHTML = [
            '<div class="herb-tcm-summary">',
            '<div><strong>中医病名：</strong>' + escapeHtml(differentiation.diseaseName || '未明确') + '</div>',
            '<div><strong>证型：</strong>' + escapeHtml(differentiation.syndromeName || '未明确') +
                '　<strong>置信度：</strong>' + Math.round(Number(differentiation.confidence || 0) * 100) + '%</div>',
            '<div><strong>病机：</strong>' + escapeHtml(differentiation.pathogenesis || '未提供') + '</div>',
            '<div><strong>治法：</strong>' + escapeHtml(differentiation.treatmentPrinciple || '未提供') + '</div>',
            '<div><strong>辨证依据：</strong>' + (toStringArray(differentiation.evidence).join('；')
                ? escapeHtml(toStringArray(differentiation.evidence).join('；'))
                : '未提供') + '</div>',
            '</div>',
            '<div class="herb-tcm-formula-head"><strong>候选处方：</strong>' +
                escapeHtml(prescription.formulaName || '自拟方') +
                '（' + escapeHtml(prescription.classification || '自拟方') + '）' +
                '　' + escapeHtml(String(prescription.doseCount || 7)) + '剂' +
                '　' + escapeHtml(resolveHerbAdministration(
                    prescription.administration || '自煎'
                ).description) +
                '</div>',
            '<div class="herb-tcm-table-wrap"><table class="herb-tcm-table"><thead><tr>',
            '<th>序</th><th>药名</th><th>剂量</th><th>特殊煎法</th><th>配伍角色</th><th>依据</th><th>提示</th>',
            '</tr></thead><tbody>' + itemRows + '</tbody></table></div>',
            '<div class="herb-tcm-detail"><strong>整体处方依据：</strong>' + escapeHtml(prescription.overallRationale || '未提供') + '</div>',
            '<div class="herb-tcm-detail"><strong>煎服说明：</strong>' + escapeHtml(prescription.instructions || '具体按医嘱') + '</div>',
            '<div class="herb-tcm-detail"><strong>随证加减：</strong>' + listHtml(prescription.adjustments) + '</div>',
            '<div class="herb-tcm-detail"><strong>人工复核重点：</strong>' + listHtml(prescription.reviewPoints) + '</div>',
            '<div class="herb-tcm-detail"><strong>鉴别证候：</strong>' + listHtml(differentiation.differentialSyndromes) + '</div>',
            '<div class="herb-tcm-detail warning"><strong>缺失信息：</strong>' + listHtml(differentiation.missingInformation) + '</div>',
            '<div class="herb-tcm-detail warning"><strong>慎用提示：</strong>' + listHtml(differentiation.cautions) + '</div>',
            auditHtml,
            '<div class="herb-tcm-disclaimer">该处方为AI辨证候选，不得直接替代面诊、医师处方和药师审核。引用后仍需使用本脚本审方并逐味人工核对。</div>'
        ].join('');

        if (applyButton) {
            applyButton.disabled = false;
        }

        if (copyButton) {
            copyButton.disabled = false;
        }
    }

    function setTcmPrescriptionCollapsed(modal, collapsed, save) {
        const section = modal.querySelector('.herb-tcm-section');
        const toggle = modal.querySelector('.herb-tcm-toggle');

        if (!section || !toggle) {
            return;
        }

        section.classList.toggle('collapsed', Boolean(collapsed));
        toggle.textContent = collapsed ? '展开' : '折叠';

        if (save !== false) {
            GM_setValue(KEYS.tcmPrescriptionCollapsed, Boolean(collapsed));
        }
    }


    /*
     * 辨证输入框支持两种显示方式：
     * 1. split：患者基本病情与中医四诊分开填写；
     * 2. merged：在同一文本框中直接粘贴病情与四诊混合文本。
     *
     * 合并模式不要求固定标题、段落或换行。生成处方时整段原文会直接发送给DeepSeek，
     * 同时脚本可做辅助拆解以便切换回双框模式，但拆解结果不作为合并模式的硬性前提。
     */
    function buildMergedTcmInformation(clinicalText, fourDiagnosisText) {
        const clinicalValue = String(clinicalText || '').trim();
        const fourValue = String(fourDiagnosisText || '').trim();

        if (!clinicalValue && !fourValue) {
            return '';
        }

        return [
            '【患者基本病情信息】',
            clinicalValue,
            '',
            '【中医四诊信息】',
            fourValue
        ].join('\n').trim();
    }

    function splitMergedTcmInformation(value) {
        const source = String(value || '')
            .replace(/\r\n?/g, '\n')
            .trim();

        if (!source) {
            return {
                clinicalText: '',
                fourDiagnosisText: '',
                method: 'empty'
            };
        }

        const clinicalPattern = /(?:^|\n)\s*(?:【\s*)?患者(?:基本)?病情(?:信息)?(?:\s*】)?\s*[:：]?\s*/i;
        const fourPattern = /(?:^|\n)\s*(?:【\s*)?中医四诊(?:信息)?(?:\s*】)?\s*[:：]?\s*/i;
        const clinicalMatch = clinicalPattern.exec(source);
        const fourMatch = fourPattern.exec(source);

        if (clinicalMatch && fourMatch) {
            if (clinicalMatch.index < fourMatch.index) {
                return {
                    clinicalText: source.slice(
                        clinicalMatch.index + clinicalMatch[0].length,
                        fourMatch.index
                    ).trim(),
                    fourDiagnosisText: source.slice(
                        fourMatch.index + fourMatch[0].length
                    ).trim(),
                    method: 'headings'
                };
            }

            return {
                clinicalText: source.slice(
                    clinicalMatch.index + clinicalMatch[0].length
                ).trim(),
                fourDiagnosisText: source.slice(
                    fourMatch.index + fourMatch[0].length,
                    clinicalMatch.index
                ).trim(),
                method: 'headings'
            };
        }

        if (fourMatch) {
            return {
                clinicalText: source.slice(0, fourMatch.index).trim(),
                fourDiagnosisText: source.slice(
                    fourMatch.index + fourMatch[0].length
                ).trim(),
                method: 'single-heading'
            };
        }

        if (clinicalMatch) {
            return {
                clinicalText: source.slice(
                    clinicalMatch.index + clinicalMatch[0].length
                ).trim(),
                fourDiagnosisText: '',
                method: 'single-heading'
            };
        }

        /*
         * 对无标题、无分段的连续文本进行辅助拆解。
         * 先按句号、分号、逗号及换行切成短语，再把明显属于舌、苔、脉、
         * 望闻问切及寒热饮食二便等内容归入四诊，其余归入基本病情。
         * 该拆解只服务于切换回双框模式；合并模式生成时始终保留并发送原文。
         */
        const fourKeywords = /(?:望诊|闻诊|问诊|切诊|四诊|神色|面色|形态|声音|气味|舌|苔|脉|寒热|恶寒|畏寒|发热|潮热|汗出|盗汗|自汗|口渴|口干|口苦|口黏|纳差|食欲|饮食|睡眠|失眠|多梦|大便|便秘|便溏|小便|尿赤|夜尿|二便|月经|带下|按诊)/;
        const fragments = source
            .replace(/([。；;！？!?，,])/g, '$1\n')
            .split('\n')
            .map(function (fragment) {
                return fragment.trim();
            })
            .filter(Boolean);
        const clinicalFragments = [];
        const fourFragments = [];

        fragments.forEach(function (fragment) {
            if (fourKeywords.test(fragment)) {
                fourFragments.push(fragment);
            }
            else {
                clinicalFragments.push(fragment);
            }
        });

        return {
            clinicalText: clinicalFragments.join('').trim(),
            fourDiagnosisText: fourFragments.join('').trim(),
            method: fourFragments.length ? 'keywords' : 'unrecognized'
        };
    }

    function setTcmInputMode(modal, mode, save) {
        const section = modal.querySelector('.herb-tcm-section');
        const mergeButton = modal.querySelector('.herb-tcm-merge');
        const splitButton = modal.querySelector('.herb-tcm-split');
        const normalizedMode = mode === 'merged' ? 'merged' : 'split';

        if (!section) {
            return;
        }

        section.classList.toggle(
            'merged-input-mode',
            normalizedMode === 'merged'
        );
        section.dataset.inputMode = normalizedMode;

        if (mergeButton) {
            mergeButton.disabled = normalizedMode === 'merged';
        }

        if (splitButton) {
            splitButton.disabled = normalizedMode === 'split';
        }

        if (save !== false) {
            GM_setValue(KEYS.tcmInputMode, normalizedMode);
        }
    }

    function syncMergedTcmTextFromSplit(modal) {
        const clinicalInput = modal.querySelector('.herb-tcm-clinical-text');
        const fourInput = modal.querySelector('.herb-tcm-four-text');
        const mergedInput = modal.querySelector('.herb-tcm-merged-text');

        if (!clinicalInput || !fourInput || !mergedInput) {
            return '';
        }

        const mergedValue = buildMergedTcmInformation(
            clinicalInput.value,
            fourInput.value
        );

        mergedInput.value = mergedValue;
        GM_setValue(KEYS.tcmMergedText, mergedValue);

        return mergedValue;
    }

    function syncSplitTcmTextFromMerged(modal, showWarning) {
        const clinicalInput = modal.querySelector('.herb-tcm-clinical-text');
        const fourInput = modal.querySelector('.herb-tcm-four-text');
        const mergedInput = modal.querySelector('.herb-tcm-merged-text');

        if (!clinicalInput || !fourInput || !mergedInput) {
            return {
                clinicalText: '',
                fourDiagnosisText: '',
                method: 'missing-elements'
            };
        }

        const parsed = splitMergedTcmInformation(mergedInput.value);

        clinicalInput.value = parsed.clinicalText;
        fourInput.value = parsed.fourDiagnosisText;
        GM_setValue(KEYS.tcmClinicalText, clinicalInput.value);
        GM_setValue(KEYS.tcmFourDiagnosisText, fourInput.value);
        GM_setValue(KEYS.tcmMergedText, mergedInput.value);

        if (showWarning && parsed.method === 'keywords') {
            showStatus(
                '合并文本未使用标准标题，脚本已按句子及舌、苔、脉等关键词辅助拆解。原合并文本未被修改，请人工核对两个信息框。',
                'warning'
            );
        }
        else if (showWarning && parsed.method === 'unrecognized') {
            showStatus(
                '未识别到明确四诊关键词，拆解时已将原文保留在患者基本病情框。合并模式仍可直接使用整段原文生成，但四诊不足会降低辨证可靠性。',
                'warning'
            );
        }

        return parsed;
    }

    async function copyTextToClipboard(text) {
        const value = String(text || '');

        if (!value) {
            throw new Error('当前没有可复制的方解结果');
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(value);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const success = document.execCommand('copy');
        textarea.remove();

        if (!success) {
            throw new Error('浏览器未允许复制，请手动选择结果文字');
        }
    }

    /******************************************************************
     * 七、定位“中草药”页面及表格
     ******************************************************************/

    async function activateHerbTab() {
        const candidates = [];

        for (const doc of getAllDocuments()) {
            const elements = findTextElements(doc, '中草药', false);

            elements.forEach(function (element) {
                const clickable = element.closest('a,li,button,[role="tab"]') || element;
                const rect = clickable.getBoundingClientRect();
                const classText = String(clickable.className || '').toLowerCase();
                let score = rect.top + rect.left / 20;

                if (/active|selected|current/.test(classText)) {
                    score -= 5000;
                }

                if (/A|LI|BUTTON/.test(clickable.tagName)) {
                    score -= 500;
                }

                candidates.push({
                    element: clickable,
                    score: score
                });
            });
        }

        if (!candidates.length) {
            throw new Error('未找到“中草药”标签页');
        }

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        const tab = candidates[0].element;
        const classText = String(tab.className || '').toLowerCase();
        const parentClass = String(tab.parentElement ? tab.parentElement.className : '').toLowerCase();

        if (!/active|selected|current/.test(classText + ' ' + parentClass)) {
            realClick(tab);
            await sleep(550);
        }
    }

    function getTablePlainText(element) {
        return String(element &&
            (element.innerText || element.textContent) || '').trim();
    }

    function getTableHeaderPlainText(table) {
        if (!table) {
            return '';
        }

        const headers = Array.from(table.querySelectorAll(
            'thead th,th,[role="columnheader"]'
        )).filter(isVisible);

        return headers.map(function (header) {
            return getTablePlainText(header);
        }).filter(Boolean).join(' ');
    }

    function getActualTable(root) {
        if (!root) {
            return null;
        }

        if (root.tagName === 'TABLE') {
            return root;
        }

        const tables = Array.from(root.querySelectorAll('table'))
            .filter(isVisible);

        if (!tables.length) {
            return root;
        }

        tables.sort(function (a, b) {
            const cellsA = a.querySelectorAll('td').length;
            const cellsB = b.querySelectorAll('td').length;

            return cellsB - cellsA;
        });

        return tables[0];
    }

    function getHerbDataRows(table) {
        if (!table) {
            return [];
        }

        const selectors = [
            'tbody tr',
            '.layui-table-body tr',
            '.datagrid-body .datagrid-row',
            '.datagrid-row',
            '[role="row"]'
        ].join(',');

        const rows = Array.from(table.querySelectorAll(selectors))
            .filter(isVisible)
            .filter(function (row) {
                if (row.closest('#' + IDS.modal)) {
                    return false;
                }

                if (row.querySelector('th')) {
                    return false;
                }

                const cells = Array.from(row.querySelectorAll('td,[role="gridcell"]'))
                    .filter(isVisible);
                const text = normalize(getTablePlainText(row));

                if (cells.length < 6 || !text || /暂无数据|无数据|没有数据/.test(text)) {
                    return false;
                }

                return true;
            });
        const unique = [];
        const seen = new Set();

        rows.forEach(function (row) {
            if (!seen.has(row)) {
                seen.add(row);
                unique.push(row);
            }
        });

        unique.sort(function (a, b) {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();

            return rectA.top - rectB.top;
        });

        /*
         * 固定列表格可能在主数据区左右各渲染一份同一行。按纵向位置
         * 合并这些可视克隆，并保留可见单元格最多、宽度最大的主行，
         * 防止一条新医嘱被错误计成两行或更多行。
         */
        const visualRows = [];

        unique.forEach(function (row) {
            const rect = row.getBoundingClientRect();
            const duplicateIndex = visualRows.findIndex(function (existing) {
                const existingRect = existing.getBoundingClientRect();

                return Math.abs(existingRect.top - rect.top) <= 2 &&
                    Math.abs(existingRect.bottom - rect.bottom) <= 2;
            });

            if (duplicateIndex < 0) {
                visualRows.push(row);
                return;
            }

            const existing = visualRows[duplicateIndex];
            const existingRect = existing.getBoundingClientRect();
            const existingCellCount = getRowCells(existing).length;
            const currentCellCount = getRowCells(row).length;

            if (
                currentCellCount > existingCellCount ||
                (
                    currentCellCount === existingCellCount &&
                    rect.width > existingRect.width
                )
            ) {
                visualRows[duplicateIndex] = row;
            }
        });

        visualRows.sort(function (a, b) {
            return a.getBoundingClientRect().top -
                b.getBoundingClientRect().top;
        });

        return visualRows;
    }

    /*
     * 新版页面可能把表头和数据行渲染在两个独立table（或虚拟表格容器）中。
     * 后续药品联想候选扫描必须排除真正的数据区，不能仍只排除表头table。
     */
    function getHerbDataRoot(root, table, rows) {
        if (!rows || !rows.length) {
            return table || root;
        }

        const firstRowRoot = rows[0].closest([
            'table',
            '.layui-table-body',
            '.datagrid-body',
            '[role="rowgroup"]',
            '[role="grid"]'
        ].join(','));

        if (
            firstRowRoot &&
            rows.every(function (row) {
                return firstRowRoot.contains(row);
            })
        ) {
            return firstRowRoot;
        }

        return root || table;
    }

    function buildHeaderCenters(table) {
        const labels = [
            '组号',
            '名称',
            '开始时间',
            '规格',
            '剂数',
            '剂量',
            '单位',
            '用法',
            '自付比例',
            '嘱托',
            '代煎',
            '出院带药',
            '转自费',
            '计费',
            '精麻',
            '操作'
        ];
        const centers = {};
        const headers = Array.from(table.querySelectorAll('thead th,th,[role="columnheader"]'))
            .filter(isVisible);

        labels.forEach(function (label) {
            const target = normalize(label);
            const candidates = headers.filter(function (header) {
                const text = normalize(header.innerText || header.textContent);

                return text === target || text.endsWith(target);
            });

            if (!candidates.length) {
                return;
            }

            candidates.sort(function (a, b) {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();
                const textA = normalize(a.innerText || a.textContent);
                const textB = normalize(b.innerText || b.textContent);
                const exactA = textA === target ? -10000 : 0;
                const exactB = textB === target ? -10000 : 0;

                return exactA + rectA.width * rectA.height -
                    (exactB + rectB.width * rectB.height);
            });

            const rect = candidates[0].getBoundingClientRect();
            centers[label] = rect.left + rect.width / 2;
        });

        return centers;
    }

    function findHerbTableContext() {
        const candidates = [];

        for (const doc of getAllDocuments()) {
            const roots = Array.from(doc.querySelectorAll([
                'table',
                '.layui-table-view',
                '.datagrid',
                '[role="grid"]'
            ].join(',')))
                .filter(isVisible)
                .filter(function (root) {
                    return !root.closest('#' + IDS.modal);
                });

            roots.forEach(function (root) {
                const table = getActualTable(root);
                const rootText = normalize(getTablePlainText(root));
                const headerText = normalize(
                    getTableHeaderPlainText(root) ||
                    getTableHeaderPlainText(table)
                );
                const signalText = headerText || rootText;
                const perRowKeywords = [
                    '名称',
                    '剂数',
                    '剂量',
                    '单位',
                    '用法',
                    '代煎',
                    '操作'
                ];
                const unifiedFooterKeywords = [
                    '名称',
                    '开始时间',
                    '规格',
                    '剂量',
                    '单位',
                    '自付比例',
                    '嘱托',
                    '操作'
                ];
                const perRowHitCount = perRowKeywords.filter(function (keyword) {
                    return signalText.includes(normalize(keyword));
                }).length;
                const unifiedFooterHitCount = unifiedFooterKeywords.filter(function (keyword) {
                    return signalText.includes(normalize(keyword));
                }).length;
                const hasPerRowPrescriptionColumns = [
                    '剂数',
                    '用法',
                    '代煎'
                ].filter(function (keyword) {
                    return signalText.includes(normalize(keyword));
                }).length >= 2;
                let entryMode = '';

                if (perRowHitCount >= 6 && hasPerRowPrescriptionColumns) {
                    entryMode = 'per-row';
                }
                else if (
                    unifiedFooterHitCount >= 6 &&
                    ['名称', '剂量', '单位', '操作'].every(function (keyword) {
                        return signalText.includes(normalize(keyword));
                    })
                ) {
                    entryMode = 'unified-footer';
                }

                if (!entryMode) {
                    return;
                }

                /*
                 * 必须从候选外层root采集行，而不是只从getActualTable()
                 * 选中的单个table采集。新版会将表头table与数据table分离；
                 * 只扫描其中一个table时，页面已经出现的首行会被误判为0行。
                 */
                const rows = getHerbDataRows(root);
                const dataRoot = getHerbDataRoot(root, table, rows);
                const rect = root.getBoundingClientRect();
                const hitCount = entryMode === 'per-row'
                    ? perRowHitCount
                    : unifiedFooterHitCount;
                let score = hitCount * 5000 + rows.length * 600;

                if (rootText.includes(normalize('中草药'))) {
                    score += 2000;
                }

                if (headerText) {
                    score += 1200;
                }

                score -= rect.width * rect.height / 100000;

                candidates.push({
                    doc: doc,
                    root: root,
                    table: table,
                    dataRoot: dataRoot,
                    rows: rows,
                    headerCenters: buildHeaderCenters(root),
                    entryMode: entryMode,
                    score: score
                });
            });
        }

        if (!candidates.length) {
            return null;
        }

        /*
         * 同一网格常同时产生“仅表头table”和“含数据区的外层容器”两个
         * 候选。只要页面已经存在数据行，就必须优先选含行的候选；否则
         * 表头候选会因尺寸更小或表头加分而持续胜出，造成新增行误判。
         */
        const candidatesWithRows = candidates.filter(function (candidate) {
            return candidate.rows.length > 0;
        });
        const candidatePool = candidatesWithRows.length
            ? candidatesWithRows
            : candidates;

        candidatePool.sort(function (a, b) {
            return b.score - a.score;
        });

        return candidatePool[0];
    }

    function getRowCells(row) {
        return Array.from(row.querySelectorAll('td,[role="gridcell"]'))
            .filter(isVisible)
            .sort(function (a, b) {
                return a.getBoundingClientRect().left -
                    b.getBoundingClientRect().left;
            });
    }

    function getCellByColumn(context, row, label) {
        const cells = getRowCells(row);
        const center = context.headerCenters[label];

        if (Number.isFinite(center)) {
            const covering = cells.filter(function (cell) {
                const rect = cell.getBoundingClientRect();

                return center >= rect.left - 2 && center <= rect.right + 2;
            });

            if (covering.length) {
                covering.sort(function (a, b) {
                    return a.getBoundingClientRect().width -
                        b.getBoundingClientRect().width;
                });

                return covering[0];
            }

            const nearest = cells.map(function (cell) {
                const rect = cell.getBoundingClientRect();

                return {
                    cell: cell,
                    distance: Math.abs(rect.left + rect.width / 2 - center)
                };
            }).sort(function (a, b) {
                return a.distance - b.distance;
            });

            if (nearest[0]) {
                return nearest[0].cell;
            }
        }

        const fallbackMap = context.entryMode === 'unified-footer'
            ? UNIFIED_FOOTER_COLUMN_FALLBACK_INDEX
            : COLUMN_FALLBACK_INDEX;
        const fallbackIndex = fallbackMap[label];

        return Number.isInteger(fallbackIndex) ? cells[fallbackIndex] || null : null;
    }

    function findVisibleInputInCell(cell) {
        if (!cell) {
            return null;
        }

        return Array.from(cell.querySelectorAll(
            'input:not([type="hidden"]):not([disabled]),textarea:not([disabled])'
        )).filter(isVisible)[0] || null;
    }

    function findSelectInCell(cell) {
        if (!cell) {
            return null;
        }

        return Array.from(cell.querySelectorAll('select:not([disabled])'))[0] || null;
    }

    async function waitForHerbContext(timeout, requireRows) {
        const deadline = Date.now() + (timeout || 6000);
        const mustHaveRows = requireRows !== false;

        while (Date.now() < deadline) {
            const context = findHerbTableContext();

            if (context && (!mustHaveRows || context.rows.length)) {
                return context;
            }

            await sleep(180);
        }

        throw new Error(
            mustHaveRows
                ? '未识别到中草药录入表格或可填写医嘱行'
                : '未识别到中草药录入表格'
        );
    }

    /******************************************************************
     * 八、增加处方行
     ******************************************************************/

    /*
     * 清理按钮文字中的图标字体、emoji、重复空白和常见装饰字符。
     * 医院页面中的“新医嘱”按钮前方可能带图标字体，文字也可能被框架
     * 重复读取成“新医嘱新医嘱”，因此不能再使用全文精确相等判断。
     */
    function normalizeActionLabel(text) {
        return String(text || '')
            .replace(/[\uE000-\uF8FF]/g, '')
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
            .replace(/\s+/g, '')
            .replace(/[：:·•|｜]/g, '')
            .trim()
            .toLowerCase();
    }

    function isNewOrderLabel(text) {
        const value = normalizeActionLabel(text);

        return value.includes('新医嘱') ||
            value.includes('新增医嘱') ||
            value.includes('新建医嘱');
    }

    function isInteractiveLike(element) {
        if (!element || !element.isConnected) {
            return false;
        }

        const tagName = String(element.tagName || '').toUpperCase();
        const classText = String(element.className || '');
        const role = String(element.getAttribute('role') || '').toLowerCase();
        const tabIndex = element.getAttribute('tabindex');
        let cursor = '';

        try {
            cursor = element.ownerDocument.defaultView
                .getComputedStyle(element)
                .cursor;
        }
        catch (error) {
            cursor = '';
        }

        return /^(BUTTON|A|INPUT|LABEL)$/.test(tagName) ||
            role === 'button' ||
            typeof element.onclick === 'function' ||
            element.hasAttribute('onclick') ||
            tabIndex === '0' ||
            cursor === 'pointer' ||
            /(?:^|[\s_-])(btn|button|linkbutton|l-btn|layui-btn|easyui-linkbutton|ui-button|el-button|ant-btn|ivu-btn|mini-button)(?:$|[\s_-])/i.test(classText);
    }

    /*
     * 从“新医嘱”文字节点向上寻找真正承担点击事件的父控件。
     * 最多向上检查7层，兼容事件绑定在普通div、span或框架外层控件的情况。
     */
    function resolveNewOrderClickable(textElement) {
        if (!textElement) {
            return null;
        }

        let current = textElement;
        let fallback = null;

        for (let level = 0; current && level < 7; level += 1) {
            if (current.closest &&
                (current.closest('#' + IDS.modal) || current.closest('#' + IDS.panel))) {
                return null;
            }

            if (isVisible(current)) {
                const rect = current.getBoundingClientRect();
                const ownText = getButtonText(current);

                if (isNewOrderLabel(ownText) &&
                    rect.width >= 8 && rect.height >= 8 &&
                    rect.width <= 520 && rect.height <= 150) {
                    if (!fallback || rect.width * rect.height <
                        fallback.getBoundingClientRect().width *
                        fallback.getBoundingClientRect().height) {
                        fallback = current;
                    }

                    if (isInteractiveLike(current)) {
                        return current;
                    }
                }
            }

            current = current.parentElement;
        }

        return fallback;
    }

    function collectNewOrderTextElements(doc) {
        const result = [];
        const seen = new Set();

        function add(element) {
            if (!element || seen.has(element) || !isVisible(element)) {
                return;
            }

            seen.add(element);
            result.push(element);
        }

        const directSelector = [
            'button',
            'a',
            'input[type="button"]',
            'input[type="submit"]',
            '[role="button"]',
            '[onclick]',
            '[title*="新医嘱"]',
            '[aria-label*="新医嘱"]',
            '[data-title*="新医嘱"]',
            '.layui-btn',
            '.btn',
            '.easyui-linkbutton',
            '.l-btn',
            '.ui-button',
            '.el-button',
            '.ant-btn',
            '.ivu-btn',
            'span',
            'div'
        ].join(',');

        Array.from(doc.querySelectorAll(directSelector))
            .filter(isVisible)
            .forEach(function (element) {
                const rect = element.getBoundingClientRect();

                if (rect.width > 650 || rect.height > 180) {
                    return;
                }

                if (isNewOrderLabel(getButtonText(element))) {
                    add(element);
                }
            });

        /*
         * 再扫描文本节点，可识别“图标span＋文字span＋外层div”的结构。
         */
        if (doc.body && doc.createTreeWalker) {
            const walker = doc.createTreeWalker(
                doc.body,
                doc.defaultView.NodeFilter.SHOW_TEXT
            );
            let node;

            while ((node = walker.nextNode())) {
                if (!isNewOrderLabel(node.nodeValue)) {
                    continue;
                }

                add(node.parentElement);
            }
        }

        return result;
    }

    /*
     * 查找页面下方“新医嘱”按钮，兼容：
     * 1. 按钮前有图标字体；
     * 2. 文字被重复读取成“新医嘱新医嘱”；
     * 3. 文字位于span，点击事件绑定在外层div或a；
     * 4. EasyUI、Layui、Element等框架按钮；
     * 5. 普通div通过事件委托响应点击。
     */
    function findNewHerbOrderButton(context) {
        const candidates = [];
        const seen = new Set();
        const preferredDoc = context ? context.doc : null;
        const rootRect = context && context.root && isVisible(context.root)
            ? context.root.getBoundingClientRect()
            : null;

        getAllDocuments().forEach(function (doc) {
            collectNewOrderTextElements(doc).forEach(function (textElement) {
                const clickable = resolveNewOrderClickable(textElement);

                if (!clickable || seen.has(clickable) ||
                    clickable.disabled ||
                    clickable.getAttribute('aria-disabled') === 'true') {
                    return;
                }

                seen.add(clickable);

                const rect = clickable.getBoundingClientRect();
                const height = doc.defaultView.innerHeight;
                const width = doc.defaultView.innerWidth;
                const label = normalizeActionLabel(getButtonText(clickable));
                const centerX = rect.left + rect.width / 2;
                let score = Math.abs(height - rect.bottom) +
                    Math.abs(width * 0.72 - centerX) / 5;

                if (doc === preferredDoc) {
                    score -= 4500;
                }

                if (rect.top > height * 0.55) {
                    score -= 2600;
                }

                if (rect.top > height * 0.68) {
                    score -= 1300;
                }

                if (rootRect && doc === preferredDoc) {
                    if (rect.top >= rootRect.top) {
                        score -= 700;
                    }

                    score += Math.abs(rect.right - rootRect.right) / 18;
                }

                if (label === '新医嘱' || label === '新医嘱新医嘱') {
                    score -= 2200;
                }
                else if (label.includes('新医嘱')) {
                    score -= 1200;
                }

                if (isInteractiveLike(clickable)) {
                    score -= 700;
                }

                const nearbyText = normalizePlainText(
                    clickable.parentElement
                        ? clickable.parentElement.innerText || clickable.parentElement.textContent
                        : ''
                );

                if (/药房|临时医嘱|科室库存/.test(nearbyText)) {
                    score -= 900;
                }

                candidates.push({
                    doc: doc,
                    element: clickable,
                    textElement: textElement,
                    label: label,
                    score: score
                });
            });
        });

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        if (candidates.length) {
            console.info('[中草药自动录入] 新医嘱按钮候选：', candidates.slice(0, 5).map(function (item) {
                return {
                    label: item.label,
                    tag: item.element.tagName,
                    className: String(item.element.className || ''),
                    score: Math.round(item.score)
                };
            }));
        }

        return candidates[0] || null;
    }

    /*
     * 当前中草药表格没有任何医嘱行时，自动点击页面下方“新医嘱”。
     * 点击后必须实际检测到行数增加才继续，防止误点或页面尚未初始化完成。
     */
    async function createFirstHerbOrderRow(context) {
        const beforeCount = context && context.rows
            ? context.rows.length
            : 0;
        const found = findNewHerbOrderButton(context);

        if (!found) {
            throw new Error(
                '当前没有可填写的中草药医嘱行，且未找到页面下方“新医嘱”按钮。' +
                '请先手工点击“新医嘱”后重试。'
            );
        }

        found.element.scrollIntoView({
            block: 'center',
            behavior: 'auto'
        });

        await sleep(150);
        realClick(found.element);

        const deadline = Date.now() + 5000;

        while (Date.now() < deadline) {
            await sleep(160);

            const refreshed = findHerbTableContext();

            if (refreshed && refreshed.rows.length > beforeCount) {
                showStatus('未发现可填写医嘱行，已自动点击“新医嘱”创建中草药首行。', 'success');
                return refreshed;
            }
        }

        /*
         * 某些旧控件第一次点击只获得焦点，再补一次双击作为兜底。
         */
        realDoubleClick(found.element);

        const secondDeadline = Date.now() + 3500;

        while (Date.now() < secondDeadline) {
            await sleep(160);

            const refreshed = findHerbTableContext();

            if (refreshed && refreshed.rows.length > beforeCount) {
                showStatus('已通过“新医嘱”创建中草药首行。', 'success');
                return refreshed;
            }
        }

        throw new Error(
            '已点击页面下方“新医嘱”，但没有检测到新的中草药医嘱行。' +
            '请检查页面是否弹出提示，或是否需要先选择药房。'
        );
    }

    function findOperationButton(cell, kind) {
        if (!cell) {
            return null;
        }

        const elements = Array.from(cell.querySelectorAll(
            'button,a,input[type="button"],[role="button"],i,span,div'
        )).filter(isVisible);
        const keywordPattern = kind === 'plus'
            ? /(?:^\+$|增加|新增|添加|add|plus|icon-plus|fa-plus|layui-icon-add)/i
            : /(?:^-$|删除|移除|remove|minus|icon-minus|fa-minus|layui-icon-subtraction)/i;
        const candidates = elements.filter(function (element) {
            const text = [
                element.innerText || '',
                element.textContent || '',
                element.getAttribute('title') || '',
                element.getAttribute('aria-label') || '',
                element.className || ''
            ].join(' ');

            return keywordPattern.test(text.trim());
        });

        if (!candidates.length) {
            return null;
        }

        candidates.sort(function (a, b) {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();

            return rectA.width * rectA.height -
                rectB.width * rectB.height;
        });

        return candidates[0].closest('button,a,[role="button"]') || candidates[0];
    }

    async function ensureHerbRowCount(requiredCount) {
        /*
         * 先允许只识别中草药表格外壳。若当前为0行，自动点击页面下方
         * “新医嘱”创建首行；第2行及以上仍通过每行右侧“＋”按钮增加。
         */
        let context = await waitForHerbContext(7000, false);

        if (!context.rows.length && requiredCount > 0) {
            await checkpoint();
            context = await createFirstHerbOrderRow(context);
        }

        while (context.rows.length < requiredCount) {
            await checkpoint();

            const lastRow = context.rows[context.rows.length - 1];

            if (!lastRow) {
                context = await createFirstHerbOrderRow(context);
                continue;
            }

            const operationCell = getCellByColumn(context, lastRow, '操作');
            let plusButton = findOperationButton(operationCell, 'plus');

            if (!plusButton) {
                const operationScope = context.dataRoot || context.root;
                const allSmallButtons = Array.from(operationScope.querySelectorAll(
                    'button,a,[role="button"],i,span'
                )).filter(isVisible).filter(function (element) {
                    const text = [
                        element.innerText || '',
                        element.textContent || '',
                        element.getAttribute('title') || '',
                        element.getAttribute('aria-label') || '',
                        element.className || ''
                    ].join(' ');

                    return /(?:^\+$|增加|新增|添加|add|plus|icon-plus|fa-plus|layui-icon-add)/i.test(text.trim());
                });

                plusButton = allSmallButtons[allSmallButtons.length - 1] || null;
            }

            if (!plusButton) {
                throw new Error('中草药表格行数不足，且未找到右侧“＋”新增行按钮');
            }

            const beforeCount = context.rows.length;

            realClick(plusButton);

            const deadline = Date.now() + 4000;
            let increased = false;

            while (Date.now() < deadline) {
                await sleep(150);
                context = findHerbTableContext();

                if (context && context.rows.length > beforeCount) {
                    increased = true;
                    break;
                }
            }

            if (!increased) {
                throw new Error('已点击“＋”新增行，但中草药表格行数没有增加');
            }
        }

        return context;
    }


    /******************************************************************
     * 九、医院中药字典检索与选择
     ******************************************************************/

    function getLookupCandidateText(element) {
        const cells = Array.from(element.querySelectorAll('td,[role="gridcell"]'))
            .filter(isVisible);

        if (cells.length) {
            return cells.map(function (cell) {
                return normalizePlainText(cell.innerText || cell.textContent);
            }).filter(Boolean);
        }

        return [normalizePlainText(element.innerText || element.textContent)];
    }

    function findDrugLookupCandidates(doc, input, mainTable) {
        const selector = [
            'tr',
            '[role="row"]',
            '.datagrid-row',
            '.layui-table-body tr',
            '.dropdown-menu li',
            '.autocomplete-suggestion',
            '.ui-menu-item',
            '.select2-results__option',
            '[role="option"]'
        ].join(',');
        const inputRect = input.getBoundingClientRect();
        const candidates = [];
        const seen = new Set();

        Array.from(doc.querySelectorAll(selector))
            .filter(isVisible)
            .forEach(function (element) {
                if (seen.has(element) || element.closest('#' + IDS.modal)) {
                    return;
                }

                seen.add(element);

                if (mainTable && mainTable.contains(element)) {
                    return;
                }

                const texts = getLookupCandidateText(element);
                const fullText = normalize(texts.join(' '));
                const rect = element.getBoundingClientRect();

                if (!fullText || fullText.length > 320) {
                    return;
                }

                if (/名称拼音|药品名称规格|药品编码|库存数量/.test(fullText)) {
                    return;
                }

                const verticalDistance = Math.min(
                    Math.abs(rect.top - inputRect.bottom),
                    Math.abs(rect.bottom - inputRect.top)
                );
                const horizontalDistance = Math.abs(rect.left - inputRect.left);

                if (verticalDistance > 700 || horizontalDistance > 1100) {
                    return;
                }

                candidates.push({
                    element: element,
                    texts: texts,
                    fullText: fullText,
                    rect: rect
                });
            });

        return candidates;
    }

    function scoreDrugCandidate(candidate, input, desiredName) {
        const target = normalize(desiredName);
        const firstText = normalize(candidate.texts[0] || '');
        const inputRect = input.getBoundingClientRect();
        let score = Math.abs(candidate.rect.top - inputRect.bottom) +
            Math.abs(candidate.rect.left - inputRect.left) / 3;

        if (firstText === target) {
            score -= 6000;
        }
        else if (firstText.startsWith(target) || target.startsWith(firstText)) {
            score -= 3500;
        }
        else if (candidate.fullText.includes(target)) {
            score -= 1800;
        }

        const canonicalTarget = canonicalHerbName(desiredName);
        const candidateCanonical = canonicalHerbName(candidate.texts[0] || '');

        if (canonicalTarget && candidateCanonical === canonicalTarget) {
            score -= 900;
        }

        return score;
    }

    function getCellText(context, row, label) {
        const cell = getCellByColumn(context, row, label);

        return normalizePlainText(cell ? cell.innerText || cell.textContent : '');
    }

    function snapshotDrugRow(context, row) {
        const specification = getCellText(context, row, '规格');
        const hiddenValues = Array.from(row.querySelectorAll(
            'input[type="hidden"],input[data-id],input[data-code],input[readonly]'
        )).map(function (element) {
            return [
                element.value || '',
                element.getAttribute('data-id') || '',
                element.getAttribute('data-code') || ''
            ].join(':');
        }).join('|');

        return specification + '||' + hiddenValues;
    }

    async function selectDrugFromSystem(rowIndex, item) {
        const searchTerms = [];

        [item.standardName, item.sourceName].forEach(function (value) {
            const text = String(value || '').trim();

            if (text && !searchTerms.some(function (existing) {
                return normalize(existing) === normalize(text);
            })) {
                searchTerms.push(text);
            }
        });

        if (!searchTerms.length) {
            throw new Error('中药名称为空');
        }

        for (const term of searchTerms) {
            await checkpoint();

            let context = await ensureHerbRowCount(rowIndex + 1);
            let row = context.rows[rowIndex];
            const beforeSelectionSignature = snapshotDrugRow(context, row);
            const nameCell = getCellByColumn(context, row, '名称');
            const input = findVisibleInputInCell(nameCell);

            if (!input) {
                throw new Error('第' + (rowIndex + 1) + '行未找到“名称”输入框');
            }

            input.scrollIntoView({
                block: 'center',
                behavior: 'auto'
            });

            realClick(input);
            setNativeInputValue(context.doc, input, term, true, false);
            await sleep(700);

            let candidates = findDrugLookupCandidates(
                context.doc,
                input,
                context.dataRoot || context.table
            );

            if (!candidates.length) {
                await sleep(450);
                candidates = findDrugLookupCandidates(
                    context.doc,
                    input,
                    context.dataRoot || context.table
                );
            }

            if (candidates.length) {
                const ranked = candidates.map(function (candidate) {
                    return {
                        candidate: candidate,
                        score: scoreDrugCandidate(candidate, input, term)
                    };
                }).sort(function (a, b) {
                    return a.score - b.score;
                });
                const best = ranked[0];

                if (best && best.score < 1800) {
                    const cells = Array.from(best.candidate.element.querySelectorAll(
                        'td,[role="gridcell"]'
                    )).filter(isVisible);
                    const target = cells[0] || best.candidate.element;

                    realClick(target);
                    await sleep(300);

                    context = findHerbTableContext() || context;
                    row = context.rows[rowIndex] || row;

                    let afterSelectionSignature = snapshotDrugRow(context, row);
                    let committed = Boolean(getCellText(context, row, '规格')) ||
                        afterSelectionSignature !== beforeSelectionSignature;

                    if (!committed) {
                        realDoubleClick(target);
                        await sleep(320);
                        context = findHerbTableContext() || context;
                        row = context.rows[rowIndex] || row;
                        afterSelectionSignature = snapshotDrugRow(context, row);
                        committed = Boolean(getCellText(context, row, '规格')) ||
                            afterSelectionSignature !== beforeSelectionSignature;
                    }

                    input.blur();
                    pressKey(input, 'Escape', 27);
                    await sleep(180);

                    if (committed) {
                        return {
                            selectedName: best.candidate.texts[0] || term,
                            candidateText: best.candidate.texts.join(' | ')
                        };
                    }
                }
            }

            input.focus();
            pressKey(input, 'ArrowDown', 40);
            pressKey(input, 'Enter', 13);
            await sleep(380);

            context = findHerbTableContext() || context;
            row = context.rows[rowIndex] || row;

            const keyboardSignature = snapshotDrugRow(context, row);

            if (getCellText(context, row, '规格') ||
                keyboardSignature !== beforeSelectionSignature) {
                input.blur();
                return {
                    selectedName: input.value || term,
                    candidateText: '键盘确认'
                };
            }
        }

        throw new Error(
            '医院中药字典未找到匹配项：' +
            (item.standardName || item.sourceName)
        );
    }

    /******************************************************************
     * 十、填写剂数、剂量、单位、用法、自付比例及各类开关
     ******************************************************************/

    async function setCellInput(rowIndex, label, value) {
        await checkpoint();

        const context = await ensureHerbRowCount(rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = getCellByColumn(context, row, label);
        const input = findVisibleInputInCell(cell);

        if (!input) {
            throw new Error('第' + (rowIndex + 1) + '行未找到“' + label + '”输入框');
        }

        setNativeInputValue(context.doc, input, value, true, true);
        await sleep(120);

        if (normalize(input.value) !== normalize(value)) {
            setNativeInputValue(context.doc, input, value, true, true);
            await sleep(120);
        }
    }

    async function setCellSelect(rowIndex, label, desiredText) {
        await checkpoint();

        const context = await ensureHerbRowCount(rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = getCellByColumn(context, row, label);
        const select = findSelectInCell(cell);

        if (select) {
            await setSelectValue(context.doc, select, desiredText);
            return;
        }

        const visualCandidates = Array.from(cell.querySelectorAll([
            '.layui-form-select',
            '.select2-container',
            '.el-select',
            '.ant-select',
            '.ivu-select',
            '.combo',
            '.textbox.combo',
            '[role="combobox"]'
        ].join(','))).filter(isVisible);

        if (visualCandidates.length) {
            const selected = await chooseVisualOption(
                context.doc,
                visualCandidates[0],
                desiredText
            );

            if (selected) {
                return;
            }
        }

        const clickable = Array.from(cell.querySelectorAll('input,span,div'))
            .filter(isVisible)
            .sort(function (a, b) {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();

                return rectB.width * rectB.height -
                    rectA.width * rectA.height;
            })[0];

        if (clickable) {
            realClick(clickable);
            await sleep(150);

            const option = Array.from(context.doc.querySelectorAll([
                'li',
                'dd',
                '[role="option"]',
                '.dropdown-menu a',
                '.dropdown-menu li'
            ].join(','))).filter(isVisible).find(function (element) {
                return normalize(element.innerText || element.textContent) === normalize(desiredText);
            });

            if (option) {
                realClick(option);
                await sleep(150);
                return;
            }
        }

        throw new Error(
            '第' + (rowIndex + 1) + '行未能设置“' +
            label + '”为“' + desiredText + '”'
        );
    }


    /*
     * 将某一列设置为该控件可选范围内的最小数值。
     * 主要用于“自付比例”：不硬编码为0，而是优先读取当前下拉框的实际选项，
     * 自动选择其中最小的数值；若页面使用数字输入框，则使用其min属性，
     * 没有min属性时才以0作为兜底。
     */
    function parseMinimumComparableValue(text) {
        const source = String(text || '')
            .replace(/,/g, '')
            .trim();
        const matched = source.match(/-?\d+(?:\.\d+)?/);

        return matched ? Number(matched[0]) : NaN;
    }

    function isPlaceholderOptionText(text) {
        const value = normalize(text);

        return !value || /请选择|请选|选择|未选择|空/.test(value);
    }

    function findMinimumNativeOption(select) {
        if (!select || !select.options) {
            return null;
        }

        const candidates = Array.from(select.options || [])
            .map(function (option, index) {
                const text = normalizePlainText(option.textContent || option.innerText || '');
                const textNumber = parseMinimumComparableValue(text);
                const valueNumber = parseMinimumComparableValue(option.value);
                const numericValue = Number.isFinite(textNumber)
                    ? textNumber
                    : valueNumber;

                return {
                    option: option,
                    index: index,
                    text: text,
                    numericValue: numericValue,
                    placeholder: isPlaceholderOptionText(text)
                };
            })
            .filter(function (item) {
                return !item.option.disabled && !item.placeholder;
            });

        const numericCandidates = candidates
            .filter(function (item) {
                return Number.isFinite(item.numericValue);
            })
            .sort(function (a, b) {
                if (a.numericValue !== b.numericValue) {
                    return a.numericValue - b.numericValue;
                }

                return a.index - b.index;
            });

        return numericCandidates[0] || candidates[0] || null;
    }

    async function chooseMinimumVisualOption(doc, visual) {
        if (!doc || !visual) {
            return null;
        }

        const clickTarget = visual.querySelector([
            '.layui-select-title input',
            '.layui-select-title',
            '.select2-selection',
            '.el-input',
            '.ant-select-selector',
            '.ivu-select-selection',
            '.textbox-text',
            '[role="combobox"]'
        ].join(',')) || visual;

        realClick(clickTarget);
        await sleep(180);

        const optionSelector = [
            '.layui-form-select dl dd',
            '.select2-results__option',
            '.dropdown-menu li',
            '[role="option"]',
            '.el-select-dropdown__item',
            '.ant-select-item-option',
            '.ivu-select-item',
            '.combobox-item',
            '.combo-panel .combobox-item'
        ].join(',');
        const visualRect = visual.getBoundingClientRect();
        const candidates = Array.from(doc.querySelectorAll(optionSelector))
            .filter(isVisible)
            .map(function (element, index) {
                const text = normalizePlainText(element.innerText || element.textContent || '');
                const rect = element.getBoundingClientRect();
                const textNumber = parseMinimumComparableValue(text);
                const dataNumber = parseMinimumComparableValue(
                    element.getAttribute('data-value') ||
                    element.getAttribute('value') ||
                    ''
                );
                const numericValue = Number.isFinite(textNumber)
                    ? textNumber
                    : dataNumber;
                const distance = Math.abs(rect.left - visualRect.left) +
                    Math.abs(rect.top - visualRect.bottom);

                return {
                    element: element,
                    index: index,
                    text: text,
                    numericValue: numericValue,
                    distance: distance
                };
            })
            .filter(function (item) {
                return item.text &&
                    !isPlaceholderOptionText(item.text) &&
                    !/disabled|layui-disabled|is-disabled/.test(
                        String(item.element.className || '')
                    ) &&
                    item.distance < 1000;
            });

        const numericCandidates = candidates
            .filter(function (item) {
                return Number.isFinite(item.numericValue);
            })
            .sort(function (a, b) {
                if (a.numericValue !== b.numericValue) {
                    return a.numericValue - b.numericValue;
                }

                return a.distance - b.distance;
            });
        const fallbackCandidates = candidates.sort(function (a, b) {
            const rectA = a.element.getBoundingClientRect();
            const rectB = b.element.getBoundingClientRect();

            if (Math.abs(a.distance - b.distance) > 80) {
                return a.distance - b.distance;
            }

            return rectA.top - rectB.top;
        });
        const chosen = numericCandidates[0] || fallbackCandidates[0] || null;

        if (!chosen) {
            pressKey(clickTarget, 'Escape', 27);
            return null;
        }

        realClick(chosen.element);
        await sleep(180);

        return chosen.text;
    }

    async function setCellToMinimumValue(rowIndex, label) {
        await checkpoint();

        const context = await ensureHerbRowCount(rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = getCellByColumn(context, row, label);

        if (!cell) {
            throw new Error('第' + (rowIndex + 1) + '行未找到“' + label + '”单元格');
        }

        /*
         * 第一优先级：原生select，即使它被Layui等框架隐藏，也能读取完整选项。
         */
        const select = findSelectInCell(cell);

        if (select) {
            const minimum = findMinimumNativeOption(select);

            if (!minimum) {
                throw new Error(
                    '第' + (rowIndex + 1) + '行“' + label + '”没有可用选项'
                );
            }

            const visual = getSelectVisual(select);
            let clicked = false;

            if (visual && visual !== select && isVisible(visual)) {
                clicked = await chooseVisualOption(
                    context.doc,
                    visual,
                    minimum.text
                );
            }

            if (!clicked) {
                triggerSelect(context.doc, select, minimum.option);
                await sleep(160);
            }

            return minimum.text;
        }

        /*
         * 第二优先级：没有原生select时，直接从可视化下拉菜单中寻找最小值。
         */
        const visual = Array.from(cell.querySelectorAll([
            '.layui-form-select',
            '.select2-container',
            '.el-select',
            '.ant-select',
            '.ivu-select',
            '.combo',
            '.textbox.combo',
            '[role="combobox"]'
        ].join(','))).filter(isVisible)[0] || null;

        if (visual) {
            const chosenText = await chooseMinimumVisualOption(context.doc, visual);

            if (chosenText !== null) {
                return chosenText;
            }
        }

        /*
         * 第三优先级：数字输入框或普通输入框。
         */
        const input = findVisibleInputInCell(cell);

        if (input) {
            const attributeMin = parseMinimumComparableValue(input.getAttribute('min'));
            const datasetMin = parseMinimumComparableValue(
                input.getAttribute('data-min') ||
                input.getAttribute('aria-valuemin') ||
                ''
            );
            const minimumValue = Number.isFinite(attributeMin)
                ? attributeMin
                : (Number.isFinite(datasetMin) ? datasetMin : 0);

            setNativeInputValue(context.doc, input, minimumValue, true, true);
            await sleep(140);

            return String(minimumValue);
        }

        throw new Error(
            '第' + (rowIndex + 1) + '行未能将“' + label + '”设置为最小值'
        );
    }

    /******************************************************************
     * 新版页面底部统一处方设置
     *
     * 新版不再把剂数、用法、代煎等参数重复放在每一味药所在行，
     * 而是在表格下方统一设置。以下定位优先依赖字段标签和空间关系，
     * 不绑定固定id、name或页面列序号，以兼容医院后续的小幅排版调整。
     ******************************************************************/

    const HERB_FOOTER_SELECT_VISUAL_SELECTOR = [
        '.layui-form-select',
        '.select2-container',
        '.el-select',
        '.ant-select',
        '.ivu-select',
        '.combo',
        '.textbox.combo',
        '[role="combobox"]'
    ].join(',');

    const HERB_FOOTER_FIELD_LABEL_ALIASES = {
        剂数: ['剂数', '付数'],
        用法: ['用法', '给药用法'],
        代煎: ['代煎', '是否代煎'],
        出院带药: ['出院带药', '是否出院带药'],
        转自费: ['转自费', '是否转自费'],
        计费: ['计费', '是否计费']
    };

    function isHerbFooterElementAllowed(context, element) {
        if (!element || !element.isConnected) {
            return false;
        }

        if (element.closest('#' + IDS.modal) ||
            element.closest('#' + IDS.panel) ||
            element.closest('thead,[role="columnheader"]')) {
            return false;
        }

        if (context && context.table && context.table.contains(element)) {
            const insideDataRow = (context.rows || []).some(function (row) {
                return row === element || row.contains(element);
            });

            if (insideDataRow) {
                return false;
            }
        }

        return true;
    }

    function getHerbFooterControlVisual(control) {
        if (!control) {
            return null;
        }

        if (String(control.tagName || '').toUpperCase() === 'SELECT') {
            return isVisible(control)
                ? control
                : (getSelectVisual(control) || control);
        }

        return control.closest(HERB_FOOTER_SELECT_VISUAL_SELECTOR) || control;
    }

    /*
     * findTextElements() 返回的是文本节点的父元素。新版页面可能把
     * “用法：”文字和对应 select 一起包在同一个 label 中，此时直接取
     * label 的矩形会把下拉框本身也算进去，导致空间评分误把右侧“代煎：
     * 是/否”控件判为更近。优先取实际标签文字的 Range 矩形作为锚点。
     */
    function getHerbFooterLabelRect(labelElement, labelAliases) {
        const fallbackRect = labelElement.getBoundingClientRect();
        const doc = labelElement.ownerDocument;
        const win = doc && doc.defaultView;
        const normalizedAliases = (labelAliases || [])
            .map(function (alias) {
                return normalize(alias);
            })
            .filter(Boolean);

        if (!doc || !win || !doc.createTreeWalker || !doc.createRange ||
            !win.NodeFilter || !normalizedAliases.length) {
            return fallbackRect;
        }

        const walker = doc.createTreeWalker(
            labelElement,
            win.NodeFilter.SHOW_TEXT
        );
        const matches = [];
        let node;

        while ((node = walker.nextNode())) {
            const value = normalize(node.nodeValue);

            if (!value || !normalizedAliases.includes(value)) {
                continue;
            }

            try {
                const range = doc.createRange();

                range.selectNodeContents(node);

                const rect = range.getBoundingClientRect();

                if (typeof range.detach === 'function') {
                    range.detach();
                }

                if (rect && rect.width > 0 && rect.height > 0) {
                    matches.push(rect);
                }
            }
            catch (error) {
                // 个别旧式页面不支持文本Range定位时退回父元素矩形。
            }
        }

        if (!matches.length) {
            return fallbackRect;
        }

        matches.sort(function (a, b) {
            return a.width * a.height - b.width * b.height;
        });

        return matches[0];
    }

    function scoreHerbFooterControl(
        labelElement,
        control,
        level,
        kind,
        labelAliases,
        desiredText
    ) {
        const visual = getHerbFooterControlVisual(control);
        const geometryElement = visual && isVisible(visual)
            ? visual
            : control;
        const labelRect = getHerbFooterLabelRect(
            labelElement,
            labelAliases
        );
        const controlRect = geometryElement.getBoundingClientRect();
        const labelCenterY = labelRect.top + labelRect.height / 2;
        const controlCenterY = controlRect.top + controlRect.height / 2;
        const horizontalGap = controlRect.left - labelRect.right;
        const position = labelElement.compareDocumentPosition(geometryElement);
        const followsLabel = Boolean(
            position & labelElement.ownerDocument.defaultView.Node.DOCUMENT_POSITION_FOLLOWING
        );
        let score = level * 520;

        /*
         * 标签自身包裹的输入控件属于最可靠的显式关联。这个优先级必须
         * 高于同一行相邻字段的几何距离，避免“用法”误命中“代煎”。
         */
        if (labelElement.contains &&
            (labelElement.contains(control) ||
                (visual && labelElement.contains(visual)))) {
            score -= 10000;
        }

        if (controlRect.width > 0 && controlRect.height > 0) {
            score += Math.abs(controlCenterY - labelCenterY) * 22;
            score += Math.abs(horizontalGap);

            if (horizontalGap < -24) {
                score += 1700 + Math.abs(horizontalGap) * 3;
            }
            else if (horizontalGap > 420) {
                score += 1500 + horizontalGap;
            }

            if (
                controlRect.bottom >= labelRect.top - 4 &&
                controlRect.top <= labelRect.bottom + 4
            ) {
                score -= 650;
            }
        }
        else {
            score += 2100;
        }

        score += followsLabel ? -220 : 900;

        const tagName = String(control.tagName || '').toUpperCase();

        if (kind === 'input') {
            if (!/^(INPUT|TEXTAREA)$/.test(tagName)) {
                score += 4500;
            }

            if (control.readOnly) {
                score += 2600;
            }
        }
        else if (tagName !== 'SELECT' &&
            !(visual && visual.matches &&
                visual.matches(HERB_FOOTER_SELECT_VISUAL_SELECTOR))) {
            score += 4500;
        }

        /*
         * 原生下拉框在点击前即可读取全部 option。用目标值反向校验候选：
         * “用法=代煎”只能选择实际含“代煎”的用法框，而不是任意是/否框。
         */
        if (kind === 'select' && tagName === 'SELECT' && desiredText) {
            score += findOption(control, desiredText) ? -6500 : 6500;
        }

        return {
            control: control,
            visual: visual,
            score: score
        };
    }

    function resolveHerbFooterControl(
        context,
        labelElement,
        kind,
        labelAliases,
        desiredText
    ) {
        const selector = [
            'input:not([type="hidden"]):not([disabled])',
            'textarea:not([disabled])',
            'select:not([disabled])',
            HERB_FOOTER_SELECT_VISUAL_SELECTOR
        ].join(',');
        const candidates = [];
        const seen = new Set();

        function add(element, level) {
            if (!element || seen.has(element) ||
                !isHerbFooterElementAllowed(context, element)) {
                return;
            }

            let control = element;

            if (element.matches &&
                element.matches(HERB_FOOTER_SELECT_VISUAL_SELECTOR)) {
                const nestedSelect = element.querySelector('select:not([disabled])');
                const nestedInput = element.querySelector(
                    'input:not([type="hidden"]):not([disabled])'
                );

                control = nestedSelect || nestedInput || element;
            }

            if (seen.has(control) ||
                !isHerbFooterElementAllowed(context, control)) {
                return;
            }

            seen.add(element);
            seen.add(control);

            const scored = scoreHerbFooterControl(
                labelElement,
                control,
                level,
                kind,
                labelAliases,
                desiredText
            );

            if (element !== control && isVisible(element)) {
                scored.visual = element;
            }

            candidates.push(scored);
        }

        let current = labelElement;

        for (let level = 0; current && level < 6; level += 1) {
            Array.from(current.querySelectorAll(selector)).forEach(function (element) {
                add(element, level);
            });

            const sibling = current.nextElementSibling;

            if (sibling) {
                if (sibling.matches && sibling.matches(selector)) {
                    add(sibling, level + 0.25);
                }

                Array.from(sibling.querySelectorAll(selector)).forEach(function (element) {
                    add(element, level + 0.25);
                });
            }

            current = current.parentElement;

            if (!current || current === labelElement.ownerDocument.body) {
                break;
            }
        }

        /*
         * 少数页面把标签与控件放在相邻但没有共同小容器的节点中。
         * 局部搜索失败时，再以同一文档内的可见控件做空间兜底。
         */
        if (!candidates.length) {
            Array.from(labelElement.ownerDocument.querySelectorAll(selector))
                .filter(function (element) {
                    const visual = getHerbFooterControlVisual(element);

                    return isHerbFooterElementAllowed(context, element) &&
                        visual && isVisible(visual);
                })
                .forEach(function (element) {
                    add(element, 7);
                });
        }

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        return candidates[0] || null;
    }

    function findHerbFooterField(context, label, kind, desiredText) {
        const candidates = [];
        const preferredDoc = context ? context.doc : null;
        const tableRect = context && context.root && isVisible(context.root)
            ? context.root.getBoundingClientRect()
            : null;
        const labelAliases = HERB_FOOTER_FIELD_LABEL_ALIASES[label] || [label];

        getAllDocuments().forEach(function (doc) {
            const labelElements = [];
            const seenLabels = new Set();

            labelAliases.forEach(function (alias) {
                findTextElements(doc, alias, false).forEach(function (element) {
                    if (!seenLabels.has(element)) {
                        seenLabels.add(element);
                        labelElements.push(element);
                    }
                });
            });

            labelElements.forEach(function (labelElement) {
                if (!isHerbFooterElementAllowed(context, labelElement) ||
                    labelElement.closest([
                        'option',
                        '[role="option"]',
                        'button',
                        HERB_FOOTER_SELECT_VISUAL_SELECTOR
                    ].join(','))) {
                    return;
                }

                const resolved = resolveHerbFooterControl(
                    context,
                    labelElement,
                    kind,
                    labelAliases,
                    desiredText
                );

                if (!resolved) {
                    return;
                }

                const rect = getHerbFooterLabelRect(
                    labelElement,
                    labelAliases
                );
                let score = resolved.score;

                if (doc === preferredDoc) {
                    score -= 4200;
                }

                if (tableRect && doc === preferredDoc) {
                    if (rect.top >= tableRect.bottom - 70) {
                        score -= 2400;
                    }
                    else if (rect.bottom >= tableRect.top &&
                        rect.top <= tableRect.bottom) {
                        score += 5200;
                    }
                }

                if (rect.top > doc.defaultView.innerHeight * 0.55) {
                    score -= 900;
                }

                if (labelAliases.some(function (alias) {
                    return normalize(labelElement.innerText || labelElement.textContent) ===
                        normalize(alias);
                })) {
                    score -= 350;
                }

                candidates.push({
                    doc: doc,
                    labelElement: labelElement,
                    control: resolved.control,
                    visual: resolved.visual,
                    score: score
                });
            });
        });

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        return candidates[0] || null;
    }

    async function setHerbFooterField(context, label, desiredText, kind) {
        await checkpoint();

        const refreshedContext = findHerbTableContext() || context;
        const found = findHerbFooterField(
            refreshedContext,
            label,
            kind,
            desiredText
        );

        if (!found) {
            throw new Error('未找到页面底部统一“' + label + '”控件');
        }

        const control = found.control;
        const tagName = String(control && control.tagName || '').toUpperCase();

        if (kind === 'input' && /^(INPUT|TEXTAREA)$/.test(tagName) &&
            !control.readOnly) {
            setNativeInputValue(found.doc, control, desiredText, true, true);
            await sleep(150);

            if (normalize(control.value) !== normalize(desiredText)) {
                setNativeInputValue(found.doc, control, desiredText, true, true);
                await sleep(150);
            }

            return;
        }

        if (tagName === 'SELECT') {
            if (isVisible(control)) {
                const option = findOption(control, desiredText);

                if (!option) {
                    throw new Error(
                        '页面底部统一“' + label + '”没有“' +
                        desiredText + '”选项'
                    );
                }

                triggerSelect(found.doc, control, option);
                await sleep(160);
            }
            else {
                await setSelectValue(found.doc, control, desiredText);
            }

            return;
        }

        const visual = found.visual ||
            (control && control.closest
                ? control.closest(HERB_FOOTER_SELECT_VISUAL_SELECTOR)
                : null);

        if (visual && await chooseVisualOption(found.doc, visual, desiredText)) {
            return;
        }

        throw new Error(
            '未能将页面底部统一“' + label + '”设置为“' + desiredText + '”'
        );
    }

    async function applyUnifiedHerbFooterSettings(context, settings) {
        const administration = resolveHerbAdministration(
            settings.decoctionMode
        );

        showStatus('药味已逐行录入，正在设置页面底部统一处方参数……');

        await setHerbFooterField(
            context,
            '剂数',
            settings.doseCount,
            'input'
        );
        await setHerbFooterField(
            context,
            '用法',
            administration.usage,
            'select'
        );
        await setHerbFooterField(
            context,
            '代煎',
            administration.decoction,
            'select'
        );
        await setHerbFooterField(context, '出院带药', '否', 'select');
        await setHerbFooterField(context, '转自费', '否', 'select');
        await setHerbFooterField(context, '计费', '是', 'select');

        showStatus(
            '页面底部统一处方参数已设置：' +
            settings.doseCount + '剂；' + administration.description + '。',
            'success'
        );
    }

    /*
     * 根据面板选择生成医院表格中的“用法”和“代煎”值。
     *
     * 规则：
     * 1. 代煎：用法=代煎，代煎=是；
     * 2. 自煎：用法=自煎，代煎=否；
     * 3. 外用：用法=外用，代煎=否；
     * 4. 冲服：用法=冲服，代煎=否。
     */
    function resolveHerbAdministration(mode) {
        const mappings = {
            '代煎': {
                usage: '代煎',
                decoction: '是',
                description: '代煎（用法=代煎，代煎=是）'
            },
            '自煎': {
                usage: '自煎',
                decoction: '否',
                description: '自煎（用法=自煎，代煎=否）'
            },
            '外用': {
                usage: '外用',
                decoction: '否',
                description: '外用（用法=外用，代煎=否）'
            },
            '冲服': {
                usage: '冲服',
                decoction: '否',
                description: '冲服（用法=冲服，代煎=否）'
            }
        };

        return mappings[mode] || mappings['自煎'];
    }

    async function fillOneHerb(rowIndex, item, settings) {
        await checkpoint();

        const unifiedFooterMode = settings.entryMode === 'unified-footer';

        if (!unifiedFooterMode) {
            /*
             * 旧版页面仍按逐行结构处理：每一味中药组号固定为1，
             * 然后从“名称”列检索并选中药品。
             */
            await setCellInput(rowIndex, '组号', '1');
        }

        const selected = await selectDrugFromSystem(rowIndex, item);

        if (!unifiedFooterMode) {
            await setCellInput(rowIndex, '剂数', settings.doseCount);
        }

        await setCellInput(rowIndex, '剂量', item.doseG);
        await setCellSelect(rowIndex, '单位', '克');

        /*
         * 按当前要求，不修改“嘱托”列，保留医院系统默认值。
         */
        await setCellToMinimumValue(rowIndex, '自付比例');

        if (!unifiedFooterMode) {
            const administration = resolveHerbAdministration(
                settings.decoctionMode
            );

            await setCellSelect(
                rowIndex,
                '用法',
                administration.usage
            );
            await setCellSelect(
                rowIndex,
                '代煎',
                administration.decoction
            );
            await setCellSelect(rowIndex, '出院带药', '否');
            await setCellSelect(rowIndex, '转自费', '否');
            await setCellSelect(rowIndex, '计费', '是');
        }

        return selected;
    }

    /******************************************************************
     * 十一、页面底部“保存”
     ******************************************************************/

    /*
     * 读取按钮文字时必须去重。
     *
     * 旧版同时拼接innerText和textContent，普通“保存”按钮会被拼成
     * “保存 保存”，normalize后成为“保存保存”，因此始终匹配失败。
     */
    function getButtonText(element) {
        if (!element) {
            return '';
        }

        const values = [
            element.tagName === 'INPUT' ? element.value : '',
            element.innerText || '',
            element.textContent || '',
            element.getAttribute('title') || '',
            element.getAttribute('aria-label') || ''
        ].map(function (value) {
            return String(value || '').trim();
        }).filter(Boolean);
        const unique = [];

        values.forEach(function (value) {
            if (!unique.some(function (existing) {
                return normalize(existing) === normalize(value);
            })) {
                unique.push(value);
            }
        });

        return unique.join(' ');
    }

    function isExactSaveButton(element) {
        if (!element ||
            !isVisible(element) ||
            element.closest('#' + IDS.modal) ||
            element.disabled ||
            element.getAttribute('aria-disabled') === 'true') {
            return false;
        }

        return normalize(getButtonText(element)) === '保存';
    }

    function getSaveClickableElement(element) {
        if (!element) {
            return null;
        }

        return element.closest([
            'button',
            'a',
            'input[type="button"]',
            'input[type="submit"]',
            '[role="button"]',
            '.layui-btn',
            '.btn',
            '[onclick]'
        ].join(',')) || element;
    }

    function findPageSaveButton() {
        const candidates = [];
        const seen = new Set();
        const herbContext = findHerbTableContext();

        for (const doc of getAllDocuments()) {
            const directElements = Array.from(doc.querySelectorAll([
                'button',
                'a',
                'input[type="button"]',
                'input[type="submit"]',
                '[role="button"]',
                '.layui-btn',
                '.btn',
                '[onclick]'
            ].join(','))).filter(isExactSaveButton);

            /*
             * 某些医院页面把“保存”文字放在span内，外层div或a负责点击。
             * 再从精确文字节点向上寻找可点击祖先，避免只依赖按钮标签类型。
             */
            const textElements = findTextElements(
                doc,
                '保存',
                false
            ).map(getSaveClickableElement).filter(isExactSaveButton);
            const elements = directElements.concat(textElements);

            elements.forEach(function (element) {
                if (!element || seen.has(element)) {
                    return;
                }

                seen.add(element);

                const rect = element.getBoundingClientRect();
                const viewportHeight = doc.defaultView.innerHeight;
                const viewportWidth = doc.defaultView.innerWidth;
                let score = Math.abs(viewportHeight - rect.bottom) +
                    Math.abs(viewportWidth - rect.right) / 8;

                /*
                 * 图示中的目标按钮位于页面右下角。
                 * 对右下区域给予明显优先级，避免误点其他局部“保存”按钮。
                 */
                if (rect.top > viewportHeight * 0.68) {
                    score -= 3600;
                }

                if (rect.left > viewportWidth * 0.72) {
                    score -= 2600;
                }

                if (herbContext && herbContext.doc === doc) {
                    const rootRect = herbContext.root.getBoundingClientRect();

                    score += Math.abs(rect.right - rootRect.right) / 10;

                    if (rect.top >= rootRect.top - 10) {
                        score -= 900;
                    }
                }

                candidates.push({
                    doc: doc,
                    element: element,
                    score: score
                });
            });
        }

        if (!candidates.length) {
            return null;
        }

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        return candidates[0];
    }

    function findVisibleSystemMessage() {
        const selectors = [
            '.layui-layer-content',
            '.layui-layer-msg',
            '.toast',
            '.toast-message',
            '.alert',
            '.message',
            '.messager-body',
            '.el-message',
            '[role="alert"]',
            '[role="dialog"]'
        ].join(',');
        const messages = [];

        for (const doc of getAllDocuments()) {
            Array.from(doc.querySelectorAll(selectors))
                .filter(isVisible)
                .filter(function (element) {
                    return !element.closest('#' + IDS.modal);
                })
                .forEach(function (element) {
                    const text = normalizePlainText(
                        element.innerText || element.textContent
                    );

                    if (text && !messages.includes(text)) {
                        messages.push(text);
                    }
                });
        }

        return messages.join('；');
    }

    async function saveWholeHerbOrder() {
        const found = findPageSaveButton();

        if (!found) {
            throw new Error(
                '未找到页面右下角“保存”按钮。所有中药已保留在当前表格中，请人工核对后手动保存。'
            );
        }

        const beforeMessage = findVisibleSystemMessage();

        found.element.scrollIntoView({
            block: 'center',
            behavior: 'auto'
        });

        await sleep(150);
        realClick(found.element);

        const deadline = Date.now() + 8000;
        let finalMessage = '';

        while (Date.now() < deadline) {
            await sleep(250);

            const currentMessage = findVisibleSystemMessage();

            if (currentMessage && currentMessage !== beforeMessage) {
                finalMessage = currentMessage;

                if (/失败|错误|异常|不能为空|无效|请选择/.test(currentMessage)) {
                    throw new Error('页面保存失败：' + currentMessage);
                }

                if (/成功|保存完成|提交完成/.test(currentMessage)) {
                    break;
                }
            }
        }

        return finalMessage;
    }

    /******************************************************************
     * 十二、结果表格与审方结果显示
     ******************************************************************/

    function createSelect(options, value) {
        const select = document.createElement('select');

        options.forEach(function (optionText) {
            const option = document.createElement('option');

            option.value = optionText;
            option.textContent = optionText;
            select.appendChild(option);
        });

        select.value = value;
        return select;
    }

    function renderAuditIssues(modal, summary) {
        const box = modal.querySelector('.herb-audit-box');
        const content = modal.querySelector('.herb-audit-content');
        const dangerCount = state.auditIssues.filter(function (issue) {
            return issue.severity === 'danger';
        }).length;
        const warningCount = state.auditIssues.filter(function (issue) {
            return issue.severity === 'warning';
        }).length;

        if (!state.auditIssues.length && !summary) {
            box.style.display = 'none';
            content.innerHTML = '';
            return;
        }

        const summaryHtml = summary
            ? '<div class="herb-ai-summary"><strong>AI总结：</strong>' +
                escapeHtml(summary) + '</div>'
            : '';
        const issueHtml = state.auditIssues.map(function (issue) {
            return '<div class="herb-audit-item ' + issue.severity + '">' +
                '<span class="herb-audit-tag">' + escapeHtml(issue.type) + '</span>' +
                escapeHtml(issue.message) +
                '</div>';
        }).join('');

        content.innerHTML =
            '<div class="herb-audit-count">红色风险 ' + dangerCount +
            ' 项；黄色提醒 ' + warningCount + ' 项。</div>' +
            summaryHtml + issueHtml;
        box.style.display = 'block';
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderResultTable(modal) {
        const tbody = modal.querySelector('.herb-result-body');

        tbody.innerHTML = '';

        state.items.forEach(function (item, index) {
            const row = document.createElement('tr');

            row.dataset.index = String(index);

            function appendCell(child) {
                const cell = document.createElement('td');

                cell.appendChild(child);
                row.appendChild(cell);
                return cell;
            }

            const enabled = document.createElement('input');
            enabled.type = 'checkbox';
            enabled.checked = item.enabled !== false;
            enabled.className = 'herb-enabled';
            appendCell(enabled);

            const order = document.createElement('span');
            order.textContent = String(index + 1);
            appendCell(order);

            const source = document.createElement('input');
            source.type = 'text';
            source.value = item.sourceName || '';
            source.className = 'herb-source';
            appendCell(source);

            const standard = document.createElement('input');
            standard.type = 'text';
            standard.value = item.standardName || '';
            standard.className = 'herb-standard';
            appendCell(standard);

            const dose = document.createElement('input');
            dose.type = 'number';
            dose.min = '0';
            dose.step = '0.01';
            dose.value = item.doseG === '' ? '' : String(item.doseG);
            dose.className = 'herb-dose';
            appendCell(dose);

            const unit = document.createElement('span');
            unit.textContent = '克';
            appendCell(unit);

            const special = document.createElement('input');
            special.type = 'text';
            special.value = item.specialPreparation || '';
            special.className = 'herb-special';
            special.placeholder = '先煎/后下等';
            appendCell(special);

            const warning = document.createElement('span');
            warning.className = 'herb-warning';
            warning.textContent = [
                item.note,
                Array.isArray(item.aiWarnings) ? item.aiWarnings.join('；') : ''
            ].filter(Boolean).join('；') || '-';
            warning.title = warning.textContent;
            appendCell(warning);

            const confidence = document.createElement('span');
            confidence.className = 'herb-confidence';
            confidence.textContent = item.confidence === '' ||
                item.confidence === undefined
                ? '-'
                : Math.round(Number(item.confidence) * 100) + '%';
            appendCell(confidence);

            const status = document.createElement('span');
            status.className = 'herb-status';
            status.textContent = item.status || '待录入';
            appendCell(status);

            tbody.appendChild(row);
        });

        modal.querySelector('.herb-result-wrap').style.display =
            state.items.length ? 'block' : 'none';

        renderAuditIssues(modal, '');
    }

    function readItemsFromTable(modal) {
        const rows = Array.from(modal.querySelectorAll('.herb-result-body tr'));

        return rows.map(function (row, index) {
            const old = state.items[index] || {};
            const doseValue = Number(row.querySelector('.herb-dose').value);

            return {
                enabled: row.querySelector('.herb-enabled').checked,
                sourceName: row.querySelector('.herb-source').value.trim(),
                standardName: row.querySelector('.herb-standard').value.trim(),
                doseG: Number.isFinite(doseValue) && doseValue > 0
                    ? doseValue
                    : '',
                originalDose: old.originalDose || '',
                unit: '克',
                specialPreparation: row.querySelector('.herb-special').value.trim(),
                note: old.note || '',
                aiWarnings: old.aiWarnings || [],
                confidence: old.confidence === undefined ? '' : old.confidence,
                status: row.querySelector('.herb-status').textContent,
                originalIndex: index
            };
        });
    }

    /******************************************************************
     * 中药处方单打印：只读取已勾选药味，不提交HIS、不调用AI。
     * 同一SVG用于预览和打印；GM/WebDAV只保存版式，不保存患者资料。
     ******************************************************************/
    const HERB_RX_LAYOUT_KIND = 'medical-herb-prescription-layout';
    const HERB_RX_PRINT_ID = 'medical-herb-prescription-print-modal';
    const HERB_RX_CALIBRATION_ID = 'medical-herb-prescription-calibration-modal';
    const HERB_RX_STYLE_ID = 'medical-herb-prescription-print-style';
    const HERB_RX_FONT = '"Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif';
    const HERB_RX_SOURCES = [
        ['fixed', '固定文字'],
        ['patient.name', '患者姓名'], ['patient.sex', '性别'],
        ['patient.age', '年龄'], ['patient.number', '病案号/就诊号'],
        ['patient.department', '科室'], ['patient.bed', '床号'],
        ['patient.diagnosis', '临床诊断'], ['patient.allergy', '过敏史'],
        ['prescription.date', '处方日期'], ['prescription.doseCount', '剂数'],
        ['prescription.mode', '煎煮方式'], ['prescription.instructions', '用法/补充说明'],
        ['prescription.doctor', '医师'], ['prescription.pharmacist', '调配药师'],
        ['prescription.reviewer', '核对药师'], ['prescription.items', '已勾选药味'],
        ['page.number', '页码']
    ];

    function herbRxClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function herbRxPaper(paper) {
        return paper === 'A4' ? {width: 210, height: 297} : {width: 148, height: 210};
    }

    function herbRxToday() {
        const date = new Date();
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') +
            '-' + String(date.getDate()).padStart(2, '0');
    }

    function herbRxDefaultConfig() {
        function field(id, label, source, x, y, width, height, options) {
            return Object.assign({
                id: id, label: label, source: source, x: x, y: y,
                width: width, height: height, fontSize: 10,
                align: 'left', bold: false, enabled: true, prefix: '', text: ''
            }, options || {});
        }
        return {
            schemaVersion: 1, paper: 'A5', columns: 3,
            offsetX: 0, offsetY: 0, scale: 1, drugName: 'standard',
            elements: [
                field('hospital', '医院抬头', 'fixed', 12, 9, 124, 11,
                    {text: '济南健佳中医医院', fontSize: 16, bold: true, align: 'center'}),
                field('title', '处方单标题', 'fixed', 12, 22, 124, 9,
                    {text: '中药饮片处方单', fontSize: 14, bold: true, align: 'center'}),
                field('name', '姓名', 'patient.name', 12, 36, 58, 7, {prefix: '姓名：'}),
                field('sex', '性别', 'patient.sex', 73, 36, 28, 7, {prefix: '性别：'}),
                field('age', '年龄', 'patient.age', 104, 36, 32, 7, {prefix: '年龄：'}),
                field('number', '病案号/就诊号', 'patient.number', 12, 44, 67, 7, {prefix: '病案号/就诊号：'}),
                field('department', '科室', 'patient.department', 82, 44, 54, 7, {prefix: '科室：'}),
                field('date', '日期', 'prescription.date', 12, 52, 67, 7, {prefix: '日期：'}),
                field('bed', '床号', 'patient.bed', 82, 52, 54, 7, {prefix: '床号：'}),
                field('diagnosis', '临床诊断', 'patient.diagnosis', 12, 60, 124, 13, {prefix: '临床诊断：'}),
                field('allergy', '过敏史', 'patient.allergy', 12, 74, 124, 7, {prefix: '过敏史：'}),
                field('rp', 'Rp标记', 'fixed', 12, 82, 124, 8, {text: 'Rp.', fontSize: 14, bold: true}),
                field('medicines', '药味区域', 'prescription.items', 12, 91, 124, 61, {fontSize: 11}),
                field('doseCount', '剂数', 'prescription.doseCount', 12, 158, 54, 7, {prefix: '剂数：'}),
                field('mode', '煎煮方式', 'prescription.mode', 69, 158, 67, 7, {prefix: '煎煮方式：'}),
                field('instructions', '用法/说明', 'prescription.instructions', 12, 167, 124, 17, {prefix: '用法/说明：'}),
                field('doctor', '医师', 'prescription.doctor', 12, 190, 38, 8, {prefix: '医师：'}),
                field('pharmacist', '调配药师', 'prescription.pharmacist', 53, 190, 39, 8, {prefix: '调配：'}),
                field('reviewer', '核对药师', 'prescription.reviewer', 95, 190, 41, 8, {prefix: '核对：'}),
                field('page', '页码', 'page.number', 12, 201, 124, 6, {fontSize: 8, align: 'right'})
            ]
        };
    }

    function herbRxNormalizeConfig(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            value.schemaVersion !== 1 || !['A4', 'A5'].includes(value.paper)) {
            throw new Error('处方版式配置格式或版本无效。');
        }
        const page = herbRxPaper(value.paper);
        function number(v, min, max, label) {
            const result = Number(v);
            if (v === '' || v === null || !Number.isFinite(result) || result < min || result > max) {
                throw new Error(label + '超出有效范围。');
            }
            return result;
        }
        const config = {
            schemaVersion: 1, paper: value.paper,
            columns: number(value.columns, 1, 4, '药味列数'),
            offsetX: number(value.offsetX, -20, 20, '横向偏移'),
            offsetY: number(value.offsetY, -20, 20, '纵向偏移'),
            scale: number(value.scale, 0.7, 1.3, '整体缩放'),
            drugName: value.drugName === 'source' ? 'source' : 'standard',
            elements: []
        };
        if (!Number.isInteger(config.columns) || !Array.isArray(value.elements) ||
            !value.elements.length || value.elements.length > 60) {
            throw new Error('元素数量或药味列数无效。');
        }
        const seen = new Set();
        const sources = new Set(HERB_RX_SOURCES.map(function (item) {return item[0];}));
        config.elements = value.elements.map(function (raw) {
            if (!raw || typeof raw !== 'object' || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.id) ||
                seen.has(raw.id) || !sources.has(raw.source)) {
                throw new Error('存在重复元素或未知数据来源映射。');
            }
            seen.add(raw.id);
            const element = {
                id: raw.id, label: String(raw.label || '文本框').slice(0, 80),
                source: raw.source, prefix: String(raw.prefix || '').slice(0, 120),
                text: String(raw.text || '').slice(0, 4000),
                enabled: raw.enabled !== false, bold: raw.bold === true,
                align: ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'left',
                x: number(raw.x, 0, page.width, 'X坐标'),
                y: number(raw.y, 0, page.height, 'Y坐标'),
                width: number(raw.width, 5, page.width, '元素宽度'),
                height: number(raw.height, 3, page.height, '元素高度'),
                fontSize: number(raw.fontSize, 6, 28, '字号')
            };
            if (element.x + element.width > page.width + 0.01 ||
                element.y + element.height > page.height + 0.01) {
                throw new Error('元素“' + element.label + '”超出纸张范围。');
            }
            return element;
        });
        if (config.elements.filter(function (element) {
            return element.enabled && element.source === 'prescription.items';
        }).length !== 1) {
            throw new Error('必须保留且只启用一个“已勾选药味”区域。');
        }
        return config;
    }

    function herbRxLoadConfig(key) {
        try {
            const raw = GM_getValue(key || KEYS.prescriptionLayout, '');
            if (!raw) return null;
            return herbRxNormalizeConfig(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } catch (error) {
            return null;
        }
    }

    function herbRxSaveConfig(config) {
        const checked = herbRxNormalizeConfig(config);
        const old = herbRxLoadConfig() || herbRxDefaultConfig();
        GM_setValue(KEYS.prescriptionLayoutRollback, JSON.stringify(old));
        GM_setValue(KEYS.prescriptionLayout, JSON.stringify(checked));
        return checked;
    }

    function herbRxValidateItems(items) {
        const selected = (Array.isArray(items) ? items : []).filter(function (item) {
            return item && item.enabled !== false;
        }).map(function (item, index) {
            const sourceName = removeLeadingStarPrefix(item.sourceName || '');
            const standardName = removeLeadingStarPrefix(item.standardName || sourceName);
            const dose = Number(item.doseG);
            if (!(standardName || sourceName) || !Number.isFinite(dose) || dose <= 0) {
                throw new Error('第' + (index + 1) + '味已勾选药品缺少有效药名或剂量，请先核对结果表。');
            }
            return {
                sourceName: sourceName || standardName, standardName: standardName || sourceName,
                doseG: dose, specialPreparation: String(item.specialPreparation || '').trim()
            };
        });
        if (!selected.length) throw new Error('请先解析中药文本，并至少勾选一味药品。');
        if (selected.length > 200) throw new Error('已勾选药味超过200味，请分开打印。');
        return selected;
    }

    function herbRxVisibleDocuments() {
        const result = [], visited = new Set();
        function walk(doc) {
            if (!doc || visited.has(doc)) return;
            visited.add(doc);
            result.push(doc);
            doc.querySelectorAll('iframe,frame').forEach(function (frame) {
                if (!isVisible(frame)) return;
                try {walk(frame.contentDocument);} catch (error) { /* 跳过跨域框架。 */ }
            });
        }
        walk(document);
        return result;
    }

    function herbRxPatientFromText(text) {
        const value = String(text || '').replace(/\s+/g, ' ').trim();
        const compact = value.match(/([\u3400-\u9fff·]{2,12})\s*\/\s*([男女])\s*\/\s*([0-9]{1,3}\s*岁)[^]*?\/\s*([A-Za-z0-9-]{5,24})(?:\s|$|\/)/);
        const name = value.match(/(?:患者姓名|姓\s*名)\s*[:：]\s*([\u3400-\u9fff·]{2,12})(?=\s|\/|[,，;；]|$)/);
        const number = value.match(/(?:住院号|病案号|就诊号|门诊号)\s*[:：]\s*([A-Za-z0-9-]{3,24})/);
        if (!compact && !(name && number)) return null;
        const sex = value.match(/性\s*别\s*[:：]\s*([男女])/);
        const age = value.match(/年\s*龄\s*[:：]\s*([0-9]{1,3}\s*(?:岁|月|天))/);
        const bed = value.match(/床\s*号\s*[:：]\s*([A-Za-z0-9-]{1,12})/);
        return {
            name: compact ? compact[1] : name[1],
            sex: compact ? compact[2] : sex ? sex[1] : '',
            age: compact ? compact[3].replace(/\s/g, '') : age ? age[1].replace(/\s/g, '') : '',
            number: compact ? compact[4] : number[1],
            bed: bed ? bed[1] : '', department: '', diagnosis: '', allergy: ''
        };
    }

    function herbRxDetectPatient() {
        const candidates = [];
        herbRxVisibleDocuments().forEach(function (doc) {
            doc.querySelectorAll('span,div,p,label,strong,b,td').forEach(function (element) {
                if (!isVisible(element) || element.closest('[id^="medical-"]')) return;
                const text = String(element.innerText || element.textContent || '').trim();
                if (text.length < 8 || text.length > 180) return;
                const patient = herbRxPatientFromText(text);
                if (patient) candidates.push(patient);
            });
        });
        const keys = new Set(candidates.map(function (p) {return p.number + '|' + p.name;}));
        if (keys.size !== 1) return null;
        return candidates.sort(function (a, b) {
            return [b.sex, b.age, b.bed].filter(Boolean).length -
                [a.sex, a.age, a.bed].filter(Boolean).length;
        })[0] || null;
    }

    function herbRxSourceText(element, draft, pageNumber, pageCount) {
        let value = '';
        if (element.source === 'fixed') value = element.text;
        else if (element.source === 'page.number') value = '第' + pageNumber + '/' + pageCount + '页';
        else {
            const parts = element.source.split('.');
            value = draft[parts[0]] && draft[parts[0]][parts[1]];
            if (element.source === 'prescription.doseCount') value = String(value || '') + '剂';
        }
        return element.prefix + String(value === undefined || value === null ? '' : value);
    }

    function herbRxMeasureWidth(text, fontSize, bold) {
        if (!herbRxMeasureWidth.context) {
            try {herbRxMeasureWidth.context = document.createElement('canvas').getContext('2d');}
            catch (error) { /* 无canvas时用保守字宽。 */ }
        }
        const context = herbRxMeasureWidth.context;
        if (context) {
            context.font = (bold ? 'bold ' : '') + fontSize * 96 / 72 + 'px ' + HERB_RX_FONT;
            return context.measureText(text).width * 25.4 / 96;
        }
        return Array.from(text).reduce(function (width, character) {
            return width + fontSize * 25.4 / 72 * (/[^\x00-\xff]/.test(character) ? 1 : 0.62);
        }, 0);
    }

    function herbRxWrapText(text, width, fontSize, bold) {
        const lines = [];
        String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
            .replace(/\r\n?/g, '\n').split('\n').forEach(function (paragraph) {
            let line = '';
            for (const character of Array.from(paragraph)) {
                if (line && herbRxMeasureWidth(line + character, fontSize, bold) > width) {
                    lines.push(line);
                    line = character;
                } else line += character;
                if (herbRxMeasureWidth(line, fontSize, bold) > width + 0.01) {
                    throw new Error('文本框太窄，无法容纳当前字号，请调整版式。');
                }
            }
            lines.push(line);
        });
        return lines;
    }

    function herbRxPaginate(draft, config) {
        const body = config.elements.find(function (element) {
            return element.enabled && element.source === 'prescription.items';
        });
        const innerWidth = body.width - 4;
        const cellWidth = innerWidth / config.columns;
        const lineHeight = body.fontSize * 25.4 / 72 * 1.45;
        const rows = [];
        for (let offset = 0; offset < draft.prescription.items.length; offset += config.columns) {
            const cells = draft.prescription.items.slice(offset, offset + config.columns).map(function (item) {
                const name = config.drugName === 'source' ? item.sourceName : item.standardName;
                const text = name + ' ' + item.doseG + 'g' +
                    (item.specialPreparation ? '（' + item.specialPreparation + '）' : '');
                return {text: text, lines: herbRxWrapText(text, cellWidth - 3, body.fontSize, body.bold)};
            });
            const height = Math.max.apply(null, cells.map(function (cell) {return cell.lines.length;})) * lineHeight + 2.5;
            if (height > body.height - 4) {
                throw new Error('有药味文字超出单页药味区域，请增加区域高度或调整字号/列数。');
            }
            rows.push({cells: cells, height: height});
        }
        const pages = [];
        let pageRows = [], used = 0;
        rows.forEach(function (row) {
            if (pageRows.length && used + row.height > body.height - 4) {
                pages.push(pageRows);
                pageRows = [];
                used = 0;
            }
            pageRows.push(row);
            used += row.height;
        });
        if (pageRows.length) pages.push(pageRows);
        return {pages: pages, body: body, cellWidth: cellWidth, lineHeight: lineHeight};
    }

    function herbRxSvgText(lines, x, y, width, fontSize, lineHeight, align, bold) {
        let anchor = 'start', drawX = x;
        if (align === 'center') {anchor = 'middle'; drawX += width / 2;}
        if (align === 'right') {anchor = 'end'; drawX += width;}
        return '<text xml:space="preserve" x="' + drawX.toFixed(3) + '" y="' + y.toFixed(3) +
            '" text-anchor="' + anchor + '" font-size="' + (fontSize * 25.4 / 72).toFixed(3) +
            '" font-weight="' + (bold ? 'bold' : 'normal') + '">' +
            lines.map(function (line, index) {
                return '<tspan x="' + drawX.toFixed(3) + '" dy="' +
                    (index ? lineHeight.toFixed(3) : '0') + '">' + escapeHtml(line) + '</tspan>';
            }).join('') + '</text>';
    }

    function herbRxBuildPages(draft, rawConfig) {
        const config = herbRxNormalizeConfig(rawConfig);
        const paper = herbRxPaper(config.paper);
        config.elements.filter(function (element) {return element.enabled;}).forEach(function (element) {
            const left = config.offsetX + element.x * config.scale;
            const top = config.offsetY + element.y * config.scale;
            if (left < -0.01 || top < -0.01 ||
                left + element.width * config.scale > paper.width + 0.01 ||
                top + element.height * config.scale > paper.height + 0.01) {
                throw new Error('元素“' + element.label + '”经偏移/缩放后超出纸张，请调整版式校准。');
            }
        });
        const layout = herbRxPaginate(draft, config);
        return layout.pages.map(function (rows, index) {
            const content = [];
            config.elements.filter(function (element) {return element.enabled;}).forEach(function (element) {
                if (element.source === 'prescription.items') {
                    content.push('<rect x="' + element.x + '" y="' + element.y + '" width="' +
                        element.width + '" height="' + element.height + '" fill="none" stroke="#333" stroke-width="0.2"/>');
                    let y = element.y + 2;
                    rows.forEach(function (row) {
                        row.cells.forEach(function (cell, cellIndex) {
                            content.push(herbRxSvgText(cell.lines,
                                element.x + 2 + cellIndex * layout.cellWidth,
                                y + element.fontSize * 25.4 / 72,
                                layout.cellWidth - 3, element.fontSize, layout.lineHeight, 'left', element.bold));
                        });
                        y += row.height;
                    });
                    return;
                }
                const lineHeight = element.fontSize * 25.4 / 72 * 1.4;
                const lines = herbRxWrapText(herbRxSourceText(element, draft, index + 1, layout.pages.length),
                    element.width, element.fontSize, element.bold);
                if (lines.length * lineHeight > element.height + 0.01) {
                    throw new Error('元素“' + element.label + '”内容超出文本框，请增高文本框或调整字号。');
                }
                content.push(herbRxSvgText(lines, element.x, element.y + element.fontSize * 25.4 / 72,
                    element.width, element.fontSize, lineHeight, element.align, element.bold));
            });
            return '<svg xmlns="http://www.w3.org/2000/svg" width="' + paper.width + 'mm" height="' +
                paper.height + 'mm" viewBox="0 0 ' + paper.width + ' ' + paper.height +
                '" style="font-family:' + escapeHtml(HERB_RX_FONT) + ';background:#fff;color:#000" role="img" aria-label="中药饮片处方单">' +
                '<rect width="' + paper.width + '" height="' + paper.height + '" fill="white"/>' +
                '<g fill="#000" transform="translate(' + config.offsetX + ' ' + config.offsetY + ') scale(' +
                config.scale + ')">' + content.join('') + '</g></svg>';
        });
    }

    function herbRxEnsureStyle() {
        if (document.getElementById(HERB_RX_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = HERB_RX_STYLE_ID;
        style.textContent = [
            '.herb-rx-layer{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:' + HERB_RX_FONT + ';font-size:13px;color:#29343a;}',
            '.herb-rx-mask{position:absolute;inset:0;background:rgba(0,0,0,.5);}',
            '.herb-rx-dialog{position:relative;display:flex;flex-direction:column;box-sizing:border-box;width:min(1280px,calc(100vw - 24px));height:min(850px,calc(100vh - 24px));background:#fff;border-radius:8px;box-shadow:0 12px 42px rgba(0,0,0,.4);overflow:hidden;}',
            '.herb-rx-header{display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;padding:12px 16px;background:' + MODAL_HEADER_COLOR + ';color:#fff;font-size:16px;font-weight:bold;}',
            '.herb-rx-close{border:0!important;background:transparent!important;color:white!important;padding:0 4px!important;font-size:25px!important;cursor:pointer;}',
            '.herb-rx-body{display:flex;gap:10px;flex:1;min-height:0;padding:10px;background:#f5f8fa;}',
            '.herb-rx-left{width:315px;flex:0 0 315px;box-sizing:border-box;padding:10px;overflow:auto;border:1px solid #cce3ec;border-radius:6px;background:#fff;}',
            '.herb-rx-calibration .herb-rx-left{width:340px;flex-basis:340px;}',
            '.herb-rx-preview{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid #cce3ec;border-radius:6px;overflow:hidden;}',
            '.herb-rx-toolbar,.herb-rx-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
            '.herb-rx-toolbar{padding:8px 10px;border-bottom:1px solid #cce3ec;background:#fff;}',
            '.herb-rx-stage{flex:1;min-height:0;overflow:auto;padding:14px;background:#d9e1e5;outline:none;}',
            '.herb-rx-sheet{position:relative;margin:0 auto 14px;background:white;box-shadow:0 2px 10px rgba(0,0,0,.25);}',
            '.herb-rx-sheet svg{display:block;width:100%;height:100%;}',
            '.herb-rx-status{padding:8px 10px;margin-bottom:10px;border-radius:5px;background:#fff8e8;color:#886200;line-height:1.6;font-size:12px;white-space:pre-wrap;}',
            '.herb-rx-status.ok{background:#edf9f1;color:#277548;}.herb-rx-status.error{background:#fff0ef;color:#a83e36;}',
            '.herb-rx-layer label{display:flex;flex-direction:column;gap:4px;font-size:12px;}',
            '.herb-rx-form{display:grid;grid-template-columns:1fr 1fr;gap:9px;}.herb-rx-wide{grid-column:1/-1;}',
            '.herb-rx-layer input[type="text"],.herb-rx-layer input[type="number"],.herb-rx-layer input[type="date"],.herb-rx-layer select,.herb-rx-layer textarea{box-sizing:border-box;width:100%;border:1px solid #b9d9e7;border-radius:4px;padding:6px;font-family:inherit;font-size:12px;background:#fff;color:#263238;}',
            '.herb-rx-layer textarea{min-height:60px;resize:vertical;}.herb-rx-layer input[type="range"]{width:110px;vertical-align:middle;}',
            '.herb-rx-layer button{border-radius:4px;height:32px;padding:0 10px;font-family:inherit;font-size:12px;cursor:pointer;}',
            '.herb-rx-layer button.primary{border:1px solid #159bd3;background:#159bd3;color:#fff;}',
            '.herb-rx-layer button.secondary{border:1px solid #b9d9e7;background:#f3fbfe;color:#117fac;}',
            '.herb-rx-layer button.danger{border:1px solid #e39a92;background:#fff4f3;color:#b63e35;}',
            '.herb-rx-layer button:disabled{opacity:.5;cursor:not-allowed;}',
            '.herb-rx-subhead{font-weight:bold;color:#117fac;margin:12px 0 8px;}.herb-rx-hint{margin:9px 0;color:#65777e;font-size:11px;line-height:1.65;}',
            '.herb-rx-check{flex-direction:row!important;align-items:center;gap:6px!important;}',
            '.herb-rx-element-list{display:flex;flex-direction:column;gap:4px;max-height:190px;overflow:auto;margin:8px 0;padding:4px;border:1px solid #d6e6ec;}',
            '.herb-rx-element-list button{text-align:left;flex:0 0 auto;min-height:30px;height:auto;padding:6px;}.herb-rx-element-list .selected{border-color:#f08b22;background:#fff6e9;}',
            '.herb-rx-overlay{position:absolute;box-sizing:border-box;border:1px dashed #159bd3;background:rgba(21,155,211,.04);cursor:move;touch-action:none;user-select:none;}',
            '.herb-rx-overlay.selected{border:2px solid #f08b22;background:rgba(240,139,34,.05);z-index:2;}',
            '.herb-rx-overlay.disabled{opacity:.45;}.herb-rx-overlay-label{position:absolute;left:-1px;top:-15px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#117fac;color:white;padding:0 3px;font-size:9px;line-height:14px;pointer-events:none;}',
            '.herb-rx-overlay.selected .herb-rx-overlay-label{background:#f08b22;}',
            '.herb-rx-resize{position:absolute;right:-5px;bottom:-5px;width:10px;height:10px;background:#f08b22;border:1px solid white;cursor:nwse-resize;}',
            '@media(max-width:800px){.herb-rx-body{display:block;overflow:auto;}.herb-rx-left,.herb-rx-calibration .herb-rx-left{width:100%;margin-bottom:10px;overflow:visible;}.herb-rx-preview{height:650px;}.herb-rx-dialog{height:calc(100vh - 12px);width:calc(100vw - 12px);}}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function herbRxSetStatus(modal, text, kind) {
        const box = modal.querySelector('.herb-rx-status');
        box.textContent = text;
        box.className = 'herb-rx-status ' + (kind || '');
    }

    function herbRxInputHtml(label, path, type, wide) {
        const multiline = type === 'textarea';
        return '<label class="' + (wide ? 'herb-rx-wide' : '') + '">' + escapeHtml(label) +
            (multiline ? '<textarea' : '<input type="' + (type || 'text') + '"') +
            ' data-rx-field="' + path + '"' + (multiline ? ' maxlength="4000"></textarea>' : ' maxlength="160">') + '</label>';
    }

    function herbRxReadForm(modal) {
        modal.querySelectorAll('[data-rx-field]').forEach(function (input) {
            const parts = input.dataset.rxField.split('.');
            modal._rxDraft[parts[0]][parts[1]] = input.value.trim();
        });
        const count = Number(modal._rxDraft.prescription.doseCount);
        if (!Number.isInteger(count) || count < 1 || count > 60) {
            throw new Error('处方剂数必须是1～60之间的整数。');
        }
        modal._rxDraft.prescription.doseCount = count;
        return modal._rxDraft;
    }

    function herbRxRenderPreview(modal) {
        try {
            const pages = herbRxBuildPages(herbRxReadForm(modal), modal._rxConfig);
            const paper = herbRxPaper(modal._rxConfig.paper);
            const zoom = Number(modal.querySelector('.herb-rx-zoom').value) / 100;
            modal.querySelector('.herb-rx-pages').innerHTML = pages.map(function (svg) {
                return '<div class="herb-rx-sheet" style="width:' + paper.width * zoom * 96 / 25.4 +
                    'px;height:' + paper.height * zoom * 96 / 25.4 + 'px">' + svg + '</div>';
            }).join('');
            modal.querySelector('.herb-rx-zoom-value').textContent = Math.round(zoom * 100) + '%';
            modal._rxPages = pages;
            herbRxSetStatus(modal, modal._rxDraft.prescription.items.length + '味药，' +
                modal._rxDraft.prescription.doseCount + '剂；' + modal._rxConfig.paper + '，共' +
                pages.length + '页。请核对患者资料、药名、剂量和特殊煎法。', 'ok');
        } catch (error) {
            modal._rxPages = null;
            modal.querySelector('.herb-rx-pages').textContent = '';
            herbRxSetStatus(modal, error.message, 'error');
        }
    }

    function herbRxPrintDocument(pages, config, name) {
        const paper = herbRxPaper(config.paper);
        return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' +
            escapeHtml(name + '_中药饮片处方单') + '</title><style>@page{size:' + paper.width +
            'mm ' + paper.height + 'mm;margin:0;}html,body{margin:0;padding:0;background:#fff;}' +
            '.herb-rx-print-sheet{width:' + paper.width + 'mm;height:' + paper.height +
            'mm;break-after:page;page-break-after:always;overflow:hidden;}' +
            '.herb-rx-print-sheet:last-child{break-after:auto;page-break-after:auto;}' +
            'svg{display:block;width:100%;height:100%;}</style></head><body>' +
            pages.map(function (svg) {return '<div class="herb-rx-print-sheet">' + svg + '</div>';}).join('') +
            '</body></html>';
    }

    function herbRxPrint(modal) {
        try {
            const draft = herbRxReadForm(modal);
            if (!draft.patient.name) throw new Error('请补全患者姓名后再打印。');
            const current = herbRxDetectPatient();
            if (modal._rxDetectedNumber && current && current.number !== modal._rxDetectedNumber) {
                throw new Error('当前页面患者已切换，请关闭并重新打开处方单。');
            }
            const pages = herbRxBuildPages(draft, modal._rxConfig);
            const oldFrame = document.getElementById('medical-herb-prescription-print-frame');
            if (oldFrame) oldFrame.remove();
            const frame = document.createElement('iframe');
            frame.id = 'medical-herb-prescription-print-frame';
            frame.title = '中药处方打印';
            frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
            frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;';
            frame.onload = async function () {
                try {
                    if (!frame.contentDocument.querySelector('.herb-rx-print-sheet')) return;
                    if (frame.contentDocument.fonts && frame.contentDocument.fonts.ready) {
                        await frame.contentDocument.fonts.ready;
                    }
                    frame.contentWindow.addEventListener('afterprint', function () {frame.remove();}, {once: true});
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                    if (modal.isConnected) herbRxSetStatus(modal, '已打开系统打印窗口。请选用' +
                        modal._rxConfig.paper + '纸张、100%缩放，并关闭浏览器页眉/页脚；可选择“另存为PDF”。', 'ok');
                } catch (error) {
                    frame.remove();
                    if (modal.isConnected) herbRxSetStatus(modal, '无法打开系统打印窗口：' + error.message, 'error');
                }
            };
            frame.srcdoc = herbRxPrintDocument(pages, modal._rxConfig, draft.patient.name);
            document.body.appendChild(frame);
        } catch (error) {
            herbRxSetStatus(modal, error.message, 'error');
        }
    }

    function herbRxOpenPrintModal(herbModal) {
        const items = herbRxValidateItems(readItemsFromTable(herbModal));
        const doseCount = Number(herbModal.querySelector('.herb-dose-count').value);
        if (!Number.isInteger(doseCount) || doseCount < 1 || doseCount > 60) {
            throw new Error('请先确认中草药面板中的剂数为1～60之间的整数。');
        }
        herbRxEnsureStyle();
        const old = document.getElementById(HERB_RX_PRINT_ID);
        if (old) old.remove();
        const patient = herbRxDetectPatient();
        const modal = document.createElement('div');
        modal.id = HERB_RX_PRINT_ID;
        modal.className = 'herb-rx-layer';
        modal._rxConfig = herbRxLoadConfig() || herbRxDefaultConfig();
        modal._rxDetectedNumber = patient && patient.number || '';
        modal._rxDraft = {
            patient: patient || {name: '', sex: '', age: '', number: '', bed: '', department: '', diagnosis: '', allergy: ''},
            prescription: {
                date: herbRxToday(), doseCount: doseCount,
                mode: herbModal.querySelector('.herb-decoction-mode').value,
                instructions: '', doctor: '', pharmacist: '', reviewer: '', items: items
            }
        };
        const fields = [
            herbRxInputHtml('姓名', 'patient.name'), herbRxInputHtml('性别', 'patient.sex'),
            herbRxInputHtml('年龄（含单位）', 'patient.age'), herbRxInputHtml('床号', 'patient.bed'),
            herbRxInputHtml('病案号/就诊号', 'patient.number', 'text', true),
            herbRxInputHtml('科室', 'patient.department'), herbRxInputHtml('处方日期', 'prescription.date', 'date'),
            herbRxInputHtml('剂数', 'prescription.doseCount', 'number'),
            '<label>煎煮方式<select data-rx-field="prescription.mode"><option>代煎</option><option>自煎</option><option>外用</option><option>冲服</option></select></label>',
            herbRxInputHtml('临床诊断', 'patient.diagnosis', 'textarea', true),
            herbRxInputHtml('过敏史（未填写则留空）', 'patient.allergy', 'text', true),
            herbRxInputHtml('用法/补充说明', 'prescription.instructions', 'textarea', true),
            herbRxInputHtml('医师', 'prescription.doctor'),
            herbRxInputHtml('调配药师', 'prescription.pharmacist'),
            herbRxInputHtml('核对药师', 'prescription.reviewer')
        ].join('');
        modal.innerHTML = '<div class="herb-rx-mask"></div><div class="herb-rx-dialog">' +
            '<div class="herb-rx-header"><span>打印中药处方单</span><button type="button" class="herb-rx-close">×</button></div>' +
            '<div class="herb-rx-body"><div class="herb-rx-left"><div class="herb-rx-status"></div>' +
            '<div class="herb-rx-form">' + fields + '</div><div class="herb-rx-hint">' +
            (patient ? '已读取当前可见患者信息，请逐项核对。' : '未可靠识别患者，请手工填写。') +
            '只打印打开窗口时已勾选的药味及当前表格剂量；特殊煎法保留原文。患者资料仅用于本次打印。</div>' +
            '<div class="herb-rx-actions"><button type="button" class="primary herb-rx-print">打印/保存PDF</button>' +
            '<button type="button" class="secondary herb-rx-calibrate">版式校准/元素映射</button></div>' +
            '<div class="herb-rx-hint">较多药味自动分页；每页重复患者资料及签署栏。打印校准配置可随WebDAV备份，患者资料不进入备份。</div></div>' +
            '<div class="herb-rx-preview"><div class="herb-rx-toolbar"><span>打印预览</span>' +
            '<input type="range" class="herb-rx-zoom" min="35" max="120" value="80"><span class="herb-rx-zoom-value"></span></div>' +
            '<div class="herb-rx-stage herb-rx-pages"></div></div></div></div>';
        document.body.appendChild(modal);
        modal.querySelectorAll('[data-rx-field]').forEach(function (input) {
            const parts = input.dataset.rxField.split('.');
            input.value = String(modal._rxDraft[parts[0]][parts[1]]);
        });
        function close() {
            const calibration = document.getElementById(HERB_RX_CALIBRATION_ID);
            if (calibration && calibration._rxParent === modal) return;
            clearTimeout(modal._rxTimer);
            modal.remove();
        }
        modal.querySelector('.herb-rx-close').addEventListener('click', close);
        modal.querySelector('.herb-rx-mask').addEventListener('click', close);
        modal.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {event.stopPropagation(); close();}
        });
        modal.querySelectorAll('[data-rx-field]').forEach(function (input) {
            input.addEventListener('input', function () {
                clearTimeout(modal._rxTimer);
                modal._rxTimer = setTimeout(function () {herbRxRenderPreview(modal);}, 100);
            });
        });
        modal.querySelector('.herb-rx-zoom').addEventListener('input', function () {herbRxRenderPreview(modal);});
        modal.querySelector('.herb-rx-print').addEventListener('click', function () {herbRxPrint(modal);});
        modal.querySelector('.herb-rx-calibrate').addEventListener('click', function () {
            try {herbRxReadForm(modal); herbRxOpenCalibration(modal);}
            catch (error) {herbRxSetStatus(modal, error.message, 'error');}
        });
        herbRxRenderPreview(modal);
        modal.querySelector('.herb-rx-close').focus();
    }

    function herbRxChangePaper(config, paper) {
        const old = herbRxPaper(config.paper), next = herbRxPaper(paper);
        config.elements.forEach(function (element) {
            element.x *= next.width / old.width;
            element.width *= next.width / old.width;
            element.y *= next.height / old.height;
            element.height *= next.height / old.height;
        });
        config.paper = paper;
    }

    function herbRxConstrainElement(element, paper) {
        element.width = Math.max(5, Math.min(paper.width, element.width));
        element.height = Math.max(3, Math.min(paper.height, element.height));
        element.x = Math.max(0, Math.min(paper.width - element.width, element.x));
        element.y = Math.max(0, Math.min(paper.height - element.height, element.y));
        element.fontSize = Math.max(6, Math.min(28, element.fontSize));
    }

    function herbRxSelectedElement(modal) {
        return modal._rxWorking.elements.find(function (element) {
            return element.id === modal._rxSelectedId;
        });
    }

    function herbRxCalibrationEditorHtml() {
        function input(label, prop, type, wide) {
            return '<label class="' + (wide ? 'herb-rx-wide' : '') + '">' + label +
                '<input type="' + (type || 'text') + '" data-rx-prop="' + prop + '"' +
                (type === 'number' ? ' step="0.1"' : '') + '></label>';
        }
        return input('元素名称', 'label', 'text', true) +
            '<label class="herb-rx-wide">数据来源映射<select data-rx-prop="source">' +
            HERB_RX_SOURCES.map(function (item) {
                return '<option value="' + item[0] + '">' + item[1] + '</option>';
            }).join('') + '</select></label>' +
            input('前缀/字段标签', 'prefix', 'text', true) +
            '<label class="herb-rx-wide">固定文字<textarea data-rx-prop="text" maxlength="4000"></textarea></label>' +
            input('X（mm）', 'x', 'number') + input('Y（mm）', 'y', 'number') +
            input('宽度（mm）', 'width', 'number') + input('高度（mm）', 'height', 'number') +
            input('字号（pt）', 'fontSize', 'number') +
            '<label>对齐<select data-rx-prop="align"><option value="left">左对齐</option>' +
            '<option value="center">居中</option><option value="right">右对齐</option></select></label>' +
            '<label class="herb-rx-check"><input type="checkbox" data-rx-prop="enabled">启用元素</label>' +
            '<label class="herb-rx-check"><input type="checkbox" data-rx-prop="bold">加粗</label>';
    }

    function herbRxCalibrationSyncControls(modal) {
        modal.querySelectorAll('[data-rx-global]').forEach(function (input) {
            input.value = String(modal._rxWorking[input.dataset.rxGlobal]);
        });
        const element = herbRxSelectedElement(modal);
        modal.querySelectorAll('[data-rx-prop]').forEach(function (input) {
            const prop = input.dataset.rxProp;
            input.disabled = !element || (prop === 'text' && element.source !== 'fixed');
            if (!element) return;
            if (input.type === 'checkbox') input.checked = element[prop];
            else input.value = typeof element[prop] === 'number'
                ? String(Math.round(element[prop] * 100) / 100) : element[prop];
        });
        modal.querySelector('.herb-rx-delete').disabled =
            !element || (element.enabled && element.source === 'prescription.items');
        modal.querySelector('.herb-rx-duplicate').disabled = !element;
        modal.querySelector('.herb-rx-dirty').textContent = modal._rxDirty ? '尚未保存' : '已载入保存版式';
    }

    function herbRxOverlayPosition(modal, overlay, element) {
        const config = modal._rxWorking, paper = herbRxPaper(config.paper);
        overlay.style.left = (config.offsetX + element.x * config.scale) / paper.width * 100 + '%';
        overlay.style.top = (config.offsetY + element.y * config.scale) / paper.height * 100 + '%';
        overlay.style.width = element.width * config.scale / paper.width * 100 + '%';
        overlay.style.height = element.height * config.scale / paper.height * 100 + '%';
    }

    function herbRxCalibrationRender(modal, keepOverlays) {
        const config = modal._rxWorking, paper = herbRxPaper(config.paper);
        const zoom = Number(modal.querySelector('.herb-rx-zoom').value) / 100;
        const sheet = modal.querySelector('.herb-rx-cal-sheet');
        sheet.style.width = paper.width * zoom * 96 / 25.4 + 'px';
        sheet.style.height = paper.height * zoom * 96 / 25.4 + 'px';
        modal.querySelector('.herb-rx-zoom-value').textContent = Math.round(zoom * 100) + '%';
        try {
            const pages = herbRxBuildPages(modal._rxParent._rxDraft, config);
            modal.querySelector('.herb-rx-cal-svg').innerHTML = pages[0];
            herbRxSetStatus(modal, '当前预览第1/' + pages.length + '页。' +
                (modal._rxDirty ? '校准尚未保存。' : '拖动框或修改属性可调整版式。'), modal._rxDirty ? '' : 'ok');
        } catch (error) {
            modal.querySelector('.herb-rx-cal-svg').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
                paper.width + ' ' + paper.height + '"><rect width="100%" height="100%" fill="white"/></svg>';
            herbRxSetStatus(modal, error.message, 'error');
        }
        modal.querySelector('.herb-rx-element-list').innerHTML = config.elements.map(function (element) {
            return '<button type="button" class="secondary' +
                (element.id === modal._rxSelectedId ? ' selected' : '') + '" data-rx-element="' +
                escapeHtml(element.id) + '">' + escapeHtml(element.label) + (element.enabled ? '' : '（停用）') + '</button>';
        }).join('');
        if (!keepOverlays) {
            const overlays = modal.querySelector('.herb-rx-overlays');
            overlays.innerHTML = '';
            config.elements.forEach(function (element) {
                const overlay = document.createElement('div');
                overlay.className = 'herb-rx-overlay' + (element.enabled ? '' : ' disabled') +
                    (element.id === modal._rxSelectedId ? ' selected' : '');
                overlay.dataset.rxElement = element.id;
                overlay.innerHTML = '<span class="herb-rx-overlay-label">' + escapeHtml(element.label) +
                    '</span><span class="herb-rx-resize"></span>';
                herbRxOverlayPosition(modal, overlay, element);
                overlay.addEventListener('pointerdown', function (event) {herbRxCalibrationPointer(modal, overlay, event);});
                overlays.appendChild(overlay);
            });
        }
        herbRxCalibrationSyncControls(modal);
    }

    function herbRxCalibrationSelect(modal, id) {
        modal._rxSelectedId = id;
        herbRxCalibrationRender(modal, false);
        modal.querySelector('.herb-rx-stage').focus();
    }

    function herbRxCalibrationPointer(modal, overlay, event) {
        if (event.button !== 0) return;
        if (modal._rxEndPointer) modal._rxEndPointer();
        event.preventDefault();
        event.stopPropagation();
        modal._rxSelectedId = overlay.dataset.rxElement;
        modal.querySelector('.herb-rx-stage').focus();
        modal.querySelectorAll('.herb-rx-overlay').forEach(function (item) {
            item.classList.toggle('selected', item === overlay);
        });
        herbRxCalibrationSyncControls(modal);
        const element = herbRxSelectedElement(modal);
        const pageRect = modal.querySelector('.herb-rx-cal-sheet').getBoundingClientRect();
        if (!element || !pageRect.width) return;
        const resize = event.target.classList.contains('herb-rx-resize');
        const start = {pointerX: event.clientX, pointerY: event.clientY, x: element.x,
            y: element.y, width: element.width, height: element.height};
        const paper = herbRxPaper(modal._rxWorking.paper);
        const scale = modal._rxWorking.scale;
        try {overlay.setPointerCapture(event.pointerId);} catch (error) { /* 文档级监听兜底。 */ }
        function move(moveEvent) {
            if (moveEvent.pointerId !== event.pointerId) return;
            const dx = (moveEvent.clientX - start.pointerX) * paper.width / pageRect.width / scale;
            const dy = (moveEvent.clientY - start.pointerY) * paper.height / pageRect.height / scale;
            if (resize) {
                element.width = Math.max(5, Math.min(paper.width - start.x, start.width + dx));
                element.height = Math.max(3, Math.min(paper.height - start.y, start.height + dy));
            } else {
                element.x = start.x + dx;
                element.y = start.y + dy;
            }
            herbRxConstrainElement(element, paper);
            modal._rxDirty = true;
            herbRxOverlayPosition(modal, overlay, element);
            herbRxCalibrationSyncControls(modal);
            clearTimeout(modal._rxDragPreviewTimer);
            modal._rxDragPreviewTimer = setTimeout(function () {
                if (modal.isConnected) herbRxCalibrationRender(modal, true);
            }, 100);
        }
        function finish(finishEvent) {
            if (finishEvent && finishEvent.pointerId !== event.pointerId) return;
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', finish);
            document.removeEventListener('pointercancel', finish);
            modal._rxEndPointer = null;
            clearTimeout(modal._rxDragPreviewTimer);
            try {overlay.releasePointerCapture(event.pointerId);} catch (error) { /* 已释放时忽略。 */ }
            herbRxCalibrationRender(modal, false);
        }
        modal._rxEndPointer = finish;
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', finish);
        document.addEventListener('pointercancel', finish);
    }

    function herbRxCalibrationNewElement(modal, duplicate) {
        if (modal._rxWorking.elements.length >= 60) {
            herbRxSetStatus(modal, '最多允许60个元素。', 'error');
            return;
        }
        const selected = herbRxSelectedElement(modal);
        const element = duplicate && selected ? herbRxClone(selected) : {
            label: '自定义文本框', source: 'fixed', x: 12, y: 32, width: 60, height: 10,
            fontSize: 10, align: 'left', bold: false, enabled: true, prefix: '', text: '自定义文字'
        };
        element.id = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        if (duplicate && selected) {
            element.label += '（副本）';
            element.x += 2;
            element.y += 2;
            if (element.source === 'prescription.items') {
                element.source = 'fixed';
                element.text = '自定义文字';
            }
        }
        herbRxConstrainElement(element, herbRxPaper(modal._rxWorking.paper));
        modal._rxWorking.elements.push(element);
        modal._rxSelectedId = element.id;
        modal._rxDirty = true;
        herbRxCalibrationRender(modal, false);
    }

    function herbRxCalibrationExport(modal) {
        try {
            const payload = {
                kind: HERB_RX_LAYOUT_KIND, schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                config: herbRxNormalizeConfig(modal._rxWorking)
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = '中药处方单版式映射_' + herbRxToday() + '.json';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(function () {URL.revokeObjectURL(url);}, 1000);
            herbRxSetStatus(modal, '已导出版式配置（不含本次患者资料或药味数据）。', 'ok');
        } catch (error) {herbRxSetStatus(modal, error.message, 'error');}
    }

    function herbRxCalibrationImport(modal, file) {
        if (!file) return;
        if (file.size > 512000) {
            herbRxSetStatus(modal, '版式配置文件超过500KB。', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = function () {
            try {
                const payload = JSON.parse(String(reader.result || ''));
                if (payload.kind !== HERB_RX_LAYOUT_KIND || payload.schemaVersion !== 1) {
                    throw new Error('文件不是中药处方单版式映射。');
                }
                const config = herbRxNormalizeConfig(payload.config);
                if (modal._rxDirty && !window.confirm('导入会替换尚未保存的校准修改，是否继续？')) return;
                modal._rxWorking = config;
                modal._rxSelectedId = config.elements[0].id;
                modal._rxDirty = true;
                herbRxCalibrationRender(modal, false);
                herbRxSetStatus(modal, '已导入预览，点击“保存校准配置”后生效。');
            } catch (error) {herbRxSetStatus(modal, '导入失败：' + error.message, 'error');}
        };
        reader.onerror = function () {herbRxSetStatus(modal, '无法读取版式配置文件。', 'error');};
        reader.readAsText(file, 'utf-8');
    }

    function herbRxOpenCalibration(parent) {
        const existing = document.getElementById(HERB_RX_CALIBRATION_ID);
        if (existing) return;
        const modal = document.createElement('div');
        modal.id = HERB_RX_CALIBRATION_ID;
        modal.className = 'herb-rx-layer herb-rx-calibration';
        modal._rxParent = parent;
        modal._rxWorking = herbRxClone(parent._rxConfig);
        modal._rxSelectedId = modal._rxWorking.elements[0].id;
        modal._rxDirty = false;
        modal.innerHTML = '<div class="herb-rx-mask"></div><div class="herb-rx-dialog">' +
            '<div class="herb-rx-header"><span>处方单版式校准/元素映射</span><button type="button" class="herb-rx-close">×</button></div>' +
            '<div class="herb-rx-body"><div class="herb-rx-left"><div class="herb-rx-status"></div>' +
            '<div class="herb-rx-subhead">纸张与打印校准</div><div class="herb-rx-form">' +
            '<label>纸张<select data-rx-global="paper"><option value="A5">A5竖向</option><option value="A4">A4竖向</option></select></label>' +
            '<label>药味列数<input type="number" min="1" max="4" step="1" data-rx-global="columns"></label>' +
            '<label>横向偏移（mm）<input type="number" min="-20" max="20" step="0.1" data-rx-global="offsetX"></label>' +
            '<label>纵向偏移（mm）<input type="number" min="-20" max="20" step="0.1" data-rx-global="offsetY"></label>' +
            '<label>整体缩放<input type="number" min="0.7" max="1.3" step="0.01" data-rx-global="scale"></label>' +
            '<label>打印药名<select data-rx-global="drugName"><option value="standard">系统药名（去★）</option><option value="source">原药名（去★）</option></select></label></div>' +
            '<div class="herb-rx-subhead">模板元素</div><div class="herb-rx-actions">' +
            '<button type="button" class="secondary herb-rx-add">新增文本框</button>' +
            '<button type="button" class="secondary herb-rx-duplicate">复制</button>' +
            '<button type="button" class="danger herb-rx-delete">删除</button></div>' +
            '<div class="herb-rx-element-list"></div><div class="herb-rx-form herb-rx-editor">' +
            herbRxCalibrationEditorHtml() + '</div><div class="herb-rx-hint">' +
            '选中蓝框后可拖动；拖动右下角调整宽高。方向键移动0.5mm，Shift＋方向键移动2mm。坐标单位为mm，字号单位为pt。保存后才会影响正式打印。</div>' +
            '<div class="herb-rx-actions"><button type="button" class="secondary herb-rx-reset">恢复默认版式</button>' +
            '<button type="button" class="secondary herb-rx-export">导出配置</button>' +
            '<button type="button" class="secondary herb-rx-import">导入配置</button>' +
            '<input type="file" class="herb-rx-import-file" accept="application/json,.json" hidden></div></div>' +
            '<div class="herb-rx-preview"><div class="herb-rx-toolbar">' +
            '<button type="button" class="primary herb-rx-save">保存校准配置</button>' +
            '<button type="button" class="secondary herb-rx-undo">撤销上次保存</button><span class="herb-rx-dirty"></span>' +
            '<input type="range" class="herb-rx-zoom" min="35" max="120" value="75"><span class="herb-rx-zoom-value"></span></div>' +
            '<div class="herb-rx-stage" tabindex="0"><div class="herb-rx-sheet herb-rx-cal-sheet">' +
            '<div class="herb-rx-cal-svg" style="width:100%;height:100%"></div>' +
            '<div class="herb-rx-overlays" style="position:absolute;inset:0"></div></div></div></div></div></div>';
        document.body.appendChild(modal);
        function close() {
            if (modal._rxDirty && !window.confirm('版式校准尚未保存，是否放弃本次修改？')) return;
            if (modal._rxEndPointer) modal._rxEndPointer();
            modal.remove();
            if (parent.isConnected) {
                herbRxRenderPreview(parent);
                parent.querySelector('.herb-rx-calibrate').focus();
            }
        }
        modal.querySelector('.herb-rx-close').addEventListener('click', close);
        modal.querySelector('.herb-rx-mask').addEventListener('click', close);
        modal.querySelector('.herb-rx-zoom').addEventListener('input', function () {herbRxCalibrationRender(modal, false);});
        modal.querySelector('.herb-rx-element-list').addEventListener('click', function (event) {
            const button = event.target.closest('[data-rx-element]');
            if (button) herbRxCalibrationSelect(modal, button.dataset.rxElement);
        });
        modal.querySelectorAll('[data-rx-global]').forEach(function (input) {
            input.addEventListener('change', function () {
                const prop = input.dataset.rxGlobal;
                if (prop === 'paper') herbRxChangePaper(modal._rxWorking, input.value);
                else if (prop === 'drugName') modal._rxWorking[prop] = input.value;
                else modal._rxWorking[prop] = input.value === '' ? NaN : Number(input.value);
                modal._rxDirty = true;
                herbRxCalibrationRender(modal, false);
            });
        });
        modal.querySelectorAll('[data-rx-prop]').forEach(function (input) {
            input.addEventListener('change', function () {
                const element = herbRxSelectedElement(modal);
                if (!element) return;
                const prop = input.dataset.rxProp;
                if (input.type === 'checkbox') element[prop] = input.checked;
                else if (input.type === 'number') {
                    if (input.value === '' || !Number.isFinite(Number(input.value))) {
                        herbRxCalibrationSyncControls(modal);
                        return;
                    }
                    element[prop] = Number(input.value);
                    herbRxConstrainElement(element, herbRxPaper(modal._rxWorking.paper));
                } else element[prop] = input.value;
                modal._rxDirty = true;
                herbRxCalibrationRender(modal, false);
            });
        });
        modal.querySelector('.herb-rx-add').addEventListener('click', function () {herbRxCalibrationNewElement(modal, false);});
        modal.querySelector('.herb-rx-duplicate').addEventListener('click', function () {herbRxCalibrationNewElement(modal, true);});
        modal.querySelector('.herb-rx-delete').addEventListener('click', function () {
            const selected = herbRxSelectedElement(modal);
            if (!selected || (selected.enabled && selected.source === 'prescription.items')) return;
            modal._rxWorking.elements = modal._rxWorking.elements.filter(function (element) {return element !== selected;});
            modal._rxSelectedId = modal._rxWorking.elements[0] && modal._rxWorking.elements[0].id;
            modal._rxDirty = true;
            herbRxCalibrationRender(modal, false);
        });
        modal.querySelector('.herb-rx-save').addEventListener('click', function () {
            try {
                herbRxBuildPages(parent._rxDraft, modal._rxWorking);
                modal._rxWorking = herbRxSaveConfig(modal._rxWorking);
                parent._rxConfig = herbRxClone(modal._rxWorking);
                modal._rxDirty = false;
                herbRxCalibrationRender(modal, false);
                herbRxRenderPreview(parent);
                herbRxSetStatus(modal, '校准配置已保存，后续处方预览与打印立即使用此版式。', 'ok');
            } catch (error) {herbRxSetStatus(modal, '保存失败：' + error.message, 'error');}
        });
        modal.querySelector('.herb-rx-undo').addEventListener('click', function () {
            const previous = herbRxLoadConfig(KEYS.prescriptionLayoutRollback);
            if (!previous) {herbRxSetStatus(modal, '没有可撤销的上次保存版本。', 'error'); return;}
            if (modal._rxDirty && !window.confirm('载入上次保存前的版式将替换尚未保存的修改，是否继续？')) return;
            modal._rxWorking = previous;
            modal._rxSelectedId = previous.elements[0].id;
            modal._rxDirty = true;
            herbRxCalibrationRender(modal, false);
            herbRxSetStatus(modal, '已载入上次保存前的版式，点击“保存校准配置”后生效。');
        });
        modal.querySelector('.herb-rx-reset').addEventListener('click', function () {
            if (!window.confirm('恢复默认元素映射和坐标？点击保存后才会生效。')) return;
            const paper = modal._rxWorking.paper;
            modal._rxWorking = herbRxDefaultConfig();
            if (paper !== 'A5') herbRxChangePaper(modal._rxWorking, paper);
            modal._rxSelectedId = modal._rxWorking.elements[0].id;
            modal._rxDirty = true;
            herbRxCalibrationRender(modal, false);
        });
        modal.querySelector('.herb-rx-export').addEventListener('click', function () {herbRxCalibrationExport(modal);});
        const fileInput = modal.querySelector('.herb-rx-import-file');
        modal.querySelector('.herb-rx-import').addEventListener('click', function () {fileInput.click();});
        fileInput.addEventListener('change', function () {
            herbRxCalibrationImport(modal, fileInput.files[0]);
            fileInput.value = '';
        });
        modal.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {event.stopPropagation(); close(); return;}
            if (event.target.matches('input,select,textarea,button') || !/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
            const element = herbRxSelectedElement(modal);
            if (!element) return;
            event.preventDefault();
            const delta = event.shiftKey ? 2 : 0.5;
            if (event.key === 'ArrowLeft') element.x -= delta;
            if (event.key === 'ArrowRight') element.x += delta;
            if (event.key === 'ArrowUp') element.y -= delta;
            if (event.key === 'ArrowDown') element.y += delta;
            herbRxConstrainElement(element, herbRxPaper(modal._rxWorking.paper));
            modal._rxDirty = true;
            herbRxCalibrationRender(modal, false);
        });
        herbRxCalibrationRender(modal, false);
        modal.querySelector('.herb-rx-close').focus();
    }

    function updateRowStatus(modal, index, text, type) {
        const row = modal.querySelector(
            '.herb-result-body tr[data-index="' + index + '"]'
        );

        if (!row) {
            return;
        }

        const status = row.querySelector('.herb-status');

        status.textContent = text;
        status.dataset.type = type || '';
    }


    /******************************************************************
     * 十三、中草药剩余付数预警
     *
     * 计算原则：
     * 1. 每味中药的“药品总量 ÷ 单剂剂量”＝该味药对应的处方付数。
     * 2. 同一开立时间、同一医生和同一用法的多味中药视为同一张处方。
     * 3. 正常情况下同方各味的付数应一致；若不一致，按最少付数保守估算，
     *    并明确标记“付数不一致”，避免延迟预警。
     * 4. 默认每日1付：预计剩余天数＝估算付数－自开立时间起经过的天数。
     * 5. 仅扫描当前“医嘱查询”页面已经加载到DOM中的记录，不修改医院数据。
     ******************************************************************/

    function herbWarningThresholdValue(value, fallback) {
        const number = Number(value);

        return Number.isFinite(number) && number >= 0
            ? number
            : fallback;
    }

    function herbWarningRenderThresholdDays() {
        return herbWarningThresholdValue(
            GM_getValue(KEYS.herbWarningRenderThresholdDays, 5),
            5
        );
    }

    function herbWarningAlertThresholdDays() {
        return herbWarningThresholdValue(
            GM_getValue(KEYS.herbWarningAlertThresholdDays, 2),
            2
        );
    }

    function herbWarningFrontRenderEnabled() {
        return Boolean(
            GM_getValue(KEYS.herbWarningRenderEnabled, false)
        );
    }

    function herbWarningFirstOnlyEnabled() {
        return Boolean(
            GM_getValue(KEYS.herbWarningFirstOnly, false)
        );
    }

    function herbWarningRouteTimelineCompensationEnabled() {
        return Boolean(
            GM_getValue(
                KEYS.herbWarningRouteTimelineCompensation,
                false
            )
        );
    }

    function herbWarningRound(value, digits) {
        const number = Number(value);

        if (!Number.isFinite(number)) return null;

        return Number(number.toFixed(
            Number.isInteger(digits) ? digits : 1
        ));
    }

    function herbWarningParseDate(value) {
        const source = normalizePlainText(value);
        const matched = source.match(
            /(20\d{2})[-\/.年](\d{1,2})[-\/.月](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
        );

        if (!matched) return null;

        const date = new Date(
            Number(matched[1]),
            Number(matched[2]) - 1,
            Number(matched[3]),
            Number(matched[4] || 0),
            Number(matched[5] || 0),
            Number(matched[6] || 0),
            0
        );

        return Number.isFinite(date.getTime()) ? date : null;
    }

    function herbWarningFormatDate(value) {
        const date = value instanceof Date
            ? value
            : herbWarningParseDate(value);

        if (!date) return '-';

        const pad = function (number) {
            return String(number).padStart(2, '0');
        };

        return date.getFullYear() + '-' +
            pad(date.getMonth() + 1) + '-' +
            pad(date.getDate());
    }

    function herbWarningFormatDateTime(value) {
        const date = value instanceof Date
            ? value
            : herbWarningParseDate(value);

        if (!date) return '-';

        const pad = function (number) {
            return String(number).padStart(2, '0');
        };

        return date.getFullYear() + '-' +
            pad(date.getMonth() + 1) + '-' +
            pad(date.getDate()) + ' ' +
            pad(date.getHours()) + ':' +
            pad(date.getMinutes());
    }

    function herbWarningParseMass(value) {
        const source = normalizePlainText(value)
            .replace(/，/g, '.')
            .replace(/毫克/gi, 'mg')
            .replace(/微克/gi, 'ug')
            .replace(/千克/gi, 'kg')
            .replace(/克/gi, 'g');
        const matched = source.match(
            /(-?\d+(?:\.\d+)?)\s*(kg|mg|μg|ug|mcg|g)?/i
        );

        if (!matched) return null;

        const number = Number(matched[1]);

        if (!Number.isFinite(number) || number <= 0) return null;

        const unit = String(matched[2] || 'g').toLowerCase();
        let grams = number;

        if (unit === 'kg') {
            grams = number * 1000;
        }
        else if (unit === 'mg') {
            grams = number / 1000;
        }
        else if (unit === 'μg' || unit === 'ug' || unit === 'mcg') {
            grams = number / 1000000;
        }

        return {
            value: number,
            unit: unit,
            grams: grams
        };
    }

    function herbWarningHeaderMap(root) {
        return Array.from(
            root.querySelectorAll('thead th,th,[role="columnheader"]')
        ).filter(isVisible).map(function (header) {
            const rect = header.getBoundingClientRect();

            return {
                element: header,
                text: normalizePlainText(
                    header.innerText || header.textContent
                ),
                normalized: normalize(
                    header.innerText || header.textContent
                ),
                center: rect.left + rect.width / 2,
                area: rect.width * rect.height
            };
        }).filter(function (item) {
            return Boolean(item.normalized);
        });
    }

    function herbWarningFindHeader(headers, aliases) {
        const targets = aliases.map(normalize);
        const exact = headers.filter(function (header) {
            return targets.includes(header.normalized);
        });
        const partial = headers.filter(function (header) {
            return targets.some(function (target) {
                return header.normalized.includes(target) ||
                    target.includes(header.normalized);
            });
        });
        const candidates = exact.length ? exact : partial;

        candidates.sort(function (first, second) {
            return first.area - second.area;
        });

        return candidates[0] || null;
    }

    function herbWarningTableRows(table) {
        if (!table) return [];

        const selectors = [
            'tbody tr',
            '.layui-table-body tr',
            '.datagrid-body .datagrid-row',
            '.datagrid-row',
            '[role="row"]'
        ].join(',');
        const rows = Array.from(table.querySelectorAll(selectors))
            .filter(isVisible)
            .filter(function (row) {
                if (
                    row.closest('#' + IDS.modal) ||
                    row.closest('#' + IDS.panel) ||
                    row.querySelector('th')
                ) {
                    return false;
                }

                const cells = Array.from(
                    row.querySelectorAll('td,[role="gridcell"]')
                ).filter(isVisible);
                const text = normalizePlainText(
                    row.innerText || row.textContent
                );

                return cells.length >= 7 && text &&
                    !/暂无数据|无数据|没有数据/.test(text);
            });
        const unique = [];
        const seen = new Set();

        rows.forEach(function (row) {
            if (!seen.has(row)) {
                seen.add(row);
                unique.push(row);
            }
        });

        unique.sort(function (first, second) {
            return first.getBoundingClientRect().top -
                second.getBoundingClientRect().top;
        });

        return unique;
    }

    function herbWarningFindQueryContext() {
        const requiredAliases = [
            ['医嘱类型', '类型'],
            ['开始时间', '开立时间'],
            ['医嘱名称', '药品名称', '名称'],
            ['剂量', '每次剂量'],
            ['药品总量', '总量']
        ];
        const optionalAliases = [
            ['医嘱类别', '长临'],
            ['医生', '开立医生'],
            ['用法', '给药途径'],
            ['频次', '频率'],
            ['停止时间']
        ];
        const candidates = [];

        getAllDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll(
                'table,.layui-table-view,.datagrid,.datagrid-view,[role="grid"]'
            )).filter(isVisible).filter(function (root) {
                return !root.closest('#' + IDS.modal) &&
                    !root.closest('#' + IDS.panel);
            }).forEach(function (root) {
                const headers = herbWarningHeaderMap(root);
                const requiredHits = requiredAliases.reduce(
                    function (count, aliases) {
                        return count + (
                            herbWarningFindHeader(headers, aliases) ? 1 : 0
                        );
                    },
                    0
                );

                if (requiredHits < requiredAliases.length) return;

                const optionalHits = optionalAliases.reduce(
                    function (count, aliases) {
                        return count + (
                            herbWarningFindHeader(headers, aliases) ? 1 : 0
                        );
                    },
                    0
                );
                const table = getActualTable(root);
                const rows = herbWarningTableRows(table);
                const rootText = normalize(
                    root.innerText || root.textContent
                );
                let score = requiredHits * 8000 +
                    optionalHits * 1200 + rows.length * 400;

                if (rootText.includes(normalize('医嘱查询'))) {
                    score += 3000;
                }

                if (herbWarningFindHeader(headers, ['药品总量', '总量'])) {
                    score += 1800;
                }

                candidates.push({
                    doc: doc,
                    root: root,
                    table: table,
                    rows: rows,
                    headers: headers,
                    score: score
                });
            });
        });

        candidates.sort(function (first, second) {
            return second.score - first.score;
        });

        return candidates[0] || null;
    }

    function herbWarningRowCell(context, row, aliases) {
        if (!context || !row) return null;

        const header = herbWarningFindHeader(context.headers, aliases);

        if (!header) return null;

        const cells = getRowCells(row);
        const covering = cells.filter(function (cell) {
            const rect = cell.getBoundingClientRect();

            return header.center >= rect.left - 3 &&
                header.center <= rect.right + 3;
        }).sort(function (first, second) {
            return first.getBoundingClientRect().width -
                second.getBoundingClientRect().width;
        });

        if (covering[0]) return covering[0];

        const nearest = cells.map(function (cell) {
            const rect = cell.getBoundingClientRect();

            return {
                cell: cell,
                distance: Math.abs(
                    rect.left + rect.width / 2 - header.center
                )
            };
        }).sort(function (first, second) {
            return first.distance - second.distance;
        });

        return nearest[0] ? nearest[0].cell : null;
    }

    function herbWarningRowValue(context, row, aliases) {
        const cell = herbWarningRowCell(context, row, aliases);

        if (!cell) return '';

        const select = findSelectInCell(cell);

        if (select) {
            const option = select.options && select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;

            return normalizePlainText(
                option
                    ? option.textContent || option.value
                    : select.value
            );
        }

        const input = findVisibleInputInCell(cell);

        if (input) {
            return normalizePlainText(
                input.isContentEditable
                    ? input.textContent
                    : input.value
            );
        }

        return normalizePlainText(cell.innerText || cell.textContent);
    }

    function herbWarningReadOrders(context) {
        return context.rows.map(function (row, index) {
            const rowText = normalizePlainText(
                row.innerText || row.textContent
            );
            let rowColor = '';

            try {
                rowColor = String(
                    row.ownerDocument.defaultView
                        .getComputedStyle(row).color || ''
                );
            }
            catch (error) {
                rowColor = '';
            }

            const order = {
                index: index,
                row: row,
                rowText: rowText,
                category: herbWarningRowValue(
                    context,
                    row,
                    ['医嘱类别', '长临', '长临嘱']
                ),
                orderType: herbWarningRowValue(
                    context,
                    row,
                    ['医嘱类型', '类型']
                ),
                startTimeText: herbWarningRowValue(
                    context,
                    row,
                    ['开始时间', '开立时间']
                ),
                doctor: herbWarningRowValue(
                    context,
                    row,
                    ['医生', '开立医生']
                ),
                name: herbWarningRowValue(
                    context,
                    row,
                    ['医嘱名称', '药品名称', '名称']
                ),
                doseText: herbWarningRowValue(
                    context,
                    row,
                    ['剂量', '每次剂量']
                ),
                route: herbWarningRowValue(
                    context,
                    row,
                    ['用法', '给药途径']
                ),
                frequency: herbWarningRowValue(
                    context,
                    row,
                    ['频次', '频率']
                ),
                stopTimeText: herbWarningRowValue(
                    context,
                    row,
                    ['停止时间']
                ),
                totalText: herbWarningRowValue(
                    context,
                    row,
                    ['药品总量', '总量', '数量']
                ),
                invalid: /作废|取消|已撤销|撤销医嘱|退药/.test(rowText) ||
                    /rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/i.test(rowColor)
            };

            order.startTime = herbWarningParseDate(order.startTimeText);
            order.stopTime = herbWarningParseDate(order.stopTimeText);
            order.isHerb = /中草药|中药饮片|中药/.test(order.orderType) ||
                (
                    /代煎|自煎|冲服/.test(order.route) &&
                    Boolean(order.doseText && order.totalText)
                );

            return order;
        }).filter(function (order) {
            return Boolean(order.name) && !order.invalid;
        });
    }

    function herbWarningGroupKey(order) {
        const timeKey = order.startTime
            ? String(order.startTime.getTime())
            : normalize(order.startTimeText);

        return [
            timeKey || 'row-' + order.index,
            normalize(order.doctor),
            normalize(order.route)
        ].join('||');
    }

    function herbWarningApplyRouteTimelineCompensation(results) {
        if (!herbWarningRouteTimelineCompensationEnabled()) {
            return results;
        }

        const routeGroups = new Map();

        (results || []).forEach(function (item) {
            const routeKey = normalize(item && item.route);

            /*
             * 必须有明确用法和可比较的开立时间才参与覆盖补偿。
             * 用法为空时不作猜测，避免把不同处方错误合并。
             */
            if (!routeKey || !item.startTime) {
                return;
            }

            if (!routeGroups.has(routeKey)) {
                routeGroups.set(routeKey, []);
            }

            routeGroups.get(routeKey).push(item);
        });

        routeGroups.forEach(function (items) {
            if (!Array.isArray(items) || items.length < 2) {
                return;
            }

            const ordered = items.slice().sort(function (first, second) {
                return first.startTime.getTime() - second.startTime.getTime();
            });

            ordered.forEach(function (item, index) {
                let nextPrescription = null;

                for (let nextIndex = index + 1; nextIndex < ordered.length; nextIndex += 1) {
                    if (
                        ordered[nextIndex].startTime.getTime() >
                        item.startTime.getTime()
                    ) {
                        nextPrescription = ordered[nextIndex];
                        break;
                    }
                }

                /*
                 * 同一时刻存在多张同用法处方时，无法确认谁覆盖谁；
                 * 只有检测到“严格更晚”的同用法处方才判定前方已用尽。
                 */
                if (!nextPrescription) {
                    return;
                }

                item.timelineCovered = true;
                item.coveredByStartTime = nextPrescription.startTime;
                item.coveredByStartTimeText = nextPrescription.startTimeText;
                item.coveredByRoute = nextPrescription.route;
                item.originalRemainingDays = item.remainingDays;
                item.originalExhaustDate = item.exhaustDate;

                /*
                 * 有后续同用法处方已经开立，即把较早处方视作在该时点前
                 * 已经使用完毕/被后续处方接续。它仍保留在扫描结果表中，
                 * 不再作为“当前需要补开”的报警对象，但继续在医嘱名称处
                 * 渲染“后方已开立”状态标记，便于区分历史方与当前最新方。
                 */
                item.remainingDays = 0;
                item.exhaustDate = new Date(
                    nextPrescription.startTime.getTime()
                );
                item.status = 'covered';
                item.statusText = '同用法后方已开立，判定已用尽';
                item.alert = false;
                item.shouldRender = true;

                item.notes.push(
                    '已启用“相同用法中药时间线覆盖补偿”：' +
                    '检测到同用法“' + (item.route || '-') + '”在' +
                    herbWarningFormatDateTime(nextPrescription.startTime) +
                    '又开立后续中药处方，因此本方按已用尽处理；' +
                    '不再参与当前报警，但在医嘱名称处显示“后方已开立”状态标记'
                );
            });
        });

        return results;
    }

    function herbWarningAnalyzeOrders(
        orders,
        alertThresholdDays,
        renderThresholdDays
    ) {
        const alertThreshold = herbWarningThresholdValue(
            alertThresholdDays,
            2
        );
        const renderThreshold = herbWarningThresholdValue(
            renderThresholdDays,
            5
        );
        const now = new Date();
        const groups = new Map();

        orders.filter(function (order) {
            return order.isHerb &&
                order.startTime &&
                order.startTime.getTime() <= now.getTime();
        }).forEach(function (order) {
            const key = herbWarningGroupKey(order);

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key).push(order);
        });

        const results = Array.from(groups.entries()).map(function (entry, index) {
            const key = entry[0];
            const groupOrders = entry[1].slice().sort(function (first, second) {
                return first.index - second.index;
            });
            const notes = [];
            const doseCounts = [];
            const invalidOrders = [];

            groupOrders.forEach(function (order) {
                const dose = herbWarningParseMass(order.doseText);
                const total = herbWarningParseMass(order.totalText);

                if (!dose || !total || dose.grams <= 0 || total.grams <= 0) {
                    invalidOrders.push(order);
                    return;
                }

                const rawCount = total.grams / dose.grams;

                if (!Number.isFinite(rawCount) || rawCount <= 0) {
                    invalidOrders.push(order);
                    return;
                }

                const nearestInteger = Math.round(rawCount);
                const normalizedCount = Math.abs(rawCount - nearestInteger) <= 0.05
                    ? nearestInteger
                    : herbWarningRound(rawCount, 2);

                doseCounts.push({
                    order: order,
                    count: normalizedCount,
                    rawCount: rawCount
                });
            });

            const values = doseCounts.map(function (item) {
                return Number(item.count);
            }).filter(Number.isFinite).sort(function (a, b) {
                return a - b;
            });
            const minimumDoses = values.length ? values[0] : null;
            const maximumDoses = values.length
                ? values[values.length - 1]
                : null;
            const inconsistent = values.length > 1 &&
                Math.abs(maximumDoses - minimumDoses) > 0.15;
            const startTime = groupOrders[0].startTime;
            const elapsedDays = startTime
                ? Math.max(
                    0,
                    (now.getTime() - startTime.getTime()) / 86400000
                )
                : null;
            const remainingDays = minimumDoses !== null && elapsedDays !== null
                ? minimumDoses - elapsedDays
                : null;
            const exhaustDate = startTime && minimumDoses !== null
                ? new Date(
                    startTime.getTime() + minimumDoses * 86400000
                )
                : null;
            let status = 'unknown';
            let statusText = '无法估算';

            if (remainingDays !== null) {
                if (remainingDays <= 0) {
                    status = 'overdue';
                    statusText = '预计已用尽';
                }
                else if (remainingDays <= alertThreshold) {
                    status = 'warning';
                    statusText = '达到报警阈值';
                }
                else if (remainingDays <= renderThreshold) {
                    status = 'soon';
                    statusText = '显示剩余天数';
                }
                else {
                    status = 'normal';
                    statusText = '尚未达到渲染阈值';
                }
            }

            if (inconsistent) {
                notes.push(
                    '同方各味按“总量÷剂量”得到的付数不一致：' +
                    minimumDoses + '～' + maximumDoses +
                    '付；当前按最少付数保守估算'
                );

                if (status === 'normal') {
                    status = 'review';
                    statusText = '付数不一致';
                }
                else {
                    statusText += '，且付数不一致';
                }
            }

            if (invalidOrders.length) {
                notes.push(
                    invalidOrders.length +
                    '味未能识别有效的剂量或药品总量，未参与付数计算'
                );
            }

            if (!values.length) {
                notes.push('未能从任何一味中药计算处方付数');
            }

            const names = Array.from(new Set(
                groupOrders.map(function (order) {
                    return removeLeadingStarPrefix(order.name);
                }).filter(Boolean)
            ));

            return {
                id: 'herb-warning-' + index + '-' + Date.now(),
                key: key,
                startTime: startTime,
                startTimeText: groupOrders[0].startTimeText,
                doctor: groupOrders[0].doctor,
                route: groupOrders[0].route,
                frequency: groupOrders[0].frequency,
                herbCount: groupOrders.length,
                names: names,
                validHerbCount: values.length,
                invalidHerbCount: invalidOrders.length,
                doseCounts: doseCounts,
                minimumDoses: herbWarningRound(minimumDoses, 2),
                maximumDoses: herbWarningRound(maximumDoses, 2),
                inconsistent: inconsistent,
                elapsedDays: herbWarningRound(elapsedDays, 1),
                remainingDays: herbWarningRound(remainingDays, 1),
                exhaustDate: exhaustDate,
                status: status,
                statusText: statusText,
                alert: status === 'warning' || status === 'overdue',
                shouldRender: [
                    'overdue',
                    'warning',
                    'soon',
                    'review',
                    'unknown'
                ].includes(status),
                notes: notes,
                orders: groupOrders,
                firstOrder: groupOrders[0],
                timelineCovered: false,
                coveredByStartTime: null,
                coveredByStartTimeText: '',
                coveredByRoute: '',
                originalRemainingDays: null,
                originalExhaustDate: null
            };
        });

        herbWarningApplyRouteTimelineCompensation(results);

        return results.sort(function (first, second) {
            /* 当前仍有效的处方优先显示，被后续同用法处方覆盖的历史方放后面。 */
            if (Boolean(first.timelineCovered) !== Boolean(second.timelineCovered)) {
                return first.timelineCovered ? 1 : -1;
            }

            const firstRemaining = first.remainingDays === null
                ? Number.POSITIVE_INFINITY
                : first.remainingDays;
            const secondRemaining = second.remainingDays === null
                ? Number.POSITIVE_INFINITY
                : second.remainingDays;

            return firstRemaining - secondRemaining ||
                (second.startTime ? second.startTime.getTime() : 0) -
                (first.startTime ? first.startTime.getTime() : 0);
        });
    }

    function herbWarningPageMeta(context, orderCount) {
        let pageText = '';
        let totalPages = 1;

        try {
            const nearby = context.root.parentElement || context.root;
            pageText = normalizePlainText(
                nearby.innerText || nearby.textContent
            );
            let matched = pageText.match(/共\s*(\d+)\s*页/);

            if (!matched) {
                matched = normalizePlainText(
                    context.doc.body &&
                    (context.doc.body.innerText || context.doc.body.textContent)
                ).match(/共\s*(\d+)\s*页/);
            }

            if (matched) {
                totalPages = Math.max(1, Number(matched[1]) || 1);
            }
        }
        catch (error) {
            totalPages = 1;
        }

        return {
            scannedOrderCount: orderCount,
            totalPages: totalPages,
            pageText: pageText,
            scannedAt: new Date()
        };
    }

    function herbWarningDoseCountText(item) {
        if (!item || item.minimumDoses === null) return '-';

        if (
            item.inconsistent &&
            item.maximumDoses !== null &&
            item.maximumDoses !== item.minimumDoses
        ) {
            return item.minimumDoses + '～' + item.maximumDoses + '付';
        }

        return item.minimumDoses + '付';
    }

    function herbWarningRemainingText(item) {
        if (!item) return '-';

        if (item.timelineCovered) {
            return '0天（后方已开立）';
        }

        if (item.remainingDays === null) return '-';

        if (item.remainingDays <= 0) {
            return '0天（超出' +
                Math.abs(item.remainingDays).toFixed(1) + '天）';
        }

        return item.remainingDays.toFixed(1) + '天';
    }

    function herbWarningOriginalPrescriptionText(item) {
        if (!item || !Array.isArray(item.orders)) return '';

        return item.orders
            .filter(function (order) {
                return order && order.isHerb;
            })
            .slice()
            .sort(function (first, second) {
                return Number(first.index || 0) - Number(second.index || 0);
            })
            .map(function (order) {
                const name = removeLeadingStarPrefix(
                    normalizePlainText(order.name)
                );
                const dose = normalizePlainText(order.doseText);

                if (!name) return '';

                return dose
                    ? name + ' ' + dose
                    : name;
            })
            .filter(Boolean)
            .join('\n');
    }

    function refillHerbWarningPrescription(modal, resultIndex) {
        const item = (state.herbWarningResults || [])[resultIndex];
        const sourceText = modal && modal.querySelector('.herb-source-text');
        const preferStarred = modal && modal.querySelector('.herb-prefer-starred');
        const riskAck = modal && modal.querySelector('.herb-risk-ack');

        if (!item || !sourceText) {
            showStatus('未找到该中草药预警处方或中药录入框。', 'error');
            return;
        }

        const prescriptionText = herbWarningOriginalPrescriptionText(item);

        if (!prescriptionText) {
            showStatus(
                '该处方没有可提取的“药名＋单剂剂量”，请人工核对医嘱查询记录。',
                'warning'
            );
            return;
        }

        const current = String(sourceText.value || '').trim();

        if (
            current &&
            current !== prescriptionText.trim() &&
            !window.confirm(
                '中药录入框已有内容。\n\n确认用预警系统扫描到的原方替换当前内容吗？\n\n' +
                '仅提取每味中药的药名和单剂剂量；剂数、煎法及其他设置保持当前值，请补开前人工核对。'
            )
        ) {
            return;
        }

        sourceText.value = prescriptionText;
        sourceText.dispatchEvent(
            new sourceText.ownerDocument.defaultView.Event(
                'input',
                { bubbles: true }
            )
        );
        GM_setValue(KEYS.draft, prescriptionText);

        state.items = parseHerbText(prescriptionText);
        syncStarPrefixToItems(
            state.items,
            preferStarred ? preferStarred.checked : true
        );
        state.aiAuditIssues = [];
        state.formulaAnalysis = null;
        state.auditIssues = auditFormula(state.items);

        if (riskAck) {
            riskAck.checked = false;
        }

        renderResultTable(modal);
        renderAuditIssues(
            modal,
            '已从预警系统提取原方用于补开，请逐味核对药名、剂量、剂数、煎法及当前患者情况。'
        );
        renderFormulaAnalysis(modal);

        try {
            sourceText.scrollIntoView({
                block: 'center',
                behavior: 'auto'
            });
            sourceText.focus();
        }
        catch (error) {
            // 旧内核滚动参数失败不影响提取结果。
        }

        showStatus(
            '已将该处方原方提取到中药录入框，并完成本地解析：' +
            state.items.length + '味。\n' +
            '剂数、煎法等未自动改动，请根据本次补开需求人工确认后再录入。',
            state.auditIssues.some(function (issue) {
                return issue.severity === 'danger';
            }) ? 'warning' : 'success'
        );
    }

    function renderHerbWarning(modal) {
        const summary = modal.querySelector('.herb-warning-summary');
        const body = modal.querySelector('.herb-warning-result-body');

        if (!summary || !body) return;

        const results = state.herbWarningResults || [];
        const meta = state.herbWarningMeta;

        if (!results.length) {
            if (meta) {
                summary.innerHTML =
                    '<strong>扫描结果：</strong>未发现可计算的中草药处方；' +
                    '读取有效医嘱' + meta.scannedOrderCount + '条；扫描时间' +
                    escapeHtml(herbWarningFormatDateTime(meta.scannedAt));
            }
            else {
                summary.innerHTML =
                    '<span class="herb-warning-empty">尚未扫描当前患者医嘱。</span>';
            }

            body.innerHTML = '';
            return;
        }

        const alertCount = results.filter(function (item) {
            return item.alert;
        }).length;
        const reviewCount = results.filter(function (item) {
            return !item.timelineCovered &&
                (item.inconsistent || item.status === 'unknown');
        }).length;
        const coveredCount = results.filter(function (item) {
            return item.timelineCovered;
        }).length;
        const pageWarning = meta && meta.totalPages > 1
            ? '；当前查询共' + meta.totalPages +
                '页，本次只扫描当前已加载页面，请切换为每页100条或逐页核对'
            : '';

        summary.innerHTML =
            '<strong>扫描结果：</strong>识别中草药处方' + results.length +
            '张；达到报警阈值' + alertCount + '张' +
            (coveredCount
                ? '；同用法时间线覆盖补偿' + coveredCount + '张'
                : '') +
            (reviewCount ? '；需人工复核' + reviewCount + '张' : '') +
            (meta
                ? '；读取有效医嘱' + meta.scannedOrderCount +
                    '条；扫描时间' +
                    escapeHtml(herbWarningFormatDateTime(meta.scannedAt))
                : '') +
            escapeHtml(pageWarning);

        body.innerHTML = results.map(function (item, index) {
            const names = item.names.length
                ? item.names.join('、')
                : '-';
            const notes = item.notes.length
                ? item.notes.join('；')
                : '按同一开立时间处方、每日1付估算';

            return '<tr class="herb-warning-row herb-warning-' +
                escapeHtml(item.status) + '">' +
                '<td>' + (index + 1) + '</td>' +
                '<td>' + escapeHtml(
                    herbWarningFormatDateTime(item.startTime)
                ) + '</td>' +
                '<td>' + escapeHtml(item.doctor || '-') + '</td>' +
                '<td>' + item.herbCount + '味</td>' +
                '<td><strong>' + escapeHtml(
                    herbWarningDoseCountText(item)
                ) + '</strong></td>' +
                '<td>' + (item.elapsedDays === null
                    ? '-'
                    : item.elapsedDays + '天') + '</td>' +
                '<td><strong>' + escapeHtml(
                    herbWarningRemainingText(item)
                ) + '</strong></td>' +
                '<td>' + escapeHtml(
                    herbWarningFormatDate(item.exhaustDate)
                ) + '</td>' +
                '<td>' + escapeHtml(item.route || '-') + '</td>' +
                '<td><span class="herb-warning-status" data-status="' +
                    escapeHtml(item.status) + '">' +
                    escapeHtml(item.statusText) + '</span></td>' +
                '<td class="herb-warning-names" title="' +
                    escapeHtml(names) + '">' + escapeHtml(names) + '</td>' +
                '<td class="herb-warning-notes" title="' +
                    escapeHtml(notes) + '">' + escapeHtml(notes) + '</td>' +
                '<td class="herb-warning-action"><button type="button" class="herb-warning-refill" data-warning-index="' +
                    index + '" title="将该处方的原药名和单剂剂量提取到中药录入框">补开</button></td>' +
                '</tr>';
        }).join('');
    }

    function setHerbWarningCollapsed(modal, collapsed, save) {
        const section = modal.querySelector('.herb-warning-section');
        const toggle = modal.querySelector('.herb-warning-toggle');

        if (!section || !toggle) return;

        section.classList.toggle('collapsed', Boolean(collapsed));
        toggle.textContent = collapsed ? '展开' : '折叠';

        if (save !== false) {
            GM_setValue(KEYS.herbWarningCollapsed, Boolean(collapsed));
        }
    }

    function ensureHerbWarningFrontStyle(doc) {
        if (
            !doc ||
            !doc.head ||
            doc.getElementById(IDS.warningFrontStyle)
        ) {
            return;
        }

        const style = doc.createElement('style');
        style.id = IDS.warningFrontStyle;
        style.textContent = `
.medical-herb-warning-front-cell{
  position:relative!important;
  padding-right:110px!important;
  transition:background-color .15s ease,box-shadow .15s ease;
}
.medical-herb-warning-front-cell::after{
  content:attr(data-medical-herb-warning-label);
  position:absolute;
  right:4px;
  top:50%;
  transform:translateY(-50%);
  z-index:6;
  min-width:80px;
  max-width:104px;
  box-sizing:border-box;
  padding:2px 6px;
  border-radius:9px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  text-align:center;
  font:600 11px/16px "Microsoft YaHei",Arial,sans-serif;
  pointer-events:none;
  box-shadow:0 1px 3px rgba(0,0,0,.16);
}
.medical-herb-warning-front-covered{
  background:#f3f6f8!important;
  box-shadow:inset 4px 0 0 #7b8790!important;
}
.medical-herb-warning-front-covered::after{
  background:#e7ecef;color:#4d5961;border:1px solid #b9c2c8;
}
.medical-herb-warning-front-overdue{
  background:#fff0ef!important;
  box-shadow:inset 4px 0 0 #dc4c40!important;
}
.medical-herb-warning-front-overdue::after{
  background:#dc4c40;color:#fff;
}
.medical-herb-warning-front-warning{
  background:#fff8e8!important;
  box-shadow:inset 4px 0 0 #d97706!important;
}
.medical-herb-warning-front-warning::after{
  background:#d97706;color:#fff;
}
.medical-herb-warning-front-soon{
  background:#fffdf0!important;
  box-shadow:inset 4px 0 0 #d6a700!important;
}
.medical-herb-warning-front-soon::after{
  background:#fff1a8;color:#795b00;border:1px solid #e3c44d;
}
.medical-herb-warning-front-review{
  background:#fff7ed!important;
  box-shadow:inset 4px 0 0 #ea580c!important;
}
.medical-herb-warning-front-review::after{
  background:#ffedd5;color:#9a3412;border:1px solid #fdba74;
}
.medical-herb-warning-front-unknown{
  background:#f5f7f8!important;
  box-shadow:inset 4px 0 0 #8a949b!important;
}
.medical-herb-warning-front-unknown::after{
  background:#69747b;color:#fff;
}
`;
        doc.head.appendChild(style);
    }

    function herbWarningRememberRenderedCell(cell) {
        if (!cell) return;

        if (!(state.herbWarningRenderedCells instanceof Set)) {
            state.herbWarningRenderedCells = new Set();
        }

        state.herbWarningRenderedCells.add(cell);
    }

    function herbWarningRestoreFrontCell(cell) {
        if (!cell) return;

        const originalTitle = cell.getAttribute(
            'data-medical-herb-warning-original-title'
        );

        if (originalTitle === null || originalTitle === '__NONE__') {
            cell.removeAttribute('title');
        }
        else {
            cell.setAttribute('title', originalTitle);
        }

        cell.classList.remove(
            'medical-herb-warning-front-cell',
            'medical-herb-warning-front-covered',
            'medical-herb-warning-front-overdue',
            'medical-herb-warning-front-warning',
            'medical-herb-warning-front-soon',
            'medical-herb-warning-front-review',
            'medical-herb-warning-front-unknown'
        );
        cell.removeAttribute('data-medical-herb-warning-label');
        cell.removeAttribute('data-medical-herb-warning-original-title');
    }

    /* 正常重绘只清理上一次实际标记过的单元格，避免全页DOM扫描。 */
    function clearHerbWarningFrontRender(fullSweep) {
        const cells = new Set();

        if (state.herbWarningRenderedCells instanceof Set) {
            state.herbWarningRenderedCells.forEach(function (cell) {
                if (cell) cells.add(cell);
            });
        }

        if (fullSweep) {
            getAllDocuments().forEach(function (doc) {
                Array.from(
                    doc.querySelectorAll('.medical-herb-warning-front-cell')
                ).forEach(function (cell) {
                    cells.add(cell);
                });
            });
        }

        cells.forEach(herbWarningRestoreFrontCell);
        state.herbWarningRenderedCells = new Set();
    }

    function herbWarningFrontLabel(item) {
        if (!item) return '';

        if (item.status === 'covered') {
            return '后方已开立';
        }

        if (item.status === 'overdue') {
            return '中药预计已用尽';
        }

        if (item.status === 'unknown') {
            return '中药付数无法估算';
        }

        if (item.status === 'review') {
            return '中药付数不一致';
        }

        if (item.remainingDays === null) return '';

        return '中药剩' + herbWarningRound(item.remainingDays, 1) + '天';
    }

    function herbWarningFrontTitle(item) {
        if (!item) return '';

        return [
            '中草药处方预警：' + item.statusText,
            '开立时间：' + herbWarningFormatDateTime(item.startTime),
            '方内药味：' + item.herbCount + '味',
            '估算付数：' + herbWarningDoseCountText(item),
            item.elapsedDays === null
                ? '已使用天数：无法估算'
                : '已使用：' + item.elapsedDays + '天',
            '预计剩余：' + herbWarningRemainingText(item),
            item.exhaustDate
                ? '预计用尽：' + herbWarningFormatDate(item.exhaustDate)
                : '',
            item.timelineCovered
                ? '时间线覆盖补偿：同用法后续处方于' +
                    herbWarningFormatDateTime(item.coveredByStartTime) +
                    '开立，本方按已用尽处理'
                : '',
            item.inconsistent
                ? '同方各味付数不一致，已按最少付数保守估算'
                : '',
            '仅按当前可见医嘱、每日1付估算，请核对实际服药、停药、补方和未显示记录'
        ].filter(Boolean).join('；');
    }

    function herbWarningOrderMatchesResult(order, result) {
        if (!order || !result || !result.firstOrder || !order.isHerb) {
            return false;
        }

        if (order.startTime && result.startTime) {
            if (
                Math.abs(
                    order.startTime.getTime() - result.startTime.getTime()
                ) > 2000
            ) {
                return false;
            }
        }
        else if (
            normalize(order.startTimeText) !==
            normalize(result.startTimeText)
        ) {
            return false;
        }

        if (
            order.doctor && result.doctor &&
            normalize(order.doctor) !== normalize(result.doctor)
        ) {
            return false;
        }

        if (
            order.route && result.route &&
            normalize(order.route) !== normalize(result.route)
        ) {
            return false;
        }

        return true;
    }

    function herbWarningContextUsable(context) {
        return Boolean(
            context &&
            context.root && context.root.isConnected &&
            context.table && context.table.isConnected &&
            context.doc
        );
    }

    function herbWarningRefreshCachedContext(context) {
        if (!herbWarningContextUsable(context)) return null;

        context.rows = herbWarningTableRows(context.table);

        if (
            !Array.isArray(context.headers) ||
            !context.headers.length ||
            context.headers.some(function (item) {
                return !item.element || !item.element.isConnected;
            })
        ) {
            context.headers = herbWarningHeaderMap(context.root);
        }

        return context;
    }

    function renderHerbWarningFrontNow() {
        clearHerbWarningFrontRender(false);

        if (!herbWarningFrontRenderEnabled()) return;

        const results = (state.herbWarningResults || []).filter(function (item) {
            return item.shouldRender;
        });

        if (!results.length) return;

        const context = herbWarningRefreshCachedContext(
            state.herbWarningContext
        );

        if (!context) {
            state.herbWarningFrontDirty = true;
            scheduleHerbWarningAutoScan(120);
            return;
        }

        ensureHerbWarningFrontStyle(context.doc);

        const firstOnly = herbWarningFirstOnlyEnabled();
        let staleRowFound = false;

        /*
         * 分析结果已保存每张处方的orders及其真实row引用。直接使用这些行
         * 渲染，不再重新读取整张医嘱表并按处方逐行匹配。
         */
        results.forEach(function (result) {
            const label = herbWarningFrontLabel(result);
            if (!label) return;

            const sourceOrders = Array.isArray(result.orders)
                ? result.orders
                : [];
            const ordersToRender = firstOnly
                ? sourceOrders.slice(0, 1)
                : sourceOrders;

            ordersToRender.forEach(function (order) {
                const row = order && order.row;

                if (!row || !row.isConnected) {
                    staleRowFound = true;
                    return;
                }

                const cell = herbWarningRowCell(
                    context,
                    row,
                    ['医嘱名称', '药品名称', '名称']
                );

                if (!cell) {
                    staleRowFound = true;
                    return;
                }

                const oldTitle = cell.hasAttribute('title')
                    ? cell.getAttribute('title')
                    : '__NONE__';

                cell.setAttribute(
                    'data-medical-herb-warning-original-title',
                    oldTitle
                );
                cell.setAttribute(
                    'data-medical-herb-warning-label',
                    label
                );
                cell.setAttribute('title', herbWarningFrontTitle(result));
                cell.classList.add(
                    'medical-herb-warning-front-cell',
                    'medical-herb-warning-front-' + result.status
                );
                herbWarningRememberRenderedCell(cell);
            });
        });

        if (staleRowFound) {
            state.herbWarningFrontDirty = true;
            scheduleHerbWarningAutoScan(700);
        }
    }

    function scheduleHerbWarningFrontRender(delay) {
        clearTimeout(state.herbWarningFrontRenderTimer);

        state.herbWarningFrontRenderTimer = window.setTimeout(function () {
            state.herbWarningFrontRenderTimer = null;

            if (document.hidden) return;
            renderHerbWarningFrontNow();
        }, Math.max(0, Number(delay) || 0));
    }

    function herbWarningFrontContextSignature(context) {
        const refreshed = herbWarningRefreshCachedContext(context);
        if (!refreshed) return '';

        const raw = refreshed.rows.map(function (row) {
            return normalize(row.innerText || row.textContent);
        }).join('|') + '|' +
            herbWarningRenderThresholdDays() + '|' +
            herbWarningAlertThresholdDays();
        let hash = 5381;

        for (let index = 0; index < raw.length; index += 1) {
            hash = ((hash << 5) + hash) ^ raw.charCodeAt(index);
        }

        return [
            String(
                refreshed.doc.location && refreshed.doc.location.href || ''
            ),
            refreshed.rows.length,
            hash >>> 0
        ].join('|');
    }

    function disconnectHerbWarningContextObserver() {
        if (state.herbWarningContextObserver) {
            try {
                state.herbWarningContextObserver.disconnect();
            }
            catch (error) {
                // 忽略旧页面销毁后的断开异常。
            }
        }

        state.herbWarningContextObserver = null;
        state.herbWarningObservedRoot = null;
    }

    function scheduleHerbWarningAutoScan(delay) {
        clearTimeout(state.herbWarningAutoScanTimer);

        state.herbWarningAutoScanTimer = window.setTimeout(function () {
            state.herbWarningAutoScanTimer = null;

            if (
                document.hidden ||
                !herbWarningFrontRenderEnabled() ||
                state.running ||
                state.herbWarningScanBusy
            ) {
                return;
            }

            const context = herbWarningContextUsable(
                state.herbWarningContext
            )
                ? state.herbWarningContext
                : herbWarningFindQueryContext();

            if (!context) {
                state.herbWarningContext = null;
                state.herbWarningFrontSignature = '';
                clearHerbWarningFrontRender(false);
                return;
            }

            state.herbWarningContext = context;
            bindHerbWarningContextObserver(context);

            const signature = herbWarningFrontContextSignature(context);

            if (
                state.herbWarningFrontDirty ||
                signature !== state.herbWarningFrontSignature
            ) {
                scanHerbWarnings(createModal(), true);
            }
        }, Math.max(120, Number(delay) || 0));
    }

    function bindHerbWarningContextObserver(context) {
        if (!herbWarningContextUsable(context)) return;

        if (
            state.herbWarningObservedRoot === context.root &&
            state.herbWarningContextObserver
        ) {
            return;
        }

        disconnectHerbWarningContextObserver();

        const Observer = context.doc.defaultView.MutationObserver ||
            window.MutationObserver;

        if (!Observer) return;

        const observer = new Observer(function (mutations) {
            if (
                document.hidden ||
                !herbWarningFrontRenderEnabled() ||
                state.running ||
                state.herbWarningScanBusy
            ) {
                return;
            }

            const relevant = mutations.some(function (mutation) {
                return mutation.type === 'childList' ||
                    mutation.type === 'characterData';
            });

            if (!relevant) return;

            state.herbWarningFrontDirty = true;
            scheduleHerbWarningAutoScan(900);
        });

        observer.observe(context.root, {
            childList: true,
            characterData: true,
            subtree: true,
            attributes: false
        });

        state.herbWarningContextObserver = observer;
        state.herbWarningObservedRoot = context.root;
    }

    function startHerbWarningFrontWatcher() {
        if (state.herbWarningFrontWatcherTimer) return;

        if (!window.__medicalHerbWarningVisibilityBoundV1189) {
            window.__medicalHerbWarningVisibilityBoundV1189 = true;
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) return;

                /*
                 * v1.18.9：单纯从其他浏览器标签页切回HIS不再主动扫描。
                 * 仅把缓存标记设为待刷新，并恢复已有结果的前端渲染。
                 * 若HIS在后台期间确实替换了医嘱表，渲染器/12秒低频兜底
                 * 仍可在需要时静默补扫，但不会因为“刚切回来”弹窗打扰。
                 */
                state.herbWarningForegroundQuietUntil =
                    Date.now() + 14000;

                if (herbWarningFrontRenderEnabled()) {
                    state.herbWarningFrontDirty = true;

                    if (state.herbWarningResults.length) {
                        scheduleHerbWarningFrontRender(120);
                    }
                }
            });
        }

        /* 12秒仅作兜底；常规变化由表格MutationObserver防抖触发。 */
        state.herbWarningFrontWatcherTimer = window.setInterval(function () {
            if (document.hidden) return;

            if (!herbWarningFrontRenderEnabled()) {
                state.herbWarningFrontSignature = '';
                state.herbWarningFrontDirty = true;
                state.herbWarningContext = null;
                disconnectHerbWarningContextObserver();

                if (
                    state.herbWarningRenderedCells instanceof Set &&
                    state.herbWarningRenderedCells.size
                ) {
                    clearHerbWarningFrontRender(false);
                }
                return;
            }

            if (state.running || state.herbWarningScanBusy) return;

            let context = herbWarningContextUsable(
                state.herbWarningContext
            )
                ? state.herbWarningContext
                : null;

            if (!context) {
                context = herbWarningFindQueryContext();
                state.herbWarningContext = context || null;
                state.herbWarningFrontDirty = true;
            }

            if (!context) {
                state.herbWarningFrontSignature = '';
                clearHerbWarningFrontRender(false);
                disconnectHerbWarningContextObserver();
                return;
            }

            bindHerbWarningContextObserver(context);

            const signature = herbWarningFrontContextSignature(context);

            if (signature !== state.herbWarningFrontSignature) {
                state.herbWarningFrontDirty = true;
                scheduleHerbWarningAutoScan(200);
            }
        }, 12000);
    }


    /*
     * 悬浮框管理器共享的“预警扫描右下角气泡”显示设置。
     * 默认开启；仅抑制预警扫描自身的showStatus提示，不影响扫描、
     * 前端标记、结果列表，也不影响本脚本其他业务状态提示。
     */
    const SUITE_WARNING_TOAST_STORAGE_KEY =
        'medicalUserscriptWarningScanToastSettingsV1';

    const SUITE_WARNING_TOAST_EVENT =
        'medical-userscript-warning-scan-toast';

    function suiteWarningScanToastSettings() {
        try {
            return JSON.parse(
                localStorage.getItem(
                    SUITE_WARNING_TOAST_STORAGE_KEY
                ) || '{}'
            ) || {};
        }
        catch (error) {
            return {};
        }
    }

    function suiteWarningScanToastEnabled(kind) {
        return suiteWarningScanToastSettings()[kind] !== false;
    }

    function suiteWarningScanNotify(kind, message, type) {
        const settings = suiteWarningScanToastSettings();

        if (settings[kind] === false) {
            return false;
        }

        if (settings.merge === true) {
            try {
                const event = new CustomEvent(
                    SUITE_WARNING_TOAST_EVENT,
                    {
                        bubbles: false,
                        cancelable: true,
                        detail: {
                            kind: kind,
                            message: String(message || ''),
                            type: type || 'normal',
                            time: Date.now()
                        }
                    }
                );

                /*
                 * 管理器开启合并模式时会preventDefault()并统一显示；
                 * 若管理器未加载或没有接管，则回退到本脚本原showStatus。
                 */
                if (document.dispatchEvent(event) === false) {
                    return true;
                }
            }
            catch (error) {
                // 旧内核CustomEvent失败时直接回退独立气泡。
            }
        }

        showStatus(message, type || 'normal');
        return true;
    }

    async function scanHerbWarnings(modal, silent) {
        /*
         * 多个开关或页面事件可能在短时间内同时请求静默扫描。
         * 若2秒内已完成扫描且表格未被标记为变化，直接复用结果，
         * 避免自动扫描与前端渲染同时开启时发生重复全表解析。
         */
        if (
            silent &&
            !state.herbWarningFrontDirty &&
            Date.now() - Number(state.herbWarningLastScanAt || 0) < 2000
        ) {
            scheduleHerbWarningFrontRender(30);
            return;
        }

        if (state.running || state.herbWarningScanBusy) {
            if (!silent) {
                suiteWarningScanNotify(
                    'herb',
                    '当前已有任务正在执行，请稍后再扫描中草药预警。',
                    'warning'
                );
            }
            return;
        }

        const scanButton = modal.querySelector('.herb-warning-scan');
        const renderInput = modal.querySelector(
            '.herb-warning-render-threshold'
        );
        const alertInput = modal.querySelector(
            '.herb-warning-alert-threshold'
        );
        const renderThreshold = herbWarningThresholdValue(
            renderInput
                ? renderInput.value
                : herbWarningRenderThresholdDays(),
            5
        );
        const alertThreshold = herbWarningThresholdValue(
            alertInput
                ? alertInput.value
                : herbWarningAlertThresholdDays(),
            2
        );

        state.herbWarningScanBusy = true;

        if (scanButton) {
            scanButton.disabled = true;
            scanButton.textContent = '正在扫描……';
        }

        try {
            const context = herbWarningFindQueryContext();

            if (!context) {
                throw new Error(
                    '未识别到“医嘱查询”列表。请先进入当前患者的医嘱查询页，选择“全部医嘱”，并保证药品总量列已经加载。'
                );
            }

            state.herbWarningContext = context;
            bindHerbWarningContextObserver(context);

            const orders = herbWarningReadOrders(context);

            if (!orders.length) {
                throw new Error('医嘱查询列表中未读取到有效医嘱。');
            }

            const herbOrders = orders.filter(function (order) {
                return order.isHerb;
            });

            state.herbWarningResults = herbWarningAnalyzeOrders(
                herbOrders,
                alertThreshold,
                renderThreshold
            );
            state.herbWarningMeta = herbWarningPageMeta(
                context,
                orders.length
            );
            state.herbWarningFrontSignature =
                herbWarningFrontContextSignature(context);
            state.herbWarningFrontDirty = false;
            state.herbWarningLastScanAt = Date.now();
            renderHerbWarning(modal);
            setHerbWarningCollapsed(modal, false, true);

            if (herbWarningFrontRenderEnabled()) {
                scheduleHerbWarningFrontRender(60);
            }
            else {
                clearHerbWarningFrontRender(false);
            }

            const alertCount = state.herbWarningResults.filter(
                function (item) {
                    return item.alert;
                }
            ).length;
            const reviewCount = state.herbWarningResults.filter(
                function (item) {
                    return !item.timelineCovered &&
                        (item.inconsistent || item.status === 'unknown');
                }
            ).length;
            const coveredCount = state.herbWarningResults.filter(
                function (item) {
                    return item.timelineCovered;
                }
            ).length;

            const suppressForegroundAutoToast =
                silent &&
                Date.now() < Number(
                    state.herbWarningForegroundQuietUntil || 0
                );

            if (
                (!silent || alertCount || reviewCount) &&
                !suppressForegroundAutoToast
            ) {
                suiteWarningScanNotify(
                    'herb',
                    '中草药预警扫描完成：识别处方' +
                    state.herbWarningResults.length + '张；' +
                    (alertCount
                        ? alertCount + '张达到报警阈值。'
                        : '当前没有处方达到报警阈值。') +
                    (coveredCount
                        ? '\n时间线覆盖补偿：' + coveredCount +
                            '张较早同用法处方按已用尽处理。'
                        : '') +
                    (reviewCount
                        ? '\n另有' + reviewCount +
                            '张存在付数不一致或无法估算，请人工复核。'
                        : '') +
                    '\n结果按药品总量÷单剂剂量、每日1付估算。',
                    alertCount || reviewCount ? 'warning' : 'success'
                );
            }
        }
        catch (error) {
            state.herbWarningResults = [];
            state.herbWarningMeta = null;
            renderHerbWarning(modal);
            clearHerbWarningFrontRender(false);

            if (!silent) {
                suiteWarningScanNotify(
                    'herb',
                    error.message,
                    'error'
                );
            }
            else {
                console.warn('[中草药预警] 自动扫描失败：', error);
            }
        }
        finally {
            state.herbWarningScanBusy = false;

            if (scanButton) {
                scanButton.disabled = false;
                scanButton.textContent = '扫描当前所有医嘱';
            }
        }
    }

    /******************************************************************
     * 十三、弹窗样式
     ******************************************************************/

    function ensureStyle() {
        if (document.getElementById(IDS.style)) {
            return;
        }

        const style = document.createElement('style');

        style.id = IDS.style;
        style.textContent = `
#${IDS.modal}{
position:fixed;inset:0;z-index:2147483647;display:none;
font-family:"Microsoft YaHei",Arial,sans-serif;color:#333;
}
#${IDS.modal}.show{display:block;}
#${IDS.modal} .herb-mask{position:absolute;inset:0;background:rgba(0,0,0,.42);}
#${IDS.modal} .herb-dialog{
position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
width:1260px;max-width:calc(100vw - 24px);max-height:calc(100vh - 28px);
background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 12px 38px rgba(0,0,0,.35);
}
#${IDS.modal} .herb-header{
display:flex;align-items:center;justify-content:space-between;padding:13px 17px;
background:${MODAL_HEADER_COLOR};color:#fff;font-size:16px;font-weight:bold;
}
#${IDS.modal} .herb-close{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer;}
#${IDS.modal} .herb-body{padding:14px 16px;max-height:calc(100vh - 142px);overflow:auto;}
#${IDS.modal} .herb-grid{
display:grid;grid-template-columns:1.4fr .8fr .65fr .8fr;gap:10px;margin-bottom:10px;
}
#${IDS.modal} label{display:flex;flex-direction:column;gap:5px;font-size:13px;}
#${IDS.modal} input,#${IDS.modal} textarea,#${IDS.modal} select{
box-sizing:border-box;border:1px solid #cfd8dc;border-radius:4px;font-size:13px;background:#fff;color:#333;
}
#${IDS.modal} input,#${IDS.modal} select{height:32px;padding:4px 7px;}
#${IDS.modal} textarea{width:100%;min-height:150px;padding:8px;resize:vertical;line-height:1.65;}
#${IDS.modal} .herb-syndrome-text{min-height:64px;}
#${IDS.modal} .herb-tip{
padding:9px 11px;margin:10px 0;background:#fff8e8;color:#795b00;border-radius:5px;
font-size:12px;line-height:1.65;white-space:pre-line;
}
#${IDS.modal} .herb-options{
display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:8px 10px;margin:8px 0;
background:#f5fafc;border:1px solid #d9edf4;border-radius:5px;font-size:12px;
}
#${IDS.modal} .herb-options label{display:flex;flex-direction:row;align-items:center;gap:6px;}
#${IDS.modal} .herb-options input[type="checkbox"]{width:16px;height:16px;}
#${IDS.modal} .herb-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
#${IDS.modal} .herb-actions button,#${IDS.modal} .herb-footer button{
height:34px;padding:0 14px;border-radius:4px;border:1px solid #159bd3;
background:#159bd3;color:#fff;cursor:pointer;
}
#${IDS.modal} .herb-actions button.secondary,#${IDS.modal} .herb-footer button.secondary{
background:#fff;color:#159bd3;
}
#${IDS.modal} .herb-actions button.warning{background:#b7791f;border-color:#b7791f;}
#${IDS.modal} .herb-actions button.danger{background:#dc4c40;border-color:#dc4c40;}
#${IDS.modal} button:disabled{opacity:.55;cursor:not-allowed;}
#${IDS.modal} .herb-audit-box{
display:none;margin:10px 0;border:1px solid #ddd;border-radius:5px;overflow:hidden;
}
#${IDS.modal} .herb-audit-title{padding:8px 11px;background:#f2f8fb;font-weight:bold;font-size:13px;}
#${IDS.modal} .herb-audit-content{padding:8px 10px;max-height:180px;overflow:auto;}
#${IDS.modal} .herb-audit-count{font-weight:bold;margin-bottom:6px;}
#${IDS.modal} .herb-ai-summary{padding:7px 8px;margin-bottom:6px;background:#eef7ff;border-radius:4px;}
#${IDS.modal} .herb-audit-item{padding:7px 8px;margin:5px 0;border-radius:4px;line-height:1.55;font-size:12px;}
#${IDS.modal} .herb-audit-item.danger{background:#fff0ef;color:#b42318;border-left:4px solid #dc4c40;}
#${IDS.modal} .herb-audit-item.warning{background:#fff8e8;color:#795b00;border-left:4px solid #d69e2e;}
#${IDS.modal} .herb-audit-item.info{background:#eef7ff;color:#1f5f8b;border-left:4px solid #159bd3;}
#${IDS.modal} .herb-audit-tag{display:inline-block;margin-right:7px;padding:1px 5px;border-radius:3px;background:rgba(0,0,0,.08);font-weight:bold;}
#${IDS.modal} .herb-tcm-section{margin:10px 0;border:1px solid #9bcfe3;border-radius:6px;overflow:hidden;background:#fff;}
#${IDS.modal} .herb-tcm-section-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;background:#eaf7fc;font-size:13px;font-weight:bold;}
#${IDS.modal} .herb-tcm-section-tools{display:flex;gap:6px;flex:none;}
#${IDS.modal} .herb-tcm-section-tools button{height:27px;padding:0 10px;border:1px solid #159bd3;border-radius:4px;background:#fff;color:#117fac;cursor:pointer;font-size:12px;}
#${IDS.modal} .herb-tcm-section.collapsed .herb-tcm-body{display:none;}
#${IDS.modal} .herb-tcm-body{padding:10px 11px;}
#${IDS.modal} .herb-tcm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
#${IDS.modal} .herb-tcm-grid textarea{min-height:120px;}
#${IDS.modal} .herb-tcm-merged-input{display:none;}
#${IDS.modal} .herb-tcm-merged-input textarea{height:120px;min-height:120px;}
#${IDS.modal} .herb-tcm-section.merged-input-mode .herb-tcm-split-inputs{display:none;}
#${IDS.modal} .herb-tcm-section.merged-input-mode .herb-tcm-merged-input{display:block;}
#${IDS.modal} .herb-tcm-mode-note{margin-top:6px;padding:6px 8px;background:#f5fafc;border:1px dashed #b9d9e7;border-radius:4px;color:#4b6572;font-size:12px;line-height:1.55;}
#${IDS.modal} .herb-tcm-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
#${IDS.modal} .herb-tcm-actions button{height:32px;padding:0 13px;border:1px solid #159bd3;border-radius:4px;background:#159bd3;color:#fff;cursor:pointer;}
#${IDS.modal} .herb-tcm-actions button.secondary{background:#fff;color:#159bd3;}
#${IDS.modal} .herb-tcm-actions button:disabled{opacity:.5;cursor:not-allowed;}
#${IDS.modal} .herb-tcm-result{max-height:480px;overflow:auto;border:1px solid #dce9ef;border-radius:5px;padding:9px;background:#fcfeff;font-size:12px;line-height:1.65;}
#${IDS.modal} .herb-tcm-empty,#${IDS.modal} .herb-tcm-muted{color:#6b7280;}
#${IDS.modal} .herb-tcm-summary{padding:8px 9px;background:#f1f9fc;border-left:4px solid #159bd3;border-radius:4px;}
#${IDS.modal} .herb-tcm-formula-head{padding:8px 2px 6px;font-size:13px;}
#${IDS.modal} .herb-tcm-table-wrap{overflow:auto;border:1px solid #e1e7ea;border-radius:4px;}
#${IDS.modal} .herb-tcm-table{min-width:920px;table-layout:fixed;}
#${IDS.modal} .herb-tcm-table th,#${IDS.modal} .herb-tcm-table td{padding:5px;font-size:12px;}
#${IDS.modal} .herb-tcm-table th:nth-child(1){width:36px;}
#${IDS.modal} .herb-tcm-table th:nth-child(2){width:105px;}
#${IDS.modal} .herb-tcm-table th:nth-child(3){width:60px;}
#${IDS.modal} .herb-tcm-table th:nth-child(4){width:105px;}
#${IDS.modal} .herb-tcm-table th:nth-child(5){width:75px;}
#${IDS.modal} .herb-tcm-left{text-align:left!important;}
#${IDS.modal} .herb-tcm-detail{padding:7px 3px;border-bottom:1px dashed #e4eaed;}
#${IDS.modal} .herb-tcm-detail ul{margin:4px 0 0 18px;padding:0;}
#${IDS.modal} .herb-tcm-detail.warning{background:#fffaf0;color:#795b00;}
#${IDS.modal} .herb-tcm-audit{margin-top:8px;padding:8px;background:#fff8e8;border-radius:4px;}
#${IDS.modal} .herb-tcm-audit.safe{margin-top:8px;padding:8px;background:#ecfdf3;color:#166534;border-radius:4px;}
#${IDS.modal} .herb-tcm-audit-item{margin-top:5px;padding:5px 7px;border-radius:3px;}
#${IDS.modal} .herb-tcm-audit-item.danger{background:#fff0ef;color:#b42318;}
#${IDS.modal} .herb-tcm-audit-item.warning{background:#fff3d6;color:#795b00;}
#${IDS.modal} .herb-tcm-audit-item.info{background:#eef7ff;color:#1f5f8b;}
#${IDS.modal} .herb-tcm-disclaimer{margin-top:8px;padding:8px;background:#fff0ef;color:#9b2c2c;border-radius:4px;font-weight:bold;}
#${IDS.modal} .herb-formula-box{margin:10px 0;border:1px solid #bfdce9;border-radius:5px;overflow:hidden;background:#fff;}
#${IDS.modal} .herb-formula-title{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;background:#eef8fc;font-weight:bold;font-size:13px;}
#${IDS.modal} .herb-formula-copy{height:27px;padding:0 10px;border:1px solid #159bd3;border-radius:4px;background:#fff;color:#159bd3;cursor:pointer;}
#${IDS.modal} .herb-formula-content{padding:10px 11px;max-height:300px;overflow:auto;font-size:12px;line-height:1.7;}
#${IDS.modal} .herb-formula-empty{color:#6b7280;}
#${IDS.modal} .herb-formula-main{padding:8px 9px;margin-bottom:8px;background:#f4fbfe;border-left:4px solid #159bd3;border-radius:4px;}
#${IDS.modal} .herb-formula-detail{padding:6px 2px;border-bottom:1px dashed #e3e8eb;white-space:pre-wrap;}
#${IDS.modal} .herb-formula-caution{padding:7px 8px;margin-top:8px;background:#fff8e8;color:#795b00;border-radius:4px;white-space:pre-wrap;}
#${IDS.modal} .herb-result-wrap{display:none;overflow:auto;border:1px solid #ddd;border-radius:5px;}
#${IDS.modal} table{width:100%;min-width:1200px;border-collapse:collapse;table-layout:fixed;}
#${IDS.modal} th,#${IDS.modal} td{
border-bottom:1px solid #e6e6e6;border-right:1px solid #eee;padding:5px;
text-align:center;font-size:12px;vertical-align:middle;
}
#${IDS.modal} th{position:sticky;top:0;background:#f2f8fb;z-index:2;}
#${IDS.modal} td input,#${IDS.modal} td select{width:100%;height:29px;font-size:12px;padding:3px 5px;}
#${IDS.modal} th:nth-child(1),#${IDS.modal} td:nth-child(1){width:38px;}
#${IDS.modal} th:nth-child(2),#${IDS.modal} td:nth-child(2){width:38px;}
#${IDS.modal} th:nth-child(3),#${IDS.modal} td:nth-child(3){width:150px;}
#${IDS.modal} th:nth-child(4),#${IDS.modal} td:nth-child(4){width:165px;}
#${IDS.modal} th:nth-child(5),#${IDS.modal} td:nth-child(5){width:75px;}
#${IDS.modal} th:nth-child(6),#${IDS.modal} td:nth-child(6){width:45px;}
#${IDS.modal} th:nth-child(7),#${IDS.modal} td:nth-child(7){width:120px;}
#${IDS.modal} th:nth-child(8),#${IDS.modal} td:nth-child(8){width:240px;}
#${IDS.modal} th:nth-child(9),#${IDS.modal} td:nth-child(9){width:60px;}
#${IDS.modal} th:nth-child(10),#${IDS.modal} td:nth-child(10){width:100px;}
#${IDS.modal} .herb-warning{display:block;max-height:48px;overflow:hidden;text-align:left;line-height:1.4;}
#${IDS.modal} .herb-status[data-type="success"]{color:#17884d;font-weight:bold;}
#${IDS.modal} .herb-status[data-type="error"]{color:#d13b31;font-weight:bold;}
#${IDS.modal} .herb-status[data-type="warning"]{color:#a16207;font-weight:bold;}
#${IDS.modal} .herb-warning-section{margin:10px 0;border:1px solid #9bcfe3;border-radius:6px;overflow:hidden;background:#fff;}
#${IDS.modal} .herb-warning-section-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;background:#eaf7fc;font-size:13px;font-weight:bold;}
#${IDS.modal} .herb-warning-toggle{height:27px;padding:0 10px;border:1px solid #159bd3;border-radius:4px;background:#fff;color:#117fac;cursor:pointer;font-size:12px;}
#${IDS.modal} .herb-warning-section.collapsed .herb-warning-body{display:none;}
#${IDS.modal} .herb-warning-body{padding:10px;}
#${IDS.modal} .herb-warning-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px;}
#${IDS.modal} .herb-warning-toolbar label{display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;}
#${IDS.modal} .herb-warning-toolbar input[type="checkbox"]{width:16px;height:16px;}
#${IDS.modal} .herb-warning-threshold{width:72px;height:29px;}
#${IDS.modal} .herb-warning-toolbar button{height:29px;padding:0 11px;border:1px solid #159bd3;border-radius:4px;background:#159bd3;color:#fff;cursor:pointer;font-size:12px;}
#${IDS.modal} .herb-warning-toolbar button.secondary{background:#fff;color:#159bd3;}
#${IDS.modal} .herb-warning-tip{padding:8px 10px;margin-bottom:8px;background:#fff8e8;color:#795b00;border-radius:4px;font-size:12px;line-height:1.65;}
#${IDS.modal} .herb-warning-summary{padding:8px 10px;margin-bottom:8px;background:#eef8fc;border-radius:4px;font-size:12px;line-height:1.6;}
#${IDS.modal} .herb-warning-empty{color:#6b7280;}
#${IDS.modal} .herb-warning-result-wrap{overflow:auto;max-height:300px;border:1px solid #e2e8ec;border-radius:4px;}
#${IDS.modal} .herb-warning-table{min-width:1340px!important;table-layout:fixed;}
#${IDS.modal} .herb-warning-table th,#${IDS.modal} .herb-warning-table td{font-size:11px;padding:5px 4px;}
#${IDS.modal} .herb-warning-table th:nth-child(1),#${IDS.modal} .herb-warning-table td:nth-child(1){width:36px;}
#${IDS.modal} .herb-warning-table th:nth-child(2),#${IDS.modal} .herb-warning-table td:nth-child(2){width:132px;}
#${IDS.modal} .herb-warning-table th:nth-child(3),#${IDS.modal} .herb-warning-table td:nth-child(3){width:70px;}
#${IDS.modal} .herb-warning-table th:nth-child(4),#${IDS.modal} .herb-warning-table td:nth-child(4){width:58px;}
#${IDS.modal} .herb-warning-table th:nth-child(5),#${IDS.modal} .herb-warning-table td:nth-child(5){width:85px;}
#${IDS.modal} .herb-warning-table th:nth-child(6),#${IDS.modal} .herb-warning-table td:nth-child(6){width:66px;}
#${IDS.modal} .herb-warning-table th:nth-child(7),#${IDS.modal} .herb-warning-table td:nth-child(7){width:92px;}
#${IDS.modal} .herb-warning-table th:nth-child(8),#${IDS.modal} .herb-warning-table td:nth-child(8){width:86px;}
#${IDS.modal} .herb-warning-table th:nth-child(9),#${IDS.modal} .herb-warning-table td:nth-child(9){width:62px;}
#${IDS.modal} .herb-warning-table th:nth-child(10),#${IDS.modal} .herb-warning-table td:nth-child(10){width:110px;}
#${IDS.modal} .herb-warning-table th:nth-child(11),#${IDS.modal} .herb-warning-table td:nth-child(11){width:210px;}
#${IDS.modal} .herb-warning-table th:nth-child(12),#${IDS.modal} .herb-warning-table td:nth-child(12){width:250px;}
#${IDS.modal} .herb-warning-table th:nth-child(13),#${IDS.modal} .herb-warning-table td:nth-child(13){width:70px;text-align:center;}
#${IDS.modal} .herb-warning-refill{min-width:48px;padding:3px 8px;border:1px solid #159bd3;border-radius:4px;background:#fff;color:#117fac;cursor:pointer;font-size:11px;line-height:18px;}
#${IDS.modal} .herb-warning-refill:hover{background:#eaf7fc;}
#${IDS.modal} .herb-warning-status{display:inline-block;max-width:102px;box-sizing:border-box;padding:3px 6px;border-radius:9px;font-weight:bold;white-space:normal;line-height:1.35;text-align:center;}
#${IDS.modal} .herb-warning-status[data-status="normal"]{background:#ecfdf3;color:#166534;}
#${IDS.modal} .herb-warning-status[data-status="soon"]{background:#fff8e8;color:#9a6700;}
#${IDS.modal} .herb-warning-status[data-status="warning"]{background:#fff3cd;color:#8a5b00;}
#${IDS.modal} .herb-warning-status[data-status="overdue"]{background:#fff0ef;color:#b42318;}
#${IDS.modal} .herb-warning-status[data-status="covered"]{background:#eef6ff;color:#295b82;}
#${IDS.modal} .herb-warning-status[data-status="review"]{background:#ffedd5;color:#9a3412;}
#${IDS.modal} .herb-warning-status[data-status="unknown"]{background:#eef1f4;color:#4b5563;}
#${IDS.modal} .herb-warning-row.herb-warning-warning,#${IDS.modal} .herb-warning-row.herb-warning-overdue,#${IDS.modal} .herb-warning-row.herb-warning-review{background:#fffdf5;}
#${IDS.modal} .herb-warning-row.herb-warning-covered{background:#f7fbff;}
#${IDS.modal} .herb-warning-names,#${IDS.modal} .herb-warning-notes{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}
#${IDS.modal} .herb-footer{
display:flex;justify-content:flex-end;gap:9px;padding:11px 16px;border-top:1px solid #eee;background:#fafafa;
}
@media(max-width:900px){#${IDS.modal} .herb-grid{grid-template-columns:1fr 1fr;}#${IDS.modal} .herb-tcm-grid{grid-template-columns:1fr;}}
@media(max-width:620px){#${IDS.modal} .herb-grid{grid-template-columns:1fr;}}
`;

        document.head.appendChild(style);
    }

    /******************************************************************
     * 十四、弹窗逻辑
     ******************************************************************/

    function createModal() {
        let modal = document.getElementById(IDS.modal);

        if (modal) {
            return modal;
        }

        ensureStyle();

        modal = document.createElement('div');
        modal.id = IDS.modal;
        modal.innerHTML = `
<div class="herb-mask"></div>
<div class="herb-dialog">
    <div class="herb-header">
        <span>中草药AI辅助批量录入</span>
        <button type="button" class="herb-close">×</button>
    </div>
    <div class="herb-body">
        <div class="herb-grid">
            <label>DeepSeek API Key
                <input type="password" class="herb-api-key" placeholder="sk-...；仅保存在油猴脚本存储中">
            </label>
            <label>模型
                <input type="text" class="herb-model" placeholder="例如 deepseek-v4-flash">
            </label>
            <label>剂数
                <input type="number" class="herb-dose-count" min="1" max="60" step="1">
            </label>
            <label>煎煮方式
                <select class="herb-decoction-mode">
                    <option value="代煎">代煎</option>
                    <option value="自煎">自煎</option>
                    <option value="外用">外用</option>
                    <option value="冲服">冲服</option>
                </select>
            </label>
        </div>

        <div class="herb-warning-section">
            <div class="herb-warning-section-header">
                <span>中草药预警系统（药品总量÷单剂剂量，每日1付）</span>
                <button type="button" class="herb-warning-toggle">折叠</button>
            </div>
            <div class="herb-warning-body">
                <div class="herb-warning-toolbar">
                    <label><input type="checkbox" class="herb-warning-enabled">打开中草药助手时自动扫描当前医嘱查询页</label>
                    <label><input type="checkbox" class="herb-warning-front-enabled">开启预警渲染（直接标记医嘱界面）</label>
                    <label title="勾选后，每张中草药处方只在页面顺序中的第一味中药旁显示预警标签；取消勾选则该方所有药味均显示"><input type="checkbox" class="herb-warning-first-only">只渲染首位中药</label>
                    <label title="按用法建立时间线。若同一用法（如外用）存在严格更晚开立的中药处方，则较早处方判定已用尽，不再参与当前报警和医嘱界面预警渲染；只对当前已加载医嘱生效"><input type="checkbox" class="herb-warning-route-timeline">相同用法中药时间线覆盖补偿</label>
                    <label title="预计剩余天数小于或等于该值时，在医嘱查询界面显示标签">渲染阈值<input type="number" min="0" step="0.5" value="5" class="herb-warning-threshold herb-warning-render-threshold">天</label>
                    <label title="预计剩余天数小于或等于该值时，标记为达到报警阈值">报警阈值<input type="number" min="0" step="0.5" value="2" class="herb-warning-threshold herb-warning-alert-threshold">天</label>
                    <button type="button" class="herb-warning-scan">扫描当前所有医嘱</button>
                    <button type="button" class="herb-warning-clear secondary">清空预警结果</button>
                </div>
                <div class="herb-warning-tip">计算方法：将同一开立时间、同一医生、同一用法的中草药医嘱合并为一张处方；每味药分别以“药品总量÷单剂剂量”计算付数，默认每日1付，再用处方付数减去自开立时间至今经过的天数。正常情况下同方各味付数应一致；若不一致，脚本按最少付数保守估算并提示人工复核。“只渲染首位中药”只控制医嘱界面标签数量，不影响扫描结果与报警计算。开启“相同用法中药时间线覆盖补偿”后，会按用法分别建立处方时间线：只要存在严格更晚开立的同用法处方，较早处方就判定为已用尽，由最新一张同用法处方继续参与当前剩余天数和报警计算；被覆盖的历史处方仍保留在扫描结果中并可点击“补开”，但不再参与当前报警或前端标签渲染。该补偿只基于当前医嘱查询页面已经加载的记录，因此请尽量选择全部医嘱、完整日期范围并切换为较大的每页条数。结果仍需结合实际用药、停药、退药及患者情况人工核对。</div>
                <div class="herb-warning-summary"><span class="herb-warning-empty">尚未扫描当前患者医嘱。</span></div>
                <div class="herb-warning-result-wrap">
                    <table class="herb-warning-table"><thead><tr>
                        <th>序</th><th>开立时间</th><th>医生</th><th>药味</th><th>估算付数</th><th>已用</th><th>预计剩余</th><th>预计用尽</th><th>用法</th><th>状态</th><th>方内药味</th><th>说明</th><th>操作</th>
                    </tr></thead><tbody class="herb-warning-result-body"></tbody></table>
                </div>
            </div>
        </div>

        <label>中药处方文字
            <textarea class="herb-source-text" placeholder="可粘贴下列任意形式：
丹参20g、川芎10g、黄芪30g、炙甘草6g
炒麦芽 15克
制附子10g（先煎30分钟）

脚本会提取药名与每剂剂量；AI只辅助规范名称和提示风险。"></textarea>
        </label>

        <label>辨证、主治或处方目的（可选，用于提高方解与主方判断准确度）
            <textarea class="herb-syndrome-text" placeholder="例如：中风后遗症，气虚血瘀证；治以益气活血、通络。未填写时，AI仅依据方药组成推测。"></textarea>
        </label>

        <div class="herb-tcm-section">
            <div class="herb-tcm-section-header">
                <span>辨证处方建议（患者病情＋中医四诊）</span>
                <div class="herb-tcm-section-tools">
                    <button type="button" class="herb-tcm-clear">清空</button>
                    <button type="button" class="herb-tcm-toggle">折叠</button>
                </div>
            </div>
            <div class="herb-tcm-body">
                <div class="herb-tcm-split-inputs herb-tcm-grid">
                    <label>患者基本病情信息
                        <textarea class="herb-tcm-clinical-text" placeholder="建议包括：姓名可省略；性别、年龄、主诉、现病史、既往史、诊断、过敏史、肝肾功能、妊娠哺乳、当前中西药、检查化验及治疗目的。"></textarea>
                    </label>
                    <label>中医四诊信息
                        <textarea class="herb-tcm-four-text" placeholder="望：神色形态、舌质、舌苔；闻：声音、气味；问：寒热、汗、疼痛、饮食口味、二便、睡眠、月经等；切：脉象、按诊。请尽量录入原始四诊表现。"></textarea>
                    </label>
                </div>
                <div class="herb-tcm-merged-input">
                    <label>患者病情与中医四诊合并信息
                        <textarea class="herb-tcm-merged-text" placeholder="可直接粘贴一整段文本，无需添加标题、换行或分成两个部分。例如：患者头痛而胀，遇风加重，伴恶风，面红目赤，口渴喜饮，便秘尿赤；舌尖红，苔薄黄，脉浮数。也可同时粘贴年龄、诊断、既往史及检查化验。"></textarea>
                    </label>
                    <div class="herb-tcm-mode-note">合并模式支持直接粘贴任意连续文本，不要求“患者基本病情信息/中医四诊信息”标题，也不要求分段。生成时会把整段原文直接交给DeepSeek自行识别病情与四诊；“拆解信息框”仅用于需要人工分栏核对时。</div>
                </div>
                <div class="herb-tcm-actions">
                    <button type="button" class="herb-tcm-generate">生成辨证处方建议</button>
                    <button type="button" class="herb-tcm-apply secondary" disabled>引用处方到中药文本框</button>
                    <button type="button" class="herb-tcm-copy secondary" disabled>复制辨证处方</button>
                    <button type="button" class="herb-tcm-merge secondary">合并信息框</button>
                    <button type="button" class="herb-tcm-split secondary" disabled>拆解信息框</button>
                </div>
                <div class="herb-tcm-result"></div>
            </div>
        </div>

        <div class="herb-tip">录入规则：
1. 代煎：用法选择“代煎”，代煎选择“是”；自煎：用法直接选择“自煎”，代煎选择“否”；外用：用法选择“外用”，代煎选择“否”；冲服：用法选择“冲服”，代煎选择“否”。
2. 不设置“嘱托”列，保留医院系统当前默认值，避免因该列控件异常导致整批失败。
3. “自付比例”逐行读取实际可选项并选择最小数值；无法读取选项时才以输入框最小值或0兜底。
4. 所有中药的组号统一填写为“1”；药名固定录入第3列“名称”，不会再写入第2列组号。
5. 出院带药默认“否”，转自费默认“否”，计费默认“是”，单位统一为“克”。
6. 勾选“系统检索名称统一加★前缀”后，面板中的系统检索名称会立即变为“★药名”；取消勾选则立即去掉★。医院药品字典检索完全沿用v1.2的普通检索方法，不再额外排序或强制处理带★候选。
7. 十八反、十九畏、毒性饮片、剂量及特殊煎法只做辅助提示，脚本不会自动删药、改药或改剂量。
8. “辨证处方建议”综合患者病情和中医四诊生成候选处方；合并模式可直接粘贴一整段混合文本，无需标题或分段。结果不会直接写入医院系统，必须人工引用到中药文本框后再次解析、审方和确认。
9. “合并信息框”可接收任意连续文本；“拆解信息框”优先按标题还原，无标题时按句子及舌、苔、脉等关键词辅助拆分，拆分结果必须人工核对。
10. “方解与主方判断”由DeepSeek依据方药组成、剂量和可选辨证信息生成；可能判断为原方、加减方、合方、自拟方或无法判断，需人工核对。
11. API默认使用deepseek-v4-flash并关闭思考模式；遇到限流、服务器繁忙、网络中断、空结果或JSON截断时最多自动重试2次。
12. 当前中草药表格没有医嘱行时，脚本会自动识别并点击页面下方“新医嘱”创建首行；后续行仍使用右侧“＋”增加。
13. 录入开始后可点击右上角“×”、遮罩或底部“隐藏窗口”，录入会继续；点击左侧悬浮框可重新打开查看进度、暂停或中止。
14. 页面保存前会再次弹出人工确认；出现红色风险时，必须勾选“已人工复核红色风险”才能继续。
15. “中草药预警系统”只读取当前医嘱查询页：按药品总量÷单剂剂量计算付数、每日1付，并结合开立时间估算剩余天数；同方付数不一致时按最少付数保守预警。</div>

        <div class="herb-options">
            <label>
                <input type="checkbox" class="herb-prefer-starred" checked>
                系统检索名称统一加★前缀（取消勾选则去掉★）
            </label>
            <label>
                <input type="checkbox" class="herb-save-after-fill" checked>
                全部录入成功后，确认并点击页面底部“保存”
            </label>
            <label>
                <input type="checkbox" class="herb-risk-ack">
                已由医师/药师人工复核红色风险
            </label>
        </div>

        <div class="herb-actions">
            <button type="button" class="herb-parse">解析文本</button>
            <button type="button" class="herb-ai">DeepSeek提取与审方</button>
            <button type="button" class="herb-formula-ai">生成方解与主方判断</button>
            <button type="button" class="herb-fill">录入已勾选中药</button>
            <button type="button" class="herb-pause warning" disabled>暂停</button>
            <button type="button" class="herb-abort danger" disabled>中止</button>
            <button type="button" class="herb-select-all secondary">全选/全不选</button>
            <button type="button" class="herb-print-prescription secondary">打印处方单</button>
        </div>

        <div class="herb-audit-box">
            <div class="herb-audit-title">配伍与用药安全辅助检查</div>
            <div class="herb-audit-content"></div>
        </div>

        <div class="herb-formula-box">
            <div class="herb-formula-title">
                <span>方解与主方判断（DeepSeek辅助）</span>
                <button type="button" class="herb-formula-copy">复制结果</button>
            </div>
            <div class="herb-formula-content"></div>
        </div>

        <div class="herb-result-wrap">
            <table>
                <thead>
                    <tr>
                        <th>填</th>
                        <th>序</th>
                        <th>原药名</th>
                        <th>系统检索名称</th>
                        <th>剂量</th>
                        <th>单位</th>
                        <th>特殊煎法</th>
                        <th>提示</th>
                        <th>置信度</th>
                        <th>状态</th>
                    </tr>
                </thead>
                <tbody class="herb-result-body"></tbody>
            </table>
        </div>
    </div>
    <div class="herb-footer">
        <button type="button" class="herb-cancel secondary">隐藏窗口（继续录入）</button>
    </div>
</div>`;

        document.body.appendChild(modal);

        /*
         * 弹窗只负责显示配置和进度，不承担任务生命周期。
         * 即使正在录入，也允许隐藏弹窗；后台录入、暂停状态和中止状态均保持不变。
         * 需要重新查看时，点击左侧悬浮框“自动填写中草药”即可恢复显示。
         */
        const close = function () {
            modal.classList.remove('show');

            if (state.running) {
                showStatus(
                    '中草药面板已隐藏，后台任务继续执行。\n点击左侧“自动填写中草药”可重新打开查看进度。',
                    'normal'
                );
            }
        };

        modal.querySelector('.herb-close').addEventListener('click', close);
        modal.querySelector('.herb-cancel').addEventListener('click', close);
        modal.querySelector('.herb-mask').addEventListener('click', close);

        const apiKeyInput = modal.querySelector('.herb-api-key');
        const modelInput = modal.querySelector('.herb-model');
        const sourceText = modal.querySelector('.herb-source-text');
        const syndromeText = modal.querySelector('.herb-syndrome-text');
        const tcmClinicalText = modal.querySelector('.herb-tcm-clinical-text');
        const tcmFourText = modal.querySelector('.herb-tcm-four-text');
        const tcmMergedText = modal.querySelector('.herb-tcm-merged-text');
        const tcmGenerateButton = modal.querySelector('.herb-tcm-generate');
        const tcmApplyButton = modal.querySelector('.herb-tcm-apply');
        const tcmCopyButton = modal.querySelector('.herb-tcm-copy');
        const tcmMergeButton = modal.querySelector('.herb-tcm-merge');
        const tcmSplitButton = modal.querySelector('.herb-tcm-split');
        const modeSelect = modal.querySelector('.herb-decoction-mode');
        const doseCountInput = modal.querySelector('.herb-dose-count');
        const saveAfterFill = modal.querySelector('.herb-save-after-fill');
        const preferStarred = modal.querySelector('.herb-prefer-starred');
        const riskAck = modal.querySelector('.herb-risk-ack');
        const pauseButton = modal.querySelector('.herb-pause');
        const abortButton = modal.querySelector('.herb-abort');
        const herbWarningEnabled = modal.querySelector('.herb-warning-enabled');
        const herbWarningFrontEnabled = modal.querySelector('.herb-warning-front-enabled');
        const herbWarningFirstOnly = modal.querySelector('.herb-warning-first-only');
        const herbWarningRouteTimeline = modal.querySelector('.herb-warning-route-timeline');
        const herbWarningRenderThreshold = modal.querySelector('.herb-warning-render-threshold');
        const herbWarningAlertThreshold = modal.querySelector('.herb-warning-alert-threshold');
        const herbWarningScanButton = modal.querySelector('.herb-warning-scan');
        const herbWarningClearButton = modal.querySelector('.herb-warning-clear');

        apiKeyInput.value = GM_getValue(KEYS.apiKey, '');
        const savedModel = GM_getValue(KEYS.model, DEFAULT_MODEL);
        modelInput.value = normalizeDeepSeekModel(savedModel);

        if (String(savedModel || '').trim() !== modelInput.value) {
            GM_setValue(KEYS.model, modelInput.value);
        }
        sourceText.value = GM_getValue(KEYS.draft, '');
        syndromeText.value = GM_getValue(KEYS.syndromeText, '');
        tcmClinicalText.value = GM_getValue(KEYS.tcmClinicalText, '');
        tcmFourText.value = GM_getValue(KEYS.tcmFourDiagnosisText, '');
        tcmMergedText.value = GM_getValue(
            KEYS.tcmMergedText,
            buildMergedTcmInformation(
                tcmClinicalText.value,
                tcmFourText.value
            )
        );
        modeSelect.value = GM_getValue(KEYS.decoctionMode, '代煎');
        doseCountInput.value = String(GM_getValue(KEYS.doseCount, 7));
        saveAfterFill.checked = Boolean(GM_getValue(KEYS.saveAfterFill, true));
        preferStarred.checked = Boolean(GM_getValue(KEYS.preferStarred, true));
        herbWarningEnabled.checked = Boolean(
            GM_getValue(KEYS.herbWarningEnabled, true)
        );
        herbWarningFrontEnabled.checked = Boolean(
            GM_getValue(KEYS.herbWarningRenderEnabled, false)
        );
        herbWarningFirstOnly.checked = Boolean(
            GM_getValue(KEYS.herbWarningFirstOnly, false)
        );
        herbWarningRouteTimeline.checked = Boolean(
            GM_getValue(
                KEYS.herbWarningRouteTimelineCompensation,
                false
            )
        );
        herbWarningRenderThreshold.value = String(
            herbWarningRenderThresholdDays()
        );
        herbWarningAlertThreshold.value = String(
            herbWarningAlertThresholdDays()
        );
        syncStarPrefixToItems(state.items, preferStarred.checked);

        apiKeyInput.addEventListener('change', function () {
            GM_setValue(KEYS.apiKey, apiKeyInput.value.trim());
        });

        modelInput.addEventListener('change', function () {
            modelInput.value = normalizeDeepSeekModel(modelInput.value);
            GM_setValue(KEYS.model, modelInput.value);
        });

        sourceText.addEventListener('input', function () {
            GM_setValue(KEYS.draft, sourceText.value);
        });

        const herbWarningResultBody =
            modal.querySelector('.herb-warning-result-body');

        if (herbWarningResultBody) {
            herbWarningResultBody.addEventListener('click', function (event) {
                const button = event.target && event.target.closest
                    ? event.target.closest('.herb-warning-refill')
                    : null;

                if (!button || !herbWarningResultBody.contains(button)) {
                    return;
                }

                const index = Number(button.getAttribute('data-warning-index'));

                if (!Number.isInteger(index) || index < 0) {
                    return;
                }

                refillHerbWarningPrescription(modal, index);
            });
        }

        syndromeText.addEventListener('input', function () {
            GM_setValue(KEYS.syndromeText, syndromeText.value);
        });

        tcmClinicalText.addEventListener('input', function () {
            GM_setValue(KEYS.tcmClinicalText, tcmClinicalText.value);
        });

        tcmFourText.addEventListener('input', function () {
            GM_setValue(KEYS.tcmFourDiagnosisText, tcmFourText.value);
        });

        tcmMergedText.addEventListener('input', function () {
            GM_setValue(KEYS.tcmMergedText, tcmMergedText.value);
        });

        modeSelect.addEventListener('change', function () {
            GM_setValue(KEYS.decoctionMode, modeSelect.value);
        });

        doseCountInput.addEventListener('change', function () {
            GM_setValue(KEYS.doseCount, Number(doseCountInput.value) || 7);
        });

        saveAfterFill.addEventListener('change', function () {
            GM_setValue(KEYS.saveAfterFill, saveAfterFill.checked);
        });

        herbWarningEnabled.addEventListener('change', function () {
            GM_setValue(
                KEYS.herbWarningEnabled,
                herbWarningEnabled.checked
            );

            if (herbWarningEnabled.checked) {
                scanHerbWarnings(modal, false);
            }
        });

        herbWarningFrontEnabled.addEventListener('change', function () {
            GM_setValue(
                KEYS.herbWarningRenderEnabled,
                herbWarningFrontEnabled.checked
            );
            state.herbWarningFrontSignature = '';

            if (herbWarningFrontEnabled.checked) {
                scanHerbWarnings(modal, false);
                scheduleHerbWarningFrontRender(120);
            }
            else {
                clearHerbWarningFrontRender(false);
            }
        });

        herbWarningFirstOnly.addEventListener('change', function () {
            GM_setValue(
                KEYS.herbWarningFirstOnly,
                herbWarningFirstOnly.checked
            );
            if (herbWarningFrontEnabled.checked) {
                scheduleHerbWarningFrontRender(40);
            }

            showStatus(
                herbWarningFirstOnly.checked
                    ? '中草药预警已改为每张处方只标记首位中药。'
                    : '中草药预警已改为同方所有中药均显示标签。',
                'success'
            );
        });

        herbWarningRouteTimeline.addEventListener('change', function () {
            GM_setValue(
                KEYS.herbWarningRouteTimelineCompensation,
                herbWarningRouteTimeline.checked
            );

            /*
             * 开关会改变处方的有效状态，必须重新从当前医嘱表计算，
             * 不能直接复用2秒缓存里的上一次结果。
             */
            state.herbWarningFrontDirty = true;
            state.herbWarningFrontSignature = '';

            scanHerbWarnings(modal, true);

            showStatus(
                herbWarningRouteTimeline.checked
                    ? '已开启相同用法中药时间线覆盖补偿：同用法较早处方在检测到后续处方后按已用尽处理。'
                    : '已关闭相同用法中药时间线覆盖补偿：恢复按每张处方自身开立时间和付数估算。',
                'success'
            );
        });

        herbWarningRenderThreshold.addEventListener('change', function () {
            const value = herbWarningThresholdValue(
                herbWarningRenderThreshold.value,
                5
            );

            herbWarningRenderThreshold.value = String(value);
            GM_setValue(KEYS.herbWarningRenderThresholdDays, value);
            state.herbWarningFrontSignature = '';

            if (
                herbWarningFrontEnabled.checked ||
                state.herbWarningResults.length
            ) {
                scanHerbWarnings(modal, true);
            }
        });

        herbWarningAlertThreshold.addEventListener('change', function () {
            const value = herbWarningThresholdValue(
                herbWarningAlertThreshold.value,
                2
            );

            herbWarningAlertThreshold.value = String(value);
            GM_setValue(KEYS.herbWarningAlertThresholdDays, value);
            state.herbWarningFrontSignature = '';

            if (
                herbWarningFrontEnabled.checked ||
                state.herbWarningResults.length
            ) {
                scanHerbWarnings(modal, true);
            }
        });

        herbWarningScanButton.addEventListener('click', function () {
            scanHerbWarnings(modal, false);
        });

        herbWarningClearButton.addEventListener('click', function () {
            state.herbWarningResults = [];
            state.herbWarningMeta = null;
            state.herbWarningFrontSignature = '';
            state.herbWarningFrontDirty = true;
            renderHerbWarning(modal);
            clearHerbWarningFrontRender(false);
            showStatus('中草药预警结果及医嘱界面标记已清除。', 'success');
        });

        modal.querySelector('.herb-warning-toggle').addEventListener(
            'click',
            function () {
                const section = modal.querySelector(
                    '.herb-warning-section'
                );

                setHerbWarningCollapsed(
                    modal,
                    !section.classList.contains('collapsed'),
                    true
                );
            }
        );

        preferStarred.addEventListener('change', function () {
            if (state.running) {
                preferStarred.checked = !preferStarred.checked;
                showStatus('录入或AI任务执行期间不能切换★前缀，请等待当前任务结束。', 'warning');
                return;
            }

            GM_setValue(KEYS.preferStarred, preferStarred.checked);
            syncStarPrefixToResultTable(modal, preferStarred.checked);

            showStatus(
                preferStarred.checked
                    ? '已在全部“系统检索名称”前加入★前缀。'
                    : '已从全部“系统检索名称”中去掉★前缀。',
                'success'
            );
        });

        renderHerbWarning(modal);
        setHerbWarningCollapsed(
            modal,
            Boolean(GM_getValue(KEYS.herbWarningCollapsed, false)),
            false
        );
        renderFormulaAnalysis(modal);
        renderTcmPrescriptionSuggestion(modal);
        setTcmPrescriptionCollapsed(
            modal,
            Boolean(GM_getValue(KEYS.tcmPrescriptionCollapsed, false)),
            false
        );
        setTcmInputMode(
            modal,
            GM_getValue(KEYS.tcmInputMode, 'merged'),
            false
        );

        if (modal.querySelector('.herb-tcm-section').dataset.inputMode === 'merged' &&
            !tcmMergedText.value.trim()) {
            syncMergedTcmTextFromSplit(modal);
        }

        tcmMergeButton.addEventListener('click', function () {
            if (state.running) {
                showStatus('当前有AI分析或录入任务正在执行，暂不能切换信息框模式。', 'warning');
                return;
            }

            syncMergedTcmTextFromSplit(modal);
            setTcmInputMode(modal, 'merged', true);
            showStatus(
                '已合并为一个信息框。可直接粘贴连续文本，无需标题或分段；生成时DeepSeek会自行识别病情与四诊。',
                'success'
            );
        });

        tcmSplitButton.addEventListener('click', function () {
            if (state.running) {
                showStatus('当前有AI分析或录入任务正在执行，暂不能切换信息框模式。', 'warning');
                return;
            }

            syncSplitTcmTextFromMerged(modal, true);
            setTcmInputMode(modal, 'split', true);
            showStatus('已拆解为患者基本病情和中医四诊两个信息框，请核对拆解结果。', 'success');
        });

        modal.querySelector('.herb-tcm-toggle').addEventListener('click', function () {
            const section = modal.querySelector('.herb-tcm-section');

            setTcmPrescriptionCollapsed(
                modal,
                !section.classList.contains('collapsed'),
                true
            );
        });

        modal.querySelector('.herb-tcm-clear').addEventListener('click', function () {
            if (state.running) {
                showStatus('当前有AI分析或录入任务正在执行，暂不能清空辨证处方板块。', 'warning');
                return;
            }

            const hasContent = tcmClinicalText.value.trim() ||
                tcmFourText.value.trim() ||
                tcmMergedText.value.trim() ||
                state.tcmPrescriptionSuggestion;

            if (hasContent && !window.confirm('确认清空患者病情、四诊信息及辨证处方结果吗？')) {
                return;
            }

            tcmClinicalText.value = '';
            tcmFourText.value = '';
            tcmMergedText.value = '';
            state.tcmPrescriptionSuggestion = null;
            GM_setValue(KEYS.tcmClinicalText, '');
            GM_setValue(KEYS.tcmFourDiagnosisText, '');
            GM_setValue(KEYS.tcmMergedText, '');
            renderTcmPrescriptionSuggestion(modal);
            showStatus('辨证处方板块已清空。', 'success');
        });

        tcmGenerateButton.addEventListener('click', async function () {
            if (state.running) {
                return;
            }

            const apiKey = apiKeyInput.value.trim();
            const model = normalizeDeepSeekModel(modelInput.value);
            const currentInputMode = modal.querySelector('.herb-tcm-section').dataset.inputMode || 'merged';
            let clinicalValue = tcmClinicalText.value.trim();
            let fourValue = tcmFourText.value.trim();
            let combinedValue = '';

            if (!suiteGlobalAiHasApiKey(apiKey)) {
                showStatus('请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。', 'error');
                return;
            }

            if (currentInputMode === 'merged') {
                combinedValue = tcmMergedText.value.trim();

                if (!combinedValue) {
                    showStatus('请直接粘贴患者病情及中医四诊相关信息。无需标题或分段。', 'error');
                    return;
                }

                /*
                 * 辅助拆解只用于保存双框内容和以后切换显示，不作为生成前提。
                 * 即使无法拆出独立四诊，仍将完整原文发送给DeepSeek。
                 */
                const parsedCombined = syncSplitTcmTextFromMerged(modal, false);
                clinicalValue = parsedCombined.clinicalText;
                fourValue = parsedCombined.fourDiagnosisText;
                GM_setValue(KEYS.tcmMergedText, combinedValue);
            }
            else {
                if (!clinicalValue) {
                    showStatus('请先填写患者基本病情信息。', 'error');
                    return;
                }

                if (!fourValue) {
                    showStatus('请先填写中医四诊信息，至少包括舌象和脉象或其他关键四诊表现。', 'error');
                    return;
                }
            }

            GM_setValue(KEYS.apiKey, apiKey);
            modelInput.value = model;
            GM_setValue(KEYS.model, model);
            GM_setValue(KEYS.tcmClinicalText, clinicalValue);
            GM_setValue(KEYS.tcmFourDiagnosisText, fourValue);

            state.running = true;
            tcmGenerateButton.disabled = true;
            tcmGenerateButton.textContent = '辨证处方生成中…';
            tcmApplyButton.disabled = true;
            tcmCopyButton.disabled = true;
            showStatus(currentInputMode === 'merged'
                ? '正在读取整段患者病情与四诊信息并生成辨证处方候选……'
                : '正在根据患者病情和中医四诊生成辨证处方候选……');

            try {
                const result = await deepSeekTcmPrescriptionRequest(
                    apiKey,
                    model,
                    clinicalValue,
                    fourValue,
                    combinedValue
                );

                const suggestion = normalizeTcmPrescriptionResult(result);
                renderTcmPrescriptionSuggestion(modal);
                setTcmPrescriptionCollapsed(modal, false, true);

                const dangerCount = auditFormula(
                    tcmSuggestionAuditItems()
                ).filter(function (issue) {
                    return issue.severity === 'danger';
                }).length;

                showStatus(
                    '辨证处方候选已生成：' +
                    (suggestion.differentiation.syndromeName || '证型待核对') +
                    '；' + suggestion.prescription.items.length + '味中药' + getLastApiTimingText() + '。' +
                    (dangerCount
                        ? '\n本地审方发现' + dangerCount + '项红色风险，禁止未经人工复核直接引用。'
                        : '\n请逐项人工核对后再引用到中药文本框。'),
                    dangerCount ? 'warning' : 'success'
                );
            }
            catch (error) {
                state.tcmPrescriptionSuggestion = null;
                renderTcmPrescriptionSuggestion(modal);
                showStatus(error.message, 'error');
            }
            finally {
                state.running = false;
                tcmGenerateButton.disabled = false;
                tcmGenerateButton.textContent = '生成辨证处方建议';
                renderTcmPrescriptionSuggestion(modal);
            }
        });

        tcmApplyButton.addEventListener('click', function () {
            const suggestion = state.tcmPrescriptionSuggestion;

            if (!suggestion) {
                showStatus('当前没有可引用的辨证处方建议。', 'error');
                return;
            }

            const candidateItems = tcmSuggestionAuditItems();
            const invalidItems = candidateItems.filter(function (item) {
                return !item.sourceName ||
                    !Number.isFinite(Number(item.doseG)) ||
                    Number(item.doseG) <= 0;
            });

            if (invalidItems.length) {
                showStatus('候选处方中存在药名或剂量缺失，不能引用。请重新生成或人工修正。', 'error');
                return;
            }

            const auditIssues = auditFormula(candidateItems);
            const dangerIssues = auditIssues.filter(function (issue) {
                return issue.severity === 'danger';
            });
            const currentText = sourceText.value.trim();
            const confirmLines = [
                '准备将AI辨证候选处方引用到“中药处方文字”框。',
                '引用后不会立即写入医院系统，仍需解析文本、审方并人工确认。',
                '候选处方：' + suggestion.prescription.items.length + '味，' +
                    suggestion.prescription.doseCount + '剂，' +
                    resolveHerbAdministration(
                        suggestion.prescription.administration
                    ).description + '。'
            ];

            if (currentText) {
                confirmLines.push('当前中药文本框已有内容，确认后将被候选处方替换。');
            }

            if (dangerIssues.length) {
                confirmLines.push('警告：本地审方发现' + dangerIssues.length + '项红色风险，必须由医师和药师逐项复核。');
            }

            if (!window.confirm(confirmLines.join('\n'))) {
                return;
            }

            const herbText = prescriptionSuggestionToHerbText();
            const differentiation = suggestion.differentiation || {};

            sourceText.value = herbText;
            GM_setValue(KEYS.draft, herbText);

            doseCountInput.value = String(suggestion.prescription.doseCount || 7);
            GM_setValue(
                KEYS.doseCount,
                Number(doseCountInput.value) || 7
            );

            modeSelect.value = normalizeSuggestedAdministration(
                suggestion.prescription.administration
            );
            GM_setValue(KEYS.decoctionMode, modeSelect.value);

            syndromeText.value = [
                differentiation.diseaseName
                    ? '中医病名：' + differentiation.diseaseName
                    : '',
                differentiation.syndromeName
                    ? '证型：' + differentiation.syndromeName
                    : '',
                differentiation.pathogenesis
                    ? '病机：' + differentiation.pathogenesis
                    : '',
                differentiation.treatmentPrinciple
                    ? '治法：' + differentiation.treatmentPrinciple
                    : ''
            ].filter(Boolean).join('；');
            GM_setValue(KEYS.syndromeText, syndromeText.value);

            state.items = parseHerbText(sourceText.value);
            syncStarPrefixToItems(state.items, preferStarred.checked);
            state.aiAuditIssues = [];
            state.formulaAnalysis = null;
            state.auditIssues = auditFormula(state.items);
            riskAck.checked = false;
            renderResultTable(modal);
            renderAuditIssues(modal, '已从AI辨证候选处方引用，请逐味核对系统检索名称、剂量和特殊煎法。');
            renderFormulaAnalysis(modal);

            showStatus(
                '候选处方已引用到中药文本框并完成本地解析。\n请继续人工核对，必要时调用DeepSeek提取与审方，确认后再录入。',
                dangerIssues.length ? 'warning' : 'success'
            );
        });

        tcmCopyButton.addEventListener('click', async function () {
            try {
                await copyTextToClipboard(getTcmPrescriptionPlainText());
                showStatus('辨证处方建议已复制。', 'success');
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
        });

        modal.querySelector('.herb-parse').addEventListener('click', function () {
            state.items = parseHerbText(sourceText.value);

            if (!state.items.length) {
                showStatus(
                    '未识别到“药名＋剂量”。请检查是否写成“丹参20g”或“丹参 20克”。',
                    'error'
                );
                return;
            }

            syncStarPrefixToItems(state.items, preferStarred.checked);
            state.aiAuditIssues = [];
            state.formulaAnalysis = null;
            state.auditIssues = auditFormula(state.items);
            riskAck.checked = false;
            renderResultTable(modal);
            renderAuditIssues(modal, '');
            renderFormulaAnalysis(modal);

            showStatus(
                '已解析' + state.items.length +
                '味中药，请核对药名、剂量和特殊煎法。',
                state.auditIssues.some(function (issue) {
                    return issue.severity === 'danger';
                }) ? 'warning' : 'success'
            );
        });

        modal.querySelector('.herb-ai').addEventListener('click', async function () {
            if (state.running) {
                return;
            }

            const apiKey = apiKeyInput.value.trim();
            const model = normalizeDeepSeekModel(modelInput.value);

            if (!suiteGlobalAiHasApiKey(apiKey)) {
                showStatus('请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。', 'error');
                return;
            }

            state.items = readItemsFromTable(modal);

            if (!state.items.length) {
                state.items = parseHerbText(sourceText.value);
            }

            if (!state.items.length) {
                showStatus('请先粘贴并解析中药处方。', 'error');
                return;
            }

            GM_setValue(KEYS.apiKey, apiKey);
            modelInput.value = model;
            GM_setValue(KEYS.model, model);

            state.running = true;
            const aiButton = modal.querySelector('.herb-ai');
            const formulaButton = modal.querySelector('.herb-formula-ai');
            const parseButton = modal.querySelector('.herb-parse');
            const fillButton = modal.querySelector('.herb-fill');

            aiButton.disabled = true;
            formulaButton.disabled = true;
            parseButton.disabled = true;
            fillButton.disabled = true;
            aiButton.textContent = 'AI分析中…';
            showStatus('正在调用DeepSeek核对药名、剂量和配伍风险……');

            try {
                const result = await deepSeekRequest(
                    apiKey,
                    model,
                    sourceText.value,
                    state.items
                );
                const applied = applyAiResult(state.items, result);
                syncStarPrefixToItems(state.items, preferStarred.checked);

                state.formulaAnalysis = null;
                riskAck.checked = false;
                renderResultTable(modal);
                renderAuditIssues(modal, applied.summary);
                renderFormulaAnalysis(modal);

                showStatus(
                    'DeepSeek已返回' + applied.count +
                    '味中药的辅助结果' + getLastApiTimingText() + '。请逐条核对后再录入。',
                    state.auditIssues.some(function (issue) {
                        return issue.severity === 'danger';
                    }) ? 'warning' : 'success'
                );
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
            finally {
                state.running = false;
                aiButton.disabled = false;
                formulaButton.disabled = false;
                parseButton.disabled = false;
                fillButton.disabled = false;
                aiButton.textContent = 'DeepSeek提取与审方';
            }
        });

        modal.querySelector('.herb-formula-ai').addEventListener('click', async function () {
            if (state.running) {
                return;
            }

            const apiKey = apiKeyInput.value.trim();
            const model = normalizeDeepSeekModel(modelInput.value);

            if (!suiteGlobalAiHasApiKey(apiKey)) {
                showStatus('请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。', 'error');
                return;
            }

            state.items = readItemsFromTable(modal);

            if (!state.items.length) {
                state.items = parseHerbText(sourceText.value);
            }

            if (!state.items.length) {
                showStatus('请先粘贴并解析中药处方。', 'error');
                return;
            }

            GM_setValue(KEYS.apiKey, apiKey);
            modelInput.value = model;
            GM_setValue(KEYS.model, model);
            GM_setValue(KEYS.syndromeText, syndromeText.value);

            state.running = true;
            const formulaButton = modal.querySelector('.herb-formula-ai');
            const aiButton = modal.querySelector('.herb-ai');
            const parseButton = modal.querySelector('.herb-parse');
            const fillButton = modal.querySelector('.herb-fill');

            formulaButton.disabled = true;
            aiButton.disabled = true;
            parseButton.disabled = true;
            fillButton.disabled = true;
            formulaButton.textContent = '方解分析中…';
            showStatus('正在调用DeepSeek生成方解并判断可能的主方……');

            try {
                const result = await deepSeekFormulaRequest(
                    apiKey,
                    model,
                    syndromeText.value,
                    state.items
                );

                applyFormulaAnalysisResult(result);
                renderFormulaAnalysis(modal);

                const main = state.formulaAnalysis.mainFormula;
                const displayName = main.name ||
                    (main.classification === '自拟方' ? '自拟方' : '未识别明确主方');

                showStatus(
                    '方解已生成。主方辅助判断：' + displayName +
                    '（' + main.classification + '，置信度' +
                    Math.round(Number(main.confidence || 0) * 100) + '%）' +
                    getLastApiTimingText() + '。请人工核对。',
                    'success'
                );
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
            finally {
                state.running = false;
                formulaButton.disabled = false;
                aiButton.disabled = false;
                parseButton.disabled = false;
                fillButton.disabled = false;
                formulaButton.textContent = '生成方解与主方判断';
            }
        });

        modal.querySelector('.herb-formula-copy').addEventListener('click', async function () {
            try {
                await copyTextToClipboard(getFormulaAnalysisPlainText());
                showStatus('方解与主方判断结果已复制。', 'success');
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
        });

        modal.querySelector('.herb-print-prescription').addEventListener('click', function () {
            try {
                herbRxOpenPrintModal(modal);
            } catch (error) {
                showStatus(error.message, 'error');
            }
        });

        modal.querySelector('.herb-select-all').addEventListener('click', function () {
            const boxes = Array.from(modal.querySelectorAll('.herb-enabled'));
            const shouldCheck = boxes.some(function (box) {
                return !box.checked;
            });

            boxes.forEach(function (box) {
                box.checked = shouldCheck;
            });
        });

        pauseButton.addEventListener('click', function () {
            if (!state.running) {
                return;
            }

            state.paused = !state.paused;
            pauseButton.textContent = state.paused ? '继续' : '暂停';

            showStatus(
                state.paused
                    ? '已请求暂停，将在当前安全步骤结束后暂停。'
                    : '继续执行中药录入。',
                state.paused ? 'warning' : 'normal'
            );
        });

        abortButton.addEventListener('click', function () {
            if (!state.running) {
                return;
            }

            state.abortRequested = true;
            state.paused = false;
            pauseButton.textContent = '暂停';
            showStatus('已请求中止，将在当前安全步骤结束后停止。', 'warning');
        });

        modal.querySelector('.herb-fill').addEventListener('click', async function () {
            if (state.running) {
                return;
            }

            state.items = readItemsFromTable(modal);
            syncStarPrefixToItems(state.items, preferStarred.checked);

            state.items.forEach(function (item, index) {
                const row = modal.querySelector(
                    '.herb-result-body tr[data-index="' + index + '"]'
                );
                const input = row ? row.querySelector('.herb-standard') : null;

                if (input) {
                    input.value = item.standardName;
                }
            });

            state.auditIssues = mergeAuditIssues(
                auditFormula(state.items),
                state.aiAuditIssues
            );
            renderAuditIssues(modal, '');

            const selected = state.items.map(function (item, index) {
                return {
                    item: item,
                    index: index
                };
            }).filter(function (entry) {
                return entry.item.enabled;
            });

            if (!selected.length) {
                showStatus('没有勾选需要录入的中药。', 'error');
                return;
            }

            const invalidDoseItems = selected.filter(function (entry) {
                return !Number.isFinite(Number(entry.item.doseG)) ||
                    Number(entry.item.doseG) <= 0;
            });

            if (invalidDoseItems.length) {
                showStatus(
                    '以下中药没有有效克数：' +
                    invalidDoseItems.map(function (entry) {
                        return entry.item.standardName || entry.item.sourceName;
                    }).join('、') +
                    '。请先修正剂量。',
                    'error'
                );
                return;
            }

            const dangerIssues = state.auditIssues.filter(function (issue) {
                return issue.severity === 'danger';
            });

            if (dangerIssues.length && !riskAck.checked) {
                showStatus(
                    '存在红色配伍或剂量风险。请由医师/药师人工复核后，勾选“已人工复核红色风险”再继续。',
                    'error'
                );
                return;
            }

            const doseCount = Number(doseCountInput.value);

            if (!Number.isInteger(doseCount) || doseCount < 1 || doseCount > 60) {
                showStatus('剂数必须是1～60之间的整数。', 'error');
                return;
            }

            const settings = {
                doseCount: doseCount,
                decoctionMode: modeSelect.value,
                saveAfterFill: saveAfterFill.checked,
                useStarPrefix: preferStarred.checked,
                entryMode: ''
            };

            const confirmationText = [
                '准备录入' + selected.length + '味中药。',
                '界面适配：自动识别新版“底部统一设置”和旧版“逐行设置”。',
                '旧版组号固定为1；新版不再填写已经移除的组号列。',
                '药名与剂量：逐味填写到表格对应列。',
                '系统检索名称：' +
                    (settings.useStarPrefix
                        ? '已统一添加★前缀，按v1.2普通检索流程录入。'
                        : '未添加★前缀，按v1.2普通检索流程录入。'),
                '剂数：' + settings.doseCount + '剂。',
                '用法设置：' +
                    resolveHerbAdministration(
                        settings.decoctionMode
                    ).description + '。',
                '新版将在全部药味录入后，于页面底部统一填写上述处方参数。',
                '嘱托：不修改，保留系统默认值。',
                '自付比例：每行自动选择可用选项中的最小数值。',
                '请确认当前患者、药名和剂量均正确。'
            ].join('\n');

            if (!window.confirm(confirmationText)) {
                return;
            }

            state.running = true;
            state.paused = false;
            state.abortRequested = false;

            const fillButton = modal.querySelector('.herb-fill');
            const parseButton = modal.querySelector('.herb-parse');
            const aiButton = modal.querySelector('.herb-ai');
            const formulaButton = modal.querySelector('.herb-formula-ai');

            fillButton.disabled = true;
            fillButton.textContent = '正在录入…';
            parseButton.disabled = true;
            aiButton.disabled = true;
            formulaButton.disabled = true;
            pauseButton.disabled = false;
            abortButton.disabled = false;
            pauseButton.textContent = '暂停';

            const successes = [];
            const failures = [];
            let saved = false;
            let saveMessage = '';

            try {
                await activateHerbTab();
                await sleep(350);
                const entryContext = await ensureHerbRowCount(selected.length);

                settings.entryMode = entryContext.entryMode || 'per-row';

                showStatus(
                    settings.entryMode === 'unified-footer'
                        ? '已识别新版中草药开立界面：先逐味录入，最后设置底部统一处方参数。'
                        : '已识别旧版中草药开立界面：继续按每行填写处方参数。',
                    'success'
                );

                for (let position = 0; position < selected.length; position += 1) {
                    await checkpoint();

                    const entry = selected[position];
                    const item = entry.item;
                    const progress = '第' + (position + 1) + '/' + selected.length + '味';

                    updateRowStatus(
                        modal,
                        entry.index,
                        '录入中（' + progress + '）',
                        ''
                    );

                    showStatus(
                        '正在录入' + progress + '：' +
                        (item.standardName || item.sourceName) +
                        ' ' + item.doseG + '克'
                    );

                    try {
                        const selectedDrug = await fillOneHerb(
                            position,
                            item,
                            settings
                        );

                        successes.push({
                            item: item,
                            selectedDrug: selectedDrug,
                            rowIndex: position
                        });

                        updateRowStatus(
                            modal,
                            entry.index,
                            '已录入表格',
                            'success'
                        );
                    }
                    catch (error) {
                        failures.push(
                            (item.standardName || item.sourceName) +
                            '：' + error.message
                        );

                        updateRowStatus(
                            modal,
                            entry.index,
                            '失败',
                            'error'
                        );

                        console.error('[中草药自动录入失败]', item, error);
                    }

                    await sleep(220);
                }

                if (state.abortRequested) {
                    throw Object.assign(new Error('用户已中止本次录入'), {
                        name: 'AbortError'
                    });
                }

                if (
                    settings.entryMode === 'unified-footer' &&
                    successes.length
                ) {
                    try {
                        await applyUnifiedHerbFooterSettings(
                            entryContext,
                            settings
                        );
                    }
                    catch (error) {
                        failures.push(
                            '页面底部统一处方参数：' + error.message
                        );
                        console.error(
                            '[中草药底部统一处方参数设置失败]',
                            error
                        );
                    }
                }

                if (!failures.length && successes.length === selected.length) {
                    if (settings.saveAfterFill) {
                        const saveConfirm = window.confirm(
                            '全部' + successes.length +
                            '味中药已录入当前表格。\n\n' +
                            (
                                settings.entryMode === 'unified-footer'
                                    ? '新版页面底部统一剂数、用法及代煎等参数也已设置。\n'
                                    : '旧版页面各行剂数、用法及代煎等参数也已设置。\n'
                            ) +
                            '请再次核对当前患者、剂数、每味剂量和煎煮方式。\n' +
                            '确认后脚本将只点击一次页面底部“保存”。'
                        );

                        if (saveConfirm) {
                            saveMessage = await saveWholeHerbOrder();
                            saved = true;
                        }
                        else {
                            showStatus(
                                '已完成表格录入，但用户取消了页面保存。请人工核对后手动保存。',
                                'warning'
                            );
                        }
                    }
                }
            }
            catch (error) {
                if (error.name === 'AbortError') {
                    showStatus(
                        '录入已中止。已经填写的行保留在页面中，未执行页面底部保存。',
                        'warning'
                    );
                }
                else {
                    failures.push(error.message);
                }
            }
            finally {
                state.running = false;
                state.paused = false;
                state.abortRequested = false;

                fillButton.disabled = false;
                fillButton.textContent = '录入已勾选中药';
                parseButton.disabled = false;
                aiButton.disabled = false;
                formulaButton.disabled = false;
                pauseButton.disabled = true;
                abortButton.disabled = true;
                pauseButton.textContent = '暂停';
            }

            const successText = successes.map(function (record) {
                return (record.item.standardName || record.item.sourceName) +
                    ' ' + record.item.doseG + '克';
            }).join('、');

            if (saved && !failures.length) {
                showStatus(
                    '已完成' + successes.length + '味中药录入并点击页面“保存”。\n' +
                    successText +
                    (saveMessage ? '\n页面提示：' + saveMessage : '') +
                    '\n请继续人工核对医嘱。',
                    'success'
                );
            }
            else if (failures.length) {
                showStatus(
                    '成功录入' + successes.length + '味，失败' + failures.length + '味。\n' +
                    (successText ? '成功项：' + successText + '\n' : '') +
                    '失败项：\n' + failures.join('\n') +
                    '\n由于存在失败项，脚本未执行页面底部保存。',
                    'error'
                );
            }
            else if (successes.length) {
                showStatus(
                    '已完成' + successes.length +
                    '味中药的表格录入，但未点击页面保存。请人工核对后保存。',
                    'warning'
                );
            }
        });

        return modal;
    }

    function openModal() {
        const modal = createModal();

        modal.classList.add('show');

        if (state.items.length) {
            renderResultTable(modal);
        }

        renderHerbWarning(modal);
        renderFormulaAnalysis(modal);
        renderTcmPrescriptionSuggestion(modal);

        const autoScan = modal.querySelector('.herb-warning-enabled');

        if (
            autoScan &&
            autoScan.checked &&
            !state.running &&
            !state.herbWarningScanBusy
        ) {
            window.setTimeout(function () {
                scanHerbWarnings(modal, true);
            }, 80);
        }
    }

    /******************************************************************
     * 十五、悬浮框：拖动、折叠、位置记忆
     ******************************************************************/

    function clamp(value, minimum, maximum) {
        return Math.min(Math.max(value, minimum), maximum);
    }

    function loadPosition() {
        const value = GM_getValue(KEYS.position, null);

        if (value &&
            Number.isFinite(value.left) &&
            Number.isFinite(value.top)) {
            return value;
        }

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
        const left = clamp(
            rect.left,
            margin,
            Math.max(margin, window.innerWidth - rect.width - margin)
        );
        const top = clamp(
            rect.top,
            margin,
            Math.max(margin, window.innerHeight - rect.height - margin)
        );

        panel.style.left = Math.round(left) + 'px';
        panel.style.top = Math.round(top) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';

        if (save !== false) {
            savePosition(panel);
        }
    }

    function positionAboveExistingPanels(panel) {
        const references = [
            document.getElementById('medical-diagnosis-auto-fill-panel-v2'),
            document.getElementById('medical-auto-fill-panel'),
            document.getElementById('medical-inpatient-auto-fill-panel')
        ].filter(function (element) {
            return element && element.isConnected && isVisible(element);
        });

        if (!references.length) {
            panel.style.left = '8px';
            panel.style.top = 'auto';
            panel.style.right = 'auto';
            panel.style.bottom = '190px';
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
        const body = panel.querySelector('.herb-floating-body');
        const toggle = panel.querySelector('.herb-floating-toggle');

        panel.dataset.collapsed = collapsed ? 'true' : 'false';
        body.style.display = collapsed ? 'none' : 'block';
        toggle.textContent = collapsed ? '＋' : '－';
        toggle.title = collapsed ? '展开' : '折叠';

        if (save !== false) {
            GM_setValue(KEYS.collapsed, collapsed);
        }

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
            if (event.target.closest('.herb-floating-toggle')) {
                return;
            }

            if (event.pointerType === 'mouse' && event.button !== 0) {
                return;
            }

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
            catch (error) {
                // 忽略。
            }

            event.preventDefault();
        });

        handle.addEventListener('pointermove', function (event) {
            if (!dragging || event.pointerId !== pointerId) {
                return;
            }

            const margin = 6;
            const left = clamp(
                startLeft + event.clientX - startX,
                margin,
                Math.max(margin, window.innerWidth - panel.offsetWidth - margin)
            );
            const top = clamp(
                startTop + event.clientY - startY,
                margin,
                Math.max(margin, window.innerHeight - panel.offsetHeight - margin)
            );

            panel.style.left = Math.round(left) + 'px';
            panel.style.top = Math.round(top) + 'px';
            event.preventDefault();
        });

        function finish(event) {
            if (!dragging) {
                return;
            }

            if (event &&
                event.pointerId !== undefined &&
                event.pointerId !== pointerId) {
                return;
            }

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
        if (document.getElementById(IDS.panel)) {
            return;
        }

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

        header.className = 'herb-floating-header';

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

        title.textContent = '中草药';

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
        toggle.className = 'herb-floating-toggle';

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
            setCollapsed(
                panel,
                panel.dataset.collapsed !== 'true',
                true
            );
        });

        header.appendChild(title);
        header.appendChild(toggle);

        const body = document.createElement('div');

        body.className = 'herb-floating-body';

        Object.assign(body.style, {
            padding: '8px',
            background: '#fff'
        });

        const button = document.createElement('button');

        button.id = IDS.button;
        button.type = 'button';
        button.textContent = '自动填写中草药';

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

        setCollapsed(
            panel,
            Boolean(GM_getValue(KEYS.collapsed, false)),
            false
        );

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

    /******************************************************************
     * 悬浮框管理器：医嘱标签联动预警扫描桥接
     *
     * 管理器只发送一次统一CustomEvent；本脚本收到后调用自身原有
     * scanHerbWarnings()。不修改“打开助手时自动扫描”、渲染阈值、
     * 报警阈值和“只渲染首位中药”等任何GM配置。
     ******************************************************************/
    const SUITE_ORDER_WARNING_SCAN_EVENT =
        'medical-userscript-order-warning-scan-request';

    let suiteOrderWarningHerbTimer = null;

    function bindSuiteOrderWarningHerbBridge() {
        if (
            window.__medicalSuiteOrderWarningHerbBridgeV1
        ) {
            return;
        }

        window.__medicalSuiteOrderWarningHerbBridgeV1 =
            true;

        document.addEventListener(
            SUITE_ORDER_WARNING_SCAN_EVENT,
            function (event) {
                const detail =
                    event && event.detail &&
                    typeof event.detail === 'object'
                        ? event.detail
                        : {};

                if (
                    detail.target &&
                    detail.target !== 'all' &&
                    detail.target !== 'herb'
                ) {
                    return;
                }

                clearTimeout(
                    suiteOrderWarningHerbTimer
                );

                state.herbWarningFrontDirty = true;

                suiteOrderWarningHerbTimer =
                    window.setTimeout(
                        function () {
                            suiteOrderWarningHerbTimer = null;

                            scanHerbWarnings(
                                createModal(),
                                false
                            );
                        },
                        80
                    );
            },
            false
        );
    }

    /******************************************************************
     * 十六、初始化
     ******************************************************************/

    function init() {
        createPanel();
        bindSuiteOrderWarningHerbBridge();
        startHerbWarningFrontWatcher();

        window.addEventListener('resize', function () {
            const panel = document.getElementById(IDS.panel);

            if (panel) {
                keepPanelInViewport(panel, true);
            }
        });

        new MutationObserver(function () {
            createPanel();
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
        "herb";

    const SUITE_BACKUP_GM_KEYS = [
            KEYS.model,
            KEYS.decoctionMode,
            KEYS.doseCount,
            KEYS.prescriptionLayout,
            KEYS.prescriptionLayoutRollback,
            KEYS.saveAfterFill,
            KEYS.preferStarred,
            KEYS.tcmInputMode,
            KEYS.tcmPrescriptionCollapsed,
            KEYS.herbWarningEnabled,
            KEYS.herbWarningRenderEnabled,
            KEYS.herbWarningFirstOnly,
            KEYS.herbWarningRouteTimelineCompensation,
            KEYS.herbWarningRenderThresholdDays,
            KEYS.herbWarningAlertThresholdDays,
            KEYS.herbWarningCollapsed,
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
            "// @name         智慧医疗－中草药AI辅助批量录入",
            "// @namespace    http://tampermonkey.net/",
            "// @version      1.18.19",
            "// @description  v1.18.19：中草药模块新增处方单打印，支持勾选药味、A5/A4预览、版式校准、元素映射和配置备份；保留既有录入及AI功能",
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
                medicalHerbAiBatchFillMain
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
                "中草药自动录入",
            version:
                "1.18.19",
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
                        state.running
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
                "中草药自动录入",
            version:
                "1.18.19",
            role:
                'business',
            fileName:
                "智慧医疗－中草药AI辅助批量录入_v1.18.19_处方单打印与版式校准.user.js",
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
