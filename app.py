from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import shutil
import sqlite3
import tempfile
import time
import zipfile
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import quote, unquote, urlparse

import requests
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"

if not CONFIG_PATH.exists():
    raise RuntimeError(
        "缺少 server/config.json。请先复制 config.example.json 为 config.json 并修改。"
    )

CONFIG: Dict[str, Any] = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
DB_PATH = BASE_DIR / "data" / "openhisassistant.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="OpenHisAssistant Server", version="0.4.16.16")

# OpenHisAssistant 无代理直连会话。
# requests 默认会读取系统/环境代理；Windows 上即使 config.json 未配置代理，
# 仍可能继承系统代理。trust_env=False 可明确禁止这一行为。
DIRECT_HTTP = requests.Session()
DIRECT_HTTP.trust_env = False


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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

            CREATE TABLE IF NOT EXISTS user_module_permissions (
                user_id INTEGER NOT NULL,
                module_name TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, module_name),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user
                ON user_module_permissions(user_id);

            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            -- 掌上 OpenHisAssistant：查房本快照。
            -- 只在明确调用同步接口时写入；根页面本身不会自动抓取或保存患者资料。
            CREATE TABLE IF NOT EXISTS mobile_round_book_snapshots (
                user_id INTEGER PRIMARY KEY,
                snapshot_json TEXT NOT NULL,
                source_label TEXT NOT NULL DEFAULT '',
                source_device_id TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 手机端手工查房记录独立保存，避免桌面端后续重新上传快照时覆盖手机笔记。
            CREATE TABLE IF NOT EXISTS mobile_round_book_notes (
                user_id INTEGER NOT NULL,
                record_key TEXT NOT NULL,
                date_key TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, record_key, date_key),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_round_book_notes_user_date
                ON mobile_round_book_notes(user_id, date_key);

            -- v0.3：掌上OHA独立查房备注字典。
            -- 以病案号/住院号作为患者索引，不再与桌面记录键和日期耦合。
            CREATE TABLE IF NOT EXISTS mobile_round_book_note_dictionary (
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, admission_no),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_round_book_note_dictionary_user
                ON mobile_round_book_note_dictionary(user_id);

            -- v0.3：掌上备注“推送到云端”的只读版本。
            -- 桌面查房本快照仍保持独立，后续桌面重新同步不会覆盖掌上备注字典。
            CREATE TABLE IF NOT EXISTS mobile_round_book_note_pushes (
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                date_key TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, admission_no, date_key),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_round_book_note_pushes_user_date
                ON mobile_round_book_note_pushes(user_id, date_key);

            -- 掌上OHA v0.7：AI诊疗方案分析共享缓存。
            -- 单患者和当前筛选患者批量分析以同一“账号+病案号+查房日期”索引读写。
            CREATE TABLE IF NOT EXISTS mobile_treatment_analysis_cache (
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                date_key TEXT NOT NULL,
                result_text TEXT NOT NULL,
                source_mode TEXT NOT NULL DEFAULT 'single',
                analyzed_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, admission_no, date_key),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_treatment_analysis_user_date
                ON mobile_treatment_analysis_cache(user_id, date_key, analyzed_at DESC);

            -- 掌上OHA：医保一致性校验独立缓存，按账号、患者及查房日期隔离。
            CREATE TABLE IF NOT EXISTS mobile_insurance_consistency_cache (
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                date_key TEXT NOT NULL,
                result_text TEXT NOT NULL,
                output_format TEXT NOT NULL DEFAULT 'plain',
                analyzed_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, admission_no, date_key),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_mobile_insurance_user_date
                ON mobile_insurance_consistency_cache(user_id, date_key, analyzed_at DESC);

            -- 中止标记在单次AI请求完成前检查，避免已中止请求覆盖历史缓存。
            CREATE TABLE IF NOT EXISTS mobile_insurance_cancelled_runs (
                user_id INTEGER NOT NULL,
                run_id TEXT NOT NULL,
                cancelled_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, run_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 掌上OHA：ICD-10诊断预测独立缓存，按账号、患者及查房日期隔离。
            CREATE TABLE IF NOT EXISTS mobile_icd_diagnosis_prediction_cache (
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                date_key TEXT NOT NULL,
                result_text TEXT NOT NULL,
                output_format TEXT NOT NULL DEFAULT 'plain',
                analyzed_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, admission_no, date_key),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_mobile_icd_prediction_user_date
                ON mobile_icd_diagnosis_prediction_cache(user_id, date_key, analyzed_at DESC);

            -- 中止标记在单次AI请求完成前检查，避免已中止请求覆盖历史缓存。
            CREATE TABLE IF NOT EXISTS mobile_icd_prediction_cancelled_runs (
                user_id INTEGER NOT NULL,
                run_id TEXT NOT NULL,
                cancelled_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, run_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 掌上OHA v0.7：按病案号隔离的患者附件元数据。
            -- 文件本体保存在server/data/mobile_patient_attachments，数据库只保存安全相对路径。
            CREATE TABLE IF NOT EXISTS mobile_patient_attachments (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                original_name TEXT NOT NULL,
                stored_path TEXT NOT NULL UNIQUE,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_patient_attachments_patient
                ON mobile_patient_attachments(user_id, admission_no, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_mobile_patient_attachments_hash
                ON mobile_patient_attachments(user_id, admission_no, sha256);

            -- 掌上OHA v0.5：患者卡片折叠项为管理员维护的全局云端配置。
            -- 所有账号读取同一份顺序，普通账号没有写入权限。
            CREATE TABLE IF NOT EXISTS mobile_global_preferences (
                preference_key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_by INTEGER,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
            );

            -- 掌上OHA v0.5：AI助手和住院视图偏好按OHA账号保存。
            CREATE TABLE IF NOT EXISTS mobile_user_preferences (
                user_id INTEGER PRIMARY KEY,
                preferences_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            -- 掌上OHA v1.16.17：账号级便签。
            -- 服务端数据库是唯一真源；revision用于多端乐观并发控制，
            -- 防止另一设备已经更新后旧页面静默覆盖新内容。
            CREATE TABLE IF NOT EXISTS mobile_account_notes (
                user_id INTEGER NOT NULL,
                note_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                revision INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, note_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_account_notes_user_updated
                ON mobile_account_notes(user_id, updated_at DESC, note_id);

            -- 掌上OHA v1.6：按账号、病案号长期保存患者档案索引。
            -- 病案号/住院号是账号范围内唯一标识；当前快照仍由原表独立维护。
            CREATE TABLE IF NOT EXISTS mobile_patient_archive (
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                record_json TEXT NOT NULL DEFAULT '{}',
                first_seen_date TEXT NOT NULL DEFAULT '',
                last_seen_date TEXT NOT NULL DEFAULT '',
                discharged_date TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'ward',
                bed_no TEXT NOT NULL DEFAULT '',
                patient_name TEXT NOT NULL DEFAULT '',
                diagnosis TEXT NOT NULL DEFAULT '',
                drg_group TEXT NOT NULL DEFAULT '',
                admission_date TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, admission_no),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_patient_archive_user_period
                ON mobile_patient_archive(user_id, first_seen_date, last_seen_date);

            CREATE INDEX IF NOT EXISTS idx_mobile_patient_archive_user_drg
                ON mobile_patient_archive(user_id, drg_group);

            -- 每个日期节点保存当日卡片字段；历史节点不会因患者离开当前快照而丢失。
            CREATE TABLE IF NOT EXISTS mobile_patient_archive_days (
                user_id INTEGER NOT NULL,
                admission_no TEXT NOT NULL,
                date_key TEXT NOT NULL,
                record_json TEXT NOT NULL DEFAULT '{}',
                daily_json TEXT NOT NULL DEFAULT '{}',
                snapshot_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, admission_no, date_key),
                FOREIGN KEY(user_id, admission_no)
                    REFERENCES mobile_patient_archive(user_id, admission_no)
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_mobile_patient_archive_days_user_date
                ON mobile_patient_archive_days(user_id, date_key, admission_no);

            -- 记录最近已归档的当前快照版本，用于升级后自动、幂等补建旧数据。
            CREATE TABLE IF NOT EXISTS mobile_patient_archive_sync_state (
                user_id INTEGER PRIMARY KEY,
                snapshot_updated_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )

        # 已部署数据库原有诊疗分析缓存补齐输出格式，历史结果按纯文本展示。
        analysis_columns = {
            str(row["name"])
            for row in conn.execute("PRAGMA table_info(mobile_treatment_analysis_cache)")
        }
        if "output_format" not in analysis_columns:
            conn.execute(
                "ALTER TABLE mobile_treatment_analysis_cache "
                "ADD COLUMN output_format TEXT NOT NULL DEFAULT 'plain'"
            )

        # v0.4.1：旧“住院病案首页可编辑打印与诊断桥接”仅为测试模块，
        # 已从正式 Manifest 移除，同时清理历史用户权限残留。
        conn.execute(
            "DELETE FROM user_module_permissions WHERE module_name = ?",
            ("record-print-bridge",),
        )
        conn.commit()

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
    # OHA userscript bridge: when true, relay the upstream response incrementally.
    stream: bool = False


class AiChatRequest(BaseModel):
    model: Optional[str] = None
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    response_format: Optional[Dict[str, Any]] = None
    timeout: int = 120000
    stream: bool = False


class ChangePasswordRequest(BaseModel):
    oldPassword: str
    newPassword: str = Field(min_length=6, max_length=200)


class AdminCreateUserRequest(BaseModel):
    username: str
    password: str = Field(min_length=6, max_length=200)
    role: str = "doctor"


class AdminUpdateUserRequest(BaseModel):
    role: Optional[str] = None
    enabled: Optional[bool] = None


class AdminResetPasswordRequest(BaseModel):
    password: str = Field(min_length=6, max_length=200)


class AdminUserModulePermissionRequest(BaseModel):
    enabled: bool


class AdminUserFeaturePermissionRequest(BaseModel):
    enabled: bool


class AdminOrphanAttachmentCleanupRequest(BaseModel):
    confirmUserId: int
    expectedFiles: int = Field(ge=0)
    expectedBytes: int = Field(ge=0)


class AdminUserDataClearRequest(BaseModel):
    confirmUserId: int
    confirmUsername: str
    clearData: bool
    clearAttachments: bool
    expectedDataBytes: int = Field(ge=0)
    expectedDetails: Dict[str, int]
    expectedAttachmentRecords: int = Field(ge=0)
    expectedAttachmentFiles: int = Field(ge=0)
    expectedAttachmentBytes: int = Field(ge=0)


class AdminClientSettingsRequest(BaseModel):
    serverEndpointDisplay: str = "hidden"
    deepSeekProxyDisplay: str = "hidden"
    networkStatusVisible: bool = True
    ohaUiPanelEnabled: bool = True
    # 掌上OHA静态图片上传档位：strong=1920强压缩；light=2560轻压缩；original=原图。
    mobileImageCompressionMode: str = "light"
    deepSeekNavigationRestricted: bool = True
    deepSeekExternalNavigationAction: str = "block"
    deepSeekAllowedHosts: List[str] = Field(default_factory=lambda: ["deepseek.com"])
    # Empty home URLs keep existing client-config.json defaults for older deployments.
    hisHomeUrl: str = Field(default="", max_length=2048)
    deepSeekHomeUrl: str = Field(default="", max_length=2048)
    extensionBookmarks: List[Dict[str, str]] = Field(default_factory=list)
    extensionWindowShowDomain: bool = True
    deepSeekBookmarks: List[Dict[str, str]] = Field(default_factory=list)

    # v0.4.7：允许客户端在内网地址不可达时，使用管理员配置的 FRP 公网 HTTPS
    # 地址登录同一 OHA Server。客户端会把该地址缓存在本机，用于院外冷启动回退。
    publicAuthEnabled: bool = False
    publicAuthUrl: str = Field(default="", max_length=512)
    # v0.4.12：仅用于 FRP 公网 OHA 控制面。开启后允许客户端的 FRP 专用
    # HttpClient 接受自签名/不受信任/名称不匹配的 HTTPS 证书。
    # 这是兼容测试选项，默认关闭；不会影响 HIS、DeepSeek WebView2 或 SSTP 的 Schannel 校验。
    publicAuthAllowInvalidTls: bool = False

    # v0.4.7：统一的“远程接入”功能。继续兼容原 vpn* 字段和单用户权限键。
    # access mode = sstp 时使用 Windows RAS；http-proxy 时只给主 HIS WebView2
    # 配置 HTTP 代理，不创建额外虚拟网卡，也不影响独立 DeepSeek WebView2。
    vpnGlobalEnabled: bool = False
    vpnAccessMode: str = "sstp"
    vpnEntryName: str = Field(default="OpenHisAssistant Hospital VPN", max_length=256)
    vpnServerAddress: str = Field(default="", max_length=128)
    vpnUsername: str = Field(default="", max_length=256)
    vpnPassword: Optional[str] = Field(default=None, max_length=256)
    vpnClearPassword: bool = False
    # v0.4.8：SSTP 是否在客户端保留 Windows RAS 电话簿项。
    # False 时客户端每次 OHA 登录后和程序退出时清理该 VPN 配置。
    vpnKeepLocalProfile: bool = True
    httpProxyUrl: str = Field(default="", max_length=512)
    vpnRoutingMode: str = "split"
    vpnRoutes: List[str] = Field(default_factory=lambda: ["11.12.199.0/24"])


class AdminModuleCreateRequest(BaseModel):
    name: str
    displayName: Optional[str] = None
    version: Optional[str] = None
    file: Optional[str] = None
    source: str = Field(min_length=1, max_length=8_000_000)
    enabled: bool = True
    roles: List[str] = Field(default_factory=lambda: ["admin", "doctor"])
    matches: List[str] = Field(default_factory=list)
    runAt: str = "document-idle"
    grants: List[str] = Field(default_factory=list)
    connect: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    priority: int = 100
    channel: str = "stable"
    userControllable: bool = True
    defaultUserEnabled: bool = False


class AdminModuleUpdateRequest(BaseModel):
    displayName: Optional[str] = None
    version: Optional[str] = None
    file: Optional[str] = None
    source: Optional[str] = Field(default=None, max_length=8_000_000)
    enabled: Optional[bool] = None
    roles: Optional[List[str]] = None
    matches: Optional[List[str]] = None
    runAt: Optional[str] = None
    grants: Optional[List[str]] = None
    connect: Optional[List[str]] = None
    dependencies: Optional[List[str]] = None
    priority: Optional[int] = None
    channel: Optional[str] = None
    userControllable: Optional[bool] = None
    defaultUserEnabled: Optional[bool] = None


class AdminModuleBackupRestoreRequest(BaseModel):
    overwrite: bool = True


class MobileRoundBookSnapshotRequest(BaseModel):
    snapshot: Dict[str, Any] = Field(default_factory=dict)
    sourceLabel: str = Field(default="查房本", max_length=120)


class MobileRoundBookNoteRequest(BaseModel):
    # v0.3优先使用病案号/住院号作为独立备注字典索引。
    # recordKey/dateKey仅保留给旧版掌上页面兼容。
    admissionNo: str = Field(default="", max_length=64)
    recordKey: str = Field(default="", max_length=256)
    dateKey: str = Field(default="", max_length=32)
    note: str = Field(default="", max_length=20000)


class MobileRoundBookNotesBatchRequest(BaseModel):
    notes: Dict[str, str] = Field(default_factory=dict)


class MobileRoundBookNotePushRequest(BaseModel):
    dateKey: str = Field(min_length=1, max_length=32)
    admissionNos: List[str] = Field(default_factory=list)


class MobileTreatmentAnalysisRequest(BaseModel):
    admissionNo: str = Field(min_length=1, max_length=64)
    dateKey: str = Field(min_length=1, max_length=32)
    sourceMode: str = Field(default="single", max_length=16)
    outputFormat: Optional[str] = Field(default=None, max_length=12)


class MobileInsuranceConsistencyRequest(BaseModel):
    admissionNo: str = Field(min_length=1, max_length=64)
    dateKey: str = Field(min_length=1, max_length=32)
    runId: str = Field(min_length=16, max_length=64)
    outputFormat: Optional[str] = Field(default=None, max_length=12)


class MobileInsuranceCancelRequest(BaseModel):
    runId: str = Field(min_length=16, max_length=64)


class MobileIcdDiagnosisPredictionRequest(BaseModel):
    admissionNo: str = Field(min_length=1, max_length=64)
    dateKey: str = Field(min_length=1, max_length=32)
    runId: str = Field(min_length=16, max_length=64)
    outputFormat: Optional[str] = Field(default=None, max_length=12)


class MobileIcdPredictionCancelRequest(BaseModel):
    runId: str = Field(min_length=16, max_length=64)


class MobileAccountNoteCreateRequest(BaseModel):
    title: str = Field(default="", max_length=120)
    content: str = Field(default="", max_length=50000)


class MobileAccountNoteUpdateRequest(BaseModel):
    title: str = Field(default="", max_length=120)
    content: str = Field(default="", max_length=50000)
    expectedRevision: int = Field(ge=1)


class MobileAccountNoteDeleteRequest(BaseModel):
    expectedRevision: int = Field(ge=1)


class MobileAttachmentRenameRequest(BaseModel):
    fileName: str = Field(min_length=1, max_length=180)


class MobileAttachmentVisionRequest(BaseModel):
    prompt: str = Field(default="", max_length=6000)


class MobileGlobalPreferencesRequest(BaseModel):
    patientSectionOrder: List[str] = Field(default_factory=list)


class MobileUserPreferencesRequest(BaseModel):
    assistant: Dict[str, Any] = Field(default_factory=dict)
    # v1.16.23：AI助手页面上下文隐私保护按账号保存；Optional兼容旧移动页。
    privacy: Optional[Dict[str, Any]] = None
    readability: Optional[Dict[str, Any]] = None
    inpatient: Dict[str, Any] = Field(default_factory=dict)
    # v1.16.7：基本情况医嘱可视化的三个筛选/排序开关按账号云端保存。
    # Optional用于兼容仍在使用旧移动页面的客户端：旧客户端未发送该字段时，
    # 服务端保留账号现有设置，而不是重置为默认值。
    orderVisual: Optional[Dict[str, Any]] = None
    # v1.16.11：AI提供商按OHA账号独立保存；旧客户端不发送时保留原选择。
    aiProvider: Optional[str] = None
    # v1.16.15：附件识图自定义提示词按OHA账号保存。空字符串表示跟随系统默认；
    # Optional用于兼容旧移动页，旧客户端未发送时保留账号现有覆盖值。
    attachmentVisionPrompt: Optional[str] = Field(default=None, max_length=6000)


class AdminAiProvidersRequest(BaseModel):
    providers: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class MobileArchiveBulkRequest(BaseModel):
    admissionNos: List[str] = Field(default_factory=list)
    allMatched: bool = False
    includeAttachments: bool = True
    query: str = Field(default="", max_length=300)
    hasAttachments: str = Field(default="any", max_length=16)
    drgGroup: str = Field(default="", max_length=300)
    status: str = Field(default="all", max_length=24)
    dateFrom: str = Field(default="", max_length=32)
    dateTo: str = Field(default="", max_length=32)


class MobileArchiveClearAttachmentsRequest(MobileArchiveBulkRequest):
    # 患者档案库“清除附件”属于不可逆高风险操作，必须使用当前登录账号密码二次验证。
    password: str = Field(min_length=1, max_length=200)


class MobileArchiveClearRequest(MobileArchiveBulkRequest):
    # 患者档案库“清除档案”会删除整份历史及附件，同样必须二次验证。
    password: str = Field(min_length=1, max_length=200)


class AdminModuleWebdavSettingsRequest(BaseModel):
    endpoint: str = Field(default="", max_length=2048)
    username: str = Field(default="", max_length=256)
    password: Optional[str] = Field(default=None, max_length=512)
    clearPassword: bool = False
    verifyTls: bool = True


class AdminModuleWebdavApplyRequest(BaseModel):
    modules: List[str] = Field(default_factory=list)
    force: bool = False


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


ALLOWED_ROLES = {"admin", "doctor", "nurse"}


def normalize_username(value: str) -> str:
    username = (value or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    if len(username) > 64:
        raise HTTPException(status_code=400, detail="用户名不能超过 64 个字符")
    if any(ord(ch) < 32 for ch in username):
        raise HTTPException(status_code=400, detail="用户名包含非法控制字符")
    if "/" in username or "\\" in username:
        raise HTTPException(status_code=400, detail="用户名不能包含 / 或 \\")
    return username


def normalize_role(value: str) -> str:
    role = (value or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail="role 仅允许：admin / doctor / nurse",
        )
    return role


def require_admin(user: Dict[str, Any] = Depends(require_user)) -> Dict[str, Any]:
    if str(user.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可执行此操作")
    return user


def enabled_admin_count(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND enabled = 1"
    ).fetchone()
    return int(row["c"] if row else 0)


def ensure_admin_survives(
    conn: sqlite3.Connection,
    target: sqlite3.Row,
    new_role: Optional[str] = None,
    new_enabled: Optional[bool] = None,
    deleting: bool = False,
) -> None:
    if str(target["role"]).lower() != "admin" or not int(target["enabled"]):
        return

    remains_admin = not deleting
    if new_role is not None and new_role != "admin":
        remains_admin = False
    if new_enabled is not None and not new_enabled:
        remains_admin = False

    if not remains_admin and enabled_admin_count(conn) <= 1:
        raise HTTPException(status_code=400, detail="至少必须保留一个已启用的管理员账号")


CLIENT_DISPLAY_MODES = {"full", "masked", "hidden"}
MOBILE_IMAGE_COMPRESSION_MODES = {"strong", "light", "original"}


def normalize_mobile_image_compression_mode(value: Any) -> str:
    mode = str(value or "light").strip().lower()
    return mode if mode in MOBILE_IMAGE_COMPRESSION_MODES else "light"
OHA_UI_FEATURE_KEY = "__oha_ui_panel__"
SETTINGS_BUTTON_FEATURE_KEY = "__settings_button__"
SSTP_VPN_FEATURE_KEY = "__sstp_vpn__"

# v0.4.8：仅分发 SSTP 服务器/签发 CA 的“公钥证书”。
# 服务器私钥（.key）绝不能上传或下发到 OHA 客户端。
VPN_CERT_DIR = BASE_DIR / "vpn_certificates"
VPN_CERT_DIR.mkdir(parents=True, exist_ok=True)
VPN_CERT_PATH = VPN_CERT_DIR / "sstp-trust.cer"
VPN_CERT_MAX_BYTES = 1024 * 1024


# v1.16.13：OpenAI可单独配置HTTP代理；全局DIRECT_HTTP仍保持trust_env=False。
# v1.16.11：掌上OHA多AI提供商。API Key只保存在服务器system_settings，
# 移动端只取得可用提供商目录和当前账号选择，不下发任何密钥。
MOBILE_AI_PROVIDER_IDS = ("deepseek", "glm", "openai")
MOBILE_AI_PROVIDER_LABELS = {
    "deepseek": "DeepSeek",
    "glm": "GLM",
    "openai": "OpenAI",
}
MOBILE_AI_PROVIDER_DEFAULT_BASES = {
    "deepseek": "https://api.deepseek.com",
    "glm": "https://open.bigmodel.cn/api/paas/v4",
    "openai": "https://api.openai.com/v1",
}
MOBILE_AI_PROVIDER_DEFAULT_TEXT_MODELS = {
    "deepseek": "deepseek-chat",
    "glm": "glm-5.2",
    "openai": "",
}
MOBILE_AI_PROVIDER_DEFAULT_VISION_MODELS = {
    "deepseek": "deepseek-v4-flash-vision-exp",
    "glm": "glm-5v-turbo",
    "openai": "",
}


def normalize_mobile_ai_provider_id(value: Any) -> str:
    provider = str(value or "deepseek").strip().lower()
    return provider if provider in MOBILE_AI_PROVIDER_IDS else "deepseek"


def normalize_mobile_ai_api_base(value: Any, provider_id: str) -> str:
    base = str(value or MOBILE_AI_PROVIDER_DEFAULT_BASES.get(provider_id, "")).strip().rstrip("/")
    if not base:
        return ""
    parsed = urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail=MOBILE_AI_PROVIDER_LABELS.get(provider_id, provider_id) + " API Base必须是有效的http(s)地址")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="AI API Base不能包含账号密码、查询参数或#片段")
    return base


def normalize_mobile_ai_proxy_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parsed = urlparse(text)
    except Exception:
        parsed = None
    if not parsed or parsed.scheme.lower() != "http" or not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail="OpenAI独立代理必须是完整的HTTP代理地址，例如 http://127.0.0.1:7890",
        )
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="OpenAI独立代理暂不接受URL内嵌用户名或密码")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="OpenAI独立代理只填写主机和端口，不要附加路径或参数")
    try:
        port = parsed.port
    except ValueError:
        raise HTTPException(status_code=400, detail="OpenAI独立代理端口无效")
    if port is None:
        port = 80
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="OpenAI独立代理端口必须在 1-65535 之间")
    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = "[" + host + "]"
    return "http://" + host + ":" + str(port)


def _config_fallback_ai_key(provider_id: str) -> str:
    if provider_id != "deepseek":
        return ""
    return str(CONFIG.get("deepseek_api_key") or "").strip()


def _config_fallback_ai_base(provider_id: str) -> str:
    if provider_id == "deepseek":
        return str(CONFIG.get("deepseek_api_base") or MOBILE_AI_PROVIDER_DEFAULT_BASES[provider_id]).strip().rstrip("/")
    return MOBILE_AI_PROVIDER_DEFAULT_BASES[provider_id]


def _config_fallback_ai_text_model(provider_id: str) -> str:
    if provider_id == "deepseek":
        return str(CONFIG.get("deepseek_default_model") or MOBILE_AI_PROVIDER_DEFAULT_TEXT_MODELS[provider_id]).strip()
    return MOBILE_AI_PROVIDER_DEFAULT_TEXT_MODELS[provider_id]


def _config_fallback_ai_vision_model(provider_id: str) -> str:
    if provider_id == "deepseek":
        configured = str(CONFIG.get("deepseek_vision_model") or "").strip()
        return "deepseek-v4-flash-vision-exp" if configured in {"", "deepseek-v4-flash"} else configured
    return MOBILE_AI_PROVIDER_DEFAULT_VISION_MODELS[provider_id]


def mobile_ai_provider_settings(conn: sqlite3.Connection, include_key: bool = False) -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    for provider_id in MOBILE_AI_PROVIDER_IDS:
        prefix = "mobile.ai." + provider_id + "."
        default_enabled = provider_id == "deepseek"
        enabled = bool(read_system_setting(conn, prefix + "enabled", default_enabled))
        api_base = normalize_mobile_ai_api_base(
            read_system_setting(conn, prefix + "apiBase", _config_fallback_ai_base(provider_id)),
            provider_id,
        )
        text_model = str(read_system_setting(conn, prefix + "textModel", _config_fallback_ai_text_model(provider_id)) or "").strip()[:200]
        vision_model = str(read_system_setting(conn, prefix + "visionModel", _config_fallback_ai_vision_model(provider_id)) or "").strip()[:200]
        proxy_enabled = bool(read_system_setting(conn, prefix + "proxyEnabled", False)) if provider_id == "openai" else False
        proxy_url = normalize_mobile_ai_proxy_url(read_system_setting(conn, prefix + "proxyUrl", "")) if provider_id == "openai" else ""
        stored_key_value = read_system_setting(conn, prefix + "apiKey", None)
        api_key = (
            _config_fallback_ai_key(provider_id)
            if stored_key_value is None
            else str(stored_key_value or "").strip()
        )
        configured = bool(api_key and not api_key.startswith("sk-REPLACE"))
        item: Dict[str, Any] = {
            "id": provider_id,
            "label": MOBILE_AI_PROVIDER_LABELS[provider_id],
            "enabled": enabled,
            "apiBase": api_base,
            "textModel": text_model,
            "visionModel": vision_model,
            "proxyEnabled": proxy_enabled,
            "proxyUrl": proxy_url,
            "apiKeyConfigured": configured,
            "textReady": bool(enabled and configured and api_base and text_model),
            "visionReady": bool(enabled and configured and api_base and vision_model),
        }
        if include_key:
            item["apiKey"] = api_key
        result[provider_id] = item
    return result


def mobile_ai_public_catalog(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    settings = mobile_ai_provider_settings(conn, include_key=False)
    return [
        {
            "id": item["id"],
            "label": item["label"],
            "enabled": bool(item["enabled"]),
            "textReady": bool(item["textReady"]),
            "visionReady": bool(item["visionReady"]),
            "textModel": item["textModel"],
            "visionModel": item["visionModel"],
        }
        for item in settings.values()
        if item["enabled"]
    ]


def mobile_ai_selected_provider(conn: sqlite3.Connection, user_id: int, purpose: str = "text") -> Dict[str, Any]:
    user_preferences, _ = mobile_read_user_preferences(conn, user_id)
    selected = normalize_mobile_ai_provider_id(user_preferences.get("aiProvider"))
    settings = mobile_ai_provider_settings(conn, include_key=True)
    required = "visionReady" if purpose == "vision" else "textReady"
    item = settings.get(selected) or {}
    if item.get(required):
        return item
    # 管理员关闭/清空某提供商后，旧账号可能仍保存该选择。为避免整套AI直接不可用，
    # 按固定顺序回退到首个已配置提供商；移动端刷新后会把实际可选项同步回来。
    for provider_id in MOBILE_AI_PROVIDER_IDS:
        candidate = settings.get(provider_id) or {}
        if candidate.get(required):
            return candidate
    raise HTTPException(
        status_code=503,
        detail="服务器尚未配置可用的" + ("视觉" if purpose == "vision" else "文本") + "AI模型",
    )


def mobile_ai_chat_url(provider: Dict[str, Any]) -> str:
    base = str(provider.get("apiBase") or "").rstrip("/")
    return base if base.endswith("/chat/completions") else base + "/chat/completions"


def mobile_ai_headers(provider: Dict[str, Any]) -> Dict[str, str]:
    key = str(provider.get("apiKey") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail=str(provider.get("label") or "AI") + " API Key未配置")
    return {"Authorization": "Bearer " + key, "Content-Type": "application/json"}


def mobile_ai_request_kwargs(provider: Dict[str, Any]) -> Dict[str, Any]:
    """
    v1.16.13：仅OpenAI允许使用管理员显式配置的独立HTTP代理。
    DIRECT_HTTP继续trust_env=False，因此不会重新继承Windows/Clash全局环境代理；
    DeepSeek、GLM、WebDAV以及其它院内/外部请求仍保持原直连策略。
    """
    if str(provider.get("id") or "").strip().lower() != "openai":
        return {}
    if not bool(provider.get("proxyEnabled")):
        return {}
    proxy_url = normalize_mobile_ai_proxy_url(provider.get("proxyUrl"))
    if not proxy_url:
        raise HTTPException(status_code=500, detail="OpenAI已启用独立代理，但代理地址为空")
    return {
        "proxies": {
            "http": proxy_url,
            "https": proxy_url,
        }
    }

DEFAULT_CLIENT_SETTINGS: Dict[str, Any] = {
    "serverEndpointDisplay": "hidden",
    "deepSeekProxyDisplay": "hidden",
    "networkStatusVisible": True,
    "ohaUiPanelEnabled": False,
    "mobileImageCompressionMode": "light",
    "deepSeekNavigationRestricted": True,
    "deepSeekExternalNavigationAction": "block",
    "deepSeekAllowedHosts": ["deepseek.com"],
    "hisHomeUrl": "",
    "deepSeekHomeUrl": "",
    "extensionBookmarks": [],
    "extensionWindowShowDomain": True,
    "deepSeekBookmarks": [],
    "publicAuthEnabled": False,
    "publicAuthUrl": "",
    "publicAuthAllowInvalidTls": False,
    "vpnGlobalEnabled": False,
    "vpnAccessMode": "sstp",
    "vpnEntryName": "OpenHisAssistant Hospital VPN",
    "vpnServerAddress": "",
    "vpnUsername": "",
    "vpnPassword": "",
    "vpnKeepLocalProfile": True,
    "httpProxyUrl": "",
    "vpnRoutingMode": "split",
    "vpnRoutes": ["11.12.199.0/24"],
}



def _safe_certificate_filename(value: Any) -> str:
    name = Path(str(value or "").strip()).name
    name = "".join(ch for ch in name if ord(ch) >= 32 and ch not in "\r\n")
    return name[:200]


def sstp_certificate_info(conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    configured = VPN_CERT_PATH.is_file()
    filename = ""
    if conn is not None:
        filename = str(
            read_system_setting(conn, "client.vpnCertificateFileName", "") or ""
        ).strip()

    sha256 = ""
    size = 0
    if configured:
        try:
            data = VPN_CERT_PATH.read_bytes()
            size = len(data)
            sha256 = hashlib.sha256(data).hexdigest()
        except Exception:
            configured = False
            sha256 = ""
            size = 0

    return {
        "vpnCertificateConfigured": configured,
        "vpnCertificateFileName": filename if configured else "",
        "vpnCertificateSha256": sha256,
        "vpnCertificateSize": size,
    }


def validate_sstp_certificate_upload(filename: str, data: bytes) -> None:
    safe_name = _safe_certificate_filename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in {".cer", ".crt", ".der"}:
        raise HTTPException(
            status_code=400,
            detail="SSTP 证书只接受 .cer / .crt / .der 公钥证书；禁止上传 .key、.pfx 或其它私钥文件",
        )

    if not data:
        raise HTTPException(status_code=400, detail="证书文件为空")
    if len(data) > VPN_CERT_MAX_BYTES:
        raise HTTPException(status_code=400, detail="证书文件不能超过 1 MB")

    upper = data.upper()
    if (
        b"PRIVATE KEY" in upper
        or b"BEGIN RSA PRIVATE KEY" in upper
        or b"BEGIN EC PRIVATE KEY" in upper
        or b"BEGIN ENCRYPTED PRIVATE KEY" in upper
    ):
        raise HTTPException(
            status_code=400,
            detail="检测到私钥内容。OHA 客户端只应分发公钥证书，服务器 .key 私钥必须留在 VPN 服务器端",
        )

    # 常见 DER X.509 从 ASN.1 SEQUENCE(0x30) 开始；Base64 PEM 应包含 CERTIFICATE 标记。
    # 这里只做轻量格式门槛，最终证书解析由 Windows/.NET X509Certificate2 完成。
    stripped = data.lstrip()
    if not (stripped.startswith(b"0") or b"BEGIN CERTIFICATE" in upper):
        raise HTTPException(
            status_code=400,
            detail="文件不像常见 DER/Base64 X.509 证书，请确认导出的是 .cer/.crt 公钥证书",
        )


def normalize_deepseek_navigation_action(value: str) -> str:
    action = str(value or "").strip().lower()
    return action if action in {"block", "system", "allow"} else "block"


def normalize_deepseek_allowed_hosts(value: Any) -> List[str]:
    source = value if isinstance(value, list) else [value]
    result: List[str] = []

    for raw in source:
        text = str(raw or "").strip().lower()
        if not text:
            continue

        if text.startswith("*."):
            text = text[2:]
        text = text.lstrip(".")

        try:
            parsed = urlparse(text if "://" in text else "https://" + text)
            host = str(parsed.hostname or "").strip().lower().strip(".")
        except Exception:
            host = ""

        if not host:
            continue
        if not re.fullmatch(r"[a-z0-9.-]+", host):
            continue
        if host not in result:
            result.append(host)

    return result[:50] or ["deepseek.com"]


def normalize_client_page_url(value: Any, label: str, allow_empty: bool = False) -> str:
    url = str(value or "").strip()
    if not url and allow_empty:
        return ""
    if len(url) > 2048 or any(ord(ch) < 32 for ch in url) or "\\" in url:
        raise HTTPException(status_code=400, detail=label + "地址格式无效")
    try:
        parsed = urlparse(url)
        valid = parsed.scheme.lower() in {"http", "https"} and bool(parsed.hostname)
        _ = parsed.port  # Reject malformed port numbers.
    except ValueError:
        valid = False
    if not valid or parsed.username or parsed.password or not parsed.netloc:
        raise HTTPException(status_code=400, detail=label + "必须是完整的 http:// 或 https:// 地址，且不能含账号密码")
    return url


def normalize_client_bookmarks(value: Any, label: str) -> List[Dict[str, str]]:
    if not isinstance(value, list) or len(value) > 50:
        raise HTTPException(status_code=400, detail=label + "最多支持50条")
    result: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=label + "条目格式无效")
        name = str(item.get("name") or "").strip()
        if not name or len(name) > 80 or any(ord(ch) < 32 for ch in name):
            raise HTTPException(status_code=400, detail=label + "名称须为1至80字")
        url = normalize_client_page_url(item.get("url"), label + "“" + name + "”")
        if any(entry["name"] == name for entry in result):
            raise HTTPException(status_code=400, detail=label + "名称重复：" + name)
        result.append({"name": name, "url": url})
    return result


def normalize_display_mode(value: str, default: str = "hidden") -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in CLIENT_DISPLAY_MODES else default


def normalize_public_auth_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parsed = urlparse(text)
    except Exception:
        parsed = None
    if not parsed or parsed.scheme.lower() != "https" or not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail="FRP公网验证地址必须是完整 HTTPS 地址，例如 https://oha.example.com",
        )
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="FRP公网验证地址不能包含账号、密码、查询参数或锚点")
    if parsed.path not in {"", "/"}:
        raise HTTPException(status_code=400, detail="FRP公网验证地址请填写根地址，不要附加路径")
    return parsed.scheme.lower() + "://" + parsed.netloc.rstrip("/")


def normalize_vpn_access_mode(value: str) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in {"sstp", "http-proxy"} else "sstp"


def normalize_http_proxy_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parsed = urlparse(text)
    except Exception:
        parsed = None
    if not parsed or parsed.scheme.lower() != "http" or not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail="HTTP代理地址必须是完整 http:// 地址，例如 http://proxy.example.com:8080",
        )
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="当前 WebView2 HTTP代理模式不接受URL内嵌用户名或密码")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="HTTP代理地址只填写主机和端口，不要附加路径或参数")
    try:
        port = parsed.port
    except ValueError:
        raise HTTPException(status_code=400, detail="HTTP代理端口无效")
    if port is None:
        port = 80
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="HTTP代理端口必须在 1-65535 之间")
    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = "[" + host + "]"
    return "http://" + host + ":" + str(port)


