#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mise run check
mise run test-native
mise run test-terminal
