#!/bin/bash
# Regenerate the announcer phrases in public/.
#
# Daniel (en_GB) reads as a British motorsport commentator and is one of the
# high-quality Apple voices; Fred, the previous choice, was 8 kHz and robotic.
# Full bandwidth matters here — the playback chain in audio.js only colours the
# speech, it no longer has consonant energy to spare.
#
# Usage: tools/make-voices.sh   (from the repo root; macOS only)
set -euo pipefail

cd "$(dirname "$0")/.."

VOICE=Daniel
RATE=160

say_to_wav() {
  local text="$1" out="$2"
  local tmp
  tmp="$(mktemp -t polepos-voice).aiff"
  say -v "$VOICE" -r "$RATE" -o "$tmp" "$text"
  afconvert -f WAVE -d LEI16@22050 -c 1 "$tmp" "public/$out"
  rm -f "$tmp"
  echo "wrote public/$out"
}

say_to_wav "Prepare to qualify!" voice-qualify.wav
say_to_wav "Prepare to race!" voice-race.wav
