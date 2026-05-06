import os
import shutil
import uuid
import asyncio
from fastapi import FastAPI, UploadFile, File, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pdf_parser import extract_text_from_pdf
from chunker import chunk_by_section
from analyzer import extract_key_points, generate_summary_and_review

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 儲存分析任務的狀態
analysis_tasks = {}

@app.websocket("/ws/analyze/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    print(f"WebSocket connection attempt for task: {task_id}")
    await websocket.accept()
    print(f"WebSocket accepted for task: {task_id}")

    # 等待任務開始，最多等待30秒
    timeout = 30
    waited = 0
    while task_id not in analysis_tasks and waited < timeout:
        print(f"Waiting for task {task_id} to start... ({waited}s)")
        await asyncio.sleep(1)
        waited += 1

    if task_id not in analysis_tasks:
        print(f"Task {task_id} not found after {timeout} seconds, closing connection")
        await websocket.send_json({
            "error": "任務未找到或已超時"
        })
        await websocket.close()
        return

    print(f"Task {task_id} found, starting progress updates")
    task = analysis_tasks[task_id]

    # 持續發送進度更新直到完成
    while not task["completed"]:
        try:
            await websocket.send_json({
                "progress": task["progress"],
                "message": task["message"],
                "completed": task["completed"]
            })
            print(f"Sent progress update: {task['progress']}% - {task['message']}")
        except Exception as e:
            print(f"Error sending WebSocket message: {e}")
            break
        await asyncio.sleep(0.5)  # 每0.5秒更新一次

    # 發送最終結果
    try:
        await websocket.send_json({
            "progress": 100,
            "message": "分析完成",
            "completed": True,
            "result": task["result"]
        })
        print(f"Sent final result for task {task_id}")
    except Exception as e:
        print(f"Error sending final result: {e}")

    # 清理任務
    if task_id in analysis_tasks:
        del analysis_tasks[task_id]
        print(f"Cleaned up task {task_id}")

@app.post("/analyze")
async def analyze_paper(file: UploadFile = File(...)):
    task_id = str(uuid.uuid4())
    temp_path = f"temp_{task_id}_{file.filename}"

    # 初始化任務狀態
    analysis_tasks[task_id] = {
        "progress": 0,
        "message": "開始分析...",
        "completed": False,
        "result": None
    }

    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 在背景中執行分析
    asyncio.create_task(process_analysis(task_id, temp_path))

    return {"task_id": task_id, "status": "processing"}

async def process_analysis(task_id: str, temp_path: str):
    try:
        # 步驟1: 提取文字
        analysis_tasks[task_id]["progress"] = 10
        analysis_tasks[task_id]["message"] = "正在提取PDF文字..."
        full_text = await asyncio.to_thread(extract_text_from_pdf, temp_path)

        # 步驟2: 分段
        analysis_tasks[task_id]["progress"] = 20
        analysis_tasks[task_id]["message"] = "正在分段處理..."
        chunks = await asyncio.to_thread(chunk_by_section, full_text)

        # 步驟3: 分析各段
        all_key_points = []
        total_chunks = len(chunks)

        for i, chunk in enumerate(chunks):
            progress = 20 + int((i + 1) / total_chunks * 70)  # 20-90%
            analysis_tasks[task_id]["progress"] = progress
            analysis_tasks[task_id]["message"] = f"正在分析第 {i+1}/{total_chunks} 段..."

            key_points = await asyncio.to_thread(extract_key_points, chunk)
            all_key_points.append(key_points)

        # 步驟4: 生成總結
        analysis_tasks[task_id]["progress"] = 95
        analysis_tasks[task_id]["message"] = "正在生成摘要..."

        combined = "\n\n".join(all_key_points)
        result = await asyncio.to_thread(generate_summary_and_review, combined)

        # 完成
        analysis_tasks[task_id]["progress"] = 100
        analysis_tasks[task_id]["message"] = "分析完成"
        analysis_tasks[task_id]["completed"] = True
        analysis_tasks[task_id]["result"] = result

    except Exception as e:
        analysis_tasks[task_id]["message"] = f"分析失敗: {str(e)}"
        analysis_tasks[task_id]["completed"] = True
        analysis_tasks[task_id]["result"] = {"error": str(e)}

    finally:
        # 清理臨時檔案
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.get("/health")
def health():
    return {"status": "ok"}

# Serve frontend 靜態檔案（放在最後）
# 因為在 dev 環境下 root 靜態掛載可能會攔截 WebSocket 路徑，改用 /static
static_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")