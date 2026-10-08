#!/bin/sh
# usage: ./build.sh <from> <to> <name>   e.g. ./build.sh 0 29.2 upi-refund-v1-hook
set -e
cd "$(dirname "$0")"
FROM=$1; TO=$2; NAME=$3
rm -rf out/frames && node render.mjs frames "$FROM" "$TO" out/frames 4
ffmpeg -y -hide_banner -loglevel error -framerate 30 -pattern_type glob -i 'out/frames/f*.png' \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -profile:v high -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -metadata title="PREVIEW (estimated timing)" -movflags +faststart "out/$NAME.mp4"
echo "wrote out/$NAME.mp4"
