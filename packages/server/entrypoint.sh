#!/bin/sh
set -e

# 默认环境变量配置
export PORT="${PORT:-8787}"
export HOST="${HOST:-0.0.0.0}"
TURN_PORT="${TURN_PORT:-3478}"
EXTERNAL_IP="${EXTERNAL_IP:-120.24.232.60}"
TURN_MIN_PORT="${TURN_MIN_PORT:-49152}"
TURN_MAX_PORT="${TURN_MAX_PORT:-49250}"
TURN_USER="${TURN_USER:-sts2}"
TURN_PASSWORD="${TURN_PASSWORD:-70c9f42cc1c4e319d7509f1b690bc472}"
TURN_REALM="${TURN_REALM:-sts2.136521.xyz}"

echo "[sts2-relay] 正在启动 coturn (STUN/TURN) 端口 $TURN_PORT, IP $EXTERNAL_IP, 端口范围 $TURN_MIN_PORT-$TURN_MAX_PORT ..."
turnserver \
  -n \
  --log-file=stdout \
  --listening-port="$TURN_PORT" \
  --external-ip="$EXTERNAL_IP" \
  --min-port="$TURN_MIN_PORT" \
  --max-port="$TURN_MAX_PORT" \
  --fingerprint \
  --lt-cred-mech \
  --user="$TURN_USER:$TURN_PASSWORD" \
  --realm="$TURN_REALM" &
TURN_PID=$!

echo "[sts2-relay] 正在启动 sts2-room 信令服务 (端口 $PORT) ..."
node dist/index.js &
NODE_PID=$!

# 退出信号处理函数
cleanup() {
  echo "[sts2-relay] 接收到退出信号，优雅终止服务..."
  kill -TERM "$TURN_PID" 2>/dev/null || true
  kill -TERM "$NODE_PID" 2>/dev/null || true
  wait "$TURN_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

# 等待任一进程退出并处理
wait -n "$TURN_PID" "$NODE_PID"
EXIT_CODE=$?
cleanup
exit $EXIT_CODE
