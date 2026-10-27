// ==UserScript==
// @name         智慧医疗－临床路径组套跨标签页自动录入
// @namespace    http://tampermonkey.net/
// @version      1.48.33
// @description  v1.48.33：高级条目设置改用浏览器原生模态层居中，修复仍停留在左上角的问题；保留v1.48.32其余功能
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
(function medicalClinicalPathwayMain() {
    'use strict';

    if (window.top !== window.self) return;

    const IDS = {
        panel: 'medical-clinical-pathway-panel-v1',
        modal: 'medical-clinical-pathway-modal-v1',
        style: 'medical-clinical-pathway-style-v1',
        status: 'medical-clinical-pathway-status-v1',
        importInput: 'medical-clinical-pathway-import-v1',
        aiManualEditor: 'medical-clinical-pathway-ai-manual-editor-v1'
    };

    const KEYS = {
        library: 'medicalClinicalPathwayLibraryV1',
        category: 'medicalClinicalPathwayCategoryV1',
        pathway: 'medicalClinicalPathwayPathwayV1',
        group: 'medicalClinicalPathwayGroupV1',
        position: 'medicalClinicalPathwayPositionV1',
        collapsed: 'medicalClinicalPathwayCollapsedV1',
        autoSave: 'medicalClinicalPathwayAutoSaveV1',
        continueOnError: 'medicalClinicalPathwayContinueOnErrorV1',
        ignoreDuplicateMedicationPrompt: 'medicalClinicalPathwayIgnoreDuplicateMedicationPromptV1',
        suppressCheckApplicationPopup: 'medicalClinicalPathwaySuppressCheckApplicationPopupV1',
        suppressLabApplicationPopup: 'medicalClinicalPathwaySuppressLabApplicationPopupV1',
        inpatientOrderTemplates: 'medicalClinicalPathwayInpatientOrderTemplatesV1',
        inpatientOrderEditorMode: 'medicalClinicalPathwayInpatientOrderEditorModeV1',
        inpatientOrderSecondaryDirectoryVisible: 'medicalClinicalPathwayInpatientOrderSecondaryDirectoryVisibleV1',
        currentPageOrderReverseSort: 'medicalClinicalPathwayCurrentPageOrderReverseSortV1',
        secondaryDirectoryVisible: 'medicalClinicalPathwaySecondaryDirectoryVisibleV1',
        editorMode: 'medicalClinicalPathwayEditorModeV1',
        sectionCollapsed: 'medicalClinicalPathwaySectionCollapsedV1',
        deepSeekApiKey: 'medicalClinicalPathwayDeepSeekApiKeyV1',
        deepSeekModel: 'medicalClinicalPathwayDeepSeekModelV1',
        aiGenerationPrompt: 'medicalClinicalPathwayAiGenerationPromptV1',
        aiAuditContext: 'medicalClinicalPathwayAiAuditContextV1',
        aiOrderExtractPrompt: 'medicalClinicalPathwayAiOrderExtractPromptV1',
        aiDiagnosisExtractPrompt: 'medicalClinicalPathwayAiDiagnosisExtractPromptV1',
        aiOrderExtractPromptSolidified: 'medicalClinicalPathwayAiOrderExtractPromptSolidifiedV1',
        aiDiagnosisExtractPromptSolidified: 'medicalClinicalPathwayAiDiagnosisExtractPromptSolidifiedV1',
        generalWarningAutoScan: 'medicalClinicalPathwayGeneralWarningAutoScanV1',
        generalWarningRender: 'medicalClinicalPathwayGeneralWarningRenderV1',
        generalWarningThreshold: 'medicalClinicalPathwayGeneralWarningThresholdV1',
        generalWarningTypes: 'medicalClinicalPathwayGeneralWarningTypesV1',
        generalWarningScopeMode: 'medicalClinicalPathwayGeneralWarningScopeModeV1',
        generalWarningItems: 'medicalClinicalPathwayGeneralWarningItemsV1',
        generalWarningWarnStoppedOrders: 'medicalClinicalPathwayGeneralWarningWarnStoppedOrdersV1',
        generalWarningHideStoppedOrders: 'medicalClinicalPathwayGeneralWarningHideStoppedOrdersV1',
        generalWarningHideVoidedTemporary: 'medicalClinicalPathwayGeneralWarningHideVoidedTemporaryV1'
    };



    /******************************************************************
     * 悬浮框管理器共享知识库接入
     *
     * 数据来源：悬浮框管理器 v3.3.4 的统一 localStorage 接口。
     * 即使管理器脚本尚未完成初始化，本脚本也可按相同结构直接读取。
     ******************************************************************/
    const SUITE_SHARED_KNOWLEDGE_STORAGE_KEY =
        'medicalUserscriptSharedKnowledgeV1';

    const SUITE_SHARED_KNOWLEDGE_CHANGED_EVENT =
        'medical-userscript-shared-knowledge-changed';

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

    function suiteSharedNameCounts(entries, getter) {
        const counts = new Map();

        (Array.isArray(entries) ? entries : []).forEach(function (item) {
            const key = suiteSharedKey(getter(item));

            if (!key) return;

            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return counts;
    }

    function suiteWesternSuggestionValue(item, nameCounts) {
        const name = suiteSharedPlain(
            item && (item.name || item.searchName)
        );

        if (!name) return '';

        const duplicateCount = nameCounts instanceof Map
            ? (nameCounts.get(suiteSharedKey(name)) || 0)
            : 0;

        if (duplicateCount <= 1) return name;

        return [
            name,
            suiteSharedPlain(item.specification),
            suiteSharedPlain(item.manufacturer),
            suiteSharedPlain(item.code)
        ].filter(Boolean).join('｜');
    }

    function suiteWesternPinyinSuggestionValue(item, nameCounts) {
        const initials = suiteSharedPinyinInitials(
            item && (item.name || item.searchName)
        );
        const normalValue = suiteWesternSuggestionValue(
            item,
            nameCounts
        );

        return initials && normalValue
            ? initials + '｜' + normalValue
            : '';
    }

    function suiteChargeSuggestionValue(item, nameCounts) {
        const name = suiteSharedPlain(item && item.name);

        if (!name) return '';

        const duplicateCount = nameCounts instanceof Map
            ? (nameCounts.get(suiteSharedKey(name)) || 0)
            : 0;

        if (duplicateCount <= 1) return name;

        return [
            name,
            suiteSharedPlain(item.unit),
            suiteSharedPlain(item.price)
        ].filter(function (value) {
            return value !== '';
        }).join('｜');
    }

    function suiteChargePinyinSuggestionValue(item, nameCounts) {
        const initials = suiteSharedPinyinInitials(item && item.name);
        const normalValue = suiteChargeSuggestionValue(
            item,
            nameCounts
        );

        return initials && normalValue
            ? initials + '｜' + normalValue
            : '';
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
        const nameCounts = suiteSharedNameCounts(
            entries,
            function (item) {
                return item && (item.name || item.searchName);
            }
        );

        const exactDisplay = entries.find(function (item) {
            return suiteSharedPlain(
                suiteWesternSuggestionValue(item, nameCounts)
            ).toLowerCase() === raw.toLowerCase();
        });

        if (exactDisplay) return exactDisplay;

        if (library.settings.enableWesternDrugPinyinInitials) {
            const exactPinyinDisplay = entries.find(function (item) {
                return suiteSharedPlain(
                    suiteWesternPinyinSuggestionValue(item, nameCounts)
                ).toLowerCase() === raw.toLowerCase();
            });

            if (exactPinyinDisplay) return exactPinyinDisplay;
        }

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
        const nameCounts = suiteSharedNameCounts(
            entries,
            function (item) {
                return item && item.name;
            }
        );

        const exactDisplay = entries.find(function (item) {
            return suiteSharedPlain(
                suiteChargeSuggestionValue(item, nameCounts)
            ).toLowerCase() === raw.toLowerCase();
        });

        if (exactDisplay) return exactDisplay;

        if (library.settings.enableChargeItemPinyinInitials) {
            const exactPinyinDisplay = entries.find(function (item) {
                return suiteSharedPlain(
                    suiteChargePinyinSuggestionValue(item, nameCounts)
                ).toLowerCase() === raw.toLowerCase();
            });

            if (exactPinyinDisplay) return exactPinyinDisplay;
        }

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


    const PATH_WESTERN_SUGGESTION_DATALIST_ID =
        'medical-path-western-suggestion-datalist-v1';

    const PATH_CHARGE_SUGGESTION_DATALIST_ID =
        'medical-path-charge-suggestion-datalist-v1';

    const PATH_COMBINED_SUGGESTION_DATALIST_ID =
        'medical-path-combined-suggestion-datalist-v1';

    const PATH_WESTERN_SUGGESTION_TABS = [
        '药品录入',
        '出院带药',
        '文字录入'
    ];

    const PATH_CHARGE_SUGGESTION_TABS = [
        '文字录入',
        '项目录入',
        '康复医嘱',
        '检验',
        '检查'
    ];

    function ensurePathSharedSuggestionDatalist(modal, id) {
        let datalist = modal.querySelector('#' + id);

        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = id;
            modal.appendChild(datalist);
        }

        return datalist;
    }

    function pathGuiRowTab(row) {
        const select = row && row.querySelector('.path-gui-tab');
        return select ? select.value : '';
    }

    function suiteSharedOptionHtml(value, label) {
        if (!value) return '';

        return '<option value="' +
            escapeHtml(value) +
            '" label="' +
            escapeHtml(label || '') +
            '"></option>';
    }

    function renderPathSharedSuggestionDatalists(modal) {
        if (!modal) return;

        const library = loadSuiteSharedKnowledge();
        const westernEntries = library.settings.enableWesternDrugSuggestion
            ? library.westernDrugs.filter(function (item) {
                return item && item.enabled !== false;
            })
            : [];
        const chargeEntries = library.settings.enableChargeItemSuggestion
            ? library.chargeItems.filter(function (item) {
                return item && item.enabled !== false;
            })
            : [];
        const westernNameCounts = suiteSharedNameCounts(
            westernEntries,
            function (item) {
                return item && (item.name || item.searchName);
            }
        );
        const chargeNameCounts = suiteSharedNameCounts(
            chargeEntries,
            function (item) {
                return item && item.name;
            }
        );
        const westernOptions = [];
        const chargeOptions = [];
        const westernSeen = new Set();
        const chargeSeen = new Set();

        westernEntries.forEach(function (item) {
            const normalValue = suiteWesternSuggestionValue(
                item,
                westernNameCounts
            );
            const labelParts = [
                item.searchName && item.searchName !== item.name
                    ? '检索名：' + item.searchName
                    : '',
                item.specification
                    ? '规格：' + item.specification
                    : '',
                item.unit
                    ? '单位：' + item.unit
                    : '',
                item.manufacturer
                    ? '厂家：' + item.manufacturer
                    : '',
                item.code
                    ? '编码：' + item.code
                    : ''
            ].filter(Boolean);
            const normalKey = suiteSharedPlain(normalValue).toLowerCase();

            if (normalValue && normalKey && !westernSeen.has(normalKey)) {
                westernSeen.add(normalKey);
                westernOptions.push(
                    suiteSharedOptionHtml(
                        normalValue,
                        labelParts.join('｜')
                    )
                );
            }

            if (library.settings.enableWesternDrugPinyinInitials) {
                const pinyinValue = suiteWesternPinyinSuggestionValue(
                    item,
                    westernNameCounts
                );
                const pinyinKey = suiteSharedPlain(pinyinValue).toLowerCase();

                if (pinyinValue && pinyinKey && !westernSeen.has(pinyinKey)) {
                    westernSeen.add(pinyinKey);
                    westernOptions.push(
                        suiteSharedOptionHtml(
                            pinyinValue,
                            '拼音首字母' +
                                (labelParts.length
                                    ? '｜' + labelParts.join('｜')
                                    : '')
                        )
                    );
                }
            }
        });

        chargeEntries.forEach(function (item) {
            const normalValue = suiteChargeSuggestionValue(
                item,
                chargeNameCounts
            );
            const labelParts = [
                item.unit
                    ? '计价单位：' + item.unit
                    : '',
                item.price !== ''
                    ? '单价：' + item.price
                    : ''
            ].filter(Boolean);
            const normalKey = suiteSharedPlain(normalValue).toLowerCase();

            if (normalValue && normalKey && !chargeSeen.has(normalKey)) {
                chargeSeen.add(normalKey);
                chargeOptions.push(
                    suiteSharedOptionHtml(
                        normalValue,
                        labelParts.join('｜')
                    )
                );
            }

            if (library.settings.enableChargeItemPinyinInitials) {
                const pinyinValue = suiteChargePinyinSuggestionValue(
                    item,
                    chargeNameCounts
                );
                const pinyinKey = suiteSharedPlain(pinyinValue).toLowerCase();

                if (pinyinValue && pinyinKey && !chargeSeen.has(pinyinKey)) {
                    chargeSeen.add(pinyinKey);
                    chargeOptions.push(
                        suiteSharedOptionHtml(
                            pinyinValue,
                            '拼音首字母' +
                                (labelParts.length
                                    ? '｜' + labelParts.join('｜')
                                    : '')
                        )
                    );
                }
            }
        });

        ensurePathSharedSuggestionDatalist(
            modal,
            PATH_WESTERN_SUGGESTION_DATALIST_ID
        ).innerHTML = westernOptions.join('');

        ensurePathSharedSuggestionDatalist(
            modal,
            PATH_CHARGE_SUGGESTION_DATALIST_ID
        ).innerHTML = chargeOptions.join('');

        ensurePathSharedSuggestionDatalist(
            modal,
            PATH_COMBINED_SUGGESTION_DATALIST_ID
        ).innerHTML = westernOptions.concat(chargeOptions).join('');

        modal.dataset.pathSharedSuggestionBuiltAt = String(Date.now());
    }

    function pathSuggestionDatalistIdForTab(tabName, library) {
        const settings = library.settings || {};

        if (tabName === '文字录入') {
            if (
                settings.enableWesternDrugSuggestion &&
                settings.enableChargeItemSuggestion
            ) {
                return PATH_COMBINED_SUGGESTION_DATALIST_ID;
            }

            if (settings.enableWesternDrugSuggestion) {
                return PATH_WESTERN_SUGGESTION_DATALIST_ID;
            }

            if (settings.enableChargeItemSuggestion) {
                return PATH_CHARGE_SUGGESTION_DATALIST_ID;
            }

            return '';
        }

        if (
            ['药品录入', '出院带药'].includes(tabName) &&
            settings.enableWesternDrugSuggestion
        ) {
            return PATH_WESTERN_SUGGESTION_DATALIST_ID;
        }

        if (
            ['项目录入', '康复医嘱', '检验', '检查'].includes(tabName) &&
            settings.enableChargeItemSuggestion
        ) {
            return PATH_CHARGE_SUGGESTION_DATALIST_ID;
        }

        return '';
    }

    function configurePathSharedSuggestionRow(row, library) {
        if (!row) return;

        const currentLibrary = library || loadSuiteSharedKnowledge();
        const tabName = pathGuiRowTab(row);
        const listId = pathSuggestionDatalistIdForTab(
            tabName,
            currentLibrary
        );
        const controls = [
            row.querySelector('.path-gui-name'),
            row.querySelector('.path-gui-search-name')
        ].filter(Boolean);

        controls.forEach(function (control) {
            if (listId) {
                /*
                 * 原生datalist已展开时，哪怕把相同的list属性再次写入，
                 * Chrome 109等旧内核也可能立即收起候选菜单。
                 * 因此只有属性确实变化时才更新，正常聚焦和输入期间不碰DOM属性。
                 */
                if (control.getAttribute('list') !== listId) {
                    control.setAttribute('list', listId);
                }

                if (control.getAttribute('autocomplete') !== 'off') {
                    control.setAttribute('autocomplete', 'off');
                }

                if (listId === PATH_WESTERN_SUGGESTION_DATALIST_ID) {
                    control.title = currentLibrary.settings
                        .enableWesternDrugPinyinInitials
                        ? '输入药品名称、检索名、编码、别名或拼音首字母，从共享西药联想库选择。'
                        : '输入药品名称、检索名、编码或别名，从共享西药联想库选择。';
                }
                else if (listId === PATH_CHARGE_SUGGESTION_DATALIST_ID) {
                    control.title = currentLibrary.settings
                        .enableChargeItemPinyinInitials
                        ? '输入收费项目名称或拼音首字母，从共享收费项目联想库选择。'
                        : '输入收费项目名称，从共享收费项目联想库选择。';
                }
                else {
                    control.title = '可从共享西药及收费项目联想库中选择。';
                }
            }
            else {
                control.removeAttribute('list');
                control.removeAttribute('autocomplete');

                if (
                    control.title &&
                    /共享.*联想库/.test(control.title)
                ) {
                    control.removeAttribute('title');
                }
            }
        });
    }

    function configureAllPathSharedSuggestionRows(modal) {
        if (!modal) return;

        const library = loadSuiteSharedKnowledge();

        modal.querySelectorAll('.path-gui-row').forEach(function (row) {
            configurePathSharedSuggestionRow(row, library);
        });
    }

    function pathSharedSuggestionExactOption(input) {
        if (!input || !input.ownerDocument) return null;

        const listId = input.getAttribute('list');

        if (!listId) return null;

        const datalist = input.ownerDocument.getElementById(listId);

        if (!datalist) return null;

        const current = suiteSharedPlain(input.value).toLowerCase();

        if (!current) return null;

        return Array.from(datalist.options || []).find(function (option) {
            return suiteSharedPlain(option.value).toLowerCase() === current;
        }) || null;
    }

    function markPathSharedSuggestionInputEvent(input, event) {
        if (!input) return;

        const currentValue = String(input.value || '');
        const previousValue = String(
            input.dataset.pathSuggestionLastValue || ''
        );
        const exactOption = pathSharedSuggestionExactOption(input);
        const inputType = String(
            event && event.inputType || ''
        );
        const eventData =
            event && Object.prototype.hasOwnProperty.call(event, 'data')
                ? event.data
                : null;

        /*
         * 原生datalist没有可直接监听的<option>点击事件。
         * Chrome选择候选时通常会产生insertReplacementText；
         * 部分旧内核会给出空inputType/data=null。
         * 这里只把“明确替换为一个完整datalist值”记录为已选择，
         * 普通逐字输入、粘贴、IME输入以及单纯失焦都不会触发联动。
         */
        const replacementByBrowser =
            inputType === 'insertReplacementText';

        const replacementByLegacyChrome =
            Boolean(
                exactOption &&
                event &&
                event.isTrusted &&
                eventData == null &&
                !/paste|drop|composition|delete/i.test(inputType) &&
                previousValue !== currentValue &&
                (
                    input.dataset.pathSuggestionKeyboardNav === '1' ||
                    Math.abs(
                        currentValue.length - previousValue.length
                    ) > 1
                )
            );

        if (
            exactOption &&
            (
                replacementByBrowser ||
                replacementByLegacyChrome
            )
        ) {
            input.dataset.pathSuggestionChosen = '1';
            input.dataset.pathSuggestionChosenValue =
                suiteSharedPlain(input.value);
        }
        else if (
            currentValue !==
            String(
                input.dataset.pathSuggestionChosenValue || ''
            )
        ) {
            /*
             * 用户在选择联想项之后又继续手工修改，
             * 立即取消“已选择”标记，防止之后失焦误套用。
             */
            input.dataset.pathSuggestionChosen = '0';
            input.dataset.pathSuggestionChosenValue = '';
        }

        input.dataset.pathSuggestionLastValue = currentValue;
    }

    function consumePathSharedSuggestionCommit(input) {
        if (!input) return false;

        const chosen =
            input.dataset.pathSuggestionChosen === '1' &&
            suiteSharedPlain(
                input.dataset.pathSuggestionChosenValue || ''
            ) === suiteSharedPlain(input.value) &&
            Boolean(pathSharedSuggestionExactOption(input));

        input.dataset.pathSuggestionChosen = '0';
        input.dataset.pathSuggestionChosenValue = '';
        input.dataset.pathSuggestionKeyboardNav = '0';
        input.dataset.pathSuggestionLastValue =
            String(input.value || '');

        return chosen;
    }

    function applyPathSharedSuggestionToRow(input) {
        const row = input && input.closest('.path-gui-row');

        if (!row) return false;

        const tabName = pathGuiRowTab(row);
        const nameInput = row.querySelector('.path-gui-name');
        const searchInput = row.querySelector('.path-gui-search-name');
        const secondaryInput = row.querySelector(
            '.path-gui-secondary-search-name'
        );
        const unitInput = row.querySelector('.path-gui-unit');

        if (tabName === '中草药') {
            const source = suiteSharedPlain(
                input.value ||
                (searchInput ? searchInput.value : '') ||
                (nameInput ? nameInput.value : '')
            );
            const mapped = suiteResolveTcmName(source);

            if (!mapped) return false;

            if (searchInput) searchInput.value = mapped;

            if (input.classList.contains('path-gui-search-name')) {
                input.value = mapped;
            }

            return mapped !== source;
        }

        const western = PATH_WESTERN_SUGGESTION_TABS.includes(tabName)
            ? suiteResolveWesternDrug(input.value)
            : null;
        const charge = !western &&
            PATH_CHARGE_SUGGESTION_TABS.includes(tabName)
            ? suiteResolveChargeItem(input.value)
            : null;

        if (western) {
            if (nameInput) {
                nameInput.value = western.name || western.searchName || '';
            }

            if (searchInput) {
                searchInput.value = western.searchName || western.name || '';
            }

            if (unitInput && !unitInput.value.trim() && western.unit) {
                unitInput.value = western.unit;
            }

            return true;
        }

        if (!charge) return false;

        if (nameInput) nameInput.value = charge.name;

        if (tabName === '检验') {
            if (secondaryInput) secondaryInput.value = charge.name;

            if (searchInput && !searchInput.value.trim()) {
                searchInput.value = charge.name;
            }
        }
        else if (tabName === '检查') {
            if (searchInput) searchInput.value = charge.name;

            if (secondaryInput && !secondaryInput.value.trim()) {
                secondaryInput.value = charge.name;
            }
        }
        else if (searchInput) {
            searchInput.value = charge.name;
        }

        if (unitInput && !unitInput.value.trim() && charge.unit) {
            unitInput.value = charge.unit;
        }

        return true;
    }

    function applySuiteSharedKnowledgeToPathItem(rawItem) {
        const item = normalizeItem(rawItem);
        const originalName = String(item.name || '').trim();
        const originalSearchName = String(item.searchName || '').trim();
        const originalSecondarySearchName =
            String(item.secondarySearchName || '').trim();

        if (item.tab === '中草药') {
            /*
             * 中药本地化映射仍沿用原逻辑，因为该功能本身就是为了
             * 将通用药名转换为医院实际检索名。
             */
            item.searchName = suiteResolveTcmName(
                item.searchName || item.name
            ) || item.searchName || item.name;
            return item;
        }

        if (PATH_WESTERN_SUGGESTION_TABS.includes(item.tab)) {
            const western =
                suiteResolveWesternDrug(item.searchName) ||
                suiteResolveWesternDrug(item.name);

            if (western) {
                /*
                 * v1.48.12：
                 * 共享联想库只用于补全缺失字段，不再在真正执行医嘱前
                 * 强制把用户已经手工设置的“名称/指示”和“检索名称”
                 * 改回共享库标准值。
                 *
                 * 例如：
                 * name       = "脏腑疾病 推拿 59"
                 * searchName = "脏腑疾病 推拿"
                 * 必须完整保留，不能因searchName命中共享库而把name
                 * 自动重置成"脏腑疾病 推拿"。
                 */
                if (!originalName) {
                    item.name =
                        western.name ||
                        western.searchName ||
                        '';
                }

                if (!originalSearchName) {
                    item.searchName =
                        western.searchName ||
                        western.name ||
                        item.name ||
                        '';
                }

                if (!item.unit && western.unit) {
                    item.unit = western.unit;
                }

                return item;
            }
        }

        if (PATH_CHARGE_SUGGESTION_TABS.includes(item.tab)) {
            const charge =
                suiteResolveChargeItem(item.secondarySearchName) ||
                suiteResolveChargeItem(item.searchName) ||
                suiteResolveChargeItem(item.name);

            if (charge) {
                if (!originalName) {
                    item.name = charge.name || '';
                }

                if (item.tab === '检验') {
                    if (!originalSecondarySearchName) {
                        item.secondarySearchName = charge.name || '';
                    }

                    if (!originalSearchName) {
                        item.searchName =
                            charge.name ||
                            item.name ||
                            '';
                    }
                }
                else if (item.tab === '检查') {
                    if (!originalSearchName) {
                        item.searchName =
                            charge.name ||
                            item.name ||
                            '';
                    }

                    if (!originalSecondarySearchName) {
                        item.secondarySearchName =
                            charge.name ||
                            '';
                    }
                }
                else if (!originalSearchName) {
                    item.searchName =
                        charge.name ||
                        item.name ||
                        '';
                }

                if (!item.unit && charge.unit) {
                    item.unit = charge.unit;
                }
            }
        }

        return item;
    }

    function refreshPathSharedSuggestionData(modal) {
        if (!modal) return;

        renderPathSharedSuggestionDatalists(modal);
        configureAllPathSharedSuggestionRows(modal);
    }

    function bindPathSharedSuggestions(modal) {
        const body = modal.querySelector('.path-gui-body');

        if (!body || body.dataset.sharedSuggestionsBound === '1') return;

        body.dataset.sharedSuggestionsBound = '1';

        /*
         * 联想属性已在renderGroupGui、标签类型变更和共享库刷新时配置。
         * 此处不在focusin时重复setAttribute('list', ...)，避免原生
         * datalist刚打开就被Chrome判定为数据源发生变化而自动关闭。
         *
         * v1.48.12：
         * “输入框change/blur”与“用户真正选中datalist候选项”彻底分离。
         * 单纯点击外部失去焦点只保存用户原文，不再套用共享联想项。
         */
        body.addEventListener('focusin', function (event) {
            const input = event.target.closest(
                '.path-gui-name,.path-gui-search-name'
            );

            if (!input) return;

            clearTimeout(modal.pathGuiSyncTimer);
            modal.pathActiveSuggestionInput = input;

            input.dataset.pathSuggestionLastValue =
                String(input.value || '');
            input.dataset.pathSuggestionChosen = '0';
            input.dataset.pathSuggestionChosenValue = '';
            input.dataset.pathSuggestionKeyboardNav = '0';
        });

        body.addEventListener(
            'keydown',
            function (event) {
                const input = event.target.closest(
                    '.path-gui-name,.path-gui-search-name'
                );

                if (!input) return;

                if (
                    event.key === 'ArrowDown' ||
                    event.key === 'ArrowUp' ||
                    event.keyCode === 40 ||
                    event.keyCode === 38
                ) {
                    input.dataset.pathSuggestionKeyboardNav = '1';
                }
                else if (
                    event.key === 'Escape' ||
                    event.keyCode === 27
                ) {
                    input.dataset.pathSuggestionKeyboardNav = '0';
                    input.dataset.pathSuggestionChosen = '0';
                    input.dataset.pathSuggestionChosenValue = '';
                }
            },
            true
        );

        body.addEventListener(
            'input',
            function (event) {
                const input = event.target.closest(
                    '.path-gui-name,.path-gui-search-name'
                );

                if (!input) return;

                markPathSharedSuggestionInputEvent(
                    input,
                    event
                );
            },
            true
        );

        body.addEventListener('focusout', function (event) {
            const input = event.target.closest(
                '.path-gui-name,.path-gui-search-name'
            );

            if (!input) return;

            window.setTimeout(function () {
                if (modal.pathActiveSuggestionInput === input) {
                    modal.pathActiveSuggestionInput = null;
                }

                /*
                 * 离开联想输入框只做草稿同步。
                 * 是否需要把联想项写入同一行其他字段，由change监听器
                 * 根据“已明确选择候选”标记单独决定。
                 */
                const activeElement =
                    modal.ownerDocument.activeElement;

                if (
                    activeElement &&
                    activeElement.matches &&
                    activeElement.matches(
                        '.path-gui-name,.path-gui-search-name'
                    ) &&
                    body.contains(activeElement)
                ) {
                    return;
                }

                readGroupGui(modal, false);
            }, 0);
        });
    }


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
        'medicalClinicalPathwayGlmApiKeyV1';
    const SUITE_GLOBAL_AI_OPENAI_API_KEY_GM_KEY =
        'medicalClinicalPathwayOpenAiApiKeyV1';
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
        key: 'pathway',
        name: '临床路径组套',
        version: '1.48.33',
        getDeepSeekKey: function () {
            return String(GM_getValue(KEYS.deepSeekApiKey, '') || '').trim();
        },
        setDeepSeekKey: function (value) {
            GM_setValue(KEYS.deepSeekApiKey, value);
        }
    });


    const DEFAULT_DEEPSEEK_MODEL =
        'deepseek-chat';

    const DEFAULT_CURRENT_PAGE_ORDER_EXTRACT_PROMPT = [
        '检查：测血压 bid 、心电图 、血常规 、尿常规 、肝肾功血脂',
        '药物：0.9%氯化钠注射液 250ml + 天麻素注射液 0.6g ivdrip qd   阿司匹林肠溶片 100mg po qd   瑞舒伐他汀钙片 10mg po qd   缬沙坦胶囊 80mg po qd   消痛贴膏 1.2g 外用 qd',
        '中医：针灸(推拿) 、艾灸',
        '请根据我提供给你的长期医嘱单和临时医嘱单，严格按照以上格式模板进行书写，但不要引用以上模板的内容，检查部分包括测血压qd或者bid，心电图、血常规、尿常规、肝肾功血脂等，各类影像学检查等，包括但不仅限于此，药物部分先书写液体后书写口服药，包括剂量服药方式频次，中医部分常规针法、特殊穴位、仪器针法统一归纳为针灸，xx疾病推拿、悬空灸统一归纳为推拿，隔物灸统一归纳为艾灸'
    ].join('\n');

    const DEFAULT_CURRENT_PAGE_DIAGNOSIS_EXTRACT_PROMPT =
        '按照1.2.3.的序号顺序罗列入院记录所有诊断，一行一个诊断，排头不留空，只写西医诊断';

    /******************************************************************
     * 跨脚本只读提示词/行为桥接接口
     *
     * v1.48.23：查房本不仅需要读取两个提示词，还必须与本脚本当前
     * “固化提示词”状态保持一致。因此桥接接口同时公开：
     * 1. 当前提示词；
     * 2. 是否固化；
     * 3. 当前实际使用的systemPrompt。
     *
     * 固化=true：沿用历史完整业务systemPrompt；
     * 固化=false：只保留事实约束与JSON返回格式，具体业务规则完全交给
     * 自定义提示词。接口只读，不暴露API Key，也不允许跨脚本修改设置。
     ******************************************************************/
    const CLINICAL_PATHWAY_PROMPT_BRIDGE_NAME =
        'MedicalClinicalPathwayPromptBridgeV1';

    function clinicalPathwayPromptBridgePage() {
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
                return unsafeWindow;
            }
        } catch (error) {
            // 回退到当前 window。
        }
        return window;
    }

    function clinicalPathwayNormalizePromptKind(kind) {
        const target = String(kind || '').trim().toLowerCase();

        if (target === 'diagnosis' || target === 'diagnosis-extract') {
            return 'diagnosis';
        }

        if (
            target === 'order' ||
            target === 'orders' ||
            target === 'order-extract'
        ) {
            return 'order';
        }

        return '';
    }

    function clinicalPathwayPromptDefinition(kind) {
        const normalized = clinicalPathwayNormalizePromptKind(kind);

        if (normalized === 'diagnosis') {
            return {
                kind: 'diagnosis',
                promptSelector: '.path-ai-diagnosis-extract-prompt',
                solidifySelector: '.path-ai-diagnosis-extract-solidify',
                promptKey: KEYS.aiDiagnosisExtractPrompt,
                solidifyKey: KEYS.aiDiagnosisExtractPromptSolidified,
                fallbackPrompt: DEFAULT_CURRENT_PAGE_DIAGNOSIS_EXTRACT_PROMPT
            };
        }

        if (normalized === 'order') {
            return {
                kind: 'order',
                promptSelector: '.path-ai-order-extract-prompt',
                solidifySelector: '.path-ai-order-extract-solidify',
                promptKey: KEYS.aiOrderExtractPrompt,
                solidifyKey: KEYS.aiOrderExtractPromptSolidified,
                fallbackPrompt: DEFAULT_CURRENT_PAGE_ORDER_EXTRACT_PROMPT
            };
        }

        return null;
    }

    function clinicalPathwayCurrentPrompt(kind) {
        const definition = clinicalPathwayPromptDefinition(kind);

        if (!definition) {
            throw new Error('不支持的临床路径提示词类型：' + String(kind || ''));
        }

        const modal = document.getElementById(IDS.modal);
        const input = modal && modal.querySelector(definition.promptSelector);
        const liveValue = String(input && input.value || '').trim();

        if (liveValue) return liveValue;

        return String(
            GM_getValue(
                definition.promptKey,
                definition.fallbackPrompt
            ) || definition.fallbackPrompt
        ).trim() || definition.fallbackPrompt;
    }

    function clinicalPathwayPromptSolidified(kind) {
        const definition = clinicalPathwayPromptDefinition(kind);

        if (!definition) {
            throw new Error('不支持的临床路径提示词类型：' + String(kind || ''));
        }

        const modal = document.getElementById(IDS.modal);
        const checkbox = modal && modal.querySelector(
            definition.solidifySelector
        );

        if (checkbox) {
            return Boolean(checkbox.checked);
        }

        /*
         * v1.48.22以前相当于始终固化。新开关首次出现时默认true，
         * 从而保证升级后原有提取行为不发生静默变化。
         */
        return GM_getValue(
            definition.solidifyKey,
            true
        ) !== false;
    }

    function clinicalPathwaySystemPrompt(kind, solidified) {
        const normalized = clinicalPathwayNormalizePromptKind(kind);
        const locked = solidified !== false;

        if (normalized === 'diagnosis') {
            if (!locked) {
                return [
                    '你是文本信息整理助手。',
                    '用户提供的customPrompt是本次任务的主要业务规则，必须严格执行。',
                    '只可依据用户提供的currentPageText处理信息，不得凭空增加原文没有明确支持的事实。',
                    '除上述事实约束外，不额外限定诊断类型、中西医范围、编号方式、排序方式、疾病名称改写方式或输出措辞；这些均以customPrompt为准。',
                    '必须只输出JSON对象，格式固定为：{"text":"按customPrompt整理后的纯文本"}'
                ].join('\n');
            }

            return [
                '你是中国医院住院病历基本诊断信息整理助手。',
                '必须只依据用户提供的当前页面文本提取，不得补充、猜测、扩展或根据药物、检查结果反推诊断。',
                '必须严格执行用户提供的自定义提示词。',
                '当自定义提示词要求提取入院记录诊断时，只提取页面明确出现的入院诊断、初步诊断或与入院诊断明确对应的西医诊断；不得把出院诊断、中医病名、中医证候、症状、体征、检查项目、药物和治疗措施混入。',
                '诊断原文中若带“待查”“疑似”“考虑”等不确定性表述，必须原样保留，不得擅自改成确诊。',
                '不得自行合并、拆分、改写疾病名称，不得增加页面没有明确出现的疾病。',
                '默认规则下按1.2.3.连续编号，一行一个诊断，行首不留空格，只写西医诊断；若自定义提示词另有明确格式要求，则以自定义提示词为准。',
                '如果页面中没有可确认的目标诊断，输出“未识别到明确西医诊断”。',
                '输出必须是可直接复制到病历中的纯文本，不使用Markdown标题、项目符号或代码块。',
                '必须只输出JSON对象，格式固定为：{"text":"整理后的纯文本"}'
            ].join('\n');
        }

        if (normalized === 'order') {
            if (!locked) {
                return [
                    '你是文本信息整理助手。',
                    '用户提供的customPrompt是本次任务的主要业务规则，必须严格执行。',
                    '只可依据用户提供的currentPageOrders处理信息，不得凭空增加原始医嘱中没有明确支持的事实。',
                    '除上述事实约束外，不额外限定检查、药物、中医治疗的归纳方式、输出顺序、格式或措辞；这些均以customPrompt为准。',
                    '必须只输出JSON对象，格式固定为：{"text":"按customPrompt整理后的纯文本"}'
                ].join('\n');
            }

            return [
                '你是中国医院住院医嘱关键信息整理助手。',
                '必须只依据用户提供的当前页医嘱整理，不得补充、猜测或引用不存在的医嘱。',
                '必须严格执行用户提供的自定义整理提示词；提示词中的示例内容只用于规定格式，若当前医嘱中不存在，不得抄入结果。',
                '药品名称、剂量、单位、用法、频次及液体组号关系应尽量忠实保留。',
                '对常规针法、特殊穴位、仪器针法、推拿、悬空灸、隔物灸等中医治疗，按用户提示词指定的归纳规则处理。',
                '不得进行用药合理性评价，不得自行新增诊断、检查、药物或治疗。',
                '输出应为可直接复制到病历中的纯文本，不使用Markdown标题、项目符号或代码块。',
                '必须只输出JSON对象，格式固定为：{"text":"整理后的纯文本"}'
            ].join('\n');
        }

        throw new Error('不支持的临床路径提示词类型：' + String(kind || ''));
    }

    function clinicalPathwayPromptConfig(kind) {
        const normalized = clinicalPathwayNormalizePromptKind(kind);

        if (!normalized) {
            throw new Error('不支持的临床路径提示词类型：' + String(kind || ''));
        }

        const solidified = clinicalPathwayPromptSolidified(normalized);

        return {
            kind: normalized,
            prompt: clinicalPathwayCurrentPrompt(normalized),
            solidified: solidified,
            mode: solidified ? 'solidified' : 'flexible',
            systemPrompt: clinicalPathwaySystemPrompt(
                normalized,
                solidified
            )
        };
    }

    function installClinicalPathwayPromptBridge() {
        const page = clinicalPathwayPromptBridgePage();
        const api = {
            apiVersion: 2,
            scriptVersion: '1.48.23',
            readOnly: true,
            getPrompt: function (kind) {
                return clinicalPathwayPromptConfig(kind).prompt;
            },
            isSolidified: function (kind) {
                return clinicalPathwayPromptConfig(kind).solidified;
            },
            getPromptConfig: function (kind) {
                return Object.assign({}, clinicalPathwayPromptConfig(kind));
            },
            getPrompts: function () {
                return {
                    diagnosis: clinicalPathwayCurrentPrompt('diagnosis'),
                    order: clinicalPathwayCurrentPrompt('order')
                };
            },
            getPromptConfigs: function () {
                return {
                    diagnosis: Object.assign(
                        {},
                        clinicalPathwayPromptConfig('diagnosis')
                    ),
                    order: Object.assign(
                        {},
                        clinicalPathwayPromptConfig('order')
                    )
                };
            }
        };

        try {
            Object.defineProperty(
                page,
                CLINICAL_PATHWAY_PROMPT_BRIDGE_NAME,
                {
                    configurable: true,
                    enumerable: false,
                    writable: false,
                    value: api
                }
            );
        } catch (error) {
            page[CLINICAL_PATHWAY_PROMPT_BRIDGE_NAME] = api;
        }

        try {
            document.dispatchEvent(
                new CustomEvent(
                    'medical-clinical-pathway-prompt-bridge-ready',
                    {
                        detail: {
                            apiVersion: 2,
                            scriptVersion: '1.48.23'
                        }
                    }
                )
            );
        } catch (error) {
            // 旧浏览器事件失败不影响直接 API 调用。
        }

        return api;
    }

    const STYLE = {
        header: '#117fac',
        modalHeader: '#24a7df',
        primary: '#159bd3',
        primaryHover: '#118bc0',
        secondaryBorder: '#b9d9e7'
    };

    const TAB_NAMES = [
        '药品录入', '中草药', '出院带药', '文字录入', '项目录入',
        '耗材', '康复医嘱', '检验', '检查'
    ];

    const APPLICATION_TABS = [
        '检验',
        '检查'
    ];

    function isApplicationTab(tabName) {
        return APPLICATION_TABS.includes(
            tabName
        );
    }

    const FIELD_ALIASES = {
        orderType: ['长临', '长临嘱', '长临医嘱', '医嘱类型'],
        groupNo: ['组号', '组别'],
        name: ['名称', '药名', '指示', '收费项目', '项目名称', '医嘱名称', '耗材名称', '康复项目', '检验项目', '检查项目'],
        startTime: ['开始时间', '开立时间'],
        spec: ['规格', '型号'],
        price: ['单价', '价格'],
        doseCount: ['剂数'],
        dose: ['剂量', '每次剂量', '每次治疗量', '治疗量'],
        amount: ['金额', '费用'],
        unit: ['单位', '剂量单位', '用量单位'],
        route: ['用法', '给药途径'],
        frequency: ['频次', '频率'],
        days: ['天数', '疗程天数'],
        total: ['总量'],
        quantity: ['数量', '次数', '用量'],
        selfPay: ['自付比例', '自付'],
        instruction: ['嘱托', '备注', '说明'],
        decoction: ['代煎'],
        dischargeFlag: ['出院带药', '带药'],
        transferSelfPay: ['转自费'],
        billing: ['计费'],
        operation: ['操作'],
        specimen: ['标本', '标本类型', '采样标本'],
        bodyPart: ['部位', '检查部位', '采集部位'],
        department: ['执行科室', '科室']
    };

    const TAB_DEFS = {
        '药品录入': {
            required: [['名称', '药名'], ['剂量'], ['用法'], ['频次'], ['操作']],
            lookup: true,
            nameAliases: ['名称', '药名'],
            fallback: { orderType: 1, groupNo: 2, name: 3, startTime: 4, spec: 5, dose: 6, unit: 7, route: 8, frequency: 11, days: 13, total: 14, selfPay: 16, instruction: 17, transferSelfPay: 19, billing: 20, operation: 22 }
        },
        '中草药': {
            required: [['名称'], ['剂数'], ['剂量'], ['用法'], ['代煎'], ['操作']],
            lookup: true,
            nameAliases: ['名称'],
            fallback: { groupNo: 1, name: 2, startTime: 3, spec: 4, doseCount: 5, dose: 6, unit: 7, route: 8, selfPay: 9, instruction: 10, decoction: 11, dischargeFlag: 12, transferSelfPay: 13, billing: 14, operation: 16 }
        },
        '出院带药': {
            required: [['药名', '名称'], ['剂量'], ['用法'], ['频次'], ['操作']],
            lookup: true,
            nameAliases: ['药名', '名称'],
            fallback: {}
        },
        '文字录入': {
            required: [['指示'], ['频次'], ['操作']],
            lookup: false,
            nameAliases: ['指示'],
            fallback: { orderType: 1, name: 2, startTime: 3, frequency: 4, days: 5, instruction: 6, operation: 7 }
        },
        '项目录入': {
            required: [['收费项目'], ['执行科室'], ['每次治疗量'], ['频次'], ['操作']],
            lookup: true,
            nameAliases: ['收费项目', '项目名称', '名称'],
            fallback: {
                orderType: 1,
                name: 2,
                department: 3,
                price: 4,
                startTime: 5,
                unit: 6,
                selfPay: 7,
                dose: 8,
                frequency: 9,
                amount: 10,
                days: 11,
                bodyPart: 12,
                instruction: 13,
                transferSelfPay: 14,
                billing: 15,
                operation: 16
            }
        },
        '耗材': { required: [['名称', '耗材名称'], ['操作']], lookup: true, nameAliases: ['耗材名称', '名称'], fallback: {} },
        '康复医嘱': {
            required: [['收费项目'], ['执行科室'], ['每次治疗量'], ['频次'], ['操作']],
            lookup: true,
            nameAliases: ['收费项目', '项目名称', '名称', '指示'],
            fallback: {
                orderType: 1,
                name: 2,
                department: 3,
                startTime: 4,
                unit: 5,
                selfPay: 6,
                dose: 7,
                frequency: 8,
                days: 9,
                bodyPart: 10,
                instruction: 11,
                transferSelfPay: 12,
                billing: 13,
                operation: 14
            }
        },
        '检验': { required: [['名称', '项目名称', '检验项目'], ['操作']], lookup: true, nameAliases: ['检验项目', '项目名称', '名称'], fallback: {} },
        '检查': { required: [['名称', '项目名称', '检查项目'], ['操作']], lookup: true, nameAliases: ['检查项目', '项目名称', '名称'], fallback: {} }
    };

    /*
     * 新版住院中草药表格只保留每味药自身字段；剂数、用法、代煎、
     * 出院带药、转自费和计费均移动到表格下方统一设置。
     * 表头坐标暂时不可用时按当前新版页面的真实列顺序兜底。
     */
    const HERB_UNIFIED_FOOTER_FALLBACK = {
        name: 1,
        startTime: 2,
        spec: 3,
        dose: 4,
        unit: 5,
        selfPay: 6,
        instruction: 7,
        operation: 8
    };

    const DEFAULT_LIBRARY = {
        schemaVersion: 1,
        categories: [{
            id: 'category-default',
            name: '未分类',
            pathways: [{
                id: 'pathway-empty',
                name: '空白临床路径',
                version: '1.0',
                description: '请根据本院病种路径自行建立组套。本脚本不预置具体诊疗方案。',
                groups: [{ id: 'group-admission', name: '入院阶段', enabled: true, items: [] }]
            }]
        }]
    };

    const state = {
        library: null,
        running: false,
        paused: false,
        abortRequested: false,
        bulkDeletingOrders: false,
        checkPopupSession: null,
        checkPopupPool: [],
        checkPopupCursor: 0,
        scanResults: [],
        ignoreDuplicateMedicationPrompt: false,
        suppressCheckApplicationPopup: false,
        suppressLabApplicationPopup: false,
        duplicateMedicationPromptConfirmCount: 0,
        aiBusy: false,
        aiTaskType: '',
        aiGeneratedResult: null,
        aiAuditResult: null,
        aiAuditManualResult: '',
        aiOrderExtractResult: '',
        aiOrderExtractSource: '',
        aiDiagnosisExtractResult: '',
        aiDiagnosisExtractSource: '',
        orderImportSource: '',
        orderImportSourceLabel: '',
        orderImportSourcePatientLabel: '',
        orderImportOrigin: '',
        orderImportItems: [],
        orderImportAiBusy: false,
        orderImportSelectedId: '',
        generalWarningResults: [],
        generalWarningContext: null,
        generalWarningObserver: null,
        generalWarningObservedRoot: null,
        generalWarningScanTimer: null,
        generalWarningFallbackTimer: null,
        generalWarningRenderedCells: new Set(),
        generalWarningLastSignature: '',
        generalWarningLastScanAt: 0,
        generalWarningBusy: false,
        generalWarningDirty: true,
        generalWarningVisibilityBound: false,
        /*
         * v1.48.4：扫描过程中如果又收到标签切换/DOM变化触发，
         * 不再直接丢弃，而是在当前扫描结束后自动补扫一次。
         */
        generalWarningPendingScan: null,
        localOrderDeleteObserver: null,
        localOrderDeleteObservedRoot: null,
        localOrderDeleteGlobalObserver: null,
        localOrderDeleteTimer: null,
        localOrderDeleteApplying: false
    };

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const makeId = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const clone = value => JSON.parse(JSON.stringify(value));
    const plain = value => String(value || '').replace(/\s+/g, ' ').trim();
    const normalize = value => String(value || '').replace(/\s+/g, '').replace(/[：:*＊★☆]/g, '').replace(/（/g, '(').replace(/）/g, ')').trim().toLowerCase();
    const escapeHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function normalizeItem(raw) {
        const source = raw && typeof raw === 'object'
            ? raw
            : {};
        const customFields =
            source.customFields &&
            typeof source.customFields === 'object' &&
            !Array.isArray(source.customFields)
                ? source.customFields
                : {};

        return {
            id: source.id || makeId('item'),
            enabled: source.enabled !== false,
            tab: TAB_NAMES.includes(source.tab)
                ? source.tab
                : '文字录入',
            orderType: /^(临|临时|st)$/i.test(
                String(source.orderType || '')
            )
                ? '临'
                : '长',
            name: String(source.name || '').trim(),
            searchName: String(
                source.searchName ||
                source.name ||
                ''
            ).trim(),
            secondarySearchName: String(
                source.secondarySearchName ||
                source.labTreeSearchName ||
                source.treeSearchName ||
                source.secondaryName ||
                customFields['二级目录检索名称'] ||
                customFields['二级目录'] ||
                ''
            ).trim(),
            department: String(
                source.department ||
                customFields['执行科室'] ||
                customFields.department ||
                ''
            ).trim(),
            groupNo: String(source.groupNo || '').trim(),
            dose:
                Number.isFinite(Number(source.dose)) &&
                Number(source.dose) > 0
                    ? Number(source.dose)
                    : '',
            unit: String(source.unit || '').trim(),
            route: String(source.route || '').trim(),
            frequency: String(
                source.frequency || ''
            ).trim(),
            days:
                Number.isFinite(Number(source.days)) &&
                Number(source.days) > 0
                    ? Number(source.days)
                    : '',
            quantity:
                Number.isFinite(Number(source.quantity)) &&
                Number(source.quantity) > 0
                    ? Number(source.quantity)
                    : '',
            total:
                Number.isFinite(Number(source.total)) &&
                Number(source.total) > 0
                    ? Number(source.total)
                    : '',
            doseCount:
                Number.isFinite(Number(source.doseCount)) &&
                Number(source.doseCount) > 0
                    ? Number(source.doseCount)
                    : 7,
            decoctionMode: [
                '代煎',
                '自煎',
                '外用',
                '冲服'
            ].includes(source.decoctionMode)
                ? source.decoctionMode
                : '自煎',
            instruction: String(
                source.instruction || ''
            ).trim(),
            specimen: String(source.specimen || '').trim(),
            bodyPart: String(source.bodyPart || '').trim(),
            selfPayMode:
                source.selfPayMode === 'keep'
                    ? 'keep'
                    : 'min',
            dischargeFlag: String(
                source.dischargeFlag || '否'
            ).trim(),
            transferSelfPay: String(
                source.transferSelfPay || '否'
            ).trim(),
            billing: String(
                source.billing || '是'
            ).trim(),
            customFields: customFields,
            status: String(source.status || '').trim()
        };
    }

    function normalizeLibrary(raw) {
        const library = raw && typeof raw === 'object' ? clone(raw) : clone(DEFAULT_LIBRARY);
        if (!Array.isArray(library.categories) || !library.categories.length) return clone(DEFAULT_LIBRARY);
        library.schemaVersion = 1;
        library.categories = library.categories.map(category => ({
            id: category.id || makeId('category'),
            name: String(category.name || '未命名分类').trim(),
            pathways: (Array.isArray(category.pathways) && category.pathways.length ? category.pathways : [{ name: '空白临床路径' }]).map(pathway => ({
                id: pathway.id || makeId('pathway'),
                name: String(pathway.name || '未命名路径').trim(),
                version: String(pathway.version || '1.0').trim(),
                description: String(pathway.description || '').trim(),
                groups: (Array.isArray(pathway.groups) && pathway.groups.length ? pathway.groups : [{ name: '入院阶段', items: [] }]).map(group => ({
                    id: group.id || makeId('group'),
                    name: String(group.name || '未命名组套').trim(),
                    enabled: group.enabled !== false,
                    items: (Array.isArray(group.items) ? group.items : []).map(normalizeItem)
                }))
            }))
        }));
        return library;
    }

    function extractDeepSeekJson(textValue) {
        const content =
            String(textValue || '')
                .trim();

        try {
            return JSON.parse(content);
        }
        catch (firstError) {
            const clean =
                content
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
                return JSON.parse(clean);
            }
            catch (secondError) {
                const objectStart =
                    clean.indexOf('{');
                const objectEnd =
                    clean.lastIndexOf('}');
                const arrayStart =
                    clean.indexOf('[');
                const arrayEnd =
                    clean.lastIndexOf(']');

                if (
                    objectStart >= 0 &&
                    objectEnd > objectStart
                ) {
                    return JSON.parse(
                        clean.slice(
                            objectStart,
                            objectEnd + 1
                        )
                    );
                }

                if (
                    arrayStart >= 0 &&
                    arrayEnd > arrayStart
                ) {
                    return JSON.parse(
                        clean.slice(
                            arrayStart,
                            arrayEnd + 1
                        )
                    );
                }

                throw secondError;
            }
        }
    }

    function orderImportJsonItem(item) {
        const normalized = normalizeOrderImportItem(item);
        return Object.assign(
            {
                id: normalized.id,
                enabled: normalized.enabled !== false
            },
            aiItemPayload(normalized),
            {
                customFields: clone(normalized.customFields || {}),
                status: normalized.status || ''
            }
        );
    }

    function syncOrderImportJsonEditor(modal, force) {
        const editor = modal && modal.querySelector(
            '.path-order-import-json-editor'
        );
        if (!editor) return;
        if (!force && document.activeElement === editor) return;
        const textValue = JSON.stringify({
            items: state.orderImportItems.map(orderImportJsonItem)
        }, null, 2);
        editor.value = textValue;
        editor.dataset.lastSyncedJson = textValue;
        const status = modal.querySelector(
            '.path-order-import-json-status'
        );
        if (status) {
            status.textContent = 'JSON与住院医嘱图形化草稿已同步。';
            status.dataset.type = 'success';
        }
    }

    function applyOrderImportJsonEditor(modal, showMessage) {
        const editor = modal && modal.querySelector(
            '.path-order-import-json-editor'
        );
        if (!editor) return false;
        try {
            const rawJson = editor.value || '{"items":[]}';
            const jsonChanged = rawJson !== (editor.dataset.lastSyncedJson || '');
            const parsed = JSON.parse(rawJson);
            const list = Array.isArray(parsed)
                ? parsed
                : parsed && parsed.items;
            if (!Array.isArray(list)) {
                throw new Error('根节点必须是数组或包含items数组的对象');
            }
            state.orderImportItems = list.slice(0, 500).map(function (item) {
                return normalizeOrderImportItem(item);
            });
            if (jsonChanged) {
                state.orderImportSource = rawJson;
                state.orderImportSourceLabel = 'JSON手动编辑';
                state.orderImportSourcePatientLabel = '';
            }
            else {
                state.orderImportSourceLabel =
                    state.orderImportSourceLabel || 'JSON手动编辑';
            }
            state.orderImportOrigin = 'json';
            renderOrderImportPreview(
                modal,
                state.orderImportItems,
                state.orderImportSourceLabel,
                state.orderImportOrigin,
                true
            );
            if (showMessage !== false) {
                setOrderImportStatus(
                    modal,
                    'JSON已应用到住院医嘱图形化草稿，共' +
                        state.orderImportItems.length + '条。',
                    'success'
                );
            }
            return true;
        }
        catch (error) {
            const status = modal.querySelector(
                '.path-order-import-json-status'
            );
            if (status) {
                status.textContent = 'JSON错误：' + error.message;
                status.dataset.type = 'error';
            }
            if (showMessage !== false) {
                setOrderImportStatus(
                    modal,
                    'JSON代码无法应用：' + error.message,
                    'error'
                );
            }
            return false;
        }
    }

    function setOrderImportEditorMode(modal, mode, save) {
        const card = modal && modal.querySelector('.path-order-import-card');
        if (!card) return false;
        const target = mode === 'json' ? 'json' : 'gui';
        const current = card.dataset.editorMode || 'gui';
        if (target === 'json' && current !== 'json') {
            collectOrderImportPreviewItems(modal);
            syncOrderImportJsonEditor(modal, true);
        }
        if (target === 'gui' && current === 'json') {
            if (!applyOrderImportJsonEditor(modal, false)) return false;
        }
        card.dataset.editorMode = target;
        card.classList.toggle('path-order-import-json-mode', target === 'json');
        const guiButton = modal.querySelector('.path-order-import-mode-gui');
        const jsonButton = modal.querySelector('.path-order-import-mode-json');
        if (guiButton) {
            guiButton.classList.toggle('active', target === 'gui');
            guiButton.setAttribute('aria-pressed', target === 'gui' ? 'true' : 'false');
        }
        if (jsonButton) {
            jsonButton.classList.toggle('active', target === 'json');
            jsonButton.setAttribute('aria-pressed', target === 'json' ? 'true' : 'false');
        }
        if (save !== false) {
            GM_setValue(KEYS.inpatientOrderEditorMode, target);
        }
        return true;
    }

    function setOrderImportSecondaryVisible(modal, visible, save) {
        const card = modal && modal.querySelector('.path-order-import-card');
        const button = modal && modal.querySelector(
            '.path-order-import-toggle-secondary'
        );
        if (!card) return;
        card.classList.toggle(
            'path-order-import-secondary-visible',
            Boolean(visible)
        );
        if (button) {
            button.textContent = visible ? '隐藏二级目录' : '显示二级目录';
            button.classList.toggle('active', Boolean(visible));
            button.setAttribute('aria-pressed', visible ? 'true' : 'false');
        }
        if (save !== false) {
            GM_setValue(
                KEYS.inpatientOrderSecondaryDirectoryVisible,
                Boolean(visible)
            );
        }
    }

    function setOrderImportSelectedRow(modal, itemId) {
        state.orderImportSelectedId = itemId || '';
        modal.querySelectorAll('.path-order-import-row').forEach(function (row) {
            row.classList.toggle(
                'selected',
                Boolean(itemId) && row.dataset.itemId === itemId
            );
        });
    }

    function insertBlankOrderImportItem(modal, afterSelected) {
        if (state.running || state.aiBusy) return;
        const card = modal.querySelector('.path-order-import-card');
        if (
            card &&
            card.dataset.editorMode === 'json' &&
            !applyOrderImportJsonEditor(modal, true)
        ) return;
        collectOrderImportPreviewItems(modal);
        const item = normalizeOrderImportItem({
            id: makeId('item'),
            enabled: true,
            tab: '文字录入',
            orderType: '长',
            name: '',
            searchName: '',
            frequency: ''
        });
        let index = state.orderImportItems.length;
        if (afterSelected && state.orderImportSelectedId) {
            const selectedIndex = state.orderImportItems.findIndex(
                function (entry) {
                    return entry.id === state.orderImportSelectedId;
                }
            );
            if (selectedIndex >= 0) index = selectedIndex + 1;
        }
        state.orderImportItems.splice(index, 0, item);
        state.orderImportSelectedId = item.id;
        state.orderImportSourceLabel =
            state.orderImportSourceLabel || '手动建立的住院医嘱草稿';
        renderOrderImportPreview(
            modal,
            state.orderImportItems,
            state.orderImportSourceLabel,
            state.orderImportOrigin || 'manual',
            true
        );
        const row = modal.querySelector(
            '.path-order-import-row[data-item-id="' +
            CSS.escape(item.id) + '"]'
        );
        const input = row && row.querySelector('.path-order-import-name');
        if (row) row.scrollIntoView({ block: 'nearest' });
        if (input) input.focus();
    }

    function deleteEnabledOrderImportItems(modal) {
        const card = modal.querySelector('.path-order-import-card');
        if (
            card &&
            card.dataset.editorMode === 'json' &&
            !applyOrderImportJsonEditor(modal, true)
        ) return;
        collectOrderImportPreviewItems(modal);
        const count = state.orderImportItems.filter(function (item) {
            return item.enabled !== false;
        }).length;
        if (!count) {
            setOrderImportStatus(modal, '没有已勾选的住院医嘱草稿。', 'warning');
            return;
        }
        if (!window.confirm('确认删除已勾选的' + count + '条住院医嘱草稿吗？')) {
            return;
        }
        state.orderImportItems = state.orderImportItems.filter(function (item) {
            return item.enabled === false;
        });
        state.orderImportSelectedId = '';
        renderOrderImportPreview(
            modal,
            state.orderImportItems,
            state.orderImportSourceLabel,
            state.orderImportOrigin,
            true
        );
        setOrderImportStatus(modal, '已删除勾选草稿，剩余' + state.orderImportItems.length + '条。', 'success');
    }

    function closeOrderImportAdvancedEditor(modal) {
        const layer = modal && modal.querySelector(
            '.path-order-import-advanced-layer'
        );
        if (layer) layer.classList.remove('show');
    }

    function openOrderImportAdvancedEditor(modal, itemId) {
        collectOrderImportPreviewItems(modal);
        const item = state.orderImportItems.find(function (entry) {
            return entry.id === itemId;
        });
        const layer = modal.querySelector('.path-order-import-advanced-layer');
        if (!item || !layer) return;
        layer.dataset.itemId = item.id;
        layer.querySelector('.path-order-import-advanced-name').textContent =
            item.name || '未命名住院医嘱';
        layer.querySelector('.path-order-import-advanced-quantity').value = item.quantity || '';
        layer.querySelector('.path-order-import-advanced-total').value = item.total || '';
        layer.querySelector('.path-order-import-advanced-dose-count').value = item.doseCount || 7;
        layer.querySelector('.path-order-import-advanced-decoction').value = item.decoctionMode || '自煎';
        layer.querySelector('.path-order-import-advanced-specimen').value = item.specimen || '';
        layer.querySelector('.path-order-import-advanced-body-part').value = item.bodyPart || '';
        layer.querySelector('.path-order-import-advanced-self-pay').value = item.selfPayMode || 'min';
        layer.querySelector('.path-order-import-advanced-discharge').value = item.dischargeFlag || '否';
        layer.querySelector('.path-order-import-advanced-transfer').value = item.transferSelfPay || '否';
        layer.querySelector('.path-order-import-advanced-billing').value = item.billing || '是';
        layer.querySelector('.path-order-import-advanced-custom').value = JSON.stringify(item.customFields || {}, null, 2);
        layer.classList.add('show');
    }

    function saveOrderImportAdvancedEditor(modal) {
        const layer = modal.querySelector('.path-order-import-advanced-layer');
        if (!layer) return false;
        const index = state.orderImportItems.findIndex(function (entry) {
            return entry.id === layer.dataset.itemId;
        });
        if (index < 0) return false;
        let customFields;
        try {
            customFields = JSON.parse(
                layer.querySelector('.path-order-import-advanced-custom').value || '{}'
            );
            if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) {
                throw new Error('自定义字段必须是JSON对象');
            }
        }
        catch (error) {
            setOrderImportStatus(modal, '高级设置JSON错误：' + error.message, 'error');
            return false;
        }
        const old = state.orderImportItems[index];
        state.orderImportItems[index] = normalizeOrderImportItem(Object.assign({}, old, {
            quantity: orderImportPositiveNumber(
                layer.querySelector('.path-order-import-advanced-quantity').value
            ),
            total: orderImportPositiveNumber(
                layer.querySelector('.path-order-import-advanced-total').value
            ),
            doseCount: orderImportPositiveNumber(
                layer.querySelector('.path-order-import-advanced-dose-count').value
            ) || 7,
            decoctionMode: layer.querySelector('.path-order-import-advanced-decoction').value,
            specimen: layer.querySelector('.path-order-import-advanced-specimen').value.trim(),
            bodyPart: layer.querySelector('.path-order-import-advanced-body-part').value.trim(),
            selfPayMode: layer.querySelector('.path-order-import-advanced-self-pay').value,
            dischargeFlag: layer.querySelector('.path-order-import-advanced-discharge').value,
            transferSelfPay: layer.querySelector('.path-order-import-advanced-transfer').value,
            billing: layer.querySelector('.path-order-import-advanced-billing').value,
            customFields: customFields,
            status: ''
        }));
        const acknowledgement = modal.querySelector('.path-order-import-risk-ack');
        if (acknowledgement) acknowledgement.checked = false;
        renderOrderImportPreview(
            modal,
            state.orderImportItems,
            state.orderImportSourceLabel,
            state.orderImportOrigin,
            true
        );
        closeOrderImportAdvancedEditor(modal);
        setOrderImportStatus(modal, '高级字段已更新到住院医嘱草稿。', 'success');
        return true;
    }

    function loadInpatientOrderTemplates() {
        let value = GM_getValue(KEYS.inpatientOrderTemplates, []);
        if (typeof value === 'string') {
            try { value = JSON.parse(value); }
            catch (error) { value = []; }
        }
        return (Array.isArray(value) ? value : []).map(function (template) {
            return {
                id: template.id || makeId('inpatient-template'),
                name: plain(template.name) || '未命名模板',
                updatedAt: template.updatedAt || '',
                items: (Array.isArray(template.items) ? template.items : [])
                    .map(normalizeOrderImportItem)
            };
        });
    }

    function saveInpatientOrderTemplates(templates) {
        GM_setValue(
            KEYS.inpatientOrderTemplates,
            templates.map(function (template) {
                return {
                    id: template.id,
                    name: template.name,
                    updatedAt: template.updatedAt,
                    items: template.items.map(orderImportJsonItem)
                };
            })
        );
    }

    function renderInpatientOrderTemplateManager(modal) {
        const body = modal.querySelector('.path-order-import-template-body');
        if (!body) return;
        const templates = loadInpatientOrderTemplates();
        body.innerHTML = templates.length
            ? templates.map(function (template) {
                return '<div class="path-order-import-template-row" data-template-id="' +
                    escapeHtml(template.id) + '"><div><strong>' +
                    escapeHtml(template.name) + '</strong><span>' +
                    template.items.length + '条' +
                    (template.updatedAt ? ' · ' + escapeHtml(template.updatedAt) : '') +
                    '</span></div><div><button type="button" class="path-order-import-template-use">载入</button>' +
                    '<button type="button" class="path-order-import-template-rename secondary">重命名</button>' +
                    '<button type="button" class="path-order-import-template-delete danger">删除</button></div></div>';
            }).join('')
            : '<div class="path-order-import-template-empty">尚无住院医嘱模板。</div>';
    }

    function openInpatientOrderTemplateManager(modal) {
        renderInpatientOrderTemplateManager(modal);
        const layer = modal.querySelector('.path-order-import-template-layer');
        if (layer) layer.classList.add('show');
    }

    function closeInpatientOrderTemplateManager(modal) {
        const layer = modal.querySelector('.path-order-import-template-layer');
        if (layer) layer.classList.remove('show');
    }

    function saveCurrentInpatientOrdersAsTemplate(modal) {
        if (modal.querySelector('.path-order-import-card').dataset.editorMode === 'json') {
            if (!applyOrderImportJsonEditor(modal, true)) return;
        }
        else {
            collectOrderImportPreviewItems(modal);
        }
        if (!state.orderImportItems.length) {
            setOrderImportStatus(modal, '当前住院医嘱草稿为空，无法保存模板。', 'warning');
            return;
        }
        const name = plain(window.prompt('请输入住院医嘱模板名称：', '新住院医嘱模板'));
        if (!name) return;
        const templates = loadInpatientOrderTemplates();
        const existing = templates.find(function (template) {
            return normalize(template.name) === normalize(name);
        });
        if (existing && !window.confirm('同名模板已存在，确认覆盖吗？')) return;
        const template = existing || {
            id: makeId('inpatient-template'),
            name: name,
            items: []
        };
        template.name = name;
        template.updatedAt = new Date().toLocaleString();
        template.items = state.orderImportItems.map(function (item) {
            return normalizeOrderImportItem(Object.assign({}, clone(item), {
                id: makeId('item'),
                status: ''
            }));
        });
        if (!existing) templates.push(template);
        saveInpatientOrderTemplates(templates);
        renderInpatientOrderTemplateManager(modal);
        setOrderImportStatus(modal, '已保存住院医嘱模板“' + name + '”。', 'success');
    }

    const ORDER_IMPORT_OPTION_PAIRS = [
        ['.path-order-import-auto-save', '.path-auto-save'],
        ['.path-order-import-continue-error', '.path-continue-error'],
        ['.path-order-import-ignore-duplicate', '.path-ignore-duplicate-medication'],
        ['.path-order-import-suppress-check', '.path-suppress-check-popup'],
        ['.path-order-import-suppress-lab', '.path-suppress-lab-popup']
    ];

    function syncOrderImportOptionsFromMain(modal) {
        ORDER_IMPORT_OPTION_PAIRS.forEach(function (pair) {
            const orderControl = modal.querySelector(pair[0]);
            const mainControl = modal.querySelector(pair[1]);
            if (orderControl && mainControl) {
                orderControl.checked = mainControl.checked;
            }
        });
    }

    function syncMainOptionFromOrderImport(modal, orderControl) {
        const pair = ORDER_IMPORT_OPTION_PAIRS.find(function (entry) {
            return orderControl.matches(entry[0]);
        });
        if (!pair) return;
        const mainControl = modal.querySelector(pair[1]);
        if (!mainControl) return;
        mainControl.checked = orderControl.checked;
        mainControl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function deepSeekJsonRequest(
        apiKey,
        model,
        systemPrompt,
        userPayload,
        maxTokens
    ) {
        return new Promise(
            function (resolve, reject) {
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
                            DEFAULT_DEEPSEEK_MODEL,
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
                            7000,
                        stream: false
                    }),
                    timeout: 150000,
                    onload:
                        function (response) {
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
                                            1000
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
                                    outer.choices[0]
                                        .message
                                        ? outer
                                            .choices[0]
                                            .message
                                            .content
                                        : '';

                                if (!content) {
                                    throw new Error(
                                        '接口未返回有效内容'
                                    );
                                }

                                resolve(
                                    extractDeepSeekJson(
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
                    onerror:
                        function () {
                            reject(
                                new Error(
                                    'DeepSeek网络请求失败'
                                )
                            );
                        },
                    ontimeout:
                        function () {
                            reject(
                                new Error(
                                    'DeepSeek请求超时'
                                )
                            );
                        }
                });
            }
        );
    }

    function aiStringArray(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map(
                function (item) {
                    if (
                        item &&
                        typeof item ===
                            'object'
                    ) {
                        return plain(
                            item.message ||
                            item.text ||
                            item.issue ||
                            item.name ||
                            JSON.stringify(
                                item
                            )
                        );
                    }

                    return plain(item);
                }
            )
            .filter(Boolean);
    }

    function aiItemPayload(item) {
        const normalizedItem =
            normalizeItem(item);

        return {
            tab:
                normalizedItem.tab,
            orderType:
                normalizedItem.orderType,
            name:
                normalizedItem.name,
            searchName:
                normalizedItem.searchName,
            secondarySearchName:
                normalizedItem
                    .secondarySearchName,
            department:
                normalizedItem.department,
            groupNo:
                normalizedItem.groupNo,
            dose:
                normalizedItem.dose,
            unit:
                normalizedItem.unit,
            route:
                normalizedItem.route,
            frequency:
                normalizedItem.frequency,
            days:
                normalizedItem.days,
            quantity:
                normalizedItem.quantity,
            total:
                normalizedItem.total,
            doseCount:
                normalizedItem.doseCount,
            decoctionMode:
                normalizedItem
                    .decoctionMode,
            instruction:
                normalizedItem.instruction,
            specimen:
                normalizedItem.specimen,
            bodyPart:
                normalizedItem.bodyPart,
            selfPayMode:
                normalizedItem.selfPayMode,
            dischargeFlag:
                normalizedItem
                    .dischargeFlag,
            transferSelfPay:
                normalizedItem
                    .transferSelfPay,
            billing:
                normalizedItem.billing
        };
    }

    function currentPathwayAiPayload() {
        const pathway =
            currentPathway();

        if (!pathway) {
            return null;
        }

        return {
            name:
                pathway.name,
            version:
                pathway.version,
            description:
                pathway.description,
            groups:
                pathway.groups.map(
                    function (group) {
                        return {
                            name:
                                group.name,
                            enabled:
                                group.enabled !==
                                false,
                            items:
                                group.items
                                    .filter(
                                        function (
                                            item
                                        ) {
                                            return (
                                                item
                                                    .enabled !==
                                                false
                                            );
                                        }
                                    )
                                    .map(
                                        aiItemPayload
                                    )
                        };
                    }
                )
        };
    }

    function normalizeAiGeneratedResult(
        raw
    ) {
        const source =
            raw &&
            typeof raw ===
                'object'
                ? raw
                : {};

        const pathwaySource =
            source.pathway &&
            typeof source.pathway ===
                'object'
                ? source.pathway
                : source;

        const rawGroups =
            Array.isArray(
                pathwaySource.groups
            )
                ? pathwaySource.groups
                : [];

        let totalItemCount = 0;

        const groups =
            rawGroups
                .slice(0, 12)
                .map(
                    function (
                        rawGroup,
                        groupIndex
                    ) {
                        const groupSource =
                            rawGroup &&
                            typeof rawGroup ===
                                'object'
                                ? rawGroup
                                : {};

                        const items =
                            (
                                Array.isArray(
                                    groupSource.items
                                )
                                    ? groupSource.items
                                    : []
                            )
                                .filter(
                                    function (
                                        item
                                    ) {
                                        return Boolean(
                                            plain(
                                                item &&
                                                (
                                                    item.name ||
                                                    item
                                                        .searchName
                                                )
                                            )
                                        );
                                    }
                                )
                                .slice(
                                    0,
                                    Math.max(
                                        0,
                                        150 -
                                        totalItemCount
                                    )
                                )
                                .map(
                                    function (
                                        item
                                    ) {
                                        const normalized =
                                            normalizeItem(
                                                Object.assign(
                                                    {},
                                                    item,
                                                    {
                                                        id:
                                                            makeId(
                                                                'item'
                                                            ),
                                                        enabled:
                                                            false,
                                                        status:
                                                            ''
                                                    }
                                                )
                                            );

                                        /*
                                         * AI生成的条目一律默认不启用。
                                         * 必须由医师人工核对后再手动勾选。
                                         */
                                        normalized.enabled =
                                            false;
                                        normalized.status =
                                            '';

                                        return normalized;
                                    }
                                );

                        totalItemCount +=
                            items.length;

                        return {
                            id:
                                makeId(
                                    'group'
                                ),
                            name:
                                plain(
                                    groupSource.name
                                ) ||
                                (
                                    '阶段' +
                                    (
                                        groupIndex +
                                        1
                                    )
                                ),
                            enabled: true,
                            items: items
                        };
                    }
                )
                .filter(
                    function (group) {
                        return (
                            group.items.length >
                            0
                        );
                    }
                );

        if (!groups.length) {
            throw new Error(
                'AI结果中没有可识别的临床路径组套条目'
            );
        }

        return {
            pathway: {
                id:
                    makeId('pathway'),
                name:
                    plain(
                        pathwaySource.name
                    ) ||
                    'AI推荐临床路径',
                version:
                    plain(
                        pathwaySource.version
                    ) ||
                    'AI-1.0',
                description:
                    plain(
                        pathwaySource
                            .description
                    ),
                groups: groups
            },
            summary:
                plain(
                    source.summary
                ),
            clinicalBasis:
                aiStringArray(
                    source.clinicalBasis ||
                    source.basis
                ),
            missingInformation:
                aiStringArray(
                    source
                        .missingInformation
                ),
            warnings:
                aiStringArray(
                    source.warnings
                )
        };
    }

    function renderAiList(
        title,
        values,
        className
    ) {
        const items =
            aiStringArray(values);

        if (!items.length) {
            return '';
        }

        return (
            '<div class="path-ai-result-block ' +
            escapeHtml(
                className ||
                ''
            ) +
            '">' +
            '<strong>' +
            escapeHtml(title) +
            '</strong>' +
            '<ul>' +
            items
                .map(
                    function (item) {
                        return (
                            '<li>' +
                            escapeHtml(item) +
                            '</li>'
                        );
                    }
                )
                .join('') +
            '</ul>' +
            '</div>'
        );
    }

    function renderAiGenerationResult(
        modal
    ) {
        const box =
            modal.querySelector(
                '.path-ai-generation-result'
            );
        const createButton =
            modal.querySelector(
                '.path-ai-create-path'
            );
        const result =
            state.aiGeneratedResult;

        if (!result) {
            box.innerHTML =
                '<div class="path-ai-empty">尚未生成推荐临床路径。</div>';
            createButton.disabled =
                true;
            return;
        }

        const pathway =
            result.pathway;
        const total =
            pathway.groups.reduce(
                function (
                    sum,
                    group
                ) {
                    return (
                        sum +
                        group.items.length
                    );
                },
                0
            );

        const groupsHtml =
            pathway.groups
                .map(
                    function (
                        group,
                        groupIndex
                    ) {
                        const names =
                            group.items
                                .slice(0, 12)
                                .map(
                                    function (
                                        item
                                    ) {
                                        return (
                                            item.tab +
                                            '：' +
                                            item.name
                                        );
                                    }
                                );

                        return (
                            '<div class="path-ai-group-preview">' +
                            '<strong>' +
                            escapeHtml(
                                (
                                    groupIndex +
                                    1
                                ) +
                                '. ' +
                                group.name +
                                '（' +
                                group.items
                                    .length +
                                '条）'
                            ) +
                            '</strong>' +
                            '<div>' +
                            escapeHtml(
                                names.join(
                                    '；'
                                )
                            ) +
                            (
                                group.items
                                    .length >
                                names.length
                                    ? '……'
                                    : ''
                            ) +
                            '</div>' +
                            '</div>'
                        );
                    }
                )
                .join('');

        box.innerHTML =
            '<div class="path-ai-result-summary">' +
            '<strong>' +
            escapeHtml(
                pathway.name
            ) +
            '</strong>' +
            '<span>版本：' +
            escapeHtml(
                pathway.version
            ) +
            '</span>' +
            '<span>共' +
            pathway.groups.length +
            '个阶段、' +
            total +
            '条医嘱建议</span>' +
            '</div>' +
            (
                pathway.description
                    ? '<div class="path-ai-description">' +
                        escapeHtml(
                            pathway
                                .description
                        ) +
                        '</div>'
                    : ''
            ) +
            (
                result.summary
                    ? '<div class="path-ai-description"><strong>总体说明：</strong>' +
                        escapeHtml(
                            result.summary
                        ) +
                        '</div>'
                    : ''
            ) +
            groupsHtml +
            renderAiList(
                '临床依据与设计原则',
                result.clinicalBasis,
                ''
            ) +
            renderAiList(
                '仍需补充的信息',
                result.missingInformation,
                'warning'
            ) +
            renderAiList(
                '风险与人工核对事项',
                result.warnings,
                'danger'
            ) +
            '<details class="path-ai-json-details">' +
            '<summary>查看AI结构化结果</summary>' +
            '<pre>' +
            escapeHtml(
                JSON.stringify(
                    result,
                    null,
                    2
                )
            ) +
            '</pre>' +
            '</details>' +
            '<div class="path-ai-safe-note">生成条目默认全部不启用。创建路径后，需逐条核对并手动勾选，再点击“保存当前组套”。</div>';

        createButton.disabled =
            Boolean(
                state.aiBusy
            );
    }

    function normalizeAiAuditResult(
        raw
    ) {
        const source =
            raw &&
            typeof raw ===
                'object'
                ? raw
                : {};

        const allowedRisk =
            [
                'low',
                'medium',
                'high',
                'critical'
            ];

        const findings =
            (
                Array.isArray(
                    source.findings
                )
                    ? source.findings
                    : []
            ).map(
                function (finding) {
                    const item =
                        finding &&
                        typeof finding ===
                            'object'
                            ? finding
                            : {
                                issue:
                                    String(
                                        finding ||
                                        ''
                                    )
                            };

                    return {
                        severity:
                            plain(
                                item.severity
                            ) ||
                            'info',
                        category:
                            plain(
                                item.category
                            ),
                        orderName:
                            plain(
                                item.orderName ||
                                item.order
                            ),
                        issue:
                            plain(
                                item.issue ||
                                item.message
                            ),
                        recommendation:
                            plain(
                                item.recommendation ||
                                item.suggestion
                            ),
                        basis:
                            plain(
                                item.basis ||
                                item.rationale
                            )
                    };
                }
            ).filter(
                function (item) {
                    return Boolean(
                        item.issue ||
                        item.recommendation
                    );
                }
            );

        return {
            source:
                plain(source.source),
            riskLevel:
                allowedRisk.includes(
                    String(
                        source.riskLevel ||
                        ''
                    ).toLowerCase()
                )
                    ? String(
                        source.riskLevel
                    ).toLowerCase()
                    : 'medium',
            summary:
                plain(source.summary),
            findings: findings,
            missingInformation:
                aiStringArray(
                    source
                        .missingInformation
                ),
            duplicateOrConflict:
                aiStringArray(
                    source
                        .duplicateOrConflict
                ),
            recommendedAdditions:
                aiStringArray(
                    source
                        .recommendedAdditions
                ),
            recommendedRemovals:
                aiStringArray(
                    source
                        .recommendedRemovals
                ),
            monitoring:
                aiStringArray(
                    source.monitoring
                ),
            warnings:
                aiStringArray(
                    source.warnings
                )
        };
    }

    function riskLevelChinese(
        riskLevel
    ) {
        return {
            low: '低风险',
            medium: '中等风险',
            high: '高风险',
            critical: '严重风险'
        }[
            riskLevel
        ] || '中等风险';
    }

    function normalizePathAiManualText(value) {
        return String(value || '')
            .replace(/\r\n?/g, '\n')
            .trim();
    }

    function aiAuditResultToEditableText(result) {
        if (!result) return '';

        const lines = [];
        function addLine(label, value) {
            const text = plain(value);
            if (text) lines.push(label + text);
        }
        function addList(title, values) {
            const items = Array.isArray(values)
                ? values.map(plain).filter(Boolean)
                : [];
            if (!items.length) return;
            lines.push('');
            lines.push(title + '：');
            items.forEach(function (item, index) {
                lines.push((index + 1) + '. ' + item);
            });
        }

        addLine('来源：', result.source);
        addLine('风险等级：', riskLevelChinese(result.riskLevel));
        addLine('总体说明：', result.summary);

        const findings = Array.isArray(result.findings)
            ? result.findings
            : [];
        if (findings.length) {
            lines.push('');
            lines.push('审核发现：');
            findings.forEach(function (finding, index) {
                const title = plain(finding.category) || '审核发现';
                const orderName = plain(finding.orderName);
                lines.push(
                    (index + 1) + '. ' + title +
                    (orderName ? '（相关医嘱：' + orderName + '）' : '')
                );
                addLine('   问题：', finding.issue);
                addLine('   建议：', finding.recommendation);
                addLine('   依据：', finding.basis);
            });
        }

        addList('缺失信息', result.missingInformation);
        addList('重复、冲突或配伍问题', result.duplicateOrConflict);
        addList('建议补充的医嘱或评估', result.recommendedAdditions);
        addList('建议暂停、删除或重新核对', result.recommendedRemovals);
        addList('监测与复查建议', result.monitoring);
        addList('其他警示', result.warnings);

        return lines.join('\n').trim();
    }

    function openPathAiManualEditor(options) {
        const settings = options || {};
        const oldLayer = document.getElementById(IDS.aiManualEditor);
        if (oldLayer) oldLayer.remove();

        const layer = document.createElement('div');
        layer.id = IDS.aiManualEditor;
        layer.style.cssText =
            'position:fixed;inset:0;z-index:2147483647;' +
            'display:flex;align-items:center;justify-content:center;' +
            'background:rgba(0,0,0,.42);font-family:"Microsoft YaHei",Arial,sans-serif;';
        layer.innerHTML =
            '<div style="width:min(920px,calc(100vw - 28px));height:min(680px,calc(100vh - 28px));background:#fff;border-radius:8px;box-shadow:0 12px 42px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;">' +
                '<div style="height:52px;flex:0 0 52px;background:' + STYLE.modalHeader + ';color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:17px;font-weight:bold;">' +
                    '<span class="path-ai-manual-title"></span>' +
                    '<button type="button" class="path-ai-manual-close" style="border:0;background:transparent;color:#fff;font-size:28px;cursor:pointer;">×</button>' +
                '</div>' +
                '<div style="padding:12px 14px 14px;display:flex;flex:1;min-height:0;flex-direction:column;gap:9px;">' +
                    '<div class="path-ai-manual-hint" style="font-size:12px;color:#666;line-height:1.55;"></div>' +
                    '<textarea class="path-ai-manual-text" style="box-sizing:border-box;width:100%;flex:1;min-height:220px;border:1px solid ' + STYLE.secondaryBorder + ';border-radius:6px;padding:10px;resize:none;line-height:1.7;font-family:inherit;font-size:13px;"></textarea>' +
                    '<div class="path-ai-manual-error" style="display:none;padding:7px 9px;border-radius:5px;background:#fff0ef;color:#b93830;font-size:12px;"></div>' +
                    '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
                        '<button type="button" class="path-ai-manual-cancel" style="height:34px;border:1px solid ' + STYLE.secondaryBorder + ';border-radius:5px;background:#f3fbfe;color:' + STYLE.header + ';padding:0 15px;cursor:pointer;">取消</button>' +
                        '<button type="button" class="path-ai-manual-save" style="height:34px;border:1px solid ' + STYLE.primary + ';border-radius:5px;background:' + STYLE.primary + ';color:#fff;padding:0 15px;cursor:pointer;">保存修改</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(layer);

        const title = layer.querySelector('.path-ai-manual-title');
        const hint = layer.querySelector('.path-ai-manual-hint');
        const editor = layer.querySelector('.path-ai-manual-text');
        const errorBox = layer.querySelector('.path-ai-manual-error');
        title.textContent = String(settings.title || '手动录入/修改');
        hint.textContent = String(
            settings.hint ||
            '可直接录入或修改当前结果；保存只更新本次页面会话，不修改HIS原记录，不发起AI请求。'
        );
        editor.placeholder = String(settings.placeholder || '请录入内容');
        editor.value = String(settings.value || '');

        function closeEditor() {
            layer.remove();
        }

        layer.querySelector('.path-ai-manual-close')
            .addEventListener('click', closeEditor);
        layer.querySelector('.path-ai-manual-cancel')
            .addEventListener('click', closeEditor);
        layer.addEventListener('click', function (event) {
            if (event.target === layer) closeEditor();
        });
        layer.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeEditor();
        });
        layer.querySelector('.path-ai-manual-save')
            .addEventListener('click', function () {
                try {
                    const value = normalizePathAiManualText(editor.value);
                    if (!value) {
                        throw new Error('内容不能为空；如需删除请使用“清空结果”');
                    }
                    if (typeof settings.onSave === 'function') {
                        settings.onSave(value);
                    }
                    closeEditor();
                }
                catch (error) {
                    errorBox.textContent =
                        '保存失败：' + (error && error.message || error);
                    errorBox.style.display = 'block';
                }
            });

        window.requestAnimationFrame(function () {
            editor.focus();
            editor.setSelectionRange(editor.value.length, editor.value.length);
        });

        return layer;
    }

    function openPathAiResultManualEditor(modal, resultType) {
        if (state.running || state.bulkDeletingOrders || state.aiBusy) {
            showStatus('当前已有任务正在执行。', 'warning');
            return;
        }

        const configs = {
            audit: {
                title: 'AI医嘱审核－手动录入/修改',
                placeholder: '请录入或修改当前页医嘱审核结果。',
                value: state.aiAuditManualResult ||
                    aiAuditResultToEditableText(state.aiAuditResult),
                onSave: function (value) {
                    state.aiAuditResult = null;
                    state.aiAuditManualResult = value;
                    renderAiAuditResult(modal);
                    updateRunButtons(modal);
                    showStatus('已保存手动医嘱审核结果。', 'success');
                }
            },
            orders: {
                title: '当前页医嘱关键信息－手动录入/修改',
                placeholder: '请录入或修改当前页医嘱关键信息。',
                value: state.aiOrderExtractResult,
                onSave: function (value) {
                    state.aiOrderExtractResult = value;
                    state.aiOrderExtractSource = '手动录入/修改';
                    renderAiOrderExtractResult(modal);
                    updateRunButtons(modal);
                    showStatus('已保存手动当前页医嘱关键信息。', 'success');
                }
            },
            diagnosis: {
                title: '基本诊断信息－手动录入/修改',
                placeholder: '请按1.2.3.的序号逐行录入或修改西医诊断。',
                value: state.aiDiagnosisExtractResult,
                onSave: function (value) {
                    state.aiDiagnosisExtractResult = value;
                    state.aiDiagnosisExtractSource = '手动录入/修改';
                    renderAiDiagnosisExtractResult(modal);
                    updateRunButtons(modal);
                    showStatus('已保存手动基本诊断信息。', 'success');
                }
            }
        };

        const config = configs[resultType];
        if (!config) return;

        openPathAiManualEditor({
            title: config.title,
            hint: '已有AI提取或手动保存内容会自动载入。“保存修改”只覆盖当前模块的本次结果，不修改HIS医嘱或诊断；“取消”不作任何改动。',
            placeholder: config.placeholder,
            value: config.value,
            onSave: config.onSave
        });
    }

    function renderAiAuditResult(
        modal
    ) {
        const box =
            modal.querySelector(
                '.path-ai-audit-result'
            );
        const result =
            state.aiAuditResult;
        const manualResult = normalizePathAiManualText(
            state.aiAuditManualResult
        );

        if (manualResult) {
            box.innerHTML =
                '<div class="path-ai-result-summary">' +
                '<strong>当前页医嘱审核</strong>' +
                '<span>来源：手动录入/修改</span>' +
                '</div>' +
                '<div class="path-ai-manual-result">' +
                escapeHtml(manualResult) +
                '</div>' +
                '<div class="path-ai-safe-note">手动结果只保存在当前页面会话，不会修改、删除、保存或执行任何HIS医嘱。</div>';
            return;
        }

        if (!result) {
            box.innerHTML =
                '<div class="path-ai-empty">尚未审核当前页医嘱。</div>';
            return;
        }

        const findingsHtml =
            result.findings.length
                ? (
                    '<div class="path-ai-findings">' +
                    result.findings
                        .map(
                            function (
                                finding,
                                index
                            ) {
                                return (
                                    '<div class="path-ai-finding" data-severity="' +
                                    escapeHtml(
                                        finding
                                            .severity
                                    ) +
                                    '">' +
                                    '<div><strong>' +
                                    escapeHtml(
                                        (
                                            index +
                                            1
                                        ) +
                                        '. ' +
                                        (
                                            finding
                                                .category ||
                                            '审核发现'
                                        )
                                    ) +
                                    '</strong>' +
                                    (
                                        finding
                                            .orderName
                                            ? '<span>　相关医嘱：' +
                                                escapeHtml(
                                                    finding
                                                        .orderName
                                                ) +
                                                '</span>'
                                            : ''
                                    ) +
                                    '</div>' +
                                    (
                                        finding.issue
                                            ? '<div><b>问题：</b>' +
                                                escapeHtml(
                                                    finding
                                                        .issue
                                                ) +
                                                '</div>'
                                            : ''
                                    ) +
                                    (
                                        finding
                                            .recommendation
                                            ? '<div><b>建议：</b>' +
                                                escapeHtml(
                                                    finding
                                                        .recommendation
                                                ) +
                                                '</div>'
                                            : ''
                                    ) +
                                    (
                                        finding.basis
                                            ? '<div><b>依据：</b>' +
                                                escapeHtml(
                                                    finding
                                                        .basis
                                                ) +
                                                '</div>'
                                            : ''
                                    ) +
                                    '</div>'
                                );
                            }
                        )
                        .join('') +
                    '</div>'
                )
                : '<div class="path-ai-empty">AI未返回逐条问题，但仍需人工完整复核。</div>';

        box.innerHTML =
            '<div class="path-ai-result-summary">' +
            '<strong>当前页医嘱审核</strong>' +
            (
                result.source
                    ? '<span>来源：' +
                        escapeHtml(
                            result.source
                        ) +
                        '</span>'
                    : ''
            ) +
            '<span class="path-ai-risk" data-risk="' +
            escapeHtml(
                result.riskLevel
            ) +
            '">' +
            escapeHtml(
                riskLevelChinese(
                    result.riskLevel
                )
            ) +
            '</span>' +
            '</div>' +
            (
                result.summary
                    ? '<div class="path-ai-description">' +
                        escapeHtml(
                            result.summary
                        ) +
                        '</div>'
                    : ''
            ) +
            findingsHtml +
            renderAiList(
                '缺失信息',
                result.missingInformation,
                'warning'
            ) +
            renderAiList(
                '重复、冲突或配伍问题',
                result.duplicateOrConflict,
                'danger'
            ) +
            renderAiList(
                '建议补充的医嘱或评估',
                result.recommendedAdditions,
                ''
            ) +
            renderAiList(
                '建议暂停、删除或重新核对',
                result.recommendedRemovals,
                'danger'
            ) +
            renderAiList(
                '监测与复查建议',
                result.monitoring,
                ''
            ) +
            renderAiList(
                '其他警示',
                result.warnings,
                'danger'
            ) +
            '<details class="path-ai-json-details">' +
            '<summary>查看AI结构化审核结果</summary>' +
            '<pre>' +
            escapeHtml(
                JSON.stringify(
                    result,
                    null,
                    2
                )
            ) +
            '</pre>' +
            '</details>' +
            '<div class="path-ai-safe-note">审核结果不会自动修改、删除、保存或执行任何医嘱。</div>';
    }

    function setAiBusy(
        modal,
        busy,
        taskType
    ) {
        state.aiBusy =
            Boolean(busy);
        state.aiTaskType =
            busy
                ? (
                    taskType ||
                    ''
                )
                : '';

        const generateButton =
            modal.querySelector(
                '.path-ai-generate'
            );
        const auditButton =
            modal.querySelector(
                '.path-ai-audit'
            );
        const extractButton =
            modal.querySelector(
                '.path-ai-extract-orders'
            );
        const diagnosisExtractButton =
            modal.querySelector(
                '.path-ai-extract-diagnosis'
            );

        if (generateButton) {
            generateButton.textContent =
                state.aiBusy &&
                state.aiTaskType ===
                    'generate'
                    ? '正在生成……'
                    : '生成推荐临床路径';
        }

        if (auditButton) {
            auditButton.textContent =
                state.aiBusy &&
                state.aiTaskType ===
                    'audit'
                    ? '正在审核……'
                    : '审核当前页医嘱';
        }

        if (extractButton) {
            extractButton.textContent =
                state.aiBusy &&
                state.aiTaskType ===
                    'extract'
                    ? '正在提取……'
                    : '提取当前页医嘱关键信息';
        }

        if (diagnosisExtractButton) {
            diagnosisExtractButton.textContent =
                state.aiBusy &&
                state.aiTaskType ===
                    'diagnosis-extract'
                    ? '正在提取……'
                    : '提取基本诊断信息';
        }

        updateRunButtons(modal);
        renderAiOrderExtractResult(modal);
        renderAiGenerationResult(
            modal
        );
    }

    function getAiRequestSettings(
        modal
    ) {
        const apiKey =
            String(
                modal.querySelector(
                    '.path-ai-key'
                ).value ||
                ''
            ).trim();
        const model =
            String(
                modal.querySelector(
                    '.path-ai-model'
                ).value ||
                DEFAULT_DEEPSEEK_MODEL
            ).trim() ||
            DEFAULT_DEEPSEEK_MODEL;

        GM_setValue(
            KEYS.deepSeekApiKey,
            apiKey
        );
        GM_setValue(
            KEYS.deepSeekModel,
            model
        );

        return {
            apiKey: apiKey,
            model: model
        };
    }

    async function generateAiClinicalPathway(
        modal
    ) {
        if (
            state.running ||
            state.bulkDeletingOrders ||
            state.aiBusy
        ) {
            showStatus(
                '当前已有任务正在执行。',
                'warning'
            );
            return;
        }

        const settings =
            getAiRequestSettings(
                modal
            );
        const prompt =
            String(
                modal.querySelector(
                    '.path-ai-prompt'
                ).value ||
                ''
            ).trim();

        GM_setValue(
            KEYS.aiGenerationPrompt,
            prompt
        );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showStatus(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        if (!prompt) {
            showStatus(
                '请填写病种、适用对象、诊疗目标和院内限制等路径生成提示词。',
                'warning'
            );
            return;
        }

        const systemPrompt = [
            '你是中国医院住院临床路径与医嘱组套设计辅助工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '结果仅供执业医师、药师和医院管理人员人工审核，不得替代指南、说明书、本院制度或临床决策。',
            '不得假设未提供的年龄、妊娠、过敏史、肝肾功能、实验室结果、病原学、体重和合并用药；缺失内容必须列入missingInformation。',
            '生成完整临床路径，可按入院评估、基础检查、治疗、康复、中医治疗、病情复评、出院准备等阶段分组，但应根据用户提示调整。',
            '支持的tab只能从以下值选择：药品录入、中草药、出院带药、文字录入、项目录入、耗材、康复医嘱、检验、检查。',
            'orderType只能是长或临。检查、检验通常使用临和st；长期护理、饮食、监测可按实际使用长和qd/bid等。',
            '药品条目必须明确药名、剂量、单位、用法、频次；不能确定时不得编造，应放入warnings或missingInformation。',
            '静脉输液同一组的溶媒和药品使用相同groupNo。用法尽量使用医院可选中文名称，例如口服、静脉滴注、静脉注射、局部用药、雾化、鼻饲。',
            '中草药必须给出单味药名称和剂量；decoctionMode只能是代煎、自煎、外用、冲服。',
            '检验条目searchName用于一级下拉菜单，secondarySearchName用于左侧树状列表叶子；不确定二级目录时留空。',
            '所有AI生成条目enabled必须为false，不能自动执行。',
            '最多12个阶段，总条目不超过150条，避免无关、重复和超范围项目。',
            'JSON结构必须为：',
            '{"pathway":{"name":"路径名称","version":"AI-1.0","description":"适用条件、排除条件与目标","groups":[{"name":"入院阶段","items":[{"enabled":false,"tab":"文字录入","orderType":"长","name":"中医科护理常规","searchName":"中医科护理常规","secondarySearchName":"","department":"","groupNo":"","dose":"","unit":"","route":"","frequency":"qd","days":"","quantity":"","total":"","doseCount":7,"decoctionMode":"自煎","instruction":"","specimen":"","bodyPart":"","selfPayMode":"min","dischargeFlag":"否","transferSelfPay":"否","billing":"是"}]}]},"summary":"总体设计说明","clinicalBasis":["设计依据"],"missingInformation":["缺失信息"],"warnings":["人工核对事项"]}'
        ].join('\n');

        setAiBusy(
            modal,
            true,
            'generate'
        );
        showStatus(
            '正在调用DeepSeek生成推荐临床路径……'
        );

        try {
            const result =
                await deepSeekJsonRequest(
                    settings.apiKey,
                    settings.model,
                    systemPrompt,
                    {
                        generationPrompt:
                            prompt,
                        currentCategory:
                            currentCategory()
                                ? currentCategory()
                                    .name
                                : '',
                        currentPathway:
                            currentPathwayAiPayload(),
                        supportedTabs:
                            TAB_NAMES
                    },
                    10000
                );

            state.aiGeneratedResult =
                normalizeAiGeneratedResult(
                    result
                );

            renderAiGenerationResult(
                modal
            );

            const total =
                state
                    .aiGeneratedResult
                    .pathway
                    .groups
                    .reduce(
                        function (
                            sum,
                            group
                        ) {
                            return (
                                sum +
                                group.items
                                    .length
                            );
                        },
                        0
                    );

            showStatus(
                'DeepSeek已生成推荐临床路径：' +
                state
                    .aiGeneratedResult
                    .pathway
                    .groups
                    .length +
                '个阶段、' +
                total +
                '条建议。\n' +
                '请先在结果区人工核对，再点击“创建为新路径”。',
                'success'
            );
        }
        catch (error) {
            state.aiGeneratedResult =
                null;
            renderAiGenerationResult(
                modal
            );
            showStatus(
                error.message,
                'error'
            );
        }
        finally {
            setAiBusy(
                modal,
                false,
                ''
            );
        }
    }

    function uniqueAiPathwayName(
        category,
        baseName
    ) {
        const original =
            plain(baseName) ||
            'AI推荐临床路径';
        const existing =
            new Set(
                category.pathways.map(
                    function (
                        pathway
                    ) {
                        return pathway.name;
                    }
                )
            );

        if (!existing.has(original)) {
            return original;
        }

        let index = 2;

        while (
            existing.has(
                original +
                '（AI-' +
                index +
                '）'
            )
        ) {
            index += 1;
        }

        return (
            original +
            '（AI-' +
            index +
            '）'
        );
    }

    function createAiResultAsNewPathway(
        modal
    ) {
        if (
            state.running ||
            state.bulkDeletingOrders ||
            state.aiBusy
        ) {
            showStatus(
                '当前已有任务正在执行。',
                'warning'
            );
            return;
        }

        if (
            !state.aiGeneratedResult
        ) {
            showStatus(
                '请先生成推荐临床路径。',
                'warning'
            );
            return;
        }

        if (
            !requireSavedCurrentGroup(
                modal,
                '创建AI推荐路径'
            )
        ) {
            return;
        }

        const category =
            currentCategory();

        if (!category) {
            showStatus(
                '未找到当前病种分类。',
                'error'
            );
            return;
        }

        const sourcePathway =
            state.aiGeneratedResult
                .pathway;
        const pathway =
            clone(sourcePathway);

        pathway.id =
            makeId('pathway');
        pathway.name =
            uniqueAiPathwayName(
                category,
                pathway.name
            );
        pathway.groups =
            pathway.groups.map(
                function (group) {
                    return {
                        id:
                            makeId('group'),
                        name:
                            group.name,
                        enabled: true,
                        items:
                            group.items.map(
                                function (
                                    item
                                ) {
                                    const normalized =
                                        normalizeItem(
                                            Object.assign(
                                                {},
                                                item,
                                                {
                                                    id:
                                                        makeId(
                                                            'item'
                                                        ),
                                                    enabled:
                                                        false,
                                                    status:
                                                        ''
                                                }
                                            )
                                        );

                                    normalized.enabled =
                                        false;
                                    normalized.status =
                                        '';

                                    return normalized;
                                }
                            )
                    };
                }
            );

        const total =
            pathway.groups.reduce(
                function (
                    sum,
                    group
                ) {
                    return (
                        sum +
                        group.items.length
                    );
                },
                0
            );

        const confirmed =
            window.confirm(
                '确认在当前分类“' +
                category.name +
                '”中新建AI推荐路径“' +
                pathway.name +
                '”吗？\n\n' +
                '阶段：' +
                pathway.groups.length +
                '个\n' +
                '条目：' +
                total +
                '条\n\n' +
                '安全设置：全部AI条目默认不启用，不会自动执行。\n' +
                '创建后请逐组人工核对、勾选，并点击“保存当前组套”。'
            );

        if (!confirmed) {
            showStatus(
                '已取消创建AI推荐路径。',
                'warning'
            );
            return;
        }

        category.pathways.push(
            pathway
        );
        saveLibrary();

        GM_setValue(
            KEYS.pathway,
            pathway.id
        );
        GM_setValue(
            KEYS.group,
            pathway.groups[0].id
        );

        refreshSelects(modal);

        showStatus(
            '已创建AI推荐路径“' +
            pathway.name +
            '”。\n' +
            '全部条目默认未启用，请人工核对后逐条勾选。',
            'success'
        );
    }

    async function auditCurrentPageOrdersWithAi(
        modal
    ) {
        if (
            state.running ||
            state.bulkDeletingOrders ||
            state.aiBusy
        ) {
            showStatus(
                '当前已有任务正在执行。',
                'warning'
            );
            return;
        }

        const settings =
            getAiRequestSettings(
                modal
            );
        const auditContext =
            String(
                modal.querySelector(
                    '.path-ai-audit-context'
                ).value ||
                ''
            ).trim();

        GM_setValue(
            KEYS.aiAuditContext,
            auditContext
        );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showStatus(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        showStatus(
            '正在读取当前页面医嘱……'
        );
        await sleep(80);

        const detected =
            detectCurrentPageOrders();
        const orders =
            (
                detected.items ||
                []
            )
                .filter(
                    function (item) {
                        return Boolean(
                            plain(
                                item.name
                            )
                        );
                    }
                )
                .map(
                    aiItemPayload
                );

        if (!orders.length) {
            showStatus(
                '当前页面未识别到可审核的医嘱。\n' +
                '请先打开“医嘱查询”或具体医嘱录入标签页，并确保列表中已有可见医嘱。',
                'warning'
            );
            return;
        }

        const systemPrompt = [
            '你是中国医院住院医嘱合理性审核辅助工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '审核结果仅供执业医师和临床药师人工复核，不得自动修改、删除、保存或执行医嘱。',
            '不得假设未提供的诊断、年龄、体重、过敏史、妊娠、肝肾功能、实验室结果、病原学和既往用药；缺失内容必须写入missingInformation。',
            '对当前页全部医嘱进行整体审核，同时覆盖：适应证、重复医嘱、药物相互作用、禁忌、剂量、单位、用法、频次、疗程、输液组号、抗菌药物、老年风险、肝肾调整、检查检验必要性与重复性、护理与康复医嘱完整性、长临选择、监测和出院衔接。',
            '若提供了当前临床路径，应比较当前页医嘱与路径的一致性，但不得仅因未出现在路径中就判定错误。',
            '风险等级riskLevel只能是low、medium、high、critical。',
            'findings每项必须指出严重度、类别、相关医嘱、问题、建议和依据；无法确定时明确写“需补充资料后判断”。',
            'recommendedRemovals只能写“建议暂停、删除或重新核对”，不得声称已删除。',
            'JSON结构必须为：',
            '{"source":"当前页来源","riskLevel":"medium","summary":"总体评价","findings":[{"severity":"high","category":"剂量与用法","orderName":"药名","issue":"问题","recommendation":"建议","basis":"依据"}],"missingInformation":[],"duplicateOrConflict":[],"recommendedAdditions":[],"recommendedRemovals":[],"monitoring":[],"warnings":[]}'
        ].join('\n');

        setAiBusy(
            modal,
            true,
            'audit'
        );
        showStatus(
            '正在调用DeepSeek审核“' +
            detected.source +
            '”的' +
            orders.length +
            '条医嘱……'
        );

        try {
            const result =
                await deepSeekJsonRequest(
                    settings.apiKey,
                    settings.model,
                    systemPrompt,
                    {
                        source:
                            detected.source,
                        physicianContext:
                            auditContext,
                        currentCategory:
                            currentCategory()
                                ? currentCategory()
                                    .name
                                : '',
                        currentClinicalPathway:
                            currentPathwayAiPayload(),
                        currentPageOrders:
                            orders
                    },
                    7000
                );

            result.source =
                result.source ||
                detected.source;

            state.aiAuditResult =
                normalizeAiAuditResult(
                    result
                );
            state.aiAuditManualResult = '';

            renderAiAuditResult(
                modal
            );

            showStatus(
                'AI已完成当前页医嘱审核。\n' +
                '来源：' +
                detected.source +
                '；共' +
                orders.length +
                '条；风险等级：' +
                riskLevelChinese(
                    state
                        .aiAuditResult
                        .riskLevel
                ) +
                '。\n结果不会自动修改任何医嘱。',
                state
                    .aiAuditResult
                    .riskLevel ===
                    'low'
                    ? 'success'
                    : 'warning'
            );
        }
        catch (error) {
            state.aiAuditResult =
                null;
            state.aiAuditManualResult = '';
            renderAiAuditResult(
                modal
            );
            showStatus(
                error.message,
                'error'
            );
        }
        finally {
            setAiBusy(
                modal,
                false,
                ''
            );
        }
    }


    function normalizeAiOrderExtractResult(raw) {
        const source = raw && typeof raw === 'object'
            ? raw
            : {};
        const value = String(
            source.text ||
            source.result ||
            source.summary ||
            source.content ||
            ''
        )
            .replace(/\r\n?/g, '\n')
            .trim();

        return value
            .split('\n')
            .map(function (line) {
                return line.replace(/[ \t]+/g, ' ').trim();
            })
            .filter(function (line, index, list) {
                return line || (
                    index > 0 &&
                    index < list.length - 1 &&
                    list[index - 1]
                );
            })
            .join('\n')
            .trim();
    }

    function renderAiOrderExtractResult(modal) {
        if (!modal) return;

        const resultBox = modal.querySelector(
            '.path-ai-order-extract-result-text'
        );
        const sourceBox = modal.querySelector(
            '.path-ai-order-extract-source'
        );
        const copyButton = modal.querySelector(
            '.path-ai-copy-extract'
        );
        const clearButton = modal.querySelector(
            '.path-ai-clear-extract'
        );

        if (resultBox) {
            resultBox.value = state.aiOrderExtractResult || '';
        }

        if (sourceBox) {
            sourceBox.textContent = state.aiOrderExtractSource
                ? '来源：' + state.aiOrderExtractSource
                : '尚未提取当前页医嘱。';
        }

        if (copyButton) {
            copyButton.disabled = Boolean(state.aiBusy) ||
                !String(state.aiOrderExtractResult || '').trim();
        }

        if (clearButton) {
            clearButton.disabled = Boolean(state.aiBusy) ||
                !String(state.aiOrderExtractResult || '').trim();
        }
    }

    async function copyTextCompat(textValue) {
        const value = String(textValue || '');

        if (!value.trim()) {
            return false;
        }

        try {
            if (
                navigator.clipboard &&
                typeof navigator.clipboard.writeText === 'function'
            ) {
                await navigator.clipboard.writeText(value);
                return true;
            }
        }
        catch (error) {
            // 当前HIS通常运行在HTTP内网页面，Clipboard API可能被浏览器拒绝。
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        Object.assign(textarea.style, {
            position: 'fixed',
            left: '-9999px',
            top: '0',
            opacity: '0'
        });
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        let copied = false;

        try {
            copied = Boolean(document.execCommand('copy'));
        }
        catch (error) {
            copied = false;
        }

        textarea.remove();
        return copied;
    }

    async function extractCurrentPageOrderKeyInfoWithAi(modal) {
        if (
            state.running ||
            state.bulkDeletingOrders ||
            state.aiBusy
        ) {
            showStatus(
                '当前已有任务正在执行。',
                'warning'
            );
            return;
        }

        const settings = getAiRequestSettings(modal);
        const promptInput = modal.querySelector(
            '.path-ai-order-extract-prompt'
        );
        const customPrompt = String(
            promptInput ? promptInput.value : ''
        ).trim();

        GM_setValue(
            KEYS.aiOrderExtractPrompt,
            customPrompt
        );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showStatus(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        if (!customPrompt) {
            showStatus(
                '当前页医嘱提取提示词不能为空。',
                'warning'
            );
            return;
        }

        showStatus('正在读取当前页面医嘱……');
        await sleep(80);

        const detected = detectCurrentPageOrders();
        const orders = (detected.items || [])
            .filter(function (item) {
                return Boolean(plain(item.name));
            })
            .map(aiItemPayload);

        if (!orders.length) {
            showStatus(
                '当前页面未识别到可提取的医嘱。\n' +
                '请先打开“医嘱查询”或具体医嘱录入标签页，并确保列表中已有可见医嘱。',
                'warning'
            );
            return;
        }

        const solidifyInput = modal.querySelector(
            '.path-ai-order-extract-solidify'
        );
        const solidified = solidifyInput
            ? Boolean(solidifyInput.checked)
            : clinicalPathwayPromptSolidified('order');

        GM_setValue(
            KEYS.aiOrderExtractPromptSolidified,
            solidified
        );

        const systemPrompt = clinicalPathwaySystemPrompt(
            'order',
            solidified
        );

        setAiBusy(modal, true, 'extract');
        showStatus(
            '正在调用DeepSeek提取“' +
            detected.source +
            '”的' +
            orders.length +
            '条医嘱关键信息……'
        );

        try {
            const result = await deepSeekJsonRequest(
                settings.apiKey,
                settings.model,
                systemPrompt,
                {
                    source: detected.source,
                    customPrompt: customPrompt,
                    currentPageOrders: orders
                },
                4500
            );

            const output = normalizeAiOrderExtractResult(result);

            if (!output) {
                throw new Error('DeepSeek未返回可用的医嘱提取结果');
            }

            state.aiOrderExtractResult = output;
            state.aiOrderExtractSource =
                detected.source + '｜' + orders.length + '条医嘱';
            renderAiOrderExtractResult(modal);

            showStatus(
                '当前页医嘱关键信息提取完成。\n' +
                '来源：' + detected.source +
                '；共' + orders.length + '条。',
                'success'
            );
        }
        catch (error) {
            state.aiOrderExtractResult = '';
            state.aiOrderExtractSource = '';
            renderAiOrderExtractResult(modal);
            showStatus(
                error.message,
                'error'
            );
        }
        finally {
            setAiBusy(modal, false, '');
            renderAiOrderExtractResult(modal);
        }
    }


    function diagnosisTextFromElement(element) {
        if (!element) return '';

        if (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)) {
            if (element.tagName === 'SELECT') {
                const option = element.options && element.selectedIndex >= 0
                    ? element.options[element.selectedIndex]
                    : null;
                return plain(
                    option
                        ? option.textContent || option.value
                        : element.value
                );
            }

            return plain(element.value || '');
        }

        return plain(element.innerText || element.textContent || '');
    }

    function diagnosisElementMetaText(element) {
        if (!element || !element.getAttribute) return '';

        return plain([
            element.id || '',
            element.className || '',
            element.getAttribute('name') || '',
            element.getAttribute('title') || '',
            element.getAttribute('placeholder') || '',
            element.getAttribute('aria-label') || '',
            element.getAttribute('data-field') || '',
            element.getAttribute('data-name') || ''
        ].join(' '));
    }

    function currentPageVisibleTextForDiagnosis(doc, maxChars) {
        if (!doc || !doc.body) return '';

        const limit = Math.max(2000, Number(maxChars) || 18000);
        const chunks = [];
        let length = 0;
        const win = doc.defaultView;
        const NodeFilterRef = win && win.NodeFilter
            ? win.NodeFilter
            : NodeFilter;
        let walker = null;

        try {
            walker = doc.createTreeWalker(
                doc.body,
                NodeFilterRef.SHOW_TEXT,
                {
                    acceptNode: function (node) {
                        const parent = node && node.parentElement;

                        if (!parent) {
                            return NodeFilterRef.FILTER_REJECT;
                        }

                        if (
                            parent.closest('#' + IDS.modal) ||
                            parent.closest('#' + IDS.panel) ||
                            parent.closest('#' + IDS.status) ||
                            parent.closest('script,style,noscript,template')
                        ) {
                            return NodeFilterRef.FILTER_REJECT;
                        }

                        if (!isVisible(parent)) {
                            return NodeFilterRef.FILTER_REJECT;
                        }

                        const value = plain(node.nodeValue || '');

                        return value
                            ? NodeFilterRef.FILTER_ACCEPT
                            : NodeFilterRef.FILTER_REJECT;
                    }
                }
            );
        }
        catch (error) {
            walker = null;
        }

        if (walker) {
            let node = walker.nextNode();

            while (node && length < limit) {
                const value = plain(node.nodeValue || '');

                if (value) {
                    chunks.push(value);
                    length += value.length + 1;
                }

                node = walker.nextNode();
            }
        }

        Array.from(doc.querySelectorAll(
            'input:not([type="hidden"]),textarea,select,[contenteditable="true"]'
        ))
            .filter(function (element) {
                return isVisible(element) &&
                    !element.closest('#' + IDS.modal) &&
                    !element.closest('#' + IDS.panel);
            })
            .forEach(function (element) {
                if (length >= limit) return;

                const meta = diagnosisElementMetaText(element);
                const value = diagnosisTextFromElement(element);

                if (!value) return;

                const combined = meta
                    ? meta + '：' + value
                    : value;

                chunks.push(combined);
                length += combined.length + 1;
            });

        return chunks.join('\n').slice(0, limit);
    }

    function collectCurrentPageDiagnosisContext() {
        const DIAGNOSIS_LABEL_PATTERN =
            /(入院诊断|初步诊断|西医诊断|西医主要诊断|西医次要诊断|主要诊断|次要诊断|诊断名称|临床诊断|出院诊断|诊断)/i;
        const candidateChunks = [];
        const fallbackChunks = [];
        const seen = new Set();

        function appendCandidate(value) {
            const textValue = String(value || '')
                .replace(/\r\n?/g, '\n')
                .split('\n')
                .map(function (line) {
                    return line.replace(/[ \t]+/g, ' ').trim();
                })
                .filter(Boolean)
                .join('\n')
                .trim();

            if (!textValue) return;

            const key = normalize(textValue).slice(0, 5000);

            if (!key || seen.has(key)) return;

            seen.add(key);
            candidateChunks.push(textValue.slice(0, 9000));
        }

        allDocuments().forEach(function (doc, docIndex) {
            if (!doc || !doc.body) return;

            const pageText = currentPageVisibleTextForDiagnosis(
                doc,
                18000
            );

            if (pageText) {
                fallbackChunks.push(
                    '页面' + (docIndex + 1) + '：\n' + pageText
                );

                let match = null;
                const pattern = new RegExp(
                    DIAGNOSIS_LABEL_PATTERN.source,
                    'ig'
                );
                let count = 0;

                while (
                    (match = pattern.exec(pageText)) &&
                    count < 10
                ) {
                    const start = Math.max(0, match.index - 260);
                    const end = Math.min(
                        pageText.length,
                        match.index + 1900
                    );

                    appendCandidate(
                        pageText.slice(start, end)
                    );
                    count += 1;
                }
            }

            Array.from(doc.querySelectorAll(
                'table,.layui-table-view,.datagrid,[role="grid"]'
            ))
                .filter(isVisible)
                .filter(function (root) {
                    return !root.closest('#' + IDS.modal) &&
                        !root.closest('#' + IDS.panel);
                })
                .forEach(function (root) {
                    const headers = Array.from(
                        root.querySelectorAll(
                            'thead th,th,[role="columnheader"]'
                        )
                    )
                        .filter(isVisible)
                        .map(function (header) {
                            return plain(
                                header.innerText ||
                                header.textContent
                            );
                        })
                        .join(' ');

                    if (
                        DIAGNOSIS_LABEL_PATTERN.test(headers) ||
                        DIAGNOSIS_LABEL_PATTERN.test(
                            plain(root.innerText || root.textContent).slice(0, 1200)
                        )
                    ) {
                        appendCandidate(
                            root.innerText || root.textContent
                        );
                    }
                });

            Array.from(doc.querySelectorAll(
                'label,.form-group,.layui-form-item,.el-form-item,.control-group,.input-group,tr,[role="row"]'
            ))
                .filter(isVisible)
                .filter(function (element) {
                    return !element.closest('#' + IDS.modal) &&
                        !element.closest('#' + IDS.panel);
                })
                .forEach(function (element) {
                    const value = plain(
                        element.innerText || element.textContent
                    );

                    if (
                        value &&
                        value.length <= 4000 &&
                        DIAGNOSIS_LABEL_PATTERN.test(value)
                    ) {
                        appendCandidate(value);
                    }
                });

            Array.from(doc.querySelectorAll(
                'input,textarea,select,[contenteditable="true"]'
            ))
                .filter(function (element) {
                    return !element.closest('#' + IDS.modal) &&
                        !element.closest('#' + IDS.panel);
                })
                .forEach(function (element) {
                    const meta = diagnosisElementMetaText(element);
                    const value = diagnosisTextFromElement(element);

                    if (
                        value &&
                        DIAGNOSIS_LABEL_PATTERN.test(meta)
                    ) {
                        appendCandidate(meta + '：' + value);
                    }
                });
        });

        const diagnosisText = candidateChunks
            .join('\n---\n')
            .slice(0, 26000)
            .trim();
        const fallbackText = fallbackChunks
            .join('\n---\n')
            .slice(0, 26000)
            .trim();

        return {
            source: diagnosisText
                ? '当前页诊断相关区域'
                : '当前页可见文本（未定位到明确诊断区域）',
            text: diagnosisText || fallbackText,
            focused: Boolean(diagnosisText)
        };
    }

    function normalizeAiDiagnosisExtractResult(raw) {
        return normalizeAiOrderExtractResult(raw)
            .split('\n')
            .map(function (line) {
                return line.trim();
            })
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    function renderAiDiagnosisExtractResult(modal) {
        if (!modal) return;

        const resultBox = modal.querySelector(
            '.path-ai-diagnosis-extract-result-text'
        );
        const sourceBox = modal.querySelector(
            '.path-ai-diagnosis-extract-source'
        );
        const copyButton = modal.querySelector(
            '.path-ai-copy-diagnosis-extract'
        );
        const clearButton = modal.querySelector(
            '.path-ai-clear-diagnosis-extract'
        );

        if (resultBox) {
            resultBox.value = state.aiDiagnosisExtractResult || '';
        }

        if (sourceBox) {
            sourceBox.textContent = state.aiDiagnosisExtractSource
                ? '来源：' + state.aiDiagnosisExtractSource
                : '尚未提取基本诊断信息。';
        }

        if (copyButton) {
            copyButton.disabled = Boolean(state.aiBusy) ||
                !String(state.aiDiagnosisExtractResult || '').trim();
        }

        if (clearButton) {
            clearButton.disabled = Boolean(state.aiBusy) ||
                !String(state.aiDiagnosisExtractResult || '').trim();
        }
    }

    async function extractCurrentPageDiagnosisInfoWithAi(modal) {
        if (
            state.running ||
            state.bulkDeletingOrders ||
            state.aiBusy
        ) {
            showStatus(
                '当前已有任务正在执行。',
                'warning'
            );
            return;
        }

        const settings = getAiRequestSettings(modal);
        const promptInput = modal.querySelector(
            '.path-ai-diagnosis-extract-prompt'
        );
        const customPrompt = String(
            promptInput ? promptInput.value : ''
        ).trim();

        GM_setValue(
            KEYS.aiDiagnosisExtractPrompt,
            customPrompt
        );

        if (!suiteGlobalAiHasApiKey(settings.apiKey)) {
            showStatus(
                '请先配置AI API Key（本地DeepSeek或悬浮框管理器全局GLM）。',
                'error'
            );
            return;
        }

        if (!customPrompt) {
            showStatus(
                '基本诊断信息提取提示词不能为空。',
                'warning'
            );
            return;
        }

        showStatus('正在读取当前页面诊断相关信息……');
        await sleep(80);

        const detected = collectCurrentPageDiagnosisContext();

        if (!String(detected.text || '').trim()) {
            showStatus(
                '当前页面未读取到可供诊断提取的文本。\n' +
                '请打开包含入院诊断、初步诊断或患者诊断信息的页面后再试。',
                'warning'
            );
            return;
        }

        const solidifyInput = modal.querySelector(
            '.path-ai-diagnosis-extract-solidify'
        );
        const solidified = solidifyInput
            ? Boolean(solidifyInput.checked)
            : clinicalPathwayPromptSolidified('diagnosis');

        GM_setValue(
            KEYS.aiDiagnosisExtractPromptSolidified,
            solidified
        );

        const systemPrompt = clinicalPathwaySystemPrompt(
            'diagnosis',
            solidified
        );

        setAiBusy(modal, true, 'diagnosis-extract');
        showStatus(
            '正在调用DeepSeek提取基本诊断信息……'
        );

        try {
            const result = await deepSeekJsonRequest(
                settings.apiKey,
                settings.model,
                systemPrompt,
                {
                    source: detected.source,
                    customPrompt: customPrompt,
                    currentPageText: detected.text
                },
                3000
            );

            const output = normalizeAiDiagnosisExtractResult(result);

            if (!output) {
                throw new Error('DeepSeek未返回可用的诊断提取结果');
            }

            state.aiDiagnosisExtractResult = output;
            state.aiDiagnosisExtractSource =
                detected.source +
                '｜' +
                detected.text.length +
                '字符';
            renderAiDiagnosisExtractResult(modal);

            showStatus(
                '基本诊断信息提取完成。',
                'success'
            );
        }
        catch (error) {
            state.aiDiagnosisExtractResult = '';
            state.aiDiagnosisExtractSource = '';
            renderAiDiagnosisExtractResult(modal);
            showStatus(
                error.message,
                'error'
            );
        }
        finally {
            setAiBusy(modal, false, '');
            renderAiDiagnosisExtractResult(modal);
        }
    }

    function loadLibrary() {
        state.library = normalizeLibrary(GM_getValue(KEYS.library, clone(DEFAULT_LIBRARY)));
        saveLibrary();
    }

    function saveLibrary() {
        GM_setValue(KEYS.library, state.library);
    }

    function currentCategory() {
        const saved = GM_getValue(KEYS.category, '');
        return state.library.categories.find(item => item.id === saved) || state.library.categories[0] || null;
    }

    function currentPathway() {
        const category = currentCategory();
        if (!category) return null;
        const saved = GM_getValue(KEYS.pathway, '');
        return category.pathways.find(item => item.id === saved) || category.pathways[0] || null;
    }

    function currentGroup() {
        const pathway = currentPathway();
        if (!pathway) return null;
        const saved = GM_getValue(KEYS.group, '');
        return pathway.groups.find(item => item.id === saved) || pathway.groups[0] || null;
    }

    function isVisible(element) {
        if (!element || !element.isConnected) return false;
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    }

    function allDocuments() {
        const docs = [];
        const seen = new Set();
        function collect(doc) {
            if (!doc || seen.has(doc)) return;
            seen.add(doc);
            docs.push(doc);
            let frames = [];
            try { frames = Array.from(doc.querySelectorAll('iframe,frame')); } catch (error) { return; }
            frames.forEach(frame => {
                try { collect(frame.contentDocument || frame.contentWindow.document); } catch (error) { /* skip */ }
            });
        }
        collect(document);
        return docs;
    }

    function eventPoint(element) {
        const rect = element.getBoundingClientRect();

        return {
            x: Math.round(rect.left + Math.max(1, rect.width) / 2),
            y: Math.round(rect.top + Math.max(1, rect.height) / 2)
        };
    }

    function dispatchPointerMouse(element, type, point, detail) {
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

    function realClick(element) {
        if (!element) return;

        const point = eventPoint(element);

        dispatchPointerMouse(element, 'pointerdown', point, 1);
        dispatchPointerMouse(element, 'mousedown', point, 1);
        dispatchPointerMouse(element, 'pointerup', point, 1);
        dispatchPointerMouse(element, 'mouseup', point, 1);
        dispatchPointerMouse(element, 'click', point, 1);

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

    function realDoubleClick(element) {
        if (!element) return;

        const point = eventPoint(element);

        realClick(element);
        realClick(element);
        dispatchPointerMouse(element, 'dblclick', point, 2);
    }

    function clickDocumentPoint(doc, x, y, fallback) {
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

        dispatchPointerMouse(target, 'pointerdown', point, 1);
        dispatchPointerMouse(target, 'mousedown', point, 1);
        dispatchPointerMouse(target, 'pointerup', point, 1);
        dispatchPointerMouse(target, 'mouseup', point, 1);
        dispatchPointerMouse(target, 'click', point, 1);

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

    function pressKey(element, key, code) {
        if (!element) return;
        const win = element.ownerDocument.defaultView;
        const options = { key: key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true };
        element.dispatchEvent(new win.KeyboardEvent('keydown', options));
        element.dispatchEvent(new win.KeyboardEvent('keyup', options));
    }

    function setInputValue(doc, input, value) {
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

    function buttonText(element) {
        if (!element) return '';
        const values = [element.tagName === 'INPUT' ? element.value : '', element.innerText || '', element.textContent || '', element.getAttribute('title') || '', element.getAttribute('aria-label') || ''].map(value => String(value || '').trim()).filter(Boolean);
        const unique = [];
        values.forEach(value => { if (!unique.some(old => normalize(old) === normalize(value))) unique.push(value); });
        return unique.join(' ');
    }

    function showStatus(message, type) {
        let box = document.getElementById(IDS.status);
        if (!box) {
            box = document.createElement('div');
            box.id = IDS.status;
            document.body.appendChild(box);
        }
        const colors = { normal: '#159bd3', success: '#20985b', warning: '#b7791f', error: '#dc4c40' };
        Object.assign(box.style, { position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483647', minWidth: '360px', maxWidth: '820px', padding: '12px 15px', borderRadius: '6px', background: colors[type || 'normal'], color: '#fff', fontSize: '13px', lineHeight: '1.7', whiteSpace: 'pre-line', boxShadow: '0 4px 15px rgba(0,0,0,.28)' });
        box.textContent = message;
        clearTimeout(box.hideTimer);
        box.hideTimer = setTimeout(() => box.remove(), type === 'error' ? 20000 : 10000);
    }

    async function checkpoint() {
        if (state.abortRequested) {
            const error = new Error('用户已中止临床路径录入');
            error.name = 'AbortError';
            throw error;
        }
        while (state.paused) {
            await sleep(180);
            if (state.abortRequested) {
                const error = new Error('用户已中止临床路径录入');
                error.name = 'AbortError';
                throw error;
            }
        }
    }

    function aliasesFor(def, field) {
        if (field === 'name' && def.nameAliases) return def.nameAliases;
        return FIELD_ALIASES[field] || [field];
    }

    async function activateTab(tabName) {
        const candidates = [];
        allDocuments().forEach(doc => {
            Array.from(doc.querySelectorAll('a,li,button,[role="tab"]')).filter(isVisible).filter(element => !element.closest('#' + IDS.panel) && !element.closest('#' + IDS.modal)).forEach(element => {
                if (normalize(buttonText(element)) !== normalize(tabName)) return;
                const rect = element.getBoundingClientRect();
                const cls = String(element.className || '') + ' ' + String(element.parentElement ? element.parentElement.className : '');
                let score = rect.top + rect.left / 30;
                if (/active|selected|current/i.test(cls)) score -= 5000;
                if (element.getAttribute('role') === 'tab') score -= 1200;
                candidates.push({ element, score });
            });
        });
        if (!candidates.length) throw new Error('未找到“' + tabName + '”标签页');
        candidates.sort((a, b) => a.score - b.score);
        realClick(candidates[0].element);
        await sleep(450);
        const deadline = Date.now() + 7000;
        while (Date.now() < deadline) {
            const context = findTableContext(tabName);
            if (context) return context;
            await sleep(180);
        }
        throw new Error('已点击“' + tabName + '”，但未识别到对应表格');
    }

    function actualTable(root) {
        if (!root) return null;
        if (root.tagName === 'TABLE') return root;
        const tables = Array.from(root.querySelectorAll('table')).filter(isVisible).sort((a, b) => b.querySelectorAll('td').length - a.querySelectorAll('td').length);
        return tables[0] || root;
    }

    function tableRows(table) {
        const seen = new Set();
        return Array.from(table.querySelectorAll('tbody tr,.layui-table-body tr,.datagrid-body .datagrid-row,.datagrid-row,[role="row"]')).filter(isVisible).filter(row => {
            if (seen.has(row) || row.closest('#' + IDS.modal) || row.querySelector('th')) return false;
            seen.add(row);
            const cells = Array.from(row.querySelectorAll('td,[role="gridcell"]')).filter(isVisible);
            return cells.length >= 4 && !/暂无数据|无数据|没有数据/.test(normalize(row.innerText || row.textContent));
        }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    }

    function headerElements(table) {
        return Array.from(table.querySelectorAll('thead th,th,[role="columnheader"]')).filter(isVisible);
    }

    function headerCenters(table, def) {
        const centers = {};
        const headers = headerElements(table);
        Object.keys(FIELD_ALIASES).forEach(field => {
            const aliases = aliasesFor(def, field).map(normalize);
            const exact = headers.filter(header => aliases.includes(normalize(header.innerText || header.textContent)));
            const partial = headers.filter(header => aliases.some(alias => normalize(header.innerText || header.textContent).includes(alias)));
            const candidates = exact.length ? exact : partial;
            if (!candidates.length) return;
            candidates.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
            const rect = candidates[0].getBoundingClientRect();
            centers[field] = rect.left + rect.width / 2;
        });
        return centers;
    }

    /*
     * 新版中草药页面可能把表头、滚动数据区和固定列拆成多个table。
     * 必须从候选外层容器采集数据行，并按同一纵向位置合并固定列克隆，
     * 否则创建首行后仍会被误判为0行，或一味药被计算成两行。
     */
    function herbTableRows(root) {
        if (!root) return [];

        const rows = Array.from(root.querySelectorAll([
            'tbody tr',
            '.layui-table-body tr',
            '.datagrid-body .datagrid-row',
            '.datagrid-row',
            '[role="row"]'
        ].join(',')))
            .filter(isVisible)
            .filter(function (row) {
                if (row.closest('#' + IDS.modal) ||
                    row.closest('#' + IDS.panel) ||
                    row.querySelector('th')) {
                    return false;
                }

                const cells = Array.from(row.querySelectorAll(
                    'td,[role="gridcell"]'
                )).filter(isVisible);
                const text = normalize(
                    row.innerText || row.textContent
                );

                return cells.length >= 6 &&
                    text &&
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

        unique.sort(function (a, b) {
            return a.getBoundingClientRect().top -
                b.getBoundingClientRect().top;
        });

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
            const existingCells = rowCells(existing).length;
            const currentCells = rowCells(row).length;

            if (currentCells > existingCells ||
                (currentCells === existingCells &&
                    rect.width > existingRect.width)) {
                visualRows[duplicateIndex] = row;
            }
        });

        return visualRows.sort(function (a, b) {
            return a.getBoundingClientRect().top -
                b.getBoundingClientRect().top;
        });
    }

    function herbDataRoot(root, table, rows) {
        if (!rows || !rows.length) {
            return table || root;
        }

        const firstRoot = rows[0].closest([
            'table',
            '.layui-table-body',
            '.datagrid-body',
            '[role="rowgroup"]',
            '[role="grid"]'
        ].join(','));

        if (firstRoot && rows.every(function (row) {
            return firstRoot.contains(row);
        })) {
            return firstRoot;
        }

        return root || table;
    }

    function findHerbTableContext() {
        const def = TAB_DEFS['中草药'];
        const candidates = [];

        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll(
                'table,.layui-table-view,.datagrid,[role="grid"]'
            ))
                .filter(isVisible)
                .filter(function (root) {
                    return !root.closest('#' + IDS.modal) &&
                        !root.closest('#' + IDS.panel);
                })
                .forEach(function (root) {
                    const table = actualTable(root);
                    const headerText = normalize(
                        headerElements(root)
                            .map(function (header) {
                                return header.innerText || header.textContent;
                            })
                            .join(' ') ||
                        headerElements(table)
                            .map(function (header) {
                                return header.innerText || header.textContent;
                            })
                            .join(' ')
                    );
                    const rootText = normalize(
                        root.innerText || root.textContent
                    );
                    const signalText = headerText || rootText;
                    const perRowKeywords = [
                        '名称', '剂数', '剂量', '单位',
                        '用法', '代煎', '操作'
                    ];
                    const unifiedKeywords = [
                        '名称', '开始时间', '规格', '剂量',
                        '单位', '自付比例', '嘱托', '操作'
                    ];
                    const perRowHits = perRowKeywords.filter(function (key) {
                        return signalText.includes(normalize(key));
                    }).length;
                    const unifiedHits = unifiedKeywords.filter(function (key) {
                        return signalText.includes(normalize(key));
                    }).length;
                    const hasPerRowPrescriptionColumns = [
                        '剂数', '用法', '代煎'
                    ].filter(function (key) {
                        return signalText.includes(normalize(key));
                    }).length >= 2;
                    let entryMode = '';

                    if (perRowHits >= 6 &&
                        hasPerRowPrescriptionColumns) {
                        entryMode = 'per-row';
                    }
                    else if (unifiedHits >= 6 &&
                        ['名称', '剂量', '单位', '操作'].every(function (key) {
                            return signalText.includes(normalize(key));
                        })) {
                        entryMode = 'unified-footer';
                    }

                    if (!entryMode) return;

                    const rows = herbTableRows(root);
                    const rect = root.getBoundingClientRect();
                    const hits = entryMode === 'per-row'
                        ? perRowHits
                        : unifiedHits;
                    let score = hits * 5000 + rows.length * 600;

                    if (rootText.includes(normalize('中草药'))) {
                        score += 2000;
                    }

                    if (headerText) score += 1200;
                    score -= rect.width * rect.height / 100000;

                    candidates.push({
                        tabName: '中草药',
                        def: def,
                        doc: doc,
                        root: root,
                        table: table,
                        dataRoot: herbDataRoot(root, table, rows),
                        rows: rows,
                        centers: headerCenters(root, def),
                        fieldFallback: entryMode === 'unified-footer'
                            ? HERB_UNIFIED_FOOTER_FALLBACK
                            : def.fallback,
                        entryMode: entryMode,
                        score: score
                    });
                });
        });

        if (!candidates.length) return null;

        const withRows = candidates.filter(function (candidate) {
            return candidate.rows.length > 0;
        });
        const pool = withRows.length ? withRows : candidates;

        pool.sort(function (a, b) {
            return b.score - a.score;
        });

        return pool[0];
    }

    function findTableContext(tabName) {
        const def = TAB_DEFS[tabName];
        if (!def) return null;

        if (tabName === '中草药') {
            return findHerbTableContext();
        }

        const candidates = [];
        allDocuments().forEach(doc => {
            Array.from(doc.querySelectorAll('table,.layui-table-view,.datagrid,[role="grid"]')).filter(isVisible).filter(root => !root.closest('#' + IDS.modal)).forEach(root => {
                const text = normalize(root.innerText || root.textContent);
                const hits = def.required.filter(group => group.some(keyword => text.includes(normalize(keyword)))).length;
                if (hits < Math.max(2, def.required.length - 1)) return;
                const table = actualTable(root);
                const rows = tableRows(table);
                candidates.push({ tabName, def, doc, root, table, rows, centers: headerCenters(table, def), score: hits * 6000 + rows.length * 400 });
            });
        });
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0] || null;
    }

    function rowCells(row) {
        return Array.from(row.querySelectorAll('td,[role="gridcell"]')).filter(isVisible).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    }

    function cellByField(context, row, field) {
        const cells = rowCells(row);
        const center = context.centers[field];
        if (Number.isFinite(center)) {
            const covering = cells.filter(cell => {
                const rect = cell.getBoundingClientRect();
                return center >= rect.left - 2 && center <= rect.right + 2;
            });
            if (covering.length) return covering.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
            const nearest = cells.map(cell => {
                const rect = cell.getBoundingClientRect();
                return { cell, distance: Math.abs(rect.left + rect.width / 2 - center) };
            }).sort((a, b) => a.distance - b.distance);
            if (nearest[0]) return nearest[0].cell;
        }
        const fallback = context.fieldFallback || context.def.fallback || {};
        const index = fallback[field];
        return Number.isInteger(index) ? cells[index] || null : null;
    }

    function visibleInput(cell) {
        return cell ? Array.from(cell.querySelectorAll('input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]')).filter(isVisible)[0] || null : null;
    }

    function nativeSelect(cell) {
        return cell ? Array.from(cell.querySelectorAll('select:not([disabled])'))[0] || null : null;
    }

    async function waitContext(tabName, requireRows) {
        const deadline = Date.now() + 7000;
        while (Date.now() < deadline) {
            const context = findTableContext(tabName);
            if (context && (requireRows === false || context.rows.length)) return context;
            await sleep(180);
        }
        throw new Error('未识别到“' + tabName + '”表格' + (requireRows === false ? '' : '或可填写医嘱行'));
    }

    function normalizeActionLabel(text) {
        return String(text || '').replace(/[\uE000-\uF8FF]/g, '').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').replace(/\s+/g, '').replace(/[：:·•|｜]/g, '').toLowerCase();
    }

    function findNewOrderButton(context) {
        const candidates = [];
        allDocuments().forEach(doc => {
            Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],[onclick],.layui-btn,.btn,.easyui-linkbutton,.l-btn,.ui-button,.el-button,span,div')).filter(isVisible).forEach(element => {
                const rect = element.getBoundingClientRect();
                if (rect.width > 650 || rect.height > 180) return;
                const label = normalizeActionLabel(buttonText(element));
                if (!(label.includes('新医嘱') || label.includes('新增医嘱') || label.includes('新建医嘱'))) return;
                const clickable = element.closest('button,a,[role="button"],[onclick],.layui-btn,.btn,.easyui-linkbutton,.l-btn,.ui-button,.el-button') || element;
                const cRect = clickable.getBoundingClientRect();
                const height = doc.defaultView.innerHeight;
                const width = doc.defaultView.innerWidth;
                let score = Math.abs(height - cRect.bottom) + Math.abs(width * 0.72 - (cRect.left + cRect.width / 2)) / 5;
                if (doc === context.doc) score -= 4500;
                if (cRect.top > height * 0.55) score -= 2500;
                candidates.push({ element: clickable, score });
            });
        });
        candidates.sort((a, b) => a.score - b.score);
        return candidates[0] || null;
    }

    function plusButton(context, row) {
        const cell = cellByField(context, row, 'operation') || context.root;
        const candidates = Array.from(cell.querySelectorAll('button,a,[role="button"],i,span,div')).filter(isVisible).filter(element => /(?:^\+$|增加|新增|添加|add|plus|icon-plus|fa-plus|layui-icon-add)/i.test([element.innerText || '', element.textContent || '', element.getAttribute('title') || '', element.className || ''].join(' ').trim()));
        return candidates[0] ? candidates[0].closest('button,a,[role="button"]') || candidates[0] : null;
    }

    async function ensureRows(tabName, count) {
        let context = await waitContext(tabName, false);
        if (!context.rows.length && count > 0) {
            const found = findNewOrderButton(context);
            if (!found) throw new Error('“' + tabName + '”没有医嘱行且未找到“新医嘱”按钮');
            const before = context.rows.length;
            realClick(found.element);
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
                await sleep(160);
                context = findTableContext(tabName);
                if (context && context.rows.length > before) break;
            }
            if (!context || !context.rows.length) throw new Error('已点击“新医嘱”，但“' + tabName + '”未创建首行');
        }
        while (context.rows.length < count) {
            await checkpoint();
            const plus = plusButton(context, context.rows[context.rows.length - 1]);
            if (!plus) throw new Error('“' + tabName + '”未找到右侧“＋”按钮');
            const before = context.rows.length;
            realClick(plus);
            const deadline = Date.now() + 4200;
            let increased = false;
            while (Date.now() < deadline) {
                await sleep(150);
                context = findTableContext(tabName);
                if (context && context.rows.length > before) { increased = true; break; }
            }
            if (!increased) throw new Error('点击“＋”后“' + tabName + '”行数未增加');
        }
        return context;
    }

    function findOption(select, text) {
        const target = normalize(text);
        const options = Array.from(select.options || []);
        return options.find(option => normalize(option.textContent) === target) || options.find(option => normalize(option.textContent).includes(target) || target.includes(normalize(option.textContent))) || null;
    }

    function triggerSelect(doc, select, option) {
        const win = doc.defaultView;
        select.value = option.value;
        Array.from(select.options || []).forEach(item => { item.selected = item === option; });
        if (win.jQuery) win.jQuery(select).val(option.value).trigger('input').trigger('change');
        select.dispatchEvent(new win.Event('input', { bubbles: true }));
        select.dispatchEvent(new win.Event('change', { bubbles: true }));
        try { if (win.layui && win.layui.form) win.layui.form.render('select'); } catch (error) { /* skip */ }
    }

    async function chooseVisualOption(doc, cell, text) {
        const visual = Array.from(cell.querySelectorAll('.layui-form-select,.select2-container,.el-select,.ant-select,.ivu-select,.combo,.textbox.combo,[role="combobox"]')).filter(isVisible)[0] || null;
        const clickTarget = visual ? visual.querySelector('.layui-select-title input,.layui-select-title,.select2-selection,.el-input,.ant-select-selector,.ivu-select-selection,.textbox-text,[role="combobox"]') || visual : visibleInput(cell);
        if (!clickTarget) return false;
        realClick(clickTarget);
        await sleep(180);
        const target = normalize(text);
        const options = Array.from(doc.querySelectorAll('.layui-form-select dl dd,.select2-results__option,.dropdown-menu li,.dropdown-menu a,[role="option"],.el-select-dropdown__item,.ant-select-item-option,.ivu-select-item,.combobox-item')).filter(isVisible).filter(element => normalize(element.innerText || element.textContent) === target);
        if (!options.length) { pressKey(clickTarget, 'Escape', 27); return false; }
        realClick(options[0]);
        await sleep(160);
        return true;
    }

    function normalizeFrequencyValue(value) {
        const source = normalize(value);
        const aliases = {
            '每日一次': 'qd',
            '一天一次': 'qd',
            '每日1次': 'qd',
            '每日两次': 'bid',
            '每日二次': 'bid',
            '一天两次': 'bid',
            '每日2次': 'bid',
            '每日三次': 'tid',
            '一天三次': 'tid',
            '每日3次': 'tid',
            '每日四次': 'qid',
            '一天四次': 'qid',
            '每日4次': 'qid',
            '睡前': 'qn',
            '每晚睡前': 'qn',
            '必要时': 'prn',
            '立即': 'st',
            '隔日一次': 'qod',
            '每周一次': 'qw',
            '每小时一次': 'qh'
        };

        return aliases[source] || String(value || '').trim().toLowerCase();
    }

    function currentCellControlValue(cell) {
        if (!cell) return '';

        const select = nativeSelect(cell);

        if (select) {
            const selected = select.options && select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;

            return plain(
                selected
                    ? selected.textContent || selected.value
                    : select.value
            );
        }

        const input = visibleInput(cell);

        if (input) {
            return plain(
                input.isContentEditable
                    ? input.textContent
                    : input.value
            );
        }

        const directText = Array.from(cell.childNodes || [])
            .filter(function (node) {
                return node.nodeType === 3;
            })
            .map(function (node) {
                return node.nodeValue;
            })
            .join(' ');

        return plain(directText || cell.innerText || cell.textContent);
    }

    function fieldValueMatches(cell, desiredText) {
        const current = normalize(currentCellControlValue(cell));
        const target = normalize(desiredText);

        return Boolean(current && target && current === target);
    }

    const FREQUENCY_OPTION_VALUES = Object.freeze([
        'qd', 'bid', 'tid', 'qid', 'qn', 'prn', 'st', 'qod', 'qw',
        'q6h', 'q8h', 'q12h', 'q2h', 'qh', 'q3h', 'q4h', 'q72h',
        'biw', 'tiw', 'qow', '2w', '3w', '4w'
    ]);

    function clickablePopupOption(element) {
        if (!element) return null;

        if (/^(INPUT|BUTTON|A|LABEL|LI|DD)$/.test(element.tagName)) {
            return element;
        }

        return element.closest([
            'input:not([type="hidden"])',
            'button',
            'a',
            'label',
            'li',
            'dd',
            'td',
            '[role="option"]',
            '[role="button"]'
        ].join(',')) || element;
    }

    function popupElementText(element) {
        if (!element) return '';

        if (element.tagName === 'INPUT') {
            return plain(
                element.value ||
                element.getAttribute('value') ||
                element.getAttribute('title') ||
                element.getAttribute('aria-label')
            );
        }

        return plain(
            element.innerText ||
            element.textContent ||
            element.getAttribute('title') ||
            element.getAttribute('aria-label')
        );
    }

    function frequencyTokenCount(container) {
        if (!container || !container.querySelectorAll) {
            return 0;
        }

        const values = new Set();

        Array.from(container.querySelectorAll([
            'input:not([type="hidden"])',
            'button',
            'a',
            'label',
            'li',
            'dd',
            'td',
            'span',
            '[role="option"]',
            '[role="button"]'
        ].join(',')))
            .filter(isVisible)
            .forEach(function (element) {
                const value = normalize(
                    popupElementText(element)
                );

                if (FREQUENCY_OPTION_VALUES.includes(value)) {
                    values.add(value);
                }
            });

        return values.size;
    }

    function nearestFrequencyPanelScore(element) {
        let current = element;
        let best = 0;

        for (let level = 0;
            current && level < 6;
            level += 1) {
            const count = frequencyTokenCount(current);

            if (count > best) {
                best = count;
            }

            current = current.parentElement;
        }

        return best;
    }

    function collectFrequencyOptions(context, cell, desiredText) {
        const target = normalize(desiredText);
        const candidates = [];
        const seen = new Set();
        const cellRect = cell.getBoundingClientRect();

        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll([
                'input:not([type="hidden"])',
                'button',
                'a',
                'label',
                'li',
                'dd',
                'td',
                'span',
                'div',
                '[role="option"]',
                '[role="button"]'
            ].join(',')))
                .filter(isVisible)
                .forEach(function (element) {
                    if (seen.has(element) ||
                        element.closest('#' + IDS.modal) ||
                        element.closest('#' + IDS.panel)) {
                        return;
                    }

                    seen.add(element);

                    if (normalize(
                        popupElementText(element)
                    ) !== target) {
                        return;
                    }

                    const rect = element.getBoundingClientRect();

                    if (rect.width < 7 ||
                        rect.height < 7 ||
                        rect.width > 420 ||
                        rect.height > 150) {
                        return;
                    }

                    const tokenCount =
                        nearestFrequencyPanelScore(element);
                    let score = 0;

                    if (doc === context.doc) {
                        score -= 3000;
                    }
                    else {
                        score += 1200;
                    }

                    score -= tokenCount * 850;

                    if (/^(INPUT|BUTTON|A|LABEL|LI|DD)$/.test(
                        element.tagName
                    )) {
                        score -= 700;
                    }

                    if (doc === context.doc) {
                        const horizontal = Math.abs(
                            rect.left + rect.width / 2 -
                            (cellRect.left + cellRect.width / 2)
                        );
                        const vertical = Math.abs(
                            rect.top - cellRect.bottom
                        );

                        score += horizontal / 2 + vertical / 3;

                        if (rect.left >= cellRect.left - 260 &&
                            rect.left <= cellRect.right + 520) {
                            score -= 500;
                        }

                        if (rect.top >= cellRect.top - 40 &&
                            rect.top <= cellRect.bottom + 720) {
                            score -= 500;
                        }
                    }

                    let zIndex = 0;

                    try {
                        zIndex = Number(
                            doc.defaultView
                                .getComputedStyle(element)
                                .zIndex
                        );

                        if (!Number.isFinite(zIndex)) {
                            zIndex = 0;
                        }
                    }
                    catch (error) {
                        zIndex = 0;
                    }

                    score -= Math.min(
                        Math.max(zIndex, 0),
                        10000
                    ) / 100;

                    candidates.push({
                        element: element,
                        score: score,
                        tokenCount: tokenCount
                    });
                });
        });

        candidates.sort(function (a, b) {
            if (a.score !== b.score) {
                return a.score - b.score;
            }

            if (a.tokenCount !== b.tokenCount) {
                return b.tokenCount - a.tokenCount;
            }

            const rectA = a.element.getBoundingClientRect();
            const rectB = b.element.getBoundingClientRect();

            return rectA.width * rectA.height -
                rectB.width * rectB.height;
        });

        return candidates;
    }

    function findFrequencyOption(context, cell, desiredText) {
        const candidates = collectFrequencyOptions(
            context,
            cell,
            desiredText
        );

        return candidates[0]
            ? candidates[0].element
            : null;
    }

    function frequencyPopupIsOpen(context, cell) {
        return FREQUENCY_OPTION_VALUES.some(function (value) {
            return Boolean(
                findFrequencyOption(
                    context,
                    cell,
                    value
                )
            );
        });
    }

    async function waitForFrequencyOption(
        context,
        cell,
        desiredText,
        timeout
    ) {
        const deadline = Date.now() + (timeout || 1800);

        while (Date.now() < deadline) {
            const option = findFrequencyOption(
                context,
                cell,
                desiredText
            );

            if (option) {
                return option;
            }

            await sleep(60);
        }

        return null;
    }

    function editableFrequencyInputs(context, cell) {
        const inputs = [];

        function append(input) {
            if (!input ||
                !input.isConnected ||
                input.disabled ||
                input.type === 'hidden' ||
                inputs.includes(input)) {
                return;
            }

            inputs.push(input);
        }

        Array.from(cell.querySelectorAll([
            'input:not([type="hidden"])',
            'textarea',
            '[contenteditable="true"]'
        ].join(','))).forEach(append);

        const active = context.doc.activeElement;

        if (active &&
            active !== context.doc.body &&
            active !== context.doc.documentElement) {
            append(active);
        }

        return inputs;
    }

    function writeFrequencyEditorValue(
        context,
        input,
        desiredText
    ) {
        if (!input) return false;

        const win = context.doc.defaultView;

        try {
            if (input.isContentEditable) {
                input.textContent = desiredText;
            }
            else {
                const proto = input instanceof win.HTMLTextAreaElement
                    ? win.HTMLTextAreaElement.prototype
                    : win.HTMLInputElement.prototype;
                const descriptor =
                    Object.getOwnPropertyDescriptor(
                        proto,
                        'value'
                    );

                if (descriptor && descriptor.set) {
                    descriptor.set.call(
                        input,
                        desiredText
                    );
                }
                else {
                    input.value = desiredText;
                }

                input.setAttribute(
                    'value',
                    desiredText
                );
            }

            if (win.jQuery) {
                win.jQuery(input)
                    .val(desiredText)
                    .trigger('input')
                    .trigger('keyup')
                    .trigger('change');
            }

            input.dispatchEvent(
                new win.Event('input', {
                    bubbles: true
                })
            );
            input.dispatchEvent(
                new win.Event('change', {
                    bubbles: true
                })
            );

            pressKey(input, 'Enter', 13);
            pressKey(input, 'Tab', 9);

            try {
                input.blur();
            }
            catch (error) {
                // 忽略。
            }

            return true;
        }
        catch (error) {
            return false;
        }
    }

    async function openFrequencyEditor(
        context,
        row,
        cell
    ) {
        cell.scrollIntoView({
            block: 'center',
            inline: 'center',
            behavior: 'auto'
        });

        await sleep(120);

        const rect = cell.getBoundingClientRect();
        const points = [
            {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            },
            {
                x: rect.left + Math.max(8, rect.width * 0.2),
                y: rect.top + rect.height / 2
            },
            {
                x: rect.right - Math.max(8, rect.width * 0.2),
                y: rect.top + rect.height / 2
            }
        ];

        const descendants = Array.from(
            cell.querySelectorAll([
                'input:not([type="hidden"])',
                'button',
                'a',
                '[role="button"]',
                'span',
                'div'
            ].join(','))
        ).filter(isVisible);

        const targets = descendants.concat([cell]);
        const seen = new Set();

        for (const target of targets) {
            if (seen.has(target)) continue;

            seen.add(target);
            realClick(target);
            await sleep(220);

            if (frequencyPopupIsOpen(
                context,
                cell
            )) {
                return true;
            }
        }

        for (const point of points) {
            clickDocumentPoint(
                context.doc,
                point.x,
                point.y,
                cell
            );

            await sleep(240);

            if (frequencyPopupIsOpen(
                context,
                cell
            )) {
                return true;
            }
        }

        /*
         * 一些旧版控件通过键盘事件打开编辑器。
         */
        try {
            cell.setAttribute('tabindex', '0');
            cell.focus();
        }
        catch (error) {
            // 忽略。
        }

        const keyboardTargets = [
            context.doc.activeElement,
            visibleInput(cell),
            cell
        ].filter(Boolean);

        for (const target of keyboardTargets) {
            pressKey(target, 'Enter', 13);
            await sleep(160);

            if (frequencyPopupIsOpen(
                context,
                cell
            )) {
                return true;
            }

            pressKey(target, 'ArrowDown', 40);
            await sleep(160);

            if (frequencyPopupIsOpen(
                context,
                cell
            )) {
                return true;
            }

            pressKey(target, ' ', 32);
            await sleep(160);

            if (frequencyPopupIsOpen(
                context,
                cell
            )) {
                return true;
            }
        }

        return frequencyPopupIsOpen(
            context,
            cell
        );
    }


    const HOSPITAL_ROUTE_OPTIONS = Object.freeze([
        { code: 'kf', name: '口服', aliases: ['po', '口服给药'] },
        { code: 'HH', name: '含化', aliases: [] },
        { code: 'JBMZ', name: '局部麻醉', aliases: ['局麻'] },
        { code: 'PXZS', name: '皮下注射', aliases: ['sc', 'subcut', '皮下'] },
        { code: 'SXYY', name: '舌下用药', aliases: ['舌下'] },
        { code: 'JRZS', name: '肌肉注射', aliases: ['im', '肌注', '肌内注射'] },
        { code: 'JBYY', name: '局部用药', aliases: ['局部给药'] },
        { code: 'wy', name: '外用', aliases: [] },
        { code: 'CG', name: '冲管', aliases: [] },
        { code: 'bs', name: '鼻饲', aliases: ['鼻饲给药'] },
        { code: 'LY', name: '领药', aliases: [] },
        { code: 'PXZSDBZFZ', name: '皮下注射（大包装分装）', aliases: ['皮下注射(大包装分装)'] },
        { code: 'XWZS', name: '穴位注射', aliases: [] },
        { code: 'wgzr', name: '胃管注入', aliases: ['胃管给药'] },
        { code: 'ps', name: '皮试', aliases: [] },
        { code: 'JMDZ', name: '静脉滴注', aliases: ['ivdrip', 'ivgtt', 'ivd', '静滴', '静脉输液', '静脉点滴'] },
        { code: 'JMZS', name: '静脉注射', aliases: ['iv', 'ivpush', '静注'] },
        { code: 'wh', name: '雾化', aliases: ['雾化吸入', 'nebulization'] },
        { code: 'WF', name: '外敷', aliases: [] },
        { code: 'CX', name: '冲洗', aliases: [] },
        { code: 'HC', name: '耗材', aliases: [] },
        { code: 'ZSYY', name: '注射用药', aliases: ['注射'] },
        { code: 'YDYY', name: '阴道用药', aliases: ['阴道给药'] },
        { code: 'GJQNYY', name: '关节腔内用药', aliases: ['关节腔注射'] },
        { code: 'PWYY', name: '喷雾用药', aliases: ['喷雾'] },
        { code: 'DY', name: '滴眼', aliases: ['眼用', '滴眼用药'] },
        { code: 'PH', name: '喷喉', aliases: ['咽喉喷雾'] },
        { code: 'FSK', name: '敷伤口', aliases: ['伤口外敷'] },
        { code: 'CPF', name: '擦皮肤', aliases: ['皮肤涂擦'] },
        { code: 'DB', name: '滴鼻', aliases: ['鼻用'] },
        { code: 'ZCYY', name: '直肠用药', aliases: ['灌肠', '直肠给药'] },
        { code: 'XRYY', name: '吸入用药', aliases: ['吸入'] },
        { code: 'PNZS', name: '皮内注射', aliases: ['皮内'] }
    ]);

    let activeRouteTabName = '药品录入';

    function routeSetInputValue(doc, input, value, focus, blur) {
        if (!doc || !input) return;

        const win = doc.defaultView;

        if (input.isContentEditable) {
            if (focus !== false) input.focus();
            input.textContent = String(value);
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
            input.dispatchEvent(new win.Event('change', { bubbles: true }));
            if (blur !== false) input.blur();
            return;
        }

        const prototype = input instanceof win.HTMLTextAreaElement
            ? win.HTMLTextAreaElement.prototype
            : win.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
            prototype,
            'value'
        );

        if (focus !== false) input.focus();

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

        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
        input.dispatchEvent(new win.KeyboardEvent('keyup', {
            bubbles: true,
            cancelable: true,
            key: ''
        }));

        if (blur !== false) input.blur();
    }

    function hospitalRouteDefinition(value) {
        const source = normalize(value);
        const compact = source.replace(/[()（）\[\]【】]/g, '');

        if (!source) {
            return null;
        }

        return HOSPITAL_ROUTE_OPTIONS.find(function (item) {
            const code = normalize(item.code);
            const name = normalize(item.name);
            const combinedCodeName = normalize(item.code + item.name)
                .replace(/[()（）\[\]【】]/g, '');
            const combinedNameCode = normalize(item.name + item.code)
                .replace(/[()（）\[\]【】]/g, '');

            return code === source ||
                name === source ||
                compact === combinedCodeName ||
                compact === combinedNameCode ||
                (compact.includes(code) && compact.includes(name)) ||
                item.aliases.some(function (alias) {
                    return normalize(alias) === source;
                });
        }) || null;
    }

    function routeCellDisplayValues(cell) {
        if (!cell) return [];

        const values = [];
        const select = nativeSelect(cell);

        if (select) {
            const option =
                select.options &&
                select.selectedIndex >= 0
                    ? select.options[select.selectedIndex]
                    : null;

            values.push(
                option
                    ? option.textContent || option.value
                    : select.value
            );
        }

        /*
         * 新版用法字典选中后，显示文字和内部代码可能分别写在
         * 可见输入框、隐藏输入框或data-*属性中，因此全部纳入校验。
         */
        Array.from(
            cell.querySelectorAll(
                'input,textarea,[contenteditable="true"],[data-value],[data-code],[data-name]'
            )
        ).forEach(function (element) {
            if (
                element.matches &&
                element.matches('input,textarea')
            ) {
                values.push(element.value || '');
            }
            else if (element.isContentEditable) {
                values.push(element.textContent || '');
            }

            [
                'data-value',
                'data-code',
                'data-name',
                'value',
                'title'
            ].forEach(function (attribute) {
                values.push(
                    element.getAttribute
                        ? element.getAttribute(attribute) || ''
                        : ''
                );
            });
        });

        [
            'data-value',
            'data-code',
            'data-name',
            'value',
            'title'
        ].forEach(function (attribute) {
            values.push(
                cell.getAttribute
                    ? cell.getAttribute(attribute) || ''
                    : ''
            );
        });

        values.push(
            cell.innerText ||
            cell.textContent ||
            ''
        );

        return values
            .map(plain)
            .filter(Boolean);
    }

    function routeSelectedDisplayTargets(definition) {
        if (!definition) return [];

        /*
         * “LY”只是检索文字，不代表已经选中。
         * 真正选中后，院内控件会回写中文名称，例如“领药”。
         * 因此校验时只接受中文显示名称，不再接受简拼代码。
         */
        return [definition.name]
            .concat(
                (definition.aliases || []).filter(function (item) {
                    return /[\u3400-\u9fff]/.test(String(item || ''));
                })
            )
            .map(normalize)
            .filter(Boolean);
    }

    function routeCellMatches(cell, definition) {
        if (!cell || !definition) return false;

        const targets =
            routeSelectedDisplayTargets(definition);

        return routeCellDisplayValues(cell).some(function (value) {
            const current =
                normalize(value);

            return targets.some(function (target) {
                return (
                    current === target ||
                    current.includes(target)
                );
            });
        });
    }

    function routeOptionFromNativeSelect(select, definition) {
        if (!select || !definition) return null;

        const code = normalize(definition.code);
        const name = normalize(definition.name);

        return Array.from(select.options || []).find(function (option) {
            const text = normalize(option.textContent || option.innerText || option.label || '');
            const value = normalize(option.value || '');

            return text === name ||
                text === code ||
                value === code ||
                value === name ||
                text === normalize(definition.code + definition.name) ||
                text === normalize(definition.name + definition.code);
        }) || null;
    }

    function routeDispatchAt(doc, target, type, x, y, detail, extra) {
        if (!target) return;

        const win = doc.defaultView;
        const options = Object.assign({
            bubbles: true,
            cancelable: true,
            composed: true,
            view: win,
            clientX: Math.round(x),
            clientY: Math.round(y),
            screenX: Math.round(x),
            screenY: Math.round(y),
            button: 0,
            buttons: /down/.test(type) ? 1 : 0,
            detail: detail || 1
        }, extra || {});

        try {
            if (/^pointer/.test(type) && typeof win.PointerEvent === 'function') {
                target.dispatchEvent(new win.PointerEvent(type, Object.assign({
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true
                }, options)));
                return;
            }
        }
        catch (error) {
            // 旧版浏览器不支持PointerEvent时继续发送MouseEvent。
        }

        if (!/^pointer/.test(type)) {
            target.dispatchEvent(new win.MouseEvent(type, options));
        }
    }

    function routeClickPoint(doc, x, y, fallback, doubleClick) {
        let target = null;

        try {
            target = doc.elementFromPoint(Math.round(x), Math.round(y));
        }
        catch (error) {
            target = null;
        }

        target = target || fallback;

        if (!target) return null;

        routeDispatchAt(doc, target, 'pointerdown', x, y, 1);
        routeDispatchAt(doc, target, 'mousedown', x, y, 1);
        routeDispatchAt(doc, target, 'pointerup', x, y, 1);
        routeDispatchAt(doc, target, 'mouseup', x, y, 1);
        routeDispatchAt(doc, target, 'click', x, y, 1);

        if (doubleClick) {
            routeDispatchAt(doc, target, 'pointerdown', x, y, 2);
            routeDispatchAt(doc, target, 'mousedown', x, y, 2);
            routeDispatchAt(doc, target, 'pointerup', x, y, 2);
            routeDispatchAt(doc, target, 'mouseup', x, y, 2);
            routeDispatchAt(doc, target, 'click', x, y, 2);
            routeDispatchAt(doc, target, 'dblclick', x, y, 2);
        }

        try {
            target.focus({ preventScroll: true });
        }
        catch (error) {
            try { target.focus(); } catch (ignore) { /* ignore */ }
        }

        return target;
    }

    function routePressKey(element, key, code, extras) {
        if (!element) return;

        const win = element.ownerDocument.defaultView;
        const options = Object.assign({
            key: key,
            code: key,
            keyCode: code,
            which: code,
            bubbles: true,
            cancelable: true
        }, extras || {});

        element.dispatchEvent(new win.KeyboardEvent('keydown', options));
        element.dispatchEvent(new win.KeyboardEvent('keypress', options));
        element.dispatchEvent(new win.KeyboardEvent('keyup', options));
    }

    function rectDistance(rectA, rectB) {
        const horizontal = Math.max(0, Math.max(rectA.left - rectB.right, rectB.left - rectA.right));
        const vertical = Math.max(0, Math.max(rectA.top - rectB.bottom, rectB.top - rectA.bottom));
        return horizontal + vertical;
    }

    function routePopupPanelVisible(context, cell) {
        const cellRect =
            cell.getBoundingClientRect();

        const knownPairs =
            HOSPITAL_ROUTE_OPTIONS.map(function (item) {
                return {
                    code: normalize(item.code),
                    name: normalize(item.name)
                };
            });

        return allDocuments().some(function (doc) {
            const rows =
                Array.from(
                    doc.querySelectorAll([
                        'tr',
                        '[role="row"]',
                        '.datagrid-row',
                        '.layui-table-body tr',
                        '.dropdown-menu li',
                        '.combobox-item',
                        '[role="option"]'
                    ].join(','))
                )
                    .filter(isVisible)
                    .filter(function (element) {
                        if (
                            element.closest('#' + IDS.modal) ||
                            element.closest('#' + IDS.panel)
                        ) {
                            return false;
                        }

                        const nearestTable =
                            element.closest('table');

                        /*
                         * 只排除医嘱主表本身，不再排除整个context.root。
                         * 新版“简拼/名称”菜单正是挂在主表容器内部，
                         * 旧版因此误判菜单未打开并继续点击，导致菜单被关闭。
                         */
                        if (
                            nearestTable &&
                            nearestTable === context.table
                        ) {
                            return false;
                        }

                        if (
                            context.rows &&
                            context.rows.includes(element)
                        ) {
                            return false;
                        }

                        const rect =
                            element.getBoundingClientRect();

                        return (
                            doc !== context.doc ||
                            rectDistance(rect, cellRect) < 1200
                        );
                    });

            let headerFound = false;
            let optionHits = 0;

            rows.forEach(function (element) {
                const parts =
                    Array.from(
                        element.querySelectorAll(
                            'th,td,[role="columnheader"],[role="gridcell"],li,dd'
                        )
                    ).filter(isVisible);

                const texts =
                    (parts.length ? parts : [element])
                        .map(function (part) {
                            return normalize(
                                part.innerText ||
                                part.textContent ||
                                ''
                            );
                        })
                        .filter(Boolean);

                if (
                    texts.includes(normalize('简拼')) &&
                    texts.includes(normalize('名称'))
                ) {
                    headerFound = true;
                }

                if (
                    knownPairs.some(function (pair) {
                        return (
                            texts.includes(pair.code) &&
                            texts.includes(pair.name)
                        );
                    })
                ) {
                    optionHits += 1;
                }
            });

            return (
                headerFound ||
                optionHits >= 2
            );
        });
    }

    function routeNearbyArrowControls(context, cell) {
        const cellRect = cell.getBoundingClientRect();
        const selectors = [
            '.combo-arrow',
            '.textbox-addon-right',
            '.textbox-addon',
            '.layui-edge',
            '.select2-selection__arrow',
            '.el-input__suffix',
            '.el-select__caret',
            '.ant-select-arrow',
            '.ivu-select-arrow',
            '.dropdown-toggle',
            '[class*="combo-arrow"]',
            '[class*="select-arrow"]',
            '[class*="dropdown-arrow"]',
            'button',
            '[role="button"]',
            'i',
            'svg'
        ].join(',');
        const result = [];
        const seen = new Set();

        function add(element, score) {
            if (!element || seen.has(element) || !isVisible(element)) return;
            if (element.closest('#' + IDS.modal) || element.closest('#' + IDS.panel)) return;
            seen.add(element);
            result.push({ element: element, score: score });
        }

        Array.from(cell.querySelectorAll(selectors)).forEach(function (element) {
            const rect = element.getBoundingClientRect();
            add(element, -5000 + Math.abs(rect.right - cellRect.right));
        });

        Array.from(context.doc.querySelectorAll(selectors))
            .filter(isVisible)
            .forEach(function (element) {
                const rect = element.getBoundingClientRect();
                const distance = rectDistance(rect, cellRect);

                if (distance > 180) return;

                const classText = String(element.className || '');
                let score = distance;

                if (/combo-arrow|textbox-addon|select.*arrow|dropdown.*arrow|layui-edge/i.test(classText)) {
                    score -= 3500;
                }

                if (rect.left >= cellRect.left + cellRect.width * 0.55) {
                    score -= 800;
                }

                add(element, score);
            });

        result.sort(function (a, b) { return a.score - b.score; });
        return result.map(function (item) { return item.element; });
    }

    function tryOpenRouteWithFramework(context, cell) {
        const win = context.doc.defaultView;
        const jq = win.jQuery;

        if (!jq) return false;

        const cellRect = cell.getBoundingClientRect();
        const controls = Array.from(context.doc.querySelectorAll(
            'input,select,textarea,.combo,.textbox,.combobox-f,.combo-f'
        )).filter(function (element) {
            if (!element.isConnected || element.closest('#' + IDS.modal) || element.closest('#' + IDS.panel)) {
                return false;
            }

            const rect = element.getBoundingClientRect();
            return rectDistance(rect, cellRect) < 160;
        });

        for (const control of controls) {
            try {
                const wrapped = jq(control);
                const classText = String(control.className || '');

                if (typeof jq.fn.combobox === 'function' &&
                    (/combobox-f/i.test(classText) || wrapped.data('combobox'))) {
                    wrapped.combobox('showPanel');
                    return true;
                }

                if (typeof jq.fn.combo === 'function' &&
                    (/combo-f/i.test(classText) || wrapped.data('combo'))) {
                    wrapped.combo('showPanel');
                    return true;
                }
            }
            catch (error) {
                // 当前控件不是EasyUI组合框时继续其他方式。
            }
        }

        return false;
    }

    function routeMouseClick(element) {
        if (
            !element ||
            !element.isConnected
        ) {
            return false;
        }

        const doc =
            element.ownerDocument;
        const win =
            doc.defaultView;
        const rect =
            element.getBoundingClientRect();

        if (
            rect.width <= 0 ||
            rect.height <= 0
        ) {
            return false;
        }

        const clientX =
            Math.round(
                rect.left +
                Math.max(
                    2,
                    Math.min(
                        rect.width - 2,
                        rect.width * 0.5
                    )
                )
            );

        const clientY =
            Math.round(
                rect.top +
                Math.max(
                    2,
                    Math.min(
                        rect.height - 2,
                        rect.height * 0.5
                    )
                )
            );

        try {
            element.focus({
                preventScroll: true
            });
        }
        catch (error) {
            try {
                element.focus();
            }
            catch (ignore) {
                // 忽略不可聚焦元素。
            }
        }

        const base = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: win,
            clientX: clientX,
            clientY: clientY,
            screenX: clientX,
            screenY: clientY,
            button: 0,
            detail: 1
        };

        if (typeof win.PointerEvent === 'function') {
            element.dispatchEvent(
                new win.PointerEvent(
                    'pointerdown',
                    Object.assign({}, base, {
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true,
                        buttons: 1
                    })
                )
            );
        }

        element.dispatchEvent(
            new win.MouseEvent(
                'mousedown',
                Object.assign({}, base, {
                    buttons: 1
                })
            )
        );

        if (typeof win.PointerEvent === 'function') {
            element.dispatchEvent(
                new win.PointerEvent(
                    'pointerup',
                    Object.assign({}, base, {
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true,
                        buttons: 0
                    })
                )
            );
        }

        element.dispatchEvent(
            new win.MouseEvent(
                'mouseup',
                Object.assign({}, base, {
                    buttons: 0
                })
            )
        );

        element.dispatchEvent(
            new win.MouseEvent(
                'click',
                Object.assign({}, base, {
                    buttons: 0
                })
            )
        );

        return true;
    }

    function routeNearbyInput(context, cell) {
        if (
            !context ||
            !cell
        ) {
            return null;
        }

        const direct =
            visibleInput(cell);

        if (direct) {
            return direct;
        }

        const cellRect =
            cell.getBoundingClientRect();

        const candidates =
            Array.from(
                context.doc.querySelectorAll([
                    'input:not([type="hidden"]):not([disabled])',
                    'textarea:not([disabled])',
                    '[contenteditable="true"]',
                    '.textbox-text',
                    '.combo-text',
                    '.datagrid-editable-input'
                ].join(','))
            )
                .filter(isVisible)
                .filter(function (element) {
                    if (
                        element.closest('#' + IDS.modal) ||
                        element.closest('#' + IDS.panel)
                    ) {
                        return false;
                    }

                    const rect =
                        element.getBoundingClientRect();

                    return (
                        rectDistance(
                            rect,
                            cellRect
                        ) < 90 &&
                        rect.width <=
                            Math.max(
                                420,
                                cellRect.width * 3
                            ) &&
                        rect.height <= 80
                    );
                })
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    let score =
                        rectDistance(
                            rect,
                            cellRect
                        );

                    if (
                        cell.contains(element)
                    ) {
                        score -= 2000;
                    }

                    if (
                        rect.left >= cellRect.left - 8 &&
                        rect.right <= cellRect.right + 8
                    ) {
                        score -= 500;
                    }

                    return {
                        element: element,
                        score: score
                    };
                })
                .sort(function (a, b) {
                    return a.score - b.score;
                });

        return candidates[0]
            ? candidates[0].element
            : null;
    }

    function routeScrollablePanels(context, cell) {
        const cellRect =
            cell.getBoundingClientRect();
        const result = [];
        const seen = new Set();

        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll(
                    'div,ul,tbody,.datagrid-body,.panel-body,.layui-table-body'
                )
            )
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

                    if (
                        element.scrollHeight <=
                            element.clientHeight + 4
                    ) {
                        return;
                    }

                    const rect =
                        element.getBoundingClientRect();

                    if (
                        rect.width < 80 ||
                        rect.height < 60 ||
                        rect.width > 1100 ||
                        rect.height > 750
                    ) {
                        return;
                    }

                    const text =
                        normalize(
                            element.innerText ||
                            element.textContent ||
                            ''
                        );

                    const hasRouteWords =
                        text.includes(
                            normalize('简拼')
                        ) ||
                        text.includes(
                            normalize('名称')
                        ) ||
                        HOSPITAL_ROUTE_OPTIONS.some(function (item) {
                            return (
                                text.includes(
                                    normalize(item.code)
                                ) &&
                                text.includes(
                                    normalize(item.name)
                                )
                            );
                        });

                    if (!hasRouteWords) {
                        return;
                    }

                    let score =
                        rectDistance(
                            rect,
                            cellRect
                        );

                    if (
                        doc === context.doc
                    ) {
                        score -= 1000;
                    }

                    if (
                        text.includes(
                            normalize('简拼')
                        ) &&
                        text.includes(
                            normalize('名称')
                        )
                    ) {
                        score -= 2500;
                    }

                    result.push({
                        element: element,
                        score: score
                    });
                });
        });

        result.sort(function (a, b) {
            return a.score - b.score;
        });

        return result.map(function (item) {
            return item.element;
        });
    }

    /*
     * 用法是否提交成功只能依据“用法”单元格本身判断。
     *
     * 旧版曾扫描整行文本作为兜底，因此药名“乳果糖口服溶液”中自带
     * “口服”二字时，会在用法单元格仍为空的情况下误判为已经选中口服，
     * 直接跳过真正的院内用法候选确认。现在彻底取消整行诊断式匹配。
     */

    async function openHospitalRoutePopup(
        context,
        rowIndex,
        definition,
        fallbackRow,
        fallbackCell
    ) {
        let current =
            findTableContext(activeRouteTabName) ||
            context;

        let row =
            current.rows[rowIndex] ||
            fallbackRow;

        let cell =
            cellByField(
                current,
                row,
                'route'
            ) ||
            fallbackCell;

        if (
            routePopupPanelVisible(
                current,
                cell
            )
        ) {
            return {
                context: current,
                row: row,
                cell: cell,
                input:
                    routeNearbyInput(
                        current,
                        cell
                    )
            };
        }

        cell.scrollIntoView({
            block: 'center',
            inline: 'center',
            behavior: 'auto'
        });

        await sleep(100);

        /*
         * 第一次直接点击当前仍在DOM中的用法编辑区域。
         * 不再预先点击row，避免row激活后整行重绘，使后续cell引用失效。
         */
        let input =
            routeNearbyInput(
                current,
                cell
            );

        routeMouseClick(
            input ||
            cell
        );

        let deadline =
            Date.now() + 650;

        while (
            Date.now() < deadline
        ) {
            if (
                routePopupPanelVisible(
                    current,
                    cell
                )
            ) {
                break;
            }

            await sleep(50);
        }

        /*
         * 点击后重新定位行和单元格。该系统会在进入编辑状态时替换整行DOM。
         */
        current =
            findTableContext(activeRouteTabName) ||
            current;

        row =
            current.rows[rowIndex] ||
            row;

        cell =
            cellByField(
                current,
                row,
                'route'
            ) ||
            cell;

        input =
            routeNearbyInput(
                current,
                cell
            );

        /*
         * 用法控件与药品名称字典相同，输入简拼即可触发并筛选候选表。
         * 优先输入院内代码，例如“LY”，避免目标项位于滚动列表下方。
         */
        if (input) {
            routeSetInputValue(
                current.doc,
                input,
                definition.code,
                true,
                false
            );

            deadline =
                Date.now() + 1800;

            while (
                Date.now() < deadline
            ) {
                if (
                    routePopupPanelVisible(
                        current,
                        cell
                    )
                ) {
                    return {
                        context: current,
                        row: row,
                        cell: cell,
                        input: input
                    };
                }

                await sleep(60);
            }
        }

        /*
         * 某些行第一次点击只激活行，第二次点击才进入编辑。
         * 只有在菜单仍未出现时，才对重新定位后的当前单元格补一次单击。
         */
        if (
            !routePopupPanelVisible(
                current,
                cell
            )
        ) {
            routeMouseClick(
                input ||
                cell
            );

            await sleep(260);

            current =
                findTableContext(activeRouteTabName) ||
                current;

            row =
                current.rows[rowIndex] ||
                row;

            cell =
                cellByField(
                current,
                row,
                'route'
            ) ||
                cell;

            input =
                routeNearbyInput(
                    current,
                    cell
                );

            if (input) {
                routeSetInputValue(
                    current.doc,
                    input,
                    definition.code,
                    true,
                    false
                );
            }

            deadline =
                Date.now() + 1600;

            while (
                Date.now() < deadline
            ) {
                if (
                    routePopupPanelVisible(
                        current,
                        cell
                    )
                ) {
                    return {
                        context: current,
                        row: row,
                        cell: cell,
                        input: input
                    };
                }

                await sleep(60);
            }
        }

        return null;
    }

    function hospitalRoutePopupRows(context, cell, definition) {
        const result = [];
        const seen = new Set();
        const cellRect =
            cell.getBoundingClientRect();
        const code =
            normalize(definition.code);
        const name =
            normalize(definition.name);

        const selector = [
            'tr',
            '[role="row"]',
            '.datagrid-row',
            '.layui-table-body tr',
            '.dropdown-menu li',
            '.combobox-item',
            '[role="option"]'
        ].join(',');

        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll(selector)
            )
                .filter(isVisible)
                .forEach(function (element) {
                    if (
                        seen.has(element) ||
                        element.closest('#' + IDS.modal) ||
                        element.closest('#' + IDS.panel)
                    ) {
                        return;
                    }

                    const nearestTable =
                        element.closest('table');

                    if (
                        nearestTable &&
                        nearestTable === context.table
                    ) {
                        return;
                    }

                    if (
                        context.rows &&
                        context.rows.includes(element)
                    ) {
                        return;
                    }

                    const parts =
                        Array.from(
                            element.querySelectorAll(
                                'td,[role="gridcell"],li,dd'
                            )
                        ).filter(isVisible);

                    const textElements =
                        parts.length
                            ? parts
                            : [element];

                    const texts =
                        textElements
                            .map(function (part) {
                                return plain(
                                    part.innerText ||
                                    part.textContent ||
                                    ''
                                );
                            })
                            .filter(Boolean);

                    const normalizedTexts =
                        texts.map(normalize);

                    const whole =
                        normalize(
                            texts.join('')
                        );

                    const exactCode =
                        normalizedTexts.includes(code);

                    const exactName =
                        normalizedTexts.includes(name);

                    const combined =
                        whole ===
                            normalize(
                                definition.code +
                                definition.name
                            ) ||
                        whole ===
                            normalize(
                                definition.name +
                                definition.code
                            );

                    if (
                        !exactCode &&
                        !exactName &&
                        !combined
                    ) {
                        return;
                    }

                    seen.add(element);

                    const rect =
                        element.getBoundingClientRect();

                    if (
                        rect.width < 20 ||
                        rect.height < 10 ||
                        rect.width > 900 ||
                        rect.height > 120
                    ) {
                        return;
                    }

                    const horizontal =
                        Math.abs(
                            rect.left +
                            rect.width / 2 -
                            (
                                cellRect.left +
                                cellRect.width / 2
                            )
                        );

                    const vertical =
                        Math.min(
                            Math.abs(
                                rect.top -
                                cellRect.bottom
                            ),
                            Math.abs(
                                rect.bottom -
                                cellRect.top
                            )
                        );

                    let score =
                        horizontal / 3 +
                        vertical;

                    if (
                        doc === context.doc
                    ) {
                        score -= 1800;
                    }

                    if (exactName) {
                        score -= 7000;
                    }

                    if (exactCode) {
                        score -= 6000;
                    }

                    if (combined) {
                        score -= 3500;
                    }

                    const nameCell =
                        textElements.find(function (part) {
                            return (
                                normalize(
                                    part.innerText ||
                                    part.textContent ||
                                    ''
                                ) === name
                            );
                        });

                    const codeCell =
                        textElements.find(function (part) {
                            return (
                                normalize(
                                    part.innerText ||
                                    part.textContent ||
                                    ''
                                ) === code
                            );
                        });

                    result.push({
                        element: element,
                        clickTarget:
                            nameCell ||
                            codeCell ||
                            element,
                        score: score
                    });
                });
        });

        result.sort(function (a, b) {
            return a.score - b.score;
        });

        return result;
    }

    async function waitHospitalRouteCommitted(
        rowIndex,
        definition,
        fallbackContext,
        fallbackRow,
        fallbackCell,
        timeout
    ) {
        const deadline =
            Date.now() +
            (
                timeout ||
                1600
            );

        while (
            Date.now() <
            deadline
        ) {
            const current =
                findTableContext(activeRouteTabName) ||
                fallbackContext;

            const row =
                current &&
                current.rows[rowIndex]
                    ? current.rows[rowIndex]
                    : fallbackRow;

            const cell =
                current &&
                row
                    ? (
                        cellByField(
                            current,
                            row,
                            'route'
                        ) ||
                        fallbackCell
                    )
                    : fallbackCell;

            /*
             * 必须同时满足：
             * 1. 候选框已关闭；
             * 2. 当前行“用法”单元格真实回写中文用法名称。
             *
             * 不再扫描整行文字，避免“乳果糖口服溶液”等药名中的
             * “口服”被误当作用法已经提交。单独出现简拼代码也不能判定成功。
             */
            if (
                cell &&
                !routePopupPanelVisible(
                    current,
                    cell
                ) &&
                routeCellMatches(
                    cell,
                    definition
                )
            ) {
                return true;
            }

            await sleep(80);
        }

        return false;
    }

    function routeDispatchLegacyKey(element, type, key, code, keyCode) {
        if (
            !element ||
            !element.isConnected
        ) {
            return;
        }

        const doc =
            element.ownerDocument;
        const win =
            doc.defaultView;

        let event;

        try {
            event =
                new win.KeyboardEvent(
                    type,
                    {
                        key: key,
                        code: code,
                        keyCode: keyCode,
                        which: keyCode,
                        charCode:
                            type === 'keypress'
                                ? keyCode
                                : 0,
                        bubbles: true,
                        cancelable: true,
                        composed: true
                    }
                );
        }
        catch (error) {
            event =
                doc.createEvent('Event');

            event.initEvent(
                type,
                true,
                true
            );
        }

        [
            ['key', key],
            ['code', code],
            ['keyCode', keyCode],
            ['which', keyCode],
            [
                'charCode',
                type === 'keypress'
                    ? keyCode
                    : 0
            ]
        ].forEach(function (entry) {
            try {
                Object.defineProperty(
                    event,
                    entry[0],
                    {
                        configurable: true,
                        enumerable: true,
                        get: function () {
                            return entry[1];
                        }
                    }
                );
            }
            catch (error) {
                try {
                    event[entry[0]] =
                        entry[1];
                }
                catch (ignore) {
                    // 忽略只读属性。
                }
            }
        });

        element.dispatchEvent(event);

        /*
         * 兼容页面通过jQuery绑定的keydown/keyup处理器。
         */
        if (win.jQuery) {
            try {
                const jqEvent =
                    win.jQuery.Event(
                        type,
                        {
                            key: key,
                            code: code,
                            keyCode: keyCode,
                            which: keyCode,
                            charCode:
                                type === 'keypress'
                                    ? keyCode
                                    : 0
                        }
                    );

                win.jQuery(element)
                    .trigger(jqEvent);
            }
            catch (error) {
                // 忽略jQuery兼容失败。
            }
        }
    }

    function routeSendKeySequence(
        element,
        key,
        code,
        keyCode
    ) {
        [
            'keydown',
            'keypress',
            'keyup'
        ].forEach(function (type) {
            routeDispatchLegacyKey(
                element,
                type,
                key,
                code,
                keyCode
            );
        });
    }

    async function routeClickHighlightedCandidate(
        context,
        cell,
        definition
    ) {
        const choice =
            await findHospitalRouteChoice(
                context,
                cell,
                definition
            );

        if (!choice) {
            return false;
        }

        const targets = [
            choice.clickTarget,
            choice.element
        ].filter(function (element, index, list) {
            return (
                element &&
                element.isConnected &&
                list.indexOf(element) === index
            );
        });

        for (const target of targets) {
            try {
                target.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest',
                    behavior: 'auto'
                });
            }
            catch (error) {
                // 忽略。
            }

            await sleep(80);

            /*
             * 先触发原生鼠标事件，再触发jQuery委托事件。
             * 该候选表与药品名称选择表相同，很多版本将选择逻辑绑定在整行click上。
             */
            routeMouseClick(target);

            const win =
                target.ownerDocument.defaultView;

            if (win.jQuery) {
                try {
                    win.jQuery(target)
                        .trigger('mouseenter')
                        .trigger('mousedown')
                        .trigger('mouseup')
                        .trigger('click');
                }
                catch (error) {
                    // 忽略。
                }
            }

            await sleep(220);

            if (
                !routePopupPanelVisible(
                    context,
                    cell
                )
            ) {
                return true;
            }
        }

        return false;
    }

    async function confirmHospitalRouteByEnter(
        rowIndex,
        definition,
        opened
    ) {
        if (!opened) {
            return false;
        }

        const context =
            opened.context;

        const doc =
            context.doc;

        const targets = [];

        [
            opened.input,
            doc.activeElement,
            opened.cell
        ].forEach(function (element) {
            if (
                element &&
                element.isConnected &&
                !targets.includes(element)
            ) {
                targets.push(element);
            }
        });

        /*
         * 先按“向下”确保唯一候选项进入键盘选中状态，再按Enter确认。
         * 不能把输入框里的“LY”当成已选中；必须等中文“领药”真实回写。
         */
        for (const target of targets) {
            try {
                target.focus({
                    preventScroll: true
                });
            }
            catch (error) {
                try {
                    target.focus();
                }
                catch (ignore) {
                    // 忽略。
                }
            }

            routeSendKeySequence(
                target,
                'ArrowDown',
                'ArrowDown',
                40
            );

            await sleep(120);

            routeSendKeySequence(
                target,
                'Enter',
                'Enter',
                13
            );

            if (
                await waitHospitalRouteCommitted(
                    rowIndex,
                    definition,
                    opened.context,
                    opened.row,
                    opened.cell,
                    1200
                )
            ) {
                return true;
            }
        }

        /*
         * 键盘事件未触发医院控件时，直接点击当前高亮的候选行。
         */
        await routeClickHighlightedCandidate(
            opened.context,
            opened.cell,
            definition
        );

        return await waitHospitalRouteCommitted(
            rowIndex,
            definition,
            opened.context,
            opened.row,
            opened.cell,
            1400
        );
    }

    async function findHospitalRouteChoice(
        context,
        cell,
        definition
    ) {
        let choices =
            hospitalRoutePopupRows(
                context,
                cell,
                definition
            );

        if (choices.length) {
            return choices[0];
        }

        /*
         * 如果简拼检索未过滤列表，则逐段滚动候选框查找目标项。
         * 这可处理“领药”等位于列表下方、未被虚拟表格初始渲染的用法。
         */
        const panels =
            routeScrollablePanels(
                context,
                cell
            );

        for (const panel of panels) {
            const original =
                panel.scrollTop;
            const maximum =
                Math.max(
                    0,
                    panel.scrollHeight -
                    panel.clientHeight
                );
            const step =
                Math.max(
                    60,
                    Math.floor(
                        panel.clientHeight * 0.7
                    )
                );

            for (
                let top = 0;
                top <= maximum + step;
                top += step
            ) {
                panel.scrollTop =
                    Math.min(
                        top,
                        maximum
                    );

                panel.dispatchEvent(
                    new panel.ownerDocument.defaultView.Event(
                        'scroll',
                        {
                            bubbles: true
                        }
                    )
                );

                await sleep(100);

                choices =
                    hospitalRoutePopupRows(
                        context,
                        cell,
                        definition
                    );

                if (choices.length) {
                    return choices[0];
                }

                if (top >= maximum) {
                    break;
                }
            }

            panel.scrollTop =
                original;
        }

        return null;
    }

    async function setHospitalRoute(tabName, rowIndex, value, optional) {
        activeRouteTabName = tabName || '药品录入';

        const definition =
            hospitalRouteDefinition(value);

        if (!definition) {
            if (optional) {
                return false;
            }

            throw new Error(
                '未识别院内用法：' +
                value
            );
        }

        let context =
            await ensureRows(
                activeRouteTabName,
                rowIndex + 1
            );

        let row =
            context.rows[rowIndex];

        let cell =
            cellByField(
                context,
                row,
                'route'
            );

        if (!cell) {
            if (optional) {
                return false;
            }

            throw new Error(
                '第' +
                (rowIndex + 1) +
                '行未找到“用法”单元格'
            );
        }

        const select =
            nativeSelect(cell);

        if (select) {
            const option =
                routeOptionFromNativeSelect(
                    select,
                    definition
                );

            if (option) {
                triggerSelect(
                    context.doc,
                    select,
                    option
                );

                await sleep(180);

                return true;
            }
        }

        /*
         * 仅检查“用法”单元格，禁止使用整行文本判断。
         * 否则“乳果糖口服溶液”会因为药名中包含“口服”而被误判完成。
         */
        if (
            routeCellMatches(
                cell,
                definition
            )
        ) {
            return true;
        }

        for (
            let attempt = 0;
            attempt < 2;
            attempt += 1
        ) {
            const opened =
                await openHospitalRoutePopup(
                    context,
                    rowIndex,
                    definition,
                    row,
                    cell
                );

            if (!opened) {
                continue;
            }

            context =
                opened.context;
            row =
                opened.row;
            cell =
                opened.cell;


            /*
             * 当前页面已经完成：
             * 1. 激活用法编辑框；
             * 2. 输入院内简拼；
             * 3. 自动高亮唯一候选项。
             *
             * 先直接按Enter确认。截图中的“LY 领药”正属于此流程，
             * 不再优先依赖鼠标点击候选行。
             */
            if (
                await confirmHospitalRouteByEnter(
                    rowIndex,
                    definition,
                    opened
                )
            ) {
                return true;
            }

            const choice =
                await findHospitalRouteChoice(
                    context,
                    cell,
                    definition
                );

            if (!choice) {
                continue;
            }

            try {
                choice.clickTarget.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest',
                    behavior: 'auto'
                });
            }
            catch (error) {
                // 忽略旧浏览器滚动参数差异。
            }

            await sleep(70);

            routeMouseClick(
                choice.clickTarget
            );

            if (
                await waitHospitalRouteCommitted(
                    rowIndex,
                    definition,
                    context,
                    row,
                    cell,
                    1900
                )
            ) {
                return true;
            }

            /*
             * 部分表格只响应整行事件；未回写时重新定位菜单并点击整行。
             */
            const reopened =
                await openHospitalRoutePopup(
                    context,
                    rowIndex,
                    definition,
                    row,
                    cell
                );

            if (reopened) {
                if (
                    await confirmHospitalRouteByEnter(
                        rowIndex,
                        definition,
                        reopened
                    )
                ) {
                    return true;
                }

                const retryChoice =
                    await findHospitalRouteChoice(
                        reopened.context,
                        reopened.cell,
                        definition
                    );

                if (retryChoice) {
                    routeMouseClick(
                        retryChoice.element
                    );

                    if (
                        await waitHospitalRouteCommitted(
                            rowIndex,
                            definition,
                            reopened.context,
                            reopened.row,
                            reopened.cell,
                            1900
                        )
                    ) {
                        return true;
                    }
                }
            }
        }

        if (optional) {
            return false;
        }

        throw new Error(
            '第' +
            (rowIndex + 1) +
            '行用法“' +
            definition.name +
            '（' +
            definition.code +
            '）”选择失败：' +
            '已直接点击当前用法编辑框，并按药品名称相同方式输入简拼“' +
            definition.code +
            '”检索候选项，但医院页面未完成选中。任务已停止，避免用法为空继续保存。'
        );
    }

    async function setSelect(tabName, rowIndex, field, value, optional) {
        if (!String(value || '').trim()) return false;

        if (
            field === 'route' &&
            (tabName === '药品录入' || tabName === '出院带药')
        ) {
            return setHospitalRoute(
                tabName,
                rowIndex,
                value,
                optional
            );
        }

        const context = await ensureRows(tabName, rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = cellByField(context, row, field);

        if (!cell) {
            if (optional) return false;
            throw new Error('未找到字段“' + field + '”');
        }

        const select = nativeSelect(cell);

        if (select) {
            const option = findOption(select, value);

            if (!option) {
                if (optional) return false;
                throw new Error(
                    '“' + field +
                    '”下拉框没有“' +
                    value +
                    '”'
                );
            }

            triggerSelect(
                context.doc,
                select,
                option
            );

            await sleep(150);
            return true;
        }

        if (fieldValueMatches(cell, value)) {
            return true;
        }

        if (await chooseVisualOption(
            context.doc,
            cell,
            value
        )) {
            return true;
        }

        if (optional) return false;

        throw new Error(
            '未能设置“' + field +
            '”为“' + value + '”'
        );
    }

    async function setInput(tabName, rowIndex, field, value, optional) {
        if (
            value === '' ||
            value === undefined ||
            value === null
        ) {
            return false;
        }

        const context = await ensureRows(
            tabName,
            rowIndex + 1
        );
        const row = context.rows[rowIndex];
        const editor = await ensureCellEditor(
            context,
            row,
            field
        );
        const input = editor.input;

        if (!input) {
            const current = normalize(
                fieldDisplayValue(
                    context,
                    row,
                    field
                )
            );

            if (
                current &&
                (
                    current === normalize(value) ||
                    current.includes(normalize(value))
                )
            ) {
                return true;
            }

            if (optional) return false;

            throw new Error(
                '未找到字段“' +
                field +
                '”输入框'
            );
        }

        setInputValue(
            context.doc,
            input,
            value
        );

        await sleep(130);
        return true;
    }

    async function setPopup(tabName, rowIndex, field, value, optional) {
        if (!String(value || '').trim()) return false;

        /*
         * 频次字段使用专用适配器，避免旧版弹层DOM和坐标问题。
         */
        if (field === 'frequency') {
            return setFrequency(
                tabName,
                rowIndex,
                value,
                optional
            );
        }

        const context = await ensureRows(
            tabName,
            rowIndex + 1
        );
        const row = context.rows[rowIndex];
        const cell = cellByField(
            context,
            row,
            field
        );

        if (!cell) {
            if (optional) return false;
            throw new Error(
                '未找到字段“' +
                field +
                '”'
            );
        }

        const select = nativeSelect(cell);

        if (select) {
            const option = findOption(
                select,
                value
            );

            if (option) {
                triggerSelect(
                    context.doc,
                    select,
                    option
                );

                await sleep(150);
                return true;
            }
        }

        if (fieldValueMatches(
            cell,
            value
        )) {
            return true;
        }

        if (await chooseVisualOption(
            context.doc,
            cell,
            value
        )) {
            return true;
        }

        const input = visibleInput(cell);
        const targets = [
            input,
            cell
        ].concat(
            Array.from(cell.querySelectorAll(
                'input,button,a,[role="button"],span,div'
            )).filter(isVisible)
        ).filter(Boolean);
        const seen = new Set();

        for (const target of targets) {
            if (seen.has(target)) continue;

            seen.add(target);
            realClick(target);
            await sleep(200);

            const option = Array.from(
                context.doc.querySelectorAll([
                    'input:not([type="hidden"])',
                    'button',
                    'a',
                    'label',
                    'li',
                    'dd',
                    'td',
                    'span',
                    'div',
                    '[role="option"]',
                    '[role="button"]'
                ].join(','))
            )
                .filter(isVisible)
                .find(function (element) {
                    return !element.closest(
                        '#' + IDS.modal
                    ) &&
                    normalize(
                        popupElementText(element)
                    ) === normalize(value);
                });

            if (option) {
                realClick(
                    clickablePopupOption(option)
                );
                await sleep(200);
                return true;
            }
        }

        if (optional) return false;

        throw new Error(
            '未能选择“' +
            field +
            '”为“' +
            value +
            '”'
        );
    }

    async function setFrequency(
        tabName,
        rowIndex,
        value,
        optional
    ) {
        const desired =
            normalizeFrequencyValue(value);

        if (!desired) {
            return false;
        }

        const context = await ensureRows(
            tabName,
            rowIndex + 1
        );
        const row = context.rows[rowIndex];
        const cell = cellByField(
            context,
            row,
            'frequency'
        );

        if (!cell) {
            if (optional) return false;

            throw new Error(
                '第' +
                (rowIndex + 1) +
                '行未找到频次单元格'
            );
        }

        const select = nativeSelect(cell);

        if (select) {
            const option = findOption(
                select,
                desired
            );

            if (option) {
                triggerSelect(
                    context.doc,
                    select,
                    option
                );

                await sleep(160);
                return true;
            }
        }

        if (fieldValueMatches(
            cell,
            desired
        )) {
            return true;
        }

        if (await chooseVisualOption(
            context.doc,
            cell,
            desired
        )) {
            return true;
        }

        /*
         * 先检查是否已有未关闭的频次面板，再主动打开当前行编辑器。
         */
        let option = findFrequencyOption(
            context,
            cell,
            desired
        );

        if (!option) {
            await openFrequencyEditor(
                context,
                row,
                cell
            );

            option = await waitForFrequencyOption(
                context,
                cell,
                desired,
                2600
            );
        }

        if (option) {
            const clickable =
                clickablePopupOption(option);

            realClick(clickable);
            await sleep(320);

            const active =
                context.doc.activeElement;

            if (active &&
                active !== context.doc.body &&
                active !== context.doc.documentElement) {
                try {
                    active.blur();
                }
                catch (error) {
                    // 忽略。
                }
            }

            await sleep(140);

            /*
             * 点击了精确目标按钮即视为已提交；
             * 同时尽量检查单元格是否已经回写。
             */
            if (fieldValueMatches(
                cell,
                desired
            )) {
                return true;
            }

            if (!frequencyPopupIsOpen(
                context,
                cell
            )) {
                return true;
            }

            /*
             * 个别控件点击后面板保持打开，再点击一次并按Enter确认。
             */
            realClick(clickable);
            pressKey(clickable, 'Enter', 13);
            await sleep(220);
            return true;
        }

        /*
         * 兜底：部分旧框架只生成输入编辑器，不生成可检索的按钮DOM。
         * 此时将qd等值直接写入当前活动编辑器并发送change/Enter/Tab。
         */
        const editors = editableFrequencyInputs(
            context,
            cell
        );

        for (const editor of editors) {
            if (writeFrequencyEditorValue(
                context,
                editor,
                desired
            )) {
                await sleep(260);

                if (fieldValueMatches(
                    cell,
                    desired
                )) {
                    return true;
                }

                /*
                 * 已对真实编辑器完成回填和确认事件，允许继续，
                 * 最终仍由页面保存或人工核对验证。
                 */
                return true;
            }
        }

        if (optional) return false;

        throw new Error(
            '第' +
            (rowIndex + 1) +
            '行频次“' +
            desired +
            '”录入失败：未能打开频次面板，也未找到可回填的频次编辑器'
        );
    }


    function rectsOverlap(rectA, rectB, padding) {
        const pad = Number(padding) || 0;

        return rectA.right >= rectB.left - pad &&
            rectA.left <= rectB.right + pad &&
            rectA.bottom >= rectB.top - pad &&
            rectA.top <= rectB.bottom + pad;
    }

    function activeEditorNearCell(context, cell) {
        if (!context || !cell) return null;

        const cellRect = cell.getBoundingClientRect();
        const active = context.doc.activeElement;

        if (active &&
            active !== context.doc.body &&
            active !== context.doc.documentElement &&
            isVisible(active) &&
            (
                active.matches('input:not([type="hidden"]),textarea,[contenteditable="true"]') ||
                active.isContentEditable
            )) {
            const activeRect = active.getBoundingClientRect();

            if (rectsOverlap(activeRect, cellRect, 80)) {
                return active;
            }
        }

        const nearby = Array.from(context.doc.querySelectorAll(
            'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'
        ))
            .filter(isVisible)
            .map(function (input) {
                const rect = input.getBoundingClientRect();
                const horizontal = Math.abs(
                    rect.left + rect.width / 2 -
                    (cellRect.left + cellRect.width / 2)
                );
                const vertical = Math.abs(
                    rect.top + rect.height / 2 -
                    (cellRect.top + cellRect.height / 2)
                );

                return {
                    input: input,
                    score: horizontal + vertical
                };
            })
            .filter(function (entry) {
                return entry.score < 260;
            })
            .sort(function (a, b) {
                return a.score - b.score;
            });

        return nearby[0] ? nearby[0].input : null;
    }

    async function ensureCellEditor(context, row, field) {
        const cell = cellByField(context, row, field);

        if (!cell) {
            return {
                cell: null,
                input: null
            };
        }

        let input = visibleInput(cell) ||
            activeEditorNearCell(context, cell);

        if (input) {
            return {
                cell: cell,
                input: input
            };
        }

        cell.scrollIntoView({
            block: 'center',
            inline: 'center',
            behavior: 'auto'
        });

        await sleep(100);

        const rect = cell.getBoundingClientRect();
        const points = [
            {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            },
            {
                x: rect.left + Math.max(8, rect.width * 0.22),
                y: rect.top + rect.height / 2
            },
            {
                x: rect.right - Math.max(8, rect.width * 0.22),
                y: rect.top + rect.height / 2
            }
        ];

        const descendants = Array.from(cell.querySelectorAll(
            'input:not([type="hidden"]),textarea,button,a,[role="button"],span,div'
        )).filter(isVisible);
        const targets = descendants.concat([cell]);
        const seen = new Set();

        for (const target of targets) {
            if (seen.has(target)) continue;

            seen.add(target);
            realClick(target);
            await sleep(150);

            input = visibleInput(cell) ||
                activeEditorNearCell(context, cell);

            if (input) {
                return {
                    cell: cell,
                    input: input
                };
            }
        }

        for (const point of points) {
            clickDocumentPoint(
                context.doc,
                point.x,
                point.y,
                cell
            );

            await sleep(170);

            input = visibleInput(cell) ||
                activeEditorNearCell(context, cell);

            if (input) {
                return {
                    cell: cell,
                    input: input
                };
            }
        }

        realDoubleClick(cell);
        await sleep(190);

        input = visibleInput(cell) ||
            activeEditorNearCell(context, cell);

        if (input) {
            return {
                cell: cell,
                input: input
            };
        }

        try {
            cell.setAttribute('tabindex', '0');
            cell.focus();
            pressKey(cell, 'Enter', 13);
        }
        catch (error) {
            // 忽略。
        }

        await sleep(180);

        return {
            cell: cell,
            input: visibleInput(cell) ||
                activeEditorNearCell(context, cell)
        };
    }

    function fieldDisplayValue(context, row, field) {
        const cell = cellByField(context, row, field);

        if (!cell) return '';

        const select = nativeSelect(cell);

        if (select) {
            const option = select.options &&
                select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;

            return plain(
                option
                    ? option.textContent || option.value
                    : select.value
            );
        }

        const input = visibleInput(cell);

        if (input) {
            return plain(
                input.isContentEditable
                    ? input.textContent
                    : input.value
            );
        }

        return plain(cell.innerText || cell.textContent);
    }

    async function waitFieldValue(
        tabName,
        rowIndex,
        field,
        desired,
        timeout
    ) {
        const deadline = Date.now() + (timeout || 2200);
        const target = normalize(desired);

        while (Date.now() < deadline) {
            const context = findTableContext(tabName);
            const row = context && context.rows[rowIndex];

            if (context && row) {
                const current = normalize(
                    fieldDisplayValue(
                        context,
                        row,
                        field
                    )
                );

                if (current === target ||
                    current.includes(target) ||
                    target.includes(current)) {
                    return true;
                }
            }

            await sleep(90);
        }

        return false;
    }

    function visibleSystemDialogByText(pattern) {
        const candidates = [];

        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll([
                '.layui-layer',
                '.modal',
                '.messager-window',
                '.window',
                '.ui-dialog',
                '.el-message-box',
                '.ant-modal',
                '[role="dialog"]'
            ].join(',')))
                .filter(isVisible)
                .forEach(function (dialog) {
                    /*
                     * 不把临床路径脚本自身的管理窗口、悬浮框和状态提示
                     * 识别成医院系统弹窗。
                     */
                    if (
                        dialog.id === IDS.modal ||
                        dialog.id === IDS.panel ||
                        dialog.id === IDS.status ||
                        dialog.closest('#' + IDS.modal) ||
                        dialog.closest('#' + IDS.panel) ||
                        dialog.closest('#' + IDS.status)
                    ) {
                        return;
                    }

                    const textValue = plain(
                        dialog.innerText ||
                        dialog.textContent
                    );

                    if (!pattern.test(textValue)) {
                        return;
                    }

                    candidates.push({
                        doc: doc,
                        dialog: dialog,
                        text: textValue
                    });
                });
        });

        return candidates[0] || null;
    }

    async function dismissSystemDialog(pattern) {
        const found = visibleSystemDialogByText(pattern);

        if (!found) return false;

        const buttons = Array.from(found.dialog.querySelectorAll(
            'button,a,input[type="button"],[role="button"],.layui-layer-btn a'
        )).filter(isVisible);
        const confirm = buttons.find(function (button) {
            return /^(确认|确定|知道了|关闭)$/.test(
                plain(
                    button.innerText ||
                    button.textContent ||
                    button.value
                )
            );
        }) || buttons[0];

        if (confirm) {
            realClick(confirm);
            await sleep(220);
            return true;
        }

        return false;
    }

    function findOrderQueryContext() {
        const candidates = [];

        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll(
                    'table,.layui-table-view,.datagrid,[role="grid"]'
                )
            )
                .filter(isVisible)
                .filter(function (root) {
                    return (
                        !root.closest('#' + IDS.modal) &&
                        !root.closest('#' + IDS.panel)
                    );
                })
                .forEach(function (root) {
                    const table =
                        actualTable(root);
                    const headers =
                        headerElements(table);
                    const headerLabelElements = [];
                    const headerSeen = new Set();
                    headers.concat(
                        Array.from(
                            root.querySelectorAll
                                ? root.querySelectorAll(
                                    'thead th,th,[role="columnheader"]'
                                )
                                : []
                        )
                    ).forEach(function (header) {
                        if (!header || headerSeen.has(header)) return;
                        headerSeen.add(header);
                        headerLabelElements.push(header);
                    });
                    const headerLabels =
                        headerLabelElements.map(function (header) {
                            return normalize(
                                plain(
                                    header.innerText ||
                                    header.textContent
                                )
                            );
                        }).filter(Boolean);
                    const headerText = normalize(
                        headerLabelElements
                            .map(function (header) {
                                return plain(
                                    header.innerText ||
                                    header.textContent
                                );
                            })
                            .join(' ')
                    );
                    const rootText = normalize(
                        root.innerText ||
                        root.textContent
                    );

                    const hasExactHeader = function (aliases) {
                        const targets = aliases.map(normalize);
                        return headerLabels.some(function (label) {
                            return targets.includes(label);
                        });
                    };
                    const hasName = hasExactHeader([
                        '医嘱名称',
                        '名称',
                        '项目名称',
                        '医嘱'
                    ]);
                    const hasOperation =
                        hasExactHeader(['操作']);
                    const hasStatusOrType =
                        hasExactHeader([
                            '状态',
                            '医嘱类型',
                            '医嘱类别',
                            '长临',
                            '长临嘱'
                        ]);
                    const hasStartTime =
                        hasExactHeader(['开始时间', '开立时间']);
                    const hasStopTime =
                        hasExactHeader(['停止时间', '停嘱时间', '结束时间']);
                    const hasHistoricalSignature =
                        hasExactHeader([
                            '停止医生',
                            '最后执行时间',
                            '末次执行时间',
                            '执行者'
                        ]);
                    const isDischargedOrderPage = Boolean(
                        hasName &&
                        hasStatusOrType &&
                        hasStartTime &&
                        hasStopTime &&
                        hasHistoricalSignature
                    );

                    if (
                        !hasName ||
                        !hasStatusOrType ||
                        (!hasOperation && !isDischargedOrderPage)
                    ) {
                        return;
                    }

                    const rows =
                        tableRows(table);
                    const deleteCount = rows.reduce(
                        function (count, row) {
                            return count +
                                (
                                    findOrderDeleteControl(row)
                                        ? 1
                                        : 0
                                );
                        },
                        0
                    );
                    const rect =
                        root.getBoundingClientRect();

                    candidates.push({
                        doc: doc,
                        root: root,
                        table: table,
                        rows: rows,
                        deleteCount: deleteCount,
                        isDischargedOrderPage:
                            isDischargedOrderPage,
                        sourceLabel:
                            isDischargedOrderPage
                                ? '已出区患者医嘱信息当前页'
                                : '医嘱查询当前页',
                        score:
                            (isDischargedOrderPage ? 3500 : 0) +
                            deleteCount * 5000 +
                            rows.length * 200 -
                            rect.top / 10
                    });
                });
        });

        candidates.sort(function (a, b) {
            return b.score - a.score;
        });

        return candidates[0] || null;
    }

    function orderQueryGridContainer(
        context
    ) {
        if (!context || !context.root) {
            return null;
        }

        return (
            context.root.closest(
                '.layui-table-view,.datagrid-view,.datagrid,[role="grid"]'
            ) ||
            context.root.parentElement ||
            context.root
        );
    }

    function orderDeleteElementRendered(
        element
    ) {
        if (
            !element ||
            !element.isConnected
        ) {
            return false;
        }

        try {
            const style =
                element.ownerDocument
                    .defaultView
                    .getComputedStyle(
                        element
                    );

            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.opacity === '0'
            ) {
                return false;
            }

            const rect =
                element.getBoundingClientRect();

            return (
                rect.width > 0 &&
                rect.height > 0
            );
        }
        catch (error) {
            return false;
        }
    }

    function collectOrderQueryScrollContainers(
        context
    ) {
        if (!context) {
            return [];
        }

        const result = [];
        const seen = new Set();
        const container =
            orderQueryGridContainer(
                context
            );
        const roots = [
            context.root,
            context.table,
            container,
            context.doc &&
                context.doc.documentElement,
            context.doc &&
                context.doc.body
        ].filter(Boolean);

        roots.forEach(function (root) {
            const candidates = [
                root
            ].concat(
                Array.from(
                    root.querySelectorAll
                        ? root.querySelectorAll(
                            '.layui-table-main,.layui-table-body,.datagrid-body,.datagrid-view2,.datagrid-wrap,[class*="scroll"],div'
                        )
                        : []
                )
            );

            candidates.forEach(
                function (element) {
                    if (
                        !element ||
                        seen.has(element)
                    ) {
                        return;
                    }

                    seen.add(element);

                    try {
                        if (
                            element.scrollWidth >
                            element.clientWidth + 8
                        ) {
                            result.push({
                                element: element,
                                originalLeft:
                                    Number(
                                        element.scrollLeft
                                    ) || 0
                            });
                        }
                    }
                    catch (error) {
                        // Ignore inaccessible nodes.
                    }
                }
            );
        });

        return result;
    }

    async function exposeOrderDeleteColumn(
        context,
        existingRecords
    ) {
        const records =
            existingRecords &&
            existingRecords.length
                ? existingRecords
                : collectOrderQueryScrollContainers(
                    context
                );

        records.forEach(function (record) {
            try {
                const maximum =
                    Math.max(
                        0,
                        record.element.scrollWidth -
                        record.element.clientWidth
                    );

                record.element.scrollLeft =
                    maximum;

                record.element.dispatchEvent(
                    new record.element.ownerDocument
                        .defaultView.Event(
                            'scroll',
                            {
                                bubbles: true
                            }
                        )
                );
            }
            catch (error) {
                // Ignore.
            }
        });

        /*
         * Give layui/EasyUI time to render the right fixed operation
         * column after horizontal scrolling.
         */
        await sleep(260);

        return records;
    }

    function restoreOrderQueryHorizontalScroll(
        records
    ) {
        (records || [])
            .slice()
            .reverse()
            .forEach(function (record) {
                try {
                    if (
                        record.element &&
                        record.element.isConnected
                    ) {
                        record.element.scrollLeft =
                            record.originalLeft;

                        record.element.dispatchEvent(
                            new record.element.ownerDocument
                                .defaultView.Event(
                                'scroll',
                                {
                                    bubbles: true
                                }
                            )
                        );
                    }
                }
                catch (error) {
                    // Ignore.
                }
            });
    }

    function nearestOrderDataRow(
        context,
        operationRow
    ) {
        if (
            !context ||
            !operationRow ||
            !context.rows ||
            !context.rows.length
        ) {
            return null;
        }

        const operationRect =
            operationRow.getBoundingClientRect();
        const operationCenter =
            operationRect.top +
            operationRect.height / 2;
        let best = null;
        let bestDistance = Infinity;

        context.rows.forEach(
            function (row) {
                const rect =
                    row.getBoundingClientRect();
                const center =
                    rect.top +
                    rect.height / 2;
                const distance =
                    Math.abs(
                        center -
                        operationCenter
                    );

                if (
                    distance <
                    bestDistance
                ) {
                    bestDistance =
                        distance;
                    best = row;
                }
            }
        );

        return bestDistance <= 18
            ? best
            : null;
    }

    function orderDeleteControlBelongsToQuery(
        context,
        control
    ) {
        if (
            !context ||
            !control ||
            control.ownerDocument !==
                context.doc
        ) {
            return false;
        }

        if (
            control.closest(
                '#' + IDS.modal
            ) ||
            control.closest(
                '#' + IDS.panel
            )
        ) {
            return false;
        }

        const row =
            control.closest(
                'tr,[role="row"],.datagrid-row'
            );

        if (!row || row.querySelector('th')) {
            return false;
        }

        const queryContainer =
            orderQueryGridContainer(
                context
            );
        const controlContainer =
            control.closest(
                '.layui-table-view,.datagrid-view,.datagrid,[role="grid"]'
            );

        if (
            queryContainer &&
            controlContainer &&
            queryContainer ===
                controlContainer
        ) {
            return true;
        }

        /*
         * Fixed-right operation tables may be siblings of the main body
         * instead of descendants of the selected table. Match them by
         * vertical row alignment.
         */
        return Boolean(
            nearestOrderDataRow(
                context,
                row
            )
        );
    }

    function collectOrderDeleteControls(
        context
    ) {
        if (!context || !context.doc) {
            return [];
        }

        const seen = new Set();
        const controls = [];

        Array.from(
            context.doc.querySelectorAll([
                'a',
                'button',
                '[role="button"]',
                '[onclick]',
                'span',
                'font'
            ].join(','))
        )
            .filter(
                orderDeleteElementRendered
            )
            .forEach(function (element) {
                if (
                    normalize(
                        buttonText(element)
                    ) !==
                    normalize('删除')
                ) {
                    return;
                }

                const control =
                    element.closest(
                        'a,button,[role="button"],[onclick]'
                    ) ||
                    element;

                if (
                    seen.has(control) ||
                    !orderDeleteControlBelongsToQuery(
                        context,
                        control
                    )
                ) {
                    return;
                }

                seen.add(control);
                controls.push(control);
            });

        controls.sort(function (a, b) {
            const rowA =
                a.closest(
                    'tr,[role="row"],.datagrid-row'
                ) || a;
            const rowB =
                b.closest(
                    'tr,[role="row"],.datagrid-row'
                ) || b;
            const rectA =
                rowA.getBoundingClientRect();
            const rectB =
                rowB.getBoundingClientRect();

            if (
                Math.abs(
                    rectA.top -
                    rectB.top
                ) > 2
            ) {
                return (
                    rectA.top -
                    rectB.top
                );
            }

            return (
                a.getBoundingClientRect().left -
                b.getBoundingClientRect().left
            );
        });

        return controls;
    }

    function findOrderDeleteControl(row) {
        if (!row) {
            return null;
        }

        const candidates = Array.from(
            row.querySelectorAll([
                'a',
                'button',
                '[role="button"]',
                '[onclick]',
                'span',
                'font'
            ].join(','))
        )
            .filter(
                orderDeleteElementRendered
            )
            .filter(function (element) {
                return (
                    normalize(
                        buttonText(element)
                    ) ===
                    normalize('删除')
                );
            });

        if (!candidates.length) {
            return null;
        }

        const element =
            candidates[0];

        return element.closest(
            'a,button,[role="button"],[onclick]'
        ) || element;
    }

    function orderRowSignature(row) {
        return normalize(
            plain(
                row &&
                (
                    row.innerText ||
                    row.textContent
                )
            )
        ).slice(0, 420);
    }

    function orderDeleteEntries(context) {
        if (!context) {
            return [];
        }

        return collectOrderDeleteControls(
            context
        ).map(function (
            control,
            index
        ) {
            const operationRow =
                control.closest(
                    'tr,[role="row"],.datagrid-row'
                );
            const dataRow =
                nearestOrderDataRow(
                    context,
                    operationRow
                ) ||
                operationRow;
            const signature =
                orderRowSignature(
                    dataRow
                ) ||
                (
                    'row-' +
                    index +
                    '-' +
                    Math.round(
                        operationRow
                            .getBoundingClientRect()
                            .top
                    )
                );
            const display =
                plain(
                    dataRow &&
                    (
                        dataRow.innerText ||
                        dataRow.textContent
                    )
                )
                    .replace(/\s+/g, ' ')
                    .slice(0, 150);

            return {
                row:
                    operationRow ||
                    dataRow,
                dataRow: dataRow,
                control: control,
                index: index,
                signature: signature,
                display:
                    display ||
                    ('第' + (index + 1) + '条医嘱')
            };
        });
    }

    function countOrderSignature(
        context,
        signature
    ) {
        if (!context || !signature) {
            return 0;
        }

        const directCount =
            context.rows.reduce(
                function (count, row) {
                    return count +
                        (
                            orderRowSignature(row) ===
                            signature
                                ? 1
                                : 0
                        );
                },
                0
            );

        if (directCount) {
            return directCount;
        }

        return orderDeleteEntries(
            context
        ).reduce(
            function (count, entry) {
                return count +
                    (
                        entry.signature ===
                        signature
                            ? 1
                            : 0
                    );
            },
            0
        );
    }

    function orderQueryUnsavedPrompt() {
        return visibleSystemDialogByText(
            /当前页面还有医嘱数据未保存|医嘱数据未保存[\s\S]*是否仍需跳转|是否仍需跳转/
        );
    }

    async function cancelOrderQueryUnsavedPrompt() {
        const found =
            orderQueryUnsavedPrompt();

        if (!found) {
            return false;
        }

        const buttons = Array.from(
            found.dialog.querySelectorAll(
                'button,a,input[type="button"],[role="button"],.layui-layer-btn a'
            )
        ).filter(isVisible);
        const cancel = buttons.find(
            function (button) {
                return /^(取消|否|不跳转|关闭)$/.test(
                    plain(
                        button.innerText ||
                        button.textContent ||
                        button.value
                    )
                );
            }
        ) || buttons.find(
            function (button) {
                return /取消|否|不跳转/.test(
                    plain(
                        button.innerText ||
                        button.textContent ||
                        button.value
                    )
                );
            }
        );

        if (cancel) {
            realClick(cancel);
            await sleep(220);
        }

        return true;
    }

    async function activateOrderQueryTab() {
        let context =
            findOrderQueryContext();

        if (context) {
            return context;
        }

        const candidates = [];

        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll(
                    'a,li,button,[role="tab"],span'
                )
            )
                .filter(isVisible)
                .filter(function (element) {
                    return (
                        !element.closest(
                            '#' + IDS.panel
                        ) &&
                        !element.closest(
                            '#' + IDS.modal
                        )
                    );
                })
                .forEach(function (element) {
                    if (
                        normalize(
                            buttonText(element)
                        ) !== normalize('医嘱查询')
                    ) {
                        return;
                    }

                    const rect =
                        element.getBoundingClientRect();
                    const classText = [
                        element.className || '',
                        element.parentElement
                            ? element.parentElement.className
                            : ''
                    ].join(' ');
                    let score =
                        rect.top +
                        rect.left / 30;

                    if (
                        /active|selected|current/i.test(
                            classText
                        )
                    ) {
                        score -= 4000;
                    }

                    if (
                        element.getAttribute('role') ===
                        'tab'
                    ) {
                        score -= 1000;
                    }

                    candidates.push({
                        element: element,
                        score: score
                    });
                });
        });

        if (!candidates.length) {
            throw new Error(
                '未找到“医嘱查询”选项卡'
            );
        }

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        realClick(candidates[0].element);

        const deadline =
            Date.now() + 8000;

        while (Date.now() < deadline) {
            if (orderQueryUnsavedPrompt()) {
                await cancelOrderQueryUnsavedPrompt();

                throw new Error(
                    '当前页面存在未保存医嘱，已取消跳转。请先保存或清理草稿后再执行一键全删。'
                );
            }

            context =
                findOrderQueryContext();

            if (context) {
                return context;
            }

            await sleep(160);
        }

        throw new Error(
            '已点击“医嘱查询”，但未识别到医嘱列表'
        );
    }

    function deleteOrderDialog() {
        return visibleSystemDialogByText(
            /(?:确认|确定|是否|是否确认|是否确定)[\s\S]{0,60}删除|删除[\s\S]{0,60}(?:确认|确定|是否|吗)/
        );
    }

    function positiveDeleteDialogButton(dialog) {
        if (!dialog) {
            return null;
        }

        const buttons = Array.from(
            dialog.querySelectorAll(
                'button,a,input[type="button"],input[type="submit"],[role="button"],.layui-layer-btn a'
            )
        ).filter(isVisible);

        return buttons.find(function (button) {
            return /^(确认|确定|删除|是|继续)$/.test(
                plain(
                    button.innerText ||
                    button.textContent ||
                    button.value
                )
            );
        }) || buttons.find(function (button) {
            const textValue = plain(
                button.innerText ||
                button.textContent ||
                button.value
            );

            return (
                /确认|确定|删除|继续/.test(
                    textValue
                ) &&
                !/取消|否|关闭/.test(
                    textValue
                )
            );
        }) || null;
    }

    async function confirmDeleteOrderDialog(
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 2300);

        while (Date.now() < deadline) {
            const found =
                deleteOrderDialog();

            if (found) {
                const confirm =
                    positiveDeleteDialogButton(
                        found.dialog
                    );

                if (!confirm) {
                    return {
                        found: true,
                        confirmed: false,
                        error:
                            '检测到删除确认窗口，但未找到确认按钮'
                    };
                }

                realClick(confirm);
                await sleep(260);

                return {
                    found: true,
                    confirmed: true
                };
            }

            await sleep(80);
        }

        /*
         * 部分医院页面使用原生window.confirm。
         * 原生确认由临时confirm覆盖器处理，因此这里找不到DOM弹窗
         * 并不代表删除失败。
         */
        return {
            found: false,
            confirmed: false
        };
    }

    function installNativeDeleteConfirmOverride() {
        const records = [];

        allDocuments().forEach(function (doc) {
            const win =
                doc.defaultView;

            if (!win) {
                return;
            }

            try {
                const original =
                    win.confirm;

                if (
                    typeof original !==
                    'function'
                ) {
                    return;
                }

                win.confirm = function (message) {
                    const textValue =
                        String(message || '');

                    if (
                        /删除/.test(textValue) &&
                        /确认|确定|是否|吗/.test(
                            textValue
                        )
                    ) {
                        return true;
                    }

                    return original.call(
                        win,
                        message
                    );
                };

                records.push({
                    win: win,
                    original: original
                });
            }
            catch (error) {
                // 沙箱或只读window时，仅使用DOM确认窗口处理。
            }
        });

        return function restore() {
            records.forEach(function (record) {
                try {
                    record.win.confirm =
                        record.original;
                }
                catch (error) {
                    // 页面刷新导致window失效时忽略。
                }
            });
        };
    }

    async function waitOrderDeleteSettled(
        target,
        beforeDeleteCount,
        beforeSignatureCount,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 5600);

        while (Date.now() < deadline) {
            if (
                target.row &&
                !target.row.isConnected
            ) {
                return true;
            }

            const context =
                findOrderQueryContext();

            if (context) {
                await exposeOrderDeleteColumn(
                    context
                );

                const entries =
                    orderDeleteEntries(context);
                const currentSignatureCount =
                    countOrderSignature(
                        context,
                        target.signature
                    );

                if (
                    entries.length <
                    beforeDeleteCount
                ) {
                    return true;
                }

                if (
                    currentSignatureCount <
                    beforeSignatureCount
                ) {
                    return true;
                }
            }

            await sleep(120);
        }

        return false;
    }

    async function bulkDeleteOrderQuery(
        modal
    ) {
        if (
            state.running ||
            state.bulkDeletingOrders
        ) {
            showStatus(
                '当前已有任务正在执行。',
                'warning'
            );
            return;
        }

        state.bulkDeletingOrders = true;
        state.abortRequested = false;
        updateRunButtons(modal);

        let restoreNativeConfirm =
            function () {};
        let orderHorizontalScrollRecords = [];

        try {
            showStatus(
                '正在进入“医嘱查询”并扫描可删除医嘱……'
            );

            let context =
                await activateOrderQueryTab();

            orderHorizontalScrollRecords =
                await exposeOrderDeleteColumn(
                    context
                );

            let entries =
                orderDeleteEntries(context);

            /*
             * Some table components render the fixed operation column
             * only after the first scroll event. Retry before reporting
             * that no delete controls exist.
             */
            if (!entries.length) {
                await sleep(320);
                context =
                    findOrderQueryContext() ||
                    context;
                await exposeOrderDeleteColumn(
                    context,
                    orderHorizontalScrollRecords
                );
                entries =
                    orderDeleteEntries(
                        context
                    );
            }

            if (!entries.length) {
                showStatus(
                    '当前医嘱查询结果中没有可点击的“删除”医嘱。',
                    'warning'
                );
                return;
            }

            const confirmed = window.confirm(
                '【高风险操作】\n\n' +
                '将删除当前患者“医嘱查询”当前筛选结果中所有带“删除”入口的医嘱。\n' +
                '当前页检测到：' +
                entries.length +
                '条可删除医嘱。\n\n' +
                '列表刷新或分页补位后，脚本会继续删除，直至当前筛选结果中不再出现“删除”入口。\n' +
                '医院逐条弹出的删除确认窗口将自动点击“确认”。\n\n' +
                '此操作不可撤销，是否继续？'
            );

            if (!confirmed) {
                showStatus(
                    '已取消一键全删医嘱。',
                    'warning'
                );
                return;
            }

            restoreNativeConfirm =
                installNativeDeleteConfirmOverride();

            let deletedCount = 0;
            let failedCount = 0;
            let attemptCount = 0;
            const blockedSignatures =
                new Set();
            const maxAttempts = 2000;

            while (
                attemptCount < maxAttempts
            ) {
                if (state.abortRequested) {
                    const error =
                        new Error(
                            '用户已中止一键全删医嘱'
                        );

                    error.name =
                        'AbortError';

                    throw error;
                }

                context =
                    findOrderQueryContext();

                if (!context) {
                    await sleep(320);
                    context =
                        findOrderQueryContext();
                }

                if (!context) {
                    throw new Error(
                        '删除过程中未能重新识别医嘱查询列表'
                    );
                }

                await exposeOrderDeleteColumn(
                    context,
                    orderHorizontalScrollRecords
                );

                entries =
                    orderDeleteEntries(
                        context
                    );

                /*
                 * After deletion the grid may replace its horizontal
                 * scroll container. Refresh the container list and scan
                 * once more before deciding that deletion is complete.
                 */
                if (!entries.length) {
                    orderHorizontalScrollRecords =
                        await exposeOrderDeleteColumn(
                            context
                        );

                    entries =
                        orderDeleteEntries(
                            context
                        );
                }

                const target =
                    entries.find(function (entry) {
                        return !blockedSignatures.has(
                            entry.signature
                        );
                    });

                if (!target) {
                    break;
                }

                attemptCount += 1;

                const beforeDeleteCount =
                    entries.length;
                const beforeSignatureCount =
                    countOrderSignature(
                        context,
                        target.signature
                    );

                showStatus(
                    '正在一键全删医嘱：第' +
                    (deletedCount + failedCount + 1) +
                    '条\n' +
                    target.display
                );

                realClick(
                    target.control
                );

                const dialogResult =
                    await confirmDeleteOrderDialog(
                        2400
                    );

                if (
                    dialogResult.found &&
                    !dialogResult.confirmed
                ) {
                    failedCount += 1;
                    blockedSignatures.add(
                        target.signature
                    );

                    showStatus(
                        '该医嘱删除确认失败：' +
                        dialogResult.error +
                        '\n已跳过并继续。',
                        'error'
                    );

                    continue;
                }

                const removed =
                    await waitOrderDeleteSettled(
                        target,
                        beforeDeleteCount,
                        beforeSignatureCount,
                        6000
                    );

                if (removed) {
                    deletedCount += 1;
                    await sleep(180);
                }
                else {
                    failedCount += 1;
                    blockedSignatures.add(
                        target.signature
                    );

                    showStatus(
                        '未检测到该医嘱从列表中移除，已跳过：\n' +
                        target.display,
                        'error'
                    );
                }
            }

            context =
                findOrderQueryContext();

            if (context) {
                orderHorizontalScrollRecords =
                    await exposeOrderDeleteColumn(
                        context
                    );
            }

            let remaining =
                orderDeleteEntries(
                    context
                );

            if (
                !remaining.length &&
                context
            ) {
                await sleep(420);
                context =
                    findOrderQueryContext() ||
                    context;
                orderHorizontalScrollRecords =
                    await exposeOrderDeleteColumn(
                        context
                    );
                remaining =
                    orderDeleteEntries(
                        context
                    );
            }

            const resultText = [
                '一键全删医嘱执行完成。',
                '成功删除：' +
                    deletedCount +
                    '条',
                failedCount
                    ? '删除失败或未确认：' +
                      failedCount +
                      '条'
                    : '',
                remaining.length
                    ? '当前列表仍有可删除医嘱：' +
                      remaining.length +
                      '条，请人工复核。'
                    : '当前筛选结果中已无可点击的“删除”医嘱。',
                '仅处理当前患者、当前医嘱查询筛选结果中具有“删除”入口的记录。'
            ].filter(Boolean).join('\n');

            showStatus(
                resultText,
                (
                    failedCount ||
                    remaining.length
                )
                    ? 'error'
                    : 'success'
            );
        }
        catch (error) {
            showStatus(
                error.name === 'AbortError'
                    ? error.message
                    : '一键全删医嘱失败：' +
                      error.message,
                error.name === 'AbortError'
                    ? 'warning'
                    : 'error'
            );
        }
        finally {
            restoreNativeConfirm();
            restoreOrderQueryHorizontalScroll(
                orderHorizontalScrollRecords
            );
            state.bulkDeletingOrders = false;
            state.abortRequested = false;
            updateRunButtons(modal);
        }
    }




    /******************************************************************
     * 本地删除指定医嘱（v1.48.13）
     *
     * 这是“前端排除/本地移除”，绝不调用医院删除接口，也不会点击
     * 医院页面的“删除/作废/停止”按钮。
     *
     * 与普通CSS隐藏的区别：
     * 1. 选中的医嘱会写入同源localStorage共享排除清单；
     * 2. 当前医嘱查询表中对应的主表行/固定列复制行会直接从DOM detach；
     * 3. 表格刷新后由MutationObserver按患者+结构化签名再次移除；
     * 4. 因此其他同源油猴脚本若从当前页DOM提取医嘱（包括住院信息脚本），
     *    默认也读不到这些已本地删除的行；
     * 5. HIS服务器数据库完全不变。禁用本脚本、清除本地删除记录并重新查询
     *    即可重新看到服务器原始医嘱。
     ******************************************************************/
    const LOCAL_ORDER_DELETE_STORAGE_KEY =
        'medicalUserscriptLocalDeletedOrdersV1';
    const LOCAL_ORDER_DELETE_CHANGED_EVENT =
        'medical-userscript-local-order-deletion-changed';
    const LOCAL_ORDER_DELETE_ROW_ATTRIBUTE =
        'data-medical-local-order-deleted';
    const LOCAL_ORDER_DELETE_SCHEMA_VERSION = 1;
    const LOCAL_ORDER_DELETE_MAX_PATIENTS = 120;
    const LOCAL_ORDER_DELETE_MAX_RECORDS_PER_PATIENT = 600;

    function localOrderDeleteSimpleHash(value) {
        const source = String(value || '');
        let hash = 2166136261;

        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(36);
    }

    function localOrderDeleteLoadStore() {
        let source = {};

        try {
            source = JSON.parse(
                localStorage.getItem(
                    LOCAL_ORDER_DELETE_STORAGE_KEY
                ) || '{}'
            ) || {};
        }
        catch (error) {
            source = {};
        }

        const patients =
            source.patients && typeof source.patients === 'object'
                ? source.patients
                : {};

        return {
            version: LOCAL_ORDER_DELETE_SCHEMA_VERSION,
            patients: patients
        };
    }

    function localOrderDeleteSaveStore(store) {
        const source =
            store && typeof store === 'object'
                ? store
                : { version: LOCAL_ORDER_DELETE_SCHEMA_VERSION, patients: {} };
        const patients =
            source.patients && typeof source.patients === 'object'
                ? source.patients
                : {};

        Object.keys(patients).forEach(function (key) {
            const bucket = patients[key];

            if (!bucket || !Array.isArray(bucket.records) || !bucket.records.length) {
                delete patients[key];
                return;
            }

            const deduped = [];
            const seen = new Set();

            bucket.records
                .slice()
                .sort(function (a, b) {
                    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
                })
                .forEach(function (record) {
                    const signature = String(record && record.signature || '');
                    if (!signature || seen.has(signature)) return;
                    seen.add(signature);
                    deduped.push(record);
                });

            bucket.records = deduped.slice(
                0,
                LOCAL_ORDER_DELETE_MAX_RECORDS_PER_PATIENT
            );
            bucket.updatedAt = Date.now();
        });

        const patientEntries = Object.keys(patients)
            .map(function (key) {
                return {
                    key: key,
                    updatedAt: Number(patients[key] && patients[key].updatedAt || 0)
                };
            })
            .sort(function (a, b) {
                return b.updatedAt - a.updatedAt;
            });

        patientEntries
            .slice(LOCAL_ORDER_DELETE_MAX_PATIENTS)
            .forEach(function (entry) {
                delete patients[entry.key];
            });

        source.version = LOCAL_ORDER_DELETE_SCHEMA_VERSION;
        source.patients = patients;

        try {
            localStorage.setItem(
                LOCAL_ORDER_DELETE_STORAGE_KEY,
                JSON.stringify(source)
            );
        }
        catch (error) {
            showStatus(
                '本地删除医嘱记录保存失败：' + error.message,
                'error'
            );
            return false;
        }

        try {
            document.dispatchEvent(
                new CustomEvent(
                    LOCAL_ORDER_DELETE_CHANGED_EVENT,
                    {
                        detail: {
                            source: 'clinical-pathway',
                            updatedAt: Date.now()
                        }
                    }
                )
            );
        }
        catch (error) {
            // 旧版浏览器不支持CustomEvent时不影响主体功能。
        }

        return true;
    }

    function localOrderDeletePageText() {
        const chunks = [];

        allDocuments().forEach(function (doc) {
            if (!doc || !doc.body) return;

            let value = '';
            try {
                value = String(doc.body.innerText || '');
            }
            catch (error) {
                value = '';
            }

            if (!value) return;
            chunks.push(value.slice(0, 50000));
        });

        return chunks.join('\n');
    }

    function localOrderDeleteCurrentPatientIdentity() {
        const textValue = localOrderDeletePageText();
        let hospitalNo = '';
        let name = '';
        let match = textValue.match(
            /住院号\s*[:：]?\s*([A-Za-z0-9_-]{4,20})/i
        );

        if (match) {
            hospitalNo = plain(match[1]);
        }

        if (!hospitalNo) {
            match = textValue.match(
                /患者信息\s*[:：]?\s*([^\n\/｜|]{1,20})\s*[\/｜|]\s*(?:男|女)\s*[\/｜|][^\n]{0,80}?[\/｜|]\s*([0-9]{4,12})/
            );

            if (match) {
                name = plain(match[1]);
                hospitalNo = plain(match[2]);
            }
        }

        if (!hospitalNo) {
            match = textValue.match(
                /([^\s\/｜|：:]{1,16})\s*[\/｜|]\s*(?:男|女)\s*[\/｜|]\s*\d{1,3}\s*岁?\s*[\/｜|][^\n\/｜|]{0,40}\s*[\/｜|]\s*([0-9]{4,12})/
            );

            if (match) {
                name = plain(match[1]);
                hospitalNo = plain(match[2]);
            }
        }

        if (!name) {
            match = textValue.match(
                /(?:患者信息|姓名)\s*[:：]?\s*([^\s\/｜|]{1,20})/
            );

            if (match) {
                name = plain(match[1]);
            }
        }

        if (!hospitalNo) {
            return null;
        }

        return {
            key: 'inpatient:' + hospitalNo,
            hospitalNo: hospitalNo,
            name: name,
            label: (name ? name + ' / ' : '') + '住院号' + hospitalNo
        };
    }

    function localOrderDeleteBucket(store, identity, create) {
        if (!store || !identity || !identity.key) return null;

        if (!store.patients || typeof store.patients !== 'object') {
            if (!create) return null;
            store.patients = {};
        }

        let bucket = store.patients[identity.key];

        if (!bucket && create) {
            bucket = {
                patientKey: identity.key,
                hospitalNo: identity.hospitalNo,
                name: identity.name || '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                records: []
            };
            store.patients[identity.key] = bucket;
        }

        if (bucket) {
            bucket.hospitalNo = identity.hospitalNo || bucket.hospitalNo || '';
            bucket.name = identity.name || bucket.name || '';
            if (!Array.isArray(bucket.records)) bucket.records = [];
        }

        return bucket || null;
    }

    function localOrderDeleteHeaderMap(context) {
        return queryHeaderCenterMap(context);
    }

    function localOrderDeleteStructuredRow(context, row, headerMap) {
        if (!context || !row) return null;

        const map = headerMap || localOrderDeleteHeaderMap(context);
        const record = {
            orderCategory: queryRowValue(
                context,
                row,
                ['医嘱类别', '长临', '长临嘱', '长临医嘱'],
                map
            ),
            type: queryRowValue(
                context,
                row,
                ['医嘱类型', '类型'],
                map
            ),
            startTime: queryRowValue(
                context,
                row,
                ['开始时间', '开立时间'],
                map
            ),
            doctor: queryRowValue(
                context,
                row,
                ['医生', '开立医生', '医师'],
                map
            ),
            name: queryRowValue(
                context,
                row,
                ['医嘱名称', '名称', '项目名称'],
                map
            ),
            dose: queryRowValue(
                context,
                row,
                ['剂量', '每次剂量', '每次治疗量'],
                map
            ),
            specification: queryRowValue(
                context,
                row,
                ['药品规格', '规格', '型号'],
                map
            ),
            route: queryRowValue(
                context,
                row,
                ['用法', '给药途径'],
                map
            ),
            frequency: queryRowValue(
                context,
                row,
                ['频次', '频率'],
                map
            ),
            groupNo: queryRowValue(
                context,
                row,
                ['同组', '组号', '组别'],
                map
            ),
            department: queryRowValue(
                context,
                row,
                ['执行科室', '科室'],
                map
            ),
            status: queryRowValue(
                context,
                row,
                ['状态', '执行状态', '医嘱状态'],
                map
            )
        };

        if (!record.name || /暂无数据|没有数据|无数据/.test(record.name)) {
            return null;
        }

        const stableParts = [
            record.orderCategory,
            record.type,
            record.startTime,
            record.doctor,
            record.name,
            record.dose,
            record.specification,
            record.route,
            record.frequency,
            record.groupNo,
            record.department
        ].map(function (value) {
            return normalize(value);
        });

        const stableText = stableParts.join('¦');

        record.signature =
            'v1:' +
            localOrderDeleteSimpleHash(stableText) +
            ':' +
            stableText;

        record.display = [
            record.startTime,
            record.orderCategory,
            record.type,
            record.name,
            record.dose,
            record.route,
            record.frequency,
            record.status
        ].filter(Boolean).join('｜');

        return record;
    }

    function localOrderDeleteCurrentSignatureSet(identity) {
        if (!identity) return new Set();

        const store = localOrderDeleteLoadStore();
        const bucket = localOrderDeleteBucket(store, identity, false);

        return new Set(
            bucket && Array.isArray(bucket.records)
                ? bucket.records
                    .map(function (record) {
                        return String(record && record.signature || '');
                    })
                    .filter(Boolean)
                : []
        );
    }

    function localOrderDeleteRecordExists(context, row, signatureSet, headerMap) {
        if (!context || !row) return false;

        if (
            row.getAttribute &&
            row.getAttribute(LOCAL_ORDER_DELETE_ROW_ATTRIBUTE) === '1'
        ) {
            return true;
        }

        const record = localOrderDeleteStructuredRow(
            context,
            row,
            headerMap
        );

        return Boolean(
            record &&
            signatureSet &&
            signatureSet.has(record.signature)
        );
    }

    function localOrderDeleteApplyToContext(context) {
        if (
            state.localOrderDeleteApplying ||
            !context ||
            !context.table
        ) {
            return 0;
        }

        const identity = localOrderDeleteCurrentPatientIdentity();
        if (!identity) return 0;

        const signatures = localOrderDeleteCurrentSignatureSet(identity);
        if (!signatures.size) return 0;

        state.localOrderDeleteApplying = true;

        try {
            const headerMap = localOrderDeleteHeaderMap(context);
            const targetRows = [];
            const linkedRows = [];
            const seenLinked = new Set();

            (context.rows || []).forEach(function (row) {
                if (!localOrderDeleteRecordExists(
                    context,
                    row,
                    signatures,
                    headerMap
                )) {
                    return;
                }

                targetRows.push(row);

                generalWarningLinkedQueryRows(context, row)
                    .forEach(function (linkedRow) {
                        if (!linkedRow || seenLinked.has(linkedRow)) return;
                        seenLinked.add(linkedRow);
                        linkedRows.push(linkedRow);
                    });
            });

            linkedRows.forEach(function (row) {
                try {
                    row.setAttribute(
                        LOCAL_ORDER_DELETE_ROW_ATTRIBUTE,
                        '1'
                    );
                    row.style.setProperty(
                        'display',
                        'none',
                        'important'
                    );
                }
                catch (error) {
                    // 忽略旧版DOM异常。
                }
            });

            /*
             * 关键：不是只做display:none，而是从当前DOM树真正detach。
             * 这样住院信息脚本即便采用“读取隐藏真实医嘱”的结构化扫描，
             * 也无法再从当前页面DOM枚举到这些行。
             */
            linkedRows.forEach(function (row) {
                try {
                    if (row.isConnected) row.remove();
                }
                catch (error) {
                    try {
                        if (row.parentNode) row.parentNode.removeChild(row);
                    }
                    catch (ignore) {
                        // 忽略。
                    }
                }
            });

            if (targetRows.length) {
                state.generalWarningDirty = true;
            }

            return targetRows.length;
        }
        finally {
            state.localOrderDeleteApplying = false;
        }
    }

    function localOrderDeleteAttachObserver(context) {
        if (!context) return;

        const root = orderQueryGridContainer(context) || context.root;
        if (!root) return;

        if (
            state.localOrderDeleteObserver &&
            state.localOrderDeleteObservedRoot === root &&
            root.isConnected
        ) {
            return;
        }

        if (state.localOrderDeleteObserver) {
            try {
                state.localOrderDeleteObserver.disconnect();
            }
            catch (error) {
                // 忽略。
            }
        }

        state.localOrderDeleteObservedRoot = root;
        state.localOrderDeleteObserver = new MutationObserver(function () {
            clearTimeout(state.localOrderDeleteTimer);
            state.localOrderDeleteTimer = window.setTimeout(function () {
                state.localOrderDeleteTimer = null;
                const current = findOrderQueryContext();
                if (!current) return;
                localOrderDeleteApplyToContext(current);
            }, 35);
        });

        state.localOrderDeleteObserver.observe(
            root,
            {
                childList: true,
                subtree: true
            }
        );
    }

    function localOrderDeleteStoreHasAny() {
        const store = localOrderDeleteLoadStore();
        return Object.keys(store.patients || {}).some(function (key) {
            const bucket = store.patients[key];
            return Boolean(
                bucket &&
                Array.isArray(bucket.records) &&
                bucket.records.length
            );
        });
    }

    function localOrderDeleteScheduleCurrentPage(delay) {
        clearTimeout(state.localOrderDeleteTimer);
        state.localOrderDeleteTimer = window.setTimeout(function () {
            state.localOrderDeleteTimer = null;

            if (!localOrderDeleteStoreHasAny()) return;

            const identity = localOrderDeleteCurrentPatientIdentity();
            if (!identity) return;

            const signatures = localOrderDeleteCurrentSignatureSet(identity);
            if (!signatures.size) return;

            const context = findOrderQueryContext();
            if (!context) return;

            localOrderDeleteApplyToContext(context);
            const refreshed = findOrderQueryContext() || context;
            localOrderDeleteAttachObserver(refreshed);
        }, Number(delay) || 80);
    }

    function localOrderDeleteStartGlobalWatcher() {
        if (
            state.localOrderDeleteGlobalObserver ||
            !document.documentElement ||
            !localOrderDeleteStoreHasAny()
        ) {
            return;
        }

        state.localOrderDeleteGlobalObserver = new MutationObserver(function () {
            localOrderDeleteScheduleCurrentPage(90);
        });

        state.localOrderDeleteGlobalObserver.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );
    }

    function localOrderDeleteStopGlobalWatcherIfEmpty() {
        if (localOrderDeleteStoreHasAny()) return;

        if (state.localOrderDeleteGlobalObserver) {
            try {
                state.localOrderDeleteGlobalObserver.disconnect();
            }
            catch (error) {
                // 忽略。
            }
        }

        state.localOrderDeleteGlobalObserver = null;

        if (state.localOrderDeleteObserver) {
            try {
                state.localOrderDeleteObserver.disconnect();
            }
            catch (error) {
                // 忽略。
            }
        }

        state.localOrderDeleteObserver = null;
        state.localOrderDeleteObservedRoot = null;
    }

    function localOrderDeleteCollectCurrentRows(context) {
        if (!context) return [];

        const headerMap = localOrderDeleteHeaderMap(context);
        const identity = localOrderDeleteCurrentPatientIdentity();
        const deleted = localOrderDeleteCurrentSignatureSet(identity);
        const result = [];

        (context.rows || []).forEach(function (row, index) {
            const record = localOrderDeleteStructuredRow(
                context,
                row,
                headerMap
            );

            if (!record || deleted.has(record.signature)) return;

            record.rowIndex = index;
            result.push(record);
        });

        return result;
    }

    function localOrderDeleteCurrentBucketRecords(identity) {
        if (!identity) return [];
        const store = localOrderDeleteLoadStore();
        const bucket = localOrderDeleteBucket(store, identity, false);
        return bucket && Array.isArray(bucket.records)
            ? bucket.records.slice()
            : [];
    }

    function localOrderDeleteEscapeCell(value) {
        return escapeHtml(String(value || ''));
    }

    function localOrderDeleteRenderLayer(modal, context) {
        const layer = modal.querySelector('.path-local-delete-layer');
        const body = modal.querySelector('.path-local-delete-body');
        const patientBox = modal.querySelector('.path-local-delete-patient');
        const deleteButton = modal.querySelector('.path-local-delete-confirm');
        const restoreButton = modal.querySelector('.path-local-delete-restore-all');
        const identity = localOrderDeleteCurrentPatientIdentity();

        if (!layer || !body || !patientBox) return;

        if (!identity) {
            patientBox.textContent = '未识别当前患者住院号，无法建立安全的患者级本地删除清单。';
            body.innerHTML = '';
            deleteButton.disabled = true;
            restoreButton.disabled = true;
            layer.classList.add('show');
            return;
        }

        const records = localOrderDeleteCollectCurrentRows(context);
        const deletedRecords = localOrderDeleteCurrentBucketRecords(identity);
        modal.pathLocalDeleteRecords = records;

        patientBox.textContent =
            '当前患者：' + identity.label +
            '；当前页可选医嘱 ' + records.length +
            ' 条；已本地删除 ' + deletedRecords.length + ' 条。';

        if (!records.length) {
            body.innerHTML =
                '<tr><td colspan="9" class="path-local-delete-empty">当前医嘱查询页没有可供本地删除的医嘱。</td></tr>';
        }
        else {
            body.innerHTML = records.map(function (record, index) {
                return (
                    '<tr>' +
                    '<td><input type="checkbox" class="path-local-delete-check" data-index="' + index + '"></td>' +
                    '<td>' + localOrderDeleteEscapeCell(record.orderCategory) + '</td>' +
                    '<td>' + localOrderDeleteEscapeCell(record.type) + '</td>' +
                    '<td>' + localOrderDeleteEscapeCell(record.startTime) + '</td>' +
                    '<td class="path-local-delete-name">' + localOrderDeleteEscapeCell(record.name) + '</td>' +
                    '<td>' + localOrderDeleteEscapeCell(record.dose) + '</td>' +
                    '<td>' + localOrderDeleteEscapeCell(record.route) + '</td>' +
                    '<td>' + localOrderDeleteEscapeCell(record.frequency) + '</td>' +
                    '<td>' + localOrderDeleteEscapeCell(record.status) + '</td>' +
                    '</tr>'
                );
            }).join('');
        }

        deleteButton.disabled = true;
        restoreButton.disabled = !deletedRecords.length;
        layer.classList.add('show');
    }

    function localOrderDeleteSelectedIndexes(modal) {
        return Array.from(
            modal.querySelectorAll(
                '.path-local-delete-check:checked'
            )
        ).map(function (checkbox) {
            return Number(checkbox.dataset.index);
        }).filter(Number.isInteger);
    }

    async function openLocalOrderDeleteLayer(modal) {
        if (
            state.running ||
            state.bulkDeletingOrders ||
            state.aiBusy
        ) {
            showStatus('当前已有任务正在执行。', 'warning');
            return;
        }

        let context = findOrderQueryContext();

        if (!context) {
            try {
                showStatus('正在进入“医嘱查询”读取当前患者医嘱……');
                context = await activateOrderQueryTab();
            }
            catch (error) {
                showStatus(
                    '打开本地删除列表失败：' + error.message,
                    'error'
                );
                return;
            }
        }

        /*
         * 打开选择器时临时恢复普通“隐藏已停/隐藏作废”行，确保用户能选择
         * 当前查询页的真实医嘱；生成选择清单后再恢复原隐藏设置。
         */
        generalWarningRestoreManagedVisibility();
        await sleep(60);
        context = findOrderQueryContext() || context;

        const localDeleteLayer =
            modal.querySelector('.path-local-delete-layer');

        if (
            localDeleteLayer &&
            localDeleteLayer.parentElement !== modal
        ) {
            modal.appendChild(localDeleteLayer);
        }

        localOrderDeleteRenderLayer(modal, context);
        generalWarningApplyManagedVisibility(context);
    }

    function closeLocalOrderDeleteLayer(modal) {
        const layer = modal && modal.querySelector('.path-local-delete-layer');
        if (layer) layer.classList.remove('show');
    }

    function saveLocalDeletedOrders(modal) {
        const identity = localOrderDeleteCurrentPatientIdentity();
        if (!identity) {
            showStatus(
                '未识别当前患者住院号，未执行本地删除。',
                'error'
            );
            return;
        }

        const records = Array.isArray(modal.pathLocalDeleteRecords)
            ? modal.pathLocalDeleteRecords
            : [];
        const indexes = localOrderDeleteSelectedIndexes(modal);
        const selected = indexes
            .map(function (index) { return records[index]; })
            .filter(Boolean);

        if (!selected.length) {
            showStatus('请至少勾选1条需要本地删除的医嘱。', 'warning');
            return;
        }

        const confirmed = window.confirm(
            '确认将选中的 ' + selected.length + ' 条医嘱“本地删除”吗？\n\n' +
            '此操作只修改当前浏览器前端：\n' +
            '• 不调用医院删除接口；\n' +
            '• 不停止、作废或修改服务器医嘱；\n' +
            '• 当前页对应医嘱行会从DOM中移除；\n' +
            '• 住院信息脚本从当前页DOM提取医嘱时将看不到这些记录。\n\n' +
            '需要恢复时，可清除本患者本地删除记录后重新查询医嘱。'
        );

        if (!confirmed) return;

        const store = localOrderDeleteLoadStore();
        const bucket = localOrderDeleteBucket(store, identity, true);
        const existing = new Set(
            bucket.records.map(function (record) {
                return String(record && record.signature || '');
            })
        );
        let added = 0;

        selected.forEach(function (record) {
            if (!record.signature || existing.has(record.signature)) return;
            existing.add(record.signature);
            bucket.records.push({
                signature: record.signature,
                name: record.name || '',
                orderCategory: record.orderCategory || '',
                type: record.type || '',
                startTime: record.startTime || '',
                doctor: record.doctor || '',
                dose: record.dose || '',
                specification: record.specification || '',
                route: record.route || '',
                frequency: record.frequency || '',
                groupNo: record.groupNo || '',
                department: record.department || '',
                status: record.status || '',
                display: record.display || '',
                createdAt: Date.now()
            });
            added += 1;
        });

        if (!added) {
            showStatus('所选医嘱已经在本地删除清单中。', 'warning');
            return;
        }

        if (!localOrderDeleteSaveStore(store)) return;

        localOrderDeleteStartGlobalWatcher();

        generalWarningRestoreManagedVisibility();
        let context = findOrderQueryContext();
        const removed = context
            ? localOrderDeleteApplyToContext(context)
            : 0;
        context = findOrderQueryContext() || context;

        if (context) {
            generalWarningApplyManagedVisibility(context);
            localOrderDeleteAttachObserver(context);
        }

        state.generalWarningDirty = true;
        closeLocalOrderDeleteLayer(modal);

        showStatus(
            '本地删除完成：新增 ' + added + ' 条。\n' +
            '当前DOM实际移除 ' + removed + ' 条主医嘱记录。\n' +
            '服务器医嘱未删除、未停止、未作废；住院信息脚本从当前页DOM提取时不会读取这些行。',
            'success'
        );
    }

    function restoreAllLocalDeletedOrders(modal) {
        const identity = localOrderDeleteCurrentPatientIdentity();
        if (!identity) {
            showStatus('未识别当前患者住院号。', 'error');
            return;
        }

        const store = localOrderDeleteLoadStore();
        const bucket = localOrderDeleteBucket(store, identity, false);
        const count = bucket && Array.isArray(bucket.records)
            ? bucket.records.length
            : 0;

        if (!count) {
            showStatus('当前患者没有本地删除医嘱记录。', 'warning');
            return;
        }

        if (!window.confirm(
            '确认清除当前患者全部 ' + count + ' 条本地删除记录吗？\n\n' +
            '服务器数据本来就未被修改。清除后需要重新点击HIS“查询”、切换一次医嘱标签或刷新页面，服务器原始医嘱才会重新渲染到DOM。'
        )) {
            return;
        }

        delete store.patients[identity.key];
        localOrderDeleteSaveStore(store);
        localOrderDeleteStopGlobalWatcherIfEmpty();
        closeLocalOrderDeleteLayer(modal);

        showStatus(
            '已清除当前患者 ' + count + ' 条本地删除记录。\n' +
            '请重新查询/刷新医嘱页面以恢复服务器原始医嘱显示。',
            'success'
        );
    }

    function bindLocalOrderDeleteLayer(modal) {
        const layer = modal.querySelector('.path-local-delete-layer');
        if (!layer) return;

        /*
         * v1.48.14：
         * 该二级弹窗原先位于 .path-dialog 内部。
         * 主弹窗使用 transform: translate(-50%,-50%) 居中，并且
         * overflow:hidden；在悬浮框管理器启用Flex适配或浏览器缩放时，
         * 子级absolute/fixed定位都可能受这个“变换后的包含块”影响，
         * 表现为二级弹窗贴到主弹窗左上角或整体偏移。
         *
         * 将二级遮罩层直接移到 #modal 根节点，使其以浏览器视口为
         * 独立定位基准；这样无论主弹窗采用transform居中还是Flex居中，
         * 本地删除窗口都始终位于当前视口正中央，也不会被主弹窗裁剪。
         */
        if (layer.parentElement !== modal) {
            modal.appendChild(layer);
        }

        if (layer.dataset.bound === '1') return;
        layer.dataset.bound = '1';

        modal.querySelector('.path-local-delete-close')
            .addEventListener('click', function () {
                closeLocalOrderDeleteLayer(modal);
            });
        modal.querySelector('.path-local-delete-cancel')
            .addEventListener('click', function () {
                closeLocalOrderDeleteLayer(modal);
            });
        layer.addEventListener('click', function (event) {
            if (event.target === layer) {
                closeLocalOrderDeleteLayer(modal);
            }
        });

        modal.querySelector('.path-local-delete-select-all')
            .addEventListener('click', function () {
                modal.querySelectorAll('.path-local-delete-check')
                    .forEach(function (checkbox) {
                        checkbox.checked = true;
                    });
                modal.querySelector('.path-local-delete-confirm').disabled =
                    !localOrderDeleteSelectedIndexes(modal).length;
            });

        modal.querySelector('.path-local-delete-select-none')
            .addEventListener('click', function () {
                modal.querySelectorAll('.path-local-delete-check')
                    .forEach(function (checkbox) {
                        checkbox.checked = false;
                    });
                modal.querySelector('.path-local-delete-confirm').disabled = true;
            });

        modal.querySelector('.path-local-delete-body')
            .addEventListener('change', function (event) {
                if (!event.target.classList.contains('path-local-delete-check')) return;
                modal.querySelector('.path-local-delete-confirm').disabled =
                    !localOrderDeleteSelectedIndexes(modal).length;
            });

        modal.querySelector('.path-local-delete-confirm')
            .addEventListener('click', function () {
                saveLocalDeletedOrders(modal);
            });

        modal.querySelector('.path-local-delete-restore-all')
            .addEventListener('click', function () {
                restoreAllLocalDeletedOrders(modal);
            });
    }

    /******************************************************************
     * 通用长期医嘱预警系统
     *
     * 目标：
     * 1. 可多选需要统计的医嘱类型，例如“康复＋文字”；
     * 2. 可统计所选类型下全部长期医嘱，或仅统计自定义指定项目；
     * 3. 只计算长期医嘱当前为第几天，不再计算单价和累计费用；
     * 4. 前端渲染采用药品/中药预警相同的单元格伪元素风格；
     * 5. 通用预警优先级低于药品和中药预警，发生冲突时不渲染；
     * 6. 使用MutationObserver、防抖、后台暂停、2秒缓存及12秒低频
     *    兜底，避免滚动和定时全表重绘造成高CPU占用。
     ******************************************************************/
    const GENERAL_WARNING_FRONT_STYLE_ID =
        'medical-path-general-warning-front-style-v1';
    const GENERAL_WARNING_CELL_CLASS =
        'medical-path-general-warning-front-cell';
    const GENERAL_WARNING_LABEL_ATTRIBUTE =
        'data-medical-path-general-warning-label';
    const GENERAL_WARNING_HIDE_VOIDED_TEMP_STYLE_ID =
        'medical-path-general-warning-hide-voided-temp-style-v1';
    const GENERAL_WARNING_HIDE_VOIDED_TEMP_CLASS =
        'medical-path-general-warning-voided-temp-hidden';
    const GENERAL_WARNING_HIDE_VOIDED_TEMP_ATTRIBUTE =
        'data-medical-path-general-warning-voided-temp-hidden';
    const GENERAL_WARNING_HIDE_STOPPED_STYLE_ID =
        'medical-path-general-warning-hide-stopped-style-v1';
    const GENERAL_WARNING_HIDE_STOPPED_CLASS =
        'medical-path-general-warning-stopped-hidden';
    const GENERAL_WARNING_HIDE_STOPPED_ATTRIBUTE =
        'data-medical-path-general-warning-stopped-hidden';
    const GENERAL_WARNING_DEBOUNCE_MS = 900;
    const GENERAL_WARNING_CACHE_MS = 2000;
    const GENERAL_WARNING_FALLBACK_MS = 12000;
    const GENERAL_WARNING_LEGACY_KEYS = Object.freeze({
        autoScan: 'medicalClinicalPathwayRehabWarningAutoScanV1',
        render: 'medicalClinicalPathwayRehabWarningRenderV1',
        threshold: 'medicalClinicalPathwayRehabWarningThresholdV1'
    });
    const GENERAL_WARNING_TYPE_OPTIONS = Object.freeze([
        '康复',
        '文字',
        '项目',
        '耗材',
        '检验',
        '检查',
        '药品',
        '中草药',
        '出院带药'
    ]);
    const GENERAL_WARNING_HIGH_PRIORITY_SELECTORS = [
        '.medical-drug-claim-front-cell',
        '.medical-herb-warning-front-cell',
        '[data-medical-drug-claim-label]',
        '[data-medical-herb-warning-label]'
    ].join(',');

    function generalWarningStoredValue(key, legacyKey, fallback) {
        const current = GM_getValue(key, undefined);

        if (current !== undefined && current !== null) {
            return current;
        }

        if (legacyKey) {
            const legacy = GM_getValue(legacyKey, undefined);

            if (legacy !== undefined && legacy !== null) {
                return legacy;
            }
        }

        return fallback;
    }

    function generalWarningPositiveNumber(value, fallback) {
        const number = Number(value);

        return Number.isFinite(number) && number > 0
            ? number
            : fallback;
    }

    function generalWarningThreshold() {
        return Math.max(
            1,
            Math.round(
                generalWarningPositiveNumber(
                    generalWarningStoredValue(
                        KEYS.generalWarningThreshold,
                        GENERAL_WARNING_LEGACY_KEYS.threshold,
                        10
                    ),
                    10
                )
            )
        );
    }

    function generalWarningAutoScanEnabled() {
        return Boolean(
            generalWarningStoredValue(
                KEYS.generalWarningAutoScan,
                GENERAL_WARNING_LEGACY_KEYS.autoScan,
                true
            )
        );
    }

    function generalWarningRenderEnabled() {
        return Boolean(
            generalWarningStoredValue(
                KEYS.generalWarningRender,
                GENERAL_WARNING_LEGACY_KEYS.render,
                true
            )
        );
    }

    function generalWarningWarnStoppedOrdersEnabled() {
        return Boolean(
            GM_getValue(
                KEYS.generalWarningWarnStoppedOrders,
                false
            )
        );
    }

    function generalWarningHideStoppedOrdersEnabled() {
        return Boolean(
            GM_getValue(
                KEYS.generalWarningHideStoppedOrders,
                false
            )
        );
    }

    function generalWarningHideVoidedTemporaryEnabled() {
        return Boolean(
            GM_getValue(
                KEYS.generalWarningHideVoidedTemporary,
                false
            )
        );
    }

    function generalWarningSelectedTypes() {
        const stored = GM_getValue(
            KEYS.generalWarningTypes,
            ['康复']
        );
        const values = Array.isArray(stored)
            ? stored
            : String(stored || '').split(/[|｜、,，;；\n]+/);
        const selected = values
            .map(plain)
            .filter(function (value) {
                return GENERAL_WARNING_TYPE_OPTIONS.includes(value);
            });

        return selected.length
            ? Array.from(new Set(selected))
            : ['康复'];
    }

    function generalWarningScopeMode() {
        return GM_getValue(
            KEYS.generalWarningScopeMode,
            'all'
        ) === 'specified'
            ? 'specified'
            : 'all';
    }

    function generalWarningSpecifiedText() {
        return String(
            GM_getValue(
                KEYS.generalWarningItems,
                ''
            ) || ''
        );
    }

    function generalWarningEscapeRegex(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /*
     * 自定义指定项语法（v1.48）：
     *   [康复][文字]"常规针法*"
     *   [康复]"常规针法*"[文字]"常规针法*"
     *   [*]"*针法*"
     *
     * 规则：
     * 1. 每个检索内容前必须声明至少一个[]字段范围；
     * 2. [*]代表全部医嘱类型，且必须单独作为该规则的字段声明；
     * 3. 检索内容必须使用英文双引号或中文弯引号包围；
     * 4. * / ＊ 可位于检索内容任意位置，代表任意长度字符；
     * 5. 同一检索内容前可连续声明多个字段，等价于分别为各字段写同一规则；
     * 6. 多条规则可以同行连续写，也可以分行写。
     */
    function generalWarningParseSpecifiedRules(textValue) {
        const source = String(textValue || '')
            .replace(/“|”/g, '"');
        const rules = [];
        const errors = [];
        let index = 0;

        function lineNumber(position) {
            return source.slice(0, position).split(/\n/).length;
        }

        function skipSeparators() {
            while (
                index < source.length &&
                /[\s,，;；]/.test(source[index])
            ) {
                index += 1;
            }
        }

        function syntaxError(message, position) {
            errors.push(
                '第' + lineNumber(
                    Number.isFinite(position) ? position : index
                ) + '行：' + message
            );
        }

        skipSeparators();

        while (index < source.length) {
            const ruleStart = index;
            const scopes = [];
            let allTypes = false;

            if (source[index] !== '[') {
                syntaxError(
                    '检索内容前必须先用[]声明字段范围，例如[康复]"常规针法*"。',
                    index
                );
                break;
            }

            while (index < source.length && source[index] === '[') {
                const close = source.indexOf(']', index + 1);

                if (close < 0) {
                    syntaxError('字段范围缺少右方括号 ]。', index);
                    index = source.length;
                    break;
                }

                const token = plain(source.slice(index + 1, close));

                if (token === '*' || token === '＊') {
                    allTypes = true;
                }
                else if (GENERAL_WARNING_TYPE_OPTIONS.includes(token)) {
                    scopes.push(token);
                }
                else if (!token) {
                    syntaxError('[]内不能为空。', index);
                }
                else {
                    syntaxError(
                        '未知字段范围“' + token + '”；可用：' +
                        GENERAL_WARNING_TYPE_OPTIONS.join('、') + ' 或 *。',
                        index
                    );
                }

                index = close + 1;

                while (
                    index < source.length &&
                    /[ \t\r\n]/.test(source[index])
                ) {
                    index += 1;
                }
            }

            if (index >= source.length) {
                if (!errors.length) {
                    syntaxError('字段范围后缺少双引号检索内容。', ruleStart);
                }
                break;
            }

            if (allTypes && scopes.length) {
                syntaxError(
                    '[*]表示全部字段，不能与具体字段范围写在同一检索内容前。',
                    ruleStart
                );
            }

            if (!allTypes && !scopes.length) {
                syntaxError('至少需要声明一个有效字段范围。', ruleStart);
            }

            if (source[index] !== '"') {
                syntaxError(
                    '字段范围后必须使用双引号包围检索内容，例如[康复]"常规针法*"。',
                    index
                );
                break;
            }

            const quoteStart = index;
            const quoteEnd = source.indexOf('"', quoteStart + 1);

            if (quoteEnd < 0) {
                syntaxError('检索内容缺少结束双引号。', quoteStart);
                break;
            }

            const pattern = source.slice(quoteStart + 1, quoteEnd).trim();

            if (!pattern) {
                syntaxError('双引号中的检索内容不能为空。', quoteStart);
            }

            const wildcard = /[*＊]/.test(pattern);
            const patternParts = pattern.split(/[*＊]/).map(function (part) {
                return suiteSharedKey(part);
            });
            const exactKey = wildcard
                ? ''
                : suiteSharedKey(pattern);
            let regex = null;

            if (wildcard) {
                regex = new RegExp(
                    '^' + patternParts
                        .map(generalWarningEscapeRegex)
                        .join('.*') + '$',
                    'i'
                );
            }

            if (!wildcard && !exactKey) {
                syntaxError('检索内容规范化后为空，无法匹配。', quoteStart);
            }

            if (
                pattern &&
                (allTypes || scopes.length) &&
                !(allTypes && scopes.length)
            ) {
                rules.push({
                    allTypes: allTypes,
                    types: allTypes
                        ? GENERAL_WARNING_TYPE_OPTIONS.slice()
                        : Array.from(new Set(scopes)),
                    pattern: pattern,
                    wildcard: wildcard,
                    exactKey: exactKey,
                    regex: regex,
                    source: source.slice(ruleStart, quoteEnd + 1)
                });
            }

            index = quoteEnd + 1;
            skipSeparators();
        }

        const valid = errors.length === 0 && rules.length > 0;
        const selectedTypes = rules.some(function (rule) {
            return rule.allTypes;
        })
            ? GENERAL_WARNING_TYPE_OPTIONS.slice()
            : Array.from(new Set(
                rules.reduce(function (result, rule) {
                    return result.concat(rule.types || []);
                }, [])
            ));

        return {
            source: source,
            rules: rules,
            errors: errors,
            valid: valid,
            empty: !source.trim(),
            selectedTypes: selectedTypes,
            allTypes: rules.some(function (rule) {
                return rule.allTypes;
            })
        };
    }

    function generalWarningSpecifiedRuleParse() {
        return generalWarningParseSpecifiedRules(
            generalWarningSpecifiedText()
        );
    }

    function generalWarningSpecifiedItems() {
        return generalWarningSpecifiedRuleParse().rules;
    }

    /*
     * v1.48：自定义指定项目的左右双向同步。
     *
     * 右 -> 左：继续由规则解析结果同步勾选范围。
     * 左 -> 右：
     *   1. 新勾选一个类型时，若右侧尚未声明该类型，则追加 [类型]"*"；
     *   2. 取消一个类型时，从所有规则的字段声明中删除该类型；
     *   3. 若原规则使用 [*]，取消某一类型时会展开成其余具体类型，
     *      从而准确表达“全部类型减去当前取消类型”；
     *   4. 仅剩最后一个类型时不允许继续取消，避免生成无字段规则；
     *   5. 右侧当前存在语法错误时不强行重写，先恢复本次勾选并提示修正规则。
     */
    function generalWarningOrderedTypes(values) {
        const source = new Set(
            (values || []).filter(function (value) {
                return GENERAL_WARNING_TYPE_OPTIONS.includes(value);
            })
        );

        return GENERAL_WARNING_TYPE_OPTIONS.filter(function (value) {
            return source.has(value);
        });
    }

    function generalWarningSerializeSpecifiedRules(ruleSources) {
        return (ruleSources || [])
            .map(function (rule) {
                const types = generalWarningOrderedTypes(
                    rule && rule.types
                );
                const pattern = String(
                    rule && rule.pattern != null
                        ? rule.pattern
                        : ''
                ).trim();

                if (!types.length || !pattern) {
                    return '';
                }

                const scopeText = types.length === GENERAL_WARNING_TYPE_OPTIONS.length
                    ? '[*]'
                    : types.map(function (type) {
                        return '[' + type + ']';
                    }).join('');

                /*
                 * 当前规则语法不支持双引号转义，因此自动生成时移除双引号，
                 * 避免左侧同步写出无法再次解析的文本。院内医嘱名称极少包含双引号。
                 */
                const safePattern = pattern.replace(/[“”"]/g, '');

                return scopeText + '"' + (safePattern || '*') + '"';
            })
            .filter(Boolean)
            .join('\n');
    }

    function generalWarningRuleSourcesFromParsed(parsed) {
        return (parsed && parsed.rules ? parsed.rules : []).map(function (rule) {
            return {
                types: generalWarningOrderedTypes(
                    rule.allTypes
                        ? GENERAL_WARNING_TYPE_OPTIONS
                        : rule.types
                ),
                pattern: rule.pattern
            };
        });
    }

    function generalWarningSelectedTypesFromRuleSources(ruleSources) {
        return generalWarningOrderedTypes(
            (ruleSources || []).reduce(function (result, rule) {
                return result.concat(rule && rule.types ? rule.types : []);
            }, [])
        );
    }

    function generalWarningInitializeSpecifiedRulesFromChecks(modal) {
        if (!modal || generalWarningScopeMode() !== 'specified') {
            return false;
        }

        const textarea = modal.querySelector(
            '.path-general-warning-specified-items'
        );

        if (!textarea || textarea.value.trim()) {
            return false;
        }

        const selected = Array.from(
            modal.querySelectorAll('.path-general-warning-type')
        )
            .filter(function (input) {
                return input.checked;
            })
            .map(function (input) {
                return input.value;
            });

        if (!selected.length) {
            return false;
        }

        textarea.value = generalWarningSerializeSpecifiedRules(
            generalWarningOrderedTypes(selected).map(function (type) {
                return {
                    types: [type],
                    pattern: '*'
                };
            })
        );

        GM_setValue(
            KEYS.generalWarningItems,
            textarea.value
        );

        return true;
    }

    function generalWarningSyncSpecifiedRulesFromTypeToggle(
        modal,
        changedInput
    ) {
        if (
            !modal ||
            !changedInput ||
            generalWarningScopeMode() !== 'specified'
        ) {
            return {
                changed: false,
                valid: true,
                parsed: generalWarningSpecifiedRuleParse()
            };
        }

        const textarea = modal.querySelector(
            '.path-general-warning-specified-items'
        );

        if (!textarea) {
            return { changed: false, valid: false, parsed: null };
        }

        const type = changedInput.value;
        const checked = Boolean(changedInput.checked);
        const parsed = generalWarningParseSpecifiedRules(textarea.value);

        if (!GENERAL_WARNING_TYPE_OPTIONS.includes(type)) {
            return { changed: false, valid: parsed.valid, parsed: parsed };
        }

        /*
         * 空规则允许直接从左侧创建第一条 [类型]"*"。
         * 非空但语法错误时不猜测用户意图，恢复本次点击。
         */
        if (!parsed.valid && !parsed.empty) {
            changedInput.checked = !checked;
            generalWarningUpdateSpecifiedSyntaxUi(modal, {
                persistText: false,
                syncTypes: false
            });
            showStatus(
                '右侧自定义规则存在语法错误，无法安全同步左侧勾选。\n请先修正规则后再增删类型。',
                'warning'
            );

            return {
                changed: false,
                valid: false,
                parsed: parsed
            };
        }

        let rules = parsed.valid
            ? generalWarningRuleSourcesFromParsed(parsed)
            : [];

        if (checked) {
            const currentlySelected = generalWarningSelectedTypesFromRuleSources(
                rules
            );

            if (!currentlySelected.includes(type)) {
                /*
                 * 新勾选类型默认使用全名称通配规则。
                 * 例如勾选“康复” -> 追加 [康复]"*"。
                 */
                rules.push({
                    types: [type],
                    pattern: '*'
                });
            }
        }
        else {
            rules = rules
                .map(function (rule) {
                    const remaining = generalWarningOrderedTypes(
                        (rule.types || []).filter(function (value) {
                            return value !== type;
                        })
                    );

                    if (!remaining.length) {
                        return null;
                    }

                    return {
                        types: remaining,
                        pattern: rule.pattern
                    };
                })
                .filter(Boolean);

            const remainingSelected = generalWarningSelectedTypesFromRuleSources(
                rules
            );

            if (!remainingSelected.length) {
                changedInput.checked = true;
                showStatus(
                    '自定义指定项目模式下至少需要保留一种字段范围。',
                    'warning'
                );
                return {
                    changed: false,
                    valid: parsed.valid,
                    parsed: parsed
                };
            }
        }

        textarea.value = generalWarningSerializeSpecifiedRules(rules);
        GM_setValue(
            KEYS.generalWarningItems,
            textarea.value
        );

        const updated = generalWarningUpdateSpecifiedSyntaxUi(modal, {
            persistText: false,
            syncTypes: true
        });

        return {
            changed: true,
            valid: updated.valid,
            parsed: updated
        };
    }

    function generalWarningAnyAutomaticFeatureEnabled() {
        return generalWarningAutoScanEnabled() ||
            generalWarningRenderEnabled() ||
            generalWarningHideVoidedTemporaryEnabled() ||
            generalWarningHideStoppedOrdersEnabled();
    }

    function generalWarningParseDate(value) {
        const source = plain(value);

        if (!source || /^(无|--|-|未停止|未停|空)$/i.test(source)) {
            return null;
        }

        const matched = source.match(
            /(20\d{2})[\-\/.年](\d{1,2})[\-\/.月](\d{1,2})(?:日)?(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?/
        );

        if (matched) {
            const date = new Date(
                Number(matched[1]),
                Number(matched[2]) - 1,
                Number(matched[3]),
                Number(matched[4] || 0),
                Number(matched[5] || 0),
                Number(matched[6] || 0),
                0
            );

            return Number.isNaN(date.getTime())
                ? null
                : date;
        }

        const fallback = new Date(
            source
                .replace(/年|月/g, '-')
                .replace(/日/g, '')
        );

        return Number.isNaN(fallback.getTime())
            ? null
            : fallback;
    }

    function generalWarningDateText(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }

        const pad = function (number) {
            return String(number).padStart(2, '0');
        };

        return date.getFullYear() + '-' +
            pad(date.getMonth() + 1) + '-' +
            pad(date.getDate());
    }

    function generalWarningInclusiveDays(startDate, endDate) {
        if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
            return null;
        }

        const end = endDate instanceof Date && !Number.isNaN(endDate.getTime())
            ? endDate
            : new Date();
        const startStamp = Date.UTC(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate()
        );
        const endStamp = Date.UTC(
            end.getFullYear(),
            end.getMonth(),
            end.getDate()
        );

        if (endStamp < startStamp) {
            return 0;
        }

        return Math.floor(
            (endStamp - startStamp) / 86400000
        ) + 1;
    }

    /*
     * 已停天数与“执行了多少天”分开计算：
     * - durationDays：开始日期 -> 停止日期（包含开立当日），表示本次长期医嘱共执行多少天；
     * - stoppedDays：停止日期 -> 今天（停止当天=0天），专门用于“已停X天”显示。
     *
     * 这样不会再把“从开始到停止的执行天数”误显示成“已停天数”。
     */
    function generalWarningStoppedDays(stopDate, nowDate) {
        if (!(stopDate instanceof Date) || Number.isNaN(stopDate.getTime())) {
            return null;
        }

        const now = nowDate instanceof Date && !Number.isNaN(nowDate.getTime())
            ? nowDate
            : new Date();
        const stopStamp = Date.UTC(
            stopDate.getFullYear(),
            stopDate.getMonth(),
            stopDate.getDate()
        );
        const nowStamp = Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        if (nowStamp < stopStamp) {
            return 0;
        }

        return Math.floor(
            (nowStamp - stopStamp) / 86400000
        );
    }

    function generalWarningCanonicalType(typeText, nameText) {
        const type = plain(typeText);
        const normalizedType = normalize(type);
        const normalizedName = normalize(nameText);

        if (/出院带药/.test(normalizedType)) return '出院带药';
        if (/中草药|中药|草药/.test(normalizedType)) return '中草药';
        if (/康复/.test(normalizedType)) return '康复';
        if (/文字/.test(normalizedType)) return '文字';
        if (/耗材/.test(normalizedType)) return '耗材';
        if (/检验|化验/.test(normalizedType)) return '检验';
        if (/检查|影像|超声|心电|放射/.test(normalizedType)) return '检查';
        if (/项目|治疗/.test(normalizedType)) return '项目';
        if (/药品|西药|注射|口服/.test(normalizedType)) return '药品';

        /* 页面医嘱类型缺失时，只对少量高特异性名称作保守补充。 */
        if (/护理常规|饮食|留陪人|测血压/.test(normalizedName)) {
            return '文字';
        }
        if (/针法|针灸|灸法|推拿|康复|训练|理疗/.test(normalizedName)) {
            return '康复';
        }

        return type;
    }

    function generalWarningMatchesSpecifiedName(
        name,
        canonicalType,
        configuredRules
    ) {
        const key = suiteSharedKey(name);

        if (!key) return false;

        return (configuredRules || []).some(function (rule) {
            if (!rule || typeof rule !== 'object') return false;

            const typeMatched = rule.allTypes ||
                (rule.types || []).includes(canonicalType);

            if (!typeMatched) return false;

            if (rule.wildcard) {
                return rule.regex instanceof RegExp
                    ? rule.regex.test(key)
                    : false;
            }

            return Boolean(rule.exactKey) && key === rule.exactKey;
        });
    }

    function generalWarningStatusClass(result, threshold) {
        if (!result.startDate) return 'unknown';
        if (result.stopped) return 'stopped';
        if (result.durationDays >= threshold) return 'danger';
        if (result.durationDays >= Math.max(1, threshold - 2)) {
            return 'warning';
        }
        return 'normal';
    }

    function generalWarningQueryCell(context, row, aliases, headerMap) {
        const targets = (aliases || []).map(normalize);
        const headers = (headerMap || queryHeaderCenterMap(context))
            .filter(function (header) {
                return targets.some(function (target) {
                    return header.normalized === target ||
                        header.normalized.includes(target) ||
                        target.includes(header.normalized);
                });
            })
            .sort(function (a, b) {
                const exactA = targets.includes(a.normalized) ? 0 : 1;
                const exactB = targets.includes(b.normalized) ? 0 : 1;

                if (exactA !== exactB) return exactA - exactB;
                return a.width - b.width;
            });

        if (!headers.length) return null;

        const cells = rowCells(row);
        const center = headers[0].center;
        const covering = cells
            .filter(function (cell) {
                const rect = cell.getBoundingClientRect();
                return center >= rect.left - 3 &&
                    center <= rect.right + 3;
            })
            .sort(function (a, b) {
                return a.getBoundingClientRect().width -
                    b.getBoundingClientRect().width;
            });

        if (covering[0]) return covering[0];

        const nearest = cells
            .map(function (cell) {
                const rect = cell.getBoundingClientRect();
                return {
                    cell: cell,
                    distance: Math.abs(
                        rect.left + rect.width / 2 - center
                    )
                };
            })
            .sort(function (a, b) {
                return a.distance - b.distance;
            });

        return nearest[0]
            ? nearest[0].cell
            : null;
    }

    function ensureGeneralWarningHideVoidedTemporaryStyle(doc) {
        if (
            !doc ||
            !doc.head ||
            doc.getElementById(GENERAL_WARNING_HIDE_VOIDED_TEMP_STYLE_ID)
        ) {
            return;
        }

        const style = doc.createElement('style');
        style.id = GENERAL_WARNING_HIDE_VOIDED_TEMP_STYLE_ID;
        style.textContent = `
.${GENERAL_WARNING_HIDE_VOIDED_TEMP_CLASS}{
  display:none!important;
}
`;
        doc.head.appendChild(style);
    }

    function generalWarningExactHeader(context, headerMap, label) {
        const target = normalize(label);
        const headers = (headerMap || queryHeaderCenterMap(context))
            .filter(function (header) {
                return header.normalized === target;
            })
            .sort(function (a, b) {
                return a.width - b.width;
            });
        return headers[0] || null;
    }

    function generalWarningValueByExactHeader(context, row, headerMap, label) {
        const header = generalWarningExactHeader(context, headerMap, label);
        if (!header || !row) return '';

        const cells = Array.from(
            row.querySelectorAll('td,[role="gridcell"]')
        ).sort(function (a, b) {
            return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
        });
        const center = header.center;
        const covering = cells.filter(function (cell) {
            const rect = cell.getBoundingClientRect();
            return center >= rect.left - 3 && center <= rect.right + 3;
        }).sort(function (a, b) {
            return a.getBoundingClientRect().width - b.getBoundingClientRect().width;
        });
        const nearest = cells.map(function (candidate) {
            const rect = candidate.getBoundingClientRect();
            return {
                cell: candidate,
                distance: Math.abs(rect.left + rect.width / 2 - center)
            };
        }).sort(function (a, b) {
            return a.distance - b.distance;
        });
        const cell = covering[0] || (nearest[0] ? nearest[0].cell : null);
        if (!cell) return '';

        const select = nativeSelect(cell);
        if (select) {
            const option = select.options && select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;
            return importedOrderText(
                option ? option.textContent || option.value : select.value
            );
        }

        const input = visibleInput(cell);
        if (input) {
            return importedOrderText(
                input.isContentEditable ? input.textContent : input.value
            );
        }

        return importedOrderText(cell.innerText || cell.textContent);
    }

    function generalWarningRowIsVoidedTemporary(context, row, headerMap) {
        if (!context || !row) return false;

        const orderCategory = queryRowValue(
            context,
            row,
            ['医嘱类别', '长临', '长临嘱', '长临医嘱'],
            headerMap
        );

        if (
            !orderCategory ||
            !/临|临时/.test(orderCategory) ||
            /长|长期/.test(orderCategory)
        ) {
            return false;
        }

        /*
         * v1.48.8：作废判定只认“状态”这一列本身。
         * 正常执行中的临时医嘱在“操作”列同样存在“作废”按钮，
         * 因此禁止再扫描整行文字或使用红色字体作为兜底。
         * 当前表若没有精确表头“状态”，则保守地不隐藏。
         */
        const statusText = generalWarningValueByExactHeader(
            context,
            row,
            headerMap,
            '状态'
        );
        const normalizedStatus = normalize(statusText);

        return normalizedStatus === normalize('作废') ||
            normalizedStatus === normalize('已作废');
    }

    function ensureGeneralWarningHideStoppedStyle(doc) {
        if (
            !doc ||
            !doc.head ||
            doc.getElementById(GENERAL_WARNING_HIDE_STOPPED_STYLE_ID)
        ) {
            return;
        }
        const style = doc.createElement('style');
        style.id = GENERAL_WARNING_HIDE_STOPPED_STYLE_ID;
        style.textContent = `
.${GENERAL_WARNING_HIDE_STOPPED_CLASS}{
  display:none!important;
}
`;
        doc.head.appendChild(style);
    }

    function generalWarningStoppedRowInfo(context, row, headerMap) {
        if (!context || !row) {
            return { isLong: false, stopped: false, stopDate: null, stopText: '', statusText: '' };
        }

        const orderCategory = queryRowValue(
            context,
            row,
            ['医嘱类别', '长临', '长临嘱', '长临医嘱'],
            headerMap
        );
        const isLong = Boolean(orderCategory && /长|长期/.test(orderCategory));

        if (!isLong) {
            return { isLong: false, stopped: false, stopDate: null, stopText: '', statusText: '' };
        }

        const stopText = queryRowValue(
            context,
            row,
            ['停止时间', '停嘱时间', '结束时间'],
            headerMap
        );
        const statusText = queryRowValue(
            context,
            row,
            ['状态', '执行状态', '医嘱状态', '同步状态'],
            headerMap
        );
        const stopDate = generalWarningParseDate(stopText);
        const now = new Date();
        const stoppedByStopTime = Boolean(
            stopDate && stopDate.getTime() <= now.getTime()
        );
        const stoppedByStatus = /停\s*止|停嘱/.test(statusText || '');

        return {
            isLong: true,
            stopped: stoppedByStopTime || stoppedByStatus,
            stoppedByStopTime: stoppedByStopTime,
            stoppedByStatus: stoppedByStatus,
            stopDate: stopDate,
            stopText: stopText,
            statusText: statusText
        };
    }

    function generalWarningLinkedQueryRows(context, row) {
        const result = [];
        const seen = new Set();

        function add(element) {
            if (!element || seen.has(element)) return;
            seen.add(element);
            result.push(element);
        }

        add(row);

        if (!context || !context.doc || !row) {
            return result;
        }

        const container = orderQueryGridContainer(context);
        const attributeNames = [
            'data-index',
            'data-row-index',
            'data-rowid',
            'datagrid-row-index'
        ];

        attributeNames.some(function (attribute) {
            const value = row.getAttribute(attribute);

            if (value == null || value === '') return false;

            const root = container || context.doc;
            Array.from(
                root.querySelectorAll(
                    '[' + attribute + '="' +
                    String(value).replace(/"/g, '\\"') +
                    '"]'
                )
            ).forEach(add);

            return result.length > 1;
        });

        /*
         * EasyUI/Layui固定列有时复制整行但不保留data-index。
         * 这时按同一表格容器内tbody中的行序号同步隐藏。
         */
        if (result.length === 1 && row.parentElement) {
            const siblings = Array.from(row.parentElement.children)
                .filter(function (element) {
                    return element.tagName === 'TR' ||
                        element.getAttribute('role') === 'row' ||
                        element.classList.contains('datagrid-row');
                });
            const rowIndex = siblings.indexOf(row);

            if (rowIndex >= 0 && container) {
                Array.from(
                    container.querySelectorAll('tbody')
                ).forEach(function (tbody) {
                    const rows = Array.from(tbody.children)
                        .filter(function (element) {
                            return element.tagName === 'TR' ||
                                element.getAttribute('role') === 'row' ||
                                element.classList.contains('datagrid-row');
                        });
                    add(rows[rowIndex]);
                });
            }
        }

        return result;
    }

    function generalWarningRestoreVoidedTemporaryVisibility() {
        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll(
                    '.' + GENERAL_WARNING_HIDE_VOIDED_TEMP_CLASS +
                    ',[' + GENERAL_WARNING_HIDE_VOIDED_TEMP_ATTRIBUTE + ']'
                )
            ).forEach(function (row) {
                row.classList.remove(
                    GENERAL_WARNING_HIDE_VOIDED_TEMP_CLASS
                );
                row.removeAttribute(
                    GENERAL_WARNING_HIDE_VOIDED_TEMP_ATTRIBUTE
                );
            });
        });
    }

    function generalWarningApplyVoidedTemporaryVisibility(context) {
        if (!generalWarningHideVoidedTemporaryEnabled()) {
            generalWarningRestoreVoidedTemporaryVisibility();
            return 0;
        }

        if (!context || !context.table) return 0;

        ensureGeneralWarningHideVoidedTemporaryStyle(context.doc);

        const headerMap = queryHeaderCenterMap(context);
        let hiddenCount = 0;

        (context.rows || []).forEach(function (row) {
            if (!generalWarningRowIsVoidedTemporary(
                context,
                row,
                headerMap
            )) {
                return;
            }

            hiddenCount += 1;

            generalWarningLinkedQueryRows(context, row)
                .forEach(function (linkedRow) {
                    ensureGeneralWarningHideVoidedTemporaryStyle(
                        linkedRow.ownerDocument
                    );
                    linkedRow.classList.add(
                        GENERAL_WARNING_HIDE_VOIDED_TEMP_CLASS
                    );
                    linkedRow.setAttribute(
                        GENERAL_WARNING_HIDE_VOIDED_TEMP_ATTRIBUTE,
                        '1'
                    );
                });
        });

        return hiddenCount;
    }

    function generalWarningRestoreStoppedVisibility() {
        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll(
                    '.' + GENERAL_WARNING_HIDE_STOPPED_CLASS +
                    ',[' + GENERAL_WARNING_HIDE_STOPPED_ATTRIBUTE + ']'
                )
            ).forEach(function (row) {
                row.classList.remove(GENERAL_WARNING_HIDE_STOPPED_CLASS);
                row.removeAttribute(GENERAL_WARNING_HIDE_STOPPED_ATTRIBUTE);
            });
        });
    }

    function generalWarningRestoreManagedVisibility() {
        generalWarningRestoreVoidedTemporaryVisibility();
        generalWarningRestoreStoppedVisibility();
    }

    function generalWarningApplyStoppedVisibility(context) {
        if (!generalWarningHideStoppedOrdersEnabled()) {
            generalWarningRestoreStoppedVisibility();
            return 0;
        }
        if (!context || !context.table) return 0;

        ensureGeneralWarningHideStoppedStyle(context.doc);
        const headerMap = queryHeaderCenterMap(context);
        let hiddenCount = 0;

        (context.rows || []).forEach(function (row) {
            const info = generalWarningStoppedRowInfo(context, row, headerMap);
            if (!info.stopped) return;
            hiddenCount += 1;

            generalWarningLinkedQueryRows(context, row).forEach(function (linkedRow) {
                ensureGeneralWarningHideStoppedStyle(linkedRow.ownerDocument);
                linkedRow.classList.add(GENERAL_WARNING_HIDE_STOPPED_CLASS);
                linkedRow.setAttribute(GENERAL_WARNING_HIDE_STOPPED_ATTRIBUTE, '1');
            });
        });
        return hiddenCount;
    }

    function generalWarningApplyManagedVisibility(context) {
        generalWarningApplyVoidedTemporaryVisibility(context);
        generalWarningApplyStoppedVisibility(context);
    }

    function extractGeneralWarningResults(context) {
        if (!context) return [];

        const headerMap = queryHeaderCenterMap(context);
        const selectedTypes = generalWarningSelectedTypes();
        const scopeMode = generalWarningScopeMode();
        const specifiedParse = generalWarningSpecifiedRuleParse();
        const specifiedItems = specifiedParse.valid
            ? specifiedParse.rules
            : [];
        const threshold = generalWarningThreshold();
        const now = new Date();
        const results = [];

        context.rows.forEach(function (row, index) {
            const name = queryRowValue(
                context,
                row,
                ['医嘱名称', '名称', '项目名称', '医嘱'],
                headerMap
            );

            if (!name || /暂无数据|没有数据|无数据/.test(name)) {
                return;
            }

            const orderCategory = queryRowValue(
                context,
                row,
                ['医嘱类别', '长临', '长临嘱', '长临医嘱'],
                headerMap
            );

            /* 通用系统严格只统计页面明确标记为“长/长期”的医嘱。 */
            if (!orderCategory || !/长|长期/.test(orderCategory)) {
                return;
            }

            const typeText = queryRowValue(
                context,
                row,
                ['医嘱类型', '类型'],
                headerMap
            );
            const canonicalType = generalWarningCanonicalType(
                typeText,
                name
            );

            if (scopeMode === 'all') {
                if (!selectedTypes.includes(canonicalType)) {
                    return;
                }
            }
            else {
                /*
                 * v1.48继续由每条“[字段范围]"检索式"”独立决定
                 * 类型范围，不再额外用左侧勾选做第二次过滤。左侧勾选仅同步
                 * 展示当前规则涉及的字段；因此[*]可以真正表示“不限字段范围”。
                 * 语法不完整时采用失败关闭策略，避免旧的裸文本规则误匹配。
                 */
                if (
                    !specifiedParse.valid ||
                    !generalWarningMatchesSpecifiedName(
                        name,
                        canonicalType,
                        specifiedItems
                    )
                ) {
                    return;
                }
            }

            const startText = queryRowValue(
                context,
                row,
                ['开始时间', '开立时间'],
                headerMap
            );
            const stopText = queryRowValue(
                context,
                row,
                ['停止时间', '停嘱时间', '结束时间'],
                headerMap
            );
            const statusText = queryRowValue(
                context,
                row,
                ['执行状态', '状态', '同步状态'],
                headerMap
            );
            const startDate = generalWarningParseDate(startText);
            const stopDate = generalWarningParseDate(stopText);
            const stoppedByStopTime = Boolean(
                stopDate && stopDate.getTime() <= now.getTime()
            );
            const stoppedByStatus = /停\s*止|停嘱/.test(statusText);
            const stopped = stoppedByStopTime || stoppedByStatus;

            /*
             * “预警已停医嘱”与药品预警保持一致：默认关闭。
             * 未开启时，已停止长期医嘱不进入通用预警列表，也不渲染“已停X天”。
             */
            if (stopped && !generalWarningWarnStoppedOrdersEnabled()) {
                return;
            }

            /*
             * 已停止长期医嘱：
             * 1. “已停X天”只从停止时间列计算，不再拿开始时间代替；
             * 2. 若页面只给了“停止”状态却没有可解析的停止时间，则已停天数保持未知；
             * 3. 本次医嘱实际执行天数仍单独按开始 -> 停止计算。
             */
            const stoppedDays = stopped && stopDate
                ? generalWarningStoppedDays(stopDate, now)
                : null;
            const durationDays = stopped
                ? (stopDate
                    ? generalWarningInclusiveDays(startDate, stopDate)
                    : null)
                : generalWarningInclusiveDays(startDate, now);
            const nameCell = generalWarningQueryCell(
                context,
                row,
                ['医嘱名称', '名称', '项目名称'],
                headerMap
            );
            const result = {
                index: index,
                row: row,
                nameCell: nameCell,
                name: name,
                typeText: typeText,
                canonicalType: canonicalType,
                orderCategory: orderCategory,
                startText: startText,
                stopText: stopText,
                startDate: startDate,
                stopDate: stopDate,
                stopped: stopped,
                stoppedByStopTime: stoppedByStopTime,
                stoppedByStatus: stoppedByStatus,
                stoppedDays: stoppedDays,
                durationDays: durationDays,
                statusText: statusText
            };

            result.statusClass = generalWarningStatusClass(
                result,
                threshold
            );

            if (!startDate) {
                result.status = '未识别开立时间';
            }
            else if (stopped) {
                result.status = Number.isFinite(stoppedDays)
                    ? (
                        '已停止' + stoppedDays + '天' +
                        (
                            Number.isFinite(durationDays)
                                ? '；本次医嘱共执行' + durationDays + '天'
                                : ''
                        )
                    )
                    : '已停止；未识别停止时间，无法计算已停天数';
            }
            else if (durationDays >= threshold) {
                result.status = '当前第' + durationDays + '天，已达到预警阈值';
            }
            else if (durationDays >= Math.max(1, threshold - 2)) {
                result.status = '当前第' + durationDays + '天，临近预警阈值';
            }
            else {
                result.status = '当前第' + durationDays + '天';
            }

            results.push(result);
        });

        return results;
    }

    function ensureGeneralWarningFrontStyle(doc) {
        if (
            !doc ||
            !doc.head ||
            doc.getElementById(GENERAL_WARNING_FRONT_STYLE_ID)
        ) {
            return;
        }

        const style = doc.createElement('style');
        style.id = GENERAL_WARNING_FRONT_STYLE_ID;
        style.textContent = `
.${GENERAL_WARNING_CELL_CLASS}:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell){
  position:relative!important;
  padding-right:76px!important;
  transition:background-color .15s ease,box-shadow .15s ease;
}
.${GENERAL_WARNING_CELL_CLASS}:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell)::after{
  content:attr(${GENERAL_WARNING_LABEL_ATTRIBUTE});
  position:absolute;
  right:4px;
  top:50%;
  transform:translateY(-50%);
  z-index:5;
  min-width:54px;
  max-width:70px;
  box-sizing:border-box;
  padding:2px 5px;
  border-radius:9px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  text-align:center;
  font:600 11px/16px "Microsoft YaHei",Arial,sans-serif;
  pointer-events:none;
  box-shadow:0 1px 3px rgba(0,0,0,.16);
}
.medical-path-general-warning-front-normal:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell){
  background:#eef8ff!important;
  box-shadow:inset 4px 0 0 #159bd3!important;
}
.medical-path-general-warning-front-normal:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell)::after{
  background:#dff3ff;
  color:#126a96;
  border:1px solid #8dcce8;
}
.medical-path-general-warning-front-warning:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell){
  background:#fffdf0!important;
  box-shadow:inset 4px 0 0 #d6a700!important;
}
.medical-path-general-warning-front-warning:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell)::after{
  background:#fff1a8;
  color:#795b00;
  border:1px solid #e3c44d;
}
.medical-path-general-warning-front-danger:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell){
  background:#fff0ef!important;
  box-shadow:inset 4px 0 0 #dc4c40!important;
}
.medical-path-general-warning-front-danger:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell)::after{
  background:#dc4c40;
  color:#fff;
}
.medical-path-general-warning-front-stopped:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell),
.medical-path-general-warning-front-unknown:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell){
  background:#f5f7f8!important;
  box-shadow:inset 4px 0 0 #8a949b!important;
}
.medical-path-general-warning-front-stopped:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell)::after,
.medical-path-general-warning-front-unknown:not(.medical-drug-claim-front-cell):not(.medical-herb-warning-front-cell)::after{
  background:#69747b;
  color:#fff;
}
`;
        doc.head.appendChild(style);
    }

    function generalWarningHasHigherPriorityRender(cell) {
        return Boolean(
            cell &&
            cell.matches &&
            cell.matches(GENERAL_WARNING_HIGH_PRIORITY_SELECTORS)
        );
    }

    function generalWarningRestoreFrontCell(cell) {
        if (!cell) return;

        cell.classList.remove(
            GENERAL_WARNING_CELL_CLASS,
            'medical-path-general-warning-front-normal',
            'medical-path-general-warning-front-warning',
            'medical-path-general-warning-front-danger',
            'medical-path-general-warning-front-stopped',
            'medical-path-general-warning-front-unknown'
        );
        cell.removeAttribute(GENERAL_WARNING_LABEL_ATTRIBUTE);
    }

    function generalWarningClearFront(fullSweep) {
        const cells = new Set();

        if (state.generalWarningRenderedCells instanceof Set) {
            state.generalWarningRenderedCells.forEach(function (cell) {
                if (cell) cells.add(cell);
            });
        }

        if (fullSweep) {
            allDocuments().forEach(function (doc) {
                Array.from(
                    doc.querySelectorAll('.' + GENERAL_WARNING_CELL_CLASS)
                ).forEach(function (cell) {
                    cells.add(cell);
                });
            });
        }

        cells.forEach(generalWarningRestoreFrontCell);
        state.generalWarningRenderedCells = new Set();
    }

    function generalWarningFrontLabel(result) {
        if (!result) {
            return '天数未知';
        }

        if (result.stopped) {
            return Number.isFinite(result.stoppedDays)
                ? '已停' + result.stoppedDays + '天'
                : '已停时间未知';
        }

        return Number.isFinite(result.durationDays)
            ? '第' + result.durationDays + '天'
            : '天数未知';
    }

    function generalWarningRenderFront() {
        generalWarningClearFront(false);

        if (!generalWarningRenderEnabled()) {
            return;
        }

        state.generalWarningResults.forEach(function (result) {
            const cell = result.nameCell;

            if (
                !cell ||
                !cell.isConnected ||
                generalWarningHasHigherPriorityRender(cell)
            ) {
                return;
            }

            ensureGeneralWarningFrontStyle(cell.ownerDocument);
            cell.classList.add(
                GENERAL_WARNING_CELL_CLASS,
                'medical-path-general-warning-front-' +
                    (result.statusClass || 'normal')
            );
            cell.setAttribute(
                GENERAL_WARNING_LABEL_ATTRIBUTE,
                generalWarningFrontLabel(result)
            );
            state.generalWarningRenderedCells.add(cell);
        });
    }

    function generalWarningRenderResults(modal) {
        if (!modal) return;

        const summary = modal.querySelector('.path-general-warning-summary');
        const body = modal.querySelector('.path-general-warning-body');
        const results = state.generalWarningResults || [];
        const threshold = generalWarningThreshold();
        const selectedTypes = generalWarningSelectedTypes();
        const scopeMode = generalWarningScopeMode();
        const specifiedParse = generalWarningSpecifiedRuleParse();
        const specifiedItems = specifiedParse.rules;
        const overThreshold = results.filter(function (item) {
            return !item.stopped &&
                Number.isFinite(item.durationDays) &&
                item.durationDays >= threshold;
        });
        const stoppedCount = results.filter(function (item) {
            return item.stopped;
        }).length;
        const suppressed = results.filter(function (item) {
            return generalWarningHasHigherPriorityRender(item.nameCell);
        }).length;

        if (summary) {
            summary.textContent = results.length
                ? [
                    '统计类型：' + selectedTypes.join('＋'),
                    scopeMode === 'all'
                        ? '范围：所选类型下全部长期医嘱'
                        : (
                            '范围：自定义规则' + specifiedItems.length + '条' +
                            (specifiedParse.allTypes ? '（[*]全部字段）' : '')
                        ),
                    '识别长期医嘱' + results.length + '项',
                    generalWarningWarnStoppedOrdersEnabled()
                        ? '其中已停医嘱' + stoppedCount + '项'
                        : '已停医嘱预警关闭',
                    '达到' + threshold + '天阈值' + overThreshold.length + '项',
                    suppressed
                        ? '因药品/中药预警优先而未渲染' + suppressed + '项'
                        : '',
                    '扫描时间' + new Date(
                        state.generalWarningLastScanAt || Date.now()
                    ).toLocaleString()
                ].filter(Boolean).join('；')
                : (
                    scopeMode === 'specified' && !specifiedParse.valid
                        ? (
                            specifiedParse.empty
                                ? '当前选择“仅自定义指定项目”，请使用[字段]"检索内容"格式填写规则。'
                                : '自定义规则语法错误：' + specifiedParse.errors.join('；')
                        )
                        : '尚未扫描到符合当前类型和范围设置的长期医嘱。'
                );
        }

        if (!body) return;

        body.innerHTML = results.map(function (item, index) {
            return '<tr>' +
                '<td>' + (index + 1) + '</td>' +
                '<td>' + escapeHtml(item.canonicalType || item.typeText || '未识别') + '</td>' +
                '<td>' + escapeHtml(item.name) + '</td>' +
                '<td>' + escapeHtml(
                    generalWarningDateText(item.startDate) || item.startText || '未识别'
                ) + '</td>' +
                '<td>' + escapeHtml(
                    item.stopDate
                        ? generalWarningDateText(item.stopDate)
                        : '执行中'
                ) + '</td>' +
                '<td><strong>' + escapeHtml(
                    item.stopped
                        ? (
                            Number.isFinite(item.stoppedDays)
                                ? '已停' + item.stoppedDays + '天'
                                : '已停时间未知'
                        )
                        : (
                            Number.isFinite(item.durationDays)
                                ? '第' + item.durationDays + '天'
                                : '无法计算'
                        )
                ) + '</strong></td>' +
                '<td><span class="path-general-warning-state" data-level="' +
                    escapeHtml(item.statusClass || 'normal') + '">' +
                    escapeHtml(item.status) +
                    '</span></td>' +
                '</tr>';
        }).join('');
    }

    function generalWarningTableSignature(context) {
        if (!context || !context.rows) return '';

        return context.rows.length + '|' +
            context.rows.map(function (row) {
                return orderRowSignature(row);
            }).join('||');
    }

    function generalWarningContextIsUsable(context) {
        if (
            !context ||
            !context.root ||
            !context.root.isConnected ||
            !context.table ||
            !context.table.isConnected
        ) {
            return false;
        }

        /*
         * 医院页面切换“当日/长期/临时医嘱”时，旧表格经常不会立即
         * 从DOM删除，而只是隐藏。旧版只检查isConnected，因此可能继续
         * 扫描已经隐藏的旧表，最终得到0条。这里必须同时要求当前表可见。
         */
        return isVisible(context.root) && isVisible(context.table);
    }

    function generalWarningContextExplicitlyEmpty(context) {
        if (!context || !context.root) return false;

        const textValue = plain(
            context.root.innerText ||
            context.root.textContent ||
            ''
        );

        return /暂无数据|没有数据|无数据|暂无记录|没有记录|检索到\s*0\s*条/.test(
            textValue
        );
    }

    function generalWarningContextHeaderReady(context) {
        if (!context) return false;

        const headers = queryHeaderCenterMap(context);
        const labels = headers.map(function (header) {
            return header.normalized;
        });

        function hasAny(aliases) {
            const targets = aliases.map(normalize);

            return labels.some(function (label) {
                return targets.some(function (target) {
                    return label === target ||
                        label.includes(target) ||
                        target.includes(label);
                });
            });
        }

        /*
         * 名称、长临类别和开始时间是通用预警能够正确提取的三个核心列。
         * 表格正在重绘时其中任一表头可能暂时缺失，此时先等待而不是空扫。
         */
        return hasAny(['医嘱名称', '名称', '项目名称']) &&
            hasAny(['医嘱类别', '长临', '长临嘱', '长临医嘱']) &&
            hasAny(['开始时间', '开立时间']);
    }

    function generalWarningCurrentContext(forceRefresh) {
        const cached = state.generalWarningContext;

        if (
            !forceRefresh &&
            generalWarningContextIsUsable(cached)
        ) {
            cached.rows = tableRows(cached.table);
            return cached;
        }

        const found = findOrderQueryContext();
        state.generalWarningContext = found || null;
        return found;
    }

    async function generalWarningResolveContextForScan(forceRefresh) {
        /*
         * 标签点击后HIS通常先显示表框，再异步填充表头/数据行。
         * 旧版在这几十到几百毫秒窗口内扫描会把“0条”缓存下来。
         * 现在最多等待约2.6秒，并在等待过程中持续重新定位当前可见表格。
         */
        const deadline = Date.now() + 2600;
        let lastContext = null;
        let refresh = Boolean(forceRefresh);

        while (Date.now() < deadline) {
            let context = generalWarningCurrentContext(refresh);
            refresh = false;

            if (!generalWarningContextIsUsable(context)) {
                state.generalWarningContext = null;
                context = generalWarningCurrentContext(true);
            }

            if (context && generalWarningContextIsUsable(context)) {
                lastContext = context;
                context.rows = tableRows(context.table);

                if (generalWarningContextExplicitlyEmpty(context)) {
                    return context;
                }

                const hasManagedHiddenRows = Boolean(
                    context.table &&
                    context.table.querySelector &&
                    context.table.querySelector(
                        '.' + GENERAL_WARNING_HIDE_VOIDED_TEMP_CLASS
                    )
                );

                if (
                    (context.rows.length > 0 || hasManagedHiddenRows) &&
                    generalWarningContextHeaderReady(context)
                ) {
                    return context;
                }
            }

            await sleep(140);
            refresh = true;
        }

        if (
            lastContext &&
            generalWarningContextIsUsable(lastContext)
        ) {
            lastContext.rows = tableRows(lastContext.table);
            return lastContext;
        }

        return null;
    }

    function generalWarningMutationIsOwn(mutation) {
        function ownNode(node) {
            const element = node && node.nodeType === 1
                ? node
                : node && node.parentElement;

            return Boolean(
                element &&
                (
                    element.classList.contains(GENERAL_WARNING_CELL_CLASS) ||
                    element.closest('.' + GENERAL_WARNING_CELL_CLASS)
                )
            );
        }

        const changedNodes = Array.from(mutation.addedNodes || [])
            .concat(Array.from(mutation.removedNodes || []));

        if (changedNodes.length) {
            return changedNodes.every(ownNode);
        }

        return ownNode(mutation.target);
    }

    function generalWarningAttachObserver(context, modal) {
        const root = context
            ? orderQueryGridContainer(context) || context.root
            : null;

        if (!root || !root.isConnected) {
            if (state.generalWarningObserver) {
                state.generalWarningObserver.disconnect();
            }
            state.generalWarningObservedRoot = null;
            return;
        }

        if (
            state.generalWarningObservedRoot === root &&
            state.generalWarningObserver
        ) {
            return;
        }

        if (state.generalWarningObserver) {
            state.generalWarningObserver.disconnect();
        }

        state.generalWarningObservedRoot = root;
        state.generalWarningObserver = new MutationObserver(
            function (mutations) {
                if (
                    document.hidden ||
                    !generalWarningAnyAutomaticFeatureEnabled() ||
                    mutations.every(generalWarningMutationIsOwn)
                ) {
                    return;
                }

                state.generalWarningDirty = true;
                scheduleGeneralWarningScan(
                    modal,
                    '医嘱表变化',
                    GENERAL_WARNING_DEBOUNCE_MS
                );
            }
        );
        state.generalWarningObserver.observe(root, {
            childList: true,
            subtree: true,
            characterData: true
        });
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

    async function scanGeneralWarnings(modal, options) {
        const settings = Object.assign({
            force: false,
            silent: false
        }, options || {});

        if (state.generalWarningBusy) {
            /*
             * 旧版在扫描尚未结束时遇到第二次触发会直接return，
             * 标签切换恰好发生在此时就会漏掉新页面。v1.48.4把最新触发
             * 合并为一次待补扫任务，当前扫描结束后自动执行。
             */
            const pending = state.generalWarningPendingScan || {
                force: false,
                silent: true,
                reason: ''
            };

            state.generalWarningPendingScan = {
                force: Boolean(pending.force || settings.force),
                silent: Boolean(pending.silent && settings.silent),
                reason: settings.reason || pending.reason || '扫描过程中收到新的触发'
            };
            state.generalWarningDirty = true;
            return state.generalWarningResults;
        }

        if (document.hidden && settings.silent) {
            return state.generalWarningResults;
        }

        if (generalWarningScopeMode() === 'specified') {
            const specifiedParse = generalWarningSpecifiedRuleParse();

            if (!specifiedParse.valid) {
                state.generalWarningResults = [];
                state.generalWarningLastSignature = '';
                state.generalWarningLastScanAt = Date.now();
                state.generalWarningDirty = true;
                generalWarningClearFront(false);
                generalWarningRenderResults(modal);

                if (!settings.silent) {
                    suiteWarningScanNotify(
                        'pathway',
                        specifiedParse.empty
                            ? '请先填写自定义规则。必须使用[字段]"检索内容"格式，例如：[康复][文字]"常规针法*"。'
                            : '自定义指定项语法错误：\n' + specifiedParse.errors.join('\n'),
                        'warning'
                    );
                }

                return [];
            }
        }

        state.generalWarningBusy = true;

        try {
            /* 先恢复本脚本隐藏的行，完整读取状态/停止时间；提取后再重新隐藏。 */
            generalWarningRestoreManagedVisibility();

            let context = await generalWarningResolveContextForScan(
                settings.force
            );

            if (!context) {
                state.generalWarningResults = [];
                state.generalWarningContext = null;
                state.generalWarningLastSignature = '';
                state.generalWarningLastScanAt = Date.now();
                generalWarningClearFront(false);
                generalWarningRenderResults(modal);
                generalWarningAttachObserver(null, modal);

                if (!settings.silent) {
                    suiteWarningScanNotify(
                        'pathway',
                        '未识别到“医嘱查询”列表。请先进入当前患者医嘱查询页面，并确保列表已加载。',
                        'warning'
                    );
                }

                return [];
            }

            generalWarningAttachObserver(context, modal);

            /*
             * v1.48.13：本地删除优先级高于预警/普通隐藏。
             * 刚恢复“隐藏已停/隐藏作废”后，先把患者本地删除清单中的行
             * 从DOM真正移除，再重新定位医嘱表进行预警提取。
             */
            localOrderDeleteApplyToContext(context);
            context = findOrderQueryContext() || context;
            localOrderDeleteAttachObserver(context);

            const signature = generalWarningTableSignature(context);
            const now = Date.now();

            if (
                !settings.force &&
                !state.generalWarningDirty &&
                signature === state.generalWarningLastSignature &&
                now - state.generalWarningLastScanAt < GENERAL_WARNING_CACHE_MS
            ) {
                /* 扫描前刚恢复过隐藏行；命中缓存时也必须重新应用当前隐藏设置。 */
                generalWarningApplyManagedVisibility(context);
                generalWarningRenderResults(modal);
                generalWarningRenderFront();
                return state.generalWarningResults;
            }

            let extractedResults = extractGeneralWarningResults(context);

            /*
             * 表格已经出现数据行但首次提取为0时，再做一次短暂复核。
             * 这主要处理EasyUI/layui先绘制行框、随后才写入单元格文字的情况。
             * 真正没有匹配长期医嘱时只额外等待约260ms，不会循环重扫。
             */
            if (
                !extractedResults.length &&
                context.rows &&
                context.rows.length > 0 &&
                !generalWarningContextExplicitlyEmpty(context)
            ) {
                await sleep(260);

                const refreshedContext =
                    await generalWarningResolveContextForScan(true);

                if (refreshedContext) {
                    context = refreshedContext;
                    extractedResults = extractGeneralWarningResults(context);
                }
            }

            state.generalWarningContext = context;
            /* 提取完成后再应用前端隐藏，预警与隐藏互不干扰。 */
            generalWarningApplyManagedVisibility(context);

            state.generalWarningResults = extractedResults;
            state.generalWarningLastSignature =
                generalWarningTableSignature(context);
            state.generalWarningLastScanAt = Date.now();
            state.generalWarningDirty = false;

            generalWarningRenderResults(modal);
            generalWarningRenderFront();

            if (!settings.silent) {
                const selectedTypes = generalWarningSelectedTypes();
                const suppressed = state.generalWarningResults.filter(
                    function (item) {
                        return generalWarningHasHigherPriorityRender(
                            item.nameCell
                        );
                    }
                ).length;

                suiteWarningScanNotify(
                    'pathway',
                    '通用预警扫描完成：类型“' +
                    selectedTypes.join('＋') +
                    '”，识别长期医嘱' +
                    state.generalWarningResults.length + '项。' +
                    (suppressed
                        ? '\n其中' + suppressed +
                            '项已有药品或中药预警标记，通用预警未重复渲染。'
                        : ''),
                    suppressed ? 'warning' : 'success'
                );
            }

            return state.generalWarningResults;
        }
        finally {
            state.generalWarningBusy = false;

            const pending = state.generalWarningPendingScan;
            state.generalWarningPendingScan = null;

            if (pending) {
                /*
                 * 用极短延时让当前DOM提交完成，再执行最后一次补扫。
                 * 多个连续触发会被合并，不会形成扫描风暴。
                 */
                window.setTimeout(function () {
                    state.generalWarningDirty = true;
                    scanGeneralWarnings(modal, {
                        force: true,
                        silent: pending.silent,
                        reason: pending.reason || '扫描结束后的自动补扫'
                    });
                }, 90);
            }
        }
    }

    function scheduleGeneralWarningScan(modal, reason, delay) {
        if (!generalWarningAnyAutomaticFeatureEnabled()) {
            return;
        }

        clearTimeout(state.generalWarningScanTimer);
        state.generalWarningScanTimer = setTimeout(function () {
            if (document.hidden) return;

            scanGeneralWarnings(modal, {
                force: false,
                silent: true,
                reason: reason || ''
            });
        }, Number(delay) || GENERAL_WARNING_DEBOUNCE_MS);
    }

    function clearGeneralWarningResults(modal, show) {
        clearTimeout(state.generalWarningScanTimer);
        state.generalWarningResults = [];
        state.generalWarningLastSignature = '';
        state.generalWarningLastScanAt = 0;
        state.generalWarningDirty = true;
        generalWarningClearFront(false);
        generalWarningRenderResults(modal);

        if (show !== false) {
            showStatus(
                '通用预警结果及医嘱界面标记已清除。',
                'normal'
            );
        }
    }

    function generalWarningSetTypeCheckboxes(
        modal,
        values,
        persist
    ) {
        if (!modal) return [];

        const selected = Array.from(new Set(
            (values || []).filter(function (value) {
                return GENERAL_WARNING_TYPE_OPTIONS.includes(value);
            })
        ));
        const safeSelected = selected.length
            ? selected
            : generalWarningSelectedTypes();
        const typeInputs = Array.from(
            modal.querySelectorAll('.path-general-warning-type')
        );

        typeInputs.forEach(function (input) {
            input.checked = safeSelected.includes(input.value);
        });

        if (persist && selected.length) {
            GM_setValue(
                KEYS.generalWarningTypes,
                selected
            );
        }

        return selected.length ? selected : safeSelected;
    }

    function generalWarningUpdateSpecifiedSyntaxUi(
        modal,
        options
    ) {
        const settings = Object.assign({
            persistText: false,
            syncTypes: true
        }, options || {});
        const textarea = modal && modal.querySelector(
            '.path-general-warning-specified-items'
        );
        const status = modal && modal.querySelector(
            '.path-general-warning-syntax-status'
        );
        const source = textarea
            ? textarea.value
            : generalWarningSpecifiedText();

        if (settings.persistText) {
            GM_setValue(
                KEYS.generalWarningItems,
                source
            );
        }

        const parsed = generalWarningParseSpecifiedRules(source);

        if (
            settings.syncTypes &&
            generalWarningScopeMode() === 'specified' &&
            parsed.valid
        ) {
            generalWarningSetTypeCheckboxes(
                modal,
                parsed.selectedTypes,
                true
            );
        }

        if (status) {
            status.classList.remove('valid', 'invalid', 'idle');

            if (generalWarningScopeMode() !== 'specified') {
                status.classList.add('idle');
                status.textContent =
                    '切换到“仅自定义指定项目”后启用规则语法。';
            }
            else if (parsed.empty) {
                status.classList.add('invalid');
                status.textContent =
                    '必须声明字段范围并使用双引号，例如：[康复][文字]"常规针法*"。';
            }
            else if (!parsed.valid) {
                status.classList.add('invalid');
                status.textContent =
                    '语法错误：' + parsed.errors.join('；');
            }
            else {
                status.classList.add('valid');
                status.textContent =
                    '语法有效：' + parsed.rules.length + '条检索规则；字段范围：' +
                    (parsed.allTypes
                        ? '*（全部类型）'
                        : parsed.selectedTypes.join('＋')) +
                    '。左右字段范围已双向同步。';
            }
        }

        return parsed;
    }

    function updateGeneralWarningScopeUi(modal) {
        const specified = modal.querySelector(
            '.path-general-warning-specified-items'
        );
        const mode = generalWarningScopeMode();

        if (specified) {
            specified.disabled = mode !== 'specified';
            specified.classList.toggle(
                'disabled',
                mode !== 'specified'
            );
        }

        /*
         * 首次切换到自定义模式且右侧为空时，以当前左侧勾选为初始范围。
         * 每个新增字段独立生成 [字段]"*"，后续可直接修改为更精确的检索式。
         */
        if (mode === 'specified') {
            generalWarningInitializeSpecifiedRulesFromChecks(modal);
        }

        generalWarningUpdateSpecifiedSyntaxUi(modal, {
            persistText: false,
            syncTypes: mode === 'specified'
        });
    }

    function initializeGeneralWarningSystem(modal) {
        if (!modal) return;

        const autoScan = modal.querySelector(
            '.path-general-warning-auto-scan'
        );
        const render = modal.querySelector(
            '.path-general-warning-render'
        );
        const warnStoppedOrders = modal.querySelector(
            '.path-general-warning-warn-stopped'
        );
        const hideStoppedOrders = modal.querySelector(
            '.path-general-warning-hide-stopped'
        );
        const hideVoidedTemporary = modal.querySelector(
            '.path-general-warning-hide-voided-temporary'
        );
        const threshold = modal.querySelector(
            '.path-general-warning-threshold'
        );
        const scanButton = modal.querySelector(
            '.path-general-warning-scan'
        );
        const clearButton = modal.querySelector(
            '.path-general-warning-clear'
        );
        const typeInputs = Array.from(
            modal.querySelectorAll('.path-general-warning-type')
        );
        const scopeInputs = Array.from(
            modal.querySelectorAll('.path-general-warning-scope')
        );
        const specifiedItems = modal.querySelector(
            '.path-general-warning-specified-items'
        );

        if (!autoScan || autoScan.dataset.bound === '1') return;

        autoScan.dataset.bound = '1';
        autoScan.checked = generalWarningAutoScanEnabled();
        render.checked = generalWarningRenderEnabled();
        if (warnStoppedOrders) {
            warnStoppedOrders.checked = generalWarningWarnStoppedOrdersEnabled();
        }
        if (hideStoppedOrders) {
            hideStoppedOrders.checked = generalWarningHideStoppedOrdersEnabled();
        }
        if (hideVoidedTemporary) {
            hideVoidedTemporary.checked = generalWarningHideVoidedTemporaryEnabled();
        }
        threshold.value = String(generalWarningThreshold());

        const selectedTypes = generalWarningSelectedTypes();
        typeInputs.forEach(function (input) {
            input.checked = selectedTypes.includes(input.value);
        });

        scopeInputs.forEach(function (input) {
            input.checked = input.value === generalWarningScopeMode();
        });
        specifiedItems.value = generalWarningSpecifiedText();
        updateGeneralWarningScopeUi(modal);

        if (!generalWarningHideStoppedOrdersEnabled()) {
            generalWarningRestoreStoppedVisibility();
        }
        if (!generalWarningHideVoidedTemporaryEnabled()) {
            generalWarningRestoreVoidedTemporaryVisibility();
        }

        function rescanAfterConfigChange(reason) {
            state.generalWarningDirty = true;
            scanGeneralWarnings(modal, {
                force: true,
                silent: true,
                reason: reason || '配置变化'
            });
        }

        autoScan.addEventListener('change', function () {
            GM_setValue(
                KEYS.generalWarningAutoScan,
                autoScan.checked
            );
            state.generalWarningDirty = true;

            if (autoScan.checked) {
                scheduleGeneralWarningScan(
                    modal,
                    '开启自动扫描',
                    120
                );
            }
        });

        render.addEventListener('change', function () {
            GM_setValue(
                KEYS.generalWarningRender,
                render.checked
            );
            state.generalWarningDirty = true;

            if (render.checked) {
                scheduleGeneralWarningScan(
                    modal,
                    '开启前端渲染',
                    120
                );
            }
            else {
                generalWarningClearFront(false);
            }
        });

        if (warnStoppedOrders) {
            warnStoppedOrders.addEventListener('change', function () {
                GM_setValue(
                    KEYS.generalWarningWarnStoppedOrders,
                    warnStoppedOrders.checked
                );
                state.generalWarningDirty = true;
                rescanAfterConfigChange(
                    warnStoppedOrders.checked
                        ? '开启预警已停医嘱'
                        : '关闭预警已停医嘱'
                );
            });
        }

        if (hideStoppedOrders) {
            hideStoppedOrders.addEventListener('change', function () {
                GM_setValue(
                    KEYS.generalWarningHideStoppedOrders,
                    hideStoppedOrders.checked
                );
                state.generalWarningDirty = true;
                if (!hideStoppedOrders.checked) {
                    generalWarningRestoreStoppedVisibility();
                }
                scanGeneralWarnings(modal, {
                    force: true,
                    silent: true,
                    reason: hideStoppedOrders.checked
                        ? '开启隐藏已停医嘱'
                        : '关闭隐藏已停医嘱'
                });
            });
        }

        if (hideVoidedTemporary) {
            hideVoidedTemporary.addEventListener('change', function () {
                GM_setValue(
                    KEYS.generalWarningHideVoidedTemporary,
                    hideVoidedTemporary.checked
                );
                state.generalWarningDirty = true;

                if (!hideVoidedTemporary.checked) {
                    generalWarningRestoreVoidedTemporaryVisibility();
                }

                /*
                 * 无论自动扫描是否开启，都立即重新定位当前医嘱查询表，
                 * 让勾选/取消后的显示效果即时生效。
                 */
                scanGeneralWarnings(modal, {
                    force: true,
                    silent: true,
                    reason: hideVoidedTemporary.checked
                        ? '开启隐藏作废临时医嘱'
                        : '关闭隐藏作废临时医嘱'
                });
            });
        }

        threshold.addEventListener('change', function () {
            const value = Math.max(
                1,
                Math.round(
                    generalWarningPositiveNumber(
                        threshold.value,
                        10
                    )
                )
            );

            threshold.value = String(value);
            GM_setValue(
                KEYS.generalWarningThreshold,
                value
            );
            rescanAfterConfigChange('阈值变化');
        });

        typeInputs.forEach(function (input) {
            input.addEventListener('change', function () {
                if (generalWarningScopeMode() === 'specified') {
                    const syncResult = generalWarningSyncSpecifiedRulesFromTypeToggle(
                        modal,
                        input
                    );

                    if (syncResult.changed) {
                        showStatus(
                            input.checked
                                ? '已同步新增字段范围：[' + input.value + ']"*"。'
                                : '已从右侧全部自定义规则中删除字段范围：[' + input.value + ']。',
                            'normal'
                        );
                        rescanAfterConfigChange('左侧字段勾选同步到自定义规则');
                    }

                    return;
                }

                let values = typeInputs
                    .filter(function (item) {
                        return item.checked;
                    })
                    .map(function (item) {
                        return item.value;
                    });

                if (!values.length) {
                    input.checked = true;
                    values = [input.value];
                    showStatus(
                        '至少需要保留一种医嘱类型。',
                        'warning'
                    );
                }

                GM_setValue(
                    KEYS.generalWarningTypes,
                    values
                );
                rescanAfterConfigChange('统计类型变化');
            });
        });

        scopeInputs.forEach(function (input) {
            input.addEventListener('change', function () {
                if (!input.checked) return;

                GM_setValue(
                    KEYS.generalWarningScopeMode,
                    input.value === 'specified'
                        ? 'specified'
                        : 'all'
                );
                updateGeneralWarningScopeUi(modal);
                rescanAfterConfigChange('统计范围变化');
            });
        });

        let specifiedSyntaxTimer = null;

        specifiedItems.addEventListener('input', function () {
            clearTimeout(specifiedSyntaxTimer);
            specifiedSyntaxTimer = setTimeout(function () {
                generalWarningUpdateSpecifiedSyntaxUi(
                    modal,
                    {
                        persistText: true,
                        syncTypes: true
                    }
                );
            }, 260);
        });

        specifiedItems.addEventListener('change', function () {
            const parsed = generalWarningUpdateSpecifiedSyntaxUi(
                modal,
                {
                    persistText: true,
                    syncTypes: true
                }
            );

            if (
                generalWarningScopeMode() === 'specified' &&
                !parsed.valid
            ) {
                clearGeneralWarningResults(modal, false);
                return;
            }

            rescanAfterConfigChange('指定项目规则变化');
        });

        scanButton.addEventListener('click', function () {
            const parsed = generalWarningUpdateSpecifiedSyntaxUi(
                modal,
                {
                    persistText: true,
                    syncTypes: true
                }
            );

            if (
                generalWarningScopeMode() === 'specified' &&
                !parsed.valid
            ) {
                showStatus(
                    parsed.empty
                        ? '请填写自定义规则，例如：[康复][文字]"常规针法*"。'
                        : '自定义指定项语法错误：\n' + parsed.errors.join('\n'),
                    'warning'
                );
                clearGeneralWarningResults(modal, false);
                return;
            }

            state.generalWarningDirty = true;
            scanGeneralWarnings(modal, {
                force: true,
                silent: false
            });
        });

        clearButton.addEventListener('click', function () {
            clearGeneralWarningResults(modal, true);
        });

        if (!state.generalWarningVisibilityBound) {
            state.generalWarningVisibilityBound = true;
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) return;

                /*
                 * v1.48.5：浏览器标签页重新可见不再直接触发扫描。
                 * 只标记缓存需要重新核对，并尝试恢复当前缓存结果的前端标记。
                 * 后续真正的医嘱DOM变化、管理器医嘱标签联动、手工扫描或
                 * 12秒低频签名兜底仍可触发正常扫描。
                 */
                if (generalWarningAnyAutomaticFeatureEnabled()) {
                    state.generalWarningDirty = true;

                    if (state.generalWarningContext) {
                        generalWarningApplyManagedVisibility(
                            state.generalWarningContext
                        );
                    }

                    if (state.generalWarningResults.length) {
                        generalWarningRenderResults(modal);
                        generalWarningRenderFront();
                    }
                }
            });
        }

        if (!state.generalWarningFallbackTimer) {
            state.generalWarningFallbackTimer = setInterval(function () {
                if (
                    document.hidden ||
                    !generalWarningAnyAutomaticFeatureEnabled()
                ) {
                    return;
                }

                const context = generalWarningCurrentContext(true);

                if (!context) {
                    if (state.generalWarningResults.length) {
                        clearGeneralWarningResults(modal, false);
                    }
                    return;
                }

                generalWarningAttachObserver(context, modal);
                const signature = generalWarningTableSignature(context);

                if (
                    state.generalWarningDirty ||
                    signature !== state.generalWarningLastSignature
                ) {
                    state.generalWarningDirty = true;
                    scheduleGeneralWarningScan(
                        modal,
                        '低频兜底检查',
                        120
                    );
                }
            }, GENERAL_WARNING_FALLBACK_MS);
        }

        generalWarningRenderResults(modal);

        if (generalWarningAnyAutomaticFeatureEnabled()) {
            scheduleGeneralWarningScan(modal, '初始化', 500);
        }
    }


    function importedOrderNumber(value) {
        const source = plain(value)
            .replace(/，/g, '.')
            .replace(/,/g, '');
        const match = source.match(/-?\d+(?:\.\d+)?/);
        if (!match) return '';
        const number = Number(match[0]);
        return Number.isFinite(number) && number > 0
            ? number
            : '';
    }

    function importedOrderText(value) {
        const result = plain(value);
        if (
            !result ||
            /^(请选择|请选|选择|未选择|无|--|-|空)$/i.test(result)
        ) {
            return '';
        }
        return result;
    }

    function queryHeaderCenterMap(context) {
        const result = [];
        const container = orderQueryGridContainer(context);
        const headers = [];
        const seen = new Set();

        [
            context && context.table,
            context && context.root,
            container
        ].filter(Boolean).forEach(function (root) {
            Array.from(
                root.querySelectorAll
                    ? root.querySelectorAll('thead th,th,[role="columnheader"]')
                    : []
            ).filter(isVisible).forEach(function (header) {
                if (seen.has(header)) return;
                seen.add(header);
                const rect = header.getBoundingClientRect();
                const label = plain(
                    header.innerText || header.textContent
                );
                if (!label || rect.width <= 0) return;
                result.push({
                    label: label,
                    normalized: normalize(label),
                    center: rect.left + rect.width / 2,
                    width: rect.width
                });
            });
        });

        return result;
    }

    function queryRowValue(context, row, aliases, headerMap) {
        const targets = (aliases || []).map(normalize);
        const headers = (headerMap || queryHeaderCenterMap(context))
            .filter(function (header) {
                return targets.some(function (target) {
                    return (
                        header.normalized === target ||
                        header.normalized.includes(target) ||
                        target.includes(header.normalized)
                    );
                });
            })
            .sort(function (a, b) {
                const exactA = targets.includes(a.normalized) ? 0 : 1;
                const exactB = targets.includes(b.normalized) ? 0 : 1;
                if (exactA !== exactB) return exactA - exactB;
                return a.width - b.width;
            });

        if (!headers.length) return '';

        const cells = rowCells(row);
        const center = headers[0].center;
        const covering = cells
            .filter(function (cell) {
                const rect = cell.getBoundingClientRect();
                return center >= rect.left - 3 && center <= rect.right + 3;
            })
            .sort(function (a, b) {
                return a.getBoundingClientRect().width -
                    b.getBoundingClientRect().width;
            });

        const cell = covering[0] || cells
            .map(function (candidate) {
                const rect = candidate.getBoundingClientRect();
                return {
                    cell: candidate,
                    distance: Math.abs(
                        rect.left + rect.width / 2 - center
                    )
                };
            })
            .sort(function (a, b) {
                return a.distance - b.distance;
            })[0]?.cell;

        if (!cell) return '';

        const select = nativeSelect(cell);
        if (select) {
            const option = select.options && select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;
            return importedOrderText(
                option
                    ? option.textContent || option.value
                    : select.value
            );
        }

        const input = visibleInput(cell);
        if (input) {
            return importedOrderText(
                input.isContentEditable
                    ? input.textContent
                    : input.value
            );
        }

        return importedOrderText(
            cell.innerText || cell.textContent
        );
    }

    function queryOrderTypeToTab(typeText, nameText) {
        const type = normalize(typeText);
        const name = normalize(nameText);

        if (/中草药|中药|草药/.test(type)) return '中草药';
        if (/出院带药/.test(type)) return '出院带药';
        if (/康复/.test(type)) return '康复医嘱';
        if (/耗材/.test(type)) return '耗材';
        if (/检验|化验/.test(type)) return '检验';
        if (/检查|影像|超声|心电|放射/.test(type)) return '检查';
        if (/文字/.test(type)) return '文字录入';
        if (/项目|治疗/.test(type)) return '项目录入';
        if (/药品|西药|注射|口服/.test(type)) return '药品录入';

        if (/取穴|护理常规|饮食|留陪人|测血压/.test(name)) {
            return '文字录入';
        }
        if (/针法|灸法|推拿|穴位/.test(name)) {
            return '康复医嘱';
        }

        return '文字录入';
    }

    function orderTypeLongOrTemporary(value, fallback) {
        const source = importedOrderText(value);
        if (/临|临时|st/i.test(source)) return '临';
        if (/长|长期/.test(source)) return '长';
        return fallback || '长';
    }

    function extractOrdersFromQueryPage(context) {
        if (!context) return [];
        const headerMap = queryHeaderCenterMap(context);
        const items = [];
        const localDeleteIdentity = localOrderDeleteCurrentPatientIdentity();
        const localDeleteSignatures = localOrderDeleteCurrentSignatureSet(
            localDeleteIdentity
        );

        context.rows.forEach(function (row) {
            /*
             * 正常情况下本地删除行已经从DOM detach；这里再做一次共享
             * localStorage排除校验，防止表格刚刷新、Observer尚未来得及移除
             * 时被当前页AI提取/加入组套误读。
             */
            if (
                localDeleteSignatures.size &&
                localOrderDeleteRecordExists(
                    context,
                    row,
                    localDeleteSignatures,
                    headerMap
                )
            ) {
                return;
            }

            const name = queryRowValue(
                context,
                row,
                ['医嘱名称', '名称', '项目名称'],
                headerMap
            );
            if (!name || /暂无数据|没有数据|无数据/.test(name)) return;

            const typeText = queryRowValue(
                context,
                row,
                ['医嘱类型', '类型'],
                headerMap
            );
            const tab = queryOrderTypeToTab(typeText, name);
            const doseText = queryRowValue(
                context,
                row,
                ['剂量', '每次剂量', '每次治疗量'],
                headerMap
            );
            const unitText = queryRowValue(
                context,
                row,
                ['单位', '剂量单位'],
                headerMap
            );
            const route = queryRowValue(
                context,
                row,
                ['用法', '给药途径'],
                headerMap
            );
            const frequency = queryRowValue(
                context,
                row,
                ['频次', '频率'],
                headerMap
            );
            const orderCategory = queryRowValue(
                context,
                row,
                ['医嘱类别', '长临', '长临嘱'],
                headerMap
            );
            const groupNo = queryRowValue(
                context,
                row,
                ['同组', '组号', '组别'],
                headerMap
            );
            const department = queryRowValue(
                context,
                row,
                ['执行科室', '科室'],
                headerMap
            );
            const totalText = queryRowValue(
                context,
                row,
                ['药品总量', '总量', '数量'],
                headerMap
            );
            const billing = queryRowValue(
                context,
                row,
                ['计费'],
                headerMap
            );
            const transfer = queryRowValue(
                context,
                row,
                ['转自费'],
                headerMap
            );

            const dose = importedOrderNumber(doseText);
            const total = importedOrderNumber(totalText);
            const item = normalizeItem({
                id: makeId('item'),
                enabled: true,
                tab: tab,
                orderType: orderTypeLongOrTemporary(
                    orderCategory,
                    isApplicationTab(tab) ? '临' : '长'
                ),
                name: name,
                searchName: name,
                secondarySearchName: tab === '检验' ? name : '',
                department: department,
                groupNo: groupNo,
                dose: dose,
                unit: unitText,
                route: route,
                frequency:
                    frequency ||
                    (
                        context.isDischargedOrderPage
                            ? ''
                            : (isApplicationTab(tab) ? 'st' : 'qd')
                    ),
                total: total,
                dischargeFlag: tab === '出院带药' ? '是' : '否',
                transferSelfPay: /是/.test(transfer) ? '是' : '否',
                billing: billing && /否/.test(billing) ? '否' : '是',
                decoctionMode:
                    tab === '中草药' && ['代煎', '自煎', '外用', '冲服'].includes(route)
                        ? route
                        : '自煎',
                status: ''
            });

            items.push(item);
        });

        return items;
    }

    function extractOrdersFromEntryTab(tabName, context) {
        if (!context) return [];
        const items = [];

        context.rows.forEach(function (row) {
            const name = importedOrderText(
                fieldDisplayValue(context, row, 'name')
            );
            if (!name || /暂无数据|没有数据|无数据/.test(name)) return;

            const route = importedOrderText(
                fieldDisplayValue(context, row, 'route')
            );
            const decoctionValue = importedOrderText(
                fieldDisplayValue(context, row, 'decoction')
            );
            const dose = importedOrderNumber(
                fieldDisplayValue(context, row, 'dose')
            );
            const days = importedOrderNumber(
                fieldDisplayValue(context, row, 'days')
            );
            const quantity = importedOrderNumber(
                fieldDisplayValue(context, row, 'quantity')
            );
            const total = importedOrderNumber(
                fieldDisplayValue(context, row, 'total')
            );
            const doseCount = importedOrderNumber(
                fieldDisplayValue(context, row, 'doseCount')
            );
            const transfer = importedOrderText(
                fieldDisplayValue(context, row, 'transferSelfPay')
            );
            const billing = importedOrderText(
                fieldDisplayValue(context, row, 'billing')
            );
            const discharge = importedOrderText(
                fieldDisplayValue(context, row, 'dischargeFlag')
            );

            let decoctionMode = '自煎';
            if (
                tabName === '中草药' &&
                ['代煎', '自煎', '外用', '冲服'].includes(route)
            ) {
                decoctionMode = route;
            }
            else if (tabName === '中草药' && /是/.test(decoctionValue)) {
                decoctionMode = '代煎';
            }

            items.push(normalizeItem({
                id: makeId('item'),
                enabled: true,
                tab: tabName,
                orderType: orderTypeLongOrTemporary(
                    fieldDisplayValue(context, row, 'orderType'),
                    isApplicationTab(tabName) ? '临' : '长'
                ),
                name: name,
                searchName: name,
                secondarySearchName: tabName === '检验' ? name : '',
                department: importedOrderText(
                    fieldDisplayValue(context, row, 'department')
                ),
                groupNo: importedOrderText(
                    fieldDisplayValue(context, row, 'groupNo')
                ),
                dose: dose,
                unit: importedOrderText(
                    fieldDisplayValue(context, row, 'unit')
                ),
                route: route,
                frequency: importedOrderText(
                    fieldDisplayValue(context, row, 'frequency')
                ) || (isApplicationTab(tabName) ? 'st' : 'qd'),
                days: days,
                quantity: quantity,
                total: total,
                doseCount: doseCount || 7,
                decoctionMode: decoctionMode,
                instruction: importedOrderText(
                    fieldDisplayValue(context, row, 'instruction')
                ),
                specimen: importedOrderText(
                    fieldDisplayValue(context, row, 'specimen')
                ),
                bodyPart: importedOrderText(
                    fieldDisplayValue(context, row, 'bodyPart')
                ),
                dischargeFlag:
                    discharge && /是/.test(discharge)
                        ? '是'
                        : (tabName === '出院带药' ? '是' : '否'),
                transferSelfPay: /是/.test(transfer) ? '是' : '否',
                billing: billing && /否/.test(billing) ? '否' : '是',
                status: ''
            }));
        });

        return items;
    }

    function activeMedicalOrderNavigationTab() {
        const names = ['医嘱查询'].concat(TAB_NAMES);
        const candidates = [];

        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll('a,li,button,[role="tab"],span,div')
            ).filter(isVisible).forEach(function (element) {
                if (
                    element.closest('#' + IDS.modal) ||
                    element.closest('#' + IDS.panel)
                ) {
                    return;
                }

                const label = plain(
                    element.innerText || element.textContent
                );
                const name = names.find(function (item) {
                    return normalize(label) === normalize(item);
                });
                if (!name) return;

                const ownClass = String(element.className || '');
                const parentClass = element.parentElement
                    ? String(element.parentElement.className || '')
                    : '';
                const classText = ownClass + ' ' + parentClass;
                const ariaSelected =
                    element.getAttribute('aria-selected') === 'true' ||
                    element.parentElement?.getAttribute('aria-selected') === 'true';
                const activeClass =
                    /(?:^|\s)(?:active|selected|current|on|layui-this|is-active)(?:\s|$)/i.test(classText);
                const rect = element.getBoundingClientRect();
                let score = 0;

                if (ariaSelected) score += 10000;
                if (activeClass) score += 8000;
                if (/color/i.test(element.getAttribute('style') || '')) score += 200;
                score -= rect.top / 20;

                candidates.push({
                    name: name,
                    score: score,
                    element: element
                });
            });
        });

        candidates.sort(function (a, b) {
            return b.score - a.score;
        });

        if (!candidates.length) return '';
        if (candidates[0].score >= 6000) return candidates[0].name;
        return '';
    }

    function detectCurrentPageOrders() {
        const activeTab = activeMedicalOrderNavigationTab();

        if (activeTab === '医嘱查询') {
            const queryContext = findOrderQueryContext();
            if (queryContext) {
                return {
                    source:
                        queryContext.sourceLabel ||
                        '医嘱查询当前页',
                    items: extractOrdersFromQueryPage(queryContext)
                };
            }
        }

        if (TAB_NAMES.includes(activeTab)) {
            const context = findTableContext(activeTab);
            if (context) {
                return {
                    source: activeTab + '当前页',
                    items: extractOrdersFromEntryTab(activeTab, context)
                };
            }
        }

        const queryContext = findOrderQueryContext();
        if (queryContext) {
            return {
                source:
                    queryContext.sourceLabel ||
                    '医嘱查询当前页',
                items: extractOrdersFromQueryPage(queryContext)
            };
        }

        const candidates = TAB_NAMES.map(function (tabName) {
            const context = findTableContext(tabName);
            return context
                ? {
                    tabName: tabName,
                    context: context,
                    score:
                        context.rows.length * 1000 -
                        context.root.getBoundingClientRect().top
                }
                : null;
        }).filter(Boolean).sort(function (a, b) {
            return b.score - a.score;
        });

        if (candidates.length) {
            const candidate = candidates[0];
            return {
                source: candidate.tabName + '当前页',
                items: extractOrdersFromEntryTab(
                    candidate.tabName,
                    candidate.context
                )
            };
        }

        return {
            source: '',
            items: []
        };
    }

    /******************************************************************
     * v1.48.18 独立住院医嘱开立工作区
     *
     * 目标：
     * 1. 当前在院医嘱查询、医嘱录入标签页与已出区患者医嘱信息页
     *    统一进入独立住院医嘱开立窗口；
     * 2. 自动读取失败时仍可手动粘贴或修改文本；
     * 3. 支持本地规则解析与DeepSeek结构化解析；
     * 4. 使用住院组套同构的GUI/JSON草稿，经校验后跨类型直接执行；
     * 5. “当前页医嘱加入组套”保持v1.48.14原入口和原逻辑。
     ******************************************************************/

    function orderImportTabFromValue(value, nameValue) {
        const type = normalize(value);
        const name = normalize(nameValue);

        const direct = [
            { tab: '中草药', pattern: /中草药|中药新|中药|草药/ },
            { tab: '出院带药', pattern: /出院带药|带药/ },
            { tab: '康复医嘱', pattern: /康复医嘱|康复|针灸|推拿|灸法|针法/ },
            { tab: '耗材', pattern: /耗材|材料/ },
            { tab: '检验', pattern: /检验|化验/ },
            { tab: '检查', pattern: /检查|影像|放射|超声/ },
            { tab: '项目录入', pattern: /项目录入|项目|治疗/ },
            { tab: '药品录入', pattern: /药品录入|西药处方|西药|药品|注射|口服/ },
            { tab: '文字录入', pattern: /文字录入|文字|护理|指示/ }
        ].find(function (item) {
            return item.pattern.test(type);
        });

        if (direct) return direct.tab;
        if (/血常规|尿常规|便常规|肝功|肾功|血脂|血糖|电解质|凝血|生化|血沉|c反应蛋白|肿瘤标志物/.test(name)) {
            return '检验';
        }
        if (/ct|mri|磁共振|超声|彩超|心电图|脑电图|肌电图|x线|摄片|造影|内镜/.test(name)) {
            return '检查';
        }
        if (/针灸|针法|推拿|艾灸|隔物灸|穴位|康复训练|运动疗法|作业疗法/.test(name)) {
            return '康复医嘱';
        }
        if (/护理|饮食|留陪人|测血压|测血糖|今日出院|明日出院|卧床|活动/.test(name)) {
            return '文字录入';
        }
        if (/片|胶囊|注射液|颗粒|口服液|滴眼液|滴丸|贴膏|乳膏|软膏|喷雾|吸入剂/.test(name)) {
            return '药品录入';
        }

        return '文字录入';
    }

    function normalizeOrderImportItem(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const name = importedOrderText(
            source.name ||
            source.itemName ||
            source.orderName ||
            source.drugName ||
            source.herbName ||
            source['医嘱名称'] ||
            source['医嘱'] ||
            source['名称']
        );
        const tab = orderImportTabFromValue(
            source.tab ||
            source.module ||
            source.type ||
            source.orderTypeName ||
            source['医嘱类型'],
            name
        );
        const route = importedOrderText(
            source.route ||
            source.usage ||
            source.method ||
            source['用法']
        );
        const rawOrderCategory =
            source.orderType ||
            source.orderCategory ||
            source.longTemporary ||
            source['医嘱类别'] ||
            source['长临'];
        const rawDoseValue =
            source.dose ||
            source.amount ||
            source['剂量'] ||
            source['每次剂量'] ||
            '';
        const doseUnitMatch = String(rawDoseValue).match(
            /\d+(?:\.\d+)?\s*(μg|ug|mcg|mg|g|ml|mL|l|L|iu|IU|u|U|片|粒|支|袋|瓶|丸|枚|贴|喷|滴|吸|次|项|付|盒)/i
        );

        return normalizeItem({
            id: source.id || makeId('item'),
            enabled: source.enabled !== false,
            tab: tab,
            orderType: orderTypeLongOrTemporary(
                rawOrderCategory,
                isApplicationTab(tab) ? '临' : '长'
            ),
            name: name,
            searchName: importedOrderText(
                source.searchName ||
                source.lookupName ||
                source.name ||
                source.itemName ||
                name
            ) || name,
            secondarySearchName: importedOrderText(
                source.secondarySearchName ||
                source.secondaryName ||
                source.secondaryDirectory ||
                source.subdirectory ||
                source['二级目录检索名称'] ||
                (tab === '检验' ? name : '')
            ),
            department: importedOrderText(
                source.department ||
                source.executionDepartment ||
                source['执行科室']
            ),
            groupNo: importedOrderText(
                source.groupNo ||
                source.group ||
                source['同组'] ||
                source['组号'] ||
                (tab === '中草药' ? '1' : '')
            ),
            dose: importedOrderNumber(
                rawDoseValue
            ),
            unit: importedOrderText(
                source.unit ||
                source['单位'] ||
                source['剂量单位'] ||
                (doseUnitMatch ? doseUnitMatch[1] : '') ||
                (tab === '中草药' ? '克' : '')
            ),
            route: route,
            frequency: importedOrderText(
                source.frequency ||
                source.freq ||
                source['频次'] ||
                source['频率']
            ),
            days: importedOrderNumber(
                source.days ||
                source.course ||
                source['天数']
            ),
            quantity: importedOrderNumber(
                source.quantity ||
                source.count ||
                source['数量']
            ),
            total: importedOrderNumber(
                source.total ||
                source['药品总量'] ||
                source['总量']
            ),
            doseCount: importedOrderNumber(
                source.doseCount ||
                source.decoctionCount ||
                source['剂数']
            ) || 7,
            decoctionMode:
                ['代煎', '自煎', '外用', '冲服'].includes(
                    source.decoctionMode
                )
                    ? source.decoctionMode
                    : (
                        tab === '中草药' &&
                        ['代煎', '自煎', '外用', '冲服'].includes(route)
                            ? route
                            : '自煎'
                    ),
            instruction: importedOrderText(
                source.instruction ||
                source.note ||
                source.remark ||
                source['嘱托'] ||
                source['备注']
            ),
            specimen: importedOrderText(
                source.specimen ||
                source['标本']
            ),
            bodyPart: importedOrderText(
                source.bodyPart ||
                source['部位']
            ),
            dischargeFlag:
                tab === '出院带药' || /是/.test(source.dischargeFlag)
                    ? '是'
                    : '否',
            transferSelfPay: /是/.test(
                source.transferSelfPay ||
                source.selfPay ||
                source['转自费'] ||
                ''
            ) ? '是' : '否',
            billing: /否/.test(
                source.billing ||
                source['计费'] ||
                ''
            ) ? '否' : '是',
            customFields:
                source.customFields &&
                typeof source.customFields === 'object' &&
                !Array.isArray(source.customFields)
                    ? source.customFields
                    : {},
            status: importedOrderText(source.status)
        });
    }

    function orderImportFieldObject(block) {
        const result = {};
        String(block || '').split(/\n+/).forEach(function (line) {
            const match = plain(line).match(/^([^：:]{1,24})[：:]\s*(.*)$/);
            if (!match) return;
            result[plain(match[1])] = plain(match[2]);
        });
        return result;
    }

    function parseOrderImportStructuredBlocks(source) {
        if (!/【医嘱\s*\d+】/.test(source)) return [];
        return source
            .split(/(?=【医嘱\s*\d+】)/)
            .map(orderImportFieldObject)
            .map(normalizeOrderImportItem)
            .filter(function (item) {
                return Boolean(item.name);
            });
    }

    function orderImportTableTokens(line) {
        const rawSource = String(line || '').replace(/\r/g, '');
        const source = rawSource.trim();
        if (source.includes('\t')) {
            /*
             * 从HIS表格复制时必须保留空列。若把连续制表符合并，
             * 空的停止时间/停止医生会造成后续医嘱、科室等字段错位。
             */
            return rawSource.split('\t').map(plain);
        }
        return source.split(/\s{2,}/).map(plain);
    }

    function orderImportHeaderIndex(headers, aliases) {
        const targets = aliases.map(normalize);
        return headers.findIndex(function (header) {
            return targets.includes(normalize(header));
        });
    }

    function parseOrderImportTableText(source) {
        const lines = String(source || '').split(/\n+/)
            .map(function (line) {
                return String(line || '').replace(/\r/g, '');
            })
            .filter(function (line) {
                return Boolean(line.trim());
            });
        const headerLineIndex = lines.findIndex(function (line) {
            const tokens = orderImportTableTokens(line);
            return (
                orderImportHeaderIndex(tokens, ['医嘱名称', '医嘱', '名称']) >= 0 &&
                orderImportHeaderIndex(tokens, ['医嘱类别', '长临', '长临嘱', '医嘱类型']) >= 0
            );
        });

        if (headerLineIndex < 0) return [];
        const headers = orderImportTableTokens(lines[headerLineIndex]);
        const index = {
            category: orderImportHeaderIndex(headers, ['医嘱类别', '长临', '长临嘱']),
            type: orderImportHeaderIndex(headers, ['医嘱类型', '类型']),
            name: orderImportHeaderIndex(headers, ['医嘱名称', '医嘱', '名称']),
            groupNo: orderImportHeaderIndex(headers, ['同组', '组号', '组别']),
            dose: orderImportHeaderIndex(headers, ['剂量', '每次剂量']),
            unit: orderImportHeaderIndex(headers, ['单位', '剂量单位']),
            route: orderImportHeaderIndex(headers, ['用法', '给药途径']),
            frequency: orderImportHeaderIndex(headers, ['频次', '频率']),
            department: orderImportHeaderIndex(headers, ['执行科室', '科室']),
            total: orderImportHeaderIndex(headers, ['药品总量', '总量', '数量']),
            billing: orderImportHeaderIndex(headers, ['计费']),
            transferSelfPay: orderImportHeaderIndex(headers, ['转自费'])
        };
        const valueAt = function (tokens, key) {
            return index[key] >= 0 ? tokens[index[key]] || '' : '';
        };

        return lines.slice(headerLineIndex + 1)
            .map(orderImportTableTokens)
            .map(function (tokens) {
                /*
                 * 部分浏览器复制表格时不复制左上角空表头，却会复制
                 * 每行序号。此时主动去掉多出的首个纯数字序号列。
                 */
                if (
                    tokens.length === headers.length + 1 &&
                    /^\d+$/.test(tokens[0] || '')
                ) {
                    return tokens.slice(1);
                }
                return tokens;
            })
            .map(function (tokens) {
                return normalizeOrderImportItem({
                    orderCategory: valueAt(tokens, 'category'),
                    type: valueAt(tokens, 'type'),
                    name: valueAt(tokens, 'name'),
                    groupNo: valueAt(tokens, 'groupNo'),
                    dose: valueAt(tokens, 'dose'),
                    unit: valueAt(tokens, 'unit'),
                    route: valueAt(tokens, 'route'),
                    frequency: valueAt(tokens, 'frequency'),
                    department: valueAt(tokens, 'department'),
                    total: valueAt(tokens, 'total'),
                    billing: valueAt(tokens, 'billing'),
                    transferSelfPay: valueAt(tokens, 'transferSelfPay')
                });
            })
            .filter(function (item) {
                return Boolean(item.name) &&
                    !/暂无数据|没有数据|无数据/.test(item.name);
            });
    }

    function orderImportRouteFromLine(line) {
        const source = String(line || '');
        const named = [
            '静脉滴注', '静脉注射', '肌肉注射', '皮下注射',
            '口服', '外用', '鼻饲', '雾化吸入', '雾化',
            '领药', '自煎', '代煎', '冲服'
        ].find(function (value) {
            return source.includes(value);
        });
        if (named) return named;

        const code = source.match(/(?:^|[\s,，;；])(ivdrip|ivgtt|ivd|iv|im|sc|po|kf|wy|bs|ly|wh)(?=$|[\s,，;；])/i);
        if (!code) return '';
        const map = {
            ivdrip: '静脉滴注',
            ivgtt: '静脉滴注',
            ivd: '静脉滴注',
            iv: '静脉注射',
            im: '肌肉注射',
            sc: '皮下注射',
            po: '口服',
            kf: '口服',
            wy: '外用',
            bs: '鼻饲',
            ly: '领药',
            wh: '雾化'
        };
        return map[code[1].toLowerCase()] || '';
    }

    function parseOrderImportPlainText(source) {
        let currentTab = '';
        const results = [];

        String(source || '').split(/\n+/).forEach(function (rawLine) {
            let line = plain(rawLine)
                .replace(/^[-•●◆◇▪▫]\s*/, '')
                .replace(/^\d+[.、)）]\s*/, '');
            if (!line || /^来源(?:页面)?[：:]/.test(line)) return;

            const sectionMatch = line.match(
                /^(药品录入|药品|药物|西药处方|西药|中草药|中药|草药|出院带药|康复医嘱|康复|文字录入|文字|护理|项目录入|项目|耗材|检验|化验|检查|影像)\s*[：:]?\s*(.*)$/
            );
            if (sectionMatch) {
                currentTab = orderImportTabFromValue(sectionMatch[1], '');
                line = plain(sectionMatch[2]);
                if (!line) return;
            }

            const segments = line.split(/[；;]/).map(plain).filter(Boolean);
            segments.forEach(function (segment) {
                const orderCategoryMatch = segment.match(/^(长|长期|临|临时|st)\s+/i);
                const orderCategory = orderCategoryMatch
                    ? orderCategoryMatch[1]
                    : '';
                let content = orderCategoryMatch
                    ? plain(segment.slice(orderCategoryMatch[0].length))
                    : segment;
                const doseMatch = content.match(
                    /(\d+(?:\.\d+)?)\s*(μg|ug|mcg|mg|g|ml|mL|l|L|iu|IU|u|U|片|粒|支|袋|瓶|丸|枚|贴|喷|滴|吸|次|项|付|盒)(?=\s|$|[+，,、])/i
                );
                const frequencyMatch = content.match(
                    /\b(qd|bid|tid|qid|qn|qod|st|prn|q\d+h|q\d+d)\b/i
                );
                const route = orderImportRouteFromLine(content);
                const routeIndex = route
                    ? content.indexOf(route)
                    : -1;
                const cutIndexes = [
                    doseMatch ? doseMatch.index : -1,
                    frequencyMatch ? frequencyMatch.index : -1,
                    routeIndex
                ].filter(function (value) {
                    return value > 0;
                });
                const firstCut = cutIndexes.length
                    ? Math.min.apply(Math, cutIndexes)
                    : -1;
                let name = plain(
                    firstCut > 0
                        ? content.slice(0, firstCut)
                        : content
                ).replace(/[+，,、]+$/, '').trim();

                if (!name) return;

                const daysMatch = content.match(/(\d+)\s*(?:天|付)(?=\s|$|[，,；;])/);
                const tab = currentTab || orderImportTabFromValue('', name);
                results.push(normalizeOrderImportItem({
                    tab: tab,
                    orderCategory: orderCategory,
                    name: name,
                    searchName: name,
                    dose: doseMatch ? doseMatch[1] : '',
                    unit: doseMatch ? doseMatch[2] : '',
                    route: route,
                    frequency: frequencyMatch ? frequencyMatch[1] : '',
                    days: daysMatch ? daysMatch[1] : ''
                }));
            });
        });

        return results.filter(function (item) {
            return Boolean(item.name);
        });
    }

    function parseOrderImportText(textValue) {
        const rawSource = String(textValue || '');
        const source = rawSource.trim();
        if (!source) return [];

        try {
            const parsed = extractDeepSeekJson(source);
            const list = Array.isArray(parsed)
                ? parsed
                : parsed && parsed.items;
            if (Array.isArray(list)) {
                return list.map(normalizeOrderImportItem)
                    .filter(function (item) {
                        return Boolean(item.name);
                    });
            }
        }
        catch (error) {
            // 非JSON继续按结构化块、表格或普通文本解析。
        }

        const structured = parseOrderImportStructuredBlocks(source);
        if (structured.length) return structured;

        /* 表格原文保留首列空白，避免序号列导致整行字段右移。 */
        const tableItems = parseOrderImportTableText(rawSource);
        if (tableItems.length) return tableItems;

        return parseOrderImportPlainText(source);
    }

    function orderImportSerializableItems(items) {
        return (Array.isArray(items) ? items : []).map(aiItemPayload);
    }

    function setOrderImportStatus(modal, message, type) {
        const box = modal && modal.querySelector('.path-order-import-status');
        if (!box) return;
        box.textContent = String(message || '');
        box.dataset.type = type || 'normal';
    }

    function orderImportPositiveNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0
            ? number
            : '';
    }

    function orderImportValidation(item) {
        const errors = [];
        const warnings = [];
        const addError = function (field, label) {
            if (!errors.some(function (entry) {
                return entry.field === field;
            })) {
                errors.push({ field: field, label: label });
            }
        };

        if (!TAB_NAMES.includes(item.tab)) {
            addError('tab', '医嘱类型');
        }
        if (!plain(item.name)) {
            addError('name', '名称/指示');
        }

        const def = TAB_DEFS[item.tab];
        if (def && def.lookup && !plain(item.searchName)) {
            addError('searchName', '系统检索名称');
        }

        if (item.tab === '药品录入' || item.tab === '出院带药') {
            if (!orderImportPositiveNumber(item.dose)) {
                addError('dose', '剂量');
            }
            if (!plain(item.unit)) {
                addError('unit', '单位');
            }
            if (!plain(item.route)) {
                addError('route', '用法');
            }
            if (!plain(item.frequency)) {
                addError('frequency', '频次');
            }
        }
        else if (item.tab === '中草药') {
            if (!orderImportPositiveNumber(item.dose)) {
                addError('dose', '单味剂量');
            }
            if (!Number.isInteger(Number(item.doseCount)) ||
                Number(item.doseCount) < 1 ||
                Number(item.doseCount) > 60) {
                addError('doseCount', '剂数（1～60）');
            }
            if (!['代煎', '自煎', '外用', '冲服'].includes(
                item.decoctionMode
            )) {
                addError('decoctionMode', '煎煮方式');
            }
        }
        else if (item.tab === '项目录入' || item.tab === '康复医嘱') {
            if (!plain(item.department)) {
                addError('department', '执行科室');
            }
            if (!orderImportPositiveNumber(item.dose)) {
                addError('dose', '每次治疗量');
            }
            if (!plain(item.frequency)) {
                addError('frequency', '频次');
            }
        }
        else if (item.tab === '文字录入') {
            if (!plain(item.frequency)) {
                addError('frequency', '频次');
            }
        }

        if (item.tab === '检验' && !plain(item.secondarySearchName)) {
            warnings.push('检验二级目录留空，将沿用一级检索名称');
        }
        if (state.orderImportOrigin === 'ai') {
            warnings.push('AI解析字段需人工核对');
        }

        return {
            valid: !errors.length,
            errors: errors,
            warnings: warnings
        };
    }

    function makeOrderImportInput(className, value, type) {
        const input = document.createElement('input');
        input.className = className;
        input.type = type || 'text';
        if (type !== 'checkbox') {
            input.value = value === undefined || value === null
                ? ''
                : String(value);
        }
        return input;
    }

    function makeOrderImportSelect(className, values, selectedValue) {
        const select = document.createElement('select');
        select.className = className;
        values.forEach(function (value) {
            select.appendChild(option(value, value));
        });
        if (selectedValue && !values.includes(selectedValue)) {
            select.appendChild(option(selectedValue, selectedValue));
        }
        select.value = selectedValue || values[0] || '';
        return select;
    }

    function appendOrderImportCell(row, child, className) {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.appendChild(child);
        row.appendChild(cell);
        return cell;
    }

    function collectOrderImportPreviewItems(modal) {
        const oldMap = new Map(
            state.orderImportItems.map(function (item) {
                return [item.id, item];
            })
        );
        const rows = Array.from(
            modal.querySelectorAll('.path-order-import-body .path-order-import-row')
        );

        const items = rows.map(function (row) {
            const old = oldMap.get(row.dataset.itemId) || {};
            const name = row.querySelector('.path-order-import-name')
                .value.trim();

            return normalizeOrderImportItem(Object.assign({}, old, {
                id: old.id || row.dataset.itemId || makeId('item'),
                enabled: row.querySelector('.path-order-import-enabled').checked,
                tab: row.querySelector('.path-order-import-tab').value,
                orderType: row.querySelector('.path-order-import-order-type').value,
                name: name,
                searchName:
                    row.querySelector('.path-order-import-search-name')
                        .value.trim() || name,
                secondarySearchName:
                    row.querySelector('.path-order-import-secondary-search')
                        .value.trim(),
                department:
                    row.querySelector('.path-order-import-department')
                        .value.trim(),
                groupNo:
                    row.querySelector('.path-order-import-group-no')
                        .value.trim(),
                dose: orderImportPositiveNumber(
                    row.querySelector('.path-order-import-dose').value
                ),
                unit:
                    row.querySelector('.path-order-import-unit').value.trim(),
                route:
                    row.querySelector('.path-order-import-route').value.trim(),
                frequency:
                    row.querySelector('.path-order-import-frequency')
                        .value.trim(),
                days: orderImportPositiveNumber(
                    row.querySelector('.path-order-import-days').value
                ),
                total: old.total || '',
                quantity: old.quantity || '',
                doseCount: old.doseCount || 7,
                decoctionMode: old.decoctionMode || '自煎',
                instruction:
                    row.querySelector('.path-order-import-instruction')
                        .value.trim(),
                specimen: old.specimen || '',
                bodyPart: old.bodyPart || '',
                status: old.status || ''
            }));
        });

        state.orderImportItems = items;
        return items;
    }

    function orderImportStatusType(textValue) {
        const text = String(textValue || '');
        if (/失败|错误/.test(text)) return 'error';
        if (/已填入|已开立|完成|成功/.test(text)) return 'success';
        if (/正在|等待|暂停|中止/.test(text)) return 'warning';
        return '';
    }

    function refreshOrderImportPreviewValidation(modal) {
        if (!modal) return;

        const rows = Array.from(
            modal.querySelectorAll('.path-order-import-body .path-order-import-row')
        );
        const selectedItems = [];
        let invalidSelectedCount = 0;

        rows.forEach(function (row, index) {
            const item = state.orderImportItems[index];
            if (!item) return;
            const validation = orderImportValidation(item);
            const checked = item.enabled !== false;
            const status = row.querySelector('.path-order-import-row-status');

            row.classList.toggle('invalid', !validation.valid);
            row.classList.toggle(
                'warning',
                validation.valid && Boolean(validation.warnings.length)
            );
            row.dataset.origin = state.orderImportOrigin || '';

            row.querySelectorAll('[data-import-field]').forEach(function (control) {
                control.classList.toggle(
                    'invalid',
                    validation.errors.some(function (entry) {
                        return entry.field === control.dataset.importField;
                    })
                );
            });
            const advancedButton = row.querySelector(
                '.path-order-import-advanced'
            );
            if (advancedButton) {
                advancedButton.classList.toggle(
                    'invalid',
                    validation.errors.some(function (entry) {
                        return [
                            'doseCount',
                            'decoctionMode'
                        ].includes(entry.field);
                    })
                );
            }

            if (checked) {
                selectedItems.push(item);
                if (!validation.valid) invalidSelectedCount += 1;
            }

            if (status) {
                if (item.status) {
                    status.textContent = item.status;
                    status.dataset.type = orderImportStatusType(item.status);
                }
                else if (!validation.valid) {
                    status.textContent = '缺失：' + validation.errors
                        .map(function (entry) { return entry.label; })
                        .join('、');
                    status.dataset.type = 'error';
                }
                else if (validation.warnings.length) {
                    status.textContent = validation.warnings.join('；');
                    status.dataset.type = 'warning';
                }
                else {
                    status.textContent = '字段完整，可执行';
                    status.dataset.type = 'success';
                }
            }
        });

        const countMap = {};
        state.orderImportItems.forEach(function (item) {
            countMap[item.tab] = (countMap[item.tab] || 0) + 1;
        });
        const typeSummary = Object.keys(countMap).map(function (key) {
            return key + countMap[key] + '条';
        }).join('、');
        const summary = modal.querySelector('.path-order-import-summary');
        if (summary) {
            summary.textContent = state.orderImportItems.length
                ? '来源：' + (state.orderImportSourceLabel || '手动文本') +
                    '；共' + state.orderImportItems.length + '条，已勾选' +
                    selectedItems.length + '条' +
                    (invalidSelectedCount
                        ? '，其中' + invalidSelectedCount + '条未通过校验'
                        : '，已勾选项均通过必填校验') +
                    (typeSummary ? '（' + typeSummary + '）' : '')
                : '尚无解析结果。';
            summary.dataset.type = invalidSelectedCount
                ? 'error'
                : (selectedItems.length ? 'success' : 'normal');
        }

        const busy = state.running || state.bulkDeletingOrders || state.aiBusy;
        const acknowledgement = modal.querySelector(
            '.path-order-import-risk-ack'
        );
        const appendButton = modal.querySelector('.path-order-import-append');
        const executeButton = modal.querySelector('.path-order-import-execute');

        if (appendButton) {
            appendButton.disabled = busy || !selectedItems.length;
        }
        if (executeButton) {
            const acknowledged = Boolean(
                acknowledgement && acknowledgement.checked
            );
            executeButton.disabled = busy ||
                !selectedItems.length ||
                Boolean(invalidSelectedCount) ||
                !acknowledged;
            executeButton.title = invalidSelectedCount
                ? '请先修正红色必填项'
                : (!acknowledged
                    ? '请先勾选人工核对确认项'
                    : '按当前表格顺序跨类型批量开立已勾选医嘱');
        }
    }

    function renderOrderImportPreview(
        modal,
        items,
        sourceLabel,
        origin,
        preserveAcknowledgement
    ) {
        const normalizedItems = (Array.isArray(items) ? items : [])
            .map(normalizeOrderImportItem)
            .slice(0, 500);

        state.orderImportItems = normalizedItems;
        state.orderImportSourceLabel = sourceLabel || '';
        state.orderImportOrigin = origin || '';

        const body = modal.querySelector('.path-order-import-body');
        const acknowledgement = modal.querySelector(
            '.path-order-import-risk-ack'
        );
        if (acknowledgement && !preserveAcknowledgement) {
            acknowledgement.checked = false;
        }

        if (body) {
            body.innerHTML = '';

            normalizedItems.forEach(function (item, index) {
                const row = document.createElement('tr');
                row.className = 'path-order-import-row path-gui-row';
                row.dataset.index = String(index);
                row.dataset.itemId = item.id;
                row.dataset.origin = state.orderImportOrigin || '';
                if (state.orderImportSelectedId === item.id) {
                    row.classList.add('selected');
                }

                const enabled = makeOrderImportInput(
                    'path-order-import-enabled',
                    '',
                    'checkbox'
                );
                enabled.checked = item.enabled !== false;
                appendOrderImportCell(row, enabled);

                const order = document.createElement('span');
                order.textContent = String(index + 1);
                appendOrderImportCell(row, order);

                const tab = makeOrderImportSelect(
                    'path-order-import-tab path-gui-tab',
                    TAB_NAMES,
                    item.tab
                );
                tab.dataset.importField = 'tab';
                appendOrderImportCell(row, tab);

                appendOrderImportCell(
                    row,
                    makeOrderImportSelect(
                        'path-order-import-order-type path-gui-order-type',
                        ['长', '临'],
                        item.orderType
                    )
                );

                const name = makeOrderImportInput(
                    'path-order-import-name path-gui-name',
                    item.name
                );
                name.dataset.importField = 'name';
                appendOrderImportCell(row, name);

                const searchName = makeOrderImportInput(
                    'path-order-import-search-name path-gui-search-name',
                    item.searchName
                );
                searchName.dataset.importField = 'searchName';
                appendOrderImportCell(row, searchName);

                appendOrderImportCell(
                    row,
                    makeOrderImportInput(
                        'path-order-import-secondary-search path-gui-secondary-search-name',
                        item.secondarySearchName
                    ),
                    'path-order-import-secondary-column'
                );

                const department = makeOrderImportInput(
                    'path-order-import-department path-gui-department',
                    item.department
                );
                department.dataset.importField = 'department';
                appendOrderImportCell(row, department);

                appendOrderImportCell(
                    row,
                    makeOrderImportInput(
                        'path-order-import-group-no path-gui-group-no',
                        item.groupNo
                    )
                );

                const dose = makeOrderImportInput(
                    'path-order-import-dose path-gui-dose',
                    item.dose,
                    'number'
                );
                dose.step = '0.001';
                dose.dataset.importField = 'dose';
                appendOrderImportCell(row, dose);

                const unit = makeOrderImportInput(
                    'path-order-import-unit path-gui-unit',
                    item.unit
                );
                unit.dataset.importField = 'unit';
                appendOrderImportCell(row, unit);

                const route = makeOrderImportInput(
                    'path-order-import-route path-gui-route',
                    item.route
                );
                route.dataset.importField = 'route';
                appendOrderImportCell(row, route);

                const frequency = makeOrderImportInput(
                    'path-order-import-frequency path-gui-frequency',
                    item.frequency
                );
                frequency.dataset.importField = 'frequency';
                appendOrderImportCell(row, frequency);

                const days = makeOrderImportInput(
                    'path-order-import-days path-gui-days',
                    item.days,
                    'number'
                );
                days.step = '1';
                appendOrderImportCell(row, days);

                const instruction = document.createElement('textarea');
                instruction.className = 'path-order-import-instruction';
                instruction.value = item.instruction || '';
                appendOrderImportCell(row, instruction);

                const advanced = document.createElement('button');
                advanced.type = 'button';
                advanced.className = 'path-order-import-advanced secondary';
                advanced.textContent = '高级';
                advanced.title = '编辑数量、总量、中药剂数/煎煮、标本、部位、自付、计费及自定义字段';
                appendOrderImportCell(row, advanced);

                const copyButton = document.createElement('button');
                copyButton.type = 'button';
                copyButton.className = 'path-order-import-copy secondary';
                copyButton.textContent = '复制';
                appendOrderImportCell(row, copyButton);

                const moveBox = document.createElement('div');
                moveBox.className = 'path-order-import-move-box';
                const up = document.createElement('button');
                up.type = 'button';
                up.className = 'path-order-import-up secondary';
                up.textContent = '↑';
                const down = document.createElement('button');
                down.type = 'button';
                down.className = 'path-order-import-down secondary';
                down.textContent = '↓';
                moveBox.appendChild(up);
                moveBox.appendChild(down);
                appendOrderImportCell(row, moveBox);

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'path-order-import-delete danger';
                remove.textContent = '删除';
                appendOrderImportCell(row, remove);

                const status = document.createElement('span');
                status.className = 'path-order-import-row-status';
                appendOrderImportCell(
                    row,
                    status,
                    'path-order-import-status-cell'
                );

                body.appendChild(row);
                configurePathSharedSuggestionRow(row);
            });

            if (!normalizedItems.length) {
                body.innerHTML = '<tr><td colspan="20" class="path-order-import-empty">尚无住院医嘱草稿，可读取当前页、粘贴解析或新增空白行。</td></tr>';
            }
        }

        syncOrderImportJsonEditor(modal);
        setOrderImportSelectedRow(modal, state.orderImportSelectedId);
        refreshOrderImportPreviewValidation(modal);
    }

    function readCurrentPageOrdersIntoImport(modal) {
        const detected = detectCurrentPageOrders();
        const items = (detected.items || []).filter(function (item) {
            return Boolean(importedOrderText(item.name));
        });
        const sourceBox = modal.querySelector('.path-order-import-source');

        if (!items.length) {
            setOrderImportStatus(
                modal,
                '当前页未识别到医嘱。可点击“手动录入/修改”后粘贴医嘱，再使用本地或AI解析。',
                'warning'
            );
            return false;
        }

        if (
            state.orderImportItems.length &&
            !window.confirm(
                '读取当前页将替换住院医嘱开立窗口中的现有草稿，确认继续吗？'
            )
        ) {
            setOrderImportStatus(
                modal,
                '已保留现有住院医嘱开立草稿。',
                'warning'
            );
            return false;
        }

        state.orderImportSourceLabel =
            detected.source || '当前页医嘱';
        const sourcePatient = localOrderDeleteCurrentPatientIdentity();
        state.orderImportSourcePatientLabel = sourcePatient
            ? sourcePatient.label
            : '';
        state.orderImportSource = JSON.stringify({
            source: state.orderImportSourceLabel,
            patient: state.orderImportSourcePatientLabel,
            items: orderImportSerializableItems(items)
        }, null, 2);
        const incompleteCount = items.filter(function (item) {
            return (
                item.tab === '药品录入' &&
                (!item.dose || !item.route || !item.frequency)
            );
        }).length;
        if (sourceBox) sourceBox.value = state.orderImportSource;
        renderOrderImportPreview(
            modal,
            items,
            state.orderImportSourceLabel,
            'page'
        );
        setOrderImportStatus(
            modal,
            '已读取' + state.orderImportSourceLabel + '：' +
                items.length + '条。' +
                (
                    incompleteCount
                        ? '其中' + incompleteCount + '条药品在该页面未显示完整剂量/用法/频次，请手动补充或结合原始医嘱核对后再加入。'
                        : '结果已进入可编辑表格，可继续核对、加入组套或直接执行已勾选。'
                ),
            incompleteCount ? 'warning' : 'success'
        );
        return true;
    }

    function closeOrderImportLayer(modal) {
        const layer = modal && modal.querySelector('.path-order-import-layer');
        if (!layer || state.orderImportAiBusy) return;

        closeOrderImportAdvancedEditor(modal);
        closeInpatientOrderTemplateManager(modal);
        layer.classList.remove('show');

        /*
         * v1.48.25：住院医嘱自动执行与窗口显示状态彻底解耦。
         * 关闭这里只移除二级窗口的show类，不修改state.running、
         * state.paused、state.abortRequested，也不销毁modal DOM。
         * 因此执行中的异步流程仍可继续使用原modal引用更新逐行状态，
         * 行为与药品AI等脚本“隐藏窗口但任务继续”保持一致。
         */
        if (state.running) {
            showStatus(
                '住院医嘱开立窗口已关闭，当前自动执行任务继续进行。\n' +
                '关闭窗口不会暂停或中止医嘱开立；如需停止，请使用主界面的“中止”功能。',
                'normal'
            );
        }
    }

    function openOrderImportLayer(modal) {
        if (state.running || state.bulkDeletingOrders) {
            showStatus('当前已有任务正在执行。', 'warning');
            return;
        }
        const layer = modal.querySelector('.path-order-import-layer');
        const sourceBox = modal.querySelector('.path-order-import-source');
        if (!layer || !sourceBox) return;
        layer.classList.add('show');
        syncOrderImportOptionsFromMain(modal);

        if (state.orderImportItems.length) {
            sourceBox.value = state.orderImportSource || sourceBox.value || '';
            renderOrderImportPreview(
                modal,
                state.orderImportItems,
                state.orderImportSourceLabel,
                state.orderImportOrigin,
                true
            );
            const currentPatient = localOrderDeleteCurrentPatientIdentity();
            const differentPatient = Boolean(
                currentPatient &&
                state.orderImportSourcePatientLabel &&
                currentPatient.label !== state.orderImportSourcePatientLabel
            );
            setOrderImportStatus(
                modal,
                differentPatient
                    ? '已恢复上次住院医嘱草稿；来源患者与当前页面患者不同。执行前必须重新核对患者，或点击“读取当前页医嘱”覆盖草稿。'
                    : '已恢复当前住院医嘱开立草稿，可继续编辑、解析或执行。',
                differentPatient ? 'warning' : 'normal'
            );
        }
        else if (!readCurrentPageOrdersIntoImport(modal)) {
            sourceBox.value = '';
            renderOrderImportPreview(modal, [], '', '');
        }

        setOrderImportSecondaryVisible(
            modal,
            Boolean(GM_getValue(
                KEYS.inpatientOrderSecondaryDirectoryVisible,
                true
            )),
            false
        );
        setOrderImportEditorMode(
            modal,
            GM_getValue(KEYS.inpatientOrderEditorMode, 'gui'),
            false
        );
    }

    function parseOrderImportSourceLocally(modal) {
        const sourceBox = modal.querySelector('.path-order-import-source');
        const source = String(sourceBox && sourceBox.value || '').trim();
        if (!source) {
            setOrderImportStatus(modal, '请先粘贴或录入医嘱文本。', 'warning');
            return;
        }
        const sourceChanged = source !== state.orderImportSource;
        const items = parseOrderImportText(source);
        state.orderImportSource = source;
        if (sourceChanged) {
            state.orderImportSourcePatientLabel = '';
        }
        state.orderImportSourceLabel = '手动录入/修改文本（本地解析）';
        renderOrderImportPreview(
            modal,
            items,
            state.orderImportSourceLabel,
            'local'
        );
        setOrderImportStatus(
            modal,
            items.length
                ? '已本地解析' + items.length + '条医嘱，请核对名称、标签页、剂量、用法和频次。'
                : '未从粘贴文本中解析到有效医嘱，可调整为一行一条或改用AI解析。',
            items.length ? 'success' : 'warning'
        );
    }

    async function parseOrderImportSourceWithAi(modal) {
        if (state.aiBusy || state.orderImportAiBusy) {
            setOrderImportStatus(modal, '当前已有AI任务正在执行。', 'warning');
            return;
        }
        const sourceBox = modal.querySelector('.path-order-import-source');
        const source = String(sourceBox && sourceBox.value || '').trim();
        const sourceChanged = source !== state.orderImportSource;
        const apiKey = String(
            modal.querySelector('.path-ai-key').value ||
            GM_getValue(KEYS.deepSeekApiKey, '') ||
            ''
        ).trim();
        const model = String(
            modal.querySelector('.path-ai-model').value ||
            GM_getValue(KEYS.deepSeekModel, DEFAULT_DEEPSEEK_MODEL) ||
            DEFAULT_DEEPSEEK_MODEL
        ).trim();

        if (!source) {
            setOrderImportStatus(modal, '请先读取当前页或粘贴医嘱文本。', 'warning');
            return;
        }
        if (!suiteGlobalAiHasApiKey(apiKey)) {
            setOrderImportStatus(
                modal,
                '请先在下方DeepSeek功能区填写API Key。',
                'warning'
            );
            return;
        }

        const button = modal.querySelector('.path-order-import-ai-parse');
        state.orderImportAiBusy = true;
        state.aiBusy = true;
        state.aiTaskType = 'order-import';
        if (button) button.textContent = '正在AI解析……';
        updateRunButtons(modal);
        setOrderImportStatus(modal, '正在调用DeepSeek结构化住院医嘱……', 'normal');

        try {
            const systemPrompt = [
                '你是中国医院住院HIS医嘱结构化助手。',
                '只能整理用户提供的现有医嘱，不得自行增加药物、检验、检查、治疗、护理或诊疗建议。',
                '输出JSON对象，根节点格式必须为：{"items":[...]}。',
                '每个item可使用字段：enabled、tab、orderType、name、searchName、secondarySearchName、department、groupNo、dose、unit、route、frequency、days、quantity、total、doseCount、decoctionMode、instruction、specimen、bodyPart、dischargeFlag、transferSelfPay、billing。',
                'tab只能是：' + TAB_NAMES.join('、') + '。',
                'orderType只能是“长”或“临”。检验、检查通常按用户原文决定；原文未给出时不得虚构。',
                '每种药品、每个检验、检查、治疗或文字医嘱分别输出一条；同一组静脉液体可使用相同groupNo。',
                '检验的secondarySearchName填写具体项目；不确定的检索名称、科室、剂量、用法、频次等字段使用空字符串。',
                '已出区页面中的开始时间、停止时间、执行者和最后执行时间只是历史信息，不要转写成新医嘱的嘱托。'
            ].join('\n');
            const parsed = await deepSeekJsonRequest(
                apiKey,
                model,
                systemPrompt,
                { source: source.slice(0, 80000) },
                7000
            );
            const list = Array.isArray(parsed)
                ? parsed
                : parsed && parsed.items;
            const items = (Array.isArray(list) ? list : [])
                .map(normalizeOrderImportItem)
                .filter(function (item) {
                    return Boolean(item.name);
                });

            state.orderImportSource = source;
            if (sourceChanged) {
                state.orderImportSourcePatientLabel = '';
            }
            state.orderImportSourceLabel = '手动/当前页文本（AI解析）';
            renderOrderImportPreview(
                modal,
                items,
                state.orderImportSourceLabel,
                'ai'
            );
            setOrderImportStatus(
                modal,
                items.length
                    ? 'AI已解析' + items.length + '条住院医嘱，请在住院录入表格中逐条核对；通过校验后可加入组套或执行已勾选。'
                    : 'AI结果中没有可识别的医嘱条目。',
                items.length ? 'success' : 'warning'
            );
        }
        catch (error) {
            setOrderImportStatus(
                modal,
                'AI解析失败：' + error.message,
                'error'
            );
        }
        finally {
            state.orderImportAiBusy = false;
            state.aiBusy = false;
            state.aiTaskType = '';
            if (button) button.textContent = 'AI解析医嘱';
            updateRunButtons(modal);
        }
    }

    function selectedOrderImportItems(modal) {
        const card = modal.querySelector('.path-order-import-card');
        if (
            card &&
            card.dataset.editorMode === 'json' &&
            !applyOrderImportJsonEditor(modal, true)
        ) {
            return [];
        }
        return collectOrderImportPreviewItems(modal).filter(function (item) {
            return item.enabled !== false;
        });
    }

    function prepareOrderImportApplicationPopups(context) {
        if (!context || !context.hasApplicationOrders) {
            return true;
        }

        const applicationItems = context.entries.filter(function (entry) {
            if (entry.item.tab === '检查') {
                return !context.suppressCheckApplicationPopup;
            }
            if (entry.item.tab === '检验') {
                return !context.suppressLabApplicationPopup;
            }
            return false;
        }).map(function (entry) {
            return entry.item;
        });

        return applicationItems.length
            ? prepareCheckPopupPool(applicationItems)
            : true;
    }

    async function executeSelectedOrderImportItems(modal) {
        if (state.running || state.bulkDeletingOrders || state.aiBusy) {
            setOrderImportStatus(
                modal,
                '当前已有任务正在执行，请等待完成或先中止。',
                'warning'
            );
            return;
        }

        const items = selectedOrderImportItems(modal);
        if (!items.length) {
            setOrderImportStatus(
                modal,
                '请至少勾选一条需要执行的解析结果。',
                'warning'
            );
            return;
        }

        const invalid = items.map(function (item, index) {
            return {
                item: item,
                index: index,
                validation: orderImportValidation(item)
            };
        }).filter(function (entry) {
            return !entry.validation.valid;
        });

        if (invalid.length) {
            const first = invalid[0];
            const row = modal.querySelector(
                '.path-order-import-row[data-item-id="' +
                CSS.escape(first.item.id) + '"]'
            );
            const firstField = first.validation.errors[0] &&
                first.validation.errors[0].field;
            const control = row && firstField
                ? row.querySelector(
                    '[data-import-field="' +
                    CSS.escape(firstField) + '"]'
                ) || row.querySelector('.path-order-import-advanced')
                : null;

            if (row) {
                row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            if (control) control.focus();

            setOrderImportStatus(
                modal,
                '有' + invalid.length +
                    '条已勾选医嘱未通过必填校验，已定位第一处红色字段。\n' +
                    invalid.slice(0, 8).map(function (entry) {
                        return entry.item.name + '：' +
                            entry.validation.errors.map(function (error) {
                                return error.label;
                            }).join('、');
                    }).join('\n'),
                'error'
            );
            refreshOrderImportPreviewValidation(modal);
            return;
        }

        const acknowledgement = modal.querySelector(
            '.path-order-import-risk-ack'
        );
        if (!acknowledgement || !acknowledgement.checked) {
            setOrderImportStatus(
                modal,
                '请先勾选“已核对当前患者及已勾选医嘱”确认项。',
                'warning'
            );
            return;
        }

        const targetPatient = localOrderDeleteCurrentPatientIdentity();
        if (!targetPatient) {
            setOrderImportStatus(
                modal,
                '未识别当前执行患者的住院号。请先进入目标患者的医嘱录入/查询界面，确认页面已显示患者信息后再执行。',
                'error'
            );
            return;
        }

        items.forEach(function (item) {
            item.status = '';
        });
        refreshOrderImportPreviewValidation(modal);

        let executionResult = null;
        finishCheckPopupPool(true);
        try {
            executionResult = await runPathway(
                modal,
                {
                    afterConfirm: prepareOrderImportApplicationPopups
                },
                {
                    items: items,
                    executionName: '住院医嘱开立',
                    groupName: '本次已勾选住院医嘱草稿',
                    sourcePatientLabel:
                        state.orderImportSourcePatientLabel || '未记录',
                    targetPatientLabel: targetPatient.label
                }
            );
        }
        finally {
            finishCheckPopupPool(true);
            const acknowledgementAfterRun = modal.querySelector(
                '.path-order-import-risk-ack'
            );
            if (acknowledgementAfterRun) {
                acknowledgementAfterRun.checked = false;
            }
            refreshOrderImportPreviewValidation(modal);
        }

        const failed = items.filter(function (item) {
            return /失败/.test(item.status || '');
        });
        const completed = items.filter(function (item) {
            return /已填入|已开立/.test(item.status || '');
        });
        const untouched = items.filter(function (item) {
            return !plain(item.status);
        });

        setOrderImportStatus(
            modal,
            executionResult && executionResult.failures.length
                ? '直接执行结束：完成' + completed.length +
                    '条；执行或保存阶段共有' +
                    executionResult.failures.length +
                    '项失败。已填写内容仍保留，请结合主状态栏及逐行状态人工核对。'
                : (failed.length
                ? '直接执行结束：完成' + completed.length +
                    '条，失败' + failed.length +
                    '条。已填写内容仍保留，请按行状态人工核对。'
                : (completed.length
                    ? '直接执行结束：已处理' + completed.length +
                        '条。请继续核对各标签页和保存状态。'
                    : (untouched.length
                        ? '本次未开始执行或已在确认阶段取消。'
                        : '直接执行流程已结束。'))),
            executionResult && executionResult.failures.length
                ? 'error'
                : (failed.length
                    ? 'error'
                    : (completed.length ? 'success' : 'warning'))
        );
    }

    async function appendOrderImportPreviewToGroup(modal) {
        const items = selectedOrderImportItems(modal);
        if (!items.length) {
            setOrderImportStatus(modal, '请至少勾选一条解析结果。', 'warning');
            return;
        }
        const result = await appendCurrentPageOrdersToGroup(
            modal,
            items,
            state.orderImportSourceLabel || '住院医嘱解析结果'
        );
        if (result && result.added) {
            closeOrderImportLayer(modal);
            const groupSection = modal.querySelector(
                '.path-section[data-section-key="group-editor"]'
            );
            if (groupSection && groupSection.classList.contains('collapsed')) {
                applySectionCollapsed(groupSection, false, true);
            }
        }
    }

    function bindOrderImportLayer(modal) {
        const layer = modal.querySelector('.path-order-import-layer');
        if (!layer) return;

        modal.querySelector('.path-order-import-close').addEventListener(
            'click',
            function () { closeOrderImportLayer(modal); }
        );
        modal.querySelector('.path-order-import-cancel').addEventListener(
            'click',
            function () { closeOrderImportLayer(modal); }
        );
        layer.addEventListener('click', function (event) {
            if (event.target === layer) closeOrderImportLayer(modal);
        });
        modal.querySelector('.path-order-import-read').addEventListener(
            'click',
            function () { readCurrentPageOrdersIntoImport(modal); }
        );
        modal.querySelector('.path-order-import-manual').addEventListener(
            'click',
            function () {
                const box = modal.querySelector('.path-order-import-source');
                if (!box) return;
                box.focus();
                box.setSelectionRange(box.value.length, box.value.length);
                setOrderImportStatus(
                    modal,
                    '已进入手动录入/修改状态。修改后请点击“解析粘贴文本”或“AI解析医嘱”。',
                    'normal'
                );
            }
        );
        modal.querySelector('.path-order-import-local-parse').addEventListener(
            'click',
            function () { parseOrderImportSourceLocally(modal); }
        );
        modal.querySelector('.path-order-import-ai-parse').addEventListener(
            'click',
            function () { parseOrderImportSourceWithAi(modal); }
        );
        modal.querySelector('.path-order-import-add').addEventListener(
            'click',
            function () { insertBlankOrderImportItem(modal, false); }
        );
        modal.querySelector('.path-order-import-insert-after').addEventListener(
            'click',
            function () { insertBlankOrderImportItem(modal, true); }
        );
        modal.querySelector('.path-order-import-pause').addEventListener(
            'click',
            function () {
                if (!state.running) return;
                state.paused = !state.paused;
                updateRunButtons(modal);
                setOrderImportStatus(
                    modal,
                    state.paused ? '住院医嘱开立任务已暂停。' : '住院医嘱开立任务已继续。',
                    state.paused ? 'warning' : 'normal'
                );
            }
        );
        modal.querySelector('.path-order-import-stop').addEventListener(
            'click',
            function () {
                if (!state.running && !state.bulkDeletingOrders) return;
                state.abortRequested = true;
                state.paused = false;
                updateRunButtons(modal);
                setOrderImportStatus(modal, '已请求中止住院医嘱开立任务。', 'warning');
            }
        );
        modal.querySelector('.path-order-import-clear').addEventListener(
            'click',
            function () {
                if (state.orderImportAiBusy) return;
                if (
                    state.orderImportItems.length &&
                    !window.confirm('确认清空当前住院医嘱开立草稿吗？')
                ) return;
                state.orderImportSource = '';
                state.orderImportSourceLabel = '';
                state.orderImportSourcePatientLabel = '';
                state.orderImportOrigin = '';
                state.orderImportItems = [];
                state.orderImportSelectedId = '';
                modal.querySelector('.path-order-import-source').value = '';
                renderOrderImportPreview(modal, [], '', '');
                setOrderImportStatus(modal, '住院医嘱来源文本与草稿已清空。', 'normal');
            }
        );
        modal.querySelector('.path-order-import-template-manage').addEventListener(
            'click',
            function () { openInpatientOrderTemplateManager(modal); }
        );
        modal.querySelector('.path-order-import-template-save').addEventListener(
            'click',
            function () { saveCurrentInpatientOrdersAsTemplate(modal); }
        );
        ORDER_IMPORT_OPTION_PAIRS.forEach(function (pair) {
            const control = modal.querySelector(pair[0]);
            if (!control) return;
            control.addEventListener('change', function () {
                syncMainOptionFromOrderImport(modal, control);
            });
        });
        modal.querySelector('.path-order-import-select-all').addEventListener(
            'click',
            function () {
                const card = modal.querySelector('.path-order-import-card');
                if (
                    card.dataset.editorMode === 'json' &&
                    !applyOrderImportJsonEditor(modal, true)
                ) return;
                modal.querySelectorAll('.path-order-import-enabled')
                    .forEach(function (input) { input.checked = true; });
                const acknowledgement = modal.querySelector(
                    '.path-order-import-risk-ack'
                );
                if (acknowledgement) acknowledgement.checked = false;
                collectOrderImportPreviewItems(modal);
                syncOrderImportJsonEditor(modal, true);
                refreshOrderImportPreviewValidation(modal);
            }
        );
        modal.querySelector('.path-order-import-select-none').addEventListener(
            'click',
            function () {
                const card = modal.querySelector('.path-order-import-card');
                if (
                    card.dataset.editorMode === 'json' &&
                    !applyOrderImportJsonEditor(modal, true)
                ) return;
                modal.querySelectorAll('.path-order-import-enabled')
                    .forEach(function (input) { input.checked = false; });
                const acknowledgement = modal.querySelector(
                    '.path-order-import-risk-ack'
                );
                if (acknowledgement) acknowledgement.checked = false;
                collectOrderImportPreviewItems(modal);
                syncOrderImportJsonEditor(modal, true);
                refreshOrderImportPreviewValidation(modal);
            }
        );
        modal.querySelector('.path-order-import-delete-enabled').addEventListener(
            'click',
            function () { deleteEnabledOrderImportItems(modal); }
        );
        modal.querySelector('.path-order-import-mode-gui').addEventListener(
            'click',
            function () { setOrderImportEditorMode(modal, 'gui'); }
        );
        modal.querySelector('.path-order-import-mode-json').addEventListener(
            'click',
            function () { setOrderImportEditorMode(modal, 'json'); }
        );
        modal.querySelector('.path-order-import-toggle-secondary').addEventListener(
            'click',
            function () {
                const card = modal.querySelector('.path-order-import-card');
                setOrderImportSecondaryVisible(
                    modal,
                    !card.classList.contains('path-order-import-secondary-visible')
                );
            }
        );
        modal.querySelector('.path-order-import-json-apply').addEventListener(
            'click',
            function () { applyOrderImportJsonEditor(modal, true); }
        );
        modal.querySelector('.path-order-import-json-format').addEventListener(
            'click',
            function () {
                const editor = modal.querySelector('.path-order-import-json-editor');
                try {
                    editor.value = JSON.stringify(JSON.parse(editor.value || '{}'), null, 2);
                    const status = modal.querySelector('.path-order-import-json-status');
                    status.textContent = 'JSON格式化完成；点击“应用JSON到草稿”后生效。';
                    status.dataset.type = 'success';
                }
                catch (error) {
                    const status = modal.querySelector('.path-order-import-json-status');
                    status.textContent = 'JSON错误：' + error.message;
                    status.dataset.type = 'error';
                }
            }
        );
        modal.querySelector('.path-order-import-json-editor').addEventListener(
            'input',
            function () {
                const status = modal.querySelector('.path-order-import-json-status');
                status.textContent = 'JSON有未应用修改。';
                status.dataset.type = 'warning';
                const acknowledgement = modal.querySelector('.path-order-import-risk-ack');
                if (acknowledgement) acknowledgement.checked = false;
            }
        );
        modal.querySelector('.path-order-import-body').addEventListener(
            'input',
            function (event) {
                if (state.running || state.aiBusy) return;
                const row = event.target.closest('.path-order-import-row');
                if (row) {
                    const index = Number(row.dataset.index);
                    if (state.orderImportItems[index]) {
                        state.orderImportItems[index].status = '';
                    }
                }
                const acknowledgement = modal.querySelector(
                    '.path-order-import-risk-ack'
                );
                if (acknowledgement) acknowledgement.checked = false;

                clearTimeout(modal.pathOrderImportSyncTimer);
                modal.pathOrderImportSyncTimer = setTimeout(function () {
                    collectOrderImportPreviewItems(modal);
                    refreshOrderImportPreviewValidation(modal);
                }, 120);
            }
        );
        modal.querySelector('.path-order-import-body').addEventListener(
            'change',
            function (event) {
                if (state.running || state.aiBusy) return;
                clearTimeout(modal.pathOrderImportSyncTimer);

                const row = event.target.closest('.path-order-import-row');
                const suggestionInput = event.target.closest(
                    '.path-gui-name,.path-gui-search-name'
                );
                if (suggestionInput && pathSharedSuggestionExactOption(
                    suggestionInput
                )) {
                    applyPathSharedSuggestionToRow(suggestionInput);
                }
                if (row && event.target.classList.contains(
                    'path-order-import-tab'
                )) {
                    configurePathSharedSuggestionRow(row);
                    if (event.target.value === '中草药') {
                        const groupNo = row.querySelector(
                            '.path-order-import-group-no'
                        );
                        const unit = row.querySelector(
                            '.path-order-import-unit'
                        );
                        if (groupNo && !groupNo.value.trim()) {
                            groupNo.value = '1';
                        }
                        if (unit && !unit.value.trim()) {
                            unit.value = '克';
                        }
                    }
                }
                if (row) {
                    const index = Number(row.dataset.index);
                    if (state.orderImportItems[index]) {
                        state.orderImportItems[index].status = '';
                    }
                }

                const acknowledgement = modal.querySelector(
                    '.path-order-import-risk-ack'
                );
                if (acknowledgement) acknowledgement.checked = false;
                collectOrderImportPreviewItems(modal);
                refreshOrderImportPreviewValidation(modal);
            }
        );
        modal.querySelector('.path-order-import-body').addEventListener(
            'click',
            function (event) {
                const row = event.target.closest('.path-order-import-row');
                if (!row) return;
                const itemId = row.dataset.itemId;
                setOrderImportSelectedRow(modal, itemId);
                const action = event.target.closest([
                    '.path-order-import-advanced',
                    '.path-order-import-copy',
                    '.path-order-import-up',
                    '.path-order-import-down',
                    '.path-order-import-delete'
                ].join(','));
                if (!action || state.running || state.aiBusy) return;
                collectOrderImportPreviewItems(modal);
                const index = state.orderImportItems.findIndex(function (item) {
                    return item.id === itemId;
                });
                if (index < 0) return;
                if (action.classList.contains('path-order-import-advanced')) {
                    openOrderImportAdvancedEditor(modal, itemId);
                    return;
                }
                if (action.classList.contains('path-order-import-copy')) {
                    const copied = normalizeOrderImportItem(Object.assign(
                        {},
                        clone(state.orderImportItems[index]),
                        { id: makeId('item'), status: '' }
                    ));
                    state.orderImportItems.splice(index + 1, 0, copied);
                    state.orderImportSelectedId = copied.id;
                }
                else if (action.classList.contains('path-order-import-up')) {
                    if (index <= 0) return;
                    const item = state.orderImportItems.splice(index, 1)[0];
                    state.orderImportItems.splice(index - 1, 0, item);
                }
                else if (action.classList.contains('path-order-import-down')) {
                    if (index >= state.orderImportItems.length - 1) return;
                    const item = state.orderImportItems.splice(index, 1)[0];
                    state.orderImportItems.splice(index + 1, 0, item);
                }
                else if (action.classList.contains('path-order-import-delete')) {
                    if (!window.confirm('确认从住院医嘱开立草稿中删除该条目吗？')) return;
                    state.orderImportItems.splice(index, 1);
                    state.orderImportSelectedId = '';
                }
                const acknowledgement = modal.querySelector('.path-order-import-risk-ack');
                if (acknowledgement) acknowledgement.checked = false;
                renderOrderImportPreview(
                    modal,
                    state.orderImportItems,
                    state.orderImportSourceLabel,
                    state.orderImportOrigin,
                    true
                );
            }
        );
        modal.querySelector('.path-order-import-risk-ack').addEventListener(
            'change',
            function () {
                collectOrderImportPreviewItems(modal);
                refreshOrderImportPreviewValidation(modal);
            }
        );
        modal.querySelector('.path-order-import-append').addEventListener(
            'click',
            function () { appendOrderImportPreviewToGroup(modal); }
        );
        modal.querySelector('.path-order-import-execute').addEventListener(
            'click',
            function () { executeSelectedOrderImportItems(modal); }
        );

        const advancedLayer = modal.querySelector('.path-order-import-advanced-layer');
        modal.querySelector('.path-order-import-advanced-close').addEventListener(
            'click',
            function () { closeOrderImportAdvancedEditor(modal); }
        );
        modal.querySelector('.path-order-import-advanced-cancel').addEventListener(
            'click',
            function () { closeOrderImportAdvancedEditor(modal); }
        );
        modal.querySelector('.path-order-import-advanced-save').addEventListener(
            'click',
            function () { saveOrderImportAdvancedEditor(modal); }
        );
        advancedLayer.addEventListener('click', function (event) {
            if (event.target === advancedLayer) closeOrderImportAdvancedEditor(modal);
        });

        const templateLayer = modal.querySelector('.path-order-import-template-layer');
        modal.querySelector('.path-order-import-template-close').addEventListener(
            'click',
            function () { closeInpatientOrderTemplateManager(modal); }
        );
        templateLayer.addEventListener('click', function (event) {
            if (event.target === templateLayer) {
                closeInpatientOrderTemplateManager(modal);
                return;
            }
            const row = event.target.closest('.path-order-import-template-row');
            if (!row) return;
            const templates = loadInpatientOrderTemplates();
            const index = templates.findIndex(function (template) {
                return template.id === row.dataset.templateId;
            });
            if (index < 0) return;
            if (event.target.closest('.path-order-import-template-use')) {
                if (
                    state.orderImportItems.length &&
                    !window.confirm('载入模板将替换当前住院医嘱开立草稿，确认继续吗？')
                ) return;
                const template = templates[index];
                state.orderImportItems = template.items.map(function (item) {
                    return normalizeOrderImportItem(Object.assign({}, clone(item), {
                        id: makeId('item'),
                        status: ''
                    }));
                });
                state.orderImportSource = JSON.stringify({
                    template: template.name,
                    items: state.orderImportItems.map(orderImportJsonItem)
                }, null, 2);
                state.orderImportSourceLabel = '住院医嘱模板：' + template.name;
                state.orderImportSourcePatientLabel = '';
                state.orderImportOrigin = 'template';
                modal.querySelector('.path-order-import-source').value = state.orderImportSource;
                renderOrderImportPreview(
                    modal,
                    state.orderImportItems,
                    state.orderImportSourceLabel,
                    state.orderImportOrigin
                );
                closeInpatientOrderTemplateManager(modal);
                setOrderImportStatus(modal, '已载入住院医嘱模板“' + template.name + '”。', 'success');
            }
            else if (event.target.closest('.path-order-import-template-rename')) {
                const name = plain(window.prompt('请输入新模板名称：', templates[index].name));
                if (!name) return;
                templates[index].name = name;
                templates[index].updatedAt = new Date().toLocaleString();
                saveInpatientOrderTemplates(templates);
                renderInpatientOrderTemplateManager(modal);
            }
            else if (event.target.closest('.path-order-import-template-delete')) {
                if (!window.confirm('确认删除模板“' + templates[index].name + '”吗？')) return;
                templates.splice(index, 1);
                saveInpatientOrderTemplates(templates);
                renderInpatientOrderTemplateManager(modal);
            }
        });
    }

    function importedGroupItemSignature(item) {
        const normalized = normalizeItem(item);
        return JSON.stringify({
            tab: normalized.tab,
            orderType: normalized.orderType,
            name: normalize(normalized.name),
            searchName: normalize(normalized.searchName),
            secondarySearchName: normalize(normalized.secondarySearchName),
            department: normalize(normalized.department),
            groupNo: normalize(normalized.groupNo),
            dose: normalized.dose || '',
            unit: normalize(normalized.unit),
            route: normalize(normalized.route),
            frequency: normalize(normalized.frequency),
            days: normalized.days || '',
            quantity: normalized.quantity || '',
            total: normalized.total || '',
            doseCount: normalized.doseCount || '',
            decoctionMode: normalized.decoctionMode || '',
            instruction: normalize(normalized.instruction),
            specimen: normalize(normalized.specimen),
            bodyPart: normalize(normalized.bodyPart),
            dischargeFlag: normalized.dischargeFlag,
            transferSelfPay: normalized.transferSelfPay,
            billing: normalized.billing
        });
    }

    async function appendCurrentPageOrdersToGroup(
        modal,
        providedItems,
        providedSource
    ) {
        if (state.running || state.bulkDeletingOrders) {
            showStatus('当前已有任务正在执行。', 'warning');
            return;
        }

        if (!saveCurrentEditor(modal, false)) {
            showStatus(
                '当前组套编辑内容存在错误，不能追加当前页医嘱。',
                'error'
            );
            return;
        }

        const group = currentGroup();
        if (!group) {
            showStatus('未找到当前组套。', 'error');
            return;
        }

        let detected;

        if (Array.isArray(providedItems)) {
            detected = {
                source:
                    plain(providedSource) ||
                    '住院医嘱开立草稿',
                items: providedItems
            };
        }
        else {
            showStatus('正在读取当前页面医嘱……');
            await sleep(80);
            detected = detectCurrentPageOrders();
        }
        let sourceItems = (detected.items || []).filter(function (item) {
            return Boolean(importedOrderText(item.name));
        });

        /*
         * v1.48.28：仅“当前页医嘱加入组套”直接入口支持反向排序。
         * 勾选后只把当前DOM识别结果的顺序整体倒置，再进入原有去重/追加流程；
         * 不按时间字段重新排序，也不改变住院医嘱开立窗口中“加入组套”的顺序。
         */
        const reverseCurrentPageOrder = Boolean(
            !Array.isArray(providedItems) &&
            modal.querySelector('.path-add-current-page-orders-reverse') &&
            modal.querySelector('.path-add-current-page-orders-reverse').checked
        );

        if (reverseCurrentPageOrder) {
            sourceItems = sourceItems.slice().reverse();
        }

        if (!sourceItems.length) {
            showStatus(
                '当前页面未识别到可加入组套的医嘱。\n' +
                '请先打开“医嘱查询”或具体医嘱录入标签页，并确保列表中已有可见医嘱。',
                'warning'
            );
            return;
        }

        const draft = groupDraftItems(modal);
        const existing = new Set(
            draft.map(importedGroupItemSignature)
        );
        const pageSeen = new Set();
        const appendItems = [];
        let duplicateCount = 0;

        sourceItems.forEach(function (item) {
            const signature = importedGroupItemSignature(item);
            if (existing.has(signature) || pageSeen.has(signature)) {
                duplicateCount += 1;
                return;
            }
            pageSeen.add(signature);
            appendItems.push(normalizeItem(Object.assign({}, item, {
                id: makeId('item'),
                enabled: true,
                status: ''
            })));
        });

        if (!appendItems.length) {
            showStatus(
                '当前页识别到' + sourceItems.length +
                '条医嘱，但均已存在于当前组套中，未重复添加。',
                'warning'
            );
            return;
        }

        const summaryMap = {};
        appendItems.forEach(function (item) {
            summaryMap[item.tab] = (summaryMap[item.tab] || 0) + 1;
        });
        const summary = Object.keys(summaryMap)
            .map(function (key) {
                return key + summaryMap[key] + '条';
            })
            .join('、');

        const confirmed = window.confirm(
            '确认将“' + detected.source + '”的医嘱追加到当前组套“' +
            group.name + '”末尾吗？\n\n' +
            '当前页识别：' + sourceItems.length + '条\n' +
            '实际新增：' + appendItems.length + '条' +
            (duplicateCount ? '\n跳过完全重复：' + duplicateCount + '条' : '') +
            (reverseCurrentPageOrder ? '\n追加顺序：反向排序' : '\n追加顺序：当前页原顺序') +
            '\n类型：' + summary + '\n\n' +
            '本次只追加到组套草稿，不会覆盖原有条目。\n' +
            '追加后仍需点击“保存当前组套”才正式保存。'
        );

        if (!confirmed) {
            showStatus('已取消将当前页医嘱加入组套。', 'warning');
            return;
        }

        draft.push.apply(draft, appendItems);
        modal.dataset.pathSelectedItemId = appendItems[0].id;

        refreshGroupDraftDirty(
            modal,
            '当前页医嘱已追加到组套草稿。'
        );
        renderGroupGui(modal);
        syncJsonFromGroup(
            modal,
            '已从' + detected.source + '追加' + appendItems.length +
            '条医嘱到组套草稿，尚未保存。'
        );
        renderRunGroups(modal);
        renderStatusList(modal);
        setSelectedGuiRow(modal, appendItems[0].id);

        const firstNewRow = modal.querySelector(
            '.path-gui-row[data-item-id="' +
            CSS.escape(appendItems[0].id) + '"]'
        );
        if (firstNewRow) {
            firstNewRow.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }

        showStatus(
            '已将当前页医嘱追加到当前组套草稿。\n' +
            '新增：' + appendItems.length + '条' +
            (duplicateCount ? '；跳过重复：' + duplicateCount + '条' : '') +
            (reverseCurrentPageOrder ? '；已按当前页识别顺序反向追加' : '') +
            '。\n请核对后点击“保存当前组套”。',
            'success'
        );

        return {
            added: true,
            count: appendItems.length,
            duplicateCount: duplicateCount
        };
    }

    function findDuplicateMedicationDialog() {
        /*
         * 只匹配医院系统明确的“重复医嘱后是否继续保存”提示。
         * 不处理配伍禁忌、过敏、剂量异常、相互作用等其他警告。
         */
        const pattern =
            /已在(?:长期|临时)医嘱中使用[\s\S]*是否继续保存|重复用药[\s\S]*是否继续保存/;

        return visibleSystemDialogByText(pattern);
    }

    function duplicateMedicationConfirmButton(dialog) {
        if (!dialog) return null;

        const buttons = Array.from(
            dialog.querySelectorAll(
                'button,a,input[type="button"],input[type="submit"],[role="button"],.layui-layer-btn a'
            )
        ).filter(isVisible);

        const exactConfirm = buttons.find(function (button) {
            return /^(确认|确定|继续|是)$/.test(
                plain(
                    button.innerText ||
                    button.textContent ||
                    button.value
                )
            );
        });

        if (exactConfirm) {
            return exactConfirm;
        }

        /*
         * 明确排除“取消、否、关闭”，避免误点反向按钮。
         */
        return buttons.find(function (button) {
            const textValue = plain(
                button.innerText ||
                button.textContent ||
                button.value
            );

            return (
                /确认|确定|继续保存|继续/.test(textValue) &&
                !/取消|否|关闭/.test(textValue)
            );
        }) || null;
    }

    async function settleDuplicateMedicationPromptsAfterSave() {
        const initialDeadline = Date.now() + 1800;
        let extendedDeadline = initialDeadline;
        let quietSince = 0;
        let confirmedThisSave = 0;

        while (Date.now() < extendedDeadline) {
            const found =
                findDuplicateMedicationDialog();

            if (found) {
                quietSince = 0;

                if (
                    !state.ignoreDuplicateMedicationPrompt
                ) {
                    return {
                        found: true,
                        blocked: true,
                        confirmed: 0,
                        text: found.text || ''
                    };
                }

                const confirm =
                    duplicateMedicationConfirmButton(
                        found.dialog
                    );

                if (!confirm) {
                    return {
                        found: true,
                        blocked: true,
                        confirmed: confirmedThisSave,
                        text:
                            '检测到重复用药提示，但未找到“确认”按钮'
                    };
                }

                realClick(confirm);

                confirmedThisSave += 1;
                state.duplicateMedicationPromptConfirmCount += 1;

                showStatus(
                    '检测到重复用药提示，已按勾选设置自动确认。\n' +
                    '本次保存已确认' +
                    confirmedThisSave +
                    '次，任务继续执行。',
                    'warning'
                );

                /*
                 * 同一次保存可能连续弹出多个重复药品提示。
                 * 每次确认后延长等待时间，直到弹窗稳定消失。
                 */
                extendedDeadline = Date.now() + 5200;
                await sleep(320);
                continue;
            }

            if (confirmedThisSave > 0) {
                if (!quietSince) {
                    quietSince = Date.now();
                }

                if (
                    Date.now() - quietSince >= 700
                ) {
                    return {
                        found: true,
                        blocked: false,
                        confirmed: confirmedThisSave
                    };
                }
            }
            else if (Date.now() >= initialDeadline) {
                return {
                    found: false,
                    blocked: false,
                    confirmed: 0
                };
            }

            await sleep(90);
        }

        return {
            found: confirmedThisSave > 0,
            blocked: false,
            confirmed: confirmedThisSave
        };
    }

    async function waitProjectRowInitialized(rowIndex, itemName) {
        const deadline = Date.now() + 5200;
        let lastContext = null;

        while (Date.now() < deadline) {
            await dismissSystemDialog(/计算数量失败/);

            const context = findTableContext('项目录入');
            const row = context && context.rows[rowIndex];

            if (context && row) {
                lastContext = context;

                const name = normalize(
                    fieldDisplayValue(
                        context,
                        row,
                        'name'
                    )
                );
                const department = plain(
                    fieldDisplayValue(
                        context,
                        row,
                        'department'
                    )
                );
                const unit = plain(
                    fieldDisplayValue(
                        context,
                        row,
                        'unit'
                    )
                );
                const price = plain(
                    fieldDisplayValue(
                        context,
                        row,
                        'price'
                    )
                );

                const nameReady = !itemName ||
                    name.includes(normalize(itemName)) ||
                    normalize(itemName).includes(name);
                const dependentReady = Boolean(
                    department || unit || /-?\d+(?:\.\d+)?/.test(price)
                );

                if (nameReady && dependentReady) {
                    await sleep(260);
                    return context;
                }
            }

            await sleep(130);
        }

        if (lastContext) {
            await sleep(300);
            return lastContext;
        }

        throw new Error('项目字典选择后，收费项目依赖字段未完成初始化');
    }


    async function waitRehabRowInitialized(rowIndex, itemName) {
        const deadline = Date.now() + 5200;
        let lastContext = null;

        while (Date.now() < deadline) {
            /*
             * 旧页面可能在收费项目尚未选定时先触发数量计算。
             * 发现提示后先关闭，再继续等待项目字典回写。
             */
            await dismissSystemDialog(/计算数量失败/);

            const context = findTableContext('康复医嘱');
            const row = context && context.rows[rowIndex];

            if (context && row) {
                lastContext = context;

                const name = normalize(
                    fieldDisplayValue(
                        context,
                        row,
                        'name'
                    )
                );
                const department = plain(
                    fieldDisplayValue(
                        context,
                        row,
                        'department'
                    )
                );
                const unit = plain(
                    fieldDisplayValue(
                        context,
                        row,
                        'unit'
                    )
                );

                const nameReady = !itemName ||
                    name.includes(normalize(itemName)) ||
                    normalize(itemName).includes(name);
                const dependentReady = Boolean(
                    department || unit
                );

                if (nameReady && dependentReady) {
                    await sleep(260);
                    return context;
                }
            }

            await sleep(130);
        }

        if (lastContext) {
            await sleep(300);
            return lastContext;
        }

        throw new Error(
            '康复收费项目选择后，执行科室或单位未完成初始化'
        );
    }


    function projectDepartmentCellTexts(element) {
        if (!element) return [];

        const cells = Array.from(
            element.querySelectorAll(
                'td,[role="gridcell"]'
            )
        ).filter(isVisible);

        if (cells.length) {
            return cells.map(function (cell) {
                return plain(
                    cell.innerText ||
                    cell.textContent
                );
            }).filter(Boolean);
        }

        return [
            plain(
                element.innerText ||
                element.textContent
            )
        ].filter(Boolean);
    }

    function projectDepartmentPanelScore(element) {
        let current = element;
        let best = 0;

        for (
            let level = 0;
            current && level < 7;
            level += 1
        ) {
            const textValue = normalize(
                current.innerText ||
                current.textContent
            );
            let score = 0;

            if (
                textValue.includes(normalize('编号')) &&
                textValue.includes(normalize('名称'))
            ) {
                score += 5;
            }

            if (
                /ct室|彩超室|心电图室|中医科|门诊输液/.test(
                    textValue
                )
            ) {
                score += 3;
            }

            const rows = current.querySelectorAll
                ? current.querySelectorAll(
                    'tr,[role="row"],.datagrid-row'
                ).length
                : 0;

            if (rows >= 2) {
                score += Math.min(rows, 8);
            }

            best = Math.max(best, score);
            current = current.parentElement;
        }

        return best;
    }

    function collectProjectDepartmentRows(
        context,
        cell,
        desired
    ) {
        const target = normalize(desired);
        const cellRect = cell.getBoundingClientRect();
        const candidates = [];
        const seen = new Set();

        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll([
                'tr',
                '[role="row"]',
                '.datagrid-row',
                '.layui-table-body tr',
                '.dropdown-menu li',
                '[role="option"]'
            ].join(',')))
                .filter(isVisible)
                .forEach(function (row) {
                    if (
                        seen.has(row) ||
                        row.closest('#' + IDS.modal) ||
                        row.closest('#' + IDS.panel) ||
                        (
                            context.table &&
                            context.table.contains(row)
                        )
                    ) {
                        return;
                    }

                    seen.add(row);

                    const texts =
                        projectDepartmentCellTexts(row);
                    const normalizedTexts =
                        texts.map(normalize);
                    const exactIndex =
                        normalizedTexts.findIndex(
                            function (value) {
                                return value === target;
                            }
                        );
                    const partialIndex =
                        normalizedTexts.findIndex(
                            function (value) {
                                return (
                                    value.includes(target) ||
                                    target.includes(value)
                                );
                            }
                        );

                    if (
                        exactIndex < 0 &&
                        partialIndex < 0
                    ) {
                        return;
                    }

                    const rect =
                        row.getBoundingClientRect();

                    if (
                        rect.width < 30 ||
                        rect.height < 12 ||
                        rect.width > 900 ||
                        rect.height > 150
                    ) {
                        return;
                    }

                    const panelScore =
                        projectDepartmentPanelScore(row);
                    let score =
                        Math.abs(
                            rect.left - cellRect.left
                        ) +
                        Math.abs(
                            rect.top - cellRect.bottom
                        ) / 2;

                    if (doc === context.doc) {
                        score -= 2500;
                    }

                    score -= panelScore * 700;

                    if (exactIndex >= 0) {
                        score -= 4500;
                    }
                    else {
                        score -= 1700;
                    }

                    if (
                        rect.top >= cellRect.top - 50 &&
                        rect.top <= cellRect.bottom + 720
                    ) {
                        score -= 600;
                    }

                    candidates.push({
                        doc: doc,
                        row: row,
                        texts: texts,
                        exactIndex: exactIndex,
                        partialIndex: partialIndex,
                        score: score,
                        panelScore: panelScore
                    });
                });
        });

        candidates.sort(function (a, b) {
            if (a.score !== b.score) {
                return a.score - b.score;
            }

            return b.panelScore - a.panelScore;
        });

        return candidates;
    }

    function collectVisibleProjectDepartments(
        context,
        cell
    ) {
        const values = [];
        const seen = new Set();

        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll([
                'tr',
                '[role="row"]',
                '.datagrid-row',
                '.layui-table-body tr',
                '[role="option"]'
            ].join(',')))
                .filter(isVisible)
                .forEach(function (row) {
                    if (
                        row.closest('#' + IDS.modal) ||
                        row.closest('#' + IDS.panel) ||
                        (
                            context.table &&
                            context.table.contains(row)
                        ) ||
                        projectDepartmentPanelScore(row) < 5
                    ) {
                        return;
                    }

                    const texts =
                        projectDepartmentCellTexts(row);

                    texts.forEach(function (value) {
                        const key = normalize(value);

                        if (
                            value &&
                            key &&
                            !/^(编号|名称)$/.test(value) &&
                            !/^\d+$/.test(value) &&
                            !seen.has(key)
                        ) {
                            seen.add(key);
                            values.push(value);
                        }
                    });
                });
        });

        return values.slice(0, 12);
    }

    async function waitProjectDepartmentRow(
        context,
        cell,
        desired,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 2200);

        while (Date.now() < deadline) {
            const rows =
                collectProjectDepartmentRows(
                    context,
                    cell,
                    desired
                );

            if (rows.length) {
                return rows[0];
            }

            await sleep(70);
        }

        return null;
    }

    async function openProjectDepartmentPopup(
        context,
        row,
        cell,
        desired
    ) {
        cell.scrollIntoView({
            block: 'center',
            inline: 'center',
            behavior: 'auto'
        });

        await sleep(110);

        const descendants = Array.from(
            cell.querySelectorAll([
                'input:not([type="hidden"])',
                'button',
                'a',
                '[role="button"]',
                'span',
                'div'
            ].join(','))
        ).filter(isVisible);
        const targets =
            descendants.concat([cell]);
        const seen = new Set();

        for (const target of targets) {
            if (seen.has(target)) continue;

            seen.add(target);
            realClick(target);

            const found =
                await waitProjectDepartmentRow(
                    context,
                    cell,
                    desired,
                    700
                );

            if (found) {
                return found;
            }
        }

        const rect = cell.getBoundingClientRect();
        const points = [
            {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            },
            {
                x: rect.left + Math.max(
                    8,
                    rect.width * 0.2
                ),
                y: rect.top + rect.height / 2
            },
            {
                x: rect.right - Math.max(
                    8,
                    rect.width * 0.2
                ),
                y: rect.top + rect.height / 2
            }
        ];

        for (const point of points) {
            clickDocumentPoint(
                context.doc,
                point.x,
                point.y,
                cell
            );

            const found =
                await waitProjectDepartmentRow(
                    context,
                    cell,
                    desired,
                    800
                );

            if (found) {
                return found;
            }
        }

        realDoubleClick(cell);

        return waitProjectDepartmentRow(
            context,
            cell,
            desired,
            1200
        );
    }

    async function selectExecutionDepartment(
        tabName,
        rowIndex,
        desiredDepartment,
        requirePreset
    ) {
        const desired = String(
            desiredDepartment || ''
        ).trim();

        let context = await ensureRows(
            tabName,
            rowIndex + 1
        );
        let row = context.rows[rowIndex];
        let cell = cellByField(
            context,
            row,
            'department'
        );

        if (!cell) {
            throw new Error(
                '第' +
                (rowIndex + 1) +
                '行未识别到“执行科室”列'
            );
        }

        const currentText = plain(
            fieldDisplayValue(
                context,
                row,
                'department'
            )
        );

        /*
         * 康复项目通常会随收费项目自动回填执行科室。
         * 没有预设值时，若当前行已有科室则直接保留。
         */
        if (!desired) {
            if (currentText) {
                return currentText;
            }

            if (requirePreset) {
                throw new Error(
                    '项目未预设执行科室；请在GUI“执行科室”列或JSON department字段中填写'
                );
            }

            throw new Error(
                '康复收费项目未自动回填执行科室；可在GUI“执行科室”列中预设'
            );
        }

        const current = normalize(currentText);
        const target = normalize(desired);

        if (
            current &&
            (
                current === target ||
                current.includes(target) ||
                target.includes(current)
            )
        ) {
            return currentText;
        }

        await dismissSystemDialog(
            /缺少执行科室/
        );

        context = findTableContext(tabName) || context;
        row = context.rows[rowIndex] || row;
        cell = cellByField(
            context,
            row,
            'department'
        ) || cell;

        let candidate =
            collectProjectDepartmentRows(
                context,
                cell,
                desired
            )[0] || null;

        if (!candidate) {
            candidate =
                await openProjectDepartmentPopup(
                    context,
                    row,
                    cell,
                    desired
                );
        }

        if (!candidate) {
            const available =
                collectVisibleProjectDepartments(
                    context,
                    cell
                );

            throw new Error(
                '执行科室列表中未找到“' +
                desired +
                '”' +
                (
                    available.length
                        ? '；当前可见：' +
                          available.join('、')
                        : ''
                )
            );
        }

        const cells = Array.from(
            candidate.row.querySelectorAll(
                'td,[role="gridcell"]'
            )
        ).filter(isVisible);
        const targetIndex =
            candidate.exactIndex >= 0
                ? candidate.exactIndex
                : candidate.partialIndex;
        const targetCell =
            targetIndex >= 0
                ? cells[targetIndex] ||
                  candidate.row
                : candidate.row;
        const clickable =
            targetCell.closest(
                'a,button,[role="option"],[role="button"]'
            ) ||
            targetCell;

        realClick(clickable);
        await sleep(340);

        let committed =
            await waitFieldValue(
                tabName,
                rowIndex,
                'department',
                desired,
                1800
            );

        if (!committed) {
            realDoubleClick(clickable);
            pressKey(clickable, 'Enter', 13);
            await sleep(300);

            committed =
                await waitFieldValue(
                    tabName,
                    rowIndex,
                    'department',
                    desired,
                    1800
                );
        }

        if (!committed) {
            throw new Error(
                '已点击执行科室“' +
                desired +
                '”，但未回写到当前' +
                tabName +
                '行'
            );
        }

        context = findTableContext(tabName) || context;
        row = context.rows[rowIndex] || row;

        return fieldDisplayValue(
            context,
            row,
            'department'
        ) || desired;
    }

    async function selectProjectDepartment(
        rowIndex,
        desiredDepartment
    ) {
        return selectExecutionDepartment(
            '项目录入',
            rowIndex,
            desiredDepartment,
            true
        );
    }

    async function selectRehabDepartment(
        rowIndex,
        desiredDepartment
    ) {
        return selectExecutionDepartment(
            '康复医嘱',
            rowIndex,
            desiredDepartment,
            false
        );
    }

    function candidateTexts(element) {
        const cells = Array.from(element.querySelectorAll('td,[role="gridcell"]')).filter(isVisible);
        return cells.length ? cells.map(cell => plain(cell.innerText || cell.textContent)).filter(Boolean) : [plain(element.innerText || element.textContent)];
    }

    async function selectDictionary(tabName, rowIndex, item) {
        const context = await ensureRows(
            tabName,
            rowIndex + 1
        );
        const row = context.rows[rowIndex];
        const editor = await ensureCellEditor(
            context,
            row,
            'name'
        );
        const cell = editor.cell;
        const input = editor.input;
        const term = String(
            item.searchName ||
            item.name ||
            ''
        ).trim();

        if (!cell) {
            throw new Error('未找到名称/收费项目单元格');
        }

        if (!input) {
            const existing = normalize(
                fieldDisplayValue(
                    context,
                    row,
                    'name'
                )
            );

            if (existing &&
                (
                    existing.includes(normalize(term)) ||
                    normalize(term).includes(existing)
                )) {
                return term;
            }

            throw new Error(
                '未能打开“' +
                ((tabName === '项目录入' || tabName === '康复医嘱')
                    ? '收费项目'
                    : '名称') +
                '检索输入框'
            );
        }

        setInputValue(
            context.doc,
            input,
            term
        );

        input.focus();
        await sleep(
            tabName === '项目录入'
                ? 950
                : 750
        );

        const inputRect =
            input.getBoundingClientRect();
        const candidates = Array.from(
            context.doc.querySelectorAll([
                'tr',
                '[role="row"]',
                '.datagrid-row',
                '.layui-table-body tr',
                '.dropdown-menu li',
                '.autocomplete-suggestion',
                '.ui-menu-item',
                '.select2-results__option',
                '[role="option"]'
            ].join(','))
        )
            .filter(isVisible)
            .filter(function (element) {
                return !element.closest(
                    '#' + IDS.modal
                ) &&
                !(context.dataRoot || context.table).contains(element);
            })
            .map(function (element) {
                const texts = candidateTexts(element);
                const rect =
                    element.getBoundingClientRect();
                let score =
                    Math.abs(
                        rect.top -
                        inputRect.bottom
                    ) +
                    Math.abs(
                        rect.left -
                        inputRect.left
                    ) / 3;

                texts.forEach(function (textValue, index) {
                    const value =
                        normalize(textValue);
                    const target =
                        normalize(term);

                    if (value === target) {
                        score -= index <= 2
                            ? 7600
                            : 5000;
                    }
                    else if (
                        value.startsWith(target) ||
                        target.startsWith(value)
                    ) {
                        score -= 3400;
                    }
                    else if (
                        value.includes(target)
                    ) {
                        score -= 2000;
                    }
                });

                return {
                    element: element,
                    texts: texts,
                    score: score
                };
            })
            .sort(function (a, b) {
                return a.score - b.score;
            });

        if (
            candidates.length &&
            candidates[0].score < 2600
        ) {
            const cells = Array.from(
                candidates[0].element.querySelectorAll(
                    'td,[role="gridcell"]'
                )
            ).filter(isVisible);
            const target = cells.find(function (candidate) {
                return normalize(
                    candidate.innerText ||
                    candidate.textContent
                ).includes(
                    normalize(term)
                );
            }) ||
                cells[1] ||
                cells[0] ||
                candidates[0].element;

            realClick(target);
            await sleep(
                tabName === '项目录入'
                    ? 520
                    : 340
            );

            try {
                input.blur();
            }
            catch (error) {
                // 忽略。
            }

            pressKey(input, 'Escape', 27);

            if (tabName === '项目录入') {
                await waitProjectRowInitialized(
                    rowIndex,
                    term
                );
            }
            else if (tabName === '康复医嘱') {
                await waitRehabRowInitialized(
                    rowIndex,
                    term
                );
            }
            else {
                await waitFieldValue(
                    tabName,
                    rowIndex,
                    'name',
                    term,
                    1800
                );
            }

            return candidates[0].texts[1] ||
                candidates[0].texts[0] ||
                term;
        }

        input.focus();
        pressKey(input, 'ArrowDown', 40);
        pressKey(input, 'Enter', 13);

        await sleep(
            tabName === '项目录入'
                ? 620
                : 360
        );

        try {
            input.blur();
        }
        catch (error) {
            // 忽略。
        }

        if (tabName === '项目录入') {
            await waitProjectRowInitialized(
                rowIndex,
                term
            );
        }
        else if (tabName === '康复医嘱') {
            await waitRehabRowInitialized(
                rowIndex,
                term
            );
        }

        const refreshed =
            findTableContext(tabName);
        const refreshedRow =
            refreshed &&
            refreshed.rows[rowIndex];
        const selectedName =
            refreshedRow
                ? fieldDisplayValue(
                    refreshed,
                    refreshedRow,
                    'name'
                )
                : '';

        if (selectedName) {
            return term;
        }

        throw new Error(
            '院内字典未找到匹配项：' +
            term
        );
    }

    function parseMin(text) {
        const source = plain(text).replace(/，/g, '.').replace(/\s+/g, '');
        if (!source || /请选择|请选|选择|未选择|空/.test(normalize(source))) return null;
        const percent = source.match(/(-?\d+(?:\.\d+)?)%/);
        if (percent) return Number(percent[1]) / 100;
        const match = source.match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
    }

    async function chooseMinimum(tabName, rowIndex, field) {
        const context = await ensureRows(tabName, rowIndex + 1);
        const cell = cellByField(context, context.rows[rowIndex], field);
        if (!cell) throw new Error('未找到“' + field + '”字段');
        const select = nativeSelect(cell);
        if (select) {
            const options = Array.from(select.options || []).filter(option => !option.disabled).map(option => ({ option, text: plain(option.textContent || option.value), value: parseMin(option.textContent || option.value) })).filter(item => item.value !== null).sort((a, b) => a.value - b.value);
            if (!options.length) throw new Error('“' + field + '”没有可识别数值选项');
            triggerSelect(context.doc, select, options[0].option);
            return options[0].text;
        }
        const current = plain(cell.innerText || cell.textContent);
        if (parseMin(current) !== null) return current;
        if (await chooseVisualOption(context.doc, cell, '0.05')) return '0.05';
        throw new Error('未能读取或选择“' + field + '”');
    }

    function canonicalUnit(unit) {
        const value = String(unit || '').trim().replace(/μ/g, 'u').toLowerCase();
        const aliases = { ug: 'ug', mcg: 'ug', 微克: 'ug', mg: 'mg', 毫克: 'mg', g: 'g', 克: 'g', kg: 'kg', 千克: 'kg', ml: 'ml', 毫升: 'ml', l: 'l', 升: 'l', u: 'unit', iu: 'unit', 单位: 'unit', 万单位: 'wanunit', 万u: 'wanunit' };
        return aliases[value] || value;
    }

    const UNIT_DEF = { ug: { group: 'mass', factor: 0.000001 }, mg: { group: 'mass', factor: 0.001 }, g: { group: 'mass', factor: 1 }, kg: { group: 'mass', factor: 1000 }, ml: { group: 'volume', factor: 1 }, l: { group: 'volume', factor: 1000 }, unit: { group: 'activity', factor: 1 }, wanunit: { group: 'activity', factor: 10000 } };

    function convertDose(value, from, to) {
        const source = UNIT_DEF[canonicalUnit(from)];
        const target = UNIT_DEF[canonicalUnit(to)];
        if (!source || !target || source.group !== target.group) return null;
        return Number((Number(value) * source.factor / target.factor).toFixed(6));
    }

    async function resolveDose(tabName, rowIndex, item) {
        const context = await ensureRows(tabName, rowIndex + 1);
        const cell = cellByField(context, context.rows[rowIndex], 'unit');
        if (!cell || item.dose === '' || !item.unit) return { dose: item.dose, unit: item.unit, note: '' };
        const select = nativeSelect(cell);
        const options = select ? Array.from(select.options || []).filter(option => !option.disabled).map(option => plain(option.textContent || option.value)).filter(text => text && !/请选择|请选/.test(normalize(text))) : [plain(cell.innerText || cell.textContent)].filter(Boolean);
        const exact = options.find(option => canonicalUnit(option) === canonicalUnit(item.unit));
        if (exact) return { dose: item.dose, unit: exact, note: '' };
        const converted = options.map(option => ({ option, value: convertDose(item.dose, item.unit, option) })).filter(entry => entry.value !== null && entry.value > 0);
        if (!converted.length) throw new Error('剂量单位“' + item.unit + '”与院内单位“' + options.join('、') + '”不能安全换算');
        return { dose: converted[0].value, unit: converted[0].option, note: String(item.dose) + item.unit + '→' + converted[0].value + converted[0].option };
    }

    function routeText(value) {
        const original = String(value || '').trim();
        const definition = hospitalRouteDefinition(original);

        return definition
            ? definition.name
            : original;
    }

    function herbMode(mode) {
        return {
            '代煎': { route: '代煎', decoction: '是' },
            '自煎': { route: '自煎', decoction: '否' },
            '外用': { route: '外用', decoction: '否' },
            '冲服': { route: '冲服', decoction: '否' }
        }[mode] || { route: '自煎', decoction: '否' };
    }

    /******************************************************************
     * 新版中草药页面底部统一处方参数
     *
     * 与独立中草药AI脚本保持同一修复原则：
     * 1. 标签文字使用Range矩形定位，不用包住select后的整块矩形；
     * 2. 标签自身包含的控件获得最高优先级；
     * 3. 原生select必须用目标option反向校验，避免“用法=代煎”
     *    误命中右侧“代煎：是/否”下拉框；
     * 4. 不修改药房，仅设置剂数、用法、代煎、出院带药、转自费、计费。
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

    function herbFooterSettingsFromItem(item) {
        const count = Number(item && item.doseCount);
        const mode = item && [
            '代煎', '自煎', '外用', '冲服'
        ].includes(item.decoctionMode)
            ? item.decoctionMode
            : '自煎';

        return {
            doseCount: Number.isInteger(count) && count >= 1 && count <= 60
                ? count
                : 7,
            decoctionMode: mode,
            dischargeFlag: String(
                item && item.dischargeFlag || '否'
            ).trim() || '否',
            transferSelfPay: String(
                item && item.transferSelfPay || '否'
            ).trim() || '否',
            billing: String(
                item && item.billing || '是'
            ).trim() || '是'
        };
    }

    function herbFooterSettingsEqual(left, right) {
        if (!left || !right) return false;

        return Number(left.doseCount) === Number(right.doseCount) &&
            normalize(left.decoctionMode) === normalize(right.decoctionMode) &&
            normalize(left.dischargeFlag) === normalize(right.dischargeFlag) &&
            normalize(left.transferSelfPay) === normalize(right.transferSelfPay) &&
            normalize(left.billing) === normalize(right.billing);
    }

    function herbFooterSettingsText(settings) {
        const mode = herbMode(settings.decoctionMode);

        return Number(settings.doseCount) + '剂；用法=' +
            mode.route + '；代煎=' + mode.decoction +
            '；出院带药=' + settings.dischargeFlag +
            '；转自费=' + settings.transferSelfPay +
            '；计费=' + settings.billing;
    }

    function isHerbFooterElementAllowed(context, element) {
        if (!element || !element.isConnected) return false;

        if (element.closest('#' + IDS.modal) ||
            element.closest('#' + IDS.panel) ||
            element.closest('thead,[role="columnheader"]')) {
            return false;
        }

        if ((context && context.rows || []).some(function (row) {
            return row === element || row.contains(element);
        })) {
            return false;
        }

        return true;
    }

    function getHerbFooterControlVisual(control) {
        if (!control) return null;

        if (String(control.tagName || '').toUpperCase() === 'SELECT') {
            if (isVisible(control)) return control;

            const adjacent = [
                control.nextElementSibling,
                control.previousElementSibling
            ].filter(Boolean);

            for (const element of adjacent) {
                if (element.matches &&
                    element.matches(HERB_FOOTER_SELECT_VISUAL_SELECTOR)) {
                    return element;
                }
            }

            let parent = control.parentElement;

            for (let level = 0; parent && level < 4; level += 1) {
                const nested = parent.querySelector(
                    HERB_FOOTER_SELECT_VISUAL_SELECTOR
                );

                if (nested && nested !== control) return nested;
                parent = parent.parentElement;
            }

            return control;
        }

        return control.closest(HERB_FOOTER_SELECT_VISUAL_SELECTOR) ||
            control;
    }

    function findHerbFooterLabelElements(doc, labelAliases) {
        if (!doc || !doc.body || !doc.createTreeWalker) return [];

        const aliases = (labelAliases || [])
            .map(normalize)
            .filter(Boolean);
        const walker = doc.createTreeWalker(
            doc.body,
            doc.defaultView.NodeFilter.SHOW_TEXT
        );
        const result = [];
        const seen = new Set();
        let node;

        while ((node = walker.nextNode())) {
            const parent = node.parentElement;

            if (!parent || !isVisible(parent) ||
                !aliases.includes(normalize(node.nodeValue)) ||
                seen.has(parent)) {
                continue;
            }

            seen.add(parent);
            result.push(parent);
        }

        return result;
    }

    function getHerbFooterLabelRect(labelElement, labelAliases) {
        const fallbackRect = labelElement.getBoundingClientRect();
        const doc = labelElement.ownerDocument;
        const win = doc && doc.defaultView;
        const aliases = (labelAliases || [])
            .map(normalize)
            .filter(Boolean);

        if (!doc || !win || !doc.createTreeWalker || !doc.createRange ||
            !win.NodeFilter || !aliases.length) {
            return fallbackRect;
        }

        const walker = doc.createTreeWalker(
            labelElement,
            win.NodeFilter.SHOW_TEXT
        );
        const matches = [];
        let node;

        while ((node = walker.nextNode())) {
            const parent = node.parentElement;

            if (!aliases.includes(normalize(node.nodeValue)) ||
                (parent && parent.closest([
                    'option',
                    '[role="option"]',
                    HERB_FOOTER_SELECT_VISUAL_SELECTOR
                ].join(',')))) {
                continue;
            }

            try {
                const range = doc.createRange();

                range.selectNodeContents(node);

                const rect = range.getBoundingClientRect();

                if (typeof range.detach === 'function') range.detach();
                if (rect && rect.width > 0 && rect.height > 0) {
                    matches.push(rect);
                }
            }
            catch (error) {
                // 旧式控件不支持文本Range时退回父元素矩形。
            }
        }

        if (!matches.length) return fallbackRect;

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
        const position = labelElement.compareDocumentPosition(
            geometryElement
        );
        const followsLabel = Boolean(
            position & labelElement.ownerDocument.defaultView.Node
                .DOCUMENT_POSITION_FOLLOWING
        );
        let score = level * 520;

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

            if (controlRect.bottom >= labelRect.top - 4 &&
                controlRect.top <= labelRect.bottom + 4) {
                score -= 650;
            }
        }
        else {
            score += 2100;
        }

        score += followsLabel ? -220 : 900;

        const tagName = String(control.tagName || '').toUpperCase();

        if (kind === 'input') {
            if (!/^(INPUT|TEXTAREA)$/.test(tagName)) score += 4500;
            if (control.readOnly) score += 2600;
        }
        else if (tagName !== 'SELECT' &&
            !(visual && visual.matches &&
                visual.matches(HERB_FOOTER_SELECT_VISUAL_SELECTOR))) {
            score += 4500;
        }

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
                control = element.querySelector(
                    'select:not([disabled])'
                ) || element.querySelector(
                    'input:not([type="hidden"]):not([disabled])'
                ) || element;
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
            Array.from(current.querySelectorAll(selector))
                .forEach(function (element) {
                    add(element, level);
                });

            const sibling = current.nextElementSibling;

            if (sibling) {
                if (sibling.matches && sibling.matches(selector)) {
                    add(sibling, level + 0.25);
                }

                Array.from(sibling.querySelectorAll(selector))
                    .forEach(function (element) {
                        add(element, level + 0.25);
                    });
            }

            current = current.parentElement;

            if (!current || current === labelElement.ownerDocument.body) {
                break;
            }
        }

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
        const tableElement = context &&
            (context.dataRoot || context.root);
        const tableRect = tableElement && isVisible(tableElement)
            ? tableElement.getBoundingClientRect()
            : null;
        const labelAliases = HERB_FOOTER_FIELD_LABEL_ALIASES[label] ||
            [label];

        allDocuments().forEach(function (doc) {
            findHerbFooterLabelElements(doc, labelAliases)
                .forEach(function (labelElement) {
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

                    if (!resolved) return;

                    const rect = getHerbFooterLabelRect(
                        labelElement,
                        labelAliases
                    );
                    let score = resolved.score;

                    if (doc === preferredDoc) score -= 4200;

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

    async function setHerbFooterField(
        context,
        label,
        desiredText,
        kind
    ) {
        await checkpoint();

        const refreshed = findTableContext('中草药') || context;
        const found = findHerbFooterField(
            refreshed,
            label,
            kind,
            desiredText
        );

        if (!found) {
            throw new Error(
                '未找到页面底部统一“' + label + '”控件'
            );
        }

        const control = found.control;
        const tagName = String(control && control.tagName || '')
            .toUpperCase();

        if (kind === 'input' &&
            /^(INPUT|TEXTAREA)$/.test(tagName) &&
            !control.readOnly) {
            setInputValue(found.doc, control, desiredText);
            await sleep(150);

            if (normalize(control.value) !== normalize(desiredText)) {
                setInputValue(found.doc, control, desiredText);
                await sleep(150);
            }

            return;
        }

        if (tagName === 'SELECT') {
            const option = findOption(control, desiredText);

            if (!option) {
                throw new Error(
                    '页面底部统一“' + label + '”没有“' +
                    desiredText + '”选项'
                );
            }

            triggerSelect(found.doc, control, option);
            await sleep(160);
            return;
        }

        const visual = found.visual ||
            (control && control.closest
                ? control.closest(HERB_FOOTER_SELECT_VISUAL_SELECTOR)
                : null);

        if (visual &&
            await chooseVisualOption(found.doc, visual, desiredText)) {
            return;
        }

        throw new Error(
            '未能将页面底部统一“' + label + '”设置为“' +
            desiredText + '”'
        );
    }

    async function applyUnifiedHerbFooterSettings(context, settings) {
        const mode = herbMode(settings.decoctionMode);

        showStatus(
            '中药药味已逐行录入，正在设置页面底部统一处方参数……'
        );

        await setHerbFooterField(
            context,
            '剂数',
            settings.doseCount,
            'input'
        );
        await setHerbFooterField(
            context,
            '用法',
            mode.route,
            'select'
        );
        await setHerbFooterField(
            context,
            '代煎',
            mode.decoction,
            'select'
        );
        await setHerbFooterField(
            context,
            '出院带药',
            settings.dischargeFlag,
            'select'
        );
        await setHerbFooterField(
            context,
            '转自费',
            settings.transferSelfPay,
            'select'
        );
        await setHerbFooterField(
            context,
            '计费',
            settings.billing,
            'select'
        );

        showStatus(
            '新版中草药底部统一处方参数已设置：' +
            herbFooterSettingsText(settings) + '。',
            'success'
        );
    }

    async function clearInputField(
        tabName,
        rowIndex,
        field,
        optional
    ) {
        let context = await ensureRows(
            tabName,
            rowIndex + 1
        );
        let row = context.rows[rowIndex];
        let current = plain(
            fieldDisplayValue(
                context,
                row,
                field
            )
        );

        if (!current) {
            return true;
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
            context = findTableContext(tabName) || context;
            row = context.rows[rowIndex] || row;

            const editor = await ensureCellEditor(
                context,
                row,
                field
            );

            if (!editor.input) {
                break;
            }

            setInputValue(
                context.doc,
                editor.input,
                ''
            );

            /*
             * 某些旧表格把空字符串写入编辑器后，还要再收到一次删除键、
             * change和blur才会把行模型中的上一行继承值真正清除。
             */
            try {
                editor.input.focus();
                pressKey(
                    editor.input,
                    'Backspace',
                    8
                );
                editor.input.dispatchEvent(
                    new context.doc.defaultView.Event(
                        'change',
                        { bubbles: true }
                    )
                );
                editor.input.blur();
            }
            catch (error) {
                // 忽略旧控件不支持的事件。
            }

            await sleep(180);

            context = findTableContext(tabName) || context;
            row = context.rows[rowIndex] || row;
            current = plain(
                fieldDisplayValue(
                    context,
                    row,
                    field
                )
            );

            if (!current) {
                return true;
            }
        }

        if (optional) {
            return false;
        }

        throw new Error(
            '第' +
            (rowIndex + 1) +
            '行字段“' +
            field +
            '”未能清空；当前仍为“' +
            current +
            '”'
        );
    }

    async function setMedicationGroupNumber(
        tabName,
        rowIndex,
        value
    ) {
        const desired = String(
            value == null ? '' : value
        ).trim();

        if (desired) {
            await setInput(
                tabName,
                rowIndex,
                'groupNo',
                desired,
                false
            );
            return true;
        }

        /*
         * 新增药品行会继承上一行的组号。组套中组号为空代表“不同组／不分组”，
         * 因此必须主动清空，不能像普通可选字段一样直接跳过。
         */
        return clearInputField(
            tabName,
            rowIndex,
            'groupNo',
            false
        );
    }

    async function fillOptional(tabName, rowIndex, item) {
        await setPopup(
            tabName,
            rowIndex,
            'orderType',
            item.orderType,
            true
        );
        if (
            tabName === '药品录入' ||
            tabName === '出院带药'
        ) {
            await setMedicationGroupNumber(
                tabName,
                rowIndex,
                item.groupNo
            );
        }
        else {
            await setInput(
                tabName,
                rowIndex,
                'groupNo',
                item.groupNo,
                true
            );
        }

        /*
         * 先填写治疗量、天数、部位和嘱托，最后再选择频次。
         * 医院项目页面选择频次会立即触发数量/金额计算，
         * 若频次先于治疗量或依赖字段，容易弹出“计算数量失败”。
         */
        await setInput(
            tabName,
            rowIndex,
            'days',
            item.days,
            true
        );
        await setInput(
            tabName,
            rowIndex,
            'quantity',
            item.quantity,
            true
        );
        await setInput(
            tabName,
            rowIndex,
            'total',
            item.total,
            true
        );
        await setInput(
            tabName,
            rowIndex,
            'instruction',
            item.instruction,
            true
        );

        if (item.specimen) {
            if (!await setSelect(
                tabName,
                rowIndex,
                'specimen',
                item.specimen,
                true
            )) {
                await setInput(
                    tabName,
                    rowIndex,
                    'specimen',
                    item.specimen,
                    true
                );
            }
        }

        if (item.bodyPart) {
            if (!await setSelect(
                tabName,
                rowIndex,
                'bodyPart',
                item.bodyPart,
                true
            )) {
                await setInput(
                    tabName,
                    rowIndex,
                    'bodyPart',
                    item.bodyPart,
                    true
                );
            }
        }

        await setSelect(
            tabName,
            rowIndex,
            'dischargeFlag',
            item.dischargeFlag,
            true
        );
        await setSelect(
            tabName,
            rowIndex,
            'transferSelfPay',
            item.transferSelfPay,
            true
        );
        await setSelect(
            tabName,
            rowIndex,
            'billing',
            item.billing,
            true
        );

        if (item.frequency) {
            await setFrequency(
                tabName,
                rowIndex,
                item.frequency,
                false
            );
        }
    }


    function selectedExecutionHasCheckItems(modal) {
        try {
            return selectedGroups(modal).some(
                function (group) {
                    return group.items.some(
                        function (item) {
                            return (
                                item.enabled &&
                                item.tab === '检查'
                            );
                        }
                    );
                }
            );
        }
        catch (error) {
            return false;
        }
    }

    function writeCheckPopupPlaceholder(popup, index, total, itemName, itemType) {
        if (!popup || popup.closed) {
            return;
        }

        try {
            const applicationType =
                itemType === '检验'
                    ? '检验'
                    : '检查';

            popup.document.open();
            popup.document.write([
                '<!doctype html>',
                '<html><head><meta charset="utf-8">',
                '<title>等待' +
                    applicationType +
                    '申请单</title>',
                '<style>',
                'body{font-family:Arial,"Microsoft YaHei",sans-serif;',
                'padding:36px;color:#345;background:#f6f8fa;}',
                '.box{max-width:620px;margin:80px auto;padding:28px;',
                'background:#fff;border:1px solid #d7e5ec;border-radius:8px;',
                'box-shadow:0 4px 20px rgba(0,0,0,.08);}',
                'h2{margin:0 0 14px;color:#117fac;font-size:22px;}',
                'p{line-height:1.8;margin:8px 0;}',
                '</style></head>',
                '<body data-clinical-pathway-check-placeholder="1">',
                '<div class="box">',
                '<h2>等待' +
                    applicationType +
                    '申请单 ' +
                    (
                        total
                            ? '(' + index + '/' + total + ')'
                            : ''
                    ) +
                '</h2>',
                '<p>此标签页专用于第' +
                    (index || 1) +
                    '项' +
                    applicationType +
                    '申请单。</p>',
                '<p>' +
                    applicationType +
                    '项目：' +
                    String(
                        itemName ||
                        (
                            applicationType === '检验'
                                ? '待执行检验'
                                : '待执行检查'
                        )
                    ) +
                '</p>',
                '<p>保存该项' +
                    applicationType +
                    '后，医院系统生成的申请单或打印页面会显示在这里。</p>',
                '<p>每项检查或检验使用独立标签页，不会被下一项覆盖。</p>',
                '</div></body></html>'
            ].join(''));
            popup.document.close();
        }
        catch (error) {
            // 浏览器限制写入时保持空白页即可。
        }
    }

    function createPreparedCheckPopupSession(
        index,
        total,
        itemName,
        itemType
    ) {
        const name =
            'medicalClinicalPathwayCheckApplication_' +
            Date.now().toString(36) +
            '_' +
            index +
            '_' +
            Math.random()
                .toString(36)
                .slice(2);

        let popup = null;

        try {
            popup = window.open(
                'about:blank',
                name
            );
        }
        catch (error) {
            popup = null;
        }

        if (!popup) {
            return null;
        }

        writeCheckPopupPlaceholder(
            popup,
            index,
            total,
            itemName,
            itemType
        );

        try {
            popup.blur();
        }
        catch (error) {
            // 忽略。
        }

        return {
            name: name,
            popup: popup,
            routeActive: false,
            used: false,
            routeHitCount: 0,
            routeBaseline: 0,
            hooks: [],
            hookedWindows: new Set(),
            targetRestores: [],
            index: index,
            total: total,
            itemName: itemName || '',
            itemType:
                itemType === '检验'
                    ? '检验'
                    : '检查'
        };
    }

    function closeUnusedPreparedCheckSession(
        session
    ) {
        if (!session) {
            return;
        }

        session.routeActive = false;

        session.targetRestores
            .splice(0)
            .reverse()
            .forEach(function (restore) {
                try {
                    restore();
                }
                catch (error) {
                    // 忽略。
                }
            });

        session.hooks
            .splice(0)
            .reverse()
            .forEach(function (restore) {
                try {
                    restore();
                }
                catch (error) {
                    // 忽略。
                }
            });

        if (
            preparedCheckPopupStillPlaceholder(
                session
            )
        ) {
            try {
                session.popup.close();
            }
            catch (error) {
                // 忽略。
            }
        }
    }

    function finishCheckPopupPool(
        closeUnused
    ) {
        /*
         * 先结束当前正在使用的路由会话。
         * 已经导航到申请单的标签页保持打开。
         */
        if (state.checkPopupSession) {
            finishCheckPopupSession(
                closeUnused
            );
        }

        const sessions =
            Array.isArray(
                state.checkPopupPool
            )
                ? state.checkPopupPool
                : [];

        sessions.forEach(function (session) {
            if (
                closeUnused &&
                preparedCheckPopupStillPlaceholder(
                    session
                )
            ) {
                closeUnusedPreparedCheckSession(
                    session
                );
            }
            else {
                session.routeActive = false;

                session.targetRestores
                    .splice(0)
                    .reverse()
                    .forEach(function (restore) {
                        try {
                            restore();
                        }
                        catch (error) {
                            // 忽略。
                        }
                    });

                session.hooks
                    .splice(0)
                    .reverse()
                    .forEach(function (restore) {
                        try {
                            restore();
                        }
                        catch (error) {
                            // 忽略。
                        }
                    });
            }
        });

        state.checkPopupPool = [];
        state.checkPopupCursor = 0;
        state.checkPopupSession = null;
    }

    function prepareCheckPopupPool(
        applicationItems
    ) {
        finishCheckPopupPool(true);

        const items =
            Array.isArray(applicationItems)
                ? applicationItems
                : [];
        const total =
            items.length;
        const sessions = [];

        /*
         * 所有window.open必须在用户点击“执行”并确认后的同步调用链中
         * 完成，浏览器才会允许后续异步保存使用这些标签页。
         */
        for (
            let index = 0;
            index < total;
            index += 1
        ) {
            const item =
                items[index];
            const session =
                createPreparedCheckPopupSession(
                    index + 1,
                    total,
                    item && item.name,
                    item && item.tab
                );

            if (!session) {
                break;
            }

            sessions.push(session);
        }

        state.checkPopupPool =
            sessions;
        state.checkPopupCursor = 0;
        state.checkPopupSession = null;

        try {
            window.focus();
        }
        catch (error) {
            // 忽略。
        }

        setTimeout(function () {
            try {
                window.focus();
            }
            catch (error) {
                // 忽略。
            }
        }, 0);

        if (sessions.length !== total) {
            const opened =
                sessions.length;

            finishCheckPopupPool(true);

            showStatus(
                '需要为' +
                    total +
                    '项检查/检验预开' +
                    total +
                    '个申请单标签页，但浏览器只允许打开' +
                    opened +
                    '个。\n' +
                    '请允许本站弹出式窗口后重新执行，避免多项检查或检验申请单缺失、互相覆盖。',
                'error'
            );

            return false;
        }

        showStatus(
            '已为' +
                total +
                '项检查/检验分别预开' +
                total +
                '个独立申请单标签页。\n' +
                '每项检查或检验保存后将依次进入对应标签页。',
            'normal'
        );

        return true;
    }

    function claimNextCheckPopupSession() {
        if (state.checkPopupSession) {
            finishCheckPopupSession(false);
        }

        const pool =
            state.checkPopupPool || [];
        const cursor =
            state.checkPopupCursor || 0;
        const session =
            pool[cursor] || null;

        if (!session) {
            state.checkPopupSession = null;

            return null;
        }

        state.checkPopupCursor =
            cursor + 1;
        state.checkPopupSession =
            session;

        ensureCheckPopupHooks();

        return session;
    }

    function prepareCheckPopupSession() {
        finishCheckPopupPool(true);

        const name =
            'medicalClinicalPathwayCheckApplication_' +
            Date.now().toString(36);
        let popup = null;

        /*
         * 必须在“执行勾选组套”按钮的真实用户点击事件中立即调用
         * window.open。这样浏览器会把它视为用户主动打开的新标签页，
         * 后面异步保存检查申请单时就不会被弹窗拦截器屏蔽。
         */
        try {
            popup = window.open(
                'about:blank',
                name
            );
        }
        catch (error) {
            popup = null;
        }

        if (!popup) {
            showStatus(
                '浏览器未允许预开检查申请单标签页。请在地址栏右侧允许本站弹出式窗口后重新执行。',
                'warning'
            );

            return null;
        }

        writeCheckPopupPlaceholder(popup);

        /*
         * 避免空白页抢走焦点，使主页面的执行确认窗口藏到后台。
         */
        try {
            popup.blur();
            window.focus();
        }
        catch (error) {
            // 浏览器不允许切换焦点时忽略。
        }

        setTimeout(function () {
            try {
                window.focus();
            }
            catch (error) {
                // 忽略。
            }
        }, 0);

        const session = {
            name: name,
            popup: popup,
            routeActive: false,
            used: false,
            routeHitCount: 0,
            routeBaseline: 0,
            hooks: [],
            hookedWindows: new Set(),
            targetRestores: []
        };

        state.checkPopupSession = session;
        ensureCheckPopupHooks();

        return session;
    }

    function explicitSamePagePopupTarget(target) {
        const value =
            String(target || '')
                .trim()
                .toLowerCase();

        return [
            '_self',
            '_top',
            '_parent'
        ].includes(value);
    }

    function navigatePreparedCheckPopup(
        session,
        url
    ) {
        if (
            !session ||
            !session.popup ||
            session.popup.closed
        ) {
            return false;
        }

        session.used = true;
        session.routeHitCount += 1;

        if (
            url !== undefined &&
            url !== null &&
            String(url).trim() &&
            String(url).trim() !== 'about:blank'
        ) {
            try {
                session.popup.location.href =
                    String(url);
            }
            catch (error) {
                try {
                    session.popup.location.replace(
                        String(url)
                    );
                }
                catch (ignore) {
                    // 可能由调用方继续document.write。
                }
            }
        }

        /*
         * 不主动focus申请单页，主页面继续执行下一项。
         * 所有申请单标签页仍保留在浏览器标签栏中。
         */
        try {
            window.focus();
        }
        catch (error) {
            // 不影响导航。
        }

        return true;
    }

    function hookCheckPopupWindow(win) {
        const session =
            state.checkPopupSession;

        if (
            !session ||
            !win ||
            session.hookedWindows.has(win)
        ) {
            return;
        }

        session.hookedWindows.add(win);

        /*
         * 1. 拦截医院页面的window.open。
         * 不是阻止弹窗，而是把它定向到用户点击时已经预开的标签页。
         */
        try {
            const originalOpen =
                win.open;

            win.open = function (
                url,
                target,
                features
            ) {
                const current =
                    state.checkPopupSession;

                if (
                    current === session &&
                    current.routeActive &&
                    !explicitSamePagePopupTarget(
                        target
                    ) &&
                    current.popup &&
                    !current.popup.closed
                ) {
                    navigatePreparedCheckPopup(
                        current,
                        url
                    );

                    return current.popup;
                }

                return originalOpen.apply(
                    this,
                    arguments
                );
            };

            session.hooks.push(
                function () {
                    try {
                        win.open =
                            originalOpen;
                    }
                    catch (error) {
                        // 页面刷新后忽略。
                    }
                }
            );
        }
        catch (error) {
            // 继续使用表单target方案。
        }

        /*
         * 2. 兼容医院通过form.submit()/requestSubmit()打开新页。
         * 在检查保存阶段把_blank改为预开标签页的固定名称。
         */
        try {
            const proto =
                win.HTMLFormElement &&
                win.HTMLFormElement.prototype;

            if (proto) {
                const originalSubmit =
                    proto.submit;
                const originalRequestSubmit =
                    proto.requestSubmit;

                if (
                    typeof originalSubmit ===
                    'function'
                ) {
                    proto.submit = function () {
                        const current =
                            state.checkPopupSession;

                        if (
                            current === session &&
                            current.routeActive &&
                            !explicitSamePagePopupTarget(
                                this.target
                            )
                        ) {
                            this.target =
                                current.name;
                            current.used = true;
                            current.routeHitCount += 1;
                        }

                        return originalSubmit.apply(
                            this,
                            arguments
                        );
                    };
                }

                if (
                    typeof originalRequestSubmit ===
                    'function'
                ) {
                    proto.requestSubmit = function () {
                        const current =
                            state.checkPopupSession;

                        if (
                            current === session &&
                            current.routeActive &&
                            !explicitSamePagePopupTarget(
                                this.target
                            )
                        ) {
                            this.target =
                                current.name;
                            current.used = true;
                            current.routeHitCount += 1;
                        }

                        return originalRequestSubmit.apply(
                            this,
                            arguments
                        );
                    };
                }

                session.hooks.push(
                    function () {
                        try {
                            if (
                                typeof originalSubmit ===
                                'function'
                            ) {
                                proto.submit =
                                    originalSubmit;
                            }

                            if (
                                typeof originalRequestSubmit ===
                                'function'
                            ) {
                                proto.requestSubmit =
                                    originalRequestSubmit;
                            }
                        }
                        catch (error) {
                            // 页面刷新后忽略。
                        }
                    }
                );
            }
        }
        catch (error) {
            // 忽略。
        }

        /*
         * 3. 兼容target="_blank"的链接或按钮。
         */
        try {
            const doc =
                win.document;
            const clickCapture =
                function (event) {
                    const current =
                        state.checkPopupSession;

                    if (
                        current !== session ||
                        !current.routeActive
                    ) {
                        return;
                    }

                    const element =
                        event.target &&
                        event.target.closest
                            ? event.target.closest(
                                'a[target],button[formtarget],input[formtarget]'
                            )
                            : null;

                    if (!element) {
                        return;
                    }

                    if (
                        element.matches(
                            'a[target]'
                        ) &&
                        !explicitSamePagePopupTarget(
                            element.getAttribute(
                                'target'
                            )
                        )
                    ) {
                        element.setAttribute(
                            'target',
                            current.name
                        );
                        current.used = true;
                        current.routeHitCount += 1;
                    }

                    if (
                        element.hasAttribute(
                            'formtarget'
                        ) &&
                        !explicitSamePagePopupTarget(
                            element.getAttribute(
                                'formtarget'
                            )
                        )
                    ) {
                        element.setAttribute(
                            'formtarget',
                            current.name
                        );
                        current.used = true;
                        current.routeHitCount += 1;
                    }
                };

            doc.addEventListener(
                'click',
                clickCapture,
                true
            );

            session.hooks.push(
                function () {
                    try {
                        doc.removeEventListener(
                            'click',
                            clickCapture,
                            true
                        );
                    }
                    catch (error) {
                        // 页面刷新后忽略。
                    }
                }
            );
        }
        catch (error) {
            // 忽略。
        }
    }

    function ensureCheckPopupHooks() {
        const session =
            state.checkPopupSession;

        if (!session) {
            return;
        }

        allDocuments().forEach(
            function (doc) {
                hookCheckPopupWindow(
                    doc.defaultView
                );
            }
        );

        hookCheckPopupWindow(window);
    }

    function rememberPopupTargetChange(
        session,
        element,
        attribute,
        value
    ) {
        if (
            !session ||
            !element ||
            !element.isConnected
        ) {
            return;
        }

        const hadAttribute =
            element.hasAttribute(attribute);
        const oldValue =
            element.getAttribute(attribute);

        session.targetRestores.push(
            function () {
                try {
                    if (!element.isConnected) {
                        return;
                    }

                    if (hadAttribute) {
                        element.setAttribute(
                            attribute,
                            oldValue
                        );
                    }
                    else {
                        element.removeAttribute(
                            attribute
                        );
                    }
                }
                catch (error) {
                    // 页面刷新后忽略。
                }
            }
        );

        element.setAttribute(
            attribute,
            value
        );
    }

    function beginCheckPopupRouting(
        saveButtonElement
    ) {
        const session =
            state.checkPopupSession;

        if (
            !session ||
            !session.popup ||
            session.popup.closed
        ) {
            showStatus(
                '检查申请单专用新标签页已被关闭，医院后续弹出的页面仍可能被浏览器拦截。',
                'warning'
            );

            return null;
        }

        ensureCheckPopupHooks();
        session.routeActive = true;
        session.routeBaseline =
            session.routeHitCount;
        session.targetRestores = [];

        /*
         * 保存按钮本身若使用target/formtarget，直接改为预开标签页名称。
         */
        if (saveButtonElement) {
            if (
                saveButtonElement.matches &&
                saveButtonElement.matches(
                    'a[target]'
                )
            ) {
                rememberPopupTargetChange(
                    session,
                    saveButtonElement,
                    'target',
                    session.name
                );
                session.used = true;
            }

            if (
                saveButtonElement.hasAttribute &&
                saveButtonElement.hasAttribute(
                    'formtarget'
                )
            ) {
                rememberPopupTargetChange(
                    session,
                    saveButtonElement,
                    'formtarget',
                    session.name
                );
                session.used = true;
            }

            const form =
                saveButtonElement.form ||
                (
                    saveButtonElement.closest
                        ? saveButtonElement.closest(
                            'form'
                        )
                        : null
                );

            if (form) {
                rememberPopupTargetChange(
                    session,
                    form,
                    'target',
                    session.name
                );
                session.used = true;
            }
        }

        return session;
    }

    function checkPopupHasLeftPlaceholder(
        session
    ) {
        if (
            !session ||
            !session.popup ||
            session.popup.closed
        ) {
            return false;
        }

        try {
            const doc =
                session.popup.document;
            const body =
                doc && doc.body;
            const isPlaceholder =
                body &&
                body.getAttribute(
                    'data-clinical-pathway-check-placeholder'
                ) === '1';
            const href =
                String(
                    session.popup.location &&
                    session.popup.location.href ||
                    ''
                );

            return (
                !isPlaceholder &&
                href !== 'about:blank'
            );
        }
        catch (error) {
            /*
             * 导航到8000端口的打印页后会跨源，无法读取document，
             * 这说明医院检查申请单已经成功进入专用标签页。
             */
            return true;
        }
    }

    async function waitCheckPopupRouteActivity(
        session,
        timeout
    ) {
        if (!session) {
            return false;
        }

        const baseline =
            session.routeBaseline;
        const deadline =
            Date.now() + (timeout || 6500);

        while (Date.now() < deadline) {
            if (
                session.routeHitCount > baseline ||
                checkPopupHasLeftPlaceholder(
                    session
                )
            ) {
                return true;
            }

            await sleep(120);
        }

        return false;
    }

    function endCheckPopupRouting(session) {
        if (!session) {
            return;
        }

        session.routeActive = false;

        session.targetRestores
            .splice(0)
            .reverse()
            .forEach(
                function (restore) {
                    try {
                        restore();
                    }
                    catch (error) {
                        // 忽略。
                    }
                }
            );
    }

    function preparedCheckPopupStillPlaceholder(
        session
    ) {
        if (
            !session ||
            !session.popup ||
            session.popup.closed
        ) {
            return false;
        }

        try {
            return Boolean(
                session.popup.document &&
                session.popup.document.body &&
                session.popup.document.body.getAttribute(
                    'data-clinical-pathway-check-placeholder'
                ) === '1'
            );
        }
        catch (error) {
            /*
             * 已经导航到医院页面或其他同源/跨源页面时，
             * 无法访问document，说明它不是原占位页，应保留。
             */
            return false;
        }
    }

    function finishCheckPopupSession(
        closeUnused
    ) {
        const session =
            state.checkPopupSession;

        if (!session) {
            return;
        }

        session.routeActive = false;

        session.targetRestores
            .splice(0)
            .reverse()
            .forEach(
                function (restore) {
                    try {
                        restore();
                    }
                    catch (error) {
                        // 忽略。
                    }
                }
            );

        session.hooks
            .splice(0)
            .reverse()
            .forEach(
                function (restore) {
                    try {
                        restore();
                    }
                    catch (error) {
                        // 忽略。
                    }
                }
            );

        /*
         * 只有用户取消执行、校验失败或医院没有实际生成新页时，
         * 才关闭仍保持占位内容的空白标签页。
         * 已经显示检查申请单/打印页面的新标签页绝不关闭。
         */
        if (
            closeUnused &&
            preparedCheckPopupStillPlaceholder(
                session
            )
        ) {
            try {
                session.popup.close();
            }
            catch (error) {
                // 忽略。
            }
        }

        state.checkPopupSession = null;
    }

    function checkPopupTargetNeedsSuppression(
        target
    ) {
        const value =
            String(target || '')
                .trim()
                .toLowerCase();

        if (!value) {
            return false;
        }

        return ![
            '_self',
            '_top',
            '_parent'
        ].includes(value);
    }

    function createHiddenCheckPopupSink(doc) {
        const name =
            'medicalClinicalPathwayCheckPopupSink_' +
            Date.now().toString(36) +
            '_' +
            Math.random()
                .toString(36)
                .slice(2);

        const iframe =
            doc.createElement('iframe');

        iframe.name = name;
        iframe.setAttribute(
            'aria-hidden',
            'true'
        );
        iframe.style.cssText = [
            'position:fixed',
            'left:-10000px',
            'top:-10000px',
            'width:1px',
            'height:1px',
            'opacity:0',
            'pointer-events:none',
            'border:0'
        ].join(';');

        (
            doc.body ||
            doc.documentElement
        ).appendChild(iframe);

        return {
            name: name,
            iframe: iframe
        };
    }

    function beginCheckApplicationPopupSuppression(
        saveButtonElement
    ) {
        if (
            !state.suppressCheckApplicationPopup
        ) {
            /*
             * 未勾选时直接返回，不预开标签页、不安装钩子、
             * 不修改window.open、链接target或表单target。
             */
            return null;
        }

        const session = {
            restores: [],
            sinks: []
        };

        allDocuments().forEach(function (doc) {
            const win =
                doc.defaultView;

            if (!win) {
                return;
            }

            let sink = null;

            try {
                sink =
                    createHiddenCheckPopupSink(
                        doc
                    );
                session.sinks.push(sink);
            }
            catch (error) {
                sink = null;
            }

            /*
             * 勾选屏蔽时，将医院的window.open导入隐藏iframe，
             * 从而保留保存流程，但不显示检查申请单新标签页。
             */
            try {
                const originalOpen =
                    win.open;

                win.open = function (
                    url,
                    target,
                    features
                ) {
                    if (
                        state.suppressCheckApplicationPopup &&
                        !explicitSamePagePopupTarget(
                            target
                        )
                    ) {
                        if (
                            sink &&
                            sink.iframe &&
                            sink.iframe.isConnected &&
                            url !== undefined &&
                            url !== null &&
                            String(url).trim()
                        ) {
                            try {
                                sink.iframe.src =
                                    String(url);
                            }
                            catch (error) {
                                // 屏蔽页加载失败不影响主保存流程。
                            }
                        }

                        return sink
                            ? sink.iframe.contentWindow
                            : null;
                    }

                    return originalOpen.apply(
                        this,
                        arguments
                    );
                };

                session.restores.push(
                    function () {
                        try {
                            win.open =
                                originalOpen;
                        }
                        catch (error) {
                            // 页面刷新后忽略。
                        }
                    }
                );
            }
            catch (error) {
                // 继续处理表单和链接target。
            }

            /*
             * 兼容医院通过form.submit()/requestSubmit()
             * 向_blank或命名窗口提交申请单。
             */
            try {
                const proto =
                    win.HTMLFormElement &&
                    win.HTMLFormElement.prototype;

                if (proto && sink) {
                    const originalSubmit =
                        proto.submit;
                    const originalRequestSubmit =
                        proto.requestSubmit;

                    if (
                        typeof originalSubmit ===
                        'function'
                    ) {
                        proto.submit = function () {
                            const oldTarget =
                                this.getAttribute(
                                    'target'
                                );
                            const shouldSuppress =
                                state.suppressCheckApplicationPopup &&
                                checkPopupTargetNeedsSuppression(
                                    oldTarget
                                );

                            if (shouldSuppress) {
                                this.setAttribute(
                                    'target',
                                    sink.name
                                );
                            }

                            try {
                                return originalSubmit.apply(
                                    this,
                                    arguments
                                );
                            }
                            finally {
                                if (shouldSuppress) {
                                    if (oldTarget === null) {
                                        this.removeAttribute(
                                            'target'
                                        );
                                    }
                                    else {
                                        this.setAttribute(
                                            'target',
                                            oldTarget
                                        );
                                    }
                                }
                            }
                        };
                    }

                    if (
                        typeof originalRequestSubmit ===
                        'function'
                    ) {
                        proto.requestSubmit = function () {
                            const oldTarget =
                                this.getAttribute(
                                    'target'
                                );
                            const shouldSuppress =
                                state.suppressCheckApplicationPopup &&
                                checkPopupTargetNeedsSuppression(
                                    oldTarget
                                );

                            if (shouldSuppress) {
                                this.setAttribute(
                                    'target',
                                    sink.name
                                );
                            }

                            try {
                                return originalRequestSubmit.apply(
                                    this,
                                    arguments
                                );
                            }
                            finally {
                                if (shouldSuppress) {
                                    if (oldTarget === null) {
                                        this.removeAttribute(
                                            'target'
                                        );
                                    }
                                    else {
                                        this.setAttribute(
                                            'target',
                                            oldTarget
                                        );
                                    }
                                }
                            }
                        };
                    }

                    session.restores.push(
                        function () {
                            try {
                                if (
                                    typeof originalSubmit ===
                                    'function'
                                ) {
                                    proto.submit =
                                        originalSubmit;
                                }

                                if (
                                    typeof originalRequestSubmit ===
                                    'function'
                                ) {
                                    proto.requestSubmit =
                                        originalRequestSubmit;
                                }
                            }
                            catch (error) {
                                // 页面刷新后忽略。
                            }
                        }
                    );
                }
            }
            catch (error) {
                // 忽略。
            }

            /*
             * 兼容链接target="_blank"和按钮formtarget="_blank"。
             */
            try {
                if (sink) {
                    const clickCapture =
                        function (event) {
                            if (
                                !state.suppressCheckApplicationPopup
                            ) {
                                return;
                            }

                            const element =
                                event.target &&
                                event.target.closest
                                    ? event.target.closest(
                                        'a[target],button[formtarget],input[formtarget]'
                                    )
                                    : null;

                            if (!element) {
                                return;
                            }

                            if (
                                element.matches(
                                    'a[target]'
                                ) &&
                                checkPopupTargetNeedsSuppression(
                                    element.getAttribute(
                                        'target'
                                    )
                                )
                            ) {
                                element.setAttribute(
                                    'target',
                                    sink.name
                                );
                            }

                            if (
                                element.hasAttribute(
                                    'formtarget'
                                ) &&
                                checkPopupTargetNeedsSuppression(
                                    element.getAttribute(
                                        'formtarget'
                                    )
                                )
                            ) {
                                element.setAttribute(
                                    'formtarget',
                                    sink.name
                                );
                            }
                        };

                    doc.addEventListener(
                        'click',
                        clickCapture,
                        true
                    );

                    session.restores.push(
                        function () {
                            try {
                                doc.removeEventListener(
                                    'click',
                                    clickCapture,
                                    true
                                );
                            }
                            catch (error) {
                                // 页面刷新后忽略。
                            }
                        }
                    );
                }
            }
            catch (error) {
                // 忽略。
            }
        });

        /*
         * 保存按钮自身或其form明确指定新窗口时，
         * 勾选屏蔽后才改为隐藏iframe。
         */
        if (saveButtonElement) {
            const doc =
                saveButtonElement.ownerDocument;
            const sink =
                session.sinks.find(
                    function (entry) {
                        return (
                            entry.iframe &&
                            entry.iframe.ownerDocument ===
                                doc
                        );
                    }
                );

            if (sink) {
                const targetElements = [];

                if (
                    saveButtonElement.hasAttribute &&
                    saveButtonElement.hasAttribute(
                        'target'
                    )
                ) {
                    targetElements.push({
                        element:
                            saveButtonElement,
                        attribute: 'target'
                    });
                }

                if (
                    saveButtonElement.hasAttribute &&
                    saveButtonElement.hasAttribute(
                        'formtarget'
                    )
                ) {
                    targetElements.push({
                        element:
                            saveButtonElement,
                        attribute: 'formtarget'
                    });
                }

                const form =
                    saveButtonElement.form ||
                    (
                        saveButtonElement.closest
                            ? saveButtonElement.closest(
                                'form'
                            )
                            : null
                    );

                if (
                    form &&
                    form.hasAttribute(
                        'target'
                    )
                ) {
                    targetElements.push({
                        element: form,
                        attribute: 'target'
                    });
                }

                targetElements.forEach(
                    function (entry) {
                        const oldValue =
                            entry.element.getAttribute(
                                entry.attribute
                            );

                        if (
                            !checkPopupTargetNeedsSuppression(
                                oldValue
                            )
                        ) {
                            return;
                        }

                        entry.element.setAttribute(
                            entry.attribute,
                            sink.name
                        );

                        session.restores.push(
                            function () {
                                try {
                                    if (
                                        entry.element.isConnected
                                    ) {
                                        entry.element.setAttribute(
                                            entry.attribute,
                                            oldValue
                                        );
                                    }
                                }
                                catch (error) {
                                    // 页面刷新后忽略。
                                }
                            }
                        );
                    }
                );
            }
        }

        return session;
    }

    function endCheckApplicationPopupSuppression(
        session
    ) {
        if (!session) {
            return;
        }

        session.restores
            .splice(0)
            .reverse()
            .forEach(
                function (restore) {
                    try {
                        restore();
                    }
                    catch (error) {
                        // 忽略。
                    }
                }
            );

        session.sinks.forEach(
            function (sink) {
                try {
                    if (
                        sink.iframe &&
                        sink.iframe.isConnected
                    ) {
                        sink.iframe.remove();
                    }
                }
                catch (error) {
                    // 忽略。
                }
            }
        );
    }

    function captureElementViewportChain(element) {
        const records = [];
        const seenElements = new Set();
        const seenWindows = new Set();
        let current = element;

        function addElement(target) {
            if (
                !target ||
                seenElements.has(target)
            ) {
                return;
            }

            seenElements.add(target);

            records.push({
                type: 'element',
                target: target,
                left: Number(target.scrollLeft) || 0,
                top: Number(target.scrollTop) || 0
            });
        }

        function addWindow(win) {
            if (
                !win ||
                seenWindows.has(win)
            ) {
                return;
            }

            seenWindows.add(win);

            records.push({
                type: 'window',
                target: win,
                left:
                    Number(win.pageXOffset) ||
                    Number(
                        win.document &&
                        win.document.documentElement &&
                        win.document.documentElement.scrollLeft
                    ) ||
                    0,
                top:
                    Number(win.pageYOffset) ||
                    Number(
                        win.document &&
                        win.document.documentElement &&
                        win.document.documentElement.scrollTop
                    ) ||
                    0
            });
        }

        while (current && current.ownerDocument) {
            const doc = current.ownerDocument;
            const win = doc.defaultView;

            addWindow(win);
            addElement(doc.documentElement);
            addElement(doc.body);

            let parent = current;

            while (parent) {
                /*
                 * 记录当前元素至文档根节点之间的全部滚动容器。
                 * 即使保存前scrollLeft为0也必须记录，才能把被
                 * scrollIntoView意外改变的横向位置恢复为0。
                 */
                if (
                    parent.scrollWidth >
                        parent.clientWidth + 1 ||
                    parent.scrollHeight >
                        parent.clientHeight + 1 ||
                    parent.scrollLeft ||
                    parent.scrollTop
                ) {
                    addElement(parent);
                }

                parent = parent.parentElement;
            }

            let frameElement = null;

            try {
                frameElement = win.frameElement;
            }
            catch (error) {
                frameElement = null;
            }

            if (!frameElement) {
                break;
            }

            /*
             * 继续向上记录iframe所在父页面的滚动链。
             */
            addElement(frameElement);
            current = frameElement;
        }

        return records;
    }

    function mergeViewportStates() {
        const merged = [];
        const seen = new Set();

        Array.from(arguments).forEach(function (state) {
            (state || []).forEach(function (record) {
                if (
                    !record ||
                    !record.target ||
                    seen.has(record.target)
                ) {
                    return;
                }

                seen.add(record.target);
                merged.push(record);
            });
        });

        return merged;
    }

    function restoreElementViewportChain(records) {
        /*
         * 先恢复内层元素，再恢复外层窗口，减少父级滚动再次
         * 改变子页面位置的概率。
         */
        (records || [])
            .slice()
            .reverse()
            .forEach(function (record) {
                try {
                    if (
                        record.type === 'element' &&
                        record.target &&
                        record.target.isConnected
                    ) {
                        record.target.scrollLeft =
                            record.left;
                        record.target.scrollTop =
                            record.top;
                    }
                    else if (
                        record.type === 'window' &&
                        record.target &&
                        !record.target.closed
                    ) {
                        record.target.scrollTo(
                            record.left,
                            record.top
                        );
                    }
                }
                catch (error) {
                    // 页面刷新期间部分节点可能已失效，跳过即可。
                }
            });
    }

    function triggerCheckLayoutResize() {
        allDocuments().forEach(function (doc) {
            const win = doc.defaultView;

            try {
                /*
                 * 强制一次读取，促使浏览器完成当前布局计算。
                 */
                void doc.documentElement.offsetWidth;
                void doc.body.offsetWidth;
            }
            catch (error) {
                // 忽略。
            }

            try {
                win.dispatchEvent(
                    new win.Event(
                        'resize'
                    )
                );
            }
            catch (error) {
                // 忽略。
            }

            if (win.jQuery) {
                try {
                    win.jQuery(win).trigger(
                        'resize'
                    );
                }
                catch (error) {
                    // 忽略。
                }

                /*
                 * 医院页面可能使用EasyUI布局或标签页。
                 * 保存申请单后异步刷新时主动要求其重新计算宽度，
                 * 避免主内容区只剩半屏、右侧出现大片空白。
                 */
                try {
                    if (
                        win.jQuery.fn &&
                        typeof win.jQuery.fn.layout ===
                            'function'
                    ) {
                        win.jQuery(
                            '.easyui-layout,.layout'
                        ).each(function () {
                            try {
                                win.jQuery(this)
                                    .layout('resize');
                            }
                            catch (ignore) {
                                // 非EasyUI实例跳过。
                            }
                        });
                    }
                }
                catch (error) {
                    // 忽略。
                }

                try {
                    if (
                        win.jQuery.fn &&
                        typeof win.jQuery.fn.tabs ===
                            'function'
                    ) {
                        win.jQuery(
                            '.easyui-tabs,.tabs-container'
                        ).each(function () {
                            try {
                                win.jQuery(this)
                                    .tabs('resize');
                            }
                            catch (ignore) {
                                // 非EasyUI实例跳过。
                            }
                        });
                    }
                }
                catch (error) {
                    // 忽略。
                }
            }
        });
    }

    async function repairCheckPageLayout(
        viewportState
    ) {
        /*
         * 医院检查页面保存后会异步刷新多次。
         * 分三次恢复横纵滚动位置并触发布局重算，覆盖首次回调、
         * 数据刷新回调和标签页尺寸回调三个阶段。
         */
        restoreElementViewportChain(
            viewportState
        );
        triggerCheckLayoutResize();

        await sleep(120);

        restoreElementViewportChain(
            viewportState
        );
        triggerCheckLayoutResize();

        await sleep(260);

        restoreElementViewportChain(
            viewportState
        );
        triggerCheckLayoutResize();
    }

    function clickCheckSaveButtonWithoutScroll(
        element
    ) {
        if (!element) {
            return;
        }

        /*
         * 不再调用scrollIntoView。直接向按钮本身派发点击事件，
         * 避免浏览器为了把iframe内右下角按钮居中而横向滚动
         * 顶层工作区，造成页面被挤到左半侧。
         */
        realClick(element);
    }

    function checkSearchInput(doc) {
        const inputs = Array.from(
            doc.querySelectorAll(
                'input:not([type="hidden"]):not([disabled])'
            )
        ).filter(isVisible);

        return inputs.find(function (input) {
            const placeholder = normalize(
                input.getAttribute('placeholder') || ''
            );
            const title = normalize(
                input.getAttribute('title') || ''
            );
            const aria = normalize(
                input.getAttribute('aria-label') || ''
            );

            return (
                placeholder.includes(
                    normalize('组套名称简拼')
                ) ||
                placeholder.includes(
                    normalize('组套名称')
                ) ||
                title.includes(
                    normalize('组套名称简拼')
                ) ||
                aria.includes(
                    normalize('组套名称简拼')
                )
            );
        }) || null;
    }

    function checkTreeClickable(element) {
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

    function collectCheckTreeCandidates(term) {
        const target = normalize(term);
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

                    if (normalize(display) !== target) {
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
                        checkTreeClickable(element);

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

    async function waitCheckTreeCandidate(
        term,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 3500);

        while (Date.now() < deadline) {
            const candidates =
                collectCheckTreeCandidates(term);

            if (candidates.length) {
                return candidates[0];
            }

            await sleep(100);
        }

        return null;
    }


    function dispatchCheckSearchEnter(input) {
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

    async function submitCheckSearch(
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
        setInputValue(
            doc,
            searchInput,
            ''
        );

        await sleep(90);

        setInputValue(
            doc,
            searchInput,
            term
        );

        await sleep(120);

        dispatchCheckSearchEnter(
            searchInput
        );

        /*
         * 回车后左侧树会异步重建。固定等待一段时间，再从新DOM中
         * 重新查找目标，避免点击筛选前的旧节点。
         */
        await sleep(650);

        let candidate =
            await waitCheckTreeCandidate(
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
            dispatchCheckSearchEnter(
                searchInput
            );

            await sleep(650);

            candidate =
                await waitCheckTreeCandidate(
                    term,
                    3000
                );
        }

        return candidate;
    }

    function checkTreeExactTextTargets(
        candidate,
        term
    ) {
        const target = normalize(term);
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
                    const display = normalize(
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

            const rootText = normalize(
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
                const display = normalize(
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

    function dispatchCheckTreeNativeClick(element) {
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
        clickDocumentPoint(
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

    async function tryCheckTreeTarget(
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

        await sleep(120);

        /*
         * 正常流程只需要单击左侧具体项目，医院页面会立即把该项目
         * 引入右侧候选框。检测到右侧出现项目后立刻返回，不再重复点击。
         */
        dispatchCheckTreeNativeClick(
            element
        );

        if (await waitCheckCandidateImported(
            term,
            2600
        )) {
            return true;
        }

        /*
         * 仅在单击没有引入时补一次原生双击作为兼容兜底。
         */
        realDoubleClick(element);

        return waitCheckCandidateImported(
            term,
            2200
        );
    }


    async function activateCheckTreeCandidate(
        candidate,
        term
    ) {
        if (
            !candidate ||
            !candidate.element ||
            !candidate.element.isConnected
        ) {
            candidate =
                await waitCheckTreeCandidate(
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
            await waitCheckTreeCandidate(
                term,
                1400
            );

        if (refreshed) {
            candidate = refreshed;
        }

        const targets =
            checkTreeExactTextTargets(
                candidate,
                term
            );

        for (const target of targets) {
            if (await tryCheckTreeTarget(
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
            if (await tryCheckTreeTarget(
                target,
                term
            )) {
                return true;
            }
        }

        return false;
    }


    function findCheckSaveApplicationButton() {
        const candidates = [];

        allDocuments().forEach(function (doc) {
            const viewportWidth =
                doc.defaultView.innerWidth || 1600;
            const viewportHeight =
                doc.defaultView.innerHeight || 900;

            Array.from(doc.querySelectorAll([
                'button',
                'a',
                'input[type="button"]',
                'input[type="submit"]',
                '[role="button"]',
                '.layui-btn',
                '.btn'
            ].join(',')))
                .filter(isVisible)
                .filter(function (element) {
                    return (
                        !element.closest(
                            '#' + IDS.modal
                        ) &&
                        normalize(
                            buttonText(element)
                        ) ===
                        normalize('保存申请单')
                    );
                })
                .forEach(function (element) {
                    if (
                        element.disabled ||
                        element.getAttribute(
                            'aria-disabled'
                        ) === 'true'
                    ) {
                        return;
                    }

                    const rect =
                        element.getBoundingClientRect();
                    let score =
                        Math.abs(
                            viewportWidth -
                            rect.right
                        ) +
                        Math.abs(
                            viewportHeight -
                            rect.bottom
                        ) / 2;

                    if (
                        rect.left >
                        viewportWidth * 0.62
                    ) {
                        score -= 1800;
                    }

                    if (
                        rect.top >
                        viewportHeight * 0.65
                    ) {
                        score -= 1200;
                    }

                    candidates.push({
                        doc: doc,
                        element: element,
                        score: score
                    });
                });
        });

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        return candidates[0] || null;
    }

    function checkApplicationTableRoots() {
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

                    const headerText = normalize(
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
                    const rootText = normalize(
                        root.innerText ||
                        root.textContent
                    );

                    const upperSignature =
                        headerText.includes(
                            normalize('项目名称')
                        ) &&
                        headerText.includes(
                            normalize('数量')
                        ) &&
                        (
                            headerText.includes(
                                normalize('申请类型')
                            ) ||
                            headerText.includes(
                                normalize('项目编码')
                            ) ||
                            headerText.includes(
                                normalize('执行科室')
                            )
                        );

                    const detailSignature =
                        headerText.includes(
                            normalize('组套名称')
                        ) &&
                        headerText.includes(
                            normalize('金额')
                        ) &&
                        (
                            headerText.includes(
                                normalize('申请类型')
                            ) ||
                            headerText.includes(
                                normalize('执行科室')
                            ) ||
                            headerText.includes(
                                normalize('操作')
                            )
                        );

                    const textSignature =
                        rootText.includes(
                            normalize('已申请单明细')
                        ) ||
                        rootText.includes(
                            normalize('申请单总金额')
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

    function checkRightSideContainsImportedItem(term) {
        const target = normalize(term);

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

                    const display = normalize(
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

    function checkApplicationCandidateContains(term) {
        const target = normalize(term);

        /*
         * 这里只检查右侧上方“选择组套/候选项目”表格，
         * 用来确认左侧树项目已经真正被点击并引入右侧。
         */
        return checkApplicationTableRoots()
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
                        const display = normalize(
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

    async function waitCheckCandidateImported(
        term,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 2600);

        while (Date.now() < deadline) {
            if (
                checkRightSideContainsImportedItem(term) ||
                checkApplicationCandidateContains(term) ||
                checkApplicationDetailContains(term)
            ) {
                return true;
            }

            await sleep(90);
        }

        return false;
    }

    function checkApplicationDetailContains(term) {
        const target = normalize(term);

        return checkApplicationTableRoots().some(
            function (entry) {
                return Array.from(
                    entry.root.querySelectorAll(
                        'tr,[role="row"],.datagrid-row,td,[role="gridcell"]'
                    )
                )
                    .filter(isVisible)
                    .some(function (element) {
                        const display = normalize(
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

    function checkApplicationAmountState() {
        let foundAmountText = false;
        let amount = NaN;

        allDocuments().forEach(function (doc) {
            const viewportWidth =
                doc.defaultView.innerWidth || 1600;

            Array.from(doc.querySelectorAll(
                'div,span,p,label,td'
            ))
                .filter(isVisible)
                .forEach(function (element) {
                    if (
                        foundAmountText &&
                        Number.isFinite(amount)
                    ) {
                        return;
                    }

                    if (
                        element.closest('#' + IDS.modal) ||
                        element.closest('#' + IDS.panel) ||
                        element.closest('#' + IDS.status)
                    ) {
                        return;
                    }

                    const rect =
                        element.getBoundingClientRect();

                    if (
                        rect.right <
                        viewportWidth * 0.52
                    ) {
                        return;
                    }

                    const display = plain(
                        element.innerText ||
                        element.textContent
                    );

                    if (
                        !display.includes(
                            '申请单总金额'
                        )
                    ) {
                        return;
                    }

                    foundAmountText = true;

                    const match = display.match(
                        /申请单总金额\s*[：:]\s*[￥¥]?\s*(-?\d+(?:\.\d+)?)/i
                    );

                    if (match) {
                        amount = Number(match[1]);
                    }
                });
        });

        return {
            found: foundAmountText,
            amount: amount,
            isZero:
                foundAmountText &&
                Number.isFinite(amount) &&
                Math.abs(amount) < 0.000001
        };
    }

    function checkApplicationSnapshot(term) {
        const amountState =
            checkApplicationAmountState();

        return {
            detailContains:
                checkApplicationDetailContains(term),
            candidateContains:
                checkRightSideContainsImportedItem(term) ||
                checkApplicationCandidateContains(term),
            amountFound: amountState.found,
            amount: amountState.amount,
            amountIsZero: amountState.isZero,
            saveButton:
                findCheckSaveApplicationButton()
        };
    }

    function visibleSystemDialogEntries() {
        const entries = [];

        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll([
                '.layui-layer',
                '.modal',
                '.messager-window',
                '.window',
                '.ui-dialog',
                '.el-message-box',
                '.ant-modal',
                '[role="dialog"]'
            ].join(',')))
                .filter(isVisible)
                .forEach(function (dialog) {
                    if (
                        dialog.id === IDS.modal ||
                        dialog.id === IDS.panel ||
                        dialog.id === IDS.status ||
                        dialog.closest('#' + IDS.modal) ||
                        dialog.closest('#' + IDS.panel) ||
                        dialog.closest('#' + IDS.status)
                    ) {
                        return;
                    }

                    const textValue = plain(
                        dialog.innerText ||
                        dialog.textContent
                    );

                    if (!textValue) {
                        return;
                    }

                    const rect =
                        dialog.getBoundingClientRect();

                    entries.push({
                        doc: doc,
                        dialog: dialog,
                        text: textValue,
                        fingerprint: [
                            textValue,
                            Math.round(rect.left),
                            Math.round(rect.top),
                            Math.round(rect.width),
                            Math.round(rect.height)
                        ].join('|')
                    });
                });
        });

        return entries;
    }

    function systemDialogFingerprintSet() {
        return new Set(
            visibleSystemDialogEntries().map(
                function (entry) {
                    return entry.fingerprint;
                }
            )
        );
    }

    function newCheckSaveErrorDialog(
        baselineFingerprints
    ) {
        /*
         * 只把“本次点击保存后新出现”的明确保存错误视为失败。
         * 旧版使用“请选择|异常|错误”等宽泛词，会把其他页面提示
         * 或残留弹窗误判为检查申请单保存失败。
         */
        const concreteErrorPattern =
            /保存申请单失败|申请单保存失败|保存失败|未能保存|不能保存|请先选择(?:检查|检验|申请|项目)|请选择(?:检查项目|检验项目|申请项目|部位|方法|执行科室)|申请项目为空|缺少(?:部位|方法|执行科室)|(?:部位|方法|执行科室|申请项目)不能为空/;

        return visibleSystemDialogEntries().find(
            function (entry) {
                return (
                    !baselineFingerprints.has(
                        entry.fingerprint
                    ) &&
                    concreteErrorPattern.test(
                        entry.text
                    )
                );
            }
        ) || null;
    }

    async function waitCheckApplicationReady(
        term,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 6000);

        while (Date.now() < deadline) {
            const button =
                findCheckSaveApplicationButton();
            const imported =
                checkRightSideContainsImportedItem(term) ||
                checkApplicationCandidateContains(term) ||
                checkApplicationDetailContains(term);

            /*
             * 只要检索项目已进入右侧候选框，且“保存申请单”按钮可见，
             * 就立即允许保存，不再等待额外的二次表格状态。
             */
            if (button && imported) {
                return button;
            }

            await sleep(100);
        }

        return null;
    }

    async function dismissCheckSaveSuccess() {
        const success =
            visibleSystemDialogByText(
                /保存成功|申请单保存成功|操作成功/
            );

        if (!success) {
            return false;
        }

        return dismissSystemDialog(
            /保存成功|申请单保存成功|操作成功/
        );
    }

    async function waitCheckSaveCommitted(
        term,
        previousButton,
        baseline,
        baselineDialogs,
        timeout
    ) {
        const deadline =
            Date.now() + (timeout || 8000);

        while (Date.now() < deadline) {
            /*
             * 先判断成功状态，再判断错误。截图中的医院页面保存后
             * 会清空右侧申请项目，并把申请单总金额恢复为0.00，
             * 但“保存申请单”按钮仍然保留；这应视为保存成功。
             */
            if (await dismissCheckSaveSuccess()) {
                return {
                    ok: true,
                    reason: '检测到保存成功提示'
                };
            }

            const snapshot =
                checkApplicationSnapshot(term);

            if (
                (
                    baseline.detailContains ||
                    baseline.candidateContains
                ) &&
                !snapshot.detailContains &&
                !snapshot.candidateContains &&
                (
                    snapshot.amountIsZero ||
                    !snapshot.amountFound
                )
            ) {
                return {
                    ok: true,
                    reason:
                        snapshot.amountIsZero
                            ? '右侧候选和申请明细已清空且总金额归零'
                            : '右侧候选和申请明细已清空'
                };
            }

            if (
                baseline.amountFound &&
                Number.isFinite(baseline.amount) &&
                baseline.amount > 0 &&
                snapshot.amountIsZero
            ) {
                return {
                    ok: true,
                    reason: '申请单总金额已由正数归零'
                };
            }

            const currentButton =
                snapshot.saveButton;

            if (!currentButton) {
                return {
                    ok: true,
                    reason: '保存按钮已消失'
                };
            }

            if (
                currentButton.element.disabled ||
                currentButton.element.getAttribute(
                    'aria-disabled'
                ) === 'true'
            ) {
                return {
                    ok: true,
                    reason: '保存按钮已禁用'
                };
            }

            if (
                previousButton &&
                currentButton.element !==
                previousButton.element &&
                (
                    !snapshot.detailContains ||
                    snapshot.amountIsZero
                )
            ) {
                return {
                    ok: true,
                    reason: '申请单区域已重新加载'
                };
            }

            const errorEntry =
                newCheckSaveErrorDialog(
                    baselineDialogs
                );

            if (errorEntry) {
                return {
                    ok: false,
                    reason: errorEntry.text,
                    errorDialog:
                        errorEntry.dialog
                };
            }

            await sleep(150);
        }

        const finalSnapshot =
            checkApplicationSnapshot(term);

        if (
            !finalSnapshot.detailContains &&
            !finalSnapshot.candidateContains &&
            (
                finalSnapshot.amountIsZero ||
                !finalSnapshot.amountFound
            )
        ) {
            return {
                ok: true,
                reason: '超时复核时右侧候选和申请明细均已清空'
            };
        }

        /*
         * 未出现明确错误弹窗时，不再使用模糊词误判失败。
         * 但若明细仍保留，则提示“保存结果未确认”，避免宣称成功。
         */
        return {
            ok: false,
            reason:
                '点击保存后申请明细仍未清空，且未检测到明确成功反馈'
        };
    }

    function labDropdownKnownOptionSelectors() {
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

    function labNativePresetSelectCandidates(
        term
    ) {
        const target =
            normalize(term);
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
                                normalize(
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
                        normalize(
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

    function labVisualPresetControls() {
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
                            normalize(
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
                                normalize(
                                    '组套名称简拼'
                                )
                            ) ||
                            semanticText.includes(
                                normalize(
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
                            normalize(display) ===
                            normalize('全部')
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

    function labDropdownExactOptions(
        doc,
        term
    ) {
        const target =
            normalize(term);

        return Array.from(
            doc.querySelectorAll(
                labDropdownKnownOptionSelectors()
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
                    normalize(
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

    function labDropdownEditor(
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
                normalize([
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
                    normalize(
                        '组套名称简拼'
                    )
                ) ||
                semanticText.includes(
                    normalize(
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

    function scrollLabDropdownOptionIntoView(
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

    async function queryLabDropdownInternally(
        doc,
        control,
        term
    ) {
        const editor =
            labDropdownEditor(
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

            setInputValue(
                doc,
                editor,
                ''
            );
            await sleep(70);

            setInputValue(
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

            await sleep(520);

            let options =
                labDropdownExactOptions(
                    doc,
                    dropdownTerm
                );

            if (!options.length) {
                /*
                 * 某些组合框需按一次向下键触发筛选结果。
                 */
                pressKey(
                    editor,
                    'ArrowDown',
                    40
                );
                await sleep(260);

                options =
                    labDropdownExactOptions(
                        doc,
                        term
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

    async function selectLabPresetFromDropdown(
        dropdownTerm,
        treeTerm
    ) {
        /*
         * 第一优先：真实select的完全同名option。
         * 这是下拉菜单本体，不涉及树状列表搜索栏。
         */
        const nativeCandidates =
            labNativePresetSelectCandidates(
                dropdownTerm
            );

        for (const candidate of nativeCandidates) {
            triggerSelect(
                candidate.doc,
                candidate.select,
                candidate.option
            );

            await sleep(620);

            const treeCandidate =
                await waitCheckTreeCandidate(
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
            labVisualPresetControls();

        for (const entry of visualControls) {
            const doc =
                entry.doc;
            const control =
                entry.element;
            const editor =
                labDropdownEditor(
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

            realClick(clickTarget);
            await sleep(320);

            /*
             * 先检查当前已展开下拉列表中是否存在完全同名项。
             */
            let options =
                labDropdownExactOptions(
                    doc,
                    term
                );

            /*
             * 当前可见列表没有目标时，只在本下拉控件自身的编辑框
             * 中输入目标名称进行过滤，绝不调用“组套名称简拼”栏。
             */
            if (!options.length) {
                options =
                    await queryLabDropdownInternally(
                        doc,
                        control,
                        dropdownTerm
                    );
            }

            if (!options.length) {
                pressKey(
                    clickTarget,
                    'Escape',
                    27
                );
                await sleep(120);
                continue;
            }

            const option =
                options[0];

            scrollLabDropdownOptionIntoView(
                option
            );
            await sleep(100);

            realClick(option);
            await sleep(720);

            let treeCandidate =
                await waitCheckTreeCandidate(
                    treeTerm,
                    3600
                );

            /*
             * 某些组件选项点击后还需Enter确认当前项。
             */
            if (!treeCandidate) {
                const activeEditor =
                    labDropdownEditor(
                        control
                    );

                if (activeEditor) {
                    pressKey(
                        activeEditor,
                        'Enter',
                        13
                    );
                    await sleep(620);

                    treeCandidate =
                        await waitCheckTreeCandidate(
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

    async function findLabTreeCandidate(
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
            await selectLabPresetFromDropdown(
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
        return await waitCheckTreeCandidate(
            treeTerm,
            3600
        );
    }

    async function fillLabApplication(item) {
        await checkpoint();

        const dropdownTerm =
            String(
                item.searchName ||
                item.name ||
                ''
            ).trim();
        const treeTerm =
            String(
                item.secondarySearchName ||
                dropdownTerm
            ).trim();

        if (!dropdownTerm) {
            throw new Error(
                '检验一级/下拉检索名称为空'
            );
        }

        if (!treeTerm) {
            throw new Error(
                '检验二级目录检索名称为空'
            );
        }

        /*
         * 检验页面流程：
         * 1. 使用searchName在左上方下拉菜单选择一级检验组套；
         * 2. 使用secondarySearchName在左侧树状列表精确点击二级叶子项目；
         *    secondarySearchName留空时兼容旧组套，沿用searchName；
         * 3. 项目进入右侧候选/申请明细；
         * 4. 点击右下角“保存申请单”；
         * 5. 每项检验保存后再继续下一项。
         */
        let labViewportState =
            captureElementViewportChain(
                document.body
            );

        let candidate =
            await findLabTreeCandidate(
                dropdownTerm,
                treeTerm
            );

        if (!candidate) {
            throw new Error(
                '检验下拉菜单未找到一级组套“' +
                dropdownTerm +
                '”，或选中后左侧树未生成二级目录“' +
                treeTerm +
                '”'
            );
        }

        let imported =
            await activateCheckTreeCandidate(
                candidate,
                treeTerm
            );

        if (!imported) {
            candidate =
                await waitCheckTreeCandidate(
                    treeTerm,
                    2600
                );

            if (candidate) {
                imported =
                    await activateCheckTreeCandidate(
                        candidate,
                        treeTerm
                    );
            }
        }

        if (!imported) {
            throw new Error(
                '已在检验下拉菜单中选中一级组套“' +
                dropdownTerm +
                '”，但点击二级目录“' +
                treeTerm +
                '”后未引入右侧候选框'
            );
        }

        const saveButton =
            await waitCheckApplicationReady(
                treeTerm,
                6500
            );

        if (!saveButton) {
            throw new Error(
                '检验二级目录项目“' +
                treeTerm +
                '”未进入右侧候选框，或未找到“保存申请单”按钮'
            );
        }

        labViewportState =
            mergeViewportStates(
                labViewportState,
                captureElementViewportChain(
                    saveButton.element
                )
            );

        const beforeSave =
            checkApplicationSnapshot(
                treeTerm
            );
        const dialogBaseline =
            systemDialogFingerprintSet();

        const previousCheckSuppress =
            state.suppressCheckApplicationPopup;

        /*
         * 复用既有申请单弹页屏蔽器。
         * 在检验保存期间临时让它读取“屏蔽检验申请单”的设置，
         * 保存完成后立即恢复检查选项，不会串台。
         */
        state.suppressCheckApplicationPopup =
            state.suppressLabApplicationPopup;

        const popupSuppressionSession =
            state.suppressLabApplicationPopup
                ? beginCheckApplicationPopupSuppression(
                    saveButton.element
                )
                : null;
        const preparedPopupSession =
            state.suppressLabApplicationPopup
                ? null
                : claimNextCheckPopupSession();
        const popupRoutingSession =
            preparedPopupSession
                ? beginCheckPopupRouting(
                    saveButton.element
                )
                : null;

        if (
            !state.suppressLabApplicationPopup &&
            !popupRoutingSession
        ) {
            state.suppressCheckApplicationPopup =
                previousCheckSuppress;

            throw new Error(
                '未取得当前检验项目对应的独立申请单标签页，请重新执行并允许本站弹出式窗口'
            );
        }

        let committed;

        try {
            await sleep(140);

            clickCheckSaveButtonWithoutScroll(
                saveButton.element
            );

            committed =
                await waitCheckSaveCommitted(
                    treeTerm,
                    saveButton,
                    beforeSave,
                    dialogBaseline,
                    8000
                );

            if (popupSuppressionSession) {
                await sleep(2200);
            }
            else if (popupRoutingSession) {
                await waitCheckPopupRouteActivity(
                    popupRoutingSession,
                    6500
                );
                await sleep(220);
            }
        }
        finally {
            endCheckApplicationPopupSuppression(
                popupSuppressionSession
            );

            if (popupRoutingSession) {
                endCheckPopupRouting(
                    popupRoutingSession
                );
                finishCheckPopupSession(
                    false
                );
            }

            state.suppressCheckApplicationPopup =
                previousCheckSuppress;
        }

        if (!committed.ok) {
            if (committed.errorDialog) {
                const buttons =
                    Array.from(
                        committed.errorDialog
                            .querySelectorAll(
                                'button,a,input[type="button"],[role="button"],.layui-layer-btn a'
                            )
                    ).filter(isVisible);
                const confirm =
                    buttons.find(
                        function (button) {
                            return /^(确认|确定|知道了|关闭)$/.test(
                                plain(
                                    button.innerText ||
                                    button.textContent ||
                                    button.value
                                )
                            );
                        }
                    ) ||
                    buttons[0];

                if (confirm) {
                    realClick(confirm);
                    await sleep(220);
                }
            }

            await repairCheckPageLayout(
                labViewportState
            );

            throw new Error(
                '检验申请单保存结果未确认：' +
                committed.reason
            );
        }

        await repairCheckPageLayout(
            labViewportState
        );
        await sleep(80);

        return {
            selectedName:
                normalize(dropdownTerm) ===
                normalize(treeTerm)
                    ? treeTerm
                    : (
                        dropdownTerm +
                        ' → ' +
                        treeTerm
                    ),
            note:
                '已按一级组套“' +
                dropdownTerm +
                '”选择二级目录“' +
                treeTerm +
                '”并保存检验申请单（' +
                committed.reason +
                '）',
            selfPay: '',
            applicationSaved: true
        };
    }

    async function fillCheckApplication(item) {
        await checkpoint();

        const term = String(
            item.searchName ||
            item.name ||
            ''
        ).trim();

        if (!term) {
            throw new Error(
                '检查项目名称为空'
            );
        }

        /*
         * 检查页面不是普通可编辑医嘱表格：
         * 左侧选择一个检查项目后，右侧生成一张申请单，
         * 必须立即点击“保存申请单”，才能继续下一项。
         */
        let searchInput = null;

        allDocuments().some(function (doc) {
            searchInput =
                checkSearchInput(doc);

            return Boolean(searchInput);
        });

        /*
         * 从开始检索前记录检查页、iframe及顶层工作区的滚动位置。
         * 后续点击左侧树或保存按钮均以此作为恢复基线。
         */
        let checkViewportState =
            captureElementViewportChain(
                searchInput ||
                document.body
            );

        let candidate = null;

        if (searchInput) {
            /*
             * 检查项目必须先在检索框中按回车，医院系统才会刷新
             * 左侧树。不能在输入文字后直接从未筛选树中点击。
             */
            candidate =
                await submitCheckSearch(
                    searchInput,
                    term
                );
        }
        else {
            candidate =
                await waitCheckTreeCandidate(
                    term,
                    3600
                );
        }

        if (!candidate) {
            throw new Error(
                '检索并回车后，左侧检查项目树中未找到：' +
                term
            );
        }

        let imported =
            await activateCheckTreeCandidate(
                candidate,
                term
            );

        if (!imported) {
            /*
             * 第一次操作可能仅高亮左侧项目而未引入右侧。
             * 重新获取筛选后的叶子节点，再完整执行一次点击流程。
             */
            candidate =
                await waitCheckTreeCandidate(
                    term,
                    2400
                );

            if (candidate) {
                imported =
                    await activateCheckTreeCandidate(
                        candidate,
                        term
                    );
            }
        }

        if (!imported) {
            throw new Error(
                '已检索到左侧检查项目“' +
                term +
                '”，但点击后未引入右侧候选框'
            );
        }

        /*
         * 检索结果一旦进入右侧候选框，立即查找并点击右下角
         * “保存申请单”，不再执行其他字段填写或多余等待。
         */
        const saveButton =
            await waitCheckApplicationReady(
                term,
                6500
            );

        if (!saveButton) {
            throw new Error(
                '检查项目“' +
                term +
                '”未能进入右侧候选框，或未找到“保存申请单”按钮'
            );
        }

        /*
         * 保存按钮可能位于嵌套iframe或横向滚动容器中。
         * 合并其祖先滚动链，但不执行scrollIntoView。
         */
        checkViewportState =
            mergeViewportStates(
                checkViewportState,
                captureElementViewportChain(
                    saveButton.element
                )
            );

        /*
         * 保存前记录右侧申请区和当前可见弹窗。
         * 保存后只处理新出现的明确错误弹窗，避免把旧提示误判为失败。
         */
        const beforeSave =
            checkApplicationSnapshot(term);
        const dialogBaseline =
            systemDialogFingerprintSet();

        /*
         * 未勾选“屏蔽检查申请单”：
         * 从预开的标签页池中领取当前检查专用页，并只将本次申请单
         * 导向该页。下一项检查会领取下一个标签页，不会覆盖本项。
         *
         * 勾选后：
         * 仍使用隐藏承载页屏蔽可见申请单。
         */
        const popupSuppressionSession =
            state.suppressCheckApplicationPopup
                ? beginCheckApplicationPopupSuppression(
                    saveButton.element
                )
                : null;
        const preparedPopupSession =
            state.suppressCheckApplicationPopup
                ? null
                : claimNextCheckPopupSession();
        const popupRoutingSession =
            preparedPopupSession
                ? beginCheckPopupRouting(
                    saveButton.element
                )
                : null;

        if (
            !state.suppressCheckApplicationPopup &&
            !popupRoutingSession
        ) {
            throw new Error(
                '未取得当前检查项目对应的独立申请单标签页，请重新执行并允许本站弹出式窗口'
            );
        }

        let committed;

        try {
            await sleep(140);
            clickCheckSaveButtonWithoutScroll(
                saveButton.element
            );

            committed =
                await waitCheckSaveCommitted(
                    term,
                    saveButton,
                    beforeSave,
                    dialogBaseline,
                    8000
                );

            if (popupSuppressionSession) {
                /*
                 * 屏蔽模式覆盖医院延迟弹页。
                 */
                await sleep(2200);
            }
            else if (popupRoutingSession) {
                /*
                 * 等待当前申请单实际进入当前专用标签页。
                 * 每项检查使用不同会话，因此不会被后一项覆盖。
                 */
                await waitCheckPopupRouteActivity(
                    popupRoutingSession,
                    6500
                );
                await sleep(220);
            }
        }
        finally {
            endCheckApplicationPopupSuppression(
                popupSuppressionSession
            );

            if (popupRoutingSession) {
                endCheckPopupRouting(
                    popupRoutingSession
                );

                /*
                 * 移除当前会话钩子，但保留已经显示申请单的标签页。
                 */
                finishCheckPopupSession(false);
            }
        }

        if (!committed.ok) {
            if (committed.errorDialog) {
                const buttons = Array.from(
                    committed.errorDialog.querySelectorAll(
                        'button,a,input[type="button"],[role="button"],.layui-layer-btn a'
                    )
                ).filter(isVisible);
                const confirm =
                    buttons.find(function (button) {
                        return /^(确认|确定|知道了|关闭)$/.test(
                            plain(
                                button.innerText ||
                                button.textContent ||
                                button.value
                            )
                        );
                    }) ||
                    buttons[0];

                if (confirm) {
                    realClick(confirm);
                    await sleep(220);
                }
            }

            await repairCheckPageLayout(
                checkViewportState
            );

            throw new Error(
                '检查申请单保存结果未确认：' +
                committed.reason
            );
        }

        /*
         * 保存成功后先恢复检查页及顶层工作区布局，再继续下一项。
         * 这一步替代旧版scrollIntoView留下的横向偏移。
         */
        await repairCheckPageLayout(
            checkViewportState
        );

        /*
         * 布局修复函数已覆盖医院页面异步刷新等待，
         * 这里只保留很短的稳定时间。
         */
        await sleep(80);

        return {
            selectedName: term,
            note:
                '已逐项保存申请单（' +
                committed.reason +
                '）',
            selfPay: '',
            applicationSaved: true
        };
    }

    async function fillItem(tabName, rowIndex, item) {
        item = applySuiteSharedKnowledgeToPathItem(item);
        tabName = item.tab || tabName;
        await checkpoint();

        if (tabName === '检查') {
            return fillCheckApplication(item);
        }

        if (tabName === '检验') {
            return fillLabApplication(item);
        }

        const def = TAB_DEFS[tabName];
        const result = { selectedName: item.name, note: '', selfPay: '' };
        if (def.lookup) result.selectedName = await selectDictionary(tabName, rowIndex, item); else await setInput(tabName, rowIndex, 'name', item.name, false);

        if (tabName === '中草药') {
            const mode = herbMode(item.decoctionMode);
            const herbContext = findTableContext('中草药') ||
                await waitContext('中草药', true);
            const unifiedFooterMode =
                herbContext.entryMode === 'unified-footer';

            result.entryMode = herbContext.entryMode || 'per-row';
            result.herbFooterSettings =
                herbFooterSettingsFromItem(item);

            if (!unifiedFooterMode) {
                await setInput(
                    tabName,
                    rowIndex,
                    'groupNo',
                    item.groupNo || '1',
                    false
                );
                await setInput(
                    tabName,
                    rowIndex,
                    'doseCount',
                    item.doseCount || 7,
                    false
                );
            }

            await setInput(tabName, rowIndex, 'dose', item.dose, false);
            await setSelect(tabName, rowIndex, 'unit', item.unit || '克', false);

            if (!unifiedFooterMode) {
                await setSelect(
                    tabName,
                    rowIndex,
                    'route',
                    mode.route,
                    false
                );
            }

            if (item.selfPayMode === 'min') result.selfPay = await chooseMinimum(tabName, rowIndex, 'selfPay');

            if (!unifiedFooterMode) {
                await setSelect(
                    tabName,
                    rowIndex,
                    'decoction',
                    mode.decoction,
                    false
                );
            }

            await fillOptional(tabName, rowIndex, item);
            return result;
        }

        if (tabName === '康复医嘱') {
            /*
             * 康复医嘱真实列：
             * 长临、收费项目、执行科室、开始时间、单位、自付比例、
             * 每次治疗量、频次、天数、部位、嘱托、转自费、计费、操作。
             *
             * 必须先完成收费项目选择和依赖字段回填，再填写治疗量，
             * 最后选择频次，避免旧页面弹出“计算数量失败”。
             */
            await waitRehabRowInitialized(
                rowIndex,
                item.searchName || item.name
            );

            await setPopup(
                tabName,
                rowIndex,
                'orderType',
                item.orderType,
                true
            );

            result.department =
                await selectRehabDepartment(
                    rowIndex,
                    item.department
                );

            let treatmentAmount =
                Number(item.dose);

            if (
                !Number.isFinite(treatmentAmount) ||
                treatmentAmount <= 0
            ) {
                const context =
                    findTableContext(tabName);
                const row =
                    context &&
                    context.rows[rowIndex];
                const existing =
                    context &&
                    row
                        ? Number(
                            fieldDisplayValue(
                                context,
                                row,
                                'dose'
                            )
                        )
                        : NaN;

                treatmentAmount =
                    Number.isFinite(existing) &&
                    existing > 0
                        ? existing
                        : 1;
            }

            await setInput(
                tabName,
                rowIndex,
                'dose',
                treatmentAmount,
                false
            );

            if (item.days !== '') {
                await setInput(
                    tabName,
                    rowIndex,
                    'days',
                    item.days,
                    true
                );
            }

            if (item.bodyPart) {
                if (!await setSelect(
                    tabName,
                    rowIndex,
                    'bodyPart',
                    item.bodyPart,
                    true
                )) {
                    await setInput(
                        tabName,
                        rowIndex,
                        'bodyPart',
                        item.bodyPart,
                        true
                    );
                }
            }

            await setInput(
                tabName,
                rowIndex,
                'instruction',
                item.instruction,
                true
            );

            if (item.selfPayMode === 'min') {
                const context =
                    findTableContext(tabName);
                const row =
                    context &&
                    context.rows[rowIndex];

                if (
                    context &&
                    row &&
                    cellByField(
                        context,
                        row,
                        'selfPay'
                    )
                ) {
                    result.selfPay =
                        await chooseMinimum(
                            tabName,
                            rowIndex,
                            'selfPay'
                        );
                }
            }

            await setSelect(
                tabName,
                rowIndex,
                'transferSelfPay',
                item.transferSelfPay,
                true
            );
            await setSelect(
                tabName,
                rowIndex,
                'billing',
                item.billing,
                true
            );

            if (item.frequency) {
                const desiredFrequency =
                    normalizeFrequencyValue(
                        item.frequency
                    );

                await setFrequency(
                    tabName,
                    rowIndex,
                    desiredFrequency,
                    false
                );

                if (!await waitFieldValue(
                    tabName,
                    rowIndex,
                    'frequency',
                    desiredFrequency,
                    1800
                )) {
                    await setFrequency(
                        tabName,
                        rowIndex,
                        desiredFrequency,
                        false
                    );

                    if (!await waitFieldValue(
                        tabName,
                        rowIndex,
                        'frequency',
                        desiredFrequency,
                        1800
                    )) {
                        throw new Error(
                            '康复频次“' +
                            desiredFrequency +
                            '”未回写到当前行'
                        );
                    }
                }
            }

            if (visibleSystemDialogByText(
                /缺少执行科室/
            )) {
                await dismissSystemDialog(
                    /缺少执行科室/
                );

                throw new Error(
                    '康复执行科室未成功提交'
                );
            }

            if (visibleSystemDialogByText(
                /计算数量失败/
            )) {
                await dismissSystemDialog(
                    /计算数量失败/
                );

                throw new Error(
                    '康复项目数量计算失败：请核对执行科室、每次治疗量、频次和天数'
                );
            }

            const finalContext =
                findTableContext('康复医嘱');
            const finalRow =
                finalContext &&
                finalContext.rows[rowIndex];

            if (!finalContext || !finalRow) {
                throw new Error(
                    '康复医嘱填写后未能重新识别当前行'
                );
            }

            const finalName = plain(
                fieldDisplayValue(
                    finalContext,
                    finalRow,
                    'name'
                )
            );
            const finalDepartment = plain(
                fieldDisplayValue(
                    finalContext,
                    finalRow,
                    'department'
                )
            );
            const finalDose = Number(
                fieldDisplayValue(
                    finalContext,
                    finalRow,
                    'dose'
                )
            );

            if (!finalName) {
                throw new Error(
                    '康复收费项目未成功写入当前行'
                );
            }

            if (!finalDepartment) {
                throw new Error(
                    '康复执行科室为空，已停止该条录入'
                );
            }

            if (
                !Number.isFinite(finalDose) ||
                finalDose <= 0
            ) {
                throw new Error(
                    '康复每次治疗量为空或无效'
                );
            }

            return result;
        }

        if (tabName === '项目录入') {
            /*
             * 项目录入真实列：
             * 长临、收费项目、执行科室、单价、开始时间、单位、自付比例、
             * 每次治疗量、频次、金额、天数、部位、嘱托、转自费、计费、操作。
             */
            await waitProjectRowInitialized(
                rowIndex,
                item.searchName || item.name
            );

            await setPopup(
                tabName,
                rowIndex,
                'orderType',
                item.orderType,
                true
            );

            /*
             * 执行科室不是收费项目字典的固定回填值。
             * 必须按照路径预设，从“编号/名称”弹层中正式选择，
             * 否则医院系统在计算数量或保存时会提示缺少执行科室。
             */
            result.department =
                await selectProjectDepartment(
                    rowIndex,
                    item.department
                );

            /*
             * GUI中的“剂量”在项目页解释为“每次治疗量”。
             * 若未填写，保留院内项目默认值；默认值仍为空时补1。
             */
            let treatmentAmount =
                Number(item.dose);

            if (!Number.isFinite(treatmentAmount) ||
                treatmentAmount <= 0) {
                const context =
                    findTableContext(tabName);
                const row =
                    context &&
                    context.rows[rowIndex];
                const existing =
                    context &&
                    row
                        ? Number(
                            fieldDisplayValue(
                                context,
                                row,
                                'dose'
                            )
                        )
                        : NaN;

                treatmentAmount =
                    Number.isFinite(existing) &&
                    existing > 0
                        ? existing
                        : 1;
            }

            await setInput(
                tabName,
                rowIndex,
                'dose',
                treatmentAmount,
                false
            );

            if (item.days !== '') {
                await setInput(
                    tabName,
                    rowIndex,
                    'days',
                    item.days,
                    true
                );
            }

            if (item.bodyPart) {
                if (!await setSelect(
                    tabName,
                    rowIndex,
                    'bodyPart',
                    item.bodyPart,
                    true
                )) {
                    await setInput(
                        tabName,
                        rowIndex,
                        'bodyPart',
                        item.bodyPart,
                        true
                    );
                }
            }

            await setInput(
                tabName,
                rowIndex,
                'instruction',
                item.instruction,
                true
            );

            if (item.selfPayMode === 'min') {
                const context =
                    findTableContext(tabName);
                const row =
                    context &&
                    context.rows[rowIndex];

                if (
                    context &&
                    row &&
                    cellByField(
                        context,
                        row,
                        'selfPay'
                    )
                ) {
                    result.selfPay =
                        await chooseMinimum(
                            tabName,
                            rowIndex,
                            'selfPay'
                        );
                }
            }

            await setSelect(
                tabName,
                rowIndex,
                'transferSelfPay',
                item.transferSelfPay,
                true
            );
            await setSelect(
                tabName,
                rowIndex,
                'billing',
                item.billing,
                true
            );

            if (item.frequency) {
                await setFrequency(
                    tabName,
                    rowIndex,
                    item.frequency,
                    false
                );

                const frequencyOk =
                    await waitFieldValue(
                        tabName,
                        rowIndex,
                        'frequency',
                        normalizeFrequencyValue(
                            item.frequency
                        ),
                        1800
                    );

                if (!frequencyOk) {
                    /*
                     * 某些旧控件第一次只打开频次面板，第二次才完成回写。
                     */
                    await setFrequency(
                        tabName,
                        rowIndex,
                        item.frequency,
                        false
                    );

                    if (!await waitFieldValue(
                        tabName,
                        rowIndex,
                        'frequency',
                        normalizeFrequencyValue(
                            item.frequency
                        ),
                        1800
                    )) {
                        throw new Error(
                            '项目频次“' +
                            normalizeFrequencyValue(
                                item.frequency
                            ) +
                            '”未回写到当前行'
                        );
                    }
                }
            }

            /*
             * 若旧页面仍弹出计算错误，不静默继续。
             * 先关闭提示，再明确标记当前条失败，避免错误医嘱被自动保存。
             */
            if (visibleSystemDialogByText(
                /缺少执行科室/
            )) {
                await dismissSystemDialog(
                    /缺少执行科室/
                );

                throw new Error(
                    '执行科室未成功提交：请核对预设名称及院内科室列表'
                );
            }

            if (visibleSystemDialogByText(
                /计算数量失败/
            )) {
                await dismissSystemDialog(
                    /计算数量失败/
                );

                throw new Error(
                    '项目数量计算失败：请核对执行科室、每次治疗量、频次和天数'
                );
            }

            const finalProjectContext =
                findTableContext('项目录入');
            const finalProjectRow =
                finalProjectContext &&
                finalProjectContext.rows[rowIndex];
            const finalDepartment =
                finalProjectContext &&
                finalProjectRow
                    ? fieldDisplayValue(
                        finalProjectContext,
                        finalProjectRow,
                        'department'
                    )
                    : '';

            if (!plain(finalDepartment)) {
                throw new Error(
                    '项目执行科室为空，已停止该条录入'
                );
            }

            return result;
        }

        if (tabName === '药品录入' || tabName === '出院带药') {
            /*
             * 药品候选选中后，医院新行可能自动继承上一行组号。
             * 在填写剂量和用法前先把当前行组号同步到组套值：
             * 有值则写入，无值则明确清空。
             */
            await setMedicationGroupNumber(
                tabName,
                rowIndex,
                item.groupNo
            );

            if (item.dose !== '' && item.unit) {
                const hospital = await resolveDose(tabName, rowIndex, item);
                await setSelect(tabName, rowIndex, 'unit', hospital.unit, false);
                await setInput(tabName, rowIndex, 'dose', hospital.dose, false);
                result.note = hospital.note;
            }
            if (item.route) await setSelect(tabName, rowIndex, 'route', routeText(item.route), false);
            await fillOptional(tabName, rowIndex, item);
            if (item.selfPayMode === 'min') {
                const context = findTableContext(tabName);
                if (context && cellByField(context, context.rows[rowIndex], 'selfPay')) result.selfPay = await chooseMinimum(tabName, rowIndex, 'selfPay');
            }
            return result;
        }

        await setInput(tabName, rowIndex, 'dose', item.dose, true);
        if (item.unit) {
            if (!await setSelect(tabName, rowIndex, 'unit', item.unit, true)) await setInput(tabName, rowIndex, 'unit', item.unit, true);
        }
        if (item.route) await setSelect(tabName, rowIndex, 'route', routeText(item.route), true);
        await fillOptional(tabName, rowIndex, item);
        return result;
    }

    function findSaveButton() {
        const candidates = [];
        allDocuments().forEach(doc => {
            Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],.layui-btn,.btn')).filter(isVisible).filter(element => !element.closest('#' + IDS.modal) && normalize(buttonText(element)) === normalize('保存')).forEach(element => {
                const rect = element.getBoundingClientRect();
                const height = doc.defaultView.innerHeight;
                const width = doc.defaultView.innerWidth;
                let score = Math.abs(height - rect.bottom) + Math.abs(width - rect.right) / 8;
                if (rect.top > height * 0.68) score -= 3400;
                if (rect.left > width * 0.68) score -= 2200;
                candidates.push({ element, score });
            });
        });
        candidates.sort((a, b) => a.score - b.score);
        return candidates[0] || null;
    }

    async function saveCurrentTab() {
        const found = findSaveButton();

        if (!found) {
            throw new Error(
                '未找到页面右下角“保存”按钮'
            );
        }

        realClick(found.element);

        /*
         * 保存药品医嘱后，医院可能弹出：
         * “[药品]已在长期医嘱中使用，是否继续保存？”
         *
         * 勾选“忽略重复用药提示”时精确点击“确认”；
         * 未勾选时不自动越过该提示，并停止本次批量任务，
         * 防止弹窗遮挡后续标签页操作。
         */
        const duplicateResult =
            await settleDuplicateMedicationPromptsAfterSave();

        if (duplicateResult.blocked) {
            const error = new Error(
                state.ignoreDuplicateMedicationPrompt
                    ? (
                        duplicateResult.text ||
                        '检测到重复用药提示，但未能自动确认'
                    )
                    : '检测到重复用药提示；请人工核对并确认，或在执行区勾选“忽略重复用药提示”'
            );

            error.forceStop = true;
            throw error;
        }

        await sleep(
            duplicateResult.confirmed
                ? 320
                : 120
        );

        return duplicateResult;
    }

    /******************************************************************
     * 执行区“组套勾选范围”状态
     *
     * v1.48.10的问题：
     * “执行勾选组套”之前会调用saveGroupJson -> readGroupGui，
     * 而readGroupGui内部又会renderRunGroups。旧renderRunGroups每次
     * 都根据group.enabled重新创建复选框，因此用户刚刚取消的组套会
     * 在真正读取selectedGroups之前被重新勾上，看起来就像“默认全选”。
     *
     * 修复原则：
     * 1. 执行区复选框只表示“本次执行范围”，与group.enabled分离；
     * 2. 同一路径内无论GUI/JSON如何重绘，都保留用户当前勾选结果；
     * 3. 切换到另一条路径时，第一次仍按group.enabled初始化；
     * 4. 新增组套时，新组套按其group.enabled决定初始是否勾选。
     ******************************************************************/
    function runGroupSelectionStore(modal) {
        if (!modal) return null;

        if (!modal.pathRunGroupSelectionStore ||
            typeof modal.pathRunGroupSelectionStore !== 'object') {
            modal.pathRunGroupSelectionStore = Object.create(null);
        }

        return modal.pathRunGroupSelectionStore;
    }

    function captureRunGroupSelection(modal) {
        const pathway = currentPathway();
        const store = runGroupSelectionStore(modal);

        if (!modal || !pathway || !store) return null;

        const pathwayId = String(pathway.id || '');
        const boxes = Array.from(
            modal.querySelectorAll('.path-run-group')
        );
        const renderedPathwayId = String(
            modal.dataset.pathRunGroupsPathwayId || ''
        );
        let record = store[pathwayId];

        if (!record) {
            record = {
                selected: new Set(),
                known: new Set()
            };
            store[pathwayId] = record;
        }

        /*
         * 只有当前DOM确实属于同一条路径时，才用界面复选框覆盖记录。
         * 这样切换路径时不会把上一条路径的选择误带到新路径。
         */
        if (renderedPathwayId === pathwayId && boxes.length) {
            const visibleIds = new Set();

            boxes.forEach(function (box) {
                const id = String(box.value || '');
                if (!id) return;

                visibleIds.add(id);
                record.known.add(id);

                if (box.checked) {
                    record.selected.add(id);
                }
                else {
                    record.selected.delete(id);
                }
            });

            /*
             * 当前路径已经删除的组套同时从执行范围记录中清理。
             */
            Array.from(record.known).forEach(function (id) {
                const stillExists = pathway.groups.some(function (group) {
                    return String(group.id || '') === id;
                });

                if (!stillExists) {
                    record.known.delete(id);
                    record.selected.delete(id);
                }
            });
        }

        /*
         * 首次出现的组套才读取group.enabled作为默认值。
         * 一旦用户手工勾选/取消，此后重绘绝不再用group.enabled覆盖。
         */
        pathway.groups.forEach(function (group) {
            const id = String(group.id || '');
            if (!id || record.known.has(id)) return;

            record.known.add(id);
            if (group.enabled !== false) {
                record.selected.add(id);
            }
        });

        return record;
    }

    function selectedGroups(modal) {
        const pathway = currentPathway();
        if (!pathway) return [];

        const record = captureRunGroupSelection(modal);
        if (!record) return [];

        return pathway.groups.filter(function (group) {
            return record.selected.has(String(group.id || ''));
        });
    }

    function updateStatus(item, text, type) {
        item.status = text;
        const modal = document.getElementById(IDS.modal);
        if (!modal) return;
        const rows = Array.from(modal.querySelectorAll('.path-status-row'));
        const row = rows.find(element => element.dataset.itemId === item.id);
        if (row) {
            row.textContent = item.name + '：' + text;
            row.dataset.type = type || '';
        }
        const guiRows = Array.from(modal.querySelectorAll('.path-gui-row'));
        const guiRow = guiRows.find(element => element.dataset.itemId === item.id);
        const guiStatus = guiRow && guiRow.querySelector('.path-gui-status');
        if (guiStatus) {
            guiStatus.textContent = text;
            guiStatus.dataset.type = type || '';
        }

        const importRow = modal.querySelector(
            '.path-order-import-row[data-item-id="' +
            CSS.escape(item.id) + '"]'
        );
        const importStatus = importRow && importRow.querySelector(
            '.path-order-import-row-status'
        );
        if (importStatus) {
            importStatus.textContent = text;
            importStatus.dataset.type = type || orderImportStatusType(text);
        }
    }

    async function scanPathway(modal) {
        if (state.running) return;
        const groups = selectedGroups(modal);
        const items = groups.flatMap(group => group.items.filter(item => item.enabled));
        const tabs = TAB_NAMES.filter(tab => items.some(item => item.tab === tab));
        if (!tabs.length) return showStatus('勾选组套没有启用的医嘱条目。', 'warning');
        state.running = true;
        state.abortRequested = false;
        state.scanResults = [];
        updateRunButtons(modal);
        try {
            for (const tab of tabs) {
                await checkpoint();
                showStatus('正在扫描：' + tab);
                try {
                    const context = await activateTab(tab);
                    state.scanResults.push({ tab, ok: true, rows: context.rows.length, headers: headerElements(context.table).map(element => plain(element.innerText || element.textContent)).filter(Boolean) });
                } catch (error) {
                    state.scanResults.push({ tab, ok: false, rows: 0, headers: [], error: error.message });
                }
                renderScan(modal);
            }
            showStatus('扫描完成，请核对各标签页表头。', 'success');
        } finally {
            state.running = false;
            updateRunButtons(modal);
        }
    }

    function buildOrderedExecutionPlan(groups) {
        const entries = [];

        /*
         * “序”列本身是组套items数组的显示顺序。
         * 这里显式记录组套顺序和行序号，避免后续按标签页分组时
         * 把第8行提前到第1行之前执行。
         *
         * 多个组套同时勾选时：
         * 1. 先按组套在路径中的排列顺序；
         * 2. 每个组套内部严格按1、2、3……递增。
         */
        groups.forEach(function (group, groupIndex) {
            group.items.forEach(function (item, itemIndex) {
                if (!item.enabled) {
                    return;
                }

                entries.push({
                    group: group,
                    item: item,
                    groupIndex: groupIndex,
                    sequence: itemIndex + 1
                });
            });
        });

        entries.sort(function (a, b) {
            if (a.groupIndex !== b.groupIndex) {
                return a.groupIndex - b.groupIndex;
            }

            return a.sequence - b.sequence;
        });

        entries.forEach(function (entry, index) {
            entry.executionIndex = index + 1;
        });

        return entries;
    }

    function firstBlankOrderRowIndex(
        context
    ) {
        if (!context) {
            return -1;
        }

        for (
            let index = 0;
            index < context.rows.length;
            index += 1
        ) {
            const row = context.rows[index];
            const name = plain(
                fieldDisplayValue(
                    context,
                    row,
                    'name'
                )
            );

            /*
             * 已保存医嘱通常有名称且不可再作为新医嘱行使用；
             * 新建但尚未填写的草稿行名称为空。
             */
            if (!name) {
                return index;
            }
        }

        return -1;
    }

    async function resolveExecutionDraftRow(
        tabName,
        relativeIndex,
        tabDraftBases
    ) {
        let context =
            await waitContext(
                tabName,
                false
            );
        let baseIndex =
            tabDraftBases[tabName];

        /*
         * 每次保存后会删除该标签页的草稿基准。
         * 再次进入时重新观察当前页面，而不是继续沿用保存前的行号。
         */
        if (!Number.isInteger(baseIndex)) {
            baseIndex =
                firstBlankOrderRowIndex(
                    context
                );

            if (baseIndex < 0) {
                const beforeCount =
                    context.rows.length;

                /*
                 * 当前页面只有已保存行，或保存后页面已完全清空。
                 * 只创建一条新的草稿行，不把已保存行数叠加到
                 * 本轮需要新建的行数中。
                 */
                await ensureRows(
                    tabName,
                    beforeCount + 1
                );

                context =
                    await waitContext(
                        tabName,
                        false
                    );

                baseIndex =
                    firstBlankOrderRowIndex(
                        context
                    );

                if (baseIndex < 0) {
                    /*
                     * 少数页面新建行后名称单元格尚未完成渲染，
                     * 使用新增前的实际行数作为新草稿起点。
                     */
                    baseIndex =
                        Math.min(
                            beforeCount,
                            Math.max(
                                0,
                                context.rows.length - 1
                            )
                        );
                }
            }

            tabDraftBases[tabName] =
                baseIndex;
        }

        const absoluteRowIndex =
            baseIndex + relativeIndex;

        await ensureRows(
            tabName,
            absoluteRowIndex + 1
        );

        return absoluteRowIndex;
    }

    async function runPathway(modal, lifecycle, directOptions) {
        if (state.running) return;

        const directExecution = Boolean(
            directOptions &&
            Array.isArray(directOptions.items)
        );

        if (!directExecution && !saveGroupJson(modal, false)) {
            showStatus(
                isGroupDraftDirty(modal)
                    ? '当前组套存在未保存修改，请先点击“保存当前组套”后再执行。'
                    : '当前组套编辑内容存在错误，请修正后再执行。',
                isGroupDraftDirty(modal)
                    ? 'warning'
                    : 'error'
            );
            return;
        }

        const pathway = currentPathway();
        const groups = directExecution
            ? [{
                id: 'order-import-direct-execution',
                name: directOptions.groupName || '本次已勾选解析结果',
                enabled: true,
                items: directOptions.items
            }]
            : selectedGroups(modal);
        const entries =
            buildOrderedExecutionPlan(groups);

        if (!entries.length) {
            return showStatus(
                '没有可执行的医嘱条目。',
                'error'
            );
        }

        const invalid = entries.filter(function (entry) {
            return (
                !entry.item.name ||
                !TAB_NAMES.includes(entry.item.tab)
            );
        });

        if (invalid.length) {
            return showStatus(
                '存在名称为空或标签页无效的条目。',
                'error'
            );
        }

        const autoSave =
            modal.querySelector(
                '.path-auto-save'
            ).checked;
        const continueError =
            modal.querySelector(
                '.path-continue-error'
            ).checked;
        const ignoreDuplicateMedicationPrompt =
            modal.querySelector(
                '.path-ignore-duplicate-medication'
            ).checked;
        const suppressCheckApplicationPopup =
            modal.querySelector(
                '.path-suppress-check-popup'
            ).checked;
        const suppressLabApplicationPopup =
            modal.querySelector(
                '.path-suppress-lab-popup'
            ).checked;

        state.ignoreDuplicateMedicationPrompt =
            ignoreDuplicateMedicationPrompt;
        state.suppressCheckApplicationPopup =
            suppressCheckApplicationPopup;
        state.suppressLabApplicationPopup =
            suppressLabApplicationPopup;
        state.duplicateMedicationPromptConfirmCount = 0;

        const counts = {};

        entries.forEach(function (entry) {
            counts[entry.item.tab] =
                (counts[entry.item.tab] || 0) + 1;
        });

        const hasCheckOrders = entries.some(
            function (entry) {
                return entry.item.tab === '检查';
            }
        );
        const hasLabOrders = entries.some(
            function (entry) {
                return entry.item.tab === '检验';
            }
        );
        const hasApplicationOrders =
            hasCheckOrders ||
            hasLabOrders;
        const orderPreview = entries
            .slice(0, 12)
            .map(function (entry) {
                return (
                    entry.executionIndex +
                    '. ' +
                    (
                        groups.length > 1
                            ? '[' +
                              entry.group.name +
                              ' 第' +
                              entry.sequence +
                              '行] '
                            : '[第' +
                              entry.sequence +
                              '行] '
                    ) +
                    entry.item.tab +
                    '－' +
                    entry.item.name
                );
            });
        const hiddenCount =
            Math.max(
                0,
                entries.length - orderPreview.length
            );
        const saveNotice = [
            autoSave
                ? '跨标签页前将保存当前普通医嘱页；再次返回该标签页时从新的草稿首行继续，不重复计算已保存行数。'
                : '普通标签页仅填写，不自动保存。',
            counts['中草药']
                ? '中草药将自动识别新版“药味逐行录入＋底部统一处方参数”和旧版逐行设置；新版在离开或保存该页前统一填写剂数、用法、代煎等字段。'
                : '',
            hasCheckOrders
                ? (
                    suppressCheckApplicationPopup
                        ? '已勾选“屏蔽检查申请单”：保存检查后临时屏蔽医院弹出的申请单页面。'
                        : '未勾选“屏蔽检查申请单”：每项检查使用独立申请单标签页，互不覆盖。'
                  )
                : '',
            hasLabOrders
                ? (
                    suppressLabApplicationPopup
                        ? '已勾选“屏蔽检验申请单”：保存检验后临时屏蔽医院弹出的申请单页面。'
                        : '未勾选“屏蔽检验申请单”：每项检验使用独立申请单标签页，互不覆盖。'
                  )
                : '',
            ignoreDuplicateMedicationPrompt
                ? '已勾选“忽略重复用药提示”：仅遇到“已在长期/临时医嘱中使用，是否继续保存”时自动点击确认并继续。'
                : '未勾选“忽略重复用药提示”：出现重复用药提示时停止批量任务，等待人工核对。',
            '执行顺序严格按组套GUI“序”列递增，不再按标签页重新排序。'
        ].filter(Boolean).join('\n');
        const message = [
            '准备执行：' + (
                directExecution
                    ? (directOptions.executionName || '住院医嘱解析结果')
                    : (pathway ? pathway.name : '当前临床路径')
            ),
            directExecution
                ? '来源患者：' +
                    (directOptions.sourcePatientLabel || '未记录')
                : '',
            directExecution
                ? '执行患者：' +
                    (directOptions.targetPatientLabel || '未识别')
                : '',
            '组套：' +
                groups.map(function (group) {
                    return group.name;
                }).join('、'),
            '共' + entries.length + '条医嘱。',
            Object.keys(counts)
                .map(function (tab) {
                    return (
                        tab +
                        '：' +
                        counts[tab] +
                        '条'
                    );
                })
                .join('\n'),
            '',
            '前' +
                Math.min(
                    entries.length,
                    orderPreview.length
                ) +
                '条执行顺序：',
            orderPreview.join('\n') +
                (
                    hiddenCount
                        ? '\n……另有' +
                          hiddenCount +
                          '条，继续按序号递增。'
                        : ''
                ),
            '',
            saveNotice,
            '请确认当前患者及路径版本正确。'
        ].join('\n');

        if (!window.confirm(message)) {
            return false;
        }

        /*
         * 确认后、第一次await之前执行预开标签页。
         * lifecycle返回false时停止任务，防止申请单标签页数量不足
         * 仍继续保存检查。
         */
        if (
            lifecycle &&
            typeof lifecycle.afterConfirm ===
                'function'
        ) {
            const ready =
                lifecycle.afterConfirm({
                    entries: entries,
                    hasCheckOrders:
                        hasCheckOrders,
                    hasLabOrders:
                        hasLabOrders,
                    hasApplicationOrders:
                        hasApplicationOrders,
                    suppressCheckApplicationPopup:
                        suppressCheckApplicationPopup,
                    suppressLabApplicationPopup:
                        suppressLabApplicationPopup
                });

            if (ready === false) {
                return false;
            }
        }

        state.running = true;
        state.paused = false;
        state.abortRequested = false;
        updateRunButtons(modal);

        entries.forEach(function (entry) {
            updateStatus(
                entry.item,
                '等待执行（组套第' +
                    entry.sequence +
                    '行）',
                ''
            );
        });

        const successes = [];
        const failures = [];

        /*
         * tabRowCounters只统计“当前尚未保存的本轮草稿行”。
         * tabDraftBases记录这些草稿行在当前页面表格中的绝对起点。
         */
        const tabRowCounters = {};
        const tabDraftBases = {};
        let activeExecutionTab = '';
        let unifiedHerbDraftSettings = null;
        let pendingUnifiedHerbFooterSettings = null;

        TAB_NAMES.forEach(function (tab) {
            tabRowCounters[tab] = 0;
            tabDraftBases[tab] = undefined;
        });

        function validateUnifiedHerbItemSettings(item) {
            const context = findTableContext('中草药');

            if (!context || context.entryMode !== 'unified-footer') {
                return;
            }

            const nextSettings = herbFooterSettingsFromItem(item);

            if (unifiedHerbDraftSettings &&
                !herbFooterSettingsEqual(
                    unifiedHerbDraftSettings,
                    nextSettings
                )) {
                const error = new Error(
                    '新版中草药页面的剂数、用法、代煎等参数只能整张处方统一设置。' +
                    '当前未保存处方为“' +
                    herbFooterSettingsText(unifiedHerbDraftSettings) +
                    '”，药味“' + item.name + '”却设置为“' +
                    herbFooterSettingsText(nextSettings) +
                    '”。请将不同处方参数的中药拆分保存后再执行。'
                );

                error.forceStop = true;
                throw error;
            }
        }

        function recordUnifiedHerbItemSettings(result, item) {
            if (!result || result.entryMode !== 'unified-footer') {
                return;
            }

            const settings = result.herbFooterSettings ||
                herbFooterSettingsFromItem(item);

            if (!unifiedHerbDraftSettings) {
                unifiedHerbDraftSettings = settings;
            }

            pendingUnifiedHerbFooterSettings = settings;
        }

        async function applyPendingUnifiedHerbFooter() {
            if (!pendingUnifiedHerbFooterSettings) return;

            const context = findTableContext('中草药');

            if (!context || context.entryMode !== 'unified-footer') {
                const error = new Error(
                    '药味录入后未能重新识别新版中草药表格，无法设置页面底部统一处方参数'
                );

                error.forceStop = true;
                throw error;
            }

            try {
                await applyUnifiedHerbFooterSettings(
                    context,
                    pendingUnifiedHerbFooterSettings
                );
                pendingUnifiedHerbFooterSettings = null;
            }
            catch (error) {
                error.forceStop = true;
                throw error;
            }
        }

        async function saveActiveOrdinaryTabBeforeSwitch(
            nextTab
        ) {
            if (
                !activeExecutionTab ||
                activeExecutionTab === nextTab ||
                isApplicationTab(
                    activeExecutionTab
                )
            ) {
                return;
            }

            try {
                if (activeExecutionTab === '中草药') {
                    await applyPendingUnifiedHerbFooter();
                }

                if (!autoSave) {
                    return;
                }

                showStatus(
                    '正在保存：' +
                    activeExecutionTab +
                    '\n保存后按序号继续执行。'
                );

                await saveCurrentTab();

                /*
                 * 保存成功后，医院会清空或重建当前标签页的草稿表格。
                 * 之前已保存的4行、5行等不应成为下一轮新建行的偏移量。
                 */
                tabRowCounters[
                    activeExecutionTab
                ] = 0;
                tabDraftBases[
                    activeExecutionTab
                ] = undefined;

                if (activeExecutionTab === '中草药') {
                    unifiedHerbDraftSettings = null;
                    pendingUnifiedHerbFooterSettings = null;
                }
            }
            catch (error) {
                const message =
                    activeExecutionTab +
                    '保存失败：' +
                    error.message;

                failures.push(message);

                if (
                    error.forceStop ||
                    !continueError
                ) {
                    throw error;
                }
            }
        }

        try {
            for (
                let planIndex = 0;
                planIndex < entries.length;
                planIndex += 1
            ) {
                await checkpoint();

                const entry = entries[planIndex];
                const item = entry.item;
                const tab = item.tab;

                /*
                 * 先保存上一普通标签页，再切换到当前序号指定的标签页。
                 * 因此执行顺序完全由GUI行号决定，而不是TAB_NAMES决定。
                 */
                if (activeExecutionTab !== tab) {
                    await saveActiveOrdinaryTabBeforeSwitch(
                        tab
                    );

                    await activateTab(tab);
                    activeExecutionTab = tab;
                }

                /*
                 * 各标签页只累计“当前未保存草稿”的相对行号。
                 * 如果中途已经保存并离开文字录入，再返回时从新的
                 * 第1条草稿开始，不会按保存前4条文字医嘱再补4个空白行。
                 */
                const relativeRowIndex =
                    tabRowCounters[tab] || 0;
                let rowIndex =
                    relativeRowIndex;

                if (!isApplicationTab(tab)) {
                    rowIndex =
                        await resolveExecutionDraftRow(
                            tab,
                            relativeRowIndex,
                            tabDraftBases
                        );
                }

                /*
                 * 即使当前条失败，也不复用这一草稿位置，避免下一条
                 * 覆盖已经部分填写的错误行。
                 */
                tabRowCounters[tab] =
                    relativeRowIndex + 1;

                updateStatus(
                    item,
                    '正在执行 ' +
                        (planIndex + 1) +
                        '/' +
                        entries.length +
                        '（组套第' +
                        entry.sequence +
                        '行）',
                    'warning'
                );
                showStatus(
                    '按组套序号执行：' +
                        (planIndex + 1) +
                        '/' +
                        entries.length +
                        '\n组套第' +
                        entry.sequence +
                        '行｜' +
                        tab +
                        '\n' +
                        item.name
                );

                try {
                    if (tab === '中草药') {
                        validateUnifiedHerbItemSettings(item);
                    }

                    const result =
                        await fillItem(
                            tab,
                            rowIndex,
                            item
                        );

                    if (tab === '中草药') {
                        recordUnifiedHerbItemSettings(
                            result,
                            item
                        );
                    }

                    const extra = [
                        result.note
                            ? (
                                isApplicationTab(tab)
                                    ? result.note
                                    : '剂量换算：' +
                                      result.note
                            )
                            : '',
                        result.selfPay
                            ? '自付比例：' +
                              result.selfPay
                            : ''
                    ].filter(Boolean).join('；');

                    updateStatus(
                        item,
                        (
                            isApplicationTab(tab)
                                ? '已开立并保存申请单'
                                : '已填入'
                        ) +
                        '（组套第' +
                        entry.sequence +
                        '行，第' +
                        (planIndex + 1) +
                        '项完成）' +
                        (
                            extra
                                ? '（' + extra + '）'
                                : ''
                        ),
                        'success'
                    );

                    successes.push(item);
                }
                catch (error) {
                    updateStatus(
                        item,
                        '失败（组套第' +
                            entry.sequence +
                            '行）：' +
                            error.message,
                        'error'
                    );
                    failures.push(
                        '第' +
                            entry.sequence +
                            '行 ' +
                            tab +
                            '－' +
                            item.name +
                            '：' +
                            error.message
                    );

                    if (
                        error.forceStop ||
                        !continueError
                    ) {
                        throw error;
                    }
                }
            }

            /*
             * 最后一项执行完毕后：
             * 1. 若停留在新版中草药页，先统一设置底部处方参数；
             * 2. 开启自动保存时，再保存最后停留的普通医嘱页。
             */
            if (
                activeExecutionTab &&
                !isApplicationTab(
                    activeExecutionTab
                ) &&
                (
                    autoSave ||
                    activeExecutionTab === '中草药'
                )
            ) {
                try {
                    if (activeExecutionTab === '中草药') {
                        await applyPendingUnifiedHerbFooter();
                    }

                    if (autoSave) {
                        showStatus(
                            '正在保存最后一个标签页：' +
                                activeExecutionTab
                        );

                        await saveCurrentTab();

                        tabRowCounters[
                            activeExecutionTab
                        ] = 0;
                        tabDraftBases[
                            activeExecutionTab
                        ] = undefined;

                        if (activeExecutionTab === '中草药') {
                            unifiedHerbDraftSettings = null;
                            pendingUnifiedHerbFooterSettings = null;
                        }
                    }
                }
                catch (error) {
                    const message =
                        activeExecutionTab +
                        (
                            autoSave
                                ? '保存失败：'
                                : '底部统一处方参数设置失败：'
                        ) +
                        error.message;

                    failures.push(message);

                    if (
                        error.forceStop ||
                        !continueError
                    ) {
                        throw error;
                    }
                }
            }

            if (hasApplicationOrders) {
                /*
                 * 所有按序执行完成后，再做一次检查/检验页相关布局重算。
                 */
                triggerCheckLayoutResize();
                await sleep(120);
                triggerCheckLayoutResize();
            }
        }
        catch (error) {
            if (
                error.name !== 'AbortError' &&
                !failures.includes(error.message)
            ) {
                failures.push(error.message);
            }
        }
        finally {
            state.running = false;
            state.paused = false;
            state.abortRequested = false;
            state.ignoreDuplicateMedicationPrompt = false;
            if (!directExecution) {
                saveLibrary();

                modal.dataset.pathDraftGroupId = '';
                groupDraftItems(modal);

                renderStatusList(modal);
                renderGroupGui(modal);
                syncJsonFromGroup(
                    modal,
                    '执行状态已同步到GUI和JSON。'
                );
            }
            updateRunButtons(modal);
        }

        if (failures.length) {
            showStatus(
                '按组套序号执行完成。成功' +
                    successes.length +
                    '条，失败' +
                    failures.length +
                    '条。\n' +
                    failures.join('\n') +
                    (
                        state.duplicateMedicationPromptConfirmCount
                            ? '\n已自动确认重复用药提示' +
                              state.duplicateMedicationPromptConfirmCount +
                              '次。'
                            : ''
                    ) +
                    '\n已填写内容保留，请人工逐页核对。',
                'error'
            );
        }
        else {
            const applicationSavedText = [
                hasCheckOrders
                    ? '检查申请单已逐项保存'
                    : '',
                hasLabOrders
                    ? '检验申请单已逐项保存'
                    : ''
            ].filter(Boolean).join('；');

            const saveText = autoSave
                ? (
                    '普通医嘱页已在跨页时保存' +
                    (
                        applicationSavedText
                            ? '；' +
                              applicationSavedText +
                              '。'
                            : '。'
                    )
                  )
                : (
                    hasApplicationOrders
                        ? applicationSavedText +
                          '；其余页面未自动保存，请人工核对后保存。'
                        : '未自动保存，请人工逐页核对后保存。'
                );

            showStatus(
                '按组套序号执行完成，共填写' +
                    successes.length +
                    '条医嘱。\n' +
                    saveText +
                    (
                        state.duplicateMedicationPromptConfirmCount
                            ? '\n已自动确认重复用药提示' +
                              state.duplicateMedicationPromptConfirmCount +
                              '次。'
                            : ''
                    ),
                autoSave || hasApplicationOrders
                    ? 'success'
                    : 'warning'
            );
        }

        return {
            started: true,
            successes: successes.length,
            failures: failures.slice(),
            autoSave: autoSave,
            hasApplicationOrders: hasApplicationOrders
        };
    }


    function option(value, text) {
        const element = document.createElement('option');
        element.value = value;
        element.textContent = text;
        return element;
    }


    /******************************************************************
     * GUI与JSON双编辑器（草稿模式）
     *
     * 规则：
     * 1. GUI与JSON实时双向同步，但只修改当前组套草稿；
     * 2. 只有点击“保存当前组套”才将草稿写入GM存储；
     * 3. JSON语法错误时不覆盖当前草稿；
     * 4. 执行和扫描前必须先保存当前组套；
     * 5. 关闭窗口或刷新页面后恢复最近一次正式保存版本。
     ******************************************************************/

    function comparableGroupItems(items) {
        return (Array.isArray(items) ? items : []).map(function (item) {
            const normalized = normalizeItem(item);
            normalized.status = '';
            return normalized;
        });
    }

    function groupDraftItems(modal) {
        const group = currentGroup();
        if (!modal || !group) return [];

        if (
            modal.dataset.pathDraftGroupId !== group.id ||
            !Array.isArray(modal.pathGroupDraftItems)
        ) {
            modal.dataset.pathDraftGroupId = group.id;
            modal.pathGroupDraftItems = clone(group.items || []);
            modal.dataset.pathGroupDraftDirty = 'false';
        }

        return modal.pathGroupDraftItems;
    }

    function isGroupDraftDirty(modal) {
        return Boolean(
            modal &&
            modal.dataset.pathGroupDraftDirty === 'true'
        );
    }

    function refreshGroupDraftDirty(modal, statusMessage) {
        if (!modal) return false;

        const group = currentGroup();
        const draft = groupDraftItems(modal);
        const dirty = Boolean(
            group &&
            JSON.stringify(comparableGroupItems(draft)) !==
            JSON.stringify(comparableGroupItems(group.items))
        );

        modal.dataset.pathGroupDraftDirty = dirty ? 'true' : 'false';

        const button = modal.querySelector('.path-save-json');
        if (button) {
            /*
             * 保存按钮始终保持原有文字和原有样式。
             * 未保存状态仅通过编辑区状态提示呈现，
             * 不再修改按钮颜色、类名或按钮名称。
             */
            button.classList.remove('dirty');
            button.textContent = '保存当前组套';
            button.title = '保存当前组套';
        }

        if (statusMessage) {
            editorStatus(
                modal,
                dirty
                    ? statusMessage + ' 当前修改尚未保存。'
                    : statusMessage,
                dirty ? 'warning' : 'success'
            );
        }

        return dirty;
    }

    function setGroupDraftItems(modal, items, statusMessage) {
        const group = currentGroup();
        if (!modal || !group) return false;

        modal.dataset.pathDraftGroupId = group.id;
        modal.pathGroupDraftItems = (Array.isArray(items) ? items : [])
            .map(normalizeItem);

        refreshGroupDraftDirty(modal, statusMessage);
        return true;
    }

    function resetGroupDraft(modal, show) {
        const group = currentGroup();
        if (!modal || !group) return false;

        modal.dataset.pathDraftGroupId = group.id;
        modal.pathGroupDraftItems = clone(group.items || []);
        modal.dataset.pathGroupDraftDirty = 'false';
        modal.dataset.pathSelectedItemId = '';

        renderGroupGui(modal);
        syncJsonFromGroup(modal, '已恢复上次保存版本。');
        renderRunGroups(modal);
        renderStatusList(modal);
        refreshGroupDraftDirty(modal);

        if (show !== false) {
            showStatus(
                '未保存修改已放弃，已恢复上次保存版本。',
                'warning'
            );
        }
        return true;
    }

    function commitCurrentGroup(modal, show) {
        if (!saveCurrentEditor(modal, false)) {
            if (show !== false) {
                showStatus('当前编辑内容存在错误，无法保存组套。', 'error');
            }
            return false;
        }

        const group = currentGroup();
        if (!group) return false;

        group.items = clone(groupDraftItems(modal));
        saveLibrary();

        modal.dataset.pathDraftGroupId = group.id;
        modal.pathGroupDraftItems = clone(group.items);
        modal.dataset.pathGroupDraftDirty = 'false';

        syncJsonFromGroup(modal, '当前组套已写入油猴存储。');
        renderRunGroups(modal);
        renderStatusList(modal);
        refreshGroupDraftDirty(modal);

        if (show !== false) {
            showStatus('当前组套已保存。', 'success');
        }
        return true;
    }

    function requireSavedCurrentGroup(modal, actionName) {
        if (!saveCurrentEditor(modal, false)) {
            showStatus(
                '当前组套内容存在错误，无法' + (actionName || '继续') + '。',
                'error'
            );
            return false;
        }

        if (isGroupDraftDirty(modal)) {
            showStatus(
                '当前组套存在未保存修改。请先点击“保存当前组套”，再' +
                (actionName || '继续') + '。',
                'warning'
            );
            return false;
        }

        return true;
    }

    function editorMode(modal) {
        return modal && modal.dataset.pathEditorMode === 'json'
            ? 'json'
            : 'gui';
    }

    function editorStatus(modal, message, type) {
        const box = modal && modal.querySelector('.path-editor-status');
        if (!box) return;
        box.textContent = message || '';
        box.dataset.type = type || '';
    }

    function makeGuiInput(className, value, type) {
        const input = document.createElement('input');
        input.className = className;
        input.type = type || 'text';
        if (type !== 'checkbox') input.value = value === undefined || value === null ? '' : String(value);
        return input;
    }

    function makeGuiSelect(className, values, selectedValue) {
        const select = document.createElement('select');
        select.className = className;
        values.forEach(value => select.appendChild(option(value, value)));
        if (selectedValue && !values.includes(selectedValue)) select.appendChild(option(selectedValue, selectedValue));
        select.value = selectedValue || values[0] || '';
        return select;
    }

    function appendGuiCell(row, child, className) {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.appendChild(child);
        row.appendChild(cell);
        return cell;
    }

    function syncJsonFromGroup(modal, statusMessage) {
        const group = currentGroup();
        const textarea = modal.querySelector('.path-group-json');
        if (!textarea) return;

        textarea.value = group
            ? JSON.stringify(groupDraftItems(modal), null, 2)
            : '[]';

        const dirty = refreshGroupDraftDirty(modal);
        editorStatus(
            modal,
            statusMessage ||
                (
                    dirty
                        ? 'GUI与JSON草稿已同步，尚未保存。'
                        : 'GUI与JSON内容已同步，当前已保存。'
                ),
            dirty ? 'warning' : 'success'
        );
    }

    function blankPathItem() {
        return normalizeItem({
            id: makeId('item'),
            enabled: true,
            tab: '文字录入',
            orderType: '长',
            name: '',
            searchName: '',
            secondarySearchName: '',
            department: '',
            groupNo: '',
            dose: '',
            unit: '',
            route: '',
            frequency: 'qd',
            days: '',
            instruction: '',
            status: ''
        });
    }

    function setSelectedGuiRow(
        modal,
        itemId
    ) {
        modal.dataset.pathSelectedItemId =
            itemId || '';

        Array.from(
            modal.querySelectorAll(
                '.path-gui-row'
            )
        ).forEach(function (row) {
            row.classList.toggle(
                'selected',
                Boolean(itemId) &&
                row.dataset.itemId === itemId
            );
        });

        const insertButton =
            modal.querySelector(
                '.path-insert-after'
            );

        if (insertButton) {
            insertButton.disabled =
                state.running ||
                !itemId;
        }
    }

    function setAllGuiEnabled(
        modal,
        checked
    ) {
        Array.from(
            modal.querySelectorAll(
                '.path-gui-body .path-gui-enabled'
            )
        ).forEach(function (box) {
            box.checked = Boolean(checked);
        });

        readGroupGui(modal, false);
        renderRunGroups(modal);
        editorStatus(
            modal,
            checked
                ? '当前组套已全选，并同步到JSON。'
                : '当前组套已全不选，并同步到JSON。',
            'success'
        );
    }

    function deleteCheckedGuiItems(modal) {
        if (state.running) {
            showStatus('任务执行期间不能批量删除条目。', 'warning');
            return;
        }

        readGroupGui(modal, false);

        const group = currentGroup();
        if (!group) return;
        const draftItems = groupDraftItems(modal);

        const checkedIds = Array.from(
            modal.querySelectorAll('.path-gui-body .path-gui-row')
        )
            .filter(row => {
                const checkbox = row.querySelector('.path-gui-enabled');
                return checkbox && checkbox.checked;
            })
            .map(row => row.dataset.itemId)
            .filter(Boolean);

        if (!checkedIds.length) {
            showStatus(
                '当前没有勾选任何条目。请先勾选需要删除的行。',
                'warning'
            );
            return;
        }

        const checkedSet = new Set(checkedIds);
        const deletingItems = draftItems.filter(
            item => checkedSet.has(item.id)
        );
        const previewNames = deletingItems
            .slice(0, 8)
            .map(item => item.name || '空白条目');
        const moreCount = Math.max(
            0,
            deletingItems.length - previewNames.length
        );

        const message = [
            '确认从组套草稿中删除已勾选的' +
                deletingItems.length +
                '条医嘱吗？',
            previewNames.length
                ? previewNames.join('、') +
                  (
                      moreCount
                          ? ' 等另外' + moreCount + '条'
                          : ''
                  )
                : '',
            '',
            '删除后需要点击“保存当前组套”才正式生效。'
        ].filter(Boolean).join('\\n');

        if (!window.confirm(message)) return;

        modal.pathGroupDraftItems = draftItems.filter(
            item => !checkedSet.has(item.id)
        );

        if (checkedSet.has(modal.dataset.pathSelectedItemId || '')) {
            modal.dataset.pathSelectedItemId = '';
        }

        refreshGroupDraftDirty(
            modal,
            '删除操作已同步到组套草稿。'
        );
        renderGroupGui(modal);
        syncJsonFromGroup(
            modal,
            '已删除' +
                deletingItems.length +
                '条勾选医嘱，并同步到GUI和JSON草稿。'
        );
        renderRunGroups(modal);
        renderStatusList(modal);

        showStatus(
            '已从草稿删除' +
                deletingItems.length +
                '条医嘱，尚未保存。',
            'warning'
        );
    }

    function insertBlankAfterSelected(
        modal
    ) {
        if (!saveCurrentEditor(modal, false)) {
            showStatus(
                '当前编辑内容存在错误，不能插入空白行。',
                'error'
            );
            return;
        }

        const group = currentGroup();
        const selectedId =
            modal.dataset.pathSelectedItemId || '';

        if (!group || !selectedId) {
            showStatus(
                '请先单击需要插入位置的中间行，再点击“在选中行后插入空白”。',
                'warning'
            );
            return;
        }

        const draftItems = groupDraftItems(modal);
        const index = draftItems.findIndex(
            item => item.id === selectedId
        );

        if (index < 0) {
            showStatus(
                '未找到当前选中行，请重新单击目标行。',
                'warning'
            );
            return;
        }

        const blank = blankPathItem();
        draftItems.splice(index + 1, 0, blank);
        modal.dataset.pathSelectedItemId = blank.id;

        refreshGroupDraftDirty(
            modal,
            '已插入空白条目到组套草稿。'
        );
        renderGroupGui(modal);
        syncJsonFromGroup(
            modal,
            '已在第' +
                (index + 1) +
                '行后插入空白条目，并同步到JSON草稿。'
        );
        renderRunGroups(modal);
        renderStatusList(modal);
        setSelectedGuiRow(modal, blank.id);

        const newRow = modal.querySelector(
            '.path-gui-row[data-item-id="' +
            CSS.escape(blank.id) +
            '"]'
        );

        if (newRow) {
            newRow.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
            const nameInput = newRow.querySelector('.path-gui-name');
            if (nameInput) nameInput.focus();
        }
    }

    function secondaryDirectoryVisible(
        modal
    ) {
        if (!modal) {
            return false;
        }

        return (
            modal.dataset
                .pathSecondaryDirectoryVisible ===
            'true'
        );
    }

    function refreshSecondaryDirectoryToggle(
        modal
    ) {
        if (!modal) {
            return;
        }

        const visible =
            secondaryDirectoryVisible(
                modal
            );
        const button =
            modal.querySelector(
                '.path-toggle-secondary-directory'
            );
        const table =
            modal.querySelector(
                '.path-gui-table'
            );
        const searchHeader =
            modal.querySelector(
                '.path-search-name-header'
            );

        modal.classList.toggle(
            'path-secondary-directory-visible',
            visible
        );

        if (table) {
            table.classList.toggle(
                'path-secondary-directory-visible',
                visible
            );
        }

        if (searchHeader) {
            /*
             * 关闭时严格采用v1.26表头；
             * 打开时严格采用v1.27表头。
             */
            searchHeader.textContent =
                visible
                    ? '一级/下拉检索名称'
                    : '检索名称';
        }

        if (button) {
            button.classList.toggle(
                'active',
                visible
            );
            button.setAttribute(
                'aria-pressed',
                visible
                    ? 'true'
                    : 'false'
            );
            button.textContent =
                visible
                    ? '隐藏二级目录'
                    : '显示二级目录';
            button.title =
                visible
                    ? '隐藏“二级目录检索名称”列，恢复v1.26的紧凑19列排版；已有二级目录数据不会删除'
                    : '显示“二级目录检索名称”列，切换为v1.27的完整20列排版';
        }
    }

    function setSecondaryDirectoryVisible(
        modal,
        visible,
        save
    ) {
        if (!modal) {
            return;
        }

        /*
         * 切换前先把当前GUI内容同步至数据，
         * 避免用户刚输入的二级目录名称因重排而丢失。
         */
        if (
            save !== false &&
            editorMode(modal) === 'gui'
        ) {
            readGroupGui(
                modal,
                false
            );
        }

        modal.dataset
            .pathSecondaryDirectoryVisible =
            visible
                ? 'true'
                : 'false';

        refreshSecondaryDirectoryToggle(
            modal
        );

        if (save !== false) {
            GM_setValue(
                KEYS.secondaryDirectoryVisible,
                Boolean(visible)
            );
        }
    }

    function renderGroupGui(modal) {
        const body = modal.querySelector('.path-gui-body');
        const count = modal.querySelector('.path-gui-count');
        const group = currentGroup();
        if (!body) return;
        body.innerHTML = '';
        const items = group ? groupDraftItems(modal) : [];

        items.forEach((item, index) => {
            const row = document.createElement('tr');
            row.className = 'path-gui-row';
            row.dataset.itemId = item.id;
            row.dataset.index = String(index);

            if (
                modal.dataset.pathSelectedItemId ===
                item.id
            ) {
                row.classList.add('selected');
            }

            const enabled = makeGuiInput('path-gui-enabled', '', 'checkbox');
            enabled.checked = item.enabled !== false;
            appendGuiCell(row, enabled);

            const order = document.createElement('span');
            order.textContent = String(index + 1);
            appendGuiCell(row, order);

            appendGuiCell(row, makeGuiSelect('path-gui-tab', TAB_NAMES, item.tab));
            appendGuiCell(row, makeGuiSelect('path-gui-order-type', ['长', '临'], item.orderType));
            const nameInput = makeGuiInput('path-gui-name', item.name);
            appendGuiCell(row, nameInput);

            const searchNameInput =
                makeGuiInput(
                    'path-gui-search-name',
                    item.searchName
                );
            searchNameInput.placeholder =
                item.tab === '检验'
                    ? '下拉菜单，例如：生化17项'
                    : '系统检索名称';
            searchNameInput.title =
                item.tab === '检验'
                    ? '检验一级目录：用于左上方下拉菜单选择组套'
                    : '医院系统中的检索名称';
            appendGuiCell(
                row,
                searchNameInput
            );

            const secondarySearchInput =
                makeGuiInput(
                    'path-gui-secondary-search-name',
                    item.secondarySearchName
                );
            secondarySearchInput.placeholder =
                item.tab === '检验'
                    ? '树节点，例如：生化17（肝功10项，肾功4项，血脂3项）'
                    : '仅检验二级目录使用';
            secondarySearchInput.title =
                '检验二级目录：下拉组套选中后，在左侧树状列表中精确点击此名称；留空时沿用一级检索名称';
            appendGuiCell(
                row,
                secondarySearchInput,
                'path-secondary-directory-column'
            );

            appendGuiCell(row, makeGuiInput('path-gui-department', item.department));
            appendGuiCell(row, makeGuiInput('path-gui-group-no', item.groupNo));

            const dose = makeGuiInput('path-gui-dose', item.dose, 'number');
            dose.step = '0.001';
            appendGuiCell(row, dose);

            appendGuiCell(row, makeGuiInput('path-gui-unit', item.unit));
            appendGuiCell(row, makeGuiInput('path-gui-route', item.route));
            appendGuiCell(row, makeGuiInput('path-gui-frequency', item.frequency));

            const days = makeGuiInput('path-gui-days', item.days, 'number');
            days.step = '1';
            appendGuiCell(row, days);

            const instruction = document.createElement('textarea');
            instruction.className = 'path-gui-instruction';
            instruction.value = item.instruction || '';
            appendGuiCell(row, instruction);

            const advanced = document.createElement('button');
            advanced.type = 'button';
            advanced.className = 'path-gui-advanced secondary';
            advanced.textContent = '高级';
            appendGuiCell(row, advanced);

            const copyButton = document.createElement('button');
            copyButton.type = 'button';
            copyButton.className = 'path-gui-copy secondary';
            copyButton.textContent = '复制';
            appendGuiCell(row, copyButton);

            const moveBox = document.createElement('div');
            moveBox.className = 'path-gui-move-box';
            const up = document.createElement('button');
            up.type = 'button';
            up.className = 'path-gui-up secondary';
            up.textContent = '↑';
            const down = document.createElement('button');
            down.type = 'button';
            down.className = 'path-gui-down secondary';
            down.textContent = '↓';
            moveBox.appendChild(up);
            moveBox.appendChild(down);
            appendGuiCell(row, moveBox);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'path-gui-delete danger';
            remove.textContent = '删除';
            appendGuiCell(row, remove);

            const status = document.createElement('span');
            status.className = 'path-gui-status';
            status.textContent = item.status || '待执行';
            if (/失败/.test(item.status)) status.dataset.type = 'error';
            else if (/已填入/.test(item.status)) status.dataset.type = 'success';
            else if (/正在/.test(item.status)) status.dataset.type = 'warning';
            appendGuiCell(row, status, 'path-gui-status-cell');

            body.appendChild(row);
            configurePathSharedSuggestionRow(row);
        });

        if (count) count.textContent = items.length + '条';

        setSelectedGuiRow(
            modal,
            modal.dataset.pathSelectedItemId || ''
        );

        refreshSecondaryDirectoryToggle(
            modal
        );
        refreshGroupDraftDirty(modal);
    }

    function collectGroupGuiItems(modal) {
        const group = currentGroup();
        if (!group || !modal) return [];

        const draft = groupDraftItems(modal);
        const oldMap = new Map(
            draft.map(item => [item.id, item])
        );
        const rows = Array.from(
            modal.querySelectorAll('.path-gui-body .path-gui-row')
        );

        return rows.map(row => {
            const old = oldMap.get(row.dataset.itemId) || {};
            const doseValue = Number(
                row.querySelector('.path-gui-dose').value
            );
            const daysValue = Number(
                row.querySelector('.path-gui-days').value
            );
            const name = row.querySelector('.path-gui-name').value.trim();

            return normalizeItem(Object.assign({}, old, {
                id: old.id || row.dataset.itemId || makeId('item'),
                enabled: row.querySelector('.path-gui-enabled').checked,
                tab: row.querySelector('.path-gui-tab').value,
                orderType: row.querySelector('.path-gui-order-type').value,
                name: name,
                searchName:
                    row.querySelector('.path-gui-search-name').value.trim() ||
                    name,
                secondarySearchName:
                    row.querySelector(
                        '.path-gui-secondary-search-name'
                    ).value.trim(),
                department:
                    row.querySelector('.path-gui-department').value.trim(),
                groupNo:
                    row.querySelector('.path-gui-group-no').value.trim(),
                dose:
                    Number.isFinite(doseValue) && doseValue > 0
                        ? doseValue
                        : '',
                unit:
                    row.querySelector('.path-gui-unit').value.trim(),
                route:
                    row.querySelector('.path-gui-route').value.trim(),
                frequency:
                    row.querySelector('.path-gui-frequency').value.trim(),
                days:
                    Number.isFinite(daysValue) && daysValue > 0
                        ? daysValue
                        : '',
                instruction:
                    row.querySelector('.path-gui-instruction').value.trim()
            }));
        });
    }

    function updateGroupGuiDraftSilently(modal) {
        const group = currentGroup();
        if (!group || !modal) return false;

        /*
         * 仅更新内存草稿，不修改textarea、状态文字、执行组套或状态列表。
         * 原生datalist展开期间保持弹窗DOM稳定，避免候选菜单闪退。
         */
        modal.dataset.pathDraftGroupId = group.id;
        modal.pathGroupDraftItems = collectGroupGuiItems(modal);
        return true;
    }

    function readGroupGui(modal, show) {
        const group = currentGroup();
        if (!group) return false;

        const nextItems = collectGroupGuiItems(modal);

        setGroupDraftItems(
            modal,
            nextItems,
            'GUI修改已同步到JSON草稿。'
        );
        syncJsonFromGroup(
            modal,
            'GUI修改已同步到JSON草稿。'
        );
        renderRunGroups(modal);
        renderStatusList(modal);

        if (show !== false) {
            showStatus(
                isGroupDraftDirty(modal)
                    ? 'GUI内容已更新到草稿，尚未保存。'
                    : 'GUI内容与保存版本一致。',
                isGroupDraftDirty(modal)
                    ? 'warning'
                    : 'success'
            );
        }

        return true;
    }

    function applyGroupJson(modal, show, renderGui) {
        const group = currentGroup();
        if (!group) return false;

        try {
            const parsed = JSON.parse(
                modal.querySelector('.path-group-json').value || '[]'
            );
            if (!Array.isArray(parsed)) {
                throw new Error('组套内容必须是JSON数组');
            }

            setGroupDraftItems(
                modal,
                parsed.map(normalizeItem),
                'JSON有效，已同步到GUI草稿。'
            );

            if (renderGui !== false) {
                renderGroupGui(modal);
            }
            renderRunGroups(modal);
            renderStatusList(modal);

            editorStatus(
                modal,
                isGroupDraftDirty(modal)
                    ? 'JSON有效，已同步到GUI草稿，尚未保存。'
                    : 'JSON有效，与保存版本一致。',
                isGroupDraftDirty(modal)
                    ? 'warning'
                    : 'success'
            );

            if (show !== false) {
                showStatus(
                    isGroupDraftDirty(modal)
                        ? 'JSON已应用到组套草稿，尚未保存。'
                        : 'JSON与保存版本一致。',
                    isGroupDraftDirty(modal)
                        ? 'warning'
                        : 'success'
                );
            }
            return true;
        } catch (error) {
            editorStatus(
                modal,
                'JSON未同步：' + error.message,
                'error'
            );
            if (show !== false) {
                showStatus(
                    'JSON格式错误：' + error.message,
                    'error'
                );
            }
            return false;
        }
    }

    function setEditorMode(modal, mode, save, skipCommit) {
        const targetMode = mode === 'json' ? 'json' : 'gui';
        const oldMode = editorMode(modal);
        if (!skipCommit && oldMode !== targetMode) {
            const success = oldMode === 'json'
                ? applyGroupJson(modal, false, true)
                : readGroupGui(modal, false);
            if (!success) return false;
        }

        modal.dataset.pathEditorMode = targetMode;
        const guiPanel = modal.querySelector('.path-editor-gui');
        const jsonPanel = modal.querySelector('.path-editor-json');
        const guiButton = modal.querySelector('.path-mode-gui');
        const jsonButton = modal.querySelector('.path-mode-json');
        if (guiPanel) guiPanel.classList.toggle('active', targetMode === 'gui');
        if (jsonPanel) jsonPanel.classList.toggle('active', targetMode === 'json');
        if (guiButton) guiButton.classList.toggle('active', targetMode === 'gui');
        if (jsonButton) jsonButton.classList.toggle('active', targetMode === 'json');
        if (save !== false) GM_setValue(KEYS.editorMode, targetMode);
        return true;
    }

    function saveCurrentEditor(modal, show) {
        return editorMode(modal) === 'json'
            ? applyGroupJson(modal, show, true)
            : readGroupGui(modal, show);
    }

    function openAdvancedEditor(modal, itemId) {
        readGroupGui(modal, false);
        const group = currentGroup();
        const item = group &&
            groupDraftItems(modal).find(entry => entry.id === itemId);
        if (!item) return;
        const dialog = modal.querySelector('.path-advanced-layer');
        dialog.dataset.itemId = item.id;
        dialog.querySelector('.path-advanced-name').textContent = item.name || '未命名条目';
        dialog.querySelector('.path-advanced-quantity').value = item.quantity === '' ? '' : item.quantity;
        dialog.querySelector('.path-advanced-total').value = item.total === '' ? '' : item.total;
        dialog.querySelector('.path-advanced-dose-count').value = item.doseCount || 7;
        dialog.querySelector('.path-advanced-decoction').value = item.decoctionMode || '自煎';
        dialog.querySelector('.path-advanced-department').value = item.department || '';
        dialog.querySelector('.path-advanced-specimen').value = item.specimen || '';
        dialog.querySelector('.path-advanced-body-part').value = item.bodyPart || '';
        dialog.querySelector('.path-advanced-self-pay').value = item.selfPayMode || 'min';
        dialog.querySelector('.path-advanced-discharge').value = item.dischargeFlag || '否';
        dialog.querySelector('.path-advanced-transfer').value = item.transferSelfPay || '否';
        dialog.querySelector('.path-advanced-billing').value = item.billing || '是';
        dialog.querySelector('.path-advanced-custom').value = JSON.stringify(item.customFields || {}, null, 2);
        // 原生模态层不受主窗口 transform 或页面 stacking context 的影响。
        if (typeof dialog.showModal === 'function') {
            if (!dialog.open) dialog.showModal();
        } else {
            dialog.classList.add('show');
        }
    }

    function closeAdvancedEditor(modal) {
        const dialog = modal.querySelector('.path-advanced-layer');
        if (!dialog) return;
        if (dialog.open && typeof dialog.close === 'function') dialog.close();
        dialog.classList.remove('show');
    }

    function saveAdvancedEditor(modal) {
        const dialog = modal.querySelector('.path-advanced-layer');
        const group = currentGroup();
        if (!dialog || !group) return false;
        const draftItems = groupDraftItems(modal);
        const item = draftItems.find(
            entry => entry.id === dialog.dataset.itemId
        );
        if (!item) return false;
        let customFields;
        try {
            customFields = JSON.parse(dialog.querySelector('.path-advanced-custom').value || '{}');
            if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) {
                throw new Error('自定义字段必须是JSON对象');
            }
        } catch (error) {
            showStatus('高级设置中的自定义字段JSON错误：' + error.message, 'error');
            return false;
        }

        const quantity = Number(dialog.querySelector('.path-advanced-quantity').value);
        const total = Number(dialog.querySelector('.path-advanced-total').value);
        const doseCount = Number(dialog.querySelector('.path-advanced-dose-count').value);
        const updated = normalizeItem(Object.assign({}, item, {
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : '',
            total: Number.isFinite(total) && total > 0 ? total : '',
            doseCount: Number.isFinite(doseCount) && doseCount > 0 ? doseCount : 7,
            decoctionMode: dialog.querySelector('.path-advanced-decoction').value,
            department: dialog.querySelector('.path-advanced-department').value.trim(),
            specimen: dialog.querySelector('.path-advanced-specimen').value.trim(),
            bodyPart: dialog.querySelector('.path-advanced-body-part').value.trim(),
            selfPayMode: dialog.querySelector('.path-advanced-self-pay').value,
            dischargeFlag: dialog.querySelector('.path-advanced-discharge').value,
            transferSelfPay: dialog.querySelector('.path-advanced-transfer').value,
            billing: dialog.querySelector('.path-advanced-billing').value,
            customFields: customFields
        }));
        const index = draftItems.findIndex(entry => entry.id === item.id);
        draftItems[index] = updated;
        refreshGroupDraftDirty(
            modal,
            '高级字段已同步到GUI和JSON草稿。'
        );
        renderGroupGui(modal);
        syncJsonFromGroup(modal, '高级字段已同步到GUI和JSON草稿。');
        renderRunGroups(modal);
        renderStatusList(modal);
        closeAdvancedEditor(modal);
        showStatus(
            '高级字段已更新到组套草稿，尚未保存。',
            'warning'
        );
        return true;
    }

    function refreshSelects(modal) {
        const categorySelect = modal.querySelector('.path-category');
        const pathwaySelect = modal.querySelector('.path-pathway');
        const groupSelect = modal.querySelector('.path-group');
        const category = currentCategory();
        const pathway = currentPathway();
        const group = currentGroup();
        categorySelect.innerHTML = '';
        state.library.categories.forEach(item => categorySelect.appendChild(option(item.id, item.name)));
        if (category) { categorySelect.value = category.id; GM_setValue(KEYS.category, category.id); }
        pathwaySelect.innerHTML = '';
        if (category) category.pathways.forEach(item => pathwaySelect.appendChild(option(item.id, item.name + ' v' + item.version)));
        if (pathway) { pathwaySelect.value = pathway.id; GM_setValue(KEYS.pathway, pathway.id); }
        groupSelect.innerHTML = '';
        if (pathway) pathway.groups.forEach(item => groupSelect.appendChild(option(item.id, item.name)));
        if (group) { groupSelect.value = group.id; GM_setValue(KEYS.group, group.id); }
        modal.querySelector('.path-description').value = pathway ? pathway.description : '';
        modal.querySelector('.path-version').value = pathway ? pathway.version : '';

        const draftItems = group ? groupDraftItems(modal) : [];
        modal.querySelector('.path-group-json').value =
            group ? JSON.stringify(draftItems, null, 2) : '[]';

        renderGroupGui(modal);
        setSecondaryDirectoryVisible(
            modal,
            Boolean(
                GM_getValue(
                    KEYS.secondaryDirectoryVisible,
                    false
                )
            ),
            false
        );
        setEditorMode(modal, GM_getValue(KEYS.editorMode, 'gui'), false, true);
        refreshGroupDraftDirty(modal);
        editorStatus(
            modal,
            isGroupDraftDirty(modal)
                ? 'GUI与JSON显示的是同一份组套草稿，尚未保存。'
                : 'GUI与JSON显示的是同一组套数据，当前已保存。',
            isGroupDraftDirty(modal)
                ? 'warning'
                : 'success'
        );
        renderRunGroups(modal);
        renderStatusList(modal);
    }

    function saveGroupJson(modal, show) {
        const ok = requireSavedCurrentGroup(modal, '继续');
        if (!ok && show !== false) {
            showStatus('请先保存当前组套。', 'warning');
        }
        return ok;
    }

    function renderRunGroups(modal) {
        const pathway = currentPathway();
        const box = modal.querySelector('.path-run-groups');

        if (!box) return;

        /*
         * 必须在清空DOM以前先抓取用户当前的勾选结果。
         * readGroupGui/applyGroupJson/保存组套等流程都会调用本函数。
         */
        const record = pathway
            ? captureRunGroupSelection(modal)
            : null;

        box.innerHTML = '';

        if (!pathway || !record) {
            if (modal) {
                modal.dataset.pathRunGroupsPathwayId = '';
            }
            return;
        }

        modal.dataset.pathRunGroupsPathwayId = String(pathway.id || '');

        pathway.groups.forEach(function (group) {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            const groupId = String(group.id || '');

            checkbox.type = 'checkbox';
            checkbox.className = 'path-run-group';
            checkbox.value = groupId;
            checkbox.checked = record.selected.has(groupId);

            /*
             * 用户在执行区手工切换后立即写入独立选择状态。
             * 这里只改变“本次执行范围”，不修改group.enabled，
             * 也不会改动组套内部各条医嘱的启用勾选。
             */
            checkbox.addEventListener('change', function () {
                record.known.add(groupId);

                if (checkbox.checked) {
                    record.selected.add(groupId);
                }
                else {
                    record.selected.delete(groupId);
                }
            });

            const current = currentGroup();
            const items =
                current && current.id === group.id
                    ? groupDraftItems(modal)
                    : group.items;

            label.appendChild(checkbox);
            label.appendChild(
                document.createTextNode(
                    group.name +
                    '（' +
                    items.filter(function (item) {
                        return item.enabled;
                    }).length +
                    '条）'
                )
            );
            box.appendChild(label);
        });
    }

    function renderStatusList(modal) {
        const pathway = currentPathway();
        const box = modal.querySelector('.path-status-list');
        box.innerHTML = '';
        if (!pathway) return;
        pathway.groups.forEach(group => {
            const current = currentGroup();
            const items =
                current && current.id === group.id
                    ? groupDraftItems(modal)
                    : group.items;

            items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'path-status-row';
            row.dataset.itemId = item.id;
            row.textContent = item.name + '：' + (item.status || '待执行');
            if (/失败/.test(item.status)) row.dataset.type = 'error';
            else if (/已填入/.test(item.status)) row.dataset.type = 'success';
            else if (/正在/.test(item.status)) row.dataset.type = 'warning';
            box.appendChild(row);
            });
        });
    }

    function renderScan(modal) {
        const body = modal.querySelector('.path-scan-body');
        body.innerHTML = state.scanResults.map(item => '<tr><td>' + escapeHtml(item.tab) + '</td><td class="' + (item.ok ? 'scan-ok' : 'scan-error') + '">' + (item.ok ? '已识别' : '失败') + '</td><td>' + item.rows + '</td><td>' + escapeHtml(item.ok ? item.headers.join('、') : item.error) + '</td></tr>').join('');
        modal.querySelector('.path-scan-result').style.display = state.scanResults.length ? 'block' : 'none';
    }

    function updateRunButtons(modal) {
        const executionBusy =
            state.running ||
            state.bulkDeletingOrders;

        const busy =
            executionBusy ||
            state.aiBusy;

        modal.querySelector('.path-scan').disabled = busy;
        modal.querySelector('.path-run').disabled = busy;
        modal.querySelector('.path-delete-all-orders').disabled = busy;
        modal.querySelector('.path-local-delete-open').disabled = busy;
        modal.querySelector('.path-add-current-page-orders').disabled = busy;
        const currentPageReverseSort = modal.querySelector(
            '.path-add-current-page-orders-reverse'
        );
        if (currentPageReverseSort) {
            currentPageReverseSort.disabled = busy;
        }
        modal.querySelector('.path-inpatient-order-open').disabled = busy;
        modal.querySelector('.path-pause').disabled = !state.running;
        modal.querySelector('.path-abort').disabled = !executionBusy;

        [
            '.path-ai-generate',
            '.path-ai-audit',
            '.path-ai-create-path',
            '.path-ai-clear-generation',
            '.path-ai-clear-audit',
            '.path-ai-manual-audit',
            '.path-ai-extract-orders',
            '.path-ai-copy-extract',
            '.path-ai-clear-extract',
            '.path-ai-reset-extract-prompt',
            '.path-ai-manual-extract',
            '.path-ai-extract-diagnosis',
            '.path-ai-copy-diagnosis-extract',
            '.path-ai-clear-diagnosis-extract',
            '.path-ai-reset-diagnosis-extract-prompt',
            '.path-ai-manual-diagnosis-extract'
        ].forEach(function (selector) {
            const button =
                modal.querySelector(
                    selector
                );

            if (button) {
                button.disabled =
                    busy ||
                    (
                        selector ===
                            '.path-ai-create-path' &&
                        !state
                            .aiGeneratedResult
                    ) ||
                    (
                        (selector === '.path-ai-copy-extract' ||
                         selector === '.path-ai-clear-extract') &&
                        !String(state.aiOrderExtractResult || '').trim()
                    ) ||
                    (
                        (selector === '.path-ai-copy-diagnosis-extract' ||
                         selector === '.path-ai-clear-diagnosis-extract') &&
                        !String(state.aiDiagnosisExtractResult || '').trim()
                    );
            }
        });
        modal.querySelector('.path-pause').textContent = state.paused ? '继续' : '暂停';

        Array.from(
            modal.querySelectorAll(
                '.path-options input'
            )
        ).forEach(function (input) {
            input.disabled = busy;
        });

        Array.from(modal.querySelectorAll([
            '.path-editor-switch button',
            '.path-editor-panel input',
            '.path-editor-panel select',
            '.path-editor-panel textarea',
            '.path-editor-panel button',
            '.path-add-example',
            '.path-insert-after',
            '.path-enable-all',
            '.path-enable-none',
            '.path-delete-enabled',
            '.path-save-json'
        ].join(','))).forEach(element => {
            element.disabled = busy;
        });

        Array.from(modal.querySelectorAll([
            '.path-order-import-read',
            '.path-order-import-manual',
            '.path-order-import-local-parse',
            '.path-order-import-ai-parse',
            '.path-order-import-add',
            '.path-order-import-clear',
            '.path-order-import-template-manage',
            '.path-order-import-template-save',
            '.path-order-import-insert-after',
            '.path-order-import-mode-gui',
            '.path-order-import-mode-json',
            '.path-order-import-select-all',
            '.path-order-import-select-none',
            '.path-order-import-delete-enabled',
            '.path-order-import-toggle-secondary',
            '.path-order-import-json-format',
            '.path-order-import-json-apply',
            '.path-order-import-append',
            '.path-order-import-execute',
            '.path-order-import-risk-ack',
            '.path-order-import-table input',
            '.path-order-import-table select',
            '.path-order-import-table textarea',
            '.path-order-import-json-editor',
            '.path-order-import-options input',
            '.path-order-import-advanced-layer input',
            '.path-order-import-advanced-layer select',
            '.path-order-import-advanced-layer textarea',
            '.path-order-import-advanced-save'
        ].join(','))).forEach(function (element) {
            element.disabled = busy;
        });

        /*
         * v1.48.25：住院医嘱开立自动执行期间，“× / 关闭”属于纯界面操作，
         * 不应和编辑控件一起被busy禁用。仅AI解析医嘱正在改写本窗口草稿时
         * 暂时禁用关闭，避免解析回调操作已隐藏的编辑层；普通医嘱自动开立
         * state.running期间始终允许关闭，且关闭不会改变执行状态。
         */
        const orderImportCloseControls = Array.from(
            modal.querySelectorAll(
                '.path-order-import-close,.path-order-import-cancel'
            )
        );
        orderImportCloseControls.forEach(function (element) {
            element.disabled = Boolean(state.orderImportAiBusy);
            if (state.running) {
                element.title = '关闭窗口但继续执行当前住院医嘱开立任务';
            } else {
                element.removeAttribute('title');
            }
        });

        const orderImportPause = modal.querySelector(
            '.path-order-import-pause'
        );
        const orderImportStop = modal.querySelector(
            '.path-order-import-stop'
        );
        if (orderImportPause) {
            orderImportPause.disabled = !state.running;
            orderImportPause.textContent = state.paused ? '继续' : '暂停';
        }
        if (orderImportStop) {
            orderImportStop.disabled = !executionBusy;
        }

        const orderImportSource = modal.querySelector(
            '.path-order-import-source'
        );
        if (orderImportSource) orderImportSource.disabled = busy;

        refreshOrderImportPreviewValidation(modal);
    }

    function exportLibrary() {
        const blob = new Blob([JSON.stringify(state.library, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = '智慧医疗临床路径组套_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function sectionCollapsedMap() {
        const value = GM_getValue(
            KEYS.sectionCollapsed,
            {}
        );

        return (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value)
        )
            ? value
            : {};
    }

    function applySectionCollapsed(
        section,
        collapsed,
        save
    ) {
        if (!section) {
            return;
        }

        const key =
            section.dataset.sectionKey || '';
        const toggle =
            section.querySelector(
                ':scope > .path-title .path-section-toggle'
            );

        section.classList.toggle(
            'collapsed',
            Boolean(collapsed)
        );

        if (toggle) {
            toggle.textContent =
                collapsed ? '展开' : '折叠';
            toggle.setAttribute(
                'aria-expanded',
                collapsed ? 'false' : 'true'
            );
        }

        if (save !== false && key) {
            const map = sectionCollapsedMap();
            map[key] = Boolean(collapsed);

            GM_setValue(
                KEYS.sectionCollapsed,
                map
            );
        }
    }

    function initializeSectionCollapsing(modal) {
        const map = sectionCollapsedMap();

        Array.from(
            modal.querySelectorAll(
                '.path-section[data-section-key]'
            )
        ).forEach(function (section) {
            const key =
                section.dataset.sectionKey;
            const defaultCollapsed =
                section.dataset.defaultCollapsed ===
                'true';
            const collapsed =
                Object.prototype.hasOwnProperty.call(
                    map,
                    key
                )
                    ? Boolean(map[key])
                    : defaultCollapsed;

            applySectionCollapsed(
                section,
                collapsed,
                false
            );
        });

        modal.addEventListener(
            'click',
            function (event) {
                const toggle =
                    event.target.closest(
                        '.path-section-toggle'
                    );

                if (!toggle) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const section =
                    toggle.closest(
                        '.path-section'
                    );

                if (!section) {
                    return;
                }

                applySectionCollapsed(
                    section,
                    !section.classList.contains(
                        'collapsed'
                    ),
                    true
                );
            }
        );
    }

    function ensureStyle() {
        if (document.getElementById(IDS.style)) return;
        const style = document.createElement('style');
        style.id = IDS.style;
        style.textContent = `
#${IDS.modal}{position:fixed;inset:0;z-index:2147483647;display:none;font-family:"Microsoft YaHei",Arial,sans-serif;color:#333;}
#${IDS.modal}.show{display:block;}
#${IDS.modal} .path-mask{position:absolute;inset:0;background:rgba(0,0,0,.44);}
#${IDS.modal} .path-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:1490px;max-width:calc(100vw - 24px);max-height:calc(100vh - 26px);background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 12px 38px rgba(0,0,0,.36);}
#${IDS.modal} .path-header{display:flex;justify-content:space-between;align-items:center;padding:13px 17px;background:${STYLE.modalHeader};color:#fff;font-size:16px;font-weight:bold;}
#${IDS.modal} .path-close{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer;}
#${IDS.modal} .path-body{padding:12px 14px;max-height:calc(100vh - 144px);overflow:auto;background:#f7fafc;}
#${IDS.modal} .path-section{margin-bottom:10px;padding:0;border:1px solid #bddbe8;border-radius:6px;background:#fff;overflow:hidden;}
#${IDS.modal} .path-title{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:37px;margin:0;padding:0 9px 0 11px;background:#edf8fc;color:#117fac;font-weight:bold;}
#${IDS.modal} .path-section-content{padding:10px;}
#${IDS.modal} .path-section.collapsed>.path-section-content{display:none!important;}
#${IDS.modal} .path-section-toggle{flex:0 0 auto;height:27px;padding:0 10px;background:#fff;color:#117fac;border-color:#9fcfe3;font-weight:normal;}
#${IDS.modal} .path-section-toggle:hover{background:#e5f6fc;}
#${IDS.modal} .path-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;}
#${IDS.modal} .path-selection-actions{display:flex;align-items:center;gap:5px;margin-left:auto;padding-left:8px;border-left:1px solid #c9e1eb;}
#${IDS.modal} .path-selection-actions button{white-space:nowrap;}
#${IDS.modal} .path-selection-actions .path-delete-enabled{background:#dc4c40;border-color:#dc4c40;color:#fff;}
#${IDS.modal} input,#${IDS.modal} select,#${IDS.modal} textarea{box-sizing:border-box;border:1px solid #cfd8dc;border-radius:4px;background:#fff;color:#333;font-size:12px;}
#${IDS.modal} input,#${IDS.modal} select{height:31px;padding:4px 7px;}
#${IDS.modal} textarea{padding:7px 8px;line-height:1.5;resize:vertical;}
#${IDS.modal} .path-category,#${IDS.modal} .path-pathway,#${IDS.modal} .path-group{min-width:210px;}
#${IDS.modal} button{height:31px;padding:0 10px;border:1px solid ${STYLE.primary};border-radius:4px;background:${STYLE.primary};color:#fff;cursor:pointer;}
#${IDS.modal} button.secondary{background:#fff;color:${STYLE.primary};}
#${IDS.modal} button.danger{background:#dc4c40;border-color:#dc4c40;}
#${IDS.modal} button:disabled{opacity:.5;cursor:not-allowed;}
#${IDS.modal} .path-meta{display:grid;grid-template-columns:1fr 140px;gap:8px;margin-top:8px;}
#${IDS.modal} .path-editor-switch{display:flex;gap:5px;padding:3px;border:1px solid #b9d9e7;border-radius:5px;background:#edf8fc;}
#${IDS.modal} .path-editor-switch button{background:#fff;color:#117fac;border-color:#b9d9e7;}
#${IDS.modal} .path-editor-switch button.active{background:#159bd3;color:#fff;border-color:#159bd3;font-weight:bold;}
#${IDS.modal} .path-toggle-secondary-directory{white-space:nowrap;min-width:108px;}
#${IDS.modal} .path-toggle-secondary-directory.active{background:#159bd3;color:#fff;border-color:#159bd3;font-weight:bold;}
#${IDS.modal} .path-editor-panel{display:none;margin-top:9px;}
#${IDS.modal} .path-editor-panel.active{display:block;}
#${IDS.modal} .path-editor-status{margin-top:7px;padding:6px 8px;border-radius:4px;background:#eef7ff;color:#1f5f8b;font-size:12px;}
#${IDS.modal} .path-editor-status[data-type="success"]{background:#ecfdf3;color:#166534;}
#${IDS.modal} .path-editor-status[data-type="error"]{background:#fff0ef;color:#b42318;}
#${IDS.modal} .path-editor-status[data-type="warning"]{background:#fff7df;color:#8a5a00;}
#${IDS.modal} .path-gui-wrap{max-height:430px;overflow:auto;border:1px solid #dce5e9;border-radius:5px;}
#${IDS.modal} .path-gui-table{width:100%;min-width:2280px;border-collapse:collapse;table-layout:fixed;}
#${IDS.modal}.path-secondary-directory-visible .path-gui-table{min-width:2500px;}
#${IDS.modal}:not(.path-secondary-directory-visible) .path-secondary-directory-column{display:none!important;}
#${IDS.modal} .path-gui-table th{position:sticky;top:0;z-index:3;background:#edf7fb;}
#${IDS.modal} .path-gui-table td{padding:4px;vertical-align:middle;}
#${IDS.modal} .path-gui-row{cursor:pointer;transition:background .12s ease,box-shadow .12s ease;}
#${IDS.modal} .path-gui-row.selected td{background:#e7f6ff!important;box-shadow:inset 0 1px 0 #77c8ed,inset 0 -1px 0 #77c8ed;}
#${IDS.modal} .path-gui-row.selected td:first-child{box-shadow:inset 3px 0 0 #159bd3,inset 0 1px 0 #77c8ed,inset 0 -1px 0 #77c8ed;}
#${IDS.modal} .path-gui-table td input,#${IDS.modal} .path-gui-table td select,#${IDS.modal} .path-gui-table td textarea{width:100%;}
#${IDS.modal} .path-gui-table td textarea{height:42px;min-height:42px;resize:vertical;}
#${IDS.modal} .path-gui-table th:nth-child(1){width:42px;}#${IDS.modal} .path-gui-table th:nth-child(2){width:38px;}#${IDS.modal} .path-gui-table th:nth-child(3){width:92px;}#${IDS.modal} .path-gui-table th:nth-child(4){width:55px;}#${IDS.modal} .path-gui-table th:nth-child(5){width:170px;}#${IDS.modal} .path-gui-table th:nth-child(6){width:175px;}#${IDS.modal} .path-gui-table th:nth-child(7){width:260px;}#${IDS.modal} .path-gui-table th:nth-child(8){width:125px;}#${IDS.modal} .path-gui-table th:nth-child(9){width:55px;}#${IDS.modal} .path-gui-table th:nth-child(10){width:75px;}#${IDS.modal} .path-gui-table th:nth-child(11){width:70px;}#${IDS.modal} .path-gui-table th:nth-child(12){width:95px;}#${IDS.modal} .path-gui-table th:nth-child(13){width:70px;}#${IDS.modal} .path-gui-table th:nth-child(14){width:55px;}#${IDS.modal} .path-gui-table th:nth-child(15){width:190px;}#${IDS.modal} .path-gui-table th:nth-child(16){width:58px;}#${IDS.modal} .path-gui-table th:nth-child(17){width:58px;}#${IDS.modal} .path-gui-table th:nth-child(18){width:70px;}#${IDS.modal} .path-gui-table th:nth-child(19){width:58px;}#${IDS.modal} .path-gui-table th:nth-child(20){width:210px;}
#${IDS.modal} .path-gui-move-box{display:flex;gap:3px;justify-content:center;}
#${IDS.modal} .path-gui-move-box button{width:29px;padding:0;}
#${IDS.modal} .path-gui-status{display:block;max-height:48px;overflow:auto;text-align:left;line-height:1.4;}
#${IDS.modal} .path-gui-status[data-type="success"]{color:#17884d;font-weight:bold;}#${IDS.modal} .path-gui-status[data-type="error"]{color:#d13b31;font-weight:bold;}#${IDS.modal} .path-gui-status[data-type="warning"]{color:#a16207;font-weight:bold;}
#${IDS.modal} .path-json-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:7px;}
#${IDS.modal} .path-group-json{width:100%;height:360px;font-family:Consolas,monospace;font-size:12px;}
#${IDS.modal} dialog.path-advanced-layer{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:24px;border:0;box-sizing:border-box;overflow:auto;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.38);}
#${IDS.modal} dialog.path-advanced-layer[open],#${IDS.modal} dialog.path-advanced-layer.show{display:flex;}
#${IDS.modal} dialog.path-advanced-layer::backdrop{background:transparent;}
#${IDS.modal} .path-advanced-card{width:790px;max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow:auto;background:#fff;border-radius:7px;box-shadow:0 10px 32px rgba(0,0,0,.35);}
#${IDS.modal} .path-advanced-head{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:#24a7df;color:#fff;font-weight:bold;}
#${IDS.modal} .path-advanced-close{border:0;background:transparent;color:#fff;font-size:22px;padding:0;width:30px;}
#${IDS.modal} .path-advanced-body{padding:12px 14px;}
#${IDS.modal} .path-advanced-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;}
#${IDS.modal} .path-advanced-grid label{display:flex;flex-direction:column;gap:4px;font-size:12px;}
#${IDS.modal} .path-advanced-custom-wrap{margin-top:9px;}
#${IDS.modal} .path-advanced-custom{width:100%;height:150px;font-family:Consolas,monospace;}
#${IDS.modal} .path-advanced-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}
#${IDS.modal} .path-local-delete-layer{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:rgba(0,0,0,.42);}
#${IDS.modal} .path-local-delete-layer.show{display:flex;}
#${IDS.modal} .path-local-delete-card{width:1180px;max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:#fff;border-radius:8px;box-shadow:0 12px 38px rgba(0,0,0,.38);overflow:hidden;margin:auto;}
#${IDS.modal} .path-local-delete-head{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:#24a7df;color:#fff;font-weight:bold;}
#${IDS.modal} .path-local-delete-close{width:32px;padding:0;border:0;background:transparent;color:#fff;font-size:22px;}
#${IDS.modal} .path-local-delete-content{padding:12px 14px;overflow:auto;}
#${IDS.modal} .path-local-delete-note{padding:9px 10px;margin-bottom:9px;background:#fff7df;border:1px solid #f1d68b;border-radius:5px;color:#7a5600;line-height:1.7;}
#${IDS.modal} .path-local-delete-patient{padding:7px 9px;margin-bottom:9px;background:#ecfdf3;border-radius:4px;color:#166534;}
#${IDS.modal} .path-local-delete-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:8px;}
#${IDS.modal} .path-local-delete-table-wrap{max-height:430px;overflow:auto;border:1px solid #dce5e9;border-radius:5px;}
#${IDS.modal} .path-local-delete-table{min-width:1040px;table-layout:auto;}
#${IDS.modal} .path-local-delete-table th{position:sticky;top:0;z-index:2;background:#edf7fb;white-space:nowrap;}
#${IDS.modal} .path-local-delete-table td{white-space:nowrap;}
#${IDS.modal} .path-local-delete-table .path-local-delete-name{min-width:260px;white-space:normal;text-align:left;}
#${IDS.modal} .path-local-delete-empty{padding:24px!important;color:#607d8b;text-align:center!important;}
#${IDS.modal} .path-local-delete-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}
#${IDS.modal} .path-local-delete-open{background:#fff4e5;color:#b45309;border-color:#f0b66f;}
#${IDS.modal} .path-local-delete-open:hover{background:#ffecd2;}
#${IDS.modal} .path-order-import-layer{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;background:rgba(0,0,0,.42);}
#${IDS.modal} .path-order-import-layer.show{display:flex;}
#${IDS.modal} .path-order-import-card{width:1500px;max-width:calc(100vw - 36px);max-height:calc(100vh - 36px);display:flex;flex-direction:column;background:#fff;border-radius:8px;box-shadow:0 12px 38px rgba(0,0,0,.38);overflow:hidden;margin:auto;}
#${IDS.modal} .path-order-import-head{display:flex;align-items:center;justify-content:space-between;padding:12px 15px;background:#24a7df;color:#fff;font-size:16px;font-weight:bold;}
#${IDS.modal} .path-order-import-close,#${IDS.modal} .path-order-import-advanced-close,#${IDS.modal} .path-order-import-template-close{width:32px;padding:0;border:0;background:transparent;color:#fff;font-size:22px;}
#${IDS.modal} .path-order-import-content{padding:12px 14px;overflow:auto;}
#${IDS.modal} .path-order-import-note{padding:8px 10px;margin-bottom:9px;background:#fff8e8;border:1px solid #f1d68b;border-radius:5px;color:#795b00;line-height:1.6;}
#${IDS.modal} .path-order-import-source-label{display:block;margin-bottom:8px;color:#314b58;}
#${IDS.modal} .path-order-import-source{display:block;width:100%;height:108px;min-height:82px;margin-top:5px;box-sizing:border-box;font-family:Consolas,"Microsoft YaHei",sans-serif;line-height:1.5;}
#${IDS.modal} .path-order-import-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:8px;}
#${IDS.modal} .path-order-import-toolbar button{min-width:88px;}
#${IDS.modal} .path-order-import-execute{background:#16845b;border-color:#16845b;font-weight:bold;}
#${IDS.modal} .path-order-import-options{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:8px 0;padding:8px 10px;border:1px solid #cce6f0;border-radius:5px;background:#f4fbfe;}
#${IDS.modal} .path-order-import-options>label{display:inline-flex;align-items:center;gap:5px;margin:0;}
#${IDS.modal} .path-order-import-options input[type="checkbox"]{width:auto;}
#${IDS.modal} .path-order-import-edit-tools{display:flex;flex:1 1 100%;flex-wrap:wrap;align-items:center;gap:7px;padding-top:7px;border-top:1px dashed #c8e1eb;}
#${IDS.modal} .path-order-import-editor-switch{display:inline-flex;gap:0;}
#${IDS.modal} .path-order-import-editor-switch button{border-radius:0;}
#${IDS.modal} .path-order-import-editor-switch button:first-child{border-radius:4px 0 0 4px;}
#${IDS.modal} .path-order-import-editor-switch button:last-child{margin-left:-1px;border-radius:0 4px 4px 0;}
#${IDS.modal} .path-order-import-editor-switch button.active,#${IDS.modal} .path-order-import-toggle-secondary.active{position:relative;z-index:1;border-color:#159bd3;background:#e5f6fc;color:#117fac;font-weight:700;}
#${IDS.modal} .path-order-import-engine-note{flex:1 1 100%;color:#52636b;font-size:12px;line-height:1.55;}
#${IDS.modal} .path-order-import-status{margin-top:7px;padding:7px 9px;border-radius:4px;background:#edf8fc;color:#24566f;white-space:pre-line;}
#${IDS.modal} .path-order-import-status[data-type="success"]{background:#ecfdf3;color:#166534;}
#${IDS.modal} .path-order-import-status[data-type="warning"]{background:#fff7df;color:#8a5a00;}
#${IDS.modal} .path-order-import-status[data-type="error"]{background:#fff0ef;color:#b42318;}
#${IDS.modal} .path-order-import-summary{margin:8px 0 7px;padding:7px 9px;background:#edf8fc;color:#24566f;border-radius:4px;}
#${IDS.modal} .path-order-import-summary[data-type="success"]{background:#ecfdf3;color:#166534;}
#${IDS.modal} .path-order-import-summary[data-type="error"]{background:#fff0ef;color:#b42318;}
#${IDS.modal} .path-order-import-json-panel{display:none;margin:8px 0;}
#${IDS.modal} .path-order-import-json-mode .path-order-import-json-panel{display:block;}
#${IDS.modal} .path-order-import-json-mode .path-order-import-table-wrap{display:none;}
#${IDS.modal} .path-order-import-json-toolbar{display:flex;gap:7px;margin-bottom:6px;}
#${IDS.modal} .path-order-import-json-editor{width:100%;min-height:330px;box-sizing:border-box;padding:10px 12px;border:1px solid #b9d9e7;border-radius:5px;resize:vertical;font:12px/1.55 Consolas,"Microsoft YaHei",monospace;background:#fbfdfe;}
#${IDS.modal} .path-order-import-json-status{margin-top:6px;color:#52636b;font-size:12px;}
#${IDS.modal} .path-order-import-json-status[data-type="success"]{color:#16834d;}#${IDS.modal} .path-order-import-json-status[data-type="warning"]{color:#9a6500;}#${IDS.modal} .path-order-import-json-status[data-type="error"]{color:#c33b31;}
#${IDS.modal} .path-order-import-table-wrap{max-height:400px;overflow:auto;border:1px solid #dce5e9;border-radius:5px;}
#${IDS.modal} .path-order-import-table{min-width:2640px;table-layout:fixed;}
#${IDS.modal} .path-order-import-card:not(.path-order-import-secondary-visible) .path-order-import-secondary-column{display:none;}
#${IDS.modal} .path-order-import-card:not(.path-order-import-secondary-visible) .path-order-import-table{min-width:2400px;}
#${IDS.modal} .path-order-import-table th{position:sticky;top:0;z-index:2;background:#edf7fb;white-space:nowrap;}
#${IDS.modal} .path-order-import-table td{padding:4px;white-space:nowrap;vertical-align:middle;}
#${IDS.modal} .path-order-import-table td input,#${IDS.modal} .path-order-import-table td select,#${IDS.modal} .path-order-import-table td textarea{width:100%;}
#${IDS.modal} .path-order-import-table td textarea{height:42px;min-height:42px;resize:vertical;}
#${IDS.modal} .path-order-import-table th:nth-child(1){width:44px;}#${IDS.modal} .path-order-import-table th:nth-child(2){width:38px;}#${IDS.modal} .path-order-import-table th:nth-child(3){width:105px;}#${IDS.modal} .path-order-import-table th:nth-child(4){width:56px;}#${IDS.modal} .path-order-import-table th:nth-child(5){width:190px;}#${IDS.modal} .path-order-import-table th:nth-child(6){width:190px;}#${IDS.modal} .path-order-import-table th:nth-child(7){width:240px;}#${IDS.modal} .path-order-import-table th:nth-child(8){width:125px;}#${IDS.modal} .path-order-import-table th:nth-child(9){width:58px;}#${IDS.modal} .path-order-import-table th:nth-child(10){width:90px;}#${IDS.modal} .path-order-import-table th:nth-child(11){width:72px;}#${IDS.modal} .path-order-import-table th:nth-child(12){width:100px;}#${IDS.modal} .path-order-import-table th:nth-child(13){width:82px;}#${IDS.modal} .path-order-import-table th:nth-child(14){width:62px;}#${IDS.modal} .path-order-import-table th:nth-child(15){width:180px;}#${IDS.modal} .path-order-import-table th:nth-child(16){width:60px;}#${IDS.modal} .path-order-import-table th:nth-child(17){width:60px;}#${IDS.modal} .path-order-import-table th:nth-child(18){width:76px;}#${IDS.modal} .path-order-import-table th:nth-child(19){width:64px;}#${IDS.modal} .path-order-import-table th:nth-child(20){width:230px;}
#${IDS.modal} .path-order-import-row{cursor:pointer;}
#${IDS.modal} .path-order-import-row[data-origin="ai"] td{background:#fffdf3;}
#${IDS.modal} .path-order-import-row.invalid td{background:#fff7f6;}
#${IDS.modal} .path-order-import-row.selected td{background:#e8f7fd!important;box-shadow:inset 0 1px 0 #77c7e6,inset 0 -1px 0 #77c7e6;}
#${IDS.modal} .path-order-import-row.selected td:first-child{box-shadow:inset 3px 0 0 #159bd3,inset 0 1px 0 #77c7e6,inset 0 -1px 0 #77c7e6;}
#${IDS.modal} .path-order-import-row input.invalid,#${IDS.modal} .path-order-import-row select.invalid,#${IDS.modal} .path-order-import-row textarea.invalid,#${IDS.modal} .path-order-import-advanced.invalid{border-color:#e5483f;background:#fff0ef;color:#b42318;box-shadow:0 0 0 1px rgba(229,72,63,.12);}
#${IDS.modal} .path-order-import-move-box{display:flex;gap:3px;justify-content:center;}
#${IDS.modal} .path-order-import-move-box button{min-width:30px;padding:4px 6px;}
#${IDS.modal} .path-order-import-row-status{display:block;max-height:56px;overflow:auto;white-space:normal;line-height:1.45;text-align:left;}
#${IDS.modal} .path-order-import-row-status[data-type="success"]{color:#17884d;font-weight:bold;}#${IDS.modal} .path-order-import-row-status[data-type="error"]{color:#d13b31;font-weight:bold;}#${IDS.modal} .path-order-import-row-status[data-type="warning"]{color:#a16207;font-weight:bold;}
#${IDS.modal} .path-order-import-empty{padding:24px!important;color:#607d8b;text-align:center!important;}
#${IDS.modal} .path-order-import-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;}
#${IDS.modal} .path-order-import-risk-label{display:flex;align-items:center;gap:5px;margin-right:auto;padding:6px 8px;border-radius:4px;background:#fff7df;color:#7a5600;}
#${IDS.modal} .path-order-import-append{font-weight:bold;}
#${IDS.modal} .path-order-import-advanced-layer,#${IDS.modal} .path-order-import-template-layer{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.42);box-sizing:border-box;}
#${IDS.modal} .path-order-import-advanced-layer.show,#${IDS.modal} .path-order-import-template-layer.show{display:flex;}
#${IDS.modal} .path-order-import-advanced-card,#${IDS.modal} .path-order-import-template-card{width:760px;max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:#fff;border-radius:7px;box-shadow:0 10px 32px rgba(0,0,0,.35);overflow:hidden;}
#${IDS.modal} .path-order-import-template-card{width:900px;}
#${IDS.modal} .path-order-import-advanced-head,#${IDS.modal} .path-order-import-template-head{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;background:#24a7df;color:#fff;font-weight:bold;}
#${IDS.modal} .path-order-import-advanced-body,#${IDS.modal} .path-order-import-template-body{padding:13px;overflow:auto;}
#${IDS.modal} .path-order-import-advanced-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 12px;}
#${IDS.modal} .path-order-import-advanced-grid label,#${IDS.modal} .path-order-import-advanced-custom-label{display:flex;flex-direction:column;gap:4px;}
#${IDS.modal} .path-order-import-advanced-custom-label{margin-top:10px;}
#${IDS.modal} .path-order-import-advanced-custom{height:150px;font-family:Consolas,monospace;}
#${IDS.modal} .path-order-import-advanced-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}
#${IDS.modal} .path-order-import-template-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px;border-bottom:1px solid #e4edf1;}
#${IDS.modal} .path-order-import-template-row>div:first-child{display:flex;flex-direction:column;gap:3px;}
#${IDS.modal} .path-order-import-template-row>div:last-child{display:flex;gap:7px;}
#${IDS.modal} .path-order-import-template-row span{color:#6b7d85;font-size:12px;}
#${IDS.modal} .path-order-import-template-empty{padding:26px;text-align:center;color:#607d8b;}
#${IDS.modal} .path-run-groups{display:flex;gap:14px;flex-wrap:wrap;padding:8px;background:#f5fafc;border:1px solid #d9edf4;border-radius:5px;}
#${IDS.modal} .path-run-groups label,#${IDS.modal} .path-options label{display:flex;align-items:center;gap:5px;}
#${IDS.modal} .path-options{display:flex;gap:16px;flex-wrap:wrap;margin:9px 0;}
#${IDS.modal} .path-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
#${IDS.modal} .path-current-page-reverse-label{display:inline-flex;align-items:center;gap:4px;min-height:32px;padding:0 5px 0 1px;font-size:12px;color:#365b6b;white-space:nowrap;user-select:none;}
#${IDS.modal} .path-current-page-reverse-label input{margin:0;}
#${IDS.modal} .path-status-list{max-height:210px;overflow:auto;margin-top:9px;border:1px solid #e3e8eb;border-radius:4px;background:#fafcfd;}
#${IDS.modal} .path-status-row{padding:5px 8px;border-bottom:1px dashed #e3e8eb;font-size:12px;}
#${IDS.modal} .path-status-row[data-type="success"]{color:#17884d;font-weight:bold;}
#${IDS.modal} .path-status-row[data-type="error"]{color:#d13b31;font-weight:bold;}
#${IDS.modal} .path-status-row[data-type="warning"]{color:#a16207;font-weight:bold;}
#${IDS.modal} .path-scan-result{display:none;margin-top:9px;overflow:auto;border:1px solid #ddd;border-radius:4px;}
#${IDS.modal} table{width:100%;border-collapse:collapse;}
#${IDS.modal} th,#${IDS.modal} td{padding:5px;border-right:1px solid #e8ecef;border-bottom:1px solid #e3e8eb;font-size:12px;text-align:center;}
#${IDS.modal} td:last-child{text-align:left;}
#${IDS.modal} .scan-ok{color:#17884d;font-weight:bold;}
#${IDS.modal} .scan-error{color:#d13b31;font-weight:bold;}
#${IDS.modal} .path-tip{padding:9px 11px;background:#fff8e8;color:#795b00;border-radius:5px;font-size:12px;line-height:1.7;white-space:pre-line;}
#${IDS.modal} .path-ai-config-grid{display:grid;grid-template-columns:minmax(320px,2fr) minmax(210px,1fr);gap:9px;margin-bottom:10px;}
#${IDS.modal} .path-ai-config-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;}
#${IDS.modal} .path-ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
#${IDS.modal} .path-ai-card{padding:10px;border:1px solid #d6e6ed;border-radius:6px;background:#fbfdfe;}
#${IDS.modal} .path-ai-card-title{margin-bottom:7px;color:#117fac;font-size:13px;font-weight:bold;}
#${IDS.modal} .path-ai-prompt,#${IDS.modal} .path-ai-audit-context{width:100%;height:120px;min-height:90px;}
#${IDS.modal} .path-ai-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;}
#${IDS.modal} .path-ai-extract-card{grid-column:auto;}
#${IDS.modal} .path-ai-order-extract-prompt,#${IDS.modal} .path-ai-diagnosis-extract-prompt{width:100%;min-height:145px;}
#${IDS.modal} .path-ai-solidify-option{margin-left:auto;display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 8px;border:1px solid #b9d9e7;border-radius:5px;background:#f7fcfe;color:#117fac;font-size:12px;white-space:nowrap;cursor:pointer;box-sizing:border-box;}
#${IDS.modal} .path-ai-solidify-option input{margin:0;width:15px;height:15px;cursor:pointer;}
#${IDS.modal} .path-ai-solidify-option:hover{background:#eaf8fd;}
#${IDS.modal} .path-ai-order-extract-source,#${IDS.modal} .path-ai-diagnosis-extract-source{margin-top:8px;padding:6px 8px;border-radius:4px;background:#edf8fc;color:#24566f;font-size:12px;}
#${IDS.modal} .path-ai-order-extract-result-text,#${IDS.modal} .path-ai-diagnosis-extract-result-text{width:100%;min-height:150px;max-height:340px;margin-top:8px;resize:vertical;font-family:"Microsoft YaHei",Arial,sans-serif;line-height:1.75;background:#fff;}
#${IDS.modal} .path-ai-result{max-height:330px;overflow:auto;margin-top:9px;padding:9px;border:1px solid #dce5e9;border-radius:5px;background:#fff;font-size:12px;line-height:1.65;}
#${IDS.modal} .path-ai-empty{color:#718096;}
#${IDS.modal} .path-ai-result-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:7px;padding-bottom:7px;border-bottom:1px dashed #dce5e9;}
#${IDS.modal} .path-ai-description{margin:6px 0;padding:7px 8px;background:#f5fafc;border-radius:4px;}
#${IDS.modal} .path-ai-group-preview{margin:6px 0;padding:7px 8px;border-left:3px solid #159bd3;background:#f7fbfd;}
#${IDS.modal} .path-ai-result-block{margin:7px 0;padding:7px 8px;border-radius:4px;background:#f5fafc;}
#${IDS.modal} .path-ai-result-block.warning{background:#fff8e8;color:#795b00;}
#${IDS.modal} .path-ai-result-block.danger{background:#fff1ef;color:#a72f27;}
#${IDS.modal} .path-ai-result-block ul{margin:5px 0 0 18px;padding:0;}
#${IDS.modal} .path-ai-manual-result{white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0;padding:9px 10px;border-radius:5px;background:#f5fafc;line-height:1.75;}
#${IDS.modal} .path-ai-finding{margin:7px 0;padding:8px;border:1px solid #dde6ea;border-radius:4px;background:#fafcfd;}
#${IDS.modal} .path-ai-finding[data-severity="high"],#${IDS.modal} .path-ai-finding[data-severity="critical"]{border-color:#efb4ae;background:#fff2f0;}
#${IDS.modal} .path-ai-json-details{margin-top:8px;}
#${IDS.modal} .path-ai-json-details summary{cursor:pointer;color:#117fac;}
#${IDS.modal} .path-ai-json-details pre{max-height:260px;overflow:auto;padding:8px;background:#1f2937;color:#f8fafc;border-radius:4px;font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;}
#${IDS.modal} .path-ai-safe-note{margin-top:8px;padding:8px;background:#fff8e8;color:#795b00;border-radius:4px;}
#${IDS.modal} .path-ai-risk{padding:2px 8px;border-radius:10px;background:#fff3cd;color:#795b00;font-weight:bold;}
#${IDS.modal} .path-ai-risk[data-risk="low"]{background:#e8f7ee;color:#166534;}
#${IDS.modal} .path-ai-risk[data-risk="high"],#${IDS.modal} .path-ai-risk[data-risk="critical"]{background:#feeceb;color:#b42318;}
#${IDS.modal} .path-ai-tip{margin-top:9px;padding:8px 10px;border-radius:4px;background:#fff8e8;color:#795b00;font-size:12px;line-height:1.65;}
#${IDS.modal} .path-general-warning-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:9px;}
#${IDS.modal} .path-general-warning-toolbar label{display:flex;align-items:center;gap:5px;}
#${IDS.modal} .path-general-warning-threshold{width:70px;}
#${IDS.modal} .path-general-warning-config{display:grid;grid-template-columns:minmax(360px,1fr) minmax(420px,1.2fr);gap:10px;margin-bottom:9px;}
#${IDS.modal} .path-general-warning-card{padding:9px 10px;border:1px solid #d6e6ed;border-radius:5px;background:#fbfdfe;}
#${IDS.modal} .path-general-warning-card-title{margin-bottom:7px;color:#117fac;font-size:12px;font-weight:bold;}
#${IDS.modal} .path-general-warning-types{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
#${IDS.modal} .path-general-warning-types label,#${IDS.modal} .path-general-warning-scope-wrap label{display:flex;align-items:center;gap:4px;}
#${IDS.modal} .path-general-warning-scope-wrap{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:7px;}
#${IDS.modal} .path-general-warning-specified-items{width:100%;height:92px;min-height:70px;resize:vertical;font-family:Consolas,"Microsoft YaHei",sans-serif;}
#${IDS.modal} .path-general-warning-specified-items.disabled{background:#f3f5f6;color:#8a949b;}
#${IDS.modal} .path-general-warning-syntax-status{margin-top:6px;padding:6px 8px;border-radius:4px;font-size:11px;line-height:1.55;background:#f3f6f8;color:#64727b;}
#${IDS.modal} .path-general-warning-syntax-status.valid{background:#edf9f1;color:#217a45;}
#${IDS.modal} .path-general-warning-syntax-status.invalid{background:#fff1ef;color:#b42318;}
#${IDS.modal} .path-general-warning-syntax-status.idle{background:#f3f6f8;color:#64727b;}
#${IDS.modal} .path-general-warning-summary{padding:8px 10px;border-radius:4px;background:#edf8fc;color:#24566f;font-size:12px;line-height:1.65;}
#${IDS.modal} .path-general-warning-table-wrap{max-height:280px;overflow:auto;margin-top:8px;border:1px solid #dce5e9;border-radius:5px;background:#fff;}
#${IDS.modal} .path-general-warning-table{min-width:900px;}
#${IDS.modal} .path-general-warning-state{display:inline-block;padding:2px 7px;border-radius:10px;background:#edf8fc;color:#117fac;white-space:nowrap;}
#${IDS.modal} .path-general-warning-state[data-level="warning"]{background:#fff4cc;color:#8a5a00;}
#${IDS.modal} .path-general-warning-state[data-level="danger"]{background:#feeceb;color:#b42318;font-weight:bold;}
#${IDS.modal} .path-general-warning-state[data-level="unknown"]{background:#f1f3f5;color:#5f6b73;}
#${IDS.modal} .path-general-warning-state[data-level="stopped"]{background:#edf0f2;color:#4f5961;}
#${IDS.modal} .path-general-warning-note{margin-top:8px;padding:8px 10px;border-radius:4px;background:#fff8e8;color:#795b00;font-size:12px;line-height:1.65;}
@media(max-width:1050px){#${IDS.modal} .path-general-warning-config{grid-template-columns:1fr;}}
#${IDS.modal} .path-footer{display:flex;justify-content:flex-end;padding:11px 15px;border-top:1px solid #e5e7eb;background:#fafafa;}
@media(max-width:1050px){#${IDS.modal} .path-ai-grid,#${IDS.modal} .path-ai-config-grid{grid-template-columns:1fr;}}
`;
        document.head.appendChild(style);
    }

    function createModal() {
        let modal = document.getElementById(IDS.modal);
        if (modal) return modal;
        ensureStyle();
        modal = document.createElement('div');
        modal.id = IDS.modal;
        modal.innerHTML = `
<div class="path-mask"></div>
<div class="path-dialog">
  <div class="path-header"><span>临床路径与组套跨标签页自动录入</span><button class="path-close">×</button></div>
  <div class="path-body">
    <div class="path-section" data-section-key="path-management">
      <div class="path-title"><span>病种分类与路径管理</span><button type="button" class="path-section-toggle">折叠</button></div>
      <div class="path-section-content">
        <div class="path-toolbar">
          <select class="path-category"></select>
          <button class="path-category-add">新增分类</button><button class="path-category-rename secondary">重命名</button><button class="path-category-delete danger">删除</button>
          <select class="path-pathway"></select>
          <button class="path-pathway-add">新增路径</button><button class="path-pathway-copy secondary">复制</button><button class="path-pathway-rename secondary">重命名</button><button class="path-pathway-delete danger">删除</button>
          <button class="path-export">导出全部</button><button class="path-import secondary">导入</button>
        </div>
        <div class="path-meta"><input class="path-description" placeholder="路径说明、适用条件、排除条件"><input class="path-version" placeholder="版本"></div>
      </div>
    </div>

    <div class="path-section" data-section-key="group-editor">
      <div class="path-title"><span>组套管理与条目编辑　<span class="path-gui-count">0条</span></span><button type="button" class="path-section-toggle">折叠</button></div>
      <div class="path-section-content">
        <div class="path-toolbar">
          <select class="path-group"></select>
          <button class="path-group-add">新增组套</button><button class="path-group-copy secondary">复制组套</button><button class="path-group-rename secondary">重命名</button><button class="path-group-delete danger">删除组套</button>
          <button class="path-add-example secondary">末尾新增空白条目</button><button class="path-insert-after secondary" disabled>在选中行后插入空白</button><button class="path-save-json">保存当前组套</button>
          <div class="path-editor-switch"><button type="button" class="path-mode-gui active">GUI图形化编辑</button><button type="button" class="path-mode-json">JSON代码编辑</button></div>
          <button type="button" class="path-toggle-secondary-directory secondary" aria-pressed="false" title="显示二级目录检索名称列">显示二级目录</button>
          <div class="path-selection-actions">
            <button type="button" class="path-enable-all secondary">全选</button>
            <button type="button" class="path-enable-none secondary">全不选</button>
            <button type="button" class="path-delete-enabled danger">删除已勾选</button>
          </div>
        </div>
        <div class="path-editor-panel path-editor-gui active">
          <div class="path-gui-wrap">
            <table class="path-gui-table">
              <thead><tr><th>启用</th><th>序</th><th>标签页</th><th>长临</th><th>名称/指示</th><th class="path-search-name-header">检索名称</th><th class="path-secondary-directory-column">二级目录检索名称</th><th>执行科室</th><th>组号</th><th>剂量/每次治疗量</th><th>单位</th><th>用法</th><th>频次</th><th>天数</th><th>嘱托/备注</th><th>高级</th><th>复制</th><th>排序</th><th>删除</th><th>状态</th></tr></thead>
              <tbody class="path-gui-body"></tbody>
            </table>
          </div>
        </div>
        <div class="path-editor-panel path-editor-json">
          <div class="path-json-toolbar"><button type="button" class="path-json-format secondary">格式化JSON</button><button type="button" class="path-json-apply">应用JSON到GUI草稿</button><span>合法JSON自动同步到草稿；点击“保存当前组套”后才正式保存。</span></div>
          <textarea class="path-group-json"></textarea>
        </div>
        <div class="path-editor-status" data-type="success">GUI与JSON显示的是同一组套数据。</div>
      </div>
    </div>

    <div class="path-section" data-section-key="execution-progress">
      <div class="path-title"><span>执行、扫描与进度</span><button type="button" class="path-section-toggle">折叠</button></div>
      <div class="path-section-content">
        <div class="path-run-groups"></div>
        <div class="path-options">
          <label><input type="checkbox" class="path-auto-save">逐标签页自动保存</label>
          <label><input type="checkbox" class="path-continue-error" checked>单条失败后继续</label>
          <label title="仅自动确认“已在长期或临时医嘱中使用，是否继续保存”提示；其他用药安全警告不会自动处理。"><input type="checkbox" class="path-ignore-duplicate-medication">忽略重复用药提示（自动确认）</label>
          <label title="未勾选时按检查项目数量预开独立申请单标签页，每项检查各占一个；勾选后屏蔽可见申请单页面。"><input type="checkbox" class="path-suppress-check-popup">屏蔽检查申请单</label>
          <label title="未勾选时按检验项目数量预开独立申请单标签页，每项检验各占一个；勾选后屏蔽可见申请单页面。"><input type="checkbox" class="path-suppress-lab-popup">屏蔽检验申请单</label>
        </div>
        <div class="path-actions"><button class="path-scan">扫描涉及的标签页</button><button class="path-run">执行勾选组套</button><button class="path-pause secondary" disabled>暂停</button><button class="path-abort danger" disabled>中止</button><button class="path-clear-status secondary">清空状态</button><button class="path-delete-all-orders danger" title="删除当前患者医嘱查询当前筛选结果中所有带删除入口的医嘱">一键全删医嘱</button><button class="path-local-delete-open secondary" title="单选或多选当前医嘱查询页中的医嘱，仅从本浏览器DOM和本地提取范围移除，不向服务器发送删除/停止/作废请求">本地删除指定医嘱</button><button class="path-add-current-page-orders secondary" title="读取当前医嘱查询页或当前医嘱录入标签页的可见医嘱，并直接追加到当前组套草稿末尾；右侧可勾选反向排序">当前页医嘱加入组套</button><label class="path-current-page-reverse-label" title="仅作用于左侧“当前页医嘱加入组套”：勾选后将当前页识别到的医嘱顺序整体倒置后再去重并追加；不改变HIS页面、不影响住院医嘱开立工作区。"><input type="checkbox" class="path-add-current-page-orders-reverse">反向排序</label><button class="path-inpatient-order-open" title="打开独立住院医嘱开立：当前页/粘贴/AI解析、可编辑草稿及跨类型执行已勾选">住院医嘱开立</button></div>
        <div class="path-status-list"></div>
        <div class="path-scan-result"><table><thead><tr><th>标签页</th><th>结果</th><th>行数</th><th>表头/错误</th></tr></thead><tbody class="path-scan-body"></tbody></table></div>
      </div>
    </div>

    <div class="path-section" data-section-key="general-warning" data-default-collapsed="false">
      <div class="path-title"><span>通用长期医嘱预警系统</span><button type="button" class="path-section-toggle">折叠</button></div>
      <div class="path-section-content">
        <div class="path-general-warning-toolbar">
          <label><input type="checkbox" class="path-general-warning-auto-scan">自动扫描当前医嘱查询页</label>
          <label><input type="checkbox" class="path-general-warning-render">开启医嘱界面渲染</label>
          <label title="勾选后将已停止的长期医嘱纳入通用预警结果；开启医嘱界面渲染时，在原医嘱名称处显示“已停X天”。已停天数严格依据停止时间列计算，默认关闭。"><input type="checkbox" class="path-general-warning-warn-stopped">预警已停医嘱</label>
          <label title="勾选后在当前医嘱查询表中隐藏已停止的长期医嘱。判定依据为停止时间已到或状态列显示停止/停嘱；只改变前端显示，不删除、不修改医嘱。"><input type="checkbox" class="path-general-warning-hide-stopped">隐藏已停医嘱</label>
          <label title="勾选后，仅隐藏明确为临时医嘱且“状态”列本身为“作废/已作废”的记录。不会再依据整行红色、整行文字或最右侧“操作”列的“作废”按钮判定。只改变前端显示，不删除、不修改医嘱。"><input type="checkbox" class="path-general-warning-hide-voided-temporary">隐藏作废临时医嘱</label>
          <label>持续天数预警阈值 <input type="number" min="1" step="1" class="path-general-warning-threshold" value="10"> 天</label>
          <button type="button" class="path-general-warning-scan">扫描当前长期医嘱</button>
          <button type="button" class="path-general-warning-clear secondary">清除预警结果</button>
        </div>
        <div class="path-general-warning-config">
          <div class="path-general-warning-card">
            <div class="path-general-warning-card-title">统计医嘱类型（可多选）</div>
            <div class="path-general-warning-types">
              <label><input type="checkbox" class="path-general-warning-type" value="康复">康复</label>
              <label><input type="checkbox" class="path-general-warning-type" value="文字">文字</label>
              <label><input type="checkbox" class="path-general-warning-type" value="项目">项目</label>
              <label><input type="checkbox" class="path-general-warning-type" value="耗材">耗材</label>
              <label><input type="checkbox" class="path-general-warning-type" value="检验">检验</label>
              <label><input type="checkbox" class="path-general-warning-type" value="检查">检查</label>
              <label><input type="checkbox" class="path-general-warning-type" value="药品">药品</label>
              <label><input type="checkbox" class="path-general-warning-type" value="中草药">中草药</label>
              <label><input type="checkbox" class="path-general-warning-type" value="出院带药">出院带药</label>
            </div>
          </div>
          <div class="path-general-warning-card">
            <div class="path-general-warning-card-title">统计项目范围</div>
            <div class="path-general-warning-scope-wrap">
              <label><input type="radio" name="path-general-warning-scope" class="path-general-warning-scope" value="all">所选类型下全部长期医嘱</label>
              <label><input type="radio" name="path-general-warning-scope" class="path-general-warning-scope" value="specified">仅自定义指定项目</label>
            </div>
            <textarea class="path-general-warning-specified-items" placeholder="必须使用：[字段范围]&quot;检索内容&quot;&#10;例如：[康复][文字]&quot;常规针法*&quot;&#10;[*]&quot;*针法*&quot; 表示全部类型；* 可位于任意位置&#10;自定义模式下左侧与右侧双向同步：勾选康复会自动增加 [康复]&quot;*&quot;；取消康复会从现有规则中删除[康复]声明"></textarea>
            <div class="path-general-warning-syntax-status idle">切换到“仅自定义指定项目”后启用规则语法。</div>
          </div>
        </div>
        <div class="path-general-warning-summary">尚未扫描到符合当前设置的长期医嘱。</div>
        <div class="path-general-warning-table-wrap">
          <table class="path-general-warning-table">
            <thead><tr><th>序</th><th>类型</th><th>医嘱名称</th><th>开始日期</th><th>停止日期</th><th>当前/已停</th><th>状态</th></tr></thead>
            <tbody class="path-general-warning-body"></tbody>
          </table>
        </div>
        <div class="path-general-warning-note">计算规则：“隐藏作废临时医嘱”只认医嘱查询表中明确为临时医嘱且“状态”列本身为“作废/已作废”的记录；不再依据整行红色、整行文字或“操作”列的“作废”按钮判定，取消勾选即恢复显示。“预警已停医嘱”默认关闭；开启后才将已停止长期医嘱纳入通用预警并渲染“已停X天”。“隐藏已停医嘱”独立控制当前医嘱查询表中已停止长期医嘱的前端显示，不删除或修改医嘱。执行中医嘱的“第X天”按开立日期至今天的自然日计算并包含开立当日；已停天数严格以“停止时间”列为起点计算（停止当天为0天），停止状态存在但停止时间无法识别时显示“已停时间未知”，不再用开始时间代替。自定义指定项必须使用“[字段范围]&quot;检索内容&quot;”语法：[*]表示全部医嘱类型，[康复][文字]表示同一检索式同时限定康复与文字；[康复][文字]&quot;常规针法*&quot; 与 [康复]&quot;常规针法*&quot;[文字]&quot;常规针法*&quot; 含义相同。* 或 ＊ 是任意长度通配符，可放在检索内容开头、中间或末尾；没有*时按规范化后的完整名称匹配。自定义规则有效时，字段范围与左侧勾选双向同步：右侧声明会同步左侧；左侧新增勾选会自动追加[类型]&quot;*&quot;，取消勾选会从右侧所有规则中删除对应字段声明；若原规则使用[*]，取消某类型时会自动展开为其余具体字段。[*]会使全部类型勾选。前端仅显示“第X天/已停X天”，不再计算单价和累计费用。通用预警渲染优先级低于药品预警和中药预警：同一医嘱名称单元格已有上述高优先级标记时，通用预警不重复渲染。CPU优化：规则解析只在配置变化时进行，医嘱扫描继续沿用MutationObserver、防抖、后台暂停和12秒低频兜底，不增加滚动监听。</div>
      </div>
    </div>

    <div class="path-section" data-section-key="ai-assistant" data-default-collapsed="false">
      <div class="path-title"><span>DeepSeek临床路径生成、当前页医嘱审核与信息提取</span><button type="button" class="path-section-toggle">折叠</button></div>
      <div class="path-section-content">
        <div class="path-ai-config-grid">
          <label>DeepSeek API Key<input type="password" class="path-ai-key" placeholder="sk-...；仅保存在当前油猴脚本存储中"></label>
          <label>模型<input type="text" class="path-ai-model" placeholder="例如 deepseek-chat"></label>
        </div>
        <div class="path-ai-grid">
          <div class="path-ai-card">
            <div class="path-ai-card-title">根据提示词生成推荐临床路径</div>
            <textarea class="path-ai-prompt" placeholder="示例：为腰椎间盘突出伴神经根病住院患者设计中西医结合临床路径，适用于病情稳定、无急诊手术指征者；包括入院评估、基础检验检查、药物、针灸推拿、康复评定、疗效复评和出院计划。请结合本院现有标签页和医嘱字段，避免超范围检查及重复用药。"></textarea>
            <div class="path-ai-actions">
              <button type="button" class="path-ai-generate">生成推荐临床路径</button>
              <button type="button" class="path-ai-create-path secondary" disabled>创建为新路径</button>
              <button type="button" class="path-ai-clear-generation secondary">清空结果</button>
            </div>
            <div class="path-ai-result path-ai-generation-result"><div class="path-ai-empty">尚未生成推荐临床路径。</div></div>
          </div>
          <div class="path-ai-card">
            <div class="path-ai-card-title">AI审核当前页可见医嘱</div>
            <textarea class="path-ai-audit-context" placeholder="可选：粘贴患者年龄、性别、诊断、过敏史、肝肾功能、化验检查、治疗目标及其他需要AI重点审核的内容。留空时仅依据当前页医嘱和当前临床路径进行初步审核。"></textarea>
            <div class="path-ai-actions">
              <button type="button" class="path-ai-audit">审核当前页医嘱</button>
              <button type="button" class="path-ai-clear-audit secondary">清空结果</button>
              <button type="button" class="path-ai-manual-audit secondary">手动录入/修改</button>
            </div>
            <div class="path-ai-result path-ai-audit-result"><div class="path-ai-empty">尚未审核当前页医嘱。</div></div>
          </div>
          <div class="path-ai-card path-ai-extract-card">
            <div class="path-ai-card-title">提取当前页医嘱关键信息</div>
            <textarea class="path-ai-order-extract-prompt" placeholder="可自定义当前页医嘱整理格式与归纳规则。"></textarea>
            <div class="path-ai-actions">
              <button type="button" class="path-ai-extract-orders">提取当前页医嘱关键信息</button>
              <button type="button" class="path-ai-copy-extract secondary" disabled>一键复制</button>
              <button type="button" class="path-ai-clear-extract secondary" disabled>清空结果</button>
              <button type="button" class="path-ai-reset-extract-prompt secondary">恢复默认提示词</button>
              <button type="button" class="path-ai-manual-extract secondary">手动录入/修改</button>
              <label class="path-ai-solidify-option" title="勾选：沿用当前固定systemPrompt业务约束；未勾选：仅保留事实约束和JSON格式，自定义提示词决定具体整理行为。"><input type="checkbox" class="path-ai-order-extract-solidify">固化提示词</label>
            </div>
            <div class="path-ai-order-extract-source">尚未提取当前页医嘱。</div>
            <textarea class="path-ai-order-extract-result-text" readonly placeholder="DeepSeek整理后的当前页医嘱关键信息会显示在这里，可直接一键复制。"></textarea>
          </div>
          <div class="path-ai-card path-ai-extract-card">
            <div class="path-ai-card-title">提取基本诊断信息</div>
            <textarea class="path-ai-diagnosis-extract-prompt" placeholder="可自定义基本诊断信息提取与输出规则。"></textarea>
            <div class="path-ai-actions">
              <button type="button" class="path-ai-extract-diagnosis">提取基本诊断信息</button>
              <button type="button" class="path-ai-copy-diagnosis-extract secondary" disabled>一键复制</button>
              <button type="button" class="path-ai-clear-diagnosis-extract secondary" disabled>清空结果</button>
              <button type="button" class="path-ai-reset-diagnosis-extract-prompt secondary">恢复默认提示词</button>
              <button type="button" class="path-ai-manual-diagnosis-extract secondary">手动录入/修改</button>
              <label class="path-ai-solidify-option" title="勾选：沿用当前固定systemPrompt业务约束；未勾选：仅保留事实约束和JSON格式，自定义提示词决定具体诊断提取行为。"><input type="checkbox" class="path-ai-diagnosis-extract-solidify">固化提示词</label>
            </div>
            <div class="path-ai-diagnosis-extract-source">尚未提取基本诊断信息。</div>
            <textarea class="path-ai-diagnosis-extract-result-text" readonly placeholder="DeepSeek整理后的西医入院诊断会显示在这里，可直接一键复制。"></textarea>
          </div>
        </div>
        <div class="path-ai-tip">AI安全规则：生成结果先预览，只有再次点击“创建为新路径”后才写入路径库；AI生成的所有条目默认不启用。当前页医嘱审核和医嘱关键信息提取只读取页面可见医嘱；基本诊断信息提取只读取当前页可访问的诊断相关文本，均不会自动修改、删除、保存或执行任何医嘱或诊断。三个结果区均支持“手动录入/修改”：独立二级编辑窗会自动载入已有结果，保存只覆盖当前页面会话中的对应结果，取消不作改动，不发起DeepSeek请求。医嘱关键信息提取和基本诊断信息提取均支持“固化提示词”：勾选时保留历史完整systemPrompt业务约束；未勾选时松绑业务systemPrompt，仅保留事实约束与JSON返回格式，由各自自定义提示词决定具体整理规则；该模式会同步提供给查房本接口。默认提示词中的示例内容仅用于规定格式，不会自动补入页面不存在的信息。DeepSeek不是实时联网指南或官方说明书数据库，所有结果必须结合最新指南、药品说明书、本院制度和患者实际情况人工复核。</div>
      </div>
    </div>

    <div class="path-section" data-section-key="usage-help" data-default-collapsed="false">
      <div class="path-title"><span>使用原则</span><button type="button" class="path-section-toggle">折叠</button></div>
      <div class="path-section-content">
        <div class="path-tip">1. 本脚本只执行由医师自行建立的路径组套，不预置具体诊疗方案。
2. 组套条目可在“GUI图形化编辑”和“JSON代码编辑”之间切换；两者实时同步的是临时草稿，不再自动写入油猴存储。只有点击“保存当前组套”后修改才正式生效；按钮始终保持原来的文字和样式，未保存状态通过编辑区提示显示。关闭窗口或刷新页面会恢复上次保存版本。
3. “全选、全不选、删除已勾选”位于组套工具栏右侧；复制、排序、删除、插入和高级设置等操作也只修改草稿。存在未保存修改时，切换分类、路径、组套以及执行、扫描会被阻止，需先保存或关闭窗口放弃修改。
4. 病种分类与路径管理、组套管理与条目编辑、执行扫描与进度、DeepSeek辅助、使用原则均可独立折叠，折叠状态会自动记忆。DeepSeek区支持“提取当前页医嘱关键信息”和“提取基本诊断信息”，两者提示词均可自定义并记忆、结果均可一键复制；两个提取区分别提供“固化提示词”开关，默认勾选以保持历史systemPrompt约束，取消勾选后由自定义提示词主导业务规则，并与查房本桥接同步；AI医嘱审核、医嘱关键信息和基本诊断三个结果区均支持在独立二级窗口手动录入/修改；医嘱提取仅读取当前页面已识别到的可见医嘱，诊断提取优先读取当前页明确的入院诊断/初步诊断/西医诊断相关区域。
5. 项目录入按预设选择执行科室；康复医嘱会选择收费项目、等待执行科室和单位回填、填写每次治疗量，并最后选择频次。康复执行科室也可在GUI中预设覆盖。
6. 药品支持同类剂量单位换算和自付比例最小值；中草药自动兼容旧版逐行设置与新版底部统一设置，新版会在全部药味完成后统一填写剂数、用法、代煎等参数。
7. 批量执行勾选组套时，严格按照GUI“序”列从最小行开始逐级递增，允许跨标签页切换；各普通标签页独立累计医嘱行号。检查和检验项目进入右侧候选框后，均逐项点击“保存申请单”再继续下一项。
8. “忽略重复用药提示”首次使用默认关闭，之后记忆上次选择。勾选后仅自动确认“药品已在长期或临时医嘱中使用，是否继续保存”这一类提示；配伍禁忌、过敏、剂量异常和其他用药警告不会自动跳过。
9. 跨标签页自动保存后，各标签页的草稿行计数会立即归零。再次进入文字录入等页面时，只按本轮待录入条数新建行，不会把先前已经保存的医嘱行数再次添加为空白行。
10. “一键全删医嘱”仅删除当前患者“医嘱查询”当前筛选结果中带红色“删除”入口的记录。执行时会自动把医嘱表格横向移动到最右侧操作列，并联合识别主数据表与固定操作列；每删除一条并刷新列表后都会重新定位操作列和复扫，直至确实不存在删除入口。完成后恢复原横向位置。点击后仍需先进行一次总确认，逐条删除确认由脚本自动处理。
11. 未勾选对应的屏蔽选项时，用户确认执行后，脚本会按真实执行顺序，为全部未屏蔽的检查和检验项目同步预开等量独立标签页；每项申请单各占一个，不会被后一项覆盖。勾选“屏蔽检查申请单”或“屏蔽检验申请单”后，仅屏蔽对应类型。若浏览器未允许打开足够数量，任务会在保存前停止。
12. 工具栏顶部“显示二级目录/隐藏二级目录”用于切换GUI排版。关闭时采用v1.26布局：名称/指示、检索名称分别显示，不显示二级目录列，共19列；打开时采用v1.27布局：检索名称表头改为“一级/下拉检索名称”，并显示“二级目录检索名称”，共20列。隐藏二级目录不会清除secondarySearchName数据，显示状态会自动记忆。
13. 检验条目执行时，“检索名称”用于左上方下拉菜单，“二级目录检索名称”用于下拉组套选中后在左侧树状列表精确点击叶子项目。例如检索名称填写“生化17项”，二级目录填写“生化17（肝功10项，肾功4项，血脂3项）”。二级留空时沿用一级名称，以兼容旧组套。脚本仍不会操作树状列表上方“组套名称简拼”搜索栏。
14. “当前页医嘱加入组套”读取当前医嘱查询页或当前医嘱录入标签页的可见医嘱，去重并确认后直接追加到当前组套草稿；按钮右侧“反向排序”默认关闭并自动记忆，勾选后仅将本次当前页识别顺序整体倒置后追加，不按时间字段另行排序，也不影响独立“住院医嘱开立”工作区。该入口不会打开解析窗口，也不会直接执行HIS医嘱。
15. DeepSeek路径生成功能只生成候选路径。AI结果先在页面中预览，点击“创建为新路径”后才写入当前病种分类；全部AI条目默认不启用，必须人工核对名称、检索名称、剂量、单位、用法、频次、执行科室、检验二级目录和适用条件后再勾选。
16. “审核当前页医嘱”读取当前医嘱查询页或具体录入标签页中可见医嘱，并结合可选的患者资料及当前临床路径进行AI辅助审核。结果不会自动修改、删除、保存或执行医嘱，也不能替代医师和药师审核。
17. DeepSeek结果属于AI知识整理，不是实时联网指南、官方说明书或医院制度数据库；涉及禁忌、剂量调整、相互作用、抗菌药物、妊娠、过敏、肝肾功能和高风险治疗时，必须核对最新权威资料及患者实际信息。
18. 康复预警系统仅分析当前医嘱查询页可见的长期康复医嘱。持续天数按自然日含开立日估算；单价来自悬浮框管理器统一公共项目收费库，累计费用按“单价×持续天数”估算。实际执行次数、停做、请假、拒绝治疗、医保限制和收费冲销不在该估算内，最终以医院收费明细为准。
19. “本地删除指定医嘱”支持当前医嘱查询页单选或多选。它不会点击医院“删除/作废/停止”，也不会请求服务器；脚本仅按当前患者住院号保存本地排除签名，并把匹配的主表行及固定列复制行从当前DOM中移除。普通“隐藏已停/隐藏作废”只是CSS隐藏，而本地删除采用DOM detach，因此住院信息脚本即使读取隐藏医嘱，也无法从当前页DOM提取已本地删除记录。服务器原始医嘱始终存在；清除本患者本地删除记录后重新查询/刷新即可恢复。
20. “住院医嘱开立”支持当前页读取、手动粘贴、本地/AI解析、空白行、GUI/JSON双编辑、模板、复制排序、高级字段及加入当前组套草稿；“执行已勾选”直接复用本脚本九类住院医嘱跨标签执行引擎，不调用门诊开立逻辑，也不要求先保存为组套。执行前必须通过类型化必填校验并勾选人工核对确认项；确认框会同时显示来源患者和当前执行患者，自动保存、遇错继续、重复用药提示及检查/检验申请单屏蔽规则与主执行区双向同步。</div>
      </div>
    </div>
  </div>
  <div class="path-footer"><button class="path-hide secondary">隐藏窗口（后台任务继续）</button></div>
  <div class="path-order-import-layer">
    <div class="path-order-import-card">
      <div class="path-order-import-head"><span>住院医嘱开立</span><button type="button" class="path-order-import-close">×</button></div>
      <div class="path-order-import-content">
        <div class="path-order-import-note">这是独立的住院医嘱开立工作区，与“当前页医嘱加入组套”互不替代。功能区参考门诊助手，但录入字段、必填校验、标签切换和执行过程全部复用本脚本针对住院系统适配的临床路径引擎；门诊医嘱开立逻辑不会在此调用。</div>
        <label class="path-order-import-source-label">医嘱资料或AI整理要求
          <textarea class="path-order-import-source" placeholder="可粘贴或修改住院医嘱：支持JSON、从HIS表格复制的制表符文本、住院信息脚本的【医嘱1】结构化文本，以及一行一条的普通医嘱。\n示例：长  阿司匹林肠溶片 100mg po qd\n临  心电图 st"></textarea>
        </label>
        <div class="path-order-import-toolbar">
          <button type="button" class="path-order-import-read">读取当前页医嘱</button>
          <button type="button" class="path-order-import-ai-parse">AI解析医嘱</button>
          <button type="button" class="path-order-import-local-parse secondary">解析粘贴文本</button>
          <button type="button" class="path-order-import-manual secondary">手动录入/修改</button>
          <button type="button" class="path-order-import-add secondary">新增空白行</button>
          <button type="button" class="path-order-import-execute" disabled>执行已勾选</button>
          <button type="button" class="path-order-import-pause secondary" disabled>暂停</button>
          <button type="button" class="path-order-import-stop danger" disabled>中止</button>
          <button type="button" class="path-order-import-clear secondary">清空草稿</button>
          <button type="button" class="path-order-import-template-manage secondary">模板管理</button>
        </div>
        <div class="path-order-import-options">
          <label><input type="checkbox" class="path-order-import-auto-save">逐标签页自动保存</label>
          <label><input type="checkbox" class="path-order-import-continue-error">单条失败后继续</label>
          <label title="只自动确认重复用药继续保存提示，不跳过其他安全警告"><input type="checkbox" class="path-order-import-ignore-duplicate">忽略重复用药提示</label>
          <label><input type="checkbox" class="path-order-import-suppress-check">屏蔽检查申请单</label>
          <label><input type="checkbox" class="path-order-import-suppress-lab">屏蔽检验申请单</label>
          <button type="button" class="path-order-import-template-save secondary">存为模板</button>
          <div class="path-order-import-edit-tools">
            <button type="button" class="path-order-import-insert-after secondary">在选中行后插入空白</button>
            <span class="path-order-import-editor-switch"><button type="button" class="path-order-import-mode-gui secondary active" aria-pressed="true">GUI图形化编辑</button><button type="button" class="path-order-import-mode-json secondary" aria-pressed="false">JSON代码编辑</button></span>
            <button type="button" class="path-order-import-select-all secondary">全选</button>
            <button type="button" class="path-order-import-select-none secondary">全不选</button>
            <button type="button" class="path-order-import-delete-enabled danger">删除已勾选</button>
            <button type="button" class="path-order-import-toggle-secondary secondary active" aria-pressed="true">隐藏二级目录</button>
          </div>
          <span class="path-order-import-engine-note">直接执行沿用住院临床路径的九类型跨标签录入、同组、剂量单位换算、自付比例、康复科室/治疗量及检查检验申请单处理。</span>
        </div>
        <div class="path-order-import-status" data-type="normal">首次打开会尝试读取当前页；也可直接粘贴、AI解析或新增空白行。</div>
        <div class="path-order-import-summary">尚无住院医嘱草稿。</div>
        <div class="path-order-import-json-panel">
          <div class="path-order-import-json-toolbar"><button type="button" class="path-order-import-json-format secondary">格式化JSON</button><button type="button" class="path-order-import-json-apply">应用JSON到草稿</button></div>
          <textarea class="path-order-import-json-editor" spellcheck="false" placeholder='可编辑 {"items":[...]} 或直接填写住院医嘱数组。'></textarea>
          <div class="path-order-import-json-status" data-type="success">JSON与住院医嘱图形化草稿已同步。</div>
        </div>
        <div class="path-order-import-table-wrap">
          <table class="path-order-import-table">
            <thead><tr><th>启用</th><th>序</th><th>标签页</th><th>长临</th><th>名称/指示</th><th>一级/下拉检索名称</th><th class="path-order-import-secondary-column">二级目录检索名称</th><th>执行科室</th><th>组号</th><th>剂量/每次治疗量</th><th>单位</th><th>用法</th><th>频次</th><th>天数</th><th>嘱托</th><th>高级</th><th>复制</th><th>排序</th><th>删除</th><th>校验/执行状态</th></tr></thead>
            <tbody class="path-order-import-body"><tr><td colspan="20" class="path-order-import-empty">尚无住院医嘱草稿。</td></tr></tbody>
          </table>
        </div>
        <div class="path-order-import-actions"><label class="path-order-import-risk-label"><input type="checkbox" class="path-order-import-risk-ack">已核对当前患者及已勾选医嘱的名称、标签页、长临、剂量、用法、频次和风险</label><button type="button" class="path-order-import-append secondary" disabled>加入当前组套草稿</button><button type="button" class="path-order-import-cancel secondary">关闭</button></div>
      </div>
    </div>
    <div class="path-order-import-advanced-layer">
      <div class="path-order-import-advanced-card">
        <div class="path-order-import-advanced-head"><span>住院医嘱高级设置：<span class="path-order-import-advanced-name"></span></span><button type="button" class="path-order-import-advanced-close">×</button></div>
        <div class="path-order-import-advanced-body">
          <div class="path-order-import-advanced-grid">
            <label>数量/次数<input type="number" step="0.001" class="path-order-import-advanced-quantity"></label>
            <label>药品总量<input type="number" step="0.001" class="path-order-import-advanced-total"></label>
            <label>中药剂数<input type="number" min="1" max="60" step="1" class="path-order-import-advanced-dose-count"></label>
            <label>中药煎煮方式<select class="path-order-import-advanced-decoction"><option>代煎</option><option>自煎</option><option>外用</option><option>冲服</option></select></label>
            <label>标本<input type="text" class="path-order-import-advanced-specimen"></label>
            <label>部位<input type="text" class="path-order-import-advanced-body-part"></label>
            <label>自付比例<select class="path-order-import-advanced-self-pay"><option value="min">自动选择最小值</option><option value="keep">保留系统默认</option></select></label>
            <label>出院带药<select class="path-order-import-advanced-discharge"><option>否</option><option>是</option></select></label>
            <label>转自费<select class="path-order-import-advanced-transfer"><option>否</option><option>是</option></select></label>
            <label>计费<select class="path-order-import-advanced-billing"><option>是</option><option>否</option></select></label>
          </div>
          <label class="path-order-import-advanced-custom-label">院内特殊字段（JSON对象）<textarea class="path-order-import-advanced-custom"></textarea></label>
          <div class="path-order-import-advanced-actions"><button type="button" class="path-order-import-advanced-cancel secondary">取消</button><button type="button" class="path-order-import-advanced-save">保存高级设置</button></div>
        </div>
      </div>
    </div>
    <div class="path-order-import-template-layer">
      <div class="path-order-import-template-card">
        <div class="path-order-import-template-head"><span>住院医嘱模板管理</span><button type="button" class="path-order-import-template-close">×</button></div>
        <div class="path-order-import-template-body"></div>
      </div>
    </div>
  </div>
  <div class="path-local-delete-layer">
    <div class="path-local-delete-card">
      <div class="path-local-delete-head"><span>本地删除指定医嘱（不操作服务器）</span><button type="button" class="path-local-delete-close">×</button></div>
      <div class="path-local-delete-content">
        <div class="path-local-delete-note">本功能与医院数据库“删除”完全不同：不会调用删除接口，也不会点击停止/作废。选中后仅在本浏览器按患者建立排除清单，并把对应医嘱行从当前页面DOM中移除。这样住院信息脚本从当前页提取医嘱时也看不到这些记录。服务器原始医嘱仍然存在。</div>
        <div class="path-local-delete-patient">正在读取当前患者……</div>
        <div class="path-local-delete-toolbar"><button type="button" class="path-local-delete-select-all secondary">全选</button><button type="button" class="path-local-delete-select-none secondary">全不选</button><button type="button" class="path-local-delete-restore-all secondary">恢复本患者全部本地删除</button></div>
        <div class="path-local-delete-table-wrap">
          <table class="path-local-delete-table">
            <thead><tr><th>选择</th><th>长/临</th><th>医嘱类型</th><th>开始时间</th><th>医嘱名称</th><th>剂量</th><th>用法</th><th>频次</th><th>状态</th></tr></thead>
            <tbody class="path-local-delete-body"></tbody>
          </table>
        </div>
        <div class="path-local-delete-actions"><button type="button" class="path-local-delete-cancel secondary">取消</button><button type="button" class="path-local-delete-confirm danger" disabled>本地删除选中医嘱</button></div>
      </div>
    </div>
  </div>
  <dialog class="path-advanced-layer" aria-label="高级条目设置">
    <div class="path-advanced-card">
      <div class="path-advanced-head"><span>高级条目设置：<span class="path-advanced-name"></span></span><button type="button" class="path-advanced-close">×</button></div>
      <div class="path-advanced-body">
        <div class="path-advanced-grid">
          <label>数量/次数<input type="number" step="0.001" class="path-advanced-quantity"></label>
          <label>总量<input type="number" step="0.001" class="path-advanced-total"></label>
          <label>中药剂数<input type="number" min="1" step="1" class="path-advanced-dose-count"></label>
          <label>中药煎煮方式<select class="path-advanced-decoction"><option>代煎</option><option>自煎</option><option>外用</option><option>冲服</option></select></label>
          <label>执行科室<input type="text" class="path-advanced-department" placeholder="例如：中医科、CT室"></label>
          <label>标本<input type="text" class="path-advanced-specimen"></label>
          <label>部位<input type="text" class="path-advanced-body-part"></label>
          <label>自付比例<select class="path-advanced-self-pay"><option value="min">自动选择最小值</option><option value="keep">保留系统默认</option></select></label>
          <label>出院带药<select class="path-advanced-discharge"><option>否</option><option>是</option></select></label>
          <label>转自费<select class="path-advanced-transfer"><option>否</option><option>是</option></select></label>
          <label>计费<select class="path-advanced-billing"><option>是</option><option>否</option></select></label>
        </div>
        <div class="path-advanced-custom-wrap"><label>院内特殊字段（JSON对象，例如 {"执行科室":"检验科"}）</label><textarea class="path-advanced-custom"></textarea></div>
        <div class="path-advanced-actions"><button type="button" class="path-advanced-cancel secondary">取消</button><button type="button" class="path-advanced-save">保存高级设置</button></div>
      </div>
    </div>
  </dialog>
</div>
<input id="${IDS.importInput}" type="file" accept=".json,application/json" style="display:none">`;
        document.body.appendChild(modal);

        // 主窗口的 transform 会改变内部弹窗的定位基准并裁剪遮罩。
        // 将高级条目设置移至视口层级，使其在主窗口上方居中显示。
        const advancedLayer = modal.querySelector('.path-advanced-layer');
        if (advancedLayer && advancedLayer.parentElement !== modal) {
            modal.appendChild(advancedLayer);
        }

        initializeSectionCollapsing(modal);
        bindPathSharedSuggestions(modal);
        initializeGeneralWarningSystem(modal);
        bindLocalOrderDeleteLayer(modal);
        bindOrderImportLayer(modal);

        document.addEventListener(
            SUITE_SHARED_KNOWLEDGE_CHANGED_EVENT,
            function () {
                refreshPathSharedSuggestionData(modal);
            }
        );

        window.addEventListener('storage', function (event) {
            if (event.key === SUITE_SHARED_KNOWLEDGE_STORAGE_KEY) {
                refreshPathSharedSuggestionData(modal);
            }

            if (event.key === LOCAL_ORDER_DELETE_STORAGE_KEY) {
                localOrderDeleteScheduleCurrentPage(40);
            }
        });

        const close = () => {
            closeLocalOrderDeleteLayer(modal);
            closeOrderImportLayer(modal);

            if (
                state.running ||
                state.bulkDeletingOrders ||
                state.aiBusy
            ) {
                modal.classList.remove('show');
                return;
            }

            if (isGroupDraftDirty(modal)) {
                const discard = window.confirm(
                    '当前组套存在未保存修改。\n\n' +
                    '点击“确定”：放弃修改并关闭。\n' +
                    '点击“取消”：返回继续编辑。'
                );
                if (!discard) return;
                resetGroupDraft(modal, false);
            }

            modal.classList.remove('show');
        };
        modal.querySelector('.path-close').addEventListener('click', close);
        modal.querySelector('.path-hide').addEventListener('click', close);
        modal.querySelector('.path-mask').addEventListener('click', close);

        const categorySelect = modal.querySelector('.path-category');
        const pathwaySelect = modal.querySelector('.path-pathway');
        const groupSelect = modal.querySelector('.path-group');
        const importInput = modal.querySelector('#' + IDS.importInput);
        const aiKeyInput =
            modal.querySelector(
                '.path-ai-key'
            );
        const aiModelInput =
            modal.querySelector(
                '.path-ai-model'
            );
        const aiPromptInput =
            modal.querySelector(
                '.path-ai-prompt'
            );
        const aiAuditContextInput =
            modal.querySelector(
                '.path-ai-audit-context'
            );
        const aiOrderExtractPromptInput =
            modal.querySelector(
                '.path-ai-order-extract-prompt'
            );
        const aiDiagnosisExtractPromptInput =
            modal.querySelector(
                '.path-ai-diagnosis-extract-prompt'
            );
        const aiOrderExtractSolidifyInput =
            modal.querySelector(
                '.path-ai-order-extract-solidify'
            );
        const aiDiagnosisExtractSolidifyInput =
            modal.querySelector(
                '.path-ai-diagnosis-extract-solidify'
            );

        aiKeyInput.value =
            GM_getValue(
                KEYS.deepSeekApiKey,
                ''
            );
        aiModelInput.value =
            GM_getValue(
                KEYS.deepSeekModel,
                DEFAULT_DEEPSEEK_MODEL
            ) ||
            DEFAULT_DEEPSEEK_MODEL;
        aiPromptInput.value =
            GM_getValue(
                KEYS.aiGenerationPrompt,
                ''
            );
        aiAuditContextInput.value =
            GM_getValue(
                KEYS.aiAuditContext,
                ''
            );
        aiOrderExtractPromptInput.value =
            GM_getValue(
                KEYS.aiOrderExtractPrompt,
                DEFAULT_CURRENT_PAGE_ORDER_EXTRACT_PROMPT
            ) || DEFAULT_CURRENT_PAGE_ORDER_EXTRACT_PROMPT;
        aiDiagnosisExtractPromptInput.value =
            GM_getValue(
                KEYS.aiDiagnosisExtractPrompt,
                DEFAULT_CURRENT_PAGE_DIAGNOSIS_EXTRACT_PROMPT
            ) || DEFAULT_CURRENT_PAGE_DIAGNOSIS_EXTRACT_PROMPT;
        aiOrderExtractSolidifyInput.checked =
            GM_getValue(
                KEYS.aiOrderExtractPromptSolidified,
                true
            ) !== false;
        aiDiagnosisExtractSolidifyInput.checked =
            GM_getValue(
                KEYS.aiDiagnosisExtractPromptSolidified,
                true
            ) !== false;

        renderAiOrderExtractResult(modal);
        renderAiDiagnosisExtractResult(modal);

        aiKeyInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.deepSeekApiKey,
                    aiKeyInput.value.trim()
                );
            }
        );
        aiModelInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.deepSeekModel,
                    aiModelInput.value.trim() ||
                    DEFAULT_DEEPSEEK_MODEL
                );
            }
        );
        aiPromptInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.aiGenerationPrompt,
                    aiPromptInput.value
                );
            }
        );
        aiAuditContextInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.aiAuditContext,
                    aiAuditContextInput.value
                );
            }
        );
        aiOrderExtractPromptInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.aiOrderExtractPrompt,
                    aiOrderExtractPromptInput.value
                );
            }
        );
        aiDiagnosisExtractPromptInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.aiDiagnosisExtractPrompt,
                    aiDiagnosisExtractPromptInput.value
                );
            }
        );
        aiOrderExtractSolidifyInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.aiOrderExtractPromptSolidified,
                    Boolean(aiOrderExtractSolidifyInput.checked)
                );
                showStatus(
                    aiOrderExtractSolidifyInput.checked
                        ? '当前页医嘱关键信息：已启用固化提示词模式。'
                        : '当前页医嘱关键信息：已松绑systemPrompt，自定义提示词将决定主要整理行为。',
                    'success'
                );
            }
        );
        aiDiagnosisExtractSolidifyInput.addEventListener(
            'change',
            function () {
                GM_setValue(
                    KEYS.aiDiagnosisExtractPromptSolidified,
                    Boolean(aiDiagnosisExtractSolidifyInput.checked)
                );
                showStatus(
                    aiDiagnosisExtractSolidifyInput.checked
                        ? '基本诊断信息：已启用固化提示词模式。'
                        : '基本诊断信息：已松绑systemPrompt，自定义提示词将决定主要提取行为。',
                    'success'
                );
            }
        );

        modal.querySelector(
            '.path-ai-generate'
        ).addEventListener(
            'click',
            function () {
                generateAiClinicalPathway(
                    modal
                );
            }
        );
        modal.querySelector(
            '.path-ai-create-path'
        ).addEventListener(
            'click',
            function () {
                createAiResultAsNewPathway(
                    modal
                );
            }
        );
        modal.querySelector(
            '.path-ai-audit'
        ).addEventListener(
            'click',
            function () {
                auditCurrentPageOrdersWithAi(
                    modal
                );
            }
        );
        modal.querySelector(
            '.path-ai-manual-audit'
        ).addEventListener(
            'click',
            function () {
                openPathAiResultManualEditor(modal, 'audit');
            }
        );
        modal.querySelector(
            '.path-ai-extract-orders'
        ).addEventListener(
            'click',
            function () {
                extractCurrentPageOrderKeyInfoWithAi(
                    modal
                );
            }
        );
        modal.querySelector(
            '.path-ai-manual-extract'
        ).addEventListener(
            'click',
            function () {
                openPathAiResultManualEditor(modal, 'orders');
            }
        );
        modal.querySelector(
            '.path-ai-copy-extract'
        ).addEventListener(
            'click',
            async function () {
                const copied = await copyTextCompat(
                    state.aiOrderExtractResult
                );

                showStatus(
                    copied
                        ? '当前页医嘱关键信息已复制。'
                        : '复制失败，请在结果框中手动全选复制。',
                    copied ? 'success' : 'error'
                );
            }
        );
        modal.querySelector(
            '.path-ai-clear-extract'
        ).addEventListener(
            'click',
            function () {
                if (state.aiBusy) return;

                state.aiOrderExtractResult = '';
                state.aiOrderExtractSource = '';
                renderAiOrderExtractResult(modal);
                showStatus(
                    '当前页医嘱关键信息提取结果已清空。',
                    'normal'
                );
            }
        );
        modal.querySelector(
            '.path-ai-reset-extract-prompt'
        ).addEventListener(
            'click',
            function () {
                if (state.aiBusy) return;

                const currentPrompt = String(
                    aiOrderExtractPromptInput.value || ''
                ).trim();
                const defaultPrompt = String(
                    DEFAULT_CURRENT_PAGE_ORDER_EXTRACT_PROMPT || ''
                ).trim();

                if (currentPrompt === defaultPrompt) {
                    showStatus(
                        '当前页医嘱提取已使用默认提示词。',
                        'normal'
                    );
                    return;
                }

                const confirmed = window.confirm(
                    '确认恢复当前页医嘱提取默认提示词吗？\n\n' +
                    '当前自定义提示词将被默认内容覆盖；恢复后如需找回原内容，需自行重新录入或从备份中恢复。'
                );

                if (!confirmed) return;

                aiOrderExtractPromptInput.value =
                    DEFAULT_CURRENT_PAGE_ORDER_EXTRACT_PROMPT;
                GM_setValue(
                    KEYS.aiOrderExtractPrompt,
                    DEFAULT_CURRENT_PAGE_ORDER_EXTRACT_PROMPT
                );
                showStatus(
                    '已恢复当前页医嘱提取默认提示词。',
                    'success'
                );
            }
        );
        modal.querySelector(
            '.path-ai-extract-diagnosis'
        ).addEventListener(
            'click',
            function () {
                extractCurrentPageDiagnosisInfoWithAi(
                    modal
                );
            }
        );
        modal.querySelector(
            '.path-ai-manual-diagnosis-extract'
        ).addEventListener(
            'click',
            function () {
                openPathAiResultManualEditor(modal, 'diagnosis');
            }
        );
        modal.querySelector(
            '.path-ai-copy-diagnosis-extract'
        ).addEventListener(
            'click',
            async function () {
                const copied = await copyTextCompat(
                    state.aiDiagnosisExtractResult
                );

                showStatus(
                    copied
                        ? '基本诊断信息已复制。'
                        : '复制失败，请在结果框中手动全选复制。',
                    copied ? 'success' : 'error'
                );
            }
        );
        modal.querySelector(
            '.path-ai-clear-diagnosis-extract'
        ).addEventListener(
            'click',
            function () {
                if (state.aiBusy) return;

                state.aiDiagnosisExtractResult = '';
                state.aiDiagnosisExtractSource = '';
                renderAiDiagnosisExtractResult(modal);
                showStatus(
                    '基本诊断信息提取结果已清空。',
                    'normal'
                );
            }
        );
        modal.querySelector(
            '.path-ai-reset-diagnosis-extract-prompt'
        ).addEventListener(
            'click',
            function () {
                if (state.aiBusy) return;

                const currentPrompt = String(
                    aiDiagnosisExtractPromptInput.value || ''
                ).trim();
                const defaultPrompt = String(
                    DEFAULT_CURRENT_PAGE_DIAGNOSIS_EXTRACT_PROMPT || ''
                ).trim();

                if (currentPrompt === defaultPrompt) {
                    showStatus(
                        '基本诊断信息提取已使用默认提示词。',
                        'normal'
                    );
                    return;
                }

                const confirmed = window.confirm(
                    '确认恢复基本诊断信息提取默认提示词吗？\n\n' +
                    '当前自定义提示词将被默认内容覆盖；恢复后如需找回原内容，需自行重新录入或从备份中恢复。'
                );

                if (!confirmed) return;

                aiDiagnosisExtractPromptInput.value =
                    DEFAULT_CURRENT_PAGE_DIAGNOSIS_EXTRACT_PROMPT;
                GM_setValue(
                    KEYS.aiDiagnosisExtractPrompt,
                    DEFAULT_CURRENT_PAGE_DIAGNOSIS_EXTRACT_PROMPT
                );
                showStatus(
                    '已恢复基本诊断信息提取默认提示词。',
                    'success'
                );
            }
        );
        modal.querySelector(
            '.path-ai-clear-generation'
        ).addEventListener(
            'click',
            function () {
                if (state.aiBusy) {
                    return;
                }

                state.aiGeneratedResult =
                    null;
                renderAiGenerationResult(
                    modal
                );
                showStatus(
                    'AI推荐路径结果已清空。',
                    'normal'
                );
            }
        );
        modal.querySelector(
            '.path-ai-clear-audit'
        ).addEventListener(
            'click',
            function () {
                if (state.aiBusy) {
                    return;
                }

                state.aiAuditResult =
                    null;
                state.aiAuditManualResult = '';
                renderAiAuditResult(
                    modal
                );
                showStatus(
                    'AI医嘱审核结果已清空。',
                    'normal'
                );
            }
        );


        modal.querySelector('.path-mode-gui').addEventListener('click', () => {
            if (state.running) return showStatus('任务执行期间不能切换编辑模式。', 'warning');
            setEditorMode(modal, 'gui', true, false);
        });
        modal.querySelector('.path-mode-json').addEventListener('click', () => {
            if (state.running) return showStatus('任务执行期间不能切换编辑模式。', 'warning');
            setEditorMode(modal, 'json', true, false);
        });

        modal.querySelector(
            '.path-toggle-secondary-directory'
        ).addEventListener(
            'click',
            function () {
                if (state.running) {
                    showStatus(
                        '任务执行期间不能切换二级目录显示状态。',
                        'warning'
                    );
                    return;
                }

                setSecondaryDirectoryVisible(
                    modal,
                    !secondaryDirectoryVisible(
                        modal
                    ),
                    true
                );
            }
        );

        modal.querySelector('.path-gui-body').addEventListener('input', event => {
            clearTimeout(modal.pathGuiSyncTimer);

            const suggestionInput = event.target.closest(
                '.path-gui-name,.path-gui-search-name'
            );

            if (suggestionInput) {
                /*
                 * 联想输入过程中只保存内存草稿，不改写JSON编辑框，也不重绘
                 * 执行组套/状态列表。完整同步由change或真正失焦后执行。
                 */
                modal.pathGuiSyncTimer = setTimeout(function () {
                    if (document.activeElement === suggestionInput) {
                        updateGroupGuiDraftSilently(modal);
                        return;
                    }

                    readGroupGui(modal, false);
                }, 260);
                return;
            }

            modal.pathGuiSyncTimer = setTimeout(
                () => readGroupGui(modal, false),
                220
            );
        });
        modal.querySelector('.path-gui-body').addEventListener('change', event => {
            clearTimeout(modal.pathGuiSyncTimer);

            const suggestionInput = event.target.closest(
                '.path-gui-name,.path-gui-search-name'
            );

            if (
                suggestionInput &&
                consumePathSharedSuggestionCommit(
                    suggestionInput
                )
            ) {
                /*
                 * 只有用户真正从原生datalist中确认了某一项，
                 * 才联动名称、检索名称、单位等字段。
                 *
                 * 手工键入后直接点击外部造成的change/blur，
                 * 即使文本恰好等于共享库中的某个项目，也不自动覆盖。
                 */
                applyPathSharedSuggestionToRow(
                    suggestionInput
                );
            }

            const changedRow = event.target.closest('.path-gui-row');

            if (changedRow && event.target.classList.contains('path-gui-tab')) {
                configurePathSharedSuggestionRow(changedRow);
            }

            readGroupGui(modal, false);
        });
        modal.querySelector('.path-gui-body').addEventListener('click', event => {
            const row = event.target.closest('.path-gui-row');
            if (!row) return;
            const itemId = row.dataset.itemId;

            setSelectedGuiRow(
                modal,
                itemId
            );

            const actionButton = event.target.closest(
                '.path-gui-advanced,.path-gui-copy,.path-gui-up,' +
                '.path-gui-down,.path-gui-delete'
            );

            /*
             * 单击普通输入框、选择框或表格空白区只负责选中当前行。
             * 原版本在每次click时立即执行readGroupGui并重绘辅助区域，
             * 会把刚展开的原生datalist候选菜单直接关闭。
             */
            if (!actionButton) return;

            readGroupGui(modal, false);
            const group = currentGroup();
            if (!group) return;
            const draftItems = groupDraftItems(modal);
            const index = draftItems.findIndex(
                item => item.id === itemId
            );
            if (index < 0) return;

            if (event.target.closest('.path-gui-advanced')) {
                openAdvancedEditor(modal, itemId);
                return;
            }
            if (event.target.closest('.path-gui-copy')) {
                const copyItem = clone(draftItems[index]);
                copyItem.id = makeId('item');
                copyItem.status = '';
                draftItems.splice(
                    index + 1,
                    0,
                    normalizeItem(copyItem)
                );
            } else if (event.target.closest('.path-gui-up')) {
                if (index <= 0) return;
                const item = draftItems.splice(index, 1)[0];
                draftItems.splice(index - 1, 0, item);
            } else if (event.target.closest('.path-gui-down')) {
                if (index >= draftItems.length - 1) return;
                const item = draftItems.splice(index, 1)[0];
                draftItems.splice(index + 1, 0, item);
            } else if (event.target.closest('.path-gui-delete')) {
                if (!window.confirm('确认从组套草稿中删除该医嘱条目吗？')) return;
                draftItems.splice(index, 1);
            } else {
                return;
            }

            refreshGroupDraftDirty(
                modal,
                'GUI操作已同步到JSON草稿。'
            );
            renderGroupGui(modal);
            syncJsonFromGroup(modal, 'GUI操作已同步到JSON草稿。');
            renderRunGroups(modal);
            renderStatusList(modal);
        });

        modal.querySelector('.path-enable-all')
            .addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (state.running) return;

                setAllGuiEnabled(
                    modal,
                    true
                );
            });

        modal.querySelector('.path-enable-none')
            .addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (state.running) return;

                setAllGuiEnabled(
                    modal,
                    false
                );
            });

        modal.querySelector('.path-insert-after')
            .addEventListener('click', function () {
                if (state.running) return;

                insertBlankAfterSelected(
                    modal
                );
            });

        modal.querySelector('.path-delete-enabled')
            .addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                deleteCheckedGuiItems(
                    modal
                );
            });

        modal.querySelector('.path-group-json').addEventListener('input', () => {
            editorStatus(modal, '正在检查JSON……', '');
            clearTimeout(modal.pathJsonSyncTimer);
            modal.pathJsonSyncTimer = setTimeout(() => applyGroupJson(modal, false, true), 420);
        });
        modal.querySelector('.path-json-format').addEventListener('click', () => {
            try {
                const parsed = JSON.parse(modal.querySelector('.path-group-json').value || '[]');
                modal.querySelector('.path-group-json').value = JSON.stringify(parsed, null, 2);
                applyGroupJson(modal, false, true);
            } catch (error) {
                editorStatus(modal, '无法格式化：' + error.message, 'error');
                showStatus('JSON格式错误：' + error.message, 'error');
            }
        });
        modal.querySelector('.path-json-apply').addEventListener('click', () => {
            if (applyGroupJson(modal, true, true)) setEditorMode(modal, 'gui', true, true);
        });

        modal.querySelector('.path-advanced-close').addEventListener('click', () => closeAdvancedEditor(modal));
        modal.querySelector('.path-advanced-cancel').addEventListener('click', () => closeAdvancedEditor(modal));
        modal.querySelector('.path-advanced-layer').addEventListener('click', event => {
            if (event.target.classList.contains('path-advanced-layer')) closeAdvancedEditor(modal);
        });
        modal.querySelector('.path-advanced-save').addEventListener('click', () => saveAdvancedEditor(modal));

        categorySelect.addEventListener('change', () => {
            if (!requireSavedCurrentGroup(modal, '切换分类')) {
                categorySelect.value = currentCategory() ? currentCategory().id : '';
                return;
            }
            GM_setValue(KEYS.category, categorySelect.value);
            const category = currentCategory();
            if (category) {
                GM_setValue(KEYS.pathway, category.pathways[0].id);
                GM_setValue(KEYS.group, category.pathways[0].groups[0].id);
            }
            refreshSelects(modal);
        });

        pathwaySelect.addEventListener('change', () => {
            if (!requireSavedCurrentGroup(modal, '切换路径')) {
                pathwaySelect.value = currentPathway() ? currentPathway().id : '';
                return;
            }
            GM_setValue(KEYS.pathway, pathwaySelect.value);
            const pathway = currentPathway();
            if (pathway) GM_setValue(KEYS.group, pathway.groups[0].id);
            refreshSelects(modal);
        });

        groupSelect.addEventListener('change', () => {
            if (!requireSavedCurrentGroup(modal, '切换组套')) {
                groupSelect.value = currentGroup() ? currentGroup().id : '';
                return;
            }
            GM_setValue(KEYS.group, groupSelect.value);
            refreshSelects(modal);
        });

        modal.querySelector('.path-description').addEventListener('change', event => {
            const pathway = currentPathway();
            if (pathway) { pathway.description = event.target.value.trim(); saveLibrary(); }
        });
        modal.querySelector('.path-version').addEventListener('change', event => {
            const pathway = currentPathway();
            if (pathway) { pathway.version = event.target.value.trim() || '1.0'; saveLibrary(); refreshSelects(modal); }
        });

        modal.querySelector('.path-category-add').addEventListener('click', () => {
            if (!requireSavedCurrentGroup(modal, '新增分类')) return;
            const name = window.prompt('病种分类名称：');
            if (!name || !name.trim()) return;
            const category = { id: makeId('category'), name: name.trim(), pathways: [{ id: makeId('pathway'), name: '空白临床路径', version: '1.0', description: '', groups: [{ id: makeId('group'), name: '入院阶段', enabled: true, items: [] }] }] };
            state.library.categories.push(category); saveLibrary(); GM_setValue(KEYS.category, category.id); GM_setValue(KEYS.pathway, category.pathways[0].id); GM_setValue(KEYS.group, category.pathways[0].groups[0].id); refreshSelects(modal);
        });
        modal.querySelector('.path-category-rename').addEventListener('click', () => {
            const category = currentCategory(); const name = category && window.prompt('分类名称：', category.name); if (name && name.trim()) { category.name = name.trim(); saveLibrary(); refreshSelects(modal); }
        });
        modal.querySelector('.path-category-delete').addEventListener('click', () => {
            if (!requireSavedCurrentGroup(modal, '删除分类')) return;
            const category = currentCategory(); if (!category) return; if (state.library.categories.length <= 1) return showStatus('至少保留一个分类。', 'warning'); if (!window.confirm('确认删除分类“' + category.name + '”及全部路径吗？')) return;
            state.library.categories = state.library.categories.filter(item => item.id !== category.id); saveLibrary(); const first = state.library.categories[0]; GM_setValue(KEYS.category, first.id); GM_setValue(KEYS.pathway, first.pathways[0].id); GM_setValue(KEYS.group, first.pathways[0].groups[0].id); refreshSelects(modal);
        });
        modal.querySelector('.path-pathway-add').addEventListener('click', () => {
            if (!requireSavedCurrentGroup(modal, '新增路径')) return;
            const category = currentCategory(); const name = window.prompt('临床路径名称：'); if (!category || !name || !name.trim()) return;
            const pathway = { id: makeId('pathway'), name: name.trim(), version: '1.0', description: '', groups: [{ id: makeId('group'), name: '入院阶段', enabled: true, items: [] }] };
            category.pathways.push(pathway); saveLibrary(); GM_setValue(KEYS.pathway, pathway.id); GM_setValue(KEYS.group, pathway.groups[0].id); refreshSelects(modal);
        });
        modal.querySelector('.path-pathway-copy').addEventListener('click', () => {
            if (!requireSavedCurrentGroup(modal, '复制路径')) return;
            const category = currentCategory(); const pathway = currentPathway(); if (!category || !pathway) return; const copyPath = clone(pathway); copyPath.id = makeId('pathway'); copyPath.name += '－副本'; copyPath.groups.forEach(group => { group.id = makeId('group'); group.items.forEach(item => { item.id = makeId('item'); item.status = ''; }); }); category.pathways.push(copyPath); saveLibrary(); GM_setValue(KEYS.pathway, copyPath.id); GM_setValue(KEYS.group, copyPath.groups[0].id); refreshSelects(modal);
        });
        modal.querySelector('.path-pathway-rename').addEventListener('click', () => {
            const pathway = currentPathway(); const name = pathway && window.prompt('路径名称：', pathway.name); if (name && name.trim()) { pathway.name = name.trim(); saveLibrary(); refreshSelects(modal); }
        });
        modal.querySelector('.path-pathway-delete').addEventListener('click', () => {
            if (!requireSavedCurrentGroup(modal, '删除路径')) return;
            const category = currentCategory(); const pathway = currentPathway(); if (!category || !pathway) return; if (category.pathways.length <= 1) return showStatus('当前分类至少保留一条路径。', 'warning'); if (!window.confirm('确认删除路径“' + pathway.name + '”吗？')) return;
            category.pathways = category.pathways.filter(item => item.id !== pathway.id); saveLibrary(); GM_setValue(KEYS.pathway, category.pathways[0].id); GM_setValue(KEYS.group, category.pathways[0].groups[0].id); refreshSelects(modal);
        });
        modal.querySelector('.path-group-add').addEventListener('click', () => {
            const pathway = currentPathway(); const name = window.prompt('组套名称：'); if (!pathway || !name || !name.trim()) return; if (!saveGroupJson(modal, false)) return showStatus('请先修正当前组套内容。', 'error'); const group = { id: makeId('group'), name: name.trim(), enabled: true, items: [] }; pathway.groups.push(group); saveLibrary(); GM_setValue(KEYS.group, group.id); refreshSelects(modal);
        });
        modal.querySelector('.path-group-copy').addEventListener('click', () => {
            const pathway = currentPathway(); const group = currentGroup(); if (!pathway || !group) return; if (!saveGroupJson(modal, false)) return showStatus('请先修正当前组套内容。', 'error'); const copyGroup = clone(group); copyGroup.id = makeId('group'); copyGroup.name += '－副本'; copyGroup.items.forEach(item => { item.id = makeId('item'); item.status = ''; }); pathway.groups.push(copyGroup); saveLibrary(); GM_setValue(KEYS.group, copyGroup.id); refreshSelects(modal);
        });
        modal.querySelector('.path-group-rename').addEventListener('click', () => {
            const group = currentGroup(); const name = group && window.prompt('组套名称：', group.name); if (name && name.trim()) { group.name = name.trim(); saveLibrary(); refreshSelects(modal); }
        });
        modal.querySelector('.path-group-delete').addEventListener('click', () => {
            if (!requireSavedCurrentGroup(modal, '删除组套')) return;
            const pathway = currentPathway(); const group = currentGroup(); if (!pathway || !group) return; if (pathway.groups.length <= 1) return showStatus('每条路径至少保留一个组套。', 'warning'); if (!window.confirm('确认删除组套“' + group.name + '”吗？')) return;
            pathway.groups = pathway.groups.filter(item => item.id !== group.id); saveLibrary(); GM_setValue(KEYS.group, pathway.groups[0].id); refreshSelects(modal);
        });
        modal.querySelector('.path-add-example').addEventListener('click', () => {
            if (!saveCurrentEditor(modal, false)) {
                return showStatus(
                    '当前编辑内容存在错误，不能新增条目。',
                    'error'
                );
            }

            const group = currentGroup();
            if (!group) return;

            const blank = blankPathItem();
            groupDraftItems(modal).push(blank);
            modal.dataset.pathSelectedItemId = blank.id;

            refreshGroupDraftDirty(
                modal,
                '已在末尾新增空白条目到组套草稿。'
            );
            renderGroupGui(modal);
            syncJsonFromGroup(
                modal,
                '已在末尾新增空白条目，并同步到GUI和JSON草稿。'
            );
            renderRunGroups(modal);
            renderStatusList(modal);
            setSelectedGuiRow(modal, blank.id);
        });

        modal.querySelector('.path-save-json').addEventListener(
            'click',
            () => commitCurrentGroup(modal, true)
        );
        modal.querySelector('.path-export').addEventListener('click', () => { if (!saveGroupJson(modal, false)) return showStatus('当前组套内容存在错误，无法导出。', 'error'); exportLibrary(); });
        modal.querySelector('.path-import').addEventListener('click', () => {
            if (!requireSavedCurrentGroup(modal, '导入路径库')) return;
            importInput.value = '';
            importInput.click();
        });
        importInput.addEventListener('change', async () => {
            const file = importInput.files && importInput.files[0]; if (!file) return;
            try { const parsed = JSON.parse(await file.text()); if (!window.confirm('导入将覆盖当前路径库，确认继续？')) return; state.library = normalizeLibrary(parsed); saveLibrary(); const first = state.library.categories[0]; GM_setValue(KEYS.category, first.id); GM_setValue(KEYS.pathway, first.pathways[0].id); GM_setValue(KEYS.group, first.pathways[0].groups[0].id); refreshSelects(modal); showStatus('导入成功。', 'success'); } catch (error) { showStatus('导入失败：' + error.message, 'error'); }
        });

        modal.querySelector('.path-auto-save').checked = Boolean(GM_getValue(KEYS.autoSave, false));
        modal.querySelector('.path-continue-error').checked = Boolean(GM_getValue(KEYS.continueOnError, true));
        modal.querySelector('.path-add-current-page-orders-reverse').checked = Boolean(
            GM_getValue(KEYS.currentPageOrderReverseSort, false)
        );

        /*
         * 首次使用默认关闭；此后记忆医师上次的选择。
         */
        modal.querySelector(
            '.path-ignore-duplicate-medication'
        ).checked = Boolean(
            GM_getValue(
                KEYS.ignoreDuplicateMedicationPrompt,
                false
            )
        );
        modal.querySelector(
            '.path-suppress-check-popup'
        ).checked = Boolean(
            GM_getValue(
                KEYS.suppressCheckApplicationPopup,
                false
            )
        );
        modal.querySelector(
            '.path-suppress-lab-popup'
        ).checked = Boolean(
            GM_getValue(
                KEYS.suppressLabApplicationPopup,
                false
            )
        );

        state.suppressCheckApplicationPopup = Boolean(
            modal.querySelector(
                '.path-suppress-check-popup'
            ).checked
        );
        state.suppressLabApplicationPopup = Boolean(
            modal.querySelector(
                '.path-suppress-lab-popup'
            ).checked
        );

        modal.querySelector('.path-auto-save').addEventListener('change', event => GM_setValue(KEYS.autoSave, event.target.checked));
        modal.querySelector('.path-continue-error').addEventListener('change', event => GM_setValue(KEYS.continueOnError, event.target.checked));
        modal.querySelector('.path-add-current-page-orders-reverse').addEventListener(
            'change',
            function (event) {
                GM_setValue(
                    KEYS.currentPageOrderReverseSort,
                    Boolean(event.target.checked)
                );
            }
        );
        modal.querySelector(
            '.path-ignore-duplicate-medication'
        ).addEventListener(
            'change',
            function (event) {
                GM_setValue(
                    KEYS.ignoreDuplicateMedicationPrompt,
                    event.target.checked
                );
            }
        );
        modal.querySelector(
            '.path-suppress-check-popup'
        ).addEventListener(
            'change',
            function (event) {
                state.suppressCheckApplicationPopup = Boolean(
                    event.target.checked
                );
                GM_setValue(
                    KEYS.suppressCheckApplicationPopup,
                    event.target.checked
                );
            }
        );
        modal.querySelector(
            '.path-suppress-lab-popup'
        ).addEventListener(
            'change',
            function (event) {
                state.suppressLabApplicationPopup = Boolean(
                    event.target.checked
                );
                GM_setValue(
                    KEYS.suppressLabApplicationPopup,
                    event.target.checked
                );
            }
        );
        modal.querySelector('.path-options').addEventListener(
            'change',
            function () { syncOrderImportOptionsFromMain(modal); }
        );
        syncOrderImportOptionsFromMain(modal);
        modal.querySelector('.path-scan').addEventListener('click', () => {
            if (!saveGroupJson(modal, false)) {
                return showStatus(
                    isGroupDraftDirty(modal)
                        ? '当前组套存在未保存修改，请先保存后再扫描。'
                        : '当前组套内容存在错误，请修正后再扫描。',
                    isGroupDraftDirty(modal)
                        ? 'warning'
                        : 'error'
                );
            }
            scanPathway(modal);
        });
        modal.querySelector('.path-run').addEventListener(
            'click',
            async function () {
                finishCheckPopupPool(true);

                try {
                    await runPathway(
                        modal,
                        {
                            afterConfirm:
                                function (context) {
                                    if (
                                        !context.hasApplicationOrders
                                    ) {
                                        return true;
                                    }

                                    /*
                                     * 按真实执行序号筛选所有“未屏蔽”的检查/检验。
                                     * 预开池顺序与后续fillItem顺序完全一致：
                                     * 第1项未屏蔽申请单领取第1个标签页，以此类推。
                                     */
                                    const applicationItems =
                                        context.entries
                                            .filter(
                                                function (entry) {
                                                    if (
                                                        entry.item.tab ===
                                                        '检查'
                                                    ) {
                                                        return !context
                                                            .suppressCheckApplicationPopup;
                                                    }

                                                    if (
                                                        entry.item.tab ===
                                                        '检验'
                                                    ) {
                                                        return !context
                                                            .suppressLabApplicationPopup;
                                                    }

                                                    return false;
                                                }
                                            )
                                            .map(
                                                function (entry) {
                                                    return entry.item;
                                                }
                                            );

                                    if (
                                        !applicationItems.length
                                    ) {
                                        return true;
                                    }

                                    return prepareCheckPopupPool(
                                        applicationItems
                                    );
                                }
                        }
                    );
                }
                finally {
                    /*
                     * 已经载入申请单的标签页全部保留；
                     * 因执行中止或失败而未使用的占位页自动关闭。
                     */
                    finishCheckPopupPool(true);
                }
            }
        );
        modal.querySelector('.path-delete-all-orders').addEventListener('click', () => bulkDeleteOrderQuery(modal));
        modal.querySelector('.path-local-delete-open').addEventListener(
            'click',
            function () {
                openLocalOrderDeleteLayer(modal);
            }
        );
        modal.querySelector('.path-add-current-page-orders').addEventListener(
            'click',
            () => appendCurrentPageOrdersToGroup(modal)
        );
        modal.querySelector('.path-inpatient-order-open').addEventListener(
            'click',
            () => openOrderImportLayer(modal)
        );
        modal.querySelector('.path-pause').addEventListener('click', () => { if (!state.running) return; state.paused = !state.paused; updateRunButtons(modal); showStatus(state.paused ? '已暂停。' : '已继续。', state.paused ? 'warning' : 'normal'); });
        modal.querySelector('.path-abort').addEventListener('click', () => {
            if (!state.running && !state.bulkDeletingOrders) return;
            state.abortRequested = true;
            state.paused = false;
            updateRunButtons(modal);
            showStatus(
                state.bulkDeletingOrders
                    ? '已请求中止一键全删医嘱。'
                    : '已请求中止。',
                'warning'
            );
        });
        modal.querySelector('.path-clear-status').addEventListener('click', () => {
            const pathway = currentPathway();
            if (!pathway) return;

            pathway.groups.forEach(group =>
                group.items.forEach(item => {
                    item.status = '';
                })
            );
            state.scanResults = [];
            saveLibrary();

            modal.dataset.pathDraftGroupId = '';
            groupDraftItems(modal);

            renderStatusList(modal);
            renderGroupGui(modal);
            syncJsonFromGroup(
                modal,
                '执行状态已清空，当前组套配置仍为已保存状态。'
            );
            renderScan(modal);
        });

        refreshSelects(modal);
        renderScan(modal);
        renderAiGenerationResult(
            modal
        );
        renderAiAuditResult(
            modal
        );
        updateRunButtons(modal);
        return modal;
    }

    function openModal() {
        const modal = createModal();

        /*
         * 先生成一次联想库，再渲染GUI行；窗口显示后不再因聚焦或输入
         * 重建datalist。共享库变更事件仍会显式刷新。
         */
        renderPathSharedSuggestionDatalists(modal);
        refreshSelects(modal);
        configureAllPathSharedSuggestionRows(modal);
        modal.classList.add('show');

        localOrderDeleteScheduleCurrentPage(60);
        localOrderDeleteStartGlobalWatcher();

        if (generalWarningAutoScanEnabled()) {
            state.generalWarningDirty = true;
            scheduleGeneralWarningScan(
                modal,
                '打开临床路径窗口',
                160
            );
        }
        else {
            generalWarningRenderResults(modal);
            generalWarningRenderFront();
        }
    }

    function createPanel() {
        if (document.getElementById(IDS.panel)) return;
        const panel = document.createElement('div');
        panel.id = IDS.panel;
        Object.assign(panel.style, { position: 'fixed', top: '120px', left: '10px', zIndex: '2147483000', width: '174px', borderRadius: '7px', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,.28)', fontFamily: '"Microsoft YaHei",Arial,sans-serif' });
        const header = document.createElement('div');
        Object.assign(header.style, { height: '32px', padding: '0 6px 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: STYLE.header, color: '#fff', cursor: 'move', userSelect: 'none', fontSize: '13px', fontWeight: 'bold' });
        const title = document.createElement('span'); title.textContent = '临床路径';
        const toggle = document.createElement('button'); toggle.textContent = '－'; Object.assign(toggle.style, { width: '25px', height: '24px', border: '0', borderRadius: '4px', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer', fontSize: '16px' });
        const body = document.createElement('div'); Object.assign(body.style, { padding: '7px', background: '#fff' });
        const button = document.createElement('button'); button.textContent = '路径组套管理'; Object.assign(button.style, { width: '100%', height: '38px', border: '1px solid ' + STYLE.primary, borderRadius: '5px', background: STYLE.primary, color: '#fff', cursor: 'pointer', fontSize: '13px' }); button.addEventListener('click', openModal); body.appendChild(button); header.appendChild(title); header.appendChild(toggle); panel.appendChild(header); panel.appendChild(body); document.body.appendChild(panel);
        const saved = GM_getValue(KEYS.position, null); if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) { panel.style.left = saved.left + 'px'; panel.style.top = saved.top + 'px'; }
        let collapsed = Boolean(GM_getValue(KEYS.collapsed, false));
        const apply = () => { body.style.display = collapsed ? 'none' : 'block'; toggle.textContent = collapsed ? '＋' : '－'; };
        apply();
        toggle.addEventListener('click', event => { event.stopPropagation(); collapsed = !collapsed; GM_setValue(KEYS.collapsed, collapsed); apply(); });
        let dragging = false, offsetX = 0, offsetY = 0;
        header.addEventListener('mousedown', event => { if (event.target === toggle) return; dragging = true; const rect = panel.getBoundingClientRect(); offsetX = event.clientX - rect.left; offsetY = event.clientY - rect.top; event.preventDefault(); });
        document.addEventListener('mousemove', event => { if (!dragging) return; panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - offsetX)) + 'px'; panel.style.top = Math.max(0, Math.min(window.innerHeight - header.offsetHeight, event.clientY - offsetY)) + 'px'; });
        document.addEventListener('mouseup', () => { if (!dragging) return; dragging = false; const rect = panel.getBoundingClientRect(); GM_setValue(KEYS.position, { left: rect.left, top: rect.top }); });
    }

    /******************************************************************
     * 悬浮框管理器：医嘱标签联动预警扫描桥接
     *
     * 直接调用本脚本既有scanGeneralWarnings()并force=true，因此即使
     * “打开临床路径窗口时自动扫描”关闭，管理器联动开关仍可触发一次扫描。
     * 统计类型、自定义字段/通配符、阈值和前端渲染仍完全使用本脚本设置。
     ******************************************************************/
    const SUITE_ORDER_WARNING_SCAN_EVENT =
        'medical-userscript-order-warning-scan-request';

    let suiteOrderWarningPathTimer = null;

    function bindSuiteOrderWarningPathBridge() {
        if (
            window.__medicalSuiteOrderWarningPathBridgeV1
        ) {
            return;
        }

        window.__medicalSuiteOrderWarningPathBridgeV1 =
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
                    detail.target !== 'pathway'
                ) {
                    return;
                }

                clearTimeout(
                    suiteOrderWarningPathTimer
                );

                state.generalWarningDirty = true;

                suiteOrderWarningPathTimer =
                    window.setTimeout(
                        function () {
                            suiteOrderWarningPathTimer = null;

                            scanGeneralWarnings(
                                createModal(),
                                {
                                    force: true,
                                    silent: false,
                                    reason:
                                        detail.reason ||
                                        '悬浮框管理器医嘱标签联动'
                                }
                            );
                        },
                        120
                    );
            },
            false
        );
    }

    function initialize() {
        if (!document.body) return setTimeout(initialize, 100);
        loadLibrary();
        installClinicalPathwayPromptBridge();
        createPanel();
        bindSuiteOrderWarningPathBridge();
        localOrderDeleteScheduleCurrentPage(900);
        localOrderDeleteStartGlobalWatcher();
        new MutationObserver(createPanel).observe(document.documentElement, { childList: true, subtree: true });
        console.info('[临床路径组套跨标签页自动录入 v1.48.33] 已启用：高级条目设置使用浏览器原生模态层居中；保留v1.48.32其余功能。');
    }

    initialize();

    /******************************************************************
     * WebDAV数据备份与脚本源码快照适配
     *
     * 仅备份明确白名单内的长期配置；API Key、患者资料、临时草稿和
     * 当前任务状态均不进入备份。源码快照只用于WebDAV留档，不自动安装。
     ******************************************************************/

    const SUITE_BACKUP_ADAPTER_KEY =
        "pathway";

    const SUITE_BACKUP_GM_KEYS = [
            KEYS.library,
            KEYS.category,
            KEYS.pathway,
            KEYS.group,
            KEYS.position,
            KEYS.collapsed,
            KEYS.autoSave,
            KEYS.continueOnError,
            KEYS.ignoreDuplicateMedicationPrompt,
            KEYS.suppressCheckApplicationPopup,
            KEYS.suppressLabApplicationPopup,
            KEYS.inpatientOrderTemplates,
            KEYS.inpatientOrderEditorMode,
            KEYS.inpatientOrderSecondaryDirectoryVisible,
            KEYS.currentPageOrderReverseSort,
            KEYS.secondaryDirectoryVisible,
            KEYS.editorMode,
            KEYS.sectionCollapsed,
            KEYS.deepSeekModel,
            KEYS.aiGenerationPrompt,
            KEYS.aiOrderExtractPrompt,
            KEYS.aiDiagnosisExtractPrompt,
            KEYS.aiOrderExtractPromptSolidified,
            KEYS.aiDiagnosisExtractPromptSolidified,
            KEYS.generalWarningAutoScan,
            KEYS.generalWarningRender,
            KEYS.generalWarningThreshold,
            KEYS.generalWarningTypes,
            KEYS.generalWarningScopeMode,
            KEYS.generalWarningItems,
            KEYS.generalWarningWarnStoppedOrders,
            KEYS.generalWarningHideStoppedOrders,
            KEYS.generalWarningHideVoidedTemporary
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
            "// @name         智慧医疗－临床路径组套跨标签页自动录入",
            "// @namespace    http://tampermonkey.net/",
            "// @version      1.48.33",
            "// @description  v1.48.33：高级条目设置改用浏览器原生模态层居中，修复仍停留在左上角的问题；保留v1.48.32其余功能",
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
                medicalClinicalPathwayMain
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
                "临床路径组套跨标签页自动录入",
            version:
                "1.48.33",
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
                        state.running || state.bulkDeletingOrders || state.aiBusy || state.orderImportAiBusy
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
                "临床路径组套跨标签页自动录入",
            version:
                "1.48.33",
            role:
                'business',
            fileName:
                "智慧医疗－临床路径组套跨标签页自动录入_v1.48.33.user.js",
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

        /*
         * v1.48.24：加载时序兜底。
         * 正常情况下，上面的“直接注册或排队”已经足够；这里再监听管理器
         * 两个注册表ready事件。若管理器因为脚本加载顺序稍晚才创建注册表，
         * 则在ready后再次用同一个key/id注册。管理器内部使用Map覆盖同键，
         * 因而不会产生重复业务项，也不会重复建立下面的变更轮询定时器。
         */
        if (!suiteBackupRegister._readyEventsBound) {
            suiteBackupRegister._readyEventsBound = true;

            document.addEventListener(
                'medical-userscript-backup-registry-ready',
                function () {
                    try {
                        const registry =
                            suiteBackupPageWindow()
                                .MedicalUserscriptBackupRegistry;

                        if (
                            registry &&
                            typeof registry.register === 'function'
                        ) {
                            registry.register(adapter);
                        }
                    } catch (error) {
                        console.warn(
                            '[WebDAV数据备份适配] ready重注册失败：',
                            error
                        );
                    }
                },
                false
            );

            document.addEventListener(
                'medical-userscript-source-backup-registry-ready',
                function () {
                    try {
                        const registry =
                            suiteBackupPageWindow()
                                .MedicalUserscriptSourceBackupRegistry;

                        if (
                            registry &&
                            typeof registry.register === 'function'
                        ) {
                            registry.register(sourceProvider);
                        }
                    } catch (error) {
                        console.warn(
                            '[脚本源码备份适配] ready重注册失败：',
                            error
                        );
                    }
                },
                false
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
