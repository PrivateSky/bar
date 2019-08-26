#!/usr/bin/env bash
node "$(dirname "$(readlink -f "$0")")/../lib/CommandExecuter.js" "$@"