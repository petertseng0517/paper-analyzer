import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5:7b"

def extract_key_points(chunk: str) -> str:
    prompt = f"""以下是一篇學術論文的一個段落，可能是英文或中文。請提取這段的重點，用繁體中文條列式回答，簡短精確：

{chunk}

重點："""

    response = requests.post(OLLAMA_URL, json={
        "model": MODEL,
        "prompt": prompt,
        "stream": False
    }, timeout=120)
    data = response.json()
    return data["response"]


def generate_summary_and_review(key_points: str) -> dict:
    prompt = f"""以下是一篇學術論文各段落的重點整理，內容可能是英文或中文：

{key_points}

請根據以上重點，用繁體中文輸出以下三個部分，格式如下：

## 論文摘要
（用3-5句話說明這篇論文在做什麼）

## 優點 Pros
- （條列3-5點）

## 缺點 Cons
- （條列3-5點）"""

    response = requests.post(OLLAMA_URL, json={
        "model": MODEL,
        "prompt": prompt,
        "stream": False
    }, timeout=120)
    return response.json()["response"]


def generate_comparison(papers: list) -> str:
    papers_text = ""
    for i, p in enumerate(papers, 1):
        papers_text += f"### 論文 {i}：{p['name']}\n{p['summary']}\n\n"

    prompt = f"""以下是多篇學術論文的分析結果，請用繁體中文輸出以下三個部分：

{papers_text}

## 摘要比較
（逐篇說明各論文的核心研究問題與主要貢獻，並比較其異同）

## 優缺點比較表
| 論文 | 研究方向 | 主要優點 | 主要缺點 |
|------|---------|---------|---------|
（每篇論文填一行，內容簡潔）

## 總結推薦
（根據以上比較，推薦最值得深入閱讀的論文，並說明理由）"""

    response = requests.post(OLLAMA_URL, json={
        "model": MODEL,
        "prompt": prompt,
        "stream": False
    }, timeout=180)
    return response.json()["response"]