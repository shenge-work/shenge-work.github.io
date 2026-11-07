#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_kb.py — 由 data/site-data.json 生成 AI 简历助手的知识库（M1）

设计要点
  1. 唯一真源是 data/site-data.json；本脚本只做「结构化切块 + 向量化 + 量化落盘」。
  2. 默认 provider=tfidf：纯标准库、零 API Key、结果确定可复现。
     查询侧用同一套分词与权重（vocab/idf 存在 kb-meta.json），因此检索全程不需要任何密钥。
  3. provider=zhipu 可切到语义向量（需 ZHIPU_API_KEY），接口契约不变。
  4. 隐私：contact 段落按字段白名单构造，手机号永不进入产物；收尾再全量断言一次。
  5. --check 幂等校验：重建结果与磁盘产物不一致则退出码 1，用于 CI 卡住「忘了重建」。

用法
  python3 scripts/build_kb.py                # 生成 knowledge/*
  python3 scripts/build_kb.py --check        # 只校验，不写盘
  python3 scripts/build_kb.py --report       # 打印切片清单
  python3 scripts/build_kb.py --provider zhipu --dim 1024
  python3 scripts/build_kb.py --sync-functions   # 同步一份到 functions/tencent/kb/
"""

import argparse
import hashlib
import html
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "site-data.json"
KB_DIR = ROOT / "knowledge"

MAX_CHUNK_CHARS = 300      # 单块正文上限（含标题前缀）
MAX_VOCAB = 1200           # tfidf 词表上限（稀疏存储，JSON 增量很小，宁多勿少）
ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings"
ZHIPU_MODEL = "embedding-3"

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t\r\f\v]+")
NL_RE = re.compile(r"\n{2,}")
CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
WORD_RE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9+#./]*")
SENT_RE = re.compile(r"[^。！？；\n]+[。！？；]?")

# 手机号 / 直拨链接：产物中绝不允许出现
PHONE_RES = [
    re.compile(r"\+?86[\s\-]?(?:1[3-9]\d)[\s\-]?\d{4}[\s\-]?\d{4}"),
    re.compile(r"\b1[3-9]\d{9}\b"),
    re.compile(r"\b\d{3}[\s\-]\d{4}[\s\-]\d{4}\b"),
]
TEL_HREF_RE = re.compile(r"tel:[^\s\"'<>]*", re.I)
PHONE_MASK = "[联系方式已隐藏，请通过邮箱联系]"


# ---------------------------------------------------------------- 文本清洗

def clean(s):
    """去标签、解实体、压空白。"""
    if not s:
        return ""
    s = TAG_RE.sub("", str(s))
    s = html.unescape(s)
    s = s.replace("\u00a0", " ")
    s = WS_RE.sub(" ", s)
    s = NL_RE.sub("\n", s)
    return s.strip()


def scrub(s):
    """兜底脱敏：命中手机号即替换，并抹掉 tel: 直拨链接。"""
    s = TEL_HREF_RE.sub("", s)
    for pat in PHONE_RES:
        s = pat.sub(PHONE_MASK, s)
    return s


def has_phone(s):
    s = TEL_HREF_RE.sub("", s)
    return any(pat.search(s) for pat in PHONE_RES)


# ---------------------------------------------------------------- 切片

def new_chunk(chunks, cid, section, title, body, url):
    """统一收口：加标题前缀、清洗、脱敏、长度断言。"""
    body = clean(body)
    if not body:
        return
    prefix = "【%s】" % title if title else ""
    text = scrub(prefix + body)
    if len(text) < 30:
        return
    chunks.append({
        "id": cid,
        "section": section,
        "title": title,
        "text": text,
        "url": url,
    })


def split_long(text, limit):
    """按中文句读切成不超过 limit 的片段；单句仍超长时按字符硬切。"""
    sents = [s.strip() for s in SENT_RE.findall(text) if s.strip()]
    out, buf = [], ""
    for s in sents:
        if len(s) > limit:
            if buf:
                out.append(buf)
                buf = ""
            for i in range(0, len(s), limit):
                out.append(s[i:i + limit])
            continue
        cand = (buf + " " + s).strip() if buf else s
        if len(cand) > limit and buf:
            out.append(buf)
            buf = s
        else:
            buf = cand
    if buf:
        out.append(buf)
    return out


def pack_points(chunks, cid_base, section, title, url, intro, points, tail=""):
    """把所有素材先按句拆成 <=limit 的单元，再聚成若干块；每块都带统一标题前缀，保证单块可独立召回。"""
    units = []
    for raw in [intro] + list(points) + [tail]:
        raw = clean(raw)
        if raw:
            units.extend(split_long(raw, MAX_CHUNK_CHARS))
    buf, seq = "", 0
    for u in units:
        candidate = (buf + " " + u).strip() if buf else u
        if len(candidate) > MAX_CHUNK_CHARS and buf:
            seq += 1
            new_chunk(chunks, "%s-%02d" % (cid_base, seq), section, title, buf, url)
            buf = u
        else:
            buf = candidate
    if buf:
        seq += 1
        new_chunk(chunks, "%s-%02d" % (cid_base, seq), section, title, buf, url)


def build_chunks(data):
    chunks = []

    # 1) 我是谁 / 求职意向
    hero, about, objective = data.get("hero", {}), data.get("about", {}), data.get("objective", {})
    me_title = "%s · %s" % (hero.get("nameCn", ""), hero.get("role", ""))
    me_parts = [hero.get("bio", "")]
    me_parts += about.get("paragraphs", [])
    objs = []
    for card in objective.get("cards", []):
        role = card.get("role") or card.get("roleSm") or ""
        objs.append("%s：%s %s" % (card.get("tag", ""), role, card.get("desc", "")))
    me_parts += objs
    me_body = clean(about.get("lead", "")) + " " + " ".join(clean(x) for x in me_parts)
    pack_points(chunks, "me", "about", me_title, "index.html#about", "", [me_body])

    # 2) 教育
    edu = data.get("education", {})
    main = edu.get("main", {})
    edu_title = "%s · %s（%s）" % (main.get("school", ""), main.get("major", ""), main.get("time", ""))
    edu_body = " ".join(clean(x) for x in main.get("notes", []))
    edu_body += " " + " ".join(clean("%s：%s" % (s.get("title", ""), s.get("text", "")))
                              for s in edu.get("sides", []))
    pack_points(chunks, "edu", "education", edu_title, "index.html#education", "", [edu_body])

    # 3) 工作经历
    for i, exp in enumerate(data.get("experience", []), 1):
        title = "%s｜%s（%s）" % (clean(exp.get("company", "")), clean(exp.get("role", "")),
                                clean(exp.get("time", "")))
        pack_points(chunks, "exp-%02d" % i, "experience", title, "index.html#experience",
                    "", exp.get("points", []))

    # 4) 项目作品
    for proj in data.get("projects", []):
        no = re.sub(r"[^0-9A-Za-z]", "", str(proj.get("no", ""))).lower() or "x"
        title = "%s %s｜%s（%s）" % (clean(proj.get("title", "")), clean(proj.get("titleEn", "")),
                                   clean(proj.get("company", "")), clean(proj.get("year", "")))
        intro = "%s %s" % (clean(proj.get("desc", "")), clean(proj.get("modalDesc", "")))
        stats = "；".join("%s %s" % (clean(s.get("v", "")), clean(s.get("s", "")))
                        for s in proj.get("stats", []))
        tail = ""
        if stats:
            tail += "量化结果：" + stats + "。"
        if proj.get("stack"):
            tail += "技术栈：" + clean(proj["stack"]) + "。"
        pack_points(chunks, "proj-%s" % no, "projects", title, "index.html#projects",
                    intro, proj.get("points", []), tail)

    # 5) 专业技能
    skills = data.get("skills", {})
    bars = "；".join("%s（自评 %s 分，满分 100）" % (clean(b.get("label", "")), b.get("pct", ""))
                    for b in skills.get("bars", []))
    pack_points(chunks, "skills", "skills", "专业技能", "index.html#skills",
                "", [bars, clean(skills.get("note", ""))])

    # 6) 工具箱
    tools = "、".join(clean(t.get("text", "")) for t in skills.get("toolbox", []))
    pack_points(chunks, "toolbox", "skills", "工具箱 TOOLBOX", "index.html#skills",
                "", ["常用工具清单：" + tools])

    # 7) 证书与荣誉
    aw = data.get("awards", {})
    certs = "；".join("%s（%s）" % (clean(c.get("title", "")), clean(c.get("sub", "")))
                    for c in aw.get("certs", []))
    pack_points(chunks, "awards", "awards", "获奖与证书", "index.html#awards", "", [certs])

    # 8) 联系方式 —— 字段白名单：只要 EMAIL / GITHUB / BASE，TEL 永不入库
    contact = data.get("contact", {})
    allowed, blocked = [], []
    for card in contact.get("cards", []):
        label = clean(card.get("label", "")).upper()
        value = clean(card.get("value", ""))
        if "TEL" in label or "电话" in label or value.startswith("+"):
            blocked.append(clean(card.get("label", "")))
            continue
        allowed.append("%s：%s" % (clean(card.get("label", "")), value))
    contact_body = "；".join(allowed)
    contact_body += "。如需电话沟通或约面试，请先发邮件，他会回复提供。"
    pack_points(chunks, "contact", "contact", "联系方式", "index.html#contact", "", [contact_body])

    return chunks, blocked


# ---------------------------------------------------------------- 分词与向量

def tokenize(text):
    """中文取字 bigram，英文/技术词取整词（加 # 前缀避免与中文 bigram 撞名）。"""
    out = []
    low = text.lower()
    for m in CJK_RE.finditer(low):
        s = m.group(0)
        if len(s) == 1:
            out.append(s)
        else:
            for i in range(len(s) - 1):
                out.append(s[i:i + 2])
    for m in WORD_RE.finditer(low):
        w = m.group(0).strip(".-/")
        if len(w) >= 2:
            out.append("#" + w)
    return out


