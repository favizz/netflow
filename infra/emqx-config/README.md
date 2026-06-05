# EMQX TLS for ESP32 MQTT

The ESP32 firmware connects to `ta252601002.srusun.id:8883` with
`WiFiClientSecure` and trusts the Let's Encrypt ISRG Root X1 CA embedded in
`device/lib/SRusun_Wireless_Handler/sRusun_wireless_handler.cpp`.

For that to work, EMQX must serve the Let's Encrypt certificate for
`ta252601002.srusun.id` on listener `8883`.

Mount the host certificates into the EMQX container at:

```text
/opt/emqx/etc/certs/fullchain.pem
/opt/emqx/etc/certs/privkey.pem
```

Typical host sources:

```text
/etc/letsencrypt/live/ta252601002.srusun.id/fullchain.pem
/etc/letsencrypt/live/ta252601002.srusun.id/privkey.pem
```

After changing the mount, restart EMQX and verify that port `8883` presents a
certificate whose subject/SAN matches `ta252601002.srusun.id`, not the default
EMQ test certificate (`CN=Server, O=EMQ`).