def request_host_name(request: Request) -> str:
    raw = str(request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",", 1)[0].strip()
    if not raw:
        return ""
    try:
        return str(urlparse("//" + raw).hostname or "").lower().rstrip(".")
    except Exception:
        return ""


def is_public_auth_host(request: Request, settings: Dict[str, Any]) -> bool:
    public_url = str(settings.get("publicAuthUrl") or "").strip()
    if not public_url:
        return False
    try:
        public_host = str(urlparse(public_url).hostname or "").lower().rstrip(".")
    except Exception:
        return False
    return bool(public_host and request_host_name(request) == public_host)


def require_public_vpn_request(request: Request, settings: Dict[str, Any]) -> None:
    """VPN 专用验证/配置/证书接口必须从管理员配置的 FRP 公网域名进入。"""
    if not settings.get("publicAuthEnabled"):
        raise HTTPException(
            status_code=403,
            detail="服务器已关闭 FRP 公网登录及 VPN 预登录支持",
        )
    if not str(settings.get("publicAuthUrl") or "").strip():
        raise HTTPException(
            status_code=503,
            detail="服务器尚未配置 FRP 公网 HTTPS 验证地址",
        )
    if not is_public_auth_host(request, settings):
        raise HTTPException(
            status_code=403,
            detail="VPN 验证、VPN 参数读取和 SSTP 证书下载仅允许通过管理员配置的 FRP 公网域名访问",
        )


def normalize_vpn_routing_mode(value: str) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in {"split", "global"} else "split"


def normalize_vpn_entry_name(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "OpenHisAssistant Hospital VPN"
    # RAS entry name最大256字符；同时移除换行/控制字符，避免破坏电话簿。
    text = "".join(ch for ch in text if ord(ch) >= 32 and ch not in "\r\n")
    return text[:256] or "OpenHisAssistant Hospital VPN"


def normalize_vpn_server_address(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if "://" in text or any(ch.isspace() for ch in text) or "/" in text:
        raise HTTPException(
            status_code=400,
            detail="SSTP服务器请只填写主机名或IP地址，不要填写协议、路径或空格",
        )
    # 允许IPv4、IPv6文本及常规DNS主机名；当前客户端路由控制只处理IPv4网段。
    if len(text) > 128:
        raise HTTPException(status_code=400, detail="SSTP服务器地址过长")
    return text


def normalize_vpn_routes(value: Any) -> List[str]:
    source = value if isinstance(value, list) else [value]
    result: List[str] = []
    for raw in source:
        text = str(raw or "").strip()
        if not text:
            continue
        try:
            network = ipaddress.IPv4Network(text, strict=False)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"无效的VPN IPv4网段：{text}；请使用CIDR格式，例如 11.12.199.0/24",
            )
        if network.prefixlen == 0:
            raise HTTPException(
                status_code=400,
                detail="指定网段模式不接受 0.0.0.0/0；如需全部IPv4流量走VPN，请选择全局模式",
            )
        canonical = str(network)
        if canonical not in result:
            result.append(canonical)
    return result[:100]


def vpn_configuration_complete(settings: Dict[str, Any]) -> bool:
    mode = normalize_vpn_access_mode(settings.get("vpnAccessMode"))
    if mode == "http-proxy":
        return bool(settings.get("httpProxyUrl"))
    return bool(
        settings.get("vpnServerAddress")
        and settings.get("vpnUsername")
        and settings.get("vpnPassword")
    )


def read_system_setting(conn: sqlite3.Connection, key: str, default: Any) -> Any:
    row = conn.execute(
        "SELECT value FROM system_settings WHERE key = ?",
        (key,),
    ).fetchone()
    if not row:
        return default
    try:
        return json.loads(str(row["value"]))
    except Exception:
        return default


def write_system_setting(conn: sqlite3.Connection, key: str, value: Any) -> None:
    current = now_ts()
    conn.execute(
        """
        INSERT INTO system_settings(key, value, updated_at)
        VALUES(?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        """,
        (key, json.dumps(value, ensure_ascii=False), current),
    )


def get_client_settings(conn: sqlite3.Connection) -> Dict[str, Any]:
    return {
        "serverEndpointDisplay": normalize_display_mode(
            read_system_setting(conn, "client.serverEndpointDisplay", DEFAULT_CLIENT_SETTINGS["serverEndpointDisplay"])
        ),
        "deepSeekProxyDisplay": normalize_display_mode(
            read_system_setting(conn, "client.deepSeekProxyDisplay", DEFAULT_CLIENT_SETTINGS["deepSeekProxyDisplay"])
        ),
        "networkStatusVisible": bool(
            read_system_setting(conn, "client.networkStatusVisible", DEFAULT_CLIENT_SETTINGS["networkStatusVisible"])
        ),
        "ohaUiPanelEnabled": bool(
            read_system_setting(conn, "client.ohaUiPanelEnabled", DEFAULT_CLIENT_SETTINGS["ohaUiPanelEnabled"])
        ),
        "mobileImageCompressionMode": normalize_mobile_image_compression_mode(
            read_system_setting(
                conn,
                "mobile.imageCompressionMode",
                DEFAULT_CLIENT_SETTINGS["mobileImageCompressionMode"],
            )
        ),
        "deepSeekNavigationRestricted": bool(
            read_system_setting(conn, "client.deepSeekNavigationRestricted", DEFAULT_CLIENT_SETTINGS["deepSeekNavigationRestricted"])
        ),
        "deepSeekExternalNavigationAction": normalize_deepseek_navigation_action(
            read_system_setting(conn, "client.deepSeekExternalNavigationAction", DEFAULT_CLIENT_SETTINGS["deepSeekExternalNavigationAction"])
        ),
        "deepSeekAllowedHosts": normalize_deepseek_allowed_hosts(
            read_system_setting(conn, "client.deepSeekAllowedHosts", DEFAULT_CLIENT_SETTINGS["deepSeekAllowedHosts"])
        ),
        "hisHomeUrl": normalize_client_page_url(
            read_system_setting(conn, "client.hisHomeUrl", ""), "HIS主页面", allow_empty=True
        ),
        "deepSeekHomeUrl": normalize_client_page_url(
            read_system_setting(conn, "client.deepSeekHomeUrl", ""), "DeepSeek主页面", allow_empty=True
        ),
        "extensionBookmarks": normalize_client_bookmarks(
            read_system_setting(conn, "client.extensionBookmarks", []), "扩展网页书签"
        ),
        "extensionWindowShowDomain": bool(
            read_system_setting(
                conn, "client.extensionWindowShowDomain", DEFAULT_CLIENT_SETTINGS["extensionWindowShowDomain"]
            )
        ),
        "deepSeekBookmarks": normalize_client_bookmarks(
            read_system_setting(conn, "client.deepSeekBookmarks", []), "DeepSeek书签"
        ),
        "publicAuthEnabled": bool(
            read_system_setting(conn, "client.publicAuthEnabled", DEFAULT_CLIENT_SETTINGS["publicAuthEnabled"])
        ),
        "publicAuthUrl": normalize_public_auth_url(
            read_system_setting(conn, "client.publicAuthUrl", DEFAULT_CLIENT_SETTINGS["publicAuthUrl"])
        ),
        "publicAuthAllowInvalidTls": bool(
            read_system_setting(
                conn,
                "client.publicAuthAllowInvalidTls",
                DEFAULT_CLIENT_SETTINGS["publicAuthAllowInvalidTls"],
            )
        ),
        "vpnGlobalEnabled": bool(
            read_system_setting(conn, "client.vpnGlobalEnabled", DEFAULT_CLIENT_SETTINGS["vpnGlobalEnabled"])
        ),
        "vpnAccessMode": normalize_vpn_access_mode(
            read_system_setting(conn, "client.vpnAccessMode", DEFAULT_CLIENT_SETTINGS["vpnAccessMode"])
        ),
        "vpnEntryName": normalize_vpn_entry_name(
            read_system_setting(conn, "client.vpnEntryName", DEFAULT_CLIENT_SETTINGS["vpnEntryName"])
        ),
        "vpnServerAddress": str(
            read_system_setting(conn, "client.vpnServerAddress", DEFAULT_CLIENT_SETTINGS["vpnServerAddress"]) or ""
        ).strip(),
        "vpnUsername": str(
            read_system_setting(conn, "client.vpnUsername", DEFAULT_CLIENT_SETTINGS["vpnUsername"]) or ""
        ),
        "vpnPassword": str(
            read_system_setting(conn, "client.vpnPassword", DEFAULT_CLIENT_SETTINGS["vpnPassword"]) or ""
        ),
        "vpnKeepLocalProfile": bool(
            read_system_setting(conn, "client.vpnKeepLocalProfile", DEFAULT_CLIENT_SETTINGS["vpnKeepLocalProfile"])
        ),
        "httpProxyUrl": normalize_http_proxy_url(
            read_system_setting(conn, "client.httpProxyUrl", DEFAULT_CLIENT_SETTINGS["httpProxyUrl"])
        ),
        "vpnRoutingMode": normalize_vpn_routing_mode(
            read_system_setting(conn, "client.vpnRoutingMode", DEFAULT_CLIENT_SETTINGS["vpnRoutingMode"])
        ),
        "vpnRoutes": normalize_vpn_routes(
            read_system_setting(conn, "client.vpnRoutes", DEFAULT_CLIENT_SETTINGS["vpnRoutes"])
        ),
        **sstp_certificate_info(conn),
    }


def set_client_settings(conn: sqlite3.Connection, settings: Dict[str, Any]) -> None:
    write_system_setting(conn, "client.serverEndpointDisplay", normalize_display_mode(settings.get("serverEndpointDisplay"), "hidden"))
    write_system_setting(conn, "client.deepSeekProxyDisplay", normalize_display_mode(settings.get("deepSeekProxyDisplay"), "hidden"))
    write_system_setting(conn, "client.networkStatusVisible", bool(settings.get("networkStatusVisible", True)))
    write_system_setting(conn, "client.ohaUiPanelEnabled", bool(settings.get("ohaUiPanelEnabled", True)))
    write_system_setting(
        conn,
        "mobile.imageCompressionMode",
        normalize_mobile_image_compression_mode(settings.get("mobileImageCompressionMode", "light")),
    )
    write_system_setting(conn, "client.deepSeekNavigationRestricted", bool(settings.get("deepSeekNavigationRestricted", True)))
    write_system_setting(conn, "client.deepSeekExternalNavigationAction", normalize_deepseek_navigation_action(settings.get("deepSeekExternalNavigationAction", "block")))
    write_system_setting(conn, "client.deepSeekAllowedHosts", normalize_deepseek_allowed_hosts(settings.get("deepSeekAllowedHosts", ["deepseek.com"])))
    write_system_setting(conn, "client.hisHomeUrl", normalize_client_page_url(settings.get("hisHomeUrl"), "HIS主页面", allow_empty=True))
    write_system_setting(conn, "client.deepSeekHomeUrl", normalize_client_page_url(settings.get("deepSeekHomeUrl"), "DeepSeek主页面", allow_empty=True))
    write_system_setting(conn, "client.extensionBookmarks", normalize_client_bookmarks(settings.get("extensionBookmarks", []), "扩展网页书签"))
    write_system_setting(conn, "client.extensionWindowShowDomain", bool(settings.get("extensionWindowShowDomain", True)))
    write_system_setting(conn, "client.deepSeekBookmarks", normalize_client_bookmarks(settings.get("deepSeekBookmarks", []), "DeepSeek书签"))
    write_system_setting(conn, "client.publicAuthEnabled", bool(settings.get("publicAuthEnabled", False)))
    write_system_setting(conn, "client.publicAuthUrl", normalize_public_auth_url(settings.get("publicAuthUrl")))
    write_system_setting(
        conn,
        "client.publicAuthAllowInvalidTls",
        bool(settings.get("publicAuthAllowInvalidTls", False)),
    )

    write_system_setting(conn, "client.vpnGlobalEnabled", bool(settings.get("vpnGlobalEnabled", False)))
    write_system_setting(conn, "client.vpnAccessMode", normalize_vpn_access_mode(settings.get("vpnAccessMode")))
    write_system_setting(conn, "client.vpnEntryName", normalize_vpn_entry_name(settings.get("vpnEntryName")))
    write_system_setting(conn, "client.vpnServerAddress", normalize_vpn_server_address(settings.get("vpnServerAddress")))
    write_system_setting(conn, "client.vpnUsername", str(settings.get("vpnUsername") or "").strip())
    write_system_setting(conn, "client.vpnPassword", str(settings.get("vpnPassword") or ""))
    write_system_setting(conn, "client.vpnKeepLocalProfile", bool(settings.get("vpnKeepLocalProfile", True)))
    write_system_setting(conn, "client.httpProxyUrl", normalize_http_proxy_url(settings.get("httpProxyUrl")))
    write_system_setting(conn, "client.vpnRoutingMode", normalize_vpn_routing_mode(settings.get("vpnRoutingMode")))
    write_system_setting(conn, "client.vpnRoutes", normalize_vpn_routes(settings.get("vpnRoutes", [])))


def normalize_module_webdav_endpoint(value: Any) -> str:
    endpoint = str(value or "").strip()
    if not endpoint:
        return ""
    parsed = urlparse(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="WebDAV 地址必须是有效的 http:// 或 https:// 地址")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="请勿把 WebDAV 账号或密码直接写在地址中")
    if parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="WebDAV 备份目录地址不能包含查询参数或 # 片段")
    return endpoint.rstrip("/")


def get_module_webdav_settings(conn: sqlite3.Connection, include_password: bool = False) -> Dict[str, Any]:
    endpoint = normalize_module_webdav_endpoint(
        read_system_setting(conn, "modules.webdav.endpoint", "")
    )
    username = str(read_system_setting(conn, "modules.webdav.username", "") or "").strip()
    password = str(read_system_setting(conn, "modules.webdav.password", "") or "")
    result: Dict[str, Any] = {
        "endpoint": endpoint,
        "username": username,
        "verifyTls": bool(read_system_setting(conn, "modules.webdav.verifyTls", True)),
        "passwordConfigured": bool(password),
    }
    if include_password:
        result["password"] = password
    return result


def set_module_webdav_settings(conn: sqlite3.Connection, body: AdminModuleWebdavSettingsRequest) -> Dict[str, Any]:
    endpoint = normalize_module_webdav_endpoint(body.endpoint)
    username = str(body.username or "").strip()
    existing = str(read_system_setting(conn, "modules.webdav.password", "") or "")
    if body.clearPassword:
        password = ""
    elif body.password is None or body.password == "":
        password = existing
    else:
        password = str(body.password)
    write_system_setting(conn, "modules.webdav.endpoint", endpoint)
    write_system_setting(conn, "modules.webdav.username", username)
    write_system_setting(conn, "modules.webdav.password", password)
    write_system_setting(conn, "modules.webdav.verifyTls", bool(body.verifyTls))
    conn.commit()
    return get_module_webdav_settings(conn, include_password=False)


def module_webdav_script_directory_url(endpoint: str) -> str:
    base = normalize_module_webdav_endpoint(endpoint)
    if not base:
        raise HTTPException(status_code=400, detail="尚未配置 WebDAV 备份目录地址")
    if base.rstrip("/").lower().endswith("/script-sources"):
        return base.rstrip("/") + "/"
    return base.rstrip("/") + "/script-sources/"


def module_webdav_url_for_file(endpoint: str, file_name: str) -> str:
    name = str(file_name or "").strip()
    if not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise HTTPException(status_code=502, detail="WebDAV 源码清单包含非法文件名")
    if len(name) > 240:
        raise HTTPException(status_code=502, detail="WebDAV 源码文件名过长")
    return module_webdav_script_directory_url(endpoint) + quote(name, safe="._-()")


def module_webdav_get_bytes(url: str, settings: Dict[str, Any], maximum: int, label: str) -> bytes:
    auth = None
    username = str(settings.get("username") or "")
    password = str(settings.get("password") or "")
    if username or password:
        auth = (username, password)
    try:
        response = DIRECT_HTTP.get(
            url,
            auth=auth,
            timeout=(8, 45),
            allow_redirects=True,
            verify=bool(settings.get("verifyTls", True)),
        )
    except requests.exceptions.SSLError as exc:
        raise HTTPException(status_code=502, detail=label + "失败：HTTPS 证书校验失败") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=label + "失败：" + str(exc)) from exc
    if response.status_code < 200 or response.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"{label}失败：WebDAV HTTP {response.status_code} {response.reason or ''}".strip(),
        )
    content = bytes(response.content or b"")
    if len(content) > maximum:
        raise HTTPException(status_code=502, detail=label + "失败：文件超过安全大小限制")
    return content


def module_webdav_decode_utf8(content: bytes, label: str) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=502, detail=label + "失败：文件不是 UTF-8 文本") from exc