def fit_tfidf(texts):
    """按 df 挑词表、算 idf，返回 (vocab, idf, 每个文本的 L2 归一化向量)。"""
    n = len(texts)
    toks = [tokenize(t) for t in texts]
    df = Counter()
    for tk in toks:
        df.update(set(tk))
    vocab = [t for t, _ in sorted(df.items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_VOCAB]]
    vidx = {t: i for i, t in enumerate(vocab)}
    idf = [math.log((n + 1) / (df[t] + 1)) + 1.0 for t in vocab]

    vectors = []
    for tk in toks:
        cnt = Counter(vidx[t] for t in tk if t in vidx)
        total = sum(cnt.values()) or 1
        vec = [0.0] * len(vocab)
        for i, c in cnt.items():
            vec[i] = (c / float(total)) * idf[i]
        vectors.append(l2(vec))
    return vocab, idf, vectors


def l2(vec):
    n = math.sqrt(sum(v * v for v in vec))
    if n == 0:
        return vec
    return [v / n for v in vec]


def zhipu_embed(texts, dim=None):
    key = os.environ.get("ZHIPU_API_KEY", "").strip()
    if not key:
        raise SystemExit("provider=zhipu 需要环境变量 ZHIPU_API_KEY")
    body = {"model": ZHIPU_MODEL, "input": texts}
    if dim:
        body["dimensions"] = int(dim)
    req = urllib.request.Request(
        ZHIPU_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit("智谱 embedding 失败 HTTP %s: %s" % (e.code, e.read()[:300]))
    except Exception as e:  # noqa: BLE001
        raise SystemExit("智谱 embedding 网络失败: %s" % e)
    rows = sorted(payload.get("data", []), key=lambda r: r.get("index", 0))
    if len(rows) != len(texts):
        raise SystemExit("embedding 返回条数不匹配：%s vs %s" % (len(rows), len(texts)))
    return [l2([float(x) for x in r["embedding"]]) for r in rows]


def quantize_int8(vectors):
    """全局 scale 的对称 int8 量化 + 稀疏存储（TF-IDF 向量本身很稀疏）。"""
    vmax = max((max(abs(v) for v in vec) for vec in vectors if vec), default=0.0)
    if vmax == 0:
        return [], 1.0
    scale = 127.0 / vmax
    items = []
    for vec in vectors:
        idx, val = [], []
        for i, v in enumerate(vec):
            q = int(round(v * scale))
            if q:
                idx.append(i)
                val.append(max(-127, min(127, q)))
        items.append([idx, val])
    return items, round(scale, 6)


# ---------------------------------------------------------------- 产物

def dump_json(path, obj):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(tmp), str(path))


