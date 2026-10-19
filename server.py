import http.server
import socketserver
import os
import re
import mimetypes

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_GET(self):
        range_header = self.headers.get('Range')
        if not range_header:
            return super().do_GET()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().do_GET()

        match = re.match(r'^bytes=(\d*)-(\d*)$', range_header.strip())
        if not match:
            return super().do_GET()

        file_size = os.path.getsize(path)
        start_str, end_str = match.groups()

        if start_str and end_str:
            start = int(start_str)
            end = int(end_str)
        elif start_str:
            start = int(start_str)
            end = file_size - 1
        elif end_str:
            start = file_size - int(end_str)
            end = file_size - 1
        else:
            start = 0
            end = file_size - 1

        if start >= file_size or end >= file_size or start > end:
            self.send_response(416, "Requested Range Not Satisfiable")
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.end_headers()
            return

        content_length = (end - start) + 1
        mime_type, _ = mimetypes.guess_type(path)
        if not mime_type:
            mime_type = "application/octet-stream"

        self.send_response(206, "Partial Content")
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(content_length))
        self.end_headers()

        try:
            with open(path, 'rb') as f:
                f.seek(start)
                bytes_to_send = content_length
                buf_size = 64 * 1024
                while bytes_to_send > 0:
                    read_size = min(buf_size, bytes_to_send)
                    chunk = f.read(read_size)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    bytes_to_send -= len(chunk)
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError):
            pass

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    with ThreadedTCPServer(("", PORT), RangeHTTPRequestHandler) as httpd:
        print(f"Serving at port {PORT} with Range Support")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
