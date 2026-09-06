"""本地预览服务 —— 只做两件事:出 UTF-8 头、禁缓存。

out/ 里的页面是按 artifact 的形状生成的:没有 <html>/<head>,也就没有
<meta charset>。artifact 那边编码由外层骨架提供,本地直接开就没人声明,
浏览器只能猜,中文全成乱码。所以这里在 HTTP 头里补 charset。

no-store 是为了「改完刷新就是新的」——不用管浏览器缓存。

    python3 serve.py        # http://127.0.0.1:8977/chat-panel-next.html
"""
import functools
import http.server
import pathlib

# 上一级,也就是 docs/design/ —— 两份生成好的页面就在那里。
DIRECTORY = str(pathlib.Path(__file__).resolve().parent.parent)
PORT = 8977
TEXTUAL = {'text/html', 'text/css', 'text/javascript', 'application/javascript', 'image/svg+xml'}


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        kind = super().guess_type(path)
        return f'{kind}; charset=utf-8' if kind in TEXTUAL else kind

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


# 多线程:单线程的 TCPServer 上一个连接没释放就会把后续请求全堵住,
# 页面一大(现在 1MB+)特别容易撞上。
http.server.ThreadingHTTPServer.allow_reuse_address = True
http.server.ThreadingHTTPServer.daemon_threads = True
with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=DIRECTORY)) as httpd:
    print(f'serving {DIRECTORY} at http://127.0.0.1:{PORT}')
    httpd.serve_forever()
