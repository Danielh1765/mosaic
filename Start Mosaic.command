#!/bin/zsh
# Double-click to start Mosaic. Close this window to stop it.
cd "$(dirname "$0")"
(sleep 1 && open "http://localhost:4321") &
node server.mjs
