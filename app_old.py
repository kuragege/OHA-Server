from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"

if not CONFIG_PATH.exists():
    raise RuntimeError(
        "缺少 server/config.json。请先复制 config.example.json 为 config.json 并修改。"
    )

CONFIG: Dict[str, Any] = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
DB_PATH = BASE_DIR / "data" / "openhisassistant.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="OpenHisAssistant Server", version="0.2.0")


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=20)
    conn.row_factory = sqlite3.Row
    return conn


def now_ts() -> int:
    return int(time.time())


def pbkdf2_hash(password: str, salt: bytes, iterations: int = 310_000) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )


def password_encode(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = pbkdf2_hash(password, salt)
    return (
        "pbkdf2_sha256$310000$"
        + base64.b64encode(salt).decode("ascii")
        + "$"
        + base64.b64encode(digest).decode("ascii")
    )


def password_verify(password: str, encoded: str) -> bool:
    try:
        scheme, iterations_text, salt_b64, digest_b64 = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def token_hash(token: str) -> str:
    secret = str(CONFIG.get("server_secret") or "")
    if not secret:
        raise RuntimeError("server_secret 未配置")
    return hmac.new(
        secret.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def init_db() -> None:
    with db_connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'doctor',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                device_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_token
                ON sessions(token_hash);
            """
        )

        count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if count == 0:
            username = str(CONFIG.get("bootstrap_admin_username") or "admin").strip()
            password = str(CONFIG.get("bootstrap_admin_password") or "")
            if not password:
                raise RuntimeError(
                    "数据库为空，但 bootstrap_admin_password 未配置，无法建立首个管理员。"
                )
            t = now_ts()
            conn.execute(
                """
                INSERT INTO users(username, password_hash, role, enabled, created_at, updated_at)
                VALUES(?, ?, 'admin', 1, ?, ?)
                """,
                (username, password_encode(password), t, t),
            )
            conn.commit()
            print(f"[OpenHisAssistant] 已建立首个管理员：{username}")


init_db()


class LoginRequest(BaseModel):
    username: str
    password: str
    deviceId: str = Field(min_length=3, max_length=200)


class LoginResponse(BaseModel):
    token: str
    expiresAt: int
    username: str
    role: str


class GmProxyRequest(BaseModel):
    method: str = "POST"
    url: str
    headers: Dict[str, str] = Field(default_factory=dict)
    data: Optional[str] = None
    timeout: int = 120000


class AiChatRequest(BaseModel):
    model: Optional[str] = None
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    response_format: Optional[Dict[str, Any]] = None
    timeout: int = 120000


def require_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="缺少访问令牌")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="访问令牌为空")

    hashed = token_hash(token)
    current = now_ts()

    with db_connect() as conn:
        row = conn.execute(
            """
            SELECT
                s.id AS session_id,
                s.expires_at,
                s.device_id,
                u.id AS user_id,
                u.username,
                u.role,
                u.enabled
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
            """,
            (hashed,),
        ).fetchone()

        if not row:
            raise HTTPException(status_code=401, detail="访问令牌无效")

        if not int(row["enabled"]):
            raise HTTPException(status_code=403, detail="账号已禁用")

        if int(row["expires_at"]) <= current:
            conn.execute("DELETE FROM sessions WHERE id = ?", (row["session_id"],))
            conn.commit()
            raise HTTPException(status_code=401, detail="登录已过期")

        conn.execute(
            "UPDATE sessions SET last_seen_at = ? WHERE id = ?",
            (current, row["session_id"]),
        )
        conn.commit()

        return dict(row)


def load_manifest() -> Dict[str, Any]:
    manifest_rel = str(CONFIG.get("module_manifest") or "modules/manifest.json")
    manifest_path = (BASE_DIR / manifest_rel).resolve()
    modules_root = (BASE_DIR / "modules").resolve()

    if modules_root not in manifest_path.parents:
        raise RuntimeError("module_manifest 必须位于 server/modules 下")

    return json.loads(manifest_path.read_text(encoding="utf-8"))


def module_path_for_item(item: Dict[str, Any]) -> Path:
    file_name = str(item.get("file") or "")
    if not file_name:
        raise RuntimeError("模块文件未配置")

    modules_dir = (BASE_DIR / "modules").resolve()
    module_path = (modules_dir / file_name).resolve()

    if modules_dir not in module_path.parents:
        raise RuntimeError("非法模块路径")

    return module_path


def module_sha256(item: Dict[str, Any]) -> str:
    module_path = module_path_for_item(item)
    if not module_path.exists():
        raise RuntimeError("模块文件不存在：" + module_path.name)
    # 必须按“实际下发给客户端的 UTF-8 文本”计算，而不是直接对磁盘原始
    # 字节计算，避免 Windows CRLF 在 read_text() 后被规范化为 LF 导致客户端
    # 校验值不一致。
    source = module_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
    return "sha256:" + digest


def allowed_modules_for_role(role: str) -> List[Dict[str, Any]]:
    manifest = load_manifest()
    result: List[Dict[str, Any]] = []

    for item in manifest.get("modules", []):
        if not item.get("enabled", False):
            continue
        roles = item.get("roles") or []
        if roles and role not in roles:
            continue
        result.append(item)

    result.sort(key=lambda x: (int(x.get("priority") or 100), str(x.get("name") or "")))
    return result


@app.get("/api/ping")
def ping():
    return {
        "ok": True,
        "name": "OpenHisAssistant Server",
        "version": "0.2.0",
        "time": now_ts(),
    }


@app.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest):
    username = body.username.strip()
    if not username or not body.password:
        raise HTTPException(status_code=400, detail="用户名或密码为空")

    with db_connect() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (username,),
        ).fetchone()

        if not user or not int(user["enabled"]):
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        if not password_verify(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        token = secrets.token_urlsafe(48)
        current = now_ts()
        hours = max(1, int(CONFIG.get("session_hours") or 8))
        expires = current + hours * 3600

        # 同一设备同一用户只保留最近会话。
        conn.execute(
            "DELETE FROM sessions WHERE user_id = ? AND device_id = ?",
            (user["id"], body.deviceId),
        )
        conn.execute(
            """
            INSERT INTO sessions(
                user_id, token_hash, device_id,
                created_at, expires_at, last_seen_at
            )
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                token_hash(token),
                body.deviceId,
                current,
                expires,
                current,
            ),
        )
        conn.commit()

        return LoginResponse(
            token=token,
            expiresAt=expires,
            username=user["username"],
            role=user["role"],
        )


