import subprocess
import socket
import sys
import os
import signal
import time

ROOT = os.path.dirname(os.path.abspath(__file__))


def ollama_running():
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", 11434)) == 0


procs = []

if not ollama_running():
    print("啟動 Ollama...")
    procs.append(subprocess.Popen(["ollama", "serve"]))
    time.sleep(2)
else:
    print("Ollama 已在執行中")

PYTHON = f"{ROOT}/venv/bin/python"
if not os.path.exists(PYTHON):
    PYTHON = sys.executable

print("啟動 Backend (port 8000)...")
procs.append(subprocess.Popen(
    [PYTHON, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
    cwd=f"{ROOT}/backend"
))

print("啟動 Frontend (port 5173)...")
procs.append(subprocess.Popen(
    ["npm", "run", "dev"],
    cwd=f"{ROOT}/frontend"
))

print("\n所有服務已啟動，按 Ctrl+C 停止\n")


def shutdown(sig, frame):
    print("\n正在關閉所有服務...")
    for p in procs:
        p.terminate()
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)

for p in procs:
    p.wait()
