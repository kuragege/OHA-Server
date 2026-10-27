from __future__ import annotations

import json
import sqlite3
import sys
import time
from pathlib import Path

from app import (
    ALLOWED_ROLES,
    BASE_DIR,
    CONFIG,
    db_connect,
    enabled_admin_count,
    load_manifest,
    manifest_modules,
    module_sha256,
    module_user_controllable,
    module_role_allowed,
    password_encode,
)

USAGE = r"""
OpenHisAssistant Server Admin

用法：

  python server_admin.py list-users
  python server_admin.py add-user 用户名 密码 [role]
  python server_admin.py reset-password 用户名 新密码
  python server_admin.py set-role 用户名 admin|doctor|nurse
  python server_admin.py enable 用户名
  python server_admin.py disable 用户名
  python server_admin.py revoke-sessions 用户名
  python server_admin.py delete-user 用户名
  python server_admin.py list-modules
  python server_admin.py set-module 用户名 模块名 on|off
  python server_admin.py refresh-module-hashes
  # 模块的新增/编辑/备份/恢复/删除建议直接使用 http://服务器:8088/admin 的“模块管理”

role 默认 doctor，可使用：
  admin
  doctor
  nurse
"""


def refresh_module_hashes() -> None:
    manifest = load_manifest()
    modules = manifest.get("modules", [])

    for item in modules:
        if not item.get("file"):
            continue
        item["hash"] = module_sha256(item)

    manifest["schemaVersion"] = max(3, int(manifest.get("schemaVersion") or 0))

    manifest_rel = str(CONFIG.get("module_manifest") or "modules/manifest.json")
    path = (BASE_DIR / manifest_rel).resolve()
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print("已刷新模块 Hash：")
    for item in modules:
        print(" ", item.get("name", "?"), item.get("version", ""), item.get("hash", ""))


def list_users() -> None:
    now = int(time.time())
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
            (now,),
        ).fetchall()

    print("ID\t用户名\t角色\t状态\t活跃会话")
    for row in rows:
        print(
            f"{row['id']}\t{row['username']}\t{row['role']}\t"
            f"{'启用' if row['enabled'] else '禁用'}\t{row['active_sessions']}"
        )



def list_modules() -> None:
    print("模块名\t显示名\t版本\t全局\t用户可控\t角色")
    for item in manifest_modules():
        print(
            f"{item.get('name','')}\t{item.get('displayName', item.get('name',''))}\t"
            f"{item.get('version','')}\t{'启用' if item.get('enabled', False) else '禁用'}\t"
            f"{'是' if module_user_controllable(item) else '否'}\t{','.join(item.get('roles') or [])}"
        )


def set_user_module(username: str, module_name: str, enabled: bool) -> None:
    item = next((x for x in manifest_modules() if str(x.get('name') or '') == module_name), None)
    if not item:
        raise SystemExit("模块不存在：" + module_name)
    if not module_user_controllable(item):
        raise SystemExit("该模块属于系统运行时，不能按用户关闭：" + module_name)

    now = int(time.time())
    with db_connect() as conn:
        target = find_user(conn, username)
        if enabled and not module_role_allowed(item, str(target['role'])):
            raise SystemExit("该用户角色不允许启用此脚本")
        conn.execute(
            """
            INSERT INTO user_module_permissions(user_id, module_name, enabled, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(user_id, module_name) DO UPDATE SET
                enabled = excluded.enabled,
                updated_at = excluded.updated_at
            """,
            (target['id'], module_name, 1 if enabled else 0, now),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (target['id'],))
        conn.commit()
    print(("已启用脚本：" if enabled else "已关闭脚本：") + username + " / " + module_name + "；旧会话已清除")