@app.post("/api/auth/logout")
def logout(
    authorization: Optional[str] = Header(default=None),
    user: Dict[str, Any] = Depends(require_user),
):
    token = authorization.split(" ", 1)[1].strip()
    with db_connect() as conn:
        conn.execute(
            "DELETE FROM sessions WHERE token_hash = ?",
            (token_hash(token),),
        )
        conn.commit()
    return {"ok": True}


@app.get("/api/modules/manifest")
def get_module_manifest(user: Dict[str, Any] = Depends(require_user)):
    modules = allowed_modules_for_role(user["role"])
    safe_modules = []
    for item in modules:
        safe_modules.append(
            {
                "name": item["name"],
                "displayName": item.get("displayName", item["name"]),
                "version": item.get("version", ""),
                "hosts": item.get("hosts") or [],
                "paths": item.get("paths") or [],
                "dependencies": item.get("dependencies") or [],
                "priority": int(item.get("priority") or 100),
                "channel": str(item.get("channel") or "stable"),
                "hash": str(item.get("hash") or module_sha256(item)),
            }
        )
    return {
        "schemaVersion": 2,
        "modules": safe_modules,
    }


@app.get("/api/modules/{module_name}", response_class=PlainTextResponse)
def get_module(module_name: str, user: Dict[str, Any] = Depends(require_user)):
    allowed = {
        item["name"]: item
        for item in allowed_modules_for_role(user["role"])
    }

    item = allowed.get(module_name)
    if not item:
        raise HTTPException(status_code=404, detail="模块不存在或无权限")

    try:
        module_path = module_path_for_item(item)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if not module_path.exists():
        raise HTTPException(status_code=404, detail="模块文件不存在")

    return PlainTextResponse(
        module_path.read_text(encoding="utf-8"),
        media_type="application/javascript; charset=utf-8",
    )


def _deepseek_proxy_settings() -> tuple[Dict[str, str], Optional[Dict[str, str]]]:
    api_key = str(CONFIG.get("deepseek_api_key") or "").strip()
    if not api_key or api_key.startswith("sk-REPLACE"):
        raise HTTPException(status_code=500, detail="服务器尚未配置 DeepSeek API Key")

    headers = {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
    }

    proxy_url = str(CONFIG.get("clash_http_proxy") or "").strip()
    proxies = None
    if proxy_url:
        proxies = {
            "http": proxy_url,
            "https": proxy_url,
        }

    return headers, proxies


