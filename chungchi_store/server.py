import http.server
import json
import os
import sqlite3
import hashlib
import secrets
import urllib.request
import urllib.error
import urllib.parse
import socketserver
import re
from datetime import datetime

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(DIRECTORY, "store.db")
API_BASE = "https://chungchi.store/api/v1"
DEFAULT_API_KEY = "ccs_live_F2CC107A6492.M7xkyg6F045mcVw4gcQ7VTtU_yr-Y3lH04ATdfPY3vM"

def hash_pw(password):
    return hashlib.sha256(("ccs_salt_2026_" + password).encode("utf-8")).hexdigest()

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                balance INTEGER DEFAULT 0,
                api_token TEXT,
                created_at TEXT
            )
        """)
        try:
            conn.execute("ALTER TABLE users ADD COLUMN api_token TEXT")
        except sqlite3.OperationalError:
            pass
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                order_code TEXT UNIQUE NOT NULL,
                plan_id INTEGER,
                title TEXT,
                amount INTEGER,
                udid TEXT,
                device TEXT,
                p12_password TEXT,
                status TEXT,
                download_url TEXT,
                created_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                device_name TEXT,
                udid TEXT NOT NULL,
                model TEXT,
                created_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS deposits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                deposit_code TEXT UNIQUE NOT NULL,
                amount INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TEXT
            )
        """)

        # Ensure official account exists with real balance 0
        cur = conn.execute("SELECT id FROM users WHERE email = 'vungoctruong22@gmail.com'")
        if not cur.fetchone():
            default_token = "cn_live_" + secrets.token_hex(16)
            conn.execute("""
                INSERT INTO users (username, email, password_hash, balance, api_token, created_at)
                VALUES (?, ?, ?, 0, ?, ?)
            """, ("vungoctruong22", "vungoctruong22@gmail.com", hash_pw("@Gmail2k9"), default_token, datetime.now().isoformat()))
        conn.commit()

init_db()

class CertNewHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Session-Token")

    def _send_json(self, status, payload):
        self.send_response(status)
        self._send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def _get_current_user(self):
        auth_header = self.headers.get("X-Session-Token") or self.headers.get("Authorization")
        if not auth_header:
            return None
        token = auth_header.replace("Bearer ", "").strip()
        with get_db() as conn:
            cur = conn.execute("""
                SELECT u.id, u.username, u.email, u.balance, u.api_token, u.created_at
                FROM users u
                JOIN tokens t ON u.id = t.user_id
                WHERE t.token = ?
            """, (token,))
            row = cur.fetchone()
            if row:
                u = dict(row)
                if not u.get("api_token"):
                    new_tok = "cn_live_" + secrets.token_hex(16)
                    conn.execute("UPDATE users SET api_token = ? WHERE id = ?", (new_tok, u["id"]))
                    conn.commit()
                    u["api_token"] = new_tok
                return u
        return None

    def _read_body_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        try:
            raw = self.rfile.read(length).decode("utf-8")
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # User profile
        if path == "/api/auth/me":
            user = self._get_current_user()
            if not user:
                return self._send_json(401, {"success": False, "error": "Chưa đăng nhập hoặc phiên đã hết hạn."})
            return self._send_json(200, {"success": True, "user": user})

        # Dashboard stats
        if path == "/api/user/stats":
            user = self._get_current_user()
            if not user:
                return self._send_json(401, {"success": False, "error": "Yêu cầu đăng nhập."})
            with get_db() as conn:
                order_count = conn.execute("SELECT COUNT(*) FROM orders WHERE user_id = ?", (user["id"],)).fetchone()[0]
                device_count = conn.execute("SELECT COUNT(DISTINCT udid) FROM orders WHERE user_id = ?", (user["id"],)).fetchone()[0]
                active_certs = conn.execute("SELECT COUNT(*) FROM orders WHERE user_id = ? AND status IN ('completed', 'active')", (user["id"],)).fetchone()[0]
            return self._send_json(200, {
                "success": True,
                "stats": {
                    "balance": user["balance"],
                    "order_count": order_count,
                    "device_count": device_count,
                    "active_certs": active_certs,
                    "api_token": user.get("api_token", "")
                }
            })

        # User orders
        if path == "/api/user/orders":
            user = self._get_current_user()
            if not user:
                return self._send_json(401, {"success": False, "error": "Yêu cầu đăng nhập."})
            with get_db() as conn:
                cur = conn.execute("""
                    SELECT order_code, plan_id, title, amount, udid, device, p12_password, status, download_url, created_at
                    FROM orders WHERE user_id = ? ORDER BY id DESC
                """, (user["id"],))
                orders = [dict(r) for r in cur.fetchall()]
            return self._send_json(200, {"success": True, "orders": orders})

        # User devices
        if path == "/api/user/devices":
            user = self._get_current_user()
            if not user:
                return self._send_json(401, {"success": False, "error": "Yêu cầu đăng nhập."})
            with get_db() as conn:
                cur = conn.execute("""
                    SELECT DISTINCT udid, device AS model, title AS plan_name, created_at, status
                    FROM orders WHERE user_id = ? ORDER BY id DESC
                """, (user["id"],))
                devices = [dict(r) for r in cur.fetchall()]
            return self._send_json(200, {"success": True, "devices": devices})

        # Proxy to upstream chungchi.store
        if path.startswith("/api/proxy/"):
            target_endpoint = path.replace("/api/proxy", "")
            return self._handle_proxy("GET", target_endpoint, query=parsed.query)

        # Mobileconfig profile for UDID detection
        if path == "/udid/profile.mobileconfig":
            return self._handle_mobileconfig()

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._read_body_json()

        # Logout
        if path == "/api/auth/logout":
            auth_header = self.headers.get("X-Session-Token") or self.headers.get("Authorization")
            if auth_header:
                token = auth_header.replace("Bearer ", "").strip()
                with get_db() as conn:
                    conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
                    conn.commit()
            return self._send_json(200, {"success": True, "message": "Đã đăng xuất thành công."})

        # Register
        if path == "/api/auth/register":
            username = body.get("username", "").strip()
            email = body.get("email", "").strip().lower()
            password = body.get("password", "").strip()

            if not username or len(username) < 3:
                return self._send_json(400, {"success": False, "error": "Tên đăng nhập phải từ 3 ký tự trở lên."})
            if not email or "@" not in email:
                return self._send_json(400, {"success": False, "error": "Email không hợp lệ."})
            if not password or len(password) < 6:
                return self._send_json(400, {"success": False, "error": "Mật khẩu phải từ 6 ký tự trở lên."})

            try:
                api_token = "cn_live_" + secrets.token_hex(16)
                with get_db() as conn:
                    cur = conn.execute("""
                        INSERT INTO users (username, email, password_hash, balance, api_token, created_at)
                        VALUES (?, ?, ?, 0, ?, ?)
                    """, (username, email, hash_pw(password), api_token, datetime.now().isoformat()))
                    user_id = cur.lastrowid
                    token = secrets.token_hex(24)
                    conn.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
                                 (token, user_id, datetime.now().isoformat()))
                    conn.commit()
                return self._send_json(200, {
                    "success": True,
                    "token": token,
                    "user": {"id": user_id, "username": username, "email": email, "balance": 0, "api_token": api_token}
                })
            except sqlite3.IntegrityError:
                return self._send_json(400, {"success": False, "error": "Tên đăng nhập hoặc email đã được sử dụng."})

        # Login
        if path == "/api/auth/login":
            login_id = body.get("username", "").strip()
            password = body.get("password", "").strip()

            with get_db() as conn:
                cur = conn.execute("""
                    SELECT id, username, email, balance, api_token, password_hash FROM users
                    WHERE username = ? OR email = ?
                """, (login_id, login_id.lower()))
                user = cur.fetchone()

                if not user or user["password_hash"] != hash_pw(password):
                    return self._send_json(400, {"success": False, "error": "Tài khoản hoặc mật khẩu không chính xác."})

                token = secrets.token_hex(24)
                conn.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
                             (token, user["id"], datetime.now().isoformat()))
                conn.commit()

            return self._send_json(200, {
                "success": True,
                "token": token,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "balance": user["balance"],
                    "api_token": user["api_token"]
                }
            })

        # Change Password
        if path == "/api/auth/change-password":
            user = self._get_current_user()
            if not user:
                return self._send_json(401, {"success": False, "error": "Yêu cầu đăng nhập."})

            old_pw = body.get("old_password", "")
            new_pw = body.get("new_password", "")

            if len(new_pw) < 6:
                return self._send_json(400, {"success": False, "error": "Mật khẩu mới phải từ 6 ký tự trở lên."})

            with get_db() as conn:
                cur = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],))
                u = cur.fetchone()
                if not u or u["password_hash"] != hash_pw(old_pw):
                    return self._send_json(400, {"success": False, "error": "Mật khẩu hiện tại không đúng."})

                conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_pw(new_pw), user["id"]))
                conn.commit()

            return self._send_json(200, {"success": True, "message": "Đổi mật khẩu thành công!"})

        # Create Deposit
        if path == "/api/user/deposit":
            user = self._get_current_user()
            if not user:
                return self._send_json(401, {"success": False, "error": "Yêu cầu đăng nhập để nạp tiền."})

            amount = int(body.get("amount", 50000))
            if amount < 10000:
                return self._send_json(400, {"success": False, "error": "Số tiền nạp tối thiểu là 10.000đ."})

            deposit_code = "NAP" + secrets.token_hex(3).upper()
            with get_db() as conn:
                conn.execute("""
                    INSERT INTO deposits (user_id, deposit_code, amount, status, created_at)
                    VALUES (?, ?, ?, 'pending', ?)
                """, (user["id"], deposit_code, amount, datetime.now().isoformat()))
                conn.commit()

            return self._send_json(200, {
                "success": True,
                "deposit_code": deposit_code,
                "amount": amount,
                "bank": {
                    "bankName": "MB Bank (Ngân Hàng Quân Đội)",
                    "accountNumber": "0968389378",
                    "accountHolder": "CHUNG CHI STORE",
                    "bin": "970422",
                    "transferContent": deposit_code
                }
            })

        # Confirm Deposit
        if path == "/api/user/confirm-deposit":
            user = self._get_current_user()
            if not user:
                return self._send_json(401, {"success": False, "error": "Yêu cầu đăng nhập."})

            deposit_code = body.get("deposit_code")
            with get_db() as conn:
                cur = conn.execute("SELECT id, amount, status FROM deposits WHERE deposit_code = ? AND user_id = ?",
                                   (deposit_code, user["id"]))
                dep = cur.fetchone()
                if not dep:
                    return self._send_json(404, {"success": False, "error": "Không tìm thấy yêu cầu nạp tiền."})

                if dep["status"] != "completed":
                    conn.execute("UPDATE deposits SET status = 'completed' WHERE id = ?", (dep["id"],))
                    conn.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (dep["amount"], user["id"]))
                    conn.commit()

                cur_user = conn.execute("SELECT balance FROM users WHERE id = ?", (user["id"],)).fetchone()
                new_balance = cur_user["balance"]

            return self._send_json(200, {
                "success": True,
                "message": f"Nạp tiền thành công! Đã cộng {dep['amount']:,}đ vào ví.",
                "new_balance": new_balance
            })

        # Orders Creation via Proxy
        if path == "/api/proxy/orders":
            user = self._get_current_user()
            pay_with_balance = body.get("pay_with_balance", False)

            api_key = self.headers.get("Authorization", f"Bearer {DEFAULT_API_KEY}")
            upstream_url = f"{API_BASE}/orders"
            payload_bytes = json.dumps({
                "plan_id": body.get("plan_id"),
                "udid": body.get("udid"),
                "device": body.get("device", "iphone"),
                "p12_password": body.get("p12_password", "1")
            }).encode("utf-8")

            req = urllib.request.Request(upstream_url, data=payload_bytes, method="POST")
            req.add_header("Authorization", api_key)
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "CertNew/1.0 (Windows NT 10.0; Win64; x64)")

            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    resp_json = json.loads(resp.read().decode("utf-8"))
                    order_data = resp_json.get("data", {}).get("order", {})

                    if user and order_data.get("order_code"):
                        order_amount = int(order_data.get("amount", 0))
                        with get_db() as conn:
                            if pay_with_balance:
                                if user["balance"] < order_amount:
                                    return self._send_json(400, {"success": False, "error": "Số dư ví không đủ để thanh toán gói này."})
                                conn.execute("UPDATE users SET balance = balance - ? WHERE id = ?", (order_amount, user["id"]))

                            conn.execute("""
                                INSERT INTO orders (user_id, order_code, plan_id, title, amount, udid, device, p12_password, status, download_url, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                user["id"],
                                order_data.get("order_code"),
                                order_data.get("plan_id"),
                                order_data.get("title", "Chứng chỉ Apple"),
                                order_amount,
                                body.get("udid"),
                                body.get("device", "iphone"),
                                body.get("p12_password", "1"),
                                order_data.get("status", "pending"),
                                order_data.get("download_url", ""),
                                datetime.now().isoformat()
                            ))
                            conn.commit()

                    self.send_response(resp.status)
                    self._send_cors()
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps(resp_json, ensure_ascii=False).encode("utf-8"))
                    return
            except urllib.error.HTTPError as e:
                err_data = e.read()
                self.send_response(e.code)
                self._send_cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(err_data if err_data else json.dumps({"error": str(e)}).encode())
                return
            except Exception as e:
                return self._send_json(500, {"error": f"Order proxy failed: {str(e)}"})

        # Other POST proxy endpoints
        if path.startswith("/api/proxy/"):
            target_endpoint = path.replace("/api/proxy", "")
            return self._handle_proxy("POST", target_endpoint, data=json.dumps(body).encode("utf-8"))

        # UDID receive webhook
        if path == "/udid/receive":
            length = int(self.headers.get("Content-Length", 0))
            body_data = self.rfile.read(length).decode("utf-8", errors="ignore")
            udid_match = re.search(r"<key>UDID</key>\s*<string>([^<]+)</string>", body_data)
            udid = udid_match.group(1) if udid_match else "UNKNOWN"

            self.send_response(301)
            self.send_header("Location", f"/#udid?udid={udid}")
            self.end_headers()
            return

        self._send_json(404, {"error": "Not Found"})

    def _handle_proxy(self, method, endpoint, data=None, query=None):
        api_key = self.headers.get("Authorization", f"Bearer {DEFAULT_API_KEY}")
        url = f"{API_BASE}{endpoint}"
        if query:
            url += f"?{query}"

        req = urllib.request.Request(url, data=data if method in ("POST", "PUT") else None, method=method)
        req.add_header("Authorization", api_key)
        req.add_header("User-Agent", "CertNew/1.0 (Windows NT 10.0; Win64; x64)")
        req.add_header("Accept", "application/json")
        if data:
            req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_data = resp.read()
                self.send_response(resp.status)
                self._send_cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(resp_data)
        except urllib.error.HTTPError as e:
            err_data = e.read()
            self.send_response(e.code)
            self._send_cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(err_data if err_data else json.dumps({"error": str(e)}).encode())
        except Exception as e:
            self.send_response(500)
            self._send_cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Proxy request failed: {str(e)}"}).encode())

    def _handle_mobileconfig(self):
        host = self.headers.get("Host", f"localhost:{PORT}")
        proto = "https" if self.headers.get("X-Forwarded-Proto") == "https" else "http"
        config = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <dict>
        <key>URL</key>
        <string>{proto}://{host}/udid/receive</string>
        <key>DeviceAttributes</key>
        <array>
            <string>UDID</string>
            <string>IMEI</string>
            <string>ICCID</string>
            <string>VERSION</string>
            <string>PRODUCT</string>
        </array>
    </dict>
    <key>PayloadOrganization</key>
    <string>Cert New</string>
    <key>PayloadDisplayName</key>
    <string>Lấy mã UDID thiết bị - Cert New</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>PayloadUUID</key>
    <string>9FE16ACD-761B-4523-8B3B-6F2913A78AC5</string>
    <key>PayloadIdentifier</key>
    <string>com.certnew.udid</string>
    <key>PayloadDescription</key>
    <string>Cấu hình hỗ trợ đọc mã UDID thiết bị iPhone/iPad an toàn phục vụ cấp chứng chỉ Apple.</string>
    <key>PayloadType</key>
    <string>Profile Service</string>
</dict>
</plist>"""
        self.send_response(200)
        self.send_header("Content-Type", "application/x-apple-aspen-config; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="CertNew_UDID.mobileconfig"')
        self.end_headers()
        self.wfile.write(config.encode("utf-8"))

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def run():
    with ThreadingHTTPServer(("", PORT), CertNewHandler) as httpd:
        print(f"=====================================================")
        print(f" Cert New - Apple Certificate & Reseller Platform")
        print(f" Server running at: http://localhost:{PORT}")
        print(f" Upstream API: {API_BASE}")
        print(f"=====================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    run()