def load_remote_module_source_manifest(settings: Dict[str, Any]) -> Dict[str, Any]:
    endpoint = str(settings.get("endpoint") or "")
    url = module_webdav_url_for_file(endpoint, MODULE_WEBDAV_MANIFEST_FILE)
    raw = module_webdav_get_bytes(url, settings, 2 * 1024 * 1024, "读取 WebDAV 脚本源码清单")
    try:
        data = json.loads(module_webdav_decode_utf8(raw, "读取 WebDAV 脚本源码清单"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="WebDAV 脚本源码清单不是有效 JSON") from exc
    if not isinstance(data, dict) or data.get("schema") != "medical-userscript-source-backup-manifest":
        raise HTTPException(status_code=502, detail="WebDAV 目录中的脚本源码清单格式不受支持")
    scripts = data.get("scripts")
    if not isinstance(scripts, list):
        raise HTTPException(status_code=502, detail="WebDAV 脚本源码清单缺少 scripts 列表")
    return data


def parse_version_tokens(value: str) -> List[Any]:
    tokens: List[Any] = []
    for token in re.findall(r"\d+|[A-Za-z]+", str(value or "")):
        if token.isdigit():
            tokens.append((1, int(token)))
        else:
            tokens.append((0, token.lower()))
    return tokens


def compare_module_versions(first: str, second: str) -> int:
    a = parse_version_tokens(first)
    b = parse_version_tokens(second)
    length = max(len(a), len(b))
    for index in range(length):
        left = a[index] if index < len(a) else (1, 0)
        right = b[index] if index < len(b) else (1, 0)
        if left == right:
            continue
        if left[0] != right[0]:
            return 1 if left[0] > right[0] else -1
        return 1 if left[1] > right[1] else -1
    return 0


def remote_module_entries(settings: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    remote_manifest = load_remote_module_source_manifest(settings)
    result: Dict[str, Dict[str, Any]] = {}
    for raw in remote_manifest.get("scripts") or []:
        if not isinstance(raw, dict):
            continue
        source_id = str(raw.get("id") or "").strip()
        module_name = resolve_webdav_module_name(source_id)
        if not module_name:
            continue
        file_name = str(raw.get("fileName") or "").strip()
        version = str(raw.get("version") or "").strip()
        if not file_name or not version:
            continue
        # 校验路径，防止清单通过 ../ 或斜杠跳出 script-sources。
        module_webdav_url_for_file(str(settings.get("endpoint") or ""), file_name)
        result[module_name] = {
            "sourceId": source_id,
            "moduleName": module_name,
            "displayName": str(raw.get("name") or source_id),
            "version": version,
            "fileName": file_name,
            "bytes": int(raw.get("bytes") or 0),
            "role": str(raw.get("role") or ""),
        }
    return result


def module_webdav_check_rows(settings: Dict[str, Any]) -> Dict[str, Any]:
    remote_manifest = load_remote_module_source_manifest(settings)
    remote: Dict[str, Dict[str, Any]] = {}
    for raw in remote_manifest.get("scripts") or []:
        if not isinstance(raw, dict):
            continue
        source_id = str(raw.get("id") or "").strip()
        module_name = resolve_webdav_module_name(source_id)
        if not module_name:
            continue
        file_name = str(raw.get("fileName") or "").strip()
        version = str(raw.get("version") or "").strip()
        if not file_name or not version:
            continue
        module_webdav_url_for_file(str(settings.get("endpoint") or ""), file_name)
        remote[module_name] = {
            "sourceId": source_id,
            "displayName": str(raw.get("name") or source_id),
            "version": version,
            "fileName": file_name,
            "bytes": int(raw.get("bytes") or 0),
            "role": str(raw.get("role") or ""),
        }

    local_items = {str(item.get("name") or ""): item for item in manifest_modules()}
    rows: List[Dict[str, Any]] = []
    # 动态模块优先：manifest 中存在且 WebDAV 清单中存在的技术 ID 自动纳入。
    dynamic_pairs: Dict[str, str] = {}
    for module_name in local_items.keys():
        if module_name in remote:
            dynamic_pairs[module_name] = module_name
    # 兼容旧短 ID 映射
    for source_id, module_name in MODULE_WEBDAV_SOURCE_ID_MAP.items():
        dynamic_pairs.setdefault(module_name, source_id)
    for module_name, source_id in dynamic_pairs.items():
        local = local_items.get(module_name)
        remote_item = remote.get(module_name)
        local_version = str(local.get("version") or "") if local else ""
        remote_version = str(remote_item.get("version") or "") if remote_item else ""
        if not local:
            status = "local-missing"
        elif not remote_item:
            status = "remote-missing"
        else:
            comparison = compare_module_versions(remote_version, local_version)
            status = "newer" if comparison > 0 else ("older" if comparison < 0 else "same")
        rows.append({
            "sourceId": source_id,
            "moduleName": module_name,
            "displayName": str(local.get("displayName") or module_name) if local else (remote_item or {}).get("displayName", module_name),
            "localVersion": local_version,
            "remoteVersion": remote_version,
            "remoteFileName": str((remote_item or {}).get("fileName") or ""),
            "remoteBytes": int((remote_item or {}).get("bytes") or 0),
            "status": status,
        })
    return {
        "manifest": {
            "createdAt": str(remote_manifest.get("createdAt") or ""),
            "reason": str(remote_manifest.get("reason") or ""),
            "providerSignature": str(remote_manifest.get("providerSignature") or ""),
        },
        "rows": rows,
    }


def fetch_and_validate_remote_module_source(settings: Dict[str, Any], remote_item: Dict[str, Any]) -> Dict[str, Any]:
    module_name = str(remote_item.get("moduleName") or "")
    file_name = str(remote_item.get("fileName") or "")
    expected_version = str(remote_item.get("version") or "")
    url = module_webdav_url_for_file(str(settings.get("endpoint") or ""), file_name)
    raw = module_webdav_get_bytes(url, settings, MODULE_WEBDAV_MAX_SOURCE_BYTES, "下载模块 " + module_name)
    source = module_webdav_decode_utf8(raw, "下载模块 " + module_name)
    if not source.strip():
        raise HTTPException(status_code=502, detail="WebDAV 模块源码为空：" + module_name)
    if not re.search(r"//\s*==UserScript==([\s\S]*?)//\s*==/UserScript==", source):
        raise HTTPException(status_code=502, detail="WebDAV 模块缺少 Userscript 元数据块：" + module_name)
    header = userscript_header_metadata(source)
    actual_version = str(header.get("version") or "").strip()
    if not actual_version:
        raise HTTPException(status_code=502, detail="WebDAV 模块缺少 @version：" + module_name)
    if expected_version and actual_version != expected_version:
        raise HTTPException(
            status_code=502,
            detail=f"WebDAV 清单版本与源码 @version 不一致：{module_name}（{expected_version} / {actual_version}）",
        )
    return {
        "source": source,
        "header": header,
        "sha256": "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest(),
    }


def apply_webdav_module_updates(
    settings: Dict[str, Any],
    requested_modules: List[str],
    force: bool,
    actor: str,
    admin_session_id: int,
) -> Dict[str, Any]:
    remote = remote_module_entries(settings)
    manifest = load_manifest()
    modules = [dict(item) for item in manifest.get("modules", []) if isinstance(item, dict)]
    by_name = {str(item.get("name") or ""): item for item in modules}

    requested = clean_string_list(requested_modules)
    if requested:
        # v0.4.16.7 动态 WebDAV 更新：
        # 不再用旧版固定 9 模块映射表限制可更新对象。只要模块已经存在于
        # 服务器 modules/manifest.json，并且 WebDAV 源码清单能够解析到同一
        # 技术 ID（或旧短 ID 兼容映射），即可进入后续校验/更新链路。
        invalid = [name for name in requested if name not in by_name]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail="服务器模块清单中不存在以下模块：" + ", ".join(invalid),
            )
        targets = requested
    else:
        # “更新全部较新版本”动态覆盖所有“服务器已安装 + WebDAV 已提供源码”的模块。
        # 例如 inpatient-summary 这类后续新增 enhancement 模块无需再修改固定白名单。
        targets = [name for name in by_name.keys() if name in remote]

    eligible: List[str] = []
    skipped: List[Dict[str, str]] = []
    for name in targets:
        local = by_name.get(name)
        remote_item = remote.get(name)
        if not local:
            skipped.append({"moduleName": name, "reason": "local-missing"})
            continue
        if not remote_item:
            skipped.append({"moduleName": name, "reason": "remote-missing"})
            continue
        comparison = compare_module_versions(str(remote_item.get("version") or ""), str(local.get("version") or ""))
        if comparison <= 0 and not force:
            skipped.append({"moduleName": name, "reason": "not-newer"})
            continue
        eligible.append(name)

    if not eligible:
        return {"ok": True, "updated": [], "skipped": skipped, "sessionsRevoked": 0}

    # 先把所有目标源码完整下载并校验，再触碰服务器现有模块，避免半途网络失败造成部分更新。
    prepared: Dict[str, Dict[str, Any]] = {}
    for name in eligible:
        remote_item = dict(remote[name])
        remote_item["moduleName"] = name
        prepared[name] = fetch_and_validate_remote_module_source(settings, remote_item)

    original_manifest = json.loads(json.dumps(manifest, ensure_ascii=False))
    original_sources: Dict[str, str] = {}
    backup_ids: Dict[str, str] = {}
    try:
        for name in eligible:
            item = by_name[name]
            path = module_path_for_item(item)
            original_sources[name] = path.read_text(encoding="utf-8") if path.exists() else ""
            backup = create_module_backup(item, "webdav-update", actor)
            backup_ids[name] = str(backup.get("backupId") or "")

        for name in eligible:
            item = by_name[name]
            prepared_item = prepared[name]
            source = str(prepared_item["source"])
            header = dict(prepared_item["header"])
            remote_item = remote[name]
            # OHA 专属控制字段（权限、依赖、优先级、开关等）保留；Userscript 自描述字段跟随云端源码。
            item["displayName"] = str(header.get("displayName") or item.get("displayName") or name).strip()
            item["version"] = str(header.get("version") or remote_item.get("version") or item.get("version") or "").strip()
            item["matches"] = clean_string_list(header.get("matches") or [])
            item["runAt"] = normalize_run_at(str(header.get("runAt") or item.get("runAt") or "document-idle"))
            item["grants"] = clean_string_list(header.get("grants") or [])
            item["connect"] = clean_string_list(header.get("connect") or [])
            module_path_for_item(item).write_text(source, encoding="utf-8")

        manifest["modules"] = modules
        validate_manifest_dependencies(manifest)
        refresh_manifest_hashes(manifest)
        save_manifest(manifest)
    except Exception:
        # 尽最大努力回滚到批量更新前的文件与 manifest；已经生成的 before-update 备份保留作审计。
        for name, source in original_sources.items():
            try:
                local_item = next((item for item in original_manifest.get("modules", []) if str(item.get("name") or "") == name), None)
                if local_item:
                    module_path_for_item(local_item).write_text(source, encoding="utf-8")
            except Exception:
                pass
        try:
            save_manifest(original_manifest)
        except Exception:
            pass
        raise

    revoked = revoke_other_sessions(admin_session_id)
    updated = []
    for name in eligible:
        item = by_name[name]
        updated.append({
            "moduleName": name,
            "displayName": str(item.get("displayName") or name),
            "version": str(item.get("version") or ""),
            "backupId": backup_ids.get(name, ""),
            "hash": str(item.get("hash") or ""),
        })
    return {"ok": True, "updated": updated, "skipped": skipped, "sessionsRevoked": revoked}


def user_feature_enabled(
    conn: sqlite3.Connection,
    user_id: int,
    feature_key: str,
    default: bool = True,
) -> bool:
    row = conn.execute(
        """
        SELECT enabled
        FROM user_module_permissions
        WHERE user_id = ? AND module_name = ?
        """,
        (user_id, feature_key),
    ).fetchone()
    if not row:
        return default
    return bool(row["enabled"])


def effective_client_settings(
    conn: sqlite3.Connection,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    settings = get_client_settings(conn)

    settings["settingsButtonVisible"] = False
    settings["settingsAccessEnabled"] = False
    settings["vpnConfigured"] = vpn_configuration_complete(settings)
    settings["vpnGlobalAvailable"] = bool(
        settings["vpnGlobalEnabled"] and settings["vpnConfigured"]
    )

    # v0.4.11：
    # - vpnGlobalEnabled 只决定客户端在“登录前”是否展示远程接入开关；
    # - 真正建立 SSTP / HTTP 代理仍要求当前 OHA 用户拥有单独的远程接入权限；
    # - 未勾选的账号即使通过 FRP 公网验证成功，也只能得到“无 VPN 权限”。
    settings["vpnUserAuthorized"] = False
    settings["vpnEnabled"] = False

    if user_id is not None:
        settings["ohaUiPanelEnabled"] = bool(
            settings["ohaUiPanelEnabled"]
            and user_feature_enabled(conn, user_id, OHA_UI_FEATURE_KEY, True)
        )

        settings_permission = bool(
            user_feature_enabled(conn, user_id, SETTINGS_BUTTON_FEATURE_KEY, True)
        )
        settings["settingsButtonVisible"] = settings_permission
        settings["settingsAccessEnabled"] = settings_permission

        vpn_permission = bool(
            user_feature_enabled(conn, user_id, SSTP_VPN_FEATURE_KEY, False)
        )
        settings["vpnUserAuthorized"] = vpn_permission
        settings["vpnEnabled"] = bool(
            settings["vpnGlobalEnabled"]
            and settings["vpnConfigured"]
            and vpn_permission
        )

    # 没有远程接入权限时不下发 SSTP/HTTP代理实际连接参数。
    if not settings["vpnEnabled"]:
        settings["vpnServerAddress"] = ""
        settings["vpnUsername"] = ""
        settings["vpnPassword"] = ""
        settings["httpProxyUrl"] = ""
        settings["vpnRoutes"] = []
        settings["vpnCertificateConfigured"] = False
        settings["vpnCertificateFileName"] = ""
        settings["vpnCertificateSha256"] = ""
        settings["vpnCertificateSize"] = 0
    elif settings.get("vpnAccessMode") == "http-proxy":
        # HTTP代理模式完全不需要 Windows SSTP 凭据或证书。
        settings["vpnServerAddress"] = ""
        settings["vpnUsername"] = ""
        settings["vpnPassword"] = ""
        settings["vpnCertificateConfigured"] = False
        settings["vpnCertificateFileName"] = ""
        settings["vpnCertificateSha256"] = ""
        settings["vpnCertificateSize"] = 0
    else:
        settings["httpProxyUrl"] = ""

    return settings


MODULE_BACKUP_DIR = BASE_DIR / "module_backups"
MODULE_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
MODULE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
MODULE_FILE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.js$")
MODULE_RUN_AT = {"document-start", "document-end", "document-idle"}

# v1.2 WebDAV 脚本更新：与悬浮框管理器 script-sources 源码快照清单对接。
# WebDAV 源码快照兼容映射：
# 旧版使用短 ID，需要保留；
# 新版模块使用与 manifest.json 一致的技术 ID，可自动匹配。
MODULE_WEBDAV_SOURCE_ID_MAP: Dict[str, str] = {
    "manager": "suite-manager",
    "patient": "patient-info",
    "inpatient": "inpatient-info",
    "diagnosis": "diagnosis-auto-fill",
    "herb": "herbal-ai",
    "drug": "drug-ai",
    "pathway": "clinical-path",
    "outpatient": "outpatient-assistant",
    "webdav-helper": "webdav-helper",
}


def resolve_webdav_module_name(source_id: str) -> str:
    """解析 WebDAV 源码 ID。

    优先：
    1. 新版：source id 与服务器 manifest 技术 ID 完全一致
    2. 兼容：旧版短 ID 映射表
    """
    sid = str(source_id or "").strip()
    if not sid:
        return ""
    try:
        local_names = {str(item.get("name") or "").strip() for item in manifest_modules()}
        if sid in local_names:
            return sid
    except Exception:
        pass
    return str(MODULE_WEBDAV_SOURCE_ID_MAP.get(sid) or "")
MODULE_WEBDAV_MANIFEST_FILE = "智慧医疗_脚本源码备份清单.json"
MODULE_WEBDAV_MAX_SOURCE_BYTES = 16 * 1024 * 1024


def manifest_file_path() -> Path:
    manifest_rel = str(CONFIG.get("module_manifest") or "modules/manifest.json")
    manifest_path = (BASE_DIR / manifest_rel).resolve()
    modules_root = (BASE_DIR / "modules").resolve()
    if modules_root not in manifest_path.parents:
        raise RuntimeError("module_manifest 必须位于 server/modules 下")
    return manifest_path


def load_manifest() -> Dict[str, Any]:
    return json.loads(manifest_file_path().read_text(encoding="utf-8"))


def save_manifest(manifest: Dict[str, Any]) -> None:
    path = manifest_file_path()
    payload = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(payload, encoding="utf-8")
    os.replace(str(temp), str(path))


def normalize_module_name(value: str) -> str:
    name = str(value or "").strip()
    if not MODULE_NAME_PATTERN.fullmatch(name):
        raise HTTPException(status_code=400, detail="模块技术ID仅允许字母、数字、点、下划线和短横线，最长80字符")
    return name


def normalize_module_file(value: str, module_name: str) -> str:
    file_name = str(value or "").strip() or (module_name + ".js")
    if not MODULE_FILE_PATTERN.fullmatch(file_name):
        raise HTTPException(status_code=400, detail="模块文件名必须是安全的 .js 文件名，不能包含目录")
    return file_name


def clean_string_list(values: Optional[List[str]]) -> List[str]:
    result: List[str] = []
    for value in values or []:
        text = str(value or "").strip()
        if text and text not in result:
            result.append(text)
    return result


def normalize_module_roles(values: Optional[List[str]]) -> List[str]:
    roles = clean_string_list(values)
    invalid = [role for role in roles if role not in ALLOWED_ROLES]
    if invalid:
        raise HTTPException(status_code=400, detail="模块角色仅允许：admin / doctor / nurse")
    return roles


def normalize_run_at(value: str) -> str:
    run_at = str(value or "document-idle").strip().lower()
    if run_at not in MODULE_RUN_AT:
        raise HTTPException(status_code=400, detail="runAt 仅允许 document-start / document-end / document-idle")
    return run_at


def userscript_header_metadata(source: str) -> Dict[str, Any]:
    text = str(source or "")
    result: Dict[str, Any] = {"matches": [], "grants": [], "connect": []}
    block = re.search(r"//\s*==UserScript==([\s\S]*?)//\s*==/UserScript==", text)
    if not block:
        return result
    for line in block.group(1).splitlines():
        match = re.match(r"\s*//\s*@([A-Za-z0-9_-]+)\s+(.*?)\s*$", line)
        if not match:
            continue
        key, value = match.group(1).lower(), match.group(2).strip()
        if key == "name" and value:
            result["displayName"] = value
        elif key == "version" and value:
            result["version"] = value
        elif key == "match" and value:
            result["matches"].append(value)
        elif key == "grant" and value and value.lower() != "none":
            result["grants"].append(value)
        elif key == "connect" and value:
            result["connect"].append(value)
        elif key == "run-at" and value:
            result["runAt"] = value
    return result


def module_entry_public(item: Dict[str, Any]) -> Dict[str, Any]:
    path = module_path_for_item(item)
    source_size = path.stat().st_size if path.exists() else 0
    return {
        "name": str(item.get("name") or ""),
        "displayName": str(item.get("displayName") or item.get("name") or ""),
        "version": str(item.get("version") or ""),
        "file": str(item.get("file") or ""),
        "enabled": bool(item.get("enabled", False)),
        "roles": item.get("roles") or [],
        "matches": item.get("matches") or [],
        "hosts": item.get("hosts") or [],
        "paths": item.get("paths") or [],
        "userControllable": module_user_controllable(item),
        "defaultUserEnabled": bool(item.get("defaultUserEnabled", True)),
        "priority": int(item.get("priority") or 100),
        "runAt": str(item.get("runAt") or "document-idle"),
        "grants": item.get("grants") or [],
        "connect": item.get("connect") or [],
        "dependencies": item.get("dependencies") or [],
        "channel": str(item.get("channel") or "stable"),
        "hash": str(item.get("hash") or ""),
        "sourceSize": int(source_size),
        "fileExists": path.exists(),
    }


def validate_manifest_dependencies(manifest: Dict[str, Any]) -> None:
    modules = [item for item in manifest.get("modules", []) if isinstance(item, dict)]
    names = {str(item.get("name") or "") for item in modules}
    if "" in names:
        raise HTTPException(status_code=400, detail="存在缺少技术ID的模块")
    if len(names) != len(modules):
        raise HTTPException(status_code=400, detail="模块技术ID重复")
    for item in modules:
        name = str(item.get("name") or "")
        dependencies = clean_string_list(item.get("dependencies") or [])
        if name in dependencies:
            raise HTTPException(status_code=400, detail="模块不能依赖自身：" + name)
        missing = [dep for dep in dependencies if dep not in names]
        if missing:
            raise HTTPException(status_code=400, detail=name + " 存在不存在的依赖：" + ", ".join(missing))

    graph = {str(item.get("name") or ""): clean_string_list(item.get("dependencies") or []) for item in modules}
    visiting, visited = set(), set()
    def visit(name: str) -> None:
        if name in visited:
            return
        if name in visiting:
            raise HTTPException(status_code=400, detail="模块依赖存在循环：" + name)
        visiting.add(name)
        for dep in graph.get(name, []):
            visit(dep)
        visiting.remove(name)
        visited.add(name)
    for name in graph:
        visit(name)


def refresh_manifest_hashes(manifest: Dict[str, Any]) -> None:
    for item in manifest.get("modules", []):
        if isinstance(item, dict) and item.get("file"):
            item["hash"] = module_sha256(item)
    manifest["schemaVersion"] = max(4, int(manifest.get("schemaVersion") or 0))
    manifest["runtime"] = str(manifest.get("runtime") or "userscript-compatibility-1.1")


def backup_file_path(backup_id: str) -> Path:
    value = str(backup_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]{8,180}\.json", value):
        raise HTTPException(status_code=400, detail="非法备份ID")
    path = (MODULE_BACKUP_DIR / value).resolve()
    if MODULE_BACKUP_DIR.resolve() not in path.parents:
        raise HTTPException(status_code=400, detail="非法备份路径")
    return path


def create_module_backup(item: Dict[str, Any], reason: str, actor: str) -> Dict[str, Any]:
    module_name = str(item.get("name") or "module")
    path = module_path_for_item(item)
    source = path.read_text(encoding="utf-8") if path.exists() else ""
    stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
    backup_id = f"{stamp}-{module_name}-{secrets.token_hex(3)}.json"
    payload = {
        "schemaVersion": 1,
        "backupId": backup_id,
        "createdAt": now_ts(),
        "actor": str(actor or "admin"),
        "reason": str(reason or "manual"),
        "module": item,
        "source": source,
    }
    backup_file_path(backup_id).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "backupId": backup_id,
        "moduleName": module_name,
        "displayName": str(item.get("displayName") or module_name),
        "version": str(item.get("version") or ""),
        "createdAt": payload["createdAt"],
        "reason": payload["reason"],
        "actor": payload["actor"],
        "sourceSize": len(source.encode("utf-8")),
    }


def read_module_backup(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="模块备份损坏：" + path.name) from exc
    if not isinstance(data, dict) or not isinstance(data.get("module"), dict):
        raise HTTPException(status_code=500, detail="模块备份格式无效：" + path.name)
    return data


def revoke_other_sessions(admin_session_id: int) -> int:
    with db_connect() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE id <> ?", (admin_session_id,))
        conn.commit()
        return int(cur.rowcount)


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


def manifest_modules() -> List[Dict[str, Any]]:
    manifest = load_manifest()
    modules = [item for item in manifest.get("modules", []) if isinstance(item, dict)]
    modules.sort(key=lambda x: (int(x.get("priority") or 100), str(x.get("name") or "")))
    return modules


def module_role_allowed(item: Dict[str, Any], role: str) -> bool:
    if not item.get("enabled", False):
        return False
    roles = item.get("roles") or []
    return not roles or role in roles


def module_user_controllable(item: Dict[str, Any]) -> bool:
    return item.get("userControllable", True) is not False


def user_module_permission_map(
    conn: sqlite3.Connection,
    user_id: int,
) -> Dict[str, bool]:
    rows = conn.execute(
        "SELECT module_name, enabled FROM user_module_permissions WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    return {str(row["module_name"]): bool(row["enabled"]) for row in rows}


def resolve_allowed_module_names(
    conn: sqlite3.Connection,
    user_id: int,
    role: str,
) -> set:
    overrides = user_module_permission_map(conn, user_id)
    items = manifest_modules()
    by_name = {str(item.get("name") or ""): item for item in items if item.get("name")}

    allowed = set()
    for name, item in by_name.items():
        if not module_role_allowed(item, role):
            continue
        default_enabled = bool(item.get("defaultUserEnabled", True))
        if module_user_controllable(item) and overrides.get(name, default_enabled) is False:
            continue
        allowed.add(name)

    # 依赖缺失时自动关闭依赖它的上层模块，避免客户端收到不完整依赖树。
    changed = True
    while changed:
        changed = False
        for name in list(allowed):
            item = by_name.get(name) or {}
            dependencies = [str(x or "").strip() for x in (item.get("dependencies") or [])]
            dependencies = [x for x in dependencies if x]
            if any(dependency not in allowed for dependency in dependencies):
                allowed.remove(name)
                changed = True

    return allowed


def effective_user_module_permissions(
    conn: sqlite3.Connection,
    user_id: int,
    role: str,
) -> Dict[str, bool]:
    allowed = resolve_allowed_module_names(conn, user_id, role)
    result: Dict[str, bool] = {}
    for item in manifest_modules():
        name = str(item.get("name") or "")
        if not name or not module_user_controllable(item):
            continue
        result[name] = name in allowed
    return result


def allowed_modules_for_user(user_id: int, role: str) -> List[Dict[str, Any]]:
    with db_connect() as conn:
        allowed = resolve_allowed_module_names(conn, user_id, role)

    return [item for item in manifest_modules() if str(item.get("name") or "") in allowed]


MOBILE_PAGE_PATH = BASE_DIR / "mobile_openhis.html"
MOBILE_ROUND_BOOK_MAX_BYTES = 12 * 1024 * 1024
MOBILE_ATTACHMENT_ROOT = BASE_DIR / "data" / "mobile_patient_attachments"
MOBILE_ATTACHMENT_MAX_FILE_BYTES = 25 * 1024 * 1024
MOBILE_ATTACHMENT_MAX_PATIENT_BYTES = 250 * 1024 * 1024
MOBILE_ATTACHMENT_MAX_PATIENT_FILES = 100
MOBILE_STICKY_NOTE_ATTACHMENT_PREFIX = "__sticky_note__:"
MOBILE_ATTACHMENT_MIME_EXTENSIONS: Dict[str, str] = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "text/plain": ".txt",
}
MOBILE_PATIENT_SECTION_ORDER_DEFAULT = [
    "diagnosis",
    "basicSituation",
    "orderAdjustment",
    "auxiliary",
    "lisPacsBaseline",
    "vitals",
    "personal",
    "roundNotes",
    "attachments",
]
MOBILE_ASSISTANT_PREFERENCES_DEFAULT: Dict[str, bool] = {
    "includePage": True,
    "markdown": True,
    "bubbleCopy": True,
    "enterSend": False,
}
MOBILE_PRIVACY_PREFERENCES_DEFAULT: Dict[str, bool] = {
    "excludeSensitiveAiContext": True,
    "showResponsibleDoctorOnPatientCard": False,
}
MOBILE_READABILITY_FONT_SIZES = {12, 14, 16, 18, 20, 22}
MOBILE_READABILITY_PREFERENCES_DEFAULT: Dict[str, Any] = {
    "markdown": False,
    "analysisFontSize": 16,
    "insuranceFontSize": 12,
}
MOBILE_ORDER_VISUAL_PREFERENCES_DEFAULT: Dict[str, bool] = {
    "hideStopped": False,
    "hideVoided": False,
    "reverseSort": False,
}
MOBILE_INPATIENT_SORT_KEYS = {"sequence", "bedNo", "admissionNo", "admissionDate"}
MOBILE_USER_PREFERENCES_MAX_BYTES = 64 * 1024
MOBILE_TREATMENT_ANALYSIS_MAX_RESULT_CHARS = 50_000
MOBILE_TREATMENT_ANALYSIS_MAX_CACHE_ENTRIES = 1000
MOBILE_ARCHIVE_MAX_PAGE_SIZE = 200
MOBILE_ARCHIVE_MAX_BULK_PATIENTS = 10_000
MOBILE_ARCHIVE_MAX_EXPORT_BYTES = 1024 * 1024 * 1024
MOBILE_ARCHIVE_MAX_IMPORT_BYTES = MOBILE_ARCHIVE_MAX_EXPORT_BYTES + 128 * 1024 * 1024
MOBILE_ARCHIVE_MAX_MANIFEST_BYTES = 64 * 1024 * 1024
MOBILE_NOTE_BACKUP_MAX_BYTES = MOBILE_ARCHIVE_MAX_IMPORT_BYTES
MOBILE_NOTE_BACKUP_MAX_MANIFEST_BYTES = 16 * 1024 * 1024
MOBILE_TREATMENT_ANALYSIS_SYSTEM_PROMPT = "\n".join(
    [
        "你是住院查房诊疗方案审阅助手，输出只用于执业医师复核，不替代临床判断，不得直接形成或执行医嘱。",
        "只能依据用户提供的去标识化查房本数据分析；严禁补造症状、体征、过敏史、检验值、影像结论、诊断、药品、剂量、疗效或病情变化。资料不足时必须明确写‘资料不足，需核实’。",
        "重点审阅：当前诊断与现有治疗/检查/监测是否相互支持；是否存在诊疗缺口、重复或潜在冲突；医嘱调整、辅助检查、三测单和查房备注中是否出现需要优先关注的风险信号。",
        "提出用药或处置建议时必须使用条件式表达，并提醒结合真实病历、过敏史、肝肾功能、生命体征、相互作用及禁忌证复核；不得把缺少的资料当成正常。",
        "中医诊疗仅在现有资料明确提供中医诊断、证型或治疗时进行一致性审阅，不得自行虚构证型。",
        "DRG分组、拨付费用和剩余天数只作资源管理提示，绝不能据此减少患者必要的检查、治疗或住院观察。",
        "输出简洁纯文本，不使用Markdown表格，固定按以下结构：",
        "一、病情与现有方案概括",
        "二、诊疗方案合理性与不足",
        "三、当前重点风险与预警",
        "四、建议完善的检查、治疗与监测（注明依据或需先核实的条件）",
        "五、查房时需人工复核的信息",
    ]
)

MOBILE_INSURANCE_CONSISTENCY_SYSTEM_PROMPT = "\n".join(
    [
        "你是住院医保资料一致性复核助手，输出仅供执业医师和医保管理人员人工复核。",
        "insuranceData.admissionDiagnosis是当前查房本入院诊断基线，核对药品/治疗、辅助检查及现有诊断之间的资料对应关系；不得自行增删改写诊断。",
        "只能依据提供的去标识化资料复核；不得补造症状、适应证、检验值、影像意见、医嘱或医保政策。资料不足时标记‘需人工核实’，不得把缺失当成异常。",
        "当前诊断未见支持不等于医保违规。不得为了匹配收费或报销而建议添加无临床证据的诊断。",
        "未提供当地医保目录、限定支付条件、医院等级及相关政策时，不得断言违规、拒付、超限或可报销；只提示结合当地政策人工核对。",
        "辅助检查可用于确诊、鉴别、评估病情及用药安全监测；目的不明时提示核实检查目的。",
    ]
)

MOBILE_ICD_DIAGNOSIS_PREDICTION_SYSTEM_PROMPT = "\n".join([
    "你是住院诊断与ICD-10编码候选复核助手，结果仅供执业医师和编码人员人工复核，不自动形成或写回诊断、病历、医嘱。",
    "只能依据clinicalData中真实提供的去标识化资料，分别列出已有诊断规范化建议、证据支持的待核实诊断及鉴别项；不得补造症状、体征、检验值、影像意见、病程变化或诊断依据。缺少资料不等于正常。",
    "现有合并症或副诊断不能简单作为被排除疾病；应区分已确诊疾病、症状归因的鉴别、既往病史、后遗症和当前活动性疾病，不能把既往影像改变直接确认为急性病变。",
    "医嘱仅是诊疗线索，不能仅凭用药、治疗项目、收费、检查申请或金域申请项目确认疾病；未提供检查结果时不能推断阳性或阴性。不得为DRG分组或医保支付增补无临床证据的诊断。",
    "structuredOrderBaseline来自掌上OHA已同步的结构化医嘱，包含其范围内的执行中、已停止、临时作废和待审核记录，不受可视化隐藏勾选项控制。依照类别、开始/停止时间、HIS状态及待审核标记解释；已停止医嘱仅作历史治疗信息，临时作废医嘱不得当作有效治疗，待审核医嘱只能作计划，不能当作已审核、已执行或已完成。",
    "必须结合analysisDate及资料发生日期判断时序，不能把后续日期的医嘱当作当时已执行。输入可能只是同步摘要或经过长度限制；应提示与预测相关的资料缺口，不能声称掌握完整原始病历。",
    "未连接本院ICD-10编码字典。给出的编码均为候选：只有能够可靠确定的通用编码才可列出；细分编码、临床版或医保版扩展码无法核实时，写‘编码待本院字典核实’，不得猜造代码、声称已核对本院字典或保证可用于医保结算。",
    "每项候选注明疾病名称、可可靠确定的编码或待核实说明、证据出处、当前诊断状态及仍需核实的条件；证据不足的项目不得写成确诊。避免大段重复列出既有诊断，也不扩写无关诊疗建议。",
])


MOBILE_ATTACHMENT_ROOT.mkdir(parents=True, exist_ok=True)


# 仅估算账号相关文本负载；SQLite 页、索引、空闲页及全局配置另计入数据库文件大小。
MOBILE_STORAGE_PAYLOAD_COLUMNS: Tuple[Tuple[str, str, Tuple[str, ...]], ...] = (
    ("mobile_round_book_snapshots", "snapshots", ("snapshot_json", "source_label", "source_device_id")),
    ("mobile_round_book_notes", "notes", ("note",)),
    ("mobile_round_book_note_dictionary", "notes", ("note",)),
    ("mobile_round_book_note_pushes", "notes", ("note",)),
    ("mobile_account_notes", "notes", ("title", "content")),
    ("mobile_patient_archive", "archives", ("record_json", "diagnosis", "patient_name")),
    ("mobile_patient_archive_days", "archives", ("record_json", "daily_json")),
    ("mobile_treatment_analysis_cache", "analysis", ("result_text",)),
    ("mobile_insurance_consistency_cache", "analysis", ("result_text",)),
    ("mobile_icd_diagnosis_prediction_cache", "analysis", ("result_text",)),
    ("mobile_user_preferences", "preferences", ("preferences_json",)),
)


# 仅清理掌上 OHA 的非附件账号数据；附件元数据由独立选项控制。
# 账号、脚本权限及全局偏好保持原样。
# 档案日期节点先于档案索引清理，避免级联删除影响删除数量统计。
MOBILE_STORAGE_USER_DATA_TABLES: Tuple[str, ...] = (
    "mobile_patient_archive_days",
    "mobile_patient_archive_sync_state",
    "mobile_patient_archive",
    "mobile_round_book_snapshots",
    "mobile_round_book_notes",
    "mobile_round_book_note_dictionary",
    "mobile_round_book_note_pushes",
    "mobile_treatment_analysis_cache",
    "mobile_insurance_consistency_cache",
    "mobile_insurance_cancelled_runs",
    "mobile_icd_diagnosis_prediction_cache",
    "mobile_icd_prediction_cancelled_runs",
    "mobile_user_preferences",
    "mobile_account_notes",
)


def mobile_storage_user_usage(conn: sqlite3.Connection, user_id: int) -> Dict[str, Any]:
    """Recheck a single account's data within the clear transaction."""
    result: Dict[str, Any] = {
        "dataBytes": 0,
        "details": {"snapshots": 0, "notes": 0, "archives": 0, "analysis": 0, "preferences": 0},
        "attachmentRecords": 0,
    }
    for table, category, columns in MOBILE_STORAGE_PAYLOAD_COLUMNS:
        payload_expr = " + ".join(
            "LENGTH(CAST(COALESCE(" + column + ", '') AS BLOB))" for column in columns
        )
        row = conn.execute(
            "SELECT COUNT(*) AS records, COALESCE(SUM(" + payload_expr + "), 0) AS payload_bytes "
            "FROM " + table + " WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        result["dataBytes"] += int(row["payload_bytes"] or 0)
        result["details"][category] += int(row["records"] or 0)
    result["attachmentRecords"] = int(conn.execute(
        "SELECT COUNT(*) FROM mobile_patient_attachments WHERE user_id = ?", (user_id,)
    ).fetchone()[0])
    return result


def mobile_storage_directory_usage(folder: Path) -> Tuple[int, int]:
    """Count regular attachment files without following links outside the account folder."""
    if not folder.is_dir() or folder.is_symlink():
        return 0, 0
    total_bytes = 0
    file_count = 0

    def on_error(error: OSError) -> None:
        raise error

    for current, directories, files in os.walk(str(folder), followlinks=False, onerror=on_error):
        directories[:] = [name for name in directories if not (Path(current) / name).is_symlink()]
        for name in files:
            file_path = Path(current) / name
            if file_path.is_symlink():
                continue
            try:
                if file_path.is_file():
                    total_bytes += file_path.stat().st_size
                    file_count += 1
            except FileNotFoundError:
                # A temporary upload may finish or disappear during a read-only scan.
                continue
    return total_bytes, file_count


def mobile_storage_report() -> Dict[str, Any]:
    with db_connect() as conn:
        rows = conn.execute("SELECT id, username, enabled FROM users ORDER BY id").fetchall()
        users: Dict[int, Dict[str, Any]] = {
            int(row["id"]): {
                "id": int(row["id"]),
                "username": str(row["username"]),
                "enabled": bool(row["enabled"]),
                "dataBytes": 0,
                "details": {"snapshots": 0, "notes": 0, "archives": 0, "analysis": 0, "preferences": 0},
                "attachmentRecords": 0,
                "attachmentBytes": 0,
                "attachmentFiles": 0,
            }
            for row in rows
        }
        for table, category, columns in MOBILE_STORAGE_PAYLOAD_COLUMNS:
            payload_expr = " + ".join(
                "LENGTH(CAST(COALESCE(" + column + ", '') AS BLOB))"
                for column in columns
            )
            stats = conn.execute(
                "SELECT user_id, COUNT(*) AS records, "
                "COALESCE(SUM(" + payload_expr + "), 0) AS payload_bytes "
                "FROM " + table + " GROUP BY user_id"
            ).fetchall()
            for row in stats:
                user = users.get(int(row["user_id"]))
                if user is not None:
                    user["dataBytes"] += int(row["payload_bytes"] or 0)
                    user["details"][category] += int(row["records"] or 0)

        for row in conn.execute(
            "SELECT user_id, COUNT(*) AS records FROM mobile_patient_attachments GROUP BY user_id"
        ).fetchall():
            user = users.get(int(row["user_id"]))
            if user is not None:
                user["attachmentRecords"] = int(row["records"] or 0)

    orphans: List[Dict[str, int]] = []
    if MOBILE_ATTACHMENT_ROOT.is_dir():
        for folder in MOBILE_ATTACHMENT_ROOT.iterdir():
            if folder.is_symlink() or not folder.is_dir() or not folder.name.isdecimal():
                continue
            user_id = int(folder.name)
            if folder.name != str(user_id):
                continue
            size, count = mobile_storage_directory_usage(folder)
            if user_id in users:
                users[user_id]["attachmentBytes"] = size
                users[user_id]["attachmentFiles"] = count
            else:
                orphans.append({"userId": user_id, "bytes": size, "files": count})

    orphans.sort(key=lambda item: item["userId"])
    active_users = list(users.values())
    db_file_bytes = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    wal_path = Path(str(DB_PATH) + "-wal")
    wal_bytes = wal_path.stat().st_size if wal_path.exists() else 0
    return {
        "database": {
            "fileBytes": db_file_bytes,
            "walBytes": wal_bytes,
            "userDataApproxBytes": sum(row["dataBytes"] for row in active_users),
        },
        "attachments": {
            "activeBytes": sum(row["attachmentBytes"] for row in active_users),
            "activeFiles": sum(row["attachmentFiles"] for row in active_users),
            "orphanBytes": sum(row["bytes"] for row in orphans),
            "orphanFiles": sum(row["files"] for row in orphans),
        },
        "users": active_users,
        "orphans": orphans,
    }


def mobile_no_store_headers() -> Dict[str, str]:
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }


def mobile_read_notes(conn: sqlite3.Connection, user_id: int) -> Dict[str, Dict[str, str]]:
    rows = conn.execute(
        """
        SELECT record_key, date_key, note, updated_at
        FROM mobile_round_book_notes
        WHERE user_id = ?
        ORDER BY updated_at DESC
        """,
        (user_id,),
    ).fetchall()
    notes: Dict[str, Dict[str, str]] = {}
    for row in rows:
        date_key = str(row["date_key"] or "")
        record_key = str(row["record_key"] or "")
        if not date_key or not record_key:
            continue
        notes.setdefault(date_key, {})[record_key] = str(row["note"] or "")
    return notes


def mobile_snapshot_record_pairs(snapshot: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    """统一读取新旧两种掌上查房本records结构。"""
    value = snapshot.get("records") if isinstance(snapshot, dict) else None
    pairs: List[Tuple[str, Dict[str, Any]]] = []
    if isinstance(value, dict):
        for key, record in value.items():
            if isinstance(record, dict):
                pairs.append((str(record.get("key") or key or ""), record))
    elif isinstance(value, list):
        for index, record in enumerate(value):
            if isinstance(record, dict):
                key = str(
                    record.get("recordKey")
                    or record.get("key")
                    or record.get("admissionNo")
                    or index
                )
                pairs.append((key, record))
    return pairs


def mobile_snapshot_admission_map(snapshot: Dict[str, Any]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for record_key, record in mobile_snapshot_record_pairs(snapshot):
        admission_no = str(record.get("admissionNo") or "").strip()[:64]
        if not admission_no:
            continue
        if record_key:
            result[record_key] = admission_no
        result[admission_no] = admission_no
    return result


def mobile_read_note_dictionary(
    conn: sqlite3.Connection,
    user_id: int,
) -> Dict[str, Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT admission_no, note, updated_at
        FROM mobile_round_book_note_dictionary
        WHERE user_id = ?
        ORDER BY updated_at DESC
        """,
        (user_id,),
    ).fetchall()
    result: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        admission_no = str(row["admission_no"] or "").strip()
        if not admission_no:
            continue
        result[admission_no] = {
            "note": str(row["note"] or ""),
            "updatedAt": int(row["updated_at"] or 0),
        }
    return result


def mobile_read_pushed_notes(
    conn: sqlite3.Connection,
    user_id: int,
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    rows = conn.execute(
        """
        SELECT admission_no, date_key, note, updated_at
        FROM mobile_round_book_note_pushes
        WHERE user_id = ?
        ORDER BY updated_at DESC
        """,
        (user_id,),
    ).fetchall()
    result: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for row in rows:
        admission_no = str(row["admission_no"] or "").strip()
        date_key = str(row["date_key"] or "").strip()
        if not admission_no or not date_key:
            continue
        result.setdefault(date_key, {})[admission_no] = {
            "note": str(row["note"] or ""),
            "updatedAt": int(row["updated_at"] or 0),
        }
    return result


def mobile_migrate_legacy_notes(
    conn: sqlite3.Connection,
    user_id: int,
    snapshot: Dict[str, Any],
) -> int:
    """
    将v0.2按record_key+date_key保存的旧手机备注，尽可能迁移到
    v0.3按病案号索引的独立字典。只填补尚不存在的病案号，绝不覆盖新字典。
    """
    admission_map = mobile_snapshot_admission_map(snapshot)
    if not admission_map:
        return 0
    rows = conn.execute(
        """
        SELECT record_key, note, updated_at
        FROM mobile_round_book_notes
        WHERE user_id = ?
        ORDER BY updated_at DESC
        """,
        (user_id,),
    ).fetchall()
    migrated = 0
    seen: Set[str] = set()
    for row in rows:
        record_key = str(row["record_key"] or "").strip()
        admission_no = admission_map.get(record_key, "")
        if not admission_no or admission_no in seen:
            continue
        seen.add(admission_no)
        exists = conn.execute(
            """
            SELECT 1 FROM mobile_round_book_note_dictionary
            WHERE user_id = ? AND admission_no = ?
            """,
            (user_id, admission_no),
        ).fetchone()
        if exists:
            continue
        conn.execute(
            """
            INSERT INTO mobile_round_book_note_dictionary(
                user_id, admission_no, note, updated_at
            ) VALUES(?, ?, ?, ?)
            """,
            (
                user_id,
                admission_no,
                str(row["note"] or "")[:20000],
                int(row["updated_at"] or now_ts()),
            ),
        )
        migrated += 1
    if migrated:
        conn.commit()
    return migrated


def mobile_resolve_admission_no(
    conn: sqlite3.Connection,
    user_id: int,
    admission_no: str,
    record_key: str,
) -> str:
    direct = str(admission_no or "").strip()[:64]
    if direct:
        return direct
    legacy_key = str(record_key or "").strip()
    if not legacy_key:
        return ""
    row = conn.execute(
        """
        SELECT snapshot_json
        FROM mobile_round_book_snapshots
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        return ""
    try:
        snapshot = json.loads(str(row["snapshot_json"] or "{}"))
    except Exception:
        return ""
    if not isinstance(snapshot, dict):
        return ""
    return mobile_snapshot_admission_map(snapshot).get(legacy_key, "")


def mobile_validate_date_key(value: str) -> str:
    date_key = str(value or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_key):
        raise HTTPException(status_code=400, detail="查房日期格式无效")
    try:
        date.fromisoformat(date_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="查房日期无效") from exc
    return date_key


def mobile_read_snapshot_for_user(
    conn: sqlite3.Connection,
    user_id: int,
) -> Dict[str, Any]:
    row = conn.execute(
        """
        SELECT snapshot_json
        FROM mobile_round_book_snapshots
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        return {}
    try:
        value = json.loads(str(row["snapshot_json"] or "{}"))
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def mobile_snapshot_daily_for_date(
    record: Dict[str, Any],
    date_key: str,
) -> Optional[Dict[str, Any]]:
    daily_value = record.get("daily") if isinstance(record, dict) else None
    if not isinstance(daily_value, dict):
        return None
    exact = daily_value.get(date_key)
    if isinstance(exact, dict):
        return exact
    daily_fields = {
        "status",
        "groupIds",
        "inHospitalCost",
        "basicSituation",
        "orderAdjustmentAuto",
        "orderAdjustmentManual",
        "inpatientAuxiliary",
        "roundVitalsAuto",
        "lisPacsAuto",
        "lisPacsSource",
        "lisPacsRange",
        "lisPacsLisCount",
        "lisPacsPacsCount",
        "lisPacsUpdatedAt",
        "baselineLisPacsText",
        "roundNote",
    }
    if daily_fields.intersection(daily_value.keys()):
        return daily_value
    return None


def mobile_require_snapshot_patient(
    conn: sqlite3.Connection,
    user_id: int,
    admission_no: str,
    date_key: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], Optional[Dict[str, Any]]]:
    target = str(admission_no or "").strip()[:64]
    if not target:
        raise HTTPException(status_code=400, detail="病案号为空")
    snapshot = mobile_read_snapshot_for_user(conn, user_id)
    for _, record in mobile_snapshot_record_pairs(snapshot):
        if str(record.get("admissionNo") or "").strip() != target:
            continue
        daily = None
        if date_key is not None:
            daily = mobile_snapshot_daily_for_date(record, date_key)
            if daily is None:
                raise HTTPException(
                    status_code=400,
                    detail="未找到该患者指定日期的查房数据",
                )
        return snapshot, record, daily
    if date_key is None:
        archived = conn.execute(
            """
            SELECT record_json
            FROM mobile_patient_archive
            WHERE user_id = ? AND admission_no = ?
            """,
            (user_id, target),
        ).fetchone()
        if archived:
            record = mobile_archive_json(archived["record_json"])
            if record:
                return {}, record, None
    raise HTTPException(
        status_code=404,
        detail="当前账号的查房本快照中未找到该患者",
    )


def mobile_require_attachment_scope(
    conn: sqlite3.Connection,
    user_id: int,
    admission_no: str,
) -> str:
    """校验附件所属范围：患者病案号，或当前账号下的一条便签。"""
    target = str(admission_no or "").strip()[:64]
    if target.startswith(MOBILE_STICKY_NOTE_ATTACHMENT_PREFIX):
        note_id = target[len(MOBILE_STICKY_NOTE_ATTACHMENT_PREFIX):]
        if not re.fullmatch(r"[0-9a-f]{24}", note_id):
            raise HTTPException(status_code=400, detail="便签附件范围无效")
        exists = conn.execute(
            "SELECT 1 FROM mobile_account_notes WHERE user_id = ? AND note_id = ?",
            (int(user_id), note_id),
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="当前账号下未找到该便签")
        return target
    mobile_require_snapshot_patient(conn, user_id, target)
    return target


def mobile_archive_date_key(value: Any) -> str:
    text = str(value or "").strip()[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return ""
    try:
        date.fromisoformat(text)
    except ValueError:
        return ""
    return text


def mobile_archive_optional_date(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    result = mobile_archive_date_key(text)
    if not result:
        raise HTTPException(status_code=400, detail=f"{label}格式无效")
    return result


def mobile_archive_text(value: Any, maximum: int) -> str:
    return str(value or "").replace("\x00", "").strip()[:maximum]


def mobile_archive_status(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"archived", "archive", "已归档", "归档"}:
        return "archived"
    if text in {"discharged", "discharge", "out", "已出区", "出区", "已出院"}:
        return "discharged"
    return "ward"


def mobile_archive_json(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(str(value or "{}"))
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def mobile_archive_snapshot_date(snapshot: Dict[str, Any], snapshot_at: int) -> str:
    for value in (
        snapshot.get("currentDate"),
        snapshot.get("generatedAt"),
        snapshot.get("capturedAt"),
    ):
        result = mobile_archive_date_key(value)
        if result:
            return result
    return date.fromtimestamp(max(0, int(snapshot_at or now_ts()))).isoformat()


def mobile_archive_daily_entries(
    snapshot: Dict[str, Any],
    record: Dict[str, Any],
    snapshot_at: int,
) -> List[Tuple[str, Dict[str, Any]]]:
    """把新旧快照中的daily统一为按日期排序的节点。"""
    daily_value = record.get("daily") if isinstance(record, dict) else None
    entries: Dict[str, Dict[str, Any]] = {}
    if isinstance(daily_value, dict):
        for key, value in daily_value.items():
            date_key = mobile_archive_date_key(key)
            if date_key and isinstance(value, dict):
                entries[date_key] = value
        if not entries:
            daily_fields = {
                "status",
                "groupIds",
                "inHospitalCost",
                "basicSituation",
                "orderAdjustmentAuto",
                "orderAdjustmentManual",
                "inpatientAuxiliary",
                "roundVitalsAuto",
                "lisPacsAuto",
                "lisPacsSource",
                "lisPacsRange",
                "lisPacsLisCount",
                "lisPacsPacsCount",
                "lisPacsUpdatedAt",
                "baselineLisPacsText",
                "roundNote",
            }
            if daily_fields.intersection(daily_value.keys()):
                entries[mobile_archive_snapshot_date(snapshot, snapshot_at)] = daily_value
    if not entries:
        entries[mobile_archive_snapshot_date(snapshot, snapshot_at)] = {
            "status": record.get("status") or "ward"
        }
    return sorted(entries.items(), key=lambda item: item[0])


def mobile_archive_ingest_snapshot(
    conn: sqlite3.Connection,
    user_id: int,
    snapshot: Dict[str, Any],
    snapshot_at: int,
) -> int:
    """幂等归档一份查房快照，同时保留原当前快照写入链路。"""
    archived = 0
    current_at = max(0, int(snapshot_at or now_ts()))
    for _, source_record in mobile_snapshot_record_pairs(snapshot):
        admission_no = mobile_archive_text(source_record.get("admissionNo"), 64)
        if not admission_no:
            continue
        stable_record = dict(source_record)
        stable_record.pop("daily", None)
        try:
            record_raw = json.dumps(
                stable_record,
                ensure_ascii=False,
                separators=(",", ":"),
            )
        except Exception:
            continue
        entries = mobile_archive_daily_entries(snapshot, source_record, current_at)
        dates = [item[0] for item in entries]
        first_date = min(dates) if dates else ""
        last_date = max(dates) if dates else ""
        latest_daily = entries[-1][1] if entries else {}
        new_status = mobile_archive_status(
            source_record.get("status") or latest_daily.get("status")
        )
        discharged_dates = [
            date_key
            for date_key, daily in entries
            if mobile_archive_status(daily.get("status")) in {"discharged", "archived"}
        ]
        if new_status in {"discharged", "archived"} and last_date:
            discharged_dates.append(last_date)
        new_discharged = min(discharged_dates) if discharged_dates else ""
        existing = conn.execute(
            """
            SELECT record_json, first_seen_date, last_seen_date, discharged_date,
                   status, bed_no, patient_name, diagnosis, drg_group,
                   admission_date, updated_at
            FROM mobile_patient_archive
            WHERE user_id = ? AND admission_no = ?
            """,
            (user_id, admission_no),
        ).fetchone()
        old_first = str(existing["first_seen_date"] or "") if existing else ""
        old_last = str(existing["last_seen_date"] or "") if existing else ""
        old_discharged = str(existing["discharged_date"] or "") if existing else ""
        combined_first = min(value for value in (old_first, first_date) if value)
        combined_last = max(value for value in (old_last, last_date) if value)
        combined_discharged = ""
        if old_discharged or new_discharged:
            combined_discharged = min(
                value for value in (old_discharged, new_discharged) if value
            )
        replace_latest = (
            existing is None
            or not old_last
            or last_date > old_last
            or (
                last_date == old_last
                and current_at >= int(existing["updated_at"] or 0)
            )
        )
        if replace_latest:
            latest_record_raw = record_raw
            bed_no = mobile_archive_text(source_record.get("bedNo"), 160)
            patient_name = mobile_archive_text(source_record.get("name"), 240)
            diagnosis = mobile_archive_text(source_record.get("diagnosis"), 20_000)
            drg_group = mobile_archive_text(source_record.get("drgGroup"), 500)
            admission_date = mobile_archive_text(source_record.get("admissionDate"), 64)
            combined_status = new_status
        else:
            latest_record_raw = str(existing["record_json"] or "{}")
            bed_no = str(existing["bed_no"] or "")
            patient_name = str(existing["patient_name"] or "")
            diagnosis = str(existing["diagnosis"] or "")
            drg_group = str(existing["drg_group"] or "")
            admission_date = str(existing["admission_date"] or "")
            combined_status = str(existing["status"] or "ward")
        conn.execute(
            """
            INSERT INTO mobile_patient_archive(
                user_id, admission_no, record_json, first_seen_date,
                last_seen_date, discharged_date, status, bed_no,
                patient_name, diagnosis, drg_group, admission_date, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, admission_no) DO UPDATE SET
                record_json = excluded.record_json,
                first_seen_date = excluded.first_seen_date,
                last_seen_date = excluded.last_seen_date,
                discharged_date = excluded.discharged_date,
                status = excluded.status,
                bed_no = excluded.bed_no,
                patient_name = excluded.patient_name,
                diagnosis = excluded.diagnosis,
                drg_group = excluded.drg_group,
                admission_date = excluded.admission_date,
                updated_at = excluded.updated_at
            """,
            (
                user_id,
                admission_no,
                latest_record_raw,
                combined_first,
                combined_last,
                combined_discharged,
                combined_status,
                bed_no,
                patient_name,
                diagnosis,
                drg_group,
                admission_date,
                current_at,
            ),
        )
        for date_key, daily in entries:
            try:
                daily_raw = json.dumps(
                    daily,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            except Exception:
                continue
            conn.execute(
                """
                INSERT INTO mobile_patient_archive_days(
                    user_id, admission_no, date_key, record_json,
                    daily_json, snapshot_at
                ) VALUES(?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, admission_no, date_key) DO UPDATE SET
                    record_json = excluded.record_json,
                    daily_json = excluded.daily_json,
                    snapshot_at = excluded.snapshot_at
                """,
                (
                    user_id,
                    admission_no,
                    date_key,
                    record_raw,
                    daily_raw,
                    current_at,
                ),
            )
        archived += 1
    conn.execute(
        """
        INSERT INTO mobile_patient_archive_sync_state(
            user_id, snapshot_updated_at, updated_at
        ) VALUES(?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            snapshot_updated_at = excluded.snapshot_updated_at,
            updated_at = excluded.updated_at
        """,
        (user_id, current_at, now_ts()),
    )
    return archived


def mobile_archive_ensure_seeded(conn: sqlite3.Connection, user_id: int) -> int:
    """升级后首次进入档案库时，从账号现有最后快照自动补建档案。"""
    row = conn.execute(
        """
        SELECT snapshot_json, updated_at
        FROM mobile_round_book_snapshots
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        return 0
    snapshot_updated_at = int(row["updated_at"] or 0)
    state = conn.execute(
        """
        SELECT snapshot_updated_at
        FROM mobile_patient_archive_sync_state
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if state and int(state["snapshot_updated_at"] or 0) >= snapshot_updated_at:
        return 0
    snapshot = mobile_archive_json(row["snapshot_json"])
    archived = mobile_archive_ingest_snapshot(
        conn,
        user_id,
        snapshot,
        snapshot_updated_at or now_ts(),
    )
    conn.commit()
    return archived


def mobile_archive_like(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def mobile_archive_filter_sql(
    user_id: int,
    query: str = "",
    has_attachments: str = "any",
    drg_group: str = "",
    status: str = "all",
    date_from: str = "",
    date_to: str = "",
) -> Tuple[str, List[Any], Dict[str, str]]:
    normalized_has = str(has_attachments or "any").strip().lower()
    if normalized_has not in {"any", "yes", "no"}:
        raise HTTPException(status_code=400, detail="附件筛选值无效")
    normalized_status = str(status or "all").strip().lower()
    if normalized_status not in {"all", "ward", "discharged", "archived"}:
        raise HTTPException(status_code=400, detail="在院状态筛选值无效")
    start = mobile_archive_optional_date(date_from, "开始日期")
    end = mobile_archive_optional_date(date_to, "结束日期")
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    clauses = ["a.user_id = ?"]
    params: List[Any] = [user_id]
    words = [item for item in re.split(r"\s+", str(query or "").strip()) if item][:8]
    for word in words:
        pattern = "%" + mobile_archive_like(word[:80]) + "%"
        clauses.append(
            "(a.bed_no LIKE ? ESCAPE '\\' OR a.patient_name LIKE ? ESCAPE '\\' "
            "OR a.admission_no LIKE ? ESCAPE '\\' OR a.diagnosis LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern, pattern, pattern])
    normalized_drg = str(drg_group or "").strip()[:300]
    if normalized_drg:
        clauses.append("a.drg_group = ?")
        params.append(normalized_drg)
    if normalized_status != "all":
        clauses.append("a.status = ?")
        params.append(normalized_status)
    if normalized_has == "yes":
        clauses.append(
            "EXISTS (SELECT 1 FROM mobile_patient_attachments ma "
            "WHERE ma.user_id = a.user_id AND ma.admission_no = a.admission_no)"
        )
    elif normalized_has == "no":
        clauses.append(
            "NOT EXISTS (SELECT 1 FROM mobile_patient_attachments ma "
            "WHERE ma.user_id = a.user_id AND ma.admission_no = a.admission_no)"
        )
    if start or end:
        day_parts = [
            "d.user_id = a.user_id",
            "d.admission_no = a.admission_no",
        ]
        if start:
            day_parts.append("d.date_key >= ?")
            params.append(start)
        if end:
            day_parts.append("d.date_key <= ?")
            params.append(end)
        clauses.append(
            "EXISTS (SELECT 1 FROM mobile_patient_archive_days d WHERE "
            + " AND ".join(day_parts)
            + ")"
        )
    return (
        " WHERE " + " AND ".join(clauses),
        params,
        {
            "query": str(query or "").strip()[:300],
            "hasAttachments": normalized_has,
            "drgGroup": normalized_drg,
            "status": normalized_status,
            "dateFrom": start,
            "dateTo": end,
        },
    )


def mobile_archive_summary_item(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "admissionNo": str(row["admission_no"] or ""),
        "bedNo": str(row["bed_no"] or ""),
        "name": str(row["patient_name"] or ""),
        "diagnosis": str(row["diagnosis"] or ""),
        "drgGroup": str(row["drg_group"] or ""),
        "admissionDate": str(row["admission_date"] or ""),
        "firstSeenDate": str(row["first_seen_date"] or ""),
        "lastSeenDate": str(row["last_seen_date"] or ""),
        "dischargedDate": str(row["discharged_date"] or ""),
        "status": str(row["status"] or "ward"),
        "attachmentCount": int(row["attachment_count"] or 0),
        "dayCount": int(row["day_count"] or 0),
        "updatedAt": int(row["updated_at"] or 0),
    }


def mobile_archive_resolve_targets(
    conn: sqlite3.Connection,
    user_id: int,
    body: MobileArchiveBulkRequest,
) -> Tuple[List[str], Dict[str, str]]:
    where_sql, params, filters = mobile_archive_filter_sql(
        user_id,
        body.query,
        body.hasAttachments,
        body.drgGroup,
        body.status,
        body.dateFrom,
        body.dateTo,
    )
    if body.allMatched:
        rows = conn.execute(
            "SELECT a.admission_no FROM mobile_patient_archive a"
            + where_sql
            + " ORDER BY a.admission_no LIMIT ?",
            params + [MOBILE_ARCHIVE_MAX_BULK_PATIENTS + 1],
        ).fetchall()
        if len(rows) > MOBILE_ARCHIVE_MAX_BULK_PATIENTS:
            raise HTTPException(status_code=413, detail="匹配档案超过10000份，请缩小筛选范围")
        targets = [str(row["admission_no"] or "") for row in rows]
    else:
        requested: List[str] = []
        for value in body.admissionNos:
            admission_no = mobile_archive_text(value, 64)
            if admission_no and admission_no not in requested:
                requested.append(admission_no)
        if len(requested) > MOBILE_ARCHIVE_MAX_BULK_PATIENTS:
            raise HTTPException(status_code=413, detail="单次操作最多10000份档案")
        allowed: Set[str] = set()
        for offset in range(0, len(requested), 500):
            chunk = requested[offset : offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            if not placeholders:
                continue
            rows = conn.execute(
                "SELECT admission_no FROM mobile_patient_archive "
                f"WHERE user_id = ? AND admission_no IN ({placeholders})",
                [user_id] + chunk,
            ).fetchall()
            allowed.update(str(row["admission_no"] or "") for row in rows)
        targets = [item for item in requested if item in allowed]
    if not targets:
        raise HTTPException(status_code=400, detail="没有可操作的档案")
    return targets, filters


def mobile_clinical_text(
    value: Any,
    record: Dict[str, Any],
    maximum_chars: int,
) -> str:
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    else:
        text = str(value or "")
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    for direct_value in (
        record.get("name"),
        record.get("admissionNo"),
        record.get("phone"),
        record.get("idCard"),
        record.get("contactAddress"),
    ):
        direct = str(direct_value or "").strip()
        if direct:
            text = re.sub(re.escape(direct), "[已移除]", text, flags=re.IGNORECASE)
    text = re.sub(
        r"(?:床号|床位|病床)\s*[：:]?\s*[A-Za-z0-9-]{1,30}\s*床?",
        "床号：[已移除]",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", "[手机号已移除]", text)
    text = re.sub(
        r"(?<![0-9Xx])\d{17}[0-9Xx](?![0-9Xx])",
        "[身份证号已移除]",
        text,
    )
    return text[: max(1000, int(maximum_chars or 9000))].strip()


def mobile_number(value: Any) -> Optional[float]:
    text = re.sub(r"[\s,￥¥元]", "", str(value or ""))
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if number == number and abs(number) != float("inf") else None


def mobile_hospital_day(admission_date: Any, date_key: str) -> Optional[int]:
    matched = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", str(admission_date or "").strip())
    if not matched:
        return None
    try:
        admitted = date(int(matched.group(1)), int(matched.group(2)), int(matched.group(3)))
        current = date.fromisoformat(date_key)
    except ValueError:
        return None
    days = (current - admitted).days + 1
    return days if days >= 1 else None


def mobile_remaining_days(record: Dict[str, Any], daily: Dict[str, Any]) -> Optional[int]:
    allocation = mobile_number(record.get("drgAllocationFee"))
    current_cost = mobile_number(daily.get("inHospitalCost"))
    daily_cost = mobile_number(record.get("drgDailyCost"))
    if allocation is None or current_cost is None or daily_cost is None or daily_cost <= 0:
        return None
    if current_cost >= allocation:
        return 0
    return max(0, int((allocation - current_cost + daily_cost - 0.0000001) // daily_cost))


def mobile_treatment_analysis_payload(
    record: Dict[str, Any],
    daily: Dict[str, Any],
    date_key: str,
) -> Dict[str, Any]:
    clean = lambda value, maximum=9000: mobile_clinical_text(
        value,
        record,
        maximum,
    )
    order_adjustment = "\n".join(
        value
        for value in (
            clean(daily.get("orderAdjustmentAuto"), 9000),
            clean(daily.get("orderAdjustmentManual"), 9000),
        )
        if value
    )
    clinical_data: Dict[str, Any] = {
        "sex": str(record.get("sex") or "").strip()[:40],
        "age": str(record.get("age") or "").strip()[:40],
        "analysisDate": date_key,
        "hospitalDay": mobile_hospital_day(record.get("admissionDate"), date_key),
        "admissionDiagnosis": clean(record.get("diagnosis"), 7000),
        "currentTreatmentAndBasicSituation": clean(daily.get("basicSituation"), 12000),
        "recentOrderAdjustments": order_adjustment,
        "admissionAuxiliaryExaminations": clean(record.get("admissionAuxiliary"), 9000),
        "inpatientAuxiliaryExaminations": clean(daily.get("inpatientAuxiliary"), 9000),
        "vitalSigns": clean(daily.get("roundVitalsAuto"), 7000),
        "wardRoundNotes": clean(daily.get("roundNote"), 9000),
        "drgResourceReference": {
            "group": clean(record.get("drgGroup"), 1800),
            "allocationFee": mobile_number(record.get("drgAllocationFee")),
            "currentInHospitalCost": mobile_number(daily.get("inHospitalCost")),
            "remainingDays": mobile_remaining_days(record, daily),
        },
    }
    clinical_fields = (
        "admissionDiagnosis",
        "currentTreatmentAndBasicSituation",
        "recentOrderAdjustments",
        "admissionAuxiliaryExaminations",
        "inpatientAuxiliaryExaminations",
        "vitalSigns",
        "wardRoundNotes",
    )
    if not any(str(clinical_data.get(key) or "").strip() for key in clinical_fields):
        raise HTTPException(
            status_code=400,
            detail="缺少可供分析的诊断、基本情况、医嘱调整、辅助检查、三测单或查房记录",
        )
    return {
        "clinicalData": clinical_data,
        "privacyNote": "姓名、病案号、床号、联系方式、身份证号和地址未发送；临床文本中的当前患者直接身份信息也已在OHA服务器移除。",
        "outputRequirement": "只依据clinicalData审阅当前诊疗方案；指出资料缺口，不得补造事实；结果仅供执业医师查房复核。",
    }


def mobile_review_output_format(conn: sqlite3.Connection, user_id: int) -> str:
    preferences, _ = mobile_read_user_preferences(conn, user_id)
    return "markdown" if preferences.get("readability", {}).get("markdown") is True else "plain"


def mobile_requested_review_format(
    conn: sqlite3.Connection, user_id: int, requested: Optional[str],
) -> str:
    if requested is None:
        return mobile_review_output_format(conn, user_id)
    if requested not in {"plain", "markdown"}:
        raise HTTPException(status_code=400, detail="无效的结果格式")
    return requested


def mobile_review_prompt(kind: str, output_format: str) -> str:
    markdown = output_format == "markdown"
    if kind == "insurance":
        headings = [
            "一、医保诊断基线", "二、药品/治疗—医保诊断一致性",
            "三、辅助检查—医保诊断一致性", "四、需人工核实的资料缺口",
            "五、总体提示",
        ]
        base = MOBILE_INSURANCE_CONSISTENCY_SYSTEM_PROMPT
    elif kind == "icd-prediction":
        headings = [
            "一、现有诊断规范化与编码候选", "二、证据支持的待核实诊断",
            "三、鉴别与不支持项", "四、需要补充的依据", "五、编码核对提示",
        ]
        base = MOBILE_ICD_DIAGNOSIS_PREDICTION_SYSTEM_PROMPT
    else:
        headings = [
            "一、病情与现有方案概括", "二、诊疗方案合理性与不足",
            "三、当前重点风险与预警",
            "四、建议完善的检查、治疗与监测（注明依据或需先核实的条件）",
            "五、查房时需人工复核的信息",
        ]
        base = MOBILE_TREATMENT_ANALYSIS_SYSTEM_PROMPT.split("输出简洁纯文本")[0].strip()
    format_rule = (
        "输出简洁Markdown，按以下二级标题分段；可使用列表和加粗，不使用Markdown表格、代码块或JSON："
        if markdown else
        "输出结构化纯文本，按以下普通标题分段；不使用Markdown标题、加粗、列表语法、表格、代码块或JSON："
    )
    return "\n".join([base, format_rule] + [
        ("## " if markdown else "") + heading for heading in headings
    ])


def mobile_request_treatment_analysis(
    payload: Dict[str, Any],
    provider: Dict[str, Any],
    system_prompt: Optional[str] = None,
    action_name: str = "诊疗分析",
) -> str:
    model = str(provider.get("textModel") or "").strip()
    request_json: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt or MOBILE_TREATMENT_ANALYSIS_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            },
        ],
        "stream": False,
    }
    if str(provider.get("id") or "") == "openai":
        request_json["max_completion_tokens"] = 5200
    else:
        request_json["max_tokens"] = 5200
    label = str(provider.get("label") or "AI")
    try:
        response = DIRECT_HTTP.post(
            mobile_ai_chat_url(provider),
            headers=mobile_ai_headers(provider),
            json=request_json,
            timeout=180,
            **mobile_ai_request_kwargs(provider),
        )
    except requests.Timeout as exc:
        raise HTTPException(status_code=504, detail=label + action_name + "超时") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="服务器访问" + label + "失败") from exc
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=label + "返回内容不是有效JSON") from exc
    if not 200 <= response.status_code < 300:
        error_value = data.get("error") if isinstance(data, dict) else None
        if isinstance(error_value, dict):
            detail = str(error_value.get("message") or (label + "请求失败"))
        else:
            detail = str(error_value or (label + "请求失败"))
        raise HTTPException(status_code=502, detail=detail[:500])
    try:
        content = str(data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=label + "未返回有效" + action_name + "结果") from exc
    content = re.sub(r"^```(?:text|markdown)?\s*", "", content, flags=re.IGNORECASE)
    content = re.sub(r"\s*```$", "", content).strip()
    if not content:
        raise HTTPException(status_code=502, detail=label + "未返回有效" + action_name + "结果")
    return content[:MOBILE_TREATMENT_ANALYSIS_MAX_RESULT_CHARS]


def mobile_treatment_cache_item(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "admissionNo": str(row["admission_no"] or ""),
        "dateKey": str(row["date_key"] or ""),
        "text": str(row["result_text"] or ""),
        "sourceMode": str(row["source_mode"] or "single"),
        "outputFormat": str(row["output_format"] or "plain"),
        "analyzedAt": int(row["analyzed_at"] or 0),
    }


def mobile_attachment_safe_name(value: str) -> str:
    name = re.sub(r"[\x00-\x1f\x7f/\\]+", "_", str(value or "").strip())
    name = re.sub(r"\s+", " ", name).strip(" .")
    return (name or "患者附件")[:180]


def mobile_attachment_mime(value: str, file_name: str) -> str:
    mime_type = str(value or "").split(";", 1)[0].strip().lower()
    aliases = {
        "image/jpg": "image/jpeg",
        "image/pjpeg": "image/jpeg",
        "application/x-pdf": "application/pdf",
    }
    mime_type = aliases.get(mime_type, mime_type)
    if mime_type in MOBILE_ATTACHMENT_MIME_EXTENSIONS:
        return mime_type
    suffix = Path(str(file_name or "")).suffix.lower()
    by_suffix = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".txt": "text/plain",
    }
    inferred = by_suffix.get(suffix, "")
    if inferred:
        return inferred
    raise HTTPException(
        status_code=415,
        detail="仅支持PDF、JPG/JPEG、PNG、WebP、GIF、BMP和TXT附件",
    )


def mobile_attachment_renamed_name(
    value: str,
    mime_type: str,
    current_name: str,
) -> str:
    """生成安全展示名；允许省略扩展名，但禁止借重命名改变文件类型。"""
    name = mobile_attachment_safe_name(value)
    accepted_extensions = {
        "application/pdf": {".pdf"},
        "image/jpeg": {".jpg", ".jpeg"},
        "image/png": {".png"},
        "image/webp": {".webp"},
        "image/gif": {".gif"},
        "image/bmp": {".bmp"},
        "text/plain": {".txt"},
    }.get(str(mime_type or ""), set())
    if not accepted_extensions:
        raise HTTPException(status_code=415, detail="该附件类型不支持重命名")
    suffix = Path(name).suffix.lower()
    if suffix and suffix not in accepted_extensions:
        raise HTTPException(status_code=400, detail="重命名不能更改附件文件类型")
    if not suffix:
        current_suffix = Path(str(current_name or "")).suffix.lower()
        extension = (
            current_suffix
            if current_suffix in accepted_extensions
            else MOBILE_ATTACHMENT_MIME_EXTENSIONS[str(mime_type)]
        )
        stem = name[: max(1, 180 - len(extension))].rstrip(" .") or "患者附件"
        name = stem + extension
    return name[:180]


def mobile_attachment_validate_signature(mime_type: str, prefix: bytes) -> None:
    valid = False
    if mime_type == "application/pdf":
        valid = prefix.startswith(b"%PDF-")
    elif mime_type == "image/jpeg":
        valid = prefix.startswith(b"\xff\xd8\xff")
    elif mime_type == "image/png":
        valid = prefix.startswith(b"\x89PNG\r\n\x1a\n")
    elif mime_type == "image/webp":
        valid = len(prefix) >= 12 and prefix[:4] == b"RIFF" and prefix[8:12] == b"WEBP"
    elif mime_type == "image/gif":
        valid = prefix.startswith((b"GIF87a", b"GIF89a"))
    elif mime_type == "image/bmp":
        valid = prefix.startswith(b"BM")
    elif mime_type == "text/plain":
        valid = b"\x00" not in prefix
        if valid:
            try:
                prefix.decode("utf-8")
            except UnicodeDecodeError:
                valid = False
    if not valid:
        raise HTTPException(status_code=415, detail="附件内容与声明的文件类型不一致")


def mobile_attachment_path(relative_path: str) -> Path:
    root = MOBILE_ATTACHMENT_ROOT.resolve()
    path = (root / str(relative_path or "")).resolve()
    if path == root or root not in path.parents:
        raise HTTPException(status_code=500, detail="附件存储路径无效")
    return path


def mobile_attachment_item(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or ""),
        "admissionNo": str(row["admission_no"] or ""),
        "name": str(row["original_name"] or ""),
        "mimeType": str(row["mime_type"] or "application/octet-stream"),
        "sizeBytes": int(row["size_bytes"] or 0),
        "uploadedAt": int(row["created_at"] or 0),
    }


def mobile_normalize_patient_section_order(value: Any) -> List[str]:
    """Return every known patient-card section exactly once in a safe order."""
    result: List[str] = []
    if isinstance(value, list):
        for item in value:
            key = str(item or "").strip()
            if key in MOBILE_PATIENT_SECTION_ORDER_DEFAULT and key not in result:
                result.append(key)
    # 新增LIS/PACS基线时，旧账号已有的云端顺序里没有该键。
    # 迁移时固定插入“辅助检查”之后，而不是简单追加到最末尾。
    if "lisPacsBaseline" not in result:
        if "auxiliary" in result:
            result.insert(result.index("auxiliary") + 1, "lisPacsBaseline")
        else:
            result.append("lisPacsBaseline")
    for key in MOBILE_PATIENT_SECTION_ORDER_DEFAULT:
        if key not in result:
            result.append(key)
    return result


def mobile_normalize_user_preferences(
    assistant_value: Any,
    inpatient_value: Any,
    privacy_value: Any = None,
    order_visual_value: Any = None,
    ai_provider_value: Any = None,
    attachment_vision_prompt_value: Any = None,
    readability_value: Any = None,
) -> Dict[str, Any]:
    assistant_source = assistant_value if isinstance(assistant_value, dict) else {}
    assistant = {
        key: (
            bool(assistant_source[key])
            if isinstance(assistant_source.get(key), bool)
            else default
        )
        for key, default in MOBILE_ASSISTANT_PREFERENCES_DEFAULT.items()
    }

    privacy_source = privacy_value if isinstance(privacy_value, dict) else {}
    privacy = {
        key: (
            bool(privacy_source[key])
            if isinstance(privacy_source.get(key), bool)
            else default
        )
        for key, default in MOBILE_PRIVACY_PREFERENCES_DEFAULT.items()
    }

    readability_source = readability_value if isinstance(readability_value, dict) else {}
    readability = {
        "markdown": (
            readability_source["markdown"]
            if isinstance(readability_source.get("markdown"), bool)
            else MOBILE_READABILITY_PREFERENCES_DEFAULT["markdown"]
        )
    }
    for key in ("analysisFontSize", "insuranceFontSize"):
        value = readability_source.get(key)
        readability[key] = (
            value
            if type(value) is int and value in MOBILE_READABILITY_FONT_SIZES
            else MOBILE_READABILITY_PREFERENCES_DEFAULT[key]
        )

    inpatient_source = inpatient_value if isinstance(inpatient_value, dict) else {}
    visible_source = inpatient_source.get("visibleColumns")
    visible_columns: Dict[str, bool] = {}
    if isinstance(visible_source, dict):
        for raw_key, raw_value in list(visible_source.items())[:240]:
            if not isinstance(raw_key, str) or not isinstance(raw_value, bool):
                continue
            key = raw_key.strip()[:160]
            if key:
                visible_columns[key] = raw_value

    def short_text(key: str) -> str:
        value = inpatient_source.get(key)
        return str(value or "").strip()[:200] if isinstance(value, str) else ""

    sort_key = str(inpatient_source.get("sortKey") or "sequence").strip()
    if sort_key not in MOBILE_INPATIENT_SORT_KEYS:
        sort_key = "sequence"
    sort_direction = str(inpatient_source.get("sortDirection") or "asc").strip()
    if sort_direction not in {"asc", "desc"}:
        sort_direction = "asc"

    order_visual_source = (
        order_visual_value
        if isinstance(order_visual_value, dict)
        else {}
    )
    order_visual = {
        key: (
            bool(order_visual_source[key])
            if isinstance(order_visual_source.get(key), bool)
            else default
        )
        for key, default in MOBILE_ORDER_VISUAL_PREFERENCES_DEFAULT.items()
    }

    attachment_vision_prompt = (
        str(attachment_vision_prompt_value or "").strip()[:6000]
        if isinstance(attachment_vision_prompt_value, str)
        else ""
    )

    return {
        "assistant": assistant,
        "privacy": privacy,
        "readability": readability,
        "inpatient": {
            "visibleColumns": visible_columns,
            "attendingFilter": short_text("attendingFilter"),
            "responsibleFilter": short_text("responsibleFilter"),
            "drgFilter": short_text("drgFilter"),
            "sortKey": sort_key,
            "sortDirection": sort_direction,
        },
        "orderVisual": order_visual,
        "aiProvider": normalize_mobile_ai_provider_id(ai_provider_value),
        # 空字符串不是“保存一份默认提示词”，而是表示继续跟随程序内置默认。
        "attachmentVisionPrompt": attachment_vision_prompt,
    }


def mobile_read_global_preferences(conn: sqlite3.Connection) -> Tuple[Dict[str, Any], int]:
    row = conn.execute(
        """
        SELECT value_json, updated_at
        FROM mobile_global_preferences
        WHERE preference_key = ?
        """,
        ("patient_section_order",),
    ).fetchone()
    value: Any = []
    updated_at = 0
    if row:
        try:
            parsed = json.loads(str(row["value_json"] or "{}"))
            value = (
                parsed.get("patientSectionOrder", [])
                if isinstance(parsed, dict)
                else parsed
            )
        except Exception:
            value = []
        updated_at = int(row["updated_at"] or 0)
    return {
        "patientSectionOrder": mobile_normalize_patient_section_order(value)
    }, updated_at


def mobile_read_user_preferences(
    conn: sqlite3.Connection,
    user_id: int,
) -> Tuple[Dict[str, Any], int]:
    row = conn.execute(
        """
        SELECT preferences_json, updated_at
        FROM mobile_user_preferences
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    parsed: Dict[str, Any] = {}
    updated_at = 0
    if row:
        try:
            value = json.loads(str(row["preferences_json"] or "{}"))
            if isinstance(value, dict):
                parsed = value
        except Exception:
            parsed = {}
        updated_at = int(row["updated_at"] or 0)
    return mobile_normalize_user_preferences(
        parsed.get("assistant"),
        parsed.get("inpatient"),
        parsed.get("privacy"),
        parsed.get("orderVisual"),
        parsed.get("aiProvider"),
        parsed.get("attachmentVisionPrompt"),
        parsed.get("readability"),
    ), updated_at


@app.get("/api/mobile/preferences")
def mobile_preferences(user: Dict[str, Any] = Depends(require_user)):
    """Read the shared patient-card order and the signed-in account's preferences."""
    with db_connect() as conn:
        global_preferences, global_updated_at = mobile_read_global_preferences(conn)
        # OHA_admin统一控制静态图片上传压缩档位；所有移动账号读取同一值。
        global_preferences["imageCompressionMode"] = normalize_mobile_image_compression_mode(
            read_system_setting(
                conn,
                "mobile.imageCompressionMode",
                DEFAULT_CLIENT_SETTINGS["mobileImageCompressionMode"],
            )
        )
        global_preferences["aiProviders"] = mobile_ai_public_catalog(conn)
        user_preferences, user_updated_at = mobile_read_user_preferences(
            conn,
            int(user["user_id"]),
        )
    role = str(user.get("role") or "")
    return JSONResponse(
        content={
            "ok": True,
            "username": str(user.get("username") or ""),
            "role": role,
            "isAdmin": role.lower() == "admin",
            "global": global_preferences,
            "user": user_preferences,
            "globalUpdatedAt": global_updated_at,
            "userUpdatedAt": user_updated_at,
        },
        headers=mobile_no_store_headers(),
    )


@app.put("/api/mobile/preferences/user")
def mobile_user_preferences_update(
    body: MobileUserPreferencesRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    user_id = int(user["user_id"])
    current = now_ts()
    with db_connect() as conn:
        # v1.16.7向后兼容：旧移动页没有orderVisual字段时，保留服务器中
        # 已经保存的三个医嘱可视化开关，避免旧设备修改其它设置时把它们清空。
        existing_preferences, _ = mobile_read_user_preferences(conn, user_id)
        # 旧移动页只上传已知隐私键时，保留新版责任医师显示选择。
        privacy_value = dict(existing_preferences.get("privacy") or {})
        if isinstance(body.privacy, dict):
            privacy_value.update(body.privacy)
        # 旧手机页面只发送 markdown 时，保留此账号已保存的字号。
        readability_value = dict(existing_preferences.get("readability") or {})
        if isinstance(body.readability, dict):
            readability_value.update(body.readability)
        order_visual_value = (
            body.orderVisual
            if isinstance(body.orderVisual, dict)
            else existing_preferences.get("orderVisual")
        )
        ai_provider_value = (
            body.aiProvider
            if body.aiProvider is not None
            else existing_preferences.get("aiProvider")
        )
        attachment_vision_prompt_value = (
            body.attachmentVisionPrompt
            if body.attachmentVisionPrompt is not None
            else existing_preferences.get("attachmentVisionPrompt")
        )
        preferences = mobile_normalize_user_preferences(
            body.assistant,
            body.inpatient,
            privacy_value,
            order_visual_value,
            ai_provider_value,
            attachment_vision_prompt_value,
            readability_value,
        )
        raw = json.dumps(preferences, ensure_ascii=False, separators=(",", ":"))
        if len(raw.encode("utf-8")) > MOBILE_USER_PREFERENCES_MAX_BYTES:
            raise HTTPException(status_code=413, detail="掌上OHA账号偏好超过64KB上限")
        conn.execute(
            """
            INSERT INTO mobile_user_preferences(user_id, preferences_json, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                preferences_json = excluded.preferences_json,
                updated_at = excluded.updated_at
            """,
            (user_id, raw, current),
        )
        conn.commit()
    return JSONResponse(
        content={"ok": True, "user": preferences, "updatedAt": current},
        headers=mobile_no_store_headers(),
    )


@app.put("/api/mobile/preferences/global")
def mobile_global_preferences_update(
    body: MobileGlobalPreferencesRequest,
    user: Dict[str, Any] = Depends(require_admin),
):
    preferences = {
        "patientSectionOrder": mobile_normalize_patient_section_order(
            body.patientSectionOrder
        )
    }
    raw = json.dumps(preferences, ensure_ascii=False, separators=(",", ":"))
    current = now_ts()
    with db_connect() as conn:
        conn.execute(
            """
            INSERT INTO mobile_global_preferences(
                preference_key, value_json, updated_by, updated_at
            ) VALUES(?, ?, ?, ?)
            ON CONFLICT(preference_key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at
            """,
            (
                "patient_section_order",
                raw,
                int(user["user_id"]),
                current,
            ),
        )
        conn.commit()
    return JSONResponse(
        content={"ok": True, "global": preferences, "updatedAt": current},
        headers=mobile_no_store_headers(),
    )


@app.get("/", response_class=HTMLResponse)
def mobile_home():
    """掌上 OpenHisAssistant 主页面。页面本身不含患者数据，数据接口必须登录后访问。"""
    if not MOBILE_PAGE_PATH.exists():
        raise HTTPException(status_code=404, detail="掌上 OpenHisAssistant 页面文件不存在")
    return HTMLResponse(
        MOBILE_PAGE_PATH.read_text(encoding="utf-8"),
        headers=mobile_no_store_headers(),
    )


@app.get("/mobile", response_class=HTMLResponse)
def mobile_home_alias():
    return mobile_home()


@app.get("/api/mobile/round-book")
def mobile_round_book(user: Dict[str, Any] = Depends(require_user)):
    """读取当前 OHA 账号最近一次上传的查房本快照、独立备注字典及已推送备注。"""
    user_id = int(user["user_id"])
    snapshot: Dict[str, Any] = {}
    source_label = ""
    source_device_id = ""
    updated_at = 0
    with db_connect() as conn:
        row = conn.execute(
            """
            SELECT snapshot_json, source_label, source_device_id, updated_at
            FROM mobile_round_book_snapshots
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        if row:
            try:
                parsed = json.loads(str(row["snapshot_json"] or "{}"))
                if isinstance(parsed, dict):
                    snapshot = parsed
            except Exception:
                snapshot = {}
            source_label = str(row["source_label"] or "")
            source_device_id = str(row["source_device_id"] or "")
            updated_at = int(row["updated_at"] or 0)

        # 首次使用v0.3时，把旧版手机备注迁移到病案号索引字典；只补空，不覆盖。
        mobile_migrate_legacy_notes(conn, user_id, snapshot)
        legacy_notes = mobile_read_notes(conn, user_id)
        note_dictionary = mobile_read_note_dictionary(conn, user_id)
        pushed_notes = mobile_read_pushed_notes(conn, user_id)

    return JSONResponse(
        content={
            "ok": True,
            "username": str(user.get("username") or ""),
            "role": str(user.get("role") or ""),
            "snapshot": snapshot,
            "notes": legacy_notes,
            "noteDictionary": note_dictionary,
            "pushedNotes": pushed_notes,
            "sourceLabel": source_label,
            "sourceDeviceId": source_device_id,
            "updatedAt": updated_at,
        },
        headers=mobile_no_store_headers(),
    )


@app.put("/api/mobile/round-book")
def mobile_round_book_upload(
    body: MobileRoundBookSnapshotRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """
    保存查房本快照。这个接口为下一阶段“桌面查房本 → 掌上 OHA”同步预留。
    不在根页面自动调用，避免服务器在用户不知情时采集患者资料。
    """
    try:
        raw = json.dumps(
            body.snapshot if isinstance(body.snapshot, dict) else {},
            ensure_ascii=False,
            separators=(",", ":"),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="查房本快照无法序列化") from exc

    if len(raw.encode("utf-8")) > MOBILE_ROUND_BOOK_MAX_BYTES:
        raise HTTPException(status_code=413, detail="查房本快照超过12MB上限")

    current = now_ts()
    archived_count = 0
    with db_connect() as conn:
        conn.execute(
            """
            INSERT INTO mobile_round_book_snapshots(
                user_id, snapshot_json, source_label, source_device_id, updated_at
            ) VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                snapshot_json = excluded.snapshot_json,
                source_label = excluded.source_label,
                source_device_id = excluded.source_device_id,
                updated_at = excluded.updated_at
            """,
            (
                int(user["user_id"]),
                raw,
                str(body.sourceLabel or "查房本").strip()[:120],
                str(user.get("device_id") or "")[:200],
                current,
            ),
        )
        archived_count = mobile_archive_ingest_snapshot(
            conn,
            int(user["user_id"]),
            body.snapshot if isinstance(body.snapshot, dict) else {},
            current,
        )
        conn.commit()

    records_value = body.snapshot.get("records") if isinstance(body.snapshot, dict) else None
    if isinstance(records_value, dict):
        record_count = len(records_value)
    elif isinstance(records_value, list):
        record_count = len(records_value)
    else:
        record_count = int(body.snapshot.get("recordCount") or 0) if isinstance(body.snapshot, dict) else 0

    return {
        "ok": True,
        "updatedAt": current,
        "bytes": len(raw.encode("utf-8")),
        "recordCount": record_count,
        "archivedCount": archived_count,
        "sourceLabel": str(body.sourceLabel or "查房本").strip()[:120],
    }


@app.get("/api/mobile/archive")
def mobile_archive_list(
    q: str = "",
    page: int = 1,
    pageSize: int = 20,
    hasAttachments: str = "any",
    drgGroup: str = "",
    status: str = "all",
    dateFrom: str = "",
    dateTo: str = "",
    user: Dict[str, Any] = Depends(require_user),
):
    """分页检索当前账号的患者档案；绝不跨账号聚合。"""
    user_id = int(user["user_id"])
    safe_page_size = max(5, min(MOBILE_ARCHIVE_MAX_PAGE_SIZE, int(pageSize or 20)))
    requested_page = max(1, int(page or 1))
    with db_connect() as conn:
        mobile_archive_ensure_seeded(conn, user_id)
        where_sql, params, filters = mobile_archive_filter_sql(
            user_id,
            q,
            hasAttachments,
            drgGroup,
            status,
            dateFrom,
            dateTo,
        )
        total = int(
            conn.execute(
                "SELECT COUNT(*) AS c FROM mobile_patient_archive a" + where_sql,
                params,
            ).fetchone()["c"]
            or 0
        )
        page_count = (total + safe_page_size - 1) // safe_page_size if total else 0
        safe_page = min(requested_page, page_count) if page_count else 1
        offset = (safe_page - 1) * safe_page_size
        rows = conn.execute(
            """
            SELECT a.*,
                   (SELECT COUNT(*) FROM mobile_patient_attachments ma
                    WHERE ma.user_id = a.user_id
                      AND ma.admission_no = a.admission_no) AS attachment_count,
                   (SELECT COUNT(*) FROM mobile_patient_archive_days d
                    WHERE d.user_id = a.user_id
                      AND d.admission_no = a.admission_no) AS day_count
            FROM mobile_patient_archive a
            """
            + where_sql
            + " ORDER BY COALESCE(NULLIF(a.discharged_date, ''), NULLIF(a.last_seen_date, ''), NULLIF(a.admission_date, '')) DESC, a.admission_no COLLATE NOCASE LIMIT ? OFFSET ?",
            params + [safe_page_size, offset],
        ).fetchall()
        totals = conn.execute(
            """
            SELECT
                COALESCE(SUM((SELECT COUNT(*)
                              FROM mobile_patient_attachments ma
                              WHERE ma.user_id = a.user_id
                                AND ma.admission_no = a.admission_no)), 0) AS attachment_count,
                COALESCE(SUM((SELECT COALESCE(SUM(ma.size_bytes), 0)
                              FROM mobile_patient_attachments ma
                              WHERE ma.user_id = a.user_id
                                AND ma.admission_no = a.admission_no)), 0) AS attachment_bytes
            FROM mobile_patient_archive a
            """
            + where_sql,
            params,
        ).fetchone()
        drg_rows = conn.execute(
            """
            SELECT DISTINCT drg_group
            FROM mobile_patient_archive
            WHERE user_id = ? AND drg_group <> ''
            ORDER BY drg_group COLLATE NOCASE
            LIMIT 500
            """,
            (user_id,),
        ).fetchall()
    return JSONResponse(
        content={
            "ok": True,
            "items": [mobile_archive_summary_item(row) for row in rows],
            "total": total,
            "page": safe_page,
            "pageSize": safe_page_size,
            "pageCount": page_count,
            "filters": filters,
            "drgGroups": [str(row["drg_group"] or "") for row in drg_rows],
            "matchedAttachmentCount": int(totals["attachment_count"] or 0),
            "matchedAttachmentBytes": int(totals["attachment_bytes"] or 0),
        },
        headers=mobile_no_store_headers(),
    )


@app.get("/api/mobile/archive/{admission_no}")
def mobile_archive_detail(
    admission_no: str,
    dateKey: str = "",
    user: Dict[str, Any] = Depends(require_user),
):
    """读取一份档案及指定日期节点，字段与患者卡片保持同源。"""
    user_id = int(user["user_id"])
    target = mobile_archive_text(unquote(admission_no), 64)
    if not target:
        raise HTTPException(status_code=400, detail="病案号为空")
    requested_date = mobile_archive_optional_date(dateKey, "档案日期")
    with db_connect() as conn:
        mobile_archive_ensure_seeded(conn, user_id)
        row = conn.execute(
            """
            SELECT a.*,
                   (SELECT COUNT(*) FROM mobile_patient_attachments ma
                    WHERE ma.user_id = a.user_id
                      AND ma.admission_no = a.admission_no) AS attachment_count,
                   (SELECT COUNT(*) FROM mobile_patient_archive_days d
                    WHERE d.user_id = a.user_id
                      AND d.admission_no = a.admission_no) AS day_count
            FROM mobile_patient_archive a
            WHERE a.user_id = ? AND a.admission_no = ?
            """,
            (user_id, target),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="档案不存在")
        day_rows = conn.execute(
            """
            SELECT date_key, record_json, daily_json, snapshot_at
            FROM mobile_patient_archive_days
            WHERE user_id = ? AND admission_no = ?
            ORDER BY date_key DESC
            """,
            (user_id, target),
        ).fetchall()
        if not day_rows:
            raise HTTPException(status_code=404, detail="档案没有可显示的日期节点")
        selected = None
        if requested_date:
            selected = next(
                (item for item in day_rows if str(item["date_key"] or "") == requested_date),
                None,
            )
            if selected is None:
                raise HTTPException(status_code=404, detail="该日期没有已保存的档案节点")
        else:
            selected = day_rows[0]
        note_row = conn.execute(
            """
            SELECT note, updated_at
            FROM mobile_round_book_note_dictionary
            WHERE user_id = ? AND admission_no = ?
            """,
            (user_id, target),
        ).fetchone()
        pushed_row = conn.execute(
            """
            SELECT note, updated_at
            FROM mobile_round_book_note_pushes
            WHERE user_id = ? AND admission_no = ? AND date_key = ?
            """,
            (user_id, target, str(selected["date_key"] or "")),
        ).fetchone()
        attachment_rows = conn.execute(
            """
            SELECT id, admission_no, original_name, mime_type, size_bytes, created_at
            FROM mobile_patient_attachments
            WHERE user_id = ? AND admission_no = ?
            ORDER BY created_at DESC, id DESC
            """,
            (user_id, target),
        ).fetchall()
    return JSONResponse(
        content={
            "ok": True,
            "summary": mobile_archive_summary_item(row),
            "dateKey": str(selected["date_key"] or ""),
            "dates": [
                {
                    "dateKey": str(item["date_key"] or ""),
                    "status": mobile_archive_status(
                        mobile_archive_json(item["daily_json"]).get("status")
                    ),
                    "snapshotAt": int(item["snapshot_at"] or 0),
                }
                for item in day_rows
            ],
            "record": mobile_archive_json(selected["record_json"]),
            "daily": mobile_archive_json(selected["daily_json"]),
            "dictionaryNote": str(note_row["note"] or "") if note_row else "",
            "dictionaryNoteUpdatedAt": int(note_row["updated_at"] or 0) if note_row else 0,
            "pushedNote": str(pushed_row["note"] or "") if pushed_row else "",
            "pushedNoteUpdatedAt": int(pushed_row["updated_at"] or 0) if pushed_row else 0,
            "attachments": [mobile_attachment_item(item) for item in attachment_rows],
        },
        headers=mobile_no_store_headers(),
    )


@app.post("/api/mobile/archive/attachments/clear")
def mobile_archive_clear_attachments(
    body: MobileArchiveClearAttachmentsRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """清除当前账号选定或全部匹配档案的附件；执行前强制校验当前用户密码。"""
    user_id = int(user["user_id"])
    with db_connect() as conn:
        password_row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not password_row or not password_verify(body.password, password_row["password_hash"]):
            # 使用400而不是401，避免“二次验证失败”被客户端误判为登录会话失效并强制退出。
            raise HTTPException(
                status_code=400,
                detail="当前用户密码验证失败，未执行附件清除",
            )

        mobile_archive_ensure_seeded(conn, user_id)
        targets, filters = mobile_archive_resolve_targets(conn, user_id, body)
        attachment_rows: List[sqlite3.Row] = []
        for offset in range(0, len(targets), 500):
            chunk = targets[offset : offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            attachment_rows.extend(
                conn.execute(
                    """
                    SELECT id, stored_path, size_bytes
                    FROM mobile_patient_attachments
                    WHERE user_id = ? AND admission_no IN (
                    """
                    + placeholders
                    + ")",
                    [user_id] + chunk,
                ).fetchall()
            )
        paths = [mobile_attachment_path(str(row["stored_path"] or "")) for row in attachment_rows]
        for path in paths:
            path.unlink(missing_ok=True)
        for offset in range(0, len(targets), 500):
            chunk = targets[offset : offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            conn.execute(
                "DELETE FROM mobile_patient_attachments WHERE user_id = ? "
                f"AND admission_no IN ({placeholders})",
                [user_id] + chunk,
            )
        conn.commit()
    return JSONResponse(
        content={
            "ok": True,
            "patientCount": len(targets),
            "attachmentCount": len(attachment_rows),
            "bytes": sum(int(row["size_bytes"] or 0) for row in attachment_rows),
            "filters": filters,
        },
        headers=mobile_no_store_headers(),
    )


@app.post("/api/mobile/archive/clear")
def mobile_archive_clear(
    body: MobileArchiveClearRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """清除选定/匹配范围内的完整患者档案；执行前强制校验当前用户密码。"""
    user_id = int(user["user_id"])
    with db_connect() as conn:
        password_row = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not password_row or not password_verify(body.password, password_row["password_hash"]):
            raise HTTPException(
                status_code=400,
                detail="当前用户密码验证失败，未执行档案清除",
            )

        mobile_archive_ensure_seeded(conn, user_id)
        targets, filters = mobile_archive_resolve_targets(conn, user_id, body)
        attachment_rows: List[sqlite3.Row] = []
        day_count = 0
        dictionary_note_count = 0
        pushed_note_count = 0
        for offset in range(0, len(targets), 500):
            chunk = targets[offset : offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            params = [user_id] + chunk
            attachment_rows.extend(
                conn.execute(
                    "SELECT id, stored_path, size_bytes FROM mobile_patient_attachments "
                    f"WHERE user_id = ? AND admission_no IN ({placeholders})",
                    params,
                ).fetchall()
            )
            day_count += int(
                conn.execute(
                    "SELECT COUNT(*) AS c FROM mobile_patient_archive_days "
                    f"WHERE user_id = ? AND admission_no IN ({placeholders})",
                    params,
                ).fetchone()["c"]
                or 0
            )
            dictionary_note_count += int(
                conn.execute(
                    "SELECT COUNT(*) AS c FROM mobile_round_book_note_dictionary "
                    f"WHERE user_id = ? AND admission_no IN ({placeholders})",
                    params,
                ).fetchone()["c"]
                or 0
            )
            pushed_note_count += int(
                conn.execute(
                    "SELECT COUNT(*) AS c FROM mobile_round_book_note_pushes "
                    f"WHERE user_id = ? AND admission_no IN ({placeholders})",
                    params,
                ).fetchone()["c"]
                or 0
            )

        for row in attachment_rows:
            mobile_attachment_path(str(row["stored_path"] or "")).unlink(missing_ok=True)

        for offset in range(0, len(targets), 500):
            chunk = targets[offset : offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            params = [user_id] + chunk
            conn.execute(
                "DELETE FROM mobile_patient_attachments WHERE user_id = ? "
                f"AND admission_no IN ({placeholders})",
                params,
            )
            conn.execute(
                "DELETE FROM mobile_round_book_note_dictionary WHERE user_id = ? "
                f"AND admission_no IN ({placeholders})",
                params,
            )
            conn.execute(
                "DELETE FROM mobile_round_book_note_pushes WHERE user_id = ? "
                f"AND admission_no IN ({placeholders})",
                params,
            )
            # mobile_patient_archive_days 通过外键 ON DELETE CASCADE 自动删除。
            conn.execute(
                "DELETE FROM mobile_patient_archive WHERE user_id = ? "
                f"AND admission_no IN ({placeholders})",
                params,
            )
        conn.commit()

    return JSONResponse(
        content={
            "ok": True,
            "patientCount": len(targets),
            "dayCount": day_count,
            "attachmentCount": len(attachment_rows),
            "bytes": sum(int(row["size_bytes"] or 0) for row in attachment_rows),
            "dictionaryNoteCount": dictionary_note_count,
            "pushedNoteCount": pushed_note_count,
            "filters": filters,
        },
        headers=mobile_no_store_headers(),
    )


def mobile_archive_backup_attachment_name(admission_no: str, attachment: Dict[str, Any]) -> str:
    safe_admission = re.sub(r"[^0-9A-Za-z._-]+", "_", admission_no).strip("._")
    if not safe_admission:
        safe_admission = hashlib.sha256(admission_no.encode("utf-8")).hexdigest()[:16]
    attachment_id = str(attachment.get("id") or "")[:8]
    safe_name = mobile_attachment_safe_name(str(attachment.get("name") or "患者附件"))
    return "附件/" + safe_admission + "/" + attachment_id + "_" + safe_name


@app.post("/api/mobile/archive/import")
async def mobile_archive_import(
    request: Request,
    user: Dict[str, Any] = Depends(require_user),
):
    """导入本系统“患者档案库”导出的ZIP；数据按当前登录账号恢复。"""
    user_id = int(user["user_id"])
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            if int(declared_length) > MOBILE_ARCHIVE_MAX_IMPORT_BYTES:
                raise HTTPException(status_code=413, detail="档案备份ZIP超过允许的导入大小")
        except ValueError:
            pass

    import_root = MOBILE_ATTACHMENT_ROOT.parent / "mobile_archive_imports"
    import_root.mkdir(parents=True, exist_ok=True)
    temporary = tempfile.NamedTemporaryFile(
        prefix="oha-archive-import-",
        suffix=".zip",
        dir=str(import_root),
        delete=False,
    )
    temporary_path = Path(temporary.name)
    temporary.close()
    upload_bytes = 0
    created_files: List[Path] = []
    try:
        with temporary_path.open("wb") as handle:
            async for chunk in request.stream():
                if not chunk:
                    continue
                upload_bytes += len(chunk)
                if upload_bytes > MOBILE_ARCHIVE_MAX_IMPORT_BYTES:
                    raise HTTPException(status_code=413, detail="档案备份ZIP超过允许的导入大小")
                handle.write(chunk)
        if upload_bytes <= 0:
            raise HTTPException(status_code=400, detail="导入文件为空")

        try:
            backup = zipfile.ZipFile(temporary_path, "r")
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="导入文件不是有效的ZIP档案备份")

        with backup:
            names = set(backup.namelist())
            if "档案数据.json" not in names:
                raise HTTPException(status_code=400, detail="ZIP中缺少档案数据.json，无法识别为OHA档案备份")
            manifest_info = backup.getinfo("档案数据.json")
            if int(manifest_info.file_size or 0) > MOBILE_ARCHIVE_MAX_MANIFEST_BYTES:
                raise HTTPException(status_code=413, detail="档案数据清单过大")
            try:
                manifest = json.loads(backup.read("档案数据.json").decode("utf-8"))
            except Exception:
                raise HTTPException(status_code=400, detail="档案数据.json格式无效")
            if not isinstance(manifest, dict) or manifest.get("kind") != "openhisassistant-mobile-patient-archive-export":
                raise HTTPException(status_code=400, detail="不是受支持的OHA患者档案库备份")
            if int(manifest.get("schemaVersion") or 0) != 1:
                raise HTTPException(status_code=400, detail="档案备份版本不受支持")
            records = manifest.get("records")
            if not isinstance(records, list):
                raise HTTPException(status_code=400, detail="档案备份缺少有效records数据")
            if len(records) > MOBILE_ARCHIVE_MAX_BULK_PATIENTS:
                raise HTTPException(status_code=413, detail="单次导入档案数量超过10000份上限")

            imported_patients = 0
            imported_days = 0
            imported_attachments = 0
            duplicate_attachments = 0
            imported_dictionary_notes = 0
            imported_pushed_notes = 0
            with db_connect() as conn:
                for entry in records:
                    if not isinstance(entry, dict):
                        continue
                    admission_no = mobile_archive_text(entry.get("admissionNo"), 64)
                    if not admission_no:
                        continue
                    archive_meta = entry.get("archive") if isinstance(entry.get("archive"), dict) else {}
                    record = archive_meta.get("record") if isinstance(archive_meta.get("record"), dict) else {}
                    days = entry.get("days") if isinstance(entry.get("days"), list) else []
                    first_seen = mobile_archive_text(archive_meta.get("firstSeenDate"), 32)
                    last_seen = mobile_archive_text(archive_meta.get("lastSeenDate"), 32)
                    discharged_date = mobile_archive_text(archive_meta.get("dischargedDate"), 32)
                    status = mobile_archive_status(archive_meta.get("status"))
                    updated_at = max(0, int(archive_meta.get("updatedAt") or manifest.get("exportedAt") or now_ts()))
                    try:
                        record_raw = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
                    except Exception:
                        record_raw = "{}"
                    conn.execute(
                        """
                        INSERT INTO mobile_patient_archive(
                            user_id, admission_no, record_json, first_seen_date,
                            last_seen_date, discharged_date, status, bed_no,
                            patient_name, diagnosis, drg_group, admission_date, updated_at
                        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(user_id, admission_no) DO UPDATE SET
                            record_json = excluded.record_json,
                            first_seen_date = excluded.first_seen_date,
                            last_seen_date = excluded.last_seen_date,
                            discharged_date = excluded.discharged_date,
                            status = excluded.status,
                            bed_no = excluded.bed_no,
                            patient_name = excluded.patient_name,
                            diagnosis = excluded.diagnosis,
                            drg_group = excluded.drg_group,
                            admission_date = excluded.admission_date,
                            updated_at = excluded.updated_at
                        """,
                        (
                            user_id,
                            admission_no,
                            record_raw,
                            first_seen,
                            last_seen,
                            discharged_date,
                            status,
                            mobile_archive_text(record.get("bedNo"), 160),
                            mobile_archive_text(record.get("name"), 240),
                            mobile_archive_text(record.get("diagnosis"), 20_000),
                            mobile_archive_text(record.get("drgGroup"), 500),
                            mobile_archive_text(record.get("admissionDate"), 64),
                            updated_at,
                        ),
                    )
                    imported_patients += 1

                    for day in days:
                        if not isinstance(day, dict):
                            continue
                        date_key = mobile_archive_text(day.get("dateKey"), 32)
                        if not date_key:
                            continue
                        day_record = day.get("record") if isinstance(day.get("record"), dict) else record
                        daily = day.get("daily") if isinstance(day.get("daily"), dict) else {}
                        snapshot_at = max(0, int(day.get("snapshotAt") or updated_at))
                        conn.execute(
                            """
                            INSERT INTO mobile_patient_archive_days(
                                user_id, admission_no, date_key, record_json, daily_json, snapshot_at
                            ) VALUES(?, ?, ?, ?, ?, ?)
                            ON CONFLICT(user_id, admission_no, date_key) DO UPDATE SET
                                record_json = excluded.record_json,
                                daily_json = excluded.daily_json,
                                snapshot_at = excluded.snapshot_at
                            """,
                            (
                                user_id,
                                admission_no,
                                date_key,
                                json.dumps(day_record, ensure_ascii=False, separators=(",", ":")),
                                json.dumps(daily, ensure_ascii=False, separators=(",", ":")),
                                snapshot_at,
                            ),
                        )
                        imported_days += 1

                    dictionary_note = entry.get("dictionaryNote")
                    if isinstance(dictionary_note, dict):
                        note_text = str(dictionary_note.get("note") or "")
                        note_updated = max(0, int(dictionary_note.get("updatedAt") or updated_at))
                        conn.execute(
                            """
                            INSERT INTO mobile_round_book_note_dictionary(user_id, admission_no, note, updated_at)
                            VALUES(?, ?, ?, ?)
                            ON CONFLICT(user_id, admission_no) DO UPDATE SET
                                note = excluded.note, updated_at = excluded.updated_at
                            """,
                            (user_id, admission_no, note_text, note_updated),
                        )
                        imported_dictionary_notes += 1

                    pushed_notes = entry.get("pushedNotes") if isinstance(entry.get("pushedNotes"), list) else []
                    for pushed in pushed_notes:
                        if not isinstance(pushed, dict):
                            continue
                        date_key = mobile_archive_text(pushed.get("dateKey"), 32)
                        if not date_key:
                            continue
                        conn.execute(
                            """
                            INSERT INTO mobile_round_book_note_pushes(user_id, admission_no, date_key, note, updated_at)
                            VALUES(?, ?, ?, ?, ?)
                            ON CONFLICT(user_id, admission_no, date_key) DO UPDATE SET
                                note = excluded.note, updated_at = excluded.updated_at
                            """,
                            (
                                user_id,
                                admission_no,
                                date_key,
                                str(pushed.get("note") or ""),
                                max(0, int(pushed.get("updatedAt") or updated_at)),
                            ),
                        )
                        imported_pushed_notes += 1

                    attachment_items = entry.get("attachments") if isinstance(entry.get("attachments"), list) else []
                    for attachment in attachment_items:
                        if not isinstance(attachment, dict):
                            continue
                        archive_name = mobile_archive_backup_attachment_name(admission_no, attachment)
                        if archive_name not in names:
                            continue
                        info = backup.getinfo(archive_name)
                        if int(info.file_size or 0) <= 0:
                            continue
                        if int(info.file_size or 0) > MOBILE_ATTACHMENT_MAX_FILE_BYTES:
                            raise HTTPException(status_code=413, detail=f"备份附件超过25MB上限：{mobile_attachment_safe_name(attachment.get('name'))}")
                        original_name = mobile_attachment_safe_name(str(attachment.get("name") or "患者附件"))
                        mime_type = mobile_attachment_mime(str(attachment.get("mimeType") or ""), original_name)
                        attachment_id = secrets.token_hex(16)
                        patient_hash = hashlib.sha256(f"{user_id}:{admission_no}".encode("utf-8")).hexdigest()[:32]
                        relative_dir = Path(str(user_id)) / patient_hash
                        target_dir = mobile_attachment_path(str(relative_dir / "placeholder")).parent
                        target_dir.mkdir(parents=True, exist_ok=True)
                        extension = MOBILE_ATTACHMENT_MIME_EXTENSIONS[mime_type]
                        final_path = target_dir / (attachment_id + extension)
                        temp_attachment = target_dir / (".import-" + attachment_id + ".tmp")
                        total = 0
                        prefix = bytearray()
                        digest = hashlib.sha256()
                        try:
                            with backup.open(info, "r") as source, temp_attachment.open("wb") as handle:
                                while True:
                                    chunk = source.read(1024 * 1024)
                                    if not chunk:
                                        break
                                    total += len(chunk)
                                    if total > MOBILE_ATTACHMENT_MAX_FILE_BYTES:
                                        raise HTTPException(status_code=413, detail="备份中存在超过25MB上限的附件")
                                    if len(prefix) < 4096:
                                        prefix.extend(chunk[: 4096 - len(prefix)])
                                    digest.update(chunk)
                                    handle.write(chunk)
                            mobile_attachment_validate_signature(mime_type, bytes(prefix))
                            sha256_value = digest.hexdigest()
                            duplicate = conn.execute(
                                """
                                SELECT id, stored_path FROM mobile_patient_attachments
                                WHERE user_id = ? AND admission_no = ? AND sha256 = ?
                                ORDER BY created_at DESC LIMIT 1
                                """,
                                (user_id, admission_no, sha256_value),
                            ).fetchone()
                            if duplicate and mobile_attachment_path(str(duplicate["stored_path"] or "")).is_file():
                                duplicate_attachments += 1
                                continue
                            if duplicate:
                                conn.execute(
                                    "DELETE FROM mobile_patient_attachments WHERE id = ? AND user_id = ?",
                                    (str(duplicate["id"] or ""), user_id),
                                )
                            usage = conn.execute(
                                """
                                SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS total_bytes
                                FROM mobile_patient_attachments
                                WHERE user_id = ? AND admission_no = ?
                                """,
                                (user_id, admission_no),
                            ).fetchone()
                            if int(usage["file_count"] or 0) >= MOBILE_ATTACHMENT_MAX_PATIENT_FILES:
                                raise HTTPException(status_code=413, detail=f"病案号{admission_no}附件数量已达到100个上限")
                            if int(usage["total_bytes"] or 0) + total > MOBILE_ATTACHMENT_MAX_PATIENT_BYTES:
                                raise HTTPException(status_code=413, detail=f"病案号{admission_no}附件总量超过250MB上限")
                            os.replace(str(temp_attachment), str(final_path))
                            created_files.append(final_path)
                            relative_path = str(final_path.relative_to(MOBILE_ATTACHMENT_ROOT)).replace("\\", "/")
                            conn.execute(
                                """
                                INSERT INTO mobile_patient_attachments(
                                    id, user_id, admission_no, original_name, stored_path,
                                    mime_type, size_bytes, sha256, created_at
                                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    attachment_id,
                                    user_id,
                                    admission_no,
                                    original_name,
                                    relative_path,
                                    mime_type,
                                    total,
                                    sha256_value,
                                    max(0, int(attachment.get("uploadedAt") or now_ts())),
                                ),
                            )
                            imported_attachments += 1
                        finally:
                            temp_attachment.unlink(missing_ok=True)
                conn.commit()

        return JSONResponse(
            content={
                "ok": True,
                "patientCount": imported_patients,
                "dayCount": imported_days,
                "attachmentCount": imported_attachments,
                "duplicateAttachmentCount": duplicate_attachments,
                "dictionaryNoteCount": imported_dictionary_notes,
                "pushedNoteCount": imported_pushed_notes,
            },
            headers=mobile_no_store_headers(),
        )
    except Exception:
        for path in created_files:
            path.unlink(missing_ok=True)
        raise
    finally:
        temporary_path.unlink(missing_ok=True)


@app.post("/api/mobile/archive/export")
def mobile_archive_export(
    body: MobileArchiveBulkRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """导出卡片历史JSON，并按用户选项附加实际附件文件。"""
    user_id = int(user["user_id"])
    with db_connect() as conn:
        mobile_archive_ensure_seeded(conn, user_id)
        targets, filters = mobile_archive_resolve_targets(conn, user_id, body)
        archive_rows: Dict[str, sqlite3.Row] = {}
        days: Dict[str, List[Dict[str, Any]]] = {item: [] for item in targets}
        attachments: Dict[str, List[sqlite3.Row]] = {item: [] for item in targets}
        notes: Dict[str, Dict[str, Any]] = {}
        pushes: Dict[str, List[Dict[str, Any]]] = {item: [] for item in targets}
        for offset in range(0, len(targets), 500):
            chunk = targets[offset : offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            for row in conn.execute(
                "SELECT * FROM mobile_patient_archive WHERE user_id = ? "
                f"AND admission_no IN ({placeholders})",
                [user_id] + chunk,
            ).fetchall():
                archive_rows[str(row["admission_no"] or "")] = row
            for row in conn.execute(
                """
                SELECT admission_no, date_key, record_json, daily_json, snapshot_at
                FROM mobile_patient_archive_days
                WHERE user_id = ? AND admission_no IN (
                """
                + placeholders
                + ") ORDER BY admission_no, date_key",
                [user_id] + chunk,
            ).fetchall():
                admission = str(row["admission_no"] or "")
                days.setdefault(admission, []).append(
                    {
                        "dateKey": str(row["date_key"] or ""),
                        "record": mobile_archive_json(row["record_json"]),
                        "daily": mobile_archive_json(row["daily_json"]),
                        "snapshotAt": int(row["snapshot_at"] or 0),
                    }
                )
            for row in conn.execute(
                """
                SELECT id, admission_no, original_name, stored_path,
                       mime_type, size_bytes, created_at
                FROM mobile_patient_attachments
                WHERE user_id = ? AND admission_no IN (
                """
                + placeholders
                + ") ORDER BY admission_no, created_at",
                [user_id] + chunk,
            ).fetchall():
                attachments.setdefault(str(row["admission_no"] or ""), []).append(row)
            for row in conn.execute(
                """
                SELECT admission_no, note, updated_at
                FROM mobile_round_book_note_dictionary
                WHERE user_id = ? AND admission_no IN (
                """
                + placeholders
                + ")",
                [user_id] + chunk,
            ).fetchall():
                notes[str(row["admission_no"] or "")] = {
                    "note": str(row["note"] or ""),
                    "updatedAt": int(row["updated_at"] or 0),
                }
            for row in conn.execute(
                """
                SELECT admission_no, date_key, note, updated_at
                FROM mobile_round_book_note_pushes
                WHERE user_id = ? AND admission_no IN (
                """
                + placeholders
                + ") ORDER BY admission_no, date_key",
                [user_id] + chunk,
            ).fetchall():
                pushes.setdefault(str(row["admission_no"] or ""), []).append(
                    {
                        "dateKey": str(row["date_key"] or ""),
                        "note": str(row["note"] or ""),
                        "updatedAt": int(row["updated_at"] or 0),
                    }
                )
        attachment_bytes = sum(
            int(row["size_bytes"] or 0)
            for rows in attachments.values()
            for row in rows
        )
        if body.includeAttachments and attachment_bytes > MOBILE_ARCHIVE_MAX_EXPORT_BYTES:
            raise HTTPException(status_code=413, detail="导出附件超过1GB，请缩小筛选范围后分批导出")
        exported_at = now_ts()
        payload_records: List[Dict[str, Any]] = []
        for admission in targets:
            row = archive_rows.get(admission)
            if not row:
                continue
            patient_attachments = attachments.get(admission, [])
            payload_records.append(
                {
                    "admissionNo": admission,
                    "archive": {
                        "record": mobile_archive_json(row["record_json"]),
                        "firstSeenDate": str(row["first_seen_date"] or ""),
                        "lastSeenDate": str(row["last_seen_date"] or ""),
                        "dischargedDate": str(row["discharged_date"] or ""),
                        "status": str(row["status"] or "ward"),
                        "updatedAt": int(row["updated_at"] or 0),
                    },
                    "days": days.get(admission, []),
                    "dictionaryNote": notes.get(admission),
                    "pushedNotes": pushes.get(admission, []),
                    "attachments": [mobile_attachment_item(item) for item in patient_attachments],
                }
            )
    manifest = {
        "kind": "openhisassistant-mobile-patient-archive-export",
        "schemaVersion": 1,
        "exportedAt": exported_at,
        "username": str(user.get("username") or ""),
        "filters": filters,
        "patientCount": len(payload_records),
        "attachmentCount": sum(len(items) for items in attachments.values()),
        "attachmentBytes": attachment_bytes,
        "includeAttachmentFiles": bool(body.includeAttachments),
        "includedAttachmentCount": (
            sum(len(items) for items in attachments.values())
            if body.includeAttachments
            else 0
        ),
        "includedAttachmentBytes": attachment_bytes if body.includeAttachments else 0,
        "records": payload_records,
    }
    export_root = MOBILE_ATTACHMENT_ROOT.parent / "mobile_archive_exports"
    export_root.mkdir(parents=True, exist_ok=True)
    temporary = tempfile.NamedTemporaryFile(
        prefix="oha-archive-",
        suffix=".zip",
        dir=str(export_root),
        delete=False,
    )
    temporary_path = Path(temporary.name)
    temporary.close()
    try:
        with zipfile.ZipFile(
            temporary_path,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
            allowZip64=True,
        ) as archive:
            archive.writestr(
                "档案数据.json",
                json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
            )
            if body.includeAttachments:
                for admission in targets:
                    safe_admission = re.sub(r"[^0-9A-Za-z._-]+", "_", admission).strip("._")
                    if not safe_admission:
                        safe_admission = hashlib.sha256(admission.encode("utf-8")).hexdigest()[:16]
                    for item in attachments.get(admission, []):
                        path = mobile_attachment_path(str(item["stored_path"] or ""))
                        if not path.is_file():
                            continue
                        safe_name = mobile_attachment_safe_name(str(item["original_name"] or "患者附件"))
                        archive_name = (
                            "附件/"
                            + safe_admission
                            + "/"
                            + str(item["id"] or "")[:8]
                            + "_"
                            + safe_name
                        )
                        archive.write(path, archive_name)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    filename = "OHA档案库_" + time.strftime("%Y%m%d_%H%M%S", time.localtime(exported_at)) + ".zip"
    headers = mobile_no_store_headers()
    headers["Content-Disposition"] = "attachment; filename*=UTF-8''" + quote(filename, safe="")
    return FileResponse(
        str(temporary_path),
        media_type="application/zip",
        filename=filename,
        headers=headers,
        background=BackgroundTask(lambda: temporary_path.unlink(missing_ok=True)),
    )


@app.get("/api/mobile/treatment-analysis")
def mobile_treatment_analysis_cache(
    dateKey: str,
    user: Dict[str, Any] = Depends(require_user),
):
    """读取当前账号、指定查房日期的诊疗方案分析共享缓存。"""
    date_key = mobile_validate_date_key(dateKey)
    user_id = int(user["user_id"])
    result: Dict[str, Dict[str, Any]] = {}
    with db_connect() as conn:
        snapshot = mobile_read_snapshot_for_user(conn, user_id)
        valid_admissions = set(mobile_snapshot_admission_map(snapshot).values())
        rows = conn.execute(
            """
            SELECT admission_no, date_key, result_text, source_mode, output_format, analyzed_at
            FROM mobile_treatment_analysis_cache
            WHERE user_id = ? AND date_key = ?
            ORDER BY analyzed_at DESC
            LIMIT 1000
            """,
            (user_id, date_key),
        ).fetchall()
        for row in rows:
            admission_no = str(row["admission_no"] or "").strip()
            if admission_no and admission_no in valid_admissions:
                result[admission_no] = mobile_treatment_cache_item(row)
    return JSONResponse(
        content={
            "ok": True,
            "dateKey": date_key,
            "items": result,
            "count": len(result),
        },
        headers=mobile_no_store_headers(),
    )


@app.post("/api/mobile/treatment-analysis")
def mobile_treatment_analysis_run(
    body: MobileTreatmentAnalysisRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """
    对一位患者执行诊疗方案分析并在成功后更新共享缓存。
    失败时不覆盖既有缓存；批量功能由移动端按患者顺序逐一调用本接口。
    """
    user_id = int(user["user_id"])
    admission_no = str(body.admissionNo or "").strip()[:64]
    date_key = mobile_validate_date_key(body.dateKey)
    source_mode = "batch" if str(body.sourceMode or "").lower() == "batch" else "single"
    with db_connect() as conn:
        _, record, daily = mobile_require_snapshot_patient(
            conn,
            user_id,
            admission_no,
            date_key,
        )
        ai_provider = mobile_ai_selected_provider(conn, user_id, "text")
        output_format = mobile_requested_review_format(conn, user_id, body.outputFormat)
    if daily is None:
        raise HTTPException(status_code=400, detail="未找到患者当日查房数据")
    payload = mobile_treatment_analysis_payload(record, daily, date_key)
    result_text = mobile_request_treatment_analysis(
        payload, ai_provider, mobile_review_prompt("treatment", output_format)
    )
    analyzed_at = now_ts()
    with db_connect() as conn:
        conn.execute(
            """
            INSERT INTO mobile_treatment_analysis_cache(
                user_id, admission_no, date_key, result_text, source_mode, output_format, analyzed_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, admission_no, date_key) DO UPDATE SET
                result_text = excluded.result_text,
                source_mode = excluded.source_mode,
                output_format = excluded.output_format,
                analyzed_at = excluded.analyzed_at
            """,
            (
                user_id,
                admission_no,
                date_key,
                result_text,
                source_mode,
                output_format,
                analyzed_at,
            ),
        )
        conn.execute(
            """
            DELETE FROM mobile_treatment_analysis_cache
            WHERE rowid IN (
                SELECT rowid
                FROM mobile_treatment_analysis_cache
                WHERE user_id = ?
                ORDER BY analyzed_at DESC, rowid DESC
                LIMIT -1 OFFSET ?
            )
            """,
            (user_id, MOBILE_TREATMENT_ANALYSIS_MAX_CACHE_ENTRIES),
        )
        conn.commit()
    return JSONResponse(
        content={
            "ok": True,
            "analysis": {
                "admissionNo": admission_no,
                "dateKey": date_key,
                "text": result_text,
                "sourceMode": source_mode,
                "outputFormat": output_format,
                "analyzedAt": analyzed_at,
                "provider": ai_provider.get("id", ""),
                "providerLabel": ai_provider.get("label", ""),
                "model": ai_provider.get("textModel", ""),
            },
        },
        headers=mobile_no_store_headers(),
    )


def mobile_insurance_consistency_payload(
    record: Dict[str, Any], daily: Dict[str, Any], date_key: str,
) -> Dict[str, Any]:
    clean = lambda value, maximum=8000: mobile_clinical_text(value, record, maximum)
    diagnosis = clean(record.get("diagnosis"), 7000)
    if not diagnosis:
        raise HTTPException(status_code=400, detail="入院诊断为空，无法建立医保诊断基线")
    order_visual = daily.get("basicSituationVisual")
    orders = order_visual.get("records") if isinstance(order_visual, dict) else []
    compact_orders = [
        {
            key: clean(row.get(key), 1000)
            for key in ("name", "dose", "route", "frequency", "status", "startTime", "stopTime")
            if row.get(key)
        }
        for row in (orders[:160] if isinstance(orders, list) else [])
        if isinstance(row, dict)
    ]
    clinical = {
        "admissionDiagnosis": diagnosis,
        "currentTreatmentAndBasicSituation": clean(daily.get("basicSituation"), 9000),
        "structuredOrderBaseline": compact_orders,
        "recentOrderAdjustments": clean("\n".join(filter(None, [
            str(daily.get("orderAdjustmentAuto") or ""),
            str(daily.get("orderAdjustmentManual") or ""),
        ])), 9000),
        "admissionAuxiliaryExaminations": clean(record.get("admissionAuxiliary"), 7000),
        "inpatientAuxiliaryExaminations": clean(daily.get("inpatientAuxiliary"), 7000),
        "lisPacsBaselineSummary": clean(daily.get("lisPacsAuto"), 10000),
        "vitalSigns": clean(daily.get("roundVitalsAuto"), 5000),
    }
    return {
        "insuranceData": clinical,
        "reviewDate": date_key,
        "privacyNote": "直接身份信息由服务器剔除；未提供的医保政策不得推测。",
        "outputRequirement": "仅审阅诊断—治疗—检查资料的一致性，不写回任何诊断、医嘱或病历。",
    }


@app.get("/api/mobile/insurance-consistency")
def mobile_insurance_consistency_cache(
    dateKey: str, admissionNo: str,
    user: Dict[str, Any] = Depends(require_user),
):
    date_key = mobile_validate_date_key(dateKey)
    admission_no = str(admissionNo or "").strip()[:64]
    user_id = int(user["user_id"])
    with db_connect() as conn:
        # 缓存查询也必须先核对账号下的患者及指定日期。
        mobile_require_snapshot_patient(conn, user_id, admission_no, date_key)
        row = conn.execute(
            """SELECT result_text, output_format, analyzed_at
               FROM mobile_insurance_consistency_cache
               WHERE user_id = ? AND admission_no = ? AND date_key = ?""",
            (user_id, admission_no, date_key),
        ).fetchone()
    cached = ({
        "text": str(row["result_text"]),
        "outputFormat": str(row["output_format"] or "plain"),
        "analyzedAt": int(row["analyzed_at"] or 0),
    } if row else None)
    return JSONResponse(
        content={"ok": True, "admissionNo": admission_no, "dateKey": date_key, "result": cached},
        headers=mobile_no_store_headers(),
    )


@app.post("/api/mobile/insurance-consistency/cancel")
def mobile_insurance_consistency_cancel(
    body: MobileInsuranceCancelRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", body.runId):
        raise HTTPException(status_code=400, detail="无效的校验任务标识")
    with db_connect() as conn:
        conn.execute(
            "DELETE FROM mobile_insurance_cancelled_runs WHERE cancelled_at < ?",
            (now_ts() - 86400,),
        )
        conn.execute(
            "INSERT OR REPLACE INTO mobile_insurance_cancelled_runs(user_id, run_id, cancelled_at) VALUES(?, ?, ?)",
            (int(user["user_id"]), body.runId, now_ts()),
        )
        conn.commit()
    return JSONResponse(content={"ok": True}, headers=mobile_no_store_headers())


@app.post("/api/mobile/insurance-consistency")
def mobile_insurance_consistency_run(
    body: MobileInsuranceConsistencyRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", body.runId):
        raise HTTPException(status_code=400, detail="无效的校验任务标识")
    user_id = int(user["user_id"])
    admission_no = str(body.admissionNo or "").strip()[:64]
    date_key = mobile_validate_date_key(body.dateKey)
    with db_connect() as conn:
        _, record, daily = mobile_require_snapshot_patient(
            conn, user_id, admission_no, date_key,
        )
        provider = mobile_ai_selected_provider(conn, user_id, "text")
        output_format = mobile_requested_review_format(conn, user_id, body.outputFormat)
    if daily is None:
        raise HTTPException(status_code=400, detail="未找到患者当日查房数据")
    payload = mobile_insurance_consistency_payload(record, daily, date_key)
    result_text = mobile_request_treatment_analysis(
        payload, provider, mobile_review_prompt("insurance", output_format), "医保一致性校验",
    )
    analyzed_at = now_ts()
    with db_connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        cancelled = conn.execute(
            "SELECT 1 FROM mobile_insurance_cancelled_runs WHERE user_id = ? AND run_id = ?",
            (user_id, body.runId),
        ).fetchone()
        if cancelled:
            conn.execute(
                "DELETE FROM mobile_insurance_cancelled_runs WHERE user_id = ? AND run_id = ?",
                (user_id, body.runId),
            )
            conn.commit()
            raise HTTPException(status_code=409, detail="医保一致性校验已中止，原有缓存保持不变")
        conn.execute(
            """INSERT INTO mobile_insurance_consistency_cache(
                   user_id, admission_no, date_key, result_text, output_format, analyzed_at
               ) VALUES(?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, admission_no, date_key) DO UPDATE SET
                   result_text = excluded.result_text,
                   output_format = excluded.output_format,
                   analyzed_at = excluded.analyzed_at""",
            (user_id, admission_no, date_key, result_text, output_format, analyzed_at),
        )
        conn.execute(
            """DELETE FROM mobile_insurance_consistency_cache WHERE rowid IN (
                   SELECT rowid FROM mobile_insurance_consistency_cache
                   WHERE user_id = ? ORDER BY analyzed_at DESC, rowid DESC
                   LIMIT -1 OFFSET ?
               )""",
            (user_id, MOBILE_TREATMENT_ANALYSIS_MAX_CACHE_ENTRIES),
        )
        conn.commit()
    return JSONResponse(
        content={"ok": True, "result": {
            "admissionNo": admission_no, "dateKey": date_key, "text": result_text,
            "outputFormat": output_format, "analyzedAt": analyzed_at,
        }},
        headers=mobile_no_store_headers(),
    )


def mobile_icd_diagnosis_prediction_payload(
    record: Dict[str, Any], daily: Dict[str, Any], date_key: str,
) -> Dict[str, Any]:
    clean = lambda value, maximum=8000: mobile_clinical_text(value, record, maximum)
    visual = daily.get("basicSituationVisual")
    source = visual.get("records") if isinstance(visual, dict) else []
    rows = [row for row in source if isinstance(row, dict)] if isinstance(source, list) else []
    # 只读取已同步数据，不读取页面隐藏状态。超量时保留最近开立的医嘱并明示边界。
    rows.sort(key=lambda row: str(row.get("startTime") or ""), reverse=True)
    orders: List[Dict[str, Any]] = []
    used_chars = 0
    for row in rows[:1600]:
        item = {
            key: clean(row.get(key), 1200)[:1200]
            for key in (
                "orderCategory", "orderType", "startTime", "name", "dose", "spec",
                "route", "frequency", "groupNo", "stopTime", "lastExecutionTime", "status",
            )
            if row.get(key) not in (None, "") and not isinstance(row.get(key), (dict, list))
        }
        if not item.get("name"):
            continue
        item["_pendingReview"] = row.get("_pendingReview") is True or bool(
            re.search(r"待审核|未审核", str(row.get("status") or ""))
        )
        size = len(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
        if used_chars + size > 32000:
            break
        used_chars += size
        orders.append(item)
    orders.reverse()
    order_baseline = {
        "records": orders,
        "syncedRecordCount": len(rows),
        "includedRecordCount": len(orders),
        "truncated": len(orders) < len(rows),
        "range": clean(visual.get("range"), 1000) if isinstance(visual, dict) else "",
        "scope": "掌上已同步医嘱，按原状态提供；不应用可视化隐藏选项。超出输入限额时仅纳入最近开立记录。",
    }
    clinical = {
        "analysisDate": date_key,
        "sex": clean(record.get("sex"), 1000),
        "age": clean(record.get("age"), 1000),
        "hospitalDay": mobile_hospital_day(record.get("admissionDate"), date_key),
        "existingDiagnoses": clean(record.get("diagnosis"), 7000),
        "currentTreatmentAndBasicSituation": clean(daily.get("basicSituation"), 9000),
        "structuredOrderBaseline": order_baseline,
        "recentOrderAdjustments": clean("\n".join(
            str(daily.get(key) or "") for key in ("orderAdjustmentAuto", "orderAdjustmentManual")
        ), 10000),
        "admissionAuxiliaryExaminations": clean(record.get("admissionAuxiliary"), 8000),
        "inpatientAuxiliaryExaminations": clean(daily.get("inpatientAuxiliary"), 8000),
        "lisPacsBaselineSummary": clean(daily.get("lisPacsAuto"), 14000),
        "vitalSigns": clean(daily.get("roundVitalsAuto"), 6000),
        "wardRoundNotes": clean(daily.get("roundNote"), 8000),
    }
    if not orders and not any(clinical[key] for key in (
        "existingDiagnoses", "currentTreatmentAndBasicSituation", "recentOrderAdjustments",
        "admissionAuxiliaryExaminations", "inpatientAuxiliaryExaminations",
        "lisPacsBaselineSummary", "vitalSigns", "wardRoundNotes",
    )):
        raise HTTPException(status_code=400, detail="缺少可供预测的诊断、病情、医嘱、辅助检查、三测或查房资料")
    return {
        "clinicalData": clinical,
        "privacyNote": "直接身份信息由服务器剔除；不发送个人信息栏目或DRG费用。",
        "codingContext": "未提供本院ICD-10字典，编码均为候选，须由医师及编码人员复核。",
        "outputRequirement": "只根据现有资料提供诊断与编码候选，不写回诊断、病历、查房备注或医嘱。",
    }


@app.get("/api/mobile/icd-diagnosis-prediction")
def mobile_icd_diagnosis_prediction_cache(
    dateKey: str, admissionNo: str,
    user: Dict[str, Any] = Depends(require_user),
):
    date_key = mobile_validate_date_key(dateKey)
    admission_no = str(admissionNo or "").strip()[:64]
    user_id = int(user["user_id"])
    with db_connect() as conn:
        # 缓存查询也必须先核对账号下的患者及指定日期。
        mobile_require_snapshot_patient(conn, user_id, admission_no, date_key)
        row = conn.execute(
            """SELECT result_text, output_format, analyzed_at
               FROM mobile_icd_diagnosis_prediction_cache
               WHERE user_id = ? AND admission_no = ? AND date_key = ?""",
            (user_id, admission_no, date_key),
        ).fetchone()
    cached = ({
        "text": str(row["result_text"]),
        "outputFormat": str(row["output_format"] or "plain"),
        "analyzedAt": int(row["analyzed_at"] or 0),
    } if row else None)
    return JSONResponse(
        content={"ok": True, "admissionNo": admission_no, "dateKey": date_key, "result": cached},
        headers=mobile_no_store_headers(),
    )


@app.post("/api/mobile/icd-diagnosis-prediction/cancel")
def mobile_icd_diagnosis_prediction_cancel(
    body: MobileIcdPredictionCancelRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", body.runId):
        raise HTTPException(status_code=400, detail="无效的预测任务标识")
    with db_connect() as conn:
        conn.execute(
            "DELETE FROM mobile_icd_prediction_cancelled_runs WHERE cancelled_at < ?",
            (now_ts() - 86400,),
        )
        conn.execute(
            "INSERT OR REPLACE INTO mobile_icd_prediction_cancelled_runs(user_id, run_id, cancelled_at) VALUES(?, ?, ?)",
            (int(user["user_id"]), body.runId, now_ts()),
        )
        conn.commit()
    return JSONResponse(content={"ok": True}, headers=mobile_no_store_headers())


@app.post("/api/mobile/icd-diagnosis-prediction")
def mobile_icd_diagnosis_prediction_run(
    body: MobileIcdDiagnosisPredictionRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", body.runId):
        raise HTTPException(status_code=400, detail="无效的预测任务标识")
    user_id = int(user["user_id"])
    admission_no = str(body.admissionNo or "").strip()[:64]
    date_key = mobile_validate_date_key(body.dateKey)
    with db_connect() as conn:
        _, record, daily = mobile_require_snapshot_patient(
            conn, user_id, admission_no, date_key,
        )
        cancelled = conn.execute(
            "SELECT 1 FROM mobile_icd_prediction_cancelled_runs WHERE user_id = ? AND run_id = ?",
            (user_id, body.runId),
        ).fetchone()
        if cancelled:
            raise HTTPException(status_code=409, detail="ICD-10诊断预测已中止，原有缓存保持不变")
        provider = mobile_ai_selected_provider(conn, user_id, "text")
        output_format = mobile_requested_review_format(conn, user_id, body.outputFormat)
    if daily is None:
        raise HTTPException(status_code=400, detail="未找到患者当日查房数据")
    payload = mobile_icd_diagnosis_prediction_payload(record, daily, date_key)
    result_text = mobile_request_treatment_analysis(
        payload, provider, mobile_review_prompt("icd-prediction", output_format), "ICD-10诊断预测",
    )
    analyzed_at = now_ts()
    with db_connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        cancelled = conn.execute(
            "SELECT 1 FROM mobile_icd_prediction_cancelled_runs WHERE user_id = ? AND run_id = ?",
            (user_id, body.runId),
        ).fetchone()
        if cancelled:
            raise HTTPException(status_code=409, detail="ICD-10诊断预测已中止，原有缓存保持不变")
        mobile_require_snapshot_patient(conn, user_id, admission_no, date_key)
        conn.execute(
            """INSERT INTO mobile_icd_diagnosis_prediction_cache(
                   user_id, admission_no, date_key, result_text, output_format, analyzed_at
               ) VALUES(?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, admission_no, date_key) DO UPDATE SET
                   result_text = excluded.result_text,
                   output_format = excluded.output_format,
                   analyzed_at = excluded.analyzed_at""",
            (user_id, admission_no, date_key, result_text, output_format, analyzed_at),
        )
        conn.execute(
            """DELETE FROM mobile_icd_diagnosis_prediction_cache WHERE rowid IN (
                   SELECT rowid FROM mobile_icd_diagnosis_prediction_cache
                   WHERE user_id = ? ORDER BY analyzed_at DESC, rowid DESC
                   LIMIT -1 OFFSET ?
               )""",
            (user_id, MOBILE_TREATMENT_ANALYSIS_MAX_CACHE_ENTRIES),
        )
        conn.commit()
    return JSONResponse(
        content={"ok": True, "result": {
            "admissionNo": admission_no, "dateKey": date_key, "text": result_text,
            "outputFormat": output_format, "analyzedAt": analyzed_at,
        }},
        headers=mobile_no_store_headers(),
    )


@app.get("/api/mobile/attachments")
def mobile_attachment_list(
    admissionNo: str,
    user: Dict[str, Any] = Depends(require_user),
):
    """列出当前账号下指定患者或便签范围的附件。"""
    user_id = int(user["user_id"])
    admission_no = str(admissionNo or "").strip()[:64]
    with db_connect() as conn:
        admission_no = mobile_require_attachment_scope(conn, user_id, admission_no)
        rows = conn.execute(
            """
            SELECT id, admission_no, original_name, mime_type, size_bytes, created_at
            FROM mobile_patient_attachments
            WHERE user_id = ? AND admission_no = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (user_id, admission_no, MOBILE_ATTACHMENT_MAX_PATIENT_FILES),
        ).fetchall()
    items = [mobile_attachment_item(row) for row in rows]
    return JSONResponse(
        content={"ok": True, "admissionNo": admission_no, "items": items, "count": len(items)},
        headers=mobile_no_store_headers(),
    )


@app.post("/api/mobile/attachments")
async def mobile_attachment_upload(
    request: Request,
    admissionNo: str,
    fileName: str = "",
    user: Dict[str, Any] = Depends(require_user),
):
    """
    以原始请求体上传一份患者/便签附件，避免额外引入multipart依赖。
    文件仅允许安全内联预览类型，并同时校验MIME与文件签名。
    """
    user_id = int(user["user_id"])
    admission_no = str(admissionNo or "").strip()[:64]
    original_name = mobile_attachment_safe_name(fileName)
    mime_type = mobile_attachment_mime(request.headers.get("content-type", ""), original_name)
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            if int(declared_length) > MOBILE_ATTACHMENT_MAX_FILE_BYTES:
                raise HTTPException(status_code=413, detail="单个附件超过25MB上限")
        except ValueError:
            pass
    with db_connect() as conn:
        admission_no = mobile_require_attachment_scope(conn, user_id, admission_no)

    attachment_id = secrets.token_hex(16)
    patient_hash = hashlib.sha256(
        f"{user_id}:{admission_no}".encode("utf-8")
    ).hexdigest()[:32]
    relative_dir = Path(str(user_id)) / patient_hash
    target_dir = mobile_attachment_path(str(relative_dir / "placeholder")).parent
    target_dir.mkdir(parents=True, exist_ok=True)
    temp_path = target_dir / (".upload-" + attachment_id + ".tmp")
    extension = MOBILE_ATTACHMENT_MIME_EXTENSIONS[mime_type]
    final_path = target_dir / (attachment_id + extension)
    relative_path = str(final_path.relative_to(MOBILE_ATTACHMENT_ROOT)).replace("\\", "/")
    total = 0
    prefix = bytearray()
    digest = hashlib.sha256()
    try:
        with temp_path.open("wb") as handle:
            async for chunk in request.stream():
                if not chunk:
                    continue
                total += len(chunk)
                if total > MOBILE_ATTACHMENT_MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="单个附件超过25MB上限")
                if len(prefix) < 4096:
                    prefix.extend(chunk[: 4096 - len(prefix)])
                digest.update(chunk)
                handle.write(chunk)
        if total <= 0:
            raise HTTPException(status_code=400, detail="附件内容为空")
        mobile_attachment_validate_signature(mime_type, bytes(prefix))
        sha256_value = digest.hexdigest()
        with db_connect() as conn:
            duplicate = conn.execute(
                """
                SELECT id, admission_no, original_name, stored_path, mime_type, size_bytes, created_at
                FROM mobile_patient_attachments
                WHERE user_id = ? AND admission_no = ? AND sha256 = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_id, admission_no, sha256_value),
            ).fetchone()
            if duplicate:
                duplicate_path = mobile_attachment_path(
                    str(duplicate["stored_path"] or "")
                )
                if duplicate_path.is_file():
                    temp_path.unlink(missing_ok=True)
                    return JSONResponse(
                        content={
                            "ok": True,
                            "duplicate": True,
                            "attachment": mobile_attachment_item(duplicate),
                        },
                        headers=mobile_no_store_headers(),
                    )
                conn.execute(
                    "DELETE FROM mobile_patient_attachments WHERE id = ? AND user_id = ?",
                    (str(duplicate["id"] or ""), user_id),
                )
                conn.commit()
            usage = conn.execute(
                """
                SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS total_bytes
                FROM mobile_patient_attachments
                WHERE user_id = ? AND admission_no = ?
                """,
                (user_id, admission_no),
            ).fetchone()
            if int(usage["file_count"] or 0) >= MOBILE_ATTACHMENT_MAX_PATIENT_FILES:
                raise HTTPException(status_code=413, detail="该患者附件数量已达到100个上限")
            if int(usage["total_bytes"] or 0) + total > MOBILE_ATTACHMENT_MAX_PATIENT_BYTES:
                raise HTTPException(status_code=413, detail="该患者附件总量超过250MB上限")
            os.replace(str(temp_path), str(final_path))
            try:
                created_at = now_ts()
                conn.execute(
                    """
                    INSERT INTO mobile_patient_attachments(
                        id, user_id, admission_no, original_name, stored_path,
                        mime_type, size_bytes, sha256, created_at
                    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        attachment_id,
                        user_id,
                        admission_no,
                        original_name,
                        relative_path,
                        mime_type,
                        total,
                        sha256_value,
                        created_at,
                    ),
                )
                conn.commit()
            except Exception:
                final_path.unlink(missing_ok=True)
                raise
        return JSONResponse(
            content={
                "ok": True,
                "duplicate": False,
                "attachment": {
                    "id": attachment_id,
                    "admissionNo": admission_no,
                    "name": original_name,
                    "mimeType": mime_type,
                    "sizeBytes": total,
                    "uploadedAt": created_at,
                },
            },
            headers=mobile_no_store_headers(),
        )
    finally:
        temp_path.unlink(missing_ok=True)



MOBILE_ATTACHMENT_VISION_MAX_BYTES = 20 * 1024 * 1024
MOBILE_ATTACHMENT_VISION_DEFAULT_PROMPT = (
    "请识别这张医疗附件图片中的文字和表格内容，尽量按原顺序完整转写；"
    "不得补造、改写或推测原图中没有的信息。若局部无法辨认，请标注[无法辨认]。"
)


def _deepseek_vision_headers() -> Dict[str, str]:
    api_key = str(
        CONFIG.get("deepseek_vision_api_key")
        or CONFIG.get("deepseek_api_key")
        or ""
    ).strip()
    if not api_key or api_key.startswith("sk-REPLACE"):
        raise HTTPException(status_code=500, detail="服务器尚未配置 DeepSeek Vision API Key")
    return {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
    }



MOBILE_ATTACHMENT_VISION_SUPPORTED_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


def _mobile_attachment_vision_mime(image_bytes: bytes, declared_mime: str) -> str:
    """Return a DeepSeek Vision compatible MIME from file magic first.

    Old attachments may have a generic/incorrect Content-Type in the database.
    The model must receive a data URL whose MIME matches the real file bytes.
    """
    data = bytes(image_bytes or b"")
    detected = ""
    if data.startswith(b"\xff\xd8\xff"):
        detected = "image/jpeg"
    elif data.startswith(b"\x89PNG\r\n\x1a\n"):
        detected = "image/png"
    elif len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        detected = "image/webp"
    elif data.startswith((b"GIF87a", b"GIF89a")):
        detected = "image/gif"
    elif data.startswith(b"BM"):
        detected = "image/bmp"

    declared = str(declared_mime or "").strip().lower()
    if declared == "image/jpg":
        declared = "image/jpeg"
    actual = detected or declared
    if actual not in MOBILE_ATTACHMENT_VISION_SUPPORTED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=(
                "当前视觉模型只直读 JPG/JPEG、PNG、WebP 图片；"
                "该附件格式为 {}。如为BMP/GIF，请切换轻压缩或强压缩后重新上传再识图。"
            ).format(actual or "未知格式"),
        )
    return actual

def mobile_attachment_vision_request(
    image_bytes: bytes,
    mime_type: str,
    prompt: str,
    provider: Dict[str, Any],
) -> Tuple[str, str, str]:
    model = str(provider.get("visionModel") or "").strip()
    label = str(provider.get("label") or "AI")
    if not model:
        raise HTTPException(status_code=500, detail=label + "视觉模型未配置")
    effective_mime = _mobile_attachment_vision_mime(image_bytes, mime_type)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = "data:" + effective_mime + ";base64," + encoded
    request_json: Dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是医疗附件图像识别助手。严格依据图片本身输出，"
                    "不得虚构；用户提示词用于指定提取格式。"
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url, "detail": "auto"}},
                ],
            },
        ],
        "stream": False,
    }
    if str(provider.get("id") or "") == "openai":
        request_json["max_completion_tokens"] = 7000
    else:
        request_json["max_tokens"] = 7000
    try:
        response = DIRECT_HTTP.post(
            mobile_ai_chat_url(provider),
            headers=mobile_ai_headers(provider),
            json=request_json,
            timeout=180,
            **mobile_ai_request_kwargs(provider),
        )
    except requests.Timeout as exc:
        raise HTTPException(status_code=504, detail=label + "识图超时") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="服务器访问" + label + "视觉模型失败") from exc
    try:
        data: Any = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=label + "视觉模型返回内容不是有效JSON") from exc
    if not 200 <= response.status_code < 300:
        error_value = data.get("error") if isinstance(data, dict) else None
        if isinstance(error_value, dict):
            detail = str(error_value.get("message") or error_value)
        else:
            detail = str(error_value or (label + " Vision HTTP " + str(response.status_code)))
        raise HTTPException(status_code=502, detail=detail[:800])
    try:
        content = str(data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=label + "视觉模型未返回有效识图结果") from exc
    if not content:
        raise HTTPException(status_code=502, detail=label + "识图结果为空")
    return content, model, label


@app.post("/api/mobile/attachments/{attachment_id}/vision")
def mobile_attachment_vision(
    attachment_id: str,
    body: MobileAttachmentVisionRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """按当前账号选择的AI提供商，将图片发送到对应视觉模型。"""
    if not re.fullmatch(r"[0-9a-f]{32}", str(attachment_id or "")):
        raise HTTPException(status_code=404, detail="附件不存在")
    with db_connect() as conn:
        row = conn.execute(
            """
            SELECT original_name, stored_path, mime_type, size_bytes
            FROM mobile_patient_attachments
            WHERE id = ? AND user_id = ?
            """,
            (attachment_id, int(user["user_id"])),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="附件不存在")
    mime_type = str(row["mime_type"] or "")
    if not mime_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="识图功能仅支持图片附件")
    size_bytes = int(row["size_bytes"] or 0)
    if size_bytes > MOBILE_ATTACHMENT_VISION_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="该图片超过20MB识图上限；可切换轻压缩/强压缩后重新上传再识图",
        )
    path = mobile_attachment_path(str(row["stored_path"] or ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="附件文件已丢失")
    try:
        image_bytes = path.read_bytes()
    except OSError as exc:
        raise HTTPException(status_code=500, detail="读取图片附件失败") from exc
    if not image_bytes:
        raise HTTPException(status_code=400, detail="图片附件为空")
    prompt = str(body.prompt or "").strip() or MOBILE_ATTACHMENT_VISION_DEFAULT_PROMPT
    with db_connect() as conn:
        ai_provider = mobile_ai_selected_provider(conn, int(user["user_id"]), "vision")
    content, model, provider_label = mobile_attachment_vision_request(
        image_bytes, mime_type, prompt, ai_provider
    )
    return JSONResponse(
        content={
            "ok": True,
            "attachmentId": attachment_id,
            "fileName": str(row["original_name"] or "患者图片"),
            "provider": ai_provider.get("id", ""),
            "providerLabel": provider_label,
            "model": model,
            "text": content,
        },
        headers=mobile_no_store_headers(),
    )


@app.get("/api/mobile/attachments/{attachment_id}/content")
def mobile_attachment_content(
    attachment_id: str,
    user: Dict[str, Any] = Depends(require_user),
):
    """带登录鉴权返回附件原始内容，供移动端fetch后安全预览。"""
    if not re.fullmatch(r"[0-9a-f]{32}", str(attachment_id or "")):
        raise HTTPException(status_code=404, detail="附件不存在")
    with db_connect() as conn:
        row = conn.execute(
            """
            SELECT original_name, stored_path, mime_type
            FROM mobile_patient_attachments
            WHERE id = ? AND user_id = ?
            """,
            (attachment_id, int(user["user_id"])),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="附件不存在")
    path = mobile_attachment_path(str(row["stored_path"] or ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="附件文件已丢失")
    original_name = str(row["original_name"] or "患者附件")
    headers = mobile_no_store_headers()
    headers.update(
        {
            "Content-Disposition": "inline; filename*=UTF-8''" + quote(original_name, safe=""),
            "X-Content-Type-Options": "nosniff",
        }
    )
    return FileResponse(
        str(path),
        media_type=str(row["mime_type"] or "application/octet-stream"),
        headers=headers,
    )


@app.patch("/api/mobile/attachments/{attachment_id}")
def mobile_attachment_rename(
    attachment_id: str,
    body: MobileAttachmentRenameRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """仅修改当前账号附件的展示名，不移动或改写文件本体。"""
    if not re.fullmatch(r"[0-9a-f]{32}", str(attachment_id or "")):
        raise HTTPException(status_code=404, detail="附件不存在")
    user_id = int(user["user_id"])
    with db_connect() as conn:
        row = conn.execute(
            """
            SELECT id, admission_no, original_name, mime_type, size_bytes, created_at
            FROM mobile_patient_attachments
            WHERE id = ? AND user_id = ?
            """,
            (attachment_id, user_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="附件不存在")
        renamed = mobile_attachment_renamed_name(
            body.fileName,
            str(row["mime_type"] or ""),
            str(row["original_name"] or ""),
        )
        conn.execute(
            """
            UPDATE mobile_patient_attachments
            SET original_name = ?
            WHERE id = ? AND user_id = ?
            """,
            (renamed, attachment_id, user_id),
        )
        conn.commit()
        updated = dict(row)
        updated["original_name"] = renamed
    return JSONResponse(
        content={"ok": True, "attachment": mobile_attachment_item(updated)},
        headers=mobile_no_store_headers(),
    )


@app.delete("/api/mobile/attachments/{attachment_id}")
def mobile_attachment_delete(
    attachment_id: str,
    user: Dict[str, Any] = Depends(require_user),
):
    """删除当前账号拥有的一份患者附件。"""
    if not re.fullmatch(r"[0-9a-f]{32}", str(attachment_id or "")):
        raise HTTPException(status_code=404, detail="附件不存在")
    with db_connect() as conn:
        row = conn.execute(
            """
            SELECT stored_path
            FROM mobile_patient_attachments
            WHERE id = ? AND user_id = ?
            """,
            (attachment_id, int(user["user_id"])),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="附件不存在")
        path = mobile_attachment_path(str(row["stored_path"] or ""))
        path.unlink(missing_ok=True)
        conn.execute(
            "DELETE FROM mobile_patient_attachments WHERE id = ? AND user_id = ?",
            (attachment_id, int(user["user_id"])),
        )
        conn.commit()
    return JSONResponse(
        content={"ok": True, "id": attachment_id},
        headers=mobile_no_store_headers(),
    )


@app.put("/api/mobile/round-book/note")
def mobile_round_book_note(
    body: MobileRoundBookNoteRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """保存掌上OHA独立查房备注。v0.3起以病案号/住院号作为索引。"""
    user_id = int(user["user_id"])
    current = now_ts()
    note = str(body.note or "")[:20000]
    with db_connect() as conn:
        admission_no = mobile_resolve_admission_no(
            conn,
            user_id,
            body.admissionNo,
            body.recordKey,
        )
        if not admission_no:
            raise HTTPException(status_code=400, detail="病案号为空，无法保存掌上查房备注")
        conn.execute(
            """
            INSERT INTO mobile_round_book_note_dictionary(
                user_id, admission_no, note, updated_at
            ) VALUES(?, ?, ?, ?)
            ON CONFLICT(user_id, admission_no) DO UPDATE SET
                note = excluded.note,
                updated_at = excluded.updated_at
            """,
            (user_id, admission_no, note, current),
        )

        # 兼容尚未刷新的v0.2页面：若旧字段齐全，同时维持旧表一份。
        record_key = str(body.recordKey or "").strip()
        date_key = str(body.dateKey or "").strip()
        if record_key and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_key):
            conn.execute(
                """
                INSERT INTO mobile_round_book_notes(
                    user_id, record_key, date_key, note, updated_at
                ) VALUES(?, ?, ?, ?, ?)
                ON CONFLICT(user_id, record_key, date_key) DO UPDATE SET
                    note = excluded.note,
                    updated_at = excluded.updated_at
                """,
                (user_id, record_key[:256], date_key, note, current),
            )
        conn.commit()
    return {
        "ok": True,
        "admissionNo": admission_no,
        "note": note,
        "updatedAt": current,
    }


@app.put("/api/mobile/round-book/notes")
def mobile_round_book_notes_batch(
    body: MobileRoundBookNotesBatchRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """批量保存当前分组查房备注字典，减少手机端逐患者请求。"""
    user_id = int(user["user_id"])
    values = body.notes if isinstance(body.notes, dict) else {}
    if len(values) > 500:
        raise HTTPException(status_code=400, detail="单次最多保存500位患者备注")
    current = now_ts()
    saved: Dict[str, Dict[str, Any]] = {}
    with db_connect() as conn:
        for raw_admission_no, raw_note in values.items():
            admission_no = str(raw_admission_no or "").strip()[:64]
            if not admission_no:
                continue
            note = str(raw_note or "")[:20000]
            conn.execute(
                """
                INSERT INTO mobile_round_book_note_dictionary(
                    user_id, admission_no, note, updated_at
                ) VALUES(?, ?, ?, ?)
                ON CONFLICT(user_id, admission_no) DO UPDATE SET
                    note = excluded.note,
                    updated_at = excluded.updated_at
                """,
                (user_id, admission_no, note, current),
            )
            saved[admission_no] = {"note": note, "updatedAt": current}
        conn.commit()
    return {"ok": True, "saved": saved, "count": len(saved), "updatedAt": current}


@app.put("/api/mobile/round-book/note-push")
def mobile_round_book_note_push(
    body: MobileRoundBookNotePushRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """
    将当前独立备注字典的选定患者版本标记为“已推送到云端”。
    不修改桌面查房本快照；手机端显示时把桌面只读查房内容与该推送版本并列汇总。
    """
    date_key = str(body.dateKey or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_key):
        raise HTTPException(status_code=400, detail="日期格式应为YYYY-MM-DD")
    admission_nos: List[str] = []
    for value in body.admissionNos or []:
        admission_no = str(value or "").strip()[:64]
        if admission_no and admission_no not in admission_nos:
            admission_nos.append(admission_no)
    if len(admission_nos) > 500:
        raise HTTPException(status_code=400, detail="单次最多推送500位患者备注")

    user_id = int(user["user_id"])
    current = now_ts()
    result: Dict[str, Dict[str, Any]] = {}
    with db_connect() as conn:
        dictionary = mobile_read_note_dictionary(conn, user_id)
        for admission_no in admission_nos:
            note = str((dictionary.get(admission_no) or {}).get("note") or "")
            if note:
                conn.execute(
                    """
                    INSERT INTO mobile_round_book_note_pushes(
                        user_id, admission_no, date_key, note, updated_at
                    ) VALUES(?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, admission_no, date_key) DO UPDATE SET
                        note = excluded.note,
                        updated_at = excluded.updated_at
                    """,
                    (user_id, admission_no, date_key, note, current),
                )
                result[admission_no] = {"note": note, "updatedAt": current}
            else:
                conn.execute(
                    """
                    DELETE FROM mobile_round_book_note_pushes
                    WHERE user_id = ? AND admission_no = ? AND date_key = ?
                    """,
                    (user_id, admission_no, date_key),
                )
                result[admission_no] = {"note": "", "updatedAt": current}
        conn.commit()
    return {
        "ok": True,
        "dateKey": date_key,
        "pushed": result,
        "count": len(result),
        "updatedAt": current,
    }


@app.get("/api/mobile/round-book/note-pushes")
def mobile_round_book_note_pushes(
    user: Dict[str, Any] = Depends(require_user),
):
    """
    供桌面查房本“推送管理”读取掌上OHA已经明确推送的备注。
    只返回推送记录，不返回整份患者快照，避免桌面为了拉取备注重复下载大快照。
    """
    user_id = int(user["user_id"])
    items: List[Dict[str, Any]] = []
    with db_connect() as conn:
        rows = conn.execute(
            """
            SELECT admission_no, date_key, note, updated_at
            FROM mobile_round_book_note_pushes
            WHERE user_id = ?
            ORDER BY updated_at DESC, date_key DESC, admission_no ASC
            LIMIT 5000
            """,
            (user_id,),
        ).fetchall()
        for row in rows:
            admission_no = str(row["admission_no"] or "").strip()
            date_key = str(row["date_key"] or "").strip()
            note = str(row["note"] or "")
            if not admission_no or not date_key or not note:
                continue
            items.append(
                {
                    "admissionNo": admission_no,
                    "dateKey": date_key,
                    "note": note,
                    "updatedAt": int(row["updated_at"] or 0),
                }
            )
    return JSONResponse(
        content={
            "ok": True,
            "items": items,
            "count": len(items),
        },
        headers=mobile_no_store_headers(),
    )


@app.delete("/api/mobile/round-book/notes")
def mobile_round_book_clear_all_notes(
    user: Dict[str, Any] = Depends(require_user),
):
    """
    清空当前OHA账号的全部掌上查房备注。
    同时清理：
    1. v0.3病案号备注字典；
    2. 已推送到云端的只读版本；
    3. v0.2旧record_key+date_key兼容备注。
    第3项必须一并清理，否则下一次读取时旧备注可能再次迁移回字典。
    桌面上传的查房本快照及其中roundNote不受影响。
    """
    user_id = int(user["user_id"])
    with db_connect() as conn:
        dictionary_count = int(
            conn.execute(
                "SELECT COUNT(*) AS c FROM mobile_round_book_note_dictionary WHERE user_id = ?",
                (user_id,),
            ).fetchone()["c"]
        )
        pushed_count = int(
            conn.execute(
                "SELECT COUNT(*) AS c FROM mobile_round_book_note_pushes WHERE user_id = ?",
                (user_id,),
            ).fetchone()["c"]
        )
        legacy_count = int(
            conn.execute(
                "SELECT COUNT(*) AS c FROM mobile_round_book_notes WHERE user_id = ?",
                (user_id,),
            ).fetchone()["c"]
        )
        conn.execute(
            "DELETE FROM mobile_round_book_note_dictionary WHERE user_id = ?",
            (user_id,),
        )
        conn.execute(
            "DELETE FROM mobile_round_book_note_pushes WHERE user_id = ?",
            (user_id,),
        )
        conn.execute(
            "DELETE FROM mobile_round_book_notes WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()
    current = now_ts()
    return {
        "ok": True,
        "cleared": {
            "dictionary": dictionary_count,
            "pushed": pushed_count,
            "legacy": legacy_count,
        },
        "updatedAt": current,
    }


def mobile_account_note_payload(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["note_id"] or ""),
        "title": str(row["title"] or ""),
        "content": str(row["content"] or ""),
        "revision": int(row["revision"] or 1),
        "createdAt": int(row["created_at"] or 0),
        "updatedAt": int(row["updated_at"] or 0),
    }


def mobile_account_note_conflict(row: sqlite3.Row) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "ok": False,
            "conflict": True,
            "detail": "该便签已在同账号的其他设备或页面更新，请先处理版本冲突",
            "current": mobile_account_note_payload(row),
        },
        headers=mobile_no_store_headers(),
    )


@app.get("/api/mobile/notes")
def mobile_account_notes_list(
    user: Dict[str, Any] = Depends(require_user),
):
    """读取当前OHA账号全部便签；不同账号完全隔离。"""
    user_id = int(user["user_id"])
    with db_connect() as conn:
        rows = conn.execute(
            """
            SELECT note_id, title, content, revision, created_at, updated_at
            FROM mobile_account_notes
            WHERE user_id = ?
            ORDER BY updated_at DESC, note_id ASC
            LIMIT 200
            """,
            (user_id,),
        ).fetchall()
    return JSONResponse(
        content={
            "ok": True,
            "items": [mobile_account_note_payload(row) for row in rows],
            "count": len(rows),
        },
        headers=mobile_no_store_headers(),
    )


@app.post("/api/mobile/notes")
def mobile_account_note_create(
    body: MobileAccountNoteCreateRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """新建账号级便签。便签正文只保存在当前账号对应的服务端数据库中。"""
    user_id = int(user["user_id"])
    title = str(body.title or "").strip()[:120]
    content = str(body.content or "")[:50000]
    if not title and not content.strip():
        raise HTTPException(status_code=400, detail="便签标题和正文不能同时为空")
    current = now_ts()
    with db_connect() as conn:
        count_row = conn.execute(
            "SELECT COUNT(*) AS c FROM mobile_account_notes WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if int(count_row["c"] if count_row else 0) >= 200:
            raise HTTPException(status_code=400, detail="当前账号最多保存200条便签")

        note_id = ""
        for _ in range(5):
            candidate = secrets.token_hex(12)
            exists = conn.execute(
                "SELECT 1 FROM mobile_account_notes WHERE user_id = ? AND note_id = ?",
                (user_id, candidate),
            ).fetchone()
            if not exists:
                note_id = candidate
                break
        if not note_id:
            raise HTTPException(status_code=500, detail="生成便签ID失败")

        conn.execute(
            """
            INSERT INTO mobile_account_notes(
                user_id, note_id, title, content, revision, created_at, updated_at
            ) VALUES(?, ?, ?, ?, 1, ?, ?)
            """,
            (user_id, note_id, title, content, current, current),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT note_id, title, content, revision, created_at, updated_at
            FROM mobile_account_notes
            WHERE user_id = ? AND note_id = ?
            """,
            (user_id, note_id),
        ).fetchone()
    return JSONResponse(
        content={"ok": True, "item": mobile_account_note_payload(row)},
        headers=mobile_no_store_headers(),
    )


@app.put("/api/mobile/notes/{note_id}")
def mobile_account_note_update(
    note_id: str,
    body: MobileAccountNoteUpdateRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """
    更新账号级便签。必须携带客户端最后读取到的revision；若其他设备已经保存，
    返回409和云端当前版本，绝不静默覆盖。
    """
    user_id = int(user["user_id"])
    target = str(note_id or "").strip()[:64]
    if not re.fullmatch(r"[0-9a-f]{24}", target):
        raise HTTPException(status_code=400, detail="便签ID无效")
    title = str(body.title or "").strip()[:120]
    content = str(body.content or "")[:50000]
    if not title and not content.strip():
        raise HTTPException(status_code=400, detail="便签标题和正文不能同时为空")
    expected = int(body.expectedRevision)
    current = now_ts()

    with db_connect() as conn:
        # 直接以revision作为UPDATE条件，避免“先读后写”在多设备并发时形成竞态。
        # SQLite会串行化写事务：只有仍持有expected revision的请求能够成功更新。
        cursor = conn.execute(
            """
            UPDATE mobile_account_notes
            SET title = ?, content = ?, revision = revision + 1, updated_at = ?
            WHERE user_id = ? AND note_id = ? AND revision = ?
            """,
            (title, content, current, user_id, target, expected),
        )
        if cursor.rowcount != 1:
            latest = conn.execute(
                """
                SELECT note_id, title, content, revision, created_at, updated_at
                FROM mobile_account_notes
                WHERE user_id = ? AND note_id = ?
                """,
                (user_id, target),
            ).fetchone()
            if not latest:
                raise HTTPException(status_code=404, detail="便签不存在或已在其他设备删除")
            return mobile_account_note_conflict(latest)
        conn.commit()
        saved = conn.execute(
            """
            SELECT note_id, title, content, revision, created_at, updated_at
            FROM mobile_account_notes
            WHERE user_id = ? AND note_id = ?
            """,
            (user_id, target),
        ).fetchone()

    return JSONResponse(
        content={"ok": True, "item": mobile_account_note_payload(saved)},
        headers=mobile_no_store_headers(),
    )


@app.delete("/api/mobile/notes/{note_id}")
def mobile_account_note_delete(
    note_id: str,
    body: MobileAccountNoteDeleteRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """删除便签同样校验revision，避免旧页面误删另一设备刚更新的内容。"""
    user_id = int(user["user_id"])
    target = str(note_id or "").strip()[:64]
    if not re.fullmatch(r"[0-9a-f]{24}", target):
        raise HTTPException(status_code=400, detail="便签ID无效")
    expected = int(body.expectedRevision)
    attachment_paths: List[Path] = []
    attachment_scope = MOBILE_STICKY_NOTE_ATTACHMENT_PREFIX + target
    with db_connect() as conn:
        # 删除也必须命中客户端最后读取的revision，防止旧页面误删新版本。
        cursor = conn.execute(
            "DELETE FROM mobile_account_notes WHERE user_id = ? AND note_id = ? AND revision = ?",
            (user_id, target, expected),
        )
        if cursor.rowcount != 1:
            latest = conn.execute(
                """
                SELECT note_id, title, content, revision, created_at, updated_at
                FROM mobile_account_notes
                WHERE user_id = ? AND note_id = ?
                """,
                (user_id, target),
            ).fetchone()
            if latest:
                return mobile_account_note_conflict(latest)
            raise HTTPException(status_code=404, detail="便签不存在或已在其他设备删除")
        attachment_rows = conn.execute(
            """
            SELECT stored_path
            FROM mobile_patient_attachments
            WHERE user_id = ? AND admission_no = ?
            """,
            (user_id, attachment_scope),
        ).fetchall()
        attachment_paths = [
            mobile_attachment_path(str(row["stored_path"] or "")) for row in attachment_rows
        ]
        conn.execute(
            "DELETE FROM mobile_patient_attachments WHERE user_id = ? AND admission_no = ?",
            (user_id, attachment_scope),
        )
        conn.commit()
    for path in attachment_paths:
        path.unlink(missing_ok=True)
    return JSONResponse(
        content={
            "ok": True,
            "id": target,
            "deletedAt": now_ts(),
            "deletedAttachmentCount": len(attachment_paths),
        },
        headers=mobile_no_store_headers(),
    )


@app.get("/api/ping")
def ping():
    return {
        "ok": True,
        "name": "OpenHisAssistant Server",
        "version": "0.4.16.15",
        "time": now_ts(),
    }


@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    page = BASE_DIR / "admin_users.html"
    if not page.exists():
        raise HTTPException(status_code=404, detail="管理员页面文件不存在")
    return HTMLResponse(page.read_text(encoding="utf-8"))


@app.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request):
    username = body.username.strip()
    if not username or not body.password:
        raise HTTPException(status_code=400, detail="用户名或密码为空")

    with db_connect() as conn:
        client_settings = get_client_settings(conn)
        if is_public_auth_host(request, client_settings) and not client_settings.get("publicAuthEnabled"):
            raise HTTPException(status_code=403, detail="服务器已关闭 FRP 公网登录验证")

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


@app.post("/api/auth/change-password")
def change_password(
    body: ChangePasswordRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    with db_connect() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE id = ?",
            (user["user_id"],),
        ).fetchone()
        if not row or not password_verify(body.oldPassword, row["password_hash"]):
            raise HTTPException(status_code=400, detail="当前密码错误")

        current = now_ts()
        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (password_encode(body.newPassword), current, user["user_id"]),
        )
        # 修改密码后保留当前会话，撤销同账号其他设备会话。
        conn.execute(
            "DELETE FROM sessions WHERE user_id = ? AND id <> ?",
            (user["user_id"], user["session_id"]),
        )
        conn.commit()

    return {"ok": True}


@app.get("/api/client/bootstrap-settings")
def client_bootstrap_settings(request: Request):
    with db_connect() as conn:
        settings = get_client_settings(conn)

    # v0.4.11：FRP 公网域名上的“登录前 bootstrap”也受
    # “允许公网域名登录验证”总开关控制。该接口只返回非敏感显示信息，
    # 用于院外环境在尚未登录时决定是否显示 VPN/代理按钮。
    if is_public_auth_host(request, settings) and not settings.get("publicAuthEnabled"):
        raise HTTPException(status_code=403, detail="服务器已关闭 FRP 公网登录及 VPN 预登录支持")
    vpn_configured = vpn_configuration_complete(settings)
    vpn_enabled = bool(settings["vpnGlobalEnabled"] and vpn_configured)
    cert_info = sstp_certificate_info()
    return {
        "ok": True,
        "serverEndpointDisplay": settings["serverEndpointDisplay"],
        "deepSeekProxyDisplay": settings["deepSeekProxyDisplay"],
        "networkStatusVisible": settings["networkStatusVisible"],
        "ohaUiPanelEnabled": settings["ohaUiPanelEnabled"],
        "deepSeekNavigationRestricted": settings["deepSeekNavigationRestricted"],
        "deepSeekExternalNavigationAction": settings["deepSeekExternalNavigationAction"],
        "deepSeekAllowedHosts": settings["deepSeekAllowedHosts"],
        "publicAuthEnabled": settings["publicAuthEnabled"],
        "publicAuthUrl": settings["publicAuthUrl"],
        "publicAuthAllowInvalidTls": bool(settings.get("publicAuthAllowInvalidTls", False)),
        "vpnAccessMode": settings["vpnAccessMode"],
        # 设置按钮仍是单用户功能；远程接入从 v0.4.9 起改为全局功能。
        "settingsButtonVisible": False,
        "settingsAccessEnabled": False,
        # bootstrap 阶段只表示“全局已开启且配置完整”，用于登录前显示按钮；
        # 此处绝不代表当前用户已经获授权。
        "vpnEnabled": vpn_enabled,
        "vpnConfigured": vpn_configured,
        "vpnGlobalAvailable": vpn_enabled,
        "vpnUserAuthorized": False,
        # bootstrap 只下发显示/状态所需的非敏感信息。
        # SSTP 用户名、密码、HTTP Proxy 地址和路由列表仍必须登录后取得。
        "vpnEntryName": settings["vpnEntryName"] if vpn_enabled else "",
        "vpnServerAddress": "",
        "vpnUsername": "",
        "vpnPassword": "",
        "vpnKeepLocalProfile": bool(settings["vpnKeepLocalProfile"]),
        "vpnCertificateConfigured": bool(
            vpn_enabled
            and settings["vpnAccessMode"] == "sstp"
            and cert_info.get("vpnCertificateConfigured")
        ),
        "vpnCertificateFileName": cert_info.get("vpnCertificateFileName", "") if vpn_enabled else "",
        "vpnCertificateSha256": cert_info.get("vpnCertificateSha256", "") if vpn_enabled else "",
        "vpnCertificateSize": cert_info.get("vpnCertificateSize", 0) if vpn_enabled else 0,
        "httpProxyUrl": "",
        "vpnRoutingMode": "split",
        "vpnRoutes": [],
    }


@app.get("/api/client/settings")
def client_settings(
    request: Request,
    user: Dict[str, Any] = Depends(require_user),
):
    with db_connect() as conn:
        raw_settings = get_client_settings(conn)
        if is_public_auth_host(request, raw_settings) and not raw_settings.get("publicAuthEnabled"):
            raise HTTPException(
                status_code=403,
                detail="服务器已关闭 FRP 公网登录及 VPN 预登录支持",
            )
        settings = effective_client_settings(conn, int(user["user_id"]))
    return {"ok": True, **settings}


@app.get("/api/client/vpn-settings")
def client_vpn_settings(
    request: Request,
    user: Dict[str, Any] = Depends(require_user),
):
    with db_connect() as conn:
        raw_settings = get_client_settings(conn)
        require_public_vpn_request(request, raw_settings)
        settings = effective_client_settings(conn, int(user["user_id"]))

    # 这是 VPN 专用配置接口；真正参数仅在该用户已获授权时由
    # effective_client_settings 下发。无权限用户仍返回 vpnUserAuthorized=false，
    # 便于客户端在身份验证成功后给出明确“无权限”提示。
    return {"ok": True, **settings}



@app.get("/api/admin/ai-providers")
def admin_get_ai_providers(admin: Dict[str, Any] = Depends(require_admin)):
    with db_connect() as conn:
        providers = mobile_ai_provider_settings(conn, include_key=False)
    return {"ok": True, "providers": providers}


@app.put("/api/admin/ai-providers")
def admin_update_ai_providers(
    body: AdminAiProvidersRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    raw = body.providers if isinstance(body.providers, dict) else {}
    with db_connect() as conn:
        existing = mobile_ai_provider_settings(conn, include_key=True)
        saved: Dict[str, Dict[str, Any]] = {}
        for provider_id in MOBILE_AI_PROVIDER_IDS:
            source = raw.get(provider_id) if isinstance(raw.get(provider_id), dict) else {}
            current = existing[provider_id]
            enabled = bool(source.get("enabled", current.get("enabled", False)))
            api_base = normalize_mobile_ai_api_base(source.get("apiBase", current.get("apiBase")), provider_id)
            text_model = str(source.get("textModel", current.get("textModel")) or "").strip()[:200]
            vision_model = str(source.get("visionModel", current.get("visionModel")) or "").strip()[:200]
            proxy_enabled = bool(source.get("proxyEnabled", current.get("proxyEnabled", False))) if provider_id == "openai" else False
            proxy_url = normalize_mobile_ai_proxy_url(source.get("proxyUrl", current.get("proxyUrl", ""))) if provider_id == "openai" else ""
            new_key = str(source.get("apiKey") or "").strip()
            clear_key = bool(source.get("clearApiKey", False))
            api_key = "" if clear_key else (new_key or str(current.get("apiKey") or ""))
            if enabled:
                if not api_base:
                    raise HTTPException(status_code=400, detail=MOBILE_AI_PROVIDER_LABELS[provider_id] + " 已启用但API Base为空")
                if not api_key or api_key.startswith("sk-REPLACE"):
                    raise HTTPException(status_code=400, detail=MOBILE_AI_PROVIDER_LABELS[provider_id] + " 已启用但API Key未配置")
                if not text_model:
                    raise HTTPException(status_code=400, detail=MOBILE_AI_PROVIDER_LABELS[provider_id] + " 已启用但文本模型为空")
                if not vision_model:
                    raise HTTPException(status_code=400, detail=MOBILE_AI_PROVIDER_LABELS[provider_id] + " 已启用但视觉模型为空")
                if provider_id == "openai" and proxy_enabled and not proxy_url:
                    raise HTTPException(status_code=400, detail="OpenAI已启用独立代理，但代理地址为空")
            prefix = "mobile.ai." + provider_id + "."
            write_system_setting(conn, prefix + "enabled", enabled)
            write_system_setting(conn, prefix + "apiBase", api_base)
            write_system_setting(conn, prefix + "apiKey", api_key)
            write_system_setting(conn, prefix + "textModel", text_model)
            write_system_setting(conn, prefix + "visionModel", vision_model)
            if provider_id == "openai":
                write_system_setting(conn, prefix + "proxyEnabled", proxy_enabled)
                write_system_setting(conn, prefix + "proxyUrl", proxy_url)
        conn.commit()
        saved = mobile_ai_provider_settings(conn, include_key=False)
    return {"ok": True, "providers": saved}


@app.get("/api/admin/settings")
def admin_get_settings(admin: Dict[str, Any] = Depends(require_admin)):
    with db_connect() as conn:
        settings = get_client_settings(conn)
    password_configured = bool(settings.pop("vpnPassword", ""))
    return {
        "ok": True,
        **settings,
        "vpnConfigured": vpn_configuration_complete({**settings, "vpnPassword": "x" if password_configured else ""}),
        "vpnPasswordConfigured": password_configured,
    }


@app.put("/api/admin/settings")
def admin_update_settings(
    body: AdminClientSettingsRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    with db_connect() as conn:
        current_settings = get_client_settings(conn)

        if body.vpnClearPassword:
            vpn_password = ""
        elif body.vpnPassword is not None and body.vpnPassword != "":
            vpn_password = body.vpnPassword
        else:
            # 管理页密码框留空表示保留原密码，避免GET接口泄露明文。
            vpn_password = str(current_settings.get("vpnPassword") or "")

        settings = {
            "serverEndpointDisplay": normalize_display_mode(body.serverEndpointDisplay, "hidden"),
            "deepSeekProxyDisplay": normalize_display_mode(body.deepSeekProxyDisplay, "hidden"),
            "networkStatusVisible": bool(body.networkStatusVisible),
            "ohaUiPanelEnabled": bool(body.ohaUiPanelEnabled),
            "mobileImageCompressionMode": normalize_mobile_image_compression_mode(
                body.mobileImageCompressionMode
            ),
            "deepSeekNavigationRestricted": bool(body.deepSeekNavigationRestricted),
            "deepSeekExternalNavigationAction": normalize_deepseek_navigation_action(body.deepSeekExternalNavigationAction),
            "deepSeekAllowedHosts": normalize_deepseek_allowed_hosts(body.deepSeekAllowedHosts),
            "hisHomeUrl": normalize_client_page_url(body.hisHomeUrl, "HIS主页面", allow_empty=True),
            "deepSeekHomeUrl": normalize_client_page_url(body.deepSeekHomeUrl, "DeepSeek主页面", allow_empty=True),
            "extensionBookmarks": normalize_client_bookmarks(body.extensionBookmarks, "扩展网页书签"),
            "extensionWindowShowDomain": bool(body.extensionWindowShowDomain),
            "deepSeekBookmarks": normalize_client_bookmarks(body.deepSeekBookmarks, "DeepSeek书签"),
            "publicAuthEnabled": bool(body.publicAuthEnabled),
            "publicAuthUrl": normalize_public_auth_url(body.publicAuthUrl),
            "publicAuthAllowInvalidTls": bool(body.publicAuthAllowInvalidTls),
            "vpnGlobalEnabled": bool(body.vpnGlobalEnabled),
            "vpnAccessMode": normalize_vpn_access_mode(body.vpnAccessMode),
            "vpnEntryName": normalize_vpn_entry_name(body.vpnEntryName),
            "vpnServerAddress": normalize_vpn_server_address(body.vpnServerAddress),
            "vpnUsername": str(body.vpnUsername or "").strip(),
            "vpnPassword": vpn_password,
            "vpnKeepLocalProfile": bool(body.vpnKeepLocalProfile),
            "httpProxyUrl": normalize_http_proxy_url(body.httpProxyUrl),
            "vpnRoutingMode": normalize_vpn_routing_mode(body.vpnRoutingMode),
            "vpnRoutes": normalize_vpn_routes(body.vpnRoutes),
        }

        if settings["publicAuthEnabled"] and not settings["publicAuthUrl"]:
            raise HTTPException(status_code=400, detail="启用FRP公网登录验证前请填写公网 HTTPS 地址")

        if settings["vpnGlobalEnabled"]:
            if settings["vpnAccessMode"] == "http-proxy":
                if not settings["httpProxyUrl"]:
                    raise HTTPException(status_code=400, detail="启用WebView2 HTTP代理模式前请填写HTTP代理地址")
            else:
                if not settings["vpnServerAddress"]:
                    raise HTTPException(status_code=400, detail="启用SSTP VPN前请填写VPN服务器")
                if not settings["vpnUsername"]:
                    raise HTTPException(status_code=400, detail="启用SSTP VPN前请填写VPN用户名")
                if not settings["vpnPassword"]:
                    raise HTTPException(status_code=400, detail="启用SSTP VPN前请设置VPN密码")
            if settings["vpnRoutingMode"] == "split" and not settings["vpnRoutes"]:
                raise HTTPException(status_code=400, detail="指定网段模式至少需要填写一个IPv4 CIDR网段")

        set_client_settings(conn, settings)
        conn.execute("DELETE FROM sessions WHERE id <> ?", (admin["session_id"],))
        conn.commit()

    password_configured = bool(settings.get("vpnPassword"))
    safe = dict(settings)
    safe.pop("vpnPassword", None)
    cert_info = sstp_certificate_info()
    return {
        "ok": True,
        **safe,
        **cert_info,
        "vpnConfigured": vpn_configuration_complete(settings),
        "vpnPasswordConfigured": password_configured,
    }



@app.put("/api/admin/settings/sstp-certificate")
async def admin_upload_sstp_certificate(
    request: Request,
    x_oha_filename: Optional[str] = Header(default=None, alias="X-OHA-Filename"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    filename_header = str(x_oha_filename or "sstp-trust.cer")
    try:
        filename_header = unquote(filename_header)
    except Exception:
        pass
    filename = _safe_certificate_filename(filename_header)
    data = await request.body()
    validate_sstp_certificate_upload(filename, data)

    temp_path = VPN_CERT_PATH.with_suffix(".tmp")
    temp_path.write_bytes(data)
    os.replace(str(temp_path), str(VPN_CERT_PATH))

    with db_connect() as conn:
        write_system_setting(conn, "client.vpnCertificateFileName", filename)
        # 证书变更后撤销其它会话，下一次连接强制取得最新证书元数据。
        revoked = conn.execute(
            "DELETE FROM sessions WHERE id <> ?",
            (admin["session_id"],),
        ).rowcount
        conn.commit()
        info = sstp_certificate_info(conn)

    return {"ok": True, **info, "sessionsRevoked": int(revoked or 0)}


@app.delete("/api/admin/settings/sstp-certificate")
def admin_delete_sstp_certificate(
    admin: Dict[str, Any] = Depends(require_admin),
):
    try:
        if VPN_CERT_PATH.exists():
            VPN_CERT_PATH.unlink()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="删除 SSTP 证书失败：" + str(exc))

    with db_connect() as conn:
        write_system_setting(conn, "client.vpnCertificateFileName", "")
        revoked = conn.execute(
            "DELETE FROM sessions WHERE id <> ?",
            (admin["session_id"],),
        ).rowcount
        conn.commit()

    return {
        "ok": True,
        "vpnCertificateConfigured": False,
        "vpnCertificateFileName": "",
        "vpnCertificateSha256": "",
        "vpnCertificateSize": 0,
        "sessionsRevoked": int(revoked or 0),
    }


@app.get("/api/client/sstp-certificate")
def client_get_sstp_certificate(
    request: Request,
    user: Dict[str, Any] = Depends(require_user),
):
    with db_connect() as conn:
        raw_settings = get_client_settings(conn)
        require_public_vpn_request(request, raw_settings)
        settings = effective_client_settings(conn, int(user["user_id"]))

    if not settings.get("vpnEnabled"):
        raise HTTPException(status_code=403, detail="当前账号未获得远程接入权限，或服务器远程接入功能不可用")
    if settings.get("vpnAccessMode") != "sstp":
        raise HTTPException(status_code=400, detail="当前远程接入模式不是 SSTP")
    if not settings.get("vpnCertificateConfigured") or not VPN_CERT_PATH.is_file():
        raise HTTPException(status_code=404, detail="服务器未配置 SSTP 公钥证书")

    data = VPN_CERT_PATH.read_bytes()
    return Response(
        content=data,
        media_type="application/pkix-cert",
        headers={
            "X-OHA-Cert-SHA256": hashlib.sha256(data).hexdigest(),
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/admin/storage")
def admin_storage_report(admin: Dict[str, Any] = Depends(require_admin)):
    return {"ok": True, **mobile_storage_report()}


def mobile_note_backup_entry_path(note_id: str, attachment_id: str, mime_type: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{24}", note_id):
        raise HTTPException(status_code=400, detail="便签备份中的便签 ID 无效")
    if not re.fullmatch(r"[0-9a-f]{32}", attachment_id):
        raise HTTPException(status_code=400, detail="便签备份中的附件 ID 无效")
    extension = MOBILE_ATTACHMENT_MIME_EXTENSIONS.get(mime_type)
    if not extension:
        raise HTTPException(status_code=400, detail="便签备份包含不支持的附件类型")
    return "附件/" + note_id + "/" + attachment_id + extension


@app.get("/api/admin/storage/users/{user_id}/notes/backup")
def admin_storage_backup_notes(
    user_id: int,
    admin: Dict[str, Any] = Depends(require_admin),
):
    if user_id <= 0:
        raise HTTPException(status_code=400, detail="账号 ID 无效")
    with db_connect() as conn:
        target = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="账号不存在")
        notes = conn.execute(
            "SELECT note_id, title, content, revision, created_at, updated_at "
            "FROM mobile_account_notes WHERE user_id = ? ORDER BY created_at, note_id",
            (user_id,),
        ).fetchall()
        attachments = conn.execute(
            "SELECT a.id, a.admission_no, a.original_name, a.stored_path, a.mime_type, "
            "a.size_bytes, a.sha256, a.created_at FROM mobile_patient_attachments a "
            "JOIN mobile_account_notes n ON n.user_id = a.user_id "
            "AND a.admission_no = ? || n.note_id "
            "WHERE a.user_id = ? ORDER BY a.admission_no, a.created_at, a.id",
            (MOBILE_STICKY_NOTE_ATTACHMENT_PREFIX, user_id),
        ).fetchall()

    entries: Dict[str, List[Dict[str, Any]]] = {str(row["note_id"]): [] for row in notes}
    files: List[Tuple[str, str, int, str]] = []
    total_bytes = 0
    for row in attachments:
        note_id = str(row["admission_no"])[len(MOBILE_STICKY_NOTE_ATTACHMENT_PREFIX):]
        entry = mobile_note_backup_entry_path(note_id, str(row["id"]), str(row["mime_type"]))
        size = int(row["size_bytes"])
        checksum = str(row["sha256"])
        if size < 0 or not re.fullmatch(r"[0-9a-f]{64}", checksum):
            raise HTTPException(status_code=409, detail="便签附件记录不完整，无法生成可靠备份")
        total_bytes += size
        if total_bytes > MOBILE_ARCHIVE_MAX_EXPORT_BYTES:
            raise HTTPException(status_code=413, detail="便签附件超过1GB，请先清理或分批备份")
        entries[note_id].append({
            "id": str(row["id"]), "name": str(row["original_name"]),
            "mimeType": str(row["mime_type"]), "sizeBytes": size,
            "sha256": checksum, "createdAt": int(row["created_at"]), "path": entry,
        })
        files.append((entry, str(row["stored_path"]), size, checksum))
    manifest = {
        "kind": "openhisassistant-mobile-notes-backup", "schemaVersion": 1,
        "username": str(target["username"]), "userId": user_id, "exportedAt": now_ts(),
        "notes": [{**mobile_account_note_payload(row), "attachments": entries[str(row["note_id"])]}
                  for row in notes],
    }
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(manifest_bytes) > MOBILE_NOTE_BACKUP_MAX_MANIFEST_BYTES:
        raise HTTPException(status_code=413, detail="便签数据超过备份清单大小限制")

    export_root = MOBILE_ATTACHMENT_ROOT.parent / "mobile_note_backups"
    export_root.mkdir(parents=True, exist_ok=True)
    temporary = tempfile.NamedTemporaryFile(prefix="oha-notes-", suffix=".zip", dir=str(export_root), delete=False)
    temporary_path = Path(temporary.name)
    temporary.close()
    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            archive.writestr("便签数据.json", manifest_bytes)
            user_root = MOBILE_ATTACHMENT_ROOT.resolve() / str(user_id)
            for entry, stored_path, expected_size, expected_hash in files:
                source = mobile_attachment_path(stored_path)
                if user_root not in source.parents or not source.is_file():
                    raise HTTPException(status_code=409, detail="便签附件文件缺失或路径异常，备份已取消")
                actual_size = 0
                digest = hashlib.sha256()
                with source.open("rb") as original, archive.open(entry, "w") as destination:
                    while chunk := original.read(1024 * 1024):
                        actual_size += len(chunk)
                        if actual_size > MOBILE_ATTACHMENT_MAX_FILE_BYTES:
                            raise HTTPException(status_code=413, detail="便签附件超过25MB限制，备份已取消")
                        digest.update(chunk)
                        destination.write(chunk)
                if actual_size != expected_size or digest.hexdigest() != expected_hash:
                    raise HTTPException(status_code=409, detail="便签附件已变化或校验不符，请检查后重新备份")
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    safe_username = re.sub(r"[^0-9A-Za-z._-]+", "_", str(target["username"])).strip("._")[:48] or str(user_id)
    filename = "OHA便签_" + safe_username + "_" + time.strftime("%Y%m%d_%H%M%S") + ".zip"
    return FileResponse(
        str(temporary_path), media_type="application/zip", filename=filename,
        headers=mobile_no_store_headers(),
        background=BackgroundTask(lambda: temporary_path.unlink(missing_ok=True)),
    )


@app.post("/api/admin/storage/users/{user_id}/notes/restore")
async def admin_storage_restore_notes(
    user_id: int,
    request: Request,
    confirm_username: str = Header(..., alias="X-OHA-Confirm-Username"),
    confirm_user_id: int = Header(..., alias="X-OHA-Confirm-User-Id"),
    admin: Dict[str, Any] = Depends(require_admin),
):
    if user_id <= 0 or confirm_user_id != user_id:
        raise HTTPException(status_code=400, detail="请确认便签将还原到的账号 ID")
    with db_connect() as conn:
        target = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        raise HTTPException(status_code=404, detail="目标账号不存在")
    username = str(target["username"])
    if unquote(confirm_username) != username:
        raise HTTPException(status_code=400, detail="确认的用户名与当前账号不一致")

    import_root = MOBILE_ATTACHMENT_ROOT.parent / "mobile_note_imports"
    import_root.mkdir(parents=True, exist_ok=True)
    temporary = tempfile.NamedTemporaryFile(prefix="oha-note-import-", suffix=".zip", dir=str(import_root), delete=False)
    temporary_path = Path(temporary.name)
    temporary.close()
    created_files: List[Path] = []
    committed = False
    try:
        uploaded = 0
        with temporary_path.open("wb") as handle:
            async for chunk in request.stream():
                uploaded += len(chunk)
                if uploaded > MOBILE_NOTE_BACKUP_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="便签备份文件超过导入限制")
                handle.write(chunk)
        if not uploaded:
            raise HTTPException(status_code=400, detail="请选择便签备份 ZIP 文件")
        try:
            archive = zipfile.ZipFile(temporary_path, "r")
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="便签备份不是有效的 ZIP 文件") from exc

        with archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or "便签数据.json" not in names:
                raise HTTPException(status_code=400, detail="便签备份清单缺失或存在重复文件")
            manifest_info = archive.getinfo("便签数据.json")
            if manifest_info.file_size > MOBILE_NOTE_BACKUP_MAX_MANIFEST_BYTES:
                raise HTTPException(status_code=413, detail="便签备份清单超过大小限制")
            try:
                manifest = json.loads(archive.read(manifest_info).decode("utf-8"))
            except (ValueError, UnicodeError, zipfile.BadZipFile) as exc:
                raise HTTPException(status_code=400, detail="便签备份清单无效或已损坏") from exc
            if not isinstance(manifest, dict) or manifest.get("kind") != "openhisassistant-mobile-notes-backup" or manifest.get("schemaVersion") != 1:
                raise HTTPException(status_code=400, detail="不是受支持的 OHA 便签备份")
            if manifest.get("username") != username:
                raise HTTPException(status_code=409, detail="备份所属用户名与所选账号不一致，未还原")
            notes = manifest.get("notes")
            if not isinstance(notes, list) or len(notes) > 200:
                raise HTTPException(status_code=400, detail="便签备份条目无效或超过200条")

            seen_ids: Set[str] = set()
            allowed_files: Set[str] = {"便签数据.json"}
            total_bytes = 0
            for note in notes:
                if not isinstance(note, dict):
                    raise HTTPException(status_code=400, detail="便签备份包含无效记录")
                note_id = note.get("id")
                title, content = note.get("title"), note.get("content")
                if not isinstance(note_id, str) or not re.fullmatch(r"[0-9a-f]{24}", note_id) or note_id in seen_ids:
                    raise HTTPException(status_code=400, detail="便签备份 ID 无效或重复")
                if not isinstance(title, str) or len(title) > 120 or not isinstance(content, str) or len(content) > 50000:
                    raise HTTPException(status_code=400, detail="便签备份文字超过允许长度")
                if not all(isinstance(note.get(key), int) and not isinstance(note.get(key), bool) and note[key] >= 0
                           for key in ("createdAt", "updatedAt", "revision")) or note["revision"] < 1:
                    raise HTTPException(status_code=400, detail="便签备份时间或版本号无效")
                seen_ids.add(note_id)
                attachments = note.get("attachments")
                if not isinstance(attachments, list) or len(attachments) > MOBILE_ATTACHMENT_MAX_PATIENT_FILES:
                    raise HTTPException(status_code=400, detail="便签附件清单无效或超过100个")
                note_bytes = 0
                for item in attachments:
                    if not isinstance(item, dict):
                        raise HTTPException(status_code=400, detail="便签附件记录无效")
                    attachment_id, mime_type = item.get("id"), item.get("mimeType")
                    if not isinstance(attachment_id, str) or not isinstance(mime_type, str):
                        raise HTTPException(status_code=400, detail="便签附件标识或类型无效")
                    path = mobile_note_backup_entry_path(note_id, attachment_id, mime_type)
                    if item.get("path") != path or path not in names or path in allowed_files:
                        raise HTTPException(status_code=400, detail="便签附件文件缺失或重复")
                    size, checksum = item.get("sizeBytes"), item.get("sha256")
                    if (not isinstance(size, int) or isinstance(size, bool) or size < 0
                            or size > MOBILE_ATTACHMENT_MAX_FILE_BYTES or archive.getinfo(path).file_size != size
                            or not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum)
                            or not isinstance(item.get("name"), str) or not item["name"] or len(item["name"]) > 180
                            or not isinstance(item.get("createdAt"), int) or item["createdAt"] < 0):
                        raise HTTPException(status_code=400, detail="便签附件大小或校验信息无效")
                    note_bytes += size
                    total_bytes += size
                    if note_bytes > MOBILE_ATTACHMENT_MAX_PATIENT_BYTES or total_bytes > MOBILE_ARCHIVE_MAX_EXPORT_BYTES:
                        raise HTTPException(status_code=413, detail="便签备份附件超过允许大小")
                    allowed_files.add(path)
            if set(names) != allowed_files:
                raise HTTPException(status_code=400, detail="便签备份包含未声明的文件")

            imported_notes = 0
            copied_notes = 0
            skipped_notes = 0
            imported_attachments = 0
            skipped_attachments = 0
            with db_connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                latest = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
                if not latest or str(latest["username"]) != username:
                    raise HTTPException(status_code=409, detail="目标账号已变化，未还原便签")
                existing_count = int(conn.execute(
                    "SELECT COUNT(*) FROM mobile_account_notes WHERE user_id = ?", (user_id,)
                ).fetchone()[0])
                for note in notes:
                    original_id = note["id"]
                    title, content = note["title"], note["content"]
                    found = conn.execute(
                        "SELECT title, content FROM mobile_account_notes WHERE user_id = ? AND note_id = ?",
                        (user_id, original_id),
                    ).fetchone()
                    restored_id = original_id
                    saved_title = title
                    if found and (found["title"] != title or found["content"] != content):
                        suffix = "（备份恢复）"
                        saved_title = (title[:120 - len(suffix)] + suffix) if title else "未命名便签" + suffix
                        restored_id = hashlib.sha256((original_id + "\x00" + title + "\x00" + content).encode("utf-8")).hexdigest()[:24]
                        previous = conn.execute(
                            "SELECT title, content FROM mobile_account_notes WHERE user_id = ? AND note_id = ?",
                            (user_id, restored_id),
                        ).fetchone()
                        if previous and (previous["title"] != saved_title or previous["content"] != content):
                            restored_id = secrets.token_hex(12)
                            previous = None
                        found = previous
                        if not found:
                            copied_notes += 1
                    if not found:
                        if existing_count >= 200:
                            raise HTTPException(status_code=409, detail="目标账号便签已达200条上限，未导入任何内容")
                        current_time = now_ts() if restored_id != original_id else int(note["updatedAt"])
                        conn.execute(
                            "INSERT INTO mobile_account_notes(user_id,note_id,title,content,revision,created_at,updated_at) "
                            "VALUES(?,?,?,?,?,?,?)",
                            (user_id, restored_id, saved_title, content, 1,
                             int(note["createdAt"]), current_time),
                        )
                        imported_notes += 1
                        existing_count += 1
                    else:
                        skipped_notes += 1

                    scope = MOBILE_STICKY_NOTE_ATTACHMENT_PREFIX + restored_id
                    patient_hash = hashlib.sha256(f"{user_id}:{scope}".encode("utf-8")).hexdigest()[:32]
                    relative_dir = Path(str(user_id)) / patient_hash
                    target_dir = mobile_attachment_path(str(relative_dir / "placeholder")).parent
                    current_items = conn.execute(
                        "SELECT original_name, sha256, stored_path, size_bytes "
                        "FROM mobile_patient_attachments WHERE user_id = ? AND admission_no = ?",
                        (user_id, scope),
                    ).fetchall()
                    existing_files = {
                        (str(row["original_name"]), str(row["sha256"]))
                        for row in current_items
                        if mobile_attachment_path(str(row["stored_path"])).is_file()
                    }
                    occupied_bytes = sum(int(row["size_bytes"]) for row in current_items)
                    occupied_count = len(current_items)
                    for item in note["attachments"]:
                        attachment_key = (mobile_attachment_safe_name(item["name"]), item["sha256"])
                        if attachment_key in existing_files:
                            skipped_attachments += 1
                            continue
                        if occupied_count >= MOBILE_ATTACHMENT_MAX_PATIENT_FILES or occupied_bytes + item["sizeBytes"] > MOBILE_ATTACHMENT_MAX_PATIENT_BYTES:
                            raise HTTPException(status_code=409, detail="目标便签附件已达数量或容量上限，未导入任何内容")
                        target_dir.mkdir(parents=True, exist_ok=True)
                        attachment_id = secrets.token_hex(16)
                        final_path = target_dir / (attachment_id + MOBILE_ATTACHMENT_MIME_EXTENSIONS[item["mimeType"]])
                        partial = target_dir / (".restore-" + attachment_id + ".tmp")
                        digest = hashlib.sha256()
                        size = 0
                        try:
                            with archive.open(item["path"], "r") as original, partial.open("wb") as destination:
                                while chunk := original.read(1024 * 1024):
                                    size += len(chunk)
                                    if size > MOBILE_ATTACHMENT_MAX_FILE_BYTES:
                                        raise HTTPException(status_code=413, detail="便签备份附件超过25MB")
                                    digest.update(chunk)
                                    destination.write(chunk)
                            if size != item["sizeBytes"] or digest.hexdigest() != item["sha256"]:
                                raise HTTPException(status_code=400, detail="便签备份附件校验失败，未导入任何内容")
                            os.replace(str(partial), str(final_path))
                        except zipfile.BadZipFile as exc:
                            raise HTTPException(status_code=400, detail="便签备份附件已损坏，未导入任何内容") from exc
                        finally:
                            partial.unlink(missing_ok=True)
                        created_files.append(final_path)
                        relative_path = str(final_path.relative_to(MOBILE_ATTACHMENT_ROOT)).replace("\\", "/")
                        conn.execute(
                            "INSERT INTO mobile_patient_attachments(id,user_id,admission_no,original_name,stored_path,mime_type,size_bytes,sha256,created_at) "
                            "VALUES(?,?,?,?,?,?,?,?,?)",
                            (attachment_id, user_id, scope, mobile_attachment_safe_name(item["name"]),
                             relative_path, item["mimeType"], size, item["sha256"], int(item["createdAt"])),
                        )
                        occupied_count += 1
                        occupied_bytes += size
                        existing_files.add(attachment_key)
                        imported_attachments += 1
                conn.commit()
                committed = True
        return {
            "ok": True, "username": username, "userId": user_id,
            "importedNotes": imported_notes, "copiedNotes": copied_notes,
            "skippedNotes": skipped_notes, "importedAttachments": imported_attachments,
            "skippedAttachments": skipped_attachments,
        }
    finally:
        if not committed:
            for path in reversed(created_files):
                path.unlink(missing_ok=True)
                try:
                    path.parent.rmdir()
                except OSError:
                    pass
        temporary_path.unlink(missing_ok=True)


@app.post("/api/admin/storage/users/{user_id}/clear")
def admin_storage_clear_user_data(
    user_id: int,
    body: AdminUserDataClearRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    if user_id <= 0 or body.confirmUserId != user_id:
        raise HTTPException(status_code=400, detail="请确认要清除的现有账号 ID")
    if not (body.clearData or body.clearAttachments):
        raise HTTPException(status_code=400, detail="请至少选择“数据”或“附件”")

    root = MOBILE_ATTACHMENT_ROOT.resolve()
    folder = root / str(user_id)
    if body.clearAttachments and (folder.is_symlink() or (folder.exists() and not folder.is_dir())):
        raise HTTPException(status_code=409, detail="账号附件路径异常，未清除任何数据")

    with db_connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        target = conn.execute(
            "SELECT username FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="账号已不存在，未清除任何数据")
        username = str(target["username"])
        if body.confirmUsername != username:
            raise HTTPException(status_code=400, detail="确认的用户名与当前账号不一致")

        current = mobile_storage_user_usage(conn, user_id)
        actual_bytes, actual_files = (
            mobile_storage_directory_usage(folder) if body.clearAttachments else (0, 0)
        )
        if (
            body.clearData and (
                current["dataBytes"] != body.expectedDataBytes
                or current["details"] != body.expectedDetails
            )
        ) or (
            body.clearAttachments and (
                current["attachmentRecords"] != body.expectedAttachmentRecords
                or actual_files != body.expectedAttachmentFiles
                or actual_bytes != body.expectedAttachmentBytes
            )
        ):
            raise HTTPException(status_code=409, detail="账号数据已变化，请刷新空间管理后重新确认")

        records_deleted = 0
        if body.clearData:
            for table in MOBILE_STORAGE_USER_DATA_TABLES:
                records_deleted += max(0, conn.execute(
                    "DELETE FROM " + table + " WHERE user_id = ?", (user_id,)
                ).rowcount)
        attachment_records_deleted = 0
        if body.clearAttachments:
            attachment_records_deleted = max(0, conn.execute(
                "DELETE FROM mobile_patient_attachments WHERE user_id = ?", (user_id,)
            ).rowcount)
        sessions_revoked = max(0, conn.execute(
            "DELETE FROM sessions WHERE user_id = ?", (user_id,)
        ).rowcount)
        conn.commit()

    # 附件选中时才触碰账号目录；数据库先提交，文件清理失败可刷新后重试。
    if body.clearAttachments:
        if folder.is_symlink() or (folder.exists() and not folder.is_dir()):
            raise HTTPException(status_code=500, detail="所选资料和会话已清除，附件目录异常，请检查后重试")
        if folder.is_dir():
            try:
                shutil.rmtree(folder)
            except OSError as exc:
                raise HTTPException(
                    status_code=500,
                    detail="所选资料和会话已清除，附件文件未能全部清理，请刷新空间管理后重试",
                ) from exc

    return {
        "ok": True,
        "userId": user_id,
        "username": username,
        "clearedData": body.clearData,
        "clearedAttachments": body.clearAttachments,
        "recordsDeleted": records_deleted,
        "attachmentRecordsDeleted": attachment_records_deleted,
        "sessionsRevoked": sessions_revoked,
        "deletedFiles": actual_files,
        "freedBytes": actual_bytes,
    }


@app.post("/api/admin/storage/orphans/{user_id}/purge")
def admin_storage_purge_orphan(
    user_id: int,
    body: AdminOrphanAttachmentCleanupRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    if user_id <= 0 or body.confirmUserId != user_id:
        raise HTTPException(status_code=400, detail="请确认要清理的已删除账号 ID")

    with db_connect() as conn:
        if conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
            raise HTTPException(status_code=409, detail="该账号仍存在，禁止清理附件")
        if conn.execute(
            "SELECT 1 FROM mobile_patient_attachments WHERE user_id = ? LIMIT 1", (user_id,)
        ).fetchone():
            raise HTTPException(status_code=409, detail="该账号仍有附件记录，禁止清理")

    root = MOBILE_ATTACHMENT_ROOT.resolve()
    folder = root / str(user_id)
    if folder.is_symlink() or not folder.is_dir() or folder.parent != root:
        raise HTTPException(status_code=404, detail="残留附件目录不存在")
    actual_bytes, actual_files = mobile_storage_directory_usage(folder)
    if actual_bytes != body.expectedBytes or actual_files != body.expectedFiles:
        raise HTTPException(status_code=409, detail="残留附件大小已变化，请刷新空间管理后重新确认")

    # 删除前再次核对，避免管理员预览与实际清理之间账号状态发生变化。
    with db_connect() as conn:
        if conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
            raise HTTPException(status_code=409, detail="该账号已恢复，禁止清理附件")
        if conn.execute(
            "SELECT 1 FROM mobile_patient_attachments WHERE user_id = ? LIMIT 1", (user_id,)
        ).fetchone():
            raise HTTPException(status_code=409, detail="该账号仍有附件记录，禁止清理")
    try:
        shutil.rmtree(folder)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="附件目录清理失败，请检查服务端文件权限") from exc
    return {"ok": True, "userId": user_id, "deletedFiles": actual_files, "freedBytes": actual_bytes}


@app.get("/api/admin/users")
def admin_list_users(admin: Dict[str, Any] = Depends(require_admin)):
    with db_connect() as conn:
        rows = conn.execute(
            """
            SELECT
                u.id, u.username, u.role, u.enabled,
                u.created_at, u.updated_at,
                COUNT(s.id) AS active_sessions
            FROM users u
            LEFT JOIN sessions s
              ON s.user_id = u.id AND s.expires_at > ?
            GROUP BY u.id
            ORDER BY u.id
            """,
            (now_ts(),),
        ).fetchall()

        users = []
        for row in rows:
            users.append(
                {
                    "id": int(row["id"]),
                    "username": row["username"],
                    "role": row["role"],
                    "enabled": bool(row["enabled"]),
                    "createdAt": int(row["created_at"]),
                    "updatedAt": int(row["updated_at"]),
                    "activeSessions": int(row["active_sessions"]),
                    "modulePermissions": effective_user_module_permissions(
                        conn,
                        int(row["id"]),
                        str(row["role"]),
                    ),
                    "ohaUiEnabled": bool(
                        effective_client_settings(conn, int(row["id"]))["ohaUiPanelEnabled"]
                    ),
                    "ohaUiPreference": bool(
                        user_feature_enabled(
                            conn,
                            int(row["id"]),
                            OHA_UI_FEATURE_KEY,
                            True,
                        )
                    ),
                    # v0.4.4：设置按钮对所有角色都按用户开关生效，
                    # 包括 admin。关闭后客户端重新登录即直接隐藏按钮。
                    "settingsButtonVisible": bool(
                        user_feature_enabled(
                            conn,
                            int(row["id"]),
                            SETTINGS_BUTTON_FEATURE_KEY,
                            True,
                        )
                    ),
                    "settingsAccessEnabled": bool(
                        user_feature_enabled(
                            conn,
                            int(row["id"]),
                            SETTINGS_BUTTON_FEATURE_KEY,
                            True,
                        )
                    ),
                    "settingsButtonPreference": bool(
                        user_feature_enabled(
                            conn,
                            int(row["id"]),
                            SETTINGS_BUTTON_FEATURE_KEY,
                            True,
                        )
                    ),
                    # v0.4.11：恢复单用户远程接入权限。
                    # 默认 False，只有管理员明确勾选后该用户才能在 VPN 登录弹窗中通过授权。
                    "sstpVpnPreference": bool(
                        user_feature_enabled(
                            conn,
                            int(row["id"]),
                            SSTP_VPN_FEATURE_KEY,
                            False,
                        )
                    ),
                    "vpnUserAuthorized": bool(
                        user_feature_enabled(
                            conn,
                            int(row["id"]),
                            SSTP_VPN_FEATURE_KEY,
                            False,
                        )
                    ),
                }
            )

    return {"ok": True, "users": users}


@app.get("/api/admin/modules/webdav/settings")
def admin_get_module_webdav_settings(admin: Dict[str, Any] = Depends(require_admin)):
    with db_connect() as conn:
        return {"ok": True, **get_module_webdav_settings(conn, include_password=False)}


@app.put("/api/admin/modules/webdav/settings")
def admin_set_module_webdav_settings(
    body: AdminModuleWebdavSettingsRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    with db_connect() as conn:
        settings = set_module_webdav_settings(conn, body)
    return {"ok": True, **settings}


@app.post("/api/admin/modules/webdav/check")
def admin_check_module_webdav_updates(admin: Dict[str, Any] = Depends(require_admin)):
    with db_connect() as conn:
        settings = get_module_webdav_settings(conn, include_password=True)
    result = module_webdav_check_rows(settings)
    return {"ok": True, **result}


@app.post("/api/admin/modules/webdav/apply")
def admin_apply_module_webdav_updates(
    body: AdminModuleWebdavApplyRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    with db_connect() as conn:
        settings = get_module_webdav_settings(conn, include_password=True)
    return apply_webdav_module_updates(
        settings=settings,
        requested_modules=body.modules,
        force=bool(body.force),
        actor=str(admin.get("username") or "admin"),
        admin_session_id=int(admin["session_id"]),
    )


@app.get("/api/admin/modules")
def admin_list_modules(admin: Dict[str, Any] = Depends(require_admin)):
    return {"ok": True, "modules": [module_entry_public(item) for item in manifest_modules()]}


@app.get("/api/admin/modules/backups")
def admin_list_module_backups(admin: Dict[str, Any] = Depends(require_admin)):
    backups = []
    for path in sorted(MODULE_BACKUP_DIR.glob("*.json"), reverse=True):
        try:
            data = read_module_backup(path)
            item = data.get("module") or {}
            backups.append({
                "backupId": path.name,
                "moduleName": str(item.get("name") or ""),
                "displayName": str(item.get("displayName") or item.get("name") or ""),
                "version": str(item.get("version") or ""),
                "createdAt": int(data.get("createdAt") or 0),
                "reason": str(data.get("reason") or ""),
                "actor": str(data.get("actor") or ""),
                "sourceSize": len(str(data.get("source") or "").encode("utf-8")),
            })
        except Exception:
            backups.append({"backupId": path.name, "invalid": True})
    return {"ok": True, "backups": backups}


@app.post("/api/admin/modules/backups/{backup_id}/restore")
def admin_restore_module_backup(
    backup_id: str,
    body: AdminModuleBackupRestoreRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    path = backup_file_path(backup_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="备份不存在")
    data = read_module_backup(path)
    restored = dict(data.get("module") or {})
    name = normalize_module_name(str(restored.get("name") or ""))
    restored["file"] = normalize_module_file(str(restored.get("file") or ""), name)
    source = str(data.get("source") or "")
    if not source:
        raise HTTPException(status_code=400, detail="该备份不包含脚本源码")

    manifest = load_manifest()
    modules = [dict(item) for item in manifest.get("modules", []) if isinstance(item, dict)]
    existing_index = next((i for i, item in enumerate(modules) if str(item.get("name") or "") == name), -1)
    if existing_index >= 0 and not body.overwrite:
        raise HTTPException(status_code=409, detail="同名模块已存在")
    if existing_index >= 0:
        create_module_backup(modules[existing_index], "before-restore", str(admin.get("username") or "admin"))
        modules[existing_index] = restored
    else:
        modules.append(restored)

    manifest["modules"] = modules
    validate_manifest_dependencies(manifest)
    module_path_for_item(restored).write_text(source, encoding="utf-8")
    refresh_manifest_hashes(manifest)
    save_manifest(manifest)
    revoked = revoke_other_sessions(int(admin["session_id"]))
    return {"ok": True, "module": module_entry_public(restored), "sessionsRevoked": revoked}


@app.delete("/api/admin/modules/backups/{backup_id}")
def admin_delete_module_backup(
    backup_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    path = backup_file_path(backup_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="备份不存在")
    path.unlink()
    return {"ok": True, "backupId": backup_id}


@app.get("/api/admin/modules/{module_name}/detail")
def admin_get_module_detail(
    module_name: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target = normalize_module_name(module_name)
    item = next((entry for entry in manifest_modules() if str(entry.get("name") or "") == target), None)
    if not item:
        raise HTTPException(status_code=404, detail="模块不存在")
    path = module_path_for_item(item)
    source = path.read_text(encoding="utf-8") if path.exists() else ""
    return {"ok": True, "module": module_entry_public(item), "source": source}


@app.post("/api/admin/modules/{module_name}/backup")
def admin_backup_module(
    module_name: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target = normalize_module_name(module_name)
    item = next((entry for entry in manifest_modules() if str(entry.get("name") or "") == target), None)
    if not item:
        raise HTTPException(status_code=404, detail="模块不存在")
    backup = create_module_backup(item, "manual", str(admin.get("username") or "admin"))
    return {"ok": True, "backup": backup}


@app.post("/api/admin/modules")
def admin_create_module(
    body: AdminModuleCreateRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    name = normalize_module_name(body.name)
    manifest = load_manifest()
    modules = [dict(item) for item in manifest.get("modules", []) if isinstance(item, dict)]
    if any(str(item.get("name") or "") == name for item in modules):
        raise HTTPException(status_code=409, detail="模块技术ID已存在")

    header = userscript_header_metadata(body.source)
    file_name = normalize_module_file(body.file or "", name)
    if any(str(item.get("file") or "") == file_name for item in modules):
        raise HTTPException(status_code=409, detail="模块文件名已被占用")

    item: Dict[str, Any] = {
        "name": name,
        "displayName": str(body.displayName or header.get("displayName") or name).strip(),
        "version": str(body.version or header.get("version") or "1.0.0").strip(),
        "file": file_name,
        "enabled": bool(body.enabled),
        "roles": normalize_module_roles(body.roles),
        "matches": clean_string_list(body.matches) or clean_string_list(header.get("matches") or []),
        "runAt": normalize_run_at(body.runAt or header.get("runAt") or "document-idle"),
        "grants": clean_string_list(body.grants) or clean_string_list(header.get("grants") or []),
        "connect": clean_string_list(body.connect) or clean_string_list(header.get("connect") or []),
        "dependencies": clean_string_list(body.dependencies),
        "priority": max(-100000, min(100000, int(body.priority))),
        "channel": str(body.channel or "stable").strip() or "stable",
        "userControllable": bool(body.userControllable),
        "defaultUserEnabled": bool(body.defaultUserEnabled),
    }
    modules.append(item)
    manifest["modules"] = modules
    validate_manifest_dependencies(manifest)
    module_path_for_item(item).write_text(body.source, encoding="utf-8")
    refresh_manifest_hashes(manifest)
    save_manifest(manifest)
    revoked = revoke_other_sessions(int(admin["session_id"]))
    return {"ok": True, "module": module_entry_public(item), "sessionsRevoked": revoked}


@app.put("/api/admin/modules/{module_name}")
def admin_update_module(
    module_name: str,
    body: AdminModuleUpdateRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target = normalize_module_name(module_name)
    manifest = load_manifest()
    modules = [dict(item) for item in manifest.get("modules", []) if isinstance(item, dict)]
    index = next((i for i, item in enumerate(modules) if str(item.get("name") or "") == target), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="模块不存在")
    old = dict(modules[index])
    create_module_backup(old, "before-edit", str(admin.get("username") or "admin"))
    item = dict(old)

    if body.displayName is not None:
        item["displayName"] = str(body.displayName).strip() or target
    if body.version is not None:
        item["version"] = str(body.version).strip()
    if body.enabled is not None:
        item["enabled"] = bool(body.enabled)
    if body.roles is not None:
        item["roles"] = normalize_module_roles(body.roles)
    if body.matches is not None:
        item["matches"] = clean_string_list(body.matches)
    if body.runAt is not None:
        item["runAt"] = normalize_run_at(body.runAt)
    if body.grants is not None:
        item["grants"] = clean_string_list(body.grants)
    if body.connect is not None:
        item["connect"] = clean_string_list(body.connect)
    if body.dependencies is not None:
        item["dependencies"] = clean_string_list(body.dependencies)
    if body.priority is not None:
        item["priority"] = max(-100000, min(100000, int(body.priority)))
    if body.channel is not None:
        item["channel"] = str(body.channel).strip() or "stable"
    if body.userControllable is not None:
        item["userControllable"] = bool(body.userControllable)
    if body.defaultUserEnabled is not None:
        item["defaultUserEnabled"] = bool(body.defaultUserEnabled)

    old_path = module_path_for_item(old)
    if body.file is not None:
        new_file = normalize_module_file(body.file, target)
        if any(i != index and str(entry.get("file") or "") == new_file for i, entry in enumerate(modules)):
            raise HTTPException(status_code=409, detail="模块文件名已被占用")
        item["file"] = new_file
    new_path = module_path_for_item(item)

    modules[index] = item
    manifest["modules"] = modules
    validate_manifest_dependencies(manifest)

    if body.source is not None:
        if not str(body.source):
            raise HTTPException(status_code=400, detail="脚本源码不能为空")
        new_path.write_text(str(body.source), encoding="utf-8")
    elif new_path != old_path:
        if not old_path.exists():
            raise HTTPException(status_code=404, detail="原模块文件不存在，无法改名")
        new_path.write_text(old_path.read_text(encoding="utf-8"), encoding="utf-8")

    if new_path != old_path and old_path.exists():
        old_path.unlink()

    refresh_manifest_hashes(manifest)
    save_manifest(manifest)
    revoked = revoke_other_sessions(int(admin["session_id"]))
    return {"ok": True, "module": module_entry_public(item), "sessionsRevoked": revoked}


@app.delete("/api/admin/modules/{module_name}")
def admin_delete_module(
    module_name: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target = normalize_module_name(module_name)
    manifest = load_manifest()
    modules = [dict(item) for item in manifest.get("modules", []) if isinstance(item, dict)]
    index = next((i for i, item in enumerate(modules) if str(item.get("name") or "") == target), -1)
    if index < 0:
        raise HTTPException(status_code=404, detail="模块不存在")
    dependents = [
        str(item.get("name") or "")
        for item in modules
        if target in clean_string_list(item.get("dependencies") or [])
    ]
    if dependents:
        raise HTTPException(status_code=409, detail="仍有模块依赖它，请先修改依赖：" + ", ".join(dependents))

    item = modules[index]
    backup = create_module_backup(item, "before-delete", str(admin.get("username") or "admin"))
    del modules[index]
    manifest["modules"] = modules
    validate_manifest_dependencies(manifest)
    save_manifest(manifest)
    path = module_path_for_item(item)
    if path.exists():
        path.unlink()
    with db_connect() as conn:
        conn.execute("DELETE FROM user_module_permissions WHERE module_name = ?", (target,))
        conn.execute("DELETE FROM sessions WHERE id <> ?", (admin["session_id"],))
        conn.commit()
    return {"ok": True, "module": target, "backup": backup}


@app.post("/api/admin/users")
def admin_create_user(
    body: AdminCreateUserRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    username = normalize_username(body.username)
    role = normalize_role(body.role)
    current = now_ts()

    try:
        with db_connect() as conn:
            conn.execute(
                """
                INSERT INTO users(
                    username, password_hash, role,
                    enabled, created_at, updated_at
                )
                VALUES(?, ?, ?, 1, ?, ?)
                """,
                (username, password_encode(body.password), role, current, current),
            )
            conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="用户名已存在")

    return {"ok": True, "username": username, "role": role, "enabled": True}


@app.patch("/api/admin/users/{username}")
def admin_update_user(
    username: str,
    body: AdminUpdateUserRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)
    new_role = normalize_role(body.role) if body.role is not None else None
    new_enabled = body.enabled if body.enabled is not None else None

    if new_role is None and new_enabled is None:
        raise HTTPException(status_code=400, detail="没有需要修改的字段")

    with db_connect() as conn:
        target = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        if int(target["id"]) == int(admin["user_id"]):
            if new_enabled is False:
                raise HTTPException(status_code=400, detail="不能禁用当前登录的管理员账号")
            if new_role is not None and new_role != "admin":
                raise HTTPException(status_code=400, detail="不能降低当前登录管理员自己的角色")

        ensure_admin_survives(
            conn,
            target,
            new_role=new_role,
            new_enabled=new_enabled,
        )

        role = new_role if new_role is not None else target["role"]
        enabled = int(new_enabled) if new_enabled is not None else int(target["enabled"])
        current = now_ts()

        conn.execute(
            "UPDATE users SET role = ?, enabled = ?, updated_at = ? WHERE id = ?",
            (role, enabled, current, target["id"]),
        )

        # 权限或启用状态变化后撤销该账号所有已有会话，强制重新登录。
        if new_role is not None or new_enabled is not None:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))

        conn.commit()

    return {"ok": True, "username": target_name, "role": role, "enabled": bool(enabled)}


@app.put("/api/admin/users/{username}/modules/{module_name}")
def admin_set_user_module_permission(
    username: str,
    module_name: str,
    body: AdminUserModulePermissionRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)
    target_module = (module_name or "").strip()
    module_item = next(
        (item for item in manifest_modules() if str(item.get("name") or "") == target_module),
        None,
    )
    if not module_item:
        raise HTTPException(status_code=404, detail="脚本模块不存在")
    if not module_user_controllable(module_item):
        raise HTTPException(status_code=400, detail="该模块属于 OHA 系统运行时，不能按用户关闭")

    current = now_ts()
    with db_connect() as conn:
        target = conn.execute(
            "SELECT id, username, role FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        if body.enabled and not module_role_allowed(module_item, str(target["role"])):
            raise HTTPException(status_code=400, detail="该用户角色不允许启用此脚本")

        conn.execute(
            """
            INSERT INTO user_module_permissions(user_id, module_name, enabled, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(user_id, module_name) DO UPDATE SET
                enabled = excluded.enabled,
                updated_at = excluded.updated_at
            """,
            (target["id"], target_module, 1 if body.enabled else 0, current),
        )

        # 权限变化需要让已运行客户端重新登录后重新获取 Manifest。
        # 如果管理员正在管理自己的脚本，只保留当前 /admin 会话。
        if int(target["id"]) == int(admin["user_id"]):
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ? AND id <> ?",
                (target["id"], admin["session_id"]),
            )
        else:
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ?",
                (target["id"],),
            )
        conn.commit()

        effective = effective_user_module_permissions(
            conn,
            int(target["id"]),
            str(target["role"]),
        ).get(target_module, False)

    return {
        "ok": True,
        "username": target_name,
        "module": target_module,
        "enabled": bool(effective),
        "sessionsRevoked": int(cur.rowcount),
    }


@app.put("/api/admin/users/{username}/features/oha-ui")
def admin_set_user_oha_ui_permission(
    username: str,
    body: AdminUserFeaturePermissionRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)
    current = now_ts()
    with db_connect() as conn:
        target = conn.execute(
            "SELECT id, username FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        conn.execute(
            """
            INSERT INTO user_module_permissions(user_id, module_name, enabled, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(user_id, module_name) DO UPDATE SET
                enabled = excluded.enabled,
                updated_at = excluded.updated_at
            """,
            (target["id"], OHA_UI_FEATURE_KEY, 1 if body.enabled else 0, current),
        )

        if int(target["id"]) == int(admin["user_id"]):
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ? AND id <> ?",
                (target["id"], admin["session_id"]),
            )
        else:
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ?",
                (target["id"],),
            )
        conn.commit()
        effective = effective_client_settings(conn, int(target["id"]))["ohaUiPanelEnabled"]

    return {
        "ok": True,
        "username": target_name,
        "enabled": bool(effective),
        "preference": bool(body.enabled),
        "sessionsRevoked": int(cur.rowcount),
    }


@app.put("/api/admin/users/{username}/features/settings-button")
def admin_set_user_settings_button_permission(
    username: str,
    body: AdminUserFeaturePermissionRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)
    current = now_ts()

    with db_connect() as conn:
        target = conn.execute(
            "SELECT id, username, role FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        conn.execute(
            """
            INSERT INTO user_module_permissions(user_id, module_name, enabled, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(user_id, module_name) DO UPDATE SET
                enabled = excluded.enabled,
                updated_at = excluded.updated_at
            """,
            (
                target["id"],
                SETTINGS_BUTTON_FEATURE_KEY,
                1 if body.enabled else 0,
                current,
            ),
        )

        # 修改后撤销目标账号已有客户端会话，使重新登录立即应用显示策略。
        # 如果管理员正在管理自己的开关，保留当前 /admin 会话，避免保存后
        # 管理页面本身立即掉线；其它该账号会话仍全部撤销。
        if int(target["id"]) == int(admin["user_id"]):
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ? AND id <> ?",
                (target["id"], admin["session_id"]),
            )
        else:
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ?",
                (target["id"],),
            )
        conn.commit()

    return {
        "ok": True,
        "username": target_name,
        "enabled": bool(body.enabled),
        "preference": bool(body.enabled),
        "sessionsRevoked": int(cur.rowcount),
    }


@app.put("/api/admin/users/{username}/features/sstp-vpn")
def admin_set_user_sstp_vpn_permission(
    username: str,
    body: AdminUserFeaturePermissionRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)
    current = now_ts()

    with db_connect() as conn:
        target = conn.execute(
            "SELECT id, username, role FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        conn.execute(
            """
            INSERT INTO user_module_permissions(user_id, module_name, enabled, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(user_id, module_name) DO UPDATE SET
                enabled = excluded.enabled,
                updated_at = excluded.updated_at
            """,
            (target["id"], SSTP_VPN_FEATURE_KEY, 1 if body.enabled else 0, current),
        )

        if int(target["id"]) == int(admin["user_id"]):
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ? AND id <> ?",
                (target["id"], admin["session_id"]),
            )
        else:
            cur = conn.execute(
                "DELETE FROM sessions WHERE user_id = ?",
                (target["id"],),
            )
        conn.commit()
        effective = effective_client_settings(conn, int(target["id"]))["vpnEnabled"]

    return {
        "ok": True,
        "username": target_name,
        "enabled": bool(effective),
        "preference": bool(body.enabled),
        "sessionsRevoked": int(cur.rowcount),
    }


@app.post("/api/admin/users/{username}/password")
def admin_reset_user_password(
    username: str,
    body: AdminResetPasswordRequest,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)
    current = now_ts()

    with db_connect() as conn:
        target = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (password_encode(body.password), current, target["id"]),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
        conn.commit()

    return {"ok": True, "username": target_name}


@app.post("/api/admin/users/{username}/revoke-sessions")
def admin_revoke_user_sessions(
    username: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)

    with db_connect() as conn:
        target = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        cur = conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
        conn.commit()

    return {"ok": True, "username": target_name, "revoked": int(cur.rowcount)}


@app.delete("/api/admin/users/{username}")
def admin_delete_user(
    username: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    target_name = normalize_username(username)

    with db_connect() as conn:
        target = conn.execute(
            "SELECT * FROM users WHERE username = ?",
            (target_name,),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="用户不存在")

        if int(target["id"]) == int(admin["user_id"]):
            raise HTTPException(status_code=400, detail="不能删除当前登录的管理员账号")

        ensure_admin_survives(conn, target, deleting=True)

        conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
        conn.execute("DELETE FROM user_module_permissions WHERE user_id = ?", (target["id"],))
        conn.execute("DELETE FROM users WHERE id = ?", (target["id"],))
        conn.commit()

    return {"ok": True, "username": target_name}


@app.get("/api/modules/manifest")
def get_module_manifest(user: Dict[str, Any] = Depends(require_user)):
    modules = allowed_modules_for_user(int(user["user_id"]), str(user["role"]))
    safe_modules = []
    for item in modules:
        safe_modules.append(
            {
                "name": item["name"],
                "displayName": item.get("displayName", item["name"]),
                "version": item.get("version", ""),
                "hosts": item.get("hosts") or [],
                "paths": item.get("paths") or [],
                "matches": item.get("matches") or [],
                "runAt": str(item.get("runAt") or "document-idle"),
                "grants": item.get("grants") or [],
                "connect": item.get("connect") or [],
                "dependencies": item.get("dependencies") or [],
                "priority": int(item.get("priority") or 100),
                "channel": str(item.get("channel") or "stable"),
                "hash": str(item.get("hash") or module_sha256(item)),
            }
        )
    return {
        "schemaVersion": 4,
        "runtime": "userscript-compatibility-1.1",
        "modules": safe_modules,
    }


@app.get("/api/modules/{module_name}", response_class=PlainTextResponse)
def get_module(module_name: str, user: Dict[str, Any] = Depends(require_user)):
    allowed = {
        item["name"]: item
        for item in allowed_modules_for_user(int(user["user_id"]), str(user["role"]))
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


def _deepseek_headers() -> Dict[str, str]:
    api_key = str(CONFIG.get("deepseek_api_key") or "").strip()
    if not api_key or api_key.startswith("sk-REPLACE"):
        raise HTTPException(status_code=500, detail="服务器尚未配置 DeepSeek API Key")

    headers = {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
    }

    return headers


@app.post("/api/ai/chat")
def ai_chat(
    body: AiChatRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages 不能为空")
    with db_connect() as conn:
        provider = mobile_ai_selected_provider(conn, int(user["user_id"]), "text")
    model = str(provider.get("textModel") or "").strip()
    payload: Dict[str, Any] = {
        "model": model,
        "messages": body.messages,
        "stream": bool(body.stream),
    }
    if body.temperature is not None:
        payload["temperature"] = body.temperature
    if body.max_tokens is not None:
        if str(provider.get("id") or "") == "openai":
            payload["max_completion_tokens"] = body.max_tokens
        else:
            payload["max_tokens"] = body.max_tokens
    if body.response_format is not None:
        payload["response_format"] = body.response_format
    timeout_seconds = max(5, min(180, int(body.timeout or 120000) / 1000))
    label = str(provider.get("label") or "AI")
    try:
        response = DIRECT_HTTP.post(
            mobile_ai_chat_url(provider),
            headers=mobile_ai_headers(provider),
            json=payload,
            timeout=timeout_seconds,
            stream=bool(body.stream),
            **mobile_ai_request_kwargs(provider),
        )
    except requests.Timeout:
        if body.stream:
            raise HTTPException(status_code=504, detail="服务器访问" + label + "超时")
        return {"ok": False, "timeout": True, "status": 0, "data": None, "error": "服务器访问" + label + "超时"}
    except requests.RequestException as exc:
        if body.stream:
            raise HTTPException(status_code=502, detail="服务器访问" + label + "失败") from exc
        return {"ok": False, "status": 0, "data": None, "error": "服务器访问" + label + "失败：" + str(exc)}
    if body.stream:
        if not 200 <= response.status_code < 300:
            try:
                error_data: Any = response.json()
            except ValueError:
                error_data = {"raw": response.text}
            finally:
                response.close()
            error_text = ""
            if isinstance(error_data, dict):
                error_value = error_data.get("error")
                if isinstance(error_value, dict):
                    error_text = str(error_value.get("message") or error_value)
                elif error_value:
                    error_text = str(error_value)
                elif error_data.get("raw"):
                    error_text = str(error_data.get("raw"))
            if not error_text:
                error_text = label + " 返回 HTTP " + str(response.status_code)
            raise HTTPException(status_code=502, detail=error_text[:500])
        def iter_ai_stream():
            try:
                for chunk in response.iter_content(chunk_size=128):
                    if chunk:
                        yield chunk
            finally:
                response.close()
        return StreamingResponse(
            iter_ai_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "X-OHA-AI-Provider": str(provider.get("id") or ""), "X-OHA-AI-Model": model},
        )
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
            error_text = label + " 返回 HTTP " + str(response.status_code)
    return {"ok": ok, "status": response.status_code, "data": data, "error": error_text, "provider": provider.get("id", ""), "providerLabel": label, "model": model}


@app.post("/api/proxy/gm")
def proxy_gm(
    body: GmProxyRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """
    OHA userscript GM_xmlhttpRequest compatibility proxy.

    Supported target classes:
    1. DeepSeek AI: POST + HTTPS only; Authorization keeps the historical
       OHA behavior and is replaced by the server-side DeepSeek key.
    2. GLM AI: exact official host + HTTPS POST + chat/completions only;
       the userscript-supplied Bearer key is forwarded.
    3. OpenAI: exact official host + HTTPS POST + chat/completions only;
       the userscript-supplied Bearer key is forwarded, and the existing
       OpenAI-only HTTP proxy setting is honored when enabled.
    4. WebDAV: only OPTIONS/PROPFIND/MKCOL/PUT/GET/DELETE, and only when the
       target origin exactly matches the admin-configured WebDAV origin.

    The endpoint remains a restricted compatibility bridge and is not a
    general-purpose SSRF proxy.
    """
    method = str(body.method or "POST").upper().strip()
    parsed = urlparse(body.url)

    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="仅允许有效的 HTTP/HTTPS 目标")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="目标URL不能内嵌账号或密码")

    timeout_seconds = max(5, min(180, int(body.timeout or 120000) / 1000))

    # ------------------------------------------------------------------
    # WebDAV branch
    # ------------------------------------------------------------------
    webdav_methods = {"OPTIONS", "PROPFIND", "MKCOL", "PUT", "GET", "DELETE"}
    if method in webdav_methods:
        with db_connect() as conn:
            webdav_settings = get_module_webdav_settings(conn, include_password=False)

        configured_endpoint = str(webdav_settings.get("endpoint") or "").strip()
        if not configured_endpoint:
            raise HTTPException(
                status_code=403,
                detail=(
                    "OHA服务端尚未配置WebDAV允许目标。请先在管理中心 -> 模块管理 -> "
                    "从WebDAV更新脚本中保存WebDAV地址；该地址的协议、主机和端口会作为"
                    "GM WebDAV代理白名单。"
                ),
            )

        configured = urlparse(configured_endpoint)
        target_origin = (
            parsed.scheme.lower(),
            (parsed.hostname or "").lower(),
            parsed.port or (443 if parsed.scheme.lower() == "https" else 80),
        )
        configured_origin = (
            configured.scheme.lower(),
            (configured.hostname or "").lower(),
            configured.port or (443 if configured.scheme.lower() == "https" else 80),
        )

        if target_origin != configured_origin:
            raise HTTPException(
                status_code=403,
                detail=(
                    "WebDAV目标不在OHA服务端允许的WebDAV服务器白名单。"
                    "请确认悬浮框管理器与服务端模块更新功能配置的是同一协议、主机和端口。"
                ),
            )

        blocked_headers = {
            "host",
            "content-length",
            "connection",
            "proxy-authorization",
            "transfer-encoding",
        }
        headers = {
            str(k): str(v)
            for k, v in (body.headers or {}).items()
            if str(k).lower() not in blocked_headers
        }

        try:
            response = DIRECT_HTTP.request(
                method,
                body.url,
                headers=headers,
                data=None if body.data is None else body.data,
                timeout=timeout_seconds,
                allow_redirects=True,
            )
        except requests.Timeout:
            return JSONResponse(
                status_code=504,
                content={
                    "ok": False,
                    "timeout": True,
                    "status": 0,
                    "responseText": "",
                    "error": "OHA服务端访问WebDAV超时",
                },
            )
        except requests.RequestException as exc:
            print("[OpenHisAssistant][WebDAV][GM] 请求失败：" + repr(exc))
            return JSONResponse(
                status_code=502,
                content={
                    "ok": False,
                    "status": 0,
                    "responseText": "",
                    "error": "OHA服务端访问WebDAV失败：" + str(exc),
                },
            )

        return {
            "ok": True,
            "status": response.status_code,
            "statusText": str(response.reason or ""),
            "responseText": response.text,
            "responseHeaders": dict(response.headers),
            "finalUrl": str(response.url or body.url),
        }

    # ------------------------------------------------------------------
    # v0.4.16.4: userscript AI compatibility proxy
    #
    # Keep the original DeepSeek behavior, but add two tightly-scoped
    # official AI endpoints used by the seven userscripts:
    #   - GLM:    https://open.bigmodel.cn/.../chat/completions
    #   - OpenAI:https://api.openai.com/v1/chat/completions
    #
    # Security boundary:
    #   * POST + HTTPS only
    #   * GLM/OpenAI are exact-host allowlisted
    #   * GLM/OpenAI are restricted to /chat/completions
    #   * arbitrary hosts are still rejected (this is NOT a general SSRF proxy)
    #   * hop-by-hop headers are stripped
    #
    # DeepSeek intentionally keeps the old server-side key replacement
    # behavior so existing OHA userscript calls do not change.
    # GLM/OpenAI preserve the userscript-supplied Bearer token because the
    # seven-script global AI manager stores those keys in each business script.
    # ------------------------------------------------------------------
    if method != "POST":
        raise HTTPException(
            status_code=400,
            detail="兼容代理仅允许AI POST或受限WebDAV方法",
        )

    if parsed.scheme.lower() != "https":
        raise HTTPException(status_code=400, detail="AI兼容代理仅允许 HTTPS 目标")

    target_host = str(parsed.hostname or "").strip().lower()
    target_path = str(parsed.path or "").rstrip("/")

    # GLM/OpenAI must be classified before the legacy DeepSeek host list.
    # This prevents a manually-expanded deepseek_allowed_hosts from causing
    # another provider's Authorization header to be replaced by the DeepSeek key.
    if target_host == "api.openai.com":
        ai_provider = "openai"
        ai_label = "OpenAI"
    elif target_host == "open.bigmodel.cn":
        ai_provider = "glm"
        ai_label = "GLM"
    else:
        deepseek_allowed_hosts = {
            str(item or "").strip().lower()
            for item in (CONFIG.get("deepseek_allowed_hosts") or ["api.deepseek.com"])
            if str(item or "").strip()
        }
        if target_host in deepseek_allowed_hosts:
            ai_provider = "deepseek"
            ai_label = "DeepSeek"
        else:
            raise HTTPException(status_code=403, detail="目标域名不在服务器白名单")

    if ai_provider in {"openai", "glm"} and not target_path.endswith("/chat/completions"):
        raise HTTPException(
            status_code=403,
            detail=ai_label + "兼容代理仅允许 chat/completions 接口",
        )

    blocked_headers = {
        "host",
        "content-length",
        "connection",
        "proxy-authorization",
        "transfer-encoding",
    }

    headers = {
        str(k): str(v)
        for k, v in (body.headers or {}).items()
        if str(k).lower() not in blocked_headers
    }

    if ai_provider == "deepseek":
        # Preserve the historical OHA behavior: the server owns the DeepSeek key.
        api_key = str(CONFIG.get("deepseek_api_key") or "").strip()
        if not api_key or api_key.startswith("sk-REPLACE"):
            raise HTTPException(status_code=500, detail="服务器尚未配置 DeepSeek API Key")

        headers = {
            key: value
            for key, value in headers.items()
            if key.lower() != "authorization"
        }
        headers["Authorization"] = "Bearer " + api_key
    else:
        # GLM/OpenAI global userscript mode owns its key in the business script.
        # Forward only a valid Bearer token to the exact allowlisted provider.
        authorization = ""
        for key, value in headers.items():
            if key.lower() == "authorization":
                authorization = str(value or "").strip()
                break

        if not authorization.lower().startswith("bearer ") or not authorization[7:].strip():
            raise HTTPException(
                status_code=400,
                detail=ai_label + "请求未携带有效的 Bearer API Key",
            )

    headers.setdefault("Content-Type", "application/json")

    request_kwargs: Dict[str, Any] = {}
    if ai_provider == "openai":
        # Reuse the v1.16.13 OpenAI-only HTTP proxy setting when configured.
        # This does NOT enable a Windows/global proxy and does not affect
        # DeepSeek, GLM, WebDAV or intranet requests.
        try:
            with db_connect() as conn:
                openai_proxy_enabled = bool(
                    read_system_setting(
                        conn,
                        "mobile.ai.openai.proxyEnabled",
                        False,
                    )
                )
                openai_proxy_url = str(
                    read_system_setting(
                        conn,
                        "mobile.ai.openai.proxyUrl",
                        "",
                    )
                    or ""
                ).strip()
            if openai_proxy_enabled:
                normalized_proxy_url = normalize_mobile_ai_proxy_url(openai_proxy_url)
                if not normalized_proxy_url:
                    raise HTTPException(
                        status_code=500,
                        detail="OpenAI已启用独立代理，但代理地址为空",
                    )
                request_kwargs["proxies"] = {
                    "http": normalized_proxy_url,
                    "https": normalized_proxy_url,
                }
        except HTTPException:
            raise
        except Exception as exc:
            print(
                "[OpenHisAssistant][OpenAI][GM] 读取独立代理配置失败："
                + repr(exc)
            )

    try:
        response = DIRECT_HTTP.post(
            body.url,
            headers=headers,
            data=body.data or "",
            timeout=timeout_seconds,
            stream=bool(body.stream),
            **request_kwargs,
        )
    except requests.Timeout:
        return JSONResponse(
            status_code=504,
            content={
                "ok": False,
                "timeout": True,
                "status": 0,
                "responseText": "",
                "error": "服务器访问" + ai_label + "超时",
            },
        )
    except requests.RequestException as exc:
        print(
            "[OpenHisAssistant][" + ai_label + "][GM] 请求失败："
            + repr(exc)
        )
        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "status": 0,
                "responseText": "",
                "error": "服务器访问" + ai_label + "失败：" + str(exc),
            },
        )

    if body.stream:
        content_type = str(
            response.headers.get("Content-Type") or "text/event-stream"
        )

        def iter_upstream():
            try:
                for chunk in response.iter_content(chunk_size=128):
                    if chunk:
                        yield chunk
            finally:
                response.close()

        relay_headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-OHA-GM-AI-Provider": ai_provider,
        }

        return StreamingResponse(
            iter_upstream(),
            status_code=response.status_code,
            media_type=content_type.split(";", 1)[0].strip() or "text/event-stream",
            headers=relay_headers,
        )

    return {
        "ok": True,
        "status": response.status_code,
        "statusText": str(response.reason or ""),
        "responseText": response.text,
        "responseHeaders": dict(response.headers),
        "finalUrl": str(response.url or body.url),
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