def require_role(role: str) -> str:
    role = (role or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise SystemExit("role 仅允许：admin / doctor / nurse")
    return role


def find_user(conn, username: str):
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        raise SystemExit("用户不存在：" + username)
    return row


def ensure_cli_admin_survives(conn, target, will_remain_enabled_admin: bool) -> None:
    if str(target["role"]).lower() == "admin" and int(target["enabled"]):
        if not will_remain_enabled_admin and enabled_admin_count(conn) <= 1:
            raise SystemExit("至少必须保留一个已启用的管理员账号")


def main():
    if len(sys.argv) < 2:
        print(USAGE)
        raise SystemExit(1)

    action = sys.argv[1].strip().lower()

    if action == "refresh-module-hashes":
        refresh_module_hashes()
        return

    if action == "list-users":
        list_users()
        return

    if action == "list-modules":
        list_modules()
        return

    if action == "set-module":
        if len(sys.argv) < 5:
            print(USAGE)
            raise SystemExit(1)
        state = sys.argv[4].strip().lower()
        if state not in {"on", "off"}:
            raise SystemExit("脚本状态仅允许 on / off")
        set_user_module(sys.argv[2].strip(), sys.argv[3].strip(), state == "on")
        return

    if len(sys.argv) < 3:
        print(USAGE)
        raise SystemExit(1)

    username = sys.argv[2].strip()
    if not username:
        raise SystemExit("用户名不能为空")
    if "/" in username or "\\" in username:
        raise SystemExit("用户名不能包含 / 或 \\")
    now = int(time.time())

    with db_connect() as conn:
        if action == "add-user":
            if len(sys.argv) < 4:
                print(USAGE)
                raise SystemExit(1)
            password = sys.argv[3]
            if len(password) < 6:
                raise SystemExit("密码至少 6 个字符")
            role = require_role(sys.argv[4] if len(sys.argv) >= 5 else "doctor")
            try:
                conn.execute(
                    """
                    INSERT INTO users(
                        username, password_hash, role,
                        enabled, created_at, updated_at
                    )
                    VALUES(?, ?, ?, 1, ?, ?)
                    """,
                    (username, password_encode(password), role, now, now),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                raise SystemExit("用户名已存在：" + username)
            print("已添加用户：", username, "role=", role)
            return

        if action == "reset-password":
            if len(sys.argv) < 4:
                print(USAGE)
                raise SystemExit(1)
            password = sys.argv[3]
            if len(password) < 6:
                raise SystemExit("密码至少 6 个字符")
            target = find_user(conn, username)
            conn.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (password_encode(password), now, target["id"]),
            )
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
            conn.commit()
            print("密码已重置，旧会话已清除：", username)
            return

        if action == "set-role":
            if len(sys.argv) < 4:
                print(USAGE)
                raise SystemExit(1)
            role = require_role(sys.argv[3])
            target = find_user(conn, username)
            ensure_cli_admin_survives(
                conn,
                target,
                will_remain_enabled_admin=(role == "admin" and bool(target["enabled"])),
            )
            conn.execute(
                "UPDATE users SET role = ?, updated_at = ? WHERE id = ?",
                (role, now, target["id"]),
            )
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
            conn.commit()
            print("角色已修改，旧会话已清除：", username, "role=", role)
            return

        if action in {"enable", "disable"}:
            enabled = 1 if action == "enable" else 0
            target = find_user(conn, username)
            ensure_cli_admin_survives(
                conn,
                target,
                will_remain_enabled_admin=(
                    bool(enabled) and str(target["role"]).lower() == "admin"
                ),
            )
            conn.execute(
                "UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?",
                (enabled, now, target["id"]),
            )
            if not enabled:
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
            conn.commit()
            print(("已启用：" if enabled else "已禁用：") + username)
            return

        if action == "revoke-sessions":
            target = find_user(conn, username)
            cur = conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
            conn.commit()
            print("已撤销会话：", username, "数量=", cur.rowcount)
            return

        if action == "delete-user":
            target = find_user(conn, username)
            ensure_cli_admin_survives(conn, target, will_remain_enabled_admin=False)
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (target["id"],))
            conn.execute("DELETE FROM user_module_permissions WHERE user_id = ?", (target["id"],))
            conn.execute("DELETE FROM users WHERE id = ?", (target["id"],))
            conn.commit()
            print("已删除用户：", username)
            return

    print(USAGE)
    raise SystemExit(1)


if __name__ == "__main__":
    main()
