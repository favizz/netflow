# Web Security Best Practices Checklist

## Authentication

- Avoid **Basic Authentication**; use standard methods such as **JWT**
- Do not reinvent authentication mechanisms
- Use **max retry limits** and fail-safe mechanisms for login
- Use **encryption** for all sensitive data

---

## JSON Web Tokens (JWT)

- Use a strong **JWT secret** to prevent brute-force attacks
- Do not trust the algorithm from the token header; enforce validation on the backend
- Keep token expiration (**TTL / PTTL**) as short as possible
- Avoid storing sensitive data inside the JWT payload
- Keep the payload small to reduce token size

---

## OAuth

- Always validate `redirect_uri` on the **server side**
- Avoid using `response_type=token`; prefer **authorization code flow**
- Use the `state` parameter to prevent **CSRF attacks**
- Define proper **scopes** and validate them for each application

---

## Access Control

- Limit requests (**throttling**) to prevent **DDoS or brute force attacks**
- Use **HTTPS** and secure ciphers
- Enable **HSTS headers** to prevent SSL strip attacks
- Disable **directory listings**
- Restrict private APIs to **safe-listed IP addresses**

---

## Input Security

- Limit incoming requests (**throttling**) to prevent DDoS / brute force
- Use **HTTPS** and secure ciphers
- Enable **HSTS headers**
- Disable **directory listings**
- Restrict private APIs to **safe-listed IP addresses**

---

## Processing Security

- Ensure all endpoints require proper **authentication**
- Avoid exposing **personal IDs in resource URLs** (e.g., `/users/242/orders`)
- Prefer **UUIDs** instead of auto-increment IDs
- Disable entity parsing in **XML** to avoid **XXE attacks**
- Disable entity expansion when using **XML / YAML / similar formats**
- Use a **CDN for file uploads**
- Avoid blocking HTTP requests when handling large datasets
- Ensure **debug mode is disabled in production**
- Use **non-executable stacks** where possible

---

## Output Security

- Send `X-Content-Type-Options: nosniff`
- Send `X-Frame-Options: deny`
- Send `Content-Security-Policy: default-src 'none'`
- Remove fingerprinting headers (e.g., `X-Powered-By`)
- Enforce proper `Content-Type` headers
- Avoid returning sensitive data (credentials, tokens, etc.)
- Return appropriate **HTTP response codes**

---

## Monitoring

- Use **centralized logging** across all services
- Monitor requests, responses, and errors
- Configure alerts (SMS, Slack, Email, Kibana, CloudWatch, etc.)
- Ensure logs do **not contain sensitive data**
- Use **IDS/IPS systems** to monitor infrastructure

---

## CI / CD Security

- Audit your design and implementation with **unit and integration tests**
- Use **code reviews** and approval workflows
- Continuously run **security analysis tools**
- Check dependencies for **known vulnerabilities**
- Design **rollback strategies** for deployments