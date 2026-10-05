import http.server
import socketserver

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

PORT = 3000
with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
    print("Serving at port", PORT)
    httpd.serve_forever()