@app.post("/api/ai/chat")
def ai_chat(
    body: AiChatRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages 不能为空")

    default_model = str(CONFIG.get("deepseek_default_model") or "deepseek-chat").strip()
    model = str(body.model or default_model).strip()

    allowed_models = set(CONFIG.get("deepseek_allowed_models") or [default_model, "deepseek-reasoner"])
    if model not in allowed_models:
        raise HTTPException(status_code=403, detail="请求模型不在服务器白名单")

    api_base = str(CONFIG.get("deepseek_api_base") or "https://api.deepseek.com").rstrip("/")
    api_url = api_base + "/chat/completions"

    payload: Dict[str, Any] = {
        "model": model,
        "messages": body.messages,
        "stream": False,
    }

    if body.temperature is not None:
        payload["temperature"] = body.temperature
    if body.max_tokens is not None:
        payload["max_tokens"] = body.max_tokens
    if body.response_format is not None:
        payload["response_format"] = body.response_format

    headers, proxies = _deepseek_proxy_settings()
    timeout_seconds = max(5, min(180, int(body.timeout or 120000) / 1000))

    try:
        response = requests.post(
            api_url,
            headers=headers,
            json=payload,
            timeout=timeout_seconds,
            proxies=proxies,
        )
    except requests.Timeout:
        return {
            "ok": False,
            "timeout": True,
            "status": 0,
            "data": None,
            "error": "服务器访问 DeepSeek 超时",
        }
    except requests.RequestException as exc:
        return {
            "ok": False,
            "status": 0,
            "data": None,
            "error": "服务器访问 DeepSeek 失败：" + str(exc),
        }

    try:
        data: Any = response.json()
    except ValueError:
        data = {"raw": response.text}

    ok = 200 <= response.status_code < 300
    error_text = ""
    if not ok:
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                error_text = str(err.get("message") or err)
            elif err:
                error_text = str(err)
        if not error_text:
            error_text = "DeepSeek 返回 HTTP " + str(response.status_code)

    return {
        "ok": ok,
        "status": response.status_code,
        "data": data,
        "error": error_text,
    }


@app.post("/api/proxy/gm")
def proxy_gm(
    body: GmProxyRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    method = body.method.upper().strip()
    if method != "POST":
        raise HTTPException(status_code=400, detail="兼容代理当前仅允许 POST")

    parsed = urlparse(body.url)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="仅允许 HTTPS 目标")

    allowed_hosts = set(CONFIG.get("deepseek_allowed_hosts") or ["api.deepseek.com"])
    if parsed.hostname not in allowed_hosts:
        raise HTTPException(status_code=403, detail="目标域名不在服务器白名单")

    api_key = str(CONFIG.get("deepseek_api_key") or "").strip()
    if not api_key or api_key.startswith("sk-REPLACE"):
        raise HTTPException(status_code=500, detail="服务器尚未配置 DeepSeek API Key")

    headers = {
        str(k): str(v)
        for k, v in (body.headers or {}).items()
        if str(k).lower() not in {
            "authorization",
            "host",
            "content-length",
            "connection",
            "proxy-authorization",
        }
    }
    headers["Authorization"] = "Bearer " + api_key
    headers.setdefault("Content-Type", "application/json")

    proxy_url = str(CONFIG.get("clash_http_proxy") or "").strip()
    proxies = None
    if proxy_url:
        proxies = {
            "http": proxy_url,
            "https": proxy_url,
        }

    timeout_seconds = max(5, min(180, int(body.timeout or 120000) / 1000))

    try:
        response = requests.post(
            body.url,
            headers=headers,
            data=body.data or "",
            timeout=timeout_seconds,
            proxies=proxies,
        )
    except requests.Timeout:
        return JSONResponse(
            status_code=504,
            content={
                "ok": False,
                "timeout": True,
                "status": 0,
                "responseText": "",
                "error": "服务器访问 DeepSeek 超时",
            },
        )
    except requests.RequestException as exc:
        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "status": 0,
                "responseText": "",
                "error": "服务器访问 DeepSeek 失败：" + str(exc),
            },
        )

    return {
        "ok": True,
        "status": response.status_code,
        "responseText": response.text,
        "responseHeaders": dict(response.headers),
    }


if __name__ == "__main__":
    certfile = str(CONFIG.get("ssl_certfile") or "").strip()
    keyfile = str(CONFIG.get("ssl_keyfile") or "").strip()

    kwargs = {}
    if certfile and keyfile:
        kwargs["ssl_certfile"] = str((BASE_DIR / certfile).resolve())
        kwargs["ssl_keyfile"] = str((BASE_DIR / keyfile).resolve())

    uvicorn.run(
        "app:app",
        host=str(CONFIG.get("bind_host") or "0.0.0.0"),
        port=int(CONFIG.get("bind_port") or 8088),
        reload=False,
        **kwargs,
    )
