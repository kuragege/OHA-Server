// ==UserScript==
// @name         智慧医疗－WebDAV跨域传输助手
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  v1.0.1：为悬浮框管理器提供受限GM_xmlhttpRequest跨域WebDAV传输，并注册当前助手源码供版本化WebDAV源码备份；无需服务器开放CORS
// @match        *://11.12.199.244:8003/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// @noframes
// ==/UserScript==
(function medicalWebdavTransportHelperMain() {
    'use strict';

    if (
        window.top !==
        window.self
    ) {
        return;
    }

    const VERSION =
        '1.0.1';

    const CONFIG_STORAGE_KEY =
        'medicalUserscriptSuiteWebdavConfigV1';

    const REQUEST_EVENT_NAME =
        'medical-userscript-webdav-transport-request-v1';

    const RESPONSE_EVENT_NAME =
        'medical-userscript-webdav-transport-response-v1';

    const READY_EVENT_NAME =
        'medical-userscript-webdav-transport-ready-v1';

    const READY_ATTRIBUTE =
        'data-medical-webdav-transport-v1';

    const ALLOWED_METHODS =
        new Set([
            'OPTIONS',
            'PROPFIND',
            'MKCOL',
            'PUT',
            'GET',
            'DELETE'
        ]);

    const ALLOWED_HEADERS =
        new Set([
            'authorization',
            'depth',
            'content-type',
            'if-none-match'
        ]);

    const MAX_REQUEST_BODY_LENGTH =
        64 *
        1024 *
        1024;

    function gmRequester() {
        if (
            typeof GM_xmlhttpRequest ===
                'function'
        ) {
            return GM_xmlhttpRequest;
        }

        if (
            typeof GM !== 'undefined' &&
            GM &&
            typeof GM.xmlHttpRequest ===
                'function'
        ) {
            return GM.xmlHttpRequest
                .bind(GM);
        }

        return null;
    }

    function readConfiguredEndpoint() {
        let stored = null;

        try {
            stored =
                JSON.parse(
                    localStorage.getItem(
                        CONFIG_STORAGE_KEY
                    ) ||
                    'null'
                );
        } catch (error) {
            stored = null;
        }

        const endpoint =
            String(
                stored &&
                stored.endpoint ||
                ''
            ).trim();

        if (!endpoint) {
            throw new Error(
                '管理器尚未保存WebDAV服务器地址。'
            );
        }

        let parsed = null;

        try {
            parsed =
                new URL(endpoint);
        } catch (error) {
            throw new Error(
                '管理器保存的WebDAV服务器地址无效。'
            );
        }

        if (
            parsed.protocol !== 'http:' &&
            parsed.protocol !== 'https:'
        ) {
            throw new Error(
                'WebDAV跨域传输助手仅允许HTTP或HTTPS地址。'
            );
        }

        if (
            parsed.username ||
            parsed.password
        ) {
            throw new Error(
                '请勿在WebDAV地址中直接包含账号或密码。'
            );
        }

        parsed.hash = '';

        return parsed;
    }

    function assertAllowedTarget(
        value
    ) {
        const endpoint =
            readConfiguredEndpoint();

        let target = null;

        try {
            target =
                new URL(
                    String(value || '')
                );
        } catch (error) {
            throw new Error(
                'WebDAV请求地址无效。'
            );
        }

        if (
            target.protocol !== 'http:' &&
            target.protocol !== 'https:'
        ) {
            throw new Error(
                'WebDAV请求仅允许HTTP或HTTPS协议。'
            );
        }

        if (
            target.username ||
            target.password
        ) {
            throw new Error(
                '已阻止包含内嵌账号或密码的WebDAV请求。'
            );
        }

        if (
            target.origin !==
            endpoint.origin
        ) {
            throw new Error(
                '已阻止访问管理器当前配置之外的WebDAV服务器。'
            );
        }

        const basePath =
            endpoint.pathname
                .replace(/\/+$/g, '') +
            '/';

        const targetPath =
            target.pathname;

        if (
            targetPath !==
                basePath.slice(0, -1) &&
            !targetPath.startsWith(
                basePath
            )
        ) {
            throw new Error(
                '已阻止访问管理器当前配置目录之外的WebDAV路径。'
            );
        }

        if (
            target.search !==
            endpoint.search
        ) {
            throw new Error(
                '已阻止修改WebDAV地址中的查询参数。'
            );
        }

        target.hash = '';

        return target.href;
    }

    function sanitizeHeaders(
        value
    ) {
        const source =
            value &&
            typeof value === 'object' &&
            !Array.isArray(value)
                ? value
                : {};

        const headers = {};

        Object.keys(source)
            .forEach(
                function (name) {
                    const normalizedName =
                        String(name)
                            .trim()
                            .toLowerCase();

                    if (
                        !ALLOWED_HEADERS.has(
                            normalizedName
                        )
                    ) {
                        throw new Error(
                            '已阻止未授权的WebDAV请求头：' +
                            name
                        );
                    }

                    const headerValue =
                        String(
                            source[name] == null
                                ? ''
                                : source[name]
                        );

                    if (
                        headerValue.length >
                        16384
                    ) {
                        throw new Error(
                            'WebDAV请求头内容过长。'
                        );
                    }

                    headers[name] =
                        headerValue;
                }
            );

        return headers;
    }

    function responseDetail(
        requestId,
        value
    ) {
        return Object.assign(
            {
                requestId:
                    requestId,
                ok: false,
                status: 0,
                statusText: '',
                text: '',
                responseHeaders: '',
                error: ''
            },
            value || {}
        );
    }

    function dispatchResponse(
        value
    ) {
        document.dispatchEvent(
            new CustomEvent(
                RESPONSE_EVENT_NAME,
                {
                    detail:
                        JSON.stringify(
                            value
                        )
                }
            )
        );
    }

    function parseRequest(
        event
    ) {
        let request = null;

        try {
            request =
                JSON.parse(
                    String(
                        event &&
                        event.detail ||
                        ''
                    )
                );
        } catch (error) {
            throw new Error(
                'WebDAV跨域请求数据格式无效。'
            );
        }

        if (
            !request ||
            typeof request !== 'object' ||
            Array.isArray(request)
        ) {
            throw new Error(
                'WebDAV跨域请求数据格式无效。'
            );
        }

        const requestId =
            String(
                request.requestId ||
                ''
            );

        if (
            !/^wd-[a-z0-9-]{12,160}$/i
                .test(requestId)
        ) {
            throw new Error(
                'WebDAV跨域请求标识无效。'
            );
        }

        const method =
            String(
                request.method ||
                'GET'
            ).toUpperCase();

        if (
            !ALLOWED_METHODS.has(
                method
            )
        ) {
            throw new Error(
                '已阻止未授权的WebDAV方法：' +
                method
            );
        }

        const body =
            request.body == null
                ? null
                : String(
                    request.body
                );

        if (
            body &&
            body.length >
                MAX_REQUEST_BODY_LENGTH
        ) {
            throw new Error(
                'WebDAV备份内容超过64MB安全上限。'
            );
        }

        return {
            requestId:
                requestId,
            method:
                method,
            url:
                assertAllowedTarget(
                    request.url
                ),
            headers:
                sanitizeHeaders(
                    request.headers
                ),
            body:
                body,
            timeout:
                Math.min(
                    Math.max(
                        Number(
                            request.timeout
                        ) ||
                        20000,
                        3000
                    ),
                    120000
                )
        };
    }

    function handleRequest(
        event
    ) {
        let requestId = '';
        let request = null;

        try {
            let raw = null;

            try {
                raw =
                    JSON.parse(
                        String(
                            event &&
                            event.detail ||
                            ''
                        )
                    );
            } catch (error) {
                raw = null;
            }

            requestId =
                String(
                    raw &&
                    raw.requestId ||
                    ''
                );

            request =
                parseRequest(event);

            requestId =
                request.requestId;
        } catch (error) {
            if (requestId) {
                dispatchResponse(
                    responseDetail(
                        requestId,
                        {
                            error:
                                error.message
                        }
                    )
                );
            }

            return;
        }

        const requester =
            gmRequester();

        if (!requester) {
            dispatchResponse(
                responseDetail(
                    requestId,
                    {
                        error:
                            '油猴未授予GM_xmlhttpRequest权限，请重新安装或更新跨域传输助手。'
                    }
                )
            );
            return;
        }

        try {
            requester({
                method:
                    request.method,
                url:
                    request.url,
                headers:
                    request.headers,
                data:
                    request.body == null
                        ? undefined
                        : request.body,
                timeout:
                    request.timeout,
                responseType:
                    'text',
                anonymous:
                    true,
                redirect:
                    'follow',
                onload:
                    function (response) {
                        dispatchResponse(
                            responseDetail(
                                requestId,
                                {
                                    ok: true,
                                    status:
                                        Number(
                                            response &&
                                            response.status
                                        ) ||
                                        0,
                                    statusText:
                                        String(
                                            response &&
                                            response.statusText ||
                                            ''
                                        ),
                                    text:
                                        String(
                                            response &&
                                            response.responseText ||
                                            ''
                                        ),
                                    responseHeaders:
                                        String(
                                            response &&
                                            response.responseHeaders ||
                                            ''
                                        )
                                }
                            )
                        );
                    },
                onerror:
                    function (response) {
                        dispatchResponse(
                            responseDetail(
                                requestId,
                                {
                                    error:
                                        'WebDAV网络请求失败' +
                                        (
                                            response &&
                                            response.error
                                                ? '：' +
                                                    response.error
                                                : '。'
                                        )
                                }
                            )
                        );
                    },
                ontimeout:
                    function () {
                        dispatchResponse(
                            responseDetail(
                                requestId,
                                {
                                    error:
                                        'WebDAV网络请求超时。'
                                }
                            )
                        );
                    },
                onabort:
                    function () {
                        dispatchResponse(
                            responseDetail(
                                requestId,
                                {
                                    error:
                                        'WebDAV网络请求已中止。'
                                }
                            )
                        );
                    }
            });
        } catch (error) {
            dispatchResponse(
                responseDetail(
                    requestId,
                    {
                        error:
                            '无法启动WebDAV跨域请求：' +
                            error.message
                    }
                )
            );
        }
    }

    function installTransport() {
        const root =
            document.documentElement;

        if (!root) {
            setTimeout(
                installTransport,
                20
            );
            return;
        }

        if (
            root.hasAttribute(
                READY_ATTRIBUTE
            )
        ) {
            return;
        }

        if (!gmRequester()) {
            root.setAttribute(
                READY_ATTRIBUTE,
                'error'
            );

            document.dispatchEvent(
                new CustomEvent(
                    READY_EVENT_NAME,
                    {
                        detail:
                            JSON.stringify({
                                version:
                                    VERSION,
                                ready: false
                            })
                    }
                )
            );
            return;
        }

        document.addEventListener(
            REQUEST_EVENT_NAME,
            handleRequest
        );

        root.setAttribute(
            READY_ATTRIBUTE,
            VERSION
        );

        document.dispatchEvent(
            new CustomEvent(
                READY_EVENT_NAME,
                {
                    detail:
                        JSON.stringify({
                            version:
                                VERSION,
                            ready: true
                        })
                }
            )
        );
    }

    installTransport();

    /******************************************************************
     * v1.0.1：向悬浮框管理器注册本助手当前运行源码。
     * 只提供源码快照，不提供任何连接配置或账号密码。
     ******************************************************************/

    function webdavHelperSelfSourceText() {
        const header = [
            "// ==UserScript==",
            "// @name         智慧医疗－WebDAV跨域传输助手",
            "// @namespace    http://tampermonkey.net/",
            "// @version      1.0.1",
            "// @description  v1.0.1：为悬浮框管理器提供受限GM_xmlhttpRequest跨域WebDAV传输，并注册当前助手源码供版本化WebDAV源码备份；无需服务器开放CORS",
            "// @match        *://11.12.199.244:8003/*",
            "// @grant        GM_xmlhttpRequest",
            "// @grant        unsafeWindow",
            "// @connect      *",
            "// @run-at       document-start",
            "// @noframes",
            "// ==/UserScript==",
            ""
        ].join('\n');

        return (
            header +
            '(' +
            Function.prototype.toString.call(
                medicalWebdavTransportHelperMain
            ) +
            ')();\n'
        );
    }

    function registerWebdavHelperSourceBackup() {
        let page = window;

        try {
            if (
                typeof unsafeWindow !==
                    'undefined' &&
                unsafeWindow
            ) {
                page = unsafeWindow;
            }
        } catch (error) {
            page = window;
        }

        const provider = {
            id: 'webdav-helper',
            name:
                '智慧医疗－WebDAV跨域传输助手',
            version:
                VERSION,
            role:
                'transport-helper',
            fileName:
                '智慧医疗－WebDAV跨域传输助手_v' +
                VERSION +
                '.user.js',
            exportSource:
                webdavHelperSelfSourceText
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
                    .register(provider);
            } else {
                const queue =
                    Array.isArray(
                        page.__medicalUserscriptSourceBackupQueueV1
                    )
                        ? page.__medicalUserscriptSourceBackupQueueV1
                        : [];

                queue.push(provider);
                page.__medicalUserscriptSourceBackupQueueV1 =
                    queue;
            }
        } catch (error) {
            // 源码备份注册失败不影响WebDAV传输功能。
        }
    }

    registerWebdavHelperSourceBackup();

})();
