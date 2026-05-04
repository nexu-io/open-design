# Ozon API tunnels 4201-4206

This note documents infrastructure checks for Ozon Seller API cabinet routes that use local route ports `4201` through `4206`.

## Scope

Current diagnosed issue:

- Cabinet code: `OZON_CABINET_2`
- Cabinet name: `2_KAIDAPRO`
- Seller code: `KAIDAPRO`
- Resolved API port: `4202`
- Last route port: `4202`
- Current status: `ERROR`
- Last error:
  - `/v2/warehouse/list`: Ozon API timeout
  - `/v2/delivery-method/list`: Ozon API timeout

Confirmed API-check chain:

```text
Browser
-> window.checkOzonFbsApiConnection(event)
-> POST /assembly/fbo/ozon/fbs/connections/check
   {"cabinetCode":"OZON_CABINET_2","apiPort":"4202"}
-> preprod proxy 127.0.0.1:8893
-> /fbo-read/assembly/fbo/ozon/fbs/connections/check
-> backend http://192.168.14.66
-> handleCheckOzonFbsConnection()
-> resolveOzonSellerApiPortForClient()
-> ozonApiPost(..., port=4202)
-> HTTPS request to api-seller.ozon.ru:4202
-> tunnel/proxy/MikroTik route should translate or route to Ozon 443
```

The current failure is not expected to be in the Ozon FBS UI, SQL, preprod proxy, backend business logic, credentials, or cabinet keys. Treat the likely failure zone as route `4202`: tunnel down, remote endpoint unreachable, NAT/translation broken, or route timeout.

Do not change frontend or backend code until route `4202` is stable.

## Conceptual mapping

Each Ozon cabinet is assigned an internal route port. Backend requests intentionally connect to `api-seller.ozon.ru:<routePort>` instead of always using `443`.

The infrastructure behind those route ports must make the final Ozon request equivalent to normal HTTPS traffic to `api-seller.ozon.ru:443`. In practice, the tunnel, proxy, or MikroTik rules must:

- accept backend traffic to `api-seller.ozon.ru:4201` through `api-seller.ozon.ru:4206`;
- route each cabinet port over the expected tunnel or route table;
- translate the remote destination port to `443` before traffic reaches Ozon;
- preserve a valid TLS path so the backend can complete HTTPS with SNI `api-seller.ozon.ru`;
- return an Ozon HTTP response, even if that response is an authentication or method error.

A timeout is an infrastructure signal. A clear Ozon `401`, `403`, or structured API error means the route is alive and the investigation can move back to application or credential state.

## Route health checklist

Run this checklist for every route port: `4201`, `4202`, `4203`, `4204`, `4205`, `4206`.

| Check | Expected result |
| --- | --- |
| Backend host can open TCP to `api-seller.ozon.ru:<port>` | `TcpTestSucceeded: True` or equivalent |
| TLS handshake to `api-seller.ozon.ru:<port>` works | Certificate/SNI handshake completes |
| Tunnel or WireGuard interface is up | Interface and peer show active state or recent handshake |
| MikroTik route/mangle/NAT rule for the port exists | Rule matches the correct port and route table |
| Remote endpoint translates traffic to Ozon `443` | Ozon responds over HTTPS, no timeout |
| Ozon returns an HTTP response | Any HTTP response is better than connect timeout |
| Backend route health is available | `/fbo-read/health` responds |
| Cabinet connection check reaches Ozon | Returns `OK` or clear auth/API error, not timeout |

Cabinet 2 priority:

- Port: `4202`
- Recommended stable solution: stabilize Ozon cabinet port `4202` tunnel using MikroTik route/tunnel.
- Success condition: cabinet connection check returns `OK` or a clear Ozon authentication/API error instead of timeout.

## Windows and PowerShell diagnostics

Run these commands on server `192.168.14.66` or from the same network context as the backend.

### Direct connectivity

```powershell
Test-NetConnection api-seller.ozon.ru -Port 4202
Test-NetConnection api-seller.ozon.ru -Port 443

curl.exe -vk https://api-seller.ozon.ru:4202/
curl.exe -vk https://api-seller.ozon.ru:443/

netstat -ano | findstr ":4202"
```

