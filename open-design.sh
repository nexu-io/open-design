#!/bin/bash
# Open Design launcher (daemon + web UI)
# Usage: open-design [start|stop|status|logs|web]

set -e

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
PID_DIR="$PROJECT_DIR/.od"
DAEMON_PID="$PID_DIR/daemon.pid"
WEB_PID="$PID_DIR/web.pid"
LOG_DIR="$PROJECT_DIR/logs"
DAEMON_LOG="$LOG_DIR/daemon.log"
WEB_LOG="$LOG_DIR/web.log"
DAEMON_PORT="${OD_PORT:-7456}"
WEB_PORT="${OD_WEB_PORT:-3000}"

# fnm setup
export PATH="/home/openclawuser/.local/share/fnm:$PATH"
eval "$(fnm env --shell bash)"

mkdir -p "$PID_DIR" "$LOG_DIR"

start_daemon() {
    if [ -f "$DAEMON_PID" ] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
        echo "[od] daemon already running (PID: $(cat $DAEMON_PID))"
        return 0
    fi
    
    echo "[od] starting daemon on port $DAEMON_PORT..."
    cd "$PROJECT_DIR"
    fnm use 24
    
    nohup node apps/daemon/dist/cli.js --port "$DAEMON_PORT" \
        > "$DAEMON_LOG" 2>&1 &
    
    echo $! > "$DAEMON_PID"
    
    sleep 2
    if curl -s "http://127.0.0.1:$DAEMON_PORT/api/health" | jq -e '.ok' > /dev/null 2>&1; then
        echo "[od] daemon ready ✓"
    else
        echo "[od] daemon health check failed"
        tail -20 "$DAEMON_LOG"
        return 1
    fi
}

start_web() {
    if [ -f "$WEB_PID" ] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
        echo "[od] web already running (PID: $(cat $WEB_PID))"
        return 0
    fi
    
    echo "[od] starting web UI on port $WEB_PORT..."
    cd "$PROJECT_DIR/apps/web"
    fnm use 24
    
    OD_PORT=$DAEMON_PORT nohup pnpm dev > "$WEB_LOG" 2>&1 &
    
    echo $! > "$WEB_PID"
    
    sleep 4
    if curl -s "http://localhost:$WEB_PORT" > /dev/null 2>&1; then
        echo "[od] web UI ready ✓"
    else
        echo "[od] web UI startup failed"
        tail -20 "$WEB_LOG"
        return 1
    fi
}

stop_daemon() {
    if [ -f "$DAEMON_PID" ]; then
        PID=$(cat "$DAEMON_PID")
        if kill -0 "$PID" 2>/dev/null; then
            echo "[od] stopping daemon (PID: $PID)"
            kill "$PID"
        fi
        rm -f "$DAEMON_PID"
    fi
}

stop_web() {
    if [ -f "$WEB_PID" ]; then
        PID=$(cat "$WEB_PID")
        if kill -0 "$PID" 2>/dev/null; then
            echo "[od] stopping web (PID: $PID)"
            kill "$PID"
        fi
        rm -f "$WEB_PID"
    fi
}

show_status() {
    echo "┌─────────────────────────────────────────"
    echo "│ Open Design Status"
    echo "├─────────────────────────────────────────"
    
    # Daemon
    if [ -f "$DAEMON_PID" ] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
        echo "│ Daemon: ✓ running (PID: $(cat $DAEMON_PID))"
        echo "│ API:   http://127.0.0.1:$DAEMON_PORT/api/health"
    else
        echo "│ Daemon: ✗ not running"
    fi
    
    # Web
    if [ -f "$WEB_PID" ] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
        echo "│ Web:   ✓ running (PID: $(cat $WEB_PID))"
        echo "│ URL:   http://localhost:$WEB_PORT"
    else
        echo "│ Web:   ✗ not running"
    fi
    
    echo "└─────────────────────────────────────────"
    
    if [ -f "$DAEMON_PID" ] && kill -0 "$(cat "$DAEMON_PID")" 2>/dev/null; then
        echo
        echo "Available agents:"
        curl -s "http://127.0.0.1:$DAEMON_PORT/api/agents" | jq '[.agents[] | select(.available) | {id, name, version}]'
    fi
}

show_urls() {
    echo
    echo "🌐 Open Design URLs:"
    echo "   Web UI:  http://localhost:$WEB_PORT"
    echo "   API:     http://127.0.0.1:$DAEMON_PORT/api/health"
    echo "   Agents:  http://127.0.0.1:$DAEMON_PORT/api/agents"
    echo
}

case "${1:-start}" in
    start)
        start_daemon
        start_web
        show_urls
        ;;
    stop)
        stop_web
        stop_daemon
        echo "[od] stopped"
        ;;
    status)
        show_status
        ;;
    logs)
        echo "=== Daemon ($DAEMON_LOG) ==="
        tail -${2:-30} "$DAEMON_LOG" 2>/dev/null || echo "no log"
        echo
        echo "=== Web ($WEB_LOG) ==="
        tail -${2:-30} "$WEB_LOG" 2>/dev/null || echo "no log"
        ;;
    daemon)
        start_daemon
        ;;
    web)
        start_web
        show_urls
        ;;
    restart)
        stop_web
        stop_daemon
        sleep 1
        start_daemon
        start_web
        show_urls
        ;;
    url)
        show_urls
        ;;
    *)
        echo "Usage: $0 {start|stop|status|logs|restart|daemon|web|url}"
        echo "  start    - start daemon + web UI"
        echo "  stop     - stop all"
        echo "  status   - show status + agents"
        echo "  logs [N] - show logs (default 30 lines)"
        echo "  restart  - restart all"
        echo "  daemon   - start daemon only"
        echo "  web      - start web UI only"
        echo "  url      - show URLs"
        exit 1
        ;;
esac