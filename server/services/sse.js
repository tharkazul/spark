const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const url = require("url");

const sseClients = new Map();
const wsClients = new Map();

function sendSSEEvent(userId, eventName, data) {
  const targetIds = [userId, String(userId), Number(userId)].filter(
    (v, i, a) => v !== undefined && v !== null && !isNaN(v) && a.indexOf(v) === i
  );

  for (const uid of targetIds) {
    // Deliver to Server-Sent Events (SSE) clients
    const sseSet = sseClients.get(uid);
    if (sseSet) {
      for (const res of sseSet) {
        try {
          res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
          console.error(`[SSE] Error sending event to user ${uid}:`, err.message);
        }
      }
    }

    // Deliver to WebSocket clients
    const wsSet = wsClients.get(uid);
    if (wsSet) {
      const payload = JSON.stringify({
        type: eventName,
        event: eventName,
        data,
        payload: data,
        timestamp: new Date().toISOString()
      });
      for (const ws of wsSet) {
        if (ws.readyState === 1 /* WebSocket.OPEN */) {
          try {
            ws.send(payload);
          } catch (err) {
            console.error(`[WS] Error sending event to user ${uid}:`, err.message);
          }
        }
      }
    }
  }
}

function initWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, req) => {
    let authenticatedUserId = null;

    // Try extracting token from URL query params (e.g. ws://host:port?token=xxx)
    try {
      const parsedUrl = url.parse(req.url, true);
      const queryToken = parsedUrl.query?.token;
      if (queryToken && queryToken !== "null") {
        jwt.verify(queryToken, process.env.JWT_SECRET, (err, decoded) => {
          if (!err && decoded?.id) {
            registerUserSocket(decoded.id, ws);
            authenticatedUserId = decoded.id;
          }
        });
      }
    } catch (e) {
      // Ignore query parse error
    }

    // Ping / Pong heartbeat for keepalive
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (rawMessage) => {
      ws.isAlive = true;
      try {
        const message = JSON.parse(rawMessage.toString());
        if (message.type === "auth" && message.token && message.token !== "null") {
          jwt.verify(message.token, process.env.JWT_SECRET, { ignoreExpiration: true }, (err, decoded) => {
            if (!err && decoded?.id) {
              if (authenticatedUserId && authenticatedUserId !== decoded.id) {
                unregisterUserSocket(authenticatedUserId, ws);
              }
              authenticatedUserId = decoded.id;
              registerUserSocket(decoded.id, ws);
              try {
                ws.send(JSON.stringify({ type: "authenticated", success: true, userId: decoded.id }));
              } catch (_) {}
            } else {
              try {
                ws.send(JSON.stringify({ type: "error", message: "Invalid or expired token" }));
              } catch (_) {}
            }
          });
        } else if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        }
      } catch (err) {
        // Not a JSON message or malformed
      }
    });

    ws.on("close", () => {
      if (authenticatedUserId) {
        unregisterUserSocket(authenticatedUserId, ws);
      }
    });

    ws.on("error", (err) => {
      console.log("[WS] Socket error:", err.message);
      if (authenticatedUserId) {
        unregisterUserSocket(authenticatedUserId, ws);
      }
    });
  });

  function registerUserSocket(userId, ws) {
    if (!wsClients.has(userId)) {
      wsClients.set(userId, new Set());
    }
    wsClients.get(userId).add(ws);
  }

  function unregisterUserSocket(userId, ws) {
    const set = wsClients.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        wsClients.delete(userId);
      }
    }
  }

  // Heartbeat interval to prune dead sockets every 30s
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  return wss;
}

module.exports = {
  sseClients,
  wsClients,
  sendSSEEvent,
  initWebSocketServer
};
