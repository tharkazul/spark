#!/bin/sh
# Renders frames.html into 1206x2622 App Store screenshots (01.png ... 05.png).
cd "$(dirname "$0")"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for i in 1 2 3 4 5; do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1206,2622 --virtual-time-budget=4000 --allow-file-access-from-files \
    --screenshot="$PWD/0$i.png" "file://$PWD/frames.html?f=$i" >/dev/null 2>&1
done
