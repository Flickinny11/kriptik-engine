"""
KripTik Engine — Modal App Definition

Defines the container image and infrastructure for running builds in Modal sandboxes.
Each project gets its own named sandbox with persistent Brain SQLite and code volumes.

Usage:
  modal deploy modal/app.py          # Deploy the app definition
  modal volume create kriptik-brains  # Create Brain volume (done once)
  modal volume create kriptik-sandboxes  # Create sandbox volume (done once)
"""

import modal

app = modal.App("kriptik-engine")

# Pre-baked image with Node.js 22, engine dependencies, and Playwright
engine_image = (
    modal.Image.from_registry("node:22-slim", add_python="3.12")
    .apt_install(
        "git",
        "build-essential",
        "curl",
        "python3",
        # Playwright system deps
        "libnss3",
        "libatk-bridge2.0-0",
        "libdrm2",
        "libxkbcommon0",
        "libgbm1",
        "libasound2",
        "libatspi2.0-0",
        "libxshmfence1",
    )
    .run_commands(
        # Install tsx for TypeScript execution
        "npm install -g tsx@4",
        # Install Playwright Chromium
        "npx playwright install chromium",
    )
    .pip_install("fastapi[standard]")
    # Copy engine source and install deps (baked into image for fast sandbox creation)
    .add_local_dir("src", "/app/src", copy=True)
    .add_local_file("package.json", "/app/package.json", copy=True)
    .add_local_file("package-lock.json", "/app/package-lock.json", copy=True)
    .add_local_file("tsconfig.json", "/app/tsconfig.json", copy=True)
    .add_local_file("modal/run-engine.ts", "/app/run-engine.ts", copy=True)
    .run_commands("cd /app && npm ci --omit=dev")
)

# Persistent volumes
brain_volume = modal.Volume.from_name("kriptik-brains", create_if_missing=True)
sandbox_volume = modal.Volume.from_name("kriptik-sandboxes", create_if_missing=True)


@app.function(
    image=engine_image,
    volumes={
        "/brains": brain_volume,
        "/sandboxes": sandbox_volume,
    },
    timeout=1800,  # 30 min max per build
    memory=4096,
    secrets=[modal.Secret.from_name("kriptik-env")],
)
@modal.fastapi_endpoint(method="POST")
async def start_build(request: dict):
    """
    HTTP endpoint called by the Vercel backend to start a build.
    Receives: { projectId, prompt, mode, budgetCapDollars, callbackUrl }
    Runs the engine inside this container, streams events to callbackUrl.
    """
    import subprocess
    import json

    project_id = request.get("projectId")
    prompt = request.get("prompt", "")
    mode = request.get("mode", "builder")
    budget = request.get("budgetCapDollars", 5)

    # Ensure project directories exist
    import os
    os.makedirs(f"/brains", exist_ok=True)
    os.makedirs(f"/sandboxes/{project_id}", exist_ok=True)

    # Run the engine
    config = json.dumps({
        "projectId": project_id,
        "prompt": prompt,
        "mode": mode,
        "budgetCapDollars": budget,
        "brainDbPath": f"/brains/{project_id}.db",
        "sandboxRootDir": f"/sandboxes/{project_id}",
    })

    proc = subprocess.Popen(
        ["node", "--import", "tsx", "/app/run-engine.ts"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd="/app",
    )

    # Send config via stdin
    stdout, stderr = proc.communicate(input=config, timeout=1800)

    # Parse events from stdout (newline-delimited JSON)
    events = []
    for line in stdout.strip().split("\n"):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass

    # Commit volume changes
    brain_volume.commit()
    sandbox_volume.commit()

    return {
        "status": "complete" if proc.returncode == 0 else "error",
        "events": events,
        "stderr": stderr[-1000:] if stderr else "",
        "returnCode": proc.returncode,
    }


@app.function(
    image=engine_image,
    volumes={
        "/brains": brain_volume,
        "/sandboxes": sandbox_volume,
    },
    timeout=3600,
    memory=4096,
    secrets=[modal.Secret.from_name("kriptik-env")],
)
@modal.fastapi_endpoint(method="GET")
async def health():
    """Health check for the Modal app."""
    return {"status": "ok", "service": "kriptik-engine-modal"}