def build(provider, dim=None):
    data = json.loads(SRC.read_text(encoding="utf-8"))
    chunks, blocked = build_chunks(data)

    # 隐私断言：任何手机号都不允许出现在产物里
    for c in chunks:
        if has_phone(c["text"]):
            raise SystemExit("检测到手机号泄漏，已中止：chunk=%s" % c["id"])

    texts = [c["text"] for c in chunks]
    if provider == "zhipu":
        vectors = zhipu_embed(texts, dim)
        actual_dim = len(vectors[0])
        vocab = None
        idf = None
    else:
        vocab, idf, vectors = fit_tfidf(texts)
        actual_dim = len(vocab)

    items, scale = quantize_int8(vectors)
    src_hash = hashlib.sha256(SRC.read_bytes()).hexdigest()

    meta = {
        "generated_at": None,  # 由调用方填；--check 时忽略
        "provider": provider,
        "model": ZHIPU_MODEL if provider == "zhipu" else "char-bigram-tfidf",
        "dim": actual_dim,
        "count": len(chunks),
        "source": "data/site-data.json",
        "source_sha256": src_hash,
        "quant": {"type": "int8-symmetric", "scale": scale, "layout": "sparse"},
        "vocab": vocab,
        "idf": [round(x, 6) for x in idf] if idf else None,
        "blocked_fields": blocked,
    }
    vec_doc = {"provider": provider, "dim": actual_dim,
               "quant": meta["quant"], "items": [
                   {"id": chunks[i]["id"], "idx": items[i][0], "val": items[i][1]}
                   for i in range(len(chunks))
               ]}
    return chunks, vec_doc, meta


