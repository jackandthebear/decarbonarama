#!/usr/bin/env python3
"""
Submit Decarbonarma URLs to IndexNow — instantly notifies Bing, Yandex, Naver
and Seznam that pages are new or changed. ChatGPT search retrieves via Bing's
index, so this is the fastest route into AI search results.

  python3 scripts/indexnow.py                              # every URL in sitemap.xml
  python3 scripts/indexnow.py articles/foo.html about.html  # just these

Run once after each deploy. Safe to re-run; IndexNow ignores duplicates.
"""
import json, sys, re, os, urllib.request, urllib.error

KEY = "381d0f7cc5c84d3f85a5131cb4d89733a4eb94c4"
HOST = "decarbonarma.com"
KEY_LOCATION = "https://%s/%s.txt" % (HOST, KEY)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def urls_from_sitemap():
    with open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8") as fh:
        return re.findall(r"<loc>(.*?)</loc>", fh.read())


def main():
    args = sys.argv[1:]
    if args:
        urls = [a if a.startswith("http") else "https://%s/%s" % (HOST, a.lstrip("/"))
                for a in args]
    else:
        urls = urls_from_sitemap()

    if not urls:
        print("no URLs to submit")
        return 1

    payload = json.dumps({
        "host": HOST,
        "key": KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.indexnow.org/IndexNow",
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception as e:
        print("request failed: %s" % e)
        return 1

    if code in (200, 202):
        print("submitted %d URLs to IndexNow (HTTP %d)" % (len(urls), code))
        return 0

    print("IndexNow returned HTTP %d for %d URLs" % (code, len(urls)))
    print("  403 = key file not reachable at %s" % KEY_LOCATION)
    print("  422 = URLs not on this host    429 = rate limited")
    return 1


if __name__ == "__main__":
    sys.exit(main())