Expected interpretation:

- `4202` timeout and `443` success: route/tunnel/proxy issue for cabinet 2.
- `4202` TLS success and Ozon HTTP response: route is alive.
- `443` failure too: broader server egress, DNS, firewall, or host network issue.

### Backend and preprod proxy

```powershell
curl.exe -s http://127.0.0.1:8893/fbo-read/health
curl.exe -s http://127.0.0.1:8893/fbo-read/assembly/fbo/ozon/fbs/connections
curl.exe -s -X POST http://127.0.0.1:8893/fbo-read/assembly/fbo/ozon/fbs/connections/check -H "Content-Type: application/json" -d "{\"cabinetCode\":\"OZON_CABINET_2\",\"apiPort\":\"4202\"}"
```

### Loop over all cabinet ports

```powershell
foreach ($port in 4201..4206) {
  Test-NetConnection api-seller.ozon.ru -Port $port
}

foreach ($port in 4201..4206) {
  Write-Host "=== api-seller.ozon.ru:$port ==="
  curl.exe -vk "https://api-seller.ozon.ru:$port/" 2>&1 | Select-Object -First 60
}

foreach ($port in 4201..4206) {
  Write-Host "=== netstat :$port ==="
  netstat -ano | findstr ":$port"
}
```

Optional safe script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/diagnostics/check-ozon-api-ports.ps1 -PlanOnly
powershell -ExecutionPolicy Bypass -File scripts/diagnostics/check-ozon-api-ports.ps1
powershell -ExecutionPolicy Bypass -File scripts/diagnostics/check-ozon-api-ports.ps1 -Ports 4202
```

## MikroTik diagnostics

Run on the MikroTik/router that owns the cabinet route/tunnel rules.

### Cabinet 2 route

```routeros
/ip firewall mangle print detail where dst-port=4202
/ip route print detail where routing-table~"4202"
/interface wireguard print detail
/interface wireguard peers print detail
/tool ping 192.168.28.1
/tool traceroute api-seller.ozon.ru port=4202 protocol=tcp
```

### Repeat for all cabinet ports

If RouterOS scripting is available:

```routeros
:foreach port in={4201;4202;4203;4204;4205;4206} do={
  :put ("=== dst-port=" . $port . " ===")
  /ip firewall mangle print detail where dst-port=$port
  /ip route print detail where routing-table~[:tostr $port]
}
```

If the router does not support the loop in the active shell, run the checks explicitly:

```routeros
/ip firewall mangle print detail where dst-port=4201
/ip firewall mangle print detail where dst-port=4202
/ip firewall mangle print detail where dst-port=4203
/ip firewall mangle print detail where dst-port=4204
/ip firewall mangle print detail where dst-port=4205
/ip firewall mangle print detail where dst-port=4206

/ip route print detail where routing-table~"4201"
/ip route print detail where routing-table~"4202"
/ip route print detail where routing-table~"4203"
/ip route print detail where routing-table~"4204"
/ip route print detail where routing-table~"4205"
/ip route print detail where routing-table~"4206"
```

Additional tunnel checks:

```routeros
/interface wireguard print detail
/interface wireguard peers print detail
/tool ping 192.168.28.1
```

## Decision guide

For cabinet 2, use this sequence:

1. Verify `api-seller.ozon.ru:443` from `192.168.14.66`.
2. Verify `api-seller.ozon.ru:4202` from `192.168.14.66`.
3. If `443` works and `4202` times out, inspect MikroTik route/mangle/NAT and WireGuard state for `4202`.
4. Confirm the remote endpoint translates route `4202` to Ozon `443`.
5. Re-run the backend cabinet check through `127.0.0.1:8893`.
6. Only after the route returns an Ozon response should application-level auth or cabinet configuration be revisited.

## Non-goals

Do not change these while diagnosing route timeout:

- Ozon FBS UI files;
- `ozon_tab.js`;
- `ozon_tab.css`;
- backend business logic;
- SQL;
- Ozon credentials;
- cabinet keys.
