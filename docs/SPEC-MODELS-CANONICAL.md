# Canonical Model & Technology Reference

> **This file is machine-read by hooks. DO NOT MODIFY unless the spec changes.**
> Source of truth: `docs/DIFFUSION-ENGINE-SPEC.md` v1.1 (2026-04-08)

---

## Models — Exact References

| Component | Model Name | HuggingFace / API ID | GPU | Notes |
|-----------|-----------|---------------------|-----|-------|
| Image Generation | FLUX.2 Klein 4B | `black-forest-labs/FLUX.2-klein-4B` | L40S | 4B params, Apache 2.0, distilled, 4 inference steps, guidance_scale=0.0 |
| Image Gen (Pro) | FLUX.2 Pro | API-based | — | $0.03/megapixel, 4MP max |
| Image Gen (Dev) | FLUX.2 Dev 32B | `black-forest-labs/FLUX.2-dev-32B` | — | Non-commercial, highest quality |
| Segmentation | SAM 3.1 Object Multiplex | `facebook/sam3.1-object-multiplex` | L4 | Text-prompted (PCS), 16 objects/pass, shared memory |
| Segmentation Fallback | Grounding DINO 1.5 | — | L4 | Detection for SAM-missed elements |
| Code Generation | Qwen3-Coder-Next 80B-A3B | `Qwen/Qwen3-Coder-Next-80B-A3B-AWQ` | L4 | MoE, 3B active, AWQ-INT4, fits 24GB VRAM |
| Code Gen (Alt) | Mercury Coder 2 | API-based | — | Optional alternative to self-hosted |
| Code Verification | SWE-RM 30B-A3B | — | L4 | MoE reward model, 3B active, continuous 0-1 scoring |
| Caption Verification | Claude (vision) | Anthropic API | — | Binary pass/fail per node |
| Intent Parsing | Claude Opus 4.6 | Anthropic API | — | NL → structured AppIntent |
| Plan Generation | Claude Opus 4.6 | Anthropic API | — | Intent → PrismPlan |
| Escalation Model | Claude Opus 4.6 | Anthropic API | — | 3rd repair attempt, full context |
| Decorative Text | Ideogram 3.0 | API-based | — | Tier 3: hero headings, artistic elements |
| Functional Text | Sharp + SVG | Pillow (Python) | CPU | Tier 1: button labels, nav items |
| Runtime Text | MSDF | msdf-atlas-gen | CPU | Tier 2: dynamic content, WebGPU |

## Packages — Exact pip/npm References

| Package | Version | Purpose | WRONG Alternatives (BLOCKED) |
|---------|---------|---------|------------------------------|
| `segment-anything-2` | SAM 3.1 | Segmentation | `sam2` (that's SAM 2.x) |
| `diffusers` | >=0.32 | FLUX.2 pipeline | — |
| `sglang[all]` | >=0.4 | SGLang runtime + RadixAttention | — |
| `autoawq` | latest | AWQ quantization for Qwen3 | `auto-gptq` (wrong format) |
| `torch` | 2.5.1 | PyTorch | — |
| `transformers` | >=4.48 | HuggingFace model loading | — |
| `pixi.js` | 8 | PixiJS v8 WebGPU renderer | — |
| `@pixi/node` | 8 | Server-side PixiJS for bundling | — |

## SGLang Configuration

```python
sgl.Runtime(
    model_path="Qwen/Qwen3-Coder-Next-80B-A3B-AWQ",
    quantization="awq",
    # RadixAttention enabled by default
)
```

## SWE-RM Thresholds (Non-Negotiable)

| Score | Action |
|-------|--------|
| >= 0.85 | Pass |
| 0.60 - 0.84 | Borderline — regenerate from spec |
| < 0.60 | Fail — regenerate + escalate |

## SAM 3.1 Key Capabilities

- **Object Multiplex**: 16 objects per forward pass via shared memory
- **Promptable Concept Segmentation (PCS)**: Text-prompted segmentation
- **~7x speedup** at 128 objects on H100 vs. per-object processing
- For 20-50 element UI: 2-3 forward passes total

## FLUX.2 Klein Key Parameters

- **Inference steps**: 4 (distilled model)
- **Guidance scale**: 0.0 (guidance-free distillation)
- **Default resolution**: 1024x1024
- **Max resolution**: 2048x2048
- **Precision**: float16

---

*This file is the quick-reference. For full details, read `docs/DIFFUSION-ENGINE-SPEC.md`.*
