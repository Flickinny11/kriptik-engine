"""
KripTik Engine — Modal App Definition

Container image + endpoints for running builds in Modal.
Events stream in real-time via incremental stdout reading + callback URL.

Usage:
  modal deploy modal/app.py
"""

import modal

app = modal.App("kriptik-engine")

# Pre-baked image with Node.js 22, engine dependencies, and Playwright
engine_image = (
    modal.Image.from_registry("node:22-slim", add_python="3.12")
    .apt_install(
        "git", "build-essential", "curl",
        # Playwright Chromium system deps
        "libnss3", "libatk-bridge2.0-0", "libdrm2", "libxkbcommon0",
        "libgbm1", "libasound2", "libatspi2.0-0", "libxshmfence1",
    )
    .run_commands(
        "npm install -g tsx@4 create-vite create-next-app",
        "npx playwright install chromium",
    )
    .pip_install("fastapi[standard]", "httpx")
    # Pre-install common frameworks so user builds start faster
    .run_commands(
        "mkdir -p /cache/npm-packages && cd /cache/npm-packages && "
        "npm init -y && npm install --save "
        # Core React + Vite stack
        "react react-dom vite @vitejs/plugin-react typescript "
        # Next.js
        "next "
        # Styling
        "tailwindcss postcss autoprefixer "
        # UI libraries
        "@radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs "
        # State management
        "zustand "
        # Design References dependencies (from Design_References.md)
        "curtainsjs ogl three @react-three/fiber @react-three/drei "
        "gsap @gsap/react "
        "glslify gl-noise "
        "postprocessing "
        "@barba/core lenis "
        # Data & API
        "drizzle-orm @supabase/supabase-js "
        # Common utilities
        "zod uuid clsx tailwind-merge "
        "2>/dev/null || true"
    )
    # Copy engine source and install deps
    .add_local_dir("src", "/app/src", copy=True)
    .add_local_file("package.json", "/app/package.json", copy=True)
    .add_local_file("package-lock.json", "/app/package-lock.json", copy=True)
    .add_local_file("tsconfig.json", "/app/tsconfig.json", copy=True)
    .add_local_file("modal/run-engine.ts", "/app/run-engine.ts", copy=True)
    .run_commands("cd /app && npm ci --omit=dev && npm install tsx@4")
)

brain_volume = modal.Volume.from_name("kriptik-brains", create_if_missing=True)
sandbox_volume = modal.Volume.from_name("kriptik-sandboxes", create_if_missing=True)


@app.function(
    image=engine_image,
    volumes={"/brains": brain_volume, "/sandboxes": sandbox_volume},
    timeout=86400,  # 24 hours — large production builds can take extended time
    memory=8192,    # 8GB — Playwright + SQLite + multi-agent reasoning
    secrets=[modal.Secret.from_name("kriptik-env")],
)
@modal.fastapi_endpoint(method="POST")
async def start_build(request: dict):
    """
    Runs a build inside the container. Streams events in real-time
    via callback URL (if provided) AND returns them in the response.
    """
    import subprocess
    import json
    import os

    project_id = request.get("projectId")
    prompt = request.get("prompt", "")
    mode = request.get("mode", "builder")
    budget = request.get("budgetCapDollars", 5)
    callback_url = request.get("callbackUrl")

    os.makedirs("/brains", exist_ok=True)
    os.makedirs(f"/sandboxes/{project_id}", exist_ok=True)

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

    # Write config to stdin, then close it
    proc.stdin.write(config)
    proc.stdin.close()

    # Stream events in real-time — read stdout line by line as engine emits them
    events = []
    httpx_client = None

    if callback_url:
        import httpx
        httpx_client = httpx.Client(timeout=10)

    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                events.append(event)

                # Forward event to callback URL in real-time
                if httpx_client and callback_url:
                    try:
                        httpx_client.post(callback_url, json=event)
                    except Exception:
                        pass  # Don't let callback failures stop the build
            except json.JSONDecodeError:
                pass

        proc.wait(timeout=60)  # Wait for process to fully exit
    except Exception as e:
        proc.kill()
        events.append({"type": "build_error", "data": {"message": str(e)}})
    finally:
        if httpx_client:
            httpx_client.close()

    # Read any remaining stderr
    stderr = ""
    try:
        stderr = proc.stderr.read() or ""
    except Exception:
        pass

    # Commit volume changes (Brain DB + sandbox files)
    brain_volume.commit()
    sandbox_volume.commit()

    return {
        "status": "complete" if proc.returncode == 0 else "error",
        "events": events,
        "stderr": stderr[-5000:] if stderr else "",
        "returnCode": proc.returncode,
    }


@app.function(
    image=engine_image,
    volumes={"/brains": brain_volume, "/sandboxes": sandbox_volume},
    timeout=86400,
    memory=8192,
    secrets=[modal.Secret.from_name("kriptik-env")],
    keep_warm=1,  # Keep 1 container warm for fast cold starts
)
@modal.fastapi_endpoint(method="GET")
async def health():
    """Health check — also keeps a container warm."""
    return {"status": "ok", "service": "kriptik-engine-modal"}
