#!/usr/bin/env bash
set -euo pipefail

rtk npm --prefix app test -- --run
rtk npm --prefix app run build
