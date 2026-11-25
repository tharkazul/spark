#!/bin/sh
# Renders social.html into launch images (PNG, plus a JPEG for posting) in out/.
cd "$(dirname "$0")"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out

size() {
  case "$1" in
    square) echo "1080,1080" ;;
    wide) echo "1200,627" ;;
    story) echo "1080,1920" ;;
    *) echo "1080,1350" ;;
  esac
}

for lang in nl en; do
  for p in square portrait story wide s1 s2 s3 s4 s5 s6; do
    name="rooka-$p-$lang"
    "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      --window-size="$(size $p)" --virtual-time-budget=5000 --allow-file-access-from-files \
      --screenshot="$PWD/out/$name.png" "file://$PWD/social.html?p=$p&lang=$lang" >/dev/null 2>&1
    sips -s format jpeg -s formatOptions 90 "out/$name.png" --out "out/$name.jpg" >/dev/null
  done
done
ls out