def kb_js(chunks, meta):
    payload = {
        "chunks": chunks,
        "meta": {k: meta[k] for k in ("provider", "model", "dim", "count", "source_sha256")},
    }
    return "/* 自动生成，勿手改。源：data/site-data.json · build_kb.py */\n" \
           "window.KB = %s;\n" % json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def strip_volatile(meta):
    m = dict(meta)
    m.pop("generated_at", None)
    return m


def keyword_score(text, chunks, topk=5):
    """零词表的兜底检索：按查询 bigram 在块内的命中比例打分。
    这也是前端 provider=none 时的降级算法，函数端在向量得分过低时同样回落到这里。"""
    terms = []
    for m in CJK_RE.finditer(text):
        s = m.group(0)
        terms.extend([s[i:i + 2] for i in range(len(s) - 1)])
    for m in WORD_RE.finditer(text.lower()):
        w = m.group(0).strip(".-/")
        if len(w) >= 2:
            terms.append(w)
    terms = [t for t in terms if t]
    if not terms:
        return []
    hits = []
    for ch in chunks:
        low = ch["text"].lower()
        n = sum(1 for t in terms if t in low)
        if n:
            hits.append((n / float(len(terms)), ch["id"]))
    hits.sort(reverse=True)
    return hits[:topk]


