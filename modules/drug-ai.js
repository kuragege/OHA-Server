// ==UserScript==
// @name         智慧医疗－药品AI辅助自动录入
// @namespace    http://tampermonkey.net/
// @version      1.28.26
// @description  v1.28.26：批量同步WebDAV数据备份注册、源码快照版本、源码备份文件名及统一管理器脚本版本信息至1.28.26；保留v1.28.25全局AI密钥校验兼容修复、DeepSeek/智谱GLM/OpenAI全局AI调用适配及其余既有功能
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
(function medicalDrugAiAutoFillMain() {
    'use strict';

    if (window.top !== window.self) {
        return;
    }

    const STYLE = Object.freeze({
        panelWidth: 174,
        panelRadius: 7,
        headerColor: '#117fac',
        modalHeaderLightnessDelta: 0.15,
        primaryColor: '#159bd3',
        primaryHoverColor: '#118bc0',
        secondaryBackground: '#f3fbfe',
        secondaryHoverBackground: '#e5f6fc',
        secondaryBorderColor: '#b9d9e7',
        secondaryTextColor: '#117fac',
        panelShadow: '0 4px 14px rgba(0,0,0,.28)'
    });

    function lightenHexColor(hex, delta) {
        const value = String(hex || '').replace(/^#/, '');
        if (!/^[0-9a-f]{6}$/i.test(value)) {
            return '#117fac';
        }

        let r = parseInt(value.slice(0, 2), 16) / 255;
        let g = parseInt(value.slice(2, 4), 16) / 255;
        let b = parseInt(value.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        let l = (max + min) / 2;
        const d = max - min;

        if (d) {
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) {
                h = (g - b) / d + (g < b ? 6 : 0);
            } else if (max === g) {
                h = (b - r) / d + 2;
            } else {
                h = (r - g) / d + 4;
            }
            h /= 6;
        }

        l = Math.max(0, Math.min(1, l + (Number(delta) || 0)));

        function hueToRgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        if (!s) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hueToRgb(p, q, h + 1 / 3);
            g = hueToRgb(p, q, h);
            b = hueToRgb(p, q, h - 1 / 3);
        }

        const toHex = function (number) {
            return Math.round(number * 255).toString(16).padStart(2, '0');
        };

        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    const MODAL_HEADER_COLOR = lightenHexColor(
        STYLE.headerColor,
        STYLE.modalHeaderLightnessDelta
    );

    const IDS = {
        panel: 'medical-drug-auto-fill-panel-v1',
        button: 'medical-drug-auto-fill-button-v1',
        modal: 'medical-drug-auto-fill-modal-v1',
        style: 'medical-drug-auto-fill-style-v1',
        status: 'medical-drug-auto-fill-status-v1',
        claimFrontStyle: 'medical-drug-claim-front-style-v1'
    };

    const KEYS = {
        apiKey: 'medicalDrugDeepSeekApiKeyV1',
        model: 'medicalDrugDeepSeekModelV1',
        patientDraft: 'medicalDrugPatientDraftV1',
        medicineDraft: 'medicalDrugMedicineDraftV1',
        guideQuery: 'medicalDrugGuideQueryV1',
        clinicalQuery: 'medicalDrugClinicalGuidelineQueryV1',
        autoSave: 'medicalDrugAutoSaveV1',
        position: 'medicalDrugPanelPositionV1',
        collapsed: 'medicalDrugPanelCollapsedV1',
        sectionCollapsed: 'medicalDrugSectionCollapsedV1',
        claimWarningEnabled: 'medicalDrugClaimWarningEnabledV1',
        claimWarningRenderEnabled: 'medicalDrugClaimWarningRenderEnabledV1',
        claimWarningShowStoppedOrders: 'medicalDrugClaimWarningShowStoppedOrdersV1',
        /* 旧键仅用于兼容v1.20以前的单阈值设置。 */
        claimWarningThresholdDays: 'medicalDrugClaimWarningThresholdDaysV1',
        claimWarningRenderThresholdDays: 'medicalDrugClaimWarningRenderThresholdDaysV1',
        claimWarningSelectThresholdDays: 'medicalDrugClaimWarningSelectThresholdDaysV1',
        claimWarningLongRouteScopes: 'medicalDrugClaimWarningLongRouteScopesV1',
        claimWarningCompensationRouteScopes: 'medicalDrugClaimWarningCompensationRouteScopesV1',
        claimWarningRenderLiquidEnabled: 'medicalDrugClaimWarningRenderLiquidEnabledV1'
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



    const DRUG_SHARED_WESTERN_DATALIST_ID =
        'medical-drug-shared-western-datalist-v1';

    function ensureDrugSharedWesternDatalist(modal) {
        let datalist = modal.querySelector(
            '#' + DRUG_SHARED_WESTERN_DATALIST_ID
        );

        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = DRUG_SHARED_WESTERN_DATALIST_ID;
            modal.appendChild(datalist);
        }

        return datalist;
    }

    function renderDrugSharedWesternDatalist(modal) {
        const datalist = ensureDrugSharedWesternDatalist(modal);

        if (!datalist) return;

        const library = loadSuiteSharedKnowledge();
        const enabled = Boolean(
            library.settings.enableWesternDrugSuggestion
        );

        if (!enabled) {
            datalist.innerHTML = '';
            datalist._sharedEntryMap = new Map();
            return;
        }

        const entries = library.westernDrugs.filter(function (item) {
            return item && item.enabled !== false &&
                (item.name || item.searchName);
        });
        const pinyinEnabled = Boolean(
            library.settings.enableWesternDrugPinyinInitials
        );
        const nameCounts = new Map();
        const seen = new Set();
        const entryMap = new Map();
        const fragment = document.createDocumentFragment();

        entries.forEach(function (item) {
            const key = suiteSharedKey(item.name || item.searchName);
            if (!key) return;
            nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
        });

        function baseValue(item) {
            const name = suiteSharedPlain(item.name || item.searchName);
            const duplicateCount = nameCounts.get(suiteSharedKey(name)) || 0;

            if (duplicateCount <= 1) {
                return name;
            }

            return [
                name,
                suiteSharedPlain(item.specification),
                suiteSharedPlain(item.manufacturer),
                suiteSharedPlain(item.code)
            ].filter(Boolean).join('｜');
        }

        function appendOption(value, item, prefixLabel) {
            const optionValue = suiteSharedPlain(value);
            const key = optionValue.toLowerCase();

            if (!optionValue || !key || seen.has(key)) return;

            seen.add(key);
            entryMap.set(key, item);

            const option = document.createElement('option');
            option.value = optionValue;
            option.label = [
                prefixLabel || '',
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
            ].filter(Boolean).join('；');
            fragment.appendChild(option);
        }

        entries.forEach(function (item) {
            const base = baseValue(item);

            if (!base) return;

            appendOption(base, item, '药品名称');

            if (
                item.searchName &&
                suiteSharedKey(item.searchName) !==
                    suiteSharedKey(item.name)
            ) {
                appendOption(
                    item.searchName + '｜' + base,
                    item,
                    '医院检索名'
                );
            }

            if (item.code) {
                appendOption(
                    item.code + '｜' + base,
                    item,
                    '药品编码'
                );
            }

            (item.aliases || []).slice(0, 6).forEach(function (alias) {
                const cleanAlias = suiteSharedPlain(alias);
                if (!cleanAlias) return;
                appendOption(
                    cleanAlias + '｜' + base,
                    item,
                    '别名'
                );
            });

            if (pinyinEnabled) {
                const initials = suiteSharedPinyinInitials(
                    item.name || item.searchName
                );

                if (initials) {
                    appendOption(
                        initials + '｜' + base,
                        item,
                        '拼音首字母'
                    );
                }
            }
        });

        datalist.innerHTML = '';
        datalist.appendChild(fragment);
        datalist._sharedEntryMap = entryMap;
    }

    function applyDrugSharedWesternToRow(input) {
        const row = input && input.closest('.drug-result-body tr');

        if (!row) return false;

        const modal = input.closest('#' + IDS.modal);
        const datalist = modal
            ? ensureDrugSharedWesternDatalist(modal)
            : null;
        const rawValue = suiteSharedPlain(input.value);
        const entryMap = datalist &&
            datalist._sharedEntryMap instanceof Map
                ? datalist._sharedEntryMap
                : new Map();
        const matched = entryMap.get(rawValue.toLowerCase()) ||
            suiteResolveWesternDrug(rawValue);

        if (!matched) return false;

        const source = row.querySelector('.drug-source');
        const standard = row.querySelector('.drug-standard');
        const specification = row.querySelector('.drug-spec');
        const unit = row.querySelector('.drug-unit');

        if (source) {
            source.value = matched.name || matched.searchName || '';
        }

        if (standard) {
            standard.value = matched.searchName || matched.name || '';
        }

        if (
            specification &&
            !specification.value.trim() &&
            matched.specification
        ) {
            specification.value = matched.specification;
        }

        if (unit && !unit.value.trim() && matched.unit) {
            unit.value = matched.unit;
        }

        return true;
    }

    function enrichDrugItemFromSharedLibrary(item) {
        if (!item || typeof item !== 'object') return item;

        const matched =
            suiteResolveWesternDrug(item.standardName) ||
            suiteResolveWesternDrug(item.sourceName);

        if (!matched) return item;

        item.sourceName = matched.name || item.sourceName;
        item.standardName = matched.searchName || matched.name ||
            item.standardName;

        if (!item.specificationHint && matched.specification) {
            item.specificationHint = matched.specification;
        }

        if (!item.doseUnit && matched.unit) {
            item.doseUnit = matched.unit;
        }

        return item;
    }

    function bindDrugSharedWesternSuggestions(modal) {
        const body = modal.querySelector('.drug-result-body');

        if (!body || body.dataset.sharedWesternBound === '1') return;

        body.dataset.sharedWesternBound = '1';

        body.addEventListener('focusin', function (event) {
            const input = event.target.closest(
                '.drug-source,.drug-standard'
            );

            if (!input) return;

            input.setAttribute(
                'list',
                DRUG_SHARED_WESTERN_DATALIST_ID
            );
        });

        body.addEventListener('change', function (event) {
            const input = event.target.closest(
                '.drug-source,.drug-standard'
            );

            if (!input) return;

            if (applyDrugSharedWesternToRow(input)) {
                state.items = readTable(modal);
            }
        });

        body.addEventListener('keydown', function (event) {
            const input = event.target.closest(
                '.drug-source,.drug-standard'
            );

            if (!input || event.key !== 'Enter') return;

            setTimeout(function () {
                if (applyDrugSharedWesternToRow(input)) {
                    state.items = readTable(modal);
                }
            }, 0);
        });

        window.addEventListener(
            'medical-userscript-shared-knowledge-changed',
            function () {
                renderDrugSharedWesternDatalist(modal);
            }
        );
    }

    /******************************************************************
     * 药品说明书搜索框：传统输入框 + 原生datalist下拉菜单
     *
     * v1.15使用脚本实时创建复杂候选面板；每次键入都会重绘多层DOM，
     * 容易造成界面卡顿，并因候选层参与当前弹窗布局而出现输入框移位。
     * v1.16改用与门诊助手一致的原生datalist：
     * 1. 输入框尺寸始终固定；候选菜单由浏览器悬浮显示，不占据文档流。
     * 2. 联想库只在打开弹窗或共享库变化时生成一次，不随每个字符重绘。
     * 3. 保留药名、检索名、编码、别名及拼音首字母检索。
     ******************************************************************/

    const DRUG_GUIDE_SHARED_DATALIST_ID =
        'medical-drug-guide-shared-western-datalist-v1';

    function drugGuideSharedQueryPart(value) {
        const raw = suiteSharedPlain(value);

        if (!raw) return '';

        if (/^西药[|｜]/.test(raw)) {
            return raw;
        }

        return raw.split(/\s+/)[0] || raw;
    }

    function drugGuideSharedRemainder(value) {
        const raw = suiteSharedPlain(value);

        if (!raw || /^西药[|｜]/.test(raw)) {
            return '';
        }

        const matched = raw.match(/^\S+\s+([\s\S]+)$/);

        return matched ? suiteSharedPlain(matched[1]) : '';
    }

    function drugGuideSharedSelectionText(item, oldValue) {
        if (!item) return suiteSharedPlain(oldValue);

        const name = suiteSharedPlain(item.name || item.searchName);
        const specification = suiteSharedPlain(item.specification);
        const remainder = drugGuideSharedRemainder(oldValue);
        const parts = [name];

        if (
            specification &&
            !suiteSharedKey(name).includes(suiteSharedKey(specification))
        ) {
            parts.push(specification);
        }

        if (
            remainder &&
            !suiteSharedKey(parts.join(' ')).includes(
                suiteSharedKey(remainder)
            )
        ) {
            parts.push(remainder);
        }

        return parts.filter(Boolean).join(' ');
    }

    function ensureDrugGuideSharedDatalist(modal) {
        if (!modal) return null;

        let datalist = modal.querySelector(
            '#' + DRUG_GUIDE_SHARED_DATALIST_ID
        );

        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = DRUG_GUIDE_SHARED_DATALIST_ID;
            modal.appendChild(datalist);
        }

        return datalist;
    }

    function drugGuideSharedNameCounts(entries) {
        const counts = new Map();

        (entries || []).forEach(function (item) {
            const key = suiteSharedKey(item && (item.name || item.searchName));
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return counts;
    }

    function drugGuideSharedBaseOptionValue(item, nameCounts) {
        const name = suiteSharedPlain(item && (item.name || item.searchName));

        if (!name) return '';

        const duplicateCount = nameCounts.get(suiteSharedKey(name)) || 0;

        if (duplicateCount <= 1) {
            return name;
        }

        return [
            name,
            suiteSharedPlain(item.specification),
            suiteSharedPlain(item.manufacturer),
            suiteSharedPlain(item.code)
        ].filter(Boolean).join('｜');
    }

    function renderDrugGuideSharedSuggestions(modal, input) {
        const datalist = ensureDrugGuideSharedDatalist(modal);

        if (!datalist || !input) return;

        const library = loadSuiteSharedKnowledge();
        const enabled = Boolean(
            library.settings.enableWesternDrugSuggestion
        );

        if (!enabled) {
            datalist.innerHTML = '';
            datalist._sharedEntryMap = new Map();
            input.removeAttribute('list');
            return;
        }

        input.setAttribute('list', DRUG_GUIDE_SHARED_DATALIST_ID);

        const entries = library.westernDrugs.filter(function (item) {
            return item && item.enabled !== false &&
                (item.name || item.searchName);
        });
        const nameCounts = drugGuideSharedNameCounts(entries);
        const pinyinEnabled = Boolean(
            library.settings.enableWesternDrugPinyinInitials
        );
        const seen = new Set();
        const entryMap = new Map();
        const fragment = document.createDocumentFragment();

        function appendOption(value, item, prefixLabel) {
            const optionValue = suiteSharedPlain(value);
            const key = optionValue.toLowerCase();

            if (!optionValue || !key || seen.has(key)) return;

            seen.add(key);
            entryMap.set(key, item);

            const option = document.createElement('option');
            const details = [
                prefixLabel || '',
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

            option.value = optionValue;
            option.label = details.join('；');
            fragment.appendChild(option);
        }

        entries.forEach(function (item) {
            const baseValue = drugGuideSharedBaseOptionValue(
                item,
                nameCounts
            );

            if (!baseValue) return;

            appendOption(baseValue, item, '药品名称');

            if (
                item.searchName &&
                suiteSharedKey(item.searchName) !==
                    suiteSharedKey(item.name)
            ) {
                appendOption(
                    item.searchName + '｜' + baseValue,
                    item,
                    '医院检索名'
                );
            }

            if (item.code) {
                appendOption(
                    item.code + '｜' + baseValue,
                    item,
                    '药品编码'
                );
            }

            (item.aliases || []).slice(0, 6).forEach(function (alias) {
                const cleanAlias = suiteSharedPlain(alias);
                if (!cleanAlias) return;
                appendOption(
                    cleanAlias + '｜' + baseValue,
                    item,
                    '别名'
                );
            });

            if (pinyinEnabled) {
                const initials = suiteSharedPinyinInitials(
                    item.name || item.searchName
                );

                if (initials) {
                    appendOption(
                        initials + '｜' + baseValue,
                        item,
                        '拼音首字母'
                    );
                }
            }
        });

        datalist.innerHTML = '';
        datalist.appendChild(fragment);
        datalist._sharedEntryMap = entryMap;
    }

    function hideDrugGuideSharedSuggestions() {
        /* 原生datalist由浏览器管理，不再创建或隐藏自定义候选面板。 */
    }

    function setDrugGuideSharedSuggestionActive() {
        /* 原生datalist自行处理上下键高亮。 */
    }

    function applyDrugGuideSharedWesternSelection(
        modal,
        input,
        selectedItem,
        exactCandidateOnly
    ) {
        if (!input) return false;

        const datalist = ensureDrugGuideSharedDatalist(modal);
        const rawValue = suiteSharedPlain(input.value);
        const entryMap = datalist && datalist._sharedEntryMap instanceof Map
            ? datalist._sharedEntryMap
            : new Map();
        const mapped = entryMap.get(rawValue.toLowerCase()) || null;
        const item = exactCandidateOnly
            ? (selectedItem || mapped)
            : (
                selectedItem ||
                mapped ||
                suiteResolveWesternDrug(rawValue) ||
                suiteResolveWesternDrug(
                    drugGuideSharedQueryPart(rawValue)
                )
            );

        /*
         * exactCandidateOnly用于联想菜单确认：只有输入值与当前datalist
         * 中某个候选value完全一致时才回填，禁止在普通失焦时做模糊解析。
         */
        if (!item) return false;

        /*
         * 选择datalist候选时，输入框会先被候选value替换。这里使用最近一次
         * 自由键入文本保存其后续适应证说明，避免把“｜规格｜厂家”等候选
         * 展示信息误当成查询内容。
         */
        const oldFreeText = suiteSharedPlain(
            input._drugGuideLastFreeText || ''
        );
        const sourceText = oldFreeText || rawValue;
        const nextValue = drugGuideSharedSelectionText(
            item,
            sourceText
        );
        const win = input.ownerDocument.defaultView;
        const descriptor = Object.getOwnPropertyDescriptor(
            win.HTMLInputElement.prototype,
            'value'
        );

        if (descriptor && descriptor.set) {
            descriptor.set.call(input, nextValue);
        }
        else {
            input.value = nextValue;
        }

        input.setAttribute('value', nextValue);
        input._drugGuideLastFreeText = nextValue;
        input._drugGuideLastObservedValue = nextValue;
        input._drugGuideApplyingSelection = true;

        try {
            input.dispatchEvent(new win.Event('input', {
                bubbles: true
            }));
        }
        finally {
            input._drugGuideApplyingSelection = false;
        }

        GM_setValue(KEYS.guideQuery, nextValue);

        return true;
    }

    function bindDrugGuideSharedWesternSuggestions(modal) {
        const input = modal.querySelector('.drug-guide-query');

        if (
            !input ||
            input.dataset.sharedWesternBound === '1'
        ) {
            return;
        }

        input.dataset.sharedWesternBound = '1';
        input.setAttribute('list', DRUG_GUIDE_SHARED_DATALIST_ID);

        input.addEventListener('focus', function () {
            if (!input._drugGuideLastFreeText) {
                input._drugGuideLastFreeText = input.value || '';
            }

            input._drugGuideLastObservedValue = input.value || '';
        });

        /*
         * Chrome 109等旧版Chromium对原生datalist候选的input事件信息
         * 并不稳定：有时inputType既不是insertReplacementText，也可能为空。
         * 因此额外记录输入来源，并明确排除粘贴、中文输入法合成和普通失焦。
         */
        input.addEventListener('beforeinput', function (event) {
            input._drugGuideLastBeforeInputType = String(
                event && event.inputType || ''
            );
        });

        input.addEventListener('compositionstart', function () {
            input._drugGuideComposing = true;
        });

        input.addEventListener('compositionend', function () {
            input._drugGuideComposing = false;
        });

        input.addEventListener('paste', function () {
            input._drugGuidePastePending = true;
            setTimeout(function () {
                input._drugGuidePastePending = false;
            }, 0);
        });

        input.addEventListener('input', function (event) {
            if (input._drugGuideApplyingSelection) return;

            const datalist = ensureDrugGuideSharedDatalist(modal);
            const map = datalist && datalist._sharedEntryMap instanceof Map
                ? datalist._sharedEntryMap
                : null;
            const current = suiteSharedPlain(input.value);
            const previous = suiteSharedPlain(
                input._drugGuideLastObservedValue || ''
            );
            const exactCandidate = Boolean(
                map && map.has(current.toLowerCase())
            );
            const eventInputType = String(
                event && event.inputType || ''
            );
            const beforeInputType = String(
                input._drugGuideLastBeforeInputType || ''
            );
            const effectiveInputType = eventInputType || beforeInputType;
            const isPaste = Boolean(
                input._drugGuidePastePending ||
                /insertFromPaste/i.test(effectiveInputType)
            );
            const isComposing = Boolean(
                input._drugGuideComposing ||
                (event && event.isComposing)
            );
            const containsCandidateSeparator = /[|｜]/.test(current);
            const valueJumped = Math.abs(
                current.length - previous.length
            ) > 1;

            /*
             * 明确候选选择的兼容判断：
             * 1. 新版Chromium：insertReplacementText / insertFromDrop；
             * 2. 候选value含“｜”等结构化字段，说明浏览器已替换为候选；
             * 3. Chrome 109：inputType为空，但data为null或文本发生明显跳变。
             *
             * 粘贴、输入法合成和普通逐字输入均不视为候选选择；本函数仍不
             * 监听change/blur，因此点击空白处不会自动匹配或补入规格。
             */
            const nativeCandidateSelected = Boolean(
                exactCandidate &&
                current !== previous &&
                event && event.isTrusted &&
                !isPaste &&
                !isComposing &&
                (
                    /^(insertReplacementText|insertFromDrop)$/i.test(
                        effectiveInputType
                    ) ||
                    containsCandidateSeparator ||
                    (
                        !effectiveInputType &&
                        (
                            event.data === null ||
                            valueJumped
                        )
                    )
                )
            );

            input._drugGuideLastObservedValue = input.value || '';
            input._drugGuideLastBeforeInputType = '';

            if (nativeCandidateSelected) {
                setTimeout(function () {
                    applyDrugGuideSharedWesternSelection(
                        modal,
                        input,
                        null,
                        true
                    );
                }, 0);
                return;
            }

            /*
             * 所有非明确候选选择均按自由输入处理。尤其不监听change/blur，
             * 因此点击空白处使输入框失焦时不会自动选药或追加规格。
             */
            input._drugGuideLastFreeText = input.value || '';
        });

        input.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;

            /*
             * Enter属于明确确认动作。让浏览器先完成datalist候选替换，
             * 再仅按当前候选表中的完全一致值回填；不再做模糊自动匹配。
             */
            setTimeout(function () {
                applyDrugGuideSharedWesternSelection(
                    modal,
                    input,
                    null,
                    true
                );
            }, 0);
        });

        window.addEventListener(
            'medical-userscript-shared-knowledge-changed',
            function () {
                renderDrugGuideSharedSuggestions(modal, input);
            }
        );
    }

    const ENDPOINT = 'https://api.deepseek.com/chat/completions';

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
        'medicalDrugGlmApiKeyV1';
    const SUITE_GLOBAL_AI_OPENAI_API_KEY_GM_KEY =
        'medicalDrugOpenAiApiKeyV1';
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
        key: 'drug',
        name: '药品AI辅助自动录入',
        version: '1.28.26',
        getDeepSeekKey: function () {
            return String(GM_getValue(KEYS.apiKey, '') || '').trim();
        },
        setDeepSeekKey: function (value) {
            GM_setValue(KEYS.apiKey, value);
        }
    });

    const DEFAULT_MODEL = 'deepseek-chat';

    /******************************************************************
     * 悬浮框管理器－本地医嘱操作日志 AI整理桥接
     *
     * 管理器保持@grant none以确保PatList/XHR原生劫持不受Tampermonkey
     * 沙箱影响；因此由本药品脚本复用现有GM_xmlhttpRequest和DeepSeek
     * API Key执行逐条日志整理。只接收操作类型、按钮文字、医嘱详情和
     * 请求结果，不需要患者姓名、住院号等身份字段。
     ******************************************************************/
    const ORDER_LOG_AI_REQUEST_TYPE =
        'medical-openhis-order-log-ai-request-v1';

    const ORDER_LOG_AI_RESPONSE_TYPE =
        'medical-openhis-order-log-ai-response-v1';

    function deepSeekOrderLogAiBridgeRequest(payload) {
        const apiKey = String(GM_getValue(KEYS.apiKey, '') || '').trim();
        const model = String(
            GM_getValue(KEYS.model, DEFAULT_MODEL) || DEFAULT_MODEL
        ).trim() || DEFAULT_MODEL;

        if (!suiteGlobalAiHasApiKey(apiKey)) {
            return Promise.reject(new Error(
                '药品AI辅助自动录入脚本尚未配置当前AI服务所需API Key'
            ));
        }

        const mode = String(payload && payload.mode || 'single');
        const handoffMode = mode === 'handoff';

        const prompt = handoffMode
            ? [
                '你是住院病区医护交班日志整理工具。',
                '输入是当前浏览器本机医嘱操作日志，患者姓名/住院号/床号已经在本地替换成匿名代号，例如【患者P001】。',
                '只根据输入日志总结，不得补充、猜测、纠正或推断日志中没有的诊断、病情、疗效、风险或医嘱目的。',
                '按患者匿名代号分组，合并同类重复操作，突出本班次发生的医嘱变动。',
                '交班格式固定为：',
                '【患者Pxxx】',
                '新增/开立：……',
                '调整/变更：……',
                '停止/作废/删除：……',
                '其他操作：……',
                '交班关注：仅写日志明确显示为失败、未确认、尚待处理或需继续核对的事项；若无则写“无明确待关注事项”。',
                '没有对应类别时可以省略该行；不得把“请求完成/HTTP 200”解释为临床执行完成，只能视为本机请求已完成。',
                '同一患者多条相同医嘱尽量合并，保留药品/项目名称、剂量、用法、频次、长临、停止/作废等关键字段。',
                '不要输出任何真实患者身份信息，也不要改写匿名患者代号。',
                '结果应简洁、适合直接粘贴到医护交班记录中。',
                '必须只输出JSON对象：{"summary":"医护交班格式文本"}'
            ].join('\n')
            : [
                '你是医院医嘱操作日志整理工具。',
                '用户提供的是本机浏览器操作产生的一条医嘱变动日志。',
                '只根据原始日志提取信息，不得补充、猜测或纠正日志中没有的内容。',
                '重点识别：变更动作、长/临、医嘱类别、药品/中药/检验/检查/康复/项目名称、规格、每次剂量、单位、用法、频次、组号、天数、总量，以及停止/作废/删除等状态。',
                '若一条日志包含多条医嘱，按①②③逐条列出；最多保留8条最明确的医嘱。',
                '若无法确定哪一条是实际变更对象，应明确写“变更对象未完全定位”，不要自行选择。',
                '删除页面表头、按钮菜单、候选列表等无关噪声，只保留有临床意义的医嘱字段。',
                'summary应尽量控制在500个中文字符内，格式紧凑，适合直接显示在日志表格中。',
                '必须只输出JSON对象：{"summary":"整理后的中文摘要"}'
            ].join('\n');

        return new Promise(function (resolve, reject) {
            suiteGlobalAiXmlhttpRequest({
                method: 'POST',
                url: ENDPOINT,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + apiKey
                },
                data: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: prompt },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                mode: mode,
                                operation: String(payload.operation || ''),
                                actionLabel: String(payload.actionLabel || ''),
                                detail: String(payload.detail || '').slice(
                                    0,
                                    handoffMode ? 60000 : 9000
                                ),
                                requestResult: String(payload.result || '')
                            })
                        }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.05,
                    max_tokens: handoffMode ? 3200 : 1800,
                    stream: false
                }),
                timeout: 90000,
                onload: function (response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(
                            'DeepSeek接口HTTP ' + response.status
                        ));
                        return;
                    }

                    try {
                        const outer = JSON.parse(response.responseText);
                        const content = outer && outer.choices &&
                            outer.choices[0] && outer.choices[0].message
                            ? outer.choices[0].message.content
                            : '';
                        if (!content) {
                            throw new Error('DeepSeek未返回有效内容');
                        }

                        const parsed = extractJsonObject(content);
                        const summary = String(
                            parsed && parsed.summary || ''
                        ).trim();
                        if (!summary) {
                            throw new Error('AI结果中缺少summary');
                        }
                        resolve(summary.slice(0, 1800));
                    }
                    catch (error) {
                        reject(new Error(
                            'AI整理结果解析失败：' + error.message
                        ));
                    }
                },
                onerror: function () {
                    reject(new Error('DeepSeek网络请求失败'));
                },
                ontimeout: function () {
                    reject(new Error('DeepSeek整理请求超时'));
                }
            });
        });
    }

    window.addEventListener('message', function (event) {
        const data = event && event.data;
        if (!data || data.type !== ORDER_LOG_AI_REQUEST_TYPE) {
            return;
        }

        const requestId = String(data.requestId || '');
        if (!requestId) return;

        deepSeekOrderLogAiBridgeRequest(data)
            .then(function (summary) {
                window.postMessage({
                    type: ORDER_LOG_AI_RESPONSE_TYPE,
                    requestId: requestId,
                    success: true,
                    summary: summary
                }, '*');
            })
            .catch(function (error) {
                window.postMessage({
                    type: ORDER_LOG_AI_RESPONSE_TYPE,
                    requestId: requestId,
                    success: false,
                    error: String(error && error.message || error || 'AI整理失败')
                }, '*');
            });
    }, false);

    /*
     * “药品录入”表格最左侧还有一列没有表头的行号：
     * 0=行号，1=长临，2=组号，3=名称，4=开始时间……
     *
     * 注意：“出院带药”页面没有组号列，且药名表头显示为“药名”。
     * v1.1曾因错误停留在“出院带药”标签页，又没有识别“药名”别名，
     * 最终按固定索引3把药名写进了“开始时间”。v1.2同时修复标签页定位和表头别名识别。
     */
    const COLUMNS = {
        长临: 1,
        组号: 2,
        名称: 3,
        开始时间: 4,
        规格: 5,
        剂量: 6,
        单位: 7,
        用法: 8,
        组套: 9,
        组差编码: 10,
        频次: 11,
        滴速: 12,
        天数: 13,
        总量: 14,
        药房单位: 15,
        自付比例: 16,
        嘱托: 17,
        抗生素原因: 18,
        转自费: 19,
        计费: 20,
        精麻: 21,
        操作: 22,
        医嘱诊断: 23,
        是否皮试: 24
    };

    /*
     * 同一业务字段在不同标签页可能使用不同表头文字。
     * 尤其“名称”在“出院带药”中显示为“药名”，必须先按表头坐标定位，
     * 不能直接使用药品录入页的固定列号。
     */
    const COLUMN_HEADER_ALIASES = Object.freeze({
        长临: ['长临', '长临嘱', '长临医嘱'],
        名称: ['名称', '药名'],
        抗生素原因: ['抗生素原因', '抗菌药物原因']
    });

    const ROUTES = [
        '', 'po', '含化', '局部麻醉', '皮下注射', '舌下用药',
        '肌肉注射', '局部用药', '外用', '冲管', '鼻饲', '领药',
        '皮下注射（大包装分装）', '穴位注射', '胃管注入', '皮试',
        '静脉滴注', '静脉注射', '雾化', '外敷', '冲洗', '耗材',
        '注射用药', '阴道用药', '关节腔内用药', '喷雾用药',
        '滴眼', '喷喉', '敷伤口', '擦皮肤', '滴鼻', '直肠用药',
        '吸入用药', '皮内注射'
    ];


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

    const FREQUENCIES = [
        '', 'tid', 'st', 'bid', 'q6h', 'q8h', 'qd', 'qid', 'qn',
        'q12h', 'q2h', 'prn', 'qod', 'qw', 'biw', 'tiw', 'qow',
        '2w', '3w', '4w', 'q72h', 'qh', 'q3h', 'q4h'
    ];

    const HIGH_RISK = [
        '胰岛素', '肝素', '华法林', '利伐沙班', '阿哌沙班', '达比加群',
        '地高辛', '氯化钾', '硫酸镁', '吗啡', '芬太尼', '哌替啶',
        '地西泮', '咪达唑仑', '丙泊酚', '甲氨蝶呤', '环磷酰胺',
        '顺铂', '长春新碱', '万古霉素', '庆大霉素'
    ];

    const state = {
        items: [],
        assessment: null,
        drugGuide: null,
        clinicalGuideline: null,
        assessmentSuppressed: false,
        running: false,
        paused: false,
        abortRequested: false,
        claimWarningResults: [],
        claimWarningScanBusy: false,
        claimWarningMeta: null,
        claimWarningFrontSignature: '',
        claimWarningFrontWatcherTimer: null,
        claimWarningFrontRenderTimer: null,
        claimWarningAutoScanTimer: null,
        claimWarningContext: null,
        claimWarningContextObserver: null,
        claimWarningObservedRoot: null,
        claimWarningFrontDirty: true,
        /*
         * v1.28.4：浏览器标签页返回前台后的自动静默刷新保护期。
         * 只抑制自动静默扫描气泡；手工扫描和管理器医嘱标签联动不受影响。
         */
        claimWarningForegroundQuietUntil: 0,
        claimWarningRenderedCells: new Set(),
        claimWarningLastScanAt: 0
    };

    const sleep = function (ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    };

    function normalize(text) {
        return String(text || '')
            .replace(/\s+/g, '')
            .replace(/[：:*＊★☆]/g, '')
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .trim()
            .toLowerCase();
    }

    function plain(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isVisible(element) {
        if (!element || !element.isConnected) {
            return false;
        }
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 && rect.height > 0;
    }

    function realClick(element) {
        if (!element) return;
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
        if (!element) return;
        const win = element.ownerDocument.defaultView;
        element.dispatchEvent(new win.MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: win,
            detail: 2
        }));
    }

    function pressKey(element, key, keyCode) {
        if (!element) return;
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

    function allDocuments() {
        const docs = [];
        const seen = new Set();

        function collect(doc) {
            if (!doc || seen.has(doc)) return;
            seen.add(doc);
            docs.push(doc);
            let frames = [];
            try {
                frames = Array.from(doc.querySelectorAll('iframe,frame'));
            } catch (error) {
                return;
            }
            frames.forEach(function (frame) {
                try {
                    collect(frame.contentDocument || frame.contentWindow.document);
                } catch (error) {
                    // 跨域frame跳过。
                }
            });
        }

        collect(document);
        return docs;
    }

    function setInput(doc, input, value, focus, blur) {
        const win = doc.defaultView;
        if (input.isContentEditable) {
            if (focus !== false) input.focus();
            input.textContent = String(value);
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
            input.dispatchEvent(new win.Event('change', { bubbles: true }));
            if (blur !== false) input.blur();
            return;
        }

        const proto = input instanceof win.HTMLTextAreaElement
            ? win.HTMLTextAreaElement.prototype
            : win.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (focus !== false) input.focus();
        if (descriptor && descriptor.set) {
            descriptor.set.call(input, String(value));
        } else {
            input.value = String(value);
        }
        input.setAttribute('value', String(value));
        if (win.jQuery) {
            win.jQuery(input).val(String(value)).trigger('input').trigger('change').trigger('keyup');
        }
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
        input.dispatchEvent(new win.KeyboardEvent('keyup', { bubbles: true, key: '' }));
        if (blur !== false) input.blur();
    }

    function inputValue(input) {
        if (!input) return '';
        return String(input.isContentEditable ? input.textContent : input.value || '').trim();
    }

    function showStatus(message, type) {
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
            color: '#fff',
            fontSize: '13px',
            lineHeight: '1.7',
            whiteSpace: 'pre-line',
            boxShadow: '0 4px 15px rgba(0,0,0,.28)'
        });
        box.textContent = message;
        clearTimeout(box.hideTimer);
        box.hideTimer = setTimeout(function () {
            box.remove();
        }, type === 'error' ? 18000 : 9000);
    }

    async function checkpoint() {
        if (state.abortRequested) {
            const error = new Error('用户已中止本次药品录入');
            error.name = 'AbortError';
            throw error;
        }
        while (state.paused) {
            await sleep(180);
            if (state.abortRequested) {
                const error = new Error('用户已中止本次药品录入');
                error.name = 'AbortError';
                throw error;
            }
        }
    }

    function normalizeOrderType(value) {
        return /^(临|临时|st)$/i.test(String(value || '').trim()) ? '临' : '长';
    }

    function normalizeRoute(value) {
        const definition = hospitalRouteDefinition(value);

        if (definition) {
            /*
             * 脚本编辑区继续保留po，其他用法保留院内中文标准名称。
             * 实际写入医院页面时再同时使用“简拼代码＋名称”进行定位。
             */
            return definition.name === '口服'
                ? 'po'
                : definition.name;
        }

        return String(value || '').trim();
    }

    function routeToHospitalOption(value) {
        const definition = hospitalRouteDefinition(value);

        return definition
            ? definition.name
            : String(value || '').trim();
    }

    function normalizeFrequency(value) {
        const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
        const aliases = {
            每日一次: 'qd',
            一天一次: 'qd',
            每日二次: 'bid',
            每日两次: 'bid',
            一天两次: 'bid',
            每日三次: 'tid',
            一天三次: 'tid',
            每日四次: 'qid',
            睡前: 'qn',
            必要时: 'prn',
            立即: 'st',
            隔日一次: 'qod',
            每周一次: 'qw'
        };
        return aliases[text] || text;
    }

    function commonMeta(line) {
        const frequency = line.match(/\b(tid|bid|qid|qd|qn|prn|st|qod|qw|biw|tiw|q\d+h|q\d+d|q\d+w)\b/i) ||
            line.match(/(每日一次|一天一次|每日二次|每日两次|一天两次|每日三次|一天三次|每日四次|睡前|必要时|立即|隔日一次|每周一次)/);
        const route = line.match(/\b(ivdrip|ivgtt|iv|im|sc|po)\b/i) ||
            line.match(/(静脉滴注|静滴|静脉注射|肌肉注射|皮下注射|口服|舌下用药|鼻饲|胃管注入|雾化(?:吸入)?|外用|局部用药|阴道用药|含化|敷伤口|直肠用药|吸入用药)/);
        const days = line.match(/(?:共|连用|使用)?\s*(\d+(?:\.\d+)?)\s*(?:天|日)\b/);
        const orderType = line.match(/(?:^|\s)(长|临|长期|临时)(?:\s|$)/);
        return {
            frequency: frequency ? normalizeFrequency(frequency[1] || frequency[0]) : '',
            route: route ? normalizeRoute(route[1] || route[0]) : '',
            days: days ? Number(days[1]) : '',
            orderType: orderType ? normalizeOrderType(orderType[1]) : '长'
        };
    }

    function parseSegment(segment, meta, groupNo) {
        const source = String(segment || '').replace(/^[\s,，;；、+＋]+|[\s,，;；、+＋]+$/g, '').trim();
        if (!source) return null;
        const pattern = /(\d+(?:\.\d+)?)\s*(μg|ug|mcg|mg|g|kg|ml|mL|毫升|微克|毫克|克|单位|万单位|片|粒|袋|支|瓶|喷|滴|枚|吸|揿)(?![\u4e00-\u9fa5a-z])/ig;
        const matches = [];
        let match;
        while ((match = pattern.exec(source))) {
            matches.push({ index: match.index, value: match[1], unit: match[2] });
        }
        const dose = matches.length ? matches[matches.length - 1] : null;
        const name = (dose ? source.slice(0, dose.index) : source)
            .replace(/(?:长|临|长期|临时)\s*$/i, '')
            .replace(/[\s,，;；、]+$/, '')
            .trim();
        if (!name) return null;
        return {
            enabled: true,
            sourceName: name,
            standardName: name,
            specificationHint: '',
            orderType: meta.orderType || '长',
            groupNo: groupNo,
            doseValue: dose ? Number(dose.value) : '',
            doseUnit: dose ? dose.unit : '',
            route: meta.route || '',
            frequency: meta.frequency || '',
            days: meta.days || '',
            indication: '',
            rationale: '',
            warnings: [],
            confidence: '',
            sourceType: 'parsed',
            status: '待核对'
        };
    }

    function parseMedicationText(text) {
        const lines = String(text || '')
            .replace(/\r/g, '\n')
            .replace(/\n{2,}/g, '\n')
            .split(/\n|[；;]+/)
            .map(function (line) { return line.trim(); })
            .filter(Boolean);
        const items = [];
        let groupIndex = 1;
        lines.forEach(function (line) {
            const meta = commonMeta(line);
            const segments = line.split(/[+＋]/).map(function (part) { return part.trim(); }).filter(Boolean);
            const groupNo = segments.length > 1 ? String(groupIndex) : '';
            segments.forEach(function (segment) {
                const item = parseSegment(segment, meta, groupNo);
                if (item) items.push(item);
            });
            if (segments.length > 1) groupIndex += 1;
        });
        return items;
    }

    function localAudit(items) {
        const issues = [];
        const names = new Map();
        (items || []).forEach(function (item, index) {
            if (item.enabled === false) return;
            const name = item.standardName || item.sourceName || ('第' + (index + 1) + '条');
            const key = normalize(name).replace(/(注射液|注射用|片|胶囊|颗粒|口服液|滴丸|丸|乳膏|软膏|喷雾剂|吸入剂)$/g, '');
            if (key) {
                if (!names.has(key)) names.set(key, []);
                names.get(key).push(name);
            }
            if (!Number.isFinite(Number(item.doseValue)) || Number(item.doseValue) <= 0) {
                issues.push({ severity: 'danger', type: '剂量缺失', message: name + '未识别到有效每次剂量。' });
            }
            if (!String(item.doseUnit || '').trim()) {
                issues.push({ severity: 'danger', type: '单位缺失', message: name + '未识别到剂量单位。' });
            }
            if (!String(item.route || '').trim()) {
                issues.push({ severity: 'warning', type: '用法缺失', message: name + '未明确用法。' });
            }
            if (!String(item.frequency || '').trim()) {
                issues.push({ severity: 'warning', type: '频次缺失', message: name + '未明确频次。' });
            }
            if (HIGH_RISK.some(function (word) { return name.includes(word); })) {
                issues.push({
                    severity: 'warning',
                    type: '高警示药品',
                    message: name + '需要重点复核适应证、剂量、监测、禁忌证及给药途径。'
                });
            }
        });
        names.forEach(function (values) {
            if (values.length > 1) {
                issues.push({ severity: 'warning', type: '可能重复用药', message: values.join('、') + '可能重复开立。' });
            }
        });
        return issues;
    }

    function extractJsonObject(text) {
        const content = String(text || '').trim();
        try {
            return JSON.parse(content);
        } catch (error) {
            const clean = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            try {
                return JSON.parse(clean);
            } catch (secondError) {
                const start = clean.indexOf('{');
                const end = clean.lastIndexOf('}');
                if (start >= 0 && end > start) {
                    return JSON.parse(clean.slice(start, end + 1));
                }
                throw secondError;
            }
        }
    }

    function deepSeekRequest(apiKey, model, patientText, medicineText, parsedItems) {
        const hasMedicine = Boolean(String(medicineText || '').trim());
        const prompt = [
            '你是中国医院住院药品医嘱解析与合理用药辅助工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '本工具仅供医师和临床药师人工复核，不得替代处方审核。',
            '未提供的肝肾功能、过敏史、妊娠、体重、实验室指标必须列入missingInformation，不得假设。',
            hasMedicine
                ? '药品文本不为空：解析现有医嘱并审查，不得把新增药品混入自动录入items；新增建议只能放入alternativeSuggestions。'
                : '药品文本为空：可根据患者资料生成候选方案，但每条必须sourceType为suggested且enabled为false。',
            '识别字段：药名、系统检索名称、规格提示、长临、组号、每次剂量、单位、用法、频次、天数。',
            'orderType只能是长或临。',
            'route优先使用：po、舌下用药、鼻饲、领药、胃管注入、雾化、耗材、注射用药、局部用药、阴道用药、含化、敷伤口、直肠用药、吸入用药。',
            'frequency优先使用：tid、st、bid、q6h、q8h、qd、qid、qn、q12h、q2h、prn、qod、qw、biw、tiw、qow、2w、3w、4w、q72h、qh、q3h、q4h。',
            '同一静脉输液组的溶媒和药品使用相同groupNo；不确定时留空。',
            '不能确定的剂量、单位、用法、频次必须留空并写入warnings。',
            '审查适应证、重复用药、相互作用、禁忌、年龄风险、肝肾调整、过敏、途径、剂量频次、疗程、抗菌药物和监测。',
            'riskLevel只能是low、medium、high、critical，confidence为0到1。',
            'JSON结构：',
            '{"items":[{"index":0,"enabled":true,"sourceType":"parsed","sourceName":"药名","standardName":"药名","specificationHint":"规格","orderType":"长","groupNo":"","doseValue":100,"doseUnit":"mg","route":"po","frequency":"qd","days":"","indication":"适应证","rationale":"依据","warnings":[],"confidence":0.9}],"assessment":{"riskLevel":"medium","summary":"总体评价","appropriateness":"合理性","interactions":[],"contraindications":[],"doseRouteFrequencyIssues":[],"renalHepaticConsiderations":[],"ageSpecificConsiderations":[],"antimicrobialStewardship":[],"monitoring":[],"missingInformation":[],"alternativeSuggestions":[],"nonDrugSuggestions":[]}}'
        ].join('\n');

        return new Promise(function (resolve, reject) {
            suiteGlobalAiXmlhttpRequest({
                method: 'POST',
                url: ENDPOINT,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + apiKey
                },
                data: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: prompt },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                patientInformation: String(patientText || '').trim(),
                                medicationText: String(medicineText || '').trim(),
                                locallyParsedItems: parsedItems || []
                            })
                        }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.1,
                    max_tokens: 7000,
                    stream: false
                }),
                timeout: 120000,
                onload: function (response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error('DeepSeek接口返回HTTP ' + response.status + '：' + String(response.responseText || '').slice(0, 800)));
                        return;
                    }
                    try {
                        const outer = JSON.parse(response.responseText);
                        const content = outer && outer.choices && outer.choices[0] && outer.choices[0].message
                            ? outer.choices[0].message.content
                            : '';
                        if (!content) throw new Error('接口未返回有效内容');
                        resolve(extractJsonObject(content));
                    } catch (error) {
                        reject(new Error('DeepSeek结果解析失败：' + error.message));
                    }
                },
                onerror: function () { reject(new Error('DeepSeek网络请求失败')); },
                ontimeout: function () { reject(new Error('DeepSeek请求超时')); }
            });
        });
    }

    function stringArray(value) {
        return Array.isArray(value)
            ? value.map(function (item) {
                if (item && typeof item === 'object') {
                    return String(item.message || item.text || JSON.stringify(item)).trim();
                }
                return String(item || '').trim();
            }).filter(Boolean)
            : [];
    }


    /******************************************************************
     * DeepSeek药品说明书查询
     *
     * 说明：
     * 1. 查询结果是AI对药品说明书信息的结构化整理，不等于官方说明书原文。
     * 2. 只有剂量、单位、用法、频次均为单一明确值时，才允许一键引用。
     * 3. 按体重、按肾功能、需要滴定或存在剂量范围的方案，只显示提示，不自动引用。
     ******************************************************************/

    function deepSeekDrugGuideRequest(apiKey, model, patientText, queryText) {
        const prompt = [
            '你是中国大陆药品说明书信息结构化查询辅助工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '优先依据中国大陆已批准药品说明书的一般内容进行整理；不能确认具体厂家、剂型或规格差异时，必须明确写入verificationNote，不得编造。',
            '患者信息仅用于提示禁忌、慎用、剂量调整和监测，不得把缺失信息当成正常。',
            '除非用户明确询问超说明书用法，否则不要把超说明书用法作为可引用方案。',
            'route优先使用：po、舌下用药、鼻饲、领药、胃管注入、雾化、耗材、注射用药、局部用药、阴道用药、含化、敷伤口、直肠用药、吸入用药。',
            'frequency优先使用：tid、st、bid、q6h、q8h、qd、qid、qn、q12h、q2h、prn、qod、qw、biw、tiw、qow、2w、3w、4w、q72h、qh、q3h、q4h。',
            'standardRegimens可返回多个常见说明书方案，并写明适应证和人群。',
            'canQuote只有在药品名称、单次剂量、剂量单位、用法和频次均明确，而且不是剂量范围、按体重计算、按肾功能计算或需要滴定时才可为true。',
            'canQuote为true时，doseValue必须是大于0的单一数字，doseUnit、route、frequency必须明确。',
            'orderText必须使用“药品名称 剂量单位 用法 频次”的可解析格式，例如“阿司匹林肠溶片 100mg po qd”。',
            'JSON结构：',
            '{"drugName":"药品名称","genericName":"通用名","dosageForm":"剂型","commonIndications":[],"standardRegimens":[{"indication":"适应证","population":"成人","doseValue":100,"doseUnit":"mg","doseText":"100mg","route":"po","frequency":"qd","administration":"给药说明","courseText":"疗程","maxDose":"最大剂量","canQuote":true,"orderText":"阿司匹林肠溶片 100mg po qd","caution":"核对提示"}],"contraindications":[],"warnings":[],"renalHepaticAdjustments":[],"interactions":[],"monitoring":[],"missingInformation":[],"verificationNote":"需核对具体厂家说明书"}'
        ].join('\n');

        return new Promise(function (resolve, reject) {
            suiteGlobalAiXmlhttpRequest({
                method: 'POST',
                url: ENDPOINT,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + apiKey
                },
                data: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: prompt },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                drugQuery: String(queryText || '').trim(),
                                patientInformation: String(patientText || '').trim()
                            })
                        }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.05,
                    max_tokens: 5000,
                    stream: false
                }),
                timeout: 120000,
                onload: function (response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(
                            'DeepSeek说明书查询返回HTTP ' + response.status + '：' +
                            String(response.responseText || '').slice(0, 800)
                        ));
                        return;
                    }

                    try {
                        const outer = JSON.parse(response.responseText);
                        const content = outer && outer.choices && outer.choices[0] && outer.choices[0].message
                            ? outer.choices[0].message.content
                            : '';

                        if (!content) {
                            throw new Error('接口未返回有效内容');
                        }

                        resolve(extractJsonObject(content));
                    }
                    catch (error) {
                        reject(new Error('说明书查询结果解析失败：' + error.message));
                    }
                },
                onerror: function () {
                    reject(new Error('DeepSeek说明书查询网络请求失败'));
                },
                ontimeout: function () {
                    reject(new Error('DeepSeek说明书查询超时'));
                }
            });
        });
    }

    function buildGuideOrderText(drugName, regimen) {
        const name = String(drugName || '').trim();
        const doseValue = Number(regimen && regimen.doseValue);
        const doseUnit = String(regimen && regimen.doseUnit || '').trim();
        const route = normalizeRoute(regimen && regimen.route || '');
        const frequency = normalizeFrequency(regimen && regimen.frequency || '');

        if (!name || !Number.isFinite(doseValue) || doseValue <= 0 ||
            !doseUnit || !route || !frequency) {
            return '';
        }

        return [name, String(doseValue) + doseUnit, route, frequency].join(' ');
    }

    function applyDrugGuideResult(result) {
        const raw = result && typeof result === 'object' ? result : {};
        const drugName = String(raw.drugName || raw.genericName || '').trim();
        const regimens = Array.isArray(raw.standardRegimens)
            ? raw.standardRegimens
            : [];

        state.drugGuide = {
            drugName: drugName,
            genericName: String(raw.genericName || '').trim(),
            dosageForm: String(raw.dosageForm || '').trim(),
            commonIndications: stringArray(raw.commonIndications),
            standardRegimens: regimens.map(function (item) {
                const regimen = item && typeof item === 'object' ? item : {};
                const doseValue = Number(regimen.doseValue);
                const normalized = {
                    indication: String(regimen.indication || '').trim(),
                    population: String(regimen.population || '').trim(),
                    doseValue: Number.isFinite(doseValue) && doseValue > 0 ? doseValue : '',
                    doseUnit: String(regimen.doseUnit || '').trim(),
                    doseText: String(regimen.doseText || '').trim(),
                    route: normalizeRoute(regimen.route || ''),
                    frequency: normalizeFrequency(regimen.frequency || ''),
                    administration: String(regimen.administration || '').trim(),
                    courseText: String(regimen.courseText || '').trim(),
                    maxDose: String(regimen.maxDose || '').trim(),
                    caution: String(regimen.caution || '').trim(),
                    canQuote: regimen.canQuote === true,
                    orderText: String(regimen.orderText || '').trim()
                };

                const generatedOrderText = buildGuideOrderText(drugName, normalized);

                if (normalized.canQuote && generatedOrderText) {
                    /*
                     * 不直接采用模型自由生成的orderText，统一由结构化字段重建，
                     * 保证能被下方“开药文本框”的本地解析器识别。
                     */
                    normalized.orderText = generatedOrderText;
                }
                else {
                    normalized.canQuote = false;
                    normalized.orderText = '';
                }

                return normalized;
            }),
            contraindications: stringArray(raw.contraindications),
            warnings: stringArray(raw.warnings),
            renalHepaticAdjustments: stringArray(raw.renalHepaticAdjustments),
            interactions: stringArray(raw.interactions),
            monitoring: stringArray(raw.monitoring),
            missingInformation: stringArray(raw.missingInformation),
            verificationNote: String(raw.verificationNote || '').trim()
        };

        return state.drugGuide;
    }

    function appendOrderToMedicineText(textarea, orderText) {
        const value = String(orderText || '').trim();

        if (!value) {
            throw new Error('当前方案缺少可直接引用的标准剂量、用法或频次');
        }

        const oldValue = textarea.value || '';
        const start = Number.isInteger(textarea.selectionStart)
            ? textarea.selectionStart
            : oldValue.length;
        const end = Number.isInteger(textarea.selectionEnd)
            ? textarea.selectionEnd
            : oldValue.length;
        const before = oldValue.slice(0, start);
        const after = oldValue.slice(end);
        const prefix = before && !/\n$/.test(before) ? '\n' : '';
        const suffix = after && !/^\n/.test(after) ? '\n' : '';
        const nextValue = before + prefix + value + suffix + after;

        textarea.value = nextValue;
        textarea.dispatchEvent(new textarea.ownerDocument.defaultView.Event('input', {
            bubbles: true
        }));
        textarea.focus();

        const cursor = (before + prefix + value).length;

        try {
            textarea.setSelectionRange(cursor, cursor);
        }
        catch (error) {
            // 旧浏览器不支持时忽略。
        }

        GM_setValue(KEYS.medicineDraft, nextValue);
    }

    function renderDrugGuide(modal) {
        const resultBox = modal.querySelector('.drug-guide-result');

        if (!resultBox) {
            return;
        }

        const guide = state.drugGuide;

        if (!guide) {
            resultBox.style.display = 'none';
            resultBox.innerHTML = '';
            return;
        }

        const sections = [];
        const title = [guide.drugName, guide.dosageForm].filter(Boolean).join('　');

        sections.push(
            '<div class="drug-guide-main"><strong>' +
            escapeHtml(title || '药品说明书查询结果') +
            '</strong>' +
            (guide.genericName && guide.genericName !== guide.drugName
                ? '<div>通用名：' + escapeHtml(guide.genericName) + '</div>'
                : '') +
            (guide.commonIndications.length
                ? '<div>常见说明书适应证：' + escapeHtml(guide.commonIndications.join('；')) + '</div>'
                : '') +
            '</div>'
        );

        if (guide.standardRegimens.length) {
            sections.push('<div class="drug-guide-regimen-title">说明书常见剂量方案</div>');

            guide.standardRegimens.forEach(function (regimen, index) {
                const doseDisplay = regimen.doseText || [
                    regimen.doseValue,
                    regimen.doseUnit
                ].filter(function (value) {
                    return value !== '' && value !== undefined && value !== null;
                }).join('');
                const core = [doseDisplay, regimen.route, regimen.frequency]
                    .filter(Boolean)
                    .join('　');

                sections.push(
                    '<div class="drug-guide-regimen">' +
                    '<div><strong>方案' + (index + 1) + '：</strong>' +
                    escapeHtml(regimen.indication || '未注明适应证') +
                    (regimen.population ? '（' + escapeHtml(regimen.population) + '）' : '') +
                    '</div>' +
                    '<div><strong>剂量用法：</strong>' + escapeHtml(core || '需人工核对') + '</div>' +
                    (regimen.administration
                        ? '<div><strong>给药说明：</strong>' + escapeHtml(regimen.administration) + '</div>'
                        : '') +
                    (regimen.courseText
                        ? '<div><strong>疗程：</strong>' + escapeHtml(regimen.courseText) + '</div>'
                        : '') +
                    (regimen.maxDose
                        ? '<div><strong>最大剂量：</strong>' + escapeHtml(regimen.maxDose) + '</div>'
                        : '') +
                    (regimen.caution
                        ? '<div class="drug-guide-caution"><strong>核对：</strong>' + escapeHtml(regimen.caution) + '</div>'
                        : '') +
                    '<button type="button" class="drug-guide-use" data-index="' + index + '"' +
                    (regimen.canQuote && regimen.orderText ? '' : ' disabled') +
                    '>' +
                    (regimen.canQuote && regimen.orderText
                        ? '引用到下方开药文本框'
                        : '该方案需人工确定剂量') +
                    '</button>' +
                    '</div>'
                );
            });
        }
        else {
            sections.push('<div class="drug-guide-empty">未返回可识别的标准剂量方案。</div>');
        }

        [
            ['禁忌证', guide.contraindications],
            ['重要警示', guide.warnings],
            ['肝肾功能调整', guide.renalHepaticAdjustments],
            ['相互作用', guide.interactions],
            ['监测项目', guide.monitoring],
            ['尚缺信息', guide.missingInformation]
        ].forEach(function (section) {
            if (!section[1].length) {
                return;
            }

            sections.push(
                '<div class="drug-guide-section"><strong>' +
                escapeHtml(section[0]) + '：</strong><ul>' +
                section[1].map(function (item) {
                    return '<li>' + escapeHtml(item) + '</li>';
                }).join('') +
                '</ul></div>'
            );
        });

        sections.push(
            '<div class="drug-guide-verification"><strong>核对提示：</strong>' +
            escapeHtml(
                guide.verificationNote ||
                'AI整理结果不能替代具体厂家、剂型和规格对应的正式药品说明书，请在开立前再次核对。'
            ) +
            '</div>'
        );

        resultBox.innerHTML = sections.join('');
        resultBox.style.display = 'block';
    }


    /******************************************************************
     * DeepSeek临床指南查询与诊疗建议
     *
     * 说明：
     * 1. DeepSeek接口本身不是实时联网指南数据库，结果属于知识整理与临床决策辅助。
     * 2. 诊疗建议必须结合患者年龄、合并症、过敏史、肝肾功能、检查结果和院内规范复核。
     * 3. 查询结果不会直接自动开药，也不会替代医师诊断、会诊或药师审方。
     ******************************************************************/

    function deepSeekClinicalGuidelineRequest(apiKey, model, patientText, diagnosisText) {
        const prompt = [
            '你是中国医院临床诊疗指南与临床路径辅助整理工具。',
            '必须只输出JSON对象，不得输出Markdown、前言或结尾。',
            '根据用户提供的诊断或拟诊断，并结合患者基本信息，给出结构化诊断评估与诊疗建议。',
            '优先参考中国大陆国家卫生健康行政部门、中华医学会及国家级专业学会发布的指南、共识或临床路径；必要时可补充国际权威指南的一般原则。',
            '你不是实时联网检索工具，不得声称已经在线检索最新指南。不能确认指南名称、发布机构或年份时，不得编造，应在sourceNotes中写明“需人工核对最新正式指南”。',
            '必须区分“已明确诊断”“待查/疑似诊断”和“鉴别诊断”，不得把待查诊断写成已经确诊。',
            '未提供的生命体征、严重程度、过敏史、妊娠、体重、肝肾功能、实验室和影像结果必须列入missingInformation，不得假定正常。',
            '诊疗建议应包括：诊断依据与需要补充的信息、鉴别诊断、推荐检查、严重程度与风险分层、治疗目标、一般治疗、药物治疗原则、康复或操作治疗、监测随访、会诊/转诊/住院指征、禁忌与风险提示。',
            'medicationRecommendations只给出指南层面的药物类别、适用条件、常用原则和需要核对的要点；患者信息不足时不得生成确定性个体化处方。',
            '对急危重症或存在红旗征象的情况，必须在redFlags中明确提示立即评估、急诊处置或上级医院转诊。',
            'confidence为0到1之间的小数。',
            'JSON结构：',
            '{"diagnosis":"用户输入诊断","diagnosticStatus":"已确诊/待查/疑似/信息不足","summary":"总体建议","guidelineBasis":[],"diagnosticCriteria":[],"differentialDiagnosis":[],"recommendedTests":[],"severityRiskAssessment":[],"treatmentGoals":[],"generalTreatment":[],"medicationRecommendations":[],"proceduresRehabilitation":[],"monitoringFollowUp":[],"consultationReferral":[],"redFlags":[],"contraindicationsCautions":[],"missingInformation":[],"sourceNotes":[],"confidence":0.8}'
        ].join('\n');

        return new Promise(function (resolve, reject) {
            suiteGlobalAiXmlhttpRequest({
                method: 'POST',
                url: ENDPOINT,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + apiKey
                },
                data: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: prompt },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                diagnosisOrClinicalQuestion: String(diagnosisText || '').trim(),
                                patientInformation: String(patientText || '').trim()
                            })
                        }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.08,
                    max_tokens: 7000,
                    stream: false
                }),
                timeout: 120000,
                onload: function (response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(
                            'DeepSeek临床指南查询返回HTTP ' + response.status + '：' +
                            String(response.responseText || '').slice(0, 800)
                        ));
                        return;
                    }

                    try {
                        const outer = JSON.parse(response.responseText);
                        const content = outer && outer.choices && outer.choices[0] && outer.choices[0].message
                            ? outer.choices[0].message.content
                            : '';

                        if (!content) {
                            throw new Error('接口未返回有效内容');
                        }

                        resolve(extractJsonObject(content));
                    }
                    catch (error) {
                        reject(new Error('临床指南查询结果解析失败：' + error.message));
                    }
                },
                onerror: function () {
                    reject(new Error('DeepSeek临床指南查询网络请求失败'));
                },
                ontimeout: function () {
                    reject(new Error('DeepSeek临床指南查询超时'));
                }
            });
        });
    }

    function applyClinicalGuidelineResult(result, diagnosisText) {
        const raw = result && typeof result === 'object' ? result : {};
        const statusOptions = ['已确诊', '待查', '疑似', '信息不足'];
        const diagnosticStatus = statusOptions.includes(String(raw.diagnosticStatus || '').trim())
            ? String(raw.diagnosticStatus).trim()
            : '信息不足';

        state.clinicalGuideline = {
            diagnosis: String(raw.diagnosis || diagnosisText || '').trim(),
            diagnosticStatus: diagnosticStatus,
            summary: String(raw.summary || '').trim(),
            guidelineBasis: stringArray(raw.guidelineBasis),
            diagnosticCriteria: stringArray(raw.diagnosticCriteria),
            differentialDiagnosis: stringArray(raw.differentialDiagnosis),
            recommendedTests: stringArray(raw.recommendedTests),
            severityRiskAssessment: stringArray(raw.severityRiskAssessment),
            treatmentGoals: stringArray(raw.treatmentGoals),
            generalTreatment: stringArray(raw.generalTreatment),
            medicationRecommendations: stringArray(raw.medicationRecommendations),
            proceduresRehabilitation: stringArray(raw.proceduresRehabilitation),
            monitoringFollowUp: stringArray(raw.monitoringFollowUp),
            consultationReferral: stringArray(raw.consultationReferral),
            redFlags: stringArray(raw.redFlags),
            contraindicationsCautions: stringArray(raw.contraindicationsCautions),
            missingInformation: stringArray(raw.missingInformation),
            sourceNotes: stringArray(raw.sourceNotes),
            confidence: Math.max(0, Math.min(1, Number(raw.confidence || 0)))
        };

        return state.clinicalGuideline;
    }

    function renderClinicalGuideline(modal) {
        const resultBox = modal.querySelector('.drug-clinical-result');

        if (!resultBox) {
            return;
        }

        const result = state.clinicalGuideline;

        if (!result) {
            resultBox.style.display = 'none';
            resultBox.innerHTML = '';
            return;
        }

        const html = [];

        html.push(
            '<div class="drug-clinical-main">' +
            '<div><strong>诊断/临床问题：</strong>' + escapeHtml(result.diagnosis || '未提供') + '</div>' +
            '<div><strong>诊断状态：</strong>' + escapeHtml(result.diagnosticStatus) +
            '　<strong>置信度：</strong>' + Math.round(Number(result.confidence || 0) * 100) + '%</div>' +
            (result.summary
                ? '<div><strong>总体建议：</strong>' + escapeHtml(result.summary) + '</div>'
                : '') +
            '</div>'
        );

        const sections = [
            ['指南或路径依据', result.guidelineBasis],
            ['诊断依据/标准', result.diagnosticCriteria],
            ['鉴别诊断', result.differentialDiagnosis],
            ['建议完善的检查', result.recommendedTests],
            ['严重程度与风险分层', result.severityRiskAssessment],
            ['治疗目标', result.treatmentGoals],
            ['一般及非药物治疗', result.generalTreatment],
            ['药物治疗原则与建议', result.medicationRecommendations],
            ['操作、康复及其他治疗', result.proceduresRehabilitation],
            ['监测与随访', result.monitoringFollowUp],
            ['会诊、转诊或住院建议', result.consultationReferral],
            ['禁忌与慎用提示', result.contraindicationsCautions],
            ['尚缺患者信息', result.missingInformation],
            ['来源与时效核对', result.sourceNotes]
        ];

        sections.forEach(function (section) {
            if (!section[1] || !section[1].length) {
                return;
            }

            html.push(
                '<div class="drug-clinical-section"><strong>' + escapeHtml(section[0]) + '：</strong><ul>' +
                section[1].map(function (item) {
                    return '<li>' + escapeHtml(item) + '</li>';
                }).join('') +
                '</ul></div>'
            );
        });

        if (result.redFlags.length) {
            html.push(
                '<div class="drug-clinical-red"><strong>红旗征象/紧急处置：</strong><ul>' +
                result.redFlags.map(function (item) {
                    return '<li>' + escapeHtml(item) + '</li>';
                }).join('') +
                '</ul></div>'
            );
        }

        html.push(
            '<div class="drug-clinical-verification"><strong>使用提示：</strong>' +
            '该结果由DeepSeek根据既有知识整理，并非实时联网检索；应核对最新正式指南、患者实际检查结果及本院制度后再作临床决策。' +
            '</div>'
        );

        resultBox.innerHTML = html.join('');
        resultBox.style.display = 'block';
    }

    function applyAiResult(result, hadMedicineText) {
        state.items = (Array.isArray(result.items) ? result.items : [])
            .map(function (raw) {
                const suggested = raw.sourceType === 'suggested' || !hadMedicineText;
                const dose = Number(raw.doseValue);
                const days = Number(raw.days);
                return {
                    enabled: suggested ? false : raw.enabled !== false,
                    sourceName: String(raw.sourceName || raw.standardName || '').trim(),
                    standardName: String(raw.standardName || raw.sourceName || '').trim(),
                    specificationHint: String(raw.specificationHint || '').trim(),
                    orderType: normalizeOrderType(raw.orderType),
                    groupNo: String(raw.groupNo || '').trim(),
                    doseValue: Number.isFinite(dose) && dose > 0 ? dose : '',
                    doseUnit: String(raw.doseUnit || '').trim(),
                    route: normalizeRoute(raw.route || ''),
                    frequency: normalizeFrequency(raw.frequency || ''),
                    days: Number.isFinite(days) && days > 0 ? days : '',
                    indication: String(raw.indication || '').trim(),
                    rationale: String(raw.rationale || '').trim(),
                    warnings: stringArray(raw.warnings),
                    confidence: Math.max(0, Math.min(1, Number(raw.confidence || 0))),
                    sourceType: suggested ? 'suggested' : 'parsed',
                    status: suggested ? 'AI候选，未勾选' : 'AI已解析'
                };
            })
            .filter(function (item) { return item.standardName || item.sourceName; });

        const a = result.assessment && typeof result.assessment === 'object' ? result.assessment : {};
        state.assessment = {
            riskLevel: ['low', 'medium', 'high', 'critical'].includes(String(a.riskLevel || '')) ? String(a.riskLevel) : 'medium',
            summary: String(a.summary || '').trim(),
            appropriateness: String(a.appropriateness || '').trim(),
            interactions: stringArray(a.interactions),
            contraindications: stringArray(a.contraindications),
            doseRouteFrequencyIssues: stringArray(a.doseRouteFrequencyIssues),
            renalHepaticConsiderations: stringArray(a.renalHepaticConsiderations),
            ageSpecificConsiderations: stringArray(a.ageSpecificConsiderations),
            antimicrobialStewardship: stringArray(a.antimicrobialStewardship),
            monitoring: stringArray(a.monitoring),
            missingInformation: stringArray(a.missingInformation),
            alternativeSuggestions: stringArray(a.alternativeSuggestions),
            nonDrugSuggestions: stringArray(a.nonDrugSuggestions)
        };
    }

    async function activateMedicationTab() {
        const candidates = [];

        allDocuments().forEach(function (doc) {
            /*
             * 这里只检索真正可点击的页签元素，不再检索span/div。
             * v1.1会把脚本自身悬浮框标题“药品录入”误当成系统页签，
             * 导致页面仍停留在“出院带药”。
             */
            Array.from(doc.querySelectorAll('a,li,button,[role="tab"]'))
                .filter(isVisible)
                .filter(function (element) {
                    return !element.closest('#' + IDS.panel) &&
                        !element.closest('#' + IDS.modal) &&
                        normalize(element.innerText || element.textContent) === normalize('药品录入');
                })
                .forEach(function (element) {
                    const rect = element.getBoundingClientRect();
                    const ownClass = String(element.className || '').toLowerCase();
                    const parentClass = String(element.parentElement ? element.parentElement.className : '').toLowerCase();
                    const active = /active|selected|current/.test(ownClass + ' ' + parentClass);
                    const tagBonus = /^(A|LI|BUTTON)$/.test(element.tagName) ? -800 : 0;
                    const roleBonus = element.getAttribute('role') === 'tab' ? -1200 : 0;

                    candidates.push({
                        doc: doc,
                        element: element,
                        score: rect.top + rect.left / 20 + tagBonus + roleBonus - (active ? 5000 : 0)
                    });
                });
        });

        if (!candidates.length) {
            throw new Error('未找到医院系统中的“药品录入”标签页');
        }

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        const selected = candidates[0];
        const tab = selected.element;
        const current = String(tab.className || '') + ' ' +
            String(tab.parentElement ? tab.parentElement.className : '');

        if (!/active|selected|current/i.test(current)) {
            realClick(tab);
        }

        /*
         * 点击后必须等待真正的药品录入表格出现。
         * 该表格应同时含有组号、频次以及名称/药名列；否则禁止继续写入，
         * 避免在“出院带药”等结构不同的页面中按错误列号填写。
         */
        const deadline = Date.now() + 6000;

        while (Date.now() < deadline) {
            await sleep(180);

            const context = tableContext();
            const tableText = normalize(context && context.root
                ? context.root.innerText || context.root.textContent
                : '');
            const hasDrugName = tableText.includes(normalize('名称')) ||
                tableText.includes(normalize('药名'));

            if (context &&
                hasDrugName &&
                tableText.includes(normalize('组号')) &&
                tableText.includes(normalize('频次'))) {
                return;
            }
        }

        throw new Error(
            '已尝试切换到“药品录入”，但未识别到含“组号、药名、频次”的药品录入表格。' +
            '为防止把药名写入开始时间，脚本已停止，请确认当前页面标签。'
        );
    }

    function actualTable(root) {
        if (!root) return null;
        if (root.tagName === 'TABLE') return root;
        const tables = Array.from(root.querySelectorAll('table')).filter(isVisible);
        tables.sort(function (a, b) { return b.querySelectorAll('td').length - a.querySelectorAll('td').length; });
        return tables[0] || root;
    }

    function tableRows(table) {
        const selector = 'tbody tr,.layui-table-body tr,.datagrid-body .datagrid-row,.datagrid-row,[role="row"]';
        const seen = new Set();
        return Array.from(table.querySelectorAll(selector))
            .filter(isVisible)
            .filter(function (row) {
                if (seen.has(row) || row.closest('#' + IDS.modal) || row.querySelector('th')) return false;
                seen.add(row);
                const cells = Array.from(row.querySelectorAll('td,[role="gridcell"]')).filter(isVisible);
                return cells.length >= 12 && !/暂无数据|无数据|没有数据/.test(normalize(row.innerText || row.textContent));
            })
            .sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
    }

    function headerCenters(table) {
        const centers = {};
        const headers = Array.from(
            table.querySelectorAll('thead th,th,[role="columnheader"]')
        ).filter(isVisible);

        Object.keys(COLUMNS).forEach(function (label) {
            const aliases = COLUMN_HEADER_ALIASES[label] || [label];
            const normalizedAliases = aliases.map(normalize);
            const exact = [];
            const partial = [];

            headers.forEach(function (header) {
                const text = normalize(header.innerText || header.textContent);

                if (!text) return;

                if (normalizedAliases.includes(text)) {
                    exact.push(header);
                    return;
                }

                if (normalizedAliases.some(function (alias) {
                    return text.includes(alias) || alias.includes(text);
                })) {
                    partial.push(header);
                }
            });

            const candidates = exact.length ? exact : partial;

            if (!candidates.length) return;

            /*
             * 多级表头中优先选择面积较小的叶子表头，避免选到“基本信息”等跨列父表头。
             */
            candidates.sort(function (a, b) {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();

                return rectA.width * rectA.height - rectB.width * rectB.height;
            });

            const rect = candidates[0].getBoundingClientRect();
            centers[label] = rect.left + rect.width / 2;
        });

        return centers;
    }

    function tableContext() {
        const candidates = [];
        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll('table,.layui-table-view,.datagrid,[role="grid"]'))
                .filter(isVisible)
                .filter(function (root) { return !root.closest('#' + IDS.modal); })
                .forEach(function (root) {
                    const text = normalize(root.innerText || root.textContent);
                    const keywordGroups = [
                        ['名称', '药名'],
                        ['开始时间'],
                        ['规格'],
                        ['剂量'],
                        ['单位'],
                        ['用法'],
                        ['频次'],
                        ['操作']
                    ];
                    const hits = keywordGroups.filter(function (group) {
                        return group.some(function (word) {
                            return text.includes(normalize(word));
                        });
                    }).length;
                    if (hits < 6) return;
                    const table = actualTable(root);
                    const rows = tableRows(table);
                    candidates.push({
                        doc: doc,
                        root: root,
                        table: table,
                        rows: rows,
                        headerCenters: headerCenters(table),
                        score: hits * 5000 + rows.length * 600 + (text.includes(normalize('药房单位')) ? 3000 : 0)
                    });
                });
        });
        candidates.sort(function (a, b) { return b.score - a.score; });
        return candidates[0] || null;
    }

    function rowCells(row) {
        return Array.from(row.querySelectorAll('td,[role="gridcell"]'))
            .filter(isVisible)
            .sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
    }

    function cellByColumn(context, row, label) {
        const cells = rowCells(row);
        const center = context.headerCenters[label];

        if (Number.isFinite(center)) {
            const covering = cells.filter(function (cell) {
                const rect = cell.getBoundingClientRect();
                return center >= rect.left - 2 && center <= rect.right + 2;
            });

            if (covering.length) {
                covering.sort(function (a, b) {
                    return a.getBoundingClientRect().width - b.getBoundingClientRect().width;
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

            if (nearest[0]) return nearest[0].cell;
        }

        /*
         * 固定索引只作为“药品录入”标准表格的最后兜底。
         * 名称列如果没有识别到表头坐标，则先检查当前表格是否含组号；
         * 没有组号通常说明仍在“出院带药”，此时禁止使用索引3，避免写进开始时间。
         */
        if (label === '名称') {
            const tableText = normalize(context && context.root
                ? context.root.innerText || context.root.textContent
                : '');

            if (!tableText.includes(normalize('组号'))) {
                return null;
            }
        }

        return cells[COLUMNS[label]] || null;
    }

    function visibleInput(cell) {
        if (!cell) return null;
        return Array.from(cell.querySelectorAll('input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),[contenteditable="true"]'))
            .filter(isVisible)[0] || null;
    }

    function nativeSelect(cell) {
        return cell ? Array.from(cell.querySelectorAll('select:not([disabled])'))[0] || null : null;
    }

    /*
     * 等待药品录入表格。
     *
     * requireRows=false时，只要求识别到表头和表格外壳，允许当前一条医嘱行都没有。
     * 这用于首次打开药品录入页时自动点击页面下方“新医嘱”创建第一行。
     */
    async function waitContext(timeout, requireRows) {
        const deadline = Date.now() + (timeout || 7000);
        const mustHaveRows = requireRows !== false;

        while (Date.now() < deadline) {
            const context = tableContext();

            if (context && (!mustHaveRows || context.rows.length)) {
                return context;
            }

            await sleep(180);
        }

        throw new Error(
            mustHaveRows
                ? '未识别到药品录入表格或可填写医嘱行'
                : '未识别到药品录入表格'
        );
    }

    /*
     * 清理按钮文字中的图标字体、emoji、重复空白和常见装饰字符。
     * 医院页面中的“新医嘱”按钮前方通常带有图标字体，innerText/textContent
     * 还可能因框架渲染被读取成“新医嘱新医嘱”，因此不能再做全文精确相等判断。
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
     * 最多向上检查7层；若框架把事件委托给普通div，也可通过cursor:pointer、
     * onclick、role、tabindex或按钮类名识别。实在找不到时返回最小文字元素，
     * 利用事件冒泡触发其父级委托事件。
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
                const ownText = buttonText(current);

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

                if (isNewOrderLabel(buttonText(element))) {
                    add(element);
                }
            });

        /*
         * 再扫描文本节点，可识别“图标span + 文字span + 外层div”结构。
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
     * 查找页面底部“新医嘱”按钮。
     *
     * 兼容情况：
     * 1. 按钮前有图标字体；
     * 2. innerText/textContent重复为“新医嘱新医嘱”；
     * 3. 文字位于span，点击事件绑定在外层div/a；
     * 4. EasyUI、Layui、Element等框架按钮；
     * 5. 普通div通过事件委托响应点击。
     */
    function findNewOrderButton(context) {
        const candidates = [];
        const seen = new Set();
        const preferredDoc = context ? context.doc : null;
        const rootRect = context && context.root && isVisible(context.root)
            ? context.root.getBoundingClientRect()
            : null;

        allDocuments().forEach(function (doc) {
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
                const label = normalizeActionLabel(buttonText(clickable));
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

                const nearbyText = plain(
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
            console.info('[药品自动录入] 新医嘱按钮候选：', candidates.slice(0, 5).map(function (item) {
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
     * 当前药品录入表格没有任何医嘱行时，自动点击页面下方“新医嘱”。
     * 点击后必须实际检测到行数增加才继续，防止误点或页面尚未完成初始化。
     */
    async function createFirstOrderRow(context) {
        const beforeCount = context && context.rows
            ? context.rows.length
            : 0;
        const found = findNewOrderButton(context);

        if (!found) {
            throw new Error(
                '当前没有可填写的医嘱行，且未找到页面下方“新医嘱”按钮。' +
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

            const refreshed = tableContext();

            if (refreshed && refreshed.rows.length > beforeCount) {
                showStatus('未发现可填写医嘱行，已自动点击“新医嘱”创建首行。', 'success');
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

            const refreshed = tableContext();

            if (refreshed && refreshed.rows.length > beforeCount) {
                showStatus('已通过“新医嘱”创建首行。', 'success');
                return refreshed;
            }
        }

        throw new Error(
            '已点击页面下方“新医嘱”，但没有检测到新的医嘱行。' +
            '请检查页面是否弹出提示或是否需要先选择药房。'
        );
    }

    function operationButton(cell) {
        if (!cell) return null;
        const candidates = Array.from(cell.querySelectorAll('button,a,[role="button"],i,span,div'))
            .filter(isVisible)
            .filter(function (element) {
                const text = [
                    element.innerText || '',
                    element.textContent || '',
                    element.getAttribute('title') || '',
                    element.getAttribute('aria-label') || '',
                    element.className || ''
                ].join(' ');
                return /(?:^\+$|增加|新增|添加|add|plus|icon-plus|fa-plus|layui-icon-add)/i.test(text.trim());
            });
        return candidates[0] ? candidates[0].closest('button,a,[role="button"]') || candidates[0] : null;
    }

    async function ensureRows(count) {
        /*
         * 先允许只识别表格外壳。若当前为0行，自动点击底部“新医嘱”创建首行；
         * 后续第2行及以上仍使用每行右侧“＋”按钮增加。
         */
        let context = await waitContext(7000, false);

        if (!context.rows.length && count > 0) {
            await checkpoint();
            context = await createFirstOrderRow(context);
        }

        while (context.rows.length < count) {
            await checkpoint();

            const row = context.rows[context.rows.length - 1];

            if (!row) {
                context = await createFirstOrderRow(context);
                continue;
            }

            let plus = operationButton(cellByColumn(context, row, '操作'));

            if (!plus) {
                const all = Array.from(context.root.querySelectorAll('button,a,[role="button"],i,span'))
                    .filter(isVisible)
                    .filter(function (element) {
                        return /(?:^\+$|增加|新增|添加|add|plus|icon-plus|fa-plus|layui-icon-add)/i.test([
                            element.innerText || '', element.textContent || '', element.className || ''
                        ].join(' ').trim());
                    });

                plus = all[all.length - 1] || null;
            }

            if (!plus) {
                throw new Error('未找到右侧“＋”新增行按钮');
            }

            const before = context.rows.length;

            realClick(plus);

            const deadline = Date.now() + 4000;
            let increased = false;

            while (Date.now() < deadline) {
                await sleep(150);
                context = tableContext();

                if (context && context.rows.length > before) {
                    increased = true;
                    break;
                }
            }

            if (!increased) {
                throw new Error('点击“＋”后表格行数没有增加');
            }
        }

        return context;
    }

    function candidateTexts(element) {
        const cells = Array.from(element.querySelectorAll('td,[role="gridcell"]')).filter(isVisible);
        return cells.length
            ? cells.map(function (cell) { return plain(cell.innerText || cell.textContent); }).filter(Boolean)
            : [plain(element.innerText || element.textContent)];
    }

    function lookupCandidates(doc, input, mainTable) {
        const selector = 'tr,[role="row"],.datagrid-row,.layui-table-body tr,.dropdown-menu li,.autocomplete-suggestion,.ui-menu-item,.select2-results__option,[role="option"]';
        const inputRect = input.getBoundingClientRect();
        const seen = new Set();
        const result = [];
        Array.from(doc.querySelectorAll(selector)).filter(isVisible).forEach(function (element) {
            if (seen.has(element) || element.closest('#' + IDS.modal) || (mainTable && mainTable.contains(element))) return;
            seen.add(element);
            const texts = candidateTexts(element);
            const fullText = normalize(texts.join(' '));
            if (!fullText || fullText.length > 700 || /代码名称规格单位单价|国家医保代码备注/.test(fullText)) return;
            const rect = element.getBoundingClientRect();
            const vertical = Math.min(Math.abs(rect.top - inputRect.bottom), Math.abs(rect.bottom - inputRect.top));
            const horizontal = Math.abs(rect.left - inputRect.left);
            if (vertical > 800 || horizontal > 1200) return;
            result.push({ element: element, texts: texts, fullText: fullText, rect: rect });
        });
        return result;
    }

    function candidateScore(candidate, input, item, term) {
        const target = normalize(term);
        const expected = normalize(item.standardName || item.sourceName);
        const spec = normalize(item.specificationHint || '');
        const inputRect = input.getBoundingClientRect();
        let score = Math.abs(candidate.rect.top - inputRect.bottom) + Math.abs(candidate.rect.left - inputRect.left) / 3;
        candidate.texts.forEach(function (text, index) {
            const value = normalize(text);
            if (value === target || value === expected) score -= index <= 2 ? 7000 : 4500;
            else if (value.startsWith(target) || target.startsWith(value)) score -= 3200;
            else if (value.includes(target)) score -= 1900;
        });
        if (candidate.fullText.includes(expected)) score -= 1600;
        if (spec && candidate.fullText.includes(spec)) score -= 2200;
        return score;
    }

    function cellText(context, row, label) {
        const cell = cellByColumn(context, row, label);
        return plain(cell ? cell.innerText || cell.textContent : '');
    }

    function rowSignature(context, row) {
        const hidden = Array.from(row.querySelectorAll('input[type="hidden"],input[data-id],input[data-code],input[readonly]'))
            .map(function (input) {
                return [input.value || '', input.getAttribute('data-id') || '', input.getAttribute('data-code') || ''].join(':');
            }).join('|');
        return cellText(context, row, '名称') + '||' + cellText(context, row, '规格') + '||' + hidden;
    }

    function createMedicationLookupNotFoundError(item) {
        const error = new Error(
            '医院药品字典未找到匹配项：' +
            (item.standardName || item.sourceName)
        );

        error.name = 'MedicationLookupNotFoundError';
        error.code = 'MEDICATION_LOOKUP_NOT_FOUND';
        error.skippable = true;

        return error;
    }

    function isMedicationLookupNotFoundError(error) {
        return Boolean(
            error &&
            (
                error.code === 'MEDICATION_LOOKUP_NOT_FOUND' ||
                error.name === 'MedicationLookupNotFoundError'
            )
        );
    }

    /*
     * 药品字典检索失败后，只清理由本次检索写入的临时内容。
     * 下一条药继续复用当前医院医嘱行，避免中间留下空白行。
     * 这里只处理“明确未找到药品”这一种可跳过错误；单位、用法、频次、
     * 自付比例等字段失败仍继续按原安全策略中止整个任务。
     */
    async function clearMedicationRowAfterLookupMiss(rowIndex) {
        const context = tableContext();

        if (
            !context ||
            !context.rows ||
            !context.rows[rowIndex]
        ) {
            return;
        }

        const row = context.rows[rowIndex];

        ['名称', '组号'].forEach(function (label) {
            const cell = cellByColumn(context, row, label);
            const input = visibleInput(cell);

            if (!input) {
                return;
            }

            try {
                pressKey(input, 'Escape', 27);
            }
            catch (error) {
                // 候选框已关闭时无需处理。
            }

            setInput(
                context.doc,
                input,
                '',
                false,
                false
            );
        });

        try {
            const active = context.doc.activeElement;

            if (active && typeof active.blur === 'function') {
                active.blur();
            }
        }
        catch (error) {
            // 旧浏览器焦点清理失败不影响后续重试。
        }

        await sleep(120);
    }

    async function selectMedication(rowIndex, item) {
        const terms = [];
        [item.standardName, item.sourceName].forEach(function (value) {
            const text = String(value || '').trim();
            if (text && !terms.some(function (old) { return normalize(old) === normalize(text); })) terms.push(text);
        });
        if (!terms.length) throw new Error('药品名称为空');

        for (const term of terms) {
            await checkpoint();
            let context = await ensureRows(rowIndex + 1);
            let row = context.rows[rowIndex];
            const before = rowSignature(context, row);
            const input = visibleInput(cellByColumn(context, row, '名称'));
            if (!input) throw new Error('第' + (rowIndex + 1) + '行未找到“名称/药名”输入框；脚本已停止，未写入开始时间');
            input.scrollIntoView({ block: 'center', behavior: 'auto' });
            realClick(input);
            setInput(context.doc, input, term, true, false);
            await sleep(800);
            let candidates = lookupCandidates(context.doc, input, context.table);
            if (!candidates.length) {
                await sleep(500);
                candidates = lookupCandidates(context.doc, input, context.table);
            }
            if (candidates.length) {
                const ranked = candidates.map(function (candidate) {
                    return { candidate: candidate, score: candidateScore(candidate, input, item, term) };
                }).sort(function (a, b) { return a.score - b.score; });
                const best = ranked[0];
                if (best && best.score < 2200) {
                    const cells = Array.from(best.candidate.element.querySelectorAll('td,[role="gridcell"]')).filter(isVisible);
                    const target = cells.find(function (cell) {
                        const value = normalize(cell.innerText || cell.textContent);
                        return value === normalize(term) || value === normalize(item.standardName) || value.includes(normalize(term));
                    }) || cells[1] || cells[0] || best.candidate.element;
                    realClick(target);
                    await sleep(350);
                    context = tableContext() || context;
                    row = context.rows[rowIndex] || row;
                    let committed = cellText(context, row, '规格') || rowSignature(context, row) !== before;
                    if (!committed) {
                        realDoubleClick(target);
                        await sleep(380);
                        context = tableContext() || context;
                        row = context.rows[rowIndex] || row;
                        committed = cellText(context, row, '规格') || rowSignature(context, row) !== before;
                    }
                    input.blur();
                    pressKey(input, 'Escape', 27);
                    if (committed) {
                        return { selectedName: best.candidate.texts[1] || best.candidate.texts[0] || term };
                    }
                }
            }
            input.focus();
            pressKey(input, 'ArrowDown', 40);
            pressKey(input, 'Enter', 13);
            await sleep(400);
            context = tableContext() || context;
            row = context.rows[rowIndex] || row;
            if (cellText(context, row, '规格') || rowSignature(context, row) !== before) {
                input.blur();
                return { selectedName: inputValue(input) || term };
            }
        }
        throw createMedicationLookupNotFoundError(item);
    }

    function selectVisual(select) {
        if (!select) return null;
        const selector = '.layui-form-select,.select2-container,.el-select,.ant-select,.ivu-select,.combo,.textbox.combo,[role="combobox"]';
        const near = [select.nextElementSibling, select.previousElementSibling].filter(Boolean);
        for (const element of near) {
            if (element.matches && element.matches(selector)) return element;
        }
        return select.parentElement ? select.parentElement.querySelector(selector) || select : select;
    }

    function findOption(select, text) {
        const target = normalize(text);
        const options = Array.from(select.options || []);
        return options.find(function (option) { return normalize(option.textContent) === target; }) ||
            options.find(function (option) {
                const value = normalize(option.textContent);
                return value.endsWith(target) || target.endsWith(value);
            }) || null;
    }

    function triggerSelect(doc, select, option) {
        const win = doc.defaultView;
        select.value = option.value;
        Array.from(select.options || []).forEach(function (item) { item.selected = item === option; });
        if (win.jQuery) win.jQuery(select).val(option.value).trigger('input').trigger('change');
        select.dispatchEvent(new win.Event('input', { bubbles: true }));
        select.dispatchEvent(new win.Event('change', { bubbles: true }));
        try {
            if (win.layui && win.layui.form && typeof win.layui.form.render === 'function') win.layui.form.render('select');
        } catch (error) {
            console.warn('[药品自动录入] 下拉框重绘失败', error);
        }
    }

    async function chooseVisual(doc, visual, text) {
        if (!visual) return false;
        const clickTarget = visual.querySelector('.layui-select-title input,.layui-select-title,.select2-selection,.el-input,.ant-select-selector,.ivu-select-selection,[role="combobox"]') || visual;
        realClick(clickTarget);
        await sleep(180);
        const target = normalize(text);
        const options = Array.from(doc.querySelectorAll('.layui-form-select dl dd,.select2-results__option,.dropdown-menu li,[role="option"],.el-select-dropdown__item,.ant-select-item-option,.ivu-select-item'))
            .filter(isVisible)
            .filter(function (element) { return normalize(element.innerText || element.textContent) === target; });
        if (!options.length) return false;
        realClick(options[0]);
        await sleep(180);
        return true;
    }

    async function setSelectValue(doc, select, text) {
        const option = findOption(select, text);
        if (!option) {
            throw new Error('下拉框没有“' + text + '”选项');
        }
        const visual = selectVisual(select);
        if (!(visual && visual !== select && isVisible(visual) && await chooseVisual(doc, visual, text))) {
            triggerSelect(doc, select, option);
            await sleep(160);
        }
    }

    async function setCellInput(rowIndex, label, value, allowMissing) {
        if (value === '' || value === undefined || value === null) return;
        const context = await ensureRows(rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = cellByColumn(context, row, label);
        const input = visibleInput(cell);
        if (!input) {
            if (cell && normalize(cell.innerText || cell.textContent).includes(normalize(value))) return;
            if (allowMissing) return;
            throw new Error('第' + (rowIndex + 1) + '行未找到“' + label + '”输入框');
        }
        setInput(context.doc, input, value, true, true);
        await sleep(120);
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


    /*
     * 模拟一次真实的鼠标单击。
     *
     * 该院内表格的编辑器依赖鼠标坐标以及pointer/mouse事件顺序。
     * 不能先点击旧的row节点再点击cell，否则行激活后DOM重绘会使旧cell失效；
     * 也不能连续调用element.click()，否则会把刚打开的字典框再次关闭。
     */
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


    function routeRowHasCommittedValue(row, routeCell, definition) {
        if (
            !row ||
            !definition
        ) {
            return false;
        }

        const targets =
            routeSelectedDisplayTargets(definition);

        const values = [];

        /*
         * 只能读取“用法”单元格或明确标记为用法/给药途径的字段。
         * 旧版把整行innerText和所有输入框都纳入判断；当药名本身包含
         * “口服”（如“乳果糖口服溶液”）或“注射”等文字时，即使
         * 用法列仍为空也会被误判为已经提交，从而跳过真正的字典选择。
         */
        if (
            routeCell &&
            row.contains(routeCell)
        ) {
            values.push.apply(
                values,
                routeCellDisplayValues(routeCell)
            );
        }

        [
            'data-route',
            'data-route-name',
            'data-route-text',
            'data-usage',
            'data-usage-name',
            'data-use-way',
            'data-administration'
        ].forEach(function (attribute) {
            values.push(
                row.getAttribute
                    ? row.getAttribute(attribute) || ''
                    : ''
            );
        });

        Array.from(
            row.querySelectorAll(
                '[name],[id],[data-field],[data-column],[data-col],' +
                '[data-title],[aria-label],[placeholder]'
            )
        ).filter(function (element) {
            if (
                routeCell &&
                routeCell.contains(element)
            ) {
                return true;
            }

            const marker = normalize([
                element.getAttribute('name'),
                element.getAttribute('id'),
                element.getAttribute('data-field'),
                element.getAttribute('data-column'),
                element.getAttribute('data-col'),
                element.getAttribute('data-title'),
                element.getAttribute('aria-label'),
                element.getAttribute('placeholder')
            ].filter(Boolean).join(' '));

            return /用法|给药途径|route|usage|useway|administration/.test(marker);
        }).forEach(function (element) {
            if (
                element.matches &&
                element.matches('input,textarea,select')
            ) {
                values.push(
                    element.value || ''
                );
            }

            if (
                element.matches &&
                element.matches('select') &&
                element.options &&
                element.selectedIndex >= 0
            ) {
                const option = element.options[element.selectedIndex];
                values.push(
                    option
                        ? option.textContent || option.value || ''
                        : ''
                );
            }

            values.push(
                element.innerText ||
                element.textContent ||
                ''
            );

            [
                'data-value',
                'data-route',
                'data-name',
                'title'
            ].forEach(function (attribute) {
                values.push(
                    element.getAttribute
                        ? element.getAttribute(attribute) || ''
                        : ''
                );
            });
        });

        return values.some(function (value) {
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

    async function openHospitalRoutePopup(
        context,
        rowIndex,
        definition,
        fallbackRow,
        fallbackCell
    ) {
        let current =
            tableContext() ||
            context;

        let row =
            current.rows[rowIndex] ||
            fallbackRow;

        let cell =
            cellByColumn(
                current,
                row,
                '用法'
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
            tableContext() ||
            current;

        row =
            current.rows[rowIndex] ||
            row;

        cell =
            cellByColumn(
                current,
                row,
                '用法'
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
            setInput(
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
                tableContext() ||
                current;

            row =
                current.rows[rowIndex] ||
                row;

            cell =
                cellByColumn(
                    current,
                    row,
                    '用法'
                ) ||
                cell;

            input =
                routeNearbyInput(
                    current,
                    cell
                );

            if (input) {
                setInput(
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

    function routePopupRows(context, cell, definition) {
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
                tableContext() ||
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
                        cellByColumn(
                            current,
                            row,
                            '用法'
                        ) ||
                        fallbackCell
                    )
                    : fallbackCell;

            /*
             * 必须同时满足：
             * 1. 候选框已关闭；
             * 2. 用法单元格或明确标记为用法的字段中出现中文用法名称。
             *
             * 单独出现“LY”只是检索状态，绝不能判定成功。
             */
            if (
                cell &&
                !routePopupPanelVisible(
                    current,
                    cell
                ) &&
                (
                    routeCellMatches(
                        cell,
                        definition
                    ) ||
                    routeRowHasCommittedValue(
                        row,
                        cell,
                        definition
                    )
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
            routePopupRows(
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
                    routePopupRows(
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


    async function setHospitalRouteCell(rowIndex, value, allowMissing) {
        const definition =
            hospitalRouteDefinition(value);

        if (!definition) {
            if (allowMissing) {
                return false;
            }

            throw new Error(
                '未识别院内用法：' +
                value
            );
        }

        let context =
            await ensureRows(
                rowIndex + 1
            );

        let row =
            context.rows[rowIndex];

        let cell =
            cellByColumn(
                context,
                row,
                '用法'
            );

        if (!cell) {
            if (allowMissing) {
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

                if (
                    await waitHospitalRouteCommitted(
                        rowIndex,
                        definition,
                        context,
                        row,
                        cell,
                        1400
                    )
                ) {
                    return true;
                }
            }
        }

        if (
            routeCellMatches(
                cell,
                definition
            ) ||
            routeRowHasCommittedValue(
                row,
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

        if (allowMissing) {
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

    async function setCellSelect(rowIndex, label, value, allowMissing) {
        if (!String(value || '').trim()) return;

        if (label === '用法') {
            const selected = await setHospitalRouteCell(
                rowIndex,
                value,
                allowMissing
            );

            if (selected || allowMissing) return;
        }
        const context = await ensureRows(rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = cellByColumn(context, row, label);
        if (!cell) {
            if (allowMissing) return;
            throw new Error('第' + (rowIndex + 1) + '行未找到“' + label + '”单元格');
        }
        const select = nativeSelect(cell);
        if (select) {
            await setSelectValue(context.doc, select, value);
            return;
        }
        if (normalize(cell.innerText || cell.textContent).includes(normalize(value))) return;
        const visual = Array.from(cell.querySelectorAll('.layui-form-select,.select2-container,.el-select,.ant-select,.ivu-select,.combo,.textbox.combo,[role="combobox"]')).filter(isVisible)[0] || null;
        if (visual && await chooseVisual(context.doc, visual, value)) return;
        const input = visibleInput(cell);
        if (input) {
            realClick(input);
            await sleep(130);
            const option = Array.from(context.doc.querySelectorAll('li,dd,button,[role="option"],.dropdown-menu a,.dropdown-menu li'))
                .filter(isVisible)
                .find(function (element) { return normalize(element.innerText || element.textContent) === normalize(value); });
            if (option) {
                realClick(option);
                await sleep(150);
                return;
            }
        }
        if (!allowMissing) throw new Error('第' + (rowIndex + 1) + '行未能设置“' + label + '”为“' + value + '”');
    }

    function popupChoiceText(element) {
        if (!element) return '';

        return plain(
            element.tagName === 'INPUT'
                ? element.value
                : (element.innerText || element.textContent || '')
        );
    }

    function findPopupChoice(context, row, cell, value) {
        const target = normalize(value);
        const cellRect = cell.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const candidates = [];
        const seen = new Set();
        const selector = [
            'button',
            'a',
            'input[type="button"]',
            'input[type="radio"]',
            'label',
            'li',
            'dd',
            'td',
            'span',
            'div',
            '[role="option"]',
            '[role="button"]'
        ].join(',');

        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll(selector))
                .filter(isVisible)
                .forEach(function (element) {
                    if (seen.has(element) || element.closest('#' + IDS.modal)) return;
                    seen.add(element);

                    if (normalize(popupChoiceText(element)) !== target) return;

                    const rect = element.getBoundingClientRect();

                    /*
                     * 排除整块页面、表格或超大容器，只保留图2中“长/临”这类小型选项。
                     */
                    if (rect.width > 280 || rect.height > 110 || rect.width < 8 || rect.height < 8) return;

                    const centerX = rect.left + rect.width / 2;
                    const cellCenterX = cellRect.left + cellRect.width / 2;
                    const belowDistance = Math.abs(rect.top - rowRect.bottom);
                    const horizontalDistance = Math.abs(centerX - cellCenterX);
                    let score = belowDistance + horizontalDistance;

                    if (doc === context.doc) score -= 800;
                    if (rect.top >= rowRect.bottom - 6) score -= 900;
                    if (/^(BUTTON|INPUT|A|LI|DD|TD|LABEL)$/.test(element.tagName)) score -= 450;
                    if (element.getAttribute('role') === 'option' || element.getAttribute('role') === 'button') score -= 350;
                    if (cell.contains(element)) score += 1200;

                    if (belowDistance < 700 && horizontalDistance < 700) {
                        candidates.push({ element: element, score: score });
                    }
                });
        });

        candidates.sort(function (a, b) {
            return a.score - b.score;
        });

        return candidates[0] ? candidates[0].element : null;
    }

    async function setPopupChoice(rowIndex, label, value, allowMissing) {
        if (!String(value || '').trim()) return;

        const context = await ensureRows(rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = cellByColumn(context, row, label);

        if (!cell) {
            if (allowMissing) return;
            throw new Error('第' + (rowIndex + 1) + '行未找到“' + label + '”单元格');
        }

        const select = nativeSelect(cell);

        if (select) {
            await setSelectValue(context.doc, select, value);
            return;
        }

        const currentText = normalize(cell.innerText || cell.textContent);

        if (currentText === normalize(value)) {
            return;
        }

        /*
         * 医院系统的“长/临”不是原生select，而是点击第二列后，
         * 在当前行下方弹出一个包含“长、临”两个按钮的小面板。
         * 依次尝试点击单元格、输入框及单元格内部可点击元素。
         */
        const targets = [
            cell,
            visibleInput(cell)
        ].concat(
            Array.from(cell.querySelectorAll('button,a,[role="button"],span,div'))
                .filter(isVisible)
        ).filter(Boolean);
        const uniqueTargets = [];
        const seenTargets = new Set();

        targets.forEach(function (target) {
            if (!seenTargets.has(target)) {
                seenTargets.add(target);
                uniqueTargets.push(target);
            }
        });

        for (const clickTarget of uniqueTargets) {
            realClick(clickTarget);
            await sleep(220);

            let option = findPopupChoice(context, row, cell, value);

            if (!option) {
                realDoubleClick(clickTarget);
                await sleep(220);
                option = findPopupChoice(context, row, cell, value);
            }

            if (!option) {
                continue;
            }

            const clickable = option.closest('button,a,label,[role="option"],[role="button"],td') || option;

            realClick(clickable);
            await sleep(260);

            const refreshed = tableContext() || context;
            const refreshedRow = refreshed.rows[rowIndex] || row;
            const refreshedCell = cellByColumn(refreshed, refreshedRow, label) || cell;
            const refreshedText = normalize(refreshedCell.innerText || refreshedCell.textContent);

            if (refreshedText === normalize(value) || refreshedText.includes(normalize(value))) {
                return;
            }

            /*
             * 部分旧版控件显示文字更新稍慢，只要已经点击了明确的目标按钮，
             * 再等待一次后视为完成，避免重复打开选择框。
             */
            await sleep(240);
            return;
        }

        if (!allowMissing) {
            throw new Error(
                '第' + (rowIndex + 1) + '行未能选择“' + label + '”为“' + value +
                '”。已按实际第二列尝试打开“长/临”选择框。'
            );
        }
    }

    /*
     * 剂量单位标准化与换算。
     *
     * 只在同一物理量内部换算：
     * - 质量：μg、mg、g、kg
     * - 体积：ml、L
     * - 效价：单位、万单位
     *
     * 片、粒、袋、支、盒等计数单位之间不做推测换算。
     */
    function canonicalDoseUnit(unit) {
        const value = String(unit || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/μ/g, 'u')
            .toLowerCase();

        const aliases = {
            ug: 'ug',
            mcg: 'ug',
            微克: 'ug',
            mg: 'mg',
            毫克: 'mg',
            g: 'g',
            克: 'g',
            kg: 'kg',
            千克: 'kg',
            ml: 'ml',
            毫升: 'ml',
            l: 'l',
            升: 'l',
            u: 'unit',
            iu: 'unit',
            单位: 'unit',
            万u: 'wanunit',
            万iu: 'wanunit',
            万单位: 'wanunit'
        };

        return aliases[value] || value;
    }

    const DOSE_UNIT_DEFINITIONS = Object.freeze({
        ug: { group: 'mass', factor: 0.000001 },
        mg: { group: 'mass', factor: 0.001 },
        g: { group: 'mass', factor: 1 },
        kg: { group: 'mass', factor: 1000 },
        ml: { group: 'volume', factor: 1 },
        l: { group: 'volume', factor: 1000 },
        unit: { group: 'activity', factor: 1 },
        wanunit: { group: 'activity', factor: 10000 }
    });

    function roundConvertedDose(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return NaN;
        }

        /*
         * 最多保留6位小数，去除0.1+0.2式浮点尾差。
         */
        return Number(number.toFixed(6));
    }

    function convertDoseBetweenUnits(value, fromUnit, toUnit) {
        const source = canonicalDoseUnit(fromUnit);
        const target = canonicalDoseUnit(toUnit);
        const sourceDefinition = DOSE_UNIT_DEFINITIONS[source];
        const targetDefinition = DOSE_UNIT_DEFINITIONS[target];
        const number = Number(value);

        if (!Number.isFinite(number) || number <= 0) {
            return null;
        }

        if (source === target) {
            return roundConvertedDose(number);
        }

        if (!sourceDefinition ||
            !targetDefinition ||
            sourceDefinition.group !== targetDefinition.group) {
            return null;
        }

        return roundConvertedDose(
            number * sourceDefinition.factor / targetDefinition.factor
        );
    }

    function isDoseUnitPlaceholder(text) {
        const value = normalize(text);

        return !value || /请选择|请选|选择|未选择|空/.test(value);
    }

    function getHospitalDoseUnitOptions(cell) {
        if (!cell) {
            return [];
        }

        const result = [];
        const seen = new Set();
        const select = nativeSelect(cell);

        function add(text) {
            const display = plain(text);

            if (!display || isDoseUnitPlaceholder(display)) {
                return;
            }

            const canonical = canonicalDoseUnit(display);
            const key = canonical + '||' + display;

            if (!seen.has(key)) {
                seen.add(key);
                result.push({
                    text: display,
                    canonical: canonical
                });
            }
        }

        if (select && select.options) {
            Array.from(select.options).forEach(function (option) {
                if (!option.disabled) {
                    add(option.textContent || option.innerText || option.value);
                }
            });
        }

        /*
         * 无原生select时，至少读取当前单元格已显示的单位作为候选。
         */
        if (!result.length) {
            const current = plain(cell.innerText || cell.textContent);

            if (current && current.length <= 30) {
                current.split(/[、,，;；\s/]+/).forEach(add);
            }
        }

        return result;
    }

    function scoreConvertedDose(value, targetCanonical) {
        let score = 0;
        const number = Math.abs(Number(value));

        if (!Number.isFinite(number) || number <= 0) {
            return Number.POSITIVE_INFINITY;
        }

        /*
         * 优先选择临床录入较易读的数值范围，避免500mg被换成0.0005kg。
         */
        if (number < 0.001) score += 5000;
        else if (number < 0.01) score += 900;
        else if (number > 100000) score += 5000;
        else if (number > 10000) score += 900;

        const decimalText = String(number);
        const decimalIndex = decimalText.indexOf('.');

        if (decimalIndex >= 0) {
            score += Math.min(20, decimalText.length - decimalIndex - 1) * 3;
        }

        const preferredOrder = {
            mg: 0,
            g: 1,
            ug: 2,
            ml: 0,
            l: 2,
            unit: 0,
            wanunit: 1,
            kg: 4
        };

        score += preferredOrder[targetCanonical] === undefined
            ? 20
            : preferredOrder[targetCanonical];

        return score;
    }

    /*
     * 根据医院当前药品字典实际提供的“单位”选项决定最终写入剂量。
     *
     * 示例：输入500mg，而院内该药只允许g和盒：
     * - g可与mg换算，得到0.5g；
     * - 盒属于计数单位，不能与mg换算；
     * 因此最终写入“剂量0.5、单位g”。
     */
    async function resolveHospitalDose(rowIndex, item) {
        const context = await ensureRows(rowIndex + 1);
        const row = context.rows[rowIndex];
        const unitCell = cellByColumn(context, row, '单位');

        if (!unitCell) {
            throw new Error('第' + (rowIndex + 1) + '行未找到“单位”单元格');
        }

        const sourceValue = Number(item.doseValue);
        const sourceUnit = String(item.doseUnit || '').trim();

        if (!Number.isFinite(sourceValue) || sourceValue <= 0 || !sourceUnit) {
            throw new Error('剂量或剂量单位无效，无法进行单位核对');
        }

        const options = getHospitalDoseUnitOptions(unitCell);

        if (!options.length) {
            /*
             * 读取不到选项时沿用原单位，由后续setCellSelect给出明确错误。
             */
            return {
                doseValue: sourceValue,
                unitText: sourceUnit,
                converted: false,
                note: ''
            };
        }

        const sourceCanonical = canonicalDoseUnit(sourceUnit);
        const exact = options.find(function (option) {
            return option.canonical === sourceCanonical;
        });

        if (exact) {
            return {
                doseValue: sourceValue,
                unitText: exact.text,
                converted: false,
                note: ''
            };
        }

        const convertible = options.map(function (option) {
            const convertedValue = convertDoseBetweenUnits(
                sourceValue,
                sourceUnit,
                option.text
            );

            return {
                option: option,
                value: convertedValue,
                score: convertedValue === null
                    ? Number.POSITIVE_INFINITY
                    : scoreConvertedDose(convertedValue, option.canonical)
            };
        }).filter(function (entry) {
            return entry.value !== null &&
                Number.isFinite(entry.value) &&
                entry.value > 0;
        }).sort(function (a, b) {
            return a.score - b.score;
        });

        if (!convertible.length) {
            throw new Error(
                '原剂量单位“' + sourceUnit + '”与院内可选单位“' +
                options.map(function (option) {
                    return option.text;
                }).join('、') +
                '”不能安全换算，请人工处理'
            );
        }

        const chosen = convertible[0];

        return {
            doseValue: chosen.value,
            unitText: chosen.option.text,
            converted: true,
            note: String(sourceValue) + sourceUnit +
                '→' + String(chosen.value) + chosen.option.text
        };
    }


    /*
     * 自付比例默认选择最小值。
     *
     * 医院药品字典在选中具体药品后，才会加载该药允许的自付比例，
     * 例如0.05和1。脚本读取当前行“自付比例”下拉框中的全部可选数值，
     * 排除“请选择”等占位项后，自动选择数值最小的一项。
     *
     * 同时兼容：
     * - 0.05、1等小数形式；
     * - 5%、100%等百分比形式；
     * - 原生select；
     * - Layui、Element、Select2等可视化下拉控件。
     */
    function parseSelfPayRatio(text) {
        const source = plain(text)
            .replace(/，/g, '.')
            .replace(/\s+/g, '');

        if (!source ||
            /请选择|请选|选择|未选择|空|无选项/.test(normalize(source))) {
            return null;
        }

        const percentMatch = source.match(/(-?\d+(?:\.\d+)?)%/);

        if (percentMatch) {
            const percentValue = Number(percentMatch[1]);

            return Number.isFinite(percentValue) && percentValue >= 0
                ? percentValue / 100
                : null;
        }

        const numberMatch = source.match(/-?\d+(?:\.\d+)?/);

        if (!numberMatch) {
            return null;
        }

        const number = Number(numberMatch[0]);

        return Number.isFinite(number) && number >= 0
            ? number
            : null;
    }

    function selfPayDisplayText(element) {
        if (!element) {
            return '';
        }

        return plain(
            element.tagName === 'INPUT'
                ? element.value
                : (element.innerText || element.textContent || '')
        );
    }

    async function chooseMinimumSelfPayRatio(rowIndex) {
        const context = await ensureRows(rowIndex + 1);
        const row = context.rows[rowIndex];
        const cell = cellByColumn(context, row, '自付比例');

        if (!cell) {
            throw new Error(
                '第' + (rowIndex + 1) +
                '行未找到“自付比例”单元格'
            );
        }

        const select = nativeSelect(cell);

        if (select && select.options) {
            const candidates = Array.from(select.options)
                .filter(function (option) {
                    return !option.disabled;
                })
                .map(function (option) {
                    const text = plain(
                        option.textContent ||
                        option.innerText ||
                        option.label ||
                        option.value
                    );

                    return {
                        option: option,
                        text: text,
                        value: parseSelfPayRatio(text)
                    };
                })
                .filter(function (entry) {
                    return entry.value !== null;
                })
                .sort(function (a, b) {
                    if (a.value !== b.value) {
                        return a.value - b.value;
                    }

                    return a.text.length - b.text.length;
                });

            if (!candidates.length) {
                throw new Error(
                    '第' + (rowIndex + 1) +
                    '行“自付比例”下拉框没有可识别的数值选项'
                );
            }

            const chosen = candidates[0];

            triggerSelect(
                context.doc,
                select,
                chosen.option
            );

            await sleep(180);

            return {
                text: chosen.text,
                value: chosen.value
            };
        }

        const visual = Array.from(
            cell.querySelectorAll(
                '.layui-form-select,' +
                '.select2-container,' +
                '.el-select,' +
                '.ant-select,' +
                '.ivu-select,' +
                '.combo,' +
                '.textbox.combo,' +
                '[role="combobox"]'
            )
        ).filter(isVisible)[0] || null;

        const input = visibleInput(cell);
        const clickTarget = visual
            ? (
                visual.querySelector(
                    '.layui-select-title input,' +
                    '.layui-select-title,' +
                    '.select2-selection,' +
                    '.el-input,' +
                    '.ant-select-selector,' +
                    '.ivu-select-selection,' +
                    '[role="combobox"]'
                ) ||
                visual
            )
            : input;

        if (clickTarget) {
            realClick(clickTarget);
            await sleep(220);

            const cellRect = cell.getBoundingClientRect();
            const selectors = [
                '.layui-form-select dl dd',
                '.select2-results__option',
                '.dropdown-menu li',
                '.dropdown-menu a',
                '[role="option"]',
                '.el-select-dropdown__item',
                '.ant-select-item-option',
                '.ivu-select-item',
                'option'
            ].join(',');

            const choices = Array.from(
                context.doc.querySelectorAll(
                    selectors
                )
            )
                .filter(isVisible)
                .filter(function (element) {
                    return !element.closest('#' + IDS.modal);
                })
                .map(function (element) {
                    const rect = element.getBoundingClientRect();
                    const text = selfPayDisplayText(element);
                    const value = parseSelfPayRatio(text);
                    const horizontalDistance = Math.abs(
                        rect.left -
                        cellRect.left
                    );
                    const verticalDistance = Math.min(
                        Math.abs(rect.top - cellRect.bottom),
                        Math.abs(rect.bottom - cellRect.top)
                    );

                    return {
                        element: element,
                        text: text,
                        value: value,
                        distance:
                            horizontalDistance +
                            verticalDistance
                    };
                })
                .filter(function (entry) {
                    return entry.value !== null &&
                        entry.distance < 1200;
                })
                .sort(function (a, b) {
                    if (a.value !== b.value) {
                        return a.value - b.value;
                    }

                    return a.distance - b.distance;
                });

            if (choices.length) {
                const chosen = choices[0];
                const clickable =
                    chosen.element.closest(
                        'li,dd,a,button,[role="option"]'
                    ) ||
                    chosen.element;

                realClick(clickable);
                await sleep(180);

                return {
                    text: chosen.text,
                    value: chosen.value
                };
            }
        }

        /*
         * 某些药品的自付比例只有一个固定值，页面可能直接显示文字，
         * 而不提供可操作的下拉框。此时读取当前显示值即可。
         */
        const currentText = selfPayDisplayText(cell);
        const currentValue = parseSelfPayRatio(currentText);

        if (currentValue !== null) {
            return {
                text: currentText,
                value: currentValue
            };
        }

        throw new Error(
            '第' + (rowIndex + 1) +
            '行未能读取或选择“自付比例”'
        );
    }

    async function fillOne(rowIndex, item) {
        await checkpoint();
        await setPopupChoice(rowIndex, '长临', item.orderType || '长', false);

        if (item.groupNo) {
            await setCellInput(rowIndex, '组号', item.groupNo, true);
        }

        const selected = await selectMedication(rowIndex, item);

        /*
         * 必须在院内药品被选中、规格和可选单位加载完成后再换算。
         * 先设置目标单位，再写入换算后的剂量，避免切换单位时剂量被控件重置。
         */
        const hospitalDose = await resolveHospitalDose(rowIndex, item);
        const hospitalRoute = routeToHospitalOption(item.route);

        await setCellSelect(rowIndex, '单位', hospitalDose.unitText, false);
        await setCellInput(rowIndex, '剂量', hospitalDose.doseValue, false);
        await setCellSelect(rowIndex, '用法', hospitalRoute, false);
        await setPopupChoice(rowIndex, '频次', normalizeFrequency(item.frequency), false);

        if (
            item.sourceType === 'claim-warning' &&
            Number(item.claimQuantity) > 0
        ) {
            /*
             * 领药医嘱默认按包装数开立。若医院“总量”列可编辑，写入用户在
             * 预警表中确认的包装数量；若该列由药品字典自动计算，则允许跳过。
             */
            await setCellInput(
                rowIndex,
                '总量',
                Math.max(1, Math.floor(Number(item.claimQuantity))),
                true
            );
        }

        if (item.days) {
            await setCellInput(rowIndex, '天数', item.days, true);
        }

        /*
         * 自付比例必须在药品字典选中以后设置。
         * 此时医院系统已经加载该药允许的比例选项，脚本取其中最小值。
         */
        const selfPayRatio = await chooseMinimumSelfPayRatio(rowIndex);

        /*
         * 频次、天数、自付比例等控件可能触发表格局部重绘。单行全部字段
         * 写完后再次按“用法”列本身复核；若回写被清空则重新选择，且只有
         * 真正出现院内中文用法名称后才允许把该行标记为成功。
         */
        if (String(hospitalRoute || '').trim()) {
            await setHospitalRouteCell(
                rowIndex,
                hospitalRoute,
                false
            );
        }

        return {
            selectedName: selected.selectedName,
            doseValue: hospitalDose.doseValue,
            doseUnit: hospitalDose.unitText,
            conversionNote: hospitalDose.note,
            selfPayRatioText: selfPayRatio.text,
            selfPayRatioValue: selfPayRatio.value
        };
    }

    function buttonText(element) {
        const values = [
            element && element.tagName === 'INPUT' ? element.value : '',
            element ? element.innerText || '' : '',
            element ? element.textContent || '' : '',
            element ? element.getAttribute('title') || '' : '',
            element ? element.getAttribute('aria-label') || '' : ''
        ].map(function (value) {
            return String(value || '').trim();
        }).filter(Boolean);
        const unique = [];

        values.forEach(function (value) {
            if (!unique.includes(value)) unique.push(value);
        });

        return unique.join(' ');
    }

    function saveButton() {
        const candidates = [];
        allDocuments().forEach(function (doc) {
            Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],.layui-btn,.btn'))
                .filter(isVisible)
                .filter(function (element) {
                    return !element.closest('#' + IDS.modal) && normalize(buttonText(element)) === normalize('保存');
                })
                .forEach(function (element) {
                    const rect = element.getBoundingClientRect();
                    const height = doc.defaultView.innerHeight;
                    const width = doc.defaultView.innerWidth;
                    let score = Math.abs(height - rect.bottom) + Math.abs(width - rect.right) / 8;
                    if (rect.top > height * 0.72) score -= 3000;
                    if (rect.left > width * 0.65) score -= 1800;
                    candidates.push({ element: element, score: score });
                });
        });
        candidates.sort(function (a, b) { return a.score - b.score; });
        return candidates[0] || null;
    }

    async function saveOrders() {
        const found = saveButton();
        if (!found) throw new Error('未找到页面底部“保存”按钮，请手工保存。');
        found.element.scrollIntoView({ block: 'center', behavior: 'auto' });
        await sleep(180);
        realClick(found.element);
    }

    function makeInput(className, value, type) {
        const input = document.createElement('input');
        input.className = className;
        input.type = type || 'text';
        input.value = value === undefined || value === null ? '' : String(value);
        return input;
    }

    function makeSelect(className, options, value) {
        const select = document.createElement('select');
        select.className = className;
        options.forEach(function (text) {
            const option = document.createElement('option');
            option.value = text;
            option.textContent = text;
            select.appendChild(option);
        });
        if (value && !options.includes(value)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        }
        select.value = value || '';
        return select;
    }

    function appendCell(row, child) {
        const cell = document.createElement('td');
        cell.appendChild(child);
        row.appendChild(cell);
    }

    function renderTable(modal) {
        state.items.forEach(enrichDrugItemFromSharedLibrary);
        const body = modal.querySelector('.drug-result-body');
        body.innerHTML = '';
        state.items.forEach(function (item, index) {
            const row = document.createElement('tr');
            row.dataset.index = String(index);
            if (item.sourceType === 'suggested') row.classList.add('suggested');
            const enabled = makeInput('drug-enabled', '', 'checkbox');
            enabled.checked = item.enabled === true;
            appendCell(row, enabled);
            const number = document.createElement('span');
            number.textContent = String(index + 1);
            appendCell(row, number);
            const sourceInput = makeInput('drug-source', item.sourceName);
            sourceInput.setAttribute('list', DRUG_SHARED_WESTERN_DATALIST_ID);
            appendCell(row, sourceInput);
            const standardInput = makeInput('drug-standard', item.standardName);
            standardInput.setAttribute('list', DRUG_SHARED_WESTERN_DATALIST_ID);
            appendCell(row, standardInput);
            appendCell(row, makeInput('drug-spec', item.specificationHint));
            appendCell(row, makeSelect('drug-order-type', ['长', '临'], item.orderType || '长'));
            appendCell(row, makeInput('drug-group', item.groupNo));
            const dose = makeInput('drug-dose', item.doseValue, 'number');
            dose.step = '0.001';
            appendCell(row, dose);
            appendCell(row, makeInput('drug-unit', item.doseUnit));
            appendCell(row, makeSelect('drug-route', ROUTES, item.route));
            appendCell(row, makeSelect('drug-frequency', FREQUENCIES, item.frequency));
            const days = makeInput('drug-days', item.days, 'number');
            days.step = '1';
            appendCell(row, days);
            const indication = document.createElement('textarea');
            indication.className = 'drug-indication';
            indication.value = [item.indication, item.rationale].filter(Boolean).join('；');
            appendCell(row, indication);
            const warning = document.createElement('span');
            warning.className = 'drug-warning';
            warning.textContent = item.warnings && item.warnings.length ? item.warnings.join('；') : '-';
            warning.title = warning.textContent;
            appendCell(row, warning);
            const confidence = document.createElement('span');
            confidence.textContent = item.confidence === '' || item.confidence === undefined ? '-' : Math.round(Number(item.confidence) * 100) + '%';
            appendCell(row, confidence);
            const status = document.createElement('span');
            status.className = 'drug-row-status';
            status.textContent = item.status || '待核对';
            appendCell(row, status);
            body.appendChild(row);
        });
        const resultSection = modal.querySelector('.drug-result-section');

        if (resultSection) {
            resultSection.style.display = state.items.length ? 'block' : 'none';
        }
    }

    function readTable(modal) {
        return Array.from(modal.querySelectorAll('.drug-result-body tr')).map(function (row, index) {
            const old = state.items[index] || {};
            const dose = Number(row.querySelector('.drug-dose').value);
            const days = Number(row.querySelector('.drug-days').value);
            return {
                enabled: row.querySelector('.drug-enabled').checked,
                sourceName: row.querySelector('.drug-source').value.trim(),
                standardName: row.querySelector('.drug-standard').value.trim(),
                specificationHint: row.querySelector('.drug-spec').value.trim(),
                orderType: row.querySelector('.drug-order-type').value,
                groupNo: row.querySelector('.drug-group').value.trim(),
                doseValue: Number.isFinite(dose) && dose > 0 ? dose : '',
                doseUnit: row.querySelector('.drug-unit').value.trim(),
                route: row.querySelector('.drug-route').value,
                frequency: row.querySelector('.drug-frequency').value,
                days: Number.isFinite(days) && days > 0 ? days : '',
                indication: row.querySelector('.drug-indication').value.trim(),
                rationale: old.rationale || '',
                warnings: old.warnings || [],
                confidence: old.confidence === undefined ? '' : old.confidence,
                sourceType: old.sourceType || 'parsed',
                claimQuantity: old.claimQuantity || '',
                claimRemainingDays: old.claimRemainingDays === undefined
                    ? ''
                    : old.claimRemainingDays,
                status: row.querySelector('.drug-row-status').textContent
            };
        });
    }

    function rowStatus(modal, index, text, type) {
        const status = modal.querySelector('.drug-result-body tr[data-index="' + index + '"] .drug-row-status');
        if (!status) return;
        status.textContent = text;
        status.dataset.type = type || '';
    }

    function renderAssessment(modal, issues) {
        const box = modal.querySelector('.drug-assessment-box');
        const content = modal.querySelector('.drug-assessment-content');

        if (state.assessmentSuppressed) {
            box.style.display = 'none';
            content.innerHTML = '';
            return;
        }

        const localIssues = issues || localAudit(state.items);
        if (!state.assessment && !localIssues.length) {
            box.style.display = 'none';
            content.innerHTML = '';
            return;
        }
        const html = [];
        const a = state.assessment;
        if (a) {
            const riskText = { low: '低', medium: '中', high: '高', critical: '极高' }[a.riskLevel] || a.riskLevel;
            html.push('<div class="drug-risk-level ' + escapeHtml(a.riskLevel) + '">总体风险等级：' + escapeHtml(riskText) + '</div>');
            if (a.summary) html.push('<div class="drug-summary"><strong>总体评价：</strong>' + escapeHtml(a.summary) + '</div>');
            if (a.appropriateness) html.push('<div class="drug-section"><strong>方案合理性：</strong>' + escapeHtml(a.appropriateness) + '</div>');
            [
                ['相互作用', a.interactions],
                ['禁忌证与慎用', a.contraindications],
                ['剂量、用法与频次', a.doseRouteFrequencyIssues],
                ['肝肾功能相关', a.renalHepaticConsiderations],
                ['年龄相关风险', a.ageSpecificConsiderations],
                ['抗菌药物管理', a.antimicrobialStewardship],
                ['监测建议', a.monitoring],
                ['缺失信息', a.missingInformation],
                ['备选方案', a.alternativeSuggestions],
                ['非药物建议', a.nonDrugSuggestions]
            ].forEach(function (section) {
                if (!section[1] || !section[1].length) return;
                html.push('<div class="drug-section"><strong>' + escapeHtml(section[0]) + '：</strong><ul>' + section[1].map(function (item) {
                    return '<li>' + escapeHtml(item) + '</li>';
                }).join('') + '</ul></div>');
            });
        }
        if (localIssues.length) {
            html.push('<div class="drug-local-title">本地完整性与高风险提示</div>');
            localIssues.forEach(function (issue) {
                html.push('<div class="drug-local-issue ' + escapeHtml(issue.severity) + '"><strong>' + escapeHtml(issue.type) + '：</strong>' + escapeHtml(issue.message) + '</div>');
            });
        }
        content.innerHTML = html.join('');
        box.style.display = 'block';
    }




    /******************************************************************
     * 长期药物预警系统
     *
     * 计算原则：
     * 1. 长期医嘱纳入范围由用户多选，可同时纳入口服、外用、雾化/吸入、
     *    注射/输液及其他用法；默认只纳入口服/肠内，兼容旧版行为。
     * 2. 临时供应量补偿范围独立多选，可将“领药”、临时口服、临时外用等
     *    同药品医嘱计入累计供应量；默认仅补偿“领药”。
     * 3. 依据药品规格、药品总量、单次剂量、频次和起始时间估算库存。
     * 4. 初始长期医嘱与符合补偿范围的临时医嘱均计入供应量；总量缺失时，
     *    按当前工作流暂以1盒/瓶估算，并在结果中明确标记。
     * 5. 长期液体仅按医嘱“用法”列中的注射/输液类判断，不再依据药名、
     *    规格或ml/L单位判断；长期液体不纳入手动领药报警、默认勾选和领药
     *    提取，只显示自开始日期起已使用的天数。
     * 6. 估算结果只用于提醒，不能替代药房发药记录、实际用药记录和人工核对。
     ******************************************************************/

    const CLAIM_WARNING_ROUTE_GROUPS = Object.freeze([
        {
            key: 'oral',
            label: '口服/肠内',
            pattern: /口服|\bpo\b|鼻饲|胃管注入|胃管注药|舌下|含化/i
        },
        {
            key: 'injection',
            label: '注射/输液',
            pattern: /静脉滴注|静滴|静脉注射|静脉推注|静推|静脉泵入|微量泵入|泵入|肌肉注射|肌注|皮下注射|皮内注射|穴位注射|注射用药|关节腔内用药|冲管|\bivdrip\b|\biv\b|\bim\b|\bsc\b/i
        },
        {
            key: 'inhalation',
            label: '雾化/吸入',
            pattern: /雾化|吸入/i
        },
        {
            key: 'external',
            label: '外用/局部',
            pattern: /外用|局部用药|局部涂|外敷|敷伤口|擦皮肤|涂抹|涂擦|贴敷|滴眼|滴鼻|喷喉|喷雾用药|冲洗|阴道用药|直肠用药/i
        },
        {
            key: 'other',
            label: '其他用法',
            pattern: null
        }
    ]);

    const CLAIM_WARNING_COMPENSATION_SPECIAL = Object.freeze({
        key: 'claim',
        label: '领药'
    });

    function claimWarningNormalizeScopeList(value, fallback) {
        const source = Array.isArray(value) ? value : [];
        const allowed = ['claim'].concat(
            CLAIM_WARNING_ROUTE_GROUPS.map(function (item) {
                return item.key;
            })
        );
        const result = [];

        source.forEach(function (item) {
            const key = String(item || '').trim();

            if (allowed.includes(key) && !result.includes(key)) {
                result.push(key);
            }
        });

        return result.length ? result : fallback.slice();
    }

    function claimWarningLongRouteScopes() {
        return claimWarningNormalizeScopeList(
            GM_getValue(KEYS.claimWarningLongRouteScopes, ['oral']),
            ['oral']
        ).filter(function (key) {
            return key !== 'claim';
        });
    }

    function claimWarningCompensationRouteScopes() {
        return claimWarningNormalizeScopeList(
            GM_getValue(KEYS.claimWarningCompensationRouteScopes, ['claim']),
            ['claim']
        );
    }

    function claimWarningRouteScopeKey(route) {
        const source = plain(route);
        const matched = CLAIM_WARNING_ROUTE_GROUPS.find(function (item) {
            return item.pattern && item.pattern.test(source);
        });

        return matched ? matched.key : 'other';
    }

    function claimWarningScopeLabel(key) {
        if (key === CLAIM_WARNING_COMPENSATION_SPECIAL.key) {
            return CLAIM_WARNING_COMPENSATION_SPECIAL.label;
        }

        const matched = CLAIM_WARNING_ROUTE_GROUPS.find(function (item) {
            return item.key === key;
        });

        return matched ? matched.label : String(key || '');
    }

    function claimWarningScopeLabels(scopes) {
        return (scopes || []).map(claimWarningScopeLabel).filter(Boolean);
    }

    function claimWarningLongOrderInScope(order, scopes) {
        if (!order || order.isClaim) return false;

        return (scopes || []).includes(
            order.routeScope || claimWarningRouteScopeKey(order.route)
        );
    }

    function claimWarningTemporaryOrderInCompensationScope(order, scopes) {
        if (!order || !order.isTemporary) return false;

        /*
         * “领药”是独立补偿类型，不能因同时勾选“其他用法”而被误纳入。
         */
        if (order.isClaim) {
            return (scopes || []).includes('claim');
        }

        return (scopes || []).includes(
            order.routeScope || claimWarningRouteScopeKey(order.route)
        );
    }

    function claimWarningIsLiquidOrder(order) {
        /*
         * v1.25起，长期液体的判断只依据医院医嘱“用法”列。
         * 仅当用法归入“注射/输液”范围时，才按长期液体处理。
         * 不再依据药品名称、规格中的ml/L或“溶液、口服液、开塞露”等
         * 字样判断，避免开塞露、口服液、洗剂等被误判为长期液体。
         */
        if (!order) return false;

        const routeScope = order.routeScope ||
            claimWarningRouteScopeKey(order.route);

        return routeScope === 'injection';
    }

    function claimWarningShowStoppedOrders() {
        return Boolean(
            GM_getValue(KEYS.claimWarningShowStoppedOrders, false)
        );
    }

    function claimWarningRenderLiquidEnabled() {
        /*
         * v1.24起取消独立勾选框：长期液体已使用天数渲染固定开启。
         * 该返回值仍受“开启预警渲染（直接标记医嘱界面）”总开关控制；
         * 旧版本地存储值不再参与判断，避免历史关闭状态继续生效。
         */
        return true;
    }

    function claimWarningModalScopes(modal, selector, fallback) {
        const boxes = modal
            ? Array.from(modal.querySelectorAll(selector))
            : [];
        const values = boxes.filter(function (box) {
            return box.checked;
        }).map(function (box) {
            return box.value;
        });

        return values.length ? values : fallback.slice();
    }

    const CLAIM_WARNING_COUNT_UNITS = Object.freeze([
        '片', '粒', '袋', '丸', '枚', '贴', '支', '瓶', '盒', '包',
        '板', '喷', '揿', '吸', '滴', '管', '条', '贴片'
    ]);

    const CLAIM_WARNING_PACKAGE_UNITS = Object.freeze([
        '盒', '瓶', '包', '板', '袋', '支', '管', '套'
    ]);

    function claimWarningCountUnitPattern() {
        return '(?:' + CLAIM_WARNING_COUNT_UNITS
            .slice()
            .sort(function (a, b) { return b.length - a.length; })
            .join('|') + ')';
    }

    /*
     * 部分院内药品规格使用英文S表示固体制剂的“计数单位”，例如：
     *   5mg*30S
     *   5mg×30s/盒
     *   5mg/片*30S
     * 这里把S仅作为“包装内有30个给药单元”的通用计数后缀处理，
     * 不把S强行解释成“片”或“粒”。这样：
     * - 单次剂量按片/粒计时，可直接得到30个给药单元；
     * - 单次剂量按mg/g计时，可计算5mg×30=150mg的整包装容量。
     * 同时兼容常见的30'S / 30’s以及PCS/TAB/CAP简写。
     */
    function claimWarningEnglishCountSuffixPattern() {
        return "(?:['’]?s|pcs?|pieces?|tabs?|tablets?|caps?|capsules?)";
    }

    function claimWarningParseDate(value) {
        const source = plain(value);
        const matched = source.match(
            /(20\d{2})[-\/.年](\d{1,2})[-\/.月](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
        );

        if (!matched) return null;

        const result = new Date(
            Number(matched[1]),
            Number(matched[2]) - 1,
            Number(matched[3]),
            Number(matched[4] || 0),
            Number(matched[5] || 0),
            Number(matched[6] || 0),
            0
        );

        return Number.isFinite(result.getTime()) ? result : null;
    }

    /*
     * 与临床路径通用预警保持一致的自然日计算：
     * 1. 本次医嘱执行天数：开始日期 -> 停止日期，包含开始当日；
     * 2. 已停天数：停止日期 -> 今天，停止当天=0天。
     * “已停X天”只允许使用停止时间列，不再使用开始时间倒推。
     */
    function claimWarningInclusiveDays(startDate, endDate) {
        if (
            !(startDate instanceof Date) || Number.isNaN(startDate.getTime()) ||
            !(endDate instanceof Date) || Number.isNaN(endDate.getTime())
        ) {
            return null;
        }

        const startStamp = Date.UTC(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate()
        );
        const endStamp = Date.UTC(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate()
        );

        if (endStamp < startStamp) return 0;

        return Math.floor((endStamp - startStamp) / 86400000) + 1;
    }

    function claimWarningStoppedDays(stopDate, nowDate) {
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

        if (nowStamp < stopStamp) return 0;

        return Math.floor((nowStamp - stopStamp) / 86400000);
    }

    function claimWarningFormatDate(value) {
        const date = value instanceof Date ? value : claimWarningParseDate(value);

        if (!date) return '-';

        const pad = function (number) {
            return String(number).padStart(2, '0');
        };

        return date.getFullYear() + '-' +
            pad(date.getMonth() + 1) + '-' +
            pad(date.getDate());
    }

    function claimWarningFormatDateTime(value) {
        const date = value instanceof Date ? value : claimWarningParseDate(value);

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

    function claimWarningParseAmountUnit(value) {
        const source = plain(value)
            .replace(/，/g, '.')
            .replace(/毫升/gi, 'ml')
            .replace(/微克/gi, 'ug')
            .replace(/毫克/gi, 'mg')
            .replace(/千克/gi, 'kg')
            .replace(/万\s*单位/gi, '万单位');
        const matched = source.match(
            /(-?\d+(?:\.\d+)?)\s*(万单位|单位|μg|ug|mcg|mg|kg|g|ml|mL|L|片|粒|袋|丸|枚|贴片|贴|支|瓶|盒|包|板|喷|揿|吸|滴|管|条|次)?/i
        );

        if (!matched) return null;

        const number = Number(matched[1]);

        if (!Number.isFinite(number) || number < 0) return null;

        return {
            value: number,
            unit: String(matched[2] || '').trim()
        };
    }

    function claimWarningIsCountUnit(unit) {
        const target = plain(unit);

        return CLAIM_WARNING_COUNT_UNITS.some(function (candidate) {
            return normalize(candidate) === normalize(target);
        });
    }

    function claimWarningIsPackageUnit(unit) {
        const target = plain(unit);

        return CLAIM_WARNING_PACKAGE_UNITS.some(function (candidate) {
            return normalize(candidate) === normalize(target);
        });
    }

    function claimWarningConvertAmount(value, fromUnit, toUnit) {
        const number = Number(value);
        const source = plain(fromUnit);
        const target = plain(toUnit);

        if (!Number.isFinite(number) || number < 0 || !source || !target) {
            return null;
        }

        if (claimWarningIsCountUnit(source) || claimWarningIsCountUnit(target)) {
            return normalize(source) === normalize(target) ? number : null;
        }

        return convertDoseBetweenUnits(number, source, target);
    }

    function claimWarningPackageCapacity(specification, doseUnit, doseValue) {
        const source = plain(specification)
            .replace(/，/g, '.')
            .replace(/×/g, '*')
            .replace(/[Xx]/g, '*');
        const targetUnit = plain(doseUnit);
        const targetDoseValue = Number(doseValue);

        if (!source || !targetUnit) return null;

        const countPattern = claimWarningCountUnitPattern();

        if (claimWarningIsCountUnit(targetUnit)) {
            const countRegex = new RegExp(
                '(?:\\*|每|装)\\s*(\\d+(?:\\.\\d+)?)\\s*(' +
                countPattern + ')',
                'gi'
            );
            const directRegex = new RegExp(
                '(\\d+(?:\\.\\d+)?)\\s*(' + countPattern +
                ')\\s*(?:\\/|每)?\\s*(?:盒|瓶|包|板)?',
                'gi'
            );
            const englishCountRegex = new RegExp(
                '(?:\\*|每|装)\\s*(\\d+(?:\\.\\d+)?)\\s*' +
                claimWarningEnglishCountSuffixPattern() +
                '(?=\\s*(?:\\/|$|盒|瓶|包|板|袋|支))',
                'gi'
            );
            const candidates = [];
            const genericEnglishCounts = [];
            let matched;

            while ((matched = countRegex.exec(source))) {
                candidates.push({
                    value: Number(matched[1]),
                    unit: matched[2]
                });
            }

            while ((matched = directRegex.exec(source))) {
                candidates.push({
                    value: Number(matched[1]),
                    unit: matched[2]
                });
            }

            while ((matched = englishCountRegex.exec(source))) {
                const value = Number(matched[1]);

                if (Number.isFinite(value) && value > 0) {
                    genericEnglishCounts.push(value);
                }
            }

            const exact = candidates.filter(function (item) {
                return normalize(item.unit) === normalize(targetUnit) &&
                    Number.isFinite(item.value) && item.value > 0;
            }).sort(function (a, b) {
                return b.value - a.value;
            });

            if (exact[0]) {
                return exact[0].value;
            }

            /*
             * S/PCS/TAB/CAP属于未声明“片/粒”的通用计数后缀。
             * 仅当当前剂量单位本身不是盒/瓶/包等包装单位时才将其视为
             * 当前给药计数单位，避免把“30S”误解释成“30盒”。
             */
            if (
                genericEnglishCounts.length &&
                !claimWarningIsPackageUnit(targetUnit)
            ) {
                return Math.max.apply(Math, genericEnglishCounts);
            }

            return null;
        }

        /*
         * v1.28.18：复方制剂包装容量适配。
         *
         * 旧逻辑使用“有效成分剂量 * 包装内数量”的连续正则。例如规格：
         *   80mg*5mg*7片/盒
         * 对单次剂量80mg进行库存估算时，旧正则会错误匹配成“5mg*7片”，
         * 得到35mg/盒，因此80mg qd会被错误估算为约0.4天。
         *
         * 新逻辑先识别规格链中的包装计数，再从计数之前的多个成分剂量中，
         * 优先选择与当前医嘱“单次剂量”一致的成分：
         *   80mg*5mg*7片/盒 + 单次剂量80mg -> 80mg * 7片 = 560mg/盒
         *   80mg*5mg*7片/盒 + 单次剂量5mg  ->  5mg * 7片 = 35mg/盒
         * 同时兼容2ml*20mg*10支/盒、5mg/片*30S以及常见多层包装。
         */
        const chainParts = source
            .split('*')
            .map(function (part) {
                return plain(part);
            })
            .filter(Boolean);

        if (chainParts.length >= 2) {
            const physicalUnitPattern =
                '(万单位|单位|μg|ug|mcg|mg|kg|g|ml|mL|L)';
            const countTokenRegex = new RegExp(
                '^(\\d+(?:\\.\\d+)?)\\s*(' +
                countPattern + '|' +
                claimWarningEnglishCountSuffixPattern() +
                ')(?:\\s*\\/\\s*(?:盒|瓶|包|板|袋|支|管|套))?$',
                'i'
            );
            const amountTokenRegex = new RegExp(
                '^(\\d+(?:\\.\\d+)?)\\s*' +
                physicalUnitPattern +
                '(?:\\s*\\/\\s*(?:' + countPattern + '))?$',
                'i'
            );
            let firstCountIndex = -1;
            let packageMultiplier = 1;

            chainParts.forEach(function (part, index) {
                const normalizedPart = part
                    .replace(/^[\s/]+|[\s/]+$/g, '')
                    .trim();
                const countMatched = normalizedPart.match(countTokenRegex);

                if (!countMatched) {
                    return;
                }

                const count = Number(countMatched[1]);

                if (!Number.isFinite(count) || count <= 0) {
                    return;
                }

                if (firstCountIndex < 0) {
                    firstCountIndex = index;
                }

                packageMultiplier *= count;
            });

            if (firstCountIndex > 0 && packageMultiplier > 0) {
                const compatibleIngredients = [];

                chainParts
                    .slice(0, firstCountIndex)
                    .forEach(function (part) {
                        const normalizedPart = part
                            .replace(/^[\s/]+|[\s/]+$/g, '')
                            .trim();
                        const amountMatched =
                            normalizedPart.match(amountTokenRegex);

                        if (!amountMatched) {
                            return;
                        }

                        const rawAmount = Number(amountMatched[1]);
                        const rawUnit = amountMatched[2];
                        const converted = claimWarningConvertAmount(
                            rawAmount,
                            rawUnit,
                            targetUnit
                        );

                        if (
                            converted !== null &&
                            Number.isFinite(converted) &&
                            converted > 0
                        ) {
                            compatibleIngredients.push(converted);
                        }
                    });

                if (compatibleIngredients.length) {
                    let ingredientAmount = null;

                    if (
                        Number.isFinite(targetDoseValue) &&
                        targetDoseValue > 0
                    ) {
                        const exact = compatibleIngredients
                            .map(function (value) {
                                const difference = Math.abs(
                                    value - targetDoseValue
                                );
                                const tolerance = Math.max(
                                    0.000001,
                                    Math.abs(targetDoseValue) * 0.001
                                );

                                return {
                                    value: value,
                                    difference: difference,
                                    exact: difference <= tolerance
                                };
                            })
                            .sort(function (a, b) {
                                if (a.exact !== b.exact) {
                                    return a.exact ? -1 : 1;
                                }

                                return a.difference - b.difference;
                            });

                        if (exact[0] && exact[0].exact) {
                            ingredientAmount = exact[0].value;
                        }
                    }

                    if (ingredientAmount === null) {
                        /*
                         * 单次剂量无法与某一成分可靠匹配时，保持旧版偏向
                         * “较大兼容成分”的兜底行为，避免把较小复方成分
                         * 误当成主剂量后再次造成明显低估。
                         */
                        ingredientAmount = Math.max.apply(
                            Math,
                            compatibleIngredients
                        );
                    }

                    if (
                        Number.isFinite(ingredientAmount) &&
                        ingredientAmount > 0
                    ) {
                        return ingredientAmount * packageMultiplier;
                    }
                }
            }
        }

        const simplified = source.replace(
            new RegExp('\\/' + countPattern + '(?=\\s*\\*)', 'gi'),
            ''
        );
        const multiRegex = new RegExp(
            '(\\d+(?:\\.\\d+)?)\\s*' +
            '(万单位|单位|μg|ug|mcg|mg|kg|g|ml|mL|L)' +
            '\\s*\\*\\s*(\\d+(?:\\.\\d+)?)\\s*' +
            '(' + countPattern + '|' +
                claimWarningEnglishCountSuffixPattern() + ')',
            'gi'
        );
        const multiplied = [];
        let matched;

        while ((matched = multiRegex.exec(simplified))) {
            const converted = claimWarningConvertAmount(
                Number(matched[1]),
                matched[2],
                targetUnit
            );
            const count = Number(matched[3]);

            if (converted !== null && Number.isFinite(count) && count > 0) {
                multiplied.push(converted * count);
            }
        }

        if (multiplied.length) {
            return Math.max.apply(Math, multiplied);
        }

        const amountRegex = /(\d+(?:\.\d+)?)\s*(万单位|单位|μg|ug|mcg|mg|kg|g|ml|mL|L)/gi;
        const compatible = [];

        while ((matched = amountRegex.exec(source))) {
            const converted = claimWarningConvertAmount(
                Number(matched[1]),
                matched[2],
                targetUnit
            );

            if (converted !== null && converted > 0) {
                compatible.push(converted);
            }
        }

        return compatible.length
            ? Math.max.apply(Math, compatible)
            : null;
    }

    /*
     * v1.28.19：识别“药品总量”本身就是片/粒/支/袋等实际计数的情况。
     *
     * 例如佐匹克隆：规格7.5mg*12片，药品总量7片。旧版因为“片”不能
     * 直接换算成mg，会继续走包装容量分支，把7片错误当成7个整包装，
     * 最终把真实约7天库存放大成84天。
     *
     * 这里先计算一个完整外包装中包含多少个当前总量单位，再由：
     *   整包装有效成分容量 / 包装内计数 × 实际总量计数
     * 得到真实供应量。多层包装如“10mg*12片/板*2板/盒”也会从目标
     * 计数单位开始继续乘后续包装层，12片*2板=24片/盒。
     */
    function claimWarningPackageCountForTotalUnit(specification, totalUnit) {
        const source = plain(specification)
            .replace(/，/g, '.')
            .replace(/×/g, '*')
            .replace(/[Xx]/g, '*');
        const targetUnit = plain(totalUnit);

        if (!source || !targetUnit || !claimWarningIsCountUnit(targetUnit)) {
            return null;
        }

        const countPattern = claimWarningCountUnitPattern();
        const countTokenRegex = new RegExp(
            '^(\\d+(?:\\.\\d+)?)\\s*(' +
            countPattern + '|' +
            claimWarningEnglishCountSuffixPattern() +
            ')(?:\\s*\\/\\s*(?:盒|瓶|包|板|袋|支|管|套|箱))?$',
            'i'
        );
        const chainParts = source
            .split('*')
            .map(function (part) {
                return plain(part)
                    .replace(/^[\s/]+|[\s/]+$/g, '')
                    .trim();
            })
            .filter(Boolean);
        const tokens = chainParts.map(function (part, index) {
            const matched = part.match(countTokenRegex);

            if (!matched) return null;

            return {
                index: index,
                value: Number(matched[1]),
                unit: String(matched[2] || '').trim(),
                genericEnglish: new RegExp(
                    '^' + claimWarningEnglishCountSuffixPattern() + '$',
                    'i'
                ).test(String(matched[2] || '').trim())
            };
        });
        let firstIndex = -1;

        tokens.some(function (token) {
            if (!token || !Number.isFinite(token.value) || token.value <= 0) {
                return false;
            }

            if (normalize(token.unit) === normalize(targetUnit)) {
                firstIndex = token.index;
                return true;
            }

            /*
             * S/PCS/TAB/CAP属于通用固体制剂计数。仅对片/粒/丸/枚/贴片
             * 这类明确的给药单元进行兼容，不把S推断成瓶/支/袋等单位。
             */
            if (
                token.genericEnglish &&
                /^(片|粒|丸|枚|贴片|贴)$/i.test(targetUnit)
            ) {
                firstIndex = token.index;
                return true;
            }

            return false;
        });

        if (firstIndex < 0) return null;

        let count = 1;
        let found = false;

        tokens.forEach(function (token) {
            if (
                token &&
                token.index >= firstIndex &&
                Number.isFinite(token.value) &&
                token.value > 0
            ) {
                count *= token.value;
                found = true;
            }
        });

        return found && Number.isFinite(count) && count > 0
            ? count
            : null;
    }

    function claimWarningSupplyCapacity(order, doseUnit, doseValue) {
        const total = claimWarningParseAmountUnit(order.totalText);
        const notes = [];

        if (total && total.unit) {
            const direct = claimWarningConvertAmount(
                total.value,
                total.unit,
                doseUnit
            );

            if (direct !== null) {
                return {
                    amount: direct,
                    packageCount: 0,
                    assumedPackage: false,
                    notes: notes
                };
            }
        }

        const packageCapacity = claimWarningPackageCapacity(
            order.specification,
            doseUnit,
            doseValue
        );

        if (packageCapacity === null) {
            return {
                amount: null,
                packageCount: total ? total.value : 1,
                assumedPackage: !total,
                notes: ['药品规格中未识别出可用于换算的包装容量']
            };
        }

        /*
         * v1.28.19：若总量单位在规格中明确作为包装内计数出现，则总量
         * 表示实际片/粒/支/袋等数量，而不是“几个整包装”。
         */
        if (
            total &&
            total.unit &&
            claimWarningIsCountUnit(total.unit) &&
            Number.isFinite(total.value) &&
            total.value > 0
        ) {
            const countPerPackage = claimWarningPackageCountForTotalUnit(
                order.specification,
                total.unit
            );

            if (
                Number.isFinite(countPerPackage) &&
                countPerPackage > 0
            ) {
                const amountPerCount = packageCapacity / countPerPackage;
                const equivalentPackages = total.value / countPerPackage;

                if (
                    Number.isFinite(amountPerCount) &&
                    amountPerCount > 0
                ) {
                    notes.push(
                        '药品总量“' + order.totalText +
                        '”按实际' + total.unit + '数计算，不按整包装数量计算'
                    );

                    return {
                        amount: amountPerCount * total.value,
                        packageCount: equivalentPackages,
                        assumedPackage: false,
                        notes: notes
                    };
                }
            }
        }

        let packageCount = 1;
        let assumedPackage = false;

        if (total && Number.isFinite(total.value) && total.value > 0) {
            packageCount = total.value;

            if (total.unit && !claimWarningIsPackageUnit(total.unit)) {
                notes.push('药品总量单位“' + total.unit + '”未能按规格计数换算，暂按包装数量处理，请人工核对');
            }
        }
        else {
            assumedPackage = true;
            notes.push('该条医嘱未读取到药品总量，暂按1盒/瓶估算');
        }

        return {
            amount: packageCapacity * packageCount,
            packageCount: packageCount,
            assumedPackage: assumedPackage,
            notes: notes
        };
    }

    function claimWarningFrequencyPerDay(value) {
        const source = normalizeFrequency(value);
        const fixed = {
            qd: 1,
            qn: 1,
            bid: 2,
            tid: 3,
            qid: 4,
            q12h: 2,
            q8h: 3,
            q6h: 4,
            q4h: 6,
            q3h: 8,
            q2h: 12,
            qh: 24,
            qod: 0.5,
            qw: 1 / 7,
            biw: 2 / 7,
            tiw: 3 / 7,
            q72h: 1 / 3
        };

        if (Object.prototype.hasOwnProperty.call(fixed, source)) {
            return fixed[source];
        }

        const hourMatch = String(source).match(/^q(\d+(?:\.\d+)?)h$/i);

        if (hourMatch && Number(hourMatch[1]) > 0) {
            return 24 / Number(hourMatch[1]);
        }

        const dayMatch = String(source).match(/^q(\d+(?:\.\d+)?)d$/i);

        if (dayMatch && Number(dayMatch[1]) > 0) {
            return 1 / Number(dayMatch[1]);
        }

        return null;
    }

    function claimWarningHeaderMap(root) {
        return Array.from(
            root.querySelectorAll('thead th,th,[role="columnheader"]')
        ).filter(isVisible).map(function (header) {
            const rect = header.getBoundingClientRect();

            return {
                element: header,
                text: plain(header.innerText || header.textContent),
                normalized: normalize(header.innerText || header.textContent),
                center: rect.left + rect.width / 2,
                area: rect.width * rect.height
            };
        }).filter(function (item) {
            return Boolean(item.normalized);
        });
    }

    function claimWarningFindHeader(headers, aliases) {
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

        candidates.sort(function (a, b) {
            return a.area - b.area;
        });

        return candidates[0] || null;
    }

    /*
     * v1.28.7：预警只能绑定“医嘱查询”表，绝不能把“药品录入”编辑表
     * 当成查询结果表。两张表共享名称、开始时间、规格、剂量、用法、频次、
     * 总量等大量表头，因此旧版仅按命中字段数量打分时会产生误识别。
     *
     * 医嘱查询页的稳定区分字段是“停止时间”：药品录入页没有该列。
     * 同时要求药品总量、医嘱类别、开始时间、名称、用法、频次均存在，
     * 并且根节点当前可见。这样即使隐藏的医嘱查询DOM仍留在页面中，
     * 切换到“药品录入”后也不会继续扫描或渲染。
     */
    function claimWarningIsStrictQueryContext(root, headers) {
        if (!root || !isVisible(root) || !Array.isArray(headers)) {
            return false;
        }

        const requiredHeaders = [
            ['医嘱类别', '长临'],
            ['开始时间', '开立时间'],
            ['医嘱名称', '药品名称'],
            ['用法', '给药途径'],
            ['频次', '频率'],
            ['停止时间', '停嘱时间', '结束时间'],
            ['药品总量', '总量']
        ];

        return requiredHeaders.every(function (aliases) {
            return Boolean(claimWarningFindHeader(headers, aliases));
        });
    }

    function claimWarningFindQueryContext() {
        const fieldAliases = [
            ['医嘱类别', '长临'],
            ['医嘱类型', '类型'],
            ['开始时间', '开立时间'],
            ['医嘱名称', '药品名称'],
            ['剂量', '每次剂量'],
            ['药品规格', '规格'],
            ['用法', '给药途径'],
            ['频次', '频率'],
            ['停止时间', '停嘱时间', '结束时间'],
            ['执行状态', '状态', '同步状态'],
            ['药品总量', '总量']
        ];
        const candidates = [];

        allDocuments().forEach(function (doc) {
            Array.from(
                doc.querySelectorAll(
                    'table,.layui-table-view,.datagrid,.datagrid-view,[role="grid"]'
                )
            ).filter(isVisible).filter(function (root) {
                return !root.closest('#' + IDS.modal) &&
                    !root.closest('#' + IDS.panel);
            }).forEach(function (root) {
                const headers = claimWarningHeaderMap(root);

                /*
                 * 先执行严格身份校验。未通过时直接排除，不再依靠分数竞争。
                 * 这正是防止“药品录入”页被误选中的关键。
                 */
                if (!claimWarningIsStrictQueryContext(root, headers)) {
                    return;
                }

                const hitCount = fieldAliases.reduce(function (count, aliases) {
                    return count + (claimWarningFindHeader(headers, aliases) ? 1 : 0);
                }, 0);
                const table = actualTable(root);
                const rows = tableRows(table);
                const rootText = normalize(root.innerText || root.textContent);
                let score = hitCount * 6000 + rows.length * 350;

                if (rootText.includes(normalize('医嘱查询'))) score += 2500;
                if (claimWarningFindHeader(headers, ['执行状态', '状态', '同步状态'])) {
                    score += 1000;
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

        candidates.sort(function (a, b) {
            return b.score - a.score;
        });

        return candidates[0] || null;
    }

    function claimWarningRowValue(context, row, aliases) {
        const header = claimWarningFindHeader(context.headers, aliases);

        if (!header) return '';

        const cells = rowCells(row);
        const covering = cells.filter(function (cell) {
            const rect = cell.getBoundingClientRect();
            return header.center >= rect.left - 3 &&
                header.center <= rect.right + 3;
        }).sort(function (a, b) {
            return a.getBoundingClientRect().width -
                b.getBoundingClientRect().width;
        });
        const cell = covering[0] || cells.map(function (candidate) {
            const rect = candidate.getBoundingClientRect();
            return {
                cell: candidate,
                distance: Math.abs(
                    rect.left + rect.width / 2 - header.center
                )
            };
        }).sort(function (a, b) {
            return a.distance - b.distance;
        })[0]?.cell;

        if (!cell) return '';

        const select = nativeSelect(cell);

        if (select) {
            const option = select.options && select.selectedIndex >= 0
                ? select.options[select.selectedIndex]
                : null;

            return plain(option
                ? option.textContent || option.value
                : select.value);
        }

        const input = visibleInput(cell);

        if (input) {
            return plain(input.isContentEditable
                ? input.textContent
                : input.value);
        }

        return plain(cell.innerText || cell.textContent);
    }


    function claimWarningRowCell(context, row, aliases) {
        if (!context || !row) return null;

        const header = claimWarningFindHeader(context.headers, aliases);

        if (!header) return null;

        const cells = rowCells(row);
        const covering = cells.filter(function (cell) {
            const rect = cell.getBoundingClientRect();

            return header.center >= rect.left - 3 &&
                header.center <= rect.right + 3;
        }).sort(function (a, b) {
            return a.getBoundingClientRect().width -
                b.getBoundingClientRect().width;
        });

        if (covering[0]) return covering[0];

        const nearest = cells.map(function (candidate) {
            const rect = candidate.getBoundingClientRect();

            return {
                cell: candidate,
                distance: Math.abs(
                    rect.left + rect.width / 2 - header.center
                )
            };
        }).sort(function (a, b) {
            return a.distance - b.distance;
        });

        return nearest[0] ? nearest[0].cell : null;
    }

    function claimWarningReadOrders(context) {
        return context.rows.map(function (row, index) {
            const rowText = plain(row.innerText || row.textContent);
            let rowColor = '';

            try {
                const win = row.ownerDocument.defaultView;
                const colorValues = [
                    String(win.getComputedStyle(row).color || '')
                ];
                const nameCell = claimWarningRowCell(
                    context,
                    row,
                    ['医嘱名称', '药品名称', '名称']
                );

                if (nameCell) {
                    colorValues.push(
                        String(win.getComputedStyle(nameCell).color || '')
                    );

                    const namedElement = Array.from(
                        nameCell.querySelectorAll('span,a,div')
                    ).filter(isVisible)[0] || null;

                    if (namedElement) {
                        colorValues.push(
                            String(win.getComputedStyle(namedElement).color || '')
                        );
                    }
                }

                rowColor = Array.from(new Set(colorValues.filter(Boolean)))
                    .join('|');
            }
            catch (error) {
                rowColor = '';
            }

            return {
                index: index,
                row: row,
                rowText: rowText,
                category: claimWarningRowValue(
                    context,
                    row,
                    ['医嘱类别', '长临', '长临嘱']
                ),
                orderType: claimWarningRowValue(
                    context,
                    row,
                    ['医嘱类型', '类型']
                ),
                startTimeText: claimWarningRowValue(
                    context,
                    row,
                    ['开始时间', '开立时间']
                ),
                name: claimWarningRowValue(
                    context,
                    row,
                    ['医嘱名称', '药品名称', '名称']
                ),
                doseText: claimWarningRowValue(
                    context,
                    row,
                    ['剂量', '每次剂量']
                ),
                specification: claimWarningRowValue(
                    context,
                    row,
                    ['药品规格', '规格']
                ),
                route: claimWarningRowValue(
                    context,
                    row,
                    ['用法', '给药途径']
                ),
                frequency: claimWarningRowValue(
                    context,
                    row,
                    ['频次', '频率']
                ),
                stopTimeText: claimWarningRowValue(
                    context,
                    row,
                    ['停止时间', '停嘱时间', '结束时间']
                ),
                statusText: claimWarningRowValue(
                    context,
                    row,
                    ['执行状态', '状态', '同步状态']
                ),
                totalText: claimWarningRowValue(
                    context,
                    row,
                    ['药品总量', '总量', '数量']
                ),
                rowColor: rowColor,
                invalid: /作废|取消|已撤销/.test(rowText) ||
                    /rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/i.test(rowColor)
            };
        }).filter(function (order) {
            return Boolean(order.name) && !order.invalid;
        }).map(function (order) {
            const now = new Date();
            order.startTime = claimWarningParseDate(order.startTimeText);
            order.stopTime = claimWarningParseDate(order.stopTimeText);
            order.stoppedByStopTime = Boolean(
                order.stopTime && order.stopTime.getTime() <= now.getTime()
            );
            order.stoppedByStatus = /停\s*止|停嘱/.test(order.statusText || '');
            order.stopped = order.stoppedByStopTime || order.stoppedByStatus;
            /*
             * v1.28.19：医嘱查询页底部图例中蓝色代表“执行长期/临时”，
             * 黑色代表“未执行”。部分版本“执行状态”列为空，因此同时读取
             * 行文字状态和医院原生行字体颜色。这里只用于重复长期医嘱提示，
             * 不参与库存计算或停嘱判断。
             */
            (function () {
                const status = plain(order.statusText || '');
                const colorSource = String(order.rowColor || '');
                const colorRegex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/ig;
                let colorMatched;
                let blueExecuting = false;

                while ((colorMatched = colorRegex.exec(colorSource))) {
                    const red = Number(colorMatched[1]);
                    const green = Number(colorMatched[2]);
                    const blue = Number(colorMatched[3]);

                    if (
                        Number.isFinite(blue) &&
                        blue >= 120 &&
                        blue >= red + 50 &&
                        blue >= green + 50
                    ) {
                        blueExecuting = true;
                        break;
                    }
                }

                order.executingByStatusText = Boolean(
                    status &&
                    /执行|有效|正常/.test(status) &&
                    !/未执行|待执行|未审核|作废|停止|停嘱/.test(status)
                );
                order.executingByRowColor = blueExecuting;
                order.isExecuting = !order.stopped && !order.invalid && (
                    order.executingByStatusText ||
                    order.executingByRowColor
                );
            })();
            order.stoppedDays = order.stopped && order.stopTime
                ? claimWarningStoppedDays(order.stopTime, now)
                : null;
            order.executionDays = order.stopped && order.stopTime
                ? claimWarningInclusiveDays(order.startTime, order.stopTime)
                : null;
            order.isDrug = /药品|西药/.test(order.orderType) ||
                Boolean(order.specification && order.doseText);
            order.isLong = /长/.test(order.category);
            order.isTemporary = /临|临时/.test(order.category);
            order.isClaim = /领药|\bly\b/i.test(order.route);
            order.routeScope = claimWarningRouteScopeKey(order.route);
            return order;
        });
    }

    function claimWarningDrugNameKey(value) {
        return normalize(value)
            .replace(/[()（）\[\]【】{}]/g, '')
            .replace(/注射液|注射用|片剂|胶囊剂|颗粒剂|口服液$/g, '');
    }

    function claimWarningSpecificationKey(value) {
        return normalize(value)
            .replace(/[()（）\[\]【】{}]/g, '')
            .replace(/[×xX]/g, '*');
    }

    /*
     * v1.28.14：
     * 临时“领药”经常和长期医嘱使用同一药品、同一单剂量规格，
     * 但包装数量不同，例如：
     *
     *   长期：甲钴胺片 0.5mg*20片
     *   临时：甲钴胺片 0.5mg*40S
     *
     * 旧版直接比较完整规格字符串，会把这两条判定为不同药品，
     * 导致新领的40S完全不进入库存时间线。
     *
     * 这里额外提取“去除包装数量后的规格主体”：
     *   0.5mg*20片  -> 0.5mg
     *   0.5mg*40S   -> 0.5mg
     *   30mg*7片/盒 -> 30mg
     *   5mg/片*30S  -> 5mg
     *   2ml:10mg*5支 -> 2ml:10mg
     *
     * 只有药名相同且规格主体也相同时，才允许跨包装数量匹配。
     * 因此0.5mg与1mg、5mg与10mg仍不会互相补偿。
     */
    function claimWarningSpecificationStrengthKey(value) {
        let source = claimWarningSpecificationKey(value)
            .replace(/\s+/g, '');

        if (!source) return '';

        const countPattern = claimWarningCountUnitPattern();
        const englishCountPattern = claimWarningEnglishCountSuffixPattern();
        const packagePattern = '(?:盒|瓶|包|板|袋|支|管|套)';

        /*
         * 去掉末尾包装数量：
         * 0.5mg*20片
         * 0.5mg*40S
         * 30mg*7片/盒
         * 2ml:10mg*5支
         */
        source = source.replace(
            new RegExp(
                '(?:\\*|装|每盒)?\\d+(?:\\.\\d+)?\\s*(?:' +
                    countPattern + '|' + englishCountPattern +
                ')(?:\\/' + packagePattern + ')?$',
                'i'
            ),
            ''
        );

        /*
         * 兼容5mg/片*30S、0.5mg/粒*20粒等写法。
         * 包装数量去除后，再把末尾“/片、/粒”等单位声明去掉。
         */
        source = source.replace(
            new RegExp('\\/(?:' + countPattern + ')$', 'i'),
            ''
        );

        return source
            .replace(/[*/:：\-]+$/g, '')
            .trim();
    }

    function claimWarningOrdersMatch(first, second) {
        if (
            claimWarningDrugNameKey(first.name) !==
            claimWarningDrugNameKey(second.name)
        ) {
            return false;
        }

        const firstSpec = claimWarningSpecificationKey(first.specification);
        const secondSpec = claimWarningSpecificationKey(second.specification);

        /*
         * 任一侧没有规格时沿用旧版宽松匹配；
         * 完整规格相同/互相包含时也直接匹配。
         */
        if (
            !firstSpec || !secondSpec ||
            firstSpec === secondSpec ||
            firstSpec.includes(secondSpec) ||
            secondSpec.includes(firstSpec)
        ) {
            return true;
        }

        /*
         * 完整规格不同，再比较去除包装数量后的规格主体。
         * 这一步专门解决“同一药物不同盒装数量”的领药补偿。
         */
        const firstStrength =
            claimWarningSpecificationStrengthKey(first.specification);
        const secondStrength =
            claimWarningSpecificationStrengthKey(second.specification);

        return Boolean(
            firstStrength &&
            secondStrength &&
            firstStrength === secondStrength
        );
    }


    /*
     * v1.28.20：同名固体药品允许临时供应补偿跨规格折算。
     *
     * 典型场景：
     *   长期：胞磷胆碱钠片 0.1g*12S，单次0.2g，tid
     *   临时：胞磷胆碱钠片 0.2g*12片，领药st，1盒
     *
     * 旧版因为0.1g与0.2g规格主体不同，整条临时领药不会进入库存时间线，
     * 即使患者实际上已经领到药，仍会继续显示“预计已用尽”并默认勾选，
     * 容易诱发再次重复领药。
     *
     * 新版只在以下条件同时成立时放宽规格匹配：
     * 1. 药品名称完全归一化一致；
     * 2. 两侧规格都包含明确的片/粒/丸/S/TAB/CAP等包装计数；
     * 3. 两侧规格都存在可换算到长期医嘱剂量单位的物质量；
     * 4. 临时医嘱包装容量能够按长期剂量单位可靠算出。
     *
     * 这样可以处理同一口服固体药换厂家/换强度后的真实库存，同时避免把
     * 浓度液体、注射液或无法可靠换算的复杂剂型静默合并。
     */
    function claimWarningSpecificationHasCountPackage(specification) {
        const source = plain(specification)
            .replace(/×/g, '*')
            .replace(/[Xx]/g, '*');

        if (!source) return false;

        const countPattern = claimWarningCountUnitPattern();
        const englishCountPattern = claimWarningEnglishCountSuffixPattern();

        return new RegExp(
            '(?:\\*|装|每)?\\s*\\d+(?:\\.\\d+)?\\s*(?:' +
                countPattern + '|' + englishCountPattern + ')',
            'i'
        ).test(source);
    }

    function claimWarningSpecificationHasCompatiblePhysicalAmount(
        specification,
        targetUnit
    ) {
        const source = plain(specification);
        const unit = plain(targetUnit);

        if (!source || !unit || claimWarningIsCountUnit(unit)) {
            return false;
        }

        const amountRegex = /(\d+(?:\.\d+)?)\s*(万单位|单位|μg|ug|mcg|mg|kg|g|ml|mL|L)/gi;
        let matched;

        while ((matched = amountRegex.exec(source))) {
            const converted = claimWarningConvertAmount(
                Number(matched[1]),
                matched[2],
                unit
            );

            if (
                converted !== null &&
                Number.isFinite(converted) &&
                converted > 0
            ) {
                return true;
            }
        }

        return false;
    }

    function claimWarningCrossSpecCompensationCompatible(
        longOrder,
        compensationOrder,
        doseUnit,
        doseValue
    ) {
        if (!longOrder || !compensationOrder) return false;

        if (
            claimWarningDrugNameKey(longOrder.name) !==
            claimWarningDrugNameKey(compensationOrder.name)
        ) {
            return false;
        }

        /* 已经属于同规格/同强度匹配时不标记为跨规格。 */
        if (claimWarningOrdersMatch(longOrder, compensationOrder)) {
            return false;
        }

        const targetUnit = plain(doseUnit);

        if (
            !targetUnit ||
            claimWarningIsCountUnit(targetUnit) ||
            !claimWarningSpecificationHasCountPackage(longOrder.specification) ||
            !claimWarningSpecificationHasCountPackage(compensationOrder.specification) ||
            !claimWarningSpecificationHasCompatiblePhysicalAmount(
                longOrder.specification,
                targetUnit
            ) ||
            !claimWarningSpecificationHasCompatiblePhysicalAmount(
                compensationOrder.specification,
                targetUnit
            )
        ) {
            return false;
        }

        const capacity = claimWarningSupplyCapacity(
            compensationOrder,
            targetUnit,
            doseValue
        );

        return Boolean(
            capacity &&
            Number.isFinite(Number(capacity.amount)) &&
            Number(capacity.amount) > 0
        );
    }

    function claimWarningCompensationOrdersMatch(
        longOrder,
        compensationOrder,
        doseUnit,
        doseValue
    ) {
        return claimWarningOrdersMatch(longOrder, compensationOrder) ||
            claimWarningCrossSpecCompensationCompatible(
                longOrder,
                compensationOrder,
                doseUnit,
                doseValue
            );
    }

    function claimWarningRound(value, digits) {
        const number = Number(value);

        if (!Number.isFinite(number)) return null;

        return Number(number.toFixed(
            Number.isInteger(digits) ? digits : 2
        ));
    }

    function claimWarningAnalyzeOrders(
        orders,
        selectThresholdDays,
        renderThresholdDays,
        longRouteScopes,
        compensationRouteScopes,
        showStoppedOrders
    ) {
        const selectThreshold = Math.max(
            0,
            Number(selectThresholdDays) || 0
        );
        const renderThreshold = Math.max(
            0,
            Number(renderThresholdDays) || 0
        );
        const longScopes = claimWarningNormalizeScopeList(
            longRouteScopes,
            ['oral']
        ).filter(function (key) {
            return key !== 'claim';
        });
        const compensationScopes = claimWarningNormalizeScopeList(
            compensationRouteScopes,
            ['claim']
        );
        const now = new Date();
        const includeStopped = Boolean(showStoppedOrders);
        const compensations = orders.filter(function (order) {
            return order.isDrug && order.startTime &&
                order.startTime.getTime() <= now.getTime() &&
                claimWarningTemporaryOrderInCompensationScope(
                    order,
                    compensationScopes
                );
        });
        /*
         * v1.28.6：活动长期医嘱分两条路径处理。
         *
         * 1. 普通长期药物仍沿用旧版“同药+规格+用法范围只保留最新一条”
         *    的库存预警逻辑，避免旧长期医嘱与新长期医嘱重复计算供应量。
         * 2. 注射/输液类长期液体不做同药去重。每一条活动长期液体都保留
         *    自己的row和开始时间，分别在原医嘱行渲染“已用X天”。
         *
         * 这样同一患者先后开立两条0.9%氯化钠注射液时，旧液体医嘱不会
         * 再被较新的同名医嘱覆盖。
         */
        const activeNonLiquidMap = new Map();
        const activeLiquidOrders = [];
        const duplicateExecutingOrders = [];

        function activeNonLiquidKey(order) {
            return claimWarningDrugNameKey(order.name) + '||' +
                claimWarningSpecificationKey(order.specification) + '||' +
                (order.routeScope || claimWarningRouteScopeKey(order.route));
        }

        orders.filter(function (order) {
            const stopped = Boolean(order.stopped);

            return order.isDrug && order.isLong &&
                claimWarningLongOrderInScope(order, longScopes) &&
                !stopped;
        }).forEach(function (order) {
            if (claimWarningIsLiquidOrder(order)) {
                activeLiquidOrders.push(order);
                return;
            }

            const key = activeNonLiquidKey(order);
            const old = activeNonLiquidMap.get(key);

            if (!old) {
                activeNonLiquidMap.set(key, order);
                return;
            }

            if (
                order.startTime &&
                (!old.startTime || order.startTime > old.startTime)
            ) {
                /*
                 * 最新一条继续沿用原有剩余天数算法和渲染；被替换下来的
                 * 旧长期医嘱若仍是医院页面“执行”状态，则只增加重复提示。
                 */
                if (old.isExecuting) {
                    duplicateExecutingOrders.push({
                        order: old,
                        newerOrder: order,
                        key: key
                    });
                }

                activeNonLiquidMap.set(key, order);
                return;
            }

            if (order.isExecuting) {
                duplicateExecutingOrders.push({
                    order: order,
                    newerOrder: old,
                    key: key
                });
            }
        });

        const activeLongOrders = Array.from(activeNonLiquidMap.values())
            .concat(activeLiquidOrders);

        const activeResults = activeLongOrders.map(function (longOrder, index) {
            const dose = claimWarningParseAmountUnit(longOrder.doseText);
            const frequencyPerDay = claimWarningFrequencyPerDay(
                longOrder.frequency
            );
            const matchedCompensations = compensations.filter(function (entry) {
                return claimWarningCompensationOrdersMatch(
                    longOrder,
                    entry,
                    dose ? dose.unit : '',
                    dose ? dose.value : ''
                ) &&
                    (!longOrder.startTime || entry.startTime >= longOrder.startTime);
            });
            const crossSpecCompensations = matchedCompensations.filter(
                function (entry) {
                    return claimWarningCrossSpecCompensationCompatible(
                        longOrder,
                        entry,
                        dose ? dose.unit : '',
                        dose ? dose.value : ''
                    );
                }
            );
            const notes = [];
            const supplyEntries = [longOrder].concat(matchedCompensations);
            /*
             * v1.28.13：保存每一次真实供应事件，用于按时间线计算当前库存。
             * 旧算法只计算“累计供应天数－从长期医嘱开始至今的总天数”，
             * 会在药物已经用尽后继续形成负库存；后续再次领药时，新领药会
             * 被错误用于偿还此前没有药可用期间的“理论欠量”。
             *
             * 新算法按“长期初始供应 → 每次临时补偿/领药 → 当前时间”逐段
             * 扣减库存，每一段库存最低只到0，不允许负数跨供应事件结转。
             *
             * v1.28.14同时允许同药、同单剂量规格但不同包装数量的临时领药
             * 参与补偿，例如0.5mg*20片与0.5mg*40S。
             */
            const supplyTimeline = [];
            let totalSupply = 0;
            let totalPackages = 0;
            let supplyFailed = false;

            if (!longOrder.startTime) {
                notes.push('未识别长期医嘱开始时间');
            }

            if (!dose || !dose.unit || dose.value <= 0) {
                notes.push('未识别有效的单次剂量及单位');
            }

            if (frequencyPerDay === null || frequencyPerDay <= 0) {
                notes.push('频次“' + (longOrder.frequency || '空') + '”无法换算为每日次数');
            }

            if (dose && dose.unit) {
                supplyEntries.forEach(function (entry) {
                    const capacity = claimWarningSupplyCapacity(
                        entry,
                        dose.unit,
                        dose.value
                    );

                    if (capacity.amount === null) {
                        supplyFailed = true;
                    }
                    else {
                        totalSupply += capacity.amount;
                        supplyTimeline.push({
                            time: entry === longOrder
                                ? longOrder.startTime
                                : entry.startTime,
                            amount: Number(capacity.amount) || 0,
                            entry: entry
                        });
                    }

                    totalPackages += Number(capacity.packageCount || 0);
                    notes.push.apply(notes, capacity.notes || []);
                });
            }
            else {
                supplyFailed = true;
            }

            const elapsedDays = longOrder.startTime
                ? Math.max(
                    0,
                    (now.getTime() - longOrder.startTime.getTime()) /
                        86400000
                )
                : null;
            const dailyAmount = dose && frequencyPerDay
                ? dose.value * frequencyPerDay
                : null;
            let remainingDays = null;
            let suppliedDays = null;
            let exhaustDate = null;

            if (
                !supplyFailed &&
                dailyAmount !== null &&
                dailyAmount > 0 &&
                elapsedDays !== null &&
                longOrder.startTime
            ) {
                /*
                 * “suppliedDays”继续表示累计发放总量理论可覆盖多少天，便于
                 * 保持原有界面字段和兼容性；“remainingDays”则改为真正的
                 * 时间线库存结果，不再简单用suppliedDays-elapsedDays。
                 */
                suppliedDays = totalSupply / dailyAmount;

                const validTimeline = supplyTimeline
                    .filter(function (event) {
                        return event &&
                            event.time instanceof Date &&
                            Number.isFinite(event.time.getTime()) &&
                            event.time.getTime() <= now.getTime() &&
                            Number(event.amount) > 0;
                    })
                    .sort(function (first, second) {
                        return first.time.getTime() - second.time.getTime();
                    });

                let stockAmount = 0;
                let lastTime = longOrder.startTime;

                validTimeline.forEach(function (event) {
                    const eventTime = event.time;

                    /*
                     * 先消耗上一供应事件至本次供应事件之间的理论用量。
                     * 核心修复：库存最低归零，绝不形成负库存债务。
                     */
                    if (lastTime && eventTime.getTime() > lastTime.getTime()) {
                        const intervalDays = Math.max(
                            0,
                            (eventTime.getTime() - lastTime.getTime()) /
                                86400000
                        );

                        stockAmount = Math.max(
                            0,
                            stockAmount - dailyAmount * intervalDays
                        );
                    }

                    stockAmount += Number(event.amount) || 0;

                    if (!lastTime || eventTime.getTime() > lastTime.getTime()) {
                        lastTime = eventTime;
                    }
                });

                /* 最后再扣除最近一次供应事件到当前时间的理论消耗。 */
                if (lastTime && now.getTime() > lastTime.getTime()) {
                    const finalIntervalDays = Math.max(
                        0,
                        (now.getTime() - lastTime.getTime()) / 86400000
                    );

                    stockAmount = Math.max(
                        0,
                        stockAmount - dailyAmount * finalIntervalDays
                    );
                }

                remainingDays = stockAmount / dailyAmount;
                exhaustDate = new Date(
                    now.getTime() + remainingDays * 86400000
                );

                if (matchedCompensations.length) {
                    notes.push(
                        '库存按供应事件时间线逐段计算；库存用尽后归零，不将无药期间形成负库存债务，新领药从实际领药时间重新补充库存'
                    );
                }
            }

            let status = 'unknown';
            let statusText = '无法估算';

            if (remainingDays !== null) {
                if (remainingDays <= 0) {
                    status = 'overdue';
                    statusText = '预计已用尽';
                }
                else if (remainingDays <= selectThreshold) {
                    status = 'warning';
                    statusText = '达到勾选阈值';
                }
                else if (remainingDays <= renderThreshold) {
                    status = 'soon';
                    statusText = '显示剩余天数';
                }
                else {
                    status = 'normal';
                    statusText = '库存尚可';
                }
            }

            const isLiquid = claimWarningIsLiquidOrder(longOrder);

            /*
             * 长期液体按“用法”列中的注射/输液类识别。此类长期医嘱通常
             * 按治疗过程持续执行，不进入领药报警、默认勾选和提取流程；
             * 前端仅显示自长期医嘱开始以来的已使用天数。
             */
            if (isLiquid) {
                status = 'liquid';
                statusText = '长期液体，仅统计已用天数';
            }

            const eligible = !isLiquid && (
                status === 'warning' || status === 'overdue'
            ) && Boolean(dose && dose.unit && dailyAmount > 0);
            const compensationScopesUsed = Array.from(new Set(
                matchedCompensations.map(function (entry) {
                    return entry.isClaim
                        ? 'claim'
                        : (entry.routeScope || claimWarningRouteScopeKey(entry.route));
                })
            ));
            if (crossSpecCompensations.length) {
                notes.push(
                    '已识别' + crossSpecCompensations.length +
                    '次同名药品异规格供应补偿；按临时医嘱实际包装总有效量折算到当前长期医嘱剂量单位，规格差异仍需人工核对'
                );
            }
            if (isLiquid) {
                notes.push('根据用法列识别为注射/输液类长期医嘱；不参与领药报警、默认勾选和领药提取，前端仅显示已使用天数');
            }

            if (
                matchedCompensations.some(function (entry) {
                    return !entry.isClaim;
                })
            ) {
                notes.push('已将所选临时用法医嘱计入供应量；请核对其是否确为补发/带药，而非单次实际给药');
            }

            return {
                id: 'claim-warning-' + index + '-' + Date.now(),
                name: longOrder.name,
                specification: longOrder.specification,
                doseValue: dose ? dose.value : '',
                doseUnit: dose ? dose.unit : '',
                doseText: longOrder.doseText,
                route: longOrder.route,
                routeScope: longOrder.routeScope,
                routeScopeLabel: claimWarningScopeLabel(longOrder.routeScope),
                frequency: normalizeFrequency(longOrder.frequency),
                startTime: longOrder.startTime,
                startTimeText: longOrder.startTimeText,
                initialTotalText: longOrder.totalText,
                compensationCount: matchedCompensations.length,
                compensationScopes: compensationScopesUsed,
                compensationScopeLabels: claimWarningScopeLabels(
                    compensationScopesUsed
                ),
                crossSpecCompensationCount: crossSpecCompensations.length,
                crossSpecCompensationDetails: crossSpecCompensations.map(
                    function (entry) {
                        return {
                            time: entry.startTime,
                            specification: entry.specification || '',
                            totalText: entry.totalText || '',
                            route: entry.route || '',
                            isClaim: Boolean(entry.isClaim),
                            order: entry
                        };
                    }
                ),
                /* 兼容旧版字段，避免其他逻辑或后续脚本接入时失效。 */
                claimCount: matchedCompensations.length,
                totalPackages: claimWarningRound(totalPackages, 2),
                totalSupply: claimWarningRound(totalSupply, 4),
                dailyAmount: claimWarningRound(dailyAmount, 4),
                elapsedDays: claimWarningRound(elapsedDays, 1),
                suppliedDays: claimWarningRound(suppliedDays, 1),
                remainingDays: claimWarningRound(remainingDays, 1),
                exhaustDate: exhaustDate,
                status: status,
                statusText: statusText,
                eligible: eligible,
                selected: eligible,
                claimQuantity: 1,
                isLiquid: isLiquid,
                notes: Array.from(new Set(notes.filter(Boolean))),
                longOrder: longOrder,
                matchedClaims: matchedCompensations,
                matchedCompensations: matchedCompensations
            };
        });

        /*
         * v1.28.19：重复长期药品仅对“旧的一条且仍处于执行状态”生成提示结果。
         * 最新一条仍由activeResults按原逻辑计算/渲染，不改变剩余天数。
         * 重复提示本身不参与库存供应、领药报警、默认勾选或领药提取。
         */
        const duplicateResults = duplicateExecutingOrders.map(function (entry, index) {
            const longOrder = entry.order;
            const newerOrder = entry.newerOrder;
            const dose = claimWarningParseAmountUnit(longOrder.doseText);

            return {
                id: 'claim-warning-duplicate-' + index + '-' + Date.now(),
                name: longOrder.name,
                specification: longOrder.specification,
                doseValue: dose ? dose.value : '',
                doseUnit: dose ? dose.unit : '',
                doseText: longOrder.doseText,
                route: longOrder.route,
                routeScope: longOrder.routeScope,
                routeScopeLabel: claimWarningScopeLabel(longOrder.routeScope),
                frequency: normalizeFrequency(longOrder.frequency),
                startTime: longOrder.startTime,
                startTimeText: longOrder.startTimeText,
                stopTime: null,
                stopTimeText: '',
                stopped: false,
                initialTotalText: longOrder.totalText,
                compensationCount: 0,
                compensationScopes: [],
                compensationScopeLabels: [],
                claimCount: 0,
                totalPackages: null,
                totalSupply: null,
                dailyAmount: null,
                elapsedDays: longOrder.startTime
                    ? claimWarningRound(
                        Math.max(0, (now.getTime() - longOrder.startTime.getTime()) / 86400000),
                        1
                    )
                    : null,
                suppliedDays: null,
                remainingDays: null,
                exhaustDate: null,
                status: 'duplicate',
                statusText: '存在重复',
                eligible: false,
                selected: false,
                claimQuantity: 1,
                isLiquid: false,
                isDuplicate: true,
                duplicateNewerStartTime: newerOrder && newerOrder.startTime
                    ? newerOrder.startTime
                    : null,
                notes: [
                    '检测到同药、同规格、同用法范围的更新长期医嘱；本条为较早且仍处于执行状态的长期医嘱，请核对是否需要停止旧医嘱',
                    '最新一条长期医嘱仍按原有规则计算和渲染剩余天数；本重复提示不参与库存或领药计算'
                ],
                longOrder: longOrder,
                newerOrder: newerOrder || null,
                matchedClaims: [],
                matchedCompensations: []
            };
        });

        const stoppedResults = includeStopped
            ? orders.filter(function (order) {
                return order.isDrug && order.isLong && order.stopped &&
                    claimWarningLongOrderInScope(order, longScopes);
            }).map(function (longOrder, index) {
                const dose = claimWarningParseAmountUnit(longOrder.doseText);
                const stoppedDays = Number.isFinite(longOrder.stoppedDays)
                    ? longOrder.stoppedDays
                    : null;
                const executionDays = Number.isFinite(longOrder.executionDays)
                    ? longOrder.executionDays
                    : null;
                const notes = [];

                if (!longOrder.stopTime) {
                    notes.push('医嘱状态显示已停止，但未识别停止时间；“已停X天”不使用开始时间代替');
                }
                else {
                    notes.push('已停天数严格按停止时间列计算，停止当天为0天');
                }

                if (executionDays !== null) {
                    notes.push('本次长期医嘱共执行' + executionDays + '天');
                }

                return {
                    id: 'claim-warning-stopped-' + index + '-' + Date.now(),
                    name: longOrder.name,
                    specification: longOrder.specification,
                    doseValue: dose ? dose.value : '',
                    doseUnit: dose ? dose.unit : '',
                    doseText: longOrder.doseText,
                    route: longOrder.route,
                    routeScope: longOrder.routeScope,
                    routeScopeLabel: claimWarningScopeLabel(longOrder.routeScope),
                    frequency: normalizeFrequency(longOrder.frequency),
                    startTime: longOrder.startTime,
                    startTimeText: longOrder.startTimeText,
                    stopTime: longOrder.stopTime,
                    stopTimeText: longOrder.stopTimeText,
                    stopped: true,
                    stoppedDays: stoppedDays,
                    executionDays: executionDays,
                    initialTotalText: longOrder.totalText,
                    compensationCount: 0,
                    compensationScopes: [],
                    compensationScopeLabels: [],
                    claimCount: 0,
                    totalPackages: null,
                    totalSupply: null,
                    dailyAmount: null,
                    elapsedDays: executionDays,
                    suppliedDays: null,
                    remainingDays: null,
                    exhaustDate: null,
                    status: 'stopped',
                    statusText: stoppedDays !== null
                        ? '已停止' + stoppedDays + '天' +
                            (executionDays !== null
                                ? '；本次医嘱共执行' + executionDays + '天'
                                : '')
                        : '已停止；未识别停止时间，无法计算已停天数',
                    eligible: false,
                    selected: false,
                    claimQuantity: 1,
                    isLiquid: claimWarningIsLiquidOrder(longOrder),
                    notes: notes,
                    longOrder: longOrder,
                    matchedClaims: [],
                    matchedCompensations: []
                };
            })
            : [];

        return activeResults.concat(duplicateResults, stoppedResults).sort(function (a, b) {
            if (Boolean(a.stopped) !== Boolean(b.stopped)) {
                return a.stopped ? 1 : -1;
            }

            if (a.stopped && b.stopped) {
                const firstStop = a.stopTime instanceof Date
                    ? a.stopTime.getTime()
                    : 0;
                const secondStop = b.stopTime instanceof Date
                    ? b.stopTime.getTime()
                    : 0;

                return secondStop - firstStop ||
                    String(a.name).localeCompare(String(b.name), 'zh-CN');
            }

            const first = a.remainingDays === null
                ? Number.POSITIVE_INFINITY
                : a.remainingDays;
            const second = b.remainingDays === null
                ? Number.POSITIVE_INFINITY
                : b.remainingDays;

            return first - second ||
                String(a.name).localeCompare(String(b.name), 'zh-CN');
        });
    }

    function claimWarningPageMeta(context, orderCount, config) {
        let totalPages = 1;
        let pageText = '';

        try {
            const bodyText = plain(
                context.doc.body.innerText || context.doc.body.textContent
            );
            const pageMatch = bodyText.match(/共\s*(\d+)\s*页/);

            if (pageMatch) {
                totalPages = Math.max(1, Number(pageMatch[1]) || 1);
                pageText = pageMatch[0];
            }
        }
        catch (error) {
            totalPages = 1;
        }

        const settings = config || {};

        return {
            scannedOrderCount: orderCount,
            totalPages: totalPages,
            pageText: pageText,
            scannedAt: new Date(),
            longRouteScopes: (settings.longRouteScopes || []).slice(),
            compensationRouteScopes: (
                settings.compensationRouteScopes || []
            ).slice(),
            renderLiquidEnabled: Boolean(settings.renderLiquidEnabled),
            showStoppedOrders: Boolean(settings.showStoppedOrders)
        };
    }

    function claimWarningRemainingText(result) {
        if (result.remainingDays === null) return '-';

        if (result.remainingDays <= 0) {
            return '0（预计已用尽' +
                Math.abs(result.remainingDays).toFixed(1) + '天）';
        }

        return result.remainingDays.toFixed(1) + '天';
    }

    function renderClaimWarning(modal) {
        const summary = modal.querySelector('.drug-claim-summary');
        const body = modal.querySelector('.drug-claim-result-body');

        if (!summary || !body) return;

        const results = state.claimWarningResults || [];
        const meta = state.claimWarningMeta;

        if (!results.length) {
            if (meta) {
                summary.innerHTML =
                    '<strong>扫描结果：</strong>未发现符合当前长期纳入范围的药物' +
                    '；长期范围：' + escapeHtml(
                        claimWarningScopeLabels(
                            meta.longRouteScopes
                        ).join('＋') || '未设置'
                    ) +
                    '；临时补偿：' + escapeHtml(
                        claimWarningScopeLabels(
                            meta.compensationRouteScopes
                        ).join('＋') || '未设置'
                    ) +
                    '；读取医嘱' + meta.scannedOrderCount + '条；扫描时间' +
                    escapeHtml(claimWarningFormatDateTime(meta.scannedAt));
            }
            else {
                summary.innerHTML = '<span class="drug-claim-empty">尚未扫描当前患者医嘱。</span>';
            }

            body.innerHTML = '';
            return;
        }

        const needCount = results.filter(function (item) {
            return item.status === 'warning' || item.status === 'overdue';
        }).length;
        const stoppedCount = results.filter(function (item) {
            return item.stopped || item.status === 'stopped';
        }).length;
        const liquidCount = results.filter(function (item) {
            return item.isLiquid && !item.stopped;
        }).length;
        const unknownCount = results.filter(function (item) {
            return item.status === 'unknown';
        }).length;
        const pageWarning = meta && meta.totalPages > 1
            ? '；当前查询共' + meta.totalPages + '页，本次只扫描当前已加载页面，请先切换为每页100条或逐页核对'
            : '';

        const scopeText = meta
            ? '；长期范围：' + escapeHtml(
                claimWarningScopeLabels(meta.longRouteScopes).join('＋') || '未设置'
            ) + '；临时补偿：' + escapeHtml(
                claimWarningScopeLabels(
                    meta.compensationRouteScopes
                ).join('＋') || '未设置'
            )
            : '';

        summary.innerHTML =
            '<strong>扫描结果：</strong>长期药物' + results.length +
            '项；需领药' + needCount + '种' +
            (stoppedCount ? '；已停医嘱' + stoppedCount + '条' : '') +
            (liquidCount ? '；长期液体' + liquidCount + '种（仅统计已用天数）' : '') +
            (unknownCount ? '；无法估算' + unknownCount + '种' : '') +
            scopeText +
            (meta
                ? '；读取医嘱' + meta.scannedOrderCount + '条；扫描时间' +
                    escapeHtml(claimWarningFormatDateTime(meta.scannedAt))
                : '') +
            escapeHtml(pageWarning);

        body.innerHTML = results.map(function (item, index) {
            const notes = item.notes.length
                ? item.notes.join('；')
                : '按当前可见医嘱估算';
            const compensationCount = Number(
                item.compensationCount !== undefined
                    ? item.compensationCount
                    : item.claimCount || 0
            );
            const compensationLabel = item.compensationScopeLabels &&
                item.compensationScopeLabels.length
                ? '：' + item.compensationScopeLabels.join('＋')
                : '';
            const supplyText = item.stopped
                ? '-'
                : (item.totalPackages !== null
                    ? item.totalPackages + '个包装（含' + compensationCount +
                        '次临时补偿' + compensationLabel + '）'
                    : '含' + compensationCount + '次临时补偿' +
                        compensationLabel);
            const stoppedLabel = item.stopped
                ? (Number.isFinite(item.stoppedDays)
                    ? '已停' + item.stoppedDays + '天'
                    : '已停时间未知')
                : '';

            return '<tr data-index="' + index + '" class="drug-claim-row drug-claim-' +
                escapeHtml(item.status) + '">' +
                '<td><input type="checkbox" class="drug-claim-select" ' +
                    (item.selected ? 'checked ' : '') +
                    (item.eligible ? '' : 'disabled ') + '></td>' +
                '<td>' + (index + 1) + '</td>' +
                '<td title="' + escapeHtml(item.name) + '">' +
                    escapeHtml(item.name) +
                    (item.isLiquid
                        ? '<span class="drug-claim-liquid-tag">液体</span>'
                        : '') +
                    (Number(item.crossSpecCompensationCount || 0) > 0
                        ? '<span class="drug-claim-cross-spec-tag">异规格补偿</span>'
                        : '') + '</td>' +
                '<td title="' + escapeHtml(item.specification || '') + '">' +
                    escapeHtml(item.specification || '-') + '</td>' +
                '<td>' + escapeHtml(item.doseText || '-') + '</td>' +
                '<td>' + escapeHtml(item.route || '-') + '</td>' +
                '<td>' + escapeHtml(item.frequency || '-') + '</td>' +
                '<td>' + escapeHtml(claimWarningFormatDate(item.startTime)) + '</td>' +
                '<td>' + escapeHtml(item.stopped
                    ? claimWarningFormatDate(item.stopTime)
                    : '-') + '</td>' +
                '<td>' + escapeHtml(supplyText) + '</td>' +
                '<td>' + (item.elapsedDays === null ? '-' : item.elapsedDays + '天') + '</td>' +
                '<td>' + (item.stopped
                    ? '<strong>' + escapeHtml(stoppedLabel) +
                        '</strong><div class="drug-claim-date">停止日期：' +
                        escapeHtml(claimWarningFormatDate(item.stopTime)) + '</div>'
                    : (item.status === 'duplicate' || item.isDuplicate
                        ? '<strong>存在重复</strong><div class="drug-claim-date">旧执行中长期医嘱，不参与库存估算</div>'
                        : (item.isLiquid
                            ? '<strong>不参与领药预警</strong><div class="drug-claim-date">前端显示：已用' +
                                escapeHtml(item.elapsedDays === null ? '未知' : item.elapsedDays + '天') + '</div>'
                            : '<strong>' + escapeHtml(claimWarningRemainingText(item)) +
                                '</strong><div class="drug-claim-date">预计用尽：' +
                                escapeHtml(claimWarningFormatDate(item.exhaustDate)) + '</div>'))) + '</td>' +
                '<td><span class="drug-claim-status" data-status="' +
                    escapeHtml(item.status) + '" title="' +
                    escapeHtml(item.statusText) + '">' +
                    (item.status === 'stopped'
                        ? '已停止<br>' + escapeHtml(stoppedLabel)
                        : (item.status === 'liquid'
                            ? '长期液体<br>仅统计已用天数'
                            : escapeHtml(item.statusText))) + '</span></td>' +
                '<td><input type="number" min="1" step="1" value="1" ' +
                    'class="drug-claim-quantity" ' +
                    (item.eligible ? '' : 'disabled ') + 'title="本次拟领药包装数"></td>' +
                '<td class="drug-claim-notes" title="' + escapeHtml(notes) + '">' +
                    escapeHtml(notes) + '</td>' +
                '</tr>';
        }).join('');
    }


    /******************************************************************
     * 长期药物医嘱查询前端预警渲染
     *
     * 不向医院医嘱数据写入任何值，只在“医嘱名称”单元格增加CSS标记。
     * 使用伪元素显示状态，避免把“剩余X天”或“已用X天”等文字混入
     * 表格innerText，从而影响后续药名匹配、扫描和医院页面自身的数据处理。
     ******************************************************************/

    const CLAIM_WARNING_FRONT_STATUSES = Object.freeze([
        'overdue',
        'warning',
        'soon',
        'unknown',
        'duplicate',
        'stopped'
    ]);

    function claimWarningFrontRenderEnabled() {
        return Boolean(
            GM_getValue(KEYS.claimWarningRenderEnabled, false)
        );
    }

    function claimWarningThresholdValue(value, fallback) {
        const number = Number(value);

        return Number.isFinite(number) && number >= 0
            ? number
            : fallback;
    }

    function claimWarningLegacyThresholdDays() {
        return claimWarningThresholdValue(
            GM_getValue(KEYS.claimWarningThresholdDays, 2),
            2
        );
    }

    function claimWarningRenderThresholdDays() {
        const stored = GM_getValue(
            KEYS.claimWarningRenderThresholdDays,
            null
        );

        if (stored !== null && stored !== undefined && stored !== '') {
            return claimWarningThresholdValue(stored, 7);
        }

        /*
         * 从旧版单阈值迁移时：勾选阈值沿用旧值；渲染阈值至少为7天，
         * 便于提前在医嘱界面看到剩余天数，但不会因此自动勾选领药。
         */
        return Math.max(7, claimWarningLegacyThresholdDays());
    }

    function claimWarningSelectThresholdDays() {
        const stored = GM_getValue(
            KEYS.claimWarningSelectThresholdDays,
            null
        );

        if (stored !== null && stored !== undefined && stored !== '') {
            return claimWarningThresholdValue(stored, 2);
        }

        return claimWarningLegacyThresholdDays();
    }

    function ensureClaimWarningFrontStyle(doc) {
        if (!doc || !doc.head || doc.getElementById(IDS.claimFrontStyle)) {
            return;
        }

        const style = doc.createElement('style');
        style.id = IDS.claimFrontStyle;
        style.textContent = `
.medical-drug-claim-front-cell{
  position:relative!important;
  padding-right:88px!important;
  transition:background-color .15s ease,box-shadow .15s ease;
}
.medical-drug-claim-front-cell::after{
  content:attr(data-medical-drug-claim-label);
  position:absolute;
  right:4px;
  top:50%;
  transform:translateY(-50%);
  z-index:6;
  min-width:66px;
  max-width:82px;
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
.medical-drug-claim-cross-spec-compensation-cell{
  position:relative!important;
  padding-right:88px!important;
  background:#eef8ff!important;
  box-shadow:inset 4px 0 0 #159bd3!important;
  transition:background-color .15s ease,box-shadow .15s ease;
}
.medical-drug-claim-cross-spec-compensation-cell::after{
  content:"异规格领药";
  position:absolute;
  right:4px;
  top:50%;
  transform:translateY(-50%);
  z-index:6;
  min-width:66px;
  max-width:82px;
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
  background:#dff3ff;
  color:#126a96;
  border:1px solid #8dcce8;
}
.medical-drug-claim-front-overdue{
  background:#fff0ef!important;
  box-shadow:inset 4px 0 0 #dc4c40!important;
}
.medical-drug-claim-front-overdue::after{
  background:#dc4c40;
  color:#fff;
}
.medical-drug-claim-front-warning{
  background:#fff8e8!important;
  box-shadow:inset 4px 0 0 #d97706!important;
}
.medical-drug-claim-front-warning::after{
  background:#d97706;
  color:#fff;
}
.medical-drug-claim-front-soon{
  background:#fffdf0!important;
  box-shadow:inset 4px 0 0 #d6a700!important;
}
.medical-drug-claim-front-soon::after{
  background:#fff1a8;
  color:#795b00;
  border:1px solid #e3c44d;
}
.medical-drug-claim-front-unknown{
  background:#f5f7f8!important;
  box-shadow:inset 4px 0 0 #8a949b!important;
}
.medical-drug-claim-front-unknown::after{
  background:#69747b;
  color:#fff;
}
.medical-drug-claim-front-duplicate{
  background:#fff3e8!important;
  box-shadow:inset 4px 0 0 #e56a19!important;
}
.medical-drug-claim-front-duplicate::after{
  background:#e56a19;
  color:#fff;
}
.medical-drug-claim-front-stopped{
  background:#f5f7f8!important;
  box-shadow:inset 4px 0 0 #8a949b!important;
}
.medical-drug-claim-front-stopped::after{
  background:#69747b;
  color:#fff;
}
.medical-drug-claim-front-liquid-used{
  background:#eef8ff!important;
  box-shadow:inset 4px 0 0 #159bd3!important;
}
.medical-drug-claim-front-liquid-used::after{
  background:#dff3ff;
  color:#126a96;
  border:1px solid #8dcce8;
}
`;
        doc.head.appendChild(style);
    }

    function claimWarningRememberRenderedCell(cell) {
        if (!cell) return;

        if (!(state.claimWarningRenderedCells instanceof Set)) {
            state.claimWarningRenderedCells = new Set();
        }

        state.claimWarningRenderedCells.add(cell);
    }

    function claimWarningRestoreFrontCell(cell) {
        if (!cell) return;

        const originalTitle = cell.getAttribute(
            'data-medical-drug-claim-original-title'
        );

        if (originalTitle === null || originalTitle === '__NONE__') {
            cell.removeAttribute('title');
        }
        else {
            cell.setAttribute('title', originalTitle);
        }

        cell.classList.remove(
            'medical-drug-claim-front-cell',
            'medical-drug-claim-front-overdue',
            'medical-drug-claim-front-warning',
            'medical-drug-claim-front-soon',
            'medical-drug-claim-front-unknown',
            'medical-drug-claim-front-duplicate',
            'medical-drug-claim-front-stopped',
            'medical-drug-claim-front-liquid-used',
            'medical-drug-claim-cross-spec-compensation-cell'
        );
        cell.removeAttribute('data-medical-drug-claim-label');
        cell.removeAttribute('data-medical-drug-claim-original-title');
    }

    /*
     * v1.26性能优化：正常重绘只清理本脚本上一次实际标记过的单元格，
     * 不再遍历全部document并querySelectorAll整张医院页面。fullSweep仅在
     * 首次关闭/异常恢复时使用，避免每次渲染都产生大范围DOM查询。
     */
    function clearClaimWarningFrontRender(fullSweep) {
        const cells = new Set();

        if (state.claimWarningRenderedCells instanceof Set) {
            state.claimWarningRenderedCells.forEach(function (cell) {
                if (cell) cells.add(cell);
            });
        }

        if (fullSweep) {
            allDocuments().forEach(function (doc) {
                Array.from(
                    doc.querySelectorAll(
                        '.medical-drug-claim-front-cell,' +
                        '.medical-drug-claim-cross-spec-compensation-cell'
                    )
                ).forEach(function (cell) {
                    cells.add(cell);
                });
            });
        }

        cells.forEach(claimWarningRestoreFrontCell);
        state.claimWarningRenderedCells = new Set();
    }

    function claimWarningFrontLabel(item) {
        if (!item) return '';

        if (item.stopped || item.status === 'stopped') {
            return Number.isFinite(item.stoppedDays)
                ? '已停' + item.stoppedDays + '天'
                : '已停时间未知';
        }

        if (item.isLiquid) {
            return item.elapsedDays === null
                ? '已用未知'
                : '已用' + claimWarningRound(item.elapsedDays, 1) + '天';
        }

        if (item.status === 'duplicate' || item.isDuplicate) {
            return '存在重复';
        }

        if (item.status === 'overdue') {
            return '预计已用尽';
        }

        if (item.status === 'unknown' || item.remainingDays === null) {
            return '无法估算';
        }

        const remaining = claimWarningRound(item.remainingDays, 1);

        if (item.status === 'warning') {
            return '剩' + remaining + '天';
        }

        if (item.status === 'soon') {
            return '临近 ' + remaining + '天';
        }

        return '';
    }

    function claimWarningFrontTitle(item) {
        if (!item) return '';

        if (item.stopped || item.status === 'stopped') {
            return [
                '已停止长期药物医嘱',
                Number.isFinite(item.stoppedDays)
                    ? '已停：' + item.stoppedDays + '天（停止当天为0天）'
                    : '已停天数：停止时间未知',
                item.stopTime
                    ? '停止时间：' + claimWarningFormatDateTime(item.stopTime)
                    : '',
                item.startTime
                    ? '开始时间：' + claimWarningFormatDateTime(item.startTime)
                    : '',
                Number.isFinite(item.executionDays)
                    ? '本次医嘱共执行：' + item.executionDays + '天'
                    : '',
                '已停天数严格依据“停止时间”列计算，不参与领药报警、默认勾选和领药提取'
            ].filter(Boolean).join('；');
        }

        if (item.isLiquid) {
            return [
                '长期液体用药时长',
                item.elapsedDays === null
                    ? '已使用天数：无法识别'
                    : '已使用：' + claimWarningRound(item.elapsedDays, 1) + '天',
                item.startTime
                    ? '开始日期：' + claimWarningFormatDateTime(item.startTime)
                    : '',
                '仅显示长期医嘱持续时间，不计算剩余库存，不参与领药报警、默认勾选和领药提取'
            ].filter(Boolean).join('；');
        }

        if (item.status === 'duplicate' || item.isDuplicate) {
            return [
                '存在重复长期药品医嘱',
                item.startTime
                    ? '当前旧医嘱开始：' + claimWarningFormatDateTime(item.startTime)
                    : '',
                item.duplicateNewerStartTime
                    ? '更新医嘱开始：' + claimWarningFormatDateTime(item.duplicateNewerStartTime)
                    : '',
                '当前较早医嘱仍处于医院页面“执行”状态，请核对是否漏停旧医嘱',
                '最新一条医嘱的剩余天数渲染保持原逻辑；本提示不参与库存、报警、默认勾选或领药提取'
            ].filter(Boolean).join('；');
        }

        const parts = [
            '长期药物预警：' + item.statusText,
            item.remainingDays === null
                ? '预计剩余：无法估算'
                : '预计剩余：' + claimWarningRemainingText(item),
            item.exhaustDate
                ? '预计用尽：' + claimWarningFormatDate(item.exhaustDate)
                : '',
            item.compensationCount
                ? '已识别临时供应补偿：' + item.compensationCount + '次' +
                    (item.compensationScopeLabels && item.compensationScopeLabels.length
                        ? '（' + item.compensationScopeLabels.join('＋') + '）'
                        : '')
                : '未识别到符合范围的临时供应补偿记录',
            Number(item.crossSpecCompensationCount || 0) > 0
                ? '其中异规格补偿：' + item.crossSpecCompensationCount + '次；长期规格：' +
                    (item.specification || '未识别') + '；临时规格：' +
                    (item.crossSpecCompensationDetails || []).map(function (detail) {
                        return detail.specification || '未识别';
                    }).filter(Boolean).join('、')
                : '',
            '结果为估算值，请核对药房实际发药、服药、停药和剂量调整记录'
        ].filter(Boolean);

        return parts.join('；');
    }

    function claimWarningFrontOrderMatchesResult(order, result) {
        if (!order || !result || !result.longOrder) return false;

        if (
            !order.isLong ||
            order.isClaim ||
            !claimWarningOrdersMatch(order, result.longOrder)
        ) {
            return false;
        }

        if (order.startTime && result.startTime) {
            return Math.abs(
                order.startTime.getTime() -
                result.startTime.getTime()
            ) <= 120000;
        }

        return true;
    }

    function claimWarningContextUsable(context) {
        if (
            !context ||
            !context.root || !context.root.isConnected ||
            !context.table || !context.table.isConnected ||
            !context.doc ||
            !isVisible(context.root)
        ) {
            return false;
        }

        const headers = Array.isArray(context.headers) && context.headers.length
            ? context.headers
            : claimWarningHeaderMap(context.root);

        return claimWarningIsStrictQueryContext(
            context.root,
            headers
        );
    }

    function claimWarningRefreshCachedContext(context) {
        if (!claimWarningContextUsable(context)) return null;

        context.rows = tableRows(context.table);

        /* 表头通常不会变化；只有原表头失效时才重新计算坐标。 */
        if (
            !Array.isArray(context.headers) ||
            !context.headers.length ||
            context.headers.some(function (item) {
                return !item.element || !item.element.isConnected;
            })
        ) {
            context.headers = claimWarningHeaderMap(context.root);
        }

        return context;
    }

    function renderClaimWarningFrontNow() {
        clearClaimWarningFrontRender(false);

        if (!claimWarningFrontRenderEnabled()) return;

        const renderLiquid = claimWarningRenderLiquidEnabled();
        const allResults = state.claimWarningResults || [];
        const results = allResults.filter(function (item) {
            if (item.stopped || item.status === 'stopped') return true;
            if (item.isLiquid) return renderLiquid;
            return CLAIM_WARNING_FRONT_STATUSES.includes(item.status);
        });
        const crossSpecClaimDetails = [];

        allResults.forEach(function (item) {
            (item.crossSpecCompensationDetails || []).forEach(function (detail) {
                if (
                    detail &&
                    detail.isClaim &&
                    detail.order &&
                    detail.order.isTemporary &&
                    detail.order.isClaim
                ) {
                    crossSpecClaimDetails.push({
                        result: item,
                        detail: detail,
                        order: detail.order
                    });
                }
            });
        });

        if (!results.length && !crossSpecClaimDetails.length) return;

        const context = claimWarningRefreshCachedContext(
            state.claimWarningContext
        );

        if (!context) {
            /*
             * 当前不在可见“医嘱查询”表时，只清除本脚本标记并等待真正
             * 回到医嘱查询页面；禁止把缓存结果投射到药品录入等编辑表。
             */
            state.claimWarningContext = null;
            state.claimWarningFrontSignature = '';
            state.claimWarningFrontDirty = true;
            disconnectClaimWarningContextObserver();
            return;
        }

        ensureClaimWarningFrontStyle(context.doc);

        let staleRowFound = false;

        /*
         * 直接复用本次扫描结果中保存的longOrder.row引用，不再为了渲染
         * 重新读取整张医嘱表、重新解析所有药品并执行O(结果数×行数)匹配。
         */
        results.forEach(function (result) {
            const order = result && result.longOrder;
            const row = order && order.row;

            if (!row || !row.isConnected) {
                staleRowFound = true;
                return;
            }

            const cell = claimWarningRowCell(
                context,
                row,
                ['医嘱名称', '药品名称', '名称']
            );

            if (!cell) {
                staleRowFound = true;
                return;
            }

            const label = claimWarningFrontLabel(result);
            if (!label) return;

            const oldTitle = cell.hasAttribute('title')
                ? cell.getAttribute('title')
                : '__NONE__';

            cell.setAttribute(
                'data-medical-drug-claim-original-title',
                oldTitle
            );
            cell.setAttribute('data-medical-drug-claim-label', label);
            cell.setAttribute('title', claimWarningFrontTitle(result));
            cell.classList.add(
                'medical-drug-claim-front-cell',
                result.stopped || result.status === 'stopped'
                    ? 'medical-drug-claim-front-stopped'
                    : (result.isLiquid
                        ? 'medical-drug-claim-front-liquid-used'
                        : 'medical-drug-claim-front-' + result.status)
            );
            claimWarningRememberRenderedCell(cell);
        });

        /*
         * v1.28.21：异规格提示不再占用长期医嘱的剩余天数标签区域。
         * 仅在真正参与跨规格库存补偿的“领药”临时医嘱名称单元格上
         * 标记“异规格领药”，让提示直接跟随产生这次补偿的源医嘱，
         * 并使用与其他长期药物预警一致的整格高亮、左侧色条和标准胶囊样式；长期医嘱仍只显示原有剩余天数/临近/用尽等标签。
         */
        const renderedCrossSpecRows = new Set();

        crossSpecClaimDetails.forEach(function (entry) {
            const sourceOrder = entry.order;
            const row = sourceOrder && sourceOrder.row;

            if (!row || !row.isConnected) {
                staleRowFound = true;
                return;
            }

            if (renderedCrossSpecRows.has(row)) return;
            renderedCrossSpecRows.add(row);

            const cell = claimWarningRowCell(
                context,
                row,
                ['医嘱名称', '药品名称', '名称']
            );

            if (!cell) {
                staleRowFound = true;
                return;
            }

            const result = entry.result || {};
            const detail = entry.detail || {};
            const oldTitle = cell.hasAttribute('title')
                ? cell.getAttribute('title')
                : '__NONE__';
            const titleParts = [
                '异规格领药补偿',
                '长期规格：' + (result.specification || '未识别'),
                '本次领药规格：' + (detail.specification || sourceOrder.specification || '未识别'),
                detail.totalText || sourceOrder.totalText
                    ? '本次领药总量：' + (detail.totalText || sourceOrder.totalText)
                    : '',
                '该临时领药已按实际总有效量折算到长期药物库存；规格差异请人工核对'
            ].filter(Boolean);

            cell.setAttribute(
                'data-medical-drug-claim-original-title',
                oldTitle
            );
            cell.setAttribute('title', titleParts.join('；'));
            cell.classList.add(
                'medical-drug-claim-cross-spec-compensation-cell'
            );
            claimWarningRememberRenderedCell(cell);
        });

        if (staleRowFound) {
            state.claimWarningFrontDirty = true;
            scheduleClaimWarningAutoScan(700);
        }
    }

    function scheduleClaimWarningFrontRender(delay) {
        clearTimeout(state.claimWarningFrontRenderTimer);

        state.claimWarningFrontRenderTimer = window.setTimeout(function () {
            state.claimWarningFrontRenderTimer = null;

            if (document.hidden) return;
            renderClaimWarningFrontNow();
        }, Math.max(0, Number(delay) || 0));
    }

    function claimWarningFrontContextSignature(context) {
        const refreshed = claimWarningRefreshCachedContext(context);
        if (!refreshed) return '';

        const renderThreshold = claimWarningRenderThresholdDays();
        const selectThreshold = claimWarningSelectThresholdDays();
        const longScopes = claimWarningLongRouteScopes();
        const compensationScopes = claimWarningCompensationRouteScopes();
        const renderLiquid = claimWarningRenderLiquidEnabled();
        const showStoppedOrders = claimWarningShowStoppedOrders();
        const raw = refreshed.rows.map(function (row) {
            return normalize(row.innerText || row.textContent);
        }).join('|') + '|' + renderThreshold + '|' + selectThreshold +
            '|' + longScopes.join(',') +
            '|' + compensationScopes.join(',') +
            '|' + String(renderLiquid) +
            '|' + String(showStoppedOrders);
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

    function disconnectClaimWarningContextObserver() {
        if (state.claimWarningContextObserver) {
            try {
                state.claimWarningContextObserver.disconnect();
            }
            catch (error) {
                // 忽略旧页面已销毁导致的断开异常。
            }
        }

        state.claimWarningContextObserver = null;
        state.claimWarningObservedRoot = null;
    }

    function scheduleClaimWarningAutoScan(delay) {
        clearTimeout(state.claimWarningAutoScanTimer);

        state.claimWarningAutoScanTimer = window.setTimeout(function () {
            state.claimWarningAutoScanTimer = null;

            if (
                document.hidden ||
                !claimWarningFrontRenderEnabled() ||
                state.running ||
                state.claimWarningScanBusy
            ) {
                return;
            }

            const context = claimWarningContextUsable(
                state.claimWarningContext
            )
                ? state.claimWarningContext
                : claimWarningFindQueryContext();

            if (!context) {
                state.claimWarningContext = null;
                state.claimWarningFrontSignature = '';
                clearClaimWarningFrontRender(false);
                return;
            }

            state.claimWarningContext = context;
            bindClaimWarningContextObserver(context);

            const signature = claimWarningFrontContextSignature(context);

            if (
                state.claimWarningFrontDirty ||
                signature !== state.claimWarningFrontSignature
            ) {
                scanClaimWarnings(createModal(), true);
            }
        }, Math.max(120, Number(delay) || 0));
    }

    function bindClaimWarningContextObserver(context) {
        if (!claimWarningContextUsable(context)) return;

        if (
            state.claimWarningObservedRoot === context.root &&
            state.claimWarningContextObserver
        ) {
            return;
        }

        disconnectClaimWarningContextObserver();

        const Observer = context.doc.defaultView.MutationObserver ||
            window.MutationObserver;

        if (!Observer) return;

        const observer = new Observer(function (mutations) {
            if (
                document.hidden ||
                !claimWarningFrontRenderEnabled() ||
                state.running ||
                state.claimWarningScanBusy
            ) {
                return;
            }

            const relevant = mutations.some(function (mutation) {
                return mutation.type === 'childList' ||
                    mutation.type === 'characterData';
            });

            if (!relevant) return;

            state.claimWarningFrontDirty = true;
            scheduleClaimWarningAutoScan(900);
        });

        observer.observe(context.root, {
            childList: true,
            characterData: true,
            subtree: true,
            attributes: false
        });

        state.claimWarningContextObserver = observer;
        state.claimWarningObservedRoot = context.root;
    }

    function startClaimWarningFrontWatcher() {
        if (state.claimWarningFrontWatcherTimer) return;

        if (!window.__medicalDrugClaimVisibilityBoundV1284) {
            window.__medicalDrugClaimVisibilityBoundV1284 = true;
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) return;

                /*
                 * v1.28.4：切回HIS标签页本身不再作为长期药物扫描触发器。
                 * 仅恢复已有预警标记；如后台期间表格确实改变，现有
                 * MutationObserver/12秒低频兜底可按需静默补扫。
                 */
                state.claimWarningForegroundQuietUntil =
                    Date.now() + 14000;

                if (claimWarningFrontRenderEnabled()) {
                    state.claimWarningFrontDirty = true;

                    if (state.claimWarningResults.length) {
                        scheduleClaimWarningFrontRender(120);
                    }
                }
            });
        }

        /*
         * 旧版每3.2秒全页找表、计算全行签名，并在未变化时仍清空后重绘。
         * v1.26改为MutationObserver触发，12秒定时器仅作页面框架漏报兜底。
         */
        state.claimWarningFrontWatcherTimer = window.setInterval(function () {
            if (document.hidden) return;

            if (!claimWarningFrontRenderEnabled()) {
                state.claimWarningFrontSignature = '';
                state.claimWarningFrontDirty = true;
                state.claimWarningContext = null;
                disconnectClaimWarningContextObserver();

                if (
                    state.claimWarningRenderedCells instanceof Set &&
                    state.claimWarningRenderedCells.size
                ) {
                    clearClaimWarningFrontRender(false);
                }
                return;
            }

            if (state.running || state.claimWarningScanBusy) return;

            let context = claimWarningContextUsable(
                state.claimWarningContext
            )
                ? state.claimWarningContext
                : null;

            if (!context) {
                context = claimWarningFindQueryContext();
                state.claimWarningContext = context || null;
                state.claimWarningFrontDirty = true;
            }

            if (!context) {
                state.claimWarningFrontSignature = '';
                clearClaimWarningFrontRender(false);
                disconnectClaimWarningContextObserver();
                return;
            }

            bindClaimWarningContextObserver(context);

            const signature = claimWarningFrontContextSignature(context);

            if (signature !== state.claimWarningFrontSignature) {
                state.claimWarningFrontDirty = true;
                scheduleClaimWarningAutoScan(200);
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

    async function scanClaimWarnings(modal, silent) {
        /*
         * 多个开关或页面事件可能在短时间内同时请求静默扫描。
         * 若2秒内已完成扫描且表格未被标记为变化，直接复用结果，
         * 避免自动扫描与前端渲染同时开启时发生重复全表解析。
         */
        if (
            silent &&
            !state.claimWarningFrontDirty &&
            Date.now() - Number(state.claimWarningLastScanAt || 0) < 2000
        ) {
            scheduleClaimWarningFrontRender(30);
            return;
        }

        if (state.running || state.claimWarningScanBusy) {
            if (!silent) {
                suiteWarningScanNotify(
                    'drug',
                    '当前已有任务正在执行，请稍后再扫描长期药物预警。',
                    'warning'
                );
            }
            return;
        }

        const scanButton = modal.querySelector('.drug-claim-scan');
        const renderThresholdInput = modal.querySelector(
            '.drug-claim-render-threshold'
        );
        const selectThresholdInput = modal.querySelector(
            '.drug-claim-select-threshold'
        );
        const renderThreshold = claimWarningThresholdValue(
            renderThresholdInput
                ? renderThresholdInput.value
                : claimWarningRenderThresholdDays(),
            7
        );
        const selectThreshold = claimWarningThresholdValue(
            selectThresholdInput
                ? selectThresholdInput.value
                : claimWarningSelectThresholdDays(),
            2
        );
        const longRouteScopes = claimWarningModalScopes(
            modal,
            '.drug-claim-long-route',
            claimWarningLongRouteScopes()
        );
        const compensationRouteScopes = claimWarningModalScopes(
            modal,
            '.drug-claim-compensation-route',
            claimWarningCompensationRouteScopes()
        );
        const showStoppedInput = modal.querySelector(
            '.drug-claim-show-stopped'
        );
        const showStoppedOrders = showStoppedInput
            ? Boolean(showStoppedInput.checked)
            : claimWarningShowStoppedOrders();
        /*
         * 长期液体已使用天数渲染自v1.24起固定开启，不再读取独立勾选框。
         */
        const renderLiquidEnabled = true;

        state.claimWarningScanBusy = true;

        if (scanButton) {
            scanButton.disabled = true;
            scanButton.textContent = '正在扫描……';
        }

        try {
            const context = claimWarningFindQueryContext();

            if (!context) {
                throw new Error(
                    '未识别到“医嘱查询”列表。请先进入当前患者的医嘱查询页，选择“全部医嘱”，并确保长期及临时医嘱均已显示。'
                );
            }

            state.claimWarningContext = context;
            bindClaimWarningContextObserver(context);

            const orders = claimWarningReadOrders(context);

            if (!orders.length) {
                throw new Error('医嘱查询列表中未读取到有效医嘱。');
            }

            state.claimWarningResults = claimWarningAnalyzeOrders(
                orders,
                selectThreshold,
                renderThreshold,
                longRouteScopes,
                compensationRouteScopes,
                showStoppedOrders
            );
            state.claimWarningMeta = claimWarningPageMeta(
                context,
                orders.length,
                {
                    longRouteScopes: longRouteScopes,
                    compensationRouteScopes: compensationRouteScopes,
                    renderLiquidEnabled: renderLiquidEnabled,
                    showStoppedOrders: showStoppedOrders
                }
            );
            state.claimWarningFrontSignature =
                claimWarningFrontContextSignature(context);
            state.claimWarningFrontDirty = false;
            state.claimWarningLastScanAt = Date.now();
            renderClaimWarning(modal);
            setSectionCollapsedByKey(modal, 'claim-warning', false, true);

            if (claimWarningFrontRenderEnabled()) {
                scheduleClaimWarningFrontRender(60);
            }
            else {
                clearClaimWarningFrontRender(false);
            }

            const needCount = state.claimWarningResults.filter(function (item) {
                return item.status === 'warning' || item.status === 'overdue';
            }).length;
            const stoppedCount = state.claimWarningResults.filter(function (item) {
                return item.stopped || item.status === 'stopped';
            }).length;

            const suppressForegroundAutoToast =
                silent &&
                Date.now() < Number(
                    state.claimWarningForegroundQuietUntil || 0
                );

            if (
                (!silent || needCount) &&
                !suppressForegroundAutoToast
            ) {
                suiteWarningScanNotify(
                    'drug',
                    '长期药物预警扫描完成：识别长期药物' +
                    state.claimWarningResults.length + '种，' +
                    (needCount
                        ? '其中' + needCount + '种达到勾选阈值。'
                        : '当前没有药品达到勾选阈值。') +
                    (stoppedCount
                        ? '\n另显示已停长期医嘱' + stoppedCount + '条；已停天数按停止时间列计算。'
                        : '') +
                    '\n剩余天数为估算值，请核对药房发药、实际服药、停药和剂量调整记录。',
                    needCount ? 'warning' : 'success'
                );
            }
        }
        catch (error) {
            state.claimWarningResults = [];
            state.claimWarningMeta = null;
            renderClaimWarning(modal);
            clearClaimWarningFrontRender(false);

            if (!silent) {
                suiteWarningScanNotify(
                    'drug',
                    error.message,
                    'error'
                );
            }
            else {
                console.warn('[长期药物预警] 自动扫描失败：', error);
            }
        }
        finally {
            state.claimWarningScanBusy = false;

            if (scanButton) {
                scanButton.disabled = false;
                scanButton.textContent = '扫描当前所有医嘱';
            }
        }
    }

    function extractClaimWarningsToDrugList(modal) {
        const rows = Array.from(
            modal.querySelectorAll('.drug-claim-result-body tr')
        );
        const selected = [];

        rows.forEach(function (row) {
            const checkbox = row.querySelector('.drug-claim-select');

            if (!checkbox || !checkbox.checked || checkbox.disabled) return;

            const index = Number(row.dataset.index);
            const source = state.claimWarningResults[index];
            const quantityInput = row.querySelector('.drug-claim-quantity');
            const quantity = Math.max(
                1,
                Math.floor(Number(quantityInput ? quantityInput.value : 1) || 1)
            );

            if (!source) return;

            selected.push({
                source: source,
                quantity: quantity
            });
        });

        if (!selected.length) {
            showStatus('没有勾选可提取的长期药物预警药品。', 'warning');
            return;
        }

        if (!window.confirm(
            '将把' + selected.length +
            '种药品提取到下方药品录入结果中，统一设置为“临时医嘱＋领药＋st”。\n\n' +
            '剩余天数和领药数量均需人工核对，是否继续？'
        )) {
            return;
        }

        const currentItems = readTable(modal).filter(function (item) {
            return item.sourceType !== 'claim-warning';
        });
        const claimItems = selected.map(function (entry) {
            const item = entry.source;
            const remainingText = item.remainingDays === null
                ? '无法估算'
                : claimWarningRemainingText(item);
            const warningList = [
                '长期药物预警估算剩余：' + remainingText,
                '本次拟领药：' + entry.quantity + '个包装',
                '请核对药房实际发药、患者实际服药、停药、漏服及剂量调整记录'
            ].concat(item.notes || []);

            return {
                enabled: true,
                sourceName: item.name,
                standardName: item.name,
                specificationHint: item.specification || '',
                orderType: '临',
                groupNo: '',
                doseValue: item.doseValue,
                doseUnit: item.doseUnit,
                route: '领药',
                frequency: 'st',
                days: '',
                indication: '长期医嘱起始：' +
                    claimWarningFormatDateTime(item.startTime) +
                    '；预计剩余：' + remainingText +
                    '；已识别临时供应补偿' +
                    Number(item.compensationCount || item.claimCount || 0) +
                    '次',
                rationale: '根据当前医嘱查询页估算',
                warnings: Array.from(new Set(warningList.filter(Boolean))),
                confidence: '',
                sourceType: 'claim-warning',
                claimQuantity: entry.quantity,
                claimRemainingDays: item.remainingDays,
                status: '长期药物预警已提取，待人工核对'
            };
        });

        state.items = currentItems.concat(claimItems);
        state.assessment = null;
        state.assessmentSuppressed = false;

        const medicineText = modal.querySelector('.drug-medicine-text');
        const claimLines = claimItems.map(function (item) {
            return [
                '临',
                item.sourceName,
                String(item.doseValue) + item.doseUnit,
                '领药',
                'st'
            ].join(' ');
        }).join('\n');
        const oldText = medicineText.value.trim();

        medicineText.value = oldText
            ? oldText + '\n' + claimLines
            : claimLines;
        GM_setValue(KEYS.medicineDraft, medicineText.value);

        const riskAck = modal.querySelector('.drug-risk-ack');
        if (riskAck) riskAck.checked = false;

        renderTable(modal);
        renderAssessment(modal, localAudit(state.items));
        setSectionCollapsedByKey(modal, 'results', false, true);
        setSectionCollapsedByKey(modal, 'medicines', false, true);

        showStatus(
            '已提取' + claimItems.length +
            '种需领药药品。请在药品结果表逐条核对后，再勾选人工确认并执行自动录入。',
            'success'
        );
    }


    /******************************************************************
     * 操作界面各板块：折叠、展开、清空及状态记忆
     ******************************************************************/

    function getSectionCollapsedMap() {
        const saved = GM_getValue(KEYS.sectionCollapsed, {});

        return saved && typeof saved === 'object' && !Array.isArray(saved)
            ? saved
            : {};
    }

    function setSectionCollapsed(section, collapsed, save) {
        if (!section) {
            return;
        }

        const value = Boolean(collapsed);
        const toggle = section.querySelector('.drug-section-toggle');

        section.dataset.collapsed = value ? 'true' : 'false';

        if (toggle) {
            toggle.textContent = value ? '展开' : '折叠';
            toggle.setAttribute('aria-expanded', value ? 'false' : 'true');
        }

        if (save !== false) {
            const key = section.dataset.sectionKey;

            if (key) {
                const map = getSectionCollapsedMap();
                map[key] = value;
                GM_setValue(KEYS.sectionCollapsed, map);
            }
        }
    }

    function setSectionCollapsedByKey(modal, key, collapsed, save) {
        const section = modal.querySelector(
            '.drug-collapsible-section[data-section-key="' + key + '"]'
        );

        setSectionCollapsed(section, collapsed, save);
    }

    function confirmClear(message) {
        return window.confirm(message + '\n\n此操作只清空脚本面板中的对应内容，不会删除医院系统中已经录入的医嘱。');
    }

    function clearSectionData(modal, target) {
        if (state.running) {
            showStatus('当前有任务正在执行，请先暂停或中止任务后再清空板块。', 'warning');
            return;
        }

        const apiKey = modal.querySelector('.drug-api-key');
        const model = modal.querySelector('.drug-model');
        const guideQuery = modal.querySelector('.drug-guide-query');
        const clinicalQuery = modal.querySelector('.drug-clinical-query');
        const patient = modal.querySelector('.drug-patient-text');
        const medicines = modal.querySelector('.drug-medicine-text');
        const riskAck = modal.querySelector('.drug-risk-ack');

        if (target === 'config') {
            if (!confirmClear('确认清空DeepSeek API Key和模型设置吗？')) {
                return;
            }

            apiKey.value = '';
            model.value = DEFAULT_MODEL;
            GM_setValue(KEYS.apiKey, '');
            GM_setValue(KEYS.model, DEFAULT_MODEL);
            showStatus('接口设置已清空，模型恢复为' + DEFAULT_MODEL + '。', 'success');
            return;
        }

        if (target === 'guide') {
            guideQuery.value = '';
            state.drugGuide = null;
            GM_setValue(KEYS.guideQuery, '');
            renderDrugGuide(modal);
            showStatus('药品说明书查询内容和结果已清空。', 'success');
            return;
        }

        if (target === 'patient') {
            if (patient.value && !confirmClear('确认清空患者基本信息吗？')) {
                return;
            }

            patient.value = '';
            GM_setValue(KEYS.patientDraft, '');
            showStatus('患者基本信息已清空。', 'success');
            return;
        }

        if (target === 'medicines') {
            if ((medicines.value || state.items.length) &&
                !confirmClear('确认清空开药文本、解析结果和用药合理性结果吗？')) {
                return;
            }

            medicines.value = '';
            state.items = [];
            state.assessment = null;
            state.assessmentSuppressed = false;
            GM_setValue(KEYS.medicineDraft, '');
            if (riskAck) riskAck.checked = false;
            renderTable(modal);
            renderAssessment(modal, []);
            showStatus('开药文本、解析结果和合理性结果已清空。', 'success');
            return;
        }

        if (target === 'clinical') {
            clinicalQuery.value = '';
            state.clinicalGuideline = null;
            GM_setValue(KEYS.clinicalQuery, '');
            renderClinicalGuideline(modal);
            showStatus('临床指南查询内容和诊疗建议已清空。', 'success');
            return;
        }

        if (target === 'assessment') {
            state.assessment = null;
            state.assessmentSuppressed = true;
            const box = modal.querySelector('.drug-assessment-box');
            const content = modal.querySelector('.drug-assessment-content');
            if (content) content.innerHTML = '';
            if (box) box.style.display = 'none';
            showStatus('用药合理性辅助判断结果已清空。再次解析或AI分析时会重新生成。', 'success');
            return;
        }

        if (target === 'results') {
            if (state.items.length && !confirmClear('确认清空药品解析及候选结果吗？')) {
                return;
            }

            state.items = [];
            state.assessment = null;
            state.assessmentSuppressed = false;
            if (riskAck) riskAck.checked = false;
            renderTable(modal);
            renderAssessment(modal, []);
            showStatus('药品解析及候选结果已清空。', 'success');
        }
    }

    function initializeSectionControls(modal) {
        const collapsedMap = getSectionCollapsedMap();
        const sections = Array.from(
            modal.querySelectorAll('.drug-collapsible-section')
        );

        sections.forEach(function (section) {
            const key = section.dataset.sectionKey || '';
            const defaultCollapsed = section.dataset.defaultCollapsed === 'true';
            const collapsed = Object.prototype.hasOwnProperty.call(collapsedMap, key)
                ? Boolean(collapsedMap[key])
                : defaultCollapsed;

            setSectionCollapsed(section, collapsed, false);
        });

        modal.addEventListener('click', function (event) {
            const toggle = event.target.closest('.drug-section-toggle');

            if (toggle) {
                const section = toggle.closest('.drug-collapsible-section');
                const collapsed = section.dataset.collapsed !== 'true';
                setSectionCollapsed(section, collapsed, true);
                return;
            }

            const clear = event.target.closest('.drug-section-clear');

            if (clear) {
                clearSectionData(modal, clear.dataset.clearTarget || '');
                return;
            }

            if (event.target.closest('.drug-collapse-all')) {
                sections.forEach(function (section) {
                    setSectionCollapsed(section, true, true);
                });
                return;
            }

            if (event.target.closest('.drug-expand-all')) {
                sections.forEach(function (section) {
                    setSectionCollapsed(section, false, true);
                });
            }
        });
    }

    function ensureStyle() {
        if (document.getElementById(IDS.style)) return;
        const style = document.createElement('style');
        style.id = IDS.style;
        style.textContent = `
#${IDS.modal}{position:fixed;inset:0;z-index:2147483647;display:none;font-family:"Microsoft YaHei",Arial,sans-serif;color:#333;}
#${IDS.modal}.show{display:block;}
#${IDS.modal} .drug-mask{position:absolute;inset:0;background:rgba(0,0,0,.42);}
#${IDS.modal} .drug-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:1380px;max-width:calc(100vw - 22px);max-height:calc(100vh - 24px);background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 12px 38px rgba(0,0,0,.35);}
#${IDS.modal} .drug-header{display:flex;align-items:center;justify-content:space-between;padding:13px 17px;background:${MODAL_HEADER_COLOR};color:#fff;font-size:16px;font-weight:bold;}
#${IDS.modal} .drug-close{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer;}
#${IDS.modal} .drug-body{padding:13px 15px;max-height:calc(100vh - 145px);overflow:auto;}
#${IDS.modal} .drug-top-toolbar{display:flex;justify-content:flex-end;gap:7px;margin-bottom:9px;position:sticky;top:0;z-index:8;padding:5px 0;background:rgba(255,255,255,.96);}
#${IDS.modal} .drug-top-toolbar button{height:29px;padding:0 11px;border:1px solid ${STYLE.secondaryBorderColor};border-radius:4px;background:${STYLE.secondaryBackground};color:${STYLE.secondaryTextColor};cursor:pointer;font-size:12px;}
#${IDS.modal} .drug-collapsible-section{margin:10px 0;border:1px solid #bfdce9;border-radius:6px;background:#fff;overflow:hidden;}
#${IDS.modal} .drug-text-grid .drug-collapsible-section{margin:0;min-width:0;}
#${IDS.modal} .drug-section-header{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:35px;padding:0 8px 0 11px;background:#eef8fc;border-bottom:1px solid #d8eaf1;font-weight:bold;font-size:13px;}
#${IDS.modal} .drug-section-heading{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#${IDS.modal} .drug-section-controls{display:flex;align-items:center;gap:6px;flex:none;}
#${IDS.modal} .drug-section-controls button{height:25px;padding:0 8px;border:1px solid ${STYLE.secondaryBorderColor};border-radius:4px;background:#fff;color:${STYLE.secondaryTextColor};cursor:pointer;font-size:12px;font-weight:normal;}
#${IDS.modal} .drug-section-controls button:hover,#${IDS.modal} .drug-top-toolbar button:hover{background:${STYLE.secondaryHoverBackground};}
#${IDS.modal} .drug-section-body{display:block;}
#${IDS.modal} .drug-collapsible-section[data-collapsed="true"]>.drug-section-body{display:none!important;}
#${IDS.modal} .drug-config-body,#${IDS.modal} .drug-field-body,#${IDS.modal} .drug-safety-body,#${IDS.modal} .drug-option-body,#${IDS.modal} .drug-action-body{padding:10px;}
#${IDS.modal} .drug-config-body .drug-config-grid{margin-bottom:0;}
#${IDS.modal} .drug-config-grid{display:grid;grid-template-columns:1.2fr .7fr;gap:10px;margin-bottom:10px;}
#${IDS.modal} .drug-text-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
#${IDS.modal} .drug-guide-box{background:#f8fcfe;}
#${IDS.modal} .drug-guide-title{padding:8px 11px;background:#eef8fc;font-weight:bold;font-size:13px;}
#${IDS.modal} .drug-guide-search-row{position:relative;display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;align-items:center;}
#${IDS.modal} .drug-guide-search-row>button{height:32px;padding:0 14px;border:1px solid ${STYLE.primaryColor};border-radius:4px;background:${STYLE.primaryColor};color:#fff;cursor:pointer;}
#${IDS.modal} .drug-guide-query{display:block;width:100%;min-width:0;height:32px;padding:0 9px;line-height:32px;}
#${IDS.modal} .drug-guide-query::-webkit-calendar-picker-indicator{opacity:0;cursor:pointer;transition:opacity .12s ease;transform:translateY(-9px);}
#${IDS.modal} .drug-guide-query:hover::-webkit-calendar-picker-indicator,
#${IDS.modal} .drug-guide-query:focus::-webkit-calendar-picker-indicator,
#${IDS.modal} .drug-guide-query:active::-webkit-calendar-picker-indicator{opacity:1;}
#${IDS.modal} .drug-guide-result{display:none;margin:0 10px 10px;padding:9px 10px;border:1px solid #d7e8ef;border-radius:5px;background:#fff;font-size:12px;line-height:1.65;max-height:390px;overflow:auto;}
#${IDS.modal} .drug-guide-main{padding:8px 9px;margin-bottom:8px;background:#f2faff;border-left:4px solid ${STYLE.primaryColor};border-radius:4px;}
#${IDS.modal} .drug-guide-regimen-title{font-weight:bold;margin:8px 0 5px;}
#${IDS.modal} .drug-guide-regimen{position:relative;padding:8px 10px 43px;margin:7px 0;border:1px solid #dfe8ec;border-radius:5px;background:#fff;}
#${IDS.modal} .drug-guide-regimen .drug-guide-use{position:absolute;right:9px;bottom:8px;height:28px;padding:0 10px;border:1px solid ${STYLE.primaryColor};border-radius:4px;background:${STYLE.primaryColor};color:#fff;cursor:pointer;}
#${IDS.modal} .drug-guide-regimen .drug-guide-use:disabled{background:#e5e7eb;border-color:#d1d5db;color:#6b7280;cursor:not-allowed;}
#${IDS.modal} .drug-guide-caution{color:#795b00;}
#${IDS.modal} .drug-guide-section{padding:6px 2px;border-top:1px dashed #e3e8eb;}
#${IDS.modal} .drug-guide-section ul{margin:4px 0 0 18px;padding:0;}
#${IDS.modal} .drug-guide-verification{padding:7px 8px;margin-top:8px;background:#fff8e8;color:#795b00;border-radius:4px;}
#${IDS.modal} .drug-guide-empty{padding:8px;color:#6b7280;}
#${IDS.modal} .drug-clinical-box{background:#f8fcfe;}
#${IDS.modal} .drug-clinical-title{padding:8px 11px;background:#eef8fc;font-weight:bold;font-size:13px;}
#${IDS.modal} .drug-clinical-search-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;align-items:stretch;}
#${IDS.modal} .drug-clinical-query{min-height:58px;resize:vertical;}
#${IDS.modal} .drug-clinical-search-row button{min-width:150px;padding:0 14px;border:1px solid ${STYLE.primaryColor};border-radius:4px;background:${STYLE.primaryColor};color:#fff;cursor:pointer;}
#${IDS.modal} .drug-clinical-result{display:none;margin:0 10px 10px;padding:9px 10px;border:1px solid #d7e8ef;border-radius:5px;background:#fff;font-size:12px;line-height:1.65;max-height:460px;overflow:auto;}
#${IDS.modal} .drug-clinical-main{padding:8px 9px;margin-bottom:8px;background:#f2faff;border-left:4px solid ${STYLE.primaryColor};border-radius:4px;}
#${IDS.modal} .drug-clinical-section{padding:7px 2px;border-top:1px dashed #e3e8eb;}
#${IDS.modal} .drug-clinical-section ul,#${IDS.modal} .drug-clinical-red ul{margin:4px 0 0 18px;padding:0;}
#${IDS.modal} .drug-clinical-red{padding:8px 9px;margin-top:8px;background:#fff0ef;color:#b42318;border-left:4px solid #dc4c40;border-radius:4px;}
#${IDS.modal} .drug-clinical-verification{padding:7px 8px;margin-top:8px;background:#fff8e8;color:#795b00;border-radius:4px;}
#${IDS.modal} label{display:flex;flex-direction:column;gap:5px;font-size:13px;}
#${IDS.modal} input,#${IDS.modal} textarea,#${IDS.modal} select{box-sizing:border-box;border:1px solid #cfd8dc;border-radius:4px;font-size:13px;background:#fff;color:#333;}
#${IDS.modal} input,#${IDS.modal} select{height:32px;padding:4px 7px;}
#${IDS.modal} textarea{width:100%;padding:8px;resize:vertical;line-height:1.6;}
#${IDS.modal} .drug-patient-text,#${IDS.modal} .drug-medicine-text{min-height:150px;}
#${IDS.modal} .drug-tip{padding:9px 11px;margin:10px 0;background:#fff8e8;color:#795b00;border-radius:5px;font-size:12px;line-height:1.65;white-space:pre-line;}
#${IDS.modal} .drug-options{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:8px 10px;margin:8px 0;background:#f5fafc;border:1px solid #d9edf4;border-radius:5px;font-size:12px;}
#${IDS.modal} .drug-options label{display:flex;flex-direction:row;align-items:center;gap:6px;}
#${IDS.modal} .drug-options input[type="checkbox"]{width:16px;height:16px;}
#${IDS.modal} .drug-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
#${IDS.modal} .drug-actions button,#${IDS.modal} .drug-footer button{height:34px;padding:0 14px;border-radius:4px;border:1px solid ${STYLE.primaryColor};background:${STYLE.primaryColor};color:#fff;cursor:pointer;}
#${IDS.modal} .drug-actions button.secondary,#${IDS.modal} .drug-footer button.secondary{background:#fff;color:${STYLE.primaryColor};}
#${IDS.modal} .drug-actions button.warning{background:#b7791f;border-color:#b7791f;}
#${IDS.modal} .drug-actions button.danger{background:#dc4c40;border-color:#dc4c40;}
#${IDS.modal} button:disabled{opacity:.55;cursor:not-allowed;}

#${IDS.modal} .drug-claim-body{padding:10px;}
#${IDS.modal} .drug-claim-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px;}
#${IDS.modal} .drug-claim-toolbar label{display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;}
#${IDS.modal} .drug-claim-toolbar input[type="checkbox"]{width:16px;height:16px;}
#${IDS.modal} .drug-claim-threshold{width:72px;height:29px;}
#${IDS.modal} .drug-claim-toolbar button{height:29px;padding:0 11px;border:1px solid ${STYLE.primaryColor};border-radius:4px;background:${STYLE.primaryColor};color:#fff;cursor:pointer;font-size:12px;}
#${IDS.modal} .drug-claim-toolbar button.secondary{background:#fff;color:${STYLE.primaryColor};}
#${IDS.modal} .drug-claim-scope-config{display:flex;flex-direction:column;gap:6px;padding:8px 10px;margin-bottom:8px;background:#f5fafc;border:1px solid #d9edf4;border-radius:5px;}
#${IDS.modal} .drug-claim-scope-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;}
#${IDS.modal} .drug-claim-scope-title{min-width:126px;color:#244b5d;font-weight:600;}
#${IDS.modal} .drug-claim-scope-row label{display:flex;flex-direction:row;align-items:center;gap:5px;font-size:12px;}
#${IDS.modal} .drug-claim-scope-row input[type="checkbox"]{width:15px;height:15px;}
#${IDS.modal} .drug-claim-liquid-tag{display:inline-block;margin-left:5px;padding:0 4px;border-radius:7px;background:#e8f5ff;color:#126a96;font-size:10px;line-height:16px;vertical-align:middle;}
#${IDS.modal} .drug-claim-cross-spec-tag{display:inline-block;margin-left:5px;padding:0 4px;border-radius:7px;background:#eef5ff;color:#456b9a;border:1px solid #b7cbe4;font-size:10px;line-height:14px;vertical-align:middle;}
#${IDS.modal} .drug-claim-tip{padding:8px 10px;margin-bottom:8px;background:#fff8e8;color:#795b00;border-radius:4px;font-size:12px;line-height:1.65;}
#${IDS.modal} .drug-claim-summary{padding:8px 10px;margin-bottom:8px;background:#eef8fc;border-radius:4px;font-size:12px;line-height:1.6;}
#${IDS.modal} .drug-claim-empty{color:#6b7280;}
#${IDS.modal} .drug-claim-result-wrap{overflow:auto;max-height:420px;border:1px solid #e2e8ec;border-radius:4px;}
#${IDS.modal} .drug-claim-table{min-width:1580px!important;}
#${IDS.modal} .drug-claim-table th,#${IDS.modal} .drug-claim-table td{font-size:11px;padding:5px 4px;}
#${IDS.modal} .drug-claim-table th:nth-child(3){width:160px;}
#${IDS.modal} .drug-claim-table th:nth-child(4){width:155px;}
#${IDS.modal} .drug-claim-table th:nth-child(12),#${IDS.modal} .drug-claim-table td:nth-child(12){width:110px;}
#${IDS.modal} .drug-claim-table th:nth-child(13),#${IDS.modal} .drug-claim-table td:nth-child(13){width:96px;}
#${IDS.modal} .drug-claim-table th:nth-child(14),#${IDS.modal} .drug-claim-table td:nth-child(14){width:70px;}
#${IDS.modal} .drug-claim-table th:last-child{width:260px;}
#${IDS.modal} .drug-claim-notes{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}
#${IDS.modal} .drug-claim-date{margin-top:3px;color:#6b7280;font-size:10px;}
#${IDS.modal} .drug-claim-status{display:inline-block;max-width:88px;box-sizing:border-box;padding:3px 6px;border-radius:9px;font-weight:bold;white-space:normal;line-height:1.35;overflow-wrap:anywhere;word-break:break-word;text-align:center;}
#${IDS.modal} .drug-claim-status[data-status="normal"]{background:#ecfdf3;color:#166534;}
#${IDS.modal} .drug-claim-status[data-status="soon"],
#${IDS.modal} .drug-claim-status[data-status="liquid"]{background:#fff8e8;color:#9a6700;border:0;box-shadow:none;}
#${IDS.modal} .drug-claim-status[data-status="warning"]{background:#fff3cd;color:#8a5b00;}
#${IDS.modal} .drug-claim-status[data-status="overdue"]{background:#fff0ef;color:#b42318;}
#${IDS.modal} .drug-claim-status[data-status="unknown"]{background:#eef1f4;color:#4b5563;}
#${IDS.modal} .drug-claim-status[data-status="stopped"]{background:#69747b;color:#fff;}
#${IDS.modal} .drug-claim-row.drug-claim-stopped{background:#f5f7f8;}
#${IDS.modal} .drug-claim-row.drug-claim-warning,#${IDS.modal} .drug-claim-row.drug-claim-overdue{background:#fffdf5;}
#${IDS.modal} .drug-claim-select{width:16px;height:16px;}
#${IDS.modal} .drug-claim-quantity{width:58px!important;text-align:center;}

#${IDS.modal} .drug-assessment-box{display:none;background:#fff;}
#${IDS.modal} .drug-assessment-title{padding:8px 11px;background:#eef8fc;font-weight:bold;font-size:13px;}
#${IDS.modal} .drug-assessment-content{padding:9px 11px;max-height:330px;overflow:auto;font-size:12px;line-height:1.65;}
#${IDS.modal} .drug-risk-level{padding:7px 9px;margin-bottom:7px;border-radius:4px;font-weight:bold;}
#${IDS.modal} .drug-risk-level.low{background:#ecfdf3;color:#166534;}
#${IDS.modal} .drug-risk-level.medium{background:#fff8e8;color:#795b00;}
#${IDS.modal} .drug-risk-level.high,#${IDS.modal} .drug-risk-level.critical{background:#fff0ef;color:#b42318;}
#${IDS.modal} .drug-summary{padding:8px 9px;margin-bottom:7px;background:#eef7ff;border-radius:4px;}
#${IDS.modal} .drug-section{padding:6px 3px;border-bottom:1px dashed #e3e8eb;}
#${IDS.modal} .drug-section ul{margin:4px 0 0 18px;padding:0;}
#${IDS.modal} .drug-local-title{margin-top:9px;padding-top:8px;border-top:1px solid #ddd;font-weight:bold;}
#${IDS.modal} .drug-local-issue{padding:6px 8px;margin:5px 0;border-radius:4px;}
#${IDS.modal} .drug-local-issue.danger{background:#fff0ef;color:#b42318;border-left:4px solid #dc4c40;}
#${IDS.modal} .drug-local-issue.warning{background:#fff8e8;color:#795b00;border-left:4px solid #d69e2e;}
#${IDS.modal} .drug-result-section{display:none;}
#${IDS.modal} .drug-result-wrap{overflow:auto;}
#${IDS.modal} table{width:100%;min-width:1780px;border-collapse:collapse;table-layout:fixed;}
#${IDS.modal} th,#${IDS.modal} td{border-bottom:1px solid #e6e6e6;border-right:1px solid #eee;padding:5px;text-align:center;font-size:12px;vertical-align:middle;}
#${IDS.modal} th{position:sticky;top:0;background:#f2f8fb;z-index:2;}
#${IDS.modal} tr.suggested{background:#fffdf3;}
#${IDS.modal} td input,#${IDS.modal} td select,#${IDS.modal} td textarea{width:100%;font-size:12px;padding:3px 5px;}
#${IDS.modal} td input,#${IDS.modal} td select{height:29px;}
#${IDS.modal} td textarea{height:48px;resize:vertical;line-height:1.35;}
#${IDS.modal} .drug-warning{display:block;max-height:60px;overflow:auto;text-align:left;line-height:1.4;}
#${IDS.modal} .drug-row-status[data-type="success"]{color:#17884d;font-weight:bold;}
#${IDS.modal} .drug-row-status[data-type="error"]{color:#d13b31;font-weight:bold;}
#${IDS.modal} .drug-row-status[data-type="warning"]{color:#a16207;font-weight:bold;}
#${IDS.modal} .drug-footer{display:flex;justify-content:flex-end;gap:9px;padding:11px 16px;border-top:1px solid #eee;background:#fafafa;}
@media(max-width:900px){#${IDS.modal} .drug-config-grid,#${IDS.modal} .drug-text-grid,#${IDS.modal} .drug-guide-search-row,#${IDS.modal} .drug-clinical-search-row{grid-template-columns:1fr;}}
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
<div class="drug-mask"></div>
<div class="drug-dialog">
    <div class="drug-header"><span>药品AI辅助自动录入</span><button type="button" class="drug-close">×</button></div>
    <div class="drug-body">
        <div class="drug-top-toolbar">
            <button type="button" class="drug-collapse-all">全部折叠</button>
            <button type="button" class="drug-expand-all">全部展开</button>
        </div>

        <div class="drug-collapsible-section drug-config-section" data-section-key="config" data-default-collapsed="false">
            <div class="drug-section-header">
                <span class="drug-section-heading">DeepSeek接口设置</span>
                <span class="drug-section-controls">
                    <button type="button" class="drug-section-clear" data-clear-target="config">清空</button>
                    <button type="button" class="drug-section-toggle">折叠</button>
                </span>
            </div>
            <div class="drug-section-body drug-config-body">
                <div class="drug-config-grid">
                    <label>DeepSeek API Key<input type="password" class="drug-api-key" placeholder="sk-...；仅保存在油猴脚本存储中"></label>
                    <label>模型<input type="text" class="drug-model" placeholder="例如 deepseek-chat"></label>
                </div>
            </div>
        </div>

        <div class="drug-collapsible-section drug-guide-box" data-section-key="guide" data-default-collapsed="true">
            <div class="drug-section-header">
                <span class="drug-section-heading">药品说明书查询（DeepSeek辅助整理）</span>
                <span class="drug-section-controls">
                    <button type="button" class="drug-section-clear" data-clear-target="guide">清空</button>
                    <button type="button" class="drug-section-toggle">折叠</button>
                </span>
            </div>
            <div class="drug-section-body">
                <div class="drug-guide-search-row">
                    <input type="text" class="drug-guide-query" list="medical-drug-guide-shared-western-datalist-v1" autocomplete="off" spellcheck="false" placeholder="输入药名、编码、别名或拼音首字母，可继续注明适应证或规格">
                    <button type="button" class="drug-guide-search">查询说明书</button>
                </div>
                <div class="drug-guide-result"></div>
            </div>
        </div>

        <div class="drug-text-grid">
            <div class="drug-collapsible-section" data-section-key="patient" data-default-collapsed="false">
                <div class="drug-section-header">
                    <span class="drug-section-heading">患者基本信息</span>
                    <span class="drug-section-controls">
                        <button type="button" class="drug-section-clear" data-clear-target="patient">清空</button>
                        <button type="button" class="drug-section-toggle">折叠</button>
                    </span>
                </div>
                <div class="drug-section-body drug-field-body">
                    <textarea class="drug-patient-text" placeholder="年龄、性别、体重、初步诊断、既往史、过敏史、肝肾功能、妊娠、化验和已有用药等。"></textarea>
                </div>
            </div>

            <div class="drug-collapsible-section" data-section-key="medicines" data-default-collapsed="false">
                <div class="drug-section-header">
                    <span class="drug-section-heading">拟开立或待审核药品医嘱</span>
                    <span class="drug-section-controls">
                        <button type="button" class="drug-section-clear" data-clear-target="medicines">清空</button>
                        <button type="button" class="drug-section-toggle">折叠</button>
                    </span>
                </div>
                <div class="drug-section-body drug-field-body">
                    <textarea class="drug-medicine-text" placeholder="阿司匹林肠溶片 100mg po qd&#10;瑞舒伐他汀钙片 10mg po qn&#10;0.9%氯化钠注射液 250ml＋天麻素注射液 0.6g ivdrip qd 7天&#10;&#10;留空时可根据患者信息生成候选方案。"></textarea>
                </div>
            </div>
        </div>

        <div class="drug-collapsible-section drug-clinical-box" data-section-key="clinical" data-default-collapsed="true">
            <div class="drug-section-header">
                <span class="drug-section-heading">临床指南查询与诊疗建议（DeepSeek知识整理，非实时联网）</span>
                <span class="drug-section-controls">
                    <button type="button" class="drug-section-clear" data-clear-target="clinical">清空</button>
                    <button type="button" class="drug-section-toggle">折叠</button>
                </span>
            </div>
            <div class="drug-section-body">
                <div class="drug-clinical-search-row">
                    <textarea class="drug-clinical-query" placeholder="输入诊断或临床问题，例如：缺血性脑血管病待查；高血压病2级（极高危）；请结合上方患者资料给出诊断评估、推荐检查、风险分层和诊疗建议。"></textarea>
                    <button type="button" class="drug-clinical-search">查询指南并生成建议</button>
                </div>
                <div class="drug-clinical-result"></div>
            </div>
        </div>



        <div class="drug-collapsible-section drug-claim-warning-section" data-section-key="claim-warning" data-default-collapsed="false">
            <div class="drug-section-header">
                <span class="drug-section-heading">长期药物预警系统</span>
                <span class="drug-section-controls"><button type="button" class="drug-section-toggle">折叠</button></span>
            </div>
            <div class="drug-section-body drug-claim-body">
                <div class="drug-claim-toolbar">
                    <label><input type="checkbox" class="drug-claim-enabled">打开药品助手时自动扫描当前医嘱查询页</label>
                    <label><input type="checkbox" class="drug-claim-front-render-enabled">开启预警渲染（直接标记医嘱界面）</label>
                    <label title="勾选后把已停止的长期药物医嘱纳入预警列表；开启预警渲染时在原医嘱名称处显示“已停X天”。已停天数严格按停止时间列计算。"><input type="checkbox" class="drug-claim-show-stopped">预警已停医嘱</label>
                    <label title="预计剩余天数小于或等于该值时，在医嘱查询界面显示剩余天数标签">渲染阈值<input type="number" min="0" step="0.5" value="7" class="drug-claim-threshold drug-claim-render-threshold">天</label>
                    <label title="预计剩余天数小于或等于该值时，标记为需要领药并在预警表中默认勾选">勾选阈值<input type="number" min="0" step="0.5" value="2" class="drug-claim-threshold drug-claim-select-threshold">天</label>
                    <button type="button" class="drug-claim-scan">扫描当前所有医嘱</button>
                    <button type="button" class="drug-claim-extract">提取勾选药品到录入框</button>
                    <button type="button" class="drug-claim-clear secondary">清空预警结果</button>
                </div>
                <div class="drug-claim-scope-config">
                    <div class="drug-claim-scope-row">
                        <span class="drug-claim-scope-title">长期药物纳入范围：</span>
                        <label><input type="checkbox" class="drug-claim-long-route" value="oral">口服/肠内</label>
                        <label><input type="checkbox" class="drug-claim-long-route" value="external">外用/局部</label>
                        <label><input type="checkbox" class="drug-claim-long-route" value="inhalation">雾化/吸入</label>
                        <label><input type="checkbox" class="drug-claim-long-route" value="injection">注射/输液</label>
                        <label><input type="checkbox" class="drug-claim-long-route" value="other">其他用法</label>
                    </div>
                    <div class="drug-claim-scope-row">
                        <span class="drug-claim-scope-title">临时供应量补偿范围：</span>
                        <label><input type="checkbox" class="drug-claim-compensation-route" value="claim">领药</label>
                        <label><input type="checkbox" class="drug-claim-compensation-route" value="oral">口服/肠内</label>
                        <label><input type="checkbox" class="drug-claim-compensation-route" value="external">外用/局部</label>
                        <label><input type="checkbox" class="drug-claim-compensation-route" value="inhalation">雾化/吸入</label>
                        <label><input type="checkbox" class="drug-claim-compensation-route" value="injection">注射/输液</label>
                        <label><input type="checkbox" class="drug-claim-compensation-route" value="other">其他用法</label>
                    </div>
                </div>
                <div class="drug-claim-tip">计算方法：所选“长期药物纳入范围”内的初始长期医嘱供应量＋同药品且用法属于所选“临时供应量补偿范围”的临时医嘱供应量－从长期医嘱开始时间至今的理论消耗量。默认保持旧版规则：长期仅纳入口服/肠内，临时仅补偿领药。选择“口服、外用”等临时补偿用法时，脚本会把相应用法的临时医嘱视为补发供应量；若该医嘱实际是一次性给药而非补发，会造成高估，必须人工核对。总量缺失时暂按1盒/瓶估算。同名口服固体药若临时补偿规格与长期规格不同，但两侧均可按明确包装计数和有效量可靠换算，则按临时医嘱真实总有效量进行跨规格库存折算，并在结果中标记“异规格补偿”；无法可靠换算的剂型仍不自动合并。请先在医嘱查询中选择“全部医嘱”，确保长期、临时和完整日期范围均已显示；结果不考虑漏服、退药、患者自备药、剂量临时调整及未显示的发药记录。“渲染阈值”只控制仍在执行的非液体药物何时开始显示剩余天数；“勾选阈值”控制非液体药物的报警、默认勾选和提取。勾选“预警已停医嘱”后，已停止长期药物会单独显示且永不参与领药报警或提取；“已停X天”严格从停止时间列到今天按自然日计算，停止当天为0天；若只有停止状态而未识别到停止时间，则显示“已停时间未知”，不会用开始时间代替。长期液体仅按用法列中的注射/输液类判断；仍在执行时显示自开始日期起的已使用天数。</div>
                <div class="drug-claim-summary"><span class="drug-claim-empty">尚未扫描当前患者医嘱。</span></div>
                <div class="drug-claim-result-wrap">
                    <table class="drug-claim-table"><thead><tr>
                        <th>领</th><th>序</th><th>药品名称</th><th>规格</th><th>单次剂量</th><th>长期用法</th><th>频次</th><th>开始日期</th><th>停止日期</th><th>累计供应</th><th>已用</th><th>预计剩余/已停</th><th>状态</th><th>本次领药</th><th>估算说明</th>
                    </tr></thead><tbody class="drug-claim-result-body"></tbody></table>
                </div>
            </div>
        </div>

        <div class="drug-collapsible-section" data-section-key="safety" data-default-collapsed="true">
            <div class="drug-section-header">
                <span class="drug-section-heading">安全规则与录入说明</span>
                <span class="drug-section-controls"><button type="button" class="drug-section-toggle">折叠</button></span>
            </div>
            <div class="drug-section-body drug-safety-body">
                <div class="drug-tip">安全规则：
1. AI结果仅供医师和临床药师辅助复核。
2. 药品框为空时，AI候选药品默认不勾选。
3. “长/临”在医院表格实际第二列，脚本会先点击第二列，再选择弹出的“长”或“临”。
4. 开药文本中的po在脚本内部仍保留为po，但写入医院“用法”列时自动选择“口服”，不再查找不存在的“po”选项。
5. 说明书查询结果可将剂量、用法和频次均明确的单一方案一键引用到下方开药文本框；剂量范围、按体重、按肾功能或需滴定的方案不允许自动引用。
6. 临床指南查询根据诊断和上方患者资料生成诊断评估、推荐检查、风险分层及诊疗建议；结果不自动写入医嘱。
7. 当前没有任何医嘱行时，脚本会自动点击页面下方“新医嘱”创建第一行；第2行及以后使用右侧“＋”增加。
8. 选中院内药品后，脚本会读取该药实际可选剂量单位；原单位不存在但可安全换算时自动换算，例如500mg在院内单位为g时写入0.5g。质量、体积和效价单位可同类换算，片、粒、盒等计数单位不跨类推算。
9. 选中药品后，脚本会读取“自付比例”下拉框，排除占位项并自动选择数值最小的一项，例如0.05和1同时存在时选择0.05。
10. 脚本填写药名、长临、组号、剂量、单位、用法、频次、天数和自付比例；规格由院内字典选择后带入。
11. 抗菌药物原因、皮试、精麻、嘱托、总量和特殊字段保留人工核对。
12. DeepSeek说明书和指南查询均为AI知识整理，不是实时联网数据库，必须核对最新正式说明书、指南及本院制度。
13. 长期药物预警系统只读取当前医嘱查询页面；长期纳入用法和临时供应量补偿用法可分别多选，默认长期口服/肠内＋临时领药。规格解析兼容“5mg*30S / 5mg×30s/盒”等S计数包装写法；同名固体药临时补偿与长期规格强度不一致时，只要两侧均能按包装计数和有效量可靠换算，可按真实总有效量进行跨规格补偿，并标记“异规格补偿”。若查询结果有多页，应先切换为每页100条或逐页核对。
14. 选择临时口服、外用、注射等作为供应补偿时，仅适用于这些临时医嘱确属补发/带药的情况；一次性实际给药若被纳入会高估库存，必须人工核对。
15. 渲染阈值只决定仍在执行的非液体药物的剩余天数显示范围；勾选阈值才决定报警、默认勾选和是否允许提取领药。长期液体仅按用法列中的注射/输液类判断，不参与领药预警；开启医嘱界面预警渲染后，默认显示其自开始日期起的已使用天数。
16. “预警已停医嘱”默认关闭；开启后，已停长期药物按停止时间列渲染“已停X天”（停止当天=0天），仅作历史状态提示，不参与领药报警、默认勾选或提取；停止时间无法识别时显示“已停时间未知”。
17. v1.28.6起，注射/输液类长期液体不再按同药去重：同名液体多次长期开立时，每一条活动医嘱均按各自开始时间独立渲染“已用X天”；普通长期药物仍保留同药去重库存逻辑。
17. 预警提取的药品统一生成临时医嘱、用法“领药”、频次st，本次领药数量默认1个包装；执行前必须核对药房发药记录和患者实际用药情况。
18. 默认不自动点击页面底部“保存”。</div>
            </div>
        </div>

        <div class="drug-collapsible-section" data-section-key="options" data-default-collapsed="false">
            <div class="drug-section-header">
                <span class="drug-section-heading">录入确认与执行操作</span>
                <span class="drug-section-controls"><button type="button" class="drug-section-toggle">折叠</button></span>
            </div>
            <div class="drug-section-body">
                <div class="drug-option-body">
                    <div class="drug-options">
                        <label><input type="checkbox" class="drug-auto-save">录入完成后，经再次确认自动点击“保存”</label>
                        <label><input type="checkbox" class="drug-risk-ack">我已核对患者资料、药名、剂量、用法、频次和风险提示</label>
                    </div>
                </div>
                <div class="drug-action-body">
                    <div class="drug-actions">
                        <button type="button" class="drug-parse">本地解析药品文本</button>
                        <button type="button" class="drug-ai">DeepSeek分析/生成方案</button>
                        <button type="button" class="drug-fill">录入已勾选药品</button>
                        <button type="button" class="drug-pause warning" disabled>暂停</button>
                        <button type="button" class="drug-abort danger" disabled>中止</button>
                        <button type="button" class="drug-select-all secondary">全选/全不选</button>
                        <button type="button" class="drug-clear secondary">清空结果</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="drug-collapsible-section drug-assessment-box" data-section-key="assessment" data-default-collapsed="false">
            <div class="drug-section-header">
                <span class="drug-section-heading">用药合理性辅助判断与建议</span>
                <span class="drug-section-controls">
                    <button type="button" class="drug-section-clear" data-clear-target="assessment">清空</button>
                    <button type="button" class="drug-section-toggle">折叠</button>
                </span>
            </div>
            <div class="drug-section-body drug-assessment-content"></div>
        </div>

        <div class="drug-collapsible-section drug-result-section" data-section-key="results" data-default-collapsed="false">
            <div class="drug-section-header">
                <span class="drug-section-heading">药品解析、AI候选及录入状态</span>
                <span class="drug-section-controls">
                    <button type="button" class="drug-section-clear" data-clear-target="results">清空</button>
                    <button type="button" class="drug-section-toggle">折叠</button>
                </span>
            </div>
            <div class="drug-section-body drug-result-wrap"><table><thead><tr>
                <th>填</th><th>序</th><th>原药名</th><th>系统检索名称</th><th>规格提示</th><th>长临</th><th>组号</th><th>剂量</th><th>单位</th><th>用法</th><th>频次</th><th>天数</th><th>适应证/依据</th><th>风险提示</th><th>置信度</th><th>状态</th>
            </tr></thead><tbody class="drug-result-body"></tbody></table></div>
        </div>
    </div>
    <div class="drug-footer"><button type="button" class="drug-cancel secondary">隐藏窗口（后台任务继续）</button></div>
</div>`;
        document.body.appendChild(modal);
        initializeSectionControls(modal);
        bindDrugSharedWesternSuggestions(modal);
        bindDrugGuideSharedWesternSuggestions(modal);

        const close = function () {
            modal.classList.remove('show');
            if (state.running) showStatus('窗口已隐藏，后台任务继续执行。', 'normal');
        };
        modal.querySelector('.drug-close').addEventListener('click', close);
        modal.querySelector('.drug-cancel').addEventListener('click', close);
        modal.querySelector('.drug-mask').addEventListener('click', close);

        const apiKey = modal.querySelector('.drug-api-key');
        const model = modal.querySelector('.drug-model');
        const guideQuery = modal.querySelector('.drug-guide-query');
        const guideSearch = modal.querySelector('.drug-guide-search');
        const guideResult = modal.querySelector('.drug-guide-result');
        const clinicalQuery = modal.querySelector('.drug-clinical-query');
        const clinicalSearch = modal.querySelector('.drug-clinical-search');
        const patient = modal.querySelector('.drug-patient-text');
        const medicines = modal.querySelector('.drug-medicine-text');
        const autoSave = modal.querySelector('.drug-auto-save');
        const riskAck = modal.querySelector('.drug-risk-ack');
        const pause = modal.querySelector('.drug-pause');
        const abort = modal.querySelector('.drug-abort');
        const claimEnabled = modal.querySelector('.drug-claim-enabled');
        const claimFrontRenderEnabled = modal.querySelector(
            '.drug-claim-front-render-enabled'
        );
        const claimShowStopped = modal.querySelector(
            '.drug-claim-show-stopped'
        );
        const claimRenderThreshold = modal.querySelector(
            '.drug-claim-render-threshold'
        );
        const claimSelectThreshold = modal.querySelector(
            '.drug-claim-select-threshold'
        );
        const claimLongRouteInputs = Array.from(
            modal.querySelectorAll('.drug-claim-long-route')
        );
        const claimCompensationRouteInputs = Array.from(
            modal.querySelectorAll('.drug-claim-compensation-route')
        );
        const claimScan = modal.querySelector('.drug-claim-scan');
        const claimExtract = modal.querySelector('.drug-claim-extract');
        const claimClear = modal.querySelector('.drug-claim-clear');

        apiKey.value = GM_getValue(KEYS.apiKey, '');
        model.value = GM_getValue(KEYS.model, DEFAULT_MODEL);
        guideQuery.value = GM_getValue(KEYS.guideQuery, '');
        clinicalQuery.value = GM_getValue(KEYS.clinicalQuery, '');
        patient.value = GM_getValue(KEYS.patientDraft, '');
        medicines.value = GM_getValue(KEYS.medicineDraft, '');
        autoSave.checked = Boolean(GM_getValue(KEYS.autoSave, false));
        claimEnabled.checked = Boolean(
            GM_getValue(KEYS.claimWarningEnabled, false)
        );
        claimFrontRenderEnabled.checked = Boolean(
            GM_getValue(KEYS.claimWarningRenderEnabled, false)
        );
        claimShowStopped.checked = claimWarningShowStoppedOrders();
        claimRenderThreshold.value = String(
            claimWarningRenderThresholdDays()
        );
        claimSelectThreshold.value = String(
            claimWarningSelectThresholdDays()
        );

        const savedLongRouteScopes = claimWarningLongRouteScopes();
        const savedCompensationRouteScopes =
            claimWarningCompensationRouteScopes();

        claimLongRouteInputs.forEach(function (box) {
            box.checked = savedLongRouteScopes.includes(box.value);
        });
        claimCompensationRouteInputs.forEach(function (box) {
            box.checked = savedCompensationRouteScopes.includes(box.value);
        });

        apiKey.addEventListener('change', function () { GM_setValue(KEYS.apiKey, apiKey.value.trim()); });
        model.addEventListener('change', function () { GM_setValue(KEYS.model, model.value.trim() || DEFAULT_MODEL); });
        guideQuery.addEventListener('input', function () { GM_setValue(KEYS.guideQuery, guideQuery.value); });
        clinicalQuery.addEventListener('input', function () { GM_setValue(KEYS.clinicalQuery, clinicalQuery.value); });
        patient.addEventListener('input', function () { GM_setValue(KEYS.patientDraft, patient.value); });
        medicines.addEventListener('input', function () { GM_setValue(KEYS.medicineDraft, medicines.value); });
        autoSave.addEventListener('change', function () { GM_setValue(KEYS.autoSave, autoSave.checked); });
        claimEnabled.addEventListener('change', function () {
            GM_setValue(KEYS.claimWarningEnabled, claimEnabled.checked);

            if (claimEnabled.checked) {
                scanClaimWarnings(modal, false);
            }
        });
        claimFrontRenderEnabled.addEventListener('change', function () {
            GM_setValue(
                KEYS.claimWarningRenderEnabled,
                claimFrontRenderEnabled.checked
            );
            state.claimWarningFrontSignature = '';

            if (claimFrontRenderEnabled.checked) {
                scanClaimWarnings(modal, false);
                scheduleClaimWarningFrontRender(120);
            }
            else {
                clearClaimWarningFrontRender(false);
            }
        });
        claimShowStopped.addEventListener('change', function () {
            GM_setValue(
                KEYS.claimWarningShowStoppedOrders,
                claimShowStopped.checked
            );
            state.claimWarningFrontSignature = '';
            state.claimWarningFrontDirty = true;

            /*
             * 该开关直接改变结果集合和前端标记，切换后立即静默重扫。
             * 即使“自动扫描”总开关未开启，也无需再手工点击扫描按钮。
             */
            scanClaimWarnings(modal, true);
        });
        function bindClaimScopeInputs(inputs, storageKey, label) {
            inputs.forEach(function (box) {
                box.addEventListener('change', function () {
                    let selected = inputs.filter(function (item) {
                        return item.checked;
                    }).map(function (item) {
                        return item.value;
                    });

                    if (!selected.length) {
                        box.checked = true;
                        selected = [box.value];
                        showStatus(label + '至少保留一个选项。', 'warning');
                    }

                    GM_setValue(storageKey, selected);
                    state.claimWarningFrontSignature = '';

                    if (
                        claimFrontRenderEnabled.checked ||
                        state.claimWarningResults.length
                    ) {
                        scanClaimWarnings(modal, true);
                    }
                });
            });
        }

        bindClaimScopeInputs(
            claimLongRouteInputs,
            KEYS.claimWarningLongRouteScopes,
            '长期药物纳入范围'
        );
        bindClaimScopeInputs(
            claimCompensationRouteInputs,
            KEYS.claimWarningCompensationRouteScopes,
            '临时供应量补偿范围'
        );
        claimRenderThreshold.addEventListener('change', function () {
            const value = claimWarningThresholdValue(
                claimRenderThreshold.value,
                7
            );
            claimRenderThreshold.value = String(value);
            GM_setValue(KEYS.claimWarningRenderThresholdDays, value);
            state.claimWarningFrontSignature = '';

            if (
                claimFrontRenderEnabled.checked ||
                state.claimWarningResults.length
            ) {
                scanClaimWarnings(modal, true);
            }
        });
        claimSelectThreshold.addEventListener('change', function () {
            const value = claimWarningThresholdValue(
                claimSelectThreshold.value,
                2
            );
            claimSelectThreshold.value = String(value);
            GM_setValue(KEYS.claimWarningSelectThresholdDays, value);

            /*
             * 同步旧键，便于以后临时回退到v1.20时仍沿用报警/勾选阈值，
             * 而不是误把较大的渲染阈值当成自动领药阈值。
             */
            GM_setValue(KEYS.claimWarningThresholdDays, value);
            state.claimWarningFrontSignature = '';

            if (
                claimFrontRenderEnabled.checked ||
                state.claimWarningResults.length
            ) {
                scanClaimWarnings(modal, true);
            }
        });
        claimScan.addEventListener('click', function () {
            scanClaimWarnings(modal, false);
        });
        claimExtract.addEventListener('click', function () {
            extractClaimWarningsToDrugList(modal);
        });
        claimClear.addEventListener('click', function () {
            state.claimWarningResults = [];
            state.claimWarningMeta = null;
            state.claimWarningFrontSignature = '';
            state.claimWarningFrontDirty = true;
            renderClaimWarning(modal);
            clearClaimWarningFrontRender(false);
            showStatus('长期药物预警结果已清空。', 'success');
        });

        guideSearch.addEventListener('click', async function () {
            if (state.running) return;

            const key = apiKey.value.trim();
            const modelName = model.value.trim() || DEFAULT_MODEL;

            /*
             * v1.28.9：点击“查询说明书”本身不再触发共享药品联想解析。
             *
             * 只有用户明确在原生datalist中选择候选，或在候选值已进入
             * 输入框后按Enter确认时，才允许applyDrugGuideSharedWesternSelection()
             * 回填标准药名/规格。普通手工输入后直接点击查询，必须原样提交，
             * 即使当前文字恰好能唯一匹配共享药品库，也不能自动追加规格。
             */
            const query = guideQuery.value.trim();

            if (!suiteGlobalAiHasApiKey(key)) {
                showStatus('请先填写AI API Key（本地DeepSeek或管理器全局GLM）。', 'error');
                return;
            }

            if (!query) {
                showStatus('请输入需要查询的药品名称，建议同时注明适应证或规格。', 'error');
                return;
            }

            GM_setValue(KEYS.apiKey, key);
            GM_setValue(KEYS.model, modelName);
            GM_setValue(KEYS.guideQuery, query);

            state.running = true;
            guideSearch.disabled = true;
            guideSearch.textContent = '查询中…';
            showStatus('正在调用DeepSeek整理药品说明书信息……');

            try {
                const result = await deepSeekDrugGuideRequest(
                    key,
                    modelName,
                    patient.value,
                    query
                );

                applyDrugGuideResult(result);
                renderDrugGuide(modal);
                setSectionCollapsedByKey(modal, 'guide', false, true);

                const quoteCount = state.drugGuide.standardRegimens.filter(function (item) {
                    return item.canQuote && item.orderText;
                }).length;

                showStatus(
                    '说明书信息已返回，共' + state.drugGuide.standardRegimens.length +
                    '个剂量方案，其中' + quoteCount + '个可直接引用到开药文本框。',
                    quoteCount ? 'success' : 'warning'
                );
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
            finally {
                state.running = false;
                guideSearch.disabled = false;
                guideSearch.textContent = '查询说明书';
            }
        });

        guideResult.addEventListener('click', function (event) {
            const button = event.target.closest('.drug-guide-use');

            if (!button || button.disabled || !state.drugGuide) {
                return;
            }

            const index = Number(button.dataset.index);
            const regimen = state.drugGuide.standardRegimens[index];

            if (!regimen || !regimen.canQuote || !regimen.orderText) {
                showStatus('该方案需要人工确定剂量，不能自动引用。', 'warning');
                return;
            }

            try {
                appendOrderToMedicineText(medicines, regimen.orderText);
                showStatus(
                    '已引用到下方开药文本框：' + regimen.orderText +
                    '\n请结合适应证、肝肾功能及具体说明书再次核对。',
                    'success'
                );
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
        });


        clinicalSearch.addEventListener('click', async function () {
            if (state.running) return;

            const key = apiKey.value.trim();
            const modelName = model.value.trim() || DEFAULT_MODEL;
            const diagnosis = clinicalQuery.value.trim();

            if (!suiteGlobalAiHasApiKey(key)) {
                showStatus('请先填写AI API Key（本地DeepSeek或管理器全局GLM）。', 'error');
                return;
            }

            if (!diagnosis) {
                showStatus('请输入需要查询的诊断、拟诊断或临床问题。', 'error');
                return;
            }

            GM_setValue(KEYS.apiKey, key);
            GM_setValue(KEYS.model, modelName);
            GM_setValue(KEYS.clinicalQuery, diagnosis);

            state.running = true;
            clinicalSearch.disabled = true;
            clinicalSearch.textContent = '指南分析中…';
            showStatus('正在根据诊断和患者资料生成临床指南辅助建议……');

            try {
                const result = await deepSeekClinicalGuidelineRequest(
                    key,
                    modelName,
                    patient.value,
                    diagnosis
                );

                applyClinicalGuidelineResult(result, diagnosis);
                renderClinicalGuideline(modal);
                setSectionCollapsedByKey(modal, 'clinical', false, true);

                const redFlagCount = state.clinicalGuideline.redFlags.length;

                showStatus(
                    '临床指南辅助建议已生成。' +
                    (redFlagCount
                        ? '发现' + redFlagCount + '项红旗征象或紧急处置提示，请优先核对。'
                        : '请结合患者实际资料和最新正式指南人工核对。'),
                    redFlagCount ? 'warning' : 'success'
                );
            }
            catch (error) {
                showStatus(error.message, 'error');
            }
            finally {
                state.running = false;
                clinicalSearch.disabled = false;
                clinicalSearch.textContent = '查询指南并生成建议';
            }
        });

        modal.querySelector('.drug-parse').addEventListener('click', function () {
            state.items = parseMedicationText(medicines.value);
            state.assessment = null;
            state.assessmentSuppressed = false;
            riskAck.checked = false;
            renderTable(modal);
            renderAssessment(modal, localAudit(state.items));
            if (state.items.length) setSectionCollapsedByKey(modal, 'results', false, true);
            if (localAudit(state.items).length) setSectionCollapsedByKey(modal, 'assessment', false, true);
            showStatus(state.items.length ? '已本地解析' + state.items.length + '条医嘱，请核对或继续调用DeepSeek。' : '未识别到有效药品医嘱，可检查格式或直接使用DeepSeek。', state.items.length ? 'success' : 'warning');
        });

        modal.querySelector('.drug-ai').addEventListener('click', async function () {
            if (state.running) return;
            const key = apiKey.value.trim();
            const modelName = model.value.trim() || DEFAULT_MODEL;
            const hasMedicine = Boolean(medicines.value.trim());
            if (!suiteGlobalAiHasApiKey(key)) {
                showStatus('请先填写AI API Key（本地DeepSeek或管理器全局GLM）。', 'error');
                return;
            }
            if (!hasMedicine && !patient.value.trim()) {
                showStatus('药品框为空时，必须先粘贴患者基本信息。', 'error');
                return;
            }
            let parsed = readTable(modal);
            if (!parsed.length) parsed = parseMedicationText(medicines.value);
            state.running = true;
            const button = modal.querySelector('.drug-ai');
            button.disabled = true;
            button.textContent = hasMedicine ? 'AI审方中…' : 'AI生成方案中…';
            try {
                const result = await deepSeekRequest(key, modelName, patient.value, medicines.value, parsed);
                applyAiResult(result, hasMedicine);
                state.assessmentSuppressed = false;
                riskAck.checked = false;
                renderTable(modal);
                renderAssessment(modal);
                setSectionCollapsedByKey(modal, 'results', false, true);
                setSectionCollapsedByKey(modal, 'assessment', false, true);
                showStatus(hasMedicine ? 'DeepSeek已完成解析和审方，请逐条核对。' : '已生成候选方案，候选药品默认未勾选。', state.assessment && ['high', 'critical'].includes(state.assessment.riskLevel) ? 'warning' : 'success');
            } catch (error) {
                showStatus(error.message, 'error');
            } finally {
                state.running = false;
                button.disabled = false;
                button.textContent = 'DeepSeek分析/生成方案';
            }
        });

        modal.querySelector('.drug-select-all').addEventListener('click', function () {
            const boxes = Array.from(modal.querySelectorAll('.drug-enabled'));
            const checked = boxes.some(function (box) { return !box.checked; });
            boxes.forEach(function (box) { box.checked = checked; });
        });

        modal.querySelector('.drug-clear').addEventListener('click', function () {
            state.abortRequested = true;
            state.items = [];
            state.assessment = null;
            state.assessmentSuppressed = false;
            riskAck.checked = false;
            renderTable(modal);
            renderAssessment(modal, []);
            showStatus('结果已清空。');
        });

        pause.addEventListener('click', function () {
            if (!state.running) return;
            state.paused = !state.paused;
            pause.textContent = state.paused ? '继续' : '暂停';
            showStatus(state.paused ? '药品录入已暂停。' : '药品录入已继续。');
        });

        abort.addEventListener('click', function () {
            if (!state.running) return;
            state.abortRequested = true;
            abort.disabled = true;
            abort.textContent = '正在中止…';
            showStatus('已请求中止，将在当前步骤后停止。', 'warning');
        });

        modal.querySelector('.drug-fill').addEventListener('click', async function () {
            if (state.running) return;
            state.items = readTable(modal);
            const selected = state.items.filter(function (item) { return item.enabled; });
            if (!selected.length) {
                showStatus('没有勾选需要录入的药品。', 'error');
                return;
            }
            const issues = localAudit(selected);
            state.assessmentSuppressed = false;
            renderAssessment(modal, issues);
            if (issues.length) setSectionCollapsedByKey(modal, 'assessment', false, true);
            if (issues.some(function (issue) { return issue.severity === 'danger'; })) {
                showStatus('存在剂量或单位缺失，禁止自动录入。', 'error');
                return;
            }
            if (!riskAck.checked) {
                showStatus('请先勾选人工核对确认项。', 'error');
                return;
            }
            const suggestions = selected.filter(function (item) { return item.sourceType === 'suggested'; });
            if (suggestions.length && !window.confirm('勾选项中包含' + suggestions.length + '条AI候选药品，确认已经由医师逐条核对并继续写入吗？')) return;
            if (!window.confirm('即将向医院药品录入表格写入' + selected.length + '条医嘱。确认继续？')) return;

            state.running = true;
            state.paused = false;
            state.abortRequested = false;
            pause.disabled = false;
            abort.disabled = false;
            abort.textContent = '中止';
            try {
                await activateMedicationTab();

                /*
                 * 不再一次性预创建全部医嘱行。
                 * 这样某个药检索失败时，下一条可以继续复用同一物理行，
                 * 不会因为“跳过”而在中间永久空出一行。
                 */
                await ensureRows(1);

                let targetRowIndex = 0;
                let successCount = 0;
                let skippedCount = 0;
                const skippedNames = [];

                for (let index = 0; index < selected.length; index++) {
                    await checkpoint();
                    const item = selected[index];
                    const originalIndex = state.items.indexOf(item);
                    const itemName = item.standardName || item.sourceName || ('第' + (index + 1) + '条');

                    rowStatus(
                        modal,
                        originalIndex,
                        '正在录入 ' + (index + 1) + '/' + selected.length,
                        'warning'
                    );

                    try {
                        const chosen = await fillOne(targetRowIndex, item);

                        rowStatus(
                            modal,
                            originalIndex,
                            '已录入：' + chosen.selectedName +
                                (chosen.conversionNote
                                    ? '（剂量换算：' + chosen.conversionNote + '）'
                                    : '') +
                                (chosen.selfPayRatioText
                                    ? '（自付比例：' + chosen.selfPayRatioText + '）'
                                    : ''),
                            'success'
                        );

                        successCount += 1;
                        targetRowIndex += 1;
                    }
                    catch (error) {
                        /*
                         * 仅“医院药品字典明确检索不到”允许跳过。
                         * 这类错误不会进入后续剂量/单位/用法填写，因此清理当前
                         * 检索行后可安全复用给下一条药。
                         */
                        if (isMedicationLookupNotFoundError(error)) {
                            await clearMedicationRowAfterLookupMiss(
                                targetRowIndex
                            );

                            skippedCount += 1;
                            skippedNames.push(itemName);

                            rowStatus(
                                modal,
                                originalIndex,
                                '已跳过：医院药品字典未找到匹配项',
                                'warning'
                            );

                            continue;
                        }

                        rowStatus(
                            modal,
                            originalIndex,
                            '失败：' + error.message,
                            'error'
                        );

                        throw new Error(
                            '第' +
                            (index + 1) +
                            '条药品录入失败：' +
                            error.message
                        );
                    }
                }

                if (!successCount) {
                    showStatus(
                        '本次没有药品成功录入。' +
                        (skippedCount
                            ? '共跳过' + skippedCount + '条院内字典未找到的药品：' + skippedNames.join('、')
                            : '') +
                        '\n未执行自动保存。',
                        'warning'
                    );
                    return;
                }

                /*
                 * 出现跳过项时强制保留人工保存。
                 * 原因：最后一条若恰好检索失败，医院表格可能保留一个已经清空的
                 * 编辑行；继续录入没有问题，但不应在这种情况下自动提交整张表。
                 */
                if (skippedCount) {
                    showStatus(
                        '已继续完成' + successCount + '条药品录入，跳过' + skippedCount + '条院内字典未找到的药品：' +
                        skippedNames.join('、') +
                        '\n为避免空白/残留编辑行被自动提交，本次不自动保存；请人工核对后手动点击“保存”。',
                        'warning'
                    );
                }
                else if (autoSave.checked) {
                    if (window.confirm('药品已写入表格。请最后核对规格、总量、抗菌药物原因、皮试、精麻、嘱托和计费信息。确认自动点击“保存”吗？')) {
                        await saveOrders();
                        showStatus('已完成药品录入并点击保存。', 'success');
                    } else {
                        showStatus('已取消自动保存，请人工核对后手动保存。', 'warning');
                    }
                }
                else {
                    showStatus('已完成表格录入，但未自动保存。请人工核对后手动点击“保存”。', 'success');
                }
            } catch (error) {
                showStatus(error.name === 'AbortError' ? '药品录入已中止，已填写行仍保留在页面。' : error.message + '\n已填写内容仍保留，请人工检查。', error.name === 'AbortError' ? 'warning' : 'error');
            } finally {
                state.running = false;
                state.paused = false;
                pause.disabled = true;
                abort.disabled = true;
                pause.textContent = '暂停';
                abort.textContent = '中止';
            }
        });

        return modal;
    }

    function openModal() {
        const modal = createModal();

        /*
         * 两套西药联想库只在打开窗口时整体生成一次；输入过程中不再重绘。
         * 共享联想库发生变化时，绑定的全局事件会再次刷新。
         */
        renderDrugSharedWesternDatalist(modal);
        renderDrugGuideSharedSuggestions(
            modal,
            modal.querySelector('.drug-guide-query')
        );

        modal.classList.add('show');
        renderTable(modal);
        renderAssessment(modal);
        renderDrugGuide(modal);
        renderClinicalGuideline(modal);
        renderClaimWarning(modal);

        const claimEnabled = modal.querySelector('.drug-claim-enabled');

        if (
            claimEnabled &&
            claimEnabled.checked &&
            !state.claimWarningScanBusy &&
            !state.running
        ) {
            window.setTimeout(function () {
                scanClaimWarnings(modal, true);
            }, 160);
        }
    }

    function createPanel() {
        if (document.getElementById(IDS.panel)) return;
        const panel = document.createElement('div');
        panel.id = IDS.panel;
        Object.assign(panel.style, {
            position: 'fixed',
            top: '120px',
            right: '20px',
            zIndex: '2147483000',
            width: STYLE.panelWidth + 'px',
            borderRadius: STYLE.panelRadius + 'px',
            overflow: 'hidden',
            background: '#fff',
            boxShadow: STYLE.panelShadow,
            fontFamily: '"Microsoft YaHei",Arial,sans-serif'
        });
        const header = document.createElement('div');
        header.className = 'drug-floating-header';
        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '32px',
            padding: '0 6px 0 10px',
            background: STYLE.headerColor,
            color: '#fff',
            cursor: 'move',
            userSelect: 'none',
            fontSize: '13px'
        });
        const title = document.createElement('span');
        title.textContent = '药品录入';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'drug-floating-toggle';
        Object.assign(toggle.style, {
            width: '25px',
            height: '24px',
            border: '0',
            borderRadius: '4px',
            background: 'rgba(255,255,255,.15)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '16px'
        });
        const body = document.createElement('div');
        body.className = 'drug-floating-body';
        Object.assign(body.style, { padding: '7px', background: '#fff' });
        const button = document.createElement('button');
        button.id = IDS.button;
        button.type = 'button';
        button.textContent = '自动填写药品';
        Object.assign(button.style, {
            width: '100%',
            height: '37px',
            border: '1px solid ' + STYLE.primaryColor,
            borderRadius: '5px',
            background: STYLE.primaryColor,
            color: '#fff',
            cursor: 'pointer',
            fontSize: '13px'
        });
        button.addEventListener('mouseenter', function () { button.style.background = STYLE.primaryHoverColor; });
        button.addEventListener('mouseleave', function () { button.style.background = STYLE.primaryColor; });
        header.appendChild(title);
        header.appendChild(toggle);
        body.appendChild(button);
        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        const saved = GM_getValue(KEYS.position, null);
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
            panel.style.left = saved.left + 'px';
            panel.style.top = saved.top + 'px';
            panel.style.right = 'auto';
        }
        let collapsed = Boolean(GM_getValue(KEYS.collapsed, false));
        function applyCollapsed() {
            body.style.display = collapsed ? 'none' : 'block';
            panel.dataset.collapsed = collapsed ? 'true' : 'false';
            toggle.textContent = collapsed ? '＋' : '－';
        }
        applyCollapsed();
        toggle.addEventListener('click', function (event) {
            event.stopPropagation();
            collapsed = !collapsed;
            GM_setValue(KEYS.collapsed, collapsed);
            applyCollapsed();
        });
        button.addEventListener('click', openModal);

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;
        header.addEventListener('mousedown', function (event) {
            if (event.target === toggle) return;
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
            if (!dragging) return;
            const left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - offsetX));
            const top = Math.max(0, Math.min(window.innerHeight - header.offsetHeight, event.clientY - offsetY));
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });
        document.addEventListener('mouseup', function () {
            if (!dragging) return;
            dragging = false;
            const rect = panel.getBoundingClientRect();
            GM_setValue(KEYS.position, { left: rect.left, top: rect.top });
        });
    }

    /******************************************************************
     * 悬浮框管理器：医嘱标签联动预警扫描桥接
     *
     * 只增加一个外部触发入口，不改写药品脚本自身的长期药物范围、
     * 临时补偿范围、渲染阈值、勾选阈值、长期液体显示或自动扫描设置。
     ******************************************************************/
    const SUITE_ORDER_WARNING_SCAN_EVENT =
        'medical-userscript-order-warning-scan-request';

    let suiteOrderWarningDrugTimer = null;

    function bindSuiteOrderWarningDrugBridge() {
        if (
            window.__medicalSuiteOrderWarningDrugBridgeV1
        ) {
            return;
        }

        window.__medicalSuiteOrderWarningDrugBridgeV1 =
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
                    detail.target !== 'drug'
                ) {
                    return;
                }

                clearTimeout(
                    suiteOrderWarningDrugTimer
                );

                state.claimWarningFrontDirty = true;

                suiteOrderWarningDrugTimer =
                    window.setTimeout(
                        function () {
                            suiteOrderWarningDrugTimer = null;

                            scanClaimWarnings(
                                createModal(),
                                false
                            );
                        },
                        100
                    );
            },
            false
        );
    }

    function initialize() {
        if (!document.body) {
            setTimeout(initialize, 100);
            return;
        }
        createPanel();
        bindSuiteOrderWarningDrugBridge();
        startClaimWarningFrontWatcher();
        console.info('[药品AI辅助自动录入 v1.28.3] 已启用：长期液体仅按用法列中的注射/输液类判断，状态样式与显示剩余天数统一。');
    }

    initialize();

    /******************************************************************
     * WebDAV数据备份与脚本源码快照适配
     *
     * 仅备份明确白名单内的长期配置；API Key、患者资料、临时草稿和
     * 当前任务状态均不进入备份。源码快照只用于WebDAV留档，不自动安装。
     ******************************************************************/

    const SUITE_BACKUP_ADAPTER_KEY =
        "drug";

    const SUITE_BACKUP_GM_KEYS = [
            KEYS.model,
            KEYS.autoSave,
            KEYS.position,
            KEYS.collapsed,
            KEYS.sectionCollapsed,
            KEYS.claimWarningEnabled,
            KEYS.claimWarningRenderEnabled,
            KEYS.claimWarningShowStoppedOrders,
            KEYS.claimWarningThresholdDays,
            KEYS.claimWarningRenderThresholdDays,
            KEYS.claimWarningSelectThresholdDays,
            KEYS.claimWarningLongRouteScopes,
            KEYS.claimWarningCompensationRouteScopes,
            KEYS.claimWarningRenderLiquidEnabled
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
            "// @name         智慧医疗－药品AI辅助自动录入",
            "// @namespace    http://tampermonkey.net/",
            "// @version      1.28.26",
            "// @description  v1.28.26：批量同步WebDAV数据备份注册、源码快照版本、源码备份文件名及统一管理器脚本版本信息至1.28.26；保留v1.28.25全局AI密钥校验兼容修复、DeepSeek/智谱GLM/OpenAI全局AI调用适配及其余既有功能",
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
                medicalDrugAiAutoFillMain
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
                "药品AI辅助自动录入",
            version:
                "1.28.26",
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
                "药品AI辅助自动录入",
            version:
                "1.28.26",
            role:
                'business',
            fileName:
                "智慧医疗－药品AI辅助自动录入_v1.28.26.user.js",
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
