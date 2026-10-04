#!/usr/bin/env bash
# Dev tool: regenerates every README GIF of neongai from the current code, then
# checks that none is older than the code and that every GIF the READMEs use
# exists. Run it from the repo root after any change to how a scene looks.
#
#   neongai/tools/gifs.sh
set -euo pipefail

media=.github/media
mkdir -p "$media"

# One showcase per scene, straight from the scene list in the code, so a new
# scene is never missed: neongai inside a mock Claude Code window, the strip
# above the prompt and the side view docked on the right.
for id in $(bun -e "import { SCENES } from './neongai/hooks/paint'; console.log(Object.keys(SCENES).join(' '))"); do
  bun neongai/tools/showcase.ts "$id" | python3 neongai/tools/showcase-to-gif.py "$media/neongai-$id.gif"
done

newest=$(ls -t neongai/hooks/*.ts neongai/hooks/*.tsx neongai/hooks/scenes/*.ts neongai/tools/*.ts neongai/tools/*.py | head -1)
status=0
for g in "$media"/neongai-*.gif; do
  [[ $g -nt $newest ]] || { echo "older than $newest: $g"; status=1; }
done
for ref in $(grep -oh 'media/neongai-[a-z-]*\.gif' README.md neongai/README.md | sort -u); do
  [[ -f .github/$ref ]] || { echo "a README uses a missing GIF: $ref"; status=1; }
done
du -ch "$media"/neongai-*.gif | tail -1
exit $status
