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
    })
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
    })
    return response.json()["response"]