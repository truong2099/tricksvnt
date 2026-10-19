import http.server
import os
import re
import urllib.parse

PORT = 8088
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class NanLuxHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        if path in ('/notepad', '/notepad/'):
            self.path = '/notepad.html'
            return super().do_GET()
            
        if path in ('/tool/notepad', '/tool/notepad/'):
            self.path = '/tool/notepad/index.html'
            return super().do_GET()

        if path in ('/shortcut-library', '/shortcut-library/', '/phim-tat', '/phim-tat/', '/phimtat', '/phimtat/'):
            self.path = '/phim-tat.html'
            return super().do_GET()

        clean_routes = {
            '/huong-dan-nhan-phim-tat': '/huong-dan-nhan-phim-tat.html',
            '/gioi-thieu': '/gioi-thieu.html',
            '/dieu-khoan-su-dung': '/dieu-khoan-su-dung.html',
            '/chinh-sach-quyen-rieng-tu': '/chinh-sach-quyen-rieng-tu.html'
        }
        stripped_path = path.rstrip('/')
        if stripped_path in clean_routes:
            self.path = clean_routes[stripped_path]
            return super().do_GET()

        # Match /tool/note/<id> and route to /tool/note/index.html
        note_match = re.match(r'^/tool/note/([a-zA-Z0-9_-]+)/?$', path)
        if note_match:
            sub = note_match.group(1)
            target_file = os.path.join(DIRECTORY, 'tool', 'note', sub)
            if sub != 'index.html' and not os.path.isfile(target_file):
                query = parsed.query or f'id={sub}'
                self.path = f'/tool/note/index.html?{query}'
                return super().do_GET()
        return super().do_GET()

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ('/notepad', '/notepad/'):
            self.path = '/notepad.html'
            return super().do_HEAD()
            
        if path in ('/tool/notepad', '/tool/notepad/'):
            self.path = '/tool/notepad/index.html'
            return super().do_HEAD()

        if path in ('/shortcut-library', '/shortcut-library/', '/phim-tat', '/phim-tat/', '/phimtat', '/phimtat/'):
            self.path = '/phim-tat.html'
            return super().do_HEAD()

        note_match = re.match(r'^/tool/note/([a-zA-Z0-9_-]+)/?$', path)
        if note_match:
            sub = note_match.group(1)
            target_file = os.path.join(DIRECTORY, 'tool', 'note', sub)
            if sub != 'index.html' and not os.path.isfile(target_file):
                query = parsed.query or f'id={sub}'
                self.path = f'/tool/note/index.html?{query}'
                return super().do_HEAD()
        return super().do_HEAD()

if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(("", PORT), NanLuxHandler)
    server.daemon_threads = True
    print(f"NanLux Threaded Server running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
