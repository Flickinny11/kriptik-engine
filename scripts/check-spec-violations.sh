#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# PRE-COMMIT SPEC VIOLATION SCAN
# ═══════════════════════════════════════════════════════════════════════
# Scans staged files for model/tech substitutions that violate the spec.
# Called from .husky/pre-commit. Exits non-zero to block the commit.
# ═══════════════════════════════════════════════════════════════════════

VIOLATIONS=0

# Get list of staged prism-related files
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E "(prism|modal/prism)" || true)

if [[ -z "$STAGED" ]]; then
  exit 0
fi

echo "Scanning staged prism files for spec violations..."

for FILE in $STAGED; do
  [[ -f "$FILE" ]] || continue

  # FLUX.1 (should be FLUX.2)
  if grep -qiE "FLUX\.1[^0-9]|FLUX\.1-schnell|black-forest-labs/FLUX\.1" "$FILE" 2>/dev/null; then
    echo "SPEC VIOLATION: $FILE contains FLUX.1 reference (spec requires FLUX.2-klein-4B)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # SAM 2.x (should be SAM 3.1)
  if grep -qiE "sam2\.|SAM2|hiera-large|facebook/sam2" "$FILE" 2>/dev/null; then
    echo "SPEC VIOLATION: $FILE contains SAM 2.x reference (spec requires SAM 3.1 Object Multiplex)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Qwen 2.x (should be Qwen3)
  if grep -qiE "Qwen2\.5|Qwen/Qwen2|Qwen2\.5-Coder" "$FILE" 2>/dev/null; then
    echo "SPEC VIOLATION: $FILE contains Qwen 2.x reference (spec requires Qwen3-Coder-Next)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Wrong quantization package
  if grep -qE "auto-gptq|AutoGPTQ" "$FILE" 2>/dev/null; then
    echo "SPEC VIOLATION: $FILE contains auto-gptq (spec requires autoawq)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Wrong SAM package
  if grep -qE '"sam2"' "$FILE" 2>/dev/null; then
    echo "SPEC VIOLATION: $FILE uses 'sam2' package (spec requires 'segment-anything-2')"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Fake SWE-RM (regex heuristics)
  if grep -qE "def _check_structural|def _check_behavioral" "$FILE" 2>/dev/null; then
    if grep -qiE "SWE.RM|verification.*score" "$FILE" 2>/dev/null; then
      echo "SPEC VIOLATION: $FILE has regex heuristics labeled as SWE-RM (must be a real model)"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  # DEVIATION comments without docs/spec-deviations-prism.md
  if grep -q "DEVIATION" "$FILE" 2>/dev/null; then
    if [[ ! -f "docs/spec-deviations-prism.md" ]]; then
      echo "SPEC VIOLATION: $FILE has DEVIATION comments but docs/spec-deviations-prism.md does not exist"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
done

if [[ "$VIOLATIONS" -gt 0 ]]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  COMMIT BLOCKED: $VIOLATIONS spec violation(s) found."
  echo "  The spec (docs/DIFFUSION-ENGINE-SPEC.md) is the ONLY truth."
  echo "  Fix violations or document via deviation protocol first."
  echo "═══════════════════════════════════════════════════════════════"
  exit 1
fi

echo "Spec violation scan: PASS"
exit 0