def query_probe(text, topk=5):
    """用落盘的 kb-meta + vectors 做一次检索自测，验证召回是否正常（M4 调提示词时复用）。"""
    m = json.loads((KB_DIR / "kb-meta.json").read_text(encoding="utf-8"))
    v = json.loads((KB_DIR / "vectors.json").read_text(encoding="utf-8"))
    c = json.loads((KB_DIR / "chunks.json").read_text(encoding="utf-8"))
    by_id = {ch["id"]: ch for ch in c}
    if m.get("provider") != "tfidf":
        print("提示：当前 provider=%s，--query 自测仅按 tfidf 口径打分" % m.get("provider"))
        return 0
    vocab, idf, scale = m["vocab"], m["idf"], m["quant"]["scale"]
    vidx = {t: i for i, t in enumerate(vocab)}
    tk = tokenize(text)
    cnt = Counter(vidx[t] for t in tk if t in vidx)
    total = sum(cnt.values()) or 1
    q = [0.0] * len(vocab)
    for i, k in cnt.items():
        q[i] = (k / float(total)) * idf[i]
    q = l2(q)

    scores = []
    for item in v["items"]:
        s = 0.0
        for i, val in zip(item["idx"], item["val"]):
            s += q[i] * (val / scale)
        scores.append((s, item["id"]))
    scores.sort(reverse=True)

    print("查询：%s" % text)
    hit_terms = len(cnt)
    if hit_terms == 0 or scores[0][0] < 0.01:
        print("  （词表命中 %d 个，向量得分过低，回落关键词匹配）" % hit_terms)
        for s, cid in keyword_score(text, c, topk):
            print("  %6.4f  %-12s %s" % (s, cid, by_id.get(cid, {}).get("title", "")))
    else:
        print("  （词表命中 %d 个）" % hit_terms)
        for s, cid in scores[:topk]:
            print("  %6.4f  %-12s %s" % (s, cid, by_id.get(cid, {}).get("title", "")))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="tfidf", choices=["tfidf", "zhipu"])
    ap.add_argument("--dim", type=int, default=None, help="zhipu 专用，指定向量维度")
    ap.add_argument("--check", action="store_true", help="只校验产物是否与源一致")
    ap.add_argument("--report", action="store_true", help="打印切片清单")
    ap.add_argument("--query", default=None, help="检索自测：输入一句话，打印 Top-K 命中")
    ap.add_argument("--topk", type=int, default=5)
    ap.add_argument("--sync-functions", action="store_true",
                    help="同步知识库到 functions/tencent/kb/")
    args = ap.parse_args()

    if not SRC.exists():
        raise SystemExit("找不到源文件：%s" % SRC)

    if args.query:
        return query_probe(args.query, args.topk)

    chunks, vec_doc, meta = build(args.provider, args.dim)
    meta["generated_at"] = "PLACEHOLDER"

    if args.report:
        print("%-14s %-10s %5s  %s" % ("ID", "SECTION", "CHARS", "TITLE"))
        for c in chunks:
            print("%-14s %-10s %5d  %s" % (c["id"], c["section"], len(c["text"]), c["title"]))
        total = sum(len(c["text"]) for c in chunks)
        print("\n共 %d 块 / %d 字 / 维度 %s / 量化 scale=%s"
              % (len(chunks), total, meta["dim"], meta["quant"]["scale"]))
        return 0

    c_path, v_path, m_path, j_path = (KB_DIR / "chunks.json", KB_DIR / "vectors.json",
                                     KB_DIR / "kb-meta.json", KB_DIR / "kb.js")

    if args.check:
        bad = []
        if not c_path.exists() or json.loads(c_path.read_text(encoding="utf-8")) != chunks:
            bad.append("chunks.json")
        if not v_path.exists() or json.loads(v_path.read_text(encoding="utf-8")) != vec_doc:
            bad.append("vectors.json")
        if not m_path.exists() or strip_volatile(json.loads(m_path.read_text(encoding="utf-8"))) \
                != strip_volatile(meta):
            bad.append("kb-meta.json")
        if bad:
            print("知识库已过期，请运行 python3 scripts/build_kb.py 重建：%s" % ", ".join(bad),
                  file=sys.stderr)
            return 1
        print("知识库与源一致（%d 块 / 维度 %s）" % (len(chunks), meta["dim"]))
        return 0

    import datetime
    meta["generated_at"] = datetime.datetime.now(datetime.timezone.utc) \
        .strftime("%Y-%m-%dT%H:%M:%SZ")

    KB_DIR.mkdir(parents=True, exist_ok=True)
    dump_json(c_path, chunks)
    dump_json(v_path, vec_doc)
    dump_json(m_path, meta)
    j_path.write_text(kb_js(chunks, meta), encoding="utf-8")

    if args.sync_functions:
        dst = ROOT / "functions" / "tencent" / "kb"
        dst.mkdir(parents=True, exist_ok=True)
        for f in (c_path, v_path, m_path):
            (dst / f.name).write_bytes(f.read_bytes())

    print("已生成：chunks=%d / vectors=%d / dim=%s / provider=%s"
          % (len(chunks), len(vec_doc["items"]), meta["dim"], meta["provider"]))
    print("私隐：已排除字段 -> %s" % (meta["blocked_fields"] or "无"))
    if args.sync_functions:
        print("已同步到 functions/tencent/kb/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
