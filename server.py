"""Lokale server voor de zoekpagina: serveert web/ en stuurt zoekvragen door naar de rijkscollectie-index.

Het TriplyDB-token blijft hier aan de serverkant; de browser ziet het nooit.

    python server.py            # http://127.0.0.1:8765
    python server.py --port 9000
"""
import argparse
import json
import os
import re
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from consistentietest import get_token

ES_URL = "https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/rijkscollectie-rce/services/rijkscollectie-rce-elastic/_search"
WEB = Path(__file__).parent / "web"
MAX_BODY = 64 * 1024


def read_security_headers():
    """Dezelfde headers als online: gelezen uit SECURITY_HEADERS in src/worker.js, zodat CSP-fouten ook lokaal zichtbaar zijn."""
    src = (Path(__file__).parent / "src" / "worker.js").read_text(encoding="utf-8")
    block = re.search(r"const SECURITY_HEADERS = \{(.*?)\n\};", src, re.S).group(1)
    return dict(re.findall(r"""^\s*'([\w-]+)':\s*["'](.*)["'],\s*$""", block, re.M))


SECURITY_HEADERS = read_security_headers()


class Handler(SimpleHTTPRequestHandler):
    token = None

    def do_POST(self):
        if self.path != "/api/search":
            return self.send_error(404)
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= MAX_BODY:
            return self.send_error(413)
        body = self.rfile.read(n)
        try:
            json.loads(body)
        except ValueError:
            return self.send_error(400, "Geen geldige JSON")

        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(ES_URL, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                status, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, data = e.code, e.read()
        except urllib.error.URLError as e:
            status, data = 502, json.dumps({"message": f"Index niet bereikbaar: {e.reason}"}).encode()

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT") or 8765))
    a = ap.parse_args()
    Handler.token = get_token()
    if not Handler.token:
        print("Let op: geen TRIPLY_TOKEN gevonden; de interne index zal 'Not found or unauthorized' geven.")
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), partial(Handler, directory=str(WEB)))
    print(f"Zoekpagina: http://127.0.0.1:{a.port}  (token: {'ja' if Handler.token else 'nee'})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
